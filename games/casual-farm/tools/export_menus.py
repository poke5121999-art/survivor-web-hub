"""Export addressable menu prefabs (prestige menu, welcome screen, info popup, map row button...) with their sprites.

Usage (from this folder): PYTHONIOENCODING=utf-8 py -3.12 export_menus.py [--print]

Writes games/casual-farm/art/ui/menus/
  menus.json   {key: {source, nodes}} in the node format of export_ui.py (raw Unity rects, y up)
  <sprite>.webp  every sprite those trees point at
--print shows each tree as an indented outline (name, size, text, sprite, colour) for reading the layout.
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mm  # noqa: E402
import export_ui as ui  # noqa: E402

OUT = os.path.join(os.path.dirname(HERE), "art", "ui", "menus")
# key -> GameObject name in the addressable UI bundle
TREES = {
    "prestigeMenu": "MartPrestigeMenu",
    "prestigeWelcome": "MartPrestige_WelcomeScreen",
    "prestigeInfo": "Info_Prestige",
    "prestigeButton": "PrestigeButtonHolder",
}
# key -> (file, MonoBehaviour path id): the whole prefab that holds this component (scene-referenced prefabs)
BY_COMPONENT = {
    "martRow": ("sharedassets1.assets", 20836),  # MartMenuController: one row of the city map menu
    # CustomiseScreenController (CUSTOMIZE CANVAS) and its shop holders (rules/census-cosmetics.md section 4)
    "customise": ("sharedassets1.assets", 24340),
    "hatButton": ("sharedassets1.assets", 17931),
    "hatSpecial": ("sharedassets1.assets", 23693),
    "outfitButton": ("sharedassets1.assets", 17941),
    "outfitSpecial": ("sharedassets1.assets", 25276),
    "petButton": ("sharedassets1.assets", 24212),
}


def outline(nodes):
    for i, n in enumerate(nodes):
        d = depth_of(nodes, i)
        rc = n.get("rect") or {}
        bits = [("  " * d) + n["name"] + ("" if n.get("active", True) else " (off)")]
        if rc:
            bits.append("size=%s pos=%s" % (rc.get("sizeDelta"), rc.get("anchoredPosition")))
        if n.get("image"):
            im = n["image"]
            bits.append("img=%s col=%s" % (im.get("sprite"), im.get("color")))
        if n.get("text"):
            t = n["text"]
            bits.append("txt=%r size=%s col=%s" % (t.get("text"), t.get("fontSize"), t.get("color")))
        print("  ".join(bits))


def depth_of(nodes, i):
    d = 0
    while nodes[i]["parent"] >= 0:
        i = nodes[i]["parent"]
        d += 1
    return d


def main():
    os.makedirs(OUT, exist_ok=True)
    ui.SPR = OUT
    mm.load()
    out = {}
    for key, name in TREES.items():
        hit = None
        for o in mm.load().objects:
            if o.type.name == "GameObject" and o.assets_file.name.startswith("CAB-") and o.read_typetree()["m_Name"] == name:
                hit = (o.assets_file.name, o.path_id)
                break
        if not hit:
            print("MISSING", key, name)
            continue
        f = ui.F(hit[0])
        nodes = ui.export_tree(f, hit[1])
        out[key] = {"source": "%s:%d" % hit, "nodes": nodes}
        print(key, name, hit, len(nodes), "nodes")
        if "--print" in sys.argv:
            outline(nodes)
    for key, (fname, mb) in BY_COMPONENT.items():
        f = ui.F(fname)
        g = f.owner[mb]
        while f.parent.get(g):
            g = f.parent[g]
        nodes = ui.export_tree(f, g)
        out[key] = {"source": "%s:%d" % (fname, g), "nodes": nodes}
        print(key, f.gname(g), len(nodes), "nodes")
        if "--print" in sys.argv:
            outline(nodes)
    # GameManager.martIconList (GetMartIconForScene): Mart_<Name>Icon sprites, matched to data/marts.json by name.
    # The Campsite mart (Store14) has no Mart_ sprite in the build; the web falls back to martIcon.
    icons = {}
    for o in mm.load().objects:
        if o.type.name == "Sprite" and not o.assets_file.name.startswith("CAB-"):
            n = o.read_typetree()["m_Name"]
            if n.startswith("Mart_") and n.endswith("Icon") and n not in icons:
                o.read().image.save(os.path.join(OUT, n + ".webp"), "WEBP", lossless=True)
                icons[n] = "%s:%d" % (o.assets_file.name, o.path_id)
    print("mart icons", sorted(icons))
    with open(os.path.join(OUT, "menus.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump({"trees": out, "sprites": ui.SPRITES, "martIcons": icons}, fh, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
