import {
  ensureCharacterKitAndStats,
  getCharacterKit,
  getWeaponsIndex,
  loadCatalog
} from '../js/catalog.js?v=20261115ag';
import {
  buildKitProfile,
  deriveTalentPriority,
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
  'HuTao'
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
    const recs = recommendWeapons(profile, weaponsIndex, []);
    const bisDps = recs.find((w) => w.tierLabel === 'BiS DPS');
    const accSup = recs.find((w) => w.tierLabel === 'Accessible Support');
    const bisSup = recs.find((w) => w.tierLabel === 'BiS Support');
    assert(bisDps?.name === 'Staff of Homa', `Expected BiS DPS Staff of Homa, got ${bisDps?.name}`);
    assert(
      accSup?.name === 'Favonius Lance' || accSup?.name === 'Black Tassel',
      `Expected Accessible Support Favonius Lance or Black Tassel, got ${accSup?.name}`
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
    const recs = recommendWeapons(profile, weaponsIndex, []);
    return verifyFourUniqueBuckets(profile, recs);
  });

  await runCase('Ganyu: ATK+CRIT carry (Ice Lotus Inherited HP ignored)', async () => {
    const kit = getCharacterKit('Ganyu');
    assert(kit, 'Ganyu kit failed to load');
    const profile = buildKitProfile({ key: 'Ganyu', kitData: kit });
    assert(profile.primaryScaling === 'ATK', `Expected ATK primaryScaling, got ${profile.primaryScaling}`);
    const recs = recommendWeapons(profile, weaponsIndex, []);
    const bisDps = recs.find((w) => w.tierLabel === 'BiS DPS');
    assert(!/HP%/i.test(bisDps?.substat || ''), `HP% bow recommended as BiS DPS for Ganyu: ${bisDps?.name}`);
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
    const recs = recommendWeapons(profile, weaponsIndex, armory);
    const lofi = recs.find((w) => w.key === 'LightOfFoliarIncision');
    assert(lofi && lofi.ownedMatch, 'Light of Foliar Incision missing or not marked owned');
    return verifyFourUniqueBuckets(profile, recs);
  });

  await runCase('Xingqiu: Off-Field Sub-DPS + 80-cost ER Sacrificial Sword', async () => {
    const kit = getCharacterKit('Xingqiu');
    assert(kit, 'Xingqiu kit failed to load');
    const profile = buildKitProfile({ key: 'Xingqiu', kitData: kit });
    assert(profile.fieldRole === 'Off-Field Sub-DPS', `Expected Off-Field Sub-DPS, got ${profile.fieldRole}`);
    const recs = recommendWeapons(profile, weaponsIndex, []);
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
    const forcedProfile = buildKitProfile(
      { key: 'KaedeharaKazuha', kitData: kit, constellation: 6 },
      { forcedRole: 'On-Field Carry' }
    );
    assert(forcedProfile.fieldRole === 'On-Field Carry', 'forcedRole override failed');
    const recs = recommendWeapons(defProfile, weaponsIndex, []);
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
    const recs = recommendWeapons(profile, weaponsIndex, []);
    return verifyFourUniqueBuckets(profile, recs);
  });

  await runCase('Kokomi: Team Healer + Critkomi flexMode', async () => {
    const kit = getCharacterKit('SangonomiyaKokomi');
    assert(kit, 'Kokomi kit failed to load');
    const profile = buildKitProfile({ key: 'SangonomiyaKokomi', kitData: kit });
    assert(profile.functionTags.includes('Team Healer'), `Missing Team Healer: ${profile.functionTags.join(', ')}`);
    assert(profile.flexModes.some((m) => /Critkomi/i.test(m.id)), 'Missing Critkomi flexMode');
    const recs = recommendWeapons(profile, weaponsIndex, []);
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

  return results;
}
