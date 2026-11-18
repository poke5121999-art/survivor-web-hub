# Ca Trực Đêm: Biệt Đội (BooHaul) - gameplay design inventory

Purpose: let another engineer rebuild the gameplay as a 3D first-person web game.
Game = R.E.P.O.-style co-op "loot and haul" in a 2D top-down view (Unity port of a web game). Read-only survey, 2026-11-18.
Unit note: the engine works in pixels. **TILE = 24 px** (`Assets/Scripts/Port/Engine/G01_Config.cs:34`). All speeds are px/s, all ranges are in tiles or px.
Suggested 3D mapping (my suggestion, not in source): 1 tile = 1 m, so 24 px = 1 m. Player radius 7.5 px = 0.31 m.
Short paths: CFG = `D:/REPO_Meta/gamespark-config/`, ENG = `D:/REPO_Topdown/Assets/Scripts/Port/Engine/`, BRAIN = `D:/REPO_Topdown/brain/codebase/`, MEM = `C:/Users/tamph/.claude/projects/D--REPO-Meta/memory/`.

---------------------------------------------------------------------------------------------------
## 1. Core run loop

Sources: `D:/REPO_Topdown/README.md`, BRAIN/stage-5-houses.md, BRAIN/kinh-te-loot.md, BRAIN/tren-xe.md, BRAIN/be-giao-hang.md, ENG/G05_Extraction.cs, CFG/maps.json, CFG/extract_quota.json, CFG/run_timers.json.

**"Ca" = one run (a night shift)**: a chain of **5 houses** ("Ải 5 nhà", `maps.json` ai.floors = 5). One crew of up to 4 workers (crew size used by quota formula max 4).
Loop per house:
1. **Lobby (sảnh)**: pick crew (lead + bot/human mates), loadout (buy single-run gear for gold), pick mode. Meta only.
2. **Truck (xe tải)**: the crew starts each house in a truck room (a "Truck" room prefab). Team gear lies on the truck floor (`S.stash`, E to take, F to drop; no locker since 2026-10-26, MEM/truck-floor-gear.md).
3. **House**: a generated building (section 8). Floor loot is scattered. Foes sleep first (initial sleep 20-30 s, `run_timers.initialSleep`), then wake and hunt by sight/hearing/noise.
4. **Loot**: carry valuables by hand or on pushable carts/bikes to **extraction pads** (bệ giao hàng, "delivery pad").
5. **Quota + pads**: house quota `S.quotaTotal` is split equally over N pads (`per = quotaTotal / pads.Count`, G03_World_a.cs:1028). Pads open **one at a time** in order; each pad shows `value / quota`.
   Pad count = `extractRooms + 1` (the first pad is inside the truck room).
6. **Extract (3 s hold)**: when pad value >= pad quota, someone must stand on the floor button for `EXTRACT_HOLD = 3 s` (stepping off resets). Firing makes noise (`EXTRACT_NOISE_R` 30 tiles, strength 2.2: wakes the house).
   Money on the pad goes to the wallet. Surplus on a non-final pad becomes a **money bag** (loot, size by value, carry to next pad). The final pad pays everything placed on it. Downed crew heads on the pad are revived (`reviveFromPad`).
7. **Escape (final pad)**: after the last pad, "no walking home" phase: after 1 s delay foes respawn in ~1 s (instead of 45 s) and are teleported into the room next to the truck room; truck horn (4 pings over 10 s), pings, house lights dim (0.16). No new foes spawned (2026-10-26, MEM/escape-no-wave.md). Everyone returns to the truck and holds the "board" button.
8. **Service station (trạm dịch vụ)** between houses (not after house 5): spend wallet on gear/upgrades/vehicles/health packs (section 7). Then **ride room** (thùng xe): crew opens stash, drinks potions, and the truck leaves when anyone stands on the floor button XUẤT PHÁT for `rideHold` = 1.5 s (MEM/truck-ride-stop.md).
9. Next house: `S.level++` and rebuild.

**Win**: clear house 5 -> run reward (`maps.json`: first clear 1200 gold, clear 1800 gold; `run_reward.goldPerHouse` normal 300/house, cap 3000).
**Lose**:
- Quota can no longer be reached (not enough loot left, `S.shiftLost`) -> "Trượt chỉ tiêu là mất cả ca: ví, nâng cấp, đồ của đội và xe đều làm lại từ đầu" (ENG/G05_Extraction.cs:493). Go back to truck to end.
- **Crew wipe**: a worker at 0 hp goes "down" and pops a **head** (HEAD_MASS 9, r 9) that teammates carry to a pad to revive (R.E.P.O. rule). Shift is lost only if nobody is left standing (`crewWiped`, G06_Crew.cs:487).
- Revive HP = 1 (`REVIVE_HP`); crew revived in station/truck get HP they had when entering station (`reviveHp`).
- `run_timers.truckHeal`: on boarding the truck crew heal 50 (houses 1-2), 35 (3-4), 25 (5+); `patch` 25.
**Checkpoints**: server-side anti-cheat checkpoint per house (`RUN_CHECKPOINT`: HOUSE_TOO_FAST / HOUSE_SKIPPED errors, MEM/run-checkpoint.md). Endless mode saves after each house at the station (section 2). There is no in-run respawn checkpoint for solo Ải mode.

**Quota formula** (`BRAIN/kinh-te-loot.md`, G03_World_a.cs:1027):
`quotaTotal = round(sum(floor loot value0) / lootGrow * 0.7 * difficultyCurve(level) * crewMul * houseQuotaMul)`.
- `difficultyCurve`: level 1 = 0.4, 10 = 0.7, 20 = 1.0 (CFG/extract_quota.json). Houses 1..5 use levels 1/3/6/10/15.
- `crewMul = 0.4 + 0.15 * min(crew, 4)` (1 person 0.55, 4 people 1.0).
- Resulting quota/floor-loot ratio at full crew, houses 1-5: 28% / 32.7% / 39.7% / 49% / 59.5%.
- Chests, safes and foe orbs are extra money (not counted in quota).

