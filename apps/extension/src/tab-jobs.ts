import {
  IgError, parseFeedOwner, parseMediaPage, parseUserSearch, runFollowingUpdate, toLivePost,
  type IgClient, type LivePage, type LiveProfile, type LoadStart, type ParsedAuthor,
} from "@no-fomo/core";
import { createFollowingSink } from "./relay-sink";
import type { RelayMessage, RelayResponse } from "./relay";

type Msg = { type?: unknown; query?: unknown; serverUrl?: unknown; username?: unknown; cursor?: unknown };
type Reply = { ok: true; [k: string]: unknown } | { ok: false; error: string; detail?: string; until?: number };

/** The code picks the app's text; the detail says what Instagram answered; `until` says when calls are allowed again. */
const failure = (e: unknown): Reply =>
  e instanceof IgError
    ? { ok: false, error: e.code, detail: e.message, ...(e.until ? { until: e.until } : {}) }
    : { ok: false, error: "internal", detail: (e as Error).message };

/** One page of an account, ready to show. */
function livePage(username: string, raw: unknown): LivePage {
  const page = parseMediaPage(raw);
  return {
    posts: page.items.map(toLivePost),
    nextCursor: page.moreAvailable && page.nextCursor ? `${username}:${page.nextCursor}` : null,
  };
}

/**
 * Account pages, profile search and following updates in the Instagram tab.
 * Account pages go straight back to the app page: nothing is stored.
 * The request gate keeps every Instagram call apart. Every job here fails at once when calls are limited: a following update
 * that waited for the hourly limit would look stopped to the app after 2 minutes, so it ends with a clear error instead.
 */
export function createTabJobs(deps: { ig: IgClient; send: (m: RelayMessage) => Promise<RelayResponse>; viewerId: () => string | null }) {
  let updating = false;

  /**
   * Opens an account: Instagram's own page loads its first posts and the extension reads them (see page-posts.ts).
   * The account's names and avatar come from its first post.
   */
  async function open(username: string): Promise<Reply> {
    const profile = (owner: ParsedAuthor | null, isPrivate: boolean): LiveProfile => ({
      id: owner?.id ?? "",
      username: owner?.username ?? username,
      fullName: owner?.fullName ?? null,
      avatarUrl: owner?.avatarUrl ?? null,
      postCount: null,
      isPrivate,
      followedByViewer: false,
    });
    let raw: unknown;
    try {
      raw = await deps.ig.profilePosts(username, null);
    } catch (e) {
      // Instagram shows nothing of a private account to people who do not follow it.
      if (e instanceof IgError && e.code === "private") return { ok: true, profile: profile(null, true), page: null };
      throw e;
    }
    return { ok: true, profile: profile(parseFeedOwner(raw), false), page: livePage(username, raw) };
  }

  /** The cursor is "<username>:<Instagram cursor>", so the next call needs nothing else. */
  async function nextPage(cursor: string): Promise<Reply> {
    const at = cursor.indexOf(":");
    const username = cursor.slice(0, at);
    return { ok: true, page: livePage(username, await deps.ig.profilePosts(username, cursor.slice(at + 1))) };
  }

  const safely = (run: () => Promise<Reply>): Promise<Reply> => run().catch(failure);

  /** Answers as soon as the update started (or failed to), then lets it run. */
  function startUpdate(serverUrl: string): Promise<LoadStart> {
    if (updating) return Promise.resolve({ ok: false, error: "busy" });
    updating = true;
    return new Promise<LoadStart>((resolve) => {
      void runFollowingUpdate({ ig: deps.ig, sink: createFollowingSink(serverUrl, deps.send), viewerId: deps.viewerId(), onStart: resolve })
        .then((r) => console.info("[no-fomo] following update finished", r))
        .finally(() => { updating = false; });
    });
  }

  return {
    handle(raw: unknown): Promise<unknown> | null {
      const m = (raw ?? {}) as Msg;
      if (m.type === "profile:search" && typeof m.query === "string") {
        const query = m.query;
        return safely(async () => ({ ok: true, users: parseUserSearch(await deps.ig.searchUsers(query)) }));
      }
      if (m.type === "profile:open" && typeof m.username === "string") {
        const username = m.username;
        return safely(() => open(username));
      }
      if (m.type === "profile:page" && typeof m.cursor === "string" && m.cursor.includes(":")) {
        const cursor = m.cursor;
        return safely(() => nextPage(cursor));
      }
      if (m.type === "following:update" && typeof m.serverUrl === "string") return startUpdate(m.serverUrl);
      return null;
    },
  };
}
