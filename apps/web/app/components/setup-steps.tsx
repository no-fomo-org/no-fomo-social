const code = "font-mono";

const STEPS = [
  <>Build the extension with <code className={code}>pnpm ext:build</code>.</>,
  <>Open <code className={code}>chrome://extensions</code>, turn on Developer mode, press Load unpacked, and choose <code className={code}>apps/extension/.output/chrome-mv3</code>.</>,
  <>Log in to instagram.com in this browser.</>,
  <>Come back here and press Sync.</>,
];

/** `inherit`: take text colors from the parent (the brand photo sets cream). */
export function SetupSteps({ tone = "page" }: { tone?: "page" | "inherit" }) {
  const text = tone === "inherit" ? "" : "text-muted [&_code]:text-text";
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
