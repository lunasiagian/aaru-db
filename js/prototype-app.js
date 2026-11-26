import {
  animateDossierHero,
  animatePrefarmEntrance,
  animateTodayEntrance,
  pulseReminderChip,
  pulseStepperValue
} from './motion.js?v=20261126p77';
import { renderAssetIcon, renderGachaSplash } from './assets.js?v=20261121p64';
import {
  ensureCharacterKitAndStats,
  ensureCharacterMaterials,
  ensureWeaponStats,
  getAllCharacterKeys,
  getAllStaticKitProfiles,
  getAllWeaponKeys,
  getArtifactIcon,
  getArtifactSetMeta,
  getCatalogStatus,
  getCharacterKit,
  getCharacterMeta,
  getDomainScheduleForDay,
  getEnemiesIndex,
  getGaugeTable,
  getMaterialMeta,
  getStaticKitProfile,
  getStaticSetVectors,
  getWeaponMeta,
  getWeaponsIndex,
  getWeaponStats,
  loadCatalog,
  normalizeAssetKey,
  refreshLiveCatalog
} from './catalog.js?v=20261121p64';
import {
  calcCoinPurse,
  calcEffectiveHerosWit,
  calcMoraStrategy,
  calcResinAllocationSummary,
  calcSpareReserves,
  calcTargetReadinessPct,
  calcTargetTelemetry,
  calcWishGoalProjection,
  calculatePrioritySharedPool,
  calculateTwoPassMilestonePlan,
  calculateWaterfallPrefarm,
  DEFAULT_WISH_GOAL,
  detectTeamWeaponConflicts,
  getPatchCalendarInfo,
  getServerResetInfo,
  SERVER_REGIONS,
  sortAndLabelPrefarmQueue
} from './calculations.js?v=20261126p73';
import {
  fetchPartnerAccount,
  getCachedAccountSession,
  isOfflineMode,
  loginAccount,
  logoutAccount,
  restoreAccountSession,
  saveAccountSection,
  setReadOnlyViewState,
  upsertRosterRow
} from './api.js?v=20261116a';
import { computeCharacterCombatStats, evaluateErComfort } from './build-science.js?v=20261125p67';
import { extractKitScaling } from './science/kit-taxonomy.js';
import { computeSubstatWeights } from './science/stat-math.js';
import {
  DEPLOYMENT_MODES,
  SCENARIO_MODES,
  applySandboxContext,
  analyzeTeamTradeoffs,
  evaluateTeamConditions,
  modulateContextWithEquippedTotals,
  rankArtifactDomainEfficiency,
  rankArtifactSetsByVector,
  rankPartnersAndSubstitutes,
  rankWeaponsByVector
} from './science/context-engine.js?v=20261126p80';
import { commitGoodImport, computeGoodImportDiff, validateGoodV3 } from './good-importer.js';
import { cloneMockAccount, MOCK_ACCOUNTS } from './mock-data.js';

const SESSION_KEY = 'genshin_sheet_session_v1';
const VIEW_TITLES = {
  hud: 'Today',
  prefarm: 'Prefarm Queue',
  roster: 'Characters',
  armory: 'Armory',
  teams: 'Teams Lab',
  vault: 'Vault'
};

const state = {
  sessionUser: null,
  ownAccount: null,
  partnerAccount: null,
  partnerUser: null,
  viewingPartner: false,
  visibleUsers: [],
  activeTab: 'hud',
  serverId: 'NA',
  focusedTargetId: null,
  prefarmExpandedId: null,
  prefarmDomainScope: 'queue',
  rosterSearch: '',
  rosterElement: 'All',
  rosterOwnership: 'owned',
  inspectedCharKey: null,
  dossierTab: 'loadout',
  kitSectionFilter: 'talents',
  kitTextMode: 'razor',
  buildLensByChar: {},
  activeModeByChar: {},
  priorityDialByChar: {},
  withFurinaByChar: {},
  deploymentMode: 'abyss',
  scenarioMode: 'st',
  lastDossierSnap: null,
  synergyAnchorKey: null,
  synergyTeamSlots: ['', '', ''],
  selectedEnemyId: '',
  armoryOwnership: 'owned',
  armoryFilter: 'All',
  armorySearch: '',
  vaultCategory: 'All',
  vaultSearch: '',
  vaultSortKey: 'needed',
  vaultSortDir: 'desc',
  pendingGoodImport: null,
  isPreviewDemo: false,
  prefarmSubTab: 'queue',
  prefarmAddOpen: false,
  prefarmSaveTimer: null
};

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatCompact(n) {
  const num = Number(n || 0);
  const abs = Math.abs(num);
  if (abs >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
  return num.toLocaleString();
}

const STAT_LABELS = {
  hp: 'HP', hp_: 'HP%', atk: 'ATK', atk_: 'ATK%', def: 'DEF', def_: 'DEF%',
  eleMas: 'EM', enerRech_: 'ER%', critRate_: 'CRIT Rate', critDMG_: 'CRIT DMG',
  heal_: 'Healing%', pyro_dmg_: 'Pyro DMG%', hydro_dmg_: 'Hydro DMG%',
  electro_dmg_: 'Electro DMG%', cryo_dmg_: 'Cryo DMG%', anemo_dmg_: 'Anemo DMG%',
  geo_dmg_: 'Geo DMG%', dendro_dmg_: 'Dendro DMG%', physical_dmg_: 'Physical DMG%'
};

function formatStatKey(key) {
  return STAT_LABELS[key] || String(key || '').replace(/_/g, ' ');
}

function splitPascalSet(setKey) {
  return String(setKey || '').replace(/([a-z])([A-Z])/g, '$1 $2');
}

function extractThresholdTarget(kitAnalysis, kitData, erReport) {
  const caps = Array.isArray(kitAnalysis?.statCaps) ? kitAnalysis.statCaps : [];
  const capStatMap = { maxHp: 'hp_', totalAtk: 'atk_', totalDef: 'def_', em: 'eleMas', er: 'enerRech_' };
  for (const cap of caps) {
    if (cap && typeof cap === 'object' && cap.statKey && Number(cap.capValue) > 0) {
      return { statKey: capStatMap[cap.statKey] || cap.statKey, targetValue: Number(cap.capValue) };
    }
    const text = String(cap?.label || cap?.text || cap || '');
    const m = text.match(/([\d,]+)\s*%?\s*(HP|ATK|DEF|EM|Elemental\s*Mastery|ER|Energy\s*Recharge)/i);
    if (m) {
      const val = Number(m[1].replace(/,/g, ''));
      const raw = m[2].toLowerCase();
      const statKey = raw.includes('hp') ? 'hp_' : raw.includes('def') ? 'def_' : raw.includes('atk') ? 'atk_' : raw.includes('mastery') || raw === 'em' ? 'eleMas' : 'enerRech_';
      if (val > 0) return { statKey, targetValue: val };
    }
  }
  const passiveText = (kitData?.passives || []).map((p) => p?.description || '').join(' ');
  const pm = passiveText.match(/max(?:imum)?[^.]{0,50}?([\d,]{3,6})\s*(Max\s*HP|HP|ATK|DEF|Elemental\s*Mastery|EM)/i);
  if (pm) {
    const val = Number(pm[1].replace(/,/g, ''));
    const raw = pm[2].toLowerCase();
    const statKey = raw.includes('hp') ? 'hp_' : raw.includes('def') ? 'def_' : raw.includes('atk') ? 'atk_' : 'eleMas';
    if (val > 0) return { statKey, targetValue: val };
  }
  if (erReport?.baseReq && erReport.baseReq > 105) {
    return { statKey: 'enerRech_', targetValue: erReport.baseReq };
  }
  return null;
}

function getCurrentStatForKey(combat, statKey) {
  if (!combat) return 0;
  if (statKey === 'hp_' || statKey === 'hp') return Number(combat.maxHp || 0);
  if (statKey === 'atk_' || statKey === 'atk') return Number(combat.totalAtk || 0);
  if (statKey === 'def_' || statKey === 'def') return Number(combat.totalDef || 0);
  if (statKey === 'eleMas') return Number(combat.em || 0);
  if (statKey === 'enerRech_') return Number(combat.er || 100);
  return 0;
}

function deriveSubstatRelevanceMap(char, kitAnalysis, weapon, artifacts, erReport, combat = null, kitData = null) {
  const weights = computeSubstatWeights(kitAnalysis, weapon?.key || '', artifacts || [], erReport?.cadence || null);
  const threshold = extractThresholdTarget(kitAnalysis, kitData, erReport);
  if (threshold) {
    const currentVal = getCurrentStatForKey(combat, threshold.statKey);
    if (currentVal < threshold.targetValue) {
      weights[threshold.statKey] = Math.max(weights[threshold.statKey] || 0, 1.0);
      const flatMap = { hp_: 'hp', atk_: 'atk', def_: 'def' };
      if (flatMap[threshold.statKey]) {
        weights[flatMap[threshold.statKey]] = Math.max(weights[flatMap[threshold.statKey]] || 0, 0.5);
      }
    }
  }
  return weights;
}

function classifySubstatRelevance(sub, weights) {
  const key = sub?.key || '';
  const val = Number(sub?.value || 0);
  const w = Number(weights?.[key] ?? 0);
  let tier = 'muted';
  if (w >= 0.9) tier = 'high';
  else if (w >= 0.45) tier = 'medium';
  else if (w > 0) tier = 'low';

  const isStandout =
    tier === 'high' &&
    ((key === 'critRate_' && val >= 10) ||
      (key === 'critDMG_' && val >= 20) ||
      ((key === 'hp_' || key === 'atk_' || key === 'def_' || key === 'enerRech_') && val >= 15) ||
      (key === 'eleMas' && val >= 60));

  return { tier, weight: w, isStandout };
}

function resolvePrimaryStat(kitAnalysis, kitScaling, staticProfile = null) {
  if (staticProfile?.primaryScaler === 'hp_') return 'HP';
  if (staticProfile?.primaryScaler === 'def_') return 'DEF';
  if (staticProfile?.primaryScaler === 'eleMas') return 'EM';
  if (staticProfile?.primaryScaler === 'enerRech_') return 'ER';
  const conv = kitScaling?.conversionStats || [];
  const rawPrimary = String(kitAnalysis?.primaryScaling || 'ATK').toUpperCase();
  if (kitScaling?.primaryStatKey === 'eleMas' || conv.includes('EM')) return 'EM';
  if (kitScaling?.primaryStatKey === 'hp_' || rawPrimary.startsWith('HP')) return 'HP';
  if (kitScaling?.primaryStatKey === 'def_' || rawPrimary.startsWith('DEF')) return 'DEF';
  if (kitScaling?.primaryStatKey === 'enerRech_' || rawPrimary.startsWith('ER')) return 'ER';
  return rawPrimary || 'ATK';
}

function scoreArtifactSetsForRole(char, kitAnalysis, kitScaling, kitData, roleOverride) {
  const elem = String(char?.meta?.element || 'Geo');
  const role = String(roleOverride || kitAnalysis?.roleInfo?.primaryRole || 'Quickswap Support');
  const scaling = resolvePrimaryStat(kitAnalysis, kitScaling);
  const isOffField = /off-field|sub-dps/i.test(role);
  const isSupport = /support|healer|shield|buffer|enabler/i.test(role);
  const isOnField = !isOffField && !isSupport;

  const fullText = [...(kitData?.talents || []), ...(kitData?.passives || [])].map((x) => x?.description || '').join(' ');
  const burstCost = Number(kitData?.burstCost || kitAnalysis?.burstCost || 60);
  const netEnergyDemand = kitAnalysis?.netEnergyDemand || (burstCost >= 65 ? 'high' : burstCost >= 45 ? 'moderate' : 'low');
  const scalingStat = scaling === 'HP' ? 'HP%' : scaling === 'DEF' ? 'DEF%' : scaling === 'EM' ? 'EM' : scaling === 'ER' ? 'ER%' : 'ATK%';
  const hasHpFluctuation = /consumes?\s+hp|hp\s+(?:is\s+)?(?:lost|reduced|drained|fluctuat)|loses?\s+hp/i.test(fullText);
  const hasTeamBuff = /nearby party members|all party members|party members gain|increases?[^.]{0,40}party|reduces?[^.]{0,30}res/i.test(fullText);
  const isSkillOffField = /even when[^.]{0,30}not on the field|off-field|when[^.]{0,30}leaves the field|continuously deals/i.test(fullText);
  const isShielder = /creates?\s+a\s+[^.]{0,20}shield|absorbs?\s+[^.]{0,20}dmg/i.test(fullText);
  const isHealer = /restores?\s+hp|regenerates?\s+hp|healing/i.test(fullText);
  const isNightsoul = /nightsoul/i.test(fullText);
  const isHexerei = /witch'?s\s+(?:eve\s+rite|homework)|hexerei/i.test(fullText);
  const isLunar = kitAnalysis?.reactionConverterType === 'lunar' || /moonsign\s+benediction|lunar[-\s](?:charged|bloom|crystallize|reaction)/i.test(fullText);
  const isStellarSwirl = /stellar\s+swirl/i.test(fullText);
  const isStellarConduct = /stellar[-\s]conduct/i.test(fullText);
  const isStellarGlimmer = kitAnalysis?.reactionConverterType === 'stellar' || isStellarSwirl || isStellarConduct || /stellar\s+glimmer/i.test(fullText);
  const isPlunge = /plunging\s+attack[^.]{0,60}(?:dmg|bonus|increas)|plunge\s+dmg/i.test(fullText);
  const isZeroEnergy = burstCost === 0 || /special\s+elemental\s+energy|serpent'?s\s+subtlety/i.test(fullText);
  const isBurstCentric = burstCost >= 60 || /elemental burst[^.]{0,50}(?:dmg|grant|buff|field|coordinated)/i.test(fullText);
  const burstTalent = (kitData?.talents || []).find((t) => t?.kind === 'burst');
  const hasBurstDmgShare = Boolean(
    burstTalent &&
      (Object.keys(burstTalent.multipliers || {}).some((k) => /dmg/i.test(k)) ||
        /deals?\s+(?:aoe\s+)?(?:pyro|hydro|electro|cryo|anemo|geo|dendro)\s+dmg/i.test(burstTalent.description || ''))
  );
  const lensTag = isSupport ? 'Team Support' : isOffField ? 'Personal Sub-DPS' : 'On-Field Carry';

  const candidates = [
    { set: '4pc Viridescent Venerer', note: '-40% Elemental RES shred + Swirl DMG', score: () => (elem === 'Anemo' && (isSupport || isOffField) && !isStellarSwirl ? 110 : 0) },
    { set: '4pc Deepwood Memories', note: '-30% Dendro RES shred for team', score: () => (elem === 'Dendro' && (isSupport || isOffField) ? 105 : 0) },
    { set: '4pc Scroll of the Hero of Cinder City', note: 'Nightsoul team Elemental DMG% (+40%) + Energy', score: () => (isNightsoul && (isSupport || isOffField) ? 108 : 0) },
    { set: '4pc Obsidian Codex', note: 'On-field Nightsoul +15% DMG & +40% CRIT Rate', score: () => (isNightsoul && isOnField ? 108 : 0) },
    { set: "4pc Night of the Sky's Unveiling", note: 'On-field Lunar +30% CRIT Rate & +10% Team Lunar DMG', score: () => (isLunar && isOnField ? 112 : 0) },
    { set: "4pc Silken Moon's Serenade", note: 'Team +120 EM & +10% Lunar Reaction DMG (off-field)', score: () => (isLunar && (isSupport || isOffField) ? 109 : 0) },
    { set: '4pc Aubade of Morningstar and Moon', note: 'Off-field Lunar Reaction DMG (+20% / +60%)', score: () => (isLunar && isOffField ? 111 : 0) },
    { set: '4pc Celestial Gift', note: 'Hexerei Skill: Team +20–40% Elemental DMG Bonus', score: () => (isHexerei && isSupport ? 109 : 0) },
    { set: '4pc A Day Carved From Rising Winds', note: 'Hexerei: +43% ATK & +20% CRIT Rate (works off-field)', score: () => (isHexerei && (isOffField || isOnField) ? 107 : 0) },
    { set: '4pc Heart of the Furnace', note: 'Team +50% Stellar Glimmer DMG (works off-field)', score: () => (isStellarGlimmer && (isSupport || isOffField) ? 108 : 0) },
    { set: '4pc Disenchantment in Deep Shadow', note: '+40% Stellar-Conduct DMG & +16% CRIT Rate', score: () => (isStellarConduct && (isOnField || isOffField) ? 110 : 0) },
    { set: '4pc Scarlet Proof', note: '+40% Stellar Swirl DMG & +16% CRIT Rate', score: () => (isStellarSwirl && (isOnField || isOffField) ? 106 : 0) },
    { set: '4pc Finale of the Deep Galleries', note: '0-Energy Cryo +60% NA / Burst DMG', score: () => (isZeroEnergy && elem === 'Cryo' ? 110 : 0) },
    { set: "4pc Long Night's Oath", note: 'Plunging Attack DMG stacking (up to +100%)', score: () => (isPlunge && isOnField ? 104 : 0) },
    {
      set: '4pc Noblesse Oblige',
      note: 'Team +20% ATK & +20% Burst DMG',
      score: () => {
        if (isSupport) return hasTeamBuff || isHealer || isBurstCentric ? 98 : 92;
        if (isOffField && netEnergyDemand !== 'high' && (hasTeamBuff || isBurstCentric) && scaling !== 'EM') return 88;
        if (isOffField && hasTeamBuff && scaling !== 'EM') return 72;
        return 0;
      }
    },
    {
      set: '4pc Tenacity of the Millelith',
      note: 'Team +20% ATK & +30% Shield Strength',
      score: () => {
        if ((isSupport || isOffField) && (isShielder || (scaling === 'HP' && isSkillOffField))) return 96;
        if (isSupport && scaling === 'HP') return 84;
        return 0;
      }
    },
    { set: '4pc Golden Troupe', note: 'Off-field Skill DMG (+70%)', score: () => (isOffField && scaling !== 'EM' ? (isSkillOffField ? 100 : 86) : 0) },
    {
      set: `2pc ${elem} DMG% + 2pc Noblesse Oblige`,
      note: 'Direct Burst & Elemental DMG (low/moderate ER)',
      score: () => (isOffField && hasBurstDmgShare && netEnergyDemand !== 'high' && scaling !== 'EM' ? 92 : 0)
    },
    {
      set: '4pc Emblem of Severed Fate',
      note: 'ER% conversion to Burst DMG (High ER)',
      score: () => {
        if (scaling === 'EM' || !hasBurstDmgShare) return 0;
        if (netEnergyDemand === 'high') {
          if (isOffField) return 97;
          if (isSupport && !hasTeamBuff) return 86;
          return 74;
        }
        if (netEnergyDemand === 'moderate') {
          return isOffField ? 68 : 54;
        }
        return 0;
      }
    },
    { set: '4pc Gilded Dreams', note: 'High EM & ATK% reaction scaling', score: () => (scaling === 'EM' ? 96 : 0) },
    { set: '4pc Flower of Paradise Lost', note: 'Bloom / Hyperbloom / Burgeon specialist', score: () => (scaling === 'EM' && (elem === 'Hydro' || elem === 'Electro' || elem === 'Pyro' || elem === 'Dendro') ? 88 : 0) },
    { set: '4pc Marechaussee Hunter', note: 'On-field CRIT Rate (+36%) with HP fluctuation', score: () => (isOnField && hasHpFluctuation ? 102 : 0) },
    { set: '4pc Crimson Witch of Flames', note: 'Pyro reaction & Skill DMG bonus', score: () => (isOnField && elem === 'Pyro' ? 92 : 0) },
    { set: "4pc Nymph's Dream / Heart of Depth", note: 'Hydro & Normal/Charged DMG scaling', score: () => (isOnField && elem === 'Hydro' ? 92 : 0) },
    { set: '4pc Thundering Fury', note: 'Electro reaction DMG & Skill CDR', score: () => (isOnField && elem === 'Electro' ? 92 : 0) },
    { set: '4pc Blizzard Strayer', note: 'Freeze CRIT Rate (+20–40%)', score: () => (isOnField && elem === 'Cryo' ? 92 : 0) },
    { set: '4pc Desert Pavilion Chronicle', note: 'Anemo & Normal/Plunge/Charged DMG', score: () => (isOnField && elem === 'Anemo' ? 92 : 0) },
    { set: '4pc Husk of Opulent Dreams', note: 'DEF% & Geo DMG stacking', score: () => (elem === 'Geo' && scaling === 'DEF' ? 98 : 0) },
    { set: '4pc Nighttime Whispers', note: 'Geo DMG & Crystallize ATK% scaling', score: () => (isOnField && elem === 'Geo' && scaling !== 'DEF' ? 92 : 0) }
  ];

  return candidates
    .map((c) => ({ set: c.set, note: c.note, lensTag, pts: c.score() }))
    .filter((c) => c.pts > 0)
    .sort((a, b) => b.pts - a.pts);
}

function deriveArtifactSetRecommendations(char, kitAnalysis, kitScaling = null, kitData = null) {
  const elem = String(char?.meta?.element || 'Geo');
  const activeRole = String(kitAnalysis?.roleInfo?.primaryRole || 'Quickswap Support');
  const scaling = resolvePrimaryStat(kitAnalysis, kitScaling);
  const isSupport = /support|healer|shield|buffer|enabler/i.test(activeRole);
  const scalingStat = scaling === 'HP' ? 'HP%' : scaling === 'DEF' ? 'DEF%' : scaling === 'EM' ? 'EM' : scaling === 'ER' ? 'ER%' : 'ATK%';

  const primaryRanked = scoreArtifactSetsForRole(char, kitAnalysis, kitScaling, kitData, activeRole);
  const picked = primaryRanked.slice(0, 2).map(({ set, note, lensTag }) => ({ set, note, lensTag }));

  // For multi-capable kits, surface the top alternative lens set so both playstyles remain visible
  const altLens = (kitAnalysis?.roleInfo?.buildLenses || []).find((l) => l.id && l.id !== activeRole);
  if (altLens && picked.length >= 2) {
    const altTop = scoreArtifactSetsForRole(char, kitAnalysis, kitScaling, kitData, altLens.id).find(
      (c) => c.set !== picked[0].set
    );
    if (altTop) {
      picked[1] = { set: altTop.set, note: altTop.note, lensTag: altTop.lensTag };
    }
  }

  if (!picked.length) {
    picked.push({ set: '4pc Gladiator / Wanderer', note: 'Accessible general-purpose 4pc bonus', lensTag: 'General' });
  }
  picked.push({
    set: isSupport ? `2pc ${scalingStat} + 2pc ER%` : `2pc ${elem} DMG% + 2pc ${scalingStat}`,
    note: 'Flexible high-substat mixed option',
    lensTag: 'Flexible 2pc'
  });
  return picked;
}

const ARTIFACT_SET_DOMAINS = {
  viridescentvenerer: { domain: 'Valley of Remembrance', region: 'Mondstadt' },
  noblesseoblige: { domain: 'Clear Pool and Mountain Cavern', region: 'Liyue' },
  crimsonwitchofflames: { domain: 'Hidden Palace of Zhou Formula', region: 'Liyue' },
  thunderingfury: { domain: 'Midsummer Courtyard', region: 'Mondstadt' },
  blizzardstrayer: { domain: 'Peak of Vindagnyr', region: 'Dragonspine (Mondstadt)' },
  tenacityofthemillelith: { domain: 'Ridge Watch', region: 'Liyue' },
  emblemofseveredfate: { domain: 'Momiji-Dyed Court', region: 'Inazuma' },
  huskofopulentdreams: { domain: 'Slumbering Court', region: 'Inazuma' },
  vermillionhereafter: { domain: 'The Lost Valley', region: 'The Chasm (Liyue)' },
  deepwoodmemories: { domain: 'Spire of Solitary Enlightenment', region: 'Sumeru' },
  gildeddreams: { domain: 'Spire of Solitary Enlightenment', region: 'Sumeru' },
  desertpavilionchronicle: { domain: 'City of Gold', region: 'Sumeru' },
  flowerofparadiselost: { domain: 'City of Gold', region: 'Sumeru' },
  nymphsdream: { domain: 'Molten Iron Fortress', region: 'Fontaine' },
  heartofdepth: { domain: 'Peak of Vindagnyr', region: 'Dragonspine (Mondstadt)' },
  marechausseehunter: { domain: 'Denouement of Sin', region: 'Fontaine' },
  goldentroupe: { domain: 'Denouement of Sin', region: 'Fontaine' },
  nighttimewhispersintheechoingwoods: { domain: 'Waterfall Wen', region: 'Fontaine' },
  nighttimewhispers: { domain: 'Waterfall Wen', region: 'Fontaine' },
  fragmentofharmonicwhimsy: { domain: 'Faded Theater', region: 'Fontaine' },
  unfinishedreverie: { domain: 'Faded Theater', region: 'Fontaine' },
  scrolloftheheroofcindercity: { domain: 'Sanctum of Rainbow Spirits', region: 'Natlan' },
  obsidiancodex: { domain: 'Sanctum of Rainbow Spirits', region: 'Natlan' },
  longnightsoath: { domain: 'Derelict Masonry Dock', region: 'Natlan' },
  finaleofthedeepgalleries: { domain: 'Derelict Masonry Dock', region: 'Natlan' },
  nightoftheskysunveiling: { domain: 'Frostladen Machinery', region: 'Nod-Krai' },
  silkenmoonsserenade: { domain: 'Frostladen Machinery', region: 'Nod-Krai' },
  aubadeofmorningstarandmoon: { domain: 'Moonchilds Treasures', region: 'Nod-Krai' },
  adaycarvedfromrisingwinds: { domain: 'Moonchilds Treasures', region: 'Nod-Krai' },
  celestialgift: { domain: 'Snezhnaya Domain', region: 'Snezhnaya' },
  disenchantmentindeepshadow: { domain: 'Snezhnaya Domain', region: 'Snezhnaya' },
  scarletproof: { domain: 'Snezhnaya Domain', region: 'Snezhnaya' },
  heartofthefurnace: { domain: 'Snezhnaya Domain', region: 'Snezhnaya' },
  gladiatorsfinale: { domain: 'World / Weekly Bosses & Strongbox', region: 'Teyvat' },
  wandererstroupe: { domain: 'World / Weekly Bosses & Strongbox', region: 'Teyvat' }
};

const artifactDetailCache = new Map();

function extractArtifactSetLookupName(recTitle) {
  const cleaned = String(recTitle || '')
    .split('+')[0]
    .split('/')[0]
    .replace(/^\s*(?:4pc|2pc)\s+/i, '')
    .trim();
  const aliasMap = {
    vv: 'Viridescent Venerer',
    gladiator: "Gladiator's Finale",
    wanderer: "Wanderer's Troupe",
    'nighttime whispers': 'Nighttime Whispers in the Echoing Woods'
  };
  return aliasMap[cleaned.toLowerCase()] || cleaned;
}

function matchTwoPcFamiliesForLabel(twoPcLabel, setVectors = [], accountArtifacts = []) {
  const lbl = String(twoPcLabel || '').replace(/^\s*2pc\s+/i, '').trim().toLowerCase();
  const ownedCounts = new Map();
  for (const art of accountArtifacts || []) {
    const k = normalizeAssetKey(art.setKey || art.setName || '');
    if (k) ownedCounts.set(k, (ownedCounts.get(k) || 0) + 1);
  }
  const matches = (setVectors || []).filter((s) => {
    const p = s.primitives || {};
    const two = String(s.twoPc || '').toLowerCase();
    if (/pyro\s+dmg/i.test(lbl)) return p.pyro > 0;
    if (/hydro\s+dmg/i.test(lbl)) return p.hydro > 0;
    if (/cryo\s+dmg/i.test(lbl)) return p.cryo > 0;
    if (/electro\s+dmg/i.test(lbl)) return p.electro > 0;
    if (/anemo\s+dmg/i.test(lbl)) return p.anemo > 0;
    if (/geo\s+dmg/i.test(lbl)) return p.geo > 0;
    if (/dendro\s+dmg/i.test(lbl)) return p.dendro > 0;
    if (/physical\s+dmg/i.test(lbl)) return p.phys > 0;
    if (/^hp%/i.test(lbl)) return /^hp\s*\+20%/i.test(two);
    if (/^def%/i.test(lbl)) return /^def\s*\+30%/i.test(two);
    if (/^atk%/i.test(lbl)) return /^atk\s*\+18%/i.test(two);
    if (/^em\b|elemental\s+mastery/i.test(lbl)) return /elemental\s+mastery\s*\+80/i.test(two);
    if (/^er%|energy\s+recharge/i.test(lbl)) return /energy\s+recharge\s*\+20%/i.test(two);
    if (/healing\s+bonus/i.test(lbl)) return /healing\s+bonus\s*\+15%/i.test(two);
    if (/na\/ca\s+dmg/i.test(lbl)) return /normal\s+and\s+charged\s+attack\s+dmg\s*\+15%/i.test(two);
    if (/skill\s+dmg/i.test(lbl)) return /elemental\s+skill\s+dmg\s*\+20%/i.test(two);
    if (/burst\s+dmg/i.test(lbl)) return /elemental\s+burst\s+dmg\s*\+20%/i.test(two);
    return false;
  });
  return matches
    .map((s) => ({
      ...s,
      ownedCount: ownedCounts.get(normalizeAssetKey(s.name)) || ownedCounts.get(s.lookupKey) || 0
    }))
    .sort((a, b) => b.ownedCount - a.ownedCount || a.name.localeCompare(b.name));
}

async function openArtifactSetInspector(recTitle, triggerEl = null) {
  const modal = document.getElementById('proto-artifact-modal');
  const titleEl = document.getElementById('proto-artifact-title');
  const bodyEl = document.getElementById('proto-artifact-body');
  if (!modal || !bodyEl) return;

  const rawTitle = String(recTitle || '').trim();
  const isTwoPcCombo = /^2pc\s+/i.test(rawTitle) && rawTitle.includes('+');

  if (isTwoPcCombo) {
    const halves = rawTitle
      .split('+')
      .map((h) => h.trim())
      .filter(Boolean);
    const setVectors = getStaticSetVectors() || [];
    const acctArts = getActiveAccount()?.artifacts || [];
    const columns = halves.map((halfLabel) => ({
      halfLabel,
      families: matchTwoPcFamiliesForLabel(halfLabel, setVectors, acctArts)
    }));
    const selectedByCol = columns.map((c) => c.families[0]?.lookupKey || '');
    if (columns.length >= 2 && selectedByCol[0] && selectedByCol[1] === selectedByCol[0]) {
      const alt = columns[1].families.find((f) => f.lookupKey !== selectedByCol[0]);
      if (alt) selectedByCol[1] = alt.lookupKey;
    }

    if (titleEl) titleEl.textContent = rawTitle;
    modal._openModal ? modal._openModal(triggerEl) : (modal.hidden = false);

    const renderTwoPcBody = (pulsed = false) => {
      const pickA = columns[0]?.families.find((f) => f.lookupKey === selectedByCol[0]) || columns[0]?.families[0] || null;
      const pickB = columns[1]?.families.find((f) => f.lookupKey === selectedByCol[1]) || columns[1]?.families[0] || null;
      const bothReady = Boolean(pickA && pickB && pickA.ownedCount >= 2 && pickB.ownedCount >= 2);
      const totalOwned = (pickA?.ownedCount || 0) + (pickB?.ownedCount || 0);

      bodyEl.innerHTML = `
        <p class="p-twopc-lead">Pair any <strong>2 pieces</strong> from Column A with any <strong>2 pieces</strong> from Column B (plus 1 high-CV off-piece). Click a set in each column to preview the combo.</p>
        ${
          pickA && pickB
            ? `<div class="p-twopc-combo-bar ${bothReady ? 'is-ready' : ''} ${pulsed ? 'is-pulsed' : ''}">
                 <div>
                   <div class="p-twopc-combo-pair">
                     <span>2pc ${esc(pickA.name)}</span>
                     <span class="p-twopc-combo-plus">+</span>
                     <span>2pc ${esc(pickB.name)}</span>
                   </div>
                   <div class="p-twopc-combo-meta">${esc(pickA.twoPc)} · ${esc(pickB.twoPc)}</div>
                 </div>
                 <span class="p-badge mono ${bothReady ? 'text-mint' : ''}">${bothReady ? `Ready (${totalOwned} pcs owned)` : `${totalOwned} pcs owned`}</span>
               </div>`
            : ''
        }
        <div class="p-twopc-columns">
          ${columns
            .map((col, colIdx) => {
              const countWord = col.families.length === 1 ? '1 set' : `${col.families.length} sets`;
              return `
                <section class="p-twopc-col">
                  <header class="p-twopc-col-head">
                    <span class="p-twopc-col-title">${esc(col.halfLabel)}</span>
                    <span class="p-twopc-col-count mono">${esc(countWord)}</span>
                  </header>
                  <div class="p-twopc-list">
                    ${
                      col.families.length
                        ? col.families
                            .map((f) => {
                              const fIcon = getArtifactIcon(f.name, 'flower') || f.icon || '';
                              const isSelected = f.lookupKey === selectedByCol[colIdx];
                              return `
                                <button type="button" class="p-twopc-item ${isSelected ? 'is-selected' : ''}" data-twopc-col="${colIdx}" data-twopc-key="${esc(f.lookupKey)}">
                                  <div class="p-twopc-item-left">
                                    ${fIcon ? `<img src="${esc(fIcon)}" alt="${esc(f.name)}" class="p-twopc-item-icon" />` : ''}
                                    <div class="p-twopc-item-text">
                                      <div class="p-twopc-item-name">${esc(f.name)}</div>
                                      <div class="p-twopc-item-sub">${esc(f.twoPc)} · ${esc(f.domain)} (${esc(f.region)})</div>
                                    </div>
                                  </div>
                                  <span class="p-twopc-owned mono ${f.ownedCount >= 2 ? 'has-pair' : ''}">${f.ownedCount} pcs</span>
                                </button>
                              `;
                            })
                            .join('')
                        : '<div class="muted" style="padding:12px 2px;font-size:12.5px;">No 5★ 2pc set matched.</div>'
                    }
                  </div>
                </section>
              `;
            })
            .join('')}
        </div>
      `;

      bodyEl.querySelectorAll('[data-twopc-key]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const ci = Number(btn.dataset.twopcCol);
          const nextKey = btn.dataset.twopcKey;
          if (columns.length === 2) {
            const other = ci === 0 ? 1 : 0;
            if (selectedByCol[other] === nextKey) {
              const prev = selectedByCol[ci];
              if (prev && prev !== nextKey && columns[other].families.some((f) => f.lookupKey === prev)) {
                selectedByCol[other] = prev;
              } else {
                const alt = columns[other].families.find((f) => f.lookupKey !== nextKey);
                if (alt) selectedByCol[other] = alt.lookupKey;
              }
            }
          }
          selectedByCol[ci] = nextKey;
          renderTwoPcBody(true);
        });
      });
    };

    renderTwoPcBody(false);
    return;
  }

  const setName = extractArtifactSetLookupName(recTitle);
  const norm = normalizeAssetKey(setName);
  const vecMatch = (getStaticSetVectors() || []).find((s) => normalizeAssetKey(s.name) === norm || s.lookupKey === norm.toLowerCase());
  const meta = getArtifactSetMeta(setName);
  const iconUrl = getArtifactIcon(setName, 'flower') || vecMatch?.icon || '';
  const loc = vecMatch ? { domain: vecMatch.domain, region: vecMatch.region } : ARTIFACT_SET_DOMAINS[norm] || null;

  if (titleEl) titleEl.textContent = vecMatch?.name || meta?.name || setName;
  modal._openModal ? modal._openModal(triggerEl) : (modal.hidden = false);

  let detail = artifactDetailCache.get(norm) || (vecMatch ? { twoPc: vecMatch.twoPc, fourPc: vecMatch.fourPc } : null);
  if (!detail && meta?.setId) {
    bodyEl.innerHTML = '<div class="muted">Loading artifact set bonuses...</div>';
    try {
      const json = await fetch(`https://gi.yatta.moe/api/v2/en/reliquary/${encodeURIComponent(meta.setId)}`).then((r) =>
        r.ok ? r.json() : null
      );
      const affixes = Object.values(json?.data?.affixList || {});
      detail = {
        twoPc: affixes[0] || '',
        fourPc: affixes[1] || ''
      };
      artifactDetailCache.set(norm, detail);
    } catch {
      detail = { twoPc: '', fourPc: '' };
    }
  }

  bodyEl.innerHTML = `
    <div class="p-row">
      <div class="p-row-left">
        ${iconUrl ? `<img src="${esc(iconUrl)}" alt="${esc(setName)}" class="icon-md" />` : ''}
        <div>
          <div class="p-row-title">${esc(loc ? loc.domain : 'Artifact Domain / Strongbox')}</div>
          <div class="p-row-sub">${esc(loc ? `Region: ${loc.region}` : 'Check Adventurer Handbook for Domain')}</div>
        </div>
      </div>
      <span class="p-badge mono">${esc(recTitle.startsWith('2pc') ? '2pc Mixed' : '4pc Set')}</span>
    </div>
    ${
      detail?.twoPc
        ? `<div class="p-panel" style="padding:12px 14px;">
             <div class="p-row-title text-gold" style="margin-bottom:4px;">2-Piece Bonus</div>
             <p class="p-kit-desc">${formatGenshinRichText(detail.twoPc)}</p>
           </div>`
        : ''
    }
    ${
      detail?.fourPc
        ? `<div class="p-panel" style="padding:12px 14px;">
             <div class="p-row-title text-mint" style="margin-bottom:4px;">4-Piece Bonus</div>
             <p class="p-kit-desc">${formatGenshinRichText(detail.fourPc)}</p>
           </div>`
        : '<div class="muted" style="font-size:13px;">Set bonus details unavailable for generic/mixed placeholder.</div>'
    }
  `;
}

