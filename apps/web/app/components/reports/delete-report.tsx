import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Delete02Icon } from "@hugeicons/core-free-icons";
import { api, ApiError } from "../../lib/api";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";

/** An icon button that asks once before it deletes. */
export function DeleteReport({ postId }: { postId: string }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button variant="ghost" size="icon" aria-label="Delete report" title="Delete report" onClick={() => setAsking(true)}>
        <Icon icon={Delete02Icon} size={16} />
      </Button>
    );
  }
  return <DeleteConfirm postId={postId} compact onClose={() => setAsking(false)} />;
}

/** The "Delete this report?" question. `onClose` runs on Cancel and after the report is gone. */
export function DeleteConfirm({ postId, compact = false, onClose }: { postId: string; compact?: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteReport(postId);
      qc.setQueryData(["report", postId], null);
      for (const queryKey of [["posts"], ["reports"], ["authors", "reports"], ["known"]]) void qc.invalidateQueries({ queryKey });
      onClose();
    } catch (e) {
      const running = e instanceof ApiError && e.message === "already_running";
      setError(running ? "Wait until the analysis finishes." : "Could not delete the report. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="group"
      aria-label="Delete this report?"
      className={compact ? "flex w-max max-w-[min(20rem,calc(100vw-2rem))] flex-wrap items-center gap-2 rounded-control border border-line bg-paper p-2 shadow-pop" : "flex flex-wrap items-center gap-2"}
    >
      <span className="text-[14px]">Delete this report?</span>
      <Button className="text-danger" disabled={busy} onClick={remove} autoFocus>{busy ? "Deleting" : "Delete"}</Button>
      <Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button>
      {error && <p role="alert" className="basis-full text-[13px] text-danger">{error}</p>}
    </div>
  );
}
