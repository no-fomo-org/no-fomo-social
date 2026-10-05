import { and, asc, count, desc, eq, inArray, isNotNull, isNull, lt, sql, type SQL } from "drizzle-orm";
import { expiresAtFromUrl, summaryPreview } from "@no-fomo/core";
import type {
  AuthorFacet, AuthorScope, CollectionFacet, FollowingPage, LoadRunInfo, MediaPart, PostListItem, PostMedia, PostsPage, PostsQuery,
  ProfileItem, ReportsPage, ReportsQuery, SyncStatus,
} from "@no-fomo/core";
import type { Db } from "./db/open";
import { getSetting } from "./db/settings";
import { authors, collections, following, loadRuns, postCollections, postParts, posts, profilePosts, profiles, reports, savedPosts } from "./db/schema";
import { lastFullAt, lastSuccessAt, latestRun } from "./sync/ingest";
import { FOLLOWING_UPDATED_AT } from "./sync/loads";

const visible = and(isNull(savedPosts.removedAt), isNull(savedPosts.removedRemotelyAt));
const hasReport = sql<number>`EXISTS (SELECT 1 FROM reports r WHERE r.post_id = ${posts.id} AND r.markdown IS NOT NULL)`;
const isSaved = sql<number>`EXISTS (SELECT 1 FROM saved_posts s WHERE s.post_id = ${posts.id} AND s.removed_at IS NULL AND s.removed_remotely_at IS NULL)`;
const inAnyProfile = sql<number>`EXISTS (SELECT 1 FROM profile_posts pp WHERE pp.post_id = ${posts.id})`;
const profileNames = sql<string | null>`(SELECT group_concat(a.username, ' ') FROM profile_posts pp JOIN authors a ON a.id = pp.author_id WHERE pp.post_id = ${posts.id})`;
const itemColumns = { post: posts, username: authors.username, fullName: authors.fullName, hasReport, saved: isSaved, profileNames };
type ItemRow = { post: typeof posts.$inferSelect; username: string; fullName: string | null; hasReport: number; saved: number; profileNames: string | null };

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

  if (q.profile) {
    const where = and(common, inArray(posts.id, db.select({ id: profilePosts.postId }).from(profilePosts).where(eq(profilePosts.authorId, q.profile))));
    const total = db.select({ n: count() }).from(posts).where(where).get()?.n ?? 0;
    const rows = db
      .select(itemColumns)
      .from(posts)
      .innerJoin(authors, eq(authors.id, posts.authorId))
      .where(and(where, after(posts.takenAt, posts.id, splitCursor(q.cursor))))
      .orderBy(desc(posts.takenAt), desc(posts.id))
      .limit(q.limit + 1)
      .all();
    return paged(rows, q.limit, toItem, (r) => `${r.post.takenAt}.${r.post.id}`, total);
  }

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
    permalink: `https://www.instagram.com/${p.productType === "clips" ? "reel" : "p"}/${p.code}/`,
    hasReport: Boolean(r.hasReport),
    saved: Boolean(r.saved),
    profiles: r.profileNames ? r.profileNames.split(" ") : [],
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
    q.source === "saved" ? isSaved : q.source === "profile" ? inAnyProfile : undefined,
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
  const expiries = parts
    .flatMap((x) => [x.imageUrl, x.videoUrl])
    .map(expiresAtFromUrl)
    .filter((x): x is number => x !== null);
  return { id: p.id, kind: p.kind, parts, expiresAt: expiries.length ? Math.min(...expiries) : null };
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

const runInfo = (r: typeof loadRuns.$inferSelect | undefined): LoadRunInfo | null =>
  r ? {
    id: r.id, mode: r.mode, status: r.status, startedAt: r.startedAt, finishedAt: r.finishedAt,
    pages: r.pages, items: r.items, errorCode: r.errorCode, errorMessage: r.errorMessage,
  } : null;

export function listProfiles(db: Db): ProfileItem[] {
  const loaded = sql<number>`(SELECT count(*) FROM profile_posts pp WHERE pp.author_id = ${profiles.authorId})`;
  return db
    .select({ p: profiles, username: authors.username, fullName: authors.fullName, loaded })
    .from(profiles)
    .innerJoin(authors, eq(authors.id, profiles.authorId))
    .orderBy(desc(profiles.addedAt))
    .all()
    .map((r) => ({
      id: r.p.authorId, username: r.username, fullName: r.fullName, avatarUrl: `/media/avatars/${r.p.authorId}`,
      postCount: r.p.postCount, loadedCount: r.loaded, hasOlder: r.p.olderCursor !== null, isPrivate: r.p.isPrivate,
      addedAt: r.p.addedAt, refreshedAt: r.p.refreshedAt,
      run: runInfo(db.select().from(loadRuns).where(and(eq(loadRuns.kind, "profile"), eq(loadRuns.authorId, r.p.authorId))).orderBy(desc(loadRuns.id)).limit(1).get()),
    }));
}

/** Escapes LIKE wildcards so typed text matches literally. */
const likePattern = (text: string) => `%${text.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export function listFollowing(db: Db, o: { q?: string; limit: number }): FollowingPage {
  const text = o.q?.trim().replace(/^@/, "");
  const where = text
    ? sql`(lower(${authors.username}) LIKE ${likePattern(text)} ESCAPE '\\' OR lower(coalesce(${authors.fullName}, '')) LIKE ${likePattern(text)} ESCAPE '\\')`
    : undefined;
  const total = db.select({ n: count() }).from(following).innerJoin(authors, eq(authors.id, following.authorId)).where(where).get()?.n ?? 0;
  const added = sql<number>`EXISTS (SELECT 1 FROM profiles p WHERE p.author_id = ${following.authorId})`;
  const items = db
    .select({ id: authors.id, username: authors.username, fullName: authors.fullName, added })
    .from(following)
    .innerJoin(authors, eq(authors.id, following.authorId))
    .where(where)
    .orderBy(asc(following.position))
    .limit(o.limit)
    .all()
    .map((a) => ({ ...a, avatarUrl: `/media/avatars/${a.id}`, added: Boolean(a.added) }));
  const updated = getSetting(db, FOLLOWING_UPDATED_AT);
  return {
    items, total, updatedAt: updated ? Number(updated) : null,
    run: runInfo(db.select().from(loadRuns).where(eq(loadRuns.kind, "following")).orderBy(desc(loadRuns.id)).limit(1).get()),
  };
}
