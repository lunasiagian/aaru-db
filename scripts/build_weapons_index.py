#!/usr/bin/env python3
"""
Builds data/weapons_index.json covering all 3★, 4★, and 5★ weapons from Project Amber (gi.yatta.moe).
Usage:
    python scripts/build_weapons_index.py
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
from pathlib import Path
import re
import urllib.request

ROOT_DIR = Path(__file__).resolve().parent.parent
OUTPUT_PATH = ROOT_DIR / "data" / "weapons_index.json"

BASE_URL = "https://gi.yatta.moe/api/v2/en"
CURVE_URL = "https://gi.yatta.moe/api/v2/static/weaponCurve"

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
    "FIGHT_PROP_CRITICAL": "CRIT Rate",
    "FIGHT_PROP_CRITICAL_HURT": "CRIT DMG",
    "FIGHT_PROP_CHARGE_EFFICIENCY": "Energy Recharge",
    "FIGHT_PROP_ELEMENT_MASTERY": "Elemental Mastery",
    "FIGHT_PROP_ATTACK_PERCENT": "ATK%",
    "FIGHT_PROP_HP_PERCENT": "HP%",
    "FIGHT_PROP_DEFENSE_PERCENT": "DEF%",
    "FIGHT_PROP_PHYSICAL_ADD_HURT": "Physical DMG",
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


def fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "AaruDB-WeaponsBuilder/1.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


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

    # 1. skill_reset (Sacrificial series / explicit skill CD reset)
    if (
        re.search(r"elemental\s+skill[^.]{0,90}end\s+its\s+own\s+cd|reset[^.]{0,40}elemental\s+skill\s+cd", text, re.I)
        or "sacrificial " in lower_name
    ):
        tags.append("skill_reset")

    # 2. er_battery (ER substat and/or energy/particle refund/generation)
    if (
        substat == "Energy Recharge"
        or re.search(
            r"elemental\s+particles?|restore[s]?\s+[\d.]+\s+energy|regenerate[s]?\s+[\d.]+\s+energy|energy\s+recharge\s+is\s+increased",
            text,
            re.I,
        )
    ):
        tags.append("er_battery")

    # 3. party_buff (shares ATK, EM, DMG%, CRIT, or Shield Strength with nearby party members)
    if re.search(
        r"all\s+(?:nearby\s+)?party\s+members|nearby\s+allies|other\s+party\s+members|(?:new|next)\s+character\s+taking\s+the\s+field|active\s+character[^.]{0,60}(?:gains?|increases?)",
        text,
        re.I,
    ):
        tags.append("party_buff")

    # 4. Damage source bonuses
    if re.search(r"elemental\s+skill\s+(?:and\s+elemental\s+burst\s+)?dmg|skill\s+dmg\s+increased|elemental\s+skill\s+crit\s+rate|dmg\s+dealt\s+by[^.]{0,45}elemental\s+skills?", text, re.I):
        tags.append("skill_dmg")
    if re.search(r"elemental\s+burst\s+dmg|burst\s+dmg\s+increased|elemental\s+burst\s+crit\s+rate|dmg\s+dealt\s+by[^.]{0,45}elemental\s+bursts?", text, re.I):
        tags.append("burst_dmg")
    if re.search(r"(?<!decreases\s)(?:normal\s+(?:and\s+(?:charged|plunging)\s+)?attack\s+dmg|dmg\s+dealt\s+by\s+normal\s+attacks?|increases?\s+normal\s+attack)", text, re.I):
        tags.append("na_dmg")
    if re.search(r"decreases?\s+charged\s+attack\s+dmg", text, re.I):
        tags.append("ca_penalty")
    elif re.search(r"charged\s+attack\s+dmg|normal\s+(?:and|or)\s+charged\s+attack\s+dmg|charged\s+attack\s+crit|aimed\s+shot\s+dmg", text, re.I):
        tags.append("ca_dmg")
    if re.search(r"increases?\s+atk\s+by|atk\s+(?:is\s+)?increased\s+by|gains?\s+[\d.]+%\s+atk", text, re.I):
        tags.append("atk_buff")

    # 5. Stat scaling & healer utility
    if substat == "HP%" or re.search(r"max\s+hp\s+(?:is\s+)?increased|based\s+on[^.]{0,40}max\s+hp|of\s+max\s+hp", text, re.I):
        tags.append("hp_scale")
    if substat == "DEF%" or re.search(r"\bdef\b\s+(?:is\s+)?increased|based\s+on[^.]{0,40}\bdef\b|of\s+(?:the\s+character\'s\s+)?def\b", text, re.I):
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
    if re.search(r"\blunar(?:[- ]?(?:charged|bloom|crystallize|reaction))?\b", passive_text, re.I):
        reqs.append("lunar")
    if re.search(r"\bhexerei\b", passive_text, re.I):
        reqs.append("hexerei")
    if re.search(r"stellar\s+glimmer", passive_text, re.I):
        reqs.append("stellar_glimmer")
    return reqs


def compute_lv90_stats(detail: dict, curve_data: dict) -> tuple[int, str, str]:
    upgrade = detail.get("upgrade") or {}
    props = upgrade.get("prop") or []
    promotes = upgrade.get("promote") or []
    max_promote = promotes[-1] if promotes else {}
    add_props = max_promote.get("addProps") or {}

    lv90_curves = curve_data.get("90", {}).get("curveInfos", {})
    base_atk = 0
    substat = ""
    substat_val = ""

    for p in props:
        prop_type = p.get("propType", "")
        init_val = float(p.get("initValue") or 0)
        curve_name = p.get("type", "")
        mult = float(lv90_curves.get(curve_name, 1.0))
        add_val = float(add_props.get(prop_type, 0))
        total = init_val * mult + add_val

        if prop_type == "FIGHT_PROP_BASE_ATTACK":
            base_atk = round(total)
        elif prop_type in PROP_LABEL_MAP:
            substat = PROP_LABEL_MAP[prop_type]
            if prop_type in PERCENT_PROPS:
                substat_val = f"{round(total * 100, 1)}%"
            else:
                substat_val = str(round(total))

    return base_atk, substat, substat_val


BP_KEYS = {
    "SerpentSpine", "Deathmatch", "TheBlackSword", "SolarPearl", "TheViridescentHunt",
    "WolfFang", "BalladOfTheFjords", "SacrificialJade", "TalkingStick", "ScionOfTheBlazingSun",
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
    "KingsSquire", "SongOfStillness", "ChainBreaker",
}


PLATFORM_EXCLUSIVE_KEYS = {
    "Predator", "SwordOfDescension",
}


LIMITED_4_KEYS = {
    "RangeGauge", "ProspectorsDrill", "PortablePowerSaw", "TheDockhandsAssistant",
    "XiphosMoonlight", "WanderingEvenstar", "MakhairaAquamarine", "WavebreakersFin",
    "MouunsMoon", "Akuoumaru", "LithicBlade", "LithicSpear", "FlowerWreathedFeathers",
    "WaveridingWhirl", "FruitfulHook", "MountainBracingBolt", "SturdyBone",
    "MitternachtsWaltz", "AlleyHunter", "TheAlleyFlash", "WineAndSong",
}


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


def process_weapon(item: dict, curve_data: dict) -> dict | None:
    wid = item.get("id")
    rarity = int(item.get("rank") or 0)
    if not wid or rarity < 3:
        return None

    detail_res = fetch_json(f"{BASE_URL}/weapon/{wid}")
    detail = detail_res.get("data") or {}
    name = detail.get("name") or item.get("name") or ""
    weapon_type = WEAPON_TYPE_MAP.get(detail.get("type") or item.get("type"), "Sword")
    base_atk, substat, substat_val = compute_lv90_stats(detail, curve_data)

    affix_map = detail.get("affix") or {}
    passive_text = ""
    if isinstance(affix_map, dict) and affix_map:
        first_affix = next(iter(affix_map.values()))
        affix_name = strip_markup((first_affix or {}).get("name") or "")
        upg = (first_affix or {}).get("upgrade") or {}
        passive_desc = strip_markup(upg.get("0") or upg.get("4") or "")
        passive_text = f"{affix_name}\n{passive_desc}".strip()

    mechanic_tags = extract_mechanic_tags(name, substat, passive_text)
    requires_mechanics = extract_required_mechanics(passive_text)

    pascal_key = to_pascal_key(name)
    return {
        "id": wid,
        "key": pascal_key,
        "name": name,
        "rarity": rarity,
        "weaponType": weapon_type,
        "baseAtk": base_atk,
        "substat": substat,
        "substatValue": substat_val,
        "acquisition": classify_acquisition(pascal_key, rarity, passive_text),
        "mechanicTags": mechanic_tags,
        "requiresMechanics": requires_mechanics,
    }


def main() -> None:
    print("Fetching weapon list and curve...")
    list_res = fetch_json(f"{BASE_URL}/weapon")
    curve_res = fetch_json(CURVE_URL)
    items = list((list_res.get("data") or {}).get("items", {}).values())
    curve_data = curve_res.get("data") or {}

    targets = [it for it in items if int(it.get("rank") or 0) >= 3]
    print(f"Processing {len(targets)} 3★–5★ weapons...")

    weapons: list[dict] = []
    with ThreadPoolExecutor(max_workers=16) as pool:
        futures = {pool.submit(process_weapon, it, curve_data): it for it in targets}
        for fut in as_completed(futures):
            try:
                entry = fut.result()
                if entry:
                    weapons.append(entry)
            except Exception as exc:
                it = futures[fut]
                print(f"Warn: failed weapon {it.get('id')} ({it.get('name')}): {exc}")

    weapons.sort(key=lambda w: (-w["rarity"], w["weaponType"], w["name"]))
    payload = {
        "meta": {"source": "gi.yatta.moe", "count": len(weapons)},
        "weapons": weapons,
    }
    OUTPUT_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(weapons)} weapons to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
