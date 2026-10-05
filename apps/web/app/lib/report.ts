import { DEFAULT_REPORT_LANGUAGE, isReportLanguage, type AnalyzeChoice, type ModelOption, type ModelsInfo, type PostReport, type ReportStep } from "@no-fomo/core";
import { mediaErrorText, type MediaErrorCode } from "./media";

const MEDIA_CODES = new Set(["no_extension", "old_extension", "login_required", "rate_limited", "not_found", "load_failed"]);

export function analyzeErrorText(code: string, detail: string | null): string {
  switch (code) {
    case "no_key": return "Add your OpenAI key in Settings to analyze posts.";
    case "bad_key": return "OpenAI did not accept your key. Check it in Settings.";
    case "quota": return "OpenAI says your account is out of credit or over its limit.";
    case "model_not_found": return `OpenAI does not know the model "${detail ?? ""}". Check the model names in Settings.`;
    case "no_ffmpeg": return "ffmpeg is not installed. Install it, for example with: brew install ffmpeg";
    case "too_long": return "This video is longer than 15 minutes. Analysis supports up to 15 minutes.";
    case "too_large": return "This video is too large to download (over 300 MB).";
    case "download_failed": return "Could not download the post from Instagram. Try again.";
    case "bad_output": return "The AI answer was not a usable report. Try again.";
    case "interrupted": return "Analysis stopped because the app was closed. Try again.";
    case "already_running": return "This post is already being analyzed.";
    default:
      return MEDIA_CODES.has(code) ? mediaErrorText(code as MediaErrorCode) : "Analysis failed. Try again.";
  }
}

export function stepText(step: ReportStep | null): string {
  switch (step) {
    case "downloading": return "Downloading the post";
    case "frames": return "Picking frames";
    case "transcribing": return "Turning speech into text";
    case "writing": return "Writing the report";
    default: return "Waiting to start";
  }
}

export function reportFileName(username: string, code: string): string {
  const clean = (s: string) => s.replace(/[^\p{L}\p{N}._]+/gu, "-").replace(/^[-.]+|[-.]+$/g, "");
  return `${clean(username) || "post"}-${clean(code) || "report"}.md`;
}

export const isWorking = (r: PostReport | null) => r?.status === "queued" || r?.status === "running";

export type ReportView = { kind: "no_key" | "empty" | "working" | "report"; error: string | null };

export function reportView(o: { hasKey: boolean; report: PostReport | null; starting: boolean; startError: string | null }): ReportView {
  if (o.starting || isWorking(o.report)) return { kind: "working", error: null };
  const error = o.startError ?? (o.report?.status === "error" ? o.report.errorCode : null);
  if (o.report?.markdown) return { kind: "report", error };
  if (!o.hasKey && !error) return { kind: "no_key", error: null };
  return { kind: "empty", error };
}

/** Report links may open web pages. Images never load: a caption could make the model add a tracking pixel. */
export const safeMarkdownUrl = (url: string, key: string) => (key !== "src" && /^https?:\/\//i.test(url) ? url : "");

/** Models the key can use. If OpenAI says none, show all, so the owner still sees a choice and a clear error. */
export function usableModels(list: ModelOption[]): ModelOption[] {
  const ok = list.filter((m) => m.available);
  return ok.length ? ok : list;
}

/** The dropdowns start from the last run's choice, swapping out anything the key can no longer use. */
export function startingChoice(last: AnalyzeChoice, models: ModelsInfo): AnalyzeChoice {
  const pick = (id: string, list: ModelOption[]) => {
    const usable = usableModels(list);
    return usable.some((m) => m.id === id) ? id : (usable[0]?.id ?? id);
  };
  return {
    reportModel: pick(last.reportModel, models.report),
    transcribeModel: pick(last.transcribeModel, models.transcribe),
    language: isReportLanguage(last.language) ? last.language : DEFAULT_REPORT_LANGUAGE,
  };
}
