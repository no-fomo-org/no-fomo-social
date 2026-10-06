import { describe, expect, it, vi } from "vitest";
import { IgError, type IgClient } from "@no-fomo/core";
import { createTabJobs } from "../src/tab-jobs";
import type { RelayMessage, RelayResponse } from "../src/relay";

const unused = async () => { throw new Error("not used"); };
function setup(over: Partial<IgClient> = {}, relay?: (m: RelayMessage) => RelayResponse) {
  const ig: IgClient = { savedPage: unused, collectionsPage: unused, mediaInfo: unused, userFeed: unused, searchUsers: unused, followingPage: unused, ...over };
  const sent: RelayMessage[] = [];
  const send = vi.fn(async (m: RelayMessage) => { sent.push(m); return relay ? relay(m) : ({ ok: true, data: {} } as RelayResponse); });
  return { jobs: createTabJobs({ ig, send, viewerId: () => "42" }), sent };
}
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
    expect(await jobs.handle({ type: "profile:search", query: "one" })).toEqual({ ok: false, error: "login_required", detail: "x" });
  });

  const owner = { pk: "77", username: "nasa", full_name: "NASA", profile_pic_url: "https://scontent.cdninstagram.com/n.jpg" };
  const page = () => ({ items: [{ ...media("1"), user: owner }, media("2")], more_available: true, next_max_id: "N_77" });

  it("opens an account by its id with its first page, ready to show, without a search, and stores nothing", async () => {
    const feed = vi.fn(async () => page());
    const search = vi.fn();
    const { jobs, sent } = setup({ userFeed: feed, searchUsers: search });
    const r = (await jobs.handle({ type: "profile:open", username: "nasa", id: "77" })) as {
      ok: true; profile: unknown; page: { posts: Array<{ id: string; permalink: string; media: { parts: unknown[] } }>; nextCursor: string };
    };
    expect(r.profile).toEqual({
      id: "77", username: "nasa", fullName: "NASA", avatarUrl: "https://scontent.cdninstagram.com/n.jpg",
      postCount: null, isPrivate: false, followedByViewer: false,
    });
    expect(r.page.posts.map((p) => [p.id, p.permalink, p.media.parts.length])).toEqual([
      ["1", "https://www.instagram.com/p/C1/", 1], ["2", "https://www.instagram.com/p/C2/", 1],
    ]);
    expect(r.page.nextCursor).toBe("77:N_77");
    expect(feed).toHaveBeenCalledWith("77", null);
    expect(search).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });

  it("finds the id with one search for the exact name when it has none", async () => {
    const feed = vi.fn(async () => ({ items: [], more_available: false }));
    const { jobs } = setup({
      userFeed: feed,
      searchUsers: async () => ({ users: [{ user: { pk: "5", username: "nasa_fan" } }, { user: { pk: "77", username: "NASA", full_name: "NASA", is_private: false } }] }),
    });
    expect(await jobs.handle({ type: "profile:open", username: "nasa" })).toMatchObject({ ok: true, profile: { id: "77", username: "NASA", fullName: "NASA" }, page: { posts: [] } });
    expect(feed).toHaveBeenCalledWith("77", null);
  });

  it("shows the posts of a private account the owner follows", async () => {
    const { jobs } = setup({
      userFeed: async () => page(),
      searchUsers: async () => ({ users: [{ user: { pk: "77", username: "nasa", is_private: true } }] }),
    });
    expect(await jobs.handle({ type: "profile:open", username: "nasa" })).toMatchObject({ ok: true, profile: { isPrivate: true, followedByViewer: true }, page: { posts: [{ id: "1" }, { id: "2" }] } });
  });

  it("says when no account has this name", async () => {
    const feed = vi.fn();
    const { jobs } = setup({ userFeed: feed, searchUsers: async () => ({ users: [{ user: { pk: "5", username: "nasa_fan" } }] }) });
    expect(await jobs.handle({ type: "profile:open", username: "nasa" })).toEqual({ ok: false, error: "profile_not_found" });
    expect(feed).not.toHaveBeenCalled();
  });

  it("shows a private account it may not read, without posts", async () => {
    const { jobs } = setup({ userFeed: async () => { throw new IgError("private", "Not authorized to view user"); } });
    expect(await jobs.handle({ type: "profile:open", username: "nasa", id: "77" })).toMatchObject({
      ok: true, page: null, profile: { id: "77", username: "nasa", isPrivate: true, followedByViewer: false },
    });
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
  it("passes on when calls are allowed again", async () => {
    const { jobs } = setup({ searchUsers: async () => { throw new IgError("paused", "Instagram is limiting calls.", undefined, 1234); } });
    expect(await jobs.handle({ type: "profile:search", query: "one" })).toEqual({ ok: false, error: "paused", detail: "Instagram is limiting calls.", until: 1234 });
  });

  it("a following update fails at once at the hourly limit instead of waiting", async () => {
    const ig: IgClient = {
      savedPage: unused, collectionsPage: unused, mediaInfo: unused, userFeed: unused, searchUsers: unused,
      followingPage: async () => { throw new IgError("budget", "The app made many Instagram calls this hour.", undefined, 99); },
    };
    const sent: RelayMessage[] = [];
    const send = vi.fn(async (m: RelayMessage) => { sent.push(m); return { ok: true, data: m.path.endsWith("/runs") ? { runId: 1 } : {} } as RelayResponse; });
    const jobs = createTabJobs({ ig, send, viewerId: () => "42" });
    expect(await jobs.handle({ type: "following:update", serverUrl: "http://localhost:4747" })).toEqual({ ok: true });
    await vi.waitFor(() => expect(sent.at(-1)?.path).toBe("/api/sync/following/runs/1/finish"));
    expect(sent.at(-1)?.body).toMatchObject({ ok: false, code: "budget" });
  });
});
