/**
 * A small set of filter choices. "All" (value null) is the quiet default; any other active choice
 * uses the active-filter look: accent-soft fill with an accent-line edge.
 */
export function Segmented<T extends string>({ label, options, value, onChange }: {
  label: string;
  options: Array<{ value: T | null; label: string }>;
  value: T | null;
  onChange: (v: T | null) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex h-9 rounded-control border border-line p-0.5">
      {options.map((o) => (
        <button
          key={o.label}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-tile px-3 text-[14px] text-muted transition-colors duration-150 hover:text-text aria-pressed:text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
            o.value === null ? "aria-pressed:bg-surface" : "aria-pressed:bg-accent-soft aria-pressed:shadow-[inset_0_0_0_1px_var(--accent-line)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
