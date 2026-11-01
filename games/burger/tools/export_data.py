"""Gameplay data of one Burger Please! stage for the web build.

Usage: python -I tools/export_data.py [stage1]
Reads art/<stage>/scene.json (export_store.py output: three.js coordinates), the JSON tables (TextAssets dumped to
$BP_REF/out/text by ~/burger-work/tools/dump_text.py) and the ScriptableObjects the stage points at (mm.py), and writes
data/<stage>.json: world positions of every pad, machine, counter, table, office and path the sim needs, plus costs,
timers and caps.

Sources (see README "Data"):
  StageObjectData_23        key -> cost group, ability groups per grade (StageObjectData.cs keys on _upgradableObjectDataKey)
  StageObjectCostData_51    cost group -> level 1 (build) / 2 / 3 (grade upgrades), type 1 = money
  StageObjectAbilityData_15 ability group -> (type, type_1, value_1); type_1 10 = timer seconds, 21 = price, 30 = capacity,
                            40 = move speed; grade 1/2 rows come in three variants (ChangeType), variant 1 is used
  StageData_37              burger price key, offline reward
  CoffeeMachineData / CounterData / PlayerData / WorkerData ScriptableObjects: stack caps (_maxValueLevel),
                            cashier sell timers, the player/worker level tables.
"""
import glob, json, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
sys.path.insert(0, HERE)
REF = os.environ.get("BP_REF", "/run/media/bui-thanh-thuong/C0E02AC6E02AC310/burger-ref")


def table(name):
    rows = json.load(open(glob.glob(os.path.join(REF, "out", "text", name + "__*.txt"))[0], encoding="utf-8"))
    return rows[1:]


def locale_en():
    """key -> English of Locale_128. The shipped file has unescaped quotes in some French strings, so it is not valid
    JSON; records are cut on '},{' and the en/key fields (always followed by fr/ko in key order) read by pattern."""
    import re
    raw = open(glob.glob(os.path.join(REF, "out", "text", "Locale_128__*.txt"))[0], encoding="utf-8").read()
    out = {}
    for rec in raw.split('},{')[1:]:
        en, key = re.search(r'"en":"(.*?)","fr":', rec), re.search(r'"key":"(.*?)","ko":', rec)
        if en and key:
            try:
                out[key.group(1)] = json.loads('"' + en.group(1) + '"')
            except ValueError:  # a bare quote inside the English text too
                out[key.group(1)] = en.group(1).replace("\\n", "\n").replace('\\"', '"')
    return out


def num(v):
    try:
        f = float(v)
        return int(f) if f == int(f) else f
    except (TypeError, ValueError):
        return v


# ---- transforms (scene.json already holds three.js-space TRS) ----
def qmul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz]


def qrot(q, v):
    x, y, z, w = q
    vx, vy, vz = v
    ix, iy, iz, iw = w * vx + y * vz - z * vy, w * vy + z * vx - x * vz, w * vz + x * vy - y * vx, -x * vx - y * vy - z * vz
    return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x]


