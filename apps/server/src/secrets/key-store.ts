import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface Secrets { openai?: string }
export interface KeyStore { get(): Secrets; set(patch: { openai?: string | null }): void }

/**
 * Keys live in keys.enc, encrypted with AES-256-GCM. The 32-byte secret sits next to it.
 * This keeps keys safe in a copied or backed-up keys.enc, not from other programs run by the same user.
 */
export function createKeyStore(dir: string): KeyStore {
  const file = join(dir, "keys.enc");
  const secretFile = join(dir, "secret");

  function secret(): Buffer {
    if (!existsSync(secretFile)) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(secretFile, randomBytes(32), { mode: 0o600, flag: "wx" });
    }
    const s = readFileSync(secretFile);
    if (s.length !== 32) throw new Error(`${secretFile} is damaged. Delete it and keys.enc, then add your keys again.`);
    return s;
  }

  function get(): Secrets {
    if (!existsSync(file)) return {};
    try {
      const buf = readFileSync(file);
      const decipher = createDecipheriv("aes-256-gcm", secret(), buf.subarray(0, 12));
      decipher.setAuthTag(buf.subarray(12, 28));
      return JSON.parse(Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8")) as Secrets;
    } catch {
      console.warn(`Could not read ${file}. Add your keys again in Settings.`);
      return {};
    }
  }

  function set(patch: { openai?: string | null }) {
    const next: Secrets = { ...get() };
    if (patch.openai === null) delete next.openai;
    else if (patch.openai !== undefined) next.openai = patch.openai;
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", secret(), iv);
    const body = Buffer.concat([cipher.update(JSON.stringify(next), "utf8"), cipher.final()]);
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, Buffer.concat([iv, cipher.getAuthTag(), body]), { mode: 0o600 });
    renameSync(tmp, file);
  }

  return { get, set };
}
