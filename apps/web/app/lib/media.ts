import type { PostMedia } from "@no-fomo/core";
import type { ExtResponse } from "./extension";

/** Links that expire within 10 minutes are renewed before playing. */
const REFRESH_MARGIN_SEC = 10 * 60;
/** Wait this long on a post before asking Instagram, so flipping fast through posts sends no requests. */
export const REFRESH_DELAY_MS = 400;

export function needsRefresh(m: PostMedia, nowSec: number): boolean {
  return m.parts.length === 0 || (m.expiresAt !== null && m.expiresAt - nowSec < REFRESH_MARGIN_SEC);
}

export type MediaErrorCode = "no_extension" | "old_extension" | "login_required" | "rate_limited" | "not_found" | "load_failed";

export function mediaErrorCode(reply: ExtResponse | null): MediaErrorCode {
  if (!reply) return "no_extension";
  if (reply.ok) return "load_failed";
  switch (reply.error) {
    case "unknown_type": return "old_extension";
    case "login_required":
    case "rate_limited":
    case "not_found":
      return reply.error;
    default:
      return "load_failed";
  }
}

export function mediaErrorText(code: MediaErrorCode): string {
  switch (code) {
    case "no_extension": return "Install the no-fomo extension to play posts.";
    case "old_extension": return "Your no-fomo extension is out of date. Reload it on the chrome://extensions page, then try again.";
    case "login_required": return "Log in to Instagram in this browser, then try again.";
    case "rate_limited": return "Instagram asked to slow down. Try again in a few minutes.";
    case "not_found": return "This post was deleted on Instagram.";
    case "load_failed": return "Could not load this post. Try again, or open it on Instagram.";
  }
}
