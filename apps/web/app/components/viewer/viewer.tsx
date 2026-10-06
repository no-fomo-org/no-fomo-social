import { useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { useQuery } from "@tanstack/react-query";
import type { PostListItem } from "@no-fomo/core";
import { api } from "../../lib/api";
import { keyBelongsToWidget } from "../../lib/keys";
import { tabOnOpen } from "../../lib/viewer-tab";
import { MediaStage } from "./media-stage";
import { PostDetails, type DetailsTab } from "./post-details";

export function Viewer({
  post,
  onClose,
  onPrev,
  onNext,
  onShowAuthor,
  initialTab,
}: {
  post: PostListItem | null;
  onClose: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onShowAuthor: ((id: string) => void) | null;
  initialTab?: DetailsTab;
}) {
  const config = useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: Infinity });
  const stage = useRef<HTMLDivElement>(null);
  // Lives here, so the chosen tab stays while moving between posts.
  const [tab, setTab] = useState<DetailsTab>(initialTab ?? "details");
  // Each opening starts on the page's start tab (Reports opens on the report).
  const [wasOpen, setWasOpen] = useState(false);
  // Esc is a keyboard action, so the viewer closes at once instead of sliding out.
  const [instant, setInstant] = useState(false);
  if (!!post !== wasOpen) {
    setWasOpen(!!post);
    if (post) {
      setTab(tabOnOpen(tab, initialTab));
      setInstant(false);
    }
  }
  // Keep showing the last post while the close animation runs.
  const last = useRef<PostListItem | null>(null);
  if (post) last.current = post;
  const p = post ?? last.current;

  return (
    <Dialog.Root
      open={!!post}
      onOpenChange={(open, details) => {
        if (open) return;
        setInstant(details.reason === "escape-key");
        onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-scrim transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 data-[instant]:duration-0!" data-instant={instant || undefined} />
        <Dialog.Popup
          initialFocus={stage}
          onKeyDown={(e) => {
            if (keyBelongsToWidget(e.target, e.key)) return;
            if (e.key === "ArrowUp" && onPrev) { e.preventDefault(); onPrev(); }
            if (e.key === "ArrowDown" && onNext) { e.preventDefault(); onNext(); }
          }}
          data-post-viewer
          data-instant={instant || undefined}
          className="group/sheet fixed inset-0 z-50 flex flex-col overflow-y-auto bg-paper transition-opacity duration-200 ease-out-soft data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 data-[instant]:duration-0! md:grid md:grid-cols-[minmax(0,1fr)_380px] md:overflow-hidden md:bg-bg"
        >
          {p && (
            <>
              <div ref={stage} tabIndex={-1} className="relative h-[70dvh] shrink-0 bg-black outline-none md:h-dvh">
                <MediaStage key={p.id} post={p} extensionId={config.data?.extensionId} configReady={!config.isPending} />
              </div>
              {/* The details side is the sheet: it slides in from the right (from below on a phone) with the drawer curve. */}
              <div className="border-line bg-paper transition-[translate] duration-300 ease-drawer group-data-[ending-style]/sheet:duration-200 group-data-[instant]/sheet:duration-0! group-data-[starting-style]/sheet:translate-y-6 group-data-[ending-style]/sheet:translate-y-6 md:h-dvh md:overflow-y-auto md:rounded-s-sheet md:border-l md:shadow-pop md:group-data-[starting-style]/sheet:translate-x-full md:group-data-[starting-style]/sheet:translate-y-0 md:group-data-[ending-style]/sheet:translate-x-full md:group-data-[ending-style]/sheet:translate-y-0">
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
