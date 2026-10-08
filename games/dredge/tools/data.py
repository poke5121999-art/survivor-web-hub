"""Export DREDGE gameplay data + item/UI sprites for the web remake.

Run (python 3.8, UnityPy 1.25, Pillow with webp):
    python -I games/dredge/tools/data.py [--no-art]
Reads  D:/dredge-ref/cache/bundle_index.json (see index_bundles.py), the Addressables bundles,
       and the decompiled C# in D:/dredge-ref/src (enum names + field types).
Writes games/dredge/data/{items,strings,strings-dialogue,upgrades,grids,weather,quests,
       mapmarkers,worldevents,misc,ui}.js   (window.DR_* globals)
       games/dredge/art/items/<id>.webp     (long side <= 256 px)
       games/dredge/art/ui/sprites/*.webp   (UI sprites; manifest in data/ui.js)
       D:/dredge-ref/cache/data/*.json      (same data as indented JSON)
Fields that live in Odin Serializer blobs (value, sellOverrideValue, research prerequisites,
quest conditions, upgrade costs) are decoded with odin.py and merged into each entry.
Normalisation: PPtr -> id/asset name string (Sprite -> exported image path), enum ints -> names
(flags -> lists), LocalizedString -> English text, Color -> "#rrggbb", {x,y} -> [x,y].
Round 2 additions (each has its own section below):
  - items: tooltipTextColor/tooltipNotesColor; itemInsane*Key, additionalNoteKey (+ *Key of
    dialogueNodeSpecificDescription) hold DR_STR keys, the English text sits beside them;
  - grids: every GridConfiguration sub-asset the container scan never lists (Pot1, Pot7, Net2.., ItemPickup*,
    the hull upgrade delivery grids...), DR_CONFIG.gridKeyIds;
  - upgrades: DR_UPGRADES[id].questGrid (the 20 upgrade QuestGridConfigs), upgradeCost = decoded conditions;
  - weather: parameters.sfx = AudioClip name (PPtr into an audio bundle that load_all skips);
  - scene components with Odin data -> DR_WORLD.<Class>.<Class>: ShopRestocker, TooltipSectionGadgetDetails,
    QuestGridPanel, UpgradeGridPanel, HarvestMinigameView (storage tray unlock quest).
"""
import base64, collections, glob, json, os, re, struct, sys

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import UnityPy
import odin

REF = "D:/dredge-ref"
AA = REF + "/game/DREDGE.v1.5.3_LinkNeverDie.Com/DREDGE_Data/StreamingAssets/aa/StandaloneWindows/"
DATA = AA.split("StreamingAssets")[0]
SRC = REF + "/src"
CACHE = REF + "/cache/data"
GAME = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
DATA_OUT = GAME + "/data"
ART_ITEMS = GAME + "/art/items"
ART_UI = GAME + "/art/ui"
NO_ART = "--no-art" in sys.argv
MAXSIDE = 256


# ---------------------------------------------------------------- C# source model
class CS:
    """Enums, class inheritance and field types parsed from the decompiled sources."""

    def __init__(self):
        self.enums, self.bases, self.fields = {}, {}, {}
        for p in glob.glob(SRC + "/**/*.cs", recursive=True):
            with open(p, encoding="utf-8", errors="replace") as f:
                t = f.read()
            for m in re.finditer(r"(\[Flags\]\s*)?(?:public\s+)?enum\s+(\w+)[^{]*\{(.*?)\n\}", t, re.S):
                self._enum(m.group(2), bool(m.group(1)), m.group(3))
            for m in re.finditer(r"(?:public |internal )?(?:abstract |sealed |static )*(?:class|struct)\s+(\w+)\s*(?::\s*([\w\.<>, ]+?))?\s*(?:where [^{]*)?\{", t):
                name = m.group(1)
                self.bases.setdefault(name, (m.group(2) or "").split(",")[0].strip().split("<")[0])
                body = self._body(t, m.end())
                f = self.fields.setdefault(name, {})
                # one-tab indent = direct member; "=>" excluded so expression properties are not fields
                for fm in re.finditer(r"^\t(?:public|private|protected|internal)\s+(?!static|const|override|abstract|virtual)([\w<>\[\], \.]+?)\s+(\w+)\s*(=(?!>)[^;]*)?;", body, re.M):
                    f[fm.group(2)] = fm.group(1).strip()

    @staticmethod
    def _body(t, i):
        d, j = 1, i
        while d and j < len(t):
            c = t[j]
            d += (c == "{") - (c == "}")
            j += 1
        return t[i:j]

    def _enum(self, name, flags, body):
        vals, nxt = {}, 0
        for part in body.split(","):
            part = re.sub(r"//.*|\[[^\]]*\]", "", part).strip()
            m = re.match(r"(\w+)\s*(?:=\s*(.+))?$", part, re.S) if part else None
            if not m:
                continue
            if m.group(2):
                expr = m.group(2).strip()
                try:
                    nxt = int(expr, 0)
                except ValueError:
                    try:
                        nxt = eval(re.sub(r"\b([A-Z_a-z]\w*)\b", lambda k: str(vals.get(k.group(1), 0)), expr), {})
                    except Exception:
                        pass
            vals[m.group(1)] = nxt
            nxt += 1
        self.enums[name] = (flags, vals)

    def chain(self, cls):
        out = []
        while cls and cls not in out:
            out.append(cls)
            cls = self.bases.get(cls)
        return out

    def ftype(self, cls, field):
        for c in self.chain(cls):
            t = self.fields.get(c, {}).get(field)
            if t:
                return t
        return None

    def enum_name(self, etype, v):
        flags, vals = self.enums[etype]
        if not flags:
            return next((k for k, x in vals.items() if x == v), v)
        if v == 0:
            return [k for k, x in vals.items() if x == 0][:1]
        if v == -1:
            return ["ALL"]
        names = [k for k, x in vals.items() if x > 0 and (x & (x - 1)) == 0 and v & x]
        rest = v & ~sum(vals[k] for k in names)
        return names + (["UNKNOWN_%d" % rest] if rest else [])


cs = CS()


