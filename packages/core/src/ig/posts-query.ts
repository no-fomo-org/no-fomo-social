import { arr, isObj, obj, str, type Json } from "./json";

/**
 * Since September 2026 Instagram no longer serves an account's posts through /api/v1/feed/user/.
 * Its own page asks a persisted GraphQL query. The extension watches that query and repeats it for other accounts,
 * so a new query id or new tokens need no code change: they are copied from what the page sent.
 */
export interface PostsTemplate {
  url: string;
  /** Headers of Instagram's own request (CSRF, app id, LSD). */
  headers: Record<string, string>;
  /** Form fields of Instagram's own request, without `variables`: query id, tokens. */
  params: Record<string, string>;
  variables: Json;
}

const QUERY_NAME = /ProfilePosts/i;

/** The template when this request is Instagram's own profile posts query, otherwise null. */
export function parsePostsRequest(url: string, headers: Record<string, string>, body: string): PostsTemplate | null {
  let path: string;
  try {
    path = new URL(url, "https://www.instagram.com").pathname;
  } catch {
    return null;
  }
  if (!/\/graphql\/query\/?$/.test(path)) return null;
  const form = new URLSearchParams(body);
  const name = form.get("fb_api_req_friendly_name");
  const vars = form.get("variables");
  if (!name || !QUERY_NAME.test(name) || !form.get("doc_id") || !vars) return null;
  let variables: unknown;
  try {
    variables = JSON.parse(vars);
  } catch {
    return null;
  }
  if (!isObj(variables) || typeof variables.username !== "string") return null;
  const params: Record<string, string> = {};
  for (const [k, v] of form) if (k !== "variables") params[k] = v;
  return { url: new URL(path, "https://www.instagram.com").toString(), headers, params, variables };
}

export const templateUsername = (t: PostsTemplate): string | null => {
  const u = t.variables.username;
  return typeof u === "string" ? u.toLowerCase() : null;
};

/** The same query for another account and cursor (null: first page). */
export function replayRequest(t: PostsTemplate, username: string, cursor: string | null): { url: string; headers: Record<string, string>; body: string } {
  const form = new URLSearchParams(t.params);
  form.set("variables", JSON.stringify({ ...t.variables, username, first: t.variables.first ?? 12, after: cursor }));
  return { url: t.url, headers: { ...t.headers, "content-type": "application/x-www-form-urlencoded" }, body: form.toString() };
}

/** Finds the posts connection by its shape, because Instagram renames it often. */
function findConnection(v: unknown, depth = 0): Json | null {
  if (!isObj(v) || depth > 6) return null;
  const edges = arr(v.edges);
  if (edges.length > 0 && edges.some((e) => str(obj(obj(e).node).code) !== null)) return v;
  for (const child of Object.values(v)) {
    const found = findConnection(child, depth + 1);
    if (found) return found;
  }
  return null;
}

/** Instagram's answer in the shape the feed readers expect: `items`, `more_available`, `next_max_id`. */
export function postsPageFromResponse(raw: unknown): { items: unknown[]; more_available: boolean; next_max_id: string | null } | null {
  const c = findConnection(raw);
  if (!c) return null;
  const info = obj(c.page_info);
  const cursor = str(info.end_cursor);
  return {
    items: arr(c.edges).map((e) => obj(e).node).filter((n) => isObj(n)),
    more_available: info.has_next_page === true && cursor !== null,
    next_max_id: cursor,
  };
}
