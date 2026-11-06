# Quần Đảo Sao Rơi

A farming game on an archipelago you buy one island at a time, with a Pokemon
layer whose whole point is that the creatures do the farming.

Plain HTML, canvas and ES5. No engine, no build step, no dependencies, no
network calls at runtime. Open `index.html` over HTTP and it runs.

```bash
cd games/stardew
python -m http.server 8000
# http://localhost:8000/index.html
```

It must be served over HTTP, not opened as `file://` — the atlas is fetched
with `XMLHttpRequest` and a `file://` origin blocks that.

---

## What this replaced, and why

The previous build here was a Stardew Valley clone: 52 real extracted maps, a
warp table, and a load screen between the player and every shop counter. It
opened with the whole valley available. The three notes that produced this
rebuild were specific, and each one is a structural change rather than a
setting:

| The note | What changed |
|---|---|
| "vô unlock full làng làm ngợp" | The world is bought one island at a time, gated on rank and price, and only ever adjacent to land already owned. |
| "không còn vô nhà, shop, nhà văn hóa nữa — từng đảo riêng đại diện cho từng nhà" | **There are no interiors.** One 160×126 map. A shop is an island. Nothing in the game is entered. |
| "pokemon có thể giúp player làm các công việc không tốn sức" | Caught Pokemon do chores, costing **their** daily Work Points and none of the player's energy. Type decides the job. |

---

## The shape of it

### One map
`data/islands.js` lays 25 islands on a 5×5 lattice over open sea. `js/world.js`
builds the whole field on boot — every island, every shop counter, every
villager, resident at once — and gates it with collision rather than with
generation. Buying an island unblocks its tiles and carves bridges to every
neighbour already owned. Restoring a save is "replay the purchases".

What that buys: no load screens, a minimap of the real world, an NPC schedule
that is a path rather than a teleport, and "where do I buy seeds" answerable by
looking at the map.

### One button
There is no tool belt. The tile you face is outlined and the button carries the
verb: bare soil gets tilled, tilled soil planted, a planted tile watered, a ripe
crop picked, a tree chopped, a villager talked to. It is the single largest
thing that makes the game playable one-handed on a phone.

### Progression
**Island Rank** is fed by everything — harvesting, selling, fishing, mining,
catching, orders — so no single activity is the only road forward. Rank plus
gold plus adjacency decides what land is available. Twenty-five islands run from
rank 1 to rank 34.

---

## The Pokemon layer

Generation 3 arithmetic, not a nod at it. `js/poke.js` implements:

- a 32-bit **personality value** per Pokemon, which is where nature, gender and
  shininess are all read from — one field in the save instead of four
- **IVs** 0–31 per stat, **EVs** to the real 255/510 caps, the real stat formula
  with the nature multiplier applied to the floored value
- the six real **experience curves**, and evolution by level, happiness or stone
- the real **damage formula** — STAB, criticals ignoring the wrong stages, burn
  halving physical attack, the 85–100% spread — over the 17-type **Gen 3 chart**
  (no Fairy; Steel still resists Ghost and Dark)
- the real **capture maths**, four shake checks at `b/65536`, with ball and
  status multipliers

Shiny odds are the one deliberate departure: 1/8192 is authentic and, in a
farming game, indistinguishable from never. The mechanism is unchanged; the roll
gets sixteen chances instead of one, which lands it near 1/500.

151 species and 273 moves come from PokeAPI's FireRed/LeafGreen tables via
`tools/fetch_poke.py`, flattened into `data/pokedata.js` (58 KB).

### Work Points
The feature the rest of it exists for. `js/pokework.js` defines seventeen jobs;
a Pokemon qualifies by TYPE and pays with its own daily budget:

```
Nước / Băng        → tưới cả đảo
Đất / Đá / Giác Đấu → cuốc đất, đập đá
Cỏ / Côn Trùng     → thu hoạch, gieo hạt, bón phân
Siêu Linh / Điện   → gom đồ rơi, dịch chuyển
Lửa                → ủ lò (máy xong ngay)
Bay / Rồng         → bay giữa các đảo
```

Budget is 3–6 for ordinary Pokemon by base-stat total, +1/+2 for happiness, +1
for shiny, and a flat 10+ for legendaries. Island-wide jobs cost 2, big ones 3.
Points come back **on sleep**, not at midnight — tying them to the clock let a
long night in the mine buy a second day of free labour.

---

## Files

```
index.html         HUD markup, all CSS, and the boot sequence
data/
  islands.js       THE SHAPE OF THE GAME - 25 islands, unlock costs, encounter tables
  npcs.js          13 villagers: schedules, birthdays, gift tastes, dialogue
  tutorial.js      42 teaching cards and the trigger each one waits for
  pokedata.js      GENERATED - 151 species, 273 moves, the Gen 3 type chart
  gamedata.js      the original build's extracted tables: crops, fish, items,
                   machines, bundles, cooking (kept wholesale - it is good data)
js/
  atlas.js         the island sprite atlas: load, draw, nine-slice, icons
  pokeart.js       the Pokemon atlas, loaded lazily
  itemart.js       one picture per item: atlas frame, category, or generated
  world.js         the sea, the islands, ownership, bridges, mine floors
  sim.js           clock, seasons, weather, energy, inventory, skills, rank, save
  game.js          player, camera, renderer, input, the contextual action, day loop
  poke.js          Gen 3 stat/exp/damage/capture maths
  pokebattle.js    encounters and a headless turn engine
  pokework.js      Pokemon as farm labour: 17 jobs keyed on type
  mine.js          the descent: generated floors, ore, monsters, the elevator
  places.js        machines, crafting, cooking, museum, bundles, tools, shrine
  farmqol.js       the farm panel, bulk verbs, the daily order board
  npc.js           villager scheduling, pathing, talk and gifts
  ui.js            HUD and every non-Pokemon panel
  pokeui.js        party, stat sheet, battle, box, dex, the lab machines
  tutorial.js      the teaching engine
  farmlife.js      animals (kept from the previous build, re-homed onto one map)
  machines.js sprites.js fx.js audio.js events.js   (kept, world-agnostic)
tools/             asset pipeline and the headless test harness
```

