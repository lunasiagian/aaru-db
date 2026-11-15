/**
 * Kit Parser & Build Recommender Barrel Module
 * Re-exports deterministic kit scaling, build stat guidelines, and weapon recommendation helpers.
 */
export {
  analyzeCharacterKit,
  classifyCharacterRole,
  extractKitScaling,
  getBuildStatGuidelines,
  recommendWeaponsForCharacter
} from './build-science.js?v=20261115ad';
