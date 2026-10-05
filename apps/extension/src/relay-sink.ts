import type { SyncSink } from "@no-fomo/core";
import type { RelayMessage, RelayResponse } from "./relay";

export function createRelaySink(serverUrl: string, send: (m: RelayMessage) => Promise<RelayResponse>): SyncSink {
  async function post<T>(path: string, body: unknown): Promise<T> {
    const r = await send({ type: "relay", serverUrl, path, body });
    if (!r.ok) throw new Error(r.error);
    return r.data as T;
  }
  return {
    startRun: () => post("/api/sync/runs", {}),
    savedPage: (runId, payload) => post(`/api/sync/runs/${runId}/saved`, { payload }),
    collections: (runId, payload) => post(`/api/sync/runs/${runId}/collections`, { payload }),
    finishRun: async (runId, result) => { await post(`/api/sync/runs/${runId}/finish`, result); },
  };
}
