export interface RelayMessage { type: "relay"; serverUrl: string; path: string; body: unknown }
export type RelayResponse = { ok: true; data: unknown } | { ok: false; error: string };

function isLocal(serverUrl: string) {
  try {
    const u = new URL(serverUrl);
    return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

export async function handleRelay(msg: RelayMessage, fetchFn: typeof fetch): Promise<RelayResponse> {
  if (msg?.type !== "relay" || !isLocal(msg.serverUrl) || typeof msg.path !== "string" || !msg.path.startsWith("/api/sync/")) {
    return { ok: false, error: "bad_relay" };
  }
  try {
    const res = await fetchFn(new URL(msg.path, msg.serverUrl).toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(msg.body ?? {}),
    });
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) return { ok: false, error: data?.error ?? `Server error ${res.status}` };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: `Cannot reach no-fomo app: ${(e as Error).message}` };
  }
}
