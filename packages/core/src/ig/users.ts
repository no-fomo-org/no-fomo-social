import { arr, num, obj, str } from "./json";
import { parseAuthor } from "./parse";
import type { ParsedAuthor, ParsedProfile, ParsedUserPage, UserSuggestion } from "./types";

export function parseProfileInfo(raw: unknown): ParsedProfile | null {
  const u = obj(obj(obj(raw).data).user);
  const a = parseAuthor(u);
  if (!a) return null;
  return {
    ...a,
    postCount: num(obj(u.edge_owner_to_timeline_media).count) ?? num(u.media_count),
    isPrivate: u.is_private === true,
    followedByViewer: u.followed_by_viewer === true,
  };
}

/** At most 20 accounts, in Instagram's order. */
export function parseUserSearch(raw: unknown): UserSuggestion[] {
  const out: UserSuggestion[] = [];
  for (const entry of arr(obj(raw).users)) {
    const u = obj(obj(entry).user ?? entry);
    const a = parseAuthor(u);
    if (a) out.push({ ...a, isPrivate: u.is_private === true, isVerified: u.is_verified === true });
    if (out.length === 20) break;
  }
  return out;
}

/** The following list has no `more_available`: a next cursor means there is more. */
export function parseFollowingPage(raw: unknown): ParsedUserPage {
  const r = obj(raw);
  const items = arr(r.users).map((u) => parseAuthor(obj(u))).filter((a): a is ParsedAuthor => a !== null);
  const nextCursor = str(r.next_max_id);
  return { items, nextCursor, moreAvailable: nextCursor !== null };
}
