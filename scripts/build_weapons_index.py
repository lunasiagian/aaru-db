#!/usr/bin/env python3
"""
Builds data/weapons_index.json covering all 3★, 4★, and 5★ weapons.
Authoritative source: Dimbreath AnimeGameData (whitelisted configs + in-memory TextMap filter).
Fallback for unreleased/beta IDs: api.lunaris.moe.
"""

from __future__ import annotations

import json
import re
import sys
import urllib.request
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
from dimbreath_loader import ENKA_UI_BASE, fetch_filtered_textmap, load_excel

ROOT_DIR = Path(__file__).resolve().parent.parent
OUTPUT_PATH = ROOT_DIR / "data" / "weapons_index.json"
LUNARIS_CACHE_DIR = Path(__file__).resolve().parent / ".lunaris_cache"

WEAPON_TYPE_MAP = {
    "WEAPON_SWORD_ONE_HAND": "Sword",
    "WEAPON_CLAYMORE": "Claymore",
    "WEAPON_POLE": "Polearm",
    "WEAPON_CATALYST": "Catalyst",
    "WEAPON_BOW": "Bow",
    "Sword": "Sword",
    "Claymore": "Claymore",
    "Polearm": "Polearm",
    "Catalyst": "Catalyst",
    "Bow": "Bow",
}

PROP_LABEL_MAP = {
    "FIGHT_PROP_CRITICAL": ("CRIT Rate", "critRate_"),
    "FIGHT_PROP_CRITICAL_HURT": ("CRIT DMG", "critDMG_"),
    "FIGHT_PROP_CHARGE_EFFICIENCY": ("Energy Recharge", "enerRech_"),
    "FIGHT_PROP_ELEMENT_MASTERY": ("Elemental Mastery", "eleMas"),
    "FIGHT_PROP_ATTACK_PERCENT": ("ATK%", "atk_"),
    "FIGHT_PROP_HP_PERCENT": ("HP%", "hp_"),
    "FIGHT_PROP_DEFENSE_PERCENT": ("DEF%", "def_"),
    "FIGHT_PROP_PHYSICAL_ADD_HURT": ("Physical DMG", "physical_dmg_"),
}

PERCENT_PROPS = {
    "FIGHT_PROP_CRITICAL",
    "FIGHT_PROP_CRITICAL_HURT",
    "FIGHT_PROP_CHARGE_EFFICIENCY",
    "FIGHT_PROP_ATTACK_PERCENT",
    "FIGHT_PROP_HP_PERCENT",
    "FIGHT_PROP_DEFENSE_PERCENT",
    "FIGHT_PROP_PHYSICAL_ADD_HURT",
}

BP_KEYS = {
    "SerpentSpine", "Deathmatch", "TheBlackSword", "SolarPearl", "TheViridescentHunt",
    "WolfFang", "BalladOfTheFjords", "SacrificialJade", "TalkingStick", "ScionOfTheBlazingSun",
    "HereticsMoltenBlade", "ForgedByTheGoldenMelody", "Frostbreath", "ClashOfKings", "JadeVista",
}

EVENT_LIMITED_KEYS = {
    "FesteringDesire", "WindblumeOde", "DodocoTales", "LuxuriousSeaLord", "CinnabarSpindle",
    "OathswornEye", "FadingTwilight", "MissiveWindspear", "ToukabouShigure", "MailedFlower",
    "IbisPiercer", "BalladOfTheBoundlessBlue", "UltimateOverlordsMegaMagicSword",
    "DialoguesOfTheDesertSages", "Cloudforged", "AshGravenDrinkingHorn", "CalamityOfEshu",
    "TamayurateiNoOhanashi", "SequenceOfSolitude",
}

