'use client';

/**
 * Draws a day's meals into one shareable image.
 *
 * Canvas rather than a server-rendered image: the photographs are already in
 * the browser by the time you press share, R2 serves them with
 * `Access-Control-Allow-Origin: *` so the canvas never becomes tainted, and
 * nothing has to be uploaded, rendered and downloaded again to produce a
 * picture the phone could have made itself.
 *
 * 1080×1350 is Instagram's 4:5 portrait — the largest a feed post is allowed
 * to be, so a square crop loses nothing and a story still fits it.
 */

/** Slot order is the order of the day, not the order things were logged. */
export const SLOT_ORDER = ['breakfast', 'lunch', 'snack', 'dinner'] as const;

const SLOT_LABEL: Record<string, string> = {
  breakfast: 'BREAKFAST',
  lunch: 'LUNCH',
  snack: 'SNACK',
  dinner: 'DINNER',
};

export type CollageMeal = {
  name: string;
  slot: string;
  calories: number | null;
  photoUrl: string | null;
};

const W = 1080;
const H = 1350;
const PAD = 56;
const INK = '#f4f4f5';
const MUTED = '#8b8b93';
const BG = '#0c0c0e';
const ACCENT = '#f97362';

/**
 * One photo per slot, in the order of the day.
 *
 * A day can hold six snacks; a collage cannot, and a grid of six thumbnails
 * says less than four clear ones. Taking the first photographed meal of each
 * slot matches how the day is actually remembered — what you had for breakfast,
 * then lunch — rather than what happened to be logged first.
 */
