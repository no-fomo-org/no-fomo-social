import {
  IgError, parseMediaPage, parseProfileInfo, parseUserSearch, runFollowingUpdate, toLivePost,
  type IgClient, type LivePage, type LiveProfile, type LoadStart,
} from "@no-fomo/core";
import { createFollowingSink } from "./relay-sink";
import type { RelayMessage, RelayResponse } from "./relay";

type Msg = { type?: unknown; query?: unknown; serverUrl?: unknown; username?: unknown; cursor?: unknown };
type Reply = { ok: true; [k: string]: unknown } | { ok: false; error: string; detail?: string };

/** The code picks the app's text; the detail says what Instagram answered. */
const failure = (e: unknown): Reply => ({ ok: false, error: e instanceof IgError ? e.code : "internal", detail: (e as Error).message });

/** One page of an account, ready to show. The cursor carries the user id, so the next call needs nothing else. */
function livePage(userId: string, raw: unknown): LivePage {
  const page = parseMediaPage(raw);
  return {
    posts: page.items.map(toLivePost),
    nextCursor: page.moreAvailable && page.nextCursor ? `${userId}:${page.nextCursor}` : null,
  };
}

/**
 * Account pages, profile search and following updates in the Instagram tab.
 * Account pages go straight back to the app page: nothing is stored.
 * The request gate keeps every Instagram call apart.
 */
export function createTabJobs(deps: { ig: IgClient; send: (m: RelayMessage) => Promise<RelayResponse>; viewerId: () => string | null }) {
  let updating = false;

  async function open(username: string): Promise<Reply> {
    const info = parseProfileInfo(await deps.ig.profileInfo(username));
    if (!info) return { ok: false, error: "profile_not_found" };
    const profile: LiveProfile = {
      id: info.id, username: info.username, fullName: info.fullName, avatarUrl: info.avatarUrl,
      postCount: info.postCount, isPrivate: info.isPrivate, followedByViewer: info.followedByViewer,
    };
    // Instagram shows nothing of a private account to people who do not follow it.
    if (info.isPrivate && !info.followedByViewer) return { ok: true, profile, page: null };
    return { ok: true, profile, page: livePage(info.id, await deps.ig.userFeed(info.id, null)) };
  }

  async function nextPage(cursor: string): Promise<Reply> {
    const at = cursor.indexOf(":");
    const userId = cursor.slice(0, at);
    return { ok: true, page: livePage(userId, await deps.ig.userFeed(userId, cursor.slice(at + 1))) };
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
