"""Export what the particle effects draw with (rules/particles.md): the puff mesh `puff_Small` with its Toon_Puff
material (dust trail and smoke puffs), and the additive sprites of the boost, upgrade and sparkle effects.

Usage: py -3.12 export_fx.py

Writes games/casual-farm/art/fx/
  fx.glb    mesh m0 = puff_Small
  fx.json   {"puff": {"mesh": 0, "material": scene.json-style material}, "textures": [...]}
  <name>.webp  shrinking_hexagon, glowring_smooth, glow, shape_hexagon, shape_plus, shape_box, sparkle
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mm  # noqa: E402
from export_store import GLB, read_mesh, material_entry, log, save_texture  # noqa: E402

GAME = os.path.dirname(HERE)
SPRITES = ["shrinking_hexagon", "glowring_smooth", "glow", "shape_hexagon", "shape_plus", "shape_box", "sparkle"]


def main():
    out = os.path.join(GAME, "art", "fx")
    os.makedirs(out, exist_ok=True)
    env = mm.load()
    mesh = mat = None
    tex = {}
    for o in env.objects:
        if o.assets_file.name != "sharedassets1.assets":
            continue
        if o.type.name == "Mesh" and mesh is None:
            d = o.read()
            if d.m_Name == "puff_Small":
                mesh = d
        elif o.type.name == "Material" and mat is None:
            d = o.read()
            if d.m_Name == "Toon_Puff":
                mat = d
        elif o.type.name == "Texture2D":
            d = o.read()
            if d.m_Name in SPRITES and d.m_Name not in tex:
                tex[d.m_Name] = d
    if mesh is None or mat is None:
        raise SystemExit(f"puff_Small {'found' if mesh else 'missing'}, Toon_Puff {'found' if mat else 'missing'}")
    glb = GLB()
    glb.mesh("puff_Small", read_mesh(mesh))
    textures = []

    def tex_ref(pptr):
        name, _ = save_texture(pptr.read(), os.path.join(GAME, "art", "tex"))
        textures.append(name)
        return name

    puff = {"mesh": 0, "material": material_entry(mat, tex_ref)}
    for name, t in tex.items():
        t.image.save(os.path.join(out, f"{name}.webp"), "WEBP", lossless=True)
    glb.write(os.path.join(out, "fx.glb"))
    with open(os.path.join(out, "fx.json"), "w", encoding="utf-8") as fh:
        json.dump({"puff": puff, "textures": sorted(set(textures)), "sprites": sorted(tex)}, fh, ensure_ascii=False, indent=1)
    log(f"fx: puff_Small, sprites {sorted(tex)}, missing {sorted(set(SPRITES) - set(tex))}")


if __name__ == "__main__":
    main()