# ---------------------------------------------------------------- bundle world
class World:
    def __init__(self):
        self.cabs = {}          # lowercase cab name -> SerializedFile
        self.bundle_cabs = {}   # bundle file -> [SerializedFile]
        self.scripts = {}
        self.unresolved = collections.Counter()

    def load(self, bundle):
        if bundle in self.bundle_cabs:
            return self.bundle_cabs[bundle]
        env = UnityPy.load(AA + bundle)
        self.bundle_cabs[bundle] = [c for c in env.cabs.values() if hasattr(c, "objects")]
        for name, sf in env.cabs.items():
            self.cabs[name.lower()] = sf
        return self.bundle_cabs[bundle]

    def load_player_files(self):
        """sharedassets0.assets (GameConfigData, difficulty configs, extra items/grids) has no typetrees:
        generate them from Managed/Assembly-CSharp.dll. globalgamemanagers.assets holds its MonoScripts."""
        from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
        key = "player"
        if key in self.bundle_cabs:
            return self.bundle_cabs[key]
        env = UnityPy.load(DATA + "globalgamemanagers.assets", DATA + "sharedassets0.assets")
        sfs = [f for f in env.files.values() if hasattr(f, "objects")]
        gen = TypeTreeGenerator(sfs[0].unity_version)
        gen.load_local_game(os.path.dirname(DATA.rstrip("/")))
        env.typetree_generator = gen
        for name, f in env.files.items():
            self.cabs[os.path.basename(name).lower()] = f
        self.bundle_cabs[key] = sfs
        self.player_sf = next(f for n, f in env.files.items() if n.endswith("sharedassets0.assets"))
        return sfs

    def obj(self, sf, fid, pid):
        if pid == 0:
            return None
        if fid == 0:
            return sf.objects.get(pid)
        ext = sf.externals[fid - 1].path
        tsf = self.cabs.get(ext.replace("\\", "/").split("/")[-1].lower())
        if tsf is None:
            self.unresolved[ext] += 1
            return None
        return tsf.objects.get(pid)

    def cls(self, o):
        if o.type.name != "MonoBehaviour":
            return o.type.name
        raw = bytes(o.get_raw_data()[:28])
        fid, pid = struct.unpack_from("<iq", raw, 16)  # m_GameObject(12) m_Enabled(4) then m_Script
        key = (id(o.assets_file), fid, pid)
        if key not in self.scripts:
            sc = self.obj(o.assets_file, fid, pid)
            self.scripts[key] = sc.read().m_ClassName if sc is not None else "?"
        return self.scripts[key]

    def load_all(self):
        """Every non-audio bundle, so script and asset PPtrs across bundles resolve."""
        for b in sorted(index["bundles"]):
            if not any(x in b for x in ("audio", "vocals", "localization-assets-", "localization-asset-tables")):
                self.load(b)


W = World()
index = json.load(open(REF + "/cache/bundle_index.json", encoding="utf-8"))
containers = index["containers"]


def bundles_like(prefix):
    return sorted({v["bundle"] for v in containers.values() if v["bundle"].startswith(prefix)})


# ---------------------------------------------------------------- addressables catalog
def load_catalog():
    """guid -> asset path, from the Addressables catalog (AssetReference fields only carry a guid)."""
    d = json.load(open(AA + "../catalog.json", encoding="utf-8"))
    kd, bd, ed = (base64.b64decode(d[k]) for k in ("m_KeyDataString", "m_BucketDataString", "m_EntryDataString"))
    nb = struct.unpack_from("<i", bd, 0)[0]
    p, keys, buckets = 4, [], []
    for _ in range(nb):
        ko, ne = struct.unpack_from("<ii", bd, p)
        buckets.append(struct.unpack_from("<%di" % ne, bd, p + 8))
        p += 8 + 4 * ne
        t = kd[ko]
        if t in (0, 1):
            n = struct.unpack_from("<i", kd, ko + 1)[0]
            keys.append(kd[ko + 5:ko + 5 + n].decode("ascii" if t == 0 else "utf-16-le"))
        else:
            keys.append(None)
    ne = struct.unpack_from("<i", ed, 0)[0]
    entries = [struct.unpack_from("<7i", ed, 4 + 28 * i) for i in range(ne)]
    out = {}
    for k, b in zip(keys, buckets):
        if isinstance(k, str) and re.fullmatch(r"[0-9a-f]{32}", k) and b:
            out[k] = d["m_InternalIds"][entries[b[0]][0]]
    return out


GUIDS = load_catalog()


# ---------------------------------------------------------------- localisation
class Loc:
    def __init__(self):
        self.shared, self.names, self.text, self.tables = {}, {}, {}, {}

    def load(self):
        for sf in W.load(bundles_like("localization-assets-shared")[0]):
            for o in sf.objects.values():
                if o.type.name == "MonoBehaviour" and W.cls(o) == "SharedTableData":
                    t = o.read_typetree()
                    g = t["m_TableCollectionNameGuidString"]
                    self.names[t["m_TableCollectionName"]] = g
                    self.shared[g] = {e["m_Id"]: e["m_Key"] for e in t["m_Entries"]}
        for sf in W.load(bundles_like("localization-string-tables-english")[0]):
            for o in sf.objects.values():
                if o.type.name == "MonoBehaviour" and W.cls(o) == "StringTable":
                    t = o.read_typetree()
                    tn = t["m_Name"].rsplit("_", 1)[0]  # Items_en -> Items
                    g = self.names[tn]
                    self.text[g] = {e["m_Id"]: e["m_Localized"] for e in t["m_TableData"]}
                    self.tables[tn] = {self.shared[g][i]: s for i, s in self.text[g].items() if i in self.shared[g]}

    def resolve(self, ls):
        ref, ent = ls["m_TableReference"]["m_TableCollectionName"], ls["m_TableEntryReference"]
        g = ref[5:] if ref.startswith("GUID:") else self.names.get(ref)
        if not g:
            return None
        kid = ent["m_KeyId"]
        key = ent["m_Key"] or self.shared.get(g, {}).get(kid)
        if key is None:
            return None
        if not kid:
            kid = next((i for i, k in self.shared[g].items() if k == key), 0)
        return {"key": key, "text": self.text.get(g, {}).get(kid)}


loc = Loc()


# ---------------------------------------------------------------- sprite export
class Art:
    def __init__(self):
        self.done, self.paths, self.bytes = {}, {}, 0

    def sprite(self, o, outdir, name, reldir):
        key = (id(o.assets_file), o.path_id)
        if key in self.done:
            return self.done[key]
        rel = "%s/%s.webp" % (reldir, name)
        if rel in self.paths:  # same name, different sprite
            rel = "%s/%s_%x.webp" % (reldir, name, o.path_id & 0xFFFF)
        self.paths[rel] = key
        self.done[key] = rel
        if NO_ART:
            return rel
        try:
            img = o.read().image
        except Exception as e:
            print("sprite fail", name, e)
            self.done[key] = None
            return None
        s = max(img.size)
        if s == 0:
            self.done[key] = None
            return None
        if s > MAXSIDE:
            img = img.resize((max(1, round(img.width * MAXSIDE / s)), max(1, round(img.height * MAXSIDE / s))), 1)
        path = GAME + "/" + rel
        os.makedirs(os.path.dirname(path), exist_ok=True)
        img.save(path, "WEBP", quality=88, method=4)
        self.bytes += os.path.getsize(path)
        return rel


