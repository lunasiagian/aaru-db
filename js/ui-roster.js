import { renderAssetIcon } from './assets.js';
import { getAllCharacterKeys, getCharacterMeta, getWeaponMeta } from './catalog.js?v=20261113b';

const STATUS_PILLS = ['All', 'Active Work', 'Combat Ready', 'Swap Flagged'];
const ELEMENT_PILLS = ['All', 'Pyro', 'Hydro', 'Anemo', 'Electro', 'Dendro', 'Cryo', 'Geo'];
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

function formatStatusLabel(c) {
  if (c.status === 'Active Prefarm') {
    return c.priorityRank ? `#${c.priorityRank} PREFARM` : 'PREFARM';
  }
  if (c.status === 'In Progress') return 'BUILDING';
  if (c.status === 'Built') return 'BUILT';
  if (c.status === 'Bench') return 'BENCH';
  return 'UNOWNED';
}

function getStatusPillClass(status) {
  if (status === 'Built') return 'pill-mint';
  if (status === 'Active Prefarm') return 'pill-gold';
  if (status === 'In Progress') return 'pill-sky';
  if (status === 'Unowned') return 'pill-muted';
  return '';
}

function sortByPriorityThenLevel(a, b) {
  const ra = Number(a.priorityRank) || 9999;
  const rb = Number(b.priorityRank) || 9999;
  if (ra !== rb) return ra - rb;
  return b.level - a.level || a.meta.name.localeCompare(b.meta.name);
}

