import { getCharacterMeta, loadCatalog } from './catalog.js';
import {
  fetchPartnerAccount,
  isOfflineMode,
  loginAccount,
  logoutAccount,
  restoreAccountSession,
  saveAccountSection,
  upsertRosterRow
} from './api.js';
import {
  commitGoodImport,
  computeGoodImportDiff,
  validateGoodV3
} from './good-importer.js';
import { renderHudTab } from './ui-hud.js';
import { renderVaultTab } from './ui-vault.js';
import { renderPrefarmTab } from './ui-prefarm.js';
import { renderRosterTab } from './ui-roster.js';
import { renderTeamsTab } from './ui-teams.js';

const SESSION_KEY = 'genshin_sheet_session_v1';

const state = {
  sessionUser: null, // 'almondeluna' | 'vanbrohenheim'
  ownAccount: null,
  partnerAccount: null,
  viewingPartner: false,
  activeTab: 'hud', // 'hud' | 'vault' | 'prefarm' | 'roster' | 'teams'
  hudDayOverride: null,
  vaultFilter: { category: 'All', search: '', lowStockOnly: false },
  rosterFilter: {
    status: 'All',
    element: 'All',
    density: 'grid',
    view: 'characters',
    search: '',
    inspectedKey: null,
    tiers: { active: true, built: true, archive: false }
  },
  pendingGoodImport: null // { raw, diff }
};

function getActiveAccount() {
  return state.viewingPartner && state.partnerAccount ? state.partnerAccount : state.ownAccount;
}

function getPartnerUsername(username) {
  const cfg = window.GENSHIN_SHEET_CONFIG?.ACCOUNTS?.[username];
  return cfg?.partner || (username === 'almondeluna' ? 'vanbrohenheim' : 'almondeluna');
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
  const partnerName = cfg?.ACCOUNTS?.[getPartnerUsername(state.sessionUser)]?.displayName || 'Partner';

  document.getElementById('active-user-badge').textContent = userMeta
    ? `${userMeta.displayName.toUpperCase()} (${userMeta.username})`
    : '';

  const modeBadge = document.getElementById('sync-mode-badge');
  if (modeBadge) {
    modeBadge.textContent = isOfflineMode() ? 'OFFLINE / MOCK' : 'APPS SCRIPT SYNC';
    modeBadge.className = `pill mono ${isOfflineMode() ? 'pill-gold' : 'pill-mint'}`;
  }

  const partnerBtn = document.getElementById('btn-partner-toggle');
  if (partnerBtn) {
    partnerBtn.textContent = state.viewingPartner
      ? `← Back to ${userMeta?.displayName || 'My'} Sheet`
      : `View ${partnerName} (Read-Only)`;
    partnerBtn.classList.toggle('is-active', state.viewingPartner);
  }

  const importBtn = document.getElementById('btn-open-import');
  if (importBtn) {
    importBtn.disabled = state.viewingPartner;
  }

  const roBanner = document.getElementById('readonly-banner');
  if (roBanner) {
    roBanner.hidden = !state.viewingPartner;
    if (state.viewingPartner) {
      roBanner.textContent = `READ-ONLY PARTNER VIEW — Inspecting ${partnerName}'s sheet (${getPartnerUsername(state.sessionUser)}). Editing & Imports are locked.`;
    }
  }

  document.querySelectorAll('[data-tab-btn]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tabBtn === state.activeTab);
  });
}

