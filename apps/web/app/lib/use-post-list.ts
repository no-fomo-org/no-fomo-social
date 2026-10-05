import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { useInfiniteQuery } from "@tanstack/react-query";

type Page<T> = { items: T[]; nextCursor: string | null; total: number };

/** A paged list plus the post viewer state kept in `?post=`. Pages may carry more than the list (for example the account). */
export function usePostList<P extends Page<{ id: string }>>(o: {
  queryKey: unknown[];
  fetchPage: (cursor: string | null) => Promise<P>;
  enabled?: boolean;
  staleTime?: number;
  /** Ask again after an error. Off for Instagram pages: a retry is one more Instagram request. */
  retry?: boolean;
  /** What to show of the loaded items (filtering, extra marks). The viewer moves through these. */
  view?: (items: P["items"][number][]) => P["items"][number][];
}) {
  const [params, setParams] = useSearchParams();
  const query = useInfiniteQuery({
    queryKey: o.queryKey,
    enabled: o.enabled ?? true,
    queryFn: ({ pageParam }) => o.fetchPage(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last: P) => last.nextCursor,
    staleTime: o.staleTime,
    ...(o.retry === false ? { retry: false } : {}),
  });
  type T = P["items"][number];
  const loaded: T[] = query.data?.pages.flatMap((p) => p.items as T[]) ?? [];
  const items = o.view ? o.view(loaded) : loaded;
  const openId = params.get("post");
  const openIndex = openId ? items.findIndex((p) => p.id === openId) : -1;

  // Keep a few posts ahead loaded so "next" never stalls at the end of a page.
  const nearEnd = openIndex >= 0 && openIndex >= items.length - 3;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    if (nearEnd && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [nearEnd, hasNextPage, isFetchingNextPage, fetchNextPage]);

  /** Opening a post adds a history entry; moving between posts replaces it. */
  const setPost = (id: string | null, replace = false) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set("post", id);
        else next.delete("post");
        return next;
      },
      { replace },
    );

  return {
    query,
    items,
    loaded,
    total: query.data?.pages[0]?.total,
    open: openIndex >= 0 ? items[openIndex]! : null,
    prev: openIndex > 0 ? items[openIndex - 1]! : null,
    next: openIndex >= 0 ? (items[openIndex + 1] ?? null) : null,
    setPost,
  };
}