art = Art()
CURRENT = {"item": None}


# ---------------------------------------------------------------- normalisation
def r6(x):
    return round(x, 6) if isinstance(x, float) else x


def hexcolor(c):
    h = "#%02x%02x%02x" % tuple(max(0, min(255, int(round(c[k] * 255)))) for k in "rgb")
    return h if c.get("a", 1) >= 0.999 else h + "%02x" % int(round(c["a"] * 255))


NOISE = {"m_GameObject", "m_Enabled", "m_Script", "serializationData", "m_Name", "m_ObjectHideFlags", "references",
         "harvestParticlePrefab", "overrideHarvestParticleDepth", "harvestParticleDepthOffset",
         "flattenParticleShape"}


INLINE = set()   # classes expanded in place instead of referenced by name (set per export)
_stack = set()


def raw_name(o):
    """m_Name of a MonoBehaviour straight from its bytes (right after m_Script), for assets whose typetree fails."""
    raw = bytes(o.get_raw_data())
    n = struct.unpack_from("<i", raw, 28)[0]
    return raw[32:32 + n].decode("utf-8", "replace") if 0 <= n < 200 else "?"


_CLIPS = {}


def audio_clip_name(path_id):
    """Name of an AudioClip inside an audio bundle that load_all() skips (gameaudio alone is 258 MB).
    bundle_index.json lists every clip as Assets/Audio/.../<name>.ogg keyed by path_id; the name is the file name
    without extension, the same convention as the Addressables AssetReference fields. None when unknown or ambiguous."""
    if not _CLIPS:
        for path, v in containers.items():
            if v["type"] == "AudioClip":
                _CLIPS.setdefault(v["path_id"], set()).add(os.path.splitext(os.path.basename(path))[0])
    names = _CLIPS.get(path_id)
    return next(iter(names)) if names and len(names) == 1 else None


# GridConfiguration objects of different shape can share one asset name (the hull upgrade delivery grid Tier2Hull 5x6
# and the hull layout Tier2Hull 7x10), so a name alone does not say which DR_GRIDS entry a reference points to.
GRID_SIG = {}      # (asset name, shape signature) -> key in DR_GRIDS; empty until sweep_grids() has run
GRID_HINT = {}     # (id(assets_file), path_id) -> GridKey name that delivers into that grid (suffix of a clashing key)
_grid_cache = {}


def grid_sig(d):
    """Shape of an exported GridConfiguration. mainItemData is left out: the sharedassets0 copy of a grid names the
    item by asset, the bundle copy by id, and nothing else differs between the two copies."""
    return json.dumps({k: v for k, v in d.items() if k not in ("asset", "mainItemData")}, sort_keys=True)


def grid_key_of(o):
    """DR_GRIDS key of a GridConfiguration object (None while GRID_SIG is empty or the shape is unknown)."""
    ident = (id(o.assets_file), o.path_id)
    if ident not in _grid_cache:
        d = export_obj(o, "GridConfiguration")
        _grid_cache[ident] = GRID_SIG.get((d["asset"], grid_sig(d)))
    return _grid_cache[ident]


def ref_name(o):
    """Stable string for a referenced object: id of an ItemData-like asset, else asset name."""
    if o.type.name == "MonoBehaviour":
        if GRID_SIG and W.cls(o) == "GridConfiguration":
            k = grid_key_of(o)
            if k:
                return k
        try:
            t = o.read_typetree()
        except Exception:
            return raw_name(o)
        i = t.get("id")
        return i if isinstance(i, str) and i else (t.get("m_Name") or W.cls(o))
    return "%s:%s" % (o.type.name, getattr(o.read(), "m_Name", ""))


def norm(v, ctype, sf, depth=1, field=None):
    if isinstance(v, list):
        m = ctype and (re.match(r"(?:List|IList|IEnumerable)<(.+)>$", ctype) or re.match(r"(.+)\[\]$", ctype))
        et = m.group(1) if m else None
        return [norm(x, et, sf, depth + 1) for x in v]
    if not isinstance(v, dict):
        if ctype in cs.enums and isinstance(v, int) and not isinstance(v, bool):
            return cs.enum_name(ctype, v)
        if ctype == "bool" and v in (0, 1):
            return bool(v)
        return r6(v)
    ks = set(v)
    if ks == {"m_FileID", "m_PathID"}:
        if v["m_PathID"] == 0:
            return None
        o = W.obj(sf, v["m_FileID"], v["m_PathID"])
        if o is None:
            # external CAB not loaded: only AudioClips of the skipped audio bundles can still be named
            return audio_clip_name(v["m_PathID"]) if v["m_FileID"] else None
        if o.type.name == "Sprite":
            if CURRENT["item"] and field == "sprite" and depth == 2:  # the item's own top-level field
                return art.sprite(o, ART_ITEMS, CURRENT["item"], "art/items")
            return art.sprite(o, ART_UI, "sprites/" + o.read().m_Name, "art/ui")
        if o.type.name == "MonoBehaviour" and W.cls(o) in INLINE and (id(o.assets_file), o.path_id) not in _stack:
            _stack.add((id(o.assets_file), o.path_id))
            try:
                return export_obj(o, W.cls(o))
            finally:
                _stack.discard((id(o.assets_file), o.path_id))
        return ref_name(o)
    if "m_AssetGUID" in ks:
        g = v["m_AssetGUID"]
        return os.path.splitext(os.path.basename(GUIDS[g]))[0] if g in GUIDS else None
    if "m_TableEntryReference" in ks:
        r = loc.resolve(v)
        return r["text"] if r else None
    if len(ks) == 4 and ks == {"r", "g", "b", "a"}:
        return hexcolor(v)
    if ks == {"x", "y"}:
        return [r6(v["x"]), r6(v["y"])]
    if ks == {"x", "y", "z"}:
        return [r6(v["x"]), r6(v["y"]), r6(v["z"])]
    if "m_Curve" in ks:
        return [[r6(k["time"]), r6(k["value"]), r6(k["inSlope"]), r6(k["outSlope"])] for k in v["m_Curve"]]
    out = {}
    for k, x in v.items():
        if depth == 1 and k in NOISE:
            continue
        out[k] = norm(x, cs.ftype(ctype, k) if ctype else None, sf, depth + 1, k)
    return out


