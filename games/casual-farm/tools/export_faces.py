"""Export bubble faces and a few HUD icons to art/ui/sprites, next to the sprites export_ui.py writes:
customer faces (CustomerUI: happyIcon, neutralIcon), thief faces (CWCommUIController: thiefIcon, sadIcon), the angry
face (icon-angryFace) and the phone-order icons (mobilePhoneIcon, car_CustomerIcon from the addressable group).

Usage: py -3.12 export_faces.py
"""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mm  # noqa: E402

OUT = os.path.join(os.path.dirname(HERE), "art", "ui", "sprites")
NAMED = ["mobilePhoneIcon", "car_CustomerIcon"]


def main():
    env = mm.load()
    wanted = {}
    by_name = {}
    for o in env.objects:
        if o.type.name == "MonoBehaviour":
            cls = mm.script(o)[1]
            fields = {"CustomerUI": ("happyIcon", "neutralIcon"), "CWCommUIController": ("thiefIcon", "sadIcon")}.get(cls)
            if not fields or all(f in wanted for f in fields):
                continue
            d = o.read_typetree(nodes=mm.mb_node(*mm.script(o)))
            ext = mm.ext_names(o.assets_file)
            for field in fields:
                p = d.get(field) or {}
                if p.get("m_PathID") and field not in wanted:
                    f = ext[p["m_FileID"] - 1] if p["m_FileID"] else o.assets_file.name
                    wanted[field] = ("pptr", f, p["m_PathID"])
        elif o.type.name == "Sprite" and o.assets_file.name.startswith("CAB-"):
            nm = o.read_typetree()["m_Name"]
            if nm in NAMED and nm not in by_name:
                by_name[nm] = o
    wanted["angryIcon"] = ("pptr", "sharedassets1.assets", 1427)
    for name, (_, f, pid) in wanted.items():
        spr = mm.by_file(f)[pid].read()
        spr.image.save(os.path.join(OUT, f"{name}.webp"), "WEBP", lossless=True)
        print(name, f, pid, spr.m_Name, spr.image.size)
    for nm, o in by_name.items():
        spr = o.read()
        spr.image.save(os.path.join(OUT, f"{nm}.webp"), "WEBP", lossless=True)
        print(nm, spr.image.size)
    missing = [n for n in NAMED if n not in by_name] + [f for f in ("thiefIcon", "sadIcon") if f not in wanted]
    if missing:
        print("missing:", missing)


if __name__ == "__main__":
    main()
