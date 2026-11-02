# Security review, 2026-11-02

Final review before the code goes public. Scope, in order: the install surface (`scripts/install/`, `scripts/release/build-bundle.mjs`, `.github/workflows/`), what changed since the 2026-10-22 review, the server HTTP surface, key store, media and ffmpeg paths, the extension, the web app, and the git history. Method: every file in scope was read; each claim of the previous review was checked again against the current code instead of being carried over; every candidate finding was verified against the code and dropped when it could not be confirmed. `pnpm audit` ran for the production and the full tree.

Since the last review (`git diff 28aa45c..HEAD --stat`, 33 files) git has: web-only fixes for the Impeccable audit (`92b7bd4`, no new HTML, link or fetch code), a bash 3.2 fix in `scripts/install/install.sh:42-44` (`c66b86f`, same checks as before), the release runbook `docs/RELEASE.md`, a contact form instead of an email placeholder in SECURITY.md, and `eval-cases.json` without account names. The dependency bumps were already in at `28aa45c`.

**Result: no Critical and no Important findings.** Two Medium and eight Low items are below. One Medium is new: the OpenAI key follows an `OPENAI_BASE_URL` environment variable instead of always going to OpenAI. The other Medium is the open half of last review's M1. Items marked *fixed* are in the `release-prep` branch.

Severity words: **Critical** = remote takeover or key theft; **Important** = another website or user gets at the library or the Instagram session; **Medium** = needs a local foothold or leaks only a small signal; **Low** = hardening with no known attack.

## Medium

### M1. The OpenAI key follows `OPENAI_BASE_URL` from the environment — *fixed*

- Where: `apps/server/src/analyze/provider.ts:47` (`createOpenAI({ apiKey })`, no `baseURL`); `@ai-sdk/openai` reads `process.env.OPENAI_BASE_URL` when `baseURL` is not given (`dist/index.js:9850-9853` of version 4.0.83, through `loadOptionalSetting`).
- What happens: the rule is that the key goes only to OpenAI. The model check in `apps/server/src/analyze/models.ts:4` uses a fixed `https://api.openai.com/v1/models`, but every report and transcription call goes to whatever `OPENAI_BASE_URL` says. Anyone who can set that variable for the server process (another tool's proxy setting in the user's shell profile, a Windows user environment variable, a program that edits them) receives the key with every analysis. Launched from Launchpad or the Start Menu the app inherits little, but `no-fomo-social start` from a terminal inherits the whole shell environment. Needs a foothold on the machine, so Medium; the fix takes a minute.
- Fix: `createOpenAI({ apiKey, baseURL: "https://api.openai.com/v1" })` in `provider.ts:47`. Add a test in `apps/server/test/provider.test.ts` that sets `process.env.OPENAI_BASE_URL = "https://evil.example"` and checks the request URL through an injected `fetch` still starts with `https://api.openai.com/`.

### M2. A local program can still stand in for the app on `localhost:4747` while the app is not running — *carried over, open*

- Where: `apps/extension/src/origins.ts:9` and `apps/extension/src/external.ts:66` (the extension trusts the app by origin alone); `apps/extension/entrypoints/instagram.content.ts:49` (the call log and relay go to whatever `serverUrl` the trusted page sent); `scripts/install/launcher/no-fomo-social.sh:16-18` and `no-fomo-social.ps1:17-22` (`running()` accepts anything on the port that answers `/api/config` with `extensionId`, then opens the browser on it).
- What happens: while the app runs it holds both `127.0.0.1:4747` and `[::1]:4747` (`apps/server/src/main.ts:44,61`), so the window is only when it does not. A program under another account on a shared machine binds the port first; the launcher sees "running" and opens Chrome on it; the extension accepts `sync:start`, `profile:open` and `following:update` from that page and relays saved posts and the following list to it with the user's Instagram session. A program under the user's own account can read `~/.no-fomo-social` directly, which SECURITY.md already says.
- Fix (when a multi-user audience matters): a per-install secret. The server creates a random token in `dataDir` (mode `600`, like `secret` in `key-store.ts:19`) and returns it from `GET /api/config`. The extension stores the first token it sees in `browser.storage.local` (trust on first use) and refuses external messages whose `token` differs (`external.ts:60-70`, add `token` to the message check). Another account cannot read the token because the data folder is `700` (`main.ts:21-22`).

## Low

### L1. Release trust still rests on one GitHub account; some pins are missing — *partly carried over*

