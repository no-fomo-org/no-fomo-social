import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { UseInfiniteQueryResult, InfiniteData } from "@tanstack/react-query";
import type { PostListItem } from "@no-fomo-social/core";
import { Tooltip } from "@base-ui/react/tooltip";
import { hasFilters, type Filters } from "../lib/filters";
import { listBody } from "../lib/live-pages";
import { PostTile } from "./post-tile";
import { Button } from "./ui/button";

const GRID =
  "grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4 lg:gap-x-5 lg:gap-y-8 xl:grid-cols-5 min-[1680px]:grid-cols-6";
/** Tiles that rise in when the grid first appears; the rest of the page is already there. */
const INTRO_TILES = 12;

export function PostGrid(props: {
  query: UseInfiniteQueryResult<InfiniteData<{ items: PostListItem[]; nextCursor: string | null; total: number }>>;
  items: PostListItem[];
  filters: Filters;
  onOpen: (id: string) => void;
  onClearFilters: () => void;
  /** Shown when there are no posts and no filters. Brings its own spacing. */
  empty: ReactNode;
  /** Load the next page when the end of the grid comes into view. Default on. */
  autoLoad?: boolean;
  /** Shown when a next page failed. */
  nextErrorText?: string;
}) {
  const { query } = props;
  const sentinel = useRef<HTMLDivElement>(null);
  // After a failed page, wait for the owner: loading again by itself would repeat the failing request in a loop.
  const autoLoad = (props.autoLoad ?? true) && !query.isFetchNextPageError;
  const intro = useIntro(props.items);

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

  if (query.isPending) return <Skeleton count={12} />;
  if (listBody({ isError: query.isError, hasData: !!query.data }) === "error") {
    return (
      <section className="py-16">
        <h2 className="text-[17px] font-semibold">Could not load your posts</h2>
        <p className="mt-1 text-muted">The no-fomo-social app on your computer did not answer. Check that it is running.</p>
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
      props.empty
    );
  }

  return (
    <>
      {/* One shared delay: after the first tooltip, the next ones open at once. */}
      <Tooltip.Provider delay={400}>
        <ul className={GRID}>
          {props.items.map((p) => (
            <li key={p.id} className={intro.has(p.id) ? "fl-rise" : undefined} style={intro.has(p.id) ? ({ "--i": intro.get(p.id) } as CSSProperties) : undefined}>
              <PostTile post={p} onOpen={props.onOpen} />
            </li>
          ))}
        </ul>
      </Tooltip.Provider>
      <div ref={sentinel} aria-hidden="true" />
      {query.isFetchingNextPage && <div className="mt-6 lg:mt-8"><Skeleton count={6} /></div>}
      {query.isFetchNextPageError && !query.isFetchingNextPage && (
        <p role="alert" className="mt-6 text-[14px] text-danger">
          {props.nextErrorText ?? "Could not load more posts."}{" "}
          <button type="button" onClick={() => void query.fetchNextPage()} className="text-text underline underline-offset-2 hover:text-accent">
            Try again
          </button>
        </p>
      )}
    </>
  );
}

function Skeleton({ count }: { count: number }) {
  return (
    <ul className={GRID} aria-busy="true" aria-label="Loading posts">
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>
          <div className="aspect-[3/4] animate-pulse rounded-tile bg-surface" />
          <div className="mt-2 h-3 w-2/3 animate-pulse rounded-tile bg-surface" />
          <div className="mt-2 h-3 w-5/6 animate-pulse rounded-tile bg-surface" />
        </li>
      ))}
    </ul>
  );
}

/**
 * The first tiles of the first page, with their place in the stagger. Only once per grid:
 * later pages, new searches and filters appear at once (they often come from the keyboard).
 */
function useIntro(items: PostListItem[]): Map<string, number> {
  const [intro, setIntro] = useState<Map<string, number> | null>(null);
  if (intro === null && items.length > 0) setIntro(new Map(items.slice(0, INTRO_TILES).map((p, i) => [p.id, i])));
  useEffect(() => {
    if (!intro?.size) return;
    const t = setTimeout(() => setIntro(new Map()), 1000);
    return () => clearTimeout(t);
  }, [intro]);
  return intro ?? EMPTY;
}
const EMPTY = new Map<string, number>();
