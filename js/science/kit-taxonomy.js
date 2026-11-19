import { getCharacterMeta, getKqmEntry } from '../catalog.js?v=20261115ag';
import { calcTalentUpgradeCost } from '../calculations.js?v=20261114w';

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

export { parseFirstNumber, stripMarkup };

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
    /(?:restores?|regenerates?|heals?)[^.]{0,80}\bHP\b|healing\s+(?:nearby\s+)?(?:active\s+)?(?:characters?|allies|party\s+members)/i.test(
      s
    )
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
  if (/res\s+(?:is\s+decreased|will\s+decrease)|decreases?\s+(?:opponents'?\s+)?(?:elemental\s+|physical\s+|all\s+)?res/i.test(nonNormalText)) {
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

  const hasCritAscension = /crit/i.test(meta?.ascensionStat || kitData?.ascensionStat || '');
  let fieldRole = 'On-Field Carry';
  if (isNightsoulSamplerSupport && hasPartyHeal) {
    // e.g. Xilonen in >=2 PHEC teams, Jean, Xianyun: quick-tap support even if NA/Plunge has elemental hits
    fieldRole = 'Quickswap Support';
  } else if ((hasInfusion || hasChargedCarryFocus) && !isDriverArchetype) {
    fieldRole = 'On-Field Carry';
  } else if (hasOffField && !usesNormalAttack) {
    fieldRole = 'Off-Field Sub-DPS';
  } else if (isDriverArchetype && usesNormalAttack) {
    fieldRole = 'On-Field Driver';
  } else if (
    (functionTags.length > 0 || hasPartyHeal || hasShield) &&
    !(hasCritAscension && !hasPartyHeal && !hasShield && !functionTags.some((t) => /Buffer|RES Shred/i.test(t)))
  ) {
    fieldRole = 'Quickswap Support';
  } else {
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
  } else if (normChar === 'sandrone') {
    fieldRole = 'On-Field Carry';
  } else if (normChar === 'bennett') {
    fieldRole = 'Quickswap Support';
  } else if (normChar === 'beidou') {
    fieldRole = 'Off-Field Sub-DPS';
    if (!functionTags.includes('Parry')) functionTags.unshift('Parry');
    const shieldIdx = functionTags.indexOf('Shielder');
    if (shieldIdx >= 0) functionTags[shieldIdx] = 'C1 Shield';
    else functionTags.push('C1 Shield');
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
  const cleanFullText = stripMarkup(fullText);
  const defHits = (cleanFullText.match(/\bdef\b/gi) || []).length;
  const emHits = (cleanFullText.match(/\belemental\s+mastery\b/gi) || []).length;
  const hasDefToAtkConv =
    /atk\s+bonus[^.]{0,60}\bdef\b|converts?[^.]{0,60}\bdef\b[^.]{0,60}\batk\b|increases?[^.]{0,40}\batk\b[^.]{0,60}based\s+on[^.]{0,30}\bdef\b/i.test(
      cleanFullText
    );
  const hasHpToAtkConv =
    /atk\s+bonus[^.]{0,60}max\s*hp|converts?[^.]{0,60}hp[^.]{0,60}\batk\b|increases?[^.]{0,40}\batk\b[^.]{0,60}based\s+on[^.]{0,30}max\s*hp/i.test(
      cleanFullText
    );

  let primaryScaling = 'ATK';
  let usefulSubstats = ['atk_', 'critRate_', 'critDMG_', 'enerRech_'];

  if (isNonCrit) {
    primaryScaling = hpHits >= 2 && hasHpScaling ? 'HP (Non-Crit)' : 'ATK (Non-Crit)';
    usefulSubstats = hpHits >= 2 && hasHpScaling ? ['hp_', 'enerRech_', 'hp', 'eleMas'] : ['atk_', 'enerRech_', 'atk', 'eleMas'];
  } else if (hasDefToAtkConv || (defHits >= 3 && defHits >= hpHits)) {
    primaryScaling = 'DEF';
    usefulSubstats = ['def_', 'critRate_', 'critDMG_', 'enerRech_'];
  } else if (hasHpToAtkConv || (hpHits >= 3 && hasHpScaling)) {
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

  const cleanPassiveText = stripMarkup(
    [...passives, ...(Array.isArray(kitData?.passiveTalents) ? kitData.passiveTalents : [])]
      .map((p) => `${p?.name || ''} ${p?.description || ''}`)
      .join('\n')
  );
  let archetypeLock = null;
  if (
    /(?:when\s+the\s+party|all\s+party\s+members|only\s+hydro\s+(?:and|or)\s+cryo|hydro\s+and\s+cryo\s+characters?|1\/2\/3\/4\s+hydro\s+or\s+cryo)[^.]{0,180}(?:res|shred|decreas|heal|dmg|freeze|cold)/i.test(
      cleanPassiveText
    ) ||
    /(?:hydro|cryo)[^.]{0,60}(?:and|or)[^.]{0,60}(?:cryo|hydro)[^.]{0,140}(?:res\s*(?:is\s*)?decreas|res\s*shred|resistance)/i.test(
      cleanPassiveText
    )
  ) {
    archetypeLock = 'Freeze-Core';
  } else if (
    /(?:pyro\s+(?:and|or)\s+electro|electro\s+(?:and|or)\s+pyro)[^.]{0,160}(?:party\s+members|overload|res|decreas|only)/i.test(
      cleanPassiveText
    ) ||
    /all\s+party\s+members[^.]{0,80}(?:pyro|electro)[^.]{0,80}(?:electro|pyro)/i.test(cleanPassiveText)
  ) {
    archetypeLock = 'Overload-Core';
  } else if (
    /bountiful\s+core/i.test(cleanPassiveText) ||
    /(?:dendro\s+(?:and|or)\s+hydro|hydro\s+(?:and|or)\s+dendro)[^.]{0,160}(?:party\s+members|bloom|golden\s+chalice|only)/i.test(
      cleanPassiveText
    )
  ) {
    archetypeLock = 'Bloom-Core';
  }

  const hasStellarGlimmer =
    /stellar[\s-]*(?:glimmer|conduct|swirl|vortex|linchpin)|polestar\s+field/i.test(cleanFullText);

  return {
    charKey,
    isNonCrit,
    primaryScaling,
    usefulSubstats,
    statCaps,
    roleInfo,
    archetypeLock,
    hasStellarGlimmer,
    burstCost: Number(kitData?.burstCost) || 60
  };
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


export { parsePrimaryMultiplierNumber };

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
  let skillBurstAtkHits = 0;
  let hpCoreMultHits = 0;
  let erHits = 0;

  for (const m of multEntries) {
    const combined = `${m.label} ${m.sample}`;
    if (/\binherited\s+hp\b|\bendurance\b/i.test(m.label)) continue;
    if (/\b(?:max\s*)?hp\b/i.test(combined)) {
      hpHits += m.kind === 'normal' ? 1 : 2;
      if (m.kind !== 'normal' || /equitable\s+judgment/i.test(m.label)) hpCoreMultHits += 1;
    } else if (/\bdef\b/i.test(combined)) {
      defHits += m.kind === 'normal' ? 1 : 2;
    } else if (/\belemental\s+mastery\b|\bem\b/i.test(combined)) {
      emHits += 2;
    } else if (/%/.test(m.sample) && !/duration|cd|cooldown|cost|stamina/i.test(m.label)) {
      atkHits += 1;
      if (m.kind !== 'normal') skillBurstAtkHits += 1;
    }
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
    /(?:dmg|damage|attack|atk|skill|burst|heal|shield|absorption|bonus)[^.]{0,90}(?:increased\s+by|based\s+on|equal\s+to|of)\s+(?:[\d.]+%\s+of\s+)?(?:[A-Za-z'’]+\s+|her\s+|his\s+|their\s+)?(max\s*hp|\bdef\b|elemental\s+mastery)/i;
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
  const hasStatToAtkConversion =
    /atk\s+bonus[^.]{0,60}(?:max\s*hp|\bdef\b)|converts?[^.]{0,60}(?:hp|\bdef\b)[^.]{0,60}\batk\b|increases?[^.]{0,40}\batk\b[^.]{0,60}based\s+on[^.]{0,30}(?:max\s*hp|\bdef\b)/i.test(
      fullText
    );
  const isPureHpCore = primaryShort === 'HP' && !hasStatToAtkConversion && hpCoreMultHits >= 2;
  const isSplitAtkScaler =
    !isPureHpCore &&
    (((primaryShort === 'HP' || primaryShort === 'DEF') && (hasStatToAtkConversion || skillBurstAtkHits >= 3)) ||
      (primaryShort === 'ATK' && (conversionStats.includes('HP') || conversionStats.includes('DEF'))));

  const ascMeta = getCharacterMeta(charKey);
  const hasCritAscension = /crit/i.test(kitData?.ascensionStat || ascMeta?.ascensionStat || '');
  const finalScalingStats = [...scalingStats];
  if (!finalScalingStats.length) finalScalingStats.push('ATK');
  if (hasCritAscension && !finalScalingStats.includes('CRIT')) {
    finalScalingStats.push('CRIT');
  }

  return {
    primaryStatKey,
    primaryLabel,
    primaryDisplay,
    scalingStats: finalScalingStats,
    conversionStats,
    isSplitAtkScaler,
    damageSources,
    secondaryStats: [...new Set(secondaryStats)],
    isNonCrit,
    isPureSupport
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
export const SIGNATURE_WEAPONS = {
  // Sword
  Albedo: 'Cinnabar Spindle',
  Alhaitham: 'Light of Foliar Incision',
  'Kamisato Ayaka': 'Mistsplitter Reforged',
  KamisatoAyaka: 'Mistsplitter Reforged',
  Ayaka: 'Mistsplitter Reforged',
  'Kamisato Ayato': 'Haran Geppaku Futsu',
  KamisatoAyato: 'Haran Geppaku Futsu',
  Ayato: 'Haran Geppaku Futsu',
  Chiori: 'Uraku Misugiri',
  Clorinde: 'Absolution',
  Durin: 'Athame Artis',
  Furina: 'Splendor of Tranquil Waters',
  'Kaedehara Kazuha': 'Freedom-Sworn',
  KaedeharaKazuha: 'Freedom-Sworn',
  Kazuha: 'Freedom-Sworn',
  Keqing: 'Mistsplitter Reforged',
  Nilou: 'Key of Khaj-Nisut',
  Odette: 'Whitelake Frostfeather',
  Skirk: 'Azurelight',
  Vesna: 'Beyond the Chrysalis',
  Xilonen: { support: 'Peak Patrol Song' },
  Zibai: 'Lightbearing Moonshard',

  // Claymore
  Danica: 'Torrents of Spring',
  Dehya: 'Beacon of the Reed Sea',
  Eula: 'Song of Broken Pines',
  'Arataki Itto': 'Redhorn Stonethresher',
  AratakiItto: 'Redhorn Stonethresher',
  Itto: 'Redhorn Stonethresher',
  Kinich: 'Fang of the Mountain King',
  Mavuika: 'A Thousand Blazing Suns',
  Navia: 'Verdict',
  Sandrone: 'A Teaspoon of Transcendence',
  Varka: 'Gest of the Mighty Wolf',

  // Polearm
  Arlecchino: "Crimson Moon's Semblance",
  Cyno: 'Staff of the Scarlet Sands',
  Emilie: 'Lumidouce Elegy',
  Escoffier: 'Symphonist of Scents',
  Flins: 'Bloodsoaked Ruins',
  'Hu Tao': 'Staff of Homa',
  HuTao: 'Staff of Homa',
  Ineffa: 'Fractured Halo',
  Lohen: 'Disaster and Remorse',
  'Raiden Shogun': 'Engulfing Lightning',
  RaidenShogun: 'Engulfing Lightning',
  Shenhe: 'Calamity Queller',
  Xiao: 'Primordial Jade Winged-Spear',
  Zhongli: 'Vortex Vanquisher',

  // Bow
  Anastasya: 'Silverdawn',
  Chasca: "Astral Vulture's Crimson Plumage",
  Ganyu: "Amos' Bow",
  Linnea: 'Golden Frostbound Oath',
  Lyney: 'The First Great Magic',
  Sigewinne: 'Silvershower Heartstrings',
  Tartaglia: 'Polar Star',
  Childe: 'Polar Star',
  Tighnari: "Hunter's Path",
  Venti: { dps: 'The Daybreak Chronicles', support: 'Elegy for the End' },
  Yelan: 'Aqua Simulacra',
  Yoimiya: 'Thundering Pulse',

  // Catalyst
  Baizhu: "Jadefall's Splendor",
  Citlali: "Starcaller's Watch",
  Columbina: "Nocturne's Curtain Call",
  Klee: 'Dodoco Tales',
  Mitya: 'Starsealed Edict',
  'Sangonomiya Kokomi': 'Everlasting Moonglow',
  SangonomiyaKokomi: 'Everlasting Moonglow',
  Kokomi: 'Everlasting Moonglow',
  Lauma: "Nightweaver's Looking Glass",
  Mualani: "Surf's Up",
  Nahida: 'A Thousand Floating Dreams',
  Nefer: 'Reliquary of Truth',
  Neuvillette: 'Tome of the Eternal Flow',
  Nicole: "Angelos' Heptade",
  Varesa: 'Vivid Notions',
  Vodyanitsa: 'Hymn of the Maelstrom',
  Wanderer: "Tulaytullah's Remembrance",
  Wriothesley: 'Cashflow Supervision',
  Xianyun: "Crane's Echoing Call",
  'Yae Miko': "Kagura's Verity",
  YaeMiko: "Kagura's Verity",
  'Yumemizuki Mizuki': 'Sunny Morning Sleep-In',
  YumemizukiMizuki: 'Sunny Morning Sleep-In',
  Mizuki: 'Sunny Morning Sleep-In'
};

function lookupSignatureEntry(charKey) {
  if (!charKey) return null;
  if (Number(getCharacterMeta(charKey)?.rarity) === 4) return null;
  if (SIGNATURE_WEAPONS[charKey]) return SIGNATURE_WEAPONS[charKey];
  const norm = String(charKey).replace(/[^a-z0-9]/gi, '').toLowerCase();
  const match = Object.entries(SIGNATURE_WEAPONS).find(
    ([k]) => k.replace(/[^a-z0-9]/gi, '').toLowerCase() === norm
  );
  return match ? match[1] : null;
}

export function getSignatureWeapon(charKey, roleOrMode = '') {
  const entry = lookupSignatureEntry(charKey);
  if (!entry) return '';
  if (typeof entry === 'string') return entry;
  const r = String(roleOrMode || '').toLowerCase();
  if (r === 'dps' || r === 'on-field carry' || r === 'on-field driver') {
    return entry.dps || '';
  }
  if (r === 'support' || r === 'quickswap support') {
    return entry.support || '';
  }
  return [entry.support, entry.dps].filter(Boolean).join(' / ');
}

export function buildKitProfile(charData, contextOverride = {}) {
  const charKey = charData?.key || charData?.charKey || '';
  const kitData = charData?.kitData || charData || null;
  const constellation = Number(charData?.constellation) || 0;
  const talentLevels = charData?.talent || null;
  const meta = getCharacterMeta(charKey);
  const kqm = getKqmEntry(charKey);

  const analysis = analyzeCharacterKit(charKey, kitData, talentLevels, constellation);
  const scaling = extractKitScaling(charKey, kitData, analysis);
  analysis.isSplitAtkScaler = Boolean(scaling.isSplitAtkScaler);
  const roleInfo = analysis.roleInfo || {};

  const talents = kitData?.talents || [];
  const tSkill = talents.find((t) => t.kind === 'skill');
  const tBurst = talents.find((t) => t.kind === 'burst');

  let fieldRole = contextOverride.forcedRole || roleInfo.fieldRole || 'Quickswap Support';
  if (contextOverride.flexMode && /critkomi/i.test(contextOverride.flexMode)) {
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
  if (/stellar[\s-]*(?:glimmer|conduct|swirl|vortex|linchpin)|polestar\s+field/i.test(kitTextForMechs)) {
    kitMechanics.push('stellar_glimmer');
  }
  if (nativeElement === 'Pyro' || nativeElement === 'Dendro') {
    kitMechanics.push('burning_burgeon');
  }
  const fTags = roleInfo.functionTags || [];
  if (fTags.includes('Team Healer') || fTags.includes('Single-Target Healer')) {
    kitMechanics.push('healing_performed');
  }

  const tNormal = talents.find((t) => t.kind === 'normal');
  const normalMultKeys = Object.keys(tNormal?.multipliers || {}).join(' ');
  const isChargedSpecialist =
    /frostflake|undivided\s+heart|equitable\s+judgment|arataki\s+kesagiri|explosive\s+spark|scarlet\s+seal|prop\s+arrow|wreath\s+arrow|charged\s+attack\s+(?:dmg|crit|charging)/i.test(
      `${normalMultKeys}\n${kitTextForMechs}`
    );
  const isNormalSpecialist =
    /blazing\s+arrow|shunsuiken|windfavored|searing\s+onslaught|masque\s+of\s+the\s+red\s+death|normal\s+attack\s+(?:dmg|spd)/i.test(
      kitTextForMechs
    );
  let primaryAttackType = 'none';
  if (fieldRole === 'On-Field Carry' || fieldRole === 'On-Field Driver') {
    if (isChargedSpecialist && !isNormalSpecialist) primaryAttackType = 'charged';
    else if (isNormalSpecialist && !isChargedSpecialist) primaryAttackType = 'normal';
    else primaryAttackType = 'mixed';
  }
  if (primaryAttackType === 'charged' || primaryAttackType === 'mixed') {
    kitMechanics.push('charged_attack');
  }
  if (
    ['Pyro', 'Hydro', 'Cryo', 'Electro'].includes(nativeElement) &&
    /(?:applies|imbues?|affects?)\s+(?:the\s+active\s+character|herself|himself|themselves|self)\s+with\s+(?:pyro|hydro|cryo|electro)/i.test(
      kitTextForMechs
    )
  ) {
    kitMechanics.push('self_elemental_aura');
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
    signatureWeapon: getSignatureWeapon(charKey, fieldRole),
    signatureDpsWeapon: getSignatureWeapon(charKey, 'dps'),
    signatureSupportWeapon: getSignatureWeapon(charKey, 'support'),
    hasChargedFocus: /charged\s+attack|frostflake|equitable\s+judgment|arataki\s+kesagiri/i.test(kitTextForMechs),
    primaryAttackType,
    kitMechanics,
    isNonCrit: contextOverride.flexMode && /critkomi/i.test(contextOverride.flexMode) ? false : scaling.isNonCrit,
    isPureSupport: fieldRole === 'Quickswap Support' && scaling.isPureSupport,
    flexMode: contextOverride.flexMode || null,
    infusionType,
    fieldRole,
    archetypeLock: analysis.archetypeLock || null,
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
    combatStats: contextOverride.combatStats || null,
    teamCaps: contextOverride.teamCaps || null,
    hasEquippedArtifacts: Boolean(
      contextOverride.hasEquippedArtifacts ??
        (Array.isArray(charData?.equippedArtifacts) && charData.equippedArtifacts.length > 0)
    ),
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


/**
 * Classifies Burst ER cadence & 0-Energy start immunity:
 *   - 'shimenawa-cycle': 4pc Shimenawa's Reminiscence (Burst optional)
 *   - 'skill-core': Primary output on Skill + Burst has no mandatory team utility / off-field app (Yae, Albedo, Chiori, Varka)
 *   - 'hybrid': Skill/NA drives loop, Burst is secondary refresh/i-frame (Fischl, Keqing)
 *   - 'burst-core': Mandatory Burst dependency (Furina, Bennett, Xiangling, Xingqiu, Yelan, Raiden, Kazuha)
 */
export function classifyBurstCadence(char, kitData, kitAnalysis = null, artifacts = []) {
  const artList = Array.isArray(artifacts) && artifacts.length ? artifacts : char?.equippedArtifacts || [];
  const setCounts = {};
  for (const a of artList) {
    if (a?.setKey) setCounts[a.setKey] = (setCounts[a.setKey] || 0) + 1;
  }
  if ((setCounts.ShimenawasReminiscence || 0) >= 4) {
    return {
      mode: 'shimenawa-cycle',
      burstDependency: 'optional',
      recommendedEr: 110,
      zeroEnergyImmune: true,
      note: '4pc Shimenawa drains 15 Energy on Skill cast; Burst every ~2nd rotation.'
    };
  }

  const analysis = kitAnalysis || analyzeCharacterKit(char?.key, kitData, char?.talent, char?.constellation || 0);
  const roleInfo = analysis?.roleInfo || {};
  const role = roleInfo.fieldRole || roleInfo.primaryRole || 'Quickswap Support';
  const tags = roleInfo.functionTags || roleInfo.utilityTags || [];
  const burstCost = Number(kitData?.burstCost || analysis?.burstCost) || 60;

  const talents = kitData?.talents || [];
  const tSkill = talents.find((t) => t.kind === 'skill');
  const tBurst = talents.find((t) => t.kind === 'burst');
  const skillDesc = stripMarkup(tSkill?.description || '');
  const burstDesc = stripMarkup(tBurst?.description || '');

  const burstTeamUtility =
    /(?:all\s+(?:nearby\s+)?party\s+members|allies|allied\s+characters?|teammates?|the\s+active\s+character)[^.]{0,80}(?:dmg|atk|em|crit|heal|restore[^.]{0,30}hp|shield|infus)/i.test(
      burstDesc
    ) ||
    /(?:creates?\s+a\s+shield|shield\s+dmg\s+absorption|restores?[^.]{0,40}hp|healing\s+(?:nearby|all)|continuous(?:ly)?\s+(?:deal|attack|follow)|at\s+intervals|off-field|follows?\s+the\s+active\s+character|exquisite\s+throw|raincutter|pyronado|fanfare)/i.test(
      burstDesc
    );

  const nonSelfBurstTrigger = (roleInfo.kitTriggers || []).some(
    (t) => t.requiresBurst && !/Self Energy/i.test(t.effect || '')
  );

  const burstDur = extractTalentDuration(tBurst);
  const burstHasOffFieldPersistence =
    burstDur >= 8 ||
    /coordinated\s+attack|exquisite\s+throw|raincutter|pyronado|stormbreaker|when\s+your\s+(?:own\s+)?active\s+character|deals?\s+[^.]{0,50}\bdmg\b[^.]{0,50}(?:at\s+intervals|every|tandem|coordinated)/i.test(
      burstDesc
    );

  const burstHasRequiredUtility =
    burstTeamUtility ||
    burstHasOffFieldPersistence ||
    nonSelfBurstTrigger ||
    role === 'Quickswap Support' ||
    tags.includes('Team Healer') ||
    tags.includes('Single-Target Healer') ||
    tags.includes('Shielder');

  const skillDur = extractTalentDuration(tSkill);
  const skillHasTurretOrEntity =
    skillDur >= 8 ||
    /turret|sesshou|kitsune|solar\s+isotoma|tamoto|transient\s+blossom|at\s+intervals|continuously/i.test(skillDesc);
  const talentSkillFavored =
    Number(char?.talent?.skill || 0) >= 9 && Number(char?.talent?.burst || 0) <= 6;
  const talentAutoFavored =
    Number(char?.talent?.auto || 0) >= 9 && Number(char?.talent?.burst || 0) <= 6;

  if (!burstHasRequiredUtility && (skillHasTurretOrEntity || talentSkillFavored || talentAutoFavored)) {
    return {
      mode: 'skill-core',
      burstDependency: 'optional',
      recommendedEr: 100,
      zeroEnergyImmune: true,
      note: 'Skill-Core kit: primary output runs on Elemental Skill; Burst is an optional flex nuke (0-Energy immune).'
    };
  }

  const normKey = String(char?.key || '').toLowerCase();
  if (
    !burstHasRequiredUtility &&
    (burstCost <= 40 || normKey === 'fischl' || /oz|summon|recast|refresh/i.test(burstDesc))
  ) {
    return {
      mode: 'hybrid',
      burstDependency: 'hybrid',
      recommendedEr: 120,
      zeroEnergyImmune: true,
      note: 'Hybrid cadence: Skill/NA drives core uptime; Burst acts as secondary refresh or i-frame.'
    };
  }

  return {
    mode: 'burst-core',
    burstDependency: 'mandatory',
    recommendedEr: null,
    zeroEnergyImmune: false,
    note: 'Burst-Core kit: rotation relies on Elemental Burst uptime.'
  };
}

export const CANONICAL_ARCHETYPES = [
  'On-Field Carry',
  'Off-Field Sub-DPS',
  'Buffer / Enabler',
  'Sustain · Healer',
  'Sustain · Shielder'
];

/**
 * Decomposes a character's canonical kit into an ordered array of archetypes
 * (primary first, plus optional secondary if the kit genuinely supports dual playstyles).
 * Experimental/meme builds (e.g. Critkomi, Creative Carry) are excluded and remain scoped to Teams Lab.
 */
export function deriveCharacterArchetypes(char, kitProfile = null) {
  const charData = typeof char === 'string' ? { key: char } : char || {};
  const profile = kitProfile || buildKitProfile(charData);
  const normKey = String(profile.charKey || charData.key || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const fieldRole = profile.fieldRole || 'Quickswap Support';
  const tags = profile.functionTags || [];
  const flexModes = profile.flexModes || [];

  const isHealer = tags.includes('Team Healer') || tags.includes('Single-Target Healer');
  const isShielder = tags.includes('Shielder');
  const hasMajorOffensiveBuff = tags.some((t) =>
    /ATK Buffer|EM Buffer|DMG Buffer|DEF Buffer|Crit Buffer|Normal\/Charged Buffer|Plunge Buffer|Nightsoul Buffer/i.test(t)
  );
  const isBuffer = tags.some((t) =>
    /Buffer|RES Shred|DEF Shred|Crowd Control|Reaction Enabler|Energy Battery|Team IR/i.test(t)
  );
  const hasSubDps = tags.some((t) => /Sub-DPS/i.test(t));

  const out = [];
  const push = (arch) => {
    if (arch && CANONICAL_ARCHETYPES.includes(arch) && !out.includes(arch)) {
      out.push(arch);
    }
  };

  if (normKey === 'sangonomiyakokomi') {
    push('Sustain · Healer');
    push('Off-Field Sub-DPS');
    return out;
  }

  if (profile.archetypeLock) {
    push('Buffer / Enabler');
    if (fieldRole === 'Off-Field Sub-DPS' || hasSubDps) push('Off-Field Sub-DPS');
    if (isHealer) push('Sustain · Healer');
    if (isShielder) push('Sustain · Shielder');
    return out;
  }

  if (fieldRole === 'On-Field Carry' || fieldRole === 'On-Field Driver') {
    push('On-Field Carry');
    if (hasSubDps) push('Off-Field Sub-DPS');
    else if (isBuffer) push('Buffer / Enabler');
    else if (isShielder) push('Sustain · Shielder');
    else if (isHealer) push('Sustain · Healer');
  } else if (fieldRole === 'Off-Field Sub-DPS') {
    push('Off-Field Sub-DPS');
    if (hasMajorOffensiveBuff || isBuffer) push('Buffer / Enabler');
    else if (isHealer) push('Sustain · Healer');
    else if (isShielder) push('Sustain · Shielder');
  } else {
    // Quickswap Support
    if (isShielder && !hasMajorOffensiveBuff) {
      push('Sustain · Shielder');
      if (isBuffer) push('Buffer / Enabler');
      else if (isHealer) push('Sustain · Healer');
    } else if (isHealer && !hasMajorOffensiveBuff && !tags.includes('RES Shred')) {
      push('Sustain · Healer');
      if (hasSubDps) push('Off-Field Sub-DPS');
    } else if (isBuffer) {
      push('Buffer / Enabler');
      if (isHealer && !hasSubDps) push('Sustain · Healer');
      else if (isShielder) push('Sustain · Shielder');
    } else if (isHealer) {
      push('Sustain · Healer');
    } else if (isShielder) {
      push('Sustain · Shielder');
    } else {
      push('On-Field Carry');
    }
  }

  // Include genuine unlocked dual-playstyle flexModes (excluding Creative Carry / Critkomi / Driver)
  for (const fm of flexModes) {
    if (!fm?.unlocked) continue;
    const id = String(fm.id || '');
    if (/creative|critkomi|driver/i.test(id)) continue;
    if (id === 'On-Field Carry') push('On-Field Carry');
    else if (id === 'Off-Field Sub-DPS') push('Off-Field Sub-DPS');
    else if (id === 'Quickswap Support') push('Buffer / Enabler');
  }

  return out.length ? out : ['On-Field Carry'];
}

/**
 * Determines whether Elemental Mastery is a useful secondary utility stat (0.4 wRV / +14 weapon pts)
 * for kits that do not already scale primarily with EM.
 */
export function isUsefulSecondaryEm(profileOrAnalysis) {
  if (!profileOrAnalysis) return false;
  const charKey = profileOrAnalysis.charKey || '';
  const normKey = String(charKey).replace(/[^a-z0-9]/gi, '').toLowerCase();
  const elem =
    profileOrAnalysis.nativeElement ||
    profileOrAnalysis.damageElement ||
    getCharacterMeta(charKey)?.element ||
    '';

  if (elem === 'Geo' || elem === 'Physical' || !elem) return false;
  if (elem === 'Electro' || elem === 'Dendro') return true;
  if (elem === 'Hydro' || elem === 'Pyro' || elem === 'Cryo') {
    return profileOrAnalysis.archetypeLock !== 'Freeze-Core';
  }
  if (elem === 'Anemo') {
    // Pure raw-Anemo hypercarries (e.g. Xiao) do not value EM; Swirl/hybrid Anemo units do
    if (normKey === 'xiao') return false;
    return true;
  }
  return false;
}
