# Releasing no-fomo-social 0.1.0

The maintainer's runbook for the first public release. Written 2026-11-02. Do the phases in order: each one needs the one before it. After 0.1.0, only the "Every release" section at the end applies.

## Where things stand (2026-11-02)

Done:

- Code is complete for 0.1.0. `pnpm test` (383 tests) and `pnpm typecheck` pass. CI is green on `main`.
- Security: the 2026-10-22 review is fixed and merged. A second, independent review ran on 2026-11-02 ([docs/audits/2026-11-02-security-review.md](audits/2026-11-02-security-review.md)): no Critical or Important findings; of its 2 Medium and 8 Low items, 6 are fixed in this branch (the OpenAI base URL pin, response headers, launcher stop check, the `tabs` permission, dependency advisories, untracked audit files). `pnpm audit --prod` reports no known vulnerabilities.
- UI: every item from the 2026-10-22 Impeccable audit is fixed except the store link, which needs the real store id (below).
- Release pipeline: `.github/workflows/release.yml` builds the Mac (arm64, x64) and Windows bundles, installs each on a real GitHub runner, checks that the server answers, uninstalls, then drafts a GitHub Release with every file and its SHA-256. **It has never run yet.**
- Install script: tested by hand on this Mac from a local bundle (install, server answers on `localhost:4747` and `[::1]:4747`, Host and Origin checks refuse other sites, uninstall leaves nothing behind). One real bug was found and fixed on the way: macOS ships bash 3.2, where the installer crashed on an empty option array.
- Extension: `pnpm ext:zip` builds a clean store package (Manifest V3, no `key`, four icons, 17 KB).
- Website: https://no-fomo.ai is live, with `/social`, `/privacy`, a contact form, and `/install.sh` and `/install.ps1` redirecting to the scripts on GitHub.
- Docs for an open-source repo are in place: README, LICENSE (MIT), CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, issue and PR templates, Dependabot, CHANGELOG.

Not done. These block the release:

| # | What | Where |
|---|------|-------|
| 1 | The extension is not in the Chrome Web Store | Phase 2 |
| 2 | `EXTENSION_STORE_ID` placeholder in 4 files and on the website | Phase 3 |
| 3 | The Release workflow has never been run | Phase 1 |
| 4 | The GitHub repo is private | Phase 5 |
| 5 | No `v0.1.0` tag, no published release | Phase 6 |

Why the order matters: the install line in the README downloads `releases/latest`, so nothing works for users until a release is published. The release must carry the real store id, and the store id exists only after the extension is uploaded. The extension can be uploaded before it is approved, so the store upload comes first.

Everything in this document that changes code or settings is reversible except two steps: making the repository public (Phase 5) and publishing the release (Phase 6). Both are marked.

## Phase 0. Merge this branch and decide the Dependabot pull requests

1. Merge the pull request that carries this guide (installer fix, release guard, audit fixes, new security review).
2. Dependabot has 7 open pull requests. Recommendation:
   - Merge `#24` (npm minor and patch updates, CI passed).
   - Leave the five GitHub Actions major bumps and `@types/node` 26 until after 0.1.0. They change the build machinery right before the first release for no user benefit. Merge them one at a time afterwards.
3. Pull `main` and check once more: `pnpm install && pnpm test && pnpm typecheck`.

## Phase 1. Dry-run the release pipeline

The workflow can run without a tag. This builds all three bundles and installs them on a real Mac and a real Windows machine, and creates no release.

1. GitHub → Actions → Release → Run workflow → branch `main`.
2. Wait for `build`, `test-mac` and `test-windows` to turn green (about 15 minutes).
3. If `test-windows` fails, the error is in `scripts/install/install.ps1` or `scripts/install/launcher/no-fomo-social.ps1`; nobody has run those on a real Windows machine yet. Fix, merge, run again.
4. The workflow downloads the ffmpeg source tarball from ffmpeg.org without a checksum (review item L1). When ffmpeg.org is reachable, take the hash from https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz.sha256 and add after the download step in `release.yml`: `echo "<hash>  dist/release/ffmpeg-9.0.2.tar.xz" | sha256sum -c`. It was unreachable on 2026-11-02.
5. Download the `release` artifact from the run. It holds the exact files a release would ship, including `no-fomo-social-extension.zip` for the next phase.

