/**
 * Client-side image decoding and downscaling.
 *
 * Both photo features used `createImageBitmap(file)` directly, which throws
 * "The source image could not be decoded" for any format the bitmap decoder
 * doesn't handle. On an iPhone that is the common case, not the rare one:
 * photos are HEIC, and while Safari renders HEIC perfectly well in an <img>,
 * createImageBitmap refuses it.
 *
 * So there are two paths, tried in order. The bitmap path is preferred — it
 * decodes off the main thread and doesn't block the UI on a large photo. The
 * <img> path uses the browser's full image pipeline, which is what actually
 * knows about HEIC, and also applies EXIF orientation for free.
 */

type Decoded = {
  source: CanvasImageSource;
  width: number;
  height: number;
  /** Frees the bitmap or object URL. Always call it. */
  release: () => void;
};

async function viaImageBitmap(file: File): Promise<Decoded | null> {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    // from-image, so a photo taken in portrait isn't drawn on its side. The
    // <img> path does this automatically; the bitmap path has to be told.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    if (!bitmap.width || !bitmap.height) {
      bitmap.close();
      return null;
    }
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close(),
    };
  } catch {
    return null;
  }
}

async function viaImgElement(file: File): Promise<Decoded | null> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;

  try {
    if (typeof img.decode === 'function') {
      await img.decode();
    } else {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('load failed'));
      });
    }
    // A decode that "succeeds" with no dimensions is a failure that didn't
    // throw — drawing it would produce a blank canvas rather than an error.
    if (!img.naturalWidth || !img.naturalHeight) {
      URL.revokeObjectURL(url);
      return null;
    }
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

export class ImageDecodeError extends Error {
  constructor(fileName: string) {
    super(
      `Couldn't read ${fileName || 'that image'}. If it came from an iPhone it may be ` +
        'HEIC — open Settings → Camera → Formats and choose "Most Compatible", or ' +
        'share the photo as JPEG and try again.',
    );
    this.name = 'ImageDecodeError';
  }
}

async function decode(file: File): Promise<Decoded> {
  const decoded = (await viaImageBitmap(file)) ?? (await viaImgElement(file));
  if (!decoded) throw new ImageDecodeError(file.name);
  return decoded;
}

/** Draws the image into a canvas no larger than `maxEdge` on its longest side. */
async function toCanvas(file: File, maxEdge: number) {
  const image = await decode(file);
  try {
    const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable.');
    ctx.drawImage(image.source, 0, 0, width, height);

    return { canvas, width, height };
  } finally {
    image.release();
  }
}

/** Downscaled JPEG blob, for upload. */
export async function downscaleToBlob(
  file: File,
  maxEdge: number,
  quality: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  const { canvas, width, height } = await toCanvas(file, maxEdge);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  );
  if (!blob) throw new Error('Could not encode the image.');
  return { blob, width, height };
}

/** Downscaled JPEG data URL, for sending inline to the vision API. */
export async function downscaleToDataUrl(
  file: File,
  maxEdge: number,
  quality: number,
): Promise<string> {
  const { canvas } = await toCanvas(file, maxEdge);
  return canvas.toDataURL('image/jpeg', quality);
}
