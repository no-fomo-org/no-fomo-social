import type { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

/** An error or empty block in the working UI: a Section heading, then whatever explains it and the one action. */
export function StateSection({ title, children, className }: { title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <section className={twMerge("py-16", className)}>
      <h2 className="text-[17px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}
