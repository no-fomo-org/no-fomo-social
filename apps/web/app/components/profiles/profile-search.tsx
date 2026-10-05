import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckmarkBadge01Icon, Search01Icon, SquareLock02Icon } from "@hugeicons/core-free-icons";
import type { FollowingItem, UserSuggestion } from "@no-fomo/core";
import { loadErrorText, searchInstagram } from "../../lib/extension";
import { parseProfileInput } from "../../lib/profile-input";
import { Avatar } from "../avatar";
import { Icon } from "../ui/icon";

type Row = { id: string; username: string; fullName: string | null; avatar: string | null; isPrivate?: boolean; isVerified?: boolean };

/** One box for people you follow (stored, instant) and all of Instagram (through the extension). */
export function ProfileSearch(props: {
  text: string;
  onTextChange: (t: string) => void;
  followingMatches: FollowingItem[];
  extensionId: string | undefined;
  ready: boolean;
}) {
  const navigate = useNavigate();
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(props.text.trim()), 400);
    return () => clearTimeout(t);
  }, [props.text]);

  const asName = parseProfileInput(props.text);
  const query = /instagram\.com/i.test(debounced) ? "" : debounced.replace(/^@/, "");
  const ig = useQuery({
    queryKey: ["ig-search", query],
    queryFn: async () => {
      const r = await searchInstagram(props.extensionId!, query);
      if (!r) throw new Error(loadErrorText("no_extension"));
      if (!r.ok) throw new Error(loadErrorText(r.error, r.detail));
      return r.users ?? [];
    },
    enabled: props.ready && query.length >= 2,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const followed: Row[] = props.followingMatches.slice(0, 5).map((f) => ({ id: f.id, username: f.username, fullName: f.fullName, avatar: f.avatarUrl }));
  const shownIds = new Set(followed.map((r) => r.id));
  const others: Row[] = (ig.data ?? [])
    .filter((u: UserSuggestion) => !shownIds.has(u.id))
    .slice(0, 8)
    .map((u) => ({ id: u.id, username: u.username, fullName: u.fullName, avatar: u.avatarUrl, isPrivate: u.isPrivate, isVerified: u.isVerified }));
  const open = props.text.trim().length > 0;

  const row = (r: Row) => (
    <li key={r.id}>
      <Link
        to={`/profiles/${r.username}`}
        className="flex items-center gap-3 rounded-[6px] px-2.5 py-2 hover:bg-surface focus-visible:bg-surface focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Avatar src={r.avatar} name={r.username} size={32} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1 truncate text-[14px]">
            @{r.username}
            {r.isVerified && <Icon icon={CheckmarkBadge01Icon} size={14} className="text-accent" />}
            {r.isPrivate && <Icon icon={SquareLock02Icon} size={14} className="text-muted" />}
          </span>
          {r.fullName && <span className="block truncate text-[12px] text-muted">{r.fullName}</span>}
        </span>
      </Link>
    </li>
  );

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (asName) navigate(`/profiles/${asName}`);
        }}
        className="relative"
      >
        <Icon icon={Search01Icon} size={18} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={props.text}
          onChange={(e) => props.onTextChange(e.target.value)}
          placeholder="Find an account: name, @username or profile link"
          aria-label="Find an Instagram account"
          autoComplete="off"
          spellCheck={false}
          className="h-11 w-full rounded-control border border-line bg-surface ps-11 pe-3 text-[15px] text-text placeholder:text-muted focus-visible:border-accent-line focus-visible:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-search-cancel-button]:hidden"
        />
      </form>
      {open && (
        <div className="mt-2 grid gap-3 rounded-control border border-line p-2">
          <section aria-label="People you follow">
            <h3 className="px-2.5 pb-1 text-[12px] font-medium uppercase tracking-wide text-muted">People you follow</h3>
            {followed.length ? <ul>{followed.map(row)}</ul> : <p className="px-2.5 py-2 text-[13px] text-muted">No match.</p>}
          </section>
          <section aria-label="All Instagram">
            <h3 className="px-2.5 pb-1 text-[12px] font-medium uppercase tracking-wide text-muted">All Instagram</h3>
            {!props.ready ? (
              <p className="px-2.5 py-2 text-[13px] text-muted">Needs the no-fomo extension.</p>
            ) : query.length < 2 ? (
              <p className="px-2.5 py-2 text-[13px] text-muted">Type at least 2 letters.</p>
            ) : ig.isFetching ? (
              <p className="px-2.5 py-2 text-[13px] text-muted">Searching Instagram…</p>
            ) : ig.isError ? (
              <p className="px-2.5 py-2 text-[13px] text-danger">{(ig.error as Error).message}</p>
            ) : others.length ? (
              <ul>{others.map(row)}</ul>
            ) : (
              <p className="px-2.5 py-2 text-[13px] text-muted">No other accounts found.</p>
            )}
          </section>
          {asName && <p className="px-2.5 pb-1 text-[12px] text-muted">Press Enter to open @{asName}.</p>}
        </div>
      )}
    </div>
  );
}
