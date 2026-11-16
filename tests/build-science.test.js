import {
  ensureCharacterKitAndStats,
  getCharacterKit,
  getWeaponsIndex,
  loadCatalog
} from '../js/catalog.js?v=20261115ag';
import {
  buildKitProfile,
  deriveTalentPriority,
  evaluateBuild,
  recommendWeapons,
  resolveMemberTeamRole
} from '../js/build-science.js?v=20261115ah';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const TEST_KEYS = [
  'Zhongli',
  'Keqing',
  'Ganyu',
  'Alhaitham',
  'Xingqiu',
  'KaedeharaKazuha',
  'Xilonen',
  'SangonomiyaKokomi',
  'Eula',
  'HuTao',
  'Noelle',
  'Beidou',
  'Dehya',
  'Durin',
  'Vodyanitsa'
];

export async function runBuildScienceTests(onProgress = () => {}) {
  await loadCatalog();
  const weaponsIndex = getWeaponsIndex();
  const results = [];

  const runCase = async (name, fn) => {
    const t0 = performance.now();
    try {
      const detail = await fn();
      results.push({ name, ok: true, ms: Math.round(performance.now() - t0), detail: detail || 'Passed' });
    } catch (err) {
      results.push({ name, ok: false, ms: Math.round(performance.now() - t0), detail: err.message });
    }
    onProgress([...results]);
  };

  await runCase('Catalog & weapons_index.json loaded (>= 200 weapons)', async () => {
    assert(weaponsIndex.length >= 200, `Expected >= 200 weapons, got ${weaponsIndex.length}`);
    return `${weaponsIndex.length} weapons indexed`;
  });

  // Hydrate all test characters in parallel
  await Promise.all(TEST_KEYS.map((k) => ensureCharacterKitAndStats(k).catch(() => null)));

  const verifyFourUniqueBuckets = (profile, recs) => {
    assert(recs.length === 4, `Expected 4 weapon buckets, got ${recs.length}`);
    assert(!recs.some((w) => w.acquisition === 'event_limited'), `event_limited weapon leaked into bestOverall: ${recs.map((w) => w.name).join(', ')}`);
    const keys = new Set(recs.map((w) => w.key));
    assert(keys.size === 4, `Duplicate weapon keys in recommendations: ${recs.map((w) => w.key).join(', ')}`);
    const tiers = new Set(recs.map((w) => w.tierLabel));
    assert(tiers.size === 4, `Duplicate tier labels: ${recs.map((w) => w.tierLabel).join(', ')}`);
    return `${profile.fieldRole} · [${profile.scalingStats.join(', ')}] · ${recs.map((w) => `${w.tierLabel}: ${w.name}`).join(' | ')}`;
  };

  await runCase('Zhongli: Shielder + HP A4 conversion + 40-cost ER gate', async () => {
    const kit = getCharacterKit('Zhongli');
    assert(kit, 'Zhongli kit failed to load');
    const profile = buildKitProfile({ key: 'Zhongli', kitData: kit });
    assert(profile.fieldRole !== 'On-Field Carry', `Zhongli misclassified as ${profile.fieldRole}`);
    assert(profile.functionTags.includes('Shielder'), `Missing Shielder tag: ${profile.functionTags.join(', ')}`);
    assert(profile.scalingStats.includes('HP'), `Expected HP in scalingStats, got ${profile.scalingStats.join(', ')}`);
    assert(profile.burstCost === 40, `Expected 40-cost burst, got ${profile.burstCost}`);
    const { bestOverall: recs } = recommendWeapons(profile, weaponsIndex, []);
    const bisDps = recs.find((w) => w.tierLabel === 'BiS DPS');
    const accSup = recs.find((w) => w.tierLabel === 'Accessible Support');
    const bisSup = recs.find((w) => w.tierLabel === 'BiS Support');
    assert(bisDps?.name === 'Staff of Homa', `Expected BiS DPS Staff of Homa, got ${bisDps?.name}`);
    assert(bisSup?.name !== 'Fractured Halo', `BiS Support should not be Lunar-locked Fractured Halo`);
    assert(
      accSup?.name === 'Favonius Lance' || accSup?.name === 'Black Tassel' || accSup?.name === 'Rightful Reward',
      `Expected Accessible Support Favonius Lance, Black Tassel, or Rightful Reward, got ${accSup?.name}`
    );
    assert(!/40-cost Burst ER/i.test(bisSup?.reason || ''), `Lying ER blurb on 40-cost Zhongli: ${bisSup?.reason}`);
    return verifyFourUniqueBuckets(profile, recs);
  });

  await runCase('Keqing: A1 Infusion -> On-Field Carry & Normal (A) prioritized', async () => {
    const kit = getCharacterKit('Keqing');
    assert(kit, 'Keqing kit failed to load');
    const profile = buildKitProfile({ key: 'Keqing', kitData: kit });
    assert(profile.fieldRole === 'On-Field Carry', `Expected On-Field Carry, got ${profile.fieldRole}`);
    assert(profile.infusionType === 'na_ca', `Expected na_ca infusionType, got ${profile.infusionType}`);
    const prio = deriveTalentPriority(profile);
    assert(prio.tiers.auto === 'high', `Expected Normal (A) tier high, got ${prio.tiers.auto}`);
    assert(!/mora sink/i.test(prio.lowValueNote), `Should not call NA a Mora sink: ${prio.lowValueNote}`);
    const { bestOverall: recs } = recommendWeapons(profile, weaponsIndex, []);
    return verifyFourUniqueBuckets(profile, recs);
  });

  await runCase('Ganyu: ATK+CRIT carry (Ice Lotus Inherited HP ignored)', async () => {
    const kit = getCharacterKit('Ganyu');
    assert(kit, 'Ganyu kit failed to load');
    const profile = buildKitProfile({ key: 'Ganyu', kitData: kit });
    assert(profile.primaryScaling === 'ATK', `Expected ATK primaryScaling, got ${profile.primaryScaling}`);
    const { bestOverall: recs } = recommendWeapons(profile, weaponsIndex, []);
    const bisDps = recs.find((w) => w.tierLabel === 'BiS DPS');
    const accDps = recs.find((w) => w.tierLabel === 'Accessible DPS');
    assert(!/HP%/i.test(bisDps?.substat || ''), `HP% bow recommended as BiS DPS for Ganyu: ${bisDps?.name}`);
    assert(
      bisDps?.name === "Amos' Bow" || bisDps?.name === 'Polar Star',
      `Expected BiS DPS Amos' Bow or Polar Star for Ganyu, got ${bisDps?.name}`
    );
    assert(
      accDps?.name === 'Hamayumi' || accDps?.name === 'Prototype Crescent',
      `Expected Accessible DPS Hamayumi or Prototype Crescent for Ganyu, got ${accDps?.name}`
    );
    assert(profile.flexModes.some((m) => m.id === 'On-Field Carry'), 'Ganyu flexModes missing On-Field Carry');
    assert(profile.flexModes.some((m) => m.id === 'Off-Field Sub-DPS'), 'Ganyu flexModes missing Off-Field Sub-DPS');
    return verifyFourUniqueBuckets(profile, recs);
  });

  await runCase('Alhaitham: EM scaling + owned Light of Foliar Incision detected', async () => {
    const kit = getCharacterKit('Alhaitham');
    assert(kit, 'Alhaitham kit failed to load');
    const profile = buildKitProfile({ key: 'Alhaitham', kitData: kit });
    assert(profile.fieldRole === 'On-Field Carry', `Expected On-Field Carry, got ${profile.fieldRole}`);
    assert(profile.scalingStats.includes('EM'), `Expected EM in scalingStats, got ${profile.scalingStats.join(', ')}`);
    const armory = [{ key: 'LightOfFoliarIncision', level: 90, refinement: 1, location: 'Clorinde' }];
    const { bestOverall: recs, inArmory } = recommendWeapons(profile, weaponsIndex, armory);
    const lofi = recs.find((w) => w.key === 'LightOfFoliarIncision');
    assert(lofi && lofi.ownedMatch, 'Light of Foliar Incision missing or not marked owned in bestOverall');
    assert(inArmory.some((w) => w.key === 'LightOfFoliarIncision'), 'Light of Foliar Incision missing from inArmory');
    return verifyFourUniqueBuckets(profile, recs);
  });

  await runCase('Xingqiu: Off-Field Sub-DPS + 80-cost ER Sacrificial Sword', async () => {
    const kit = getCharacterKit('Xingqiu');
    assert(kit, 'Xingqiu kit failed to load');
    const profile = buildKitProfile({ key: 'Xingqiu', kitData: kit });
    assert(profile.fieldRole === 'Off-Field Sub-DPS', `Expected Off-Field Sub-DPS, got ${profile.fieldRole}`);
    const { bestOverall: recs } = recommendWeapons(profile, weaponsIndex, []);
    const bisSup = recs.find((w) => w.tierLabel === 'BiS Support');
    const bisDps = recs.find((w) => w.tierLabel === 'BiS DPS');
    assert(bisSup?.name === 'Sacrificial Sword', `Expected BiS Support Sacrificial Sword, got ${bisSup?.name}`);
    assert(
      bisDps?.name === 'Mistsplitter Reforged' || bisDps?.name === 'Primordial Jade Cutter',
      `Expected BiS DPS Mistsplitter Reforged or Primordial Jade Cutter, got ${bisDps?.name}`
    );
    return verifyFourUniqueBuckets(profile, recs);
  });

  await runCase('Kazuha: Quickswap Support default + Teams Lab forcedRole override', async () => {
    const kit = getCharacterKit('KaedeharaKazuha');
    assert(kit, 'Kazuha kit failed to load');
    const defProfile = buildKitProfile({ key: 'KaedeharaKazuha', kitData: kit, constellation: 0 });
    assert(defProfile.fieldRole === 'Quickswap Support', `Expected Quickswap Support, got ${defProfile.fieldRole}`);
    assert(defProfile.functionTags.includes('Crowd Control'), 'Missing Crowd Control tag');
    const forcedEval = evaluateBuild(
      { key: 'KaedeharaKazuha', kitData: kit, constellation: 6 },
      { forcedRole: 'On-Field Carry' }
    );
    assert(forcedEval.profile.fieldRole === 'On-Field Carry', 'forcedRole override failed');
    assert(Array.isArray(forcedEval.weapons?.bestOverall) && forcedEval.weapons.bestOverall.length === 4, 'evaluateBuild forcedRole missing weapons.bestOverall');
    const { bestOverall: recs } = recommendWeapons(defProfile, weaponsIndex, []);
    return verifyFourUniqueBuckets(defProfile, recs);
  });

  await runCase('Xilonen: Quickswap Support >= 2 PHEC, On-Field Carry < 2 PHEC', async () => {
    const kit = getCharacterKit('Xilonen');
    assert(kit, 'Xilonen kit failed to load');
    const phecTeam = [{ characterKey: 'Neuvillette' }, { characterKey: 'Furina' }, { characterKey: 'Xilonen' }];
    const geoTeam = [{ characterKey: 'Navia' }, { characterKey: 'Zhongli' }, { characterKey: 'Xilonen' }];
    assert(resolveMemberTeamRole('Xilonen', kit, 0, phecTeam) === 'Quickswap Support', 'Expected Quickswap Support in >= 2 PHEC');
    assert(resolveMemberTeamRole('Xilonen', kit, 0, geoTeam) === 'On-Field Carry', 'Expected On-Field Carry in < 2 PHEC');
    const profile = buildKitProfile({ key: 'Xilonen', kitData: kit });
    const { bestOverall: recs } = recommendWeapons(profile, weaponsIndex, []);
    const bisSup = recs.find((w) => w.tierLabel === 'BiS Support');
    const accSup = recs.find((w) => w.tierLabel === 'Accessible Support');
    assert(bisSup?.name === 'Peak Patrol Song', `Expected BiS Support Peak Patrol Song for Xilonen, got ${bisSup?.name}`);
    assert(
      accSup?.name === 'Favonius Sword' || accSup?.name === 'Flute of Ezpitzal',
      `Expected Accessible Support Favonius Sword or Flute of Ezpitzal for Xilonen, got ${accSup?.name}`
    );
    return verifyFourUniqueBuckets(profile, recs);
  });

  await runCase('Kokomi: Team Healer + Critkomi flexMode', async () => {
    const kit = getCharacterKit('SangonomiyaKokomi');
    assert(kit, 'Kokomi kit failed to load');
    const profile = buildKitProfile({ key: 'SangonomiyaKokomi', kitData: kit });
    assert(profile.functionTags.includes('Team Healer'), `Missing Team Healer: ${profile.functionTags.join(', ')}`);
    assert(profile.flexModes.some((m) => /Critkomi/i.test(m.id)), 'Missing Critkomi flexMode');
    const { bestOverall: recs } = recommendWeapons(profile, weaponsIndex, []);
    return verifyFourUniqueBuckets(profile, recs);
  });

  await runCase('Eula & Hu Tao: On-Field Carry, no self-trait leakage', async () => {
    const eulaKit = getCharacterKit('Eula');
    const hutaoKit = getCharacterKit('HuTao');
    assert(eulaKit && hutaoKit, 'Eula or HuTao kit failed to load');
    const eula = buildKitProfile({ key: 'Eula', kitData: eulaKit });
    const hutao = buildKitProfile({ key: 'HuTao', kitData: hutaoKit });
    assert(eula.fieldRole === 'On-Field Carry', `Eula misclassified as ${eula.fieldRole}`);
    assert(hutao.fieldRole === 'On-Field Carry', `Hu Tao misclassified as ${hutao.fieldRole}`);
    assert(!hutao.functionTags.includes('Team IR'), 'Hu Tao self-IR leaked into functionTags');
    return `Eula: ${eula.fieldRole} | Hu Tao: ${hutao.fieldRole}`;
  });

  await runCase('Noelle: Accessible DPS Whiteblind (Talking Stick gated)', async () => {
    const kit = getCharacterKit('Noelle');
    assert(kit, 'Noelle kit failed to load');
    const profile = buildKitProfile({ key: 'Noelle', kitData: kit });
    const { bestOverall: recs } = recommendWeapons(profile, weaponsIndex, []);
    const accDps = recs.find((w) => w.tierLabel === 'Accessible DPS');
    assert(accDps?.name === 'Whiteblind', `Expected Accessible DPS Whiteblind for Noelle, got ${accDps?.name}`);
    return verifyFourUniqueBuckets(profile, recs);
  });

  await runCase('Beidou & Dehya: Off-field / HP claymores (no CA-locked Teaspoon on Beidou)', async () => {
    const beidouKit = getCharacterKit('Beidou');
    const dehyaKit = getCharacterKit('Dehya');
    assert(beidouKit && dehyaKit, 'Beidou or Dehya kit failed to load');
    const beidou = buildKitProfile({ key: 'Beidou', kitData: beidouKit });
    const dehya = buildKitProfile({ key: 'Dehya', kitData: dehyaKit });
    const { bestOverall: beidouRecs } = recommendWeapons(beidou, weaponsIndex, []);
    const { bestOverall: dehyaRecs } = recommendWeapons(dehya, weaponsIndex, []);
    const beidouBis = beidouRecs.find((w) => w.tierLabel === 'BiS DPS');
    const dehyaBis = dehyaRecs.find((w) => w.tierLabel === 'BiS DPS');
    assert(beidouBis?.name !== 'A Teaspoon of Transcendence', `CA-locked Teaspoon leaked onto Beidou BiS DPS`);
    assert(dehyaBis?.name === 'Beacon of the Reed Sea', `Expected Beacon of the Reed Sea for Dehya BiS DPS, got ${dehyaBis?.name}`);
    return `Beidou BiS: ${beidouBis?.name} | Dehya BiS: ${dehyaBis?.name}`;
  });

  await runCase('Durin & Vodyanitsa: Best Overall 4-bucket invariants & 5★ Catalyst over Solar Pearl', async () => {
    const durinKit = getCharacterKit('Durin');
    const vodKit = getCharacterKit('Vodyanitsa');
    assert(durinKit || vodKit, 'Neither Durin nor Vodyanitsa kit hydrated from live/snapshot');
    const out = [];
    if (durinKit) {
      const dp = buildKitProfile({ key: 'Durin', kitData: durinKit });
      const { bestOverall: dRecs } = recommendWeapons(dp, weaponsIndex, []);
      out.push(`Durin: ${verifyFourUniqueBuckets(dp, dRecs)}`);
    }
    if (vodKit) {
      const vp = buildKitProfile({ key: 'Vodyanitsa', kitData: vodKit });
      const { bestOverall: vRecs } = recommendWeapons(vp, weaponsIndex, []);
      const vBisDps = vRecs.find((w) => w.tierLabel === 'BiS DPS');
      assert(
        vBisDps?.rarity === 5 && vBisDps?.name !== 'Solar Pearl',
        `Expected 5★ BiS DPS over Solar Pearl for Vodyanitsa, got ${vBisDps?.name}`
      );
      out.push(`Vodyanitsa: ${verifyFourUniqueBuckets(vp, vRecs)}`);
    }
    return out.join(' || ');
  });

  return results;
}
