import { describe, expect, it } from "vitest";
import { IgError } from "../src/ig/client";
import { createRequestGate } from "../src/ig/gate";

function clock() {
  let t = 1_000_000;
  const sleeps: number[] = [];
  return {
    now: () => t,
    advance: (ms: number) => { t += ms; },
    sleeps,
    sleep: async (ms: number) => { sleeps.push(ms); t += ms; },
  };
}

describe("request gate", () => {
  it("lets the first call through at once and spaces the next ones", async () => {
    const c = clock();
    const gate = createRequestGate({ sleep: c.sleep, now: c.now, gapMs: () => 2500 });
    await gate.run(async () => 1);
    c.advance(500);
    await gate.run(async () => 2);
    expect(c.sleeps).toEqual([2000]);
  });

  it("runs calls one at a time, in order", async () => {
    const c = clock();
    const gate = createRequestGate({ sleep: c.sleep, now: c.now, gapMs: () => 2500 });
    const order: string[] = [];
    const slow = gate.run(async () => { order.push("a:start"); await Promise.resolve(); order.push("a:end"); });
    const fast = gate.run(async () => { order.push("b"); });
    await Promise.all([slow, fast]);
    expect(order).toEqual(["a:start", "a:end", "b"]);
    expect(c.sleeps).toEqual([2500]);
  });

  it("blocks every call for 10 minutes after Instagram asks to slow down", async () => {
    const c = clock();
    const gate = createRequestGate({ sleep: c.sleep, now: c.now, gapMs: () => 0 });
    await expect(gate.run(async () => { throw new IgError("rate_limited", "slow"); })).rejects.toMatchObject({ code: "rate_limited" });
    let called = false;
    await expect(gate.run(async () => { called = true; })).rejects.toMatchObject({ code: "rate_limited" });
    expect(called).toBe(false);
    c.advance(10 * 60_000);
    await gate.run(async () => { called = true; });
    expect(called).toBe(true);
  });

  it("a failed call does not jam the queue", async () => {
    const c = clock();
    const gate = createRequestGate({ sleep: c.sleep, now: c.now, gapMs: () => 0 });
    await expect(gate.run(async () => { throw new Error("network"); })).rejects.toThrow("network");
    await expect(gate.run(async () => "ok")).resolves.toBe("ok");
  });
});
