const STEPS = [
  <>Build the extension with <code className="font-mono text-text">pnpm ext:build</code>.</>,
  <>Open <code className="font-mono text-text">chrome://extensions</code>, turn on Developer mode, press Load unpacked, and choose <code className="font-mono text-text">apps/extension/.output/chrome-mv3</code>.</>,
  <>Log in to instagram.com in this browser.</>,
  <>Come back here and press Sync.</>,
];

export function SetupSteps() {
  return (
    <ol className="mt-4 grid max-w-[60ch] gap-2.5 text-[15px] leading-relaxed text-muted">
      {STEPS.map((step, i) => (
        <li key={i} className="grid grid-cols-[1.5rem_1fr]">
          <span className="font-mono tabular-nums text-muted" aria-hidden="true">{i + 1}.</span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}
