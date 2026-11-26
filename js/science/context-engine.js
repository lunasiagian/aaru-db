/**
 * Context-Aware Deployment, Vector Set Matching & Directed Pairwise Synergy Engine.
 * Pure ES module (works identically in browser and Node verification scripts).
 */

export const DEPLOYMENT_MODES = {
  abyss: {
    id: 'abyss',
    label: 'Spiral Abyss',
    shortLabel: 'Abyss (100% E)',
    startEnergy: 1.0,
    erMult: 1.0,
    burstWeight: 1.0,
    teamLockStrict: false,
    note: '100% starting Energy — steady-state rotation ER & DPS ceiling.'
  },
  stygian: {
    id: 'stygian',
    label: 'Stygian Onslaught (0E)',
    shortLabel: 'Stygian (0E)',
    startEnergy: 0.0,
    erMult: 1.45,
    burstWeight: 0.85,
    teamLockStrict: false,
    note: 'Starts at 0 Energy — heavy R1 ER tax; Favonius batteries & 0-Energy/Skill kits rise.'
  },
  theater: {
    id: 'theater',
    label: 'Imaginarium Theater',
    shortLabel: 'Theater',
    startEnergy: 1.0,
    erMult: 1.25,
    burstWeight: 0.9,
    teamLockStrict: true,
    note: 'Element-restricted draft — solo ER comfort & flexible 2pc+2pc sets favored.'
  },
  overworld: {
    id: 'overworld',
    label: 'Overworld',
    shortLabel: 'Overworld',
    startEnergy: 0.5,
    erMult: 0.75,
    burstWeight: 0.55,
    teamLockStrict: false,
    note: 'Short encounters — Skill/NA uptime & low-ER convenience beat 80-cost Bursts.'
  }
};

export const SCENARIO_MODES = {
  st: { id: 'st', label: 'Single Target', aoeMult: 1.0 },
  aoe: { id: 'aoe', label: 'AoE / Multi-Target', aoeMult: 1.85 }
};

const SUPPLY_DIMS = [
  'resShred',
  'teamHeal',
  'shield',
  'teamAtk',
  'teamEm',
  'teamDmgPct',
  'teamBaseDmg',
  'offFieldAura',
  'battery',
  'hpFluctuation',
  'crowdControl'
];

const SUPPLY_LABELS = {
  resShred: 'RES Shred',
  teamHeal: 'Team Heal',
  shield: 'Shield',
  teamAtk: 'ATK Buff',
  teamEm: 'EM Buff',
  teamDmgPct: 'DMG% Buff',
  teamBaseDmg: 'Base DMG Buff',
  offFieldAura: 'Off-Field Aura',
  battery: 'Energy Battery',
  hpFluctuation: 'HP Fluctuation',
  crowdControl: 'Grouping / CC'
};

function getEl(charKey, allProfiles, charMetaFn) {
  return allProfiles?.[charKey]?.element || charMetaFn?.(charKey)?.element || 'Unknown';
}

export function evaluateTeamConditions(charKey, profile, teamMembers = [], constellation = 0, allProfiles = {}, charMetaFn = null) {
  const statuses = [];
  if (!profile) return statuses;

  const rosterKeys = teamMembers.length ? [...new Set([charKey, ...teamMembers])] : [charKey];
  const rosterElements = rosterKeys.map((k) => getEl(k, allProfiles, charMetaFn)).filter((e) => e && e !== 'Unknown');
  const otherKeys = rosterKeys.filter((k) => k !== charKey);

  // 1. Strict teamElementLock (Skirk, Escoffier, Chevreuse, Nilou)
  if (profile.teamElementLock && otherKeys.length > 0) {
    const allowed = new Set(profile.teamElementLock.only || []);
    const foreign = rosterElements.filter((el) => !allowed.has(el));
    const minEach = Number(profile.teamElementLock.minEach || 0);
    const missingReq = [...allowed].filter((reqEl) => minEach > 0 && !rosterElements.includes(reqEl));
    const active = foreign.length === 0 && missingReq.length === 0;
    statuses.push({
      kind: 'elementLock',
      label: profile.teamElementLock.label,
      active,
      note: active
        ? 'Active with current squad elements'
        : `${profile.teamElementLock.penaltyNote}${foreign.length ? ` (Off-element: ${[...new Set(foreign)].join(', ')})` : ''}`
    });
  }

  // 2. elementCountRule (Xilonen, Lyney)
  if (profile.elementCountRule) {
    const grp = new Set(profile.elementCountRule.group || []);
    const count = otherKeys.filter((k) => grp.has(getEl(k, allProfiles, charMetaFn))).length;
    const minC = Number(profile.elementCountRule.minCount || 2);
    const active = otherKeys.length === 0 ? true : count >= minC;
    statuses.push({
      kind: 'elementCount',
      label: profile.elementCountRule.label,
      active,
      note: active
        ? otherKeys.length
          ? `${count} matching allies active`
          : 'Baseline assumes team condition is met'
        : profile.elementCountRule.fallbackNote || 'Threshold not met with current squad'
    });
  }

  // 3. Faction count thresholds (Hexerei >= 2, Moonsign >= 2)
  const factions = profile.factions || [];
  if (factions.includes('Hexerei')) {
    const hexCount = rosterKeys.filter((k) => (allProfiles?.[k]?.factions || []).includes('Hexerei')).length;
    statuses.push({
      kind: 'faction',
      label: `Hexerei: Secret Rite (${hexCount}/2)`,
      active: otherKeys.length === 0 || hexCount >= 2,
      note: hexCount >= 2 ? 'Upgraded Hexerei resonance & +40% Celestial Gift active' : 'Pair another Hexerei unit to upgrade resonance'
    });
  }
  if (factions.includes('Moonsign')) {
    const moonCount = rosterKeys.filter((k) => (allProfiles?.[k]?.factions || []).includes('Moonsign')).length;
    statuses.push({
      kind: 'faction',
      label: `Moonsign (${moonCount >= 2 ? 'Ascendant' : 'Nascent'} Gleam)`,
      active: moonCount >= 2,
      note: moonCount >= 2 ? 'Ascendant Gleam active (+30% CR Unveiling / +120 EM Serenade)' : 'Add a 2nd Moonsign unit for Ascendant Gleam'
    });
  }

  // 4. Constellation Shifts
  for (const cs of profile.constellationShifts || []) {
    const active = Number(constellation || 0) >= Number(cs.minCon || 6);
    statuses.push({
      kind: 'constellation',
      label: cs.label,
      active,
      note: active ? 'Unlocked at current constellation' : `Unlocks at C${cs.minCon}`
    });
  }

  return statuses;
}

