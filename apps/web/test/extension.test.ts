import { afterEach, describe, expect, it, vi } from "vitest";
import { openProfile, profilePage, refreshExtensionMedia, syncErrorText } from "../app/lib/extension";
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
    await profilePage("ext", "77:N");
    expect(sent).toEqual([{ type: "profile:open", username: "nasa" }, { type: "profile:page", cursor: "77:N" }]);
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
