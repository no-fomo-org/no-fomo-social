import { IgError, postsPageFromResponse, readIgResponse, replayRequest, templateUsername, type PostsTemplate } from "@no-fomo/core";

/** What the Instagram page shows right now: its path and visible text, to tell a login, a private or a missing account. */
export interface PageView { path: string; text: string }

export interface PagePostsEnv {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  page: () => PageView;
}

const FIRST_PAGE_WAIT_MS = 20_000;
const POLL_MS = 250;

/**
 * An account's posts, read the way Instagram's own page reads them.
 * The page asks a query when an account opens (watched by `capture`): its answer is the first page.
 * Next pages repeat the same query with a cursor, with the ids and tokens the page sent.
 */
export function createPagePosts(env: PagePostsEnv, opts: { waitMs?: number; pollMs?: number } = {}) {
  const waitMs = opts.waitMs ?? FIRST_PAGE_WAIT_MS;
  const pollMs = opts.pollMs ?? POLL_MS;
  let template: PostsTemplate | null = null;
  const firstPages = new Map<string, unknown>();

  /** Called with each profile posts query the page makes and its answer. */
  function capture(t: PostsTemplate, response: unknown): void {
    template = t;
    const name = templateUsername(t);
    if (name) firstPages.set(name, response);
  }

  /** Why the page cannot show posts, when it says so. */
  function problem(): IgError | null {
    const { path, text } = env.page();
    if (path.startsWith("/accounts/login")) return new IgError("login_required", "Log in to Instagram in this browser, then try again.");
    if (/this account is private/i.test(text)) return new IgError("private", "This account is private and you do not follow it.");
    if (/this page isn.t available/i.test(text)) return new IgError("not_found", "No Instagram account has this name.");
    return null;
  }

  async function waitFor<T>(find: () => T | null): Promise<T | null> {
    const end = env.now() + waitMs;
    for (;;) {
      const found = find();
      if (found !== null) return found;
      const p = problem();
      if (p) throw p;
      if (env.now() >= end) return null;
      await env.sleep(pollMs);
    }
  }

  const noPosts = () => new IgError("bad_response", "Could not read this account's posts. Instagram may have changed its page.");

  async function profilePosts(username: string, cursor: string | null): Promise<unknown> {
    if (cursor === null) {
      const key = username.toLowerCase();
      const raw = await waitFor(() => firstPages.get(key) ?? null);
      const page = raw === null ? null : postsPageFromResponse(raw);
      if (!page) throw noPosts();
      return page;
    }
    const t = await waitFor(() => template);
    if (!t) throw new IgError("bad_response", "Open the account again to load more posts.");
    const r = replayRequest(t, username, cursor);
    const res = await env.fetch(r.url, { method: "POST", headers: r.headers, body: r.body, credentials: "include" });
    const page = postsPageFromResponse(await readIgResponse(res, "profile posts"));
    if (!page) throw noPosts();
    return page;
  }

  return { capture, profilePosts };
}
