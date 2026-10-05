import { useState } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { TopBar } from "../components/top-bar";
import { SetupSteps } from "../components/setup-steps";
import { ProfileCard } from "../components/profiles/profile-card";
import { ProfileSearch } from "../components/profiles/profile-search";
import { FollowingList } from "../components/profiles/following-list";
import { useProfileJobs } from "../components/profiles/use-profile-jobs";

export default function Profiles() {
  const navigate = useNavigate();
  const jobs = useProfileJobs();
  const [text, setText] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const filter = text.trim() && !/instagram\.com/i.test(text) ? text.trim() : null;
  const following = useQuery({
    queryKey: ["following", filter],
    queryFn: () => api.following(filter),
    placeholderData: (prev) => prev,
    refetchInterval: (q) => (q.state.data?.run?.status === "running" ? 1000 : false),
  });
  const profiles = jobs.profiles.data ?? [];

  async function add(username: string) {
    setAddError(null);
    setBusy(username);
    const err = await jobs.add(username);
    setBusy(null);
    if (err) setAddError(err);
    else navigate(`/profiles/${username}`);
  }
  const openProfile = (username: string) => navigate(`/profiles/${username}`);

  return (
    <>
      <TopBar search={null} />
      <main className="mx-auto max-w-[1100px] px-4 pb-16 pt-6 md:px-6">
        <h1 className="sr-only">Profiles</h1>
        {jobs.extensionMissing && (
          <section className="mb-6 rounded-control border border-line p-4">
            <h2 className="text-[15px] font-semibold">The no-fomo extension is needed to load profiles</h2>
            <SetupSteps />
          </section>
        )}
        <ProfileSearch
          text={text}
          onTextChange={(t) => { setText(t); setAddError(null); }}
          followingMatches={filter ? (following.data?.items ?? []) : []}
          profiles={profiles}
          extensionId={jobs.extensionId}
          ready={jobs.ready}
          busyUsername={busy}
          error={addError}
          onAdd={add}
          onOpen={openProfile}
        />
        <section aria-labelledby="profiles-title" className="mt-8">
          <h2 id="profiles-title" className="text-[17px] font-semibold">Your profiles</h2>
          {profiles.length === 0 ? (
            <p className="mt-2 text-[15px] text-muted">No profiles yet. Find an account above and press Add. The app loads its newest 100 posts.</p>
          ) : (
            <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {profiles.map((p) => (
                <ProfileCard
                  key={p.id}
                  p={p}
                  disabled={!jobs.ready}
                  onRefresh={() => void jobs.load(p.id, "refresh").then(setAddError)}
                  onRemove={() => {
                    if (window.confirm(`Remove @${p.username}? Its posts leave the app, except saved posts and posts with a report.`)) void jobs.remove(p.id);
                  }}
                />
              ))}
            </ul>
          )}
        </section>
        <FollowingList
          page={following.data}
          filtered={!!filter}
          ready={jobs.ready}
          error={listError}
          busyUsername={busy}
          onUpdate={() => { setListError(null); void jobs.updateList().then(setListError); }}
          onAdd={add}
          onOpen={openProfile}
        />
      </main>
    </>
  );
}