function formatMainStatExample(char, kitAnalysis, kitScaling = null, substatWeights = null, sandboxCtx = null) {
  const name = char?.meta?.name || 'this character';
  const scaling = resolvePrimaryStat(kitAnalysis, kitScaling);
  const preferredMain = scaling === 'HP' ? 'HP%' : scaling === 'DEF' ? 'DEF%' : scaling === 'EM' ? 'EM' : scaling === 'ER' ? 'ER%' : 'ATK%';

  const candidateKeys = ['def_', 'hp_', 'eleMas', 'atk_', 'enerRech_'];
  let deadKey = 'def_';
  if (substatWeights) {
    const low = candidateKeys.find((k) => Number(substatWeights[k] ?? 0) <= 0.15 && formatStatKey(k) !== preferredMain);
    if (low) deadKey = low;
  } else if (preferredMain === 'DEF%') {
    deadKey = 'hp_';
  }
  const deadMain = formatStatKey(deadKey);
  if (sandboxCtx?.reactionCritDominant && preferredMain !== 'HP%') {
    return `for Lunar/Stellar reactions, an off-set ${preferredMain} Goblet or Sands with CRIT beats a weak Elemental DMG% piece on ${name}`;
  }
  return `an off-set ${preferredMain} Sands beats an on-set ${deadMain} Sands on ${name}`;
}

const CHARACTER_ALIASES = {
  sandrone: ['marionette'],
  tartaglia: ['childe', 'ajax'],
  wanderer: ['scaramouche', 'kunikuzushi', 'hat guy'],
  arlecchino: ['knave', 'peruere'],
  raidenshogun: ['ei', 'baal', 'beelzebul', 'raiden'],
  zhongli: ['morax', 'rex lapis'],
  venti: ['barbatos'],
  nahida: ['kusanali', 'lesser lord kusanali', 'buer'],
  furina: ['focalors'],
  mavuika: ['haborym'],
  anastasya: ['tsaritsa'],
  anastasia: ['tsaritsa'],
  columbina: ['damselette'],
  capitano: ['thrain'],
  dottore: ['zandik'],
  neuvillette: ['iudex'],
  hutao: ['hu tao'],
  fischl: ['amy', 'prinzessin'],
  xingqiu: ['xq'],
  xiangling: ['xl'],
  bennett: ['benny'],
  traveler: ['aether', 'lumine']
};

function matchesCharacterQuery(key, name, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  if (String(name || '').toLowerCase().includes(q)) return true;
  const normKey = String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normKey.includes(q.replace(/[^a-z0-9]/g, ''))) return true;
  for (const [aliasKey, aliases] of Object.entries(CHARACTER_ALIASES)) {
    if (normKey.includes(aliasKey) && aliases.some((a) => a.includes(q))) {
      return true;
    }
  }
  return false;
}

function formatGenshinRichText(text) {
  let html = esc(String(text || '').replace(/\\n/g, '\n'));
  html = html.replace(/&lt;color=#([0-9a-fA-F]{6})[0-9a-fA-F]{0,2}&gt;/g, '<span style="color:#$1;font-weight:600;">');
  html = html.replace(/&lt;\/color&gt;/g, '</span>');
  html = html.replace(/&lt;i&gt;([\s\S]*?)&lt;\/i&gt;/g, '<em style="color:var(--p-text-muted);">$1</em>');
  // Colorize Elemental Reaction keywords outside HTML tags
  const rxnRules = [
    [/\b(Hexerei:\s*Secret\s*Rite|Hexerei|Witch's\s*Homework)\b/g, 'p-rxn-hexerei'],
    [/\b(Lunar-Charged|Stellar-Conduct|Electro-Charged|Superconduct|Aggravate|Quicken)\b/g, 'p-rxn-electro'],
    [/\b(Lunar-Bloom|Hyperbloom|Bloom|Spread)\b/g, 'p-rxn-dendro'],
    [/\b(Lunar-Crystallize|Crystallize)\b/g, 'p-rxn-geo'],
    [/\b(Stellar\s+Swirl|Swirl)\b/g, 'p-rxn-anemo'],
    [/\b(Vaporize|Melt|Overloaded|Burgeon|Burning)\b/g, 'p-rxn-pyro'],
    [/\b(Frozen|Shatter)\b/g, 'p-rxn-cryo'],
    [/\b(Stellar\s+Jubilee|Moonsign(?:\s+Benediction)?|Nightsoul(?:'s\s+Blessing)?|Elemental\s+Reactions?)\b/gi, 'p-rxn-leyline']
  ];
  html = html
    .split(/(<[^>]+>)/g)
    .map((part) => {
      if (part.startsWith('<')) return part;
      let out = part;
      for (const [re, cls] of rxnRules) {
        out = out.replace(re, `<span class="p-rxn ${cls}">$1</span>`);
      }
      return out;
    })
    .join('');
  return html;
}

function formatKitTag(kind) {
  const k = String(kind || 'Talent').trim();
  if (!k) return 'Talent';
  return k.charAt(0).toUpperCase() + k.slice(1);
}

function formatPassiveTag(p, idx) {
  const combined = `${p?.name || ''} ${p?.description || ''}`;
  if (/stellar\s+jubilee/i.test(combined)) return 'Stellar';
  const slot = String(p?.slot || '').trim();
  if (slot && slot.toLowerCase() !== 'passive') return formatKitTag(slot);
  if (idx === 0) return 'A1';
  if (idx === 1) return 'A4';
  return 'Utility';
}

function getActiveAccount() {
  return state.viewingPartner && state.partnerAccount ? state.partnerAccount : state.ownAccount;
}

function isReadOnly() {
  return Boolean(state.viewingPartner || (getActiveAccount()?.isReadOnly));
}

function showToast(message) {
  const el = document.getElementById('proto-toast');
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    el.hidden = true;
  }, 2600);
}

function withViewTransition(updateFn) {
  const safeUpdate = () => {
    try {
      updateFn();
    } catch (err) {
      console.error('View transition render error:', err);
      showToast(`Render error: ${err.message}`);
    }
  };
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (typeof document.startViewTransition === 'function' && !reduced) {
    return document.startViewTransition(safeUpdate);
  }
  safeUpdate();
  return null;
}

function attachCardTilt(container) {
  if (!window.matchMedia?.('(hover: hover)').matches) return;
  container.querySelectorAll('.p-char-tile, .p-weapon-card').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const rect = card.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      card.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
      card.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
      card.style.setProperty('--rx', `${((0.5 - py) * 7).toFixed(2)}deg`);
      card.style.setProperty('--ry', `${((px - 0.5) * 7).toFixed(2)}deg`);
      card.style.setProperty('--ty', '-3px');
    });
    card.addEventListener('pointerleave', () => {
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
      card.style.setProperty('--ty', '0px');
    });
  });
}

