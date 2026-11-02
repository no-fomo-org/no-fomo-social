import { useEffect, useRef, useState } from "react";
import { BufferingIndicator, Container, Gesture, Hotkey, useMedia } from "@videojs/react";
import { Video, VideoPlayer } from "@videojs/react/video";
import { browserStore, loadPosition, loadVolume, resumeAt, savePosition, saveVolume } from "../../lib/player-prefs";
import { LogoSymbol } from "../logo";
import { PlayerControls } from "./player-controls";

/** How often the playing position is written to storage. */
const SAVE_EVERY_MS = 2000;

export function Player({
  src,
  poster,
  postId,
  arrowSeek,
  onLoadError,
}: {
  src: string;
  poster: string;
  postId: string;
  /** "plain": arrow keys seek. "shift": Shift+arrows seek, plain arrows belong to the carousel. */
  arrowSeek: "plain" | "shift";
  onLoadError: () => void;
}) {
  const [loop, setLoop] = useState(true);

  return (
    <VideoPlayer>
      <Container className="relative flex size-full items-center justify-center bg-black">
        <Video src={src} poster={poster} autoPlay playsInline loop={loop} preload="auto" className="max-h-full max-w-full object-contain" />
        <MediaMemory postId={postId} onLoadError={onLoadError} />

        {/* One player owns the page while the viewer is open, so keys work without focusing the video first. */}
        <Hotkey keys="Space" action="togglePaused" target="document" />
        <Hotkey keys="k" action="togglePaused" target="document" />
        <Hotkey keys="m" action="toggleMuted" target="document" />
        <Hotkey keys="f" action="toggleFullscreen" target="document" />
        <Gesture type="tap" action="togglePaused" pointer="mouse" region="center" />
        <Gesture type="tap" action="toggleControls" pointer="touch" />
        <Gesture type="doubletap" action="seekStep" value={-5} region="left" />
        <Gesture type="doubletap" action="seekStep" value={5} region="right" />

        {/* The brand loading mark is the one loading signal; no spinners. */}
        <BufferingIndicator
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          render={(props, state) => (
            <div {...props}>{state.visible && <LogoSymbol size={32} loading title="" className="text-cream" />}</div>
          )}
        />
        <PlayerControls loop={loop} onLoopChange={setLoop} arrowSeek={arrowSeek} />
      </Container>
    </VideoPlayer>
  );
}

/** Restores volume and position, remembers them, and reports a link that fails to load. */
function MediaMemory({ postId, onLoadError }: { postId: string; onLoadError: () => void }) {
  const media = useMedia();
  const onError = useRef(onLoadError);
  onError.current = onLoadError;

  useEffect(() => {
    if (!(media instanceof HTMLVideoElement)) return;
    const el = media;
    const store = browserStore();
    const vol = loadVolume(store);
    el.volume = vol.volume;
    el.muted = vol.muted;

    let lastSave = 0;
    const onMeta = () => {
      const t = resumeAt(loadPosition(store, postId), el.duration);
      if (t !== null) el.currentTime = t;
    };
    const onTime = () => {
      if (Date.now() - lastSave < SAVE_EVERY_MS) return;
      lastSave = Date.now();
      savePosition(store, postId, el.currentTime);
    };
    const onPause = () => savePosition(store, postId, el.currentTime);
    const onVolume = () => saveVolume(store, { volume: el.volume, muted: el.muted });
    const onErr = () => onError.current();

    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("pause", onPause);
    el.addEventListener("volumechange", onVolume);
    el.addEventListener("error", onErr);
    if (el.readyState >= HTMLMediaElement.HAVE_METADATA) onMeta();
    return () => {
      if (el.currentTime > 0) savePosition(store, postId, el.currentTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("volumechange", onVolume);
      el.removeEventListener("error", onErr);
    };
  }, [media, postId]);

  return null;
}
