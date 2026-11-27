/**
 * Google Apps Script — Main Web App Entrypoints (Code.gs)
 * Relies on session helpers defined in auth-session.gs.
 */

const TABLE_SCHEMAS = {
  Inventory: ['item_key', 'raw_count', 'last_updated'],
  Roster: [
    'char_key', 'owned', 'level', 'constellation', 'ascension',
    'talent_auto', 'talent_skill', 'talent_burst',
    'target_lvl', 'target_talents', 'status', 'priority_rank', 'notes'
  ],
  Weapons: [
    'weapon_uid', 'weapon_key', 'level', 'ascension', 'refinement',
    'location', 'target_lvl', 'status'
  ],
  Artifacts: [
    'set_key', 'slot_key', 'level', 'rarity', 'main_stat', 'location', 'substats_json'
  ],
  Teams: [
    'team_id', 'team_name', 'archetype', 'slot_1', 'slot_2', 'slot_3', 'slot_4',
    'energy_comfort', 'rotation_notes'
  ],
  Tasks: ['task_id', 'frequency', 'task_name', 'completed', 'reset_day'],
  Sections: ['section_key', 'json_value', 'last_updated']
};

function ensureUserSheet_(ss, user, table) {
  const tabName = `${user}_${table}`;
  const sheet = ss.getSheetByName(tabName) || ss.insertSheet(tabName);
  if (sheet.getLastRow() === 0 && TABLE_SCHEMAS[table]) {
    sheet.appendRow(TABLE_SCHEMAS[table]);
  }
  return sheet;
}

function sanitizeTargetTalents_(val) {
  if (val instanceof Date) {
    return `${val.getUTCMonth() + 1}/${val.getUTCDate()}/${val.getUTCFullYear() % 100}`;
  }
  const s = String(val || '').replace(/^'+/, '').trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear() % 100}`;
    }
  }
  return /^\d+\/\d+\/\d+$/.test(s) ? s : '9/9/9';
}

const SYSTEM_SCHEMAS = {
  Users: ['username', 'display_name', 'uid', 'is_public', 'salt', 'password_hash', 'role', 'created_at', 'last_sync'],
  Invites: ['token', 'created_by', 'created_at', 'expires_at', 'status', 'claimed_by'],
  UserStates: ['username', 'updated_at', 'state_json']
};
const STATE_CHUNK_SIZE = 45000;

function ensureSystemTabs_(ss) {
  Object.keys(SYSTEM_SCHEMAS).forEach(tabName => {
    const expectedHeaders = SYSTEM_SCHEMAS[tabName];
    const sheet = ss.getSheetByName(tabName) || ss.insertSheet(tabName);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(expectedHeaders);
      if (tabName === 'Users') {
        const now = new Date().toISOString();
        sheet.appendRow(['almondeluna', 'Luna', '', 'TRUE', '', '', 'admin', now, '']);
        sheet.appendRow(['vanbrohenheim', 'Roy', '', 'TRUE', '', '', 'member', now, '']);
      }
    } else {
      const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
      expectedHeaders.forEach(h => {
        if (currentHeaders.indexOf(h) === -1) {
          currentHeaders.push(h);
          sheet.getRange(1, currentHeaders.length).setValue(h);
        }
      });
    }
  });
}

function hashPassword_(salt, password) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(salt) + ':' + String(password));
  return bytes.map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}

function getUserRole_(ss, username) {
  const users = sheetToObjects(ss.getSheetByName('Users'));
  const row = users.find(u => String(u.username || '').trim().toLowerCase() === username);
  if (row && String(row.role || '').trim()) {
    return String(row.role).trim().toLowerCase();
  }
  return username === 'almondeluna' ? 'admin' : 'member';
}

