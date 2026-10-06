import { IgError, type IgClient } from "./client";

/** `wait`: background jobs wait for the hourly limit. `fail`: calls the owner waits for fail at once. */
export type GateMode = "wait" | "fail";

export interface RequestGate {
  run<T>(call: () => Promise<T>, mode?: GateMode): Promise<T>;
}

/** Kept in browser storage, so every Instagram tab shares it and a reload does not end a stop. */
export interface GateState {
  /** Times (ms) of the calls in the last hour, oldest first. */
  calls: number[];
  stopUntil: number;
  /** Instagram's answer that started the stop. */
  stopReason: string;
  /** Refusals in a row. A successful call resets it. */
  refusals: number;
}

export interface GateStore {
  load(): Promise<GateState | null>;
  save(state: GateState): Promise<void>;
  /** Runs `fn` alone across every tab that shares the store, so one tab never overwrites another's change. */
  lock?<T>(fn: () => Promise<T>): Promise<T>;
}

export interface GateStatus {
  pausedUntil: number | null;
  reason: string | null;
  budgetUntil: number | null;
}

export const GATE_STORAGE_KEY = "igGate";
export const HOURLY_LIMIT = 150;
/** 15 minutes, 1 hour, then 6 hours for every further refusal in a row. */
export const STOP_STEPS_MS = [15 * 60_000, 60 * 60_000, 6 * 60 * 60_000] as const;
const HOUR = 60 * 60_000;
const EMPTY: GateState = { calls: [], stopUntil: 0, stopReason: "", refusals: 0 };

export function memoryGateStore(): GateStore {
  let state: GateState | null = null;
  let held: Promise<unknown> = Promise.resolve();
  return {
    load: async () => state,
    save: async (next) => { state = next; },
    lock(fn) {
      const run = held.then(fn);
      held = run.catch(() => {});
      return run;
    },
  };
}

/** What limits calls right now. The background script answers `ig:status` with this. */
export function gateStatus(state: GateState | null, now: number, limit = HOURLY_LIMIT): GateStatus {
  const s = state ?? EMPTY;
  const recent = s.calls.filter((t) => t > now - HOUR);
  const stopped = s.stopUntil > now;
  return {
    pausedUntil: stopped ? s.stopUntil : null,
    reason: stopped ? s.stopReason : null,
    // One call frees up when the oldest call that keeps the count at the limit is an hour old.
    budgetUntil: recent.length >= limit ? recent[recent.length - limit]! + HOUR : null,
  };
}

/**
 * Every Instagram request goes through one gate: one at a time, a pause between them, at most
 * `limit` calls an hour, and a stop after Instagram refuses that grows while it keeps refusing.
 */
