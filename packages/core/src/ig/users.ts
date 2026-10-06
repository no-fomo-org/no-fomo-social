import { arr, obj, str } from "./json";
import { parseAuthor } from "./parse";
import type { ParsedAuthor, ParsedUserPage, UserSuggestion } from "./types";

/**
 * The account a feed page belongs to, from its first post. Opening an account reads it from here:
 * Instagram refuses web_profile_info for everyone since August 2026.
 */
export function parseFeedOwner(raw: unknown): ParsedAuthor | null {
  const first = arr(obj(raw).items)[0];
  return first === undefined ? null : parseAuthor(obj(obj(first).user));
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
