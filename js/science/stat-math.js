import { getCharacterMeta, getKqmEntry } from '../catalog.js?v=20261115ag';
import {
  analyzeCharacterKit,
  classifyBurstCadence,
  computeEffectiveTalents,
  getTalentPriorityInfo,
  parseFirstNumber,
  stripMarkup
} from './kit-taxonomy.js';

const AVG_ROLL_VALUE = {
  hp: 254,
  hp_: 4.96,
  atk: 16.5,
  atk_: 4.96,
  def: 19.7,
  def_: 6.2,
  eleMas: 19.8,
  enerRech_: 5.5,
  critRate_: 3.3,
  critDMG_: 6.6
};

const MAIN_STAT_MAX_5 = {
  hp: 4780,
  atk: 311,
  hp_: 46.6,
  atk_: 46.6,
  def_: 58.3,
  eleMas: 186.5,
  enerRech_: 51.8,
  critRate_: 31.1,
  critDMG_: 62.2,
  heal_: 35.9,
  physical_dmg_: 58.3,
  pyro_dmg_: 46.6,
  hydro_dmg_: 46.6,
  anemo_dmg_: 46.6,
  electro_dmg_: 46.6,
  dendro_dmg_: 46.6,
  cryo_dmg_: 46.6,
  geo_dmg_: 46.6
};

const MAIN_STAT_BASE_5 = {
  hp: 717,
  atk: 47,
  hp_: 7.0,
  atk_: 7.0,
  def_: 8.7,
  eleMas: 28.0,
  enerRech_: 7.8,
  critRate_: 4.7,
  critDMG_: 9.3,
  heal_: 5.4,
  physical_dmg_: 8.7,
  pyro_dmg_: 7.0,
  hydro_dmg_: 7.0,
  anemo_dmg_: 7.0,
  electro_dmg_: 7.0,
  dendro_dmg_: 7.0,
  cryo_dmg_: 7.0,
  geo_dmg_: 7.0
};

export function getArtifactMainStatValue(mainStatKey, level = 20, rarity = 5) {
  const max5 = MAIN_STAT_MAX_5[mainStatKey] || 0;
  const base5 = MAIN_STAT_BASE_5[mainStatKey] || 0;
  if (!max5) return 0;
  const rarScale = rarity >= 5 ? 1 : rarity === 4 ? 0.78 : 0.6;
  const maxLv = rarity >= 5 ? 20 : rarity === 4 ? 16 : 12;
  const t = Math.min(1, Math.max(0, (Number(level) || 0) / maxLv));
  return (base5 + (max5 - base5) * t) * rarScale;
}


function pickCharBaseStats(char, kitData) {
  const lv = Number(char?.level) || 90;
  const asc = Number(char?.ascension) || 0;
  const bs = kitData?.baseStats;
  const valid = (s) => s && Number(s.hp) >= 4000 && Number(s.atk) >= 100 && Number(s.def) >= 300;
  if (!bs || (!valid(bs.lv90) && !valid(bs.lv80))) {
    const scale = lv <= 80 ? 0.89 : lv >= 95 ? 1.07 : 1;
    return { hp: Math.round(12200 * scale), atk: Math.round(280 * scale), def: Math.round(730 * scale) };
  }
  const s80 = asc >= 6 && valid(bs.lv80A6) ? bs.lv80A6 : valid(bs.lv80) ? bs.lv80 : bs.lv90;
  const s90 = valid(bs.lv90) ? bs.lv90 : bs.lv80;
  if (lv <= 80) return s80;
  if (lv >= 95 && valid(bs.lv95)) return bs.lv95;
  if (lv < 90) {
    const t = (lv - 80) / 10;
    return {
      hp: Math.round(s80.hp + (s90.hp - s80.hp) * t),
      atk: Math.round(s80.atk + (s90.atk - s80.atk) * t),
      def: Math.round(s80.def + (s90.def - s80.def) * t)
    };
  }
  return s90;
}

function pickWeaponStats(weapon, weaponStats) {
  if (!weapon) return { atk: 0, subKey: '', subVal: 0 };
  const lv = Number(weapon.level) || 90;
  if (!weaponStats) {
    return { atk: lv >= 90 ? 542 : 475, subKey: '', subVal: 0 };
  }
  if (lv <= 80 && weaponStats.lv80) return weaponStats.lv80;
  return weaponStats.lv90 || weaponStats.lv80;
}


