# Home Tabs and Instagram Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three tabs (Home, Saved, Reports) with account posts inside Home, and an Instagram request gate that keeps its stop and hourly limit in browser storage, steps up its waits after refusals, tells the app about them, and logs every call.

**Architecture:** The gate in `packages/core/src/ig/gate.ts` gets a pluggable `GateStore` (memory in tests, `browser.storage.local` in the extension), a 150-calls-per-hour limit, and 15 min → 1 h → 6 h stops. `gateClient` wraps the raw client in "wait" mode (background jobs) or "fail" mode (calls the owner waits for) and reports each real call to a log callback, which the extension relays to a new `ig_calls` table. The web app polls a new `ig:status` extension message for a banner, and the old `/profiles` routes become a Home route with `?account=` state.

**Tech Stack:** TypeScript, Vitest, WXT (Chrome extension), Hono + Drizzle + better-sqlite3 (server), React Router 7 + TanStack Query + Tailwind (web).

**Spec:** `docs/superpowers/specs/2026-10-05-profiles-reports-design.md`

## Global Constraints

- All UI copy: plain, short, simple English for non-native readers. No jokes, no filler.
- One call at a time, with a 3–6 s random pause between two calls.
- At most **150 calls in any 60 minutes**.
- Stops after a refusal: **15 minutes**, then **1 hour**, then **6 hours** for every further refusal. A successful call resets the step back to 15 minutes.
- Login errors (401, 403, `require_login`) do not start a stop.
- Gate state lives in `browser.storage.local`, shared by every Instagram tab, surviving reloads.
- `ig_calls` keeps the newest 2,000 rows.
- Calls stopped by the gate never reach Instagram and are not logged. A failed log write never fails the call.
- Routes: `/` Home, `/saved` Saved, `/reports` Reports. `?account=<username>` on Home; `?post=<id>` opens the viewer.
- Nothing loads from Instagram by itself: no auto-load on scroll, no search while typing, no refetch on mount, focus or reconnect.
- The owner runs the app with `pnpm start` on :4747 and builds the extension with `pnpm ext:build`.

## Review Focus

- **Two Instagram tabs open at once:** a stop started in one tab must stop calls in the other. Pinned by the "shares the stop through the store" test in Task 1.
- **A saved sync or following update that goes over 150 calls:** it must slow down and finish, not fail. Pinned by the "background calls wait for the hourly limit" test in Task 1.
- **A stop ends while the app is open:** the banner must go away by itself at the next poll. Pinned by the `limitFrom` "past times" test in Task 5.
- **The owner has not rebuilt the extension yet** (no `ig:status`, no `storage` permission): the app must show no banner and keep working. Pinned by the `limitFrom(null)` test in Task 5.
- **The no-fomo server is down while the extension calls Instagram:** the log write fails and the call must still return. Pinned by the "a throwing log does not fail the call" test in Task 2.

---

## Before you start

Work in the worktree `/Users/evgeniivaniukov/Development/no-fomo-profiles` (branch `profiles-reports`). The main checkout at `/Users/evgeniivaniukov/Development/no-fomo` is on `main` and the owner may be running it. Do not touch it.

```bash
cd /Users/evgeniivaniukov/Development/no-fomo-profiles && pnpm install && pnpm test && pnpm typecheck
```

Expected: all tests pass and typecheck is clean before any change. Run every command below from this folder.

---

### Task 1: Gate with stored state, hourly limit and stop steps

**Files:**
- Modify: `packages/core/src/ig/client.ts` (error code `budget`, `until` on `IgError`)
- Modify: `packages/core/src/ig/gate.ts` (everything above `gateClient`)
- Test: `packages/core/test/gate.test.ts` (replace the file)

**Interfaces:**
- Produces:
  - `IgErrorCode` gains `"budget"`. `new IgError(code, message, status?, until?)`; `IgError.until?: number` (ms).
  - `type GateMode = "wait" | "fail"`
  - `interface RequestGate { run<T>(call: () => Promise<T>, mode?: GateMode): Promise<T> }` (default mode `"fail"`)
  - `interface GateState { calls: number[]; stopUntil: number; stopReason: string; refusals: number }`
  - `interface GateStore { load(): Promise<GateState | null>; save(state: GateState): Promise<void> }`
  - `interface GateStatus { pausedUntil: number | null; reason: string | null; budgetUntil: number | null }`
  - `GATE_STORAGE_KEY = "igGate"`, `HOURLY_LIMIT = 150`, `STOP_STEPS_MS = [900_000, 3_600_000, 21_600_000]`
  - `memoryGateStore(): GateStore`
  - `gateStatus(state: GateState | null, now: number, limit?: number): GateStatus`
  - `createRequestGate(opts: { sleep(ms): Promise<void>; now?(): number; gapMs?(): number; store?: GateStore; limit?: number }): RequestGate`

- [ ] **Step 1: Write the failing tests**

Replace `packages/core/test/gate.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { IgError } from "../src/ig/client";
import { createRequestGate, gateStatus, memoryGateStore, STOP_STEPS_MS, type GateStore } from "../src/ig/gate";

const MIN = 60_000;
const HOUR = 60 * MIN;

function clock() {
  let t = 1_000_000_000;
  const sleeps: number[] = [];
  return {
    now: () => t,
    advance: (ms: number) => { t += ms; },
    sleeps,
    sleep: async (ms: number) => { sleeps.push(ms); t += ms; },
  };
}
const refuse = (code: "rate_limited" | "refused" = "rate_limited") => async () => { throw new IgError(code, "Instagram asked to slow down. Try again later."); };

describe("request gate", () => {
  it("lets the first call through at once and spaces the next ones", async () => {
    const c = clock();
    const gate = createRequestGate({ sleep: c.sleep, now: c.now, gapMs: () => 4000 });
    await gate.run(async () => 1);
    c.advance(500);
    await gate.run(async () => 2);
    expect(c.sleeps).toEqual([3500]);
  });

  it("runs calls one at a time, in order", async () => {
    const c = clock();
    const gate = createRequestGate({ sleep: c.sleep, now: c.now, gapMs: () => 4000 });
    const order: string[] = [];
    const slow = gate.run(async () => { order.push("a:start"); await Promise.resolve(); order.push("a:end"); });
    const fast = gate.run(async () => { order.push("b"); });
    await Promise.all([slow, fast]);
    expect(order).toEqual(["a:start", "a:end", "b"]);
    expect(c.sleeps).toEqual([4000]);
  });

  it("stops every call for 15 minutes after a refusal, and says until when", async () => {
    const c = clock();
    const gate = createRequestGate({ sleep: c.sleep, now: c.now, gapMs: () => 0 });
    await expect(gate.run(refuse())).rejects.toMatchObject({ code: "rate_limited" });
    let called = false;
    await expect(gate.run(async () => { called = true; })).rejects.toMatchObject({
      code: "paused", until: c.now() + 15 * MIN, message: expect.stringContaining("Instagram asked to slow down"),
    });
    expect(called).toBe(false);
    c.advance(15 * MIN);
    await gate.run(async () => { called = true; });
    expect(called).toBe(true);
  });

  it("steps the stop up to 1 hour and 6 hours while Instagram keeps refusing, and back after a success", async () => {
    const c = clock();
    const store = memoryGateStore();
    const gate = createRequestGate({ sleep: c.sleep, now: c.now, gapMs: () => 0, store });
    const stopFor = async () => ((await store.load())!.stopUntil - c.now());
    await expect(gate.run(refuse())).rejects.toThrow();
    expect(await stopFor()).toBe(STOP_STEPS_MS[0]);
    c.advance(STOP_STEPS_MS[0]);
    await expect(gate.run(refuse("refused"))).rejects.toThrow();
    expect(await stopFor()).toBe(STOP_STEPS_MS[1]);
    c.advance(STOP_STEPS_MS[1]);
    await expect(gate.run(refuse())).rejects.toThrow();
    expect(await stopFor()).toBe(STOP_STEPS_MS[2]);
    c.advance(STOP_STEPS_MS[2]);
    await expect(gate.run(refuse())).rejects.toThrow();
    expect(await stopFor()).toBe(STOP_STEPS_MS[2]);
    c.advance(STOP_STEPS_MS[2]);
    await gate.run(async () => "ok");
    await expect(gate.run(refuse())).rejects.toThrow();
    expect(await stopFor()).toBe(STOP_STEPS_MS[0]);
  });

  it("starts no stop for login errors or other failures", async () => {
    const c = clock();
    const gate = createRequestGate({ sleep: c.sleep, now: c.now, gapMs: () => 0 });
    await expect(gate.run(async () => { throw new IgError("login_required", "x", 401); })).rejects.toMatchObject({ code: "login_required" });
    await expect(gate.run(async () => { throw new Error("network"); })).rejects.toThrow("network");
    await expect(gate.run(async () => "ok")).resolves.toBe("ok");
  });

  it("keeps the stop after a reload: a new gate on the same store is still stopped", async () => {
    const c = clock();
    const store = memoryGateStore();
    await expect(createRequestGate({ sleep: c.sleep, now: c.now, gapMs: () => 0, store }).run(refuse())).rejects.toThrow();
    const reloaded = createRequestGate({ sleep: c.sleep, now: c.now, gapMs: () => 0, store });
    await expect(reloaded.run(async () => 1)).rejects.toMatchObject({ code: "paused" });
  });

  it("shares the stop through the store: a second tab's gate is stopped too", async () => {
    const c = clock();
    const store = memoryGateStore();
    const tabA = createRequestGate({ sleep: c.sleep, now: c.now, gapMs: () => 0, store });
    const tabB = createRequestGate({ sleep: c.sleep, now: c.now, gapMs: () => 0, store });
    await tabB.run(async () => 1);
    await expect(tabA.run(refuse())).rejects.toThrow();
    await expect(tabB.run(async () => 2)).rejects.toMatchObject({ code: "paused" });
  });

  it("calls the owner waits for fail at the hourly limit, with the time a call is allowed again", async () => {
    const c = clock();
    const gate = createRequestGate({ sleep: c.sleep, now: c.now, gapMs: () => 0, limit: 2 });
    const first = c.now();
    await gate.run(async () => 1);
    c.advance(MIN);
    await gate.run(async () => 2);
    let called = false;
    await expect(gate.run(async () => { called = true; }, "fail")).rejects.toMatchObject({ code: "budget", until: first + HOUR });
    expect(called).toBe(false);
  });

  it("background calls wait for the hourly limit and go on", async () => {
    const c = clock();
    const gate = createRequestGate({ sleep: c.sleep, now: c.now, gapMs: () => 0, limit: 2 });
    const first = c.now();
    await gate.run(async () => 1, "wait");
    await gate.run(async () => 2, "wait");
    await expect(gate.run(async () => 3, "wait")).resolves.toBe(3);
    expect(c.now()).toBe(first + HOUR + 1);
  });

  it("a failed call does not jam the queue", async () => {
    const c = clock();
    const gate = createRequestGate({ sleep: c.sleep, now: c.now, gapMs: () => 0 });
    await expect(gate.run(async () => { throw new Error("network"); })).rejects.toThrow("network");
    await expect(gate.run(async () => "ok")).resolves.toBe("ok");
  });

  it("forgets calls older than an hour", async () => {
    const c = clock();
    const store: GateStore = memoryGateStore();
    const gate = createRequestGate({ sleep: c.sleep, now: c.now, gapMs: () => 0, store });
    await gate.run(async () => 1);
    c.advance(HOUR + 1);
    await gate.run(async () => 2);
    expect((await store.load())!.calls).toEqual([c.now()]);
  });
});

describe("gateStatus", () => {
  const empty = { calls: [], stopUntil: 0, stopReason: "", refusals: 0 };
  it("is all null when nothing limits calls", () => {
    expect(gateStatus(null, 5)).toEqual({ pausedUntil: null, reason: null, budgetUntil: null });
    expect(gateStatus({ ...empty, stopUntil: 5, stopReason: "x" }, 5)).toEqual({ pausedUntil: null, reason: null, budgetUntil: null });
  });
  it("gives the end of a stop and Instagram's answer", () => {
    expect(gateStatus({ ...empty, stopUntil: 900, stopReason: "slow down" }, 100)).toEqual({ pausedUntil: 900, reason: "slow down", budgetUntil: null });
  });
  it("gives the time the hourly limit frees a call", () => {
    expect(gateStatus({ ...empty, calls: [10, 20, 30] }, 40, 2).budgetUntil).toBe(20 + HOUR);
    expect(gateStatus({ ...empty, calls: [10, 20] }, 40, 3).budgetUntil).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/core/test/gate.test.ts`
