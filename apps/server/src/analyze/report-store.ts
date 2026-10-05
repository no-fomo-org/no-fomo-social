import { eq, inArray, sql } from "drizzle-orm";
import type { AnalyzeErrorCode, PostReport, ReportStep } from "@no-fomo/core";
import type { Db } from "../db/open";
import { reports } from "../db/schema";

export function getReport(db: Db, postId: string): PostReport | null {
  const r = db.select().from(reports).where(eq(reports.postId, postId)).get();
  return r ? { ...r, errorCode: r.errorCode as AnalyzeErrorCode | null } : null;
}

export function queueReport(db: Db, postId: string, o: { language: string; reportModel: string; transcribeModel: string }, now: number): PostReport {
  const row = {
    status: "queued" as const, step: null, language: o.language, reportModel: o.reportModel, transcribeModel: o.transcribeModel,
    errorCode: null, errorMessage: null, createdAt: now, finishedAt: null,
  };
  db.insert(reports).values({ postId, ...row }).onConflictDoUpdate({ target: reports.postId, set: row }).run();
  return getReport(db, postId)!;
}

export function setReportStep(db: Db, postId: string, step: ReportStep) {
  db.update(reports).set({ status: "running", step }).where(eq(reports.postId, postId)).run();
}

export function finishReport(db: Db, postId: string, o: { markdown: string; frameCount: number; transcribeModel: string | null }, now: number) {
  db.transaction((tx) => {
    tx.update(reports)
      .set({ status: "done", step: null, markdown: o.markdown, frameCount: o.frameCount, transcribeModel: o.transcribeModel, finishedAt: now })
      .where(eq(reports.postId, postId))
      .run();
    tx.run(sql`DELETE FROM report_search WHERE post_id = ${postId}`);
    tx.run(sql`INSERT INTO report_search (post_id, body) VALUES (${postId}, ${o.markdown})`);
  });
}

export function failReport(db: Db, postId: string, code: AnalyzeErrorCode, message: string | null, now: number) {
  db.update(reports).set({ status: "error", step: null, errorCode: code, errorMessage: message, finishedAt: now }).where(eq(reports.postId, postId)).run();
}

export function failStaleReports(db: Db, now: number) {
  db.update(reports)
    .set({ status: "error", step: null, errorCode: "interrupted", errorMessage: null, finishedAt: now })
    .where(inArray(reports.status, ["queued", "running"]))
    .run();
}
