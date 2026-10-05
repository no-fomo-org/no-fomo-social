export interface ModelInfo { id: string; note: string }
export interface LanguageInfo { name: string; native: string }

/** Models that can see images, cheapest first. Prices are OpenAI's per 1M input / output tokens, October 2026. */
export const REPORT_MODELS: readonly ModelInfo[] = [
  { id: "gpt-6-luna", note: "Cheapest. $0.10 / $0.50 per 1M tokens" },
  { id: "gpt-5.4-nano", note: "$0.20 / $1.25 per 1M tokens" },
  { id: "gpt-5-mini", note: "$0.25 / $2 per 1M tokens" },
  { id: "gpt-5.4-mini", note: "$0.75 / $4.50 per 1M tokens" },
  { id: "gpt-6.1-sol", note: "Stronger. $2 / $10 per 1M tokens" },
  { id: "gpt-6-astra", note: "Most capable. $10 / $50 per 1M tokens" },
];

/** Speech to text models for whole files. Realtime and streaming models are left out. */
export const TRANSCRIBE_MODELS: readonly ModelInfo[] = [
  { id: "gpt-transcribe", note: "Most accurate. About $0.005 per minute" },
  { id: "gpt-4o-mini-transcribe", note: "Cheapest. About $0.003 per minute" },
  { id: "gpt-4o-transcribe", note: "About $0.006 per minute" },
  { id: "whisper-1", note: "Oldest. About $0.006 per minute" },
];

export const REPORT_LANGUAGES: readonly LanguageInfo[] = [
  { name: "Arabic", native: "العربية" },
  { name: "Bengali", native: "বাংলা" },
  { name: "Bulgarian", native: "Български" },
  { name: "Catalan", native: "Català" },
  { name: "Chinese (Simplified)", native: "简体中文" },
  { name: "Chinese (Traditional)", native: "繁體中文" },
  { name: "Croatian", native: "Hrvatski" },
  { name: "Czech", native: "Čeština" },
  { name: "Danish", native: "Dansk" },
  { name: "Dutch", native: "Nederlands" },
  { name: "English", native: "English" },
  { name: "Estonian", native: "Eesti" },
  { name: "Finnish", native: "Suomi" },
  { name: "French", native: "Français" },
  { name: "German", native: "Deutsch" },
  { name: "Greek", native: "Ελληνικά" },
  { name: "Hebrew", native: "עברית" },
  { name: "Hindi", native: "हिन्दी" },
  { name: "Hungarian", native: "Magyar" },
  { name: "Indonesian", native: "Bahasa Indonesia" },
  { name: "Italian", native: "Italiano" },
  { name: "Japanese", native: "日本語" },
  { name: "Kazakh", native: "Қазақ тілі" },
  { name: "Korean", native: "한국어" },
  { name: "Latvian", native: "Latviešu" },
  { name: "Lithuanian", native: "Lietuvių" },
  { name: "Malay", native: "Bahasa Melayu" },
  { name: "Norwegian", native: "Norsk" },
  { name: "Persian", native: "فارسی" },
  { name: "Polish", native: "Polski" },
  { name: "Portuguese", native: "Português" },
  { name: "Romanian", native: "Română" },
  { name: "Russian", native: "Русский" },
  { name: "Serbian", native: "Српски" },
  { name: "Slovak", native: "Slovenčina" },
  { name: "Slovenian", native: "Slovenščina" },
  { name: "Spanish", native: "Español" },
  { name: "Swahili", native: "Kiswahili" },
  { name: "Swedish", native: "Svenska" },
  { name: "Tagalog", native: "Tagalog" },
  { name: "Thai", native: "ไทย" },
  { name: "Turkish", native: "Türkçe" },
  { name: "Ukrainian", native: "Українська" },
  { name: "Urdu", native: "اردو" },
  { name: "Vietnamese", native: "Tiếng Việt" },
];

export const isReportModel = (id: string) => REPORT_MODELS.some((m) => m.id === id);
export const isTranscribeModel = (id: string) => TRANSCRIBE_MODELS.some((m) => m.id === id);
export const isReportLanguage = (name: string) => REPORT_LANGUAGES.some((l) => l.name === name);
