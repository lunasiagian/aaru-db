function createChecklistTemplate(isSunny = false) {
  return {
    daily: [
      { id: 'commissions', label: 'Daily Commissions (4/4)', done: !isSunny },
      { id: 'resin', label: 'Spend Original Resin (160/200)', done: false },
      { id: 'expeditions', label: 'Claim & Dispatch Expeditions', done: true },
      { id: 'realm', label: 'Serenitea Pot Realm Currency & Friendship', done: !isSunny }
    ],
    weekly: [
      { id: 'bosses', label: 'Weekly Trounce Domains (3/3 Discounted)', done: false },
      { id: 'transformer', label: 'Parametric Transformer', done: true },
      { id: 'snezhnaya_rep', label: 'Weekly Snezhnaya: City Reputation Bounties & Requests', done: false, tag: 'SNEZHNAYA' },
      { id: 'snezhnaya_fatui', label: 'Weekly Snezhnaya: Stygian Onslaught / Frostmoon Trial', done: !isSunny, tag: 'SNEZHNAYA' },
      { id: 'theatre', label: 'Imaginarium Theatre Monthly/Weekly Cast Check', done: false, tag: 'THEATRE' }
    ]
  };
}

export const MOCK_ACCOUNTS = {
  almondeluna: {
    user: 'almondeluna',
    displayName: 'Luna',
    wallet: {
      primogems: 14820,
      intertwinedFates: 18,
      acquaintFates: 7,
      mora: 13221000,
      resin: 142,
      condensedResin: 3
    },
    inventory: {
      Mora: { count: 13221000, target: 5000000, category: 'EXP & Currency' },
      HerosWit: { count: 521, target: 420, category: 'EXP & Currency' },
      AdventurersExperience: { count: 385, target: 200, category: 'EXP & Currency' },
      WanderersAdvice: { count: 140, target: 100, category: 'EXP & Currency' },
      FragileResin: { count: 24, target: 10, category: 'EXP & Currency' },
      CrownOfInsight: { count: 7, target: 3, category: 'Talent Books' },
      PhilosophiesOfFortitude: { count: 14, target: 38, category: 'Talent Books' },
      GuideToFortitude: { count: 28, target: 42, category: 'Talent Books' },
      TeachingsOfFortitude: { count: 32, target: 18, category: 'Talent Books' },
      PhilosophiesOfFreedom: { count: 22, target: 38, category: 'Talent Books' },
      GuideToFreedom: { count: 35, target: 42, category: 'Talent Books' },
      TeachingsOfFreedom: { count: 19, target: 18, category: 'Talent Books' },
      PhilosophiesOfGold: { count: 44, target: 30, category: 'Talent Books' },
      PhilosophiesOfJustice: { count: 18, target: 30, category: 'Talent Books' },
      PhilosophiesOfContention: { count: 11, target: 38, category: 'Talent Books' },
      WaterThatFailedToTranscend: { count: 18, target: 46, category: 'Boss Drops' },
      HurricaneSeed: { count: 24, target: 46, category: 'Boss Drops' },
      BasaltPillar: { count: 12, target: 20, category: 'Boss Drops' },
      TalismanOfTheEnigmaticLand: { count: 9, target: 46, category: 'Boss Drops' },
      FadingCandle: { count: 6, target: 18, category: 'Weekly Boss' },
      TailOfBoreas: { count: 14, target: 12, category: 'Weekly Boss' },
      TuskOfMonocerosCaeli: { count: 9, target: 6, category: 'Weekly Boss' },
      ErodedHorn: { count: 4, target: 12, category: 'Weekly Boss' },
      LakelightLily: { count: 42, target: 168, category: 'Local Specialties' },
      Wolfhook: { count: 95, target: 168, category: 'Local Specialties' },
      CorLapis: { count: 118, target: 60, category: 'Local Specialties' },
      QuenepaBerry: { count: 54, target: 168, category: 'Local Specialties' },
      UnblemishedLunarIron: { count: 11, target: 24, category: 'Weapon Mats' }
    },
    characters: [
      { key: 'Zhongli', level: 95, constellation: 5, ascension: 6, talent: { auto: 10, skill: 10, burst: 10 }, status: 'Built', swapTag: 'Stygian Onslaught' },
      { key: 'RaidenShogun', level: 90, constellation: 0, ascension: 6, talent: { auto: 8, skill: 8, burst: 10 }, status: 'Built', swapTag: 'Imaginarium Theatre' },
      { key: 'Venti', level: 90, constellation: 0, ascension: 6, talent: { auto: 1, skill: 8, burst: 8 }, status: 'Built', swapTag: 'Imaginarium Theatre' },
      { key: 'KamisatoAyato', level: 90, constellation: 0, ascension: 6, talent: { auto: 9, skill: 10, burst: 10 }, status: 'Built', swapTag: '' },
      { key: 'KaedeharaKazuha', level: 90, constellation: 0, ascension: 6, talent: { auto: 7, skill: 10, burst: 10 }, status: 'Built', swapTag: 'Stygian Onslaught' },
      { key: 'Furina', level: 90, constellation: 0, ascension: 6, talent: { auto: 1, skill: 10, burst: 10 }, status: 'Built', swapTag: 'Stygian Onslaught' },
      { key: 'Neuvillette', level: 90, constellation: 0, ascension: 6, talent: { auto: 10, skill: 7, burst: 10 }, status: 'Built', swapTag: '' },
      { key: 'Nahida', level: 90, constellation: 1, ascension: 6, talent: { auto: 8, skill: 8, burst: 8 }, status: 'Built', swapTag: 'Imaginarium Theatre' },
      { key: 'Yelan', level: 90, constellation: 0, ascension: 6, talent: { auto: 8, skill: 10, burst: 10 }, status: 'Built', swapTag: '' },
      { key: 'HuTao', level: 90, constellation: 1, ascension: 6, talent: { auto: 10, skill: 10, burst: 10 }, status: 'Built', swapTag: '' },
      { key: 'Arlecchino', level: 90, constellation: 0, ascension: 6, talent: { auto: 10, skill: 8, burst: 7 }, status: 'Built', swapTag: 'Stygian Onslaught' },
      { key: 'Mavuika', level: 90, constellation: 0, ascension: 6, talent: { auto: 6, skill: 10, burst: 10 }, status: 'Built', swapTag: '' },
      { key: 'Xilonen', level: 90, constellation: 0, ascension: 6, talent: { auto: 1, skill: 10, burst: 9 }, status: 'Built', swapTag: '' },
      { key: 'Bennett', level: 90, constellation: 6, ascension: 6, talent: { auto: 4, skill: 7, burst: 10 }, status: 'Built', swapTag: 'Imaginarium Theatre' },
      { key: 'Xiangling', level: 90, constellation: 6, ascension: 6, talent: { auto: 5, skill: 8, burst: 10 }, status: 'Built', swapTag: '' },
      { key: 'Xingqiu', level: 90, constellation: 6, ascension: 6, talent: { auto: 2, skill: 8, burst: 10 }, status: 'Built', swapTag: '' },
      { key: 'Fischl', level: 90, constellation: 6, ascension: 6, talent: { auto: 1, skill: 8, burst: 6 }, status: 'Built', swapTag: 'Imaginarium Theatre' },
      { key: 'TravelerCryo', level: 90, constellation: 5, ascension: 6, talent: { auto: 1, skill: 9, burst: 8 }, status: 'In Progress', swapTag: '' },
      { key: 'Columbina', level: 70, constellation: 0, ascension: 4, talent: { auto: 1, skill: 6, burst: 6 }, status: 'Active Prefarm', swapTag: 'Stygian Onslaught' },
      { key: 'Varka', level: 80, constellation: 0, ascension: 5, talent: { auto: 8, skill: 8, burst: 8 }, status: 'Active Prefarm', swapTag: '' },
      { key: 'Skirk', level: 60, constellation: 0, ascension: 3, talent: { auto: 4, skill: 6, burst: 5 }, status: 'In Progress', swapTag: '' },
      { key: 'Wriothesley', level: 80, constellation: 1, ascension: 5, talent: { auto: 8, skill: 7, burst: 6 }, status: 'Bench', swapTag: '' }
    ],
    weapons: [
      { id: 'w1', key: 'StaffOfHoma', level: 90, ascension: 6, refinement: 1, location: 'Zhongli', lock: true },
      { id: 'w2', key: 'EngulfingLightning', level: 90, ascension: 6, refinement: 1, location: 'RaidenShogun', lock: true },
      { id: 'w3', key: 'ElegyForTheEnd', level: 90, ascension: 6, refinement: 1, location: 'Venti', lock: true },
      { id: 'w4', key: 'HaranGeppakuFutsu', level: 90, ascension: 6, refinement: 1, location: 'KamisatoAyato', lock: true },
      { id: 'w5', key: 'SacrificialSword', level: 90, ascension: 6, refinement: 5, location: 'KaedeharaKazuha', lock: true },
      { id: 'w6', key: 'SplendorOfTranquilWaters', level: 90, ascension: 6, refinement: 1, location: 'Furina', lock: true },
      { id: 'w7', key: 'TomeOfTheEternalFlow', level: 90, ascension: 6, refinement: 1, location: 'Neuvillette', lock: true },
      { id: 'w8', key: 'AThousandFloatingDreams', level: 90, ascension: 6, refinement: 1, location: 'Nahida', lock: true },
      { id: 'w9', key: 'AquaSimulacra', level: 90, ascension: 6, refinement: 1, location: 'Yelan', lock: true },
      { id: 'w10', key: 'CrimsonMoonsSemblance', level: 90, ascension: 6, refinement: 1, location: 'Arlecchino', lock: true },
      { id: 'w11', key: 'AThousandBlazingSuns', level: 90, ascension: 6, refinement: 1, location: 'Mavuika', lock: true },
      { id: 'w12', key: 'PeakPatrolSong', level: 90, ascension: 6, refinement: 1, location: 'Xilonen', lock: true },
      { id: 'w13', key: 'AquilaFavonia', level: 90, ascension: 6, refinement: 1, location: 'Bennett', lock: true },
      { id: 'w14', key: 'TheCatch', level: 90, ascension: 6, refinement: 5, location: 'Xiangling', lock: true },
      { id: 'w15', key: 'FavoniusSword', level: 90, ascension: 6, refinement: 5, location: 'Xingqiu', lock: true },
      { id: 'w16', key: 'WolfsGravestone', level: 80, ascension: 5, refinement: 1, location: 'Varka', lock: true }
    ],
    prefarmQueue: [
      {
        id: 'pf-1',
        rank: 1,
        characterKey: 'Columbina',
        currentLevel: 70,
        targetLevel: 90,
        currentTalent: { auto: 1, skill: 6, burst: 6 },
        targetTalent: { auto: 1, skill: 10, burst: 9 }
      },
      {
        id: 'pf-2',
        rank: 2,
        characterKey: 'Varka',
        currentLevel: 80,
        targetLevel: 95,
        currentTalent: { auto: 8, skill: 8, burst: 8 },
        targetTalent: { auto: 10, skill: 10, burst: 10 }
      },
      {
        id: 'pf-3',
        rank: 3,
        characterKey: 'Skirk',
        currentLevel: 60,
        targetLevel: 90,
        currentTalent: { auto: 4, skill: 6, burst: 5 },
        targetTalent: { auto: 6, skill: 9, burst: 9 }
      }
    ],
    teams: [
      {
        id: 'team-1',
        name: 'Geo-Archon Hypercarry',
        archetype: 'Hypercarry',
        members: [
          { characterKey: 'Zhongli', weaponId: 'w1', weaponKey: 'StaffOfHoma', role: 'On-Field / Shield' },
          { characterKey: 'Furina', weaponId: 'w6', weaponKey: 'SplendorOfTranquilWaters', role: 'Buffer / Sub-DPS' },
          { characterKey: 'Xilonen', weaponId: 'w12', weaponKey: 'PeakPatrolSong', role: 'Res Shred / Healer' },
          { characterKey: 'Bennett', weaponId: 'w13', weaponKey: 'AquilaFavonia', role: 'ATK Buffer' }
        ],
        testLab: {
          rotationFeel: 'Smooth 20s loop; Zhongli pillar placement first keeps Tenacity uptime near 95%.',
          energyReliability: '140% ER on Zhongli + Xilonen Favonius/Sample keeps Burst ready off cooldown.',
          poiseNotes: 'Infinite interruption resistance via Jade Shield; zero stagger in Stygian Onslaught.'
        }
      },
      {
        id: 'team-2',
        name: 'Vape Dual-Carry Blitz',
        archetype: 'Dual Carry',
        members: [
          { characterKey: 'HuTao', weaponId: 'w1', weaponKey: 'StaffOfHoma', role: 'Pyro Carry' },
          { characterKey: 'Yelan', weaponId: 'w9', weaponKey: 'AquaSimulacra', role: 'Hydro Enabler' },
          { characterKey: 'Xingqiu', weaponId: 'w15', weaponKey: 'FavoniusSword', role: 'Hydro Battery' },
          { characterKey: 'Zhongli', weaponId: 'w14', weaponKey: 'TheCatch', role: 'Shieldflex' }
        ],
        testLab: {
          rotationFeel: 'Fast N1CJ cancels; double Hydro guarantees 100% vape on charged attacks.',
          energyReliability: 'Xingqiu Favonius Sword feeds Yelan cleanly at 165% ER.',
          poiseNotes: 'Note: Homa conflict with Team 1 — swap to Deathmatch if running both halves.'
        }
      },
      {
        id: 'team-3',
        name: 'Taser / Hyperbloom Chip',
        archetype: 'Chip Damage',
        members: [
          { characterKey: 'KamisatoAyato', weaponId: 'w4', weaponKey: 'HaranGeppakuFutsu', role: 'Hydro Driver' },
          { characterKey: 'Nahida', weaponId: 'w8', weaponKey: 'AThousandFloatingDreams', role: 'Dendro Core' },
          { characterKey: 'RaidenShogun', weaponId: 'w2', weaponKey: 'EngulfingLightning', role: 'Electro Trigger' },
          { characterKey: 'KaedeharaKazuha', weaponId: 'w5', weaponKey: 'SacrificialSword', role: 'Grouping / VV' }
        ],
        testLab: {
          rotationFeel: 'Effortless 16s soup rotation; Ayato E slashes cover wide AoE.',
          energyReliability: 'Raiden + Sacrificial Sword Kazuha keep bursts full even vs single-target.',
          poiseNotes: 'Moderate poise during Ayato E; dodge heavy boss slams or swap Kazuha -> Zhongli.'
        }
      }
    ],
    checklist: createChecklistTemplate(false)
  },

  vanbrohenheim: {
    user: 'vanbrohenheim',
    displayName: 'Sunny',
    wallet: {
      primogems: 9450,
      intertwinedFates: 12,
      acquaintFates: 4,
      mora: 8640000,
      resin: 95,
      condensedResin: 5
    },
    inventory: {
      Mora: { count: 8640000, target: 5000000, category: 'EXP & Currency' },
      HerosWit: { count: 312, target: 420, category: 'EXP & Currency' },
      AdventurersExperience: { count: 240, target: 200, category: 'EXP & Currency' },
      WanderersAdvice: { count: 90, target: 100, category: 'EXP & Currency' },
      FragileResin: { count: 16, target: 10, category: 'EXP & Currency' },
      CrownOfInsight: { count: 5, target: 3, category: 'Talent Books' },
      PhilosophiesOfContention: { count: 36, target: 38, category: 'Talent Books' },
      GuideToContention: { count: 40, target: 42, category: 'Talent Books' },
      TeachingsOfContention: { count: 24, target: 18, category: 'Talent Books' },
      PhilosophiesOfJustice: { count: 28, target: 30, category: 'Talent Books' },
      GoldInscribedSecretSourceCore: { count: 32, target: 46, category: 'Boss Drops' },
      ErodedHorn: { count: 8, target: 12, category: 'Weekly Boss' },
      WitheringPurpurbloom: { count: 88, target: 168, category: 'Local Specialties' }
    },
    characters: [
      { key: 'Neuvillette', level: 95, constellation: 1, ascension: 6, talent: { auto: 10, skill: 9, burst: 10 }, status: 'Built', swapTag: 'Stygian Onslaught' },
      { key: 'Furina', level: 90, constellation: 2, ascension: 6, talent: { auto: 1, skill: 10, burst: 10 }, status: 'Built', swapTag: 'Stygian Onslaught' },
      { key: 'Mavuika', level: 90, constellation: 0, ascension: 6, talent: { auto: 6, skill: 10, burst: 10 }, status: 'Built', swapTag: 'Imaginarium Theatre' },
      { key: 'Xilonen', level: 90, constellation: 0, ascension: 6, talent: { auto: 1, skill: 10, burst: 9 }, status: 'Built', swapTag: '' },
      { key: 'Arlecchino', level: 90, constellation: 1, ascension: 6, talent: { auto: 10, skill: 8, burst: 8 }, status: 'Built', swapTag: 'Imaginarium Theatre' },
      { key: 'Citlali', level: 80, constellation: 0, ascension: 5, talent: { auto: 1, skill: 8, burst: 8 }, status: 'Active Prefarm', swapTag: '' },
      { key: 'KaedeharaKazuha', level: 90, constellation: 0, ascension: 6, talent: { auto: 4, skill: 10, burst: 10 }, status: 'Built', swapTag: '' }
    ],
    weapons: [
      { id: 'sw1', key: 'TomeOfTheEternalFlow', level: 90, ascension: 6, refinement: 1, location: 'Neuvillette', lock: true },
      { id: 'sw2', key: 'SplendorOfTranquilWaters', level: 90, ascension: 6, refinement: 1, location: 'Furina', lock: true },
      { id: 'sw3', key: 'AThousandBlazingSuns', level: 90, ascension: 6, refinement: 1, location: 'Mavuika', lock: true },
      { id: 'sw4', key: 'PeakPatrolSong', level: 90, ascension: 6, refinement: 1, location: 'Xilonen', lock: true },
      { id: 'sw5', key: 'CrimsonMoonsSemblance', level: 90, ascension: 6, refinement: 1, location: 'Arlecchino', lock: true }
    ],
    prefarmQueue: [
      {
        id: 'spf-1',
        rank: 1,
        characterKey: 'Citlali',
        currentLevel: 80,
        targetLevel: 90,
        currentTalent: { auto: 1, skill: 8, burst: 8 },
        targetTalent: { auto: 1, skill: 10, burst: 9 }
      }
    ],
    teams: [
      {
        id: 'steam-1',
        name: 'Fontaine Sovereign Hypercarry',
        archetype: 'Hypercarry',
        members: [
          { characterKey: 'Neuvillette', weaponId: 'sw1', weaponKey: 'TomeOfTheEternalFlow', role: 'Main Carry' },
          { characterKey: 'Furina', weaponId: 'sw2', weaponKey: 'SplendorOfTranquilWaters', role: 'Sub-DPS / Buffer' },
          { characterKey: 'Xilonen', weaponId: 'sw4', weaponKey: 'PeakPatrolSong', role: 'Res Shred' },
          { characterKey: 'KaedeharaKazuha', weaponId: 'sw4', weaponKey: 'FavoniusSword', role: 'VV Grouping' }
        ],
        testLab: {
          rotationFeel: 'Effortless hydro pump rotation with C1 Neuvillette poise.',
          energyReliability: 'Double Hydro + Xilonen keeps all bursts at 100% uptime.',
          poiseNotes: 'C1 Neuvillette prevents knockback during Charged Attack.'
        }
      }
    ],
    checklist: createChecklistTemplate(true)
  }
};

export function cloneMockAccount(username) {
  const base = MOCK_ACCOUNTS[username] || MOCK_ACCOUNTS.almondeluna;
  return JSON.parse(JSON.stringify(base));
}
