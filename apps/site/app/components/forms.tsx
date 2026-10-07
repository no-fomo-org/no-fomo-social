import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFetcher } from "react-router";
import { buttonClass } from "./button";
import { Turnstile } from "./turnstile";
import type { FormResult } from "../lib/forms.server";

const field =
  "w-full rounded-control border border-line bg-surface px-3 text-[15px] text-text placeholder:text-muted " +
  "transition-colors duration-150 focus:border-accent-line focus:bg-paper focus:outline-2 focus:outline-offset-2 focus:outline-accent " +
  "aria-[invalid=true]:border-danger";

/** Shared logic: post to the page action, show the answer, reset Turnstile and the fields after a success. */
function useSiteForm(form: "contact" | "notify") {
  const fetcher = useFetcher<FormResult>();
  const ref = useRef<HTMLFormElement>(null);
  const [sends, setSends] = useState(0);
  const result = fetcher.data?.form === form ? fetcher.data : undefined;
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    setSends((n) => n + 1);
    if (fetcher.data.ok) ref.current?.reset();
  }, [fetcher.state, fetcher.data]);

  return { fetcher, ref, sends, result, busy };
}

function Status({ result }: { result: FormResult | undefined }) {
  return (
    <p aria-live="polite" className={`min-h-[1.5em] text-[14px] ${result?.ok === false ? "text-danger" : "text-text"}`}>
      {result?.message}
    </p>
  );
}

/** Hidden from people; bots fill it and are quietly dropped. */
const Trap = () => (
  <label aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
    Website <input name="website" tabIndex={-1} autoComplete="off" />
  </label>
);

export function NotifyForm({ siteKey }: { siteKey: string }) {
  const { fetcher, ref, sends, result, busy } = useSiteForm("notify");
  return (
    <fetcher.Form ref={ref} method="post" action="/?index" className="relative grid max-w-[480px] gap-2">
      <input type="hidden" name="form" value="notify" />
      <Trap />
      <label htmlFor="notify-email" className="text-[14px] font-medium">Get one email when they are ready</label>
      <div className="flex gap-2">
        <input
          id="notify-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          aria-invalid={result?.ok === false && !!result.fields?.email}
          className={`${field} h-9 min-w-0 flex-1`}
        />
        <button type="submit" disabled={busy} className={buttonClass("secondary")}>
          {busy ? "Sending" : "Notify me"}
        </button>
      </div>
      <Turnstile key={sends} siteKey={siteKey} />
      <Status result={result} />
    </fetcher.Form>
  );
}

export function ContactForm({ siteKey }: { siteKey: string }) {
  const { fetcher, ref, sends, result, busy } = useSiteForm("contact");
  const err = (name: "name" | "email" | "message") => (result?.ok === false ? result.fields?.[name] : undefined);
  return (
    <fetcher.Form ref={ref} method="post" action="/?index" className="relative grid gap-4">
      <input type="hidden" name="form" value="contact" />
      <Trap />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="contact-name" label="Name" error={err("name")}>
          <input id="contact-name" name="name" required maxLength={100} autoComplete="name" aria-invalid={!!err("name")} aria-describedby="contact-name-error" className={`${field} h-10`} />
        </Field>
        <Field id="contact-email" label="Email" error={err("email")}>
          <input id="contact-email" name="email" type="email" required autoComplete="email" aria-invalid={!!err("email")} aria-describedby="contact-email-error" className={`${field} h-10`} />
        </Field>
      </div>
      <Field id="contact-message" label="Message" error={err("message")}>
        <textarea
          id="contact-message"
          name="message"
          required
          rows={5}
          maxLength={5000}
          aria-invalid={!!err("message")}
          aria-describedby="contact-message-error"
          className={`${field} resize-y py-2.5 leading-relaxed`}
        />
      </Field>
      <Turnstile key={sends} siteKey={siteKey} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="submit" disabled={busy} className={buttonClass("primary", "h-10 px-5")}>
          {busy ? "Sending" : "Send message"}
        </button>
        <Status result={result} />
      </div>
    </fetcher.Form>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[14px] font-medium">{label}</label>
      {children}
      <p id={`${id}-error`} className="min-h-0 text-[13px] text-danger empty:hidden">{error}</p>
    </div>
  );
}
