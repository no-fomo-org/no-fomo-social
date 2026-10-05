import type { ReportSource } from "@no-fomo/core";

const OPTIONS: Array<{ value: ReportSource | null; label: string }> = [
  { value: null, label: "All" },
  { value: "saved", label: "Saved" },
  { value: "other", label: "Not saved" },
];

export function SourceSwitch({ value, onChange }: { value: ReportSource | null; onChange: (v: ReportSource | null) => void }) {
  return (
    <div role="group" aria-label="Where the post comes from" className="inline-flex h-9 rounded-control border border-line bg-surface p-0.5">
      {OPTIONS.map((o) => (
        <button
          key={o.label}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-[6px] px-3 text-[14px] text-muted transition-colors duration-200 hover:text-text aria-pressed:text-text focus-visible:outline-2 focus-visible:outline-accent ${
            o.value === null
              ? "aria-pressed:bg-bg aria-pressed:shadow-[0_1px_2px_oklch(0.2_0.01_250/0.12)]"
              : "aria-pressed:bg-accent-soft aria-pressed:shadow-[inset_0_0_0_1px_var(--accent-line)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