const CRIT_SET_BONUSES = {
  MarechausseeHunter: 36,
  ObsidianCodex: 40,
  BlizzardStrayer: 20
};

/**
 * Computes deterministic substat roll weights (1.0 primary, 0.5 secondary, 0.25 flat ATK, 0.0 dead)
 * across all 10 artifact substat keys.
 */
export function computeSubstatWeights(kitAnalysis, weaponKey = '', artifacts = [], burstCadence = null) {
  const weights = {
    hp: 0.0,
    hp_: 0.0,
    atk: 0.0,
    atk_: 0.0,
    def: 0.0,
    def_: 0.0,
    eleMas: 0.0,
    enerRech_: 0.0,
    critRate_: 0.0,
    critDMG_: 0.0
  };

  const setCounts = {};
  for (const a of artifacts || []) {
    if (a?.setKey) setCounts[a.setKey] = (setCounts[a.setKey] || 0) + 1;
  }
  const hasEmblem4pc = (setCounts.EmblemOfSeveredFate || 0) >= 4;

  const isNonCrit = Boolean(kitAnalysis?.isNonCrit);
  const role = kitAnalysis?.roleInfo?.fieldRole || kitAnalysis?.roleInfo?.primaryRole || 'Quickswap Support';
  const tags = kitAnalysis?.roleInfo?.functionTags || kitAnalysis?.roleInfo?.utilityTags || [];
  const isPureSupport = role === 'Quickswap Support' && !tags.some((t) => /Sub-DPS|Carry|Driver/i.test(t));
  const isFavonius = /favonius/i.test(String(weaponKey || ''));
  const primary = String(kitAnalysis?.primaryScaling || 'ATK');
  const usefulSet = new Set(kitAnalysis?.usefulSubstats || []);

  if (primary.startsWith('HP')) {
    weights.hp_ = 1.0;
    weights.hp = 0.5;
  } else if (primary.startsWith('DEF')) {
    weights.def_ = 1.0;
    weights.def = 0.5;
  } else if (primary.startsWith('EM')) {
    weights.eleMas = 1.0;
  } else {
    weights.atk_ = isPureSupport ? 0.5 : 1.0;
    if (!isPureSupport) weights.atk = 0.25;
  }

  if (usefulSet.has('eleMas') && weights.eleMas < 1.0) weights.eleMas = 0.5;
  if (usefulSet.has('atk_') && weights.atk_ < 1.0) weights.atk_ = 0.5;

  if (!isNonCrit) {
    if (!isPureSupport) {
      weights.critRate_ = 1.0;
      weights.critDMG_ = 1.0;
    } else if (isFavonius) {
      weights.critRate_ = 0.5;
    }
  }

  const burstCost = Number(kitAnalysis?.burstCost) || 60;
  if (burstCadence?.burstDependency === 'optional' && !hasEmblem4pc) {
    weights.enerRech_ = 0.5;
  } else if (burstCost >= 70 || role === 'Off-Field Sub-DPS' || role === 'Quickswap Support' || hasEmblem4pc) {
    weights.enerRech_ = 1.0;
  } else {
    weights.enerRech_ = 0.5;
  }

  return weights;
}

/**
 * Evaluates build diagnostics such as 4pc CRIT Rate over-cap.
 */
export function evaluateBuildDiagnostics(combatStats, artifacts = [], kitAnalysis = null) {
  const diagnostics = [];
  if (kitAnalysis?.isNonCrit) return diagnostics;

  const setCounts = {};
  for (const a of artifacts || []) {
    if (a?.setKey) setCounts[a.setKey] = (setCounts[a.setKey] || 0) + 1;
  }

  let setCritBonus = 0;
  let setLabel = '';
  for (const [setKey, bonus] of Object.entries(CRIT_SET_BONUSES)) {
    if ((setCounts[setKey] || 0) >= 4) {
      setCritBonus += bonus;
      setLabel = setKey.replace(/([a-z])([A-Z])/g, '$1 $2');
    }
  }

  const sheetCr = Number(combatStats?.critRate) || 0;
  const effectiveCr = Math.round((sheetCr + setCritBonus) * 10) / 10;
  if (effectiveCr > 100) {
    const overBy = Math.round((effectiveCr - 100) * 10) / 10;
    diagnostics.push({
      id: 'crit-overcap',
      tone: overBy >= 8 ? 'coral' : 'amber',
      effectiveCr,
      setCritBonus,
      overBy,
      message: `CRIT Rate over-cap: ${effectiveCr.toFixed(1)}% effective (${sheetCr.toFixed(1)}% sheet${
        setCritBonus ? ` + ${setCritBonus}% 4pc ${setLabel}` : ''
      } — ${overBy.toFixed(1)}% wasted).`
    });
  }

  return diagnostics;
}

