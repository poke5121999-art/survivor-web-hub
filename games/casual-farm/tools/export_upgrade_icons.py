"""Export the portraits of the HUD upgrade menu (UpgradeMenuController, the three-tab UPGRADES popup seen in gameplay video)
for all 14 marts, plus art/ui/upgrade/icons.json listing every row in menu order.

Usage (from games/casual-farm): PYTHONIOENCODING=utf-8 MM_REF=D:/minimart-ref py -3.12 tools/export_upgrade_icons.py

What the menu shows (rules: D:\\minimart-ref\\rules\\upgrade-menu.md):
  Workers tab : the player row first (PlayerController.workerName / workerStackSpriteIcon), then every
                PlayerWorkerAgentController (Shelver / Chef / Farmer) under the PROGRESS MANAGER node, scene order.
  Machines tab: every FactoryController with factoryType 1 under PROGRESS MANAGER, scene order.
  Animals tab : the same with factoryType 2 (tab hidden when there is none, or in MySceneType Store3 / Store8).
  Row portrait = FactoryController.GetFactoryIconSprite() = factorySpriteIcon (FactoryInputProduceController.c:643) and
  workerStackSpriteIcon (WorkerUpgradeCombine.SetWorker/SetPlayer); row name = factoryName / workerName.
  Locked rows draw the same sprite tinted black (Image.color 0,0,0,1) with the name "???" - the web applies
  `filter: brightness(0)`, so no silhouette files are written.
Everything but the pixels comes from art/storeN/scene.json (already exported); only the sprites are read from the bundles,
all in one UnityPy session. Key in icons.json: scene.json node name (nodes[].n), the same string store.producers[].name and
workers.defs[].name carry in the web build.
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
sys.path.insert(0, HERE)

OUT = os.path.join(GAME, "art", "ui", "upgrade")
FACTORY_CLASSES = ("FactoryController",)  # matched by field: any component with factoryType 1/2 and a name/icon
WORKER_CLASSES = ("PlayerWorkerAgentController", "PlayerWorkerFarmController", "PlayerWorkerChefController")
ROLE = {"PlayerWorkerAgentController": "shelver", "PlayerWorkerFarmController": "farmer", "PlayerWorkerChefController": "chef"}
NO_ANIMAL_TAB = {3, 10}  # UpgradeMenuController.Awake: sceneType 3 or 10 -> _isAnimalOn = false


def ref(p):
    return (p["f"] or "", p["id"]) if isinstance(p, dict) and p.get("id") else None


def rows_for(store_id, scene):
    nodes = scene["nodes"]
    kids = {}
    for i, n in enumerate(nodes):
        kids.setdefault(n["p"], []).append(i)
    pm = next(i for i, n in enumerate(nodes) if "ProgressManager" in (n.get("k") or {}))
    order = []

    def walk(i):  # GetComponentsInChildren order: depth first, siblings in hierarchy order
        order.append(i)
        for c in kids.get(i, []):
            walk(c)

    walk(pm)
    rows = {"workers": [], "machines": [], "animals": []}
    player = next((i, n) for i, n in enumerate(nodes) if "PlayerHumanController" in (n.get("k") or {}))
    pk = player[1]["k"]["PlayerHumanController"]
    rows["workers"].append(dict(node=player[1]["n"], kind="player", role="player", name=pk["workerName"],
                                sprite=ref(pk["workerStackSpriteIcon"])))
    for i in order:
        n = nodes[i]
        for cls, f in (n.get("k") or {}).items():
            if cls in WORKER_CLASSES:
                rows["workers"].append(dict(node=n["n"], kind="worker", role=ROLE[cls], name=f["workerName"],
                                            letter=(re.search(r"([A-Z])(?: Variant)?$", n["n"]) or [None, ""])[1],
                                            sprite=ref(f["workerStackSpriteIcon"])))
            elif isinstance(f, dict) and f.get("factoryType") in (1, 2) and "factoryName" in f:
                tab = "machines" if f["factoryType"] == 1 else "animals"
                rows[tab].append(dict(node=n["n"], kind="machine" if tab == "machines" else "animal", cls=cls,
                                      name=f["factoryName"], sprite=ref(f.get("factorySpriteIcon")) or ref(f.get("factoryIcon"))))
    return rows


def main():
    with open(os.path.join(GAME, "data", "marts.json"), encoding="utf-8") as fh:
        marts = json.load(fh)
    plan, wanted = {}, set()
    for m in marts:
        with open(os.path.join(GAME, "art", m["id"], "scene.json"), encoding="utf-8") as fh:
            scene = json.load(fh)
        rows = rows_for(m["id"], scene)
        scene_type = int(m["level"].replace("level", ""))  # Store_N loads level<MySceneType>
        plan[m["id"]] = dict(scene=m["scene"], sceneType=scene_type, rows=rows)
        for tab in rows.values():
            for r in tab:
                if r["sprite"] is None:
                    raise SystemExit(f"{m['id']} {r['node']}: no icon sprite")
                wanted.add(r["sprite"])
    print(f"{len(plan)} marts, {len(wanted)} distinct sprites", flush=True)

    import mm
    mm.load()
    os.makedirs(OUT, exist_ok=True)
    files, names = {}, {}
    cache = {}
    for f in sorted({w[0] for w in wanted}):
        cache.update({(f, pid): o for pid, o in mm.by_file(f).items() if (f, pid) in wanted})
    for key in sorted(wanted):
        spr = cache[key].read()
        base = re.sub(r"[^A-Za-z0-9_.-]", "_", spr.m_Name)
        fn = base + ".webp"
        if fn in names and names[fn] != key:
            fn = f"{base}_{key[0].split('.')[0]}_{key[1]}.webp"
        names[fn] = key
        img = spr.image.convert("RGBA")
        img.save(os.path.join(OUT, fn), "WEBP", lossless=True)
        files[key] = fn
        print(fn, key, img.size, flush=True)
    meta = {fn: dict(sprite=f"{k[0]}:{k[1]}") for fn, k in names.items()}
    for fn in meta:
        from PIL import Image
        with Image.open(os.path.join(OUT, fn)) as im:
            meta[fn]["w"], meta[fn]["h"] = im.size

    stores = {}
    n_rows = 0
    for sid, p in plan.items():
        tabs = {}
        for tab, rows in p["rows"].items():
            out = []
            for r in rows:
                row = {"node": r["node"], "kind": r["kind"], "name": r["name"], "icon": files[r["sprite"]]}
                if r["kind"] == "worker":
                    row["role"], row["letter"] = r["role"], r["letter"]
                out.append(row)
                n_rows += 1
            tabs[tab] = out
        shown = bool(tabs["animals"]) and p["sceneType"] not in NO_ANIMAL_TAB
        stores[sid] = dict(scene=p["scene"], sceneType=p["sceneType"], animalsTab=shown, tabs=tabs)
    doc = {
        "menu": "UpgradeMenuController (legacy 3-tab UPGRADES popup; see rules/upgrade-menu.md)",
        "key": "node = nodes[].n in art/<store>/scene.json (= store.producers[].name / workers.defs[].name); player row node is Player_Chef",
        "tabOrder": ["workers", "machines", "animals"],
        "locked": "same icon tinted black (filter: brightness(0)), name '???', no buttons",
        "files": dict(sorted(meta.items())),
        "stores": stores,
    }
    with open(os.path.join(OUT, "icons.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump(doc, fh, indent=1, ensure_ascii=False)
        fh.write("\n")
    print(f"wrote {len(files)} icons, {n_rows} rows over {len(stores)} marts")


if __name__ == "__main__":
    main()
