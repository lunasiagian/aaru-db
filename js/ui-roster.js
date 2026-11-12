import { renderAssetIcon } from './assets.js';
import { getCatalog, getCharacterMeta, getWeaponMeta } from './catalog.js';

const ROSTER_FILTERS = ['All', 'Owned', 'Active Prefarm', 'In Progress', 'Built', 'Bench', 'Unowned'];
const SWAP_TAGS = ['', 'Imaginarium Theatre', 'Stygian Onslaught'];

export function renderRosterTab(container, state, handlers) {
  const { account, isReadOnly, rosterFilter } = state;
  const catalog = getCatalog();
  const ownedMap = new Map((account.characters || []).map((c) => [c.key, c]));
  const prefarmSet = new Set((account.prefarmQueue || []).map((p) => p.characterKey));

  // Build equipped weapon lookup from GOOD weapons location
  const weaponByLocation = new Map();
  for (const w of account.weapons || []) {
    if (w.location) {
      weaponByLocation.set(w.location, w);
    }
  }

  // Merge owned + catalog unowned characters
  const allKeys = new Set([
    ...ownedMap.keys(),
    ...Object.keys(catalog?.characters || {})
  ]);

  const combinedChars = Array.from(allKeys).map((key) => {
    const meta = getCharacterMeta(key);
    const owned = ownedMap.get(key);
    if (!owned) {
      return {
        key,
        meta,
        owned: false,
        level: 0,
        constellation: 0,
        talent: { auto: 0, skill: 0, burst: 0 },
        status: 'Unowned',
        swapTag: '',
        equippedWeapon: null
      };
    }
    const effectiveStatus = prefarmSet.has(key) && owned.status !== 'Built' ? 'Active Prefarm' : owned.status || 'In Progress';
    return {
      key,
      meta,
      owned: true,
      level: owned.level,
      constellation: owned.constellation,
      talent: owned.talent || { auto: 1, skill: 1, burst: 1 },
      status: effectiveStatus,
      swapTag: owned.swapTag || '',
      equippedWeapon: weaponByLocation.get(key) || null
    };
  });

  const q = (rosterFilter.search || '').trim().toLowerCase();
  const filteredChars = combinedChars
    .filter((c) => {
      if (rosterFilter.status === 'Owned' && !c.owned) return false;
      else if (rosterFilter.status !== 'All' && rosterFilter.status !== 'Owned' && c.status !== rosterFilter.status) return false;
      if (q && !c.meta.name.toLowerCase().includes(q) && !c.key.toLowerCase().includes(q)) return false;
      return true;
    })
    .sort((a, b) => {
      if (a.owned !== b.owned) return a.owned ? -1 : 1;
      return b.level - a.level || a.meta.name.localeCompare(b.meta.name);
    });

  const filteredWeapons = [...(account.weapons || [])]
    .filter((w) => {
      if (!q) return true;
      const wm = getWeaponMeta(w.key);
      return wm.name.toLowerCase().includes(q) || w.key.toLowerCase().includes(q) || (w.location || '').toLowerCase().includes(q);
    })
    .sort((a, b) => b.level - a.level || b.refinement - a.refinement);

  const disabledAttr = isReadOnly ? 'disabled' : '';

  container.innerHTML = `
    <div class="section-header">
      <div>
        <div class="eyebrow">GENSHIN SHEET (FINAL) / ROSTER &amp; ARMORY</div>
        <h1 class="section-title">Character Roster &amp; Weapon Armory</h1>
      </div>
      <div class="header-meta mono">
        OWNED: <span class="text-gold">${ownedMap.size}</span> CHARS • <span class="text-mint">${(account.weapons || []).length}</span> WEAPONS
      </div>
    </div>

    <article class="card">
      <div class="vault-toolbar">
        <div class="filter-pills">
          ${ROSTER_FILTERS.map(
            (st) =>
              `<button type="button" class="filter-pill ${rosterFilter.status === st ? 'active' : ''}" data-roster-status="${st}">${st}</button>`
          ).join('')}
        </div>
        <div class="toolbar-right">
          <div class="subtab-switch">
            <button type="button" class="filter-pill ${rosterFilter.view === 'characters' ? 'active' : ''}" data-roster-view="characters">Characters (${filteredChars.length})</button>
            <button type="button" class="filter-pill ${rosterFilter.view === 'weapons' ? 'active' : ''}" data-roster-view="weapons">Weapons (${filteredWeapons.length})</button>
          </div>
          <input type="search" class="input-search" placeholder="Search character or weapon..." value="${rosterFilter.search || ''}" data-roster-search />
        </div>
      </div>

      ${
        rosterFilter.view === 'characters'
          ? `
        <div class="roster-grid">
          ${filteredChars.length
            ? filteredChars
                .map((c) => {
                  const weaponMeta = c.equippedWeapon ? getWeaponMeta(c.equippedWeapon.key) : null;
                  const statusClass =
                    c.status === 'Built'
                      ? 'pill-mint'
                      : c.status === 'Active Prefarm'
                        ? 'pill-gold'
                        : c.status === 'Unowned'
                          ? 'pill-muted'
                          : '';
                  return `
                  <div class="roster-card ${!c.owned ? 'is-unowned' : ''}">
                    <div class="roster-card-top">
                      <div class="roster-identity">
                        ${renderAssetIcon('characters', c.key, c.meta.name, 'icon-md')}
                        <div>
                          <div class="item-name">${c.meta.name}</div>
                          <div class="item-meta mono">${c.meta.element} • ${c.meta.weaponType}</div>
                        </div>
                      </div>
                      <span class="pill mono ${statusClass}">${c.status}</span>
                    </div>

                    ${
                      c.owned
                        ? `
                      <div class="roster-stats mono">
                        <div class="stat-box">
                          <span class="stat-label">LVL</span>
                          <span class="stat-val ${c.level >= 95 ? 'text-gold' : ''}">${c.level}</span>
                        </div>
                        <div class="stat-box">
                          <span class="stat-label">CONST</span>
                          <span class="stat-val">C${c.constellation}</span>
                        </div>
                        <div class="stat-box">
                          <span class="stat-label">TALENTS</span>
                          <span class="stat-val">${c.talent.auto}/${c.talent.skill}/${c.talent.burst}</span>
                        </div>
                      </div>

                      <div class="roster-weapon-row">
                        ${
                          c.equippedWeapon
                            ? `${renderAssetIcon('weapons', c.equippedWeapon.key, weaponMeta.name, 'icon-xs')}
                               <span class="weapon-label">${weaponMeta.name}</span>
                               <span class="mono muted">Lv.${c.equippedWeapon.level} R${c.equippedWeapon.refinement}</span>`
                            : '<span class="muted mono">No weapon equipped</span>'
                        }
                      </div>

                      <div class="roster-swap-row">
                        <label class="mini-field full">
                          <span>SWAP TAG</span>
                          <select class="select-xs mono" data-char-swap="${c.key}" ${disabledAttr}>
                            ${SWAP_TAGS.map(
                              (t) => `<option value="${t}" ${c.swapTag === t ? 'selected' : ''}>${t || '— None —'}</option>`
                            ).join('')}
                          </select>
                        </label>
                        <label class="mini-field">
                          <span>STATUS</span>
                          <select class="select-xs mono" data-char-status="${c.key}" ${disabledAttr}>
                            ${['Built', 'Active Prefarm', 'In Progress', 'Bench']
                              .map((s) => `<option value="${s}" ${c.status === s ? 'selected' : ''}>${s}</option>`)
                              .join('')}
                          </select>
                        </label>
                      </div>`
                        : '<div class="unowned-note mono">Not yet recruited in Irminsul export.</div>'
                    }
                  </div>`;
                })
                .join('')
            : '<div class="empty-state">No characters match the selected filter.</div>'}
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
                          <div class="item-name">${wm.name}</div>
                          <div class="item-meta mono">${wm.weaponType} • ${wm.rarity}★</div>
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
                        <span class="stat-val">${holderMeta ? holderMeta.name : 'Unassigned'}</span>
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

  container.querySelectorAll('[data-roster-view]').forEach((btn) => {
    btn.addEventListener('click', () => handlers.onChangeRosterFilter({ view: btn.dataset.rosterView }));
  });

  container.querySelector('[data-roster-search]')?.addEventListener('input', (e) => {
    handlers.onChangeRosterFilter({ search: e.target.value }, { preserveFocusSelector: '[data-roster-search]' });
  });

  if (!isReadOnly) {
    container.querySelectorAll('[data-char-swap]').forEach((sel) => {
      sel.addEventListener('change', (e) => handlers.onUpdateCharacterField(e.target.dataset.charSwap, 'swapTag', e.target.value));
    });
    container.querySelectorAll('[data-char-status]').forEach((sel) => {
      sel.addEventListener('change', (e) => handlers.onUpdateCharacterField(e.target.dataset.charStatus, 'status', e.target.value));
    });
  }
}
