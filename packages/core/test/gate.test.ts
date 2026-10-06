import { describe, expect, it } from "vitest";
import { IgError, type IgClient } from "../src/ig/client";
import { callLogEntry, createRequestGate, gateClient, gateStatus, memoryGateStore, STOP_STEPS_MS, type GateStore, type IgCallLog } from "../src/ig/gate";

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
