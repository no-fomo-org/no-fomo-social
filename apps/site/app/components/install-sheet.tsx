import { Fragment, useRef, useState } from "react";
import { ChromeIcon, Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { buttonClass } from "./button";
import { Icon } from "./icon";
import { STORE_URL, installCommand, type Os } from "../lib/site";

const OPEN_HINT: Record<Os, { app: string; how: string }> = {
  mac: { app: "Terminal", how: "Press Cmd + Space, type Terminal, press Enter." },
  windows: { app: "PowerShell", how: "Press the Windows key, type PowerShell, press Enter." },
};

/**
 * The installer that sits on the photo. One Fern button at a time shows the next thing to do:
 * Copy first, then Add to Chrome once the command is copied.
 */
export function InstallSheet({ origin, initialOs, id }: { origin: string; initialOs: Os; id?: string }) {
  const [os, setOs] = useState<Os>(initialOs);
  const [copied, setCopied] = useState(false);
  const [added, setAdded] = useState(false);
  const code = useRef<HTMLElement>(null);
  const command = installCommand(os, origin);
  const step = !copied ? 1 : !added ? 2 : 3;

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      // No clipboard (old browser, blocked): select the text so Cmd/Ctrl + C works.
      const range = document.createRange();
      if (code.current) range.selectNodeContents(code.current);
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(range);
    }
    setCopied(true);
  }

  const pick = (next: Os) => {
    setOs(next);
    setCopied(false);
  };

  return (
    <section id={id} aria-labelledby="install-title" className="rounded-sheet bg-paper p-5 text-text shadow-pop md:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="install-title" className="text-[17px] font-semibold">Install in 3 steps</h2>
        <div role="tablist" aria-label="Your computer" className="flex gap-1">
          {(["mac", "windows"] as const).map((o) => (
            <button
              key={o}
              type="button"
              role="tab"
              aria-selected={os === o}
              onClick={() => pick(o)}
              className={`h-8 rounded-control px-3 text-[14px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                os === o ? "bg-accent-soft font-semibold text-text" : "text-muted can-hover:hover:bg-surface can-hover:hover:text-text"
              }`}
            >
              {o === "mac" ? "Mac" : "Windows"}
            </button>
          ))}
        </div>
      </div>

      <ol className="mt-5 grid gap-1">
        <Step n={1} state={step === 1 ? "now" : "done"}>
          <p>
            Open {OPEN_HINT[os].app} and paste this line.{" "}
            <span className="text-muted">{OPEN_HINT[os].how}</span>
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
            <code
              ref={code}
              className={`block min-w-0 flex-1 rounded-control border px-3 py-2 font-mono text-[13px] leading-relaxed text-text [overflow-wrap:anywhere] transition-colors duration-300 ease-out-soft ${
                copied ? "border-accent-line bg-accent-soft" : "border-line bg-surface"
              }`}
            >
              {/* Lines may break only after a slash or a space, so no word is cut in half. */}
              {command.split(/(?<=\/)/).map((part, i) => (
                <Fragment key={i}>
                  {i > 0 && <wbr />}
                  {part}
                </Fragment>
              ))}
            </code>
            <button type="button" onClick={copy} className={buttonClass(copied ? "secondary" : "primary", "shrink-0 sm:w-[92px]")}>
              <Icon icon={copied ? Tick02Icon : Copy01Icon} />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p aria-live="polite" className="sr-only">{copied ? "Command copied" : ""}</p>
        </Step>

        <Step n={2} state={step === 2 ? "now" : step > 2 ? "done" : "next"}>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p>Add the <span className="whitespace-nowrap">no-fomo</span> extension to Chrome.</p>
            <a
              href={STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setAdded(true)}
              className={buttonClass(step === 2 ? "primary" : "secondary")}
            >
              <Icon icon={ChromeIcon} />
              Add to Chrome
            </a>
          </div>
        </Step>

        <Step n={3} state={step === 3 ? "now" : "next"}>
          <p>Log in to Instagram in Chrome, then press <b className="font-semibold">Sync</b> in <span className="whitespace-nowrap">no-fomo</span>.</p>
        </Step>
      </ol>

      <p className="mt-4 border-t border-line pt-4 text-[13px] leading-relaxed text-muted">
        Free and open source. Needs a Mac (macOS 11+) or Windows 10+ and Google Chrome. Run the same line again to update.
      </p>
    </section>
  );
}

function Step({ n, state, children }: { n: number; state: "done" | "now" | "next"; children: React.ReactNode }) {
  return (
    <li
      aria-current={state === "now" ? "step" : undefined}
      className={`grid grid-cols-[28px_minmax(0,1fr)] gap-3 rounded-control p-2.5 text-[15px] leading-snug transition-colors duration-300 ease-out-soft ${
        state === "now" ? "bg-accent-soft/60" : ""
      }`}
    >
      <span
        aria-hidden="true"
        className={`mt-[-2px] grid size-7 place-items-center rounded-full font-mono text-[13px] tabular-nums transition-colors duration-300 ${
          state === "done" ? "bg-accent text-accent-ink" : state === "now" ? "border border-accent text-text" : "border border-line text-muted"
        }`}
      >
        {state === "done" ? <Icon icon={Tick02Icon} size={14} /> : n}
      </span>
      <div className={`min-w-0 ${state === "next" ? "text-muted" : ""}`}>{children}</div>
    </li>
  );
}
