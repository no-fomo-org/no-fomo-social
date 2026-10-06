import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { pingExtension } from "../../lib/extension";

/** The extension's id and whether it answers. */
export function useExtension() {
  const config = useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: Infinity });
  const extensionId = config.data?.extensionId;
  const ext = useQuery({
    queryKey: ["extension", extensionId],
    queryFn: () => pingExtension(extensionId!),
    enabled: !!extensionId,
    refetchInterval: (q) => (q.state.data?.ok ? false : 5000),
  });
  return { extensionId, ready: !!ext.data?.ok, missing: ext.isFetched && !ext.data?.ok, checking: !ext.isFetched };
}
