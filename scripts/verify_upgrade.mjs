import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  applySandboxContext,
  rankArtifactSetsByVector,
  rankPartnersAndSubstitutes,
  rankWeaponsByVector
} from '../js/science/context-engine.js';
import { computeCharacterCombatStats } from '../js/science/stat-math.js';

const ROOT = process.cwd();
const kitProfilesJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'kit_profiles.json'), 'utf8'));
const setVectorsJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'set_vectors.json'), 'utf8'));
const weaponsIndexJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'weapons_index.json'), 'utf8'));
const enemiesIndexJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'enemies_index.json'), 'utf8'));
const catalogJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'catalog.json'), 'utf8'));

const profiles = kitProfilesJson.profiles || {};
const setVectors = setVectorsJson.sets || [];
const weaponsIndex = weaponsIndexJson.weapons || [];
const enemies = enemiesIndexJson.enemies || [];

function metaFor(charKey) {
  const c = catalogJson.characters?.[charKey] || {};
  const p = profiles[charKey] || {};
  return {
    key: charKey,
    name: c.name || p.name || charKey,
    element: c.element || p.element || 'Pyro',
    weaponType: c.weaponType || p.weaponType || 'Sword',
    rarity: c.rarity || p.rarity || 5
  };
}

const byKey = (arr, k) => arr.find((x) => x.key === k);
const rankOf = (arr, k) => arr.findIndex((x) => x.key === k);

console.log(`Loaded: ${Object.keys(profiles).length} kit profiles, ${setVectors.length} sets, ${weaponsIndex.length} weapons, ${enemies.length} enemies`);

// 1. Bennett (Support): Aquila Favonia / Mistsplitter / Sapwood Blade / Skyward Blade rank above ATK% swords; atk_ weight <= 0.1
{
  const p = profiles.Bennett;
  const meta = metaFor('Bennett');
  assert.equal(p.baseAtkOnlyBuffer, true, 'Bennett should have baseAtkOnlyBuffer=true');
  const ctx = applySandboxContext('Bennett', p, {
    deploymentMode: 'abyss',
    scenarioMode: 'st',
    activeLens: 'Quickswap Support',
    constellation: 1,
    allProfiles: profiles,
    charMetaFn: metaFor
  });
  assert.ok((ctx.effectiveSubstatWeights.atk_ ?? 99) <= 0.1, `Expected Bennett atk_ weight <= 0.1, got ${ctx.effectiveSubstatWeights.atk_}`);

  const ranked = rankWeaponsByVector(meta, p, ctx, weaponsIndex, [], null, {});
  const highBaseAtks = ['AquilaFavonia', 'MistsplitterReforged', 'SapwoodBlade', 'SkywardBlade'];
  const atkPctSwords = ['LionsRoar', 'TheFlute', 'AmenomaKageuchi', 'SummitShaper'];

  for (const goodKey of highBaseAtks) {
    const goodW = byKey(ranked, goodKey);
    assert.ok(goodW, `Missing ${goodKey} in Bennett rankings`);
    for (const badKey of atkPctSwords) {
      const badW = byKey(ranked, badKey);
      assert.ok(badW, `Missing ${badKey} in Bennett rankings`);
      assert.ok(
        goodW.score > badW.score,
        `Bennett Support: ${goodKey} (${goodW.score}) should outrank ATK% sword ${badKey} (${badW.score})`
      );
    }
  }
  console.log('[PASS 1] Bennett (Support):', highBaseAtks.map((k) => `${k}=${byKey(ranked, k).score}`).join(', '), '| atk_wt=', ctx.effectiveSubstatWeights.atk_);
}

// 2. Zhongli (Shieldbot / Support): Favonius Lance & Black Tassel outrank Vortex Vanquisher; signatureNote triggers
{
  const p = profiles.Zhongli;
  const meta = metaFor('Zhongli');
  const ctx = applySandboxContext('Zhongli', p, {
    deploymentMode: 'abyss',
    scenarioMode: 'st',
    activeLens: 'Quickswap Support',
    allProfiles: profiles,
    charMetaFn: metaFor
  });
  const ranked = rankWeaponsByVector(meta, p, ctx, weaponsIndex, [], null, {});
  const fav = byKey(ranked, 'FavoniusLance');
  const black = byKey(ranked, 'BlackTassel');
  const vortex = byKey(ranked, 'VortexVanquisher');
  assert.ok(fav && black && vortex, 'Missing Zhongli test weapons');
  assert.ok(fav.score > vortex.score, `Favonius Lance (${fav.score}) should outrank Vortex Vanquisher (${vortex.score})`);
  assert.ok(black.score > vortex.score, `Black Tassel (${black.score}) should outrank Vortex Vanquisher (${vortex.score})`);
  assert.ok(vortex.signatureNote && vortex.signatureNote.length > 0, 'Vortex Vanquisher should trigger signatureNote');
  console.log(`[PASS 2] Zhongli (Support): BlackTassel=${black.score}, FavoniusLance=${fav.score}, VortexVanquisher=${vortex.score} (note="${vortex.signatureNote}")`);
}

