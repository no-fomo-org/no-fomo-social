# no-fomo

Your Instagram saved posts, on your own computer. Filter them by author, collection and type. Watch them in a better player and get a short AI report on any post. Semantic search comes next.

Everything runs locally. Your data stays in `~/.no-fomo`. Nothing is sent to any server except Instagram itself, and OpenAI when you analyze a post.

> **Warning:** no-fomo uses Instagram's private web API with your own login, the same way the Instagram website does. This is not an official API. Syncing is slow on purpose (one request every 2 to 3 seconds) to keep your account safe. Use it at your own risk.

## Requirements

- Node.js 22 or newer
- pnpm (`corepack enable pnpm`)
- Google Chrome (or another Chromium browser)
- ffmpeg, to analyze videos (`brew install ffmpeg`)

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

## Watching posts

Click a post to open it. Videos play straight from Instagram. Nothing is downloaded.

- Up and Down: previous or next post. Esc: close.
- Video: Space play or pause, Left and Right seek 5 seconds, `,` and `.` step one frame, M mute, F fullscreen.
- Carousel: Left and Right move between items, Shift with Left or Right seeks a video item.

Instagram links expire after a few days. When that happens, the extension asks Instagram for a fresh link (one request, same speed limits as sync).

## Full resync

Sync only adds new saves. To find posts you unsaved directly on Instagram, open the menu next to Sync and pick "Full resync". It checks every saved post (about 2 minutes per 1,000 posts) and hides the ones that are gone. If more than 30% of your posts seem gone, nothing is hidden, because that usually means an Instagram glitch.

## Analyze a post

Open a post and pick the **Report** tab. Press **Analyze** to get a short report: summary, key points, steps, what is mentioned, text shown on screen, and the full transcript. Copy it or download it as Markdown to use in any AI tool.

- Add your OpenAI key first: gear icon, top right. Each analysis usually costs a few cents.
- Videos are downloaded to a temp folder, analyzed, and deleted right after.
- The key is stored encrypted in `~/.no-fomo/keys.enc`. The encryption secret is in `~/.no-fomo/secret`. This protects the key in a copied or backed-up `keys.enc`, not from other programs on your computer. The key is only sent to OpenAI.
- Report language and model names can be changed in Settings.
- Search also finds words from reports. Use the "Has report" filter to see analyzed posts.

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
