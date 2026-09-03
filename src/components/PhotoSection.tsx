'use client';

import { useRef, useState } from 'react';
import { downscaleToBlob } from '@/lib/image';
import type { Photo } from '@/lib/types';

type Props = {
  date: string;
  photos: Photo[];
  onChange: (photos: Photo[]) => void;
  /** Nested inside a <Section>, which already draws the card and the heading. */
  bare?: boolean;
};

/** Progress shots are worth keeping sharp — this is the one you compare months later. */
const MAX_EDGE = 1440;
const QUALITY = 0.85;

/**
 * Downscale and re-encode before upload. A raw phone photo is 3–8 MB; at
 * 1440px it's a few hundred KB with no visible difference on a phone screen,
 * which keeps both the upload and the R2 free tier comfortable.
 *
 * Decoding lives in src/lib/image.ts, which falls back to an <img> element for
 * formats createImageBitmap refuses — HEIC, i.e. most iPhone photos.
 */
const prepare = (file: File) => downscaleToBlob(file, MAX_EDGE, QUALITY);

export function PhotoSection({ date, photos, onChange, bare = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Photo | null>(null);

  async function upload(files: FileList) {
    setBusy(true);
    setError(null);
    try {
      const uploaded: Photo[] = [];
      for (const file of Array.from(files)) {
        const { blob, width, height } = await prepare(file);
        const form = new FormData();
        form.append('file', new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
        form.append('date', date);
        form.append('kind', 'progress');
        form.append('width', String(width));
        form.append('height', String(height));

        const res = await fetch('/api/photos', { method: 'POST', body: form });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Upload failed');
        uploaded.push(json as Photo);
      }
      onChange([...uploaded, ...photos]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function remove(photo: Photo) {
    onChange(photos.filter((p) => p.id !== photo.id));
    setViewing(null);
    await fetch(`/api/photos/${photo.id}`, { method: 'DELETE' }).catch(() => {});
  }

  return (
    <section className={bare ? 'space-y-3' : 'card space-y-3'}>
      {!bare && (
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Photos</h2>
          {photos.length > 0 && (
            <p className="text-sm text-muted">
              {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
            </p>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(e) => {
          if (e.target.files?.length) void upload(e.target.files);
        }}
      />

      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setViewing(p)}
                className="block w-full overflow-hidden rounded-xl border border-line"
                aria-label={p.caption || 'View photo'}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt={p.caption || 'Progress photo'}
                  loading="lazy"
                  className="aspect-square w-full object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <button
        type="button"
        className="btn-quiet w-full"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? 'Uploading…' : '📸 Add photos'}
      </button>

      {viewing && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setViewing(null)}
        >
          <div className="flex justify-end">
            <button
              type="button"
              className="min-h-[44px] px-4 text-white"
              onClick={() => setViewing(null)}
            >
              Close
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={viewing.url}
            alt={viewing.caption || 'Progress photo'}
            className="max-h-[75vh] w-full flex-1 object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            className="btn-quiet mt-4 w-full"
            onClick={(e) => {
              e.stopPropagation();
              void remove(viewing);
            }}
          >
            🗑 Delete this photo
          </button>
        </div>
      )}
    </section>
  );
}
