import { beforeEach, describe, expect, it } from "vitest";
import { desc, eq, isNull } from "drizzle-orm";
import page1 from "@no-fomo/core/fixtures/saved-page-1.json";
import page2 from "@no-fomo/core/fixtures/saved-page-2.json";
import collectionsList from "@no-fomo/core/fixtures/collections-list.json";
import { openDb, type Db } from "../src/db/open";
import { posts, postCollections, savedPosts, settings, syncRuns } from "../src/db/schema";
import {
  finishRun, ingestCollections, ingestSavedPage, lastFullAt, RunNotActiveError, startRun,
} from "../src/sync/ingest";
import { listCollections } from "../src/queries";

const media = (pk: string) => ({
  pk, code: `C${pk}`, media_type: 1, taken_at: 1, user: { pk: "9", username: "new_author" },
  image_versions2: { candidates: [{ width: 480, height: 600, url: `https://scontent.cdninstagram.com/${pk}.jpg` }] },
});
const pageOf = (pks: string[], more: boolean) => ({
  items: pks.map((pk) => ({ media: media(pk) })), more_available: more, next_max_id: more ? "N" : undefined,
});
const order = (db: Db) => db.select({ id: savedPosts.postId }).from(savedPosts).orderBy(desc(savedPosts.sortKey)).all().map((r) => r.id);

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

  it("walks the whole feed once more after the app learns to read new fields", () => {
    const r1 = startRun(db);
    ingestSavedPage(db, r1.runId, page2);
    finishRun(db, r1.runId, { ok: true });
    db.delete(settings).where(eq(settings.key, "feed_version")).run(); // data stored by an older version
    const r2 = startRun(db);
    expect(r2.mode).toBe("full");
    expect(ingestSavedPage(db, r2.runId, page2).stop).toBe(false);
    finishRun(db, r2.runId, { ok: true });
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
  const links = () =>
    db.select().from(postCollections).all().map((l) => `${l.postId}>${l.collectionId}`).sort();

  it("links posts to collections from saved_collection_ids, even without names", () => {
    const r1 = startRun(db);
    ingestSavedPage(db, r1.runId, page1);
    expect(links()).toEqual([
      "3500000000000000001>17900000000000002",
      "3500000000000000003>17900000000000002",
      "3500000000000000003>17900000000000003",
    ]);
    expect(listCollections(db)).toEqual([
      { id: "17900000000000002", name: null, count: 2 },
      { id: "17900000000000003", name: null, count: 1 },
    ]);
  });

  it("adds names from the collections list when Instagram sends it", () => {
    const r1 = startRun(db);
    ingestSavedPage(db, r1.runId, page1);
    expect(ingestCollections(db, r1.runId, collectionsList).collections.map((c) => c.name)).toEqual(["AI tools", "Design"]);
    expect(listCollections(db).map((c) => c.name)).toEqual(["AI tools", "Design"]);
  });

  it("replaces a post's links when its collections change", () => {
    const r1 = startRun(db);
    ingestSavedPage(db, r1.runId, page1);
    finishRun(db, r1.runId, { ok: true });
    const moved = { ...page1.items[0]!.media, saved_collection_ids: ["17900000000000003"] };
    const r2 = startRun(db);
    ingestSavedPage(db, r2.runId, { items: [{ media: moved }], more_available: true, next_max_id: "N" });
    expect(links().filter((l) => l.startsWith("3500000000000000001"))).toEqual(["3500000000000000001>17900000000000003"]);
  });
});

describe("full resync", () => {
  const ids = (n: number, from = 100) => Array.from({ length: n }, (_, i) => String(from + i));
  function syncAll(pks: string[], mode?: "full") {
    const r = startRun(db, mode);
    ingestSavedPage(db, r.runId, pageOf(pks, false));
    finishRun(db, r.runId, { ok: true });
    return r;
  }
  const visible = () => db.select({ id: savedPosts.postId }).from(savedPosts).where(isNull(savedPosts.removedRemotelyAt)).all().map((r) => r.id).sort();
  const runRow = (id: number) => db.select().from(syncRuns).where(eq(syncRuns.id, id)).get()!;

  it("runs in full mode when asked", () => {
    syncAll(ids(3));
    expect(startRun(db).mode).toBe("incremental");
    expect(startRun(db, "full").mode).toBe("full");
  });

  it("hides posts a complete full run did not see and counts them", () => {
    syncAll(ids(10));
    expect(lastFullAt(db)).not.toBeNull(); // the first backfill was a full walk too
    const r = syncAll(ids(9), "full"); // "109" was unsaved on Instagram
    expect(visible()).toEqual(ids(9));
    expect(runRow(r.runId)).toMatchObject({ status: "done", postsRemoved: 1, warning: null });
  });

  it("never hides after an incremental run", () => {
    syncAll(ids(10));
    syncAll(["100"]);
    expect(visible()).toHaveLength(10);
  });

  it("never hides after a full run that stopped early or failed", () => {
    syncAll(ids(10));
    const cut = startRun(db, "full");
    ingestSavedPage(db, cut.runId, pageOf(ids(5), true));
    finishRun(db, cut.runId, { ok: true });
    expect(visible()).toHaveLength(10);
    const failed = startRun(db, "full");
    ingestSavedPage(db, failed.runId, pageOf(ids(5), false));
    finishRun(db, failed.runId, { ok: false, code: "rate_limited", message: "slow down" });
    expect(visible()).toHaveLength(10);
  });

  it("hides nothing and warns when more than 30% and more than 20 posts would go", () => {
    syncAll(ids(100));
    const r = syncAll(ids(69), "full");
    expect(visible()).toHaveLength(100);
    expect(runRow(r.runId)).toMatchObject({ postsRemoved: 0, warning: "Full resync found too many missing posts. Nothing was hidden. Try again later." });
  });

  it("allows exactly 30%", () => {
    syncAll(ids(100));
    syncAll(ids(70), "full");
    expect(visible()).toHaveLength(70);
  });

  it("lets a small library lose up to 20 posts at once", () => {
    syncAll(ids(25));
    syncAll(ids(5), "full");
    expect(visible()).toHaveLength(5);
  });

  it("hides nothing when some posts in the run could not be read", () => {
    syncAll(ids(10));
    const r = startRun(db, "full");
    const page = pageOf(ids(9), false);
    page.items.push({ media: { pk: "109" } as never }); // unreadable: no code, no user
    ingestSavedPage(db, r.runId, page);
    finishRun(db, r.runId, { ok: true });
    expect(visible()).toHaveLength(10);
    expect(runRow(r.runId).warning).toBe("Some posts could not be read. Nothing was hidden.");
  });

  it("hides nothing when the last page did not clearly say it was the end", () => {
    syncAll(ids(10));
    const r = startRun(db, "full");
    ingestSavedPage(db, r.runId, { items: ids(9).map((pk) => ({ media: media(pk) })) });
    finishRun(db, r.runId, { ok: true });
    expect(visible()).toHaveLength(10);
  });

  it("shows a hidden post again when it comes back", () => {
    syncAll(ids(10));
    syncAll(ids(9), "full");
    syncAll(ids(10), "full");
    expect(visible()).toHaveLength(10);
  });
});
