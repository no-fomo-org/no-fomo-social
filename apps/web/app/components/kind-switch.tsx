import type { MediaKind } from "@no-fomo/core";
import { Segmented } from "./ui/segmented";

const OPTIONS: Array<{ value: MediaKind | null; label: string }> = [
  { value: null, label: "All" },
  { value: "video", label: "Videos" },
  { value: "image", label: "Photos" },
  { value: "carousel", label: "Carousels" },
];

export function KindSwitch({ value, onChange }: { value: MediaKind | null; onChange: (v: MediaKind | null) => void }) {
  return <Segmented label="Post type" options={OPTIONS} value={value} onChange={onChange} />;
}
