---
name: AaruDB
description: Teyvat Observatory — Neutral Obsidian Slate Operate-mode workspace with antique gold hairlines, Ley-Line cyan focus accents, Fraunces display titles, Inter UI copy, and JetBrains Mono tabular telemetry.
colors:
  bg-canvas: "#060812"
  bg-surface: "#0C1120"
  bg-surface-2: "#121A2F"
  bg-hover: "#1A2440"
  border-gold: "rgba(212, 175, 55, 0.16)"
  border-gold-strong: "rgba(212, 175, 55, 0.34)"
  accent-cyan: "#5EEAD4"
  accent-cyan-hover: "#86F4E2"
  accent-ink: "#071316"
  accent-gold: "#D4AF37"
  semantic-mint: "#34D399"
  semantic-coral: "#F87171"
  semantic-amber: "#FBBF24"
  semantic-purple: "#A78BFA"
  text-primary: "#F0F3FA"
  text-secondary: "#B2BED6"
  text-muted: "#7E8BA8"
  el-pyro: "#F87171"
  el-hydro: "#38BDF8"
  el-electro: "#C084FC"
  el-cryo: "#67E8F9"
  el-anemo: "#34D399"
  el-geo: "#FBBF24"
  el-dendro: "#84CC16"
typography:
  display:
    fontFamily: "'Fraunces', Georgia, serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0em"
  label:
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0em"
  mono:
    fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0em"
    fontFeature: "'tnum' 1"
rounded:
  sm: "8px"
  md: "12px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "20px"
  xl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.accent-cyan}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
  button-outline:
    backgroundColor: "{colors.bg-surface-2}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
  panel-surface:
    backgroundColor: "{colors.bg-surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "16px 20px"
  badge-pill:
    backgroundColor: "{colors.bg-surface-2}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.pill}"
    padding: "3px 9px"
---

# Design System: AaruDB

## Overview

**Creative North Star: "Teyvat Observatory — Obsidian Slate"**

AaruDB's active workspace (`prototype.html` / `prototype.css`) is an Operate-mode Genshin Impact command deck built for daily resin decisions, patch-calendar prefarming, and high-density build inspection. Deep nocturnal obsidian surfaces (`#060812` → `#0C1120` → `#121A2F`) carry whisper-thin `1px` antique gold hairlines (`rgba(212, 175, 55, 0.16)`) and high-contrast Ley-Line cyan (`#5EEAD4`) primary actions, keeping attention on live numbers and character/material icons rather than ornamental chrome.

The layout favors calm, scan-first strips and single-layer panels over nested SaaS card bloat. Headings use warm editorial `Fraunces` at the page title level while UI controls stay crisp in `Inter` and every resin count, countdown, percentage, and combat stat locks to `JetBrains Mono` with `tabular-nums`. *(Archived `legacy.html` / `styles.css` is locked to dark Nocturnal Lapis.)*

**Key Characteristics:**
- Deep Obsidian Slate tonal stack (`#060812` / `#0C1120` / `#121A2F` / `#1A2440`) framed by `1px` antique gold hairlines (`rgba(212, 175, 55, 0.16)`)
- Single focal CTA accent in Ley-Line cyan (`#5EEAD4`), paired with antique gold (`#D4AF37`) for milestones/targets, mint (`#34D399`) for funded/ready states, and coral (`#F87171`) for deficits and Surge Trap alerts
- Three-role typography: `Fraunces` page titles, `Inter` UI chrome & prose, and `JetBrains Mono` `tabular-nums` for all telemetry
- Flat, single-layer Operate workspace: floating top command bar, centered stage, full-width patch calendar strip, 2-column strategy & resin grid, and zero nested cards

## Colors

Chromatic midnight slate surfaces eliminate washed-out neutral greys while keeping contrast crisp across dense tables and telemetry strips.

