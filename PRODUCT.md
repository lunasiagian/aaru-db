# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user (admin), Sunny, and friends managing individual Genshin Impact accounts (with read-only partner/friend account switching). Core user archetypes AaruDB serves:

1. **Endgame Purist (*Sipaling Endgame*):** Prioritizes clearing Abyss/Stygian/Theater, prefers generalist sets (`EoSF`, `Noblesse`) over niche domains, hates fishing weapon grinds, invests supports `1-8-8` to `1-10-10`, and constantly shuffles loadouts.
2. **Favorite-Character Minmaxer (*Sipaling Minmaxing Karakter Favorit*):** Hyper-invests favorite carries (e.g. `300% CDMG` / `C0R1`–`C3R1`) while under-building supports or overlooking stat tradeoffs (`117% ER`), dislikes unassigned orphan artifacts in bag, pulls impulsively, and needs visual "Why is my damage 100k vs 300k?" team diagnostics.
3. **Data-Analyst Veteran (*Paham Tapi Ga Paham*):** Solid account clearing endgame; wants quantitative diminishing-returns / stopping-point metrics ("when to stop farming a character") and multi-variant team tinkering around favorite anchors (e.g. `Childe`).
4. **Clueless Casual (*Sipaling Planga-Plongo*):** Overwhelmed by multi-paragraph guides; needs 1-glance visual "just equip this" recommendations, blunt dead-mainstat guardrails (e.g. `ER Sands on Mavuika`), owned-only team substitutes, and zero-Excel daily domain guidance.

## Product Purpose

AaruDB (`aaru-db.pages.dev`) is a single-page Genshin Impact account manager, theorycrafting reference manual, and resource planner designed as an archival Ley-Line workspace. Success means importing an Irminsul GOOD v3 account scan and immediately seeing accurate build efficiency (`wRV%`, `CV`), context-aware BiS vs. accessible weapon and artifact rankings, burst ER comfort across Spiral Abyss / Stygian Onslaught (0E) / Imaginarium Theater, and exact resin, Mora, and calendar-aware farming pivots across active build targets.

## Positioning

Unlike generic Genshin wikis or static tier lists, AaruDB computes deterministic, kit-parsed recommendations directly from the user's own GOOD v3 inventory, artifact substats, weapon refinements, and saved Teams Lab squads—powered by Dimbreath `AnimeGameData` + Lunaris ETL profiles, KQM Theorycrafting Library (TCL) ER baselines, vector synergy scoring, and a real-time 6-week Genshin patch calendar.

## Operating Context

