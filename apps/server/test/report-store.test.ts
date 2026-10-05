import { beforeEach, describe, expect, it } from "vitest";
import page1 from "@no-fomo/core/fixtures/saved-page-1.json";
import { openDb, type Db } from "../src/db/open";
import { failReport, failStaleReports, finishReport, getReport, queueReport, setReportStep } from "../src/analyze/report-store";
import { listPosts } from "../src/queries";
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

  it("shows hasReport, filters by it and searches report text", () => {
    expect(listPosts(db, { limit: 50, report: true }).total).toBe(0);
    queueReport(db, id, opts, 1);
    finishReport(db, id, { markdown: "spoken word zanzibar", frameCount: 1, transcribeModel: null }, 2);
    const page = listPosts(db, { limit: 50, report: true });
    expect(page.items.map((p) => [p.id, p.hasReport])).toEqual([[id, true]]);
    expect(listPosts(db, { limit: 50, q: "zanzibar" }).items.map((p) => p.id)).toEqual([id]);
    finishReport(db, id, { markdown: "now about kilimanjaro", frameCount: 1, transcribeModel: null }, 3);
    expect(listPosts(db, { limit: 50, q: "zanzibar" }).total).toBe(0);
  });
});
