/**
 * Regenerates data/catalog.json from genshin-db every patch.
 * Usage:
 *   npm install
 *   npm run build:catalog
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import genshindb from 'genshin-db';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const OUTPUT_PATH = path.join(ROOT_DIR, 'data', 'catalog.json');

/**
 * Converts a display name into a GOOD v3 PascalCase key.
 */
function toPascalKey(name) {
  if (!name) return '';
  return String(name)
    .replace(/['’`"]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

function resolveIconUrl(images) {
  if (!images) return '';
  return (
    images.mihoyo_icon ||
    images.icon ||
    images.filename_icon ||
    images.cover1 ||
    ''
  );
}

function buildCharacters() {
  const names = genshindb.characters('names', { matchCategories: true }) || [];
  const characters = {};

  for (const name of names) {
    const c = genshindb.characters(name);
    if (!c) continue;
    const key = toPascalKey(c.name);
    const talentData = genshindb.talents(name);

    const ascensionMaterials = {};
    if (c.costs) {
      for (const [phase, items] of Object.entries(c.costs)) {
        ascensionMaterials[phase] = (items || []).map((item) => ({
          key: toPascalKey(item.name),
          name: item.name,
          count: item.count
        }));
      }
    }

    const talentMaterials = {};
    if (talentData?.costs) {
      for (const [lvl, items] of Object.entries(talentData.costs)) {
        talentMaterials[lvl] = (items || []).map((item) => ({
          key: toPascalKey(item.name),
          name: item.name,
          count: item.count
        }));
      }
    }

    characters[key] = {
      key,
      name: c.name,
      rarity: Number(c.rarity) || 4,
      element: c.elementText || 'None',
      weaponType: c.weaponText || 'Sword',
      region: c.region || 'Unknown',
      icon: resolveIconUrl(c.images),
      ascensionMaterials,
      talentMaterials
    };
  }

  return characters;
}

function buildWeapons() {
  const names = genshindb.weapons('names', { matchCategories: true }) || [];
  const weapons = {};

  for (const name of names) {
    const w = genshindb.weapons(name);
    if (!w) continue;
    const key = toPascalKey(w.name);
    const ascensionMaterials = {};

    if (w.costs) {
      for (const [phase, items] of Object.entries(w.costs)) {
        ascensionMaterials[phase] = (items || []).map((item) => ({
          key: toPascalKey(item.name),
          name: item.name,
          count: item.count
        }));
      }
    }

    weapons[key] = {
      key,
      name: w.name,
      rarity: Number(w.rarity) || 3,
      weaponType: w.weaponText || 'Sword',
      substat: w.mainStatText || '',
      icon: resolveIconUrl(w.images),
      ascensionMaterials
    };
  }

  return weapons;
}

function buildMaterials() {
  const names = genshindb.materials('names', { matchCategories: true }) || [];
  const materials = {};

  for (const name of names) {
    const m = genshindb.materials(name);
    if (!m) continue;
    const key = toPascalKey(m.name);

    materials[key] = {
      key,
      name: m.name,
      rarity: Number(m.rarity) || 1,
      category: m.category || m.typeText || 'Material',
      daysOfWeek: m.daysOfWeek || [],
      dropDomain: m.dropDomainName || '',
      icon: resolveIconUrl(m.images)
    };
  }

  return materials;
}

function buildDomainSchedule() {
  const domains = genshindb.domains('names', { matchCategories: true }) || [];
  const schedule = {
    Monday: [],
    Tuesday: [],
    Wednesday: [],
    Thursday: [],
    Friday: [],
    Saturday: [],
    Sunday: []
  };

  for (const name of domains) {
    const d = genshindb.domains(name);
    if (!d || !Array.isArray(d.daysOfWeek)) continue;
    for (const day of d.daysOfWeek) {
      if (!schedule[day]) continue;
      schedule[day].push({
        name: d.name,
        region: d.regionName || '',
        domainType: d.domainType || '',
        rewards: (d.rewardPreview || []).map((r) => ({
          key: toPascalKey(r.name),
          name: r.name
        }))
      });
    }
  }

  return schedule;
}

function buildStaticCostCurves() {
  return {
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
    ascensionMoraByPhase: {
      1: 20000,
      2: 40000,
      3: 60000,
      4: 80000,
      5: 100000,
      6: 120000
    },
    talentMoraByLevel: {
      2: 12500,
      3: 17500,
      4: 25000,
      5: 30000,
      6: 37500,
      7: 120000,
      8: 260000,
      9: 450000,
      10: 700000
    }
  };
}

function main() {
  const catalog = {
    meta: {
      generatedAt: new Date().toISOString(),
      source: 'genshin-db'
    },
    characters: buildCharacters(),
    weapons: buildWeapons(),
    materials: buildMaterials(),
    domainSchedule: buildDomainSchedule(),
    costCurves: buildStaticCostCurves()
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(catalog, null, 2), 'utf8');
  console.log(
    `Generated catalog.json: ${Object.keys(catalog.characters).length} characters, ` +
    `${Object.keys(catalog.weapons).length} weapons, ` +
    `${Object.keys(catalog.materials).length} materials.`
  );
}

main();
