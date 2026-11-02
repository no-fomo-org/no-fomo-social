# Security review, 2026-10-22

Whole-repo review before the code goes public. Scope: the server HTTP surface (`apps/server/src/http/`), the key store, media download, ffmpeg and analysis inputs, the extension's message handling, the install scripts, and the full git history. Method: manual read of every file in scope, one independent discovery pass, and a separate verification pass for each candidate finding to drop false positives. `gitleaks` was not installed; the history scan used `git log -p` with secret and Instagram-data patterns instead.

**Result: no Critical and no Important findings.** The security model holds: Host and Origin checks stop other websites, the key never leaves the machine except to OpenAI, media downloads are pinned to Instagram CDN hosts, ffmpeg gets fixed arguments, the extension trusts only the app origins, and the history has no secrets or real Instagram responses. Two Medium and six Low items are below; the ones marked *fixed* are in this branch.

Severity words: **Critical** = remote takeover or key theft; **Important** = another website or user gets at the library or the Instagram session; **Medium** = needs a local foothold or leaks only a small signal; **Low** = hardening with no known attack.

## Medium

### M1. A local program can stand in for the app on `localhost:4747` — *partly fixed*

- Where: `apps/server/src/main.ts:42` (listened on `127.0.0.1` only), `apps/server/src/http/security.ts:14-17` (checks only Host and Origin), `apps/extension/src/origins.ts:9` (the extension trusts `http://localhost:4747` by origin alone).
- What happens: Chrome resolves `localhost` to `::1` first. The server held only `127.0.0.1:4747`, so any program, including one run by another user account on the same Mac, could bind `[::1]:4747` while the app was running. Chrome would then open that program's page as the app, and the extension would treat it as the app: it could start syncs, read accounts and the following list with the user's Instagram session, and receive the relayed data. Separately, the API has no per-request credential, so another user account on the same machine can read the library and replace the OpenAI key (not read it; `GET /api/settings` returns only the last 4 characters).
- Fix in this branch: the server now also listens on `[::1]`, so the address cannot be taken while the app runs; `[::1]:4747` is an accepted Host. SECURITY.md now says what the app cannot defend against (a program under the user's own account can read the data folder directly).
- Still open: the window when the app is not running. Closing it needs the extension to verify the server, for example a per-install secret stored in the extension that the page must present. Worth doing before a multi-user audience; not needed for a single-user Mac.

### M2. Other websites could probe which posts are in the library — *fixed*

- Where: `apps/server/src/http/app.ts:208` (`GET /media/thumbs/:id`), `security.ts` (no frame headers).
- What happens: a page on any website could embed `<img src="http://localhost:4747/media/thumbs/<postId>">`. The browser sends no Origin header for an image, so the request passed, and load/error told the page whether that Instagram post is in the user's saved library and whether the app is installed. Chrome's local network access prompt reduces this since 2025, but Firefox and Safari differ. The app could also be put in an iframe by another site and the user tricked into clicking Sync, Analyze or Delete report.
- Fix: `/media/*` refuses requests the browser marks `Sec-Fetch-Site: cross-site`; every response carries `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'`. Tests: `apps/server/test/app.test.ts` ("refuses cross-site loads of media", "forbids framing").

## Low

### L1. Install script: checksum and archive come from the same place — *partly fixed*

- Where: `scripts/install/install.sh:39-40`, `scripts/install/install.ps1:29-30`; the script itself is fetched from the `main` branch and `no-fomo-social update` re-runs it.
- What happens: the SHA256SUMS file is built and uploaded by the same release job as the archive. The check catches a damaged or partial download, not a replaced release. That is the same trust model as Homebrew or rustup (the GitHub org is the root of trust), and release publishing is already a manual step on a draft with `contents: read` elsewhere.
- Fix in this branch: `curl` now refuses anything but HTTPS and TLS 1.2 or newer, including after redirects.
- Suggested later: add `actions/attest-build-provenance` to `release.yml` (free, no keys to manage), or sign SHA256SUMS with minisign and embed the public key in both installers. Say in the README what the installer checks.

### L2. Thumbnail download followed redirects — *fixed*

- Where: `apps/server/src/media/store.ts:56`.
- What happens: the analysis downloader already refused redirects; the thumbnail fetch did not, so a CDN redirect could have pointed off the allowed hosts. Instagram does not do this today.
- Fix: `redirect: "error"`, with a test in `apps/server/test/media-store.test.ts`.

### L3. Relay path check ran before URL normalisation — *fixed*

- Where: `apps/extension/src/relay.ts:8`.
- What happens: the background worker checked `path.startsWith("/api/sync/")` on the raw string, so `/api/sync/../settings` would have resolved to another route. Only the extension's own content scripts can send relay messages and the server blocks the settings route for the extension origin anyway, so nothing was reachable; it was two defences deep instead of three.
- Fix: the check now runs on the resolved pathname and refuses a query or fragment. Test in `apps/extension/test/relay.test.ts`.

### L4. Data folder was created world-readable — *fixed*

- Where: `apps/server/src/main.ts:20`.
- What happens: `~/.no-fomo-social` was created with the default mode (usually `755`), so on a shared Mac other accounts could read the SQLite library and thumbnails. The key store files were already `600`.
- Fix: the folder is created and kept at `700` (not on Windows, where the profile folder already does this).

### L5. ffmpeg demuxer is not pinned — *not fixed, documented*

- Where: `apps/server/src/analyze/ffmpeg.ts:56-80`, inputs from `inputs.ts:52-55`.
- What happens: ffmpeg is spawned with a fixed argument list and no shell, so no injection. It does probe the input format itself. A crafted file could pick an unexpected demuxer (playlist or concat types, which newer ffmpeg already restricts). The file comes from Instagram's CDN after the host check, so only Instagram or a CDN compromise could supply it.
- If wanted: pass `-f mp4` for videos and `-protocol_whitelist file` for every call. Left out because it risks breaking real posts for a theoretical gain.

### L6. Real Instagram accounts named in an eval file — *owner decision*

- Where: `apps/server/scripts/eval-cases.json:3-14`.
- What happens: the file names two real public accounts and their post ids as test cases for the analysis prompt. Not a secret and not an Instagram response, but it will be public with the repo. Either keep it (public posts, public accounts) or replace with the owner's own posts.

## Checked and clean

- **Git history**: no API keys, tokens, private keys, `.env` files or dumps. `sk-test-…` strings are fake test values. The only email is the commit author. The old `apps/site/.wrangler/*.sqlite` files from the website era are empty 4 KB stubs. Fixtures use made-up accounts (`devtips`, `quietcook`, `designnotes`) and fake CDN links. The extension's committed key is the public half only, which is public in any shipped extension anyway.
- **Key store** (`key-store.ts`): AES-256-GCM with a random nonce, secret and key file at mode `600`, atomic rename. The key is sent only to `api.openai.com`; the API returns `set` and `last4`; errors and logs do not carry it.
- **Server input**: ids are digit-only, run ids are integers, every query goes through drizzle parameters, the full-text search keeps only letters and digits, the static file route resolves and checks the prefix, media ids are route-constrained to digits. Request bodies must be JSON and under 8 MB; writes need an allow-listed Origin; unknown Hosts get 403 (DNS rebinding).
- **Downloads**: `https:` and `cdninstagram.com` / `fbcdn.net` hosts only, size caps, image magic-byte check, `nosniff` on served images.
- **Extension**: `externally_connectable` and host permissions are the app origins only; every field from the page is validated with strict patterns; the relay accepts only app origins and sync routes; Instagram page code cannot reach the extension's internal messages.
- **Web app**: report markdown is rendered with `skipHtml`, images disallowed and links limited to `http(s)`; no `dangerouslySetInnerHTML`.
- **Release build**: Node and ffmpeg downloads are pinned by SHA-256 in `scripts/release/build-bundle.mjs`; the release job has read-only permissions until the final draft step.

## Before going public

1. Replace the `CONTACT_EMAIL` placeholder in SECURITY.md and `EXTENSION_STORE_ID` in the installers.
2. Decide L6.
3. Consider the attestation step from L1 and the server verification from M1 as follow-ups.