function setActiveTab(tab) {
  if (!VIEW_TITLES[tab]) return;
  withViewTransition(() => {
    state.activeTab = tab;
    document.querySelectorAll('[data-ptab]').forEach((btn) => {
      const isActive = btn.dataset.ptab === tab;
      btn.classList.toggle('active', isActive);
      if (isActive) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
    const titleEl = document.getElementById('proto-view-title');
    if (titleEl) titleEl.textContent = VIEW_TITLES[tab];
    renderActiveView();
  });
}

function updateChrome() {
  const syncDot = document.getElementById('proto-sync-dot');
  const syncLabel = document.getElementById('proto-sync-label');
  const offline = isOfflineMode();
  if (syncDot) syncDot.classList.toggle('is-offline', offline);
  if (syncLabel) syncLabel.textContent = offline ? 'Local Preview' : 'Apps Script Sync';

  const roPill = document.getElementById('proto-readonly-pill');
  if (roPill) roPill.hidden = !isReadOnly();

  const serverBtn = document.getElementById('proto-server-btn');
  if (serverBtn) {
    const info = getServerResetInfo(state.serverId);
    serverBtn.textContent = `${state.serverId} · ${info.countdownText || '--h --m'}`;
    serverBtn.title = `${info.server.label} · ${info.shortDate || info.inGameDay} · Daily reset in ${info.countdownText || '--h --m'}`;
  }
}

function populateAccountSelect() {
  const sel = document.getElementById('proto-account-select');
  if (!sel || !state.sessionUser) return;
  const rawUsers = state.visibleUsers?.length ? state.visibleUsers : [{ user: state.sessionUser, displayName: state.sessionUser }];
  const users = rawUsers.map((u) => (typeof u === 'string' ? { user: u, displayName: u } : u));
  sel.innerHTML = users
    .map((u) => {
      const key = u.user;
      const name = u.displayName || key;
      const label = key === state.sessionUser ? `${name} (You)` : `${name} (Partner)`;
      const selected = (state.viewingPartner ? state.partnerUser : state.sessionUser) === key ? 'selected' : '';
      return `<option value="${esc(key)}" ${selected}>${esc(label)}</option>`;
    })
    .join('');
}

async function applySession(res) {
  const userKey = res.account?.user || res.user;
  state.sessionUser = userKey;
  state.ownAccount = res.account;
  state.visibleUsers = res.visibleUsers?.length ? res.visibleUsers : [{ user: userKey, displayName: res.account?.displayName || userKey }];
  state.viewingPartner = false;
  state.partnerAccount = null;
  state.partnerUser = null;
  setReadOnlyViewState(false);

  const savedServer = localStorage.getItem(`aaru_server_${userKey}`);
  if (savedServer && SERVER_REGIONS[savedServer]) state.serverId = savedServer;

  document.getElementById('proto-login').hidden = true;
  document.getElementById('proto-shell').hidden = false;

  populateAccountSelect();
  updateChrome();
  renderActiveView();
}

/* ---------- View 1: Today (HUD) ---------- */
const queueMatHydrationSeen = new Set();
function hydrateQueueMaterials(queue, viewName) {
  const missing = (queue || []).filter((t) => {
    if (!t?.characterKey || queueMatHydrationSeen.has(t.characterKey)) return false;
    const cm = getCharacterMeta(t.characterKey);
    return !cm.talentBook || !cm.bossMat;
  });
  if (!missing.length) return;
  for (const t of missing) queueMatHydrationSeen.add(t.characterKey);
  Promise.all(missing.map((t) => ensureCharacterMaterials(t.characterKey))).then((results) => {
    if (results.some(Boolean) && state.activeView === viewName) {
      renderActiveView();
    }
  });
}

function renderTodayView(container, account) {
  const readOnly = isReadOnly();
  const disabled = readOnly ? 'disabled' : '';
  const wallet = account.wallet || {};
  const inventory = account.inventory || {};
  const patchCal = getPatchCalendarInfo(state.serverId);
  const todayName = patchCal.inGameDay || 'Monday';
  const scheduleDay = patchCal.effectiveScheduleDay || todayName;

  const queue = sortAndLabelPrefarmQueue(account.prefarmQueue || []);
  hydrateQueueMaterials(queue, 'today');
  const waterfall = calculateWaterfallPrefarm(queue, inventory, wallet);
  const sharedPool = calculatePrioritySharedPool(queue, inventory, wallet, scheduleDay);
  const poolItems = Array.isArray(sharedPool) ? sharedPool : [];
  const twoPass = calculateTwoPassMilestonePlan(queue, inventory, wallet, state.serverId);
  const moraStrategy = calcMoraStrategy(account, poolItems, twoPass, patchCal);

  const spares = calcSpareReserves(account, poolItems);
  const wits = calcEffectiveHerosWit(inventory);
  const purse = calcCoinPurse(wallet);
  const wishGoal = { ...DEFAULT_WISH_GOAL, ...(wallet.wishGoal || {}) };
  const wishProj = calcWishGoalProjection(wallet, wishGoal);

  const targetsWithTel = queue.map((t) => {
    const readiness = calcTargetReadinessPct(waterfall.get(t.id) || []);
    const tel = calcTargetTelemetry(t, poolItems, state.serverId || 'NA');
    const ms = twoPass.byId.get(t.id) || null;
    return { ...t, readiness, telemetry: tel, ms };
  });

  const activeItems = poolItems.filter((item) => {
    if (item.kind === 'mora' || item.kind === 'exp') return false;
    if (!state.focusedTargetId) return item.deficit > 0;
    return (item.alloc?.targets || []).some((c) => c.characterKey === state.focusedTargetId || c.targetId === state.focusedTargetId);
  });
  const topBottlenecks = activeItems.filter((i) => i.deficit > 0).slice(0, 8);

  const domainsToday = getDomainScheduleForDay(scheduleDay) || [];
  const enrichedDomains = domainsToday
    .map((dom) => {
      const rewardNorms = new Set((dom.rewards || []).map((r) => normalizeAssetKey(r.key)));
      const rewardNames = new Set((dom.rewards || []).map((r) => r.name));
      const matches = [];
      for (const t of queue) {
        const cm = getCharacterMeta(t.characterKey);
        if (rewardNorms.has(cm.domainMatKey) || rewardNames.has(cm.talentBook)) {
          matches.push({ badge: t.tierLabel, name: cm.name, characterKey: t.characterKey });
        }
      }
      return { ...dom, matches };
    })
    .filter((dom) => !state.focusedTargetId || dom.matches.some((m) => m.characterKey === state.focusedTargetId))
    .sort((a, b) => b.matches.length - a.matches.length);

  const dailyList = account.checklist?.daily || [];
  const weeklyList = account.checklist?.weekly || [];
  const dailyOpen = dailyList.filter((c) => !c.done).length;
  const weeklyOpen = weeklyList.filter((c) => !c.done).length;
  const totalRem = dailyList.length + weeklyList.length;
  const doneRem = totalRem - (dailyOpen + weeklyOpen);
  const remPct = totalRem > 0 ? Math.round((doneRem / totalRem) * 100) : 100;
  const topDomain = enrichedDomains.find((d) => d.matches.length > 0);
  const moraBadgeCls =
    moraStrategy.statusTone === 'coral' ? 'p-badge-coral' : moraStrategy.statusTone === 'gold' ? 'p-badge-amber' : 'p-badge-mint';
  const pivotBadgeCls = twoPass.pivotTone === 'mint' ? 'p-badge-mint' : 'p-badge-amber';
  const leadTarget = targetsWithTel[0] || null;
  const leadMeta = leadTarget ? getCharacterMeta(leadTarget.characterKey) : null;
  const leadEl = leadMeta ? String(leadMeta.element || '').toLowerCase() : '';
  const featuredKeys = (patchCal.nextFeaturedKeys || []).length
    ? patchCal.nextFeaturedKeys
    : targetsWithTel.slice(0, 2).map((t) => t.characterKey);

  container.innerHTML = `
    <section class="p-patch-bar p-hud-hero" ${leadEl ? `data-el="${esc(leadEl)}"` : ''} aria-label="Genshin Patch &amp; Domain Calendar">
      ${leadTarget ? `<div class="p-hud-hero-art" aria-hidden="true">${renderGachaSplash(leadTarget.characterKey, '')}</div>` : ''}
      <div class="p-patch-primary">
        <div class="p-patch-now">
          <span class="p-badge p-hero-pill-date mono">${esc(patchCal.shortDate)} · ${esc(patchCal.currentLabel)} · Day ${patchCal.dayInPatch}/42</span>
          ${
            patchCal.isAllDomainsOpenSurge
              ? `<span class="p-badge p-hero-pill-open mono" title="First 7 days of the banner half: all Talent and Weapon domains are unlocked daily"><span class="p-hero-dot" aria-hidden="true"></span>All Domains Open · ${patchCal.surgeDaysRemaining}d left</span>`
              : `<span class="p-badge p-hero-pill-date mono">Daily Reset · ${esc(patchCal.countdownText)}</span>`
          }
        </div>
        <div class="p-hud-hero-banner-row">
          <h2 class="p-hud-hero-title">${esc(patchCal.nextLabel)}</h2>
          ${
            featuredKeys.length
              ? `<div class="p-hero-featured">${featuredKeys
                  .map((k) => {
                    const fm = getCharacterMeta(k);
                    const fel = String(fm.element || '').toLowerCase();
                    const active = state.focusedTargetId === k ? 'is-active' : '';
                    return `<button type="button" class="p-hero-featured-chip ${active}" data-el="${esc(fel)}" data-p-focus="${esc(k)}" title="Filter materials for ${esc(fm.name)}">
                      ${renderAssetIcon('characters', k, fm.name, 'icon-xs')}
                      <span>${esc(fm.name)}</span>
                    </button>`;
                  })
                  .join('')}</div>`
              : `<span class="p-row-sub">${esc(patchCal.nextBannerNote)}</span>`
          }
        </div>
        <div class="p-hero-local-time mono">Drops ${esc(patchCal.nextLocalTimeText || patchCal.nextDualTzText)}</div>
      </div>
      <div class="p-patch-metrics">
        <div class="p-hud-countdown">
          <span class="p-hud-countdown-val mono">${esc(patchCal.countdownToNextText)}</span>
          <span class="p-hud-countdown-resin mono" title="Natural Original Resin regenerating before ${esc(patchCal.nextLabel)}">
            ${renderAssetIcon('materials', 'OriginalResin', 'Original Resin', 'icon-xs')}
            <span data-count-to="${patchCal.naturalResinToNext}" data-count-prefix="~">~${patchCal.naturalResinToNext.toLocaleString()}</span>
          </span>
        </div>
        <span class="p-badge p-hero-pill-slots mono" title="Remaining domain days before ${esc(patchCal.nextLabel)} (All-Open includes Sundays + first 7 days of the banner)">${patchCal.monThuSlots} M/Th · ${patchCal.wedSatSlots} W/Sa · ${patchCal.tueFriSlots} Tu/F · <strong class="text-mint">${patchCal.sunSlots} All-Open</strong></span>
      </div>
    </section>

    <section class="p-resource-strip" aria-label="Account Reserves">
      <div class="p-res-cell">
        ${renderAssetIcon('materials', 'Mora', 'Mora', 'icon-sm')}
        <div class="p-res-meta">
          <div class="p-res-head-inline">
            <span class="p-res-label">Spare Mora</span>
            <span class="p-badge mono ${moraBadgeCls}">${esc(moraStrategy.badgeText)}</span>
          </div>
          <span class="p-res-value mono ${spares.isMoraBroke ? 'text-coral' : 'text-mint'}">${spares.spareMora >= 0 ? `+${formatCompact(spares.spareMora)}` : formatCompact(spares.spareMora)}</span>
          <span class="p-res-sub mono">${formatCompact(spares.bagMora)} bag · ${formatCompact(spares.committedMora)} max (${formatCompact(moraStrategy.funcNeededMora)} Lv.80)</span>
        </div>
      </div>
      <div class="p-res-cell">
        ${renderAssetIcon('materials', 'HerosWit', "Hero's Wit", 'icon-sm')}
        <div class="p-res-meta">
          <div class="p-res-head-inline">
            <span class="p-res-label">Spare Hero's Wit</span>
          </div>
          <span class="p-res-value mono ${spares.isWitsBroke ? 'text-coral' : 'text-mint'}">${spares.spareWits >= 0 ? `+${Math.round(spares.spareWits)}` : Math.round(spares.spareWits)} Eq.</span>
          <span class="p-res-sub mono">${wits.effectiveTotal.toLocaleString()} total (${wits.wits4} 4★)</span>
        </div>
      </div>
      <div class="p-res-cell">
        ${renderAssetIcon('materials', 'Primogem', 'Primogem', 'icon-sm')}
        <div class="p-res-meta">
          <div class="p-res-head-inline">
            <span class="p-res-label">Wish Stash</span>
          </div>
          <span class="p-res-value mono text-gold" data-count-to="${purse.limitedPulls}" data-count-suffix=" Pulls">${purse.limitedPulls.toLocaleString()} Pulls</span>
          <span class="p-res-sub mono">${wishProj.projectedTotalPulls} projected by ${esc(patchCal.nextPhaseDateShort)} (${wishProj.daysRemaining}d)</span>
        </div>
      </div>
    </section>

    ${
      twoPass.pivotHeadline || topDomain || moraStrategy.recommendation
        ? `<section class="p-strategy-strip" aria-label="Resin &amp; Build Order">
             <div class="p-strategy-cell">
               <div class="p-strategy-head">
                 <strong class="p-spotlight-title">${esc(twoPass.pivotHeadline || 'Build Order (Lv.80 Ready → Crowns)')}</strong>
                 <span class="p-badge mono ${pivotBadgeCls}">Lv.80 → Crown</span>
               </div>
               <div class="p-row-sub">${esc(twoPass.pivotDetail || 'Get Lv.80 & Lv.8 Talents ready for each target before spending Crowns.')}</div>
               ${twoPass.surgeWarning ? `<div class="p-surge-warn">${esc(twoPass.surgeWarning)}</div>` : ''}
             </div>
             <div class="p-strategy-cell">
               ${
                 topDomain
                   ? `<div class="p-strategy-head">
                        <strong class="p-spotlight-title">Best Domain Today: ${esc(topDomain.name)}</strong>
                        <div class="p-tag-inline">${topDomain.matches.map((m) => `<span class="p-badge p-badge-mint">${esc(m.badge)} ${esc(m.name)}</span>`).join('')}</div>
                      </div>
                      <div class="p-dom-rewards">${(topDomain.rewards || [])
                        .map(
                          (r) =>
                            `<span class="p-dom-reward-chip">${renderAssetIcon('materials', r.key, r.name, 'icon-xs')}<span>${esc(r.name)}</span></span>`
                        )
                        .join('')}</div>`
                   : `<div class="p-strategy-head">
                        <strong class="p-spotlight-title">Off-Day for Queued Books (${esc(todayName)})</strong>
                        <span class="p-badge mono">Boss / Ley Line / Artifacts</span>
                      </div>`
               }
               <div class="p-mora-note">${esc(moraStrategy.recommendation)}</div>
             </div>
           </section>`
        : ''
    }

    <div class="p-grid-2">
      <div class="p-list" style="gap:20px;">
        <section class="p-panel">
          <div class="p-panel-head">
            <h2 class="p-panel-title">Build Queue &amp; Missing Materials</h2>
            ${state.focusedTargetId ? '<button type="button" class="p-btn p-btn-ghost p-btn-xs" data-p-clear-focus>All Targets</button>' : ''}
          </div>

          <div class="p-target-grid">
            ${targetsWithTel
              .map((t) => {
                const cm = getCharacterMeta(t.characterKey);
                const el = String(cm.element || '').toLowerCase();
                const active = state.focusedTargetId === t.characterKey ? 'is-active' : '';
                const funcPct = t.ms?.funcPct ?? t.readiness;
                const bookSlotHint = t.ms?.bookName
                  ? `${t.ms.bookName} (${t.ms.bookDays.join('/') || 'Sun'} · ${t.ms.dedicatedSlotsBeforeBanner}d)`
                  : t.telemetry.etaLabel;
                return `
                  <button type="button" class="p-target-card ${active}" data-el="${esc(el)}" data-p-focus="${esc(t.characterKey)}" aria-pressed="${Boolean(active)}">
                    <div class="p-target-shell">
                      <div class="p-target-portrait">${renderAssetIcon('characters', t.characterKey, cm.name, 'icon-hud-char')}</div>
                      <div class="p-target-body">
                        <div class="p-target-head">
                          <strong class="p-target-name">${esc(cm.name)}</strong>
                          <span class="mono p-target-pct ${funcPct >= 100 ? 'text-mint' : 'text-gold'}">${
                            t.readiness >= 100 ? 'Max Ready' : funcPct >= 100 ? `Lv.80 ✓ · ${t.readiness}%` : `Lv.80 ${funcPct}% · Max ${t.readiness}%`
                          }</span>
                        </div>
                        <div class="p-bar p-bar-dual" title="Lv.80 Ready (${esc(t.ms?.funcLabel || 'Lv.80')}): ${funcPct}% · Full Max: ${t.readiness}%">
                          <span class="p-bar-func" style="width:${funcPct}%;"></span>
                          <span class="p-bar-max" style="width:${t.readiness}%;"></span>
                        </div>
                        <div class="p-row-sub mono p-target-meta">${esc(t.tierLabel)} · ${esc(bookSlotHint)}${t.ms?.bossUnreleased ? ' · 7.3 Boss' : ''}</div>
                      </div>
                    </div>
                  </button>`;
              })
              .join('') || '<span class="muted">No active targets in Prefarm Queue.</span>'}
          </div>

          <div class="p-mat-list">
            ${
              topBottlenecks.length
                ? topBottlenecks
                    .map((item) => {
                      const pct = item.neededTotal > 0 ? Math.min(100, Math.round((item.owned / item.neededTotal) * 100)) : 100;
                      const who = (item.alloc?.targets || item.consumers || [])
                        .map((c) => c.characterName || getCharacterMeta(c.characterKey).name)
                        .join(', ');
                      return `
                        <button type="button" class="p-row p-row-clickable" data-p-jump-mat="${esc(item.name)}" title="Open in Vault">
                          <div class="p-row-left">
                            ${renderAssetIcon('materials', item.key, item.name, 'icon-xs')}
                            <div>
                              <div class="p-row-title">${esc(item.name)}</div>
                              <div class="p-row-sub">${esc(who)}</div>
                            </div>
                          </div>
                          <div style="display:flex;align-items:center;gap:10px;">
                            <div class="p-bar"><span style="width:${pct}%"></span></div>
                            <span class="mono text-coral" style="font-size:12.5px;min-width:48px;text-align:right;">-${item.deficit.toLocaleString()}</span>
                          </div>
                        </button>`;
                    })
                    .join('')
                : '<div class="muted" style="font-size:13px;">All tracked materials for this selection are satisfied.</div>'
            }
          </div>
        </section>

        <section class="p-panel">
          <div class="p-panel-head">
            <h2 class="p-panel-title">Active Reminders</h2>
            <span class="p-badge mono ${dailyOpen + weeklyOpen === 0 ? 'p-badge-mint' : 'p-badge-amber'}">${
              dailyOpen + weeklyOpen === 0 ? 'All Caught Up' : `${doneRem}/${totalRem} Done · ${dailyOpen} Daily · ${weeklyOpen} Weekly`
            }</span>
          </div>
          <div class="p-bar p-rem-progress" aria-hidden="true"><span style="width:${remPct}%"></span></div>
          <div class="p-list" style="gap:14px;">
            <div class="p-reminder-group">
              <div class="p-row-sub">Daily</div>
              <div class="p-reminder-chips">
                ${[...dailyList].sort((a, b) => Number(a.done) - Number(b.done))
                  .map(
                    (c) => `
                    <button type="button" class="p-rem-chip ${c.done ? 'is-done' : ''}" data-p-check="daily" data-p-cid="${esc(c.id)}" ${disabled} aria-pressed="${Boolean(c.done)}">
                      <span class="p-rem-dot" aria-hidden="true"></span>
                      <span>${esc(c.label)}</span>
                    </button>`
                  )
                  .join('')}
              </div>
            </div>
            <div class="p-reminder-group">
              <div class="p-row-sub">Weekly &amp; Endgame</div>
              <div class="p-reminder-chips">
                ${[...weeklyList].sort((a, b) => Number(a.done) - Number(b.done))
                  .map(
                    (c) => `
                    <button type="button" class="p-rem-chip ${c.done ? 'is-done' : ''}" data-p-check="weekly" data-p-cid="${esc(c.id)}" ${disabled} aria-pressed="${Boolean(c.done)}">
                      <span class="p-rem-dot" aria-hidden="true"></span>
                      <span>${esc(c.label)}</span>
                    </button>`
                  )
                  .join('')}
              </div>
            </div>
          </div>
        </section>
      </div>

      <section class="p-panel">
        <div class="p-panel-head">
          <h2 class="p-panel-title">Open Domains · ${esc(patchCal.shortDate)}</h2>
          <span class="p-badge mono ${patchCal.isAllDomainsOpenSurge ? 'p-badge-mint' : ''}">${
            patchCal.isAllDomainsOpenSurge
              ? `All Domains Open (${patchCal.surgeDaysRemaining}d)`
              : `${enrichedDomains.filter((d) => d.matches.length).length} Priority`
          }</span>
        </div>
        <div class="p-mat-list">
          ${
            enrichedDomains.length
              ? enrichedDomains
                  .slice(0, 8)
                  .map(
                    (dom) => `
              <div class="p-row p-dom-row ${dom.matches.length ? 'is-priority-dom' : ''}">
                <div class="p-dom-main">
                  <div class="p-row-title">${esc(dom.name)}</div>
                  <div class="p-dom-rewards">${(dom.rewards || [])
                    .map(
                      (r) =>
                        `<span class="p-dom-reward-chip">${renderAssetIcon('materials', r.key, r.name, 'icon-xs')}<span>${esc(r.name)}</span></span>`
                    )
                    .join('')}</div>
                  ${
                    dom.matches.length
                      ? `<div class="p-dom-matches">${dom.matches
                          .map((m) => `<span class="p-badge p-badge-mint">${esc(m.badge)} ${esc(m.name)}</span>`)
                          .join('')}</div>`
                      : ''
                  }
                </div>
                <span class="p-badge">${esc(dom.domainType)}</span>
              </div>`
                  )
                  .join('')
              : '<div class="muted" style="font-size:13px;padding:10px 0;">No open domains match the focused target today.</div>'
          }
        </div>
      </section>
    </div>
  `;

  container.querySelectorAll('[data-p-focus]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.pFocus;
      state.focusedTargetId = state.focusedTargetId === k ? null : k;
      renderTodayView(container, account);
    });
  });
  container.querySelector('[data-p-clear-focus]')?.addEventListener('click', () => {
    state.focusedTargetId = null;
    renderTodayView(container, account);
  });
  container.querySelectorAll('[data-p-jump-mat]').forEach((row) => {
    row.addEventListener('click', () => {
      state.vaultCategory = 'All';
      state.vaultSearch = row.dataset.pJumpMat;
      setActiveTab('vault');
    });
  });
  container.querySelectorAll('[data-p-check]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (readOnly) return;
      const group = btn.dataset.pCheck;
      const id = btn.dataset.pCid;
      const list = account.checklist?.[group] || [];
      const item = list.find((x) => x.id === id);
      if (item) item.done = !item.done;
      renderTodayView(container, account);
      pulseReminderChip(container, group, id);
      try {
        if (!state.isPreviewDemo) {
          await saveAccountSection(state.sessionUser, 'checklist', account.checklist);
        }
      } catch (err) {
        showToast(`Reminder save failed: ${err.message}`);
      }
    });
  });
}

/* ---------- View 2: Kinetic Prefarm Queue Deck ---------- */
function runPrefarmTransition(fn) {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if (!reduced && typeof document.startViewTransition === 'function') {
    document.startViewTransition(() => fn());
  } else {
    fn();
  }
}

