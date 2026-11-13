let cachedCatalog = null;
const YATTA_CACHE_KEY = 'aaru_yatta_catalog_v4';
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
  materials: new Map()
};

export function normalizeAssetKey(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildYattaMaps(raw) {
  const next = {
    characters: new Map(),
    weapons: new Map(),
    materials: new Map()
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

async function fetchYattaCatalog() {
  try {
    const cachedRaw = localStorage.getItem(YATTA_CACHE_KEY);
    if (cachedRaw) {
      const parsed = JSON.parse(cachedRaw);
      if (parsed?.ts && Date.now() - parsed.ts < YATTA_TTL_MS && parsed.data) {
        buildYattaMaps(parsed.data);
        return;
      }
    }
  } catch {
    // Ignore localStorage read errors
  }

  try {
    const [avatarRes, weaponRes, materialRes, upgradeRes, lunarisVerRes] = await Promise.allSettled([
      fetch('https://gi.yatta.moe/api/v2/en/avatar').then((r) => (r.ok ? r.json() : null)),
      fetch('https://gi.yatta.moe/api/v2/en/weapon').then((r) => (r.ok ? r.json() : null)),
      fetch('https://gi.yatta.moe/api/v2/en/material').then((r) => (r.ok ? r.json() : null)),
      fetch('https://gi.yatta.moe/api/v2/en/upgrade').then((r) => (r.ok ? r.json() : null)),
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
        if (norm) matNormById.set(String(id), { norm, name: item.name });
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
        for (const matId of Object.keys(item.items)) {
          const mat = matNormById.get(String(matId));
          if (!mat) continue;
          if (mat.name.startsWith('Philosophies of ') || domainRewardNormSet.has(mat.norm)) {
            avatarUpgradeByNorm.set(norm, {
              domainMatKey: mat.norm,
              talentBook: mat.name.replace(/^Philosophies of\s+/i, '')
            });
            break;
          }
        }
      }
      for (const item of Object.values(upgradeRes.value.data.weapon || {})) {
        const norm = normalizeAssetKey(item.name);
        if (!norm || !item.items) continue;
        for (const matId of Object.keys(item.items)) {
          const mat = matNormById.get(String(matId));
          if (mat && domainRewardNormSet.has(mat.norm)) {
            weaponUpgradeByNorm.set(norm, { domainMatKey: mat.norm });
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
        if (!norm || !item.icon) continue;
        const upg = weaponUpgradeByNorm.get(norm);
        slim.weapons[norm] = {
          name: item.name,
          rarity: Number(item.rank) || 4,
          weaponType: WEAPON_TYPE_MAP[item.type] || 'Sword',
          icon: `${YATTA_UI_BASE}${item.icon}.png`,
          ...(upg || {})
        };
      }
    }

    // Merge unreleased/datamine characters from api.lunaris.moe
    const lunarisVer = lunarisVerRes.status === 'fulfilled' ? lunarisVerRes.value?.version : null;
    if (lunarisVer) {
      try {
        const lRes = await fetch(`https://api.lunaris.moe/data/${encodeURIComponent(lunarisVer)}/charlist.json`);
        if (lRes.ok) {
          const charlist = await lRes.json();
          for (const item of Object.values(charlist || {})) {
            const name = item?.enName;
            const norm = normalizeAssetKey(name);
            if (!norm || norm === 'traveler' || slim.characters[norm]) continue;
            const iconName = String(item.CardImg || '').replace(/^UI_Gacha_AvatarIcon_/, 'UI_AvatarIcon_');
            slim.characters[norm] = {
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
      } catch {
        // Ignore Lunaris fallback errors
      }
    }

    buildYattaMaps(slim);
    try {
      localStorage.setItem(YATTA_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: slim }));
    } catch {
      // Ignore quota errors
    }
  } catch (err) {
    console.warn('Project Amber (gi.yatta.moe) asset fetch failed:', err);
  }
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
    return live ? { ...live, ...base, domainMatKey: base.domainMatKey || live.domainMatKey, talentBook: base.talentBook || live.talentBook } : base;
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
  const live = getLiveAssetEntry('materials', key);
  return (
    catalog?.materials?.[key] ||
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
