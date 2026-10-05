import { describe, expect, it } from "vitest";
import {
  DEFAULT_REPORT_LANGUAGE, DEFAULT_REPORT_MODEL, DEFAULT_TRANSCRIBE_MODEL,
  isReportLanguage, isReportModel, isTranscribeModel, REPORT_LANGUAGES, REPORT_MODELS, TRANSCRIBE_MODELS,
} from "../src";

describe("model lists", () => {
  it("lists report models from cheapest to most capable, with the default first", () => {
    expect(REPORT_MODELS.map((m) => m.id)).toEqual(["gpt-6-luna", "gpt-5.4-nano", "gpt-5-mini", "gpt-5.4-mini", "gpt-6.1-sol", "gpt-6-astra"]);
    expect(DEFAULT_REPORT_MODEL).toBe("gpt-6-luna");
    expect(REPORT_MODELS.every((m) => m.note.length > 0)).toBe(true);
  });
  it("lists speech models with the default first", () => {
    expect(TRANSCRIBE_MODELS.map((m) => m.id)).toEqual(["gpt-transcribe", "gpt-4o-mini-transcribe", "gpt-4o-transcribe", "whisper-1"]);
    expect(DEFAULT_TRANSCRIBE_MODEL).toBe("gpt-transcribe");
  });
  it("only accepts models from the lists", () => {
    expect(isReportModel("gpt-6-luna")).toBe(true);
    expect(isReportModel("gpt-transcribe")).toBe(false);
    expect(isTranscribeModel("whisper-1")).toBe(true);
    expect(isTranscribeModel("gpt-6-luna")).toBe(false);
  });
});

describe("report languages", () => {
  it("has the major languages, sorted A to Z, each with its own name", () => {
    const names = REPORT_LANGUAGES.map((l) => l.name);
    expect(names.length).toBeGreaterThanOrEqual(40);
    expect([...names].sort((a, b) => a.localeCompare(b, "en"))).toEqual(names);
    for (const n of ["English", "Russian", "Ukrainian", "Spanish", "Chinese (Simplified)", "Arabic", "Hindi", "Japanese", "Turkish"]) expect(names).toContain(n);
    expect(REPORT_LANGUAGES.find((l) => l.name === "Russian")?.native).toBe("Русский");
    expect(new Set(names).size).toBe(names.length);
  });
  it("only accepts languages from the list", () => {
    expect(DEFAULT_REPORT_LANGUAGE).toBe("English");
    expect(isReportLanguage("Russian")).toBe(true);
    expect(isReportLanguage("Klingon")).toBe(false);
    expect(isReportLanguage("russian")).toBe(false);
  });
});
