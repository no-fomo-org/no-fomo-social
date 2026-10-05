export type PrefStore = Pick<Storage, "getItem" | "setItem">;

const POSITIONS_KEY = "nf:positions";
const VOLUME_KEY = "nf:volume";
export const MAX_POSITIONS = 500;
/** Do not resume from the first or last few seconds. */
const EDGE_SEC = 5;

type Positions = Record<string, { t: number; at: number }>;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Storage can be missing, blocked or full. Playback must never fail because of it. */
function read(store: PrefStore | null, key: string): unknown {
  try {
    const raw = store?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(store: PrefStore | null, key: string, value: unknown) {
  try {
    store?.setItem(key, JSON.stringify(value));
  } catch {
    // Not worth interrupting the video for.
  }
}

export function browserStore(): PrefStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function positions(store: PrefStore | null): Positions {
  const v = read(store, POSITIONS_KEY);
  return isRecord(v) ? (v as Positions) : {};
}

export function loadPosition(store: PrefStore | null, id: string): number | null {
  const t = positions(store)[id]?.t;
  return typeof t === "number" && Number.isFinite(t) ? t : null;
}

export function savePosition(store: PrefStore | null, id: string, t: number, now = Date.now()) {
  if (!Number.isFinite(t)) return;
  const all = positions(store);
  all[id] = { t, at: now };
  const ids = Object.keys(all);
  if (ids.length > MAX_POSITIONS) {
    ids
      .sort((x, y) => (all[x]?.at ?? 0) - (all[y]?.at ?? 0))
      .slice(0, ids.length - MAX_POSITIONS)
      .forEach((k) => delete all[k]);
  }
  write(store, POSITIONS_KEY, all);
}

export function resumeAt(saved: number | null, duration: number): number | null {
  if (saved === null || !Number.isFinite(duration) || duration <= 0) return null;
  return saved > EDGE_SEC && saved < duration - EDGE_SEC ? saved : null;
}

export function loadVolume(store: PrefStore | null): { volume: number; muted: boolean } {
  const v = read(store, VOLUME_KEY);
  const r = isRecord(v) ? v : {};
  const volume = typeof r.volume === "number" && r.volume >= 0 && r.volume <= 1 ? r.volume : 1;
  return { volume, muted: r.muted === true };
}

export function saveVolume(store: PrefStore | null, v: { volume: number; muted: boolean }) {
  write(store, VOLUME_KEY, v);
}
