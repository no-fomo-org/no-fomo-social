import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createKeyStore } from "../src/secrets/key-store";

const dir = () => mkdtempSync(join(tmpdir(), "nf-keys-"));

describe("key store", () => {
  it("round-trips a key and never writes it in clear text", () => {
    const d = dir();
    createKeyStore(d).set({ openai: "sk-test-1234567890abcdef" });
    expect(createKeyStore(d).get()).toEqual({ openai: "sk-test-1234567890abcdef" });
    expect(readFileSync(join(d, "keys.enc")).includes("sk-test")).toBe(false);
  });

  it("writes both files readable only by the owner", () => {
    const d = dir();
    createKeyStore(d).set({ openai: "sk-test-1234567890abcdef" });
    expect(statSync(join(d, "keys.enc")).mode & 0o777).toBe(0o600);
    expect(statSync(join(d, "secret")).mode & 0o777).toBe(0o600);
  });

  it("removes a key with null", () => {
    const d = dir();
    const ks = createKeyStore(d);
    ks.set({ openai: "sk-test-1234567890abcdef" });
    ks.set({ openai: null });
    expect(ks.get()).toEqual({});
  });

  it("returns no keys when the secret does not match", () => {
    const d = dir();
    createKeyStore(d).set({ openai: "sk-test-1234567890abcdef" });
    writeFileSync(join(d, "secret"), randomBytes(32), { mode: 0o600 });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(createKeyStore(d).get()).toEqual({});
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns no keys before anything is saved", () => {
    expect(createKeyStore(dir()).get()).toEqual({});
  });
});
