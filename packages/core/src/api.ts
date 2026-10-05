import type { MediaKind } from "./ig/types";

export type SyncMode = "incremental" | "full";

export interface PostListItem {
  id: string;
  code: string;
  kind: MediaKind;
  author: { id: string; username: string; fullName: string | null };
  caption: string | null;
  hashtags: string[];
  takenAt: number;
  durationSec: number | null;
  likeCount: number | null;
  viewCount: number | null;
  commentCount: number | null;
  accessibilityCaption: string | null;
  locationName: string | null;
  musicTitle: string | null;
  musicArtist: string | null;
  width: number | null;
  height: number | null;
  thumbUrl: string;
  permalink: string;
}

export interface MediaPart {
  index: number;
  kind: "image" | "video";
  imageUrl: string | null;
  videoUrl: string | null;
  width: number | null;
  height: number | null;
}
export interface PostMedia {
  id: string;
  kind: MediaKind;
  parts: MediaPart[];
  /** Unix seconds when the first of these links stops working. Null when unknown. */
  expiresAt: number | null;
}

export interface PostsPage { items: PostListItem[]; nextCursor: number | null; total: number }
export interface PostsQuery { q?: string; author?: string; collection?: string; kind?: MediaKind; cursor?: number; limit: number }
export interface AuthorFacet { id: string; username: string; fullName: string | null; avatarUrl: string; count: number }
export interface CollectionFacet { id: string; name: string | null; count: number }

export interface SyncRunInfo {
  id: number;
  mode: SyncMode;
  status: "running" | "done" | "error";
  startedAt: number;
  finishedAt: number | null;
  pages: number;
  postsSeen: number;
  postsNew: number;
  errorCode: string | null;
  errorMessage: string | null;
}
export interface SyncStatus { run: SyncRunInfo | null; lastSuccessAt: number | null }
export interface AppConfig { extensionId: string; version: string }
