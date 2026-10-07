import { GithubIcon } from "@hugeicons/core-free-icons";
import type { ReactNode } from "react";
import { buttonClass } from "../components/button";
import { ContactForm, NotifyForm } from "../components/forms";
import { Icon } from "../components/icon";
import { InstallSheet } from "../components/install-sheet";
import { LogoLockup, LogoSymbol } from "../components/logo";
import { cloudflareContext } from "../lib/context";
import { handleForm } from "../lib/forms.server";
import { GITHUB_URL, guessOs } from "../lib/site";
import type { Route } from "./+types/home";

const TITLE = "no-fomo: research what works in your niche";
const DESCRIPTION =
  "no-fomo watches Instagram reels for you and turns them into notes, steps and ideas. Free, open source, and it runs on your computer.";

export const meta: Route.MetaFunction = ({ loaderData }) => [
  { title: TITLE },
  { name: "description", content: DESCRIPTION },
  { property: "og:title", content: TITLE },
  { property: "og:description", content: DESCRIPTION },
  { property: "og:type", content: "website" },
  { property: "og:image", content: `${loaderData?.origin ?? ""}/og.jpg` },
  { name: "twitter:card", content: "summary_large_image" },
];

/** Outfit 800 section titles: the display face, one step below the hero. */
const SECTION_TITLE = "text-balance font-display text-[32px] font-extrabold leading-[1.08] tracking-[-0.015em] md:text-[44px]";

export function loader({ request, context }: Route.LoaderArgs) {
  return {
    origin: new URL(request.url).origin,
    os: guessOs(request.headers.get("user-agent")),
    siteKey: context.get(cloudflareContext).env.TURNSTILE_SITE_KEY,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { env, ctx } = context.get(cloudflareContext);
  return handleForm(request, env, ctx);
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { origin, os, siteKey } = loaderData;
  return (
    <>
      <Hero origin={origin} os={os} />
      <main>
        <SeeIt />
        <ForWhom />
        <ComingNext siteKey={siteKey} />
        <Trust />
        <Faq />
        <Contact siteKey={siteKey} />
      </main>
      <Footer />
    </>
  );
}

/* ---------- First viewport: the photo with the installer on it ---------- */

const WIDE = [960, 1600, 2560, 3840].map((w) => `/brand/hero-clean-${w}.webp ${w}w`).join(", ");

function Hero({ origin, os }: { origin: string; os: "mac" | "windows" }) {
  return (
    <header className="relative isolate md:min-h-[min(100svh,920px)]">
      {/* Sage holds the place of the photo while it loads. */}
      <div aria-hidden="true" className="absolute inset-0 -z-20 bg-sage max-md:h-[min(133vw,720px)]" />
      <img
        src="/brand/hero-clean-1600.webp"
        srcSet={WIDE}
        sizes="100vw"
        alt=""
        fetchPriority="high"
        className="fl-photo absolute inset-0 -z-10 size-full object-cover object-[center_38%] max-md:h-[min(133vw,720px)] max-md:object-[58%_center]"
      />
      {/* Keeps cream text readable on the bright sky and the dark ridges. */}
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,rgb(20_28_22/0.62),rgb(20_28_22/0.12)_55%,rgb(20_28_22/0.25))] max-md:h-[min(133vw,720px)]" />

      <nav aria-label="Main" className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-4 md:px-6">
        <a href="/" className="rounded-control focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cream">
          <LogoLockup tone="cream" />
        </a>
        <div className="flex items-center gap-1">
          <a href="#contact" className={buttonClass("cream")}>Contact</a>
          <a href={GITHUB_URL} className={buttonClass("cream")}>
            <Icon icon={GithubIcon} />
            GitHub
          </a>
        </div>
      </nav>

      <div className="mx-auto grid max-w-[1280px] grid-cols-[minmax(0,1fr)] gap-8 px-4 pb-10 md:min-h-[calc(min(100svh,920px)-4rem)] md:grid-cols-[1fr_minmax(0,500px)] md:items-end md:px-6 md:pb-14 lg:gap-16">
        <div className="flex min-h-[calc(min(133vw,720px)-4rem)] flex-col justify-end pb-2 md:min-h-0 md:pb-3">
          <h1 className="max-w-[12ch] text-balance font-display text-[44px] font-extrabold leading-[1.02] tracking-[-0.02em] text-cream sm:text-[56px] lg:text-[72px]">
            Research what works in your niche.
          </h1>
          <p className="mt-5 max-w-[44ch] text-[17px] leading-relaxed text-cream/90 md:text-[18px]">
            AI watches the reels for you and turns them into notes, steps and ideas.
          </p>
        </div>
        <InstallSheet id="install" origin={origin} initialOs={os} />
      </div>
    </header>
  );
}