- Where: `scripts/install/install.sh:42-50` and `install.ps1:29-36` (SHA256SUMS comes from the same release as the archive); `.github/workflows/release.yml:37` (`curl` of `ffmpeg-9.0.2.tar.xz` with no checksum, then published as a release asset); `release.yml:18-20,51-52,74-75,102-103` and `ci.yml:15-17` (actions pinned by major tag, not commit SHA).
- What happens: the checksum catches a damaged download, not a replaced release; a replaced release needs the GitHub org, which is the same root of trust as the installer script itself fetched from `main`. The ffmpeg source tarball is the one unpinned download in the pipeline; a bad one would ship as "source" without anyone noticing. Tag-pinned actions move when the tag moves.
- Checked and fine: `curl --proto '=https' --tlsv1.2` denies plain HTTP also after a redirect (curl: "protocols denied by --proto are not overridden" by `--proto-redir`); PowerShell forces TLS 1.2; Node, ffmpeg and ffprobe downloads are pinned by SHA-256 in `build-bundle.mjs:28-49`; `pnpm install --frozen-lockfile` runs build scripts only for `better-sqlite3`, `esbuild` and `workerd` (`pnpm-workspace.yaml:4-7`); the lockfile has no git or tarball sources; the release job has `contents: read` until the final draft step; nothing uses `pull_request_target` or secrets beyond `GITHUB_TOKEN`.
- Fix: in `release.yml:37` add `echo "<sha256>  dist/release/ffmpeg-9.0.2.tar.xz" | sha256sum -c` (take the hash from `https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz.sha256`). Add `actions/attest-build-provenance` after `upload-artifact` with `id-token: write` and `attestations: write` on that job only. Pin actions to SHAs; Dependabot already updates them monthly (`.github/dependabot.yml:10-13`).

### L2. Known-vulnerable versions in the server's production tree — none reachable, *fixed*

- Where: `pnpm audit --prod`: 9 advisories (5 high, 4 moderate, 0 critical): `undici` 7.30.0 under `@ai-sdk/provider-utils` (8 advisories, fixed in 7.30.1) and `zod` 4.6.5 (GHSA-mrhx-c7xc-m3w5, fixed in 4.6.6). `pnpm audit` (full tree): 15 (6 high, 8 moderate, 1 low); the extra ones are `vite` 8.3.2 / `launch-editor` in dev tools only.
- What happens: `provider-utils` loads `undici` only in `createSafeNodeFetch` (`dist/index.js:1268-1271`), which serves `downloadBlob` for file parts given as URLs. The server passes frames and audio as bytes (`provider.ts:35`, `inputs.ts`), so that path never runs; in the packaged app `require("undici")` would not even resolve, since `app/node_modules` holds only `better-sqlite3`. The zod issue is memory use on oversized constrained arrays; the only such schema, `KnownQuery` in `app.ts:32-34`, is behind a 3200-character string cap, and bodies are capped at 8 MB (`app.ts:107`).
- Fix: `pnpm update ai @ai-sdk/openai zod` and `pnpm --filter @no-fomo-social/web update vite`, or add to `overrides` in `pnpm-workspace.yaml:9-12`: `undici: ">=7.30.1"`, `zod: ">=4.6.6"`. Run `pnpm audit --prod` before each release.

### L3. macOS launcher `stop` kills whatever has the saved PID — *fixed*

- Where: `scripts/install/launcher/no-fomo-social.sh:51-54` (`kill "$pid"` with no check); the Windows launcher checks `ProcessName -eq 'node'` (`no-fomo-social.ps1:53`).
- What happens: after a crash or reboot the PID in `server.pid` can belong to another process of the same user; `stop`, `restart` and the installer's stop step would kill it.
- Fix: before `kill`, `case "$(ps -p "$pid" -o comm= 2>/dev/null)" in *node*) ;; *) rm -f "$PID_FILE"; return 0 ;; esac`.

### L4. Cross-site protection for `/media` rests on one header; JSON has no `nosniff` — *fixed*

- Where: `apps/server/src/http/security.ts:20` (`Sec-Fetch-Site` check on `/media/*` only); `x-content-type-options: nosniff` is set only on images (`app.ts:223`).
- What happens: the `Sec-Fetch-Site` check does what last review's M2 asked, in every current browser. `Cross-Origin-Resource-Policy` does the same job in a way the browser enforces for every no-cors load, and `nosniff` on JSON stops old script-sniffing tricks. Neither has a known attack today; both are one line.
- Fix: in `security.ts:27-28` also set `cross-origin-resource-policy: same-origin` and `x-content-type-options: nosniff` on every response. The extension fetches with CORS and an allowed Origin, and the dev server proxies `/api` and `/media` (`apps/web/vite.config.ts:11`), so neither is affected. Extend the "forbids framing" test in `apps/server/test/app.test.ts:91`.

