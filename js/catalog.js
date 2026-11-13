let cachedCatalog = null;
const YATTA_CACHE_KEY = 'aaru_yatta_catalog_v1';
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
    const [avatarRes, weaponRes, materialRes] = await Promise.allSettled([
      fetch('https://gi.yatta.moe/api/v2/en/avatar').then((r) => (r.ok ? r.json() : null)),
      fetch('https://gi.yatta.moe/api/v2/en/weapon').then((r) => (r.ok ? r.json() : null)),
      fetch('https://gi.yatta.moe/api/v2/en/material').then((r) => (r.ok ? r.json() : null))
    ]);

    const slim = { characters: {}, weapons: {}, materials: {} };

    if (avatarRes.status === 'fulfilled' && avatarRes.value?.data?.items) {
      for (const item of Object.values(avatarRes.value.data.items)) {
        const norm = normalizeAssetKey(item.name);
        if (!norm || !item.icon) continue;
        slim.characters[norm] = {
          name: item.name,
          rarity: Number(item.rank) || 5,
          element: ELEMENT_MAP[item.element] || item.element || 'Unknown',
          weaponType: WEAPON_TYPE_MAP[item.weaponType] || 'Sword',
          region: item.region || 'Teyvat',
          icon: `${YATTA_UI_BASE}${item.icon}.png`
        };
      }
    }

    if (weaponRes.status === 'fulfilled' && weaponRes.value?.data?.items) {
      for (const item of Object.values(weaponRes.value.data.items)) {
        const norm = normalizeAssetKey(item.name);
        if (!norm || !item.icon) continue;
        slim.weapons[norm] = {
          name: item.name,
          rarity: Number(item.rank) || 4,
          weaponType: WEAPON_TYPE_MAP[item.type] || 'Sword',
          icon: `${YATTA_UI_BASE}${item.icon}.png`
        };
      }
    }

    if (materialRes.status === 'fulfilled' && materialRes.value?.data?.items) {
      for (const item of Object.values(materialRes.value.data.items)) {
        const norm = normalizeAssetKey(item.name);
        if (!norm || !item.icon) continue;
        slim.materials[norm] = {
          name: item.name,
          rarity: Number(item.rank) || 2,
          category: item.type || 'Material',
          icon: `${YATTA_UI_BASE}${item.icon}.png`
        };
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
  const live = getLiveAssetEntry('characters', key);
  return (
    catalog?.characters?.[key] ||
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
  const live = getLiveAssetEntry('weapons', key);
  return (
    catalog?.weapons?.[key] ||
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