F2P_CRAFT_FISH_KEYS = {
    "TheCatch", "FleuveCendreFerryman", "EndOfTheLine", "KagotsurubeIsshin", "SwordOfNarzissenkreuz",
    "PrototypeRancour", "IronSting", "AmenomaKageuchi", "SapwoodBlade", "FinaleOfTheDeep", "FluteOfEzpitzal",
    "PrototypeArchaic", "Whiteblind", "SnowTombedStarsilver", "KatsuragikiriNagamasa", "ForestRegalia",
    "TidalShadow", "EarthShaker", "CrescentPike", "PrototypeStarglitter", "DragonspineSpear",
    "KitainCrossSpear", "Moonpiercer", "RightfulReward", "FootprintOfTheRainbow",
    "PrototypeAmber", "MappaMare", "Frostbearer", "HakushinRing", "FruitOfFulfillment",
    "FlowingPurity", "RingOfYaxche", "PrototypeCrescent", "CompoundBow", "Hamayumi",
    "KingsSquire", "SongOfStillness", "ChainBreaker", "FavoniusWarbow",
}

PLATFORM_EXCLUSIVE_KEYS = {"Predator", "SwordOfDescension"}

LIMITED_4_KEYS = {
    "RangeGauge", "ProspectorsDrill", "PortablePowerSaw", "TheDockhandsAssistant",
    "XiphosMoonlight", "WanderingEvenstar", "MakhairaAquamarine", "WavebreakersFin",
    "MouunsMoon", "Akuoumaru", "LithicBlade", "LithicSpear", "FlowerWreathedFeathers",
    "WaveridingWhirl", "FruitfulHook", "MountainBracingBolt", "SturdyBone",
    "MitternachtsWaltz", "AlleyHunter", "TheAlleyFlash", "WineAndSong",
    "MoonweaversDawn", "SacrificersStaff", "DawningFrost", "RainbowSerpentsRainBow",
}

SPECIALIST_3_STAR_SUBSTATS = {"CRIT Rate", "CRIT DMG", "Elemental Mastery", "HP%", "DEF%", "Energy Recharge"}


def to_pascal_key(name: str) -> str:
    cleaned = re.sub(r"['’`\"]", "", str(name or ""))
    words = re.sub(r"[^a-zA-Z0-9]+", " ", cleaned).strip().split()
    return "".join(w[0].upper() + w[1:] for w in words if w)


def strip_markup(text: str) -> str:
    return re.sub(r"<[^>]+>", "", str(text or "")).replace("\\n", " ").strip()