// 3. Yoimiya (4pc Shimenawa): Rust and Slingshot outrank Hamayumi
{
  const p = profiles.Yoimiya;
  const meta = metaFor('Yoimiya');
  const ctx = applySandboxContext('Yoimiya', p, {
    deploymentMode: 'abyss',
    scenarioMode: 'st',
    activeLens: 'On-Field Carry',
    allProfiles: profiles,
    charMetaFn: metaFor
  });
  const ranked = rankWeaponsByVector(meta, p, ctx, weaponsIndex, [], null, {
    activeSetKey: 'shimenawasreminiscence',
    hasFlatAtkBuffer: true
  });
  const rust = byKey(ranked, 'Rust');
  const slingshot = byKey(ranked, 'Slingshot');
  const hamayumi = byKey(ranked, 'Hamayumi');
  assert.ok(rust && slingshot && hamayumi, 'Missing Yoimiya test weapons');
  assert.equal(hamayumi.requiresFullEnergy, true, 'Hamayumi should be flagged requiresFullEnergy=true');
  assert.ok(rust.score > hamayumi.score, `Rust (${rust.score}) should outrank Hamayumi (${hamayumi.score})`);
  assert.ok(slingshot.score > hamayumi.score, `Slingshot (${slingshot.score}) should outrank Hamayumi (${hamayumi.score})`);
  console.log(`[PASS 3] Yoimiya (Shimenawa): Rust=${rust.score}, Slingshot=${slingshot.score}, Hamayumi=${hamayumi.score}`);
}

// 4. Yelan (C0 vs. C1): Favonius Warbow #1 F2P at C0; Slingshot & Recurve Bow surface; Fleuve Cendre excluded
{
  const p = profiles.Yelan;
  const meta = metaFor('Yelan');
  const ctxC0 = applySandboxContext('Yelan', p, {
    deploymentMode: 'abyss',
    scenarioMode: 'st',
    activeLens: 'Off-Field Sub-DPS',
    constellation: 0,
    allProfiles: profiles,
    charMetaFn: metaFor
  });
  const ctxC1 = applySandboxContext('Yelan', p, {
    deploymentMode: 'abyss',
    scenarioMode: 'st',
    activeLens: 'Off-Field Sub-DPS',
    constellation: 1,
    allProfiles: profiles,
    charMetaFn: metaFor
  });
  const rankedC0 = rankWeaponsByVector(meta, p, ctxC0, weaponsIndex, [], null, { constellation: 0 });
  const rankedC1 = rankWeaponsByVector(meta, p, ctxC1, weaponsIndex, [], null, { constellation: 1 });

  assert.equal(rankedC0.some((w) => w.key === 'FleuveCendreFerryman'), false, 'Sword Fleuve Cendre must be excluded for Bow user Yelan');
  const f2pC0 = rankedC0.filter((w) => w.acquisition === 'f2p_craft_fish');
  assert.equal(f2pC0[0]?.key, 'FavoniusWarbow', `Expected FavoniusWarbow #1 F2P at C0, got ${f2pC0[0]?.key} (${f2pC0[0]?.score})`);
  assert.ok(byKey(rankedC0, 'Slingshot'), 'Slingshot must surface in Yelan weapon rankings');
  assert.ok(byKey(rankedC0, 'RecurveBow'), 'Recurve Bow must surface in Yelan weapon rankings');
  assert.ok(
    byKey(rankedC1, 'FavoniusWarbow').score < byKey(rankedC0, 'FavoniusWarbow').score,
    `Yelan C1 Favonius score (${byKey(rankedC1, 'FavoniusWarbow').score}) should drop below C0 (${byKey(rankedC0, 'FavoniusWarbow').score})`
  );

  const setsC0 = rankArtifactSetsByVector(meta, p, ctxC0, setVectors, null);
  assert.ok(setsC0.some((s) => /Emblem of Severed Fate/i.test(s.set)), `Emblem of Severed Fate should surface for Yelan C0, got ${setsC0.map((s) => s.set).join(' | ')}`);
  console.log(`[PASS 4] Yelan C0 vs C1: F2P#1=${f2pC0[0].key} (${f2pC0[0].score} -> C1 ${byKey(rankedC1, 'FavoniusWarbow').score}), RecurveBow=#${rankOf(rankedC0, 'RecurveBow') + 1}, Sets=${setsC0.map((s) => s.set).join(' | ')}`);
}

