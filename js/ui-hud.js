import { renderAssetIcon } from './assets.js';
import { getCharacterMeta, getDomainScheduleForDay, getMaterialMeta } from './catalog.js';
import {
  calcCoinPurse,
  calcCompletionGauges,
  calcEffectiveHerosWit,
  calculatePrioritySharedPool
} from './calculations.js';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function renderHudTab(container, state, handlers) {
  const { account, isReadOnly } = state;
  const wallet = account.wallet || {};
  const purse = calcCoinPurse(wallet);
  const wits = calcEffectiveHerosWit(account.inventory);
  const gauges = calcCompletionGauges(account);
  const sharedPool = calculatePrioritySharedPool(account.prefarmQueue || [], account.inventory || {});

  const todayName = state.hudDayOverride || WEEKDAYS[new Date().getDay()];
  const domainsToday = getDomainScheduleForDay(todayName);

  const topTwo = [...(account.prefarmQueue || [])].sort((a, b) => a.rank - b.rank).slice(0, 2);
  const topBookBases = new Set(topTwo.map((t) => getCharacterMeta(t.characterKey).talentBook).filter(Boolean));

  const disabledAttr = isReadOnly ? 'disabled' : '';

  container.innerHTML = `
    <div class="section-header">
      <div>
        <div class="eyebrow">GENSHIN SHEET (FINAL) / CENTRAL HUD</div>
        <h1 class="section-title">Command &amp; Resource Telemetry</h1>
      </div>
      <div class="header-meta mono">
        ACTIVE: <span class="text-gold">${account.displayName.toUpperCase()}</span>
        ${isReadOnly ? '<span class="pill pill-coral">READ-ONLY PARTNER</span>' : '<span class="pill pill-mint">LIVE EDIT</span>'}
      </div>
    </div>

    <div class="hud-kpi-grid">
      <!-- Coin Purse -->
      <article class="card">
        <div class="card-eyebrow">COIN PURSE / WISH RESERVES</div>
        <div class="kpi-hero mono text-gold">${purse.totalPulls.toLocaleString()} <span class="kpi-unit">PULLS</span></div>
        <div class="kpi-sub">${purse.limitedPulls.toLocaleString()} Limited (${purse.primoPulls} Primo + ${purse.intertwinedFates} Pink) • ${purse.acquaintFates} Blue</div>
        <div class="kpi-sub muted">Primos &amp; Acquaint Fates are manual (not in Irminsul exports)</div>
        <div class="inline-edit-grid">
          <label class="mini-field">
            <span>PRIMOS</span>
            <input type="number" min="0" class="input-mono" data-wallet-field="primogems" value="${purse.primogems}" ${disabledAttr} />
          </label>
          <label class="mini-field">
            <span>INTERTWINED</span>
            <input type="number" min="0" class="input-mono" data-wallet-field="intertwinedFates" value="${purse.intertwinedFates}" ${disabledAttr} />
          </label>
          <label class="mini-field">
            <span>ACQUAINT</span>
            <input type="number" min="0" class="input-mono" data-wallet-field="acquaintFates" value="${purse.acquaintFates}" ${disabledAttr} />
          </label>
        </div>
      </article>

      <!-- Mora -->
      <article class="card">
        <div class="card-eyebrow">TREASURY / MORA</div>
        <div class="kpi-hero-row">
          ${renderAssetIcon('materials', 'Mora', 'Mora', 'icon-md')}
          <div class="kpi-hero mono">${Number(wallet.mora ?? 0).toLocaleString()}</div>
        </div>
        <div class="kpi-sub">Manual entry — Irminsul GOOD v3 omits Mora, Primos &amp; Resin</div>
        <div class="inline-edit-grid single">
          <label class="mini-field">
            <span>MORA BALANCE</span>
            <input type="number" min="0" step="1000" class="input-mono" data-wallet-field="mora" value="${Number(wallet.mora ?? 0)}" ${disabledAttr} />
          </label>
        </div>
      </article>

      <!-- Effective Hero's Wit -->
      <article class="card">
        <div class="card-eyebrow">EXP RESERVES / EFFECTIVE HERO'S WIT</div>
        <div class="kpi-hero-row">
          ${renderAssetIcon('materials', 'HerosWit', "Hero's Wit", 'icon-md')}
          <div class="kpi-hero mono text-mint">${wits.effectiveTotal.toLocaleString()} <span class="kpi-unit">EQ.</span></div>
        </div>
        <div class="kpi-sub mono">4★ ${wits.wits4} + 0.25×3★ ${wits.exp3} + 0.05×2★ ${wits.adv2}</div>
        <div class="formula-note">Formula: 4★ + 0.25×3★ + 0.05×2★ • Lv.1→90 ≈ 419 | Lv.1→95 ≈ 565</div>
      </article>

      <!-- Account Completion Gauges -->
      <article class="card">
        <div class="card-eyebrow">ACCOUNT COMPLETION GAUGES</div>
        <div class="gauge-block">
          <div class="gauge-label-row">
            <span>Characters Built / Owned</span>
            <span class="mono text-gold">${gauges.builtChars} / ${gauges.ownedChars} (${gauges.charPct}%)</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill gold" style="width:${gauges.charPct}%"></div>
          </div>
        </div>
        <div class="gauge-block">
          <div class="gauge-label-row">
            <span>Weapons Lv.90 / Owned</span>
            <span class="mono text-mint">${gauges.maxWeapons} / ${gauges.ownedWeapons} (${gauges.weaponPct}%)</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill mint" style="width:${gauges.weaponPct}%"></div>
          </div>
        </div>
      </article>
    </div>

    <div class="hud-main-grid">
      <!-- Priority Prefarm Allocator (#1 & #2) -->
      <article class="card">
        <div class="card-header-row">
          <div>
            <div class="card-eyebrow">PRIORITY PREFARM ALLOCATOR / #1 + #2 SHARED POOL</div>
            <h2 class="card-title">Shared Resource Pool</h2>
          </div>
          <div class="priority-badges">
            ${topTwo.length
              ? topTwo
                  .map((t) => {
                    const m = getCharacterMeta(t.characterKey);
                    return `<span class="pill pill-gold mono">#${t.rank} ${m.name} (Lv.${t.targetLevel})</span>`;
                  })
                  .join('')
              : '<span class="pill">No Prefarm Targets</span>'}
          </div>
        </div>

        <div class="pool-list">
          ${sharedPool.length
            ? sharedPool
                .slice(0, 10)
                .map((item) => {
                  const isDeficit = item.deficit > 0;
                  return `
                  <div class="pool-row ${isDeficit ? 'row-deficit' : 'row-surplus'}">
                    <div class="pool-item-info">
                      ${renderAssetIcon('materials', item.key, item.name, 'icon-sm')}
                      <div>
                        <div class="item-name">${item.name}</div>
                        <div class="item-meta mono">${item.category} • Owned ${item.owned.toLocaleString()} / Need ${item.neededTotal.toLocaleString()}</div>
                      </div>
                    </div>
                    <div class="pool-delta mono ${isDeficit ? 'text-coral' : 'text-mint'}">
                      ${isDeficit ? `-${item.deficit.toLocaleString()} DEFICIT` : `+${item.surplus.toLocaleString()} SURPLUS`}
                    </div>
                  </div>`;
                })
                .join('')
            : '<div class="empty-state">Add targets in Prefarm Planner to compute the #1/#2 shared pool.</div>'}
        </div>
      </article>

      <!-- Today's Domain & Resin Router -->
      <article class="card">
        <div class="card-header-row">
          <div>
            <div class="card-eyebrow">TODAY'S DOMAIN &amp; RESIN ROUTER</div>
            <h2 class="card-title">${todayName} Schedule</h2>
          </div>
          <select class="select-sm mono" data-hud-day>
            ${WEEKDAYS.map((d) => `<option value="${d}" ${d === todayName ? 'selected' : ''}>${d}</option>`).join('')}
          </select>
        </div>

        <div class="resin-bar">
          <div class="resin-stat">
            <span class="mono label">ORIGINAL RESIN</span>
            <input type="number" min="0" max="200" class="input-mono sm" data-wallet-field="resin" value="${Number(wallet.resin ?? 160)}" ${disabledAttr} />
            <span class="mono muted">/ 200</span>
          </div>
          <div class="resin-stat">
            <span class="mono label">CONDENSED</span>
            <input type="number" min="0" max="5" class="input-mono sm" data-wallet-field="condensedResin" value="${Number(wallet.condensedResin ?? 0)}" ${disabledAttr} />
            <span class="mono muted">/ 5</span>
          </div>
        </div>

        <div class="domain-list">
          ${domainsToday.length
            ? domainsToday
                .map((dom) => {
                  const matchesPriority = (dom.rewards || []).some((r) => topBookBases.has(r.name));
                  return `
                  <div class="domain-card ${matchesPriority ? 'domain-highlight' : ''}">
                    <div class="domain-top">
                      <span class="domain-name">${dom.name}</span>
                      <span class="pill ${matchesPriority ? 'pill-gold' : ''}">${dom.region} • ${dom.domainType}</span>
                    </div>
                    <div class="domain-rewards">
                      ${(dom.rewards || [])
                        .map(
                          (r) => `<span class="reward-chip">${renderAssetIcon('materials', r.key, r.name, 'icon-xs')} ${r.name}</span>`
                        )
                        .join('')}
                    </div>
                  </div>`;
                })
                .join('')
            : '<div class="empty-state">No scheduled domains found for this day.</div>'}
        </div>
      </article>
    </div>

    <!-- Daily & Weekly Checklist -->
    <article class="card checklist-card">
      <div class="card-header-row">
        <div>
          <div class="card-eyebrow">OPERATIONS / DAILY &amp; WEEKLY CHECKLIST</div>
          <h2 class="card-title">Daily Commissions &amp; Weekly Snezhnaya Tasks</h2>
        </div>
      </div>
      <div class="checklist-columns">
        <div>
          <h3 class="subhead mono">DAILY ROUTINE</h3>
          <div class="check-list">
            ${(account.checklist?.daily || [])
              .map(
                (item) => `
                <label class="check-item ${item.done ? 'is-done' : ''}">
                  <input type="checkbox" data-check-group="daily" data-check-id="${item.id}" ${item.done ? 'checked' : ''} ${disabledAttr} />
                  <span>${item.label}</span>
                </label>`
              )
              .join('')}
          </div>
        </div>
        <div>
          <h3 class="subhead mono">WEEKLY &amp; SNEZHNAYA TASKS</h3>
          <div class="check-list">
            ${(account.checklist?.weekly || [])
              .map(
                (item) => `
                <label class="check-item ${item.done ? 'is-done' : ''}">
                  <input type="checkbox" data-check-group="weekly" data-check-id="${item.id}" ${item.done ? 'checked' : ''} ${disabledAttr} />
                  <span>${item.label}</span>
                  ${item.tag ? `<span class="pill pill-gold mono">${item.tag}</span>` : ''}
                </label>`
              )
              .join('')}
          </div>
        </div>
      </div>
    </article>
  `;

  // Bind HUD events
  container.querySelector('[data-hud-day]')?.addEventListener('change', (e) => {
    handlers.onChangeHudDay(e.target.value);
  });

  if (!isReadOnly) {
    container.querySelectorAll('[data-wallet-field]').forEach((input) => {
      input.addEventListener('change', (e) => {
        handlers.onUpdateWallet(e.target.dataset.walletField, Number(e.target.value) || 0);
      });
    });

    container.querySelectorAll('[data-check-group]').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        handlers.onToggleChecklist(e.target.dataset.checkGroup, e.target.dataset.checkId, e.target.checked);
      });
    });
  }
}