Expected: FAIL (`memoryGateStore`, `gateStatus`, `STOP_STEPS_MS` are not exported).

- [ ] **Step 3: Add `budget` and `until` to `IgError`**

In `packages/core/src/ig/client.ts` replace the code type and the class:

```ts
/**
 * `paused`: the app holds Instagram calls back after Instagram refused one.
 * `budget`: the app made its hourly number of calls. Both carry `until`.
 */
export type IgErrorCode = "login_required" | "rate_limited" | "refused" | "http_error" | "bad_response" | "not_found" | "paused" | "budget";

export class IgError extends Error {
  constructor(
    public readonly code: IgErrorCode,
    message: string,
    public readonly status?: number,
    /** For `paused` and `budget`: when calls are allowed again (ms). */
    public readonly until?: number,
  ) {
    super(message);
    this.name = "IgError";
  }
}
```

- [ ] **Step 4: Rewrite the gate**

In `packages/core/src/ig/gate.ts` replace everything above `export function gateClient` with:

```ts
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
```

Leave `gateClient` as it is for now (Task 2 changes it). It calls `gate.run(fn)` with the default mode, so it still compiles.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run packages/core/test/gate.test.ts`
Expected: PASS (all 14 tests).

- [ ] **Step 6: Run all core tests and typecheck**

Run: `pnpm vitest run packages/core && pnpm --filter @no-fomo/core typecheck`
Expected: PASS. (If `@no-fomo/core` has no `typecheck` script, run `pnpm typecheck`.)

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/ig/client.ts packages/core/src/ig/gate.ts packages/core/test/gate.test.ts
git commit -m "feat(core): gate keeps its stop and hourly limit in a store; stops grow 15 min, 1 h, 6 h"
```

---

### Task 2: Gate clients by mode, call log, following pages of 50

**Files:**
- Modify: `packages/core/src/ig/gate.ts` (`gateClient`, new `callLogEntry`)
- Modify: `packages/core/src/ig/client.ts` (`followingPage` count)
- Modify: `packages/core/src/sync/run-loads.ts` (`FOLLOWING_PAGES`)
- Test: `packages/core/test/gate.test.ts` (append), `packages/core/test/client.test.ts:34`

**Interfaces:**
- Consumes: `RequestGate`, `GateMode`, `IgError` from Task 1.
- Produces:
  - `type IgCallKind = "saved" | "collections" | "post" | "profile" | "feed" | "search" | "following"`
  - `type IgCallResult = "ok" | "rate_limited" | "refused" | "login_required" | "not_found" | "error"`
  - `interface IgCallLog { at: number; kind: IgCallKind; status: number; result: IgCallResult; ms: number }`
  - `callLogEntry(kind: IgCallKind, at: number, ms: number, error?: unknown): IgCallLog`
  - `gateClient(ig: IgClient, gate: RequestGate, opts: { mode: GateMode; log?: (e: IgCallLog) => void; now?: () => number }): IgClient`
  - `FOLLOWING_PAGES = 100`

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/test/gate.test.ts` (add `callLogEntry, gateClient, type IgCallLog` to the import from `../src/ig/gate`, and `type IgClient` to the import from `../src/ig/client`):

```ts
describe("gateClient", () => {
  const unused = async () => { throw new Error("not used"); };
  const raw = (over: Partial<IgClient> = {}): IgClient => ({
    savedPage: unused, collectionsPage: unused, mediaInfo: unused, profileInfo: unused, userFeed: unused, searchUsers: unused, followingPage: unused, ...over,
  });

  it("logs each call that reached Instagram with its kind, result and time", async () => {
    const c = clock();
    const logs: IgCallLog[] = [];
    const gate = createRequestGate({ sleep: c.sleep, now: c.now, gapMs: () => 0 });
    const ig = gateClient(raw({
      savedPage: async () => { c.advance(120); return {}; },
      searchUsers: async () => { throw new IgError("rate_limited", "slow", 429); },
    }), gate, { mode: "fail", log: (e) => logs.push(e), now: c.now });
    const start = c.now();
    await ig.savedPage(null);
    await expect(ig.searchUsers("nasa")).rejects.toMatchObject({ code: "rate_limited" });
    expect(logs).toEqual([
      { at: start, kind: "saved", status: 200, result: "ok", ms: 120 },
      { at: start + 120, kind: "search", status: 429, result: "rate_limited", ms: 0 },
    ]);
  });

  it("does not log calls the gate stopped", async () => {
    const c = clock();
    const logs: IgCallLog[] = [];
    const gate = createRequestGate({ sleep: c.sleep, now: c.now, gapMs: () => 0 });
    const ig = gateClient(raw({ profileInfo: async () => { throw new IgError("refused", "no"); } }), gate, { mode: "fail", log: (e) => logs.push(e), now: c.now });
    await expect(ig.profileInfo("nasa")).rejects.toThrow();
    await expect(ig.profileInfo("nasa")).rejects.toMatchObject({ code: "paused" });
    expect(logs.map((l) => l.result)).toEqual(["refused"]);
  });

  it("a throwing log does not fail the call", async () => {
    const c = clock();
    const gate = createRequestGate({ sleep: c.sleep, now: c.now, gapMs: () => 0 });
    const ig = gateClient(raw({ mediaInfo: async () => "media" }), gate, { mode: "fail", log: () => { throw new Error("server down"); }, now: c.now });
    await expect(ig.mediaInfo("1")).resolves.toBe("media");
  });

  it("passes its mode to the gate", async () => {
    const c = clock();
    const gate = createRequestGate({ sleep: c.sleep, now: c.now, gapMs: () => 0, limit: 1 });
    const page = async () => ({});
    const owner = gateClient(raw({ userFeed: page }), gate, { mode: "fail", now: c.now });
    const background = gateClient(raw({ followingPage: page }), gate, { mode: "wait", now: c.now });
    await owner.userFeed("1", null);
    await expect(owner.userFeed("1", null)).rejects.toMatchObject({ code: "budget" });
    await expect(background.followingPage("1", null)).resolves.toEqual({});
  });
});

