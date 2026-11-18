# R.E.P.O. mechanics reference (for an ORIGINAL three.js clone)

Legend: [W] = stated by the wiki page named in the line (read 2026-11-18).
[G] = guess or recollection, NOT confirmed by a page I read. Verify before relying on it.
Do not copy names, art or levels. Use the numbers as design targets only.

Sources actually read (rendered text):
- VAL  https://repo-2025horror.fandom.com/wiki/Valuables  (cites v0.3.2 source: ValuableDirector.SetupHost, RoundDirector.StartRound)
- MON  https://repo-2025horror.fandom.com/wiki/Monsters
- UPG  https://repo-2025horror.fandom.com/wiki/Upgrades
- SEMI https://repo-2025horror.fandom.com/wiki/Semibot
- EXT  https://repo-2025horror.fandom.com/wiki/Extraction_Point
- SVC  https://repo-2025horror.fandom.com/wiki/Service_Station
- DOT  https://dotesports.com/indies/news/how-to-extract-in-r-e-p-o
- FAN  https://www.fantime-horror.com/repo/items/upgrades/  (upgrade table; some numbers differ from UPG)
- Also seen in search snippets only: https://www.exitlag.com/blog/r-e-p-o-monsters/ (says Steam page lists 29 enemies)

NOT obtained (fandom pages for Cart, per-monster pages, level pages, Tutorial, Updates returned errors or timed out):
exact grab-beam numbers, the impact-to-value-loss formula, base stamina, per-level pages, patch notes.
Those sections are marked [G] or "unknown".

---------------------------------------------------------------------
## 1. Physics grab beam
- [W SEMI] Right arm has a built-in tractor beam that picks up, rotates and uses any object. While held, a big object is still
  subject to gravity; small items snap into the beam.
- [W SEMI] The right hand splits in three prongs and shows an orange glowing beam that flexes as the item moves.
- [W SEMI] Beam can also grab the back of another player's neck and trickle health to them; you cannot give your last HP.
- [W UPG] Strength upgrade: +20% grabber strength (FAN says +25%; wiki versions differ). Lets you carry/throw heavier valuables and lift monsters.
- [W UPG] Range upgrade: +40% reach (FAN says +30%). Also lets scroll wheel push the object further. Range only helps up to the 8th upgrade
  (unless Tumble Climb).
- [W MON] Monsters have a "strength breakpoint" = number of strength upgrades needed to stun one by grabbing it
  (Gnome 0, Banger 0, Tick 0, Birthday Boy 4, Spewer 4, Upscream 4, Bella 9, Chef 9, Clown/Robe/Trudge/Loom 13, some "impossible").
  After level 10 an "overcharge" mechanic applies.
- [W MON] Mass (decimal) is how heavy a monster is when grabbed (Gnome 0.65 ... Robe 9.0). Weight class 0..4 (very light..very heavy) decides stun from weapons.
- [W VAL] When a valuable is first grabbed it has a half-second grace window where hitting a surface costs no value (lets you yank fragile items free).
- [W EXT] Two players: wiki says wide and very tall valuables "usually require multiple people" ([W VAL] size table). Exact shared-beam math is unknown.
- [G] Control scheme: hold mouse to grab the object under the crosshair, object floats at a spring/PD-controlled point in front of the camera,
  scroll = push/pull distance, extra key = rotate. Not read on a page.
- [G] Throwing = release while the camera is moving; object keeps beam-driven velocity. Heavy items slow walk speed and cap beam strength.
  Implementation suggestion: force = k*(target - pos) - c*vel, clamped to maxForce = base*(1+0.2*strengthLevel) / mass.
- [W DOT] Heavy objects you cannot lift can be dragged/placed straight onto the extraction point instead of the cart.

