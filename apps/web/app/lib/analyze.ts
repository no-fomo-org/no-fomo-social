import type { AnalyzeChoice, PostMedia } from "@no-fomo/core";
import { api, ApiError } from "./api";
import { refreshExtensionMedia } from "./extension";
import { mediaErrorCode } from "./media";

const codeOf = (e: unknown) => (e instanceof ApiError ? e.message : "failed");

/** Starts analysis. If the post's links are old, renews them once through the extension and tries again. */
export async function startAnalysis(
  postId: string,
  extensionId: string | undefined,
  choice: AnalyzeChoice,
): Promise<{ ok: true; media?: PostMedia } | { ok: false; error: string }> {
  try {
    await api.analyze(postId, choice);
    return { ok: true };
  } catch (e) {
    if (codeOf(e) !== "links_expired") return { ok: false, error: codeOf(e) };
  }
  if (!extensionId) return { ok: false, error: "no_extension" };
  const reply = await refreshExtensionMedia(extensionId, postId);
  if (!reply?.ok || !reply.media) return { ok: false, error: mediaErrorCode(reply) };
  try {
    await api.analyze(postId, choice);
    return { ok: true, media: reply.media };
  } catch (e) {
    return { ok: false, error: codeOf(e) === "links_expired" ? "load_failed" : codeOf(e) };
  }
}