### L5. Media links from Instagram are stored and shown without a host check

- Where: `apps/server/src/sync/ingest.ts:65-66,109` (thumbnail, video and part links go into the database as received); `apps/web/app/components/viewer/media-stage.tsx:57,61` (`<video src>` and `<img src>` use them directly). Downloads are checked (`media/store.ts:54`, `analyze/download.ts:13`), browser loads are not.
- What happens: the links come from Instagram's answers, through the extension. A script running on instagram.com could also hand the extension a forged profile page (`instagram-page.content.ts:16`, `instagram.content.ts:36-39`) with a link to its own server, which the app page would then load as an image, giving that server the user's IP. That script already runs on Instagram with the session, so it gains little. Defence in depth only.
- Fix: in `ingest.ts` `upsertPostContent`, replace any `thumbnailUrl`, `videoUrl`, `imageUrl` or `avatarUrl` that fails `isMediaUrl` (import from `../media/store`) with `null`; in `packages/core/src/ig/live.ts` `toLivePost`, drop part links that are not `https:` on `cdninstagram.com` or `fbcdn.net`.

### L6. The extension asks for the `tabs` permission it does not need — *fixed*

- Where: `apps/extension/wxt.config.ts:14` (`permissions: ["tabs", "storage"]`).
- What happens: `tabs` lets the extension read the URL and title of every tab. The code only needs tab URLs on instagram.com (`background.ts:47,69`), which the `https://www.instagram.com/*` host permission already grants; `tabs.create`, `update`, `reload`, `sendMessage` and `onUpdated` need no permission. Fewer permissions means a smaller blast radius if the extension is ever compromised and an easier store review.
- Fix: remove `"tabs"`, build with `pnpm ext:build:dev`, and check that opening an account and `findInstagramTab` still work.

### L7. ffmpeg demuxer is not pinned — *carried over, documented*

- Where: `apps/server/src/analyze/ffmpeg.ts:56-80`.
- What happens: fixed argument lists, no shell, timeouts and stderr caps are in place; ffmpeg still probes the input format itself. The file comes from an Instagram CDN host after the checks above. Unchanged from last review; the trade-off (breaking real posts for a theoretical gain) still holds.
- If wanted: add `-f mp4` for videos and `-protocol_whitelist file` to every call.

### L8. The security reviews are not in git; local tool files are only excluded locally — *fixed*

- Where: `.git/info/exclude:22` lists `docs/audits/`, so `docs/audits/2026-10-22-security-review.md` and this file are untracked (`git ls-files docs/audits` shows only the impeccable audit); SECURITY.md points readers to `docs/audits/`. `.impeccable/hook.cache.json` holds local paths with the user name and is ignored only by `info/exclude`, not by `.gitignore`.
- What happens: on GitHub the folder SECURITY.md links to will not have the security reviews. A clone on another machine has no `info/exclude`, so `git add -A` there would commit the cache file.
- Fix: `git add -f docs/audits/2026-10-22-security-review.md docs/audits/2026-11-02-security-review.md`. Add `.impeccable/hook.cache.json` and `.impeccable/hook.pending.json` to `.gitignore`.

## Checked and clean

