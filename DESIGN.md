---
name: AaruDB
description: Aaru Archival Reel — Obsidian Slate memory-storage workspace fusing typography movie posters, commemorative transit ticket stubs, hairline specimen ledgers, ALL-CAPS Nanum Myeongjo headers, Albert Sans body copy, and Barlow Condensed tabular stamps.
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
  nat-nodkrai: "#7DD3FC"
typography:
  display:
    fontFamily: "'Nanum Myeongjo', Georgia, serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "0.06em"
  headline:
    fontFamily: "'Albert Sans', system-ui, -apple-system, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "'Albert Sans', system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0em"
  label:
    fontFamily: "'Albert Sans', system-ui, -apple-system, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0em"
  mono:
    fontFamily: "'Barlow Condensed', 'Albert Sans', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "0.03em"
    fontFeature: "'tnum' 1"
rounded:
  plate: "2px"
  ticket: "3px"
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
    rounded: "{rounded.ticket}"
    padding: "16px 20px"
  specimen-plate:
    backgroundColor: "{colors.bg-surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.plate}"
    padding: "12px 14px"
  badge-pill:
    backgroundColor: "{colors.bg-surface-2}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.plate}"
    padding: "2px 7px"
---

# Design System: AaruDB

## Overview

**Creative North Star: "Aaru — The Archival Reel"**

Philosophically, **Aaru** is memory storage—an archival system. Rather than literal desert-sandstone fantasy tropes, AaruDB interprets that philosophy through **tactile archival ephemera**: typography movie posters with full-bleed cinematic character stills, Japanese commemorative transit tickets with serrated tear-off stubs, library checkout ledgers, botanical encyclopedia cross-references (`→ Teams Lab`, `→ Prefarm Queue`), calibrated field-guide rulers, and risograph print zines—all grounded in nocturnal Obsidian Slate (`#060812` → `#0C1120` → `#121A2F`).

Every view balances **dead-quiet hairline ledger discipline** (90% of the canvas) against **controlled graphic voltage**: one unapologetic solid-ink focal slab per view, poster-scale ALL-CAPS `Nanum Myeongjo` headers colliding with tiny `10px` catalog coordinates, and pure-visual ticket cues (zigzag tear edges, rotated double-ring transit stamps, barcodes, vertical `№` serials) that eliminate flavor text.

**Key Characteristics:**
- Deep Obsidian Slate tonal stack (`#060812` / `#0C1120` / `#121A2F` / `#1A2440`) framed by crisp `1px` antique gold hairlines (`rgba(212, 175, 55, 0.16)` / `0.34`)
- Three-role editorial typography: **ALL-CAPS `Nanum Myeongjo`** (`0.06em` tracking) for headers, **`Albert Sans`** for subheaders & body copy, and **`Barlow Condensed`** (`600`, `tabular-nums`) for ticket numerals, stats, and archival stamps—avoiding trite tech monospace
- Crisp archival geometry (`2px–3px` corners on specimen plates, ticket stubs, weapon cards, and vault tiles) with `+` corner crop marks, optical risograph linework/halftones, and hairline SVG zigzag tear seams
- Pure visual telemetry over walls of text: calibrated 3-instrument tick-mark rulers (`Primary/CRIT` · `Roll Quality wRV%` · `ER%`), 3-station Metro Milestone tracks (`Start → LV.80 → MAX`), and nation-coded Vault edge glows

## Colors

Chromatic midnight slate surfaces eliminate washed-out neutral greys while keeping contrast razor-sharp across dense ledgers, specimen grids, and full-bleed character splashes.

