import { eq, lt, sql } from "drizzle-orm";
import { parseFollowingPage, type SyncResult } from "@no-fomo-social/core";
import type { Db } from "../db/open";
import { following, followingRuns } from "../db/schema";
import { setSetting, type Q } from "../db/settings";
import { NotFoundError, RunNotActiveError, upsertAuthor } from "./ingest";

export const FOLLOWING_UPDATED_AT = "following_updated_at";

function activeRun(q: Q, runId: number) {
  const run = q.select().from(followingRuns).where(eq(followingRuns.id, runId)).get();
  if (!run) throw new NotFoundError(`Following update ${runId} not found`);
  if (run.status !== "running") throw new RunNotActiveError(`Following update ${runId} is ${run.status}`);
  return run;
}

/** A run left behind by a closed tab would look busy forever, so a new run replaces it. */
export function startFollowingRun(db: Db, now = Date.now()) {
  return db.transaction((tx) => {
    tx.update(followingRuns)
      .set({ status: "error", finishedAt: now, errorCode: "interrupted", errorMessage: "A new update started before this one finished." })
      .where(eq(followingRuns.status, "running"))
      .run();
    const run = tx.insert(followingRuns).values({ status: "running", startedAt: now, activeAt: now }).returning({ id: followingRuns.id }).get();
    return { runId: run.id };
  });
}

export function ingestFollowingPage(db: Db, runId: number, raw: unknown, now = Date.now()) {
  const page = parseFollowingPage(raw);
  return db.transaction((tx) => {
    const run = activeRun(tx, runId);
    let pos = run.nextPos;
    let duplicates = 0;
    for (const a of page.items) {
      const seen = tx.select({ runId: following.lastSeenRunId }).from(following).where(eq(following.authorId, a.id)).get();
      if (seen?.runId === runId) {
        duplicates++;
        continue;
      }
      // Avatars are fetched when the list shows them, not all at once.
      upsertAuthor(tx, a, []);
      const position = pos++;
      tx.insert(following)
        .values({ authorId: a.id, position, lastSeenRunId: runId })
        .onConflictDoUpdate({ target: following.authorId, set: { position, lastSeenRunId: runId } })
        .run();
    }
    tx.update(followingRuns)
      .set({
        nextPos: pos, pages: sql`${followingRuns.pages} + 1`, items: sql`${followingRuns.items} + ${page.items.length}`,
        duplicates: sql`${followingRuns.duplicates} + ${duplicates}`,
        complete: !page.moreAvailable && run.duplicates + duplicates === 0, activeAt: now,
      })
      .where(eq(followingRuns.id, runId))
      .run();
    return { seen: page.items.length };
  });
}

export function finishFollowingRun(db: Db, runId: number, result: SyncResult, now = Date.now()) {
  db.transaction((tx) => {
    const run = tx.select().from(followingRuns).where(eq(followingRuns.id, runId)).get();
    if (!run) throw new NotFoundError(`Following update ${runId} not found`);
    if (run.status !== "running") return;
    if (!result.ok) {
      tx.update(followingRuns)
        .set({ status: "error", finishedAt: now, errorCode: result.code, errorMessage: result.message })
        .where(eq(followingRuns.id, runId))
        .run();
      return;
    }
    // Only a walk to the end proves an account is no longer followed.
    if (run.complete) tx.delete(following).where(lt(following.lastSeenRunId, runId)).run();
    setSetting(tx, FOLLOWING_UPDATED_AT, String(now));
    tx.update(followingRuns).set({ status: "done", finishedAt: now }).where(eq(followingRuns.id, runId)).run();
  });
}

export function failStaleFollowingRuns(db: Db, now = Date.now()) {
  db.update(followingRuns)
    .set({ status: "error", finishedAt: now, errorCode: "interrupted", errorMessage: "The app was restarted during the update." })
    .where(eq(followingRuns.status, "running"))
    .run();
}
