import { getWeaponsIndex } from './catalog.js?v=20261115ag';
import {
  buildKitProfile,
  deriveTalentPriority,
  extractKitScaling
} from './science/kit-taxonomy.js';
import { getBuildStatGuidelines, recommendWeapons } from './science/weapon-engine.js';

export * from './science/kit-taxonomy.js';
export * from './science/stat-math.js';
export * from './science/weapon-engine.js';

/**
 * Stage 4: Single-pass pipeline orchestrator for Character Dossier & Teams Lab.
 */
export function evaluateCharacterBuild(charData, contextOverride = {}) {
  const profile = buildKitProfile(charData, contextOverride);
  const talentPriority = deriveTalentPriority(profile);
  const guidelines = getBuildStatGuidelines(profile.charKey, profile.kitData, profile.analysis);
  const weapons = recommendWeapons(
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
    weapons,
    weaponRecommendations: weapons.bestOverall,
    erVerdict: profile.erReport || null
  };
}

export const evaluateBuild = evaluateCharacterBuild;
