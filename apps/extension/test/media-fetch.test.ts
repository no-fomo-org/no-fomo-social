import { describe, expect, it, vi } from "vitest";
import { IgError, type IgClient } from "@no-fomo-social/core";
import { fetchMedia } from "../src/media-fetch";

const ig = (mediaInfo: IgClient["mediaInfo"]): IgClient => ({
  savedPage: async () => { throw new Error("unused"); },
  collectionsPage: async () => { throw new Error("unused"); },
  mediaInfo,
  profilePosts: async () => { throw new Error("unused"); },
  searchUsers: async () => { throw new Error("unused"); },
  followingPage: async () => { throw new Error("unused"); },
});

describe("fetchMedia", () => {
  it("relays Instagram's answer to the server and returns fresh links", async () => {
    const media = { id: "123", kind: "image", parts: [], expiresAt: 1 };
    const send = vi.fn(async () => ({ ok: true as const, data: media }));
    const r = await fetchMedia({ ig: ig(async () => ({ items: [] })), id: "123", serverUrl: "http://localhost:4747", send, store: true });
    expect(r).toEqual({ ok: true, media });
    expect(send).toHaveBeenCalledWith({ type: "relay", serverUrl: "http://localhost:4747", path: "/api/sync/media/123", body: { payload: { items: [] }, store: true } });
  });

  it("returns Instagram error codes and does not call the server", async () => {
    const send = vi.fn();
    const r = await fetchMedia({ ig: ig(async () => { throw new IgError("login_required", "x"); }), id: "123", serverUrl: "http://localhost:4747", send, store: false });
    expect(r).toEqual({ ok: false, error: "login_required" });
    expect(send).not.toHaveBeenCalled();
  });

  it("reports server problems", async () => {
    const send = vi.fn(async () => ({ ok: false as const, error: "internal_error" }));
    const r = await fetchMedia({ ig: ig(async () => ({})), id: "123", serverUrl: "http://localhost:4747", send, store: false });
    expect(r).toEqual({ ok: false, error: "server_error" });
  });

  it("refuses ids that are not plain digits", async () => {
    const mediaInfo = vi.fn();
    const r = await fetchMedia({ ig: ig(mediaInfo), id: "1/../2", serverUrl: "http://localhost:4747", send: vi.fn(), store: false });
    expect(r).toEqual({ ok: false, error: "bad_message" });
    expect(mediaInfo).not.toHaveBeenCalled();
  });

  it("builds the links itself for a post the app does not store", async () => {
    const answer = { items: [{ pk: "123", code: "C1", media_type: 1, user: { pk: "9", username: "a" },
      image_versions2: { candidates: [{ width: 640, height: 800, url: "https://scontent.cdninstagram.com/a.jpg?oe=6A000000" }] } }] };
    const send = vi.fn(async () => ({ ok: false as const, error: "not_stored" }));
    const r = await fetchMedia({ ig: ig(async () => answer), id: "123", serverUrl: "http://localhost:4747", send, store: false });
    expect(r).toEqual({ ok: true, media: {
      id: "123", kind: "image", expiresAt: 0x6a000000,
      parts: [{ index: 0, kind: "image", imageUrl: "https://scontent.cdninstagram.com/a.jpg?oe=6A000000", videoUrl: null, width: 640, height: 800 }],
    } });
  });

  it("does not build links when asked to store and the server failed", async () => {
    const send = vi.fn(async () => ({ ok: false as const, error: "not_stored" }));
    const r = await fetchMedia({ ig: ig(async () => ({ items: [] })), id: "123", serverUrl: "http://localhost:4747", send, store: true });
    expect(r).toEqual({ ok: false, error: "server_error" });
  });

  it("passes on when calls are allowed again", async () => {
    const send = vi.fn();
    const r = await fetchMedia({ ig: ig(async () => { throw new IgError("budget", "many calls", undefined, 99); }), id: "1", serverUrl: "http://localhost:4747", send, store: false });
    expect(r).toEqual({ ok: false, error: "budget", until: 99 });
    expect(send).not.toHaveBeenCalled();
  });
});