/* ---------- Proof: the real app on demo data ---------- */

/**
 * A real app screen on demo data. Phones get a tighter crop of the same screen, so the text stays readable.
 * `size`: the desktop image's pixel size, `phone`: the phone crop's, so the page keeps its space while images load.
 */
function Shot({ name, alt, size, phone }: { name: string; alt: string; size: [number, number]; phone: [number, number] }) {
  const set = (t: "light" | "dark") => `/screens/${name}-${t}-900.webp 900w, /screens/${name}-${t}-1600.webp 1600w`;
  const PHONE = "(max-width: 767px)";
  return (
    <picture>
      <source media={`${PHONE} and (prefers-color-scheme: dark)`} srcSet={`/screens/${name}-dark-phone.webp`} width={phone[0]} height={phone[1]} />
      <source media={PHONE} srcSet={`/screens/${name}-light-phone.webp`} width={phone[0]} height={phone[1]} />
      <source media="(prefers-color-scheme: dark)" srcSet={set("dark")} sizes="(min-width: 1024px) 760px, 100vw" />
      <img
        src={`/screens/${name}-light-1600.webp`}
        srcSet={set("light")}
        sizes="(min-width: 1024px) 760px, 100vw"
        alt={alt}
        loading="lazy"
        decoding="async"
        width={size[0]}
        height={size[1]}
        className="block h-auto w-full rounded-sheet border border-line bg-surface-2"
      />
    </picture>
  );
}

const FEATURES: Array<{ title: string; text: string }> = [
  {
    title: "A report on any reel",
    text: "Summary, key points, steps, everything shown on screen, and the full transcript. Download it as Markdown and take it to ChatGPT, Claude or your notes.",
  },
  {
    title: "Study any account",
    text: "Open a creator or a competitor, see their posts, and get reports on the ones that matter. Learn what they teach without watching for hours.",
  },
  {
    title: "Your saved posts, in order",
    text: "Everything you saved on Instagram, with filters by author, collection and type, and a real video player.",
  },
];

function SeeIt() {
  return (
    <section id="see-it" aria-labelledby="see-it-title" className="mx-auto max-w-[1280px] px-4 py-20 md:px-6 md:py-28">
      <h2 id="see-it-title" className={`max-w-[18ch] ${SECTION_TITLE}`}>
        Let AI watch the reels. You keep what matters.
      </h2>
      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:gap-14">
        <figure>
          <Shot name="viewer-report" size={[1600, 1310]} phone={[760, 1516]} alt="A reel open in no-fomo with its report: summary, key points and steps." />
          <figcaption className="mt-3 text-[13px] text-muted">The report on a reel. Demo data: the accounts and posts are made up.</figcaption>
        </figure>
        <dl className="divide-y divide-line border-y border-line self-start">
          {FEATURES.map((f) => (
            <div key={f.title} className="py-6">
              <dt className="text-[17px] font-semibold">{f.title}</dt>
              <dd className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-muted">{f.text}</dd>
            </div>
          ))}
        </dl>
      </div>
      <figure className="mt-14">
        <Shot name="saved" size={[1600, 1078]} phone={[780, 590]} alt="The no-fomo library: a grid of saved reels with filters by author, collection and type." />
        <figcaption className="mt-3 text-[13px] text-muted">Your saved posts in one grid. Demo data.</figcaption>
      </figure>
    </section>
  );
}

