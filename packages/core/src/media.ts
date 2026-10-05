import type { PostMedia } from "./api";

/** Links that expire within 10 minutes are renewed before use. */
const REFRESH_MARGIN_SEC = 10 * 60;

export function needsRefresh(m: PostMedia, nowSec: number): boolean {
  return m.parts.length === 0 || (m.expiresAt !== null && m.expiresAt - nowSec < REFRESH_MARGIN_SEC);
}
