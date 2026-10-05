import type { PostMedia, ProfileLoadRequest, SyncMode, UserSuggestion } from "@no-fomo/core";
import { isAppOrigin } from "./origins";

export type ExtResponse =
  | { ok: true; version?: string; media?: PostMedia; users?: UserSuggestion[]; authorId?: string }
  | { ok: false; error: string };
export type TabMessage =
  | { type: "sync:run"; serverUrl: string; mode: SyncMode }
  | { type: "media:fetch"; serverUrl: string; id: string }
  | { type: "profile:search"; query: string }
  | { type: "profile:load"; serverUrl: string; request: ProfileLoadRequest }
  | { type: "following:update"; serverUrl: string };

export interface ExternalDeps {
  version: string;
  findInstagramTab(): Promise<number | null>;
  openInstagramTab(): Promise<number>;
  sendToTab(tabId: number, msg: TabMessage): Promise<unknown>;
}

const ID = /^\d{1,30}$/;
const USERNAME = /^[A-Za-z0-9._]{1,30}$/;
const TYPES = new Set(["sync:start", "media:refresh", "profile:search", "profile:load", "following:update"]);

/** Checks a message from the app page and turns it into a message for the Instagram tab. Null means malformed. */
function toTabMessage(m: Record<string, unknown>, serverUrl: string): TabMessage | null {
  switch (m.type) {
    case "sync:start":
      if (m.mode !== undefined && m.mode !== "incremental" && m.mode !== "full") return null;
      return { type: "sync:run", serverUrl, mode: (m.mode as SyncMode | undefined) ?? "incremental" };
    case "media:refresh":
      return typeof m.id === "string" && ID.test(m.id) ? { type: "media:fetch", serverUrl, id: m.id } : null;
    case "profile:search": {
      const query = typeof m.query === "string" ? m.query.trim() : "";
      return query.length >= 2 && query.length <= 60 ? { type: "profile:search", query } : null;
    }
    case "profile:load":
      if (m.mode === "add" && typeof m.username === "string" && USERNAME.test(m.username)) {
        return { type: "profile:load", serverUrl, request: { mode: "add", username: m.username } };
      }
      if ((m.mode === "older" || m.mode === "refresh") && typeof m.authorId === "string" && ID.test(m.authorId)) {
        return { type: "profile:load", serverUrl, request: { mode: m.mode, authorId: m.authorId } };
      }
      return null;
    case "following:update":
      return { type: "following:update", serverUrl };
    default:
      return null;
  }
}

export async function handleExternalMessage(msg: unknown, senderUrl: string | undefined, deps: ExternalDeps): Promise<ExtResponse> {
  if (typeof msg !== "object" || msg === null) return { ok: false, error: "bad_message" };
  const m = msg as Record<string, unknown>;
  if (m.type === "ping") return { ok: true, version: deps.version };
  if (typeof m.type !== "string" || !TYPES.has(m.type)) return { ok: false, error: "unknown_type" };
  if (!senderUrl) return { ok: false, error: "no_sender" };
  if (!isAppOrigin(senderUrl)) return { ok: false, error: "untrusted_sender" };

  const tabMsg = toTabMessage(m, new URL(senderUrl).origin);
  if (!tabMsg) return { ok: false, error: "bad_message" };
  const tabId = (await deps.findInstagramTab()) ?? (await deps.openInstagramTab());
  const reply = (await deps.sendToTab(tabId, tabMsg)) as ExtResponse | undefined;
  return reply ?? { ok: false, error: "instagram_tab_failed" };
}
