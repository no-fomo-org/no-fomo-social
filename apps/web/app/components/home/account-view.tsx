import { useCallback, useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft01Icon, SquareArrowUpRightIcon } from "@hugeicons/core-free-icons";
import type { LivePost, LiveProfile } from "@no-fomo-social/core";
import { api } from "../../lib/api";
import { loadErrorText, openProfile, profilePage } from "../../lib/extension";
import { NO_FILTERS } from "../../lib/filters";
import { backSearch } from "../../lib/home-url";
import { isLimitCode } from "../../lib/ig-limit";
import { uniqueById } from "../../lib/live-filter";
import { listBody, LIVE_LIST_OPTIONS } from "../../lib/live-pages";
import { usePostList } from "../../lib/use-post-list";
import { Avatar } from "../avatar";
import { refreshIgLimit, useIgLimit } from "../ig-limit";
import { PostGrid } from "../post-grid";
import { SetupSteps } from "../setup-steps";
import { TopBar } from "../top-bar";
import { LazyViewer } from "../viewer/lazy-viewer";
import { useExtension } from "./use-extension";
import { Button, buttonClass } from "../ui/button";
import { Icon } from "../ui/icon";
import { StateSection } from "../ui/state-section";

type AccountPage = { items: LivePost[]; nextCursor: string | null; total: number; profile: LiveProfile | null };

/** Which loaded posts the app stores, in chunks the server accepts. */
async function knownStates(ids: string[]) {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
  const rows = (await Promise.all(chunks.map((c) => api.known(c)))).flat();
  return new Map(rows.map((r) => [r.id, r]));
}

/**
 * An Instagram account inside Home, shown straight from Instagram. Nothing is stored unless a post is analyzed.
 * Every page is an Instagram request, so the next 12 posts load only when the owner presses Load more.
 */
export function AccountView({ username }: { username: string }) {
  const [params] = useSearchParams();
  const ext = useExtension();
  const limit = useIgLimit();
  const qc = useQueryClient();

  const list = usePostList({
    queryKey: ["live-profile", username.toLowerCase()],
    enabled: ext.ready,
    // Loaded pages stay as they are until the owner leaves for 30 minutes.
    cache: LIVE_LIST_OPTIONS,
    autoLoad: false,
    fetchPage: async (cursor): Promise<AccountPage> => {
      const reply = cursor ? await profilePage(ext.extensionId!, cursor) : await openProfile(ext.extensionId!, username);
      if (!reply) throw new Error(loadErrorText("no_extension"));
      if (!reply.ok) {
        if (isLimitCode(reply.error)) refreshIgLimit(qc);
        throw new Error(loadErrorText(reply.error, reply.detail, reply.until));
      }
      return { items: reply.page?.posts ?? [], nextCursor: reply.page?.nextCursor ?? null, total: 0, profile: reply.profile ?? null };
    },
    view: (posts) => uniqueById(posts),
  });
  const ids = list.loaded.map((p) => p.id);
  const known = useQuery({
    queryKey: ["known", ids.join(",")],
    queryFn: () => knownStates(ids),
    enabled: ids.length > 0,
    placeholderData: (prev) => prev,
  });
  /** A post the app stores may be saved or have a report: show that here too. */
  const knownMap = known.data;
  const mark = useCallback((p: LivePost): LivePost => {
    const k = knownMap?.get(p.id);
    return k ? { ...p, saved: k.saved, hasReport: k.hasReport } : p;
  }, [knownMap]);
  // Same objects until the list or the known states change, so memoized tiles stay put.
  const marked = useMemo(() => list.items.map(mark), [list.items, mark]);

  const profile = list.query.data?.pages[0]?.profile ?? null;
  const closed = profile ? profile.isPrivate && !profile.followedByViewer : false;

  let body;
  if (ext.missing) {
    body = (
      <StateSection className="py-10" title="The no-fomo-social extension is needed to open accounts">
        <SetupSteps />
      </StateSection>
    );
  } else if (listBody({ isError: list.query.isError, hasData: !!list.query.data }) === "error") {
    body = (
      <StateSection title={<>Could not open @{username}</>}>
        <p className="mt-1 max-w-[60ch] text-muted">{(list.query.error as Error).message}</p>
        <Button className="mt-4" onClick={() => void list.query.refetch()}>Try again</Button>
      </StateSection>
    );
  } else if (closed) {
    body = <p className="py-16 text-[15px] text-muted">This account is private and you do not follow it, so its posts cannot be shown.</p>;
  } else {
    body = (
      <div className="pt-4">
        <PostGrid
          query={list.query}
          items={marked}
          filters={NO_FILTERS}
          onOpen={(id) => list.setPost(id)}
          onClearFilters={() => {}}
          autoLoad={false}
          nextErrorText={list.query.isFetchNextPageError ? (list.query.error as Error).message : undefined}
          empty={<StateSection title="This account has no posts." />}
        />
        {list.query.hasNextPage && !list.query.isFetchNextPageError && (
          <div className="mt-6 flex justify-center">
            <Button onClick={() => void list.query.fetchNextPage()} disabled={list.query.isFetchingNextPage || !!limit}>
              {list.query.isFetchingNextPage ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-[1600px] px-4 pb-16 md:px-6">
        <div className="flex flex-wrap items-center gap-3 pt-4">
          <Link to={{ search: backSearch(params) }} aria-label="Back to Search" className={buttonClass("ghost", "", "icon")}><Icon icon={ArrowLeft01Icon} size={18} /></Link>
          <Avatar src={profile?.avatarUrl ?? null} name={username} size={40} />
          <div className="min-w-0">
            <h1 className="truncate text-[17px] font-semibold">@{profile?.username ?? username}</h1>
            <p className="truncate text-[13px] text-muted">
              {[profile?.fullName, profile?.postCount != null ? `${profile.postCount.toLocaleString("en")} posts` : null].filter(Boolean).join(" · ") || " "}
            </p>
          </div>
          <a href={`https://www.instagram.com/${profile?.username ?? username}/`} target="_blank" rel="noopener noreferrer" className={buttonClass("ghost", "ms-auto")}>
            <Icon icon={SquareArrowUpRightIcon} />Instagram
          </a>
        </div>
        {body}
      </main>
      <LazyViewer
        post={list.open && mark(list.open)}
        onClose={() => list.setPost(null)}
        onPrev={list.prev ? () => list.setPost(list.prev!.id, true) : null}
        onNext={list.next ? () => list.setPost(list.next!.id, true) : null}
        onShowAuthor={null}
      />
    </>
  );
}
