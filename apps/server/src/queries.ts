import { and, asc, count, desc, eq, inArray, isNull, lt, sql, type SQL } from "drizzle-orm";
import { expiresAtFromUrl } from "@no-fomo/core";
import type { AuthorFacet, CollectionFacet, MediaPart, PostListItem, PostMedia, PostsPage, PostsQuery, SyncStatus } from "@no-fomo/core";
import type { Db } from "./db/open";
import { authors, collections, postCollections, postParts, posts } from "./db/schema";
import { lastSuccessAt, latestRun } from "./sync/ingest";

const visible = and(isNull(posts.removedAt), isNull(posts.removedRemotelyAt));

/**
 * Turns free text into a safe FTS5 query: every word must match, each as a word start.
 * Only letters and digits survive, so user input can never form FTS syntax.
 */
export function ftsQuery(text: string | undefined): string | null {
  const words = (text ?? "").match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.length ? words.slice(0, 12).map((w) => `"${w}"*`).join(" ") : null;
}

export function listPosts(db: Db, q: PostsQuery): PostsPage {
  const match = ftsQuery(q.q);
  const filters: (SQL | undefined)[] = [
    match ? sql`${posts.id} IN (SELECT post_id FROM post_search WHERE post_search MATCH ${match})` : undefined,
    visible,
    q.author ? eq(posts.authorId, q.author) : undefined,
    q.kind ? eq(posts.kind, q.kind) : undefined,
    q.collection
      ? inArray(posts.id, db.select({ id: postCollections.postId }).from(postCollections).where(eq(postCollections.collectionId, q.collection)))
      : undefined,
  ];
  const where = and(...filters);
  const total = db.select({ n: count() }).from(posts).where(where).get()?.n ?? 0;
  const rows = db
    .select({ post: posts, username: authors.username, fullName: authors.fullName })
    .from(posts)
    .innerJoin(authors, eq(authors.id, posts.authorId))
    .where(and(where, q.cursor !== undefined ? lt(posts.sortKey, q.cursor) : undefined))
    .orderBy(desc(posts.sortKey))
    .limit(q.limit + 1)
    .all();
  const more = rows.length > q.limit;
  const page = rows.slice(0, q.limit);
  return { items: page.map(toItem), nextCursor: more ? page.at(-1)!.post.sortKey : null, total };
}

function toItem(r: { post: typeof posts.$inferSelect; username: string; fullName: string | null }): PostListItem {
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
  };
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

export function listAuthors(db: Db): AuthorFacet[] {
  const n = count(posts.id);
  return db
    .select({ id: authors.id, username: authors.username, fullName: authors.fullName, count: n })
    .from(authors)
    .innerJoin(posts, and(eq(posts.authorId, authors.id), visible))
    .groupBy(authors.id)
    .orderBy(desc(n), asc(authors.username))
    .all()
    .map((a) => ({ ...a, avatarUrl: `/media/avatars/${a.id}` }));
}

export function listCollections(db: Db): CollectionFacet[] {
  const n = count(posts.id);
  return db
    .select({ id: collections.id, name: collections.name, count: n })
    .from(collections)
    .leftJoin(postCollections, eq(postCollections.collectionId, collections.id))
    .leftJoin(posts, and(eq(posts.id, postCollections.postId), visible))
    .groupBy(collections.id)
    .orderBy(asc(collections.name))
    .all();
}

export function syncStatus(db: Db): SyncStatus {
  const run = latestRun(db);
  return {
    run: run && {
      id: run.id, mode: run.mode, status: run.status, startedAt: run.startedAt, finishedAt: run.finishedAt,
      pages: run.pages, postsSeen: run.postsSeen, postsNew: run.postsNew,
      errorCode: run.errorCode, errorMessage: run.errorMessage,
    },
    lastSuccessAt: lastSuccessAt(db),
  };
}
