import type { AnalyzeChoice, PostMedia } from "@no-fomo-social/core";
import { api, ApiError } from "./api";
import { refreshExtensionMedia } from "./extension";
import { mediaErrorCode } from "./media";

const codeOf = (e: unknown) => (e instanceof ApiError ? e.message : "failed");

/**
 * Starts analysis. If the post's links are old, or the app does not store the post yet (seen on an account page),
 * gets it once through the extension, stored, and tries again.
 */
export async function startAnalysis(
  postId: string,
  extensionId: string | undefined,
  choice: AnalyzeChoice,
): Promise<{ ok: true; media?: PostMedia } | { ok: false; error: string }> {
  try {
    await api.analyze(postId, choice);
    return { ok: true };
  } catch (e) {
    const notStored = e instanceof ApiError && e.status === 404;
    if (codeOf(e) !== "links_expired" && !notStored) return { ok: false, error: codeOf(e) };
  }
  if (!extensionId) return { ok: false, error: "no_extension" };
  const reply = await refreshExtensionMedia(extensionId, postId, true);
  if (!reply?.ok || !reply.media) return { ok: false, error: mediaErrorCode(reply) };
  try {
    await api.analyze(postId, choice);
    return { ok: true, media: reply.media };
  } catch (e) {
    return { ok: false, error: codeOf(e) === "links_expired" ? "load_failed" : codeOf(e) };
  }
}