function renderPrefarmView(container, account) {
  const readOnly = isReadOnly();
  const patchCal = getPatchCalendarInfo(state.serverId);
  const queue = sortAndLabelPrefarmQueue(account.prefarmQueue || []);
  hydrateQueueMaterials(queue, 'prefarm');
  const waterfall = calculateWaterfallPrefarm(queue, account.inventory || {}, account.wallet || {});
  const sharedPool = calculatePrioritySharedPool(
    queue,
    account.inventory || {},
    account.wallet || {},
    patchCal.effectiveScheduleDay || 'Monday'
  );
  const poolItems = Array.isArray(sharedPool) ? sharedPool : [];
  const resinSummary = calcResinAllocationSummary(poolItems);
  const twoPass = calculateTwoPassMilestonePlan(queue, account.inventory || {}, account.wallet || {}, state.serverId);
  const moraStrategy = calcMoraStrategy(account, poolItems, twoPass, patchCal);
  const allCharKeys = getAllCharacterKeys().sort((a, b) => getCharacterMeta(a).name.localeCompare(getCharacterMeta(b).name));

  const targetsWithTel = queue.map((t) => {
    const wfRows = waterfall.get(t.id) || [];
    const pct = calcTargetReadinessPct(wfRows);
    const tel = calcTargetTelemetry(t, poolItems, state.serverId || 'NA');
    const ms = twoPass.byId.get(t.id) || null;
    return { ...t, wfRows, pct, tel, ms };
  });
  const weeklyGates = targetsWithTel.filter((t) => t.tel?.gatekeeper?.type === 'weekly');

  const queueKeys = [...new Set(queue.map((t) => t.characterKey).filter(Boolean))];
  const teamKeys = [...new Set((account.teams || []).flatMap((tm) => (Array.isArray(tm.members) ? tm.members : [])).filter(Boolean))];
  const ownedKeys = (account.characters || []).filter((c) => c.owned).map((c) => c.key);

  const scope = state.prefarmDomainScope || 'queue';
  const scopeCharKeys = scope === 'teams' ? teamKeys : scope === 'owned' ? ownedKeys : queueKeys;
  const domainReport = rankArtifactDomainEfficiency(
    scopeCharKeys,
    getAllStaticKitProfiles(),
    getCharacterMeta,
    getStaticSetVectors(),
    {
      deploymentMode: state.deploymentMode,
      scenarioMode: state.scenarioMode,
      buildLensByChar: state.buildLensByChar,
      activeModeByChar: state.activeModeByChar,
      withFurinaByChar: state.withFurinaByChar,
      savedTeams: account.teams || []
    }
  );

  const commitQueue = (nextQueue, { animate = true, debounceMs = 0 } = {}) => {
    account.prefarmQueue = nextQueue;
    const paint = () => renderPrefarmView(container, account);
    if (animate) runPrefarmTransition(paint);
    else paint();
    if (state.isPreviewDemo) return;
    const persist = async () => {
      try {
        await saveAccountSection(state.sessionUser, 'prefarmQueue', account.prefarmQueue);
      } catch (err) {
        showToast(`Prefarm save failed: ${err.message}`);
      }
    };
    if (debounceMs > 0) {
      clearTimeout(state.prefarmSaveTimer);
      state.prefarmSaveTimer = setTimeout(persist, debounceMs);
    } else {
      clearTimeout(state.prefarmSaveTimer);
      persist();
    }
  };

  const bucketColorMap = {
    talent: 'var(--p-mint)',
    weapon: 'var(--p-gold)',
    boss: 'var(--p-accent)',
    leyline: 'var(--p-text-secondary)'
  };
  const activeTab = state.prefarmSubTab === 'domains' ? 'domains' : 'queue';
  const resinDelta = patchCal.naturalResinToNext - resinSummary.totalResin;
  const resinDeltaText =
    resinSummary.totalResin <= 0
      ? 'All Mats Ready'
      : resinDelta >= 0
        ? `+${resinDelta.toLocaleString()} Spare before ${patchCal.nextLabel}`
        : `${resinDelta.toLocaleString()} Short before ${patchCal.nextLabel}`;

  container.innerHTML = `
    <section class="p-panel p-pf-command">
      <div class="p-pf-topbar">
        <div class="p-pf-subtabs" role="tablist" aria-label="Prefarm Sections">
          <button type="button" role="tab" aria-selected="${activeTab === 'queue'}" class="p-pf-subtab ${activeTab === 'queue' ? 'is-active' : ''}" data-pf-tab="queue">
            <span>Build Queue</span>
            <span class="p-pf-count mono">${targetsWithTel.length}</span>
          </button>
          <button type="button" role="tab" aria-selected="${activeTab === 'domains'}" class="p-pf-subtab ${activeTab === 'domains' ? 'is-active' : ''}" data-pf-tab="domains">
            <span>Artifact Domains</span>
            <span class="p-pf-count mono">${domainReport.domains.length}</span>
          </button>
        </div>
        <div class="p-pf-top-right">
          <span class="p-pf-resin-pill mono ${resinSummary.totalResin <= 0 || resinDelta >= 0 ? 'is-ok' : 'is-short'}" title="Guaranteed upgrade Resin needed vs natural Resin before ${esc(patchCal.nextLabel)}">
            ${renderAssetIcon('materials', 'OriginalResin', 'Original Resin', 'icon-xs')}
            <strong>${resinSummary.totalResin.toLocaleString()}</strong>
            <span class="muted">/ ~${patchCal.naturalResinToNext.toLocaleString()}</span>
            <span class="p-pf-delta">${esc(resinDeltaText)}</span>
          </span>
          ${
            !readOnly && activeTab === 'queue'
              ? `<button type="button" class="p-btn p-btn-primary p-btn-sm" data-pf-toggle-add aria-expanded="${Boolean(state.prefarmAddOpen)}">${
                  state.prefarmAddOpen ? 'Close' : '+ Add Character'
                }</button>`
              : ''
          }
        </div>
      </div>

      ${
        resinSummary.buckets.length
          ? `<div class="p-resin-bar" role="img" aria-label="Resin breakdown">
               ${resinSummary.buckets
                 .map(
                   (b) =>
                     `<span class="p-resin-seg" style="width:${b.pct}%;background:${bucketColorMap[b.id] || 'var(--p-accent)'};" title="${esc(b.label)}: ${b.resin.toLocaleString()} Resin (${b.pct}%)"></span>`
                 )
                 .join('')}
             </div>
             <div class="p-pf-legend-row">
               <div class="p-resin-legend">
                 ${resinSummary.buckets
                   .map(
                     (b) =>
                       `<span class="p-resin-leg-item mono"><span class="p-resin-dot" style="background:${bucketColorMap[b.id] || 'var(--p-accent)'};"></span>${esc(b.label)} <strong>${b.resin.toLocaleString()}</strong></span>`
                   )
                   .join('')}
               </div>
               <div class="p-pf-flags">
                 <span class="p-badge mono ${moraStrategy.statusTone === 'coral' ? 'p-badge-coral' : moraStrategy.statusTone === 'gold' ? 'p-badge-amber' : 'p-badge-mint'}">${renderAssetIcon('materials', 'Mora', 'Mora', 'icon-xs')} ${esc(moraStrategy.badgeText)}</span>
                 ${weeklyGates
                   .map(
                     (t) =>
                       `<span class="p-badge mono p-cond-warn">${esc(getCharacterMeta(t.characterKey).name)} · ~${t.tel.weeklyWeeks}w Weekly</span>`
                   )
                   .join('')}
               </div>
             </div>`
          : ''
      }

      ${
        !readOnly && activeTab === 'queue' && state.prefarmAddOpen
          ? `<form id="p-pf-add-form" class="p-pf-add-drawer">
               <label class="proto-field p-pf-field-char">
                 <span>Character</span>
                 <select name="characterKey" class="proto-select" required>
                   ${allCharKeys.map((k) => `<option value="${esc(k)}">${esc(getCharacterMeta(k).name)}</option>`).join('')}
                 </select>
               </label>
               <label class="proto-field p-pf-field-sm">
                 <span>Priority</span>
                 <input type="number" name="tier" min="1" max="5" value="1" class="p-input mono" />
               </label>
               <label class="proto-field p-pf-field-sm">
                 <span>Lv.</span>
                 <input type="number" name="targetLevel" min="1" max="100" value="90" class="p-input mono" />
               </label>
               <label class="proto-field p-pf-field-xs">
                 <span>A</span>
                 <input type="number" name="tAuto" min="1" max="10" value="6" class="p-input mono" />
               </label>
               <label class="proto-field p-pf-field-xs">
                 <span>E</span>
                 <input type="number" name="tSkill" min="1" max="10" value="9" class="p-input mono" />
               </label>
               <label class="proto-field p-pf-field-xs">
                 <span>Q</span>
                 <input type="number" name="tBurst" min="1" max="10" value="9" class="p-input mono" />
               </label>
               <button type="submit" class="p-btn p-btn-primary">Add</button>
             </form>`
          : ''
      }
    </section>

    ${
      activeTab === 'queue'
        ? `<section class="p-pf-deck" aria-label="Build Queue">
             ${
               targetsWithTel.length
                 ? targetsWithTel
                     .map((t, idx) => {
                       const cm = getCharacterMeta(t.characterKey);
                       const el = String(cm.element || '').toLowerCase();
                       const funcPct = t.ms?.funcPct ?? t.pct;
                       const tLv = Number(t.targetLevel) || 90;
                       const tA = Number(t.targetTalent?.auto ?? t.targetTalents?.[0] ?? 6);
                       const tE = Number(t.targetTalent?.skill ?? t.targetTalents?.[1] ?? 9);
                       const tQ = Number(t.targetTalent?.burst ?? t.targetTalents?.[2] ?? 9);
                       const missingRows = t.wfRows.filter((r) => r.deficit > 0 || r.reservedByPrev > 0);
                       const isExpanded = state.prefarmExpandedId === t.id;
                       const visibleRows = isExpanded ? missingRows : missingRows.slice(0, 8);
                       const extraCount = Math.max(0, missingRows.length - visibleRows.length);
                       const safeVt = String(t.id || idx).replace(/[^a-zA-Z0-9_-]/g, '');
                       return `
                         <article class="p-pf-card" data-el="${esc(el)}" style="view-transition-name:pf-${safeVt};">
                           <div class="p-pf-card-main">
                             <div class="p-pf-id">
                               <span class="p-pf-rank mono">${esc(t.tierLabel)}</span>
                               <button type="button" class="p-target-portrait p-pf-portrait-btn" data-p-open-char="${esc(t.characterKey)}" title="Open ${esc(cm.name)} Sheet">
                                 ${renderAssetIcon('characters', t.characterKey, cm.name, 'icon-hud-char')}
                               </button>
                               <div class="p-pf-title-col">
                                 <div class="p-pf-name-row">
                                   <button type="button" class="p-pf-name-btn" data-p-open-char="${esc(t.characterKey)}">${esc(cm.name)}</button>
                                   ${t.ms?.bossUnreleased ? `<span class="p-badge p-badge-amber mono">7.3 Boss</span>` : ''}
                                 </div>
                                 <div class="p-pf-sub-pills">
                                   ${
                                     t.ms?.bookName
                                       ? `<span class="p-pf-book-chip mono">${renderAssetIcon('materials', `PhilosophiesOf${t.ms.bookName}`, t.ms.bookName, 'icon-xs')}<span>${esc(t.ms.bookName)} · ${esc(t.ms.bookDays.join('/') || 'Sun')}</span></span>`
                                       : ''
                                   }
                                   <span class="p-pf-eta mono">${esc(t.tel.etaLabel)}</span>
                                 </div>
                               </div>
                             </div>

                             <div class="p-pf-steppers" aria-label="Target Level and Talents">
                               <div class="p-pf-step">
                                 <span class="p-pf-step-lbl">Lv</span>
                                 ${
                                   !readOnly
                                     ? `<button type="button" class="p-pf-step-btn" data-pf-step="level" data-pf-dir="-10" data-pf-id="${esc(t.id)}" aria-label="Decrease target level">−</button>`
                                     : ''
                                 }
                                 <strong class="mono">${tLv}</strong>
                                 ${
                                   !readOnly
                                     ? `<button type="button" class="p-pf-step-btn" data-pf-step="level" data-pf-dir="10" data-pf-id="${esc(t.id)}" aria-label="Increase target level">+</button>`
                                     : ''
                                 }
                               </div>
                               ${[
                                 ['auto', 'A', tA],
                                 ['skill', 'E', tE],
                                 ['burst', 'Q', tQ]
                               ]
                                 .map(
                                   ([field, lbl, val]) => `
                                 <div class="p-pf-step">
                                   <span class="p-pf-step-lbl">${lbl}</span>
                                   ${
                                     !readOnly
                                       ? `<button type="button" class="p-pf-step-btn" data-pf-step="${field}" data-pf-dir="-1" data-pf-id="${esc(t.id)}" aria-label="Decrease ${lbl}">−</button>`
                                       : ''
                                   }
                                   <strong class="mono ${val === 10 ? 'text-gold' : ''}">${val}</strong>
                                   ${
                                     !readOnly
                                       ? `<button type="button" class="p-pf-step-btn" data-pf-step="${field}" data-pf-dir="1" data-pf-id="${esc(t.id)}" aria-label="Increase ${lbl}">+</button>`
                                       : ''
                                   }
                                 </div>`
                                 )
                                 .join('')}
                             </div>

                             <div class="p-pf-progress-col">
                               <div class="p-pf-pct-row mono">
                                 <span class="${funcPct >= 100 ? 'text-mint' : 'text-gold'}">${funcPct >= 100 ? 'Lv.80 ✓' : `Lv.80 ${funcPct}%`}</span>
                                 <span class="muted">Max ${t.pct}%</span>
                               </div>
                               <div class="p-bar p-bar-dual" title="Lv.80 Ready: ${funcPct}% · Full Max: ${t.pct}%">
                                 <span class="p-bar-func" style="width:${funcPct}%;"></span>
                                 <span class="p-bar-max" style="width:${t.pct}%;"></span>
                               </div>
                             </div>

                             ${
                               !readOnly
                                 ? `<div class="p-pf-actions">
                                      <button type="button" class="p-btn p-btn-outline p-btn-xs" data-p-pf-move="up" data-p-pf-id="${esc(t.id)}" ${idx === 0 ? 'disabled' : ''} aria-label="Move ${esc(cm.name)} up">↑</button>
                                      <button type="button" class="p-btn p-btn-outline p-btn-xs" data-p-pf-move="down" data-p-pf-id="${esc(t.id)}" ${idx === queue.length - 1 ? 'disabled' : ''} aria-label="Move ${esc(cm.name)} down">↓</button>
                                      <button type="button" class="p-btn p-btn-outline p-btn-xs text-coral" data-p-pf-del="${esc(t.id)}" aria-label="Remove ${esc(cm.name)}">×</button>
                                    </div>`
                                 : ''
                             }
                           </div>

                           <div class="p-pf-mat-strip">
                             ${
                               visibleRows.length
                                 ? visibleRows
                                     .map(
                                       (r) => `
                                       <button type="button" class="p-pf-mat-chip ${r.reservedByPrev > 0 ? 'is-shared' : ''}" data-p-jump-mat="${esc(r.name)}" title="${esc(r.name)} · Owned ${r.owned.toLocaleString()} / Need ${r.needed.toLocaleString()}${r.reservedByPrev > 0 ? ` (${r.reservedByPrev.toLocaleString()} saved for ${r.reservedByLabel || 'higher priority'})` : ''}">
                                         ${renderAssetIcon('materials', r.key, r.name, 'icon-xs')}
                                         <span class="p-pf-mat-name">${esc(r.name)}</span>
                                         <span class="mono ${r.deficit > 0 ? 'text-coral' : 'text-mint'}">${r.deficit > 0 ? `-${r.deficit.toLocaleString()}` : '✓'}</span>
                                       </button>`
                                     )
                                     .join('') +
                                   (extraCount > 0 || isExpanded
                                     ? `<button type="button" class="p-pf-mat-more mono" data-p-pf-expand="${esc(t.id)}">${isExpanded ? 'Show less' : `+${extraCount} more`}</button>`
                                     : '')
                                 : '<span class="p-badge p-badge-mint mono">All materials ready</span>'
                             }
                           </div>
                         </article>`;
                     })
                     .join('')
                 : `<div class="p-panel muted">No characters queued yet — click <strong>+ Add Character</strong> above.</div>`
             }
           </section>`
        : `<section class="p-panel" aria-label="Artifact Domains &amp; Strongbox">
             <div class="p-panel-head" style="flex-wrap:wrap;gap:10px;">
               <h2 class="p-panel-title">Artifact Domains &amp; Strongbox</h2>
               <div class="p-lens-pills" role="group" aria-label="Domain Scope">
                 <button type="button" class="p-pill-btn ${scope === 'queue' ? 'active' : ''}" data-pf-scope="queue">Queue (${queueKeys.length})</button>
                 <button type="button" class="p-pill-btn ${scope === 'teams' ? 'active' : ''}" data-pf-scope="teams">Teams (${teamKeys.length})</button>
                 <button type="button" class="p-pill-btn ${scope === 'owned' ? 'active' : ''}" data-pf-scope="owned">Owned (${ownedKeys.length})</button>
               </div>
             </div>
             ${
               domainReport.domains.length
                 ? `<div class="p-dom-eff-grid">
                      ${domainReport.domains
                        .slice(0, 10)
                        .map((d) => {
                          const badgeCls =
                            d.verdictTone === 'mint'
                              ? 'p-badge-mint'
                              : d.verdictTone === 'gold'
                                ? 'p-badge-gold'
                                : d.verdictTone === 'warn'
                                  ? 'p-cond-warn'
                                  : '';
                          return `
                            <article class="p-dom-eff-card">
                              <div class="p-dom-eff-head">
                                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0;">
                                  <strong style="font-size:14px;">${esc(d.domain)}</strong>
                                  <span class="p-badge mono">${esc(d.region)}</span>
                                </div>
                                <span class="p-badge mono ${badgeCls}">${esc(d.verdict)}</span>
                              </div>
                              <div class="p-dom-sets-pair">
                                ${d.sets
                                  .map((s) => {
                                    const sIcon = getArtifactIcon(s.name, 'flower') || s.icon || '';
                                    const isUnused = s.matchedChars.length === 0;
                                    return `
                                      <div class="p-dom-set-slot ${isUnused ? 'is-unused' : ''}">
                                        <button type="button" class="p-dom-set-btn" data-p-artset="4pc ${esc(s.name)}" title="Inspect 4pc ${esc(s.name)}">
                                          ${sIcon ? `<img src="${esc(sIcon)}" alt="" class="icon-xs" loading="lazy" />` : ''}
                                          <span>${esc(s.name)}</span>
                                        </button>
                                        <div class="p-dom-char-chips">
                                          ${
                                            s.matchedChars.length
                                              ? s.matchedChars
                                                  .map(
                                                    (mc) =>
                                                      `<button type="button" class="p-badge mono ${mc.rank === 1 ? 'p-badge-gold' : ''}" data-p-open-char="${esc(mc.key)}">#${mc.rank} ${esc(mc.name)}</button>`
                                                  )
                                                  .join('')
                                              : '<span class="muted" style="font-size:11.5px;">Fodder</span>'
                                          }
                                        </div>
                                      </div>`;
                                  })
                                  .join('')}
                              </div>
                            </article>`;
                        })
                        .join('')}
                    </div>`
                 : '<div class="muted" style="font-size:13px;">No characters in this scope.</div>'
             }
           </section>`
    }
  `;

  container.querySelectorAll('[data-pf-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.prefarmSubTab = btn.dataset.pfTab;
      runPrefarmTransition(() => {
        renderPrefarmView(container, account);
        animatePrefarmEntrance(container);
      });
    });
  });

  container.querySelector('[data-pf-toggle-add]')?.addEventListener('click', () => {
    state.prefarmAddOpen = !state.prefarmAddOpen;
    renderPrefarmView(container, account);
  });

  container.querySelectorAll('[data-pf-scope]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.prefarmDomainScope = btn.dataset.pfScope;
      renderPrefarmView(container, account);
    });
  });

  container.querySelectorAll('[data-p-pf-expand]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.pPfExpand;
      state.prefarmExpandedId = state.prefarmExpandedId === id ? null : id;
      renderPrefarmView(container, account);
    });
  });

  container.querySelectorAll('[data-p-jump-mat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.vaultCategory = 'All';
      state.vaultSearch = btn.dataset.pJumpMat;
      setActiveTab('vault');
    });
  });

  container.querySelectorAll('[data-p-artset]').forEach((btn) => {
    btn.addEventListener('click', () => openArtifactSetInspector(btn.dataset.pArtset, btn));
  });

  container.querySelectorAll('[data-p-open-char]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.inspectedCharKey = btn.dataset.pOpenChar;
      setActiveTab('roster');
    });
  });

  container.querySelectorAll('[data-pf-step]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (readOnly) return;
      const id = btn.dataset.pfId;
      const field = btn.dataset.pfStep;
      const dir = Number(btn.dataset.pfDir) || 0;
      let hitCrown = false;
      const next = (account.prefarmQueue || []).map((item) => {
        if (item.id !== id) return item;
        if (field === 'level') {
          const cur = Number(item.targetLevel) || 90;
          const nextLv = Math.max(20, Math.min(90, cur + dir));
          return { ...item, targetLevel: nextLv };
        }
        const curT = item.targetTalent || {
          auto: item.targetTalents?.[0] ?? 6,
          skill: item.targetTalents?.[1] ?? 9,
          burst: item.targetTalents?.[2] ?? 9
        };
        const nextVal = Math.max(1, Math.min(10, (Number(curT[field]) || 1) + dir));
        if (nextVal === 10) hitCrown = true;
        return { ...item, targetTalent: { ...curT, [field]: nextVal } };
      });
      commitQueue(next, { animate: false, debounceMs: 450 });
      pulseStepperValue(container, id, field, hitCrown);
    });
  });

  document.getElementById('p-pf-add-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (readOnly) return;
    const fd = new FormData(e.target);
    const characterKey = fd.get('characterKey');
    const existingChar = (account.characters || []).find((c) => c.key === characterKey);
    const newItem = {
      id: `pf_${characterKey}_${Date.now()}`,
      characterKey,
      tier: Number(fd.get('tier')) || 1,
      currentLevel: existingChar?.level || 1,
      targetLevel: Number(fd.get('targetLevel')) || 90,
      currentTalent: existingChar?.talent || { auto: 1, skill: 1, burst: 1 },
      targetTalent: {
        auto: Number(fd.get('tAuto')) || 6,
        skill: Number(fd.get('tSkill')) || 9,
        burst: Number(fd.get('tBurst')) || 9
      },
      weaponKey: existingChar?.equippedWeapon?.key || '',
      weaponCurrentLevel: existingChar?.equippedWeapon?.level || 1,
      weaponTargetLevel: 90
    };
    state.prefarmAddOpen = false;
    commitQueue([...(account.prefarmQueue || []), newItem], { animate: true });
    showToast(`Added ${getCharacterMeta(characterKey).name} to Prefarm`);
  });

  container.querySelectorAll('[data-p-pf-move]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.pPfId;
      const dir = btn.dataset.pPfMove;
      const list = [...(account.prefarmQueue || [])];
      const idx = list.findIndex((x) => x.id === id);
      if (idx < 0) return;
      const swap = dir === 'up' ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= list.length) return;
      [list[idx], list[swap]] = [list[swap], list[idx]];
      commitQueue(list, { animate: true });
    });
  });

  container.querySelectorAll('[data-p-pf-del]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.pPfDel;
      commitQueue((account.prefarmQueue || []).filter((x) => x.id !== id), { animate: true });
      showToast('Removed from Queue');
    });
  });
}

/* ---------- View 3: Roster + Dossier ---------- */
function renderStatRadarSvg(combat, primaryStat = 'ATK', statCap = null, substatWeights = null) {
  const isHpPrimary = primaryStat === 'HP';
  const isDefPrimary = primaryStat === 'DEF';
  const hpTarget = statCap && isHpPrimary ? Math.max(35000, Number(statCap)) : 45000;
  const topAxis = isHpPrimary
    ? { label: 'HP', val: Math.min(1, (combat?.maxHp || 0) / hpTarget), isPrimary: true }
    : isDefPrimary
      ? { label: 'DEF', val: Math.min(1, (combat?.totalDef || 0) / 2600), isPrimary: true }
      : { label: 'ATK', val: Math.min(1, (combat?.totalAtk || 0) / 2500), isPrimary: true };

  const emRelevant = Number(substatWeights?.eleMas || 0) > 0 || (combat?.em || 0) >= 40;
  const fourthAxis =
    (isHpPrimary || isDefPrimary) && !emRelevant
      ? { label: 'ATK', val: Math.min(1, (combat?.totalAtk || 0) / 2200) }
      : { label: 'EM', val: Math.min(1, (combat?.em || 0) / 400) };

  const axes = [
    topAxis,
    { label: 'CRIT', val: Math.min(1, ((combat?.critRate || 5) * 2 + (combat?.critDmg || 50)) / 360) },
    { label: 'ER', val: Math.min(1, ((combat?.er || 100) - 100) / 120) },
    fourthAxis,
    { label: 'DMG', val: Math.min(1, (combat?.dmgBonus || 0) / 70) }
  ];
  const cx = 75, cy = 75, r = 46;
  const pt = (i, scale) => {
    const a = (-Math.PI / 2) + (i * 2 * Math.PI) / 5;
    return [cx + Math.cos(a) * r * scale, cy + Math.sin(a) * r * scale];
  };
  const ringPts = (s) => axes.map((_, i) => pt(i, s).map((n) => n.toFixed(1)).join(',')).join(' ');
  const rawPts = axes.map((ax, i) => pt(i, Math.max(0.18, ax.val)));
  const polyPts = rawPts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');
  const dots = rawPts
    .map(([x, y], i) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${i === 0 ? '2.8' : '2'}" fill="${i === 0 ? 'var(--p-gold)' : 'var(--el-ink, var(--p-accent))'}" />`)
    .join('');
  const labels = axes
    .map((ax, i) => {
      const [x, y] = pt(i, 1.32);
      const fill = ax.isPrimary ? 'var(--p-gold)' : 'var(--p-text-secondary)';
      return `<text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="middle" fill="${fill}" font-size="10" font-weight="${ax.isPrimary ? '700' : '600'}" font-family="var(--p-font-mono)">${ax.label}</text>`;
    })
    .join('');

  return `
    <svg viewBox="0 0 150 150" width="150" height="150" aria-hidden="true" class="p-radar-svg">
      <polygon points="${ringPts(1)}" fill="none" stroke="var(--p-border)" stroke-width="1" />
      <polygon points="${ringPts(0.6)}" fill="none" stroke="var(--p-border)" stroke-width="1" stroke-dasharray="2 2" />
      <polygon class="p-radar-poly" points="${polyPts}" fill="var(--el-wash, rgba(94,234,212,0.18))" stroke="var(--el-ink, var(--p-accent))" stroke-width="1.6" />
      ${dots}
      ${labels}
    </svg>`;
}

