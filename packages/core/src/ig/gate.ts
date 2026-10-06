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
  return {
    load: async () => state,
    save: async (next) => { state = next; },
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
  let tail: Promise<unknown> = Promise.resolve();

  /** Waits until a call may go out. Throws `paused`, or `budget` in "fail" mode. */
  async function admit(mode: GateMode): Promise<void> {
    const pause = gap();
    for (;;) {
      const s = await load();
      const status = gateStatus(s, now(), limit);
      if (status.pausedUntil !== null) {
        throw new IgError("paused", `Instagram is limiting calls. Its answer: ${status.reason}`, undefined, status.pausedUntil);
      }
      if (status.budgetUntil !== null) {
        if (mode === "fail") throw new IgError("budget", "The app made many Instagram calls this hour.", undefined, status.budgetUntil);
        // +1 ms: at exactly `budgetUntil` the oldest call still counts, so wake just after it.
        await opts.sleep(Math.max(1, status.budgetUntil - now() + 1));
        continue;
      }
      const last = s.calls.at(-1);
      const wait = last === undefined ? 0 : last + pause - now();
      if (wait <= 0) return;
      await opts.sleep(wait);
    }
  }

  async function runOne<T>(call: () => Promise<T>, mode: GateMode): Promise<T> {
    await admit(mode);
    const at = now();
    const before = await load();
    await store.save({ ...before, calls: [...before.calls.filter((t) => t > at - HOUR), at] });
    try {
      const result = await call();
      const s = await load();
      if (s.refusals > 0) await store.save({ ...s, refusals: 0 });
      return result;
    } catch (e) {
      if (e instanceof IgError && (e.code === "rate_limited" || e.code === "refused")) {
        const s = await load();
        const refusals = s.refusals + 1;
        const stepMs = STOP_STEPS_MS[Math.min(refusals, STOP_STEPS_MS.length) - 1]!;
        await store.save({ ...s, refusals, stopUntil: now() + stepMs, stopReason: e.message });
      }
      throw e;
    }
  }

  return {
    run(call, mode = "fail") {
      const result = tail.then(() => runOne(call, mode));
      tail = result.catch(() => {});
      return result;
    },
  };
}

export function gateClient(ig: IgClient, gate: RequestGate): IgClient {
  return {
    savedPage: (cursor) => gate.run(() => ig.savedPage(cursor)),
    collectionsPage: (cursor) => gate.run(() => ig.collectionsPage(cursor)),
    mediaInfo: (id) => gate.run(() => ig.mediaInfo(id)),
    profileInfo: (username) => gate.run(() => ig.profileInfo(username)),
    userFeed: (userId, cursor) => gate.run(() => ig.userFeed(userId, cursor)),
    searchUsers: (query) => gate.run(() => ig.searchUsers(query)),
    followingPage: (viewerId, cursor) => gate.run(() => ig.followingPage(viewerId, cursor)),
  };
}
