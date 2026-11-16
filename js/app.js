import { getCatalogStatus, getCharacterMeta, loadCatalog, refreshLiveCatalog } from './catalog.js?v=20261115ag';
import { getServerResetInfo, SERVER_REGIONS, sortAndLabelPrefarmQueue } from './calculations.js?v=20261114w';
import {
  fetchPartnerAccount,
  isOfflineMode,
  loginAccount,
  logoutAccount,
  restoreAccountSession,
  saveAccountSection,
  setReadOnlyViewState,
  updateProfileSettings,
  upsertRosterRow
} from './api.js?v=20261115y';
import { bindAdminInviteButton, initInviteRegistration } from './auth.js?v=20261115y';
import {
  commitGoodImport,
  computeGoodImportDiff,
  validateGoodV3
} from './good-importer.js';
import { renderHudTab } from './ui-hud.js?v=20261114w';
import { renderVaultTab } from './ui-vault.js';
import { renderPrefarmTab } from './ui-prefarm.js?v=20261115h';
import { renderRosterTab } from './ui-roster.js?v=20261115ah';
import { renderArmoryTab } from './ui-armory.js?v=20261115v';
import { renderTeamsTab } from './ui-teams.js?v=20261115ah';
import { CHANGELOG } from './changelog.js?v=20261115ab';

const SESSION_KEY = 'genshin_sheet_session_v1';
const VALID_TABS = new Set(['hud', 'vault', 'prefarm', 'roster', 'armory', 'teams', 'changelog']);

function getTabFromHash() {
  const raw = window.location.hash.replace(/^#/, '').trim().toLowerCase();
  return VALID_TABS.has(raw) ? raw : 'hud';
}

const state = {
  sessionUser: null, // authenticated account key
  ownAccount: null,
  partnerAccount: null,
  partnerUser: null,
  viewingPartner: false,
  viewMode: 'owner',
  visibleUsers: [],
  activeTab: getTabFromHash(), // 'hud' | 'vault' | 'prefarm' | 'roster' | 'teams' | 'changelog'
  serverId: 'NA',
  hudDayOverride: null,
  hudShowAllDomains: false,
  vaultFilter: { category: 'All', search: '', lowStockOnly: false },
  rosterFilter: {
    status: 'All',
    element: 'All',
    sortBy: 'priority',
    density: 'grid',
    search: '',
    inspectedKey: null,
    dossierTab: 'loadout',
    tiers: { active: true, built: true, archive: false }
  },
  armoryFilter: {
    weaponType: 'All',
    filter: 'all',
    sortBy: 'level',
    density: 'grid',
    search: ''
  },
  pendingGoodImport: null // { raw, diff }
};

function isAdminUser() {
  return (
    state.ownAccount?.role === 'admin' ||
    Boolean(state.ownAccount?.isAdmin) ||
    state.sessionUser === 'almondeluna'
  );
}

function isReadOnlyMode() {
  return (
    state.viewingPartner ||
    state.viewMode === 'readonly' ||
    Boolean(state.partnerUser && state.partnerUser !== state.sessionUser)
  );
}

function getActiveAccount() {
  return isReadOnlyMode() && state.partnerAccount ? state.partnerAccount : state.ownAccount;
}

function setActiveTab(tab, { pushHash = true } = {}) {
  const next = VALID_TABS.has(tab) ? tab : 'hud';
  state.activeTab = next;
  if (pushHash && window.location.hash !== `#${next}`) {
    window.location.hash = `#${next}`;
  }
  updateTopBar();
  renderActiveTab();
}

function showToast(message, tone = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast is-visible tone-${tone}`;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.className = 'toast';
  }, 3200);
}

function updateTopBar() {
  const cfg = window.GENSHIN_SHEET_CONFIG;
  const userMeta = cfg?.ACCOUNTS?.[state.sessionUser];
  const ownDisplayName = state.ownAccount?.displayName || userMeta?.displayName || 'Account';
  const partnerName = state.partnerAccount?.displayName || 'User';

  const badgeEl = document.getElementById('active-user-badge');
  if (badgeEl) {
    badgeEl.textContent = state.sessionUser ? ownDisplayName.toUpperCase() : '';
  }

  const modeBadge = document.getElementById('sync-mode-badge');
  if (modeBadge) {
    modeBadge.textContent = isOfflineMode() ? 'OFFLINE / MOCK' : 'APPS SCRIPT SYNC';
    modeBadge.className = `pill mono ${isOfflineMode() ? 'pill-gold' : 'pill-mint'}`;
  }

  const inviteBtn = document.getElementById('btn-create-invite');
  if (inviteBtn) {
    inviteBtn.hidden = !state.sessionUser || !isAdminUser();
  }

  const switcher = document.getElementById('account-switcher');
  if (switcher) {
    const others = (state.visibleUsers || []).filter(
      (u) => u && u.user && u.user !== state.sessionUser && u.isPublic !== false
    );
    const options = [`<option value="">${ownDisplayName} (You)</option>`];
    others.forEach((u) => {
      options.push(`<option value="${u.user}">View ${u.displayName} (Read-Only)</option>`);
    });
    switcher.innerHTML = options.join('');
    switcher.value = state.viewingPartner && state.partnerUser ? state.partnerUser : '';
    switcher.hidden = options.length <= 1;
    switcher.classList.toggle('is-active', state.viewingPartner);
  }

  const importBtn = document.getElementById('btn-open-import');
  if (importBtn) {
    importBtn.disabled = state.viewingPartner;
  }

  const roBanner = document.getElementById('readonly-banner');
  if (roBanner) {
    roBanner.hidden = !state.viewingPartner;
    if (state.viewingPartner) {
      roBanner.textContent = `READ-ONLY VIEW — Inspecting ${partnerName}'s sheet. Editing & Imports are locked.`;
    }
  }

  document.querySelectorAll('[data-tab-btn]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tabBtn === state.activeTab);
  });

  const crumbMap = {
    hud: 'AARUDB / CENTRAL HUD',
    vault: 'AARUDB / INVENTORY VAULT',
    prefarm: 'AARUDB / PREFARM QUEUE',
    roster: 'AARUDB / ROSTER',
    armory: 'AARUDB / ARMORY',
    teams: 'AARUDB / TEAM COMPS',
    changelog: 'AARUDB / FIXES & FEATS'
  };
  const crumbEl = document.getElementById('topbar-breadcrumb');
  if (crumbEl) crumbEl.textContent = crumbMap[state.activeTab] || 'AARUDB';

  const srvBtn = document.getElementById('btn-server-trigger');
  if (srvBtn) {
    const rInfo = getServerResetInfo(state.serverId || 'NA');
    srvBtn.textContent = `${rInfo.server.short} · RESETS IN ${rInfo.countdownText.toUpperCase()}`;
  }

  const sysDot = document.getElementById('system-status-dot');
  if (sysDot) {
    const src = getCatalogStatus().source;
    sysDot.className = `status-dot ${src === 'live' ? 'is-live' : src === 'cache' ? 'is-cache' : 'is-snapshot'}`;
    sysDot.title = `Catalog source: ${src.toUpperCase()}`;
  }
}

