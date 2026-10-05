import type { LivePost, MediaPart, PostMedia } from "../api";
import type { MediaKind, ParsedPost } from "./types";
import { expiresAtFromUrl } from "./url";

export const permalinkOf = (code: string, productType: string | null) =>
  `https://www.instagram.com/${productType === "clips" ? "reel" : "p"}/${code}/`;

/** `expiresAt`: when the first of these links stops working (unix seconds), null when unknown. */
export function buildPostMedia(id: string, kind: MediaKind, parts: MediaPart[]): PostMedia {
  const expiries = parts
    .flatMap((x) => [x.imageUrl, x.videoUrl])
    .map(expiresAtFromUrl)
    .filter((x): x is number => x !== null);
  return { id, kind, parts, expiresAt: expiries.length ? Math.min(...expiries) : null };
}

/** A parsed post ready for an account page: list fields plus the links to play it. */
export function toLivePost(p: ParsedPost): LivePost {
  const parts: MediaPart[] = p.parts.map((x) => ({ index: x.index, kind: x.kind, imageUrl: x.imageUrl, videoUrl: x.videoUrl, width: x.width, height: x.height }));
  return {
    id: p.id, code: p.code, kind: p.kind,
    author: { id: p.author.id, username: p.author.username, fullName: p.author.fullName },
    caption: p.caption, hashtags: p.hashtags, takenAt: p.takenAt, durationSec: p.durationSec,
    likeCount: p.likeCount, viewCount: p.viewCount, commentCount: p.commentCount,
    accessibilityCaption: p.accessibilityCaption, locationName: p.locationName,
    musicTitle: p.musicTitle, musicArtist: p.musicArtist, width: p.width, height: p.height,
    thumbUrl: p.thumbnailUrl ?? parts[0]?.imageUrl ?? "",
    permalink: permalinkOf(p.code, p.productType),
    hasReport: false,
    saved: false,
    media: buildPostMedia(p.id, p.kind, parts),
  };
}
