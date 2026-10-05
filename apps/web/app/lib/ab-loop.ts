export type AbLoop = { a: number | null; b: number | null };
export const AB_OFF: AbLoop = { a: null, b: null };
/** A loop shorter than this is a double press by mistake. */
const MIN_LOOP_SEC = 0.5;

/** One button: the 1st press sets A, the 2nd sets B, the 3rd clears. */
export function pressAb(s: AbLoop, t: number): AbLoop {
  if (s.a === null) return { a: t, b: null };
  if (s.b === null) {
    if (Math.abs(t - s.a) < MIN_LOOP_SEC) return AB_OFF;
    return t > s.a ? { a: s.a, b: t } : { a: t, b: s.a };
  }
  return AB_OFF;
}

/** Where to jump once playback reaches B, or null to keep playing. */
export function abJump(s: AbLoop, t: number): number | null {
  return s.a !== null && s.b !== null && t >= s.b ? s.a : null;
}

export function abLabel(s: AbLoop): string {
  if (s.a === null) return "Set loop start (A)";
  if (s.b === null) return "Set loop end (B)";
  return "Clear A to B loop";
}