describe("callLogEntry", () => {
  it("maps errors to a status and a result", () => {
    expect(callLogEntry("post", 1, 2)).toEqual({ at: 1, kind: "post", status: 200, result: "ok", ms: 2 });
    expect(callLogEntry("post", 1, 2, new IgError("not_found", "x", 404))).toMatchObject({ status: 404, result: "not_found" });
    expect(callLogEntry("post", 1, 2, new IgError("refused", "x"))).toMatchObject({ status: 200, result: "refused" });
    expect(callLogEntry("post", 1, 2, new IgError("http_error", "network"))).toMatchObject({ status: 0, result: "error" });
    expect(callLogEntry("post", 1, 2, new IgError("http_error", "x", 500))).toMatchObject({ status: 500, result: "error" });
    expect(callLogEntry("post", 1, 2, new Error("x"))).toMatchObject({ status: 0, result: "error" });
  });
});
```

In `packages/core/test/client.test.ts` line 34 change `count=100` to `count=50` in the expected following URL.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/core/test/gate.test.ts packages/core/test/client.test.ts`
Expected: FAIL (`callLogEntry` not exported; following URL still has `count=100`).

- [ ] **Step 3: Implement**

In `packages/core/src/ig/gate.ts` replace `gateClient` with:

```ts
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
    profileInfo: (username) => through("profile", () => ig.profileInfo(username)),
    userFeed: (userId, cursor) => through("feed", () => ig.userFeed(userId, cursor)),
    searchUsers: (query) => through("search", () => ig.searchUsers(query)),
    followingPage: (viewerId, cursor) => through("following", () => ig.followingPage(viewerId, cursor)),
  };
}
```

In `packages/core/src/ig/client.ts`, in `followingPage`, change `count: "100"` to `count: "50"`.

In `packages/core/src/sync/run-loads.ts` replace:

```ts
/** About 5,000 accounts at 100 per page. */
export const FOLLOWING_PAGES = 50;
```

with:

```ts
/** About 5,000 accounts at 50 per page. */
export const FOLLOWING_PAGES = 100;
```

- [ ] **Step 4: Fix the one caller that no longer compiles**

`apps/extension/entrypoints/instagram.content.ts` calls `gateClient(…, createRequestGate({ sleep }))` with two arguments. Task 4 rewrites that file; for now change the call to `gateClient(createIgClient({ fetch: window.fetch.bind(window), csrfToken: readCsrf }), createRequestGate({ sleep }), { mode: "fail" })` so the build stays green.

- [ ] **Step 5: Run the tests and typecheck**

Run: `pnpm vitest run packages/core apps/extension && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core apps/extension/entrypoints/instagram.content.ts
git commit -m "feat(core): gate clients by mode with a call log; following list in pages of 50"
```

---

### Task 3: Server keeps the call log

**Files:**
- Modify: `apps/server/src/db/schema.ts` (new `igCalls` table at the end)
- Create: `apps/server/drizzle/0012_ig_calls.sql` and its snapshot and journal entry (generated)
- Create: `apps/server/src/sync/ig-calls.ts`
- Modify: `apps/server/src/http/app.ts` (body schema and route)
- Test: `apps/server/test/ig-calls.test.ts` (create), `apps/server/test/app.test.ts` (append)

**Interfaces:**
- Consumes: `IgCallLog` type from `@no-fomo/core` (Task 2).
- Produces: `POST /api/sync/ig-calls` with body `IgCallLog` → `{ ok: true }`; `logIgCall(db: Db, entry: IgCallLog, kept?: number): void`; `IG_CALLS_KEPT = 2000`.

- [ ] **Step 1: Add the table**

Append to `apps/server/src/db/schema.ts`:

```ts
/** Every Instagram call the extension made, newest 2,000 kept. Read by hand to find the cause of a refusal. */
export const igCalls = sqliteTable("ig_calls", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  at: integer("at").notNull(),
  kind: text("kind").notNull(),
  status: integer("status").notNull(),
  result: text("result").notNull(),
  ms: integer("ms").notNull(),
});
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @no-fomo/server db:generate --name ig_calls`
Expected: creates `apps/server/drizzle/0012_ig_calls.sql` containing only `CREATE TABLE \`ig_calls\` (…)`, plus `meta/0012_snapshot.json` and a journal entry. Open the SQL file and check it touches no other table. If it does, stop and report: the schema and the migrations disagree.

- [ ] **Step 3: Write the failing tests**

Create `apps/server/test/ig-calls.test.ts`:

```ts
import { asc } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { openDb } from "../src/db/open";
import { igCalls } from "../src/db/schema";
import { logIgCall } from "../src/sync/ig-calls";

const entry = (at: number) => ({ at, kind: "saved" as const, status: 200, result: "ok" as const, ms: 300 });

describe("Instagram call log", () => {
  it("stores calls and keeps only the newest ones", () => {
    const db = openDb(":memory:");
    for (let at = 1; at <= 5; at++) logIgCall(db, entry(at), 3);
    expect(db.select({ at: igCalls.at }).from(igCalls).orderBy(asc(igCalls.id)).all().map((r) => r.at)).toEqual([3, 4, 5]);
  });
});
```

Append to `apps/server/test/app.test.ts`:

```ts
describe("Instagram call log route", () => {
  it("stores a call from the extension and rejects bad ones", async () => {
    const ok = await post("/api/sync/ig-calls", { at: 1791283542340, kind: "feed", status: 429, result: "rate_limited", ms: 812 });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });
    expect((await post("/api/sync/ig-calls", { at: 1, kind: "dm", status: 200, result: "ok", ms: 1 })).status).toBe(400);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `pnpm vitest run apps/server/test/ig-calls.test.ts apps/server/test/app.test.ts`
Expected: FAIL (`../src/sync/ig-calls` missing; route answers 404).

- [ ] **Step 5: Implement**

Create `apps/server/src/sync/ig-calls.ts`:

```ts
import { lte } from "drizzle-orm";
import type { IgCallLog } from "@no-fomo/core";
import type { Db } from "../db/open";
import { igCalls } from "../db/schema";

export const IG_CALLS_KEPT = 2000;

/** Stores one call and drops the ones older than the newest `kept`. */
export function logIgCall(db: Db, entry: IgCallLog, kept = IG_CALLS_KEPT): void {
  db.transaction((tx) => {
    const { id } = tx.insert(igCalls).values(entry).returning({ id: igCalls.id }).get();
    tx.delete(igCalls).where(lte(igCalls.id, id - kept)).run();
  });
}
```

In `apps/server/src/http/app.ts`:
- add `import { logIgCall } from "../sync/ig-calls";` next to the other `../sync/` imports;
- add next to the other body schemas:

```ts
const IgCallBody = z.object({
  at: z.number().int().nonnegative(),
  kind: z.enum(["saved", "collections", "post", "profile", "feed", "search", "following"]),
  status: z.number().int().min(0).max(999),
  result: z.enum(["ok", "rate_limited", "refused", "login_required", "not_found", "error"]),
  ms: z.number().int().nonnegative().max(600_000),
});
```

- add after the `/api/sync/following/runs/:id/finish` route:

```ts
  app.post("/api/sync/ig-calls", async (c) => {
    logIgCall(db, IgCallBody.parse(await c.req.json()));
    return c.json({ ok: true });
  });
```

- [ ] **Step 6: Run the server tests and typecheck**

Run: `pnpm vitest run apps/server && pnpm typecheck`
Expected: PASS, including `migration.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add apps/server
git commit -m "feat(server): keep a log of Instagram calls (newest 2,000)"
```

---

### Task 4: Extension stores the gate, answers ig:status, logs calls

**Files:**
- Create: `apps/extension/src/gate-store.ts`
- Modify: `apps/extension/src/external.ts` (serverUrl on every tab message, `ig:status`, types)
- Modify: `apps/extension/src/tab-jobs.ts` (`backgroundIg`, `until` in failures)
- Modify: `apps/extension/src/media-fetch.ts` (`until` in failures)
- Modify: `apps/extension/entrypoints/instagram.content.ts` (wiring)
- Modify: `apps/extension/entrypoints/background.ts` (`igStatus`)
- Modify: `apps/extension/wxt.config.ts` (`storage` permission)
- Test: `apps/extension/test/gate-store.test.ts` (create), `apps/extension/test/external.test.ts`, `apps/extension/test/tab-jobs.test.ts`, `apps/extension/test/media-fetch.test.ts`

**Interfaces:**
- Consumes: `GateStore`, `GateState`, `GateStatus`, `GATE_STORAGE_KEY`, `gateStatus`, `createRequestGate`, `gateClient`, `IgCallLog`, `IgError.until` (Tasks 1–2); `POST /api/sync/ig-calls` (Task 3).
- Produces:
  - `type StorageArea = { get(key: string): Promise<Record<string, unknown>>; set(items: Record<string, unknown>): Promise<void> }`
  - `storageGateStore(area: StorageArea): GateStore`, `readGateState(area: StorageArea): Promise<GateState | null>`
  - External message `{ type: "ig:status" }` → `{ ok: true, status: GateStatus }`.
  - Failure replies may carry `until: number`: `{ ok: false, error: "paused" | "budget" | …, detail?: string, until?: number }`.
  - Every `TabMessage` has `serverUrl: string`.
  - `createTabJobs(deps: { ig: IgClient; backgroundIg: IgClient; send; viewerId })`.

- [ ] **Step 1: Write the failing tests**

Create `apps/extension/test/gate-store.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { GATE_STORAGE_KEY } from "@no-fomo/core";
import { readGateState, storageGateStore } from "../src/gate-store";

