import { renderAssetIcon } from './assets.js';
import {
  ensureCharacterKitAndStats,
  ensureWeaponStats,
  getAllCharacterKeys,
  getArtifactIcon,
  getCharacterKit,
  getCharacterMeta,
  getWeaponMeta,
  getWeaponStats
} from './catalog.js?v=20261114e';
import {
  analyzeCharacterKit,
  calcTalentUpgradeDiff,
  computeCharacterCombatStats,
  computeEffectiveTalents,
  evaluateErComfort,
  evaluateTeamCapabilities,
  generateKitInsights
} from './build-science.js?v=20261114m';

const STATUS_PILLS = [
  { id: 'All', label: 'All' },
  { id: 'Active Work', label: 'Active' },
  { id: 'Combat Ready', label: 'Built' },
  { id: 'Swap Flagged', label: 'Swaps' }
];
const ELEMENT_PILLS = ['All', 'Pyro', 'Hydro', 'Anemo', 'Electro', 'Dendro', 'Cryo', 'Geo'];
const SORT_OPTIONS = [
  { value: 'priority', label: 'Sort: Default' },
  { value: 'level', label: 'Sort: Level' },
  { value: 'rarity', label: 'Sort: Rarity' },
  { value: 'cv', label: 'Sort: Crit Value' },
  { value: 'name', label: 'Sort: Name' }
];
const INSPECTOR_STATUSES = ['Active Prefarm', 'In Progress', 'Built', 'Bench', 'Unowned'];
const SWAP_NOTE_RE = /\b(swap|borrow|share|theatre|theater|stygian|onslaught)\b/i;

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isSwapFlagged(c) {
  return Boolean((c.swapTag && c.swapTag.trim()) || (c.notes && SWAP_NOTE_RE.test(c.notes)));
}

function sortByPriorityThenLevel(a, b) {
  const ra = Number(a.priorityRank) || 9999;
  const rb = Number(b.priorityRank) || 9999;
  if (ra !== rb) return ra - rb;
  return b.level - a.level || a.meta.name.localeCompare(b.meta.name);
}

function sortCharacters(list, sortBy, tierId) {
  const copy = [...list];
  if (sortBy === 'level') {
    return copy.sort((a, b) => b.level - a.level || b.constellation - a.constellation || a.meta.name.localeCompare(b.meta.name));
  }
  if (sortBy === 'rarity') {
    return copy.sort((a, b) => (b.meta.rarity || 4) - (a.meta.rarity || 4) || b.level - a.level || a.meta.name.localeCompare(b.meta.name));
  }
  if (sortBy === 'cv') {
    return copy.sort((a, b) => b.subCv - a.subCv || b.level - a.level || a.meta.name.localeCompare(b.meta.name));
  }
  if (sortBy === 'name') {
    return copy.sort((a, b) => a.meta.name.localeCompare(b.meta.name));
  }
  if (tierId === 'active') return copy.sort(sortByPriorityThenLevel);
  if (tierId === 'built') return copy.sort((a, b) => b.level - a.level || a.meta.name.localeCompare(b.meta.name));
  return copy.sort((a, b) => (a.owned === b.owned ? b.level - a.level || a.meta.name.localeCompare(b.meta.name) : a.owned ? -1 : 1));
}

function renderCharacterCard(c, density) {
  const isUnreleased = Boolean(c.meta?.unreleased || c.meta?.lunarisId);
  const cornerBadge = c.owned ? `Lv.${c.level} · C${c.constellation}` : isUnreleased ? 'UNRELEASED' : '';
  const cornerBadgeHtml = cornerBadge
    ? `<span class="roster-corner-badge mono ${!c.owned && isUnreleased ? 'is-unreleased' : ''}">${cornerBadge}</span>`
    : '';
  const elemSlug = String(c.meta?.element || 'unknown').toLowerCase();
  const prefarmBadge =
    c.status === 'Active Prefarm'
      ? `<span class="pill mono pill-gold">${c.priorityRank ? `#${c.priorityRank} ` : ''}PREFARM</span>`
      : '';
  const swapBadge = isSwapFlagged(c)
    ? '<span class="roster-swap-flag mono" title="Gear Swap / Borrowing Flagged">⇄</span>'
    : '';
  const actionableHtml =
    prefarmBadge || swapBadge
      ? `<span class="roster-portrait-pills">${prefarmBadge}${swapBadge}</span>`
      : '';

  if (density === 'list') {
    return `
      <button type="button" class="roster-list-row ${!c.owned ? 'is-unowned' : ''}" data-inspect-char="${c.key}">
        <span class="roster-list-left">
          ${renderAssetIcon('characters', c.key, c.meta.name, 'icon-sm')}
          <span class="roster-list-name">${escapeHtml(c.meta.name)}</span>
        </span>
        <span class="roster-list-right mono">
          ${prefarmBadge}
          ${swapBadge}
          ${cornerBadgeHtml}
        </span>
      </button>`;
  }

  return `
    <button type="button" class="roster-portrait-card elem-glow-${elemSlug} ${!c.owned ? 'is-unowned' : ''}" data-inspect-char="${c.key}">
      ${cornerBadgeHtml}
      <div class="roster-portrait-frame">
        ${renderAssetIcon('characters', c.key, c.meta.name, 'icon-portrait')}
      </div>
      <div class="roster-portrait-footer">
        <span class="roster-portrait-name">${escapeHtml(c.meta.name)}</span>
        ${actionableHtml}
      </div>
    </button>`;
}

function renderTierSection(tierId, title, list, isOpen, density) {
  const body = list.length
    ? `<div class="${density === 'list' ? 'roster-compact-list' : 'roster-portrait-grid'}">
        ${list.map((c) => renderCharacterCard(c, density)).join('')}
       </div>`
    : '<div class="empty-state">No characters in this tier match the current filters.</div>';

  return `
    <details class="roster-tier" data-tier-id="${tierId}" ${isOpen ? 'open' : ''}>
      <summary class="roster-tier-header">
        <span class="roster-tier-title">${title}</span>
        <span class="pill mono">${list.length}</span>
      </summary>
      <div class="roster-tier-body">${body}</div>
    </details>`;
}

const SLOT_ORDER = { flower: 0, plume: 1, sands: 2, goblet: 3, circlet: 4 };
const SLOT_LABEL = { flower: 'Flower', plume: 'Plume', sands: 'Sands', goblet: 'Goblet', circlet: 'Circlet' };
const STAT_LABEL = {
  hp: 'HP',
  hp_: 'HP%',
  atk: 'ATK',
  atk_: 'ATK%',
  def: 'DEF',
  def_: 'DEF%',
  eleMas: 'EM',
  enerRech_: 'ER%',
  heal_: 'Heal%',
  critRate_: 'CR',
  critDMG_: 'CD',
  physical_dmg_: 'Phys%',
  anemo_dmg_: 'Anemo%',
  geo_dmg_: 'Geo%',
  electro_dmg_: 'Electro%',
  hydro_dmg_: 'Hydro%',
  pyro_dmg_: 'Pyro%',
  cryo_dmg_: 'Cryo%',
  dendro_dmg_: 'Dendro%'
};
const PERCENT_STATS = new Set([
  'hp_', 'atk_', 'def_', 'enerRech_', 'heal_', 'critRate_', 'critDMG_',
  'physical_dmg_', 'anemo_dmg_', 'geo_dmg_', 'electro_dmg_', 'hydro_dmg_',
  'pyro_dmg_', 'cryo_dmg_', 'dendro_dmg_'
]);

