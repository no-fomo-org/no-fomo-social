type Variant = "primary" | "secondary" | "ghost" | "cream";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control text-[14px] font-medium h-9 px-3.5 " +
  "transition-[scale,background-color,color,border-color,filter] duration-150 ease-out-soft active:scale-[0.97] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink can-hover:hover:brightness-110 active:brightness-95",
  secondary: "border border-line text-text can-hover:hover:bg-surface active:bg-surface-2",
  ghost: "text-muted can-hover:hover:bg-surface can-hover:hover:text-text active:bg-surface-2",
  // Links on the photo: cream text, a quiet light fill on hover.
  cream: "text-cream/90 can-hover:hover:bg-cream/12 can-hover:hover:text-cream focus-visible:outline-cream",
};

/** Same buttons as the app (DESIGN.md): 36px, 6px corners, press to 0.97. */
export function buttonClass(variant: Variant = "secondary", extra = "") {
  return `${base} ${variants[variant]} ${extra}`;
}