---------------------------------------------------------------------------------------------------
## 2. Modes

Sources: CFG/modes.json, CFG/endless_rules.json, CFG/coop_rules.json, BRAIN/vo-tan.md, BRAIN/ftue.md, BRAIN/huong-dan.md, BRAIN/pvp-*.md, MEM/endless-ranked-mode.md, MEM/pvp-5v5-mode.md.

- **Solo with bots (ESSENTIAL)**: the base mode. Player + up to 3 AI crew mates (roles: loot-carrier, guard, scout, vanguard, escort, medic, decoy, hunter, support; `SqContent.cs` role descs). Bots handle foes with per-species tactics (IGNORE / RUN / SLIP / MELEE, `BOT_TACTIC`), and cast skills by rules (`SqBotCast`). Bots do not break traps other than smoke traps (MEM/only-smoke-trap-breakable.md).
- **Co-op online (ESSENTIAL, 2nd mode)**: same run with humans, host-authoritative (host runs the sim, guests send input + actions and receive snapshots; guests never simulate). Voice and text chat via Vivox/EOS (meta). "Local" co-op via WebRTC (`modes.coop.localOpen`). Build must match (`coop_rules.buildMatch = commit`). Host away grace 90 s. For a 3D rebuild: you can skip netcode first and keep authoritative-host design in mind.
- **Endless ranked ("Vô Tận", meta/progression, optional)**: houses without cap: after house 5 keep going; `hpGrowth 0.08, dmgGrowth 0.05, quotaGrowth 0.08, lootGrowth 0.08, maxMul 4`; every 2 houses +1 extra room up to 6 (`roomEvery 2, maxExtraRooms 6`); min 45 s per house (anti-cheat). Monthly season (theme of the month), leaderboard and rewards by band. Solo is open; co-op version "COMING SOON". Save/continue between houses including kit. Gold paid once at end (cap `runGoldCap 3000`).
- **PvP team match (meta / secondary)**: unlocked after 2 runs (`unlockRuns 2`). Matchmaking waits 20 s then fills with bots (`mmk.waitSec 20, teamSize 3`; older docs say 5v5, now 3v3). Two truck rooms, one team pad inside each; map = 25 rooms (2 private, 14 shared, 4/3 corridors). Pads can be robbed (loot on enemy pad is stealable/breakable). Score: money 0.01, kill 3, assist 1.5, death 1. Respawn at own pad after 5 s (user rule). Loot respawns only where a loot item was taken. Also hand-drawn arenas (`pvp_maps.json`: "nga_tu", "phao_dai" ASCII grids 35 wide). Gold: win 200 / lose 80 / kill 15.
- **Tutorial (meta, 3 cells)**: forced FTUE: cell 1 move/carry/load cart/push to pad; cell 2 fight a gnome + throw; cell 3 full loop shop -> equip -> use -> revive head -> pad -> extract -> board. Fixed map with no foes in cell 1, loot cannot break/lose value, player cannot die. Rewards: tutorialGold 3000 + gem 160 etc. (`wallet_start.json`).
- Also meta only: gacha (crew pulls), crew upgrade (10 levels, gold + shard), quests, shop packs/IAP, daily exchange, mail, ranking.

---------------------------------------------------------------------------------------------------
## 3. Player

Sources: ENG/G01_Config.cs (lines 255-345), ENG/G02_State.cs:251 (newPlayer), ENG/G03_Visibility.cs:776-830, ENG/G04_Combat.cs:186-300, CFG/stage_rules.json (noise, smartLook), BRAIN/nang-tui-xe.md, BRAIN/noi-tai.md.

**Base stats (newPlayer)**: hp 100, stamina 100, strength `str` 30, 3 hand slots (+1 per "slot" potion, up to 6), empty fist as slot -1. Crew characters override hp/atk/spd/carry (section 6).

**Movement** (`PLAYER_BASE_SPEED = 92 px/s` = 3.83 tiles/s; stick/key tiers `TIER_MUL`):
| Tier | Multiplier | Speed |
|---|---|---|
| sneak (stick low) | 0.5 | ~46 px/s (1.9 t/s) |
| walk | 0.85 | ~78 px/s (3.25 t/s) |
| run (button toggle, costs stamina) | walk x `RUN_MUL` 1.85 | ~144 px/s (6 t/s) |
- Stamina: `STAM_MAX 100`, drain 22/s while running, regen 16/s (more with "regen" upgrade). Throw costs 6 stamina. No crouch key: "sneak" is the low stick tier (quiet, slow).
- Run is faster than every foe chase speed (fastest foe chase 74*1.25 = 92); walk outruns patrol (72) and the heavy foes.
- **Carry slowdown** (hand weight in denominator): `speed = 92 / (1 + heldMass / str)` floored at `SPEED_FLOOR 0.35` x 92 = 32 px/s. Loot mass: small 8, medium 24, big 58. Turn rate also drops (`TURN_FLOOR 0.4`). Carts: wheel efficiency 3.4 (weight / 3.4), cart does not reduce light.
- Other modifiers: `slowT` x0.55, gun recoil slows, haste potion, ring speed +30% (10 s), "sprint" upgrade +20% run, Vai U (Atlas) passive halves weight penalty to 70%.
- Collision: moveEnt, AABB 2r (player r 7.5, bot 8, foe 9, loot 7/11/16), corner-slip when nearly aligned (< 19 deg), step split = half tile.

**Camera/look (top-down specifics a 3D port will drop)**: `smartLook` auto-aims toward nearest foe within 6.5 tiles; turn smoothing 0.45 (0.5 carrying). View width 14 tiles mobile, 13 PC, zoom 0.8-1.25.

**Health**: no passive regen. Heal via health packs (25/50/100 hp), Halo passive/skill, truck boarding heal, extraction revive. Seraph skill prevents down; Quake keeps carried item value when hit.

