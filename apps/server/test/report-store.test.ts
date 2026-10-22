import { beforeEach, describe, expect, it } from "vitest";
import page1 from "@no-fomo-social/core/fixtures/saved-page-1.json";
import { openDb, type Db } from "../src/db/open";
import { deleteReport, failReport, failStaleReports, finishReport, getReport, queueReport, setReportStep } from "../src/analyze/report-store";
import { listPosts, listReports } from "../src/queries";
import { finishRun, ingestSavedPage, startRun } from "../src/sync/ingest";

let db: Db;
let id: string;
const opts = { language: "English", reportModel: "gpt-5.4-mini", transcribeModel: "gpt-transcribe" };

beforeEach(() => {
  db = openDb(":memory:");
  const { runId } = startRun(db);
  ingestSavedPage(db, runId, page1);
  finishRun(db, runId, { ok: true });
  id = listPosts(db, { limit: 1 }).items[0]!.id;
});

describe("report store", () => {
  it("moves from queued to running to done", () => {
    expect(getReport(db, id)).toBeNull();
    expect(queueReport(db, id, opts, 1).status).toBe("queued");
    setReportStep(db, id, "frames");
    expect(getReport(db, id)).toMatchObject({ status: "running", step: "frames" });
    finishReport(db, id, { markdown: "# r\nzanzibar", frameCount: 12, transcribeModel: null }, 2);
    expect(getReport(db, id)).toMatchObject({ status: "done", step: null, markdown: "# r\nzanzibar", frameCount: 12, transcribeModel: null, finishedAt: 2 });
  });

  it("keeps the last good report when a re-run fails", () => {
    queueReport(db, id, opts, 1);
    finishReport(db, id, { markdown: "old", frameCount: 1, transcribeModel: null }, 2);
    queueReport(db, id, opts, 3);
    failReport(db, id, "quota", null, 4);
    expect(getReport(db, id)).toMatchObject({ status: "error", errorCode: "quota", markdown: "old" });
  });

  it("marks unfinished jobs as interrupted on startup", () => {
    queueReport(db, id, opts, 1);
    failStaleReports(db, 5);
    expect(getReport(db, id)).toMatchObject({ status: "error", errorCode: "interrupted", finishedAt: 5 });
  });

  it("shows hasReport and searches report text", () => {
    queueReport(db, id, opts, 1);
    finishReport(db, id, { markdown: "spoken word zanzibar", frameCount: 1, transcribeModel: null }, 2);
    expect(listPosts(db, { limit: 50 }).items.find((p) => p.id === id)!.hasReport).toBe(true);
    expect(listPosts(db, { limit: 50, q: "zanzibar" }).items.map((p) => p.id)).toEqual([id]);
    finishReport(db, id, { markdown: "now about kilimanjaro", frameCount: 1, transcribeModel: null }, 3);
    expect(listPosts(db, { limit: 50, q: "zanzibar" }).total).toBe(0);
  });

  it("deletes a finished report with its search text, but not a running one", () => {
    expect(deleteReport(db, id)).toBe("not_found");
    queueReport(db, id, opts, 1);
    expect(deleteReport(db, id)).toBe("busy");
    finishReport(db, id, { markdown: "spoken word zanzibar", frameCount: 1, transcribeModel: null }, 2);
    expect(deleteReport(db, id)).toBe("deleted");
    expect(getReport(db, id)).toBeNull();
    expect(listPosts(db, { limit: 50 }).items.find((p) => p.id === id)!.hasReport).toBe(false);
    expect(listPosts(db, { limit: 50, q: "zanzibar" }).total).toBe(0);
    expect(listReports(db, { limit: 50 }).total).toBe(0);
  });
});