export function applySandboxContext(charKey, profile, options = {}) {
  const {
    deploymentMode = 'abyss',
    scenarioMode = 'st',
    activeLens = '',
    activeModeId = '',
    constellation = 0,
    teamMembers = [],
    withFurina = false,
    priorityDial = 50,
    allProfiles = {},
    charMetaFn = null
  } = options;

  const modeCfg = DEPLOYMENT_MODES[deploymentMode] || DEPLOYMENT_MODES.abyss;
  const scenCfg = SCENARIO_MODES[scenarioMode] || SCENARIO_MODES.st;
  const feats = profile?.features || {};
  const baseChannels = profile?.channelShares || { direct: 1, amp: 0, additive: 0, transformative: 0, lunar_crit: 0, stellar_crit: 0 };

  // Check explicit mode override (e.g. Durin White Flame vs Dark Decay, Vodyanitsa 65k Buffer vs Sub-DPS)
  const explicitModes = profile?.explicitModes || [];
  let chosenMode = explicitModes.find((m) => m.id === activeModeId || m.lens === activeLens) || explicitModes[0] || null;
  const effectiveLens = chosenMode?.lens || activeLens || profile?.playstyleLenses?.[0]?.id || 'Quickswap Support';

  const conditionStatuses = evaluateTeamConditions(charKey, profile, teamMembers, constellation, allProfiles, charMetaFn);

  // If elementCountRule flips role (e.g. Xilonen < 2 PHEC -> On-Field Carry), reflect it unless user picked a lens
  const elemCountCond = conditionStatuses.find((c) => c.kind === 'elementCount');
  let resolvedRole = effectiveLens;
  if (!activeLens && elemCountCond && !elemCountCond.active && profile?.elementCountRule?.fallbackRole) {
    resolvedRole = profile.elementCountRule.fallbackRole;
  }

  // Effective Energy Economy in chosen Deployment Mode
  const zeroEnergy = Boolean(feats.zero_energy);
  let rawNetCost = zeroEnergy ? 0 : Math.max(0, (feats.burst_energy_cost || 60) - (feats.flat_energy_refund_est || 0));
  if (charKey === 'Yelan' && Number(constellation || 0) >= 1) {
    rawNetCost = Math.max(0, rawNetCost - 20);
  }
  const scaledCost = zeroEnergy ? 0 : Math.round(rawNetCost * modeCfg.erMult);
  const effectiveNetEnergyDemand = zeroEnergy ? 'low' : scaledCost >= 65 ? 'high' : scaledCost >= 45 ? 'moderate' : 'low';

  // Effective Damage Channels (AoE quadratic boost)
  const channels = { ...(chosenMode?.channelShares || baseChannels) };
  if (scenCfg.id === 'aoe' && feats.quadratic_aoe) {
    if (channels.transformative > 0) channels.transformative = Math.min(0.95, channels.transformative * 1.35);
    else if (channels.amp > 0) channels.amp = Math.min(0.85, channels.amp * 1.25);
    else channels.direct = Math.min(1.0, channels.direct * 1.2);
  }
  const chSum = Object.values(channels).reduce((a, b) => a + b, 0) || 1;
  for (const k of Object.keys(channels)) channels[k] = Number((channels[k] / chSum).toFixed(3));

  const reactionCritDominant = channels.lunar_crit + channels.stellar_crit >= 0.4;
  const transformativeDominant = channels.transformative >= 0.65;
  const dmgGobletDeprioritized = reactionCritDominant || transformativeDominant;
  const furinaDmgIneffective = reactionCritDominant || transformativeDominant;

  // Substat weights determined by discrete Build Mode / Lens + Damage Channels
  const weights = { ...(profile?.statWeights || {}) };
  const primaryScaler = profile?.primaryScaler || 'atk_';
  const isSupportRole = /support|healer|shield|buffer|enabler/i.test(resolvedRole) && !/sub-dps|carry|driver/i.test(resolvedRole);

  if (chosenMode?.statWeightsOverride) {
    Object.assign(weights, chosenMode.statWeightsOverride);
  } else if (transformativeDominant) {
    weights.eleMas = 1.0;
    weights.critRate_ = 0;
    weights.critDMG_ = 0;
  } else if (reactionCritDominant) {
    weights[primaryScaler] = 1.0;
    weights.critRate_ = isSupportRole ? 0.45 : 1.0;
    weights.critDMG_ = isSupportRole ? 0.45 : 1.0;
    weights.eleMas = Math.max(weights.eleMas || 0, 0.5);
  } else if (isSupportRole) {
    weights[primaryScaler] = 1.0;
    if (primaryScaler === 'hp_') weights.hp = 0.5;
    if (primaryScaler === 'def_') weights.def = 0.5;
    if (primaryScaler === 'atk_') weights.atk = 0.2;
    weights.critRate_ = 0.25;
    weights.critDMG_ = 0.25;
  } else {
    weights[primaryScaler] = 1.0;
    if (primaryScaler === 'hp_') weights.hp = Math.max(weights.hp || 0, 0.5);
    if (primaryScaler === 'def_') weights.def = Math.max(weights.def || 0, 0.5);
    if (primaryScaler === 'atk_') weights.atk = Math.max(weights.atk || 0, 0.25);
    weights.critRate_ = 1.0;
    weights.critDMG_ = 1.0;
  }

  // Base-ATK-only buffers (Bennett, Kujou Sara, Iansan) ignore ATK% substats for their team buff
  if (isSupportRole && profile?.baseAtkOnlyBuffer) {
    weights.atk_ = 0.05;
    weights.atk = 0;
  }
  if (!zeroEnergy && effectiveNetEnergyDemand === 'moderate' && (weights.enerRech_ || 0) > 0.65) {
    weights.enerRech_ = 0.65;
  }

  // Optional legacy dial override if explicitly passed != 50
  if (priorityDial !== undefined && priorityDial !== 50 && !transformativeDominant) {
    const dialT = Math.max(0, Math.min(1, Number(priorityDial) / 100));
    if (dialT <= 0.35) {
      if (profile?.statThresholdCurve?.statKey) weights[profile.statThresholdCurve.statKey] = 1.0;
      weights.critRate_ = Math.min(weights.critRate_ || 0.35, 0.35);
      weights.critDMG_ = Math.min(weights.critDMG_ || 0.35, 0.35);
    } else if (dialT >= 0.7) {
      weights.critRate_ = 1.0;
      weights.critDMG_ = 1.0;
    }
  }

  // Scenario (Single Target vs AoE Wave) modulation
  const isQuadraticOrReactionAoe = Boolean(feats.quadratic_aoe) || channels.transformative >= 0.3 || channels.stellar_crit >= 0.25;
  if (scenCfg.id === 'aoe' && isQuadraticOrReactionAoe) {
    if (!zeroEnergy) weights.enerRech_ = Math.min(1.0, Number(((weights.enerRech_ || 0.5) + 0.15).toFixed(2)));
    if (weights.eleMas > 0 || channels.transformative > 0) {
      weights.eleMas = Math.min(1.0, Number(((weights.eleMas || 0.35) + 0.2).toFixed(2)));
    }
  }

  // Deployment Mode ER modulation & Live Readout
  let erDeltaPct = 0;
  let modeLine = modeCfg.note;
  if (zeroEnergy) {
    weights.enerRech_ = 0;
    erDeltaPct = 0;
    modeLine =
      deploymentMode === 'stygian'
        ? 'Stygian Onslaught (0E): 0-Energy kit bypasses the R1 0-Energy penalty completely.'
        : `${modeCfg.label}: 0-Energy kit (no ER% required).`;
  } else if (deploymentMode === 'stygian') {
    weights.enerRech_ = effectiveNetEnergyDemand === 'high' ? 1.0 : effectiveNetEnergyDemand === 'moderate' ? 0.85 : 0.6;
    erDeltaPct = 35;
    modeLine = `Stygian Onslaught (0E): Starts at 0 Energy (+35% R1 ER target · scaled net cost ${scaledCost}).`;
  } else if (deploymentMode === 'theater') {
    weights.enerRech_ = Math.min(1.0, Math.max(weights.enerRech_ || 0.5, 0.75));
    erDeltaPct = 20;
    modeLine = 'Imaginarium Theater: Random draft teammates (+20% solo ER comfort buffer).';
  } else if (deploymentMode === 'overworld') {
    weights.enerRech_ = Math.min(weights.enerRech_ || 0.5, 0.4);
    erDeltaPct = -15;
    modeLine = 'Overworld: Short encounters (Skill/NA uptime prioritized over high-cost Burst ER).';
  } else {
    if (effectiveNetEnergyDemand === 'high') weights.enerRech_ = 1.0;
    modeLine = `Spiral Abyss: 100% starting Energy (steady-state rotation net cost ${rawNetCost}).`;
  }

  // Burst-optional On-Field Carries (e.g. Yoimiya, Wanderer, Skill-infusion NA/CA carries with low Burst share):
  // Burst is not required every rotation, so ER% is a low-priority / dead stat.
  const isBurstOptionalCarry =
    !isSupportRole &&
    !/off-field|sub-dps/i.test(resolvedRole) &&
    !zeroEnergy &&
    !feats.has_burst_hp_drain &&
    Number(feats.burst_dmg_share ?? 0.3) < 0.22 &&
    (Number(feats.na_focus_score ?? 0) >= 0.75 || Number(feats.ca_focus_score ?? 0) >= 0.75);
  if (isBurstOptionalCarry && deploymentMode !== 'stygian') {
    weights.enerRech_ = Math.min(weights.enerRech_ ?? 0.65, 0.15);
  }

  let scenarioLine = '';
  if (scenCfg.id === 'aoe') {
    if (feats.quadratic_aoe) {
      scenarioLine = 'AoE Wave: Quadratic / multi-target scaling active — elevates Burst & Reaction share (+ER/EM priority).';
    } else if (isSupportRole) {
      scenarioLine = 'AoE Wave: Target-count invariant — shield, shred & party buffs apply across multi-target waves.';
    } else {
      scenarioLine = 'AoE Wave: Primary-target kit — pair with Grouping or AoE Sub-DPS in Teams Lab for wave clear.';
    }
  } else {
    if (feats.quadratic_aoe) {
      scenarioLine = 'Single Target: Boss rotation focus (quadratic multi-target bonus dormant against 1 target).';
    } else if (isSupportRole) {
      scenarioLine = 'Single Target: Full shield, shred & buff uptime for boss rotation windows.';
    } else {
      scenarioLine = 'Single Target: Concentrated primary-target damage window.';
    }
  }

  return {
    charKey,
    deploymentMode: modeCfg,
    scenarioMode: scenCfg,
    activeLens: resolvedRole,
    activeModeId: chosenMode?.id || '',
    chosenMode,
    effectiveNetEnergyDemand,
    scaledEnergyCost: scaledCost,
    erDeltaPct,
    contextReadout: { modeLine, scenarioLine },
    effectiveChannelShares: channels,
    reactionCritDominant,
    transformativeDominant,
    dmgGobletDeprioritized,
    furinaDmgIneffective,
    withFurina: Boolean(withFurina),
    conditionStatuses,
    effectiveSubstatWeights: weights,
    supply: { ...(profile?.supply || {}), ...(chosenMode?.supplyOverrides || {}) },
    demand: { ...(profile?.demand || {}) }
  };
}

