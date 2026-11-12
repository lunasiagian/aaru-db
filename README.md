# GENSHIN SHEET (FINAL) — Tactical Datasheet

A multi-tab single-page web application (HTML, CSS, ES Modules) for tracking Genshin Impact accounts (`almondeluna` / Luna & `vanbrohenheim` / Sunny), hosted on GitHub Pages and synced with a Google Apps Script backend.

## Features

1. **Dark Blueprint UI & Hybrid Asset Pipeline**
   - `#0F1A26` 24px blueprint grid, `#162434` slate cards, `#2A3F55` 1px borders, `#F5C451` gold, `#E86F5C` coral alerts, `#7CE0C3` mint surplus indicators.
   - `getAssetUrl(type, pascalKey)` checks `./assets/custom/{type}/{pascalKey}.png` (`image-rendering: pixelated;` for Aseprite PNGs) and falls back to official Genshin icons mapped in `data/catalog.json`.
   - `scripts/build-catalog.mjs` regenerates `data/catalog.json` via `genshin-db` every patch.

2. **Dual-Account Partitioning & Partner Read-Only Toggle**
   - Authenticates `almondeluna` (Luna) and `vanbrohenheim` (Sunny) via `GET ?action=login` with `sessionStorage` persistence.
   - Top-bar **View Partner (Read-Only)** toggle locks edits and imports while inspecting the partner's sheet.

3. **Irminsul GOOD v3 JSON Drag-and-Drop Importer**
   - Drop or paste a GOOD v3 export (`{ format: "GOOD", version: 3, source: "Irminsul", ... }`), preview the character/weapon/material diff, and sync via `POST` (`action: "importGoodJson"`, `Content-Type: text/plain`).

4. **5 Dedicated Views**
   - **Central HUD**: Coin Purse (Primogems + Fates → Pulls), Mora, Effective Hero's Wit (`4★ + 0.25×3★ + 0.05×2★`), Completion Gauges, Priority Prefarm Allocator (`#1`/`#2` shared pool), Today's Domain & Resin Router, Daily/Weekly Checklist (including Snezhnaya tasks).
   - **The SSOT Vault**: KPIs, category filters, search, and debounced (`600ms`) `RAW COUNT` inputs that `POST upsertRow` to `{user}_Inventory` with a live `Saved ✓` badge.
   - **Prefarm Planner**: Rank targets (`1–90` or `95`, talents `1–10`) and compute exact deficits against `data/catalog.json`.
   - **Roster & Armory**: Filterable character/weapon grid (`All`, `Owned`, `Active Prefarm`, `In Progress`, `Built`, `Bench`, `Unowned`) with `Lv.95` support, equipped weapon `location`, and Imaginarium Theatre / Stygian Onslaught swap tags.
   - **Team Comps & Test Lab**: 4-character squads grouped by archetype (`Hypercarry`, `Dual Carry`, `Chip Damage`), automatic Weapon Conflict Detector, and Miliastra Test Lab notes.

5. **Offline / Mock Fallback**
   - When `APPS_SCRIPT_URL` in `config.js` is empty (`""`), the app hydrates immediately with realistic sample data (including Luna's Lv.95 C5 triple-crowned Zhongli, Lv.90 Raiden, Venti, Ayato, Kazuha, 521 Hero's Wit, 385 Adventurer's Exp, and 13,221,000 Mora).

## Setup

### Local Preview
Serve the directory over HTTP (required for ES modules and `fetch('./data/catalog.json')`):
```bash
npx serve .
```

### Regenerating `data/catalog.json` Every Patch
```bash
npm install
npm run build:catalog
```

### Connecting Google Apps Script
Edit `config.js` and set `APPS_SCRIPT_URL` to your deployed Apps Script Web App URL. Authentication uses per-user passphrases verified by Apps Script, which issues a temporary session token stored in `sessionStorage`.
