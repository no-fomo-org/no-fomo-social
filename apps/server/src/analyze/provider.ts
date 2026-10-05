import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, generateText, NoSuchModelError, NoTranscriptGeneratedError, RetryError, transcribe, type LanguageModel, type TranscriptionModel } from "ai";
import { AnalyzeError } from "./errors";

export type ReportContent = Array<{ type: "text"; text: string } | { type: "image"; image: Uint8Array; mediaType: "image/jpeg" }>;

export interface Provider {
  transcribe(audio: Uint8Array, model: string): Promise<string>;
  writeReport(o: { model: string; system: string; content: ReportContent }): Promise<string>;
}

const CALL_TIMEOUT_MS = 5 * 60_000;

/** The only place that talks to an AI provider. Add Groq, Gemini or Anthropic here later. */
export function createProvider(models: { language: (id: string) => LanguageModel; transcription: (id: string) => TranscriptionModel }): Provider {
  return {
    async transcribe(audio, model) {
      try {
        const r = await transcribe({ model: models.transcription(model), audio, abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
        return r.text.trim();
      } catch (e) {
        // Music or silence: the audio track exists but nobody speaks.
        if (NoTranscriptGeneratedError.isInstance(e)) return "";
        throw toAnalyzeError(e, model);
      }
    },
    async writeReport({ model, system, content }) {
      try {
        const r = await generateText({
          model: models.language(model),
          system,
          messages: [{ role: "user", content }],
          abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS),
        });
        return r.text;
      } catch (e) {
        throw toAnalyzeError(e, model);
      }
    },
  };
}

export function createOpenAIProvider(apiKey: string): Provider {
  const openai = createOpenAI({ apiKey });
  return createProvider({ language: (id) => openai(id), transcription: (id) => openai.transcription(id) });
}

export function toAnalyzeError(err: unknown, model: string): AnalyzeError {
  const e = RetryError.isInstance(err) ? err.lastError : err;
  if (e instanceof AnalyzeError) return e;
  if (NoSuchModelError.isInstance(e)) return new AnalyzeError("model_not_found", model);
  if (APICallError.isInstance(e)) {
    const body = e.responseBody ?? "";
    if (e.statusCode === 401) return new AnalyzeError("bad_key");
    if (e.statusCode === 429 || body.includes("insufficient_quota")) return new AnalyzeError("quota");
    if (e.statusCode === 404 || body.includes("model_not_found")) return new AnalyzeError("model_not_found", model);
  }
  return new AnalyzeError("failed", e instanceof Error ? e.message : String(e));
}