function scoreSetPrimitivesForRole(charMeta, context, setObj, roleName, kitData = null) {
  const p = setObj.primitives || {};
  const elem = String(charMeta?.element || 'Geo').toLowerCase();
  const wepType = String(charMeta?.weaponType || context.weaponType || 'Sword');
  const isSupport = /support|healer|shield|buffer|enabler/i.test(roleName);
  const isOffField = /off-field|sub-dps/i.test(roleName);
  const isOnField = !isSupport && !isOffField;
  const deployId = context.deploymentMode?.id || 'abyss';

  const ch = context.effectiveChannelShares || {};
  const burstShare = Number(context.features?.burst_dmg_share ?? 0.3);
  const skillShare = Number(context.features?.skill_dmg_share ?? 0.3);
  const naFocus = Number(context.features?.na_focus_score ?? 0.35);
  const caFocus = Number(context.features?.ca_focus_score ?? 0.3);
  const hasSkillStanceNa = Boolean(context.features?.has_skill_stance_na_combo);
  const zeroEnergy = Boolean(context.features?.zero_energy);
  const netEr = context.effectiveNetEnergyDemand || 'moderate';
  const factions = new Set(context.factions || []);
  const primaryScaler = context.primaryScaler || 'atk_';
  const fullText = [...(kitData?.talents || []), ...(kitData?.passives || [])].map((x) => x?.description || '').join(' ');
  // Strip standard Hoyoverse 3-attack infusion boilerplate ("Normal, Charged, and Plunging Attacks") so non-plunge carries
  // like Arlecchino, Alhaitham, Navia, and Mavuika never falsely trigger Plunging Attack sets (Long Night's Oath).
  const strippedPlungeText = fullText.replace(/normal,?\s*charged,?\s*(?:and\s*)?plunging\s+attacks?/gi, '');
  const charKeyNorm = String(charMeta?.key || '').toLowerCase();
  const isKnownPlungeCarry = /^(varesa|xiao|gaming)$/.test(charKeyNorm);
  const isKnownNonPlunge = /^(alhaitham|kaveh|navia|mavuika|vesna|arlecchino|clorinde|hutao|ayaka|keqing|raiden|cyno|wriothesley|skirk)$/.test(charKeyNorm);
  const hasExclusivePlungeKit =
    /jumping\s+ability|plunging\s+attack[^.]{0,50}(?:dmg|bonus|increas|crit)|plunge\s+dmg/i.test(strippedPlungeText);
  const isPlunge =
    isKnownPlungeCarry ||
    (!isKnownNonPlunge && (hasExclusivePlungeKit || (Number(context.features?.plunge_focus_score ?? 0) >= 0.45 && !Boolean(context.features?.has_bond_of_life))));
  const isHeal = Boolean(context.features?.has_heal);
  const isShield = Boolean(context.features?.has_shield);
  const hasBondOfLife = Boolean(context.features?.has_bond_of_life) || /\bbond\s+of\s+life\b/i.test(fullText);
  const hasBurning = Boolean(context.features?.has_burning_focus) || /burning\s+opponents/i.test(fullText);
  const hasBurstHpDrain = Boolean(context.features?.has_burst_hp_drain);
  const isPhysical = Boolean(context.features?.is_physical_carry);
  const withFurina = Boolean(context.withFurina);

  // 1. Strict Weapon-Type Gate (e.g., 4pc Wanderer's Troupe requires Catalyst/Bow; 4pc Gladiator requires Sword/Claymore/Polearm)
  if (Array.isArray(p.weaponTypes) && p.weaponTypes.length && !p.weaponTypes.includes(wepType)) {
    return -10;
  }

  // 1b. Attack-Motion Gates (Charged-Attack vs Normal-Attack / Melee-Stance carries)
  // Wanderer's Troupe (caOnly=1) only fits dedicated Charged-Attack Bow/Catalyst carries (Ganyu, Lyney, Tighnari, Neuvillette, Yanfei),
  // NOT Melee-Stance or Normal-Attack Bow/Catalyst carries (Tartaglia, Yoimiya, Wanderer).
  if (p.caOnly && (!isOnField || caFocus < 0.55 || hasSkillStanceNa)) {
    return -10;
  }
  if (p.naOnly && (!isOnField || naFocus < 0.45)) {
    return -10;
  }

  // 2. Strict Mechanic & Archetype Gates
  if (p.nightsoul && !factions.has('Nightsoul')) {
    if (!(setObj.lookupKey === 'scrolloftheheroofcindercity' && isSupport)) return -10;
  }
  if (p.lunar && !factions.has('Moonsign') && ch.lunar_crit < 0.2) return -10;
  if (p.hexerei && !factions.has('Hexerei')) return -10;
  if (p.stellar && !factions.has('Stellar') && ch.stellar_crit < 0.2) return -10;
  if (EXCLUDED_LOW_RARITY_SETS.has(setObj.lookupKey)) return -10;
  if (p.stellarSwirl && elem !== 'anemo') return -10;
  if (p.stellarConduct && elem !== 'cryo' && elem !== 'electro') return -10;
  if (p.zeroEnergy && (!zeroEnergy || elem !== 'cryo')) return -10;
  if (p.bondOfLife && !hasBondOfLife) return -10;
  if (p.burning && !hasBurning) return -10;
  if (p.burstHpDrain && !hasBurstHpDrain) return -10;
  if (p.heal && !isHeal) return -10;
  if (p.phys && !isPhysical) return -10;
  if (setObj.lookupKey === 'retracingbolide' && (!isShield || !isOnField)) return -10;
  if (setObj.lookupKey === 'thundersoother' || setObj.lookupKey === 'lavawalker') return -10;

  const nativeHpFluct =
    !hasBondOfLife &&
    (Boolean(context.features?.has_hp_fluctuation) ||
      Number(context.supply?.hpFluctuation || 0) >= 0.4 ||
      /consumes?\s+hp|loses?\s+hp|hp\s+(?:is\s+)?(?:lost|reduced|drained|fluctuat)/i.test(fullText));
  const hasHpFluct = nativeHpFluct || (withFurina && isOnField && setObj.lookupKey === 'marechausseehunter');
  if (p.hpFluctuation && !hasHpFluct) return -10;
  if (setObj.lookupKey === 'vourukashasglow' && (isShield || !nativeHpFluct)) return -10;

  // Bloom-only sets (Flower of Paradise Lost) vs Spread/Aggravate/Reaction EM sets (Gilded Dreams)
  const isBloomArchetype =
    ch.transformative >= 0.4 &&
    (elem === 'dendro' || elem === 'hydro' || elem === 'electro' || elem === 'pyro');
  if (p.bloomOnly && !isBloomArchetype) return -10;

  if (setObj.lookupKey === 'emblemofseveredfate') {
    const erEligible = netEr === 'high' || netEr === 'moderate' || deployId === 'stygian' || deployId === 'theater';
    if (zeroEnergy || ch.transformative >= 0.6 || (isHeal && isSupport) || !erEligible || burstShare < 0.22) return -10;
  }
  if (setObj.lookupKey === 'goldentroupe' && !isOffField && deployId !== 'overworld') return -5;
  if (setObj.lookupKey === 'nightoftheskysunveiling' && !isOnField) return -10;
  if (setObj.lookupKey === 'viridescentvenerer' && elem !== 'anemo') return -10;
  if (setObj.lookupKey === 'deepwoodmemories' && elem !== 'dendro' && ch.transformative < 0.4) return -10;
  if (setObj.lookupKey === 'blizzardstrayer' && elem !== 'cryo') return -10;
  if (setObj.lookupKey === 'crimsonwitchofflames' && elem !== 'pyro') return -10;
  if (setObj.lookupKey === 'thunderingfury' && elem !== 'electro') return -10;
  if ((setObj.lookupKey === 'heartofdepth' || setObj.lookupKey === 'nymphsdream') && elem !== 'hydro') return -10;
  if (setObj.lookupKey === 'huskofopulentdreams' && elem !== 'geo' && primaryScaler !== 'def_') return -10;
  if (p.plunge && !isPlunge && setObj.lookupKey !== 'songofdayspast') return -10;

  // 3. Weighted Primitive Dot Product
  let score = 0;
  if (isOnField) score += p.onField * 4.5 - p.offField * 2.5;
  if (isOffField) score += p.offField * 4.5 + p.skillDmg * skillShare * 5 + p.burstDmg * burstShare * 4;
  if (isSupport) score += p.teamBuff * 5.0 + p.resShred * 5.5 + (isHeal ? p.heal * 4.0 : 0) + (isShield ? p.shield * 3.5 : 0);

  if (p.bondOfLife && hasBondOfLife) score += 11.5;
  if (p.burning && hasBurning) score += 11.5;
  if (p.burstHpDrain && hasBurstHpDrain) score += 11.0;
  if (p.bloomOnly && isBloomArchetype) score += 8.5;

  if (p.highEr) {
    const erBoost = deployId === 'stygian' ? 6.5 : deployId === 'overworld' ? -3.0 : netEr === 'high' ? 4.5 : netEr === 'moderate' ? 1.5 : -2.5;
    score += erBoost + p.burstDmg * (netEr === 'high' ? 4.0 : 0.5);
  }
  if (deployId === 'overworld') {
    if (p.burstDmg && !p.skillDmg) score -= 3.5;
    if (p.skillDmg || (p.onField && p.atkScaler)) score += 2.5;
  }

  if (p.zeroEnergy && zeroEnergy && elem === 'cryo') score += 9.5;
  if (p.lunar && (factions.has('Moonsign') || ch.lunar_crit >= 0.2)) {
    if (isSupport) score += p.teamBuff * 6.5 + (p.offField ? 7.5 : 3.0);
    else if (isOffField) score += p.offField ? (p.teamBuff ? 9.5 : 14.5) : 5.0;
    else score += p.onField ? 14.0 : p.offField ? 4.0 : 8.5;
  }
  if (p.stellar && (factions.has('Stellar') || ch.stellar_crit >= 0.2)) {
    if (isSupport) score += p.stellarGlimmer ? 14.0 : 5.0;
    else if (isOffField) score += p.stellarGlimmer ? 12.5 : 9.5;
    else score += (p.stellarSwirl || p.stellarConduct) ? 13.5 : 9.5;
  }
  if (p.hexerei && factions.has('Hexerei')) {
    score += isSupport ? (p.teamBuff * 6 + 6.5) : 12.0;
  }
  if (p.nightsoul && factions.has('Nightsoul')) score += isSupport ? (p.teamBuff * 5 + 6.5) : 9.5;
  else if (setObj.lookupKey === 'scrolloftheheroofcindercity' && isSupport) score += 1.8;

  const hasOffFieldSkillTicks =
    (Boolean(context.features?.has_off_field) && skillShare >= 0.25) ||
    /kokomi|yaoyao|kuki|sigewinne|zhongli|layla|furina|fischl|yaemiko|chiori|albedo|dehya|emilie|escoffier/i.test(String(charMeta?.key || ''));
  const isBaseAtkBuffer = Boolean(context.baseAtkOnlyBuffer || /bennett|kujousara/i.test(String(charMeta?.key || '')));
  if (setObj.lookupKey === 'tenacityofthemillelith') {
    if (!hasOffFieldSkillTicks && !isShield) score -= 5.0;
    else if (isSupport && (primaryScaler === 'hp_' || isShield) && hasOffFieldSkillTicks) score += 9.5;
    else if (isSupport && isShield) score += 6.0;
  }
  if (setObj.lookupKey === 'maidenbeloved') score -= 6.0;

  // Tier 1 Hyperspecific Specialists: DEF% Geo (Husk), Healer-Buffers (Song of Days Past / Clam), Off-Field Skill (Golden Troupe), Burst-ER (Emblem)
  if (setObj.lookupKey === 'huskofopulentdreams' && elem === 'geo' && primaryScaler === 'def_') {
    score += isOnField ? 12.0 : 9.5;
  }
  if (setObj.lookupKey === 'songofdayspast' && isHeal && isSupport && !isBaseAtkBuffer) {
    score += !hasOffFieldSkillTicks ? 10.5 : 6.0;
  }
  if (setObj.lookupKey === 'oceanhuedclam' && isHeal) {
    if (isBaseAtkBuffer) score -= 5.0;
    else score += isOnField ? 9.5 : primaryScaler === 'hp_' && hasOffFieldSkillTicks ? 7.5 : 5.0;
  }
  if (setObj.lookupKey === 'goldentroupe' && isOffField && skillShare >= 0.4) {
    score += 7.5 + skillShare * 3.5;
  }
  if (setObj.lookupKey === 'emblemofseveredfate' && !zeroEnergy && !isHeal && (burstShare >= 0.25 && netEr === 'high' || burstShare >= 0.4)) {
    score += (netEr === 'high' ? 8.5 : 5.0) + burstShare * 3.5;
  }
  if (setObj.lookupKey === 'longnightsoath' && isPlunge) {
    score += isKnownPlungeCarry ? 20.0 : 11.5;
  }

  if (primaryScaler === 'hp_') score += p.hpScaler * 3.5;
  if (primaryScaler === 'atk_') score += p.atkScaler * 2.5;
  if (primaryScaler === 'def_') score += p.defScaler * 4.0;
  if (primaryScaler === 'eleMas' || ch.transformative >= 0.5 || ch.additive >= 0.35 || (ch.amp >= 0.5 && !isSupport)) {
    score += p.emScaler * 3.5 + p.reactionEm * 4.5;
  }
  if (setObj.lookupKey === 'gildeddreams' && (primaryScaler === 'eleMas' || ch.additive >= 0.35 || ch.transformative >= 0.4)) {
    score += 4.0;
  }
  if (setObj.lookupKey === 'deepwoodmemories' && elem === 'dendro') {
    score += isSupport || isOffField ? 5.5 : 4.5;
  }
  if (setObj.lookupKey === 'viridescentvenerer' && elem === 'anemo' && (isSupport || isOffField) && !factions.has('Stellar')) {
    score += 8.5;
  }

  // Matching 2pc Elemental DMG% bonus (unless reaction/utility dominates)
  if (!context.dmgGobletDeprioritized && p[elem]) score += 3.0;

  // Tier 3 Generalist Fallback: 4pc Noblesse Oblige wins #1 for pure Burst ATK buffers without a dedicated mechanic/healer set
  if (setObj.lookupKey === 'noblesseoblige') {
    const personalBurstBonus = burstShare >= 0.35 ? 1.8 : burstShare >= 0.25 ? 0.8 : 0;
    const isPureBurstBuffer =
      isBaseAtkBuffer ||
      (isSupport && !isHeal && !hasOffFieldSkillTicks && !factions.has('Nightsoul') && !factions.has('Moonsign') && !factions.has('Stellar'));
    if (isPureBurstBuffer) score += 7.5 + personalBurstBonus;
    else if (isSupport) score += 4.2 + personalBurstBonus;
    else if (isOffField && netEr !== 'high' && skillShare < 0.45) score += 2.0 + personalBurstBonus;
  }
  if (setObj.lookupKey === 'archaicpetra' && elem === 'geo' && (isSupport || isOffField)) {
    score += isOffField ? 5.0 : 3.5;
  }
  if (setObj.lookupKey === 'nighttimewhispersintheechoingwoods' && !isSupport) {
    if (elem !== 'geo') return -10;
    score += 4.5;
  }
  if (setObj.lookupKey === 'crimsonwitchofflames' && elem === 'pyro' && !isSupport) {
    score += 4.5;
  }
  if (setObj.lookupKey === 'blizzardstrayer' && elem === 'cryo' && isOnField) {
    score += 4.5;
  }
  if (setObj.lookupKey === 'thunderingfury' && elem === 'electro' && isOnField) {
    score += 3.5;
  }
  if (context.scenarioMode?.id === 'aoe' && (p.burstDmg || p.reactionEm || p.resShred)) {
    score += 1.25;
  }
  if (setObj.lookupKey === 'desertpavilionchronicle' && isOnField && elem === 'anemo') {
    score += 7.0;
  }
  if (setObj.lookupKey === 'nymphsdream' && isOnField && elem === 'hydro') {
    score += hasSkillStanceNa ? 8.5 : 5.5;
  }
  if (setObj.lookupKey === 'heartofdepth' && isOnField && elem === 'hydro') {
    score += hasSkillStanceNa ? 5.0 : 4.0;
  }
  if (setObj.lookupKey === 'shimenawasreminiscence' && isOnField) {
    if (naFocus >= 0.7 && burstShare < 0.25 && (elem === 'pyro' || wepType === 'Bow')) score += 9.5;
    else if (naFocus >= 0.7 && burstShare < 0.35) score += 4.5;
    else if (naFocus >= 0.55) score += 2.0;
  }
  if (setObj.lookupKey === 'echoesofanoffering' && isOnField && naFocus >= 0.7) {
    score += elem === 'hydro' && wepType === 'Sword' ? 5.5 : 3.0;
  }
  if (p.caOnly && isOnField && caFocus >= 0.65) {
    score += caFocus * 4.5;
  }
  if (p.naOnly && isOnField && naFocus >= 0.6) {
    score += naFocus * 3.0;
  }
  if (setObj.lookupKey === 'marechausseehunter' && isOnField && p.hpFluctuation) {
    score += nativeHpFluct ? 11.0 : withFurina ? 8.5 : 0;
  }

  return Number(score.toFixed(2));
}

