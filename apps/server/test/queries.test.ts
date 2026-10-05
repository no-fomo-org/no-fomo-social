import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../src/db/open";
import { finishRun, ingestMediaInfo, ingestSavedPage, startRun } from "../src/sync/ingest";
import { finishFollowingRun, ingestFollowingPage, startFollowingRun } from "../src/sync/following";
import { finishReport, queueReport } from "../src/analyze/report-store";
import { listAuthors, listFollowing, listPosts, listReports } from "../src/queries";

const media = (pk: string, author: string, kind = 1, takenAt = Number(pk)) => ({
  pk, code: `C${pk}`, media_type: kind, taken_at: takenAt, user: { pk: author, username: `u${author}` },
  image_versions2: { candidates: [{ width: 480, height: 600, url: `https://scontent.cdninstagram.com/${pk}.jpg` }] },
});
const opts = { language: "English", reportModel: "gpt-x", transcribeModel: "t" };
const report = (db: Db, id: string, text: string, at: number) => {
  queueReport(db, id, opts, at);
  finishReport(db, id, { markdown: `# t\n\n## Summary\n${text}\n`, frameCount: 1, transcribeModel: null }, at);
};

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
  // Saved: 1 (author 5), 2 (author 77). Analyzed from an account page: 3 (author 77, a video).
  const run = startRun(db);
  ingestSavedPage(db, run.runId, { items: [{ media: media("1", "5") }, { media: media("2", "77") }], more_available: false });
  finishRun(db, run.runId, { ok: true });
  ingestMediaInfo(db, "3", { items: [media("3", "77", 2)] }, { store: true });
});

describe("saved posts", () => {
  it("shows only saved posts, marked as saved", () => {
    expect(listPosts(db, { limit: 50 }).items.map((p) => [p.id, p.saved])).toEqual([["1", true], ["2", true]]);
  });

  it("a report shows on the saved post", () => {
    report(db, "2", "zanzibar", 100);
    expect(listPosts(db, { limit: 50 }).items.find((p) => p.id === "2")!.hasReport).toBe(true);
  });
});

describe("reports list", () => {
  beforeEach(() => {
    report(db, "1", "about zanzibar", 100);
    report(db, "3", "about kilimanjaro", 200);
  });

  it("lists finished reports newest first with a summary", () => {
    const page = listReports(db, { limit: 50 });
    expect(page.items.map((r) => [r.id, r.summary, r.reportedAt, r.reportModel])).toEqual([
      ["3", "about kilimanjaro", 200, "gpt-x"],
      ["1", "about zanzibar", 100, "gpt-x"],
    ]);
    expect(page.total).toBe(2);
  });

  it("filters by text, author, source and kind", () => {
    expect(listReports(db, { limit: 50, q: "zanzib" }).items.map((r) => r.id)).toEqual(["1"]);
    expect(listReports(db, { limit: 50, author: "77" }).items.map((r) => r.id)).toEqual(["3"]);
    expect(listReports(db, { limit: 50, source: "saved" }).items.map((r) => r.id)).toEqual(["1"]);
    expect(listReports(db, { limit: 50, source: "other" }).items.map((r) => r.id)).toEqual(["3"]);
    expect(listReports(db, { limit: 50, kind: "video" }).items.map((r) => r.id)).toEqual(["3"]);
  });

  it("pages with a cursor", () => {
    const a = listReports(db, { limit: 1 });
    expect(listReports(db, { limit: 1, cursor: a.nextCursor! }).items.map((r) => r.id)).toEqual(["1"]);
  });

  it("lists authors that have reports", () => {
    expect(listAuthors(db, "reports").map((a) => [a.id, a.count])).toEqual([["5", 1], ["77", 1]]);
    expect(listAuthors(db, "saved").map((a) => a.id).sort()).toEqual(["5", "77"]);
  });
});

describe("following list", () => {
  it("filters by name, in Instagram's order", () => {
    const run = startFollowingRun(db);
    ingestFollowingPage(db, run.runId, { users: [
      { pk: "77", username: "u77" }, { pk: "8", username: "maria.codes", full_name: "Maria Lopes" }, { pk: "9", username: "kenji" },
    ] });
    finishFollowingRun(db, run.runId, { ok: true }, 99);
    const all = listFollowing(db, { limit: 100 });
    expect(all.items.map((f) => f.username)).toEqual(["u77", "maria.codes", "kenji"]);
    expect(all.updatedAt).toBe(99);
    expect(listFollowing(db, { q: "LOPES", limit: 100 }).items.map((f) => f.id)).toEqual(["8"]);
    expect(listFollowing(db, { q: "%", limit: 100 }).total).toBe(0);
    expect(listFollowing(db, { limit: 1 })).toMatchObject({ total: 3, items: [expect.objectContaining({ id: "77" })] });
  });

  it("shows an update with no news for over 2 minutes as stopped, so it can run again", () => {
    startFollowingRun(db, Date.now() - 3 * 60_000);
    expect(listFollowing(db, { limit: 10 }).run).toMatchObject({ status: "error", errorCode: "interrupted" });
    startFollowingRun(db);
    expect(listFollowing(db, { limit: 10 }).run).toMatchObject({ status: "running" });
  });
});