## 2. Valuables
Sizes [W VAL]: Tiny, Small, Medium, Big, Wide, Tall, Very Tall.
- Tiny/Small/Medium: easy to carry. Big: may not fit in cart, carry by hand. Wide: tends to need several players, fills the whole extraction point alone.
- Tall: lay flat to move. Very Tall: cannot pass most doors upright, does not fit extractor unless stood up or placed diagonally; needs cooperation.
Durability type: wiki says "not documented yet" [W VAL].
Value types [W VAL] (each valuable has a type = random range, rounded to nearest $100):
- Very Cheap $250-500; Cheap- $300-450; Cheap $500-650; Cheap+ $850-1,100; Cheap++ $1,200-2,000
- Medium $2,000-3,000; Medium+ $3,500-4,500; Medium++ $4,500-5,000
- High $5,500-7,500; High+ $9,500-12,000
- Expensive $18,000-25,000; Expensive+ $30,000-45,000; Expensive++ $45,000-50,000
Count of valuable types: 165 across locations; each location has its own pool [W VAL].
Level generation [W VAL]:
- Each module has fixed spawn spots tagged by size. Spots are shuffled.
- Cap per level N: max total value and max count per size; total count never above 50.
- Max total value ($k): L1 35, L2 47, L3 112 (wiki table is partly garbled), L4 80?, L5 97, L6 113, L7 130, L8 147, L9 163, L10 180,
  L11 187, L12 194, L13 201, L14 208, L15 215, L16 222, L17 229, L18 236, L19 243, L20+ 250 (flat after 20). The L3/L4 rows look inconsistent in the render: treat as [G].
- Tiny max count falls with level (15 at L1 ... 3 at L11); big/wide/tall/very tall counts rise with level.
- Loop: while total < max value and count < 50: pick a size by rolling 0..weight per size and taking the highest
  (weights Tiny 100, Small 100, Medium 100, Big 75, Wide 50, Tall 50, Very Tall 50); skip if size quota or spots are exhausted;
  pick random free spot of that size; pick random valuable of that size; roll its value in its range.
- Haul goal per extraction point is the same for all points in a level; total level value = goal x multiplier [W VAL]:
  points/multiplier: L1 1pt x3.57, L2 2pt x2.38 (total 4.76x), L3 2pt x2.37, L4 3pt x2.35, L5 3pt x2.32, L6 4pt x2.27, L10 4pt x2.04,
  L14 4pt x1.74, L15 5pt x1.68, L20 5pt x1.43. So a quota is about 28% of level value at L1 and about 70% at L20 (derived by me).
Value loss on impact:
- [W VAL] Valuables have a "max damage" stat; a valuable with max damage >= 30 can stun big monsters, any valuable stuns small monsters; stun can happen with 0 damage.
- [W MON] Hitting monsters with valuables does 5-120 damage depending on item; needs momentum or it only "taps".
  Light hits preserve value better than fast hard hits.
- [W EXT] The extraction platform is padded: no collision damage to valuables, no physics damage to players or monsters inside.
  Value is still lost from jumping on it, explosions, weapons, enemies, special interactions (tipping a cocktail loses about $500) [W VAL].
- UNKNOWN: exact formula impact speed -> % value lost. [G] Suggested model: loss = value * clamp((impactSpeed - v0)/(vMax - v0), 0, 1) * fragility,
  with a per-valuable "durability" and a minimum 1-2 s grace after grab. Show running value in a green/yellow/red floating "$" tag.
- [W DOT] A "$" total is shown on the back of the cart (red hand icon = interact/pull point) and sums everything inside. Per-item $ labels:
  not documented in the pages I read [G].
- [W VAL] Indestructible drone (an item) stops value loss from damage but not from scripted triggers.
- [W VAL] After level 20 (Super Moon) orbs explode when broken: about 50 / 100 / 150 damage for small / medium / large.
C.A.R.T. [W DOT, EXT]:
- A pushable cart. Put valuables in it, push it onto the extraction platform. Cart can be crushed if on the platform edge.
- Pocket C.A.R.T. and C.A.R.T. Cannon are shop items (names only, wiki sidebar). Details unknown.
- Monsters stuck on a cart/valuable attack it, so keep it out of hallways [W MON].

## 3. Extraction, quota, haul, death
- [W EXT] Always one extraction point in the arrival room (where the truck lands). Others spawn as far as possible from existing ones.
  Only one active at a time.
- [W DOT] Activate the next one by pressing its big red button. A red counter (top right under the quota) shows how many remain.
- [W EXT] Count of extraction points by level: 1 on L1, 2 on L2-3, 3 on L4-5, 4 on L6-14, 5 from L15 on.
- [W EXT/DOT] Platform monitor shows an emoji from sad/crying to laughing as quota is approached. When met: green check.
  Overshoot pays a "tax return" money bag (excess above the goal). Bag lands in the padded area; collect it, drop into cart.
