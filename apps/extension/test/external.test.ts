import { describe, expect, it, vi } from "vitest";
import { handleExternalMessage, type ExternalDeps } from "../src/external";

function deps(over: Partial<ExternalDeps> = {}): ExternalDeps {
  return {
    version: "0.1.0",
    findInstagramTab: vi.fn(async () => 5),
    openInstagramTab: vi.fn(async () => 9),
    sendToTab: vi.fn(async () => ({ ok: true })),
    ...over,
  };
}

describe("handleExternalMessage", () => {
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
    expect(d.sendToTab).toHaveBeenCalledWith(5, { type: "media:fetch", serverUrl: "http://localhost:4747", id: "123" });
  });

  it("refuses media refresh with a bad id or from other pages", async () => {
    const d = deps();
    expect(await handleExternalMessage({ type: "media:refresh", id: "../x" }, "http://localhost:4747/", d)).toEqual({ ok: false, error: "bad_message" });
    expect(await handleExternalMessage({ type: "media:refresh", id: 5 }, "http://localhost:4747/", d)).toEqual({ ok: false, error: "bad_message" });
    expect(await handleExternalMessage({ type: "media:refresh", id: "123" }, "https://evil.example/", d)).toEqual({ ok: false, error: "untrusted_sender" });
    expect(d.sendToTab).not.toHaveBeenCalled();
  });
});
