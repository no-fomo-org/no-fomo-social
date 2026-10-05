import { useEffect, useRef, useState, type RefObject } from "react";
import { Controls, FullscreenButton, MuteButton, PlayButton, Time, TimeSlider, VolumeSlider, useMedia } from "@videojs/react";
import { usePlayer } from "@videojs/react/video";
import { Menu } from "@base-ui/react/menu";
import {
  ArrowShrink02Icon, FullScreenIcon, NextIcon, PauseIcon, PlayIcon, PreviousIcon, RepeatIcon, RepeatOffIcon, VolumeHighIcon, VolumeMute01Icon,
} from "@hugeicons/core-free-icons";
import { AB_OFF, abJump, abLabel, pressAb, type AbLoop } from "../../lib/ab-loop";
import { keyBelongsToWidget } from "../../lib/keys";
import { Icon } from "../ui/icon";

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const FRAME_SEC = 1 / 30;
const SEEK_SEC = 5;

const ctl =
  "inline-flex h-9 min-w-9 items-center justify-center rounded-control px-2 text-white/90 transition-colors duration-200 ease-out-soft " +
  "hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
  "aria-pressed:text-accent data-[disabled]:opacity-40";

export function PlayerControls({
  loop,
  onLoopChange,
  arrowSeek,
}: {
  loop: boolean;
  onLoopChange: (loop: boolean) => void;
  arrowSeek: "plain" | "shift";
}) {
  const media = useMedia();
  const el = media instanceof HTMLVideoElement ? media : null;
  const portal = useRef<HTMLDivElement>(null);
  const [ab, setAb] = useState<AbLoop>(AB_OFF);

  // Check every frame once both A and B are set, so the loop point is exact.
  useEffect(() => {
    if (!el || ab.a === null || ab.b === null) return;
    let handle = 0;
    const tick = () => {
      const to = abJump(ab, el.currentTime);
      if (to !== null) el.currentTime = to;
      handle = el.requestVideoFrameCallback(tick);
    };
    handle = el.requestVideoFrameCallback(tick);
    return () => el.cancelVideoFrameCallback(handle);
  }, [el, ab]);

  // Arrows seek, "," and "." step one frame. The capture phase is needed because the
  // viewer dialog stops arrow keys from bubbling up to the document.
  useEffect(() => {
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || keyBelongsToWidget(e.target, e.key)) return;
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && e.shiftKey === (arrowSeek === "shift")) {
        e.preventDefault();
        seekBy(el, e.key === "ArrowRight" ? SEEK_SEC : -SEEK_SEC);
      } else if (e.key === "," || e.key === ".") {
        e.preventDefault();
        stepFrame(el, e.key === "." ? 1 : -1);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [el, arrowSeek]);

  return (
    <Controls.Root>
      <Controls.Backdrop className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0 opacity-0 transition-opacity duration-300 data-[visible]:opacity-100" />
      <Controls.Content className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-1 px-3 pb-2 opacity-0 transition-opacity duration-200 data-[visible]:opacity-100 has-[:focus-visible]:opacity-100">
        <Controls.Group aria-label="Seek" className="pointer-events-auto">
          <TimeSlider.Root className="group/seek relative flex h-6 cursor-pointer touch-none items-center">
            <TimeSlider.Track className="relative h-1 w-full overflow-hidden rounded-full bg-white/25 transition-[height] duration-200 group-hover/seek:h-1.5">
              <TimeSlider.Buffer className="absolute inset-y-0 left-0 w-[var(--media-slider-buffer)] bg-white/30" />
              <TimeSlider.Fill className="absolute inset-y-0 left-0 w-[var(--media-slider-fill)] bg-accent" />
            </TimeSlider.Track>
            <TimeSlider.Thumb className="absolute left-[var(--media-slider-fill)] size-3 -translate-x-1/2 rounded-full bg-white opacity-0 shadow transition-opacity duration-200 group-hover/seek:opacity-100 focus-visible:opacity-100" />
          </TimeSlider.Root>
        </Controls.Group>

        <Controls.Group aria-label="Playback controls" className="pointer-events-auto flex items-center gap-0.5 text-white">
          <PlayButton
            className={ctl}
            render={(props, s) => <button {...props}><Icon icon={s.paused ? PlayIcon : PauseIcon} size={20} /></button>}
          />
          <MuteButton
            className={ctl}
            render={(props, s) => <button {...props}><Icon icon={s.muted ? VolumeMute01Icon : VolumeHighIcon} size={20} /></button>}
          />
          <VolumeSlider.Root className="group/vol relative hidden h-6 w-20 cursor-pointer touch-none items-center md:flex">
            <VolumeSlider.Track className="relative h-1 w-full overflow-hidden rounded-full bg-white/25">
              <VolumeSlider.Fill className="absolute inset-y-0 left-0 w-[var(--media-slider-fill)] bg-white" />
            </VolumeSlider.Track>
            <VolumeSlider.Thumb className="absolute left-[var(--media-slider-fill)] size-3 -translate-x-1/2 rounded-full bg-white opacity-0 group-hover/vol:opacity-100 focus-visible:opacity-100" />
          </VolumeSlider.Root>
          <Time.Group className="ml-2 font-mono text-[12px] tabular-nums text-white/85">
            <Time.Value type="current" />
            <Time.Separator className="px-1 text-white/50" />
            <Time.Value type="duration" />
          </Time.Group>

          <div className="flex-1" />

          {/* Frame step is a desktop tool; on a phone the bar has no room for it. */}
          <button type="button" className={`${ctl} max-md:hidden`} aria-label="Previous frame" title="Previous frame (,)" onClick={() => el && stepFrame(el, -1)}>
            <Icon icon={PreviousIcon} size={18} />
          </button>
          <button type="button" className={`${ctl} max-md:hidden`} aria-label="Next frame" title="Next frame (.)" onClick={() => el && stepFrame(el, 1)}>
            <Icon icon={NextIcon} size={18} />
          </button>
          <button
            type="button"
            className={`${ctl} font-mono text-[12px]`}
            aria-label={abLabel(ab)}
            title={abLabel(ab)}
            aria-pressed={ab.a !== null}
            onClick={() => el && setAb((s) => pressAb(s, el.currentTime))}
          >
            {ab.a === null ? "A-B" : ab.b === null ? "A" : "A B"}
          </button>
          <button
            type="button"
            className={ctl}
            aria-label={loop ? "Turn loop off" : "Turn loop on"}
            title={loop ? "Loop is on" : "Loop is off"}
            aria-pressed={loop}
            onClick={() => onLoopChange(!loop)}
          >
            <Icon icon={loop ? RepeatIcon : RepeatOffIcon} size={18} />
          </button>
          <SpeedMenu container={portal} />
          <FullscreenButton
            className={ctl}
            render={(props, s) => <button {...props}><Icon icon={s.fullscreen ? ArrowShrink02Icon : FullScreenIcon} size={18} /></button>}
          />
        </Controls.Group>
        {/* Menus open inside the player, so they stay visible in fullscreen. */}
        <div ref={portal} className="pointer-events-auto" />
      </Controls.Content>
    </Controls.Root>
  );
}

