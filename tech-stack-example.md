# Frontend tech stack: setup template

*5 October 2026. A general guide to start a new frontend project with the same stack and AI tools as oasis. No brand details (colors, fonts, logo): each project sets its own in `DESIGN.md` and `app/app.css`. The full oasis version is in `docs/oasis-techstack.md`.*

---

## 1. Stack

| Part | Choice |
|---|---|
| Framework | **React Router v8** (framework mode, SSR, TypeScript) |
| Build | **Vite** + `@cloudflare/vite-plugin` (local dev runs in the real Workers runtime) |
| Styling | **Tailwind v4** (`@tailwindcss/vite`, no config file) + `tw-animate-css` |
| Components | **shadcn/ui** on **Base UI** (`@base-ui/react`), `class-variance-authority` |
| Icons | **Hugeicons** (`@hugeicons/react`, `@hugeicons/core-free-icons`) |
| Languages | **remix-i18next** + i18next + react-i18next. Text in `app/locales/<lang>/` |
| UI animation | **Motion** |
| Scroll animation | **GSAP + ScrollTrigger** (`@gsap/react`) |
| Smooth scrolling | **Lenis** |
| Database, files, login | **Supabase** (hosted), with `@supabase/ssr` + `@supabase/supabase-js` |
| Database changes | **Supabase CLI**: migrations in `supabase/migrations/`, local database in Docker, generated TypeScript types |
| Hosting | **Cloudflare Workers** (official React Router template), Wrangler |
| Preview links | **Worker Previews**: each pushed branch gets its own link |
| Code | **GitHub**, connected to the Worker (Workers Builds) |

---

## 2. Architecture

- **One repository, one Worker.** `workers/app.ts` is the entry; it hands requests to React Router.
- **Loaders** read data on the server before a page shows. **Actions** handle forms on the server. **Resource routes** return data only (files, JSON).
- Server-only code lives in files ending with `.server.ts`. It never reaches the browser.
- **Languages:** the language comes from the URL only (main language without prefix, others as `/ru`, `/en`, …). Every page sets `<html lang dir>`. Interface text in `app/locales/`, database text in one column per language (`name_he`, `name_en`, …).

**Folders:**
| Folder | What is in it |
|---|---|
| `app/routes/` | Pages and resource routes |
| `app/components/` | Site components. `ui/` = shadcn components |
| `app/lib/` | Helpers (price, i18n, Supabase, GSAP, Lenis, server code) |
| `app/locales/` | Interface text, one folder per language |
| `app/middleware/` | Language middleware |
| `supabase/` | `config.toml`, migrations, `seed.sql` |
| `docs/` | Tech stack and release documents |

**Security rules:**
1. Secret keys only as Cloudflare secrets. Never in frontend code or committed files.
2. Local secrets in `.dev.vars` (never committed). `.dev.vars.example` lists every key.
3. Row Level Security on every Supabase table. The browser uses only the anon key.
4. Prices, totals and stock are always checked on the server.

---

## 3. AI tools

### 3.1 Skills inside the project (`.claude/skills/`, committed)

| Skill | What it does |
|---|---|
| **Impeccable** | Design commands: `/impeccable init`, `audit` (a11y, performance, responsive), `critique`, `polish` and more. Adds design hooks and subagents |
| **Taste Skill** | Design standards for layout, type, motion and spacing, so the AI avoids generic "AI-looking" UI |
| **Emil Kowalski's skills** | Animation and UI polish: `animate`, `review-animations`, `improve-animations`, `emil-design-eng` and more |
| **GSAP skills** (official) | Core, timeline, ScrollTrigger, React, plugins, performance |
| **shadcn skills** (official) | Adds and fixes shadcn components; moves Radix components to Base UI |
| **Checklist Design** | `/checklist-design audit`: checks a page (product, cart, checkout) against a checklist |
| **agent-browser** (Vercel) | Claude opens the site, clicks, takes screenshots and checks its own work |
| **React Router** | Routes, loaders, actions, middleware. Comes with the Cloudflare template |

`skills-lock.json` records the source and version of each skill.

### 3.2 Global skills and plugins (once per computer, for every project)

| Tool | What it does |
|---|---|
| **Supabase skills** | `supabase` (auth, RLS, storage, CLI) and `supabase-postgres-best-practices` |
| **find-skills** | Finds and installs a skill for a new kind of task |
| **Cloudflare plugin** | `workers-best-practices`, `wrangler`, `web-perf` (Core Web Vitals) and more, plus Cloudflare docs |
| **skill-creator** | Write or improve your own skills |
| **watch** | Watches a reference video (frames, transcript) |

### 3.3 MCP servers and connectors

| Tool | What it does | Where it is set |
|---|---|---|
| **Supabase MCP** | Claude reads tables, runs SQL, applies migrations, reads logs and security advice | `.mcp.json` in the project |
| **Higgsfield** | Product images, mockups, marketing images and video | claude.ai connector |
| **Google Drive, Claude Docs** | Shared documents | claude.ai connectors |

### 3.4 Built-in Claude Code commands

- `/init`: first `CLAUDE.md` for a new project.
- `/security-review`: security check before commit and deploy.
- `/code-review`: bug review of a branch or PR.

### 3.5 How to use them together

- Design opinion: `/impeccable critique`. Checklist: `/checklist-design audit`. Type the full command.
- Impeccable and Taste Skill both give design rules. If they disagree, `DESIGN.md` wins.
- After UI changes: agent-browser in every language, desktop and phone.
- Before commit: `/security-review` and `/impeccable audit`.
- Before launch and after big UI changes: `cloudflare:web-perf`.

