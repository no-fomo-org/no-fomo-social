// First Light logo, copied from apps/web. Source: docs/brand/first-light/Logo.tsx. Adds a cream tone for the photo.
// The symbol is a four-point star rising over a horizon arc. Colors come from CSS tokens (currentColor).
// Use the "small" symbol below 24px: thicker arc, plumper star, so it stays readable as a favicon or toolbar icon.

const STAR = "M60,3 Q65.2,20.8 79,26 Q65.2,31.2 60,49 Q54.8,31.2 41,26 Q54.8,20.8 60,3 Z";
const ARC = "M4,73.0 Q60,33.0 116,73.0 A1.0,1.0 0 0 1 116,75.0 Q60,44.0 4,75.0 A1.0,1.0 0 0 1 4,73.0 Z";
const STAR_SMALL = "M60,0 Q67.5,16.5 82,24 Q67.5,31.5 60,48 Q52.5,31.5 38,24 Q52.5,16.5 60,0 Z";
const ARC_SMALL = "M6,73.0 Q60,29.0 114,73.0 A3.0,3.0 0 0 1 114,79.0 Q60,53.0 6,79.0 A3.0,3.0 0 0 1 6,73.0 Z";

type SymbolProps = {
  /** Rendered height in px. Width is 1.5x height. */
  size?: number;
  /** Animate the star rising (loading state). Respects prefers-reduced-motion via the .fl-loading-star class. */
  loading?: boolean;
  className?: string;
  title?: string;
};

export function LogoSymbol({ size = 20, loading = false, className, title = "no-fomo" }: SymbolProps) {
  const small = size < 24;
  return (
    <svg
      viewBox="0 0 120 80"
      width={size * 1.5}
      height={size}
      {...(title ? { role: "img", "aria-label": title } : { "aria-hidden": true })}
      className={className}
    >
      <path d={small ? STAR_SMALL : STAR} fill="currentColor" className={loading ? "fl-loading-star" : undefined} />
      <path d={small ? ARC_SMALL : ARC} fill="currentColor" />
    </svg>
  );
}

/**
 * Horizontal lockup for the top bar: symbol in accent color + wordmark in text color.
 * The wordmark is live text in Outfit 900 (font-display), so it stays crisp at any size.
 * For places where the font may not load (extension popup, emails), use logo/svg/lockup-horizontal-*.svg instead.
 */
export function LogoLockup({ height = 22, tone = "page" }: { height?: number; tone?: "page" | "cream" }) {
  const cream = tone === "cream";
  return (
    <span role="img" aria-label="no-fomo" className="inline-flex items-center gap-2 select-none">
      <LogoSymbol size={Math.round(height * 1.1)} className={cream ? "text-cream" : "text-accent"} title="" />
      <span
        aria-hidden
        className={`font-display font-black tracking-[-0.02em] leading-none ${cream ? "text-cream" : "text-text"}`}
        style={{ fontSize: height }}
      >
        no-fomo.
      </span>
    </span>
  );
}
