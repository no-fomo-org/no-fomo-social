import {
  DEFAULT_REPORT_LANGUAGE, DEFAULT_REPORT_MODEL, DEFAULT_TRANSCRIBE_MODEL, type AnalyzeChoice, type AppSettings, type SettingsUpdate,
} from "@no-fomo/core";
import type { Db } from "./db/open";
import { getSetting, setSetting } from "./db/settings";
import type { KeyStore } from "./secrets/key-store";

const K = { language: "report_language", reportModel: "report_model", transcribeModel: "transcribe_model" } as const;

/** The last choice used, or the defaults before the first run. */
export function analyzeOptions(db: Db): AnalyzeChoice {
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

export function rememberChoice(db: Db, c: AnalyzeChoice) {
  setSetting(db, K.language, c.language);
  setSetting(db, K.reportModel, c.reportModel);
  setSetting(db, K.transcribeModel, c.transcribeModel);
}

export function updateSettings(db: Db, keys: KeyStore, u: SettingsUpdate): AppSettings {
  if (u.openaiKey !== undefined) keys.set({ openai: u.openaiKey });
  return readSettings(db, keys);
}
