/**
 * Google AI Studio (Gemini) — the one model call this app makes.
 *
 * Spoken to over plain REST rather than through @google/genai. The whole
 * surface used here is one POST with an image and a schema; an SDK would add a
 * dependency, a version to keep current, and a second way for the build to
 * break, in exchange for wrapping a fetch this file already does in forty
 * lines. The Anthropic SDK it replaced was likewise the only reason that
 * package was installed.
 *
 * Scope is deliberately narrow: this module can identify food in a photo and
 * nothing else. The system instruction, the response schema and the image
 * requirement are all fixed here, so the key cannot be used through this app
 * for general-purpose prompting — there is no route that accepts arbitrary
 * text and passes it to the model.
 */

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Flash rather than Pro: identifying a plate is perception, not reasoning, and
 * this is used standing in a canteen queue where latency is the feature.
 *
 * 3.8 rather than 2.5 on measurement, not on the version number. Given the
 * same photo of two vada in sambar, 2.5-flash invented an idli that wasn't
 * there and put the sambar at 400 g; 3.8-flash named exactly what was on the
 * plate, said 250 g, and volunteered that something might be hidden under the
 * vada — in half the time (4.2 s against 8.3 s).
 *
 * Overridable because model names move faster than this app does — run
 * `GET /v1beta/models` with the key to see what the key can currently reach.
 */
export const VISION_MODEL = process.env.GOOGLE_AI_MODEL?.trim() || 'gemini-3.8-flash';

export const visionConfigured = () => Boolean(process.env.GOOGLE_AI_STUDIO_API_KEY?.trim());

/**
 * Distinguishes "the API said no" from "the network fell over".
 *
 * Fields are declared and assigned rather than written as constructor
 * parameter properties, which `node --experimental-strip-types` rejects — the
 * same runtime the seed and import scripts use.
 */
export class VisionError extends Error {
  readonly status: number;
  /** Google's own status string (INVALID_ARGUMENT, RESOURCE_EXHAUSTED…). */
  readonly googleStatus?: string;

  constructor(message: string, status: number, googleStatus?: string) {
    super(message);
    this.name = 'VisionError';
    this.status = status;
    this.googleStatus = googleStatus;
  }
}

/** Thrown when the model declined rather than failed — a different fix for the user. */
export class VisionRefusal extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`Blocked by the model: ${reason}`);
    this.name = 'VisionRefusal';
    this.reason = reason;
  }
}

type GeminiResponse = {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
};

/**
 * One image in, one JSON object out, shaped by `schema`.
 *
 * `schema` is Gemini's OpenAPI subset, not full JSON Schema: optional fields
 * are `nullable: true` rather than a union with "null", and
 * `additionalProperties` is not understood. Passing a JSON Schema straight
 * through fails with an unhelpful INVALID_ARGUMENT, which is why the schema
 * lives next to its caller rather than being shared with anything else.
 */
export async function analyseImage<T>({
  system,
  prompt,
  schema,
  mediaType,
  data,
  signal,
}: {
  system: string;
  prompt: string;
  schema: unknown;
  mediaType: string;
  /** Base64, without the data: prefix. */
  data: string;
  signal?: AbortSignal;
}): Promise<T> {
  const key = process.env.GOOGLE_AI_STUDIO_API_KEY?.trim();
  if (!key) throw new VisionError('GOOGLE_AI_STUDIO_API_KEY is not set.', 501);

  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}/${VISION_MODEL}:generateContent`, {
      method: 'POST',
      // In the header rather than the query string: a key in a URL ends up in
      // proxy logs and error reports, and this one is billable.
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [
          {
            role: 'user',
            parts: [{ inline_data: { mime_type: mediaType, data } }, { text: prompt }],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          // Near-deterministic: the same plate photographed twice should not
          // produce two different portion estimates.
          temperature: 0.1,
          maxOutputTokens: 2048,
        },
      }),
    });
  } catch (e) {
    throw new VisionError(
      `Could not reach Google AI Studio: ${e instanceof Error ? e.message : 'network error'}`,
      503,
    );
  }

  const json = (await res.json().catch(() => ({}))) as GeminiResponse;

  if (!res.ok) {
    throw new VisionError(
      json.error?.message ?? `Google AI Studio returned ${res.status}.`,
      res.status,
      json.error?.status,
    );
  }

  if (json.promptFeedback?.blockReason) {
    throw new VisionRefusal(json.promptFeedback.blockReason);
  }

  const candidate = json.candidates?.[0];
  const finish = candidate?.finishReason;
  if (finish && finish !== 'STOP') {
    // MAX_TOKENS gets its own line because the JSON will be truncated and the
    // parse error it causes would otherwise send you looking at the schema.
    throw new VisionRefusal(
      finish === 'MAX_TOKENS' ? 'the reply was cut short (MAX_TOKENS)' : finish,
    );
  }

  const text = (candidate?.content?.parts ?? [])
    .map((p) => p.text ?? '')
    .join('')
    .trim();

  if (!text) throw new VisionError('Google AI Studio returned an empty reply.', 502);

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new VisionError('Could not read JSON from the reply.', 502);
  }
}