export function createRequestGate(opts: {
  sleep: (ms: number) => Promise<void>;
  now?: () => number;
  /** Pause between two requests. Default 3000-6000 ms. */
  gapMs?: () => number;
  /** Default: memory only (tests). The extension passes browser storage. */
  store?: GateStore;
  limit?: number;
}): RequestGate {
  const now = opts.now ?? Date.now;
  const gap = opts.gapMs ?? (() => 3000 + Math.floor(Math.random() * 3000));
  const store = opts.store ?? memoryGateStore();
  const limit = opts.limit ?? HOURLY_LIMIT;
  const load = async (): Promise<GateState> => ({ ...EMPTY, ...(await store.load()) });
  const locked = <T>(fn: () => Promise<T>): Promise<T> => (store.lock ? store.lock(fn) : fn());
  /** Read, change and write the shared state as one step. `change` returns null to write nothing. */
  const update = (change: (s: GateState) => GateState | null) =>
    locked(async () => {
      const next = change(await load());
      if (next) await store.save(next);
    });
  let tail: Promise<unknown> = Promise.resolve();

  const pausedError = (status: GateStatus) =>
    new IgError("paused", `Instagram is limiting calls. Its answer: ${status.reason}`, undefined, status.pausedUntil!);
  const budgetError = (status: GateStatus) =>
    new IgError("budget", "The app made many Instagram calls this hour.", undefined, status.budgetUntil!);

  type Decision = { go: true } | { go: false; status: GateStatus; waitMs: number };

  /** Waits until a call may go out, then counts it. Throws `paused`, or `budget` in "fail" mode. */
  async function admit(mode: GateMode): Promise<void> {
    const pause = gap();
    for (;;) {
      // Checking and counting happen in one locked step, so two tabs cannot both take the last call of the hour.
      const d = await locked(async (): Promise<Decision> => {
        const s = await load();
        const at = now();
        const status = gateStatus(s, at, limit);
        if (status.pausedUntil !== null || status.budgetUntil !== null) return { go: false, status, waitMs: 0 };
        const last = s.calls.at(-1);
        const wait = last === undefined ? 0 : last + pause - at;
        if (wait > 0) return { go: false, status, waitMs: wait };
        await store.save({ ...s, calls: [...s.calls.filter((t) => t > at - HOUR), at] });
        return { go: true };
      });
      if (d.go) return;
      if (d.status.pausedUntil !== null) throw pausedError(d.status);
      if (d.status.budgetUntil !== null) {
        if (mode === "fail") throw budgetError(d.status);
        // +1 ms: at exactly `budgetUntil` the oldest call still counts, so wake just after it.
        await opts.sleep(Math.max(1, d.status.budgetUntil - now() + 1));
        continue;
      }
      await opts.sleep(d.waitMs);
    }
  }

  async function runOne<T>(call: () => Promise<T>, mode: GateMode): Promise<T> {
    await admit(mode);
    try {
      const result = await call();
      await update((s) => (s.refusals > 0 ? { ...s, refusals: 0 } : null));
      return result;
    } catch (e) {
      if (e instanceof IgError && (e.code === "rate_limited" || e.code === "refused")) {
        const reason = e.message;
        await update((s) => {
          const refusals = s.refusals + 1;
          const stepMs = STOP_STEPS_MS[Math.min(refusals, STOP_STEPS_MS.length) - 1]!;
          return { ...s, refusals, stopUntil: now() + stepMs, stopReason: reason };
        });
      }
      throw e;
    }
  }

  /** A call the owner waits for never queues behind a background job that sleeps for the hourly limit. */
  async function failFast(): Promise<void> {
    const status = gateStatus(await load(), now(), limit);
    if (status.pausedUntil !== null) throw pausedError(status);
    if (status.budgetUntil !== null) throw budgetError(status);
  }

  return {
    run(call, mode = "fail") {
      return (mode === "fail" ? failFast() : Promise.resolve()).then(() => {
        const result = tail.then(() => runOne(call, mode));
        tail = result.catch(() => {});
        return result;
      });
    },
  };
}

export type IgCallKind = "saved" | "collections" | "post" | "profile" | "feed" | "search" | "following";
export type IgCallResult = "ok" | "rate_limited" | "refused" | "login_required" | "not_found" | "error";
/** One call that reached Instagram. Kept by the server in `ig_calls` to find the cause of a refusal. */
export interface IgCallLog { at: number; kind: IgCallKind; status: number; result: IgCallResult; ms: number }

const NAMED_RESULTS = new Set<string>(["rate_limited", "refused", "login_required", "not_found"]);

/** `status`: HTTP status; 200 when Instagram answered 200 with an error inside; 0 when the network failed. */
export function callLogEntry(kind: IgCallKind, at: number, ms: number, error?: unknown): IgCallLog {
  if (error === undefined) return { at, kind, status: 200, result: "ok", ms };
  if (!(error instanceof IgError)) return { at, kind, status: 0, result: "error", ms };
  const status = error.status ?? (error.code === "http_error" ? 0 : 200);
  return { at, kind, status, result: NAMED_RESULTS.has(error.code) ? (error.code as IgCallResult) : "error", ms };
}

/**
 * The client every job uses. `mode`: background jobs ("wait") or calls the owner waits for ("fail").
 * `log` hears about each call that reached Instagram; it must never fail the call.
 */
export function gateClient(ig: IgClient, gate: RequestGate, opts: { mode: GateMode; log?: (e: IgCallLog) => void; now?: () => number }): IgClient {
  const now = opts.now ?? Date.now;
  const report = (e: IgCallLog) => {
    try {
      opts.log?.(e);
    } catch {
      // The log is only for finding causes later.
    }
  };
  const through = <T>(kind: IgCallKind, call: () => Promise<T>): Promise<T> =>
    gate.run(async () => {
      const at = now();
      try {
        const result = await call();
        report(callLogEntry(kind, at, now() - at));
        return result;
      } catch (e) {
        report(callLogEntry(kind, at, now() - at, e));
        throw e;
      }
    }, opts.mode);
  return {
    savedPage: (cursor) => through("saved", () => ig.savedPage(cursor)),
    collectionsPage: (cursor) => through("collections", () => ig.collectionsPage(cursor)),
    mediaInfo: (id) => through("post", () => ig.mediaInfo(id)),
    userFeed: (userId, cursor) => through("feed", () => ig.userFeed(userId, cursor)),
    searchUsers: (query) => through("search", () => ig.searchUsers(query)),
    followingPage: (viewerId, cursor) => through("following", () => ig.followingPage(viewerId, cursor)),
  };
}
