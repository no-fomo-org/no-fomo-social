import { Link } from "react-router";
import { Delete02Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import type { ProfileItem } from "@no-fomo/core";
import { formatAgo } from "../../lib/format";
import { Avatar } from "../avatar";
import { buttonClass } from "../ui/button";
import { Icon } from "../ui/icon";

export function loadNote(p: ProfileItem): string {
  if (p.run?.status === "running") return `Loading, ${p.run.items.toLocaleString("en")} new posts so far`;
  const loaded = `${p.loadedCount.toLocaleString("en")}${p.postCount !== null ? ` of ${p.postCount.toLocaleString("en")}` : ""} posts loaded`;
  return p.refreshedAt ? `${loaded} · Updated ${formatAgo(p.refreshedAt)}` : loaded;
}

export function ProfileCard({ p, onRefresh, onRemove, disabled }: { p: ProfileItem; onRefresh: () => void; onRemove: () => void; disabled: boolean }) {
  const running = p.run?.status === "running";
  return (
    <li className="flex items-center gap-3 rounded-control border border-line p-3">
      <Link to={`/profiles/${p.username}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-[6px] focus-visible:outline-2 focus-visible:outline-accent">
        <Avatar src={p.avatarUrl} name={p.username} size={44} />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-medium">@{p.username}</span>
          <span className="block truncate text-[13px] text-muted">{loadNote(p)}</span>
          {p.run?.status === "error" && <span className="block truncate text-[12px] text-danger">{p.run.errorMessage ?? "The last load failed."}</span>}
        </span>
      </Link>
      <button type="button" onClick={onRefresh} disabled={disabled || running} aria-label={`Refresh @${p.username}`} title="Get new posts" className={buttonClass("ghost", "", "icon")}>
        <Icon icon={RefreshIcon} size={18} className={running ? "motion-safe:animate-spin" : ""} />
      </button>
      <button type="button" onClick={onRemove} disabled={running} aria-label={`Remove @${p.username}`} title="Remove" className={buttonClass("ghost", "hover:text-danger", "icon")}>
        <Icon icon={Delete02Icon} size={18} />
      </button>
    </li>
  );
}
