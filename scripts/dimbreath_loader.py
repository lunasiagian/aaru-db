#!/usr/bin/env python3
"""
Spoiler-free AnimeGameData (Dimbreath) whitelisted ingestion & in-memory TextMap filter.

Security / Spoiler Firewall Rules:
  1. Only files explicitly listed in ALLOWED_EXCEL_FILES may ever be fetched or cached.
  2. Any quest, NPC, dialogue, readable, or subtitle path raises ValueError immediately.
  3. TextMapEN.json is fetched strictly in memory, immediately filtered down to only the
     integer/string hashes referenced by whitelisted combat/enemy Excel configs, and
     the full raw object is explicitly freed without touching disk.
"""

from __future__ import annotations

import gc
import json
import re
import urllib.request
from pathlib import Path
from typing import Any

PRIMARY_BASE = "https://raw.githubusercontent.com/DimbreathBot/AnimeGameData/master/"
FALLBACK_BASE = "https://gitlab.com/Dimbreath/AnimeGameData/-/raw/master/"
ENKA_UI_BASE = "https://enka.network/ui/"

CACHE_DIR = Path(__file__).resolve().parent / ".dimbreath_cache"

ALLOWED_EXCEL_FILES: frozenset[str] = frozenset(
    {
        # Characters & Kits
        "ExcelBinOutput/AvatarExcelConfigData.json",
        "ExcelBinOutput/AvatarCurveExcelConfigData.json",
        "ExcelBinOutput/AvatarPromoteExcelConfigData.json",
        "ExcelBinOutput/AvatarSkillDepotExcelConfigData.json",
        "ExcelBinOutput/AvatarSkillExcelConfigData.json",
        "ExcelBinOutput/ProudSkillExcelConfigData.json",
        "ExcelBinOutput/AvatarTalentExcelConfigData.json",
        # Weapons & Artifacts
        "ExcelBinOutput/WeaponExcelConfigData.json",
        "ExcelBinOutput/WeaponCurveExcelConfigData.json",
        "ExcelBinOutput/WeaponPromoteExcelConfigData.json",
        "ExcelBinOutput/ReliquarySetExcelConfigData.json",
        "ExcelBinOutput/EquipAffixExcelConfigData.json",
        # Enemy / Monster Combat Data
        "ExcelBinOutput/MonsterExcelConfigData.json",
        "ExcelBinOutput/MonsterDescribeExcelConfigData.json",
        "ExcelBinOutput/MonsterCurveExcelConfigData.json",
    }
)

DENYLIST_PATTERNS: tuple[str, ...] = (
    "QuestExcelConfigData",
    "NpcExcelConfigData",
    "TalkExcelConfigData",
    "MainQuestExcelConfigData",
    "Readable/",
    "Subtitle/",
    "BinOutput/Quest/",
    "BinOutput/Talk/",
)

DIM_ELEMENT_FROM_COST = {
    "Fire": "Pyro",
    "Water": "Hydro",
    "Electric": "Electro",
    "Ice": "Cryo",
    "Wind": "Anemo",
    "Rock": "Geo",
    "Grass": "Dendro",
}


def _assert_allowed_path(rel_path: str) -> str:
    norm = str(rel_path or "").replace("\\", "/").lstrip("/")
    for bad in DENYLIST_PATTERNS:
        if bad.lower() in norm.lower():
            raise ValueError(f"Spoiler firewall blocked forbidden AnimeGameData path: {norm}")
    if norm not in ALLOWED_EXCEL_FILES:
        raise ValueError(f"Spoiler firewall blocked non-whitelisted path: {norm}")
    return norm


def _http_get_bytes(rel_path: str, timeout: int = 30) -> bytes:
    last_err: Exception | None = None
    for base in (PRIMARY_BASE, FALLBACK_BASE):
        url = base + rel_path.lstrip("/")
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "AaruDB-Pipeline/2.0"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except Exception as exc:
            last_err = exc
    raise RuntimeError(f"Failed to fetch AnimeGameData resource {rel_path}: {last_err}")


def load_excel(rel_path: str, use_cache: bool = True) -> list[dict[str, Any]]:
    norm = _assert_allowed_path(rel_path)
    cache_path = CACHE_DIR / Path(norm).name
    if use_cache and cache_path.exists():
        try:
            return json.loads(cache_path.read_text(encoding="utf-8"))
        except Exception:
            pass
    raw_bytes = _http_get_bytes(norm, timeout=30)
    data = json.loads(raw_bytes.decode("utf-8"))
    if use_cache:
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data


def fetch_filtered_textmap(needed_hashes: set[int | str]) -> dict[str, str]:
    """
    Fetches TextMap_MediumEN.json and TextMapEN.json STRICTLY IN MEMORY (never written to disk),
    extracts only keys present in `needed_hashes`, then deletes each full TextMap immediately.
    """
    hash_strs = {str(h) for h in needed_hashes if h is not None and str(h) not in ("", "0")}
    if not hash_strs:
        return {}
    filtered: dict[str, str] = {}
    for tm_path in ("TextMap/TextMap_MediumEN.json", "TextMap/TextMapEN.json"):
        missing = hash_strs - filtered.keys()
        if not missing:
            break
        try:
            raw_bytes = _http_get_bytes(tm_path, timeout=60)
            full_map = json.loads(raw_bytes.decode("utf-8"))
            del raw_bytes
            for k in missing:
                if k in full_map:
                    filtered[k] = full_map[k]
            del full_map
            gc.collect()
        except Exception:
            continue
    return filtered


def extract_depot_passive_group_ids(depot: dict[str, Any]) -> list[int]:
    """
    Extracts passive proudSkillGroupId values across obfuscation-rotated depot fields
    without hardcoding obfuscated property names.
    """
    out: list[int] = []
    seen: set[int] = set()
    for val in (depot or {}).values():
        if not isinstance(val, list):
            continue
        for item in val:
            if isinstance(item, dict):
                gid = int(item.get("proudSkillGroupId") or 0)
                if gid > 0 and gid not in seen:
                    seen.add(gid)
                    out.append(gid)
    return out


def format_param_value(val: float, fmt: str) -> str:
    fmt_u = fmt.upper()
    if fmt_u.endswith("P"):
        dec_m = re.search(r"F(\d+)P", fmt_u)
        dec = int(dec_m.group(1)) if dec_m else 0
        return f"{val * 100:.{dec}f}%"
    if "I" in fmt_u:
        return str(round(val))
    dec_m = re.search(r"F(\d+)", fmt_u)
    if dec_m:
        return f"{val:.{int(dec_m.group(1))}f}"
    return f"{val:g}"


def format_param_template(tmpl: str, params: list[float]) -> tuple[str, str]:
    """
    Formats a ProudSkill paramDesc template like '1-Hit DMG|{param1:F1P}' into
    (label, rendered_value_string).
    """
    if "|" not in tmpl:
        return "", ""
    label, val_spec = tmpl.split("|", 1)

    def repl(m: re.Match[str]) -> str:
        idx = int(m.group(1)) - 1
        fmt = m.group(2) or ""
        if idx < 0 or idx >= len(params):
            return m.group(0)
        return format_param_value(float(params[idx] or 0.0), fmt)

    rendered = re.sub(r"\{param(\d+):([^}]+)\}", repl, val_spec)
    return label.strip(), rendered.strip()