class World:
    def __init__(self, scene):
        self.N = scene["nodes"]
        self.cache = {}

    def tr(self, i):
        """(position, rotation, scale) of node i in stage space."""
        if i in self.cache:
            return self.cache[i]
        n = self.N[i]
        t, r, s = n.get("t", [0, 0, 0]), n.get("r", [0, 0, 0, 1]), n.get("s", [1, 1, 1])
        if n["p"] < 0:
            out = (t, r, s)
        else:
            pt, pr, ps = self.tr(n["p"])
            p = qrot(pr, [t[0] * ps[0], t[1] * ps[1], t[2] * ps[2]])
            out = ([pt[0] + p[0], pt[1] + p[1], pt[2] + p[2]], qmul(pr, r), [ps[0] * s[0], ps[1] * s[1], ps[2] * s[2]])
        self.cache[i] = out
        return out

    def pos(self, i):
        return [round(x, 3) for x in self.tr(i)[0]]

    def yaw(self, i):
        q = self.tr(i)[1]
        f = qrot(q, [0, 0, 1])
        return round(math.atan2(f[0], f[2]), 4)

    def box(self, i):
        """BoxCollider of node i as an axis-aligned [cx, cz, hx, hz] on the floor (rotations are multiples of 90 degrees)."""
        b = self.N[i]["k"]["BoxCollider"]
        p, q, s = self.tr(i)
        c = qrot(q, [b["m_Center"]["x"] * s[0], 0, -b["m_Center"]["z"] * s[2]])
        e = qrot(q, [b["m_Size"]["x"] * s[0] / 2, 0, b["m_Size"]["z"] * s[2] / 2])
        return [round(p[0] + c[0], 3), round(p[2] + c[2], 3), round(abs(e[0]), 3), round(abs(e[2]), 3)]


def ref(v):
    return v["n"] if isinstance(v, dict) and "n" in v else None


