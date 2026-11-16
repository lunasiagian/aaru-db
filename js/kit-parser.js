/**
 * Kit Parser & Build Recommender Barrel Module
 * Re-exports deterministic kit scaling, build stat guidelines, and weapon recommendation helpers.
 */
export {
  analyzeCharacterKit,
  buildKitProfile,
  classifyCharacterRole,
  deriveTalentPriority,
  evaluateCharacterBuild,
  resolveMemberTeamRole,
  extractKitScaling,
  getBuildStatGuidelines,
  recommendWeapons,
  recommendWeaponsForCharacter
} from './build-science.js?v=20261115ah';
