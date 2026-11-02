import { EXTENSION_STORE_URL } from "@no-fomo-social/core";

const STEPS = [
  <>
    Add the{" "}
    <a href={EXTENSION_STORE_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-text underline underline-offset-2">
      no-fomo social extension
    </a>{" "}
    to Chrome.
  </>,
  <>Log in to instagram.com in this browser.</>,
  <>Come back here and press Sync.</>,
];

/** `inherit`: take text colors from the parent (the brand photo sets cream). */
export function SetupSteps({ tone = "page" }: { tone?: "page" | "inherit" }) {
  const text = tone === "inherit" ? "[&_a]:text-inherit" : "text-muted";
  return (
    <ol className={`mt-4 grid max-w-[60ch] gap-2.5 text-[15px] leading-relaxed ${text}`}>
      {STEPS.map((step, i) => (
        <li key={i} className="grid grid-cols-[1.5rem_1fr]">
          <span className="font-mono tabular-nums" aria-hidden="true">{i + 1}.</span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}
