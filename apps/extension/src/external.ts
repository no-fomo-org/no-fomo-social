export type ExtResponse = { ok: true; version?: string } | { ok: false; error: string };

export interface ExternalDeps {
  version: string;
  findInstagramTab(): Promise<number | null>;
  openInstagramTab(): Promise<number>;
  sendToTab(tabId: number, msg: { type: "sync:run"; serverUrl: string }): Promise<unknown>;
}

export async function handleExternalMessage(msg: unknown, senderUrl: string | undefined, deps: ExternalDeps): Promise<ExtResponse> {
  if (typeof msg !== "object" || msg === null) return { ok: false, error: "bad_message" };
  const type = (msg as { type?: unknown }).type;
  if (type === "ping") return { ok: true, version: deps.version };
  if (type !== "sync:start") return { ok: false, error: "unknown_type" };
  if (!senderUrl) return { ok: false, error: "no_sender" };
  const serverUrl = new URL(senderUrl).origin;
  const tabId = (await deps.findInstagramTab()) ?? (await deps.openInstagramTab());
  const reply = (await deps.sendToTab(tabId, { type: "sync:run", serverUrl })) as ExtResponse | undefined;
  return reply ?? { ok: false, error: "instagram_tab_failed" };
}
