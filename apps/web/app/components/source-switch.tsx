import type { ReportSource } from "@no-fomo-social/core";
import { Segmented } from "./ui/segmented";

const OPTIONS: Array<{ value: ReportSource | null; label: string }> = [
  { value: null, label: "All" },
  { value: "saved", label: "Saved" },
  { value: "other", label: "Not saved" },
];

export function SourceSwitch({ value, onChange }: { value: ReportSource | null; onChange: (v: ReportSource | null) => void }) {
  return <Segmented label="Where the post comes from" options={OPTIONS} value={value} onChange={onChange} />;
}
