import { and, count, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { parseCollectionsPage, parseMediaPage, type ParsedPost, type SyncMode, type SyncResult } from "@no-fomo/core";
import type { Db } from "../db/open";
import { authors, collections, postCollections, postParts, posts, syncRuns } from "../db/schema";
import { getSetting, setSetting, type Q } from "../db/settings";

export const RUN_SPAN = 1_000_000_000;
const SAVED_BACKFILL = "saved_backfill_complete";
/**
 * Bump when the parser starts reading a new field from saved posts.
 * The next sync then walks the whole feed once, so old posts get the new data.
 * 2: collection membership from saved_collection_ids.
 */
const FEED_VERSION = "2";
const FEED_VERSION_KEY = "feed_version";
const LAST_FULL_AT = "last_full_at";
/** A full resync never hides more than this share of the library at once... */
const MAX_HIDDEN_SHARE = 0.3;
/** ...unless it is only a handful of posts. */
const SMALL_CHANGE = 20;
const TOO_MANY_MISSING = "Full resync found too many missing posts. Nothing was hidden. Try again later.";
const UNREADABLE = "Some posts could not be read. Nothing was hidden.";

export class RunNotActiveError extends Error {}
export class NotFoundError extends Error {}
export type MediaJob = { kind: "thumb" | "avatar"; id: string; url: string };

function activeRun(q: Q, runId: number) {
  const run = q.select().from(syncRuns).where(eq(syncRuns.id, runId)).get();
  if (!run) throw new NotFoundError(`Sync run ${runId} not found`);
  if (run.status !== "running") throw new RunNotActiveError(`Sync run ${runId} is ${run.status}`);
  return run;
}

export function startRun(db: Db, requested: SyncMode = "incremental", now = Date.now()): { runId: number; mode: SyncMode } {
  return db.transaction((tx) => {
    tx.update(syncRuns)
      .set({ status: "error", finishedAt: now, errorCode: "interrupted", errorMessage: "A new sync started before this one finished." })
      .where(eq(syncRuns.status, "running"))
      .run();
    const upToDate = getSetting(tx, SAVED_BACKFILL) === "1" && getSetting(tx, FEED_VERSION_KEY) === FEED_VERSION;
    const mode: SyncMode = requested === "full" || !upToDate ? "full" : "incremental";
    const max = tx.select({ max: sql<number | null>`max(${posts.sortKey})` }).from(posts).get()?.max ?? 0;
    const run = tx
      .insert(syncRuns)
      .values({ mode, status: "running", startedAt: now, baseKey: max + RUN_SPAN })
      .returning({ id: syncRuns.id })
      .get();
    return { runId: run.id, mode };
  });
}

function upsertAuthor(q: Q, a: ParsedPost["author"], jobs: MediaJob[]) {
  const existing = q.select({ avatarPath: authors.avatarPath }).from(authors).where(eq(authors.id, a.id)).get();
  q.insert(authors)
    .values({ id: a.id, username: a.username, fullName: a.fullName, avatarUrl: a.avatarUrl })
    .onConflictDoUpdate({ target: authors.id, set: { username: a.username, fullName: a.fullName, avatarUrl: a.avatarUrl } })
    .run();
  if (!existing?.avatarPath && a.avatarUrl) jobs.push({ kind: "avatar", id: a.id, url: a.avatarUrl });
}

function postFields(p: ParsedPost) {
  return {
    code: p.code, kind: p.kind, productType: p.productType, authorId: p.author.id, caption: p.caption,
    hashtags: p.hashtags, mentions: p.mentions, takenAt: p.takenAt, thumbnailUrl: p.thumbnailUrl,
    videoUrl: p.videoUrl, videoUrlExpiresAt: p.videoUrlExpiresAt, durationSec: p.durationSec,
    likeCount: p.likeCount, viewCount: p.viewCount, commentCount: p.commentCount,
    accessibilityCaption: p.accessibilityCaption, locationName: p.locationName,
    musicTitle: p.musicTitle, musicArtist: p.musicArtist, width: p.width, height: p.height,
  };
}

function upsertPost(q: Q, p: ParsedPost, runId: number, keyIfNew: number, keyUpdate: number | null, jobs: MediaJob[]) {
  upsertAuthor(q, p.author, jobs);
  const existing = q
    .select({ firstSeenRunId: posts.firstSeenRunId, thumbPath: posts.thumbPath, firstRunComplete: syncRuns.savedComplete })
    .from(posts)
    .leftJoin(syncRuns, eq(syncRuns.id, posts.firstSeenRunId))
    .where(eq(posts.id, p.id))
    .get();
  if (!existing) {
    q.insert(posts).values({ id: p.id, ...postFields(p), sortKey: keyIfNew, firstSeenRunId: runId, lastSeenRunId: runId }).run();
  } else {
    q.update(posts)
      .set({ ...postFields(p), lastSeenRunId: runId, removedRemotelyAt: null, ...(keyUpdate !== null ? { sortKey: keyUpdate } : {}) })
      .where(eq(posts.id, p.id))
      .run();
  }
  replaceParts(q, p);
  syncCollectionLinks(q, p, runId);
  replaceSearch(q, p);
  if (!existing?.thumbPath && p.thumbnailUrl) jobs.push({ kind: "thumb", id: p.id, url: p.thumbnailUrl });
  // "Known" means first seen by an earlier run that finished walking the saved feed.
  // Posts from a run that was cut off may sit above a gap of posts nobody fetched yet.
  return { isNew: !existing, knownBefore: !!existing && existing.firstSeenRunId < runId && existing.firstRunComplete === true };
}

function replaceParts(q: Q, p: ParsedPost) {
  q.delete(postParts).where(eq(postParts.postId, p.id)).run();
  if (p.parts.length === 0) return;
  q.insert(postParts)
    .values(p.parts.map((part) => ({
      postId: p.id, idx: part.index, kind: part.kind, imageUrl: part.imageUrl, videoUrl: part.videoUrl,
      width: part.width, height: part.height, accessibilityCaption: part.accessibilityCaption,
    })))
    .run();
}

function replaceSearch(q: Q, p: ParsedPost) {
  q.run(sql`DELETE FROM post_search WHERE post_id = ${p.id}`);
  q.run(sql`INSERT INTO post_search (post_id, body) VALUES (${p.id}, ${searchBody(p)})`);
}

export class MismatchError extends Error {}

/**
 * Fresh links for one post from Instagram's media info.
 * Keeps the post's feed position, run ids and collections: this answer says nothing about them.
 */
export function ingestMediaInfo(db: Db, id: string, raw: unknown): MediaJob[] {
  const p = parseMediaPage(raw).items[0];
  if (!p || p.id !== id) throw new MismatchError(`Instagram answered about a different post than ${id}`);
  const jobs: MediaJob[] = [];
  db.transaction((tx) => {
    const existing = tx.select({ thumbPath: posts.thumbPath }).from(posts).where(eq(posts.id, id)).get();
    if (!existing) throw new NotFoundError(`Post ${id} is not in your library`);
    upsertAuthor(tx, p.author, jobs);
    tx.update(posts).set(postFields(p)).where(eq(posts.id, id)).run();
    replaceParts(tx, p);
    replaceSearch(tx, p);
    if (!existing.thumbPath && p.thumbnailUrl) jobs.push({ kind: "thumb", id, url: p.thumbnailUrl });
  });
  return jobs;
}

/** What a user may remember about a post. Must match the backfill in drizzle/0003_post_search.sql. */
function searchBody(p: ParsedPost): string {
  return [p.author.username, p.author.fullName, p.caption, p.musicTitle, p.musicArtist, p.locationName, p.accessibilityCaption]
    .map((v) => v ?? "")
    .join(" ");
}

/** The saved feed lists every collection a post is in, so it replaces the post's links. */
function syncCollectionLinks(q: Q, p: ParsedPost, runId: number) {
  const wanted = new Set(p.collectionIds);
  const current = q.select({ id: postCollections.collectionId }).from(postCollections).where(eq(postCollections.postId, p.id)).all();
  for (const { id } of current) {
    if (!wanted.has(id)) {
      q.delete(postCollections).where(and(eq(postCollections.postId, p.id), eq(postCollections.collectionId, id))).run();
    }
  }
  const have = new Set(current.map((c) => c.id));
  for (const id of wanted) {
    if (have.has(id)) continue;
    q.insert(collections).values({ id, lastSeenRunId: runId }).onConflictDoNothing().run();
    q.insert(postCollections).values({ postId: p.id, collectionId: id, firstSeenRunId: runId }).run();
  }
}

export function ingestSavedPage(db: Db, runId: number, raw: unknown) {
  const page = parseMediaPage(raw);
  const jobs: MediaJob[] = [];
  return db.transaction((tx) => {
    const run = activeRun(tx, runId);
    let pos = run.nextPos;
    let newCount = 0;
    let sawKnown = false;
    for (const p of page.items) {
      // Every run walks a prefix of the feed, so giving each seen post a fresh key above
      // all older keys keeps the whole list in feed order, in both modes.
      const key = run.baseKey - pos++;
      const r = upsertPost(tx, p, runId, key, key, jobs);
      if (r.isNew) newCount++;
      if (r.knownBefore) sawKnown = true;
    }
    tx.update(syncRuns)
      .set({
        nextPos: pos,
        pages: sql`${syncRuns.pages} + 1`,
        postsSeen: sql`${syncRuns.postsSeen} + ${page.items.length}`,
        postsNew: sql`${syncRuns.postsNew} + ${newCount}`,
        postsSkipped: sql`${syncRuns.postsSkipped} + ${page.skipped}`,
        endConfirmed: page.endOfFeed,
      })
      .where(eq(syncRuns.id, runId))
      .run();
    const stop = run.mode === "incremental" && sawKnown;
    if (!page.moreAvailable) {
      setSetting(tx, SAVED_BACKFILL, "1");
      setSetting(tx, FEED_VERSION_KEY, FEED_VERSION);
    }
    if (stop || !page.moreAvailable) tx.update(syncRuns).set({ savedComplete: true }).where(eq(syncRuns.id, runId)).run();
    return { stop, newCount, seen: page.items.length, skipped: page.skipped, jobs };
  });
}

export function ingestCollections(db: Db, runId: number, raw: unknown) {
  const page = parseCollectionsPage(raw);
  return db.transaction((tx) => {
    activeRun(tx, runId);
    for (const c of page.items) {
      tx.insert(collections)
        .values({ id: c.id, name: c.name, mediaCount: c.mediaCount, lastSeenRunId: runId })
        .onConflictDoUpdate({ target: collections.id, set: { name: c.name, mediaCount: c.mediaCount, lastSeenRunId: runId } })
        .run();
    }
    return { collections: page.items.map(({ id, name }) => ({ id, name })) };
  });
}

export function finishRun(db: Db, runId: number, result: SyncResult, now = Date.now()) {
  db.transaction((tx) => {
    const run = tx.select().from(syncRuns).where(eq(syncRuns.id, runId)).get();
    if (!run) throw new NotFoundError(`Sync run ${runId} not found`);
    if (run.status !== "running") return;
    if (!result.ok) {
      tx.update(syncRuns)
        .set({ status: "error", finishedAt: now, errorCode: result.code, errorMessage: result.message })
        .where(eq(syncRuns.id, runId))
        .run();
      return;
    }
    let hidden: { count: number; warning: string | null } = { count: 0, warning: null };
    // A full run marks savedComplete only when it reached the end of the feed,
    // so only then does "not seen" mean "no longer saved".
    if (run.mode === "full" && run.savedComplete) {
      // A post the parser skipped, or a last page that only looks like the end,
      // would make saved posts look missing. Then hiding waits for a cleaner run.
      hidden = run.postsSkipped > 0 || !run.endConfirmed ? { count: 0, warning: UNREADABLE } : hideMissingPosts(tx, runId, now);
      setSetting(tx, LAST_FULL_AT, String(now));
    }
    tx.update(syncRuns)
      .set({ status: "done", finishedAt: now, postsRemoved: hidden.count, warning: hidden.warning })
      .where(eq(syncRuns.id, runId))
      .run();
  });
}

function hideMissingPosts(q: Q, runId: number, now: number): { count: number; warning: string | null } {
  const visible = and(isNull(posts.removedAt), isNull(posts.removedRemotelyAt));
  const missing = and(visible, lt(posts.lastSeenRunId, runId));
  const total = q.select({ n: count() }).from(posts).where(visible).get()?.n ?? 0;
  const n = q.select({ n: count() }).from(posts).where(missing).get()?.n ?? 0;
  if (n > SMALL_CHANGE && n > total * MAX_HIDDEN_SHARE) return { count: 0, warning: TOO_MANY_MISSING };
  if (n > 0) q.update(posts).set({ removedRemotelyAt: now }).where(missing).run();
  return { count: n, warning: null };
}

export function lastFullAt(db: Db): number | null {
  const v = getSetting(db, LAST_FULL_AT);
  return v ? Number(v) : null;
}

export function failStaleRuns(db: Db, now = Date.now()) {
  db.update(syncRuns)
    .set({ status: "error", finishedAt: now, errorCode: "interrupted", errorMessage: "The app was restarted during sync." })
    .where(eq(syncRuns.status, "running"))
    .run();
}

export const latestRun = (db: Db) => db.select().from(syncRuns).orderBy(desc(syncRuns.id)).limit(1).get() ?? null;

export const lastSuccessAt = (db: Db) =>
  db.select({ at: syncRuns.finishedAt }).from(syncRuns).where(eq(syncRuns.status, "done")).orderBy(desc(syncRuns.id)).limit(1).get()?.at ?? null;

export function markMediaSaved(db: Db, job: MediaJob) {
  if (job.kind === "thumb") db.update(posts).set({ thumbPath: job.id }).where(eq(posts.id, job.id)).run();
  else db.update(authors).set({ avatarPath: job.id }).where(eq(authors.id, job.id)).run();
}