function renderActiveTab(options = {}) {
  const prevScrollY = options.preserveScroll ? window.scrollY : null;
  const account = getActiveAccount();
  if (!account) return;

  // Strictly show active tab only
  document.querySelectorAll('.tab-view').forEach((sec) => {
    const isActive = sec.dataset.tab === state.activeTab;
    sec.hidden = !isActive;
    sec.classList.toggle('active', isActive);
  });

  const viewState = {
    account,
    isReadOnly: isReadOnlyMode(),
    viewMode: state.viewMode,
    serverId: state.serverId,
    hudDayOverride: state.hudDayOverride,
    hudShowAllDomains: state.hudShowAllDomains,
    vaultFilter: state.vaultFilter,
    rosterFilter: state.rosterFilter,
    armoryFilter: state.armoryFilter
  };

  const container = document.querySelector(`.tab-view[data-tab="${state.activeTab}"]`);
  if (!container) return;

  if (state.activeTab === 'hud') {
    renderHudTab(container, viewState, {
      onChangeHudDay: (day) => {
        state.hudDayOverride = day;
        renderActiveTab();
      },
      onToggleAllDomains: () => {
        state.hudShowAllDomains = !state.hudShowAllDomains;
        renderActiveTab();
      },
      onUpdateWallet: async (field, val) => {
        state.ownAccount.wallet = { ...(state.ownAccount.wallet || {}), [field]: val };
        await saveAccountSection(state.sessionUser, 'wallet', state.ownAccount.wallet);
        renderActiveTab({ preserveScroll: true });
        showToast(`Updated ${field}`, 'mint');
      },
      onUpdateWalletPatch: async (patch, toastMsg = 'Updated Resin') => {
        state.ownAccount.wallet = { ...(state.ownAccount.wallet || {}), ...patch };
        await saveAccountSection(state.sessionUser, 'wallet', state.ownAccount.wallet);
        renderActiveTab({ preserveScroll: true });
        showToast(toastMsg, 'mint');
      },
      onToggleChecklist: async (group, id, done) => {
        const list = state.ownAccount.checklist?.[group] || [];
        const item = list.find((i) => i.id === id);
        if (item) item.done = done;
        await saveAccountSection(state.sessionUser, 'checklist', state.ownAccount.checklist);
        renderActiveTab({ preserveScroll: true });
      },
      onNavigateTab: (tab) => {
        setActiveTab(tab);
      },
      onOpenServerModal: () => openServerModal()
    });
  } else if (state.activeTab === 'vault') {
    renderVaultTab(container, viewState, {
      onChangeVaultFilter: (patch, opts) => {
        state.vaultFilter = { ...state.vaultFilter, ...patch };
        renderActiveTab(opts);
      },
      onInventoryRowSaved: (key, payload) => {
        state.ownAccount.inventory[key] = payload;
        if (key === 'Mora') {
          state.ownAccount.wallet.mora = payload.count;
        }
      }
    });
  } else if (state.activeTab === 'prefarm') {
    renderPrefarmTab(container, viewState, {
      onAddPrefarmTarget: async (target) => {
        const queue = state.ownAccount.prefarmQueue || [];
        const charName = getCharacterMeta(target.characterKey).name || target.characterKey;
        if (queue.some((t) => t.characterKey === target.characterKey)) {
          showToast(`You've already added ${charName} to the Prefarm Queue.`, 'coral');
          return;
        }
        const uid = `pf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const tier = Math.max(1, Number(target.tier) || 1);
        const nextQueue = sortAndLabelPrefarmQueue([
          ...queue,
          { id: uid, rank: queue.length + 1, ...target, tier }
        ]);
        state.ownAccount.prefarmQueue = nextQueue;
        await saveAccountSection(state.sessionUser, 'prefarmQueue', nextQueue);
        renderActiveTab();
        showToast(`Added ${charName} to Tier #${tier}`, 'mint');
      },
      onMovePrefarmTarget: async (id, dir) => {
        const queue = sortAndLabelPrefarmQueue(state.ownAccount.prefarmQueue || []);
        const idx = queue.findIndex((t) => String(t.id) === String(id));
        if (idx === -1) return;
        const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= queue.length) return;
        if (queue[idx].tier !== queue[swapIdx].tier) return;
        [queue[idx], queue[swapIdx]] = [queue[swapIdx], queue[idx]];
        queue.forEach((t, i) => (t.rank = i + 1));
        const normalized = sortAndLabelPrefarmQueue(queue);
        state.ownAccount.prefarmQueue = normalized;
        renderActiveTab();
        await saveAccountSection(state.sessionUser, 'prefarmQueue', normalized);
      },
      onRemovePrefarmTarget: async (id, fallbackRank) => {
        const prev = sortAndLabelPrefarmQueue(state.ownAccount.prefarmQueue || []);
        const queue = sortAndLabelPrefarmQueue(
          prev
            .filter((t, i) => {
              if (t.id !== undefined && t.id !== null && String(t.id) !== '') {
                return String(t.id) !== String(id);
              }
              return Number(t.rank ?? i + 1) !== Number(fallbackRank);
            })
            .map((t, i) => ({ ...t, id: t.id || `pf-${Date.now()}-${i}` }))
        );
        state.ownAccount.prefarmQueue = queue;
        renderActiveTab();
        showToast('Removed target from Prefarm Queue', 'mint');
        try {
          await saveAccountSection(state.sessionUser, 'prefarmQueue', queue);
        } catch (err) {
          showToast(err?.message || 'Failed to sync removal', 'coral');
        }
      },
      onEditPrefarmTarget: async (id, field, val) => {
        const target = (state.ownAccount.prefarmQueue || []).find((t) => String(t.id) === String(id));
        if (!target) return;
        if (field === 'tier') target.tier = Math.min(10, Math.max(1, val));
        else if (field === 'currentLevel') target.currentLevel = Math.min(95, Math.max(1, val));
        else if (field === 'targetLevel') target.targetLevel = Math.min(95, Math.max(1, val));
        else if (field === 'tAuto') target.targetTalent.auto = Math.min(10, Math.max(1, val));
        else if (field === 'tSkill') target.targetTalent.skill = Math.min(10, Math.max(1, val));
        else if (field === 'tBurst') target.targetTalent.burst = Math.min(10, Math.max(1, val));
        else if (field === 'weaponKey') {
          target.weaponKey = val || '';
          if (target.weaponKey && !target.weaponTargetLevel) {
            target.weaponCurrentLevel = 1;
            target.weaponTargetLevel = 90;
          }
        } else if (field === 'weaponCurrentLevel') target.weaponCurrentLevel = Math.min(90, Math.max(1, val));
        else if (field === 'weaponTargetLevel') target.weaponTargetLevel = Math.min(90, Math.max(1, val));
        state.ownAccount.prefarmQueue = sortAndLabelPrefarmQueue(state.ownAccount.prefarmQueue || []);
        renderActiveTab();
        await saveAccountSection(state.sessionUser, 'prefarmQueue', state.ownAccount.prefarmQueue);
      }
    });
  } else if (state.activeTab === 'roster') {
    renderRosterTab(container, viewState, {
      onChangeRosterFilter: (patch, opts) => {
        state.rosterFilter = { ...state.rosterFilter, ...patch };
        if (!opts?.silent) renderActiveTab(opts);
      },
      onRefreshView: () => renderActiveTab({ preserveScroll: true }),
      onUpdateCharacterField: async (charKey, field, val) => {
        const ch = (state.ownAccount.characters || []).find((c) => c.key === charKey);
        if (!ch) return;
        ch[field] = val;
        await saveAccountSection(state.sessionUser, 'characters', state.ownAccount.characters);
        renderActiveTab();
        showToast(`Updated ${charKey}`, 'mint');
      },
      onSaveCharacterInspector: async (charKey, updates) => {
        state.ownAccount.characters = state.ownAccount.characters || [];
        let ch = state.ownAccount.characters.find((c) => c.key === charKey);
        if (!ch) {
          ch = {
            key: charKey,
            owned: updates.status !== 'Unowned',
            level: 1,
            constellation: 0,
            ascension: 0,
            talent: { auto: 1, skill: 1, burst: 1 },
            targetLevel: 90,
            targetTalents: '9/9/9',
            status: 'Bench',
            priorityRank: '',
            notes: ''
          };
          state.ownAccount.characters.push(ch);
        }

        ch.status = updates.status;
        ch.owned = updates.status !== 'Unowned';
        ch.level = updates.level;
        ch.targetLevel = updates.targetLevel;
        ch.priorityRank = updates.priorityRank;
        ch.talent = { ...updates.talent };
        if (updates.targetTalents) ch.targetTalents = updates.targetTalents;
        ch.notes = updates.notes;

        await upsertRosterRow(state.sessionUser, charKey, {
          owned: ch.owned,
          level: ch.level,
          target_lvl: ch.targetLevel,
          priority_rank: ch.priorityRank,
          talent_auto: ch.talent.auto,
          talent_skill: ch.talent.skill,
          talent_burst: ch.talent.burst,
          target_talents: ch.targetTalents || '9/9/9',
          status: ch.status,
          notes: ch.notes
        });
        renderActiveTab();
        showToast(`Saved ${charKey} to Roster`, 'mint');
      }
    });
  } else if (state.activeTab === 'armory') {
    renderArmoryTab(container, viewState, {
      onChangeArmoryFilter: (patch) => {
        state.armoryFilter = { ...state.armoryFilter, ...patch };
        renderActiveTab({ preserveScroll: true });
      }
    });
  } else if (state.activeTab === 'teams') {
    renderTeamsTab(container, viewState, {
      onUpdateTeamRole: async (teamId, memberIdx, roleOverride) => {
        const team = (state.ownAccount.teams || []).find((t) => t.id === teamId);
        if (!team || !team.members[memberIdx]) return;
        team.members[memberIdx].roleOverride = roleOverride || '';
        await saveAccountSection(state.sessionUser, 'teams', state.ownAccount.teams);
        renderActiveTab();
      },
      onUpdateTeamWeapon: async (teamId, memberIdx, weaponId, weaponKey) => {
        const team = (state.ownAccount.teams || []).find((t) => t.id === teamId);
        if (!team || !team.members[memberIdx]) return;
        team.members[memberIdx].weaponId = weaponId;
        team.members[memberIdx].weaponKey = weaponKey;
        await saveAccountSection(state.sessionUser, 'teams', state.ownAccount.teams);
        renderActiveTab();
      },
      onUpdateTeamLab: async (teamId, field, val) => {
        const team = (state.ownAccount.teams || []).find((t) => t.id === teamId);
        if (!team) return;
        team.testLab = { ...(team.testLab || {}), [field]: val };
        await saveAccountSection(state.sessionUser, 'teams', state.ownAccount.teams);
        showToast('Saved Test Lab note', 'mint');
      },
      onRemoveTeam: async (teamId) => {
        state.ownAccount.teams = (state.ownAccount.teams || []).filter((t) => t.id !== teamId);
        await saveAccountSection(state.sessionUser, 'teams', state.ownAccount.teams);
        renderActiveTab();
      }
    });
  } else if (state.activeTab === 'changelog') {
    renderFixesAndFeatsPage(container);
  }

  if (options?.preserveFocusSelector) {
    const el = container.querySelector(options.preserveFocusSelector);
    if (el) {
      el.focus();
      const len = el.value?.length || 0;
      el.setSelectionRange?.(len, len);
    }
  }
  if (prevScrollY !== null) {
    window.scrollTo(0, prevScrollY);
  }
}

