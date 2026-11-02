import { useQuery, type QueryClient } from "@tanstack/react-query";
import { igStatus } from "../lib/extension";
import { limitFrom, limitText, type IgLimit } from "../lib/ig-limit";
import { useExtension } from "./home/use-extension";

/** Ask again now, for example right after an action answered `paused` or `budget`. */
export const refreshIgLimit = (qc: QueryClient) => void qc.invalidateQueries({ queryKey: ["ig-status"] });

/** What holds Instagram calls back right now. Checked every 30 s from extension storage (no Instagram call). */
export function useIgLimit(): IgLimit | null {
  const ext = useExtension();
  const status = useQuery({
    queryKey: ["ig-status", ext.extensionId],
    queryFn: () => igStatus(ext.extensionId!),
    enabled: ext.ready,
    refetchInterval: 30_000,
  });
  const reply = status.data;
  return limitFrom(reply?.ok ? reply.status : null, Date.now());
}

export function IgLimitBanner() {
  const limit = useIgLimit();
  if (!limit) return null;
  return (
    <div role="status" aria-live="polite" className="border-t border-line bg-surface">
      <p className="mx-auto max-w-[1600px] px-4 py-2 text-[13px] text-danger md:px-6">
        {limitText(limit.kind, limit.until)}
      </p>
    </div>
  );
}