/* ---------- Audience ---------- */

const PEOPLE: Array<{ who: string; what: string }> = [
  { who: "Business owners", what: "See what works for others in your field, then plan your own reels with it." },
  { who: "Bloggers", what: "Collect hooks, formats and ideas from creators you admire, in one place." },
  { who: "Coaches and experts", what: "Turn long talks and lessons into notes and steps you can come back to." },
  { who: "Marketers and SMM", what: "Research a client's niche without watching every reel yourself." },
];

function ForWhom() {
  return (
    <section aria-labelledby="for-whom-title" className="border-y border-line bg-paper">
      <div className="mx-auto max-w-[1280px] px-4 py-20 md:px-6 md:py-24">
        <div>
          <h2 id="for-whom-title" className={`max-w-[22ch] ${SECTION_TITLE}`}>
            Made for people who make content.
          </h2>
          <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-muted">
            If you post on Instagram for your work, no-fomo helps you learn from the best of it, faster.
          </p>
        </div>
        <ul className="mt-12 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-4">
          {PEOPLE.map((p) => (
            <li key={p.who} className="border-t border-line pb-2 pt-6">
              <h3 className="text-[17px] font-semibold">{p.who}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">{p.what}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------- Roadmap with a way to hear about it ---------- */

const NEXT: Array<{ title: string; text: string }> = [
  { title: "Virality analysis", text: "Which reels did far better than the account's usual, and what they have in common." },
  { title: "Hook analysis", text: "The first seconds of many reels side by side, so you see which openings hold people." },
];

function ComingNext({ siteKey }: { siteKey: string }) {
  return (
    <section aria-labelledby="next-title" className="mx-auto max-w-[1280px] px-4 py-20 md:px-6 md:py-28">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div>
          <h2 id="next-title" className={`max-w-[14ch] ${SECTION_TITLE}`}>
            More reports are coming.
          </h2>
          <p className="mt-4 max-w-[40ch] text-[15px] leading-relaxed text-muted">We are working on these next. Plans can change.</p>
        </div>
        <div>
          <ul className="divide-y divide-line border-y border-line">
            {NEXT.map((n) => (
              <li key={n.title} className="py-5">
                <h3 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[17px] font-semibold">
                  {n.title}
                  <span className="rounded-tile bg-dawn px-1.5 py-0.5 text-[12px] font-medium text-forest">Planned</span>
                </h3>
                <p className="mt-1.5 max-w-[60ch] text-[15px] leading-relaxed text-muted">{n.text}</p>
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <NotifyForm siteKey={siteKey} />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Privacy and account safety ---------- */

function Trust() {
  return (
    <section aria-labelledby="trust-title" className="relative isolate overflow-hidden bg-forest text-cream">
      <img src="/brand/hero-clean-1600.webp" alt="" loading="lazy" className="absolute inset-0 -z-10 size-full object-cover object-bottom opacity-25" />
      <div className="mx-auto max-w-[1280px] px-4 py-20 md:px-6 md:py-24">
        <h2 id="trust-title" className={`max-w-[18ch] ${SECTION_TITLE}`}>
          Your data stays on your computer.
        </h2>
        <div className="mt-10 grid gap-10 md:grid-cols-3">
          <TrustPoint title="Runs on your computer">
            Your library lives in a folder on your computer. We have no server that sees your posts, your reports or your account.
          </TrustPoint>
          <TrustPoint title="Careful with Instagram">
            no-fomo uses your own Instagram login, like the website does. It makes one request at a time, at most 150 an hour, and pauses when Instagram asks.
            This is not an official Instagram API, so there is a small risk. Use it at your own risk.
          </TrustPoint>
          <TrustPoint title="You bring the AI key">
            Reports use your own OpenAI key. It is stored encrypted on your computer and is sent only to OpenAI. A report usually costs a few cents.
          </TrustPoint>
        </div>
      </div>
    </section>
  );
}

function TrustPoint({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-cream/25 pt-5">
      <h3 className="text-[17px] font-semibold">{title}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-cream/80">{children}</p>
    </div>
  );
}

/* ---------- FAQ ---------- */

const FAQ: Array<{ q: string; a: ReactNode }> = [
  { q: "Is it free?", a: "Yes. no-fomo is free and open source under the MIT license. You only pay OpenAI for the reports you make, usually a few cents each." },
  { q: "Do I need to know how to code?", a: "No. You paste one line into Terminal (Mac) or PowerShell (Windows), and the installer does the rest. After that, open no-fomo like any other app." },
  { q: "Can my Instagram account get blocked?", a: "no-fomo is slow on purpose to keep your account safe, and it stops when Instagram pushes back. Still, it is not an official API, so we cannot promise there is no risk." },
  { q: "Why do I need an OpenAI key?", a: "The AI that watches the reels runs at OpenAI, and the key lets no-fomo use it on your behalf. You can get a key at platform.openai.com." },
  { q: "Does it work on my phone?", a: "Not yet. no-fomo runs on a Mac or Windows computer with Google Chrome." },
  {
    q: "How do I update or remove it?",
    a: (
      <>
        Run the same install line again to update. To remove it, run <code className="font-mono text-[13px]">no-fomo uninstall</code>. Your library stays until you delete its folder.
      </>
    ),
  },
];

function Faq() {
  return (
    <section aria-labelledby="faq-title" className="mx-auto max-w-[1280px] px-4 py-20 md:px-6 md:py-28">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <h2 id="faq-title" className={SECTION_TITLE}>Questions</h2>
        <div className="divide-y divide-line border-y border-line">
          {FAQ.map((f) => (
            <details key={f.q} className="group">
              <summary className="flex cursor-pointer items-center justify-between gap-4 rounded-control py-5 text-[17px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                {f.q}
                <span aria-hidden="true" className="relative size-4 shrink-0 text-muted">
                  <span className="absolute inset-x-0 top-1/2 h-[1.5px] -translate-y-1/2 bg-current" />
                  <span className="absolute inset-y-0 left-1/2 w-[1.5px] -translate-x-1/2 bg-current transition-transform duration-200 ease-out-soft group-open:scale-y-0" />
                </span>
              </summary>
              <p className="max-w-[62ch] pb-6 text-[15px] leading-relaxed text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Contact ---------- */

function Contact({ siteKey }: { siteKey: string }) {
  return (
    <section id="contact" aria-labelledby="contact-title" className="border-t border-line bg-paper">
      <div className="mx-auto grid max-w-[1280px] gap-10 px-4 py-20 md:px-6 md:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div>
          <h2 id="contact-title" className={SECTION_TITLE}>Write to us</h2>
          <p className="mt-4 max-w-[40ch] text-[15px] leading-relaxed text-muted">
            Questions, ideas, or help with the install. For bugs, you can also{" "}
            <a href={`${GITHUB_URL}/issues`} className="text-text underline">open an issue on GitHub</a>.
          </p>
        </div>
        <ContactForm siteKey={siteKey} />
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mx-auto flex max-w-[1280px] flex-col gap-6 px-4 py-10 text-[13px] text-muted md:flex-row md:items-center md:justify-between md:px-6">
      <div className="flex items-center gap-3">
        <LogoSymbol size={20} className="text-accent" />
        <span>no-fomo is open source under the MIT license.</span>
      </div>
      <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
        <a href={GITHUB_URL} className="hover:text-text">GitHub</a>
        <a href="/privacy" className="hover:text-text">Privacy</a>
        <a href="#contact" className="hover:text-text">Contact</a>
      </nav>
      <p className="md:max-w-[34ch] md:text-right">Not affiliated with Instagram or Meta. Instagram is a trademark of Meta Platforms, Inc.</p>
    </footer>
  );
}