function switchToAppView() {
  document.getElementById('login-screen').hidden = true;
  document.getElementById('app-shell').hidden = false;
  updateTopBar();
  renderActiveTab();
}

function switchToLoginView() {
  document.getElementById('login-screen').hidden = false;
  document.getElementById('app-shell').hidden = true;
  const restoreEl = document.getElementById('session-restore-screen');
  if (restoreEl) restoreEl.hidden = true;
}

function switchToRestoringView() {
  document.getElementById('login-screen').hidden = true;
  document.getElementById('app-shell').hidden = true;
  const restoreEl = document.getElementById('session-restore-screen');
  if (restoreEl) restoreEl.hidden = false;
}

function applyAuthenticatedSession(res) {
  state.sessionUser = res.account.user;
  state.ownAccount = res.account;
  state.viewingPartner = false;
  state.viewMode = 'owner';
  setReadOnlyViewState(false);
  state.partnerAccount = null;
  state.partnerUser = null;
  const fallbackUsers = Object.values(window.GENSHIN_SHEET_CONFIG?.ACCOUNTS || {}).map((a) => ({
    user: a.username,
    displayName: a.displayName,
    isPublic: true
  }));
  state.visibleUsers = Array.isArray(res.visibleUsers) && res.visibleUsers.length > 0
    ? res.visibleUsers
    : fallbackUsers;
  state.activeTab = getTabFromHash();

  const savedServer = localStorage.getItem(`aaru_server_${state.sessionUser}`);
  state.serverId = savedServer && SERVER_REGIONS[savedServer] ? savedServer : 'NA';

  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ user: state.sessionUser }));
  const restoreEl = document.getElementById('session-restore-screen');
  if (restoreEl) restoreEl.hidden = true;
  switchToAppView();
  showToast(`Signed in as ${res.account.displayName} (${res.mode} mode)`, 'mint');

  if (!savedServer) {
    openServerModal();
  }
}

