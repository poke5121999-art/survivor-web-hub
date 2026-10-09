# -*- coding: utf-8 -*-
"""Bóc cấu hình chợ / xưởng tàu của DREDGE cho js/shop.js: MarketDestination + ShipyardDestination (cái gì mua, giá bán nhân bao nhiêu,
tab hàng, bán hết, sửa tàu) và bố cục ShipyardSlidePanel / MarketSlidePanel trên canvas 1920x1080.

Chạy:  python -I games/dredge/tools/shop_ui.py     (sau index_bundles.py; ~2 phút vì nạp mọi bundle để giải PPtr sprite/item)
Ghi:   games/dredge/data/shop_ui.js   (window.DR_SHOP_UI)

[BẪY] AssetRipper bỏ hết trường của BaseDestination (SerializedMonoBehaviour): Game.unity chỉ còn m_Script, nên đọc typetree trong
bundle scene bằng UnityPy như tools/sfx_dest.py. Một id có nhiều bản (5 pontoon cùng 'destination.tm-shipyard'): các bản giống hệt
nhau (đo 2026-10-09), lấy bản đầu theo đường dẫn sắp xếp. GridKey trong marketTabs là số enum: đổi tên qua enum GridKey của mã C#.
"""
import json, os, sys

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import data as Dt  # noqa: E402

W = Dt.W
SCENE_BUNDLE = "gamescene_scenes_all_a6b10fb3c7f62093a9317419ae755456.bundle"
OUT = os.path.normpath(os.path.join(HERE, "..", "data", "shop_ui.js"))
FIELDS = ["itemTypesBought", "itemSubtypesBought", "bulkItemTypesBought", "bulkItemSubtypesBought", "sellValueModifier",
          "allowSellIfGridFull", "allowStorageAccess", "allowRepairs", "allowBulkSell", "bulkSellPromptString", "bulkSellNotificationString"]
# nút trong cây UI cần số đo (đường dẫn dưới GameCanvases/GameCanvas/DestinationUI)
NODES = {
    "shipyard.panel": "ShipyardDestinationUI/ShipyardSlidePanel",
    "shipyard.title": "ShipyardDestinationUI/ShipyardSlidePanel/TitleContainer",
    "shipyard.titleText": "ShipyardDestinationUI/ShipyardSlidePanel/TitleContainer/TitleText",
    "shipyard.tabbed": "ShipyardDestinationUI/ShipyardSlidePanel/TabbedPanelContainer",
    "shipyard.topBar": "ShipyardDestinationUI/ShipyardSlidePanel/TabbedPanelContainer/TopBar",
    "shipyard.tabs": "ShipyardDestinationUI/ShipyardSlidePanel/TabbedPanelContainer/TopBar/Tabs",
    "shipyard.panels": "ShipyardDestinationUI/ShipyardSlidePanel/TabbedPanelContainer/Panels",
    "shipyard.repairAll": "ShipyardDestinationUI/ShipyardSlidePanel/TabbedPanelContainer/Panels/ShopPanel/Container/RepairAllButton",
    "shipyard.repairAllText": "ShipyardDestinationUI/ShipyardSlidePanel/TabbedPanelContainer/Panels/ShopPanel/Container/RepairAllButton/Text (TMP)",
    "shipyard.repairAllIcon": "ShipyardDestinationUI/ShipyardSlidePanel/TabbedPanelContainer/Panels/ShopPanel/Container/RepairAllButton/Icon",
    "shipyard.divider": "ShipyardDestinationUI/ShipyardSlidePanel/TabbedPanelContainer/Panels/ShopPanel/Container/Divider",
    "shipyard.grid": "ShipyardDestinationUI/ShipyardSlidePanel/TabbedPanelContainer/Panels/ShopPanel/Container/ShopGrid",
    "market.panel": "MarketDestinationUI/MarketSlidePanel",
    "market.title": "MarketDestinationUI/MarketSlidePanel/TitleContainer",
    "market.titleText": "MarketDestinationUI/MarketSlidePanel/TitleContainer/TitleText",
    "market.grid": "MarketDestinationUI/MarketSlidePanel/MarketGrid",
}
ROOT = "GameCanvases/GameCanvas/DestinationUI/"


def get(o):
    return o.read_typetree()


def go_of(c):
    return c.assets_file.objects[get(c)["m_GameObject"]["m_PathID"]]


def tr_of(go):
    for c in get(go)["m_Component"]:
        o = go.assets_file.objects[c["component"]["m_PathID"]]
        if o.type.name in ("Transform", "RectTransform"):
            return o


