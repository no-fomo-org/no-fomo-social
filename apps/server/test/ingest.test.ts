import { beforeEach, describe, expect, it } from "vitest";
import { desc } from "drizzle-orm";
import page1 from "@no-fomo/core/fixtures/saved-page-1.json";
import page2 from "@no-fomo/core/fixtures/saved-page-2.json";
import collectionsList from "@no-fomo/core/fixtures/collections-list.json";
import { openDb, type Db } from "../src/db/open";
import { posts, postCollections, syncRuns } from "../src/db/schema";
import {
  finishRun, ingestCollectionPage, ingestCollections, ingestSavedPage, RunNotActiveError, startRun,
} from "../src/sync/ingest";

const media = (pk: string) => ({
  pk, code: `C${pk}`, media_type: 1, taken_at: 1, user: { pk: "9", username: "new_author" },
  image_versions2: { candidates: [{ width: 480, height: 600, url: `https://scontent.cdninstagram.com/${pk}.jpg` }] },
});
const pageOf = (pks: string[], more: boolean) => ({
  items: pks.map((pk) => ({ media: media(pk) })), more_available: more, next_max_id: more ? "N" : undefined,
});
const order = (db: Db) => db.select({ id: posts.id }).from(posts).orderBy(desc(posts.sortKey)).all().map((r) => r.id);

let db: Db;
beforeEach(() => { db = openDb(":memory:"); });

describe("saved feed ingest", () => {
  it("first run is full, keeps feed order and marks backfill complete at the end", () => {
    const { runId, mode } = startRun(db);
    expect(mode).toBe("full");
    const a = ingestSavedPage(db, runId, page1);
    expect(a).toMatchObject({ stop: false, newCount: 3, seen: 3, skipped: 0 });
    expect(a.jobs.filter((j) => j.kind === "thumb")).toHaveLength(3);
    ingestSavedPage(db, runId, page2);
    finishRun(db, runId, { ok: true });
    expect(order(db)).toEqual(["3500000000000000001", "3500000000000000002", "3500000000000000003", "3500000000000000004"]);
    expect(startRun(db).mode).toBe("incremental");
  });

  it("incremental run puts new posts on top and stops at the first known post", () => {
    const r1 = startRun(db);
    ingestSavedPage(db, r1.runId, page1);
    ingestSavedPage(db, r1.runId, page2);
    finishRun(db, r1.runId, { ok: true });

    const r2 = startRun(db);
    const res = ingestSavedPage(db, r2.runId, pageOf(["100", "101", "3500000000000000001"], true));
    expect(res).toMatchObject({ stop: true, newCount: 2 });
    expect(order(db).slice(0, 3)).toEqual(["100", "101", "3500000000000000001"]);
  });

  it("an interrupted first sync is retried in full mode and does not stop early", () => {
    const r1 = startRun(db);
    ingestSavedPage(db, r1.runId, page1);
    finishRun(db, r1.runId, { ok: false, code: "rate_limited", message: "slow down" });

    const r2 = startRun(db);
    expect(r2.mode).toBe("full");
    expect(ingestSavedPage(db, r2.runId, page1).stop).toBe(false);
    ingestSavedPage(db, r2.runId, page2);
    expect(order(db)).toEqual(["3500000000000000001", "3500000000000000002", "3500000000000000003", "3500000000000000004"]);
  });

  it("does not stop on posts from a later sync that was cut off, and keeps feed order", () => {
    const r1 = startRun(db);
    ingestSavedPage(db, r1.runId, page1);
    ingestSavedPage(db, r1.runId, page2);
    finishRun(db, r1.runId, { ok: true });

    const r2 = startRun(db);
    expect(ingestSavedPage(db, r2.runId, pageOf(["201", "202"], true)).stop).toBe(false);
    finishRun(db, r2.runId, { ok: false, code: "rate_limited", message: "slow down" });

    const r3 = startRun(db);
    expect(ingestSavedPage(db, r3.runId, pageOf(["200", "201", "202"], true)).stop).toBe(false);
    expect(ingestSavedPage(db, r3.runId, pageOf(["203", "3500000000000000001"], true)).stop).toBe(true);
    expect(order(db).slice(0, 5)).toEqual(["200", "201", "202", "203", "3500000000000000001"]);
  });

  it("rejects pages for finished runs and fails runs left running", () => {
    const r1 = startRun(db);
    finishRun(db, r1.runId, { ok: true });
    expect(() => ingestSavedPage(db, r1.runId, page1)).toThrow(RunNotActiveError);

    const r2 = startRun(db);
    startRun(db);
    const old = db.select().from(syncRuns).all().find((r) => r.id === r2.runId)!;
    expect(old).toMatchObject({ status: "error", errorCode: "interrupted" });
  });
});

describe("collections ingest", () => {
  it("stores user collections and links posts; stops on a known link after backfill", () => {
    const r1 = startRun(db);
    ingestSavedPage(db, r1.runId, page1);
    expect(ingestCollections(db, r1.runId, collectionsList).collections.map((c) => c.name)).toEqual(["AI tools", "Design"]);
    const coll = "17900000000000002";
    const first = ingestCollectionPage(db, r1.runId, coll, { items: [{ media: page1.items[0]!.media }], more_available: false });
    expect(first.stop).toBe(false);
    expect(db.select().from(postCollections).all()).toHaveLength(1);
    finishRun(db, r1.runId, { ok: true });

    const r2 = startRun(db);
    const again = ingestCollectionPage(db, r2.runId, coll, { items: [{ media: page1.items[0]!.media }], more_available: true, next_max_id: "N" });
    expect(again.stop).toBe(true);
  });

  it("puts posts that only appear in a collection at the bottom", () => {
    const r1 = startRun(db);
    ingestSavedPage(db, r1.runId, page1);
    ingestCollections(db, r1.runId, collectionsList);
    ingestCollectionPage(db, r1.runId, "17900000000000003", pageOf(["555"], false));
    expect(order(db).at(-1)).toBe("555");
  });
});
