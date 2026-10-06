import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckmarkBadge01Icon, Search01Icon, SquareLock02Icon } from "@hugeicons/core-free-icons";
import type { UserSuggestion } from "@no-fomo/core";
import { loadErrorText, searchInstagram } from "../../lib/extension";
import { isLimitCode } from "../../lib/ig-limit";
import { LIVE_LIST_OPTIONS } from "../../lib/live-pages";
import { searchAction, type SearchAction } from "../../lib/home-url";
import { refreshIgLimit } from "../ig-limit";
import { Avatar } from "../avatar";
import { Icon } from "../ui/icon";

/**
 * Typing filters the list of people you follow (stored, no Instagram call).
 * Enter searches all of Instagram once, or opens a profile link or @username directly.
 */
export function ProfileSearch(props: {
  text: string;
  onTextChange: (t: string) => void;
  /** The Instagram search sent with Enter, from the URL. */
  find: string | null;
  onAction: (a: NonNullable<SearchAction>) => void;
  accountHref: (username: string) => string;
  extensionId: string | undefined;
  ready: boolean;
  limited: boolean;
}) {
  const qc = useQueryClient();
  const ig = useQuery({
    queryKey: ["ig-search", props.find],
    queryFn: async (): Promise<UserSuggestion[]> => {
      const r = await searchInstagram(props.extensionId!, props.find!);
      if (!r) throw new Error(loadErrorText("no_extension"));
      if (!r.ok) {
        if (isLimitCode(r.error)) refreshIgLimit(qc);
        throw new Error(loadErrorText(r.error, r.detail, r.until));
      }
      return r.users ?? [];
    },
    enabled: props.ready && !!props.find,
    ...LIVE_LIST_OPTIONS,
  });
  const action = searchAction(props.text);

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!action || ("find" in action && props.limited)) return;
          props.onAction(action);
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
          className="h-11 w-full rounded-control border border-line bg-surface ps-11 pe-3 text-[15px] text-text placeholder:text-muted focus-visible:border-accent-line focus-visible:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-search-cancel-button]:hidden"
        />
      </form>
      {props.text.trim() && !props.find && action && (
        <p className="mt-2 text-[13px] text-muted">
          {"open" in action ? `Press Enter to open @${action.open}.` : "Press Enter to search all of Instagram."}
        </p>
      )}
      {props.find && (
        <section aria-label="All Instagram" className="mt-3 rounded-control border border-line p-2">
          <h3 className="px-2.5 pb-1 text-[12px] font-medium uppercase tracking-wide text-muted">All Instagram</h3>
          {!props.ready ? (
            <p className="px-2.5 py-2 text-[13px] text-muted">Needs the no-fomo extension.</p>
          ) : ig.isFetching ? (
            <p className="px-2.5 py-2 text-[13px] text-muted">Searching Instagram…</p>
          ) : ig.isError ? (
            <p className="px-2.5 py-2 text-[13px] text-danger">{(ig.error as Error).message}</p>
          ) : ig.data?.length ? (
            <ul>
              {ig.data.slice(0, 8).map((u) => (
                <li key={u.id}>
                  <Link
                    to={props.accountHref(u.username)}
                    className="flex items-center gap-3 rounded-tile px-2.5 py-2 hover:bg-surface focus-visible:bg-surface focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <Avatar src={u.avatarUrl} name={u.username} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 truncate text-[14px]">
                        @{u.username}
                        {u.isVerified && <Icon icon={CheckmarkBadge01Icon} size={14} className="text-accent" />}
                        {u.isPrivate && <Icon icon={SquareLock02Icon} size={14} className="text-muted" />}
                      </span>
                      {u.fullName && <span className="block truncate text-[12px] text-muted">{u.fullName}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2.5 py-2 text-[13px] text-muted">No accounts found.</p>
          )}
        </section>
      )}
    </div>
  );
}