### Primary & Semantic Accents
- **Ley-Line Cyan (`--p-accent`):** `#5EEAD4` (hover `#86F4E2`, dark ink `#071316`) — Primary CTAs (`+ Import`), active focus rings, and interactive progress highlights.
- **Antique Gold (`--p-gold`):** `#D4AF37` — Brand emblem, active navigation, circular transit stamps, `5★` ink slabs, zigzag tear-edge hairlines, and `1px` structural border tint (`rgba(212, 175, 55, 0.16)` / `0.34`).
- **Ready Mint (`--p-mint`):** `#34D399` — Solid-ink `ALL DOMAINS OPEN` slab, `PLAYABLE DAY 1 ✓`, `0 Ley Lines Needed`, and safe ER/roll thresholds.
- **Deficit Coral (`--p-coral`):** `#F87171` — Material shortages, urgent Blossom of Wealth warnings, dead main-stat stamps (`OFF-KIT MAIN`, `0-ENERGY ER`, `WRONG ELEMENT`), and **New Boss Week-1 Lock** alerts.
- **Caution Amber (`--p-amber`):** `#FBBF24` — Partner read-only banner, `UPGRADE TARGET` artifact stamps, and short ER% indicators.
- **7-Element & Nation Palette (`--el-*`, `--nat-ink`):**
  - Pyro / Natlan `#F87171`
  - Hydro / Fontaine `#38BDF8`
  - Electro / Inazuma `#C084FC`
  - Cryo / Snezhnaya `#67E8F9`
  - Anemo / Mondstadt `#34D399`
  - Geo / Liyue `#FBBF24`
  - Dendro / Sumeru `#84CC16`
  - Nod-Krai `#7DD3FC`

### Neutral Obsidian Stack
- **Canvas (`--p-bg`):** `#060812` with subtle overhead gold (`rgba(212, 175, 55, 0.08)`) and cyan (`rgba(94, 234, 212, 0.06)`) ambient wash.
- **Surface (`--p-surface`):** `#0C1120` — Top command bar, primary panels, specimen plates, and modal containers.
- **Elevated Inset (`--p-surface-2`):** `#121A2F` — Secondary buttons, inputs, icon specimen frames, and table header bands.
- **Interactive Hover (`--p-hover`):** `#1A2440` — Row and button hover states.
- **Ink Ramp:** Primary `#F0F3FA`, Secondary `#B2BED6`, Muted `#7E8BA8`.

### Named Rules
- **The One-Layer Surface Rule.** Never nest bordered cards inside bordered cards; inside a panel, separate subsections with `1px` horizontal hairlines (`--p-border`) or dashed dividers instead of extra boxes.
- **The One Solid Ink Slab Rule.** Keep 90% of every view dead-quiet obsidian ledger; allow one unapologetic solid-ink focal slab per view (`ALL DOMAINS OPEN`, `#1` Priority / `#1` BiS, `C0·R1` dossier stamp, `5★` Armory slab) with deep obsidian text (`#060812`).

## Typography

**Display Font:** `'Nanum Myeongjo'` (`Georgia, serif` fallback) — **ALL CAPS** with `0.06em` tracking on headers (italic sentence-case reserved strictly for weapon lore).
**Subheaders & Body Font:** `'Albert Sans'` (`system-ui, -apple-system, sans-serif` fallback).
**Tabular Stats, Pills & Stamps Font:** `'Barlow Condensed'` (`'Albert Sans', sans-serif` fallback) — condensed grotesque numerals (`600`, `0.03em` tracking, `tabular-nums`) inspired by printed transit tickets and poster metadata.

### Hierarchy
- **Poster Hero Title** (`Nanum Myeongjo`, `700`, `clamp(34px, 4vw, 52px)`, `UPPERCASE`, `0.06em`): Today banner lockup (`7.3 PHASE 1`) and Character Dossier names.
- **View Display** (`Nanum Myeongjo`, `700`, `24px–28px`, `UPPERCASE`, `0.06em`): View titles, modal titles, and card headlines.
- **Subheader / Panel Title** (`Albert Sans`, `600`, `15px`, `line-height: 1.3`): Panel titles (`Build Queue & Missing Materials`, `Equipped Artifact Rolls`).
- **Body** (`Albert Sans`, `400`, `14px`, `line-height: 1.5`): Concise bulleted guidance, kit descriptions, and item lore.
- **Tabular Telemetry & Stamps** (`Barlow Condensed`, `600`, `11px–32px`, `tabular-nums`, `0.03em–0.08em`): Patch countdowns, Resin budgets, `CV`, `wRV%`, `ER%`, `№` serials, and compact stamps.