def main():
    stage = sys.argv[1] if len(sys.argv) > 1 else "stage1"
    sid = int(stage.replace("stage", ""))
    scene = json.load(open(os.path.join(GAME, "art", stage, "scene.json"), encoding="utf-8"))
    W = World(scene)
    N = scene["nodes"]
    comp = lambda i, c: N[i].get("k", {}).get(c)

    objdata = {r["key"]: r for r in table("StageObjectData_23")}
    costs, abil = {}, {}
    for r in table("StageObjectCostData_51"):
        costs.setdefault(r["group_id"], {})[int(r["level"])] = (int(r["type_1"]), int(r["value_1"]))
    for r in table("StageObjectAbilityData_15"):
        abil.setdefault(r["group_id"], []).append((int(r["type"]), int(r["type_1"]), num(r["value_1"])))

    def cost_list(key):
        c = costs.get(objdata[key]["cost_group_id"], {})
        return [c[k][1] if c[k][0] == 1 else None for k in sorted(c)]

    def grade_values(key, kind):
        """Ability value of type_1 == kind for grade 0, 1, 2 (variant 1)."""
        r = objdata[key]
        out = []
        for g in ("ability_group_level0_id", "ability_group_level1_id", "ability_group_level2_id"):
            rows = [v for t, k, v in abil.get(r[g], []) if k == kind and t == 1]
            out.append(rows[0] if rows else None)
        return out

    def level_values(key, kind):
        r = objdata[key]
        return [v for t, k, v in sorted(abil.get(r["ability_group_level0_id"], [])) if k == kind]

    sd = next(r for r in table("StageData_37") if int(r["id"]) == sid)
    price_key = sd["zone_item_price_data_key"].split("&")[0]

    import mm
    mm.load()

    def so(ptr):
        o = mm.by_file(ptr["f"])[ptr["id"]]
        return mm.read(o)

    st = comp(0, "Stage")
    pdata, wdata = so(st["_playerData"]), so(st["_workerDatas"][0]["_workerData"])

    if sd["use_player_total_data"] == "TRUE":
        # Every stage of this build sets use_player_total_data: the office sells PlayerTotalUpgradeData levels; the cost
        # in row L buys level L+1.
        rows = sorted(table("PlayerTotalUpgradeData_8"), key=lambda r: int(r["level"]))
        ptot = {"speed": [num(r["speed"]) for r in rows], "cap": [num(r["capacity"]) for r in rows],
                "priceUp": [num(r["price"]) for r in rows], "speedCost": [num(r["speed_cost"]) for r in rows],
                "capCost": [num(r["capacity_cost"]) for r in rows], "priceCost": [num(r["price_cost"]) for r in rows]}
    else:
        ptot = None
    # Stage prefab tuning (CustomerSpawner.Update reloads its countdown with customerSpawnTime; a counter takes no more
    # customers once customerList.Count >= maxCustomerCount).
    out_stage = {k: st[k] for k in ("customerSpawnTime", "maxCustomerCount", "customerVIPRate", "orderCountPerTable", "orderCountPerTableCount",
                                    "carSpawnTime", "maxCarCount", "driveCarType")}
    out = {"stage": sid, "name": sd["stage_name"], "tuning": out_stage,
           "price": cost_list(price_key)[0],
           "offline": {"rate": num(sd["offline_reward"]), "plusKey": sd["offline_reward_plus_key"],
                       "plusStart": num(sd["offline_reward_price_start"]), "plusStep": num(sd["offline_reward_price_step"]),
                       "plus": num(sd["offline_reward_plus"]), "plusStepValue": num(sd["offline_reward_plus_step"]),
                       "plusMax": num(sd["offline_reward_plus_max"])},
           "player": {"start": W.pos(next(i for i, n in enumerate(N) if "Player" in n.get("k", {}))),
                      "node": next(i for i, n in enumerate(N) if "Player" in n.get("k", {})),
                      "speed": level_values(pdata["_speedDataKey"], 40), "cap": level_values(pdata["_capacityDataKey"], 30),
                      "priceUp": level_values(pdata["_priceUpDataKey"], 21),
                      "speedCost": cost_list(pdata["_speedDataKey"]), "capCost": cost_list(pdata["_capacityDataKey"]),
                      "priceCost": cost_list(pdata["_priceUpDataKey"]), "table": "PlayerData"},
           "worker": {"speed": level_values(wdata["_speedDataKey"], 40), "cap": level_values(wdata["_capacityDataKey"], 30),
                      "max": wdata["workerMaxEmploy"],
                      "speedCost": cost_list(wdata["_speedDataKey"]), "capCost": cost_list(wdata["_capacityDataKey"]),
                      "employCost": cost_list(wdata["_speedDataKey"].replace("MoveSpeed", "Employment"))},
           "pads": [], "machines": [], "counters": [], "tables": [], "trash": [], "paths": {}}

    if ptot:
        out["player"].update(ptot, table="PlayerTotalUpgradeData")

    def pad_vis(i):
        """The pad's own floor graphic: the component's _transform when the pad node also holds what it builds."""
        for c in ("TableArea", "DoorCreateArea", "HRUpgradeAreaOpenArea", "PlayerUpgradeAreaOpenArea", "KioskArea"):
            k = comp(i, c)
            if k and ref(k.get("_transform")) is not None:
                return ref(k["_transform"])
        return i

    def price_node(i):
        """The pad's world-space TextMeshPro price (CreateArea/UpgradeArea/TableArea/... .priceText)."""
        for v in N[i].get("k", {}).values():
            if isinstance(v, dict) and ref(v.get("priceText")) is not None:
                return ref(v["priceText"])
        return None

    def pad(kind, i, cost, **kw):
        e = {"id": f"{kind}{len([p for p in out['pads'] if p['kind'] == kind]) + 1}", "kind": kind, "node": i,
             "vis": pad_vis(i), "box": W.box(i), "cost": cost, "price": price_node(i)}
        e.update(kw)
        out["pads"].append(e)
        return e["id"]

    # Starting cash pile and door
    for i, n in enumerate(N):
        if n["p"] == 65 and "MoneyArea" in n.get("k", {}):
            out["startMoney"] = {"node": i, "pos": W.pos(i), "amount": n["k"]["MoneyArea"]["moneyCount"]}
        if "DoorCreateArea" in n.get("k", {}):
            d = n["k"]["DoorCreateArea"]
            out["door"] = {"pad": pad("door", i, d["createCost"][0]["itemCount"]), "node": ref(d["door"]),
                           "block": ref(d["block"]), "padNode": i}

    # Grills (CoffeeMachineNode + CoffeeMachineData)
    for i, n in enumerate(N):
        c = n.get("k", {}).get("CoffeeMachineNode")
        if not c or n["p"] != 65:
            continue
        data = so(c["coffeeMachineData"])
        key = data["_upgradableObjectDataKey"]
        mc = comp(ref(c["coffeeMachine"]), "CoffeeMachine")
        m = {"id": f"m{len(out['machines']) + 1}", "key": key, "node": i, "machine": ref(c["coffeeMachine"]),
             "stack": W.pos(ref(mc["_coffeeTransform"])), "stackNode": ref(mc["_coffeeTransform"]),
             "item": mc["_ingredientType"], "grades": [ref(g) for g in mc["gradeObjects"]],
             "delay": grade_values(key, 10), "max": [v["value"][0] for v in data["_maxValueLevel"]],
             "cost": cost_list(key), "zone": W.box(ref(c["coffeeMachine"])), "active": n.get("a", 1) != 0}
        m["pad"] = pad("machine", ref(c["createArea"]), m["cost"][0], target=m["id"])
        m["upgrade"] = pad("upgrade", ref(c["upgradeArea"]), None, target=m["id"])
        out["machines"].append(m)

    # Counters (CounterNode + CounterData)
    for i, n in enumerate(N):
        c = n.get("k", {}).get("CounterNode")
        if not c or n["p"] != 65:
            continue
        data = so(c["counterData"])
        key = data["_upgradableObjectDataKey"]
        ci = ref(c["counter"])
        cc = comp(ci, "Counter")
        e = {"id": f"c{len(out['counters']) + 1}", "key": key, "node": i, "counter": ci,
             "grades": [ref(g) for g in cc["gradeObjects"]], "items": cc["_itemTypes"], "maxItems": cc["_maxItemValue"],
             "path": [W.pos(ref(p)) for p in cc["customerPath"]], "out": W.pos(ref(cc["customerOutPoint"])),
             "storage": W.box(ref(cc["counterStorage"])), "storageNode": ref(cc["counterStorage"]),
             "money": W.box(ref(cc["moneyArea"])), "moneyNode": ref(cc["moneyArea"]),
             "cashier": W.pos(ref(cc["workerObject"])), "cashierNode": ref(cc["workerObject"]),
             "sell": [v["value"][0] for v in data["_workerSellTimerLevel"]], "employGrade": data["_employGrade"],
             "cost": cost_list(key), "active": n.get("a", 1) != 0}
        sb = ref(cc["sellBoard"])
        e["board"] = W.pos(sb)
        e["pad"] = pad("counter", ref(c["createArea"]), e["cost"][0], target=e["id"])
        e["upgrade"] = pad("upgrade", ref(c["upgradeArea"]), None, target=e["id"])
        out["counters"].append(e)

    # Tables
    for i, n in enumerate(N):
        ta = n.get("k", {}).get("TableArea")
        if not ta:
            continue
        key = ta["_upgradableObjectDataKey"]
        ti = ref(ta["table"])
        tb = comp(ti, "Table")
        seats = [{"pos": W.pos(ref(ch["chairTargetTransform"])), "yaw": W.yaw(ref(ch["chairTransform"]) or ref(ch["chairTargetTransform"]))}
                 for ch in tb["chairs"] if ref(ch["chairTargetTransform"]) is not None]
        e = {"id": f"t{len(out['tables']) + 1}", "key": key, "node": i, "table": ti, "seats": seats,
             "items": W.pos(ti), "money": W.box(ref(tb["moneyArea"])) if ref(tb["moneyArea"]) else None, "moneyNode": ref(tb["moneyArea"]),
             "eat": grade_values(key, 10), "cost": cost_list(key) if key in objdata else [c["cost"][0]["itemCount"] for c in ta["levelCost"]],
             "grades": [ref(g["tableObjects"]) for g in tb["gradeObjects"]], "zone": W.box(ti), "expand": "_Expand_" in key,
             "active": n.get("a", 1) != 0}
        e["pad"] = pad("table", i, e["cost"][0], target=e["id"])
        e["upgrade"] = pad("upgrade", ref(ta["tableUpgradeArea"]), None, target=e["id"])
        out["tables"].append(e)

    # Package table (PackageTableNode + PackageTableData): burgers in on the storage side, boxes out on the pickup side.
    out["packers"] = []
    for i, n in enumerate(N):
        c = n.get("k", {}).get("PackageTableNode")
        if not c or n["p"] != 65:
            continue
        data = so(c["packageTableData"])
        key = data["_upgradableObjectDataKey"]
        ti = ref(c["packageTable"])
        pt = comp(ti, "PackageTable")
        ac = comp(ti, "AppearanceChanger")
        st_i = ref(pt["packageTableStorage"])
        pk_i = next(j for j, m in enumerate(N) if m["p"] == ti and "PackageTablePickup" in m.get("k", {}))
        e = {"id": f"p{len(out['packers']) + 1}", "key": key, "node": i, "table": ti,
             "grades": [ref(g) for g in pt["gradeObjects"]], "ingredients": pt["_ingredientTypes"], "item": pt["itemType"],
             "maxIn": pt["_maxIngredientValue"], "storage": W.box(st_i), "storageNode": st_i, "pickup": W.box(pk_i), "pickupNode": pk_i,
             "burgers": W.pos(ref(ac["_foodParents"][0])), "burgersNode": ref(ac["_foodParents"][0]),
             "items": W.pos(ref(pt["itemsTransform"])), "itemsNode": ref(pt["itemsTransform"]),
             "tray": W.pos(ref(pt["coffeeTrayTransform"])), "trayNode": ref(pt["coffeeTrayTransform"]),
             "packer": W.pos(ref(pt["workerObject"])), "packerNode": ref(pt["workerObject"]), "board": W.pos(ref(pt["sellBoard"])),
             "delay": [v["value"][0] for v in data["_delayLevel"]], "maxOut": [v["value"][0] for v in data["_maxItemValueLevel"]],
             "employGrade": data["_employGrade"], "cost": cost_list(key), "zone": W.box(ti), "active": n.get("a", 1) != 0}
        e["pad"] = pad("packer", ref(c["createArea"]), e["cost"][0], target=e["id"])
        e["upgrade"] = pad("upgrade", ref(c["upgradeArea"]), None, target=e["id"])
        out["packers"].append(e)

    # Drive-thru window (DriveCarCounterNode + DriveCarCounterData) and the car lane (DriveCarCounter.driveInPath/OutPath).
    out["drives"] = []
    pkg_key = sd["zone_package_price_data_key"].split("&")[0]
    out["packagePrice"] = cost_list(pkg_key)[0]
    for i, n in enumerate(N):
        c = n.get("k", {}).get("DriveCarCounterNode")
        if not c or n["p"] != 65:
            continue
        data = so(c["driveCarCounterData"])
        key = data["_upgradableObjectDataKey"]
        di = ref(c["driveCarCounter"])
        dc_ = comp(di, "DriveCarCounter")
        e = {"id": f"d{len(out['drives']) + 1}", "key": key, "node": i, "counter": di,
             "grades": [ref(g) for g in dc_["gradeObjects"]], "item": dc_["itemType"], "maxItems": dc_["_maxItemValue"],
             "storage": W.box(di), "items": W.pos(ref(dc_["_itemParent"])), "itemsNode": ref(dc_["_itemParent"]),
             "money": W.box(ref(dc_["moneyArea"])), "moneyNode": ref(dc_["moneyArea"]),
             "cashier": W.pos(ref(dc_["workerObject"])), "cashierNode": ref(dc_["workerObject"]), "board": W.pos(ref(dc_["sellBoard"])), "boardNode": ref(dc_["sellBoard"]),
             "pathIn": [W.pos(ref(p)) for p in dc_["driveInPath"]], "pathOut": [W.pos(ref(p)) for p in dc_["driveOutPath"]],
             "sell": data["_workerSellTimer"], "bonus": [v["value"][0] for v in data["_sellPriceLevel"]],
             "employGrade": data["_employGrade"], "cost": cost_list(key), "active": n.get("a", 1) != 0}
        e["pad"] = pad("drive", ref(c["createArea"]), e["cost"][0], target=e["id"])
        e["upgrade"] = pad("upgrade", ref(c["upgradeArea"]), None, target=e["id"])
        out["drives"].append(e)

    # Self-order kiosk (KioskArea + Kiosk): its own customer lines, burgers stored in it, sold automatically.
    out["kiosks"] = []
    for i, n in enumerate(N):
        ka = n.get("k", {}).get("KioskArea")
        if not ka:
            continue
        ki = ref(ka["kiosk"])
        kc = comp(ki, "Kiosk")
        e = {"id": f"k{len(out['kiosks']) + 1}", "key": ka["_upgradableObjectDataKey"], "node": i, "kiosk": ki,
             "paths": [[W.pos(ref(x)) for x in pth["path"]] for pth in kc["customerPath"]], "out": W.pos(ref(kc["customerOutPoint"])),
             "storage": W.box(ki), "money": W.box(ref(kc["moneyArea"])), "moneyNode": ref(kc["moneyArea"]),
             "items": W.pos(ref(kc["foodParent"][0]["foodParents"][0])), "itemsNode": ref(kc["foodParent"][0]["foodParents"][0]),
             "foodNode": ref(kc["foodParent"][0]["foodParentObject"]), "itemTypes": kc["_itemTypes"], "maxItems": kc["_maxItemValue"],
             "orderTime": kc["orderTime"], "workerPoints": [W.pos(ref(x)) for x in kc["workerPoints"]],
             "cost": [c["cost"][0]["itemCount"] for c in ka["levelCost"]], "active": n.get("a", 1) != 0}
        e["pad"] = pad("kiosk", i, e["cost"][0], target=e["id"])
        out["kiosks"].append(e)
    out["tuning"].update(kioskCustomerSpawnTime=st["kioskCustomerSpawnTime"], maxKioskCustomerCount=st["maxKioskCustomerCount"])

    for i, n in enumerate(N):
        k = n.get("k", {})
        if "TrashBox" in k:
            out["trash"].append({"node": i, "box": W.box(i), "active": n.get("a", 1) != 0})
        if "HRUpgradeAreaOpenArea" in k:
            h = k["HRUpgradeAreaOpenArea"]
            out["hr"] = {"pad": pad("hr", i, h["createCost"][0]["itemCount"]), "room": ref(h["hrUpgradeArea"]),
                         "spawn": W.pos(ref(comp(ref(h["hrUpgradeArea"]), "HRUpgradeArea")["_staffSpawnTransform"]))}
        if "PlayerUpgradeAreaOpenArea" in k:
            h = k["PlayerUpgradeAreaOpenArea"]
            out["office"] = {"pad": pad("office", i, h["createCost"][0]["itemCount"]), "room": ref(h["playerUpgradeArea"])}
    for name in ("CustomerPath1", "CustomerPath2", "DrivePath", "KioskPath", "DeliveryCustomerPath"):
        r = next((i for i, n in enumerate(N) if n["n"] == name and n["p"] == 0), None)
        if r is not None:
            out["paths"][name] = {N[j]["n"]: W.pos(j) for j, n in enumerate(N) if n["p"] == r}

    # District pads (DistrictController._districtAreas): money opens the next part of the restaurant.
    dc = next(n["k"]["DistrictController"] for n in N if "DistrictController" in n.get("k", {}))
    out["districts"] = []
    for r in dc["_districtAreas"]:
        i = ref(r)
        da = comp(i, "DistrictArea")
        key = da["_upgradableObjectDataKey"]
        num_ = int(key.rsplit("_", 1)[1])
        e = {"id": f"district{num_}", "key": key, "node": i, "cost": cost_list(key)[0], "box": W.box(ref(da["_collider"])),
             "area": ref(da["_transform"]), "opened": ref(da["GO_Opened"])}
        out["pads"].append({"id": e["id"], "kind": "district", "node": i, "vis": i, "box": e["box"], "cost": e["cost"], "price": price_node(i)})
        out["districts"].append(e)
    # Stage._stageFlows: 11 parallel lists of Progress. When every checkObject is active (= built), the progress turns
    # its createObjects and upgradeAreaObjects on, its disableObjects off and unlocks its districtAreaObjects; starLevel
    # gates it. Everything a progress creates starts off. (DistrictArea itself only flips Lock/Unlock/Opened.)
    nodes_of = lambda lst: [ref(x) for x in lst if ref(x) is not None]
    out["flows"] = [[{"check": nodes_of(p["checkObjects"]), "create": nodes_of(p["createObjects"]), "disable": nodes_of(p["disableObjects"]),
                      "upgrade": nodes_of(p["upgradeAreaObjects"]), "district": nodes_of(p["districtAreaObjects"]), "star": p["starLevel"]}
                     for p in f["_progresses"]] for f in st["_stageFlows"]]
    # Star level (StarLevelData rows id // 1000 = stage, prestige 1, StarExpData 3 exp per purchase): reward types 16.. unlock the
    # district pads in DistrictController._districtAreas order; 14 = the special district (Zone1).
    rows = sorted((r for r in table("StarLevelData_116") if r["prestige_level"] == "1" and int(r["id"]) // 1000 == sid),
                  key=lambda r: int(r["level"]))
    out["star"] = [{"level": int(r["level"]), "exp": int(r["exp"]), "money": int(r["currency_reward_value_1"]) if r["currency_reward_type1"] == "1" else 0,
                    "rewards": [int(r[f"reward_type_{k}"]) for k in range(1, 6) if int(r[f"reward_type_{k}"])]} for r in rows]
    out["expPerBuild"] = int(table("StarExpData_9")[0]["exp"])
    order = [ref(r) for r in dc["_districtAreas"]] + [ref(r) for r in dc["_specialDistrictAreas"]]
    for d_ in out["districts"]:
        k = order.index(d_["node"])
        want = 16 + k if k < len(dc["_districtAreas"]) else 14
        d_["star"] = next((r["level"] for r in out["star"] if want in r["rewards"]), None)
    for i in [ref(r) for r in dc["_specialDistrictAreas"]]:
        da = comp(i, "DistrictArea")
        key = da["_upgradableObjectDataKey"]
        e = {"id": f"district{key.rsplit('_', 1)[1]}", "key": key, "node": i, "cost": cost_list(key)[0], "box": W.box(ref(da["_collider"])),
             "area": ref(da["_transform"]), "opened": ref(da["GO_Opened"]), "star": next((r["level"] for r in out["star"] if 14 in r["rewards"]), None)}
        out["pads"].append({"id": e["id"], "kind": "district", "node": i, "vis": i, "box": e["box"], "cost": e["cost"], "price": price_node(i)})
        out["districts"].append(e)
    # Node.upgradeAreaActiveGuideIndex: the counter's grade pad wakes at guide step 13 (Hire_Cashier), not by a flow.
    out["guideUpgrade"] = {}
    for i, n in enumerate(N):
        for cname in ("CounterNode", "CoffeeMachineNode", "PackageTableNode", "DriveCarCounterNode"):
            c = n.get("k", {}).get(cname)
            if c and c.get("upgradeAreaActiveGuideIndex") and ref(c.get("upgradeArea")) is not None:
                out["guideUpgrade"][str(ref(c["upgradeArea"]))] = c["upgradeAreaActiveGuideIndex"]
    # Features with no web counterpart yet: their subtrees stay off and flow checks on them count as done.
    feats = ("RestRoomArea", "SkinRoomArea", "CleanerArea", "SkinRoom")
    out["unbuiltFeatures"] = [i for i, n in enumerate(N) if n["p"] in (0, 65) and n["n"] in feats]

    # Parent and prefab active flag of every node, so the sim knows which NavMeshObstacles are live.
    out["tree"] = [[n["p"], 0 if n.get("a", 1) == 0 else 1] for n in N]
    out["names"] = {n["n"]: i for i, n in enumerate(N) if n["n"].startswith("Distriction")}

    # Camera and light live in the shared scene level1 (FollowCamera, Main Camera, Directional Light).
    l1 = json.load(open(os.path.join(GAME, "art", "level1", "scene.json"), encoding="utf-8"))
    L = l1["nodes"]
    fc = next(n["k"]["FollowCamera"] for n in L if "FollowCamera" in n.get("k", {}))
    cam = next(n["k"]["Camera"] for n in L if n["n"] == "Main Camera")
    light = next(n for n in L if n["n"] == "Directional Light")
    off = fc["_offset"]
    bg = cam["m_BackGroundColor"]
    gm = next(n["k"]["GameManager"] for n in L if "GameManager" in n.get("k", {}))
    # WorldMapManager..ctor (libil2cpp VA 0x18D3F08) stores OFFLINE_REWARD_UNIT = 10.0 s (constant at VA 0x91B13C) and
    # OFFLINE_REWARD_MAX_UNIT = 6; read with capstone, see README.
    out["offline"].update(minMinutes=gm["_offlineMinMinutes"], maxMinutes=gm["_offlineMaxMinutes"], unit=10.0, maxUnit=6)
    out["view"] = {"offset": [off["x"], off["y"], -off["z"]], "ortho": cam["orthographic size"],
                   "background": [bg["r"], bg["g"], bg["b"]], "lightRot": light.get("r", [0, 0, 0, 1]),
                   "lightColor": [light["k"]["Light"]["m_Color"][c] for c in "rgb"], "lightIntensity": light["k"]["Light"]["m_Intensity"],
                   "ambient": [l1["render"]["m_AmbientSkyColor"][c] for c in "rgb"]}

    # Tutorial order (Stage._stageGuide): which pad each step points at, and the objects shown from that step on.
    node_pad = {p["node"]: p["id"] for p in out["pads"]}
    for m in out["machines"]:
        node_pad.setdefault(m["node"], m["pad"])
    for c in out["counters"] + out["packers"] + out["drives"] + out["kiosks"]:
        node_pad.setdefault(c["node"], c["pad"])
    guide = []
    for g in st["_stageGuide"]["guide"]:
        t = ref(g["transform"])
        guide.append({"text": g["textID"], "node": t, "pad": node_pad.get(t),
                      "show": [ref(x) for x in g["createObject"]], "hide": [ref(x) for x in g["disableObject"]]})
    out["guide"] = guide
    # Unlock order outside the tutorial: each table/machine/counter area's GameObject active flag in the prefab says
    # whether it is part of the stage from the start; the rest belong to Districtions/expand content.
    os.makedirs(os.path.join(GAME, "data"), exist_ok=True)
    # English strings of Locale_128 (guide texts, menu labels), shared by every stage.
    with open(os.path.join(GAME, "data", "text.json"), "w", encoding="utf-8") as f:
        json.dump(locale_en(), f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(GAME, "data", f"{stage}.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"{stage}: pads {len(out['pads'])}, machines {len(out['machines'])}, counters {len(out['counters'])}, "
          f"tables {len(out['tables'])}, trash {len(out['trash'])}, guide {len(guide)}, price {out['price']}")


if __name__ == "__main__":
    main()
