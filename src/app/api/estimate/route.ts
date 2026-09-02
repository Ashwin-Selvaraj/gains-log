import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/prisma';
import { macrosFor, matchFood, sumMacros, type Macros } from '@/lib/nutrition';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5';

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
            type: ['number', 'null'],
            description: 'Number of pieces, for countable foods. Null if served by volume.',
          },
          grams: {
            type: ['number', 'null'],
            description: 'Estimated grams, for foods served by volume. Null if counted.',
          },
        },
        required: ['name', 'count', 'grams'],
        additionalProperties: false,
      },
    },
    unclear: { type: 'boolean', description: 'True if the photo is too unclear to be confident.' },
    caveat: { type: 'string', description: 'One sentence on the main uncertainty.' },
  },
  required: ['mealName', 'items', 'unclear', 'caveat'],
  additionalProperties: false,
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
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY is not set — add it to .env and restart.' },
      { status: 501 },
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

  const client = new Anthropic();

  try {
    // The food table is fetched alongside the vision call rather than after it —
    // they don't depend on each other, and this is a slow path already.
    const [response, foods] = await Promise.all([
      client.messages.create({
        model: MODEL,
        max_tokens: 2000,
        system: SYSTEM,
        // Identifying a plate is a perceptual call, not a reasoning problem;
        // low effort keeps it fast enough to use standing in a canteen queue.
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
              { type: 'text', text: 'What food is on this plate, and how much of each?' },
            ],
          },
        ],
      }),
      prisma.food.findMany(),
    ]);

    if (response.stop_reason === 'refusal') {
      return NextResponse.json(
        { error: 'Claude declined to analyse this image. Log the meal manually instead.' },
        { status: 422 },
      );
    }

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    let vision: VisionResult;
    try {
      vision = JSON.parse(text) as VisionResult;
    } catch {
      return NextResponse.json(
        { error: 'Could not read an estimate from the response. Try again.' },
        { status: 502 },
      );
    }

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
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: 'Rate limited by the Anthropic API — wait a moment and retry.' },
        { status: 429 },
      );
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY is invalid.' }, { status: 401 });
    }
    if (err instanceof Anthropic.APIConnectionError) {
      return NextResponse.json(
        { error: 'Could not reach the Anthropic API. Check your connection.' },
        { status: 503 },
      );
    }
    console.error('[estimate]', err);
    return NextResponse.json({ error: 'Estimate failed.' }, { status: 500 });
  }
}
