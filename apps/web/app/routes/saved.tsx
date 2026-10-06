import { useSearchParams } from "react-router";
import { api } from "../lib/api";
import { NO_FILTERS, postsQueryString, readFilters, writeFilters, type Filters } from "../lib/filters";
import { usePostList } from "../lib/use-post-list";
import { EmptyHero } from "../components/empty-hero";
import { FilterBar } from "../components/filter-bar";
import { PostGrid } from "../components/post-grid";
import { SetupSteps } from "../components/setup-steps";
import { SyncNowButton } from "../components/sync-control";
import { TopBar } from "../components/top-bar";
import { Viewer } from "../components/viewer/viewer";

export default function Saved() {
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const update = (patch: Partial<Filters>) => setParams(writeFilters(params, patch), { replace: true });
  const list = usePostList({
    queryKey: ["posts", "saved", filters],
    fetchPage: (cursor) => api.posts(postsQueryString(filters, cursor)),
  });

  return (
    <>
      <TopBar search={{ value: filters.q, onChange: (q) => update({ q }), placeholder: "Search captions, authors, music", label: "Search saved posts" }} sync />
      <main className="mx-auto max-w-[1600px] px-4 pb-16 md:px-6">
        <FilterBar scope="saved" filters={filters} total={list.total} onChange={update} />
        <PostGrid
          query={list.query}
          items={list.items}
          filters={filters}
          onOpen={(id) => list.setPost(id)}
          onClearFilters={() => update(NO_FILTERS)}
          empty={
            <EmptyHero variant="full" title={<h2>Your saved posts will show up here</h2>}>
              <SetupSteps tone="inherit" />
              <SyncNowButton />
            </EmptyHero>
          }
        />
      </main>
      <Viewer
        post={list.open}
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
