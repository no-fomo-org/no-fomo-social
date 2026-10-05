import { describe, expect, it } from "vitest";
import type { PostMedia } from "@no-fomo/core";
import { mediaErrorCode, mediaErrorText, needsRefresh, REFRESH_DELAY_MS } from "../app/lib/media";

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
