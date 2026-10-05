import { describe, expect, it, vi } from "vitest";
import { IgError, type IgClient } from "@no-fomo/core";
import { fetchMedia } from "../src/media-fetch";

const ig = (mediaInfo: IgClient["mediaInfo"]): IgClient => ({
  savedPage: async () => { throw new Error("unused"); },
  collectionsPage: async () => { throw new Error("unused"); },
  mediaInfo,
  profileInfo: async () => { throw new Error("unused"); },
  userFeed: async () => { throw new Error("unused"); },
  searchUsers: async () => { throw new Error("unused"); },
  followingPage: async () => { throw new Error("unused"); },
});

describe("fetchMedia", () => {
  it("relays Instagram's answer to the server and returns fresh links", async () => {
    const media = { id: "123", kind: "image", parts: [], expiresAt: 1 };
    const send = vi.fn(async () => ({ ok: true as const, data: media }));
    const r = await fetchMedia({ ig: ig(async () => ({ items: [] })), id: "123", serverUrl: "http://localhost:4747", send });
    expect(r).toEqual({ ok: true, media });
    expect(send).toHaveBeenCalledWith({ type: "relay", serverUrl: "http://localhost:4747", path: "/api/sync/media/123", body: { payload: { items: [] } } });
  });

  it("returns Instagram error codes and does not call the server", async () => {
    const send = vi.fn();
    const r = await fetchMedia({ ig: ig(async () => { throw new IgError("login_required", "x"); }), id: "123", serverUrl: "http://localhost:4747", send });
    expect(r).toEqual({ ok: false, error: "login_required" });
    expect(send).not.toHaveBeenCalled();
  });

  it("reports server problems", async () => {
    const send = vi.fn(async () => ({ ok: false as const, error: "Post 123 is not in your library" }));
    const r = await fetchMedia({ ig: ig(async () => ({})), id: "123", serverUrl: "http://localhost:4747", send });
    expect(r).toEqual({ ok: false, error: "server_error" });
  });

  it("refuses ids that are not plain digits", async () => {
    const mediaInfo = vi.fn();
    const r = await fetchMedia({ ig: ig(mediaInfo), id: "1/../2", serverUrl: "http://localhost:4747", send: vi.fn() });
    expect(r).toEqual({ ok: false, error: "bad_message" });
    expect(mediaInfo).not.toHaveBeenCalled();
  });
});