async function handleLogin(username, passphrase = '') {
  const errEl = document.getElementById('login-error');
  const submitBtn = document.getElementById('login-submit-btn');
  const userInput = document.getElementById('login-username');
  const passInput = document.getElementById('login-passphrase');
  if (errEl) errEl.textContent = '';

  const origLabel = submitBtn?.textContent || 'Enter AaruDB';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="btn-spinner"></span> Authenticating...';
  }
  if (userInput) userInput.disabled = true;
  if (passInput) passInput.disabled = true;

  try {
    const res = await loginAccount(username, passphrase);
    applyAuthenticatedSession(res);
  } catch (err) {
    if (errEl) errEl.textContent = err.message;
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = origLabel;
    }
    if (userInput) userInput.disabled = false;
    if (passInput) passInput.disabled = false;
  }
}

function setupGoodImportModal() {
  const modal = document.getElementById('import-modal');
  const dropzone = document.getElementById('good-dropzone');
  const fileInput = document.getElementById('good-file-input');
  const pasteArea = document.getElementById('good-paste-input');
  const previewBox = document.getElementById('good-diff-preview');
  const commitBtn = document.getElementById('btn-commit-import');

  const closeModal = () => {
    modal.hidden = true;
    state.pendingGoodImport = null;
    previewBox.innerHTML = '';
    commitBtn.disabled = true;
  };

  const processRawJson = (rawText) => {
    try {
      const parsed = JSON.parse(rawText);
      validateGoodV3(parsed);
      const diff = computeGoodImportDiff(state.ownAccount, parsed);
      state.pendingGoodImport = { raw: parsed, diff };

      previewBox.innerHTML = `
        <div class="diff-summary">
          <div class="diff-stat"><span class="mono">SOURCE</span><strong>${diff.source} (v${diff.version})</strong></div>
          <div class="diff-stat"><span class="mono">CHARACTERS</span><strong class="text-gold">${diff.charChanges.length} changes</strong> / ${diff.charactersTotal} total</div>
          <div class="diff-stat"><span class="mono">WEAPONS</span><strong class="text-mint">${diff.weaponChanges.length} changes</strong> / ${diff.weaponsTotal} total</div>
          <div class="diff-stat"><span class="mono">ARTIFACTS</span><strong class="text-cyan">${diff.equippedArtifactsCount || 0} equipped</strong> / ${diff.artifactsTotal || 0} total</div>
          <div class="diff-stat"><span class="mono">MATERIALS</span><strong>${diff.matChanges.length} synced</strong> / ${diff.materialsTotal} total</div>
        </div>
        <div class="diff-samples mono">
          ${diff.charChanges.slice(0, 6).map((c) => `<div>CHAR [${c.type.toUpperCase()}]: ${c.key} ${c.fromLevel ? `Lv.${c.fromLevel} → ` : ''}Lv.${c.toLevel}</div>`).join('')}
          ${diff.matChanges.slice(0, 4).map((m) => `<div>MAT: ${m.key} ${m.from ?? 0} → ${m.to}</div>`).join('')}
        </div>
      `;
      commitBtn.disabled = false;
    } catch (err) {
      state.pendingGoodImport = null;
      commitBtn.disabled = true;
      previewBox.innerHTML = `<div class="error-text">${err.message}</div>`;
    }
  };

  document.getElementById('btn-open-import')?.addEventListener('click', () => {
    if (state.viewingPartner) return;
    modal.hidden = false;
  });
  document.getElementById('btn-close-import')?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  dropzone?.addEventListener('click', () => fileInput?.click());
  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('is-dragover');
  });
  dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('is-dragover'));
  dropzone?.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropzone.classList.remove('is-dragover');
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      const text = await file.text();
      processRawJson(text);
    }
  });

  fileInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const text = await file.text();
      processRawJson(text);
    }
  });

  pasteArea?.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    if (val.startsWith('{')) processRawJson(val);
  });

  commitBtn?.addEventListener('click', async () => {
    if (!state.pendingGoodImport || isReadOnlyMode()) return;
    commitBtn.disabled = true;
    commitBtn.textContent = 'Syncing...';
    try {
      const { raw, diff } = state.pendingGoodImport;
      await commitGoodImport(state.sessionUser, raw, diff.mergedAccount);
      const mats = raw?.materials || {};
      if (
        typeof mats.Mora === 'number' ||
        typeof mats.IntertwinedFate === 'number' ||
        typeof mats.AcquaintFate === 'number'
      ) {
        await saveAccountSection(state.sessionUser, 'wallet', diff.mergedAccount.wallet);
      }
      state.ownAccount = diff.mergedAccount;
      closeModal();
      renderActiveTab();
      showToast(`Imported GOOD v3 (${diff.charChanges.length} chars, ${diff.matChanges.length} mats)`, 'mint');
    } catch (err) {
      showToast(`Import failed: ${err.message}`, 'coral');
      commitBtn.disabled = false;
    } finally {
      commitBtn.textContent = 'Confirm & Sync to Sheet';
    }
  });
}

