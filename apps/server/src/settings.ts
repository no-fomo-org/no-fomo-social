import { DEFAULT_REPORT_LANGUAGE, DEFAULT_REPORT_MODEL, DEFAULT_TRANSCRIBE_MODEL, type AppSettings, type SettingsUpdate } from "@no-fomo/core";
import type { Db } from "./db/open";
import { getSetting, setSetting } from "./db/settings";
import type { KeyStore } from "./secrets/key-store";

const K = { language: "report_language", reportModel: "report_model", transcribeModel: "transcribe_model" } as const;

export interface AnalyzeOptions { language: string; reportModel: string; transcribeModel: string }

export function analyzeOptions(db: Db): AnalyzeOptions {
  return {
    language: getSetting(db, K.language) ?? DEFAULT_REPORT_LANGUAGE,
    reportModel: getSetting(db, K.reportModel) ?? DEFAULT_REPORT_MODEL,
    transcribeModel: getSetting(db, K.transcribeModel) ?? DEFAULT_TRANSCRIBE_MODEL,
  };
}

export function readSettings(db: Db, keys: KeyStore): AppSettings {
  const key = keys.get().openai;
  const o = analyzeOptions(db);
  return {
    openai: { set: !!key, last4: key ? key.slice(-4) : null },
    reportLanguage: o.language,
    reportModel: o.reportModel,
    transcribeModel: o.transcribeModel,
  };
}

export function updateSettings(db: Db, keys: KeyStore, u: SettingsUpdate): AppSettings {
  if (u.openaiKey !== undefined) keys.set({ openai: u.openaiKey });
  if (u.reportLanguage !== undefined) setSetting(db, K.language, u.reportLanguage);
  if (u.reportModel !== undefined) setSetting(db, K.reportModel, u.reportModel);
  if (u.transcribeModel !== undefined) setSetting(db, K.transcribeModel, u.transcribeModel);
  return readSettings(db, keys);
}
