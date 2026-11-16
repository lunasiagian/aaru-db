import {
  ensureCharacterKitAndStats,
  getAllCharacterKeys,
  getCharacterKit,
  getWeaponsIndex,
  loadCatalog
} from '../js/catalog.js?v=20261115ag';
import {
  analyzeCharacterKit,
  buildKitProfile,
  classifyBurstCadence,
  computeSubstatWeights,
  deriveTalentPriority,
  evaluateBuild,
  evaluateBuildDiagnostics,
  evaluateErComfort,
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
    const slots = recs.visibleSlots || recs;
    assert(slots.length >= 2 && slots.length <= 4, `Expected 2-4 weapon slots, got ${slots.length}`);
    assert(!slots.some((w) => w.acquisition === 'event_limited'), `event_limited weapon leaked into bestOverall: ${slots.map((w) => w.name).join(', ')}`);
    const keys = new Set(slots.map((w) => w.key));
    assert(keys.size === slots.length, `Duplicate weapon keys in recommendations: ${slots.map((w) => w.key).join(', ')}`);
    const tiers = new Set(slots.map((w) => w.tierLabel));
    assert(tiers.size === slots.length, `Duplicate tier labels: ${slots.map((w) => w.tierLabel).join(', ')}`);
    return `${profile.fieldRole} · [${profile.scalingStats.join(', ')}] · ${slots.map((w) => `${w.tierLabel}: ${w.name}`).join(' | ')}`;
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
    const bisDps = recs.bisDps || recs.find((w) => w.tierLabel === 'BiS DPS');
    const accSup = recs.accessibleSupport || recs.find((w) => w.tierLabel === 'Accessible Support');
    const bisSup = recs.bisSupport || recs.find((w) => w.tierLabel === 'BiS Support');
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
    const visible = recs.visibleSlots || recs;
    assert(
      !visible.some((w) => /Support/i.test(w.tierLabel)),
      `Pure On-Field Carry Alhaitham should not show Support tags: ${visible.map((w) => w.tierLabel).join(', ')}`
    );
    const lofi = visible.find((w) => w.key === 'LightOfFoliarIncision');
    assert(lofi && lofi.tierLabel === 'BiS DPS' && lofi.isSignature && lofi.ownedMatch, 'Light of Foliar Incision missing as BiS DPS Signature');
    assert(visible.some((w) => w.tierLabel === 'Accessible DPS'), 'Missing Accessible DPS in Alhaitham visibleSlots');
    assert(visible.some((w) => w.tierLabel === 'ER / Comfort'), 'Missing ER / Comfort in 70-cost Alhaitham visibleSlots');
    assert(inArmory.some((w) => w.key === 'LightOfFoliarIncision'), 'Light of Foliar Incision missing from inArmory');
    return verifyFourUniqueBuckets(profile, recs);
  });

  await runCase('Xingqiu: Off-Field Sub-DPS + 80-cost ER Sacrificial Sword', async () => {
    const kit = getCharacterKit('Xingqiu');
    assert(kit, 'Xingqiu kit failed to load');
    const profile = buildKitProfile({ key: 'Xingqiu', kitData: kit });
    assert(profile.fieldRole === 'Off-Field Sub-DPS', `Expected Off-Field Sub-DPS, got ${profile.fieldRole}`);
    const { bestOverall: recs } = recommendWeapons(profile, weaponsIndex, []);
    const bisSup = recs.bisSupport || recs.find((w) => w.tierLabel === 'BiS Support');
    const bisDps = recs.bisDps || recs.find((w) => w.tierLabel === 'BiS DPS');
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
    assert(
      Array.isArray(forcedEval.weapons?.bestOverall) && forcedEval.weapons.bestOverall.length >= 2,
      'evaluateBuild forcedRole missing weapons.bestOverall'
    );
    const { bestOverall: recs } = recommendWeapons(defProfile, weaponsIndex, []);
    return verifyFourUniqueBuckets(defProfile, recs);
  });

  await runCase('Xilonen: Quickswap Support >= 2 PHEC, On-Field Carry < 2 PHEC', async () => {
    const kit = getCharacterKit('Xilonen');
    assert(kit, 'Xilonen kit failed to load');
    const phecTeam = [{ characterKey: 'Neuvillette' }, { characterKey: 'Furina' }, { characterKey: 'Xilonen' }];
    const geoTeam = [{ characterKey: 'Navia' }, { characterKey: 'Zhongli' }, { characterKey: 'Xilonen' }];
    assert(resolveMemberTeamRole('Xilonen', kit, 0, phecTeam) === 'Quickswap Support', 'Expected Quickswap Support in >= 2 PHEC');
    const geoRole = resolveMemberTeamRole('Xilonen', kit, 0, geoTeam);
    assert(geoRole === 'On-Field Carry', 'Expected On-Field Carry in < 2 PHEC');
    const geoEval = evaluateBuild({ key: 'Xilonen', kitData: kit }, { forcedRole: geoRole });
    assert(geoEval.profile.fieldRole === 'On-Field Carry', 'Expected Xilonen geoEval fieldRole On-Field Carry');
    assert(geoEval.weapons.bestOverall.bisDps, 'Expected bisDps for Xilonen < 2 PHEC On-Field Carry');
    const profile = buildKitProfile({ key: 'Xilonen', kitData: kit });
    const { bestOverall: recs } = recommendWeapons(profile, weaponsIndex, []);
    const bisSup = recs.bisSupport || recs.find((w) => w.tierLabel === 'BiS Support');
    const accSup = recs.accessibleSupport || recs.find((w) => w.tierLabel === 'Accessible Support');
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
    const beidouBis = beidouRecs.bisDps || beidouRecs.find((w) => w.tierLabel === 'BiS DPS');
    const dehyaBis = dehyaRecs.bisDps || dehyaRecs.find((w) => w.tierLabel === 'BiS DPS');
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
      const dAccDps = dRecs.accessibleDps || dRecs.find((w) => w.tierLabel === 'Accessible DPS');
      assert(
        dAccDps?.name !== "Heretic's Molten Blade",
        `Paywalled BP sword Heretic's Molten Blade leaked into Durin Accessible DPS`
      );
      out.push(`Durin: ${verifyFourUniqueBuckets(dp, dRecs)}`);
    }
    if (vodKit) {
      const vp = buildKitProfile({ key: 'Vodyanitsa', kitData: vodKit });
      const { bestOverall: vRecs } = recommendWeapons(vp, weaponsIndex, []);
      const vBisDps = vRecs.bisDps || vRecs.find((w) => w.tierLabel === 'BiS DPS');
      assert(
        vBisDps?.rarity === 5 && vBisDps?.name !== 'Solar Pearl',
        `Expected 5★ BiS DPS over Solar Pearl for Vodyanitsa, got ${vBisDps?.name}`
      );
      out.push(`Vodyanitsa: ${verifyFourUniqueBuckets(vp, vRecs)}`);
    }
    return out.join(' || ');
  });

  await runCase('wRV%: Non-Crit Kokomi assigns 0.0 to CRIT and 1.0 to HP%/ER%', async () => {
    const kit = getCharacterKit('SangonomiyaKokomi');
    assert(kit, 'Kokomi kit failed to load');
    const analysis = analyzeCharacterKit('SangonomiyaKokomi', kit);
    const weights = computeSubstatWeights(analysis, 'PrototypeAmber', []);
    assert(weights.critRate_ === 0 && weights.critDMG_ === 0, `Expected 0.0 CRIT weights, got CR=${weights.critRate_}, CD=${weights.critDMG_}`);
    assert(weights.hp_ === 1.0 && weights.enerRech_ === 1.0, `Expected 1.0 HP%/ER% weights, got HP%=${weights.hp_}, ER%=${weights.enerRech_}`);
    return `CR=${weights.critRate_}, CD=${weights.critDMG_}, HP%=${weights.hp_}, ER%=${weights.enerRech_}`;
  });

  await runCase('Diagnostics: 4pc Marechaussee Hunter 72% sheet CR triggers crit-overcap (108%)', async () => {
    const artifacts = [
      { setKey: 'MarechausseeHunter' },
      { setKey: 'MarechausseeHunter' },
      { setKey: 'MarechausseeHunter' },
      { setKey: 'MarechausseeHunter' }
    ];
    const diags = evaluateBuildDiagnostics({ critRate: 72 }, artifacts, { isNonCrit: false });
    const over = diags.find((d) => d.id === 'crit-overcap');
    assert(over && over.effectiveCr === 108 && over.tone === 'coral', `Expected crit-overcap at 108% (coral), got ${JSON.stringify(diags)}`);
    return over.message;
  });

  await runCase('ER Diagnostics: Team battery covers Abyss while flagging solo Stygian/Theatre shortfall', async () => {
    const kit = getCharacterKit('Xingqiu');
    const profile = buildKitProfile({ key: 'Xingqiu', kitData: kit });
    const teams = [
      {
        id: 't1',
        name: 'Double Hydro',
        members: [{ characterKey: 'Xingqiu' }, { characterKey: 'Yelan', weaponKey: 'FavoniusWarbow' }]
      }
    ];
    const erReport = evaluateErComfort(
      { key: 'Xingqiu', meta: { element: 'Hydro' }, notes: 'Stygian Onslaught' },
      { er: 175 },
      teams,
      [],
      kit,
      profile.analysis
    );
    assert(erReport.erStatus === 'warn' && erReport.soloDelta < 0, `Expected warn & negative soloDelta, got ${JSON.stringify(erReport)}`);
    assert(/Stygian\s*\/\s*Theatre/i.test(erReport.summary), `Expected Stygian/Theatre shortfall in summary: ${erReport.summary}`);
    return erReport.summary;
  });

  await runCase('Burst Cadence: Yae Miko (C1, 100% ER) -> skill-core, optional & 0-Energy immune', async () => {
    await ensureCharacterKitAndStats('YaeMiko').catch(() => null);
    const kit = getCharacterKit('YaeMiko');
    assert(kit, 'Yae Miko kit failed to load');
    const yaeChar = { key: 'YaeMiko', constellation: 1, talent: { auto: 6, skill: 10, burst: 8 }, meta: { element: 'Electro' } };
    const analysis = analyzeCharacterKit('YaeMiko', kit, yaeChar.talent, 1);
    const cadence = classifyBurstCadence(yaeChar, kit, analysis, []);
    assert(cadence.mode === 'skill-core', `Expected skill-core mode, got ${cadence.mode}`);
    assert(cadence.burstDependency === 'optional' && cadence.zeroEnergyImmune === true, `Expected optional + zeroEnergyImmune, got ${JSON.stringify(cadence)}`);
    const erReport = evaluateErComfort(yaeChar, { er: 100 }, [], [], kit, analysis);
    assert(erReport.erStatus === 'ok', `Expected erStatus ok (not LOW ER), got ${erReport.erStatus}: ${erReport.summary}`);
    return erReport.summary;
  });

  await runCase('Support Utility Weighting: Gorou -> Favonius Warbow BiS, Venti -> Elegy for the End BiS', async () => {
    await Promise.all([
      ensureCharacterKitAndStats('Gorou').catch(() => null),
      ensureCharacterKitAndStats('Venti').catch(() => null)
    ]);
    const gorouKit = getCharacterKit('Gorou');
    const ventiKit = getCharacterKit('Venti');
    assert(gorouKit && ventiKit, 'Gorou or Venti kit failed to load');

    const gorouRes = evaluateBuild({ key: 'Gorou', kitData: gorouKit });
    const gorouBisSup = gorouRes.weapons?.bestOverall?.bisSupport?.name;
    assert(gorouBisSup === 'Favonius Warbow', `Expected Favonius Warbow BiS Support for Gorou, got ${gorouBisSup}`);

    const ventiRes = evaluateBuild({ key: 'Venti', kitData: ventiKit });
    const ventiBisSup = ventiRes.weapons?.bestOverall?.bisSupport?.name;
    assert(ventiBisSup === 'Elegy for the End', `Expected Elegy for the End BiS Support for Venti, got ${ventiBisSup}`);

    return `Gorou BiS Support: ${gorouBisSup} | Venti BiS Support: ${ventiBisSup}`;
  });

  await runCase('Deterministic F2P Accessible Gate + Notable 4★ Gacha: Fischl', async () => {
    await ensureCharacterKitAndStats('Fischl').catch(() => null);
    const fischlKit = getCharacterKit('Fischl');
    assert(fischlKit, 'Fischl kit failed to load');

    const res = evaluateBuild(
      { key: 'Fischl', kitData: fischlKit },
      { armory: [{ key: 'TheStringless', level: 90, refinement: 5 }] }
    );
    const { bestOverall, inArmory } = res.weapons;
    const stringlessInAcc = bestOverall.accessibleDps?.name === 'The Stringless';
    const stringlessInNotable =
      Array.isArray(bestOverall.notableGacha4) && bestOverall.notableGacha4.some((w) => w.name === 'The Stringless');
    assert(
      bestOverall.accessibleDps?.acquisition === 'f2p_craft_fish' || bestOverall.accessibleDps?.acquisition === 'gacha_4',
      `Expected f2p_craft_fish or gacha_4 Accessible DPS for Fischl, got ${bestOverall.accessibleDps?.name} (${bestOverall.accessibleDps?.acquisition})`
    );
    assert(
      stringlessInAcc || stringlessInNotable,
      `Expected The Stringless in Accessible DPS or notableGacha4, got Acc=${bestOverall.accessibleDps?.name}, Notable=${JSON.stringify(bestOverall.notableGacha4?.map((w) => w.name))}`
    );
    assert(
      inArmory.visibleSlots?.[0]?.name === 'The Stringless' && inArmory.visibleSlots?.[0]?.tierLabel === 'Best Owned DPS',
      `Expected R5 The Stringless as Best Owned DPS in Armory, got ${inArmory.visibleSlots?.[0]?.name} (${inArmory.visibleSlots?.[0]?.tierLabel})`
    );
    return `Accessible DPS: ${bestOverall.accessibleDps.name} | Notable 4★ Gacha: ${(bestOverall.notableGacha4 || []).map((w) => w.name).join(', ') || 'none'} | Armory #1: ${inArmory.visibleSlots[0].name}`;
  });

  await runCase('Build-Aware Stat-Cap Compensation (EM scaler with ER covered)', async () => {
    await Promise.all([
      ensureCharacterKitAndStats('Lauma').catch(() => null),
      ensureCharacterKitAndStats('Nahida').catch(() => null)
    ]);
    const targetKey = getCharacterKit('Lauma') ? 'Lauma' : 'Nahida';
    const kit = getCharacterKit(targetKey);
    assert(kit, `Failed to load kit for ${targetKey}`);

    const res = evaluateBuild(
      { key: targetKey, kitData: kit },
      {
        hasEquippedArtifacts: true,
        erReport: { currentEr: 195, erDelta: 20, soloDelta: 5, hasEndgameFlag: false },
        combatStats: { em: 620, er: 195 },
        teamCaps: { buffCap: { statKey: 'em', statLabel: 'EM', gap: 180 } }
      }
    );
    const recs = res.weapons?.bestOverall?.visibleSlots || res.weapons?.bestOverall || [];
    const topWep = recs[0];
    assert(topWep, `Expected top weapon for ${targetKey}, got none`);
    const isEmTop =
      /mastery|em/i.test(topWep.substat || '') || (topWep.mechanicTags || []).includes('em_scale');
    assert(
      isEmTop,
      `Expected EM weapon to outrank ER weapons for ${targetKey} when ER is covered (+20%) & EM gap is +180, got ${topWep.name} (${topWep.substat})`
    );
    return `${targetKey} Top Rec: ${topWep.name} (${topWep.substat}) — ${topWep.reason}`;
  });

  const fuzzRows = await runRandomFuzzTests(5, (partialFuzz) => onProgress([...results, ...partialFuzz]));
  return [...results, ...fuzzRows];
}

