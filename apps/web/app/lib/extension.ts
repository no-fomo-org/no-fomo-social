import type { PostMedia, SyncMode } from "@no-fomo/core";

type ChromeRuntime = {
  sendMessage(extensionId: string, msg: unknown, cb: (reply: unknown) => void): void;
  lastError?: { message?: string };
};

export type ExtResponse = { ok: true; version?: string; media?: PostMedia } | { ok: false; error: string };

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
export const refreshExtensionMedia = (extId: string, postId: string) => send(extId, { type: "media:refresh", id: postId }, 45_000);

export function syncErrorText(code: string): string {
  switch (code) {
    case "already_running": return "A sync is already running.";
    case "timeout": return "The extension did not answer. Reload this page and try again.";
    case "instagram_tab_failed": return "Could not open Instagram. Open instagram.com in this browser and try again.";
    default: return `Sync could not start (${code}).`;
  }
}
