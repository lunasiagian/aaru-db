---
name: AaruDB
description: Swiss Editorial Astrolabe Plate design system for a reprogrammed Deshretian Ley-Line archive with zero-grey dual themes (Nocturnal Lapis Archive & Sunlit Sumeru Papyrus), variable Roboto Flex prose, and Recursive monospace telemetry.
colors:
  bg-canvas: "#070b16"
  bg-surface: "#0d1426"
  bg-inset: "#141e38"
  border-subtle: "#233256"
  border-deshret: "#4a3b22"
  accent-rust: "#e0653b"
  accent-gold: "#e5b84b"
  accent-leyline: "#2dd4bf"
  text-primary: "#f3ead8"
  text-secondary: "#9fb0d4"
  text-muted: "#687ba6"
  hydro-cyan: "#38bdf8"
  pyro-coral: "#f87171"
  anemo-mint: "#34d399"
  electro-violet: "#c084fc"
  dendro-lime: "#84cc16"
  cryo-frost: "#67e8f9"
  geo-amber: "#fbbf24"
typography:
  display:
    fontFamily: "'Roboto Flex', sans-serif"
    fontSize: "2.125rem"
    fontWeight: 750
    lineHeight: 1.08
    letterSpacing: "0em"
    fontVariation: "'wght' 750, 'wdth' 115, 'opsz' 36"
  headline:
    fontFamily: "'Roboto Flex', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "0em"
    fontVariation: "'wght' 650, 'wdth' 108, 'opsz' 20"
  body:
    fontFamily: "'Roboto Flex', sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 420
    lineHeight: 1.55
    letterSpacing: "0em"
    fontVariation: "'wght' 420, 'wdth' 100, 'opsz' 14, 'GRAD' 0"
  label:
    fontFamily: "'Roboto Flex', sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "0em"
    fontVariation: "'wght' 500, 'wdth' 90, 'opsz' 13, 'GRAD' 20"
  mono:
    fontFamily: "'Recursive', monospace"
    fontSize: "0.9375rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0em"
    fontVariation: "'MONO' 1, 'CASL' 0, 'wght' 500"
    fontFeature: "'tnum' 1"
rounded:
  xs: "2px"
  sm: "2px"
  md: "2px"
  lg: "2px"
  pill: "2px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "20px"
  xl: "32px"
components:
  button-target:
    backgroundColor: "{colors.bg-inset}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  button-target-active:
    backgroundColor: "rgba(224, 101, 59, 0.14)"
    textColor: "{colors.accent-rust}"
  subtab-underline:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    padding: "8px 2px 10px"
  subtab-underline-active:
    textColor: "{colors.text-primary}"
  stat-cell:
    backgroundColor: "transparent"
    textColor: "{colors.text-primary}"
    rounded: "0px"
    padding: "6px 2px"
  dossier-stage:
    backgroundColor: "{colors.bg-surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "18px 20px"
---

# Design System: AaruDB

## Overview

**Creative North Star: "Swiss Editorial Astrolabe Plate"**

AaruDB models a reprogrammed Deshretian Ley-Line archive as a high-craft Swiss editorial reference manual. Rather than trapping build math inside nested rounded SaaS boxes, pages are structured with continuous `1px` horizontal and vertical hairline dividers, mid-rule section headers (`── Section Title ──`), concentric `1px` astrolabe portrait rings, and clean factual telemetry with zero roleplay fluff.

The system enforces a strict **Zero-Grey Rule** across both themes—every surface, border, input, badge, and ink carries either deep midnight lapis/cobalt temperature (`dark`, default) or warm sunlit Sumeru papyrus/walnut temperature (`light`), anchored by Great Red Sand terracotta rust (`--accent-rust`), Deshret gold (`--accent-gold`), and oxidized malachite (`--accent-leyline`).

**Key Characteristics:**
- Strict zero-grey dual theme: **Nocturnal Lapis Archive** (`#070b16` / `#0d1426` / `#141e38`) and **Sunlit Sumeru Papyrus** (`#f4ede0` / `#faf5eb` / `#eae0ce`)
- De-carded Swiss hairline grid (`2px` max corner radius, `0` resting drop shadows, `1px` structural dividers)
- Variable `Roboto Flex` AP-Playbook prose (`max-width: 66ch`, `line-height: 1.55`, `GRAD` hover) paired with `Recursive` `MONO` tabular telemetry
- Full-width vertical-scroll Roster Dossier with top Character Selector Ribbon, 3-column Hero Spread, and 52px Sticky Telemetry Dock

## Colors

The palette enforces chromatic temperature across every token—no neutral or slate greys (`#1e293b`, `#334155`, `#475569`, `#808080`) appear anywhere.

### Primary & Mineral Accents
- **Great Red Sand Rust (`--accent-rust`):** `#e0653b` (dark) / `#b54424` (light) — Primary focal anchor, `+ Import GOOD` CTA, active filter keystones, deficit telemetry (`LOW ER`, shortages), and vertical portrait spine.
- **Deshret Gold / Antique Brass (`--accent-gold`):** `#e5b84b` (dark) / `#a87b22` (light) — Active navigation indicators, astrolabe rings, and constellation `C1–C6` badges.
- **Ley-Line Malachite (`--accent-leyline`):** `#2dd4bf` (dark) / `#1b7266` (light) — Synced status, resin readiness, and positive delta telemetry.
- **7-Element Scoping (`[data-element]`):** Contextual `--el-ink` and `--el-wash` tuned separately for `[data-theme="dark"]` and `[data-theme="light"]` to drive the `4px` left dossier spine and active character highlights.

