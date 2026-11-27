import { renderAssetIcon, renderGachaSplash } from './assets.js?v=20261121p64';
import {
  ensureCharacterKitAndStats,
  ensureWeaponStats,
  getAllCharacterKeys,
  getArtifactIcon,
  getCharacterKit,
  getCharacterMeta,
  getWeaponMeta,
  getWeaponStats
} from './catalog.js?v=20261127p113';
import {
  analyzeCharacterKit,
  buildKitProfile,
  calcTalentUpgradeDiff,
  computeCharacterCombatStats,
  computeEffectiveTalents,
  deriveTalentPriority,
  evaluateErComfort,
  evaluateTeamCapabilities,
  generateKitInsights,
  rankWeaponsByArchetype
} from './build-science.js?v=20261125p67';

const ELEMENT_PILLS = ['All', 'Pyro', 'Hydro', 'Anemo', 'Electro', 'Dendro', 'Cryo', 'Geo'];
const CHARACTER_ALIASES = {
  sandrone: ['marionette'],
  tartaglia: ['childe', 'ajax'],
  wanderer: ['scaramouche', 'kunikuzushi', 'hat guy'],
  arlecchino: ['knave', 'peruere'],
  raidenshogun: ['ei', 'baal', 'beelzebul', 'raiden'],
  zhongli: ['morax', 'rex lapis'],
  venti: ['barbatos'],
  nahida: ['kusanali', 'lesser lord kusanali', 'buer'],
  furina: ['focalors'],
  mavuika: ['haborym'],
  anastasya: ['tsaritsa'],
  anastasia: ['tsaritsa'],
  columbina: ['damselette'],
  capitano: ['thrain'],
  dottore: ['zandik'],
  neuvillette: ['iudex'],
  hutao: ['hu tao'],
  fischl: ['amy', 'prinzessin'],
  xingqiu: ['xq'],
  xiangling: ['xl'],
  bennett: ['benny'],
  traveler: ['aether', 'lumine']
};
let ownedFilter = 'all';
let rosterSubView = 'catalog';
let rosterFormDirty = false;
let rosterModalEscCleanup = null;
const INSPECTOR_STATUSES = ['Active Prefarm', 'In Progress', 'Built', 'Bench', 'Unowned'];
const SLOT_ORDER = { flower: 0, plume: 1, sands: 2, goblet: 3, circlet: 4 };
const STAT_LABELS = {
  hp: 'HP', hp_: 'HP%', atk: 'ATK', atk_: 'ATK%', def: 'DEF', def_: 'DEF%',
  eleMas: 'EM', enerRech_: 'ER%', critRate_: 'CRIT Rate', critDMG_: 'CRIT DMG',
  heal_: 'Healing%', pyro_dmg_: 'Pyro DMG%', hydro_dmg_: 'Hydro DMG%',
  electro_dmg_: 'Electro DMG%', cryo_dmg_: 'Cryo DMG%', anemo_dmg_: 'Anemo DMG%',
  geo_dmg_: 'Geo DMG%', dendro_dmg_: 'Dendro DMG%', physical_dmg_: 'Phys DMG%'
};

let weaponMatrixState = { charKey: null, archetype: null, scope: 'holistic', filter: 'all', fullView: false };
let talentTextMode = 'razor';
let codexSectionFilter = 'talents';
let allCharsDrawerOpen = false;
let rosterScrollCleanup = null;

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatStatKey(k) {
  return STAT_LABELS[k] || String(k || '').replace(/_/g, '');
}

function splitPascalSet(s) {
  return String(s || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/Of/g, 'of').replace(/The/g, 'the');
}

function formatMoraCompact(n) {
  const num = Number(n) || 0;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${Math.round(num / 1_000)}k`;
  return String(num);
}

function cleanKitText(raw) {
  return String(raw || '')
    .replace(/<\/?(?:color|i|b|size)[^>]*>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function toTitleCaseLabel(str) {
  const s = String(str || '').trim();
  if (!s) return '';
  if (s === s.toUpperCase()) {
    return s
      .toLowerCase()
      .replace(/\b\w/g, (ch) => ch.toUpperCase())
      .replace(/\bEr\b/g, 'ER')
      .replace(/\bC0\b/g, 'C0');
  }
  return s;
}

function toRazorMode(raw) {
  const clean = cleanKitText(raw);
  if (!clean) return 'No description available.';
  const sentences = clean.split(/(?<=[.!?])\s+/).filter((s) => s.length > 8);
  const pool = sentences.filter((s) =>
    /\d|%|CD|Energy|CRIT|ATK|HP|DEF|EM|DMG|Elemental|Burst|Skill|stack|restore|shield|heal/i.test(s)
  );
  const chosen = pool.length ? pool : sentences;
  if (!chosen.length) return clean;
  if (chosen.length >= 2 && `${chosen[0]} ${chosen[1]}`.length <= 260) {
    return `${chosen[0]} ${chosen[1]}`;
  }
  return chosen[0];
}

const REACTION_TERM_RE = /\b(?:(?:Lunar|Stellar)[-\s](?:Glimmer|Swirl|Conduct|Bloom|Charged|Melt|Vaporize|Crystallize)(?:\s+DMG)?|(?:Cryo|Pyro|Hydro|Electro)\s+Swirl(?:\s+reaction)?|Vaporize|Melt|Overloaded|Superconduct|Electro-Charged|Shattered?|Swirl|Burning|Bloom|Hyperbloom|Burgeon|Crystallize|Quicken|Aggravate|Spread)\b/gi;

function highlightReactionTerms(escapedHtml) {
  return String(escapedHtml || '')
    .split(/(<[^>]+>)/g)
    .map((part) => (part.startsWith('<') ? part : part.replace(REACTION_TERM_RE, '<span class="ed-kit-reaction">$&</span>')))
    .join('');
}

function formatKitDescription(desc) {
  const normalized = String(desc || '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+([.,;:!?])/g, '$1');
  const html = escapeHtml(normalized)
    .replace(/&lt;color=[^&]*&gt;([\s\S]*?)&lt;\/color&gt;/gi, '<span class="ed-kit-term">$1</span>')
    .replace(/&lt;\/?color[^&]*&gt;/gi, '')
    .replace(/&lt;i&gt;([\s\S]*?)&lt;\/i&gt;/gi, '<em>$1</em>')
    .replace(/\n/g, '<br />');
  return highlightReactionTerms(html);
}

function renderKitDescription(desc, isRazor) {
  return isRazor ? highlightReactionTerms(escapeHtml(toRazorMode(desc))) : formatKitDescription(desc);
}

function matchesCharacterSearch(c, q) {
  if (!q) return true;
  const keyLower = String(c.key || '').toLowerCase();
  const nameLower = String(c.meta?.name || '').toLowerCase();
  if (nameLower.includes(q) || keyLower.includes(q)) return true;
  const aliases = CHARACTER_ALIASES[keyLower] || CHARACTER_ALIASES[nameLower.replace(/[^a-z0-9]/g, '')] || [];
  return aliases.some((a) => a.includes(q));
}

function sortCharacters(list, sortBy, section) {
  const arr = [...list];
  arr.sort((a, b) => {
    if (sortBy === 'name') return a.meta.name.localeCompare(b.meta.name);
    if (sortBy === 'element') return String(a.meta.element || '').localeCompare(String(b.meta.element || '')) || b.level - a.level || a.meta.name.localeCompare(b.meta.name);
    if (sortBy === 'rarity') return (b.meta.rarity || 5) - (a.meta.rarity || 5) || b.level - a.level || a.meta.name.localeCompare(b.meta.name);
    if (sortBy === 'priority') return (Number(a.priorityRank) || 9999) - (Number(b.priorityRank) || 9999) || b.level - a.level;
    if (section === 'archive') return (b.meta.rarity || 5) - (a.meta.rarity || 5) || a.meta.name.localeCompare(b.meta.name);
    return b.level - a.level || (b.meta.rarity || 5) - (a.meta.rarity || 5) || a.meta.name.localeCompare(b.meta.name);
  });
  return arr;
}

function renderTalentRoiPreviewHtml(c, kitData, kitAnalysis, curTalents, tgtTalents) {
  const diffs = ['auto', 'skill', 'burst']
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
    return `<div class="muted" style="font-size:12px;">Change target levels to preview talent scaling and Mora costs.</div>`;
  }

  let totalMora = 0;
  let totalBooks = 0;
  let totalWeekly = 0;
  let totalCrown = 0;
  for (const d of diffs) {
    totalMora += d.cost?.mora || 0;
    totalBooks += (d.cost?.books?.Teachings || 0) + (d.cost?.books?.Guide || 0) + (d.cost?.books?.Philosophies || 0);
    totalWeekly += d.cost?.weekly || 0;
    totalCrown += d.cost?.crown || 0;
  }

  const parts = [`${formatMoraCompact(totalMora)} Mora`];
  if (totalBooks) parts.push(`${totalBooks} Books`);
  if (totalWeekly) parts.push(`${totalWeekly} Weekly`);
  if (totalCrown) parts.push(`${totalCrown} Crown`);

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 10px;background:var(--bg-inset);border:1px solid var(--border-subtle);" class="mono ui-micro">
      <span>Upgrade Cost: <strong>${escapeHtml(parts.join(' · '))}</strong></span>
      <span class="text-mint">${diffs.map((d) => `${d.slot.toUpperCase()} +${d.pctGain?.toFixed(1) || '0.0'}%`).join(' · ')}</span>
    </div>`;
}

