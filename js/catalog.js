let cachedCatalog = null;
const YATTA_CACHE_KEY = 'aaru_yatta_catalog_v10';
const YATTA_TTL_MS = 24 * 60 * 60 * 1000;
const YATTA_UI_BASE = 'https://gi.yatta.moe/assets/UI/';

const ELEMENT_MAP = {
  Fire: 'Pyro',
  Water: 'Hydro',
  Wind: 'Anemo',
  Electric: 'Electro',
  Grass: 'Dendro',
  Ice: 'Cryo',
  Rock: 'Geo'
};

const WEAPON_TYPE_MAP = {
  WEAPON_SWORD_ONE_HAND: 'Sword',
  WEAPON_CLAYMORE: 'Claymore',
  WEAPON_POLE: 'Polearm',
  WEAPON_CATALYST: 'Catalyst',
  WEAPON_BOW: 'Bow'
};

let yattaMaps = {
  characters: new Map(),
  weapons: new Map(),
  materials: new Map(),
  lunarisVer: null,
  matIdLookup: {}
};
let catalogSource = 'fallback';
let catalogSyncedAt = null;
let lastCacheTs = null;

export function normalizeAssetKey(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildYattaMaps(raw) {
  const next = {
    characters: new Map(),
    weapons: new Map(),
    materials: new Map(),
    lunarisVer: raw?._lunarisVer || null,
    matIdLookup: raw?._matIdLookup || {}
  };
  for (const [normKey, entry] of Object.entries(raw?.characters || {})) {
    next.characters.set(normKey, entry);
  }
  for (const [normKey, entry] of Object.entries(raw?.weapons || {})) {
    next.weapons.set(normKey, entry);
  }
  for (const [normKey, entry] of Object.entries(raw?.materials || {})) {
    next.materials.set(normKey, entry);
  }
  yattaMaps = next;
}

async function loadSnapshotFallback() {
  try {
    const res = await fetch('./data/live-snapshot.json', { cache: 'no-cache' });
    if (!res.ok) return false;
    const snap = await res.json();
    if (!snap || (!snap.characters && !snap.weapons)) return false;
    buildYattaMaps(snap);
    catalogSource = 'snapshot';
    catalogSyncedAt = snap._syncedAt || null;
    lastCacheTs = null;
    return true;
  } catch {
    return false;
  }
}

async function fetchYattaCatalog(forceRefresh = false) {
  if (!forceRefresh) {
    try {
      const cachedRaw = localStorage.getItem(YATTA_CACHE_KEY);
      if (cachedRaw) {
        const parsed = JSON.parse(cachedRaw);
        if (parsed?.ts && Date.now() - parsed.ts < YATTA_TTL_MS && parsed.data) {
          buildYattaMaps(parsed.data);
          catalogSource = 'cache';
          catalogSyncedAt = parsed.data._syncedAt || null;
          lastCacheTs = parsed.ts;
          return;
        }
      }
    } catch {
      // Ignore localStorage read errors
    }
  }

  try {
    const [avatarRes, weaponRes, materialRes, upgradeRes, monsterRes, lunarisVerRes] = await Promise.allSettled([
      fetch('https://gi.yatta.moe/api/v2/en/avatar').then((r) => (r.ok ? r.json() : null)),
      fetch('https://gi.yatta.moe/api/v2/en/weapon').then((r) => (r.ok ? r.json() : null)),
      fetch('https://gi.yatta.moe/api/v2/en/material').then((r) => (r.ok ? r.json() : null)),
      fetch('https://gi.yatta.moe/api/v2/en/upgrade').then((r) => (r.ok ? r.json() : null)),
      fetch('https://gi.yatta.moe/api/v2/en/monster').then((r) => (r.ok ? r.json() : null)),
      fetch('https://api.lunaris.moe/data/version.json').then((r) => (r.ok ? r.json() : null))
    ]);

    const slim = { characters: {}, weapons: {}, materials: {} };
    const matNormById = new Map();
    const domainRewardNormSet = new Set();
    for (const dayList of Object.values(cachedCatalog?.domainSchedule || {})) {
      for (const dom of dayList || []) {
        for (const r of dom.rewards || []) {
          domainRewardNormSet.add(normalizeAssetKey(r.key));
        }
      }
    }

    if (materialRes.status === 'fulfilled' && materialRes.value?.data?.items) {
      for (const [id, item] of Object.entries(materialRes.value.data.items)) {
        const norm = normalizeAssetKey(item.name);
        if (norm) matNormById.set(String(id), { norm, name: item.name, rank: Number(item.rank) || 2 });
        if (!norm || !item.icon) continue;
        slim.materials[norm] = {
          name: item.name,
          rarity: Number(item.rank) || 2,
          category: item.type || 'Material',
          icon: `${YATTA_UI_BASE}${item.icon}.png`
        };
      }
    }

    const avatarUpgradeByNorm = new Map();
    const weaponUpgradeByNorm = new Map();
    if (upgradeRes.status === 'fulfilled' && upgradeRes.value?.data) {
      for (const item of Object.values(upgradeRes.value.data.avatar || {})) {
        const norm = normalizeAssetKey(item.name);
        if (!norm || !item.items) continue;
        const upg = {};
        for (const matId of Object.keys(item.items)) {
          const mat = matNormById.get(String(matId));
          if (!mat) continue;
          if (!upg.talentBook && (mat.name.startsWith('Philosophies of ') || domainRewardNormSet.has(mat.norm))) {
            upg.domainMatKey = mat.norm;
            upg.talentBook = mat.name.replace(/^Philosophies of\s+/i, '');
          } else if (/^113\d+$/.test(String(matId))) {
            const pascalMat = String(mat.name || '').replace(/[^a-zA-Z0-9]/g, '');
            if (mat.rank === 4 && !upg.bossMat) upg.bossMat = pascalMat;
            else if (mat.rank === 5 && !upg.weeklyMat) upg.weeklyMat = pascalMat;
          }
        }
        if (Object.keys(upg).length) avatarUpgradeByNorm.set(norm, upg);
      }
      for (const item of Object.values(upgradeRes.value.data.weapon || {})) {
        const norm = normalizeAssetKey(item.name);
        if (!norm || !item.items) continue;
        for (const matId of Object.keys(item.items)) {
          const mat = matNormById.get(String(matId));
          if (mat && domainRewardNormSet.has(mat.norm)) {
            weaponUpgradeByNorm.set(norm, {
              domainMatKey: mat.norm,
              domainMatExactKey: String(mat.name || '').replace(/[^a-zA-Z0-9]/g, '')
            });
            break;
          }
        }
      }
    }

    if (avatarRes.status === 'fulfilled' && avatarRes.value?.data?.items) {
      for (const item of Object.values(avatarRes.value.data.items)) {
        const norm = normalizeAssetKey(item.name);
        if (!norm || !item.icon) continue;
        const upg = avatarUpgradeByNorm.get(norm);
        const pascalKey = String(item.name || '').replace(/[^a-zA-Z0-9]/g, '');
        slim.characters[norm] = {
          pascalKey,
          name: item.name,
          rarity: Number(item.rank) || 5,
          element: ELEMENT_MAP[item.element] || item.element || 'Unknown',
          weaponType: WEAPON_TYPE_MAP[item.weaponType] || 'Sword',
          region: item.region || 'Teyvat',
          icon: `${YATTA_UI_BASE}${item.icon}.png`,
          ...(upg || {})
        };
      }
    }

    if (weaponRes.status === 'fulfilled' && weaponRes.value?.data?.items) {
      for (const item of Object.values(weaponRes.value.data.items)) {
        const norm = normalizeAssetKey(item.name);
        if (!norm || !item.icon || item.isWeaponSkin) continue;
        const upg = weaponUpgradeByNorm.get(norm);
        const pascalKey = String(item.name || '').replace(/[^a-zA-Z0-9]/g, '');
        slim.weapons[norm] = {
          pascalKey,
          name: item.name,
          rarity: Number(item.rank) || 4,
          weaponType: WEAPON_TYPE_MAP[item.type] || 'Sword',
          icon: `${YATTA_UI_BASE}${item.icon}.png`,
          ...(upg || {})
        };
      }
    }

    // Merge unreleased/datamine characters, weapons & materials from api.lunaris.moe
    const lunarisVer = lunarisVerRes.status === 'fulfilled' ? lunarisVerRes.value?.version : null;
    if (lunarisVer) {
      try {
        const [lCharRes, lWepRes, lMatRes, lMonRes] = await Promise.allSettled([
          fetch(`https://api.lunaris.moe/data/${encodeURIComponent(lunarisVer)}/charlist.json`).then((r) => (r.ok ? r.json() : null)),
          fetch(`https://api.lunaris.moe/data/${encodeURIComponent(lunarisVer)}/weaponlist.json`).then((r) => (r.ok ? r.json() : null)),
          fetch(`https://api.lunaris.moe/data/${encodeURIComponent(lunarisVer)}/materiallist.json`).then((r) => (r.ok ? r.json() : null)),
          fetch(`https://api.lunaris.moe/data/${encodeURIComponent(lunarisVer)}/monsterlist.json`).then((r) => (r.ok ? r.json() : null))
        ]);

        const yattaMonsterIds = new Set(
          monsterRes.status === 'fulfilled' && monsterRes.value?.data?.items
            ? Object.keys(monsterRes.value.data.items)
            : []
        );
        const lunarisMonsters = lMonRes.status === 'fulfilled' && lMonRes.value ? lMonRes.value : {};

        const matIdLookup = {};
        for (const [id, m] of matNormById.entries()) {
          matIdLookup[id] = m.name;
        }
        if (lMatRes.status === 'fulfilled' && lMatRes.value) {
          for (const [id, item] of Object.entries(lMatRes.value)) {
            const name = item?.enName;
            const norm = normalizeAssetKey(name);
            if (!norm) continue;
            matIdLookup[String(id)] = name;
            if (!slim.materials[norm] && item.icon) {
              slim.materials[norm] = {
                name,
                rarity: item.qualityType === 'QUALITY_ORANGE' ? 5 : item.qualityType === 'QUALITY_PURPLE' ? 4 : 3,
                category: item.type || 'Material',
                icon: `https://api.lunaris.moe/data/assets/items/${item.icon}.webp`
              };
            }
            if (/^113\d+$/.test(String(id)) && Array.isArray(item.sourceMonsters) && slim.materials[norm]?.rarity === 4) {
              const monId = String(item.sourceMonsters?.[0]?.[0] || '');
              const mon = monId ? lunarisMonsters[monId] : null;
              if (mon?.enName) {
                slim.materials[norm].bossName = mon.enName;
                slim.materials[norm].bossIcon = mon.icon
                  ? `https://api.lunaris.moe/data/assets/monstericon/${mon.icon}.webp`
                  : '';
                slim.materials[norm].bossUnreleased = yattaMonsterIds.size > 0 && !yattaMonsterIds.has(monId);
              }
            }
          }
        }
        slim._lunarisVer = lunarisVer;
        slim._matIdLookup = matIdLookup;

        if (lCharRes.status === 'fulfilled' && lCharRes.value) {
          for (const [charId, item] of Object.entries(lCharRes.value)) {
            const name = item?.enName;
            const norm = normalizeAssetKey(name);
            if (!norm || norm === 'traveler' || slim.characters[norm]) continue;
            const iconName = String(item.CardImg || '').replace(/^UI_Gacha_AvatarIcon_/, 'UI_AvatarIcon_');
            slim.characters[norm] = {
              lunarisId: charId,
              unreleased: true,
              pascalKey: String(name).replace(/[^a-zA-Z0-9]/g, ''),
              name,
              rarity: item.qualityType === 'QUALITY_ORANGE' ? 5 : 4,
              element: item.element || 'Unknown',
              weaponType: WEAPON_TYPE_MAP[item.weaponType] || 'Sword',
              region: 'Teyvat',
              icon: iconName ? `https://api.lunaris.moe/data/assets/avataricon/${iconName}.webp` : ''
            };
          }
        }

        if (lWepRes.status === 'fulfilled' && lWepRes.value) {
          for (const [wepId, item] of Object.entries(lWepRes.value)) {
            const name = item?.enName;
            const norm = normalizeAssetKey(name);
            if (!norm || slim.weapons[norm]) continue;
            slim.weapons[norm] = {
              lunarisId: wepId,
              pascalKey: String(name).replace(/[^a-zA-Z0-9]/g, ''),
              name,
              rarity: item.qualityType === 'QUALITY_ORANGE' ? 5 : item.qualityType === 'QUALITY_PURPLE' ? 4 : 3,
              weaponType: WEAPON_TYPE_MAP[item.weaponType] || 'Sword',
              icon: item.weaponIcon ? `https://api.lunaris.moe/data/assets/weaponicon/${item.weaponIcon}.webp` : ''
            };
          }
        }
      } catch {
        // Ignore Lunaris fallback errors
      }
    }

    if (!Object.keys(slim.characters).length && !Object.keys(slim.weapons).length) {
      const ok = await loadSnapshotFallback();
      if (ok) return;
    }

    buildYattaMaps(slim);
    catalogSource = 'live';
    catalogSyncedAt = new Date().toISOString();
    lastCacheTs = Date.now();
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith('aaru_yatta_catalog_') && k !== YATTA_CACHE_KEY) {
          localStorage.removeItem(k);
        }
      }
      localStorage.setItem(YATTA_CACHE_KEY, JSON.stringify({ ts: lastCacheTs, data: slim }));
    } catch {
      // Ignore quota errors
    }
  } catch (err) {
    console.warn('Project Amber (gi.yatta.moe) asset fetch failed, trying local snapshot:', err);
    await loadSnapshotFallback();
  }
}

