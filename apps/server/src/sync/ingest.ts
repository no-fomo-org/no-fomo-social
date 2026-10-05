import { and, desc, eq, sql } from "drizzle-orm";
import { parseCollectionsPage, parseMediaPage, type ParsedPost, type SyncResult } from "@no-fomo/core";
import type { Db } from "../db/open";
import { authors, collections, postCollections, postParts, posts, settings, syncRuns } from "../db/schema";

export const RUN_SPAN = 1_000_000_000;
const SAVED_BACKFILL = "saved_backfill_complete";

export class RunNotActiveError extends Error {}
export class NotFoundError extends Error {}
export type MediaJob = { kind: "thumb" | "avatar"; id: string; url: string };

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Q = Db | Tx;

const getSetting = (q: Q, key: string) => q.select().from(settings).where(eq(settings.key, key)).get()?.value ?? null;
const setSetting = (q: Q, key: string, value: string) =>
  q.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();

function activeRun(q: Q, runId: number) {
  const run = q.select().from(syncRuns).where(eq(syncRuns.id, runId)).get();
  if (!run) throw new NotFoundError(`Sync run ${runId} not found`);
  if (run.status !== "running") throw new RunNotActiveError(`Sync run ${runId} is ${run.status}`);
  return run;
}

export function startRun(db: Db, now = Date.now()): { runId: number; mode: "incremental" | "full" } {
  return db.transaction((tx) => {
    tx.update(syncRuns)
      .set({ status: "error", finishedAt: now, errorCode: "interrupted", errorMessage: "A new sync started before this one finished." })
      .where(eq(syncRuns.status, "running"))
      .run();
    const mode = getSetting(tx, SAVED_BACKFILL) === "1" ? "incremental" : "full";
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
    .select({ firstSeenRunId: posts.firstSeenRunId, thumbPath: posts.thumbPath })
    .from(posts)
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
  q.delete(postParts).where(eq(postParts.postId, p.id)).run();
  if (p.parts.length > 0) {
    q.insert(postParts)
      .values(p.parts.map((part) => ({
        postId: p.id, idx: part.index, kind: part.kind, imageUrl: part.imageUrl, videoUrl: part.videoUrl,
        width: part.width, height: part.height, accessibilityCaption: part.accessibilityCaption,
      })))
      .run();
  }
  if (!existing?.thumbPath && p.thumbnailUrl) jobs.push({ kind: "thumb", id: p.id, url: p.thumbnailUrl });
  return { isNew: !existing, knownBefore: !!existing && existing.firstSeenRunId < runId };
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
      const key = run.baseKey - pos++;
      const r = upsertPost(tx, p, runId, key, run.mode === "full" ? key : null, jobs);
      if (r.isNew) newCount++;
      if (r.knownBefore) sawKnown = true;
    }
    tx.update(syncRuns)
      .set({
        nextPos: pos,
        pages: sql`${syncRuns.pages} + 1`,
        postsSeen: sql`${syncRuns.postsSeen} + ${page.items.length}`,
        postsNew: sql`${syncRuns.postsNew} + ${newCount}`,
      })
      .where(eq(syncRuns.id, runId))
      .run();
    if (!page.moreAvailable) setSetting(tx, SAVED_BACKFILL, "1");
    return { stop: run.mode === "incremental" && sawKnown, newCount, seen: page.items.length, skipped: page.skipped, jobs };
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

export function ingestCollectionPage(db: Db, runId: number, collectionId: string, raw: unknown) {
  const page = parseMediaPage(raw);
  const jobs: MediaJob[] = [];
  return db.transaction((tx) => {
    activeRun(tx, runId);
    const coll = tx.select().from(collections).where(eq(collections.id, collectionId)).get();
    if (!coll) throw new NotFoundError(`Collection ${collectionId} not found`);
    let sawKnownLink = false;
    for (const p of page.items) {
      const min = tx.select({ min: sql<number | null>`min(${posts.sortKey})` }).from(posts).get()?.min ?? RUN_SPAN;
      upsertPost(tx, p, runId, min - 1, null, jobs);
      const link = tx
        .select({ firstSeenRunId: postCollections.firstSeenRunId })
        .from(postCollections)
        .where(and(eq(postCollections.postId, p.id), eq(postCollections.collectionId, collectionId)))
        .get();
      if (link) {
        if (link.firstSeenRunId < runId) sawKnownLink = true;
      } else {
        tx.insert(postCollections).values({ postId: p.id, collectionId, firstSeenRunId: runId }).run();
      }
    }
    if (!page.moreAvailable) tx.update(collections).set({ backfillComplete: true }).where(eq(collections.id, collectionId)).run();
    return { stop: coll.backfillComplete && sawKnownLink, seen: page.items.length, jobs };
  });
}

export function finishRun(db: Db, runId: number, result: SyncResult, now = Date.now()) {
  const run = db.select().from(syncRuns).where(eq(syncRuns.id, runId)).get();
  if (!run) throw new NotFoundError(`Sync run ${runId} not found`);
  if (run.status !== "running") return;
  db.update(syncRuns)
    .set(result.ok
      ? { status: "done", finishedAt: now }
      : { status: "error", finishedAt: now, errorCode: result.code, errorMessage: result.message })
    .where(eq(syncRuns.id, runId))
    .run();
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
