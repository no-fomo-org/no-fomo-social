import { IgError, type IgClient } from "../ig/client";
import { readPageInfo } from "../ig/parse";
import { parseFollowingPage } from "../ig/users";
import type { SyncResult } from "./run-sync";

export type ProfileLoadMode = "add" | "older" | "refresh";
export type ProfileLoadRequest = { mode: "add"; username: string } | { mode: "older" | "refresh"; authorId: string };
export type ProfileStartBody = { mode: "add"; payload: unknown } | { mode: "older" | "refresh"; authorId: string };
export type LoadStart = { ok: true; authorId?: string } | { ok: false; error: string };
export type LoadResult = { ok: boolean; pages: number; error?: { code: string; message: string } };

export interface ProfileSink {
  /** `mode` is what the server chose: adding an added profile becomes a refresh, refreshing an empty one an add. */
  startRun(body: ProfileStartBody): Promise<{ runId: number; authorId: string; cursor: string | null; mode: ProfileLoadMode }>;
  page(runId: number, payload: unknown): Promise<{ stop: boolean }>;
  finishRun(runId: number, result: SyncResult): Promise<void>;
}

export interface FollowingSink {
  startRun(): Promise<{ runId: number }>;
  page(runId: number, payload: unknown): Promise<{ seen: number }>;
  finishRun(runId: number, result: SyncResult): Promise<void>;
}

/** About 100 posts at 12 per page. */
export const PROFILE_PAGES = 9;
/** A refresh reads until it meets posts it already has; about 600 posts covers a long break. */
export const REFRESH_PAGES = 50;
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

export async function runProfileLoad(deps: {
  ig: IgClient;
  sink: ProfileSink;
  request: ProfileLoadRequest;
  onStart: (s: LoadStart) => void;
  maxPages?: number;
}): Promise<LoadResult> {
  let started: Awaited<ReturnType<ProfileSink["startRun"]>>;
  try {
    const r = deps.request;
    const body: ProfileStartBody =
      r.mode === "add" ? { mode: "add", payload: await deps.ig.profileInfo(r.username) } : { mode: r.mode, authorId: r.authorId };
    started = await deps.sink.startRun(body);
  } catch (e) {
    deps.onStart({ ok: false, error: startError(e) });
    return { ok: false, pages: 0, error: errorOf(e) };
  }
  deps.onStart({ ok: true, authorId: started.authorId });
  let cursor = started.cursor;
  const max = deps.maxPages ?? (started.mode === "refresh" ? REFRESH_PAGES : PROFILE_PAGES);
  return pageLoop(started.runId, deps.sink, max, async () => {
    const raw = await deps.ig.userFeed(started.authorId, cursor);
    const { stop } = await deps.sink.page(started.runId, raw);
    const info = readPageInfo(raw);
    cursor = info.nextCursor;
    return !stop && info.moreAvailable;
  });
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
