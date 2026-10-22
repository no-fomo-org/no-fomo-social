import { useState } from "react";
import type { PostListItem } from "@no-fomo-social/core";
import { Tooltip } from "@base-ui/react/tooltip";
import { Album02Icon, ImageNotFound01Icon, Tick02Icon, Video01Icon } from "@hugeicons/core-free-icons";
import { formatDuration } from "../lib/format";
import { Icon } from "./ui/icon";
import { POPUP } from "./ui/popup";

export function PostTile({ post, onOpen }: { post: PostListItem; onOpen: (id: string) => void }) {
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      onClick={() => onOpen(post.id)}
      aria-label={tileLabel(post)}
      className="group block w-full rounded-tile text-left transition-[scale] duration-160 ease-out-soft active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-tile bg-surface-2">
        {failed ? (
          <div className="flex size-full items-center justify-center text-muted">
            <Icon icon={ImageNotFound01Icon} size={22} />
          </div>
        ) : (
          <img
            src={post.thumbUrl}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            className="size-full object-cover transition-[scale] duration-250 ease-out-soft can-hover:group-hover:scale-[1.03]"
          />
        )}
      </div>
      <div className="mt-2 flex items-center gap-2 text-[13px]">
        <span className="min-w-0 truncate">@{post.author.username}</span>
        <span className="flex shrink-0 items-center gap-1 font-mono text-[12px] tabular-nums text-muted">
          {post.kind === "video" && <><Icon icon={Video01Icon} size={14} />{post.durationSec ? formatDuration(post.durationSec) : null}</>}
          {post.kind === "carousel" && <Icon icon={Album02Icon} size={14} />}
        </span>
        {post.hasReport && <ReportTick />}
      </div>
      <p className="mt-0.5 truncate text-[13px] text-muted">{captionLine(post.caption)}</p>
    </button>
  );
}

/** Marks a post that has a report: you already worked with it. The tile's label says the same for screen readers. */
function ReportTick() {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={<span />}
        className="ms-auto inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink"
        aria-hidden="true"
      >
        <Icon icon={Tick02Icon} size={12} />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner side="top" align="end" sideOffset={6} className="z-30">
          <Tooltip.Popup className={`max-w-56 px-2.5 py-1.5 text-[13px] leading-snug text-text data-[instant]:duration-0 ${POPUP}`}>
            Has a report. You already analyzed this post.
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function tileLabel(post: PostListItem): string {
  const kind = post.kind === "video" ? "Video" : post.kind === "carousel" ? "Carousel" : "Photo";
  const length = post.kind === "video" && post.durationSec ? `, ${formatDuration(post.durationSec)}` : "";
  return `${kind} by @${post.author.username}${length}${post.hasReport ? ", has a report" : ""}`;
}

/** First line of the caption without trailing hashtag walls; a space keeps rows aligned when empty. */
function captionLine(caption: string | null): string {
  const first = (caption ?? "").split("\n").find((l) => l.trim()) ?? "";
  const text = first.replace(/(\s*#[\p{L}\p{N}_]+)+\s*$/u, "").trim() || first.trim();
  return text || "\u00a0";
}
