import { renderAssetIcon, renderGachaSplash } from './assets.js?v=20261119v1';
import {
  ensureCharacterMaterials,
  getAllCharacterKeys,
  getArtifactIcon,
  getCatalogStatus,
  getCharacterKit,
  getCharacterMeta,
  getDomainScheduleForDay,
  getMaterialMeta,
  getWeaponMeta,
  getWeaponStats,
  loadCatalog,
  normalizeAssetKey,
  refreshLiveCatalog
} from './catalog.js?v=20261115ag';
import {
  calcCoinPurse,
  calcEffectiveHerosWit,
  calcSpareReserves,
  calcTargetReadinessPct,
  calcTargetTelemetry,
  calcWishGoalProjection,
  calculatePrioritySharedPool,
  calculateWaterfallPrefarm,
  DEFAULT_WISH_GOAL,
  getServerResetInfo,
  SERVER_REGIONS,
  sortAndLabelPrefarmQueue
} from './calculations.js?v=20261114w';
import {
  fetchPartnerAccount,
  getCachedAccountSession,
  isOfflineMode,
  loginAccount,
  logoutAccount,
  restoreAccountSession,
  saveAccountSection,
  setReadOnlyViewState,
  upsertRosterRow
} from './api.js?v=20261116a';
import { computeCharacterCombatStats } from './build-science.js?v=20261115ah';
import { commitGoodImport, computeGoodImportDiff, validateGoodV3 } from './good-importer.js';
import { cloneMockAccount, MOCK_ACCOUNTS } from './mock-data.js';

const SESSION_KEY = 'genshin_sheet_session_v1';
const VIEW_TITLES = {
  hud: 'Today',
  prefarm: 'Prefarm Queue',
  roster: 'Characters',
  armory: 'Armory',
  teams: 'Teams Lab',
  vault: 'Vault'
};

const state = {
  sessionUser: null,
  ownAccount: null,
  partnerAccount: null,
  partnerUser: null,
  viewingPartner: false,
  visibleUsers: [],
  activeTab: 'hud',
  serverId: 'NA',
  focusedTargetId: null,
  rosterSearch: '',
  rosterElement: 'All',
  rosterOwnership: 'owned',
  inspectedCharKey: null,
  vaultCategory: 'All',
  vaultSearch: '',
  pendingGoodImport: null,
  isPreviewDemo: false
};

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatCompact(n) {
  const num = Number(n || 0);
  const abs = Math.abs(num);
  if (abs >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
  return num.toLocaleString();
}

function getActiveAccount() {
  return state.viewingPartner && state.partnerAccount ? state.partnerAccount : state.ownAccount;
}

function isReadOnly() {
  return Boolean(state.viewingPartner || (getActiveAccount()?.isReadOnly));
}

function showToast(message) {
  const el = document.getElementById('proto-toast');
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    el.hidden = true;
  }, 2600);
}

function withViewTransition(updateFn) {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (typeof document.startViewTransition === 'function' && !reduced) {
    return document.startViewTransition(() => updateFn());
  }
  updateFn();
  return null;
}

function attachCardTilt(container) {
  if (!window.matchMedia?.('(hover: hover)').matches) return;
  container.querySelectorAll('.p-char-tile, .p-weapon-card').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const rect = card.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      card.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
      card.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
      card.style.setProperty('--rx', `${((0.5 - py) * 7).toFixed(2)}deg`);
      card.style.setProperty('--ry', `${((px - 0.5) * 7).toFixed(2)}deg`);
      card.style.setProperty('--ty', '-3px');
    });
    card.addEventListener('pointerleave', () => {
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
      card.style.setProperty('--ty', '0px');
    });
  });
}

