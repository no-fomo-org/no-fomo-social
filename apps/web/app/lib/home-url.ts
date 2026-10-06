import { parseProfileInput } from "./profile-input";

/**
 * Home keeps its state in the URL, so Back and reloads show the same thing without asking Instagram again:
 * `q` the search text, `find` the Instagram search sent with Enter, `account` the open account, `post` the open post.
 */
export function withParam(params: URLSearchParams, key: string, value: string | null): URLSearchParams {
  const next = new URLSearchParams(params);
  if (value) next.set(key, value);
  else next.delete(key);
  return next;
}

export const accountSearch = (params: URLSearchParams, username: string) => `?${withParam(withParam(params, "post", null), "account", username)}`;
export const backSearch = (params: URLSearchParams) => `?${withParam(withParam(params, "post", null), "account", null)}`;

export type SearchAction = { open: string } | { find: string } | null;

/** Enter in the search box: a profile link or @username opens the account; other text searches Instagram once. */
export function searchAction(text: string): SearchAction {
  const t = text.trim();
  if (/instagram\.com/i.test(t) || t.startsWith("@")) {
    const name = parseProfileInput(t);
    return name ? { open: name } : null;
  }
  return t.length >= 2 && t.length <= 60 ? { find: t } : null;
}
