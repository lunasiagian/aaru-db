import { renderAssetIcon } from './assets.js?v=20261121p64';
import {
  ensureWeaponStats,
  getAllWeaponKeys,
  getCharacterMeta,
  getWeaponMeta,
  getWeaponStats
} from './catalog.js?v=20261121p64';

const STAT_LABELS = {
  atk_: 'ATK%',
  hp_: 'HP%',
  def_: 'DEF%',
  enerRech_: 'Energy Recharge',
  eleMas: 'Elemental Mastery',
  critRate_: 'CRIT Rate',
  critDMG_: 'CRIT DMG',
  physical_dmg_: 'Physical DMG'
};

function formatSubstat(subKey, subVal) {
  if (!subKey) return '—';
  const label = STAT_LABELS[subKey] || subKey;
  return subKey === 'eleMas' ? `${label} ${subVal}` : `${label} ${subVal}%`;
}

const WEAPON_TYPE_PILLS = ['All', 'Sword', 'Claymore', 'Polearm', 'Bow', 'Catalyst'];
const ARMORY_FILTER_PILLS = [
  { id: 'all', label: 'All' },
  { id: 'owned', label: 'Owned' },
  { id: 'unowned', label: 'Unowned' },
  { id: '5', label: '5★' },
  { id: '4', label: '4★' },
  { id: '3', label: '3★' },
  { id: 'equipped', label: 'Equipped' },
  { id: 'unassigned', label: 'Unassigned' }
];
const ARMORY_SORT_OPTIONS = [
  { value: 'level', label: 'Level / Asc (High → Low)' },
  { value: 'refinement', label: 'Refinement (R5 → R1)' },
  { value: 'rarity', label: 'Rarity (5★ → 3★)' },
  { value: 'name', label: 'Name (A → Z)' }
];

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatWeaponRichText(text) {
  let html = escapeHtml(String(text || '').replace(/\\n/g, '\n'));
  html = html.replace(/&lt;i&gt;([\s\S]*?)&lt;\/i&gt;/gi, '<em>$1</em>');
  html = html.replace(
    /&lt;color=#([0-9A-Fa-f]{6,8})&gt;([\s\S]*?)&lt;\/color&gt;/gi,
    '<span class="text-cyan">$2</span>'
  );
  return html;
}