- [W DOT] 3 s countdown, then a crusher/chute descends. Stand outside the dashed red perimeter. Items touching the edge are destroyed;
  if a crushed item drops value under the quota, the extraction is cancelled and nobody is revived [W EXT].
- [W EXT] Alarm during countdown is noise that attracts monsters. Point is destroyed after use.
- [W EXT] Monsters inside the zone can be killed by extraction (Apex Predator example; may drop an orb).
- [W EXT/SEMI] Living player caught inside when it fires is killed, then revived to 1 HP.
- Final extraction [W MON]: truck sends large silent pings; every monster heads to the truck; players also emit pings to the nearest point.
- [W DOT] After the last point a dark phase starts; you can leave only through the truck: hold interact on the display bar (white envelope).
  Map (Tab) shows a trail of white dots to the active extraction point or the truck [W SEMI].
- [W SEMI] Death: you explode into a head with black eyes. Carry the head into the extraction zone; when the quota is met it revives you at 1 HP.
  Truck healer at level end can also revive once per level.
- [W SEMI] Dead head has a battery that charges; when charged you can look, hop a bit and talk (distorted voice). Death Head Battery upgrade lengthens it.
- [W DOT] Fail quota or wipe: save is deleted; go to the Disposal Arena. Health is NOT restored between levels.

## 4. Player (Semibot)
- Health: base 100 [G; wiki pages I read only give upgrade deltas]. Health upgrade +20 [W UPG]. Health packs restore 25/50/100 [W SEMI].
- Stamina: base unknown [G ~40]. Stamina upgrade +10 [W UPG]. Sprint speed +20% and +1 stamina/s consumption [W UPG].
- Crouch Rest: +1 stamina/s regen while crouching (+0.5/s moving) [W UPG].
- Crouch: Ctrl; harder to spot; detection time ~1 s standing -> ~2 s crouched/tumbling -> ~5 s hiding/crawling under furniture [W SEMI, MON].
  Crawl auto when going under objects. Sprint+crouch = roll dive [W SEMI].
- Tumble / Object Mode: Q [W SEMI]. Physics ragdoll-like ball, can be picked up and thrown by others; monsters can force it.
  Jump then Q = Tumble Launch (forward roll). Launch upgrade +3 forward force per level [W UPG].
  Tumble Wings: glide, 1 s first level then +0.25 s per level [W UPG]. Tumble Climb: grab surfaces, drains stamina [W SEMI/UPG].
- Voice: proximity chat; mouth (head top) flaps with mic input [W SEMI]. Text chat key T reads as monotone TTS, pitch follows look angle, whispers when crouched [W SEMI].
- Noise bubbles [W MON]: walking small per step, sprinting big per step, crouch-walking none, talking big over a threshold,
  jump landing giant. Huntsman hears 5x range.
- Flashlight [W SEMI]: always on, unlimited battery, cannot be toggled, put away while crouched or in tumble.
- Map [W SEMI]: top-down green device; valuables yellow, items cyan, player heads red, unexplored rooms "?"; truck cyan rectangle; extraction red inactive / cyan active.
- "Energy crystals": the wiki pages I read do not mention them; treat as a Service-Station item/pickup [G].
- Upgrades [W UPG, FAN, SEMI; max 21 total w/o rerolls]:
  Strength +20% (FAN +25%), Range +40% (FAN +30%), Stamina +10, Sprint Speed +20%, Crouch Rest, Health +20, Map Player Count (counter of living players, co-op only, shop spawns it only if nobody owns it),
  Tumble Launch +3 force, Tumble Wings, Extra Jump (one more jump), Tumble Climb, Death Head Battery.
  Prices $2k-$12k, rising with each copy bought [W UPG]. Per-FAN price: stamina $2-3k, health $4-5k, strength/range/sprint $5-8k, extra jump/wings $9-12k.
  Each upgrade applies only to the buyer [FAN].
- Self destruct is a menu button [W SEMI]. Health transfer works between players [W SEMI].

