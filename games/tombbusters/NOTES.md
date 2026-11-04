# Tomb Busters — asset and number sources (Drop 3, rev 20261104c)

Art (all converted by `~/tombbusters-work/build/convert.py` / `convert2.py`; source bundles are plain UnityFS):
| In game | Source mesh / texture | Where it came from |
|---|---|---|
| Bronze coffin | `DG_BronzeCoffin01A_MD`, `DG_BronzeCoffin01_D` | installed asset pack |
| Floor spikes | `DG_FloorThorns01A..D_MD`, `DG_FloorThorns01_D` | installed asset pack (`s_34/344b73f7…`) |
| Crossbow + bolt | `DG_Crossbow01A..C_MD`, `DG_Crossbow02_MD`, `DG_Crossbow01_D` | installed asset pack (`s_39/398b066e…`, `s_9e/9eac1a80…`) |
| Toad | `Mod_NPC_Toad_3_1/2_LOD1`, `Tex_NPC_Toad_3_1_NM_1_D` (part `_3_` is the 21 m tongue, left out) | publisher CDN |
| Puppet | `Mod_Npc_Pupper_Lod_1`, `Tex_Npc_Puppet_NM_D` | publisher CDN `data/npc_mesh/npc_mesh_mod_npc_puppet.ab` + `s_54/549b0bd7…` |
| Spider | `Mod_Npc_Spider_2_LOD1_1..4`, `Tex_Npc_Spider_2_{1,2,3}_NM_1_D` (tex 2 = hair cards, alpha) | publisher CDN `data/npc_mesh/npc_mesh_mod_npc_spider_2.ab` + `s_96/966b2a10…`, `s_e4/e4e569b5…` |
| Catfish (Mawfin) | `Mod_Npc_Catfish_2_LOD1` + `_1_LOD1`, `Tex_Npc_Catfish_D` (z-up mesh, rotated) | publisher CDN `data/npc_mesh/npc_mesh_mod_npc_catfish.ab` + `s_10/105faccc…`, `s_11/113fe076…` |
| Bear (Grizzle) | `Mod_Npc_Bear_LOD1`, `Tex_Npc_Bear_1_D` (z-up, rotated) | publisher CDN `data/npc_mesh/npc_mesh_mod_npc_bear.ab` + `s_f0/f0826821…` |
| Door (real or false) | `DG_Door02A/B/C_MD`, `DG_Door02_D` | installed asset pack (`s_3c`, `s_08`, `s_45`) |

Drop 3 numbers: shop prices, durability, repair costs (Shovel 5,000 / Flashlight 2,000 + repair 11 / Gourd 2,000 + repair 50 / Stun Gun 40,000 + repair 230 / Moujin Charm 4,000), shovel damage 34, gourd sell values (toad 4,000, spider 2,700, catfish 3,000, bear 3,000, puppet 5,000), Catfish 120 HP/40 dmg, Bear 150 HP/shot 50/kick 80, False Door 55 dmg: all from the wiki (https://wiki.biligame.com/chaoziran, pages 铲子 电击枪 摸金符 葫芦 激光笔 巨鲶 大熊 机关). Bestiary ratings and text: `BestiaryInfoConfig` + `tr_English.json`.
Not in the data: gourd capture odds (structure is wiki, numbers PLACEHOLDER), stun/gourd ranges, charm HP restore, catfish acceleration, bear reload, door struggle rules, mercy flashlight 30 s.

PLACEHOLDER (no real art/number found): wall/floor stone texture, web texture, gold-coffin tint, all speeds in m/s, player HP/speed, extraction hold, spider web slow factor.
Every number is tagged APK / WIKI / PLACEHOLDER in `js/data.js`. Wiki: https://wiki.biligame.com/chaoziran
Tests: `node test/tombbusters-run.js` (hub repo).
