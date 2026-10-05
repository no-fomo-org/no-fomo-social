import { describe, expect, it } from "vitest";
import { loadPosition, loadVolume, MAX_POSITIONS, resumeAt, savePosition, saveVolume, type PrefStore } from "../app/lib/player-prefs";

function memory(): PrefStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } };
}
const broken: PrefStore = {
  getItem: () => { throw new Error("SecurityError"); },
  setItem: () => { throw new Error("QuotaExceededError"); },
};

describe("player prefs", () => {
  it("remembers positions per post", () => {
    const s = memory();
    savePosition(s, "1", 42.5);
    expect(loadPosition(s, "1")).toBe(42.5);
    expect(loadPosition(s, "2")).toBeNull();
  });

  it("keeps only the newest 500 positions", () => {
    const s = memory();
    for (let i = 0; i < MAX_POSITIONS + 10; i++) savePosition(s, String(i), 10, i);
    expect(loadPosition(s, "0")).toBeNull();
    expect(loadPosition(s, "9")).toBeNull();
    expect(loadPosition(s, "10")).toBe(10);
    expect(Object.keys(JSON.parse(s.data.get("nf:positions")!))).toHaveLength(MAX_POSITIONS);
  });

  it("resumes only from the middle of a video", () => {
    expect(resumeAt(null, 60)).toBeNull();
    expect(resumeAt(4, 60)).toBeNull();
    expect(resumeAt(30, 60)).toBe(30);
    expect(resumeAt(56, 60)).toBeNull();
    expect(resumeAt(30, Number.NaN)).toBeNull();
  });

  it("remembers volume and mute", () => {
    const s = memory();
    expect(loadVolume(s)).toEqual({ volume: 1, muted: false });
    saveVolume(s, { volume: 0.4, muted: true });
    expect(loadVolume(s)).toEqual({ volume: 0.4, muted: true });
  });

  it("never throws on blocked storage or garbage", () => {
    expect(() => savePosition(broken, "1", 5)).not.toThrow();
    expect(loadPosition(broken, "1")).toBeNull();
    expect(loadVolume(broken)).toEqual({ volume: 1, muted: false });
    expect(() => saveVolume(broken, { volume: 1, muted: false })).not.toThrow();
    const s = memory();
    s.data.set("nf:positions", "[1,2");
    s.data.set("nf:volume", "null");
    expect(loadPosition(s, "1")).toBeNull();
    expect(loadVolume(s)).toEqual({ volume: 1, muted: false });
    s.data.set("nf:positions", "[1,2]");
    savePosition(s, "1", 7);
    expect(loadPosition(s, "1")).toBe(7);
    s.data.set("nf:volume", JSON.stringify({ volume: 9, muted: "yes" }));
    expect(loadVolume(s)).toEqual({ volume: 1, muted: false });
  });
});
