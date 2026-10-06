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

  it("runs changes under one browser lock shared by all Instagram tabs", async () => {
    const names: string[] = [];
    const locks = { request: async <T>(name: string, fn: () => Promise<T>) => { names.push(name); return fn(); } };
    const store = storageGateStore(fakeArea(), locks);
    expect(await store.lock!(async () => 7)).toBe(7);
    expect(names).toEqual(["no-fomo-ig-gate"]);
  });
});