/**
 * Computes exact total character combat stats and Weighted Roll Value (wRV%).
 */
export function computeCharacterCombatStats(char, weapon, artifacts = [], kitData = null, weaponStats = null) {
  const effectiveTalents = computeEffectiveTalents(char, kitData);
  const kitAnalysis = analyzeCharacterKit(char?.key, kitData, effectiveTalents.effective, char?.constellation || 0);
  const burstCadence = classifyBurstCadence(char, kitData, kitAnalysis, artifacts);
  const substatWeights = computeSubstatWeights(kitAnalysis, weapon?.key || '', artifacts, burstCadence);
  const charBase = pickCharBaseStats(char, kitData);
  const wepBase = pickWeaponStats(weapon, weaponStats);

  const baseHp = charBase.hp;
  const baseAtk = charBase.atk + wepBase.atk;
  const baseDef = charBase.def;

  const pct = { hp_: 0, atk_: 0, def_: 0 };
  const flat = { hp: 0, atk: 0, def: 0, eleMas: 0 };
  let critRate = kitAnalysis.isNonCrit ? 5 - 100 : 5;
  let critDmg = 50;
  let er = 100;
  let healingBonus = 0;
  const dmgBonuses = {};

  const applyStat = (key, val) => {
    if (!key || !Number.isFinite(val)) return;
    if (key === 'hp_' || key === 'atk_' || key === 'def_') pct[key] += val;
    else if (key === 'hp' || key === 'atk' || key === 'def' || key === 'eleMas') flat[key] += val;
    else if (key === 'critRate_') critRate += val;
    else if (key === 'critDMG_') critDmg += val;
    else if (key === 'enerRech_') er += val;
    else if (key === 'heal_') healingBonus += val;
    else if (key.endsWith('_dmg_')) dmgBonuses[key] = (dmgBonuses[key] || 0) + val;
  };

  if (kitData?.ascensionStat) {
    applyStat(kitData.ascensionStat.key, Number(kitData.ascensionStat.value) || 0);
  }
  if (wepBase.subKey) {
    applyStat(wepBase.subKey, Number(wepBase.subVal) || 0);
  }

  let subCv = 0;
  let usefulRolls = 0;
  let primaryRolls = 0;
  let secondaryRolls = 0;
  let weightedRollsSum = 0;
  let totalRolls = 0;

  for (const a of artifacts) {
    applyStat(a.mainStatKey, getArtifactMainStatValue(a.mainStatKey, a.level, a.rarity));
    for (const s of a.substats || []) {
      const val = Number(s.value) || 0;
      applyStat(s.key, val);
      if (s.key === 'critRate_') subCv += val * 2;
      if (s.key === 'critDMG_') subCv += val;
      const avgRoll = AVG_ROLL_VALUE[s.key];
      if (avgRoll && val > 0) {
        const rolls = val / avgRoll;
        totalRolls += rolls;
        const w = substatWeights[s.key] ?? 0;
        weightedRollsSum += rolls * w;
        if (w >= 1.0) {
          usefulRolls += rolls;
          primaryRolls += rolls;
        } else if (w > 0) {
          secondaryRolls += rolls;
        }
      }
    }
  }

  const maxHp = Math.round(baseHp * (1 + pct.hp_ / 100) + flat.hp);
  const totalAtk = Math.round(baseAtk * (1 + pct.atk_ / 100) + flat.atk);
  const totalDef = Math.round(baseDef * (1 + pct.def_ / 100) + flat.def);

  let topDmgKey = '';
  let topDmgVal = 0;
  for (const [k, v] of Object.entries(dmgBonuses)) {
    if (v > topDmgVal) {
      topDmgKey = k;
      topDmgVal = v;
    }
  }

  const wRvBenchmark = 32;
  const weightedRolls = Math.round(weightedRollsSum * 10) / 10;
  const wrvPct = Math.min(100, Math.round((weightedRollsSum / wRvBenchmark) * 100));
  const wrvGrade =
    !artifacts || artifacts.length === 0
      ? 'UNGEAR'
      : wrvPct >= 85
        ? 'S+'
        : wrvPct >= 70
          ? 'S'
          : wrvPct >= 55
            ? 'A'
            : wrvPct >= 40
              ? 'B'
              : 'C';

  const roundedCritRate = Math.round(critRate * 10) / 10;
  const roundedCritDmg = Math.round(critDmg * 10) / 10;
  const roundedEr = Math.round(er * 10) / 10;
  const diagnostics = evaluateBuildDiagnostics(
    { critRate: roundedCritRate, critDmg: roundedCritDmg, er: roundedEr },
    artifacts,
    kitAnalysis
  );

  return {
    maxHp,
    totalAtk,
    totalDef,
    em: Math.round(flat.eleMas),
    critRate: roundedCritRate,
    critDmg: roundedCritDmg,
    er: roundedEr,
    dmgBonus: Math.round(topDmgVal * 10) / 10,
    dmgBonusKey: topDmgKey,
    healingBonus: Math.round((healingBonus + (kitAnalysis.isNonCrit ? 25 : 0)) * 10) / 10,
    subCv: Math.round(subCv * 10) / 10,
    usefulRolls: Math.round(usefulRolls * 10) / 10,
    primaryRolls: Math.round(primaryRolls * 10) / 10,
    secondaryRolls: Math.round(secondaryRolls * 10) / 10,
    weightedRolls,
    wRvBenchmark,
    wrvPct,
    rvPct: wrvPct,
    wrvGrade,
    substatWeights,
    burstCadence,
    diagnostics,
    totalRolls: Math.round(totalRolls * 10) / 10,
    kitAnalysis
  };
}

