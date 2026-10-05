import { describe, expect, it } from "vitest";
import { formatAgo, formatCount, formatDuration } from "../app/lib/format";
import { syncErrorText } from "../app/lib/extension";

describe("format", () => {
  it("formats durations", () => {
    expect(formatDuration(42.5)).toBe("0:42");
    expect(formatDuration(3725)).toBe("1:02:05");
  });
  it("formats counts compactly", () => {
    expect(formatCount(48211)).toBe("48.2K");
    expect(formatCount(87)).toBe("87");
  });
  it("formats relative time", () => {
    const now = 1_000_000_000;
    expect(formatAgo(now - 10_000, now)).toBe("just now");
    expect(formatAgo(now - 5 * 60_000, now)).toBe("5 minutes ago");
  });
  it("explains sync errors in plain words", () => {
    expect(syncErrorText("already_running")).toBe("A sync is already running.");
    expect(syncErrorText("weird")).toBe("Sync could not start (weird).");
  });
});
