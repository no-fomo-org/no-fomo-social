import { useSearchParams } from "react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { hasFilters, postsQueryString, readFilters, writeFilters, type Filters } from "../lib/filters";
import { FilterBar } from "../components/filter-bar";
import { PostGrid } from "../components/post-grid";
import { PostSheet } from "../components/post-sheet";
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
  const open = openId ? items.find((p) => p.id === openId) ?? null : null;

  const setPost = (id: string | null) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id) next.set("post", id);
      else next.delete("post");
      return next;
    });

  return (
    <div className="min-h-[100dvh]">
      <TopBar />
      <main className="mx-auto max-w-[1600px] px-4 pb-16 md:px-6">
        <FilterBar filters={filters} total={posts.data?.pages[0]?.total} onChange={update} />
        <PostGrid
          query={posts}
          items={items}
          filtered={hasFilters(filters)}
          onOpen={setPost}
          onClearFilters={() => update({ author: null, collection: null, kind: null })}
        />
      </main>
      <PostSheet
        post={open}
        onClose={() => setPost(null)}
        onShowAuthor={(author) => {
          const next = writeFilters(params, { author });
          next.delete("post");
          setParams(next, { replace: true });
        }}
      />
    </div>
  );
}
