"""Export the data of feature "guests" (visiting guests, frog / snail NPCs, hidden theme NPCs, wishlist, deco blocks).

usage: py -3.12 -I tools/export_guests.py

Writes data/guests.json:
  guest        Guest.json rows (resName, targetLevel, eventType, collectType, collectValue = equip indices)
  wishlist     WishList.json rows
  hidden       ThemeHiddenNpc.json rows
  instant      InstantEvent.json rows (all ended in 2021-2022; kept only as data)
  npc          values read from the prefab MonoBehaviours: Npc_Frog / Npc_Snail lifetime, GameNPCManager refresh, the two
               hidden-guest components of themes 14 and 15 (D:/catsoup-ref/index.json -> cns.read)
  blocks       Work type 21 rows: index, moveType, blockShopType, blockCostType, blockCostValue, maxStorage
and art/guests/npc.webp: the 54 resources npc/npc0 (frog prince) .. npc53 (snails of the season events) then npc_theme14 / npc_theme15 (hidden guests) as a 9 x 7 sheet of
128 px cells (cell = index). The 3D art (decoblock3001-3015, five guest vehicles) is art/guests/ from tools/export_prefabs.py.
"""
import json, os, sys
sys.path.insert(0, "D:/catsoup-ref/tools")
import cns  # noqa: E402
from PIL import Image  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
FLAT = "D:/catsoup-ref/flat"
CELL, COLS, ROWS = 128, 9, 7


def flat(name):
    return json.load(open(os.path.join(FLAT, name + ".json"), encoding="utf-8"))


def mono(cls):
    idx = getattr(cns, "index")()
    out = []
    for f, pid in idx[cls]:
        e = getattr(cns, "env")(f)
        for o in e.objects:
            if o.path_id == pid:
                d = cns.read(o)
                out.append({k: v for k, v in d.items() if isinstance(v, (int, float, str)) and not k.startswith("m_Script")})
    return out


def main():
    tables = json.load(open(os.path.join(GAME, "data", "tables.json"), encoding="utf-8"))
    blocks = [{k: w[k] for k in ("index", "moveType", "blockShopType", "blockCostType", "blockCostValue", "maxStorage")}
              for w in tables["Work"] if w["type"] == 21]
    npc = {
        "frog": mono("CnS.Npc_Frog")[0],
        "snail": mono("CnS.Npc_Snail")[0],
        "manager": {k: v for k, v in mono("CnS.GameNPCManager")[0].items() if k == "m_RefreshSecTime"},
        "hidden14": mono("CnS.ThemeNpc_HiddenGuest_Theme14")[0],
        "hidden15": mono("CnS.ThemeNpc_HiddenGuest_Theme15")[0],
        "agent": [{k: v for k, v in d.items() if k in ("npcId", "moveSpeed", "minWaitTime", "maxWaitTime", "interactionDuration")}
                  for d in mono("CnS.NPCData")],
        "agentMinCats": mono("CnS.NPCCatCountSpawnCondition")[0]["minCatCount"],
    }
    data = {"guest": flat("Guest"), "wishlist": flat("WishList"), "hidden": flat("ThemeHiddenNpc"), "instant": flat("InstantEvent"),
            "npc": npc, "blocks": blocks}
    json.dump(data, open(os.path.join(GAME, "data", "guests.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    res = {e[0]: e[1] for e in json.load(open("D:/catsoup-ref/resources.json", encoding="utf-8"))}
    sheet = Image.new("RGBA", (CELL * COLS, CELL * ROWS), (0, 0, 0, 0))
    for n, key in enumerate([f"npc/npc{i}" for i in range(54)] + ["npc/npc_theme14", "npc/npc_theme15"]):
        env = getattr(cns, "env")(res[key])
        for o in env.objects:
            if o.type.name == "Texture2D":
                im = o.read().image.convert("RGBA")
                im.thumbnail((CELL, CELL))
                sheet.paste(im, ((n % COLS) * CELL + (CELL - im.width) // 2, (n // COLS) * CELL + (CELL - im.height) // 2))
    os.makedirs(os.path.join(GAME, "art", "guests"), exist_ok=True)
    sheet.save(os.path.join(GAME, "art", "guests", "npc.webp"), quality=88)
    print("guests.json", len(data["guest"]), "guests,", len(data["wishlist"]), "wishlist,", len(data["hidden"]), "hidden,", len(blocks), "blocks; npc.webp", sheet.size)


main()
