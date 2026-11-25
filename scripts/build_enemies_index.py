#!/usr/bin/env python3
"""
Builds data/enemies_index.json for Teams Lab RES-shred & Scenario modeling.
Authoritative source: Dimbreath AnimeGameData (MonsterExcelConfigData, MonsterDescribeExcelConfigData,
MonsterCurveExcelConfigData) + in-memory filtered TextMap, with Lunaris monsterlist.json fallback.
"""

from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
from dimbreath_loader import ENKA_UI_BASE, fetch_filtered_textmap, load_excel

ROOT_DIR = Path(__file__).resolve().parent.parent
OUTPUT_PATH = ROOT_DIR / "data" / "enemies_index.json"
LUNARIS_CACHE_DIR = Path(__file__).resolve().parent / ".lunaris_cache"


def classify_enemy(m: dict[str, Any], name: str) -> str:
    mtype = str(m.get("type") or "")
    hp_base = float(m.get("hpBase") or 0.0)
    affix = str(m.get("affix") or "")
    nl = name.lower()
    if any(k in nl for k in ("weekly", "lord of eroded", "stormterror", "azhdaha", "raiden no", "the knave", "narwhal", "andris", "childe", "signora", "everlasting lord")):
        return "weekly_boss"
    if mtype == "MONSTER_BOSS" or hp_base >= 120.0 or "BOSS" in affix:
        return "boss"
    if hp_base >= 40.0:
        return "elite"
    return "normal"


def main() -> None:
    monsters_raw = load_excel("ExcelBinOutput/MonsterExcelConfigData.json")
    describes = {d["id"]: d for d in load_excel("ExcelBinOutput/MonsterDescribeExcelConfigData.json") if d.get("id")}
    curves_raw = load_excel("ExcelBinOutput/MonsterCurveExcelConfigData.json")

    lv90_mult = 1.0
    for row in curves_raw:
        if int(row.get("level") or 0) == 90:
            for c in row.get("curveInfos") or []:
                if c.get("type") == "GROW_CURVE_HP_2":
                    lv90_mult = float(c.get("value") or 1.0)
                    break
            break

    hashes = {d.get("nameTextMapHash") for d in describes.values() if d.get("nameTextMapHash")}
    tm = fetch_filtered_textmap(hashes)

    by_name: dict[str, dict[str, Any]] = {}
    for m in monsters_raw:
        mid = int(m.get("id") or 0)
        did = int(m.get("describeId") or 0)
        mtype = str(m.get("type") or "")
        if not mid or not did or did not in describes:
            continue
        if mtype not in ("MONSTER_ORDINARY", "MONSTER_BOSS"):
            continue
        desc = describes[did]
        name = str(tm.get(str(desc.get("nameTextMapHash") or ""), "")).strip()
        if not name or name.startswith("UI_") or "Test" in name or "test" in name.lower():
            continue
        hp_base = round(float(m.get("hpBase") or 0.0), 3)
        if hp_base <= 1.0:
            continue
        res = {
            "pyro": round(float(m.get("fireSubHurt") or 0.1), 3),
            "hydro": round(float(m.get("waterSubHurt") or 0.1), 3),
            "electro": round(float(m.get("elecSubHurt") or 0.1), 3),
            "cryo": round(float(m.get("iceSubHurt") or 0.1), 3),
            "anemo": round(float(m.get("windSubHurt") or 0.1), 3),
            "geo": round(float(m.get("rockSubHurt") or 0.1), 3),
            "dendro": round(float(m.get("grassSubHurt") or 0.1), 3),
            "physical": round(float(m.get("physicalSubHurt") or 0.1), 3),
        }
        icon_name = desc.get("icon") or ""
        cat = classify_enemy(m, name)
        cand = {
            "id": mid,
            "name": name,
            "icon": f"{ENKA_UI_BASE}{icon_name}.png" if icon_name else "",
            "category": cat,
            "hpBase": hp_base,
            "hpLv90": round(hp_base * lv90_mult),
            "res": res,
            "dataSource": "dimbreath",
        }
        prev = by_name.get(name)
        if not prev or hp_base > prev["hpBase"]:
            by_name[name] = cand

    # Merge any unreleased bosses from Lunaris monsterlist.json absent from Dimbreath
    try:
        ver_path = LUNARIS_CACHE_DIR / "version.json"
        if ver_path.exists():
            ver = json.loads(ver_path.read_text(encoding="utf-8"))["version"]
            mlist_path = LUNARIS_CACHE_DIR / ver / "monsterlist.json"
            if not mlist_path.exists():
                req = urllib.request.Request(f"https://api.lunaris.moe/data/{ver}/monsterlist.json", headers={"User-Agent": "AaruDB-EnemiesBuilder/1.0"})
                with urllib.request.urlopen(req, timeout=20) as resp:
                    mlist_path.parent.mkdir(parents=True, exist_ok=True)
                    mlist_path.write_text(resp.read().decode("utf-8"), encoding="utf-8")
            mlist = json.loads(mlist_path.read_text(encoding="utf-8"))
            for mid_str, mon in mlist.items():
                name = str(mon.get("enName") or "").strip()
                if not name or name in by_name:
                    continue
                icon_name = mon.get("icon") or ""
                by_name[name] = {
                    "id": int(mid_str) if mid_str.isdigit() else 0,
                    "name": name,
                    "icon": f"https://api.lunaris.moe/data/assets/monstericon/{icon_name}.webp" if icon_name else "",
                    "category": "boss" if "boss" in str(mon.get("type") or "").lower() else "normal",
                    "hpBase": round(float(mon.get("hpBase") or 25.0), 3),
                    "hpLv90": round(float(mon.get("hpBase") or 25.0) * lv90_mult),
                    "res": {
                        "pyro": 0.1, "hydro": 0.1, "electro": 0.1, "cryo": 0.1,
                        "anemo": 0.1, "geo": 0.1, "dendro": 0.1, "physical": 0.1,
                    },
                    "dataSource": "lunaris",
                }
    except Exception:
        pass

    cat_order = {"weekly_boss": 0, "boss": 1, "elite": 2, "normal": 3}
    enemies = sorted(by_name.values(), key=lambda e: (cat_order.get(e["category"], 9), -e["hpBase"], e["name"]))
    dim_cnt = sum(1 for e in enemies if e["dataSource"] == "dimbreath")
    lun_cnt = sum(1 for e in enemies if e["dataSource"] == "lunaris")
    OUTPUT_PATH.write_text(
        json.dumps({"meta": {"source": "dimbreath+lunaris", "dimbreath": dim_cnt, "lunaris": lun_cnt, "count": len(enemies)}, "enemies": enemies}, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"[Enemies ETL] Wrote {len(enemies)} enemies (dimbreath={dim_cnt}, lunaris={lun_cnt}) to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