def extract_mechanic_tags(name: str, substat: str, passive_text: str) -> list[str]:
    tags: list[str] = []
    lower_name = name.lower()
    text = f"{name}\n{passive_text}"

    if (
        re.search(r"elemental\s+skill[^.]{0,90}end\s+its\s+own\s+cd|reset[^.]{0,40}elemental\s+skill\s+cd", text, re.I)
        or "sacrificial " in lower_name
    ):
        tags.append("skill_reset")

    if (
        substat == "Energy Recharge"
        or re.search(
            r"elemental\s+particles?|restore[s]?\s+[\d.]+\s+energy|regenerate[s]?\s+[\d.]+\s+energy|energy\s+recharge\s+is\s+increased",
            text,
            re.I,
        )
    ):
        tags.append("er_battery")

    if re.search(
        r"all\s+(?:nearby\s+)?party\s+members|nearby\s+allies|other\s+party\s+members|(?:new|next)\s+character\s+taking\s+the\s+field|active\s+character[^.]{0,60}(?:gains?|increases?)",
        text,
        re.I,
    ):
        tags.append("party_buff")

    if re.search(r"elemental\s+skill\s+(?:and\s+elemental\s+burst\s+)?dmg|skill\s+dmg\s+increased|elemental\s+skill\s+crit\s+rate|dmg\s+dealt\s+by[^.]{0,45}elemental\s+skills?", text, re.I):
        tags.append("skill_dmg")
    if re.search(r"elemental\s+burst\s+dmg|burst\s+dmg\s+increased|elemental\s+burst\s+crit\s+rate|dmg\s+dealt\s+by[^.]{0,45}elemental\s+bursts?", text, re.I):
        tags.append("burst_dmg")
    if re.search(r"(?<!decreases\s)(?:normal\s+(?:and\s+(?:charged|plunging)\s+)?attack\s+dmg|normal\s+or\s+charged\s+attack[\s\S]{0,85}?increases\s+dmg|dmg\s+dealt\s+by\s+normal\s+attacks?|increases?\s+normal\s+attack)", text, re.I):
        tags.append("na_dmg")
    if re.search(r"decreases?\s+charged\s+attack\s+dmg", text, re.I):
        tags.append("ca_penalty")
    elif re.search(r"charged\s+attack\s+dmg|normal\s+(?:and|or)\s+charged\s+attack\s+dmg|normal\s+or\s+charged\s+attack[\s\S]{0,85}?increases\s+dmg|charged\s+attack\s+crit|aimed\s+shot\s+dmg", text, re.I):
        tags.append("ca_dmg")
    if re.search(r"increases?\s+atk\s+by|atk\s+(?:is\s+)?increased\s+by|gains?\s+[\d.]+%\s+atk", text, re.I):
        tags.append("atk_buff")

    if substat == "HP%" or re.search(r"max\s+hp\s+(?:is\s+)?increased|\bhp\s+(?:is\s+)?increased\s+by|based\s+on[^.]{0,40}max\s+hp|of\s+max\s+hp", text, re.I):
        tags.append("hp_scale")
    if substat == "DEF%" or re.search(r"\bdef\b\s+(?:is\s+)?increased|based\s+on[^.]{0,40}\bdef\b|of\s+(?:the\s+character's\s+)?def\b", text, re.I):
        tags.append("def_scale")
    if substat == "Elemental Mastery" or re.search(r"elemental\s+mastery\s+(?:is\s+)?increased|based\s+on[^.]{0,40}elemental\s+mastery|of\s+elemental\s+mastery", text, re.I):
        tags.append("em_scale")
    if re.search(r"healing\s+bonus|regenerates?\s+[\d.]+%?\s+(?:of\s+)?max\s+hp|restore[s]?\s+hp\s+for\s+all\s+party", text, re.I):
        tags.append("healer_utility")
    if re.search(r"when\s+the\s+wielder\s+performs?\s+healing|after\s+(?:the\s+wielder\s+)?(?:is\s+|performs?\s+)?heal(?:ed|ing)", text, re.I):
        tags.append("healer_trigger")
    if re.search(r"elemental\s+dmg\s+bonus|all\s+elemental\s+dmg|gains?\s+[\d.]+%\s+elemental\s+dmg", text, re.I):
        tags.append("elem_dmg")
    if re.search(r"after\s+defeating\s+an\s+(?:opponent|enemy)", text, re.I):
        tags.append("on_kill")

    return list(dict.fromkeys(tags))


def extract_required_mechanics(passive_text: str) -> list[str]:
    reqs: list[str] = []
    if re.search(r"bond\s+of\s+life", passive_text, re.I):
        reqs.append("bond_of_life")
    if re.search(r"nightsoul", passive_text, re.I):
        reqs.append("nightsoul")
    if re.search(r"hp\s+(?:increases\s+or\s+decreases|decreases\s+or\s+increases|changes)", passive_text, re.I):
        reqs.append("hp_fluctuation")
    if re.search(r"when\s+the\s+wielder\s+performs?\s+healing|performs?\s+healing|when\s+the\s+wielder\s+is\s+healed\s+or\s+performs\s+healing", passive_text, re.I):
        reqs.append("healing_performed")
    if re.search(r"\bmoonsign\b|lunar(?:[- ]?(?:charged|bloom|crystallize|reaction))?\s+(?:crit\s+)?dmg", passive_text, re.I):
        reqs.append("lunar")
    if re.search(r"\bhexerei\b", passive_text, re.I):
        reqs.append("hexerei")
    if re.search(r"stellar\s+glimmer", passive_text, re.I):
        reqs.append("stellar_glimmer")
    if re.search(r"after\s+being\s+affected\s+by\s+(?:pyro|hydro|cryo|electro|dendro)", passive_text, re.I):
        reqs.append("self_elemental_aura")
    if re.search(r"hits?\s+an\s+opponent\s+with\s+(?:their\s+|a\s+|his\s+|her\s+)?charged\s+attack|when\s+(?:a\s+|the\s+wielder'?s?\s+)?charged\s+attack\s+hits", passive_text, re.I):
        reqs.append("charged_attack")
    return reqs


