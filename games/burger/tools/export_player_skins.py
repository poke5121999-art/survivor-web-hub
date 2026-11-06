"""Player outfits of the skin room: SkinManager.skinData (level1), one entry per skin index: a skinned cloth mesh drawn by
the player's own SkinnedMeshRenderer (same bones, PlayerSkin._playerMeshRenderer), its material(s), and an optional hat
mesh for the hat MeshFilter (PlayerSkin._playerHatMeshFilter).

Usage: python -I tools/export_player_skins.py
Writes art/pool/playerskins.glb and art/pool/playerskins.json:
  {"meshes": [{name, subs, verts, bind?}], "materials": [...], "textures": [...],
   "skins": [{"cloth": {"m", "mt"}, "hat": {"m", "mt"} | null}],            (index = SkinManager skin index)
   "rows": [Skin_30 rows: id, grade, cost_type, cost_value, cost_stage, vip, battle_path, abilities, unlock abilities],
   "thumbs": [file per skin index | null]}                                   (SkinManager.spriteSkinThumbs)
"""
import glob, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mm  # noqa: E402
from export_store import GLB, read_mesh, material_entry, save_texture, GAME, log  # noqa: E402

REF = os.environ.get("BP_REF", "/run/media/bui-thanh-thuong/C0E02AC6E02AC310/burger-ref")


def main():
    mm.load()
    lvl = mm.by_file("level1")
    sm = next(o for o in lvl.values() if o.type.name == "MonoBehaviour" and mm.script(o)[1] == "SkinManager")
    d = mm.clean(mm.read(sm), mm.ext_names(sm.assets_file))
    texdir = os.path.join(GAME, "art", "tex")
    glb, meshes, mesh_index, materials, mat_index, textures, tex_index = GLB(), [], {}, [], {}, [], {}

    def obj(p):
        return mm.by_file(p["f"] or "level1")[p["id"]]

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

    def mesh_ref(p, skinned):
        key = (p["f"], p["id"])
        if key not in mesh_index:
            mo = obj(p).read()
            m = read_mesh(mo, skinned=skinned)
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

    skins = []
    for sd in d["skinData"]:
        cloth = {"m": mesh_ref(sd["clothMesh"], True), "mt": [mat_ref(p) for p in (sd["clothMaterial"], sd["clothMaterial2"]) if p]} if sd["clothMesh"] else None
        hat = {"m": mesh_ref(sd["hatMesh"], False), "mt": [mat_ref(sd["hatMaterial"])] if sd["hatMaterial"] else []} if sd["hatMesh"] else None
        skins.append({"cloth": cloth, "hat": hat})
    # Thumbnails: SpriteGroup spriteSkinThumbs (sprites by skin index).
    out = os.path.join(GAME, "art", "pool")
    thumbs = []
    # spriteSkinThumbs points at the Supercent.SpriteGroup on the same GameObject; its "asset" list is by skin index.
    go = sm.read().m_GameObject.read()
    group = next(c.component.deref() for c in go.m_Component
                 if c.component.deref().type.name == "MonoBehaviour" and mm.script(c.component.deref())[1] == "Supercent.SpriteGroup")
    sprites = mm.clean(mm.read(group), mm.ext_names(group.assets_file))["asset"]
    os.makedirs(os.path.join(GAME, "art", "ui"), exist_ok=True)
    for k, p in enumerate(sprites):
        if not p:
            thumbs.append(None)
            continue
        sp = obj(p).read()
        fn = f"skin_{k:02d}.png"
        sp.image.save(os.path.join(GAME, "art", "ui", fn))
        thumbs.append(fn)
    rows = json.load(open(glob.glob(os.path.join(REF, "out", "text", "Skin_30__*.txt"))[0], encoding="utf-8"))[1:]
    num = lambda v: float(v) if "." in str(v) else int(v)
    keep = ["id", "grade", "cost_type", "cost_value", "cost_stage", "cost_rv", "vip", "battle_path", "eating_challenge", "renovation"]
    rows = [{**{k: (r[k] == "TRUE" if r[k] in ("TRUE", "FALSE") else num(r[k])) for k in keep},
             "ab": [[int(r[f"ability_type_0{j}"]), float(r[f"ability_value_0{j}"])] for j in (1, 2, 3) if int(r[f"ability_type_0{j}"])],
             "unlock": [[int(r[f"unlock_ability_type_0{j}"]), float(r[f"unlock_ability_value_0{j}"])] for j in (1, 2, 3) if int(r[f"unlock_ability_type_0{j}"])]}
            for r in rows]
    glb.write(os.path.join(out, "playerskins.glb"))
    with open(os.path.join(out, "playerskins.json"), "w", encoding="utf-8") as f:
        json.dump({"meshes": meshes, "materials": materials, "textures": textures, "skins": skins, "rows": rows, "thumbs": thumbs},
                  f, separators=(",", ":"))
    log(f"player skins {len(skins)}, meshes {len(meshes)}, materials {len(materials)}, thumbs {sum(1 for t in thumbs if t)}, "
        f"playerskins.glb {os.path.getsize(os.path.join(out, 'playerskins.glb')) // 1024} KB")


if __name__ == "__main__":
    main()
