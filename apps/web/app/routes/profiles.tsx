import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { loadErrorText, updateFollowing } from "../lib/extension";
import { TopBar } from "../components/top-bar";
import { SetupSteps } from "../components/setup-steps";
import { ProfileSearch } from "../components/profiles/profile-search";
import { FollowingList } from "../components/profiles/following-list";
import { useExtension } from "../components/profiles/use-extension";

export default function Profiles() {
  const ext = useExtension();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [listError, setListError] = useState<string | null>(null);
  const filter = text.trim() && !/instagram\.com/i.test(text) ? text.trim() : null;
  const following = useQuery({
    queryKey: ["following", filter],
    queryFn: () => api.following(filter),
    placeholderData: (prev) => prev,
    refetchInterval: (q) => (q.state.data?.run?.status === "running" ? 1000 : false),
  });

  async function updateList() {
    setListError(null);
    const reply = ext.extensionId ? await updateFollowing(ext.extensionId) : null;
    if (!reply) setListError(loadErrorText("no_extension"));
    else if (!reply.ok) setListError(loadErrorText(reply.error, reply.detail, reply.until));
    await qc.invalidateQueries({ queryKey: ["following"] });
  }

  return (
    <>
      <TopBar search={null} />
      <main className="mx-auto max-w-[1100px] px-4 pb-16 pt-6 md:px-6">
        <h1 className="sr-only">Profiles</h1>
        {ext.missing && (
          <section className="mb-6 rounded-control border border-line p-4">
            <h2 className="text-[15px] font-semibold">The no-fomo extension is needed to open accounts</h2>
            <SetupSteps />
          </section>
        )}
        <ProfileSearch
          text={text}
          onTextChange={setText}
          followingMatches={filter ? (following.data?.items ?? []) : []}
          extensionId={ext.extensionId}
          ready={ext.ready}
        />
        <FollowingList page={following.data} filtered={!!filter} ready={ext.ready} error={listError} onUpdate={() => void updateList()} />
      </main>
    </>
  );
}