function SpeedMenu({ container }: { container: RefObject<HTMLDivElement | null> }) {
  const store = usePlayer();
  const rate = usePlayer((s) => s.playbackRate) ?? 1;
  return (
    <Menu.Root>
      <Menu.Trigger className={`${ctl} font-mono text-[12px] tabular-nums`} aria-label={`Speed ${rate}x`} title="Playback speed">
        {rate}x
      </Menu.Trigger>
      <Menu.Portal container={container}>
        <Menu.Positioner side="top" align="end" sideOffset={8} className="z-10">
          <Menu.Popup className="min-w-24 origin-[var(--transform-origin)] rounded-control border border-white/10 bg-black/85 p-1 text-white shadow-pop backdrop-blur transition-[transform,opacity] duration-200 ease-out-soft data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            <Menu.RadioGroup value={rate} onValueChange={(v) => store.setPlaybackRate(Number(v))}>
              {RATES.map((r) => (
                <Menu.RadioItem
                  key={r}
                  value={r}
                  className="flex cursor-default items-center justify-between gap-3 rounded-[6px] px-2.5 py-1.5 font-mono text-[13px] tabular-nums outline-none data-[highlighted]:bg-white/10 data-[checked]:text-accent"
                >
                  {r}x
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function seekBy(el: HTMLVideoElement, sec: number) {
  const end = Number.isFinite(el.duration) ? el.duration : el.currentTime + sec;
  el.currentTime = Math.min(Math.max(el.currentTime + sec, 0), end);
}

function stepFrame(el: HTMLVideoElement, dir: 1 | -1) {
  el.pause();
  const end = Number.isFinite(el.duration) ? el.duration : el.currentTime;
  el.currentTime = Math.min(Math.max(el.currentTime + dir * FRAME_SEC, 0), end);
}
