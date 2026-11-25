#!/usr/bin/env python3
"""
Authoritative Offline Feature Engineering + Multi-Label Classical ML ETL for Aaru DB.
Powered by Python 3.12 + NumPy + Pandas + scikit-learn.

Reads Lunaris character JSONs & Yatta reliquary JSONs (from local cache or live API),
merges declarative Gold Anchors & hyperspecific constraints from data/kit_patches.json,
engineers a 27-feature pandas DataFrame (including Normal vs. Charged vs. Plunge
attack-motion shares to separate Ganyu/Lyney/Neuvillette from Childe/Yoimiya/Wanderer),
trains a sample-weighted OneVsRestClassifier(LogisticRegression) + KMeans(k=8) +
cosine_similarity peer graph, and exports data/kit_profiles.json & data/set_vectors.json.
"""

from __future__ import annotations

import json
import math
import re
import sys
import urllib.request
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.linear_model import LogisticRegression
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.multiclass import OneVsRestClassifier
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, str(Path(__file__).resolve().parent))
from dimbreath_loader import (
    DIM_ELEMENT_FROM_COST,
    ENKA_UI_BASE,
    extract_depot_passive_group_ids,
    fetch_filtered_textmap,
    format_param_template,
    load_excel,
)

ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = Path(__file__).resolve().parent / ".lunaris_cache"
YATTA_CACHE_DIR = Path(__file__).resolve().parent / ".yatta_cache" / "reliquary"
PATCHES_PATH = ROOT / "data" / "kit_patches.json"
OUT_PATH = ROOT / "data" / "kit_profiles.json"
SET_VECTORS_PATH = ROOT / "data" / "set_vectors.json"

ROLE_LABELS = [
    "on_field_carry",
    "off_field_sub_dps",
    "support_buffer",
    "sustain_utility",
    "reaction_enabler",
]

SUPPLY_DIMS = [
    "resShred",
    "teamHeal",
    "shield",
    "teamAtk",
    "teamEm",
    "teamDmgPct",
    "teamBaseDmg",
    "offFieldAura",
    "battery",
    "hpFluctuation",
    "crowdControl",
]

ELEMENT_NORMALIZE = {
    "Fire": "Pyro", "Pyro": "Pyro",
    "Water": "Hydro", "Hydro": "Hydro",
    "Wind": "Anemo", "Anemo": "Anemo",
    "Electric": "Electro", "Electro": "Electro",
    "Grass": "Dendro", "Dendro": "Dendro",
    "Ice": "Cryo", "Cryo": "Cryo",
    "Rock": "Geo", "Geo": "Geo",
}

WEAPON_NORMALIZE = {
    "WEAPON_SWORD_ONE_HAND": "Sword",
    "WEAPON_CLAYMORE": "Claymore",
    "WEAPON_POLE": "Polearm",
    "WEAPON_BOW": "Bow",
    "WEAPON_CATALYST": "Catalyst",
}

SET_DOMAIN_TABLE = {
    "gladiatorsfinale": {"domain": "World / Weekly Bosses & Strongbox", "region": "Teyvat"},
    "wandererstroupe": {"domain": "World / Weekly Bosses & Strongbox", "region": "Teyvat"},
    "maidenbeloved": {"domain": "Valley of Remembrance", "region": "Mondstadt"},
    "viridescentvenerer": {"domain": "Valley of Remembrance", "region": "Mondstadt"},
    "crimsonwitchofflames": {"domain": "Hidden Palace of Zhou Formula", "region": "Liyue"},
    "lavawalker": {"domain": "Hidden Palace of Zhou Formula", "region": "Liyue"},
    "thunderingfury": {"domain": "Midsummer Courtyard", "region": "Mondstadt"},
    "thundersoother": {"domain": "Midsummer Courtyard", "region": "Mondstadt"},
    "bloodstainedchivalry": {"domain": "Clear Pool and Mountain Cavern", "region": "Liyue"},
    "noblesseoblige": {"domain": "Clear Pool and Mountain Cavern", "region": "Liyue"},
    "archaicpetra": {"domain": "Domain of Guyun", "region": "Liyue"},
    "retracingbolide": {"domain": "Domain of Guyun", "region": "Liyue"},
    "blizzardstrayer": {"domain": "Peak of Vindagnyr", "region": "Dragonspine (Mondstadt)"},
    "heartofdepth": {"domain": "Peak of Vindagnyr", "region": "Dragonspine (Mondstadt)"},
    "tenacityofthemillelith": {"domain": "Ridge Watch", "region": "Liyue"},
    "paleflame": {"domain": "Ridge Watch", "region": "Liyue"},
    "shimenawasreminiscence": {"domain": "Momiji-Dyed Court", "region": "Inazuma"},
    "emblemofseveredfate": {"domain": "Momiji-Dyed Court", "region": "Inazuma"},
    "huskofopulentdreams": {"domain": "Slumbering Court", "region": "Inazuma"},
    "oceanhuedclam": {"domain": "Slumbering Court", "region": "Inazuma"},
    "vermillionhereafter": {"domain": "The Lost Valley", "region": "The Chasm (Liyue)"},
    "echoesofanoffering": {"domain": "The Lost Valley", "region": "The Chasm (Liyue)"},
    "deepwoodmemories": {"domain": "Spire of Solitary Enlightenment", "region": "Sumeru"},
    "gildeddreams": {"domain": "Spire of Solitary Enlightenment", "region": "Sumeru"},
    "desertpavilionchronicle": {"domain": "City of Gold", "region": "Sumeru"},
    "flowerofparadiselost": {"domain": "City of Gold", "region": "Sumeru"},
    "nymphsdream": {"domain": "Molten Iron Fortress", "region": "Fontaine"},
    "vourukashasglow": {"domain": "Molten Iron Fortress", "region": "Fontaine"},
    "marechausseehunter": {"domain": "Denouement of Sin", "region": "Fontaine"},
    "goldentroupe": {"domain": "Denouement of Sin", "region": "Fontaine"},
    "songofdayspast": {"domain": "Waterfall Wen", "region": "Fontaine"},
    "nighttimewhispersintheechoingwoods": {"domain": "Waterfall Wen", "region": "Fontaine"},
    "fragmentofharmonicwhimsy": {"domain": "Faded Theater", "region": "Fontaine"},
    "unfinishedreverie": {"domain": "Faded Theater", "region": "Fontaine"},
    "scrolloftheheroofcindercity": {"domain": "Sanctum of Rainbow Spirits", "region": "Natlan"},
    "obsidiancodex": {"domain": "Sanctum of Rainbow Spirits", "region": "Natlan"},
    "longnightsoath": {"domain": "Derelict Masonry Dock", "region": "Natlan"},
    "finaleofthedeepgalleries": {"domain": "Derelict Masonry Dock", "region": "Natlan"},
    "nightoftheskysunveiling": {"domain": "Frostladen Machinery", "region": "Nod-Krai"},
    "silkenmoonsserenade": {"domain": "Frostladen Machinery", "region": "Nod-Krai"},
    "aubadeofmorningstarandmoon": {"domain": "Moonchilds Treasures", "region": "Nod-Krai"},
    "adaycarvedfromrisingwinds": {"domain": "Moonchilds Treasures", "region": "Nod-Krai"},
    "celestialgift": {"domain": "Snezhnaya Domain", "region": "Snezhnaya"},
    "disenchantmentindeepshadow": {"domain": "Snezhnaya Domain", "region": "Snezhnaya"},
    "scarletproof": {"domain": "Snezhnaya Domain", "region": "Snezhnaya"},
    "heartofthefurnace": {"domain": "Snezhnaya Domain", "region": "Snezhnaya"},
}


