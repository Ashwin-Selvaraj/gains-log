import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { macrosFor, matchFood, sumMacros, type Macros } from '@/lib/nutrition';
import { requireUser, unauthorized } from '@/lib/auth';
import { getQuota, recordAiUse } from '@/lib/ai-quota';
import {
  analyseImage,
  VISION_MODEL,
  VisionError,
  VisionRefusal,
  visionConfigured,
} from '@/lib/vision';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SUPPORTED_MEDIA = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
type MediaType = (typeof SUPPORTED_MEDIA)[number];

/**
 * The model is asked to *identify and portion*, not to do nutrition arithmetic.
 * Recognising "two dosas and a katori of sambar" from a photo is what vision is
 * genuinely good at; recalling how many grams of protein are in a dosa is not.
 * Those numbers come from the Food table, which makes the result reproducible
 * and correctable — fix a food once and every future estimate improves.
 */
const SYSTEM = `You identify the food on a plate from a photo, and estimate portion sizes.

You do NOT calculate calories or macros — those are looked up from a food
database afterwards. Your job is naming the items and judging how much of each.

Rules:
- Name each item as plainly and generically as possible: "dosa", "sambar",
  "boiled egg", "white rice", "chicken curry". Avoid brand names and flourishes.
- The user eats a South Indian diet as often as not. Expect idli, dosa, vada,
  sambar, rasam, upma, pongal, curd rice, chapati, dal, paneer, biryani.
- For each item give EITHER "count" (how many pieces, for countable things like
  idli, dosa, egg, chapati) OR "grams" (for things served by volume like rice,
  sambar, curry). Use count when the item is naturally countable.
- Judge portions against normal Indian household servings: one katori of
  sambar is about 150 g, one katori of cooked rice about 150 g.
- If the photo is blurry, dark, or shows no food, set "unclear" to true, explain
  briefly in "caveat", and return your best guess anyway (or an empty items list
  if there is genuinely no food).
- "caveat" is one short sentence naming the single biggest uncertainty in THIS
  photo — an obscured dish, an unclear portion, a dish you are unsure of.`;

/**
 * Gemini's OpenAPI subset, not JSON Schema: a field that may be absent is
 * `nullable: true` rather than a union with "null", and `additionalProperties`
 * is not understood — passing either straight through fails as a bare
 * INVALID_ARGUMENT with nothing naming the offending key.
 *
 * `propertyOrdering` is honoured by Gemini and worth setting: the model fills
 * the fields in the order given, so naming the item before estimating its size
 * means the portion is judged with the identification already made.
 */
const SCHEMA = {
  type: 'object',
  properties: {
    mealName: {
      type: 'string',
      description: 'Short name for the whole plate, e.g. "Idli + sambar + chutney".',
    },
    items: {
      type: 'array',
      description: 'Each distinct food visible on the plate.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Plain generic food name.' },
          count: {
            type: 'number',
            nullable: true,
            description: 'Number of pieces, for countable foods. Null if served by volume.',
          },
          grams: {
            type: 'number',
            nullable: true,
            description: 'Estimated grams, for foods served by volume. Null if counted.',
          },
        },
        required: ['name'],
        propertyOrdering: ['name', 'count', 'grams'],
      },
    },
    unclear: { type: 'boolean', description: 'True if the photo is too unclear to be confident.' },
    caveat: { type: 'string', description: 'One sentence on the main uncertainty.' },
  },
  required: ['mealName', 'items', 'unclear', 'caveat'],
  propertyOrdering: ['mealName', 'items', 'unclear', 'caveat'],
} as const;

type VisionResult = {
  mealName: string;
  items: { name: string; count: number | null; grams: number | null }[];
  unclear: boolean;
  caveat: string;
};