function formatStatKey(k) {
  return STAT_LABEL[k] || String(k || '').replace(/_/g, '');
}

function formatSubstatValue(sub) {
  const lbl = formatStatKey(sub.key);
  const val = Number(sub.value) || 0;
  return `${lbl} +${val}${PERCENT_STATS.has(sub.key) ? '%' : ''}`;
}

function splitPascalSet(s) {
  return String(s || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^Of /, 'of ');
}

function calcArtifactSubCv(equipped = []) {
  let subCv = 0;
  for (const a of equipped) {
    for (const s of a.substats || []) {
      if (s.key === 'critRate_') subCv += (Number(s.value) || 0) * 2;
      if (s.key === 'critDMG_') subCv += Number(s.value) || 0;
    }
  }
  return subCv;
}

function renderDossierLoadoutTab(c, weaponStats, kitAnalysis) {
  const weaponMeta = c.equippedWeapon ? getWeaponMeta(c.equippedWeapon.key) : null;
  const wepLvStats = weaponStats
    ? (c.equippedWeapon?.level <= 80 ? weaponStats.lv80 : weaponStats.lv90)
    : null;

  const sortedArtifacts = [...(c.equippedArtifacts || [])].sort(
    (a, b) => (SLOT_ORDER[a.slotKey] ?? 9) - (SLOT_ORDER[b.slotKey] ?? 9)
  );
  const setCounts = new Map();
  for (const a of sortedArtifacts) {
    if (a.setKey) setCounts.set(a.setKey, (setCounts.get(a.setKey) || 0) + 1);
  }
  const activeSets = Array.from(setCounts.entries())
    .filter(([, cnt]) => cnt >= 2)
    .map(([setKey, cnt]) => `${cnt >= 4 ? '4pc' : '2pc'} ${splitPascalSet(setKey)}`);
  const usefulSet = new Set(kitAnalysis?.usefulSubstats || []);

  return `
    <div class="dossier-section">
      <div class="card-eyebrow">EQUIPPED WEAPON</div>
      ${
        c.equippedWeapon
          ? `<div class="dossier-weapon-card">
              ${renderAssetIcon('weapons', c.equippedWeapon.key, weaponMeta.name, 'icon-md')}
              <div class="dossier-weapon-info">
                <div class="dossier-weapon-name">${escapeHtml(weaponMeta.name)}</div>
                <div class="item-meta mono">Lv.${c.equippedWeapon.level} · R${c.equippedWeapon.refinement} · ${weaponMeta.rarity}★</div>
              </div>
              ${
                wepLvStats
                  ? `<div class="dossier-weapon-stats mono">
                      <span class="pill">ATK ${wepLvStats.atk}</span>
                      ${
                        wepLvStats.subKey
                          ? `<span class="pill pill-sky">${escapeHtml(formatStatKey(wepLvStats.subKey))} +${wepLvStats.subVal}${PERCENT_STATS.has(wepLvStats.subKey) ? '%' : ''}</span>`
                          : ''
                      }
                    </div>`
                  : ''
              }
            </div>`
          : '<div class="muted mono" style="font-size:12px;">No weapon assigned in GOOD export</div>'
      }
    </div>

    <div class="dossier-section">
      <div class="dossier-section-head">
        <span class="card-eyebrow">EQUIPPED ARTIFACTS</span>
        <div class="artifact-summary-row mono">
          <span class="pill pill-mint">${activeSets.length ? activeSets.join(' + ') : 'Rainbow Set'}</span>
        </div>
      </div>
      ${
        sortedArtifacts.length
          ? `<div class="dossier-artifact-grid">
              ${sortedArtifacts
                .map((a) => {
                  const iconUrl = getArtifactIcon(a.setKey, a.slotKey);
                  const slotName = SLOT_LABEL[a.slotKey] || a.slotKey;
                  const iconHtml = iconUrl
                    ? `<div class="artifact-row-icon rarity-${a.rarity || 5}"><img src="${iconUrl}" alt="${escapeHtml(splitPascalSet(a.setKey))}" loading="lazy" /></div>`
                    : `<div class="artifact-row-icon rarity-${a.rarity || 5}"><span class="mono">${escapeHtml(slotName.slice(0, 2).toUpperCase())}</span></div>`;
                  return `
                    <div class="dossier-artifact-card">
                      <div class="dossier-artifact-top">
                        ${iconHtml}
                        <div class="artifact-row-body">
                          <div class="artifact-row-top">
                            <span class="mono text-gold">${escapeHtml(slotName)} · +${a.level}</span>
                            <span class="mono artifact-main-stat">${escapeHtml(formatStatKey(a.mainStatKey))}</span>
                          </div>
                          <div class="artifact-set-name">${escapeHtml(splitPascalSet(a.setKey))}</div>
                        </div>
                      </div>
                      <div class="dossier-substats-list mono">
                        ${(a.substats || [])
                          .map((sub) => {
                            const isUseful = usefulSet.has(sub.key);
                            return `<span class="substat-chip ${isUseful ? 'is-useful' : 'is-dead'}">${escapeHtml(formatSubstatValue(sub))}</span>`;
                          })
                          .join('')}
                      </div>
                    </div>`;
                })
                .join('')}
            </div>`
          : '<div class="muted mono" style="font-size:12px;">No equipped artifacts in GOOD export</div>'
      }
    </div>`;
}

const TIMING_LABEL_RE = /^(cd|.*duration|energy cost|.*stamina cost)$/i;

function formatKitDescription(desc) {
  let html = escapeHtml(String(desc || '').replace(/\\n/g, '\n'));
  html = html.replace(/&lt;i&gt;([\s\S]*?)&lt;\/i&gt;/gi, '<em class="kit-lore">$1</em>');
  html = html.replace(
    /&lt;color=#([0-9A-Fa-f]{6,8})&gt;([\s\S]*?)&lt;\/color&gt;/gi,
    '<span style="color:#$1">$2</span>'
  );
  html = html.replace(
    /^(Tap|Hold|Normal Attack|Charged Attack|Plunging Attack|Radiance:[^:\n]*:?)$/gm,
    '<strong class="kit-subheading">$1</strong>'
  );
  return html;
}

