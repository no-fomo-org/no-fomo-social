import { useEffect, useRef, useState } from "react";
import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "./ui/icon";

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

/** The search box of the current tab. Press "/" anywhere to focus it, Escape to clear or leave it. */
export function SearchBox({ value, onChange, placeholder, label }: { value: string | null; onChange: (q: string | null) => void; placeholder: string; label: string }) {
  const [text, setText] = useState(value ?? "");
  const input = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const sent = useRef<string | null>(value);
  const send = (q: string | null) => {
    sent.current = q;
    onChangeRef.current(q);
  };

  // The URL can change from elsewhere (Back, "Clear all"). Follow it, but never undo our own typing.
  useEffect(() => {
    if (value === sent.current) return;
    sent.current = value;
    setText(value ?? "");
  }, [value]);

  // Search as the user types, but wait for a short pause.
  useEffect(() => {
    const next = text.trim() || null;
    if (next === (value ?? null)) return;
    const timer = setTimeout(() => send(next), 250);
    return () => clearTimeout(timer);
  }, [text, value]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      e.preventDefault();
      input.current?.focus();
      input.current?.select();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function clear() {
    setText("");
    send(null);
    input.current?.focus();
  }

  return (
    <div className="group relative w-full">
      <Icon icon={Search01Icon} size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
      <input
        ref={input}
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          if (text) clear();
          else input.current?.blur();
        }}
        placeholder={placeholder}
        aria-label={label}
        autoComplete="off"
        spellCheck={false}
        className="h-9 w-full rounded-control border border-line bg-surface ps-9 pe-10 text-[14px] text-text transition-colors duration-200 placeholder:text-muted hover:border-accent-line/60 focus-visible:border-accent-line focus-visible:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-search-cancel-button]:hidden"
      />
      {text ? (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          className="absolute end-1 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-[6px] text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
        >
          <Icon icon={Cancel01Icon} size={14} />
        </button>
      ) : (
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 rounded-[5px] border border-line px-1.5 font-mono text-[12px] leading-5 text-muted group-focus-within:hidden"
        >
          /
        </kbd>
      )}
    </div>
  );
}
