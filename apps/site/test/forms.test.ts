import { describe, expect, it } from "vitest";
import { contactEmailText, parseContact, parseEmail, verifyTurnstile } from "../app/lib/forms.server";
import { guessOs, installCommand } from "../app/lib/site";

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe("contact form", () => {
  it("accepts a normal message and trims it", () => {
    expect(parseContact(form({ name: " Ana ", email: "ana@example.com", message: " Hello there " }))).toEqual({
      ok: true,
      value: { name: "Ana", email: "ana@example.com", message: "Hello there" },
    });
  });

  it("names every wrong field", () => {
    const r = parseContact(form({ name: "", email: "not-an-email", message: "hi" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fields).sort()).toEqual(["email", "message", "name"]);
  });

  it("refuses very long input", () => {
    const r = parseContact(form({ name: "x".repeat(101), email: "a@b.co", message: "y".repeat(5001) }));
    expect(r.ok).toBe(false);
  });

  it("keeps the owner's copy as plain text", () => {
    expect(contactEmailText({ name: "<b>Ana</b>", email: "a@b.co", message: "<script>x</script>" })).toContain("<script>x</script>");
  });
});

describe("notify form", () => {
  it("lowercases a valid email and refuses a bad one", () => {
    expect(parseEmail(form({ email: " Ana@Example.COM " }))).toBe("ana@example.com");
    expect(parseEmail(form({ email: "ana@" }))).toBeNull();
  });
});

describe("turnstile", () => {
  const answer = (body: unknown) => (async () => new Response(JSON.stringify(body))) as unknown as typeof fetch;

  it("passes only when Cloudflare says success", async () => {
    expect(await verifyTurnstile("t", "s", null, answer({ success: true }))).toBe(true);
    expect(await verifyTurnstile("t", "s", null, answer({ success: false }))).toBe(false);
  });

  it("fails without a token or when the check cannot run", async () => {
    expect(await verifyTurnstile("", "s", null, answer({ success: true }))).toBe(false);
    const broken = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    expect(await verifyTurnstile("t", "s", null, broken)).toBe(false);
  });
});

describe("install line", () => {
  it("uses the site's own address", () => {
    expect(installCommand("mac", "https://example.app")).toBe("curl -fsSL https://example.app/install.sh | bash");
    expect(installCommand("windows", "https://example.app")).toBe("irm https://example.app/install.ps1 | iex");
  });

  it("guesses Windows only from a Windows browser", () => {
    expect(guessOs("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
    expect(guessOs("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)")).toBe("mac");
    expect(guessOs(null)).toBe("mac");
  });
});