function renderDossierTalentsTab(c, kitData, kitAnalysis, effTalents) {
  if (!kitData) {
    return '<div class="empty-state mono">Syncing live talents, passives &amp; constellations from Project Amber / Lunaris...</div>';
  }
  const talents = kitData.talents || [];
  const passives = kitData.passives || [];
  const constellations = kitData.constellations || [];
  const ownedCon = c.owned ? Number(c.constellation) || 0 : 0;
  const talentLv = (kind) => {
    if (!c.owned) return 9;
    return kind === 'normal'
      ? effTalents.effective.auto
      : kind === 'skill'
        ? effTalents.effective.skill
        : effTalents.effective.burst;
  };
  const talentBonus = (kind) => {
    if (!c.owned) return 0;
    return kind === 'normal'
      ? effTalents.bonuses.auto
      : kind === 'skill'
        ? effTalents.bonuses.skill
        : effTalents.bonuses.burst;
  };
  const usesNormal = Boolean(kitAnalysis?.roleInfo?.usesNormalAttack);

  return `
    <div class="dossier-section">
      <div class="card-eyebrow">COMBAT TALENTS</div>
      <div class="dossier-kit-list">
        ${talents
          .map((t) => {
            const lv = talentLv(t.kind);
            const multEntries = Object.entries(t.multipliers || {});
            const timingPills = [];
            const scalingRows = [];

            for (const [lbl, arr] of multEntries) {
              const idx = Math.min((arr?.length || 1) - 1, Math.max(0, lv - 1));
              const val = Array.isArray(arr) ? arr[idx] ?? arr[0] ?? '—' : String(arr || '—');
              if (TIMING_LABEL_RE.test(lbl.trim())) {
                timingPills.push({ lbl, val });
              } else {
                scalingRows.push({ lbl, val });
              }
            }

            const timingHtml = timingPills.length
              ? `<div class="dossier-timing-pills mono">
                  ${timingPills.map((p) => `<span class="pill">${escapeHtml(p.lbl)}: ${escapeHtml(p.val)}</span>`).join('')}
                </div>`
              : '';

            const multHtml = scalingRows.length
              ? `<details class="dossier-mult-drawer">
                  <summary class="dossier-mult-summary mono">
                    <span>Scaling &amp; Multipliers (${scalingRows.length})</span>
                    <span class="text-cyan">Lv.${lv} ▾</span>
                  </summary>
                  <div class="dossier-mult-table mono">
                    ${scalingRows
                      .map(
                        (r) =>
                          `<div class="dossier-mult-row"><span class="dossier-mult-lbl">${escapeHtml(r.lbl)}</span><span class="dossier-mult-val">${escapeHtml(r.val)}</span></div>`
                      )
                      .join('')}
                  </div>
                </details>`
              : '';

            return `
          <div class="dossier-kit-card ${t.kind === 'normal' && usesNormal ? 'is-priority-talent' : ''}">
            <div class="dossier-kit-head">
              <div>
                <span class="pill mono">${t.kind === 'normal' ? 'NORMAL' : t.kind === 'skill' ? 'SKILL' : 'BURST'}</span>
                <strong class="dossier-kit-name">${escapeHtml(t.name)}</strong>
              </div>
              <div class="dossier-kit-badges mono">
                ${t.kind === 'normal' && usesNormal ? '<span class="pill pill-amber">INFUSION PRIORITY</span>' : ''}
                ${t.costElemVal ? `<span class="pill pill-sky">${t.costElemVal} Energy</span>` : ''}
                ${
                  c.owned
                    ? `<span class="pill pill-mint">Lv.${lv}${talentBonus(t.kind) ? ` (+${talentBonus(t.kind)})` : ''}</span>`
                    : `<span class="pill pill-mint">Preview Lv.${lv}</span>`
                }
              </div>
            </div>
            ${timingHtml}
            <p class="dossier-kit-desc">${formatKitDescription(t.description)}</p>
            ${multHtml}
          </div>`;
          })
          .join('')}
      </div>
    </div>

    <div class="dossier-section">
      <div class="card-eyebrow">ASCENSION PASSIVES</div>
      <div class="dossier-kit-list">
        ${passives
          .map(
            (p) => `
          <div class="dossier-kit-card">
            <div class="dossier-kit-head">
              <div>
                <span class="pill ${p.slot === 'Hexerei' ? 'pill-amber' : 'pill-violet'} mono">${escapeHtml(p.slot)}</span>
                <strong class="dossier-kit-name">${escapeHtml(p.name)}</strong>
              </div>
            </div>
            <p class="dossier-kit-desc">${formatKitDescription(p.description)}</p>
          </div>`
          )
          .join('')}
      </div>
    </div>

    ${
      constellations.length
        ? `<div class="dossier-section">
            <div class="card-eyebrow">CONSTELLATIONS (${c.owned ? `C${ownedCon} ACTIVE` : 'PREVIEW'})</div>
            <div class="dossier-kit-list">
              ${constellations
                .map((con) => {
                  const isActive = c.owned && con.level <= ownedCon;
                  return `
                <div class="dossier-kit-card ${isActive ? 'is-con-active' : 'is-con-locked'}">
                  <div class="dossier-kit-head">
                    <div>
                      <span class="pill mono ${isActive ? 'pill-gold' : ''}">C${con.level}</span>
                      <strong class="dossier-kit-name">${escapeHtml(con.name)}</strong>
                    </div>
                    <span class="pill mono ${isActive ? 'pill-mint' : ''}">${isActive ? 'ACTIVE' : 'LOCKED'}</span>
                  </div>
                  <p class="dossier-kit-desc">${formatKitDescription(con.description)}</p>
                </div>`;
                })
                .join('')}
            </div>
          </div>`
        : ''
    }`;
}

function formatMoraCompact(mora) {
  if (!mora) return '0';
  if (mora >= 1000000) return `${(mora / 1000000).toFixed(2)}M`;
  if (mora >= 1000) return `${Math.round(mora / 1000)}k`;
  return String(mora);
}

function renderTalentRoiPreviewHtml(c, kitData, kitAnalysis, curTalents, tgtTalents) {
  const slots = ['auto', 'skill', 'burst'];
  const diffs = slots
    .map((slot) =>
      calcTalentUpgradeDiff(
        c.key,
        kitData,
        slot,
        curTalents[slot] ?? 1,
        tgtTalents[slot] ?? (curTalents[slot] ?? 1),
        c.constellation || 0,
        kitAnalysis
      )
    )
    .filter((d) => d.changed);

  if (!diffs.length) {
    return `<div class="dossier-roi-empty muted mono">Adjust TGT A / E / Q above to preview exact multiplier gains &amp; Mora cost.</div>`;
  }

  let totalMora = 0;
  let totalTeachings = 0;
  let totalGuide = 0;
  let totalPhil = 0;
  let totalWeekly = 0;
  let totalCrown = 0;
  let bookName = diffs[0]?.cost?.bookName || 'Talent';

  for (const d of diffs) {
    totalMora += d.cost.mora || 0;
    totalTeachings += d.cost.books?.Teachings || 0;
    totalGuide += d.cost.books?.Guide || 0;
    totalPhil += d.cost.books?.Philosophies || 0;
    totalWeekly += d.cost.weekly || 0;
    totalCrown += d.cost.crown || 0;
  }

  const costParts = [`${formatMoraCompact(totalMora)} Mora`];
  if (totalTeachings) costParts.push(`${totalTeachings}× Teachings`);
  if (totalGuide) costParts.push(`${totalGuide}× Guide`);
  if (totalPhil) costParts.push(`${totalPhil}× Philosophies`);
  if (bookName && (totalTeachings || totalGuide || totalPhil)) costParts[1] += ` of ${bookName}`;
  if (totalWeekly) costParts.push(`${totalWeekly}× Weekly`);
  if (totalCrown) costParts.push(`${totalCrown}× Crown`);

  return `
    <div class="dossier-roi-header">
      <span class="card-eyebrow" style="margin:0;">TALENT LEVEL MULTIPLIER &amp; COST PREVIEW</span>
      <span class="mono dossier-roi-total-cost">${escapeHtml(costParts.join(' · '))}</span>
    </div>
    <div class="dossier-roi-list">
      ${diffs
        .map((d) => {
          const shownRows = d.rows.slice(0, 5);
          const extraCount = Math.max(0, d.rows.length - shownRows.length);
          const bonusNote = d.bonus ? ` <span class="text-cyan">(+${d.bonus} C)</span>` : '';
          return `
            <div class="dossier-roi-item">
              <div class="dossier-roi-item-head">
                <div>
                  <span class="dossier-roi-slot">${escapeHtml(d.slotLabel)}</span>
                  <span class="muted" style="font-size:12px;">${escapeHtml(d.talentName)}</span>
                </div>
                <div class="dossier-roi-badges">
                  <span class="pill">Lv.${d.effCur} → Lv.${d.effTgt}${bonusNote}</span>
                  ${d.avgRelGainPct > 0 ? `<span class="pill pill-mint">+${d.avgRelGainPct}%</span>` : ''}
                  <span class="pill pill-${d.badgeTone}">${d.badge}</span>
                </div>
              </div>
              ${
                shownRows.length
                  ? `<div class="dossier-roi-rows">
                      ${shownRows
                        .map(
                          (r) => `
                        <div class="dossier-roi-row">
                          <span class="muted">${escapeHtml(r.label)}</span>
                          <span class="mono">${escapeHtml(r.oldDisplay)} → <strong>${escapeHtml(r.newDisplay)}</strong> ${
                            r.relGainPct !== null ? `<span class="text-mint">(+${r.relGainPct}%)</span>` : ''
                          }</span>
                        </div>`
                        )
                        .join('')}
                      ${extraCount ? `<div class="muted mono" style="font-size:11px;padding-top:3px;">+${extraCount} more scaling rows</div>` : ''}
                    </div>`
                  : '<div class="muted mono" style="font-size:11px;">No scaling multiplier table cached yet.</div>'
              }
            </div>`;
        })
        .join('')}
    </div>`;
}

