import { cloneMockAccount } from './mock-data.js';

const STORAGE_PREFIX = 'genshin_sheet_mock_v1_';
const SESSION_TOKEN_KEY = 'genshin_sheet_token_v1';

function getConfig() {
  return window.GENSHIN_SHEET_CONFIG || { APPS_SCRIPT_URL: '' };
}

export function getSessionToken() {
  try {
    return sessionStorage.getItem(SESSION_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

function setSessionToken(token) {
  try {
    if (token) {
      sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
    }
  } catch (err) {
    console.warn('sessionStorage token write failed:', err);
  }
}

export function clearSessionToken() {
  setSessionToken('');
}

function requireSessionToken() {
  const token = getSessionToken();
  if (!token) {
    throw new Error('Session expired. Please sign in again.');
  }
  return token;
}

async function getAppsScript(params, errorLabel) {
  const cfg = getConfig();
  const url = new URL(cfg.APPS_SCRIPT_URL);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) {
      url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString(), { method: 'GET' });
  if (!res.ok) {
    throw new Error(`${errorLabel} (${res.status})`);
  }
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json;
}

async function postAppsScript(payload, errorLabel) {
  const cfg = getConfig();
  const res = await fetch(cfg.APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    throw new Error(`${errorLabel} (${res.status})`);
  }
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json;
}

export function isOfflineMode() {
  const cfg = getConfig();
  return !cfg.APPS_SCRIPT_URL || cfg.APPS_SCRIPT_URL.trim() === '';
}

function loadLocalMock(username) {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${username}`);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('localStorage read failed:', err);
  }
  const fresh = cloneMockAccount(username);
  saveLocalMock(username, fresh);
  return fresh;
}

export function saveLocalMock(username, data) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${username}`, JSON.stringify(data));
  } catch (err) {
    console.warn('localStorage write failed:', err);
  }
}

function parseTargetTalents(raw) {
  if (raw instanceof Date) {
    return `${raw.getUTCMonth() + 1}/${raw.getUTCDate()}/${raw.getUTCFullYear() % 100}`;
  }
  const s = String(raw || '').replace(/^'+/, '').trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear() % 100}`;
    }
  }
  return /^\d+\/\d+\/\d+$/.test(s) ? s : '9/9/9';
}

function normalizeSheetRowCharacter(r) {
  const level = Number(r.level) || 1;
  return {
    key: r.key || r.char_key,
    owned: r.owned === undefined ? true : Boolean(r.owned),
    level,
    constellation: Number(r.constellation) || 0,
    ascension: Number(r.ascension) || 0,
    talent: r.talent || {
      auto: Number(r.talent_auto) || 1,
      skill: Number(r.talent_skill) || 1,
      burst: Number(r.talent_burst) || 1
    },
    targetLevel: Number(r.targetLevel ?? r.target_lvl) || 90,
    targetTalents: parseTargetTalents(r.targetTalents ?? r.target_talents),
    status: r.status || (level >= 90 ? 'Built' : level >= 70 ? 'In Progress' : 'Bench'),
    priorityRank: r.priorityRank ?? r.priority_rank ?? '',
    swapTag: r.swapTag || '',
    notes: r.notes || ''
  };
}

function normalizeAccount(raw) {
  if (!raw || typeof raw !== 'object') return raw;

  const rosterRows = Array.isArray(raw.roster) ? raw.roster.map(normalizeSheetRowCharacter).filter((c) => c.key) : [];
  const sectionChars = Array.isArray(raw.characters) ? raw.characters.map(normalizeSheetRowCharacter).filter((c) => c.key) : [];

  let characters = sectionChars;
  if (sectionChars.length === 0 && rosterRows.length > 0) {
    characters = rosterRows;
  } else if (rosterRows.length > 0 && sectionChars.length > 0) {
    const byKey = new Map(sectionChars.map((c) => [c.key, c]));
    for (const r of rosterRows) {
      const prev = byKey.get(r.key);
      byKey.set(r.key, prev ? { ...r, status: prev.status || r.status, swapTag: prev.swapTag || r.swapTag } : r);
    }
    characters = Array.from(byKey.values());
  }

  const weapons = (Array.isArray(raw.weapons) ? raw.weapons : [])
    .map((w, idx) => ({
      id: w.id || w.weapon_uid || `w-${idx + 1}`,
      key: w.key || w.weapon_key,
      level: Number(w.level) || 1,
      ascension: Number(w.ascension) || 0,
      refinement: Number(w.refinement) || 1,
      location: w.location || '',
      lock: Boolean(w.lock)
    }))
    .filter((w) => Boolean(w.key));

  const artifacts = (Array.isArray(raw.artifacts) ? raw.artifacts : [])
    .map((a) => {
      let substats = Array.isArray(a.substats) ? a.substats : [];
      if (!substats.length && typeof a.substats_json === 'string' && a.substats_json) {
        try {
          const parsed = JSON.parse(a.substats_json);
          if (Array.isArray(parsed)) substats = parsed;
        } catch {
          // Ignore malformed substats JSON
        }
      }
      return {
        setKey: a.setKey || a.set_key || '',
        slotKey: a.slotKey || a.slot_key || '',
        level: Number(a.level) || 0,
        rarity: Number(a.rarity) || 5,
        mainStatKey: a.mainStatKey || a.main_stat || '',
        location: a.location || '',
        substats
      };
    })
    .filter((a) => Boolean(a.setKey && a.location));

  return {
    ...raw,
    characters,
    weapons,
    artifacts
  };
}

