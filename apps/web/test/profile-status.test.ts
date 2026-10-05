import { describe, expect, it } from "vitest";
import type { LoadRunInfo, ProfileItem } from "@no-fomo/core";
import { loadNote, loadProblem } from "../app/lib/profile-status";

const run = (over: Partial<LoadRunInfo>): LoadRunInfo => ({
  id: 1, mode: "add", status: "done", startedAt: 0, finishedAt: 1, pages: 1, items: 12, errorCode: null, errorMessage: null, ...over,
});
const profile = (over: Partial<ProfileItem> = {}): ProfileItem => ({
  id: "77", username: "nasa", fullName: null, avatarUrl: "/media/avatars/77", postCount: 3400, loadedCount: 120,
  hasOlder: true, isPrivate: false, addedAt: 0, refreshedAt: null, run: null, ...over,
});

describe("profile status", () => {
  it("says how many posts are loaded, or how the load goes", () => {
    expect(loadNote(profile())).toBe("120 of 3,400 posts loaded");
    expect(loadNote(profile({ run: run({ status: "running", items: 24 }) }))).toBe("Loading, 24 new posts so far");
  });

  it("shows the error of the last load until a new one starts", () => {
    expect(loadProblem(profile({ run: run({ status: "error", errorMessage: "Instagram asked to slow down." }) }))).toBe("Instagram asked to slow down.");
    expect(loadProblem(profile({ run: run({ status: "error" }) }))).toBe("The last load failed. Try again.");
    expect(loadProblem(profile({ run: run({ status: "running" }) }))).toBeNull();
    expect(loadProblem(profile())).toBeNull();
  });
});
