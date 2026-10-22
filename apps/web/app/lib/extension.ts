import type { GateStatus, LivePage, LiveProfile, PostMedia, SyncMode, UserSuggestion } from "@no-fomo-social/core";
import { limitText } from "./ig-limit";

type ChromeRuntime = {
  sendMessage(extensionId: string, msg: unknown, cb: (reply: unknown) => void): void;
  lastError?: { message?: string };
};

export type ExtResponse =
  | { ok: true; version?: string; media?: PostMedia; users?: UserSuggestion[]; profile?: LiveProfile; page?: LivePage | null; status?: GateStatus }
  | { ok: false; error: string; detail?: string; until?: number };

function runtime(): ChromeRuntime | null {
  const c = (globalThis as { chrome?: { runtime?: ChromeRuntime } }).chrome;
  return c?.runtime && typeof c.runtime.sendMessage === "function" ? c.runtime : null;
}

/** Null when the extension is missing; `{ ok: false, error: "timeout" }` when it is there but slow. */
function send(extensionId: string, msg: unknown, timeoutMs: number): Promise<ExtResponse | null> {
  const rt = runtime();
  if (!rt) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: "timeout" }), timeoutMs);
    try {
      rt.sendMessage(extensionId, msg, (reply) => {
        clearTimeout(timer);
        resolve(rt.lastError ? null : ((reply as ExtResponse | undefined) ?? null));
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

export const pingExtension = (id: string) => send(id, { type: "ping" }, 1500);
export const startExtensionSync = (id: string, mode: SyncMode = "incremental") => send(id, { type: "sync:start", mode }, 45_000);
/** Opening a hidden Instagram tab can take a while, hence the long timeout. */
/** `store`: the app also keeps the post (Analyze). Without it, a post the app does not keep just gets fresh links. */
export const refreshExtensionMedia = (extId: string, postId: string, store = false) =>
  send(extId, { type: "media:refresh", id: postId, store }, 45_000);

export const searchInstagram = (id: string, query: string) => send(id, { type: "profile:search", query }, 20_000);
/** Opens a hidden Instagram tab on the account, so it can take a while. */
export const openProfile = (id: string, username: string) => send(id, { type: "profile:open", username }, 45_000);
/** `cursor` comes from the previous page. */
export const profilePage = (id: string, cursor: string) => send(id, { type: "profile:page", cursor }, 45_000);
export const updateFollowing = (id: string) => send(id, { type: "following:update" }, 45_000);
/** What holds Instagram calls back. Answered from extension storage, so it is quick. */
export const igStatus = (id: string) => send(id, { type: "ig:status" }, 1500);

/** `detail`: what Instagram answered. `until`: when calls are allowed again. */
export function loadErrorText(code: string, detail?: string, until?: number): string {
  switch (code) {
    case "paused": return limitText("paused", until);
    case "budget": return limitText("budget", until);
    case "refused":
    case "http_error":
    case "bad_response":
    case "internal": return `Could not load from Instagram.${detail ? ` ${detail}` : ""}`;
    case "unknown_type":
      return "Your no-fomo extension is out of date. Open chrome://extensions, turn on Developer mode and press Update.";
    case "not_found":
    case "profile_not_found": return "No Instagram account has this name.";
    case "private":
    case "private_profile": return "This account is private and you do not follow it, so its posts cannot be loaded.";
    case "busy": return "An update is already running. Wait for it to finish.";
    case "login_required": return "Log in to Instagram in this browser, then try again.";
    case "rate_limited": return "Instagram asked to slow down. Try again in a few minutes.";
    case "timeout": return "The extension did not answer. Reload this page and try again.";
    case "instagram_tab_failed": return "Could not open Instagram. Open instagram.com in this browser and try again.";
    case "no_extension": return "The no-fomo extension is not installed.";
    default: return `Could not load from Instagram (${code}).`;
  }
}

export function syncErrorText(code: string): string {
  switch (code) {
    case "already_running": return "A sync is already running.";
    case "timeout": return "The extension did not answer. Reload this page and try again.";
    case "instagram_tab_failed": return "Could not open Instagram. Open instagram.com in this browser and try again.";
    default: return `Sync could not start (${code}).`;
  }
}
