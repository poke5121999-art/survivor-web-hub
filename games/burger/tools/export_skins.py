"""Export the customer skins the original swaps in at spawn (CustomerNormal/CustomerVIP._customerSkin[zone]._skinDatas:
a skinned mesh + its materials, drawn by the prefab's _skinRenderer with the renderer's own bones).

Usage: python -I tools/export_skins.py        (after export_store.py ... pool)
Writes art/pool/skins.glb (glTF mesh i = skins.json meshes[i]) and art/pool/skins.json:
  {"meshes": [{name, subs, verts, bind}], "materials": [...], "textures": [...],
   "sets": {"<prefab node>": [[{"m": mesh, "mt": [materials]} ...] per zone]}}
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mm  # noqa: E402
from export_store import GLB, read_mesh, material_entry, save_texture, GAME, log  # noqa: E402


def main():
    mm.load()
    scene = json.load(open(os.path.join(GAME, "art", "pool", "scene.json"), encoding="utf-8"))
    texdir = os.path.join(GAME, "art", "tex")
    glb, meshes, mesh_index, materials, mat_index, textures, tex_index = GLB(), [], {}, [], {}, [], {}

    def obj(p):
        return mm.by_file(p["f"])[p["id"]]

    def tex_ref(pptr):
        t = pptr.read()
        if not hasattr(t, "image"):
            return None
        key = (t.object_reader.assets_file.name, t.object_reader.path_id)
        if key not in tex_index:
            name, im = save_texture(t, texdir)
            textures.append({"name": name, "size": list(im.size), "alpha": im.mode == "RGBA"})
            tex_index[key] = len(textures) - 1
        return tex_index[key]

    def mesh_ref(p):
        key = (p["f"], p["id"])
        if key not in mesh_index:
            mo = obj(p).read()
            m = read_mesh(mo, skinned=True)
            glb.mesh(mo.m_Name, m)
            meshes.append({"name": mo.m_Name, "subs": len(m["subs"]), "verts": len(m["pos"]), "bind": m.get("bind")})
            mesh_index[key] = len(meshes) - 1
        return mesh_index[key]

    def mat_ref(p):
        key = (p["f"], p["id"])
        if key not in mat_index:
            materials.append(material_entry(obj(p).read(), tex_ref))
            mat_index[key] = len(materials) - 1
        return mat_index[key]

    sets = {}
    for i, n in enumerate(scene["nodes"]):
        k = n.get("k", {})
        comp = k.get("CustomerNormal") or k.get("CustomerVIP")
        if not comp or "_customerSkin" not in comp:
            continue
        zones = []
        for z in comp["_customerSkin"]:
            zones.append([{"m": mesh_ref(sd["_skinMesh"]), "mt": [mat_ref(m) for m in sd["_skinMaterials"]]} for sd in z["_skinDatas"]])
        sets[str(i)] = {"renderer": comp["_skinRenderer"]["n"], "zones": zones}
        log(f"{n['n']}: {[len(z) for z in zones]} skins per zone")
    out = os.path.join(GAME, "art", "pool")
    glb.write(os.path.join(out, "skins.glb"))
    with open(os.path.join(out, "skins.json"), "w", encoding="utf-8") as f:
        json.dump({"meshes": meshes, "materials": materials, "textures": textures, "sets": sets}, f, separators=(",", ":"))
    log(f"skins: meshes {len(meshes)}, materials {len(materials)}, textures {len(textures)}, "
        f"skins.glb {os.path.getsize(os.path.join(out, 'skins.glb')) // 1024} KB")


if __name__ == "__main__":
    main()
