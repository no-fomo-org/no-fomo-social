import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PostMedia } from "@no-fomo/core";
import { api } from "./api";
import { refreshExtensionMedia } from "./extension";
import { mediaErrorCode, needsRefresh, REFRESH_DELAY_MS, type MediaErrorCode } from "./media";

const nowSec = () => Date.now() / 1000;

/**
 * A post's media links, renewed through the extension when missing or about to expire.
 * Mount once per post (the viewer keys it by post id), so state never leaks between posts.
 */
export function usePostMedia(postId: string, extensionId: string | undefined) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["media", postId], queryFn: () => api.media(postId), staleTime: 60_000 });
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<MediaErrorCode | null>(null);
  const triedRefresh = useRef(false);

  const refresh = useCallback(async () => {
    triedRefresh.current = true;
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
  useEffect(() => {
    if (!stale || triedRefresh.current) return;
    const timer = setTimeout(() => void refresh(), REFRESH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [stale, refresh]);

  /** A link failed to load in the browser: renew it once, then give up. */
  const onLoadError = useCallback(() => {
    if (triedRefresh.current) setError("load_failed");
    else void refresh();
  }, [refresh]);

  const retry = useCallback(() => {
    triedRefresh.current = false;
    setError(null);
    if (query.isError) void query.refetch();
    else void refresh();
  }, [query, refresh]);

  const finalError: MediaErrorCode | null = query.isError ? "load_failed" : error;
  return {
    media: stale || finalError ? null : (data ?? null),
    loading: !finalError && (query.isPending || refreshing || stale),
    error: finalError,
    retry,
    onLoadError,
  };
}