function extractKitTelemetry(t, c, kitData, kitAnalysis, curLv, tgtLv, talentPriority = null) {
  const desc = String(t?.description || '');
  const cdMatch = desc.match(/CD[:\s]+([\d.]+\s*s)/i);
  const energyMatch = desc.match(/Energy\s*Cost[:\s]+(\d+)/i);
  const slot = t.kind === 'normal' ? 'auto' : t.kind === 'skill' ? 'skill' : 'burst';
  const diff = calcTalentUpgradeDiff(c.key, kitData, slot, curLv, Math.max(curLv, tgtLv), c.constellation || 0, kitAnalysis);
  const tier = talentPriority?.tiers?.[slot] || 'low';
  const priorityLabel = tier === 'high' ? 'Top Priority' : tier === 'medium' ? 'Secondary' : 'Optional';
  return {
    slot,
    priorityLabel,
    cd: cdMatch ? cdMatch[1] : null,
    energy: energyMatch ? energyMatch[1] : slot === 'burst' && c.meta?.burstCost ? String(c.meta.burstCost) : null,
    diff
  };
}

function renderAstrolabeCompassSvg() {
  return `<svg class="ed-astrolabe-watermark" viewBox="0 0 180 180" aria-hidden="true">
    <circle cx="90" cy="90" r="78" fill="none" stroke="currentColor" stroke-width="0.8" stroke-dasharray="3 4" />
    <circle cx="90" cy="90" r="56" fill="none" stroke="currentColor" stroke-width="0.8" />
    <line x1="90" y1="6" x2="90" y2="174" stroke="currentColor" stroke-width="0.6" />
    <line x1="6" y1="90" x2="174" y2="90" stroke="currentColor" stroke-width="0.6" />
    <polygon points="90,18 96,84 162,90 96,96 90,162 84,96 18,90 84,84" fill="none" stroke="currentColor" stroke-width="0.7" />
  </svg>`;
}

