import { IgError, type IgClient, type PostMedia } from "@no-fomo/core";
import type { RelayMessage, RelayResponse } from "./relay";

export type MediaFetchResult = { ok: true; media: PostMedia } | { ok: false; error: string };

/** One Instagram request for a post's fresh links, stored by the local server. */
export async function fetchMedia(opts: {
  ig: IgClient;
  id: string;
  serverUrl: string;
  send: (m: RelayMessage) => Promise<RelayResponse>;
}): Promise<MediaFetchResult> {
  if (!/^\d{1,30}$/.test(opts.id)) return { ok: false, error: "bad_message" };
  let payload: unknown;
  try {
    payload = await opts.ig.mediaInfo(opts.id);
  } catch (e) {
    return { ok: false, error: e instanceof IgError ? e.code : "internal" };
  }
  const r = await opts.send({ type: "relay", serverUrl: opts.serverUrl, path: `/api/sync/media/${opts.id}`, body: { payload } });
  return r.ok ? { ok: true, media: r.data as PostMedia } : { ok: false, error: "server_error" };
}
