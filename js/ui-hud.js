import { renderAssetIcon } from './assets.js?v=20261121p64';
import {
  ensureCharacterMaterials,
  ensureWeaponMaterials,
  getCharacterMeta,
  getDomainScheduleForDay,
  getMaterialMeta,
  getWeaponMeta,
  normalizeAssetKey
} from './catalog.js?v=20261121p64';
import {
  calcCoinPurse,
  calcEffectiveHerosWit,
  calcResinAllocationSummary,
  calcSpareReserves,
  calcTargetReadinessPct,
  calcTargetTelemetry,
  calcWishGoalProjection,
  calculatePrioritySharedPool,
  calculateWaterfallPrefarm,
  DEFAULT_WISH_GOAL,
  getServerResetInfo,
  sortAndLabelPrefarmQueue
} from './calculations.js?v=20261125p68';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
let focusedTargetId = null;

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatCompact(n) {
  const abs = Math.abs(Number(n) || 0);
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (abs >= 10_000) return `${(abs / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return Math.round(abs).toLocaleString();
}

export function renderHudTab(container, state, handlers) {
  const { account, isReadOnly } = state;
  const wallet = account.wallet || {};
  const disabledAttr = isReadOnly ? 'disabled' : '';
  const serverInfo = getServerResetInfo(state.serverId || 'NA');
  const todayName = state.hudDayOverride || serverInfo.inGameDay || WEEKDAYS[new Date().getDay()];
  const domainsToday = getDomainScheduleForDay(todayName);

  const labeledQueue = sortAndLabelPrefarmQueue(account.prefarmQueue || []);
  const needMatKeys = [];
  for (const t of labeledQueue) {
    if (t.characterKey) needMatKeys.push(ensureCharacterMaterials(t.characterKey));
    if (t.weaponKey) needMatKeys.push(ensureWeaponMaterials(t.weaponKey));
  }
  if (needMatKeys.length) {
    Promise.all(needMatKeys).then((res) => {
      if (res.some(Boolean)) handlers.onRefreshView?.();
    });
  }

  const waterfall = calculateWaterfallPrefarm(labeledQueue, account.inventory || {}, wallet);
  const sharedPool = calculatePrioritySharedPool(labeledQueue, account.inventory || {}, wallet, todayName);
  const spares = calcSpareReserves(account, sharedPool);
  const wits = calcEffectiveHerosWit(account.inventory || {});
  const purse = calcCoinPurse(wallet);
  const wishGoal = { ...DEFAULT_WISH_GOAL, ...(wallet.wishGoal || {}) };
  const wishProj = calcWishGoalProjection(wallet, wishGoal);
  const resinSummary = calcResinAllocationSummary(sharedPool);

  const targetsWithTel = labeledQueue.map((t, idx) => ({
    ...t,
    colorClass: `c${idx % 4}`,
    readiness: calcTargetReadinessPct(waterfall.get(t.id) || []),
    telemetry: calcTargetTelemetry(t, sharedPool, state.serverId || 'NA')
  }));

  if (focusedTargetId && !targetsWithTel.some((t) => t.id === focusedTargetId)) {
    focusedTargetId = null;
  }

  // Resin dial math
  const curResin = Math.max(0, Math.min(200, Number(wallet.resin ?? 160)));
  const curCondensed = Math.max(0, Math.min(5, Number(wallet.condensedResin ?? 0)));
  const resinPct = Math.round((curResin / 200) * 100);
  const dialR = 26;
  const dialCirc = 2 * Math.PI * dialR;
  const dialOffset = dialCirc * (1 - curResin / 200);
  const missingResin = Math.max(0, 200 - curResin);
  const minsToFull = missingResin * 8;
  const fullH = Math.floor(minsToFull / 60);
  const fullM = minsToFull % 60;
  const regenText = missingResin === 0 ? 'Capped' : `Full in ${fullH}h ${String(fullM).padStart(2, '0')}m`;

  // Bottleneck items (exclude universal currencies Mora & Hero's Wit already shown in top ledger)
  const allPoolItems = Array.isArray(sharedPool) ? sharedPool : [];
  const visibleItems = allPoolItems.filter((item) => {
    if (item.kind === 'mora' || item.kind === 'exp') return false;
    if (focusedTargetId) {
      return (item.alloc?.targets || []).some((con) => con.characterKey === focusedTargetId || con.targetId === focusedTargetId);
    }
    return item.deficit > 0;
  });
  const topActionItems = visibleItems.slice(0, 5);
  const hiddenActionItems = visibleItems.slice(5);

  // World bosses for active targets
  const bossRows = [];
  const seenBosses = new Set();
  for (const t of labeledQueue) {
    const cm = getCharacterMeta(t.characterKey);
    const bm = cm?.bossMat ? getMaterialMeta(cm.bossMat) : null;
    if (bm?.bossName && !seenBosses.has(bm.bossName)) {
      seenBosses.add(bm.bossName);
      bossRows.push({ t, cm, bm });
    }
  }

  // Enrich today's domains
  const enrichedDomains = domainsToday
    .map((dom) => {
      const rewardNorms = new Set((dom.rewards || []).map((r) => normalizeAssetKey(r.key)));
      const rewardNames = new Set((dom.rewards || []).map((r) => r.name));
      const matches = [];
      if (dom.domainType === 'Talent') {
        for (const t of labeledQueue) {
          const meta = getCharacterMeta(t.characterKey);
          if (rewardNorms.has(meta.domainMatKey) || rewardNames.has(meta.talentBook)) {
            matches.push({ kind: 'characters', key: t.characterKey, name: meta.name, badge: t.tierLabel });
          }
        }
      } else if (dom.domainType === 'Weapon') {
        for (const t of labeledQueue.filter((x) => x.weaponKey)) {
          const wm = getWeaponMeta(t.weaponKey);
          if (rewardNorms.has(wm.domainMatKey)) {
            matches.push({ kind: 'weapons', key: t.weaponKey, name: wm.name, badge: t.tierLabel });
          }
        }
      }
      return { ...dom, matches };
    })
    .filter((d) => state.hudShowAllDomains || d.matches.length > 0);

  container.innerHTML = `
    <div class="hud-plate">
      <!-- Top 3-Column Scarcity & Coin Purse Ledger -->
      <section class="hud-ledger-strip" aria-label="Spare Resources & Coin Purse">
        <div class="hud-ledger-col">
          <span class="hsr-strip-label">Spare Mora</span>
          <div class="hud-ledger-main">
            ${renderAssetIcon('materials', 'Mora', 'Mora', 'icon-sm')}
            <div style="flex:1;min-width:0;">
              <div class="hud-kpi-hero ${spares.isMoraBroke ? 'text-coral' : 'text-mint'}">
                ${spares.spareMora >= 0 ? `+${formatCompact(spares.spareMora)} Spare` : `-${formatCompact(spares.spareMora)} Short`}
              </div>
              <div class="muted mono ui-micro">${formatCompact(spares.bagMora)} in Bag · ${formatCompact(spares.committedMora)} Committed</div>
            </div>
          </div>
          ${!isReadOnly
      ? `<details class="hud-edit-details">
                   <summary class="mono">Edit Mora Balance ▾</summary>
                   <label class="hud-inline-input">
                     <span class="muted mono">Bag Mora</span>
                     <input type="number" min="0" step="1000" class="input-mono" data-wallet-field="mora" value="${Number(wallet.mora ?? 0)}" />
                   </label>
                 </details>`
      : ''
    }
        </div>

        <div class="hud-ledger-col">
          <div class="hsr-strip-label-row">
            <span class="hsr-strip-label">Spare Hero's Wit</span>
            <button type="button" class="hsr-link-btn" data-goto-vault>Open Vault →</button>
          </div>
          <div class="hud-ledger-main">
            ${renderAssetIcon('materials', 'HerosWit', "Hero's Wit", 'icon-sm')}
            <div>
              <div class="hud-kpi-hero ${spares.isWitsBroke ? 'text-coral' : 'text-mint'}">
                ${spares.spareWits >= 0 ? `+${Math.round(spares.spareWits).toLocaleString()} Eq.` : `${Math.round(spares.spareWits).toLocaleString()} Eq.`}
              </div>
              <div class="muted mono ui-micro">${wits.effectiveTotal.toLocaleString()} Eq. (${wits.wits4} 4★ / ${wits.exp3} 3★ / ${wits.adv2} 2★)</div>
            </div>
          </div>
        </div>

        <div class="hud-ledger-col">
          <span class="hsr-strip-label">Coin Purse &amp; Wish Stash</span>
          <div class="hud-ledger-main">
            ${renderAssetIcon('materials', 'Primogem', 'Primogem', 'icon-sm')}
            <div>
              <div class="hud-kpi-hero text-gold">${purse.limitedPulls.toLocaleString()} Pulls</div>
              <div class="muted mono ui-micro">${wishProj.projectedTotalPulls} projected by ${escapeHtml(wishGoal.label || 'Target')} (${wishProj.daysRemaining}d)</div>
            </div>
          </div>
          ${!isReadOnly
      ? `<details class="hud-edit-details">
                   <summary class="mono">Edit Wish Reserves ▾</summary>
                   <div class="hud-purse-grid mono" style="margin-top:8px;">
                     <label class="mini-field"><span>Primos</span><input type="number" min="0" class="input-mono" data-wallet-field="primogems" value="${purse.primogems}" /></label>
                     <label class="mini-field"><span>Limited</span><input type="number" min="0" class="input-mono" data-wallet-field="intertwinedFates" value="${purse.intertwinedFates}" /></label>
                     <label class="mini-field"><span>Acquaint</span><input type="number" min="0" class="input-mono" data-wallet-field="acquaintFates" value="${purse.acquaintFates}" /></label>
                     <label class="mini-field"><span>Pity</span><input type="number" min="0" max="89" class="input-mono" data-wallet-field="charPity" value="${Number(wallet.charPity ?? 0)}" /></label>
                   </div>
                 </details>`
      : ''
    }
        </div>
      </section>

      <!-- 2-Column Editorial Command Body -->
      <div class="hud-editorial-grid">
        <!-- Left 1fr: Shared Bottleneck Matrix + Checklist -->
        <div class="hud-main-col">
          <section class="hud-section">
            <div class="hud-section-head">
              <div>
                <span class="hsr-strip-label">01 · Shared Bottleneck Matrix</span>
                <div class="muted mono ui-micro" style="margin-top:2px;">
                  Day: <strong class="text-cyan">${escapeHtml(todayName)}</strong> · Resets in ${escapeHtml(serverInfo.countdownText || '--h --m')}
                </div>
              </div>
              ${focusedTargetId ? '<button type="button" class="btn btn-ghost btn-xs mono" data-clear-focus>Show All Targets</button>' : ''}
            </div>

            ${targetsWithTel.length
      ? `<div class="cmd-intent-row" style="margin:12px 0;">
                    ${targetsWithTel
        .map((t) => {
          const meta = getCharacterMeta(t.characterKey);
          const isFocused = focusedTargetId === t.id;
          const r = 20;
          const circ = 2 * Math.PI * r;
          const off = circ * (1 - (t.readiness || 0) / 100);
          const elemAttr = escapeHtml(String(meta.element || 'geo').toLowerCase());
          return `
                          <button type="button" class="cmd-intent-pill ${t.colorClass} ${isFocused ? 'is-focused' : ''}" data-element="${elemAttr}" data-focus-target="${escapeHtml(t.characterKey)}">
                            <div class="cmd-ring-wrap">
                              <svg class="cmd-ring-svg ${t.colorClass}" viewBox="0 0 48 48" aria-hidden="true">
                                <circle class="cmd-ring-bg" cx="24" cy="24" r="${r}" />
                                <circle class="cmd-ring-fg" cx="24" cy="24" r="${r}" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" />
                              </svg>
                              ${renderAssetIcon('characters', t.characterKey, meta.name, 'icon-xs')}
                            </div>
                            <div style="min-width:0;flex:1;">
                              <div style="display:flex;justify-content:space-between;gap:6px;align-items:center;">
                                <strong>${escapeHtml(meta.name)}</strong>
                                <span class="mono ui-micro" style="color:var(--accent-gold);">${escapeHtml(t.tierLabel)}</span>
                              </div>
                              <div class="muted mono ui-micro">${t.readiness}% Ready · ${escapeHtml(t.telemetry.etaLabel)}</div>
                            </div>
                          </button>`;
        })
        .join('')}
                  </div>`
      : `<div class="muted mono" style="padding:14px;border:1px solid var(--border-subtle);background:var(--bg-surface);margin:12px 0;">No active build targets in Prefarm Queue.</div>`
    }

            <div class="hud-bottleneck-list">
              ${topActionItems.length
      ? topActionItems
        .map((item) => {
          const pct = item.neededTotal > 0 ? Math.min(100, Math.round((item.owned / item.neededTotal) * 100)) : 100;
          return `
                          <div class="hud-bottleneck-row">
                            <div class="hud-bn-left">
                              ${renderAssetIcon('materials', item.key, item.name, 'icon-xs')}
                              <div>
                                <div style="font-size:13px;font-weight:600;">${escapeHtml(item.name)}</div>
                                <div class="muted mono ui-micro">${item.owned.toLocaleString()} / ${item.neededTotal.toLocaleString()} · ${(item.alloc?.targets || item.consumers || []).map((c) => c.characterName || getCharacterMeta(c.characterKey).name).join(', ')}</div>
                              </div>
                            </div>
                            <div class="hud-bn-right mono">
                              <div class="hud-bn-bar"><span style="width:${pct}%;"></span></div>
                              <span class="${item.deficit > 0 ? 'text-coral' : 'text-mint'} ui-micro">${item.deficit > 0 ? `-${item.deficit.toLocaleString()}` : 'Ready'}</span>
                            </div>
                          </div>`;
        })
        .join('')
      : '<div class="muted mono" style="font-size:12px;padding:10px 0;">All tracked target materials are satisfied.</div>'
    }
            </div>

            ${hiddenActionItems.length
      ? `<details style="margin-top:8px;">
                     <summary class="muted mono ui-micro" style="cursor:pointer;">Other Bottlenecks (${hiddenActionItems.length}) ▾</summary>
                     <div class="hud-bottleneck-list" style="margin-top:8px;">
                       ${hiddenActionItems
        .map(
          (item) => `
                         <div class="hud-bottleneck-row">
                           <div class="hud-bn-left">${renderAssetIcon('materials', item.key, item.name, 'icon-xs')}<span>${escapeHtml(item.name)}</span></div>
                           <span class="mono text-coral ui-micro">${item.owned.toLocaleString()} / ${item.neededTotal.toLocaleString()}</span>
                         </div>`
        )
        .join('')}
                     </div>
                   </details>`
      : ''
    }

            ${resinSummary.totalResin > 0
      ? `<div style="margin-top:14px;">
                     <div class="muted mono ui-micro" style="margin-bottom:6px;">Resin Allocation (${resinSummary.totalResin.toLocaleString()} total)</div>
                     <div class="hud-alloc-bar">
                       ${resinSummary.buckets.map((b) => `<div style="width:${b.pct}%;background:${b.colorVar};" title="${escapeHtml(b.label)}: ${b.resin.toLocaleString()} Resin (${b.pct}%)"></div>`).join('')}
                     </div>
                     <div class="hud-alloc-legend">
                       ${resinSummary.buckets
                         .filter((b) => b.resin > 0)
                         .map(
                           (b) =>
                             `<span class="hud-alloc-item"><span class="hud-alloc-swatch" style="background:${b.colorVar};"></span><span>${escapeHtml(b.label)}</span> <strong class="mono">${b.pct}%</strong></span>`
                         )
                         .join('')}
                     </div>
                   </div>`
      : ''
    }
          </section>

          <section class="hud-section">
            <div class="hsr-strip-label-row" style="margin-bottom:10px;">
              <span class="hsr-strip-label">02 · Daily &amp; Weekly Operations</span>
            </div>
            <div class="hud-checklist-grid">
              <div>
                <div class="muted mono ui-micro" style="margin-bottom:6px;">Daily Routine</div>
                <div class="hud-check-list">
                  ${(account.checklist?.daily || [])
      .map(
        (item) => `<label class="hud-check-item ${item.done ? 'is-done' : ''}"><input type="checkbox" data-check-group="daily" data-check-id="${escapeHtml(item.id)}" ${item.done ? 'checked' : ''} ${disabledAttr} /><span>${escapeHtml(item.label)}</span></label>`
      )
      .join('')}
                </div>
              </div>
              <div>
                <div class="muted mono ui-micro" style="margin-bottom:6px;">Weekly &amp; Endgame</div>
                <div class="hud-check-list">
                  ${(account.checklist?.weekly || [])
      .map(
        (item) => `<label class="hud-check-item ${item.done ? 'is-done' : ''}"><input type="checkbox" data-check-group="weekly" data-check-id="${escapeHtml(item.id)}" ${item.done ? 'checked' : ''} ${disabledAttr} /><span>${escapeHtml(item.label)}</span></label>`
      )
      .join('')}
                </div>
              </div>
            </div>
          </section>
        </div>

        <!-- Right 400px: Resin & Open Today Domains -->
        <aside class="hud-side-col">
          <section class="hud-section">
            <div class="hsr-strip-label-row" style="margin-bottom:10px;">
              <span class="hsr-strip-label">Resin &amp; Condensed</span>
              <span class="resin-regen-pill mono ${missingResin === 0 ? 'is-capped' : ''}">${regenText}</span>
            </div>
            <div class="resin-gizmo">
              <div class="resin-dial-wrap">
                <svg class="resin-dial-svg" viewBox="0 0 64 64" aria-hidden="true">
                  <circle class="resin-dial-bg" cx="32" cy="32" r="${dialR}" />
                  <circle class="resin-dial-fg ${resinPct >= 90 ? 'is-high' : ''}" cx="32" cy="32" r="${dialR}" stroke-dasharray="${dialCirc.toFixed(2)}" stroke-dashoffset="${dialOffset.toFixed(2)}" />
                </svg>
                <div class="mono" style="font-size:15px;font-weight:700;">${curResin}</div>
              </div>
              <div style="flex:1;min-width:190px;display:flex;flex-direction:column;gap:8px;">
                <div class="resin-gizmo-inputs">
                  <label class="mini-field"><span>Resin</span><input type="number" min="0" max="200" style="width:72px;" class="input-mono" data-wallet-field="resin" value="${curResin}" ${disabledAttr} /></label>
                  <label class="mini-field"><span>Condensed</span><input type="number" min="0" max="5" style="width:72px;" class="input-mono" data-wallet-field="condensedResin" value="${curCondensed}" ${disabledAttr} /></label>
                </div>
                ${!isReadOnly
      ? `<div class="resin-gizmo-actions">
                         <button type="button" class="btn btn-ghost btn-xs mono" data-resin-spend="20" ${curResin < 20 ? 'disabled' : ''}>-20</button>
                         <button type="button" class="btn btn-ghost btn-xs mono" data-resin-spend="40" ${curResin < 40 ? 'disabled' : ''}>-40</button>
                         <button type="button" class="btn btn-outline btn-xs mono" data-resin-condense ${curResin < 40 || curCondensed >= 5 ? 'disabled' : ''}>Condense</button>
                       </div>`
      : ''
    }
              </div>
            </div>
          </section>

          <section class="hud-section">
            <div class="hud-section-head" style="margin-bottom:10px;">
              <span class="hsr-strip-label">${escapeHtml(todayName)} Domains</span>
              <div style="display:flex;gap:6px;">
                <button type="button" class="filter-pill ${state.hudShowAllDomains ? 'active' : ''}" data-hud-all-domains>${state.hudShowAllDomains ? 'Relevant' : `All (${domainsToday.length})`}</button>
                <select class="select-sm mono" data-hud-day aria-label="Domain Weekday">
                  ${WEEKDAYS.map((d) => `<option value="${d}" ${d === todayName ? 'selected' : ''}>${d.slice(0, 3)}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="hud-domain-list">
              ${enrichedDomains.length
      ? enrichedDomains
        .map(
          (dom) => `
                      <div class="hud-domain-row ${dom.matches.length ? 'is-priority' : ''}">
                        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                          <strong style="font-size:13px;">${escapeHtml(dom.name)}</strong>
                          <span class="pill ${dom.matches.length ? 'pill-gold' : 'pill-muted'} mono">${escapeHtml(dom.domainType)}</span>
                        </div>
                        <div class="muted mono ui-micro" style="margin-top:4px;">${(dom.rewards || []).map((r) => escapeHtml(r.name)).join(' · ')}</div>
                        ${
                          dom.matches.length
                            ? `<div class="hud-dom-matches">${dom.matches.map((m) => `<span class="hud-dom-match-chip"><span class="mono text-gold">${escapeHtml(m.badge)}</span> ${escapeHtml(m.name)}</span>`).join('')}</div>`
                            : ''
                        }
                      </div>`
        )
        .join('')
      : '<div class="muted mono" style="font-size:12px;">No priority domains open for current queue today.</div>'
    }
            </div>

            ${bossRows.length
      ? `<div style="margin-top:16px;">
                     <div class="muted mono ui-micro" style="margin-bottom:6px;">World Bosses (${bossRows.length})</div>
                     <div class="hud-domain-list">
                       ${bossRows
        .map(
          ({ t, cm, bm }) => `
                         <div class="hud-domain-row" style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                           <span style="font-size:12.5px;font-weight:600;">${escapeHtml(bm.bossName)}</span>
                           <span class="pill mono">${escapeHtml(t.tierLabel)} ${escapeHtml(cm.name)}</span>
                         </div>`
        )
        .join('')}
                     </div>
                   </div>`
      : ''
    }
          </section>
        </aside>
      </div>
    </div>`;

  // Event Wiring
  container.querySelector('[data-goto-vault]')?.addEventListener('click', () => handlers.onNavigateTab('vault'));
  container.querySelector('[data-hud-day]')?.addEventListener('change', (e) => handlers.onChangeHudDay(e.target.value));
  container.querySelector('[data-hud-all-domains]')?.addEventListener('click', () => handlers.onToggleAllDomains());
  container.querySelector('[data-clear-focus]')?.addEventListener('click', () => { focusedTargetId = null; renderHudTab(container, state, handlers); });
  container.querySelectorAll('[data-focus-target]').forEach((btn) => {
    btn.addEventListener('click', () => {
      focusedTargetId = focusedTargetId === btn.dataset.focusTarget ? null : btn.dataset.focusTarget;
      renderHudTab(container, state, handlers);
    });
  });

  if (!isReadOnly) {
    container.querySelectorAll('[data-wallet-field]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const val = Math.max(0, Number(inp.value) || 0);
        handlers.onUpdateWallet(inp.dataset.walletField, val);
      });
    });
    container.querySelectorAll('[data-resin-spend]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cost = Number(btn.dataset.resinSpend) || 20;
        const cur = Math.max(0, Number(wallet.resin ?? 160));
        handlers.onUpdateWallet('resin', Math.max(0, cur - cost));
      });
    });
    container.querySelector('[data-resin-condense]')?.addEventListener('click', () => {
      const curR = Math.max(0, Number(wallet.resin ?? 160));
      const curC = Math.max(0, Number(wallet.condensedResin ?? 0));
      if (curR < 40 || curC >= 5) return;
      handlers.onUpdateWalletPatch?.({ resin: curR - 40, condensedResin: curC + 1 }, 'Condensed 1 Resin (+1)');
    });
    container.querySelectorAll('[data-check-group]').forEach((cb) => {
      cb.addEventListener('change', () => handlers.onToggleChecklist(cb.dataset.checkGroup, cb.dataset.checkId, cb.checked));
    });
  }
}
