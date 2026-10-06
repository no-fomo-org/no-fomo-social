import { afterEach, describe, expect, it, vi } from "vitest";
import { igStatus, openProfile, profilePage, refreshExtensionMedia, syncErrorText } from "../app/lib/extension";
import { loadErrorText } from "../app/lib/extension";

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as { chrome?: unknown }).chrome;
});

describe("extension messages", () => {
  it("reports a timeout, not a missing extension, when the extension is slow", async () => {
    vi.useFakeTimers();
    (globalThis as { chrome?: unknown }).chrome = { runtime: { sendMessage: () => {} } };
    const reply = refreshExtensionMedia("ext", "123");
    await vi.advanceTimersByTimeAsync(45_000);
    expect(await reply).toEqual({ ok: false, error: "timeout" });
  });

  it("asks the extension to store the post only when told to", async () => {
    const sent: unknown[] = [];
    (globalThis as { chrome?: unknown }).chrome = { runtime: { sendMessage: (_id: string, msg: unknown, cb: (r: unknown) => void) => { sent.push(msg); cb({ ok: true }); } } };
    await refreshExtensionMedia("ext", "123");
    await refreshExtensionMedia("ext", "123", true);
    expect(sent).toEqual([{ type: "media:refresh", id: "123", store: false }, { type: "media:refresh", id: "123", store: true }]);
  });

  it("opens accounts and next pages through the extension", async () => {
    const sent: unknown[] = [];
    (globalThis as { chrome?: unknown }).chrome = { runtime: { sendMessage: (_id: string, msg: unknown, cb: (r: unknown) => void) => { sent.push(msg); cb({ ok: true }); } } };
    await openProfile("ext", "nasa");
    await openProfile("ext", "nasa", "77");
    await profilePage("ext", "77:N");
    expect(sent).toEqual([{ type: "profile:open", username: "nasa" }, { type: "profile:open", username: "nasa", id: "77" }, { type: "profile:page", cursor: "77:N" }]);
  });

  it("still reports a missing extension as null", async () => {
    expect(await refreshExtensionMedia("ext", "123")).toBeNull();
  });

  it("explains a sync timeout", () => {
    expect(syncErrorText("timeout")).toBe("The extension did not answer. Reload this page and try again.");
  });
});

describe("loadErrorText", () => {
  it("tells the owner to update an old extension", () => {
    expect(loadErrorText("unknown_type")).toMatch(/extension is out of date/);
  });
  it("explains profile problems in plain words", () => {
    expect(loadErrorText("private_profile")).toMatch(/private/);
    expect(loadErrorText("profile_not_found")).toBe(loadErrorText("not_found"));
    expect(loadErrorText("busy")).toMatch(/already/);
    expect(loadErrorText("something_new")).toMatch(/something_new/);
  });
});

describe("loadErrorText details", () => {
  it("adds what Instagram said for pauses, refusals and errors", () => {
    expect(loadErrorText("paused", "Instagram is limiting calls. Its answer: Instagram refused the request (feedback_required)."))
      .toBe("Instagram is limiting calls. Try again later.");
    expect(loadErrorText("http_error", "Instagram returned error 500 (profile).")).toBe("Could not load from Instagram. Instagram returned error 500 (profile).");
    expect(loadErrorText("rate_limited", "x")).toBe("Instagram asked to slow down. Try again in a few minutes.");
  });
});

describe("Instagram limits through the extension", () => {
  it("asks the extension for the limit status", async () => {
    const sent: unknown[] = [];
    (globalThis as { chrome?: unknown }).chrome = { runtime: { sendMessage: (_id: string, msg: unknown, cb: (r: unknown) => void) => { sent.push(msg); cb({ ok: true, status: { pausedUntil: null, reason: null, budgetUntil: null } }); } } };
    expect(await igStatus("ext")).toEqual({ ok: true, status: { pausedUntil: null, reason: null, budgetUntil: null } });
    expect(sent).toEqual([{ type: "ig:status" }]);
  });
  it("says when calls are allowed again", () => {
    const at = new Date(2026, 9, 6, 15, 30).getTime();
    expect(loadErrorText("paused", "Instagram is limiting calls. Its answer: x", at)).toBe("Instagram is limiting calls. Try again at 15:30.");
    expect(loadErrorText("budget", undefined, at)).toBe("The app made many Instagram calls this hour. Try again at 15:30.");
  });
});
