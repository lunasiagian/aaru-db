import { getCharacterMeta, getWeaponMeta, renderAssetIcon } from './catalog.js?v=20261115b';

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

  const renderWeaponCard = (w) => {
    const holderLabel = w.holderName ? escapeHtml(w.holderName) : 'Unassigned';
    if (density === 'list') {
      return `
      <div class="armory-weapon-row">
        <div class="armory-weapon-id">
          <div class="armory-weapon-icon">
            ${renderAssetIcon('weapons', w.key, w.meta.name, 'icon-sm')}
          </div>
          <div style="min-width:0;">
            <div class="item-name">${escapeHtml(w.meta.name)}</div>
            <div class="item-meta mono">${escapeHtml(w.meta.weaponType)} · ${w.meta.rarity}★</div>
          </div>
        </div>
        <div class="armory-row-badges mono">
          <span class="pill ${w.level >= 90 ? 'pill-mint' : ''}">Lv.${w.level} · A${w.ascension}</span>
          <span class="pill pill-gold">R${w.refinement}</span>
          <span class="pill ${w.holderName ? 'pill-sky' : ''}">${w.holderName ? `Equipped: ${holderLabel}` : 'Unassigned'}</span>
        </div>
      </div>`;
    }

    return `
    <div class="armory-weapon-card">
      <div class="armory-weapon-top">
        <div class="armory-weapon-id">
          <div class="armory-weapon-icon">
            ${renderAssetIcon('weapons', w.key, w.meta.name, 'icon-md')}
          </div>
          <div style="min-width:0;">
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
    </div>`;
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
              ${filteredWeapons.map(renderWeaponCard).join('')}
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
}