function setupSystemDrawer() {
  const backdrop = document.getElementById('system-drawer-backdrop');
  const body = document.getElementById('system-drawer-body');
  const openBtn = document.getElementById('btn-system-drawer');
  const closeBtn = document.getElementById('btn-close-drawer');
  if (!backdrop || !body || !openBtn) return;

  const renderDrawer = () => {
    const st = getCatalogStatus();
    const sourceBadge =
      st.source === 'live'
        ? '<span class="pill pill-mint mono">LIVE API</span>'
        : st.source === 'cache'
          ? '<span class="pill pill-sky mono">CACHED LIVE</span>'
          : st.source === 'snapshot'
            ? '<span class="pill pill-gold mono">LOCAL SNAPSHOT</span>'
            : '<span class="pill pill-coral mono">MINIMAL FALLBACK</span>';
    const syncedText = st.syncedAt ? new Date(st.syncedAt).toLocaleString() : '—';
    const cacheText = st.cacheTs ? new Date(st.cacheTs).toLocaleString() : 'Not cached';
    const ownName = state.ownAccount?.displayName || '';
    const isPublic = state.ownAccount?.isPublic !== false;
    const admin = isAdminUser();

    body.innerHTML = `
      <div class="drawer-section">
        <div class="card-eyebrow">PROFILE &amp; PRIVACY</div>
        <label class="mini-field">
          <span>DISPLAY NAME</span>
          <input id="profile-display-name" type="text" maxlength="24" class="input-mono" value="${ownName.replace(/"/g, '&quot;')}" placeholder="Display Name" />
        </label>
        <label class="toggle-chip" style="margin-top:8px;">
          <input id="profile-is-public" type="checkbox" ${isPublic ? 'checked' : ''} />
          <span>Allow other users to view my sheet (Read-Only)</span>
        </label>
        <button type="button" id="btn-save-profile" class="btn btn-outline btn-sm" style="width:100%;margin-top:10px;">
          Save Profile Settings
        </button>
      </div>

      <div class="drawer-section">
        <div class="card-eyebrow">DATA VERSION &amp; SOURCE</div>
        <div class="drawer-stat-row">
          <span>Active Source</span>
          ${sourceBadge}
        </div>
        <div class="drawer-stat-row mono">
          <span>API / Patch Version</span>
          <strong class="text-gold">${st.lunarisVer}</strong>
        </div>
        <div class="drawer-stat-row mono">
          <span>Indexed Assets</span>
          <span>${st.charCount} chars · ${st.weaponCount} wpns · ${st.materialCount} mats</span>
        </div>
        <div class="drawer-stat-row mono">
          <span>Last Synced</span>
          <span>${syncedText}</span>
        </div>
        <div class="drawer-stat-row mono">
          <span>Browser Cache</span>
          <span>${cacheText}</span>
        </div>
      </div>

      ${admin ? `
      <div class="drawer-section">
        <div class="card-eyebrow">ADMIN · SYNC ACTIONS</div>
        <button type="button" id="btn-refresh-catalog" class="btn btn-gold" style="width:100%;">
          Check for API Updates &amp; Clear Cache
        </button>
        <p class="muted" style="font-size:12px;margin:8px 0 0;line-height:1.45;">
          Clears the browser catalog cache and re-fetches Project Amber &amp; Lunaris immediately. Falls back to <code>data/live-snapshot.json</code> if upstream APIs are down.
        </p>
      </div>

      <div class="drawer-section">
        <div class="card-eyebrow">AUTOMATED PATCH SNAPSHOTS</div>
        <p class="muted" style="font-size:12px;margin:0 0 10px;line-height:1.45;">
          GitHub Actions checks <code>lunaris.moe/data/version.json</code> every 12 hours and updates <code>data/live-snapshot.json</code> whenever a new patch or hotfix drops.
        </p>
        <a
          class="btn btn-outline btn-sm"
          style="display:inline-block;text-decoration:none;"
          href="https://github.com/lunasiagian/aaru-db/actions/workflows/sync-snapshot.yml"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open GitHub Actions Sync ↗
        </a>
      </div>
      ` : ''}
    `;

    body.querySelector('#btn-save-profile')?.addEventListener('click', async (e) => {
      if (!state.sessionUser || !state.ownAccount) return;
      const btn = e.currentTarget;
      const nextName = body.querySelector('#profile-display-name')?.value?.trim() || '';
      const nextPublic = Boolean(body.querySelector('#profile-is-public')?.checked);
      if (!nextName) {
        showToast('Display name cannot be empty.', 'coral');
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Saving...';
      try {
        const res = await updateProfileSettings(state.sessionUser, {
          displayName: nextName,
          isPublic: nextPublic
        });
        state.ownAccount.displayName = res.displayName || nextName;
        state.ownAccount.isPublic = res.isPublic !== undefined ? res.isPublic : nextPublic;
        if (Array.isArray(res.visibleUsers)) {
          state.visibleUsers = res.visibleUsers;
        }
        updateTopBar();
        renderDrawer();
        showToast('Profile settings saved.', 'mint');
      } catch (err) {
        showToast(err?.message || 'Failed to save profile settings', 'coral');
      } finally {
        if (btn.isConnected) {
          btn.disabled = false;
          btn.textContent = 'Save Profile Settings';
        }
      }
    });

    body.querySelector('#btn-refresh-catalog')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Refreshing Catalog...';
      try {
        const next = await refreshLiveCatalog();
        renderDrawer();
        renderActiveTab();
        showToast(`Catalog refreshed (${next.lunarisVer} · ${next.source.toUpperCase()})`, 'mint');
      } catch (err) {
        showToast(err?.message || 'Failed to refresh catalog', 'coral');
      } finally {
        if (btn.isConnected) {
          btn.disabled = false;
          btn.textContent = 'Check for API Updates & Clear Cache';
        }
      }
    });
  };

  openBtn.addEventListener('click', () => {
    renderDrawer();
    backdrop.hidden = false;
  });
  closeBtn?.addEventListener('click', () => {
    backdrop.hidden = true;
  });
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.hidden = true;
  });
}