def fetch_json(url: str, cache_file: Path | None = None) -> Any:
    if cache_file and cache_file.exists():
        return json.loads(cache_file.read_text(encoding="utf-8"))
    req = urllib.request.Request(url, headers={"User-Agent": "AaruDB-Python-ETL/2.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    if cache_file:
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data


def strip_markup(text: str) -> str:
    s = str(text or "")
    s = re.sub(r"\{LINK#[^}]*\}", "", s, flags=re.I)
    s = re.sub(r"\{/LINK\}", "", s, flags=re.I)
    s = re.sub(r"\{LAYOUT_[^}]*#([^}]*)\}", r"\1", s, flags=re.I)
    s = re.sub(r"<color=#[0-9A-Fa-f]+>|</color>|</?i>|<[^>]+>", "", s)
    return s.replace("\\n", "\n").strip()


def resolve_hyperlink_params(text: str, params: list[Any] | None) -> str:
    params = params or []

    def repl(m: re.Match[str]) -> str:
        idx = int(m.group(1)) - 1
        fmt = m.group(2) or ""
        if idx < 0 or idx >= len(params) or params[idx] in (None, ""):
            return ""
        try:
            num = float(params[idx])
        except (TypeError, ValueError):
            return str(params[idx])
        if fmt.upper().endswith("P"):
            dec_m = re.search(r"F(\d+)P", fmt, re.I)
            dec = int(dec_m.group(1)) if dec_m else 0
            return f"{num * 100:.{dec}f}%"
        return f"{round(num):,}"

    return re.sub(r"\{PARAM#[^|}]*\|(\d+)[^}:]*(?::([^}]+))?\}", repl, str(text or ""), flags=re.I)


def resolve_lunaris_text(raw_desc: str, link_map: dict[str, dict[str, Any]], params: list[Any] | None = None) -> str:
    src = str(raw_desc or "")
    appended = []
    seen: set[str] = set()
    for m in re.finditer(r"\{LINK#N(\d+)\}", src, flags=re.I):
        lid = m.group(1)
        if lid in seen or lid not in link_map:
            continue
        seen.add(lid)
        entry = link_map[lid]
        if entry.get("description"):
            appended.append(f"{entry.get('name', 'Note')}: {resolve_hyperlink_params(entry['description'], params)}")
    return strip_markup(f"{src}\n\n" + "\n".join(appended) if appended else src)


def normalize_key(name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]", "", str(name or ""))


def norm_lower_key(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(name or "").lower())


def extract_sub_block_signals(text: str) -> list[int]:
    clean = str(text or "")
    sentences = re.split(r"(?<=[.!?\n])\s+|\n+", clean)
    party_buff = any(
        re.search(
            r"(?:grants?|provides?|gains?|receives?|increases?|bonus|restore)[^.\n]{0,70}(?:nearby\s+party\s+members|all\s+party\s+members|other\s+party\s+members|allies|active\s+character|characters?\s+(?:within|inside)[^.\n]{0,25}aoe)|(?:nearby\s+party\s+members|all\s+party\s+members|other\s+party\s+members|active\s+character|characters?\s+(?:within|inside)[^.\n]{0,25}aoe)[^.\n]{0,70}(?:gain|receive|have\s+their|increased|atk\s+bonus|crit|em|dmg)|lead\s+vocal|chorus",
            s,
            re.I,
        )
        and not re.search(r"when\s+a\s+party\s+member\s+triggers", s, re.I)
        and not re.search(r"when\s+the\s+party\s+includes", s, re.I)
        for s in sentences
    )
    res_shred = bool(
        re.search(
            r"(?:pyro|hydro|electro|cryo|anemo|geo|dendro|elemental|physical)[\w\s,]{0,30}\bres\b[\w\s()'-]{0,85}(?:will\s+be|is|are)\s+(?:decreased|reduced)|\bres\b[^.\n]{0,40}(?:is|are|will\s+be)\s+(?:decreased|reduced)|(?:decreas|reduc)(?:es?|ing)\s+(?:nearby\s+)?(?:opponents'?\s+)?[\w\s]{0,25}\bres\b",
            clean,
            re.I,
        )
    )
    heal = bool(re.search(r"(?:restores?|regenerates?|heals?)[^.]{0,80}\bHP\b|healing", clean, re.I))
    shield = bool(re.search(r"creates?\s+a\s+[^.]{0,20}shield|generates?\s+a\s+shield|shield\s+dmg\s+absorption", clean, re.I))
    off_field = bool(
        re.search(
            r"off-field|even\s+when\s+not\s+on\s+the\s+field|coordinated\s+attack|continuously\s+dealing|follows?\s+the\s+active\s+character|chorus|dragon\s+of\s+dark\s+decay|dragon\s+of\s+white\s+flame",
            clean,
            re.I,
        )
    )
    infusion = bool(
        re.search(
            r"infus(?:es?|ing)|infused\s+with|cannot\s+be\s+overridden|converted\s+into\s+(?:pyro|hydro|electro|cryo|dendro|anemo|geo)\s+dmg",
            clean,
            re.I,
        )
    )
    return [int(party_buff), int(res_shred), int(heal), int(shield), int(off_field), int(infusion)]


def compute_attack_motion_scores(
    na_mults: dict[str, Any],
    es_mults: dict[str, Any],
    na_text: str,
    es_text: str,
    passive_text: str,
) -> dict[str, Any]:
    """
    Distinguishes Normal-Attack carries (Yoimiya, Wanderer, Wriothesley, Ayato),
    Charged-Attack carries (Ganyu, Tighnari, Lyney, Neuvillette, Yanfei, Hu Tao, Chasca),
    Skill-Stance Mixed NA+CA carries (Tartaglia/Childe), and Plunge carries (Xiao, Gaming).
    """
    na_keys = " | ".join((na_mults or {}).keys())
    es_keys = " | ".join((es_mults or {}).keys())

    # 1. Level-2 Charged Aimed Shot or Specialized Charged Attack row in NA table
    has_lv2_charged_row = bool(
        re.search(
            r"Charge\s+Level\s+1|Level\s+1\s+Aimed|Frostflake\s+Arrow|Wreath\s+Arrow|Clusterbloom|Prop\s+Arrow|Equitable\s+Judgment|Scarlet\s+Seal|Arataki\s+Kesagiri|Shadowhunter|Spiritbreath",
            na_keys,
            re.I,
        )
    )
    # 2. Skill-stance mixed NA+CA combo (e.g. Tartaglia Melee Stance has 1-Hit..6-Hit + Charged Attack DMG in Skill)
    # vs. pure NA stance (e.g. Ayato Shunsuiken 1-Hit..3-Hit with NO Charged Attack DMG / cannot perform Charged Attacks)
    has_skill_ca_row = bool(re.search(r"charged\s+attack\s+dmg", es_keys, re.I))
    has_skill_stance_na_combo = bool(
        re.search(r"1-Hit\s+DMG", es_keys, re.I)
        and re.search(r"3-Hit\s+DMG", es_keys, re.I)
        and has_skill_ca_row
    )
    # 3. Skill explicitly scales or buffs Normal Attack DMG (Yoimiya Blazing Arrow, Ayato Shunsuiken, Wanderer Fushoudan)
    skill_buffs_na = bool(
        re.search(r"Blazing\s+Arrow|Fushoudan|Shunsuiken|Normal\s+Attack\s+DMG", es_keys, re.I)
        or re.search(r"will\s+not\s+generate\s+Kindling\s+Arrows|Normal\s+Attacks?\s+will\s+be\s+converted|cannot\s+perform\s+Charged\s+Attacks", es_text, re.I)
    )
    # 4. A1/A4 Passive mentions of Charged Attack vs Normal Attack
    passive_ca_hits = len(
        re.findall(
            r"Charged\s+Attack|Frostflake\s+Arrow|Wreath\s+Arrow|Prop\s+Arrow|Scarlet\s+Seal|Equitable\s+Judgment|Blood\s+Blossom",
            passive_text,
            re.I,
        )
    )
    passive_na_hits = len(
        re.findall(r"Normal\s+Attack", passive_text, re.I)
    )
    is_plunge = bool(
        re.search(r"plunging\s+attack[^.]{0,60}(?:dmg|bonus|increas)|plunge\s+dmg|high\s+plunge", f"{es_text}\n{passive_text}", re.I)
    )

    ca_score = 0.2
    na_score = 0.35
    if has_lv2_charged_row:
        ca_score += 0.5
    if passive_ca_hits >= 1 and not has_skill_stance_na_combo:
        ca_score += min(0.35, passive_ca_hits * 0.18)
    if skill_buffs_na:
        na_score += 0.45
        ca_score = max(0.1, ca_score - 0.25)
    if passive_na_hits >= 1 and passive_ca_hits == 0:
        na_score += 0.25
    if has_skill_stance_na_combo:
        # Tartaglia / Melee Stance: mixes N2C/N3C + Riptide Slash + Burst (not pure CA-only!)
        na_score = 0.55
        ca_score = 0.38

    return {
        "na_focus_score": round(min(1.0, na_score), 3),
        "ca_focus_score": round(min(1.0, ca_score), 3),
        "plunge_focus_score": 0.85 if is_plunge else 0.1,
        "has_lv2_charged_shot": has_lv2_charged_row,
        "has_skill_stance_na_combo": has_skill_stance_na_combo,
    }


NON_DMG_MULT_RE = re.compile(
    r"\b(?:cd|duration|energy|stamina|cost|shield|heal|healing|regen|absorption|reduction|interval|delay|hits|max\s+stacks|capacity|bonus\s+ratio)\b",
    re.I,
)


def _extract_pct_mv_at_lv10(raw_val: Any) -> float:
    if isinstance(raw_val, list):
        item = raw_val[9] if len(raw_val) > 9 else (raw_val[-1] if raw_val else 0)
    else:
        item = raw_val
    s = str(item or "")
    # Match all percentages like "156.4%" or "156.4%*2"
    pcts = [float(x) for x in re.findall(r"([\d.]+)%", s)]
    if not pcts:
        return 0.0
    mult = 1.0
    hits_m = re.search(r"[*×x]\s*(\d+)\b", s)
    if hits_m:
        mult = float(hits_m.group(1))
    val = sum(pcts) * mult if len(pcts) == 1 else sum(pcts)
    # Normalize HP%/DEF% talent scalers against ~2k ATK baseline so HP/DEF off-field kits aren't dwarfed by NA tables
    if re.search(r"\bmax\s*hp\b", s, re.I):
        val *= 15.0
    elif re.search(r"\bdef\b", s, re.I):
        val *= 1.4
    return val


def compute_lv10_mv_shares(
    na_mults: dict[str, Any],
    es_mults: dict[str, Any],
    eb_mults: dict[str, Any],
    es_text: str,
    eb_text: str,
    passive_text: str = "",
) -> tuple[dict[str, float], str]:
    na_mv = ca_mv = plunge_mv = skill_mv = burst_mv = 0.0
    is_plunge_kit = bool(re.search(r"plung(?:e|ing)\s+attack", f"{es_text}\n{eb_text}\n{passive_text}", re.I))

    for k, v in (na_mults or {}).items():
        if NON_DMG_MULT_RE.search(k):
            continue
        mv = _extract_pct_mv_at_lv10(v)
        if mv <= 0:
            continue
        if re.search(r"plunge", k, re.I):
            plunge_mv += mv * (1.0 if is_plunge_kit else 0.15)
        elif re.search(r"charged|aimed|frostflake|wreath|clusterbloom|prop\s+arrow|equitable|scarlet|kesagiri|shadowhunter", k, re.I):
            ca_mv += mv
        else:
            na_mv += mv

    for k, v in (es_mults or {}).items():
        if NON_DMG_MULT_RE.search(k):
            continue
        skill_mv += _extract_pct_mv_at_lv10(v)

    for k, v in (eb_mults or {}).items():
        if NON_DMG_MULT_RE.search(k):
            continue
        burst_mv += _extract_pct_mv_at_lv10(v)

    combined_skill_burst = f"{es_text}\n{eb_text}"
    damage_conversion = "none"
    conv_prefix = r"(?:normal|charged|plunging|musou\s+isshin|dusk\s+bolt)[^.\n]{0,140}?"
    if re.search(conv_prefix + r"considered\s+(?:as\s+)?elemental\s+burst\s+dmg", combined_skill_burst, re.I):
        damage_conversion = "burst_dmg"
        burst_mv += na_mv + ca_mv + plunge_mv
        na_mv = ca_mv = plunge_mv = 0.0
    elif re.search(conv_prefix + r"considered\s+(?:as\s+)?elemental\s+skill\s+dmg", combined_skill_burst, re.I):
        damage_conversion = "skill_dmg"
        skill_mv += na_mv + ca_mv + plunge_mv
        na_mv = ca_mv = plunge_mv = 0.0

    total = na_mv + ca_mv + plunge_mv + skill_mv + burst_mv
    if total <= 0:
        return {"na": 0.34, "ca": 0.0, "plunge": 0.0, "skill": 0.33, "burst": 0.33}, damage_conversion

    return {
        "na": round(na_mv / total, 4),
        "ca": round(ca_mv / total, 4),
        "plunge": round(plunge_mv / total, 4),
        "skill": round(skill_mv / total, 4),
        "burst": round(burst_mv / total, 4),
    }, damage_conversion


KNOWN_SNAPSHOT_YES = {"Xiangling", "Fischl", "Beidou", "Kaeya", "Rosaria", "Ganyu", "KamisatoAyaka", "Venti", "Sucrose", "KaedeharaKazuha"}
KNOWN_SNAPSHOT_NO = {"Yelan", "Xingqiu", "Furina", "Nahida", "RaidenShogun", "Emilie", "Columbina", "Vodyanitsa"}


def extract_features(char_name: str, char_meta: dict[str, Any], detail: dict[str, Any], patches_map: dict[str, Any]) -> dict[str, Any]:
    key = normalize_key(char_name)
    patch = patches_map.get(key)
    link_map = {str(h["id"]): h for h in (detail.get("hyperlinks") or []) if h and h.get("id") is not None}
    skills = detail.get("skills") or {}
    na = skills.get("normalattack") or detail.get("attacks") or {}
    es = skills.get("elementalskill") or skills.get("skill") or {}
    eb = skills.get("elementalburst") or skills.get("burst") or {}

    na_text = resolve_lunaris_text(na.get("description") or na.get("desc") or "", link_map, na.get("params"))
    es_text = resolve_lunaris_text(es.get("description") or es.get("desc") or "", link_map, es.get("params"))
    eb_text = resolve_lunaris_text(eb.get("description") or eb.get("desc") or "", link_map, eb.get("params"))

    raw_passives = detail.get("passives")
    if isinstance(raw_passives, dict):
        passives_list = [v for _, v in sorted(raw_passives.items(), key=lambda kv: kv[0])]
    elif isinstance(raw_passives, list):
        passives_list = raw_passives
    else:
        passives_list = []
    passive_text = "\n".join(
        f"{p.get('name', '')}: {resolve_lunaris_text(p.get('description') or p.get('desc') or '', link_map, p.get('params'))}"
        for p in passives_list
        if isinstance(p, dict) and (p.get("name") or p.get("description") or p.get("desc"))
    )

    cons_dict = detail.get("constellations") or {}
    cons_list = [v for _, v in sorted(cons_dict.items(), key=lambda kv: kv[0])] if isinstance(cons_dict, dict) else []
    cons_text = "\n".join(
        f"{c.get('name', '')}: {resolve_lunaris_text(c.get('description') or c.get('desc') or '', link_map, c.get('params'))}"
        for c in cons_list
        if isinstance(c, dict)
    )

    talent_text = "\n".join([na_text, es_text, eb_text])
    full_text = "\n".join([talent_text, passive_text])
    non_na_text = "\n".join([es_text, eb_text, passive_text])

    # 1. Scaling & Multiplier Shares + Attack Motion Scores (True Lv. 10 MV-weighted)
    na_mults = na.get("multipliers") or {}
    es_mults = es.get("multipliers") or {}
    eb_mults = eb.get("multipliers") or {}
    mv_shares, damage_conversion = compute_lv10_mv_shares(na_mults, es_mults, eb_mults, es_text, eb_text, passive_text)
    normal_charged_plunge_share = round(mv_shares["na"] + mv_shares["ca"] + mv_shares["plunge"], 4)
    skill_dmg_share = mv_shares["skill"]
    burst_dmg_share = mv_shares["burst"]

    motion = compute_attack_motion_scores(na_mults, es_mults, na_text, es_text, passive_text)

    # New Section 3A kit attributes: baseAtkOnlyBuffer, baselineCritRate, canSnapshot
    base_atk_only_buffer = bool(
        (patch and patch.get("baseAtkOnlyBuffer"))
        or re.search(r"based\s+on[^.]{0,55}\bbase\s+atk\b", non_na_text, re.I)
    )
    asc_crit = float(
        detail.get("ascensionCritRate")
        or (char_meta.get("ascensionStats") or {}).get("CRIT Rate%", 0.0)
        or 0.0
    )
    passive_crit = float(detail.get("passiveCritRate") or 0.0)
    if patch and patch.get("baselineCritRate") is not None:
        baseline_crit_rate = float(patch["baselineCritRate"])
    else:
        baseline_crit_rate = round(5.0 + asc_crit + passive_crit, 2)

    if patch and patch.get("canSnapshot") is not None:
        can_snapshot = bool(patch["canSnapshot"])
    elif key in KNOWN_SNAPSHOT_YES:
        can_snapshot = True
    elif key in KNOWN_SNAPSHOT_NO:
        can_snapshot = False
    else:
        can_snapshot = False

    hp_scale_text = "\n".join(
        s for s in re.split(r"(?<=[.!?\n])\s+|\n+", full_text)
        if not re.search(r"(?:consumes?|loses?|restores?|regenerates?|drains?|inherited\s+hp|hp\s+cost|hp\s+regeneration|bond\s+of\s+life)[^.]{0,45}\bmax\s*hp\b", s, re.I)
        and not re.search(r"\bmax\s*hp\b[^.]{0,45}bond\s+of\s+life", s, re.I)
        and not re.search(r"^\s*(?:hp\s+cost|hp\s+regeneration|inherited\s+hp)", s, re.I)
    )
    hp_hits = (
        len(re.findall(r"\bmax\s*hp\b", hp_scale_text, re.I))
        + (2 if re.search(r"(?:dmg|damage|shield|heal|healing|bonus)[^.]{0,45}(?:of|based\s+on)\s+(?:her|his|their|\w+'s)?\s*max\s*hp", hp_scale_text, re.I) else 0)
        + (2 if re.search(r"every\s+[\d,]+\s+max\s*hp", hp_scale_text, re.I) else 0)
    )
    def_hits = len(re.findall(r"\bdef\b", full_text, re.I)) + (
        2 if re.search(r"based\s+on[^.]{0,45}\bdef\b|atk\s+bonus[^.]{0,60}\bdef\b", full_text, re.I) else 0
    )
    em_hits = len(re.findall(r"\belemental\s+mastery\b", full_text, re.I)) + (
        3 if re.search(r"(?:each|every)\s+(?:\d+\s+)?points?\s+of[^.]{0,40}elemental\s+mastery[^.]{0,90}(?:dmg|damage)", full_text, re.I) else 0
    )
    er_hits = len(re.findall(r"\benergy\s+recharge\b", full_text, re.I)) + (
        2 if re.search(r"energy\s+recharge[^.]{0,80}dmg\s+bonus", full_text, re.I) else 0
    )
    atk_hits = 2 if (hp_hits < 3 and def_hits < 3 and em_hits < 3) else 1
    if re.search(r"every\s+\d+\s+atk\b", passive_text, re.I):
        atk_hits += 3
    total_stat_hits = max(1, hp_hits + atk_hits + def_hits + em_hits + er_hits)

    hp_scaling_share = round(hp_hits / total_stat_hits, 4)
    atk_scaling_share = round(atk_hits / total_stat_hits, 4)
    def_scaling_share = round(def_hits / total_stat_hits, 4)
    em_scaling_share = round(em_hits / total_stat_hits, 4)
    er_scaling_share = round(er_hits / total_stat_hits, 4)

    # 2. Net Energy Economy
    eb_mults = eb.get("multipliers") or {}
    raw_cost_entry = eb_mults.get("Energy Cost")
    if isinstance(raw_cost_entry, list):
        eb_cost_raw = raw_cost_entry[0] if raw_cost_entry else None
    else:
        eb_cost_raw = raw_cost_entry
    if eb_cost_raw is None or str(eb_cost_raw).strip() == "":
        eb_cost_raw = eb.get("energyCost") if eb.get("energyCost") else (eb.get("cost") or 60)
    cost_m = re.search(r"\d+", str(eb_cost_raw))
    burst_energy_cost = 0 if (patch and patch.get("zeroEnergy")) else (int(cost_m.group(0)) if cost_m else 60)

    flat_refund = 0.0
    for mult in [es.get("multipliers") or {}, eb_mults]:
        for lbl, arr in mult.items():
            if re.search(r"energy\s*(?:regeneration|restoration|refund|return)", lbl, re.I):
                sample = arr[9] if isinstance(arr, list) and len(arr) > 9 else (arr[0] if isinstance(arr, list) and arr else arr)
                val_m = re.search(r"[\d.]+", str(sample or ""))
                val = float(val_m.group(0)) if val_m else 0.0
                if 0 < val <= 45:
                    flat_refund += val
    for s in re.split(r"(?<=[.!?\n])\s+|\n+", full_text):
        m = re.search(r"(?:restores?|regenerates?|regains?)\s+([\d.]+)\s+(?:Elemental\s+)?Energy", s, re.I)
        if not m or re.search(r"other\s+nearby\s+party\s+members|allies\s+other\s+than", s, re.I):
            continue
        amt = float(m.group(1))
        if 0 < amt <= 45:
            procs_m = re.search(r"(?:up\s+to|max(?:imum)?\s+of)\s+(\d+)\s+times", s, re.I)
            procs = min(5, int(procs_m.group(1))) if procs_m else 1
            flat_refund += amt * procs
    flat_energy_refund_est = min(burst_energy_cost, round(flat_refund))
    net_cost = max(0, burst_energy_cost - flat_energy_refund_est)
    net_energy_demand = "high" if net_cost >= 65 else "moderate" if net_cost >= 45 else "low"

    # 3. Party Buffing, Shred & Threshold Caps
    non_na_sentences = re.split(r"(?<=[.!?\n])\s+|\n+", non_na_text)
    has_party_buff = any(
        re.search(
            r"(?:grants?|provides?|gains?|receives?|increases?|bonus|restore)[^.\n]{0,70}(?:nearby\s+party\s+members|all\s+party\s+members|other\s+party\s+members|allies|active\s+character|characters?\s+(?:within|inside)[^.\n]{0,25}aoe)|(?:nearby\s+party\s+members|all\s+party\s+members|other\s+party\s+members|active\s+character|characters?\s+(?:within|inside)[^.\n]{0,25}aoe)[^.\n]{0,70}(?:gain|receive|have\s+their|increased|atk\s+bonus|crit|em|dmg)|lead\s+vocal|chorus",
            s,
            re.I,
        )
        and not re.search(r"when\s+a\s+party\s+member\s+triggers", s, re.I)
        and not re.search(r"when\s+the\s+party\s+includes", s, re.I)
        for s in non_na_sentences
    )
    has_res_shred = bool(
        re.search(
            r"(?:pyro|hydro|electro|cryo|anemo|geo|dendro|elemental|physical)[\w\s,]{0,30}\bres\b[\w\s()'-]{0,85}(?:will\s+be|is|are)\s+(?:decreased|reduced)|\bres\b[^.\n]{0,40}(?:is|are|will\s+be)\s+(?:decreased|reduced)|(?:decreas|reduc)(?:es?|ing)\s+(?:nearby\s+)?(?:opponents'?\s+)?[\w\s]{0,25}\bres\b",
            non_na_text,
            re.I,
        )
    )
    has_heal = bool(re.search(r"(?:restores?|regenerates?|heals?)[^.]{0,80}\bHP\b|healing", non_na_text, re.I))
    has_shield = bool(re.search(r"creates?\s+a\s+[^.]{0,20}shield|generates?\s+a\s+shield|shield\s+dmg\s+absorption", non_na_text, re.I))
    has_off_field = bool(
        re.search(
            r"off-field|even\s+when\s+not\s+on\s+the\s+field|coordinated\s+attack|continuously\s+dealing|follows?\s+the\s+active\s+character|chorus|dragon\s+of\s+dark\s+decay|dragon\s+of\s+white\s+flame|salon\s+members|attacks?\s+nearby\s+opponents\s+at\s+intervals",
            non_na_text,
            re.I,
        )
    )
    has_infusion = bool(
        re.search(r"infus(?:es?|ing)|cannot\s+be\s+overridden|converted\s+into\s+(?:pyro|hydro|electro|cryo|dendro|anemo|geo)\s+dmg", full_text, re.I)
    ) or motion["na_focus_score"] >= 0.7 or motion["ca_focus_score"] >= 0.75 or motion["has_skill_stance_na_combo"]
    has_crowd_control = bool(re.search(r"pulls?\s+(?:in\s+)?(?:nearby\s+)?opponents|vortex|vacuum|gather(?:s|ing)?\s+opponents", non_na_text, re.I))
    has_bond_of_life = bool(re.search(r"\bbond\s+of\s+life\b", full_text, re.I))
    has_burning_focus = bool(re.search(r"burning\s+opponents|when\s+opponents\s+are\s+burning|deals?[^.]{0,40}burning\s+dmg", full_text, re.I))
    has_hp_fluctuation = bool(
        re.search(
            r"consumes?\s+hp|hp\s+(?:is\s+)?(?:lost|reduced|drained|fluctuat)|loses?\s+hp|continuously\s+lose\s+hp|suffers?\s+hp\s+loss",
            full_text,
            re.I,
        )
    )
    has_burst_hp_drain = bool(
        re.search(r"after\s+using\s+(?:an\s+)?elemental\s+burst[\s\S]{0,160}?(?:loses?\s+hp|consumes?\s+hp|continuously\s+lose\s+hp)|bane\s+of\s+all\s+evil", full_text, re.I)
    )
    is_physical_carry = bool(
        re.search(r"physical\s+dmg\s+bonus|physical\s+res|superconduct|lightfall\s+sword|deals?\s+physical\s+dmg", non_na_text, re.I)
        and not has_infusion
    )

    if (not patch or patch.get("canSnapshot") is None) and has_off_field and re.search(r"summon|deploy|creates?\s+a\s+(?:lantern|oz|turret|vortex)|pyronado", non_na_text, re.I):
        if key not in KNOWN_SNAPSHOT_NO:
            can_snapshot = True

    threshold_stat = (patch or {}).get("statThresholdCurve", {}).get("statKey") if patch and patch.get("statThresholdCurve") else None
    threshold_cap_value = (patch or {}).get("statThresholdCurve", {}).get("ceiling") if patch and patch.get("statThresholdCurve") else None
    if threshold_cap_value is None:
        rev_m = re.search(
            r"([\d.]+)%\s*(?:increased\s+)?(?:ATK|HP|DEF|EM|DMG)[^.\n]{0,40}for\s+every\s+([\d,]+)\s+(Max\s+HP|HP|ATK|DEF|Elemental\s+Mastery)[\s\S]{0,140}?up\s+to\s+([\d.]+)%",
            passive_text,
            re.I,
        )
        if rev_m:
            per_step = float(rev_m.group(1))
            unit_step = float(rev_m.group(2).replace(",", ""))
            stat_w = rev_m.group(3).upper()
            max_pct = float(rev_m.group(4))
            if per_step > 0 and max_pct > 0:
                threshold_stat = "hp_" if "HP" in stat_w else "def_" if "DEF" in stat_w else "eleMas" if "MASTERY" in stat_w else "atk_"
                threshold_cap_value = round((max_pct / per_step) * unit_step)
    if threshold_cap_value is None:
        cap_m = re.search(
            r"every\s+(?:([\d,]+)\s+(?:points?\s+of\s+)?)?(Max\s+HP|HP|ATK|DEF|Elemental\s+Mastery)[\s\S]{0,160}?(?:by|increases?[^.\d]{0,40})\s*([\d,]+(?:\.\d+)?)(%?)\b[\s\S]{0,200}?max(?:imum)?(?:\s+(?:increase|of))?[^.\d]*([\d,]+(?:\.\d+)?)(%?)",
            passive_text,
            re.I,
        )
        if cap_m:
            unit_step = float(cap_m.group(1).replace(",", "")) if cap_m.group(1) else 1.0
            stat_w = cap_m.group(2).upper()
            ex_m = re.search(r"in\s+excess\s+of\s+([\d,]+)", passive_text[cap_m.start() : cap_m.start() + 160], re.I)
            baseline = float(ex_m.group(1).replace(",", "")) if ex_m else 0.0
            per_step = float(cap_m.group(3).replace(",", ""))
            max_gain = float(cap_m.group(5).replace(",", ""))
            if per_step > 0 and max_gain > 0:
                derived = baseline + (max_gain / per_step) * unit_step
                if (cap_m.group(4) == "%" or cap_m.group(6) == "%") and unit_step == 1 and baseline == 0 and "MASTERY" not in stat_w and derived < 500:
                    derived *= 100
                threshold_stat = "hp_" if "HP" in stat_w else "def_" if "DEF" in stat_w else "eleMas" if "MASTERY" in stat_w else "atk_"
                threshold_cap_value = round(derived)

    # 4. Reaction Conversion & Factions
    p_factions = (patch or {}).get("factions") or []
    is_lunar = "Moonsign" in p_factions or bool(re.search(r"moonsign\s+benediction|convert(?:ed|s)?\s+into\s+(?:the\s+)?lunar[-\s](?:charged|bloom|crystallize)|triggers?\s+a\s+lunar[-\s](?:charged|bloom|crystallize)", full_text, re.I))
    is_stellar_swirl = bool(re.search(r"radiance:\s*stellar\s*swirl|convert(?:ed|s)?[^.\n]{0,40}stellar\s+swirl", full_text, re.I))
    is_stellar_conduct = bool(re.search(r"radiance:\s*stellar[-\s]conduct|convert(?:ed|s)?[^.\n]{0,40}stellar[-\s]conduct", full_text, re.I))
    is_stellar = "Stellar" in p_factions or is_stellar_swirl or is_stellar_conduct or bool(re.search(r"stellar\s+jubilee|polestar\s+field", full_text, re.I))
    is_hexerei = "Hexerei" in p_factions or bool(re.search(r"witch'?s\s+(?:eve\s+rite|homework)|hexerei", full_text, re.I))
    is_nightsoul = "Nightsoul" in p_factions or bool(re.search(r"nightsoul", full_text, re.I))
    factions = list(dict.fromkeys([*p_factions, *(["Hexerei"] if is_hexerei else []), *(["Moonsign"] if is_lunar else []), *(["Nightsoul"] if is_nightsoul else []), *(["Stellar"] if is_stellar else [])]))

    reaction_converter_type = "lunar" if is_lunar else "stellar" if is_stellar else "none"
    enables_reaction_crit = is_lunar or is_stellar

    # 5. Multi-Stance & Constellation Shifts
    has_dual_stance_or_mode = bool((patch or {}).get("explicitModes")) or bool(
        re.search(r"essential\s+transmutation|white\s+flame[\s\S]{0,400}dark\s+decay|ousia[\s\S]{0,120}pneuma|two\s+forms|switches?\s+between", full_text, re.I)
    )
    has_constellation_role_shift = bool((patch or {}).get("constellationShifts")) or bool(
        re.search(r"(?:pyro|hydro|electro|cryo|anemo|geo|dendro)\s+infusion|infused\s+with\s+(?:pyro|hydro|electro|cryo|anemo|geo|dendro)|normal\s+attack[\s\S]{0,60}converted", cons_text, re.I)
    )
    is_non_crit = bool(re.search(r"-\s*100%\s*crit\s*rate|crit\s*rate\s*(?:is\s*)?(?:decreased|reduced)\s*by\s*100%|cannot\s+deal\s+crit", passive_text, re.I))

    t_vec = extract_sub_block_signals(talent_text)
    p_vec = extract_sub_block_signals(passive_text)
    div_score = round(float(np.linalg.norm(np.array(t_vec) - np.array(p_vec))), 3)
    has_tradeoff = div_score >= 1.15 or bool((patch or {}).get("explicitModes")) or threshold_cap_value is not None

    channel_shares = (patch or {}).get("channelShares")
    if not channel_shares:
        if is_lunar:
            channel_shares = {"direct": 0.25, "amp": 0.0, "additive": 0.0, "transformative": 0.0, "lunar_crit": 0.75, "stellar_crit": 0.0}
        elif is_stellar:
            channel_shares = {"direct": 0.3, "amp": 0.0, "additive": 0.0, "transformative": 0.0, "lunar_crit": 0.0, "stellar_crit": 0.7}
        elif em_scaling_share >= 0.45 and re.search(r"hyperbloom|burgeon|bloom|swirl", full_text, re.I):
            channel_shares = {"direct": 0.25, "amp": 0.0, "additive": 0.0, "transformative": 0.75, "lunar_crit": 0.0, "stellar_crit": 0.0}
        elif re.search(r"vaporize|melt", full_text, re.I):
            channel_shares = {"direct": 0.5, "amp": 0.5, "additive": 0.0, "transformative": 0.0, "lunar_crit": 0.0, "stellar_crit": 0.0}
        elif re.search(r"aggravate|spread|quicken", full_text, re.I):
            channel_shares = {"direct": 0.45, "amp": 0.0, "additive": 0.55, "transformative": 0.0, "lunar_crit": 0.0, "stellar_crit": 0.0}
        else:
            channel_shares = {"direct": 1.0, "amp": 0.0, "additive": 0.0, "transformative": 0.0, "lunar_crit": 0.0, "stellar_crit": 0.0}

    supply = {d: 0.0 for d in SUPPLY_DIMS}
    demand = {d: 0.0 for d in SUPPLY_DIMS}
    if has_res_shred: supply["resShred"] = 0.85
    if has_heal: supply["teamHeal"] = 0.85
    if has_shield: supply["shield"] = 0.9
    if has_party_buff and re.search(r"atk", non_na_text, re.I): supply["teamAtk"] = 0.75
    if has_party_buff and re.search(r"elemental\s+mastery|\bem\b", non_na_text, re.I): supply["teamEm"] = 0.75
    if has_party_buff and re.search(r"dmg", non_na_text, re.I) and not re.search(r"base\s+dmg", non_na_text, re.I): supply["teamDmgPct"] = 0.75
    if re.search(r"base\s+dmg|lead\s+vocal|chorus", non_na_text, re.I): supply["teamBaseDmg"] = 0.9
    if has_off_field: supply["offFieldAura"] = 0.8
    if flat_energy_refund_est > 0 or re.search(r"energy", non_na_text, re.I): supply["battery"] = 0.35
    if has_hp_fluctuation: supply["hpFluctuation"] = 0.7
    if has_crowd_control: supply["crowdControl"] = 0.8

    if net_energy_demand == "high": demand["battery"] = 0.9
    elif net_energy_demand == "moderate": demand["battery"] = 0.45
    if has_infusion or normal_charged_plunge_share >= 0.35:
        demand["offFieldAura"] = 0.8
        demand["resShred"] = 0.8
        demand["teamAtk"] = 0.8 if atk_scaling_share >= 0.4 else 0.2
        demand["teamDmgPct"] = 0.1 if (is_lunar or is_stellar) else 0.75
    elif has_off_field:
        demand["resShred"] = 0.65
        demand["teamDmgPct"] = 0.1 if (is_lunar or is_stellar) else 0.6
    if patch and patch.get("supplyOverrides"): supply.update(patch["supplyOverrides"])
    if patch and patch.get("demandOverrides"): demand.update(patch["demandOverrides"])

    vector = [
        hp_scaling_share,
        atk_scaling_share,
        def_scaling_share,
        em_scaling_share,
        er_scaling_share,
        burst_dmg_share,
        skill_dmg_share,
        normal_charged_plunge_share,
        motion["na_focus_score"],
        motion["ca_focus_score"],
        motion["plunge_focus_score"],
        round(burst_energy_cost / 90.0, 4),
        1.0 if flat_energy_refund_est > 0 else 0.0,
        round(flat_energy_refund_est / 40.0, 4),
        1.0 if has_party_buff else 0.0,
        1.0 if has_res_shred else 0.0,
        1.0 if threshold_cap_value is not None else 0.0,
        1.0 if has_heal else 0.0,
        1.0 if has_shield else 0.0,
        1.0 if has_off_field else 0.0,
        1.0 if has_infusion else 0.0,
        1.0 if is_lunar else 0.0,
        1.0 if is_stellar else 0.0,
        1.0 if enables_reaction_crit else 0.0,
        1.0 if has_dual_stance_or_mode else 0.0,
        1.0 if has_constellation_role_shift else 0.0,
    ]

    if patch and patch.get("goldRoles"):
        g_set = set(patch["goldRoles"])
        y = [1 if lbl in g_set else 0 for lbl in ROLE_LABELS]
        sample_weight = 4.0
    else:
        y = [
            1 if (has_infusion or normal_charged_plunge_share >= 0.45) and not (has_party_buff and not has_infusion) else 0,
            1 if (has_off_field or burst_dmg_share >= 0.4 or skill_dmg_share >= 0.45) and not has_infusion else 0,
            1 if (has_party_buff or has_res_shred or threshold_cap_value is not None) else 0,
            1 if (has_heal or has_shield) else 0,
            1 if (is_lunar or is_stellar or em_scaling_share >= 0.35 or has_res_shred) else 0,
        ]
        if sum(y) == 0:
            y[0] = 1
        sample_weight = 1.0

    element = ELEMENT_NORMALIZE.get(char_meta.get("element"), char_meta.get("element") or "Unknown")
    weapon_type = WEAPON_NORMALIZE.get(char_meta.get("weaponType"), char_meta.get("weaponType") or "Sword")

    return {
        "name": char_name,
        "key": key,
        "element": element,
        "weaponType": weapon_type,
        "patch": patch,
        "dataSource": char_meta.get("dataSource", "lunaris"),
        "baseAtkOnlyBuffer": base_atk_only_buffer,
        "canSnapshot": can_snapshot,
        "baselineCritRate": baseline_crit_rate,
        "mvShares": mv_shares,
        "damageConversion": damage_conversion,
        "sampleWeight": sample_weight,
        "vector": vector,
        "labels": y,
        "is_non_crit": is_non_crit,
        "factions": factions,
        "talentVector": t_vec,
        "passiveVector": p_vec,
        "divergenceScore": div_score,
        "hasTradeoff": has_tradeoff,
        "channelShares": channel_shares,
        "supply": supply,
        "demand": demand,
        "rawSections": {
            "na": strip_markup(na.get("description") or na.get("desc") or ""),
            "skill": strip_markup(es.get("description") or es.get("desc") or ""),
            "burst": strip_markup(eb.get("description") or eb.get("desc") or ""),
            "passives": [
                {
                    "name": p.get("name", f"Passive {idx + 1}"),
                    "text": resolve_lunaris_text(p.get("description") or p.get("desc") or "", link_map, p.get("params")),
                }
                for idx, p in enumerate(passives_list)
                if isinstance(p, dict) and (p.get("name") or p.get("description") or p.get("desc"))
            ],
            "constellations": [
                {
                    "tag": f"C{idx + 1}",
                    "name": c.get("name", f"C{idx + 1}"),
                    "text": strip_markup(c.get("description") or c.get("desc") or ""),
                }
                for idx, c in enumerate(cons_list)
                if isinstance(c, dict) and (c.get("name") or c.get("description") or c.get("desc"))
            ],
        },
        "features": {
            "hp_scaling_share": hp_scaling_share,
            "atk_scaling_share": atk_scaling_share,
            "def_scaling_share": def_scaling_share,
            "em_scaling_share": em_scaling_share,
            "er_scaling_share": er_scaling_share,
            "burst_dmg_share": burst_dmg_share,
            "skill_dmg_share": skill_dmg_share,
            "normal_charged_plunge_share": normal_charged_plunge_share,
            "na_focus_score": motion["na_focus_score"],
            "ca_focus_score": motion["ca_focus_score"],
            "plunge_focus_score": motion["plunge_focus_score"],
            "has_lv2_charged_shot": motion["has_lv2_charged_shot"],
            "has_skill_stance_na_combo": motion["has_skill_stance_na_combo"],
            "burst_energy_cost": burst_energy_cost,
            "zero_energy": bool(patch and patch.get("zeroEnergy")),
            "has_self_energy_refund": flat_energy_refund_est > 0,
            "flat_energy_refund_est": flat_energy_refund_est,
            "net_energy_demand": net_energy_demand,
            "has_party_buff": has_party_buff,
            "has_res_shred": has_res_shred,
            "has_stat_threshold_cap": threshold_cap_value is not None,
            "threshold_stat": threshold_stat,
            "threshold_cap_value": threshold_cap_value,
            "has_heal": has_heal,
            "has_shield": has_shield,
            "has_off_field": has_off_field,
            "has_infusion": has_infusion,
            "reaction_converter_type": reaction_converter_type,
            "enables_reaction_crit": enables_reaction_crit,
            "is_hexerei": is_hexerei,
            "is_nightsoul": is_nightsoul,
            "is_stellar_swirl": is_stellar_swirl,
            "is_stellar_conduct": is_stellar_conduct,
            "has_bond_of_life": has_bond_of_life,
            "has_burning_focus": has_burning_focus,
            "has_burst_hp_drain": has_burst_hp_drain,
            "is_physical_carry": is_physical_carry,
            "has_dual_stance_or_mode": has_dual_stance_or_mode,
            "has_constellation_role_shift": has_constellation_role_shift,
            "quadratic_aoe": bool(patch and patch.get("quadraticAoe")),
        },
    }


def build_lenses_and_recs(row: dict[str, Any], role_probs: dict[str, float]) -> dict[str, Any]:
    f = row["features"]
    elem = row["element"]
    patch = row["patch"] or {}
    lenses = []

    if patch.get("explicitModes"):
        for m in patch["explicitModes"]:
            lenses.append({"id": m["lens"], "modeId": m["id"], "label": m["label"], "condition": m["condition"]})
    else:
        active_role_set = set(patch["goldRoles"]) if patch.get("goldRoles") else None
        is_dedicated_carry = (
            (active_role_set is not None and "on_field_carry" in active_role_set and "support_buffer" not in active_role_set and "sustain_utility" not in active_role_set)
            or (role_probs["on_field_carry"] >= 0.75 and not f["has_off_field"] and not f["has_shield"] and not f["has_res_shred"])
        )
        cands = []
        if (active_role_set and "on_field_carry" in active_role_set) or (not active_role_set and role_probs["on_field_carry"] >= 0.45) or f["has_infusion"]:
            cands.append({"prob": role_probs["on_field_carry"], "id": "On-Field Carry", "label": "On-Field Carry", "condition": "Active infusion / Charged / Normal Attack carry"})
        if not is_dedicated_carry and ((active_role_set and "off_field_sub_dps" in active_role_set) or (not active_role_set and (role_probs["off_field_sub_dps"] >= 0.5 or f["has_off_field"]))):
            cands.append({"prob": role_probs["off_field_sub_dps"] - (0.25 if f["has_infusion"] else 0.0), "id": "Off-Field Sub-DPS", "label": "Off-Field Sub-DPS", "condition": "Personal off-field Skill/Burst damage"})
        if not is_dedicated_carry and ((active_role_set and ("support_buffer" in active_role_set or "sustain_utility" in active_role_set)) or (not active_role_set and (role_probs["support_buffer"] >= 0.55 or role_probs["sustain_utility"] >= 0.55))):
            cands.append({
                "prob": max(role_probs["support_buffer"], role_probs["sustain_utility"]),
                "id": "Quickswap Support",
                "label": "Support / Utility" if (f["has_res_shred"] or f["has_party_buff"]) else "Sustain / Support",
                "condition": "Team buffing, shred, or sustain focus",
            })
        cands.sort(key=lambda x: x["prob"], reverse=True)
        for c in cands:
            lenses.append({"id": c["id"], "label": c["label"], "condition": c["condition"]})

    if f["has_constellation_role_shift"] and not any(l["id"] == "On-Field Carry" for l in lenses):
        cs_label = (patch.get("constellationShifts") or [{}])[0].get("label", "Constellation-unlocked carry mode")
        lenses.append({"id": "On-Field Carry", "label": "On-Field Carry (Constellation Shift)", "condition": cs_label})
    if not lenses:
        lenses.append({"id": "On-Field Carry", "label": "On-Field Carry", "condition": "Default kit role"})

    shares = sorted(
        [
            ("atk_", f["atk_scaling_share"]),
            ("hp_", f["hp_scaling_share"]),
            ("def_", f["def_scaling_share"]),
            ("eleMas", f["em_scaling_share"]),
            ("enerRech_", f["er_scaling_share"]),
        ],
        key=lambda x: x[1],
        reverse=True,
    )
    primary_scaler = patch.get("primaryScaler") or shares[0][0]
    has_crit = not row["is_non_crit"] and (row["channelShares"]["transformative"] < 0.7 or f["enables_reaction_crit"])

    stat_weights = {
        "hp": 0.5 if primary_scaler == "hp_" else 0.0,
        "hp_": 1.0 if primary_scaler == "hp_" else 0.0,
        "atk": 0.25 if primary_scaler == "atk_" else 0.0,
        "atk_": 1.0 if primary_scaler == "atk_" else 0.0,
        "def": 0.5 if primary_scaler == "def_" else 0.0,
        "def_": 1.0 if primary_scaler == "def_" else 0.0,
        "eleMas": (1.0 if (primary_scaler == "eleMas" or row["channelShares"]["transformative"] >= 0.65) else 0.75)
        if (f["em_scaling_share"] >= 0.25 or row["channelShares"]["transformative"] >= 0.5)
        else (0.5 if (f["enables_reaction_crit"] or row["channelShares"]["amp"] >= 0.3) else 0.0),
        "enerRech_": 0.0 if f["zero_energy"] else (1.0 if f["net_energy_demand"] == "high" else 0.65 if f["net_energy_demand"] == "moderate" else 0.4),
        "critRate_": (1.0 if (f["enables_reaction_crit"] or f["burst_dmg_share"] >= 0.2 or f["normal_charged_plunge_share"] >= 0.2 or role_probs["on_field_carry"] >= 0.45) else 0.35) if has_crit else 0.0,
        "critDMG_": (1.0 if (f["enables_reaction_crit"] or f["burst_dmg_share"] >= 0.2 or f["normal_charged_plunge_share"] >= 0.2 or role_probs["on_field_carry"] >= 0.45) else 0.35) if has_crit else 0.0,
    }

    recs = []
    if f["enables_reaction_crit"] and f["reaction_converter_type"] == "lunar":
        if role_probs["on_field_carry"] >= 0.45:
            recs.append({"set": "4pc Night of the Sky's Unveiling", "lens": "On-Field Carry", "note": "On-field Lunar +30% CRIT Rate & +10% Team Lunar DMG"})
        if role_probs["off_field_sub_dps"] >= 0.45 or f["has_off_field"]:
            recs.append({"set": "4pc Aubade of Morningstar and Moon", "lens": "Off-Field Sub-DPS", "note": "Off-field Lunar Reaction DMG (+20% / +60%)"})
        if f["has_party_buff"] or role_probs["support_buffer"] >= 0.45:
            recs.append({"set": "4pc Silken Moon's Serenade", "lens": "Support / Utility", "note": "Team +120 EM & +10% Lunar Reaction DMG"})
    if f["is_hexerei"]:
        if f["has_party_buff"] or f["has_res_shred"] or role_probs["support_buffer"] >= 0.45:
            recs.append({"set": "4pc Celestial Gift", "lens": "Support / Utility", "note": "Hexerei Skill: Team +20–40% Elemental DMG Bonus"})
        if role_probs["off_field_sub_dps"] >= 0.45 or role_probs["on_field_carry"] >= 0.45:
            recs.append({"set": "4pc A Day Carved From Rising Winds", "lens": "Personal DPS / Sub-DPS", "note": "Hexerei: +43% ATK & +20% CRIT Rate (works off-field)"})
    if f["reaction_converter_type"] == "stellar":
        if f["is_stellar_conduct"]:
            recs.append({"set": "4pc Disenchantment in Deep Shadow", "lens": "Stellar-Conduct", "note": "+40% Stellar-Conduct DMG & +16% CRIT Rate"})
        if f["has_party_buff"] or f["has_off_field"]:
            recs.append({"set": "4pc Heart of the Furnace", "lens": "Support / Off-Field", "note": "Team +50% Stellar Glimmer DMG (works off-field)"})
        if f["is_stellar_swirl"]:
            recs.append({"set": "4pc Scarlet Proof", "lens": "Stellar Swirl", "note": "+40% Stellar Swirl DMG & +16% CRIT Rate"})
    if f["zero_energy"] and elem == "Cryo":
        recs.append({"set": "4pc Finale of the Deep Galleries", "lens": "On-Field / Quickswap", "note": "0-Energy Cryo +60% NA & Burst DMG"})
    if f["is_nightsoul"]:
        if f["has_party_buff"] or role_probs["support_buffer"] >= 0.45:
            recs.append({"set": "4pc Scroll of the Hero of Cinder City", "lens": "Support / Utility", "note": "Nightsoul team Elemental DMG% (+40%) + Energy"})
        if role_probs["on_field_carry"] >= 0.45:
            recs.append({"set": "4pc Obsidian Codex", "lens": "On-Field Carry", "note": "On-field Nightsoul +15% DMG & +40% CRIT Rate"})
    if elem == "Anemo" and (f["has_party_buff"] or f["has_off_field"]) and not f["is_stellar_swirl"]:
        recs.append({"set": "4pc Viridescent Venerer", "lens": "Support / Utility", "note": "-40% Elemental RES shred + Swirl DMG"})
    if elem == "Dendro" and (f["has_party_buff"] or f["has_off_field"]):
        recs.append({"set": "4pc Deepwood Memories", "lens": "Support / Utility", "note": "-30% Dendro RES shred"})
    if f["burst_dmg_share"] >= 0.3 and f["net_energy_demand"] == "high" and not f["zero_energy"]:
        recs.append({"set": "4pc Emblem of Severed Fate", "lens": "Off-Field Sub-DPS", "note": "High net ER demand + Burst DMG conversion"})
    if (f["has_party_buff"] or f["has_res_shred"] or role_probs["support_buffer"] >= 0.55) and f["burst_energy_cost"] > 0:
        recs.append({"set": "4pc Noblesse Oblige", "lens": "Support / Utility", "note": "Team +20% ATK after Burst"})
    if f["has_off_field"] and f["skill_dmg_share"] >= 0.3:
        recs.append({"set": "4pc Golden Troupe", "lens": "Off-Field Sub-DPS", "note": "Off-field Skill DMG (+70%)"})
    if f["has_stat_threshold_cap"] and f["threshold_stat"] == "hp_":
        recs.append({"set": "4pc Tenacity of the Millelith", "lens": "Support / Utility", "note": "HP% threshold + Team +20% ATK"})
    if not recs:
        p_lbl = "HP%" if primary_scaler == "hp_" else "EM" if primary_scaler == "eleMas" else "ATK%"
        recs.append({"set": f"2pc {elem} DMG% + 2pc {p_lbl}", "lens": lenses[0]["label"], "note": "Flexible high-substat setup"})

    return {"playstyleLenses": lenses, "statWeights": stat_weights, "recommendedSets": recs[:3], "primaryScaler": primary_scaler}


MECH_CLAUSE_RE = re.compile(
    r"\d+%|every\s+[\d,]+\s+(?:points?\s+of\s+)?(?:max\s+)?(?:hp|atk|def|elemental\s+mastery)|up\s+to\s+[\d.]+|max(?:imum)?\s+(?:of\s+)?\d+|"
    r"\b(?:res|crit|atk|hp|def|em|er|energy|dmg|heal|shield|infus|off-field|cannot|only\s+when|converted\s+into|bond\s+of\s+life|"
    r"nightsoul|lunar|stellar|hexerei|stacks?|duration|cd|reduces?|decreases?|increases?|grants?|restores?|pulls?|vortex|shred)\b",
    re.I,
)


def compress_razor_clause(clause: str, char_name: str) -> str:
    c = re.sub(r"\s+", " ", str(clause or "").strip())
    if not c:
        return ""
    # Strip character's full name & boilerplate openers
    if char_name:
        c = re.sub(rf"\b{re.escape(char_name)}(?:'s)?\b", "", c, flags=re.I)
    c = re.sub(r"^(?:additionally|furthermore|moreover|meanwhile|in\s+this\s+state|while\s+in\s+this\s+state|when\s+this\s+effect\s+is\s+active),?\s*", "", c, flags=re.I)
    c = re.sub(r"\ball\s+nearby\s+party\s+members\b|\bnearby\s+party\s+members\b|\ball\s+party\s+members\b|\bother\s+party\s+members\b", "team", c, flags=re.I)
    c = re.sub(r"\bthe\s+(?:equipping\s+)?active\s+character\b|\bactive\s+character\b", "on-field unit", c, flags=re.I)
    c = re.sub(r"\bElemental\s+Skill\b", "E", c, flags=re.I)
    c = re.sub(r"\bElemental\s+Burst\b", "Q", c, flags=re.I)
    c = re.sub(r"\bNormal\s+Attack(s)?\b", r"NA\1", c, flags=re.I)
    c = re.sub(r"\bCharged\s+Attack(s)?\b", r"CA\1", c, flags=re.I)
    c = re.sub(r"\bPlunging\s+Attack(s)?\b", r"Plunge\1", c, flags=re.I)
    c = re.sub(r"\bElemental\s+Mastery\b", "EM", c, flags=re.I)
    c = re.sub(r"\bEnergy\s+Recharge\b", "ER", c, flags=re.I)
    c = re.sub(r"\bnearby\s+opponents(?:'s|')?\b|\bopponents(?:'s|')?\b", "enemies", c, flags=re.I)
    c = re.sub(r"\bwill\s+be\s+(?:decreased|reduced)\s+by\b|\bis\s+(?:decreased|reduced)\s+by\b|\breduces?\s+([^.]{1,35}?)\s+by\b", r"-\1", c, flags=re.I)
    c = re.sub(r"\s{2,}", " ", c).strip(" ,;-")
    if c:
        c = c[0].upper() + c[1:]
    return c


def extract_razor_clauses(raw_text: str, char_name: str, is_na: bool = False) -> list[str]:
    text = str(raw_text or "").strip()
    if not text:
        return []
    # Split across ALL paragraphs and sentences — never truncate by character count
    raw_lines = [ln.strip() for ln in re.split(r"\n+", text) if ln.strip()]
    bullets: list[str] = []
    seen_norm: set[str] = set()

    for ln in raw_lines:
        # Strip italic/quoted lore lines (*"..."* or "...")
        if re.match(r'^[*"]+', ln) or re.search(r'"[^"]{15,}"$', ln):
            continue
        # Skip generic NA/CA/Plunge boilerplate unless it contains special scaling/conversion/Lv2 shot
        if is_na and re.match(r"^(?:Normal Attack|Charged Attack|Plunging Attack)\s*$", ln, re.I):
            continue
        if is_na and re.search(r"performs?\s+up\s+to\s+\d+\s+(?:consecutive|rapid)\s+(?:strikes|shots)|consumes\s+a\s+certain\s+amount\s+of\s+Stamina\s+to\s+unleash|plunges\s+from\s+mid-air", ln, re.I):
            continue
        sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+", ln) if s.strip()]
        for s in sents:
            if s.startswith('"') or s.startswith('*') or s.endswith('"'):
                continue
            if not MECH_CLAUSE_RE.search(s):
                continue
            comp = compress_razor_clause(s, char_name)
            if not comp or len(comp) < 8:
                continue
            nk = re.sub(r"[^a-z0-9]", "", comp.lower())[:55]
            if nk in seen_norm:
                continue
            seen_norm.add(nk)
            bullets.append(comp)

    return bullets


def build_razor_summary(row: dict[str, Any], primary_scaler: str) -> dict[str, Any]:
    f = row["features"]
    patch = row["patch"] or {}
    raw = row["rawSections"]
    name = row["name"]

    # Primary Stat & Gotcha Rule (no guessed rotation loops — only factual kit rules)
    scaler_map = {"hp_": "HP%", "atk_": "ATK%", "def_": "DEF%", "eleMas": "EM", "enerRech_": "ER%"}
    s_lbl = scaler_map.get(primary_scaler, "ATK%")
    rules = [f"Scales off {s_lbl}"]
    if f["has_stat_threshold_cap"] and f["threshold_cap_value"]:
        cap_stat = scaler_map.get(f["threshold_stat"], s_lbl)
        rules.append(f"Cap: {f['threshold_cap_value']:,} {cap_stat}")
    if f["zero_energy"]:
        rules.append("0-Energy kit (ER% dead stat)")
    elif f["burst_dmg_share"] < 0.22 and (f["na_focus_score"] >= 0.75 or f["ca_focus_score"] >= 0.75) and not f["has_burst_hp_drain"]:
        rules.append("Q optional (ER% low value)")
    if f["enables_reaction_crit"]:
        rules.append(f"{f['reaction_converter_type'].title()} CRIT: DMG% Goblet & Furina Fanfare don't apply")
    if patch.get("teamElementLock"):
        rules.append(patch["teamElementLock"].get("label", "Element lock"))
    if patch.get("elementCountRule"):
        rules.append(patch["elementCountRule"].get("label", "Team element rule"))

    na_bullets = extract_razor_clauses(raw["na"], name, is_na=True)
    if not na_bullets:
        if f["ca_focus_score"] >= 0.75:
            na_bullets = ["Core damage comes from Charged Attacks / Lv.2 Aimed Shots."]
        elif f["na_focus_score"] >= 0.7:
            na_bullets = ["Core damage comes from Normal Attack strings."]
        elif f["has_infusion"]:
            na_bullets = ["Standard NA / CA multipliers (infused/buffed by Skill or Burst)."]
        else:
            na_bullets = ["Standard Normal / Charged / Plunge multipliers."]

    skill_bullets = extract_razor_clauses(raw["skill"], name) or ["Deals Elemental Skill DMG."]
    burst_bullets = extract_razor_clauses(raw["burst"], name) or ["Deals Elemental Burst DMG."]

    return {
        "statsRule": " · ".join(rules),
        "na": na_bullets,
        "skill": skill_bullets,
        "burst": burst_bullets,
        "passives": [
            {"name": p["name"], "bullets": extract_razor_clauses(p["text"], name) or ["Utility / exploration passive."]}
            for p in raw["passives"]
        ],
        "constellations": [
            {"tag": c["tag"], "name": c["name"], "bullets": extract_razor_clauses(c["text"], name) or ["Minor constellation upgrade."]}
            for c in raw["constellations"]
        ],
    }


def vectorize_artifact_set(name: str, two_pc: str, four_pc: str) -> dict[str, Any]:
    txt = f"{two_pc} {four_pc}"
    lk_name = norm_lower_key(name)
    weapon_types = None
    if re.search(r"uses\s+a\s+catalyst\s+or\s+a\s+bow", four_pc, re.I):
        weapon_types = ["Catalyst", "Bow"]
    elif re.search(r"uses\s+a\s+sword,\s*claymore\s+or\s+polearm", four_pc, re.I):
        weapon_types = ["Sword", "Claymore", "Polearm"]

    ca_only = bool(re.search(r"increases?\s+(?:their\s+)?charged\s+attack\s+dmg", four_pc, re.I) and not re.search(r"normal", four_pc, re.I))
    na_only = bool(re.search(r"increases?\s+(?:their\s+)?normal\s+attack\s+dmg", four_pc, re.I) and not re.search(r"charged", four_pc, re.I))
    na_and_ca = bool(
        re.search(r"normal\s*(?:/|,|\s+(?:attack\s+)?and)\s*charged", txt, re.I)
        or re.search(r"normal,\s*charged,\s*and\s*plunging", txt, re.I)
    )
    is_classic_non_stellar = lk_name in ("viridescentvenerer", "thunderingfury")

    return {
        "weaponTypes": weapon_types,
        "caOnly": 1 if ca_only else 0,
        "naOnly": 1 if na_only else 0,
        "naAndCa": 1 if na_and_ca else 0,
        "onField": 1 if re.search(r"(?:while|if)\s+the\s+(?:equipping\s+)?character\s+is\s+on\s+the\s+field|normal\s+attack|charged\s+attack|normal\s*/\s*charged|normal,\s*charged|normal\s+and\s+charged|nightsoul'?s\s+blessing.*on\s+the\s+field", txt, re.I) else 0,
        "offField": 1 if (re.search(r"off[- ]field|not\s+on\s+the\s+field", txt, re.I) and not re.search(r"normal,\s*charged,\s*and\s*plunging", txt, re.I)) else 0,
        "skillDmg": 1 if re.search(r"elemental\s+skill\s+dmg", txt, re.I) else 0,
        "burstDmg": 1 if re.search(r"elemental\s+burst\s+dmg", txt, re.I) else 0,
        "highEr": 1 if (re.search(r"energy\s+recharge", two_pc, re.I) or re.search(r"of\s+energy\s+recharge", four_pc, re.I)) else 0,
        "zeroEnergy": 1 if re.search(r"0\s+elemental\s+energy", txt, re.I) else 0,
        "teamBuff": 1 if (re.search(r"all\s+(?:nearby\s+)?party\s+members|shield\s+strength|party\s+members'\s+(?:atk|em|dmg|crit|elemental)", txt, re.I) and lk_name != "gildeddreams") else 0,
        "resShred": 1 if re.search(r"res\s+by\s+\d+%|decreases?\s+opponents'?\s+[\w\s]+res", txt, re.I) else 0,
        "hpScaler": 1 if re.search(r"hp\s*\+|max\s+hp", two_pc, re.I) else 0,
        "atkScaler": 1 if re.search(r"atk\s*\+", two_pc, re.I) else 0,
        "defScaler": 1 if re.search(r"def\s*\+", two_pc, re.I) else 0,
        "emScaler": 1 if re.search(r"elemental\s+mastery", two_pc, re.I) else 0,
        "lunar": 1 if re.search(r"lunar\s+reaction|moonsign", txt, re.I) else 0,
        "stellar": 1 if (not is_classic_non_stellar and re.search(r"polestar\s+field|stellar\s+glimmer|stellar[- ]?(?:conduct|swirl)", txt, re.I)) else 0,
        "stellarSwirl": 1 if (not is_classic_non_stellar and re.search(r"stellar\s+swirl", txt, re.I)) else 0,
        "stellarConduct": 1 if (not is_classic_non_stellar and re.search(r"stellar[- ]?conduct", txt, re.I)) else 0,
        "stellarGlimmer": 1 if (not is_classic_non_stellar and re.search(r"stellar\s+glimmer", txt, re.I)) else 0,
        "hexerei": 1 if re.search(r"witch'?s\s+homework|hexerei", txt, re.I) else 0,
        "nightsoul": 1 if re.search(r"nightsoul", txt, re.I) else 0,
        "bondOfLife": 1 if re.search(r"\bbond\s+of\s+life\b", four_pc, re.I) else 0,
        "burning": 1 if re.search(r"\bburning\s+opponents\b", four_pc, re.I) else 0,
        "bloomOnly": 1 if re.search(r"bloom,\s*hyperbloom,\s*and\s*burgeon", four_pc, re.I) else 0,
        "burstHpDrain": 1 if re.search(r"after\s+using\s+an\s+elemental\s+burst[\s\S]{0,120}?when\s+the\s+character'?s\s+hp\s+decreases", four_pc, re.I) else 0,
        "hpFluctuation": 1 if re.search(r"hp\s+increases\s+or\s+decreases", txt, re.I) else 0,
        "plunge": 1 if (re.search(r"plunging\s+attack", txt, re.I) and not na_and_ca) else 0,
        "heal": 1 if (re.search(r"healing\s+(?:bonus|effectiveness)", two_pc, re.I) or re.search(r"sea-dyed\s+foam|record\s+the\s+total\s+amount\s+of\s+healing", four_pc, re.I)) else 0,
        "cryo": 1 if re.search(r"cryo\s+dmg\s+bonus", two_pc, re.I) else 0,
        "pyro": 1 if re.search(r"pyro\s+dmg\s+bonus", two_pc, re.I) else 0,
        "hydro": 1 if re.search(r"hydro\s+dmg\s+bonus", two_pc, re.I) else 0,
        "electro": 1 if re.search(r"electro\s+dmg\s+bonus", two_pc, re.I) else 0,
        "anemo": 1 if re.search(r"anemo\s+dmg\s+bonus", two_pc, re.I) else 0,
        "dendro": 1 if re.search(r"dendro\s+dmg\s+bonus", two_pc, re.I) else 0,
        "geo": 1 if re.search(r"geo\s+dmg\s+bonus", two_pc, re.I) else 0,
        "phys": 1 if re.search(r"physical\s+dmg", two_pc, re.I) else 0,
        "shield": 1 if re.search(r"shield\s+strength", two_pc, re.I) else 0,
        "reactionEm": 1 if re.search(r"within\s+8s\s+of\s+triggering\s+an\s+elemental\s+reaction|vaporize|melt|aggravate|spread", four_pc, re.I) else 0,
    }


def load_dimbreath_bundle() -> tuple[dict[str, tuple[dict[str, Any], dict[str, Any]]], list[dict[str, Any]]]:
    """
    4-hop AnimeGameData adapter (spoiler-free whitelisted configs + in-memory TextMap filter).
    Returns:
      chars_by_cid: {str(avatar_id): (meta_dict, detail_dict)}
      dimbreath_sets: list of released 5-star reliquary set records
    """
    avatars_raw = load_excel("ExcelBinOutput/AvatarExcelConfigData.json")
    promotes_raw = load_excel("ExcelBinOutput/AvatarPromoteExcelConfigData.json")
    depots = {d["id"]: d for d in load_excel("ExcelBinOutput/AvatarSkillDepotExcelConfigData.json") if d.get("id")}
    skills = {s["id"]: s for s in load_excel("ExcelBinOutput/AvatarSkillExcelConfigData.json") if s.get("id")}
    prouds_raw = load_excel("ExcelBinOutput/ProudSkillExcelConfigData.json")
    talents_map = {t["talentId"]: t for t in load_excel("ExcelBinOutput/AvatarTalentExcelConfigData.json") if t.get("talentId")}
    reliquary_sets_raw = load_excel("ExcelBinOutput/ReliquarySetExcelConfigData.json")
    equip_affixes_raw = load_excel("ExcelBinOutput/EquipAffixExcelConfigData.json")

    proud_by_group_lv: dict[tuple[int, int], dict[str, Any]] = {}
    for p in prouds_raw:
        gid = int(p.get("proudSkillGroupId") or 0)
        lv = int(p.get("level") or 0)
        if gid > 0 and lv in (1, 10):
            proud_by_group_lv[(gid, lv)] = p

    promote_crit_by_id: dict[int, float] = {}
    for pr in promotes_raw:
        pid = int(pr.get("avatarPromoteId") or 0)
        for prop in (pr.get("addProps") or []):
            if prop.get("propType") == "FIGHT_PROP_CRITICAL":
                val = float(prop.get("value") or 0.0) * 100.0
                if val > promote_crit_by_id.get(pid, 0.0):
                    promote_crit_by_id[pid] = round(val, 2)

    affixes_by_id: dict[int, list[dict[str, Any]]] = {}
    for af in equip_affixes_raw:
        aid = int(af.get("id") or 0)
        if aid > 0:
            affixes_by_id.setdefault(aid, []).append(af)
    for aid in affixes_by_id:
        affixes_by_id[aid].sort(key=lambda x: int(x.get("level") or 0))

    formal_avatars = [
        a for a in avatars_raw
        if a.get("useType") == "AVATAR_FORMAL" and 10000002 <= int(a.get("id") or 0) < 10000900
    ]

    # Collect ONLY referenced combat/relic TextMap hashes
    needed_hashes: set[int | str] = set()
    for a in formal_avatars:
        needed_hashes.add(a.get("nameTextMapHash"))
        did = a.get("skillDepotId")
        d = depots.get(did) or {}
        for sid in (d.get("skills") or []) + [d.get("energySkill")]:
            sk = skills.get(sid)
            if not sk:
                continue
            needed_hashes.add(sk.get("nameTextMapHash"))
            needed_hashes.add(sk.get("descTextMapHash"))
            gid = int(sk.get("proudSkillGroupId") or 0)
            p10 = proud_by_group_lv.get((gid, 10)) or proud_by_group_lv.get((gid, 1))
            if p10:
                for ph in (p10.get("paramDescList") or []):
                    needed_hashes.add(ph)
        for pgid in extract_depot_passive_group_ids(d):
            ps = proud_by_group_lv.get((pgid, 1))
            if ps:
                needed_hashes.add(ps.get("nameTextMapHash"))
                needed_hashes.add(ps.get("descTextMapHash"))
        for tid in (d.get("talents") or []):
            t = talents_map.get(tid)
            if t:
                needed_hashes.add(t.get("nameTextMapHash"))
                needed_hashes.add(t.get("descTextMapHash"))

    five_star_sets = [r for r in reliquary_sets_raw if int(r.get("equipAffixId") or 0) > 0 and 4 in (r.get("setNeedNum") or [])]
    for rs in five_star_sets:
        for af in affixes_by_id.get(int(rs.get("equipAffixId") or 0), []):
            needed_hashes.add(af.get("nameTextMapHash"))
            needed_hashes.add(af.get("descTextMapHash"))

    tm = fetch_filtered_textmap(needed_hashes)

    def tget(h: Any) -> str:
        if h is None:
            return ""
        val = str(tm.get(str(h)) or "").lstrip("#")
        return re.sub(r"\{LAYOUT_MOBILE#[^}]*\}\{LAYOUT_PC#([^}]*)\}(?:\{LAYOUT_PS#[^}]*\})?", r"\1", val)

    chars_by_cid: dict[str, tuple[dict[str, Any], dict[str, Any]]] = {}
    for a in formal_avatars:
        cid = int(a["id"])
        # Keep only Lumine (10000007) for Traveler to match catalog keys cleanly
        if cid == 10000005:
            continue
        name = strip_markup(tget(a.get("nameTextMapHash")))
        if not name or "(Trial)" in name:
            continue
        dep = depots.get(a.get("skillDepotId")) or {}
        skill_ids = [sid for sid in (dep.get("skills") or []) if sid]
        na_sk = skills.get(skill_ids[0]) if len(skill_ids) > 0 else {}
        es_sk = skills.get(skill_ids[1]) if len(skill_ids) > 1 else {}
        eb_sk = skills.get(dep.get("energySkill")) or {}

        def build_skill_block(sk_obj: dict[str, Any]) -> dict[str, Any]:
            gid = int(sk_obj.get("proudSkillGroupId") or 0)
            p10 = proud_by_group_lv.get((gid, 10)) or proud_by_group_lv.get((gid, 1)) or {}
            params10 = [float(x or 0.0) for x in (p10.get("paramList") or [])]
            mults: dict[str, str] = {}
            for ph in (p10.get("paramDescList") or []):
                raw_tmpl = tget(ph)
                lbl, val_str = format_param_template(raw_tmpl, params10)
                if lbl:
                    mults[lbl] = val_str
            return {
                "name": strip_markup(tget(sk_obj.get("nameTextMapHash"))),
                "description": tget(sk_obj.get("descTextMapHash")),
                "energyCost": int(sk_obj.get("costElemVal") or 0),
                "cdTime": float(sk_obj.get("cdTime") or 0.0),
                "multipliers": mults,
            }

        passive_list: list[dict[str, Any]] = []
        passive_crit_rate = 0.0
        for pgid in extract_depot_passive_group_ids(dep):
            ps = proud_by_group_lv.get((pgid, 1))
            if not ps:
                continue
            p_name = strip_markup(tget(ps.get("nameTextMapHash")))
            p_desc = tget(ps.get("descTextMapHash"))
            if not p_name and not p_desc:
                continue
            for prop in (ps.get("addProps") or []):
                if prop.get("propType") == "FIGHT_PROP_CRITICAL":
                    passive_crit_rate += float(prop.get("value") or 0.0) * 100.0
            passive_list.append({"name": p_name, "description": p_desc, "params": ps.get("paramList") or []})

        cons_list: list[dict[str, Any]] = []
        for tid in (dep.get("talents") or []):
            t = talents_map.get(tid)
            if not t:
                continue
            cons_list.append({
                "name": strip_markup(tget(t.get("nameTextMapHash"))),
                "description": tget(t.get("descTextMapHash")),
                "params": t.get("paramList") or [],
            })

        eb_elem = DIM_ELEMENT_FROM_COST.get(str(eb_sk.get("costElemType") or ""), "Unknown")
        asc_crit = promote_crit_by_id.get(int(a.get("avatarPromoteId") or 0), 0.0)

        meta = {
            "id": cid,
            "enName": name,
            "element": eb_elem,
            "weaponType": a.get("weaponType") or "WEAPON_SWORD_ONE_HAND",
            "dataSource": "dimbreath",
            "iconName": a.get("iconName") or "",
        }
        detail = {
            "skills": {
                "normalattack": build_skill_block(na_sk),
                "elementalskill": build_skill_block(es_sk),
                "elementalburst": build_skill_block(eb_sk),
            },
            "passives": passive_list,
            "constellations": cons_list,
            "hyperlinks": [],
            "ascensionCritRate": asc_crit,
            "passiveCritRate": round(passive_crit_rate, 2),
        }
        chars_by_cid[str(cid)] = (meta, detail)

    dimbreath_sets: list[dict[str, Any]] = []
    for rs in sorted(five_star_sets, key=lambda x: int(x.get("setId") or 0)):
        sid = int(rs.get("setId") or 0)
        aid = int(rs.get("equipAffixId") or 0)
        afs = affixes_by_id.get(aid, [])
        if len(afs) < 2:
            continue
        name = strip_markup(tget(afs[0].get("nameTextMapHash")))
        two_pc = strip_markup(tget(afs[0].get("descTextMapHash")))
        four_pc = strip_markup(tget(afs[1].get("descTextMapHash")))
        if not name or not four_pc:
            continue
        lk = norm_lower_key(name)
        dom = SET_DOMAIN_TABLE.get(lk, {"domain": "Domain of Blessing", "region": "Teyvat"})
        set_icon = rs.get("setIcon") or ""
        dimbreath_sets.append({
            "setId": sid,
            "key": normalize_key(name),
            "lookupKey": lk,
            "name": name,
            "domain": dom["domain"],
            "region": dom["region"],
            "twoPc": two_pc,
            "fourPc": four_pc,
            "icon": f"{ENKA_UI_BASE}{set_icon}.png" if set_icon else "",
            "dataSource": "dimbreath",
            "primitives": vectorize_artifact_set(name, two_pc, four_pc),
        })

    return chars_by_cid, dimbreath_sets


def build_set_vectors(dimbreath_sets: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    by_id: dict[int, dict[str, Any]] = {int(s["setId"]): s for s in (dimbreath_sets or [])}
    try:
        idx_res = fetch_json("https://gi.yatta.moe/api/v2/en/reliquary", YATTA_CACHE_DIR / "index.json")
        items = (idx_res.get("data") or {}).get("items") or {}
        for id_str, item in sorted(items.items(), key=lambda kv: int(kv[0])):
            sid = int(id_str)
            levels = item.get("levelList") or []
            if 5 not in levels:
                continue
            if sid in by_id:
                continue
            detail = fetch_json(f"https://gi.yatta.moe/api/v2/en/reliquary/{id_str}", YATTA_CACHE_DIR / f"{id_str}.json")
            d = detail.get("data") or {}
            affixes = [strip_markup(x) for x in (d.get("affixList") or {}).values()]
            if len(affixes) < 2:
                continue
            two_pc, four_pc = affixes[0], affixes[1]
            name = d.get("name") or item.get("name") or id_str
            lk = norm_lower_key(name)
            dom = SET_DOMAIN_TABLE.get(lk, {"domain": "Domain of Blessing", "region": "Teyvat"})
            by_id[sid] = {
                "setId": sid,
                "key": normalize_key(name),
                "lookupKey": lk,
                "name": name,
                "domain": dom["domain"],
                "region": dom["region"],
                "twoPc": two_pc,
                "fourPc": four_pc,
                "icon": f"https://gi.yatta.moe/assets/UI/reliquary/{item['icon']}.png" if item.get("icon") else "",
                "dataSource": "yatta",
                "primitives": vectorize_artifact_set(name, two_pc, four_pc),
            }
    except Exception:
        pass
    sets = [by_id[k] for k in sorted(by_id.keys())]
    SET_VECTORS_PATH.parent.mkdir(parents=True, exist_ok=True)
    SET_VECTORS_PATH.write_text(json.dumps({"count": len(sets), "sets": sets}, indent=2), encoding="utf-8")
    return sets


def main() -> None:
    patches_json = json.loads(PATCHES_PATH.read_text(encoding="utf-8")) if PATCHES_PATH.exists() else {"patches": {}}
    patches_map = patches_json.get("patches") or {}

    dim_chars, dim_sets = load_dimbreath_bundle()

    ver_info = fetch_json("https://api.lunaris.moe/data/version.json", CACHE_DIR / "version.json")
    ver = ver_info["version"]
    charlist = fetch_json(f"https://api.lunaris.moe/data/{ver}/charlist.json", CACHE_DIR / ver / "charlist.json")

    rows = []
    seen_keys: set[str] = set()
    # 1. Process Dimbreath released characters first (authoritative)
    for cid, (d_meta, d_detail) in sorted(dim_chars.items(), key=lambda kv: int(kv[0])):
        name = d_meta["enName"]
        # Use Lunaris charlist element if Skill costElemType returned Unknown (e.g. Travelers/UGC edge cases)
        l_meta = charlist.get(cid) or {}
        if d_meta.get("element") in ("Unknown", "") and l_meta.get("element"):
            d_meta["element"] = l_meta["element"]
        k = normalize_key(name)
        if not k or k in seen_keys:
            continue
        seen_keys.add(k)
        rows.append(extract_features(name, d_meta, d_detail, patches_map))

    # 2. Fallback to Lunaris ONLY for unreleased/beta IDs absent from Dimbreath
    for cid, meta in charlist.items():
        if str(cid) in dim_chars or cid in ("10000005",):
            continue
        name = meta.get("enName") or meta.get("name") or cid
        k = normalize_key(name)
        if not k or k in seen_keys:
            continue
        try:
            detail = fetch_json(f"https://api.lunaris.moe/data/{ver}/en/char/{cid}.json", CACHE_DIR / ver / f"{cid}.json")
            meta_copy = {**meta, "dataSource": "lunaris"}
            seen_keys.add(k)
            rows.append(extract_features(name, meta_copy, detail, patches_map))
        except Exception:
            continue

    # Build Pandas DataFrame for feature inspection & scikit-learn pipeline
    df = pd.DataFrame([{"key": r["key"], **r["features"]} for r in rows]).set_index("key")
    X = np.array([r["vector"] for r in rows], dtype=float)
    Y = np.array([r["labels"] for r in rows], dtype=int)
    sample_weights = np.array([r["sampleWeight"] for r in rows], dtype=float)

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Fit OneVsRestClassifier(LogisticRegression) with Gold Anchor sample weights
    probs = np.zeros((len(rows), len(ROLE_LABELS)), dtype=float)
    for j in range(len(ROLE_LABELS)):
        clf = LogisticRegression(max_iter=1000, C=2.0, random_state=42)
        clf.fit(X_scaled, Y[:, j], sample_weight=sample_weights)
        probs[:, j] = clf.predict_proba(X_scaled)[:, 1]

    kmeans = KMeans(n_clusters=8, n_init=10, random_state=42)
    cluster_ids = kmeans.fit_predict(X_scaled, sample_weight=sample_weights)
    dists = np.linalg.norm(X_scaled - kmeans.cluster_centers_[cluster_ids], axis=1)
    dist_thresh = float(np.percentile(dists, 90))

    # Cosine similarity matrix on raw mechanical feature vectors
    sim_matrix = cosine_similarity(X)

    profiles: dict[str, Any] = {}
    review_count = 0
    for i, r in enumerate(rows):
        p = r["patch"]
        role_probs = {ROLE_LABELS[j]: round(float(probs[i, j]), 4) for j in range(len(ROLE_LABELS))}
        if p and p.get("goldRoles"):
            active_roles = list(p["goldRoles"])
        else:
            active_roles = [ROLE_LABELS[j] for j in range(len(ROLE_LABELS)) if probs[i, j] >= 0.45]
        if not active_roles:
            active_roles = [ROLE_LABELS[int(np.argmax(probs[i]))]]

        max_prob = float(np.max(probs[i]))
        needs_review = (not p) and (max_prob < 0.55 or float(dists[i]) > dist_thresh)
        if needs_review:
            review_count += 1

        raw_d = np.linalg.norm(X_scaled[i] - kmeans.cluster_centers_, axis=1)
        rbf = np.exp(-raw_d * 0.45)
        cluster_probs = [round(float(x / np.sum(rbf)), 3) for x in rbf]

        peer_indices = np.argsort(-sim_matrix[i])
        nearest_peers = [
            {"key": rows[idx]["key"], "name": rows[idx]["name"], "similarity": round(float(sim_matrix[i, idx]), 3)}
            for idx in peer_indices
            if idx != i
        ][:3]

        built = build_lenses_and_recs(r, role_probs)
        razor = build_razor_summary(r, built["primaryScaler"])
        profiles[r["key"]] = {
            "name": r["name"],
            "element": r["element"],
            "weaponType": r["weaponType"],
            "dataSource": r["dataSource"],
            "baseAtkOnlyBuffer": r["baseAtkOnlyBuffer"],
            "canSnapshot": r["canSnapshot"],
            "baselineCritRate": r["baselineCritRate"],
            "mvShares": r["mvShares"],
            "damageConversion": r["damageConversion"],
            "preferDoubleHp": bool(p and p.get("preferDoubleHp")),
            "primaryScaler": built["primaryScaler"],
            "isGoldAnchor": bool(p and p.get("goldRoles")),
            "factions": r["factions"],
            "features": r["features"],
            "channelShares": r["channelShares"],
            "supply": r["supply"],
            "demand": r["demand"],
            "talentVector": r["talentVector"],
            "passiveVector": r["passiveVector"],
            "divergenceScore": r["divergenceScore"],
            "hasTradeoff": r["hasTradeoff"],
            "teamElementLock": (p or {}).get("teamElementLock"),
            "elementCountRule": (p or {}).get("elementCountRule"),
            "explicitModes": (p or {}).get("explicitModes"),
            "statThresholdCurve": (p or {}).get("statThresholdCurve"),
            "constellationShifts": (p or {}).get("constellationShifts"),
            "roleProbabilities": role_probs,
            "roles": active_roles,
            "playstyleLenses": built["playstyleLenses"],
            "statWeights": built["statWeights"],
            "recommendedSets": built["recommendedSets"],
            "razorSummary": razor,
            "clusterId": int(cluster_ids[i]),
            "clusterProbs": cluster_probs,
            "clusterDistance": round(float(dists[i]), 3),
            "nearestPeers": nearest_peers,
            "needsReview": needs_review,
        }

    OUT_PATH.write_text(
        json.dumps({"version": ver, "engine": "python-sklearn-pandas-dimbreath", "count": len(profiles), "reviewCount": review_count, "profiles": profiles}, indent=2),
        encoding="utf-8",
    )
    sets = build_set_vectors(dim_sets)
    dim_cnt = sum(1 for v in profiles.values() if v["dataSource"] == "dimbreath")
    lun_cnt = sum(1 for v in profiles.values() if v["dataSource"] == "lunaris")
    print(f"[Python ETL] Pandas DataFrame shape: {df.shape} | Wrote {len(profiles)} profiles (dimbreath={dim_cnt}, lunaris={lun_cnt}, review={review_count}) & {len(sets)} 5-star sets.")
    for ck in ["Bennett", "Columbina", "Chevreuse", "RaidenShogun", "Tartaglia", "Yoimiya", "Ganyu"]:
        if ck in profiles:
            pr = profiles[ck]
            print(f"  {ck:12s} [{pr['dataSource']}] CR={pr['baselineCritRate']}% baseAtkBuf={pr['baseAtkOnlyBuffer']} snap={pr['canSnapshot']} conv={pr['damageConversion']} mv={pr['mvShares']}")


if __name__ == "__main__":
    main()