**Hands / slots / carry**:
- Two kinds of holding: (a) **held loot** (one big thing in hands, `p.held`, E to pick up / drop, use-button throws); (b) **inventory slots** (tools/guns/potions in 3 slots; number keys select, left-click uses; mouse wheel switches). While holding loot you cannot use tools (use button = throw).
- **Throw**: `v = max(130, 560 * str / (str + mass * 2.2))` px/s; damage to foes = `mass * speed * 0.022` clamped 5..200; throw makes noise 1.5 (3.5 tiles). Thrown/falling loot can break.
- **Pull beam** (tia kéo, tool "kéo đồ"): carries loot at distance, several people can co-pull, weight divided.
- **Carts / bikes**: push cart (6 slots, mini 3; `+1` per cart upgrade), cart max single-item value `CART_MAX_VALUE 20000` (more expensive items must be hand-carried), bikes: scout (fast, no cargo), haul (4 cheap items). Bike fuel only drains when hitting a wall or foe (2 each, MEM/bike-fuel-hits.md). Pushing a cart into a foe shoves it (`shoveKnock 2.2`, stun 0.8 s).
- Torch (flashlight): cone half-angle 0.62 rad, radius `CONE_R = 6.8 tiles`, peripheral glow `PERIPH_R 2.4 tiles`, line-of-sight clip `LOS_R 14 tiles`; "light" upgrade +16% per level; bot torch is 62%. Blinded (alien ink / angel) = cone 0. Torch light also kills/charges the statue angel and slows mirror ghosts (x0.42).
- **Noise meter** (`stage_rules.noise`, MEM/noise-meter.md): one unit = hearing range in tiles (foe `hear` 5 is the baseline). Footsteps = `noiseOf(p) * 5 * 0.6` (sneak quiet, run loud). Events: voice (mic level, r 2.5-8 tiles), dropping loot (r 2 tiles, str 0.8, +0.5 per size step), impact when loot loses value (r 2-7, str 1.4), throw, door break (11 tiles), gun, extraction (30 tiles). `fall 10`, `hold 0.5 s`, `max 12`. HUD bar turns red at 70% of 12 tiles. Shade passive halves noise.
- **Vents**: see section 7.

---------------------------------------------------------------------------------------------------
## 4. Loot

Sources: CFG/loot_materials.json, loot_sizes.json, loot_cap.json, loot_items.json, safes_chests.json; BRAIN/kinh-te-loot.md; ENG/G04_Combat.cs:32-40, 436-452; ENG/G01_Config.cs:284-300.

**Sizes** (CFG/loot_sizes.json): small r 7 px, mass 8, value 400-1100 | medium r 11, mass 24, value 1400-3200 | big r 16, mass 58, value 4200-9000.
`sizeForValue` splits at 1100 and 3200 (also for money bags and foe orbs).
**Materials** (CFG/loot_materials.json): `frag` multiplier, break threshold `thresh` in px/s of velocity change:
| Material | frag | thresh | shatters |
|---|---|---|---|
| hồn / soul (orbs) | 1.6 | 55 | yes, and orb **explodes** |
| gốm / ceramic | 1.0 | 95 | yes (below 12% value -> 0) |
| gỗ / wood | 0.5 | 155 | no |
| kim loại / metal | 0.18 | 260 | no |
**Break damage** (`damageLoot`, G04_Combat.cs:32): input is a velocity change (impulse = `|v_before - v_after|` on wall hit, = stopping suddenly; dragging along a wall is free).
`thresh_eff = thresh * (1 + 0.25 * gripLevel)` while held. If `impulse <= thresh_eff` nothing.
`loss = value0 * frag * 0.35 * DMG_MULT(1.0) * (impulse - thresh) / thresh`. Loss is taken from `value` (never below 0); shatter materials with < 12% left become 0.
Grace/invulnerable: 1.0 s after pickup (`GRACE_AFTER_PICKUP`), 0.8 s after a hit (`INVULN_AFTER_HIT`), 3 s after spawn. Items get a red shake for 0.35 s.
Other damage sources: explosions `420 * pow * (1 - d/r)`; grenade pow 1 = 340 vs foe, 55 vs player, 420 vs loot; sledgehammer shockwave cracks loot (2.2 * thresh) and pops orbs; trap items: spike 3%/tick, laser 2%, fire 1.5%, ice 5% (of original value, x frag); poison/mud/smoke do not damage loot; items already on a pad are immune to traps; a foe hit while you carry (`foeHitsCarriedItem`, brat throw) damages the carried item (Quake passive removes).
Items on the truck/cart are protected from wall hits but not from explosions or foe hits (`xeNoMul 1`, `cartFoeHitMul 1`).
**Value per house**: floor loot scaled by `giaTriMul` (1.0 in all 5 themes) and by endless growth. Loot cap per house number 1-5 (`loot_cap.json`): total value 46,000 / 56,947 / 73,368 / 95,263 / 122,632; item count 14 / 18 / 23 / 31 / 41; bigs 2/3/5/7/9; mediums 5/7/9/13/18; size split small 45%, medium 37% (0.45-0.82), large 18%.
**Items**: 209 loot items in `loot_items.json`, each = theme set + size + slot + price range + placement (`Anywhere / OnlyGround / OnlyTable`). Counts: vampire 56, vietnam 48, pyramid 39, spacestation 36, asylum 30. Ids look like `vampire/Mon_<size>_<key>_<slot>`; slot order sets a sub-range of the size range (e.g. asylum small slot 0: 400-500, slot 9: 1000-1500).
**Chests/safes** (`safes_chests.json`): chest from house level >= 2 (1-3 per house), 2-3 items, 30% mimic. Safe chance by house 20/30/35/40/45%, 6-7 items (needs a key; keys are never destroyed). Chest/safe values ignore house multiplier (same value at house 1 and 5).
**Foe orbs**: killed foes drop an orb (loot of material "soul", threshold 55, explodes when broken): value `round((hp*9 + dmg*60)/50)*50`, clamped to size range of `orbCo`. Max 3 orbs per foe lifetime. `noLoot`: gnome, bomb kid, ghost, wall hand.
**Restock**: if the sum of loot falls below quota, extra loot may respawn (RESTOCK_MARGIN 1.12; one item per 1.5 s) so a house is never unwinnable by accident.
**Orbs/loot labels**: value shown on the item only when lit/seen; pad tags show total.

