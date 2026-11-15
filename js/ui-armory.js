import { renderAssetIcon } from './assets.js';
import {
  ensureWeaponStats,
  getCharacterMeta,
  getWeaponMeta,
  getWeaponStats
} from './catalog.js?v=20261115ae';

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

  const allWeapons = account.weapons || [];
  const filteredWeapons = allWeapons
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
      if (badgeFilter === '5' || badgeFilter === '4' || badgeFilter === '3') {
        if (Number(w.meta.rarity) !== Number(badgeFilter)) return false;
      } else if (badgeFilter === 'equipped' && !w.location) {
        return false;
      } else if (badgeFilter === 'unassigned' && w.location) {
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
    if (density === 'list') {
      return `
      <button type="button" class="armory-weapon-row" data-armory-inspect="${idx}">
        <div class="armory-weapon-id">
          <div class="armory-weapon-icon">
            ${renderAssetIcon('weapons', w.key, w.meta.name, 'icon-sm')}
          </div>
          <div style="min-width:0;text-align:left;">
            <div class="item-name">${escapeHtml(w.meta.name)}</div>
            <div class="item-meta mono">${escapeHtml(w.meta.weaponType)} · ${w.meta.rarity}★</div>
          </div>
        </div>
        <div class="armory-row-badges mono">
          <span class="pill ${w.level >= 90 ? 'pill-mint' : ''}">Lv.${w.level} · A${w.ascension}</span>
          <span class="pill pill-gold">R${w.refinement}</span>
          <span class="pill ${w.holderName ? 'pill-sky' : ''}">${w.holderName ? `Equipped: ${holderLabel}` : 'Unassigned'}</span>
        </div>
      </button>`;
    }

    return `
    <button type="button" class="armory-weapon-card" data-armory-inspect="${idx}">
      <div class="armory-weapon-top">
        <div class="armory-weapon-id">
          <div class="armory-weapon-icon">
            ${renderAssetIcon('weapons', w.key, w.meta.name, 'icon-md')}
          </div>
          <div style="min-width:0;text-align:left;">
            <div class="item-name">${escapeHtml(w.meta.name)}</div>
            <div class="item-meta mono">${escapeHtml(w.meta.weaponType)} · ${w.meta.rarity}★</div>
          </div>
        </div>
        <span class="pill mono ${w.level >= 90 ? 'pill-mint' : ''}">Lv.${w.level}</span>
      </div>
      <div class="armory-weapon-stats mono">
        <div class="armory-stat-box">
          <span class="stat-label">REFINE</span>
          <span class="stat-val text-gold">R${w.refinement}</span>
        </div>
        <div class="armory-stat-box">
          <span class="stat-label">ASC</span>
          <span class="stat-val">A${w.ascension}</span>
        </div>
        <div class="armory-stat-box">
          <span class="stat-label">EQUIPPED</span>
          <span class="stat-val ${w.holderName ? 'text-cyan' : 'muted'}">${holderLabel}</span>
        </div>
      </div>
    </button>`;
  };

  container.innerHTML = `
    <div class="section-header">
      <div>
        <div class="eyebrow">AARUDB / ARMORY</div>
        <h1 class="section-title">Armory</h1>
      </div>
      <div class="header-meta mono">
        OWNED: <span class="text-mint">${allWeapons.length}</span> WEAPONS · SHOWING <span class="text-gold">${filteredWeapons.length}</span>
      </div>
    </div>

    <article class="card">
      <div class="roster-toolbar roster-toolbar-single">
        <div class="roster-toolbar-left">
          <div class="filter-pills">
            ${WEAPON_TYPE_PILLS.map(
              (wt) => `<button type="button" class="filter-pill ${typeFilter === wt ? 'active' : ''}" data-armory-type="${wt}">${wt}</button>`
            ).join('')}
          </div>
          <div class="filter-pills">
            ${ARMORY_FILTER_PILLS.map(
              (f) => `<button type="button" class="filter-pill ${badgeFilter === f.id ? 'active' : ''}" data-armory-filter="${f.id}">${f.label}</button>`
            ).join('')}
          </div>
        </div>

        <div class="roster-toolbar-right">
          <select class="select-sm mono roster-sort-select" data-armory-sort aria-label="Sort weapons">
            ${ARMORY_SORT_OPTIONS.map(
              (opt) => `<option value="${opt.value}" ${sortBy === opt.value ? 'selected' : ''}>${opt.label}</option>`
            ).join('')}
          </select>
          <input type="search" class="input-search input-search-sm" placeholder="Search weapon or holder..." value="${escapeHtml(armoryFilter.search || '')}" data-armory-search />
          <div class="subtab-switch">
            <button type="button" class="filter-pill ${density === 'grid' ? 'active' : ''}" data-armory-density="grid">Grid</button>
            <button type="button" class="filter-pill ${density === 'list' ? 'active' : ''}" data-armory-density="list">List</button>
          </div>
        </div>
      </div>

      ${
        filteredWeapons.length
          ? `<div class="${density === 'list' ? 'armory-weapon-list' : 'armory-weapon-grid'}">
              ${filteredWeapons.map((w, idx) => renderWeaponCard(w, idx)).join('')}
            </div>`
          : '<div class="empty-state">No weapons match the current filters.</div>'
      }
    </article>
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

  const backdrop = document.createElement('div');
  backdrop.id = 'armory-weapon-modal';
  backdrop.className = 'modal-backdrop';
  document.body.appendChild(backdrop);

  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  let activeRef = Math.max(1, Math.min(5, Number(w.refinement) || 1));

  const renderModal = (stats, loading = false) => {
    const lv80 = stats?.lv80;
    const lv90 = stats?.lv90;
    const upgrades = stats?.passiveUpgrades || [];
    const passiveText = upgrades[activeRef - 1] || stats?.passiveDesc || '';
    const holderLabel = w.holderName ? escapeHtml(w.holderName) : 'Unassigned';

    backdrop.innerHTML = `
      <div class="modal-card card weapon-inspector-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(w.meta.name)}">
        <div class="modal-head">
          <div class="armory-weapon-id">
            <div class="armory-weapon-icon">
              ${renderAssetIcon('weapons', w.key, w.meta.name, 'icon-md')}
            </div>
            <div>
              <div class="eyebrow">${escapeHtml(w.meta.weaponType)} · ${w.meta.rarity}★</div>
              <h2 class="card-title" style="margin:2px 0 0;">${escapeHtml(w.meta.name)}</h2>
            </div>
          </div>
          <button type="button" class="btn btn-ghost btn-xs" id="btn-close-weapon-modal">✕</button>
        </div>

        <div class="dossier-hero-chips mono">
          <span class="pill ${w.level >= 90 ? 'pill-mint' : ''}">Lv.${w.level} · A${w.ascension}</span>
          <span class="pill pill-gold">Owned R${w.refinement}</span>
          <span class="pill ${w.holderName ? 'pill-sky' : ''}">${w.holderName ? `Equipped by ${holderLabel}` : 'Unassigned'}</span>
        </div>

        ${
          loading
            ? '<div class="empty-state mono"><span class="btn-spinner"></span> Fetching weapon stats &amp; passive from Project Amber...</div>'
            : stats
              ? `
          <div class="weapon-modal-stats mono">
            <div class="armory-stat-box">
              <span class="stat-label">LV.80 BASE ATK / SUBSTAT</span>
              <span class="stat-val">${lv80?.atk || '—'} ATK · ${escapeHtml(formatSubstat(lv80?.subKey, lv80?.subVal))}</span>
            </div>
            <div class="armory-stat-box">
              <span class="stat-label">LV.90 BASE ATK / SUBSTAT</span>
              <span class="stat-val text-gold">${lv90?.atk || '—'} ATK · ${escapeHtml(formatSubstat(lv90?.subKey, lv90?.subVal))}</span>
            </div>
          </div>

          ${
            stats.passiveName || passiveText
              ? `<div class="weapon-passive-box">
                  <div class="weapon-passive-head">
                    <strong class="text-gold">${escapeHtml(stats.passiveName || 'Weapon Passive')}</strong>
                    ${
                      upgrades.length > 1
                        ? `<div class="filter-pills">
                            ${upgrades
                              .map(
                                (_, idx) =>
                                  `<button type="button" class="filter-pill ${activeRef === idx + 1 ? 'active' : ''}" data-wep-ref="${idx + 1}">R${idx + 1}</button>`
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
              : '<div class="empty-state mono">Weapon stats unavailable offline.</div>'
        }
      </div>
    `;

    backdrop.querySelector('#btn-close-weapon-modal')?.addEventListener('click', close);
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
