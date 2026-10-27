"""Export the customer bubble faces (CustomerUI prefab: happyIcon, neutralIcon) and the angry face (icon-angryFace) to
art/ui/sprites, next to the sprites export_ui.py writes.

Usage: py -3.12 export_faces.py
"""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mm  # noqa: E402

OUT = os.path.join(os.path.dirname(HERE), "art", "ui", "sprites")


def main():
    env = mm.load()
    wanted = {}
    for o in env.objects:
        if o.type.name == "MonoBehaviour" and mm.script(o)[1] == "CustomerUI":
            d = o.read_typetree(nodes=mm.mb_node(*mm.script(o)))
            ext = mm.ext_names(o.assets_file)
            for field in ("happyIcon", "neutralIcon"):
                p = d.get(field) or {}
                if p.get("m_PathID"):
                    f = ext[p["m_FileID"] - 1] if p["m_FileID"] else o.assets_file.name
                    wanted[field] = (f, p["m_PathID"])
            break
    wanted["angryIcon"] = ("sharedassets1.assets", 1427)
    for name, (f, pid) in wanted.items():
        spr = mm.by_file(f)[pid].read()
        spr.image.save(os.path.join(OUT, f"{name}.webp"), "WEBP", lossless=True)
        print(name, f, pid, spr.m_Name, spr.image.size)


if __name__ == "__main__":
    main()
