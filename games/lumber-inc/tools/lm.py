"""Shared loader for Lumber Inc 0.6.5 (com.seikami.lumber.inc), extracted at D:/lumber-ref.

load()           UnityPy environment over data.unity3d, unity default resources and every Addressables bundle.
read(obj)        typetree dict of any object; MonoBehaviours go through the IL2CPP-generated tree (see mb_node).
script(obj)      (assembly, full class name) of a MonoBehaviour.
bundle_files(p)  serialized-file names (CAB-...) of the bundles whose name starts with p, e.g. "world-1_".
"""
import os
import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
from UnityPy.helpers.TypeTreeNode import TypeTreeNode

REF = os.environ.get("LUMBER_REF", "D:/lumber-ref")
DATA = REF + "/apk/base/assets/bin/Data"
AA = REF + "/apk/base/assets/aa/Android"
CONFIG = REF + "/apk/base/assets/config"
UNITY = "2022.3.62f2"
_env = None
_gen = None
_nodes = {}
_scripts = {}
_bundle_of = {}


def load():
    global _env, _gen
    if _env is None:
        paths = [DATA + "/data.unity3d", DATA + "/unity default resources"]
        paths += [os.path.join(AA, f) for f in sorted(os.listdir(AA))]
        _env = UnityPy.load(*paths)
        _gen = TypeTreeGenerator(UNITY)
        _gen.load_local_dll_folder(REF + "/il2cpp-dump/DummyDll")
        _env.typetree_generator = _gen
        for o in _env.objects:
            if o.type.name == "MonoScript":
                d = o.read_typetree()
                _scripts[(o.assets_file.name, o.path_id)] = (
                    d["m_AssemblyName"], (d["m_Namespace"] + "." if d["m_Namespace"] else "") + d["m_ClassName"])
        for path, f in _env.files.items():
            for name in getattr(f, "files", {}) or {}:
                _bundle_of[name] = os.path.basename(path)
    return _env


def mb_node(assembly, fullname):
    # TypeTreeGeneratorAPI puts m_Enabled's align flag on m_GameObject, so every later field reads 3 bytes early
    # (My Mini Mart trap, casual-farm README). The flag must be set before from_list.
    key = (assembly, fullname)
    if key not in _nodes:
        base = _gen.get_nodes(assembly if assembly.endswith(".dll") else assembly + ".dll", fullname)
        _nodes[key] = TypeTreeNode.from_list([TypeTreeNode(
            b.m_Level, b.m_Type, b.m_Name, 0, 0,
            m_MetaFlag=(b.m_MetaFlag or 0) | (0x4000 if b.m_Level == 1 and b.m_Name == "m_Enabled" else 0)) for b in base])
    return _nodes[key]


def ext_names(sf):
    return [e.path.split("/")[-1] for e in sf.externals]


def script(obj):
    raw = obj.get_raw_data()
    fid, pid = int.from_bytes(raw[16:20], "little"), int.from_bytes(raw[20:28], "little", signed=True)
    sf = obj.assets_file
    name = sf.name if fid == 0 else ext_names(sf)[fid - 1]
    return _scripts.get((name, pid), (None, f"?{name}:{pid}"))


def read(obj):
    if obj.type.name == "MonoBehaviour":
        asm, cls = script(obj)
        if not asm:
            raise ValueError(f"no MonoScript for {cls}")
        return obj.read_typetree(nodes=mb_node(asm, cls))
    return obj.read_typetree()


def by_file(name):
    return {o.path_id: o for o in load().objects if o.assets_file.name == name}


def bundle_files(prefix):
    load()
    return sorted({o.assets_file.name for o in _env.objects
                   if _bundle_of.get(o.assets_file.name, "").startswith(prefix)})


def config(name):
    """Rows of config/<name>.txt (tab separated: Chinese header, types, field names, then data) as dicts."""
    with open(os.path.join(CONFIG, name + ".txt"), encoding="utf-8-sig") as fh:
        lines = [l.rstrip("\r\n") for l in fh if l.strip()]
    types, keys = lines[1].split("\t"), lines[2].split("\t")
    conv = {"int": int, "float": float, "bool": lambda s: s.lower() in ("1", "true")}
    rows = []
    for l in lines[3:]:
        cells = l.split("\t")
        row = {}
        for k, t, v in zip(keys, types, cells + [""] * (len(keys) - len(cells))):
            if not k:
                continue
            try:
                row[k] = conv.get(t, str)(v) if v != "" else (None if t in conv else "")
            except ValueError:
                row[k] = v
        rows.append(row)
    return rows


_container = None


def asset(path):
    """(serialized file, path id) of the main object an AssetBundle lists under this asset path (lower-case match)."""
    global _container
    if _container is None:
        _container = {}
        for o in load().objects:
            if o.type.name == "AssetBundle":
                d = o.read_typetree()
                for p, info in d["m_Container"]:
                    _container.setdefault(p.lower(), (o.assets_file.name, info["asset"]["m_PathID"]))
    return _container.get(path.lower())
