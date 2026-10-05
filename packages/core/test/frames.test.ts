import { describe, expect, it } from "vitest";
import { candidateTimes, carouselVideoCap, dropNearDuplicates, frameCap, spreadEvenly } from "../src/analyze/frames";

describe("frameCap", () => {
  it("grows with length", () => {
    expect([5, 30, 31, 60, 61, 180, 181, 900].map(frameCap)).toEqual([30, 30, 40, 40, 60, 60, 80, 80]);
  });
});

describe("spreadEvenly", () => {
  it("keeps everything when under the cap", () => {
    expect(spreadEvenly([1, 2, 3], 5)).toEqual([1, 2, 3]);
  });
  it("keeps the first and last and spreads the rest", () => {
    expect(spreadEvenly([0, 1, 2, 3, 4, 5, 6, 7, 8], 3)).toEqual([0, 4, 8]);
    expect(spreadEvenly([0, 1, 2], 1)).toEqual([0]);
    expect(spreadEvenly([0, 1, 2], 0)).toEqual([]);
  });
});

describe("candidateTimes", () => {
  it("uses scene changes plus the first frame when there are enough", () => {
    const scenes = Array.from({ length: 12 }, (_, i) => i + 0.5);
    expect(candidateTimes(20, scenes, 30)).toEqual([0, ...scenes]);
  });
  it("fills with even samples when scenes are few, at most 2 per second", () => {
    const t = candidateTimes(4, [1.1], 30);
    expect(t[0]).toBe(0);
    expect(t).toContain(1.1);
    expect(t.length).toBeLessThanOrEqual(9);
    expect(t.length).toBeGreaterThanOrEqual(7);
    expect([...t].sort((a, b) => a - b)).toEqual(t);
  });
  it("drops times closer than 0.25 s and times at or past the end", () => {
    expect(candidateTimes(10, [0.1, 3, 3.2, 9.99, 12], 3)).not.toContain(3.2);
    expect(candidateTimes(10, [0.1, 3, 3.2, 9.99, 12], 3).every((x) => x < 9.95)).toBe(true);
  });
  it("never returns more than 3 times the cap", () => {
    const scenes = Array.from({ length: 500 }, (_, i) => i * 0.5 + 0.3);
    expect(candidateTimes(300, scenes, 80).length).toBe(240);
  });
  it("handles a zero-length video", () => {
    expect(candidateTimes(0, [], 30)).toEqual([0]);
  });
});

describe("dropNearDuplicates", () => {
  const px = (v: number) => new Uint8Array(768).fill(v);
  it("drops frames that look like the last kept one", () => {
    expect(dropNearDuplicates([px(10), px(12), px(40), px(43), px(10)])).toEqual([0, 2, 4]);
  });
  it("keeps an empty list empty", () => {
    expect(dropNearDuplicates([])).toEqual([]);
  });
});

describe("carouselVideoCap", () => {
  it("gives each video at most 10 frames and keeps the total at 40", () => {
    expect(carouselVideoCap(3, 2)).toBe(10);
    expect(carouselVideoCap(5, 5)).toBe(7);
    expect(carouselVideoCap(19, 1)).toBe(10);
    expect(carouselVideoCap(4, 0)).toBe(0);
    expect(carouselVideoCap(0, 20)).toBe(2);
  });
});