function openServerModal() {
  const modal = document.getElementById('server-modal');
  if (!modal) return;
  modal.querySelectorAll('[data-server-choice]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.serverChoice === state.serverId);
  });
  modal.hidden = false;
}

function setupServerModal() {
  const modal = document.getElementById('server-modal');
  const closeBtn = document.getElementById('btn-close-server');
  if (!modal) return;

  const close = () => {
    modal.hidden = true;
  };
  document.getElementById('btn-server-trigger')?.addEventListener('click', openServerModal);
  closeBtn?.addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  modal.querySelectorAll('[data-server-choice]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const choice = btn.dataset.serverChoice;
      if (!SERVER_REGIONS[choice]) return;
      state.serverId = choice;
      state.hudDayOverride = null;
      if (state.sessionUser) {
        localStorage.setItem(`aaru_server_${state.sessionUser}`, choice);
      }
      close();
      updateTopBar();
      renderActiveTab();
      showToast(`Server set to ${SERVER_REGIONS[choice].label}`, 'mint');
    });
  });
}

function renderFixesAndFeatsPage(container) {
  const renderListBlock = (heading, badgeCls, items) => {
    if (!items?.length) return '';
    return `
      <div class="fixes-section">
        <div class="fixes-section-head">
          <span class="pill mono ${badgeCls}">${heading}</span>
        </div>
        <ol class="fixes-ordered">
          ${items.map((item) => `<li>${item}</li>`).join('')}
        </ol>
      </div>`;
  };

  container.innerHTML = `
    <div class="section-header">
      <div>
        <div class="eyebrow">AARUDB / RELEASE NOTES</div>
        <h1 class="section-title">Fixes &amp; Feats</h1>
        <p class="section-subtitle muted">Known bugs, recent fixes, and upcoming features.</p>
      </div>
      <div class="header-meta mono">
        LATEST: <span class="text-gold">${CHANGELOG[0]?.date || '—'}</span>
      </div>
    </div>

    <div class="fixes-page-list">
      ${CHANGELOG.map(
        (entry, idx) => `
        <article class="card changelog-entry ${idx === 0 ? 'is-latest' : ''}">
          <div class="changelog-entry-head">
            <div>
              <span class="pill mono ${idx === 0 ? 'pill-mint' : ''}">${entry.version}</span>
              <strong class="changelog-title">${entry.title}</strong>
            </div>
            <span class="mono muted" style="font-size:12px;">${entry.date}</span>
          </div>
          ${renderListBlock('Known Bugs & Issues', 'pill-coral', entry.knownBugs)}
          ${renderListBlock('Fixes', 'pill-mint', entry.fixes)}
          ${renderListBlock('Planned Features', 'pill-sky', entry.plannedFeatures)}
          ${
            entry.highlights?.length
              ? `<ul class="changelog-points">${entry.highlights.map((h) => `<li>${h}</li>`).join('')}</ul>`
              : ''
          }
        </article>`
      ).join('')}
    </div>
  `;
}

