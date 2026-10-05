import { describe, expect, it } from "vitest";
import { formatAgo, formatCount, formatDuration, fullCheckDue, runResultNote } from "../app/lib/format";
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

describe("full resync hints", () => {
  const day = 86_400_000;
  const now = 100 * day;
  it("suggests a full check after 30 days, or when there never was one", () => {
    expect(fullCheckDue(null, null, now)).toBe(false); // never synced: the first sync is full anyway
    expect(fullCheckDue(null, now - day, now)).toBe(true);
    expect(fullCheckDue(now - 29 * day, now - day, now)).toBe(false);
    expect(fullCheckDue(now - 31 * day, now - day, now)).toBe(true);
  });

  it("describes what the last run found", () => {
    expect(runResultNote({ status: "done", postsNew: 0, postsRemoved: 0 })).toBe("");
    expect(runResultNote({ status: "done", postsNew: 1, postsRemoved: 0 })).toBe(", 1 new post");
    expect(runResultNote({ status: "done", postsNew: 2, postsRemoved: 3 })).toBe(", 2 new posts, 3 removed on Instagram");
    expect(runResultNote({ status: "done", postsNew: 0, postsRemoved: 1 })).toBe(", 1 removed on Instagram");
    expect(runResultNote({ status: "error", postsNew: 5, postsRemoved: 5 })).toBe("");
  });
});