function fakeArea() {
  const data = new Map<string, unknown>();
  return {
    data,
    get: async (key: string) => (data.has(key) ? { [key]: data.get(key) } : {}),
    set: async (items: Record<string, unknown>) => { for (const [k, v] of Object.entries(items)) data.set(k, v); },
  };
}

describe("gate store in browser storage", () => {
  it("is empty at first and reads back what it saved", async () => {
    const area = fakeArea();
    const store = storageGateStore(area);
    expect(await store.load()).toBeNull();
    const state = { calls: [1, 2], stopUntil: 9, stopReason: "slow", refusals: 1 };
    await store.save(state);
    expect(area.data.get(GATE_STORAGE_KEY)).toEqual(state);
    expect(await readGateState(area)).toEqual(state);
  });
});
```

In `apps/extension/test/external.test.ts`:
- In the test that checks profile messages (lines ~17–25), every expected tab message now carries `serverUrl: "http://localhost:4747"`, for example `{ type: "profile:search", query: "nasa", serverUrl: "http://localhost:4747" }`, `{ type: "profile:open", username: "nasa", serverUrl: "http://localhost:4747" }`, `{ type: "profile:page", cursor: "528817151:QVFB_x-1=", serverUrl: "http://localhost:4747" }`.
- The deps object used by the tests (`d`) needs `igStatus`. Add `igStatus: vi.fn(async () => ({ pausedUntil: 5, reason: "slow", budgetUntil: null }))` where `d` is built.
- Add:

```ts
  it("answers ig:status from storage without an Instagram tab", async () => {
    const d = deps();
    expect(await handleExternalMessage({ type: "ig:status" }, "http://localhost:4747/", d)).toEqual({
      ok: true, status: { pausedUntil: 5, reason: "slow", budgetUntil: null },
    });
    expect(d.findInstagramTab).not.toHaveBeenCalled();
    expect(await handleExternalMessage({ type: "ig:status" }, "https://evil.example/", d)).toEqual({ ok: false, error: "untrusted_sender" });
  });
```

(Use the file's existing helper that builds `d`; if it is not called `deps`, use its name.)

In `apps/extension/test/tab-jobs.test.ts`:
- `setup` builds the jobs with `createTabJobs({ ig, backgroundIg: ig, send, viewerId: () => "42" })`.
- Add:

```ts
  it("passes on when calls are allowed again", async () => {
    const { jobs } = setup({ searchUsers: async () => { throw new IgError("paused", "Instagram is limiting calls.", undefined, 1234); } });
    expect(await jobs.handle({ type: "profile:search", query: "one" })).toEqual({ ok: false, error: "paused", detail: "Instagram is limiting calls.", until: 1234 });
  });

  it("reads the following list with the background client", async () => {
    const owner = vi.fn();
    const ig: IgClient = { savedPage: unused, collectionsPage: unused, mediaInfo: unused, profileInfo: unused, userFeed: unused, searchUsers: unused, followingPage: owner };
    const followingPage = vi.fn(async () => ({ users: [], next_max_id: null }));
    const send = vi.fn(async (m: RelayMessage) => ({ ok: true, data: m.path.endsWith("/runs") ? { runId: 1 } : { seen: 0 } }) as RelayResponse);
    const jobs = createTabJobs({ ig, backgroundIg: { ...ig, followingPage }, send, viewerId: () => "42" });
    expect(await jobs.handle({ type: "following:update", serverUrl: "http://localhost:4747" })).toEqual({ ok: true });
    await vi.waitFor(() => expect(followingPage).toHaveBeenCalled());
    expect(owner).not.toHaveBeenCalled();
  });
```

In `apps/extension/test/media-fetch.test.ts` add:

```ts
  it("passes on when calls are allowed again", async () => {
    const ig = { mediaInfo: async () => { throw new IgError("budget", "many calls", undefined, 99); } } as unknown as IgClient;
    const send = vi.fn();
    expect(await fetchMedia({ ig, id: "1", serverUrl: "http://localhost:4747", send, store: false })).toEqual({ ok: false, error: "budget", until: 99 });
    expect(send).not.toHaveBeenCalled();
  });
```

(Add `IgError`, `IgClient` and `vi` to that file's imports if they are missing.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run apps/extension`
Expected: FAIL (missing `gate-store`, no `serverUrl` on profile messages, no `ig:status`, no `until`, no `backgroundIg`).

- [ ] **Step 3: Gate store**

Create `apps/extension/src/gate-store.ts`:

```ts
import { GATE_STORAGE_KEY, type GateState, type GateStore } from "@no-fomo/core";

/** The part of `browser.storage.local` the gate needs. */
export type StorageArea = {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};

export async function readGateState(area: StorageArea): Promise<GateState | null> {
  return ((await area.get(GATE_STORAGE_KEY))[GATE_STORAGE_KEY] as GateState | undefined) ?? null;
}

/** Shared by every Instagram tab and kept over reloads, so a stop really holds. */
export function storageGateStore(area: StorageArea): GateStore {
  return {
    load: () => readGateState(area),
    save: (state) => area.set({ [GATE_STORAGE_KEY]: state }),
  };
}
```

- [ ] **Step 4: External messages**

In `apps/extension/src/external.ts`:

```ts
import type { GateStatus, LivePage, LiveProfile, PostMedia, SyncMode, UserSuggestion } from "@no-fomo/core";
import { isAppOrigin } from "./origins";

export type ExtResponse =
  | { ok: true; version?: string; media?: PostMedia; users?: UserSuggestion[]; profile?: LiveProfile; page?: LivePage | null; status?: GateStatus }
  | { ok: false; error: string; detail?: string; until?: number };
/** Every message carries `serverUrl`, so the tab knows where to send its call log. */
export type TabMessage =
  | { type: "sync:run"; serverUrl: string; mode: SyncMode }
  | { type: "media:fetch"; serverUrl: string; id: string; store: boolean }
  | { type: "profile:search"; serverUrl: string; query: string }
  | { type: "profile:open"; serverUrl: string; username: string }
  | { type: "profile:page"; serverUrl: string; cursor: string }
  | { type: "following:update"; serverUrl: string };

export interface ExternalDeps {
  version: string;
  findInstagramTab(): Promise<number | null>;
  openInstagramTab(): Promise<number>;
  sendToTab(tabId: number, msg: TabMessage): Promise<unknown>;
  /** Read from storage; needs no Instagram tab. */
  igStatus(): Promise<GateStatus>;
}
```

In `toTabMessage`, add `serverUrl` to the three profile cases:

```ts
    case "profile:search": {
      const query = typeof m.query === "string" ? m.query.trim() : "";
      return query.length >= 2 && query.length <= 60 ? { type: "profile:search", serverUrl, query } : null;
    }
    case "profile:open":
      return typeof m.username === "string" && USERNAME.test(m.username) ? { type: "profile:open", serverUrl, username: m.username } : null;
    case "profile:page":
      return typeof m.cursor === "string" && CURSOR.test(m.cursor) ? { type: "profile:page", serverUrl, cursor: m.cursor } : null;
```

In `handleExternalMessage`, add `"ig:status"` handling right after the sender checks and before the `TYPES` check is used to build a tab message. The function becomes:

```ts
export async function handleExternalMessage(msg: unknown, senderUrl: string | undefined, deps: ExternalDeps): Promise<ExtResponse> {
  if (typeof msg !== "object" || msg === null) return { ok: false, error: "bad_message" };
  const m = msg as Record<string, unknown>;
  if (m.type === "ping") return { ok: true, version: deps.version };
  if (m.type !== "ig:status" && (typeof m.type !== "string" || !TYPES.has(m.type))) return { ok: false, error: "unknown_type" };
  if (!senderUrl) return { ok: false, error: "no_sender" };
  if (!isAppOrigin(senderUrl)) return { ok: false, error: "untrusted_sender" };
  if (m.type === "ig:status") return { ok: true, status: await deps.igStatus() };

  const tabMsg = toTabMessage(m, new URL(senderUrl).origin);
  if (!tabMsg) return { ok: false, error: "bad_message" };
  const tabId = (await deps.findInstagramTab()) ?? (await deps.openInstagramTab());
  const reply = (await deps.sendToTab(tabId, tabMsg)) as ExtResponse | undefined;
  return reply ?? { ok: false, error: "instagram_tab_failed" };
}
```

- [ ] **Step 5: Tab jobs and media fetch**

In `apps/extension/src/tab-jobs.ts`:

```ts
type Reply = { ok: true; [k: string]: unknown } | { ok: false; error: string; detail?: string; until?: number };

/** The code picks the app's text; the detail says what Instagram answered; `until` says when calls are allowed again. */
const failure = (e: unknown): Reply =>
  e instanceof IgError
    ? { ok: false, error: e.code, detail: e.message, ...(e.until ? { until: e.until } : {}) }
    : { ok: false, error: "internal", detail: (e as Error).message };
```

Change the deps type to `deps: { ig: IgClient; backgroundIg: IgClient; send: (m: RelayMessage) => Promise<RelayResponse>; viewerId: () => string | null }`, and in `startUpdate` use `ig: deps.backgroundIg` for `runFollowingUpdate`. Update the doc comment: "Account pages and search use `ig` (fails at once when calls are limited); the following update uses `backgroundIg` (waits)."

In `apps/extension/src/media-fetch.ts`:

```ts
export type MediaFetchResult = { ok: true; media: PostMedia } | { ok: false; error: string; until?: number };
```

and the catch block:

```ts
  } catch (e) {
    if (e instanceof IgError) return { ok: false, error: e.code, ...(e.until ? { until: e.until } : {}) };
    return { ok: false, error: "internal" };
  }
```

- [ ] **Step 6: Content script, background and manifest**

Replace `apps/extension/entrypoints/instagram.content.ts` with:

```ts
import { createIgClient, createRequestGate, gateClient, runSync, type IgCallLog, type SyncMode } from "@no-fomo/core";
import { storageGateStore } from "../src/gate-store";
import { createRelaySink } from "../src/relay-sink";
import { fetchMedia } from "../src/media-fetch";
import { createTabJobs } from "../src/tab-jobs";
import type { RelayMessage, RelayResponse } from "../src/relay";

type TabMsg = { type?: string; serverUrl?: string; mode?: SyncMode; id?: string; store?: boolean };

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]!) : null;
}
const readCsrf = () => readCookie("csrftoken");

export default defineContentScript({
  matches: ["https://www.instagram.com/*"],
  main() {
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const send = (m: RelayMessage) => browser.runtime.sendMessage(m) as Promise<RelayResponse>;
    /** Where the call log goes: the app that sent the last message. */
    let serverUrl: string | null = null;
    const log = (entry: IgCallLog) => {
      if (serverUrl) void send({ type: "relay", serverUrl, path: "/api/sync/ig-calls", body: entry }).catch(() => {});
    };
    // One gate for every Instagram job. Its state is in browser storage, shared by all Instagram tabs.
    const gate = createRequestGate({ sleep, store: storageGateStore(browser.storage.local) });
    const raw = createIgClient({ fetch: window.fetch.bind(window), csrfToken: readCsrf });
    /** Calls the owner waits for: fail at once when calls are limited. */
    const ig = gateClient(raw, gate, { mode: "fail", log });
    /** Sync and following updates: wait for the hourly limit and go on. */
    const backgroundIg = gateClient(raw, gate, { mode: "wait", log });
    const jobs = createTabJobs({ ig, backgroundIg, send, viewerId: () => readCookie("ds_user_id") });
    let running = false;

    browser.runtime.onMessage.addListener((msg: TabMsg, _sender, sendResponse) => {
      if (typeof msg?.serverUrl === "string") serverUrl = msg.serverUrl;
      const job = jobs.handle(msg);
      if (job) {
        void job.then(sendResponse);
        return true;
      }
      if (typeof msg?.serverUrl !== "string") return;
      if (msg.type === "media:fetch" && typeof msg.id === "string") {
        void fetchMedia({ ig, id: msg.id, serverUrl: msg.serverUrl, send, store: msg.store === true }).then(sendResponse);
        return true;
      }
      if (msg.type !== "sync:run") return;
      if (running) {
        sendResponse({ ok: false, error: "already_running" });
        return;
      }
      running = true;
      sendResponse({ ok: true });
      const sink = createRelaySink(msg.serverUrl, send);
      // The gate spaces requests, so the sync loop adds no pause of its own.
      void runSync({ ig: backgroundIg, sink, sleep, delayMs: () => 0, mode: msg.mode === "full" ? "full" : "incremental" })
        .then((r) => console.info("[no-fomo] sync finished", r))
        .finally(() => { running = false; });
    });
  },
});
```

In `apps/extension/entrypoints/background.ts`:
- change the first import to `import { APP_VERSION, DEFAULT_PORT, gateStatus } from "@no-fomo/core";` and add `import { readGateState } from "../src/gate-store";`;
- add to the deps object passed to `handleExternalMessage`, after `sendToTab,`:

```ts
      igStatus: async () => gateStatus(await readGateState(browser.storage.local), Date.now()),
```

In `apps/extension/wxt.config.ts` change `permissions: ["tabs"]` to `permissions: ["tabs", "storage"]`.

- [ ] **Step 7: Run the tests, typecheck and build**

Run: `pnpm vitest run apps/extension && pnpm typecheck && pnpm ext:build`
Expected: PASS, and the build finishes. If `browser.storage.local` does not match `StorageArea` in typecheck, pass it as `browser.storage.local as unknown as StorageArea` in both places (the WXT type has more overloads than the gate needs).

- [ ] **Step 8: Commit**

```bash
git add apps/extension
git commit -m "feat(extension): gate state in browser storage, ig:status, Instagram call log"
```

---

### Task 5: Web texts and status for Instagram limits

**Files:**
- Create: `apps/web/app/lib/ig-limit.ts`
- Modify: `apps/web/app/lib/extension.ts` (`igStatus`, `ExtResponse`, `loadErrorText`)
- Modify: `apps/web/app/lib/media.ts` (`limited` code)
- Modify: `apps/web/app/lib/report.ts` (`MEDIA_CODES`)
- Test: `apps/web/test/ig-limit.test.ts` (create), `apps/web/test/extension.test.ts`, `apps/web/test/media.test.ts`

**Interfaces:**
- Consumes: `GateStatus` type from `@no-fomo/core`; extension replies with `until` and `status` (Task 4).
- Produces:
  - `type IgLimit = { kind: "paused" | "budget"; until: number; reason: string | null }`
  - `clockTime(ms: number): string` ("15:30")
  - `limitFrom(status: GateStatus | null | undefined, now: number): IgLimit | null`
  - `limitText(kind: "paused" | "budget", until?: number): string`
  - `isLimitCode(code: string): boolean`
  - `igStatus(extensionId: string): Promise<ExtResponse | null>`
  - `loadErrorText(code: string, detail?: string, until?: number): string`
  - `MediaErrorCode` gains `"limited"`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/test/ig-limit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { clockTime, isLimitCode, limitFrom, limitText } from "../app/lib/ig-limit";

const at1530 = new Date(2026, 9, 6, 15, 30).getTime();

