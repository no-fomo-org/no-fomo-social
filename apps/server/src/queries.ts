import { and, asc, count, desc, eq, inArray, isNotNull, isNull, lt, sql, type SQL } from "drizzle-orm";
import { buildPostMedia, permalinkOf, summaryPreview } from "@no-fomo/core";
import type {
  AuthorFacet, AuthorScope, CollectionFacet, FollowingPage, FollowingRunInfo, MediaPart, PostListItem, PostMedia, PostsPage, PostsQuery,
  ReportsPage, ReportsQuery, SyncStatus,
} from "@no-fomo/core";
import type { Db } from "./db/open";
import { getSetting } from "./db/settings";
import { authors, collections, following, followingRuns, postCollections, postParts, posts, reports, savedPosts } from "./db/schema";
import { lastFullAt, lastSuccessAt, latestRun } from "./sync/ingest";
import { FOLLOWING_UPDATED_AT } from "./sync/following";

const visible = and(isNull(savedPosts.removedAt), isNull(savedPosts.removedRemotelyAt));
const hasReport = sql<number>`EXISTS (SELECT 1 FROM reports r WHERE r.post_id = ${posts.id} AND r.markdown IS NOT NULL)`;
const isSaved = sql<number>`EXISTS (SELECT 1 FROM saved_posts s WHERE s.post_id = ${posts.id} AND s.removed_at IS NULL AND s.removed_remotely_at IS NULL)`;
const itemColumns = { post: posts, username: authors.username, fullName: authors.fullName, hasReport, saved: isSaved };
type ItemRow = { post: typeof posts.$inferSelect; username: string; fullName: string | null; hasReport: number; saved: number };

/**
 * Turns free text into a safe FTS5 query: every word must match, each as a word start.
 * Only letters and digits survive, so user input can never form FTS syntax.
 */
export function ftsQuery(text: string | undefined): string | null {
  const words = (text ?? "").match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.length ? words.slice(0, 12).map((w) => `"${w}"*`).join(" ") : null;
}

/** "<number>.<id>": a time plus the post id, so equal times never skip a post. */
function splitCursor(cursor: string | undefined): { at: number; id: string } | null {
  const m = /^(\d+)\.(\d+)$/.exec(cursor ?? "");
  return m ? { at: Number(m[1]), id: m[2]! } : null;
}
const after = (time: SQL | typeof posts.takenAt, id: SQL | typeof posts.id, c: { at: number; id: string } | null) =>
  c ? sql`(${time} < ${c.at} OR (${time} = ${c.at} AND ${id} < ${c.id}))` : undefined;

function paged<R extends ItemRow, T>(rows: R[], limit: number, map: (r: R) => T, cursorOf: (r: R) => string, total: number) {
  const more = rows.length > limit;
  const page = rows.slice(0, limit);
  return { items: page.map(map), nextCursor: more ? cursorOf(page.at(-1)!) : null, total };
}

export function listPosts(db: Db, q: PostsQuery): PostsPage {
  const match = ftsQuery(q.q);
  const common = and(
    match
      ? sql`(${posts.id} IN (SELECT post_id FROM post_search WHERE post_search MATCH ${match}) OR ${posts.id} IN (SELECT post_id FROM report_search WHERE report_search MATCH ${match}))`
      : undefined,
    q.author ? eq(posts.authorId, q.author) : undefined,
    q.kind ? eq(posts.kind, q.kind) : undefined,
  );

  const where = and(
    common,
    visible,
    q.collection
      ? inArray(posts.id, db.select({ id: postCollections.postId }).from(postCollections).where(eq(postCollections.collectionId, q.collection)))
      : undefined,
  );
  const total = db.select({ n: count() }).from(posts).innerJoin(savedPosts, eq(savedPosts.postId, posts.id)).where(where).get()?.n ?? 0;
  const cursor = q.cursor !== undefined && /^\d+$/.test(q.cursor) ? Number(q.cursor) : undefined;
  const rows = db
    .select({ ...itemColumns, key: savedPosts.sortKey })
    .from(posts)
    .innerJoin(savedPosts, eq(savedPosts.postId, posts.id))
    .innerJoin(authors, eq(authors.id, posts.authorId))
    .where(and(where, cursor !== undefined ? lt(savedPosts.sortKey, cursor) : undefined))
    .orderBy(desc(savedPosts.sortKey))
    .limit(q.limit + 1)
    .all();
  return paged(rows, q.limit, toItem, (r) => String(r.key), total);
}

