import { renderAssetIcon } from './assets.js';
import {
  ensureCharacterMaterials,
  ensureWeaponMaterials,
  getCharacterMeta,
  getDomainScheduleForDay,
  getMaterialMeta,
  getWeaponMeta,
  normalizeAssetKey
} from './catalog.js?v=20261114e';
import {
  calcCoinPurse,
  calcEffectiveHerosWit,
  calcResinAllocationSummary,
  calcSpareReserves,
  calcTargetReadinessPct,
  calcTargetTelemetry,
  calculatePrioritySharedPool,
  calculateWaterfallPrefarm,
  getServerResetInfo,
  sortAndLabelPrefarmQueue
} from './calculations.js?v=20261113t';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const PIP_DAYS = [
  { day: 'Monday', letter: 'M' },
  { day: 'Tuesday', letter: 'T' },
  { day: 'Wednesday', letter: 'W' },
  { day: 'Thursday', letter: 'T' },
  { day: 'Friday', letter: 'F' },
  { day: 'Saturday', letter: 'S' },
  { day: 'Sunday', letter: 'S' }
];

function formatCompactSurplus(n) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (abs >= 10_000) return `${(abs / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return Math.round(abs).toLocaleString();
}

function formatCompactNum(n) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (abs >= 100_000) return `${(abs / 1_000).toFixed(0)}K`;
  return Math.round(n).toLocaleString();
}

function getSourceBadgeHtml(item, todayName) {
  if (item.bossUnreleased) {
    return '<span class="pill pill-coral mono">Unreleased 7.2</span>';
  }
  if (item.scheduleDays?.length) {
    const farmSet = new Set(item.scheduleDays);
    return `<div class="cmd-day-pips" title="Domain days: ${item.scheduleDays.join(', ')}">
      ${PIP_DAYS.map(
        ({ day, letter }) =>
          `<span class="cmd-day-pip mono ${farmSet.has(day) ? 'is-farmable' : ''} ${day === todayName ? 'is-today' : ''}">${letter}</span>`
      ).join('')}
    </div>`;
  }
  return `<span class="pill mono">${item.sourceLabel}</span>`;
}

export function renderHudTab(container, state, handlers) {
  const { account, isReadOnly } = state;
  const wallet = account.wallet || {};
  const purse = calcCoinPurse(wallet);
  const wits = calcEffectiveHerosWit(account.inventory);
  const resetInfo = getServerResetInfo(state.serverId || 'NA');
  const todayName = state.hudDayOverride || resetInfo.inGameDay;
  const domainsToday = getDomainScheduleForDay(todayName);
  const sharedPool = calculatePrioritySharedPool(account.prefarmQueue || [], account.inventory || {}, account.wallet, todayName);
  const waterfallMap = calculateWaterfallPrefarm(account.prefarmQueue || [], account.inventory || {}, account.wallet);
  const spares = calcSpareReserves(account, sharedPool);
  const resinSummary = calcResinAllocationSummary(sharedPool);

  const queueForHydration = account.prefarmQueue || [];
  const missingChars = queueForHydration.filter((t) => {
    const cm = getCharacterMeta(t.characterKey);
    return !cm._hydrated && (!cm.talentBook || !cm.bossMat);
  });
  const missingWeps = queueForHydration.filter((t) => {
    if (!t.weaponKey) return false;
    const wm = getWeaponMeta(t.weaponKey);
    return !wm._hydrated && !wm.domainMatKey;
  });
  if (missingChars.length || missingWeps.length) {
    Promise.all([
      ...missingChars.map((t) => ensureCharacterMaterials(t.characterKey)),
      ...missingWeps.map((t) => ensureWeaponMaterials(t.weaponKey))
    ]).then((results) => {
      if (results.some(Boolean)) renderHudTab(container, state, handlers);
    });
  }

  const labeledQueue = sortAndLabelPrefarmQueue(account.prefarmQueue || []);
  const activeTiers = [...new Set(labeledQueue.map((t) => t.tier))].slice(0, 2);
  const topTwo = labeledQueue.filter((t) => activeTiers.includes(t.tier));
  const topBookBases = new Set(topTwo.map((t) => getCharacterMeta(t.characterKey).talentBook).filter(Boolean));
  const disabledAttr = isReadOnly ? 'disabled' : '';

  const softPityRatio = (purse.limitedPulls / 90).toFixed(1);
  const guaranteePct = Math.min(100, Math.round((purse.limitedPulls / 180) * 100));

  const targetTelemetries = topTwo.map((t) => ({
    target: t,
    charMeta: getCharacterMeta(t.characterKey),
    telemetry: calcTargetTelemetry(t, sharedPool, state.serverId || 'NA')
  }));

  container.innerHTML = `
    <!-- Zone 1: Scarcity Strip -->
    <section class="scarcity-strip" aria-label="Spare Resources & Wish Stash">
      <!-- Tile 1: Spare Mora -->
      <div class="scarcity-tile-wrap">
        <button type="button" class="card scarcity-tile ${spares.isMoraBroke ? 'is-broke' : 'is-spare'}" data-popover-trigger="mora">
          <div class="scarcity-head">
            <span class="card-eyebrow">SPARE MORA</span>
            <span class="scarcity-edit-hint mono">${isReadOnly ? 'VIEW' : 'EDIT ▾'}</span>
          </div>
          <div class="scarcity-hero-row">
            ${renderAssetIcon('materials', 'Mora', 'Mora', 'icon-sm')}
            <div class="kpi-hero mono ${spares.isMoraBroke ? 'text-coral' : 'text-mint'}">
              ${spares.spareMora >= 0 ? `+${formatCompactSurplus(spares.spareMora)} SPARE` : `-${formatCompactSurplus(spares.spareMora)} SHORT`}
            </div>
          </div>
          <div class="kpi-sub mono">${formatCompactNum(spares.bagMora)} in Bag · ${formatCompactNum(spares.committedMora)} Committed</div>
        </button>

        <div class="glass-popover" id="popover-mora" hidden>
          <div class="popover-head">
            <span class="card-eyebrow">UPDATE MORA BALANCE</span>
            <button type="button" class="btn btn-ghost btn-xs" data-popover-close>✕</button>
          </div>
          <label class="mini-field">
            <span>MORA IN BAG</span>
            <input type="number" min="0" step="1000" class="input-mono" data-wallet-field="mora" value="${Number(wallet.mora ?? 0)}" ${disabledAttr} />
          </label>
        </div>
      </div>

      <!-- Tile 2: Spare Wits -->
      <div class="scarcity-tile-wrap">
        <button type="button" class="card scarcity-tile ${spares.isWitsBroke ? 'is-broke' : 'is-spare'}" data-popover-trigger="wits">
          <div class="scarcity-head">
            <span class="card-eyebrow">SPARE WITS</span>
            <span class="scarcity-edit-hint mono">BREAKDOWN ▾</span>
          </div>
          <div class="scarcity-hero-row">
            ${renderAssetIcon('materials', 'HerosWit', "Hero's Wit", 'icon-sm')}
            <div class="kpi-hero mono ${spares.isWitsBroke ? 'text-coral' : 'text-mint'}">
              ${spares.spareWits >= 0 ? `+${Math.round(spares.spareWits).toLocaleString()} EQ. SPARE` : `${Math.round(spares.spareWits).toLocaleString()} EQ. SHORT`}
            </div>
          </div>
          <div class="kpi-sub mono">${wits.effectiveTotal.toLocaleString()} Eq. in Bag (${wits.wits4} 4★ / ${wits.exp3} 3★ / ${wits.adv2} 2★)</div>
        </button>

        <div class="glass-popover" id="popover-wits" hidden>
          <div class="popover-head">
            <span class="card-eyebrow">EXP BOOK EQUIVALENCY</span>
            <button type="button" class="btn btn-ghost btn-xs" data-popover-close>✕</button>
          </div>
          <div class="popover-formula mono">1 Hero's Wit = 4× Adventurer's = 20× Wanderer's</div>
          <div class="popover-stat-grid mono">
            <span>4★ Hero's Wit: <strong>${wits.wits4}</strong></span>
            <span>3★ Adventurer's: <strong>${wits.exp3}</strong></span>
            <span>2★ Wanderer's: <strong>${wits.adv2}</strong></span>
            <span>Committed (#1/#2): <strong>${spares.committedWits}</strong></span>
          </div>
          <button type="button" class="btn btn-outline btn-xs full-width" data-goto-vault>Open Inventory Vault →</button>
        </div>
      </div>

      <!-- Tile 3: Wish Stash -->
      <div class="scarcity-tile-wrap">
        <button type="button" class="card scarcity-tile" data-popover-trigger="wishes">
          <div class="scarcity-head">
            <span class="card-eyebrow">WISH STASH</span>
            <span class="scarcity-edit-hint mono">${isReadOnly ? 'VIEW' : 'EDIT ▾'}</span>
          </div>
          <div class="scarcity-hero-row">
            ${renderAssetIcon('materials', 'Primogem', 'Primogem', 'icon-sm')}
            <div class="kpi-hero mono text-amber">${purse.totalPulls.toLocaleString()} <span class="kpi-unit">PULLS</span></div>
          </div>
          <div class="kpi-sub mono">${softPityRatio}× Soft Pity · ${guaranteePct}% to Guarantee (${purse.limitedPulls} Lim / ${purse.acquaintFates} Blue)</div>
        </button>

        <div class="glass-popover" id="popover-wishes" hidden>
          <div class="popover-head">
            <span class="card-eyebrow">EDIT WISH RESERVES</span>
            <button type="button" class="btn btn-ghost btn-xs" data-popover-close>✕</button>
          </div>
          <div class="inline-edit-grid">
            <label class="mini-field">
              <span>PRIMOS</span>
              <input type="number" min="0" class="input-mono" data-wallet-field="primogems" value="${purse.primogems}" ${disabledAttr} />
            </label>
            <label class="mini-field">
              <span>PINK</span>
              <input type="number" min="0" class="input-mono" data-wallet-field="intertwinedFates" value="${purse.intertwinedFates}" ${disabledAttr} />
            </label>
            <label class="mini-field">
              <span>BLUE</span>
              <input type="number" min="0" class="input-mono" data-wallet-field="acquaintFates" value="${purse.acquaintFates}" ${disabledAttr} />
            </label>
          </div>
        </div>
      </div>
    </section>

    <!-- Main Cockpit: 8-Col Farm Deck + 4-Col Live Ops -->
    <div class="hud-cockpit-grid">
      <!-- Zone 2: Priority Farm Deck (8 Cols) -->
      <article class="card cmd-deck-card">
        <div class="cmd-deck-header">
          <div>
            <div class="card-eyebrow">PRIORITY FARM DECK / #1 &amp; #2 QUEUE</div>
            <h2 class="card-title">Shared Bottleneck Matrix</h2>
          </div>
          <div class="cmd-reset-bar mono">
            <span class="cmd-reset-stat">DAY: <strong class="text-cyan">${todayName.toUpperCase()}</strong></span>
            <span class="cmd-reset-stat">RESETS: <strong id="hud-reset-countdown" class="text-mint">${resetInfo.countdownText}</strong></span>
            ${(() => {
              const farmTodayItems = sharedPool.filter((i) => i.deficit > 0 && i.isToday);
              if (!farmTodayItems.length) return '';
              return `<span class="cmd-today-icons" title="Bottlenecks farmable today">
                ${farmTodayItems
                  .map(
                    (i) => `<span class="cmd-today-tile rarity-frame-${i.rarity || 3}" data-char-keys="${(i.alloc?.targets || []).map((t) => t.characterKey).join(',')}" title="${i.name} (-${i.deficit.toLocaleString()} NET)">
                      ${renderAssetIcon('materials', i.key, i.name, 'icon-xs')}
                    </span>`
                  )
                  .join('')}
              </span>`;
            })()}
          </div>
        </div>

        ${
          targetTelemetries.length
            ? `<div class="cmd-intent-row">
                ${targetTelemetries
                  .map(({ target: t, charMeta: cm, telemetry: tel }, idx) => {
                    const pct = calcTargetReadinessPct(waterfallMap.get(t.id) || []);
                    const rankCls = `c${Math.min(idx, 3)}`;
                    const ringRadius = 24;
                    const ringCirc = 2 * Math.PI * ringRadius;
                    const ringOffset = ringCirc * (1 - pct / 100);
                    return `
                    <button type="button" class="cmd-intent-pill ${rankCls}" data-focus-char="${t.characterKey}" title="Hover to spotlight · Click to filter ${cm.name}'s materials">
                      <span class="cmd-rank-tag mono ${rankCls}">${t.tierLabel}</span>
                      <div class="cmd-ring-wrap">
                        <svg class="cmd-ring-svg ${rankCls}" viewBox="0 0 56 56" aria-hidden="true">
                          <circle class="cmd-ring-bg" cx="28" cy="28" r="${ringRadius}" />
                          <circle class="cmd-ring-fg" cx="28" cy="28" r="${ringRadius}" stroke-dasharray="${ringCirc.toFixed(2)}" stroke-dashoffset="${ringOffset.toFixed(2)}" />
                        </svg>
                        ${renderAssetIcon('characters', t.characterKey, cm.name, 'icon-ring-img')}
                      </div>
                      <div class="cmd-intent-body">
                        <div class="cmd-intent-top">
                          <span class="cmd-intent-name">${cm.name}</span>
                          <span class="cmd-intent-specs mono">Lv.${t.currentLevel}→${t.targetLevel} · ${t.targetTalent.auto}/${t.targetTalent.skill}/${t.targetTalent.burst}</span>
                        </div>
                        <div class="cmd-intent-meta mono">
                          <span class="cmd-intent-pct">${pct}% READY</span>
                          <span class="cmd-intent-days ${tel.resinDays === 0 && tel.weeklyWeeks === 0 ? 'is-done' : ''}">${tel.etaLabel}</span>
                        </div>
                      </div>
                    </button>`;
                  })
                  .join('')}
              </div>`
            : ''
        }

        ${(() => {
          if (!sharedPool.length) {
            return '<div class="empty-state">Add targets in Prefarm to populate the Farm Deck.</div>';
          }
          const pinnedKey = state.hudPinnedChar || null;
          const allActionItems = sharedPool.filter((i) => i.deficit > 0);
          const actionItems = pinnedKey
            ? allActionItems.filter((i) => (i.alloc?.targets || []).some((t) => t.characterKey === pinnedKey))
            : allActionItems;
          const hiddenActionItems = pinnedKey
            ? allActionItems.filter((i) => !(i.alloc?.targets || []).some((t) => t.characterKey === pinnedKey))
            : [];
          const surplusItems = sharedPool.filter((i) => i.deficit <= 0);

          const renderDeckCard = (item) => {
            const rarity = item.rarity || 3;
            const allocTargets = item.alloc?.targets || [];
            const lockedTarget = pinnedKey ? allocTargets.find((t) => t.characterKey === pinnedKey) : null;

            const pct = item.neededTotal > 0 ? Math.min(100, Math.round((item.owned / item.neededTotal) * 100)) : 100;
            const allocHtml = lockedTarget
              ? `<div class="cmd-alloc">
                  <div class="alloc-track tick-bar">
                    <div class="alloc-seg alloc-c${Math.min(lockedTarget.slotIndex ?? 0, 3)}" style="width:${lockedTarget.pct}%"></div>
                  </div>
                  <div class="alloc-labels mono">
                    <span class="alloc-lbl"><i class="alloc-dot c${Math.min(lockedTarget.slotIndex ?? 0, 3)}"></i>${lockedTarget.name}: <strong>${lockedTarget.pct}%</strong> · ${formatCompactNum(lockedTarget.funded)}/${formatCompactNum(lockedTarget.needed)}</span>
                  </div>
                </div>`
              : allocTargets.length
                ? `<div class="cmd-alloc">
                    <div class="alloc-track tick-bar">
                      ${allocTargets
                        .map((at) => `<div class="alloc-seg alloc-c${Math.min(at.slotIndex ?? 0, 3)}" style="width:${at.widthPct}%"></div>`)
                        .join('')}
                    </div>
                    <div class="alloc-labels mono">
                      ${allocTargets
                        .map(
                          (at) =>
                            `<span class="alloc-lbl"><i class="alloc-dot c${Math.min(at.slotIndex ?? 0, 3)}"></i>${at.labelPrefix || ''}${at.name} <strong>${at.pct}%</strong></span>`
                        )
                        .join('')}
                    </div>
                  </div>`
                : `<div class="cmd-single-track tick-bar"><div class="cmd-single-fill" style="width:${pct}%"></div></div>`;

            let detailTooltip = `${formatCompactNum(item.owned)} / ${formatCompactNum(item.neededTotal)}`;
            let expandableDetailsHtml = '';
            if (item.tiers) {
              detailTooltip = item.tiers.map((t) => `${getMaterialMeta(t.key).name}: ${t.owned}/${t.needed}`).join(' • ');
              expandableDetailsHtml = `
                <details class="cmd-card-details">
                  <summary class="mono">Tiers (${item.tiers.map((t) => `${t.owned}/${t.needed}`).join(' · ')})</summary>
                  <div class="cmd-item-tiles">
                    ${item.tiers
                      .map((t) => {
                        const rNum = t.label === 'T2' ? 2 : t.label === 'T3' ? 3 : t.label === 'T4' ? 4 : 5;
                        const matName = getMaterialMeta(t.key).name;
                        return `<div class="cmd-item-tile rarity-bg-${rNum} ${t.netDeficit === 0 ? 'is-complete' : ''}" title="${matName}: ${t.owned}/${t.needed}${t.craftedIn ? ` (+${t.craftedIn} crafted 3:1)` : ''}">
                          ${renderAssetIcon('materials', t.key, matName, 'icon-tile-img')}
                          <span class="cmd-tile-overlay mono">${t.owned}/${t.needed}</span>
                        </div>`;
                      })
                      .join('')}
                  </div>
                </details>`;
            } else if (item.expBreakdown) {
              detailTooltip = `4★ ${item.expBreakdown.wits4} • 3★ ${item.expBreakdown.exp3} • 2★ ${item.expBreakdown.adv2}`;
              expandableDetailsHtml = `
                <details class="cmd-card-details">
                  <summary class="mono">${item.owned}/${item.neededTotal} Eq. (${wits.wits4}/${wits.exp3}/${wits.adv2})</summary>
                  <div class="cmd-item-tiles">
                    <div class="cmd-item-tile rarity-bg-2" title="Wanderer's Advice">${renderAssetIcon('materials', 'WanderersAdvice', "Wanderer's Advice", 'icon-tile-img')}<span class="cmd-tile-overlay mono">${item.expBreakdown.adv2}</span></div>
                    <div class="cmd-item-tile rarity-bg-3" title="Adventurer's Experience">${renderAssetIcon('materials', 'AdventurersExperience', "Adventurer's Experience", 'icon-tile-img')}<span class="cmd-tile-overlay mono">${item.expBreakdown.exp3}</span></div>
                    <div class="cmd-item-tile rarity-bg-4" title="Hero's Wit">${renderAssetIcon('materials', 'HerosWit', "Hero's Wit", 'icon-tile-img')}<span class="cmd-tile-overlay mono">${item.expBreakdown.wits4}</span></div>
                  </div>
                </details>`;
            }

            const charKeysAttr = allocTargets.map((t) => t.characterKey).join(',');
            return `
            <div class="cmd-card" data-char-keys="${charKeysAttr}" title="${detailTooltip.replace(/"/g, '&quot;')}">
              <div class="cmd-card-head">
                <div class="cmd-icon-frame rarity-frame-${rarity}">
                  ${renderAssetIcon('materials', item.key, item.name, 'icon-48')}
                </div>
                <div class="cmd-card-title-wrap">
                  <div class="cmd-card-name">${item.name}</div>
                  <div class="cmd-card-badges">
                    ${getSourceBadgeHtml(item, todayName)}
                    ${item.kind === 'weeklyBoss' && item.dreamSolventCount ? `<span class="badge-solvent mono">Solvent ${item.dreamSolventCount}</span>` : ''}
                  </div>
                </div>
              </div>

              ${allocHtml}
              ${expandableDetailsHtml}

              <div class="cmd-card-foot mono">
                <span class="cmd-net-deficit">-${item.deficit.toLocaleString()} NET</span>
                <span class="cmd-resin-est">${item.farmingCost?.text || `${formatCompactNum(item.owned)}/${formatCompactNum(item.neededTotal)}`}</span>
              </div>
            </div>`;
          };

          const gridHtml = actionItems.length
            ? `<div class="cmd-deck-grid">${actionItems.map(renderDeckCard).join('')}</div>`
            : '<div class="empty-state">All #1 &amp; #2 materials are fully funded!</div>';

          const collapsedOthersHtml = hiddenActionItems.length
            ? `<div class="cmd-collapsed-row">
                <span class="cmd-collapsed-lbl mono">OTHER BOTTLENECKS (${hiddenActionItems.length})</span>
                <div class="cmd-collapsed-icons">
                  ${hiddenActionItems
                    .map(
                      (i) => `<span class="cmd-collapsed-chip" title="${i.name}: -${i.deficit.toLocaleString()} NET">
                        ${renderAssetIcon('materials', i.key, i.name, 'icon-xs')}
                      </span>`
                    )
                    .join('')}
                </div>
                <button type="button" class="btn btn-ghost btn-xs mono" data-clear-char-focus>Show All</button>
              </div>`
            : '';

          const surplusHtml = surplusItems.length
            ? `<details class="telemetry-drawer">
                <summary class="telemetry-drawer-summary mono">
                  <span>Bagged &amp; Ready (${surplusItems.length})</span>
                </summary>
                <div class="cmd-surplus-badges">
                  ${surplusItems
                    .map(
                      (item) => `
                    <div class="cmd-surplus-badge" data-char-keys="${(item.alloc?.targets || []).map((t) => t.characterKey).join(',')}" title="${item.name}: ${item.owned.toLocaleString()} / ${item.neededTotal.toLocaleString()} (+${item.surplus.toLocaleString()})">
                      ${renderAssetIcon('materials', item.key, item.name, 'icon-xs')}
                      <span class="mono">+${formatCompactSurplus(item.surplus)}</span>
                    </div>`
                    )
                    .join('')}
                </div>
              </details>`
            : '';

          const breakdownHtml = `
            <details class="telemetry-drawer">
              <summary class="telemetry-drawer-summary mono">
                <span>📊 Farm Breakdown &amp; Gatekeepers</span>
              </summary>
              <div class="breakdown-body">
                ${
                  resinSummary.totalResin > 0
                    ? `<div class="breakdown-resin-wrap">
                        <div class="breakdown-bar">
                          ${resinSummary.buckets
                            .map(
                              (b) => `<div class="breakdown-seg" style="width:${b.pct}%;background:${b.colorVar}" title="${b.label}: ${b.resin.toLocaleString()} Resin (${b.pct}%)"></div>`
                            )
                            .join('')}
                        </div>
                        <div class="breakdown-legend mono">
                          ${resinSummary.buckets
                            .map((b) => `<span><i class="alloc-dot" style="background:${b.colorVar}"></i>${b.label} <strong>${b.pct}%</strong></span>`)
                            .join('')}
                        </div>
                      </div>`
                    : ''
                }
                <div class="gatekeeper-list">
                  ${targetTelemetries
                    .map(
                      ({ target: t, charMeta: cm, telemetry: tel }) => `
                    <div class="gatekeeper-row">
                      <span class="mono text-gold">${t.tierLabel} ${cm.name}:</span>
                      <span>${tel.gatekeeper.label}</span>
                    </div>`
                    )
                    .join('')}
                </div>
              </div>
            </details>`;

          return gridHtml + collapsedOthersHtml + surplusHtml + breakdownHtml;
        })()}
      </article>

      <!-- Zone 3: Today's Grind — Live Ops Column (4 Cols) -->
      <aside class="hud-ops-col">
        <!-- Live Resin Tracker Card -->
        <article class="card">
          <div class="card-header-row" style="margin-bottom: 10px;">
            <div>
              <div class="card-eyebrow">LIVE RESIN TRACKER</div>
              <h2 class="card-title">Resin &amp; Condensed</h2>
            </div>
          </div>

          ${(() => {
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
            const regenText = missingResin === 0 ? 'CAPPED' : `Full in ${fullH}h ${String(fullM).padStart(2, '0')}m`;

            return `
            <div class="resin-gizmo" style="margin-bottom:0;">
              <div class="resin-dial-wrap">
                <svg class="resin-dial-svg" viewBox="0 0 64 64" aria-hidden="true">
                  <circle class="resin-dial-bg" cx="32" cy="32" r="${dialR}" />
                  <circle class="resin-dial-fg ${resinPct >= 90 ? 'is-high' : ''}" cx="32" cy="32" r="${dialR}" stroke-dasharray="${dialCirc.toFixed(2)}" stroke-dashoffset="${dialOffset.toFixed(2)}" />
                </svg>
                <div class="resin-dial-val mono">${curResin}</div>
              </div>

              <div class="resin-gizmo-info">
                <div class="resin-gizmo-inputs">
                  <div class="resin-stat">
                    <span class="mono label">RESIN</span>
                    <input type="number" min="0" max="200" class="input-mono sm" data-wallet-field="resin" value="${curResin}" ${disabledAttr} />
                    <span class="mono muted">/ 200</span>
                  </div>
                  <div class="resin-stat">
                    <span class="mono label">COND</span>
                    <input type="number" min="0" max="5" class="input-mono sm" data-wallet-field="condensedResin" value="${curCondensed}" ${disabledAttr} />
                    <span class="mono muted">/ 5</span>
                  </div>
                </div>
                <div class="resin-gizmo-actions">
                  <span class="resin-regen-pill mono ${missingResin === 0 ? 'is-capped' : ''}">${regenText}</span>
                  ${
                    !isReadOnly
                      ? `<button type="button" class="btn btn-ghost btn-xs mono" data-resin-spend="20" ${curResin < 20 ? 'disabled' : ''}>-20</button>
                         <button type="button" class="btn btn-ghost btn-xs mono" data-resin-spend="40" ${curResin < 40 ? 'disabled' : ''}>-40</button>
                         <button type="button" class="btn btn-outline btn-xs mono" data-resin-condense ${curResin < 40 || curCondensed >= 5 ? 'disabled' : ''}>Condense</button>`
                      : ''
                  }
                </div>
              </div>
            </div>`;
          })()}
        </article>

        <!-- Open Today Window Card -->
        <article class="card">
          <div class="card-header-row">
            <div>
              <div class="card-eyebrow">OPEN TODAY WINDOW</div>
              <h2 class="card-title">${todayName} Domains</h2>
            </div>
            <div class="toolbar-right" style="gap: 6px;">
              <button type="button" class="filter-pill ${state.hudShowAllDomains ? 'active' : ''}" data-hud-all-domains>
                ${state.hudShowAllDomains ? 'Relevant' : `All (${domainsToday.length})`}
              </button>
              <select class="select-sm mono" data-hud-day>
                ${WEEKDAYS.map((d) => `<option value="${d}" ${d === todayName ? 'selected' : ''}>${d.slice(0, 3)}</option>`).join('')}
              </select>
            </div>
          </div>

          ${(() => {
            const prefarmQueue = labeledQueue;
            const hasPrefarm = prefarmQueue.length > 0;
            const enrichDomain = (dom) => {
              const rewardNorms = new Set((dom.rewards || []).map((r) => normalizeAssetKey(r.key)));
              const rewardNames = new Set((dom.rewards || []).map((r) => r.name));
              const matches = [];
              if (dom.domainType === 'Talent' && hasPrefarm) {
                for (const t of prefarmQueue) {
                  const meta = getCharacterMeta(t.characterKey);
                  if (rewardNorms.has(meta.domainMatKey) || rewardNames.has(meta.talentBook)) {
                    matches.push({ kind: 'characters', key: t.characterKey, name: meta.name, badge: t.tierLabel, title: `${t.tierLabel} ${meta.name}` });
                  }
                }
              } else if (dom.domainType === 'Weapon') {
                for (const t of prefarmQueue.filter((x) => x.weaponKey)) {
                  const wm = getWeaponMeta(t.weaponKey);
                  if (rewardNorms.has(wm.domainMatKey)) {
                    matches.push({ kind: 'weapons', key: t.weaponKey, name: wm.name, badge: t.tierLabel, title: `${t.tierLabel} ${wm.name}` });
                  }
                }
              }
              return { ...dom, matches };
            };

            const enriched = domainsToday.map(enrichDomain);
            const showAll = Boolean(state.hudShowAllDomains);
            const filtered = enriched.filter((d) => showAll || d.matches.length > 0);

            const domHtml = filtered.length
              ? filtered
                  .map((dom) => {
                    const matchesPriority = dom.matches.length > 0 || (dom.rewards || []).some((r) => topBookBases.has(r.name));
                    return `
                    <div class="domain-card ${matchesPriority ? 'domain-highlight' : ''}">
                      <div class="domain-top">
                        <span class="domain-name">${dom.name}</span>
                        <span class="pill ${matchesPriority ? 'pill-gold' : ''}">${dom.domainType}</span>
                      </div>
                      <div class="domain-rewards-row">
                        <div class="domain-rewards">
                          ${(dom.rewards || []).map((r) => `<span class="reward-chip">${renderAssetIcon('materials', r.key, r.name, 'icon-xs')} ${r.name}</span>`).join('')}
                        </div>
                        ${
                          dom.matches.length
                            ? `<div class="domain-needed-by">
                                ${dom.matches
                                  .slice(0, 3)
                                  .map(
                                    (m) => `<span class="domain-target-chip" title="${m.title}">${renderAssetIcon(m.kind, m.key, m.name, 'icon-xs')}<span class="mono">${m.badge}</span></span>`
                                  )
                                  .join('')}
                              </div>`
                            : ''
                        }
                      </div>
                    </div>`;
                  })
                  .join('')
              : '<div class="empty-state">No matching domains open today.</div>';

            const bossRows = [];
            for (const t of prefarmQueue) {
              const cm = getCharacterMeta(t.characterKey);
              if (!cm.bossMat) continue;
              const bm = getMaterialMeta(cm.bossMat);
              if (bm?.bossName) bossRows.push({ t, cm, bm });
            }

            const bossHtml = bossRows.length
              ? `<div class="domain-group" style="margin-top:10px;">
                  <div class="card-eyebrow">WORLD BOSSES (${bossRows.length})</div>
                  <div class="domain-list">
                    ${bossRows
                      .map(
                        ({ t, cm, bm }) => `
                        <div class="domain-card ${bm.bossUnreleased ? '' : 'domain-highlight'}">
                          <div class="domain-top">
                            <span class="domain-name">${bm.bossName}</span>
                            ${bm.bossUnreleased ? '<span class="pill pill-coral mono">7.2</span>' : `<span class="pill mono">${t.tierLabel} ${cm.name}</span>`}
                          </div>
                        </div>`
                      )
                      .join('')}
                  </div>
                </div>`
              : '';

            return `<div class="domain-list">${domHtml}</div>${bossHtml}`;
          })()}
        </article>

        <!-- Dailies & Snezhnaya Ops Card -->
        <article class="card">
          <div class="card-header-row" style="margin-bottom: 10px;">
            <div>
              <div class="card-eyebrow">DAILIES &amp; SNEZHNAYA OPS</div>
              <h2 class="card-title">Checklist</h2>
            </div>
          </div>
          <div class="ops-checklist-stack">
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
              <h3 class="subhead mono">WEEKLY &amp; SNEZHNAYA</h3>
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
      </aside>
    </div>
  `;

  // Scarcity Tile Popovers (click-to-edit, click-outside & Escape dismiss)
  const closeAllPopovers = () => {
    container.querySelectorAll('.glass-popover').forEach((p) => {
      p.hidden = true;
    });
  };

  container.querySelectorAll('[data-popover-trigger]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetId = `popover-${btn.dataset.popoverTrigger}`;
      const pop = container.querySelector(`#${targetId}`);
      const wasHidden = pop?.hidden;
      closeAllPopovers();
      if (pop && wasHidden) pop.hidden = false;
    });
  });

  container.querySelectorAll('[data-popover-close]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllPopovers();
    });
  });

  container.querySelectorAll('.glass-popover').forEach((pop) => {
    pop.addEventListener('click', (e) => e.stopPropagation());
  });

  if (container._hudOutsideClick) {
    document.removeEventListener('click', container._hudOutsideClick);
  }
  if (container._hudEscapeKey) {
    document.removeEventListener('keydown', container._hudEscapeKey);
  }
  container._hudOutsideClick = () => closeAllPopovers();
  container._hudEscapeKey = (e) => {
    if (e.key === 'Escape') closeAllPopovers();
  };
  document.addEventListener('click', container._hudOutsideClick);
  document.addEventListener('keydown', container._hudEscapeKey);

  container.querySelector('[data-goto-vault]')?.addEventListener('click', () => {
    closeAllPopovers();
    handlers.onNavigateTab?.('vault');
  });

  // Live server reset countdown updater
  const countdownEl = container.querySelector('#hud-reset-countdown');
  if (countdownEl) {
    const timer = setInterval(() => {
      if (!countdownEl.isConnected) {
        clearInterval(timer);
        return;
      }
      countdownEl.textContent = getServerResetInfo(state.serverId || 'NA').countdownText;
    }, 30_000);
  }

  // Character focus highlight (hover + click pin)
  let pinnedCharKey = state.hudPinnedChar || null;
  const applyCharFocus = (activeKey) => {
    container.querySelectorAll('[data-focus-char]').forEach((btn) => {
      const key = btn.dataset.focusChar;
      btn.classList.toggle('is-focused', Boolean(activeKey) && key === activeKey);
      btn.classList.toggle('is-dimmed', Boolean(activeKey) && key !== activeKey);
      btn.setAttribute('aria-pressed', pinnedCharKey === key ? 'true' : 'false');
    });
    container.querySelectorAll('.cmd-card[data-char-keys], .cmd-today-tile[data-char-keys], .cmd-surplus-badge[data-char-keys]').forEach((el) => {
      if (!activeKey) {
        el.classList.remove('is-focused', 'is-dimmed');
        return;
      }
      const keys = (el.dataset.charKeys || '').split(',').filter(Boolean);
      const match = keys.includes(activeKey);
      el.classList.toggle('is-focused', match);
      el.classList.toggle('is-dimmed', !match);
    });
  };

  if (pinnedCharKey) applyCharFocus(pinnedCharKey);

  container.querySelectorAll('[data-focus-char]').forEach((btn) => {
    const charKey = btn.dataset.focusChar;
    btn.addEventListener('mouseenter', () => {
      if (!pinnedCharKey) applyCharFocus(charKey);
    });
    btn.addEventListener('mouseleave', () => {
      if (!pinnedCharKey) applyCharFocus(null);
    });
    btn.addEventListener('click', () => {
      pinnedCharKey = pinnedCharKey === charKey ? null : charKey;
      state.hudPinnedChar = pinnedCharKey;
      renderHudTab(container, state, handlers);
    });
  });

  container.querySelector('[data-clear-char-focus]')?.addEventListener('click', () => {
    state.hudPinnedChar = null;
    renderHudTab(container, state, handlers);
  });

  // 3D Tilt + Cursor Spotlight on Deck Cards
  container.querySelectorAll('.cmd-card').forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const rx = (((y / rect.height) - 0.5) * -4).toFixed(2);
      const ry = (((x / rect.width) - 0.5) * 4).toFixed(2);
      card.style.setProperty('--mx', `${x.toFixed(1)}px`);
      card.style.setProperty('--my', `${y.toFixed(1)}px`);
      card.style.setProperty('--rx', `${rx}deg`);
      card.style.setProperty('--ry', `${ry}deg`);
    });
    card.addEventListener('mouseleave', () => {
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
    });
  });

  container.querySelector('[data-hud-day]')?.addEventListener('change', (e) => {
    handlers.onChangeHudDay(e.target.value);
  });

  container.querySelector('[data-hud-all-domains]')?.addEventListener('click', () => {
    handlers.onToggleAllDomains?.();
  });

  if (!isReadOnly) {
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
