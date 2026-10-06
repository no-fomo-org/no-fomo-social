import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Menu } from "@base-ui/react/menu";
import { Popover } from "@base-ui/react/popover";
import { ArrowDown01Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import type { SyncMode } from "@no-fomo/core";
import { api } from "../lib/api";
import { pingExtension, startExtensionSync, syncErrorText } from "../lib/extension";
import { formatAgo, fullCheckDue, runResultNote } from "../lib/format";
import { useExtension } from "./home/use-extension";
import { refreshIgLimit, useIgLimit } from "./ig-limit";
import { LogoSymbol } from "./logo";
import { SetupSteps } from "./setup-steps";
import { Button, buttonClass } from "./ui/button";
import { Icon } from "./ui/icon";
import { POPUP } from "./ui/popup";

/** Asks the top bar's Sync control to start, so progress and errors show in one place. */
const SYNC_REQUEST = "no-fomo:sync-request";

/** A Sync button for the first-run photo. It hides until the extension answers. On the photo (md+) the focus ring is Cream: Fern is lost on the dark ridges. */
export function SyncNowButton() {
  const ext = useExtension();
  const limit = useIgLimit();
  const status = useQuery({ queryKey: ["sync-status"], queryFn: api.syncStatus });
  const running = status.data?.run?.status === "running";
  if (!ext.ready) return null;
  return (
    <Button
      variant="primary"
      className={`mt-6 min-w-24 md:focus-visible:outline-cream ${running ? "disabled:opacity-100" : ""}`}
      disabled={running || !!limit}
      onClick={() => window.dispatchEvent(new Event(SYNC_REQUEST))}
    >
      {running && <LogoSymbol size={16} loading title="" />}
      Sync
    </Button>
  );
}

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
  const limit = useIgLimit();
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
      refreshIgLimit(qc);
    }
    wasRunning.current = running;
  }, [running, qc]);

  const startRef = useRef<() => void>(() => {});
  useEffect(() => {
    const onRequest = () => startRef.current();
    window.addEventListener(SYNC_REQUEST, onRequest);
    return () => window.removeEventListener(SYNC_REQUEST, onRequest);
  }, []);

  async function start(mode: SyncMode = "incremental") {
    if (!extensionId) return;
    setStartError(null);
    setStarting(true);
    const reply = await startExtensionSync(extensionId, mode);
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
            <Popover.Popup className={`w-[min(420px,calc(100vw-32px))] p-4 ${POPUP}`}>
              <Popover.Title className="text-[15px] font-semibold">The no-fomo extension is not installed</Popover.Title>
              <SetupSteps />
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    );
  }

  const warning = !running && run?.status === "done" ? run.warning : null;
  const lastError = !running && run?.status === "error" ? run.errorMessage : null;
  const due = !running && fullCheckDue(status.data?.lastFullAt ?? null, status.data?.lastSuccessAt ?? null);
  const note = running
    ? `${run.mode === "full" ? "Checking all saved posts" : "Syncing"}, ${run.postsSeen} posts so far`
    : startError ?? lastError ?? warning ??
      (status.data?.lastSuccessAt ? `Synced ${formatAgo(status.data.lastSuccessAt)}${runResultNote(run)}` : "Not synced yet");
  const errorTone = !!(startError || lastError || warning);
  const disabled = running || starting || !ext.data?.ok || !!limit;
  // While syncing, the button carries the loading mark, so it stays at full strength.
  const busy = running || starting ? "disabled:opacity-100" : "";
  startRef.current = () => { if (!disabled) void start(); };

  return (
    <div className="flex min-w-0 items-center gap-3">
      <p className={`truncate text-[13px] ${errorTone ? "text-danger" : "text-muted"}`} role="status" aria-live="polite" title={note}>
        {note}
      </p>
      {due && !errorTone && !disabled && (
        <button type="button" onClick={() => start("full")} className="shrink-0 text-[13px] text-text underline underline-offset-2 transition-colors duration-150 hover:text-accent">
          Full check suggested
        </button>
      )}
      <div className="flex shrink-0">
        <Button variant="primary" className={`rounded-r-none ${busy}`} onClick={() => start()} disabled={disabled}>
          {running || starting ? <LogoSymbol size={16} loading title="" /> : <Icon icon={RefreshIcon} />}
          Sync
        </Button>
        <Menu.Root>
          <Menu.Trigger
            className={buttonClass("primary", `rounded-l-none border-l border-accent-ink/20 px-2 ${busy}`)}
            disabled={disabled}
            aria-label="More sync options"
          >
            <Icon icon={ArrowDown01Icon} />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner sideOffset={6} align="end" className="z-30">
              <Menu.Popup className={`w-[min(300px,calc(100vw-32px))] p-1 ${POPUP}`}>
                <Menu.Item onClick={() => start("full")} className="flex cursor-default flex-col gap-0.5 rounded-tile px-3 py-2 outline-none data-[highlighted]:bg-surface">
                  <span className="text-[14px] font-medium">Full resync</span>
                  <span className="text-[13px] text-muted">Checks every saved post and hides the ones you unsaved on Instagram. Takes about 2 minutes per 1,000 posts.</span>
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>
    </div>
  );
}