function setActiveTab(tab) {
  if (!VIEW_TITLES[tab]) return;
  withViewTransition(() => {
    state.activeTab = tab;
    document.querySelectorAll('[data-ptab]').forEach((btn) => {
      const isActive = btn.dataset.ptab === tab;
      btn.classList.toggle('active', isActive);
      if (isActive) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
    const titleEl = document.getElementById('proto-view-title');
    if (titleEl) titleEl.textContent = VIEW_TITLES[tab];
    renderActiveView();
  });
}

function updateChrome() {
  const syncDot = document.getElementById('proto-sync-dot');
  const syncLabel = document.getElementById('proto-sync-label');
  const offline = isOfflineMode();
  if (syncDot) syncDot.classList.toggle('is-offline', offline);
  if (syncLabel) syncLabel.textContent = offline ? 'Local Preview' : 'Apps Script Sync';

  const roPill = document.getElementById('proto-readonly-pill');
  if (roPill) roPill.hidden = !isReadOnly();

  const serverBtn = document.getElementById('proto-server-btn');
  if (serverBtn) {
    const info = getServerResetInfo(state.serverId);
    serverBtn.textContent = `${state.serverId} · ${info.countdownText || '--h --m'}`;
  }
}

function populateAccountSelect() {
  const sel = document.getElementById('proto-account-select');
  if (!sel || !state.sessionUser) return;
  const rawUsers = state.visibleUsers?.length ? state.visibleUsers : [{ user: state.sessionUser, displayName: state.sessionUser }];
  const users = rawUsers.map((u) => (typeof u === 'string' ? { user: u, displayName: u } : u));
  sel.innerHTML = users
    .map((u) => {
      const key = u.user;
      const name = u.displayName || key;
      const label = key === state.sessionUser ? `${name} (You)` : `${name} (Partner)`;
      const selected = (state.viewingPartner ? state.partnerUser : state.sessionUser) === key ? 'selected' : '';
      return `<option value="${esc(key)}" ${selected}>${esc(label)}</option>`;
    })
    .join('');
}

async function applySession(res) {
  const userKey = res.account?.user || res.user;
  state.sessionUser = userKey;
  state.ownAccount = res.account;
  state.visibleUsers = res.visibleUsers?.length ? res.visibleUsers : [{ user: userKey, displayName: res.account?.displayName || userKey }];
  state.viewingPartner = false;
  state.partnerAccount = null;
  state.partnerUser = null;
  setReadOnlyViewState(false);

  const savedServer = localStorage.getItem(`aaru_server_${userKey}`);
  if (savedServer && SERVER_REGIONS[savedServer]) state.serverId = savedServer;

  document.getElementById('proto-login').hidden = true;
  document.getElementById('proto-shell').hidden = false;

  populateAccountSelect();
  updateChrome();
  renderActiveView();
}

/* ---------- View 1: Today (HUD) ---------- */
function renderTodayView(container, account) {
  const readOnly = isReadOnly();
  const disabled = readOnly ? 'disabled' : '';
  const wallet = account.wallet || {};
  const inventory = account.inventory || {};
  const serverInfo = getServerResetInfo(state.serverId);
  const todayName = serverInfo.inGameDay || serverInfo.todayName || 'Monday';

  const queue = sortAndLabelPrefarmQueue(account.prefarmQueue || []);
  const waterfall = calculateWaterfallPrefarm(queue, inventory, wallet);
  const sharedPool = calculatePrioritySharedPool(queue, inventory, wallet, todayName);
  const poolItems = Array.isArray(sharedPool) ? sharedPool : [];

  const spares = calcSpareReserves(account, poolItems);
  const wits = calcEffectiveHerosWit(inventory);
  const purse = calcCoinPurse(wallet);
  const wishGoal = { ...DEFAULT_WISH_GOAL, ...(wallet.wishGoal || {}) };
  const wishProj = calcWishGoalProjection(wallet, wishGoal);

  const targetsWithTel = queue.map((t) => {
    const readiness = calcTargetReadinessPct(waterfall.get(t.id) || []);
    const tel = calcTargetTelemetry(t, poolItems, state.serverId || 'NA');
    return { ...t, readiness, telemetry: tel };
  });

  const activeItems = poolItems.filter((item) => {
    if (item.kind === 'mora' || item.kind === 'exp') return false;
    if (!state.focusedTargetId) return item.deficit > 0;
    return (item.alloc?.targets || []).some((c) => c.characterKey === state.focusedTargetId || c.targetId === state.focusedTargetId);
  });
  const topBottlenecks = activeItems.filter((i) => i.deficit > 0).slice(0, 8);

  const domainsToday = getDomainScheduleForDay(todayName) || [];
  const enrichedDomains = domainsToday
    .map((dom) => {
      const rewardNorms = new Set((dom.rewards || []).map((r) => normalizeAssetKey(r.key)));
      const rewardNames = new Set((dom.rewards || []).map((r) => r.name));
      const matches = [];
      for (const t of queue) {
        const cm = getCharacterMeta(t.characterKey);
        if (rewardNorms.has(cm.domainMatKey) || rewardNames.has(cm.talentBook)) {
          matches.push({ badge: t.tierLabel, name: cm.name, characterKey: t.characterKey });
        }
      }
      return { ...dom, matches };
    })
    .filter((dom) => !state.focusedTargetId || dom.matches.some((m) => m.characterKey === state.focusedTargetId))
    .sort((a, b) => b.matches.length - a.matches.length);

  const dailyList = account.checklist?.daily || [];
  const weeklyList = account.checklist?.weekly || [];
  const dailyOpen = dailyList.filter((c) => !c.done).length;
  const weeklyOpen = weeklyList.filter((c) => !c.done).length;
  const topDomain = enrichedDomains.find((d) => d.matches.length > 0);

  container.innerHTML = `
    <section class="p-resource-strip" aria-label="Account Reserves">
      <div class="p-res-cell">
        ${renderAssetIcon('materials', 'Mora', 'Mora', 'icon-sm')}
        <div class="p-res-meta">
          <span class="p-res-label">Spare Mora</span>
          <span class="p-res-value mono ${spares.isMoraBroke ? 'text-coral' : 'text-mint'}">${spares.spareMora >= 0 ? `+${formatCompact(spares.spareMora)}` : formatCompact(spares.spareMora)}</span>
          <span class="p-res-sub mono">${formatCompact(spares.bagMora)} in bag · ${formatCompact(spares.committedMora)} committed</span>
        </div>
      </div>
      <div class="p-res-cell">
        ${renderAssetIcon('materials', 'HerosWit', "Hero's Wit", 'icon-sm')}
        <div class="p-res-meta">
          <span class="p-res-label">Spare Hero's Wit</span>
          <span class="p-res-value mono ${spares.isWitsBroke ? 'text-coral' : 'text-mint'}">${spares.spareWits >= 0 ? `+${Math.round(spares.spareWits)}` : Math.round(spares.spareWits)} Eq.</span>
          <span class="p-res-sub mono">${wits.effectiveTotal.toLocaleString()} total (${wits.wits4} 4★)</span>
        </div>
      </div>
      <div class="p-res-cell">
        ${renderAssetIcon('materials', 'Primogem', 'Primogem', 'icon-sm')}
        <div class="p-res-meta">
          <span class="p-res-label">Wish Stash</span>
          <span class="p-res-value mono text-gold">${purse.limitedPulls.toLocaleString()} Pulls</span>
          <span class="p-res-sub mono">${wishProj.projectedTotalPulls} projected (${wishProj.daysRemaining}d)</span>
        </div>
      </div>
    </section>

    ${
      topDomain
        ? `<section class="p-spotlight">
             <div>
               <div class="p-spotlight-title">Best Resin Value Today: ${esc(topDomain.name)}</div>
               <div class="p-row-sub">${(topDomain.rewards || []).map((r) => esc(r.name)).join(' · ')}</div>
             </div>
             <div style="display:flex;gap:6px;flex-wrap:wrap;">
               ${topDomain.matches.map((m) => `<span class="p-badge p-badge-mint">${esc(m.badge)} ${esc(m.name)}</span>`).join('')}
             </div>
           </section>`
        : ''
    }

    <div class="p-grid-2">
      <div class="p-list" style="gap:20px;">
        <section class="p-panel">
          <div class="p-panel-head">
            <h2 class="p-panel-title">Build Momentum &amp; Bottlenecks</h2>
            ${state.focusedTargetId ? '<button type="button" class="p-btn p-btn-ghost p-btn-xs" data-p-clear-focus>All Targets</button>' : ''}
          </div>

          <div class="p-target-grid">
            ${targetsWithTel
              .map((t) => {
                const cm = getCharacterMeta(t.characterKey);
                const el = String(cm.element || '').toLowerCase();
                const active = state.focusedTargetId === t.characterKey ? 'is-active' : '';
                return `
                  <button type="button" class="p-target-card ${active}" data-el="${esc(el)}" data-p-focus="${esc(t.characterKey)}" aria-pressed="${Boolean(active)}">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;">
                      <div class="p-row-left">
                        ${renderAssetIcon('characters', t.characterKey, cm.name, 'icon-xs')}
                        <strong style="font-size:13px;">${esc(cm.name)}</strong>
                      </div>
                      <span class="mono ${t.readiness >= 100 ? 'text-mint' : 'text-gold'}" style="font-size:12px;">${t.readiness >= 100 ? 'Ready!' : `${t.readiness}%`}</span>
                    </div>
                    <div class="p-bar" style="width:100%;"><span style="width:${t.readiness}%;${t.readiness >= 100 ? 'background:var(--p-mint);' : ''}"></span></div>
                    <div class="p-row-sub mono" style="font-size:11.5px;">${esc(t.tierLabel)} · ${esc(t.telemetry.etaLabel)}</div>
                  </button>`;
              })
              .join('') || '<span class="muted">No active targets in Prefarm Queue.</span>'}
          </div>

          <div class="p-list">
            ${
              topBottlenecks.length
                ? topBottlenecks
                    .map((item) => {
                      const pct = item.neededTotal > 0 ? Math.min(100, Math.round((item.owned / item.neededTotal) * 100)) : 100;
                      const who = (item.alloc?.targets || item.consumers || [])
                        .map((c) => c.characterName || getCharacterMeta(c.characterKey).name)
                        .join(', ');
                      return `
                        <button type="button" class="p-row p-row-clickable" data-p-jump-mat="${esc(item.name)}" title="Open in Vault">
                          <div class="p-row-left">
                            ${renderAssetIcon('materials', item.key, item.name, 'icon-xs')}
                            <div>
                              <div class="p-row-title">${esc(item.name)}</div>
                              <div class="p-row-sub">${esc(who)}</div>
                            </div>
                          </div>
                          <div style="display:flex;align-items:center;gap:10px;">
                            <div class="p-bar"><span style="width:${pct}%"></span></div>
                            <span class="mono text-coral" style="font-size:12.5px;min-width:48px;text-align:right;">-${item.deficit.toLocaleString()}</span>
                          </div>
                        </button>`;
                    })
                    .join('')
                : '<div class="muted" style="font-size:13px;">All tracked materials for this selection are satisfied.</div>'
            }
          </div>
        </section>

        <section class="p-panel">
          <div class="p-panel-head">
            <h2 class="p-panel-title">Active Reminders</h2>
            <span class="p-badge ${dailyOpen + weeklyOpen === 0 ? 'p-badge-mint' : 'p-badge-amber'}">${
              dailyOpen + weeklyOpen === 0 ? 'All Caught Up' : `${dailyOpen} Daily · ${weeklyOpen} Weekly Open`
            }</span>
          </div>
          <div class="p-list" style="gap:14px;">
            <div class="p-reminder-group">
              <div class="p-row-sub">Daily</div>
              <div class="p-reminder-chips">
                ${[...dailyList].sort((a, b) => Number(a.done) - Number(b.done))
                  .map(
                    (c) => `
                    <button type="button" class="p-rem-chip ${c.done ? 'is-done' : ''}" data-p-check="daily" data-p-cid="${esc(c.id)}" ${disabled} aria-pressed="${Boolean(c.done)}">
                      <span class="p-rem-dot" aria-hidden="true"></span>
                      <span>${esc(c.label)}</span>
                    </button>`
                  )
                  .join('')}
              </div>
            </div>
            <div class="p-reminder-group">
              <div class="p-row-sub">Weekly &amp; Endgame</div>
              <div class="p-reminder-chips">
                ${[...weeklyList].sort((a, b) => Number(a.done) - Number(b.done))
                  .map(
                    (c) => `
                    <button type="button" class="p-rem-chip ${c.done ? 'is-done' : ''}" data-p-check="weekly" data-p-cid="${esc(c.id)}" ${disabled} aria-pressed="${Boolean(c.done)}">
                      <span class="p-rem-dot" aria-hidden="true"></span>
                      <span>${esc(c.label)}</span>
                    </button>`
                  )
                  .join('')}
              </div>
            </div>
          </div>
        </section>
      </div>

      <section class="p-panel">
        <div class="p-panel-head">
          <h2 class="p-panel-title">Open Domains · ${esc(todayName)}</h2>
          <span class="p-badge mono">${enrichedDomains.filter((d) => d.matches.length).length} Priority</span>
        </div>
        <div class="p-list">
          ${
            enrichedDomains.length
              ? enrichedDomains
                  .slice(0, 8)
                  .map(
                    (dom) => `
              <div class="p-row">
                <div>
                  <div class="p-row-title">${esc(dom.name)}</div>
                  <div class="p-row-sub">${(dom.rewards || []).map((r) => esc(r.name)).join(' · ')}</div>
                  ${
                    dom.matches.length
                      ? `<div style="margin-top:5px;display:flex;gap:6px;flex-wrap:wrap;">${dom.matches
                          .map((m) => `<span class="p-badge p-badge-mint">${esc(m.badge)} ${esc(m.name)}</span>`)
                          .join('')}</div>`
                      : ''
                  }
                </div>
                <span class="p-badge">${esc(dom.domainType)}</span>
              </div>`
                  )
                  .join('')
              : '<div class="muted" style="font-size:13px;">No open domains match the focused target today.</div>'
          }
        </div>
      </section>
    </div>
  `;

  container.querySelectorAll('[data-p-focus]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.pFocus;
      state.focusedTargetId = state.focusedTargetId === k ? null : k;
      renderTodayView(container, account);
    });
  });
  container.querySelector('[data-p-clear-focus]')?.addEventListener('click', () => {
    state.focusedTargetId = null;
    renderTodayView(container, account);
  });
  container.querySelectorAll('[data-p-jump-mat]').forEach((row) => {
    row.addEventListener('click', () => {
      state.vaultCategory = 'All';
      state.vaultSearch = row.dataset.pJumpMat;
      setActiveTab('vault');
    });
  });
  container.querySelectorAll('[data-p-check]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (readOnly) return;
      const group = btn.dataset.pCheck;
      const id = btn.dataset.pCid;
      const list = account.checklist?.[group] || [];
      const item = list.find((x) => x.id === id);
      if (item) item.done = !item.done;
      renderTodayView(container, account);
      try {
        if (!state.isPreviewDemo) {
          await saveAccountSection(state.sessionUser, 'checklist', account.checklist);
        }
      } catch (err) {
        showToast(`Reminder save failed: ${err.message}`);
      }
    });
  });
}

