import { useState } from "react";

/** A round avatar from the local store, or the first letter when there is none. */
export function Avatar({ src, name, size = 36 }: { src: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  if (!src || failed) {
    return (
      <span aria-hidden="true" style={style} className="inline-flex shrink-0 items-center justify-center rounded-full bg-surface-2 text-[13px] font-medium uppercase text-muted">
        {name.replace(/^@/, "").slice(0, 1)}
      </span>
    );
  }
  return <img src={src} alt="" style={style} loading="lazy" onError={() => setFailed(true)} className="shrink-0 rounded-full bg-surface-2 object-cover" />;
}
