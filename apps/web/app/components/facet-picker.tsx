import { useMemo, useState, type ReactNode } from "react";
import { Popover } from "@base-ui/react/popover";
import { ArrowDown01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { buttonClass } from "./ui/button";
import { Icon } from "./ui/icon";
import { PickerRow } from "./ui/picker-row";
import { POPUP } from "./ui/popup";
import { PopoverSearch } from "./ui/popover-search";

export interface FacetOption { id: string; label: string; sublabel?: string | null; count: number; leading?: ReactNode }

/** Active filters share one look across the bar: accent tint, accent line, and a remove control. */
export const ACTIVE_FILTER = "border-accent-line bg-accent-soft text-text hover:bg-accent-soft";

export function FacetPicker(props: {
  label: string;
  allLabel: string;
  options: FacetOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = props.options.find((o) => o.id === props.value) ?? null;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? props.options.filter((o) => `${o.label} ${o.sublabel ?? ""}`.toLowerCase().includes(q)) : props.options;
  }, [props.options, query]);

  function choose(id: string | null) {
    props.onChange(id);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="inline-flex">
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          className={buttonClass("secondary", selected ? `${ACTIVE_FILTER} rounded-e-none border-e-0 pe-2.5` : "")}
          aria-label={`${props.label}: ${selected?.label ?? props.allLabel}`}
        >
          {selected?.leading}
          <span className="max-w-[16ch] truncate">{selected?.label ?? props.allLabel}</span>
          <Icon icon={ArrowDown01Icon} size={14} className={selected ? "text-text" : "text-muted"} />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner sideOffset={6} align="start" className="z-30">
            <Popover.Popup className={`w-[min(320px,calc(100vw-32px))] ${POPUP}`}>
              {props.options.length > 8 && (
                <PopoverSearch label={props.label} placeholder={props.searchPlaceholder} value={query} onChange={setQuery} />
              )}
              <ul className="max-h-[min(360px,60dvh)] overflow-y-auto p-1" aria-label={props.label}>
                <PickerRow active={props.value === null} onClick={() => choose(null)} label={props.allLabel} />
                {shown.map((o) => (
                  <PickerRow key={o.id} active={o.id === props.value} onClick={() => choose(o.id)} label={o.label} sublabel={o.sublabel} count={o.count} leading={o.leading} />
                ))}
                {shown.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-muted">Nothing found</li>}
              </ul>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      {selected && (
        <button
          type="button"
          onClick={() => props.onChange(null)}
          aria-label={`Remove ${props.label.toLowerCase()} filter`}
          className={buttonClass("secondary", `${ACTIVE_FILTER} rounded-s-none border-s-accent-line/60 w-8 px-0 text-muted hover:text-text`)}
        >
          <Icon icon={Cancel01Icon} size={14} />
        </button>
      )}
    </div>
  );
}