---------------------------------------------------------------------------------------------------
## 5. Foes

Sources: CFG/foes.json (hp, dmg, cd, speed, pack), ENG/G02_Monsters.cs (sight/hear), ENG/G10_FoeKinds.cs (sight/hear/wiki texts), BRAIN/foe-kinds.md, BRAIN/foe-*.md plans/01-ai-5-nha/phase-07..11, ENG/G05_Mirror.cs, ENG/G07_Angel.cs, MEM/foe-friendly-fire.md, MEM/mimic-chest-art.md.
Stats: hp, dmg per hit, cd (s between attacks), speed (px/s), sight/hear in tiles. Per-house multipliers: hp x1.0/1.2/1.5/1.7/2.0 and dmg x1/1/1.1/1.2/1.35 (houses 1-5, `stage_theme_houses`). `foeDmgPerLevel 0.05`, foe respawn 45 s (1 s during escape). Chase speed = speed x 1.25.
Bosses: no respawn, stun only from sledgehammer / tranq gun / stun grenade, capped 1.2 s with 4 s immunity, little knockback.
| Foe (id) | HP | Dmg | cd | Speed | Sight/Hear | Behaviour / special |
|---|---|---|---|---|---|---|
| gunner (Kẻ bắn) | 110 | 22 | 0.9 | 58 | 9/0 | Ranged: stops, draws a red line, then fires; keeps 6 tiles, shoots from <= 9 tiles, only retreats; wall blocks bullets. Hit by 2 pistol shots |
| rook (Kẻ húc) | 160 | 26 | 1.2 | 54 | 9/0 | Locks a line, stomps 3 times, charges straight and cannot steer; sidestep or hide behind wall; since 11-17 still charges to last seen spot; hurts other foes (friendlyFireMul 1) |
| banger (Bom con) | 50 | 0 | 0.9 | 54 | 6/4.5 | Packs of 4; lights a fuse on sight, cannot be defused (killing it still explodes, weaker); kill it far from loot |
| gnome | 20 | 5 | 0.7 | 76 | 7/5 | Packs of 3; machete cuts the item you carry (9x damage to goods); faster than you; 2 hits kill |
| mimic (Rương răng) | 70 | 18 | 0.75 | 82 | 8/7 | Only comes from opened chests (30% of chests); looks like a chest; bites (12-frame animation); faster than walk, slower than run |
| ghost (Hồn ma) | 999 | 14 | 1.4 | 20 | 14/0 | Passes through walls, immune to all damage (only skills stun it; shock prod also), loses track when you are far; keep moving |
| wallhand (Bàn tay quỷ) | 999 | 6 | 1.5 | 0 | 0/0 | Hides in a wall, grabs anyone passing; victim cannot move/use skill/items; mash left/right alternately to break free; hand relocates 15 s later |
| mummy (Xác ướp) | 240 | 18 | 1.3 | 34 | 9/3 | Slow tank; throws a cloth tether: hits person -> pulls them to it, hits wall -> it swings to the wall; line breaks if it is stunned; drops a big orb |
| brat (Gấu mèo ranh) | 50 | 0 | 1 | 96 | 8/6 | Steals the nearest loot (even from your hands), runs away to catch breath, then throws it at you (damage + item loses value up to 500); 4 hits to drop it; flees if empty-handed near you |
| headthrower (Kẻ ném đầu) | 60 | 0 | 1 | 50 | 9/3 | Throws a blue-fire head that bounces to you and explodes, leaving toxic gas (2 dps for 3 s); you can pick up the head and throw it back (hurts other foes, not owner) |
| minelayer (Kẻ gài mìn) | 50 | 0 | 1 | 64 | 6/5 | Afraid of players; wanders and plants mines (anyone but it triggers) |
| impostor (Kẻ giả mạo) | 70 | 16 | 0.9 | 90 | 9/5 | Looks like a crew member walking around; reveals and attacks when you are close; medium orb |
| gacha (Quái gacha) | 50 | 0 | 1 | 66 | 9/5 | Unicycle clown; grabs a player, spins a wheel (miss/partial heal/full heal/lose hp/instant knockdown); 4 hits make it release |
| hunter (Kẻ truy lùng) | 360 | 32 | 1 | 24 | 0/0 | Picks one crew member and always knows where they are (through walls); slow; two fists hover then slam (red circle warns), big knockback; big orb |
| angel (statue, no hp) | - | 30 (of 100) | - | teleports | - | Appears every 30-60 s in front of someone: aim the torch at it for 5 s to fill (drains 6 s); filled = it flies away and leaves light 30 s (r 7 tiles); otherwise after 6 s it blinks next to you and swipes 30 dmg, then 6 s of no torch + heavy legs. Bots hold it 15 s total |
| mirror (Gương) | 84 per mirror | - | - | 58 | - | Paired mirrors (A -> B): a ghost emerges after 2 s and walks to the nearest standing player (slower the farther from mirror, x0.32 min), x0.42 under torch; grabs within 20 px and drags you through the other mirror; 2 pistol shots or torch break it |
| vampire (boss) | 450 | 12 | 1 | 0 (teleports) | 0/0 | Phases: hidden 5 s -> bats scatter -> reappear 3-3.8 tiles from a player -> red ring (4.6 tiles) -> grab/drain 2.2 s (heals what it drains) -> throw (extra damage on wall) -> vanish |
| nurse (boss) | 160 | 12 | 1 | 56 (42 in code) | 9/5 | Screams on sight: all foes nearby run to her; throws a tranquillizer syringe (pink line telegraph) -> limp/slow; keeps distance |
| joker (boss) | 150 | 20 | 1 | 60 | 9/5 | Rushes to anyone who touches a trap (rush x2.2, max 10 s); lays fake loot with price tags that explode in a clown box when picked up; chases and melees |
| alien (boss) | 420 | 22 | 1 | 58 | 9/5 | Shoots ink (purple line) -> screen blinded with black ink for a few seconds; chases at normal speed |
| pharaoh (boss) | 520 | 30 | 1.6 | 20 | 9/3 | Marks a player with a lock shadow, drops a bone cage if you stay; break the cage (longxuong 66 hp) or be hit when it raises its staff; slow |
Boss per theme: vampire castle -> vampire, pyramid -> pharaoh, vietnam -> joker, spacestation -> alien, asylum -> nurse; present from house 3 (`bossFromHouse 3`; text says 4-5 in older notes). One boss per house, outside the normal roster.
Own foes per theme (`stage_houses.ownFoes`): vampire brat, pyramid ghost, vietnam headthrower, spacestation mummy, asylum wallhand. Shared roster by house position (`stage_theme_houses`, identical for all 5 themes):
- House 1: banger, brat; 3 foes, 2 kinds. House 2: banger, gnome, minelayer, ghost; 5 foes, 3 kinds. House 3: rook, gnome, headthrower, wallhand, gacha, banger, angel; 7 foes, 4 kinds. House 4: rook, gunner, mummy, impostor, hunter, brat, gnome, angel; 7 foes, 5 kinds. House 5: + mirror; 11 foes, 6 kinds. Angel and mirror always present when in the list, not counted in `kindCount`.
**Detection model**: sight cone + hearing radius (tiles) + noise events (section 3). `foeQuiet` foes (disguised/hiding) do not trigger heartbeat/chase music. Heartbeat/dread when a foe is within 10 tiles (`DREAD_R`); hear footsteps 7 tiles, breath 3.2 tiles.
**Friendly fire**: since 2026-11-17 foe bullets, melee swings, bombs and rook charges hurt other foes (`stage_rules.foe.friendlyFireMul 1`).
**Knockback/hit**: plain punch knock 106.67 px/s (`plainHitKnock`). Light foes (knockMul 3) can be flung 3000 px/s by torch whacks.