function renderStatRadarSvg(combat, kitAnalysis) {
  const axes = [
    { label: 'ATK', ratio: Math.min(1, (combat.totalAtk || 0) / 2400) },
    { label: 'CRIT', ratio: kitAnalysis?.isNonCrit ? 0.25 : Math.min(1, ((combat.critRate || 0) * 2 + (combat.critDmg || 0)) / 320) },
    { label: 'ER', ratio: Math.min(1, (combat.er || 100) / 220) },
    { label: 'EM', ratio: Math.min(1, (combat.em || 0) / 800) },
    { label: 'DMG', ratio: Math.min(1, (combat.dmgBonus || 0) / 80) }
  ];
  const cx = 74;
  const cy = 68;
  const rMax = 44;
  const pt = (idx, scale) => {
    const ang = (-Math.PI / 2) + (idx * 2 * Math.PI) / axes.length;
    return [cx + Math.cos(ang) * rMax * scale, cy + Math.sin(ang) * rMax * scale];
  };
  const web = (scale) => axes.map((_, i) => pt(i, scale).map((n) => n.toFixed(1)).join(',')).join(' ');
  const poly = axes.map((a, i) => pt(i, Math.max(0.14, a.ratio)).map((n) => n.toFixed(1)).join(',')).join(' ');
  return `<svg class="ed-stat-radar-svg" viewBox="0 0 148 136" role="img" aria-label="Build Stat Profile Radar">
    <polygon points="${web(1)}" class="ed-radar-ring" />
    <polygon points="${web(0.6)}" class="ed-radar-ring" />
    ${axes.map((_, i) => {
      const [x, y] = pt(i, 1);
      return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="ed-radar-axis" />`;
    }).join('')}
    <polygon points="${poly}" class="ed-radar-area" />
    ${axes.map((a, i) => {
      const [x, y] = pt(i, 1.24);
      return `<text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="middle" class="ed-radar-lbl">${a.label}</text>`;
    }).join('')}
  </svg>`;
}

function buildDiagnosisItems(c, combat, erReport, kitAnalysis, slotDiffs = []) {
  const items = [];
  if (!c.owned) {
    items.push({ tone: 'warn', text: `Catalog preview — set as Build Target to track prefarming.` });
    return items;
  }
  const soloDelta = Math.round((combat.er || 100) - (erReport.baseReq || 100));
  if (!erReport.zeroEnergyImmune) {
    if (soloDelta < -10) {
      items.push({
        tone: 'short',
        text: `ER ${Math.round(combat.er)}% is ${Math.abs(soloDelta)}% below solo baseline (${erReport.baseReq}%) — run Favonius or ER Sands.`
      });
    } else {
      items.push({
        tone: 'ok',
        text: `ER ${Math.round(combat.er)}% meets ${erReport.baseReq}% solo comfort baseline.`
      });
    }
  }
  if (!kitAnalysis?.isNonCrit && combat.dmgBonus < 15 && combat.em < 400) {
    items.push({
      tone: 'warn',
      text: `${c.meta.element} DMG% is ${combat.dmgBonus.toFixed(1)}% — check Goblet main stat.`
    });
  }
  if (combat.wrvPct > 0) {
    items.push({
      tone: combat.wrvPct >= 70 ? 'ok' : combat.wrvPct >= 45 ? 'warn' : 'short',
      text:
        combat.wrvPct >= 70
          ? `Strong artifact efficiency (${combat.wrvPct}% wRV · ${combat.wrvGrade}).`
          : `Artifact quality ${combat.wrvPct}% wRV (${combat.wrvGrade}) — substat upgrades available.`
    });
  }
  const bestUpgrade = [...slotDiffs]
    .filter((d) => d.pctGain > 0.5)
    .sort((a, b) => b.pctGain - a.pctGain)[0];
  if (bestUpgrade) {
    items.push({
      tone: 'ok',
      text: `Next talent ROI: ${bestUpgrade.slotLabel} (+${bestUpgrade.pctGain.toFixed(1)}% DMG).`
    });
  }
  return items.slice(0, 3);
}

function renderCatalogTile(c, isActive, badge = '') {
  const elemLower = String(c.meta.element || 'geo').toLowerCase();
  const rarity = Math.max(4, Math.min(5, Number(c.meta.rarity) || 5));
  return `
    <button
      type="button"
      class="ed-catalog-tile ${isActive ? 'is-active' : ''} ${c.owned ? '' : 'is-unowned'}"
      data-element="${escapeHtml(elemLower)}"
      data-rarity="${rarity}"
      data-inspect-char="${escapeHtml(c.key)}"
      title="${escapeHtml(c.meta.name)} (${escapeHtml(c.meta.element)})"
    >
      <div class="ed-catalog-portrait">${renderAssetIcon('characters', c.key, c.meta.name, 'icon-md')}</div>
      <div class="ed-catalog-name">${escapeHtml(c.meta.name)}</div>
      <div class="ed-catalog-sub mono">${badge ? `${escapeHtml(badge)} · ` : ''}${c.owned ? `Lv.${c.level}` : `${c.meta.rarity || 5}★`}</div>
    </button>`;
}

function runRosterViewTransition(container, targetKey, direction, mutateFn) {
  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (typeof document.startViewTransition !== 'function' || prefersReduced) {
    mutateFn();
    return;
  }

  const tagTile = (key, enable) => {
    if (!key) return;
    const tile = container.querySelector(`[data-inspect-char="${CSS.escape(key)}"]`);
    if (!tile) return;
    const portrait = tile.querySelector('.ed-catalog-portrait');
    const name = tile.querySelector('.ed-catalog-name');
    if (portrait) portrait.style.viewTransitionName = enable ? 'roster-hero-portrait' : '';
    if (name) name.style.viewTransitionName = enable ? 'roster-hero-title' : '';
  };

  if (direction === 'to-detail') tagTile(targetKey, true);

  const vt = document.startViewTransition(() => {
    mutateFn();
    if (direction === 'to-catalog') tagTile(targetKey, true);
  });

  vt.finished.finally(() => {
    if (direction === 'to-catalog') tagTile(targetKey, false);
  });
}

function renderWeaponSection(c, matrixResult, isFullView = false) {
  const archetypes = matrixResult.archetypes || ['On-Field Carry'];
  const activeArch =
    weaponMatrixState.archetype && archetypes.includes(weaponMatrixState.archetype)
      ? weaponMatrixState.archetype
      : matrixResult.primaryArchetype || archetypes[0];
  const scope = weaponMatrixState.scope === 'armory' ? 'armory' : 'holistic';
  const filter = weaponMatrixState.filter || 'all';
  const holisticList = matrixResult.rankingsByArchetype?.[activeArch] || [];
  const armoryList = matrixResult.armoryByArchetype?.[activeArch] || [];
  const sourceList = scope === 'armory' ? armoryList : holisticList;
  const filtered = sourceList.filter((w) => {
    if (scope === 'holistic' && filter === 'f2p') return w.acquisition === '3_f2p' || w.acquisition === 'craft_event';
    if (scope === 'holistic' && filter === 'four_below') return (w.rarity || 4) <= 4;
    return true;
  });
  const visible = isFullView ? filtered : filtered.slice(0, 8);

  return `
    <div class="hsr-weapons-toolbar">
      <div class="hsr-pill-group">
        ${archetypes
          .map(
            (arch, idx) =>
              `<button type="button" class="filter-pill ${arch === activeArch ? 'active' : ''}" data-matrix-arch="${escapeHtml(arch)}">${escapeHtml(arch)}${idx === 0 && matrixResult.archetypeLock ? ` · ${escapeHtml(matrixResult.archetypeLock)}` : ''}${idx === 0 ? ' (Primary)' : ''}</button>`
          )
          .join('')}
      </div>
      <div class="hsr-pill-group">
        <button type="button" class="filter-pill ${scope === 'holistic' ? 'active' : ''}" data-matrix-scope="holistic">Obtainable Only</button>
        <button type="button" class="filter-pill ${scope === 'armory' ? 'active' : ''}" data-matrix-scope="armory">Owned Only (${armoryList.length})</button>
        ${
          scope === 'holistic'
            ? `<button type="button" class="filter-pill ${filter === 'all' ? 'active' : ''}" data-matrix-filter="all">All</button>
               <button type="button" class="filter-pill ${filter === 'f2p' ? 'active' : ''}" data-matrix-filter="f2p">F2P Craft / Fish</button>
               <button type="button" class="filter-pill ${filter === 'four_below' ? 'active' : ''}" data-matrix-filter="four_below">4★ &amp; Below</button>`
            : ''
        }
        ${
          isFullView
            ? '<button type="button" class="btn btn-ghost btn-xs mono" data-matrix-fullview="close">✕ Close</button>'
            : '<button type="button" class="btn btn-ghost btn-xs mono" data-matrix-fullview="open">⤢ Full View</button>'
        }
      </div>
    </div>

    <div class="hsr-weapon-rows">
      ${
        visible.length
          ? visible
              .map((w, idx) => {
                const rankNum = idx + 1;
                const subText = `${w.substatValue ? `${w.substatValue} ` : ''}${w.substat || 'ATK%'}`;
                const statusLabel = w.isOwned
                  ? w.equippedBy && w.equippedBy !== 'Unassigned'
                    ? `On ${w.equippedBy} · R${w.ownedRefinement || 1}`
                    : `Owned · R${w.ownedRefinement || 1}`
                  : w.acquisition === 'limited_4' || w.acquisition === 'limited_5'
                    ? 'Off-Banner Only'
                    : 'Not Owned';
                const wepRarity = Math.max(1, Math.min(5, Number(w.rarity || getWeaponMeta(w.key)?.rarity) || 4));
                return `
                  <div class="hsr-weapon-row hsr-wep-row ${rankNum === 1 ? 'is-bis' : ''}" data-rarity="${wepRarity}" style="--stagger-i:${idx};">
                    <div class="mono" style="font-weight:700;color:${rankNum === 1 ? 'var(--accent-gold)' : 'var(--text-secondary)'};">${rankNum === 1 ? '#1 BiS' : `#${rankNum}`}</div>
                    <div class="hsr-wep-row-left">
                      ${renderAssetIcon('weapons', w.key, w.name, 'icon-sm')}
                      <div>
                        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                          <strong>${escapeHtml(w.name)}</strong>
                          <span class="hsr-micro-tag mono">R${w.effectiveRefinement || 1}</span>
                          <span class="hsr-micro-tag mono">${escapeHtml(w.acquisitionLabel)}</span>
                        </div>
                        <div class="muted ui-micro">${escapeHtml(subText)} · ${escapeHtml(w.synergyNote || '')}</div>
                      </div>
                    </div>
                    <div class="hsr-wep-row-right mono">
                      <span class="hsr-micro-tag">${w.score}</span>
                      <span class="pill ${w.isOwned ? 'pill-mint' : 'pill-muted'}">${escapeHtml(statusLabel)}</span>
                    </div>
                  </div>`;
              })
              .join('')
          : '<div class="muted mono" style="padding:12px;">No weapons match the current filter.</div>'
      }
    </div>`;
}

function renderArtifactBreakdown(c, combat, sortedArtifacts) {
  if (!sortedArtifacts.length) {
    return `<div class="muted mono" style="padding:12px;border:1px solid var(--border-subtle);background:var(--bg-surface);">No artifacts equipped on ${escapeHtml(c.meta.name)}. Import a GOOD v3 scan to inspect rolls.</div>`;
  }
  return `
    <div style="display:flex;flex-direction:column;gap:8px;">
      ${sortedArtifacts
        .map((a) => {
          const iconUrl = getArtifactIcon(a.setKey, a.slotKey);
          const subs = (a.substats || []).map((s) => `${formatStatKey(s.key)} +${s.value}`).join(' · ');
          return `
            <div style="display:flex;align-items:center;gap:12px;padding:8px 10px;background:var(--bg-surface);border:1px solid var(--border-subtle);">
              <div class="hsr-art-thumb">${iconUrl ? `<img src="${iconUrl}" alt="${escapeHtml(a.slotKey)}" loading="lazy" />` : `<span class="mono">${escapeHtml(a.slotKey)}</span>`}</div>
              <div style="min-width:0;flex:1;">
                <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                  <strong>${escapeHtml(splitPascalSet(a.setKey))} · ${escapeHtml(formatStatKey(a.mainStatKey))}</strong>
                  <span class="mono text-gold">+${a.level ?? 20}</span>
                </div>
                <div class="muted mono ui-micro" style="margin-top:2px;">${escapeHtml(subs || 'No substats')}</div>
              </div>
            </div>`;
        })
        .join('')}
    </div>`;
}

function renderCharacterDossier(c, account, isReadOnly, activeTab = 'build') {
  const normalizedTab = activeTab === 'kit' || activeTab === 'talents' ? 'kit' : 'build';
  const kitData = getCharacterKit(c.key);
  const weaponMeta = c.equippedWeapon ? getWeaponMeta(c.equippedWeapon.key) : null;
  const weaponStats = c.equippedWeapon ? getWeaponStats(c.equippedWeapon.key) : null;
  const combat = computeCharacterCombatStats(c, c.equippedWeapon, c.equippedArtifacts, kitData, weaponStats);
  const kitAnalysis = combat.kitAnalysis;
  const effTalents = computeEffectiveTalents(c, kitData);
  const erReport = evaluateErComfort(c, combat, account.teams || [], account.weapons || [], kitData, kitAnalysis);
  const teamCaps = evaluateTeamCapabilities(c, kitData, combat, weaponMeta, c.equippedArtifacts, erReport);

  if (weaponMatrixState.charKey !== c.key) {
    weaponMatrixState = { charKey: c.key, archetype: null, scope: 'holistic', filter: 'all', fullView: false };
  }
  const matrixProfile = buildKitProfile(
    { ...c, kitData },
    { erReport, combatStats: combat, teamCaps, hasEquippedArtifacts: Array.isArray(c.equippedArtifacts) && c.equippedArtifacts.length > 0 }
  );
  const talentPriority = deriveTalentPriority(matrixProfile);
  const matrixResult = rankWeaponsByArchetype(c, matrixProfile, null, account.weapons || [], {
    erReport, combatStats: combat, teamCaps,
    hasEquippedArtifacts: Array.isArray(c.equippedArtifacts) && c.equippedArtifacts.length > 0,
    getWeaponMetaFn: getWeaponMeta, getWeaponStatsFn: getWeaponStats
  });

  const elemLower = String(c.meta.element || 'geo').toLowerCase();
  const isBuildTarget = c.status === 'Active Prefarm';
  const roleLabel = kitAnalysis.roleInfo?.fieldRole || kitAnalysis.roleInfo?.primaryRole || 'On-Field Carry';
  const utilityChips = (kitAnalysis.roleInfo?.utilityTags || kitAnalysis.roleInfo?.functionTags || []).slice(0, 3);
  const dmgLabel = combat.dmgBonusKey ? formatStatKey(combat.dmgBonusKey) : `${c.meta.element || 'Elem'} DMG%`;
  const primaryArch = matrixResult.primaryArchetype || matrixResult.archetypes?.[0];
  const top2 = (matrixResult.rankingsByArchetype?.[primaryArch] || []).slice(0, 2);
  const sortedArtifacts = [...(c.equippedArtifacts || [])].sort((a, b) => (SLOT_ORDER[a.slotKey] ?? 9) - (SLOT_ORDER[b.slotKey] ?? 9));
  const matchingTeams = (account.teams || []).filter((t) => (t.members || []).some((m) => m.characterKey === c.key)).slice(0, 3);
  const ownedKeySet = new Set((account.characters || []).filter((ch) => ch.owned !== false && ch.status !== 'Unowned').map((ch) => ch.key));
  const soloDelta = Math.round(combat.er - erReport.baseReq);

  const disabledAttr = isReadOnly ? 'disabled' : '';
  const targetTalentsParts = String(c.targetTalents || '9/9/9').split('/').map((n) => Number(n) || 9);
  const tgtAuto = targetTalentsParts[0] || 9;
  const tgtSkill = targetTalentsParts[1] || 9;
  const tgtBurst = targetTalentsParts[2] || 9;
  const curAuto = c.talent?.auto || 1;
  const curSkill = c.talent?.skill || 1;
  const curBurst = c.talent?.burst || 1;
  const talents = kitData?.talents || [];
  const passives = kitData?.passives || [];
  const constellations = kitData?.constellations || [];
  const ownedCon = Number(c.constellation) || 0;
  const isRazor = talentTextMode === 'razor';
  const insights = generateKitInsights(c, kitData, weaponMeta, erReport, kitAnalysis);
  const slotDiffs = [
    { slot: 'auto', slotLabel: 'Normal Attack', cur: curAuto, tgt: tgtAuto },
    { slot: 'skill', slotLabel: 'Elemental Skill', cur: curSkill, tgt: tgtSkill },
    { slot: 'burst', slotLabel: 'Elemental Burst', cur: curBurst, tgt: tgtBurst }
  ].map((s) => ({
    ...s,
    ...calcTalentUpgradeDiff(c.key, kitData, s.slot, s.cur, Math.max(s.cur, s.tgt), ownedCon, kitAnalysis)
  }));
  const diagnosisItems = buildDiagnosisItems(c, combat, erReport, kitAnalysis, slotDiffs);
  const showTalents = codexSectionFilter === 'talents' || codexSectionFilter === 'all';
  const showPassives = codexSectionFilter === 'passives' || codexSectionFilter === 'all';
  const showCons = codexSectionFilter === 'constellations' || codexSectionFilter === 'all';

  return `
    <div class="ed-dossier-plate" data-element="${escapeHtml(elemLower)}">
      <section class="ed-hero-spread ed-hero-showcase dossier-hero">
        <div class="ed-poster-col">
          <div class="hsr-portrait-header">
            <span class="hsr-portrait-status ${c.owned ? 'is-owned' : ''} mono">${c.owned ? `Owned · C${c.constellation}` : 'Unowned · Catalog'}</span>
          </div>
          <div class="hsr-portrait-frame" data-element="${escapeHtml(elemLower)}">
            ${renderAstrolabeCompassSvg()}
            ${renderGachaSplash(c.key, c.meta.name)}
          </div>
          <div class="ed-con-pips" aria-label="Constellation ${ownedCon} of 6">
            ${[1, 2, 3, 4, 5, 6]
              .map((lv) => `<span class="ed-con-pip ${lv <= ownedCon ? 'is-lit' : ''} mono" title="Constellation ${lv}">C${lv}</span>`)
              .join('')}
          </div>
          ${
            !isReadOnly
              ? `<button type="button" class="hsr-target-toggle ${isBuildTarget ? 'is-active' : ''}" data-toggle-build-target="${escapeHtml(c.key)}" data-target-next="${isBuildTarget ? (c.owned ? 'In Progress' : 'Unowned') : 'Active Prefarm'}">
                   ${isBuildTarget ? '★ Build Target' : '☆ Set as Build Target'}
                 </button>`
              : ''
          }
        </div>

        <div class="ed-showcase-body">
          <div class="ed-hero-index mono">
            <span>${c.owned ? `Lv.${c.level} / ${Math.max(Number(c.targetLevel) || 90, Number(c.level) || 1)}` : 'Catalog · Lv.90'}</span>
            <span>·</span>
            <span>${c.owned ? `A/E/Q ${effTalents.effective.auto}/${effTalents.effective.skill}/${effTalents.effective.burst}` : 'A/E/Q 1/9/9'}</span>
            ${!kitAnalysis.isNonCrit ? `<span>·</span><span class="text-cyan">${combat.subCv.toFixed(1)} <abbr title="Crit Value = (CRIT Rate × 2) + CRIT DMG">CV</abbr></span>` : ''}
          </div>
          <div class="hsr-breadcrumb mono">${escapeHtml(c.meta.element)} · ${escapeHtml(c.meta.weaponType)} · ${c.meta.rarity || 5}★</div>
          <div class="hsr-hero-title-row">
            <h1 class="hsr-hero-title">${escapeHtml(c.meta.name)}</h1>
            <span class="hsr-role-badge">${escapeHtml(roleLabel)}</span>
            ${utilityChips.map((tag) => `<span class="hsr-micro-tag">${escapeHtml(tag)}</span>`).join('')}
            ${teamCaps.archetypeLock ? `<span class="hsr-micro-tag">${escapeHtml(teamCaps.archetypeLock)}</span>` : ''}
            ${kitAnalysis.hasStellarGlimmer ? '<span class="hsr-micro-tag">Stellar Glimmer</span>' : ''}
          </div>

          ${
            diagnosisItems.length
              ? `<div class="ed-diagnosis-strip" aria-label="Build Diagnosis">
                   ${diagnosisItems.map((d) => `<div class="ed-diag-item is-${d.tone}"><span class="ed-diag-dot" aria-hidden="true"></span><span>${escapeHtml(d.text)}</span></div>`).join('')}
                 </div>`
              : ''
          }

          <div class="ed-hero-stats-radar-wrap" style="margin-top:12px;">
            <div class="hsr-stat-grid-2x4 mono">
              <div class="hsr-stat-cell"><span class="hsr-stat-lbl">HP</span><strong class="hsr-stat-val">${combat.maxHp.toLocaleString()}</strong></div>
              <div class="hsr-stat-cell"><span class="hsr-stat-lbl">ATK</span><strong class="hsr-stat-val">${combat.totalAtk.toLocaleString()}</strong></div>
              <div class="hsr-stat-cell"><span class="hsr-stat-lbl">DEF</span><strong class="hsr-stat-val">${combat.totalDef.toLocaleString()}</strong></div>
              <div class="hsr-stat-cell"><span class="hsr-stat-lbl">EM</span><strong class="hsr-stat-val">${combat.em}</strong></div>
              <div class="hsr-stat-cell"><span class="hsr-stat-lbl">CRIT Rate</span><strong class="hsr-stat-val">${kitAnalysis.isNonCrit ? '—' : `${combat.critRate.toFixed(1)}%`}</strong></div>
              <div class="hsr-stat-cell"><span class="hsr-stat-lbl">CRIT DMG</span><strong class="hsr-stat-val">${kitAnalysis.isNonCrit ? '—' : `${combat.critDmg.toFixed(1)}%`}</strong></div>
              <div class="hsr-stat-cell"><span class="hsr-stat-lbl">ER%</span><strong class="hsr-stat-val">${combat.er.toFixed(1)}%</strong></div>
              <div class="hsr-stat-cell"><span class="hsr-stat-lbl">${escapeHtml(dmgLabel)}</span><strong class="hsr-stat-val">${combat.dmgBonus.toFixed(1)}%</strong></div>
            </div>
            <div class="ed-radar-box">${renderStatRadarSvg(combat, kitAnalysis)}</div>
          </div>

          <div class="ed-showcase-loadout">
            <div class="ed-showcase-wep">
              <div class="hsr-strip-label">Held Weapon</div>
              ${
                c.equippedWeapon && weaponMeta
                  ? `<div class="hsr-wep-slot-inner" style="padding:4px 0;">
                       ${renderAssetIcon('weapons', c.equippedWeapon.key, weaponMeta.name, 'icon-md')}
                       <div>
                         <div><strong>${escapeHtml(weaponMeta.name)}</strong></div>
                         <div class="muted mono" style="font-size:12px;">Lv.${c.equippedWeapon.level} · R${c.equippedWeapon.refinement}${weaponStats?.baseAtk ? ` · ${weaponStats.baseAtk} ATK` : ''}</div>
                       </div>
                     </div>`
                  : '<div class="muted" style="font-size:13px;padding:4px 0;">None equipped</div>'
              }
            </div>
            <div class="ed-showcase-arts">
              <div class="hsr-strip-label-row">
                <span class="hsr-strip-label">Equipped Artifacts</span>
                <span class="hsr-wrv-inline ${combat.wrvPct >= 70 ? 'text-mint' : combat.wrvPct >= 45 ? 'text-amber' : 'text-coral'} mono">${escapeHtml(combat.wrvGrade)} · ${combat.wrvPct}% wRV (${combat.weightedRolls}/${combat.wRvBenchmark})</span>
              </div>
              <div class="ed-art-slot-row">
                ${['flower', 'plume', 'sands', 'goblet', 'circlet']
                  .map((slot) => {
                    const art = sortedArtifacts.find((a) => a.slotKey === slot);
                    if (!art) return `<div class="ed-art-mini"><span class="muted mono">${slot.slice(0, 3).toUpperCase()}</span></div>`;
                    const iconUrl = getArtifactIcon(art.setKey, art.slotKey);
                    const mainLabel = formatStatKey(art.mainStatKey);
                    return `<div class="ed-art-mini" title="${escapeHtml(splitPascalSet(art.setKey))} · ${escapeHtml(mainLabel)}">
                      <div class="hsr-art-thumb">
                        ${iconUrl ? `<img src="${iconUrl}" alt="${escapeHtml(art.slotKey)}" loading="lazy" />` : `<span class="mono">${slot.slice(0, 3)}</span>`}
                        <span class="hsr-art-lv mono">+${art.level ?? 20}</span>
                      </div>
                      <span class="ed-art-main-lbl">${escapeHtml(mainLabel)}</span>
                    </div>`;
                  })
                  .join('')}
              </div>
            </div>
          </div>
        </div>
      </section>

      <nav class="ed-chapter-tabs" role="tablist" aria-label="Character Dossier Tabs">
        <button type="button" role="tab" aria-selected="${normalizedTab === 'build' ? 'true' : 'false'}" class="ed-chapter-tab ${normalizedTab === 'build' ? 'is-active' : ''}" data-dossier-tab="build">Build &amp; Loadout</button>
        <button type="button" role="tab" aria-selected="${normalizedTab === 'kit' ? 'true' : 'false'}" class="ed-chapter-tab ${normalizedTab === 'kit' ? 'is-active' : ''}" data-dossier-tab="kit">Kit &amp; Codex</button>
      </nav>

      ${
        normalizedTab === 'kit'
          ? `<section class="ed-tab-panel">
                   <div class="hsr-codex-controls">
                     <div class="subtab-switch" role="group" aria-label="Codex Sections">
                       <button type="button" class="filter-pill ${codexSectionFilter === 'talents' ? 'active' : ''}" data-codex-filter="talents">Active Talents (${talents.length})</button>
                       <button type="button" class="filter-pill ${codexSectionFilter === 'passives' ? 'active' : ''}" data-codex-filter="passives">Passives (${passives.length})</button>
                       <button type="button" class="filter-pill ${codexSectionFilter === 'constellations' ? 'active' : ''}" data-codex-filter="constellations">Constellations (${constellations.length})</button>
                       <button type="button" class="filter-pill ${codexSectionFilter === 'all' ? 'active' : ''}" data-codex-filter="all">All</button>
                     </div>
                     <div class="subtab-switch" role="group" aria-label="Description Density">
                       <button type="button" class="filter-pill ${isRazor ? 'active' : ''}" data-talent-mode="razor">Razor Mode</button>
                       <button type="button" class="filter-pill ${!isRazor ? 'active' : ''}" data-talent-mode="full">Full Text</button>
                     </div>
                   </div>
                   ${
                     showTalents
                       ? `<div class="dossier-insights-grid" style="margin:12px 0 14px;">
                           ${insights.map((ins) => `<div class="dossier-insight-row"><div class="dossier-insight-key">${escapeHtml(toTitleCaseLabel(ins.label))}</div><div class="dossier-insight-val">${escapeHtml(ins.text)}</div></div>`).join('')}
                         </div>
                         <div class="dossier-kit-list">
                           ${talents.map((t, tIdx) => {
                             const slot = t.kind === 'normal' ? 'auto' : t.kind === 'skill' ? 'skill' : 'burst';
                             const lv = effTalents?.effective?.[slot] || 1;
                             const cur = slot === 'auto' ? curAuto : slot === 'skill' ? curSkill : curBurst;
                             const tgt = slot === 'auto' ? tgtAuto : slot === 'skill' ? tgtSkill : tgtBurst;
                             const tel = extractKitTelemetry(t, c, kitData, kitAnalysis, cur, tgt, talentPriority);
                             return `<div class="hsr-kit-split-card hsr-kit-block" style="--stagger-i:${tIdx};">
                               <div>
                                 <div class="ed-kit-head"><span class="hsr-micro-tag mono">${slot === 'auto' ? 'Normal' : slot === 'skill' ? 'Skill' : 'Burst'} · Lv.${lv}</span><strong class="ed-kit-title">${escapeHtml(t.name)}</strong></div>
                                 <p class="dossier-kit-desc">${renderKitDescription(t.description, isRazor)}</p>
                               </div>
                               <aside class="hsr-kit-telemetry-rail">
                                 <div class="hsr-kit-rail-row"><span class="muted">Priority</span><strong class="ed-rail-val">${escapeHtml(tel.priorityLabel)}</strong></div>
                                 <div class="hsr-kit-rail-row"><span class="muted">Level</span><strong class="mono">${cur} → ${Math.max(cur, tgt)}</strong></div>
                                 ${tel.cd ? `<div class="hsr-kit-rail-row"><span class="muted">Cooldown</span><strong class="mono">${escapeHtml(tel.cd)}</strong></div>` : ''}
                                 ${tel.energy ? `<div class="hsr-kit-rail-row"><span class="muted">Energy</span><strong class="mono">${escapeHtml(tel.energy)}</strong></div>` : ''}
                                 ${tel.diff?.changed ? `<div class="hsr-kit-rail-row"><span class="muted">Gain</span><strong class="mono text-mint">+${tel.diff.pctGain?.toFixed(1) || '0.0'}%</strong></div>` : ''}
                               </aside>
                             </div>`;
                           }).join('')}
                         </div>`
                       : ''
                   }
                   ${
                     showPassives && passives.length
                       ? `<div class="hsr-passives-grid" style="margin-top:12px;">
                           ${passives.map((p) => `<div class="dossier-kit-card"><div class="ed-kit-head"><span class="hsr-micro-tag mono">${escapeHtml(p.slot || 'Passive')}</span><strong class="ed-kit-title">${escapeHtml(p.name)}</strong></div><p class="dossier-kit-desc">${renderKitDescription(p.description, isRazor)}</p></div>`).join('')}
                         </div>`
                       : ''
                   }
                   ${
                     showCons && constellations.length
                       ? `<div class="ed-con-grid" style="margin-top:14px;">
                           ${constellations.map((con, cIdx) => {
                             const isActive = Number(con.level) <= ownedCon;
                             return `<div class="hsr-con-row hsr-kit-block ${isActive ? 'is-con-active' : ''}" style="--stagger-i:${cIdx};">
                               <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                                 <div class="ed-kit-head"><span class="hsr-con-badge mono">C${con.level}</span><strong class="ed-kit-title">${escapeHtml(con.name)}</strong></div>
                                 <span class="pill ${isActive ? 'pill-mint' : 'pill-muted'} mono">${isActive ? 'Active' : 'Locked'}</span>
                               </div>
                               <p class="dossier-kit-desc">${renderKitDescription(con.description, isRazor)}</p>
                             </div>`;
                           }).join('')}
                         </div>`
                       : ''
                   }
                 </section>`
              : `<section class="ed-tab-panel">
                   <div class="ed-sec-01-grid">
                     <form class="dossier-targets-form" data-inspector-form="${escapeHtml(c.key)}">
                       <div class="ed-targets-head">
                         <span class="ed-targets-title">Ascension &amp; Talent Targets</span>
                         ${!isReadOnly ? '<button type="submit" class="btn btn-gold btn-xs">Save to Sheet</button>' : '<span class="muted ui-micro">Read Only</span>'}
                       </div>
                       <div class="ed-targets-meta-row">
                         <label class="mini-field"><span>Status</span><select name="status" class="select-sm" ${disabledAttr}>${INSPECTOR_STATUSES.map((st) => `<option value="${st}" ${c.status === st ? 'selected' : ''}>${st}</option>`).join('')}</select></label>
                         <label class="mini-field"><span>Priority</span><input type="number" min="1" max="99" name="priorityRank" value="${c.priorityRank || ''}" placeholder="—" class="input-mono" ${disabledAttr} /></label>
                       </div>
                       <div class="ed-targets-pair-grid">
                         <div class="ed-target-pair">
                           <div class="ed-pair-head"><span>Level</span><span class="ed-pair-subcap muted">Current → Target</span></div>
                           <div class="ed-pair-inputs">
                             <input type="number" min="1" max="100" name="level" aria-label="Current Level" title="Current Level" value="${c.level || 1}" class="input-mono" ${disabledAttr} />
                             <span class="ed-pair-arrow muted" aria-hidden="true">→</span>
                             <input type="number" min="1" max="100" name="targetLevel" aria-label="Target Level" title="Target Level" value="${c.targetLevel || 90}" class="input-mono" ${disabledAttr} />
                           </div>
                         </div>
                         <div class="ed-target-pair">
                           <div class="ed-pair-head">
                             <span>Normal Attack</span>
                             ${effTalents.bonuses.auto > 0 ? `<span class="ed-talent-boost mono" title="Constellation boost (+${effTalents.bonuses.auto})">+${effTalents.bonuses.auto} · Eff. ${effTalents.effective.auto}</span>` : ''}
                           </div>
                           <div class="ed-pair-inputs">
                             <input type="number" min="1" max="10" name="tAuto" aria-label="Current Normal Attack" title="Current Normal Attack" value="${curAuto}" class="input-mono" ${disabledAttr} />
                             <span class="ed-pair-arrow muted" aria-hidden="true">→</span>
                             <input type="number" min="1" max="10" name="tgtAuto" aria-label="Target Normal Attack" title="Target Normal Attack" value="${tgtAuto}" class="input-mono" ${disabledAttr} />
                           </div>
                         </div>
                         <div class="ed-target-pair">
                           <div class="ed-pair-head">
                             <span>Elemental Skill</span>
                             ${effTalents.bonuses.skill > 0 ? `<span class="ed-talent-boost mono" title="Constellation boost (+${effTalents.bonuses.skill})">+${effTalents.bonuses.skill} · Eff. ${effTalents.effective.skill}</span>` : ''}
                           </div>
                           <div class="ed-pair-inputs">
                             <input type="number" min="1" max="10" name="tSkill" aria-label="Current Elemental Skill" title="Current Elemental Skill" value="${curSkill}" class="input-mono" ${disabledAttr} />
                             <span class="ed-pair-arrow muted" aria-hidden="true">→</span>
                             <input type="number" min="1" max="10" name="tgtSkill" aria-label="Target Elemental Skill" title="Target Elemental Skill" value="${tgtSkill}" class="input-mono" ${disabledAttr} />
                           </div>
                         </div>
                         <div class="ed-target-pair">
                           <div class="ed-pair-head">
                             <span>Elemental Burst</span>
                             ${effTalents.bonuses.burst > 0 ? `<span class="ed-talent-boost mono" title="Constellation boost (+${effTalents.bonuses.burst})">+${effTalents.bonuses.burst} · Eff. ${effTalents.effective.burst}</span>` : ''}
                           </div>
                           <div class="ed-pair-inputs">
                             <input type="number" min="1" max="10" name="tBurst" aria-label="Current Elemental Burst" title="Current Elemental Burst" value="${curBurst}" class="input-mono" ${disabledAttr} />
                             <span class="ed-pair-arrow muted" aria-hidden="true">→</span>
                             <input type="number" min="1" max="10" name="tgtBurst" aria-label="Target Elemental Burst" title="Target Elemental Burst" value="${tgtBurst}" class="input-mono" ${disabledAttr} />
                           </div>
                         </div>
                       </div>
                       <div id="dossier-roi-preview" style="margin-top:10px;">
                         ${renderTalentRoiPreviewHtml(c, kitData, kitAnalysis, { auto: curAuto, skill: curSkill, burst: curBurst }, { auto: tgtAuto, skill: tgtSkill, burst: tgtBurst })}
                       </div>
                       <label class="mini-field" style="margin-top:10px;">
                         <span>Notes</span>
                         <textarea class="textarea-lab" rows="2" name="notes" placeholder="Rotation notes, weapon swaps, or ER reminders..." ${disabledAttr}>${escapeHtml(c.notes || '')}</textarea>
                       </label>
                     </form>

                     <div>
                       <div class="ed-targets-title" style="margin-bottom:8px;">Energy &amp; Reaction Check (${erReport.burstCost}-Cost Burst)</div>
                       <div class="hsr-er-stack mono" style="margin-bottom:16px;">
                         <div class="hsr-er-cell"><span>Solo (~${erReport.baseReq}%)</span><span class="hsr-er-pill ${erReport.zeroEnergyImmune ? 'is-ok' : soloDelta >= 0 ? 'is-ok' : soloDelta >= -12 ? 'is-warn' : 'is-short'}">${erReport.zeroEnergyImmune ? '<abbr title="Zero-Energy Immune — kit functions without Burst energy">0-E Immune</abbr>' : soloDelta >= 0 ? 'Safe' : `Low ER (${soloDelta}%)`}</span></div>
                         <div class="hsr-er-cell"><span>Double ${escapeHtml(erReport.charElem || 'Elem')} (~${erReport.resonanceReq}%)</span><span class="hsr-er-pill ${erReport.zeroEnergyImmune ? 'is-ok' : erReport.resonanceDelta >= 0 ? 'is-ok' : erReport.resonanceDelta >= -12 ? 'is-warn' : 'is-short'}">${erReport.zeroEnergyImmune ? '<abbr title="Zero-Energy Immune — kit functions without Burst energy">0-E Immune</abbr>' : erReport.resonanceDelta >= 0 ? 'Safe' : `Low ER (${erReport.resonanceDelta}%)`}</span></div>
                         <div class="hsr-er-cell"><span>Stygian / Theatre (~${erReport.soloEndgameReq}%)</span><span class="hsr-er-pill ${erReport.zeroEnergyImmune ? 'is-ok' : erReport.soloDelta >= 0 ? 'is-ok' : 'is-short'}">${erReport.zeroEnergyImmune ? '<abbr title="Zero-Energy Immune — kit functions without Burst energy">0-E Immune</abbr>' : erReport.soloDelta >= 0 ? 'Safe' : `Low ER (${erReport.soloDelta}%)`}</span></div>
                       </div>

                       <div class="ed-targets-title" style="margin-bottom:6px;">Team Plans (<span class="mono">${matchingTeams.length}</span>)</div>
                       ${
                         matchingTeams.length
                           ? `<div class="hsr-team-plans">${matchingTeams.map((team, tIdx) => `
                               <div class="hsr-team-plan-row">
                                 <div><span class="hsr-micro-tag mono">Plan ${tIdx + 1}</span> <span>${escapeHtml(team.name || team.archetype)}</span></div>
                                 <div class="hsr-team-bubbles">
                                   ${(team.members || []).map((m) => {
                                     const mm = getCharacterMeta(m.characterKey);
                                     return `<button type="button" class="hsr-team-bubble ${m.characterKey === c.key ? 'is-self' : ''}" data-inspect-char="${escapeHtml(m.characterKey)}" aria-label="Inspect ${escapeHtml(mm.name)}" title="${escapeHtml(mm.name)}${!ownedKeySet.has(m.characterKey) ? ' (Wish)' : ''}">${renderAssetIcon('characters', m.characterKey, mm.name, 'icon-xs')}</button>`;
                                   }).join('')}
                                 </div>
                               </div>`).join('')}</div>`
                           : '<div class="muted" style="font-size:12.5px;">Add this character to a squad in Teams Lab.</div>'
                       }
                     </div>
                   </div>

                   <div class="ed-build-section">
                     <div class="ed-targets-title" style="margin-bottom:4px;">Weapon Rankings</div>
                     ${renderWeaponSection(c, matrixResult, false)}
                   </div>

                   <div class="ed-build-section">
                     <div class="ed-targets-title" style="margin-bottom:10px;">Equipped Artifact Rolls</div>
                     ${renderArtifactBreakdown(c, combat, sortedArtifacts)}
                   </div>
                 </section>`
      }

      ${
        weaponMatrixState.fullView
          ? `<div class="weapon-matrix-modal-backdrop" data-matrix-modal-backdrop="1">
               <div class="modal-card card" style="max-width:920px;" role="dialog" aria-modal="true" aria-label="Weapons Full View">
                 ${renderWeaponSection(c, matrixResult, true)}
               </div>
             </div>`
          : ''
      }
    </div>`;
}

export function renderRosterTab(container, state, handlers) {
  const { account, isReadOnly, rosterFilter } = state;
  const prefarmSet = new Set((account.prefarmQueue || []).map((p) => p.characterKey));
  const ownedMap = new Map((account.characters || []).map((c) => [c.key, c]));

  const combinedChars = getAllCharacterKeys().map((key) => {
    const meta = getCharacterMeta(key);
    const owned = ownedMap.get(key);
    const isUnowned = !owned || owned.status === 'Unowned' || owned.owned === false;
    const base = isUnowned
      ? { key, meta, owned: false, level: 1, targetLevel: owned?.targetLevel || 90, constellation: 0, talent: { auto: 1, skill: 1, burst: 1 }, targetTalents: owned?.targetTalents || '9/9/9', status: owned?.status === 'Active Prefarm' ? 'Active Prefarm' : 'Unowned', priorityRank: owned?.priorityRank || '', notes: owned?.notes || '' }
      : { ...owned, meta, owned: true, targetLevel: owned.targetLevel || 90, targetTalents: owned.targetTalents || '9/9/9' };

    const equippedWeapon = (account.weapons || []).find((w) => w.location === key) || null;
    const equippedArtifacts = (account.artifacts || []).filter((a) => a.location === key);
    return { ...base, equippedWeapon, equippedArtifacts };
  });

  const q = (rosterFilter.search || '').trim().toLowerCase();
  const elementFilter = rosterFilter.element || 'All';
  const sortBy = rosterFilter.sortBy || 'level';
  const filteredChars = combinedChars.filter((c) => {
    if (ownedFilter === 'owned' && !c.owned) return false;
    if (ownedFilter === 'unowned' && c.owned) return false;
    if (elementFilter !== 'All' && c.meta.element !== elementFilter) return false;
    if (!matchesCharacterSearch(c, q)) return false;
    return true;
  });

  const sortedCatalog = sortCharacters(filteredChars, sortBy, ownedFilter === 'unowned' ? 'archive' : 'built');
  const inspectedChar = combinedChars.find((c) => c.key === (rosterFilter.inspectedKey || sortedCatalog[0]?.key)) || sortedCatalog[0] || combinedChars[0];

  if (inspectedChar) {
    const needsKit = !getCharacterKit(inspectedChar.key);
    const wepKey = inspectedChar.equippedWeapon?.key;
    const needsWep = Boolean(wepKey && !getWeaponStats(wepKey));
    if (needsKit || needsWep) {
      Promise.all([needsKit ? ensureCharacterKitAndStats(inspectedChar.key) : Promise.resolve(null), needsWep ? ensureWeaponStats(wepKey) : Promise.resolve(null)])
        .then(([kitRes, wepRes]) => {
          if ((kitRes || wepRes) && (!state.rosterFilter?.inspectedKey || state.rosterFilter?.inspectedKey === inspectedChar.key)) {
            handlers.onRefreshView?.();
          }
        });
    }
  }

  const showDetail = rosterSubView === 'detail' && Boolean(inspectedChar);

  const quickSwitchPool = [];
  const seenQuick = new Set();
  for (const ch of sortedCatalog) {
    if (ch.status === 'Active Prefarm' || prefarmSet.has(ch.key)) {
      if (!seenQuick.has(ch.key)) { seenQuick.add(ch.key); quickSwitchPool.push(ch); }
    }
  }
  for (const ch of sortedCatalog) {
    if (quickSwitchPool.length >= 6) break;
    if (!seenQuick.has(ch.key)) { seenQuick.add(ch.key); quickSwitchPool.push(ch); }
  }

  container.innerHTML = showDetail
    ? `<div class="ed-roster-page">
         <div class="ed-subpage-topbar">
           <button type="button" class="btn btn-ghost btn-sm mono" data-back-to-catalog>← All Characters</button>
           <div class="ed-quick-switch" role="navigation" aria-label="Quick Switch Characters">
             ${quickSwitchPool
               .map(
                 (qChar) => `<button type="button" class="ed-quick-chip ${qChar.key === inspectedChar.key ? 'is-active' : ''}" data-inspect-char="${escapeHtml(qChar.key)}" data-element="${escapeHtml(String(qChar.meta.element || 'geo').toLowerCase())}" title="${escapeHtml(qChar.meta.name)}">${renderAssetIcon('characters', qChar.key, qChar.meta.name, 'icon-xs')}</button>`
               )
               .join('')}
           </div>
           <span class="muted mono" style="font-size:12px;">${escapeHtml(inspectedChar.meta.name)} · ${escapeHtml(inspectedChar.meta.element)}</span>
         </div>
         <div id="ed-dossier-anchor" class="ed-dossier-main">
           ${renderCharacterDossier(inspectedChar, account, isReadOnly, rosterFilter.dossierTab || 'build')}
         </div>
       </div>`
    : `<div class="ed-roster-page">
         <section class="ed-catalog-section ed-catalog-fullpage" aria-label="Character Catalog">
           <div class="ed-catalog-toolbar">
             <input type="search" class="input-search" aria-label="Search characters" placeholder="Search name or alias (e.g. Childe, Ajax, Marionette)..." value="${escapeHtml(rosterFilter.search || '')}" data-roster-search />
             <div class="hsr-pill-group" role="group" aria-label="Filter by ownership">
               <button type="button" class="filter-pill ${ownedFilter === 'all' ? 'active' : ''}" data-roster-owned="all">All</button>
               <button type="button" class="filter-pill ${ownedFilter === 'owned' ? 'active' : ''}" data-roster-owned="owned">Owned</button>
               <button type="button" class="filter-pill ${ownedFilter === 'unowned' ? 'active' : ''}" data-roster-owned="unowned">Unowned</button>
             </div>
             <div class="hsr-pill-group" role="group" aria-label="Sort characters">
               <button type="button" class="filter-pill ${sortBy === 'level' ? 'active' : ''}" data-roster-sort-btn="level">Sort: Lv.</button>
               <button type="button" class="filter-pill ${sortBy === 'rarity' ? 'active' : ''}" data-roster-sort-btn="rarity">Rarity</button>
               <button type="button" class="filter-pill ${sortBy === 'element' ? 'active' : ''}" data-roster-sort-btn="element">Element</button>
               <button type="button" class="filter-pill ${sortBy === 'name' ? 'active' : ''}" data-roster-sort-btn="name">Name</button>
             </div>
             <span class="muted mono ui-micro" style="margin-left:auto;">${sortedCatalog.length} characters</span>
           </div>

           <div class="hsr-pill-group" role="group" aria-label="Filter by element" style="margin-top:8px;">
             ${ELEMENT_PILLS.map((el) => `<button type="button" class="filter-pill ${elementFilter === el ? 'active' : ''}" data-roster-element-btn="${el}">${el}</button>`).join('')}
           </div>

           <div class="ed-catalog-grid ed-catalog-grid-full">
             ${
               sortedCatalog.length
                 ? sortedCatalog.map((c) => renderCatalogTile(c, c.key === inspectedChar?.key && showDetail, c.status === 'Active Prefarm' || prefarmSet.has(c.key) ? 'Target' : '')).join('')
                 : '<div class="muted mono" style="padding:14px;">No characters match this filter or alias.</div>'
             }
           </div>
         </section>
       </div>`;

  container.querySelectorAll('.filter-pill').forEach((pill) => {
    pill.setAttribute('aria-pressed', pill.classList.contains('active') ? 'true' : 'false');
  });

  container.querySelector('[data-back-to-catalog]')?.addEventListener('click', () => {
    if (rosterFormDirty && !window.confirm('You have unsaved target or note edits. Leave without saving?')) {
      return;
    }
    const backKey = inspectedChar?.key || '';
    rosterFormDirty = false;
    runRosterViewTransition(container, backKey, 'to-catalog', () => {
      rosterSubView = 'catalog';
      renderRosterTab(container, state, handlers);
    });
  });
  container.querySelectorAll('[data-roster-owned]').forEach((btn) => {
    btn.addEventListener('click', () => {
      ownedFilter = btn.dataset.rosterOwned || 'all';
      renderRosterTab(container, state, handlers);
    });
  });
  container.querySelectorAll('[data-roster-element-btn]').forEach((btn) => {
    btn.addEventListener('click', () => handlers.onChangeRosterFilter({ element: btn.dataset.rosterElementBtn }));
  });
  container.querySelectorAll('[data-roster-sort-btn]').forEach((btn) => {
    btn.addEventListener('click', () => handlers.onChangeRosterFilter({ sortBy: btn.dataset.rosterSortBtn }));
  });
  container.querySelectorAll('[data-dossier-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      runRosterViewTransition(container, '', 'tab', () => {
        handlers.onChangeRosterFilter({ dossierTab: btn.dataset.dossierTab });
      });
    });
  });
  container.querySelector('[data-roster-search]')?.addEventListener('input', (e) => handlers.onChangeRosterFilter({ search: e.target.value }, { preserveFocusSelector: '[data-roster-search]' }));
  container.querySelectorAll('[data-inspect-char]').forEach((btn) => btn.addEventListener('click', () => {
    const charKey = btn.dataset.inspectChar;
    if (!charKey) return;
    if (rosterFormDirty && !window.confirm('You have unsaved target or note edits. Switch character without saving?')) {
      return;
    }
    rosterFormDirty = false;
    runRosterViewTransition(container, charKey, 'to-detail', () => {
      rosterSubView = 'detail';
      handlers.onChangeRosterFilter({ inspectedKey: charKey });
    });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }));
  container.querySelector('[data-toggle-build-target]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (btn.dataset.toggleBuildTarget && handlers.onSaveCharacterInspector) {
      await handlers.onSaveCharacterInspector(btn.dataset.toggleBuildTarget, { status: btn.dataset.targetNext || 'Active Prefarm' });
    }
  });
  container.querySelectorAll('[data-talent-mode]').forEach((btn) => btn.addEventListener('click', () => {
    talentTextMode = btn.dataset.talentMode === 'razor' ? 'razor' : 'full';
    renderRosterTab(container, state, handlers);
  }));
  container.querySelectorAll('[data-codex-filter]').forEach((btn) => btn.addEventListener('click', () => {
    codexSectionFilter = btn.dataset.codexFilter || 'all';
    renderRosterTab(container, state, handlers);
  }));

  const rerender = () => renderRosterTab(container, state, handlers);
  container.querySelectorAll('[data-matrix-arch]').forEach((btn) => btn.addEventListener('click', () => { weaponMatrixState.archetype = btn.dataset.matrixArch; rerender(); }));
  container.querySelectorAll('[data-matrix-scope]').forEach((btn) => btn.addEventListener('click', () => { weaponMatrixState.scope = btn.dataset.matrixScope; rerender(); }));
  container.querySelectorAll('[data-matrix-filter]').forEach((btn) => btn.addEventListener('click', () => { weaponMatrixState.filter = btn.dataset.matrixFilter; rerender(); }));
  rosterModalEscCleanup?.();
  rosterModalEscCleanup = null;

  const closeFullViewModal = (restoreFocus = false) => {
    rosterModalEscCleanup?.();
    rosterModalEscCleanup = null;
    weaponMatrixState.fullView = false;
    rerender();
    if (restoreFocus) {
      container.querySelector('[data-matrix-fullview="open"]')?.focus();
    }
  };

  container.querySelectorAll('[data-matrix-fullview]').forEach((btn) => btn.addEventListener('click', () => {
    const opening = btn.dataset.matrixFullview === 'open';
    if (opening) {
      weaponMatrixState.fullView = true;
      rerender();
      container.querySelector('[data-matrix-fullview="close"]')?.focus();
    } else {
      closeFullViewModal(true);
    }
  }));

  const modalBackdrop = container.querySelector('[data-matrix-modal-backdrop]');
  if (modalBackdrop) {
    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) closeFullViewModal(true);
    });
    const onKey = (e) => {
      if (!weaponMatrixState.fullView) return;
      if (e.key === 'Escape') {
        closeFullViewModal(true);
        return;
      }
      if (e.key === 'Tab') {
        const focusables = modalBackdrop.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    rosterModalEscCleanup = () => document.removeEventListener('keydown', onKey);
  }

  const form = container.querySelector('[data-inspector-form]');
  if (form && !isReadOnly) {
    const markDirty = () => {
      rosterFormDirty = true;
      const saveBtn = form.querySelector('button[type="submit"]');
      if (saveBtn && !saveBtn.disabled) saveBtn.textContent = 'Save to Sheet •';
    };
    form.addEventListener('input', markDirty);
    form.addEventListener('change', markDirty);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const saveBtn = form.querySelector('button[type="submit"]');
      const origText = saveBtn?.textContent || 'Save to Sheet';
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }
      try {
        const fd = new FormData(form);
        const clamp = (val, min, max, fallback) => { const n = Number(val); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; };
        const rankRaw = String(fd.get('priorityRank') || '').trim();
        await handlers.onSaveCharacterInspector(form.dataset.inspectorForm, {
          status: String(fd.get('status') || 'Bench'),
          priorityRank: rankRaw ? clamp(rankRaw, 1, 99, '') : '',
          level: clamp(fd.get('level'), 1, 100, 1),
          targetLevel: clamp(fd.get('targetLevel'), 1, 100, 90),
          talent: { auto: clamp(fd.get('tAuto'), 1, 10, 1), skill: clamp(fd.get('tSkill'), 1, 10, 1), burst: clamp(fd.get('tBurst'), 1, 10, 1) },
          targetTalents: `${clamp(fd.get('tgtAuto'), 1, 10, 9)}/${clamp(fd.get('tgtSkill'), 1, 10, 9)}/${clamp(fd.get('tgtBurst'), 1, 10, 9)}`,
          notes: String(fd.get('notes') || '')
        });
        rosterFormDirty = false;
      } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = origText; }
      }
    });
  }

  setupRosterScrollChoreography(container);
}

