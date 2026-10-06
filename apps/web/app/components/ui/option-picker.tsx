import { useMemo, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { ArrowDown01Icon, Search01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { buttonClass } from "./button";
import { Icon } from "./icon";
import { POPUP, POPUP_ROW } from "./popup";

export interface PickerOption { id: string; label: string; sublabel?: string }

/** A labelled dropdown with a search box for long lists. Sits above dialogs (the viewer is z-50). */
export function OptionPicker(props: { label: string; options: PickerOption[]; value: string; onChange: (id: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = props.options.find((o) => o.id === props.value);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? props.options.filter((o) => `${o.label} ${o.sublabel ?? ""}`.toLowerCase().includes(q)) : props.options;
  }, [props.options, query]);

  const choose = (id: string) => {
    props.onChange(id);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="grid min-w-0 gap-1">
      <span aria-hidden className="text-[13px] text-muted">{props.label}</span>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          disabled={props.disabled}
          aria-label={`${props.label}: ${selected?.label ?? props.value}`}
          className={buttonClass("secondary", "w-full justify-between px-3 font-normal")}
        >
          <span className="min-w-0 truncate">{selected?.label ?? props.value}</span>
          <Icon icon={ArrowDown01Icon} size={14} className="text-muted" />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner sideOffset={6} align="start" className="z-[60]">
            <Popover.Popup className={`w-[min(340px,calc(100vw-32px))] ${POPUP}`}>
              {props.options.length > 8 && (
                <label className="flex items-center gap-2 border-b border-line px-3">
                  <Icon icon={Search01Icon} size={14} className="text-muted" />
                  <span className="sr-only">Find {props.label.toLowerCase()}</span>
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search"
                    className="h-10 w-full bg-transparent text-[14px] text-text outline-none placeholder:text-muted"
                  />
                </label>
              )}
              <ul className="max-h-[min(360px,50dvh)] overflow-y-auto p-1" aria-label={props.label}>
                {shown.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => choose(o.id)}
                      aria-pressed={o.id === props.value}
                      className={`flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-[14px] ${POPUP_ROW}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{o.label}</span>
                        {o.sublabel && <span className="block truncate text-[12px] text-muted">{o.sublabel}</span>}
                      </span>
                      <Icon icon={Tick02Icon} size={14} className={o.id === props.value ? "text-accent" : "invisible"} />
                    </button>
                  </li>
                ))}
                {shown.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-muted">Nothing found</li>}
              </ul>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
