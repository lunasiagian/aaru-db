import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(__dirname, '.lunaris_cache');
const YATTA_CACHE_DIR = path.join(__dirname, '.yatta_cache', 'reliquary');
const PATCHES_PATH = path.join(ROOT, 'data', 'kit_patches.json');
const OUT_PATH = path.join(ROOT, 'data', 'kit_profiles.json');
const SET_VECTORS_PATH = path.join(ROOT, 'data', 'set_vectors.json');

const ROLE_LABELS = [
  'on_field_carry',
  'off_field_sub_dps',
  'support_buffer',
  'sustain_utility',
  'reaction_enabler'
];

const SUPPLY_DIMS = [
  'resShred',
  'teamHeal',
  'shield',
  'teamAtk',
  'teamEm',
  'teamDmgPct',
  'teamBaseDmg',
  'offFieldAura',
  'battery',
  'hpFluctuation',
  'crowdControl'
];

const ELEMENT_NORMALIZE = {
  Fire: 'Pyro', Pyro: 'Pyro',
  Water: 'Hydro', Hydro: 'Hydro',
  Wind: 'Anemo', Anemo: 'Anemo',
  Electric: 'Electro', Electro: 'Electro',
  Grass: 'Dendro', Dendro: 'Dendro',
  Ice: 'Cryo', Cryo: 'Cryo',
  Rock: 'Geo', Geo: 'Geo'
};

const SET_DOMAIN_TABLE = {
  gladiatorsfinale: { domain: 'World / Weekly Bosses & Strongbox', region: 'Teyvat' },
  wandererstroupe: { domain: 'World / Weekly Bosses & Strongbox', region: 'Teyvat' },
  maidenbeloved: { domain: 'Valley of Remembrance', region: 'Mondstadt' },
  viridescentvenerer: { domain: 'Valley of Remembrance', region: 'Mondstadt' },
  crimsonwitchofflames: { domain: 'Hidden Palace of Zhou Formula', region: 'Liyue' },
  lavawalker: { domain: 'Hidden Palace of Zhou Formula', region: 'Liyue' },
  thunderingfury: { domain: 'Midsummer Courtyard', region: 'Mondstadt' },
  thundersoother: { domain: 'Midsummer Courtyard', region: 'Mondstadt' },
  bloodstainedchivalry: { domain: 'Clear Pool and Mountain Cavern', region: 'Liyue' },
  noblesseoblige: { domain: 'Clear Pool and Mountain Cavern', region: 'Liyue' },
  archaicpetra: { domain: 'Domain of Guyun', region: 'Liyue' },
  retracingbolide: { domain: 'Domain of Guyun', region: 'Liyue' },
  blizzardstrayer: { domain: 'Peak of Vindagnyr', region: 'Dragonspine (Mondstadt)' },
  heartofdepth: { domain: 'Peak of Vindagnyr', region: 'Dragonspine (Mondstadt)' },
  tenacityofthemillelith: { domain: 'Ridge Watch', region: 'Liyue' },
  paleflame: { domain: 'Ridge Watch', region: 'Liyue' },
  shimenawasreminiscence: { domain: 'Momiji-Dyed Court', region: 'Inazuma' },
  emblemofseveredfate: { domain: 'Momiji-Dyed Court', region: 'Inazuma' },
  huskofopulentdreams: { domain: 'Slumbering Court', region: 'Inazuma' },
  oceanhuedclam: { domain: 'Slumbering Court', region: 'Inazuma' },
  vermillionhereafter: { domain: 'The Lost Valley', region: 'The Chasm (Liyue)' },
  echoesofanoffering: { domain: 'The Lost Valley', region: 'The Chasm (Liyue)' },
  deepwoodmemories: { domain: 'Spire of Solitary Enlightenment', region: 'Sumeru' },
  gildeddreams: { domain: 'Spire of Solitary Enlightenment', region: 'Sumeru' },
  desertpavilionchronicle: { domain: 'City of Gold', region: 'Sumeru' },
  flowerofparadiselost: { domain: 'City of Gold', region: 'Sumeru' },
  nymphsdream: { domain: 'Molten Iron Fortress', region: 'Fontaine' },
  vourukashasglow: { domain: 'Molten Iron Fortress', region: 'Fontaine' },
  marechausseehunter: { domain: 'Denouement of Sin', region: 'Fontaine' },
  goldentroupe: { domain: 'Denouement of Sin', region: 'Fontaine' },
  songofdayspast: { domain: 'Waterfall Wen', region: 'Fontaine' },
  nighttimewhispersintheechoingwoods: { domain: 'Waterfall Wen', region: 'Fontaine' },
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
  heartofthefurnace: { domain: 'Snezhnaya Domain', region: 'Snezhnaya' }
};