_PRIM = {"Decimal": None, "Single": "<f", "Double": "<d", "Int32": "<i", "UInt32": "<I", "Int64": "<q",
         "Int16": "<h", "Byte": "<B", "SByte": "<b", "Boolean": "<?"}


def decode_prim(arr, t):
    """Odin PrimitiveArray payload -> list, element type taken from the array's .NET type name."""
    raw = bytes.fromhex(arr["$bytes"])
    elem = t.split(",")[0][:-2].split(".")[-1]
    if elem == "Decimal":
        out = []
        for i in range(arr["$count"]):
            flags, hi, lo = struct.unpack_from("<IIQ", raw, 16 * i)
            v = ((hi << 64) | lo) / (10 ** ((flags >> 16) & 0xFF))
            out.append(r6(-v if flags & 0x80000000 else v))
        return out
    f = _PRIM.get(elem)
    if not f:
        return arr["$bytes"]
    return [r6(x) for x in struct.unpack("<%d%s" % (arr["$count"], f[1]), raw)]


def odin_norm(d, refs, sf, ctype=None):
    """Odin node tree -> plain JSON; unity refs resolved through ReferencedUnityObjects."""
    if isinstance(d, list):
        return [odin_norm(x, refs, sf) for x in d]
    if not isinstance(d, dict):
        return r6(d)
    if "$unity" in d:
        i = d["$unity"]
        return norm(refs[i], None, sf) if i < len(refs) else None
    if "$ref" in d:
        return {"$ref": d["$ref"]}
    if "$bytes" in d:
        return d["$bytes"]
    if "$extstr" in d or "$guid" in d:
        return d.get("$extstr") or d.get("$guid")
    t = d.get("$type") or ""
    short = None
    if t:
        short = re.match(r"([\w\.\+]+)", t).group(1).split(".")[-1].split("`")[0]
    items = d.get("$items")
    if t.startswith("System.Collections.Generic.List"):
        return [odin_norm(x, refs, sf) for x in (items or [])]
    if short in ("Vector2", "Vector3", "Vector2Int", "Vector3Int", "Vector4", "Color"):
        if items and all(isinstance(x, (int, float)) for x in items):
            return [r6(x) for x in items]  # Odin writes these structs as unnamed primitives
        return [r6(d[k]) for k in "xyzw" if k in d]
    if t.split(",")[0].endswith("[]") or t.startswith("System.Collections.Generic.HashSet"):
        if items and len(items) == 1 and isinstance(items[0], dict) and "$bytes" in items[0]:
            return decode_prim(items[0], t)
        return [odin_norm(x, refs, sf) for x in (items or [])]
    if re.search(r"Dictionary`2", t):
        km = re.search(r"\[\[([\w\.]+),[^\]]*\],\[([\w\.]+),", t)
        ktype, vtype = (km.group(1), km.group(2)) if km else (None, None)
        pairs = []
        for x in (items or []):
            if not isinstance(x, dict):
                continue
            k = odin_norm(x.get("$k", x.get("Key")), refs, sf)
            v = odin_norm(x.get("$v", x.get("Value")), refs, sf)
            if ktype in cs.enums and isinstance(k, int):
                k = cs.enum_name(ktype, k)
            if vtype in cs.enums and isinstance(v, int) and not isinstance(v, bool):
                v = cs.enum_name(vtype, v)
            pairs.append((k, v))
        if all(isinstance(k, (str, int)) for k, _ in pairs):
            return {str(k): v for k, v in pairs}
        return [{"k": k, "v": v} for k, v in pairs]
    out = {}
    if short and short != "KeyValuePair":
        out["_t"] = short
    for k, x in d.items():
        if k.startswith("$"):
            continue
        ft = cs.ftype(short, k) if short else None
        v = odin_norm(x, refs, sf)
        out[k] = cs.enum_name(ft, v) if ft in cs.enums and isinstance(v, int) else v
    if items is not None:
        out["_items"] = [odin_norm(x, refs, sf) for x in items]
    return out


stats = {"odin_ok": 0, "odin_fail": 0}


def savetemplate_typetree(o):
    """SaveDataTemplate's generated typetree does not match the player build, so parse the Unity part by hand.
    Layout: m_Script ends at byte 28, then m_Name and Odin's SerializationData, then the plain fields."""
    raw = bytes(o.get_raw_data())
    pos = [28]

    def i32():
        v = struct.unpack_from("<i", raw, pos[0])[0]
        pos[0] += 4
        return v

    def take(n):
        b = raw[pos[0]:pos[0] + n]
        pos[0] += n
        return b

    def align():
        pos[0] = (pos[0] + 3) & ~3

    def string():
        b = take(i32()).decode("utf-8")
        align()
        return b

    name = string()
    fmt = i32()
    blob = take(i32())
    align()
    refs = []
    for _ in range(i32()):
        refs.append({"m_FileID": i32(), "m_PathID": struct.unpack("<q", take(8))[0]})
    string()
    take(12)
    take(12 * i32())
    for _ in range(i32()):
        string()
    assert i32() == 0, "SerializationNodes not empty"
    t = {"m_Name": name, "serializationData": {"SerializedFormat": fmt, "SerializedBytes": list(blob),
                                              "ReferencedUnityObjects": refs}}
    t["version"], t["dockId"], t["dockSlotIndex"] = i32(), string(), i32()
    assert i32() == 0, "ownedNonSpatialItems not empty"
    t["unlockedAbilities"] = [string() for _ in range(i32())]
    assert i32() == 0 and pos[0] == len(raw), "unexpected SaveDataTemplate layout"
    return t


def export_obj(o, cls):
    """One ScriptableObject -> normalised dict (typetree + Odin)."""
    sf = o.assets_file
    t = savetemplate_typetree(o) if cls == "SaveDataTemplate" else o.read_typetree()
    sd = t.get("serializationData") or {}
    d = norm(t, cls, sf)
    d = {k: v for k, v in d.items() if v is not None and v != "" and v != []}
    blob = sd.get("SerializedBytes")
    if blob:
        try:
            od = odin.decode(blob)
            stats["odin_ok"] += 1
            refs = sd.get("ReferencedUnityObjects") or []
            for k, x in od.items():
                if k.startswith("$"):
                    continue
                ft = cs.ftype(cls, k)
                v = odin_norm(x, refs, sf)
                if ft in cs.enums and isinstance(v, int):
                    v = cs.enum_name(ft, v)
                if v is not None and v != [] and v != "":
                    d[k] = v
        except odin.OdinError as e:
            stats["odin_fail"] += 1
            print("ODIN FAIL", t.get("m_Name"), e)
    d["asset"] = t.get("m_Name")
    return d


