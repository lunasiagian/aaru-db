import { getMaterialMeta } from './catalog.js?v=20261113z';
import { postImportGoodJson } from './api.js';

export function validateGoodV3(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid JSON payload.');
  }
  if (payload.format !== 'GOOD') {
    throw new Error(`Expected format "GOOD", received "${payload.format || 'unknown'}".`);
  }
  if (Number(payload.version) < 2) {
    throw new Error(`Unsupported GOOD version: ${payload.version}. Expected version 3.`);
  }
  return true;
}

/**
 * Computes a diff preview and merged account state without mutating the original account.
 */
export function computeGoodImportDiff(account, good) {
  const existingChars = new Map((account.characters || []).map((c) => [c.key, c]));
  const charChanges = [];
  const mergedCharsMap = new Map(existingChars);

  for (const gc of good.characters || []) {
    if (!gc.key) continue;
    const prev = existingChars.get(gc.key);
    const nextChar = {
      key: gc.key,
      owned: true,
      level: Number(gc.level) || 1,
      constellation: Number(gc.constellation) || 0,
      ascension: Number(gc.ascension) || 0,
      talent: {
        auto: Number(gc.talent?.auto) || 1,
        skill: Number(gc.talent?.skill) || 1,
        burst: Number(gc.talent?.burst) || 1
      },
      status: prev?.status || (Number(gc.level) >= 90 ? 'Built' : Number(gc.level) >= 70 ? 'In Progress' : 'Bench'),
      swapTag: prev?.swapTag || ''
    };

    const changed =
      !prev ||
      prev.level !== nextChar.level ||
      prev.constellation !== nextChar.constellation ||
      prev.talent?.auto !== nextChar.talent.auto ||
      prev.talent?.skill !== nextChar.talent.skill ||
      prev.talent?.burst !== nextChar.talent.burst;

    if (changed) {
      charChanges.push({
        key: gc.key,
        type: prev ? 'updated' : 'added',
        fromLevel: prev?.level ?? null,
        toLevel: nextChar.level
      });
    }
    mergedCharsMap.set(gc.key, nextChar);
  }

  // Weapons: map by index/key+location+level or rebuild from GOOD weapons list
  const prevWeapons = account.weapons || [];
  const nextWeapons = (good.weapons || []).map((gw, idx) => ({
    id: gw.id || `good-w-${idx + 1}`,
    key: gw.key,
    level: Number(gw.level) || 1,
    ascension: Number(gw.ascension) || 0,
    refinement: Number(gw.refinement) || 1,
    location: gw.location || '',
    lock: Boolean(gw.lock)
  }));

  const weaponChanges = [];
  const prevWeaponByKeyLoc = new Map(prevWeapons.map((w) => [`${w.key}::${w.location}`, w]));
  for (const nw of nextWeapons) {
    const match = prevWeaponByKeyLoc.get(`${nw.key}::${nw.location}`);
    if (!match || match.level !== nw.level || match.refinement !== nw.refinement) {
      weaponChanges.push({
        key: nw.key,
        location: nw.location,
        level: nw.level,
        type: match ? 'updated' : 'added'
      });
    }
  }

  // Materials
  const nextInventory = { ...(account.inventory || {}) };
  const matChanges = [];
  for (const [matKey, rawCount] of Object.entries(good.materials || {})) {
    const count = Number(rawCount) || 0;
    const prevEntry = nextInventory[matKey];
    const prevCount = prevEntry?.count ?? null;
    if (prevCount !== count) {
      matChanges.push({
        key: matKey,
        from: prevCount,
        to: count
      });
    }
    const meta = getMaterialMeta(matKey);
    nextInventory[matKey] = {
      count,
      target: prevEntry?.target ?? 0,
      category: prevEntry?.category || meta.category || 'Material'
    };
  }

  const nextWallet = { ...(account.wallet || {}) };
  if (typeof good.materials?.Mora === 'number') {
    nextWallet.mora = good.materials.Mora;
  }
  if (typeof good.materials?.IntertwinedFate === 'number') {
    nextWallet.intertwinedFates = good.materials.IntertwinedFate;
  }
  if (typeof good.materials?.AcquaintFate === 'number') {
    nextWallet.acquaintFates = good.materials.AcquaintFate;
  }

  const nextArtifacts = (good.artifacts || [])
    .filter((a) => a && a.location && a.setKey)
    .map((a) => ({
      setKey: a.setKey,
      slotKey: a.slotKey || '',
      level: Number(a.level) || 0,
      rarity: Number(a.rarity) || 5,
      mainStatKey: a.mainStatKey || '',
      location: a.location,
      substats: Array.isArray(a.substats) ? a.substats : []
    }));

  const mergedAccount = {
    ...account,
    wallet: nextWallet,
    characters: Array.from(mergedCharsMap.values()),
    weapons: nextWeapons.length ? nextWeapons : account.weapons,
    artifacts: nextArtifacts.length ? nextArtifacts : (account.artifacts || []),
    inventory: nextInventory
  };

  return {
    source: good.source || 'GOOD v3',
    version: good.version,
    charactersTotal: (good.characters || []).length,
    weaponsTotal: (good.weapons || []).length,
    artifactsTotal: (good.artifacts || []).length,
    equippedArtifactsCount: nextArtifacts.length,
    materialsTotal: Object.keys(good.materials || {}).length,
    charChanges,
    weaponChanges,
    matChanges,
    mergedAccount
  };
}

export async function commitGoodImport(username, goodPayload, mergedAccount) {
  return postImportGoodJson(username, goodPayload, mergedAccount);
}