function toItem(r: ItemRow): PostListItem {
  const p = r.post;
  return {
    id: p.id, code: p.code, kind: p.kind,
    author: { id: p.authorId, username: r.username, fullName: r.fullName },
    caption: p.caption, hashtags: p.hashtags, takenAt: p.takenAt, durationSec: p.durationSec,
    likeCount: p.likeCount, viewCount: p.viewCount, commentCount: p.commentCount,
    accessibilityCaption: p.accessibilityCaption, locationName: p.locationName,
    musicTitle: p.musicTitle, musicArtist: p.musicArtist, width: p.width, height: p.height,
    thumbUrl: `/media/thumbs/${p.id}`,
    permalink: permalinkOf(p.code, p.productType),
    hasReport: Boolean(r.hasReport),
    saved: Boolean(r.saved),
  };
}

export function getPostItem(db: Db, id: string): PostListItem | null {
  const r = db.select(itemColumns).from(posts).innerJoin(authors, eq(authors.id, posts.authorId)).where(eq(posts.id, id)).get();
  return r ? toItem(r) : null;
}

const reportedAt = sql<number>`coalesce(${reports.finishedAt}, ${reports.createdAt})`;

export function listReports(db: Db, q: ReportsQuery): ReportsPage {
  const match = ftsQuery(q.q);
  const where = and(
    isNotNull(reports.markdown),
    match ? sql`${reports.postId} IN (SELECT post_id FROM report_search WHERE report_search MATCH ${match})` : undefined,
    q.author ? eq(posts.authorId, q.author) : undefined,
    q.kind ? eq(posts.kind, q.kind) : undefined,
    q.source === "saved" ? isSaved : q.source === "other" ? sql`NOT ${isSaved}` : undefined,
  );
  const total = db.select({ n: count() }).from(reports).innerJoin(posts, eq(posts.id, reports.postId)).where(where).get()?.n ?? 0;
  const rows = db
    .select({ ...itemColumns, reportedAt, markdown: reports.markdown, reportModel: reports.reportModel })
    .from(reports)
    .innerJoin(posts, eq(posts.id, reports.postId))
    .innerJoin(authors, eq(authors.id, posts.authorId))
    .where(and(where, after(reportedAt, posts.id, splitCursor(q.cursor))))
    .orderBy(desc(reportedAt), desc(posts.id))
    .limit(q.limit + 1)
    .all();
  return paged(
    rows,
    q.limit,
    (r) => ({ ...toItem(r), reportedAt: r.reportedAt, reportModel: r.reportModel, summary: summaryPreview(r.markdown ?? "") }),
    (r) => `${r.reportedAt}.${r.post.id}`,
    total,
  );
}

export function getPostMedia(db: Db, id: string): PostMedia | null {
  const p = db
    .select({ id: posts.id, kind: posts.kind, videoUrl: posts.videoUrl, thumbnailUrl: posts.thumbnailUrl, width: posts.width, height: posts.height })
    .from(posts)
    .where(eq(posts.id, id))
    .get();
  if (!p) return null;
  const parts: MediaPart[] = db
    .select().from(postParts).where(eq(postParts.postId, id)).orderBy(asc(postParts.idx)).all()
    .map((r) => ({ index: r.idx, kind: r.kind, imageUrl: r.imageUrl, videoUrl: r.videoUrl, width: r.width, height: r.height }));
  // Posts stored before single posts had parts: a video still has its own link.
  if (parts.length === 0 && p.kind === "video" && p.videoUrl) {
    parts.push({ index: 0, kind: "video", imageUrl: p.thumbnailUrl, videoUrl: p.videoUrl, width: p.width, height: p.height });
  }
  return buildPostMedia(p.id, p.kind, parts);
}