function renderDossierTargetsTab(c, isReadOnly, kitData, kitAnalysis, erReport, weaponMeta) {
  const disabledAttr = isReadOnly ? 'disabled' : '';
  const curTalents = {
    auto: Math.min(10, Math.max(1, Number(c.talent?.auto) || 1)),
    skill: Math.min(10, Math.max(1, Number(c.talent?.skill) || 1)),
    burst: Math.min(10, Math.max(1, Number(c.talent?.burst) || 1))
  };
  const tgtParts = String(c.targetTalents || '9/9/9')
    .split('/')
    .map((n) => Math.min(10, Math.max(1, Number(n) || 9)));
  const tgtTalents = {
    auto: tgtParts[0] || 9,
    skill: tgtParts[1] || 9,
    burst: tgtParts[2] || 9
  };

  const insights = generateKitInsights(c, kitData, weaponMeta, erReport, kitAnalysis);

  return `
    <form class="roster-drawer-form dossier-targets-form" data-inspector-form="${c.key}">
      <div class="roster-drawer-grid">
        <label class="mini-field">
          <span>STATUS</span>
          <select class="select-sm mono" name="status" ${disabledAttr}>
            ${INSPECTOR_STATUSES.map(
              (s) => `<option value="${s}" ${c.status === s ? 'selected' : ''}>${s}</option>`
            ).join('')}
          </select>
        </label>
        <label class="mini-field">
          <span>PRIORITY RANK</span>
          <input type="number" min="1" max="99" class="input-mono" name="priorityRank" placeholder="—" value="${c.priorityRank || ''}" ${disabledAttr} />
        </label>
      </div>

      <div class="roster-drawer-grid">
        <label class="mini-field">
          <span>CURRENT LVL (1–100)</span>
          <input type="number" min="1" max="100" class="input-mono" name="level" value="${c.level || 1}" ${disabledAttr} />
        </label>
        <label class="mini-field">
          <span>TARGET LVL (1–100)</span>
          <input type="number" min="1" max="100" class="input-mono" name="targetLevel" value="${c.targetLevel || 90}" ${disabledAttr} />
        </label>
      </div>

      <div class="roster-drawer-talents">
        <label class="mini-field">
          <span>A (NORMAL)</span>
          <input type="number" min="1" max="10" class="input-mono" name="tAuto" value="${curTalents.auto}" ${disabledAttr} />
        </label>
        <label class="mini-field">
          <span>E (SKILL)</span>
          <input type="number" min="1" max="10" class="input-mono" name="tSkill" value="${curTalents.skill}" ${disabledAttr} />
        </label>
        <label class="mini-field">
          <span>Q (BURST)</span>
          <input type="number" min="1" max="10" class="input-mono" name="tBurst" value="${curTalents.burst}" ${disabledAttr} />
        </label>
      </div>

      <div class="roster-drawer-talents">
        <label class="mini-field">
          <span>TGT A</span>
          <input type="number" min="1" max="10" class="input-mono" name="tgtAuto" value="${tgtTalents.auto}" ${disabledAttr} />
        </label>
        <label class="mini-field">
          <span>TGT E</span>
          <input type="number" min="1" max="10" class="input-mono" name="tgtSkill" value="${tgtTalents.skill}" ${disabledAttr} />
        </label>
        <label class="mini-field">
          <span>TGT Q</span>
          <input type="number" min="1" max="10" class="input-mono" name="tgtBurst" value="${tgtTalents.burst}" ${disabledAttr} />
        </label>
      </div>

      <div class="dossier-roi-preview" id="dossier-roi-preview">
        ${renderTalentRoiPreviewHtml(c, kitData, kitAnalysis, curTalents, tgtTalents)}
      </div>

      <div class="dossier-insights-card">
        <div class="card-eyebrow" style="margin-bottom:8px;">KIT SUMMARY &amp; PRIORITY</div>
        <div class="dossier-insights-grid">
          ${insights
            .map(
              (ins) => `
            <div class="dossier-insight-row">
              <div class="dossier-insight-key mono">${escapeHtml(ins.label)}</div>
              <div class="dossier-insight-val">${escapeHtml(ins.text)}</div>
            </div>`
            )
            .join('')}
        </div>
      </div>

      <label class="mini-field">
        <span>GEAR SWAP &amp; ENDGAME NOTES (STYGIAN ONSLAUGHT / IMAGINARIUM THEATRE)</span>
        <textarea class="textarea-lab" rows="4" name="notes" placeholder="e.g. Borrows Furina's Golden Troupe in Stygian Onslaught..." ${disabledAttr}>${escapeHtml(c.notes || '')}</textarea>
      </label>

      <div class="roster-drawer-actions">
        ${
          isReadOnly
            ? '<span class="muted mono" style="font-size:11px;">Partner View — Read Only</span>'
            : '<button type="submit" class="btn btn-gold">Save to Sheet</button>'
        }
      </div>
    </form>`;
}

