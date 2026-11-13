import { getCatalog, getCharacterMeta, getMaterialMeta, getWeaponMeta } from './catalog.js?v=20261113d';

/**
 * Effective Hero's Wit = 4★ + 0.25 × 3★ + 0.05 × 2★
 */
export function calcEffectiveHerosWit(inventory = {}) {
  const wits4 = Number(inventory.HerosWit?.count ?? 0);
  const exp3 = Number(inventory.AdventurersExperience?.count ?? 0);
  const adv2 = Number(inventory.WanderersAdvice?.count ?? 0);
  return {
    wits4,
    exp3,
    adv2,
    effectiveTotal: Number((wits4 + 0.25 * exp3 + 0.05 * adv2).toFixed(2))
  };
}

/**
 * Coin Purse: Primogems + Fates -> total pulls
 */
export function calcCoinPurse(wallet = {}) {
  const primogems = Number(wallet.primogems ?? 0);
  const intertwinedFates = Number(wallet.intertwinedFates ?? 0);
  const acquaintFates = Number(wallet.acquaintFates ?? 0);
  const primoPulls = Math.floor(primogems / 160);
  const limitedPulls = primoPulls + intertwinedFates;
  const totalPulls = limitedPulls + acquaintFates;
  return {
    primogems,
    intertwinedFates,
    acquaintFates,
    primoPulls,
    limitedPulls,
    totalPulls
  };
}

export function calcCompletionGauges(account) {
  const chars = account?.characters || [];
  const weapons = account?.weapons || [];

  const ownedChars = chars.filter((c) => c.status !== 'Unowned');
  const builtChars = ownedChars.filter((c) => c.status === 'Built' || (c.level >= 90 && (c.talent?.skill >= 8 || c.talent?.burst >= 8 || c.talent?.auto >= 8)));

  const ownedWeapons = weapons.length;
  const maxWeapons = weapons.filter((w) => Number(w.level) >= 90).length;

  return {
    builtChars: builtChars.length,
    ownedChars: ownedChars.length,
    charPct: ownedChars.length ? Math.round((builtChars.length / ownedChars.length) * 100) : 0,
    maxWeapons,
    ownedWeapons,
    weaponPct: ownedWeapons ? Math.round((maxWeapons / ownedWeapons) * 100) : 0
  };
}

function expWitsForLevel(level, curves) {
  const table = curves?.characterExpByLevelCap || {
    20: { mora: 24200, wits: 6 },
    40: { mora: 115800, wits: 29 },
    50: { mora: 232000, wits: 58 },
    60: { mora: 380000, wits: 95 },
    70: { mora: 590000, wits: 148 },
    80: { mora: 912000, wits: 228 },
    90: { mora: 1673400, wits: 419 },
    95: { mora: 2250000, wits: 565 }
  };
  const caps = Object.keys(table).map(Number).sort((a, b) => a - b);
  if (level <= 1) return { mora: 0, wits: 0 };
  for (let i = 0; i < caps.length; i++) {
    const cap = caps[i];
    if (level <= cap) {
      const prevCap = i === 0 ? 1 : caps[i - 1];
      const prevVal = i === 0 ? { mora: 0, wits: 0 } : table[prevCap];
      const curVal = table[cap];
      const ratio = (level - prevCap) / Math.max(1, cap - prevCap);
      return {
        mora: Math.round(prevVal.mora + (curVal.mora - prevVal.mora) * ratio),
        wits: Math.round(prevVal.wits + (curVal.wits - prevVal.wits) * ratio)
      };
    }
  }
  return table[caps[caps.length - 1]];
}

function ascensionPhaseForLevel(level) {
  if (level <= 20) return 0;
  if (level <= 40) return 1;
  if (level <= 50) return 2;
  if (level <= 60) return 3;
  if (level <= 70) return 4;
  if (level <= 80) return 5;
  return 6;
}

function addWeaponRequirements(addReq, weaponKey, curLvlRaw, tgtLvlRaw) {
  if (!weaponKey) return;
  const curLvl = Math.max(1, Math.min(90, Number(curLvlRaw) || 1));
  const tgtLvl = Math.max(curLvl, Math.min(90, Number(tgtLvlRaw) || 90));
  if (tgtLvl <= curLvl) return;

  const wm = getWeaponMeta(weaponKey);
  const rarity = Number(wm.rarity) || 5;
  const is5Star = rarity >= 5;

  // Total 1->90 EXP & ores: 5-star ~907 Mystic Ores / 906,400 Mora; 4-star ~605 Ores / 604,300 Mora
  const maxOres = is5Star ? 907 : rarity === 4 ? 605 : 403;
  const maxExpMora = is5Star ? 906400 : rarity === 4 ? 604300 : 402800;
  const ratio = (tgtLvl - curLvl) / 89;
  addReq('MysticEnhancementOre', Math.ceil(maxOres * ratio));
  addReq('Mora', Math.round(maxExpMora * ratio));

  const ascCaps = [20, 40, 50, 60, 70, 80];
  const ascMora = is5Star
    ? [10000, 20000, 30000, 45000, 55000, 65000]
    : [5000, 15000, 20000, 30000, 35000, 45000];
  const curPhase = ascCaps.filter((c) => curLvl > c).length;
  const tgtPhase = ascCaps.filter((c) => tgtLvl > c).length;
  for (let p = curPhase; p < tgtPhase; p++) {
    addReq('Mora', ascMora[p] || 0);
  }
  if (wm.domainMatExactKey && tgtPhase > curPhase) {
    const goldPerPhase = is5Star ? [0, 0, 0, 0, 2, 4] : [0, 0, 0, 0, 1, 3];
    let goldCount = 0;
    for (let p = curPhase; p < tgtPhase; p++) {
      goldCount += goldPerPhase[p] || 0;
    }
    if (goldCount > 0) addReq(wm.domainMatExactKey, goldCount);
  }
}