## 5. Monsters [W MON table: HP / damage / detection / strength breakpoint / orb size]
General rules [W MON]:
- Three danger levels (29 monsters). Spawn count by level: L1-2: 1 lv1, 0 lv2, 1 lv3; L3-5: 1/1/1; L6-8: 2/2/2; L9: 2/3/2; L10-19: 2/3/3; L20+: 3/4/4.
- Roam on loose paths or teleport. Noise makes a monster go to the spot, wait a few seconds, then resume. Noise alone does not start an attack except for the Huntsman.
- Attack triggers: line of sight cone, proximity, or touch. Vision cone narrows when crouched/hiding (detect time 1 s / 2.5 s / 5 s).
- "Action timer": per second adds the monster's level for each monster in the same room as a player; at limit every monster is forced to Leave (vacate rooms, go a few rooms away).
  Prevents camping a single room. Great design idea to copy.
- Unseen for a while -> despawn and respawn elsewhere.
- Kill by: stun (weapons/valuables/strength grab), knockback, drop into pits (instant kill before Half Moon), valuables 5-120 dmg, other monsters' attacks, cart ramming, extractor.
- Killed monsters burst into smoke/polygon shards and drop an "orb" (enemy valuable): small/medium/large by danger level 1/2/3.
  Orb has a white shell for 5 s (indestructible) then turns pink/purple fragile. Each monster drops an orb at most 3 times per level; killed monster cannot respawn for triple its timer.
  No orb: Gnome, Banger, non-full Tick.
One line each (HP | damage | detection | behaviour) [W MON table unless marked G]:
- Gnome 20 | 10 | sight/prox/touch: tiny, swarms and breaks valuables (clicking sound) [G]. Survive: throw it.
- Peeper 30 | 2/s | line of sight only: floating eye, damages while you look at it [G]. Look away; hit from above.
- Apex Predator (duck) 150 | 10/hit | sight/prox/touch: follows you until leave-timer ends; flying; stun it, can't be grabbed.
- Bella 200 | 5 | ignores you unless you block her path or grab her.
- Birthday Boy 150 | 10 | ignores you until you pop one of its balloons, then hunts you.
- Elsa 600 | 30 | sight/prox/touch, cannot be grabbed; runs when leaving.
- Shadow Child 150 | 50 | eye contact: harmless until you stare at it too long [W MON].
- Spewer 65 | 10 | spits/vomit; attached to a player its vomit doesn't alert monsters [W MON].
- Tick 10 (up to 100 drained) | 10 | attaches only if you hold something with the beam [W MON]; inflates draining HP; full tick drops small orb.
- Animal 150 | 2 | sight/prox/touch, mass 6 (heavy to lift); does not attack crouched players.
- Banger 50 | 30 explosion | skull with dynamite, runs at you and explodes; usable as grenade [W MON].
- Bowtie 200 | 5 | sight/prox; screams/pushes; weak to bat/pan [GFinity/Destructoid, search snippets only].
- Chef 150 | 10 | leaps/charges, can be baited off ledges [W MON].
- Gambit (clown-wheel) 150 | 50 / sets HP to 1 / 60 | wheel gambles damage; Clown/Gambit relation unclear [G].
- Headgrab 150 | 5, dropkick 15 | latches/kicks.
- Heart Hugger 300 | 30 | sight/prox/touch.
- Hidden 100 | 0 | nearly invisible, relocates players [Destructoid snippet].
- Mentalist 150 | 50 | sight/prox/touch (wiki table only).
- Oogly 200 | 4 | roams AND teleports; green vision cone always stares down [W MON].
- Rugrat 150 | 19-225 | throws valuables at players, damage scales with the valuable [W MON/DotEsports snippet].
- Upscream 50 | 10 | light monster, small items can kill it [W VAL tips].
- Cleanup Crew 350 | head explosion 85, melee 60, radiation 15 per 0.75 s | 360 degree vision (many heads) [W MON]; its head can be thrown as a grenade.
- Clown 250 | laser 100, kick 60 | slow telegraphed laser, can be baited to hit other monsters [W MON].
- Headman 250 | 50 | sight/prox/touch (strength breakpoint 13).
- Huntsman 250 | 100 | BLIND, hears 5x range, attacks sounds including monsters' [W MON]. Crouch-walk past.
- Loom 500 | clap 100 | always knows its single target's position, ignores LOS [W MON].
- Pony 400 | kicks 30/15, lasso 55 | listed as level 3 in the table (not in your list).
- Reaper 250 | 10 | sight/prox/touch, runs when leaving [W MON].
- Robe 250 | 100 (50 crouched) | sight/prox/touch, mass 9 [W MON table].
- Trudge 500 | slam 100, explosion 100 | very heavy, slow, sight/prox/touch.