def classify_acquisition(pascal_key: str, rarity: int, passive_text: str = "") -> str:
    if pascal_key in PLATFORM_EXCLUSIVE_KEYS or re.search(r"playstation\s+network", passive_text, re.I):
        return "platform_exclusive"
    if re.match(r"^(?:Blackcliff|Royal)", pascal_key):
        return "starglitter"
    if pascal_key in BP_KEYS:
        return "bp"
    if pascal_key in EVENT_LIMITED_KEYS:
        return "event_limited"
    if pascal_key in LIMITED_4_KEYS:
        return "limited_4"
    if rarity == 3 or pascal_key in F2P_CRAFT_FISH_KEYS:
        return "f2p_craft_fish"
    if rarity == 5:
        return "limited_5"
    return "gacha_4"


def compute_dimbreath_lv90(
    weapon_prop: list[dict[str, Any]],
    promote_rows: list[dict[str, Any]],
    curve_lv90: dict[str, float],
) -> tuple[int, str, str, str, float]:
    max_promote = max(promote_rows, key=lambda r: int(r.get("promoteLevel") or 0)) if promote_rows else {}
    add_props = {p.get("propType"): float(p.get("value") or 0.0) for p in (max_promote.get("addProps") or []) if p.get("propType")}

    base_atk = 0
    substat = ""
    substat_key = ""
    substat_val_str = ""
    substat_val_num = 0.0

    for p in weapon_prop or []:
        prop_type = p.get("propType") or ""
        init_val = float(p.get("initValue") or 0.0)
        if init_val == 0 and prop_type != "FIGHT_PROP_BASE_ATTACK":
            continue
        curve_name = p.get("type") or ""
        mult = float(curve_lv90.get(curve_name, 1.0))
        total = init_val * mult + add_props.get(prop_type, 0.0)

        if prop_type == "FIGHT_PROP_BASE_ATTACK":
            base_atk = round(total)
        elif prop_type in PROP_LABEL_MAP:
            substat, substat_key = PROP_LABEL_MAP[prop_type]
            if prop_type in PERCENT_PROPS:
                substat_val_num = round(total * 100.0, 1)
                substat_val_str = f"{substat_val_num}%"
            else:
                substat_val_num = float(round(total))
                substat_val_str = str(round(total))

    return base_atk, substat, substat_key, substat_val_str, substat_val_num


def build_passive_flags(passive_text: str, rarity: int, substat: str, mechanic_tags: list[str]) -> tuple[bool, bool, bool]:
    requires_full_energy = bool(re.search(r"energy\s+reaches\s+100%|at\s+100%\s+energy", passive_text, re.I))
    requires_on_field_stacking = bool(
        re.search(r"scoring\s+hits\s+on\s+opponents\s+increases\s+atk|on\s+hit,\s+increases\s+atk", passive_text, re.I)
        and not re.search(r"even\s+if\s+the\s+character\s+is\s+not\s+on\s+the\s+field|off-field", passive_text, re.I)
    )
    is_low_base_atk_specialist = bool(rarity == 3 and (substat in SPECIALIST_3_STAR_SUBSTATS or "party_buff" in mechanic_tags))
    return requires_full_energy, requires_on_field_stacking, is_low_base_atk_specialist


