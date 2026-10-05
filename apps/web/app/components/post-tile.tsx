import { useState } from "react";
import type { PostListItem } from "@no-fomo/core";
import { Album02Icon, ImageNotFound01Icon, Video01Icon } from "@hugeicons/core-free-icons";
import { formatDuration } from "../lib/format";
import { Icon } from "./ui/icon";

export function PostTile({ post, onOpen }: { post: PostListItem; onOpen: (id: string) => void }) {
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      onClick={() => onOpen(post.id)}
      aria-label={tileLabel(post)}
      className="group block w-full rounded-tile text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
            className="size-full object-cover transition-transform duration-300 ease-out-soft group-hover:scale-[1.03]"
          />
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[13px]">
        <span className="truncate">@{post.author.username}</span>
        <span className="flex shrink-0 items-center gap-1 font-mono text-[12px] tabular-nums text-muted">
          {post.kind === "video" && <><Icon icon={Video01Icon} size={14} />{post.durationSec ? formatDuration(post.durationSec) : null}</>}
          {post.kind === "carousel" && <Icon icon={Album02Icon} size={14} />}
        </span>
      </div>
      <p className="mt-0.5 truncate text-[13px] text-muted">{captionLine(post.caption)}</p>
    </button>
  );
}

function tileLabel(post: PostListItem): string {
  const kind = post.kind === "video" ? "Video" : post.kind === "carousel" ? "Carousel" : "Photo";
  const length = post.kind === "video" && post.durationSec ? `, ${formatDuration(post.durationSec)}` : "";
  return `${kind} by @${post.author.username}${length}`;
}

/** First line of the caption without trailing hashtag walls; a space keeps rows aligned when empty. */
function captionLine(caption: string | null): string {
  const first = (caption ?? "").split("\n").find((l) => l.trim()) ?? "";
  const text = first.replace(/(\s*#[\p{L}\p{N}_]+)+\s*$/u, "").trim() || first.trim();
  return text || "\u00a0";
}
