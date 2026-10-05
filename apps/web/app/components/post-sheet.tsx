import { useRef } from "react";
import { Dialog } from "@base-ui/react/dialog";
import type { PostListItem } from "@no-fomo/core";
import { Cancel01Icon, ArrowUpRight01Icon, Location01Icon, MusicNote01Icon } from "@hugeicons/core-free-icons";
import { formatCount, formatDate, formatDuration } from "../lib/format";
import { Button, buttonClass } from "./ui/button";
import { Icon } from "./ui/icon";

export function PostSheet({ post, onClose, onShowAuthor }: { post: PostListItem | null; onClose: () => void; onShowAuthor: (id: string) => void }) {
  const last = useRef<PostListItem | null>(null);
  if (post) last.current = post;
  const p = post ?? last.current;

  return (
    <Dialog.Root open={!!post} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-scrim transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[460px] flex-col overflow-y-auto border-l border-line bg-bg shadow-pop transition-transform duration-300 ease-out-soft data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full">
          {p && (
            <>
              <div className="flex items-center gap-3 px-5 py-4">
                <img src={`/media/avatars/${p.author.id}`} alt="" className="size-9 rounded-full bg-surface-2 object-cover" />
                <div className="min-w-0 flex-1">
                  <Dialog.Title className="truncate text-[15px] font-semibold">@{p.author.username}</Dialog.Title>
                  {p.author.fullName && <p className="truncate text-[13px] text-muted">{p.author.fullName}</p>}
                </div>
                <Dialog.Close className={buttonClass("ghost", "size-9 px-0")} aria-label="Close">
                  <Icon icon={Cancel01Icon} size={20} />
                </Dialog.Close>
              </div>

              <div className="px-5">
                <img
                  src={p.thumbUrl}
                  alt={p.accessibilityCaption ?? `Post by @${p.author.username}`}
                  className="max-h-[56dvh] w-full rounded-tile bg-surface-2 object-contain"
                />
                <div className="mt-4 flex flex-wrap gap-2">
                  <a href={p.permalink} target="_blank" rel="noopener noreferrer" className={buttonClass("primary")}>
                    <Icon icon={ArrowUpRight01Icon} />
                    Open on Instagram
                  </a>
                  <Button onClick={() => onShowAuthor(p.author.id)}>More from @{p.author.username}</Button>
                </div>
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
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
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
