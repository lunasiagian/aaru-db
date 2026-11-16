import { getCharacterMeta, getKqmEntry, getWeaponsIndex } from '../catalog.js?v=20261115ag';
import {
  analyzeCharacterKit,
  buildKitProfile,
  extractKitScaling,
  parsePrimaryMultiplierNumber
} from './kit-taxonomy.js';

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

export { SIGNATURE_WEAPONS, getSignatureWeapon } from './kit-taxonomy.js';

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
    (w) =>
      w.weaponType === weaponType &&
      (w.acquisition !== 'platform_exclusive' || ownedByKey.has(String(w.key || '').toLowerCase()))
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
  const hasEquippedArtifacts = Boolean(profile?.hasEquippedArtifacts || (profile?.combatStats && erReport));
  const erComfortablyMet =
    hasEquippedArtifacts &&
    erReport &&
    Number(erReport.erDelta) >= 10 &&
    (!erReport.hasEndgameFlag || Number(erReport.soloDelta) >= 0);
  const erDeficit = hasEquippedArtifacts && erReport && Number(erReport.erDelta) < 0;
  const erNeedGate = erComfortablyMet ? 0 : Math.max(0, burstCost - 40) / 40;

  const combatStats = profile?.combatStats || null;
  const teamCaps = profile?.teamCaps || null;
  const unmetCaps = [];
  if (teamCaps?.buffCap && Number(teamCaps.buffCap.gap) > 0 && teamCaps.buffCap.statKey) {
    unmetCaps.push({
      statKey: teamCaps.buffCap.statKey,
      gap: Math.round(Number(teamCaps.buffCap.gap)),
      label: teamCaps.buffCap.statLabel || teamCaps.buffCap.statKey.toUpperCase()
    });
  }
  if (combatStats && Array.isArray(profile?.statCaps)) {
    for (const sc of profile.statCaps) {
      if (!sc?.statKey || !Number.isFinite(Number(sc.capValue))) continue;
      const curVal = Number(combatStats[sc.statKey]) || 0;
      const gap = Math.round(Number(sc.capValue) - curVal);
      if (gap > 0 && !unmetCaps.some((u) => u.statKey === sc.statKey)) {
        const labelMap = { em: 'EM', maxHp: 'Max HP', totalDef: 'DEF', totalAtk: 'ATK' };
        unmetCaps.push({ statKey: sc.statKey, gap, label: labelMap[sc.statKey] || sc.statKey });
      }
    }
  }

  const scoreList = (pool, { includeOwnedBonus = false, useTheoreticalRef = false } = {}) =>
    pool.map((cand) => {
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
      const isPlatformExclusive = cand.acquisition === 'platform_exclusive';
      const emPassiveMismatch = mTags.has('em_scale') && !scalingStatsSet.has('EM');

      const rarityBase = cand.rarity === 5 ? 16 : cand.rarity === 4 ? 12 : 6;
      const ownedMatch = ownedByKey.get(String(cand.key || '').toLowerCase()) || null;
      const ownedBonus = includeOwnedBonus && ownedMatch ? 8 : 0;
      const effectiveRef = useTheoreticalRef ? (Number(cand.rarity) <= 4 ? 5 : 1) : getEffectiveRefinement(cand, ownedMatch);
      const substatMag = parsePrimaryMultiplierNumber(cand.substatValue) || 0;

      // --- Linear DPS Score ---
      const starglitterPenalty = !includeOwnedBonus && cand.acquisition === 'starglitter' ? -12 : 0;
      const onKillPenalty = mTags.has('on_kill') ? -10 : 0;
      let dpsScore =
        rarityBase +
        ownedBonus +
        Math.min(4, effectiveRef - 1) +
        (missingMechanic ? -25 : 0) +
        (isPlatformExclusive ? -10 : 0) +
        starglitterPenalty +
        onKillPenalty;
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

      const isDualHpScaler = profile.primaryStatKey !== 'hp_' && scalingStatsSet.has('HP') && isHpWeapon;
      const isDualDefScaler = profile.primaryStatKey !== 'def_' && scalingStatsSet.has('DEF') && isDefWeapon;
      const isDualEmScaler = profile.primaryStatKey !== 'eleMas' && scalingStatsSet.has('EM') && isEmWeapon;
      if (isDualHpScaler) dpsHybridPts += isCritWeapon ? 28 : 22;
      if (isDualDefScaler) dpsHybridPts += isCritWeapon ? 28 : 22;
      if (isDualEmScaler) dpsHybridPts += 22;

      if (!profile.isNonCrit && isCritWeapon) {
        const normCrit = /crit\s*rate/i.test(substat) ? substatMag * 2 : substatMag;
        dpsCritPts += 28 + Math.round(normCrit * 0.15);
      }
      if (mTags.has('elem_dmg') && (!mTags.has('party_buff') || isCritWeapon)) dpsPrimaryPts += 14;
      if (profile.primaryStatKey === 'atk_') {
        const baseAtkPts = Math.round((Math.max(350, Number(cand.baseAtk) || 454) - 350) * 0.14);
        dpsPrimaryPts += baseAtkPts;
      }
      if (!emPassiveMismatch && !isPlatformExclusive && !missingMechanic) {
        if ((profile.primaryAttackType === 'normal' || profile.primaryAttackType === 'mixed') && mTags.has('na_dmg')) {
          dpsPrimaryPts += 18;
        }
        if ((profile.primaryAttackType === 'charged' || profile.primaryAttackType === 'mixed') && mTags.has('ca_dmg')) {
          dpsPrimaryPts += profile.primaryAttackType === 'charged' ? 24 : 18;
        }
        if (mTags.has('atk_buff') && scalingStatsSet.has('ATK')) {
          dpsPrimaryPts += 10;
        }
        if (profile.scaling?.damageSources?.includes('Elemental Skill') && mTags.has('skill_dmg')) dpsPrimaryPts += 12;
        if (profile.scaling?.damageSources?.includes('Elemental Burst') && mTags.has('burst_dmg')) dpsPrimaryPts += 12;
        if (
          role === 'Off-Field Sub-DPS' &&
          (profile.nativeElement === 'Electro' || profile.nativeElement === 'Dendro') &&
          mTags.has('em_scale') &&
          mTags.has('skill_dmg')
        ) {
          dpsPrimaryPts += 14;
        }
      } else if (emPassiveMismatch) {
        dpsScore -= 10;
      }
      if (mTags.has('ca_penalty') && profile.primaryAttackType === 'charged') {
        dpsScore -= 35;
      }
      const isDpsSignature = Boolean(profile.signatureDpsWeapon && cand.name === profile.signatureDpsWeapon);
      const isSupSignature = Boolean(profile.signatureSupportWeapon && cand.name === profile.signatureSupportWeapon);
      const isSignature = isDpsSignature || isSupSignature;
      if (isDpsSignature && !missingMechanic && !isHealerLocked) {
        dpsPrimaryPts += 20;
      }
      if (reqMechs.includes('charged_attack') && role === 'Off-Field Sub-DPS' && profile.primaryAttackType !== 'charged' && profile.primaryAttackType !== 'mixed') {
        dpsScore -= 30;
      }
      if (role === 'Off-Field Sub-DPS' && (mTags.has('na_dmg') || mTags.has('ca_dmg')) && !mTags.has('burst_dmg') && !mTags.has('skill_dmg')) {
        dpsScore -= 10;
      }
      if (!isHealerLocked && isErWeapon && erNeedGate > 0) {
        dpsErPts += Math.round(10 * erNeedGate) + (erDeficit ? 12 : 0);
      }

      let capFillPts = 0;
      let matchedCap = null;
      for (const uc of unmetCaps) {
        const matches =
          (uc.statKey === 'em' && isEmWeapon) ||
          (uc.statKey === 'maxHp' && isHpWeapon) ||
          (uc.statKey === 'totalDef' && isDefWeapon) ||
          (uc.statKey === 'totalAtk' && /atk/i.test(substat));
        if (matches) {
          capFillPts = 16;
          matchedCap = uc;
          break;
        }
      }

      if (isHealerLocked) dpsScore -= 20;
      if (isTtds || (isFavonius && role === 'On-Field Carry')) dpsScore -= 25;

      dpsScore += dpsPrimaryPts + dpsHybridPts + dpsCritPts + dpsErPts + capFillPts;

      const dpsFactors = [
        { key: 'cap_fill', pts: capFillPts },
        { key: 'hybrid_scale', pts: dpsHybridPts },
        { key: 'crit_stick', pts: dpsCritPts },
        { key: 'er_threshold', pts: dpsErPts },
        { key: 'primary_scale', pts: dpsPrimaryPts }
      ].sort((a, b) => b.pts - a.pts);
      const dpsWinningFactor = dpsFactors[0].pts > 0 ? dpsFactors[0].key : 'primary_scale';

      // --- Linear Support Score: Zero rarity/Base-ATK penalty ---
      let teamUtilityScore = 0;
      let partyBuffPts = 0;
      let teamParticlesPts = 0;
      let skillResetPts = 0;

      const isGeoDefEmBuffMismatch =
        profile.nativeElement === 'Geo' &&
        scalingStatsSet.has('DEF') &&
        !scalingStatsSet.has('EM') &&
        (isEmWeapon || /elegy/i.test(lowerName));

      if (!isHealerLocked && !missingMechanic && (mTags.has('party_buff') || isTtds)) {
        const basePartyBuff = isGeoDefEmBuffMismatch ? 32 : 65;
        partyBuffPts = basePartyBuff + (isTtds && effectiveRef >= 5 ? 6 : Math.min(4, effectiveRef - 1));
      }
      if (isFavonius) {
        const geoBurstParticleBonus = profile.nativeElement === 'Geo' && burstCost >= 70 ? 12 : 0;
        teamParticlesPts = 48 + geoBurstParticleBonus + Math.min(4, effectiveRef - 1);
      }
      if (mTags.has('skill_reset')) {
        skillResetPts =
          46 +
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

      let compatPenalty = (isHealerLocked ? -20 : 0) + (missingMechanic ? -25 : 0);
      if (!scalingStatsSet.has('HP') && isHpSubstat && !isTtds) compatPenalty -= 35;
      if (!scalingStatsSet.has('DEF') && isDefSubstat) compatPenalty -= 35;
      if (!scalingStatsSet.has('ATK') && (scalingStatsSet.has('DEF') || scalingStatsSet.has('HP')) && /atk/i.test(substat)) {
        compatPenalty -= 20;
      }

      const erThresholdPts =
        !isHealerLocked && isErWeapon && erNeedGate > 0
          ? Math.round((24 + (erBelowTarget ? 8 : 0)) * erNeedGate) + (erDeficit ? 12 : 0)
          : 0;
      const hasSupportScalingMatch =
        (scalingStatsSet.has('DEF') && isDefSubstat) ||
        (scalingStatsSet.has('HP') && isHpSubstat) ||
        (scalingStatsSet.has('EM') && /mastery|em/i.test(substat));
      const partyBuffScalingBonus = !isHealerLocked && !missingMechanic && mTags.has('party_buff') && hasSupportScalingMatch ? 20 : 0;
      const sigSupportBonus = isSupSignature && !missingMechanic && !isHealerLocked && isSupportRole ? 12 : 0;
      const supportScore =
        ownedBonus +
        teamUtilityScore +
        defensiveScalingScore +
        erThresholdPts +
        partyBuffScalingBonus +
        sigSupportBonus +
        capFillPts +
        compatPenalty;

      const supFactors = [
        { key: 'cap_fill', pts: capFillPts },
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
        matchedCap,
        dpsScore,
        supportScore,
        dpsWinningFactor,
        supWinningFactor,
        ownedMatch
      };
    });

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
      case 'cap_fill':
        return w.matchedCap
          ? `Closes +${w.matchedCap.gap} ${w.matchedCap.label} gap toward kit cap${erComfortablyMet ? ' (ER already covered)' : ''}.`
          : `${statText} closes unmet kit stat cap.`;
      case 'er_threshold':
        return `Meets ${burstCost}-cost Burst ER threshold (${statText}).`;
      default:
        return `${statText} aligned with ${profile.primaryScaling} kit.`;
    }
  }

  const hasTeamSupportUtility =
    isHealer ||
    isShielder ||
    tags.some((t) => /Buffer|RES Shred|DEF Shred|Crowd Control|Team IR|Energy Battery/i.test(t));
  const isPureCarry = role === 'On-Field Carry' && !hasTeamSupportUtility;
  const isPureSupportRole = role === 'Quickswap Support' && !tags.some((t) => /Sub-DPS/i.test(t));

  const pickFourBuckets = (scoredList, { strictAccessible = true, labels = null, erLabel = 'ER / Comfort' } = {}) => {
    const usedKeys = new Set();
    const pickTop = (list, tierLabel, factorProp, forcedFactor = null) => {
      const found = list.find((w) => !usedKeys.has(w.key));
      if (!found) return null;
      usedKeys.add(found.key);
      const factor = forcedFactor || found[factorProp];
      return {
        ...found,
        tierLabel,
        winningFactor: factor,
        reason: buildWeaponReason(found, factor)
      };
    };

    const isGacha4 = (w) => w.rarity <= 4 && w.acquisition === 'gacha_4';
    const isAccessible = (w) => {
      if (w.acquisition !== 'f2p_craft_fish' && w.acquisition !== 'gacha_4') return false;
      if (w.rarity === 4) return true;
      if (w.rarity === 3) {
        const tagsSet = new Set(w.mechanicTags || []);
        return tagsSet.has('party_buff') || (/hp/i.test(w.substat || '') && (isShielder || isHealer));
      }
      return false;
    };
    const craftBonus = (w) => (w.acquisition === 'f2p_craft_fish' ? 10 : 0);
    const supCraftBonus = (w) => {
      if (w.acquisition !== 'f2p_craft_fish') return 0;
      const tagsSet = new Set(w.mechanicTags || []);
      const hasSupUtil =
        tagsSet.has('party_buff') ||
        tagsSet.has('team_particles') ||
        tagsSet.has('skill_reset') ||
        ((isShielder || isHealer) &&
          ((scalingStatsSet.has('HP') && (tagsSet.has('hp_scale') || /hp/i.test(w.substat || ''))) ||
            (scalingStatsSet.has('DEF') && (tagsSet.has('def_scale') || /def/i.test(w.substat || ''))) ||
            (scalingStatsSet.has('EM') && tagsSet.has('em_scale')))) ||
        (burstCost >= 60 && (tagsSet.has('er_battery') || /energy\s*recharge/i.test(w.substat || '')));
      return hasSupUtil ? 10 : 0;
    };

    const byDps = [...scoredList].sort((a, b) => b.dpsScore - a.dpsScore || b.rarity - a.rarity || a.name.localeCompare(b.name));
    const bySup = [...scoredList].sort((a, b) => b.supportScore - a.supportScore || b.rarity - a.rarity || a.name.localeCompare(b.name));
    const accBase = scoredList.filter(isAccessible);
    const accFallback = scoredList.filter((w) => w.rarity <= 4 && (w.acquisition === 'f2p_craft_fish' || w.acquisition === 'gacha_4'));
    const accPool = accBase.length ? accBase : accFallback;
    const byDpsAcc = strictAccessible
      ? [...accPool].sort((a, b) => (b.dpsScore + craftBonus(b)) - (a.dpsScore + craftBonus(a)) || b.rarity - a.rarity || a.name.localeCompare(b.name))
      : byDps;
    const bySupAcc = strictAccessible
      ? [...accPool].sort((a, b) => (b.supportScore + supCraftBonus(b)) - (a.supportScore + supCraftBonus(a)) || b.rarity - a.rarity || a.name.localeCompare(b.name))
      : bySup;
    const byErComfort = [...scoredList]
      .filter((w) => (w.mechanicTags || []).includes('er_battery') || (w.mechanicTags || []).includes('skill_reset') || /energy\s*recharge/i.test(w.substat))
      .sort((a, b) => (b.dpsScore + b.supportScore * 0.5) - (a.dpsScore + a.supportScore * 0.5) || b.rarity - a.rarity);

    const l = labels || ['BiS DPS', 'Accessible DPS', 'BiS Support', 'Accessible Support'];
    const bisDps = pickTop(byDps, l[0], 'dpsWinningFactor');
    const accDps = pickTop(byDpsAcc, l[1], 'dpsWinningFactor');
    const bisSup = isPureCarry ? null : pickTop(bySup, l[2], 'supWinningFactor');
    const accSup = isPureCarry ? null : pickTop(bySupAcc, l[3], 'supWinningFactor');
    const comfortEr = isPureCarry && burstCost >= 70 ? pickTop(byErComfort, erLabel, 'dpsWinningFactor', 'er_threshold') : null;

    let visibleSlots;
    if (isPureCarry) {
      visibleSlots = [bisDps, accDps, comfortEr].filter(Boolean);
    } else if (isPureSupportRole) {
      visibleSlots = [bisSup, accSup].filter(Boolean);
    } else {
      visibleSlots = isSupportRole ? [bisSup, accSup, bisDps, accDps].filter(Boolean) : [bisDps, accDps, bisSup, accSup].filter(Boolean);
    }

    const notableGacha4 = [];
    if (strictAccessible) {
      const visibleKeys = new Set(visibleSlots.map((w) => w.key));
      const seenNotable = new Set();
      const dpsFloor = accDps ? accDps.dpsScore : -Infinity;
      const supFloor = accSup ? accSup.supportScore : -Infinity;
      const dpsGachaPool = !isPureSupportRole
        ? byDps
            .filter((w) => isGacha4(w) && !visibleKeys.has(w.key) && w.dpsScore >= dpsFloor)
            .map((w) => ({ ...w, reason: buildWeaponReason(w, w.dpsWinningFactor) }))
        : [];
      const supGachaPool = !isPureCarry
        ? bySup
            .filter((w) => isGacha4(w) && !visibleKeys.has(w.key) && w.supportScore >= supFloor)
            .map((w) => ({ ...w, reason: buildWeaponReason(w, w.supWinningFactor) }))
        : [];
      const orderedGacha = isSupportRole ? [...supGachaPool, ...dpsGachaPool] : [...dpsGachaPool, ...supGachaPool];
      for (const w of orderedGacha) {
        if (seenNotable.has(w.key)) continue;
        seenNotable.add(w.key);
        notableGacha4.push(w);
        if (notableGacha4.length >= 2) break;
      }
    }

    return Object.assign([...visibleSlots], {
      visibleSlots,
      bisDps,
      accessibleDps: accDps,
      bisSupport: bisSup,
      accessibleSupport: accSup,
      comfortEr,
      notableGacha4
    });
  };

  // 1. Best Overall: Pure kit science, ZERO Armory bonus, exclude event_limited & platform_exclusive
  const bestOverallPool = indexPool.filter(
    (w) => w.acquisition !== 'event_limited' && w.acquisition !== 'platform_exclusive'
  );
  const bestOverall = pickFourBuckets(
    scoreList(bestOverallPool, { includeOwnedBonus: false, useTheoreticalRef: true }),
    { strictAccessible: true }
  );

  // 2. In Your Armory: Strictly owned weapons in user's bag (including BP / event_limited / limited_4 / 5★)
  const allPool = [...indexPool, ...extraOwned];
  const armoryPool = allPool.filter((w) => ownedByKey.has(String(w.key || '').toLowerCase()));
  const inArmory = pickFourBuckets(
    scoreList(armoryPool, { includeOwnedBonus: true, useTheoreticalRef: false }),
    {
      strictAccessible: false,
      labels: isPureCarry
        ? ['Best Owned DPS', 'Alt Owned DPS', 'Owned Utility #1', 'Owned Utility #2']
        : ['Best Owned DPS', 'Alt Owned DPS', 'Best Owned Support', 'Alt Owned Support'],
      erLabel: 'Best Owned ER Comfort'
    }
  );

  return { bestOverall, inArmory };
}

/**
 * Legacy wrapper delegating to buildKitProfile + recommendWeapons (returns bestOverall array).
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
  return recommendWeapons(profile, getWeaponsIndex(), accountWeapons, getWeaponMetaFn, getWeaponStatsFn).bestOverall;
}
