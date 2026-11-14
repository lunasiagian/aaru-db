import { getCharacterMeta, getKqmEntry } from './catalog.js?v=20261114e';
import { calcTalentUpgradeCost } from './calculations.js?v=20261114e';

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

function stripMarkup(str) {
  return String(str || '')
    .replace(/<color=#[0-9A-Fa-f]+>/gi, '')
    .replace(/<\/color>/gi, '')
    .replace(/<\/?i>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/^#+/, '')
    .replace(/\s+#+/g, ' ')
    .trim();
}

/**
 * Deterministically classify a character's combat role, utility vector, and conditional kit triggers.
 */
export function classifyCharacterRole(charKey, kitData, constellation = 0) {
  const talents = kitData?.talents || [];
  const passives = kitData?.passives || [];
  const ownedCon = Number(constellation) || 0;
  const activeCons = (kitData?.constellations || []).filter((c) => Number(c.level) <= ownedCon);

  const burstName = stripMarkup(talents.find((t) => t.kind === 'burst')?.name || '');
  const normalText = talents
    .filter((t) => t.kind === 'normal')
    .map((t) => `${stripMarkup(t.name)} ${stripMarkup(t.description)}`)
    .join('\n');
  const nonNormalText = talents
    .filter((t) => t.kind !== 'normal')
    .map((t) => `${stripMarkup(t.name)} ${stripMarkup(t.description)}`)
    .concat(passives.map((p) => `${stripMarkup(p.name)} ${stripMarkup(p.description)}`))
    .concat(activeCons.map((c) => `${stripMarkup(c.name)} ${stripMarkup(c.description)}`))
    .join('\n');
  const labelText = talents.flatMap((t) => t.labels || []).join(' ');
  const sentences = nonNormalText.split(/(?<=[.!?\n])\s+|\n+/);

  const isCoordSentence = (s) =>
    /(?:when|after)\s+(?:your\s+active\s+character'?s?\s+)?(?:Normal|Charged|Plunging)\s+(?:and\s+(?:Charged|Plunging)\s+)?Attacks?\s+(?:hit|are\s+used|trigger)[^.]{0,80}(?:create|trigger|unleash|launch|coordinated)/i.test(
      s
    ) || /(?:active\s+character'?s?\s+)?(?:Normal|Charged)\s+Attacks?\s+will\s+trigger/i.test(s);

  const hasCoordinatedTrigger = sentences.some(isCoordSentence);
  const nonCoordText = sentences.filter((s) => !isCoordSentence(s)).join('\n');

  const hasStanceExitClause = /(?:cleared|ends?|removed?)\s+when[^.]{0,40}leaves\s+the\s+field/i.test(
    nonNormalText
  );

  const normalHasInfusion =
    /(?:Normal|Charged|Plunging)(?:,\s*(?:Charged|Plunging))*(?:\s+and\s+(?:Charged|Plunging))?\s+Attacks?[^.]{0,100}(?:converted|infused|cannot\s+be\s+overridden)/i.test(
      normalText
    ) ||
    (/bond\s+of\s+life/i.test(normalText) &&
      /masque\s+of\s+the\s+red\s+death|infused|converted/i.test(normalText));

  const usesNormalAttack =
    normalHasInfusion ||
    /infused\s+with|cannot\s+be\s+overridden|converted\s+to\s+.*dmg|normal\s+attack\s+dmg\s+bonus|special\s+normal\s+attack|normal,\s*charged,\s*and\s*plunging\s+attack\s+(?:dmg|infusion)/i.test(
      nonCoordText
    ) ||
    /(?:Normal|Charged|Plunging)\s+(?:and\s+(?:Charged|Plunging)\s+)?Attack[^.]{0,80}(?:enhanced|enhances?|infused|converted|dmg\s+(?:is\s+)?increased)/i.test(
      nonCoordText
    ) ||
    /(?:enhances?|increases?)\s+(?:his|her|their|\w+'s)?\s*(?:Normal|Charged|Plunging)\s+Attack/i.test(
      nonCoordText
    ) ||
    hasStanceExitClause;

  const hasPartyHeal = sentences.some(
    (s) =>
      /(?:restores?|regenerates?|heals?)[^.]{0,80}\bHP\b/i.test(s) &&
      /(?:party|nearby|allies|allied|active\s+character|other\s+characters|teammates)/i.test(s)
  );
  const hasSelfSustain =
    !hasPartyHeal &&
    (sentences.some((s) => /(?:restores?|regenerates?|heals?)[^.]{0,80}\bHP\b/i.test(s)) ||
      /bond\s+of\s+life/i.test(nonNormalText));

  const hasShield = /shield\s+dmg\s+absorption|creates?\s+a\s+shield|generates?\s+a\s+shield|forms?\s+a\s+shield/i.test(
    `${labelText}\n${nonNormalText}`
  );
  const hasLongDuration = talents
    .filter((t) => t.kind !== 'normal')
    .some((t) =>
      Object.entries(t.multipliers || {}).some(([lbl, arr]) => {
        if (!/duration/i.test(lbl)) return false;
        const sec = parseFirstNumber(Array.isArray(arr) ? arr[0] : arr);
        return sec >= 10;
      })
    );
  const hasOffField =
    !usesNormalAttack &&
    !hasStanceExitClause &&
    (hasCoordinatedTrigger ||
      /off-field|even\s+when\s+not\s+on\s+the\s+field|coordinated\s+attack|continues?\s+to\s+attack|takes?\s+effect.*off-field|solar\s+isotoma|transient\s+blossom|when\s+opponents\s+within\s+.*take\s+dmg/i.test(
        nonNormalText
      ) ||
      /(?:follow|follows|accompan(?:y|ies))\s+the\s+active\s+character/i.test(nonNormalText) ||
      /continuously\s+dealing\s+(?:AoE\s+)?(?:Pyro|Hydro|Anemo|Electro|Dendro|Cryo|Geo)\s+DMG/i.test(
        nonNormalText
      ) ||
      /while\s+[^.]{1,40}\s+is\s+on\s+the\s+field,?\s+(?:and\s+)?nearby\s+party\s+members/i.test(
        nonNormalText
      ) ||
      (hasLongDuration && /deals?\s+.*dmg/i.test(nonNormalText)));

  // Scan utility tags with strict ally-recipient scope across sentences
  const utilityTags = [];
  const matchesAllyBuff = (s, statRe) => {
    const p1 = new RegExp(
      `(?:all\\s+)?(?:nearby\\s+)?(?:party\\s+members(?:'|’s)?|allies(?:'|’s)?|all\\s+characters\\s+in\\s+the\\s+party)[^.]{0,35}?${statRe}`,
      'i'
    );
    const p2 = new RegExp(
      `(?:increases?|grant(?:s|ing)?)\\s+(?:the\\s+)?${statRe}[^.]{0,45}\\b(?:of|to)\\s+(?:all\\s+)?(?:nearby\\s+)?(?:party\\s+members|allies|the\\s+active\\s+character|all\\s+characters\\s+in\\s+the\\s+party)`,
      'i'
    );
    if (!p1.test(s) && !p2.test(s)) return false;
    // Reject "for each party member..., [Name]'s own stat is increased"
    if (/for\s+each[^.]{0,60}(?:party\s+member|character\s+in\s+the\s+party)/i.test(s) && !p2.test(s)) {
      return /(?:all\s+)?(?:nearby\s+)?(?:party\s+members(?:'|’s)|allies(?:'|’s))/.test(s);
    }
    return true;
  };

  const emSentence = sentences.find((s) => matchesAllyBuff(s, '(?:Elemental\\s+Mastery|EM)'));
  if (emSentence) {
    const emM = emSentence.match(/(?:Elemental\s+Mastery|EM)[^.]{0,35}?by\s+(\d+)/i);
    utilityTags.push(emM ? `EM Buffer (+${emM[1]})` : 'EM Buffer');
  }

  const dmgSentence = sentences.find((s) =>
    matchesAllyBuff(s, '(?:[^\\n.]{0,30}(?:DMG|Damage)|(?:DMG|Damage)\\s+(?:dealt|Bonus))')
  );
  if (dmgSentence) {
    const dmgM = dmgSentence.match(/(?:DMG|Damage)[^.]{0,35}?by\s+([\d.]+%)/i);
    utilityTags.push(dmgM ? `DMG Buffer (+${dmgM[1]})` : 'DMG Buffer');
  }

  const lunarSentence = sentences.find((s) =>
    matchesAllyBuff(s, 'Lunar[- ]?(?:Charged|Bloom|Crystallize|Reaction)[^.]{0,30}?DMG')
  );
  if (lunarSentence) {
    utilityTags.push('Lunar / Reaction Buffer');
  }

  if (sentences.some((s) => matchesAllyBuff(s, 'ATK'))) {
    utilityTags.push('ATK Buffer');
  }
  if (sentences.some((s) => matchesAllyBuff(s, '(?:CRIT\\s+Rate|CRIT\\s+DMG|CRIT)'))) {
    utilityTags.push('Crit Buffer');
  }
  if (/res\s+is\s+decreased|decreases?\s+(?:opponents'?\s+)?(?:elemental\s+|physical\s+|all\s+)?res/i.test(nonNormalText)) {
    utilityTags.push('RES Shred');
  }
  if (/interruption\s+resistance|resistance\s+to\s+interruption/i.test(nonNormalText)) {
    utilityTags.push('Poise / IR');
  }
  if (/dmg\s+reduction|reduces?\s+dmg\s+taken|decreases?\s+dmg\s+taken/i.test(nonNormalText)) {
    utilityTags.push('DMG Reduction');
  }
  if (hasShield) utilityTags.push('Shielder');
  if (hasPartyHeal) utilityTags.push('Healer');
  else if (hasSelfSustain) utilityTags.push('Self-Sustain');

  // Detect conditional Burst triggers in passives & unlocked constellations
  const kitTriggers = [];
  const sources = [
    ...passives.map((p) => ({ source: p.slot, text: p.description || '' })),
    ...activeCons.map((c) => ({ source: `C${c.level}`, text: c.description || '' }))
  ];
  for (const { source, text } of sources) {
    const usesBurst =
      /elemental\s+burst/i.test(text) ||
      (burstName && new RegExp(burstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text));
    if (!usesBurst) continue;
    const emM = text.match(/elemental\s+mastery[\s\S]{0,60}?by\s+(\d+)/i);
    const dmgM = text.match(/(?:dmg|damage)[\s\S]{0,60}?by\s+([\d.]+%)/i);
    const durM = text.match(/for\s+(\d+s)/i);
    const dur = durM ? ` (${durM[1]})` : '';
    if (emM) {
      kitTriggers.push({ source, trigger: 'Burst', effect: `+${emM[1]} Team EM${dur}`, requiresBurst: true });
    } else if (dmgM) {
      kitTriggers.push({ source, trigger: 'Burst', effect: `+${dmgM[1]} Team DMG${dur}`, requiresBurst: true });
    } else if (/party|nearby/i.test(text)) {
      kitTriggers.push({ source, trigger: 'Burst', effect: `Team Buff${dur}`, requiresBurst: true });
    }
  }

  const ascKey = kitData?.ascensionStat?.key || '';
  const hasSustainAscension = ascKey === 'hp_' || ascKey === 'def_' || ascKey === 'heal_';
  const hasOffensiveSelfBuff = /(?:his|her|their|\w+'s)\s+(?:crit\s+rate|crit\s+dmg|elemental\s+dmg)/i.test(
    nonNormalText
  );
  const hasHealingLabel = /(?:heal|regeneration|hp\s+restored)/i.test(labelText);
  const isDedicatedHealer = hasPartyHeal && (hasHealingLabel || hasSustainAscension || !hasOffensiveSelfBuff);

  let primaryRole = 'Quickswap DPS';
  if (isDedicatedHealer) {
    primaryRole = 'Healer / Support';
    if (hasOffField) {
      const charElem = getCharacterMeta(charKey)?.element || '';
      utilityTags.push(charElem ? `Off-Field ${charElem}` : 'Off-Field Sub-DPS');
    }
  } else if (usesNormalAttack && !hasPartyHeal) {
    primaryRole = 'On-Field Carry';
  } else if (hasOffField) {
    primaryRole = 'Off-Field Sub-DPS';
  } else if (hasPartyHeal || hasShield || utilityTags.some((t) => t !== 'Self-Sustain')) {
    primaryRole = 'Sustain / Support';
  }

  const finalTags =
    primaryRole === 'Healer / Support'
      ? utilityTags.filter((t) => t !== 'Healer')
      : utilityTags;

  return {
    charKey,
    primaryRole,
    utilityTags: [...new Set(finalTags)].slice(0, 4),
    kitTriggers,
    usesNormalAttack
  };
}

/**
 * Deterministically inspect hydrated talents & passives to classify kit scaling,
 * non-crit mechanics, useful substats, role, and passive stat caps.
 */
export function analyzeCharacterKit(charKey, kitData, talentLevels = null, constellation = 0) {
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
  const hasHpScaling =
    /\bhp\b/i.test(labelText) ||
    /(?:dmg|damage|shield|heal|healing|bonus)[^.]{0,45}(?:of|based\s+on)\s+(?:her|his|their|\w+'s)?\s*max\s*hp/i.test(
      fullText
    );
  const defHits = (fullText.match(/\bdef\b/gi) || []).length;
  const emHits = (fullText.match(/\belemental\s+mastery\b/gi) || []).length;

  let primaryScaling = 'ATK';
  let usefulSubstats = ['atk_', 'critRate_', 'critDMG_', 'enerRech_'];

  if (isNonCrit) {
    primaryScaling = hpHits >= 2 && hasHpScaling ? 'HP (Non-Crit)' : 'ATK (Non-Crit)';
    usefulSubstats = hpHits >= 2 && hasHpScaling ? ['hp_', 'enerRech_', 'hp', 'eleMas'] : ['atk_', 'enerRech_', 'atk', 'eleMas'];
  } else if (defHits >= 3 && defHits >= hpHits) {
    primaryScaling = 'DEF';
    usefulSubstats = ['def_', 'critRate_', 'critDMG_', 'enerRech_'];
  } else if (hpHits >= 3 && hasHpScaling) {
    primaryScaling = 'HP';
    usefulSubstats = ['hp_', 'critRate_', 'critDMG_', 'enerRech_'];
  } else if (emHits >= 3 && !/normal attack dmg/i.test(labelText)) {
    primaryScaling = 'EM';
    usefulSubstats = ['eleMas', 'enerRech_', 'critRate_', 'critDMG_'];
  } else if (emHits >= 2) {
    usefulSubstats = ['atk_', 'eleMas', 'critRate_', 'critDMG_', 'enerRech_'];
  }

  const statCaps = extractStatCaps(kitData, talentLevels);
  const roleInfo = classifyCharacterRole(charKey, kitData, constellation);

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

/**
 * Computes effective talent levels (base + active constellation +3 boosts) and active C1-C6 flags.
 */
export function computeEffectiveTalents(char, kitData) {
  const base = {
    auto: Math.max(1, Math.min(10, Number(char?.talent?.auto) || 1)),
    skill: Math.max(1, Math.min(10, Number(char?.talent?.skill) || 1)),
    burst: Math.max(1, Math.min(10, Number(char?.talent?.burst) || 1))
  };
  const bonuses = { auto: 0, skill: 0, burst: 0 };
  const ownedCon = Number(char?.constellation) || 0;
  const talents = kitData?.talents || [];
  const constellations = kitData?.constellations || [];

  const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalName = normName(talents.find((t) => t.kind === 'normal')?.name);
  const skillName = normName(talents.find((t) => t.kind === 'skill')?.name);
  const burstName = normName(talents.find((t) => t.kind === 'burst')?.name);

  for (const c of constellations) {
    if (Number(c.level) > ownedCon) continue;
    const desc = String(c.description || '');
    const m = desc.match(/increases?\s+the\s+level\s+of\s+(.+?)\s+by\s+(\d+)/i);
    if (!m) continue;
    const targetRaw = m[1];
    const targetNorm = normName(targetRaw);
    const inc = Number(m[2]) || 3;

    if (/normalattack/i.test(targetNorm) || (normalName && targetNorm.includes(normalName))) {
      bonuses.auto += inc;
    } else if (/elementalskill/i.test(targetNorm) || (skillName && targetNorm.includes(skillName))) {
      bonuses.skill += inc;
    } else if (/elementalburst/i.test(targetNorm) || (burstName && targetNorm.includes(burstName))) {
      bonuses.burst += inc;
    }
  }

  return {
    base,
    bonuses,
    effective: {
      auto: Math.min(15, base.auto + bonuses.auto),
      skill: Math.min(15, base.skill + bonuses.skill),
      burst: Math.min(15, base.burst + bonuses.burst)
    }
  };
}

/**
 * Computes exact total character combat stats and artifact Roll Value (RV%).
 */
export function computeCharacterCombatStats(char, weapon, artifacts = [], kitData = null, weaponStats = null) {
  const effectiveTalents = computeEffectiveTalents(char, kitData);
  const kitAnalysis = analyzeCharacterKit(char?.key, kitData, effectiveTalents.effective, char?.constellation || 0);
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
export function evaluateErComfort(char, combatStats, teams = [], weapons = [], kitData = null, kitAnalysis = null) {
  const kqm = getKqmEntry(char?.key);
  const dataSource = kqm ? 'KQM_TCL' : 'KIT_PARSER';
  const burstCost = Number(kitData?.burstCost) || 60;
  const parserBaseReq = BURST_COST_ER_BASE[burstCost] || Math.round(95 + burstCost * 0.9);
  const isOffFieldRole = kitAnalysis?.roleInfo?.primaryRole === 'Off-Field Sub-DPS';
  const parserRoleAdj = !kqm && isOffFieldRole ? 10 : 0;
  const baseReq = kqm?.erBaselines?.solo ?? parserBaseReq + parserRoleAdj;

  const currentEr = Math.round(combatStats?.er || 100);
  const charElem = char?.meta?.element || '';
  const burstTriggers = (kitAnalysis?.roleInfo?.kitTriggers || []).filter((t) => t.requiresBurst);

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
  if (teamVerdicts.length) {
    const best = [...teamVerdicts].sort((a, b) => b.delta - a.delta)[0];
    erDelta = best.delta;
    const reasons = [];
    if (best.hasSameElemBattery) reasons.push(`Double ${charElem}`);
    if (best.batteryWeapons > 0) reasons.push(`${best.batteryWeapons}× Energy Weapon`);
    const via = reasons.length ? ` via ${reasons.join(' + ')}` : '';
    if (best.delta >= 0 && hasEndgameFlag && soloDelta < 0) {
      erStatus = 'warn';
      summary = `${currentEr}% ER — Covered in ${best.teamName}${via}, but ${soloDelta}% short for solo Stygian / Theatre.`;
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

  // Utility summary when no capped stat-scaling buff exists
  let utilitySummary = '';
  if (!buffCap) {
    const tags = combatStats?.kitAnalysis?.roleInfo?.utilityTags || [];
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

function parsePrimaryMultiplierNumber(displayStr) {
  const cleaned = String(displayStr || '').replace(/,/g, '');
  const m = cleaned.match(/[-+]?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function scoreTalentScalingWeight(talent) {
  if (!talent) return 0;
  const mults = talent.multipliers || {};
  const labels = Object.keys(mults).filter((l) => !/^(cd|duration|energy cost|stamina|max)/i.test(l));
  let maxPct = 0;
  for (const lbl of labels) {
    const arr = mults[lbl];
    if (!Array.isArray(arr) || !arr.length) continue;
    const val = parsePrimaryMultiplierNumber(arr[Math.min(arr.length - 1, 8)]);
    if (val && val > maxPct) maxPct = val;
  }
  return labels.length * 15 + maxPct;
}

export function getTalentPriorityInfo(kitData, kitAnalysis) {
  const role = kitAnalysis?.roleInfo?.primaryRole || 'Quickswap DPS';
  const usesNormal = Boolean(kitAnalysis?.roleInfo?.usesNormalAttack);
  const talents = kitData?.talents || [];
  const tSkill = talents.find((t) => t.kind === 'skill');
  const tBurst = talents.find((t) => t.kind === 'burst');

  const skillWeight = scoreTalentScalingWeight(tSkill);
  const burstWeight = scoreTalentScalingWeight(tBurst);
  const skillFavored = skillWeight >= burstWeight;

  if (role === 'On-Field Carry' || usesNormal) {
    return {
      tiers: { auto: 'high', skill: skillFavored ? 'high' : 'medium', burst: skillFavored ? 'medium' : 'high' },
      orderText: skillFavored
        ? 'Normal (A) > Skill (E) ≥ Burst (Q)'
        : 'Normal (A) > Burst (Q) ≥ Skill (E)',
      lowValueNote: 'All 3 talents contribute to on-field rotations; prioritize Normal (A) first.'
    };
  }

  if (role === 'Sustain / Support' || role === 'Healer / Support') {
    const skillSupport = /heal|shield|absorption|bonus/i.test((tSkill?.labels || []).join(' '));
    const burstSupport = /heal|shield|absorption|bonus/i.test((tBurst?.labels || []).join(' '));
    const eFirst = skillSupport && !burstSupport ? true : !skillSupport && burstSupport ? false : skillFavored;
    return {
      tiers: { auto: 'low', skill: eFirst ? 'high' : 'medium', burst: eFirst ? 'medium' : 'high' },
      orderText: eFirst
        ? 'Skill (E) > Burst (Q) >> Normal (A)'
        : 'Burst (Q) > Skill (E) >> Normal (A)',
      lowValueNote: 'Normal (A) is a low-value Mora sink — leave at Lv.1.'
    };
  }

  // Off-Field Sub-DPS or Quickswap DPS
  return {
    tiers: { auto: 'low', skill: skillFavored ? 'high' : 'medium', burst: skillFavored ? 'medium' : 'high' },
    orderText: skillFavored
      ? 'Skill (E) > Burst (Q) >> Normal (A)'
      : 'Burst (Q) > Skill (E) >> Normal (A)',
    lowValueNote: 'Normal (A) is a low-value Mora sink — leave at Lv.1 unless on-fielding.'
  };
}

/**
 * Synthesizes 4 concise deterministic kit insights from parsed talents, passives, constellations & ER diagnostics.
 */
export function generateKitInsights(char, kitData, weaponData, erDiag, kitAnalysis = null) {
  const analysis =
    kitAnalysis || analyzeCharacterKit(char?.key, kitData, char?.talent, char?.constellation || 0);
  const roleInfo = analysis.roleInfo || { primaryRole: 'Quickswap DPS', utilityTags: [], kitTriggers: [] };
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

/**
 * Compares per-level multiplier rows between currentLvl and targetLvl (with +3 constellation boosts)
 * and attaches exact Mora/Book/Weekly/Crown upgrade costs + ROI badge.
 */
export function calcTalentUpgradeDiff(charKey, kitData, slot, currentLvl, targetLvl, constellation = 0, kitAnalysis = null) {
  const baseCur = Math.max(1, Math.min(10, Number(currentLvl) || 1));
  const baseTgt = Math.max(1, Math.min(10, Number(targetLvl) || baseCur));
  const changed = baseTgt > baseCur;

  const kindMap = { auto: 'normal', skill: 'skill', burst: 'burst' };
  const labelMap = { auto: 'Normal (A)', skill: 'Skill (E)', burst: 'Burst (Q)' };
  const talent = (kitData?.talents || []).find((t) => t.kind === kindMap[slot]);

  const { bonuses } = computeEffectiveTalents({ talent: { [slot]: baseCur }, constellation }, kitData);
  const bonus = bonuses[slot] || 0;
  const effCur = Math.min(15, baseCur + bonus);
  const effTgt = Math.min(15, baseTgt + bonus);

  const cost = changed
    ? calcTalentUpgradeCost(charKey, baseCur, baseTgt)
    : { mora: 0, books: { Teachings: 0, Guide: 0, Philosophies: 0 }, bookName: '', weekly: 0, weeklyMat: '', crown: 0 };

  const rows = [];
  const mults = talent?.multipliers || {};
  for (const [label, arr] of Object.entries(mults)) {
    if (!Array.isArray(arr) || !arr.length) continue;
    const oldDisplay = arr[Math.min(arr.length - 1, Math.max(0, effCur - 1))];
    const newDisplay = arr[Math.min(arr.length - 1, Math.max(0, effTgt - 1))];
    if (oldDisplay === undefined || newDisplay === undefined) continue;
    if (String(oldDisplay) === String(newDisplay)) continue;
    const oldNum = parsePrimaryMultiplierNumber(oldDisplay);
    const newNum = parsePrimaryMultiplierNumber(newDisplay);
    const relGainPct =
      oldNum && newNum && oldNum > 0
        ? Math.round(((newNum - oldNum) / oldNum) * 1000) / 10
        : null;
    rows.push({ label, oldDisplay, newDisplay, relGainPct });
  }

  const gainValues = rows.map((r) => r.relGainPct).filter((v) => v !== null && Number.isFinite(v));
  const avgRelGainPct = gainValues.length
    ? Math.round((gainValues.reduce((a, b) => a + b, 0) / gainValues.length) * 10) / 10
    : 0;

  const analysis = kitAnalysis || analyzeCharacterKit(charKey, kitData, null, constellation);
  const priority = getTalentPriorityInfo(kitData, analysis);
  const tier = priority.tiers[slot] || 'medium';

  let badge = 'MODERATE';
  let badgeTone = 'cyan';
  if (tier === 'low') {
    badge = 'LUXURY / MORA SINK';
    badgeTone = 'coral';
  } else if (baseTgt === 10 && baseCur < 10) {
    badge = 'LUXURY / MORA SINK';
    badgeTone = 'gold';
  } else if (tier === 'high') {
    badge = 'HIGH VALUE';
    badgeTone = 'mint';
  }

  return {
    slot,
    slotLabel: labelMap[slot] || slot,
    talentName: stripMarkup(talent?.name || labelMap[slot]),
    changed,
    baseCur,
    baseTgt,
    bonus,
    effCur,
    effTgt,
    rows,
    avgRelGainPct,
    cost,
    badge,
    badgeTone
  };
}