def fetch_lunaris_json(url: str, cache_path: Path) -> Any:
    if cache_path.exists():
        return json.loads(cache_path.read_text(encoding="utf-8"))
    req = urllib.request.Request(url, headers={"User-Agent": "AaruDB-WeaponsBuilder/2.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data


def main() -> None:
    weapons_raw = load_excel("ExcelBinOutput/WeaponExcelConfigData.json")
    curves_raw = load_excel("ExcelBinOutput/WeaponCurveExcelConfigData.json")
    promotes_raw = load_excel("ExcelBinOutput/WeaponPromoteExcelConfigData.json")
    affixes_raw = load_excel("ExcelBinOutput/EquipAffixExcelConfigData.json")

    curve_lv90: dict[str, float] = {}
    for row in curves_raw:
        if int(row.get("level") or 0) == 90:
            curve_lv90 = {c["type"]: float(c.get("value") or 1.0) for c in (row.get("curveInfos") or []) if c.get("type")}
            break

    promotes_by_id: dict[int, list[dict[str, Any]]] = {}
    for pr in promotes_raw:
        pid = int(pr.get("weaponPromoteId") or 0)
        if pid > 0:
            promotes_by_id.setdefault(pid, []).append(pr)

    affixes_by_id: dict[int, list[dict[str, Any]]] = {}
    for af in affixes_raw:
        aid = int(af.get("id") or 0)
        if aid > 0:
            affixes_by_id.setdefault(aid, []).append(af)
    for aid in affixes_by_id:
        affixes_by_id[aid].sort(key=lambda x: int(x.get("level") or 0))

    targets = [w for w in weapons_raw if int(w.get("rankLevel") or 0) >= 3]
    needed_hashes: set[int | str] = set()
    for w in targets:
        needed_hashes.add(w.get("nameTextMapHash"))
        for aid in (w.get("skillAffix") or []):
            if aid:
                for af in affixes_by_id.get(int(aid), []):
                    needed_hashes.add(af.get("nameTextMapHash"))
                    needed_hashes.add(af.get("descTextMapHash"))

    tm = fetch_filtered_textmap(needed_hashes)

    weapons_by_key: dict[str, dict[str, Any]] = {}
    seen_ids: set[int] = set()
    for w in targets:
        wid = int(w.get("id") or 0)
        rarity = int(w.get("rankLevel") or 0)
        name = strip_markup(tm.get(str(w.get("nameTextMapHash") or ""), ""))
        if not wid or not name:
            continue
        pascal_key = to_pascal_key(name)
        if not pascal_key:
            continue
        weapon_type = WEAPON_TYPE_MAP.get(w.get("weaponType") or "", "Sword")
        base_atk, substat, substat_key, substat_val_str, substat_val_num = compute_dimbreath_lv90(
            w.get("weaponProp") or [],
            promotes_by_id.get(int(w.get("weaponPromoteId") or 0), []),
            curve_lv90,
        )

        passive_parts: list[str] = []
        for aid in (w.get("skillAffix") or []):
            if not aid:
                continue
            afs = affixes_by_id.get(int(aid), [])
            if afs:
                af_name = strip_markup(tm.get(str(afs[0].get("nameTextMapHash") or ""), ""))
                af_desc = strip_markup(tm.get(str(afs[0].get("descTextMapHash") or ""), ""))
                passive_parts.append(f"{af_name}\n{af_desc}".strip())
        passive_text = "\n".join(passive_parts).strip()

        mechanic_tags = extract_mechanic_tags(name, substat, passive_text)
        requires_mechanics = extract_required_mechanics(passive_text)
        req_full_e, req_onfield, is_spec_3 = build_passive_flags(passive_text, rarity, substat, mechanic_tags)
        icon_name = w.get("icon") or ""

        seen_ids.add(wid)
        weapons_by_key[pascal_key] = {
            "id": wid,
            "key": pascal_key,
            "name": name,
            "rarity": rarity,
            "weaponType": weapon_type,
            "baseAtk": base_atk,
            "baseAtk90": base_atk,
            "substat": substat,
            "substatKey": substat_key,
            "substatValue": substat_val_str,
            "substatVal90": substat_val_num,
            "acquisition": classify_acquisition(pascal_key, rarity, passive_text),
            "mechanicTags": mechanic_tags,
            "requiresMechanics": requires_mechanics,
            "requiresFullEnergy": req_full_e,
            "requiresOnFieldStacking": req_onfield,
            "isLowBaseAtkSpecialist": is_spec_3,
            "dataSource": "dimbreath",
            "icon": f"{ENKA_UI_BASE}{icon_name}.png" if icon_name else "",
        }

    # Merge unreleased/beta 3*-5* weapons from Lunaris ONLY if absent from Dimbreath
    try:
        ver_info = fetch_lunaris_json("https://api.lunaris.moe/data/version.json", LUNARIS_CACHE_DIR / "version.json")
        ver = ver_info["version"]
        wlist = fetch_lunaris_json(f"https://api.lunaris.moe/data/{ver}/weaponlist.json", LUNARIS_CACHE_DIR / ver / "weaponlist.json")
        for wid_str, item in wlist.items():
            wid = int(wid_str)
            if wid in seen_ids:
                continue
            rarity = 5 if item.get("qualityType") == "QUALITY_ORANGE" else 4 if item.get("qualityType") == "QUALITY_PURPLE" else 3 if item.get("qualityType") == "QUALITY_BLUE" else 0
            if rarity < 3:
                continue
            name = item.get("enName") or ""
            pascal_key = to_pascal_key(name)
            if not pascal_key or pascal_key in weapons_by_key:
                continue
            try:
                detail = fetch_lunaris_json(f"https://api.lunaris.moe/data/{ver}/en/weapon/{wid_str}.json", LUNARIS_CACHE_DIR / ver / f"w_{wid_str}.json")
            except Exception:
                detail = {}
            lv90 = (detail.get("stats") or {}).get("90") or (detail.get("ascensionStats") or {})
            base_atk = round(float(lv90.get("atk") or lv90.get("baseAtk") or (608 if rarity == 5 else 510)))
            sub_prop = next((k for k in lv90 if k not in ("atk", "baseAtk")), "")
            substat = "Elemental Mastery" if sub_prop == "Elemental Mastery" else sub_prop.replace("%", "")
            if sub_prop == "HP%": substat = "HP%"
            elif sub_prop == "ATK%": substat = "ATK%"
            elif sub_prop == "DEF%": substat = "DEF%"
            elif "CRIT Rate" in sub_prop: substat = "CRIT Rate"
            elif "CRIT DMG" in sub_prop: substat = "CRIT DMG"
            elif "Energy" in sub_prop: substat = "Energy Recharge"
            substat_key = next((gk for lbl, gk in PROP_LABEL_MAP.values() if lbl == substat), "")
            substat_val_num = round(float(lv90.get(sub_prop) or 0.0), 1)
            substat_val_str = f"{substat_val_num}%" if substat not in ("", "Elemental Mastery") else (str(round(substat_val_num)) if substat_val_num else "")

            passive_text = strip_markup(f"{detail.get('passiveName', '')}\n{detail.get('passiveDesc', '')}")
            mechanic_tags = extract_mechanic_tags(name, substat, passive_text)
            requires_mechanics = extract_required_mechanics(passive_text)
            req_full_e, req_onfield, is_spec_3 = build_passive_flags(passive_text, rarity, substat, mechanic_tags)
            wicon = item.get("weaponIcon") or ""
            weapons_by_key[pascal_key] = {
                "id": wid,
                "key": pascal_key,
                "name": name,
                "rarity": rarity,
                "weaponType": WEAPON_TYPE_MAP.get(item.get("weaponType") or "", "Sword"),
                "baseAtk": base_atk,
                "baseAtk90": base_atk,
                "substat": substat,
                "substatKey": substat_key,
                "substatValue": substat_val_str,
                "substatVal90": substat_val_num,
                "acquisition": classify_acquisition(pascal_key, rarity, passive_text),
                "mechanicTags": mechanic_tags,
                "requiresMechanics": requires_mechanics,
                "requiresFullEnergy": req_full_e,
                "requiresOnFieldStacking": req_onfield,
                "isLowBaseAtkSpecialist": is_spec_3,
                "dataSource": "lunaris",
                "icon": f"https://api.lunaris.moe/data/assets/weaponicon/{wicon}.webp" if wicon else "",
            }
    except Exception:
        pass

    weapons = sorted(weapons_by_key.values(), key=lambda w: (-w["rarity"], w["weaponType"], w["name"]))
    dim_cnt = sum(1 for w in weapons if w["dataSource"] == "dimbreath")
    lun_cnt = sum(1 for w in weapons if w["dataSource"] == "lunaris")
    payload = {
        "meta": {"source": "dimbreath+lunaris", "dimbreath": dim_cnt, "lunaris": lun_cnt, "count": len(weapons)},
        "weapons": weapons,
    }
    OUTPUT_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[Weapons ETL] Wrote {len(weapons)} weapons (dimbreath={dim_cnt}, lunaris={lun_cnt}) to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
