"""Export the player cosmetics (rules/census-cosmetics.md): skins, outfits, hats and pets of the customise shop.

Usage (from this folder): PYTHONIOENCODING=utf-8 py -3.12 export_cosmetics.py

Reads the four managers' controllers from art/store1/scene.json (export_store.py already keeps their fields; a row whose
GameObject is inactive is not in the shop, GetComponentsInChildren skips it) and writes games/casual-farm/art/cosmetics/
  cosmetics.json  {skins, outfits, hats, pets: [{id, name, mesh, icon, cost: {type, price, ads}, ...}], meshes, materials}
                  id = the *NameForPreference enum (what the original saves), list order = shop order
  cosmetics.glb   skin and outfit meshes skinned to the player's 22 bones (each with its own bind poses), hat meshes static
  icons/<sprite>.webp
Pets: their prefabs (own skeleton + Animator) go into art/pets/ through export_store.py --prefabs, see main().
"""
import io, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mm  # noqa: E402
import export_store as es  # noqa: E402

GAME = os.path.dirname(HERE)
OUT = os.path.join(GAME, "art", "cosmetics")
COST = {0: "free", 1: "cash", 2: "ads", 3: "special", 4: "iap", 5: "gold"}
ABILITY = {1: "machine", 2: "animal", 3: "worker", 4: "player", 5: "revenue"}
PET_SIZE = {0: "small", 1: "big", 2: "medium"}


def main():
    os.makedirs(os.path.join(OUT, "icons"), exist_ok=True)
    scene = json.load(io.open(os.path.join(GAME, "art", "store1", "scene.json"), encoding="utf-8"))
    nodes = scene["nodes"]
    env = mm.load()
    files = {}

    def obj(ref):
        f = ref["f"]
        if f not in files:
            files[f] = mm.by_file(f)
        return files[f][ref["id"]]

    by_name = {"Mesh": {}, "Sprite": {}}
    for o in env.objects:
        if o.type.name in by_name:
            n = o.read_typetree()["m_Name"]
            # the Addressables bundle copy first: the old sharedassets copies of some hats are streamed (0 vertices)
            if n not in by_name[o.type.name] or o.assets_file.name.startswith("CAB-"):
                by_name[o.type.name][n] = o

    glb = es.GLB()
    meshes, mesh_index = [], {}
    materials, mat_index = [], {}

    def tex_ref(t):
        stem, im = es.save_texture(t.read(), os.path.join(GAME, "art", "tex"))
        return stem

    def mat_ref(ref):
        key = (ref["f"], ref["id"])
        if key not in mat_index:
            e = es.material_entry(obj(ref).read(), tex_ref)
            materials.append(e)
            mat_index[key] = len(materials) - 1
        return mat_index[key]

    def mesh_ref(o, skinned):
        key = (o.assets_file.name, o.path_id)
        if key not in mesh_index:
            mo = o.read()
            try:
                m = es.read_mesh(mo, skinned)
            except ValueError:  # hat_Empty: no vertices at all
                m = {"pos": []}
            if not len(m["pos"]):
                print("  empty mesh", mo.m_Name)
                mesh_index[key] = None
                return None
            glb.mesh(mo.m_Name, m)
            entry = {"name": mo.m_Name, "verts": len(m["pos"])}
            if "bind" in m:
                entry["bind"] = m["bind"]
            meshes.append(entry)
            mesh_index[key] = len(meshes) - 1
        return mesh_index[key]

    icons = set()

    def icon(addr):
        n = addr and addr.get("m_SubObjectName")
        if not n:
            return None
        if n not in icons:
            o = by_name["Sprite"].get(n)
            if o is None:
                print("  no sprite", n)
                return None
            o.read().image.save(os.path.join(OUT, "icons", n + ".webp"), "WEBP", lossless=True)
            icons.add(n)
        return n

    def rows(cls):
        out = []
        for i, n in enumerate(nodes):
            c = (n.get("k") or {}).get(cls)
            if c is None:
                continue
            # GetComponentsInChildren without includeInactive: an inactive row (or parent) is not in the shop
            j, on = i, True
            while j >= 0:
                on = on and nodes[j].get("a", 1) != 0
                j = nodes[j]["p"]
            if on:
                out.append((n["n"], c))
        return out

    out = {"skins": [], "outfits": [], "hats": [], "pets": []}
    for name, c in rows("SkinController"):
        out["skins"].append({"id": c["skinNameForPreference"], "name": name, "icon": icon(c["skinAddressableSprite"]),
                             "mesh": mesh_ref(obj(c["skinMesh"]), True) if c.get("skinMesh") else None,
                             "cost": {"type": COST[c["skinCostType"]], "price": c["cashCost"], "ads": c["adCost"]},
                             "unlocked": bool(c["isUnlocked"])})
    for name, c in rows("OutfitController"):
        t = COST[c["outfitCostType"]]
        out["outfits"].append({"id": c["outfitNameForPreference"], "name": name, "icon": icon(c["outfitAddressableSprite"]),
                               "mesh": mesh_ref(obj(c["outfitMesh"]), True) if c.get("outfitMesh") else None,
                               "mats": [mat_ref(m) for m in c["materials"] if m],
                               "cost": {"type": t, "price": c["cost"] if t in ("cash", "gold") else 0, "ads": c["cost"] if t == "ads" else 0},
                               "abilities": [[ABILITY[a], m] for a, m in zip(c["abilityType"], c["abilityMultiplier"]) if a in ABILITY],
                               "blocksHat": bool(c["IsBlockingHat"]), "unlocked": bool(c["isUnlocked"])})
    for name, c in rows("HatController"):
        mn = (c.get("hatMeshAddressable") or {}).get("m_SubObjectName")
        mo = by_name["Mesh"].get(mn) if mn else None
        if mn and mo is None:
            print("  no hat mesh", mn)
        out["hats"].append({"id": c["hatNameForPreference"], "name": name, "icon": icon(c["hatAddressableSprite"]),
                            "mesh": mesh_ref(mo, False) if mo is not None else None,
                            "mats": [mat_ref(m) for m in c["_materials"] if m],
                            "cost": {"type": COST[c["hatCostType"]], "price": c["cashCost"], "ads": c["adCost"]},
                            "unlocked": bool(c["isUnlocked"])})
    for name, c in rows("PetController"):
        t = COST[c["petCostType"]]
        size = None
        if c.get("petVisualsPrefab"):
            pv = obj(c["petVisualsPrefab"])
            size = PET_SIZE.get(int.from_bytes(pv.get_raw_data()[32:36], "little"))
        out["pets"].append({"id": c["petNameForPreference"], "name": name, "icon": icon(c["petAddressableSprite"]),
                            "prefab": c["petVisualsPrefab"]["id"] if c.get("petVisualsPrefab") else None, "size": size,
                            "carry": c["carryLimit"], "cost": {"type": t, "price": c["cost"] if t in ("cash", "gold") else 0,
                                                               "ads": c["cost"] if t == "ads" else 0},
                            "unlocked": bool(c["isUnlocked"])})
    out["meshes"], out["materials"] = meshes, materials
    glb.write(os.path.join(OUT, "cosmetics.glb"))
    with open(os.path.join(OUT, "cosmetics.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print({k: len(v) for k, v in out.items()}, "icons", len(icons),
          "glb", os.path.getsize(os.path.join(OUT, "cosmetics.glb")) // 1024, "KB")


if __name__ == "__main__":
    main()
