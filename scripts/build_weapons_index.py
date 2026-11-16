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
    if re.search(r"normal(?:\s+and\s+|\s*,\s*|\s+or\s+)?charged\s+attack|normal\s+attack\s+dmg|charged\s+attack\s+dmg|plunge|plunging\s+attack|dmg\s+dealt\s+by\s+normal\s+attacks?", text, re.I):
        tags.append("na_ca_dmg")

    # 5. Stat scaling & healer utility
    if substat == "HP%" or re.search(r"max\s+hp\s+(?:is\s+)?increased|based\s+on[^.]{0,40}max\s+hp|of\s+max\s+hp", text, re.I):
        tags.append("hp_scale")
    if substat == "DEF%" or re.search(r"\bdef\b\s+(?:is\s+)?increased|based\s+on[^.]{0,40}\bdef\b|of\s+(?:the\s+character\'s\s+)?def\b", text, re.I):
        tags.append("def_scale")
    if substat == "Elemental Mastery" or re.search(r"elemental\s+mastery\s+(?:is\s+)?increased|based\s+on[^.]{0,40}elemental\s+mastery|of\s+elemental\s+mastery", text, re.I):
        tags.append("em_scale")
    if re.search(r"healing\s+bonus|regenerates?\s+[\d.]+%?\s+(?:of\s+)?max\s+hp|restore[s]?\s+hp\s+for\s+all\s+party", text, re.I):
        tags.append("healer_utility")

    return list(dict.fromkeys(tags))


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
        upg = (first_affix or {}).get("upgrade") or {}
        passive_text = strip_markup(upg.get("0") or upg.get("4") or "")

    mechanic_tags = extract_mechanic_tags(name, substat, passive_text)

    return {
        "id": wid,
        "key": to_pascal_key(name),
        "name": name,
        "rarity": rarity,
        "weaponType": weapon_type,
        "baseAtk": base_atk,
        "substat": substat,
        "substatValue": substat_val,
        "mechanicTags": mechanic_tags,
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