### Chromatic Neutrals
- **Nocturnal Lapis (`dark`, default):** Canvas `#070b16`, Surface `#0d1426`, Inset `#141e38`, Border `#233256`, Bronze Frame `#4a3b22`, Primary Ink `#f3ead8`, Secondary `#9fb0d4`, Muted `#687ba6`.
- **Sunlit Papyrus (`light`):** Canvas `#f4ede0`, Surface `#faf5eb`, Inset `#eae0ce`, Border `#d4c6ae`, Brass Frame `#a87b22`, Primary Ink `#23190e`, Secondary `#6b5842`, Muted `#968167`.

### Named Rules
**The Zero-Grey Chromatic Rule.** Never introduce neutral or slate greys (`#1e293b`, `#334155`, `#475569`, `#64748b`, `#94a3b8`, `#808080`); every surface, input, pill, and ink must belong to either the Lapis or Papyrus chromatic ramp.

## Typography

**Display Font:** `'Roboto Flex'` (`sans-serif` fallback)
**Body Font:** `'Roboto Flex'` (`system-ui, sans-serif` fallback)
**Telemetry Font:** `'Recursive'` (`monospace` fallback)

**Character:** AP Playbook editorial legibility—Title Case for headings/tabs, Sentence case for prose/status copy, `max-width: 66ch` on long-form descriptions, and `Recursive` `MONO 1` tabular numerals for all combat stats and ledger totals.

### Hierarchy
- **Display** (`'wght' 750, 'wdth' 115, 'opsz' 36`, `34px`, `line-height: 1.08`): Character hero titles.
- **Headline** (`'wght' 650, 'wdth' 108, 'opsz' 20`, `13.5px–14px`): Mid-rule section headers (`── Section Title ──`) and sticky dock links.
- **Body** (`'wght' 420, 'wdth' 100, 'opsz' 14, 'GRAD' 0`, `15px`, `line-height: 1.55`, `max-width: 66ch`): Talent descriptions, Razor Mode summaries, and synergy notes.
- **Label** (`'wght' 500, 'wdth' 90, 'opsz' 13, 'GRAD' 20 → 65` on hover, `11px–12px`): Ribbon chips, weapon rows, and utility tags.
- **Mono Telemetry** (`Recursive`, `'MONO' 1, 'CASL' 0`, `'wght' 500/650`, `'slnt' -6` for live deltas, `tabular-nums`): Combat stats, `wRV%`, `CV`, `ER%`, and wish ledger.

### Named Rules
**The Numbers-Only Mono Rule.** Reserve `Recursive` monospace strictly for numerical telemetry, rankings, and stat deltas; prose headers and descriptions stay in `Roboto Flex`.

## Layout

Full-width vertical-scroll Roster workspace (`max-width: 1520px`), pairing a top **Character Selector Ribbon** (Search, Element, Sort, `All Characters` drawer toggle, and horizontal portrait chips) with a full-width **3-Column Hero Spread** (`260px` Astrolabe Portrait | `1fr` Underlined Current Stats | `360px` Held Weapon & Artifacts), a **52px Sticky Telemetry Dock**, and 4 natural vertical-scroll chapters (`01` Materials, `02` Weapons, `03` Artifacts & ER, `04` Talents & Codex). Below `1180px`, the Hero Spread wraps the loadout column; below `760px`, all spreads stack to a single column.

## Elevation & Depth

Surfaces are flat at rest. Depth comes strictly from 3-step tonal contrast (`--bg-canvas` → `--bg-surface` → `--bg-inset`) and `1px` hairline dividers (`--border-subtle` / `--border-deshret`), with `box-shadow: none` on all resting cards and panels.

### Named Rules
**The Flat-By-Default Rule.** Cards, strips, and ledger rows never use ambient drop shadows at rest; active states shift border accent (`--accent-rust` / `--el-ink`) and `GRAD` weight.

## Shapes

Crisp editorial book-plate geometry (`2px` max corner radius across all cards, inputs, buttons, and tiles; `0px` on underlined stat ledger rows) paired with `1px` hairline dividers, `3px–4px` vertical spines (`--accent-rust` / `--el-ink`), and concentric circular `50%` astrolabe rings behind character portraits.

## Components

### Buttons
- **Primary CTA (`.btn-gold`):** Great Red Sand rust fill (`--accent-rust`) with `#faf5eb` ink, shifting to `--accent-gold` on hover.
- **Target Toggle:** Inset fill (`--bg-inset`) with `1px` border, shifting to `--el-wash` and `--el-ink` when active.

### Chips & Pills
- **Ribbon Chips & Utility Tags:** `2px` radius with `Roboto Flex` `GRAD 20 → 65` hover transition and zero neutral grey.

### Navigation
- **Left App Rail + Top Telemetry Bar + Sticky Dossier Dock:** Theme switcher (`Theme: Obsidian` / `Theme: Papyrus` persisted in `localStorage`) and scroll-linked `52px` sticky telemetry bar with `var(--accent-rust)` active chapter highlight.

## Do's and Don'ts

### Do:
- **Do** enforce zero neutral/slate greys across both `dark` (Lapis) and `light` (Papyrus) modes.
- **Do** render all numerical stats (`HP`, `ATK`, `CRIT`, `ER%`, `wRV%`, pulls) in `Recursive` monospace with `tabular-nums`.
- **Do** use Title Case for headings/tabs and Sentence case for prose/status badges.

### Don't:
- **Don't** add ambient drop shadows, glassmorphism, or large rounded SaaS card wrappers (`> 2px`).
- **Don't** use `text-transform: uppercase` on prose headings, tabs, or table headers.
- **Don't** break existing JS data pipelines (`GOOD` import, Apps Script sync, `wRV%`, `Razor Mode`).
