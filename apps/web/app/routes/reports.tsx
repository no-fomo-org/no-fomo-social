import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router";
import { api } from "../lib/api";
import { hasFilters, NO_FILTERS, readFilters, reportsQueryString, writeFilters, type Filters } from "../lib/filters";
import { usePostList } from "../lib/use-post-list";
import { EmptyHero } from "../components/empty-hero";
import { FilterBar } from "../components/filter-bar";
import { ReportRow } from "../components/reports/report-row";
import { TopBar } from "../components/top-bar";
import { Viewer } from "../components/viewer/viewer";
import { Button } from "../components/ui/button";

export default function Reports() {
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const update = (patch: Partial<Filters>) => setParams(writeFilters(params, patch), { replace: true });
  const list = usePostList({
    queryKey: ["reports", filters],
    fetchPage: (cursor) => api.reports(reportsQueryString(filters, cursor)),
  });
  const { query } = list;
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => {
      if (e[0]?.isIntersecting && query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    }, { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage]);

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-[900px] px-4 pb-16 md:px-6">
        <FilterBar scope="reports" filters={filters} total={list.total} onChange={update} />
        {query.isPending ? (
          <p className="py-16 text-muted">Loading reports…</p>
        ) : query.isError ? (
          <section className="py-16">
            <h2 className="text-[17px] font-semibold">Could not load reports</h2>
            <Button className="mt-4" onClick={() => void query.refetch()}>Try again</Button>
          </section>
        ) : list.items.length === 0 && hasFilters(filters) ? (
          <section className="py-16">
            <h2 className="text-[17px] font-semibold">No reports match these filters</h2>
            <p className="mt-1 max-w-[60ch] text-muted">Try removing a filter.</p>
            <Button className="mt-4" onClick={() => update(NO_FILTERS)}>Clear search and filters</Button>
          </section>
        ) : list.items.length === 0 ? (
          <section>
            <EmptyHero variant="banner" title={<h2>No reports yet</h2>} />
            <p className="mt-4 max-w-[60ch] text-muted">Open any post, go to its Report tab and press Analyze. Every report shows up here.</p>
          </section>
        ) : (
          <ul className="grid gap-1">
            {list.items.map((r) => <ReportRow key={r.id} r={r} onOpen={(id) => list.setPost(id)} />)}
          </ul>
        )}
        <div ref={sentinel} aria-hidden="true" />
      </main>
      <Viewer
        post={list.open}
        initialTab="report"
        onClose={() => list.setPost(null)}
        onPrev={list.prev ? () => list.setPost(list.prev!.id, true) : null}
        onNext={list.next ? () => list.setPost(list.next!.id, true) : null}
        onShowAuthor={(author) => {
          const next = writeFilters(params, { author });
          next.delete("post");
          setParams(next, { replace: true });
        }}
      />
    </>
  );
}