## 6. Level structure
- Locations named in wiki sidebar [W]: Headman Manor, McJannek Station (arctic), Swiftbroom Academy (wizard school), Museum of Human Art, Service Station (shop), Disposal Arena (wipe/game over).
- Locations each have their own rooms/modules, valuables and monsters; valuables don't cross locations [W VAL]. Each module has fixed valuable slots [W VAL].
- Truck is hub: arrival room contains the first extraction point; end-of-level the truck exit triggers the next stage [W EXT, DOT]. Truck healer revives/heals once per level [W SEMI].
- Shop (Service Station) [W SVC]: no monsters, infinite ammo for testing, damage undone on leaving. Shop tries to spawn 10 upgrades. Items in shop: weapons, health packs,
  upgrades, grenades, melee, drones [W SVC/SEMI]; stun gear named in MON: Prodzap, Boltzap, Stun Grenade, Trapzap, Tranq Gun; knockback: Shockwave Grenade/Mine, Baseball Bat, Pulse Pistol.
  Pay by placing items into the shop's extraction zone and pressing a red button; overspend triggers grenades; truck holds purchased items [W EXT].
  Shopkeeper appeal: 1 in 3 chance of discount, max 3 appeals, rejected item is destroyed [W SVC].
- Difficulty by level number [W MON/VAL/EXT]: more monsters, more extraction points, bigger valuables total, more big/wide valuables; flat after L20.
  Moon phases (Crescent L5, Half, Full, Super at 20) change rules (e.g. small valuables stop stunning after Crescent, pits not instant kills after Half) [W VAL/MON].
- "Map tool": see section 4.

## 7. Robot character (high level, for an ORIGINAL design) [W SEMI]
- Reference look: small weathered robot, half-round head split in two with hinged top that flaps when you talk, two big cartoon eyes with tiny pupils,
  body of three stacked telescoping segments (head/torso/pelvis), cone-shaped limbs, flashlight on the left arm, orange tractor beam from the right hand split into three prongs.
  36 colours in a 4x9 grid, 21 face expressions from 6 base ones.
- Original-style suggestions [G]: use a different silhouette (e.g. boxy capsule or tripod base), a single wide visor of emissive pixels instead of eyes,
  mouth/antenna light that pulses with voice amplitude, segments that fold for crouch, a cyan beam instead of orange, 3-tone palette swap per player.
  Expressions via visor shapes (arrows, X, dots) so it reads differently from the reference.

---------------------------------------------------------------------
## Gaps to close before final implementation
1. Real grab beam numbers (hold distance, force, speed penalty) - measure in game or read modding sources.
2. Impact-to-value-loss formula - needs source code (modders' ValuableInspector / Thunderstore pages may hold the data).
3. Base stamina and base grabber range.
4. Monster pages (Huntsman, Robe, Headman, Reaper, Upscream) failed to render; behaviours above beyond the table are partly [G].

## Addendum: monster pages that did load later
- [W https://repo-2025horror.fandom.com/wiki/Headman] Floating giant old-man head. Wanders, clacks teeth; on sight screams and chases much faster; bite 50 dmg + slight knockback.
  Chases until target dies or is lost; if lost stays angry for a while checking neighbouring rooms, then calms and patrols.
- [W https://repo-2025horror.fandom.com/wiki/Upscream] Small crawling head-with-limbs. Chases on sight; when close it screams: flings the player up/back, stun 2 s,
  10 dmg if you then hit a surface; camera locks onto it. Reaches into hiding spots (tables, bushes). After at most 3 screams it runs away and ignores players for a while.
- [W https://repo-2025horror.fandom.com/wiki/Robe] Tall black-cloaked blocky creature with bone mask; hands twitch while roaming; squashes flat to chase hiders;
  almost silent (so you cannot hear it coming); 100 dmg standing, 50 crouched (table).
- Huntsman page still failed to load; see table above.