export async function runRandomFuzzTests(count = 5, onProgress = () => {}) {
  await loadCatalog();
  const weaponsIndex = getWeaponsIndex();
  const fixedSet = new Set(TEST_KEYS.map((k) => k.toLowerCase()));
  const pool = getAllCharacterKeys().filter(
    (k) => !fixedSet.has(k.toLowerCase()) && !/^(traveler|manekin|aloy)/i.test(k)
  );
  const picked = [...pool].sort(() => Math.random() - 0.5).slice(0, count);
  await Promise.all(picked.map((k) => ensureCharacterKitAndStats(k).catch(() => null)));

  const fuzzResults = [];
  for (const k of picked) {
    const t0 = performance.now();
    try {
      const kitData = getCharacterKit(k);
      assert(kitData, `Kit failed to load for ${k}`);
      const res = evaluateBuild({ key: k, kitData });
      const { profile, talentPriority, weapons } = res;
      const recs = weapons?.bestOverall?.visibleSlots || weapons?.bestOverall || [];
      assert(recs.length >= 2 && recs.length <= 4, `Expected 2-4 weapon slots, got ${recs.length}`);
      assert(new Set(recs.map((w) => w.key)).size === recs.length, `Duplicate weapon keys: ${recs.map((w) => w.name).join(', ')}`);
      assert(
        !recs.some((w) => w.acquisition === 'event_limited' || w.acquisition === 'platform_exclusive'),
        `Unobtainable weapon in bestOverall: ${recs.map((w) => w.name).join(', ')}`
      );
      for (const acc of recs.filter((w) => w.tierLabel.startsWith('Accessible'))) {
        assert(
          acc.acquisition === 'f2p_craft_fish' || acc.acquisition === 'gacha_4',
          `Non-accessible weapon ${acc.name} (${acc.acquisition}) in ${acc.tierLabel}`
        );
      }
      if (profile.burstCost <= 40) {
        assert(!recs.some((w) => /40-cost Burst ER/i.test(w.reason || '')), 'Lying 40-cost ER blurb');
      }
      fuzzResults.push({
        name: `[Fuzz] ${profile.name}`,
        ok: true,
        ms: Math.round(performance.now() - t0),
        detail: `${profile.fieldRole} · [${profile.scalingStats.join(', ')}] · ${talentPriority.orderText} · ${recs.map((w) => `${w.tierLabel}: ${w.name}`).join(' | ')}`
      });
    } catch (err) {
      fuzzResults.push({
        name: `[Fuzz] ${k}`,
        ok: false,
        ms: Math.round(performance.now() - t0),
        detail: err.message
      });
    }
    onProgress([...fuzzResults]);
  }
  return fuzzResults;
}