export type EstimatedItem = {
  name: string;
  /** The food it matched in the database, if any. */
  foodId: string | null;
  matchedName: string | null;
  grams: number;
  portionLabel: string;
  macros: Macros;
  /** False when nothing in the table matched — macros are then all zero. */
  recognised: boolean;
};

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  if (!visionConfigured()) {
    return NextResponse.json(
      { error: 'GOOGLE_AI_STUDIO_API_KEY is not set — add it to .env and restart.' },
      { status: 501 },
    );
  }

  /**
   * Checked before the image is even read. A vision call is the one thing here
   * that costs money per use, so the cheapest possible rejection is the right
   * one — and the message says when it resets, because "limit reached" without
   * a "come back when" is a dead end.
   */
  const quota = await getQuota(user);
  if (!quota.unlimited && quota.remaining !== null && quota.remaining <= 0) {
    return NextResponse.json(
      {
        error: `You've used all ${quota.limit} photo estimates for today. It resets at midnight — log this meal from your presets or the food list instead.`,
        quota,
      },
      { status: 429 },
    );
  }

  const body = (await req.json()) as { image?: string; mediaType?: string };
  const image = body.image;
  if (!image) return NextResponse.json({ error: 'image required' }, { status: 400 });

  // Accept either a bare base64 payload or a full data: URL from the file input.
  const match = /^data:([^;]+);base64,(.*)$/s.exec(image);
  const mediaType = (match?.[1] ?? body.mediaType ?? 'image/jpeg') as MediaType;
  const data = match?.[2] ?? image;

  if (!SUPPORTED_MEDIA.includes(mediaType)) {
    return NextResponse.json({ error: `Unsupported image type: ${mediaType}` }, { status: 415 });
  }

  let vision: VisionResult;
  let spent: Awaited<ReturnType<typeof recordAiUse>>;
  let foods: Awaited<ReturnType<typeof prisma.food.findMany>>;

  try {
    // The food table is fetched alongside the vision call rather than after it —
    // they don't depend on each other, and this is a slow path already.
    [vision, foods] = await Promise.all([
      analyseImage<VisionResult>({
        system: SYSTEM,
        prompt: 'What food is on this plate, and how much of each?',
        schema: SCHEMA,
        mediaType,
        data,
      }),
      prisma.food.findMany({ where: { OR: [{ userId: null }, { userId: user.id }] } }),
    ]);

    // Counted only once the model has actually answered. Anything that failed
    // earlier — an unsupported file, a bad key, a connection error — never
    // reaches this line and so never costs one of the day's five.
    spent = await recordAiUse(user);
  } catch (err) {
    if (err instanceof VisionRefusal) {
      return NextResponse.json(
        {
          error: `Gemini would not analyse this image (${err.reason}). Log the meal manually instead.`,
        },
        { status: 422 },
      );
    }

    if (err instanceof VisionError) {
      console.error('[estimate]', err.googleStatus ?? err.status, err.message);

      // Each of these needs a different fix, so each says which. Flattening
      // them into "Estimate failed" is what sent the last investigation after
      // the wrong cause entirely.
      if (err.googleStatus === 'UNAUTHENTICATED' || /API key/i.test(err.message)) {
        return NextResponse.json(
          { error: 'GOOGLE_AI_STUDIO_API_KEY is invalid or lacks access to the model.' },
          { status: 401 },
        );
      }
      if (err.googleStatus === 'RESOURCE_EXHAUSTED') {
        return NextResponse.json(
          { error: "Google AI Studio rate limit hit — wait a moment and retry." },
          { status: 429 },
        );
      }
      if (err.googleStatus === 'NOT_FOUND') {
        return NextResponse.json(
          {
            error: `The model "${VISION_MODEL}" is not available to this key. Set GOOGLE_AI_MODEL in .env to one it can reach.`,
          },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: `Google AI Studio error (${err.status}): ${err.message}` },
        { status: err.status >= 500 ? 502 : err.status },
      );
    }

    console.error('[estimate]', err);
    return NextResponse.json(
      { error: err instanceof Error ? `Estimate failed: ${err.message}` : 'Estimate failed.' },
      { status: 500 },
    );
  }

  {
    const items: EstimatedItem[] = (vision.items ?? []).map((raw) => {
      const food = matchFood(foods, raw.name);

      // Prefer the count against the matched food's real serving weight; fall
      // back to the model's gram estimate, then to one nominal serving.
      let grams: number;
      if (food && typeof raw.count === 'number' && raw.count > 0) {
        grams = raw.count * food.servingGrams;
      } else if (typeof raw.grams === 'number' && raw.grams > 0) {
        grams = raw.grams;
      } else if (food) {
        grams = food.servingGrams * Math.max(1, raw.count ?? 1);
      } else {
        grams = 100;
      }
      grams = Math.min(Math.round(grams), 5000);

      return {
        name: raw.name,
        foodId: food?.id ?? null,
        matchedName: food?.name ?? null,
        grams,
        portionLabel:
          food && typeof raw.count === 'number' && raw.count > 0
            ? `${raw.count} × ${food.servingLabel}`
            : `${grams} g`,
        macros: food ? macrosFor(food, grams) : { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
        recognised: Boolean(food),
      };
    });

    const unrecognised = items.filter((i) => !i.recognised).map((i) => i.name);

    return NextResponse.json({
      mealName: vision.mealName || 'Meal from photo',
      items,
      totals: sumMacros(items.map((i) => i.macros)),
      unclear: Boolean(vision.unclear),
      caveat: vision.caveat || 'Rough estimate from a photo — adjust anything that looks off.',
      // Surfaced so the UI can offer to add them to the food table, which is
      // how the database gets better at your actual diet over time.
      unrecognised,
      quota: spent,
    });
  }
}