### Named Rules
- **The No-Flavor-Text Stub Rule.** Ticket stubs and calibrated gauges rely on pure visual cues (circular stamps, barcodes, icons, tick needles, vertical `№` serials)—never pad them with redundant explanatory labels.
- **The 2-Second Intuition Rule.** Every progress bar, chart, and alert must be readable in under 2 seconds (e.g., 3-station `Start → LV.80 → MAX` metro tracks and bulleted action items instead of paragraph walls).

## Layout

Centered single-column Observatory stage (`max-width: 1280px`) anchored beneath a sticky top command bar (`AaruDB` mark + account switcher on left, 6 primary view tabs centered, Quick Jump `/`, server reset button, and `+ Import` on right).

- **Today (`HUD`):**
  1. **Half-Poster / Half-Ticket-Stub Hero (`.p-hud-poster.p-hud-overdrive`):** Left 2/3 typography movie poster (`7.3` monumental cropped watermark, ALL-CAPS headline, full-bleed right-anchored character splash with micro-halftone screen, station-dot domain ledger); right 1/3 pure-visual collector ticket stub separated by a **hairline SVG zigzag tear seam**, `2px` animated foil security thread, rotated double-ring transit stamp, barcode, single-line countdown, Original Resin count, and rotated vertical `№` serial.
  2. **Compact Resource Ledger (`.p-resource-strip`):** Live Spare Mora (with inline `Edit` input since GOOD v3 cannot scan Mora), Spare Hero's Wit, and Wish Stash.
  3. **2-Column Strategy Strip (`.p-strategy-strip`):** Scannable bulleted Build Order (`Focus Resin on #2 Next` + Week-1 Boss Lock) paired with balanced `Best Domain Today` + bottom-anchored `Mora Plan` row.
  4. **Build Queue & Open Domains:** Interactive focus cards + flat hairline Missing Materials ledger.
- **Prefarm (`Kinetic Queue Deck`):** Transit Queue tickets with solid-ink `#1` priority slab, inline `Lv.`/`A/E/Q` steppers, 2-second **Metro Milestone Track** (`Start → LV.80 → MAX`), and perforated control stub.
- **Characters & Armory:** Separated 3-cluster filter bars (`OWNERSHIP: All → Owned → Unowned` | `RARITY: All · 5★ · 4★` | `ELEMENT / CLASS`). Character Dossiers feature a Zine Issue Strip, poster watermark, optical risograph splash plate, Metro Constellation route (`C1–C6`), `→` cross-reference strip, **3-Instrument Build Calibration Strip**, and **5-Slot Equipped Artifact Specimen Grid**. Armory renders cataloged weapon specimen cards (`№` serial, `5★` gold slab, Base ATK & substat).
- **Vault:** 6 simplified categories (`Ascension`, `Enemy Drops`, `Local Specialties`, `Ingestibles`, `Cooking`, `Quest & Key`) in a nation-coded **Specimen Grid** (subtle region top-edge glow & `Sort: Region`) with a click-to-inspect **Item Specimen Modal** (live description, gathering locations, and inline bag count).

## Elevation & Depth

Surfaces remain flat at rest—depth comes from the 3-step Obsidian Slate tonal ladder (`#060812` → `#0C1120` → `#121A2F`), `1px` antique gold hairlines (`--p-border`), and tactile print cues (zigzag tear seams, `+` corner crop marks, subtle `2px` top rarity/element hairlines). Ambient drop shadows are reserved strictly for modal dialogs and floating popovers.

### Named Rules
**The Hairline-Only Rule.** Structural borders stay at `1px solid var(--p-border)` (or `2px` top-edge rarity/element/nation bar); never use thick (`> 1px`) colored left or right accent stripes on cards or alert banners.

## Shapes

Crisp archival print geometry: `2px` (`--p-radius-plate`) on specimen plates, artifact cards, weapon cards, vault tiles, and ink stamps; `3px` (`--p-radius-ticket`) on primary panels, hero poster, and transit queue tickets; `8px` (`--p-radius-sm`) on standard buttons/inputs; `999px` strictly on circular transit cancel stamps and station route nodes.

