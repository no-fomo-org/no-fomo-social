import { beforeEach, describe, expect, it } from "vitest";
import page1 from "@no-fomo/core/fixtures/saved-page-1.json";
import page2 from "@no-fomo/core/fixtures/saved-page-2.json";
import { openDb, type Db } from "../src/db/open";
import { listPosts } from "../src/queries";
import { finishRun, ingestSavedPage, startRun } from "../src/sync/ingest";

let db: Db;
const codes = (q: string, extra: Partial<Parameters<typeof listPosts>[1]> = {}) =>
  listPosts(db, { q, limit: 50, ...extra }).items.map((p) => p.code);

beforeEach(() => {
  db = openDb(":memory:");
  const { runId } = startRun(db);
  ingestSavedPage(db, runId, page1);
  ingestSavedPage(db, runId, page2);
  finishRun(db, runId, { ok: true });
});

describe("post search", () => {
  it("finds words in captions, case-insensitive", () => {
    expect(codes("CLAUDE")).toEqual(["DAbcReel01"]);
  });

  it("finds Cyrillic hashtags and words", () => {
    expect(codes("нейросети")).toEqual(["DAbcReel01"]);
    expect(codes("Подписывайся")).toEqual(["DAbcReel01"]);
  });

  it("matches word starts, so partial author names work", () => {
    expect(codes("devt")).toEqual(["DAbcReel01", "DAbcCar003"]);
  });

  it("searches music, place and image descriptions", () => {
    expect(codes("midnight city")).toEqual(["DAbcReel01"]);
    expect(codes("berlin")).toEqual(["DAbcImg002"]);
    expect(codes("laptop")).toEqual(["DAbcCar003"]);
  });

  it("needs every word to match", () => {
    expect(codes("setup guide")).toEqual(["DAbcCar003"]);
    expect(codes("setup berlin")).toEqual([]);
  });

  it("combines with filters and keeps the total right", () => {
    expect(codes("devt", { kind: "carousel" })).toEqual(["DAbcCar003"]);
    expect(listPosts(db, { q: "devt", limit: 50 }).total).toBe(2);
  });

  it("ignores empty or symbol-only input instead of failing", () => {
    expect(codes("   ")).toHaveLength(4);
    expect(() => codes('"*( NEAR) -')).not.toThrow();
  });

  it("updates the index when a caption changes", () => {
    const edited = { ...page1.items[1]!.media, caption: { text: "Typography pairing notes" } };
    const { runId } = startRun(db);
    ingestSavedPage(db, runId, { items: [{ media: edited }], more_available: true, next_max_id: "N" });
    expect(codes("thanks")).toEqual([]); // only in the old caption
    expect(codes("typography")).toEqual(["DAbcImg002"]);
  });
});