function renderRosterView(container, account) {
  const readOnly = isReadOnly();
  const disabled = readOnly ? 'disabled' : '';
  const ownedMap = new Map((account.characters || []).map((c) => [c.key, c]));
  const prefarmSet = new Set((account.prefarmQueue || []).map((t) => t.characterKey));
  const allKeys = [...new Set([...getAllCharacterKeys(), ...ownedMap.keys()])];

  const chars = allKeys.map((key) => {
    const owned = ownedMap.get(key);
    const meta = getCharacterMeta(key);
    const equippedWeapon = (account.weapons || []).find((w) => w.location === key) || owned?.equippedWeapon || null;
    const equippedArtifacts = (account.artifacts || []).filter((a) => a.location === key);
    return owned
      ? { ...owned, owned: true, meta, equippedWeapon, equippedArtifacts: equippedArtifacts.length ? equippedArtifacts : (owned.equippedArtifacts || []) }
      : { key, owned: false, level: 0, constellation: 0, meta, equippedWeapon: null, equippedArtifacts: [] };
  });

  if (state.inspectedCharKey) {
    const char = chars.find((c) => c.key === state.inspectedCharKey) || chars[0];
    const kitData = getCharacterKit(char.key);
    const weapon = char.equippedWeapon;
    const weaponMeta = weapon ? getWeaponMeta(weapon.key) : null;
    const weaponStats = weapon ? getWeaponStats(weapon.key) : null;
    const selectedLens = state.buildLensByChar[char.key] || '';
    const selectedModeId = state.activeModeByChar[char.key] || '';
    const priorityDial = state.priorityDialByChar[char.key] ?? 50;
    const staticProfile = getStaticKitProfile(char.key);
    const allProfiles = getAllStaticKitProfiles();
    const setVectors = getStaticSetVectors();
    const furinaInSavedSquad = (account.teams || []).some((t) => {
      const members = Array.isArray(t.members) ? t.members : [];
      return members.includes(char.key) && members.includes('Furina');
    });
    const withFurina = state.withFurinaByChar[char.key] ?? furinaInSavedSquad;
    const sandboxCtx = staticProfile
      ? applySandboxContext(char.key, staticProfile, {
          deploymentMode: state.deploymentMode,
          scenarioMode: state.scenarioMode,
          activeLens: selectedLens,
          activeModeId: selectedModeId,
          constellation: char.constellation || 0,
          withFurina,
          priorityDial,
          allProfiles,
          charMetaFn: getCharacterMeta
        })
      : null;
    const effectiveExplicitLens = selectedLens || (sandboxCtx?.chosenMode?.lens || '');
    const combat = computeCharacterCombatStats(
      char,
      weapon,
      char.equippedArtifacts || [],
      kitData,
      weaponStats,
      effectiveExplicitLens,
      sandboxCtx?.effectiveSubstatWeights || null
    );
    const activeLens = combat?.activeLens || {
      lens: sandboxCtx?.activeLens || combat?.kitAnalysis?.roleInfo?.primaryRole || 'Quickswap Support',
      reason: 'Kit default'
    };
    const buildLenses = (staticProfile?.playstyleLenses?.length ? staticProfile.playstyleLenses : combat?.kitAnalysis?.roleInfo?.buildLenses) || [];
    const capabilities = combat?.kitAnalysis?.roleInfo?.capabilities || combat?.kitAnalysis?.roleInfo?.functionTags || [];
    const elemStat = combat?.dmgBonus || 0;
    const elemLabel = combat?.dmgBonusKey ? formatStatKey(combat.dmgBonusKey) : `${char.meta.element || 'Elemental'} DMG%`;
    const elAttr = String(char.meta.element || '').toLowerCase();
    const talArr = char.talent ? [char.talent.auto || 1, char.talent.skill || 1, char.talent.burst || 1] : (char.talents || [1, 1, 1]);
    const erReport = evaluateErComfort(char, combat, account.teams || [], account.weapons || [], kitData, combat?.kitAnalysis, char.equippedArtifacts || []);
    const kitScaling = extractKitScaling(char.key, kitData, combat?.kitAnalysis);
    const statCapVal = staticProfile?.statThresholdCurve?.ceiling || staticProfile?.features?.threshold_cap_value || null;
    const modulatedCtx = sandboxCtx ? modulateContextWithEquippedTotals(sandboxCtx, staticProfile, combat, statCapVal) : null;
    const baseWeights = deriveSubstatRelevanceMap(char, combat?.kitAnalysis, weapon, char.equippedArtifacts || [], erReport, combat, kitData);
    const substatWeights = modulatedCtx?.effectiveSubstatWeights ? { ...baseWeights, ...modulatedCtx.effectiveSubstatWeights } : baseWeights;
    const roleLabel = modulatedCtx?.chosenMode?.label || combat?.kitAnalysis?.roleInfo?.primaryRole || 'Kit Scaling';
    const recSets =
      staticProfile && modulatedCtx && setVectors.length
        ? rankArtifactSetsByVector(char.meta, staticProfile, modulatedCtx, setVectors, kitData)
        : deriveArtifactSetRecommendations(char, combat?.kitAnalysis, kitScaling, kitData);
    const primaryStat = resolvePrimaryStat(combat?.kitAnalysis, kitScaling, staticProfile);
    const rawScalingList = kitScaling?.scalingStats?.length ? [...kitScaling.scalingStats] : [primaryStat];
    const scalingStatsList = [primaryStat, ...rawScalingList.filter((s) => s !== primaryStat)];
    const effectiveErReq = staticProfile?.features?.zero_energy
      ? 0
      : Math.max(100, (erReport?.baseReq || 100) + (modulatedCtx?.erDeltaPct || 0));
    const prevSnap = state.lastDossierSnap?.charKey === char.key ? state.lastDossierSnap : null;
    const currWrv = Math.round(combat?.wrvPct || 0);
    const wrvChanged = Boolean(prevSnap && prevSnap.wrv !== currWrv);
    const erChanged = Boolean(prevSnap && prevSnap.erReq !== effectiveErReq);
    const currSubTiers = {};
    for (const k of ['hp', 'hp_', 'atk', 'atk_', 'def', 'def_', 'eleMas', 'enerRech_', 'critRate_', 'critDMG_']) {
      currSubTiers[k] = classifySubstatRelevance({ key: k, value: 1 }, substatWeights).tier;
    }
    const currSetList = recSets.map((r) => r.set);
    state.lastDossierSnap = { charKey: char.key, wrv: currWrv, erReq: effectiveErReq, subTiers: currSubTiers, sets: currSetList };
    const slotOrder = { flower: 0, plume: 1, sands: 2, goblet: 3, circlet: 4 };
    const sortedArts = [...(char.equippedArtifacts || [])].sort((a, b) => (slotOrder[a.slotKey] ?? 9) - (slotOrder[b.slotKey] ?? 9));
    const setCounts = {};
    sortedArts.forEach((a) => {
      if (a.setKey) setCounts[a.setKey] = (setCounts[a.setKey] || 0) + 1;
    });
    const activeSets = Object.entries(setCounts)
      .filter(([, n]) => n >= 2)
      .map(([setKey, n]) => ({ setKey, count: n, bonus: n >= 4 ? '4pc Active' : '2pc Active' }));
    const rawTargetTal = char.targetTalent
      ? [char.targetTalent.auto, char.targetTalent.skill, char.targetTalent.burst]
      : Array.isArray(char.targetTalents)
        ? char.targetTalents
        : [];
    const targetTalDefaults = [0, 1, 2].map((i) => {
      const n = Number(rawTargetTal[i]);
      if (char.status === 'Built') return Math.max(talArr[i] || 1, Number.isFinite(n) && n > 0 ? n : talArr[i] || 9);
      return Number.isFinite(n) && n > 0 ? n : Math.max(talArr[i] || 1, 9);
    });

    if (!kitData || (weapon && !weaponStats)) {
      Promise.all([
        !kitData ? ensureCharacterKitAndStats(char.key) : Promise.resolve(false),
        weapon && !weaponStats ? ensureWeaponStats(weapon.key) : Promise.resolve(false)
      ]).then((res) => {
        if (res.some(Boolean) && state.inspectedCharKey === char.key) {
          renderRosterView(container, account);
        }
      });
    }

    container.innerHTML = `
      <div class="p-toolbar">
        <button type="button" id="p-back-roster" class="p-btn p-btn-outline p-btn-sm">← All Characters</button>
        <span class="muted">${esc(char.meta.name)} · ${esc(char.meta.element)} · ${esc(char.meta.weaponType)} · ${char.meta.rarity}★</span>
      </div>

      <section class="p-dossier-hero" data-el="${esc(elAttr)}" data-rarity="${char.meta.rarity || 5}">
        <svg class="p-dossier-astrolabe" viewBox="0 0 200 200" aria-hidden="true">
          <circle cx="100" cy="100" r="92" fill="none" stroke="var(--p-gold)" stroke-width="0.8" stroke-dasharray="4 6" />
          <circle cx="100" cy="100" r="72" fill="none" stroke="var(--el-ink, var(--p-accent))" stroke-width="0.9" opacity="0.65" />
          <polygon points="100,14 186,100 100,186 14,100" fill="none" stroke="var(--p-gold)" stroke-width="0.6" opacity="0.5" />
        </svg>
        <div class="p-portrait-box" style="view-transition-name:hero-portrait;">
          ${renderGachaSplash(char.key, char.meta.name)}
          <div class="p-const-strip">
            ${[1, 2, 3, 4, 5, 6]
              .map((i) => `<div class="p-const-pip mono ${(char.constellation || 0) >= i ? 'is-on' : ''}">C${i}</div>`)
              .join('')}
          </div>
        </div>

        <div style="position:relative;z-index:1;">
          <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <h2 class="proto-dossier-name" style="view-transition-name:hero-name;">${esc(char.meta.name)}</h2>
            <span class="mono muted">Lv.${char.level || 1} · A/E/Q ${talArr.join('/')} · <abbr title="Artifact-only Crit Value = (CRIT Rate × 2) + CRIT DMG">${(combat?.subCv || 0).toFixed(1)} CV</abbr></span>
          </div>

          <div class="p-stats-radar-wrap">
            <div class="p-stat-grid">
              <div class="p-stat-row"><span class="muted">HP</span><strong class="mono">${Math.round(combat?.maxHp || 0).toLocaleString()}</strong></div>
              <div class="p-stat-row"><span class="muted">ATK</span><strong class="mono">${Math.round(combat?.totalAtk || 0).toLocaleString()}</strong></div>
              <div class="p-stat-row"><span class="muted">DEF</span><strong class="mono">${Math.round(combat?.totalDef || 0).toLocaleString()}</strong></div>
              <div class="p-stat-row"><span class="muted">EM</span><strong class="mono">${Math.round(combat?.em || 0).toLocaleString()}</strong></div>
              <div class="p-stat-row"><span class="muted">CRIT Rate</span><strong class="mono">${(combat?.critRate || 5).toFixed(1)}%</strong></div>
              <div class="p-stat-row"><span class="muted">CRIT DMG</span><strong class="mono">${(combat?.critDmg || 50).toFixed(1)}%</strong></div>
              <div class="p-stat-row">
                <span class="muted">ER% ${effectiveErReq > 0 ? `<span style="font-size:11.5px;opacity:0.78;">(${esc(sandboxCtx?.deploymentMode?.shortLabel || 'Solo')} ~${effectiveErReq}%)</span>` : '<span style="font-size:11.5px;opacity:0.78;">(0-Energy Kit)</span>'}</span>
                <strong class="mono ${erChanged ? 'is-changed ' : ''}${effectiveErReq > 0 && (combat?.er || 100) < effectiveErReq ? 'text-amber' : 'text-mint'}">${(combat?.er || 100).toFixed(1)}%</strong>
              </div>
              <div class="p-stat-row"><span class="muted">${esc(elemLabel)}</span><strong class="mono">${elemStat.toFixed(1)}%</strong></div>
            </div>
            <div style="display:flex;justify-content:center;">${renderStatRadarSvg(combat, primaryStat, statCapVal, substatWeights)}</div>
          </div>

          ${
            weaponMeta
              ? `<button type="button" class="p-row p-wep-trigger" style="margin-top:8px;" data-p-open-weapon-rank="true" title="Click to open ML Weapon Rankings (Owned / All & Signature)">
                   <div class="p-row-left">
                     ${renderAssetIcon('weapons', weapon.key, weaponMeta.name, 'icon-sm')}
                     <div>
                       <div class="p-row-title">${esc(weaponMeta.name)}</div>
                       <div class="p-row-sub mono">Lv.${weapon.level || 90} · R${weapon.refinement || 1}</div>
                     </div>
                   </div>
                   <span class="p-badge mono">R${weapon.refinement || 1} Equipped · Rankings ↗</span>
                 </button>`
              : `<button type="button" class="p-row p-wep-trigger" style="margin-top:8px;" data-p-open-weapon-rank="true">
                   <div class="p-row-left">
                     <div>
                       <div class="p-row-title">No Weapon Equipped</div>
                       <div class="p-row-sub">Click to view ML Weapon Rankings &amp; Signature</div>
                     </div>
                   </div>
                   <span class="p-badge mono">Rankings ↗</span>
                 </button>`
          }

          <div class="p-art-strip">
            ${['flower', 'plume', 'sands', 'goblet', 'circlet']
              .map((slot) => {
                const art = (char.equippedArtifacts || []).find((a) => a.slotKey === slot);
                if (!art) return `<div class="p-art-slot muted">${slot}</div>`;
                const icon = getArtifactIcon(art.setKey, art.slotKey);
                return `
                  <div class="p-art-slot">
                    ${icon ? `<img src="${icon}" alt="${esc(slot)}" />` : ''}
                    <span class="mono text-gold">+${art.level ?? 20}</span>
                    <span>${esc(formatStatKey(art.mainStatKey))}</span>
                  </div>`;
              })
              .join('')}
          </div>
        </div>
      </section>

      <div class="p-subtabs" role="tablist" aria-label="Character dossier sections">
        <button type="button" class="p-pill-btn ${state.dossierTab === 'loadout' ? 'active' : ''}" role="tab" aria-selected="${state.dossierTab === 'loadout'}" data-p-dtab="loadout">Loadout &amp; Build</button>
        <button type="button" class="p-pill-btn ${state.dossierTab === 'kit' ? 'active' : ''}" role="tab" aria-selected="${state.dossierTab === 'kit'}" data-p-dtab="kit">Kit &amp; Codex</button>
      </div>

      ${
        state.dossierTab === 'kit'
          ? `<section id="p-kit-codex" class="p-list" style="gap:16px;">
               <div class="p-kit-toolbar">
                 <div class="p-filter-pills" role="tablist" aria-label="Kit section filter">
                   ${[
                     { id: 'talents', label: 'Talents' },
                     { id: 'passives', label: 'Passives' },
                     { id: 'constellations', label: 'Constellations' },
                     { id: 'all', label: 'All' }
                   ]
                     .map(
                       (tab) =>
                         `<button type="button" class="p-pill-btn ${state.kitSectionFilter === tab.id ? 'active' : ''}" role="tab" aria-selected="${state.kitSectionFilter === tab.id}" aria-controls="p-kit-panels" data-kit-tab="${tab.id}">${tab.label}</button>`
                     )
                     .join('')}
                 </div>
                 <div class="p-lens-pills" role="group" aria-label="Kit reading mode">
                   <button type="button" class="p-pill-btn ${state.kitTextMode === 'razor' ? 'active' : ''}" data-kit-mode="razor" title="Distilled mechanical bullets (no lore fluff, no truncation)">Razor TL;DR</button>
                   <button type="button" class="p-pill-btn ${state.kitTextMode === 'full' ? 'active' : ''}" data-kit-mode="full" title="Full Hoyoverse in-game text">Full Text</button>
                 </div>
               </div>
               <div id="p-kit-panels" class="p-list" style="gap:20px;">
               ${
                 kitData
                   ? (() => {
                       const conLevel = Number(char.constellation || 0);
                       const filt = state.kitSectionFilter || 'talents';
                       const razor = staticProfile?.razorSummary || null;
                       const isRazor = state.kitTextMode === 'razor' && Boolean(razor);
                       const razorBanner = isRazor
                         ? `<div class="p-razor-banner">
                              <div class="p-razor-rule mono">${esc(razor.statsRule)}</div>
                            </div>`
                         : '';
                       const renderGroup = (key, heading, entries, isCon = false) =>
                         entries.length && (filt === 'all' || filt === key)
                           ? `<div data-kit-panel="${key}">
                                <h3 class="p-kit-section-title">${heading}</h3>
                                <div class="p-kit-grid">
                                  ${entries
                                    .map((entry, idx) => {
                                      const unlocked = isCon ? idx + 1 <= conLevel : false;
                                      const locked = isCon && char.owned && !unlocked;
                                      const cls = isCon ? (unlocked ? 'is-unlocked' : locked ? 'is-locked' : '') : '';
                                      const bullets = isRazor && Array.isArray(entry.razorBullets) && entry.razorBullets.length ? entry.razorBullets : null;
                                      return `
                                        <article class="p-kit-card ${cls}" data-el="${esc(elAttr)}">
                                          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
                                            <strong style="font-size:14.5px;line-height:1.3;">${esc(entry.title)}</strong>
                                            <span class="p-badge mono ${unlocked ? 'p-badge-mint' : ''}" style="flex-shrink:0;">${esc(entry.tag)}</span>
                                          </div>
                                          ${
                                            bullets
                                              ? `<ul class="p-razor-bullets">${bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`
                                              : `<p class="p-kit-desc">${formatGenshinRichText(entry.desc)}</p>`
                                          }
                                        </article>`;
                                    })
                                    .join('')}
                                </div>
                              </div>`
                           : '';

                       return (
                         razorBanner +
                         renderGroup(
                           'talents',
                           'Active Talents',
                           (kitData.talents || []).map((t) => {
                             const k = String(t.kind || '').toLowerCase();
                             const razorBullets = razor
                               ? k.includes('burst')
                                 ? razor.burst
                                 : k.includes('skill')
                                   ? razor.skill
                                   : razor.na
                               : null;
                             return { tag: formatKitTag(t.kind), title: t.name, desc: t.description, razorBullets };
                           })
                         ) +
                         renderGroup(
                           'passives',
                           'Ascension Passives',
                           (kitData.passives || []).map((p, i) => ({
                             tag: formatPassiveTag(p, i),
                             title: p.name,
                             desc: p.description,
                             razorBullets: razor?.passives?.[i]?.bullets || null
                           }))
                         ) +
                         renderGroup(
                           'constellations',
                           `Constellations (${conLevel}/6)`,
                           (kitData.constellations || []).map((c, i) => ({
                             tag: `C${i + 1}`,
                             title: c.name,
                             desc: c.description,
                             razorBullets: razor?.constellations?.[i]?.bullets || null
                           })),
                           true
                         )
                       );
                     })()
                   : '<div class="p-panel muted">Loading character kit from catalog...</div>'
               }
               </div>
             </section>`
          : `<section class="p-panel p-tactical-deck">
               <div class="p-deck-controls">
                 <div class="p-control-group">
                   <span class="p-control-label">Build Mode</span>
                   ${
                     buildLenses.length > 1
                       ? `<div class="p-lens-pills" role="group" aria-label="Build Mode">
                            ${buildLenses
                              .map((l) => {
                                const isActive = l.modeId ? sandboxCtx?.activeModeId === l.modeId : activeLens.lens === l.id;
                                return `<button type="button" class="p-pill-btn ${isActive ? 'active' : ''}" data-p-lens="${esc(l.id)}" data-p-modeid="${esc(l.modeId || '')}" title="${esc(l.condition || l.label)}">${esc(l.label)}</button>`;
                              })
                              .join('')}
                          </div>`
                       : `<span class="p-badge p-badge-gold mono">${esc(buildLenses[0]?.label || roleLabel)}</span>`
                   }
                 </div>
                 <div class="p-control-cluster">
                   ${
                     !/support|healer|shield|buffer|enabler|off-field|sub-dps/i.test(activeLens.lens) &&
                     char.key !== 'Furina' &&
                     !sandboxCtx?.reactionCritDominant
                       ? `<div class="p-control-group">
                            <span class="p-control-label">Teammate Hook</span>
                            <button type="button" class="p-pill-btn ${withFurina ? 'active' : ''}" data-p-furina="toggle" title="Pair with Furina (Salon Solitaire HP drain unlocks 4pc Marechaussee Hunter +36% CRIT Rate on any on-field carry)">+ Furina (MH 4pc)</button>
                          </div>`
                       : ''
                   }
                   <div class="p-control-group">
                     <span class="p-control-label">Deployment</span>
                     <div class="p-lens-pills" role="group" aria-label="Deployment Mode">
                       ${Object.values(DEPLOYMENT_MODES)
                         .map(
                           (m) =>
                             `<button type="button" class="p-pill-btn ${state.deploymentMode === m.id ? 'active' : ''}" data-p-deploy="${m.id}" title="${esc(m.note)}">${esc(m.shortLabel)}</button>`
                         )
                         .join('')}
                     </div>
                   </div>
                 </div>
               </div>
               <div class="p-deck-telemetry">
                 <div class="p-deck-readout">
                   ${
                     sandboxCtx?.chosenMode?.condition
                       ? `<div class="p-readout-primary"><strong>${esc(sandboxCtx.chosenMode.label)}:</strong> ${esc(sandboxCtx.chosenMode.condition)}</div>`
                       : ''
                   }
                   <div class="p-readout-sub">
                     <span>${esc(modulatedCtx?.contextReadout?.modeLine || '')}</span>
                   </div>
                   ${
                     modulatedCtx?.tradeoffAlerts?.length
                       ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;">
                            ${modulatedCtx.tradeoffAlerts
                              .map((al) => `<span class="p-badge mono ${al.tone === 'ok' ? 'p-cond-ok' : 'p-cond-warn'}" style="font-size:11px;">${esc(al.text)}</span>`)
                              .join('')}
                          </div>`
                       : ''
                   }
                 </div>
                 <div class="p-deck-signals">
                   ${capabilities.slice(0, 4).map((c) => `<span class="p-badge mono">${esc(c)}</span>`).join('')}
                   ${
                     sandboxCtx?.reactionCritDominant
                       ? `<span class="p-badge p-badge-gold mono" title="Lunar & Stellar reactions can CRIT and ignore standard Elemental DMG% Goblet & Furina Fanfare DMG%">Reaction CRIT · ATK/Scaler Goblet &gt; DMG%</span>`
                       : ''
                   }
                   ${(sandboxCtx?.conditionStatuses || [])
                     .map(
                       (cs) =>
                         `<span class="p-badge mono ${cs.active ? 'p-cond-ok' : 'p-cond-warn'}" title="${esc(cs.note)}">${esc(cs.label)}</span>`
                     )
                     .join('')}
                   ${
                     staticProfile?.nearestPeers?.length
                       ? `<span class="p-row-sub mono" style="font-size:11.5px;">Peers: ${staticProfile.nearestPeers.map((p) => `${esc(p.name)} (${Math.round(p.similarity * 100)}%)`).join(' · ')}</span>`
                       : ''
                   }
                 </div>
               </div>
             </section>
             ${
               sortedArts.length
                 ? `<section class="p-panel">
                      <div class="p-panel-head" style="flex-wrap:wrap;gap:8px 14px;">
                        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                          <h2 class="p-panel-title">Equipped Artifact Rolls</h2>
                          ${
                            combat?.wrvPct
                              ? `<span class="p-badge p-badge-mint mono ${wrvChanged ? 'is-changed' : ''}" title="Weighted Roll Value: artifact substat efficiency against this character's scaling stats (100% = top-tier rolls)">Artifact ${Math.round(combat.wrvPct)}% wRV</span>`
                              : ''
                          }
                          <span class="p-row-sub" style="font-size:12px;" title="Substat colors reflect ${esc(char.meta.name)}'s ${esc(roleLabel)} scaling: Gold = Primary, Mint = Secondary, Muted = Off-kit">
                            Scaled to ${esc(roleLabel)}
                          </span>
                        </div>
                        <div style="display:flex;gap:6px;flex-wrap:wrap;">
                          ${
                            activeSets.length
                              ? activeSets
                                  .map((s) => `<span class="p-badge p-badge-mint">${esc(splitPascalSet(s.setKey))} · ${esc(s.bonus)} (${s.count}/5)</span>`)
                                  .join('')
                              : '<span class="p-badge">Rainbow (No 2pc Set)</span>'
                          }
                        </div>
                      </div>
                      <div class="p-list">
                        ${sortedArts
                          .map((a) => {
                            const subs = (a.substats || [])
                              .map((s) => {
                                const rel = classifySubstatRelevance(s, substatWeights);
                                const tierChanged = Boolean(prevSnap && prevSnap.subTiers?.[s.key] && prevSnap.subTiers[s.key] !== rel.tier);
                                return `<span data-stat-relevance="${rel.tier}"${rel.isStandout ? ' data-stat-standout="true"' : ''}${tierChanged ? ' class="is-changed"' : ''}>${esc(formatStatKey(s.key))} +${s.value}</span>`;
                              })
                              .join(' <span class="muted">·</span> ');
                            return `
                              <div class="p-row">
                                <div>
                                  <div class="p-row-title">${esc(splitPascalSet(a.setKey))} · ${esc(formatStatKey(a.mainStatKey))}</div>
                                  <div class="p-row-sub mono">${subs || '<span class="muted">No substats</span>'}</div>
                                </div>
                                <span class="p-badge mono text-gold">+${a.level ?? 20}</span>
                              </div>`;
                          })
                          .join('')}
                      </div>
                    </section>`
                 : ''
             }

             <section class="p-panel">
               <div class="p-panel-head" style="flex-wrap:wrap;gap:8px;">
                 <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                   <h2 class="p-panel-title">Recommended Artifact Sets</h2>
                   <span class="p-badge p-badge-mint mono" title="Derived from character talents and A1/A4 passives">Scales off: ${esc(scalingStatsList.join(' · '))}</span>
                 </div>
                 <span class="p-badge mono">${esc(roleLabel)}</span>
               </div>
               <div class="p-rec-set-grid">
                 ${recSets
                   .map((rec, rIdx) => {
                     const lookupName = extractArtifactSetLookupName(rec.set);
                     const setIcon = getArtifactIcon(lookupName, 'flower');
                     const setChanged = Boolean(prevSnap && prevSnap.sets?.[rIdx] !== rec.set);
                     return `
                     <button type="button" class="p-rec-set-card ${setChanged ? 'is-changed' : ''}" data-p-artset="${esc(rec.set)}">
                       ${setIcon ? `<img src="${esc(setIcon)}" alt="" class="p-rec-set-icon" loading="lazy" />` : ''}
                       <div style="min-width:0;flex:1;">
                         <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;">
                           <div class="p-row-title">${esc(rec.set)}</div>
                           ${rec.lensTag ? `<span class="p-badge mono p-rec-lens-tag">${esc(rec.lensTag)}</span>` : ''}
                         </div>
                         <div class="p-row-sub">${esc(rec.note)}</div>
                         ${rec.nonStackingNote ? `<div class="text-gold" style="font-size:11px;margin-top:4px;">${esc(rec.nonStackingNote)}</div>` : ''}
                       </div>
                     </button>`;
                   })
                   .join('')}
               </div>
               <div class="p-callout-note">
                 <strong>Work with what you have:</strong> Set bonuses help, but an <strong>effective main stat on an off-piece always beats a dead main stat on an on-piece</strong> (e.g., ${esc(formatMainStatExample(char, combat?.kitAnalysis, kitScaling, substatWeights, sandboxCtx))}).
               </div>
             </section>

             <section class="p-panel">
               <div class="p-panel-head">
                 <h2 class="p-panel-title">Build Targets</h2>
               </div>
               <form id="p-target-form" style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;">
                 <label class="proto-field" style="min-width:140px;">
                   <span>Status</span>
                   <select name="status" class="proto-select" ${disabled}>
                     ${['Active Prefarm', 'Built', 'Backlog', 'Archived']
                       .map((s) => `<option value="${s}" ${char.status === s ? 'selected' : ''}>${s}</option>`)
                       .join('')}
                   </select>
                 </label>
                 <label class="proto-field" style="width:90px;">
                   <span>Target Lv</span>
                   <input type="number" name="targetLevel" min="1" max="100" value="${char.targetLevel || 90}" class="p-input mono" ${disabled} />
                 </label>
                 <label class="proto-field" style="width:68px;">
                   <span>Target A</span>
                   <input type="number" name="targetA" min="1" max="10" value="${targetTalDefaults[0]}" class="p-input mono" ${disabled} />
                 </label>
                 <label class="proto-field" style="width:68px;">
                   <span>Target E</span>
                   <input type="number" name="targetE" min="1" max="10" value="${targetTalDefaults[1]}" class="p-input mono" ${disabled} />
                 </label>
                 <label class="proto-field" style="width:68px;">
                   <span>Target Q</span>
                   <input type="number" name="targetQ" min="1" max="10" value="${targetTalDefaults[2]}" class="p-input mono" ${disabled} />
                 </label>
                 <label class="proto-field" style="width:88px;">
                   <span>Priority #</span>
                   <input type="number" name="priorityRank" min="1" max="99" value="${char.priorityRank || ''}" class="p-input mono" ${disabled} />
                 </label>
                 ${!readOnly ? '<button type="submit" id="p-save-target-btn" class="p-btn p-btn-primary">Save Target</button>' : ''}
               </form>
             </section>`
      }
  `;

    if (state.dossierTab === 'kit' && !kitData) {
      ensureCharacterKitAndStats(char.key).then((loaded) => {
        if (loaded && state.inspectedCharKey === char.key && state.dossierTab === 'kit') {
          renderRosterView(container, account);
        }
      });
    }

    container.querySelectorAll('[data-p-dtab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.dossierTab = btn.dataset.pDtab;
        renderRosterView(container, account);
      });
    });

    const kitTabs = [...container.querySelectorAll('[data-kit-tab]')];
    kitTabs.forEach((btn, idx) => {
      btn.addEventListener('click', () => {
        state.kitSectionFilter = btn.dataset.kitTab;
        renderRosterView(container, account);
      });
      btn.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const nextIdx = e.key === 'ArrowRight' ? (idx + 1) % kitTabs.length : (idx - 1 + kitTabs.length) % kitTabs.length;
        state.kitSectionFilter = kitTabs[nextIdx].dataset.kitTab;
        renderRosterView(container, account);
        container.querySelector(`[data-kit-tab="${state.kitSectionFilter}"]`)?.focus();
      });
    });

    container.querySelectorAll('[data-kit-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.kitTextMode = btn.dataset.kitMode;
        renderRosterView(container, account);
      });
    });

    container.querySelectorAll('[data-p-lens]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.buildLensByChar[char.key] = btn.dataset.pLens;
        if (btn.dataset.pModeid) state.activeModeByChar[char.key] = btn.dataset.pModeid;
        else delete state.activeModeByChar[char.key];
        renderRosterView(container, account);
      });
    });

    container.querySelectorAll('[data-p-deploy]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.deploymentMode = btn.dataset.pDeploy;
        renderRosterView(container, account);
      });
    });

    container.querySelectorAll('[data-p-furina]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.withFurinaByChar[char.key] = !withFurina;
        renderRosterView(container, account);
      });
    });

    container.querySelectorAll('[data-p-scen]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.scenarioMode = btn.dataset.pScen;
        renderRosterView(container, account);
      });
    });

    container.querySelectorAll('[data-p-artset]').forEach((btn) => {
      btn.addEventListener('click', () => openArtifactSetInspector(btn.dataset.pArtset, btn));
    });

    container.querySelectorAll('[data-p-open-weapon-rank]').forEach((btn) => {
      btn.addEventListener('click', () =>
        openCharacterWeaponRankingModal({ char, staticProfile, sandboxCtx, kitData, account, recSets }, btn)
      );
    });

    document.getElementById('p-back-roster')?.addEventListener('click', () => {
      withViewTransition(() => {
        state.inspectedCharKey = null;
        renderRosterView(container, account);
      });
    });
    document.getElementById('p-target-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (readOnly) return;
      const saveBtn = document.getElementById('p-save-target-btn');
      const fd = new FormData(e.target);
      const updated = {
        ...char,
        owned: true,
        status: fd.get('status'),
        targetLevel: Number(fd.get('targetLevel') || 90),
        targetTalents: [
          Number(fd.get('targetA') || 9),
          Number(fd.get('targetE') || 9),
          Number(fd.get('targetQ') || 9)
        ],
        priorityRank: fd.get('priorityRank') ? Number(fd.get('priorityRank')) : null
      };
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
      }
      try {
        if (!state.isPreviewDemo) {
          await upsertRosterRow(state.sessionUser, char.key, updated);
        }
        const idx = (account.characters || []).findIndex((c) => c.key === char.key);
        if (idx >= 0) account.characters[idx] = updated;
        else account.characters = [...(account.characters || []), updated];
        showToast(`Saved ${char.meta.name}`);
      } catch (err) {
        showToast(`Save failed: ${err.message}`);
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Target';
        }
      }
    });
    return;
  }

  const elements = ['All', 'Pyro', 'Hydro', 'Electro', 'Cryo', 'Anemo', 'Geo', 'Dendro'];
  const ownershipTabs = [
    { id: 'owned', label: 'Owned' },
    { id: 'all', label: 'All' },
    { id: 'unowned', label: 'Unowned' }
  ];

  container.innerHTML = `
    <div class="p-toolbar">
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;">
        <div class="p-filter-pills" role="group" aria-label="Ownership filter">
          ${ownershipTabs
            .map(
              (o) =>
                `<button type="button" class="p-pill-btn ${state.rosterOwnership === o.id ? 'active' : ''}" data-p-own="${o.id}" aria-pressed="${state.rosterOwnership === o.id}">${o.label}</button>`
            )
            .join('')}
        </div>
        <div class="p-filter-pills" role="group" aria-label="Element filter">
          ${elements
            .map(
              (el) =>
                `<button type="button" class="p-pill-btn ${state.rosterElement === el ? 'active' : ''}" data-p-el="${el}" aria-pressed="${state.rosterElement === el}">${el}</button>`
            )
            .join('')}
        </div>
      </div>
      <input type="search" id="p-roster-search" class="proto-search" style="max-width:240px;" placeholder="Filter characters..." aria-label="Filter characters" value="${esc(state.rosterSearch)}" />
    </div>

    <div id="p-roster-grid" class="p-roster-grid"></div>
  `;

  const renderRosterCards = () => {
    const grid = document.getElementById('p-roster-grid');
    if (!grid) return;
    const filtered = chars
      .filter((c) => {
        if (state.rosterOwnership === 'owned') return c.owned;
        if (state.rosterOwnership === 'unowned') return !c.owned;
        return true;
      })
      .filter((c) => state.rosterElement === 'All' || c.meta.element === state.rosterElement)
      .filter((c) => matchesCharacterQuery(c.key, c.meta.name, state.rosterSearch))
      .sort((a, b) => Number(b.owned) - Number(a.owned) || (b.level || 0) - (a.level || 0) || a.meta.name.localeCompare(b.meta.name));

    grid.innerHTML = filtered.length
      ? filtered
          .map((c) => {
            const elAttr = String(c.meta.element || '').toLowerCase();
            const isTarget = c.status === 'Active Prefarm' || prefarmSet.has(c.key);
            return `
            <button type="button" class="p-char-tile ${c.owned ? '' : 'is-unowned'}" data-el="${esc(elAttr)}" data-rarity="${c.meta.rarity || 4}" data-p-char="${esc(c.key)}">
              ${isTarget ? '<span class="p-badge p-badge-mint" style="position:absolute;top:8px;right:8px;font-size:12px;padding:1px 7px;">Target</span>' : ''}
              ${renderAssetIcon('characters', c.key, c.meta.name, '')}
              <span class="p-char-name">${esc(c.meta.name)}</span>
              <span class="p-char-sub mono">${c.owned ? `Lv.${c.level || 1} · C${c.constellation || 0}` : 'Unowned'}</span>
            </button>`;
          })
          .join('')
      : '<div class="p-panel muted" style="grid-column:1/-1;">No characters match your current filter.</div>';

    grid.querySelectorAll('[data-p-char]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const avatar = btn.querySelector('.asset-wrap');
        const nameEl = btn.querySelector('.p-char-name');
        if (avatar) avatar.style.viewTransitionName = 'hero-portrait';
        if (nameEl) nameEl.style.viewTransitionName = 'hero-name';
        withViewTransition(() => {
          state.inspectedCharKey = btn.dataset.pChar;
          renderRosterView(container, account);
        });
      });
    });
    attachCardTilt(grid);
  };

  renderRosterCards();

  container.querySelectorAll('[data-p-own]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.rosterOwnership = btn.dataset.pOwn;
      container.querySelectorAll('[data-p-own]').forEach((b) => {
        const active = b.dataset.pOwn === state.rosterOwnership;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
      });
      renderRosterCards();
    });
  });
  container.querySelectorAll('[data-p-el]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.rosterElement = btn.dataset.pEl;
      container.querySelectorAll('[data-p-el]').forEach((b) => {
        const active = b.dataset.pEl === state.rosterElement;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
      });
      renderRosterCards();
    });
  });
  document.getElementById('p-roster-search')?.addEventListener('input', (e) => {
    state.rosterSearch = e.target.value;
    renderRosterCards();
  });
}

/* ---------- View 4: Armory (Filter Pills + Visual Cards + Inspector Modal) ---------- */
function formatWeaponSubstat(subKey, subVal) {
  if (!subKey) return '—';
  const label = formatStatKey(subKey);
  return subKey === 'eleMas' ? `${label} ${subVal}` : `${label} ${subVal}%`;
}

async function openCharacterWeaponRankingModal({ char, staticProfile, sandboxCtx, kitData, account, recSets = [] }, triggerEl = null) {
  const modal = document.getElementById('proto-weapon-modal');
  const titleEl = document.getElementById('proto-weapon-title');
  const bodyEl = document.getElementById('proto-weapon-body');
  if (!modal || !bodyEl) return;

  const weaponsIndex = getWeaponsIndex();
  const ownedWeapons = account?.weapons || [];
  const artSetCounts = {};
  for (const a of char.artifacts || []) {
    if (a?.setKey) artSetCounts[a.setKey] = (artSetCounts[a.setKey] || 0) + 1;
  }
  const eqFourPc = Object.entries(artSetCounts).find(([, cnt]) => cnt >= 4)?.[0] || '';
  const topRecSet = String(recSets?.[0]?.set || '').replace(/^\s*4pc\s+/i, '');
  const activeSetKey = eqFourPc || topRecSet;
  const FLAT_ATK_BUFFERS = new Set(['Bennett', 'KujouSara', 'Iansan', 'Nicole']);
  const hasFlatAtkBuffer =
    (account?.teams || []).some((t) => {
      const members = Array.isArray(t?.members) ? t.members : [];
      return members.includes(char.key) && members.some((m) => m !== char.key && FLAT_ATK_BUFFERS.has(m));
    }) ||
    (Array.isArray(state.synergyTeamSlots) && state.synergyAnchorKey === char.key && state.synergyTeamSlots.some((m) => FLAT_ATK_BUFFERS.has(m)));
  const ranked = rankWeaponsByVector(char.meta, staticProfile, sandboxCtx, weaponsIndex, ownedWeapons, kitData, {
    activeSetKey,
    hasFlatAtkBuffer,
    constellation: Number(char.constellation || 0)
  });
  const sigWeapon = ranked.find((w) => w.isSignature) || null;
  const equippedKey = char.equippedWeapon?.key || '';
  const activeModeLabel = sandboxCtx?.chosenMode?.label || sandboxCtx?.activeLens || 'Default Role';

  let ownershipFilter = 'all'; // 'all' | 'owned'
  let rarityFilter = 'all'; // 'all' | '5' | '4'

  if (titleEl) titleEl.textContent = `${char.meta.name} · Weapon Rankings`;
  modal.querySelector('.p-modal')?.classList.remove('is-compact');
  modal._openModal ? modal._openModal(triggerEl) : (modal.hidden = false);

  const renderRankingList = () => {
    const filtered = ranked.filter((w) => {
      if (ownershipFilter === 'owned' && !w.owned) return false;
      if (rarityFilter === '5' && w.rarity !== 5) return false;
      if (rarityFilter === '4' && w.rarity !== 4) return false;
      return true;
    });
    const ownedCount = ranked.filter((w) => w.owned).length;

    bodyEl.innerHTML = `
      <div class="p-weprank-head">
        <div class="p-weprank-ctx">
          <span class="p-badge p-badge-gold mono">${esc(char.meta.weaponType)}</span>
          <span class="p-row-sub">Ranked for <strong>${esc(activeModeLabel)}</strong> (${esc(sandboxCtx?.deploymentMode?.shortLabel || 'Abyss')})</span>
        </div>
        <div class="p-weprank-filters">
          <div class="p-lens-pills" role="group" aria-label="Ownership Filter">
            <button type="button" class="p-pill-btn ${ownershipFilter === 'all' ? 'active' : ''}" data-wr-own="all">All (${ranked.length})</button>
            <button type="button" class="p-pill-btn ${ownershipFilter === 'owned' ? 'active' : ''}" data-wr-own="owned">Owned (${ownedCount})</button>
          </div>
          <div class="p-lens-pills" role="group" aria-label="Rarity Filter">
            <button type="button" class="p-pill-btn ${rarityFilter === 'all' ? 'active' : ''}" data-wr-rar="all">All ★</button>
            <button type="button" class="p-pill-btn ${rarityFilter === '5' ? 'active' : ''}" data-wr-rar="5">5★</button>
            <button type="button" class="p-pill-btn ${rarityFilter === '4' ? 'active' : ''}" data-wr-rar="4">4★</button>
          </div>
        </div>
      </div>

      ${
        sigWeapon
          ? `<button type="button" class="p-weprank-sig" data-wr-inspect="${esc(sigWeapon.key)}">
               <div class="p-weprank-sig-left">
                 ${renderAssetIcon('weapons', sigWeapon.key, sigWeapon.name, 'icon-md')}
                 <div>
                   <div class="p-weprank-sig-title">
                     <span class="p-badge p-badge-gold mono">Signature</span>
                     <strong>${esc(sigWeapon.name)}</strong>
                     ${sigWeapon.key === equippedKey ? '<span class="p-badge mono text-mint">Equipped</span>' : ''}
                     ${sigWeapon.overcapWarning ? `<span class="p-badge p-badge-amber mono" title="${esc(sigWeapon.overcapWarning)}">CR Overcap</span>` : ''}
                   </div>
                   <div class="p-row-sub mono">${sigWeapon.baseAtk} ATK · ${esc(sigWeapon.substat || 'None')} ${esc(sigWeapon.substatValue || '')}${sigWeapon.reasons.length ? ` · ${esc(sigWeapon.reasons.join(' · '))}` : ''}</div>
                   ${sigWeapon.signatureNote ? `<div class="p-row-sub text-gold" style="margin-top:3px;font-size:11.5px;">${esc(sigWeapon.signatureNote)}</div>` : ''}
                   ${sigWeapon.overcapWarning ? `<div class="p-row-sub text-gold" style="margin-top:3px;font-size:11.5px;">${esc(sigWeapon.overcapWarning)}</div>` : ''}
                 </div>
               </div>
               <span class="p-twopc-owned mono ${sigWeapon.owned ? 'has-pair' : ''}">${
                 sigWeapon.owned
                   ? `Lv.${sigWeapon.ownedCopies[0].level || 1} R${sigWeapon.ownedCopies[0].refinement || 1}`
                   : 'Unowned'
               }</span>
             </button>`
          : ''
      }

      <div class="p-weprank-list">
        ${
          filtered.length
            ? filtered
                .map((w, idx) => {
                  const isEquipped = w.key === equippedKey;
                  const topCopy = w.ownedCopies?.[0] || null;
                  const holder = topCopy?.location && topCopy.location !== char.key ? getCharacterMeta(topCopy.location).name : '';
                  const ownLabel = isEquipped
                    ? `Equipped · R${topCopy?.refinement || char.equippedWeapon?.refinement || 1}`
                    : topCopy
                      ? `Lv.${topCopy.level || 1} R${topCopy.refinement || 1}${holder ? ` (${holder})` : ''}`
                      : 'Unowned';
                  return `
                    <button type="button" class="p-weprank-row ${w.isSignature ? 'is-sig' : ''} ${!w.owned ? 'is-unowned' : ''}" data-wr-inspect="${esc(w.key)}">
                      <div class="p-weprank-row-left">
                        <span class="p-weprank-num mono">#${idx + 1}</span>
                        ${renderAssetIcon('weapons', w.key, w.name, 'icon-sm')}
                        <div class="p-weprank-info">
                          <div class="p-weprank-name">
                            <span>${esc(w.name)}</span>
                            <span class="mono text-gold" style="font-size:11.5px;">${w.rarity}★</span>
                            ${w.isSignature ? '<span class="p-badge p-badge-gold mono" style="font-size:10px;padding:1px 6px;">Signature</span>' : ''}
                            ${isEquipped ? '<span class="p-badge mono text-mint" style="font-size:10px;padding:1px 6px;">Equipped</span>' : ''}
                            ${w.overcapWarning ? `<span class="p-badge p-badge-amber mono" style="font-size:10px;padding:1px 6px;" title="${esc(w.overcapWarning)}">CR Overcap</span>` : ''}
                          </div>
                          <div class="p-row-sub mono" style="font-size:11.5px;">${w.baseAtk} ATK · ${esc(w.substat || '—')} ${esc(w.substatValue || '')}${w.reasons.length ? ` · ${esc(w.reasons.join(' · '))}` : ''}</div>
                        </div>
                      </div>
                      <span class="p-twopc-owned mono ${w.owned ? 'has-pair' : ''}">${esc(ownLabel)}</span>
                    </button>
                  `;
                })
                .join('')
            : '<div class="muted" style="padding:16px 4px;font-size:13px;">No weapons match the selected Owned / Rarity filter.</div>'
        }
      </div>
    `;

    bodyEl.querySelectorAll('[data-wr-own]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ownershipFilter = btn.dataset.wrOwn;
        renderRankingList();
      });
    });
    bodyEl.querySelectorAll('[data-wr-rar]').forEach((btn) => {
      btn.addEventListener('click', () => {
        rarityFilter = btn.dataset.wrRar;
        renderRankingList();
      });
    });
    bodyEl.querySelectorAll('[data-wr-inspect]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const wObj = ranked.find((x) => x.key === btn.dataset.wrInspect);
        if (!wObj) return;
        const topCopy = wObj.ownedCopies?.[0] || null;
        openWeaponInspector(
          topCopy
            ? { ...topCopy, owned: true }
            : { key: wObj.key, owned: false, level: 90, refinement: 1 },
          btn,
          () => openCharacterWeaponRankingModal({ char, staticProfile, sandboxCtx, kitData, account, recSets }, triggerEl)
        );
      });
    });
  };

  renderRankingList();
}

async function openWeaponInspector(w, triggerEl = null, onBack = null) {
  const modal = document.getElementById('proto-weapon-modal');
  const titleEl = document.getElementById('proto-weapon-title');
  const bodyEl = document.getElementById('proto-weapon-body');
  if (!modal || !bodyEl) return;

  const meta = getWeaponMeta(w.key);
  if (titleEl) titleEl.textContent = meta.name || w.key;
  modal.querySelector('.p-modal')?.classList.add('is-compact');
  const isOwned = w.owned !== false;
  const ownedRef = Math.max(1, Math.min(5, Number(w.refinement) || 1));
  let activeRef = ownedRef;

  const renderWeaponModalBody = (stats, loading = false) => {
    if (loading) {
      bodyEl.innerHTML = '<div class="muted">Loading weapon stats &amp; lore...</div>';
      return;
    }
    if (!stats) {
      bodyEl.innerHTML = '<div class="muted">Weapon stats unavailable offline.</div>';
      return;
    }
    const lv80 = stats.lv80;
    const lv90 = stats.lv90;
    const ownedLv = Number(w.level || 0);
    const showUpgradeSplit = isOwned && ownedLv > 0 && ownedLv < 90;
    const upgrades = stats.passiveUpgrades || [];
    const passiveText = upgrades[activeRef - 1] || stats.passiveDesc || '';
    const hasReactionBuff = /(?:Vaporize|Melt|Overloaded|Burgeon|Burning|Electro-Charged|Superconduct|Aggravate|Quicken|Hyperbloom|Bloom|Spread|Swirl|Crystallize|Frozen|Shatter|Lunar-|Stellar|Hexerei|Witch's\s*Homework|Moonsign|Nightsoul|Elemental\s+Reaction)/i.test(
      passiveText
    );
    const lv90Line = lv90?.atk ? `${lv90.atk} ATK · ${formatWeaponSubstat(lv90.subKey, lv90.subVal)}` : '—';
    const lv80Line = lv80?.atk ? `${lv80.atk} ATK · ${formatWeaponSubstat(lv80.subKey, lv80.subVal)}` : '—';

    bodyEl.innerHTML = `
      ${
        onBack
          ? `<div>
               <button type="button" class="p-btn p-btn-ghost p-btn-sm" id="p-wep-back-rank">← Back to Weapon Rankings</button>
             </div>`
          : ''
      }
      <div class="p-wep-hero">
        <div class="p-row-left">
          ${renderAssetIcon('weapons', w.key, meta.name, 'icon-md')}
          <div>
            <div class="p-row-title">${esc(meta.weaponType)} · <span class="mono text-gold">${meta.rarity || 4}★</span> · ${
              isOwned
                ? `<span class="mono">Lv.${ownedLv || 1} R${ownedRef}</span>`
                : '<span class="muted">Catalog Preview</span>'
            }</div>
            <div class="p-row-sub">${
              isOwned
                ? w.location
                  ? `Held by ${esc(getCharacterMeta(w.location).name)}`
                  : 'Unassigned in Armory'
                : 'Unowned · Lv.90 Max Projection'
            }</div>
          </div>
        </div>
        <div class="p-wep-hero-stat">
          <span class="p-control-label">Lv.90 Max</span>
          <strong class="mono text-gold">${esc(lv90Line)}</strong>
        </div>
      </div>

      ${
        showUpgradeSplit
          ? `<div class="p-wep-scale-grid">
               <div class="p-wep-scale-box">
                 <span class="p-row-sub">Lv.80 Milestone</span>
                 <strong class="mono">${esc(lv80Line)}</strong>
               </div>
               <div class="p-wep-scale-box is-max">
                 <span class="p-row-sub">Lv.90 Max</span>
                 <strong class="mono text-gold">${esc(lv90Line)}</strong>
               </div>
             </div>`
          : ''
      }

      ${
        stats.passiveName || passiveText
          ? `<section class="p-wep-passive">
               <div class="p-wep-passive-head">
                 <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                   <strong class="text-gold" style="font-size:14.5px;">${esc(stats.passiveName || 'Weapon Passive')}</strong>
                   ${hasReactionBuff ? '<span class="p-badge mono p-badge-rxn">Reaction Buff</span>' : ''}
                 </div>
                 ${
                   upgrades.length > 1
                     ? `<div class="p-filter-pills" role="group" aria-label="Refinement Rank">
                          ${upgrades
                            .map((_, idx) => {
                              const r = idx + 1;
                              const isActive = activeRef === r;
                              const showActiveTag = isOwned && ownedRef === r;
                              return `<button type="button" class="p-pill-btn mono ${isActive ? 'active' : ''}" data-p-wref="${r}" aria-pressed="${isActive}">R${r}${showActiveTag ? ' · Active' : ''}</button>`;
                            })
                            .join('')}
                        </div>`
                     : ''
                 }
               </div>
               <p class="p-kit-desc">${formatGenshinRichText(passiveText)}</p>
             </section>`
          : ''
      }

      ${stats.description ? `<div class="p-wep-lore"><p>${formatGenshinRichText(stats.description)}</p></div>` : ''}
    `;

    bodyEl.querySelectorAll('[data-p-wref]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeRef = Number(btn.dataset.pWref) || 1;
        renderWeaponModalBody(stats, false);
      });
    });
    if (onBack) {
      document.getElementById('p-wep-back-rank')?.addEventListener('click', () => onBack());
    }
  };

  let stats = getWeaponStats(w.key);
  if (!stats) {
    renderWeaponModalBody(null, true);
    modal._openModal ? modal._openModal(triggerEl) : (modal.hidden = false);
    await ensureWeaponStats(w.key);
    stats = getWeaponStats(w.key);
  }

  renderWeaponModalBody(stats, false);
  if (modal.hidden) {
    modal._openModal ? modal._openModal(triggerEl) : (modal.hidden = false);
  }
}

function renderArmoryView(container, account) {
  const ownedWeapons = (account.weapons || []).map((w) => ({ ...w, owned: true }));
  const ownedKeys = new Set(ownedWeapons.map((w) => w.key));
  const unownedWeapons = getAllWeaponKeys()
    .filter((k) => !ownedKeys.has(k))
    .map((k) => ({ key: k, owned: false, level: 0, refinement: 1, location: '' }));
  const allWeapons = [...ownedWeapons, ...unownedWeapons];
  const ownershipTabs = [
    { id: 'owned', label: 'Owned' },
    { id: 'all', label: 'All' },
    { id: 'unowned', label: 'Unowned' }
  ];
  const filters = ['All', '5★', '4★', 'Sword', 'Claymore', 'Polearm', 'Bow', 'Catalyst'];

  container.innerHTML = `
    <div class="p-toolbar">
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;">
        <div class="p-filter-pills" role="group" aria-label="Weapon ownership filter">
          ${ownershipTabs
            .map(
              (o) =>
                `<button type="button" class="p-pill-btn ${state.armoryOwnership === o.id ? 'active' : ''}" data-p-aown="${o.id}" aria-pressed="${state.armoryOwnership === o.id}">${o.label}</button>`
            )
            .join('')}
        </div>
        <div class="p-filter-pills" role="group" aria-label="Weapon filter">
          ${filters
            .map(
              (f) =>
                `<button type="button" class="p-pill-btn ${state.armoryFilter === f ? 'active' : ''}" data-p-afilt="${f}" aria-pressed="${state.armoryFilter === f}">${f}</button>`
            )
            .join('')}
        </div>
      </div>
      <input type="search" id="p-armory-search" class="proto-search" style="max-width:240px;" placeholder="Filter weapons or holder..." aria-label="Filter weapons or holder" value="${esc(state.armorySearch)}" />
    </div>

    <div id="p-armory-grid" class="p-armory-grid"></div>
  `;

  const renderWeaponCards = () => {
    const grid = document.getElementById('p-armory-grid');
    if (!grid) return;
    const q = state.armorySearch.trim().toLowerCase();
    const filtered = allWeapons
      .filter((w) => {
        if (state.armoryOwnership === 'owned') return w.owned;
        if (state.armoryOwnership === 'unowned') return !w.owned;
        return true;
      })
      .filter((w) => {
        const meta = getWeaponMeta(w.key);
        if (state.armoryFilter === '5★' && Number(meta.rarity) !== 5) return false;
        if (state.armoryFilter === '4★' && Number(meta.rarity) !== 4) return false;
        if (['Sword', 'Claymore', 'Polearm', 'Bow', 'Catalyst'].includes(state.armoryFilter) && meta.weaponType !== state.armoryFilter) return false;
        if (q) {
          const holder = w.location ? getCharacterMeta(w.location).name.toLowerCase() : '';
          return meta.name.toLowerCase().includes(q) || holder.includes(q);
        }
        return true;
      })
      .sort((a, b) => Number(b.owned) - Number(a.owned) || (b.level || 0) - (a.level || 0) || (getWeaponMeta(b.key).rarity || 0) - (getWeaponMeta(a.key).rarity || 0) || getWeaponMeta(a.key).name.localeCompare(getWeaponMeta(b.key).name));

    grid.innerHTML = filtered.length
      ? filtered
          .map((w, idx) => {
            const meta = getWeaponMeta(w.key);
            const holderMeta = w.owned && w.location ? getCharacterMeta(w.location) : null;
            return `
              <article class="p-weapon-card ${w.owned ? '' : 'is-unowned'}" data-rarity="${meta.rarity || 4}" data-p-winspect="${idx}" tabindex="0" role="button" aria-label="Inspect ${esc(meta.name)}">
                <div class="p-weapon-head">
                  ${renderAssetIcon('weapons', w.key, meta.name, 'icon-md')}
                  <div style="min-width:0;">
                    <div class="p-row-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(meta.name)}</div>
                    <div class="p-row-sub">${esc(meta.weaponType)} · <span class="mono text-gold">${meta.rarity || 4}★</span></div>
                  </div>
                </div>
                <div class="p-weapon-foot">
                  <span class="mono muted" style="font-size:12px;">${w.owned ? `Lv.${w.level || 1} · R${w.refinement || 1}` : 'Unowned'}</span>
                  ${
                    holderMeta
                      ? `<button type="button" class="p-holder-chip" data-p-jump-char="${esc(w.location)}">
                           ${renderAssetIcon('characters', w.location, holderMeta.name, 'icon-xs')}
                           <span>${esc(holderMeta.name)}</span>
                         </button>`
                      : `<span class="muted" style="font-size:12px;">${w.owned ? 'Unassigned' : 'Archive'}</span>`
                  }
                </div>
              </article>`;
          })
          .join('')
      : '<div class="p-panel muted" style="grid-column:1/-1;">No weapons match your filter.</div>';

    grid.querySelectorAll('[data-p-winspect]').forEach((card) => {
      const open = () => openWeaponInspector(filtered[Number(card.dataset.pWinspect)], card);
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-p-jump-char]')) return;
        open();
      });
      card.addEventListener('keydown', (e) => {
        if (e.target.closest('[data-p-jump-char]')) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
    });
    grid.querySelectorAll('[data-p-jump-char]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.inspectedCharKey = btn.dataset.pJumpChar;
        setActiveTab('roster');
      });
    });
    attachCardTilt(grid);
  };

  renderWeaponCards();

  container.querySelectorAll('[data-p-aown]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.armoryOwnership = btn.dataset.pAown;
      container.querySelectorAll('[data-p-aown]').forEach((b) => {
        const active = b.dataset.pAown === state.armoryOwnership;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
      });
      renderWeaponCards();
    });
  });

  container.querySelectorAll('[data-p-afilt]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.armoryFilter = btn.dataset.pAfilt;
      container.querySelectorAll('[data-p-afilt]').forEach((b) => {
        const active = b.dataset.pAfilt === state.armoryFilter;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
      });
      renderWeaponCards();
    });
  });
  document.getElementById('p-armory-search')?.addEventListener('input', (e) => {
    state.armorySearch = e.target.value;
    renderWeaponCards();
  });
}

/* ---------- View 5: Teams Lab (Squad Formations + Resonance + Conflicts + Editor) ---------- */
const RESONANCE_NAMES = {
  Pyro: 'Fervent Flames',
  Hydro: 'Soothing Water',
  Electro: 'High Voltage',
  Cryo: 'Shattering Ice',
  Anemo: 'Impetuous Winds',
  Geo: 'Enduring Rock',
  Dendro: 'Sprawling Greenery'
};

function renderTeamsView(container, account) {
  const readOnly = isReadOnly();
  const teams = account.teams || [];
  const charMap = new Map((account.characters || []).map((c) => [c.key, c]));
  const conflicts = detectTeamWeaponConflicts(teams);
  const ownedChars = (account.characters || []).filter((c) => c.owned).sort((a, b) => getCharacterMeta(a.key).name.localeCompare(getCharacterMeta(b.key).name));
  const ownedKeysSet = new Set(ownedChars.map((c) => c.key));
  const allProfiles = getAllStaticKitProfiles();
  const profileKeys = Object.keys(allProfiles).sort((a, b) => (allProfiles[a]?.name || a).localeCompare(allProfiles[b]?.name || b));
  const enemiesAll = getEnemiesIndex();
  const notableEnemies = [
    ...enemiesAll.filter((e) => e.category === 'weekly_boss'),
    ...enemiesAll.filter((e) => e.category === 'boss').slice(0, 35)
  ];
  const selectedEnemy = notableEnemies.find((e) => String(e.id) === String(state.selectedEnemyId || '')) || null;
  const activeResMap = selectedEnemy?.res || { pyro: 0.1, hydro: 0.1, electro: 0.1, cryo: 0.1, anemo: 0.1, geo: 0.1, dendro: 0.1, physical: 0.1 };
  const RES_LABELS = [
    ['pyro', 'Pyro'],
    ['hydro', 'Hydro'],
    ['electro', 'Electro'],
    ['cryo', 'Cryo'],
    ['anemo', 'Anemo'],
    ['geo', 'Geo'],
    ['dendro', 'Dendro'],
    ['physical', 'Phys']
  ];

  if (!state.synergyAnchorKey || !allProfiles[state.synergyAnchorKey]) {
    state.synergyAnchorKey = ownedChars[0]?.key || (allProfiles.Skirk ? 'Skirk' : profileKeys[0] || '');
  }
  const anchorKey = state.synergyAnchorKey;
  const activeSlots = (state.synergyTeamSlots || []).filter((k) => k && k !== anchorKey);
  const gaugeTable = getGaugeTable();
  const squadTradeoffs = anchorKey
    ? analyzeTeamTradeoffs([anchorKey, ...activeSlots], allProfiles, getCharacterMeta, gaugeTable, account)
    : [];
  const synergy = anchorKey
    ? rankPartnersAndSubstitutes(anchorKey, {
        teamSoFar: activeSlots,
        ownedKeys: ownedKeysSet,
        deploymentMode: state.deploymentMode,
        scenarioMode: state.scenarioMode,
        allProfiles,
        charMetaFn: getCharacterMeta
      })
    : null;

  const saveTeams = async (nextTeams) => {
    account.teams = nextTeams;
    renderTeamsView(container, account);
    if (state.isPreviewDemo) return;
    try {
      await saveAccountSection(state.sessionUser, 'teams', account.teams);
    } catch (err) {
      showToast(`Teams save failed: ${err.message}`);
    }
  };

  container.innerHTML = `
    <section class="p-panel p-lens-bar" style="margin-bottom:16px;">
      <div class="p-mode-bar">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span class="p-row-sub mono" style="font-size:11.5px;">Deployment Mode:</span>
          ${Object.values(DEPLOYMENT_MODES)
            .map(
              (m) =>
                `<button type="button" class="p-pill-btn ${state.deploymentMode === m.id ? 'active' : ''}" data-p-tdeploy="${m.id}" title="${esc(m.note)}">${esc(m.shortLabel)}</button>`
            )
            .join('')}
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span class="p-row-sub mono" style="font-size:11.5px;">Scenario:</span>
          ${Object.values(SCENARIO_MODES)
            .map(
              (sc) =>
                `<button type="button" class="p-pill-btn ${state.scenarioMode === sc.id ? 'active' : ''}" data-p-tscen="${sc.id}">${esc(sc.label)}</button>`
            )
            .join('')}
        </div>
        <label class="proto-field" style="min-width:210px;margin-left:auto;">
          <span>Enemy Target (RES Baseline)</span>
          <select id="p-enemy-target" class="proto-select">
            <option value="">Standard Target (10% All RES)</option>
            ${notableEnemies
              .map(
                (e) =>
                  `<option value="${esc(String(e.id))}" ${String(state.selectedEnemyId) === String(e.id) ? 'selected' : ''}>${esc(e.name)}${e.category === 'weekly_boss' ? ' [Weekly]' : ''}</option>`
              )
              .join('')}
          </select>
        </label>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px;">
        <span class="p-row-sub mono" style="font-size:11px;">${selectedEnemy ? `${esc(selectedEnemy.name)} RES:` : 'Target RES:'}</span>
        ${RES_LABELS.map(([rk, lbl]) => {
          const pctVal = Math.round((Number(activeResMap[rk] ?? 0.1) || 0) * 100);
          return `<span class="p-badge mono ${pctVal >= 50 ? 'p-badge-amber' : ''}" style="font-size:10.5px;">${lbl} ${pctVal}%</span>`;
        }).join('')}
      </div>
      ${synergy?.modeNote ? `<div class="p-row-sub" style="font-size:12px;">${esc(synergy.modeNote)}</div>` : ''}
    </section>

    ${
      profileKeys.length
        ? `<section class="p-panel" style="margin-bottom:16px;">
             <div class="p-panel-head" style="flex-wrap:wrap;gap:8px;">
               <div>
                 <h2 class="p-panel-title">Pairwise Synergy &amp; Owned Substitutes Sandbox</h2>
                 <div class="p-row-sub">Baseline ideal partners vs. what your owned roster can cover (and what breaks if you go off-script).</div>
               </div>
             </div>
             <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin-bottom:12px;">
               <label class="proto-field" style="min-width:170px;">
                 <span>Anchor Character</span>
                 <select id="p-syn-anchor" class="proto-select">
                   ${profileKeys
                     .map(
                       (k) =>
                         `<option value="${esc(k)}" ${k === anchorKey ? 'selected' : ''}>${esc(allProfiles[k]?.name || k)}${ownedKeysSet.has(k) ? ' ★' : ''}</option>`
                     )
                     .join('')}
                 </select>
               </label>
               ${[0, 1, 2]
                 .map(
                   (idx) => `
                   <label class="proto-field" style="min-width:140px;">
                     <span>Teammate ${idx + 1}</span>
                     <select class="proto-select" data-p-syn-slot="${idx}">
                       <option value="">— Open Slot —</option>
                       ${profileKeys
                         .filter((k) => k !== anchorKey)
                         .map(
                           (k) =>
                             `<option value="${esc(k)}" ${state.synergyTeamSlots[idx] === k ? 'selected' : ''}>${esc(allProfiles[k]?.name || k)}${ownedKeysSet.has(k) ? ' ★' : ''}</option>`
                         )
                         .join('')}
                     </select>
                   </label>`
                 )
                 .join('')}
             </div>
             ${
               synergy?.anchorConditionStatuses?.length
                 ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">
                      ${synergy.anchorConditionStatuses
                        .map((cs) => `<span class="p-badge mono ${cs.active ? 'p-cond-ok' : 'p-cond-warn'}" title="${esc(cs.note)}">${esc(cs.label)}${cs.active ? '' : ' · Inactive'}</span>`)
                        .join('')}
                    </div>`
                 : ''
             }
             ${
               squadTradeoffs.length
                 ? `<div class="p-panel" style="padding:10px 14px;margin-bottom:12px;">
                      <div class="p-row-title text-gold" style="font-size:12.5px;margin-bottom:6px;">Squad Tradeoffs &amp; Aura Stability</div>
                      <div style="display:flex;flex-direction:column;gap:5px;">
                        ${squadTradeoffs
                          .map(
                            (tf) =>
                              `<div style="font-size:12px;line-height:1.45;">
                                 <span class="p-badge mono ${tf.tone === 'ok' ? 'p-cond-ok' : 'p-cond-warn'}" style="margin-right:6px;">${esc(tf.title)}</span>
                                 <span class="p-row-sub">${esc(tf.detail)}</span>
                               </div>`
                          )
                          .join('')}
                      </div>
                    </div>`
                 : ''
             }
             <div class="p-synergy-grid">
               <div class="p-panel" style="padding:12px 14px;">
                 <div class="p-row-title text-gold" style="margin-bottom:8px;">Ideal Baseline Partners</div>
                 <div class="p-list" style="gap:8px;">
                   ${(synergy?.idealPartners || [])
                     .map(
                       (p) => `
                       <div class="p-sub-card">
                         <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                           <div class="p-row-left">
                             ${renderAssetIcon('characters', p.key, p.name, 'icon-xs')}
                             <strong style="font-size:13px;">${esc(p.name)}</strong>
                           </div>
                           <span class="p-badge mono ${p.owned ? 'p-badge-mint' : ''}">${p.owned ? 'Owned' : 'Unowned'}</span>
                         </div>
                         <div class="p-row-sub" style="font-size:11.5px;margin-top:4px;">${esc(p.reasons.join(' · ') || p.element)}</div>
                         ${p.tradeoffWarning ? `<div class="text-coral" style="font-size:11px;margin-top:3px;">⚠ ${esc(p.tradeoffWarning)}</div>` : ''}
                       </div>`
                     )
                     .join('')}
                 </div>
               </div>
               <div class="p-panel" style="padding:12px 14px;">
                 <div class="p-row-title text-mint" style="margin-bottom:8px;">
                   Work With What You Got ${synergy?.missingTargetPartner ? `(Owned Substitutes for ${esc(synergy.missingTargetPartner.name)})` : '(Owned Roster Fit)'}
                 </div>
                 <div class="p-list" style="gap:8px;">
                   ${
                     synergy?.ownedSubstitutes?.length
                       ? synergy.ownedSubstitutes
                           .map(
                             (sub) => `
                             <div class="p-sub-card">
                               <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                                 <div class="p-row-left">
                                   ${renderAssetIcon('characters', sub.key, sub.name, 'icon-xs')}
                                   <strong style="font-size:13px;">${esc(sub.name)}</strong>
                                 </div>
                                 <span class="p-badge mono">${esc(sub.element)}</span>
                               </div>
                               <div class="p-row-sub" style="font-size:11.5px;margin-top:4px;">Covers: <strong>${esc(sub.covers.join(' · '))}</strong></div>
                               ${sub.missing.length ? `<div class="muted" style="font-size:11px;margin-top:2px;">Missing: ${esc(sub.missing.join(' · '))}</div>` : ''}
                               ${sub.tradeoffWarning ? `<div class="text-coral" style="font-size:11px;margin-top:2px;">⚠ Tradeoff: ${esc(sub.tradeoffWarning)}</div>` : ''}
                             </div>`
                           )
                           .join('')
                       : '<div class="muted" style="font-size:12.5px;">Add characters in your owned roster to evaluate substitutes.</div>'
                   }
                 </div>
               </div>
             </div>
           </section>`
        : ''
    }

    ${
      conflicts.length
        ? `<section class="p-panel" style="border-color:rgba(248,113,113,0.45);">
             <div class="p-panel-head"><h2 class="p-panel-title text-coral">Weapon Sharing Conflicts (${conflicts.length})</h2></div>
             <div class="p-list">
               ${conflicts.map((c) => `<div class="p-row"><span>${esc(c.weaponName || c.weaponKey)}</span><span class="muted">${esc((c.teams || []).join(' · '))}</span></div>`).join('')}
             </div>
           </section>`
        : ''
    }

    ${
      !readOnly && ownedChars.length >= 4
        ? `<section class="p-panel">
             <div class="p-panel-head"><h2 class="p-panel-title">Create Squad</h2></div>
             <form id="p-team-add-form" style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;">
               <label class="proto-field" style="min-width:170px;flex:1;">
                 <span>Squad Name</span>
                 <input type="text" name="name" placeholder="e.g. Furina Hypercarry" required class="p-input" />
               </label>
               <label class="proto-field" style="min-width:130px;">
                 <span>Archetype</span>
                 <input type="text" name="archetype" placeholder="Hypercarry" value="Hypercarry" class="p-input" />
               </label>
               ${[1, 2, 3, 4]
                 .map(
                   (slot, idx) => `
                   <label class="proto-field" style="min-width:130px;">
                     <span>Slot ${slot}</span>
                     <select name="slot${slot}" class="proto-select">
                       ${ownedChars.map((c, ci) => `<option value="${esc(c.key)}" ${ci === idx ? 'selected' : ''}>${esc(getCharacterMeta(c.key).name)}</option>`).join('')}
                     </select>
                   </label>`
                 )
                 .join('')}
               <button type="submit" class="p-btn p-btn-primary">+ Add Squad</button>
             </form>
           </section>`
        : ''
    }

    <div class="p-list" style="gap:16px;">
      ${
        teams.length
          ? teams
              .map((t) => {
                const counts = {};
                (t.members || []).forEach((m) => {
                  const el = getCharacterMeta(m.characterKey).element;
                  if (el) counts[el] = (counts[el] || 0) + 1;
                });
                const resonances = Object.entries(counts)
                  .filter(([, n]) => n >= 2)
                  .map(([el]) => RESONANCE_NAMES[el] || `${el} Resonance`);
                const squadKeys = (t.members || []).map((m) => m.characterKey).filter(Boolean);
                const teamCondNotes = [];
                squadKeys.forEach((mk) => {
                  const prof = allProfiles[mk];
                  if (!prof) return;
                  evaluateTeamConditions(mk, prof, squadKeys.filter((x) => x !== mk), 0, allProfiles, getCharacterMeta).forEach((cs) => {
                    if (!cs.active && (cs.kind === 'elementLock' || cs.kind === 'elementCount')) {
                      teamCondNotes.push({ ok: false, text: `${prof.name}: ${cs.label} inactive (${cs.note})` });
                    } else if (cs.active && cs.kind === 'faction') {
                      teamCondNotes.push({ ok: true, text: cs.label });
                    }
                  });
                });
                const hasFurina = squadKeys.includes('Furina');
                if (hasFurina) {
                  squadKeys.forEach((mk) => {
                    const ch = allProfiles[mk]?.channelShares || {};
                    if ((ch.lunar_crit || 0) + (ch.stellar_crit || 0) >= 0.4) {
                      teamCondNotes.push({ ok: false, text: `${allProfiles[mk]?.name || mk}: Furina DMG% Fanfare does not buff Lunar/Stellar reaction DMG` });
                    }
                  });
                }

                return `
                  <section class="p-panel">
                    <div class="p-panel-head">
                      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                        <h2 class="p-panel-title">${esc(t.name)}</h2>
                        <span class="p-badge">${esc(t.archetype || 'Squad')}</span>
                      </div>
                      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                        ${resonances.map((r) => `<span class="p-badge p-badge-mint">${esc(r)}</span>`).join('')}
                        ${!readOnly ? `<button type="button" class="p-btn p-btn-ghost p-btn-xs text-coral" data-p-team-del="${esc(t.id)}">Delete</button>` : ''}
                      </div>
                    </div>
                    <div class="p-squad-grid">
                      ${(t.members || [])
                        .map((m) => {
                          const cm = getCharacterMeta(m.characterKey);
                          const elAttr = String(cm.element || '').toLowerCase();
                          const owned = charMap.get(m.characterKey);
                          const wKey = m.weaponKey || owned?.equippedWeapon?.key;
                          const wMeta = wKey ? getWeaponMeta(wKey) : null;
                          return `
                            <button type="button" class="p-squad-slot" data-el="${esc(elAttr)}" data-p-jump-char="${esc(m.characterKey)}">
                              <div class="p-row-left">
                                ${renderAssetIcon('characters', m.characterKey, cm.name, 'icon-md')}
                                <div style="min-width:0;">
                                  <div class="p-row-title">${esc(cm.name)}</div>
                                  <div class="p-row-sub">${esc(m.role || cm.element)}</div>
                                </div>
                              </div>
                              ${
                                wMeta
                                  ? `<div class="p-row-left" style="padding-top:6px;border-top:1px solid var(--p-border);">
                                       ${renderAssetIcon('weapons', wKey, wMeta.name, 'icon-xs')}
                                       <span class="p-row-sub" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(wMeta.name)}</span>
                                     </div>`
                                  : ''
                              }
                            </button>`;
                        })
                        .join('')}
                    </div>
                      ${
                        teamCondNotes.length
                          ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">
                               ${teamCondNotes.slice(0, 4).map((n) => `<span class="p-badge mono ${n.ok ? 'p-cond-ok' : 'p-cond-warn'}">${esc(n.text)}</span>`).join('')}
                             </div>`
                          : ''
                      }
                    ${
                      t.testLab?.rotationFeel || !readOnly
                        ? `<label class="proto-field" style="margin-top:12px;">
                             <span>Rotation Notes</span>
                             <input type="text" class="p-input" placeholder="e.g. EQ -> Kazuha E -> Bennett EQ -> Carry..." value="${esc(t.testLab?.rotationFeel || '')}" data-p-team-note="${esc(t.id)}" ${readOnly ? 'disabled' : ''} />
                           </label>`
                        : ''
                    }
                  </section>`;
              })
              .join('')
          : '<div class="p-panel muted">No squads saved yet. Create one above to track Elemental Resonance and weapon conflicts.</div>'
      }
    </div>
  `;

  document.getElementById('p-team-add-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (readOnly) return;
    const fd = new FormData(e.target);
    const members = [1, 2, 3, 4].map((slot) => {
      const ck = fd.get(`slot${slot}`);
      const owned = charMap.get(ck);
      return {
        characterKey: ck,
        role: slot === 1 ? 'On-Field Carry' : 'Support',
        weaponKey: owned?.equippedWeapon?.key || ''
      };
    });
    const nextTeam = {
      id: `team_${Date.now()}`,
      name: String(fd.get('name') || 'New Squad').trim(),
      archetype: String(fd.get('archetype') || 'Squad').trim(),
      members,
      testLab: { rotationFeel: '' }
    };
    await saveTeams([...teams, nextTeam]);
    showToast(`Created ${nextTeam.name}`);
  });

  container.querySelectorAll('[data-p-team-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await saveTeams(teams.filter((t) => t.id !== btn.dataset.pTeamDel));
      showToast('Deleted squad');
    });
  });

  container.querySelectorAll('[data-p-team-note]').forEach((input) => {
    input.addEventListener('change', async () => {
      const t = teams.find((x) => x.id === input.dataset.pTeamNote);
      if (!t) return;
      t.testLab = { ...(t.testLab || {}), rotationFeel: input.value };
      await saveTeams(teams);
      showToast('Saved rotation note');
    });
  });

  container.querySelectorAll('[data-p-jump-char]').forEach((slot) => {
    slot.addEventListener('click', () => {
      state.inspectedCharKey = slot.dataset.pJumpChar;
      setActiveTab('roster');
    });
  });

  container.querySelectorAll('[data-p-tdeploy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.deploymentMode = btn.dataset.pTdeploy;
      renderTeamsView(container, account);
    });
  });

  container.querySelectorAll('[data-p-tscen]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.scenarioMode = btn.dataset.pTscen;
      renderTeamsView(container, account);
    });
  });

  document.getElementById('p-syn-anchor')?.addEventListener('change', (e) => {
    state.synergyAnchorKey = e.target.value;
    state.synergyTeamSlots = ['', '', ''];
    renderTeamsView(container, account);
  });

  container.querySelectorAll('[data-p-syn-slot]').forEach((sel) => {
    sel.addEventListener('change', () => {
      const idx = Number(sel.dataset.pSynSlot);
      const next = [...(state.synergyTeamSlots || ['', '', ''])];
      next[idx] = sel.value;
      state.synergyTeamSlots = next;
      renderTeamsView(container, account);
    });
  });

  document.getElementById('p-enemy-target')?.addEventListener('change', (e) => {
    state.selectedEnemyId = e.target.value;
    renderTeamsView(container, account);
  });
}

/* ---------- View 6: Vault ---------- */
function renderVaultView(container, account) {
  const readOnly = isReadOnly();
  const disabled = readOnly ? 'disabled' : '';
  const inv = account.inventory || {};
  const queue = sortAndLabelPrefarmQueue(account.prefarmQueue || []);
  const sharedPool = calculatePrioritySharedPool(queue, inv, account.wallet || {}, getServerResetInfo(state.serverId).inGameDay || 'Monday');
  const neededMap = new Map((Array.isArray(sharedPool) ? sharedPool : []).map((i) => [i.key, i.neededTotal || 0]));

  const getInvCount = (val) => {
    if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
    if (val && typeof val === 'object') return Number(val.count ?? val.raw_count ?? 0) || 0;
    return Number(val || 0) || 0;
  };

  const rows = Object.entries(inv)
    .map(([key, val]) => {
      const meta = getMaterialMeta(key);
      const needed = neededMap.get(key) || 0;
      const owned = getInvCount(val);
      return {
        key,
        name: meta?.name || key,
        category: meta?.category || 'Material',
        owned,
        needed,
        net: owned - needed
      };
    })
    .sort((a, b) => b.needed - a.needed || a.name.localeCompare(b.name));

  const cats = ['All', ...[...new Set(rows.map((r) => r.category))].sort((a, b) => a.localeCompare(b))];

  const sortHeader = (key, label) => {
    const active = state.vaultSortKey === key;
    const arrow = active ? (state.vaultSortDir === 'asc' ? ' ↑' : ' ↓') : '';
    return `<th><button type="button" class="p-btn p-btn-ghost p-btn-xs" style="padding-left:0;font-weight:600;color:${active ? 'var(--p-gold)' : 'var(--p-text-muted)'};" data-p-vsort="${key}">${label}${arrow}</button></th>`;
  };

  container.innerHTML = `
    <div class="p-toolbar">
      <div class="p-filter-pills" role="group" aria-label="Material categories">
        ${cats
          .map(
            (cat) =>
              `<button type="button" class="p-pill-btn ${state.vaultCategory === cat ? 'active' : ''}" data-p-vcat="${esc(cat)}" aria-pressed="${state.vaultCategory === cat}">${esc(cat)}</button>`
          )
          .join('')}
      </div>
      <input type="search" id="p-vault-search" class="proto-search" style="max-width:240px;" placeholder="Filter materials..." aria-label="Filter materials" value="${esc(state.vaultSearch)}" />
    </div>

    <div class="p-table-wrap">
      <table class="p-table">
        <thead>
          <tr>
            ${sortHeader('name', 'Material')}
            ${sortHeader('category', 'Category')}
            ${sortHeader('needed', 'Needed')}
            ${sortHeader('net', 'Net')}
            ${sortHeader('owned', 'In Bag')}
          </tr>
        </thead>
        <tbody id="p-vault-tbody"></tbody>
      </table>
    </div>
    <div id="p-vault-count" class="muted mono" style="font-size:12px;"></div>
  `;

  const commitMat = async (key, val) => {
    if (readOnly) return;
    const nextCount = Math.max(0, Number(val || 0));
    const prev = account.inventory[key];
    account.inventory[key] = prev && typeof prev === 'object' ? { ...prev, count: nextCount } : { count: nextCount };
    try {
      if (!state.isPreviewDemo) {
        await saveAccountSection(state.sessionUser, 'inventory', account.inventory);
      }
    } catch (err) {
      showToast(`Vault save failed: ${err.message}`);
    }
  };

  const syncCatPills = () => {
    container.querySelectorAll('.p-filter-pills [data-p-vcat]').forEach((b) => {
      const active = b.dataset.pVcat === state.vaultCategory;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
  };

  const renderVaultRows = () => {
    const tbody = document.getElementById('p-vault-tbody');
    if (!tbody) return;
    const dir = state.vaultSortDir === 'asc' ? 1 : -1;
    const sk = state.vaultSortKey || 'needed';
    const filtered = rows
      .filter((r) => state.vaultCategory === 'All' || r.category === state.vaultCategory)
      .filter((r) => !state.vaultSearch || r.name.toLowerCase().includes(state.vaultSearch.toLowerCase()) || r.category.toLowerCase().includes(state.vaultSearch.toLowerCase()))
      .sort((a, b) => {
        if (sk === 'name' || sk === 'category') return dir * a[sk].localeCompare(b[sk]);
        return dir * ((a[sk] || 0) - (b[sk] || 0)) || a.name.localeCompare(b.name);
      });

    const countEl = document.getElementById('p-vault-count');
    if (countEl) {
      countEl.textContent = `${filtered.length} materials`;
    }

    tbody.innerHTML = filtered.length
      ? filtered
          .map(
            (r) => `
            <tr>
              <td>
                <div class="p-row-left">
                  ${renderAssetIcon('materials', r.key, r.name, 'icon-xs')}
                  <strong>${esc(r.name)}</strong>
                </div>
              </td>
              <td><button type="button" class="p-pill-btn" style="padding:2px 9px;font-size:12px;" data-p-row-cat="${esc(r.category)}">${esc(r.category)}</button></td>
              <td class="mono">${r.needed ? r.needed.toLocaleString() : '—'}</td>
              <td class="mono ${r.needed ? (r.net < 0 ? 'text-coral' : 'text-mint') : 'muted'}">${
                r.needed ? (r.net >= 0 ? `+${r.net.toLocaleString()}` : r.net.toLocaleString()) : '—'
              }</td>
              <td>
                <div class="p-vault-ctrl">
                  <input type="number" min="0" class="p-vault-input mono" aria-label="${esc(r.name)} count" value="${r.owned}" data-p-vinput="${esc(r.key)}" ${disabled} />
                  ${!readOnly ? `<button type="button" class="p-btn p-btn-outline p-btn-xs mono" data-p-vadd="${esc(r.key)}" data-p-delta="1">+1</button><button type="button" class="p-btn p-btn-outline p-btn-xs mono" data-p-vadd="${esc(r.key)}" data-p-delta="10">+10</button>` : ''}
                </div>
              </td>
            </tr>`
          )
          .join('')
      : '<tr><td colspan="5" class="muted">No materials match your filter.</td></tr>';

    tbody.querySelectorAll('[data-p-row-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextCat = btn.dataset.pRowCat;
        state.vaultCategory = state.vaultCategory === nextCat ? 'All' : nextCat;
        syncCatPills();
        renderVaultRows();
      });
    });
    tbody.querySelectorAll('[data-p-vinput]').forEach((input) => {
      input.addEventListener('change', () => commitMat(input.dataset.pVinput, input.value));
    });
    tbody.querySelectorAll('[data-p-vadd]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const k = btn.dataset.pVadd;
        const delta = Number(btn.dataset.pDelta || 1);
        const next = Math.max(0, getInvCount(account.inventory[k]) + delta);
        const rowObj = rows.find((x) => x.key === k);
        if (rowObj) {
          rowObj.owned = next;
          rowObj.net = next - rowObj.needed;
        }
        await commitMat(k, next);
        renderVaultRows();
      });
    });
  };

  renderVaultRows();

  container.querySelectorAll('[data-p-vcat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.vaultCategory = btn.dataset.pVcat;
      syncCatPills();
      renderVaultRows();
    });
  });
  container.querySelectorAll('[data-p-vsort]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.pVsort;
      if (state.vaultSortKey === key) {
        state.vaultSortDir = state.vaultSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.vaultSortKey = key;
        state.vaultSortDir = key === 'name' || key === 'category' ? 'asc' : 'desc';
      }
      renderVaultView(container, account);
    });
  });
  document.getElementById('p-vault-search')?.addEventListener('input', (e) => {
    state.vaultSearch = e.target.value;
    renderVaultRows();
  });
}

function renderActiveView() {
  const container = document.getElementById('proto-main');
  const account = getActiveAccount();
  if (!container || !account) return;

  try {
    if (state.activeTab === 'hud') {
      renderTodayView(container, account);
      animateTodayEntrance(container);
    } else if (state.activeTab === 'prefarm') {
      renderPrefarmView(container, account);
      animatePrefarmEntrance(container);
    } else if (state.activeTab === 'roster') {
      renderRosterView(container, account);
      if (state.inspectedCharKey) animateDossierHero(container);
    }
    else if (state.activeTab === 'armory') renderArmoryView(container, account);
    else if (state.activeTab === 'teams') renderTeamsView(container, account);
    else if (state.activeTab === 'vault') renderVaultView(container, account);
  } catch (err) {
    console.error('Prototype view render failed:', err);
    container.innerHTML = `<div class="p-panel text-coral">Render error in ${esc(state.activeTab)}: ${esc(err.message)}</div>`;
  }
}

/* ---------- Shell Interactions (Quick Jump, Modals, Auth) ---------- */
function setupQuickJump() {
  const input = document.getElementById('proto-quick-jump');
  const menu = document.getElementById('proto-jump-results');
  if (!input || !menu) return;

  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
      e.preventDefault();
      input.focus();
    }
  });

  const closeJump = () => {
    menu.hidden = true;
    input.setAttribute('aria-expanded', 'false');
  };

  let jumpIdx = -1;
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    jumpIdx = -1;
    if (!q) {
      closeJump();
      return;
    }
    const account = getActiveAccount();
    const allCharKeys = [...new Set([...(account?.characters || []).map((c) => c.key), ...getAllCharacterKeys()])];
    const chars = allCharKeys
      .map((key) => ({ type: 'char', key, label: getCharacterMeta(key).name }))
      .filter((x) => matchesCharacterQuery(x.key, x.label, q))
      .slice(0, 5);
    const mats = Object.keys(account?.inventory || {})
      .map((k) => ({ type: 'mat', key: k, label: getMaterialMeta(k)?.name || k }))
      .filter((x) => x.label.toLowerCase().includes(q))
      .slice(0, 4);

    const hits = [...chars, ...mats];
    if (!hits.length) {
      closeJump();
      return;
    }
    menu.innerHTML = hits
      .map(
        (h) =>
          `<button type="button" class="proto-jump-item" role="option" data-jtype="${h.type}" data-jkey="${esc(h.key)}" data-jlabel="${esc(h.label)}"><span>${esc(h.label)}</span><span class="muted">${h.type === 'char' ? 'Characters' : 'Vault'}</span></button>`
      )
      .join('');
    menu.hidden = false;
    input.setAttribute('aria-expanded', 'true');

    menu.querySelectorAll('.proto-jump-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        closeJump();
        input.value = '';
        if (btn.dataset.jtype === 'char') {
          state.inspectedCharKey = btn.dataset.jkey;
          setActiveTab('roster');
        } else {
          state.vaultCategory = 'All';
          state.vaultSearch = btn.dataset.jlabel;
          setActiveTab('vault');
        }
      });
    });
  });

  input.addEventListener('keydown', (e) => {
    if (menu.hidden) return;
    const opts = [...menu.querySelectorAll('.proto-jump-item')];
    if (e.key === 'Escape') {
      closeJump();
    } else if (e.key === 'ArrowDown' && opts.length) {
      e.preventDefault();
      jumpIdx = (jumpIdx + 1) % opts.length;
      opts.forEach((o, i) => o.classList.toggle('is-selected', i === jumpIdx));
    } else if (e.key === 'ArrowUp' && opts.length) {
      e.preventDefault();
      jumpIdx = (jumpIdx - 1 + opts.length) % opts.length;
      opts.forEach((o, i) => o.classList.toggle('is-selected', i === jumpIdx));
    } else if (e.key === 'Enter' && jumpIdx >= 0 && opts[jumpIdx]) {
      e.preventDefault();
      opts[jumpIdx].click();
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.proto-search-wrap')) closeJump();
  });
}

function setupModals() {
  const bindBackdropModal = (modalId, openBtnIds, closeBtnId, onOpen) => {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    let lastTrigger = null;
    const ids = Array.isArray(openBtnIds) ? openBtnIds : [openBtnIds];
    const open = (trigger) => {
      lastTrigger = trigger || document.activeElement;
      if (onOpen) onOpen();
      modal.hidden = false;
      const focusTarget = modal.querySelector('button, input, select, textarea, [href]');
      focusTarget?.focus();
    };
    const close = () => {
      modal.hidden = true;
      lastTrigger?.focus?.();
    };
    modal._openModal = open;
    modal._closeModal = close;
    ids.forEach((id) => {
      document.getElementById(id)?.addEventListener('click', (e) => open(e.currentTarget));
    });
    document.getElementById(closeBtnId)?.addEventListener('click', close);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
    modal.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' || modal.hidden) return;
      const focusables = [...modal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]')];
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.hidden) close();
    });
  };

  bindBackdropModal('proto-server-modal', 'proto-server-btn', 'proto-close-server');
  bindBackdropModal('proto-weapon-modal', [], 'proto-close-weapon');
  bindBackdropModal('proto-artifact-modal', [], 'proto-close-artifact');
  document.querySelectorAll('[data-pserver]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.serverId = btn.dataset.pserver;
      if (state.sessionUser) localStorage.setItem(`aaru_server_${state.sessionUser}`, state.serverId);
      document.getElementById('proto-server-modal')._closeModal?.();
      updateChrome();
      renderActiveView();
    });
  });

  bindBackdropModal('proto-system-modal', ['proto-open-system', 'proto-mobile-menu-btn'], 'proto-close-system', () => {
    const st = getCatalogStatus();
    const body = document.getElementById('proto-system-body');
    if (!body) return;
    const acctOpts = document.getElementById('proto-account-select')?.innerHTML || '';
    body.innerHTML = `
      <div class="p-row"><span>Catalog Source</span><strong class="mono">${esc(st.source || 'snapshot')}</strong></div>
      <div class="p-row"><span>Version</span><strong class="mono">${esc(st.lunarisVer || '—')}</strong></div>
      <button type="button" id="p-refresh-cat" class="p-btn p-btn-outline">Refresh Live Catalog</button>
      <div style="border-top:1px solid var(--p-border);padding-top:12px;display:flex;flex-direction:column;gap:8px;">
        <label class="proto-field">
          <span>Account View</span>
          <select id="p-modal-acct-select" class="proto-select">${acctOpts}</select>
        </label>
        <button type="button" id="p-modal-import-btn" class="p-btn p-btn-primary">+ Import GOOD</button>
        <div style="display:flex;gap:8px;">
          <a href="./index.html?preview=1" class="p-btn p-btn-outline" style="flex:1;">Classic UI</a>
          <button type="button" id="p-modal-logout-btn" class="p-btn p-btn-outline" style="flex:1;">Sign out</button>
        </div>
      </div>
  `;
    document.getElementById('p-refresh-cat')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Refreshing...';
      try {
        await refreshLiveCatalog();
        renderActiveView();
        showToast('Catalog refreshed');
      } catch (err) {
        showToast(`Catalog refresh failed: ${err.message}`);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Refresh Live Catalog';
      }
    });
    document.getElementById('p-modal-acct-select')?.addEventListener('change', (e) => {
      const sideSel = document.getElementById('proto-account-select');
      if (sideSel) {
        sideSel.value = e.target.value;
        sideSel.dispatchEvent(new Event('change'));
      }
      document.getElementById('proto-system-modal')._closeModal?.();
    });
    document.getElementById('p-modal-import-btn')?.addEventListener('click', () => {
      document.getElementById('proto-system-modal')._closeModal?.();
      document.getElementById('proto-open-import')?.click();
    });
    document.getElementById('p-modal-logout-btn')?.addEventListener('click', () => {
      document.getElementById('proto-system-modal')._closeModal?.();
      document.getElementById('proto-logout')?.click();
    });
  });

  bindBackdropModal('proto-import-modal', 'proto-open-import', 'proto-close-import');
  const dropzone = document.getElementById('proto-dropzone');
  const fileInput = document.getElementById('proto-file-input');
  const pasteArea = document.getElementById('proto-good-paste');
  const previewBox = document.getElementById('proto-import-preview');
  const commitBtn = document.getElementById('proto-commit-import');

  const processRaw = (rawText) => {
    try {
      const parsed = JSON.parse(rawText);
      validateGoodV3(parsed);
      const diff = computeGoodImportDiff(state.ownAccount, parsed);
      state.pendingGoodImport = { raw: parsed, diff };
      const sampleLines = [
        ...diff.charChanges.slice(0, 6).map((c) => `CHAR [${c.type.toUpperCase()}]: ${c.key} ${c.fromLevel ? `Lv.${c.fromLevel} → ` : ''}Lv.${c.toLevel}`),
        ...diff.matChanges.slice(0, 4).map((m) => `MAT: ${m.key} ${m.from ?? 0} → ${m.to}`)
      ];
      previewBox.innerHTML = `
        <div class="p-diff-summary">
          <div class="p-diff-row">
            <span class="p-diff-label">Source</span>
            <span class="p-diff-val mono"><strong>${esc(diff.source || 'GOOD')}</strong> <span class="muted">(v${esc(diff.version)})</span></span>
          </div>
          <div class="p-diff-row">
            <span class="p-diff-label">Characters</span>
            <span class="p-diff-val mono"><strong class="${diff.charChanges.length ? 'text-gold' : ''}">${diff.charChanges.length} changes</strong> <span class="muted">/ ${diff.charactersTotal} total</span></span>
          </div>
          <div class="p-diff-row">
            <span class="p-diff-label">Weapons</span>
            <span class="p-diff-val mono"><strong class="${diff.weaponChanges.length ? 'text-mint' : ''}">${diff.weaponChanges.length} changes</strong> <span class="muted">/ ${diff.weaponsTotal} total</span></span>
          </div>
          <div class="p-diff-row">
            <span class="p-diff-label">Artifacts</span>
            <span class="p-diff-val mono"><strong class="text-accent">${diff.equippedArtifactsCount || 0} equipped</strong> <span class="muted">/ ${diff.artifactsTotal || 0} total</span></span>
          </div>
          <div class="p-diff-row">
            <span class="p-diff-label">Materials</span>
            <span class="p-diff-val mono"><strong class="${diff.matChanges.length ? 'text-mint' : ''}">${diff.matChanges.length} synced</strong> <span class="muted">/ ${diff.materialsTotal} total</span></span>
          </div>
        </div>
        ${
          sampleLines.length
            ? `<div class="p-diff-samples mono">${sampleLines.map((line) => `<div>${esc(line)}</div>`).join('')}</div>`
            : ''
        }
      `;
      commitBtn.disabled = false;
    } catch (err) {
      state.pendingGoodImport = null;
      previewBox.innerHTML = `<div class="text-coral">${esc(err.message)}</div>`;
      commitBtn.disabled = true;
    }
  };

  dropzone?.addEventListener('click', () => fileInput?.click());
  dropzone?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput?.click();
    }
  });
  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('is-dragover');
  });
  dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('is-dragover'));
  dropzone?.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropzone.classList.remove('is-dragover');
    const f = e.dataTransfer?.files?.[0];
    if (f) processRaw(await f.text());
  });
  fileInput?.addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (f) processRaw(await f.text());
  });
  pasteArea?.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    if (!val) {
      state.pendingGoodImport = null;
      previewBox.innerHTML = '';
      commitBtn.disabled = true;
      return;
    }
    processRaw(val);
  });
  commitBtn?.addEventListener('click', async () => {
    if (!state.pendingGoodImport || isReadOnly()) return;
    const { raw, diff } = state.pendingGoodImport;
    commitBtn.disabled = true;
    commitBtn.textContent = 'Syncing...';
    try {
      if (!state.isPreviewDemo) {
        await commitGoodImport(state.sessionUser, raw, diff.mergedAccount);
      }
      state.ownAccount = diff.mergedAccount;
      document.getElementById('proto-import-modal')._closeModal?.();
      renderActiveView();
      showToast(state.isPreviewDemo ? 'GOOD v3 previewed locally' : 'GOOD v3 imported & synced');
    } catch (err) {
      showToast(`Import failed: ${err.message}`);
    } finally {
      commitBtn.disabled = false;
      commitBtn.textContent = 'Confirm & Sync';
    }
  });
}

async function bootstrap() {
  try {
    await loadCatalog();
  } catch (err) {
    showToast(`Catalog load warning: ${err.message}`);
  }

  document.querySelectorAll('[data-ptab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.inspectedCharKey = null;
      setActiveTab(btn.dataset.ptab);
    });
  });

  document.getElementById('proto-readonly-pill')?.addEventListener('click', () => {
    const sel = document.getElementById('proto-account-select');
    if (sel && state.sessionUser) {
      sel.value = state.sessionUser;
      sel.dispatchEvent(new Event('change'));
    }
  });

  document.getElementById('proto-account-select')?.addEventListener('change', async (e) => {
    const target = e.target.value;
    try {
      if (target === state.sessionUser) {
        state.viewingPartner = false;
        state.partnerAccount = null;
        state.partnerUser = null;
        setReadOnlyViewState(false);
      } else if (state.isPreviewDemo) {
        state.partnerUser = target;
        state.partnerAccount = cloneMockAccount(target);
        state.viewingPartner = true;
        setReadOnlyViewState(true);
      } else {
        const partnerAcc = await fetchPartnerAccount(target);
        state.partnerUser = target;
        state.partnerAccount = partnerAcc?.account || partnerAcc;
        state.viewingPartner = true;
        setReadOnlyViewState(true);
        showToast(`Viewing ${state.partnerAccount?.displayName || target} (Read-Only)`);
      }
      state.inspectedCharKey = null;
      updateChrome();
      renderActiveView();
    } catch (err) {
      showToast(`Account switch failed: ${err.message}`);
      populateAccountSelect();
    }
  });

  document.getElementById('proto-logout')?.addEventListener('click', () => {
    state.isPreviewDemo = false;
    state.sessionUser = null;
    state.ownAccount = null;
    state.partnerAccount = null;
    state.partnerUser = null;
    state.inspectedCharKey = null;
    logoutAccount();
    sessionStorage.removeItem(SESSION_KEY);
    document.getElementById('proto-shell').hidden = true;
    document.getElementById('proto-login').hidden = false;
  });

  const enterPreviewSession = async (username = 'luna') => {
    const mock = cloneMockAccount(username);
    if (!mock) return;
    state.isPreviewDemo = true;
    await applySession({
      user: username,
      account: mock,
      visibleUsers: Object.keys(MOCK_ACCOUNTS)
    });
  };

  const loginForm = document.getElementById('proto-login-form');
  loginForm?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      if (typeof loginForm.requestSubmit === 'function') {
        loginForm.requestSubmit();
      } else {
        loginForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    }
  });
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = document.getElementById('proto-username').value.trim();
    const pass = document.getElementById('proto-password').value;
    const errEl = document.getElementById('proto-login-error');
    const submitBtn = document.getElementById('proto-login-submit');
    if (errEl) errEl.textContent = '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in...';
    }
    try {
      state.isPreviewDemo = false;
      const res = await loginAccount(user, pass);
      const userKey = res.account?.user || res.user || user;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ user: userKey }));
      await applySession(res);
    } catch (err) {
      if (errEl) errEl.textContent = err.message;
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In';
      }
    }
  });

  setupQuickJump();
  setupModals();

  // Restore real session first; only fall back to ?preview=1 demo if not signed in
  const params = new URLSearchParams(window.location.search);
  try {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) {
      const { user } = JSON.parse(saved);
      if (user) {
        const cached = getCachedAccountSession(user);
        if (cached) {
          await applySession(cached);
          if (!isOfflineMode()) {
            restoreAccountSession(user)
              .then((fresh) => {
                if (state.sessionUser === user && fresh?.account) applySession(fresh);
              })
              .catch(() => {});
          }
          return;
        }
        const fresh = await restoreAccountSession(user);
        await applySession(fresh);
        return;
      }
    }
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
  }

  if (params.get('preview') === '1') {
    await enterPreviewSession('luna');
    return;
  }

  document.getElementById('proto-login').hidden = false;
}

bootstrap();
