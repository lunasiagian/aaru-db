import { getCatalog, getCharacterMeta, getMaterialMeta, getWeaponMeta } from './catalog.js?v=20261113j';

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

  const dayMs = 86400_000;
  const elapsedInDay = ((inGameMs % dayMs) + dayMs) % dayMs;
  const msUntilReset = dayMs - elapsedInDay;
  const totalMinutes = Math.floor(msUntilReset / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return {
    server,
    inGameDay,
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

/**
 * Waterfall allocation across the ranked prefarmQueue (#1.1 -> #1.2 -> #2.1 ...).
 * Higher-priority targets consume shared resources (Mora, Hero's Wit, Crowns, Books, Weapon mats)
 * first, and only the remaining surplus flows down to lower-priority targets.
 */
export function calculateWaterfallPrefarm(prefarmQueue = [], inventory = {}, wallet = null) {
  const sorted = sortAndLabelPrefarmQueue(prefarmQueue);
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

    const surplus2 = Math.max(0, o2 - n2);
    const craft3 = Math.floor(surplus2 / 3);
    const netDef2 = Math.max(0, n2 - o2);

    const eff3 = o3 + craft3;
    const surplus3 = Math.max(0, eff3 - n3);
    const craft4 = Math.floor(surplus3 / 3);
    const netDef3 = Math.max(0, n3 - eff3);

    const eff4 = o4 + craft4;
    const surplus4 = Math.max(0, eff4 - n4);
    const netDef4 = Math.max(0, n4 - eff4);

    const deficit = netDef2 + netDef3 + netDef4;
    const goldEquivDeficit = netDef4 + netDef3 / 3 + netDef2 / 9;
    const surplus = deficit === 0 ? surplus4 : 0;

    const domInfo = getDomainInfoForReward(series.keys.T4, todayName);
    const needEquivByRank = new Map();
    let totalNeedEquiv = 0;
    for (const [rank, t] of series.byRank.entries()) {
      const eq = t.T4 + t.T3 / 3 + t.T2 / 9;
      needEquivByRank.set(rank, eq);
      totalNeedEquiv += eq;
    }

    let farmingCost = null;
    if (deficit > 0) {
      const runs = Math.max(1, Math.ceil(goldEquivDeficit / 2.2));
      const resin = runs * 20;
      farmingCost = { runs, resin, text: `~${runs} Runs · ${resin.toLocaleString()} Resin` };
    }

    results.push({
      key: series.keys.T4,
      name: `${series.base} Series`,
      kind: 'talentSeries',
      rarity: 4,
      owned: eff4,
      neededTotal: n4 + n3 + n2,
      deficit,
      surplus,
      tiers: [
        { label: 'T2', key: series.keys.T2, owned: o2, needed: n2, netDeficit: netDef2 },
        { label: 'T3', key: series.keys.T3, owned: eff3, rawOwned: o3, craftedIn: craft3, needed: n3, netDeficit: netDef3 },
        { label: 'T4', key: series.keys.T4, owned: eff4, rawOwned: o4, craftedIn: craft4, needed: n4, netDeficit: netDef4 }
      ],
      sourceLabel: domInfo.domainName || 'Talent Domain',
      scheduleDays: domInfo.days,
      isToday: domInfo.isToday,
      farmingCost,
      urgency: domInfo.isToday ? 2 : 3,
      alloc: buildAlloc(needEquivByRank, totalNeedEquiv, goldEquivDeficit)
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