function validateInviteToken_(ss, token) {
  const clean = String(token || '').trim();
  if (!clean) return { ok: false, error: 'Invite link is invalid or expired.' };
  const invSheet = ss.getSheetByName('Invites');
  if (!invSheet || invSheet.getLastRow() < 2) {
    return { ok: false, error: 'Invite link is invalid or expired.' };
  }
  const values = invSheet.getDataRange().getValues();
  const headers = values[0].map(h => String(h).trim());
  const tokCol = headers.indexOf('token');
  const expCol = headers.indexOf('expires_at');
  const stCol = headers.indexOf('status');
  const clmCol = headers.indexOf('claimed_by');
  const nowMs = Date.now();

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][tokCol]).trim() === clean) {
      const status = String(values[i][stCol] || '').trim().toUpperCase();
      const expiresAt = Number(values[i][expCol]) || 0;
      if (status !== 'ACTIVE' || nowMs >= expiresAt) {
        if (status === 'ACTIVE' && nowMs >= expiresAt) {
          invSheet.getRange(i + 1, stCol + 1).setValue('EXPIRED');
        }
        return { ok: false, error: 'Invite link is invalid or expired.' };
      }
      return {
        ok: true,
        rowIndex: i + 1,
        stCol: stCol,
        clmCol: clmCol
      };
    }
  }
  return { ok: false, error: 'Invite link is invalid or expired.' };
}

function readUserStateRow_(row) {
  if (!row || row.length < 3) return '';
  let combined = '';
  for (let c = 2; c < row.length; c++) {
    if (row[c] !== undefined && row[c] !== null && row[c] !== '') {
      combined += String(row[c]);
    }
  }
  return combined;
}

function readUserState_(ss, user) {
  const sheet = ss.getSheetByName('UserStates');
  if (!sheet || sheet.getLastRow() < 2) return null;
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0] || '').trim().toLowerCase() === user) {
      const raw = readUserStateRow_(values[i]);
      try {
        return JSON.parse(raw || '{}');
      } catch (err) {
        return {};
      }
    }
  }
  return null;
}

function writeUserState_(ss, user, mutatorFn, now) {
  const sheet = ss.getSheetByName('UserStates') || ss.insertSheet('UserStates');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(SYSTEM_SCHEMAS.UserStates);
  }
  const values = sheet.getDataRange().getValues();
  let targetRow = -1;
  let current = {};
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0] || '').trim().toLowerCase() === user) {
      targetRow = i + 1;
      const raw = readUserStateRow_(values[i]);
      try {
        current = JSON.parse(raw || '{}');
      } catch (err) {
        current = {};
      }
      break;
    }
  }
  const next = mutatorFn(current || {}) || current;
  const serialized = JSON.stringify(next);
  const chunks = [];
  for (let offset = 0; offset < serialized.length; offset += STATE_CHUNK_SIZE) {
    chunks.push(serialized.slice(offset, offset + STATE_CHUNK_SIZE));
  }
  if (chunks.length === 0) {
    chunks.push('{}');
  }

  // Ensure chunk_1, chunk_2, ... headers exist when payload exceeds one cell
  const neededCols = 2 + chunks.length;
  const currentCols = Math.max(sheet.getLastColumn(), 3);
  if (neededCols > currentCols) {
    for (let c = currentCols + 1; c <= neededCols; c++) {
      sheet.getRange(1, c).setValue('chunk_' + (c - 3));
    }
  }

  const totalCols = Math.max(currentCols, neededCols);
  if (targetRow === -1) {
    const newRow = [user, now].concat(chunks);
    while (newRow.length < totalCols) newRow.push('');
    sheet.appendRow(newRow);
  } else {
    const rowValues = [now].concat(chunks);
    while (rowValues.length < totalCols - 1) rowValues.push('');
    sheet.getRange(targetRow, 2, 1, rowValues.length).setValues([rowValues]);
  }
  return next;
}

function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const profiles = ['almondeluna', 'vanbrohenheim'];

  // 1. System Tabs (Users, Invites, UserStates)
  ensureSystemTabs_(ss);

  // 2. Per-Profile Flat Tables for existing legacy accounts
  profiles.forEach(user => {
    Object.keys(TABLE_SCHEMAS).forEach(table => {
      ensureUserSheet_(ss, user, table);
    });
  });
}

function isUserPublic_(profileMeta) {
  if (!profileMeta) return false;
  const raw = String(profileMeta.is_public === undefined ? 'TRUE' : profileMeta.is_public).trim().toLowerCase();
  return raw !== 'false' && raw !== '0' && raw !== 'no';
}

