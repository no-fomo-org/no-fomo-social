import { useState, type ReactNode } from "react";

const WIDE = [960, 1600, 2560, 3840];
/** The banner is at most 1100px wide, so the 2560 and 3840 files are never worth their weight. */
const BANNER = [960, 1600];
const PORTRAIT = [828, 1440, 2480];
const srcset = (name: string, widths: number[]) => widths.map((w) => `/brand/${name}-${w}.webp ${w}w`).join(", ");

/**
 * The brand photograph for empty states: misty ridges at first light. Decorative (alt=""), the words live in HTML.
 * `full`: the first-run view; the word and star are in the photo, the text sits bottom-left on the dark ridges.
 *   On a phone the photo keeps its own shape with the title on it, and the rest follows below, so the word stays whole.
 * `banner`: a calm strip with the clean photo and a heading on top.
 * `priority`: the photo is the first thing on screen, so the browser fetches it before the rest.
 * Sage sits behind the photo, so there is no flash while it loads; it fades in once.
 */
export function EmptyHero({ variant, title, children, priority }: { variant: "full" | "banner"; title: ReactNode; children?: ReactNode; priority?: boolean }) {
  const full = variant === "full";
  const photo = (
    <>
      <Photo full={full} priority={priority} />
      {/* Keeps the cream text readable when it runs long. */}
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,rgb(20_28_22/0.55),transparent_60%)]" />
    </>
  );
  const heading = (size: string) => (
    <div className={`font-display font-extrabold leading-[1.1] tracking-[-0.01em] text-balance text-cream ${size}`}>{title}</div>
  );

  if (!full) {
    return (
      <div className="relative isolate flex h-60 flex-col justify-end overflow-hidden rounded-sheet bg-sage p-5 md:h-72 md:p-6">
        {photo}
        {heading("text-[28px]")}
      </div>
    );
  }
  return (
    <div className="md:relative md:isolate md:flex md:h-[calc(100dvh-10rem)] md:min-h-[480px] md:flex-col md:justify-end md:overflow-hidden md:rounded-sheet md:bg-sage">
      <div className="relative isolate flex aspect-[3/4] flex-col justify-end overflow-hidden rounded-sheet bg-sage p-5 md:static md:isolation-auto md:aspect-auto md:overflow-visible md:rounded-none md:bg-transparent md:px-10 md:pb-0">
        {photo}
        {heading("text-[28px] md:text-[40px]")}
      </div>
      <div className="pt-1 text-muted [&_code]:text-text md:px-10 md:pb-10 md:pt-0 md:text-cream/85 md:[&_code]:text-cream">{children}</div>
    </div>
  );
}

function Photo({ full, priority }: { full: boolean; priority?: boolean }) {
  const [shown, setShown] = useState(false);
  // A photo already in the cache is simply there; only a real first load fades in.
  const [fade, setFade] = useState(true);
  const name = full ? "hero-wide" : "hero-clean";
  return (
    <picture>
      {full && <source media="(max-width: 767px)" type="image/webp" srcSet={srcset("hero-portrait", PORTRAIT)} sizes="100vw" />}
      <img
        ref={(img) => {
          if (img?.complete && img.naturalWidth > 0 && !shown) {
            setFade(false);
            setShown(true);
          }
        }}
        src={`/brand/${name}-1600.webp`}
        srcSet={srcset(name, full ? WIDE : BANNER)}
        // The banner fills its reading column (1100px at most); the first-run photo fills the screen.
        sizes={full ? "100vw" : "(min-width: 1148px) 1100px, 100vw"}
        alt=""
        decoding="async"
        fetchPriority={priority ? "high" : undefined}
        onLoad={() => setShown(true)}
        className={`absolute inset-0 -z-10 size-full object-cover ${full ? "object-[center_38%]" : "object-[center_40%]"} ${
          fade ? "transition-opacity duration-400 ease-out" : ""
        } ${shown ? "opacity-100" : "opacity-0"}`}
      />
    </picture>
  );
}