const BURST_COST_ER_BASE = {
  40: 100,
  60: 135,
  70: 150,
  80: 165,
  90: 185
};

const BATTERY_WEAPON_RE = /^(Favonius|Sacrificial|ElegyForTheEnd|XiphosMoonlight)/i;

/**
 * Evaluates team-context Energy Recharge comfort & endgame mode (Stygian Onslaught / IT) safety.
 */
export function evaluateErComfort(char, combatStats, teams = [], weapons = [], kitData = null, kitAnalysis = null, artifacts = []) {
  const kqm = getKqmEntry(char?.key);
  const dataSource = kqm ? 'KQM_TCL' : 'KIT_PARSER';
  const burstCost = Number(kitData?.burstCost) || 60;
  const parserBaseReq = BURST_COST_ER_BASE[burstCost] || Math.round(95 + burstCost * 0.9);
  const isOffFieldRole = kitAnalysis?.roleInfo?.primaryRole === 'Off-Field Sub-DPS';
  const parserRoleAdj = !kqm && isOffFieldRole ? 10 : 0;
  const baseReq = kqm?.erBaselines?.solo ?? parserBaseReq + parserRoleAdj;

  const cadence = classifyBurstCadence(char, kitData, kitAnalysis, artifacts);
  const currentEr = Math.round(combatStats?.er || 100);
  const charElem = char?.meta?.element || '';
  const burstTriggers = (kitAnalysis?.roleInfo?.kitTriggers || []).filter(
    (t) => t.requiresBurst && !/Self Energy/i.test(t.effect || '')
  );

  const weaponByHolder = new Map();
  for (const w of weapons || []) {
    if (w.location && !weaponByHolder.has(w.location)) weaponByHolder.set(w.location, w.key);
  }

  const matchingTeams = (teams || []).filter((t) =>
    (t.members || []).some((m) => m.characterKey === char?.key)
  );

  const teamVerdicts = matchingTeams.map((team) => {
    const others = (team.members || []).filter((m) => m.characterKey && m.characterKey !== char?.key);
    const hasSameElemBattery = others.some((m) => getCharacterMeta(m.characterKey)?.element === charElem);
    let batteryWeapons = 0;
    for (const m of others) {
      const wKey = m.weaponKey || weaponByHolder.get(m.characterKey) || '';
      if (BATTERY_WEAPON_RE.test(wKey)) batteryWeapons += 1;
    }
    let reqEr;
    if (kqm?.erBaselines) {
      if (hasSameElemBattery && kqm.erBaselines.doubleSameElement) {
        reqEr = Math.max(100, kqm.erBaselines.doubleSameElement - batteryWeapons * 10);
      } else if (batteryWeapons > 0 && kqm.erBaselines.favonius) {
        reqEr = Math.max(100, Math.min(baseReq - batteryWeapons * 12, kqm.erBaselines.favonius));
      } else {
        reqEr = Math.max(100, baseReq - (hasSameElemBattery ? 20 : 0) - batteryWeapons * 12);
      }
    } else {
      const reduction = (hasSameElemBattery ? 20 : 0) + batteryWeapons * 12;
      reqEr = Math.max(100, baseReq - reduction);
    }
    const delta = currentEr - reqEr;
    const status = delta >= 0 ? 'COMFORTABLE' : delta >= -12 ? 'BORDERLINE' : `SHORT (${delta}% ER)`;
    return {
      teamName: team.name || team.id,
      reqEr,
      delta,
      status,
      hasSameElemBattery,
      batteryWeapons
    };
  });

  const noteText = `${char?.swapTag || ''} ${char?.notes || ''}`;
  const hasEndgameFlag = /\b(stygian|onslaught|theatre|theater)\b/i.test(noteText);
  const soloEndgameReq = baseReq + 20;
  const soloDelta = currentEr - soloEndgameReq;

  let summary = '';
  let erStatus = 'ok';
  let erDelta = 0;
  if (cadence.burstDependency === 'optional') {
    erStatus = 'ok';
    erDelta = Math.max(0, currentEr - cadence.recommendedEr);
    summary =
      cadence.mode === 'shimenawa-cycle'
        ? `${currentEr}% ER — 4pc Shimenawa cycle; Burst optional (every ~2nd rotation).`
        : `${currentEr}% ER — Skill-Core kit (0-Energy immune; ~${baseReq}% ER only if Bursting every rotation).`;
  } else if (teamVerdicts.length) {
    const best = [...teamVerdicts].sort((a, b) => b.delta - a.delta)[0];
    erDelta = best.delta;
    const reasons = [];
    if (best.hasSameElemBattery) reasons.push(`Double ${charElem}`);
    if (best.batteryWeapons > 0) reasons.push(`${best.batteryWeapons}× Energy Weapon`);
    const via = reasons.length ? ` via ${reasons.join(' + ')}` : '';
    if (best.delta >= 0 && soloDelta < 0) {
      if (hasEndgameFlag) {
        erStatus = 'warn';
        summary = `${currentEr}% ER — Covered in ${best.teamName}${via}, but ${Math.abs(soloDelta)}% short for solo Stygian / Theatre (~${soloEndgameReq}%).`;
      } else {
        erStatus = 'ok';
        summary = `${currentEr}% ER — Covered in ${best.teamName}${via} (Req ~${best.reqEr}%; ${Math.abs(soloDelta)}% below solo Stygian / Theatre ~${soloEndgameReq}%).`;
      }
    } else if (best.delta >= 0) {
      erStatus = 'ok';
      summary = `${currentEr}% ER — Comfortable in ${best.teamName}${via} (Req ~${best.reqEr}%).`;
    } else {
      erStatus = best.delta >= -12 ? 'warn' : 'short';
      summary = `${currentEr}% ER — ${Math.abs(best.delta)}% short even in ${best.teamName}${via} (Req ~${best.reqEr}%).`;
    }
  } else {
    erDelta = currentEr - baseReq;
    erStatus = erDelta >= 0 ? 'ok' : erDelta >= -12 ? 'warn' : 'short';
    summary =
      erDelta >= 0
        ? `${currentEr}% ER — Meets solo baseline (~${baseReq}% for ${burstCost}-cost Burst).`
        : `${currentEr}% ER — ${Math.abs(erDelta)}% below solo baseline (~${baseReq}% for ${burstCost}-cost Burst).`;
  }

  let burstTriggerNote = '';
  if (burstTriggers.length) {
    const first = burstTriggers[0];
    burstTriggerNote = `Burst-Utility (${first.source}: ${first.effect}) requires ~${baseReq}% ER to Burst every rotation vs. 100% ER for Skill-Only.`;
  }

  return {
    burstCost,
    currentEr,
    baseReq,
    soloEndgameReq,
    soloDelta,
    hasEndgameFlag,
    teamVerdicts,
    burstTriggerNote,
    erStatus,
    erDelta,
    cadence,
    burstDependency: cadence.burstDependency,
    zeroEnergyImmune: cadence.zeroEnergyImmune,
    dataSource,
    particlesPerCast: kqm?.particlesPerCast ?? null,
    particleNote: kqm?.particleNote || '',
    summary
  };
}

