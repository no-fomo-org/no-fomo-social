import { beforeEach, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { openDb, type Db } from "../src/db/open";
import { following, loadRuns, posts, profilePosts, profiles, savedPosts } from "../src/db/schema";
import { finishRun, ingestSavedPage, startRun } from "../src/sync/ingest";
import { finishReport, queueReport, failReport } from "../src/analyze/report-store";
import {
  FOLLOWING_UPDATED_AT, finishLoadRun, ingestFollowingPage, ingestProfilePage, LoadError, removeProfile,
  startFollowingRun, startProfileRun,
} from "../src/sync/loads";
import { getSetting } from "../src/db/settings";

const info = (over: Record<string, unknown> = {}) => ({
  data: { user: { id: "77", username: "nasa", full_name: "NASA", is_private: false, followed_by_viewer: false, edge_owner_to_timeline_media: { count: 500 }, ...over } },
});
const media = (pk: string, author = "77", extra: Record<string, unknown> = {}) => ({
  pk, code: `C${pk}`, media_type: 1, taken_at: Number(pk), user: { pk: author, username: author === "77" ? "nasa" : `u${author}` },
  image_versions2: { candidates: [{ width: 480, height: 600, url: `https://scontent.cdninstagram.com/${pk}.jpg` }] }, ...extra,
});
const feed = (pks: string[], next: string | null, extra: Record<string, Record<string, unknown>> = {}) => ({
  items: pks.map((pk) => media(pk, "77", extra[pk] ?? {})), more_available: next !== null, next_max_id: next,
});
const linked = (db: Db, authorId = "77") =>
  db.select({ id: profilePosts.postId }).from(profilePosts).where(eq(profilePosts.authorId, authorId)).orderBy(asc(profilePosts.postId)).all().map((r) => r.id);
const opts = { language: "English", reportModel: "m", transcribeModel: "t" };

let db: Db;
beforeEach(() => { db = openDb(":memory:"); });

function addProfile(pages: unknown[]) {
  const { runId, authorId } = startProfileRun(db, { mode: "add", payload: info() }, 10);
  for (const p of pages) ingestProfilePage(db, runId, p);
  finishLoadRun(db, runId, { ok: true }, 20);
  return authorId;
}

describe("profile loads", () => {
  it("adds a profile, links its posts and stores the older cursor", () => {
    const start = startProfileRun(db, { mode: "add", payload: info() }, 10);
    expect(start).toMatchObject({ authorId: "77", cursor: null });
    expect(start.jobs).toEqual([]); // no avatar url in this payload
    const r = ingestProfilePage(db, start.runId, feed(["3", "2"], "NEXT"));
    expect(r).toMatchObject({ stop: false, newCount: 2 });
    expect(r.jobs.filter((j) => j.kind === "thumb")).toHaveLength(2);
    finishLoadRun(db, start.runId, { ok: true }, 20);
    expect(db.select().from(profiles).get()).toMatchObject({ authorId: "77", postCount: 500, olderCursor: "NEXT", refreshedAt: 20 });
    expect(linked(db)).toEqual(["2", "3"]);
    expect(db.select().from(savedPosts).all()).toEqual([]);
  });

  it("refuses unknown and private accounts", () => {
    expect(() => startProfileRun(db, { mode: "add", payload: { data: { user: null } } })).toThrow(LoadError);
    expect(() => startProfileRun(db, { mode: "add", payload: info({ is_private: true }) })).toThrow(expect.objectContaining({ code: "private_profile" }));
    expect(startProfileRun(db, { mode: "add", payload: info({ is_private: true, followed_by_viewer: true }) }).authorId).toBe("77");
  });

  it("loads older posts from the cursor and clears it at the end", () => {
    addProfile([feed(["3"], "NEXT")]);
    const older = startProfileRun(db, { mode: "older", authorId: "77" });
    expect(older.cursor).toBe("NEXT");
    ingestProfilePage(db, older.runId, feed(["1"], null));
    finishLoadRun(db, older.runId, { ok: true });
    expect(db.select().from(profiles).get()!.olderCursor).toBeNull();
    expect(() => startProfileRun(db, { mode: "older", authorId: "77" })).toThrow(expect.objectContaining({ code: "no_more_posts" }));
  });

  it("refresh stops at a known post but not at a pinned one, and keeps the older cursor", () => {
    addProfile([feed(["3", "2"], "NEXT")]);
    const again = startProfileRun(db, { mode: "add", payload: info() });
    expect(db.select().from(loadRuns).where(eq(loadRuns.id, again.runId)).get()!.mode).toBe("refresh");
    const p1 = ingestProfilePage(db, again.runId, feed(["2", "9", "8"], "X", { "2": { timeline_pinned_user_ids: ["77"] } }));
    expect(p1).toMatchObject({ stop: false, newCount: 2 });
    expect(ingestProfilePage(db, again.runId, feed(["7", "3"], "Y")).stop).toBe(true);
    expect(db.select().from(profiles).get()!.olderCursor).toBe("NEXT");
  });

  it("a refresh cut off before a known post leaves no gap: the next refresh reads past its posts", () => {
    addProfile([feed(["10", "9"], "NEXT")]);
    const r1 = startProfileRun(db, { mode: "refresh", authorId: "77" });
    expect(r1.mode).toBe("refresh");
    expect(ingestProfilePage(db, r1.runId, feed(["30", "29"], "X")).stop).toBe(false);
    finishLoadRun(db, r1.runId, { ok: true }); // the page cap ended it
    const r2 = startProfileRun(db, { mode: "refresh", authorId: "77" });
    expect(ingestProfilePage(db, r2.runId, feed(["31", "30"], "X2")).stop).toBe(false);
    expect(ingestProfilePage(db, r2.runId, feed(["29", "28"], "X3")).stop).toBe(false);
    expect(ingestProfilePage(db, r2.runId, feed(["27", "10"], "X4")).stop).toBe(true);
    finishLoadRun(db, r2.runId, { ok: true });
    const r3 = startProfileRun(db, { mode: "refresh", authorId: "77" });
    expect(ingestProfilePage(db, r3.runId, feed(["31", "30"], "X5")).stop).toBe(true);
    expect(linked(db)).toEqual(["10", "27", "28", "29", "30", "31", "9"]);
  });

  it("a refresh that failed part way does not count as known", () => {
    addProfile([feed(["10"], null)]);
    const r1 = startProfileRun(db, { mode: "refresh", authorId: "77" });
    ingestProfilePage(db, r1.runId, feed(["30"], "X"));
    finishLoadRun(db, r1.runId, { ok: false, code: "rate_limited", message: "slow" });
    const r2 = startProfileRun(db, { mode: "refresh", authorId: "77" });
    expect(ingestProfilePage(db, r2.runId, feed(["30", "29"], "X")).stop).toBe(false);
  });

  it("refreshing a profile whose first load got nothing works like adding, so Load older works", () => {
    const a = startProfileRun(db, { mode: "add", payload: info() });
    finishLoadRun(db, a.runId, { ok: false, code: "rate_limited", message: "slow" });
    const r = startProfileRun(db, { mode: "refresh", authorId: "77" });
    expect(r.mode).toBe("add");
    ingestProfilePage(db, r.runId, feed(["3"], "NEXT"));
    expect(db.select().from(profiles).get()!.olderCursor).toBe("NEXT");
  });

  it("a profile post that is also saved is one row, in both lists", () => {
    addProfile([feed(["3"], null)]);
    const run = startRun(db);
    ingestSavedPage(db, run.runId, { items: [{ media: media("3") }], more_available: false });
    finishRun(db, run.runId, { ok: true });
    expect(db.select({ id: posts.id }).from(posts).all()).toEqual([{ id: "3" }]);
    expect(db.select({ id: savedPosts.postId }).from(savedPosts).all()).toEqual([{ id: "3" }]);
    expect(linked(db)).toEqual(["3"]);
  });

  it("a new run marks an unfinished run of the same profile as interrupted", () => {
    const a = startProfileRun(db, { mode: "add", payload: info() });
    startProfileRun(db, { mode: "refresh", authorId: "77" });
    expect(db.select().from(loadRuns).where(eq(loadRuns.id, a.runId)).get()).toMatchObject({ status: "error", errorCode: "interrupted" });
    expect(() => ingestProfilePage(db, a.runId, feed([], null))).toThrow();
  });
});

describe("removing a profile", () => {
  it("deletes only posts nothing else needs", () => {
    addProfile([feed(["1", "2", "3", "4", "5"], null)]);
    // 1: saved. 2: finished report. 3: only a failed report. 4: also in another profile. 5: nothing.
    const run = startRun(db);
    ingestSavedPage(db, run.runId, { items: [{ media: media("1") }], more_available: false });
    finishRun(db, run.runId, { ok: true });
    queueReport(db, "2", opts, 1);
    finishReport(db, "2", { markdown: "## Summary\nok", frameCount: 1, transcribeModel: null }, 2);
    queueReport(db, "3", opts, 1);
    failReport(db, "3", "quota", null, 2);
    const other = startProfileRun(db, { mode: "add", payload: info({ id: "88", username: "other" }) });
    ingestProfilePage(db, other.runId, feed(["4"], null));

    expect(removeProfile(db, "77").sort()).toEqual(["3", "5"]);
    expect(db.select({ id: posts.id }).from(posts).orderBy(asc(posts.id)).all().map((r) => r.id)).toEqual(["1", "2", "4"]);
    expect(db.select().from(profiles).all().map((p) => p.authorId)).toEqual(["88"]);
  });

  it("keeps a post whose report is still being made", () => {
    addProfile([feed(["1", "2"], null)]);
    queueReport(db, "1", opts, 1);
    expect(removeProfile(db, "77")).toEqual(["2"]);
    expect(db.select({ id: posts.id }).from(posts).all()).toEqual([{ id: "1" }]);
  });

  it("throws for an unknown profile", () => {
    expect(() => removeProfile(db, "404")).toThrow();
  });
});

describe("following updates", () => {
  const page = (ids: string[], next: string | null) => ({ users: ids.map((id) => ({ pk: id, username: `u${id}`, profile_pic_url: `https://scontent.cdninstagram.com/${id}.jpg` })), next_max_id: next });
  const ids = () => db.select({ id: following.authorId }).from(following).orderBy(asc(following.position)).all().map((r) => r.id);

  it("stores accounts in Instagram's order and removes unfollowed ones after a complete walk", () => {
    const a = startFollowingRun(db, 1);
    expect(ingestFollowingPage(db, a.runId, page(["1", "2"], "C"))).toEqual({ seen: 2 });
    ingestFollowingPage(db, a.runId, page(["3"], null));
    finishLoadRun(db, a.runId, { ok: true }, 5);
    expect(ids()).toEqual(["1", "2", "3"]);
    expect(getSetting(db, FOLLOWING_UPDATED_AT)).toBe("5");

    const b = startFollowingRun(db, 6);
    ingestFollowingPage(db, b.runId, page(["4", "1"], null));
    finishLoadRun(db, b.runId, { ok: true }, 7);
    expect(ids()).toEqual(["4", "1"]);
  });

  it("removes nothing when the walk stopped early", () => {
    const a = startFollowingRun(db);
    ingestFollowingPage(db, a.runId, page(["1", "2"], null));
    finishLoadRun(db, a.runId, { ok: true });
    const b = startFollowingRun(db);
    ingestFollowingPage(db, b.runId, page(["3"], "MORE"));
    finishLoadRun(db, b.runId, { ok: true });
    expect(ids().sort()).toEqual(["1", "2", "3"]);
  });

  it("stores the error of a failed run", () => {
    const a = startFollowingRun(db);
    finishLoadRun(db, a.runId, { ok: false, code: "rate_limited", message: "slow" });
    expect(db.select().from(loadRuns).get()).toMatchObject({ status: "error", errorCode: "rate_limited" });
  });
});