const EXCLUDED_LOW_RARITY_SETS = new Set([
  'resolutionofsojourner',
  'braveheart',
  'defenderswill',
  'tinymiracle',
  'berserker',
  'martialartist',
  'instructor',
  'gambler',
  'theexile',
  'adventurer',
  'luckydog',
  'scholar',
  'travelingdoctor',
  'glacierandsnowfield'
]);

const NON_STACKING_TEAM_SETS = new Set([
  'noblesseoblige',
  'tenacityofthemillelith',
  'deepwoodmemories',
  'viridescentvenerer',
  'scrolloftheheroofcindercity',
  'silkenmoonsserenade',
  'celestialgift',
  'heartofthefurnace',
  'songofdayspast'
]);

export function rankArtifactSetsByVector(charMeta, profile, context, setVectors = [], kitData = null) {
  if (!Array.isArray(setVectors) || !setVectors.length) return [];
  const enrichedCtx = {
    ...context,
    weaponType: charMeta?.weaponType || profile?.weaponType || 'Sword',
    features: profile?.features || {},
    factions: profile?.factions || [],
    primaryScaler: profile?.primaryScaler || 'atk_'
  };

  const activeRole = context.activeLens || 'Quickswap Support';
  const lensLabel = (r) =>
    /support|healer|shield|buffer|enabler/i.test(r) ? 'Team Support' : /off-field|sub-dps/i.test(r) ? 'Personal Sub-DPS' : 'On-Field Carry';
  const activeTag = context.chosenMode?.label ? context.chosenMode.label.split('(')[0].trim() : lensLabel(activeRole);

  const rankedPrimary = setVectors
    .map((s) => ({ setObj: s, score: scoreSetPrimitivesForRole(charMeta, enrichedCtx, s, activeRole, kitData) }))
    .filter((x) => x.score > 2.0)
    .sort((a, b) => b.score - a.score);

  const findSwapFallback = (excludeKey) => {
    const personalAlt = rankedPrimary.find((x) => x.setObj.lookupKey !== excludeKey && !NON_STACKING_TEAM_SETS.has(x.setObj.lookupKey));
    if (personalAlt) return `4pc ${personalAlt.setObj.name}`;
    const anyAlt = rankedPrimary.find((x) => x.setObj.lookupKey !== excludeKey);
    return anyAlt ? `4pc ${anyAlt.setObj.name}` : 'a 2pc + 2pc personal mix';
  };

  // Pick top 2 sets for the ACTIVE Build Mode so toggling modes visibly swaps the recommended sets
  const picked = rankedPrimary.slice(0, 2).map((x) => ({
    set: `4pc ${x.setObj.name}`,
    note: x.setObj.fourPc.split('. ')[0].slice(0, 88),
    nonStackingNote: NON_STACKING_TEAM_SETS.has(x.setObj.lookupKey)
      ? `Non-stacking 4pc team buff — if a teammate already holds ${x.setObj.name}, swap to ${findSwapFallback(x.setObj.lookupKey)}.`
      : '',
    lensTag: activeTag,
    setId: x.setObj.setId,
    domain: x.setObj.domain,
    region: x.setObj.region,
    twoPc: x.setObj.twoPc,
    fourPc: x.setObj.fourPc
  }));

  // If the active mode only matched 1 specialized 4pc set, fill slot 2 from the secondary lens if available
  if (picked.length === 1) {
    const altLens = (profile?.playstyleLenses || []).find((l) => l.id && l.id !== activeRole);
    if (altLens) {
      const altTop = setVectors
        .map((s) => ({ setObj: s, score: scoreSetPrimitivesForRole(charMeta, enrichedCtx, s, altLens.id, kitData) }))
        .filter((x) => x.score > 2.0 && `4pc ${x.setObj.name}` !== picked[0].set)
        .sort((a, b) => b.score - a.score)[0];
      if (altTop) {
        picked.push({
          set: `4pc ${altTop.setObj.name}`,
          note: altTop.setObj.fourPc.split('. ')[0].slice(0, 88),
          lensTag: altLens.label ? altLens.label.split('(')[0].trim() : lensLabel(altLens.id),
          setId: altTop.setObj.setId,
          domain: altTop.setObj.domain,
          region: altTop.setObj.region,
          twoPc: altTop.setObj.twoPc,
          fourPc: altTop.setObj.fourPc
        });
      }
    }
  }

  const elem = String(charMeta?.element || 'Geo');
  const pScaler = profile?.primaryScaler === 'hp_' ? 'HP%' : profile?.primaryScaler === 'def_' ? 'DEF%' : profile?.primaryScaler === 'eleMas' ? 'EM' : 'ATK%';
  const isSup = /support|healer|shield|buffer/i.test(activeRole);
  const deployId = context.deploymentMode?.id || 'abyss';
  const zeroEnergy = Boolean(profile?.features?.zero_energy);
  let flexSet = context.dmgGobletDeprioritized
    ? `2pc ${pScaler} + 2pc EM / ER%`
    : isSup
      ? `2pc ${pScaler} + 2pc ER%`
      : `2pc ${elem} DMG% + 2pc ${pScaler}`;
  let flexNote = 'Flexible high-substat mixed option';
  let flexTag = 'Flexible 2pc';
  if (
    deployId !== 'overworld' &&
    (profile?.preferDoubleHp || (isSup && profile?.primaryScaler === 'hp_' && Number(profile?.statThresholdCurve?.ceiling || 0) >= 40000))
  ) {
    flexSet = '2pc HP% + 2pc HP%';
    flexNote = 'Stack two 2pc HP% sets (e.g., Tenacity + Vourukasha) toward Max HP cap';
    flexTag = 'HP% Cap';
  }
  if (deployId === 'stygian' && !zeroEnergy) {
    flexSet = `2pc ER% + 2pc ${pScaler}`;
    flexNote = 'Stygian 0E: Frontload ER% for Rotation 1 Burst';
    flexTag = 'Stygian 0E';
  } else if (deployId === 'overworld') {
    flexSet = `2pc ${elem} DMG% + 2pc ${pScaler}`;
    flexNote = 'Overworld: Zero-setup Skill & Normal Attack consistency';
    flexTag = 'Overworld';
  }
  picked.push({
    set: flexSet,
    note: flexNote,
    lensTag: flexTag
  });
  return picked.slice(0, 3);
}

