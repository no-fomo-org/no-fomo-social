import { beforeEach, describe, expect, it } from "vitest";
import { asc } from "drizzle-orm";
import { openDb, type Db } from "../src/db/open";
import { following, followingRuns } from "../src/db/schema";
import { getSetting } from "../src/db/settings";
import {
  FOLLOWING_UPDATED_AT, finishFollowingRun, ingestFollowingPage, startFollowingRun,
} from "../src/sync/following";

let db: Db;
beforeEach(() => { db = openDb(":memory:"); });

const page = (ids: string[], next: string | null) => ({
  users: ids.map((id) => ({ pk: id, username: `u${id}`, profile_pic_url: `https://scontent.cdninstagram.com/${id}.jpg` })),
  next_max_id: next,
});
const ids = () => db.select({ id: following.authorId }).from(following).orderBy(asc(following.position)).all().map((r) => r.id);

describe("following updates", () => {
  it("stores accounts in Instagram's order and removes unfollowed ones after a complete walk", () => {
    const a = startFollowingRun(db, 1);
    expect(ingestFollowingPage(db, a.runId, page(["1", "2"], "C"))).toEqual({ seen: 2 });
    ingestFollowingPage(db, a.runId, page(["3"], null));
    finishFollowingRun(db, a.runId, { ok: true }, 5);
    expect(ids()).toEqual(["1", "2", "3"]);
    expect(getSetting(db, FOLLOWING_UPDATED_AT)).toBe("5");

    const b = startFollowingRun(db, 6);
    ingestFollowingPage(db, b.runId, page(["4", "1"], null));
    finishFollowingRun(db, b.runId, { ok: true }, 7);
    expect(ids()).toEqual(["4", "1"]);
  });

  it("removes nothing when the walk stopped early", () => {
    const a = startFollowingRun(db);
    ingestFollowingPage(db, a.runId, page(["1", "2"], null));
    finishFollowingRun(db, a.runId, { ok: true });
    const b = startFollowingRun(db);
    ingestFollowingPage(db, b.runId, page(["3"], "MORE"));
    finishFollowingRun(db, b.runId, { ok: true });
    expect(ids().sort()).toEqual(["1", "2", "3"]);
  });

  it("stores the error of a failed run", () => {
    const a = startFollowingRun(db);
    finishFollowingRun(db, a.runId, { ok: false, code: "rate_limited", message: "slow" });
    expect(db.select().from(followingRuns).get()).toMatchObject({ status: "error", errorCode: "rate_limited" });
  });

  it("a new run stops an unfinished one, whose pages are then refused", () => {
    const a = startFollowingRun(db);
    startFollowingRun(db);
    expect(db.select().from(followingRuns).all()[0]).toMatchObject({ status: "error", errorCode: "interrupted" });
    expect(() => ingestFollowingPage(db, a.runId, page(["1"], null))).toThrow();
  });
});
