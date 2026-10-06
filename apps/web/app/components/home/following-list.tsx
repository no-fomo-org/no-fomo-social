import { Link } from "react-router";
import type { FollowingPage } from "@no-fomo/core";
import { followingRunError, formatAgo } from "../../lib/format";
import { Avatar } from "../avatar";
import { Button } from "../ui/button";

export function FollowingList(props: {
  page: FollowingPage | undefined;
  filtered: boolean;
  ready: boolean;
  error: string | null;
  onUpdate: () => void;
  limited: boolean;
  accountHref: (username: string) => string;
}) {
  const page = props.page;
  const running = page?.run?.status === "running";
  const note = running
    ? `Updating, ${page!.run!.items.toLocaleString("en")} accounts so far`
    : page?.updatedAt
      ? `${page.total.toLocaleString("en")}${props.filtered ? " found" : ""} · Updated ${formatAgo(page.updatedAt)}`
      : "Not loaded yet";
  return (
    <section aria-labelledby="following-title" className="mt-10">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="following-title" className="text-[17px] font-semibold">People you follow</h2>
        <span className="text-[13px] text-muted" role="status" aria-live="polite">{note}</span>
        <Button className="ms-auto" onClick={props.onUpdate} disabled={!props.ready || running || props.limited}>{running ? "Updating…" : "Update list"}</Button>
      </div>
      {props.error && <p role="alert" className="mt-2 text-[13px] text-danger">{props.error}</p>}
      {page?.run?.status === "error" && !props.error && <p className="mt-2 text-[13px] text-danger">{followingRunError(page.run, Date.now())}</p>}
      {page?.run?.status === "done" && page.run.duplicates > 0 && (
        <p className="mt-2 text-[13px] text-muted">Instagram changed the list while it was read, so some accounts may be missing. Nothing was removed. Try Update list again later.</p>
      )}
      {!page?.updatedAt && !running && (
        <p className="mt-3 max-w-[60ch] text-[15px] text-muted">Load the list of accounts you follow once, so you can open them here without searching Instagram. It takes about 2 minutes for 1,000 accounts.</p>
      )}
      {page && page.items.length > 0 && (
        <ul className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {page.items.map((f) => (
            <li key={f.id}>
              <Link
                to={props.accountHref(f.username)}
                className="flex items-center gap-3 rounded-control px-2 py-1.5 hover:bg-surface focus-visible:bg-surface focus-visible:outline-2 focus-visible:outline-accent"
              >
                <Avatar src={f.avatarUrl} name={f.username} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px]">@{f.username}</span>
                  {f.fullName && <span className="block truncate text-[12px] text-muted">{f.fullName}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {page && page.total > page.items.length && (
        <p className="mt-3 text-[13px] text-muted">Showing {page.items.length} of {page.total.toLocaleString("en")}. Type in the search box to find others.</p>
      )}
    </section>
  );
}
