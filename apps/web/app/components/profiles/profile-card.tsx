import { Link } from "react-router";
import { Delete02Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import type { ProfileItem } from "@no-fomo/core";
import { loadNote, loadProblem } from "../../lib/profile-status";
import { Avatar } from "../avatar";
import { buttonClass } from "../ui/button";
import { Icon } from "../ui/icon";

export function ProfileCard({ p, onRefresh, onRemove, disabled }: { p: ProfileItem; onRefresh: () => void; onRemove: () => void; disabled: boolean }) {
  const running = p.run?.status === "running";
  return (
    <li className="flex items-center gap-3 rounded-control border border-line p-3">
      <Link to={`/profiles/${p.username}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-[6px] focus-visible:outline-2 focus-visible:outline-accent">
        <Avatar src={p.avatarUrl} name={p.username} size={44} />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-medium">@{p.username}</span>
          <span className="block truncate text-[13px] text-muted">{loadNote(p)}</span>
          {loadProblem(p) && <span className="block truncate text-[12px] text-danger">{loadProblem(p)}</span>}
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
