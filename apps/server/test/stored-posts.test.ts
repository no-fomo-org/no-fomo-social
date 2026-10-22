import { beforeEach, describe, expect, it } from "vitest";
import page1 from "@no-fomo-social/core/fixtures/saved-page-1.json";
import page2 from "@no-fomo-social/core/fixtures/saved-page-2.json";
import mediaInfo from "@no-fomo-social/core/fixtures/media-info.json";
import { eq } from "drizzle-orm";
import { openDb, type Db } from "../src/db/open";
import { posts, savedPosts } from "../src/db/schema";
import { finishRun, ingestMediaInfo, ingestSavedPage, NotFoundError, startRun } from "../src/sync/ingest";
import { finishReport, queueReport } from "../src/analyze/report-store";
import { getPostMedia, listPosts, listReports, postStates } from "../src/queries";

const ID = "3500000000000000002";
const opts = { language: "English", reportModel: "m", transcribeModel: "t" };
const report = (db: Db, id: string, text: string, at: number) => {
  queueReport(db, id, opts, at);
  finishReport(db, id, { markdown: `## Summary\n${text}\n`, frameCount: 1, transcribeModel: null }, at);
};

let db: Db;
beforeEach(() => { db = openDb(":memory:"); });

describe("posts stored on demand (Analyze on an account page)", () => {
  it("stores a post that is not saved, and Saved does not show it", () => {
    const jobs = ingestMediaInfo(db, ID, mediaInfo, { store: true });
    expect(jobs.some((j) => j.kind === "thumb" && j.id === ID)).toBe(true);
    expect(db.select({ id: posts.id }).from(posts).all()).toEqual([{ id: ID }]);
    expect(db.select().from(savedPosts).all()).toEqual([]);
    expect(listPosts(db, { limit: 50 }).total).toBe(0);
    expect(getPostMedia(db, ID)!.parts).toHaveLength(1);
  });

  it("refuses links for an unknown post unless asked to store it", () => {
    expect(() => ingestMediaInfo(db, ID, mediaInfo, { store: false })).toThrow(NotFoundError);
    expect(db.select().from(posts).all()).toEqual([]);
  });

  it("storing a saved post keeps its saved place", () => {
    const run = startRun(db);
    ingestSavedPage(db, run.runId, page1);
    ingestSavedPage(db, run.runId, page2);
    finishRun(db, run.runId, { ok: true });
    const before = db.select().from(savedPosts).where(eq(savedPosts.postId, ID)).get();
    ingestMediaInfo(db, ID, mediaInfo, { store: true });
    expect(db.select().from(savedPosts).where(eq(savedPosts.postId, ID)).get()).toEqual(before);
    expect(db.select().from(posts).all()).toHaveLength(4);
  });
});

describe("known posts and report sources", () => {
  beforeEach(() => {
    // Page 2 does not contain ID, so ID is stored only because it was analyzed.
    const run = startRun(db);
    ingestSavedPage(db, run.runId, page2);
    finishRun(db, run.runId, { ok: true });
    ingestMediaInfo(db, ID, mediaInfo, { store: true });
    report(db, ID, "about grids", 200);
  });

  it("says for each stored post whether it is saved and has a report", () => {
    const savedId = listPosts(db, { limit: 1 }).items[0]!.id;
    expect(postStates(db, [savedId, ID, "999"]).sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      { id: savedId, saved: true, hasReport: false },
      { id: ID, saved: false, hasReport: true },
    ].sort((a, b) => a.id.localeCompare(b.id)));
    expect(postStates(db, [])).toEqual([]);
  });

  it("filters reports by saved and not saved", () => {
    const savedId = listPosts(db, { limit: 1 }).items[0]!.id;
    report(db, savedId, "about reels", 100);
    expect(listReports(db, { limit: 10, source: "saved" }).items.map((r) => r.id)).toEqual([savedId]);
    expect(listReports(db, { limit: 10, source: "other" }).items.map((r) => [r.id, r.saved])).toEqual([[ID, false]]);
  });
});
