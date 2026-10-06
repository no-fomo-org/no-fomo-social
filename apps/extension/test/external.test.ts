import { describe, expect, it, vi } from "vitest";
import { handleExternalMessage, type ExternalDeps } from "../src/external";

function deps(over: Partial<ExternalDeps> = {}): ExternalDeps {
  return {
    version: "0.1.0",
    findInstagramTab: vi.fn(async () => 5),
    openInstagramTab: vi.fn(async () => 9),
    sendToTab: vi.fn(async () => ({ ok: true })),
    igStatus: vi.fn(async () => ({ pausedUntil: 5, reason: "slow", budgetUntil: null })),
    ...over,
  };
}

describe("handleExternalMessage", () => {
  it("passes profile search, open, next page and following update to the Instagram tab", async () => {
    const d = deps({ sendToTab: vi.fn(async () => ({ ok: true })) });
    await handleExternalMessage({ type: "profile:search", query: " nasa " }, "http://localhost:4747/profiles", d);
    await handleExternalMessage({ type: "profile:open", username: "nasa" }, "http://localhost:4747/", d);
    await handleExternalMessage({ type: "profile:open", username: "nasa", id: "77" }, "http://localhost:4747/", d);
    await handleExternalMessage({ type: "profile:page", cursor: "528817151:QVFB_x-1=" }, "http://localhost:4747/", d);
    await handleExternalMessage({ type: "following:update" }, "http://localhost:4747/", d);
    expect((d.sendToTab as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[1])).toEqual([
      { type: "profile:search", serverUrl: "http://localhost:4747", query: "nasa" },
      { type: "profile:open", serverUrl: "http://localhost:4747", username: "nasa" },
      { type: "profile:open", serverUrl: "http://localhost:4747", username: "nasa", id: "77" },
      { type: "profile:page", serverUrl: "http://localhost:4747", cursor: "528817151:QVFB_x-1=" },
      { type: "following:update", serverUrl: "http://localhost:4747" },
    ]);
  });

  it("rejects bad profile messages", async () => {
    const d = deps();
    const bad = [
      { type: "profile:search", query: "x" },
      { type: "profile:search", query: "a".repeat(61) },
      { type: "profile:open", username: "../etc" },
      { type: "profile:open", username: "nasa", id: "x7" },
      { type: "profile:page", cursor: "abc:1" },
      { type: "profile:page", cursor: "1:a/b" },
      { type: "profile:page", cursor: "1" },
      { type: "media:refresh", id: "1", store: "yes" },
    ];
    for (const m of bad) expect(await handleExternalMessage(m, "http://localhost:4747/", d)).toEqual({ ok: false, error: "bad_message" });
    expect(await handleExternalMessage({ type: "profile:load", mode: "add", username: "nasa" }, "http://localhost:4747/", d)).toEqual({ ok: false, error: "unknown_type" });
    expect(d.sendToTab).not.toHaveBeenCalled();
  });

  it("answers ping", async () => {
    expect(await handleExternalMessage({ type: "ping" }, undefined, deps())).toEqual({ ok: true, version: "0.1.0" });
  });

  it("starts sync in an existing Instagram tab with the sender origin as server", async () => {
    const d = deps();
    const r = await handleExternalMessage({ type: "sync:start" }, "http://localhost:4747/?author=1", d);
    expect(r).toEqual({ ok: true });
    expect(d.sendToTab).toHaveBeenCalledWith(5, { type: "sync:run", serverUrl: "http://localhost:4747", mode: "incremental" });
    expect(d.openInstagramTab).not.toHaveBeenCalled();
  });

  it("opens Instagram when no tab exists", async () => {
    const d = deps({ findInstagramTab: vi.fn(async () => null) });
    await handleExternalMessage({ type: "sync:start" }, "http://localhost:4747/", d);
    expect(d.sendToTab).toHaveBeenCalledWith(9, expect.anything());
  });

  it("refuses sync requests from other local pages", async () => {
    const d = deps();
    expect(await handleExternalMessage({ type: "sync:start" }, "http://localhost:9999/", d)).toEqual({ ok: false, error: "untrusted_sender" });
    expect(d.sendToTab).not.toHaveBeenCalled();
  });

  it("rejects unknown or malformed messages", async () => {
    expect(await handleExternalMessage("x", undefined, deps())).toEqual({ ok: false, error: "bad_message" });
    expect(await handleExternalMessage({ type: "rm -rf" }, undefined, deps())).toEqual({ ok: false, error: "unknown_type" });
    expect(await handleExternalMessage({ type: "sync:start" }, undefined, deps())).toEqual({ ok: false, error: "no_sender" });
  });

  it("passes a full resync request through", async () => {
    const d = deps();
    await handleExternalMessage({ type: "sync:start", mode: "full" }, "http://localhost:4747/", d);
    expect(d.sendToTab).toHaveBeenCalledWith(5, { type: "sync:run", serverUrl: "http://localhost:4747", mode: "full" });
    expect(await handleExternalMessage({ type: "sync:start", mode: "all" }, "http://localhost:4747/", d)).toEqual({ ok: false, error: "bad_message" });
  });

  it("asks the Instagram tab for fresh media links", async () => {
    const media = { id: "123", kind: "video", parts: [], expiresAt: null };
    const d = deps({ sendToTab: vi.fn(async () => ({ ok: true, media })) });
    const r = await handleExternalMessage({ type: "media:refresh", id: "123" }, "http://localhost:4747/", d);
    expect(r).toEqual({ ok: true, media });
    expect(d.sendToTab).toHaveBeenCalledWith(5, { type: "media:fetch", serverUrl: "http://localhost:4747", id: "123", store: false });
    await handleExternalMessage({ type: "media:refresh", id: "123", store: true }, "http://localhost:4747/", d);
    expect(d.sendToTab).toHaveBeenLastCalledWith(5, { type: "media:fetch", serverUrl: "http://localhost:4747", id: "123", store: true });
  });

  it("refuses media refresh with a bad id or from other pages", async () => {
    const d = deps();
    expect(await handleExternalMessage({ type: "media:refresh", id: "../x" }, "http://localhost:4747/", d)).toEqual({ ok: false, error: "bad_message" });
    expect(await handleExternalMessage({ type: "media:refresh", id: 5 }, "http://localhost:4747/", d)).toEqual({ ok: false, error: "bad_message" });
    expect(await handleExternalMessage({ type: "media:refresh", id: "123" }, "https://evil.example/", d)).toEqual({ ok: false, error: "untrusted_sender" });
    expect(d.sendToTab).not.toHaveBeenCalled();
  });
  it("answers ig:status from storage without an Instagram tab", async () => {
    const d = deps();
    expect(await handleExternalMessage({ type: "ig:status" }, "http://localhost:4747/", d)).toEqual({
      ok: true, status: { pausedUntil: 5, reason: "slow", budgetUntil: null },
    });
    expect(d.findInstagramTab).not.toHaveBeenCalled();
    expect(await handleExternalMessage({ type: "ig:status" }, "https://evil.example/", d)).toEqual({ ok: false, error: "untrusted_sender" });
  });
});
