let cachedCatalog = null;
let cachedKqmTcl = {};
let cachedWeaponsIndex = [];
const CATALOG_CACHE_PREFIX = 'aaru_catalog_v';
const CATALOG_LATEST_PTR = 'aaru_catalog_latest_patch';
const KIT_CACHE_KEY = 'aaru_kit_cache_v6';
const CATALOG_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const YATTA_UI_BASE = 'https://gi.yatta.moe/assets/UI/';

function getActiveCatalogCacheKey() {
  if (yattaMaps.lunarisVer) {
    return `${CATALOG_CACHE_PREFIX}${yattaMaps.lunarisVer}`;
  }
  try {
    const latestPatch = localStorage.getItem(CATALOG_LATEST_PTR);
    if (latestPatch) return `${CATALOG_CACHE_PREFIX}${latestPatch}`;
    return Object.keys(localStorage).find((k) => k.startsWith(CATALOG_CACHE_PREFIX)) || `${CATALOG_CACHE_PREFIX}live`;
  } catch {
    return `${CATALOG_CACHE_PREFIX}live`;
  }
}

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
  artifacts: new Map(),
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
    artifacts: new Map(),
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
  for (const [normKey, entry] of Object.entries(raw?.artifacts || {})) {
    next.artifacts.set(normKey, entry);
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
      const cacheKey = getActiveCatalogCacheKey();
      const cachedRaw = localStorage.getItem(cacheKey);
      if (cachedRaw) {
        const parsed = JSON.parse(cachedRaw);
        if (parsed?.ts && Date.now() - parsed.ts < CATALOG_TTL_MS && parsed.data && parsed.data._lunarisVer) {
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
    const [avatarRes, weaponRes, materialRes, upgradeRes, monsterRes, reliquaryRes, lunarisVerRes] = await Promise.allSettled([
      fetch('https://gi.yatta.moe/api/v2/en/avatar').then((r) => (r.ok ? r.json() : null)),
      fetch('https://gi.yatta.moe/api/v2/en/weapon').then((r) => (r.ok ? r.json() : null)),
      fetch('https://gi.yatta.moe/api/v2/en/material').then((r) => (r.ok ? r.json() : null)),
      fetch('https://gi.yatta.moe/api/v2/en/upgrade').then((r) => (r.ok ? r.json() : null)),
      fetch('https://gi.yatta.moe/api/v2/en/monster').then((r) => (r.ok ? r.json() : null)),
      fetch('https://gi.yatta.moe/api/v2/en/reliquary').then((r) => (r.ok ? r.json() : null)),
      fetch('https://api.lunaris.moe/data/version.json').then((r) => (r.ok ? r.json() : null))
    ]);

    const slim = { characters: {}, weapons: {}, materials: {}, artifacts: {} };
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
          id: String(id),
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
        const monsterDrops = [];
        const gemDrops = [];
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
          } else if (/^112\d+$/.test(String(matId))) {
            monsterDrops.push({ id: Number(matId), rank: mat.rank, pascal: String(mat.name || '').replace(/[^a-zA-Z0-9]/g, '') });
          } else if (/^1041\d\d$/.test(String(matId))) {
            gemDrops.push({ id: Number(matId), rank: mat.rank, pascal: String(mat.name || '').replace(/[^a-zA-Z0-9]/g, '') });
          }
        }
        if (monsterDrops.length >= 3) {
          monsterDrops.sort((a, b) => a.id - b.id);
          upg.commonMatTiers = monsterDrops.slice(0, 3).map((m) => m.pascal);
        }
        if (gemDrops.length >= 4) {
          gemDrops.sort((a, b) => a.id - b.id);
          upg.gemTiers = gemDrops.slice(0, 4).map((g) => g.pascal);
        }
        if (Object.keys(upg).length) avatarUpgradeByNorm.set(norm, upg);
      }
      for (const item of Object.values(upgradeRes.value.data.weapon || {})) {
        const norm = normalizeAssetKey(item.name);
        if (!norm || !item.items) continue;
        const wUpg = {};
        let commonT1Id = null;
        let eliteT4Id = null;
        for (const matId of Object.keys(item.items)) {
          const mat = matNormById.get(String(matId));
          if (!mat) continue;
          if (!wUpg.domainMatExactKey && domainRewardNormSet.has(mat.norm)) {
            wUpg.domainMatKey = mat.norm;
            wUpg.domainMatExactKey = String(mat.name || '').replace(/[^a-zA-Z0-9]/g, '');
          } else if (/^112\d+$/.test(String(matId))) {
            if (mat.rank === 1) commonT1Id = Number(matId);
            else if (mat.rank === 4) eliteT4Id = Number(matId);
          }
        }
        const resolveTiers = (ids) =>
          ids
            .map((id) => matNormById.get(String(id))?.name)
            .filter(Boolean)
            .map((n) => String(n).replace(/[^a-zA-Z0-9]/g, ''));
        if (commonT1Id !== null) {
          const tiers = resolveTiers([commonT1Id, commonT1Id + 1, commonT1Id + 2]);
          if (tiers.length === 3) wUpg.commonMatTiers = tiers;
        }
        if (eliteT4Id !== null) {
          const tiers = resolveTiers([eliteT4Id - 2, eliteT4Id - 1, eliteT4Id]);
          if (tiers.length === 3) wUpg.eliteMatTiers = tiers;
        }
        if (Object.keys(wUpg).length) weaponUpgradeByNorm.set(norm, wUpg);
      }
    }

    if (avatarRes.status === 'fulfilled' && avatarRes.value?.data?.items) {
      for (const [id, item] of Object.entries(avatarRes.value.data.items)) {
        const norm = normalizeAssetKey(item.name);
        if (!norm || !item.icon) continue;
        const upg = avatarUpgradeByNorm.get(norm);
        const pascalKey = String(item.name || '').replace(/[^a-zA-Z0-9]/g, '');
        slim.characters[norm] = {
          id: String(id),
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
      for (const [id, item] of Object.entries(weaponRes.value.data.items)) {
        const norm = normalizeAssetKey(item.name);
        if (!norm || !item.icon || item.isWeaponSkin) continue;
        const upg = weaponUpgradeByNorm.get(norm);
        const pascalKey = String(item.name || '').replace(/[^a-zA-Z0-9]/g, '');
        slim.weapons[norm] = {
          id: String(id),
          pascalKey,
          name: item.name,
          rarity: Number(item.rank) || 4,
          weaponType:
            WEAPON_TYPE_MAP[item.type] ||
            WEAPON_TYPE_MAP[item.weaponType] ||
            (['Sword', 'Claymore', 'Polearm', 'Catalyst', 'Bow'].includes(item.type) ? item.type : 'Sword'),
          icon: `${YATTA_UI_BASE}${item.icon}.png`,
          ...(upg || {})
        };
      }
    }

    if (reliquaryRes.status === 'fulfilled' && reliquaryRes.value?.data?.items) {
      for (const [id, item] of Object.entries(reliquaryRes.value.data.items)) {
        const norm = normalizeAssetKey(item.name);
        if (!norm || !item.icon) continue;
        slim.artifacts[norm] = {
          name: item.name,
          setId: String(id),
          icon: item.icon,
          source: 'yatta'
        };
      }
    }

    // Merge unreleased/datamine characters, weapons & materials from api.lunaris.moe
    const lunarisVer = lunarisVerRes.status === 'fulfilled' ? lunarisVerRes.value?.version : null;
    if (lunarisVer) {
      try {
        const [lCharRes, lWepRes, lMatRes, lMonRes, lRelicRes] = await Promise.allSettled([
          fetch(`https://api.lunaris.moe/data/${encodeURIComponent(lunarisVer)}/charlist.json`).then((r) => (r.ok ? r.json() : null)),
          fetch(`https://api.lunaris.moe/data/${encodeURIComponent(lunarisVer)}/weaponlist.json`).then((r) => (r.ok ? r.json() : null)),
          fetch(`https://api.lunaris.moe/data/${encodeURIComponent(lunarisVer)}/materiallist.json`).then((r) => (r.ok ? r.json() : null)),
          fetch(`https://api.lunaris.moe/data/${encodeURIComponent(lunarisVer)}/monsterlist.json`).then((r) => (r.ok ? r.json() : null)),
          fetch(`https://api.lunaris.moe/data/${encodeURIComponent(lunarisVer)}/reliquarylist.json`).then((r) => (r.ok ? r.json() : null))
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
              const qMap = { QUALITY_WHITE: 1, QUALITY_GRAY: 1, QUALITY_GREEN: 2, QUALITY_BLUE: 3, QUALITY_PURPLE: 4, QUALITY_ORANGE: 5 };
              slim.materials[norm] = {
                id: String(id),
                name,
                rarity: qMap[item.qualityType] || 3,
                category: item.type || 'Material',
                description: item.enDescription || '',
                sources: Array.isArray(item.enSources) ? item.enSources.filter(Boolean) : [],
                icon: `https://api.lunaris.moe/data/assets/items/${item.icon}.webp`
              };
            } else if (slim.materials[norm] && !slim.materials[norm].id) {
              slim.materials[norm].id = String(id);
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

        if (lRelicRes.status === 'fulfilled' && lRelicRes.value) {
          for (const [relicId, item] of Object.entries(lRelicRes.value)) {
            const name = item?.enName || item?.name;
            const norm = normalizeAssetKey(name);
            if (!norm || slim.artifacts[norm]) continue;
            const iconName = item?.icon || `UI_RelicIcon_${relicId}_4`;
            slim.artifacts[norm] = {
              name,
              setId: String(relicId),
              icon: iconName,
              source: 'lunaris'
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

    // If Lunaris API was unreachable/slow, merge unreleased characters/weapons/materials from local snapshot
    if (!slim._lunarisVer) {
      try {
        const snapRes = await fetch('./data/live-snapshot.json', { cache: 'no-cache' });
        if (snapRes.ok) {
          const snap = await snapRes.json();
          if (snap) {
            for (const bucket of ['characters', 'weapons', 'materials', 'artifacts']) {
              for (const [k, v] of Object.entries(snap[bucket] || {})) {
                if (!slim[bucket][k]) slim[bucket][k] = v;
              }
            }
            if (snap._lunarisVer) slim._lunarisVer = snap._lunarisVer;
            if (snap._matIdLookup) slim._matIdLookup = { ...snap._matIdLookup, ...(slim._matIdLookup || {}) };
          }
        }
      } catch {
        // Ignore snapshot merge errors
      }
    }

    buildYattaMaps(slim);
    catalogSource = 'live';
    catalogSyncedAt = new Date().toISOString();
    lastCacheTs = Date.now();
    try {
      const patchVer = slim._lunarisVer || 'live';
      const cacheKey = `${CATALOG_CACHE_PREFIX}${patchVer}`;
      for (const k of Object.keys(localStorage)) {
        if ((k.startsWith(CATALOG_CACHE_PREFIX) && k !== cacheKey) || k.startsWith('aaru_yatta_catalog_')) {
          localStorage.removeItem(k);
        }
      }
      localStorage.setItem(cacheKey, JSON.stringify({ ts: lastCacheTs, patch: patchVer, data: slim }));
      localStorage.setItem(CATALOG_LATEST_PTR, patchVer);
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
      if (k.startsWith(CATALOG_CACHE_PREFIX) || k.startsWith('aaru_yatta_catalog_') || k === CATALOG_LATEST_PTR) {
        localStorage.removeItem(k);
      }
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

export function getWeaponsIndex() {
  return cachedWeaponsIndex;
}

export async function loadCatalog() {
  if (cachedCatalog) return cachedCatalog;
  const [catRes, kqmRes, wepIdxRes] = await Promise.allSettled([
    fetch('./data/catalog.json', { cache: 'no-cache' }),
    fetch('./data/kqm-tcl.json', { cache: 'no-cache' }),
    fetch('./data/weapons_index.json', { cache: 'no-cache' })
  ]);

  if (kqmRes.status === 'fulfilled' && kqmRes.value?.ok) {
    try {
      cachedKqmTcl = (await kqmRes.value.json()) || {};
    } catch {
      cachedKqmTcl = {};
    }
  }

  if (wepIdxRes.status === 'fulfilled' && wepIdxRes.value?.ok) {
    try {
      const wepIdxJson = await wepIdxRes.value.json();
      cachedWeaponsIndex = Array.isArray(wepIdxJson?.weapons) ? wepIdxJson.weapons : [];
    } catch {
      cachedWeaponsIndex = [];
    }
  }

  try {
    if (catRes.status !== 'fulfilled' || !catRes.value?.ok) {
      throw new Error(`HTTP ${catRes.value?.status || 'fetch error'}`);
    }
    cachedCatalog = await catRes.value.json();
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

export function getKqmEntry(pascalKey) {
  if (!pascalKey || !cachedKqmTcl) return null;
  if (cachedKqmTcl[pascalKey]) return cachedKqmTcl[pascalKey];
  const norm = normalizeAssetKey(pascalKey);
  for (const [k, v] of Object.entries(cachedKqmTcl)) {
    if (k === '_meta') continue;
    if (normalizeAssetKey(k) === norm) return v;
  }
  return null;
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
          weeklyMat: base.weeklyMat || live.weeklyMat,
          commonMatTiers: base.commonMatTiers || live.commonMatTiers,
          gemTiers: base.gemTiers || live.gemTiers
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
    return live
      ? {
          ...live,
          ...base,
          domainMatKey: base.domainMatKey || live.domainMatKey,
          commonMatTiers: base.commonMatTiers || live.commonMatTiers,
          eliteMatTiers: base.eliteMatTiers || live.eliteMatTiers
        }
      : base;
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
    return live ? { ...live, ...base, icon: base.icon || live.icon, id: base.id || live.id } : base;
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

const materialDetailsCache = new Map();

const UNIVERSAL_CURRENCY_IDS = new Set(['202', '104001', '104002', '104003', '104011', '104012', '104013']);

function cleanMaterialSources(matId, sources) {
  const unique = [...new Set((Array.isArray(sources) ? sources : []).map((s) => String(s || '').trim()).filter(Boolean))];
  if (!UNIVERSAL_CURRENCY_IDS.has(String(matId || ''))) return unique;
  let hadDomain = false;
  const filtered = unique.filter((s) => {
    if (/^Domain of (Mastery|Forgery):/i.test(s)) {
      hadDomain = true;
      return false;
    }
    return true;
  });
  if (hadDomain && !filtered.some((s) => /Domains?\s*&?\s*Ley Line/i.test(s))) {
    filtered.push('Domains & Ley Line Outcrops');
  }
  return filtered;
}

export async function getMaterialDetails(matKeyOrId) {
  const raw = String(matKeyOrId || '').trim();
  if (!raw) return null;
  const cacheKey = normalizeAssetKey(raw) || raw;
  if (materialDetailsCache.has(cacheKey)) return materialDetailsCache.get(cacheKey);

  const meta = /^\d+$/.test(raw) ? null : getMaterialMeta(raw);
  let matId = /^\d+$/.test(raw) ? raw : meta?.id || '';
  if (!matId && yattaMaps.matIdLookup) {
    const targetNorm = normalizeAssetKey(meta?.name || raw);
    for (const [id, name] of Object.entries(yattaMaps.matIdLookup)) {
      if (normalizeAssetKey(name) === targetNorm) {
        matId = id;
        break;
      }
    }
  }

  const fallbackResult = {
    id: matId,
    name: meta?.name || splitPascalCase(raw),
    rank: Number(meta?.rarity) || 3,
    type: meta?.category || 'Material',
    description: meta?.description || '',
    sources: cleanMaterialSources(matId, meta?.sources)
  };

  if (fallbackResult.description || fallbackResult.sources.length) {
    materialDetailsCache.set(cacheKey, fallbackResult);
    return fallbackResult;
  }

  const formatYattaSources = (srcList) =>
    (Array.isArray(srcList) ? srcList : [])
      .map((s) => {
        if (!s) return '';
        if (typeof s === 'string') return s;
        const name = String(s.name || '').trim();
        if (!name) return '';
        if (Array.isArray(s.days) && s.days.length) {
          const days = s.days.map((d) => String(d).slice(0, 3).replace(/^[a-z]/, (c) => c.toUpperCase())).join('/');
          return `${name} (${days})`;
        }
        return name;
      })
      .filter(Boolean);

  if (matId) {
    try {
      const res = await fetch(`https://gi.yatta.moe/api/v2/en/material/${encodeURIComponent(matId)}`);
      if (res.ok) {
        const json = await res.json();
        const d = json?.data;
        if (d) {
          const parsed = {
            id: matId,
            name: d.name || fallbackResult.name,
            rank: Number(d.rank) || fallbackResult.rank,
            type: d.type || fallbackResult.type,
            description: d.description || '',
            sources: cleanMaterialSources(matId, formatYattaSources(d.source))
          };
          materialDetailsCache.set(cacheKey, parsed);
          return parsed;
        }
      }
    } catch {
      // Fall through to Lunaris fallback
    }

    if (yattaMaps.lunarisVer) {
      try {
        const res = await fetch(`https://api.lunaris.moe/data/${encodeURIComponent(yattaMaps.lunarisVer)}/materiallist.json`);
        if (res.ok) {
          const list = await res.json();
          const item = list?.[matId];
          if (item) {
            const qMap = { QUALITY_WHITE: 1, QUALITY_GRAY: 1, QUALITY_GREEN: 2, QUALITY_BLUE: 3, QUALITY_PURPLE: 4, QUALITY_ORANGE: 5 };
            const parsed = {
              id: matId,
              name: item.enName || fallbackResult.name,
              rank: qMap[item.qualityType] || fallbackResult.rank,
              type: item.type || fallbackResult.type,
              description: item.enDescription || '',
              sources: cleanMaterialSources(matId, item.enSources)
            };
            materialDetailsCache.set(cacheKey, parsed);
            return parsed;
          }
        }
      } catch {
        // Ignore fallback failure
      }
    }
  }

  materialDetailsCache.set(cacheKey, fallbackResult);
  return fallbackResult;
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
  if (!entry || entry._hydrated || (entry.talentBook && entry.bossMat && entry.commonMatTiers && entry.gemTiers) || !entry.lunarisId || !yattaMaps.lunarisVer) return false;
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

      const skillMonsterIds = Object.keys(detail?.skills?.leveling?.worldmonster || detail?.skills?.leveling?.monster || {})
        .filter((id) => /^112\d+$/.test(id))
        .map(Number)
        .sort((a, b) => a - b);
      if (skillMonsterIds.length >= 3) {
        const tiers = skillMonsterIds.slice(0, 3).map((id) => toPascal(lookup[String(id)])).filter(Boolean);
        if (tiers.length === 3) entry.commonMatTiers = tiers;
      } else {
        const ascMonsterIds = Object.keys(lastAsc?.worldmonster || lastAsc?.monster || {})
          .filter((id) => /^112\d+$/.test(id))
          .map(Number)
          .sort((a, b) => a - b);
        if (ascMonsterIds.length >= 3) {
          const tiers = ascMonsterIds.slice(0, 3).map((id) => toPascal(lookup[String(id)])).filter(Boolean);
          if (tiers.length === 3) entry.commonMatTiers = tiers;
        }
      }

      const gemIds = Object.keys(lastAsc?.elemental || {})
        .filter((id) => /^1041\d\d$/.test(id))
        .map(Number)
        .sort((a, b) => a - b);
      if (gemIds.length >= 4) {
        const gTiers = gemIds.slice(0, 4).map((id) => toPascal(lookup[String(id)])).filter(Boolean);
        if (gTiers.length === 4) entry.gemTiers = gTiers;
      }

      // Persist updated entry back to localStorage cache
      try {
        const cacheKey = getActiveCatalogCacheKey();
        const cached = JSON.parse(localStorage.getItem(cacheKey) || '{}');
        if (cached?.data?.characters?.[norm]) {
          cached.data.characters[norm] = entry;
          localStorage.setItem(cacheKey, JSON.stringify(cached));
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
  if (!entry || entry._hydrated || (entry.domainMatExactKey && entry.commonMatTiers && entry.eliteMatTiers) || !entry.lunarisId || !yattaMaps.lunarisVer) return false;
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

      const monsterMats = asc
        .map((a) => String(a?.icon || '').replace(/^UI_ItemIcon_/, ''))
        .filter((id) => /^112\d+$/.test(id));
      const findRarityId = (r) =>
        monsterMats.find((id) => {
          const name = lookup[id];
          if (!name) return false;
          return yattaMaps.materials.get(normalizeAssetKey(name))?.rarity === r;
        });
      const resolveDropTiers = (ids) =>
        ids.map((id) => toPascal(lookup[String(id)])).filter(Boolean);
      const commonT1Id = findRarityId(1);
      if (commonT1Id) {
        const baseId = Number(commonT1Id);
        const tiers = resolveDropTiers([baseId, baseId + 1, baseId + 2]);
        if (tiers.length === 3) entry.commonMatTiers = tiers;
      }
      const eliteT4Id = findRarityId(4);
      if (eliteT4Id) {
        const topId = Number(eliteT4Id);
        const tiers = resolveDropTiers([topId - 2, topId - 1, topId]);
        if (tiers.length === 3) entry.eliteMatTiers = tiers;
      }

      try {
        const cacheKey = getActiveCatalogCacheKey();
        const cached = JSON.parse(localStorage.getItem(cacheKey) || '{}');
        if (cached?.data?.weapons?.[norm]) {
          cached.data.weapons[norm] = entry;
          localStorage.setItem(cacheKey, JSON.stringify(cached));
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

const ARTIFACT_SLOT_NUM = {
  flower: '4',
  plume: '2',
  sands: '5',
  goblet: '1',
  circlet: '3'
};

/**
 * Resolve an artifact slot's UI icon URL from Project Amber / Lunaris catalog data.
 * @param {string} setKey - GOOD setKey or artifact set display name.
 * @param {string} slotKey - flower | plume | sands | goblet | circlet.
 * @returns {string} Icon URL or empty string if unknown.
 */
export function getArtifactIcon(setKey, slotKey) {
  const entry = yattaMaps.artifacts.get(normalizeAssetKey(setKey));
  if (!entry?.icon) return '';
  const slotNum = ARTIFACT_SLOT_NUM[String(slotKey || '').toLowerCase()] || '4';
  const baseIcon = String(entry.icon).replace(/_\d+$/, `_${slotNum}`);
  if (entry.source === 'lunaris') {
    return `https://api.lunaris.moe/data/assets/reliquary/${baseIcon}.webp`;
  }
  return `https://gi.yatta.moe/assets/UI/reliquary/${baseIcon}.png`;
}

const FIGHT_PROP_TO_STAT = {
  FIGHT_PROP_HP_PERCENT: 'hp_',
  FIGHT_PROP_ATTACK_PERCENT: 'atk_',
  FIGHT_PROP_DEFENSE_PERCENT: 'def_',
  FIGHT_PROP_ELEMENT_MASTERY: 'eleMas',
  FIGHT_PROP_CHARGE_EFFICIENCY: 'enerRech_',
  FIGHT_PROP_CRITICAL: 'critRate_',
  FIGHT_PROP_CRITICAL_HURT: 'critDMG_',
  FIGHT_PROP_HEAL_ADD: 'heal_',
  FIGHT_PROP_PHYSICAL_ADD_HURT: 'physical_dmg_',
  FIGHT_PROP_FIRE_ADD_HURT: 'pyro_dmg_',
  FIGHT_PROP_WATER_ADD_HURT: 'hydro_dmg_',
  FIGHT_PROP_WIND_ADD_HURT: 'anemo_dmg_',
  FIGHT_PROP_ELEC_ADD_HURT: 'electro_dmg_',
  FIGHT_PROP_GRASS_ADD_HURT: 'dendro_dmg_',
  FIGHT_PROP_ICE_ADD_HURT: 'cryo_dmg_',
  FIGHT_PROP_ROCK_ADD_HURT: 'geo_dmg_'
};

const BASE_FIGHT_PROPS = new Set([
  'FIGHT_PROP_BASE_HP',
  'FIGHT_PROP_BASE_ATTACK',
  'FIGHT_PROP_BASE_DEFENSE'
]);

function cleanYattaText(str) {
  return String(str || '')
    .replace(/\{LINK#[^}]*\}/gi, '')
    .replace(/\{\/LINK\}/gi, '')
    .replace(/\{LAYOUT_[^}]*#([^}]*)\}/gi, '$1')
    .replace(/\\n/g, '\n')
    .trim();
}

let kitCacheMem = null;
function loadKitCache() {
  if (kitCacheMem) return kitCacheMem;
  try {
    const parsed = JSON.parse(localStorage.getItem(KIT_CACHE_KEY) || '{}');
    kitCacheMem = {
      chars: parsed?.chars && typeof parsed.chars === 'object' ? parsed.chars : {},
      weapons: parsed?.weapons && typeof parsed.weapons === 'object' ? parsed.weapons : {}
    };
  } catch {
    kitCacheMem = { chars: {}, weapons: {} };
  }
  return kitCacheMem;
}

function saveKitCache() {
  try {
    localStorage.setItem(KIT_CACHE_KEY, JSON.stringify(loadKitCache()));
  } catch {
    // Ignore localStorage quota errors
  }
}

let avatarCurvePromise = null;
let weaponCurvePromise = null;

function fetchCurve(kind) {
  if (kind === 'avatar') {
    if (!avatarCurvePromise) {
      avatarCurvePromise = fetch('https://gi.yatta.moe/api/v2/static/avatarCurve')
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => j?.data || null)
        .catch(() => null);
    }
    return avatarCurvePromise;
  }
  if (!weaponCurvePromise) {
    weaponCurvePromise = fetch('https://gi.yatta.moe/api/v2/static/weaponCurve')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.data || null)
      .catch(() => null);
  }
  return weaponCurvePromise;
}

const AVATAR_CURVE_FALLBACK = {
  80: { GROW_CURVE_HP_S4: 7.523, GROW_CURVE_ATTACK_S4: 7.523, GROW_CURVE_HP_S5: 7.836, GROW_CURVE_ATTACK_S5: 7.836 },
  90: { GROW_CURVE_HP_S4: 8.349, GROW_CURVE_ATTACK_S4: 8.349, GROW_CURVE_HP_S5: 8.739, GROW_CURVE_ATTACK_S5: 8.739 }
};

function calcYattaCharLevelStats(upgrade, curveData, level, promoteIdx) {
  const lvInfo = curveData?.[String(level)]?.curveInfos || AVATAR_CURVE_FALLBACK[level] || AVATAR_CURVE_FALLBACK[90];
  const promote = upgrade?.promote?.[promoteIdx]?.addProps || {};
  const out = { hp: 0, atk: 0, def: 0 };
  for (const p of upgrade?.prop || []) {
    const mult = Number(lvInfo[p.type]) || 8.35;
    const add = Number(promote[p.propType]) || 0;
    const total = (Number(p.initValue) || 0) * mult + add;
    if (p.propType === 'FIGHT_PROP_BASE_HP') out.hp = Math.round(total);
    else if (p.propType === 'FIGHT_PROP_BASE_ATTACK') out.atk = Math.round(total);
    else if (p.propType === 'FIGHT_PROP_BASE_DEFENSE') out.def = Math.round(total);
  }
  return out;
}

function formatYattaParam(val, fmt) {
  const n = Number(val) || 0;
  if (fmt === 'F1P') return `${(n * 100).toFixed(1)}%`;
  if (fmt === 'F2P') return `${(n * 100).toFixed(2)}%`;
  if (fmt === 'P') return `${Math.round(n * 100)}%`;
  if (fmt === 'F1') return n.toFixed(1);
  if (fmt === 'F2') return n.toFixed(2);
  if (fmt === 'I') return String(Math.round(n));
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function extractYattaMultipliers(promoteObj) {
  const multipliers = {};
  if (!promoteObj || typeof promoteObj !== 'object') return multipliers;
  const levels = Object.keys(promoteObj)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 15)
    .sort((a, b) => a - b);
  if (!levels.length) return multipliers;

  const baseDesc = promoteObj[String(levels[0])]?.description || [];
  for (const line of baseDesc) {
    const [rawLabel, rawTpl] = String(line || '').split('|');
    const label = String(rawLabel || '').trim();
    if (!label || !rawTpl) continue;
    const row = [];
    for (const lv of levels) {
      const params = promoteObj[String(lv)]?.params || [];
      const tpl = promoteObj[String(lv)]?.description?.find((l) => l.startsWith(`${label}|`))?.split('|')[1] || rawTpl;
      const formatted = tpl.replace(/\{param(\d+):([^}]+)\}/g, (_, idx, fmt) =>
        formatYattaParam(params[Number(idx) - 1], fmt)
      );
      row.push(formatted);
    }
    multipliers[label] = row;
  }
  return multipliers;
}

function parseYattaAvatarKit(data, curveData) {
  const upgrade = data?.upgrade || {};
  const lv80 = calcYattaCharLevelStats(upgrade, curveData, 80, 5);
  const lv80A6 = calcYattaCharLevelStats(upgrade, curveData, 80, 6);
  const lv90 = calcYattaCharLevelStats(upgrade, curveData, 90, 6);
  const lv95 = curveData?.['95']
    ? calcYattaCharLevelStats(upgrade, curveData, 95, 6)
    : {
        hp: Math.round(lv90.hp * 1.07),
        atk: Math.round(lv90.atk * 1.07),
        def: Math.round(lv90.def * 1.07)
      };

  const maxPromote = upgrade?.promote?.[6]?.addProps || {};
  let ascensionStat = null;
  for (const [propKey, val] of Object.entries(maxPromote)) {
    if (BASE_FIGHT_PROPS.has(propKey)) continue;
    const mapped = FIGHT_PROP_TO_STAT[propKey];
    if (mapped) {
      ascensionStat = {
        key: mapped,
        value: mapped === 'eleMas' ? Math.round(Number(val) || 0) : Math.round((Number(val) || 0) * 1000) / 10
      };
      break;
    }
  }

  const talents = [];
  const passives = [];
  let burstCost = 0;

  const talentEntries = Object.entries(data?.talent || {}).sort((a, b) => Number(a[0]) - Number(b[0]));
  let activeIdx = 0;
  let passiveIdx = 0;

  for (const [, t] of talentEntries) {
    if (!t?.name) continue;
    const tType = Number(t.type);
    const desc = cleanYattaText(t.description);
    if (tType === 0 || tType === 1) {
      const kind = activeIdx === 0 ? 'normal' : activeIdx === 1 ? 'skill' : 'burst';
      activeIdx += 1;
      const multipliers = extractYattaMultipliers(t.promote);
      const labels = Object.keys(multipliers);
      let costElemVal = Number(t.costElemVal) || 0;
      if (!costElemVal && kind === 'burst' && Array.isArray(t.promote?.['1']?.description)) {
        const costLine = t.promote['1'].description.find((l) => /Energy Cost/i.test(l));
        const m = costLine?.match(/\{param(\d+):/i);
        if (m && Array.isArray(t.promote?.['1']?.params)) {
          costElemVal = Math.round(Number(t.promote['1'].params[Number(m[1]) - 1]) || 0);
        }
      }
      if (kind === 'burst' && costElemVal > 0) burstCost = costElemVal;
      talents.push({ kind, name: t.name, description: desc, costElemVal, labels, multipliers });
    } else if (tType === 2) {
      const isHexerei = /witch'?s\s+eve\s+rite|hexerei/i.test(t.name);
      const slot = isHexerei ? 'Hexerei' : passiveIdx === 0 ? 'A1' : passiveIdx === 1 ? 'A4' : 'Utility';
      passiveIdx += 1;
      passives.push({ slot, name: t.name, description: desc });
    }
  }

  const constellations = Object.entries(data?.constellation || {})
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([idx, c]) => ({
      level: Number(idx) + 1,
      name: c?.name || `Constellation ${Number(idx) + 1}`,
      description: cleanYattaText(c?.description || '')
    }))
    .filter((c) => c.level >= 1 && c.level <= 6 && c.name);

  return {
    baseStats: { lv80, lv80A6, lv90, lv95 },
    ascensionStat,
    burstCost: burstCost || 60,
    talents,
    passives,
    constellations
  };
}

function parseLunarisCharKit(detail) {
  const skills = detail?.skills || {};
  const talents = [];

  const na = skills.normalattack || detail?.attacks;
  if (na?.name) {
    talents.push({
      kind: 'normal',
      name: na.name,
      description: cleanYattaText(na.description || na.desc || ''),
      costElemVal: 0,
      labels: Object.keys(na.multipliers || {}),
      multipliers: na.multipliers || {}
    });
  }

  const es = skills.elementalskill || skills.skill;
  if (es?.name) {
    talents.push({
      kind: 'skill',
      name: es.name,
      description: cleanYattaText(es.description || es.desc || ''),
      costElemVal: 0,
      labels: Object.keys(es.multipliers || {}),
      multipliers: es.multipliers || {}
    });
  }

  const eb = skills.elementalburst || skills.burst;
  const ebCostRaw = eb?.multipliers?.['Energy Cost']?.[0] || eb?.energyCost || eb?.cost || 60;
  const burstCost = Number(String(ebCostRaw).replace(/[^\d]/g, '')) || 60;
  if (eb?.name) {
    talents.push({
      kind: 'burst',
      name: eb.name,
      description: cleanYattaText(eb.description || eb.desc || ''),
      costElemVal: burstCost,
      labels: Object.keys(eb.multipliers || {}),
      multipliers: eb.multipliers || {}
    });
  }

  const rawPassives = Array.isArray(detail?.passives)
    ? detail.passives
    : Object.entries(detail?.passives || {})
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([, v]) => v);

  const passives = rawPassives
    .filter((p) => p && (p.name || p.description || p.desc))
    .map((p, idx) => {
      const isHexerei = /witch'?s\s+eve\s+rite|hexerei/i.test(p.name || '');
      const slot = isHexerei ? 'Hexerei' : idx === 0 ? 'A1' : idx === 1 ? 'A4' : idx === 2 ? 'Special' : 'Utility';
      return {
        slot,
        name: p.name || `Passive ${idx + 1}`,
        description: cleanYattaText(p.description || p.desc || '')
      };
    });

  const constellations = Object.entries(detail?.constellations || {})
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, c], idx) => {
      const m = key.match(/(\d+)/);
      const lv = m ? Number(m[1]) : idx + 1;
      return {
        level: lv,
        name: c?.name || `Constellation ${lv}`,
        description: cleanYattaText(c?.description || c?.desc || '')
      };
    })
    .filter((c) => c.level >= 1 && c.level <= 6 && c.name);

  return {
    baseStats: {
      lv80: { hp: 11200, atk: 260, def: 680 },
      lv90: { hp: 12500, atk: 295, def: 750 },
      lv95: { hp: 13375, atk: 315, def: 800 }
    },
    ascensionStat: null,
    burstCost,
    talents,
    passives,
    constellations
  };
}

function parseYattaWeaponStats(data, curveData) {
  const upgrade = data?.upgrade || {};
  const calcAt = (lv, promoteIdx) => {
    const lvInfo = curveData?.[String(lv)]?.curveInfos || {};
    const promote = upgrade?.promote?.[promoteIdx]?.addProps || {};
    let atk = 0;
    let subKey = '';
    let subVal = 0;
    for (const p of upgrade?.prop || []) {
      const mult = Number(lvInfo[p.type]) || 1;
      const add = Number(promote[p.propType]) || 0;
      const total = (Number(p.initValue) || 0) * mult + add;
      if (p.propType === 'FIGHT_PROP_BASE_ATTACK') {
        atk = Math.round(total);
      } else if (FIGHT_PROP_TO_STAT[p.propType]) {
        subKey = FIGHT_PROP_TO_STAT[p.propType];
        subVal = subKey === 'eleMas' ? Math.round(total) : Math.round(total * 1000) / 10;
      }
    }
    return { atk, subKey, subVal };
  };
  const affixObj = data?.affix ? Object.values(data.affix)[0] : null;
  const passiveUpgrades = ['0', '1', '2', '3', '4']
    .map((k) => cleanYattaText(affixObj?.upgrade?.[k] || ''))
    .filter(Boolean);
  return {
    lv80: calcAt(80, 5),
    lv90: calcAt(90, 6),
    description: cleanYattaText(data?.description || ''),
    passiveName: affixObj?.name || '',
    passiveDesc: passiveUpgrades[0] || '',
    passiveUpgrades
  };
}

export function getCharacterKit(pascalKey) {
  const norm = normalizeAssetKey(pascalKey);
  return loadKitCache().chars[norm] || null;
}

export function getWeaponStats(pascalKey) {
  const norm = normalizeAssetKey(pascalKey);
  return loadKitCache().weapons[norm] || null;
}

const pendingKitFetches = new Map();

export async function ensureCharacterKitAndStats(pascalKey) {
  const norm = normalizeAssetKey(pascalKey);
  const cache = loadKitCache();
  if (cache.chars[norm]) return cache.chars[norm];
  const entry = yattaMaps.characters.get(norm);
  if (!entry) return null;
  if (pendingKitFetches.has(norm)) return pendingKitFetches.get(norm);

  const task = (async () => {
    try {
      if (entry.id) {
        const [detailRes, curveData] = await Promise.all([
          fetch(`https://gi.yatta.moe/api/v2/en/avatar/${encodeURIComponent(entry.id)}`).then((r) => (r.ok ? r.json() : null)),
          fetchCurve('avatar')
        ]);
        if (detailRes?.data) {
          const parsed = parseYattaAvatarKit(detailRes.data, curveData);
          cache.chars[norm] = parsed;
          saveKitCache();
          return parsed;
        }
      }
      if (entry.lunarisId && yattaMaps.lunarisVer) {
        const url = `https://api.lunaris.moe/data/${encodeURIComponent(yattaMaps.lunarisVer)}/en/char/${encodeURIComponent(entry.lunarisId)}.json`;
        const res = await fetch(url);
        if (res.ok) {
          const detail = await res.json();
          const parsed = parseLunarisCharKit(detail);
          cache.chars[norm] = parsed;
          saveKitCache();
          return parsed;
        }
      }
      return null;
    } catch {
      return null;
    } finally {
      pendingKitFetches.delete(norm);
    }
  })();

  pendingKitFetches.set(norm, task);
  return task;
}

const pendingWeaponStatFetches = new Map();

let yattaWeaponIdMapPromise = null;
async function resolveYattaWeaponId(norm) {
  const existing = yattaMaps.weapons.get(norm)?.id;
  if (existing) return existing;
  if (!yattaWeaponIdMapPromise) {
    yattaWeaponIdMapPromise = fetch('https://gi.yatta.moe/api/v2/en/weapon')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        const items = json?.data?.items || {};
        for (const [id, item] of Object.entries(items)) {
          const n = normalizeAssetKey(item?.name);
          if (!n) continue;
          const prev = yattaMaps.weapons.get(n);
          if (prev) {
            prev.id = String(id);
            if (!prev.weaponType || prev.weaponType === 'Sword') {
              prev.weaponType = WEAPON_TYPE_MAP[item.type] || prev.weaponType;
            }
          } else {
            yattaMaps.weapons.set(n, {
              id: String(id),
              name: item.name,
              rarity: Number(item.rank) || 4,
              weaponType: WEAPON_TYPE_MAP[item.type] || 'Sword',
              icon: item.icon ? `${YATTA_UI_BASE}${item.icon}.png` : ''
            });
          }
        }
        return yattaMaps.weapons;
      })
      .catch(() => yattaMaps.weapons);
  }
  await yattaWeaponIdMapPromise;
  return yattaMaps.weapons.get(norm)?.id || null;
}

export async function ensureWeaponStats(pascalKey) {
  const norm = normalizeAssetKey(pascalKey);
  const cache = loadKitCache();
  if (cache.weapons[norm] && cache.weapons[norm].description !== undefined) return cache.weapons[norm];
  if (pendingWeaponStatFetches.has(norm)) return pendingWeaponStatFetches.get(norm);

  const task = (async () => {
    try {
      const weaponId = await resolveYattaWeaponId(norm);
      if (!weaponId) return null;
      const [detailRes, curveData] = await Promise.all([
        fetch(`https://gi.yatta.moe/api/v2/en/weapon/${encodeURIComponent(weaponId)}`).then((r) => (r.ok ? r.json() : null)),
        fetchCurve('weapon')
      ]);
      if (detailRes?.data) {
        const parsed = parseYattaWeaponStats(detailRes.data, curveData);
        cache.weapons[norm] = parsed;
        saveKitCache();
        return parsed;
      }
      return null;
    } catch {
      return null;
    } finally {
      pendingWeaponStatFetches.delete(norm);
    }
  })();

  pendingWeaponStatFetches.set(norm, task);
  return task;
}
