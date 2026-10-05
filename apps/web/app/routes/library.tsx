import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { hasFilters, NO_FILTERS, postsQueryString, readFilters, writeFilters, type Filters } from "../lib/filters";
import { FilterBar } from "../components/filter-bar";
import { PostGrid } from "../components/post-grid";
import { Viewer } from "../components/viewer/viewer";
import { TopBar } from "../components/top-bar";

export default function Library() {
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const update = (patch: Partial<Filters>) => setParams(writeFilters(params, { ...patch }), { replace: true });

  const posts = useInfiniteQuery({
    queryKey: ["posts", filters],
    queryFn: ({ pageParam }) => api.posts(postsQueryString(filters, pageParam)),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = posts.data?.pages.flatMap((p) => p.items) ?? [];
  const openId = params.get("post");
  const openIndex = openId ? items.findIndex((p) => p.id === openId) : -1;
  const open = openIndex >= 0 ? items[openIndex]! : null;

  // Keep a few posts ahead loaded so "next" never stalls at the end of a page.
  const nearEnd = openIndex >= 0 && openIndex >= items.length - 3;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = posts;
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

  const prev = openIndex > 0 ? items[openIndex - 1]! : null;
  const next = openIndex >= 0 ? items[openIndex + 1] ?? null : null;

  return (
    <div className="min-h-[100dvh]">
      <TopBar query={filters.q} onQueryChange={(q) => update({ q })} />
      <main className="mx-auto max-w-[1600px] px-4 pb-16 md:px-6">
        <FilterBar filters={filters} total={posts.data?.pages[0]?.total} onChange={update} />
        <PostGrid
          query={posts}
          items={items}
          filters={filters}
          onOpen={(id) => setPost(id)}
          onClearFilters={() => update(NO_FILTERS)}
        />
      </main>
      <Viewer
        post={open}
        onClose={() => setPost(null)}
        onPrev={prev ? () => setPost(prev.id, true) : null}
        onNext={next ? () => setPost(next.id, true) : null}
        onShowAuthor={(author) => {
          const nextParams = writeFilters(params, { author });
          nextParams.delete("post");
          setParams(nextParams, { replace: true });
        }}
      />
    </div>
  );
}