export function rankPartnersAndSubstitutes(anchorKey, options = {}) {
  const {
    teamSoFar = [],
    ownedKeys = new Set(),
    deploymentMode = 'abyss',
    scenarioMode = 'st',
    allProfiles = {},
    charMetaFn = null
  } = options;

  const anchor = allProfiles[anchorKey];
  if (!anchor) {
    return { anchorConditionStatuses: [], idealPartners: [], missingTargetPartner: null, ownedSubstitutes: [] };
  }

  const modeCfg = DEPLOYMENT_MODES[deploymentMode] || DEPLOYMENT_MODES.abyss;
  const currentTeam = [anchorKey, ...teamSoFar.filter((k) => k && k !== anchorKey)];
  const anchorConds = evaluateTeamConditions(anchorKey, anchor, teamSoFar, 0, allProfiles, charMetaFn);

  // Compute remaining team demand (reduced by already-slotted teammates!)
  const dEff = { ...(anchor.demand || {}) };
  const anchCh = anchor.channelShares || {};
  if ((anchCh.lunar_crit || 0) + (anchCh.stellar_crit || 0) >= 0.4 || (anchCh.transformative || 0) >= 0.65) {
    dEff.teamDmgPct = 0.05; // Furina / elemental DMG% buffers do NOT amplify Lunar/Stellar/Transformative reaction DMG
  }
  if (deploymentMode === 'stygian' && !anchor.features?.zero_energy) {
    dEff.battery = Math.min(1.2, (dEff.battery || 0.3) * 1.45);
  }
  for (const mateKey of teamSoFar) {
    const mate = allProfiles[mateKey];
    if (!mate) continue;
    for (const dim of SUPPLY_DIMS) {
      dEff[dim] = Math.max(0, (dEff[dim] || 0) - (mate.supply?.[dim] || 0) * 0.7);
      // If a slotted teammate is Furina/HP drain, team demands healing!
      if (dim === 'teamHeal' && (mate.supply?.hpFluctuation || 0) >= 0.8) {
        dEff.teamHeal = Math.max(dEff.teamHeal || 0, 0.95);
      }
    }
  }

  const anchorLock = anchor.teamElementLock;
  const anchorFactions = new Set(anchor.factions || []);
  const anchorEl = anchor.element || getEl(anchorKey, allProfiles, charMetaFn);
  const anchorOffField = (anchor.roles || []).includes('off_field_sub_dps') || Boolean(anchor.features?.has_off_field);
  const nonSnapshotDiscount = anchor.canSnapshot === false && anchorOffField;

  const scoreCandidate = (candKey, cand) => {
    const s = cand.supply || {};
    let dot = 0;
    const matchedDims = [];
    for (const dim of SUPPLY_DIMS) {
      let contrib = (dEff[dim] || 0) * (s[dim] || 0);
      // Off-field sub-DPS without snapshotting gain reduced uptime from active-only ATK fields (e.g., Bennett)
      if (
        nonSnapshotDiscount &&
        dim === 'teamAtk' &&
        (cand.baseAtkOnlyBuffer || candKey === 'Bennett' || candKey === 'KujouSara' || candKey === 'Iansan')
      ) {
        contrib *= 0.85;
      }
      if (contrib > 0) {
        dot += contrib;
        if (contrib >= 0.22) matchedDims.push({ dim, contrib, label: SUPPLY_LABELS[dim] });
      }
    }

    // Faction resonance bonus (Hexerei+Hexerei, Moonsign+Moonsign, Stellar+Stellar)
    let factionBonus = 0;
    for (const fac of cand.factions || []) {
      if (anchorFactions.has(fac)) factionBonus += fac === 'Stellar' ? 0.55 : 0.75;
    }

    // Aura & reaction enablement bonus
    let auraBonus = 0;
    if ((anchCh.amp || 0) >= 0.3 && (cand.supply?.offFieldAura || 0) >= 0.6 && cand.element !== anchorEl) {
      if ((anchorEl === 'Pyro' && (cand.element === 'Hydro' || cand.element === 'Cryo')) ||
          ((anchorEl === 'Hydro' || anchorEl === 'Cryo') && cand.element === 'Pyro')) {
        auraBonus += 0.65;
      }
    }

    // Constraint evaluation (soft warning / score penalty — never hard-blocked)
    let penalty = 0;
    let tradeoffWarning = '';
    if (anchorLock && !(anchorLock.only || []).includes(cand.element)) {
      penalty = 1.65;
      tradeoffWarning = `Off-element (${cand.element}): ${anchorLock.penaltyNote}`;
    } else if (cand.teamElementLock && !(cand.teamElementLock.only || []).includes(anchorEl)) {
      penalty = 1.1;
      tradeoffWarning = `Breaks ${cand.name}'s own ${cand.teamElementLock.label}`;
    }

    const totalScore = Number((dot + factionBonus + auraBonus - penalty).toFixed(3));
    matchedDims.sort((a, b) => b.contrib - a.contrib);
    return {
      key: candKey,
      name: cand.name,
      element: cand.element,
      owned: ownedKeys.has(candKey),
      score: totalScore,
      reasons: matchedDims.slice(0, 3).map((m) => m.label),
      tradeoffWarning,
      supply: s
    };
  };

  const allScored = Object.entries(allProfiles)
    .filter(([k]) => k !== anchorKey && !currentTeam.includes(k))
    .map(([k, cand]) => scoreCandidate(k, cand))
    .sort((a, b) => b.score - a.score);

  const idealPartners = allScored.slice(0, 6);
  const missingTarget = idealPartners.find((p) => !p.owned) || idealPartners[0] || null;

  let ownedSubstitutes = [];
  if (missingTarget) {
    const targetReasons = SUPPLY_DIMS.filter(
      (dim) => (dEff[dim] || 0) >= 0.25 && (missingTarget.supply?.[dim] || 0) >= 0.35
    );
    ownedSubstitutes = allScored
      .filter((c) => c.owned && c.key !== missingTarget.key)
      .map((c) => {
        const covers = [];
        const missing = [];
        let covScore = 0;
        for (const dim of targetReasons) {
          const overlap = Math.min(c.supply?.[dim] || 0, missingTarget.supply?.[dim] || 0) * (dEff[dim] || 0.5);
          if ((c.supply?.[dim] || 0) >= 0.35) {
            covers.push(SUPPLY_LABELS[dim]);
            covScore += overlap;
          } else {
            missing.push(SUPPLY_LABELS[dim]);
          }
        }
        const preservesLock = !c.tradeoffWarning;
        return {
          ...c,
          covScore: Number((covScore + (preservesLock ? 0.45 : -0.6)).toFixed(3)),
          covers: covers.length ? covers : c.reasons,
          missing
        };
      })
      .sort((a, b) => b.covScore - a.covScore || b.score - a.score)
      .slice(0, 5);
  }

  return {
    anchorConditionStatuses: anchorConds,
    modeNote: modeCfg.note,
    scenario: SCENARIO_MODES[scenarioMode] || SCENARIO_MODES.st,
    idealPartners,
    missingTargetPartner: missingTarget && !missingTarget.owned ? missingTarget : null,
    ownedSubstitutes
  };
}

export const SIGNATURE_WEAPONS = {
  HuTao: 'StaffOfHoma',
  Zhongli: 'VortexVanquisher',
  Yoimiya: 'ThunderingPulse',
  KamisatoAyato: 'HaranGeppakuFutsu',
  KamisatoAyaka: 'MistsplitterReforged',
  Ganyu: 'AmosBow',
  Tartaglia: 'PolarStar',
  Arlecchino: 'CrimsonMoonsSemblance',
  Neuvillette: 'TomeOfTheEternalFlow',
  Furina: 'SplendorOfTranquilWaters',
  Navia: 'Verdict',
  Clorinde: 'Absolution',
  Alhaitham: 'LightOfFoliarIncision',
  Nahida: 'AThousandFloatingDreams',
  RaidenShogun: 'EngulfingLightning',
  Yelan: 'AquaSimulacra',
  Xiao: 'PrimordialJadeWingedSpear',
  Wanderer: 'TulaytullahsRemembrance',
  Lyney: 'TheFirstGreatMagic',
  Wriothesley: 'CashflowSupervision',
  Xianyun: 'CranesEchoingCall',
  Chiori: 'UrakuMisugiri',
  Mavuika: 'AThousandBlazingSuns',
  Citlali: 'StarcallersWatch',
  Xilonen: 'PeakPatrolSong',
  Mualani: 'SurfsUp',
  Kinich: 'FangOfTheMountainKing',
  Chasca: 'AstralVulturesCrimsonPlumage',
  Skirk: 'Azurelight',
  Varesa: 'VividNotions',
  Escoffier: 'SymphonistOfScents',
  Ineffa: 'FracturedHalo',
  Lauma: 'NightweaversLookingGlass',
  Flins: 'BloodsoakedRuins',
  Nefer: 'ReliquaryOfTruth',
  Durin: 'AthameArtis',
  Columbina: 'NocturnesCurtainCall',
  Varka: 'GestOfTheMightyWolf',
  Zibai: 'LightbearingMoonshard',
  KaedeharaKazuha: 'FreedomSworn',
  Venti: 'ElegyForTheEnd',
  YaeMiko: 'KagurasVerity',
  Nilou: 'KeyOfKhajNisut',
  Cyno: 'StaffOfTheScarletSands',
  AratakiItto: 'RedhornStonethresher',
  Eula: 'SongOfBrokenPines',
  Shenhe: 'CalamityQueller',
  SangonomiyaKokomi: 'EverlastingMoonglow',
  Baizhu: 'JadefallsSplendor',
  Sigewinne: 'SilvershowerHeartstrings',
  Emilie: 'LumidouceElegy',
  Tighnari: 'HuntersPath',
  Dehya: 'BeaconOfTheReedSea',
  Keqing: 'LionsRoar',
  Diluc: 'WolfsGravestone',
  Albedo: 'CinnabarSpindle',
  Klee: 'DodocoTales',
  Aloy: 'Predator'
};

