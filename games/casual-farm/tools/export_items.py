"""Export the carryable item models (MyObjectManager in a store scene) for the three.js build.

Usage: py -3.12 export_items.py [levelN]      (default level1)

Writes games/casual-farm/art/items/
  items.glb    one glTF mesh per item type, mesh name = MyObjectType name
  items.json   {"height": stack step, "material": scene.json-style material, "types": {"<id>": {name, price, quota, mesh}}}
Item meshes come from MyObject.objectMesh; the shared prefab is MyObjectManager.inputItemPrefab (Input_Item:
MyObjectController.objectHeight is the stack step). Cash (type 11) uses the thiefObjectCash prefab's child mesh.
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mm  # noqa: E402
from export_store import GLB, read_mesh, material_entry, log, save_texture  # noqa: E402

GAME = os.path.dirname(HERE)


def enum_names():
    dump = open(os.path.join(mm.REF, "il2cpp-dump", "dump.cs"), encoding="utf-8").read()
    body = re.search(r"public enum MyObjectType\b[^{]*\{(.*?)\n\}", dump, re.S).group(1)
    return {int(v): k for k, v in re.findall(r"public const MyObjectType (\w+) = (-?\d+);", body)}


def main():
    level = sys.argv[1] if len(sys.argv) > 1 else "level1"
    out = os.path.join(GAME, "art", "items")
    os.makedirs(out, exist_ok=True)
    names = enum_names()
    objs = mm.by_file(level)
    env = mm.load()
    glb = GLB()
    types, mesh_index = {}, {}
    manager = None
    addressable = {}
    for o in env.objects:
        if o.type.name == "Mesh" and o.assets_file.name.startswith("CAB-"):
            addressable.setdefault(o.read_typetree()["m_Name"], o)
    for pid, o in objs.items():
        if o.type.name != "MonoBehaviour":
            continue
        cls = mm.script(o)[1]
        if cls == "MyObjectManager":
            manager = o.read_typetree(nodes=mm.mb_node(*mm.script(o)))
        if cls != "MyObject":
            continue
        d = o.read_typetree(nodes=mm.mb_node(*mm.script(o)))
        t = d["objectType"]
        if str(t) in types:
            continue
        entry = {"name": names.get(t, f"type{t}"), "price": d["rewardPrize"], "quota": d["demandQuota"], "unused": d["unused"]}
        mp = d["objectMesh"]
        sub = (d.get("objectMeshAddressable") or {}).get("m_SubObjectName")
        if not mp["m_PathID"] and sub in addressable:
            key = ("addressable", sub)
            if key not in mesh_index:
                glb.mesh(entry["name"], read_mesh(addressable[sub].read()))
                mesh_index[key] = len(mesh_index)
            entry["mesh"] = mesh_index[key]
        elif mp["m_PathID"]:
            mo = o.assets_file.externals[mp["m_FileID"] - 1].path.split("/")[-1] if mp["m_FileID"] else level
            key = (mo, mp["m_PathID"])
            if key not in mesh_index:
                mesh_obj = mm.by_file(mo)[mp["m_PathID"]].read()
                glb.mesh(entry["name"], read_mesh(mesh_obj))
                mesh_index[key] = len(mesh_index)
            entry["mesh"] = mesh_index[key]
        types[str(t)] = entry

    textures = []

    def tex_ref(pptr):
        name, _ = save_texture(pptr.read(), os.path.join(GAME, "art", "tex"))
        textures.append(name)
        return name

    def prefab_part(ref):
        """(MeshFilter mesh, material) of a prefab's MyObjectController, or of its first child that has a mesh."""
        ext = mm.ext_names(next(iter(objs.values())).assets_file)
        f = ext[ref["m_FileID"] - 1]
        po = mm.by_file(f)
        comp = mm.read(po[ref["m_PathID"]])
        return comp, po, f

    comp, po, f = prefab_part(manager["inputItemPrefab"])
    height = comp["objectHeight"]
    mr = po[comp["mesh_renderer"]["m_PathID"]].read()
    material = material_entry(mr.m_Materials[0].read(), tex_ref)

    cash, po2, _ = prefab_part(manager["thiefObjectCash"])
    mf = po2[cash["mesh_filter"]["m_PathID"]].read()
    if mf.m_Mesh.m_PathID:
        glb.mesh("Coin", read_mesh(mf.m_Mesh.read()))
        types.setdefault("11", {"name": names.get(11, "Coin"), "price": 1, "quota": 0, "unused": 1})["mesh"] = len(mesh_index)
        cmr = po2[cash["mesh_renderer"]["m_PathID"]].read()
        types["11"]["material"] = material_entry(cmr.m_Materials[0].read(), tex_ref)

    # Demand-bubble and shelf icons: Sprite "<lowerCamelName>Icon" (resources.assets or the addressable group).
    sprites = {}
    for o in env.objects:
        if o.type.name == "Sprite" and (o.assets_file.name == "resources.assets" or o.assets_file.name.startswith("CAB-")):
            nm = o.read_typetree()["m_Name"]
            if nm.endswith("Icon") and (nm not in sprites or o.assets_file.name == "resources.assets"):
                sprites[nm] = o
    os.makedirs(os.path.join(out, "icons"), exist_ok=True)
    icons = 0
    for k, t in types.items():
        nm = t["name"][0].lower() + t["name"][1:] + "Icon"
        if nm in sprites:
            sprites[nm].read().image.save(os.path.join(out, "icons", f"{k}.webp"), "WEBP", lossless=True)
            t["icon"] = f"icons/{k}.webp"
            icons += 1
    log(f"icons: {icons}")

    glb.write(os.path.join(out, "items.glb"))
    with open(os.path.join(out, "items.json"), "w", encoding="utf-8") as fh:
        json.dump({"height": height, "material": material, "textures": sorted(set(textures)), "types": types}, fh,
                  ensure_ascii=False, indent=1)
    log(f"items: {len(types)} types, {len(mesh_index)} meshes, height {height}, "
        f"items.glb {os.path.getsize(os.path.join(out, 'items.glb')) // 1024} KB")


if __name__ == "__main__":
    main()