export function listAuthors(db: Db, scope: AuthorScope = "saved"): AuthorFacet[] {
  const n = count(posts.id);
  const base = db.select({ id: authors.id, username: authors.username, fullName: authors.fullName, count: n }).from(authors);
  const joined =
    scope === "reports"
      ? base.innerJoin(posts, eq(posts.authorId, authors.id)).innerJoin(reports, and(eq(reports.postId, posts.id), isNotNull(reports.markdown)))
      : base.innerJoin(posts, eq(posts.authorId, authors.id)).innerJoin(savedPosts, and(eq(savedPosts.postId, posts.id), visible));
  return joined
    .groupBy(authors.id)
    .orderBy(desc(n), asc(authors.username))
    .all()
    .map((a) => ({ ...a, avatarUrl: `/media/avatars/${a.id}` }));
}

export function listCollections(db: Db): CollectionFacet[] {
  const n = count(savedPosts.postId);
  return db
    .select({ id: collections.id, name: collections.name, count: n })
    .from(collections)
    .leftJoin(postCollections, eq(postCollections.collectionId, collections.id))
    .leftJoin(savedPosts, and(eq(savedPosts.postId, postCollections.postId), visible))
    .groupBy(collections.id)
    .orderBy(asc(collections.name))
    .all();
}

export function syncStatus(db: Db): SyncStatus {
  const run = latestRun(db);
  return {
    run: run && {
      id: run.id, mode: run.mode, status: run.status, startedAt: run.startedAt, finishedAt: run.finishedAt,
      pages: run.pages, postsSeen: run.postsSeen, postsNew: run.postsNew, postsRemoved: run.postsRemoved, warning: run.warning,
      errorCode: run.errorCode, errorMessage: run.errorMessage,
    },
    lastSuccessAt: lastSuccessAt(db),
    lastFullAt: lastFullAt(db),
  };
}

/** A page takes seconds. An update silent this long lost its Instagram tab and will never finish. */
const STALE_MS = 2 * 60_000;

function runInfo(r: typeof followingRuns.$inferSelect | undefined, now: number): FollowingRunInfo | null {
  if (!r) return null;
  const stale = r.status === "running" && now - r.activeAt > STALE_MS;
  return {
    id: r.id, startedAt: r.startedAt, finishedAt: r.finishedAt, pages: r.pages, items: r.items, duplicates: r.duplicates,
    ...(stale
      ? { status: "error" as const, errorCode: "interrupted", errorMessage: "The update stopped before it finished. Try again." }
      : { status: r.status, errorCode: r.errorCode, errorMessage: r.errorMessage }),
  };
}

/** For posts shown straight from Instagram: which ones are stored, saved, or have a finished report. */
export function postStates(db: Db, ids: string[]): Array<{ id: string; saved: boolean; hasReport: boolean }> {
  if (ids.length === 0) return [];
  return db
    .select({ id: posts.id, saved: isSaved, hasReport })
    .from(posts)
    .where(inArray(posts.id, ids))
    .all()
    .map((r) => ({ id: r.id, saved: Boolean(r.saved), hasReport: Boolean(r.hasReport) }));
}

/** Escapes LIKE wildcards so typed text matches literally. */
const likePattern = (text: string) => `%${text.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export function listFollowing(db: Db, o: { q?: string; limit: number }, now = Date.now()): FollowingPage {
  const text = o.q?.trim().replace(/^@/, "");
  const where = text
    ? sql`(lower(${authors.username}) LIKE ${likePattern(text)} ESCAPE '\\' OR lower(coalesce(${authors.fullName}, '')) LIKE ${likePattern(text)} ESCAPE '\\')`
    : undefined;
  const total = db.select({ n: count() }).from(following).innerJoin(authors, eq(authors.id, following.authorId)).where(where).get()?.n ?? 0;
  const items = db
    .select({ id: authors.id, username: authors.username, fullName: authors.fullName })
    .from(following)
    .innerJoin(authors, eq(authors.id, following.authorId))
    .where(where)
    .orderBy(asc(following.position))
    .limit(o.limit)
    .all()
    .map((a) => ({ ...a, avatarUrl: `/media/avatars/${a.id}` }));
  const updated = getSetting(db, FOLLOWING_UPDATED_AT);
  return {
    items, total, updatedAt: updated ? Number(updated) : null,
    run: runInfo(db.select().from(followingRuns).orderBy(desc(followingRuns.id)).limit(1).get(), now),
  };
}