export function getSignatureWeaponKey(charKey) {
  return SIGNATURE_WEAPONS[charKey] || '';
}

export function rankWeaponsByVector(
  charMeta,
  profile,
  context,
  weaponsIndex = [],
  ownedWeapons = [],
  kitData = null,
  extraOptions = {}
) {
  if (!Array.isArray(weaponsIndex) || !weaponsIndex.length) return [];
  const { activeSetKey = '', hasFlatAtkBuffer = false } = extraOptions || {};
  const normActiveSet = String(activeSetKey || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const activeSetCR =
    normActiveSet.includes('nightoftheskysunveiling')
      ? 30
      : normActiveSet.includes('marechausseehunter')
        ? 36
        : normActiveSet.includes('obsidiancodex')
          ? 40
          : normActiveSet.includes('blizzardstrayer')
            ? 20
            : 0;

  const charKey = context?.charKey || '';
  const wepType = charMeta?.weaponType || profile?.weaponType || 'Sword';
  const sigKey = getSignatureWeaponKey(charKey);

  const feats = profile?.features || {};
  const ch = context?.effectiveChannelShares || profile?.channelShares || {};
  const weights = context?.effectiveSubstatWeights || profile?.statWeights || {};
  const primaryScaler = profile?.primaryScaler || 'atk_';
  const roleName = context?.activeLens || 'Quickswap Support';
  const isSupport = /support|healer|shield|buffer|enabler/i.test(roleName);
  const isOffField = /off-field|sub-dps/i.test(roleName);
  const isOnField = !isSupport && !isOffField;
  const isBaseAtkBuffer = Boolean(isSupport && profile?.baseAtkOnlyBuffer);
  const zeroEnergy = Boolean(feats.zero_energy);
  const factions = new Set(profile?.factions || []);
  const fullText = [...(kitData?.talents || []), ...(kitData?.passives || [])].map((x) => x?.description || '').join(' ');

  const naFocus = Number(feats.na_focus_score ?? 0.35);
  const caFocus = Number(feats.ca_focus_score ?? 0.3);
  const skillShare = Number(feats.skill_dmg_share ?? 0.3);
  const burstShare = Number(feats.burst_dmg_share ?? 0.3);
  const hasSkillStanceNa = Boolean(feats.has_skill_stance_na_combo);
  const isHeal = Boolean(feats.has_heal);
  const isShield = Boolean(feats.has_shield);
  const hasBondOfLife = Boolean(feats.has_bond_of_life) || /\bbond\s+of\s+life\b/i.test(fullText);
  const hasBurning = Boolean(feats.has_burning_focus);
  const hasHpFluct =
    !hasBondOfLife &&
    (Boolean(feats.has_hp_fluctuation) ||
      Boolean(context?.withFurina && isOnField) ||
      Number(context?.supply?.hpFluctuation || 0) >= 0.4);
  const isPhysical = Boolean(feats.is_physical_carry);
  const critAllowed = !context?.transformativeDominant && (weights.critRate_ ?? 1) > 0;

  // Map owned weapons by normalized key (keeping highest level/refinement and all copies)
  const ownedByKey = new Map();
  for (const ow of ownedWeapons || []) {
    const nk = String(ow.key || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (!nk) continue;
    const list = ownedByKey.get(nk) || [];
    list.push(ow);
    ownedByKey.set(nk, list);
  }

  const SPECIALIST_3_STAR_SUBSTATS = new Set(['CRIT Rate', 'CRIT DMG', 'Elemental Mastery', 'HP%', 'DEF%', 'Energy Recharge']);
  const lowBaseAtkProtected = primaryScaler !== 'atk_' || Boolean(hasFlatAtkBuffer);
  const baseAtkMod = lowBaseAtkProtected ? 1.0 : 0.45;
  const baselineCritRate = Number(profile?.baselineCritRate ?? 5.0);

  return weaponsIndex
    .filter(
      (w) =>
        w.weaponType === wepType &&
        (w.rarity >= 4 ||
          w.isLowBaseAtkSpecialist ||
          SPECIALIST_3_STAR_SUBSTATS.has(w.substat) ||
          (w.mechanicTags || []).includes('party_buff'))
    )
    .map((w) => {
      const reqs = w.requiresMechanics || [];
      const tags = w.mechanicTags || [];
      const isSig = Boolean(sigKey && w.key === sigKey);
      let score = w.rarity === 5 ? (isSupport ? 2.2 : 3.6) : w.rarity === 4 ? 1.5 : -0.6;
      const reasons = [];
      let overcapWarning = '';

      // 1. Mechanic requirement gates / penalties
      let gatedOut = false;
      for (const req of reqs) {
        if (req === 'bond_of_life' && !hasBondOfLife) gatedOut = true;
        else if (req === 'hp_fluctuation' && !hasHpFluct) gatedOut = true;
        else if (req === 'lunar' && !factions.has('Moonsign') && (ch.lunar_crit || 0) < 0.2) gatedOut = true;
        else if (req === 'nightsoul' && !factions.has('Nightsoul')) gatedOut = true;
        else if (req === 'hexerei' && !factions.has('Hexerei')) gatedOut = true;
        else if (req === 'stellar_glimmer' && !factions.has('Stellar') && (ch.stellar_crit || 0) < 0.2) gatedOut = true;
        else if (req === 'burning_burgeon' && !hasBurning) gatedOut = true;
        else if (req === 'healing_performed' && !isHeal) gatedOut = true;
        else if (req === 'charged_attack' && (caFocus < 0.45 || hasSkillStanceNa)) score -= 2.5;
      }
      if (gatedOut) score -= 9.5;
      else if (reqs.length) {
        score += 2.2;
        reasons.push('Matches kit mechanic');
      }

      // Base-ATK-only buffers (Bennett, Kujou Sara, Iansan) prioritize Lv.90 Base ATK directly
      const baseAtk90 = Number(w.baseAtk90 || w.baseAtk || 0);
      if (isBaseAtkBuffer && baseAtk90 > 0) {
        score += (baseAtk90 / 674) * 5.0;
        if (baseAtk90 >= 565) reasons.push('High Base ATK buffer');
      }

      // Weapon-Artifact & role coupling penalties
      if (normActiveSet.includes('shimenawasreminiscence') && w.requiresFullEnergy) {
        score -= 6.0;
        reasons.push('Shimenawa energy clash');
      }
      if (w.requiresOnFieldStacking && !isOnField) {
        score -= 3.5;
      }

      // 2. Substat alignment with active context weights
      const sub = String(w.substat || '');
      const subVal90 = Number(w.substatVal90 || parseFloat(w.substatValue) || 0);
      const weaponCR = sub === 'CRIT Rate' ? subVal90 : 0;
      const projectedBaseCR = Number((baselineCritRate + activeSetCR + weaponCR).toFixed(1));
      if (sub === 'CRIT Rate' || sub === 'CRIT DMG') {
        if (critAllowed) {
          const cw = Math.max(weights.critRate_ || 0, weights.critDMG_ || 0);
          score += cw * (isOnField ? 5.2 : 4.2);
          if (cw >= 0.7) reasons.push(`${sub} carry stat`);
          if (weaponCR > 0 && projectedBaseCR > 85) {
            score -= Math.min(5.0, 1.8 + (projectedBaseCR - 85) * 0.2);
            overcapWarning = `CRIT Rate overcap risk (${projectedBaseCR}% before substats)`;
          } else if (weaponCR > 0 && projectedBaseCR >= 80) {
            score -= 1.2;
            overcapWarning = `High baseline CRIT Rate (${projectedBaseCR}% before substats)`;
          }
        } else {
          score -= 2.5;
        }
      } else if (sub === 'HP%') {
        const hw = primaryScaler === 'hp_' ? (isSupport ? 1.0 : 0.72) : weights.hp_ || 0;
        score += hw * 4.8;
        if (hw >= 0.6) reasons.push('HP% scaling');
      } else if (sub === 'DEF%') {
        const dw = primaryScaler === 'def_' ? 1.0 : weights.def_ || 0;
        score += dw * 4.8;
        if (dw >= 0.6) reasons.push('DEF% scaling');
      } else if (sub === 'ATK%') {
        if (isBaseAtkBuffer) {
          score -= 2.2;
        } else if (primaryScaler === 'hp_' || primaryScaler === 'def_') {
          score -= 2.0;
        } else {
          const aw = primaryScaler === 'atk_' ? 0.85 : 0.2;
          score += aw * 3.2;
          if (aw >= 0.7) reasons.push('ATK% scaling');
        }
      } else if (sub === 'Elemental Mastery') {
        const emw = Math.max(weights.eleMas || 0, (ch.transformative || 0) + (ch.amp || 0) * 0.6 + (ch.additive || 0) * 0.7);
        score += emw * 4.4;
        if (emw >= 0.45) reasons.push('Reaction EM');
      } else if (sub === 'Energy Recharge') {
        const erw = zeroEnergy ? 0 : weights.enerRech_ ?? 0.4;
        score += erw * 4.2 + (isSupport ? 1.5 : 0);
        if (!zeroEnergy && erw >= 0.85 && tags.includes('er_battery') && subVal90 >= 50) {
          score += 2.2;
        }
        if (erw >= 0.6 || isSupport) reasons.push('Rotation ER%');
      } else if (sub === 'Physical DMG') {
        score += isBaseAtkBuffer ? 0 : isPhysical ? 4.5 : -4.0;
      }

      // 3. Mechanic tag alignment
      if (tags.includes('na_dmg')) {
        score += isOnField ? naFocus * 4.4 : -0.6;
        if (isOnField && naFocus >= 0.65) reasons.push('Normal ATK DMG');
      }
      if (tags.includes('ca_dmg')) {
        score += isOnField && !hasSkillStanceNa ? caFocus * 4.4 : 0.4;
        if (isOnField && caFocus >= 0.65) reasons.push('Charged ATK DMG');
      }
      if (tags.includes('ca_penalty') && isOnField && caFocus >= 0.55) {
        score -= 3.5;
      }
      if (tags.includes('skill_dmg')) {
        score += skillShare * 4.2 + (isOffField ? 1.4 : 0);
        if (skillShare >= 0.35 || isOffField) reasons.push('Skill DMG');
      }
      if (tags.includes('burst_dmg')) {
        score += zeroEnergy ? -3.0 : burstShare * 4.2;
        if (!zeroEnergy && burstShare >= 0.35) reasons.push('Burst DMG');
      }
      if (tags.includes('elem_dmg') && !context?.dmgGobletDeprioritized) {
        score += 2.2;
      }
      if (tags.includes('hp_scale') && primaryScaler === 'hp_') {
        score += 4.2;
        reasons.push('HP passive synergy');
      }
      if (tags.includes('def_scale') && primaryScaler === 'def_') {
        score += 4.2;
        reasons.push('DEF passive synergy');
      }
      if (tags.includes('em_scale') && (weights.eleMas || 0) >= 0.4) {
        score += 2.8;
      }
      if (tags.includes('party_buff')) {
        score += isSupport ? 4.8 : 0.5;
        if (isSupport) reasons.push('Team buff utility');
      }
      if ((tags.includes('healer_utility') || tags.includes('healer_trigger')) && !isHeal) {
        score -= 2.5;
      } else if ((tags.includes('healer_utility') || tags.includes('healer_trigger')) && isHeal) {
        score += isSupport ? 3.5 : -1.5;
        if (isSupport) reasons.push('Healing synergy');
      }
      if (tags.includes('er_battery') || tags.includes('skill_reset')) {
        score += isSupport ? 3.8 : (weights.enerRech_ || 0) * 2.2;
        if (isSupport) reasons.push('Team particle battery');
      }

      // Dynamic 3★ specialist scaling: non-ATK scalers or Flat ATK buffed carries get full low-Base-ATK value
      if (w.key === 'BlackTassel' && primaryScaler === 'hp_' && isShield && isSupport) {
        score += 4.4 * baseAtkMod;
      } else if (w.key === 'RecurveBow' && primaryScaler === 'hp_') {
        score += (isSupport ? 3.2 : 2.6) * baseAtkMod;
      } else if (w.key === 'ThrillingTalesOfDragonSlayers' && isSupport) {
        score += 5.5;
      } else if (w.key === 'WhiteTassel' && isOnField && (naFocus >= 0.65 || (primaryScaler === 'hp_' && critAllowed))) {
        score += 4.2 * baseAtkMod;
      } else if (w.key === 'Slingshot') {
        if (isOnField && (naFocus >= 0.65 || primaryScaler === 'hp_')) score += 4.2 * baseAtkMod;
        else if (primaryScaler === 'hp_' && critAllowed) score += 2.8 * baseAtkMod;
        else if (!lowBaseAtkProtected) score -= 1.0;
      } else if (w.key === 'HarbingerOfDawn' && critAllowed && lowBaseAtkProtected) {
        score += 3.2;
      } else if (w.isLowBaseAtkSpecialist && !lowBaseAtkProtected) {
        score -= 1.4;
      }

      // Pure math determines rank; only a tiny tiebreaker for Signature so off-meta signatures (e.g. Vortex Vanquisher) don't fake BiS
      if (isSig && !gatedOut) {
        score += 0.35;
      }

      const nk = String(w.key || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
      const ownedCopies = (ownedByKey.get(nk) || []).slice().sort((a, b) => (b.level || 0) - (a.level || 0) || (b.refinement || 1) - (a.refinement || 1));

      let signatureNote = '';
      if (isSig && ((primaryScaler === 'hp_' && sub === 'ATK%') || (w.requiresOnFieldStacking && !isOnField))) {
        signatureNote = `Signature mismatch: requires on-field ATK% stacking rather than off-field/HP% utility — HP% and Favonius options outperform it.`;
      } else if (isSig && gatedOut) {
        signatureNote = `Signature requires an inactive kit mechanic in this Build Mode.`;
      }

      return {
        ...w,
        isSignature: isSig,
        signatureNote,
        overcapWarning,
        projectedBaseCR,
        score: Number(score.toFixed(2)),
        reasons: [...new Set(reasons)].slice(0, 3),
        owned: ownedCopies.length > 0,
        ownedCopies
      };
    })
    .sort((a, b) => b.score - a.score || b.rarity - a.rarity || b.baseAtk - a.baseAtk);
}

/**
 * Modulates a character's effectiveSubstatWeights against their actual equipped totals:
 * 1) Dampens marginal CRIT DMG weight above 200% CDMG when CR:CD ratio is skewed.
 * 2) Tapers ER% weight once deployment comfort ER is met (or spikes ER% if under target).
 * 3) Tapers primary stat weight once a kit stat cap (e.g. Vodyanitsa 65k HP) is reached.
 */
export function modulateContextWithEquippedTotals(sandboxCtx, profile, combat, statCapVal = null) {
  if (!sandboxCtx || !combat?.totals) return sandboxCtx;
  const weights = { ...(sandboxCtx.effectiveSubstatWeights || {}) };
  const alerts = [];
  const t = combat.totals;
  const cr = Number(t.critRate || 0);
  const cd = Number(t.critDmg || 0);
  const er = Number(t.er || 100);
  const zeroEnergy = Boolean(profile?.features?.zero_energy);

  // 1. High CDMG Diminishing Returns (> 200% CDMG relative to CRIT Rate)
  if ((weights.critDMG_ || 0) > 0 && cd >= 200) {
    const ratio = cd / Math.max(1, cr);
    if (ratio > 2.35) {
      weights.critDMG_ = Number(Math.max(0.45, weights.critDMG_ * 0.68).toFixed(2));
      weights.critRate_ = 1.0;
      alerts.push({
        kind: 'cdmg_dr',
        tone: 'warn',
        text: `CDMG ${cd.toFixed(1)}% vs ${cr.toFixed(1)}% CR (1:${ratio.toFixed(1)}) — diminishing returns on more CDMG; prioritize CRIT Rate.`
      });
    } else {
      weights.critDMG_ = Number(Math.max(0.65, weights.critDMG_ * 0.85).toFixed(2));
    }
  }

  // 2. Dynamic ER% Need vs Equipped ER% Comfort Taper
  if (!zeroEnergy && (weights.enerRech_ || 0) > 0.2) {
    const baseErNeed =
      sandboxCtx.effectiveNetEnergyDemand === 'high' ? 175 : sandboxCtx.effectiveNetEnergyDemand === 'moderate' ? 140 : 115;
    const targetEr = Math.max(100, baseErNeed + (sandboxCtx.erDeltaPct || 0));
    if (er >= targetEr + 10) {
      weights.enerRech_ = Number(Math.min(weights.enerRech_, 0.35).toFixed(2));
      alerts.push({
        kind: 'er_met',
        tone: 'ok',
        text: `ER ${er.toFixed(1)}% exceeds ${sandboxCtx.deploymentMode?.shortLabel || 'Abyss'} target (~${targetEr}%) — excess ER% tapered.`
      });
    } else if (er < targetEr - 12) {
      weights.enerRech_ = 1.0;
      alerts.push({
        kind: 'er_low',
        tone: 'warn',
        text: `ER ${er.toFixed(1)}% is below ${sandboxCtx.deploymentMode?.shortLabel || 'Abyss'} target (~${targetEr}%) — ER% Sands or battery needed.`
      });
    }
  }

  // 3. Stat Cap Taper (e.g. Vodyanitsa 65,000 HP cap)
  if (statCapVal && profile?.statThresholdCurve?.statKey === 'hp_' && Number(t.hp || 0) >= statCapVal) {
    weights.hp_ = Number(Math.min(weights.hp_ || 1.0, 0.4).toFixed(2));
    weights.hp = Number(Math.min(weights.hp || 0.5, 0.2).toFixed(2));
    alerts.push({
      kind: 'cap_met',
      tone: 'ok',
      text: `HP ${Math.round(t.hp).toLocaleString()} reached ${statCapVal.toLocaleString()} cap — pivot remaining rolls to CRIT / ER%.`
    });
  }

  return {
    ...sandboxCtx,
    effectiveSubstatWeights: weights,
    tradeoffAlerts: alerts
  };
}

/**
 * Teams Lab Squad-Level Tradeoff & Elemental Gauge Stability Analyzer:
 * Checks Field-Time Overlap, Team Buff Saturation / Non-Stacking Sets, and Aura Stability.
 */
export function analyzeTeamTradeoffs(squadKeys = [], allProfiles = {}, charMetaFn = null, gaugeTable = {}, account = null) {
  const keys = (squadKeys || []).filter(Boolean);
  if (keys.length < 2) return [];
  const findings = [];
  const ownedMap = new Map(((account && account.characters) || []).map((c) => [c.key, c]));

  // 1. Field-Time Overlap Check
  const dedicatedOnField = keys.filter((k) => {
    const p = allProfiles[k];
    if (!p) return false;
    const r = p.roles || [];
    return r.includes('on_field_carry') && !p.features?.has_off_field && !r.includes('support_buffer');
  });
  if (dedicatedOnField.length >= 2) {
    const names = dedicatedOnField.map((k) => allProfiles[k]?.name || k).join(' + ');
    findings.push({
      tone: 'warn',
      title: 'Field-Time Overlap',
      detail: `${names} both demand extended on-field uptime — swap one for an off-field sub-DPS or buffer.`
    });
  } else if (dedicatedOnField.length === 1) {
    findings.push({
      tone: 'ok',
      title: 'Clean Field-Time Split',
      detail: `${allProfiles[dedicatedOnField[0]]?.name || dedicatedOnField[0]} anchors on-field uptime while teammates rotate off-field.`
    });
  }

  // 2. Team Buff Saturation & Non-Stacking Set Overlap
  const atkBuffers = keys.filter((k) => (allProfiles[k]?.supply?.teamAtk || 0) >= 0.65);
  if (atkBuffers.length >= 2) {
    findings.push({
      tone: 'warn',
      title: 'ATK Buff Saturation',
      detail: `${atkBuffers.map((k) => allProfiles[k]?.name || k).join(' + ')} both stack flat/ATK% buffs (diminishing returns) — diversify with RES shred or DMG%.`
    });
  }
  const hasResShred = keys.some((k) => (allProfiles[k]?.supply?.resShred || 0) >= 0.5 || allProfiles[k]?.features?.has_res_shred);
  if (!hasResShred && keys.length >= 3) {
    findings.push({
      tone: 'warn',
      title: 'Missing RES Shred',
      detail: 'No teammate provides Elemental/Physical RES shred — consider an Anemo VV holder, Xilonen, Chevreuse, or Zhongli.'
    });
  }

  // 3. Elemental Gauge & Aura Stability Check (from gauge_table.json + constellations)
  const auraProviders = [];
  const triggerDrivers = [];
  for (const k of keys) {
    const g = gaugeTable?.[k];
    if (!g) continue;
    const con = Number(ownedMap.get(k)?.constellation || 0);
    let ups = Number(g.unitsPerSec || 0.7);
    let conNote = '';
    if (g.constellationShifts) {
      for (const [reqC, shift] of Object.entries(g.constellationShifts)) {
        if (con >= Number(reqC)) {
          ups = Math.max(ups, Number(shift.unitsPerSec || ups));
          conNote = `C${reqC} active`;
        }
      }
    }
    const entry = { key: k, name: allProfiles[k]?.name || charMetaFn?.(k)?.name || k, ...g, ups, con, conNote };
    if (g.role === 'aura_provider' || g.role === 'dual') auraProviders.push(entry);
    if (g.role === 'trigger_driver' || g.role === 'dual') triggerDrivers.push(entry);
  }

  for (const drv of triggerDrivers) {
    if (!drv.preferredAura) continue;
    const matchingAuras = auraProviders.filter((a) => a.key !== drv.key && a.element === drv.preferredAura);
    if (!matchingAuras.length) continue;
    const totalAuraUps = matchingAuras.reduce((acc, a) => acc + a.ups, 0);
    const ratio = totalAuraUps / Math.max(0.1, drv.ups);
    const auraNames = matchingAuras.map((a) => `${a.name}${a.conNote ? ` (${a.conNote})` : ''}`).join(' + ');
    if (ratio < 1.15) {
      findings.push({
        tone: 'warn',
        title: `Thin ${drv.preferredAura} Aura (${ratio.toFixed(2)}x)`,
        detail: `${auraNames} (${totalAuraUps.toFixed(2)}U/s) may drop ${drv.preferredAura} aura against ${drv.name} (${drv.ups.toFixed(2)}U/s). Add a 2nd ${drv.preferredAura} unit or Xingqiu C6.`
      });
    } else {
      findings.push({
        tone: 'ok',
        title: `Stable ${drv.preferredAura} Aura (${ratio.toFixed(2)}x)`,
        detail: `${auraNames} (${totalAuraUps.toFixed(2)}U/s) cleanly sustains ${drv.name}'s reaction cadence (${drv.ups.toFixed(2)}U/s).`
      });
    }
  }

  return findings;
}

/**
 * Ranks Artifact Domains & Mystic Offering (Strongbox) efficiency across a list of target characters
 * by running each character's active Build Mode & Teammate context against `set_vectors.json`.
 */
export function rankArtifactDomainEfficiency(charKeys = [], allProfiles = {}, charMetaFn = null, setVectors = [], options = {}) {
  const {
    deploymentMode = 'abyss',
    scenarioMode = 'st',
    buildLensByChar = {},
    activeModeByChar = {},
    withFurinaByChar = {},
    savedTeams = []
  } = options;

  if (!Array.isArray(setVectors) || !setVectors.length) {
    return { domains: [], totalCharsAnalyzed: 0 };
  }

  // Group all 5★ sets by domain + region
  const domainMap = new Map();
  const setToDomainKey = new Map();
  for (const s of setVectors) {
    const domName = s.domain || 'Artifact Domain';
    const region = s.region || 'Teyvat';
    const domKey = `${domName}::${region}`;
    if (!domainMap.has(domKey)) {
      domainMap.set(domKey, {
        domainKey: domKey,
        domain: domName,
        region,
        sets: []
      });
    }
    const domEntry = domainMap.get(domKey);
    domEntry.sets.push({
      name: s.name,
      lookupKey: s.lookupKey,
      setId: s.setId,
      icon: s.icon || '',
      twoPc: s.twoPc || '',
      matchedChars: [],
      _charWeightMap: new Map()
    });
    setToDomainKey.set(s.lookupKey, domKey);
    if (s.setId) setToDomainKey.set(String(s.setId), domKey);
  }

  const validKeys = [...new Set((charKeys || []).filter((k) => k && allProfiles[k]))];
  for (const charKey of validKeys) {
    const profile = allProfiles[charKey];
    const meta = charMetaFn
      ? charMetaFn(charKey)
      : { name: profile.name || charKey, element: profile.element || 'Geo', weaponType: profile.weaponType || 'Sword' };
    const furinaInSquad = (savedTeams || []).some(
      (t) => Array.isArray(t?.members) && t.members.includes(charKey) && t.members.includes('Furina')
    );
    const ctx = applySandboxContext(charKey, profile, {
      deploymentMode,
      scenarioMode,
      activeLens: buildLensByChar[charKey] || '',
      activeModeId: activeModeByChar[charKey] || '',
      withFurina: withFurinaByChar[charKey] ?? furinaInSquad,
      allProfiles,
      charMetaFn
    });

    const rankedSets = rankArtifactSetsByVector(meta, profile, ctx, setVectors).filter((r) => Boolean(r.setId));
    rankedSets.forEach((rec, idx) => {
      const weight = idx === 0 ? 1.0 : 0.55;
      const dKey = setToDomainKey.get(String(rec.setId)) || null;
      if (!dKey) return;
      const domEntry = domainMap.get(dKey);
      const setEntry = domEntry?.sets.find((x) => x.setId === rec.setId);
      if (!setEntry) return;
      const prev = setEntry._charWeightMap.get(charKey);
      if (!prev || weight > prev.weight) {
        setEntry._charWeightMap.set(charKey, {
          key: charKey,
          name: meta.name || profile.name || charKey,
          rank: idx + 1,
          weight
        });
      }
    });
  }

  const domains = [];
  for (const domEntry of domainMap.values()) {
    const uniqueCharKeys = new Set();
    let activeSetsUsedCount = 0;
    let totalWeight = 0;

    const cleanSets = domEntry.sets.map((s) => {
      const matchedChars = [...s._charWeightMap.values()].sort((a, b) => a.rank - b.rank || b.weight - a.weight);
      if (matchedChars.length > 0) activeSetsUsedCount += 1;
      for (const mc of matchedChars) {
        uniqueCharKeys.add(mc.key);
        totalWeight += mc.weight;
      }
      return {
        name: s.name,
        lookupKey: s.lookupKey,
        setId: s.setId,
        icon: s.icon,
        twoPc: s.twoPc,
        matchedChars
      };
    });

    if (uniqueCharKeys.size === 0) continue;

    const isStrongboxOnlyDomain = domEntry.domain === 'World / Weekly Bosses & Strongbox';
    const isStrongboxEligible = !['Nod-Krai', 'Snezhnaya', 'Natlan'].includes(domEntry.region) || isStrongboxOnlyDomain;

    let verdict = 'Single-Unit Farm';
    let verdictTone = 'muted';
    let reason = 'Only 1 target needs this newer domain (not yet in Mystic Offering).';

    if (isStrongboxOnlyDomain) {
      verdict = 'Strongbox / Boss';
      verdictTone = 'muted';
      reason = 'Drops from World/Weekly Bosses & Mystic Offering — never spend dedicated domain resin.';
    } else if (activeSetsUsedCount >= 2) {
      verdict = '2-for-1 Farm';
      verdictTone = 'mint';
      reason = 'Both 5★ sets in this domain serve your targets — highest resin efficiency.';
    } else if (uniqueCharKeys.size >= 2) {
      verdict = 'Farm Direct';
      verdictTone = 'gold';
      reason = `${uniqueCharKeys.size} targets share this set — strong direct farming value.`;
    } else if (isStrongboxEligible) {
      verdict = 'Strongbox';
      verdictTone = 'warn';
      reason = 'Only 1 set for 1 target — spend resin in a 2-for-1 domain and Strongbox fodder here.';
    }

    const efficiencyScore = Number(
      (
        totalWeight +
        (activeSetsUsedCount >= 2 ? 2.5 : 0) +
        (uniqueCharKeys.size >= 2 ? 1.0 : 0) -
        (isStrongboxOnlyDomain ? 3.0 : 0)
      ).toFixed(2)
    );

    domains.push({
      domain: domEntry.domain,
      region: domEntry.region,
      sets: cleanSets,
      activeSetsUsedCount,
      uniqueCharCount: uniqueCharKeys.size,
      isStrongboxEligible,
      verdict,
      verdictTone,
      reason,
      efficiencyScore
    });
  }

  domains.sort((a, b) => b.efficiencyScore - a.efficiencyScore || b.uniqueCharCount - a.uniqueCharCount);
  return { domains, totalCharsAnalyzed: validKeys.length };
}
