/** What a form shows after it is sent: a short message, plus a message per field when input was wrong. */
export type FormResult =
  | { form: "contact" | "notify"; ok: true; message: string }
  | { form: "contact" | "notify"; ok: false; message: string; fields?: Partial<Record<"name" | "email" | "message", string>> };

export interface ContactInput {
  name: string;
  email: string;
  message: string;
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

export function parseContact(data: FormData): { ok: true; value: ContactInput } | { ok: false; fields: NonNullable<Extract<FormResult, { ok: false }>["fields"]> } {
  const value = { name: text(data.get("name")), email: text(data.get("email")), message: text(data.get("message")) };
  const fields: Partial<Record<keyof ContactInput, string>> = {};
  if (!value.name) fields.name = "Please write your name.";
  else if (value.name.length > 100) fields.name = "Please keep your name under 100 letters.";
  if (!EMAIL.test(value.email) || value.email.length > 254) fields.email = "Please check your email address.";
  if (value.message.length < 5) fields.message = "Please write a few words.";
  else if (value.message.length > 5000) fields.message = "Please keep the message under 5,000 letters.";
  return Object.keys(fields).length ? { ok: false, fields } : { ok: true, value };
}

export function parseEmail(data: FormData): string | null {
  const email = text(data.get("email")).toLowerCase();
  return EMAIL.test(email) && email.length <= 254 ? email : null;
}

/** Asks Cloudflare whether the Turnstile token is from a person. Any failure counts as "no". */
export async function verifyTurnstile(token: string, secret: string, ip: string | null, doFetch: typeof fetch = fetch): Promise<boolean> {
  if (!token) return false;
  const body = new FormData();
  body.set("secret", secret);
  body.set("response", token);
  if (ip) body.set("remoteip", ip);
  try {
    const res = await doFetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch {
    return false;
  }
}

/** Plain text for the owner's copy of a contact message. Never HTML, so nothing in the message can render. */
export function contactEmailText(c: ContactInput): string {
  return `New message from the no-fomo website.\n\nName: ${c.name}\nEmail: ${c.email}\n\n${c.message}\n`;
}

/** Handles both forms on the page. Saves to D1 first; the email to the owner is a copy and may fail on its own. */
export async function handleForm(request: Request, env: Env, ctx: ExecutionContext): Promise<FormResult> {
  const data = await request.formData();
  const form = data.get("form") === "notify" ? "notify" : "contact";
  const ip = request.headers.get("cf-connecting-ip");

  // Bots fill every field, people never see this one.
  if (text(data.get("website"))) return { form, ok: true, message: "Thank you." };

  const { success } = await env.FORM_LIMIT.limit({ key: `${form}:${ip ?? "unknown"}` });
  if (!success) return { form, ok: false, message: "Too many tries. Please wait a minute and try again." };

  if (!(await verifyTurnstile(text(data.get("cf-turnstile-response")), env.TURNSTILE_SECRET, ip))) {
    return { form, ok: false, message: "We could not check that you are a person. Please try again." };
  }

  const now = Date.now();
  if (form === "notify") {
    const email = parseEmail(data);
    if (!email) return { form, ok: false, message: "Please check your email address.", fields: { email: "Please check your email address." } };
    await env.DB.prepare("INSERT INTO waitlist (email, created_at) VALUES (?, ?) ON CONFLICT(email) DO NOTHING").bind(email, now).run();
    return { form, ok: true, message: "Thank you. We will write once when new reports are ready." };
  }

  const parsed = parseContact(data);
  if (!parsed.ok) return { form, ok: false, message: "Please fix the fields below.", fields: parsed.fields };
  const c = parsed.value;
  await env.DB.prepare("INSERT INTO messages (name, email, message, created_at) VALUES (?, ?, ?, ?)").bind(c.name, c.email, c.message, now).run();
  ctx.waitUntil(
    env.EMAIL.send({
      to: env.CONTACT_TO,
      from: { email: env.MAIL_FROM, name: "no-fomo website" },
      replyTo: { email: c.email, name: c.name },
      subject: `no-fomo website: message from ${c.name.slice(0, 60)}`,
      text: contactEmailText(c),
    }).then(
      () => undefined,
      (e: unknown) => console.error(JSON.stringify({ event: "contact_email_failed", error: String(e) })),
    ),
  );
  return { form, ok: true, message: "Thank you. We read every message and answer by email." };
}
