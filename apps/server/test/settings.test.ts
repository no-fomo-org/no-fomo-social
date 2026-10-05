import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { AppSettings } from "@no-fomo/core";
import { openDb } from "../src/db/open";
import { createApp } from "../src/http/app";
import { createMediaStore } from "../src/media/store";
import { createKeyStore } from "../src/secrets/key-store";
import type { ServerConfig } from "../src/config";

const EXT = "abcdefghijklmnopabcdefghijklmnop";
const HOST = "localhost:4747";
const APP = "http://localhost:4747";
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  const dataDir = mkdtempSync(join(tmpdir(), "nf-settings-"));
  const db = openDb(":memory:");
  const config: ServerConfig = { port: 4747, dataDir, webDist: null, extensionId: EXT, devOrigins: [], dumpPayloads: false, extraMediaHosts: [] };
  const media = createMediaStore({ dir: join(dataDir, "media"), onSaved: () => {} });
  app = createApp({ db, config, media, keys: createKeyStore(dataDir) });
});

const save = (body: unknown, origin = APP) =>
  app.request("/api/settings", { method: "POST", headers: { host: HOST, origin, "content-type": "application/json" }, body: JSON.stringify(body) });
const read = async (origin?: string) =>
  app.request("/api/settings", { headers: { host: HOST, ...(origin ? { origin } : {}) } });

describe("settings routes", () => {
  it("starts with defaults and no key", async () => {
    expect(await (await read()).json()).toEqual({
      openai: { set: false, last4: null }, reportLanguage: "English", reportModel: "gpt-5.4-mini", transcribeModel: "gpt-transcribe",
    });
  });

  it("saves a key but only ever returns its last 4 characters", async () => {
    const res = await save({ openaiKey: "  sk-test-1234567890abcd  ", reportLanguage: "Russian" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AppSettings;
    expect(body.openai).toEqual({ set: true, last4: "abcd" });
    expect(body.reportLanguage).toBe("Russian");
    expect(JSON.stringify(await (await read()).json())).not.toContain("sk-test");
  });

  it("removes the key with null", async () => {
    await save({ openaiKey: "sk-test-1234567890abcd" });
    expect(((await (await save({ openaiKey: null })).json()) as AppSettings).openai.set).toBe(false);
  });

  it("rejects bad values", async () => {
    expect((await save({ openaiKey: "short" })).status).toBe(400);
    expect((await save({ openaiKey: "sk-has space in it 1234567890" })).status).toBe(400);
    expect((await save({ reportLanguage: "<script>" })).status).toBe(400);
    expect((await save({ reportModel: "GPT 5" })).status).toBe(400);
    expect((await save({ other: 1 })).status).toBe(400);
  });

  it("rejects the extension origin for reads and writes", async () => {
    expect((await save({ reportLanguage: "German" }, `chrome-extension://${EXT}`)).status).toBe(403);
    expect((await read(`chrome-extension://${EXT}`)).status).toBe(403);
  });
});