def collect(prefix):
    """[(container_path, class, object)] for the MonoBehaviour assets of bundles starting with prefix."""
    out = []
    for b in bundles_like(prefix):
        W.load(b)
    for path, v in containers.items():
        if not v["bundle"].startswith(prefix) or v["type"] != "MonoBehaviour":
            continue
        o = next((sf.objects[v["path_id"]] for sf in W.bundle_cabs[v["bundle"]] if v["path_id"] in sf.objects), None)
        if o is None:
            print("missing", path)
            continue
        out.append((path, W.cls(o), o))
    return out


def write_js(name, var, obj):
    os.makedirs(DATA_OUT, exist_ok=True)
    s = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    with open(DATA_OUT + "/" + name, "w", encoding="utf-8", newline="\n") as f:
        f.write("window.%s=%s;\n" % (var, s))
    os.makedirs(CACHE, exist_ok=True)
    with open(CACHE + "/" + name.replace(".js", ".json"), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    print("wrote %-20s %9d bytes" % (name, len(s.encode("utf-8"))))


def key_of(d, pool):
    k = d["id"] if isinstance(d.get("id"), str) and d["id"] else d["asset"]
    return k if k not in pool else "%s#%s" % (k, d["asset"])


def shape_item(d, cls):
    out = {"id": d.pop("id", None) or d["asset"], "cls": cls}
    out["name"] = d.pop("itemNameKey", None)
    out["desc"] = d.pop("itemDescriptionKey", None)
    for src, dst in (("itemType", "type"), ("itemSubtype", "subtype")):
        v = d.pop(src, None)
        out[dst] = "|".join(v) if isinstance(v, list) else v
    out["value"] = d.pop("value", 0)
    dims = d.pop("dimensions", None) or []
    out["dims"] = dims
    out["w"] = max([c[0] for c in dims], default=-1) + 1
    out["h"] = max([c[1] for c in dims], default=-1) + 1
    out["sprite"] = d.pop("sprite", None)
    out["color"] = d.pop("itemColor", None)
    out.update(d)
    return out


# Sprites that are gameplay-irrelevant effects/portraits baked into scenes; the rest is exported as UI.
UI_SKIP = re.compile(r"Particle|Debris|Bubbles|Lightning|Crack|^FlyP|Splash_Texture|Voronoi|WaterBubble|SoftGlow|"
                     r"Scientist|BoardNote|BoardShard|PaperRubbish|BlackSalt|Team17|MapBoatSprites|"
                     r"^UISprite$|^Background$", re.I)
UI_BUNDLES = ("gamescene_scenes", "gamescene_assets", "titlescene", "upgradedata", "achievementdata",
              "questgriddata", "questdata", "game_assets")


def export_ui():
    manifest = {}
    CURRENT["item"] = None
    for pre in UI_BUNDLES:
        for b in bundles_like(pre):
            for sf in W.load(b):
                for o in sf.objects.values():
                    if o.type.name != "Sprite":
                        continue
                    nm = o.read().m_Name
                    if UI_SKIP.search(nm):
                        continue
                    rel = art.sprite(o, ART_UI, "sprites/" + nm, "art/ui")
                    if rel:
                        k = nm if nm not in manifest or manifest[nm] == rel else nm + "#" + os.path.basename(rel)
                        manifest[k] = rel
    write_js("ui.js", "DR_UI", manifest)


WORLD_CLASSES = {"ShopData", "DockData", "SpeakerData", "AbilityData", "MonsterData", "GhostRockConfig",
                 "OozeEventData", "SpeakerDataLookup", "ConstructableDestinationData", "WorldStateChangerConfig",
                 "MapStampConfig", "EncyclopediaConfig", "ConstructableBuildingDependencyConfig",
                 "HarvestTypeTagConfig", "EntitlementData"}


def scan_scriptable(classes):
    """{class: [(subclass, object)]} of ScriptableObject assets (m_GameObject == null) in every loaded file."""
    out = collections.defaultdict(list)
    seen = set()
    for sfs in W.bundle_cabs.values():
        for sf in sfs:
            for o in sf.objects.values():
                if o.type.name != "MonoBehaviour" or (id(sf), o.path_id) in seen:
                    continue
                seen.add((id(sf), o.path_id))
                c = W.cls(o)
                hit = next((x for x in cs.chain(c) if x in classes), None)
                if hit and struct.unpack_from("<q", bytes(o.get_raw_data()[:12]), 4)[0] == 0:
                    out[hit].append((c, o))
    return out


def export_png(tex_obj, rel):
    """Lossless full-size PNG (wave masks keep their channels: green = depth, alpha = steepness)."""
    if NO_ART:
        return rel
    img = tex_obj.read().image
    path = GAME + "/" + rel
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "PNG", optimize=True)
    return rel


def export_wave():
    """WaveController + AdditionalWaveMask live as components in the Game scene."""
    out = {}
    for b in bundles_like("gamescene_scenes"):
        for sf in W.bundle_cabs[b]:
            for o in sf.objects.values():
                if o.type.name != "MonoBehaviour":
                    continue
                c = W.cls(o)
                if c not in ("WaveController", "AdditionalWaveMask"):
                    continue
                t = o.read_typetree()
                d = {}
                for k, v in t.items():
                    if k in NOISE:
                        continue
                    if isinstance(v, dict) and set(v) == {"m_FileID", "m_PathID"}:
                        tgt = W.obj(sf, v["m_FileID"], v["m_PathID"])
                        if tgt is not None and tgt.type.name == "Texture2D":
                            name = tgt.read().m_Name
                            # world.py already writes the WaveController mask as art/world/depthmask.png;
                            # exporting it here too shipped the same 2.2 MB twice.
                            d[k] = ("art/world/depthmask.png" if c == "WaveController"
                                    else export_png(tgt, "art/world/wavemask-dlc1.png"))
                        elif tgt is not None and W.cls(tgt) == "AdditionalWaveMask":
                            continue
                        else:
                            d[k] = norm(v, None, sf)
                    else:
                        d[k] = norm(v, cs.ftype(c, k), sf, 2, k)
                out[c] = d
    return out


# ---------------------------------------------------------------- DR_STR keys next to English text
STRINGS = {}     # DR_STR (filled by main): every key handed to the web is checked against it
LOC_BAD = []