export function getCatalogStatus() {
  return {
    source: catalogSource,
    lunarisVer: yattaMaps.lunarisVer || 'Unknown',
    syncedAt: catalogSyncedAt,
    cacheTs: lastCacheTs,
    charCount: yattaMaps.characters.size,
    weaponCount: yattaMaps.weapons.size,
    materialCount: yattaMaps.materials.size
  };
}

export async function refreshLiveCatalog() {
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('aaru_yatta_catalog_')) localStorage.removeItem(k);
    }
  } catch {
    // Ignore storage errors
  }
  await fetchYattaCatalog(true);
  return getCatalogStatus();
}

export function getLiveAssetEntry(type, pascalKey) {
  const map = yattaMaps[type];
  if (!map || !pascalKey) return null;
  const norm = normalizeAssetKey(pascalKey);
  if (map.has(norm)) return map.get(norm);
  if (type === 'characters' && norm.startsWith('traveler')) {
    return map.get('traveler') || null;
  }
  return null;
}

export async function loadCatalog() {
  if (cachedCatalog) return cachedCatalog;
  try {
    const res = await fetch('./data/catalog.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    cachedCatalog = await res.json();
  } catch (err) {
    console.warn('Failed to fetch data/catalog.json, using minimal fallback.', err);
    cachedCatalog = {
      characters: {},
      weapons: {},
      materials: {},
      domainSchedule: {},
      costCurves: {
        characterExpByLevelCap: {
          20: { mora: 24200, wits: 6 },
          40: { mora: 115800, wits: 29 },
          50: { mora: 232000, wits: 58 },
          60: { mora: 380000, wits: 95 },
          70: { mora: 590000, wits: 148 },
          80: { mora: 912000, wits: 228 },
          90: { mora: 1673400, wits: 419 },
          95: { mora: 2250000, wits: 565 }
        },
        ascensionByPhase: {},
        talentByLevel: {}
      }
    };
  }
  await fetchYattaCatalog();
  return cachedCatalog;
}

export function getCatalog() {
  return cachedCatalog;
}

export function splitPascalCase(key) {
  if (!key) return '';
  return String(key)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
}

export function getCharacterMeta(key) {
  const catalog = getCatalog();
  const base = catalog?.characters?.[key];
  const live = getLiveAssetEntry('characters', key);
  if (base) {
    return live
      ? {
          ...live,
          ...base,
          domainMatKey: base.domainMatKey || live.domainMatKey,
          talentBook: base.talentBook || live.talentBook,
          bossMat: base.bossMat || live.bossMat,
          weeklyMat: base.weeklyMat || live.weeklyMat
        }
      : base;
  }
  return (
    (live ? { key, ...live } : null) || {
      key,
      name: splitPascalCase(key),
      rarity: 5,
      element: 'Unknown',
      weaponType: 'Sword',
      region: 'Teyvat'
    }
  );
}

export function getWeaponMeta(key) {
  const catalog = getCatalog();
  const base = catalog?.weapons?.[key];
  const live = getLiveAssetEntry('weapons', key);
  if (base) {
    return live ? { ...live, ...base, domainMatKey: base.domainMatKey || live.domainMatKey } : base;
  }
  return (
    (live ? { key, substat: '', ...live } : null) || {
      key,
      name: splitPascalCase(key),
      rarity: 4,
      weaponType: 'Sword',
      substat: ''
    }
  );
}

export function getMaterialMeta(key) {
  const catalog = getCatalog();
  const base = catalog?.materials?.[key];
  const live = getLiveAssetEntry('materials', key);
  if (base) {
    return live ? { ...live, ...base, icon: base.icon || live.icon } : base;
  }
  return (
    (live ? { key, daysOfWeek: [], ...live } : null) || {
      key,
      name: splitPascalCase(key),
      rarity: 2,
      category: 'Material',
      daysOfWeek: []
    }
  );
}

export function getDomainScheduleForDay(dayName) {
  const catalog = getCatalog();
  return catalog?.domainSchedule?.[dayName] || [];
}

export function getAllCharacterKeys() {
  const catalog = getCatalog();
  const byNorm = new Map();
  for (const key of Object.keys(catalog?.characters || {})) {
    byNorm.set(normalizeAssetKey(key), key);
  }
  for (const [norm, entry] of yattaMaps.characters.entries()) {
    if (norm === 'traveler') continue;
    if (!byNorm.has(norm)) {
      byNorm.set(norm, entry.pascalKey || entry.name.replace(/[^a-zA-Z0-9]/g, ''));
    }
  }
  return Array.from(byNorm.values()).sort((a, b) => a.localeCompare(b));
}

const pendingDetailFetches = new Map();

export async function ensureCharacterMaterials(pascalKey) {
  const norm = normalizeAssetKey(pascalKey);
  const entry = yattaMaps.characters.get(norm);
  if (!entry || entry._hydrated || (entry.talentBook && entry.bossMat) || !entry.lunarisId || !yattaMaps.lunarisVer) return false;
  if (pendingDetailFetches.has(norm)) return pendingDetailFetches.get(norm);

  const task = (async () => {
    try {
      const url = `https://api.lunaris.moe/data/${encodeURIComponent(yattaMaps.lunarisVer)}/en/char/${encodeURIComponent(entry.lunarisId)}.json`;
      const res = await fetch(url);
      if (!res.ok) {
        entry._hydrated = true;
        return false;
      }
      const detail = await res.json();
      entry._hydrated = true;
      const lookup = yattaMaps.matIdLookup || {};
      const toPascal = (s) => String(s || '').replace(/[^a-zA-Z0-9]/g, '');

      const booksObj = detail?.skills?.leveling?.books || {};
      for (const matId of Object.keys(booksObj)) {
        const matName = lookup[String(matId)];
        if (matName && /^Philosophies of /i.test(matName)) {
          entry.talentBook = matName.replace(/^Philosophies of\s+/i, '');
          entry.domainMatKey = normalizeAssetKey(matName);
          break;
        }
      }

      const lastAsc = Array.isArray(detail?.ascension)
        ? detail.ascension[detail.ascension.length - 1]
        : detail?.ascension || null;
      const bossId = lastAsc?.elitemonster ? Object.keys(lastAsc.elitemonster)[0] : null;
      if (bossId && lookup[bossId]) entry.bossMat = toPascal(lookup[bossId]);

      const specId = lastAsc?.speciality ? Object.keys(lastAsc.speciality)[0] : null;
      if (specId && lookup[specId]) entry.localSpecialty = toPascal(lookup[specId]);

      const weeklyObj = detail?.skills?.leveling?.weekly || {};
      const weeklyId = Object.keys(weeklyObj)[0];
      if (weeklyId && lookup[weeklyId]) entry.weeklyMat = toPascal(lookup[weeklyId]);

      // Persist updated entry back to localStorage cache
      try {
        const cached = JSON.parse(localStorage.getItem(YATTA_CACHE_KEY) || '{}');
        if (cached?.data?.characters?.[norm]) {
          cached.data.characters[norm] = entry;
          localStorage.setItem(YATTA_CACHE_KEY, JSON.stringify(cached));
        }
      } catch {
        // Ignore storage errors
      }
      return Boolean(entry.talentBook || entry.bossMat || entry.localSpecialty);
    } catch {
      return false;
    } finally {
      pendingDetailFetches.delete(norm);
    }
  })();

  pendingDetailFetches.set(norm, task);
  return task;
}

const pendingWeaponFetches = new Map();

export async function ensureWeaponMaterials(pascalKey) {
  const norm = normalizeAssetKey(pascalKey);
  const entry = yattaMaps.weapons.get(norm);
  if (!entry || entry._hydrated || entry.domainMatExactKey || !entry.lunarisId || !yattaMaps.lunarisVer) return false;
  if (pendingWeaponFetches.has(norm)) return pendingWeaponFetches.get(norm);

  const task = (async () => {
    try {
      const url = `https://api.lunaris.moe/data/${encodeURIComponent(yattaMaps.lunarisVer)}/en/weapon/${encodeURIComponent(entry.lunarisId)}.json`;
      const res = await fetch(url);
      if (!res.ok) {
        entry._hydrated = true;
        return false;
      }
      const detail = await res.json();
      entry._hydrated = true;
      const lookup = yattaMaps.matIdLookup || {};
      const toPascal = (s) => String(s || '').replace(/[^a-zA-Z0-9]/g, '');

      const asc = Array.isArray(detail?.ascension) ? detail.ascension : [];
      // Weapon domain mats have IDs 114xxx; pick the highest tier (last 114xxx entry)
      const domainMats = asc
        .map((a) => String(a?.icon || '').replace(/^UI_ItemIcon_/, ''))
        .filter((id) => /^114\d+$/.test(id));
      const goldId = domainMats[domainMats.length - 1];
      if (goldId && lookup[goldId]) {
        entry.domainMatExactKey = toPascal(lookup[goldId]);
        entry.domainMatKey = normalizeAssetKey(lookup[goldId]);
      }

      try {
        const cached = JSON.parse(localStorage.getItem(YATTA_CACHE_KEY) || '{}');
        if (cached?.data?.weapons?.[norm]) {
          cached.data.weapons[norm] = entry;
          localStorage.setItem(YATTA_CACHE_KEY, JSON.stringify(cached));
        }
      } catch {
        // Ignore storage errors
      }
      return Boolean(entry.domainMatExactKey);
    } catch {
      return false;
    } finally {
      pendingWeaponFetches.delete(norm);
    }
  })();

  pendingWeaponFetches.set(norm, task);
  return task;
}

export function getAllWeaponKeys() {
  const catalog = getCatalog();
  const byNorm = new Map();
  for (const key of Object.keys(catalog?.weapons || {})) {
    byNorm.set(normalizeAssetKey(key), key);
  }
  for (const [norm, entry] of yattaMaps.weapons.entries()) {
    if ((Number(entry.rarity) || 4) < 3) continue;
    if (!byNorm.has(norm)) {
      byNorm.set(norm, entry.pascalKey || entry.name.replace(/[^a-zA-Z0-9]/g, ''));
    }
  }
  return Array.from(byNorm.values()).sort((a, b) => a.localeCompare(b));
}
