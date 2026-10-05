import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { parseFollowingPage, parseMediaPage, parseProfileInfo, type ProfileLoadMode, type ProfileStartBody, type SyncResult } from "@no-fomo/core";
import type { Db } from "../db/open";
import { following, loadRuns, posts, profilePosts, profiles } from "../db/schema";
import { setSetting, type Q } from "../db/settings";
import { NotFoundError, RunNotActiveError, upsertAuthor, upsertPostContent, type MediaJob } from "./ingest";

export type LoadErrorCode = "profile_not_found" | "private_profile" | "no_more_posts";
export class LoadError extends Error {
  constructor(public readonly code: LoadErrorCode) {
    super(code);
  }
}

export const FOLLOWING_UPDATED_AT = "following_updated_at";

function activeLoad(q: Q, runId: number, kind: "profile" | "following") {
  const run = q.select().from(loadRuns).where(eq(loadRuns.id, runId)).get();
  if (!run || run.kind !== kind) throw new NotFoundError(`Load run ${runId} not found`);
  if (run.status !== "running") throw new RunNotActiveError(`Load run ${runId} is ${run.status}`);
  return run;
}

/** A run left behind by a closed tab would look busy forever, so a new run replaces it. */
function interruptRunning(q: Q, kind: "profile" | "following", authorId: string | null, now: number) {
  q.update(loadRuns)
    .set({ status: "error", finishedAt: now, errorCode: "interrupted", errorMessage: "A new load started before this one finished." })
    .where(and(eq(loadRuns.kind, kind), eq(loadRuns.status, "running"), authorId ? eq(loadRuns.authorId, authorId) : undefined))
    .run();
}

export function startProfileRun(db: Db, body: ProfileStartBody, now = Date.now()) {
  const jobs: MediaJob[] = [];
  return db.transaction((tx) => {
    let authorId: string;
    let mode: ProfileLoadMode = body.mode;
    let cursor: string | null = null;
    if (body.mode === "add") {
      const info = parseProfileInfo(body.payload);
      if (!info) throw new LoadError("profile_not_found");
      if (info.isPrivate && !info.followedByViewer) throw new LoadError("private_profile");
      upsertAuthor(tx, info, jobs);
      authorId = info.id;
      const exists = tx.select({ id: profiles.authorId }).from(profiles).where(eq(profiles.authorId, authorId)).get();
      if (exists) {
        tx.update(profiles).set({ postCount: info.postCount, isPrivate: info.isPrivate }).where(eq(profiles.authorId, authorId)).run();
        const hasPosts = tx.select({ id: profilePosts.postId }).from(profilePosts).where(eq(profilePosts.authorId, authorId)).limit(1).get();
        // Adding again means "get what is new"; a profile whose first load failed starts over.
        if (hasPosts) mode = "refresh";
      } else {
        tx.insert(profiles).values({ authorId, addedAt: now, postCount: info.postCount, isPrivate: info.isPrivate }).run();
      }
    } else {
      const profile = tx.select().from(profiles).where(eq(profiles.authorId, body.authorId)).get();
      if (!profile) throw new NotFoundError(`Profile ${body.authorId} is not in your library`);
      authorId = profile.authorId;
      if (body.mode === "older") {
        if (!profile.olderCursor) throw new LoadError("no_more_posts");
        cursor = profile.olderCursor;
      } else if (!tx.select({ id: profilePosts.postId }).from(profilePosts).where(eq(profilePosts.authorId, authorId)).limit(1).get()) {
        // Nothing loaded yet (the first load failed): start over, so "Load older" gets its cursor.
        mode = "add";
      }
    }
    interruptRunning(tx, "profile", authorId, now);
    const run = tx
      .insert(loadRuns)
      .values({ kind: "profile", authorId, mode, status: "running", startedAt: now, activeAt: now })
      .returning({ id: loadRuns.id })
      .get();
    return { runId: run.id, authorId, cursor, mode, jobs };
  });
}

export function ingestProfilePage(db: Db, runId: number, raw: unknown, now = Date.now()) {
  const page = parseMediaPage(raw);
  const jobs: MediaJob[] = [];
  return db.transaction((tx) => {
    const run = activeLoad(tx, runId, "profile");
    const authorId = run.authorId!;
    let newCount = 0;
    let sawKnown = false;
    for (const p of page.items) {
      upsertPostContent(tx, p, jobs);
      const link = tx
        .select({ mode: loadRuns.mode, complete: loadRuns.complete })
        .from(profilePosts)
        .leftJoin(loadRuns, eq(loadRuns.id, profilePosts.runId))
        .where(and(eq(profilePosts.authorId, authorId), eq(profilePosts.postId, p.id)))
        .get();
      if (!link) {
        tx.insert(profilePosts).values({ authorId, postId: p.id, runId }).run();
        newCount++;
        continue;
      }
      // Posts from a refresh that stopped early may sit above posts nobody read yet, so they are not proof.
      const known = link.mode !== "refresh" || link.complete === true;
      if (!known) {
        tx.update(profilePosts).set({ runId }).where(and(eq(profilePosts.authorId, authorId), eq(profilePosts.postId, p.id))).run();
      } else if (!p.pinned) {
        // Pinned posts sit on top of the profile however old they are, so they say nothing about where new posts end.
        sawKnown = true;
      }
    }
    // Refresh reads from the top, so its cursor says nothing about older posts.
    if (run.mode !== "refresh") {
      tx.update(profiles).set({ olderCursor: page.moreAvailable ? page.nextCursor : null }).where(eq(profiles.authorId, authorId)).run();
    }
    const stop = run.mode === "refresh" && sawKnown;
    tx.update(loadRuns)
      .set({
        pages: sql`${loadRuns.pages} + 1`, items: sql`${loadRuns.items} + ${newCount}`, activeAt: now,
        complete: stop || !page.moreAvailable,
      })
      .where(eq(loadRuns.id, runId))
      .run();
    return { stop, newCount, jobs };
  });
}