function initChangelogModal() {
  const btn = document.getElementById('btn-changelog');
  const dot = document.getElementById('changelog-dot');
  const latestVer = CHANGELOG[0]?.version || '';
  const seenVer = localStorage.getItem('aaru_changelog_seen');
  if (dot && latestVer && seenVer !== latestVer) {
    dot.hidden = false;
  }

  btn?.addEventListener('click', () => {
    if (latestVer) localStorage.setItem('aaru_changelog_seen', latestVer);
    if (dot) dot.hidden = true;
    setActiveTab('changelog');
  });
}

async function bootstrap() {
  let savedUser = null;
  try {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) savedUser = JSON.parse(saved)?.user || null;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
  }
  if (savedUser) {
    switchToRestoringView();
  }

  await loadCatalog();
  initChangelogModal();

  // Bind login form & quick-login buttons
  document.getElementById('login-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const user = document.getElementById('login-username').value;
    const pass = document.getElementById('login-passphrase').value;
    handleLogin(user, pass);
  });

  document.querySelectorAll('[data-quick-user]').forEach((btn) => {
    btn.addEventListener('click', () => handleLogin(btn.dataset.quickUser));
  });

  // Top-bar & rail navigation tabs
  document.querySelectorAll('[data-tab-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setActiveTab(btn.dataset.tabBtn);
    });
  });

  window.addEventListener('hashchange', () => {
    if (!state.sessionUser) return;
    setActiveTab(getTabFromHash(), { pushHash: false });
  });

  // Multi-user read-only account switcher
  document.getElementById('account-switcher')?.addEventListener('change', async (e) => {
    if (!state.sessionUser) return;
    const targetUser = e.currentTarget.value;
    if (!targetUser || targetUser === state.sessionUser) {
      state.viewingPartner = false;
      state.viewMode = 'owner';
      setReadOnlyViewState(false);
      state.partnerUser = null;
      updateTopBar();
      renderActiveTab();
      return;
    }
    try {
      state.partnerAccount = await fetchPartnerAccount(targetUser);
      state.partnerUser = targetUser;
      state.viewingPartner = true;
      state.viewMode = 'readonly';
      setReadOnlyViewState(true);
      updateTopBar();
      renderActiveTab();
      showToast(`Viewing ${state.partnerAccount.displayName}'s sheet (Read-Only)`, 'gold');
    } catch (err) {
      e.currentTarget.value = state.viewingPartner && state.partnerUser ? state.partnerUser : '';
      showToast(err.message, 'coral');
    }
  });

  // Logout
  document.getElementById('btn-logout')?.addEventListener('click', () => {
    logoutAccount();
    sessionStorage.removeItem(SESSION_KEY);
    state.sessionUser = null;
    state.ownAccount = null;
    state.partnerAccount = null;
    state.partnerUser = null;
    state.visibleUsers = [];
    state.viewingPartner = false;
    state.viewMode = 'owner';
    setReadOnlyViewState(false);
    switchToLoginView();
  });

  setupGoodImportModal();
  setupServerModal();
  setupSystemDrawer();
  bindAdminInviteButton({ isAdmin: isAdminUser, showToast });

  const registeredViaInvite = await initInviteRegistration({
    onAuthenticated: applyAuthenticatedSession,
    showToast
  });
  if (registeredViaInvite) {
    return;
  }

  // Restore session from sessionStorage
  try {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed?.user) {
        const res = await restoreAccountSession(parsed.user);
        applyAuthenticatedSession(res);
        return;
      }
    }
  } catch (err) {
    sessionStorage.removeItem(SESSION_KEY);
    console.warn('Session restore failed:', err);
  }
  switchToLoginView();
}

bootstrap();