/**
 * Authenticates user via POST (action: "login") so passphrase stays out of URLs,
 * stores the returned temporary session token, and returns the account payload.
 */
export async function loginAccount(username, passphrase = '') {
  const cfg = getConfig();
  const normalized = (username || '').trim().toLowerCase();

  if (!cfg.ACCOUNTS?.[normalized]) {
    throw new Error('Invalid account key or passphrase.');
  }

  if (isOfflineMode()) {
    return {
      ok: true,
      mode: 'offline',
      account: loadLocalMock(normalized)
    };
  }

  if (!passphrase) {
    throw new Error('Passphrase is required in live mode.');
  }

  const json = await postAppsScript(
    {
      action: 'login',
      user: normalized,
      passphrase
    },
    'Apps Script login failed'
  );

  const sessionToken = json.sessionToken || json.token;
  if (!sessionToken) {
    throw new Error('Login succeeded but server did not issue a session token.');
  }
  setSessionToken(sessionToken);

  return {
    ok: true,
    mode: 'live',
    account: normalizeAccount(json.account || json.data) || loadLocalMock(normalized)
  };
}

/**
 * Restores an existing session on page reload using the temporary session token.
 */
export async function restoreAccountSession(username) {
  const cfg = getConfig();
  const normalized = (username || '').trim().toLowerCase();

  if (!cfg.ACCOUNTS?.[normalized]) {
    throw new Error('Unknown account.');
  }

  if (isOfflineMode()) {
    return {
      ok: true,
      mode: 'offline',
      account: loadLocalMock(normalized)
    };
  }

  const token = requireSessionToken();
  const json = await getAppsScript(
    {
      action: 'getSheet',
      user: normalized,
      token
    },
    'Session restore failed'
  );

  return {
    ok: true,
    mode: 'live',
    account: normalizeAccount(json.account || json.data) || loadLocalMock(normalized)
  };
}

/**
 * Clears the local session token and best-effort revokes it on the backend.
 */
export async function logoutAccount() {
  const token = getSessionToken();
  clearSessionToken();

  if (!isOfflineMode() && token) {
    try {
      await postAppsScript({ action: 'logout', token }, 'Logout failed');
    } catch {
      // Best-effort revocation; local token is already cleared.
    }
  }
}

/**
 * Fetches partner account data in read-only mode.
 */
export async function fetchPartnerAccount(partnerUsername) {
  if (isOfflineMode()) {
    return loadLocalMock(partnerUsername);
  }

  const token = requireSessionToken();
  const json = await getAppsScript(
    {
      action: 'getSheet',
      user: partnerUsername,
      token
    },
    'Failed to fetch partner sheet'
  );
  return normalizeAccount(json.account || json.data);
}

/**
 * Sends a single upsertRow POST with Content-Type: text/plain to {user}_Inventory (or section).
 */
export async function upsertInventoryRow(username, key, rowPayload) {
  if (isOfflineMode()) {
    const current = loadLocalMock(username);
    current.inventory = current.inventory || {};
    current.inventory[key] = {
      ...(current.inventory[key] || {}),
      ...rowPayload
    };
    saveLocalMock(username, current);
    return { ok: true, mode: 'offline', key, savedAt: Date.now() };
  }

  const token = requireSessionToken();
  await postAppsScript(
    {
      action: 'upsertRow',
      token,
      user: username,
      sheet: `${username}_Inventory`,
      key,
      data: rowPayload
    },
    'upsertRow failed'
  );
  return { ok: true, mode: 'live', key, savedAt: Date.now() };
}

/**
 * Sends a single upsertRow POST with Content-Type: text/plain to {user}_Roster.
 */
export async function upsertRosterRow(username, charKey, rowPayload) {
  if (isOfflineMode()) {
    const current = loadLocalMock(username);
    current.characters = current.characters || [];
    const idx = current.characters.findIndex((c) => c.key === charKey);
    const updated = {
      ...(idx >= 0 ? current.characters[idx] : { key: charKey }),
      ...rowPayload
    };
    if (idx >= 0) current.characters[idx] = updated;
    else current.characters.push(updated);
    saveLocalMock(username, current);
    return { ok: true, mode: 'offline', key: charKey, savedAt: Date.now() };
  }

  const token = requireSessionToken();
  await postAppsScript(
    {
      action: 'upsertRow',
      token,
      user: username,
      sheet: `${username}_Roster`,
      key: charKey,
      data: rowPayload
    },
    'upsertRow failed'
  );
  return { ok: true, mode: 'live', key: charKey, savedAt: Date.now() };
}

/**
 * Persists non-inventory account sections (wallet, checklist, prefarmQueue, characters, teams).
 */
export async function saveAccountSection(username, section, payload) {
  if (isOfflineMode()) {
    const current = loadLocalMock(username);
    current[section] = payload;
    saveLocalMock(username, current);
    return { ok: true, mode: 'offline' };
  }

  const token = requireSessionToken();
  return postAppsScript(
    {
      action: 'upsertSection',
      token,
      user: username,
      section,
      data: payload
    },
    'saveAccountSection failed'
  );
}

/**
 * Sends a single POST (action: "importGoodJson", Content-Type: text/plain) to Apps Script.
 */
export async function postImportGoodJson(username, goodPayload, mergedAccountData) {
  if (isOfflineMode()) {
    saveLocalMock(username, mergedAccountData);
    return { ok: true, mode: 'offline', syncedAt: Date.now() };
  }

  const token = requireSessionToken();
  return postAppsScript(
    {
      action: 'importGoodJson',
      token,
      user: username,
      good: goodPayload
    },
    'importGoodJson failed'
  );
}
