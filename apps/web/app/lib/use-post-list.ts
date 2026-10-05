import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { useInfiniteQuery } from "@tanstack/react-query";

type Page<T> = { items: T[]; nextCursor: string | null; total: number };

/** A paged list plus the post viewer state kept in `?post=`. */
export function usePostList<T extends { id: string }>(o: { queryKey: unknown[]; fetchPage: (cursor: string | null) => Promise<Page<T>>; enabled?: boolean }) {
  const [params, setParams] = useSearchParams();
  const query = useInfiniteQuery({
    queryKey: o.queryKey,
    enabled: o.enabled ?? true,
    queryFn: ({ pageParam }) => o.fetchPage(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last: Page<T>) => last.nextCursor,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
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
    total: query.data?.pages[0]?.total,
    open: openIndex >= 0 ? items[openIndex]! : null,
    prev: openIndex > 0 ? items[openIndex - 1]! : null,
    next: openIndex >= 0 ? (items[openIndex + 1] ?? null) : null,
    setPost,
  };
}