### Primary & Semantic Accents
- **Ley-Line Cyan (`--p-accent`):** `#5EEAD4` (hover `#86F4E2`, dark ink `#071316`) — Primary CTAs (`+ Import`), active focus rings, and interactive progress highlights.
- **Antique Gold (`--p-gold`):** `#D4AF37` — Brand emblem, active navigation indicators, All Domains Open badges, and `1px` structural border tint (`rgba(212, 175, 55, 0.16)` / `0.34`).
- **Ready Mint (`--p-mint`):** `#34D399` — `100%` Lv.80 Ready completion, `0 Ley Lines Needed` Mora status, and safe ER/readiness states.
- **Deficit Coral (`--p-coral`):** `#F87171` — Material shortages, urgent Blossom of Wealth warnings, and **New Boss Week-1 Lock** alerts.
- **Caution Amber (`--p-amber`):** `#FBBF24` — Partner read-only banner and mid-priority warnings.
- **7-Element Palette (`--el-*`):** Pyro `#F87171`, Hydro `#38BDF8`, Electro `#C084FC`, Cryo `#67E8F9`, Anemo `#34D399`, Geo `#FBBF24`, Dendro `#84CC16`.

### Neutral Obsidian Stack
- **Canvas (`--p-bg`):** `#060812` with subtle overhead gold (`rgba(212, 175, 55, 0.08)`) and cyan (`rgba(94, 234, 212, 0.06)`) radial ambient wash.
- **Surface (`--p-surface`):** `#0C1120` — Top command bar, primary panels, and modal containers.
- **Elevated Inset (`--p-surface-2`):** `#121A2F` — Secondary buttons, inputs, and table header bands.
- **Interactive Hover (`--p-hover`):** `#1A2440` — Row and button hover states.
- **Ink Ramp:** Primary `#F0F3FA`, Secondary `#B2BED6`, Muted `#7E8BA8`.

### Named Rules
**The One-Layer Surface Rule.** Never nest bordered cards inside bordered cards; inside a panel, separate subsections with `1px` horizontal hairlines (`--p-border`) or whitespace instead of extra boxes.

## Typography

**Display Font:** `'Fraunces'` (`Georgia, serif` fallback)
**Body & UI Font:** `'Inter'` (`system-ui, -apple-system, sans-serif` fallback)
**Telemetry Font:** `'JetBrains Mono'` (`ui-monospace, SFMono-Regular, monospace` fallback)

**Character:** Quiet editorial authority at the top of each view (`Fraunces`), neutral high-legibility controls (`Inter`), and razor-aligned tabular figures (`JetBrains Mono`) for resin math, countdowns, and combat multipliers.

### Hierarchy
- **Display** (`Fraunces`, `600`, `28px`, `line-height: 1.15`, `-0.02em`): View titles (`Today`, `Prefarm`, `Characters`, `Armory`, `Teams Lab`, `Vault`).
- **Headline** (`Inter`, `600`, `15px`, `line-height: 1.3`): Panel titles (`Priority Targets`, `Open Domains`, `Milestone Pivot`).
- **Body** (`Inter`, `400`, `14px`, `line-height: 1.5`): Strategy explanations, Surge Trap callouts, and kit/build prose.
- **Label** (`Inter`, `500`, `12px`, `line-height: 1.3`): Status badges, filter chips, and compact metadata.
- **Mono Telemetry** (`JetBrains Mono`, `500`, `12px–13px`, `tabular-nums`): Patch countdowns, Resin budgets, `Func X% · Max Y%`, Mora horizons, `wRV%`, `CV`, and `ER%`.

### Named Rules
**The No-Kicker Rule.** Never stack small uppercase eyebrow/kicker labels directly above section headings; let the heading and its inline right-hand metadata badge carry the context cleanly.

## Layout

Centered single-column Observatory stage (`max-width: 1280px`) anchored beneath a sticky top command bar (`AaruDB` mark + account switcher on left, 6 primary view tabs centered, Quick Jump `/`, server date/reset button, and `+ Import` on right).

