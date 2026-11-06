"""Shared loader for My Mini Mart 1.89.5 data. Source tree: $MM_REF (default D:/minimart-ref), see README.

load()           UnityPy environment over the base APK data + UnityDataAssetPack, with a type tree generator.
read(obj)        typetree dict of any object; MonoBehaviours go through the IL2CPP-generated tree (see mb_node).
script(obj)      (assembly, full class name) of a MonoBehaviour.
clean(v, ext)    JSON-friendly copy: PPtr -> {"f": file, "id": path id} or None, floats rounded.
"""
import os
import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
from UnityPy.helpers.TypeTreeNode import TypeTreeNode

REF = os.environ.get("MM_REF", "D:/minimart-ref")
DATA = [os.path.join(REF, p) for p in ("com.KisekiGames.smart/assets/bin/Data/data.unity3d", "UnityDataAssetPack/assets/bin/Data/datapack.unity3d",
                                       "com.KisekiGames.smart/assets/bin/Data/Resources/unity default resources",
                                       "UnityDataAssetPack/assets/aa/Android/defaultlocalgroup_assets_all_926c4ae76da8857efb97404a90513c4c.bundle",
                                       # MonoScripts of the addressable prefabs (menus spawned from CanvasManager)
                                       "UnityDataAssetPack/assets/aa/Android/19966a5ac228b87df6e9aa722bceb29b_monoscripts_82f4764c979b36838b75fa5821a01fe0.bundle")]
_env = None
_gen = None
_nodes = {}
_scripts = {}


def load():
    global _env, _gen
    if _env is None:
        _env = UnityPy.load(*DATA)
        _gen = TypeTreeGenerator("6000.0.59f2")
        _gen.load_local_dll_folder(os.path.join(REF, "il2cpp-dump/DummyDll"))
        _env.typetree_generator = _gen
        for o in _env.objects:
            if o.type.name == "MonoScript":
                d = o.read_typetree()
                _scripts[(o.assets_file.name, o.path_id)] = (
                    d["m_AssemblyName"], (d["m_Namespace"] + "." if d["m_Namespace"] else "") + d["m_ClassName"])
    return _env


def mb_node(assembly, fullname):
    # TypeTreeGeneratorAPI 0.0.10 puts m_Enabled's align flag on m_GameObject, so every field after it reads 3 bytes
    # early (m_Script came out as FileID 1<<24). The flag must be set before from_list; patching the built tree is ignored.
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


def clean(v, ext):
    if isinstance(v, dict):
        if set(v.keys()) == {"m_FileID", "m_PathID"}:
            if v["m_PathID"] == 0:
                return None
            fid = v["m_FileID"]
            return {"f": "" if fid == 0 else ext[fid - 1], "id": v["m_PathID"]}
        return {k: clean(x, ext) for k, x in v.items()}
    if isinstance(v, list):
        return [clean(x, ext) for x in v]
    if isinstance(v, float):
        return round(v, 5)
    if isinstance(v, (bytes, bytearray)):
        return f"<{len(v)} bytes>"
    return v


def by_file(name):
    return {o.path_id: o for o in load().objects if o.assets_file.name == name}
