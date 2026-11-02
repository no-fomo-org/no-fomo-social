import type { ReactNode } from "react";
import { Tick02Icon } from "@hugeicons/core-free-icons";
import { Icon } from "./icon";
import { POPUP_ROW } from "./popup";

/** One choice in a picker list: optional leading mark, label and sublabel, optional count, and the tick when chosen. */
export function PickerRow(p: { active: boolean; onClick: () => void; label: string; sublabel?: string | null; count?: number; leading?: ReactNode }) {
  return (
    <li>
      <button
        type="button"
        onClick={p.onClick}
        aria-pressed={p.active}
        className={`flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-[14px] ${POPUP_ROW}`}
      >
        {p.leading}
        <span className="min-w-0 flex-1">
          <span className="block truncate">{p.label}</span>
          {p.sublabel && <span className="block truncate text-[13px] text-muted">{p.sublabel}</span>}
        </span>
        {p.count !== undefined && <span className="font-mono text-[13px] tabular-nums text-muted">{p.count}</span>}
        <Icon icon={Tick02Icon} size={14} className={p.active ? "text-accent" : "invisible"} />
      </button>
    </li>
  );
}
