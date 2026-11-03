"""Game rules and catalogue of Pet Shop Simulator for the web build: data/game.json + art/icons/*.png.

Usage: python -I tools/export_data.py   (after export_store.py level1 store)
Serialized values come from level1 MonoBehaviours (via art/store/scene.json where the component is in the 3D scene,
via mm for the uGUI ones). Values that live only in method bodies were read from libil2cpp.so with capstone
(~/petshop-work/tools/dis.py); each carries its source in "src". Money: product/furniture prices are cents, Cash and
license/expansion prices are dollars (CartUIHelper.ProcessPurchase / CheckOutCounter.CheckOutRotine: ceil(cents/100)).
"""
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import mm

ICONS = os.path.join(GAME, "art", "icons")
os.makedirs(ICONS, exist_ok=True)
scene = json.load(open(os.path.join(GAME, "art", "store", "scene.json")))
N = scene["nodes"]


def comp(name):
    for i, n in enumerate(N):
        k = (n.get("k") or {}).get(name)
        if k is not None:
            return i, (k[0] if isinstance(k, list) else k)
    raise KeyError(name)


_spr = {}


def icon(ref, stem):
    if not ref:
        return None
    key = (ref["f"], ref["id"])
    if key in _spr:
        return _spr[key]
    o = mm.by_file(ref["f"] or "level1").get(ref["id"])
    if o is None:
        return None
    sp = o.read()
    fn = re.sub(r"[^A-Za-z0-9_.-]+", "_", stem) + ".png"
    sp.image.save(os.path.join(ICONS, fn))
    _spr[key] = fn
    return fn


def mbs(cls):
    env = mm.load()
    return [mm.read(o) for o in env.objects if o.type.name == "MonoBehaviour" and mm.script(o)[1] == cls]


mm.load()
_, spd = comp("StoreProductData")
products = []
for p in spd["productDataList"]:
    products.append({"type": p["productType"], "name": p["nameString"].strip(), "storage": p["storageType"], "license": p["licenseType"],
                     "box": p["boxType"], "perBox": p["boxItemsCount"], "cost": p["costPrice"], "min": p["minPrice"],
                     "market": p["marketPrice"], "max": p["maxPrice"], "price": p["currentPrice"],
                     "icon": icon(p["spriteImage"], f"p{p['productType']}"), "grey": icon(p["greySprite"], f"p{p['productType']}_grey")})
_, sfd = comp("StoreFurnitureData")
furniture = [{"type": f["furnitureType"], "name": f["nameString"], "box": f["boxType"], "perBox": f["boxItemsCount"], "cost": f["costPrice"],
              "icon": icon(f["spriteImage"], f"f{f['furnitureType']}"), "grey": icon(f["spriteGreyImage"], f"f{f['furnitureType']}_grey")}
             for f in sfd["furnitureDataList"]]
storage = [{"type": f["furnitureType"], "name": f["nameString"], "box": f["boxType"], "perBox": f["boxItemsCount"], "cost": f["costPrice"],
            "icon": icon(f["spriteImage"], f"s{f['furnitureType']}"), "grey": icon(f["spriteGreyImage"], f"s{f['furnitureType']}_grey")}
           for f in sfd["storageFurnitureDataList"]]
licenses = sorted(({"type": d["licenseType"], "price": d["licensePrice"], "level": d["requiredLevel"]} for d in mbs("BuyProductLicense")),
                  key=lambda d: d["type"])
licenses.insert(0, {"type": 1, "price": 0, "level": 1, "owned": True})
expansions = sorted(({"type": d["expansionType"], "price": d["expansionPrice"], "level": d["requiredLevel"]} for d in mbs("BuyExpansionLicense")),
                    key=lambda d: d["type"])
expansions.insert(0, {"type": 1, "price": 0, "level": 1, "owned": True})
_, ehelp = comp("StoreExpandHelper")
for e in expansions:
    row = next((x for x in ehelp["expanderDataList"] if x["type"] == e["type"]), None)
    e["walls"] = [w["n"] for w in row["wallsList"]] if row else []

_, lvl = comp("StoreLevel")
_, day = comp("DayNightCycle")
_, cash = comp("CashPayment")
_, deliv = comp("DeliverySystem")
_, price = comp("PricePanelHelper")
_, save = comp("GameSavingManager")
_, lrew = comp("LevelRewardUIHelper")
_, tut = comp("Tutorial")
_, chk = comp("CheckOutCounter")
_, atm = comp("AtmMachine")
rew = [comp_k for comp_k in (n["k"]["RewardMachine"] for n in N if (n.get("k") or {}).get("RewardMachine"))]
cashier = mbs("CashierStateManager")[0] if mbs("CashierStateManager") else {}
cashier_sys = mbs("CashierSystem")[0]
storage_sys = mbs("StorageSystem")[0]
pay = mbs("PaymentManager")[0]
custs = mbs("CustomerManager")
cust = custs[0] if custs else {}
tea = mbs("TeaBreakUIHelper")[0]
hire = mbs("CashierHireUIHelper")[0]
dui = mbs("DeliveryUI")[0]
inter = mbs("InterAdConditionHelper")[0]

