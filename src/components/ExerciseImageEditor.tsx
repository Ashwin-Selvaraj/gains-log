'use client';

import { useRef, useState } from 'react';
import { ExerciseThumb } from '@/components/ExerciseThumb';
import { downscaleToBlob, ImageDecodeError } from '@/lib/image';

/** Big enough to read a movement from; small enough to send over mobile data. */
const MAX_EDGE = 900;
const QUALITY = 0.82;

/**
 * The picture for one exercise, and the controls to replace it.
 *
 * The catalogue photo is a stock gym shot, which is fine for recognising a
 * movement and useless for recognising *your* machine — the cable station in
 * one gym looks nothing like another's. So any exercise can be given your own
 * photo, stored against your account only, with the catalogue picture always
 * one tap away again.
 */
export function ExerciseImageEditor({
  exerciseKey,
  name,
  muscleGroup,
  imageUrl,
  ownImage,
}: {
  exerciseKey: string;
  name: string;
  muscleGroup: string;
  imageUrl: string;
  ownImage: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(imageUrl);
  const [own, setOwn] = useState(ownImage);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      // Downscaled in the browser, like every other photo in the app: a phone
      // original is 3–8 MB and none of that survives being shown at 900px.
      const { blob } = await downscaleToBlob(file, MAX_EDGE, QUALITY);
      const form = new FormData();
      form.append('file', new File([blob], 'exercise.jpg', { type: 'image/jpeg' }));

      const res = await fetch(`/api/exercises/${encodeURIComponent(exerciseKey)}/image`, {
        method: 'POST',
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not save that photo.');
      setUrl(json.url);
      setOwn(true);
    } catch (e) {
      setError(
        e instanceof ImageDecodeError
          ? "That image couldn't be read on this device."
          : e instanceof Error
            ? e.message
            : 'Could not save that photo.',
      );
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
      if (cameraRef.current) cameraRef.current.value = '';
    }
  }

  async function reset() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/exercises/${encodeURIComponent(exerciseKey)}/image`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not remove that photo.');
      setUrl(json.url ?? '');
      setOwn(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove that photo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mb-4">
      <div className="flex items-center gap-3">
        <ExerciseThumb
          src={url}
          muscleGroup={muscleGroup}
          name={name}
          size={88}
          className="rounded-xl"
        />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {own ? 'Your photo' : url ? 'Catalogue picture' : 'No picture yet'}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {own
              ? 'Only you can see this one.'
              : url
                ? 'Replace it with a photo of your own gym.'
                : 'Add one so this lift is recognisable at a glance.'}
          </p>

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-quiet px-3 py-1.5 text-xs"
              disabled={busy}
              onClick={() => cameraRef.current?.click()}
            >
              {busy ? '…' : 'Take photo'}
            </button>
            <button
              type="button"
              className="btn-quiet px-3 py-1.5 text-xs"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              Choose file
            </button>
            {own && (
              <button
                type="button"
                className="px-2 py-1.5 text-xs text-muted underline"
                disabled={busy}
                onClick={() => void reset()}
              >
                Use the default
              </button>
            )}
          </div>
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

      {/* Two inputs, because `capture` on a single one takes the gallery away
          on Android — the same split PhotoSection already makes. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
    </section>
  );
}
