# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user, Sunny, and friends managing individual Genshin Impact accounts (with read-only partner/friend account switching) to plan character builds, prefarm ascension/talent materials, track wish reserves, and benchmark endgame team compositions.

## Product Purpose

AaruDB (`aaru-db.pages.dev`) is a single-page Genshin Impact account manager, theorycrafting reference manual, and resource planner designed as a reprogrammed Deshretian Ley-Line archive. Success means importing an Irminsul GOOD v3 account scan and immediately seeing accurate build efficiency (`wRV%`, `CV`), kit-matched BiS vs. accessible weapon tiers, burst ER comfort across Solo/Double-Element/Stygian & Theatre baselines, and exact resin, Mora, and crafting deficits across active build targets.

## Positioning

Unlike generic Genshin wikis or static tier lists, AaruDB computes deterministic, kit-parsed recommendations directly from the user's own GOOD v3 inventory, artifact substats, weapon refinements, and saved Teams Lab squads—powered by KQM Theorycrafting Library (TCL) ER baselines, reaction math, and live Project Amber / Lunaris patch data.

## Operating Context

- **Primary Workflows:**
  - **Multi-Account Cloud Sync & Imports:** Individual user logins (you, Sunny, and friends) backed by Google Sheets via Google Apps Script (`apps-script/`), alongside direct Irminsul GOOD v3 JSON imports to sync your full 100+ character roster, weapons, artifacts, and bag inventory.
  - **Central HUD & Prefarm Priority Router:** Live resin recharge, domain rotations, pull/pity reserves (`Coin Purse` with Gnostic Hymn BP milestones), and shared material bottlenecks across active build targets (`Anastasya`, `Danica`, etc.), automatically calculating exact resin, Mora, and crafting deficits.
  - **Roster Dossier & Build Science Engine:** Top Character Selector Ribbon + full-width 3-column Swiss Hero Spread and 4-chapter vertical-scroll dossier evaluating equipped artifacts (`wRV%`, `CV`, ER% breakpoints across Solo, Double-Element, and Stygian/Theatre), ranking BiS vs. accessible weapon tiers, and presenting full talent/passive/constellation kits with toggleable `Razor Mode`.
  - **Teams & Endgame Lab:** Benchmarks team compositions, weapon conflicts, `archetypeLock` cores, and rotations for Spiral Abyss, Imaginarium Theatre, Stygian Onslaught, and Miliastra.
- **Sync & Persistence:** Static ES modules (`index.html`, `js/`, `styles.css`) backed by Google Apps Script (`apps-script/`) for live multi-user sync, `localStorage` stale-while-revalidate caching, and offline mock mode.

## Capabilities and Constraints

- **No Build Step:** Vanilla HTML, CSS, and ES Modules served directly (local dev via `scripts/serve.ps1` on port `8080`, production on static hosting).
- **Browser Test Suite:** Verified via `test.html` + `tests/build-science.test.js` (35 deterministic unit & fuzz assertions covering kit taxonomy, `wRV%`, burst cadence, archetype weapon rankings, and live catalog precedence).
- **Data Sources:** Project Amber (`gi.yatta.moe`), Lunaris (`lunaris.moe` + `data/live-snapshot.json`), Enka.Network icons, KQM TCL (`data/kqm-tcl.json` + `js/science/reaction-math.js`), and GOOD v3 JSON import.
- **Read-Only Partner View:** Switching to a partner's account disables all mutating controls while preserving full inspection of their builds, armory, and teams.

## Brand Commitments

- **Name:** AaruDB
- **Tone & Copy:** Terse, human, domain-accurate Genshin terminology (`Build Overview`, `My Characters`, `Razor Mode`, `Wish`, `Owned`)—avoiding generic SaaS/AI boilerplate.
- **Community Attribution:** Dedicated `Credits` tab linking KQM TCL, KQM Stellar Glimmer & Lunar Reaction guides, Project Amber, Lunaris, Enka.Network, and Genshin Optimizer (GOOD).

## Evidence on Hand

- `data/catalog.json`, `data/live-snapshot.json`, `data/weapons_index.json`, `data/kqm-tcl.json`
- `js/science/kit-taxonomy.js`, `js/science/stat-math.js`, `js/science/weapon-engine.js`, `js/science/reaction-math.js`
- `tests/build-science.test.js` & `test.html`

## Product Principles

1. **Account-Truth First:** Recommendations adapt to the user's actual owned weapons, refinements, artifacts, ER%, and saved squads rather than theoretical C6R5 assumptions.
2. **Deterministic Kit Science:** Roles, archetypes, stat weights, and reaction locks (`Stellar Glimmer`, `Lunar`, `Freeze-Core`) are derived transparently from parsed talent/passive data and KQM math.
3. **High-Density Clarity:** Dense numerical telemetry (`tabular-nums`) paired with clean visual hierarchy so build gaps are readable at a glance.
4. **Zero-Friction Sync:** Instant local render with background Apps Script persistence and graceful offline fallback.

## Accessibility & Inclusion

- Semantic landmarks, `aria-label` on icon/filter controls, `role="dialog"` + `aria-modal="true"` with `Escape` and backdrop dismissal on modals, and keyboard-accessible tab/sub-tab navigation.