describe("Instagram limits", () => {
  it("shows a stop before the hourly limit", () => {
    expect(limitFrom({ pausedUntil: at1530, reason: "slow down", budgetUntil: at1530 + 1 }, at1530 - 1)).toEqual({ kind: "paused", until: at1530, reason: "slow down" });
    expect(limitFrom({ pausedUntil: null, reason: null, budgetUntil: at1530 }, at1530 - 1)).toEqual({ kind: "budget", until: at1530, reason: null });
  });
  it("ignores past times, so the banner goes away by itself", () => {
    expect(limitFrom({ pausedUntil: at1530, reason: "x", budgetUntil: at1530 }, at1530)).toBeNull();
  });
  it("shows nothing when the extension did not answer (old or missing extension)", () => {
    expect(limitFrom(null, 0)).toBeNull();
    expect(limitFrom(undefined, 0)).toBeNull();
  });
  it("says when to try again", () => {
    expect(clockTime(at1530)).toBe("15:30");
    expect(limitText("paused", at1530)).toBe("Instagram is limiting calls. Try again at 15:30.");
    expect(limitText("budget", at1530)).toBe("The app made many Instagram calls this hour. Try again at 15:30.");
    expect(limitText("paused")).toBe("Instagram is limiting calls. Try again later.");
  });
  it("knows the limit codes", () => {
    expect(isLimitCode("paused")).toBe(true);
    expect(isLimitCode("budget")).toBe(true);
    expect(isLimitCode("rate_limited")).toBe(false);
  });
});
```

Append to `apps/web/test/extension.test.ts` (add `igStatus` to the import from `../app/lib/extension`):

```ts
describe("Instagram limits through the extension", () => {
  it("asks the extension for the limit status", async () => {
    const sent: unknown[] = [];
    (globalThis as { chrome?: unknown }).chrome = { runtime: { sendMessage: (_id: string, msg: unknown, cb: (r: unknown) => void) => { sent.push(msg); cb({ ok: true, status: { pausedUntil: null, reason: null, budgetUntil: null } }); } } };
    expect(await igStatus("ext")).toEqual({ ok: true, status: { pausedUntil: null, reason: null, budgetUntil: null } });
    expect(sent).toEqual([{ type: "ig:status" }]);
  });
  it("says when calls are allowed again", () => {
    const at = new Date(2026, 9, 6, 15, 30).getTime();
    expect(loadErrorText("paused", "Instagram is limiting calls. Its answer: x", at)).toBe("Instagram is limiting calls. Try again at 15:30.");
    expect(loadErrorText("budget", undefined, at)).toBe("The app made many Instagram calls this hour. Try again at 15:30.");
  });
});
```

Append to `apps/web/test/media.test.ts` (add `mediaErrorCode, mediaErrorText` to its imports if missing):

```ts
describe("limited media errors", () => {
  it("turns paused and budget into one plain text", () => {
    expect(mediaErrorCode({ ok: false, error: "paused" })).toBe("limited");
    expect(mediaErrorCode({ ok: false, error: "budget" })).toBe("limited");
    expect(mediaErrorText("limited")).toBe("Instagram is limiting calls right now. See the message at the top, then try again.");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run apps/web/test/ig-limit.test.ts apps/web/test/extension.test.ts apps/web/test/media.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `apps/web/app/lib/ig-limit.ts`:

```ts
import type { GateStatus } from "@no-fomo/core";

/** Why calls to Instagram are held back, and until when. */
export type IgLimit = { kind: "paused" | "budget"; until: number; reason: string | null };

export const clockTime = (ms: number) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export const isLimitCode = (code: string) => code === "paused" || code === "budget";

/** Null when nothing holds calls back, or when the extension did not answer. Past times count as over. */
export function limitFrom(status: GateStatus | null | undefined, now: number): IgLimit | null {
  if (status?.pausedUntil && status.pausedUntil > now) return { kind: "paused", until: status.pausedUntil, reason: status.reason };
  if (status?.budgetUntil && status.budgetUntil > now) return { kind: "budget", until: status.budgetUntil, reason: null };
  return null;
}

export function limitText(kind: IgLimit["kind"], until?: number): string {
  const when = until ? `Try again at ${clockTime(until)}.` : "Try again later.";
  return kind === "paused" ? `Instagram is limiting calls. ${when}` : `The app made many Instagram calls this hour. ${when}`;
}
```

In `apps/web/app/lib/extension.ts`:
- `import type { GateStatus, LivePage, LiveProfile, PostMedia, SyncMode, UserSuggestion } from "@no-fomo/core";` and `import { limitText } from "./ig-limit";`
- `ExtResponse` becomes:

```ts
export type ExtResponse =
  | { ok: true; version?: string; media?: PostMedia; users?: UserSuggestion[]; profile?: LiveProfile; page?: LivePage | null; status?: GateStatus }
  | { ok: false; error: string; detail?: string; until?: number };
```

- add after `updateFollowing`:

```ts
/** What holds Instagram calls back. Answered from extension storage, so it is quick. */
export const igStatus = (id: string) => send(id, { type: "ig:status" }, 1500);
```

- `loadErrorText` gets a third parameter and the two limit cases:

```ts
/** `detail`: what Instagram answered. `until`: when calls are allowed again. */
export function loadErrorText(code: string, detail?: string, until?: number): string {
  switch (code) {
    case "paused": return limitText("paused", until);
    case "budget": return limitText("budget", until);
```

(Remove the old `case "paused": return detail ?? …` line; keep every other case.)

In `apps/web/app/lib/media.ts`:
- `export type MediaErrorCode = "no_extension" | "old_extension" | "login_required" | "rate_limited" | "not_found" | "load_failed" | "limited";`
- in `mediaErrorCode` add before `default`:

```ts
    case "paused":
    case "budget":
      return "limited";
```

- in `mediaErrorText` add: `case "limited": return "Instagram is limiting calls right now. See the message at the top, then try again.";`

In `apps/web/app/lib/report.ts` add `"limited"` to `MEDIA_CODES`.

- [ ] **Step 4: Fix existing callers of the old `paused` text**

Run: `grep -rn "loadErrorText(" apps/web/app`. Every call that has a reply in hand passes `reply.until` (or `r.until`) as the third argument, for example `loadErrorText(reply.error, reply.detail, reply.until)`. TypeScript narrows `reply` to the error branch after `!reply.ok`, so `until` is available.

- [ ] **Step 5: Run the web tests and typecheck**

Run: `pnpm vitest run apps/web && pnpm typecheck`
Expected: PASS. If an older test in `extension.test.ts` expected the old `paused` text, change its expected value to the new `limitText` output.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): plain texts and status for Instagram limits"
```

---

### Task 6: Banner on every tab, Sync off while limited

**Files:**
- Create: `apps/web/app/components/ig-limit.tsx`
- Modify: `apps/web/app/components/top-bar.tsx`
- Modify: `apps/web/app/components/sync-control.tsx`

**Interfaces:**
- Consumes: `igStatus`, `limitFrom`, `limitText`, `IgLimit` (Task 5); `useExtension` from `apps/web/app/components/profiles/use-extension.ts` (moved in Task 7; import from its current path here).
- Produces: `useIgLimit(): IgLimit | null`, `<IgLimitBanner />`, query key `["ig-status"]` (prefix), `refreshIgLimit(qc: QueryClient): void`.

This task is UI wiring with no new logic (the logic is tested in Task 5). Check it by eye in Step 4.

- [ ] **Step 1: Hook and banner**

Create `apps/web/app/components/ig-limit.tsx`:

```tsx
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { igStatus } from "../lib/extension";
import { limitFrom, limitText, type IgLimit } from "../lib/ig-limit";
import { useExtension } from "./profiles/use-extension";

/** Ask again now, for example right after an action answered `paused` or `budget`. */
export const refreshIgLimit = (qc: QueryClient) => void qc.invalidateQueries({ queryKey: ["ig-status"] });

/** What holds Instagram calls back right now. Checked every 30 s from extension storage (no Instagram call). */
export function useIgLimit(): IgLimit | null {
  const ext = useExtension();
  const status = useQuery({
    queryKey: ["ig-status", ext.extensionId],
    queryFn: () => igStatus(ext.extensionId!),
    enabled: ext.ready,
    refetchInterval: 30_000,
  });
  const reply = status.data;
  return limitFrom(reply?.ok ? reply.status : null, Date.now());
}

export function IgLimitBanner() {
  const limit = useIgLimit();
  if (!limit) return null;
  return (
    <div role="status" aria-live="polite" className="border-t border-line bg-surface">
      <p className="mx-auto max-w-[1600px] px-4 py-2 text-[13px] text-danger md:px-6" title={limit.reason ?? undefined}>
        {limitText(limit.kind, limit.until)}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Top bar**

In `apps/web/app/components/top-bar.tsx` import `{ IgLimitBanner } from "./ig-limit"` and render `<IgLimitBanner />` as the last child of `<header>`, after the inner `<div>`.

- [ ] **Step 3: Sync button**

In `apps/web/app/components/sync-control.tsx`:
- import `{ refreshIgLimit, useIgLimit } from "./ig-limit"`;
- after `const ext = useQuery(…)` add `const limit = useIgLimit();`;
- change `const disabled = running || starting || !ext.data?.ok;` to `const disabled = running || starting || !ext.data?.ok || !!limit;`;
- in the `useEffect` that runs when `running` turns false, add `refreshIgLimit(qc);` so a sync that ended on a refusal shows the banner at once.

- [ ] **Step 4: Check by eye**

Run: `pnpm typecheck && pnpm vitest run apps/web`
Expected: PASS.

Then, in the worktree, build and start against a copy of the data so the owner's app is not touched:

```bash
pnpm ext:build
NO_FOMO_HOME=$(mktemp -d) NO_FOMO_PORT=4848 pnpm start
```

You cannot open the extension's storage from here, so leave the visual check of the banner to the manual check in Task 9.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): Instagram limit banner on every tab; Sync off while limited"
```

---

### Task 7: Home tab with search on Enter and the following list

**Files:**
- Create: `apps/web/app/lib/home-url.ts`
- Create: `apps/web/app/routes/home.tsx`
- Move: `apps/web/app/components/profiles/` → `apps/web/app/components/home/` (`git mv`)
- Modify: `apps/web/app/components/home/profile-search.tsx` (rewrite)
- Modify: `apps/web/app/components/home/following-list.tsx`
- Modify: `apps/web/app/routes.ts`, `apps/web/app/components/nav-tabs.tsx`, `apps/web/app/components/ig-limit.tsx` (import path)
- Delete: `apps/web/app/routes/profiles.tsx`
- Test: `apps/web/test/home-url.test.ts` (create)

**Interfaces:**
- Consumes: `useIgLimit`, `refreshIgLimit` (Task 6); `loadErrorText(code, detail, until)`, `isLimitCode` (Task 5); `LIVE_LIST_OPTIONS` (`lib/live-pages.ts`); `parseProfileInput` (`lib/profile-input.ts`).
- Produces:
  - `withParam(params: URLSearchParams, key: string, value: string | null): URLSearchParams`
  - `accountSearch(params: URLSearchParams, username: string): string` (`"?…"`)
  - `backSearch(params: URLSearchParams): string`
  - `type SearchAction = { open: string } | { find: string } | null`; `searchAction(text: string): SearchAction`
  - Route `routes/home.tsx` at `/`. It renders `<AccountView username=… />` from `../components/home/account-view` when `?account=` holds a valid username (Task 8 creates that file; until then, render a placeholder `<p>` — see Step 6).

- [ ] **Step 1: Write the failing tests**

Create `apps/web/test/home-url.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { accountSearch, backSearch, searchAction, withParam } from "../app/lib/home-url";

describe("Home URL state", () => {
  it("opens an account and comes back with the search kept", () => {
    const p = new URLSearchParams("q=nas&find=nas&post=9");
    expect(accountSearch(p, "nasa")).toBe("?q=nas&find=nas&account=nasa");
    expect(backSearch(new URLSearchParams("q=nas&find=nas&account=nasa&post=9"))).toBe("?q=nas&find=nas");
  });
  it("sets and clears one parameter", () => {
    expect(withParam(new URLSearchParams("a=1"), "b", "2").toString()).toBe("a=1&b=2");
    expect(withParam(new URLSearchParams("a=1&b=2"), "b", null).toString()).toBe("a=1");
  });
});

describe("searchAction (Enter in the Home search box)", () => {
  it("opens a profile link or an @username directly", () => {
    expect(searchAction("https://www.instagram.com/nasa/")).toEqual({ open: "nasa" });
    expect(searchAction("@NASA")).toEqual({ open: "nasa" });
  });
  it("searches Instagram for other text of 2 to 60 letters", () => {
    expect(searchAction("  natgeo ")).toEqual({ find: "natgeo" });
    expect(searchAction("national geographic")).toEqual({ find: "national geographic" });
    expect(searchAction("n")).toBeNull();
    expect(searchAction("a".repeat(61))).toBeNull();
  });
  it("does nothing for links that are not accounts", () => {
    expect(searchAction("https://www.instagram.com/p/C1/")).toBeNull();
    expect(searchAction("@")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run apps/web/test/home-url.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: URL helpers**

Create `apps/web/app/lib/home-url.ts`:

```ts
import { parseProfileInput } from "./profile-input";

/**
 * Home keeps its state in the URL, so Back and reloads show the same thing without asking Instagram again:
 * `q` the search text, `find` the Instagram search sent with Enter, `account` the open account, `post` the open post.
 */
export function withParam(params: URLSearchParams, key: string, value: string | null): URLSearchParams {
  const next = new URLSearchParams(params);
  if (value) next.set(key, value);
  else next.delete(key);
  return next;
}

export const accountSearch = (params: URLSearchParams, username: string) => `?${withParam(withParam(params, "post", null), "account", username)}`;
export const backSearch = (params: URLSearchParams) => `?${withParam(withParam(params, "post", null), "account", null)}`;

export type SearchAction = { open: string } | { find: string } | null;

/** Enter in the search box: a profile link or @username opens the account; other text searches Instagram once. */
export function searchAction(text: string): SearchAction {
  const t = text.trim();
  if (/instagram\.com/i.test(t) || t.startsWith("@")) {
    const name = parseProfileInput(t);
    return name ? { open: name } : null;
  }
  return t.length >= 2 && t.length <= 60 ? { find: t } : null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run apps/web/test/home-url.test.ts`
Expected: PASS.

- [ ] **Step 5: Move the components folder**

```bash
git mv apps/web/app/components/profiles apps/web/app/components/home
```

Update imports: in `apps/web/app/components/ig-limit.tsx` use `./home/use-extension`; run `grep -rn "components/profiles\|./profiles/" apps/web/app` and fix every hit.

- [ ] **Step 6: Search box (rewrite) and following list**

Replace `apps/web/app/components/home/profile-search.tsx` with:

```tsx
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckmarkBadge01Icon, Search01Icon, SquareLock02Icon } from "@hugeicons/core-free-icons";
import type { UserSuggestion } from "@no-fomo/core";
import { loadErrorText, searchInstagram } from "../../lib/extension";
import { isLimitCode } from "../../lib/ig-limit";
import { LIVE_LIST_OPTIONS } from "../../lib/live-pages";
import { searchAction, type SearchAction } from "../../lib/home-url";
import { refreshIgLimit } from "../ig-limit";
import { Avatar } from "../avatar";
import { Icon } from "../ui/icon";

/**
 * Typing filters the list of people you follow (stored, no Instagram call).
 * Enter searches all of Instagram once, or opens a profile link or @username directly.
 */
export function ProfileSearch(props: {
  text: string;
  onTextChange: (t: string) => void;
  /** The Instagram search sent with Enter, from the URL. */
  find: string | null;
  onAction: (a: NonNullable<SearchAction>) => void;
  accountHref: (username: string) => string;
  extensionId: string | undefined;
  ready: boolean;
  limited: boolean;
}) {
  const qc = useQueryClient();
  const ig = useQuery({
    queryKey: ["ig-search", props.find],
    queryFn: async (): Promise<UserSuggestion[]> => {
      const r = await searchInstagram(props.extensionId!, props.find!);
      if (!r) throw new Error(loadErrorText("no_extension"));
      if (!r.ok) {
        if (isLimitCode(r.error)) refreshIgLimit(qc);
        throw new Error(loadErrorText(r.error, r.detail, r.until));
      }
      return r.users ?? [];
    },
    enabled: props.ready && !!props.find,
    ...LIVE_LIST_OPTIONS,
  });
  const action = searchAction(props.text);

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!action || ("find" in action && props.limited)) return;
          props.onAction(action);
        }}
        className="relative"
      >
        <Icon icon={Search01Icon} size={18} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={props.text}
          onChange={(e) => props.onTextChange(e.target.value)}
          placeholder="Find an account: name, @username or profile link"
          aria-label="Find an Instagram account"
          autoComplete="off"
          spellCheck={false}
          className="h-11 w-full rounded-control border border-line bg-surface ps-11 pe-3 text-[15px] text-text placeholder:text-muted focus-visible:border-accent-line focus-visible:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-search-cancel-button]:hidden"
        />
      </form>
      {props.text.trim() && !props.find && action && (
        <p className="mt-2 text-[13px] text-muted">
          {"open" in action ? `Press Enter to open @${action.open}.` : "Press Enter to search all of Instagram."}
        </p>
      )}
      {props.find && (
        <section aria-label="All Instagram" className="mt-3 rounded-control border border-line p-2">
          <h3 className="px-2.5 pb-1 text-[12px] font-medium uppercase tracking-wide text-muted">All Instagram</h3>
          {!props.ready ? (
            <p className="px-2.5 py-2 text-[13px] text-muted">Needs the no-fomo extension.</p>
          ) : ig.isFetching ? (
            <p className="px-2.5 py-2 text-[13px] text-muted">Searching Instagram…</p>
          ) : ig.isError ? (
            <p className="px-2.5 py-2 text-[13px] text-danger">{(ig.error as Error).message}</p>
          ) : ig.data?.length ? (
            <ul>
              {ig.data.slice(0, 8).map((u) => (
                <li key={u.id}>
                  <Link
                    to={props.accountHref(u.username)}
                    className="flex items-center gap-3 rounded-[6px] px-2.5 py-2 hover:bg-surface focus-visible:bg-surface focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <Avatar src={u.avatarUrl} name={u.username} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 truncate text-[14px]">
                        @{u.username}
                        {u.isVerified && <Icon icon={CheckmarkBadge01Icon} size={14} className="text-accent" />}
                        {u.isPrivate && <Icon icon={SquareLock02Icon} size={14} className="text-muted" />}
                      </span>
                      {u.fullName && <span className="block truncate text-[12px] text-muted">{u.fullName}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2.5 py-2 text-[13px] text-muted">No accounts found.</p>
          )}
        </section>
      )}
    </div>
  );
}
```

In `apps/web/app/components/home/following-list.tsx`:
- add props `limited: boolean` and `accountHref: (username: string) => string`;
- the row link becomes `to={props.accountHref(f.username)}`;
- the button becomes `disabled={!props.ready || running || props.limited}`;
- the first-load text becomes: "Load the list of accounts you follow once, so you can open them here without searching Instagram. It takes about 2 minutes for 1,000 accounts."

- [ ] **Step 7: Home route, routes and tabs**

Create `apps/web/app/routes/home.tsx`:

```tsx
import { useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { loadErrorText, updateFollowing } from "../lib/extension";
import { accountSearch, withParam } from "../lib/home-url";
import { isLimitCode } from "../lib/ig-limit";
import { parseProfileInput } from "../lib/profile-input";
import { TopBar } from "../components/top-bar";
import { SetupSteps } from "../components/setup-steps";
import { ProfileSearch } from "../components/home/profile-search";
import { FollowingList } from "../components/home/following-list";
import { useExtension } from "../components/home/use-extension";
import { refreshIgLimit, useIgLimit } from "../components/ig-limit";

export default function Home() {
  const [params] = useSearchParams();
  const raw = params.get("account");
  const username = raw ? parseProfileInput(raw) : null;
  // Task 8 replaces this line with: return username ? <AccountView key={username} username={username} /> : <HomeList />;
  return username ? <p className="p-6">@{username}</p> : <HomeList />;
}

/** Search and the people you follow. */
function HomeList() {
  const [params, setParams] = useSearchParams();
  const ext = useExtension();
  const limit = useIgLimit();
  const qc = useQueryClient();
  const [listError, setListError] = useState<string | null>(null);
  const text = params.get("q") ?? "";
  const find = params.get("find");
  const filter = text.trim() && !/instagram\.com/i.test(text) ? text.trim().replace(/^@/, "") : null;
  const following = useQuery({
    queryKey: ["following", filter],
    queryFn: () => api.following(filter),
    placeholderData: (prev) => prev,
    refetchInterval: (q) => (q.state.data?.run?.status === "running" ? 1000 : false),
  });
  const href = (username: string) => accountSearch(params, username);

  async function updateList() {
    setListError(null);
    const reply = ext.extensionId ? await updateFollowing(ext.extensionId) : null;
    if (!reply) setListError(loadErrorText("no_extension"));
    else if (!reply.ok) {
      if (isLimitCode(reply.error)) refreshIgLimit(qc);
      setListError(loadErrorText(reply.error, reply.detail, reply.until));
    }
    await qc.invalidateQueries({ queryKey: ["following"] });
  }

  return (
    <>
      <TopBar search={null} />
      <main className="mx-auto max-w-[1100px] px-4 pb-16 pt-6 md:px-6">
        <h1 className="sr-only">Home</h1>
        {ext.missing && (
          <section className="mb-6 rounded-control border border-line p-4">
            <h2 className="text-[15px] font-semibold">The no-fomo extension is needed to open accounts</h2>
            <SetupSteps />
          </section>
        )}
        <ProfileSearch
          text={text}
          onTextChange={(t) => setParams(withParam(withParam(params, "find", null), "q", t || null), { replace: true })}
          find={find}
          onAction={(a) => setParams("open" in a ? new URLSearchParams(href(a.open)) : withParam(params, "find", a.find))}
          accountHref={href}
          extensionId={ext.extensionId}
          ready={ext.ready}
          limited={!!limit}
        />
        <FollowingList page={following.data} filtered={!!filter} ready={ext.ready} limited={!!limit} error={listError} onUpdate={() => void updateList()} accountHref={href} />
      </main>
    </>
  );
}
```

Replace `apps/web/app/routes.ts` with:

```ts
import { index, layout, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  layout("routes/shell.tsx", [
    index("routes/home.tsx"),
    route("saved", "routes/saved.tsx"),
    route("reports", "routes/reports.tsx"),
  ]),
] satisfies RouteConfig;
```

In `apps/web/app/components/nav-tabs.tsx` replace `TABS` with:

```ts
const TABS = [
  { to: "/", label: "Home", end: true },
  { to: "/saved", label: "Saved", end: false },
  { to: "/reports", label: "Reports", end: false },
] as const;
```

Delete `apps/web/app/routes/profiles.tsx` (`git rm`). Leave `routes/profile.tsx` for Task 8, but remove it from `routes.ts` now (done above); if typecheck complains about its imports from `components/profiles`, fix the import paths to `components/home` so it still compiles.

- [ ] **Step 8: Run tests and typecheck**

Run: `pnpm vitest run apps/web && pnpm typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A apps/web
git commit -m "feat(web): Home tab with search on Enter and the following list; Saved moves to /saved"
```

---

### Task 8: Account posts inside Home with Load more

**Files:**
- Create: `apps/web/app/components/home/account-view.tsx` (from `apps/web/app/routes/profile.tsx`)
- Modify: `apps/web/app/routes/home.tsx` (render `AccountView`)
- Modify: `apps/web/app/lib/live-filter.ts` (remove `filterLive`), `apps/web/test/live-filter.test.ts` (remove its tests)
- Modify: `apps/web/app/components/filter-bar.tsx` (remove the `"profile"` scope)
- Delete: `apps/web/app/routes/profile.tsx`

**Interfaces:**
- Consumes: `backSearch` (Task 7); `useIgLimit`, `refreshIgLimit` (Task 6); `isLimitCode`, `loadErrorText(…, until)` (Task 5); `usePostList`, `LIVE_LIST_OPTIONS`, `listBody`, `uniqueById`, `PostGrid`, `Viewer`, `api.known`.
- Produces: `AccountView({ username }: { username: string })`.

- [ ] **Step 1: Create the account view**

```bash
git mv apps/web/app/routes/profile.tsx apps/web/app/components/home/account-view.tsx
```

Then edit `account-view.tsx`:

1. Rename `export default function Profile()` to `export function AccountView({ username }: { username: string })`. Remove `useParams` and the `const { username = "" } = useParams();` line.
2. Remove filters: delete the `filters`, `update`, `filtering`, `search` constants, the `FilterBar` and the "Filters look at the … posts loaded so far" block, and the imports of `NO_FILTERS, readFilters, writeFilters, type Filters`, `filterLive`, `FilterBar`. Keep `uniqueById`.
3. In `usePostList`: `autoLoad: false`, `view: (posts) => uniqueById(posts)`. In `fetchPage`, on `!reply.ok`:

```ts
      if (!reply.ok) {
        if (isLimitCode(reply.error)) refreshIgLimit(qc);
        throw new Error(loadErrorText(reply.error, reply.detail, reply.until));
      }
```

   with `const qc = useQueryClient();` and `const limit = useIgLimit();` at the top of the component, and imports `useQueryClient` from `@tanstack/react-query`, `isLimitCode` from `../../lib/ig-limit`, `refreshIgLimit, useIgLimit` from `../ig-limit`.
4. The grid: `<PostGrid query={list.query} items={list.items.map(mark)} filters={NO_FILTERS} onOpen={(id) => list.setPost(id)} onClearFilters={() => {}} autoLoad={false} nextErrorText={…} empty={…} />` (import `NO_FILTERS` from `../../lib/filters` for this prop only), followed by:

```tsx
        {list.query.hasNextPage && !list.query.isFetchNextPageError && (
          <div className="mt-6 flex justify-center">
            <Button onClick={() => void list.query.fetchNextPage()} disabled={list.query.isFetchingNextPage || !!limit}>
              {list.query.isFetchingNextPage ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
```

5. Header Back link: `const [params] = useSearchParams();` and `<Link to={{ search: backSearch(params) }} aria-label="Back to Home" className={buttonClass("ghost", "", "icon")}>`. Import `backSearch` from `../../lib/home-url`.
6. `<TopBar search={null} />`.
7. Fix the relative import paths: the file moved from `app/routes/` to `app/components/home/`, so `../lib/…` becomes `../../lib/…`, `../components/x` becomes `../x`, and `../components/profiles/use-extension` becomes `./use-extension`.

In `apps/web/app/routes/home.tsx` replace the placeholder line with:

```tsx
  return username ? <AccountView key={username} username={username} /> : <HomeList />;
```

and add `import { AccountView } from "../components/home/account-view";`.

- [ ] **Step 2: Remove dead code**

- `apps/web/app/lib/live-filter.ts`: delete `filterLive` (keep `uniqueById`). In `apps/web/test/live-filter.test.ts` delete the `describe` blocks that test `filterLive`.
- `apps/web/app/components/filter-bar.tsx`: change `scope: "saved" | "profile" | "reports"` to `scope: "saved" | "reports"`, drop `enabled: scope !== "profile"` from the authors query, and remove the `scope !== "profile" &&` condition (render that part always).
- Run `grep -rn "filterLive\|\"profile\"" apps/web/app` — expected: no hits for `filterLive`; the only `"profile"` hits are unrelated (for example a message type).

- [ ] **Step 3: Run tests, typecheck and build the web app**

Run: `pnpm vitest run apps/web && pnpm typecheck && pnpm --filter @no-fomo/web build`
Expected: PASS, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add -A apps/web
git commit -m "feat(web): account posts inside Home with Load more; drop the account page and its filters"
```

---

### Task 9: Full check and the owner's manual run

**Files:**
- Modify: `docs/superpowers/specs/2026-10-05-profiles-reports-design.md` only if the build differs from it (say what and why in the commit).

- [ ] **Step 1: Whole suite**

Run: `pnpm test && pnpm typecheck && pnpm ext:build && pnpm --filter @no-fomo/web build`
Expected: all pass.

- [ ] **Step 2: Hand the manual check to the owner**

The owner runs the app; do not start it on :4747 yourself. Tell the owner, in plain short English:

1. In the main folder, stop the running app. Then in `no-fomo-profiles`: `pnpm ext:build`, then press **Reload** for no-fomo on `chrome://extensions` (Chrome asks to allow "storage"), then `pnpm start`.
2. Home: type a name, press Enter, open an account, press **Load more**, open a post and play it, press **Back** (the search is still there).
3. Analyze a post from an account. Open **Reports**: the report is there.
4. **Saved**: Sync works. A saved post with a report shows it.
5. Phone width: the three tabs fit.

To force the banner for a quick look (optional): in the Instagram tab's DevTools console of the extension's content script context, run `chrome.storage.local.set({ igGate: { calls: [], stopUntil: Date.now() + 120000, stopReason: "test", refusals: 1 } })`, wait up to 30 s, see the banner, then `chrome.storage.local.remove("igGate")`.

- [ ] **Step 3: If the owner sees a refusal again**

Read the log: `sqlite3 ~/.no-fomo/no-fomo.db "select datetime(at/1000,'unixepoch','localtime'), kind, status, result, ms from ig_calls order by id desc limit 50"` and report which calls came before the refusal.