- **Installers**: everything runs inside `main()` / one script block, so a cut download does nothing. Temp folders are per-user (`mktemp -d`, `GetTempPath`). Paths with spaces are quoted throughout. macOS `tar` refuses `..` entries and absolute paths by default; the archive is checksum-bound to the release anyway. `update` re-runs the installer from `main` over HTTPS; `uninstall` removes only the app folder, the launcher, the symlink or shortcuts, and the Windows user PATH entry, never the library. The Windows PATH edit adds a folder inside the user profile, as other per-user installs do.
- **Release pipeline**: versions must match the tag; tests run before the bundle; the bundle is installed and uninstalled on real macOS and Windows runners before a draft release is created; publishing stays a manual step.
- **Server HTTP**: Host must be exactly `localhost`, `127.0.0.1` or `[::1]` with the port (`security.ts:4,15`), which stops DNS rebinding; any Origin must be the app, the extension or a dev origin (`:17`); every write needs `application/json` (`:23`), so plain forms cannot post and every cross-origin write gets a preflight; `DELETE /api/posts/:id/report` goes the same way (`api.ts:23-24`); no `Access-Control-Allow-Credentials`. Keys, model list, analyze and delete refuse the extension origin (`app.ts:79,181,185,191,201,203`). Ids are digit-only, run ids integers, cursors and query strings length-capped (`app.ts:27-67`). Every query is parameterised through drizzle; the raw `sql` templates in `queries.ts`, `ingest.ts`, `report-store.ts` and `following.ts` bind values; full-text input keeps only letters and digits (`queries.ts:23-26`); `LIKE` patterns are escaped (`:211`). The static route decodes, resolves and checks the prefix (`app.ts:230-232`); media ids are route-constrained to digits (`:208`). `/api/config` returns only the extension id and version.
- **Key store**: AES-256-GCM, random nonce, 32-byte secret created with `wx` at mode `600`, key file `600`, atomic rename (`key-store.ts:19,47-48`). `GET /api/settings` returns `set` and `last4` only (`settings.ts:23`); the key input pattern is strict (`app.ts:69`). No log line carries the key; the model check sends it only to `https://api.openai.com/v1/models` (`models.ts:4,18`). See M1 for the analysis path.
- **Media and analysis**: `https:` and `cdninstagram.com` / `fbcdn.net` only, `redirect: "error"`, timeouts, 5 MB cap and magic-byte check for thumbnails (`store.ts:24-31,54-59`); 300 MB / 15 MB caps, content-length and streamed byte count for analysis files, written at mode `600` (`download.ts:21-31`); temp folders are `mkdtemp` under the OS temp dir and removed; startup cleans only `no-fomo-` + 6 characters (`analyzer.ts:106-109`). ffmpeg is spawned without a shell with fixed arguments.
- **Extension**: `externally_connectable` and host permissions are the two app origins only (built manifest checked). Every external message is type-checked and pattern-matched before it reaches an Instagram tab (`external.ts:30-58`); `ping` answers before the origin check but reveals only the version. The relay accepts only app origins and `/api/sync/*` on the resolved path with no query or fragment (`relay.ts:8-12`). The MAIN-world script only watches Instagram's own profile-posts query and reposts it to the extension's isolated script on the same page; the replayed request is pinned to `https://www.instagram.com` (`posts-query.ts:23,41`). Instagram page code cannot reach `runtime.onMessage` or the relay.
- **Request gate**: every Instagram call in the extension goes through `gateClient` (`instagram.content.ts:40-45`): saved sync, media refresh, search, account pages and the following update. No other `fetch` to Instagram exists in `packages/core` or `apps/extension`. The limits are unchanged: one call at a time, 3-6 s apart, 150 an hour, stops of 15 min / 1 h / 6 h (`gate.ts:35-37,82`). Opening an account loads Instagram's own page in the hidden tab; that page load is checked against a pause or an empty budget first (`external.ts:81-87`) and the posts read from it is counted.
- **Web app**: no `dangerouslySetInnerHTML` or `innerHTML`; report markdown renders with `skipHtml`, no images, links limited to `http(s)` and opened with `noopener noreferrer` (`report-panel.tsx:181-191`, `report.ts:53`); every external link has `rel="noopener noreferrer"`; thumbnails and avatars load from `/media/...` (`queries.ts:82,152,222`); usernames from the URL or search box are pattern-checked before they reach the extension (`profile-input.ts`, `external.ts:31`). `localStorage` holds only player preferences.
- **Git history and tree**: no API keys, tokens, private keys, `.env` files or dumps in any commit (searched for `sk-`, `api_key`, `sessionid`, `csrftoken`, `ds_user_id`, `Bearer`, `ghp_`, `AKIA`, `BEGIN PRIVATE`, `@gmail`). `csrftoken` and `ds_user_id` appear only as cookie names in code. The only email is the commit author's. The old `apps/site/.wrangler` SQLite files and `wrangler.jsonc` carry no account ids. Fixtures use made-up accounts and fake CDN links (`scontent.cdninstagram.com`, `evil.example`). `extension-id.ts` holds the public key only; the generator never writes the private half (`gen-extension-key.mjs:11-21`). `eval-cases.json` now names two public post ids and two product names, no accounts.

## Before going public

1. Fix M1 (one line plus a test).
2. Replace `EXTENSION_STORE_ID` in `scripts/install/install.sh:15`, `install.ps1:16` and `packages/core/src/constants.ts:4`.
3. Bump `undici`, `zod` and `vite` (L2); run `pnpm audit --prod`.
4. Track the audit files (L8) so the SECURITY.md link works.
5. Pin the ffmpeg source download (L1); consider the attestation step.
6. Decide M2 for a shared-machine audience; a single-user machine can wait.
