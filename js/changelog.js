/**
 * Curated user-facing release notes for AaruDB.
 * Keep entries focused on visible features — omit internal maintenance/refactors.
 */
export const CHANGELOG = [
  {
    version: '2026.11.13-c',
    date: 'Nov 13, 2026',
    title: 'Constellation Telemetry & Effective Talents',
    highlights: [
      'The website now tracks your constellations (C1–C6) and reflects them directly on your account.',
      'Automatically applies +3 talent level boosts (e.g., C5 Zhongli at 10 / 13 / 13) to skill multiplier previews.',
      'Displays all 6 constellations in the Character Dossier with Active vs. Locked status.'
    ]
  },
  {
    version: '2026.11.13-b',
    date: 'Nov 13, 2026',
    title: 'Full-Screen Character Dossier & Build Science',
    highlights: [
      'Clicked characters now open a full-screen Glass Telemetry Dossier with computed combat stats (HP, ATK, DEF, EM, Crit, ER%, Elem/Heal Bonus).',
      'Added deterministic Role Classification (On-Field DPS, Sub-DPS, Support, Healer, Shielder) and Infusion / Normal Attack priority detection.',
      'Added Team-Context ER Comfort diagnostics, Roll Value (RV%), useful vs. dead substat highlighting, and ratio-derived stat cap progress bars.',
      'Added Lv.1–15 skill multiplier tables for both released and unreleased characters.'
    ]
  },
  {
    version: '2026.11.13-a',
    date: 'Nov 13, 2026',
    title: 'Equipped Artifacts & Sortable Archive',
    highlights: [
      'GOOD v3 imports now sync equipped artifacts and substats to your account with live API slot icons.',
      'Added sorting by Priority, Level, Rarity, Crit Value, and Name in Roster & Armory.'
    ]
  }
];