function setupRosterScrollChoreography(container) {
  rosterScrollCleanup?.();
  rosterScrollCleanup = null;
  const plate = container.querySelector('.ed-dossier-plate');
  const hero = container.querySelector('.dossier-hero');
  const dock = container.querySelector('[data-sticky-dock]');
  const chapters = [...container.querySelectorAll('.dossier-chapter')];
  const jumpLinks = [...container.querySelectorAll('[data-jump-sec]')];
  if (!plate || !chapters.length) return;

  const setActiveChapter = (chapterId) => {
    chapters.forEach((sec) => { sec.classList.toggle('is-active', sec.id === chapterId); sec.classList.toggle('is-receded', sec.id !== chapterId); });
    jumpLinks.forEach((lnk) => lnk.classList.toggle('is-current', lnk.dataset.jumpSec === chapterId));
  };

  let heroObs = null;
  let chapterObs = null;
  const visibleChapters = new Set();
  if ('IntersectionObserver' in window) {
    if (hero && dock) {
      heroObs = new IntersectionObserver((entries) => {
        const inView = entries[0] ? entries[0].isIntersecting : true;
        dock.classList.toggle('is-docked', !inView);
        hero.classList.toggle('is-hero-receded', !inView);
      }, { threshold: 0.08 });
      heroObs.observe(hero);
    }
    chapterObs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) visibleChapters.add(entry.target.id); else visibleChapters.delete(entry.target.id); });
      if (visibleChapters.size > 0) {
        const firstVisible = chapters.find((sec) => visibleChapters.has(sec.id));
        if (firstVisible) setActiveChapter(firstVisible.id);
      }
    }, { rootMargin: '-15% 0px -20% 0px', threshold: 0.01 });
    chapters.forEach((sec) => chapterObs.observe(sec));
  }

  let rafId = 0;
  const onScroll = () => {
    if (rafId) return;
    rafId = window.requestAnimationFrame(() => {
      rafId = 0;
      plate.style.setProperty('--scroll-deg', `${(window.scrollY * 0.08).toFixed(2)}deg`);
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  rosterScrollCleanup = () => {
    heroObs?.disconnect();
    chapterObs?.disconnect();
    window.removeEventListener('scroll', onScroll);
    if (rafId) window.cancelAnimationFrame(rafId);
  };
}
