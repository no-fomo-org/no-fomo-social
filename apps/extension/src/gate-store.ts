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
