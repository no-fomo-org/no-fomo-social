import { IgError, parseMediaPage, toLivePost, type IgClient, type PostMedia } from "@no-fomo/core";
import type { RelayMessage, RelayResponse } from "./relay";

export type MediaFetchResult = { ok: true; media: PostMedia } | { ok: false; error: string; until?: number };

/**
 * One Instagram request for a post's fresh links. The local server updates its copy of the post.
 * `store`: the server also stores a post it does not have (Analyze). Without it, a post the app does
 * not store (seen on an account page) gets its links straight from Instagram's answer.
 */
export async function fetchMedia(opts: {
  ig: IgClient;
  id: string;
  serverUrl: string;
  send: (m: RelayMessage) => Promise<RelayResponse>;
  store: boolean;
}): Promise<MediaFetchResult> {
  if (!/^\d{1,30}$/.test(opts.id)) return { ok: false, error: "bad_message" };
  let payload: unknown;
  try {
    payload = await opts.ig.mediaInfo(opts.id);
  } catch (e) {
    if (e instanceof IgError) return { ok: false, error: e.code, ...(e.until ? { until: e.until } : {}) };
    return { ok: false, error: "internal" };
  }
  const r = await opts.send({ type: "relay", serverUrl: opts.serverUrl, path: `/api/sync/media/${opts.id}`, body: { payload, store: opts.store } });
  if (r.ok) return { ok: true, media: r.data as PostMedia };
  if (r.error === "not_stored" && !opts.store) {
    const post = parseMediaPage(payload).items[0];
    if (post?.id === opts.id) return { ok: true, media: toLivePost(post).media };
  }
  return { ok: false, error: "server_error" };
}