function renderActiveTab(options = {}) {
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
    isReadOnly: state.viewingPartner,
    hudDayOverride: state.hudDayOverride,
    vaultFilter: state.vaultFilter,
    rosterFilter: state.rosterFilter
  };

  const container = document.querySelector(`.tab-view[data-tab="${state.activeTab}"]`);
  if (!container) return;

  if (state.activeTab === 'hud') {
    renderHudTab(container, viewState, {
      onChangeHudDay: (day) => {
        state.hudDayOverride = day;
        renderActiveTab();
      },
      onUpdateWallet: async (field, val) => {
        state.ownAccount.wallet = { ...(state.ownAccount.wallet || {}), [field]: val };
        await saveAccountSection(state.sessionUser, 'wallet', state.ownAccount.wallet);
        renderActiveTab();
        showToast(`Updated ${field}`, 'mint');
      },
      onToggleChecklist: async (group, id, done) => {
        const list = state.ownAccount.checklist?.[group] || [];
        const item = list.find((i) => i.id === id);
        if (item) item.done = done;
        await saveAccountSection(state.sessionUser, 'checklist', state.ownAccount.checklist);
        renderActiveTab();
      }
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
        const nextRank = queue.length + 1;
        const uid = `pf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const nextQueue = [...queue, { id: uid, rank: nextRank, ...target }];
        state.ownAccount.prefarmQueue = nextQueue;
        await saveAccountSection(state.sessionUser, 'prefarmQueue', nextQueue);
        renderActiveTab();
        showToast(`Added ${charName} to Prefarm Queue`, 'mint');
      },
      onMovePrefarmTarget: async (id, dir) => {
        const queue = [...(state.ownAccount.prefarmQueue || [])].sort((a, b) => a.rank - b.rank);
        const idx = queue.findIndex((t) => t.id === id);
        if (idx === -1) return;
        const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= queue.length) return;
        [queue[idx], queue[swapIdx]] = [queue[swapIdx], queue[idx]];
        queue.forEach((t, i) => (t.rank = i + 1));
        state.ownAccount.prefarmQueue = queue;
        await saveAccountSection(state.sessionUser, 'prefarmQueue', queue);
        renderActiveTab();
      },
      onRemovePrefarmTarget: async (id) => {
        const prev = state.ownAccount.prefarmQueue || [];
        const queue = prev
          .filter((t) => t.id !== id)
          .sort((a, b) => a.rank - b.rank)
          .map((t, i) => ({ ...t, rank: i + 1 }));
        state.ownAccount.prefarmQueue = queue;
        await saveAccountSection(state.sessionUser, 'prefarmQueue', queue);
        renderActiveTab();
        showToast('Removed target from Prefarm Queue', 'mint');
      },
      onEditPrefarmTarget: async (id, field, val) => {
        const target = (state.ownAccount.prefarmQueue || []).find((t) => t.id === id);
        if (!target) return;
        if (field === 'currentLevel') target.currentLevel = Math.min(95, Math.max(1, val));
        else if (field === 'targetLevel') target.targetLevel = Math.min(95, Math.max(1, val));
        else if (field === 'tAuto') target.targetTalent.auto = Math.min(10, Math.max(1, val));
        else if (field === 'tSkill') target.targetTalent.skill = Math.min(10, Math.max(1, val));
        else if (field === 'tBurst') target.targetTalent.burst = Math.min(10, Math.max(1, val));
        await saveAccountSection(state.sessionUser, 'prefarmQueue', state.ownAccount.prefarmQueue);
        renderActiveTab();
      }
    });
  } else if (state.activeTab === 'roster') {
    renderRosterTab(container, viewState, {
      onChangeRosterFilter: (patch, opts) => {
        state.rosterFilter = { ...state.rosterFilter, ...patch };
        renderActiveTab(opts);
      },
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
        ch.notes = updates.notes;

        await upsertRosterRow(state.sessionUser, charKey, {
          owned: ch.owned,
          level: ch.level,
          target_lvl: ch.targetLevel,
          priority_rank: ch.priorityRank,
          talent_auto: ch.talent.auto,
          talent_skill: ch.talent.skill,
          talent_burst: ch.talent.burst,
          status: ch.status,
          notes: ch.notes
        });
        renderActiveTab();
        showToast(`Saved ${charKey} to Roster`, 'mint');
      }
    });
  } else if (state.activeTab === 'teams') {
    renderTeamsTab(container, viewState, {
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
  }

  if (options?.preserveFocusSelector) {
    const el = container.querySelector(options.preserveFocusSelector);
    if (el) {
      el.focus();
      const len = el.value?.length || 0;
      el.setSelectionRange?.(len, len);
    }
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
}

function applyAuthenticatedSession(res) {
  state.sessionUser = res.account.user;
  state.ownAccount = res.account;
  state.viewingPartner = false;
  state.partnerAccount = null;

  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ user: state.sessionUser }));
  switchToAppView();
  showToast(`Signed in as ${res.account.displayName} (${res.mode} mode)`, 'mint');
}

async function handleLogin(username, passphrase = '') {
  const errEl = document.getElementById('login-error');
  if (errEl) errEl.textContent = '';

  try {
    const res = await loginAccount(username, passphrase);
    applyAuthenticatedSession(res);
  } catch (err) {
    if (errEl) errEl.textContent = err.message;
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
    if (!state.pendingGoodImport) return;
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

async function bootstrap() {
  await loadCatalog();

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

  // Top-bar navigation tabs
  document.querySelectorAll('[data-tab-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activeTab = btn.dataset.tabBtn;
      updateTopBar();
      renderActiveTab();
    });
  });

  // Partner read-only toggle
  document.getElementById('btn-partner-toggle')?.addEventListener('click', async () => {
    if (!state.sessionUser) return;
    if (state.viewingPartner) {
      state.viewingPartner = false;
      updateTopBar();
      renderActiveTab();
      return;
    }
    const partnerUser = getPartnerUsername(state.sessionUser);
    try {
      state.partnerAccount = await fetchPartnerAccount(partnerUser);
      state.viewingPartner = true;
      updateTopBar();
      renderActiveTab();
      showToast(`Viewing ${state.partnerAccount.displayName}'s sheet (Read-Only)`, 'gold');
    } catch (err) {
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
    state.viewingPartner = false;
    switchToLoginView();
  });

  setupGoodImportModal();

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
