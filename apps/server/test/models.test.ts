import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createModelCatalog } from "../src/analyze/models";
import { createKeyStore, type KeyStore } from "../src/secrets/key-store";

let keys: KeyStore;
let calls: Array<{ url: string; auth: string | null }>;
let answer: () => Response;
let clock: number;
const fakeFetch = (async (url: string, init?: RequestInit) => {
  calls.push({ url: String(url), auth: new Headers(init?.headers).get("authorization") });
  return answer();
}) as typeof fetch;
const make = () => createModelCatalog({ keys, fetch: fakeFetch, now: () => clock });
const ids = (data: string[]) => () => Response.json({ object: "list", data: data.map((id) => ({ id, object: "model" })) });
const available = (list: { id: string; available: boolean }[]) => list.filter((m) => m.available).map((m) => m.id);

beforeEach(() => {
  keys = createKeyStore(mkdtempSync(join(tmpdir(), "nf-models-")));
  calls = [];
  clock = 0;
  answer = ids(["gpt-6-luna", "gpt-5.4-mini", "whisper-1", "gpt-transcribe", "dall-e-3"]);
});

describe("model catalog", () => {
  it("shows every model without asking OpenAI when there is no key", async () => {
    const m = await make().list();
    expect(m.checked).toBe(false);
    expect(m.report.every((x) => x.available)).toBe(true);
    expect(calls).toEqual([]);
  });

  it("marks only the models the key can use", async () => {
    keys.set({ openai: "sk-test-1234567890abcdef" });
    const m = await make().list();
    expect(calls).toEqual([{ url: "https://api.openai.com/v1/models", auth: "Bearer sk-test-1234567890abcdef" }]);
    expect(m.checked).toBe(true);
    expect(available(m.report)).toEqual(["gpt-6-luna", "gpt-5.4-mini"]);
    expect(available(m.transcribe)).toEqual(["gpt-transcribe", "whisper-1"]);
    expect(m.report[0]).toMatchObject({ id: "gpt-6-luna", note: expect.stringContaining("$") });
  });

  it("asks again after 10 minutes or when the key changes", async () => {
    keys.set({ openai: "sk-test-1234567890abcdef" });
    const c = make();
    await c.list();
    clock = 9 * 60_000;
    await c.list();
    expect(calls.length).toBe(1);
    clock = 11 * 60_000;
    await c.list();
    expect(calls.length).toBe(2);
    keys.set({ openai: "sk-test-other-key-0000000" });
    await c.list();
    expect(calls.length).toBe(3);
  });

  it("shows every model when OpenAI cannot be asked, and tries again next time", async () => {
    keys.set({ openai: "sk-test-1234567890abcdef" });
    answer = () => new Response("down", { status: 500 });
    const c = make();
    const m = await c.list();
    expect(m.checked).toBe(false);
    expect(m.transcribe.every((x) => x.available)).toBe(true);
    await c.list();
    expect(calls.length).toBe(2);
  });
});
