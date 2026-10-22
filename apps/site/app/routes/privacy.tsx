import type { ReactNode } from "react";
import { LogoLockup } from "../components/logo";
import { GITHUB_URL } from "../lib/site";

export const meta = () => [
  { title: "Privacy: no-fomo" },
  { name: "description", content: "What no-fomo, its Chrome extension and this website do with your data." },
];

const UPDATED = "7 October 2026";

export default function Privacy() {
  return (
    <>
      <header className="border-b border-line">
        <nav aria-label="Main" className="mx-auto flex h-16 max-w-[760px] items-center px-4 md:px-6">
          <a href="/" className="rounded-control focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
            <LogoLockup />
          </a>
        </nav>
      </header>
      <main className="mx-auto max-w-[760px] px-4 pb-24 pt-14 md:px-6">
        <h1 className="font-display text-[40px] font-extrabold leading-[1.1] tracking-[-0.01em]">Privacy</h1>
        <p className="mt-3 text-[13px] text-muted">Last updated {UPDATED}</p>
        <p className="mt-8 text-[17px] leading-relaxed">
          Short version: the no-fomo app and its Chrome extension run on your computer, and we never receive your Instagram data. This website keeps only what you send us in a form.
        </p>

        <Part title="The no-fomo app">
          <p>The app runs on your own computer. Your library, posts, reports and settings are stored in a folder on your computer (<code className="font-mono text-[13px]">~/.no-fomo</code>). We have no server that receives them.</p>
          <p>When you make a report, the app sends the post's frames, audio and caption to OpenAI with your own API key. OpenAI's privacy policy covers that data. Your key is stored encrypted on your computer and is sent only to OpenAI.</p>
          <p>The app talks to Instagram only when you press a button, using your own Instagram login.</p>
        </Part>

        <Part title="The Chrome extension">
          <p>The extension reads your saved posts and the accounts you open from instagram.com, using your own login, and passes them only to the no-fomo app on your computer (localhost). It sends nothing to us or to anyone else.</p>
          <p>It stores its own settings and Instagram request limits in Chrome's local storage. It does not track the websites you visit and does not sell or share any data.</p>
        </Part>

        <Part title="This website">
          <p><b className="font-semibold">Contact form.</b> We keep your name, email and message to answer you, and send a copy to our inbox. We delete messages after 24 months, or sooner if you ask.</p>
          <p><b className="font-semibold">Notify me.</b> We keep your email to write to you when new report types are ready. You can ask us to remove it at any time.</p>
          <p><b className="font-semibold">Spam check.</b> Forms use Cloudflare Turnstile to check that a person sends them. Turnstile does not use cookies for advertising.</p>
          <p><b className="font-semibold">Hosting and stats.</b> The site runs on Cloudflare. We may use Cloudflare Web Analytics, which counts visits without cookies and without tracking you across sites.</p>
          <p>We do not sell your data, and we do not use advertising trackers.</p>
        </Part>

        <Part title="Your rights">
          <p>You can ask what we keep about you, and ask us to correct or delete it. Write to us through the <a href="/#contact" className="underline">contact form</a>, and we answer within 30 days.</p>
        </Part>

        <Part title="Changes">
          <p>If this policy changes, we update this page and the date at the top. The code of the app and extension is public on <a href={GITHUB_URL} className="underline">GitHub</a>, so anyone can check what they do.</p>
        </Part>
      </main>
    </>
  );
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-12 border-t border-line pt-8">
      <h2 className="text-[20px] font-semibold">{title}</h2>
      <div className="mt-4 grid max-w-[65ch] gap-4 text-[15px] leading-relaxed text-text/90">{children}</div>
    </section>
  );
}
