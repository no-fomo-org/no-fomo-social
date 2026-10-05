# no-fomo

Your Instagram saved posts, on your own computer. Filter them by author, collection and type. A better video player and AI search come next.

Everything runs locally. Your data stays in `~/.no-fomo`. Nothing is sent to any server except Instagram itself.

> **Warning:** no-fomo uses Instagram's private web API with your own login, the same way the Instagram website does. This is not an official API. Syncing is slow on purpose (one request every 2 to 3 seconds) to keep your account safe. Use it at your own risk.

## Requirements

- Node.js 22 or newer
- pnpm (`corepack enable pnpm`)
- Google Chrome (or another Chromium browser)

## Start

```bash
pnpm install
pnpm ext:build
pnpm start
```

Open http://localhost:4747.

## Install the extension

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Press **Load unpacked** and choose `apps/extension/.output/chrome-mv3`.
4. Log in to instagram.com in the same browser.
5. In no-fomo, press **Sync**.

The first sync reads all your saved posts and collections. Later syncs only read what is new.

## Development

```bash
pnpm dev                     # server on :4747, web on :5173
pnpm ext:build:dev           # extension that also trusts :5173; load apps/extension/.output/chrome-mv3-dev
NO_FOMO_HOME=$PWD/.dev-data pnpm --filter @no-fomo/server seed   # fake posts for UI work
pnpm test
pnpm typecheck
```

Only `pnpm dev` and `ext:build:dev` trust the web dev server on port 5173. `pnpm start` and the normal extension build never do, so another project running on that port cannot use your Instagram session or write to your library.

Set `NO_FOMO_DUMP=1` to save raw Instagram responses to `~/.no-fomo/dumps` (useful for test fixtures; remove personal data before sharing).