---

## 4. Setup, step by step

### 4.1 Once per computer
- Install **Node.js** (LTS), **Git**, **Docker Desktop** (local Supabase), **ffmpeg** (for the watch plugin).
- Install **Claude Code** (terminal or VS Code extension).
- Create accounts: Cloudflare, Supabase, GitHub.
- Global AI tools:
  ```
  npm install -g agent-browser
  agent-browser install
  npx skills add supabase/agent-skills -g
  npx skills add vercel-labs/skills --skill find-skills -g
  ```
  Inside Claude Code:
  ```
  /plugin marketplace add cloudflare/skills
  /plugin install cloudflare@cloudflare
  /plugin install skill-creator@claude-plugins-official
  /plugin marketplace add taoufik123-collab/claude-watch
  /plugin install watch@claude-watch
  ```
- claude.ai connectors (Higgsfield, Google Drive, Claude Docs): turn on in claude.ai → Settings → Connectors.

### 4.2 Create the project
```
npm create cloudflare@latest -- my-project --framework=react-router
cd my-project
npx shadcn@latest init
npm install motion gsap @gsap/react lenis @supabase/supabase-js @supabase/ssr
npm install remix-i18next i18next react-i18next i18next-browser-languagedetector i18next-fetch-backend
npm install -D supabase
npx supabase init
npm audit
```
- For `shadcn init`: choose **Base UI**, a style, and icon library **Hugeicons**.
- **Right-to-left language** (Hebrew, Arabic)? Use `npx shadcn@latest init --rtl`, then `npx shadcn@latest add direction`. Use only direction-safe Tailwind classes (`ms-`, `pe-`, `start-`, `text-start`, …).
- Add fonts with `@fontsource` packages (per project).

Add these scripts to `package.json`:
```json
"db:start": "supabase start",
"db:reset": "supabase db reset",
"db:types": "supabase gen types typescript --local > app/lib/database.types.ts"
```

### 4.3 Install the AI tools (inside the project folder)
```
npx impeccable install
npx skills add https://github.com/Leonxlnx/taste-skill --skill design-taste-frontend
npx skills add emilkowalski/skill
npx skills add https://github.com/greensock/gsap-skills
npx skills add shadcn/ui
npx skills add checklist-design/skills --skill checklist-design
npx skills add vercel-labs/agent-browser
```
- **Impeccable:** choose Claude Code, install into the current project, say yes to the hook. Add Impeccable's `.gitignore` block (README, "Keeping .impeccable out of git"). Update later with `npx impeccable update`.
- **Taste Skill:** `design-taste-frontend` is the main skill. The repo has other styles too (`high-end-visual-design`, `minimalist-ui`, `redesign-existing-projects`, …). To see all and choose, run the command without `--skill`.
- **Supabase MCP:** add `.mcp.json` with the project's `project_ref` (Supabase dashboard → Connect → MCP), then turn it on in Claude Code with `/mcp`:
  ```json
  {
    "mcpServers": {
      "supabase": {
        "type": "http",
        "url": "https://mcp.supabase.com/mcp?project_ref=<PROJECT_REF>"
      }
    }
  }
  ```

### 4.4 Project documents
| File | What it is | How it is made |
|---|---|---|
| `CLAUDE.md` | Rules for Claude: stack, brand, languages, security, checks, deploy | Start with `/init`, then edit by hand |
| `DESIGN.md` | Brand rules: colors, fonts, spacing, motion, tone | By hand |
| `PRODUCT.md` | Product, audience, voice | `/impeccable init` |
| `PLAN.md` | Current work, with checkboxes | Claude updates it |
| `docs/<project>-techstack.md` | Tech decisions | By hand |

From the oasis `CLAUDE.md`, the sections **Security and performance**, **Checks** and **Deploy** fit any project. Change only the language list.

### 4.5 Secrets, previews and deploy
- **Local:** copy `.dev.vars.example` to `.dev.vars` and fill it in.
- **Secrets:** `npx wrangler secret put <NAME>`, or the Cloudflare dashboard (Worker → Settings → Variables, type "Secret", for Production and Previews).
- **Plain values** (not secret): in `wrangler.jsonc` under `vars` and `previews.vars`. A plain value added only in the dashboard is erased on deploy.
- **`wrangler.jsonc`:** turn on `observability`, `upload_source_maps` and `preview_urls`.
- **Domain:** `routes` in `wrangler.jsonc` with `custom_domain: true`.
- **Previews:** connect the GitHub repo to the Worker (Workers Builds).

### 4.6 Daily commands
```
npm run dev          # local site
npm run typecheck    # types check
npm run db:start     # local Supabase (Docker)
npm run db:reset     # rebuild local database from migrations + seed
npm run db:types     # new TypeScript types after a migration
npm run deploy       # build and deploy
```

---

## 5. Files worth copying from oasis

- `.gitignore`, `.dev.vars.example` (keep only the keys you need), `wrangler.jsonc` settings.
- Helpers: `app/lib/supabase.server.ts`, `app/lib/cloudflare.server.ts`, `app/lib/price.ts`, `app/lib/i18n.ts`, `app/middleware/i18next.ts`, `app/lib/gsap.ts`, `app/lib/smooth-scroll.ts`, `app/components/language-switcher.tsx`.

**Change for each project:** `DESIGN.md`, `PRODUCT.md`, `PLAN.md`, colors and fonts in `app/app.css`, language list, `.mcp.json` (`project_ref`), `wrangler.jsonc` (name, domain, `vars`).