// 5. Columbina: baselineCritRate=48.2 flags overcap on CRIT Rate weapons; Aubade / Silken Moon / Night of the Sky split by role
{
  const p = profiles.Columbina;
  const meta = metaFor('Columbina');
  assert.equal(p.baselineCritRate, 48.2, `Expected Columbina baselineCritRate=48.2, got ${p.baselineCritRate}`);

  const ctxSub = applySandboxContext('Columbina', p, { deploymentMode: 'abyss', scenarioMode: 'st', activeLens: 'Off-Field Sub-DPS', allProfiles: profiles, charMetaFn: metaFor });
  const ctxSup = applySandboxContext('Columbina', p, { deploymentMode: 'abyss', scenarioMode: 'st', activeLens: 'Quickswap Support', allProfiles: profiles, charMetaFn: metaFor });
  const ctxCarry = applySandboxContext('Columbina', p, { deploymentMode: 'abyss', scenarioMode: 'st', activeLens: 'On-Field Carry', allProfiles: profiles, charMetaFn: metaFor });

  const setsSub = rankArtifactSetsByVector(meta, p, ctxSub, setVectors, null);
  const setsSup = rankArtifactSetsByVector(meta, p, ctxSup, setVectors, null);
  const setsCarry = rankArtifactSetsByVector(meta, p, ctxCarry, setVectors, null);

  assert.match(setsSub[0]?.set || '', /Aubade of Morningstar and Moon/i, `Columbina Sub-DPS expected Aubade #1, got ${setsSub[0]?.set}`);
  assert.match(setsSup[0]?.set || '', /Silken Moon's Serenade/i, `Columbina Support expected Silken Moon #1, got ${setsSup[0]?.set}`);
  assert.match(setsCarry[0]?.set || '', /Night of the Sky's Unveiling/i, `Columbina Carry expected Night of the Sky #1, got ${setsCarry[0]?.set}`);

  const wepsCarry = rankWeaponsByVector(meta, p, ctxCarry, weaponsIndex, [], null, {
    activeSetKey: 'nightoftheskysunveiling'
  });
  const wepsBase = rankWeaponsByVector(meta, p, ctxCarry, weaponsIndex, [], null, {});
  const sacJadeCarry = byKey(wepsCarry, 'SacrificialJade');
  const lostPrayerBase = byKey(wepsBase, 'LostPrayerToTheSacredWinds');
  assert.ok(sacJadeCarry?.overcapWarning, 'Sacrificial Jade (36.8% CR) on Columbina (48.2%) + Night of the Sky (30%) must trigger overcapWarning');
  assert.ok(lostPrayerBase?.overcapWarning, 'Lost Prayer (33.1% CR) on Columbina (48.2%) must trigger overcapWarning (81.3% >= 80%)');
  console.log(`[PASS 5] Columbina: CR=${p.baselineCritRate}%, Sub=${setsSub[0].set}, Sup=${setsSup[0].set}, Carry=${setsCarry[0].set} | SacJade warn="${sacJadeCarry.overcapWarning}"`);
}

// 6. Chevreuse: divergenceScore >= 1.15, support_buffer (40k HP cap), Song of Days Past / Noblesse / 2pc HP% + 2pc HP%
{
  const p = profiles.Chevreuse;
  const meta = metaFor('Chevreuse');
  assert.ok(p.divergenceScore >= 1.15, `Expected Chevreuse divergenceScore >= 1.15, got ${p.divergenceScore}`);
  assert.ok((p.roles || []).includes('support_buffer'), 'Chevreuse roles must include support_buffer');
  assert.equal(p.statThresholdCurve?.ceiling, 40000, 'Chevreuse HP cap should be 40000');

  const ctx = applySandboxContext('Chevreuse', p, {
    deploymentMode: 'abyss',
    scenarioMode: 'st',
    activeLens: 'Quickswap Support',
    allProfiles: profiles,
    charMetaFn: metaFor
  });
  const recSets = rankArtifactSetsByVector(meta, p, ctx, setVectors, null);
  const recNames = recSets.map((s) => s.set);
  assert.ok(recNames.some((n) => /Song of Days Past/i.test(n)), `Missing Song of Days Past in ${recNames}`);
  assert.ok(recNames.some((n) => /Noblesse Oblige/i.test(n)), `Missing Noblesse Oblige in ${recNames}`);
  assert.ok(recNames.some((n) => n === '2pc HP% + 2pc HP%'), `Missing 2pc HP% + 2pc HP% in ${recNames}`);
  console.log(`[PASS 6] Chevreuse: div=${p.divergenceScore}, roles=${p.roles.join(',')}, cap=${p.statThresholdCurve?.ceiling}, sets=${recNames.join(' | ')}`);
}

// 7A. Teams Lab Non-Snapshotting Discount & Off-Piece Slot Reservation & Enemy Index
{
  const synDyn = rankPartnersAndSubstitutes('XL_DYN', {
    allProfiles: { XL_DYN: { ...profiles.Xiangling, canSnapshot: false }, Bennett: profiles.Bennett },
    charMetaFn: metaFor
  });
  const synSnap = rankPartnersAndSubstitutes('XL_SNAP', {
    allProfiles: { XL_SNAP: profiles.Xiangling, Bennett: profiles.Bennett },
    charMetaFn: metaFor
  });
  const benDyn = synDyn.idealPartners.find((x) => x.key === 'Bennett');
  const benSnap = synSnap.idealPartners.find((x) => x.key === 'Bennett');
  assert.ok(benDyn && benSnap && benDyn.score < benSnap.score, `Non-snapshotting 0.85x discount should reduce Bennett score (${benDyn?.score} < ${benSnap?.score})`);

  const stats = computeCharacterCombatStats(
    { key: 'Yelan', level: 90, constellation: 0 },
    { key: 'FavoniusWarbow', level: 90, refinement: 1 },
    [
      { slotKey: 'flower', setKey: 'EmblemOfSeveredFate', mainStatKey: 'hp', level: 20, rarity: 5, substats: [{ key: 'critRate_', value: 10 }] },
      { slotKey: 'plume', setKey: 'EmblemOfSeveredFate', mainStatKey: 'atk', level: 20, rarity: 5, substats: [{ key: 'critDMG_', value: 20 }] },
      { slotKey: 'sands', setKey: 'EmblemOfSeveredFate', mainStatKey: 'enerRech_', level: 20, rarity: 5, substats: [{ key: 'hp_', value: 15 }] },
      { slotKey: 'goblet', setKey: 'GladiatorsFinale', mainStatKey: 'hydro_dmg_', level: 20, rarity: 5, substats: [{ key: 'critRate_', value: 7 }] },
      { slotKey: 'circlet', setKey: 'EmblemOfSeveredFate', mainStatKey: 'critRate_', level: 20, rarity: 5, substats: [{ key: 'hp_', value: 10 }] }
    ]
  );
  assert.equal(stats.offPieceSlot, 'goblet', `Expected offPieceSlot=goblet, got ${stats.offPieceSlot}`);
  assert.ok(enemies.length >= 400, `Expected >= 400 enemies in enemies_index.json, got ${enemies.length}`);
  console.log(`[PASS 7A] Non-snap discount Bennett: ${benSnap.score} -> ${benDyn.score} | offPieceSlot=${stats.offPieceSlot} | enemies=${enemies.length}`);
}

// 7B. Zero-Spoiler Firewall Check
{
  const forbiddenFileNames = [];
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === '.git' || ent.name === '.venv' || ent.name === 'node_modules') continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (/TextMap.*\.json$/i.test(ent.name) || /(?:Quest|Npc|Talk|MainQuest)Excel/i.test(ent.name)) {
        forbiddenFileNames.push(path.relative(ROOT, full));
      }
    }
  }
  walk(ROOT);
  assert.equal(forbiddenFileNames.length, 0, `Forbidden files found in workspace: ${forbiddenFileNames.join(', ')}`);

  for (const fname of ['kit_profiles.json', 'set_vectors.json', 'weapons_index.json', 'enemies_index.json']) {
    const raw = fs.readFileSync(path.join(ROOT, 'data', fname), 'utf8');
    assert.equal(/(?:QuestExcel|NpcExcel|TalkExcel|MainQuestExcel|Readable\/|Subtitle\/)/i.test(raw), false, `Forbidden quest/NPC reference found in data/${fname}`);
  }
  console.log('[PASS 7B] Zero-Spoiler Check: zero TextMap or Quest/NPC files/references in repo or data/*.json');
}

console.log('ALL ACCEPTANCE CHECKS PASSED.');
