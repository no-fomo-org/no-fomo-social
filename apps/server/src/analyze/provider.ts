import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, generateText, NoSuchModelError, NoTranscriptGeneratedError, RetryError, transcribe, type LanguageModel, type TranscriptionModel } from "ai";
import { AnalyzeError } from "./errors";

export type ReportContent = Array<{ type: "text"; text: string } | { type: "image"; image: Uint8Array; mediaType: "image/jpeg" }>;

export interface Provider {
  transcribe(audio: Uint8Array, model: string): Promise<string>;
  /** One answer from a language model, for the report or for reading the screen. */
  generate(o: { model: string; system: string; content: ReportContent }): Promise<string>;
}

const CALL_TIMEOUT_MS = 5 * 60_000;
// Without this, OpenAI may read many images at low detail, and small text on screen is lost.
const HIGH_DETAIL = { openai: { imageDetail: "high" } };

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
    async generate({ model, system, content }) {
      try {
        const r = await generateText({
          model: models.language(model),
          system,
          messages: [{ role: "user", content: content.map((c) => (c.type === "image" ? { type: "file", data: c.image, mediaType: c.mediaType, providerOptions: HIGH_DETAIL } : c)) }],
          abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS),
        });
        return r.text;
      } catch (e) {
        throw toAnalyzeError(e, model);
      }
    },
  };
}

/** Pins the base URL: without it the SDK follows OPENAI_BASE_URL from the environment, and the key would go there. */
export function createOpenAIProvider(apiKey: string, opts: { fetch?: typeof fetch } = {}): Provider {
  const openai = createOpenAI({ apiKey, baseURL: "https://api.openai.com/v1", fetch: opts.fetch });
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
