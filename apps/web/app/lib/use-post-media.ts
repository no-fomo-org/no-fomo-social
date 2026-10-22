import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PostMedia } from "@no-fomo-social/core";
import { api } from "./api";
import { refreshExtensionMedia } from "./extension";
import { canRefresh, mediaErrorCode, needsRefresh, REFRESH_DELAY_MS, staleAction, type MediaErrorCode } from "./media";

const nowSec = () => Date.now() / 1000;

/**
 * A post's media links, renewed through the extension when missing, about to expire, or failing to load.
 * Mount once per post (the viewer keys it by post id), so state never leaks between posts.
 * `configReady`: the app config (with the extension id) has loaded, so a missing id means no extension.
 * `live`: links that came with a post shown straight from Instagram. The app may not store that post, so it never asks the server.
 */
export function usePostMedia(postId: string, extensionId: string | undefined, configReady: boolean, live?: PostMedia) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["media", postId],
    queryFn: () => api.media(postId),
    staleTime: 60_000,
    initialData: live,
    enabled: !live,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<MediaErrorCode | null>(null);
  const lastRefreshAt = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    lastRefreshAt.current = Date.now();
    if (!extensionId) return setError("no_extension");
    setRefreshing(true);
    setError(null);
    const reply = await refreshExtensionMedia(extensionId, postId);
    setRefreshing(false);
    if (reply?.ok && reply.media) {
      qc.setQueryData<PostMedia>(["media", postId], reply.media);
      if (needsRefresh(reply.media, nowSec())) setError("load_failed");
    } else {
      setError(mediaErrorCode(reply));
    }
  }, [extensionId, postId, qc]);

  const data = query.data;
  const stale = !!data && needsRefresh(data, nowSec());
  const action = stale ? staleAction({ configReady, refreshing, lastRefreshAt: lastRefreshAt.current, now: Date.now() }) : null;
  useEffect(() => {
    if (action !== "refresh") return;
    const timer = setTimeout(() => void refresh(), REFRESH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [action, refresh]);

  /** A link failed to load in the browser: renew it, unless that was just tried. */
  const onLoadError = useCallback(() => {
    if (canRefresh(lastRefreshAt.current, Date.now())) void refresh();
    else setError("load_failed");
  }, [refresh]);

  const retry = useCallback(() => {
    lastRefreshAt.current = null;
    setError(null);
    if (query.isError) void query.refetch();
    else void refresh();
  }, [query, refresh]);

  const finalError: MediaErrorCode | null = query.isError ? "load_failed" : (error ?? (action === "give_up" ? "load_failed" : null));
  return {
    media: stale || finalError ? null : (data ?? null),
    loading: !finalError && (query.isPending || refreshing || stale),
    error: finalError,
    retry,
    onLoadError,
  };
}
