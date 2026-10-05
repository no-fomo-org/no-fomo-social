import { IgError, type IgClient } from "../ig/client";
import { parseFollowingPage } from "../ig/users";
import type { SyncResult } from "./run-sync";

export type LoadStart = { ok: true } | { ok: false; error: string };
export type LoadResult = { ok: boolean; pages: number; error?: { code: string; message: string } };

export interface FollowingSink {
  startRun(): Promise<{ runId: number }>;
  page(runId: number, payload: unknown): Promise<{ seen: number }>;
  finishRun(runId: number, result: SyncResult): Promise<void>;
}

/** About 5,000 accounts at 100 per page. */
export const FOLLOWING_PAGES = 50;

const errorOf = (e: unknown) =>
  e instanceof IgError ? { code: e.code, message: e.message } : { code: "internal", message: (e as Error).message };
/** The web app shows a text for each code; server errors arrive as their code in the message. */
const startError = (e: unknown) => (e instanceof IgError ? e.code : (e as Error).message);

/** Pages through a run; the request gate spaces the calls, so there is no pause here. */
async function pageLoop(
  runId: number,
  sink: { finishRun(runId: number, result: SyncResult): Promise<void> },
  max: number,
  step: () => Promise<boolean>,
): Promise<LoadResult> {
  let pages = 0;
  try {
    while (pages < max) {
      pages++;
      if (!(await step())) break;
    }
    await sink.finishRun(runId, { ok: true });
    return { ok: true, pages };
  } catch (e) {
    const error = errorOf(e);
    await sink.finishRun(runId, { ok: false, ...error }).catch(() => {});
    // The failed page did not count.
    return { ok: false, pages: pages - 1, error };
  }
}

export async function runFollowingUpdate(deps: {
  ig: IgClient;
  sink: FollowingSink;
  viewerId: string | null;
  onStart: (s: LoadStart) => void;
  maxPages?: number;
}): Promise<LoadResult> {
  const viewerId = deps.viewerId;
  if (!viewerId) {
    deps.onStart({ ok: false, error: "login_required" });
    return { ok: false, pages: 0, error: { code: "login_required", message: "Log in to Instagram in this browser." } };
  }
  let runId: number;
  try {
    ({ runId } = await deps.sink.startRun());
  } catch (e) {
    deps.onStart({ ok: false, error: startError(e) });
    return { ok: false, pages: 0, error: errorOf(e) };
  }
  deps.onStart({ ok: true });
  let cursor: string | null = null;
  return pageLoop(runId, deps.sink, deps.maxPages ?? FOLLOWING_PAGES, async () => {
    const raw = await deps.ig.followingPage(viewerId, cursor);
    await deps.sink.page(runId, raw);
    const info = parseFollowingPage(raw);
    cursor = info.nextCursor;
    return info.moreAvailable;
  });
}
