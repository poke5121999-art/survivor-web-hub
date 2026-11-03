"""Prefab ids of every runtime-spawned object, in a fixed order, for export_store.py --prefabs.

Usage: python -I tools/pool_list.py  -> prints the id list and writes data/pool.json {category: [root index...]}
Categories: products (ProductsContainerSO.productsList, index = BaseProductType-1), furniture (FurnitureContainerSO,
index = BaseFurnitureType-1), storage (StorageContainerSO.rackList), boxes (DeliveryBoxContainerSO.deliveryBoxList),
customers (NpcSpawner.customerPrefabList), cashier (CashierSystem.cashierPrefab)."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mm
env = mm.load()
by = {}
for o in env.objects:
    if o.type.name == "MonoBehaviour":
        cls = mm.script(o)[1]
        if cls in ("ProductsContainerSO", "FurnitureContainerSO", "StorageContainerSO", "DeliveryBoxContainerSO", "NpcSpawner", "CashierSystem"):
            by[cls] = mm.read(o)
cats = [("products", [p["m_PathID"] for p in by["ProductsContainerSO"]["productsList"]]),
        ("furniture", [p["m_PathID"] for p in by["FurnitureContainerSO"]["furnitureList"]]),
        ("storage", [p["m_PathID"] for p in by["StorageContainerSO"]["rackList"]]),
        ("boxes", [p["m_PathID"] for p in by["DeliveryBoxContainerSO"]["deliveryBoxList"]]),
        ("customers", [p["m_PathID"] for p in by["NpcSpawner"]["customerPrefabList"]]),
        ("cashier", [by["CashierSystem"]["cashierPrefab"]["m_PathID"]])]
ids, out = [], {}
for name, lst in cats:
    out[name] = []
    for pid in lst:
        if pid in ids:
            out[name].append(ids.index(pid))
        else:
            ids.append(pid)
            out[name].append(len(ids) - 1)
json.dump(out, open(os.path.join(os.path.dirname(HERE), "data", "pool.json"), "w"))
print(",".join(map(str, ids)))
print({k: len(v) for k, v in out.items()}, file=sys.stderr)