---------------------------------------------------------------------------------------------------
## 6. Crew (14 characters)

Sources: CFG/crew.json, CFG/passives.json, CFG/tactics.json, CFG/upgrade.json, `D:/REPO_Topdown/Assets/Scripts/Port/Squad/SqContent.cs:134-260`, BRAIN/noi-tai.md. Names are English names in data; Vietnamese epithet in game.
Stats: star, hp, atk, speed multiplier (spd), carry (maps to strength), grit (damage reduction), melee reach `atkR` (tiles), `atkCd` (s). Skill cd/duration/radius (tiles). Passive unlocks at level 10 of 10 (`passiveAtLevel 10`); skill cooldown -10% at level 5. Upgrade cost 200..2000 gold + 1 shard per level, growth per level e.g. hp +3.6..5.7, atk +0.27..0.68.
| id | Name | * | hp | atk | spd | carry | grit | Passive | Active skill |
|---|---|---|---|---|---|---|---|---|---|
| bao | Flare | 3 | 105 | 9 | 1.00 | 32 | 0 | Quen Đường: explored area brighter +40% | flash: foes within 5.5 tiles freeze 3 s and forget target (cd 16) |
| hue | Halo | 3 | 120 | 7 | 0.97 | 28 | .05 | Băng Gạc: allies in 1.5 tiles heal 1 hp/s | healring: ring heals 9 hp/s for 6 s, r 4.2 (cd 20) |
| tam | Atlas | 3 | 135 | 8 | 0.94 | 46 | .10 | Vai U: heavy items cost 70% speed penalty | gong: 8 s, no weight penalty and +30% run (cd 18) |
| ky | Pick | 3 | 100 | 10 | 1.02 | 30 | 0 | Tay Nghề: jammed doors pried 2x faster | unlock: open all locked doors within 9 tiles, cleanse and heal 15 allies (cd 22) |
| linh | Shade | 4 | 96 | 12 | 1.08 | 30 | 0 | Chân Mèo: noise halved | vanish: invisible/unheard 6 s (cd 24) |
| dung | Quake | 4 | 150 | 16 | 0.95 | 40 | .14 | Lì Đòn: carried item keeps value when foes hit you | shock: radius 3.5 tiles, 40 dmg, stun 1.5 s (cd 22) |
| mai | Lure | 4 | 104 | 11 | 1.05 | 30 | 0 | Tai Thính: minimap shows foes within 8 tiles | decoy: thrown noisy box pulls foes within 16 tiles for 9 s (cd 19) |
| phuc | Hook | 4 | 128 | 10 | 1.02 | 34 | .08 | Kéo Lê: standing on a pad revives 2x faster | rescue: hook pulls a downed ally within 9 tiles and lifts one (cd 26) |
| son | Barb | 4 | 140 | 9 | 0.96 | 36 | .16 | Chắn: allies within 2 tiles take 8% less damage | cage: four shields around you block foes 9 s (cd 21) |
| nga | Blink | 5 | 112 | 18 | 1.12 | 34 | .05 | Bước Hụt: invulnerable 3.5 s after blink | blink: teleport 6.5 tiles through walls + decoy clone (cd 12) |
| khoi | Oracle | 5 | 108 | 15 | 1.04 | 32 | .05 | Đo Đạc: whole crew sees 15% further | reveal: show all loot, foes and pads for 12 s, torch x1.5 (cd 25) |
| van | Frost | 5 | 116 | 17 | 1.03 | 32 | .06 | Hơi Lạnh: foes you hit slow 25% for 2 s | freeze: all foes within 8 tiles frozen 4.5 s, +50% damage on them (cd 23) |
| hai | Magnet | 5 | 110 | 14 | 1.02 | 44 | .05 | Hút Nhẹ: small items within 2 tiles fly into empty hand | pull: yank up to 2 nearest dropped items within 5 tiles into one gold bag (cd 35) |
| tuyet | Seraph | 5 | 125 | 16 | 1.05 | 34 | .10 | Rọi Sáng: allies within 3 tiles survive lethal hit with 1 hp (30 s each) | angel: revive all downed + whole crew cannot go down for 5 s (cd 30) |
Note: balance numbers for crew live in prefabs `Resources/World/Crew/<id>.prefab` over `SqContent` (a Quake nerf had to be applied in both). Starting crew: bao only (`wallet_start.crew`). Melee: bare fists with `atk`; weapons replace it.
**Mate tactics** (AI roles, `tactics.json`): loot (+15% carry), thu (guard), soi (scout +30% eye), baoke (vanguard), cuuho (medic), nhu (decoy), san (hunter +22% atk), tiepte (support, cd -15%).

