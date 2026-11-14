#!/usr/bin/env node
/**
 * Build-time sync script for KeqingMains Theorycrafting Library (KQM TCL).
 * Fetches character markdown pages from KeqingMains/tcl and writes data/kqm-tcl.json.
 * Zero external dependencies — uses Node 18+ built-in fetch and fs/promises.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, '../data/kqm-tcl.json');
const TREE_URL = 'https://api.github.com/repos/KeqingMains/tcl/git/trees/master?recursive=1';
const RAW_BASE = 'https://raw.githubusercontent.com/KeqingMains/tcl/master/';

const SLUG_OVERRIDES = {
  'traveler-anemo': 'TravelerAnemo',
  'traveler-geo': 'TravelerGeo',
  'traveler-electro': 'TravelerElectro',
  'traveler-dendro': 'TravelerDendro',
  'traveler-hydro': 'TravelerHydro',
  'traveler-pyro': 'TravelerPyro',
  'raiden-shogun': 'RaidenShogun',
  'kamisato-ayaka': 'KamisatoAyaka',
  'kamisato-ayato': 'KamisatoAyato',
  'kaedehara-kazuha': 'KaedeharaKazuha',
  'sangonomiya-kokomi': 'SangonomiyaKokomi',
  'kujou-sara': 'KujouSara',
  'kuki-shinobu': 'KukiShinobu',
  'shikanoin-heizou': 'ShikanoinHeizou',
  'yae-miko': 'YaeMiko',
  'arataki-itto': 'AratakiItto',
  'hu-tao': 'HuTao',
  'yun-jin': 'YunJin',
  'yumemizuki-mizuki': 'YumemizukiMizuki',
  'lan-yan': 'LanYan'
};

function slugToPascalCase(slug) {
  if (SLUG_OVERRIDES[slug]) return SLUG_OVERRIDES[slug];
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function parseKqmMarkdown(md) {
  const result = {};

  // 1. Particle Generation (from Energy / Particle Generation table or prose)
  const particleMatch =
    md.match(/(?:Particles?\s*(?:per\s*Cast|Generated)?|Energy\s*Generation)[\s\S]{0,220}?\|\s*([\d.]+(?:\s*[-–~]\s*[\d.]+)?)\s*(?:particles?)?\s*\|/i) ||
    md.match(/generates?\s+([\d.]+(?:\s*[-–~]\s*[\d.]+)?)\s+(?:\w+\s+)?particles?/i);
  if (particleMatch) {
    const nums = particleMatch[1].split(/[-–~]/).map((s) => Number(s.trim())).filter(Number.isFinite);
    if (nums.length) {
      result.particlesPerCast = nums.length > 1 ? Math.round(((nums[0] + nums[1]) / 2) * 100) / 100 : nums[0];
    }
  } else if (/generates?\s+no\s+(?:elemental\s+)?particles|0\s+particles/i.test(md)) {
    result.particlesPerCast = 0;
  }

  // 2. ER Requirements section
  const erSectionMatch = md.match(/##+\s*ER\s*Requirements?([\s\S]{0,1600}?)(?=\n##|\Z)/i);
  if (erSectionMatch) {
    const erText = erSectionMatch[1];
    const erBaselines = {};
    const soloM = erText.match(/(?:solo|no\s*battery)[^:\n]*?[:|]\s*~?(\d{3})(?:\s*[-–]\s*(\d{3}))?%/i);
    const sameM = erText.match(/(?:double\s*(?:pyro|hydro|electro|cryo|geo|anemo|dendro)|same[- ]element|with\s+battery)[^:\n]*?[:|]\s*~?(\d{3})(?:\s*[-–]\s*(\d{3}))?%/i);
    const favM = erText.match(/(?:favonius|fav)[^:\n]*?[:|]\s*~?(\d{3})(?:\s*[-–]\s*(\d{3}))?%/i);
    if (soloM) erBaselines.solo = Number(soloM[2] || soloM[1]);
    if (sameM) erBaselines.doubleSameElement = Number(sameM[2] || sameM[1]);
    if (favM) erBaselines.favonius = Number(favM[2] || favM[1]);
    if (Object.keys(erBaselines).length) result.erBaselines = erBaselines;
  }

  // 3. Talent Priority
  const talentSectionMatch = md.match(/##+\s*Talent\s*Priority([\s\S]{0,600}?)(?=\n##|\Z)/i);
  if (talentSectionMatch) {
    const prioLine = talentSectionMatch[1]
      .split('\n')
      .map((l) => l.replace(/[*_`>#]/g, '').trim())
      .find((l) => /(?:Normal|Skill|Burst|NA|E|Q)\s*[>=≥]/i.test(l));
    if (prioLine) result.talentPriority = prioLine.slice(0, 120);
  }

  return result;
}

async function main() {
  console.log('Fetching KeqingMains/tcl file tree...');
  const treeRes = await fetch(TREE_URL, {
    headers: { 'User-Agent': 'aaru-db-kqm-sync' }
  });
  if (!treeRes.ok) {
    throw new Error(`GitHub tree fetch failed: HTTP ${treeRes.status}`);
  }
  const treeData = await treeRes.json();
  const charFiles = (treeData.tree || []).filter(
    (item) =>
      item.type === 'blob' &&
      /^docs\/characters\/(anemo|cryo|dendro|electro|geo|hydro|pyro)\/[^/]+\.md$/i.test(item.path) &&
      !/index\.md$/i.test(item.path)
  );

  console.log(`Found ${charFiles.length} character docs. Parsing...`);
  const output = {
    _meta: {
      source: 'https://github.com/KeqingMains/tcl',
      syncedAt: new Date().toISOString(),
      count: 0
    }
  };

  for (const file of charFiles) {
    const slug = file.path.split('/').pop().replace(/\.md$/i, '');
    const key = slugToPascalCase(slug);
    try {
      const res = await fetch(`${RAW_BASE}${file.path}`);
      if (!res.ok) continue;
      const md = await res.text();
      const parsed = parseKqmMarkdown(md);
      if (Object.keys(parsed).length) {
        output[key] = parsed;
        output._meta.count += 1;
      }
    } catch {
      // Skip transient file errors
    }
  }

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${output._meta.count} entries to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
