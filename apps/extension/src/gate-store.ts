import { GATE_STORAGE_KEY, type GateState, type GateStore } from "@no-fomo-social/core";

/** The part of `browser.storage.local` the gate needs. */
export type StorageArea = {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};

export async function readGateState(area: StorageArea): Promise<GateState | null> {
  return ((await area.get(GATE_STORAGE_KEY))[GATE_STORAGE_KEY] as GateState | undefined) ?? null;
}

/** The Web Locks API. Instagram tabs share one origin, so they share these locks. */
export type LockManagerLike = { request<T>(name: string, fn: () => Promise<T>): Promise<T> };

/**
 * Shared by every Instagram tab and kept over reloads, so a stop really holds.
 * Changes run under one lock, so a tab never writes over a stop another tab just saved.
 */
export function storageGateStore(area: StorageArea, locks: LockManagerLike | undefined = globalThis.navigator?.locks): GateStore {
  return {
    load: () => readGateState(area),
    save: (state) => area.set({ [GATE_STORAGE_KEY]: state }),
    lock: (fn) => (locks ? locks.request("no-fomo-ig-gate", fn) : fn()),
  };
}
