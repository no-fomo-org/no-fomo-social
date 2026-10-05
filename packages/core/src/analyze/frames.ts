export const SCENE_THRESHOLD = 0.3;
export const DUP_THRESHOLD = 6;
export const MAX_TOTAL_IMAGES = 40;
export const MAX_FRAMES_PER_CAROUSEL_VIDEO = 10;
const MAX_UNIFORM_FPS = 2;
const MIN_GAP_SEC = 0.25;
const END_MARGIN_SEC = 0.05;

export function frameCap(durationSec: number): number {
  if (durationSec <= 30) return 30;
  if (durationSec <= 60) return 40;
  if (durationSec <= 180) return 60;
  return 80;
}

/** Keeps n items at even positions, always including the first and the last. */
export function spreadEvenly<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  if (n <= 0) return [];
  if (n === 1) return [items[0]!];
  return Array.from({ length: n }, (_, i) => items[Math.round((i * (items.length - 1)) / (n - 1))]!);
}

/**
 * Times worth looking at: the first frame, every scene change, and even samples when scenes are few.
 * Capped at 3x the frame cap, because near-duplicates are dropped next.
 */
export function candidateTimes(durationSec: number, sceneTimes: number[], cap: number): number[] {
  const end = durationSec - END_MARGIN_SEC;
  const scenes = sceneTimes.filter((t) => t > 0 && t < end).sort((a, b) => a - b);
  const kept: number[] = [0];
  const farFromKept = (t: number) => kept.every((k) => Math.abs(k - t) >= MIN_GAP_SEC);
  // Scene changes win over even samples that land close to them.
  for (const t of scenes) if (farFromKept(t)) kept.push(t);
  if (scenes.length < cap / 3) {
    const n = Math.min(cap, Math.floor(durationSec * MAX_UNIFORM_FPS));
    for (let i = 1; i < n; i++) {
      const t = Math.round(((i * durationSec) / n) * 100) / 100;
      if (t < end && farFromKept(t)) kept.push(t);
    }
  }
  return spreadEvenly(kept.sort((a, b) => a - b), cap * 3);
}

/** Indices of frames that differ enough from the last kept frame (mean absolute channel difference). */
export function dropNearDuplicates(thumbs: Uint8Array[], threshold = DUP_THRESHOLD): number[] {
  const kept: number[] = [];
  for (let i = 0; i < thumbs.length; i++) {
    const last = kept.length ? thumbs[kept.at(-1)!]! : null;
    if (!last || meanDiff(last, thumbs[i]!) >= threshold) kept.push(i);
  }
  return kept;
}

function meanDiff(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return Infinity;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs(a[i]! - b[i]!);
  return sum / n;
}

/** Frames per video item in a carousel, so photos plus frames stay within MAX_TOTAL_IMAGES. */
export function carouselVideoCap(imageCount: number, videoCount: number): number {
  if (videoCount === 0) return 0;
  const left = Math.max(videoCount, MAX_TOTAL_IMAGES - imageCount);
  return Math.min(MAX_FRAMES_PER_CAROUSEL_VIDEO, Math.max(1, Math.floor(left / videoCount)));
}