---------------------------------------------------------------------------------------------------
## 7. Items, gear, traps, stations, doors

Sources: CFG/station_*.json, loadout.json, ENG/G02_Shop.cs:61-200, BRAIN/bom.md, BRAIN/vu-khi-can-chien.md, BRAIN/tram-prefab.md, BRAIN/bay-lo-dien.md (traps), BRAIN/stage-5-houses.md, MEM/truck-charger.md, teleport-pads.md, vents.md, jammed-doors-new-layout.md.
**Service station** (`station_rules`): slots upgrade 3 + gear 5 + vehicle 2 per visit (random stock, `stock` = max quantity); `upgradePriceGrowth 1.6` per purchase; pay by standing on the pay pad for 3 s (`payCountdown`). Prices in-run gold ("$").
**Gear prices** (price / uses per house, `station_gear.json`): gun 9000/20 ammo, tranq 12000/3, bomb 7000/2, stun grenade 5500/2, shockwave (xung) 9000/2, cluster (chum) 16000/1, mine 8000/2, pry bar 5000/3, shotgun 26000/6, laser 22000/5, bat 8000/12, pan 6000/18, sledge 14000/8, machete 10000/20, prodzap 12000/10, inflatable hammer 3000/20, rings (carry 14000, speed 13000, power 16000, guard 15000; 7 uses), battery 6000 (unlimited stock), tele-send 15000, tele-call 18000. Ammo/uses refill at each new house (`napDanLai`).
Gear effects: pistol 62 dmg/shot, straight line; tranq sleeps a foe 12 s (ghost immune); stun grenade sleeps foes in radius 6 s (bosses less), no loot damage; xung blows people/foes, wall hit dmg `(v - 260) * 0.06`; cluster = main + three child bombs; mine arms in 2 s and hurts everyone; pry bar opens a jammed door; shotgun 7 pellets cone with recoil; laser charge-and-release (x4 when full); melee weapons see ENG/G14_Weapon.cs (sledge: hold half beat, 70 dmg, cracks loot, bursts orbs; prodzap stuns 3 s but only slows big foes and can stun ghosts; machete 3rd hit within 1.5 s x1.6; pan reflects bullets for 0.25 s after swing; bat bounces thrown objects). Rings last 8-12 s: carry (item weightless 12 s), speed +30% 10 s, power x1.5 8 s, guard (no item damage) 9 s.
**Health packs**: 25 hp 1800, 50 hp 4000, 100 hp 9000.
**Upgrade potions** (price at base, drunk by one person; max 3 spawns each per run `upgradeMaxSpawns`): hp +20 max 6000, stamina +10 2000, strength +10 6000, reach 6000, sprint +20% 6000, rush (burst after 1 s run) 12000, push 4500, regen 3000, light 5000, grip +25% break threshold 7000, bag slot +1 8000, cart +1 slot 7000.
**Vehicles**: scout bike 28000, haul bike 32000, extra cart 14000 (stock 2), mini cart 7000 (stock 2). Park next to the truck each house.
**Truck charger** (`station_rules.charger`): start energy 2, 3 per battery, charge rate 0.5, bike cost 1. Pad half the size of a delivery pad with 6 notches; recharges gun ammo, weapon uses, rings, bike fuel mid-house; arc zaps items being charged (MEM/truck-charger.md). Energy unlimited, battery restocks immediately.
**Teleport pads** (`station_rules.teleport`): cooldown 60 s, hold button 3 s, offer chance 0.35 in stock rolls, land >= 20 tiles from truck and pad (one of the farthest third), foe-clear 3 tiles; "send" = random far spot, "call" = hold-button user chooses a mate; drops cart and held items; warp effect locks movement (MEM/teleport-pads.md).
**Vents** (`stage_rules.vent`): 4 pairs per house (count 4), fixed pairing 2k <-> 2k+1; open lid 0.35 s, enter 0.35 s, crawl takes 12-18 s (crawlSec 12 = seconds for 10 tiles; pipe length scales with distance 0.6-14 s base), player controls crawl with forward/back; no torch inside; foes cannot use vents; disabled in village theme (Vietnam), PvP, tutorial, station; you drop pulled loot before entering.
**Doors**: two-leaf swing doors open when someone approaches; connectors are 3 tiles wide; door reach 1 tile, break noise 11 tiles. **Jammed doors**: some doors are locked/jammed; sealed floor capped at 30% (`doorSealMax 0.3`); open with pry bar (range 2.2 tiles), Pick's skill, sledge, or break; one-line hint text. Carts must always reach every pad (rule enforced at generation).
**Traps** (placed by designers as `TrapPoint` in room prefabs, 8 kinds; only smoke trap can be switched off by hitting the vent hole): spike (cycles sleep -> warn -> strike, 3%/tick loot damage), laser (beam, 2%), fire jet (beam range 4-6 tiles, `FIRE_DMG 7`, 1.5%), gas jet (range 5-7, poison 2 dps for 3 s), ice (`BANG_DMG 5`, freeze 1 s, slow, 5% loot), poison puddle, mud (slows), smoke (blinds, room-wide; turns on when someone enters). Traps are loud when they hit someone; they cycle by time (phase from coordinates, same for guests). Joker rushes traps' victims.
**Bombs**: shared type `Bomb`, pow 1 = 340 foe / 55 player / 420 loot; fuse 1.4 s for grenade; used by banger, orb break, mine, pumpkin head, inflatable hammer.
**Minimap device**: handheld olive device top-right, fog-of-war shared by crew (a mate seeing a room reveals it), unknown rooms show "?", loot as bars, dotted path, pads as squares (after crew entered the pad room).
**Bot gear/AI details**: see `stage_rules.bot` (many knobs, not needed for first port).

