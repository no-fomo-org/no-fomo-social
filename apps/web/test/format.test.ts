import { describe, expect, it } from "vitest";
import { followingRunError, formatAgo, formatCount, formatDuration, fullCheckDue, runResultNote } from "../app/lib/format";
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

describe("followingRunError", () => {
  const failed = new Date(2026, 9, 5, 21, 15).getTime();
  const run = { status: "error" as const, startedAt: failed - 60_000, finishedAt: failed, errorMessage: "Instagram is limiting calls." };
  it("shows a fresh failure as it is", () => {
    expect(followingRunError(run, failed + 5 * 60_000)).toBe("Instagram is limiting calls.");
  });
  it("dates an old failure, so it does not look like it is happening now", () => {
    expect(followingRunError(run, failed + 18 * 3600_000)).toBe("The last update, on Oct 5 at 21:15, did not finish. Press Update list to try again.");
  });
  it("dates an update that stopped without finishing by its start", () => {
    expect(followingRunError({ ...run, finishedAt: null, startedAt: failed }, failed + 3600_000)).toBe("The last update, on Oct 5 at 21:15, did not finish. Press Update list to try again.");
  });
  it("says nothing for a run that did not fail", () => {
    expect(followingRunError({ ...run, status: "done" }, failed)).toBeNull();
  });
});