function computeRawTargetRequirements(target) {
  const catalog = getCatalog();
  const curves = catalog?.costCurves || {};
  const charMeta = getCharacterMeta(target.characterKey);

  const curLvl = Math.max(1, Math.min(95, Number(target.currentLevel) || 1));
  const tgtLvl = Math.max(curLvl, Math.min(95, Number(target.targetLevel) || 90));

  const req = {};
  const addReq = (matKey, amount) => {
    if (!matKey || !amount || amount <= 0) return;
    req[matKey] = (req[matKey] || 0) + amount;
  };

  // 1. Character EXP + EXP Mora
  const curExp = expWitsForLevel(curLvl, curves);
  const tgtExp = expWitsForLevel(tgtLvl, curves);
  addReq('HerosWit', Math.max(0, tgtExp.wits - curExp.wits));
  addReq('Mora', Math.max(0, tgtExp.mora - curExp.mora));

  // 2. Ascension Phases
  const curPhase = ascensionPhaseForLevel(curLvl);
  const tgtPhase = ascensionPhaseForLevel(tgtLvl);
  const ascCurve = curves.ascensionByPhase || {
    1: { mora: 20000, boss: 0, specialty: 3 },
    2: { mora: 40000, boss: 2, specialty: 10 },
    3: { mora: 60000, boss: 4, specialty: 20 },
    4: { mora: 80000, boss: 8, specialty: 30 },
    5: { mora: 100000, boss: 12, specialty: 45 },
    6: { mora: 120000, boss: 20, specialty: 60 }
  };

  for (let p = curPhase + 1; p <= tgtPhase; p++) {
    const step = ascCurve[p];
    if (!step) continue;
    addReq('Mora', step.mora || 0);
    if (charMeta.bossMat && step.boss) addReq(charMeta.bossMat, step.boss);
    if (charMeta.localSpecialty && step.specialty) addReq(charMeta.localSpecialty, step.specialty);
  }

  // 3. Talents (Auto / Skill / Burst)
  const talentCurve = curves.talentByLevel || {
    2: { mora: 12500, bookTier: 'Teachings', bookCount: 3, weekly: 0, crown: 0 },
    3: { mora: 17500, bookTier: 'Guide', bookCount: 2, weekly: 0, crown: 0 },
    4: { mora: 25000, bookTier: 'Guide', bookCount: 4, weekly: 0, crown: 0 },
    5: { mora: 30000, bookTier: 'Guide', bookCount: 6, weekly: 0, crown: 0 },
    6: { mora: 37500, bookTier: 'Guide', bookCount: 9, weekly: 0, crown: 0 },
    7: { mora: 120000, bookTier: 'Philosophies', bookCount: 4, weekly: 1, crown: 0 },
    8: { mora: 260000, bookTier: 'Philosophies', bookCount: 6, weekly: 1, crown: 0 },
    9: { mora: 450000, bookTier: 'Philosophies', bookCount: 12, weekly: 2, crown: 0 },
    10: { mora: 700000, bookTier: 'Philosophies', bookCount: 16, weekly: 2, crown: 1 }
  };

  const bookBase = charMeta.talentBook || 'Gold';
  const slots = ['auto', 'skill', 'burst'];
  for (const slot of slots) {
    const cT = Math.max(1, Math.min(10, Number(target.currentTalent?.[slot]) || 1));
    const tT = Math.max(cT, Math.min(10, Number(target.targetTalent?.[slot]) || cT));
    for (let lvl = cT + 1; lvl <= tT; lvl++) {
      const step = talentCurve[lvl];
      if (!step) continue;
      addReq('Mora', step.mora || 0);
      const prefix = step.bookTier === 'Teachings' ? 'TeachingsOf' : step.bookTier === 'Guide' ? 'GuideTo' : 'PhilosophiesOf';
      addReq(`${prefix}${bookBase}`, step.bookCount || 0);
      if (step.weekly && charMeta.weeklyMat) addReq(charMeta.weeklyMat, step.weekly);
      if (step.crown) addReq('CrownOfInsight', step.crown);
    }
  }

  // 4. Optional paired Weapon target
  if (target.weaponKey) {
    addWeaponRequirements(addReq, target.weaponKey, target.weaponCurrentLevel, target.weaponTargetLevel);
  }

  return req;
}

