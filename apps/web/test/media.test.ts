import { describe, expect, it } from "vitest";
import type { PostMedia } from "@no-fomo/core";
import { canRefresh, MIN_REFRESH_GAP_MS, mediaErrorCode, mediaErrorText, needsRefresh, REFRESH_DELAY_MS, staleAction } from "../app/lib/media";

const media = (over: Partial<PostMedia> = {}): PostMedia => ({
  id: "1", kind: "video", parts: [{ index: 0, kind: "video", imageUrl: null, videoUrl: "https://x/v.mp4", width: 1, height: 1 }], expiresAt: 10_000, ...over,
});

describe("needsRefresh", () => {
  it("asks for fresh links when there are none or they expire within 10 minutes", () => {
    expect(needsRefresh(media({ parts: [] }), 0)).toBe(true);
    expect(needsRefresh(media(), 10_000 - 601)).toBe(false);
    expect(needsRefresh(media(), 10_000 - 599)).toBe(true);
    expect(needsRefresh(media(), 20_000)).toBe(true);
    expect(needsRefresh(media({ expiresAt: null }), 20_000)).toBe(false);
  });

  it("waits a moment before asking, so fast browsing sends nothing", () => {
    expect(REFRESH_DELAY_MS).toBeGreaterThanOrEqual(300);
  });
});

describe("media errors", () => {
  it("maps extension replies to error codes", () => {
    expect(mediaErrorCode(null)).toBe("no_extension");
    expect(mediaErrorCode({ ok: false, error: "unknown_type" })).toBe("old_extension");
    expect(mediaErrorCode({ ok: false, error: "login_required" })).toBe("login_required");
    expect(mediaErrorCode({ ok: false, error: "rate_limited" })).toBe("rate_limited");
    expect(mediaErrorCode({ ok: false, error: "not_found" })).toBe("not_found");
    expect(mediaErrorCode({ ok: false, error: "server_error" })).toBe("load_failed");
    expect(mediaErrorCode({ ok: true })).toBe("load_failed");
  });

  it("has plain text without dashes for every code", () => {
    for (const code of ["no_extension", "old_extension", "login_required", "rate_limited", "not_found", "load_failed"] as const) {
      expect(mediaErrorText(code)).toMatch(/^[A-Z]/);
      expect(mediaErrorText(code)).not.toMatch(/[–—]/);
    }
  });
});

describe("refresh rules", () => {
  const now = 1_000_000;
  it("renews a post's links at most once a minute", () => {
    expect(canRefresh(null, now)).toBe(true);
    expect(canRefresh(now - 1000, now)).toBe(false);
    expect(canRefresh(now - MIN_REFRESH_GAP_MS, now)).toBe(true);
  });

  it("waits for the app config, refreshes stale links, and gives up instead of spinning forever", () => {
    expect(staleAction({ configReady: false, refreshing: false, lastRefreshAt: null, now })).toBe("wait");
    expect(staleAction({ configReady: true, refreshing: true, lastRefreshAt: null, now })).toBe("wait");
    expect(staleAction({ configReady: true, refreshing: false, lastRefreshAt: null, now })).toBe("refresh");
    expect(staleAction({ configReady: true, refreshing: false, lastRefreshAt: now - 1000, now })).toBe("give_up");
    expect(staleAction({ configReady: true, refreshing: false, lastRefreshAt: now - MIN_REFRESH_GAP_MS, now })).toBe("refresh");
  });

  it("treats a slow extension as a failed load that can be retried", () => {
    expect(mediaErrorCode({ ok: false, error: "timeout" })).toBe("load_failed");
  });
});
