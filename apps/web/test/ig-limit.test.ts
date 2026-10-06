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