const SUPPORT_SET_NOTES = {
  NoblesseOblige: '4pc Noblesse (+20% Team ATK)',
  TenacityOfTheMillelith: '4pc Tenacity (+20% Team ATK & Shield)',
  ScrollOfTheHeroOfCinderCity: '4pc Cinder City (+40% Elem DMG)',
  Instructor: '4pc Instructor (+120 Team EM)',
  DeepwoodMemories: '4pc Deepwood (-30% Dendro RES)',
  ViridescentVenerer: '4pc Viridescent (-40% Elem RES)'
};

function mapStatWordToCombatKey(statWord) {
  const up = String(statWord || '').toUpperCase();
  if (up.includes('HP')) return { statKey: 'maxHp', statLabel: 'HP' };
  if (up.includes('DEF')) return { statKey: 'totalDef', statLabel: 'DEF' };
  if (up.includes('MASTERY') || up === 'EM') return { statKey: 'em', statLabel: 'EM' };
  return { statKey: 'totalAtk', statLabel: 'ATK' };
}

/**
 * Evaluates buff stat ceilings, team-buffing weapons/sets, and energy cadence together.
 */
export function evaluateTeamCapabilities(
  char,
  kitData,
  combatStats,
  weaponData = null,
  artifacts = [],
  erDiag = null
) {
  const talents = kitData?.talents || [];
  const passives = kitData?.passives || [];
  const ownedCon = Number(char?.constellation) || 0;
  const activeCons = (kitData?.constellations || []).filter((c) => Number(c.level) <= ownedCon);

  const scanSources = [
    ...talents.filter((t) => t.kind !== 'normal').map((t) => ({ source: t.kind === 'skill' ? 'Skill' : 'Burst', text: stripMarkup(t.description) })),
    ...passives.map((p) => ({ source: p.slot || 'Passive', text: stripMarkup(p.description) })),
    ...activeCons.map((c) => ({ source: `C${c.level}`, text: stripMarkup(c.description) }))
  ];

  let buffCap = null;
  for (const { source, text } of scanSources) {
    // Pattern A: "(for) every X (points of) Stat ... by Y% ... up to Z%"
    let m = text.match(
      /(?:for\s+)?every\s+([\d,]+)\s+(?:points?\s+of\s+)?(Max\s+HP|HP|DEF|ATK|Elemental\s+Mastery|EM)[^.]{0,140}?by\s+([\d.]+)%[^.]{0,120}?(?:up\s+to|maximum(?:\s+increase)?(?:\s+of|\s+is)?)\s+([\d.]+)%/i
    );
    let unitStep = 0;
    let statWord = '';
    let perUnit = 0;
    let maxCap = 0;
    if (m) {
      unitStep = Number(m[1].replace(/,/g, ''));
      statWord = m[2];
      perUnit = Number(m[3]);
      maxCap = Number(m[4]);
    } else {
      // Pattern B: "increases ... by Y% for every X Stat, up to Z%"
      m = text.match(
        /increases?[^.]{0,90}?by\s+([\d.]+)%\s+for\s+every\s+([\d,]+)\s+(Max\s+HP|HP|DEF|ATK|Elemental\s+Mastery|EM)[^.]{0,120}?(?:up\s+to|maximum(?:\s+increase)?(?:\s+of|\s+is)?)\s+([\d.]+)%/i
      );
      if (m) {
        perUnit = Number(m[1]);
        unitStep = Number(m[2].replace(/,/g, ''));
        statWord = m[3];
        maxCap = Number(m[4]);
      }
    }
    if (unitStep > 0 && perUnit > 0 && maxCap > 0) {
      const requiredStat = Math.round((maxCap / perUnit) * unitStep);
      const { statKey, statLabel } = mapStatWordToCombatKey(statWord);
      const currentStat = Math.round(Number(combatStats?.[statKey]) || 0);
      const capPct = Math.min(100, Math.round((currentStat / requiredStat) * 100));
      const gap = Math.max(0, requiredStat - currentStat);
      buffCap = { source, statKey, statLabel, currentStat, requiredStat, capPct, gap };
      break;
    }
  }

  // Fallback to statCaps extracted from multiplier tables if no prose cap matched
  if (!buffCap && combatStats?.kitAnalysis?.statCaps?.length) {
    const first = combatStats.kitAnalysis.statCaps[0];
    const statLabel =
      first.statKey === 'maxHp' ? 'HP' : first.statKey === 'totalDef' ? 'DEF' : first.statKey === 'em' ? 'EM' : 'ATK';
    const currentStat = Math.round(Number(combatStats?.[first.statKey]) || 0);
    const requiredStat = Math.round(first.capValue);
    if (requiredStat > 0) {
      buffCap = {
        source: 'Kit',
        statKey: first.statKey,
        statLabel,
        currentStat,
        requiredStat,
        capPct: Math.min(100, Math.round((currentStat / requiredStat) * 100)),
        gap: Math.max(0, requiredStat - currentStat)
      };
    }
  }

  // Utility summary when no capped stat-scaling buff exists (exclude self-only traits)
  let utilitySummary = '';
  if (!buffCap) {
    const SELF_ONLY_TAGS = new Set(['Self-Sustain', 'selfIR', 'selfHeal']);
    const tags = (combatStats?.kitAnalysis?.roleInfo?.utilityTags || []).filter(
      (t) => !SELF_ONLY_TAGS.has(t)
    );
    if (tags.length) utilitySummary = tags.join(' · ');
  }

  // Team-buffing weapons & 4pc sets
  const supportGear = [];
  const wepKey = weaponData?.key || char?.equippedWeapon?.key || '';
  const wepRef = Math.max(1, Math.min(5, Number(char?.equippedWeapon?.refinement) || 1));
  if (/ThrillingTales/i.test(wepKey)) {
    const atkPct = [24, 30, 36, 42, 48][wepRef - 1] || 48;
    supportGear.push(`R${wepRef} Thrilling Tales (+${atkPct}% ATK swap)`);
  } else if (/Favonius/i.test(wepKey)) {
    const cr = Math.round(Number(combatStats?.critRate) || 0);
    supportGear.push(cr >= 45 ? `Favonius (${cr}% CR — Reliable procs)` : `Favonius (${cr}% CR — Needs ≥45% CR)`);
  } else if (/ElegyForTheEnd/i.test(wepKey)) {
    supportGear.push(`R${wepRef} Elegy (+${100 + (wepRef - 1) * 25} EM & +${20 + (wepRef - 1) * 5}% ATK)`);
  } else if (/FreedomSworn/i.test(wepKey)) {
    supportGear.push(`R${wepRef} Freedom-Sworn (+${16 + (wepRef - 1) * 4}% NA/CA & +${20 + (wepRef - 1) * 5}% ATK)`);
  } else if (/PrototypeAmber/i.test(wepKey)) {
    supportGear.push(`R${wepRef} Prototype Amber (Party Heal + Energy)`);
  }

  const setCounts = new Map();
  for (const a of artifacts || []) {
    if (!a?.setKey) continue;
    setCounts.set(a.setKey, (setCounts.get(a.setKey) || 0) + 1);
  }
  for (const [setKey, count] of setCounts.entries()) {
    if (count >= 4 && SUPPORT_SET_NOTES[setKey]) {
      supportGear.push(SUPPORT_SET_NOTES[setKey]);
    }
  }

  return {
    buffCap,
    utilitySummary,
    supportGear,
    erSummary: erDiag?.summary || ''
  };
}


