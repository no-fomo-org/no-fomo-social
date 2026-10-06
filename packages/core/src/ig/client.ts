export const IG_APP_ID = "936619743392459";

/**
 * `paused`: the app holds Instagram calls back after Instagram refused one.
 * `budget`: the app made its hourly number of calls. Both carry `until`.
 * `private`: a private account the owner does not follow. Not a refusal: it starts no stop.
 */
export type IgErrorCode = "login_required" | "rate_limited" | "refused" | "http_error" | "bad_response" | "not_found" | "paused" | "budget" | "private";

export class IgError extends Error {
  constructor(
    public readonly code: IgErrorCode,
    message: string,
    public readonly status?: number,
    /** For `paused` and `budget`: when calls are allowed again (ms). */
    public readonly until?: number,
  ) {
    super(message);
    this.name = "IgError";
  }
}

export interface IgClient {
  savedPage(cursor: string | null): Promise<unknown>;
  collectionsPage(cursor: string | null): Promise<unknown>;
  mediaInfo(id: string): Promise<unknown>;
  /**
   * One page of an account's posts as `{ items, more_available, next_max_id }`; `cursor` null is the first page.
   * Not a plain Instagram call any more: the extension reads Instagram's own page for it (see posts-query.ts).
   */
  profilePosts(username: string, cursor: string | null): Promise<unknown>;
  searchUsers(query: string): Promise<unknown>;
  followingPage(viewerId: string, cursor: string | null): Promise<unknown>;
}

/** What `createIgClient` can do by itself: every call except an account's posts. */
export type RestIgClient = Omit<IgClient, "profilePosts">;

const LOGIN_MESSAGE = "Log in to Instagram in this browser, then try again.";
const NOT_FOUND_MESSAGE = "This post was deleted on Instagram.";
const isPrivate = (message: unknown) => typeof message === "string" && /not authorized to view/i.test(message);
const PRIVATE_MESSAGE = "This account is private and you do not follow it.";
const isNotFound = (message: unknown) => typeof message === "string" && /not found|unavailable|deleted/i.test(message);

/**
 * Turns Instagram's answer into its JSON or an `IgError` with the right code. `notFound`: the call reads one post,
 * so "not found" means the post was deleted.
 */
export async function readIgResponse(res: Response, label: string, notFound = false): Promise<unknown> {
  if (res.status === 429) throw new IgError("rate_limited", "Instagram asked to slow down. Try again later.", 429);
  if (!res.ok) {
    // Instagram often says "wait a few minutes" with 401 and require_login, or blocks with 400 and spam/feedback_required.
    // These are limits, not a logged-out browser, so they must start a stop.
    const b = (await res.clone().json().catch(() => null)) as { message?: unknown; spam?: unknown } | null;
    if (b?.spam === true || (typeof b?.message === "string" && /wait a few minutes/i.test(b.message))) {
      throw new IgError("rate_limited", "Instagram asked to slow down. Try again later.", res.status);
    }
    if (b?.message === "feedback_required") throw new IgError("refused", "Instagram refused the request (feedback_required).", res.status);
    if (isPrivate(b?.message)) throw new IgError("private", PRIVATE_MESSAGE, res.status);
  }
  if (res.status === 401 || res.status === 403) throw new IgError("login_required", LOGIN_MESSAGE, res.status);
  if (notFound && res.status === 404) throw new IgError("not_found", NOT_FOUND_MESSAGE, 404);
  if (notFound && res.status === 400) {
    const b = (await res.clone().json().catch(() => null)) as { message?: unknown } | null;
    if (isNotFound(b?.message)) throw new IgError("not_found", NOT_FOUND_MESSAGE, 400);
  }
  if (!res.ok) throw new IgError("http_error", `Instagram returned error ${res.status} (${label}).`, res.status);

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new IgError("login_required", LOGIN_MESSAGE);
  }
  const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  if (b.require_login === true || b.message === "login_required") throw new IgError("login_required", LOGIN_MESSAGE);
  if (b.spam === true) throw new IgError("rate_limited", "Instagram asked to slow down. Try again later.");
  if (notFound && b.status === "fail" && isNotFound(b.message)) throw new IgError("not_found", NOT_FOUND_MESSAGE);
  if (b.status === "fail" && isPrivate(b.message)) throw new IgError("private", PRIVATE_MESSAGE);
  if (b.status === "fail") throw new IgError("refused", `Instagram refused the request (${String(b.message ?? "unknown")}).`);
  return body;
}

export function createIgClient(opts: {
  fetch: typeof fetch;
  csrfToken: () => string | null;
  origin?: string;
}): RestIgClient {
  const origin = opts.origin ?? "https://www.instagram.com";

  /** `notFound`: this call reads one post, so "not found" means the post was deleted. */
  async function get(label: string, path: string, params: Record<string, string | null>, notFound = false): Promise<unknown> {
    const url = new URL(path, origin);
    for (const [k, v] of Object.entries(params)) if (v !== null) url.searchParams.set(k, v);
    const headers: Record<string, string> = {
      "X-IG-App-ID": IG_APP_ID,
      "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json",
    };
    const csrf = opts.csrfToken();
    if (csrf) headers["X-CSRFToken"] = csrf;

    let res: Response;
    try {
      res = await opts.fetch(url.toString(), { headers, credentials: "include" });
    } catch (e) {
      throw new IgError("http_error", `Could not reach Instagram: ${(e as Error).message}`);
    }
    return readIgResponse(res, label, notFound);
  }

  /** Ids go into the URL path, so only digits may pass. */
  const userPath = (id: string, rest: string) => {
    if (!/^\d{1,30}$/.test(id)) throw new IgError("bad_response", "Bad Instagram user id.");
    return `/api/v1/${rest.replace("{id}", id)}`;
  };

  return {
    savedPage: (cursor) => get("saved posts", "/api/v1/feed/saved/posts/", { max_id: cursor }),
    // Same query the instagram.com Saved page sends. The parser keeps only user collections ("MEDIA").
    collectionsPage: (cursor) =>
      get("collections list", "/api/v1/collections/list/", {
        collection_types: '["ALL_MEDIA_AUTO_COLLECTION","MEDIA","AUDIO_AUTO_COLLECTION"]',
        get_cover_media_lists: "true",
        include_public_only: "0",
        max_id: cursor ?? "",
      }),
    mediaInfo: (id) => get("post", `/api/v1/media/${id}/info/`, {}, true),
    searchUsers: (query) => get("search", "/api/v1/web/search/topsearch/", { context: "blended", query }),
    // The default order is a ranking that changes between pages, so pages overlap and miss accounts.
    // Ordered by follow date, the owner's own list stays put while it is read.
    followingPage: async (viewerId, cursor) =>
      get("following list", userPath(viewerId, "friendships/{id}/following/"), { count: "50", order: "date_followed_latest", max_id: cursor }),
  };
}
