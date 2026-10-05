import { describe, expect, it, vi } from "vitest";
import { IgError, type IgClient } from "@no-fomo/core";
import { createTabJobs } from "../src/tab-jobs";
import type { RelayMessage, RelayResponse } from "../src/relay";

const unused = async () => { throw new Error("not used"); };
function setup(over: Partial<IgClient> = {}, relay?: (m: RelayMessage) => RelayResponse) {
  const ig: IgClient = { savedPage: unused, collectionsPage: unused, mediaInfo: unused, profileInfo: unused, userFeed: unused, searchUsers: unused, followingPage: unused, ...over };
  const sent: RelayMessage[] = [];
  const send = vi.fn(async (m: RelayMessage) => { sent.push(m); return relay ? relay(m) : ({ ok: true, data: {} } as RelayResponse); });
  return { jobs: createTabJobs({ ig, send, viewerId: () => "42" }), sent };
}
const info = (over: Record<string, unknown> = {}) => ({
  data: { user: { id: "77", username: "nasa", full_name: "NASA", profile_pic_url: "https://scontent.cdninstagram.com/n.jpg",
    is_private: false, followed_by_viewer: false, edge_owner_to_timeline_media: { count: 4321 }, ...over } },
});
const media = (pk: string) => ({
  pk, code: `C${pk}`, media_type: 1, taken_at: 1, user: { pk: "77", username: "nasa" },
  image_versions2: { candidates: [{ width: 640, height: 800, url: `https://scontent.cdninstagram.com/${pk}.jpg` }] },
});

describe("tab jobs", () => {
  it("answers a search with parsed users", async () => {
    const { jobs } = setup({ searchUsers: async () => ({ users: [{ user: { pk: "1", username: "one" } }] }) });
    expect(await jobs.handle({ type: "profile:search", query: "one" })).toEqual({
      ok: true, users: [{ id: "1", username: "one", fullName: null, avatarUrl: null, isPrivate: false, isVerified: false }],
    });
  });

  it("returns the Instagram error code of a failed search", async () => {
    const { jobs } = setup({ searchUsers: async () => { throw new IgError("login_required", "x"); } });
    expect(await jobs.handle({ type: "profile:search", query: "one" })).toEqual({ ok: false, error: "login_required" });
  });

  it("opens an account with its first page, ready to show, and stores nothing", async () => {
    const feed = vi.fn(async () => ({ items: [media("1"), media("2")], more_available: true, next_max_id: "N_77" }));
    const { jobs, sent } = setup({ profileInfo: async () => info(), userFeed: feed });
    const r = (await jobs.handle({ type: "profile:open", username: "nasa" })) as {
      ok: true; profile: unknown; page: { posts: Array<{ id: string; permalink: string; media: { parts: unknown[] } }>; nextCursor: string };
    };
    expect(r.profile).toEqual({
      id: "77", username: "nasa", fullName: "NASA", avatarUrl: "https://scontent.cdninstagram.com/n.jpg",
      postCount: 4321, isPrivate: false, followedByViewer: false,
    });
    expect(r.page.posts.map((p) => [p.id, p.permalink, p.media.parts.length])).toEqual([
      ["1", "https://www.instagram.com/p/C1/", 1], ["2", "https://www.instagram.com/p/C2/", 1],
    ]);
    expect(r.page.nextCursor).toBe("77:N_77");
    expect(feed).toHaveBeenCalledWith("77", null);
    expect(sent).toEqual([]);
  });

  it("shows a private account the owner does not follow without asking for its posts", async () => {
    const feed = vi.fn();
    const { jobs } = setup({ profileInfo: async () => info({ is_private: true }), userFeed: feed });
    expect(await jobs.handle({ type: "profile:open", username: "nasa" })).toMatchObject({ ok: true, page: null, profile: { isPrivate: true } });
    expect(feed).not.toHaveBeenCalled();
  });

  it("says when no account has this name", async () => {
    const { jobs } = setup({ profileInfo: async () => ({ data: { user: null } }) });
    expect(await jobs.handle({ type: "profile:open", username: "ghost" })).toEqual({ ok: false, error: "profile_not_found" });
    const { jobs: j2 } = setup({ profileInfo: async () => { throw new IgError("not_found", "x"); } });
    expect(await j2.handle({ type: "profile:open", username: "ghost" })).toEqual({ ok: false, error: "not_found" });
  });

  it("reads the next page from the cursor alone, and ends without a cursor", async () => {
    const feed = vi.fn(async () => ({ items: [media("3")], more_available: false }));
    const { jobs } = setup({ userFeed: feed });
    const r = await jobs.handle({ type: "profile:page", cursor: "77:N_77" });
    expect(feed).toHaveBeenCalledWith("77", "N_77");
    expect(r).toMatchObject({ ok: true, page: { nextCursor: null, posts: [{ id: "3" }] } });
  });

  it("answers a following update once it started, and refuses a second one meanwhile", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const { jobs, sent } = setup(
      { followingPage: async () => { await gate; return { users: [] }; } },
      (m) => (m.path === "/api/sync/following/runs" ? { ok: true, data: { runId: 3 } } : { ok: true, data: { seen: 0 } }),
    );
    const msg = { type: "following:update", serverUrl: "http://localhost:4747" };
    expect(await jobs.handle(msg)).toEqual({ ok: true });
    expect(await jobs.handle(msg)).toEqual({ ok: false, error: "busy" });
    release();
    await vi.waitFor(() => expect(sent.map((m) => m.path)).toContain("/api/sync/following/runs/3/finish"));
  });

  it("ignores messages it does not know", () => {
    expect(setup().jobs.handle({ type: "sync:run" })).toBeNull();
    expect(setup().jobs.handle({ type: "profile:load", serverUrl: "http://localhost:4747" })).toBeNull();
  });
});