---

## Tests

```bash
node tools/smoke.js .      # the whole game, headless: can it be PLAYED
node tools/uicrawl.js .    # every button in every panel: can it be TAPPED
node tools/regress.js .    # one assertion per bug that was found and fixed
node tools/check_art.js    # every atlas frame name the data asks for
```

All four must pass. They answer different questions and the second and third
exist because the first one passed while thirty-six real bugs were live.

`tools/smoke.js` boots the game against a DOM stub (`tools/harness.js`) and
drives it: a full farm cycle from tilling to harvest, buying all 24 purchasable
islands, walking to every one of them, twelve mine floors with ore and combat,
an encounter through to a capture, Pokemon labour across a six-type party,
machines overnight, the daily forage, a save/reload round trip that checks
shininess survives, and every one of the 30 panels opened and closed.

`tools/uicrawl.js` opens every panel the UI can produce, finds every element
the render actually wired a handler to, and clicks each one from a FRESH open
of its panel - because one tap can invalidate the list the next tap would have
used. It reports gold, items, party and energy deltas, so an item-duplication
bug shows up as a row where gold went UP. It found the Vault bundles paying out
for free. A scripted playthrough cannot see any of this: it never taps the
button that is wrong.

`tools/regress.js` is one assertion per bug, each with a comment saying what
the player actually saw. It is the cheapest of the four to read and the one to
add to when something new is found.

`tools/check_art.js` walks the data files and reports any atlas frame name that
is not in `art/pki/pki.json`. It exists because a missing frame is invisible
until somebody walks onto the island that uses it, and then it is a magenta box
with no clue which file named it. It has caught two real bugs already — an
over-broad filter in the packer that silently dropped two villagers, and half a
dozen frame names that were close but wrong.

A note on driving this in a real browser: `--virtual-time-budget` does not
work on this page. The game schedules repeating timers, and under virtual time
they fire back to back without the budget ever draining, so `--dump-dom` hangs
forever. That is why the crawler runs against the DOM stub instead. It is also
how the fishing minigame's abandoned animation loop was found.

`_shot.html` is a screenshot harness: it boots the game in an iframe, taps
through the tutorial, and can drive it into a given state so a headless
screenshot shows the world rather than a modal.

```bash
chrome --headless=new --window-size=460,1000 --virtual-time-budget=20000 \
  --screenshot=out.png \
  "http://localhost:8000/_shot.html?rank=40&gold=900000&buy=farm,meadow&go=meadow&panel=party"
```

---

## What the bug hunt changed

Three agents read the code against a brief of "name a concrete input that
produces a wrong result", and a fourth pass tapped every button in every panel.
Thirty-six findings, all reproduced before they were fixed. The ones worth
knowing:

- **`Sim.take` selected by NAME and walked backwards.** Quality splits one item
  into several stacks, so `give(name, qty, quality)` and `take(name, qty)` could
  operate on two different stacks. Selling the iridium row paid the iridium
  price and deleted a plain one. Five separate duplication bugs, one line.
  `takeStack(stack, qty)` and `canGive(name, quality)` close all of them.
- **Closing a battle with the X soft-locked the game permanently.** Only the
  "Xong" button called `endBattle`, so `game.battle` stayed set with no panel
  left to clear it, and `busy()` is `paused || modal > 0 || !!this.battle`.
  The stick, the clock and sleep were dead for the rest of the session.
- **Dao Xuong cost 12,000v and did nothing.** `objectVerb` had no case for
  `workshop`, so the crafting bench behind it was unreachable - the handler and
  the whole recipe list were already written and waiting.
- **Recoil healed.** `Math.max(1, total * dr / 100)` with a negative `dr` is 1,
  and it was added. Take Down and Double-Edge were strictly free.
- **Seventeen damaging moves did nothing at all** - Night Shade, Seismic Toss,
  Dragon Rage, Super Fang, the OHKOs - because a power of 0 was read as "status
  move". A Gastly caught at level 21 could not deal damage, ever.
- **The move and stat tables were modern-generation values.** PokeAPI serves
  today's numbers; its `past_values` field carries the old ones, and the fetch
  script now rolls every move back to Generation 3. Flamethrower is 95 again.
- **The four Vault bundles paid out for free**, because they carry no item list
  and `have < need` is `0 < 0`.
- **Several quiet destroyers**: a full bag deleting the crop it just harvested,
  the shipping bin silently eating the thirteenth item type of the day,
  crafting consuming the inputs and dropping the output, a placed chest thrown
  away on the next load.

`tools/regress.js` holds one assertion for each of these, with a comment saying
what the player actually saw.

---


## Art

**Placeholder, and it cannot ship.** Island sprites are extracted from a retail
Pickaxe King Island APK; Pokemon sprites are the FireRed/LeafGreen set from the
PokeAPI archive. Both are here so the game can be *played* while the real art is
drawn. `art/CREDITS.txt` says exactly what has to be replaced and gives the two
commands that replace it.
