import { getCharacterMeta } from './catalog.js?v=20261113aa';

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

const STAT_BOUNDS = {
  em: [200, 2000],
  maxHp: [15000, 80000],
  totalDef: [1200, 5500],
  totalAtk: [1200, 6500]
};

function parseFirstNumber(str) {
  const m = String(str || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : NaN;
}

function getTalentLevelForKind(kind, talentLevels) {
  if (kind === 'normal') return Math.max(1, Math.min(15, Number(talentLevels?.auto) || 9));
  if (kind === 'skill') return Math.max(1, Math.min(15, Number(talentLevels?.skill) || 9));
  return Math.max(1, Math.min(15, Number(talentLevels?.burst) || 9));
}

function addUniqueCap(caps, statKey, capValue, label) {
  const bounds = STAT_BOUNDS[statKey];
  if (!bounds || !Number.isFinite(capValue)) return;
  const rounded = Math.round(capValue);
  if (rounded < bounds[0] || rounded > bounds[1]) return;
  if (caps.some((c) => c.statKey === statKey && Math.abs(c.capValue - rounded) < 50)) return;
  caps.push({ statKey, capValue: rounded, label });
}

export function extractStatCaps(kitData, talentLevels = null) {
  const caps = [];
  const talents = kitData?.talents || [];
  const passives = kitData?.passives || [];
  const fullText = [
    ...talents.map((t) => `${t.name} ${t.description}`),
    ...passives.map((p) => `${p.name} ${p.description}`)
  ].join('\n');

  // 1. Explicit threshold mentions (e.g. "1,000 Elemental Mastery", "40,000 Max HP")
  const explicitPatterns = [
    { re: /([\d,]+)\s+Elemental Mastery/gi, statKey: 'em', prefix: 'Passive EM Cap' },
    { re: /([\d,]+)\s+Max HP/gi, statKey: 'maxHp', prefix: 'Passive HP Cap' },
    { re: /([\d,]+)\s+DEF\b/gi, statKey: 'totalDef', prefix: 'Passive DEF Cap' },
    { re: /([\d,]+)\s+ATK\b/gi, statKey: 'totalAtk', prefix: 'Passive ATK Cap' }
  ];
  for (const { re, statKey, prefix } of explicitPatterns) {
    let m;
    while ((m = re.exec(fullText)) !== null) {
      const val = Number(m[1].replace(/,/g, ''));
      addUniqueCap(caps, statKey, val, `${prefix} (${val.toLocaleString()})`);
    }
  }

  // 2. Multiplier-table ratio caps (e.g. "Max ATK Bonus" 400 / "ATK Bonus Ratio" 10% -> 4,000 ATK)
  for (const t of talents) {
    const mult = t.multipliers || {};
    const lvIdx = getTalentLevelForKind(t.kind, talentLevels) - 1;
    const entries = Object.entries(mult);
    const kindLabel = t.kind === 'normal' ? 'NA' : t.kind === 'skill' ? 'Skill' : 'Burst';

    for (const [statWord, statKey] of [
      ['ATK', 'totalAtk'],
      ['HP', 'maxHp'],
      ['DEF', 'totalDef'],
      ['EM', 'em']
    ]) {
      const maxEntry = entries.find(([lbl]) => new RegExp(`max\\s+${statWord}\\s+bonus`, 'i').test(lbl));
      const ratioEntry = entries.find(([lbl]) => new RegExp(`${statWord}\\s+bonus\\s+ratio`, 'i').test(lbl));
      if (maxEntry && ratioEntry) {
        const maxVal = parseFirstNumber(maxEntry[1]?.[lvIdx] ?? maxEntry[1]?.[0]);
        const ratioPct = parseFirstNumber(ratioEntry[1]?.[lvIdx] ?? ratioEntry[1]?.[0]);
        if (maxVal > 0 && ratioPct > 0) {
          const derived = maxVal / (ratioPct / 100);
          addUniqueCap(caps, statKey, derived, `${kindLabel} ${statWord} Cap (${Math.round(derived).toLocaleString()})`);
        }
      }
    }
  }

  // 3. Passive scaling ratio caps (e.g. "Every point of ATK ... by 0.7%. The maximum increase ... is 14%")
  for (const p of passives) {
    const desc = p.description || '';
    const m = desc.match(
      /every\s+(?:([\d,]+)\s+points?\s+of\s+|point\s+of\s+)(ATK|Max HP|HP|DEF|Elemental Mastery)[\s\S]{0,140}?by\s+([\d.]+)%[\s\S]{0,160}?max(?:imum)?(?:\s+increase)?[^.\d]*([\d.]+)%/i
    );
    if (m) {
      const unitStep = m[1] ? Number(m[1].replace(/,/g, '')) : 1;
      const statWord = m[2].toUpperCase();
      const perStep = Number(m[3]);
      const maxPct = Number(m[4]);
      if (perStep > 0 && maxPct > 0) {
        let derived = (maxPct / perStep) * unitStep;
        const statKey =
          statWord.includes('HP')
            ? 'maxHp'
            : statWord.includes('DEF')
              ? 'totalDef'
              : statWord.includes('MASTERY')
                ? 'em'
                : 'totalAtk';
        // Handle datamine phrasing like "every point of ATK ... 0.7% ... max 14%" (actually per 100 ATK)
        if (unitStep === 1 && statKey !== 'em' && derived < 500) derived *= 100;
        addUniqueCap(caps, statKey, derived, `${p.slot} Scaling Cap (${Math.round(derived).toLocaleString()})`);
      }
    }
  }

  return caps;
}

/**
 * Deterministically classify a character's combat role and Normal Attack / infusion relevance.
 */
export function classifyCharacterRole(charKey, kitData) {
  const talents = kitData?.talents || [];
  const passives = kitData?.passives || [];
  const nonNormalText = talents
    .filter((t) => t.kind !== 'normal')
    .map((t) => `${t.name} ${t.description}`)
    .concat(passives.map((p) => `${p.name} ${p.description}`))
    .join('\n');
  const labelText = talents.flatMap((t) => t.labels || []).join(' ');

  const usesNormalAttack =
    /infused\s+with|cannot\s+be\s+overridden|converted\s+to\s+.*dmg|normal\s+attack\s+dmg\s+bonus|special\s+normal\s+attack|normal,\s*charged,\s*and\s*plunging/i.test(
      nonNormalText
    );
  const hasHeal = /heal|regeneration|restores?\s+(?:party\s+members'?\s+)?hp/i.test(`${labelText}\n${nonNormalText}`);
  const hasShield = /shield\s+dmg\s+absorption|creates?\s+a\s+shield|generates?\s+a\s+shield/i.test(`${labelText}\n${nonNormalText}`);
  const hasBuff =
    /all\s+(?:nearby\s+)?party\s+members|all\s+characters\s+in\s+the\s+party|increases?\s+(?:all\s+)?(?:nearby\s+)?party\s+members|res\s+is\s+decreased|decreases?\s+.*res/i.test(
      nonNormalText
    );
  const hasOffField =
    /off-field|even\s+when\s+not\s+on\s+the\s+field|coordinated\s+attack|continues?\s+to\s+attack|takes?\s+effect.*off-field/i.test(
      nonNormalText
    );

  let primaryRole = 'DPS';
  if (usesNormalAttack && !hasHeal) primaryRole = 'On-Field DPS';
  else if (hasHeal && hasBuff) primaryRole = 'Support / Healer';
  else if (hasHeal) primaryRole = 'Healer';
  else if (hasShield && hasOffField) primaryRole = 'Off-Field Shielder';
  else if (hasShield) primaryRole = 'Shielder';
  else if (hasOffField && hasBuff) primaryRole = 'Sub-DPS / Buffer';
  else if (hasOffField) primaryRole = 'Sub-DPS';
  else if (hasBuff) primaryRole = 'Support';

  const tags = [];
  if (usesNormalAttack) tags.push('Infusion · Normal Atk');
  if (hasOffField) tags.push('Off-Field');
  if (hasBuff) tags.push('Team Buffer');
  if (hasShield) tags.push('Shielder');
  if (hasHeal) tags.push('Healer');

  return {
    charKey,
    primaryRole,
    tags: tags.slice(0, 3),
    usesNormalAttack
  };
}

/**
 * Deterministically inspect hydrated talents & passives to classify kit scaling,
 * non-crit mechanics, useful substats, role, and passive stat caps.
 */
export function analyzeCharacterKit(charKey, kitData, talentLevels = null) {
  const talents = kitData?.talents || [];
  const passives = kitData?.passives || [];

  const passiveText = passives.map((p) => `${p.name} ${p.description}`).join('\n');
  const talentText = talents
    .map((t) => `${t.name} ${t.description} ${(t.labels || []).join(' ')}`)
    .join('\n');
  const fullText = `${talentText}\n${passiveText}`;

  const isNonCrit =
    /-\s*100%\s*crit\s*rate|crit\s*rate\s*(is\s*)?(decreased|reduced)\s*by\s*100%|cannot\s+deal\s+crit/i.test(
      passiveText
    );

  const labelText = talents.flatMap((t) => t.labels || []).join(' ');
  const hpHits = (fullText.match(/\bmax\s*hp\b/gi) || []).length + (labelText.match(/\bhp\b/gi) || []).length;
  const defHits = (fullText.match(/\bdef\b/gi) || []).length;
  const emHits = (fullText.match(/\belemental\s+mastery\b/gi) || []).length;

  let primaryScaling = 'ATK';
  let usefulSubstats = ['atk_', 'critRate_', 'critDMG_', 'enerRech_'];

  if (isNonCrit) {
    primaryScaling = hpHits >= 2 ? 'HP (Non-Crit)' : 'ATK (Non-Crit)';
    usefulSubstats = hpHits >= 2 ? ['hp_', 'enerRech_', 'hp', 'eleMas'] : ['atk_', 'enerRech_', 'atk', 'eleMas'];
  } else if (defHits >= 3 && defHits >= hpHits) {
    primaryScaling = 'DEF';
    usefulSubstats = ['def_', 'critRate_', 'critDMG_', 'enerRech_'];
  } else if (hpHits >= 3) {
    primaryScaling = 'HP';
    usefulSubstats = ['hp_', 'critRate_', 'critDMG_', 'enerRech_'];
  } else if (emHits >= 3 && !/normal attack dmg/i.test(labelText)) {
    primaryScaling = 'EM';
    usefulSubstats = ['eleMas', 'enerRech_', 'critRate_', 'critDMG_'];
  } else if (emHits >= 2) {
    usefulSubstats = ['atk_', 'eleMas', 'critRate_', 'critDMG_', 'enerRech_'];
  }

  const statCaps = extractStatCaps(kitData, talentLevels);
  const roleInfo = classifyCharacterRole(charKey, kitData);

  return {
    charKey,
    isNonCrit,
    primaryScaling,
    usefulSubstats,
    statCaps,
    roleInfo,
    burstCost: Number(kitData?.burstCost) || 60
  };
}

function pickCharBaseStats(char, kitData) {
  const lv = Number(char?.level) || 90;
  const bs = kitData?.baseStats;
  if (!bs) {
    const scale = lv <= 80 ? 0.89 : lv >= 95 ? 1.07 : 1;
    return { hp: Math.round(12200 * scale), atk: Math.round(280 * scale), def: Math.round(730 * scale) };
  }
  if (lv <= 80 && bs.lv80) return bs.lv80;
  if (lv >= 95 && bs.lv95) return bs.lv95;
  return bs.lv90 || bs.lv80;
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

/**
 * Computes exact total character combat stats and artifact Roll Value (RV%).
 */
export function computeCharacterCombatStats(char, weapon, artifacts = [], kitData = null, weaponStats = null) {
  const kitAnalysis = analyzeCharacterKit(char?.key, kitData, char?.talent);
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
  let totalRolls = 0;
  const usefulSet = new Set(kitAnalysis.usefulSubstats);

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
        if (usefulSet.has(s.key)) usefulRolls += rolls;
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

  const roundedUseful = Math.round(usefulRolls * 10) / 10;
  const rvPct = Math.min(100, Math.round((usefulRolls / 38) * 100));

  return {
    maxHp,
    totalAtk,
    totalDef,
    em: Math.round(flat.eleMas),
    critRate: Math.round(critRate * 10) / 10,
    critDmg: Math.round(critDmg * 10) / 10,
    er: Math.round(er * 10) / 10,
    dmgBonus: Math.round(topDmgVal * 10) / 10,
    dmgBonusKey: topDmgKey,
    healingBonus: Math.round((healingBonus + (kitAnalysis.isNonCrit ? 25 : 0)) * 10) / 10,
    subCv: Math.round(subCv * 10) / 10,
    usefulRolls: roundedUseful,
    totalRolls: Math.round(totalRolls * 10) / 10,
    rvPct,
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
export function evaluateErComfort(char, combatStats, teams = [], weapons = [], kitData = null) {
  const burstCost = Number(kitData?.burstCost) || 60;
  const baseReq = BURST_COST_ER_BASE[burstCost] || Math.round(95 + burstCost * 0.9);
  const currentEr = Math.round(combatStats?.er || 100);
  const charElem = char?.meta?.element || '';

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
    const reduction = (hasSameElemBattery ? 20 : 0) + batteryWeapons * 12;
    const reqEr = Math.max(100, baseReq - reduction);
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
  if (teamVerdicts.length) {
    const best = [...teamVerdicts].sort((a, b) => b.delta - a.delta)[0];
    const reasons = [];
    if (best.hasSameElemBattery) reasons.push(`Double ${charElem}`);
    if (best.batteryWeapons > 0) reasons.push(`${best.batteryWeapons}× Energy Weapon`);
    const via = reasons.length ? ` via ${reasons.join(' + ')}` : '';
    if (best.delta >= 0 && hasEndgameFlag && soloDelta < 0) {
      summary = `${currentEr}% ER — Covered in ${best.teamName}${via}, but ${soloDelta}% short for solo Stygian / Theatre.`;
    } else if (best.delta >= 0) {
      summary = `${currentEr}% ER — Comfortable in ${best.teamName}${via} (Req ~${best.reqEr}%).`;
    } else {
      summary = `${currentEr}% ER — ${Math.abs(best.delta)}% short even in ${best.teamName}${via} (Req ~${best.reqEr}%).`;
    }
  } else {
    const delta = currentEr - baseReq;
    summary =
      delta >= 0
        ? `${currentEr}% ER — Meets solo baseline (~${baseReq}% for ${burstCost}-cost Burst).`
        : `${currentEr}% ER — ${Math.abs(delta)}% below solo baseline (~${baseReq}% for ${burstCost}-cost Burst).`;
  }

  return {
    burstCost,
    currentEr,
    baseReq,
    soloEndgameReq,
    soloDelta,
    hasEndgameFlag,
    teamVerdicts,
    summary
  };
}