function renderCharacterDossier(c, navList, account, isReadOnly, dossierTab) {
  const kitData = getCharacterKit(c.key);
  const weaponMeta = c.equippedWeapon ? getWeaponMeta(c.equippedWeapon.key) : null;
  const weaponStats = c.equippedWeapon ? getWeaponStats(c.equippedWeapon.key) : null;
  const combat = computeCharacterCombatStats(
    c,
    c.equippedWeapon,
    c.equippedArtifacts,
    kitData,
    weaponStats
  );
  const kitAnalysis = combat.kitAnalysis;
  const effTalents = computeEffectiveTalents(c, kitData);
  const erReport = evaluateErComfort(c, combat, account.teams || [], account.weapons || [], kitData, kitAnalysis);
  const teamCaps = evaluateTeamCapabilities(c, kitData, combat, weaponMeta, c.equippedArtifacts, erReport);

  const idx = navList.findIndex((item) => item.key === c.key);
  const prevChar = idx > 0 ? navList[idx - 1] : null;
  const nextChar = idx >= 0 && idx < navList.length - 1 ? navList[idx + 1] : null;
  const activeTab = dossierTab || 'loadout';

  const dmgLabel = combat.dmgBonusKey ? formatStatKey(combat.dmgBonusKey) : 'Elem DMG%';
  const erColorClass =
    erReport.erStatus === 'short' ? 'text-coral' : erReport.erStatus === 'warn' ? 'text-amber' : 'text-mint';
  const erPillClass =
    erReport.erStatus === 'short' ? 'pill-coral' : erReport.erStatus === 'warn' ? 'pill-gold' : 'pill-mint';
  const erPillLabel =
    erReport.erStatus === 'short'
      ? `LOW ER (${erReport.erDelta}%)`
      : erReport.erStatus === 'warn'
        ? 'BORDERLINE'
        : 'ON TARGET';
  const erCardStateClass =
    erReport.erStatus === 'short' ? 'is-er-short' : erReport.erStatus === 'warn' ? 'is-er-warn' : 'is-er-ok';

  return `
    <div class="dossier-shell">
      <div class="dossier-topbar">
        <div class="dossier-topbar-left">
          <button type="button" class="btn btn-outline btn-sm mono" data-dossier-back>← Back to Roster</button>
          <div class="dossier-nav-btns">
            <button type="button" class="btn btn-outline btn-xs mono" data-inspect-char="${prevChar ? prevChar.key : ''}" ${prevChar ? '' : 'disabled'} title="${prevChar ? escapeHtml(prevChar.meta.name) : ''}">‹</button>
            <button type="button" class="btn btn-outline btn-xs mono" data-inspect-char="${nextChar ? nextChar.key : ''}" ${nextChar ? '' : 'disabled'} title="${nextChar ? escapeHtml(nextChar.meta.name) : ''}">›</button>
          </div>
          <div class="dossier-title-group">
            <div class="dossier-title-row">
              <h1 class="dossier-char-name">${escapeHtml(c.meta.name)}</h1>
              <span class="dossier-char-submeta mono">${c.meta.rarity || 5}★ · ${escapeHtml(c.meta.element)} · ${escapeHtml(c.meta.weaponType)}</span>
            </div>
            <div class="dossier-meta-pills mono">
              ${kitAnalysis.roleInfo ? `<span class="pill pill-sky">${escapeHtml(kitAnalysis.roleInfo.primaryRole)}</span>` : ''}
              ${(() => {
                const allTags = kitAnalysis.roleInfo?.utilityTags || [];
                const shown = allTags.slice(0, 2);
                const extra = allTags.slice(2);
                return `${shown.map((tag) => `<span class="pill pill-violet">${escapeHtml(tag)}</span>`).join('')}${
                  extra.length
                    ? `<span class="pill pill-muted" title="${escapeHtml(extra.join(' · '))}">+${extra.length}</span>`
                    : ''
                }`;
              })()}
            </div>
          </div>
        </div>
        <div class="dossier-sync-badge mono">
          ${kitData ? '<span class="pill pill-mint">KIT SYNCED</span>' : '<span class="pill pill-sky">SYNCING KIT...</span>'}
        </div>
      </div>

      <div class="dossier-grid">
        <aside class="dossier-left-col">
          <article class="card dossier-telemetry-card">
            <div class="dossier-hero-row">
              <div class="dossier-portrait-wrap">
                ${renderAssetIcon('characters', c.key, c.meta.name, 'icon-lg')}
              </div>
              <div class="dossier-hero-stats">
                <div class="dossier-hero-lv mono">
                  ${c.owned ? `Lv.${c.level} <span class="muted">/ ${c.targetLevel}</span>` : '<span class="muted">Unowned</span>'}
                </div>
                <div class="dossier-hero-chips mono">
                  ${c.owned ? `<span class="pill pill-gold">C${c.constellation}</span>` : ''}
                  ${
                    c.owned
                      ? `<span class="pill">A/E/Q: ${effTalents.effective.auto}/${effTalents.effective.skill}/${effTalents.effective.burst}${
                          effTalents.bonuses.skill || effTalents.bonuses.burst || effTalents.bonuses.auto ? ' <span class="text-cyan">(+C)</span>' : ''
                        }</span>`
                      : ''
                  }
                  ${
                    kitData?.ascensionStat?.key
                      ? `<span class="pill pill-sky">${escapeHtml(
                          kitData.ascensionStat.key === 'critDMG_'
                            ? 'CRIT DMG'
                            : kitData.ascensionStat.key === 'critRate_'
                              ? 'CRIT RATE'
                              : formatStatKey(kitData.ascensionStat.key).replace('%', '')
                        )}${kitData.ascensionStat.value ? ` +${kitData.ascensionStat.value}${kitData.ascensionStat.key === 'eleMas' ? '' : '%'}` : ''}</span>`
                      : `<span class="pill pill-violet">${escapeHtml(kitAnalysis.primaryScaling)}</span>`
                  }
                </div>
              </div>
            </div>

            <div class="card-eyebrow" style="margin-top:14px;">COMPUTED COMBAT STATS</div>
            <div class="combat-stats-grid mono">
              <div class="combat-stat-box"><span class="stat-label">MAX HP</span><span class="stat-val">${combat.maxHp.toLocaleString()}</span></div>
              <div class="combat-stat-box"><span class="stat-label">TOTAL ATK</span><span class="stat-val">${combat.totalAtk.toLocaleString()}</span></div>
              <div class="combat-stat-box"><span class="stat-label">TOTAL DEF</span><span class="stat-val">${combat.totalDef.toLocaleString()}</span></div>
              <div class="combat-stat-box"><span class="stat-label">ELEMENTAL MASTERY</span><span class="stat-val">${combat.em}</span></div>
              ${
                kitAnalysis.isNonCrit
                  ? '<div class="combat-stat-box is-span-2"><span class="stat-label">CRIT PROFILE</span><span class="pill pill-amber">NON-CRIT KIT (-100% CR)</span></div>'
                  : `<div class="combat-stat-box"><span class="stat-label">CRIT RATE</span><span class="stat-val">${combat.critRate.toFixed(1)}%</span></div>
                     <div class="combat-stat-box"><span class="stat-label">CRIT DMG</span><span class="stat-val">${combat.critDmg.toFixed(1)}%</span></div>`
              }
              <div class="combat-stat-box"><span class="stat-label">ENERGY RECHARGE</span><span class="stat-val ${erColorClass}">${combat.er.toFixed(1)}%</span></div>
              <div class="combat-stat-box"><span class="stat-label">${combat.healingBonus > 0 && kitAnalysis.isNonCrit ? 'HEAL BONUS' : dmgLabel.toUpperCase()}</span><span class="stat-val">${(combat.healingBonus > 0 && kitAnalysis.isNonCrit ? combat.healingBonus : combat.dmgBonus).toFixed(1)}%</span></div>
            </div>

            <div class="dossier-grade-block">
              <div class="dossier-grade-head mono">
                <span>BUILD EFFICIENCY (RV%)</span>
                <span class="text-mint">${combat.rvPct}% (${combat.usefulRolls} / 38 useful rolls)</span>
              </div>
              <div class="progress-track"><div class="progress-fill" style="width:${combat.rvPct}%"></div></div>
              ${
                !kitAnalysis.isNonCrit
                  ? `<div class="dossier-cv-row mono"><span>Substat Crit Value</span><span class="text-sky">${combat.subCv.toFixed(1)} CV</span></div>`
                  : ''
              }
              ${kitAnalysis.statCaps
                .map((cap) => {
                  const cur = Number(combat[cap.statKey]) || 0;
                  const pct = Math.min(100, Math.round((cur / cap.capValue) * 100));
                  return `
                    <div class="dossier-cap-row">
                      <div class="dossier-grade-head mono">
                        <span>${escapeHtml(cap.label)}</span>
                        <span>${cur.toLocaleString()} / ${cap.capValue.toLocaleString()}</span>
                      </div>
                      <div class="progress-track"><div class="progress-fill is-cyan" style="width:${pct}%"></div></div>
                    </div>`;
                })
                .join('')}
            </div>

            <div class="dossier-er-card ${erCardStateClass}">
              <div class="dossier-er-head">
                <div class="card-eyebrow" style="margin:0;">TEAM-CONTEXT CAPABILITIES</div>
                <span class="pill ${erPillClass} mono er-status-pill">
                  ${erPillLabel}
                  <span
                    class="er-source-badge ${erReport.dataSource === 'KQM_TCL' ? 'is-kqm' : 'is-parser'}"
                    title="${erReport.dataSource === 'KQM_TCL' ? 'KQM verified' : 'Kit parser estimate'}"
                    data-tooltip="${erReport.dataSource === 'KQM_TCL' ? 'KQM verified' : 'Kit parser estimate'}"
                    aria-label="${erReport.dataSource === 'KQM_TCL' ? 'KQM verified' : 'Kit parser estimate'}"
                  >${erReport.dataSource === 'KQM_TCL' ? '✓' : '?'}</span>
                </span>
              </div>
              ${
                teamCaps.buffCap
                  ? `<div class="dossier-cap-item">
                      <div class="dossier-grade-head mono" style="font-size:12px;">
                        <span class="dossier-cap-label">Buff Cap (${escapeHtml(teamCaps.buffCap.source)}): ${teamCaps.buffCap.capPct}%</span>
                        <span>${teamCaps.buffCap.currentStat.toLocaleString()} / ${teamCaps.buffCap.requiredStat.toLocaleString()} ${teamCaps.buffCap.statLabel}</span>
                      </div>
                      <div class="progress-track sm"><div class="progress-fill ${teamCaps.buffCap.capPct >= 100 ? '' : 'is-cyan'}" style="width:${teamCaps.buffCap.capPct}%"></div></div>
                      ${
                        teamCaps.buffCap.gap > 0
                          ? `<div class="muted mono" style="font-size:11.5px;">+${teamCaps.buffCap.gap.toLocaleString()} ${teamCaps.buffCap.statLabel} needed to max team buff</div>`
                          : ''
                      }
                    </div>`
                  : teamCaps.utilitySummary
                    ? `<div class="dossier-cap-item"><span class="dossier-cap-label">Team Utility:</span> ${escapeHtml(teamCaps.utilitySummary)}</div>`
                    : ''
              }
              ${
                teamCaps.supportGear.length
                  ? `<div class="dossier-cap-item"><span class="dossier-cap-label">Support Gear:</span> ${escapeHtml(teamCaps.supportGear.join(' · '))}</div>`
                  : ''
              }
              <p class="dossier-er-summary ${erReport.erStatus === 'short' ? 'text-coral' : erReport.erStatus === 'warn' ? 'text-amber' : ''}"><span class="dossier-cap-label">Energy:</span> ${escapeHtml(erReport.summary)}</p>
              ${erReport.particleNote ? `<p class="muted mono" style="margin:0;font-size:11.5px;">Particles: ${escapeHtml(erReport.particleNote)}</p>` : ''}
              ${erReport.burstTriggerNote ? `<p class="dossier-er-summary text-amber">${escapeHtml(erReport.burstTriggerNote)}</p>` : ''}
              ${
                erReport.teamVerdicts.length
                  ? `<div class="dossier-er-teams mono">
                      ${erReport.teamVerdicts
                        .map(
                          (tv) => `
                        <div class="dossier-er-team-row">
                          <span>${escapeHtml(tv.teamName)} (Req ~${tv.reqEr}%)</span>
                          <span class="pill ${tv.delta >= 0 ? 'pill-mint' : tv.delta >= -12 ? 'pill-gold' : 'pill-coral'}">${tv.status}</span>
                        </div>`
                        )
                        .join('')}
                    </div>`
                  : ''
              }
              ${
                erReport.hasEndgameFlag
                  ? `<div class="dossier-er-team-row mono" style="margin-top:6px;">
                      <span>Solo Stygian / Theatre (~${erReport.soloEndgameReq}%)</span>
                      <span class="pill ${erReport.soloDelta >= 0 ? 'pill-mint' : 'pill-coral'}">${erReport.soloDelta >= 0 ? 'SAFE' : `${erReport.soloDelta}% ER`}</span>
                    </div>`
                  : ''
              }
            </div>
          </article>
        </aside>

        <section class="dossier-right-col">
          <article class="card dossier-workspace-card">
            <div class="dossier-tabs">
              <button type="button" class="filter-pill ${activeTab === 'loadout' ? 'active' : ''}" data-dossier-tab="loadout">Loadout &amp; Artifacts</button>
              <button type="button" class="filter-pill ${activeTab === 'talents' ? 'active' : ''}" data-dossier-tab="talents">Talents &amp; Passives</button>
              <button type="button" class="filter-pill ${activeTab === 'targets' ? 'active' : ''}" data-dossier-tab="targets">Build Targets &amp; Kit Notes</button>
            </div>
            <div class="dossier-tab-body">
              ${
                activeTab === 'talents'
                  ? renderDossierTalentsTab(c, kitData, kitAnalysis, effTalents)
                  : activeTab === 'targets'
                    ? renderDossierTargetsTab(c, isReadOnly, kitData, kitAnalysis, erReport, weaponMeta)
                    : renderDossierLoadoutTab(c, weaponStats, kitAnalysis)
              }
            </div>
          </article>
        </section>
      </div>
    </div>`;
}