- **Primary Workflows:**
  - **Multi-Account Cloud Sync & Imports:** Individual user logins (you, Sunny, and friends) backed by Google Sheets via Google Apps Script (`apps-script/`), alongside direct Irminsul GOOD v3 JSON imports to sync 100+ character rosters, weapons, artifacts, and bag inventory.
  - **Today HUD & 6-Week Patch Calendar:** Tracks the 04:00-reset-adjusted in-game date, 42-day patch / 21-day banner half cadence (anchored to `7.3 Phase 1` on `2026-12-16 02:00 UTC` / `Dec 15, 9:00 PM Toronto EST` / `Dec 16, 9:00 AM Jakarta WIB`, assuming `Anastasya + Danica` Phase 1 and Phase 2 TBA), natural Resin budget (`180/day`), remaining weekday/All-Open domain days, automatic **All Domains Open** unlocks during the first 7 days of each banner half, and **New Boss Week-1 Lock** alerts when a queued character's World Boss isn't out until next patch (e.g., Danica's `Chimeric Shellspinner`).
  - **Build Order (Lv.80 Ready → Crowns) & Blossom of Wealth:** Applies 3-to-1 upward alchemy crafting and priority material sharing across Talent Books, Weapon Mats, Common/Elite drops, and Elemental Gems. Plans **Lv.80 Ready (`Lv.80` + talents `≤ 8`, `0` Crowns)** across `#1` then `#2` before **Lv.90 & Crowns** with clear switch guidance. Accounts for daily Mora (`~85K/day`) plus remaining Battle Pass Mora (`2.16M` Gnostic Hymn / `720K` Free BP) to recommend when to start running Blossom of Wealth Ley Lines.
  - **Character Dossier & Context-Aware Build Science:** Evaluates equipped artifacts (`wRV%`, `CV`, ER% breakpoints), scores weapons and artifact sets via `js/science/context-engine.js` across `Spiral Abyss` (100% E), `Stygian Onslaught` (0E), and `Imaginarium Theater`, detects non-snapshotting buff discounts and team weapon conflicts, and presents full talent/passive/constellation kits with toggleable `Razor Mode`.
  - **Teams Lab & Vault:** Benchmarks 4-slot squads, directed pairwise synergies, weapon conflicts, and bag inventory deficits.
- **Surfaces & Sync:** Primary Teyvat Observatory workspace live at `index.html` (`prototype.css`, `js/prototype-app.js`, mirrored at `prototype.html`) with the previous UI archived at `legacy.html` (`styles.css`, `js/app.js`), backed by Google Apps Script (`apps-script/`), `localStorage` stale-while-revalidate caching, and offline mock mode.

## Capabilities and Constraints

- **No Build Step:** Vanilla HTML, CSS, and ES Modules served directly (local preview on port `8080`, production on static hosting).
- **Offline Data ETL & Verification:** Python ETL (`scripts/dimbreath_loader.py`, `scripts/build_kit_profiles.py`, `scripts/build_weapons_index.py`, `scripts/build_enemies_index.py`) and `scripts/sync-snapshot.mjs` generate `data/kit_profiles.json` (`127` profiles), `data/set_vectors.json` (`60` sets), `data/weapons_index.json` (`259` weapons), `data/enemies_index.json` (`568` enemies), and `data/live-snapshot.json` with strict zero-spoiler guardrails (no TextMap/Quest/NPC leaks). Verified via `scripts/verify_upgrade.mjs` (7 acceptance checks) and `test.html` + `tests/build-science.test.js`.
- **Data Sources:** Dimbreath `AnimeGameData`, Project Amber (`gi.yatta.moe`), Lunaris (`lunaris.moe` + `data/live-snapshot.json`), Enka.Network icons, KQM TCL (`data/kqm-tcl.json` + `js/science/reaction-math.js`), and GOOD v3 JSON import.
- **Read-Only Partner View:** Switching to a partner's account disables all mutating controls while preserving full inspection of their builds, armory, and teams.

## Brand Commitments

- **Name:** AaruDB
- **Tone & Copy:** Terse, human, domain-accurate Genshin terminology (`Today`, `Prefarm`, `Characters`, `Armory`, `Teams Lab`, `Vault`, `Razor Mode`, `Wish`)—preserving canonical Genshin copywriting without generic SaaS boilerplate or invented roleplay fluff.
- **Community Attribution:** Credits KQM TCL, Dimbreath `AnimeGameData`, Project Amber, Lunaris, Enka.Network, and Genshin Optimizer (GOOD).

## Evidence on Hand

- `data/catalog.json`, `data/live-snapshot.json`, `data/kit_profiles.json`, `data/set_vectors.json`, `data/weapons_index.json`, `data/enemies_index.json`, `data/kqm-tcl.json`
- `js/calculations.js`, `js/catalog.js`, `js/science/context-engine.js`, `js/science/kit-taxonomy.js`, `js/science/stat-math.js`, `js/science/weapon-engine.js`, `js/science/reaction-math.js`
- `scripts/verify_upgrade.mjs`, `tests/build-science.test.js`, `test.html`

## Product Principles

1. **Account-Truth First:** Recommendations adapt to the user's actual owned weapons, refinements, artifacts, ER%, bag inventory, and calendar window rather than theoretical C6R5 assumptions.
2. **Deterministic Kit & Resin Science:** Roles, stat weights, reaction locks, two-pass prefarm pivots, and passive-adjusted Mora horizons are derived transparently from parsed game data and exact drop/resin curves.
3. **High-Density Clarity:** Dense numerical telemetry (`tabular-nums`) paired with quiet, scan-first hierarchy so build gaps and daily resin calls are readable in seconds.
4. **Zero-Friction Sync:** Instant local render with background Apps Script persistence and graceful offline fallback.

## Accessibility & Inclusion

- Semantic landmarks, `aria-label` on icon/filter controls, `role="dialog"` + `aria-modal="true"` with `Escape` and backdrop dismissal on modals, and keyboard-accessible tab/sub-tab navigation.
