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
         "flattenParticleShape", "tooltipTextColor", "tooltipNotesColor"}


INLINE = set()   # classes expanded in place instead of referenced by name (set per export)
_stack = set()


def raw_name(o):
    """m_Name of a MonoBehaviour straight from its bytes (right after m_Script), for assets whose typetree fails."""
    raw = bytes(o.get_raw_data())
    n = struct.unpack_from("<i", raw, 28)[0]
    return raw[32:32 + n].decode("utf-8", "replace") if 0 <= n < 200 else "?"


def ref_name(o):
    """Stable string for a referenced object: id of an ItemData-like asset, else asset name."""
    if o.type.name == "MonoBehaviour":
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
            return None
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


def main():
    loc.load()
    W.load_all()
    W.load_player_files()
    strings, dialogue = {}, {}
    for tn, tab in loc.tables.items():
        (dialogue if tn == "Yarn" else strings).update(tab)
    write_js("strings.js", "DR_STR", strings)
    write_js("strings-dialogue.js", "DR_STR_DIALOGUE", dialogue)

    items, grids = {}, {}
    quests = collections.defaultdict(dict)
    groups = collections.defaultdict(dict)
    for prefix in ("itemdata", "upgradedata", "gridconfigs", "weatherdata", "mapmarkerdata", "questdata",
                   "questgriddata", "worldeventdata", "achievementdata", "bundledprefab", "gamemetadata", "highlightdata"):
        for path, cls, o in collect(prefix):
            if "ItemData" in cs.chain(cls):
                t = o.read_typetree()
                CURRENT["item"] = t.get("id") or t["m_Name"]
                d = export_obj(o, cls)
                CURRENT["item"] = None
                d = shape_item(d, cls)
                items[key_of(d, items)] = d
                continue
            d = export_obj(o, cls)
            if cls == "GridConfiguration":
                grids[key_of(d, grids)] = d
            elif cls.startswith("Quest"):
                quests[cls][key_of(d, quests[cls])] = d
            elif cls in ("HullUpgradeData", "SlotUpgradeData"):
                d["cls"] = cls
                groups["upgrades"][key_of(d, groups["upgrades"])] = d
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
                    added["grids"].append(k)
    print("player-build extras added:", {k: len(v) for k, v in added.items()})

    INLINE.update({"HarvestDifficultyConfigData", "SaveDataTemplate"})
    cfg = None
    for o in extra["GameConfigData"]:
        if o.read_typetree()["m_Name"].endswith("Prod"):
            cfg = export_obj(o, "GameConfigData")
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