---------------------------------------------------------------------------------------------------
## 8. Map generation

Sources: BRAIN/bo-cuc-khoi.md, BRAIN/stage-5-houses.md, BRAIN/repo-level-gen.md, BRAIN/pool-phong-theo-theme.md, BRAIN/phong-theme-vs-kieu-phong.md, BRAIN/world-prefabs.md, CFG/stage_theme_houses.json, stage_houses.json, README.md "Prefab thế giới".
- **Old module**: shared room template **21 x 15 tiles** (`RoomTemplate`, 10 shared templates `Rooms/_chung/00_..09_`), grid 3x3 with all edges open. Only used for outside-run (web/tutorial/test).
- **Current (since 2026-09-17, "R.E.P.O.-style")**: every in-run house is built by `HouseGen` from **room prefabs at real size** (hand-built by designers/tilemap), joined by 3-tile-wide connectors ("DoorConnector"); no fixed grid. Rooms are blocks placed outward; doors sit on the longest 3-tile edge of each room face. Result is a TREE (one entrance per room) plus locked-door seals for detours. House size example: 168 x 150 tiles with ~24 blocks (126 x 90 for old grid of 30 rooms; bounded 8x11 module area = 4096 px texture limit in the 2D renderer).
- **Room kinds**: Truck (start + first pad), Extract (pad rooms; special extract larger), PrivateLoot (1 per house), SharedLoot (the main rooms), Corridor (short/long: long picks layer 1 or 2), Ride (truck cab for the ride stop), Station (service). Folders per theme: `Rooms/<theme>` (10 rooms each: vampire, pyramid, vietnam, spacestation, asylum), `_extract_<theme>`, `_truck_<theme>`, `_ride`. Crypt room only in pyramid.
- **Number of rooms per house position** (identical for all themes, CFG/stage_theme_houses.json): total rooms = 1 truck + extractRooms + privateRooms + sharedRooms.
| House | level | extract | private | shared | short corr | long corr | special extract | medium loot ratio | large loot ratio |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | 0 | 1 | 3 | 0 | 0 | no | 0 | 0 |
| 2 | 3 | 1 | 1 | 4 | 1 | 1 | no | 0.25 | 0 |
| 3 | 6 | 2 | 1 | 6 | 2 | 2 | yes | 0.30 | 0.10 |
| 4 | 10 | 2 | 1 | 9 | 3 | 2 | yes | 0.30 | 0.15 |
| 5 | 15 | 3 | 1 | 11 | 4 | 2 | yes | 0.30 | 0.15 |
  Pads = extract + 1: house 1 has exactly 1 pad (in truck room), 2 pads at house 2, 3 at houses 3-4, 4 at house 5. Each corridor leads to a shared loot room. The generator must hit these counts exactly (8 seed retries then error).
