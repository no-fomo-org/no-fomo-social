import { extractHashtags, extractMentions } from "./text";
import { expiresAtFromUrl } from "./url";
import type { MediaKind, PageInfo, ParsedAuthor, ParsedCollection, ParsedMediaPart, ParsedPost } from "./types";

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const obj = (v: unknown): Json => (isObj(v) ? v : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : null;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const KIND_BY_TYPE: Record<number, MediaKind> = { 1: "image", 2: "video", 8: "carousel" };

interface Candidate { url: string; width: number | null; height: number | null }

function candidates(list: unknown): Candidate[] {
  return arr(list)
    .map(obj)
    .map((c) => ({ url: str(c.url), width: num(c.width), height: num(c.height) }))
    .filter((c): c is Candidate => c.url !== null)
    .sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
}

/** Smallest image at least 480px wide, so grid thumbnails stay small. */
function pickThumb(list: unknown): Candidate | null {
  const c = candidates(list);
  return c.find((x) => (x.width ?? 0) >= 480) ?? c.at(-1) ?? null;
}

const pickLargest = (list: unknown): Candidate | null => candidates(list).at(-1) ?? null;

function parseAuthor(u: Json): ParsedAuthor | null {
  const id = str(u.pk) ?? str(u.pk_id) ?? str(u.id);
  const username = str(u.username);
  if (!id || !username) return null;
  return { id, username, fullName: str(u.full_name), avatarUrl: str(u.profile_pic_url) };
}

function parsePart(m: Json, index: number): ParsedMediaPart | null {
  const type = num(m.media_type);
  if (type !== 1 && type !== 2) return null;
  const image = pickLargest(obj(m.image_versions2).candidates);
  const video = type === 2 ? pickLargest(m.video_versions) : null;
  return {
    index,
    kind: type === 2 ? "video" : "image",
    imageUrl: image?.url ?? null,
    videoUrl: video?.url ?? null,
    width: (video ?? image)?.width ?? null,
    height: (video ?? image)?.height ?? null,
    accessibilityCaption: str(m.accessibility_caption),
  };
}

function parseMusic(m: Json): { title: string | null; artist: string | null } {
  const clips = obj(m.clips_metadata);
  const music = obj(obj(clips.music_info).music_asset_info);
  if (str(music.title)) return { title: str(music.title), artist: str(music.display_artist) };
  const original = obj(clips.original_sound_info);
  return { title: str(original.original_audio_title), artist: str(obj(original.ig_artist).username) };
}

export function parseMedia(raw: unknown): ParsedPost | null {
  const m = obj(raw);
  const id = str(m.pk) ?? str(m.id)?.split("_")[0] ?? null;
  const code = str(m.code);
  const kind = KIND_BY_TYPE[num(m.media_type) ?? -1];
  const author = parseAuthor(obj(m.user));
  if (!id || !code || !kind || !author) return null;

  const parts =
    kind === "carousel"
      ? arr(m.carousel_media)
          .map((p, i) => parsePart(obj(p), i))
          .filter((p): p is ParsedMediaPart => p !== null)
      : [];
  const first = parts[0];
  const thumb =
    pickThumb(obj(m.image_versions2).candidates) ??
    (first?.imageUrl ? { url: first.imageUrl, width: first.width, height: first.height } : null);
  const video = kind === "video" ? pickLargest(m.video_versions) : null;
  const caption = str(obj(m.caption).text);
  const music = parseMusic(m);

  return {
    id,
    code,
    kind,
    productType: str(m.product_type),
    author,
    caption,
    hashtags: extractHashtags(caption),
    mentions: extractMentions(caption),
    takenAt: num(m.taken_at) ?? 0,
    thumbnailUrl: thumb?.url ?? null,
    videoUrl: video?.url ?? null,
    videoUrlExpiresAt: expiresAtFromUrl(video?.url ?? null),
    durationSec: num(m.video_duration),
    likeCount: num(m.like_count),
    viewCount: num(m.play_count) ?? num(m.ig_play_count) ?? num(m.view_count),
    commentCount: num(m.comment_count),
    accessibilityCaption: str(m.accessibility_caption) ?? first?.accessibilityCaption ?? null,
    locationName: str(obj(m.location).name),
    musicTitle: music.title,
    musicArtist: music.artist,
    width: num(m.original_width) ?? (video ?? thumb)?.width ?? null,
    height: num(m.original_height) ?? (video ?? thumb)?.height ?? null,
    parts,
    collectionIds: [...new Set(arr(m.saved_collection_ids).map(str).filter((id): id is string => id !== null))],
  };
}

export function readPageInfo(raw: unknown): PageInfo {
  const r = obj(raw);
  const nextCursor = str(r.next_max_id);
  return { nextCursor, moreAvailable: r.more_available === true && nextCursor !== null };
}

export function parseMediaPage(raw: unknown): PageInfo & { items: ParsedPost[]; skipped: number } {
  const items: ParsedPost[] = [];
  let skipped = 0;
  for (const entry of arr(obj(raw).items)) {
    const e = obj(entry);
    const post = parseMedia(isObj(e.media) ? e.media : e);
    if (post) items.push(post);
    else skipped++;
  }
  return { items, skipped, ...readPageInfo(raw) };
}

export function parseCollectionsPage(raw: unknown): PageInfo & { items: ParsedCollection[] } {
  const items = arr(obj(raw).items)
    .map(obj)
    .filter((c) => c.collection_type === undefined || c.collection_type === "MEDIA")
    .map((c) => ({ id: str(c.collection_id), name: str(c.collection_name), mediaCount: num(c.collection_media_count) }))
    .filter((c): c is ParsedCollection => c.id !== null && c.name !== null);
  return { items, ...readPageInfo(raw) };
}
