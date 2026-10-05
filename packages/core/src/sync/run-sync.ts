import { IgError, type IgClient } from "../ig/client";
import { readPageInfo } from "../ig/parse";

export type SyncResult = { ok: true } | { ok: false; code: string; message: string };

export interface SyncSink {
  startRun(): Promise<{ runId: number }>;
  savedPage(runId: number, payload: unknown): Promise<{ stop: boolean; seen: number }>;
  collections(runId: number, payload: unknown): Promise<{ collections: { id: string; name: string }[] }>;
  collectionPage(runId: number, collectionId: string, payload: unknown): Promise<{ stop: boolean; seen: number }>;
  finishRun(runId: number, result: SyncResult): Promise<void>;
}

export interface RunSyncDeps {
  ig: IgClient;
  sink: SyncSink;
  sleep: (ms: number) => Promise<void>;
  /** Pause before each Instagram request after the first. Default 2000-3000 ms. */
  delayMs?: () => number;
  /** Safety cap on Instagram requests per sync (default 3000, about 60k posts). */
  maxRequests?: number;
}

class CapReached extends Error {}

export async function runSync(deps: RunSyncDeps): Promise<{ ok: boolean; requests: number; error?: { code: string; message: string } }> {
  const delay = deps.delayMs ?? (() => 2000 + Math.floor(Math.random() * 1000));
  const cap = deps.maxRequests ?? 3000;
  let requests = 0;

  async function request<T>(call: () => Promise<T>): Promise<T> {
    if (requests >= cap) throw new CapReached();
    if (requests > 0) await deps.sleep(delay());
    requests++;
    return call();
  }

  let runId: number;
  try {
    ({ runId } = await deps.sink.startRun());
  } catch (e) {
    return { ok: false, requests, error: { code: "server_unreachable", message: (e as Error).message } };
  }

  try {
    let cursor: string | null = null;
    for (;;) {
      const raw = await request(() => deps.ig.savedPage(cursor));
      const { stop } = await deps.sink.savedPage(runId, raw);
      const info = readPageInfo(raw);
      if (stop || !info.moreAvailable) break;
      cursor = info.nextCursor;
    }

    const collections: { id: string; name: string }[] = [];
    cursor = null;
    for (;;) {
      const raw = await request(() => deps.ig.collectionsPage(cursor));
      collections.push(...(await deps.sink.collections(runId, raw)).collections);
      const info = readPageInfo(raw);
      if (!info.moreAvailable) break;
      cursor = info.nextCursor;
    }

    for (const c of collections) {
      cursor = null;
      for (;;) {
        const raw = await request(() => deps.ig.collectionPage(c.id, cursor));
        const { stop } = await deps.sink.collectionPage(runId, c.id, raw);
        const info = readPageInfo(raw);
        if (stop || !info.moreAvailable) break;
        cursor = info.nextCursor;
      }
    }

    await deps.sink.finishRun(runId, { ok: true });
    return { ok: true, requests };
  } catch (e) {
    const error =
      e instanceof IgError
        ? { code: e.code, message: e.message }
        : e instanceof CapReached
          ? { code: "too_many_requests", message: `Stopped after ${cap} requests to protect your account.` }
          : { code: "internal", message: (e as Error).message };
    await deps.sink.finishRun(runId, { ok: false, ...error }).catch(() => {});
    return { ok: false, requests, error };
  }
}