export function renderArmoryTab(container, viewState, handlers) {
  const { account, armoryFilter = {} } = viewState;
  const typeFilter = armoryFilter.weaponType || 'All';
  const badgeFilter = armoryFilter.filter || 'all';
  const sortBy = armoryFilter.sortBy || 'level';
  const density = armoryFilter.density || 'grid';
  const q = (armoryFilter.search || '').trim().toLowerCase();

  const ownedWeapons = account.weapons || [];
  const ownedKeySet = new Set(ownedWeapons.map((w) => String(w.key || '').toLowerCase()));
  const unownedWeapons = getAllWeaponKeys()
    .filter((k) => !ownedKeySet.has(String(k || '').toLowerCase()))
    .map((key) => ({
      key,
      level: 0,
      ascension: 0,
      refinement: 1,
      location: '',
      isOwned: false
    }));

  const combinedWeapons = [
    ...ownedWeapons.map((w) => ({ ...w, isOwned: true })),
    ...unownedWeapons
  ];

  const filteredWeapons = combinedWeapons
    .map((w) => {
      const meta = getWeaponMeta(w.key);
      const holderMeta = w.location ? getCharacterMeta(w.location) : null;
      return {
        ...w,
        meta,
        holderName: holderMeta?.name || w.location || ''
      };
    })
    .filter((w) => {
      if (typeFilter !== 'All' && String(w.meta.weaponType || '').toLowerCase() !== typeFilter.toLowerCase()) {
        return false;
      }
      if (badgeFilter === 'owned' && !w.isOwned) return false;
      if (badgeFilter === 'unowned' && w.isOwned) return false;
      if (badgeFilter === '5' || badgeFilter === '4' || badgeFilter === '3') {
        if (Number(w.meta.rarity) !== Number(badgeFilter)) return false;
      } else if (badgeFilter === 'equipped' && (!w.isOwned || !w.location)) {
        return false;
      } else if (badgeFilter === 'unassigned' && (!w.isOwned || w.location)) {
        return false;
      }
      if (!q) return true;
      return (
        w.meta.name.toLowerCase().includes(q) ||
        w.key.toLowerCase().includes(q) ||
        w.holderName.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (a.isOwned !== b.isOwned) return a.isOwned ? -1 : 1;
      if (!a.isOwned && !b.isOwned) {
        return (b.meta.rarity || 0) - (a.meta.rarity || 0) || a.meta.name.localeCompare(b.meta.name);
      }
      if (sortBy === 'refinement') {
        return (
          (b.refinement || 1) - (a.refinement || 1) ||
          (b.level || 1) - (a.level || 1) ||
          (b.meta.rarity || 0) - (a.meta.rarity || 0)
        );
      }
      if (sortBy === 'rarity') {
        return (
          (b.meta.rarity || 0) - (a.meta.rarity || 0) ||
          (b.level || 1) - (a.level || 1) ||
          (b.refinement || 1) - (a.refinement || 1)
        );
      }
      if (sortBy === 'name') {
        return a.meta.name.localeCompare(b.meta.name);
      }
      return (
        (b.level || 1) - (a.level || 1) ||
        (b.ascension || 0) - (a.ascension || 0) ||
        (b.meta.rarity || 0) - (a.meta.rarity || 0) ||
        (b.refinement || 1) - (a.refinement || 1)
      );
    });

  const renderWeaponCard = (w, idx) => {
    const holderLabel = w.holderName ? escapeHtml(w.holderName) : 'Unassigned';
    const rarity = Math.max(1, Math.min(5, Number(w.meta.rarity) || 3));
    if (density === 'list') {
      return `
      <button type="button" class="armory-weapon-row ${w.isOwned ? '' : 'is-unowned'}" data-rarity="${rarity}" data-armory-inspect="${idx}">
        <div class="armory-weapon-id">
          <div class="armory-weapon-icon">
            ${renderAssetIcon('weapons', w.key, w.meta.name, 'icon-sm')}
          </div>
          <div style="min-width:0;text-align:left;">
            <div class="ed-item-name">${escapeHtml(w.meta.name)}</div>
            <div class="ed-item-meta">${escapeHtml(w.meta.weaponType)} · <span class="mono">${w.meta.rarity}★</span></div>
          </div>
        </div>
        <div class="armory-row-badges">
          ${
            w.isOwned
              ? `<span class="pill mono ${w.level >= 90 ? 'pill-mint' : ''}">Lv.${w.level} · A${w.ascension}</span>
                 <span class="pill pill-gold mono">R${w.refinement}</span>
                 <span class="pill ${w.holderName ? 'pill-sky' : ''}">${w.holderName ? `Equipped: ${holderLabel}` : 'Unassigned'}</span>`
              : '<span class="pill pill-muted">Unowned · Inspect</span>'
          }
        </div>
      </button>`;
    }

    return `
    <button type="button" class="armory-weapon-card ${w.isOwned ? '' : 'is-unowned'}" data-rarity="${rarity}" data-armory-inspect="${idx}">
      <div class="armory-weapon-top">
        <div class="armory-weapon-id">
          <div class="armory-weapon-icon">
            ${renderAssetIcon('weapons', w.key, w.meta.name, 'icon-md')}
          </div>
          <div style="min-width:0;text-align:left;">
            <div class="ed-item-name">${escapeHtml(w.meta.name)}</div>
            <div class="ed-item-meta">${escapeHtml(w.meta.weaponType)} · <span class="mono">${w.meta.rarity}★</span></div>
          </div>
        </div>
        ${
          w.isOwned
            ? `<span class="pill mono ${w.level >= 90 ? 'pill-mint' : ''}">Lv.${w.level}</span>`
            : '<span class="pill pill-muted">Unowned</span>'
        }
      </div>
      ${
        w.isOwned
          ? `<div class="armory-weapon-stats">
              <div class="armory-stat-box">
                <span class="stat-label">Refine</span>
                <span class="stat-val mono text-gold">R${w.refinement}</span>
              </div>
              <div class="armory-stat-box">
                <span class="stat-label">Ascension</span>
                <span class="stat-val mono">A${w.ascension}</span>
              </div>
              <div class="armory-stat-box">
                <span class="stat-label">Equipped</span>
                <span class="stat-val ${w.holderName ? 'text-cyan ed-armory-holder' : 'muted'}">
                  ${w.location && w.holderName ? renderAssetIcon('characters', w.location, w.holderName, 'icon-xs') : ''}
                  <span>${holderLabel}</span>
                </span>
              </div>
            </div>`
          : '<div class="armory-weapon-unowned-note muted">Click to inspect stats &amp; R1–R5 passive</div>'
      }
    </button>`;
  };

  container.innerHTML = `
    <header class="ed-roster-head">
      <div>
        <h1 class="ed-page-title">Armory</h1>
        <p class="section-subtitle muted">Weapon catalog &amp; refinements · Click any weapon to inspect Lv.80/90 stats and passive scaling.</p>
      </div>
      <div class="ed-hud-meta">
        <span>Owned</span> <strong class="mono text-mint">${ownedWeapons.length}</strong>
        <span class="muted">· Catalog</span> <strong class="mono text-cyan">${combinedWeapons.length}</strong>
        <span class="muted">· Showing</span> <strong class="mono text-gold">${filteredWeapons.length}</strong>
      </div>
    </header>

    <section class="ed-armory-panel">
      <div class="ed-armory-toolbar">
        <div class="ed-armory-filters">
          <div class="ed-filter-pills" role="group" aria-label="Weapon Type">
            ${WEAPON_TYPE_PILLS.map(
              (wt) => `<button type="button" class="filter-pill ${typeFilter === wt ? 'active' : ''}" data-armory-type="${wt}">${wt}</button>`
            ).join('')}
          </div>
          <div class="ed-filter-pills" role="group" aria-label="Ownership &amp; Rarity Filter">
            ${ARMORY_FILTER_PILLS.map(
              (f) => `<button type="button" class="filter-pill ${badgeFilter === f.id ? 'active' : ''}" data-armory-filter="${f.id}">${f.label}</button>`
            ).join('')}
          </div>
        </div>

        <div class="ed-armory-controls">
          <select class="select-sm roster-sort-select" data-armory-sort aria-label="Sort weapons">
            ${ARMORY_SORT_OPTIONS.map(
              (opt) => `<option value="${opt.value}" ${sortBy === opt.value ? 'selected' : ''}>${opt.label}</option>`
            ).join('')}
          </select>
          <input type="search" class="input-search input-search-sm" aria-label="Search weapon or holder" placeholder="Search weapon or holder…" value="${escapeHtml(armoryFilter.search || '')}" data-armory-search />
          <div class="subtab-switch" role="group" aria-label="View Density">
            <button type="button" class="filter-pill ${density === 'grid' ? 'active' : ''}" data-armory-density="grid">Grid</button>
            <button type="button" class="filter-pill ${density === 'list' ? 'active' : ''}" data-armory-density="list">List</button>
          </div>
        </div>
      </div>

      ${(() => {
        const total = Math.max(1, filteredWeapons.length);
        const c5 = filteredWeapons.filter((w) => Number(w.meta.rarity) === 5).length;
        const c4 = filteredWeapons.filter((w) => Number(w.meta.rarity) === 4).length;
        const c3 = Math.max(0, filteredWeapons.length - c5 - c4);
        return filteredWeapons.length
          ? `<div class="ed-armory-viz-wrap">
               <div class="ed-armory-viz-bar" aria-label="Weapon rarity breakdown">
                 ${c5 ? `<span class="ed-viz-5" style="width:${(c5 / total) * 100}%"></span>` : ''}
                 ${c4 ? `<span class="ed-viz-4" style="width:${(c4 / total) * 100}%"></span>` : ''}
                 ${c3 ? `<span class="ed-viz-3" style="width:${(c3 / total) * 100}%"></span>` : ''}
               </div>
               <div class="ed-armory-viz-legend mono">
                 <span class="text-gold">5★ ${c5}</span>
                 <span style="color:var(--telemetry-violet);">4★ ${c4}</span>
                 <span class="text-cyan">3★ ${c3}</span>
               </div>
             </div>`
          : '';
      })()}
      ${
        filteredWeapons.length
          ? `<div class="${density === 'list' ? 'armory-weapon-list' : 'armory-weapon-grid'}">
              ${filteredWeapons.map((w, idx) => renderWeaponCard(w, idx)).join('')}
            </div>`
          : '<div class="ed-empty-state">No weapons match the current filters.</div>'
      }
    </section>
  `;

  container.querySelectorAll('[data-armory-type]').forEach((btn) => {
    btn.addEventListener('click', () => handlers.onChangeArmoryFilter({ weaponType: btn.dataset.armoryType }));
  });
  container.querySelectorAll('[data-armory-filter]').forEach((btn) => {
    btn.addEventListener('click', () => handlers.onChangeArmoryFilter({ filter: btn.dataset.armoryFilter }));
  });
  container.querySelector('[data-armory-sort]')?.addEventListener('change', (e) => {
    handlers.onChangeArmoryFilter({ sortBy: e.target.value });
  });
  container.querySelectorAll('[data-armory-density]').forEach((btn) => {
    btn.addEventListener('click', () => handlers.onChangeArmoryFilter({ density: btn.dataset.armoryDensity }));
  });
  const searchInput = container.querySelector('[data-armory-search]');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const val = e.target.value;
      const pos = e.target.selectionStart;
      handlers.onChangeArmoryFilter({ search: val });
      const next = container.querySelector('[data-armory-search]');
      if (next) {
        next.focus();
        next.setSelectionRange(pos, pos);
      }
    });
  }

  container.querySelectorAll('[data-armory-inspect]').forEach((card) => {
    card.addEventListener('click', () => {
      const w = filteredWeapons[Number(card.dataset.armoryInspect)];
      if (w) openWeaponModal(w);
    });
  });
}

