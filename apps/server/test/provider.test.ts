import { APICallError, RetryError } from "ai";
import { MockLanguageModelV4, MockTranscriptionModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { createProvider, toAnalyzeError } from "../src/analyze/provider";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};
const unused = () => {
  throw new Error("unused");
};

describe("provider", () => {
  it("sends the system prompt and images, returns the text", async () => {
    const lm = new MockLanguageModelV4({
      doGenerate: async () => ({ content: [{ type: "text", text: "## Summary\nok" }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] }),
    });
    const p = createProvider({ language: () => lm, transcription: unused });
    const text = await p.writeReport({
      model: "m",
      system: "SYS",
      content: [{ type: "text", text: "info" }, { type: "image", image: new Uint8Array([0xff, 0xd8, 0xff]), mediaType: "image/jpeg" }],
    });
    expect(text).toBe("## Summary\nok");
    const prompt = lm.doGenerateCalls[0]!.prompt;
    expect(prompt[0]).toMatchObject({ role: "system", content: "SYS" });
    expect(JSON.stringify(prompt[1])).toContain("image/jpeg");
  });

  it("returns the trimmed transcript", async () => {
    const tm = new MockTranscriptionModelV4({
      doGenerate: async () => ({
        text: "  привет  ", segments: [], language: "ru", durationInSeconds: 1, warnings: [],
        response: { timestamp: new Date(), modelId: "t", headers: {} },
      }),
    });
    const p = createProvider({ language: unused, transcription: () => tm });
    expect(await p.transcribe(new Uint8Array([1, 2, 3]), "t")).toBe("привет");
  });
});

describe("silent audio", () => {
  it("returns an empty transcript when the model hears no speech", async () => {
    const tm = new MockTranscriptionModelV4({
      doGenerate: async () => ({
        text: "", segments: [], language: undefined, durationInSeconds: 3, warnings: [],
        response: { timestamp: new Date(), modelId: "t", headers: {} },
      }),
    });
    const p = createProvider({ language: unused, transcription: () => tm });
    expect(await p.transcribe(new Uint8Array([1, 2, 3]), "t")).toBe("");
  });
});

describe("toAnalyzeError", () => {
  const api = (statusCode: number, responseBody = "") =>
    new APICallError({ message: "x", url: "https://api.openai.com", requestBodyValues: {}, statusCode, responseBody, isRetryable: false });
  it("maps OpenAI answers to plain error codes", () => {
    expect(toAnalyzeError(api(401), "m").code).toBe("bad_key");
    expect(toAnalyzeError(api(429), "m").code).toBe("quota");
    expect(toAnalyzeError(api(400, '{"error":{"code":"insufficient_quota"}}'), "m").code).toBe("quota");
    const nf = toAnalyzeError(api(404, '{"error":{"code":"model_not_found"}}'), "gpt-x");
    expect([nf.code, nf.message]).toEqual(["model_not_found", "gpt-x"]);
    expect(toAnalyzeError(new Error("boom"), "m").code).toBe("failed");
  });
  it("looks inside retry errors", () => {
    const e = new RetryError({ message: "r", reason: "maxRetriesExceeded", errors: [api(429)] });
    expect(toAnalyzeError(e, "m").code).toBe("quota");
  });
});
