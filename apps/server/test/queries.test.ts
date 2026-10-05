import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../src/db/open";
import { finishRun, ingestSavedPage, startRun } from "../src/sync/ingest";
import { finishLoadRun, ingestFollowingPage, ingestProfilePage, startFollowingRun, startProfileRun } from "../src/sync/loads";
import { finishReport, queueReport } from "../src/analyze/report-store";
import { listAuthors, listFollowing, listPosts, listProfiles, listReports } from "../src/queries";

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
  // Saved: 1 (author 5), 2 (author 77, also in profile 77).
  const run = startRun(db);
  ingestSavedPage(db, run.runId, { items: [{ media: media("1", "5") }, { media: media("2", "77") }], more_available: false });
  finishRun(db, run.runId, { ok: true });
  // Profile 77: 2, 3, 4 (3 and 4 same time).
  const p = startProfileRun(db, { mode: "add", payload: { data: { user: { id: "77", username: "u77" } } } }, 10);
  ingestProfilePage(db, p.runId, { items: [media("2", "77"), media("3", "77", 1, 50), media("4", "77", 2, 50)], more_available: true, next_max_id: "N" });
  finishLoadRun(db, p.runId, { ok: true }, 11);
});

describe("posts by scope", () => {
  it("saved scope shows only saved posts, with badges", () => {
    const page = listPosts(db, { limit: 50 });
    expect(page.items.map((p) => [p.id, p.saved, p.profiles])).toEqual([["1", true, []], ["2", true, ["u77"]]]);
  });

  it("profile scope shows the profile's posts newest first and pages without skipping equal times", () => {
    const a = listPosts(db, { profile: "77", limit: 1 });
    expect(a.items.map((p) => p.id)).toEqual(["4"]);
    expect(a.nextCursor).toBe("50.4");
    const b = listPosts(db, { profile: "77", limit: 1, cursor: a.nextCursor! });
    expect(b.items.map((p) => p.id)).toEqual(["3"]);
    const c = listPosts(db, { profile: "77", limit: 5, cursor: b.nextCursor! });
    expect(c.items.map((p) => [p.id, p.saved])).toEqual([["2", true]]);
    expect(listPosts(db, { profile: "77", limit: 5, kind: "video" }).items.map((p) => p.id)).toEqual(["4"]);
  });

  it("a report made from the profile shows on the same post in Saved", () => {
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
    expect(listReports(db, { limit: 50, source: "profile" }).items.map((r) => r.id)).toEqual(["3"]);
    expect(listReports(db, { limit: 50, kind: "video" }).total).toBe(0);
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

describe("profiles and following", () => {
  it("lists profiles with loaded count and last run", () => {
    expect(listProfiles(db)).toEqual([expect.objectContaining({
      id: "77", username: "u77", loadedCount: 3, hasOlder: true, refreshedAt: 11, avatarUrl: "/media/avatars/77",
      run: expect.objectContaining({ status: "done", mode: "add", pages: 1, items: 3 }),
    })]);
  });

  it("reports a load with no news for over 2 minutes as interrupted, so it can be run again", () => {
    startProfileRun(db, { mode: "refresh", authorId: "77" }, Date.now() - 3 * 60_000);
    expect(listProfiles(db)[0]!.run).toMatchObject({ status: "error", errorCode: "interrupted" });
    startProfileRun(db, { mode: "refresh", authorId: "77" });
    expect(listProfiles(db)[0]!.run).toMatchObject({ status: "running" });
  });

  it("filters the following list by name and marks added profiles", () => {
    const run = startFollowingRun(db);
    ingestFollowingPage(db, run.runId, { users: [
      { pk: "77", username: "u77" }, { pk: "8", username: "maria.codes", full_name: "Maria Lopes" }, { pk: "9", username: "kenji" },
    ] });
    finishLoadRun(db, run.runId, { ok: true }, 99);
    const all = listFollowing(db, { limit: 100 });
    expect(all.items.map((f) => [f.username, f.added])).toEqual([["u77", true], ["maria.codes", false], ["kenji", false]]);
    expect(all.updatedAt).toBe(99);
    expect(listFollowing(db, { q: "LOPES", limit: 100 }).items.map((f) => f.id)).toEqual(["8"]);
    expect(listFollowing(db, { q: "%", limit: 100 }).total).toBe(0);
    expect(listFollowing(db, { limit: 1 })).toMatchObject({ total: 3, items: [expect.objectContaining({ id: "77" })] });
  });
});
