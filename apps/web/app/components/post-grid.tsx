import { useEffect, useRef } from "react";
import type { UseInfiniteQueryResult, InfiniteData } from "@tanstack/react-query";
import type { PostListItem, PostsPage } from "@no-fomo/core";
import { PostTile } from "./post-tile";
import { SetupSteps } from "./setup-steps";
import { Button } from "./ui/button";

const GRID = "grid grid-cols-2 gap-x-2 gap-y-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7";

export function PostGrid(props: {
  query: UseInfiniteQueryResult<InfiniteData<PostsPage>>;
  items: PostListItem[];
  filtered: boolean;
  onOpen: (id: string) => void;
  onClearFilters: () => void;
}) {
  const { query } = props;
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage]);

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
  if (props.items.length === 0) {
    return props.filtered ? (
      <section className="py-16">
        <h2 className="text-[17px] font-semibold">No posts match these filters</h2>
        <Button className="mt-4" onClick={props.onClearFilters}>Clear filters</Button>
      </section>
    ) : (
      <section className="py-16">
        <h2 className="text-[17px] font-semibold">Your saved posts will show up here</h2>
        <SetupSteps />
      </section>
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
        </li>
      ))}
    </ul>
  );
}
