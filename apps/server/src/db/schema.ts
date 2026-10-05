import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const authors = sqliteTable("authors", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  fullName: text("full_name"),
  avatarUrl: text("avatar_url"),
  avatarPath: text("avatar_path"),
});

export const posts = sqliteTable(
  "posts",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    kind: text("kind", { enum: ["image", "video", "carousel"] }).notNull(),
    productType: text("product_type"),
    authorId: text("author_id").notNull().references(() => authors.id),
    caption: text("caption"),
    hashtags: text("hashtags", { mode: "json" }).$type<string[]>().notNull(),
    mentions: text("mentions", { mode: "json" }).$type<string[]>().notNull(),
    takenAt: integer("taken_at").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    thumbPath: text("thumb_path"),
    videoUrl: text("video_url"),
    videoUrlExpiresAt: integer("video_url_expires_at"),
    durationSec: real("duration_sec"),
    likeCount: integer("like_count"),
    viewCount: integer("view_count"),
    commentCount: integer("comment_count"),
    accessibilityCaption: text("accessibility_caption"),
    locationName: text("location_name"),
    musicTitle: text("music_title"),
    musicArtist: text("music_artist"),
    width: integer("width"),
    height: integer("height"),
    sortKey: integer("sort_key").notNull(),
    firstSeenRunId: integer("first_seen_run_id").notNull(),
    lastSeenRunId: integer("last_seen_run_id").notNull(),
    removedAt: integer("removed_at"),
    removedRemotelyAt: integer("removed_remotely_at"),
  },
  (t) => [
    index("posts_sort_idx").on(t.sortKey),
    index("posts_author_idx").on(t.authorId),
    index("posts_kind_idx").on(t.kind),
  ],
);

export const postParts = sqliteTable(
  "post_parts",
  {
    postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    kind: text("kind", { enum: ["image", "video"] }).notNull(),
    imageUrl: text("image_url"),
    videoUrl: text("video_url"),
    width: integer("width"),
    height: integer("height"),
    accessibilityCaption: text("accessibility_caption"),
  },
  (t) => [primaryKey({ columns: [t.postId, t.idx] })],
);

export const collections = sqliteTable("collections", {
  id: text("id").primaryKey(),
  /** Null until Instagram tells us the name. Membership comes from the saved feed. */
  name: text("name"),
  mediaCount: integer("media_count"),
  backfillComplete: integer("backfill_complete", { mode: "boolean" }).notNull().default(false),
  lastSeenRunId: integer("last_seen_run_id"),
});

export const postCollections = sqliteTable(
  "post_collections",
  {
    postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    collectionId: text("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
    firstSeenRunId: integer("first_seen_run_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.collectionId] }), index("post_collections_coll_idx").on(t.collectionId)],
);

export const syncRuns = sqliteTable("sync_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  mode: text("mode", { enum: ["incremental", "full"] }).notNull(),
  status: text("status", { enum: ["running", "done", "error"] }).notNull(),
  startedAt: integer("started_at").notNull(),
  finishedAt: integer("finished_at"),
  baseKey: integer("base_key").notNull(),
  nextPos: integer("next_pos").notNull().default(0),
  /** True once this run walked the saved feed down to known posts or to the end. */
  savedComplete: integer("saved_complete", { mode: "boolean" }).notNull().default(false),
  pages: integer("pages").notNull().default(0),
  postsSeen: integer("posts_seen").notNull().default(0),
  postsNew: integer("posts_new").notNull().default(0),
  /** Posts a complete full run did not see, hidden as unsaved on Instagram. */
  postsRemoved: integer("posts_removed").notNull().default(0),
  /** Set when a full run skipped hiding posts because too many were missing. */
  warning: text("warning"),
  /** Saved items the parser could not read in this run. Any skip blocks hiding posts. */
  postsSkipped: integer("posts_skipped").notNull().default(0),
  /** The run's last page said plainly that the feed ended. */
  endConfirmed: integer("end_confirmed", { mode: "boolean" }).notNull().default(false),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
