import { getCharacterMeta, getKqmEntry, getWeaponsIndex } from './catalog.js?v=20261115ag';
import { calcTalentUpgradeCost } from './calculations.js?v=20261114w';

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

  const extraPassives = Array.isArray(kitData?.passiveTalents) ? kitData.passiveTalents : [];
  const allPassives = [...passives, ...extraPassives];
  const ownKitText = [...talents, ...allPassives].map((x) => stripMarkup(x?.description || '')).join('\n');
  const INFUSION_CONVERT_RE =
    /converts?\s+(?:[A-Za-z'’]+\s+){0,4}(?:(?:normal|charged|plunging)(?:,\s*(?:charged|plunging))*(?:\s+and\s+(?:charged|plunging))?\s+)?attacks?(?:\s+dmg)?\s+(?:into|to)\s+(?:pyro|hydro|electro|cryo|dendro|anemo|geo)\s+dmg/i;
  const INFUSION_ALTF_RE =
    /(?:[A-Za-z'’]+\s+){0,4}(?:normal|charged|plunging)(?:,\s*(?:charged|plunging))*(?:\s+and\s+(?:charged|plunging))?\s+attacks?\s+(?:dmg\s+is\s+|will\s+be\s+)?converted\s+(?:into|to)\s+(?:pyro|hydro|electro|cryo|dendro|anemo|geo)\s+dmg/i;
  const INFUSION_IMBUE_RE =
    /(?:infus(?:es?|ing)\s+(?:his|her|their|the\s+character'?s|(?:[A-Za-z'’]+\s+){1,3})?(?:weapons?|normal|charged|plunging|attacks?)\s+with\s+(?:pyro|hydro|electro|cryo|dendro|anemo|geo)|(?:gains?|obtains?)\s+(?:an?\s+)?(?:pyro|hydro|electro|cryo|dendro|anemo|geo)\s+infusion)/i;
  const INFUSION_OVERRIDE_RE =
    /cannot\s+be\s+overridden(?:\s+by\s+any\s+other\s+elemental\s+infusion)?/i;

  const rawHasInfusion =
    INFUSION_CONVERT_RE.test(ownKitText) ||
    INFUSION_ALTF_RE.test(ownKitText) ||
    INFUSION_IMBUE_RE.test(ownKitText) ||
    (INFUSION_OVERRIDE_RE.test(ownKitText) && /(?:normal|charged|plunging)\s+attacks?/i.test(ownKitText));

  // Distinguish sustained infusion stances (>= 5s) from brief plunge/dash animations (<= 2s, e.g. Kazuha Midare Ranzan)
  const isBriefPlungeOrTap =
    /plunging\s+attack:\s*midare\s+ranzan/i.test(nonNormalText) &&
    !/(?:lasts?\s+(?:[5-9]|1\d)s|infusion\s+for\s+(?:[5-9]|1\d)s)/i.test(nonNormalText);

  // Check if infusion/stance duration >= 5s (or explicit sustained carry kit)
  const hasSustainedDuration = talents
    .filter((t) => t.kind !== 'normal')
    .some((t) =>
      Object.entries(t.multipliers || {}).some(([lbl, arr]) => {
        if (!/duration/i.test(lbl) || /cd|cooldown/i.test(lbl)) return false;
        const sec = parseFirstNumber(Array.isArray(arr) ? arr[0] : arr);
        return sec >= 5;
      })
    );

  const hasInfusion = rawHasInfusion && !isBriefPlungeOrTap;
  const hasChargedCarryFocus =
    sentences.some(
      (s) =>
        !/(?:active\s+character|party\s+members?|allies|teammates)/i.test(s) &&
        /(?:charged\s+attack(?::|\s+(?:dmg|charging|stamina|crit))|charging\s+time|equitable\s+judgment|arataki\s+kesagiri|explosive\s+spark|superlative\s+superstrength|scarlet\s+seal|(?:own|his|her|their)\s+normal\s+attack)/i.test(
          s
        )
    );
  const usesNormalAttack = hasInfusion || hasChargedCarryFocus;

  const healSentences = sentences.filter((s) =>
    /(?:restores?|regenerates?|heals?)[^.]{0,80}\bHP\b/i.test(s)
  );
  const hasTeamHeal = healSentences.some((s) =>
    /(?:all\s+(?:nearby\s+)?party\s+members|allies|allied|other\s+characters|teammates|nearby\s+characters)/i.test(s)
  );
  const hasSingleTargetHeal =
    !hasTeamHeal &&
    healSentences.some((s) => /(?:the\s+active\s+character|nearby\s+active\s+characters?)/i.test(s));
  const hasPartyHeal = hasTeamHeal || hasSingleTargetHeal;
  const selfHeal =
    !hasPartyHeal &&
    (healSentences.length > 0 || /bond\s+of\s+life/i.test(nonNormalText));

  const hasShield = /shield\s+dmg\s+absorption|creates?\s+a\s+shield|generates?\s+a\s+shield|forms?\s+a\s+shield/i.test(
    `${labelText}\n${nonNormalText}`
  );
  const hasLongDuration = talents
    .filter((t) => t.kind !== 'normal')
    .some((t) =>
      Object.entries(t.multipliers || {}).some(([lbl, arr]) => {
        if (!/duration/i.test(lbl)) return false;
        const sec = parseFirstNumber(Array.isArray(arr) ? arr[0] : arr);
        return sec >= 8;
      })
    );
  const hasStanceExitClause =
    /(?:cleared|ends?|removed?|canceled|cancelled)\s+when[^.]{0,40}leaves\s+the\s+field/i.test(nonNormalText) ||
    /when\s+[^.]{1,30}\s+leaves\s+the\s+field[^.]{0,50}(?:explode|end|clear|cancel|disappear|removed?)/i.test(
      nonNormalText
    );
  const hasPeriodicOffFieldDmg = /(?:every\s+[\d.]+\s*s|at\s+intervals|periodically|continuously|deals?\s+[^.]{0,40}\bdmg\b[^.]{0,40}(?:nearby|every|interval))/i.test(
    nonNormalText
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
      (hasLongDuration && hasPeriodicOffFieldDmg));

  // Scan verified team-scoped functionTags with strict subject-recipient guard
  const functionTags = [];
  const matchesAllyBuff = (s, statRe) => {
    if (/(?:her|his|their)\s+own\s+/i.test(s)) return false;
    const allyNoun =
      '(?:all\\s+)?(?:nearby\\s+)?(?:party\\s+members|allies|all\\s+characters\\s+in\\s+the\\s+party|the\\s+active\\s+character)';
    const pPossessive = new RegExp(`${allyNoun}(?:'|’s)?\\s+${statRe}`, 'i');
    const pGrantTo = new RegExp(
      `(?:increases?|grant(?:s|ing)?|gain(?:s|ing)?)\\s+(?:the\\s+)?${statRe}[^.]{0,45}\\b(?:of|to|for)\\s+${allyNoun}`,
      'i'
    );
    const pGrantAllyStat = new RegExp(
      `(?:grants?|gives?|provides?)\\s+${allyNoun}[^.]{0,35}?${statRe}`,
      'i'
    );
    const pHaveTheir = new RegExp(
      `${allyNoun}[^.]{0,40}?(?:have\\s+their|gain(?:s)?|receive(?:s)?)[^.]{0,30}?${statRe}`,
      'i'
    );
    if (!pPossessive.test(s) && !pGrantTo.test(s) && !pGrantAllyStat.test(s) && !pHaveTheir.test(s)) {
      return false;
    }
    if (new RegExp(`\\b[A-Z][a-z]+(?:'|’s)\\s+${statRe}`, 'i').test(s) && !pGrantTo.test(s) && !pGrantAllyStat.test(s)) {
      return false;
    }
    return true;
  };

  const emSentence = sentences.find((s) => matchesAllyBuff(s, '\\b(?:Elemental\\s+Mastery|EM)\\b'));
  if (emSentence) {
    const emM = emSentence.match(/(?:Elemental\s+Mastery|\bEM\b)[^.]{0,35}?by\s+(\d+)/i);
    functionTags.push(emM ? `EM Buffer (+${emM[1]})` : 'EM Buffer');
  }

  const dmgSentence = sentences.find(
    (s) =>
      !/Base\s+DMG/i.test(s) &&
      matchesAllyBuff(s, '(?:[^\\n.]{0,30}(?:DMG|Damage)|(?:DMG|Damage)\\s+(?:dealt|Bonus))')
  );
  if (dmgSentence) {
    const dmgM = dmgSentence.match(/(?:DMG|Damage)[^.]{0,35}?by\s+([\d.]+%)/i);
    functionTags.push(dmgM ? `DMG% Buffer (+${dmgM[1]})` : 'DMG% Buffer');
  }

  if (sentences.some((s) => matchesAllyBuff(s, '\\bATK\\b'))) {
    functionTags.push('ATK Buffer');
  }
  const critSentence = sentences.find((s) => matchesAllyBuff(s, '\\b(?:CRIT\\s+Rate|CRIT\\s+DMG|CRIT)\\b'));
  if (critSentence) {
    const crM = critSentence.match(/crit\s+rate[^.]{0,30}?by\s+([\d.]+%)/i);
    functionTags.push(crM ? `CRIT Buffer (+${crM[1]})` : 'CRIT Buffer');
  }
  if (/res\s+is\s+decreased|decreases?\s+(?:opponents'?\s+)?(?:elemental\s+|physical\s+|all\s+)?res/i.test(nonNormalText)) {
    functionTags.push('RES Shred');
  }
  if (/def\s+is\s+decreased|decreases?\s+(?:opponents'?\s+)?def\b|ignores?\s+[\d.]+%\s+of\s+opponents'?\s+def/i.test(nonNormalText)) {
    functionTags.push('DEF Shred');
  }
  if (/pulls?\s+(?:in\s+)?(?:nearby\s+)?(?:objects\s+and\s+)?opponents|draws?\s+(?:in\s+)?opponents|pulling\s+(?:objects\s+and\s+)?opponents|vacuum|vortex|gather(?:s|ing)?\s+opponents|creates?\s+a\s+wind\s+tunnel/i.test(nonNormalText)) {
    functionTags.push('Crowd Control');
  }

  const IR_RE = /interruption\s+resistance|resistance\s+to\s+interruption/i;
  const TEAM_IR_TARGET_RE =
    /\b(?:party\s+members?|nearby\s+(?:party\s+)?characters?|active\s+character|allies|allied\s+characters?|teammates?)\b/i;
  const irSentences = sentences.filter((s) => IR_RE.test(s));
  let teamIR = false;
  let selfIR = false;
  for (const s of irSentences) {
    const isExplicitSelf = /(?:his|her|their)\s+own\b|paramita\s+papilio/i.test(s);
    const grantsToTeam =
      !isExplicitSelf &&
      (TEAM_IR_TARGET_RE.test(s) ||
        /(?:within\s+the\s+(?:area|field)|rain\s+swords?|stormbreaker|fiery\s+sanctum)/i.test(s));
    if (grantsToTeam) {
      teamIR = true;
    } else {
      selfIR = true;
    }
  }
  if (teamIR) functionTags.push('Team IR');
  if (hasShield) functionTags.push('Shielder');
  if (hasTeamHeal) functionTags.push('Team Healer');
  else if (hasSingleTargetHeal) functionTags.push('Single-Target Healer');

  const energySentences = sentences.filter((s) => /(?:restores?|regenerates?)\s+[\d.]+\s+(?:Elemental\s+)?Energy/i.test(s));
  const hasTeamEnergy = energySentences.some((s) =>
    /(?:all\s+(?:nearby\s+)?party\s+members|allies|allied|other\s+characters|teammates|active\s+character)/i.test(s) &&
    !/(?:her|his|their)\s+own\b/i.test(s)
  );
  const selfEnergy = !hasTeamEnergy && energySentences.length > 0;
  if (hasTeamEnergy) functionTags.push('Energy Battery');

  const isReactionEnabler =
    /converted\s+into\s+(?:the\s+)?Lunar[- ]/i.test(nonNormalText) ||
    /Lunar[- ]?(?:Charged|Bloom|Crystallize|Reaction)(?:'|’s)?\s+Base\s+DMG[^.]{0,45}increas/i.test(nonNormalText) ||
    /increas(?:es?|ing)\s+Lunar[- ]?(?:Charged|Bloom|Crystallize|Reaction)(?:'|’s)?\s+Base\s+DMG/i.test(nonNormalText);
  if (isReactionEnabler || (hasOffField && functionTags.length === 0)) {
    functionTags.push('Reaction Enabler');
  }

  // Self-only durability / energy traits (strictly excluded from functionTags)
  const selfDurability = {
    selfHeal,
    selfEnergy,
    selfIR
  };

  // Detect conditional Burst triggers in passives & unlocked constellations
  const kitTriggers = [];
  const sources = [
    ...passives.map((p) => ({ source: p.slot, text: stripMarkup(p.description || '') })),
    ...activeCons.map((c) => ({ source: `C${c.level}`, text: stripMarkup(c.description || '') }))
  ];
  for (const { source, text } of sources) {
    const usesBurst =
      /elemental\s+burst/i.test(text) ||
      (burstName && new RegExp(burstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text));
    if (!usesBurst) continue;
    const trigSentences = text.split(/(?<=[.!?\n])\s+|\n+/);
    const grantsEmToAlly = trigSentences.find((s) => matchesAllyBuff(s, '\\b(?:Elemental\\s+Mastery|EM)\\b'));
    const grantsDmgToAlly = trigSentences.find((s) => matchesAllyBuff(s, '(?:DMG|Damage)'));
    const grantsOtherAllyBuff = trigSentences.some(
      (s) =>
        matchesAllyBuff(s, '(?:ATK|DEF|CRIT\\s+Rate|CRIT\\s+DMG|Movement\\s+SPD|ATK\\s+SPD)') ||
        /(?:all\s+party\s+members|nearby\s+party\s+members|allies)\s+(?:gain|receive|restore)/i.test(s)
    );
    const isSelfEnergyRefund =
      !grantsOtherAllyBuff &&
      !grantsEmToAlly &&
      !grantsDmgToAlly &&
      /(?:restores?|regenerates?)\s+[\d.]+\s+(?:Elemental\s+)?Energy/i.test(text);

    const durM = text.match(/for\s+(\d+s)/i);
    const dur = durM ? ` (${durM[1]})` : '';
    if (grantsEmToAlly) {
      const emM = grantsEmToAlly.match(/(?:Elemental\s+Mastery|\bEM\b)[\s\S]{0,60}?by\s+(\d+)/i);
      kitTriggers.push({
        source,
        trigger: 'Burst',
        effect: emM ? `+${emM[1]} Team EM${dur}` : `Team EM Buff${dur}`,
        requiresBurst: true
      });
    } else if (grantsDmgToAlly) {
      const dmgM = grantsDmgToAlly.match(/(?:DMG|Damage)[\s\S]{0,60}?by\s+([\d.]+%)/i);
      kitTriggers.push({
        source,
        trigger: 'Burst',
        effect: dmgM ? `+${dmgM[1]} Team DMG${dur}` : `Team DMG Buff${dur}`,
        requiresBurst: true
      });
    } else if (grantsOtherAllyBuff) {
      kitTriggers.push({ source, trigger: 'Burst', effect: `Team Buff${dur}`, requiresBurst: true });
    } else if (isSelfEnergyRefund) {
      kitTriggers.push({ source, trigger: 'Burst', effect: 'Self Energy / CD', requiresBurst: true });
    }
  }

  // Axis 1: Mutually-exclusive Field-Time Archetype (fieldRole)
  const meta = getCharacterMeta(charKey);
  const weaponType = meta?.weaponType || '';
  const elem = meta?.element || '';
  const isNightsoulSamplerSupport =
    /source\s+sample/i.test(nonNormalText) ||
    (functionTags.includes('RES Shred') && (hasPartyHeal || functionTags.includes('Shielder')));

  const isDriverArchetype =
    !hasSustainedDuration &&
    (weaponType === 'Catalyst' || elem === 'Hydro' || elem === 'Anemo') &&
    (hasPartyHeal || functionTags.some((t) => /EM Buffer|Crowd Control|Reaction Enabler/.test(t))) &&
    !hasChargedCarryFocus;

  let fieldRole = 'Quickswap Support';
  if (isNightsoulSamplerSupport && hasPartyHeal) {
    // e.g. Xilonen in >=2 PHEC teams, Jean, Xianyun: quick-tap support even if NA/Plunge has elemental hits
    fieldRole = 'Quickswap Support';
  } else if ((hasInfusion || hasChargedCarryFocus) && !isDriverArchetype) {
    fieldRole = 'On-Field Carry';
  } else if (hasOffField && !usesNormalAttack) {
    fieldRole = 'Off-Field Sub-DPS';
  } else if (isDriverArchetype && usesNormalAttack) {
    fieldRole = 'On-Field Driver';
  } else if (functionTags.length > 0 || hasPartyHeal || hasShield) {
    fieldRole = 'Quickswap Support';
  } else if (hasInfusion || usesNormalAttack) {
    fieldRole = 'On-Field Carry';
  }

  // Axis 3: Explicit flexModes for creative / constellation / conditional playstyles
  const flexModes = [];
  const normChar = String(charKey || '').toLowerCase();
  if (normChar === 'kaedeharakazuha') {
    fieldRole = 'Quickswap Support';
    flexModes.push({
      id: 'On-Field Carry',
      label: ownedCon >= 6 ? 'On-Field Carry (C6)' : 'Driver / Plunge Carry',
      unlocked: ownedCon >= 6,
      condition: ownedCon >= 6 ? 'C6 Anemo Infusion active' : 'Unlocks full carry infusion at C6 (or Plunge Driver)'
    });
  } else if (normChar === 'xilonen') {
    fieldRole = 'Quickswap Support';
    flexModes.push({
      id: 'On-Field Carry',
      label: 'On-Field Carry (< 2 PHEC)',
      unlocked: true,
      condition: 'Auto-activates in teams with < 2 Pyro/Hydro/Electro/Cryo allies'
    });
  } else if (normChar === 'sangonomiyakokomi') {
    fieldRole = hasOffField ? 'Off-Field Sub-DPS' : 'Quickswap Support';
    flexModes.push(
      { id: 'On-Field Driver', label: 'On-Field Driver', unlocked: true, condition: 'Burst-window Hydro NA driver' },
      { id: 'Creative Carry (Critkomi)', label: 'Creative Carry (Critkomi)', unlocked: true, condition: 'Meme/Crit build bypassing -100% CR passive' }
    );
  } else if (fieldRole === 'Quickswap Support' && (weaponType === 'Catalyst' || hasPartyHeal)) {
    flexModes.push({
      id: 'On-Field Driver',
      label: 'On-Field Driver',
      unlocked: true,
      condition: 'Elemental NA/CA enabler for off-field sub-DPS'
    });
    if (hasPartyHeal) {
      flexModes.push({
        id: 'Creative Carry',
        label: 'Creative Carry',
        unlocked: true,
        condition: 'Off-meta on-field DPS / driver build'
      });
    }
  } else if (normChar === 'ganyu') {
    fieldRole = 'On-Field Carry';
    flexModes.push(
      { id: 'On-Field Carry', label: 'On-Field Carry (Melt / Freeze)', unlocked: true, condition: 'Charged Attack Frostflake Arrow carry' },
      { id: 'Off-Field Sub-DPS', label: 'Off-Field Sub-DPS (Burst)', unlocked: true, condition: 'Cryo Burst sub-DPS & Freeze support' }
    );
  } else if (fieldRole === 'On-Field Driver') {
    flexModes.push({
      id: 'Quickswap Support',
      label: 'Quickswap Support',
      unlocked: true,
      condition: 'Skill/Burst swap utility only'
    });
  }

  const dedupedTags = [...new Set(functionTags)];

  return {
    charKey,
    fieldRole,
    primaryRole: fieldRole,
    functionTags: dedupedTags,
    utilityTags: dedupedTags.slice(0, 4),
    selfDurability,
    flexModes,
    kitTriggers,
    hasInfusion,
    usesNormalAttack: fieldRole === 'On-Field Carry' || fieldRole === 'On-Field Driver',
    teamIR,
    selfIR
  };
}

/**
 * Resolves a character's effective role inside a 4-character squad (e.g. Xilonen < 2 PHEC -> On-Field Carry).
 */
export function resolveMemberTeamRole(charKey, kitData, constellation = 0, teamMembers = [], explicitMode = '') {
  const roleInfo = classifyCharacterRole(charKey, kitData, constellation);
  if (explicitMode) return explicitMode;
  if (String(charKey || '').toLowerCase() === 'xilonen' && Array.isArray(teamMembers) && teamMembers.length > 0) {
    const PHEC = new Set(['Pyro', 'Hydro', 'Electro', 'Cryo']);
    const phecCount = teamMembers.filter((m) => PHEC.has(getCharacterMeta(m.characterKey)?.element)).length;
    if (phecCount < 2) return 'On-Field Carry';
  }
  return roleInfo.fieldRole;
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

export function getTalentPriorityInfo(kitData, kitAnalysis, profile = null) {
  const resolvedProfile =
    profile ||
    buildKitProfile(
      {
        key: kitAnalysis?.charKey || '',
        kitData,
        constellation: 0
      },
      {}
    );
  return deriveTalentPriority(resolvedProfile);
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

/**
 * Extracts primary & secondary stat dependencies from Skill/Burst/Normal multiplier
 * formulas and A1/A4 ascension passives.
 */
export function extractKitScaling(charKey, kitData, kitAnalysis = null) {
  const talents = kitData?.talents || [];
  const passives = kitData?.passives || [];
  const analysis = kitAnalysis || analyzeCharacterKit(charKey, kitData);
  const role = analysis?.roleInfo?.fieldRole || analysis?.roleInfo?.primaryRole || 'Quickswap Support';
  const tags = analysis?.roleInfo?.functionTags || analysis?.roleInfo?.utilityTags || [];
  const isHealer = tags.includes('Team Healer') || tags.includes('Single-Target Healer');
  const isNonCrit = Boolean(analysis?.isNonCrit);
  const usesNormal = Boolean(analysis?.roleInfo?.usesNormalAttack);

  const multEntries = [];
  for (const t of talents) {
    const kindLabel = t.kind === 'normal' ? 'Normal/Charged' : t.kind === 'skill' ? 'Skill' : 'Burst';
    for (const [lbl, arr] of Object.entries(t.multipliers || {})) {
      const sample = Array.isArray(arr) ? arr[0] : arr;
      multEntries.push({ kind: t.kind, kindLabel, label: lbl, sample: String(sample || '') });
    }
  }

  const passiveText = passives.map((p) => stripMarkup(p.description || '')).join('\n');
  const talentDescText = talents.map((t) => stripMarkup(t.description || '')).join('\n');
  const fullText = `${talentDescText}\n${passiveText}`;

  let hpHits = 0;
  let defHits = 0;
  let emHits = 0;
  let atkHits = 0;
  let erHits = 0;

  for (const m of multEntries) {
    const combined = `${m.label} ${m.sample}`;
    if (/\binherited\s+hp\b|\bendurance\b/i.test(m.label)) continue;
    if (/\b(?:max\s*)?hp\b/i.test(combined)) hpHits += m.kind === 'normal' ? 1 : 2;
    else if (/\bdef\b/i.test(combined)) defHits += m.kind === 'normal' ? 1 : 2;
    else if (/\belemental\s+mastery\b|\bem\b/i.test(combined)) emHits += 2;
    else if (/%/.test(m.sample) && !/duration|cd|cooldown|cost|stamina/i.test(m.label)) atkHits += 1;
  }

  const hpScaleText = `${passiveText}\n${talentDescText}`.replace(
    /[^.\n]*(?:endurance|inherited\s+hp|ice\s+lotus|baron\s+bunny|bogglecat)[^.\n]*/gi,
    ''
  );
  if (/based\s+on[^.]{0,45}max\s+hp|scales?\s+(?:off|with)[^.]{0,30}hp/i.test(hpScaleText)) hpHits += 3;
  if (/based\s+on[^.]{0,45}\bdef\b|scales?\s+(?:off|with)[^.]{0,30}\bdef\b/i.test(fullText)) defHits += 3;
  if (/based\s+on[^.]{0,45}elemental\s+mastery|scales?\s+(?:off|with)[^.]{0,30}elemental\s+mastery|for\s+every\s+point\s+of\s+elemental\s+mastery/i.test(fullText)) emHits += 3;
  if (/based\s+on[^.]{0,45}energy\s+recharge|for\s+every\s+[\d.]+%[^.]{0,40}energy\s+recharge/i.test(fullText)) erHits += 3;

  // Determine dominant stat
  let primaryStatKey = 'atk_';
  let primaryLabel = 'ATK';
  if (hpHits >= 3 && hpHits >= defHits && hpHits >= emHits && (hpHits >= atkHits * 0.45 || analysis?.primaryStatKey === 'hp_')) {
    primaryStatKey = 'hp_';
    primaryLabel = 'Max HP';
  } else if (defHits >= 3 && defHits >= hpHits && defHits >= emHits && (defHits >= atkHits * 0.45 || analysis?.primaryStatKey === 'def_')) {
    primaryStatKey = 'def_';
    primaryLabel = 'DEF';
  } else if (emHits >= 3 && emHits >= hpHits && emHits >= defHits) {
    primaryStatKey = 'eleMas';
    primaryLabel = 'Elemental Mastery';
  } else if (erHits >= 3 && atkHits <= 4) {
    primaryStatKey = 'enerRech_';
    primaryLabel = 'Energy Recharge';
  } else if (analysis?.primaryStatKey && analysis.primaryStatKey !== 'atk_') {
    primaryStatKey = analysis.primaryStatKey;
    primaryLabel =
      primaryStatKey === 'hp_' ? 'Max HP' : primaryStatKey === 'def_' ? 'DEF' : primaryStatKey === 'eleMas' ? 'Elemental Mastery' : 'ATK';
  }

  const isPureSupport =
    role === 'Quickswap Support' &&
    !tags.some((t) => /Sub-DPS|Carry|Driver/i.test(t));

  const damageSources = [];
  if (usesNormal) damageSources.push('Normal / Charged');
  const hasSkillDmg = multEntries.some((m) => m.kind === 'skill' && /dmg/i.test(m.label));
  const hasBurstDmg = multEntries.some((m) => m.kind === 'burst' && /dmg/i.test(m.label));
  if (hasSkillDmg) damageSources.push('Elemental Skill');
  if (hasBurstDmg) damageSources.push('Elemental Burst');
  if (!damageSources.length) damageSources.push('Skill & Burst');

  const elem = getCharacterMeta(charKey)?.element || '';
  const reactionCarry =
    !isPureSupport &&
    (elem === 'Pyro' || elem === 'Hydro' || elem === 'Dendro' || elem === 'Electro' || elem === 'Anemo') &&
    primaryStatKey !== 'def_';

  const secondaryStats = [];
  if ((analysis?.burstCost || 60) >= 60 || role !== 'On-Field Carry') secondaryStats.push('ER%');
  if (reactionCarry && primaryStatKey !== 'eleMas') secondaryStats.push('EM');
  if (tags.includes('Team Healer') || tags.includes('Single-Target Healer')) secondaryStats.push('Healing Bonus%');
  if (!isNonCrit && !isPureSupport && primaryStatKey !== 'atk_') secondaryStats.push('CRIT Rate / DMG');

  const primaryDisplay =
    primaryStatKey === 'eleMas'
      ? isNonCrit
        ? 'EM'
        : 'EM + CRIT'
      : isPureSupport
        ? primaryLabel
        : `${primaryLabel}% + CRIT`;

  // Scan talents & Ascension Passives (A1, A4) for additive stat-to-DMG/Shield/Heal conversions
  const a1a4Text = passives
    .filter((p) => p.slot === 'A1' || p.slot === 'A4' || !p.slot)
    .map((p) => stripMarkup(p.description || ''))
    .join('\n');
  const conversionSentences = `${a1a4Text}\n${talentDescText}`
    .replace(/[^.\n]*(?:endurance|inherited\s+hp|ice\s+lotus|baron\s+bunny|bogglecat)[^.\n]*/gi, '')
    .split(/(?<=[.!?\n])\s+|\n+/);
  const conversionStats = [];
  const ADDITIVE_CONV_RE =
    /(?:dmg|damage|attack|skill|burst|heal|shield|absorption|bonus)[^.]{0,90}(?:increased\s+by|based\s+on|equal\s+to|of)\s+(?:[\d.]+%\s+of\s+)?(?:[A-Za-z'’]+\s+|her\s+|his\s+|their\s+)?(max\s*hp|\bdef\b|elemental\s+mastery)/i;
  for (const s of conversionSentences) {
    const m = s.match(ADDITIVE_CONV_RE);
    if (!m) continue;
    const rawStat = m[1].toLowerCase();
    if (rawStat.includes('hp') && !conversionStats.includes('HP')) conversionStats.push('HP');
    else if (rawStat.includes('def') && !conversionStats.includes('DEF')) conversionStats.push('DEF');
    else if (rawStat.includes('mastery') && !conversionStats.includes('EM')) conversionStats.push('EM');
  }
  const primaryShort =
    primaryStatKey === 'hp_' ? 'HP' : primaryStatKey === 'def_' ? 'DEF' : primaryStatKey === 'eleMas' ? 'EM' : primaryStatKey === 'enerRech_' ? 'ER' : 'ATK';
  const scalingStats = [...new Set([primaryShort, ...conversionStats])];

  return {
    primaryStatKey,
    primaryLabel,
    primaryDisplay,
    scalingStats,
    conversionStats,
    damageSources,
    secondaryStats: [...new Set(secondaryStats)],
    isNonCrit,
    isPureSupport
  };
}

/**
 * Generates deterministic artifact main-stat & substat priority guidelines
 * even for unowned/unbuilt characters with 0 equipped artifacts.
 */
export function getBuildStatGuidelines(charKey, kitData, kitAnalysis = null) {
  const analysis = kitAnalysis || analyzeCharacterKit(charKey, kitData);
  const scaling = extractKitScaling(charKey, kitData, analysis);
  const role = analysis?.roleInfo?.fieldRole || analysis?.roleInfo?.primaryRole || 'Quickswap Support';
  const tags = analysis?.roleInfo?.functionTags || analysis?.roleInfo?.utilityTags || [];
  const isHealer = tags.includes('Team Healer') || tags.includes('Single-Target Healer');
  const meta = getCharacterMeta(charKey);
  const elem = meta?.element || 'Elemental';
  const isPhysical =
    elem === 'Cryo' &&
    Boolean(analysis?.roleInfo?.usesNormalAttack) &&
    /physical\s+dmg/i.test((kitData?.talents || []).map((t) => t.description || '').join(' '));

  const mainStatLabel =
    scaling.primaryStatKey === 'hp_'
      ? 'HP%'
      : scaling.primaryStatKey === 'def_'
        ? 'DEF%'
        : scaling.primaryStatKey === 'eleMas'
          ? 'EM'
          : scaling.primaryStatKey === 'enerRech_'
            ? 'ER%'
            : 'ATK%';

  let sands = mainStatLabel;
  if (scaling.isPureSupport || role === 'Off-Field Sub-DPS') {
    sands = mainStatLabel === 'ER%' ? 'ER%' : `${mainStatLabel} / ER%`;
  } else if (scaling.primaryStatKey === 'atk_' && (elem === 'Pyro' || elem === 'Hydro' || elem === 'Dendro')) {
    sands = 'ATK% / EM';
  }

  let goblet = isPhysical ? 'Physical DMG%' : `${elem} DMG%`;
  if (scaling.isPureSupport || tags.includes('Shielder')) {
    goblet = scaling.primaryStatKey === 'eleMas' ? 'EM' : `${mainStatLabel}${role === 'Off-Field Sub-DPS' ? ` / ${elem} DMG%` : ''}`;
  } else if (scaling.primaryStatKey === 'eleMas' && scaling.isNonCrit) {
    goblet = 'EM';
  } else if (scaling.primaryStatKey === 'hp_' && role !== 'On-Field Carry') {
    goblet = `${elem} DMG% / HP%`;
  }

  let circlet = 'CRIT Rate / CRIT DMG';
  if (isHealer) {
    circlet = `Healing Bonus% / ${mainStatLabel}`;
  } else if (tags.includes('Shielder') && scaling.isPureSupport) {
    circlet = `${mainStatLabel} (CRIT Rate if Favonius)`;
  } else if (scaling.isNonCrit || (scaling.primaryStatKey === 'eleMas' && role !== 'On-Field Carry')) {
    circlet = scaling.primaryStatKey === 'eleMas' ? 'EM' : mainStatLabel;
  }

  const sTier = [];
  const aTier = [];
  const situational = [];

  if (!scaling.isNonCrit && !scaling.isPureSupport) {
    sTier.push('CRIT Rate', 'CRIT DMG');
  }
  sTier.push(mainStatLabel === 'ER%' ? 'ER%' : mainStatLabel);
  if ((analysis?.burstCost || 60) >= 70 || role !== 'On-Field Carry') {
    if (!sTier.includes('ER%')) sTier.push('ER% (until cap)');
  } else {
    aTier.push('ER%');
  }

  if (scaling.secondaryStats.includes('EM') && !sTier.includes('EM')) {
    aTier.push('Elemental Mastery');
  }
  if (scaling.primaryStatKey === 'hp_' || scaling.primaryStatKey === 'def_') {
    situational.push(scaling.primaryStatKey === 'hp_' ? 'Flat HP' : 'Flat DEF');
  } else if (!scaling.isPureSupport) {
    if (!sTier.includes('ATK%') && !aTier.includes('ATK%')) aTier.push('ATK%');
    situational.push('Flat ATK');
  }
  if (tags.includes('Shielder') || isHealer) {
    if (!sTier.includes('CRIT Rate') && !aTier.includes('CRIT Rate (Favonius)')) {
      situational.push('CRIT Rate (Favonius)');
    }
  }

  return {
    scaling,
    mainStats: { sands, goblet, circlet },
    substats: {
      sTier: [...new Set(sTier)],
      aTier: [...new Set(aTier)],
      situational: [...new Set(situational)]
    }
  };
}

// ============================================================================
// Context-Aware 4-Stage Pipeline (Dossier + Teams Lab)
// ============================================================================

function extractTalentDuration(talent) {
  if (!talent?.multipliers) return 0;
  const durKey = Object.keys(talent.multipliers).find((k) => /duration/i.test(k) && !/cd|cooldown/i.test(k));
  if (!durKey) return 0;
  const arr = talent.multipliers[durKey];
  return parsePrimaryMultiplierNumber(Array.isArray(arr) ? arr[0] : arr) || 0;
}

function extractTalentCd(talent) {
  if (!talent?.multipliers) return 0;
  const cdKey = Object.keys(talent.multipliers).find((k) => /^(?:cd|cooldown)$/i.test(k));
  if (!cdKey) return 0;
  const arr = talent.multipliers[cdKey];
  return parsePrimaryMultiplierNumber(Array.isArray(arr) ? arr[0] : arr) || 0;
}

/**
 * Stage 1: Builds a deterministic, context-aware KitProfile contract.
 * Accepts optional contextOverride from Teams Lab:
 *   { forcedRole, effectiveElement, teamErReq, externalInfusion, hasTeamPoise, erReport }
 */
export function buildKitProfile(charData, contextOverride = {}) {
  const charKey = charData?.key || charData?.charKey || '';
  const kitData = charData?.kitData || charData || null;
  const constellation = Number(charData?.constellation) || 0;
  const talentLevels = charData?.talent || null;
  const meta = getCharacterMeta(charKey);
  const kqm = getKqmEntry(charKey);

  const analysis = analyzeCharacterKit(charKey, kitData, talentLevels, constellation);
  const scaling = extractKitScaling(charKey, kitData, analysis);
  const roleInfo = analysis.roleInfo || {};

  const talents = kitData?.talents || [];
  const tSkill = talents.find((t) => t.kind === 'skill');
  const tBurst = talents.find((t) => t.kind === 'burst');

  let fieldRole = contextOverride.forcedRole || roleInfo.fieldRole || 'Quickswap Support';
  if (!contextOverride.forcedRole && roleInfo.hasInfusion && fieldRole === 'Quickswap Support') {
    fieldRole = 'On-Field Carry';
  }
  const nativeElement = meta?.element || 'Physical';
  const damageElement = contextOverride.effectiveElement || nativeElement;
  const weaponType = meta?.weaponType || 'Sword';
  const burstCost = Number(kitData?.burstCost) || 60;
  const skillCd = extractTalentCd(tSkill);
  const skillDuration = extractTalentDuration(tSkill);
  const burstDuration = extractTalentDuration(tBurst);
  const skillParticles = kqm?.particlesPerCast ? parsePrimaryMultiplierNumber(kqm.particlesPerCast) || 0 : 0;

  // Detect whether on-field attacks scale off Normal (A) talent or Skill/Burst stance multipliers
  const stanceMultText = [tSkill, tBurst]
    .filter(Boolean)
    .flatMap((t) => Object.keys(t.multipliers || {}))
    .join(' ');
  const hasStanceMultipliers = /1-hit\s*dmg|musou\s*isshin|pactsworn|raging\s*tide/i.test(stanceMultText);
  let infusionType = 'none';
  if (contextOverride.externalInfusion) {
    infusionType = 'na_ca';
  } else if (fieldRole === 'On-Field Carry' || fieldRole === 'On-Field Driver') {
    infusionType = hasStanceMultipliers ? 'stance_multiplier' : 'na_ca';
  }

  const primaryScalingMap = {
    hp_: 'HP',
    def_: 'DEF',
    eleMas: 'EM',
    enerRech_: 'ER',
    atk_: 'ATK'
  };

  const kitTextForMechs = [
    ...talents.map((t) => stripMarkup(t?.description || '')),
    ...(kitData?.passives || []).map((p) => stripMarkup(p?.description || ''))
  ].join('\n');
  const kitMechanics = [];
  if (/bond\s+of\s+life/i.test(kitTextForMechs)) kitMechanics.push('bond_of_life');
  if (/nightsoul/i.test(kitTextForMechs)) kitMechanics.push('nightsoul');
  if (/hp\s+(?:increases\s+or\s+decreases|decreases\s+or\s+increases|consumes?\s+[\d.]+%?\s+hp|loses?\s+hp)/i.test(kitTextForMechs)) {
    kitMechanics.push('hp_fluctuation');
  }
  if (/\blunar(?:[- ]?(?:charged|bloom|crystallize|reaction))?\b/i.test(kitTextForMechs)) kitMechanics.push('lunar');
  if (/\bhexerei\b/i.test(kitTextForMechs)) kitMechanics.push('hexerei');
  if (/stellar\s+glimmer/i.test(kitTextForMechs)) kitMechanics.push('stellar_glimmer');
  const fTags = roleInfo.functionTags || [];
  if (fTags.includes('Team Healer') || fTags.includes('Single-Target Healer')) {
    kitMechanics.push('healing_performed');
  }

  return {
    charKey,
    name: meta?.name || charKey,
    nativeElement,
    damageElement,
    weaponType,
    constellation,
    burstCost,
    skillCd,
    skillDuration,
    burstDuration,
    skillParticles,
    primaryScaling: primaryScalingMap[scaling.primaryStatKey] || 'ATK',
    primaryStatKey: scaling.primaryStatKey,
    scalingStats: scaling.scalingStats || [primaryScalingMap[scaling.primaryStatKey] || 'ATK'],
    signatureWeapon: getSignatureWeapon(charKey),
    hasChargedFocus: /charged\s+attack|frostflake|equitable\s+judgment|arataki\s+kesagiri/i.test(kitTextForMechs),
    kitMechanics,
    isNonCrit: scaling.isNonCrit,
    isPureSupport: fieldRole === 'Quickswap Support' && scaling.isPureSupport,
    infusionType,
    fieldRole,
    functionTags: roleInfo.functionTags || [],
    utilityTags: roleInfo.utilityTags || [],
    flexModes: roleInfo.flexModes || [],
    selfDurability: roleInfo.selfDurability || { selfHeal: false, selfEnergy: false, selfIR: false },
    kitTriggers: roleInfo.kitTriggers || [],
    statCaps: analysis.statCaps || [],
    usefulSubstats: analysis.usefulSubstats || [],
    teamErReq: contextOverride.teamErReq != null ? Number(contextOverride.teamErReq) : null,
    hasTeamPoise: Boolean(contextOverride.hasTeamPoise),
    erReport: contextOverride.erReport || null,
    scaling,
    analysis,
    kitData
  };
}

/**
 * Stage 2: Deterministic Talent Priority strictly derived from profile.fieldRole + profile.infusionType.
 */
export function deriveTalentPriority(profile) {
  const role = profile?.fieldRole || 'Quickswap Support';
  const infusionType = profile?.infusionType || 'none';
  const talents = profile?.kitData?.talents || [];
  const tSkill = talents.find((t) => t.kind === 'skill');
  const tBurst = talents.find((t) => t.kind === 'burst');

  const skillWeight = scoreTalentScalingWeight(tSkill);
  const burstWeight = scoreTalentScalingWeight(tBurst);
  const skillFavored = skillWeight >= burstWeight;

  if ((role === 'On-Field Carry' || role === 'On-Field Driver') && infusionType === 'na_ca') {
    return {
      tiers: { auto: 'high', skill: skillFavored ? 'high' : 'medium', burst: skillFavored ? 'medium' : 'high' },
      orderText: skillFavored
        ? 'Normal (A) ≈ Skill (E) ≥ Burst (Q)'
        : 'Normal (A) ≈ Burst (Q) ≥ Skill (E)',
      lowValueNote: 'Infused Normal/Charged Attacks drive on-field damage — prioritize Normal (A) alongside core abilities.'
    };
  }

  if (role === 'On-Field Carry' || role === 'On-Field Driver') {
    return {
      tiers: { auto: 'low', skill: skillFavored ? 'high' : 'medium', burst: skillFavored ? 'medium' : 'high' },
      orderText: skillFavored
        ? 'Skill (E) / Burst (Q) > Normal (A)'
        : 'Burst (Q) / Skill (E) > Normal (A)',
      lowValueNote: 'Stance attacks scale off Skill/Burst multipliers; Normal (A) can remain Lv.1–6.'
    };
  }

  if (role === 'Off-Field Sub-DPS') {
    return {
      tiers: { auto: 'low', skill: skillFavored ? 'high' : 'medium', burst: skillFavored ? 'medium' : 'high' },
      orderText: skillFavored
        ? 'Skill (E) > Burst (Q) >> Normal (A)'
        : 'Burst (Q) > Skill (E) >> Normal (A)',
      lowValueNote: 'Off-field damage scales off Skill & Burst; Normal (A) can remain Lv.1–6.'
    };
  }

  // Quickswap Support / Healer / Shielder
  const skillSupport = /heal|shield|absorption|bonus|buff/i.test((tSkill?.labels || []).join(' '));
  const burstSupport = /heal|shield|absorption|bonus|buff/i.test((tBurst?.labels || []).join(' '));
  const eFirst = skillSupport && !burstSupport ? true : !skillSupport && burstSupport ? false : skillFavored;
  return {
    tiers: { auto: 'low', skill: eFirst ? 'high' : 'medium', burst: eFirst ? 'medium' : 'high' },
    orderText: eFirst
      ? 'Skill (E) > Burst (Q) >> Normal (A)'
      : 'Burst (Q) > Skill (E) >> Normal (A)',
    lowValueNote: 'Normal (A) is a low-value Mora sink — leave at Lv.1.'
  };
}

const SIGNATURE_WEAPONS = {
  Ganyu: "Amos' Bow",
  Keqing: 'Mistsplitter Reforged',
  Xilonen: 'Peak Patrol Song',
  Alhaitham: 'Light of Foliar Incision',
  SangonomiyaKokomi: 'Everlasting Moonglow',
  Zhongli: 'Vortex Vanquisher',
  RaidenShogun: 'Engulfing Lightning',
  Furina: 'Splendor of Tranquil Waters',
  Neuvillette: 'Tome of the Eternal Flow',
  Arlecchino: "Crimson Moon's Semblance",
  HuTao: 'Staff of Homa',
  Yelan: 'Aqua Simulacra',
  KaedeharaKazuha: 'Freedom-Sworn',
  Nahida: 'A Thousand Floating Dreams',
  Eula: 'Song of Broken Pines',
  Navia: 'Verdict',
  Clorinde: 'Absolution',
  Chiori: 'Uraku Misugiri',
  Mavuika: 'A Thousand Blazing Suns',
  KamisatoAyaka: 'Mistsplitter Reforged',
  KamisatoAyato: 'Haran Geppaku Futsu',
  Yoimiya: 'Thundering Pulse',
  Xiao: 'Primordial Jade Winged-Spear',
  AratakiItto: 'Redhorn Stonethresher',
  Tartaglia: 'Polar Star',
  Lyney: 'The First Great Magic',
  Tighnari: "Hunter's Path",
  Nilou: 'Key of Khaj-Nisut',
  Baizhu: "Jadefall's Splendor",
  Shenhe: 'Calamity Queller',
  Wriothesley: 'Cashflow Supervision',
  Wanderer: "Tulaytullah's Remembrance",
  YaeMiko: "Kagura's Verity",
  Cyno: 'Staff of the Scarlet Sands',
  Venti: 'Elegy for the End',
  Kinich: 'Fang of the Mountain King',
  Mualani: "Surf's Up",
  Chasca: "Astral Vulture's Crimson Plumage",
  Citlali: "Starcaller's Watch",
  Escoffier: 'Symphonist of Scents',
  Skirk: 'Azurelight'
};

export function getSignatureWeapon(charKey) {
  if (!charKey) return '';
  if (SIGNATURE_WEAPONS[charKey]) return SIGNATURE_WEAPONS[charKey];
  const lower = String(charKey).toLowerCase();
  const match = Object.entries(SIGNATURE_WEAPONS).find(([k]) => k.toLowerCase() === lower);
  return match ? match[1] : '';
}

function getEffectiveRefinement(cand, ownedMatch = null) {
  if (ownedMatch?.refinement) return Math.min(5, Math.max(1, Number(ownedMatch.refinement) || 1));
  return Number(cand?.rarity) === 3 ? 5 : 1;
}

/**
 * Stage 3: Single-pass linear weapon scorer returning strictly 4 unique slots:
 *   BiS DPS, Accessible DPS, BiS Support, Accessible Support
 * Ordered DPS pair first for Carries/Drivers/Sub-DPS, Support pair first for Supports.
 */
export function recommendWeapons(
  profile,
  weaponsIndex = null,
  armory = [],
  getWeaponMetaFn = null,
  getWeaponStatsFn = null
) {
  const weaponType = profile?.weaponType || 'Sword';
  const role = profile?.fieldRole || 'Quickswap Support';
  const tags = profile?.functionTags || [];
  const isHealer = tags.includes('Team Healer') || tags.includes('Single-Target Healer');
  const isShielder = tags.includes('Shielder');
  const isSupportRole = role === 'Quickswap Support' || isHealer || isShielder;
  const burstCost = profile?.burstCost || 60;
  const erReport = profile?.erReport || null;
  const erBelowTarget = profile?.teamErReq
    ? (erReport?.currentEr || 100) < profile.teamErReq
    : erReport
      ? Number(erReport.erDelta) < 0
      : burstCost >= 70 && (role === 'Off-Field Sub-DPS' || role === 'Quickswap Support');

  const ownedByKey = new Map();
  for (const w of armory || []) {
    const k = String(w.key || '').toLowerCase();
    if (!k) continue;
    const prev = ownedByKey.get(k);
    if (!prev || (Number(w.level) || 0) > (Number(prev.level) || 0) || (Number(w.refinement) || 1) > (Number(prev.refinement) || 1)) {
      ownedByKey.set(k, w);
    }
  }

  const indexPool = (Array.isArray(weaponsIndex) && weaponsIndex.length ? weaponsIndex : getWeaponsIndex()).filter(
    (w) => w.weaponType === weaponType
  );
  const poolKeys = new Set(indexPool.map((w) => String(w.key || '').toLowerCase()));
  const extraOwned = [];
  for (const [kLower, w] of ownedByKey.entries()) {
    if (poolKeys.has(kLower)) continue;
    const wMeta = getWeaponMetaFn ? getWeaponMetaFn(w.key) : null;
    const liveStats = getWeaponStatsFn ? getWeaponStatsFn(w.key) : null;
    if ((wMeta?.weaponType || liveStats?.weaponType || '') !== weaponType) continue;
    const substat = liveStats?.substatKey || wMeta?.substat || 'ATK%';
    extraOwned.push({
      key: w.key,
      name: wMeta?.name || w.key,
      weaponType,
      rarity: Number(wMeta?.rarity || liveStats?.rarity || 4),
      baseAtk: Number(liveStats?.baseAtk || 510),
      substat,
      substatValue: '',
      mechanicTags: []
    });
  }

  const scalingStatsSet = new Set(profile?.scalingStats || [profile?.primaryScaling || 'ATK']);
  const kitMechsSet = new Set(profile?.kitMechanics || []);
  const erNeedGate = Math.max(0, burstCost - 40) / 40;

  const scored = [...indexPool, ...extraOwned].map((cand) => {
    const substat = cand.substat || 'ATK%';
    const mTags = new Set(cand.mechanicTags || []);
    const reqMechs = cand.requiresMechanics || [];
    const missingMechanic = reqMechs.some((m) => !kitMechsSet.has(m));
    const lowerName = String(cand.name || '').toLowerCase();
    const isFavonius = lowerName.includes('favonius');
    const isTtds = lowerName.includes('thrilling tales');
    const isHpSubstat = /hp/i.test(substat);
    const isDefSubstat = /def/i.test(substat);
    const isHpWeapon = mTags.has('hp_scale') || isHpSubstat;
    const isDefWeapon = mTags.has('def_scale') || isDefSubstat;
    const isEmWeapon = mTags.has('em_scale') || /mastery|em/i.test(substat);
    const isErWeapon = mTags.has('er_battery') || /energy\s*recharge/i.test(substat);
    const isCritWeapon = /crit/i.test(substat);
    const isHealerLocked = (mTags.has('healer_trigger') || reqMechs.includes('healing_performed')) && !isHealer;
    const emPassiveMismatch = mTags.has('em_scale') && !scalingStatsSet.has('EM');

    const rarityBase = cand.rarity === 5 ? 16 : cand.rarity === 4 ? 12 : 6;
    const ownedMatch = ownedByKey.get(String(cand.key || '').toLowerCase()) || null;
    const ownedBonus = ownedMatch ? 8 : 0;
    const effectiveRef = getEffectiveRefinement(cand, ownedMatch);
    const substatMag = parsePrimaryMultiplierNumber(cand.substatValue) || 0;

    // --- Linear DPS Score ---
    let dpsScore = rarityBase + ownedBonus + Math.min(4, effectiveRef - 1) + (missingMechanic ? -25 : 0);
    let dpsPrimaryPts = 0;
    let dpsHybridPts = 0;
    let dpsCritPts = 0;
    let dpsErPts = 0;

    if (profile.primaryStatKey === 'hp_') dpsPrimaryPts += isHpWeapon ? 30 : 0;
    else if (isHpSubstat && !scalingStatsSet.has('HP')) dpsScore -= 35;

    if (profile.primaryStatKey === 'def_') dpsPrimaryPts += isDefWeapon ? 30 : 0;
    else if (isDefSubstat && !scalingStatsSet.has('DEF')) dpsScore -= 35;

    if (profile.primaryStatKey === 'eleMas') dpsPrimaryPts += isEmWeapon ? 28 : 0;
    else if (profile.primaryStatKey === 'atk_' && /atk/i.test(substat)) dpsPrimaryPts += 14;

    // Additive conversion / dual-scaling bonus (e.g. Zhongli A4 HP->DMG, Itto DEF->ATK, Alhaitham EM->DMG)
    const isDualHpScaler = profile.primaryStatKey !== 'hp_' && scalingStatsSet.has('HP') && isHpWeapon;
    const isDualDefScaler = profile.primaryStatKey !== 'def_' && scalingStatsSet.has('DEF') && isDefWeapon;
    const isDualEmScaler = profile.primaryStatKey !== 'eleMas' && scalingStatsSet.has('EM') && isEmWeapon;
    if (isDualHpScaler) dpsHybridPts += isCritWeapon ? 28 : 22;
    if (isDualDefScaler) dpsHybridPts += isCritWeapon ? 28 : 22;
    if (isDualEmScaler) dpsHybridPts += 22;

    if (!profile.isNonCrit && isCritWeapon) dpsCritPts += 28;
    if (mTags.has('elem_dmg')) dpsPrimaryPts += 14;
    if (profile.primaryStatKey === 'atk_') {
      const baseAtkPts = Math.round((Math.max(350, Number(cand.baseAtk) || 454) - 350) * 0.14);
      dpsPrimaryPts += baseAtkPts;
    }
    if (!emPassiveMismatch) {
      if ((role === 'On-Field Carry' || role === 'On-Field Driver') && mTags.has('na_ca_dmg')) {
        dpsPrimaryPts += 18;
      }
      if (mTags.has('ca_dmg') && (profile.hasChargedFocus || role === 'On-Field Carry')) {
        dpsPrimaryPts += profile.hasChargedFocus ? 18 : 12;
      }
      if (mTags.has('atk_buff') && scalingStatsSet.has('ATK')) {
        dpsPrimaryPts += 10;
      }
      if (profile.scaling?.damageSources?.includes('Elemental Skill') && mTags.has('skill_dmg')) dpsPrimaryPts += 12;
      if (profile.scaling?.damageSources?.includes('Elemental Burst') && mTags.has('burst_dmg')) dpsPrimaryPts += 12;
    } else {
      dpsScore -= 10;
    }
    const isSignature = Boolean(profile.signatureWeapon && cand.name === profile.signatureWeapon);
    if (isSignature && !missingMechanic && !isHealerLocked) {
      if (!isSupportRole) dpsPrimaryPts += 12;
    }
    if (role === 'Off-Field Sub-DPS' && mTags.has('na_ca_dmg') && !mTags.has('burst_dmg') && !mTags.has('skill_dmg')) {
      dpsScore -= 10;
    }
    if (!isHealerLocked && isErWeapon && erNeedGate > 0) dpsErPts += Math.round(10 * erNeedGate);
    if (isHealerLocked) dpsScore -= 20;
    if (isTtds || (isFavonius && role === 'On-Field Carry')) dpsScore -= 25;

    dpsScore += dpsPrimaryPts + dpsHybridPts + dpsCritPts + dpsErPts;

    const dpsFactors = [
      { key: 'hybrid_scale', pts: dpsHybridPts },
      { key: 'crit_stick', pts: dpsCritPts },
      { key: 'er_threshold', pts: dpsErPts },
      { key: 'primary_scale', pts: dpsPrimaryPts }
    ].sort((a, b) => b.pts - a.pts);
    const dpsWinningFactor = dpsFactors[0].pts > 0 ? dpsFactors[0].key : 'primary_scale';

    // --- Linear Support Score: Zero rarity/Base-ATK penalty; pure utility + substat magnitude + ER gate ---
    let teamUtilityScore = 0;
    let partyBuffPts = 0;
    let teamParticlesPts = 0;
    let skillResetPts = 0;

    if (!isHealerLocked && !missingMechanic && (mTags.has('party_buff') || isTtds)) {
      partyBuffPts = 34 + (isTtds && effectiveRef >= 5 ? 6 : Math.min(4, effectiveRef - 1));
    }
    if (isFavonius) teamParticlesPts = 30 + Math.min(4, effectiveRef - 1);
    if (mTags.has('skill_reset')) {
      skillResetPts =
        28 +
        (profile.skillCd >= 15 && profile.skillParticles >= 4 ? 12 : profile.skillCd >= 15 ? 6 : 0) +
        Math.min(4, effectiveRef - 1);
    }
    teamUtilityScore = partyBuffPts + teamParticlesPts + skillResetPts;

    let defensiveScalingScore = 0;
    if ((isShielder || isHealer) && !isHealerLocked) {
      const magPts = Math.round(substatMag * 0.25);
      if (scalingStatsSet.has('HP') && isHpWeapon) defensiveScalingScore += 30 + (isHpSubstat ? magPts : 0);
      if (scalingStatsSet.has('DEF') && isDefWeapon) defensiveScalingScore += 30 + (isDefSubstat ? magPts : 0);
      if (scalingStatsSet.has('EM') && isEmWeapon) defensiveScalingScore += 22;
      if (isHealer && mTags.has('healer_utility')) defensiveScalingScore += 18;
    }

    // Penalize non-matching HP/DEF substat weapons on non-HP/DEF characters (except TTDS) & missing mechanic prerequisites
    let compatPenalty = (isHealerLocked ? -20 : 0) + (missingMechanic ? -25 : 0);
    if (!scalingStatsSet.has('HP') && isHpSubstat && !isTtds) compatPenalty -= 35;
    if (!scalingStatsSet.has('DEF') && isDefSubstat) compatPenalty -= 35;

    const erThresholdPts = !isHealerLocked && isErWeapon ? Math.round((24 + (erBelowTarget ? 8 : 0)) * erNeedGate) : 0;
    const sigSupportBonus = isSignature && !missingMechanic && !isHealerLocked && isSupportRole ? 12 : 0;
    const supportScore = ownedBonus + teamUtilityScore + defensiveScalingScore + erThresholdPts + sigSupportBonus + compatPenalty;

    const supFactors = [
      { key: 'party_buff', pts: partyBuffPts },
      { key: 'team_particles', pts: teamParticlesPts },
      { key: 'skill_reset', pts: skillResetPts },
      { key: 'defensive_scale', pts: defensiveScalingScore },
      { key: 'er_threshold', pts: erThresholdPts }
    ].sort((a, b) => b.pts - a.pts);
    const supWinningFactor = supFactors[0].pts > 0 ? supFactors[0].key : 'party_buff';

    return {
      ...cand,
      substat,
      effectiveRefinement: effectiveRef,
      isSignature,
      dpsScore,
      supportScore,
      dpsWinningFactor,
      supWinningFactor,
      ownedMatch
    };
  });

  const usedKeys = new Set();
  const pickTop = (sortedList, tierLabel, factorProp) => {
    const found = sortedList.find((w) => !usedKeys.has(w.key));
    if (!found) return null;
    usedKeys.add(found.key);
    return {
      ...found,
      tierLabel,
      winningFactor: found[factorProp],
      reason: buildWeaponReason(found, found[factorProp])
    };
  };

  function buildWeaponReason(w, factor) {
    const statText = `${w.substatValue ? `${w.substatValue} ` : ''}${w.substat}`;
    switch (factor) {
      case 'party_buff':
        return `Grants teamwide party buffs (${statText} utility).`;
      case 'team_particles':
        return `Generates white particles for the party on CRIT (${statText}).`;
      case 'skill_reset':
        return `Resets ${profile.skillCd ? `${profile.skillCd}s ` : ''}Skill CD for extra particles & uptime.`;
      case 'defensive_scale': {
        const job = isShielder && isHealer ? 'Shield & Healing' : isShielder ? 'Shield absorption' : 'Healing';
        return `Boosts ${job} via ${statText}.`;
      }
      case 'hybrid_scale':
        return `Dual-scales with ${[...scalingStatsSet].join(' + ')} (${statText}).`;
      case 'crit_stick':
        return `Top CRIT stat-stick (${statText}) for ${profile.primaryScaling} damage.`;
      case 'er_threshold':
        return `Meets ${burstCost}-cost Burst ER threshold (${statText}).`;
      default:
        return `${statText} aligned with ${profile.primaryScaling} kit.`;
    }
  }

  const isAccessible = (w) =>
    w.rarity <= 4 &&
    (Boolean(w.ownedMatch) || w.acquisition === 'f2p_craft_fish' || w.acquisition === 'gacha_4' || !w.acquisition);

  const byDps = [...scored].sort((a, b) => b.dpsScore - a.dpsScore || b.rarity - a.rarity || a.name.localeCompare(b.name));
  const byDpsAcc = byDps.filter(isAccessible);
  const bySup = [...scored].sort((a, b) => b.supportScore - a.supportScore || b.rarity - a.rarity || a.name.localeCompare(b.name));
  const bySupAcc = bySup.filter(isAccessible);

  const bisDps = pickTop(byDps, 'BiS DPS', 'dpsWinningFactor');
  const accDps = pickTop(byDpsAcc, 'Accessible DPS', 'dpsWinningFactor');
  const bisSup = pickTop(bySup, 'BiS Support', 'supWinningFactor');
  const accSup = pickTop(bySupAcc, 'Accessible Support', 'supWinningFactor');

  const ordered = isSupportRole ? [bisSup, accSup, bisDps, accDps] : [bisDps, accDps, bisSup, accSup];
  return ordered.filter(Boolean);
}

/**
 * Legacy wrapper delegating to buildKitProfile + recommendWeapons.
 */
export function recommendWeaponsForCharacter(
  charKey,
  kitData,
  kitAnalysis = null,
  accountWeapons = [],
  getWeaponMetaFn = null,
  getWeaponStatsFn = null,
  erReport = null
) {
  const profile = buildKitProfile({ key: charKey, kitData }, { erReport });
  return recommendWeapons(profile, getWeaponsIndex(), accountWeapons, getWeaponMetaFn, getWeaponStatsFn);
}

/**
 * Stage 4: Single-pass pipeline orchestrator for Character Dossier & Teams Lab.
 */
export function evaluateCharacterBuild(charData, contextOverride = {}) {
  const profile = buildKitProfile(charData, contextOverride);
  const talentPriority = deriveTalentPriority(profile);
  const guidelines = getBuildStatGuidelines(profile.charKey, profile.kitData, profile.analysis);
  const weaponRecommendations = recommendWeapons(
    profile,
    contextOverride.weaponsIndex || getWeaponsIndex(),
    contextOverride.armory || [],
    contextOverride.getWeaponMetaFn || null,
    contextOverride.getWeaponStatsFn || null
  );
  return {
    profile,
    talentPriority,
    guidelines,
    weaponRecommendations,
    erVerdict: profile.erReport || null
  };
}