ITEM_KEY_FIELDS = {"itemInsaneTitleKey": "itemInsaneTitle", "itemInsaneDescriptionKey": "itemInsaneDescription",
                   "additionalNoteKey": "additionalNote"}                                  # key field -> text field
ITEM_TEXT_FIELDS = {"dialogueNodeSpecificDescription": "dialogueNodeSpecificDescriptionKey"}  # text field -> key field


def loc_pair(ls, what):
    """(DR_STR key, English text) of a LocalizedString. The key must resolve to exactly that text in DR_STR."""
    r = loc.resolve(ls)
    if r is None or STRINGS.get(r["key"]) != r["text"]:
        LOC_BAD.append("%s: %r" % (what, r))
        return None, None
    return r["key"], r["text"]


def split_loc_fields(d, t):
    """Item fields that hold a LocalizedString. norm() flattened them to English text, but the web looks strings up by
    key in DR_STR. Rule: <x>Key holds the key and <x> the text (itemInsaneTitleKey + itemInsaneTitle);
    dialogueNodeSpecificDescription keeps its text and gains dialogueNodeSpecificDescriptionKey."""
    out = {}
    for k, v in d.items():
        if k in ITEM_KEY_FIELDS:
            key, text = loc_pair(t[k], "%s.%s" % (d["id"], k))
            out[k], out[ITEM_KEY_FIELDS[k]] = key, text
        elif k in ITEM_TEXT_FIELDS:
            key, text = loc_pair(t[k], "%s.%s" % (d["id"], k))
            out[k], out[ITEM_TEXT_FIELDS[k]] = text, key
        else:
            out[k] = v
    return out


# ---------------------------------------------------------------- GridConfiguration sub-assets
def sweep_grids(grids, exported):
    """collect() lists only the main assets of a bundle (its container entries). Many GridConfigurations are sub-assets
    that items, upgrades and quest grids point to (Pot1, Pot7, Net2.., ItemPickup*, the hull upgrade delivery grids), and
    sharedassets0 holds only part of them. Walk every loaded file and add each GridConfiguration whose shape is not
    exported yet: under its asset name, or name#<GridKey that delivers into it | bundle> when the name is taken.
    `exported` holds the identities already in grids; they only seed the shape registry GRID_SIG."""
    GRID_SIG.clear()
    for k, d in grids.items():
        GRID_SIG.setdefault((d["asset"], grid_sig(d)), k)
    added, seen = [], set(exported)
    for bname, sfs in W.bundle_cabs.items():
        for sf in sfs:
            for o in sf.objects.values():
                if o.type.name != "MonoBehaviour" or (id(sf), o.path_id) in seen:
                    continue
                seen.add((id(sf), o.path_id))
                if W.cls(o) != "GridConfiguration":
                    continue
                d = export_obj(o, "GridConfiguration")
                sig = (d["asset"], grid_sig(d))
                if sig in GRID_SIG:
                    continue
                k = d["asset"]
                if k in grids:
                    k = "%s#%s" % (k, GRID_HINT.get((id(sf), o.path_id)) or bname.split("_assets")[0])
                assert k not in grids, "grid %s: key %s is taken by a grid of another shape" % (d["asset"], k)
                grids[k] = d
                GRID_SIG[sig] = k
                added.append(k)
    _grid_cache.clear()
    print("grids swept in (sub-assets the container scan never lists): %d" % len(added), added)
    return added


# ---------------------------------------------------------------- upgrade QuestGridConfigs
def upgrade_grid_objects(upgrade_objs):
    """[(upgrade key, QuestGridConfig object, its typetree, delivery GridConfiguration object)]. The delivery grid is noted
    in GRID_HINT so sweep_grids() can name a clashing asset after its GridKey (Tier2Hull#UPGRADE_T2_HULL)."""
    out = []
    for key, o in upgrade_objs:
        t = o.read_typetree()
        q = W.obj(o.assets_file, t["gridConfig"]["m_FileID"], t["gridConfig"]["m_PathID"])
        qt = q.read_typetree()
        g = W.obj(q.assets_file, qt["gridConfiguration"]["m_FileID"], qt["gridConfiguration"]["m_PathID"])
        GRID_HINT[(id(g.assets_file), g.path_id)] = cs.enum_name("GridKey", qt["gridKey"])
        out.append((key, q, qt, g))
    return out


def upgrade_quest_grid(q, qt, g):
    """One upgrade's QuestGridConfig -> DR_UPGRADES[id].questGrid. Text fields follow the <x> text / <x>Key key rule."""
    d = export_obj(q, "QuestGridConfig")
    cond = d.get("completeConditions") or []
    other = sorted({str(c.get("_t")) for c in cond} - {"ItemCountCondition"})
    assert not other, "%s: completeConditions hold %s, only ItemCountCondition is exported" % (d["asset"], other)
    out = {
        "gridKey": d["gridKey"],
        "gridKeyId": cs.enums["GridKey"][1][d["gridKey"]],
        "gridConfiguration": d["gridConfiguration"],          # DR_GRIDS key (unique even where the asset name is shared)
        "gridConfigurationAsset": raw_name(g),
        "questGridExitMode": d["questGridExitMode"],
        "isSaved": d["isSaved"],
        "presetGridMode": d["presetGridMode"],
        "allowStorageAccess": d["allowStorageAccess"],
        "allowManualExit": d["allowManualExit"],
        "allowEquipmentInstallation": d["allowEquipmentInstallation"],
    }
    for f in ("titleString", "helpStringOverride", "exitPromptOverride"):
        if d.get(f):
            key, text = loc_pair(qt[f], "%s.%s" % (d["asset"], f))
            out[f], out[f + "Key"] = text, key
    out["presetGrid"] = {"spatialItems": [{k: s[k] for k in ("id", "x", "y", "z")} for s in d["presetGrid"]["spatialItems"]]}
    out["completeConditions"] = []
    for c in cond:
        e = {"item": c["item"], "count": c["count"]}
        if c.get("allowLinkedAberrations"):
            e["allowLinkedAberrations"] = True
        out["completeConditions"].append(e)
    return out