export function startFollowingRun(db: Db, now = Date.now()) {
  return db.transaction((tx) => {
    interruptRunning(tx, "following", null, now);
    const run = tx
      .insert(loadRuns)
      .values({ kind: "following", mode: "following", status: "running", startedAt: now, activeAt: now })
      .returning({ id: loadRuns.id })
      .get();
    return { runId: run.id };
  });
}

export function ingestFollowingPage(db: Db, runId: number, raw: unknown, now = Date.now()) {
  const page = parseFollowingPage(raw);
  return db.transaction((tx) => {
    const run = activeLoad(tx, runId, "following");
    let pos = run.nextPos;
    for (const a of page.items) {
      // Avatars are fetched when the list shows them, not all at once.
      upsertAuthor(tx, a, []);
      const position = pos++;
      tx.insert(following)
        .values({ authorId: a.id, position, lastSeenRunId: runId })
        .onConflictDoUpdate({ target: following.authorId, set: { position, lastSeenRunId: runId } })
        .run();
    }
    tx.update(loadRuns)
      .set({
        nextPos: pos, pages: sql`${loadRuns.pages} + 1`, items: sql`${loadRuns.items} + ${page.items.length}`,
        complete: !page.moreAvailable, activeAt: now,
      })
      .where(eq(loadRuns.id, runId))
      .run();
    return { seen: page.items.length };
  });
}

export function finishLoadRun(db: Db, runId: number, result: SyncResult, now = Date.now()) {
  db.transaction((tx) => {
    const run = tx.select().from(loadRuns).where(eq(loadRuns.id, runId)).get();
    if (!run) throw new NotFoundError(`Load run ${runId} not found`);
    if (run.status !== "running") return;
    if (!result.ok) {
      tx.update(loadRuns).set({ status: "error", finishedAt: now, errorCode: result.code, errorMessage: result.message }).where(eq(loadRuns.id, runId)).run();
      return;
    }
    if (run.kind === "profile" && run.authorId) {
      tx.update(profiles).set({ refreshedAt: now }).where(eq(profiles.authorId, run.authorId)).run();
    }
    if (run.kind === "following") {
      // Only a walk to the end proves an account is no longer followed.
      if (run.complete) tx.delete(following).where(lt(following.lastSeenRunId, runId)).run();
      setSetting(tx, FOLLOWING_UPDATED_AT, String(now));
    }
    tx.update(loadRuns).set({ status: "done", finishedAt: now }).where(eq(loadRuns.id, runId)).run();
  });
}

/**
 * Removes a profile. Its posts go too, unless they are saved, have a report (finished or being made),
 * or belong to another added profile. Returns the ids of deleted posts.
 */
export function removeProfile(db: Db, authorId: string): string[] {
  return db.transaction((tx) => {
    const ids = tx.select({ id: profilePosts.postId }).from(profilePosts).where(eq(profilePosts.authorId, authorId)).all().map((r) => r.id);
    if (tx.delete(profiles).where(eq(profiles.authorId, authorId)).run().changes === 0) {
      throw new NotFoundError(`Profile ${authorId} is not in your library`);
    }
    tx.delete(loadRuns).where(and(eq(loadRuns.kind, "profile"), eq(loadRuns.authorId, authorId))).run();
    if (ids.length === 0) return [];
    const orphans = tx
      .select({ id: posts.id })
      .from(posts)
      .where(and(
        inArray(posts.id, ids),
        sql`NOT EXISTS (SELECT 1 FROM saved_posts s WHERE s.post_id = ${posts.id})`,
        // A finished report, or one still being made, keeps its post.
        sql`NOT EXISTS (SELECT 1 FROM reports r WHERE r.post_id = ${posts.id} AND (r.markdown IS NOT NULL OR r.status IN ('queued', 'running')))`,
        sql`NOT EXISTS (SELECT 1 FROM profile_posts pp WHERE pp.post_id = ${posts.id})`,
      ))
      .all()
      .map((r) => r.id);
    for (const id of orphans) {
      tx.delete(posts).where(eq(posts.id, id)).run();
      tx.run(sql`DELETE FROM post_search WHERE post_id = ${id}`);
    }
    return orphans;
  });
}

export function failStaleLoads(db: Db, now = Date.now()) {
  db.update(loadRuns)
    .set({ status: "error", finishedAt: now, errorCode: "interrupted", errorMessage: "The app was restarted during the load." })
    .where(eq(loadRuns.status, "running"))
    .run();
}
