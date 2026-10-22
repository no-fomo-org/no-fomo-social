import { isAppOrigin } from "./origins";

export interface RelayMessage { type: "relay"; serverUrl: string; path: string; body: unknown }
export type RelayResponse = { ok: true; data: unknown } | { ok: false; error: string };


/** Only sync routes, checked on the resolved path, so ".." or a query cannot reach another route. */
function syncUrl(path: unknown, serverUrl: string): URL | null {
  if (typeof path !== "string" || !path.startsWith("/api/sync/")) return null;
  const url = new URL(path, serverUrl);
  return url.pathname.startsWith("/api/sync/") && url.search === "" && url.hash === "" ? url : null;
}

export async function handleRelay(msg: RelayMessage, fetchFn: typeof fetch): Promise<RelayResponse> {
  const url = msg?.type === "relay" && isAppOrigin(msg.serverUrl) ? syncUrl(msg.path, msg.serverUrl) : null;
  if (!url) return { ok: false, error: "bad_relay" };
  try {
    const res = await fetchFn(url.toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(msg.body ?? {}),
    });
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) return { ok: false, error: data?.error ?? `Server error ${res.status}` };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: `Cannot reach the no-fomo-social app: ${(e as Error).message}` };
  }
}
