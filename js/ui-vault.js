import { renderAssetIcon } from './assets.js';
import { getMaterialMeta } from './catalog.js?v=20261120aj';
import { upsertInventoryRow } from './api.js?v=20261116a';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const debounceTimers = new Map();

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(str) {
  return escapeHtml(str);
}

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
    <header class="ed-roster-head">
      <div>
        <h1 class="ed-page-title">Inventory Vault</h1>
        <p class="section-subtitle muted">Live material ledger · Low-stock items surface first for quick count updates.</p>
      </div>
      <div class="ed-hud-meta">
        <span>Account</span>
        <strong class="text-gold">${escapeHtml(account.user)}</strong>
      </div>
    </header>

    <div class="ed-vault-kpi-strip" role="region" aria-label="Vault Summary">
      <div class="ed-vault-kpi">
        <span class="ed-vault-kpi-label">Tracked Materials</span>
        <strong class="ed-vault-kpi-val mono">${allEntries.length}</strong>
      </div>
      <div class="ed-vault-kpi">
        <span class="ed-vault-kpi-label">Low Stock</span>
        <strong class="ed-vault-kpi-val mono text-coral">${lowStockCount}</strong>
      </div>
      <div class="ed-vault-kpi">
        <span class="ed-vault-kpi-label">Open Today (${escapeHtml(todayName)})</span>
        <strong class="ed-vault-kpi-val mono text-mint">${availableTodayCount}</strong>
      </div>
    </div>

    <section class="ed-vault-section">
      <div class="ed-vault-toolbar">
        <div class="ed-filter-pills" role="group" aria-label="Material Categories">
          ${categories
            .map(
              (cat) =>
                `<button type="button" class="filter-pill ${vaultFilter.category === cat ? 'active' : ''}" data-vault-cat="${escapeAttr(cat)}">${escapeHtml(cat)}</button>`
            )
            .join('')}
        </div>
        <div class="ed-vault-controls">
          <label class="ed-toggle-chip">
            <input type="checkbox" data-vault-lowstock ${vaultFilter.lowStockOnly ? 'checked' : ''} />
            <span>Low Stock Only</span>
          </label>
          <input
            type="search"
            class="input-search"
            aria-label="Search materials by name or key"
            placeholder="Search material or PascalKey…"
            value="${escapeAttr(vaultFilter.search || '')}"
            data-vault-search
          />
        </div>
      </div>

      <div class="ed-vault-table-wrap">
        <table class="ed-data-table">
          <thead>
            <tr>
              <th scope="col">Material</th>
              <th scope="col">Category</th>
              <th scope="col">Target</th>
              <th scope="col">Status</th>
              <th scope="col" class="num-col">Raw Count</th>
              <th scope="col" class="sync-col">Sync</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.length
              ? filtered
                  .map(
                    (row) => `
                  <tr data-vault-row="${escapeAttr(row.key)}">
                    <td>
                      <div class="ed-mat-cell">
                        ${renderAssetIcon('materials', row.key, row.name, 'icon-sm')}
                        <div>
                          <div class="ed-item-name">${escapeHtml(row.name)}</div>
                          <div class="ed-item-meta">${escapeHtml(row.key)}${row.availableToday ? ' · <span class="text-mint">Open Today</span>' : ''}</div>
                        </div>
                      </div>
                    </td>
                    <td><span class="pill">${escapeHtml(row.category)}</span></td>
                    <td class="mono muted">${row.target ? row.target.toLocaleString() : '—'}</td>
                    <td>
                      ${
                        row.isLowStock
                          ? `<span class="pill pill-coral">Low <span class="mono">(-${(row.target - row.count).toLocaleString()})</span></span>`
                          : row.target > 0
                            ? '<span class="pill pill-mint">Surplus</span>'
                            : '<span class="pill">Tracked</span>'
                      }
                    </td>
                    <td class="num-col">
                      <input
                        type="number"
                        min="0"
                        class="input-mono ed-vault-raw-input"
                        aria-label="${escapeAttr(row.name)} count"
                        data-vault-input="${escapeAttr(row.key)}"
                        value="${row.count}"
                        ${disabledAttr}
                      />
                    </td>
                    <td class="sync-col">
                      <span class="ed-saved-badge" aria-live="polite" data-saved-badge="${escapeAttr(row.key)}"></span>
                    </td>
                  </tr>`
                  )
                  .join('')
              : '<tr><td colspan="6" class="ed-empty-state">No materials match the current filter.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
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
    const tbody = container.querySelector('.ed-data-table tbody');
    tbody?.addEventListener('input', (e) => {
      const input = e.target.closest('[data-vault-input]');
      if (!input) return;
      const key = input.dataset.vaultInput;
      const newVal = Math.max(0, Number(input.value) || 0);
      const badge = container.querySelector(`[data-saved-badge="${CSS.escape(key)}"]`);
      if (badge) {
        badge.textContent = 'Saving…';
        badge.className = 'ed-saved-badge is-saving';
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
          const liveBadge = container.querySelector(`[data-saved-badge="${CSS.escape(key)}"]`);
          if (liveBadge) {
            liveBadge.textContent = 'Saved ✓';
            liveBadge.className = 'ed-saved-badge is-saved';
          }
        } catch (err) {
          const liveBadge = container.querySelector(`[data-saved-badge="${CSS.escape(key)}"]`);
          if (liveBadge) {
            liveBadge.textContent = 'Error';
            liveBadge.className = 'ed-saved-badge is-error';
          }
          console.error(err);
        }
      }, 600);
      debounceTimers.set(key, timer);
    });
  }
}