function getVisibleUsers_(ss, currentUser) {
  const users = sheetToObjects(ss.getSheetByName('Users'));
  return users
    .map(u => {
      const user = String(u.username || '').trim().toLowerCase();
      if (!user) return null;
      return {
        user: user,
        displayName: String(u.display_name || user).trim(),
        isPublic: isUserPublic_(u)
      };
    })
    .filter(u => u && (u.user === currentUser || u.isPublic));
}

function loadProfileAccount_(ss, targetUser) {
  const users = sheetToObjects(ss.getSheetByName('Users'));
  const profileMeta = users.find(u => String(u.username).toLowerCase() === targetUser) || {};
  const role = String(profileMeta.role || '').trim().toLowerCase() || (targetUser === 'almondeluna' ? 'admin' : 'member');
  const isLegacySheetUser = Boolean(ss.getSheetByName(`${targetUser}_Inventory`));

  if (!isLegacySheetUser) {
    const stateObj = readUserState_(ss, targetUser) || {};
    return {
      user: targetUser,
      displayName: profileMeta.display_name || targetUser,
      uid: profileMeta.uid || '',
      isPublic: isUserPublic_(profileMeta),
      role: role,
      isAdmin: role === 'admin',
      lastSync: profileMeta.last_sync || '',
      inventory: stateObj.inventory || {},
      roster: Array.isArray(stateObj.roster) ? stateObj.roster : [],
      weapons: Array.isArray(stateObj.weapons) ? stateObj.weapons : [],
      artifacts: Array.isArray(stateObj.artifacts) ? stateObj.artifacts : [],
      teams: Array.isArray(stateObj.teams) ? stateObj.teams : [],
      tasks: Array.isArray(stateObj.tasks) ? stateObj.tasks : [],
      wallet: stateObj.wallet || null,
      checklist: stateObj.checklist || null,
      prefarmQueue: stateObj.prefarmQueue || null,
      characters: stateObj.characters || null
    };
  }

  const invRows = sheetToObjects(ss.getSheetByName(`${targetUser}_Inventory`));
  const inventory = {};
  invRows.forEach(r => {
    if (r.item_key) {
      inventory[r.item_key] = { count: Number(r.raw_count) || 0 };
    }
  });

  const sectionRows = sheetToObjects(ss.getSheetByName(`${targetUser}_Sections`));
  const sections = {};
  sectionRows.forEach(r => {
    if (r.section_key && r.json_value) {
      try {
        sections[r.section_key] = JSON.parse(r.json_value);
      } catch (err) {
        // Ignore malformed section JSON
      }
    }
  });

  return {
    user: targetUser,
    displayName: profileMeta.display_name || (targetUser === 'almondeluna' ? 'Luna' : 'Roy'),
    uid: profileMeta.uid || '',
    isPublic: isUserPublic_(profileMeta),
    role: role,
    isAdmin: role === 'admin',
    inventory: inventory,
    roster: sheetToObjects(ss.getSheetByName(`${targetUser}_Roster`)),
    weapons: sheetToObjects(ss.getSheetByName(`${targetUser}_Weapons`)),
    artifacts: sheetToObjects(ss.getSheetByName(`${targetUser}_Artifacts`)),
    teams: sections.teams || sheetToObjects(ss.getSheetByName(`${targetUser}_Teams`)),
    tasks: sheetToObjects(ss.getSheetByName(`${targetUser}_Tasks`)),
    wallet: sections.wallet || null,
    checklist: sections.checklist || null,
    prefarmQueue: sections.prefarmQueue || null,
    characters: sections.characters || null
  };
}

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureSystemTabs_(ss);
    const action = params.action || 'getSheet';

    if (action === 'validateInvite') {
      const check = validateInviteToken_(ss, params.token);
      return jsonResponse(check.ok ? { ok: true } : { ok: false, error: check.error });
    }

    const session = requireSession_(params.token);

    if (action === 'getSheet' || action === 'loadProfile' || action === 'loadState') {
      const targetUser = String(params.user || params.profile || session.user).trim().toLowerCase();
      if (targetUser !== session.user) {
        const users = sheetToObjects(ss.getSheetByName('Users'));
        const targetMeta = users.find(u => String(u.username || '').trim().toLowerCase() === targetUser);
        if (!targetMeta || !isUserPublic_(targetMeta)) {
          return jsonResponse({ ok: false, error: 'This account is private.' });
        }
      }
      return jsonResponse({
        ok: true,
        profile: targetUser,
        account: loadProfileAccount_(ss, targetUser),
        visibleUsers: getVisibleUsers_(ss, session.user)
      });
    }

    return jsonResponse({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message || String(err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = payload.action || '';
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureSystemTabs_(ss);
    const now = new Date().toISOString();

    if (action === 'validateInvite') {
      const check = validateInviteToken_(ss, payload.token);
      return jsonResponse(check.ok ? { ok: true } : { ok: false, error: check.error });
    }

    if (action === 'registerWithInvite') {
      const check = validateInviteToken_(ss, payload.inviteToken || payload.token);
      if (!check.ok) {
        return jsonResponse({ ok: false, error: check.error });
      }
      const username = String(payload.username || '').trim().toLowerCase();
      const displayName = String(payload.displayName || '').trim().slice(0, 24);
      const password = String(payload.password || '');
      const confirmPassword = String(payload.confirmPassword || '');

      if (!/^[a-z0-9_]{3,20}$/.test(username)) {
        return jsonResponse({ ok: false, error: 'Username must be 3–20 lowercase letters, numbers, or underscores.' });
      }
      if (!displayName) {
        return jsonResponse({ ok: false, error: 'Display Name is required.' });
      }
      if (password.length < 6) {
        return jsonResponse({ ok: false, error: 'Password must be at least 6 characters.' });
      }
      if (password !== confirmPassword) {
        return jsonResponse({ ok: false, error: 'Passwords do not match.' });
      }

      const usersSheet = ss.getSheetByName('Users');
      const existingUsers = sheetToObjects(usersSheet);
      if (existingUsers.some(u => String(u.username || '').trim().toLowerCase() === username)) {
        return jsonResponse({ ok: false, error: 'Username is already taken.' });
      }

      const salt = Utilities.getUuid();
      const passwordHash = hashPassword_(salt, password);
      const headers = usersSheet.getRange(1, 1, 1, usersSheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
      const rowMap = {
        username: username,
        display_name: displayName,
        uid: '',
        is_public: 'TRUE',
        salt: salt,
        password_hash: passwordHash,
        role: 'member',
        created_at: now,
        last_sync: now
      };
      usersSheet.appendRow(headers.map(h => (rowMap[h] !== undefined ? rowMap[h] : '')));

      writeUserState_(ss, username, () => ({
        inventory: {},
        roster: [],
        weapons: [],
        artifacts: [],
        teams: [],
        tasks: [],
        wallet: null,
        checklist: null,
        prefarmQueue: null,
        characters: null
      }), now);

      const invSheet = ss.getSheetByName('Invites');
      invSheet.getRange(check.rowIndex, check.stCol + 1).setValue('USED');
      if (check.clmCol !== -1) {
        invSheet.getRange(check.rowIndex, check.clmCol + 1).setValue(username);
      }

      const sessionToken = createSessionToken_(username);
      return jsonResponse({
        ok: true,
        sessionToken: sessionToken,
        account: loadProfileAccount_(ss, username),
        visibleUsers: getVisibleUsers_(ss, username)
      });
    }

    if (action === 'login') {
      const user = String(payload.user || payload.username || '').trim().toLowerCase();
      const passphrase = String(payload.passphrase || payload.password || '');
      const usersSheet = ss.getSheetByName('Users');
      const users = sheetToObjects(usersSheet);
      const userRowIdx = users.findIndex(u => String(u.username || '').trim().toLowerCase() === user);
      const userMeta = userRowIdx !== -1 ? users[userRowIdx] : null;

      let authed = false;
      if (userMeta && userMeta.salt && userMeta.password_hash) {
        authed = hashPassword_(userMeta.salt, passphrase) === String(userMeta.password_hash).trim();
      } else {
        const expected = getExpectedPassphrase_(user);
        authed = Boolean(expected && passphrase === expected);
      }

      if (!authed) {
        return jsonResponse({ ok: false, error: 'Invalid credentials' });
      }

      if (userRowIdx !== -1 && usersSheet) {
        const headers = usersSheet.getRange(1, 1, 1, usersSheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
        const syncCol = headers.indexOf('last_sync');
        if (syncCol !== -1) {
          usersSheet.getRange(userRowIdx + 2, syncCol + 1).setValue(now);
        }
      }

      const sessionToken = createSessionToken_(user);
      return jsonResponse({
        ok: true,
        sessionToken: sessionToken,
        account: loadProfileAccount_(ss, user),
        visibleUsers: getVisibleUsers_(ss, user)
      });
    }

    const authToken = payload.sessionToken || payload.token;

    if (action === 'logout') {
      revokeSession_(authToken);
      return jsonResponse({ ok: true });
    }

    if (action === 'createInvite') {
      const session = requireSession_(authToken);
      if (getUserRole_(ss, session.user) !== 'admin') {
        return jsonResponse({ ok: false, error: 'Forbidden: admin privilege required.' });
      }
      const invSheet = ss.getSheetByName('Invites');
      const token = Utilities.getUuid().replace(/-/g, '');
      const expiresAt = Date.now() + 48 * 60 * 60 * 1000;
      invSheet.appendRow([token, session.user, now, expiresAt, 'ACTIVE', '']);
      return jsonResponse({ ok: true, token: token, expiresAt: expiresAt });
    }

    // All write actions require a valid session token; force write target to session.user
    // (ignoring any client-supplied targetUsername).
    const session = requireSession_(authToken);
    const user = String(session.user || '').trim().toLowerCase();
    const usersList = sheetToObjects(ss.getSheetByName('Users'));
    if (!user || !usersList.some(u => String(u.username || '').trim().toLowerCase() === user)) {
      return jsonResponse({ ok: false, error: 'Unauthorized: account not found.' });
    }
    const requestedUser = String(payload.user || payload.profile || '').trim().toLowerCase();
    if (requestedUser && requestedUser !== user) {
      return jsonResponse({ ok: false, error: 'Forbidden: cannot modify another user\'s sheet' });
    }

    const isLegacySheetUser = Boolean(ss.getSheetByName(`${user}_Inventory`));

    if (action === 'saveState') {
      writeUserState_(ss, user, () => payload.state || {}, now);
      return jsonResponse({ ok: true, updatedAt: now });
    }

    // ACTION 1: Batch Import Irminsul GOOD v3 JSON
    if (action === 'importGoodJson') {
      const good = payload.good || payload.data || {};
      if (!isLegacySheetUser) {
        writeUserState_(ss, user, (st) => {
          if (good.materials) {
            st.inventory = st.inventory || {};
            Object.keys(good.materials).forEach(k => {
              st.inventory[k] = { count: Number(good.materials[k]) || 0 };
            });
          }
          if (Array.isArray(good.characters)) {
            const byKey = {};
            (st.roster || []).forEach(r => { if (r.char_key || r.key) byKey[r.char_key || r.key] = r; });
            st.roster = good.characters.map(c => {
              const prev = byKey[c.key] || {};
              return {
                char_key: c.key,
                owned: true,
                level: c.level,
                constellation: c.constellation,
                ascension: c.ascension,
                talent_auto: c.talent?.auto || 1,
                talent_skill: c.talent?.skill || 1,
                talent_burst: c.talent?.burst || 1,
                target_lvl: prev.target_lvl || 90,
                target_talents: prev.target_talents || '9/9/9',
                status: prev.status || (c.level >= 90 ? 'Built' : c.level >= 70 ? 'In Progress' : 'Bench'),
                priority_rank: prev.priority_rank || '',
                notes: prev.notes || ''
              };
            });
          }
          if (Array.isArray(good.weapons)) {
            st.weapons = good.weapons.map((w, idx) => ({
              weapon_uid: `${w.key}_${idx + 1}`,
              weapon_key: w.key,
              level: w.level,
              ascension: w.ascension,
              refinement: w.refinement,
              location: w.location || '',
              target_lvl: 90,
              status: w.level >= 90 ? 'Maxed' : 'Bench'
            }));
          }
          if (Array.isArray(good.artifacts)) {
            st.artifacts = good.artifacts.filter(a => a && a.location).map(a => ({
              set_key: a.setKey || '',
              slot_key: a.slotKey || '',
              level: Number(a.level) || 0,
              rarity: Number(a.rarity) || 5,
              main_stat: a.mainStatKey || '',
              location: a.location || '',
              substats_json: JSON.stringify(Array.isArray(a.substats) ? a.substats : [])
            }));
          }
          return st;
        }, now);
        return jsonResponse({ ok: true, importedAt: now });
      }

      if (good.materials) {
        const invSheet = ensureUserSheet_(ss, user, 'Inventory');
        const existingInv = sheetToObjects(invSheet);
        const invMap = {};
        existingInv.forEach(r => { invMap[r.item_key] = r.raw_count; });
        Object.keys(good.materials).forEach(k => { invMap[k] = good.materials[k]; });

        const invRows = Object.keys(invMap).map(k => [k, invMap[k], now]);
        replaceSheetBody(invSheet, invRows);
      }

      if (Array.isArray(good.characters)) {
        const rosSheet = ensureUserSheet_(ss, user, 'Roster');
        const existingRos = sheetToObjects(rosSheet);
        const metaMap = {};
        existingRos.forEach(r => { metaMap[r.char_key] = r; });

        const rosRows = good.characters.map(c => {
          const prev = metaMap[c.key] || {};
          const autoStatus = c.level >= 90 ? 'Built' : (c.level >= 70 ? 'In Progress' : 'Bench');
          return [
            c.key,
            true,
            c.level,
            c.constellation,
            c.ascension,
            c.talent?.auto || 1,
            c.talent?.skill || 1,
            c.talent?.burst || 1,
            prev.target_lvl || 90,
            "'" + sanitizeTargetTalents_(prev.target_talents || '9/9/9'),
            prev.status || autoStatus,
            prev.priority_rank || '',
            prev.notes || ''
          ];
        });
        replaceSheetBody(rosSheet, rosRows);
      }

      if (Array.isArray(good.weapons)) {
        const wepSheet = ensureUserSheet_(ss, user, 'Weapons');
        const wepRows = good.weapons.map((w, idx) => [
          `${w.key}_${idx + 1}`,
          w.key,
          w.level,
          w.ascension,
          w.refinement,
          w.location || '',
          90,
          w.level >= 90 ? 'Maxed' : 'Bench'
        ]);
        replaceSheetBody(wepSheet, wepRows);
      }

      if (Array.isArray(good.artifacts)) {
        const artSheet = ensureUserSheet_(ss, user, 'Artifacts');
        const equipped = good.artifacts.filter(a => a && a.location);
        const artRows = equipped.map(a => [
          a.setKey || '',
          a.slotKey || '',
          Number(a.level) || 0,
          Number(a.rarity) || 5,
          a.mainStatKey || '',
          a.location || '',
          JSON.stringify(Array.isArray(a.substats) ? a.substats : [])
        ]);
        replaceSheetBody(artSheet, artRows);
      }

      return jsonResponse({ ok: true, importedAt: now });
    }

    // ACTION 2: Single Row Update (Live UI Edits)
    if (action === 'upsertRow') {
      const sheetName = payload.sheet || `${user}_${payload.table || 'Inventory'}`;
      const inferredTable = payload.table || (sheetName.startsWith(`${user}_`) ? sheetName.slice(user.length + 1) : '');
      const fields = payload.fields || payload.data || {};

      if (!isLegacySheetUser) {
        writeUserState_(ss, user, (st) => {
          if (inferredTable === 'Inventory') {
            st.inventory = st.inventory || {};
            const cnt = fields.raw_count !== undefined ? fields.raw_count : fields.count;
            st.inventory[payload.key] = { count: Number(cnt) || 0 };
          } else if (inferredTable === 'Roster') {
            st.roster = Array.isArray(st.roster) ? st.roster : [];
            const idx = st.roster.findIndex(r => (r.char_key || r.key) === payload.key);
            const nextRow = { ...(idx !== -1 ? st.roster[idx] : { char_key: payload.key }), ...fields, char_key: payload.key };
            if (idx !== -1) st.roster[idx] = nextRow;
            else st.roster.push(nextRow);
          }
          return st;
        }, now);
        return jsonResponse({ ok: true });
      }

      const sheet = ss.getSheetByName(sheetName) || (TABLE_SCHEMAS[inferredTable] ? ensureUserSheet_(ss, user, inferredTable) : null);
      if (!sheet) {
        return jsonResponse({ ok: false, error: 'Sheet not found: ' + sheetName });
      }

      const normalizedFields = { ...fields };
      if (normalizedFields.raw_count === undefined && normalizedFields.count !== undefined) {
        normalizedFields.raw_count = normalizedFields.count;
      }
      if (normalizedFields.target_talents !== undefined) {
        normalizedFields.target_talents = "'" + sanitizeTargetTalents_(normalizedFields.target_talents);
      }
      if (normalizedFields.last_updated === undefined) {
        normalizedFields.last_updated = now;
      }

      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const data = sheet.getDataRange().getValues();
      let targetRow = -1;

      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(payload.key)) {
          targetRow = i + 1;
          break;
        }
      }

      if (targetRow === -1) {
        const newRow = headers.map((h, idx) => {
          if (idx === 0) return payload.key;
          return normalizedFields[h] !== undefined ? normalizedFields[h] : '';
        });
        sheet.appendRow(newRow);
      } else {
        Object.keys(normalizedFields).forEach(colName => {
          const colIdx = headers.indexOf(colName);
          if (colIdx !== -1) {
            sheet.getRange(targetRow, colIdx + 1).setValue(normalizedFields[colName]);
          }
        });
      }
      return jsonResponse({ ok: true });
    }

    // ACTION 3: Upsert JSON Section (wallet, checklist, prefarmQueue, characters, teams)
    if (action === 'upsertSection') {
      if (!isLegacySheetUser) {
        writeUserState_(ss, user, (st) => {
          st[payload.section] = payload.data;
          return st;
        }, now);
        return jsonResponse({ ok: true });
      }
      const secSheet = ss.getSheetByName(`${user}_Sections`) || ss.insertSheet(`${user}_Sections`);
      if (secSheet.getLastRow() === 0) {
        secSheet.appendRow(['section_key', 'json_value', 'last_updated']);
      }
      const data = secSheet.getDataRange().getValues();
      let targetRow = -1;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(payload.section)) {
          targetRow = i + 1;
          break;
        }
      }
      const serialized = JSON.stringify(payload.data);
      if (targetRow === -1) {
        secSheet.appendRow([payload.section, serialized, now]);
      } else {
        secSheet.getRange(targetRow, 2, 1, 2).setValues([[serialized, now]]);
      }
      return jsonResponse({ ok: true });
    }

    // ACTION 4: Update Own Display Name & Privacy Setting
    if (action === 'updateProfileSettings' || action === 'updateAccount') {
      const usersSheet = ss.getSheetByName('Users');
      if (!usersSheet || usersSheet.getLastRow() < 2) {
        return jsonResponse({ ok: false, error: 'Users sheet not initialized' });
      }
      const range = usersSheet.getDataRange();
      const values = range.getValues();
      const headers = values[0].map(h => String(h).trim());
      let dispCol = headers.indexOf('display_name');
      let pubCol = headers.indexOf('is_public');
      if (pubCol === -1) {
        pubCol = headers.length;
        usersSheet.getRange(1, pubCol + 1).setValue('is_public');
      }
      if (dispCol === -1) {
        dispCol = headers.length + (pubCol === headers.length ? 1 : 0);
        usersSheet.getRange(1, dispCol + 1).setValue('display_name');
      }

      let targetRow = -1;
      for (let i = 1; i < values.length; i++) {
        if (String(values[i][0]).trim().toLowerCase() === user) {
          targetRow = i + 1;
          break;
        }
      }
      if (targetRow === -1) {
        return jsonResponse({ ok: false, error: 'User profile row not found' });
      }

      const nextDisplay = String(payload.displayName || '').trim().slice(0, 24);
      const nextPublic = payload.isPublic !== false;
      if (nextDisplay) {
        usersSheet.getRange(targetRow, dispCol + 1).setValue(nextDisplay);
      }
      usersSheet.getRange(targetRow, pubCol + 1).setValue(nextPublic ? 'TRUE' : 'FALSE');

      return jsonResponse({
        ok: true,
        displayName: nextDisplay || undefined,
        isPublic: nextPublic,
        visibleUsers: getVisibleUsers_(ss, user)
      });
    }

    return jsonResponse({ ok: false, error: 'Unknown POST action: ' + action });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message || String(err) });
  } finally {
    lock.releaseLock();
  }
}

function sheetToObjects(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  return values.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function replaceSheetBody(sheet, rows) {
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