/* ---------- View 2: Prefarm Queue ---------- */
function renderPrefarmView(container, account) {
  const queue = sortAndLabelPrefarmQueue(account.prefarmQueue || []);
  const waterfall = calculateWaterfallPrefarm(queue, account.inventory || {}, account.wallet || {});
  const sharedPool = calculatePrioritySharedPool(queue, account.inventory || {}, account.wallet || {}, getServerResetInfo(state.serverId).inGameDay || 'Monday');
  const poolItems = Array.isArray(sharedPool) ? sharedPool : [];

  container.innerHTML = `
    <div class="p-table-wrap">
      <table class="p-table">
        <thead>
          <tr>
            <th>Priority</th>
            <th>Character</th>
            <th>Level Target</th>
            <th>Talents</th>
            <th>Readiness</th>
            <th>Resin ETA</th>
          </tr>
        </thead>
        <tbody>
          ${
            queue.length
              ? queue
                  .map((t) => {
                    const cm = getCharacterMeta(t.characterKey);
                    const pct = calcTargetReadinessPct(waterfall.get(t.id) || []);
                    const tel = calcTargetTelemetry(t, poolItems, state.serverId || 'NA');
                    return `
                      <tr style="cursor:pointer;" tabindex="0" role="link" data-p-open-char="${esc(t.characterKey)}">
                        <td class="mono text-gold">${esc(t.tierLabel)}</td>
                        <td>
                          <div class="p-row-left">
                            ${renderAssetIcon('characters', t.characterKey, cm.name, 'icon-xs')}
                            <strong>${esc(cm.name)}</strong>
                          </div>
                        </td>
                        <td class="mono">${t.currentLevel || 1} → ${t.targetLevel || 90}</td>
                        <td class="mono">${(t.currentTalents || [1, 1, 1]).join('/')} → ${(t.targetTalents || [9, 9, 9]).join('/')}</td>
                        <td class="mono ${pct >= 100 ? 'text-mint' : ''}">${pct}%</td>
                        <td class="mono muted">${esc(tel.etaLabel)}</td>
                      </tr>`;
                  })
                  .join('')
              : '<tr><td colspan="6" class="muted">No characters in Prefarm Queue.</td></tr>'
          }
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll('[data-p-open-char]').forEach((row) => {
    const open = () => {
      state.inspectedCharKey = row.dataset.pOpenChar;
      setActiveTab('roster');
    };
    row.addEventListener('click', open);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
  });
}

/* ---------- View 3: Roster + Dossier ---------- */
function renderStatRadarSvg(combat) {
  const axes = [
    { label: 'ATK', val: Math.min(1, (combat?.atk || 0) / 2600) },
    { label: 'CRIT', val: Math.min(1, ((combat?.critRate || 5) * 2 + (combat?.critDmg || 50)) / 360) },
    { label: 'ER', val: Math.min(1, ((combat?.er || 100) - 100) / 120) },
    { label: 'EM', val: Math.min(1, (combat?.em || 0) / 400) },
    { label: 'DMG', val: Math.min(1, (combat?.elementalDmgBonus || 0) / 70) }
  ];
  const cx = 75, cy = 75, r = 46;
  const pt = (i, scale) => {
    const a = (-Math.PI / 2) + (i * 2 * Math.PI) / 5;
    return [cx + Math.cos(a) * r * scale, cy + Math.sin(a) * r * scale];
  };
  const ringPts = (s) => axes.map((_, i) => pt(i, s).map((n) => n.toFixed(1)).join(',')).join(' ');
  const polyPts = axes.map((ax, i) => pt(i, Math.max(0.18, ax.val)).map((n) => n.toFixed(1)).join(',')).join(' ');
  const labels = axes
    .map((ax, i) => {
      const [x, y] = pt(i, 1.32);
      return `<text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="middle" fill="var(--p-text-muted)" font-size="9" font-family="var(--p-font-mono)">${ax.label}</text>`;
    })
    .join('');

  return `
    <svg viewBox="0 0 150 150" width="150" height="150" aria-hidden="true">
      <polygon points="${ringPts(1)}" fill="none" stroke="var(--p-border)" stroke-width="1" />
      <polygon points="${ringPts(0.6)}" fill="none" stroke="var(--p-border)" stroke-width="1" stroke-dasharray="2 2" />
      <polygon class="p-radar-poly" points="${polyPts}" fill="var(--el-wash, rgba(94,234,212,0.18))" stroke="var(--el-ink, var(--p-accent))" stroke-width="1.6" />
      ${labels}
    </svg>`;
}

function renderRosterView(container, account) {
  const readOnly = isReadOnly();
  const disabled = readOnly ? 'disabled' : '';
  const ownedMap = new Map((account.characters || []).map((c) => [c.key, c]));
  const prefarmSet = new Set((account.prefarmQueue || []).map((t) => t.characterKey));
  const allKeys = getAllCharacterKeys();

  const chars = allKeys.map((key) => {
    const owned = ownedMap.get(key);
    const meta = getCharacterMeta(key);
    return owned
      ? { ...owned, owned: true, meta }
      : { key, owned: false, level: 0, constellation: 0, meta };
  });

  if (state.inspectedCharKey) {
    const char = chars.find((c) => c.key === state.inspectedCharKey) || chars[0];
    const kitData = getCharacterKit(char.key);
    const weapon = char.equippedWeapon;
    const weaponMeta = weapon ? getWeaponMeta(weapon.key) : null;
    const weaponStats = weapon ? getWeaponStats(weapon.key) : null;
    const combat = computeCharacterCombatStats(char, weapon, char.equippedArtifacts || [], kitData, weaponStats);
    const elemStat = combat?.elementalDmgBonus || 0;
    const elemLabel = `${char.meta.element || 'Elemental'} DMG%`;
    const elAttr = String(char.meta.element || '').toLowerCase();

    container.innerHTML = `
      <div class="p-toolbar">
        <button type="button" id="p-back-roster" class="p-btn p-btn-outline p-btn-sm">← All Characters</button>
        <span class="muted">${esc(char.meta.name)} · ${esc(char.meta.element)} · ${esc(char.meta.weaponType)} · ${char.meta.rarity}★</span>
      </div>

      <section class="p-dossier-hero" data-el="${esc(elAttr)}" data-rarity="${char.meta.rarity || 5}">
        <svg class="p-dossier-astrolabe" viewBox="0 0 200 200" aria-hidden="true">
          <circle cx="100" cy="100" r="92" fill="none" stroke="var(--p-gold)" stroke-width="0.8" stroke-dasharray="4 6" />
          <circle cx="100" cy="100" r="72" fill="none" stroke="var(--el-ink, var(--p-accent))" stroke-width="0.9" opacity="0.65" />
          <polygon points="100,14 186,100 100,186 14,100" fill="none" stroke="var(--p-gold)" stroke-width="0.6" opacity="0.5" />
        </svg>
        <div class="p-portrait-box" style="view-transition-name:hero-portrait;">
          ${renderGachaSplash(char.key, char.meta.name)}
          <div class="p-const-strip">
            ${[1, 2, 3, 4, 5, 6]
              .map((i) => `<div class="p-const-pip mono ${(char.constellation || 0) >= i ? 'is-on' : ''}">C${i}</div>`)
              .join('')}
          </div>
        </div>

        <div style="position:relative;z-index:1;">
          <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <h2 class="proto-dossier-name" style="view-transition-name:hero-name;">${esc(char.meta.name)}</h2>
            <span class="mono muted">Lv.${char.level || 1} · A/E/Q ${(char.talents || [1, 1, 1]).join('/')} · ${combat?.cv?.toFixed(1) || '0.0'} CV</span>
          </div>

          <div class="p-stats-radar-wrap">
            <div class="p-stat-grid">
              <div class="p-stat-row"><span class="muted">HP</span><strong class="mono">${Math.round(combat?.hp || 0).toLocaleString()}</strong></div>
              <div class="p-stat-row"><span class="muted">ATK</span><strong class="mono">${Math.round(combat?.atk || 0).toLocaleString()}</strong></div>
              <div class="p-stat-row"><span class="muted">DEF</span><strong class="mono">${Math.round(combat?.def || 0).toLocaleString()}</strong></div>
              <div class="p-stat-row"><span class="muted">EM</span><strong class="mono">${Math.round(combat?.em || 0).toLocaleString()}</strong></div>
              <div class="p-stat-row"><span class="muted">CRIT Rate</span><strong class="mono">${(combat?.critRate || 5).toFixed(1)}%</strong></div>
              <div class="p-stat-row"><span class="muted">CRIT DMG</span><strong class="mono">${(combat?.critDmg || 50).toFixed(1)}%</strong></div>
              <div class="p-stat-row"><span class="muted">ER%</span><strong class="mono">${(combat?.er || 100).toFixed(1)}%</strong></div>
              <div class="p-stat-row"><span class="muted">${esc(elemLabel)}</span><strong class="mono">${elemStat.toFixed(1)}%</strong></div>
            </div>
            <div style="display:flex;justify-content:center;">${renderStatRadarSvg(combat)}</div>
          </div>

          ${
            weaponMeta
              ? `<div class="p-row" style="margin-top:8px;">
                   <div class="p-row-left">
                     ${renderAssetIcon('weapons', weapon.key, weaponMeta.name, 'icon-sm')}
                     <div>
                       <div class="p-row-title">${esc(weaponMeta.name)}</div>
                       <div class="p-row-sub mono">Lv.${weapon.level || 90} · R${weapon.refinement || 1}</div>
                     </div>
                   </div>
                   <span class="p-badge p-badge-mint mono">${combat?.wrvPct ? `${Math.round(combat.wrvPct)}% wRV` : 'Equipped'}</span>
                 </div>`
              : ''
          }

          <div class="p-art-strip">
            ${['flower', 'plume', 'sands', 'goblet', 'circlet']
              .map((slot) => {
                const art = (char.equippedArtifacts || []).find((a) => a.slotKey === slot);
                if (!art) return `<div class="p-art-slot muted">${slot}</div>`;
                const icon = getArtifactIcon(art.setKey, art.slotKey);
                return `
                  <div class="p-art-slot">
                    ${icon ? `<img src="${icon}" alt="${esc(slot)}" />` : ''}
                    <span class="mono text-gold">+${art.level ?? 20}</span>
                    <span>${esc(art.mainStatKey)}</span>
                  </div>`;
              })
              .join('')}
          </div>
        </div>
      </section>

      <section class="p-panel">
        <div class="p-panel-head">
          <h2 class="p-panel-title">Build Targets</h2>
        </div>
        <form id="p-target-form" style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;">
          <label class="proto-field" style="min-width:140px;">
            <span>Status</span>
            <select name="status" class="proto-select" ${disabled}>
              ${['Active Prefarm', 'Built', 'Backlog', 'Archived']
                .map((s) => `<option value="${s}" ${char.status === s ? 'selected' : ''}>${s}</option>`)
                .join('')}
            </select>
          </label>
          <label class="proto-field" style="width:90px;">
            <span>Target Lv</span>
            <input type="number" name="targetLevel" min="1" max="100" value="${char.targetLevel || 90}" class="p-input mono" ${disabled} />
          </label>
          <label class="proto-field" style="width:68px;">
            <span>Target A</span>
            <input type="number" name="targetA" min="1" max="10" value="${(char.targetTalents || [9, 9, 9])[0]}" class="p-input mono" ${disabled} />
          </label>
          <label class="proto-field" style="width:68px;">
            <span>Target E</span>
            <input type="number" name="targetE" min="1" max="10" value="${(char.targetTalents || [9, 9, 9])[1]}" class="p-input mono" ${disabled} />
          </label>
          <label class="proto-field" style="width:68px;">
            <span>Target Q</span>
            <input type="number" name="targetQ" min="1" max="10" value="${(char.targetTalents || [9, 9, 9])[2]}" class="p-input mono" ${disabled} />
          </label>
          <label class="proto-field" style="width:88px;">
            <span>Priority #</span>
            <input type="number" name="priorityRank" min="1" max="99" value="${char.priorityRank || ''}" class="p-input mono" ${disabled} />
          </label>
          ${!readOnly ? '<button type="submit" id="p-save-target-btn" class="p-btn p-btn-primary">Save Target</button>' : ''}
        </form>
      </section>
  `;

    document.getElementById('p-back-roster')?.addEventListener('click', () => {
      withViewTransition(() => {
        state.inspectedCharKey = null;
        renderRosterView(container, account);
      });
    });
    document.getElementById('p-target-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (readOnly) return;
      const saveBtn = document.getElementById('p-save-target-btn');
      const fd = new FormData(e.target);
      const updated = {
        ...char,
        owned: true,
        status: fd.get('status'),
        targetLevel: Number(fd.get('targetLevel') || 90),
        targetTalents: [
          Number(fd.get('targetA') || 9),
          Number(fd.get('targetE') || 9),
          Number(fd.get('targetQ') || 9)
        ],
        priorityRank: fd.get('priorityRank') ? Number(fd.get('priorityRank')) : null
      };
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
      }
      try {
        if (!state.isPreviewDemo) {
          await upsertRosterRow(state.sessionUser, char.key, updated);
        }
        const idx = (account.characters || []).findIndex((c) => c.key === char.key);
        if (idx >= 0) account.characters[idx] = updated;
        else account.characters = [...(account.characters || []), updated];
        showToast(`Saved ${char.meta.name}`);
      } catch (err) {
        showToast(`Save failed: ${err.message}`);
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Target';
        }
      }
    });
    return;
  }

  const elements = ['All', 'Pyro', 'Hydro', 'Electro', 'Cryo', 'Anemo', 'Geo', 'Dendro'];
  const ownershipTabs = [
    { id: 'owned', label: 'Owned' },
    { id: 'all', label: 'All' },
    { id: 'unowned', label: 'Unowned' }
  ];

  container.innerHTML = `
    <div class="p-toolbar">
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;">
        <div class="p-filter-pills" role="group" aria-label="Ownership filter">
          ${ownershipTabs
            .map(
              (o) =>
                `<button type="button" class="p-pill-btn ${state.rosterOwnership === o.id ? 'active' : ''}" data-p-own="${o.id}" aria-pressed="${state.rosterOwnership === o.id}">${o.label}</button>`
            )
            .join('')}
        </div>
        <div class="p-filter-pills" role="group" aria-label="Element filter">
          ${elements
            .map(
              (el) =>
                `<button type="button" class="p-pill-btn ${state.rosterElement === el ? 'active' : ''}" data-p-el="${el}" aria-pressed="${state.rosterElement === el}">${el}</button>`
            )
            .join('')}
        </div>
      </div>
      <input type="search" id="p-roster-search" class="proto-search" style="max-width:240px;" placeholder="Filter characters..." aria-label="Filter characters" value="${esc(state.rosterSearch)}" />
    </div>

    <div id="p-roster-grid" class="p-roster-grid"></div>
  `;

  const renderRosterCards = () => {
    const grid = document.getElementById('p-roster-grid');
    if (!grid) return;
    const filtered = chars
      .filter((c) => {
        if (state.rosterOwnership === 'owned') return c.owned;
        if (state.rosterOwnership === 'unowned') return !c.owned;
        return true;
      })
      .filter((c) => state.rosterElement === 'All' || c.meta.element === state.rosterElement)
      .filter((c) => !state.rosterSearch || c.meta.name.toLowerCase().includes(state.rosterSearch.toLowerCase()))
      .sort((a, b) => Number(b.owned) - Number(a.owned) || (b.level || 0) - (a.level || 0) || a.meta.name.localeCompare(b.meta.name));

    grid.innerHTML = filtered.length
      ? filtered
          .map((c) => {
            const elAttr = String(c.meta.element || '').toLowerCase();
            const isTarget = c.status === 'Active Prefarm' || prefarmSet.has(c.key);
            return `
            <button type="button" class="p-char-tile ${c.owned ? '' : 'is-unowned'}" data-el="${esc(elAttr)}" data-rarity="${c.meta.rarity || 4}" data-p-char="${esc(c.key)}">
              ${isTarget ? '<span class="p-badge p-badge-mint" style="position:absolute;top:8px;right:8px;font-size:12px;padding:1px 7px;">Target</span>' : ''}
              ${renderAssetIcon('characters', c.key, c.meta.name, '')}
              <span class="p-char-name">${esc(c.meta.name)}</span>
              <span class="p-char-sub mono">${c.owned ? `Lv.${c.level || 1} · C${c.constellation || 0}` : 'Unowned'}</span>
            </button>`;
          })
          .join('')
      : '<div class="p-panel muted" style="grid-column:1/-1;">No characters match your current filter.</div>';

    grid.querySelectorAll('[data-p-char]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const avatar = btn.querySelector('.asset-wrap');
        const nameEl = btn.querySelector('.p-char-name');
        if (avatar) avatar.style.viewTransitionName = 'hero-portrait';
        if (nameEl) nameEl.style.viewTransitionName = 'hero-name';
        withViewTransition(() => {
          state.inspectedCharKey = btn.dataset.pChar;
          renderRosterView(container, account);
        });
      });
    });
    attachCardTilt(grid);
  };

  renderRosterCards();

  container.querySelectorAll('[data-p-own]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.rosterOwnership = btn.dataset.pOwn;
      container.querySelectorAll('[data-p-own]').forEach((b) => {
        const active = b.dataset.pOwn === state.rosterOwnership;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
      });
      renderRosterCards();
    });
  });
  container.querySelectorAll('[data-p-el]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.rosterElement = btn.dataset.pEl;
      container.querySelectorAll('[data-p-el]').forEach((b) => {
        const active = b.dataset.pEl === state.rosterElement;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
      });
      renderRosterCards();
    });
  });
  document.getElementById('p-roster-search')?.addEventListener('input', (e) => {
    state.rosterSearch = e.target.value;
    renderRosterCards();
  });
}

/* ---------- View 4: Armory (Visual Weapon Cards) ---------- */
function renderArmoryView(container, account) {
  const weapons = [...(account.weapons || [])].sort((a, b) => (b.level || 0) - (a.level || 0));
  container.innerHTML = `
    <div class="p-armory-grid">
      ${
        weapons.length
          ? weapons
              .map((w) => {
                const meta = getWeaponMeta(w.key);
                const holderMeta = w.location ? getCharacterMeta(w.location) : null;
                return `
                  <article class="p-weapon-card" data-rarity="${meta.rarity || 4}">
                    <div class="p-weapon-head">
                      ${renderAssetIcon('weapons', w.key, meta.name, 'icon-md')}
                      <div style="min-width:0;">
                        <div class="p-row-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(meta.name)}</div>
                        <div class="p-row-sub">${esc(meta.weaponType)} · <span class="mono text-gold">${meta.rarity || 4}★</span></div>
                      </div>
                    </div>
                    <div class="p-weapon-foot">
                      <span class="mono muted" style="font-size:12px;">Lv.${w.level || 1} · R${w.refinement || 1}</span>
                      ${
                        holderMeta
                          ? `<button type="button" class="p-holder-chip" data-p-jump-char="${esc(w.location)}">
                               ${renderAssetIcon('characters', w.location, holderMeta.name, 'icon-xs')}
                               <span>${esc(holderMeta.name)}</span>
                             </button>`
                          : '<span class="muted" style="font-size:12px;">Unassigned</span>'
                      }
                    </div>
                  </article>`;
              })
              .join('')
          : '<div class="p-panel muted">No weapons recorded.</div>'
      }
    </div>
  `;

  container.querySelectorAll('[data-p-jump-char]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.inspectedCharKey = btn.dataset.pJumpChar;
      setActiveTab('roster');
    });
  });
  attachCardTilt(container);
}

/* ---------- View 5: Teams Lab (Squad Formations + Resonance) ---------- */
const RESONANCE_NAMES = {
  Pyro: 'Fervent Flames',
  Hydro: 'Soothing Water',
  Electro: 'High Voltage',
  Cryo: 'Shattering Ice',
  Anemo: 'Impetuous Winds',
  Geo: 'Enduring Rock',
  Dendro: 'Sprawling Greenery'
};

function renderTeamsView(container, account) {
  const teams = account.teams || [];
  const charMap = new Map((account.characters || []).map((c) => [c.key, c]));
  container.innerHTML = `
    <div class="p-list" style="gap:16px;">
      ${
        teams.length
          ? teams
              .map((t) => {
                const counts = {};
                (t.members || []).forEach((m) => {
                  const el = getCharacterMeta(m.characterKey).element;
                  if (el) counts[el] = (counts[el] || 0) + 1;
                });
                const resonances = Object.entries(counts)
                  .filter(([, n]) => n >= 2)
                  .map(([el]) => RESONANCE_NAMES[el] || `${el} Resonance`);

                return `
                  <section class="p-panel">
                    <div class="p-panel-head">
                      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                        <h2 class="p-panel-title">${esc(t.name)}</h2>
                        <span class="p-badge">${esc(t.archetype || 'Squad')}</span>
                      </div>
                      <div style="display:flex;gap:6px;flex-wrap:wrap;">
                        ${resonances.map((r) => `<span class="p-badge p-badge-mint">${esc(r)}</span>`).join('')}
                      </div>
                    </div>
                    <div class="p-squad-grid">
                      ${(t.members || [])
                        .map((m) => {
                          const cm = getCharacterMeta(m.characterKey);
                          const elAttr = String(cm.element || '').toLowerCase();
                          const owned = charMap.get(m.characterKey);
                          const wKey = m.weaponKey || owned?.equippedWeapon?.key;
                          const wMeta = wKey ? getWeaponMeta(wKey) : null;
                          return `
                            <button type="button" class="p-squad-slot" data-el="${esc(elAttr)}" data-p-jump-char="${esc(m.characterKey)}">
                              <div class="p-row-left">
                                ${renderAssetIcon('characters', m.characterKey, cm.name, 'icon-md')}
                                <div style="min-width:0;">
                                  <div class="p-row-title">${esc(cm.name)}</div>
                                  <div class="p-row-sub">${esc(m.role || cm.element)}</div>
                                </div>
                              </div>
                              ${
                                wMeta
                                  ? `<div class="p-row-left" style="padding-top:6px;border-top:1px solid var(--p-border);">
                                       ${renderAssetIcon('weapons', wKey, wMeta.name, 'icon-xs')}
                                       <span class="p-row-sub" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(wMeta.name)}</span>
                                     </div>`
                                  : ''
                              }
                            </button>`;
                        })
                        .join('')}
                    </div>
                  </section>`;
              })
              .join('')
          : '<div class="p-panel muted">No squads saved yet.</div>'
      }
    </div>
  `;

  container.querySelectorAll('[data-p-jump-char]').forEach((slot) => {
    slot.addEventListener('click', () => {
      state.inspectedCharKey = slot.dataset.pJumpChar;
      setActiveTab('roster');
    });
  });
}

/* ---------- View 6: Vault ---------- */
function renderVaultView(container, account) {
  const readOnly = isReadOnly();
  const disabled = readOnly ? 'disabled' : '';
  const inv = account.inventory || {};
  const queue = sortAndLabelPrefarmQueue(account.prefarmQueue || []);
  const sharedPool = calculatePrioritySharedPool(queue, inv, account.wallet || {}, getServerResetInfo(state.serverId).inGameDay || 'Monday');
  const neededMap = new Map((Array.isArray(sharedPool) ? sharedPool : []).map((i) => [i.key, i.neededTotal || 0]));

  const rows = Object.entries(inv)
    .map(([key, count]) => {
      const meta = getMaterialMeta(key);
      const needed = neededMap.get(key) || 0;
      return {
        key,
        name: meta?.name || key,
        category: meta?.category || 'Material',
        owned: Number(count || 0),
        needed,
        net: Number(count || 0) - needed
      };
    })
    .filter((r) => state.vaultCategory === 'All' || r.category === state.vaultCategory)
    .filter((r) => !state.vaultSearch || r.name.toLowerCase().includes(state.vaultSearch.toLowerCase()))
    .sort((a, b) => b.needed - a.needed || a.name.localeCompare(b.name));

  const cats = ['All', ...new Set(Object.keys(inv).map((k) => getMaterialMeta(k)?.category || 'Material'))].slice(0, 8);

  container.innerHTML = `
    <div class="p-toolbar">
      <div class="p-filter-pills" role="group" aria-label="Material categories">
        ${cats
          .map(
            (cat) =>
              `<button type="button" class="p-pill-btn ${state.vaultCategory === cat ? 'active' : ''}" data-p-vcat="${esc(cat)}" aria-pressed="${state.vaultCategory === cat}">${esc(cat)}</button>`
          )
          .join('')}
      </div>
      <input type="search" id="p-vault-search" class="proto-search" style="max-width:240px;" placeholder="Filter materials..." aria-label="Filter materials" value="${esc(state.vaultSearch)}" />
    </div>

    <div class="p-table-wrap">
      <table class="p-table">
        <thead>
          <tr>
            <th>Material</th>
            <th>Category</th>
            <th>Needed</th>
            <th>Net</th>
            <th>In Bag</th>
          </tr>
        </thead>
        <tbody id="p-vault-tbody"></tbody>
      </table>
    </div>
    <div id="p-vault-count" class="muted mono" style="font-size:12px;"></div>
  `;

  const commitMat = async (key, val) => {
    if (readOnly) return;
    account.inventory[key] = Math.max(0, Number(val || 0));
    try {
      if (!state.isPreviewDemo) {
        await saveAccountSection(state.sessionUser, 'inventory', account.inventory);
      }
    } catch (err) {
      showToast(`Vault save failed: ${err.message}`);
    }
  };

  const renderVaultRows = () => {
    const tbody = document.getElementById('p-vault-tbody');
    if (!tbody) return;
    const filtered = rows.filter((r) => state.vaultCategory === 'All' || r.category === state.vaultCategory)
      .filter((r) => !state.vaultSearch || r.name.toLowerCase().includes(state.vaultSearch.toLowerCase()));

    const countEl = document.getElementById('p-vault-count');
    if (countEl) {
      countEl.textContent = filtered.length > 120
        ? `Showing 120 of ${filtered.length} materials — filter to narrow`
        : `${filtered.length} materials`;
    }

    tbody.innerHTML = filtered.length
      ? filtered
          .slice(0, 120)
          .map(
            (r) => `
            <tr>
              <td>
                <div class="p-row-left">
                  ${renderAssetIcon('materials', r.key, r.name, 'icon-xs')}
                  <strong>${esc(r.name)}</strong>
                </div>
              </td>
              <td class="muted">${esc(r.category)}</td>
              <td class="mono">${r.needed ? r.needed.toLocaleString() : '—'}</td>
              <td class="mono ${r.needed ? (r.net < 0 ? 'text-coral' : 'text-mint') : 'muted'}">${
                r.needed ? (r.net >= 0 ? `+${r.net.toLocaleString()}` : r.net.toLocaleString()) : '—'
              }</td>
              <td>
                <div class="p-vault-ctrl">
                  <input type="number" min="0" class="p-vault-input mono" aria-label="${esc(r.name)} count" value="${r.owned}" data-p-vinput="${esc(r.key)}" ${disabled} />
                  ${!readOnly ? `<button type="button" class="p-btn p-btn-outline p-btn-xs mono" data-p-vadd="${esc(r.key)}" data-p-delta="1">+1</button><button type="button" class="p-btn p-btn-outline p-btn-xs mono" data-p-vadd="${esc(r.key)}" data-p-delta="10">+10</button>` : ''}
                </div>
              </td>
            </tr>`
          )
          .join('')
      : '<tr><td colspan="5" class="muted">No materials match your filter.</td></tr>';

    tbody.querySelectorAll('[data-p-vinput]').forEach((input) => {
      input.addEventListener('change', () => commitMat(input.dataset.pVinput, input.value));
    });
    tbody.querySelectorAll('[data-p-vadd]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const k = btn.dataset.pVadd;
        const delta = Number(btn.dataset.pDelta || 1);
        const next = Math.max(0, Number(account.inventory[k] || 0) + delta);
        const rowObj = rows.find((x) => x.key === k);
        if (rowObj) {
          rowObj.owned = next;
          rowObj.net = next - rowObj.needed;
        }
        await commitMat(k, next);
        renderVaultRows();
      });
    });
  };

  renderVaultRows();

  container.querySelectorAll('[data-p-vcat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.vaultCategory = btn.dataset.pVcat;
      container.querySelectorAll('[data-p-vcat]').forEach((b) => {
        const active = b.dataset.pVcat === state.vaultCategory;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
      });
      renderVaultRows();
    });
  });
  document.getElementById('p-vault-search')?.addEventListener('input', (e) => {
    state.vaultSearch = e.target.value;
    renderVaultRows();
  });
}

function renderActiveView() {
  const container = document.getElementById('proto-main');
  const account = getActiveAccount();
  if (!container || !account) return;

  try {
    if (state.activeTab === 'hud') renderTodayView(container, account);
    else if (state.activeTab === 'prefarm') renderPrefarmView(container, account);
    else if (state.activeTab === 'roster') renderRosterView(container, account);
    else if (state.activeTab === 'armory') renderArmoryView(container, account);
    else if (state.activeTab === 'teams') renderTeamsView(container, account);
    else if (state.activeTab === 'vault') renderVaultView(container, account);
  } catch (err) {
    console.error('Prototype view render failed:', err);
    container.innerHTML = `<div class="p-panel text-coral">Render error in ${esc(state.activeTab)}: ${esc(err.message)}</div>`;
  }
}

/* ---------- Shell Interactions (Quick Jump, Modals, Auth) ---------- */
function setupQuickJump() {
  const input = document.getElementById('proto-quick-jump');
  const menu = document.getElementById('proto-jump-results');
  if (!input || !menu) return;

  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
      e.preventDefault();
      input.focus();
    }
  });

  const closeJump = () => {
    menu.hidden = true;
    input.setAttribute('aria-expanded', 'false');
  };

  let jumpIdx = -1;
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    jumpIdx = -1;
    if (!q) {
      closeJump();
      return;
    }
    const account = getActiveAccount();
    const chars = (account?.characters || [])
      .map((c) => ({ type: 'char', key: c.key, label: getCharacterMeta(c.key).name }))
      .filter((x) => x.label.toLowerCase().includes(q))
      .slice(0, 5);
    const mats = Object.keys(account?.inventory || {})
      .map((k) => ({ type: 'mat', key: k, label: getMaterialMeta(k)?.name || k }))
      .filter((x) => x.label.toLowerCase().includes(q))
      .slice(0, 4);

    const hits = [...chars, ...mats];
    if (!hits.length) {
      closeJump();
      return;
    }
    menu.innerHTML = hits
      .map(
        (h) =>
          `<button type="button" class="proto-jump-item" role="option" data-jtype="${h.type}" data-jkey="${esc(h.key)}" data-jlabel="${esc(h.label)}"><span>${esc(h.label)}</span><span class="muted">${h.type === 'char' ? 'Characters' : 'Vault'}</span></button>`
      )
      .join('');
    menu.hidden = false;
    input.setAttribute('aria-expanded', 'true');

    menu.querySelectorAll('.proto-jump-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        closeJump();
        input.value = '';
        if (btn.dataset.jtype === 'char') {
          state.inspectedCharKey = btn.dataset.jkey;
          setActiveTab('roster');
        } else {
          state.vaultCategory = 'All';
          state.vaultSearch = btn.dataset.jlabel;
          setActiveTab('vault');
        }
      });
    });
  });

  input.addEventListener('keydown', (e) => {
    if (menu.hidden) return;
    const opts = [...menu.querySelectorAll('.proto-jump-item')];
    if (e.key === 'Escape') {
      closeJump();
    } else if (e.key === 'ArrowDown' && opts.length) {
      e.preventDefault();
      jumpIdx = (jumpIdx + 1) % opts.length;
      opts.forEach((o, i) => o.classList.toggle('is-selected', i === jumpIdx));
    } else if (e.key === 'ArrowUp' && opts.length) {
      e.preventDefault();
      jumpIdx = (jumpIdx - 1 + opts.length) % opts.length;
      opts.forEach((o, i) => o.classList.toggle('is-selected', i === jumpIdx));
    } else if (e.key === 'Enter' && jumpIdx >= 0 && opts[jumpIdx]) {
      e.preventDefault();
      opts[jumpIdx].click();
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.proto-search-wrap')) closeJump();
  });
}

function setupModals() {
  const bindBackdropModal = (modalId, openBtnIds, closeBtnId, onOpen) => {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    let lastTrigger = null;
    const ids = Array.isArray(openBtnIds) ? openBtnIds : [openBtnIds];
    const open = (trigger) => {
      lastTrigger = trigger || document.activeElement;
      if (onOpen) onOpen();
      modal.hidden = false;
      const focusTarget = modal.querySelector('button, input, select, textarea, [href]');
      focusTarget?.focus();
    };
    const close = () => {
      modal.hidden = true;
      lastTrigger?.focus?.();
    };
    modal._closeModal = close;
    ids.forEach((id) => {
      document.getElementById(id)?.addEventListener('click', (e) => open(e.currentTarget));
    });
    document.getElementById(closeBtnId)?.addEventListener('click', close);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
    modal.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' || modal.hidden) return;
      const focusables = [...modal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]')];
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
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.hidden) close();
    });
  };

  bindBackdropModal('proto-server-modal', 'proto-server-btn', 'proto-close-server');
  document.querySelectorAll('[data-pserver]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.serverId = btn.dataset.pserver;
      if (state.sessionUser) localStorage.setItem(`aaru_server_${state.sessionUser}`, state.serverId);
      document.getElementById('proto-server-modal')._closeModal?.();
      updateChrome();
      renderActiveView();
    });
  });

  bindBackdropModal('proto-system-modal', ['proto-open-system', 'proto-mobile-menu-btn'], 'proto-close-system', () => {
    const st = getCatalogStatus();
    const body = document.getElementById('proto-system-body');
    if (!body) return;
    const acctOpts = document.getElementById('proto-account-select')?.innerHTML || '';
    body.innerHTML = `
      <div class="p-row"><span>Catalog Source</span><strong class="mono">${esc(st.source || 'snapshot')}</strong></div>
      <div class="p-row"><span>Version</span><strong class="mono">${esc(st.lunarisVer || '—')}</strong></div>
      <button type="button" id="p-refresh-cat" class="p-btn p-btn-outline">Refresh Live Catalog</button>
      <div style="border-top:1px solid var(--p-border);padding-top:12px;display:flex;flex-direction:column;gap:8px;">
        <label class="proto-field">
          <span>Account View</span>
          <select id="p-modal-acct-select" class="proto-select">${acctOpts}</select>
        </label>
        <button type="button" id="p-modal-import-btn" class="p-btn p-btn-primary">+ Import GOOD</button>
        <div style="display:flex;gap:8px;">
          <a href="./index.html?preview=1" class="p-btn p-btn-outline" style="flex:1;">Classic UI</a>
          <button type="button" id="p-modal-logout-btn" class="p-btn p-btn-outline" style="flex:1;">Sign out</button>
        </div>
      </div>
  `;
    document.getElementById('p-refresh-cat')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Refreshing...';
      try {
        await refreshLiveCatalog();
        renderActiveView();
        showToast('Catalog refreshed');
      } catch (err) {
        showToast(`Catalog refresh failed: ${err.message}`);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Refresh Live Catalog';
      }
    });
    document.getElementById('p-modal-acct-select')?.addEventListener('change', (e) => {
      const sideSel = document.getElementById('proto-account-select');
      if (sideSel) {
        sideSel.value = e.target.value;
        sideSel.dispatchEvent(new Event('change'));
      }
      document.getElementById('proto-system-modal')._closeModal?.();
    });
    document.getElementById('p-modal-import-btn')?.addEventListener('click', () => {
      document.getElementById('proto-system-modal')._closeModal?.();
      document.getElementById('proto-open-import')?.click();
    });
    document.getElementById('p-modal-logout-btn')?.addEventListener('click', () => {
      document.getElementById('proto-system-modal')._closeModal?.();
      document.getElementById('proto-logout')?.click();
    });
  });

  bindBackdropModal('proto-import-modal', 'proto-open-import', 'proto-close-import');
  const dropzone = document.getElementById('proto-dropzone');
  const fileInput = document.getElementById('proto-file-input');
  const pasteArea = document.getElementById('proto-good-paste');
  const previewBox = document.getElementById('proto-import-preview');
  const commitBtn = document.getElementById('proto-commit-import');

  const processRaw = (rawText) => {
    try {
      const parsed = JSON.parse(rawText);
      const check = validateGoodV3(parsed);
      if (!check.valid) throw new Error(check.error || 'Invalid GOOD v3 payload');
      const diff = computeGoodImportDiff(state.ownAccount, parsed);
      state.pendingGoodImport = { raw: parsed, diff };
      previewBox.innerHTML = `<div class="p-badge p-badge-mint">${diff.charChanges.length} character updates · ${diff.matChanges.length} material updates</div>`;
      commitBtn.disabled = false;
    } catch (err) {
      state.pendingGoodImport = null;
      previewBox.innerHTML = `<div class="text-coral">${esc(err.message)}</div>`;
      commitBtn.disabled = true;
    }
  };

  dropzone?.addEventListener('click', () => fileInput?.click());
  dropzone?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput?.click();
    }
  });
  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('is-dragover');
  });
  dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('is-dragover'));
  dropzone?.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropzone.classList.remove('is-dragover');
    const f = e.dataTransfer?.files?.[0];
    if (f) processRaw(await f.text());
  });
  fileInput?.addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (f) processRaw(await f.text());
  });
  pasteArea?.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    if (!val) {
      state.pendingGoodImport = null;
      previewBox.innerHTML = '';
      commitBtn.disabled = true;
      return;
    }
    processRaw(val);
  });
  commitBtn?.addEventListener('click', async () => {
    if (!state.pendingGoodImport || isReadOnly()) return;
    const { raw, diff } = state.pendingGoodImport;
    commitBtn.disabled = true;
    commitBtn.textContent = 'Syncing...';
    try {
      await commitGoodImport(state.sessionUser, raw, diff.mergedAccount);
      state.ownAccount = diff.mergedAccount;
      document.getElementById('proto-import-modal')._closeModal?.();
      renderActiveView();
      showToast('GOOD v3 imported & synced');
    } catch (err) {
      showToast(`Import failed: ${err.message}`);
    } finally {
      commitBtn.disabled = false;
      commitBtn.textContent = 'Confirm & Sync';
    }
  });
}

async function bootstrap() {
  try {
    await loadCatalog();
  } catch (err) {
    showToast(`Catalog load warning: ${err.message}`);
  }

  document.querySelectorAll('[data-ptab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.inspectedCharKey = null;
      setActiveTab(btn.dataset.ptab);
    });
  });

  document.getElementById('proto-account-select')?.addEventListener('change', async (e) => {
    const target = e.target.value;
    try {
      if (target === state.sessionUser) {
        state.viewingPartner = false;
        setReadOnlyViewState(false);
      } else if (state.isPreviewDemo) {
        state.partnerUser = target;
        state.partnerAccount = cloneMockAccount(target);
        state.viewingPartner = true;
        setReadOnlyViewState(true);
      } else {
        const res = await fetchPartnerAccount(target);
        state.partnerUser = target;
        state.partnerAccount = res.account;
        state.viewingPartner = true;
        setReadOnlyViewState(true);
      }
      updateChrome();
      renderActiveView();
    } catch (err) {
      showToast(`Account switch failed: ${err.message}`);
      populateAccountSelect();
    }
  });

  document.getElementById('proto-logout')?.addEventListener('click', () => {
    state.isPreviewDemo = false;
    state.sessionUser = null;
    state.ownAccount = null;
    state.partnerAccount = null;
    state.partnerUser = null;
    state.inspectedCharKey = null;
    logoutAccount();
    sessionStorage.removeItem(SESSION_KEY);
    document.getElementById('proto-shell').hidden = true;
    document.getElementById('proto-login').hidden = false;
  });

  const enterPreviewSession = async (username = 'luna') => {
    const mock = cloneMockAccount(username);
    if (!mock) return;
    state.isPreviewDemo = true;
    await applySession({
      user: username,
      account: mock,
      visibleUsers: Object.keys(MOCK_ACCOUNTS)
    });
  };

  document.getElementById('proto-login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = document.getElementById('proto-username').value.trim();
    const pass = document.getElementById('proto-password').value;
    const errEl = document.getElementById('proto-login-error');
    const submitBtn = document.getElementById('proto-login-submit');
    if (errEl) errEl.textContent = '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in...';
    }
    try {
      state.isPreviewDemo = false;
      const res = await loginAccount(user, pass);
      const userKey = res.account?.user || res.user || user;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ user: userKey }));
      await applySession(res);
    } catch (err) {
      if (errEl) errEl.textContent = err.message;
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In';
      }
    }
  });

  document.querySelectorAll('[data-proto-quick]').forEach((btn) => {
    btn.addEventListener('click', () => enterPreviewSession(btn.dataset.protoQuick || 'luna'));
  });

  setupQuickJump();
  setupModals();

  // Restore real session first; only fall back to ?preview=1 demo if not signed in
  const params = new URLSearchParams(window.location.search);
  try {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) {
      const { user } = JSON.parse(saved);
      if (user) {
        const cached = getCachedAccountSession(user);
        if (cached) {
          await applySession(cached);
          if (!isOfflineMode()) {
            restoreAccountSession(user)
              .then((fresh) => {
                if (state.sessionUser === user && fresh?.account) applySession(fresh);
              })
              .catch(() => {});
          }
          return;
        }
        const fresh = await restoreAccountSession(user);
        await applySession(fresh);
        return;
      }
    }
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
  }

  if (params.get('preview') === '1') {
    await enterPreviewSession('luna');
    return;
  }

  document.getElementById('proto-login').hidden = false;
}

bootstrap();