def attach_upgrade_quest_grids(upgrades, info, grids):
    """Hang each questGrid on its upgrade. UpgradeData.upgradeCost is a stale editor list: the game charges
    gridConfig.completeConditions (IUpgradeCost.GetItemCost, UpgradeData.cs), so upgradeCost is rebuilt from them."""
    changed = []
    for key, q, qt, g in info:
        u = upgrades[key]
        u["questGrid"] = upgrade_quest_grid(q, qt, g)
        gk, gt = u["questGrid"]["gridConfiguration"], g.read_typetree()
        assert gk in grids and (grids[gk]["columns"], grids[gk]["rows"]) == (gt["columns"], gt["rows"]), \
            "%s: DR_GRIDS[%r] is not the %dx%d delivery grid" % (key, gk, gt["columns"], gt["rows"])
        cost = [{"_t": "UpgradeCost", "itemData": c["item"], "num": c["count"]} for c in u["questGrid"]["completeConditions"]]
        if cost != u.get("upgradeCost"):
            changed.append((key, u.get("upgradeCost"), cost))
        u["upgradeCost"] = cost
    print("upgradeCost replaced by the decoded conditions: %s" % [c[0] for c in changed])
    return changed


# ---------------------------------------------------------------- scene components with Odin data
SCENE_COMPONENTS = ("ShopRestocker", "TooltipSectionGadgetDetails", "QuestGridPanel", "UpgradeGridPanel",
                    "HarvestMinigameView")
PANEL_STRINGS = ("revisitableString", "nonRevisitableString", "riskItemLossString", "exitPromptString")


def export_scene_components(world):
    """Singleton components of the Game scene whose fields the web needs. They sit in DR_WORLD.<Class>.<Class>, the shape
    HarvestTypeTagConfig and SpeakerDataLookup already use. Each class must occur exactly once."""
    found = collections.defaultdict(list)
    for b in bundles_like("gamescene_scenes"):
        for sf in W.bundle_cabs[b]:
            for o in sf.objects.values():
                if o.type.name == "MonoBehaviour":
                    c = W.cls(o)
                    if c in SCENE_COMPONENTS:
                        found[c].append((sf, o))

    def one(cls):
        assert len(found[cls]) == 1, "%s: expected one scene component, found %d" % (cls, len(found[cls]))
        sf, o = found[cls][0]
        return sf, o.read_typetree()

    def put(cls, d):
        d.update({"cls": cls, "asset": cls, "source": "Game.unity"})
        world[cls][cls] = d

    # ShopRestocker: Odin list of {shopData, gridKey} + a plain list of items that survive every restock
    sf, t = one("ShopRestocker")
    sd = t["serializationData"]
    od, refs = odin.decode(sd["SerializedBytes"]), sd["ReferencedUnityObjects"]
    cfgs = {}
    for it in od["shopDataGridConfigs"]["$items"]:
        r = refs[it["shopData"]["$unity"]]
        cfgs[ref_name(W.obj(sf, r["m_FileID"], r["m_PathID"]))] = cs.enum_name("GridKey", it["gridKey"])
    keep = [ref_name(W.obj(sf, p["m_FileID"], p["m_PathID"])) for p in t["itemsToKeepInStock"]]
    put("ShopRestocker", {"shopDataGridConfigs": cfgs, "itemsToKeepInStock": keep})

    # TooltipSectionGadgetDetails.gadgetEffectNames: Odin Dictionary<GadgetEffect, LocalizedString>
    sf, t = one("TooltipSectionGadgetDetails")
    od = odin.decode(t["serializationData"]["SerializedBytes"])
    names, keys = {}, {}
    for it in od["gadgetEffectNames"]["$items"]:
        v = it["$v"]
        ls = {"m_TableReference": {"m_TableCollectionName": v["m_TableReference"]["m_TableCollectionName"]},
              "m_TableEntryReference": {"m_KeyId": v["m_TableEntryReference"]["m_KeyId"], "m_Key": v["m_TableEntryReference"]["m_Key"]}}
        eff = cs.enum_name("GadgetEffect", it["$k"])
        keys[eff], names[eff] = loc_pair(ls, "gadgetEffectNames.%s" % eff)
    put("TooltipSectionGadgetDetails", {"gadgetEffectNames": names, "gadgetEffectKeys": keys})

    # default help/exit strings of the quest grid panels (a grid's helpStringOverride/exitPromptOverride replace them)
    for cls in ("QuestGridPanel", "UpgradeGridPanel"):
        sf, t = one(cls)
        d = {}
        for f in PANEL_STRINGS:
            key, text = loc_pair(t[f], "%s.%s" % (cls, f))
            d[f], d[f + "Key"] = text, key
        put(cls, d)

    # the storage tray appears once this quest is done (HarvestMinigameView.cs:348)
    sf, t = one("HarvestMinigameView")
    p = t["storageTrayUnlockQuest"]
    put("HarvestMinigameView", {"storageTrayUnlockQuest": ref_name(W.obj(sf, p["m_FileID"], p["m_PathID"]))})


# ---------------------------------------------------------------- strings the audits ask for
STR_CHECK = (
    # gear.md 3(8)
    "notification.crab-pot-deployed", "notification.deploy-pot.none-with-durability", "tooltip.deployable.durability-value",
    "equipment-status.damaged", "equipment-status.operational", "prompt.radial-show", "prompt.action",
    # shop-upgrade.md 3(5)
    "title.shipwright-rods", "title.shipwright-engines", "title.shipwright-nets", "title.shipwright-lights",
    "title.travelling-merchant-rods", "title.travelling-merchant-engines", "title.travelling-merchant-pots",
    "title.travelling-merchant-nets", "title.travelling-merchant-lights", "title.travelling-merchant-materials",
    "upgrades.header.description", "button.purchase-upgrade", "quest-grid.exit-help.upgrades",
    "notification.upgrade-hull-damaged", "notification.upgrade.items-in-overflow", "prompt.refund", "prompt.buy",
    "prompt.sell", "prompt.sell-all-trinkets", "notification.sell-trinkets-bulk", "prompt.exit-repair-mode",
    "prompt.repair", "prompt.uninstall")
STR_CHECK_IDS = (128994277756948480, 128994359080308736, 128994513543942144, 167737034407071744, 124206426037080064,
                 124653352582828032, 124210017581846528)
# literal prompt names in the C# code (AbilityBarUI.cs:53, AbilityRadial.cs:109) that no string table holds
STR_NOT_IN_GAME = ("prompt.radial-show", "prompt.action")


