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

function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const profiles = ['almondeluna', 'vanbrohenheim'];

  // 1. Users Tab (display metadata; passphrases live in Script Properties)
  const usersSheet = ss.getSheetByName('Users') || ss.insertSheet('Users');
  if (usersSheet.getLastRow() === 0) {
    usersSheet.appendRow(['username', 'display_name', 'uid']);
    usersSheet.appendRow(['almondeluna', 'Luna', '']);
    usersSheet.appendRow(['vanbrohenheim', 'Roy', '']);
  }

  // 2. Per-Profile Flat Tables
  profiles.forEach(user => {
    Object.keys(TABLE_SCHEMAS).forEach(table => {
      ensureUserSheet_(ss, user, table);
    });
  });
}

function loadProfileAccount_(ss, targetUser) {
  const users = sheetToObjects(ss.getSheetByName('Users'));
  const profileMeta = users.find(u => String(u.username).toLowerCase() === targetUser) || {};

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
    const session = requireSession_(params.token);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const action = params.action || 'getSheet';

    if (action === 'getSheet' || action === 'loadProfile') {
      const targetUser = String(params.user || params.profile || session.user).trim().toLowerCase();
      return jsonResponse({
        ok: true,
        profile: targetUser,
        account: loadProfileAccount_(ss, targetUser)
      });
    }

    return jsonResponse({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message || String(err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = payload.action || '';
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const now = new Date().toISOString();

    if (action === 'login') {
      const user = String(payload.user || payload.username || '').trim().toLowerCase();
      const passphrase = String(payload.passphrase || payload.password || '');
      const expected = getExpectedPassphrase_(user);

      if (!expected || passphrase !== expected) {
        return jsonResponse({ ok: false, error: 'Invalid credentials' });
      }

      const sessionToken = createSessionToken_(user);
      return jsonResponse({
        ok: true,
        sessionToken: sessionToken,
        account: loadProfileAccount_(ss, user)
      });
    }

    if (action === 'logout') {
      revokeSession_(payload.token);
      return jsonResponse({ ok: true });
    }

    // All write actions require a valid session token matching the target user
    const session = requireSession_(payload.token);
    const user = String(payload.user || payload.profile || '').trim().toLowerCase();
    if (!user || session.user !== user) {
      return jsonResponse({ ok: false, error: 'Forbidden: cannot modify another user\'s sheet' });
    }

    // ACTION 1: Batch Import Irminsul GOOD v3 JSON
    if (action === 'importGoodJson') {
      const good = payload.good || payload.data || {};

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
      const sheet = ss.getSheetByName(sheetName) || (TABLE_SCHEMAS[inferredTable] ? ensureUserSheet_(ss, user, inferredTable) : null);
      if (!sheet) {
        return jsonResponse({ ok: false, error: 'Sheet not found: ' + sheetName });
      }

      const fields = payload.fields || payload.data || {};
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