function formatRequirementRows(req, getOwnedForMat) {
  const rows = Object.entries(req).map(([matKey, needed]) => {
    const owned = getOwnedForMat(matKey);
    const delta = owned - needed;
    const meta = getMaterialMeta(matKey);
    return {
      key: matKey,
      name: meta.name,
      category: meta.category,
      needed,
      owned,
      delta, // negative = deficit, >= 0 = surplus
      deficit: delta < 0 ? Math.abs(delta) : 0,
      surplus: delta >= 0 ? delta : 0
    };
  });

  // Sort deficits first, then by needed descending
  rows.sort((a, b) => {
    if (a.deficit > 0 && b.deficit === 0) return -1;
    if (a.deficit === 0 && b.deficit > 0) return 1;
    return b.deficit - a.deficit || b.needed - a.needed;
  });

  return rows;
}

/**
 * Calculates exact material requirements & deficits for a single prefarm target
 * against catalog.json recipes and current inventory.
 */
export function calculatePrefarmRequirements(target, inventory = {}, wallet = null) {
  const req = computeRawTargetRequirements(target);
  const effectiveWits = Math.floor(calcEffectiveHerosWit(inventory).effectiveTotal);
  return formatRequirementRows(req, (matKey) =>
    matKey === 'HerosWit'
      ? effectiveWits
      : matKey === 'Mora'
        ? Number(wallet?.mora ?? inventory[matKey]?.count ?? 0)
        : Number(inventory[matKey]?.count ?? 0)
  );
}

/**
 * Waterfall allocation across the ranked prefarmQueue (#1 -> #2 -> #3 ...).
 * Higher-priority targets consume shared resources (Mora, Hero's Wit, Crowns, Books, Weapon mats)
 * first, and only the remaining surplus flows down to lower-priority targets.
 */
export function calculateWaterfallPrefarm(prefarmQueue = [], inventory = {}, wallet = null) {
  const sorted = [...prefarmQueue].sort((a, b) => a.rank - b.rank);
  const effectiveWits = Math.floor(calcEffectiveHerosWit(inventory).effectiveTotal);
  const pool = new Map();

  const getPool = (matKey) => {
    if (pool.has(matKey)) return pool.get(matKey);
    const initial =
      matKey === 'HerosWit'
        ? effectiveWits
        : matKey === 'Mora'
          ? Number(wallet?.mora ?? inventory[matKey]?.count ?? 0)
          : Number(inventory[matKey]?.count ?? 0);
    pool.set(matKey, initial);
    return initial;
  };

  const results = new Map();
  for (const target of sorted) {
    const req = computeRawTargetRequirements(target);
    const rows = formatRequirementRows(req, (matKey) => getPool(matKey));
    for (const [matKey, needed] of Object.entries(req)) {
      pool.set(matKey, Math.max(0, getPool(matKey) - needed));
    }
    results.set(target.id, rows);
  }
  return results;
}

/**
 * Aggregates shared resource pool for Priority #1 & #2 targets.
 */
export function calculatePrioritySharedPool(prefarmQueue = [], inventory = {}, wallet = null) {
  const sorted = [...prefarmQueue].sort((a, b) => a.rank - b.rank).slice(0, 2);
  const pool = {};

  for (const target of sorted) {
    const rows = calculatePrefarmRequirements(target, inventory, wallet);
    for (const r of rows) {
      if (!pool[r.key]) {
        pool[r.key] = {
          key: r.key,
          name: r.name,
          category: r.category,
          owned: r.owned,
          neededTotal: 0,
          byTarget: []
        };
      }
      pool[r.key].neededTotal += r.needed;
      pool[r.key].byTarget.push({
        rank: target.rank,
        characterKey: target.characterKey,
        needed: r.needed
      });
    }
  }

  return Object.values(pool)
    .map((item) => {
      const delta = item.owned - item.neededTotal;
      return {
        ...item,
        delta,
        deficit: delta < 0 ? Math.abs(delta) : 0,
        surplus: delta >= 0 ? delta : 0
      };
    })
    .sort((a, b) => b.deficit - a.deficit || b.neededTotal - a.neededTotal);
}

/**
 * Detects weapon instance conflicts across all Team Comps.
 */
export function detectTeamWeaponConflicts(teams = []) {
  const usageMap = new Map(); // weaponId -> Array<{ teamId, teamName, characterKey, weaponKey }>

  for (const team of teams) {
    for (const member of team.members || []) {
      const instanceKey = member.weaponId || member.weaponKey;
      if (!instanceKey) continue;
      if (!usageMap.has(instanceKey)) usageMap.set(instanceKey, []);
      usageMap.get(instanceKey).push({
        teamId: team.id,
        teamName: team.name,
        characterKey: member.characterKey,
        weaponKey: member.weaponKey
      });
    }
  }

  const conflicts = [];
  for (const [instanceKey, usages] of usageMap.entries()) {
    const uniqueTeams = new Set(usages.map((u) => u.teamId));
    if (uniqueTeams.size > 1) {
      conflicts.push({
        instanceKey,
        weaponKey: usages[0].weaponKey,
        usages
      });
    }
  }
  return conflicts;
}