async function fetchJson(url, cacheFile = null) {
  if (cacheFile && fs.existsSync(cacheFile)) {
    return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  }
  const res = await fetch(url, { headers: { 'User-Agent': 'AaruDB-ETL/2.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const data = await res.json();
  if (cacheFile) {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(data), 'utf8');
  }
  return data;
}

function stripMarkup(text) {
  return String(text || '')
    .replace(/\{LINK#[^}]*\}/gi, '')
    .replace(/\{\/LINK\}/gi, '')
    .replace(/\{LAYOUT_[^}]*#([^}]*)\}/gi, '$1')
    .replace(/<color=#[0-9A-Fa-f]+>|<\/color>|<\/?i>|<[^>]+>/g, '')
    .replace(/\\n/g, '\n')
    .trim();
}

function resolveHyperlinkParams(text, params = []) {
  return String(text || '').replace(/\{PARAM#[^|}]*\|(\d+)[^}:]*(?::([^}]+))?\}/gi, (_, idxStr, fmt = '') => {
    const val = params?.[Number(idxStr) - 1];
    if (val === undefined || val === null || val === '') return '';
    const num = Number(val);
    if (!Number.isFinite(num)) return String(val);
    if (/P$/i.test(fmt)) {
      const decMatch = fmt.match(/F(\d+)P/i);
      const dec = decMatch ? Number(decMatch[1]) : 0;
      return `${(num * 100).toFixed(dec)}%`;
    }
    return Math.round(num).toLocaleString();
  });
}

function resolveLunarisText(rawDesc, linkMap, params = []) {
  const src = String(rawDesc || '');
  const appended = [];
  const seen = new Set();
  for (const m of src.matchAll(/\{LINK#N(\d+)\}/gi)) {
    const id = m[1];
    if (seen.has(id) || !linkMap.has(id)) continue;
    seen.add(id);
    const entry = linkMap.get(id);
    if (entry?.description) {
      appended.push(`${entry.name || 'Note'}: ${resolveHyperlinkParams(entry.description, params)}`);
    }
  }
  return stripMarkup(appended.length ? `${src}\n\n${appended.join('\n')}` : src);
}

function normalizeKey(name) {
  return String(name || '').replace(/[^a-zA-Z0-9]/g, '');
}

function normLowerKey(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function extractSubBlockSignals(text) {
  const clean = String(text || '');
  const sentences = clean.split(/(?<=[.!?\n])\s+|\n+/);
  const partyBuff = sentences.some(
    (s) =>
      /(?:grants?|provides?|gains?|receives?|increases?|bonus|restore)[^.\n]{0,70}(?:party\s+members|allies|active\s+character|characters?\s+(?:within|inside)[^.\n]{0,25}aoe)|(?:nearby\s+party\s+members|all\s+party\s+members|active\s+character|characters?\s+(?:within|inside)[^.\n]{0,25}aoe)[^.\n]{0,70}(?:gain|receive|have\s+their|increased|atk\s+bonus|crit|em|dmg)|lead\s+vocal|chorus/i.test(
        s
      ) && !/when\s+a\s+party\s+member\s+triggers/i.test(s)
  );
  const resShred =
    /(?:pyro|hydro|electro|cryo|anemo|geo|dendro|elemental|physical)[\w\s,]{0,30}\bres\b[\w\s]{0,45}(?:will\s+be|is|are)\s+(?:decreased|reduced)|\bres\b[^.\n]{0,35}(?:is|are|will\s+be)\s+(?:decreased|reduced)|(?:decreas|reduc)(?:es?|ing)\s+(?:nearby\s+)?(?:opponents'?\s+)?[\w\s]{0,25}\bres\b/i.test(
      clean
    );
  const heal = /(?:restores?|regenerates?|heals?)[^.]{0,80}\bHP\b|healing/i.test(clean);
  const shield = /creates?\s+a\s+[^.]{0,20}shield|generates?\s+a\s+shield|shield\s+dmg\s+absorption/i.test(clean);
  const offField = /off-field|even\s+when\s+not\s+on\s+the\s+field|coordinated\s+attack|continuously\s+dealing|follows?\s+the\s+active\s+character|chorus|dragon\s+of\s+dark\s+decay|dragon\s+of\s+white\s+flame/i.test(
    clean
  );
  const infusion = /infus(?:es?|ing)|infused\s+with|cannot\s+be\s+overridden|converted\s+into\s+(?:pyro|hydro|electro|cryo|dendro|anemo|geo)\s+dmg/i.test(
    clean
  );
  return [partyBuff ? 1 : 0, resShred ? 1 : 0, heal ? 1 : 0, shield ? 1 : 0, offField ? 1 : 0, infusion ? 1 : 0];
}

function extractFeatures(charName, charMeta, detail, patchesMap) {
  const key = normalizeKey(charName);
  const patch = patchesMap[key] || null;
  const linkMap = new Map(
    (Array.isArray(detail?.hyperlinks) ? detail.hyperlinks : [])
      .filter((h) => h && h.id != null)
      .map((h) => [String(h.id), h])
  );
  const skills = detail?.skills || {};
  const na = skills.normalattack || detail?.attacks || {};
  const es = skills.elementalskill || skills.skill || {};
  const eb = skills.elementalburst || skills.burst || {};

  const naText = resolveLunarisText(na.description || na.desc || '', linkMap, na.params);
  const esText = resolveLunarisText(es.description || es.desc || '', linkMap, es.params);
  const ebText = resolveLunarisText(eb.description || eb.desc || '', linkMap, eb.params);

  const rawPassives = Array.isArray(detail?.passives)
    ? detail.passives
    : Object.entries(detail?.passives || {})
        .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
        .map(([, v]) => v);
  const passiveText = rawPassives
    .filter((p) => p && (p.name || p.description || p.desc))
    .map((p) => `${p.name || ''}: ${resolveLunarisText(p.description || p.desc || '', linkMap, p.params)}`)
    .join('\n');

  const consEntries = Object.entries(detail?.constellations || {}).sort((a, b) =>
    a[0].localeCompare(b[0], undefined, { numeric: true })
  );
  const consText = consEntries
    .map(([, c]) => `${c?.name || ''}: ${resolveLunarisText(c?.description || c?.desc || '', linkMap, c?.params)}`)
    .join('\n');

  const talentText = [naText, esText, ebText].join('\n');
  const fullText = [talentText, passiveText].join('\n');
  const nonNaText = [esText, ebText, passiveText].join('\n');

  // 1. Scaling & Multiplier Ratios
  const countDmgRows = (mult) =>
    Object.keys(mult || {}).filter((k) => /dmg|damage/i.test(k) && !/reduction|taken/i.test(k)).length;
  const naRows = countDmgRows(na.multipliers);
  const esRows = countDmgRows(es.multipliers);
  const ebRows = countDmgRows(eb.multipliers);
  const totalDmgRows = Math.max(1, naRows + esRows + ebRows);
  const normal_charged_plunge_share = Number((naRows / totalDmgRows).toFixed(4));
  const skill_dmg_share = Number((esRows / totalDmgRows).toFixed(4));
  const burst_dmg_share = Number((ebRows / totalDmgRows).toFixed(4));

  const hpScaleText = fullText
    .split(/(?<=[.!?\n])\s+|\n+/)
    .filter(
      (s) =>
        !/(?:consumes?|loses?|restores?|regenerates?|drains?|inherited\s+hp|hp\s+cost|hp\s+regeneration|bond\s+of\s+life)[^.]{0,45}\bmax\s*hp\b/i.test(s) &&
        !/\bmax\s*hp\b[^.]{0,45}bond\s+of\s+life/i.test(s) &&
        !/^\s*(?:hp\s+cost|hp\s+regeneration|inherited\s+hp)/i.test(s)
    )
    .join('\n');
  const hpHits =
    (hpScaleText.match(/\bmax\s*hp\b/gi) || []).length +
    (/(?:dmg|damage|shield|heal|healing|bonus)[^.]{0,45}(?:of|based\s+on)\s+(?:her|his|their|\w+'s)?\s*max\s*hp/i.test(hpScaleText) ? 2 : 0) +
    (/every\s+[\d,]+\s+max\s*hp/i.test(hpScaleText) ? 2 : 0);
  const defHits =
    (fullText.match(/\bdef\b/gi) || []).length +
    (/based\s+on[^.]{0,45}\bdef\b|atk\s+bonus[^.]{0,60}\bdef\b/i.test(fullText) ? 2 : 0);
  const emHits =
    (fullText.match(/\belemental\s+mastery\b/gi) || []).length +
    (/(?:each|every)\s+(?:\d+\s+)?points?\s+of[^.]{0,40}elemental\s+mastery[^.]{0,90}(?:dmg|damage)/i.test(fullText) ? 3 : 0);
  const erHits =
    (fullText.match(/\benergy\s+recharge\b/gi) || []).length +
    (/energy\s+recharge[^.]{0,80}dmg\s+bonus/i.test(fullText) ? 2 : 0);
  let atkHits = hpHits < 3 && defHits < 3 && emHits < 3 ? 2 : 1;
  if (/every\s+\d+\s+atk\b/i.test(passiveText)) atkHits += 3;
  const totalStatHits = Math.max(1, hpHits + atkHits + defHits + emHits + erHits);

  const hp_scaling_share = Number((hpHits / totalStatHits).toFixed(4));
  const atk_scaling_share = Number((atkHits / totalStatHits).toFixed(4));
  const def_scaling_share = Number((defHits / totalStatHits).toFixed(4));
  const em_scaling_share = Number((emHits / totalStatHits).toFixed(4));
  const er_scaling_share = Number((erHits / totalStatHits).toFixed(4));

  // 2. Net Energy Economy
  const ebCostRaw = eb?.multipliers?.['Energy Cost']?.[0] || eb?.energyCost || eb?.cost || 60;
  let burst_energy_cost = patch?.zeroEnergy ? 0 : Number(String(ebCostRaw).replace(/[^\d]/g, '')) || 60;
  let flatRefund = 0;
  for (const mult of [es?.multipliers, eb?.multipliers]) {
    for (const [lbl, arr] of Object.entries(mult || {})) {
      if (/energy\s*(?:regeneration|restoration|refund|return)/i.test(lbl)) {
        const sample = Array.isArray(arr) ? (arr[9] ?? arr[8] ?? arr[0]) : arr;
        const val = Number(String(sample || '').replace(/[^\d.]/g, '')) || 0;
        if (val > 0 && val <= 45) flatRefund += val;
      }
    }
  }
  for (const s of fullText.split(/(?<=[.!?\n])\s+|\n+/)) {
    const m = s.match(/(?:restores?|regenerates?|regains?)\s+([\d.]+)\s+(?:Elemental\s+)?Energy/i);
    if (!m || /other\s+nearby\s+party\s+members|allies\s+other\s+than/i.test(s)) continue;
    const amt = Number(m[1]) || 0;
    if (amt > 0 && amt <= 45) {
      const procsM = s.match(/(?:up\s+to|max(?:imum)?\s+of)\s+(\d+)\s+times/i);
      const procs = procsM ? Math.min(5, Number(procsM[1]) || 1) : 1;
      flatRefund += amt * procs;
    }
  }
  const flat_energy_refund_est = Math.min(burst_energy_cost, Math.round(flatRefund));
  const netCost = Math.max(0, burst_energy_cost - flat_energy_refund_est);
  const net_energy_demand = netCost >= 65 ? 'high' : netCost >= 45 ? 'moderate' : 'low';

  // 3. Party Buffing, Shred & Threshold Caps
  const nonNaSentences = nonNaText.split(/(?<=[.!?\n])\s+|\n+/);
  const has_party_buff = nonNaSentences.some(
    (s) =>
      /(?:grants?|provides?|gains?|receives?|increases?|bonus|restore)[^.\n]{0,70}(?:nearby\s+party\s+members|all\s+party\s+members|other\s+party\s+members|allies|active\s+character|characters?\s+(?:within|inside)[^.\n]{0,25}aoe)|(?:nearby\s+party\s+members|all\s+party\s+members|other\s+party\s+members|active\s+character|characters?\s+(?:within|inside)[^.\n]{0,25}aoe)[^.\n]{0,70}(?:gain|receive|have\s+their|increased|atk\s+bonus|crit|em|dmg)|lead\s+vocal|chorus/i.test(
        s
      ) &&
      !/when\s+a\s+party\s+member\s+triggers/i.test(s) &&
      !/when\s+the\s+party\s+includes/i.test(s)
  );
  const has_res_shred =
    /(?:pyro|hydro|electro|cryo|anemo|geo|dendro|elemental|physical)[\w\s,]{0,30}\bres\b[\w\s()'-]{0,85}(?:will\s+be|is|are)\s+(?:decreased|reduced)|\bres\b[^.\n]{0,40}(?:is|are|will\s+be)\s+(?:decreased|reduced)|(?:decreas|reduc)(?:es?|ing)\s+(?:nearby\s+)?(?:opponents'?\s+)?[\w\s]{0,25}\bres\b/i.test(
      nonNaText
    );
  const has_heal = /(?:restores?|regenerates?|heals?)[^.]{0,80}\bHP\b|healing/i.test(nonNaText);
  const has_shield = /creates?\s+a\s+[^.]{0,20}shield|generates?\s+a\s+shield|shield\s+dmg\s+absorption/i.test(nonNaText);
  const has_off_field = /off-field|even\s+when\s+not\s+on\s+the\s+field|coordinated\s+attack|continuously\s+dealing|follows?\s+the\s+active\s+character|chorus|dragon\s+of\s+dark\s+decay|dragon\s+of\s+white\s+flame/i.test(
    nonNaText
  );
  const has_infusion = /infus(?:es?|ing)|cannot\s+be\s+overridden|converted\s+into\s+(?:pyro|hydro|electro|cryo|dendro|anemo|geo)\s+dmg/i.test(
    fullText
  );
  const has_crowd_control = /pulls?\s+(?:in\s+)?(?:nearby\s+)?opponents|vortex|vacuum|gather(?:s|ing)?\s+opponents/i.test(nonNaText);
  const has_bond_of_life = /\bbond\s+of\s+life\b/i.test(fullText);
  const has_burning_focus = /burning\s+opponents|when\s+opponents\s+are\s+burning|deals?[^.]{0,40}burning\s+dmg/i.test(fullText);
  const has_hp_fluctuation = /consumes?\s+hp|hp\s+(?:is\s+)?(?:lost|reduced|drained|fluctuat)|loses?\s+hp/i.test(fullText);
  const has_burst_hp_drain = /after\s+using\s+(?:an\s+)?elemental\s+burst[\s\S]{0,160}?(?:loses?\s+hp|consumes?\s+hp|continuously\s+lose\s+hp)|bane\s+of\s+all\s+evil/i.test(fullText);
  const is_physical_carry = /physical\s+dmg|lightfall\s+sword|shatter/i.test(fullText) && !has_infusion;

  let threshold_stat = patch?.statThresholdCurve?.statKey || null;
  let threshold_cap_value = patch?.statThresholdCurve?.ceiling ?? null;
  if (threshold_cap_value === null) {
    const revCapM = passiveText.match(
      /([\d.]+)%\s*(?:increased\s+)?(?:ATK|HP|DEF|EM|DMG)[^.\n]{0,40}for\s+every\s+([\d,]+)\s+(Max\s+HP|HP|ATK|DEF|Elemental\s+Mastery)[\s\S]{0,140}?up\s+to\s+([\d.]+)%/i
    );
    if (revCapM) {
      const perStep = Number(revCapM[1]);
      const unitStep = Number(revCapM[2].replace(/,/g, ''));
      const statW = revCapM[3].toUpperCase();
      const maxPct = Number(revCapM[4]);
      if (perStep > 0 && maxPct > 0) {
        threshold_stat = statW.includes('HP') ? 'hp_' : statW.includes('DEF') ? 'def_' : statW.includes('MASTERY') ? 'eleMas' : 'atk_';
        threshold_cap_value = Math.round((maxPct / perStep) * unitStep);
      }
    }
  }
  const capM =
    threshold_cap_value === null
      ? passiveText.match(
          /every\s+(?:([\d,]+)\s+(?:points?\s+of\s+)?)?(Max\s+HP|HP|ATK|DEF|Elemental\s+Mastery)[\s\S]{0,160}?(?:by|increases?[^.\d]{0,40})\s*([\d,]+(?:\.\d+)?)(%?)\b[\s\S]{0,200}?max(?:imum)?(?:\s+(?:increase|of))?[^.\d]*([\d,]+(?:\.\d+)?)(%?)/i
        )
      : null;
  if (capM) {
    const unitStep = capM[1] ? Number(capM[1].replace(/,/g, '')) : 1;
    const statW = capM[2].toUpperCase();
    const exM = passiveText.slice(capM.index, capM.index + 160).match(/in\s+excess\s+of\s+([\d,]+)/i);
    const baseline = exM ? Number(exM[1].replace(/,/g, '')) : 0;
    const perStep = Number(capM[3].replace(/,/g, ''));
    const maxGain = Number(capM[5].replace(/,/g, ''));
    if (perStep > 0 && maxGain > 0) {
      let derived = baseline + (maxGain / perStep) * unitStep;
      if ((capM[4] === '%' || capM[6] === '%') && unitStep === 1 && baseline === 0 && !statW.includes('MASTERY') && derived < 500) {
        derived *= 100;
      }
      threshold_stat = statW.includes('HP') ? 'hp_' : statW.includes('DEF') ? 'def_' : statW.includes('MASTERY') ? 'eleMas' : 'atk_';
      threshold_cap_value = Math.round(derived);
    }
  }
  if (threshold_cap_value === null) {
    const expM = passiveText.match(/([\d,]{4,6})\s+(Max\s+HP|ATK|DEF|Elemental\s+Mastery)/i);
    if (expM) {
      const statW = expM[2].toUpperCase();
      threshold_stat = statW.includes('HP') ? 'hp_' : statW.includes('DEF') ? 'def_' : statW.includes('MASTERY') ? 'eleMas' : 'atk_';
      threshold_cap_value = Number(expM[1].replace(/,/g, ''));
    }
  }

  // 4. Reaction Conversion & CRIT Enablement (Lunar & Stellar) + Factions
  const is_lunar =
    (patch?.factions || []).includes('Moonsign') ||
    /moonsign\s+benediction|lunar[-\s](?:charged|bloom|crystallize)\s+reaction/i.test(fullText);
  const is_stellar_swirl = /radiance:\s*stellar\s*swirl|convert(?:ed|s)?[^.\n]{0,40}stellar\s+swirl/i.test(fullText);
  const is_stellar_conduct = /radiance:\s*stellar[-\s]conduct|convert(?:ed|s)?[^.\n]{0,40}stellar[-\s]conduct/i.test(fullText);
  const is_stellar =
    (patch?.factions || []).includes('Stellar') ||
    is_stellar_swirl ||
    is_stellar_conduct ||
    /stellar\s+jubilee|polestar\s+field/i.test(fullText);
  const is_hexerei =
    (patch?.factions || []).includes('Hexerei') || /witch'?s\s+(?:eve\s+rite|homework)|hexerei/i.test(fullText);
  const is_nightsoul = (patch?.factions || []).includes('Nightsoul') || /nightsoul/i.test(fullText);
  const factions = [...new Set([...(patch?.factions || []), ...(is_hexerei ? ['Hexerei'] : []), ...(is_lunar ? ['Moonsign'] : []), ...(is_nightsoul ? ['Nightsoul'] : []), ...(is_stellar ? ['Stellar'] : [])])];

  const reaction_converter_type = is_lunar ? 'lunar' : is_stellar ? 'stellar' : 'none';
  const enables_reaction_crit = is_lunar || is_stellar;

  // 5. Multi-Stance, Constellation Shifts, Talent-vs-Passive Divergence
  const has_dual_stance_or_mode =
    Boolean(patch?.explicitModes?.length) ||
    /essential\s+transmutation|white\s+flame[\s\S]{0,400}dark\s+decay|ousia[\s\S]{0,120}pneuma|two\s+forms|switches?\s+between/i.test(
      fullText
    );
  const has_constellation_role_shift =
    Boolean(patch?.constellationShifts?.length) ||
    /(?:pyro|hydro|electro|cryo|anemo|geo|dendro)\s+infusion|infused\s+with\s+(?:pyro|hydro|electro|cryo|anemo|geo|dendro)|normal\s+attack[\s\S]{0,60}converted/i.test(
      consText
    );
  const is_non_crit = /-\s*100%\s*crit\s*rate|crit\s*rate\s*(?:is\s*)?(?:decreased|reduced)\s*by\s*100%|cannot\s+deal\s+crit/i.test(
    passiveText
  );

  const talentVector = extractSubBlockSignals(talentText);
  const passiveVector = extractSubBlockSignals(passiveText);
  const divergenceScore = Number(
    Math.sqrt(talentVector.reduce((s, v, idx) => s + (v - passiveVector[idx]) ** 2, 0)).toFixed(3)
  );
  const hasTradeoff = divergenceScore >= 1.15 || Boolean(patch?.explicitModes?.length) || threshold_cap_value !== null;

  // Damage Channel Shares (summing to 1.0)
  let channelShares = patch?.channelShares || null;
  if (!channelShares) {
    if (is_lunar) {
      channelShares = { direct: 0.25, amp: 0, additive: 0, transformative: 0, lunar_crit: 0.75, stellar_crit: 0 };
    } else if (is_stellar) {
      channelShares = { direct: 0.3, amp: 0, additive: 0, transformative: 0, lunar_crit: 0, stellar_crit: 0.7 };
    } else if (em_scaling_share >= 0.45 && /hyperbloom|burgeon|bloom|swirl/i.test(fullText)) {
      channelShares = { direct: 0.25, amp: 0, additive: 0, transformative: 0.75, lunar_crit: 0, stellar_crit: 0 };
    } else if (/vaporize|melt/i.test(fullText)) {
      channelShares = { direct: 0.5, amp: 0.5, additive: 0, transformative: 0, lunar_crit: 0, stellar_crit: 0 };
    } else if (/aggravate|spread|quicken/i.test(fullText)) {
      channelShares = { direct: 0.45, amp: 0, additive: 0.55, transformative: 0, lunar_crit: 0, stellar_crit: 0 };
    } else {
      channelShares = { direct: 1.0, amp: 0, additive: 0, transformative: 0, lunar_crit: 0, stellar_crit: 0 };
    }
  }

  // Supply & Demand Vectors (11 shared dimensions)
  const supply = {};
  const demand = {};
  for (const dim of SUPPLY_DIMS) {
    supply[dim] = 0;
    demand[dim] = 0;
  }
  if (has_res_shred) supply.resShred = 0.85;
  if (has_heal) supply.teamHeal = 0.85;
  if (has_shield) supply.shield = 0.9;
  if (has_party_buff && /atk/i.test(nonNaText)) supply.teamAtk = 0.75;
  if (has_party_buff && /elemental\s+mastery|\bem\b/i.test(nonNaText)) supply.teamEm = 0.75;
  if (has_party_buff && /dmg/i.test(nonNaText) && !/base\s+dmg/i.test(nonNaText)) supply.teamDmgPct = 0.75;
  if (/base\s+dmg|lead\s+vocal|chorus/i.test(nonNaText)) supply.teamBaseDmg = 0.9;
  if (has_off_field) supply.offFieldAura = 0.8;
  if (flat_energy_refund_est > 0 || /energy/i.test(nonNaText)) supply.battery = 0.35;
  if (has_hp_fluctuation) supply.hpFluctuation = 0.7;
  if (has_crowd_control) supply.crowdControl = 0.8;

  if (net_energy_demand === 'high') demand.battery = 0.9;
  else if (net_energy_demand === 'moderate') demand.battery = 0.45;
  if (has_infusion || normal_charged_plunge_share >= 0.35) {
    demand.offFieldAura = 0.8;
    demand.resShred = 0.8;
    demand.teamAtk = atk_scaling_share >= 0.4 ? 0.8 : 0.2;
    demand.teamDmgPct = is_lunar || is_stellar ? 0.1 : 0.75;
  } else if (has_off_field) {
    demand.resShred = 0.65;
    demand.teamDmgPct = is_lunar || is_stellar ? 0.1 : 0.6;
  }
  if (patch?.supplyOverrides) Object.assign(supply, patch.supplyOverrides);
  if (patch?.demandOverrides) Object.assign(demand, patch.demandOverrides);

  const vector = [
    hp_scaling_share,
    atk_scaling_share,
    def_scaling_share,
    em_scaling_share,
    er_scaling_share,
    burst_dmg_share,
    skill_dmg_share,
    normal_charged_plunge_share,
    Number((burst_energy_cost / 90).toFixed(4)),
    flat_energy_refund_est > 0 ? 1 : 0,
    Number((flat_energy_refund_est / 40).toFixed(4)),
    has_party_buff ? 1 : 0,
    has_res_shred ? 1 : 0,
    threshold_cap_value !== null ? 1 : 0,
    has_heal ? 1 : 0,
    has_shield ? 1 : 0,
    has_off_field ? 1 : 0,
    has_infusion ? 1 : 0,
    is_lunar ? 1 : 0,
    is_stellar ? 1 : 0,
    enables_reaction_crit ? 1 : 0,
    has_dual_stance_or_mode ? 1 : 0,
    has_constellation_role_shift ? 1 : 0
  ];

  // Ground truth from Gold Anchor (data/kit_patches.json) when present, else weak supervision
  let y;
  let sampleWeight = 1;
  if (Array.isArray(patch?.goldRoles) && patch.goldRoles.length) {
    const gSet = new Set(patch.goldRoles);
    y = ROLE_LABELS.map((lbl) => (gSet.has(lbl) ? 1 : 0));
    sampleWeight = 4;
  } else {
    y = [
      (has_infusion || normal_charged_plunge_share >= 0.45) && !(has_party_buff && !has_infusion) ? 1 : 0,
      (has_off_field || burst_dmg_share >= 0.4 || skill_dmg_share >= 0.45) && !has_infusion ? 1 : 0,
      has_party_buff || has_res_shred || threshold_cap_value !== null ? 1 : 0,
      has_heal || has_shield ? 1 : 0,
      is_lunar || is_stellar || em_scaling_share >= 0.35 || has_res_shred ? 1 : 0
    ];
    if (y.reduce((a, b) => a + b, 0) === 0) y[0] = 1;
  }

  const element = ELEMENT_NORMALIZE[charMeta?.element] || charMeta?.element || 'Unknown';
  const WEAPON_NORMALIZE = {
    WEAPON_SWORD_ONE_HAND: 'Sword',
    WEAPON_CLAYMORE: 'Claymore',
    WEAPON_POLE: 'Polearm',
    WEAPON_BOW: 'Bow',
    WEAPON_CATALYST: 'Catalyst'
  };
  const weaponType = WEAPON_NORMALIZE[charMeta?.weaponType] || charMeta?.weaponType || 'Sword';

  return {
    name: charName,
    key,
    element,
    weaponType,
    patch,
    sampleWeight,
    vector,
    labels: y,
    is_non_crit,
    factions,
    talentVector,
    passiveVector,
    divergenceScore,
    hasTradeoff,
    channelShares,
    supply,
    demand,
    features: {
      hp_scaling_share,
      atk_scaling_share,
      def_scaling_share,
      em_scaling_share,
      er_scaling_share,
      burst_dmg_share,
      skill_dmg_share,
      normal_charged_plunge_share,
      burst_energy_cost,
      zero_energy: Boolean(patch?.zeroEnergy),
      has_self_energy_refund: flat_energy_refund_est > 0,
      flat_energy_refund_est,
      net_energy_demand,
      has_party_buff,
      has_res_shred,
      has_stat_threshold_cap: threshold_cap_value !== null,
      threshold_stat,
      threshold_cap_value,
      has_heal,
      has_shield,
      has_off_field,
      has_infusion,
      reaction_converter_type,
      enables_reaction_crit,
      is_hexerei,
      is_nightsoul,
      is_stellar_swirl,
      is_stellar_conduct,
      has_bond_of_life,
      has_burning_focus,
      has_burst_hp_drain,
      is_physical_carry,
      has_dual_stance_or_mode,
      has_constellation_role_shift,
      quadratic_aoe: Boolean(patch?.quadraticAoe)
    }
  };
}

function cosineSim(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na > 0 && nb > 0 ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

// Weighted One-vs-Rest L2 Logistic Regression + Soft KMeans (k=8) + Cosine Peers
function trainAndPredict(rows) {
  const n = rows.length;
  const d = rows[0].vector.length;
  const mean = new Array(d).fill(0);
  const std = new Array(d).fill(1);
  for (const r of rows) for (let j = 0; j < d; j++) mean[j] += r.vector[j] / n;
  for (let j = 0; j < d; j++) {
    let v = 0;
    for (const r of rows) v += (r.vector[j] - mean[j]) ** 2;
    std[j] = Math.sqrt(v / n) || 1;
  }
  const X = rows.map((r) => r.vector.map((x, j) => (x - mean[j]) / std[j]));
  const totalWeight = rows.reduce((s, r) => s + r.sampleWeight, 0);

  const sigmoid = (z) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
  const probs = Array.from({ length: n }, () => new Array(ROLE_LABELS.length).fill(0));
  for (let k = 0; k < ROLE_LABELS.length; k++) {
    const w = new Array(d).fill(0);
    let b = 0;
    const lr = 0.18;
    const l2 = 0.02;
    for (let ep = 0; ep < 400; ep++) {
      const gw = new Array(d).fill(0);
      let gb = 0;
      for (let i = 0; i < n; i++) {
        let z = b;
        for (let j = 0; j < d; j++) z += w[j] * X[i][j];
        const sw = rows[i].sampleWeight;
        const err = (sigmoid(z) - rows[i].labels[k]) * sw;
        gb += err / totalWeight;
        for (let j = 0; j < d; j++) gw[j] += (err * X[i][j]) / totalWeight;
      }
      b -= lr * gb;
      for (let j = 0; j < d; j++) w[j] -= lr * (gw[j] + l2 * w[j]);
    }
    for (let i = 0; i < n; i++) {
      let z = b;
      for (let j = 0; j < d; j++) z += w[j] * X[i][j];
      probs[i][k] = Number(sigmoid(z).toFixed(4));
    }
  }

  // KMeans (k=8) with soft cluster probabilities + nearest peers
  const kClusters = 8;
  const centroids = Array.from({ length: kClusters }, (_, idx) => [...X[Math.floor((idx * n) / kClusters)]]);
  const assign = new Array(n).fill(0);
  const distSq = (a, b) => a.reduce((s, v, j) => s + (v - b[j]) ** 2, 0);
  for (let it = 0; it < 30; it++) {
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < kClusters; c++) {
        const dd = distSq(X[i], centroids[c]);
        if (dd < bestD) {
          bestD = dd;
          best = c;
        }
      }
      assign[i] = best;
    }
    for (let c = 0; c < kClusters; c++) {
      const members = X.filter((_, i) => assign[i] === c);
      if (members.length) {
        for (let j = 0; j < d; j++) centroids[c][j] = members.reduce((s, m) => s + m[j], 0) / members.length;
      }
    }
  }

  const dists = [];
  const clusterProbs = [];
  for (let i = 0; i < n; i++) {
    const rawD = centroids.map((cent) => Math.sqrt(distSq(X[i], cent)));
    dists.push(rawD[assign[i]]);
    const scores = rawD.map((dd) => Math.exp(-dd * 0.45));
    const sumS = scores.reduce((a, b) => a + b, 0) || 1;
    clusterProbs.push(scores.map((s) => Number((s / sumS).toFixed(3))));
  }
  const sortedDists = [...dists].sort((a, b) => a - b);
  const distThresh = sortedDists[Math.floor(sortedDists.length * 0.9)] || 99;

  const nearestPeers = rows.map((r, i) => {
    const peers = [];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      peers.push({ key: rows[j].key, name: rows[j].name, similarity: Number(cosineSim(rows[i].vector, rows[j].vector).toFixed(3)) });
    }
    peers.sort((a, b) => b.similarity - a.similarity);
    return peers.slice(0, 3);
  });

  return { probs, assign, dists, distThresh, clusterProbs, nearestPeers };
}

function buildLensesAndRecs(row, roleProbs) {
  const f = row.features;
  const elem = row.element;
  const patch = row.patch;
  const lenses = [];

  if (Array.isArray(patch?.explicitModes) && patch.explicitModes.length) {
    for (const m of patch.explicitModes) {
      lenses.push({ id: m.lens, modeId: m.id, label: m.label, condition: m.condition });
    }
  } else {
    const activeRoleSet = Array.isArray(patch?.goldRoles) && patch.goldRoles.length ? new Set(patch.goldRoles) : null;
    const isDedicatedCarry =
      (activeRoleSet ? activeRoleSet.has('on_field_carry') && !activeRoleSet.has('support_buffer') && !activeRoleSet.has('sustain_utility') : false) ||
      (roleProbs.on_field_carry >= 0.75 &&
        !f.has_off_field &&
        !f.has_shield &&
        !f.has_res_shred);
    const candidates = [];
    if ((activeRoleSet ? activeRoleSet.has('on_field_carry') : roleProbs.on_field_carry >= 0.45) || f.has_infusion) {
      candidates.push({
        prob: roleProbs.on_field_carry,
        id: 'On-Field Carry',
        label: 'On-Field Carry',
        condition: 'Active infusion / Charged / Normal Attack carry'
      });
    }
    if (
      !isDedicatedCarry &&
      (activeRoleSet ? activeRoleSet.has('off_field_sub_dps') : roleProbs.off_field_sub_dps >= 0.5 || f.has_off_field)
    ) {
      candidates.push({
        prob: roleProbs.off_field_sub_dps,
        id: 'Off-Field Sub-DPS',
        label: 'Off-Field Sub-DPS',
        condition: 'Personal off-field Skill/Burst damage'
      });
    }
    if (
      !isDedicatedCarry &&
      (activeRoleSet
        ? activeRoleSet.has('support_buffer') || activeRoleSet.has('sustain_utility')
        : roleProbs.support_buffer >= 0.55 || roleProbs.sustain_utility >= 0.55)
    ) {
      candidates.push({
        prob: Math.max(roleProbs.support_buffer, roleProbs.sustain_utility),
        id: 'Quickswap Support',
        label: f.has_res_shred || f.has_party_buff ? 'Support / Utility' : 'Sustain / Support',
        condition: 'Team buffing, shred, or sustain focus'
      });
    }
    candidates.sort((a, b) => b.prob - a.prob);
    for (const c of candidates) {
      lenses.push({ id: c.id, label: c.label, condition: c.condition });
    }
  }
  if (f.has_constellation_role_shift && !lenses.some((l) => l.id === 'On-Field Carry')) {
    lenses.push({
      id: 'On-Field Carry',
      label: 'On-Field Carry (Constellation Shift)',
      condition: patch?.constellationShifts?.[0]?.label || 'Constellation-unlocked carry mode'
    });
  }
  if (!lenses.length) {
    lenses.push({ id: 'On-Field Carry', label: 'On-Field Carry', condition: 'Default kit role' });
  }

  const shares = [
    ['atk_', f.atk_scaling_share],
    ['hp_', f.hp_scaling_share],
    ['def_', f.def_scaling_share],
    ['eleMas', f.em_scaling_share],
    ['enerRech_', f.er_scaling_share]
  ].sort((a, b) => b[1] - a[1]);
  const primaryScaler = patch?.primaryScaler || shares[0][0];

  const hasCrit = !row.is_non_crit && (row.channelShares.transformative < 0.7 || f.enables_reaction_crit);
  const statWeights = {
    hp: primaryScaler === 'hp_' ? 0.5 : 0,
    hp_: primaryScaler === 'hp_' ? 1.0 : 0,
    atk: primaryScaler === 'atk_' ? 0.25 : 0,
    atk_: primaryScaler === 'atk_' ? 1.0 : 0,
    def: primaryScaler === 'def_' ? 0.5 : 0,
    def_: primaryScaler === 'def_' ? 1.0 : 0,
    eleMas: f.em_scaling_share >= 0.25 || row.channelShares.transformative >= 0.5 ? (primaryScaler === 'eleMas' || row.channelShares.transformative >= 0.65 ? 1.0 : 0.75) : f.enables_reaction_crit || row.channelShares.amp >= 0.3 ? 0.5 : 0,
    enerRech_: f.zero_energy ? 0.0 : f.net_energy_demand === 'high' ? 1.0 : f.net_energy_demand === 'moderate' ? 0.65 : 0.4,
    critRate_: hasCrit ? (f.enables_reaction_crit || f.burst_dmg_share >= 0.2 || f.normal_charged_plunge_share >= 0.2 || roleProbs.on_field_carry >= 0.45 ? 1.0 : 0.35) : 0,
    critDMG_: hasCrit ? (f.enables_reaction_crit || f.burst_dmg_share >= 0.2 || f.normal_charged_plunge_share >= 0.2 || roleProbs.on_field_carry >= 0.45 ? 1.0 : 0.35) : 0
  };

  // Artifact recommendations with Emblem, Noblesse, Nod-Krai, Hexerei, Snezhnaya, Natlan gates
  const recs = [];
  if (f.enables_reaction_crit && f.reaction_converter_type === 'lunar') {
    if (roleProbs.on_field_carry >= 0.45) recs.push({ set: "4pc Night of the Sky's Unveiling", lens: 'On-Field Carry', note: 'On-field Lunar +30% CRIT Rate & +10% Team Lunar DMG' });
    if (roleProbs.off_field_sub_dps >= 0.45 || f.has_off_field) recs.push({ set: '4pc Aubade of Morningstar and Moon', lens: 'Off-Field Sub-DPS', note: 'Off-field Lunar Reaction DMG (+20% / +60%)' });
    if (f.has_party_buff || roleProbs.support_buffer >= 0.45) recs.push({ set: "4pc Silken Moon's Serenade", lens: 'Support / Utility', note: 'Team +120 EM & +10% Lunar Reaction DMG' });
  }
  if (f.is_hexerei) {
    if (f.has_party_buff || f.has_res_shred || roleProbs.support_buffer >= 0.45) recs.push({ set: '4pc Celestial Gift', lens: 'Support / Utility', note: 'Hexerei Skill: Team +20–40% Elemental DMG Bonus' });
    if (roleProbs.off_field_sub_dps >= 0.45 || roleProbs.on_field_carry >= 0.45) recs.push({ set: '4pc A Day Carved From Rising Winds', lens: 'Personal DPS / Sub-DPS', note: 'Hexerei: +43% ATK & +20% CRIT Rate (works off-field)' });
  }
  if (f.reaction_converter_type === 'stellar') {
    if (f.is_stellar_conduct) recs.push({ set: '4pc Disenchantment in Deep Shadow', lens: 'Stellar-Conduct', note: '+40% Stellar-Conduct DMG & +16% CRIT Rate' });
    if (f.has_party_buff || f.has_off_field) recs.push({ set: '4pc Heart of the Furnace', lens: 'Support / Off-Field', note: 'Team +50% Stellar Glimmer DMG (works off-field)' });
    if (f.is_stellar_swirl) recs.push({ set: '4pc Scarlet Proof', lens: 'Stellar Swirl', note: '+40% Stellar Swirl DMG & +16% CRIT Rate' });
  }
  if (f.zero_energy && elem === 'Cryo') {
    recs.push({ set: '4pc Finale of the Deep Galleries', lens: 'On-Field / Quickswap', note: '0-Energy Cryo +60% NA & Burst DMG' });
  }
  if (f.is_nightsoul) {
    if (f.has_party_buff || roleProbs.support_buffer >= 0.45) recs.push({ set: '4pc Scroll of the Hero of Cinder City', lens: 'Support / Utility', note: 'Nightsoul team Elemental DMG% (+40%) + Energy' });
    if (roleProbs.on_field_carry >= 0.45) recs.push({ set: '4pc Obsidian Codex', lens: 'On-Field Carry', note: 'On-field Nightsoul +15% DMG & +40% CRIT Rate' });
  }
  if (elem === 'Anemo' && (f.has_party_buff || f.has_off_field) && !f.is_stellar_swirl) {
    recs.push({ set: '4pc Viridescent Venerer', lens: 'Support / Utility', note: '-40% Elemental RES shred + Swirl DMG' });
  }
  if (elem === 'Dendro' && (f.has_party_buff || f.has_off_field)) {
    recs.push({ set: '4pc Deepwood Memories', lens: 'Support / Utility', note: '-30% Dendro RES shred' });
  }
  if (f.burst_dmg_share >= 0.3 && f.net_energy_demand === 'high' && !f.zero_energy) {
    recs.push({ set: '4pc Emblem of Severed Fate', lens: 'Off-Field Sub-DPS', note: 'High net ER demand + Burst DMG conversion' });
  }
  if ((f.has_party_buff || f.has_res_shred || roleProbs.support_buffer >= 0.55) && f.burst_energy_cost > 0) {
    recs.push({ set: '4pc Noblesse Oblige', lens: 'Support / Utility', note: 'Team +20% ATK after Burst' });
  }
  if (f.has_off_field && f.skill_dmg_share >= 0.3) {
    recs.push({ set: '4pc Golden Troupe', lens: 'Off-Field Sub-DPS', note: 'Off-field Skill DMG (+70%)' });
  }
  if (f.has_stat_threshold_cap && f.threshold_stat === 'hp_') {
    recs.push({ set: '4pc Tenacity of the Millelith', lens: 'Support / Utility', note: 'HP% threshold + Team +20% ATK' });
  }
  if (!recs.length) {
    recs.push({ set: `2pc ${elem} DMG% + 2pc ${primaryScaler === 'hp_' ? 'HP%' : primaryScaler === 'eleMas' ? 'EM' : 'ATK%'}`, lens: lenses[0].label, note: 'Flexible high-substat setup' });
  }

  return { playstyleLenses: lenses, statWeights, recommendedSets: recs.slice(0, 3), primaryScaler };
}

function vectorizeArtifactSet(name, twoPc, fourPc) {
  const txt = `${twoPc} ${fourPc}`;
  let weaponTypes = null;
  if (/uses\s+a\s+catalyst\s+or\s+a\s+bow/i.test(fourPc)) weaponTypes = ['Catalyst', 'Bow'];
  else if (/uses\s+a\s+sword,\s*claymore\s+or\s+polearm/i.test(fourPc)) weaponTypes = ['Sword', 'Claymore', 'Polearm'];

  return {
    weaponTypes,
    onField: /(?:while|if)\s+the\s+(?:equipping\s+)?character\s+is\s+on\s+the\s+field|normal\s+attack|charged\s+attack|nightsoul'?s\s+blessing.*on\s+the\s+field/i.test(txt) ? 1 : 0,
    offField: /off[- ]field|not\s+on\s+the\s+field/i.test(txt) ? 1 : 0,
    skillDmg: /elemental\s+skill\s+dmg/i.test(txt) ? 1 : 0,
    burstDmg: /elemental\s+burst\s+dmg/i.test(txt) ? 1 : 0,
    highEr: /energy\s+recharge/i.test(twoPc) || /of\s+energy\s+recharge/i.test(fourPc) ? 1 : 0,
    zeroEnergy: /0\s+elemental\s+energy/i.test(txt) ? 1 : 0,
    teamBuff: /all\s+(?:nearby\s+)?party\s+members|increases?[^.]{0,40}party|shield\s+strength/i.test(txt) ? 1 : 0,
    resShred: /res\s+by\s+\d+%|decreases?\s+opponents'?\s+[\w\s]+res/i.test(txt) ? 1 : 0,
    hpScaler: /hp\s*\+|max\s+hp/i.test(twoPc) ? 1 : 0,
    atkScaler: /atk\s*\+/i.test(twoPc) ? 1 : 0,
    defScaler: /def\s*\+/i.test(twoPc) ? 1 : 0,
    emScaler: /elemental\s+mastery/i.test(twoPc) ? 1 : 0,
    lunar: /lunar\s+reaction|moonsign/i.test(txt) ? 1 : 0,
    stellar: /stellar[- ]?(?:conduct|swirl|glimmer)/i.test(txt) ? 1 : 0,
    hexerei: /witch'?s\s+homework|hexerei/i.test(txt) ? 1 : 0,
    nightsoul: /nightsoul/i.test(txt) ? 1 : 0,
    bondOfLife: /\bbond\s+of\s+life\b/i.test(fourPc) ? 1 : 0,
    burning: /\bburning\s+opponents\b/i.test(fourPc) ? 1 : 0,
    bloomOnly: /bloom,\s*hyperbloom,\s*and\s*burgeon/i.test(fourPc) ? 1 : 0,
    burstHpDrain: /after\s+using\s+an\s+elemental\s+burst[\s\S]{0,120}?when\s+the\s+character'?s\s+hp\s+decreases/i.test(fourPc) ? 1 : 0,
    hpFluctuation: /hp\s+increases\s+or\s+decreases/i.test(txt) ? 1 : 0,
    plunge: /plunging\s+attack/i.test(txt) ? 1 : 0,
    heal: /healing\s+(?:bonus|effectiveness)/i.test(twoPc) || /sea-dyed\s+foam|record\s+the\s+total\s+amount\s+of\s+healing/i.test(fourPc) ? 1 : 0,
    cryo: /cryo\s+dmg\s+bonus/i.test(twoPc) ? 1 : 0,
    pyro: /pyro\s+dmg\s+bonus/i.test(twoPc) ? 1 : 0,
    hydro: /hydro\s+dmg\s+bonus/i.test(twoPc) ? 1 : 0,
    electro: /electro\s+dmg\s+bonus/i.test(twoPc) ? 1 : 0,
    anemo: /anemo\s+dmg\s+bonus/i.test(twoPc) ? 1 : 0,
    dendro: /dendro\s+dmg\s+bonus/i.test(twoPc) ? 1 : 0,
    geo: /geo\s+dmg\s+bonus/i.test(twoPc) ? 1 : 0,
    phys: /physical\s+dmg/i.test(twoPc) ? 1 : 0,
    shield: /shield\s+strength/i.test(twoPc) ? 1 : 0,
    reactionEm: /within\s+8s\s+of\s+triggering\s+an\s+elemental\s+reaction|vaporize|melt|aggravate|spread/i.test(fourPc) ? 1 : 0
  };
}

async function buildSetVectors() {
  const indexRes = await fetchJson('https://gi.yatta.moe/api/v2/en/reliquary', path.join(YATTA_CACHE_DIR, 'index.json'));
  const items = indexRes?.data?.items || {};
  const sets = [];

  for (const [idStr, item] of Object.entries(items).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const levels = Array.isArray(item?.levelList) ? item.levelList : [];
    if (!levels.includes(5)) continue;
    try {
      const detail = await fetchJson(`https://gi.yatta.moe/api/v2/en/reliquary/${idStr}`, path.join(YATTA_CACHE_DIR, `${idStr}.json`));
      const d = detail?.data || {};
      const affixes = Object.values(d.affixList || {}).map((x) => stripMarkup(x));
      if (affixes.length < 2) continue;
      const twoPc = affixes[0];
      const fourPc = affixes[1];
      const name = d.name || item.name || idStr;
      const lk = normLowerKey(name);
      const dom = SET_DOMAIN_TABLE[lk] || { domain: 'Domain of Blessing', region: 'Teyvat' };
      sets.push({
        setId: Number(idStr),
        key: normalizeKey(name),
        lookupKey: lk,
        name,
        domain: dom.domain,
        region: dom.region,
        twoPc,
        fourPc,
        icon: item.icon ? `https://gi.yatta.moe/assets/UI/reliquary/${item.icon}.png` : '',
        primitives: vectorizeArtifactSet(name, twoPc, fourPc)
      });
    } catch {
      // Skip 404/malformed reliquary entries gracefully
    }
  }
  fs.mkdirSync(path.dirname(SET_VECTORS_PATH), { recursive: true });
  fs.writeFileSync(SET_VECTORS_PATH, JSON.stringify({ count: sets.length, sets }, null, 2), 'utf8');
  return sets;
}

async function main() {
  const patchesJson = fs.existsSync(PATCHES_PATH) ? JSON.parse(fs.readFileSync(PATCHES_PATH, 'utf8')) : { patches: {} };
  const patchesMap = patchesJson.patches || {};

  const verInfo = await fetchJson('https://api.lunaris.moe/data/version.json', path.join(CACHE_DIR, 'version.json'));
  const ver = verInfo.version;
  const charlist = await fetchJson(`https://api.lunaris.moe/data/${ver}/charlist.json`, path.join(CACHE_DIR, ver, 'charlist.json'));

  const entries = Object.entries(charlist);
  const rows = [];
  for (const [cid, meta] of entries) {
    const name = meta.enName || meta.name || cid;
    try {
      const detail = await fetchJson(`https://api.lunaris.moe/data/${ver}/en/char/${cid}.json`, path.join(CACHE_DIR, ver, `${cid}.json`));
      rows.push(extractFeatures(name, meta, detail, patchesMap));
    } catch {
      // Skip placeholder/404 character entries
    }
  }

  const { probs, assign, dists, distThresh, clusterProbs, nearestPeers } = trainAndPredict(rows);
  const profiles = {};
  let reviewCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const p = r.patch;
    const roleProbabilities = {};
    for (let j = 0; j < ROLE_LABELS.length; j++) roleProbabilities[ROLE_LABELS[j]] = probs[i][j];
    let roles = Array.isArray(p?.goldRoles) && p.goldRoles.length ? [...p.goldRoles] : ROLE_LABELS.filter((_, j) => probs[i][j] >= 0.45);
    if (!roles.length) {
      const bestIdx = probs[i].indexOf(Math.max(...probs[i]));
      roles = [ROLE_LABELS[bestIdx]];
    }
    const maxProb = Math.max(...probs[i]);
    const needsReview = !p && (maxProb < 0.55 || dists[i] > distThresh);
    if (needsReview) reviewCount++;

    const { playstyleLenses, statWeights, recommendedSets, primaryScaler } = buildLensesAndRecs(r, roleProbabilities);
    profiles[r.key] = {
      name: r.name,
      element: r.element,
      weaponType: r.weaponType,
      primaryScaler,
      isGoldAnchor: Boolean(p?.goldRoles?.length),
      factions: r.factions,
      features: r.features,
      channelShares: r.channelShares,
      supply: r.supply,
      demand: r.demand,
      talentVector: r.talentVector,
      passiveVector: r.passiveVector,
      divergenceScore: r.divergenceScore,
      hasTradeoff: r.hasTradeoff,
      teamElementLock: p?.teamElementLock || null,
      elementCountRule: p?.elementCountRule || null,
      explicitModes: p?.explicitModes || null,
      statThresholdCurve: p?.statThresholdCurve || null,
      constellationShifts: p?.constellationShifts || null,
      roleProbabilities,
      roles,
      playstyleLenses,
      statWeights,
      recommendedSets,
      clusterId: assign[i],
      clusterProbs: clusterProbs[i],
      clusterDistance: Number(dists[i].toFixed(3)),
      nearestPeers: nearestPeers[i],
      needsReview
    };
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify({ version: ver, count: rows.length, reviewCount, profiles }, null, 2), 'utf8');
  const setVectors = await buildSetVectors();
  console.log(`Generated ${OUT_PATH} (${rows.length} characters, ${reviewCount} flagged for review) & ${SET_VECTORS_PATH} (${setVectors.length} 5-star sets)`);

  console.log('\n=== Verification Report ===');
  for (const key of ['Skirk', 'Escoffier', 'Vodyanitsa', 'Durin', 'Chevreuse', 'Flins', 'Odette', 'Bennett', 'Lyney']) {
    const p = profiles[key];
    if (!p) { console.log(key, 'NOT FOUND'); continue; }
    console.log(`\n[${p.name}] (${p.element} · Primary: ${p.primaryScaler} · Divergence: ${p.divergenceScore} (tradeoff=${p.hasTradeoff}) · Review: ${p.needsReview})`);
    console.log('  Roles:', p.roles.join(', '), '| Factions:', p.factions.join(',') || 'None', '| Peers:', p.nearestPeers.map((x) => `${x.name}(${Math.round(x.similarity * 100)}%)`).join(', '));
    console.log('  Energy:', `cost=${p.features.burst_energy_cost}, zero=${p.features.zero_energy}, refund=${p.features.flat_energy_refund_est}, net=${p.features.net_energy_demand}`);
    console.log('  Mechanics:', `partyBuff=${p.features.has_party_buff}, shred=${p.features.has_res_shred}, cap=${p.features.threshold_stat}:${p.features.threshold_cap_value}, reaction=${p.features.reaction_converter_type}(CRIT=${p.features.enables_reaction_crit}), dualStance=${p.features.has_dual_stance_or_mode}, conShift=${p.features.has_constellation_role_shift}`);
    console.log('  Lenses:', p.playstyleLenses.map((l) => l.label).join(' | '));
    console.log('  Sets:', p.recommendedSets.map((s) => `${s.set} [${s.lens}]`).join(' | '));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