export function pickCollageMeals(meals: CollageMeal[]): CollageMeal[] {
  return SLOT_ORDER.map((slot) =>
    meals.find((m) => m.slot === slot && m.photoUrl),
  ).filter((m): m is CollageMeal => Boolean(m));
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Required for the export below to work: without it the canvas is tainted
    // by the first cross-origin draw and toBlob() throws a SecurityError.
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${url}`));
    img.src = url;
  });
}

/** Fills a rect with the image, cropped to cover rather than squashed. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.save();
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 20);
    ctx.clip();
  }
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
  ctx.restore();
}

/**
 * Cells for n photos, chosen so nothing is ever left stretched or orphaned.
 *
 * Three is the case worth spelling out: a 2×2 grid with one hole reads as a
 * mistake, so three becomes one wide photo above two square ones.
 */
function layout(n: number, x: number, y: number, w: number, h: number) {
  const g = 16;
  if (n === 1) return [{ x, y, w, h }];
  if (n === 2) {
    const ch = (h - g) / 2;
    return [
      { x, y, w, h: ch },
      { x, y: y + ch + g, w, h: ch },
    ];
  }
  const ch = (h - g) / 2;
  const cw = (w - g) / 2;
  if (n === 3) {
    return [
      { x, y, w, h: ch },
      { x, y: y + ch + g, w: cw, h: ch },
      { x: x + cw + g, y: y + ch + g, w: cw, h: ch },
    ];
  }
  return [
    { x, y, w: cw, h: ch },
    { x: x + cw + g, y, w: cw, h: ch },
    { x, y: y + ch + g, w: cw, h: ch },
    { x: x + cw + g, y: y + ch + g, w: cw, h: ch },
  ];
}

export type CollageInput = {
  /** "Sunday 21 September" — already formatted by the caller's locale rules. */
  dateLabel: string;
  meals: CollageMeal[];
  kcal: number;
  protein: number;
};

/**
 * Returns a PNG of the day, or throws if none of the photographs will load.
 *
 * Individual failures are tolerated — one dead R2 object should cost you that
 * tile, not the whole collage — but if nothing loads there is no picture worth
 * sharing and the caller needs to say so rather than hand over an empty frame.
 */
export async function renderCollage(input: CollageInput): Promise<Blob> {
  const picked = pickCollageMeals(input.meals);
  if (picked.length === 0) throw new Error('No photographed meals to share.');

  const loaded = (
    await Promise.all(
      picked.map(async (meal) => {
        try {
          return { meal, img: await loadImage(meal.photoUrl!) };
        } catch {
          return null;
        }
      }),
    )
  ).filter((x): x is { meal: CollageMeal; img: HTMLImageElement } => x !== null);

  if (loaded.length === 0) throw new Error('None of the photos could be loaded.');

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available on this device.');

  // Webfonts are not guaranteed ready just because the page rendered, and a
  // canvas silently falls back to a default face rather than waiting.
  await document.fonts?.ready;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // ── Header ──────────────────────────────────────────────────────────────
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = MUTED;
  ctx.font = '600 26px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.letterSpacing = '3px';
  ctx.fillText('GAINS LOG', PAD, PAD + 26);
  ctx.letterSpacing = '0px';

  ctx.fillStyle = INK;
  ctx.font = '700 52px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText(input.dateLabel, PAD, PAD + 96);

  // ── Photo grid ──────────────────────────────────────────────────────────
  const gridTop = PAD + 140;
  const gridH = H - gridTop - 210;
  const cells = layout(loaded.length, PAD, gridTop, W - PAD * 2, gridH);

  loaded.forEach(({ meal, img }, i) => {
    const cell = cells[i];
    drawCover(ctx, img, cell.x, cell.y, cell.w, cell.h);

    /**
     * A scrim so both labels stay readable over a bright photo.
     *
     * Taller and deeper than it first looks necessary, because the slot label
     * is the accent colour and sits in the upper half of this band — over a
     * plate of sambar or curry that is orange text on orange food, which was
     * legible but weak when the ramp only started 110px up. It starts higher
     * and reaches full strength sooner so the top line lands on darkness too.
     */
    const grad = ctx.createLinearGradient(0, cell.y + cell.h - 165, 0, cell.y + cell.h);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.45, 'rgba(0,0,0,0.6)');
    grad.addColorStop(1, 'rgba(0,0,0,0.9)');
    ctx.save();
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(cell.x, cell.y, cell.w, cell.h, 20);
      ctx.clip();
    }
    ctx.fillStyle = grad;
    ctx.fillRect(cell.x, cell.y + cell.h - 165, cell.w, 165);
    ctx.restore();

    ctx.fillStyle = ACCENT;
    ctx.font = '700 20px ui-sans-serif, system-ui, sans-serif';
    ctx.letterSpacing = '2px';
    ctx.fillText(SLOT_LABEL[meal.slot] ?? meal.slot.toUpperCase(), cell.x + 22, cell.y + cell.h - 52);
    ctx.letterSpacing = '0px';

    ctx.fillStyle = INK;
    ctx.font = '600 26px ui-sans-serif, system-ui, sans-serif';
    const name = meal.calories ? `${meal.name} · ${meal.calories} kcal` : meal.name;
    ctx.fillText(truncate(ctx, name, cell.w - 44), cell.x + 22, cell.y + cell.h - 20);
  });

  // ── Totals ──────────────────────────────────────────────────────────────
  const footY = H - 130;
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(PAD, footY - 34, W - PAD * 2, 1);

  ctx.fillStyle = INK;
  ctx.font = '700 62px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(String(input.kcal), PAD, footY + 34);
  const kcalW = ctx.measureText(String(input.kcal)).width;

  ctx.fillStyle = MUTED;
  ctx.font = '500 28px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText('kcal', PAD + kcalW + 12, footY + 34);

  const proteinText = `${input.protein} g protein`;
  ctx.fillStyle = ACCENT;
  ctx.font = '700 34px ui-sans-serif, system-ui, sans-serif';
  const pw = ctx.measureText(proteinText).width;
  ctx.fillText(proteinText, W - PAD - pw, footY + 30);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image.'))),
      'image/png',
    );
  });
}

/** Trims with an ellipsis so a long meal name cannot run past its tile. */
function truncate(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}
