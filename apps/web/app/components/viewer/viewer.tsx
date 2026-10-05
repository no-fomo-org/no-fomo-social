import { useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { useQuery } from "@tanstack/react-query";
import type { PostListItem } from "@no-fomo/core";
import { api } from "../../lib/api";
import { keyBelongsToWidget } from "../../lib/keys";
import { MediaStage } from "./media-stage";
import { PostDetails, type DetailsTab } from "./post-details";

export function Viewer({
  post,
  onClose,
  onPrev,
  onNext,
  onShowAuthor,
}: {
  post: PostListItem | null;
  onClose: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onShowAuthor: (id: string) => void;
}) {
  const config = useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: Infinity });
  const stage = useRef<HTMLDivElement>(null);
  // Lives here, so the chosen tab stays while moving between posts.
  const [tab, setTab] = useState<DetailsTab>("details");
  // Keep showing the last post while the close animation runs.
  const last = useRef<PostListItem | null>(null);
  if (post) last.current = post;
  const p = post ?? last.current;

  return (
    <Dialog.Root open={!!post} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/80 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup
          initialFocus={stage}
          onKeyDown={(e) => {
            if (keyBelongsToWidget(e.target, e.key)) return;
            if (e.key === "ArrowUp" && onPrev) { e.preventDefault(); onPrev(); }
            if (e.key === "ArrowDown" && onNext) { e.preventDefault(); onNext(); }
          }}
          className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-bg transition-opacity duration-200 ease-out-soft data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 md:grid md:grid-cols-[minmax(0,1fr)_380px] md:overflow-hidden"
        >
          {p && (
            <>
              <div ref={stage} tabIndex={-1} className="relative h-[70dvh] shrink-0 bg-black outline-none md:h-dvh">
                <MediaStage key={p.id} post={p} extensionId={config.data?.extensionId} configReady={!config.isPending} />
              </div>
              <div className="border-line md:h-dvh md:overflow-y-auto md:border-l">
                <PostDetails
                  post={p}
                  onPrev={onPrev}
                  onNext={onNext}
                  onShowAuthor={onShowAuthor}
                  tab={tab}
                  onTabChange={setTab}
                  extensionId={config.data?.extensionId}
                />
              </div>
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
