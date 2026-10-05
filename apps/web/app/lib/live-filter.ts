import type { LivePost, MediaKind } from "@no-fomo/core";

const words = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/** Filters the posts of an account page that are loaded so far: every typed word must appear. */
export function filterLive(posts: LivePost[], f: { q: string | null; kind: MediaKind | null }): LivePost[] {
  const wanted = words(f.q ?? "");
  return posts.filter((p) => {
    if (f.kind && p.kind !== f.kind) return false;
    if (!wanted.length) return true;
    const text = [p.caption, p.accessibilityCaption, p.author.username, p.author.fullName, p.musicTitle, p.locationName]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return wanted.every((w) => text.includes(w));
  });
}
