/**
 * Polite snapshot sync script for GitHub Actions.
 * Checks api.lunaris.moe/data/version.json first and exits early if unchanged.
 * Compiles data/live-snapshot.json from Project Amber (gi.yatta.moe) + Lunaris.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CATALOG_PATH = path.join(ROOT, 'data', 'catalog.json');
const SNAPSHOT_PATH = path.join(ROOT, 'data', 'live-snapshot.json');
const YATTA_UI_BASE = 'https://gi.yatta.moe/assets/UI/';
const HEADERS = { 'User-Agent': 'aaru-db-snapshot-sync/1.0' };

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

function normalizeAssetKey(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function toPascal(str) {
  return String(str || '').replace(/[^a-zA-Z0-9]/g, '');
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const force = process.argv.includes('--force');
  const verData = await fetchJson('https://api.lunaris.moe/data/version.json');
  const lunarisVer = verData?.version;
  if (!lunarisVer) throw new Error('Missing Lunaris version');

  let existing = null;
  if (fs.existsSync(SNAPSHOT_PATH)) {
    try {
      existing = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
    } catch {
      existing = null;
    }
  }

  if (!force && existing?._lunarisVer === lunarisVer) {
    console.log(`Snapshot already up to date (${lunarisVer}).`);
    return;
  }

  console.log(`Syncing snapshot for Lunaris ${lunarisVer} (previous: ${existing?._lunarisVer || 'none'})...`);

  const baseCatalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const domainRewardNormSet = new Set();
  for (const dayList of Object.values(baseCatalog?.domainSchedule || {})) {
    for (const dom of dayList || []) {
      for (const r of dom.rewards || []) domainRewardNormSet.add(normalizeAssetKey(r.key));
    }
  }

  const [avatarRes, weaponRes, materialRes, upgradeRes, monsterRes] = await Promise.allSettled([
    fetchJson('https://gi.yatta.moe/api/v2/en/avatar'),
    fetchJson('https://gi.yatta.moe/api/v2/en/weapon'),
    fetchJson('https://gi.yatta.moe/api/v2/en/material'),
    fetchJson('https://gi.yatta.moe/api/v2/en/upgrade'),
    fetchJson('https://gi.yatta.moe/api/v2/en/monster')
  ]);

  const slim = {
    _lunarisVer: lunarisVer,
    _syncedAt: new Date().toISOString(),
    _matIdLookup: {},
    characters: {},
    weapons: {},
    materials: {}
  };

  const matNormById = new Map();
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
          const pascalMat = toPascal(mat.name);
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
            domainMatExactKey: toPascal(mat.name)
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
      slim.characters[norm] = {
        pascalKey: toPascal(item.name),
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
      slim.weapons[norm] = {
        pascalKey: toPascal(item.name),
        name: item.name,
        rarity: Number(item.rank) || 4,
        weaponType: WEAPON_TYPE_MAP[item.type] || 'Sword',
        icon: `${YATTA_UI_BASE}${item.icon}.png`,
        ...(upg || {})
      };
    }
  }

  const [lCharRes, lWepRes, lMatRes, lMonRes] = await Promise.allSettled([
    fetchJson(`https://api.lunaris.moe/data/${encodeURIComponent(lunarisVer)}/charlist.json`),
    fetchJson(`https://api.lunaris.moe/data/${encodeURIComponent(lunarisVer)}/weaponlist.json`),
    fetchJson(`https://api.lunaris.moe/data/${encodeURIComponent(lunarisVer)}/materiallist.json`),
    fetchJson(`https://api.lunaris.moe/data/${encodeURIComponent(lunarisVer)}/monsterlist.json`)
  ]);

  const yattaMonsterIds = new Set(
    monsterRes.status === 'fulfilled' && monsterRes.value?.data?.items
      ? Object.keys(monsterRes.value.data.items)
      : []
  );
  const lunarisMonsters = lMonRes.status === 'fulfilled' && lMonRes.value ? lMonRes.value : {};

  for (const [id, m] of matNormById.entries()) {
    slim._matIdLookup[id] = m.name;
  }
  if (lMatRes.status === 'fulfilled' && lMatRes.value) {
    for (const [id, item] of Object.entries(lMatRes.value)) {
      const name = item?.enName;
      const norm = normalizeAssetKey(name);
      if (!norm) continue;
      slim._matIdLookup[String(id)] = name;
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

  // Merge & hydrate Lunaris-only characters gently
  if (lCharRes.status === 'fulfilled' && lCharRes.value) {
    for (const [charId, item] of Object.entries(lCharRes.value)) {
      const name = item?.enName;
      const norm = normalizeAssetKey(name);
      if (!norm || norm === 'traveler' || slim.characters[norm]) continue;
      const iconName = String(item.CardImg || '').replace(/^UI_Gacha_AvatarIcon_/, 'UI_AvatarIcon_');
      const entry = {
        lunarisId: charId,
        pascalKey: toPascal(name),
        name,
        rarity: item.qualityType === 'QUALITY_ORANGE' ? 5 : 4,
        element: item.element || 'Unknown',
        weaponType: WEAPON_TYPE_MAP[item.weaponType] || 'Sword',
        region: 'Teyvat',
        icon: iconName ? `https://api.lunaris.moe/data/assets/avataricon/${iconName}.webp` : ''
      };
      try {
        await sleep(100);
        const detail = await fetchJson(`https://api.lunaris.moe/data/${encodeURIComponent(lunarisVer)}/en/char/${encodeURIComponent(charId)}.json`);
        for (const matId of Object.keys(detail?.skills?.leveling?.books || {})) {
          const matName = slim._matIdLookup[String(matId)];
          if (matName && /^Philosophies of /i.test(matName)) {
            entry.talentBook = matName.replace(/^Philosophies of\s+/i, '');
            entry.domainMatKey = normalizeAssetKey(matName);
            break;
          }
        }
        const asc = Array.isArray(detail?.ascension) ? detail.ascension[detail.ascension.length - 1] : detail?.ascension || null;
        const bossId = asc?.elitemonster ? Object.keys(asc.elitemonster)[0] : null;
        if (bossId && slim._matIdLookup[bossId]) entry.bossMat = toPascal(slim._matIdLookup[bossId]);
        const specId = asc?.speciality ? Object.keys(asc.speciality)[0] : null;
        if (specId && slim._matIdLookup[specId]) entry.localSpecialty = toPascal(slim._matIdLookup[specId]);
        const weeklyId = Object.keys(detail?.skills?.leveling?.weekly || {})[0];
        if (weeklyId && slim._matIdLookup[weeklyId]) entry.weeklyMat = toPascal(slim._matIdLookup[weeklyId]);
        entry._hydrated = true;
      } catch {
        // Ignore individual character hydration failures
      }
      slim.characters[norm] = entry;
    }
  }

  // Merge & hydrate Lunaris-only weapons gently
  if (lWepRes.status === 'fulfilled' && lWepRes.value) {
    for (const [wepId, item] of Object.entries(lWepRes.value)) {
      const name = item?.enName;
      const norm = normalizeAssetKey(name);
      if (!norm || slim.weapons[norm]) continue;
      const entry = {
        lunarisId: wepId,
        pascalKey: toPascal(name),
        name,
        rarity: item.qualityType === 'QUALITY_ORANGE' ? 5 : item.qualityType === 'QUALITY_PURPLE' ? 4 : 3,
        weaponType: WEAPON_TYPE_MAP[item.weaponType] || 'Sword',
        icon: item.weaponIcon ? `https://api.lunaris.moe/data/assets/weaponicon/${item.weaponIcon}.webp` : ''
      };
      try {
        await sleep(100);
        const detail = await fetchJson(`https://api.lunaris.moe/data/${encodeURIComponent(lunarisVer)}/en/weapon/${encodeURIComponent(wepId)}.json`);
        const asc = Array.isArray(detail?.ascension) ? detail.ascension : [];
        const domainMats = asc.map((a) => String(a?.icon || '').replace(/^UI_ItemIcon_/, '')).filter((id) => /^114\d+$/.test(id));
        const goldId = domainMats[domainMats.length - 1];
        if (goldId && slim._matIdLookup[goldId]) {
          entry.domainMatExactKey = toPascal(slim._matIdLookup[goldId]);
          entry.domainMatKey = normalizeAssetKey(slim._matIdLookup[goldId]);
        }
        entry._hydrated = true;
      } catch {
        // Ignore individual weapon hydration failures
      }
      slim.weapons[norm] = entry;
    }
  }

  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(slim));
  console.log(`Wrote ${SNAPSHOT_PATH} (${Object.keys(slim.characters).length} chars, ${Object.keys(slim.weapons).length} weapons, ${Object.keys(slim.materials).length} mats).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