export function renderRosterTab(container, state, handlers) {
  const { account, isReadOnly, rosterFilter } = state;
  const ownedMap = new Map((account.characters || []).map((c) => [c.key, c]));
  const prefarmSet = new Set((account.prefarmQueue || []).map((p) => p.characterKey));

  const weaponByLocation = new Map();
  for (const w of account.weapons || []) {
    if (w.location) weaponByLocation.set(w.location, w);
  }

  const artifactsByLocation = new Map();
  for (const a of account.artifacts || []) {
    if (!a.location) continue;
    if (!artifactsByLocation.has(a.location)) artifactsByLocation.set(a.location, []);
    artifactsByLocation.get(a.location).push(a);
  }

  const allKeys = new Set([
    ...ownedMap.keys(),
    ...getAllCharacterKeys()
  ]);

  const combinedChars = Array.from(allKeys).map((key) => {
    const meta = getCharacterMeta(key);
    const owned = ownedMap.get(key);
    const equippedArtifacts = artifactsByLocation.get(key) || [];
    const subCv = calcArtifactSubCv(equippedArtifacts);
    if (!owned || owned.status === 'Unowned' || owned.owned === false) {
      return {
        key,
        meta,
        owned: false,
        level: owned?.level || 0,
        targetLevel: owned?.targetLevel || 90,
        constellation: owned?.constellation || 0,
        talent: owned?.talent || { auto: 1, skill: 1, burst: 1 },
        targetTalents: owned?.targetTalents || '9/9/9',
        status: 'Unowned',
        priorityRank: owned?.priorityRank || '',
        swapTag: owned?.swapTag || '',
        notes: owned?.notes || '',
        equippedWeapon: null,
        equippedArtifacts: [],
        subCv: 0
      };
    }

    const effectiveStatus =
      prefarmSet.has(key) && owned.status !== 'Built'
        ? 'Active Prefarm'
        : owned.status || 'In Progress';

    return {
      key,
      meta,
      owned: true,
      level: Number(owned.level) || 1,
      ascension: Number(owned.ascension) || 0,
      targetLevel: Number(owned.targetLevel) || 90,
      constellation: Number(owned.constellation) || 0,
      talent: owned.talent || { auto: 1, skill: 1, burst: 1 },
      targetTalents: owned.targetTalents || '9/9/9',
      status: effectiveStatus,
      priorityRank: owned.priorityRank || '',
      swapTag: owned.swapTag || '',
      notes: owned.notes || '',
      equippedWeapon: weaponByLocation.get(key) || null,
      equippedArtifacts,
      subCv
    };
  });

  const q = (rosterFilter.search || '').trim().toLowerCase();
  const statusFilter = rosterFilter.status || 'All';
  const elementFilter = rosterFilter.element || 'All';
  const sortBy = rosterFilter.sortBy || 'priority';
  const density = rosterFilter.density === 'list' ? 'list' : 'grid';
  const tiersState = rosterFilter.tiers || { active: true, built: true, archive: false };

  const filteredChars = combinedChars.filter((c) => {
    if (statusFilter === 'Active Work' && c.status !== 'Active Prefarm' && c.status !== 'In Progress') return false;
    if (statusFilter === 'Combat Ready' && c.status !== 'Built') return false;
    if (statusFilter === 'Swap Flagged' && !isSwapFlagged(c)) return false;
    if (elementFilter !== 'All' && c.meta.element !== elementFilter) return false;
    if (q && !c.meta.name.toLowerCase().includes(q) && !c.key.toLowerCase().includes(q)) return false;
    return true;
  });

  const activeTier = sortCharacters(
    filteredChars.filter((c) => c.status === 'Active Prefarm' || c.status === 'In Progress'),
    sortBy,
    'active'
  );
  const builtTier = sortCharacters(
    filteredChars.filter((c) => c.status === 'Built'),
    sortBy,
    'built'
  );
  const archiveTier = sortCharacters(
    filteredChars.filter((c) => c.status === 'Bench' || c.status === 'Unowned'),
    sortBy,
    'archive'
  );
  const dossierNavList = [...activeTier, ...builtTier, ...archiveTier];

  const inspectedChar = rosterFilter.inspectedKey
    ? combinedChars.find((c) => c.key === rosterFilter.inspectedKey) || null
    : null;

  if (inspectedChar) {
    // Trigger background kit & weapon stat hydration if not cached yet
    const needsKit = !getCharacterKit(inspectedChar.key);
    const wepKey = inspectedChar.equippedWeapon?.key;
    const needsWep = Boolean(wepKey && !getWeaponStats(wepKey));
    if (needsKit || needsWep) {
      Promise.all([
        needsKit ? ensureCharacterKitAndStats(inspectedChar.key) : Promise.resolve(null),
        needsWep ? ensureWeaponStats(wepKey) : Promise.resolve(null)
      ]).then(([kitRes, wepRes]) => {
        if ((kitRes || wepRes) && state.rosterFilter?.inspectedKey === inspectedChar.key) {
          handlers.onRefreshView?.();
        }
      });
    }

    container.innerHTML = renderCharacterDossier(
      inspectedChar,
      dossierNavList,
      account,
      isReadOnly,
      rosterFilter.dossierTab || 'loadout'
    );

    container.querySelector('[data-dossier-back]')?.addEventListener('click', () => {
      handlers.onChangeRosterFilter({ inspectedKey: null });
    });

    container.querySelectorAll('[data-inspect-char]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.inspectChar) {
          handlers.onChangeRosterFilter({ inspectedKey: btn.dataset.inspectChar });
        }
      });
    });

    container.querySelectorAll('[data-dossier-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        handlers.onChangeRosterFilter({ dossierTab: btn.dataset.dossierTab });
      });
    });

    const form = container.querySelector('[data-inspector-form]');
    if (form) {
      const previewEl = form.querySelector('#dossier-roi-preview');
      const liveInputs = form.querySelectorAll('input[name="tAuto"],input[name="tSkill"],input[name="tBurst"],input[name="tgtAuto"],input[name="tgtSkill"],input[name="tgtBurst"]');
      if (previewEl && liveInputs.length) {
        const updateLivePreview = () => {
          const clampLv = (name, fallback) => {
            const val = Number(form.querySelector(`[name="${name}"]`)?.value);
            return Number.isFinite(val) ? Math.min(10, Math.max(1, val)) : fallback;
          };
          const liveKit = getCharacterKit(inspectedChar.key);
          const liveEff = computeEffectiveTalents(inspectedChar, liveKit);
          const liveAnalysis = analyzeCharacterKit(
            inspectedChar.key,
            liveKit,
            liveEff.effective,
            inspectedChar.constellation || 0
          );
          previewEl.innerHTML = renderTalentRoiPreviewHtml(
            inspectedChar,
            liveKit,
            liveAnalysis,
            {
              auto: clampLv('tAuto', 1),
              skill: clampLv('tSkill', 1),
              burst: clampLv('tBurst', 1)
            },
            {
              auto: clampLv('tgtAuto', 9),
              skill: clampLv('tgtSkill', 9),
              burst: clampLv('tgtBurst', 9)
            }
          );
        };
        liveInputs.forEach((inp) => inp.addEventListener('input', updateLivePreview));
      }
    }
    if (form && !isReadOnly) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const saveBtn = form.querySelector('button[type="submit"]');
        const origText = saveBtn?.textContent || 'Save to Sheet';
        if (saveBtn) {
          saveBtn.disabled = true;
          saveBtn.innerHTML = '<span class="btn-spinner"></span> Saving...';
        }
        try {
          const fd = new FormData(form);
          const clamp = (val, min, max, fallback) => {
            const n = Number(val);
            return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
          };
          const rankRaw = String(fd.get('priorityRank') || '').trim();
          await handlers.onSaveCharacterInspector(form.dataset.inspectorForm, {
            status: String(fd.get('status') || 'Bench'),
            priorityRank: rankRaw ? clamp(rankRaw, 1, 99, '') : '',
            level: clamp(fd.get('level'), 1, 100, 1),
            targetLevel: clamp(fd.get('targetLevel'), 1, 100, 90),
            talent: {
              auto: clamp(fd.get('tAuto'), 1, 10, 1),
              skill: clamp(fd.get('tSkill'), 1, 10, 1),
              burst: clamp(fd.get('tBurst'), 1, 10, 1)
            },
            targetTalents: `${clamp(fd.get('tgtAuto'), 1, 10, 9)}/${clamp(fd.get('tgtSkill'), 1, 10, 9)}/${clamp(fd.get('tgtBurst'), 1, 10, 9)}`,
            notes: String(fd.get('notes') || '')
          });
        } finally {
          if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = origText;
          }
        }
      });
    }
    return;
  }

  const filteredWeapons = [...(account.weapons || [])]
    .filter((w) => {
      if (!q) return true;
      const wm = getWeaponMeta(w.key);
      return wm.name.toLowerCase().includes(q) || w.key.toLowerCase().includes(q) || (w.location || '').toLowerCase().includes(q);
    })
    .sort((a, b) => b.level - a.level || b.refinement - a.refinement);

  container.innerHTML = `
    <div class="section-header">
      <div>
        <div class="eyebrow">AARUDB / ROSTER</div>
        <h1 class="section-title">Roster &amp; Armory</h1>
      </div>
      <div class="header-meta mono">
        OWNED: <span class="text-gold">${combinedChars.filter((c) => c.owned).length}</span> CHARS • <span class="text-mint">${(account.weapons || []).length}</span> WEAPONS
      </div>
    </div>

    <article class="card">
      <div class="roster-toolbar roster-toolbar-single">
        <div class="roster-toolbar-left">
          <div class="subtab-switch">
            <button type="button" class="filter-pill ${rosterFilter.view === 'characters' ? 'active' : ''}" data-roster-view="characters">Characters (${filteredChars.length})</button>
            <button type="button" class="filter-pill ${rosterFilter.view === 'weapons' ? 'active' : ''}" data-roster-view="weapons">Weapons (${filteredWeapons.length})</button>
          </div>
          <div class="filter-pills">
            ${STATUS_PILLS.map(
              (st) => `<button type="button" class="filter-pill ${statusFilter === st.id ? 'active' : ''}" data-roster-status="${st.id}">${st.label}</button>`
            ).join('')}
          </div>
        </div>

        <div class="roster-toolbar-right">
          <div class="filter-pills elem-pills-compact">
            ${ELEMENT_PILLS.map(
              (el) => `<button type="button" class="filter-pill ${elementFilter === el ? 'active' : ''}" data-roster-element="${el}">${el === 'All' ? 'All' : el}</button>`
            ).join('')}
          </div>
          <select class="select-sm mono roster-sort-select" data-roster-sort aria-label="Sort characters">
            ${SORT_OPTIONS.map(
              (opt) => `<option value="${opt.value}" ${sortBy === opt.value ? 'selected' : ''}>${opt.label}</option>`
            ).join('')}
          </select>
          <input type="search" class="input-search input-search-sm" placeholder="Search..." value="${escapeHtml(rosterFilter.search || '')}" data-roster-search />
          <div class="subtab-switch">
            <button type="button" class="filter-pill ${density === 'grid' ? 'active' : ''}" data-roster-density="grid">Grid</button>
            <button type="button" class="filter-pill ${density === 'list' ? 'active' : ''}" data-roster-density="list">List</button>
          </div>
        </div>
      </div>

      ${
        rosterFilter.view === 'characters'
          ? `
        <div class="roster-tiers">
          ${renderTierSection('active', 'Active Prefarm & In Progress', activeTier, tiersState.active, density)}
          ${renderTierSection('built', 'Combat Ready / Built', builtTier, tiersState.built, density)}
          ${renderTierSection('archive', 'Bench & Unowned Archive', archiveTier, tiersState.archive, density)}
        </div>`
          : `
        <div class="roster-grid">
          ${filteredWeapons.length
            ? filteredWeapons
                .map((w) => {
                  const wm = getWeaponMeta(w.key);
                  const holderMeta = w.location ? getCharacterMeta(w.location) : null;
                  return `
                  <div class="roster-card">
                    <div class="roster-card-top">
                      <div class="roster-identity">
                        ${renderAssetIcon('weapons', w.key, wm.name, 'icon-md')}
                        <div>
                          <div class="item-name">${escapeHtml(wm.name)}</div>
                          <div class="item-meta mono">${escapeHtml(wm.weaponType)} • ${wm.rarity}★</div>
                        </div>
                      </div>
                      <span class="pill mono ${w.level >= 90 ? 'pill-mint' : ''}">Lv.${w.level}</span>
                    </div>
                    <div class="roster-stats mono">
                      <div class="stat-box">
                        <span class="stat-label">REFINEMENT</span>
                        <span class="stat-val text-gold">R${w.refinement}</span>
                      </div>
                      <div class="stat-box">
                        <span class="stat-label">ASC</span>
                        <span class="stat-val">A${w.ascension}</span>
                      </div>
                      <div class="stat-box">
                        <span class="stat-label">EQUIPPED</span>
                        <span class="stat-val">${holderMeta ? escapeHtml(holderMeta.name) : 'Unassigned'}</span>
                      </div>
                    </div>
                  </div>`;
                })
                .join('')
            : '<div class="empty-state">No weapons match the search query.</div>'}
        </div>`
      }
    </article>
  `;

  container.querySelectorAll('[data-roster-status]').forEach((btn) => {
    btn.addEventListener('click', () => handlers.onChangeRosterFilter({ status: btn.dataset.rosterStatus }));
  });

  container.querySelectorAll('[data-roster-element]').forEach((btn) => {
    btn.addEventListener('click', () => handlers.onChangeRosterFilter({ element: btn.dataset.rosterElement }));
  });

  container.querySelector('[data-roster-sort]')?.addEventListener('change', (e) => {
    handlers.onChangeRosterFilter({ sortBy: e.target.value });
  });

  container.querySelectorAll('[data-roster-density]').forEach((btn) => {
    btn.addEventListener('click', () => handlers.onChangeRosterFilter({ density: btn.dataset.rosterDensity }));
  });

  container.querySelectorAll('[data-roster-view]').forEach((btn) => {
    btn.addEventListener('click', () => handlers.onChangeRosterFilter({ view: btn.dataset.rosterView }));
  });

  container.querySelector('[data-roster-search]')?.addEventListener('input', (e) => {
    handlers.onChangeRosterFilter({ search: e.target.value }, { preserveFocusSelector: '[data-roster-search]' });
  });

  container.querySelectorAll('.roster-tier').forEach((det) => {
    det.addEventListener('toggle', () => {
      const id = det.dataset.tierId;
      handlers.onChangeRosterFilter(
        { tiers: { ...tiersState, [id]: det.open } },
        { silent: true }
      );
    });
  });

  container.querySelectorAll('[data-inspect-char]').forEach((card) => {
    card.addEventListener('click', () => {
      handlers.onChangeRosterFilter({ inspectedKey: card.dataset.inspectChar, dossierTab: 'loadout' });
    });
  });
}