def check_strings(strings):
    """Every key and KeyId the round 2 audits name must exist in DR_STR. A KeyId whose text exists without a key name
    would be added as keyid.<id> (nothing needs it today). Returns the keys that are missing from the game itself."""
    added, lost = [], []
    for i in STR_CHECK_IDS:
        hits = [(g, tx[i]) for g, tx in loc.text.items() if i in tx]
        if not hits:
            lost.append(i)
        for g, text in hits:
            key = loc.shared[g].get(i)
            if key is None:                      # text without a key name: expose it by id
                strings["keyid.%d" % i] = text
                added.append(i)
            elif key not in strings:             # key lives in the Yarn table, so it is not in DR_STR
                lost.append(i)
    missing = [k for k in STR_CHECK if k not in strings]
    unexpected = [k for k in missing if k not in STR_NOT_IN_GAME]
    print("strings checked: %d keys + %d KeyIds; added by KeyId: %s; KeyIds not in DR_STR: %s; keys in no table: %s"
          % (len(STR_CHECK), len(STR_CHECK_IDS), added, lost, missing))
    assert not unexpected and not lost, "DR_STR lacks keys %s / KeyIds %s" % (unexpected, lost)
    return missing


def main():
    loc.load()
    W.load_all()
    W.load_player_files()
    strings, dialogue = {}, {}
    for tn, tab in loc.tables.items():
        (dialogue if tn == "Yarn" else strings).update(tab)
    check_strings(strings)
    STRINGS.update(strings)
    write_js("strings.js", "DR_STR", strings)
    write_js("strings-dialogue.js", "DR_STR_DIALOGUE", dialogue)

    items, grids = {}, {}
    quests = collections.defaultdict(dict)
    groups = collections.defaultdict(dict)
    upgrade_objs = []
    grid_idents = set()     # (id(assets_file), path_id) of the GridConfigurations already in grids
    for prefix in ("itemdata", "upgradedata", "gridconfigs", "weatherdata", "mapmarkerdata", "questdata",
                   "questgriddata", "worldeventdata", "achievementdata", "bundledprefab", "gamemetadata", "highlightdata"):
        for path, cls, o in collect(prefix):
            if "ItemData" in cs.chain(cls):
                t = o.read_typetree()
                CURRENT["item"] = t.get("id") or t["m_Name"]
                d = export_obj(o, cls)
                CURRENT["item"] = None
                d = split_loc_fields(shape_item(d, cls), t)
                items[key_of(d, items)] = d
                continue
            d = export_obj(o, cls)
            if cls == "GridConfiguration":
                grids[key_of(d, grids)] = d
                grid_idents.add((id(o.assets_file), o.path_id))
            elif cls.startswith("Quest"):
                quests[cls][key_of(d, quests[cls])] = d
            elif cls in ("HullUpgradeData", "SlotUpgradeData"):
                d["cls"] = cls
                k = key_of(d, groups["upgrades"])
                groups["upgrades"][k] = d
                upgrade_objs.append((k, o))
            elif cls == "WeatherData":
                groups["weather"][d["asset"]] = d
            elif cls == "MapMarkerData":
                groups["mapmarkers"][d["asset"]] = d
            elif cls == "WorldEventData":
                groups["worldevents"][d["asset"]] = d
            elif prefix in ("achievementdata", "bundledprefab", "gamemetadata", "highlightdata"):
                groups["misc"].setdefault(cls, {})[d["asset"]] = d
            else:
                print("unhandled", prefix, cls, path)

    # sharedassets0.assets: assets that only exist in the player build (not Addressables)
    extra = collections.defaultdict(list)
    for o in W.player_sf.objects.values():
        if o.type.name == "MonoBehaviour":
            extra[W.cls(o)].append(o)
    added = {"items": [], "grids": []}
    for c, objs in extra.items():
        if "ItemData" in cs.chain(c):
            continue  # sharedassets0 only holds copies of items already in itemdata (typetrees fail there)
        elif c == "GridConfiguration":
            for o in objs:
                d = export_obj(o, c)
                k = key_of(d, grids)
                if k not in grids:
                    grids[k] = d
                    grid_idents.add((id(o.assets_file), o.path_id))
                    added["grids"].append(k)
    print("player-build extras added:", {k: len(v) for k, v in added.items()})
    assert not LOC_BAD, "item keys that do not resolve in DR_STR: %s" % LOC_BAD

    # GridConfiguration sub-assets, then the upgrade QuestGridConfigs that point at them (grids first: the questGrid
    # stores the DR_GRIDS key, and DR_CONFIG.gridConfigs below needs the registry to tell Tier2Hull 5x6 from 7x10)
    upgrade_info = upgrade_grid_objects(upgrade_objs)
    sweep_grids(grids, grid_idents)
    attach_upgrade_quest_grids(groups["upgrades"], upgrade_info, grids)

    INLINE.update({"HarvestDifficultyConfigData", "SaveDataTemplate"})
    cfg = None
    for o in extra["GameConfigData"]:
        if o.read_typetree()["m_Name"].endswith("Prod"):
            cfg = export_obj(o, "GameConfigData")
    cfg["gridKeyIds"] = dict(cs.enums["GridKey"][1])
    cfg["wave"] = export_wave()
    cfg["difficulties"] = {}
    for o in extra["HarvestDifficultyConfigData"]:
        d = export_obj(o, "HarvestDifficultyConfigData")
        cfg["difficulties"][d["asset"]] = d
    INLINE.clear()
    write_js("config.js", "DR_CONFIG", cfg)

    for c, o in scan_scriptable({"QuestStepData"})["QuestStepData"]:
        d = export_obj(o, c)
        quests["QuestStepData"][key_of(d, quests["QuestStepData"])] = d
    write_js("quests.js", "DR_QUESTS", quests)

    world = collections.defaultdict(dict)
    for base, lst in scan_scriptable(WORLD_CLASSES | {"RecipeData"}).items():
        for c, o in lst:
            d = export_obj(o, c)
            d["cls"] = c
            key = (d.get("recipeId") if base == "RecipeData" else None) or d.get("id") or d["asset"]
            if key in world[base] and world[base][key] != d:
                key = "%s#%s" % (key, c)
            world[base][key] = d
    export_scene_components(world)
    assert not LOC_BAD, "keys that do not resolve in DR_STR: %s" % LOC_BAD
    write_js("world_data.js", "DR_WORLD", world)

    write_js("items.js", "DR_ITEMS", items)
    write_js("grids.js", "DR_GRIDS", grids)
    write_js("upgrades.js", "DR_UPGRADES", groups["upgrades"])
    write_js("weather.js", "DR_WEATHER", groups["weather"])
    write_js("mapmarkers.js", "DR_MAPMARKERS", groups["mapmarkers"])
    write_js("worldevents.js", "DR_WORLDEVENTS", groups["worldevents"])
    write_js("misc.js", "DR_MISC", groups["misc"])
    export_ui()
    print("odin", stats, "unresolved", dict(W.unresolved.most_common(8)))
    print("art bytes", art.bytes)


if __name__ == "__main__":
    main()