def path_of(tr):
    names = []
    while tr is not None:
        t = get(tr)
        names.append(get(tr.assets_file.objects[t["m_GameObject"]["m_PathID"]])["m_Name"])
        f = t["m_Father"]["m_PathID"]
        tr = tr.assets_file.objects.get(f) if f else None
    return "/".join(reversed(names))


def r1(v):
    return round(float(v), 2)


def node_info(tr):
    t = get(tr)
    go = tr.assets_file.objects[t["m_GameObject"]["m_PathID"]]
    v = lambda d: [r1(d["x"]), r1(d["y"])]
    e = {"pos": v(t["m_AnchoredPosition"]), "size": v(t["m_SizeDelta"]), "amin": v(t["m_AnchorMin"]), "amax": v(t["m_AnchorMax"]), "pivot": v(t["m_Pivot"])}
    for c in get(go)["m_Component"]:
        o = go.assets_file.objects[c["component"]["m_PathID"]]
        cn = W.cls(o)
        if cn == "Image":
            ct = get(o)
            sp = W.obj(o.assets_file, ct["m_Sprite"]["m_FileID"], ct["m_Sprite"]["m_PathID"]) if ct.get("m_Sprite") else None
            e["sprite"] = get(sp)["m_Name"] if sp is not None else None
            e["color"] = [r1(ct["m_Color"][k]) for k in "rgba"]
        elif cn == "TextMeshProUGUI":
            e["fontSize"] = r1(get(o).get("m_fontSize"))
    return e


def sprite_name(sf, p):
    if not p or not p.get("m_PathID"):
        return None
    o = W.obj(sf, p["m_FileID"], p["m_PathID"])
    return get(o)["m_Name"] if o is not None else None


def item_id(sf, p):
    o = W.obj(sf, p["m_FileID"], p["m_PathID"]) if p and p.get("m_PathID") else None
    return get(o).get("id") if o is not None else None


def main():
    Dt.loc.load()
    W.load_all()
    cabs = W.load(SCENE_BUNDLE)
    dests, nodes = {}, {}
    found = []
    uis = {}
    for cab in cabs:
        for o in cab.objects.values():
            if o.type.name != "MonoBehaviour":
                continue
            cn = W.cls(o)
            if cn in ("MarketDestination", "ShipyardDestination"):
                t = get(o)
                if t.get("id"):
                    found.append((path_of(tr_of(go_of(o))), cn, cab, t))
            elif cn == "MarketDestinationUI":
                tr = tr_of(go_of(o))
                uis[path_of(tr)[len(ROOT):]] = tr
    for k, rel in NODES.items():
        head, rest = rel.split("/", 1)
        tr = uis.get(head)
        for name in rest.split("/") if tr is not None else []:
            kids = [tr.assets_file.objects[c["m_PathID"]] for c in get(tr)["m_Children"]]
            tr = next((c for c in kids if get(c.assets_file.objects[get(c)["m_GameObject"]["m_PathID"]])["m_Name"] == name), None)
            if tr is None:
                break
        if tr is not None:
            nodes[k] = node_info(tr)
    for path, cn, cab, t in sorted(found, key=lambda x: x[0]):
        if t["id"] in dests:
            continue
        d = {"cls": cn, "path": path}
        for f in FIELDS:
            v = t.get(f)
            d[f] = r1(v) if isinstance(v, float) else (bool(v) if f.startswith("allow") else v)
        d["specificItemsBought"] = [item_id(cab, p) for p in t.get("specificItemsBought") or []]
        d["playerTabs"] = list(t.get("playerInventoryTabIndexesToShow") or [])
        tabs = []
        for m in t.get("marketTabs") or []:
            key = Dt.cs.enum_name("GridKey", m.get("gridKey"))
            title = Dt.loc.resolve(m["titleKey"]) if m.get("titleKey") else None
            tabs.append({"gridKey": key, "icon": sprite_name(cab, m.get("tabSprite")),
                         "titleKey": title and title["key"], "title": title and title["text"],
                         "unlockNodes": list(m.get("unlockDialogueNodes") or []) if m.get("isUnlockedBasedOnDialogue") else None})
        d["tabs"] = tabs
        dests[t["id"]] = d
    missing = [k for k in NODES if k not in nodes]
    if missing:
        raise SystemExit("UI nodes not found in scene: " + ", ".join(missing))
    out = {"dests": dict(sorted(dests.items())), "layout": nodes}
    body = json.dumps(out, ensure_ascii=False, indent=1, sort_keys=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("// generated by tools/shop_ui.py from " + SCENE_BUNDLE + " — do not edit\n")
        fh.write("window.DR_SHOP_UI = " + body + ";\n")
    print("dests", len(dests), sorted(dests), "| nodes", len(nodes), "->", OUT)


main()
