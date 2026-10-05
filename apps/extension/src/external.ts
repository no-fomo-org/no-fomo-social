import type { PostMedia, SyncMode } from "@no-fomo/core";
import { isAppOrigin } from "./origins";

export type ExtResponse = { ok: true; version?: string; media?: PostMedia } | { ok: false; error: string };
export type TabMessage =
  | { type: "sync:run"; serverUrl: string; mode: SyncMode }
  | { type: "media:fetch"; serverUrl: string; id: string };

export interface ExternalDeps {
  version: string;
  findInstagramTab(): Promise<number | null>;
  openInstagramTab(): Promise<number>;
  sendToTab(tabId: number, msg: TabMessage): Promise<unknown>;
}

export async function handleExternalMessage(msg: unknown, senderUrl: string | undefined, deps: ExternalDeps): Promise<ExtResponse> {
  if (typeof msg !== "object" || msg === null) return { ok: false, error: "bad_message" };
  const m = msg as { type?: unknown; mode?: unknown; id?: unknown };
  if (m.type === "ping") return { ok: true, version: deps.version };
  if (m.type !== "sync:start" && m.type !== "media:refresh") return { ok: false, error: "unknown_type" };
  if (!senderUrl) return { ok: false, error: "no_sender" };
  if (!isAppOrigin(senderUrl)) return { ok: false, error: "untrusted_sender" };
  const serverUrl = new URL(senderUrl).origin;

  let tabMsg: TabMessage;
  if (m.type === "sync:start") {
    if (m.mode !== undefined && m.mode !== "incremental" && m.mode !== "full") return { ok: false, error: "bad_message" };
    tabMsg = { type: "sync:run", serverUrl, mode: m.mode ?? "incremental" };
  } else {
    if (typeof m.id !== "string" || !/^\d{1,30}$/.test(m.id)) return { ok: false, error: "bad_message" };
    tabMsg = { type: "media:fetch", serverUrl, id: m.id };
  }
  const tabId = (await deps.findInstagramTab()) ?? (await deps.openInstagramTab());
  const reply = (await deps.sendToTab(tabId, tabMsg)) as ExtResponse | undefined;
  return reply ?? { ok: false, error: "instagram_tab_failed" };
}
