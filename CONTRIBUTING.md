# Contributing

Thanks for helping. Bug fixes, small improvements and better docs are always welcome. For a bigger feature, open an issue first so we can agree on it before you spend time.

## Setup

You need Node.js 22+, pnpm (`corepack enable pnpm`), Google Chrome and ffmpeg (`brew install ffmpeg` on Mac).

```bash
pnpm install
pnpm dev                     # server on :4747, web on :5173 with hot reload
pnpm ext:build:dev           # extension that also trusts :5173
```

Load `apps/extension/.output/chrome-mv3-dev` in `chrome://extensions` (Developer mode → Load unpacked) and open http://localhost:5173.

For UI work without touching your real Instagram account, use fake posts:

```bash
NO_FOMO_SOCIAL_HOME=$PWD/.dev-data pnpm --filter @no-fomo-social/server seed
NO_FOMO_SOCIAL_HOME=$PWD/.dev-data pnpm dev
```

To run the app like a user does: `pnpm ext:build && pnpm start`, then open http://localhost:4747.

Only `pnpm dev` and `ext:build:dev` trust the web dev server on port 5173. `pnpm start` and the normal extension build never do, so another project on that port cannot use your Instagram session.

Set `NO_FOMO_SOCIAL_DUMP=1` to save raw Instagram responses to `~/.no-fomo-social/dumps`. They contain personal data. Never commit them; test fixtures must be made-up data.

## Before you open a pull request

```bash
pnpm test
pnpm typecheck
```

- Keep the change focused on one thing.
- Add or update tests for behavior you change.
- Changed the database schema? Run `pnpm --filter @no-fomo-social/server db:generate` and commit the new migration.
- Changed the UI? Follow [DESIGN.md](DESIGN.md) and add a screenshot to the pull request.
- Commit messages use [Conventional Commits](https://www.conventionalcommits.org): `feat(web): ...`, `fix(server): ...`, `docs: ...`.

## Instagram safety

no-fomo-social uses Instagram with the user's own account. Any change that adds Instagram calls must go through the shared request gate (`packages/core/src/ig/gate.ts`) and keep its limits. Pull requests that make the app faster by calling Instagram more often will not be merged.

## Code of Conduct

By taking part you agree to our [Code of Conduct](CODE_OF_CONDUCT.md).

## Releasing (maintainers)

1. Set the new version in `package.json`, `apps/extension/package.json` and `APP_VERSION` in `packages/core/src/constants.ts`. Add a `CHANGELOG.md` entry.
2. Merge to `main`, then tag: `git tag v0.2.0 && git push --tags`.
3. The Release workflow builds the Mac and Windows bundles, installs them on real machines, and creates a draft release. Check it and press Publish. The install scripts always download the latest published release.
4. Upload `no-fomo-social-extension.zip` from the release to the Chrome Web Store if the extension changed.

To test bundles locally: `pnpm --filter @no-fomo-social/web build && pnpm release:bundle darwin-arm64`, then run `scripts/install/install.sh` with `NO_FOMO_SOCIAL_DOWNLOAD_BASE=file://$PWD/dist/release`.