## Motion

- **Anime.js v4.5.0 (`js/motion.js`):** Staggered entrance Choreography for Today, Prefarm, and Dossier Hero + tactile pulse feedback on stepper changes and reminder toggles.
- **Ticket Stub Hover Flex:** Hovering the HUD hero subtly pivots the tear-off stub along the zigzag seam (`translateX(3px) rotate(0.45deg)`).
- **Accessibility:** Every animation and foil shimmer cleanly respects `prefers-reduced-motion: reduce`.

## Archival Ephemera Canon (16 Approved Physical References)

Every future component, wireframe, or visual pass draws from this shared physical-world taxonomy—adapted cleanly into dark Obsidian Slate with procedural SVG/CSS (zero AI-generated raster art):

1. **Stamped Passports** — procedural SVG ink-bleed freshness stamps (`SYNCED · TODAY`, `STALE`, `OVERDUE`).
2. **Library Checkout Cards** — ruled due-date ledgers, accession slips (`ACCESSION №`), and bottom catalog rod punch-holes (`○`).
3. **Archival Reels** — patch timecodes, 42-frame patch cadence, and saved rotation reels.
4. **Ticket Stubs** — hairline SVG zigzag tear seams, `2px` foil security threads, rotated double-ring cancel stamps, barcodes, and vertical `№` serials.
5. **Newspaper Clippings** — stark high-contrast typographic hierarchy and tight hairline column rules.
6. **Torn Pages** — crisp serrated/dashed horizontal tear-off strips separating summary manifests from item grids.
7. **Note Cards** — compact 2-second scannable bulleted guidance with zero prose walls.
8. **Taped Papers** — subtle translucent archival bookmarks / pinned priority markers.
9. **Binders & Punch Holes** — circular rod punch-holes on inspector modals and vertical ledger index tabs.
10. **Film Posters** — left-anchored ALL-CAPS `Nanum Myeongjo` lockups, monumental cropped watermarks, and full-bleed right-anchored character stills with micro-halftone screens.
11. **35mm Contact Sheets & Grease-Pencil Marks** — sprocket-edged 4-frame strips (`01A–04A`) with a circled bottleneck frame (core motif for **Teams Lab**).
12. **Herbarium & Museum Specimen Labels** — ruled collection tags (`LOCALE · RARITY · №`) for **Vault** Local Specialties and **Equipped Artifacts**.
13. **Cassette J-Cards & Reel-to-Reel Boxes** — ruled `SIDE A / SIDE B` tracklists with rotation timings for Abyss / Imaginarium Theater teams.
14. **Baggage Claim Tags & Customs Seals** — bold 3-letter nation routing codes (`MND`, `LYE`, `INZ`, `SMR`, `FNT`, `NTL`, `NDK`, `SNZ`) and barcode bands.
15. **Drafting Blueprints & Calibrated Rulers** — `+` registration crop marks, `1px` callout leaders, and tick-mark gauges (3-Instrument Build Strip, Resin Dispatch Ruler).
16. **Telegrams, Receipts & Microfiche Cards** — dot-leader ledgers, notched index tabs, and compact requisition manifests (`REQ № 01`).

## Do's and Don'ts

### Do:
- **Do** keep every numerical stat, countdown, stamp, and serial in `Barlow Condensed` (`600`) with `tabular-nums`—never default to generic tech monospace.
- **Do** preserve authentic Genshin Impact terminology (`Domains`, `Blossom of Wealth`, `Fragile Resin`, `Talents`, `Ascension`).
- **Do** use pure visual print cues (zigzag seams, transit stamps, barcodes, tick-mark rulers, metro dot-lines) instead of explanatory paragraphs.

### Don't:
- **Don't** nest bordered cards inside bordered cards or add `> 1px` colored left/right accent stripes.
- **Don't** put flavor text inside ticket stubs or dense prose walls inside HUD strategy panels.
- **Don't** break live data pipelines (`GOOD v3` import, Apps Script sync, Dimbreath/Lunaris/Yatta catalog hydration, or `verify_upgrade.mjs`).