/**
 * Synthesizes 4 concise deterministic kit insights from parsed talents, passives, constellations & ER diagnostics.
 */
export function generateKitInsights(char, kitData, weaponData, erDiag, kitAnalysis = null) {
  const analysis =
    kitAnalysis || analyzeCharacterKit(char?.key, kitData, char?.talent, char?.constellation || 0);
  const roleInfo = analysis.roleInfo || {
    fieldRole: 'Quickswap Support',
    primaryRole: 'Quickswap Support',
    functionTags: [],
    utilityTags: [],
    kitTriggers: []
  };
  const tags = roleInfo.utilityTags?.length ? ` · ${roleInfo.utilityTags.join(' · ')}` : '';
  const critNote = analysis.isNonCrit ? ' (Non-Crit scaling — Crit Rate/DMG bypassed)' : '';
  const weaponNote = weaponData?.name ? ` Paired with ${weaponData.name}.` : '';

  const kqm = getKqmEntry(char?.key);
  const priority = getTalentPriorityInfo(kitData, analysis);
  const priorityOrderText = kqm?.talentPriority || priority.orderText;

  // Passive & unlocked constellation highlights
  const ownedCon = Number(char?.constellation) || 0;
  const highlights = [];
  for (const trig of roleInfo.kitTriggers || []) {
    highlights.push(stripMarkup(`${trig.source}: ${trig.effect}`));
  }
  for (const cap of analysis.statCaps || []) {
    highlights.push(stripMarkup(`${cap.source}: ${cap.target} ${cap.stat}`));
  }
  for (const p of kitData?.passives || []) {
    if (p.slot !== 'A1' && p.slot !== 'A4' && p.slot !== 'Hexerei') continue;
    const pDesc = stripMarkup(p.description || '');
    const naCaMatch = pDesc.match(/Normal\s+and\s+Charged\s+Attack[^.]{0,60}by\s+(\d+%)/i);
    const atkSpdMatch = pDesc.match(/ATK\s+SPD[^.]{0,40}by\s+(\d+%)/i);
    if (naCaMatch && atkSpdMatch) {
      highlights.push(`${p.slot}: +${naCaMatch[1]} NA/CA DMG & +${atkSpdMatch[1]} ATK SPD`);
    } else if (naCaMatch) {
      highlights.push(`${p.slot}: +${naCaMatch[1]} NA/CA DMG`);
    } else if (/counterattack|max(?:imum)?\s+dmg\s+bonus/i.test(pDesc)) {
      highlights.push(`${p.slot}: Instant Max Counter`);
    } else {
      const dmgPctM = pDesc.match(/(?:Elemental\s+(?:Skill|Burst)|all\s+party\s+members'?)\s+(?:DMG|CRIT\s+Rate)[^.]{0,45}?by\s+([\d.]+%)/i);
      if (dmgPctM) highlights.push(`${p.slot}: +${dmgPctM[1]} Buff`);
    }
  }
  for (const c of kitData?.constellations || []) {
    if (Number(c.level) > ownedCon) continue;
    const desc = stripMarkup(c.description || '');
    const lvMatch = desc.match(/increases?\s+the\s+level\s+of\s+(.+?)\s+by\s+(\d+)/i);
    if (lvMatch) {
      highlights.push(`C${c.level}: +${lvMatch[2]} ${stripMarkup(lvMatch[1])}`);
    } else if (/res\s+is\s+decreased|decreases?\s+(?:opponents'?\s+)?[\w\s]*res/i.test(desc)) {
      highlights.push(`C${c.level}: RES Shred`);
    } else if (/creates?\s+a\s+shield|shield\s+that\s+absorbs/i.test(desc)) {
      highlights.push(`C${c.level}: Shield`);
    } else if (/restore|regenerates?\s+[\d.]+\s+energy/i.test(desc)) {
      highlights.push(`C${c.level}: Energy Refund`);
    } else if (/crit\s+(rate|dmg)/i.test(desc)) {
      highlights.push(`C${c.level}: Crit Boost`);
    } else if (/charges?\s+of|additional\s+charge/i.test(desc)) {
      highlights.push(`C${c.level}: Extra Skill Charge`);
    }
  }
  const uniqueHighlights = [...new Set(highlights.map(stripMarkup))].slice(0, 5);
  const highlightText = uniqueHighlights.length
    ? uniqueHighlights.join(' · ')
    : ownedCon === 0
      ? 'C0 baseline kit; check A1/A4 passives for rotation triggers.'
      : `C${ownedCon} unlocked; standard kit scaling active.`;

  const particleStr = erDiag?.particleNote ? ` (${erDiag.particleNote})` : '';
  const erText = erDiag?.summary
    ? `${erDiag.summary}${particleStr}${erDiag.burstTriggerNote ? ` ${erDiag.burstTriggerNote}` : ''}`
    : `${analysis.burstCost || 60}-cost Burst; sync artifacts to compute ER comfort.`;

  return [
    {
      label: 'CORE IDENTITY & UTILITY',
      tone: 'cyan',
      text: stripMarkup(`${roleInfo.primaryRole}${tags}. Scales off ${analysis.primaryScaling}${critNote}.${weaponNote}`)
    },
    {
      label: 'TALENT PRIORITY ORDER',
      tone: 'gold',
      text: stripMarkup(`${priorityOrderText}. ${priority.lowValueNote}`)
    },
    {
      label: `UNLOCKED PASSIVES & C${ownedCon}`,
      tone: 'mint',
      text: stripMarkup(highlightText)
    },
    {
      label: 'ER & TEAM COMFORT VERDICT',
      tone: erDiag?.soloDelta < 0 && erDiag?.hasEndgameFlag ? 'coral' : 'cyan',
      text: stripMarkup(erText)
    }
  ];
}
