export type MediaKind = "image" | "video" | "carousel";

export interface ParsedAuthor {
  id: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
}

export interface ParsedMediaPart {
  index: number;
  kind: "image" | "video";
  imageUrl: string | null;
  videoUrl: string | null;
  width: number | null;
  height: number | null;
  accessibilityCaption: string | null;
}

export interface ParsedPost {
  id: string;
  code: string;
  kind: MediaKind;
  productType: string | null;
  author: ParsedAuthor;
  caption: string | null;
  hashtags: string[];
  mentions: string[];
  takenAt: number;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  videoUrlExpiresAt: number | null;
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
  parts: ParsedMediaPart[];
  /** Ids of the user's collections this post is in (from `saved_collection_ids`). */
  collectionIds: string[];
}

export interface ParsedCollection {
  id: string;
  name: string;
  mediaCount: number | null;
}

export interface PageInfo {
  nextCursor: string | null;
  moreAvailable: boolean;
  /** Instagram said plainly that this is the last page. A missing flag is not proof. */
  endOfFeed: boolean;
}