On `Today`, information flows top-to-bottom in strict decision order:
1. **Patch Calendar Strip (`.p-patch-bar`):** In-game date, 42-day patch/phase day, All Domains Open status, dual-timezone next-banner countdown, natural Resin budget, and remaining weekday/All-Open domain days.
2. **Resource Strip (`.p-resource-strip`):** Live Mora (+ Blossom of Wealth timing badge), Hero's Wit, Fragile Resin, and Primogem/Fate reserves.
3. **2-Column Strategy Strip (`.p-strategy-strip`):** Build Order (`Lv.80 → Crown`) + New Boss Week-1 Lock alert (left) paired with Best Domain Today + Blossom of Wealth note (right); collapses to `1fr` at `<= 960px`.
4. **Build Queue & Open Domains:** Character cards with dual-layer `Lv.80 X% · Max Y%` progress bars and domain tiles auto-unlocked during the first 7 days of each banner half.

## Elevation & Depth

Surfaces are flat at rest—depth is conveyed through the 3-step Obsidian Slate tonal ladder (`#060812` → `#0C1120` → `#121A2F`) and `1px` antique gold hairlines (`--p-border`), with no ambient resting drop shadows. Elevated shadows are reserved strictly for modal dialogs and floating search popovers.

### Named Rules
**The Hairline-Only Rule.** Structural borders stay at `1px solid var(--p-border)` (or `var(--p-border-strong)` on focus/hover); never use thick (`> 1px`) colored left or right accent stripes on cards or alert banners.

## Shapes

Controlled, modern-archival geometry: `12px` (`--p-radius`) on primary panels and modals, `8px` (`--p-radius-sm`) on buttons, inputs, and compact tiles, and `999px` pill radii strictly on small status badges and progress tracks.

## Components

### Buttons
- **Shape:** Gently rounded (`8px`).
- **Primary (`.p-btn-primary`):** Ley-Line cyan (`#5EEAD4`) with deep ink (`#071316`), `8px 14px` padding, shifting to `#86F4E2` on hover.
- **Outline (`.p-btn-outline`):** Inset slate (`#121A2F`) with `1px` strong gold hairline (`rgba(212, 175, 55, 0.34)`), shifting to `#1A2440` on hover.
- **Focus / Active:** `2px solid #5EEAD4` focus-visible outline (`2px` offset); `1px` downward press micro-feedback on `:active`.

### Badges & Telemetry Pills
- **Style:** `999px` pill with `1px` translucent semantic border and `JetBrains Mono` `12px` `tabular-nums` copy (`mint`, `gold`, `coral`, `amber`, `accent`).

### Dual-Layer Progress Bars (`.p-bar-dual`)
- **Behavior:** Renders Pass-1 Functional readiness (`Lv.80 · ≤8`) in mint/gold over the full Max/Crown readiness track so players can judge Day-1 playability at a glance.

### Navigation
- **Top Command Bar (`.proto-command-bar`):** Sticky translucent obsidian bar (`#0C1120`) with `1px` bottom gold hairline, 6 view pills with active gold/cyan emphasis, and responsive mobile menu collapse.

## Do's and Don'ts

### Do:
- **Do** keep every numerical figure (dates, resin, Mora, `Func %`, `Max %`, `wRV%`, `CV`, `ER%`) in `JetBrains Mono` with `tabular-nums`.
- **Do** preserve authentic Genshin Impact terminology (`Domains`, `Blossom of Wealth`, `Fragile Resin`, `Talents`, `Ascension`).
- **Do** keep surfaces flat at rest with `1px` gold hairlines and single-layer panels.

### Don't:
- **Don't** nest bordered cards inside bordered cards or add `> 1px` colored left/right accent stripes.
- **Don't** place uppercase eyebrow/kicker labels above section headings.
- **Don't** break live data pipelines (`GOOD v3` import, Apps Script sync, Dimbreath/Lunaris catalog hydration, or `verify_upgrade.mjs`).