- **Themes** (`stage_houses.json`, order is shuffled per run seed so each run sees all five in random order; difficulty follows the position, not the theme): 1 Lâu đài vampire (houseStyle 17), 2 Kim tự tháp Ai Cập (18, with crypts), 3 Việt Nam (19, village, no vents, yards), 4 Trạm vũ trụ (20), 5 Bệnh viện bỏ hoang (21, asylum). Each theme has its own floors/walls, loot set (section 4), `materials` weights [ceramic, wood, metal]-style triple (vampire 1/3/1, pyramid 3/1/1, vietnam 1/1/3, spacestation 1/2/1, asylum 2/1/2), own room pool and boss.
- **Traps/decor/lights**: designers place traps/decor; props block paths (`blocksPath`) or decorate; decor lights glow only where the torch cone hits (`decor_lights.json`, fade in 0.15 s, out 0.5 s); one-leaf decor doors open when someone approaches.
- **Pad placement**: the first pad is in the truck room; others in extract rooms where a cart can reach; min pad spacing 3 (`minPadSpacing`). Door: rooms keep a loot list `Point_L_Loot` ("💰") and foe spots `Point_M_Foe` ("💀") from the prefab.
- Seeds: house build is deterministic from `runSeed` + house index (co-op guests rebuild the same house). Side streams (traps, vents, foes) use separate seeded streams so layouts do not shift.
- PvP map uses 25 rooms with two trucks; arena maps in `pvp_maps.json` are 35-wide ASCII grids (# wall, . floor, M foe spawn, b block, m mid, o small prop, t tall prop, P pad).

---------------------------------------------------------------------------------------------------
## 9. Numbers table (for a 3D port to match)

| Quantity | Value | Source |
|---|---|---|
| Tile | 24 px (suggest 1 m) | G01_Config.cs:34 |
| Player radius / foe radius / bot | 7.5 / 9 / 8 px | BRAIN/va-cham.md |
| Base / walk / sneak / run speed | 92 / 78 / 46 / ~144 px/s | G01_Config.cs |
| Stamina | 100, drain 22/s, regen 16/s | G01_Config.cs:327 |
| Player HP | 100 (crew 96-150) | G02_State.cs:251 |
| Hand slots | 3 (+1 each potion, max 6) | G02_Hand.cs |
| Carry slow | 92 / (1 + mass/str), floor 0.35 | G03_Visibility.cs:793 |
| Loot mass | 8 / 24 / 58 | loot_sizes.json |
| Throw speed | max(130, 560 * str/(str + 2.2 * mass)) px/s | G04_Combat.cs:186-231 |
| Break thresholds (px/s of delta-v) | soul 55, ceramic 95, wood 155, metal 260 | loot_materials.json |
| Damage scale | 0.35, DMG_MULT 1.0 | G01_Config.cs:285 |
| Torch cone | radius 6.8 tiles, half-angle 0.62 rad | G01_Config.cs:278-279 |
| Line of sight radius | 14 tiles | G01_Config.cs:277 |
| Extract hold | 3 s | G01_Config / extract_quota |
| Truck depart hold | 1.5 s | run_timers.rideHold |
| Quota factor | 0.7 * curve(0.4 .. 0.7 .. 1.0) * crewMul(0.4 + 0.15n) | extract_quota.json |
| Crew size for quota | max 4 | extract_quota.json |
| Foe initial sleep | 20-30 s (some chance to skip 0.2) | run_timers.json |
| Foe respawn | 45 s (1 s while escaping) | run_timers.json |
| Escape horn | 4 pings over 10 s, range 30 tiles, ping 15 tiles | G05_Extraction.cs:170-183 |
| Truck heal | 50 / 35 / 25 (houses 1-2 / 3-4 / 5) | run_timers.truckHeal |
| Revive HP | 1 | G06_Crew.cs:167 |
| Head mass / radius | 9 / 9 | G06_Crew.cs:165 |
| Gold per house / cap | 300 / 3000 per run (normal) | run_reward.json |
| Start wallet | 5000 gold, 3 X-tickets, crew bao | wallet_start.json |
| Door connector width | 3 tiles | BRAIN/bo-cuc-khoi.md |
| Cart clearance corridor | 3 tiles | RoomCheck.CART_CLEARANCE |
| Hearing: footstep audible 7 tiles, breath 3.2, dread 10 | G01_Feel.cs | |
| Audio | refR 2.5, maxR 20 tiles, pan max 0.7 | stage_rules.audio |
| Voice | refR 3, maxR 24 tiles, 4 Hz | stage_rules.voice |
| Foe stuck | 2.5 s without moving 10 px -> reroute | stage_rules.foe |
| Angel visit | every 30-60 s, charge 5 s, drain 6 s, patience 6 s, dmg 30 | G07_Angel.cs |
| Trap damage | fire 7 per tick, ice 5, poison 2/s | G04_Combat.cs:969-974 |
| Noise events | footstep, voice, drop, impact, throw, door break (11 tiles), extraction (30) | stage_rules.noise |
| Mirror | 2.0 s emerge, speed 58, hp 84 | G05_Mirror.cs |
| Loot per house (value) | 46k / 57k / 73k / 95k / 123k | loot_cap.json |

---------------------------------------------------------------------------------------------------
## 10. Open questions / not confirmed

1. **Foe sight/hear override**: table values in code (sight/hear in tiles) may be overridden by prefabs `Assets/Resources/World/Foes/*.prefab` and by DEV `md_foes` fields (`sight`, `hear`, `wind`, `skill.*`); `foes.json` in REPO_Meta does not list them. Read from code only.
2. **Foe attack timing details** (wind-up `FOE_WIND 0.45`, bullet speed, charge distance, hunter slam delay, nurse needle numbers, vampire phase times) are in `G10_FoeKinds_*.cs` consts, not read. Nurse speed: table 56, code 42 (reduced 2026-10-30), joker/alien/pharaoh from `FOE_KINDS`.
3. **Boss start house**: config says `bossFromHouse 3`; older notes say houses 4-5. Config is newer (2026-11-03 table split).
4. **Player max in co-op**: quota uses crew 4; endless co-op `maxCoopPlayers 5` and soak tests used 5 seats; normal co-op room size not confirmed (assume 4-5).
5. **Per-room templates**: I did not enumerate the 10 shared rooms per theme or their sizes; only "21x15" for the old module, and real prefabs can be any size. House total size only measured on 2D px (168x150 tiles for 24 blocks).
6. **Gear stats not read**: pistol/tranq/laser exact damage, shotgun pellet damage, melee MeleeDef table values (`G14_Weapon.cs` `MELEE`), bike speed numbers, cart mass; see those files.
7. **Statue ("Tượng")** referenced as an event separate from the angel in the wiki (`SU_KIEN`); only the angel mechanics were confirmed. Decide if the "statue" == angel (comments call it "pho tượng").
8. **Gacha / meta economy**: gacha rates, banners, quests, ranks and IAP are meta and were not summarised (`CFG/gacha_*.json`, `quests.json`, `rank_rewards.json`).
9. **Crew derived stats**: how `carry` maps to `str` and how `spd` combines with `PLAYER_BASE_SPEED` for non-lead crew was not traced (statsOf in `Squad`).
10. **Co-op relay/network**: design assumptions (host authoritative, 20 intents/s, snapshot v46) are in `coop_rules.json` + `BRAIN/coop-*.md`; irrelevant for a single-player first port.
11. **Perspective impact**: many mechanics rely on top-down view (smart auto-aim, torch cone geometry, minimap fog, red telegraph lines, joystick tiers, "head" popping out). A first-person port needs decisions for aiming, telegraphs and the stealth model (noise vs sight) that this inventory does not make.
12. **Vietnamese-only strings**: toasts/wiki texts quoted here are paraphrased from Vietnamese source; some player-text words are deliberately soft ("gục", "hạ", "nhân vật", not "chết/giết/xác", MEM/gentle-words.md).
