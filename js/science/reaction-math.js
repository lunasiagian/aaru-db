/**
 * KQM Theorycrafting Library (KQM-git/TCL) Damage & Elemental Reaction Formulas.
 * Reference: https://library.keqingmains.com/ | https://github.com/KQM-git/TCL
 */

export const TRANSFORMATIVE_BASE_MULT = {
  overloaded: 2.0,
  shattered: 1.5,
  electro_charged: 1.2,
  superconduct: 0.5,
  swirl: 0.6,
  bloom: 2.0,
  hyperbloom: 3.0,
  burgeon: 3.0,
  burning: 0.25
};

export const ADDITIVE_BASE_MULT = {
  aggravate: 1.15,
  spread: 1.25
};

// Standard Genshin Impact Level Multipliers (Lv. 1–90) for Transformative & Additive reactions
const LEVEL_MULT_ANCHORS = {
  1: 17.17,
  10: 34.14,
  20: 80.58,
  30: 136.29,
  40: 207.38,
  50: 323.6,
  60: 492.88,
  70: 765.64,
  80: 1077.44,
  85: 1253.84,
  90: 1446.85
};

export function getReactionLevelMultiplier(level = 90) {
  const lv = Math.min(90, Math.max(1, Math.round(Number(level) || 90)));
  if (LEVEL_MULT_ANCHORS[lv] != null) return LEVEL_MULT_ANCHORS[lv];
  const keys = Object.keys(LEVEL_MULT_ANCHORS).map(Number).sort((a, b) => a - b);
  let lo = 1;
  let hi = 90;
  for (let i = 0; i < keys.length - 1; i += 1) {
    if (lv >= keys[i] && lv <= keys[i + 1]) {
      lo = keys[i];
      hi = keys[i + 1];
      break;
    }
  }
  const t = (lv - lo) / Math.max(1, hi - lo);
  return Number((LEVEL_MULT_ANCHORS[lo] + t * (LEVEL_MULT_ANCHORS[hi] - LEVEL_MULT_ANCHORS[lo])).toFixed(2));
}

export function calcResMultiplier(res = 0.1) {
  const r = Number(res) || 0;
  if (r < 0) return 1 - r / 2;
  if (r >= 0.75) return 1 / (4 * r + 1);
  return 1 - r;
}

export function calcDefMultiplier(charLevel = 90, enemyLevel = 90, defShred = 0, defIgnore = 0) {
  const cLv = Math.max(1, Number(charLevel) || 90);
  const eLv = Math.max(1, Number(enemyLevel) || 90);
  const shred = Math.min(0.9, Math.max(0, Number(defShred) || 0));
  const ignore = Math.min(0.9, Math.max(0, Number(defIgnore) || 0));
  return (cLv + 100) / (cLv + 100 + (eLv + 100) * (1 - shred) * (1 - ignore));
}

export function calcAmplifyingMultiplier(em = 0, baseMult = 1.5, reactionBonus = 0) {
  const m = Math.max(0, Number(em) || 0);
  const b = Math.max(0, Number(reactionBonus) || 0);
  return baseMult * (1 + (2.78 * m) / (1400 + m) + b);
}

export function calcAdditiveBonus(level = 90, em = 0, reaction = 'aggravate', reactionBonus = 0) {
  const m = Math.max(0, Number(em) || 0);
  const b = Math.max(0, Number(reactionBonus) || 0);
  const coeff = ADDITIVE_BASE_MULT[String(reaction).toLowerCase()] ?? 1.15;
  const lvlMult = getReactionLevelMultiplier(level);
  return coeff * lvlMult * (1 + (5 * m) / (1200 + m) + b);
}

export function calcTransformativeDmg(
  level = 90,
  em = 0,
  reaction = 'hyperbloom',
  enemyRes = 0.1,
  reactionBonus = 0
) {
  const m = Math.max(0, Number(em) || 0);
  const b = Math.max(0, Number(reactionBonus) || 0);
  const coeff = TRANSFORMATIVE_BASE_MULT[String(reaction).toLowerCase()] ?? 2.0;
  const lvlMult = getReactionLevelMultiplier(level);
  return coeff * lvlMult * (1 + (16 * m) / (2000 + m) + b) * calcResMultiplier(enemyRes);
}
