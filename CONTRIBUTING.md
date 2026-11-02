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

The step-by-step runbook for the first public release is [docs/RELEASE.md](docs/RELEASE.md). For every release after it:

1. Set the new version in `package.json`, `apps/extension/package.json` and `APP_VERSION` in `packages/core/src/constants.ts`. Add a `CHANGELOG.md` entry.
2. Merge to `main`, then tag: `git tag v0.2.0 && git push --tags`.
3. The Release workflow builds the Mac and Windows bundles, installs them on real machines, and creates a draft release. Check it and press Publish. The install scripts always download the latest published release.
4. Upload `no-fomo-social-extension.zip` from the release to the Chrome Web Store if the extension changed.

To test a bundle locally, build it and serve `dist/release` over a local http server, the same way the Release workflow does (the installer refuses anything but HTTPS or 127.0.0.1):

```bash
pnpm --filter @no-fomo-social/web build && pnpm release:bundle darwin-arm64
python3 -m http.server 8000 --directory dist/release &
NO_FOMO_SOCIAL_HOME=/tmp/nfs-test NO_FOMO_SOCIAL_NO_BROWSER=1 NO_FOMO_SOCIAL_DOWNLOAD_BASE=http://127.0.0.1:8000 bash scripts/install/install.sh
/tmp/nfs-test/app/bin/no-fomo-social uninstall
```
