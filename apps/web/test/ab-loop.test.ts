import { describe, expect, it } from "vitest";
import { AB_OFF, abJump, abLabel, pressAb } from "../app/lib/ab-loop";

describe("A-B loop", () => {
  it("sets A, then B, then clears", () => {
    const a = pressAb(AB_OFF, 3);
    expect(a).toEqual({ a: 3, b: null });
    const ab = pressAb(a, 8);
    expect(ab).toEqual({ a: 3, b: 8 });
    expect(pressAb(ab, 9)).toEqual(AB_OFF);
  });

  it("swaps when B is before A and ignores a loop under half a second", () => {
    expect(pressAb({ a: 8, b: null }, 3)).toEqual({ a: 3, b: 8 });
    expect(pressAb({ a: 8, b: null }, 8.2)).toEqual(AB_OFF);
  });

  it("jumps back to A once playback reaches B", () => {
    expect(abJump({ a: 3, b: 8 }, 7.9)).toBeNull();
    expect(abJump({ a: 3, b: 8 }, 8)).toBe(3);
    expect(abJump({ a: 3, b: null }, 100)).toBeNull();
    expect(abJump(AB_OFF, 100)).toBeNull();
  });

  it("names the next press", () => {
    expect(abLabel(AB_OFF)).toBe("Set loop start (A)");
    expect(abLabel({ a: 1, b: null })).toBe("Set loop end (B)");
    expect(abLabel({ a: 1, b: 2 })).toBe("Clear A to B loop");
  });
});
