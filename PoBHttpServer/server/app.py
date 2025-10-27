from __future__ import annotations
import base64, os, threading, sys, re
from typing import Optional, List, Dict
from functools import lru_cache

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

POB_INSTALL = r"C:\Users\Dav 2\AppData\Roaming\Path of Building Community (PoE2)"
POB_PATH    = r"C:\Users\Dav 2\AppData\Roaming\Path of Building Community (PoE2)"
HARDCODED_BUILD = r"C:\Users\Dav 2\Documents\Path of Building (PoE2)\Builds\1\Shockburster Deadeye.xml"
MOD_RUNES_PATH = r"C:\Users\Dav 2\AppData\Roaming\Path of Building Community (PoE2)\Data\ModRunes.lua"
MOD_ENCHANTS_PATH = r"C:\Users\Dav 2\AppData\Roaming\Path of Building Community (PoE2)\Data\QueryMods.lua"

USER_POB_WRAPPER = r"C:\PoBHttpServer"
if USER_POB_WRAPPER and USER_POB_WRAPPER not in sys.path:
    sys.path.insert(0, USER_POB_WRAPPER)

HERE = os.path.abspath(os.path.dirname(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, ".."))
PY_SRC = os.path.join(REPO_ROOT, "PoBHttpServer", "pob_wrapper")
if os.path.exists(PY_SRC) and PY_SRC not in sys.path:
    sys.path.insert(0, REPO_ROOT)

try:
    from pob_wrapper import PathOfBuilding, ExternalError  # type: ignore
    _import_error = None
except Exception as e:
    PathOfBuilding = None  # type: ignore
    ExternalError = Exception  # type: ignore
    _import_error = e

app = FastAPI(title="PoB HTTP API", version="0.3")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

_pob = None
_lock = threading.Lock()

class LoadReq(BaseModel):
    path: Optional[str] = None

class ImpactReq(BaseModel):
    item: Optional[str] = None

def _ensure_pob():
    global _pob
    if _import_error:
        raise HTTPException(status_code=500, detail=f"Failed to import pob_wrapper: {_import_error}")
    if _pob is None:
        _pob = PathOfBuilding(pob_path=POB_PATH, pob_install=POB_INSTALL, verbose=True)  # type: ignore
    return _pob

def _try_b64(s: str) -> str:
    try:
        dec = base64.b64decode(s).decode("utf-8")
        if dec.count("\x00") > 0:
            return s
        return dec
    except Exception:
        return s

@app.get("/status")
def status():
    return {"running": _pob is not None, "import_error": str(_import_error) if _import_error else None}

@app.post("/load_pob")
def load_pob(req: LoadReq):
    with _lock:
        pob = _ensure_pob()
        build = (req.path or "").strip() or HARDCODED_BUILD
        build = _try_b64(build)
        try:
            pob.load_build(build)
        except ExternalError as e:  # type: ignore
            raise HTTPException(status_code=500, detail=f"PoB error: {getattr(e,'status',e)}")
    return {"status": "ok"}

@app.post("/item-impact")
def item_impact(req: ImpactReq):
    if req.item is None or not isinstance(req.item, str) or not req.item.strip() or req.item.strip().lower() == "null":
        raise HTTPException(status_code=400, detail="Empty or invalid item text")
    with _lock:
        pob = _ensure_pob()
        try:
            html = pob.test_item_as_html(req.item)
        except ExternalError as e:  # type: ignore
            raise HTTPException(status_code=500, detail=f"PoB error: {getattr(e,'status',e)}")
    if not html:
        raise HTTPException(status_code=422, detail="PoB returned no output for this item")
    return {"html": html}

@lru_cache
def _load_runes_table():
    slots = set(["weapon","bow","caster","armour","helmet","gloves","boots","sceptre","shield","focus","body armour"])
    table = {s: set() for s in slots}
    try:
        with open(MOD_RUNES_PATH, "r", encoding="utf-8", errors="ignore") as f:
            txt = f.read()
    except Exception as e:
        return {"_error": {str(e)}}

    depth = 0
    current_slot = None
    for raw in txt.splitlines():
        line = raw.strip()
        opens = line.count("{")
        closes = line.count("}")
        m = re.match(r'\[\s*"([^"]+)"\s*\]\s*=\s*{\s*$', line)
        if m and depth >= 1:
            key = m.group(1).strip().lower()
            current_slot = key if key in slots else None
            depth += 1
            continue
        if current_slot and 'type' not in line:
            s = re.match(r'"([^"]+)"\s*,?\s*$', line)
            if s:
                table[current_slot].add(s.group(1))
        depth += opens - closes
        if depth < 0:
            depth = 0
        if depth == 1:
            current_slot = None
    return table

def _collect_runes(slot: Optional[str]):
    tbl = _load_runes_table()
    if "_error" in tbl:
        raise HTTPException(status_code=500, detail=f"Rune file error: {next(iter(tbl['_error']))}")
    if not slot:
        return {k: sorted(v) for k, v in tbl.items() if v}
    req = [s.strip().lower() for s in slot.split(",") if s.strip()]
    out = set()
    for s in req:
        out |= set(tbl.get(s, set()))
    return sorted(out)

@app.get("/runes")
def runes(slot: Optional[str] = None):
    return _collect_runes(slot)


@lru_cache(maxsize=1)
def _load_amulet_enchants() -> List[Dict[str, str]]:
    """Parse QueryMods.lua and collect 'tradeMod' entries where type == "enchant"."""
    path = MOD_ENCHANTS_PATH  # this is already defined in your file
    out: List[Dict[str, str]] = []

    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            data = f.read()

        # Matches:
        #   ["tradeMod"] = {
        #       ["id"] = "…",
        #       ["text"] = "…",
        #       ["type"] = "enchant",
        #       ...
        #   }
        pat = re.compile(
            r'\["tradeMod"\]\s*=\s*{'
            r'(?:(?!}).)*?\["id"\]\s*=\s*"([^"]+)"'
            r'(?:(?!}).)*?\["text"\]\s*=\s*"([^"]+)"'
            r'(?:(?!}).)*?\["type"\]\s*=\s*"enchant"'
            r'(?:(?!}).)*?}',
            re.S
        )

        for _id, _text in pat.findall(data):
            # Only keep the amulet-appropriate "Allocates …" enchants
            if not _text.startswith("Allocates "):
                continue
            out.append({"id": _id, "text": _text})

        out.sort(key=lambda d: d["text"])
        return out

    except Exception as e:
        # surface a clear message to the API caller
        raise RuntimeError(f"Failed to load amulet enchants from {path}: {type(e).__name__}: {e}") from e


@app.get("/amulet-enchants")
def amulet_enchants(q: Optional[str] = None, limit: int = 25):
    """
    Searchable list of amulet enchants from QueryMods.lua.
    - `q`: optional case-insensitive substring filter
    - `limit`: max items returned (default 25)
    """
    try:
        items = _load_amulet_enchants()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if q:
        qs = q.strip().lower()
        if qs:
            items = [d for d in items if qs in d["text"].lower()]

    if limit and limit > 0:
        items = items[: int(limit)]

    return items
