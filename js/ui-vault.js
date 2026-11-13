import { renderAssetIcon } from './assets.js';
import { getMaterialMeta } from './catalog.js?v=20261113d';
import { upsertInventoryRow } from './api.js';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const debounceTimers = new Map();

export function renderVaultTab(container, state, handlers) {
  const { account, isReadOnly, vaultFilter } = state;
  const inventory = account.inventory || {};
  const todayName = WEEKDAYS[new Date().getDay()];

  const allEntries = Object.entries(inventory).map(([key, entry]) => {
    const meta = getMaterialMeta(key);
    const count = Number(entry?.count ?? 0);
    const target = Number(entry?.target ?? 0);
    const category = entry?.category || meta.category || 'Material';
    const isLowStock = target > 0 && count < target;
    const days = meta.daysOfWeek || [];
    const availableToday = days.length > 0 && (days.includes(todayName) || days.includes('Sunday'));
    return {
      key,
      name: meta.name,
      category,
      count,
      target,
      isLowStock,
      availableToday,
      days
    };
  });

  const categories = ['All', ...Array.from(new Set(allEntries.map((e) => e.category))).sort()];
  const lowStockCount = allEntries.filter((e) => e.isLowStock).length;
  const availableTodayCount = allEntries.filter((e) => e.availableToday).length;

  const q = (vaultFilter.search || '').trim().toLowerCase();
  const filtered = allEntries
    .filter((e) => {
      if (vaultFilter.category !== 'All' && e.category !== vaultFilter.category) return false;
      if (vaultFilter.lowStockOnly && !e.isLowStock) return false;
      if (q && !e.name.toLowerCase().includes(q) && !e.key.toLowerCase().includes(q)) return false;
      return true;
    })
    .sort((a, b) => {
      if (a.isLowStock && !b.isLowStock) return -1;
      if (!a.isLowStock && b.isLowStock) return 1;
      return a.name.localeCompare(b.name);
    });

  const disabledAttr = isReadOnly ? 'disabled' : '';

  container.innerHTML = `
    <div class="section-header">
      <div>
        <div class="eyebrow">GENSHIN SHEET (FINAL) / THE SSOT VAULT</div>
        <h1 class="section-title">Single Source of Truth Inventory</h1>
      </div>
      <div class="header-meta mono">
        SHEET: <span class="text-gold">${account.user}_Inventory</span>
      </div>
    </div>

    <div class="vault-kpi-grid">
      <article class="card">
        <div class="card-eyebrow">TRACKED ENTRIES</div>
        <div class="kpi-hero mono">${allEntries.length}</div>
        <div class="kpi-sub">Synced materials &amp; currencies</div>
      </article>
      <article class="card">
        <div class="card-eyebrow">LOW-STOCK MATERIALS</div>
        <div class="kpi-hero mono text-coral">${lowStockCount}</div>
        <div class="kpi-sub">Below target threshold</div>
      </article>
      <article class="card">
        <div class="card-eyebrow">AVAILABLE TODAY (${todayName.toUpperCase()})</div>
        <div class="kpi-hero mono text-mint">${availableTodayCount}</div>
        <div class="kpi-sub">Farmable in today's domains</div>
      </article>
    </div>

    <article class="card">
      <div class="vault-toolbar">
        <div class="filter-pills">
          ${categories
            .map(
              (cat) =>
                `<button type="button" class="filter-pill ${vaultFilter.category === cat ? 'active' : ''}" data-vault-cat="${cat}">${cat}</button>`
            )
            .join('')}
        </div>
        <div class="toolbar-right">
          <label class="toggle-chip">
            <input type="checkbox" data-vault-lowstock ${vaultFilter.lowStockOnly ? 'checked' : ''} />
            <span>Low Stock Only</span>
          </label>
          <input type="search" class="input-search" placeholder="Search material or PascalKey..." value="${vaultFilter.search || ''}" data-vault-search />
        </div>
      </div>

      <div class="vault-table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>MATERIAL</th>
              <th>CATEGORY</th>
              <th>TARGET</th>
              <th>STATUS</th>
              <th class="num-col">RAW COUNT</th>
              <th class="sync-col">SYNC</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.length
              ? filtered
                  .map(
                    (row) => `
                  <tr data-vault-row="${row.key}">
                    <td>
                      <div class="mat-cell">
                        ${renderAssetIcon('materials', row.key, row.name, 'icon-sm')}
                        <div>
                          <div class="item-name">${row.name}</div>
                          <div class="item-meta mono">${row.key}${row.availableToday ? ' • <span class="text-mint">OPEN TODAY</span>' : ''}</div>
                        </div>
                      </div>
                    </td>
                    <td><span class="pill">${row.category}</span></td>
                    <td class="mono muted">${row.target ? row.target.toLocaleString() : '—'}</td>
                    <td>
                      ${
                        row.isLowStock
                          ? `<span class="pill pill-coral mono">LOW (-${(row.target - row.count).toLocaleString()})</span>`
                          : row.target > 0
                            ? '<span class="pill pill-mint mono">SURPLUS</span>'
                            : '<span class="pill mono">TRACKED</span>'
                      }
                    </td>
                    <td class="num-col">
                      <input
                        type="number"
                        min="0"
                        class="input-mono vault-raw-input"
                        data-vault-input="${row.key}"
                        value="${row.count}"
                        ${disabledAttr}
                      />
                    </td>
                    <td class="sync-col">
                      <span class="saved-badge mono" data-saved-badge="${row.key}"></span>
                    </td>
                  </tr>`
                  )
                  .join('')
              : '<tr><td colspan="6" class="empty-state">No materials match the current filter.</td></tr>'}
          </tbody>
        </table>
      </div>
    </article>
  `;

  container.querySelectorAll('[data-vault-cat]').forEach((btn) => {
    btn.addEventListener('click', () => handlers.onChangeVaultFilter({ category: btn.dataset.vaultCat }));
  });

  container.querySelector('[data-vault-lowstock]')?.addEventListener('change', (e) => {
    handlers.onChangeVaultFilter({ lowStockOnly: e.target.checked });
  });

  const searchInput = container.querySelector('[data-vault-search]');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      handlers.onChangeVaultFilter({ search: e.target.value }, { preserveFocusSelector: '[data-vault-search]' });
    });
  }

  if (!isReadOnly) {
    container.querySelectorAll('[data-vault-input]').forEach((input) => {
      input.addEventListener('input', (e) => {
        const key = e.target.dataset.vaultInput;
        const newVal = Math.max(0, Number(e.target.value) || 0);
        const badge = container.querySelector(`[data-saved-badge="${key}"]`);
        if (badge) {
          badge.textContent = 'Saving...';
          badge.className = 'saved-badge mono is-saving';
        }

        if (debounceTimers.has(key)) clearTimeout(debounceTimers.get(key));
        const timer = setTimeout(async () => {
          try {
            const existing = account.inventory[key] || {};
            const meta = getMaterialMeta(key);
            const payload = {
              count: newVal,
              target: existing.target ?? 0,
              category: existing.category || meta.category || 'Material'
            };
            await upsertInventoryRow(account.user, key, payload);
            handlers.onInventoryRowSaved(key, payload);
            const liveBadge = container.querySelector(`[data-saved-badge="${key}"]`);
            if (liveBadge) {
              liveBadge.textContent = 'Saved ✓';
              liveBadge.className = 'saved-badge mono is-saved';
            }
          } catch (err) {
            const liveBadge = container.querySelector(`[data-saved-badge="${key}"]`);
            if (liveBadge) {
              liveBadge.textContent = 'Error';
              liveBadge.className = 'saved-badge mono is-error';
            }
            console.error(err);
          }
        }, 600);
        debounceTimers.set(key, timer);
      });
    });
  }
}
