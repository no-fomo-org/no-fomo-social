import { useEffect, useRef, type ReactNode } from "react";
import type { UseInfiniteQueryResult, InfiniteData } from "@tanstack/react-query";
import type { PostListItem } from "@no-fomo/core";
import { hasFilters, type Filters } from "../lib/filters";
import { PostTile } from "./post-tile";
import { Button } from "./ui/button";

const GRID = "grid grid-cols-2 gap-x-2 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8";

export function PostGrid(props: {
  query: UseInfiniteQueryResult<InfiniteData<{ items: PostListItem[]; nextCursor: string | null; total: number }>>;
  items: PostListItem[];
  filters: Filters;
  onOpen: (id: string) => void;
  onClearFilters: () => void;
  /** Shown when there are no posts and no filters. */
  empty: ReactNode;
  /** Load the next page when the end of the grid comes into view. Default on. */
  autoLoad?: boolean;
}) {
  const { query } = props;
  const sentinel = useRef<HTMLDivElement>(null);
  const autoLoad = props.autoLoad ?? true;

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !autoLoad) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [autoLoad, query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage]);

  if (query.isPending) return <Skeleton count={21} />;
  if (query.isError) {
    return (
      <section className="py-16">
        <h2 className="text-[17px] font-semibold">Could not load your posts</h2>
        <p className="mt-1 text-muted">The no-fomo app on your computer did not answer. Check that it is running.</p>
        <Button className="mt-4" onClick={() => void query.refetch()}>Try again</Button>
      </section>
    );
  }
  const otherFilters = Boolean(props.filters.author || props.filters.collection || props.filters.kind || props.filters.source);
  if (props.items.length === 0) {
    return hasFilters(props.filters) ? (
      <section className="py-16">
        <h2 className="text-[17px] font-semibold">
          {props.filters.q ? (
            <>
              Nothing matches <span className="break-words">“{props.filters.q}”</span>
              {otherFilters ? " with these filters" : ""}
            </>
          ) : (
            "No posts match these filters"
          )}
        </h2>
        <p className="mt-1 max-w-[60ch] text-muted">
          {props.filters.q && !otherFilters
            ? "Search looks at captions, authors, music, places and image descriptions. Try a shorter word."
            : "Try removing a filter."}
        </p>
        <Button className="mt-4" onClick={props.onClearFilters}>Clear search and filters</Button>
      </section>
    ) : (
      <section className="py-16">{props.empty}</section>
    );
  }

  return (
    <>
      <ul className={GRID}>
        {props.items.map((p) => (
          <li key={p.id}><PostTile post={p} onOpen={props.onOpen} /></li>
        ))}
      </ul>
      <div ref={sentinel} aria-hidden="true" />
      {query.isFetchingNextPage && <div className="mt-4"><Skeleton count={7} /></div>}
    </>
  );
}

function Skeleton({ count }: { count: number }) {
  return (
    <ul className={GRID} aria-busy="true" aria-label="Loading posts">
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>
          <div className="aspect-[3/4] animate-pulse rounded-tile bg-surface-2" />
          <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-surface-2" />
          <div className="mt-1.5 h-3 w-5/6 animate-pulse rounded bg-surface-2" />
        </li>
      ))}
    </ul>
  );
}
