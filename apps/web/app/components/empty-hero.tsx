import { useState, type ReactNode } from "react";

const WIDE = [960, 1600, 2560, 3840];
const PORTRAIT = [828, 1440, 2480];
const srcset = (name: string, widths: number[]) => widths.map((w) => `/brand/${name}-${w}.webp ${w}w`).join(", ");

/**
 * The brand photograph for empty states: misty ridges at first light. Decorative (alt=""), the words live in HTML.
 * `full`: the first-run view, the word and star are in the photo; text sits bottom-left on the dark ridges.
 * `banner`: a calm strip with the clean photo and a heading on top.
 * Sage sits behind the photo, so there is no flash while it loads; it fades in once.
 */
export function EmptyHero({ variant, title, children }: { variant: "full" | "banner"; title: ReactNode; children?: ReactNode }) {
  const [shown, setShown] = useState(false);
  // A photo already in the cache is simply there; only a real first load fades in.
  const [fade, setFade] = useState(true);
  const full = variant === "full";

  return (
    <div
      className={`relative isolate overflow-hidden rounded-sheet bg-sage ${
        full ? "min-h-[440px] h-[calc(100dvh-13rem)] md:h-[calc(100dvh-10rem)]" : "h-60 md:h-72"
      }`}
    >
      <picture>
        {full && <source media="(max-width: 767px)" type="image/webp" srcSet={srcset("hero-portrait", PORTRAIT)} sizes="100vw" />}
        <img
          ref={(img) => {
            if (img?.complete && img.naturalWidth > 0 && !shown) {
              setFade(false);
              setShown(true);
            }
          }}
          src={`/brand/${full ? "hero-wide" : "hero-clean"}-1600.webp`}
          srcSet={srcset(full ? "hero-wide" : "hero-clean", WIDE)}
          sizes="100vw"
          alt=""
          decoding="async"
          onLoad={() => setShown(true)}
          className={`absolute inset-0 -z-10 size-full object-cover ${full ? "object-[center_38%]" : "object-[center_40%]"} ${
            fade ? "transition-opacity duration-400 ease-out" : ""
          } ${shown ? "opacity-100" : "opacity-0"}`}
        />
      </picture>
      {/* Keeps the cream text readable when it runs long. */}
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,rgb(20_28_22/0.55),transparent_60%)]" />
      <div className={`absolute inset-x-0 bottom-0 text-cream ${full ? "p-5 md:p-10" : "p-5 md:p-6"}`}>
        <div className={`font-display font-extrabold leading-[1.1] tracking-[-0.01em] text-balance ${full ? "text-[28px] md:text-[40px]" : "text-[28px]"}`}>
          {title}
        </div>
        {children}
      </div>
    </div>
  );
}
