import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5';

const SUPPORTED_MEDIA = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
type MediaType = (typeof SUPPORTED_MEDIA)[number];

const SYSTEM = `You estimate the nutritional content of a meal from a photo of a plate.

You are producing a ROUGH ESTIMATE, not a measurement. Portion size, cooking oil,
and hidden ingredients are not visible in a photo, so real values can easily differ
by 30% or more. Never present your numbers as precise.

Rules:
- Identify the visible items and estimate the portion of each.
- Give ONE total calorie figure and ONE total protein figure in grams for the whole plate.
- If the photo is blurry, dark, taken from an angle that hides the food, or does not
  show food at all, set "unclear" to true, say so plainly in "caveat", and give your
  best guess anyway (or zeroes if there is genuinely no food in the frame).
- The user eats a South Asian diet as often as not — account for idli, dosa, roti,
  dal, curries, rice and paneer as readily as for Western foods.
- Keep "items" to short labels like "3 idlis" or "grilled chicken breast, ~150g".
- "caveat" is one short sentence the user will read before saving. Mention the single
  biggest source of uncertainty in this specific photo.`;

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: { type: 'string' },
      description: 'Short labels for each food item visible on the plate.',
    },
    name: {
      type: 'string',
      description: 'A short name for the whole meal, e.g. "Idli + sambar + eggs".',
    },
    calories: { type: 'integer', description: 'Rough total calories for the plate.' },
    protein: { type: 'integer', description: 'Rough total protein in grams.' },
    unclear: {
      type: 'boolean',
      description: 'True if the photo is too unclear for a confident estimate.',
    },
    caveat: { type: 'string', description: 'One sentence on the main uncertainty.' },
  },
  required: ['items', 'name', 'calories', 'protein', 'unclear', 'caveat'],
  additionalProperties: false,
} as const;

export type PhotoEstimate = {
  items: string[];
  name: string;
  calories: number;
  protein: number;
  unclear: boolean;
  caveat: string;
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
    return NextResponse.json(
      { error: `Unsupported image type: ${mediaType}` },
      { status: 415 },
    );
  }

  const client = new Anthropic();

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM,
      // A plate photo is a quick perceptual call, not a reasoning problem —
      // low effort keeps the round-trip short enough to use mid-meeting.
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
            {
              type: 'text',
              text: 'Estimate what is on this plate, plus total calories and protein.',
            },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      return NextResponse.json(
        { error: 'Claude declined to analyse this image. Try logging the meal manually.' },
        { status: 422 },
      );
    }

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    let parsed: PhotoEstimate;
    try {
      parsed = JSON.parse(text) as PhotoEstimate;
    } catch {
      return NextResponse.json(
        { error: 'Could not read an estimate from the response. Try again.' },
        { status: 502 },
      );
    }

    return NextResponse.json({
      items: Array.isArray(parsed.items) ? parsed.items : [],
      name: parsed.name || 'Meal from photo',
      calories: Math.max(0, Math.round(Number(parsed.calories) || 0)),
      protein: Math.max(0, Math.round(Number(parsed.protein) || 0)),
      unclear: Boolean(parsed.unclear),
      caveat: parsed.caveat || 'Rough estimate from a photo — adjust if it looks off.',
    } satisfies PhotoEstimate);
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
