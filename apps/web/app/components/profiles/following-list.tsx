import type { FollowingPage } from "@no-fomo/core";
import { formatAgo } from "../../lib/format";
import { Avatar } from "../avatar";
import { Button } from "../ui/button";

export function FollowingList(props: {
  page: FollowingPage | undefined;
  filtered: boolean;
  ready: boolean;
  error: string | null;
  busyUsername: string | null;
  onUpdate: () => void;
  onAdd: (username: string) => void;
  onOpen: (username: string) => void;
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
        <Button className="ms-auto" onClick={props.onUpdate} disabled={!props.ready || running}>{running ? "Updating…" : "Update list"}</Button>
      </div>
      {props.error && <p role="alert" className="mt-2 text-[13px] text-danger">{props.error}</p>}
      {page?.run?.status === "error" && !props.error && <p className="mt-2 text-[13px] text-danger">{page.run.errorMessage ?? "The last update failed."}</p>}
      {!page?.updatedAt && !running && (
        <p className="mt-3 max-w-[60ch] text-[15px] text-muted">Load the list of accounts you follow once, so you can find them here without searching Instagram. It takes about 30 seconds for 1,000 accounts.</p>
      )}
      {page && page.items.length > 0 && (
        <ul className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {page.items.map((f) => (
            <li key={f.id} className="flex items-center gap-3 rounded-[6px] px-2 py-1.5 hover:bg-surface">
              <Avatar src={f.avatarUrl} name={f.username} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px]">@{f.username}</span>
                {f.fullName && <span className="block truncate text-[12px] text-muted">{f.fullName}</span>}
              </span>
              {f.added ? (
                <Button variant="ghost" onClick={() => props.onOpen(f.username)}>Open</Button>
              ) : (
                <Button onClick={() => props.onAdd(f.username)} disabled={!props.ready || props.busyUsername === f.username}>
                  {props.busyUsername === f.username ? "Adding…" : "Add"}
                </Button>
              )}
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
