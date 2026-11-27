import { getCatalog, getCharacterMeta, getMaterialMeta, getWeaponMeta } from './catalog.js?v=20261127p113';

/**
 * Effective Hero's Wit = 4★ + 0.25 × 3★ + 0.05 × 2★
 */
export const SERVER_REGIONS = {
  NA: { id: 'NA', label: 'America (NA)', short: 'NA', offsetHours: -5, resetLabel: '04:00 EST / 09:00 UTC' },
  EU: { id: 'EU', label: 'Europe (EU)', short: 'EU', offsetHours: 1, resetLabel: '04:00 CET / 03:00 UTC' },
  ASIA: { id: 'ASIA', label: 'Asia', short: 'ASIA', offsetHours: 8, resetLabel: '04:00 CST / 20:00 UTC' },
  SAR: { id: 'SAR', label: 'TW, HK, MO', short: 'TW/HK/MO', offsetHours: 8, resetLabel: '04:00 CST / 20:00 UTC' }
};

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Computes the current in-game day (adjusted for 04:00 server reset) and
 * time remaining until the next daily reset for the given server region.
 */
export function getServerResetInfo(serverId = 'NA', nowMs = Date.now()) {
  const server = SERVER_REGIONS[serverId] || SERVER_REGIONS.NA;
  const offsetMs = server.offsetHours * 3600_000;
  const resetBoundaryMs = 4 * 3600_000; // 04:00 server local time
  const inGameMs = nowMs + offsetMs - resetBoundaryMs;
  const inGameDate = new Date(inGameMs);
  const inGameDay = WEEKDAY_NAMES[inGameDate.getUTCDay()];
  const monthShort = MONTH_SHORT[inGameDate.getUTCMonth()];
  const dayOfMonth = inGameDate.getUTCDate();
  const shortDate = `${inGameDay.slice(0, 3)}, ${monthShort} ${dayOfMonth}`;

  const dayMs = 86400_000;
  const elapsedInDay = ((inGameMs % dayMs) + dayMs) % dayMs;
  const msUntilReset = dayMs - elapsedInDay;
  const totalMinutes = Math.floor(msUntilReset / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return {
    server,
    inGameDay,
    monthShort,
    dayOfMonth,
    shortDate,
    msUntilReset,
    hours,
    minutes,
    countdownText: `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`
  };
}

/**
 * Computes a weighted 0-100% readiness score from a target's requirement rows.
 */
export function calcTargetReadinessPct(reqRows = []) {
  if (!reqRows.length) return 100;
  let sumRatio = 0;
  for (const r of reqRows) {
    const need = Number(r.needed) || 0;
    if (need <= 0) {
      sumRatio += 1;
    } else {
      sumRatio += Math.min(1, Math.max(0, (Number(r.owned) || 0) / need));
    }
  }
  return Math.round((sumRatio / reqRows.length) * 100);
}

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

export const DEFAULT_WISH_GOAL = {
  label: '7.3 Phase 1 (Anastasya + Danica)',
  targetDate: '2026-12-16',
  targetPulls: 180,
  charPity: 0,
  charGuaranteed: false,
  weaponPity: 0,
  includeWeapPity: false,
  hasWelkin: true,
  hasBattlePass: true,
  bpLevel: 30
};

/**
 * Target Banner Countdown & Pull Projection (with Character/Weapon Pity + Exact BP Milestone Rewards)
 */
export function calcWishGoalProjection(wallet = {}, wishGoalOverride = null) {
  const goal = {
    ...DEFAULT_WISH_GOAL,
    ...(wallet?.wishGoal || {}),
    ...(wishGoalOverride || {})
  };
  const targetDate = String(goal.targetDate || DEFAULT_WISH_GOAL.targetDate);
  const targetPulls = Math.max(1, Number(goal.targetPulls) || DEFAULT_WISH_GOAL.targetPulls);
  const charPity = Math.min(89, Math.max(0, Math.floor(Number(goal.charPity) || 0)));
  const charGuaranteed = Boolean(goal.charGuaranteed);
  const weaponPity = Math.min(79, Math.max(0, Math.floor(Number(goal.weaponPity) || 0)));
  const includeWeapPity = Boolean(goal.includeWeapPity);
  const hasWelkin = goal.hasWelkin !== false;
  const hasBattlePass = goal.hasBattlePass !== false;
  const bpLevel = Math.min(50, Math.max(1, Math.floor(Number(goal.bpLevel) || 1)));
  const label = String(goal.label || DEFAULT_WISH_GOAL.label);

  const targetMs = new Date(`${targetDate}T00:00:00`).getTime();
  const daysRemaining = Number.isFinite(targetMs)
    ? Math.max(0, Math.ceil((targetMs - Date.now()) / 86400000))
    : 0;
  const currentPulls = calcCoinPurse(wallet).limitedPulls;
  const effectivePityPulls = charPity + (includeWeapPity ? weaponPity : 0);
  const effectiveCurrentPulls = currentPulls + effectivePityPulls;

  const dailyPrimos = hasWelkin ? 150 : 60;
  const dailyBonusPulls = Math.floor((daysRemaining * dailyPrimos) / 160);

  // Exact remaining Gnostic Hymn rewards (Lv. 10/20/30/40 = 1 Fate each, Lv. 50 = 680 Primos)
  const remainingBpFates = hasBattlePass ? [10, 20, 30, 40].filter((lvl) => lvl > bpLevel).length : 0;
  const remainingBpPrimos = hasBattlePass && bpLevel < 50 ? 680 : 0;
  const bpMilestonePulls = remainingBpFates + Math.floor(remainingBpPrimos / 160);

  const projectedBonusPulls = dailyBonusPulls + bpMilestonePulls;
  const projectedTotalPulls = effectiveCurrentPulls + projectedBonusPulls;
  const deficitPulls = Math.max(0, targetPulls - projectedTotalPulls);

  return {
    label,
    targetDate,
    targetPulls,
    charPity,
    charGuaranteed,
    weaponPity,
    includeWeapPity,
    hasWelkin,
    hasBattlePass,
    bpLevel,
    daysRemaining,
    currentPulls,
    effectivePityPulls,
    effectiveCurrentPulls,
    dailyPrimos,
    dailyBonusPulls,
    remainingBpFates,
    remainingBpPrimos,
    bpMilestonePulls,
    projectedBonusPulls,
    projectedTotalPulls,
    deficitPulls
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
  const rKey = is5Star ? 5 : rarity === 4 ? 4 : 3;
  if (Array.isArray(wm.commonMatTiers) && wm.commonMatTiers.length === 3 && tgtPhase > curPhase) {
    const wCurve = WEAPON_COMMON_BY_RARITY[rKey];
    for (let p = curPhase; p < tgtPhase; p++) {
      const step = wCurve[p];
      if (step && wm.commonMatTiers[step.tier]) addReq(wm.commonMatTiers[step.tier], step.count);
    }
  }
  if (Array.isArray(wm.eliteMatTiers) && wm.eliteMatTiers.length === 3 && tgtPhase > curPhase) {
    const eCurve = WEAPON_ELITE_BY_RARITY[rKey];
    for (let p = curPhase; p < tgtPhase; p++) {
      const step = eCurve[p];
      if (step && wm.eliteMatTiers[step.tier]) addReq(wm.eliteMatTiers[step.tier], step.count);
    }
  }
}

const WEAPON_ELITE_BY_RARITY = {
  5: [
    { tier: 0, count: 5 },
    { tier: 0, count: 18 },
    { tier: 1, count: 9 },
    { tier: 1, count: 18 },
    { tier: 2, count: 14 },
    { tier: 2, count: 27 }
  ],
  4: [
    { tier: 0, count: 3 },
    { tier: 0, count: 12 },
    { tier: 1, count: 6 },
    { tier: 1, count: 12 },
    { tier: 2, count: 9 },
    { tier: 2, count: 18 }
  ],
  3: [
    { tier: 0, count: 2 },
    { tier: 0, count: 8 },
    { tier: 1, count: 4 },
    { tier: 1, count: 8 },
    { tier: 2, count: 6 },
    { tier: 2, count: 12 }
  ]
};

const WEAPON_COMMON_BY_RARITY = {
  5: [
    { tier: 0, count: 3 },
    { tier: 0, count: 12 },
    { tier: 1, count: 9 },
    { tier: 1, count: 14 },
    { tier: 2, count: 9 },
    { tier: 2, count: 18 }
  ],
  4: [
    { tier: 0, count: 2 },
    { tier: 0, count: 8 },
    { tier: 1, count: 6 },
    { tier: 1, count: 9 },
    { tier: 2, count: 6 },
    { tier: 2, count: 12 }
  ],
  3: [
    { tier: 0, count: 1 },
    { tier: 0, count: 5 },
    { tier: 1, count: 4 },
    { tier: 1, count: 6 },
    { tier: 2, count: 4 },
    { tier: 2, count: 8 }
  ]
};

const CHAR_COMMON_ASC_CURVE = {
  1: { tier: 0, count: 3 },
  2: { tier: 0, count: 15 },
  3: { tier: 1, count: 12 },
  4: { tier: 1, count: 18 },
  5: { tier: 2, count: 12 },
  6: { tier: 2, count: 24 }
};

const CHAR_GEM_ASC_CURVE = {
  1: { tier: 0, count: 1 },
  2: { tier: 1, count: 3 },
  3: { tier: 1, count: 6 },
  4: { tier: 2, count: 3 },
  5: { tier: 2, count: 6 },
  6: { tier: 3, count: 6 }
};

const TALENT_COMMON_CURVE = {
  2: { tier: 0, count: 6 },
  3: { tier: 1, count: 3 },
  4: { tier: 1, count: 4 },
  5: { tier: 1, count: 6 },
  6: { tier: 1, count: 9 },
  7: { tier: 2, count: 4 },
  8: { tier: 2, count: 6 },
  9: { tier: 2, count: 9 },
  10: { tier: 2, count: 12 }
};

const DEFAULT_TALENT_CURVE = {
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

export function calcTalentUpgradeCost(charKey, currentLvl, targetLvl) {
  const catalog = getCatalog();
  const talentCurve = catalog?.costCurves?.talentByLevel || DEFAULT_TALENT_CURVE;
  const charMeta = getCharacterMeta(charKey);
  const cT = Math.max(1, Math.min(10, Number(currentLvl) || 1));
  const tT = Math.max(cT, Math.min(10, Number(targetLvl) || cT));

  let mora = 0;
  const books = { Teachings: 0, Guide: 0, Philosophies: 0 };
  let weekly = 0;
  let crown = 0;

  for (let lvl = cT + 1; lvl <= tT; lvl++) {
    const step = talentCurve[lvl];
    if (!step) continue;
    mora += step.mora || 0;
    if (step.bookTier && books[step.bookTier] !== undefined) {
      books[step.bookTier] += step.bookCount || 0;
    }
    weekly += step.weekly || 0;
    crown += step.crown || 0;
  }

  return {
    mora,
    books,
    bookName: charMeta?.talentBook || '',
    weekly,
    weeklyMat: charMeta?.weeklyMat || '',
    crown
  };
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

  const commonTiers = Array.isArray(charMeta.commonMatTiers) && charMeta.commonMatTiers.length === 3 ? charMeta.commonMatTiers : null;
  const gemTiers = Array.isArray(charMeta.gemTiers) && charMeta.gemTiers.length === 4 ? charMeta.gemTiers : null;
  for (let p = curPhase + 1; p <= tgtPhase; p++) {
    const step = ascCurve[p];
    if (!step) continue;
    addReq('Mora', step.mora || 0);
    if (charMeta.bossMat && step.boss) addReq(charMeta.bossMat, step.boss);
    if (charMeta.localSpecialty && step.specialty) addReq(charMeta.localSpecialty, step.specialty);
    const cStep = CHAR_COMMON_ASC_CURVE[p];
    if (commonTiers && cStep) addReq(commonTiers[cStep.tier], cStep.count);
    const gStep = CHAR_GEM_ASC_CURVE[p];
    if (gemTiers && gStep) addReq(gemTiers[gStep.tier], gStep.count);
  }

  // 3. Talents (Auto / Skill / Burst)
  const talentCurve = curves.talentByLevel || DEFAULT_TALENT_CURVE;

  const bookBase = charMeta.talentBook || '';
  const slots = ['auto', 'skill', 'burst'];
  for (const slot of slots) {
    const cT = Math.max(1, Math.min(10, Number(target.currentTalent?.[slot]) || 1));
    const tT = Math.max(cT, Math.min(10, Number(target.targetTalent?.[slot]) || cT));
    for (let lvl = cT + 1; lvl <= tT; lvl++) {
      const step = talentCurve[lvl];
      if (!step) continue;
      addReq('Mora', step.mora || 0);
      if (bookBase) {
        const prefix = step.bookTier === 'Teachings' ? 'TeachingsOf' : step.bookTier === 'Guide' ? 'GuideTo' : 'PhilosophiesOf';
        addReq(`${prefix}${bookBase}`, step.bookCount || 0);
      }
      if (step.weekly && charMeta.weeklyMat) addReq(charMeta.weeklyMat, step.weekly);
      if (step.crown) addReq('CrownOfInsight', step.crown);
      const tCommon = TALENT_COMMON_CURVE[lvl];
      if (commonTiers && tCommon) addReq(commonTiers[tCommon.tier], tCommon.count);
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
 * Sorts prefarmQueue by (tier, rank) and assigns sequential global rank plus
 * per-tier subRank (e.g. #1.1, #1.2, #2.1). Legacy items without `tier`
 * default to `tier = rank`.
 */
export function sortAndLabelPrefarmQueue(prefarmQueue = []) {
  const sorted = [...prefarmQueue].sort((a, b) => {
    const aTier = Math.max(1, Number(a.tier) || Number(a.rank) || 1);
    const bTier = Math.max(1, Number(b.tier) || Number(b.rank) || 1);
    if (aTier !== bTier) return aTier - bTier;
    return (Number(a.rank) || 0) - (Number(b.rank) || 0);
  });
  const tierCounts = new Map();
  return sorted.map((t, idx) => {
    const tier = Math.max(1, Number(t.tier) || Number(t.rank) || 1);
    const subRank = (tierCounts.get(tier) || 0) + 1;
    tierCounts.set(tier, subRank);
    return {
      ...t,
      tier,
      subRank,
      rank: idx + 1,
      tierLabel: `#${tier}.${subRank}`
    };
  });
}

function allocateTieredWaterfall(keys, req, getPool, setPool) {
  const owned = keys.map((k) => getPool(k));
  const needed = keys.map((k) => req[k] || 0);
  const avail = owned.slice();
  const eff = owned.slice();

  const maxAvail = (idx) => avail[idx] + (idx > 0 ? Math.floor(maxAvail(idx - 1) / 3) : 0);
  const consumeFrom = (idx, want) => {
    const direct = Math.min(avail[idx], want);
    avail[idx] -= direct;
    const rem = want - direct;
    if (rem > 0 && idx > 0) {
      consumeFrom(idx - 1, rem * 3);
    }
  };

  for (let i = 0; i < keys.length; i++) {
    const direct = Math.min(avail[i], needed[i]);
    avail[i] -= direct;
    const short = needed[i] - direct;
    if (short > 0 && i > 0) {
      const canCraft = Math.min(short, Math.floor(maxAvail(i - 1) / 3));
      if (canCraft > 0) {
        consumeFrom(i - 1, canCraft * 3);
        eff[i] += canCraft;
      }
    }
  }

  const effOut = {};
  const craftedOut = {};
  keys.forEach((k, i) => {
    setPool(k, avail[i]);
    effOut[k] = eff[i];
    craftedOut[k] = Math.max(0, eff[i] - owned[i]);
  });
  return { eff: effOut, crafted: craftedOut };
}

function resolveTieredSeries(ownedArr, neededArr) {
  let carryCraft = 0;
  const eff = [];
  const craftedIn = [];
  const netDef = [];
  let lastSurplus = 0;
  for (let i = 0; i < ownedArr.length; i++) {
    const o = ownedArr[i] || 0;
    const n = neededArr[i] || 0;
    const e = o + carryCraft;
    eff.push(e);
    craftedIn.push(carryCraft);
    const surplus = Math.max(0, e - n);
    netDef.push(Math.max(0, n - e));
    carryCraft = Math.floor(surplus / 3);
    lastSurplus = surplus;
  }
  const deficit = netDef.reduce((s, v) => s + v, 0);
  const topIdx = ownedArr.length - 1;
  const equivDeficit = netDef.reduce((s, d, i) => s + d / Math.pow(3, topIdx - i), 0);
  return {
    eff,
    craftedIn,
    netDef,
    deficit,
    equivDeficit,
    surplus: deficit === 0 ? lastSurplus : 0
  };
}

/**
 * Waterfall allocation across the ranked prefarmQueue (#1.1 -> #1.2 -> #2.1 ...).
 * Higher-priority targets consume shared resources (Mora, Hero's Wit, Crowns, Books, Weapon mats,
 * and Common Enemy Drops with 3:1 crafting) first, and only remaining surplus flows down.
 */
export function calculateWaterfallPrefarm(prefarmQueue = [], inventory = {}, wallet = null) {
  const sorted = sortAndLabelPrefarmQueue(prefarmQueue);
  const effectiveWits = Math.floor(calcEffectiveHerosWit(inventory).effectiveTotal);
  const pool = new Map();
  const reservedBy = new Map(); // matKey -> { total, byLabel: Map<label, amount> }

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

  const recordReserved = (matKey, amount, tierLabel) => {
    if (!amount || amount <= 0) return;
    if (!reservedBy.has(matKey)) reservedBy.set(matKey, { total: 0, byLabel: new Map() });
    const entry = reservedBy.get(matKey);
    entry.total += amount;
    entry.byLabel.set(tierLabel, (entry.byLabel.get(tierLabel) || 0) + amount);
  };

  const results = new Map();
  for (const target of sorted) {
    const req = computeRawTargetRequirements(target);
    const charMeta = getCharacterMeta(target.characterKey);
    const weaponMeta = target.weaponKey ? getWeaponMeta(target.weaponKey) : null;

    const tieredOwned = {};
    const tieredCrafted = {};
    const tieredKeys = new Set();
    const candidateTriples = [];
    const bookMatchKey = Object.keys(req).find((k) => /^(TeachingsOf|GuideTo|PhilosophiesOf)(.+)$/.test(k));
    if (bookMatchKey) {
      const bookBase = bookMatchKey.replace(/^(TeachingsOf|GuideTo|PhilosophiesOf)/, '');
      candidateTriples.push([`TeachingsOf${bookBase}`, `GuideTo${bookBase}`, `PhilosophiesOf${bookBase}`]);
    }
    if (Array.isArray(charMeta?.commonMatTiers) && charMeta.commonMatTiers.length === 3) {
      candidateTriples.push(charMeta.commonMatTiers);
    }
    if (Array.isArray(charMeta?.gemTiers) && charMeta.gemTiers.length === 4) {
      candidateTriples.push(charMeta.gemTiers);
    }
    if (Array.isArray(weaponMeta?.commonMatTiers) && weaponMeta.commonMatTiers.length === 3) {
      const sameAsChar = candidateTriples.some((t) => t[0] === weaponMeta.commonMatTiers[0]);
      if (!sameAsChar) candidateTriples.push(weaponMeta.commonMatTiers);
    }
    if (Array.isArray(weaponMeta?.eliteMatTiers) && weaponMeta.eliteMatTiers.length === 3) {
      candidateTriples.push(weaponMeta.eliteMatTiers);
    }

    const prevReservedSnapshot = new Map();
    for (const [k, info] of reservedBy.entries()) {
      prevReservedSnapshot.set(k, { total: info.total, labels: [...info.byLabel.keys()].join(', ') });
    }

    const preOwnedSnapshot = {};
    for (const tiers of candidateTriples) {
      if (tiers.reduce((s, k) => s + (req[k] || 0), 0) <= 0) continue;
      const beforeTiers = tiers.map((k) => getPool(k));
      const { eff, crafted } = allocateTieredWaterfall(tiers, req, getPool, (k, v) => pool.set(k, v));
      Object.assign(tieredOwned, eff);
      Object.assign(tieredCrafted, crafted);
      tiers.forEach((k, idx) => {
        tieredKeys.add(k);
        recordReserved(k, beforeTiers[idx] - getPool(k), target.tierLabel);
      });
    }
    for (const matKey of Object.keys(req)) {
      if (!tieredKeys.has(matKey)) {
        preOwnedSnapshot[matKey] = getPool(matKey);
      }
    }

    const rows = formatRequirementRows(req, (matKey) =>
      tieredKeys.has(matKey) ? tieredOwned[matKey] : preOwnedSnapshot[matKey]
    ).map((row) => {
      const resInfo = prevReservedSnapshot.get(row.key);
      return {
        ...row,
        craftedIn: tieredCrafted[row.key] || 0,
        reservedByPrev: resInfo?.total || 0,
        reservedByLabel: resInfo?.labels || ''
      };
    });

    for (const [matKey, needed] of Object.entries(req)) {
      if (!tieredKeys.has(matKey)) {
        const before = getPool(matKey);
        const after = Math.max(0, before - needed);
        pool.set(matKey, after);
        recordReserved(matKey, before - after, target.tierLabel);
      }
    }
    results.set(target.id, rows);
  }
  return results;
}

const WEEKDAY_SHORT = {
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat',
  Sunday: 'Sun'
};

function getDomainInfoForReward(matKey, todayName) {
  const catalog = getCatalog();
  const normTarget = normalizeAssetKeySimple(matKey);
  const schedule = catalog?.domainSchedule || {};
  const days = [];
  let domainName = '';
  let seriesShortName = '';
  let domainType = '';

  for (const [dayFull, list] of Object.entries(schedule)) {
    for (const dom of list || []) {
      const match = (dom.rewards || []).find((r) => normalizeAssetKeySimple(r.key) === normTarget);
      if (match) {
        if (!domainName) domainName = dom.name;
        if (!domainType) domainType = dom.domainType;
        if (!seriesShortName) seriesShortName = match.name;
        const shortDay = WEEKDAY_SHORT[dayFull] || dayFull.slice(0, 3);
        if (!days.includes(shortDay)) days.push(shortDay);
      }
    }
  }

  const todayShort = todayName ? WEEKDAY_SHORT[todayName] || todayName.slice(0, 3) : '';
  return {
    domainName,
    domainType,
    seriesShortName,
    days,
    isToday: Boolean(todayShort && days.includes(todayShort))
  };
}

function normalizeAssetKeySimple(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Aggregates & transforms the shared resource pool for Priority #1 & #2 targets
 * into an actionable farming and resin planner (grouped tiered series with 3:1
 * alchemy crafting, EXP pool, WL9 resin/run estimates, and #1/#2 allocation).
 */
export function calculatePrioritySharedPool(prefarmQueue = [], inventory = {}, wallet = null, todayName = null) {
  const labeled = sortAndLabelPrefarmQueue(prefarmQueue);
  const activeTiers = [...new Set(labeled.map((t) => t.tier))].slice(0, 2);
  const sorted = labeled.filter((t) => activeTiers.includes(t.tier));
  if (!sorted.length) return [];

  const effectiveWits = Math.floor(calcEffectiveHerosWit(inventory).effectiveTotal);
  const expBreakdown = calcEffectiveHerosWit(inventory);
  const dreamSolventCount = Number(inventory.DreamSolvent?.count ?? 0);

  const getRawOwned = (matKey) => {
    if (matKey === 'HerosWit') return effectiveWits;
    if (matKey === 'Mora') return Number(wallet?.mora ?? inventory[matKey]?.count ?? 0);
    return Number(inventory[matKey]?.count ?? 0);
  };

  // Track per-target raw requirements and classify each material key
  const targetReqs = sorted.map((t) => ({
    target: t,
    charMeta: getCharacterMeta(t.characterKey),
    weaponMeta: t.weaponKey ? getWeaponMeta(t.weaponKey) : null,
    req: computeRawTargetRequirements(t)
  }));

  const matKindByKey = new Map();
  const talentSeriesMap = new Map(); // base -> { base, byTier: { T2, T3, T4 }, byTarget: Map<rank, {T2,T3,T4}> }
  const commonSeriesMap = new Map(); // seriesId (T3 key) -> { keys: { T1, T2, T3 }, neededByTier: { T1, T2, T3 }, byRank }
  const commonKeyToSeries = new Map(); // matKey -> { seriesId, tierKey: 'T1'|'T2'|'T3', keys: { T1, T2, T3 } }
  const gemSeriesMap = new Map(); // seriesId (T5 key) -> { keys: [T2, T3, T4, T5], neededByTier: [0,0,0,0], byRank }
  const gemKeyToSeries = new Map(); // matKey -> { seriesId, idx: 0..3, keys }
  for (const { charMeta, weaponMeta } of targetReqs) {
    const registerDropSeries = (tiers, isElite) => {
      if (!Array.isArray(tiers) || tiers.length !== 3) return;
      const keys = { T1: tiers[0], T2: tiers[1], T3: tiers[2] };
      const seriesId = tiers[2];
      commonKeyToSeries.set(tiers[0], { seriesId, tierKey: 'T1', keys, isElite });
      commonKeyToSeries.set(tiers[1], { seriesId, tierKey: 'T2', keys, isElite });
      commonKeyToSeries.set(tiers[2], { seriesId, tierKey: 'T3', keys, isElite });
    };
    registerDropSeries(charMeta?.commonMatTiers, false);
    registerDropSeries(weaponMeta?.commonMatTiers, false);
    registerDropSeries(weaponMeta?.eliteMatTiers, true);
    if (Array.isArray(charMeta?.gemTiers) && charMeta.gemTiers.length === 4) {
      const seriesId = charMeta.gemTiers[3];
      charMeta.gemTiers.forEach((k, idx) => {
        gemKeyToSeries.set(k, { seriesId, idx, keys: charMeta.gemTiers });
      });
    }
  }
  const flatMap = new Map(); // matKey -> { key, kind, neededByRank: Map<rank, number> }

  for (const { target, charMeta, weaponMeta, req } of targetReqs) {
    for (const [matKey, needed] of Object.entries(req)) {
      if (!needed || needed <= 0) continue;

      const bookMatch = matKey.match(/^(TeachingsOf|GuideTo|PhilosophiesOf)(.+)$/);
      if (bookMatch) {
        const tierPrefix = bookMatch[1];
        const base = bookMatch[2];
        const tierKey = tierPrefix === 'TeachingsOf' ? 'T2' : tierPrefix === 'GuideTo' ? 'T3' : 'T4';
        if (!talentSeriesMap.has(base)) {
          talentSeriesMap.set(base, {
            base,
            keys: {
              T2: `TeachingsOf${base}`,
              T3: `GuideTo${base}`,
              T4: `PhilosophiesOf${base}`
            },
            neededByTier: { T2: 0, T3: 0, T4: 0 },
            byRank: new Map()
          });
        }
        const series = talentSeriesMap.get(base);
        series.neededByTier[tierKey] += needed;
        if (!series.byRank.has(target.rank)) series.byRank.set(target.rank, { T2: 0, T3: 0, T4: 0 });
        series.byRank.get(target.rank)[tierKey] += needed;
        continue;
      }

      const commonInfo = commonKeyToSeries.get(matKey);
      if (commonInfo) {
        if (!commonSeriesMap.has(commonInfo.seriesId)) {
          commonSeriesMap.set(commonInfo.seriesId, {
            keys: commonInfo.keys,
            isElite: commonInfo.isElite,
            neededByTier: { T1: 0, T2: 0, T3: 0 },
            byRank: new Map()
          });
        }
        const cSeries = commonSeriesMap.get(commonInfo.seriesId);
        cSeries.neededByTier[commonInfo.tierKey] += needed;
        if (!cSeries.byRank.has(target.rank)) cSeries.byRank.set(target.rank, { T1: 0, T2: 0, T3: 0 });
        cSeries.byRank.get(target.rank)[commonInfo.tierKey] += needed;
        continue;
      }

      const gemInfo = gemKeyToSeries.get(matKey);
      if (gemInfo) {
        if (!gemSeriesMap.has(gemInfo.seriesId)) {
          gemSeriesMap.set(gemInfo.seriesId, {
            keys: gemInfo.keys,
            neededByTier: [0, 0, 0, 0],
            byRank: new Map()
          });
        }
        const gSeries = gemSeriesMap.get(gemInfo.seriesId);
        gSeries.neededByTier[gemInfo.idx] += needed;
        if (!gSeries.byRank.has(target.rank)) gSeries.byRank.set(target.rank, [0, 0, 0, 0]);
        gSeries.byRank.get(target.rank)[gemInfo.idx] += needed;
        continue;
      }

      // Determine kind for non-book materials
      let kind = matKindByKey.get(matKey);
      if (!kind) {
        if (matKey === 'HerosWit') kind = 'exp';
        else if (matKey === 'Mora') kind = 'mora';
        else if (matKey === 'CrownOfInsight') kind = 'crown';
        else if (matKey === 'MysticEnhancementOre') kind = 'ore';
        else if (weaponMeta?.domainMatExactKey && matKey === weaponMeta.domainMatExactKey) kind = 'weaponSeries';
        else if (charMeta?.weeklyMat && matKey === charMeta.weeklyMat) kind = 'weeklyBoss';
        else if (charMeta?.bossMat && matKey === charMeta.bossMat) kind = 'worldBoss';
        else if (charMeta?.localSpecialty && matKey === charMeta.localSpecialty) kind = 'localSpecialty';
        else kind = 'other';
        matKindByKey.set(matKey, kind);
      }

      if (!flatMap.has(matKey)) {
        flatMap.set(matKey, { key: matKey, kind, neededTotal: 0, byRank: new Map() });
      }
      const entry = flatMap.get(matKey);
      entry.neededTotal += needed;
      entry.byRank.set(target.rank, (entry.byRank.get(target.rank) || 0) + needed);
    }
  }

  const buildAlloc = (needByRankEquiv, totalNeedEquiv, netDeficitEquiv) => {
    const fundedTotal = Math.max(0, totalNeedEquiv - netDeficitEquiv);
    let remaining = fundedTotal;
    const targets = [];
    targetReqs.forEach(({ target, charMeta }, idx) => {
      const charNeed = needByRankEquiv.get(target.rank) || 0;
      if (charNeed <= 0) return;
      const funded = Math.min(charNeed, remaining);
      remaining = Math.max(0, remaining - funded);
      targets.push({
        rank: targets.length + 1,
        slotIndex: idx,
        tier: target.tier,
        tierLabel: target.tierLabel,
        characterKey: target.characterKey,
        name: charMeta.name || target.characterKey,
        labelPrefix: `${target.tierLabel} `,
        needed: charNeed,
        funded,
        pct: Math.round((funded / charNeed) * 100),
        widthPct: totalNeedEquiv > 0 ? Number(((funded / totalNeedEquiv) * 100).toFixed(2)) : 0
      });
    });
    return { targets };
  };

  const results = [];

  // 1. Talent Book Series (with 3-to-1 Alchemy Conversion)
  for (const series of talentSeriesMap.values()) {
    const o2 = getRawOwned(series.keys.T2);
    const o3 = getRawOwned(series.keys.T3);
    const o4 = getRawOwned(series.keys.T4);
    const n2 = series.neededByTier.T2;
    const n3 = series.neededByTier.T3;
    const n4 = series.neededByTier.T4;

    const r = resolveTieredSeries([o2, o3, o4], [n2, n3, n4]);
    const domInfo = getDomainInfoForReward(series.keys.T4, todayName);
    const needEquivByRank = new Map();
    let totalNeedEquiv = 0;
    for (const [rank, t] of series.byRank.entries()) {
      const eq = t.T4 + t.T3 / 3 + t.T2 / 9;
      needEquivByRank.set(rank, eq);
      totalNeedEquiv += eq;
    }

    let farmingCost = null;
    if (r.deficit > 0) {
      const runs = Math.max(1, Math.ceil(r.equivDeficit / 2.2));
      const resin = runs * 20;
      farmingCost = { runs, resin, text: `~${runs} Runs · ${resin.toLocaleString()} Resin` };
    }

    results.push({
      key: series.keys.T4,
      name: `${series.base} Series`,
      kind: 'talentSeries',
      rarity: 4,
      owned: r.eff[2],
      neededTotal: n4 + n3 + n2,
      deficit: r.deficit,
      surplus: r.surplus,
      tiers: [
        { label: 'T2', key: series.keys.T2, owned: o2, needed: n2, netDeficit: r.netDef[0] },
        { label: 'T3', key: series.keys.T3, owned: r.eff[1], rawOwned: o3, craftedIn: r.craftedIn[1], needed: n3, netDeficit: r.netDef[1] },
        { label: 'T4', key: series.keys.T4, owned: r.eff[2], rawOwned: o4, craftedIn: r.craftedIn[2], needed: n4, netDeficit: r.netDef[2] }
      ],
      sourceLabel: domInfo.domainName || 'Talent Domain',
      scheduleDays: domInfo.days,
      isToday: domInfo.isToday,
      farmingCost,
      urgency: domInfo.isToday ? 2 : 3,
      alloc: buildAlloc(needEquivByRank, totalNeedEquiv, r.equivDeficit)
    });
  }

  // 1b. Common Enemy Drop Series (Non-Resin, with 3-to-1 Alchemy Conversion)
  for (const series of commonSeriesMap.values()) {
    const o1 = getRawOwned(series.keys.T1);
    const o2 = getRawOwned(series.keys.T2);
    const o3 = getRawOwned(series.keys.T3);
    const n1 = series.neededByTier.T1;
    const n2 = series.neededByTier.T2;
    const n3 = series.neededByTier.T3;

    const r = resolveTieredSeries([o1, o2, o3], [n1, n2, n3]);
    const needEquivByRank = new Map();
    let totalNeedEquiv = 0;
    for (const [rank, t] of series.byRank.entries()) {
      const eq = t.T3 + t.T2 / 3 + t.T1 / 9;
      needEquivByRank.set(rank, eq);
      totalNeedEquiv += eq;
    }

    const t3Meta = getMaterialMeta(series.keys.T3);
    const tierLabels = series.isElite ? ['T2', 'T3', 'T4'] : ['T1', 'T2', 'T3'];
    results.push({
      key: series.keys.T3,
      name: t3Meta.name || series.keys.T3,
      kind: series.isElite ? 'eliteMat' : 'commonMat',
      rarity: series.isElite ? 4 : 3,
      owned: r.eff[2],
      neededTotal: n3 + n2 + n1,
      deficit: r.deficit,
      surplus: r.surplus,
      tiers: [
        { label: tierLabels[0], key: series.keys.T1, owned: o1, needed: n1, netDeficit: r.netDef[0] },
        { label: tierLabels[1], key: series.keys.T2, owned: r.eff[1], rawOwned: o2, craftedIn: r.craftedIn[1], needed: n2, netDeficit: r.netDef[1] },
        { label: tierLabels[2], key: series.keys.T3, owned: r.eff[2], rawOwned: o3, craftedIn: r.craftedIn[2], needed: n3, netDeficit: r.netDef[2] }
      ],
      sourceLabel: series.isElite ? 'Elite Enemy Drop' : 'Enemy Drop',
      scheduleDays: [],
      isToday: false,
      farmingCost: null,
      urgency: 5,
      alloc: buildAlloc(needEquivByRank, totalNeedEquiv, r.equivDeficit)
    });
  }

  // 1c. Elemental Ascension Gems (Sliver / Fragment / Chunk / Gemstone, 3-to-1 Alchemy Conversion)
  const GEM_LABELS = ['T2', 'T3', 'T4', 'T5'];
  for (const series of gemSeriesMap.values()) {
    const ownedArr = series.keys.map((k) => getRawOwned(k));
    const neededArr = series.neededByTier;
    const r = resolveTieredSeries(ownedArr, neededArr);
    const needEquivByRank = new Map();
    let totalNeedEquiv = 0;
    for (const [rank, arr] of series.byRank.entries()) {
      const eq = arr[3] + arr[2] / 3 + arr[1] / 9 + arr[0] / 27;
      needEquivByRank.set(rank, eq);
      totalNeedEquiv += eq;
    }

    const t5Meta = getMaterialMeta(series.keys[3]);
    results.push({
      key: series.keys[3],
      name: t5Meta.name || series.keys[3],
      kind: 'gemSeries',
      rarity: 5,
      owned: r.eff[3],
      neededTotal: neededArr.reduce((s, v) => s + v, 0),
      deficit: r.deficit,
      surplus: r.surplus,
      tiers: series.keys.map((k, i) => ({
        label: GEM_LABELS[i],
        key: k,
        owned: r.eff[i],
        rawOwned: ownedArr[i],
        craftedIn: r.craftedIn[i],
        needed: neededArr[i],
        netDeficit: r.netDef[i]
      })),
      sourceLabel: 'Boss / Weekly / Alchemy',
      scheduleDays: [],
      isToday: false,
      farmingCost: null,
      urgency: 4,
      alloc: buildAlloc(needEquivByRank, totalNeedEquiv, r.equivDeficit)
    });
  }

  // 2. Non-Book Materials (Weapon Mats, Weekly Boss, World Boss, EXP, Mora, Local Specialty, etc.)
  for (const item of flatMap.values()) {
    const meta = getMaterialMeta(item.key);
    const owned = getRawOwned(item.key);
    const delta = owned - item.neededTotal;
    const deficit = delta < 0 ? Math.abs(delta) : 0;
    const surplus = delta >= 0 ? delta : 0;

    let name = meta.name;
    let sourceLabel = 'Material';
    let scheduleDays = [];
    let isToday = false;
    let urgency = 4;
    let farmingCost = null;
    let tiers = null;

    if (item.kind === 'weaponSeries') {
      const domInfo = getDomainInfoForReward(item.key, todayName);
      name = domInfo.seriesShortName ? `${domInfo.seriesShortName} Series` : meta.name;
      sourceLabel = domInfo.domainName || 'Weapon Domain';
      scheduleDays = domInfo.days;
      isToday = domInfo.isToday;
      urgency = domInfo.isToday ? 2 : 3;
      tiers = [{ label: 'T5', key: item.key, owned, needed: item.neededTotal, netDeficit: deficit }];
      if (deficit > 0) {
        const runs = Math.max(1, Math.ceil(deficit / 2.2));
        const resin = runs * 20;
        farmingCost = { runs, resin, text: `~${runs} Runs · ${resin.toLocaleString()} Resin` };
      }
    } else if (item.kind === 'weeklyBoss') {
      sourceLabel = 'Weekly Boss';
      urgency = 1;
      if (deficit > 0) {
        const weeks = Math.max(1, Math.ceil(deficit / 2.4));
        farmingCost = { weeks, text: `~${weeks} ${weeks === 1 ? 'Week' : 'Weeks'}` };
      }
    } else if (item.kind === 'worldBoss') {
      sourceLabel = meta.bossName ? `Boss · ${meta.bossName}` : 'Overworld Boss';
      urgency = 4;
      if (deficit > 0) {
        const runs = Math.max(1, Math.ceil(deficit / 2.5));
        const resin = runs * 40;
        farmingCost = { runs, resin, text: `~${runs} Runs · ${resin.toLocaleString()} Resin` };
      }
    } else if (item.kind === 'exp') {
      name = "Hero's Wit";
      sourceLabel = 'Ley Line';
      urgency = 4;
      if (deficit > 0) {
        const runs = Math.max(1, Math.ceil((deficit * 20000) / 122500));
        const resin = runs * 20;
        farmingCost = { runs, resin, text: `~${runs} Runs · ${resin.toLocaleString()} Resin` };
      }
    } else if (item.kind === 'mora') {
      sourceLabel = 'Ley Line';
      urgency = 4;
      if (deficit > 0) {
        const runs = Math.max(1, Math.ceil(deficit / 120000));
        const resin = runs * 20;
        farmingCost = { runs, resin, text: `~${runs} Runs · ${resin.toLocaleString()} Resin` };
      }
    } else if (item.kind === 'localSpecialty') {
      sourceLabel = 'Local Specialty';
    } else if (item.kind === 'crown') {
      sourceLabel = 'Event / Limited';
    } else if (item.kind === 'ore') {
      sourceLabel = 'Forging / Mining';
    }

    results.push({
      key: item.key,
      name,
      kind: item.kind,
      rarity: meta.rarity || (item.kind === 'crown' ? 5 : item.kind === 'weeklyBoss' ? 5 : item.kind === 'exp' || item.kind === 'worldBoss' ? 4 : 3),
      owned,
      neededTotal: item.neededTotal,
      deficit,
      surplus,
      tiers,
      expBreakdown: item.kind === 'exp' ? expBreakdown : null,
      sourceLabel,
      scheduleDays,
      isToday,
      bossUnreleased: Boolean(meta.bossUnreleased),
      dreamSolventCount: item.kind === 'weeklyBoss' ? dreamSolventCount : 0,
      farmingCost,
      urgency,
      alloc: buildAlloc(item.byRank, item.neededTotal, deficit)
    });
  }

  return results.sort((a, b) => {
    const aDef = a.deficit > 0 ? 0 : 1;
    const bDef = b.deficit > 0 ? 0 : 1;
    if (aDef !== bDef) return aDef - bDef;
    if (a.urgency !== b.urgency) return a.urgency - b.urgency;
    return b.deficit - a.deficit || b.neededTotal - a.neededTotal;
  });
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

/**
 * Computes Spare / Uncommitted Mora and Hero's Wit remaining after funding
 * the active Priority #1 & #2 queue.
 */
export function calcSpareReserves(account = {}, sharedPool = []) {
  const wallet = account.wallet || {};
  const inventory = account.inventory || {};
  const bagMora = Number(wallet.mora ?? inventory.Mora?.count ?? 0);
  const bagWits = Math.floor(calcEffectiveHerosWit(inventory).effectiveTotal);

  const moraItem = sharedPool.find((i) => i.kind === 'mora');
  const expItem = sharedPool.find((i) => i.kind === 'exp');
  const committedMora = Number(moraItem?.neededTotal ?? 0);
  const committedWits = Number(expItem?.neededTotal ?? 0);

  const spareMora = bagMora - committedMora;
  const spareWits = bagWits - committedWits;

  return {
    bagMora,
    bagWits,
    committedMora,
    committedWits,
    spareMora,
    spareWits,
    isMoraBroke: spareMora < 0,
    isWitsBroke: spareWits < 0
  };
}

/**
 * Calculates estimated resin days, real calendar landing date (relative to server),
 * and the true bottleneck gatekeeper for a priority target.
 */
export function calcTargetTelemetry(target, sharedPool = [], serverId = 'NA', nowMs = Date.now()) {
  const server = SERVER_REGIONS[serverId] || SERVER_REGIONS.NA;
  let resinDomains = 0;
  let resinBosses = 0;
  let resinLeyLines = 0;
  let totalUnfundedResin = 0;
  let weeklyWeeks = 0;

  for (const item of sharedPool) {
    if (item.deficit <= 0) continue;
    const targets = item.alloc?.targets || [];
    const at = targets.find((x) => x.characterKey === target.characterKey);
    if (!at || at.needed <= at.funded) continue;

    if (item.kind === 'weeklyBoss') {
      const myDeficit = Math.max(0, at.needed - at.funded);
      weeklyWeeks = Math.max(weeklyWeeks, Math.ceil(myDeficit / 2.4));
    }

    if (item.farmingCost?.resin) {
      const totalUnfunded = targets.reduce((acc, x) => acc + Math.max(0, x.needed - x.funded), 0);
      const myUnfunded = Math.max(0, at.needed - at.funded);
      const shareResin = totalUnfunded > 0 ? item.farmingCost.resin * (myUnfunded / totalUnfunded) : 0;
      totalUnfundedResin += shareResin;

      if (item.kind === 'talentSeries' || item.kind === 'weaponSeries') resinDomains += shareResin;
      else if (item.kind === 'worldBoss') resinBosses += shareResin;
      else resinLeyLines += shareResin;
    }
  }

  const resinDays = totalUnfundedResin > 0 ? Math.ceil(totalUnfundedResin / 180) : 0;
  const landingMs = nowMs + server.offsetHours * 3600_000 + resinDays * 86400_000;
  const landingDate = new Date(landingMs);
  const etaDateText = `${MONTH_SHORT[landingDate.getUTCMonth()]} ${landingDate.getUTCDate()}`;
  const etaLabel = resinDays > 0 ? `~${resinDays}d · ${etaDateText}` : weeklyWeeks > 0 ? `~${weeklyWeeks}w · ${etaDateText}` : 'Ready';

  const weeklyDays = weeklyWeeks * 7;
  let gatekeeper;
  if (weeklyDays > resinDays && weeklyWeeks > 0) {
    gatekeeper = {
      type: 'weekly',
      label: `Weekly Boss locked (~${weeklyWeeks} ${weeklyWeeks === 1 ? 'Monday' : 'Mondays'}) — save Fragile Resin`
    };
  } else if (resinDomains > 0 && resinDomains >= resinBosses && resinDomains >= resinLeyLines) {
    gatekeeper = {
      type: 'domain',
      label: `Domain schedule locked (~${resinDays}d · ${Math.round(resinDomains).toLocaleString()} Resin)`
    };
  } else if (resinBosses > 0 && resinBosses >= resinLeyLines) {
    gatekeeper = {
      type: 'boss',
      label: `World Boss locked (~${resinDays}d · ${Math.round(resinBosses).toLocaleString()} Resin)`
    };
  } else if (resinDays > 0) {
    gatekeeper = {
      type: 'leyline',
      label: `Ley Line / EXP locked (~${resinDays}d · ${Math.round(totalUnfundedResin).toLocaleString()} Resin)`
    };
  } else {
    gatekeeper = { type: 'ready', label: 'All mats ready — ready to build' };
  }

  return {
    resinDays,
    totalUnfundedResin: Math.round(totalUnfundedResin),
    etaDateText,
    etaLabel,
    weeklyWeeks,
    gatekeeper
  };
}

/**
 * Aggregates remaining deficit resin across domain, boss, and ley line categories.
 */
export function calcResinAllocationSummary(sharedPool = []) {
  const sums = { talent: 0, weapon: 0, boss: 0, leyline: 0 };
  for (const item of sharedPool) {
    const r = Number(item.farmingCost?.resin || 0);
    if (item.deficit <= 0 || r <= 0) continue;
    if (item.kind === 'talentSeries') sums.talent += r;
    else if (item.kind === 'weaponSeries') sums.weapon += r;
    else if (item.kind === 'worldBoss') sums.boss += r;
    else if (item.kind === 'mora' || item.kind === 'exp') sums.leyline += r;
  }

  const totalResin = sums.talent + sums.weapon + sums.boss + sums.leyline;
  const defs = [
    { id: 'talent', label: 'Talent Domains', resin: sums.talent, colorVar: 'var(--telemetry-cyan)' },
    { id: 'weapon', label: 'Weapon Domains', resin: sums.weapon, colorVar: 'var(--telemetry-violet)' },
    { id: 'boss', label: 'World Bosses', resin: sums.boss, colorVar: 'var(--telemetry-amber)' },
    { id: 'leyline', label: 'Ley Lines (Mora/EXP)', resin: sums.leyline, colorVar: 'var(--telemetry-mint)' }
  ];

  const buckets = defs
    .filter((b) => b.resin > 0)
    .map((b) => ({
      ...b,
      pct: totalResin > 0 ? Math.max(1, Math.round((b.resin / totalResin) * 100)) : 0
    }));

  return { totalResin, buckets };
}

/**
 * Genshin 6-week (42-day) Patch & 21-day Banner Half Calendar anchored to
 * Version 7.3 Launch: 2026-12-16 02:00 UTC (Dec 15, 21:00 EST Toronto / Dec 16, 09:00 WIB Jakarta).
 * Also models the 7-day All-Domains-Open surge at the start of each 21-day banner half.
 */
export const PATCH_7_3_EPOCH_MS = Date.UTC(2026, 11, 16, 2, 0, 0);
const PATCH_CYCLE_MS = 42 * 86400_000;
const BANNER_HALF_MS = 21 * 86400_000;

const KNOWN_BANNER_HALVES = {
  '7.2-1': { label: '7.2 Phase 1', bannerNote: 'Phase 1', featuredKeys: [] },
  '7.2-2': { label: '7.2 Phase 2', bannerNote: 'Phase 2', featuredKeys: [] },
  '7.3-1': { label: '7.3 Phase 1', bannerNote: 'Anastasya + Danica', featuredKeys: ['Anastasya', 'Danica'] },
  '7.3-2': { label: '7.3 Phase 2', bannerNote: 'Lineup TBA', featuredKeys: [] }
};

function formatVersionFrom73Offset(patchOffset) {
  const minor = 3 + patchOffset;
  if (minor >= 0 && minor <= 8) return `7.${minor}`;
  const totalTenths = 73 + patchOffset;
  return `${Math.floor(totalTenths / 10)}.${((totalTenths % 10) + 10) % 10}`;
}

export function getPatchCalendarInfo(serverId = 'NA', nowMs = Date.now()) {
  const resetInfo = getServerResetInfo(serverId, nowMs);
  const patchOffset = Math.floor((nowMs - PATCH_7_3_EPOCH_MS) / PATCH_CYCLE_MS);
  const version = formatVersionFrom73Offset(patchOffset);
  const patchStartMs = PATCH_7_3_EPOCH_MS + patchOffset * PATCH_CYCLE_MS;
  const elapsedMs = Math.max(0, nowMs - patchStartMs);
  const dayInPatch = Math.min(42, Math.floor(elapsedMs / 86400_000) + 1);
  const phase = dayInPatch <= 21 ? 1 : 2;
  const dayInPhase = phase === 1 ? dayInPatch : dayInPatch - 21;

  // First 7 days of each 21-day banner half unlock all Talent & Weapon domains regardless of weekday
  const isAllDomainsOpenSurge = dayInPhase >= 1 && dayInPhase <= 7;
  const surgeDaysRemaining = isAllDomainsOpenSurge ? 8 - dayInPhase : 0;

  const nextPhaseStartMs = phase === 1 ? patchStartMs + BANNER_HALF_MS : patchStartMs + PATCH_CYCLE_MS;
  const nextVersion = phase === 1 ? version : formatVersionFrom73Offset(patchOffset + 1);
  const nextPhase = phase === 1 ? 2 : 1;

  const curKey = `${version}-${phase}`;
  const nextKey = `${nextVersion}-${nextPhase}`;
  const curMeta = KNOWN_BANNER_HALVES[curKey] || { label: `${version} Phase ${phase}`, bannerNote: `Phase ${phase} (21d)` };
  const nextMeta = KNOWN_BANNER_HALVES[nextKey] || { label: `${nextVersion} Phase ${nextPhase}`, bannerNote: `Phase ${nextPhase} (21d)` };

  const msToNextPhase = Math.max(0, nextPhaseStartMs - nowMs);
  const daysToNextPhase = Number((msToNextPhase / 86400_000).toFixed(2));
  const wholeDaysToNext = Math.floor(msToNextPhase / 86400_000);
  const remHoursToNext = Math.floor((msToNextPhase % 86400_000) / 3600_000);
  const remMinutesToNext = Math.floor((msToNextPhase % 3600_000) / 60_000);
  const naturalResinToNext = Math.floor((msToNextPhase / 3600_000) * 7.5); // 1 Resin / 8m = 7.5/hr = 180/day

  const weekdayCounts = { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 };
  let allOpenDaysBeforeNext = 0;
  for (let probe = nowMs; probe < nextPhaseStartMs; probe += 86400_000) {
    const pElapsed = Math.max(0, probe - patchStartMs);
    const pDayPatch = Math.min(42, Math.floor(pElapsed / 86400_000) + 1);
    const pDayPhase = pDayPatch <= 21 ? pDayPatch : pDayPatch - 21;
    const dName = getServerResetInfo(serverId, probe).inGameDay;
    const short = WEEKDAY_SHORT[dName] || dName.slice(0, 3);
    if (pDayPhase >= 1 && pDayPhase <= 7) {
      allOpenDaysBeforeNext += 1;
    } else if (short === 'Sun') {
      allOpenDaysBeforeNext += 1;
      weekdayCounts.Sun += 1;
    } else if (weekdayCounts[short] !== undefined) {
      weekdayCounts[short] += 1;
    }
  }

  const nextLocalDate = new Date(nextPhaseStartMs + resetInfo.server.offsetHours * 3600_000);
  const nextPhaseDateShort = `${MONTH_SHORT[nextLocalDate.getUTCMonth()]} ${nextLocalDate.getUTCDate()}`;
  let nextLocalTimeText = `${nextPhaseDateShort} (${resetInfo.server.short})`;
  try {
    nextLocalTimeText = new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    }).format(new Date(nextPhaseStartMs));
  } catch {
    // Fallback to server short date
  }

  return {
    ...resetInfo,
    version,
    phase,
    dayInPatch,
    dayInPhase,
    currentLabel: curMeta.label,
    currentBannerNote: curMeta.bannerNote,
    isAllDomainsOpenSurge,
    surgeDaysRemaining,
    effectiveScheduleDay: isAllDomainsOpenSurge ? 'Sunday' : resetInfo.inGameDay,
    nextVersion,
    nextPhase,
    nextLabel: nextMeta.label,
    nextBannerNote: nextMeta.bannerNote,
    nextFeaturedKeys: nextMeta.featuredKeys || [],
    nextPhaseStartMs,
    nextPhaseDateShort,
    nextLocalTimeText,
    nextDualTzText: nextLocalTimeText,
    daysToNextPhase,
    countdownToNextText: `${wholeDaysToNext}d ${String(remHoursToNext).padStart(2, '0')}h ${String(remMinutesToNext).padStart(2, '0')}m`,
    naturalResinToNext,
    weekdayCounts,
    allOpenDaysBeforeNext,
    monThuSlots: weekdayCounts.Mon + weekdayCounts.Thu,
    tueFriSlots: weekdayCounts.Tue + weekdayCounts.Fri,
    wedSatSlots: weekdayCounts.Wed + weekdayCounts.Sat,
    sunSlots: allOpenDaysBeforeNext
  };
}

function buildFunctionalFloorTarget(target) {
  const curLvl = Math.max(1, Number(target.currentLevel) || 1);
  const tgtLvl = Math.max(curLvl, Number(target.targetLevel) || 90);
  const funcLvl = Math.max(curLvl, Math.min(tgtLvl, 80));
  const cT = target.currentTalent || {
    auto: target.currentTalents?.[0] ?? 1,
    skill: target.currentTalents?.[1] ?? 1,
    burst: target.currentTalents?.[2] ?? 1
  };
  const tT = target.targetTalent || {
    auto: target.targetTalents?.[0] ?? 6,
    skill: target.targetTalents?.[1] ?? 9,
    burst: target.targetTalents?.[2] ?? 9
  };
  return {
    ...target,
    targetLevel: funcLvl,
    currentTalent: cT,
    targetTalent: {
      auto: Math.max(Number(cT.auto) || 1, Math.min(Number(tT.auto) || 1, 8)),
      skill: Math.max(Number(cT.skill) || 1, Math.min(Number(tT.skill) || 1, 8)),
      burst: Math.max(Number(cT.burst) || 1, Math.min(Number(tT.burst) || 1, 8))
    },
    weaponTargetLevel: Math.max(Number(target.weaponCurrentLevel) || 1, Math.min(Number(target.weaponTargetLevel) || 90, 90))
  };
}

function estimateBookSeriesResinFromRows(wfRows = []) {
  let t2Def = 0;
  let t3Def = 0;
  let t4Def = 0;
  for (const r of wfRows) {
    if (r.deficit <= 0) continue;
    if (/^TeachingsOf/.test(r.key)) t2Def += r.deficit;
    else if (/^GuideTo/.test(r.key)) t3Def += r.deficit;
    else if (/^PhilosophiesOf/.test(r.key)) t4Def += r.deficit;
  }
  const equiv = t4Def + t3Def / 3 + t2Def / 9;
  if (equiv <= 0) return { runs: 0, resin: 0 };
  const runs = Math.max(1, Math.ceil(equiv / 2.2));
  return { runs, resin: runs * 20 };
}

/**
 * Two-Pass Milestone Waterfall:
 * Pass 1 allocates books, EXP, and Mora so ALL active priority targets reach their
 * Day-1 Functional Floor (Lv.80 + Talents <= 8, 0 Crowns) before Pass 2 allocates
 * expensive Lv.80->90 & Talent 9->10 Crown polish.
 */
export function calculateTwoPassMilestonePlan(prefarmQueue = [], inventory = {}, wallet = null, serverId = 'NA', nowMs = Date.now()) {
  const patchCal = getPatchCalendarInfo(serverId, nowMs);
  const sorted = sortAndLabelPrefarmQueue(prefarmQueue);
  const funcQueue = sorted.map((t) => buildFunctionalFloorTarget(t));
  const funcWf = calculateWaterfallPrefarm(funcQueue, inventory, wallet);
  const maxWf = calculateWaterfallPrefarm(sorted, inventory, wallet);

  const byId = new Map();
  let funcTotalMoraNeeded = 0;

  const targetSummaries = sorted.map((t, idx) => {
    const fTarget = funcQueue[idx];
    const fRows = funcWf.get(t.id) || [];
    const mRows = maxWf.get(t.id) || [];
    const funcPct = calcTargetReadinessPct(fRows);
    const maxPct = calcTargetReadinessPct(mRows);

    const fMoraRow = fRows.find((r) => r.key === 'Mora');
    if (fMoraRow && t.tier <= 2) funcTotalMoraNeeded += fMoraRow.needed || 0;

    const cm = getCharacterMeta(t.characterKey);
    const bookBase = cm?.talentBook || '';
    const domInfo = bookBase ? getDomainInfoForReward(`PhilosophiesOf${bookBase}`, patchCal.inGameDay) : { days: [] };
    const nonSunDays = (domInfo.days || []).filter((d) => d !== 'Sun');
    const dedicatedSlots = nonSunDays.reduce((acc, d) => acc + (patchCal.weekdayCounts[d] || 0), 0);

    const funcBooks = estimateBookSeriesResinFromRows(fRows);
    const maxBooks = estimateBookSeriesResinFromRows(mRows);

    const bossMeta = cm?.bossMat ? getMaterialMeta(cm.bossMat) : null;
    const bossRow = mRows.find((r) => r.key === cm?.bossMat);
    const bossDeficit = bossRow?.deficit || 0;
    const bossResin = bossDeficit > 0 ? Math.ceil(bossDeficit / 2.5) * 40 : 0;
    const bossUnreleased = Boolean(bossMeta?.bossUnreleased);

    const ft = fTarget.targetTalent;
    const summary = {
      id: t.id,
      characterKey: t.characterKey,
      name: cm?.name || t.characterKey,
      tier: t.tier,
      tierLabel: t.tierLabel,
      funcLabel: `Lv.${fTarget.targetLevel} · ${ft.auto}/${ft.skill}/${ft.burst}`,
      funcPct,
      maxPct,
      funcReady: funcPct >= 100,
      funcBookResin: funcBooks.resin,
      maxBookResin: maxBooks.resin,
      bookName: bookBase,
      bookDays: nonSunDays,
      dedicatedSlotsBeforeBanner: dedicatedSlots,
      bossName: bossMeta?.bossName || '',
      bossUnreleased,
      bossDeficit,
      bossResin
    };
    byId.set(t.id, summary);
    return summary;
  });

  const t1 = targetSummaries[0] || null;
  const t2 = targetSummaries[1] || null;
  let pivotHeadline = '';
  let pivotDetail = '';
  let pivotTone = 'accent';

  if (t1 && t2) {
    const sameBooks = Boolean(t1.bookName && t1.bookName === t2.bookName);
    const t1DaysText = t1.bookDays.length ? t1.bookDays.join('/') : 'Open Days';
    const t2DaysText = t2.bookDays.length ? t2.bookDays.join('/') : 'Open Days';

    if (!t1.funcReady && !t2.funcReady) {
      pivotTone = 'gold';
      if (!sameBooks && t1.bookName && t2.bookName) {
        pivotHeadline = `Farm ${t1.name} & ${t2.name} Books on Separate Weekdays`;
        pivotDetail = `Farm ${t1.bookName} (${t1DaysText} · ${t1.dedicatedSlotsBeforeBanner}d left) for ${t1.name}, and ${t2.bookName} (${t2DaysText} · ${t2.dedicatedSlotsBeforeBanner}d left) for ${t2.name}. Put Sundays & Mora into ${t1.name} until Lv.80 playable (${t1.funcPct}%), then move Sundays to ${t2.name} (${t2.funcPct}%).`;
      } else {
        pivotHeadline = `Get ${t1.name} to Lv.80 Playable First`;
        pivotDetail = `Finish ${t1.name}'s ${t1.funcLabel} milestone (${t1.funcPct}%${t1.funcBookResin ? ` · ~${t1.funcBookResin} Book Resin left` : ''}) first. Pause Lv.90 & Crowns (56 Philosophies & 2.3M Mora) until ${t2.name} also reaches ${t2.funcLabel}.`;
      }
    } else if (t1.funcReady && !t2.funcReady) {
      pivotTone = 'mint';
      pivotHeadline = `Focus Resin on ${t2.name} Next`;
      pivotDetail = `${t1.name} is already Day-1 playable (${t1.funcLabel} covered). Hold ${t1.name}'s Lv.90 & Crowns for now—spend Sundays, off-days, and Mora on ${t2.name} (${t2.funcPct}% to Lv.80) so both are ready on banner day.`;
    } else {
      pivotTone = 'mint';
      pivotHeadline = `Both ${t1.name} & ${t2.name} Are Day-1 Playable`;
      pivotDetail = `Lv.80 & Lv.8 Talents are covered for both characters. Spend remaining Resin & Mora freely on ${t1.name}'s Lv.90 and Crowns (${t1.maxPct}% of full goal).`;
    }
  } else if (t1) {
    pivotHeadline = t1.funcReady
      ? `${t1.name} Is Day-1 Playable (${t1.maxPct}% of Full Goal)`
      : `Next Milestone: ${t1.name} Lv.80 Playable (${t1.funcPct}%)`;
    pivotDetail = t1.bookName
      ? `${t1.bookName} opens ${t1.bookDays.join('/')} (${t1.dedicatedSlotsBeforeBanner} weekday + ${patchCal.sunSlots} All-Open days before ${patchCal.nextLabel}).`
      : 'Finish guaranteed Ascension & Talent mats before spending Resin on Artifacts.';
  }

  const lockedBossTargets = targetSummaries.filter((x) => x.tier <= 2 && x.bossUnreleased && x.bossResin > 0);
  let surgeWarning = '';
  if (lockedBossTargets.length) {
    const names = lockedBossTargets.map((x) => `${x.name} (${x.bossName || 'New Boss'}: ~${x.bossResin} Resin)`).join(' + ');
    const totalLockedResin = lockedBossTargets.reduce((s, x) => s + x.bossResin, 0);
    const lockedDays = (totalLockedResin / 180).toFixed(1);
    surgeWarning = `New Boss Week-1 Lock: ${names} unlocks in ${patchCal.nextLabel} (~${lockedDays} of the 7 All Domains Open days). Finish Talent & Weapon domains before ${patchCal.nextPhaseDateShort} so Week-1 Resin goes straight to the new boss.`;
  }

  return {
    patchCal,
    byId,
    targets: targetSummaries,
    funcTotalMoraNeeded,
    pivotHeadline,
    pivotDetail,
    pivotTone,
    surgeWarning
  };
}

function compactMoraText(n) {
  const abs = Math.abs(Number(n) || 0);
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (abs >= 10_000) return `${(abs / 1_000).toFixed(0)}K`;
  return Math.round(abs).toLocaleString();
}

/**
 * Passive-Adjusted Mora Horizon Calculator:
 * Accounts for passive daily Mora + remaining Battle Pass Mora before recommending
 * Blossom of Wealth (60,000 Mora / 20 Resin = 540K Mora/day @ 180 Resin), and computes
 * the latest safe calendar date to start farming Ley Lines.
 */
export function calcMoraStrategy(account = {}, sharedPool = [], twoPassPlan = null, patchCal = null, nowMs = Date.now()) {
  const cal = patchCal || twoPassPlan?.patchCal || getPatchCalendarInfo('NA', nowMs);
  const wallet = account?.wallet || {};
  const inventory = account?.inventory || {};
  const bagMora = Number(wallet.mora ?? inventory.Mora?.count ?? 0);
  const moraItem = (sharedPool || []).find((i) => i.kind === 'mora');
  const maxNeededMora = Number(moraItem?.neededTotal ?? 0);
  const funcNeededMora = Number(twoPassPlan?.funcTotalMoraNeeded ?? maxNeededMora);

  const goal = { ...DEFAULT_WISH_GOAL, ...(wallet.wishGoal || {}) };
  const hasBp = goal.hasBattlePass !== false;
  const bpLevel = Math.min(50, Math.max(1, Math.floor(Number(goal.bpLevel) || 30)));
  const remainingBpMora = Math.round(((50 - bpLevel) / 50) * (hasBp ? 2_160_000 : 720_000));
  const dailyPassiveMora = 85_000; // Commissions + Expeditions + Bounties/Requests + Event baseline
  const projectedPassiveMora = Math.round(cal.daysToNextPhase * dailyPassiveMora) + remainingBpMora;

  const funcNetDeficit = Math.max(0, funcNeededMora - bagMora - projectedPassiveMora);
  const maxNetDeficit = Math.max(0, maxNeededMora - bagMora - projectedPassiveMora);

  const funcRuns = funcNetDeficit > 0 ? Math.ceil(funcNetDeficit / 60_000) : 0;
  const maxRuns = maxNetDeficit > 0 ? Math.ceil(maxNetDeficit / 60_000) : 0;
  const funcResin = funcRuns * 20;
  const maxResin = maxRuns * 20;
  const funcDays = funcResin > 0 ? Math.ceil(funcResin / 180) : 0;
  const maxDays = maxResin > 0 ? Math.ceil(maxResin / 180) : 0;

  const startMs = Math.max(nowMs, cal.nextPhaseStartMs - maxDays * 86400_000);
  const startLocal = new Date(startMs + cal.server.offsetHours * 3600_000);
  const startDateShort = `${MONTH_SHORT[startLocal.getUTCMonth()]} ${startLocal.getUTCDate()}`;

  let statusTone = 'mint';
  let badgeText = '0 Ley Lines Needed';
  let recommendation = `Daily Mora + ${hasBp ? 'Gnostic Hymn' : 'Free BP'} (~+${compactMoraText(projectedPassiveMora)} by ${cal.nextPhaseDateShort}) covers all queued upgrades.`;

  if (maxNetDeficit > 0 && funcNetDeficit <= 0) {
    statusTone = 'gold';
    badgeText = `Start ~${startDateShort} (Tue/Fri)`;
    recommendation = `Lv.80 Ready covered! ~${compactMoraText(maxNetDeficit)} short for Lv.90 & Crowns after ~+${compactMoraText(projectedPassiveMora)} daily/BP Mora (~${maxDays}d / ${maxResin.toLocaleString()} Resin — run Blossom of Wealth on Tue/Fri or wait for Ley Line Overflow).`;
  } else if (funcNetDeficit > 0) {
    const isUrgent = maxDays >= Math.max(1, Math.floor(cal.daysToNextPhase) - 4);
    statusTone = isUrgent ? 'coral' : 'gold';
    badgeText = startMs <= nowMs + 86400_000 ? 'Farm Tue/Fri Now' : `Start by ${startDateShort}`;
    recommendation = `Short ~${compactMoraText(funcNetDeficit)} Mora for Lv.80 Ready (~${compactMoraText(maxNetDeficit)} for Lv.90/Crowns) after ~+${compactMoraText(projectedPassiveMora)} daily/BP Mora — plan ~${maxDays}d (${maxResin.toLocaleString()} Resin) of Blossom of Wealth starting ${startDateShort} on Tue/Fri.`;
  }

  return {
    bagMora,
    funcNeededMora,
    maxNeededMora,
    projectedPassiveMora,
    funcNetDeficit,
    maxNetDeficit,
    funcResin,
    maxResin,
    funcDays,
    maxDays,
    startDateShort,
    statusTone,
    badgeText,
    recommendation
  };
}
