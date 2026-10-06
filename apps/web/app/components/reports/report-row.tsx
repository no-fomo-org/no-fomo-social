import { useState } from "react";
import { ImageNotFound01Icon } from "@hugeicons/core-free-icons";
import type { ReportListItem } from "@no-fomo/core";
import { formatDate } from "../../lib/format";
import { Icon } from "../ui/icon";
import { DeleteReport } from "./delete-report";

export function ReportRow({ r, onOpen }: { r: ReportListItem; onOpen: (id: string) => void }) {
  const [failed, setFailed] = useState(false);
  const source = r.saved ? "Saved" : null;
  return (
    <li className="relative">
      <button
        type="button"
        onClick={() => onOpen(r.id)}
        className="flex w-full gap-4 rounded-control p-2 pr-12 text-left hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent"
      >
        <div className="aspect-[3/4] w-16 shrink-0 overflow-hidden rounded-tile bg-surface-2 sm:w-20">
          {failed ? (
            <div className="flex size-full items-center justify-center text-muted"><Icon icon={ImageNotFound01Icon} size={18} /></div>
          ) : (
            <img src={r.thumbUrl} alt="" loading="lazy" onError={() => setFailed(true)} className="size-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
            <span className="font-medium">@{r.author.username}</span>
            <span className="text-muted">Posted {formatDate(r.takenAt)}</span>
            <span className="text-muted">Report {formatDate(Math.floor(r.reportedAt / 1000))}</span>
          </p>
          <p className="mt-1 line-clamp-3 text-[15px] leading-relaxed">{r.summary || "No summary."}</p>
          {source && <p className="mt-1 truncate text-[12px] text-muted">{source}</p>}
        </div>
      </button>
      {/* Outside the row button: a button inside a button is not allowed. */}
      <div className="absolute right-1 top-1">
        <DeleteReport postId={r.id} compact />
      </div>
    </li>
  );
}
