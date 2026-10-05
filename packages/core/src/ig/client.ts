export const IG_APP_ID = "936619743392459";

export type IgErrorCode = "login_required" | "rate_limited" | "refused" | "http_error" | "bad_response" | "not_found";

export class IgError extends Error {
  constructor(public readonly code: IgErrorCode, message: string, public readonly status?: number) {
    super(message);
    this.name = "IgError";
  }
}

export interface IgClient {
  savedPage(cursor: string | null): Promise<unknown>;
  collectionsPage(cursor: string | null): Promise<unknown>;
  mediaInfo(id: string): Promise<unknown>;
}

const LOGIN_MESSAGE = "Log in to Instagram in this browser, then sync again.";
const NOT_FOUND_MESSAGE = "This post was deleted on Instagram.";
const isNotFound = (message: unknown) => typeof message === "string" && /not found|unavailable|deleted/i.test(message);

export function createIgClient(opts: {
  fetch: typeof fetch;
  csrfToken: () => string | null;
  origin?: string;
}): IgClient {
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
    if (res.status === 429) throw new IgError("rate_limited", "Instagram asked to slow down. Sync stopped. Try again later.", 429);
    if (res.status === 401 || res.status === 403) throw new IgError("login_required", LOGIN_MESSAGE, res.status);
    if (notFound && res.status === 404) throw new IgError("not_found", NOT_FOUND_MESSAGE, 404);
    if (notFound && res.status === 400) {
      const b = (await res.clone().json().catch(() => null)) as { message?: unknown } | null;
      if (isNotFound(b?.message)) throw new IgError("not_found", NOT_FOUND_MESSAGE, 400);
    }
    if (!res.ok) throw new IgError("http_error", `Instagram returned error ${res.status} (${label}). Sync stopped.`, res.status);

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new IgError("login_required", LOGIN_MESSAGE);
    }
    const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
    if (b.require_login === true || b.message === "login_required") throw new IgError("login_required", LOGIN_MESSAGE);
    if (b.spam === true) throw new IgError("rate_limited", "Instagram asked to slow down. Sync stopped. Try again later.");
    if (notFound && b.status === "fail" && isNotFound(b.message)) throw new IgError("not_found", NOT_FOUND_MESSAGE);
    if (b.status === "fail") throw new IgError("refused", `Instagram refused the request (${String(b.message ?? "unknown")}). Sync stopped.`);
    return body;
  }

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
  };
}
