import { afterEach, describe, expect, it, vi } from "vitest";
import { refreshExtensionMedia, syncErrorText } from "../app/lib/extension";

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

  it("still reports a missing extension as null", async () => {
    expect(await refreshExtensionMedia("ext", "123")).toBeNull();
  });

  it("explains a sync timeout", () => {
    expect(syncErrorText("timeout")).toBe("The extension did not answer. Reload this page and try again.");
  });
});
