import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Popover } from "@base-ui/react/popover";
import { RefreshIcon } from "@hugeicons/core-free-icons";
import { api } from "../lib/api";
import { pingExtension, startExtensionSync, syncErrorText } from "../lib/extension";
import { formatAgo } from "../lib/format";
import { SetupSteps } from "./setup-steps";
import { Button, buttonClass } from "./ui/button";
import { Icon } from "./ui/icon";

export function SyncControl() {
  const qc = useQueryClient();
  const config = useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: Infinity });
  const extensionId = config.data?.extensionId;
  const ext = useQuery({
    queryKey: ["extension", extensionId],
    queryFn: () => pingExtension(extensionId!),
    enabled: !!extensionId,
    refetchInterval: (q) => (q.state.data?.ok ? false : 5000),
  });
  const [pollUntil, setPollUntil] = useState(0);
  const status = useQuery({
    queryKey: ["sync-status"],
    queryFn: api.syncStatus,
    refetchInterval: (q) => (q.state.data?.run?.status === "running" || Date.now() < pollUntil ? 1000 : false),
  });
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const run = status.data?.run ?? null;
  const running = run?.status === "running";
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running) {
      void qc.invalidateQueries({ queryKey: ["posts"] });
      void qc.invalidateQueries({ queryKey: ["authors"] });
      void qc.invalidateQueries({ queryKey: ["collections"] });
    }
    wasRunning.current = running;
  }, [running, qc]);

  async function start() {
    if (!extensionId) return;
    setStartError(null);
    setStarting(true);
    const reply = await startExtensionSync(extensionId);
    setStarting(false);
    if (!reply) return setStartError("The extension did not answer. Reload this page and try again.");
    if (!reply.ok) return setStartError(syncErrorText(reply.error));
    setPollUntil(Date.now() + 20_000);
    void qc.invalidateQueries({ queryKey: ["sync-status"] });
  }

  if (ext.isFetched && !ext.data?.ok) {
    return (
      <Popover.Root>
        <Popover.Trigger className={buttonClass("secondary")}>Set up sync</Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner sideOffset={6} align="end" className="z-30">
            <Popover.Popup className="w-[min(420px,calc(100vw-32px))] origin-[var(--transform-origin)] rounded-control border border-line bg-bg p-4 shadow-pop transition-[transform,opacity] duration-200 ease-out-soft data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
              <Popover.Title className="text-[15px] font-semibold">The no-fomo extension is not installed</Popover.Title>
              <SetupSteps />
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    );
  }

  const lastError = !running && run?.status === "error" ? run.errorMessage : null;
  const note = running
    ? `Syncing, ${run.postsSeen} posts so far`
    : startError ?? lastError ?? (status.data?.lastSuccessAt ? `Synced ${formatAgo(status.data.lastSuccessAt)}` : "Not synced yet");

  return (
    <div className="flex min-w-0 items-center gap-3">
      <p
        className={`truncate text-[13px] ${startError || lastError ? "text-danger" : "text-muted"}`}
        role="status"
        aria-live="polite"
        title={note}
      >
        {note}
      </p>
      <Button variant="primary" onClick={start} disabled={running || starting || !ext.data?.ok}>
        <Icon icon={RefreshIcon} className={running || starting ? "motion-safe:animate-spin" : ""} />
        Sync
      </Button>
    </div>
  );
}
