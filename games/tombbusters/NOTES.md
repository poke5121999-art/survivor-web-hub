# Tomb Busters — asset and number sources (Drop 2, rev 20261104b)

Art (all converted by `~/tombbusters-work/build/convert.py` / `convert2.py`; source bundles are plain UnityFS):
| In game | Source mesh / texture | Where it came from |
|---|---|---|
| Bronze coffin | `DG_BronzeCoffin01A_MD`, `DG_BronzeCoffin01_D` | installed asset pack |
| Floor spikes | `DG_FloorThorns01A..D_MD`, `DG_FloorThorns01_D` | installed asset pack (`s_34/344b73f7…`) |
| Crossbow + bolt | `DG_Crossbow01A..C_MD`, `DG_Crossbow02_MD`, `DG_Crossbow01_D` | installed asset pack (`s_39/398b066e…`, `s_9e/9eac1a80…`) |
| Toad | `Mod_NPC_Toad_3_1/2_LOD1`, `Tex_NPC_Toad_3_1_NM_1_D` (part `_3_` is the 21 m tongue, left out) | publisher CDN |
| Puppet | `Mod_Npc_Pupper_Lod_1`, `Tex_Npc_Puppet_NM_D` | publisher CDN `data/npc_mesh/npc_mesh_mod_npc_puppet.ab` + `s_54/549b0bd7…` |
| Spider | `Mod_Npc_Spider_2_LOD1_1..4`, `Tex_Npc_Spider_2_{1,2,3}_NM_1_D` (tex 2 = hair cards, alpha) | publisher CDN `data/npc_mesh/npc_mesh_mod_npc_spider_2.ab` + `s_96/966b2a10…`, `s_e4/e4e569b5…` |

PLACEHOLDER (no real art/number found): wall/floor stone texture, web texture, gold-coffin tint, all speeds in m/s, player HP/speed, extraction hold, spider web slow factor.
Every number is tagged APK / WIKI / PLACEHOLDER in `js/data.js`. Wiki: https://wiki.biligame.com/chaoziran
Tests: `node test/tombbusters-run.js` (hub repo).
