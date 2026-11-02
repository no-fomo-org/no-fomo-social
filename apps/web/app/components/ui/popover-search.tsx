import { Search01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "./icon";

/** The search field at the top of a long picker list. One place, so every popover gets the same 36px field. */
export function PopoverSearch({ label, placeholder = "Search", value, onChange }: {
  /** What the list holds, for the hidden label: "Find authors". */
  label: string;
  placeholder?: string;
  value: string;
  onChange: (q: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 border-b border-line px-3">
      <Icon icon={Search01Icon} size={14} className="text-muted" />
      <span className="sr-only">Find {label.toLowerCase()}</span>
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full bg-transparent text-[14px] text-text outline-none placeholder:text-muted"
      />
    </label>
  );
}
