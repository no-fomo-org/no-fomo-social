import { useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { loadErrorText, updateFollowing } from "../lib/extension";
import { accountSearch, withParam } from "../lib/home-url";
import { isLimitCode } from "../lib/ig-limit";
import { parseProfileInput } from "../lib/profile-input";
import { TopBar } from "../components/top-bar";
import { SetupSteps } from "../components/setup-steps";
import { AccountView } from "../components/home/account-view";
import { ProfileSearch } from "../components/home/profile-search";
import { FollowingList } from "../components/home/following-list";
import { useExtension } from "../components/home/use-extension";
import { refreshIgLimit, useIgLimit } from "../components/ig-limit";

export default function Home() {
  const [params] = useSearchParams();
  const raw = params.get("account");
  const username = raw ? parseProfileInput(raw) : null;
  const id = params.get("id");
  return username ? <AccountView key={username} username={username} id={id && /^\d{1,30}$/.test(id) ? id : null} /> : <HomeList />;
}

/** Search and the people you follow. */
function HomeList() {
  const [params, setParams] = useSearchParams();
  const ext = useExtension();
  const limit = useIgLimit();
  const qc = useQueryClient();
  const [listError, setListError] = useState<string | null>(null);
  const text = params.get("q") ?? "";
  const find = params.get("find");
  const filter = text.trim() && !/instagram\.com/i.test(text) ? text.trim().replace(/^@/, "") : null;
  const following = useQuery({
    queryKey: ["following", filter],
    queryFn: () => api.following(filter),
    placeholderData: (prev) => prev,
    refetchInterval: (q) => (q.state.data?.run?.status === "running" ? 1000 : false),
  });
  const href = (username: string, id?: string) => accountSearch(params, username, id);

  async function updateList() {
    setListError(null);
    const reply = ext.extensionId ? await updateFollowing(ext.extensionId) : null;
    if (!reply) setListError(loadErrorText("no_extension"));
    else if (!reply.ok) {
      if (isLimitCode(reply.error)) refreshIgLimit(qc);
      setListError(loadErrorText(reply.error, reply.detail, reply.until));
    }
    await qc.invalidateQueries({ queryKey: ["following"] });
  }

  return (
    <>
      <TopBar search={null} />
      <main className="mx-auto max-w-[1100px] px-4 pb-16 pt-6 md:px-6">
        <h1 className="sr-only">Home</h1>
        {ext.missing && (
          <section className="mb-6 rounded-control border border-line p-4">
            <h2 className="text-[15px] font-semibold">The no-fomo extension is needed to open accounts</h2>
            <SetupSteps />
          </section>
        )}
        <ProfileSearch
          text={text}
          onTextChange={(t) => setParams(withParam(withParam(params, "find", null), "q", t || null), { replace: true })}
          find={find}
          onAction={(a) => setParams("open" in a ? new URLSearchParams(href(a.open)) : withParam(params, "find", a.find))}
          accountHref={href}
          extensionId={ext.extensionId}
          ready={ext.ready}
          limited={!!limit}
        />
        <FollowingList page={following.data} filtered={!!filter} ready={ext.ready} limited={!!limit} error={listError} onUpdate={() => void updateList()} accountHref={href} />
      </main>
    </>
  );
}
