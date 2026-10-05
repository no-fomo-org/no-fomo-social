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
  hasReport: boolean;
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
export interface PostsQuery { q?: string; author?: string; collection?: string; kind?: MediaKind; cursor?: number; limit: number; report?: boolean }
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
  postsRemoved: number;
  warning: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}
export interface SyncStatus { run: SyncRunInfo | null; lastSuccessAt: number | null; lastFullAt: number | null }
export interface AppConfig { extensionId: string; version: string }

export type ReportStatus = "queued" | "running" | "done" | "error";
export type ReportStep = "downloading" | "frames" | "transcribing" | "writing";
export type AnalyzeErrorCode =
  | "no_key" | "bad_key" | "quota" | "model_not_found" | "no_ffmpeg" | "too_long" | "too_large"
  | "links_expired" | "download_failed" | "bad_output" | "interrupted" | "failed" | "already_running";
export interface PostReport {
  postId: string;
  status: ReportStatus;
  step: ReportStep | null;
  markdown: string | null;
  language: string;
  reportModel: string;
  transcribeModel: string | null;
  frameCount: number | null;
  errorCode: AnalyzeErrorCode | null;
  errorMessage: string | null;
  createdAt: number;
  finishedAt: number | null;
}
export interface AppSettings { openai: { set: boolean; last4: string | null }; reportLanguage: string; reportModel: string; transcribeModel: string }
export interface SettingsUpdate { openaiKey?: string | null; reportLanguage?: string; reportModel?: string; transcribeModel?: string }
