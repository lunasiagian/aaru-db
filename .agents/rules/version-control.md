# Version Control & Release Protocol

Follow these rules automatically for all changes to AaruDB (hosted on Cloudflare Pages from `main`):

1. **Semantic Versioning (`vMAJOR.MINOR.PATCH`):**
   - Keep `APP_VERSION` in `config.js` and `"version"` in `package.json` in lockstep (e.g., `v3.1.0` / `3.1.0`).
   - Bump **PATCH** (`v3.1.1`) for bug fixes, calc tweaks, and visual polish; **MINOR** (`v3.2.0`) for new user-facing features or tab overhauls; **MAJOR** (`v4.0.0`) for breaking schema or shell migrations.
   - Create and push an annotated Git tag (`git tag -a vX.Y.Z -m "..." && git push origin vX.Y.Z`) for every milestone release so any live deployment can be audited or rolled back cleanly.

2. **Branching & Verification:**
   - Small, verified fixes may commit directly to `main`.
   - Risky refactors, schema changes, or experimental UI spikes must live on a dedicated branch (`feat/...` or `exp/...`) and merge into `main` only after verification.
   - Always run `node scripts/verify_upgrade.mjs` before committing to `main`.
   - Never commit `node_modules/`, `package-lock.json` (unless explicitly adopted), binaries, or `.env`/secrets.

3. **Zero-Build Cache-Busting & Singleton Integrity:**
   - Keep `index.html` and `prototype.html` in sync whenever updating script/CSS `?v=` query parameters.
   - Shared ES module singletons (`./catalog.js?v=...`, `./assets.js?v=...`) must use the exact same `?v=` string across every importing module so browser module caches never split state.

4. **Remote Sync (`sync-game-data.yml`):**
   - Because GitHub Actions pushes daily snapshot commits to `origin/main`, always `git pull --rebase origin main` before pushing if `origin/main` has advanced.
