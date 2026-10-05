import type { ButtonHTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "icon";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control text-[14px] font-medium " +
  "transition-[transform,background-color,color,border-color] duration-200 ease-out-soft active:scale-[0.98] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50 " +
  "[&_svg]:shrink-0";

const sizes: Record<Size, string> = {
  md: "h-9 px-3.5",
  icon: "size-9",
};

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:brightness-110",
  secondary: "border border-line bg-surface text-text hover:bg-surface-2",
  ghost: "text-muted hover:bg-surface hover:text-text",
};

/** Later classes win (tailwind-merge), so callers can override base styles safely. */
export function buttonClass(variant: Variant = "secondary", extra = "", size: Size = "md") {
  return twMerge(base, sizes[size], variants[variant], extra);
}

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type="button" className={buttonClass(variant, className, size)} {...props} />;
}