Do not go on while this is red.

## Phase 2. Upload the extension to the Chrome Web Store

Needs: a Google account you will keep for years, a one-time 5 USD developer fee, and the zip from Phase 1 (or `pnpm ext:zip` → `apps/extension/.output/no-fomo-social-extension-0.1.0.zip`).

1. Open https://chrome.google.com/webstore/devconsole, pay the fee, fill the publisher profile (name "no-fomo", website https://no-fomo.ai, a contact email; Google requires a verified email).
2. **New item** → upload the zip. Do not press Submit yet.
3. Open the item → **Package** → copy the **Item ID** (32 letters, like `abcdefghijklmnopabcdefghijklmnop`) and press **View public key** → copy the key (one long base64 line). You need both in Phase 3.
4. Fill **Store listing** with the text in Appendix A. Every image is ready in the design folder next to this repo: `../design/store/chrome-web-store/` holds the 128 px icon, five 1280×800 screenshots and both promo tiles; `listing.md` there has the same text with the exact field names.
5. Fill **Privacy** with Appendix B: single purpose, one justification per permission, the data-use checkboxes, and the privacy policy URL `https://no-fomo.ai/privacy`. Check that the privacy page actually says what Appendix B says (data goes only to the user's computer; nothing is sent to us).
6. **Distribution**: Public, all regions. Save the draft.
7. Press **Submit for review**. Reviews take from one day to about a week. `tabs` and the `instagram.com` host permission usually get a human look; the justifications in Appendix B answer the questions they ask. If the review comes back with a question, answer it in the dashboard; the item id does not change.

You can continue with Phase 3 while the review runs.

## Phase 3. Put the real extension id into the code

The web app asks the server for the extension id and sends messages to the extension by that id. The checked-in key in `packages/core/src/extension-id.ts` is a locally generated one; the store assigns its own. After this phase the dev build, the store build and the server all share the store's id.

1. In `packages/core/src/extension-id.ts`, replace `EXTENSION_PUBLIC_KEY` with the public key from Phase 2 step 3 and `EXTENSION_ID` with the Item ID. Keep the file's first comment line.
2. Replace `EXTENSION_STORE_ID` with the Item ID in these four files: `packages/core/src/constants.ts`, `scripts/install/install.sh`, `scripts/install/install.ps1`, `README.md`.
3. Check nothing is left: `grep -rn EXTENSION_STORE_ID --exclude-dir=node_modules --exclude-dir=.git .` must print nothing. The Release workflow refuses to build a tag while a placeholder remains.
4. Run `pnpm ext:build:dev`, load `apps/extension/.output/chrome-mv3-dev` unpacked in Chrome, and check in `chrome://extensions` that its id equals the Item ID. Then open the dev app, press Sync once, and open one account from Search, to prove the app and the extension still find each other (the extension no longer asks for the `tabs` permission; the instagram.com host permission covers what it needs).
5. Commit, open a pull request, merge.
6. Website: replace the same placeholder in the `no-fomo-website` repo (`/social` page) and deploy.

## Phase 4. Contact address

`SECURITY.md` and `CODE_OF_CONDUCT.md` point people at the contact form on https://no-fomo.ai/social. That works today. If you would rather give an email, create one on the domain (Cloudflare Email Routing, for example `security@no-fomo.ai` forwarding to your inbox), put it in both files, and use the same address as the Chrome Web Store support email.

## Phase 5. Make the repository public

Check first:

- `git log -p --all` has no secrets or real Instagram data (both reviews confirmed this).
- `apps/server/scripts/eval-cases.json` names two public post ids; the account handles were removed on 2026-11-02. Keep or replace with your own posts.
- Local-only files are not in git: `.dev-data`, `.claude`, `.impeccable`, `.superpowers`, `dist` are ignored.

Then, from a terminal with `gh` logged in as the org owner:

```bash
gh repo edit no-fomo-org/no-fomo-social --description "Let AI watch the reels. Your Instagram saves and any account, turned into knowledge on your own computer." --homepage https://no-fomo.ai --enable-discussions --enable-issues --delete-branch-on-merge
```

```bash
gh repo edit no-fomo-org/no-fomo-social --add-topic instagram --add-topic reels --add-topic ai --add-topic openai --add-topic chrome-extension --add-topic local-first --add-topic creator-tools
```

This one cannot be undone in practice (forks and caches keep a copy):

```bash
gh repo edit no-fomo-org/no-fomo-social --visibility public --accept-visibility-change-consequences
```

In the GitHub web UI (no CLI for these):

1. Settings → General → Social preview → upload `.github/assets/social-preview.jpg`.
2. Settings → Code security → turn on Dependabot alerts, Secret scanning, Push protection, and **Private vulnerability reporting** (this makes the "Report a vulnerability" link in `SECURITY.md` work).
3. Settings → Rules → New branch ruleset for `main`: require a pull request, require the `check` status check from CI to pass, block force pushes.
4. Org profile (https://github.com/no-fomo-org): description "Free, open-source tools that turn Instagram reels into knowledge, on your own computer.", website https://no-fomo.ai, avatar `docs/brand/first-light/logo/png/app-icon-fern-512.png` (also `../design/github/org-avatar-512.png`).
5. Delete merged branches on GitHub (`brand-first-light`, `impeccable-audit`, `security-review`, `fix-review-findings`, `remove-site`, `rename-social`, and so on). Locally: `git fetch --prune` and `git branch --merged main | grep -v main | xargs git branch -d`.

The website repo `no-fomo-org/no-fomo-website` can stay private; nothing in the app links to its source.

## Phase 6. Tag and publish 0.1.0

Wait for the Chrome Web Store approval (Phase 2) before this phase, so the first users can finish setup.

1. In `CHANGELOG.md`, change `## 0.1.0 — unreleased` to `## 0.1.0 — 2026-MM-DD`. Versions are already `0.1.0` in `package.json`, `apps/extension/package.json` and `APP_VERSION` in `packages/core/src/constants.ts`; the workflow checks that all three equal the tag.
2. Merge, then on an up-to-date `main`:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

3. Actions → Release: `build` → `test-mac` and `test-windows` → `release` (draft). About 20 minutes.
4. Open Releases → the draft. Check that it has 7 files: `no-fomo-social-darwin-arm64.tar.gz`, `no-fomo-social-darwin-x64.tar.gz`, `no-fomo-social-win32-x64.zip`, `SHA256SUMS`, `no-fomo-social-extension.zip`, `ffmpeg-9.0.2.tar.xz` (GPL source, must stay) and the auto-generated notes. Replace the notes with the CHANGELOG entry plus the three install steps from the README. Press **Publish release**.
5. From this moment the install lines in the README work for everyone, because they download `releases/latest`.
6. Test as a user, on a machine that never had the app (a second Mac, a fresh macOS user account, or a Windows VM): paste the install line from the README, add the extension from the store link, log in to instagram.com, press Sync, add an OpenAI key under the gear, make one report. Then run `no-fomo-social uninstall`. If anything fails here, fix it and ship 0.1.1 the same way; do not announce first.

## Phase 7. Website and announcement

1. Website: the `/social` page already carries the install line (through `/install.sh` and `/install.ps1`) and the GitHub links. Replace the store placeholder (Phase 3 step 6), and check that the privacy page matches the store listing.
2. README: the install lines can switch to the short `https://no-fomo.ai/install.sh` once you trust the redirect; both work today. Keep the raw GitHub line in the README's details section as the fallback.
3. Announce only after Phase 6 step 6 passed. Order that helps new users most: the people who asked for the release first, then GitHub Discussions "Announcements", then social.
4. Keep the first week light: watch GitHub Issues, the Chrome Web Store reviews, and Dependabot. Answer install problems the same day; those are the ones that spread.

## After 0.1.0 (not blocking)

- **Signed releases.** Add `actions/attest-build-provenance` to `release.yml` so each bundle has a provenance record (free, no keys). Noted as L1 in the 2026-10-22 review.
- **Extension verifies the server.** Today the extension trusts `localhost:4747` by origin alone; while the app is not running, another program under the same user could take the port. A per-install secret shown by the page would close it. Noted as M1.
- **Media links from Instagram are shown without a host check** (review item L5). Downloads are checked; browser loads of thumbnails and videos are not. Defence in depth: drop links that are not on `cdninstagram.com` or `fbcdn.net` at ingest.
- **Multi-user machines.** The local API has no per-request credential, so another user account on the same computer can read the library. Fine for a personal computer; say so in the docs if that question comes up.
- Merge the deferred Dependabot pull requests one at a time.

## Every release after this one

1. Bump the version in the three places, add a CHANGELOG entry, merge.
2. `git tag vX.Y.Z && git push origin vX.Y.Z`. Check the draft release, press Publish.
3. If anything under `apps/extension` or `packages/core/src/ig` changed, upload `no-fomo-social-extension.zip` from the release to the Chrome Web Store (same item, new version) and submit. Users get it automatically after approval.
4. Users update by running the install line again or `no-fomo-social update`.

## Appendix A. Chrome Web Store listing

- **Name:** no-fomo-social
- **Summary (132 characters max):** Connects Instagram to the no-fomo-social app on your computer, so you can sync saved posts and get AI reports on reels.
- **Category:** Productivity. **Language:** English.
- **Description:**

  no-fomo-social turns Instagram reels into notes, steps and ideas. This extension is the bridge between instagram.com and the free no-fomo-social app that runs on your computer.

  What it does:
  • Syncs your saved posts and collections into the no-fomo-social app on your computer.
  • Opens the accounts you choose, so you can study their posts in no-fomo-social.
  • Refreshes video links when they expire.

  What it does not do:
  • It sends nothing to us or to any server. Data goes only to the no-fomo-social app on your own computer (localhost).
  • It never acts on its own: every request starts from a button you press in no-fomo-social.
  • It is slow on purpose: one request at a time, at most 150 per hour, with automatic pauses.

  You need the no-fomo-social app first. Install it in one step from https://no-fomo.ai/social. The app is open source: https://github.com/no-fomo-org/no-fomo-social

  Not affiliated with Instagram or Meta.

- **Website:** https://no-fomo.ai/social. **Support:** https://github.com/no-fomo-org/no-fomo-social/issues
- **Images:** icon 128 px (`docs/brand/first-light/logo/png/extension-icon-128.png`); screenshots 1280×800 from `.github/assets`; small promo tile 440×280.

## Appendix B. Privacy tab

- **Single purpose:** Sync the user's Instagram saved posts and chosen accounts to the no-fomo-social app running on the user's own computer.
- **Permission justifications:**
  - `storage`: keep Instagram request limits and pause times, so the extension stays slow and safe across tabs and restarts.
  - Host `https://www.instagram.com/*`: read the user's saved posts and chosen accounts with the user's own login, only when the user presses Sync or opens an account in the app.
  - Host `http://localhost:4747/*` and `http://127.0.0.1:4747/*`: pass that data to the no-fomo-social app on the user's computer. Nothing else.
- **Remote code:** No.
- **Data use:** The extension handles "Website content" (the user's saved Instagram posts) and "Personally identifiable information" (Instagram usernames). Certify: not sold to third parties; not used or transferred for purposes unrelated to the single purpose; not used to determine creditworthiness or for lending.
- **Privacy policy URL:** https://no-fomo.ai/privacy
