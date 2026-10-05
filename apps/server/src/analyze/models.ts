import { REPORT_MODELS, TRANSCRIBE_MODELS, type ModelInfo, type ModelsInfo } from "@no-fomo/core";
import type { KeyStore } from "../secrets/key-store";

const MODELS_URL = "https://api.openai.com/v1/models";
const CACHE_MS = 10 * 60_000;

export interface ModelCatalog { list(): Promise<ModelsInfo> }

/** Our model lists, with each model marked by whether the saved key can use it. Asks OpenAI at most every 10 minutes. */
export function createModelCatalog(o: { keys: KeyStore; fetch?: typeof fetch; now?: () => number }): ModelCatalog {
  const fetchFn = o.fetch ?? fetch;
  const now = o.now ?? Date.now;
  let cache: { key: string; at: number; ids: Set<string> } | null = null;

  async function usable(key: string): Promise<Set<string> | null> {
    if (cache && cache.key === key && now() - cache.at < CACHE_MS) return cache.ids;
    try {
      const res = await fetchFn(MODELS_URL, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return null;
      const body = (await res.json()) as { data?: Array<{ id?: unknown }> };
      const ids = new Set((body.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === "string"));
      cache = { key, at: now(), ids };
      return ids;
    } catch {
      return null;
    }
  }

  return {
    async list() {
      const key = o.keys.get().openai;
      const ids = key ? await usable(key) : null;
      const mark = (list: readonly ModelInfo[]) => list.map((m) => ({ ...m, available: ids ? ids.has(m.id) : true }));
      return { report: mark(REPORT_MODELS), transcribe: mark(TRANSCRIBE_MODELS), checked: ids !== null };
    },
  };
}
