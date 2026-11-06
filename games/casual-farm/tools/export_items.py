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


def export_box(glb, first_mesh, objs, tex_ref):
    """The checkout box (MatCustomer.boxPrefab, BoxController; rules/checkout-anim.md): the open box (openBoxObj, a
    skinned mesh kept in its bind pose), the sealed box (closedBoxObj) and the four item slots, all relative to the
    prefab root. Returns {"open": {mesh, material, matrix}, "sealed": {...}, "slots": [[x, y, z]], "packingRate"}."""
    import numpy as np
    cust = None
    for o in objs.values():
        if o.type.name == "MonoBehaviour" and mm.script(o)[1] == "MatCustomer":
            cust = o.read_typetree(nodes=mm.mb_node(*mm.script(o)))
            src = o
            break
    if not cust:
        log("box: no MatCustomer")
        return None
    ref = cust["boxPrefab"]
    fname = mm.ext_names(src.assets_file)[ref["m_FileID"] - 1] if ref["m_FileID"] else src.assets_file.name
    po = mm.by_file(fname)
    bc_obj = po[ref["m_PathID"]]
    bc = bc_obj.read_typetree(nodes=mm.mb_node(*mm.script(bc_obj)))

    def go_of(comp_ptr):
        return po[comp_ptr["m_PathID"]].read()

    def transform_of(go):
        for c in go.m_Components:
            if c.type.name == "Transform":
                return c.read()
        return None

    root_tr = transform_of(go_of(bc["m_GameObject"]))

    def matrix_to_root(tr):
        """Local -> prefab root, in the mirrored (z-flipped) space read_mesh uses."""
        M = np.eye(4)
        while tr is not None and tr.m_GameObject.m_PathID != root_tr.m_GameObject.m_PathID:
            p, q, s = tr.m_LocalPosition, tr.m_LocalRotation, tr.m_LocalScale
            # Mirror z: position z, quaternion x and y flip sign.
            x, y, z, w = -q.x, -q.y, q.z, q.w
            R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                          [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                          [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
            L = np.eye(4)
            L[:3, :3] = R @ np.diag([s.x, s.y, s.z])
            L[:3, 3] = [p.x, p.y, -p.z]
            M = L @ M
            tr = tr.m_Father.read() if tr.m_Father.m_PathID else None
        return M

    out, k = {}, first_mesh
    for key, field in (("open", "openBoxObj"), ("sealed", "closedBoxObj")):
        go = go_of(bc[field])
        mesh = mat = None
        node_tr = transform_of(go)
        stack = [go]
        while stack and mesh is None:
            g = stack.pop()
            for c in g.m_Components:
                if c.type.name == "SkinnedMeshRenderer":
                    r = c.read()
                    mesh, mat, node_tr = r.m_Mesh.read(), r.m_Materials[0].read(), transform_of(g)
                elif c.type.name == "MeshFilter":
                    mesh, node_tr = c.read().m_Mesh.read(), transform_of(g)
                elif c.type.name == "MeshRenderer":
                    mat = c.read().m_Materials[0].read()
            if mesh is None:
                stack.extend(ch.read().m_GameObject.read() for ch in transform_of(g).m_Children)
        if mesh is None:
            log(f"box: no mesh under {field}")
            continue
        glb.mesh(f"Box_{key}", read_mesh(mesh))
        out[key] = {"mesh": k, "material": material_entry(mat, tex_ref) if mat else None,
                    "matrix": [round(float(v), 6) for v in matrix_to_root(node_tr).T.reshape(-1)]}
        k += 1
    slots = []
    for s in bc["slotInputList"]:
        t = transform_of(go_of(po[s["m_PathID"]].read_typetree()["m_GameObject"]))
        m = matrix_to_root(t)
        slots.append([round(float(v), 4) for v in m[:3, 3]])
    if not slots:
        # slotInputList does not read back through the generated type tree; InputSlots (2..5) of PackagingBox
        # (checkout-anim.md section 1), Unity (+-0.35, 0.85, +-0.75) in hierarchy order, z mirrored.
        slots = [[-0.35, 0.85, 0.75], [-0.35, 0.85, -0.75], [0.35, 0.85, 0.75], [0.35, 0.85, -0.75]]
    out["slots"] = slots
    out["packingRate"] = bc["packingRate"]
    log(f"box: {', '.join(k for k in out if k in ('open', 'sealed'))}, {len(slots)} slots, packingRate {bc['packingRate']}")
    return out


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

    box = export_box(glb, len(glb.j["meshes"]), objs, tex_ref)

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
        json.dump({"height": height, "material": material, "textures": sorted(set(textures)), "types": types, "box": box}, fh,
                  ensure_ascii=False, indent=1)
    log(f"items: {len(types)} types, {len(mesh_index)} meshes, height {height}, "
        f"items.glb {os.path.getsize(os.path.join(out, 'items.glb')) // 1024} KB")


if __name__ == "__main__":
    main()
