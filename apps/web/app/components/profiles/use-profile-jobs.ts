import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { loadErrorText, loadProfile, pingExtension, updateFollowing } from "../../lib/extension";

export function useProfileJobs() {
  const qc = useQueryClient();
  const config = useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: Infinity });
  const extensionId = config.data?.extensionId;
  const ext = useQuery({
    queryKey: ["extension", extensionId],
    queryFn: () => pingExtension(extensionId!),
    enabled: !!extensionId,
    refetchInterval: (q) => (q.state.data?.ok ? false : 5000),
  });
  const profiles = useQuery({
    queryKey: ["profiles"],
    queryFn: api.profiles,
    // While Instagram pages arrive, keep the counts and the grid moving.
    refetchInterval: (q) => (q.state.data?.some((p) => p.run?.status === "running") ? 1000 : false),
  });

  const errorOf = (reply: Awaited<ReturnType<typeof loadProfile>>) =>
    !reply ? loadErrorText("no_extension") : reply.ok ? null : loadErrorText(reply.error);

  return {
    extensionId,
    ready: !!ext.data?.ok,
    extensionMissing: ext.isFetched && !ext.data?.ok,
    profiles,
    async add(username: string) {
      if (!extensionId) return loadErrorText("no_extension");
      const err = errorOf(await loadProfile(extensionId, { mode: "add", username }));
      await qc.invalidateQueries({ queryKey: ["profiles"] });
      await qc.invalidateQueries({ queryKey: ["following"] });
      return err;
    },
    async load(authorId: string, mode: "older" | "refresh") {
      if (!extensionId) return loadErrorText("no_extension");
      const err = errorOf(await loadProfile(extensionId, { mode, authorId }));
      await qc.invalidateQueries({ queryKey: ["profiles"] });
      return err;
    },
    async remove(authorId: string) {
      await api.removeProfile(authorId);
      qc.removeQueries({ queryKey: ["posts", "profile", authorId] });
      await qc.invalidateQueries({ queryKey: ["profiles"] });
      await qc.invalidateQueries({ queryKey: ["following"] });
      await qc.invalidateQueries({ queryKey: ["reports"] });
    },
    async updateList() {
      if (!extensionId) return loadErrorText("no_extension");
      const err = errorOf(await updateFollowing(extensionId));
      await qc.invalidateQueries({ queryKey: ["following"] });
      return err;
    },
  };
}
