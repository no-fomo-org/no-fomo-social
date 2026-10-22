import type { FollowingSink, SyncSink } from "@no-fomo-social/core";
import type { RelayMessage, RelayResponse } from "./relay";

export function createRelaySink(serverUrl: string, send: (m: RelayMessage) => Promise<RelayResponse>): SyncSink {
  async function post<T>(path: string, body: unknown): Promise<T> {
    const r = await send({ type: "relay", serverUrl, path, body });
    if (!r.ok) throw new Error(r.error);
    return r.data as T;
  }
  return {
    startRun: (mode) => post("/api/sync/runs", { mode }),
    savedPage: (runId, payload) => post(`/api/sync/runs/${runId}/saved`, { payload }),
    collections: (runId, payload) => post(`/api/sync/runs/${runId}/collections`, { payload }),
    finishRun: async (runId, result) => { await post(`/api/sync/runs/${runId}/finish`, result); },
  };
}

function poster(serverUrl: string, send: (m: RelayMessage) => Promise<RelayResponse>) {
  return async <T>(path: string, body: unknown): Promise<T> => {
    const r = await send({ type: "relay", serverUrl, path, body });
    if (!r.ok) throw new Error(r.error);
    return r.data as T;
  };
}

export function createFollowingSink(serverUrl: string, send: (m: RelayMessage) => Promise<RelayResponse>): FollowingSink {
  const post = poster(serverUrl, send);
  return {
    startRun: () => post("/api/sync/following/runs", {}),
    page: (runId, payload) => post(`/api/sync/following/runs/${runId}/page`, { payload }),
    finishRun: async (runId, result) => { await post(`/api/sync/following/runs/${runId}/finish`, result); },
  };
}
