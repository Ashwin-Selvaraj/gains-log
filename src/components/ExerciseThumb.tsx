'use client';

import { useState } from 'react';
import { MUSCLE_GROUPS } from '@/lib/exercises';

/**
 * The picture of an exercise, or an honest stand-in for one.
 *
 * Falls back to the muscle-group icon rather than a broken frame or a grey
 * box, because a picture is missing in two entirely normal cases: a lift the
 * upstream catalogue has no true match for, and anything added by hand. The
 * fallback also covers a URL that 404s at render time — R2 objects can be
 * deleted out from under a row, and one dead link shouldn't leave a hole in
 * the list.
 */
export function ExerciseThumb({
  src,
  muscleGroup,
  name,
  size = 40,
  className = '',
}: {
  src?: string | null;
  muscleGroup?: string;
  name: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const icon = MUSCLE_GROUPS.find((g) => g.key === muscleGroup)?.icon ?? '🏋️';
  const show = src && !failed;

  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-line/60 ${className}`}
      style={{ width: size, height: size }}
    >
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element -- R2 is already a
        // CDN with immutable cache headers; next/image would add a resizing hop
        // on the server for no benefit at this size.
        <img
          src={src}
          alt={name}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden style={{ fontSize: size * 0.45 }}>
          {icon}
        </span>
      )}
    </span>
  );
}