function renderCharacterCard(c, density) {
  const cornerBadge = c.owned ? `Lv.${c.level} · C${c.constellation}` : 'UNOWNED';
  const statusLabel = formatStatusLabel(c);
  const statusClass = getStatusPillClass(c.status);
  const swapBadge = isSwapFlagged(c) ? '<span class="roster-swap-flag mono" title="Gear Swap / Borrowing Flagged">⇄</span>' : '';

  if (density === 'list') {
    return `
      <button type="button" class="roster-list-row ${!c.owned ? 'is-unowned' : ''}" data-inspect-char="${c.key}">
        <span class="roster-list-left">
          ${renderAssetIcon('characters', c.key, c.meta.name, 'icon-sm')}
          <span class="roster-list-name">${escapeHtml(c.meta.name)}</span>
        </span>
        <span class="roster-list-right mono">
          ${swapBadge}
          <span class="roster-corner-badge">${cornerBadge}</span>
          <span class="pill ${statusClass}">${statusLabel}</span>
        </span>
      </button>`;
  }

  return `
    <button type="button" class="roster-portrait-card ${!c.owned ? 'is-unowned' : ''}" data-inspect-char="${c.key}">
      <span class="roster-corner-badge mono">${cornerBadge}</span>
      <div class="roster-portrait-frame">
        ${renderAssetIcon('characters', c.key, c.meta.name, 'icon-portrait')}
      </div>
      <div class="roster-portrait-footer">
        <span class="roster-portrait-name">${escapeHtml(c.meta.name)}</span>
        <span class="roster-portrait-pills">
          <span class="pill mono ${statusClass}">${statusLabel}</span>
          ${swapBadge}
        </span>
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

function renderInspectorDrawer(c, isReadOnly) {
  if (!c) return '';
  const disabledAttr = isReadOnly ? 'disabled' : '';
  const weaponMeta = c.equippedWeapon ? getWeaponMeta(c.equippedWeapon.key) : null;

  return `
    <div class="roster-drawer-backdrop" data-close-drawer>
      <aside class="roster-drawer" role="dialog" aria-label="${escapeHtml(c.meta.name)} Inspector">
        <div class="roster-drawer-head">
          <div class="roster-identity">
            ${renderAssetIcon('characters', c.key, c.meta.name, 'icon-md')}
            <div>
              <h2 class="roster-drawer-title">${escapeHtml(c.meta.name)}</h2>
              <div class="item-meta mono">${escapeHtml(c.meta.element)} • ${escapeHtml(c.meta.weaponType)}</div>
            </div>
          </div>
          <button type="button" class="btn-icon" data-close-drawer aria-label="Close inspector">✕</button>
        </div>

        <form class="roster-drawer-form" data-inspector-form="${c.key}">
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
              <input type="number" min="1" max="10" class="input-mono" name="tAuto" value="${c.talent?.auto || 1}" ${disabledAttr} />
            </label>
            <label class="mini-field">
              <span>E (SKILL)</span>
              <input type="number" min="1" max="10" class="input-mono" name="tSkill" value="${c.talent?.skill || 1}" ${disabledAttr} />
            </label>
            <label class="mini-field">
              <span>Q (BURST)</span>
              <input type="number" min="1" max="10" class="input-mono" name="tBurst" value="${c.talent?.burst || 1}" ${disabledAttr} />
            </label>
          </div>

          <div class="roster-drawer-weapon">
            <div class="card-eyebrow">EQUIPPED WEAPON</div>
            ${
              c.equippedWeapon
                ? `<div class="roster-weapon-row">
                    ${renderAssetIcon('weapons', c.equippedWeapon.key, weaponMeta.name, 'icon-sm')}
                    <span class="weapon-label">${escapeHtml(weaponMeta.name)}</span>
                    <span class="mono muted">Lv.${c.equippedWeapon.level} · R${c.equippedWeapon.refinement}</span>
                  </div>`
                : '<div class="muted mono" style="font-size:12px;">No weapon assigned in GOOD export</div>'
            }
          </div>

          <label class="mini-field full">
            <span>GEAR SWAP &amp; BUILD NOTES (IT / STYGIAN ONSLAUGHT)</span>
            <textarea rows="4" class="textarea-lab" name="notes" placeholder="e.g. Borrowing Favonius Lance from Zhongli for Stygian Onslaught; swap Emblem sands..." ${disabledAttr}>${escapeHtml(c.notes || '')}</textarea>
          </label>

          <div class="roster-drawer-foot">
            ${
              isReadOnly
                ? '<span class="muted mono" style="font-size:12px;">Partner View — Read-only</span>'
                : '<button type="submit" class="btn btn-gold">Save to Sheet</button>'
            }
          </div>
        </form>
      </aside>
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

  const allKeys = new Set([
    ...ownedMap.keys(),
    ...getAllCharacterKeys()
  ]);

  const combinedChars = Array.from(allKeys).map((key) => {
    const meta = getCharacterMeta(key);
    const owned = ownedMap.get(key);
    if (!owned || owned.status === 'Unowned' || owned.owned === false) {
      return {
        key,
        meta,
        owned: false,
        level: owned?.level || 0,
        targetLevel: owned?.targetLevel || 90,
        constellation: owned?.constellation || 0,
        talent: owned?.talent || { auto: 1, skill: 1, burst: 1 },
        status: 'Unowned',
        priorityRank: owned?.priorityRank || '',
        swapTag: owned?.swapTag || '',
        notes: owned?.notes || '',
        equippedWeapon: null
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
      targetLevel: Number(owned.targetLevel) || 90,
      constellation: Number(owned.constellation) || 0,
      talent: owned.talent || { auto: 1, skill: 1, burst: 1 },
      status: effectiveStatus,
      priorityRank: owned.priorityRank || '',
      swapTag: owned.swapTag || '',
      notes: owned.notes || '',
      equippedWeapon: weaponByLocation.get(key) || null
    };
  });

  const q = (rosterFilter.search || '').trim().toLowerCase();
  const statusFilter = rosterFilter.status || 'All';
  const elementFilter = rosterFilter.element || 'All';
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

  const activeTier = filteredChars
    .filter((c) => c.status === 'Active Prefarm' || c.status === 'In Progress')
    .sort(sortByPriorityThenLevel);

  const builtTier = filteredChars
    .filter((c) => c.status === 'Built')
    .sort((a, b) => b.level - a.level || a.meta.name.localeCompare(b.meta.name));

  const archiveTier = filteredChars
    .filter((c) => c.status === 'Bench' || c.status === 'Unowned')
    .sort((a, b) => (a.owned === b.owned ? b.level - a.level || a.meta.name.localeCompare(b.meta.name) : a.owned ? -1 : 1));

  const filteredWeapons = [...(account.weapons || [])]
    .filter((w) => {
      if (!q) return true;
      const wm = getWeaponMeta(w.key);
      return wm.name.toLowerCase().includes(q) || w.key.toLowerCase().includes(q) || (w.location || '').toLowerCase().includes(q);
    })
    .sort((a, b) => b.level - a.level || b.refinement - a.refinement);

  const inspectedChar = rosterFilter.inspectedKey
    ? combinedChars.find((c) => c.key === rosterFilter.inspectedKey) || null
    : null;

  container.innerHTML = `
    <div class="section-header">
      <div>
        <div class="eyebrow">GENSHIN SHEET (FINAL) / ROSTER &amp; ARMORY</div>
        <h1 class="section-title">Character Roster &amp; Weapon Armory</h1>
      </div>
      <div class="header-meta mono">
        OWNED: <span class="text-gold">${combinedChars.filter((c) => c.owned).length}</span> CHARS • <span class="text-mint">${(account.weapons || []).length}</span> WEAPONS
      </div>
    </div>

    <article class="card">
      <div class="roster-toolbar">
        <div class="roster-pill-row">
          <div class="filter-pills">
            ${STATUS_PILLS.map(
              (st) => `<button type="button" class="filter-pill ${statusFilter === st ? 'active' : ''}" data-roster-status="${st}">${st}</button>`
            ).join('')}
          </div>
          <span class="roster-pill-divider"></span>
          <div class="filter-pills">
            ${ELEMENT_PILLS.map(
              (el) => `<button type="button" class="filter-pill ${elementFilter === el ? 'active' : ''}" data-roster-element="${el}">${el === 'All' ? 'All Elements' : el}</button>`
            ).join('')}
          </div>
        </div>

        <div class="toolbar-right">
          <div class="subtab-switch">
            <button type="button" class="filter-pill ${density === 'grid' ? 'active' : ''}" data-roster-density="grid">Portrait Grid</button>
            <button type="button" class="filter-pill ${density === 'list' ? 'active' : ''}" data-roster-density="list">Compact List</button>
          </div>
          <div class="subtab-switch">
            <button type="button" class="filter-pill ${rosterFilter.view === 'characters' ? 'active' : ''}" data-roster-view="characters">Characters (${filteredChars.length})</button>
            <button type="button" class="filter-pill ${rosterFilter.view === 'weapons' ? 'active' : ''}" data-roster-view="weapons">Weapons (${filteredWeapons.length})</button>
          </div>
          <input type="search" class="input-search" placeholder="Search character or weapon..." value="${escapeHtml(rosterFilter.search || '')}" data-roster-search />
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

    ${renderInspectorDrawer(inspectedChar, isReadOnly)}
  `;

  container.querySelectorAll('[data-roster-status]').forEach((btn) => {
    btn.addEventListener('click', () => handlers.onChangeRosterFilter({ status: btn.dataset.rosterStatus }));
  });

  container.querySelectorAll('[data-roster-element]').forEach((btn) => {
    btn.addEventListener('click', () => handlers.onChangeRosterFilter({ element: btn.dataset.rosterElement }));
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
      handlers.onChangeRosterFilter({ inspectedKey: card.dataset.inspectChar });
    });
  });

  container.querySelectorAll('[data-close-drawer]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target === el || el.tagName === 'BUTTON') {
        handlers.onChangeRosterFilter({ inspectedKey: null });
      }
    });
  });

  const form = container.querySelector('[data-inspector-form]');
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
}
