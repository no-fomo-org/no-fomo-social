import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft01Icon, RefreshIcon, SquareArrowUpRightIcon } from "@hugeicons/core-free-icons";
import { api } from "../lib/api";
import { NO_FILTERS, postsQueryString, readFilters, writeFilters, type Filters } from "../lib/filters";
import { usePostList } from "../lib/use-post-list";
import { Avatar } from "../components/avatar";
import { FilterBar } from "../components/filter-bar";
import { PostGrid } from "../components/post-grid";
import { TopBar } from "../components/top-bar";
import { Viewer } from "../components/viewer/viewer";
import { loadNote } from "../components/profiles/profile-card";
import { useProfileJobs } from "../components/profiles/use-profile-jobs";
import { Button, buttonClass } from "../components/ui/button";
import { Icon } from "../components/ui/icon";

export default function Profile() {
  const { username = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const update = (patch: Partial<Filters>) => setParams(writeFilters(params, patch), { replace: true });
  const jobs = useProfileJobs();
  const qc = useQueryClient();
  const profile = jobs.profiles.data?.find((p) => p.username.toLowerCase() === username.toLowerCase()) ?? null;
  const [error, setError] = useState<string | null>(null);
  const list = usePostList({
    queryKey: ["posts", "profile", profile?.id, filters],
    fetchPage: (cursor) => api.posts(postsQueryString(filters, cursor, { profile: profile!.id })),
    enabled: !!profile,
  });
  const running = profile?.run?.status === "running";

  // New posts arrive page by page while a load runs.
  const loaded = profile?.loadedCount;
  useEffect(() => {
    if (profile) void qc.invalidateQueries({ queryKey: ["posts", "profile", profile.id] });
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const search = { value: filters.q, onChange: (q: string | null) => update({ q }), placeholder: `Search @${username}`, label: `Search posts of @${username}` };

  if (jobs.profiles.isPending) return <TopBar search={null} />;
  if (!profile) {
    return (
      <>
        <TopBar search={null} />
        <main className="mx-auto max-w-[1100px] px-4 py-16 md:px-6">
          <h1 className="text-[17px] font-semibold">@{username} is not in your profiles</h1>
          <p className="mt-1 text-muted">Add it on the Profiles tab first.</p>
          <Link to="/profiles" className={buttonClass("secondary", "mt-4")}>Go to Profiles</Link>
        </main>
      </>
    );
  }

  const run = async (mode: "older" | "refresh") => {
    setError(null);
    setError(await jobs.load(profile.id, mode));
  };

  return (
    <>
      <TopBar search={search} />
      <main className="mx-auto max-w-[1600px] px-4 pb-16 md:px-6">
        <div className="flex flex-wrap items-center gap-3 pt-4">
          <Link to="/profiles" aria-label="Back to Profiles" className={buttonClass("ghost", "", "icon")}><Icon icon={ArrowLeft01Icon} size={18} /></Link>
          <Avatar src={profile.avatarUrl} name={profile.username} size={40} />
          <div className="min-w-0">
            <h1 className="truncate text-[17px] font-semibold">@{profile.username}</h1>
            <p className="truncate text-[13px] text-muted" role="status" aria-live="polite">{loadNote(profile)}</p>
          </div>
          <div className="ms-auto flex gap-2">
            <a href={`https://www.instagram.com/${profile.username}/`} target="_blank" rel="noopener noreferrer" className={buttonClass("ghost")}>
              <Icon icon={SquareArrowUpRightIcon} />Instagram
            </a>
            <Button onClick={() => void run("refresh")} disabled={!jobs.ready || running}>
              <Icon icon={RefreshIcon} className={running ? "motion-safe:animate-spin" : ""} />Refresh
            </Button>
          </div>
        </div>
        {error && <p role="alert" className="mt-2 text-[13px] text-danger">{error}</p>}
        <FilterBar scope="profile" filters={filters} total={list.total} onChange={update} />
        <PostGrid
          query={list.query}
          items={list.items}
          filters={filters}
          onOpen={(id) => list.setPost(id)}
          onClearFilters={() => update(NO_FILTERS)}
          empty={<h2 className="text-[17px] font-semibold">{running ? "Loading posts from Instagram…" : "No posts loaded yet. Press Refresh."}</h2>}
        />
        {profile.hasOlder && !list.query.hasNextPage && list.items.length > 0 && (
          <div className="mt-8 flex justify-center">
            <Button onClick={() => void run("older")} disabled={!jobs.ready || running}>{running ? "Loading…" : "Load older posts"}</Button>
          </div>
        )}
      </main>
      <Viewer
        post={list.open}
        onClose={() => list.setPost(null)}
        onPrev={list.prev ? () => list.setPost(list.prev!.id, true) : null}
        onNext={list.next ? () => list.setPost(list.next!.id, true) : null}
        onShowAuthor={null}
      />
    </>
  );
}