out = {
    "money": {"note": "product and furniture prices in cents; cash, licenses, expansions, rewards in dollars",
              "src": "CartUIHelper.ProcessPurchase, CheckOutCounter.<CheckOutRotine>: Cash += ceil(cents / 100.0)"},
    "products": products, "furniture": furniture, "storage": storage, "licenses": licenses, "expansions": expansions,
    "start": {k: save["saveData"][k] for k in ("coins", "energy", "storeLevel", "storePoints", "storeName", "savedExpansionLicenseList",
                                                 "furnitureDataList", "storageDataList", "cameraSensitivity", "sfxVolume", "musicVolume")},
    "level": {"max": lvl["maxLevel"], "pointsPerCheckout": 10, "need": {"1": 50, "2": 100, "3": 200}, "needBefore9": 250, "needFrom9": 300,
              "src": "StoreLevel.CalculatePointsToNextLevel: rodata table 0x8997f0 (50,100,200) for levels 1-3, 250 below 9, else 300; "
                     "CheckOutCounter.<CheckOutRotine> AddPoints(10.0)",
              "rewards": [[s["name"] for s in r["subRewardList"]] for r in lrew["rewardDataList"]],
              "rewardIcons": [[icon(s["rewardSprite"], f"lr_{i}_{j}") for j, s in enumerate(r["subRewardList"])] for i, r in enumerate(lrew["rewardDataList"])]},
    "day": {"start": day["startHour"], "end": day["endHour"], "birdsUntil": day["endBirdsHour"], "minutes": day["totalDurationMinutes"],
            "speed": day["timeSpeedMultiplier"], "tooLateBefore": 1,
            "src": "DayNightCycle.Update: t += speed * dt / (minutes*60) * (end-start)*3600; isTooLate from (end-1)h; day ends at end",
            "dayTint": day["dayTint"], "nightTint": day["nightTint"], "lightCurve": day["lightCurve"]},
    "tax": {"rate": 0.05, "src": "DayEndUIHelper.SetDataOnDayEnd: 0.05 * |income - supplyCost|"},
    "checkout": {"processTime": chk["processCheckOutTime"], "nextCustomerWait": chk["nextCustomerCallWait"], "queue": chk["maxCustomerCapacity"],
                 "maxFailedAttempts": pay["maxFailedAttempts"],
                 "cashExtraOk": 100, "srcExtra": "CashPayment.CheckPayment: 0 <= given - change < 101 (cents); >0 shows the extra-cash alert"},
    "cash": {"changeList": cash["changeList"], "money": [{"name": c["editorString"], "type": c["type"], "value": c["value"]} for c in cash["changeDataList"]],
             "src": "CashPayment.ShowPaymentScreen: changeList shuffled, change = item 0 (item 1 at tutorial step 14), customer hands bill + change"},
    "delivery": {"base": deliv["baseDeliveryTime"], "add": deliv["nextdeliveryAddition"], "min": 54, "max": 300, "maxBoost": dui["maxBoostCount"],
                 "src": "DeliveryBuilder.Build: wait_i = clamp(base + base/2*(boxCount-1) + add*i, 54, 300) per cart line, served in order"},
    "price": {"maxEnergy": price["maxEnergy"], "step": price["priceStep"],
              "src": "PriceCalculator.CalculateCharge: price <= market -> 0, else clamp(ceil((price-market)/(max-market)*maxEnergy), 1, maxEnergy)"},
    "customer": {"speed": cust.get("movementSpeed", 1.25), "rotation": cust.get("rotationSpeed", 5), "maxFromRack": cust.get("maxProductFromRack", 1),
                 "maxBuy": 10, "spawnEvery": 5.0, "checkTime": 2.0, "feedbackTime": 3.0,
                 "src": "CustomerResetState: maxProductsToBuy = clamp(Random.Range(2, min(storeLevel+1, 10)), 2, 10); NpcSpawner.<LetsMove> WaitForSeconds(5); "
                        "CustomerCheckProductStatus .ctor 2.0; CustomerProductFeedBackDecision .ctor 3.0; no patience timer in any state"},
    "rewards": {"atmLevel": atm["showAtLevel"], "atmMachine": 50, "atmPanel": 20, "machines": [{"value": r["rewardValue"], "cash": bool(r["isCashReward"]),
                "level": r["showAtLevel"]} for r in rew], "levelUpCash": 50, "levelUpEnergy": 10, "freeCash": 20, "freeEnergy": 10, "lowCash": 10,
                "lowEnergy": 10, "teaBreak": 5, "teaBreakEvery": tea["maxCount"],
                "src": "AtmMachine.Reward, ATMUIHelper.Reward, LevelCompleteUIHelper.Reward, StoreUIHelper.Cash/EnergyAdReward, Low*UIHelper.Reward, "
                       "TeaBreakUIHelper.AdReward (all rewarded-ad callbacks in the original)"},
    "cashier": {"price": cashier.get("hirePrice", 320), "energy": hire["maxEnergy"], "shift": cashier.get("totalShiftTime", 720),
                "scan": cashier.get("scanProductTime", 1.5), "collect": cashier.get("collectPaymentTime", 5), "process": cashier.get("paymentProcessTime", 5),
                "speed": cashier.get("movementSpeed", 1.5), "name": cashier.get("cashierName"), "serviceEnergy": cashier_sys["requireEnergy"],
                "level": cashier_sys["requiredLevel"], "spawnLevel": cashier_sys["spawnLevel"]},
    "storageService": {"level": storage_sys["reqLevel"], "energy": storage_sys["reqEnergy"]},
    "interAd": {"customers": inter["maxCustomers"], "src": "ads only, not used"},
    "tutorial": [s["stepName"] for s in tut["stepDataList"]],
    "tasks": ["Task_FiveCheckouts_Completed", "Task_BuyFurniture_Completed", "Task_BuyLicense_Completed", "Task_BuyExpansion_Completed"],
}
json.dump(out, open(os.path.join(GAME, "data", "game.json"), "w"), indent=1)
print("products", len(products), "furniture", len(furniture), "storage", len(storage), "licenses", len(licenses), "expansions", len(expansions),
      "icons", len(_spr))
