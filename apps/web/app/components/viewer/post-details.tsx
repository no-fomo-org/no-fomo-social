import { Dialog } from "@base-ui/react/dialog";
import type { PostListItem } from "@no-fomo/core";
import { ArrowDown01Icon, ArrowUp01Icon, Cancel01Icon, Location01Icon, MusicNote01Icon, SquareArrowUpRightIcon } from "@hugeicons/core-free-icons";
import { formatCount, formatDate, formatDuration } from "../../lib/format";
import { Button, buttonClass } from "../ui/button";
import { Icon } from "../ui/icon";

export function PostDetails({
  post: p,
  onPrev,
  onNext,
  onShowAuthor,
}: {
  post: PostListItem;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onShowAuthor: (id: string) => void;
}) {
  const seekHint =
    p.kind === "carousel"
      ? "Left and Right move between items. Shift with Left or Right seeks a video."
      : p.kind === "video"
        ? "Left and Right seek 5 seconds. Space plays and pauses."
        : null;
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-4">
        <img src={`/media/avatars/${p.author.id}`} alt="" className="size-9 rounded-full bg-surface-2 object-cover" />
        <div className="min-w-0 flex-1">
          <Dialog.Title className="truncate text-[15px] font-semibold">@{p.author.username}</Dialog.Title>
          {p.author.fullName && <p className="truncate text-[13px] text-muted">{p.author.fullName}</p>}
        </div>
        <div className="flex items-center">
          <button type="button" onClick={onPrev ?? undefined} disabled={!onPrev} aria-label="Previous post" title="Previous post (Up arrow)" className={buttonClass("ghost", "", "icon")}>
            <Icon icon={ArrowUp01Icon} size={18} />
          </button>
          <button type="button" onClick={onNext ?? undefined} disabled={!onNext} aria-label="Next post" title="Next post (Down arrow)" className={buttonClass("ghost", "", "icon")}>
            <Icon icon={ArrowDown01Icon} size={18} />
          </button>
        </div>
        <Dialog.Close className={buttonClass("ghost", "", "icon")} aria-label="Close" title="Close (Esc)">
          <Icon icon={Cancel01Icon} size={20} />
        </Dialog.Close>
      </div>

      <div className="flex flex-wrap gap-2 px-5">
        <a href={p.permalink} target="_blank" rel="noopener noreferrer" className={buttonClass("primary")}>
          <Icon icon={SquareArrowUpRightIcon} />
          Open on Instagram
        </a>
        <Button onClick={() => onShowAuthor(p.author.id)}>More from @{p.author.username}</Button>
      </div>

      {p.caption && <p className="whitespace-pre-wrap px-5 pt-5 text-[15px] leading-relaxed">{p.caption}</p>}

      <dl className="mx-5 mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4 text-[13px]">
        <Detail label="Posted" value={formatDate(p.takenAt)} />
        {p.durationSec !== null && <Detail label="Length" value={formatDuration(p.durationSec)} mono />}
        {p.viewCount !== null && <Detail label="Views" value={formatCount(p.viewCount)} mono />}
        {p.likeCount !== null && <Detail label="Likes" value={formatCount(p.likeCount)} mono />}
      </dl>

      <div className="grid gap-2 px-5 py-5 text-[13px] text-muted">
        {p.musicTitle && (
          <p className="flex items-center gap-2"><Icon icon={MusicNote01Icon} size={14} />{p.musicTitle}{p.musicArtist ? `, ${p.musicArtist}` : ""}</p>
        )}
        {p.locationName && <p className="flex items-center gap-2"><Icon icon={Location01Icon} size={14} />{p.locationName}</p>}
        {p.accessibilityCaption && <p>Image description: {p.accessibilityCaption}</p>}
      </div>

      <p className="mt-auto hidden border-t border-line px-5 py-3 text-[12px] text-muted md:block">
        <Kbd>Up</Kbd> and <Kbd>Down</Kbd> move between posts. {seekHint} <Kbd>Esc</Kbd> closes.
      </p>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className={mono ? "font-mono tabular-nums" : ""}>{value}</dd>
    </div>
  );
}

function Kbd({ children }: { children: string }) {
  return <kbd className="rounded-[5px] border border-line px-1 font-mono text-[11px] text-text">{children}</kbd>;
}