function openWeaponModal(w) {
  document.getElementById('armory-weapon-modal')?.remove();

  const prevFocus = document.activeElement;
  const backdrop = document.createElement('div');
  backdrop.id = 'armory-weapon-modal';
  backdrop.className = 'mat-inspector-backdrop';
  document.body.appendChild(backdrop);

  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    if (prevFocus && typeof prevFocus.focus === 'function') prevFocus.focus();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      close();
      return;
    }
    if (e.key === 'Tab') {
      const focusables = backdrop.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
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
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  let activeRef = Math.max(1, Math.min(5, Number(w.refinement) || 1));
  let focusMoved = false;

  const renderModal = (stats, loading = false) => {
    const lv80 = stats?.lv80;
    const lv90 = stats?.lv90;
    const upgrades = stats?.passiveUpgrades || [];
    const passiveText = upgrades[activeRef - 1] || stats?.passiveDesc || '';
    const holderLabel = w.holderName ? escapeHtml(w.holderName) : 'Unassigned';

    const modalRarity = Math.max(1, Math.min(5, Number(w.meta.rarity) || 3));
    backdrop.innerHTML = `
      <div class="mat-inspector-modal weapon-inspector-modal" data-rarity="${modalRarity}" role="dialog" aria-modal="true" aria-label="${escapeHtml(w.meta.name)}" aria-live="polite">
        <button type="button" class="mat-inspector-close" id="btn-close-weapon-modal" aria-label="Close">×</button>
        <div class="mat-inspector-head">
          <div class="armory-weapon-icon">
            ${renderAssetIcon('weapons', w.key, w.meta.name, 'icon-md')}
          </div>
          <div>
            <div class="ed-item-meta">${escapeHtml(w.meta.weaponType)} · <span class="mono">${w.meta.rarity}★</span></div>
            <h2 class="mat-inspector-title">${escapeHtml(w.meta.name)}</h2>
          </div>
        </div>

        <div class="dossier-hero-chips" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">
          ${
            w.isOwned
              ? `<span class="pill mono ${w.level >= 90 ? 'pill-mint' : ''}">Lv.${w.level} · A${w.ascension}</span>
                 <span class="pill pill-gold mono">Owned R${w.refinement}</span>
                 <span class="pill ${w.holderName ? 'pill-sky' : ''}">${w.holderName ? `Equipped by ${holderLabel}` : 'Unassigned'}</span>`
              : '<span class="pill pill-muted">Unowned · Catalog Preview</span>'
          }
        </div>

        ${
          loading
            ? '<div class="ed-empty-state"><span class="btn-spinner"></span> Fetching weapon stats &amp; passive from Project Amber…</div>'
            : stats
              ? `
          <div class="weapon-modal-stats">
            <div class="armory-stat-box">
              <span class="stat-label">Lv.80 Base ATK / Substat</span>
              <span class="stat-val mono">${lv80?.atk || '—'} ATK · ${escapeHtml(formatSubstat(lv80?.subKey, lv80?.subVal))}</span>
            </div>
            <div class="armory-stat-box">
              <span class="stat-label">Lv.90 Base ATK / Substat</span>
              <span class="stat-val mono text-gold">${lv90?.atk || '—'} ATK · ${escapeHtml(formatSubstat(lv90?.subKey, lv90?.subVal))}</span>
            </div>
          </div>

          ${
            stats.passiveName || passiveText
              ? `<div class="weapon-passive-box">
                  <div class="weapon-passive-head">
                    <strong class="text-gold">${escapeHtml(stats.passiveName || 'Weapon Passive')}</strong>
                    ${
                      upgrades.length > 1
                        ? `<div class="ed-filter-pills" role="group" aria-label="Refinement Rank">
                            ${upgrades
                              .map(
                                (_, idx) =>
                                  `<button type="button" class="filter-pill mono ${activeRef === idx + 1 ? 'active' : ''}" data-wep-ref="${idx + 1}">R${idx + 1}</button>`
                              )
                              .join('')}
                          </div>`
                        : ''
                    }
                  </div>
                  <p class="weapon-passive-desc">${formatWeaponRichText(passiveText)}</p>
                </div>`
              : ''
          }

          ${
            stats.description
              ? `<p class="weapon-lore-desc">${formatWeaponRichText(stats.description)}</p>`
              : ''
          }
          `
              : '<div class="ed-empty-state">Weapon stats unavailable offline.</div>'
        }
      </div>
    `;

    const closeBtn = backdrop.querySelector('#btn-close-weapon-modal');
    closeBtn?.addEventListener('click', close);
    if (!focusMoved) {
      closeBtn?.focus();
      focusMoved = true;
    }
    backdrop.querySelectorAll('[data-wep-ref]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeRef = Number(btn.dataset.wepRef) || 1;
        renderModal(stats, false);
      });
    });
  };

  const cached = getWeaponStats(w.key);
  if (cached && cached.description !== undefined) {
    renderModal(cached, false);
  } else {
    renderModal(cached, true);
    ensureWeaponStats(w.key).then((fresh) => {
      if (backdrop.isConnected) renderModal(fresh || cached, false);
    });
  }
}
