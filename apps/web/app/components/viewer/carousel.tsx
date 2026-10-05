import { useEffect, useRef } from "react";
import type { MediaPart } from "@no-fomo/core";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { keyBelongsToWidget } from "../../lib/keys";
import { Player } from "../player/player";
import { Icon } from "../ui/icon";

const SWIPE_PX = 50;
const arrow =
  "absolute top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur " +
  "transition-opacity duration-200 hover:bg-black/70 disabled:pointer-events-none disabled:opacity-0 focus-visible:outline-2 focus-visible:outline-accent";

export function Carousel({
  parts,
  index: wanted,
  onIndexChange,
  postId,
  alt,
  onLoadError,
}: {
  parts: MediaPart[];
  index: number;
  onIndexChange: (index: number) => void;
  postId: string;
  alt: string;
  onLoadError: () => void;
}) {
  const last = parts.length - 1;
  const index = Math.min(Math.max(wanted, 0), last);
  const go = (i: number) => onIndexChange(Math.min(Math.max(i, 0), last));
  const goRef = useRef(go);
  goRef.current = go;
  const indexRef = useRef(index);
  indexRef.current = index;

  // Plain Left and Right move between items. Shift+arrows are left for seeking a video item.
  // Capture phase: the viewer dialog stops arrow keys from bubbling up to the document.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (keyBelongsToWidget(e.target)) return;
      e.preventDefault();
      goRef.current(indexRef.current + (e.key === "ArrowRight" ? 1 : -1));
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  const startX = useRef<number | null>(null);
  const current = parts[index]!;

  return (
    <div
      className="relative flex size-full items-center justify-center"
      onPointerDown={(e) => { if (e.pointerType === "touch") startX.current = e.clientX; }}
      onPointerUp={(e) => {
        if (startX.current === null) return;
        const dx = e.clientX - startX.current;
        startX.current = null;
        if (Math.abs(dx) > SWIPE_PX) go(index + (dx < 0 ? 1 : -1));
      }}
    >
      {parts.map((part, i) => {
        // Only the current item and its neighbours load.
        if (Math.abs(i - index) > 1 || part.kind === "video") return null;
        return (
          <img
            key={part.index}
            src={part.imageUrl ?? undefined}
            alt={i === index ? alt : ""}
            onError={i === index ? onLoadError : undefined}
            className={i === index ? "max-h-full max-w-full object-contain" : "hidden"}
          />
        );
      })}
      {current.kind === "video" && current.videoUrl && (
        <Player key={current.videoUrl} src={current.videoUrl} poster={current.imageUrl ?? ""} postId={`${postId}:${index}`} arrowSeek="shift" onLoadError={onLoadError} />
      )}

      <button type="button" className={`${arrow} left-3`} onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous item">
        <Icon icon={ArrowLeft01Icon} size={20} />
      </button>
      <button type="button" className={`${arrow} right-3`} onClick={() => go(index + 1)} disabled={index === last} aria-label="Next item">
        <Icon icon={ArrowRight01Icon} size={20} />
      </button>

      <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
        <p className="rounded-full bg-black/50 px-2.5 py-0.5 font-mono text-[12px] tabular-nums text-white backdrop-blur" aria-live="polite">
          {index + 1} of {parts.length}
        </p>
      </div>
      <div className={`absolute inset-x-0 z-10 flex justify-center gap-1.5 ${current.kind === "video" ? "top-10" : "bottom-3"}`}>
        {parts.map((part, i) => (
          <button
            key={part.index}
            type="button"
            onClick={() => go(i)}
            aria-label={`Item ${i + 1}`}
            aria-current={i === index}
            className={`size-1.5 rounded-full transition-colors duration-200 ${i === index ? "bg-white" : "bg-white/40 hover:bg-white/70"}`}
          />
        ))}
      </div>
    </div>
  );
}
