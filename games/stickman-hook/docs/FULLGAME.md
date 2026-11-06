# Stickman Hook: full game inventory, everything outside Normal mode

Read-only inventory for planning the web remake in phases. Normal mode is already shipped
(`games/stickman-hook`, rules in `GAMEPLAY.md`). Tags follow `GAMEPLAY.md`:
`[asm 0x...]` = ARMv7 instruction the rule rests on; **UNKNOWN** = not proven; **ONLINE** = needs a server
or live service in the original. Everything else is playable offline.

## 0. The big find: the whole economy ships inside the APK

`data.unity3d` → `resources.assets` pathID 1759, MonoBehaviour `MadBox.RemoteSettings.RemoteSettingsConfig`
("RemoteSettings", 353 KB). It embeds the **default remote config** as one JSON string ("From 9.9.30 to 9.9.999 | Initial
Version"), plus the DTO type map (`StickmanHook.Services.*RemoteSettingsDto`). The live game refreshes it from
`https://remote-settings-assets.madbox.io` (`segmentation-prod.json`) → **ONLINE** for updates, but the bundled default is
complete and is what a fresh offline install runs on. So every economy number below comes from data, not guesses.

- Full dump: `dump/full/remote_settings_default.json` (480 KB, 40 top-level sections).
- Split per system (compact): `dump/full/meta_*.json`, `mode_*_remote.json`, `mode_list_theme.json`.
- Strings and DTO map: `dump/full/_remotesettings_strings.txt`. Census of all Resources MonoBehaviours: `dump/full/_data_census.json`.
- Tools added (new files only): `tools/census_data.py`, `raw_strings.py`, `rs_keys.py`, `peek_mode_configs.py`,
  `extract_mode.py` (+ `extract_raw_lib.py`, a copy of the `extract_raw.py` helpers), `decode_ghost.py`, `summarize_full.py`.

Only 16 `.asset` files exist in Addressables. There are no ScriptableObject item or collection databases: customization,
cards, boosters, wheel, piggy bank, market and road are **all** in the remote-settings JSON.

## 1. Mode list and unlocks

`game_modes.modes` (`mode_list_theme.json`). Unlocks come from XP road thresholds (`progression_road.thresholds`,
resource `progression.xp`). XP comes from `GamePlaySettings._xpGainPerLevelCompleted = 10` per completed level, plus item and
collection unlock XP (section 9).

| id | display | levels | daily limit | unlock |
|---|---|---|---|---|
| mode.normal | Normal | endless | none | default |
| mode.lucky_wheel | Lucky Wheel | n/a | price list | XP 0 |
| mode.tournament | **Race** | endless (21 maps) | 2 free/day | XP 150 |
| mode.pachinko | **Lucky Drop** | endless | 1 free + 2 rewarded/day | XP 350 |
| mode.adventure | Adventure | endless | weekly tokens | XP 650 |
| mode.grapple | **Mechanical Grapple** | 41 + random | none | XP 2650 |
| mode.challenge | Challenge | 30 | none; `autoUnlockNextLevel=false` | each challenge level is unlocked by its own XP road step (`unlocked_level_mode.challenge` at XP 1250, 1650, ..., 12050; 29 steps) |
| mode.easter_event / mode.valentine_day | seasonal | 5 each | 1 free/day | `flag.seasonal_event` at Normal level 10; event window = scheduler, **ONLINE** (`seasonal_events.seasonalEvents` is empty in defaults) |

Theme colors per mode (camera bg, shadow, finish light, ...) are in `theme.gameModes`.

## 2. Challenge (30 fixed levels)

- Data: `ChallengeGamePlayConfig._levels[30]`, each exactly 3 patterns. Dump: `dump/full/challenge_raw.json` (88 prefabs).
- Build: same component set as Normal (Target, BumperAnimationController, SpawnPoint, FinishScript, PatternController).
  `newComponentTypes = []`. Only new sprite: `AN_Grap1_BumperSmall004` (anim `BumperSmall`). None of its prefab names are
  shared with Normal, but the objects are the same kind.
- Rules: Normal physics and Normal win/lose. Level N is playable only after XP road step N (see above).
  Lives, timer or skip rules specific to Challenge: **UNKNOWN** (not decoded; nothing in the config suggests any).
- Rewards: `achieved_level_mode.challenge` road: 9 skins at challenge 1, 5, 10, ... (`meta_xp_road.json`). Card `second_chance_challenge`.
- Assets: bundle 1.4 MB, plus about 3.8 MB of dependency bundles not used by Normal. Web estimate: about 60–100 KB of
  level JSON and 1 sprite.

## 3. Mechanical Grapple

- Data: `GrappleGamePlayConfig`: `_deterministicLevelDefinitions[41]` (40 with 3 patterns, 1 with 1),
  `_randomPatternDefinitions[3]` (31/46/37 patterns). 104 of its 105 prefabs are **the Normal patterns themselves**.
  Dump: `grapple_raw.json`.
- Settings: grappleSpeed 15, grappleStartSpeed 5, grappleEasingTimer 0.4, autoReleaseBoost 0.75, releaseBoost 1.0,
  forwardTargetPreference 0.4, elasticity 0.0176, forceHorizontal 1, snappiness 0.75.
- Rules (`PlayerHookControllerGrappleMode`):
  - Grab [asm 0x120e270]: pick the closest target with forward bias 0.4 (Update [asm 0x120de74]) and `wantedPosition = target.pos`.
    - `startSpeed = lerp(v·hookDir, grappleStartSpeed, clamp01(snappiness))`, or `grappleStartSpeed` when elasticity == 0 [asm 0x120e5c4..0x120e6a8].
    - `CountTo(startSpeed → grappleSpeed, 0.4 s)` ramps currentSpeed. A stale ramp is ignored after a re-grab (hash check) [asm 0x120ed9c].
    - Calls `TargetMover.OnHooked` [asm 0x120e7cc].
  - FixedUpdate [asm 0x120ded8]: auto-release when `|pos - wanted| < 0.25` [asm 0x120df6c].
    HookDisplacement [asm 0x120dfcc]:
    - `angularVelocity = 0`, `gravityScale = 0`.
    - `desired = normalize(wanted - pos) * currentSpeed`, then `SmoothDamp(v, desired, smoothTime = elasticity)` [asm 0x120e218], then `rb.velocity = desired`.
  - UnGrab [asm 0x120e894]:
    - `gravityScale = 1.1` [asm 0x120e924].
    - `v *= autoUnGrab ? 0.75 : 1.0` [asm 0x120ea48, 0x120ea98].
    - Spin is `|v| * mult`, with sign opposite to vx [asm 0x120eb70].
    - If `|vx| < 1`, then `vx = ±1` [asm 0x120ebf8..0x120ecc4].
- Win/lose: same finish line and death as Normal (same patterns). `GrappleGamePlayController.GiveEndGameRewards` [asm 0x12a53f4] not decoded.
- Rewards: `achieved_level_mode.grapple` road: grapple 5 skin.ice_cream, 20 skin.swimming_cat, 50 skin.sharky, 100 trail.smoke.
  Cards `finish_line_xp_boost_grapple` and `second_chance_grapple`.
- Assets: 47 KB bundle; nothing new to draw. Web estimate: 10–20 KB of code and level lists. **Cheapest mode.**

## 4. Seasonal events (Easter, Valentine's Day)

- Data: `SeasonalGamePlayConfig._seasonalEventLevelDefinitions[2]` → `{_eventId, _deterministicLevelDefinitions[5] × 3 patterns}`.
  Dump `seasonal_raw.json` (16 prefabs, same object kinds as Normal, plus `BumperSmall`). Player is a `SeasonalPlayerController`.
- Rules: Normal physics; 5 levels per event; 1 free game per day. The `daily.seasonal_event_incentive` periodic resource exists.
- Unlock: `flag.seasonal_event` at Normal level 10. The event window comes from the scheduler (**ONLINE**); offline, both events can simply be enabled.
- Rewards: 5 skins per event (unlock method `seasonal_event_mode_*`, `customization_unlock_table.json`).
- Assets: theme colors (`theme.gameModes`), text materials, menu items. Seasonal bundles total about 9.7 MB raw. Web estimate: about 30 KB of levels plus UI art.

## 5. Tournament ("Race", ghost race)

- Data: `TournamentGamePlayConfig`: `_possibleLevels[21]`, `_nbOpponents 4`, `_difficultyLevels[6]`, and `_saves[505]`
  (`{name, level, difficulty 0..3, spawnPoint 0..4, skinId, duration, path "Ghosts/<level>.json"}`). Dump `tournament_raw.json`.
- Ghost blobs: `data.unity3d` TextAssets `0..20` (= level index), dumped at `dump/text/<n>_<pid>.txt`.
  Each file is `[{"PlayerReplaySave<id>": base64, ...}]` and the 505 records are all in these 21 files.
- **Decoded format** (`tools/decode_ghost.py`; all 505 records parse with 0 bytes left over):
  ```
  str "PlayerRecord", int32 nTracks (=2)
  per track: str name, int32 0, str guid, int32 1, str material "GhostToolPro/<guid>/Materials/Mat-1",
             int32 nFrames, then nFrames x { f32 t, u8 active, f32 pos[3], f32 scale[3], f32 euler[3], u8, u8, str sprite }
  str = .NET BinaryWriter (7-bit length prefix). Frames every ~0.02 s.
  track 0 = body sprite (CHAR_<Skin>NNNN, the animation frame name); track 1 = rope (AAL_square_mini stretched+rotated)
  ```
  The early frames sit at x = -999.9 (hidden before spawn).
  - Summary: `dump/full/tournament_ghosts.json`. One full record with its frames: `tournament_ghost_sample.json`.
  - Median duration by difficulty: d0 28.8 s, d1 19.2 s, d2 10.8 s, d3 7.1 s.
- Rules:
  - Level: chosen by the caller (`TournamentGamePlayController.RefineLevel` 0x12aac08, **UNKNOWN**).
  - Player slot: `Random.Range(0, 5)` [asm 0x121fe90].
  - Each other slot gets `GetRandomSaveForRace(level, slot)` [asm 0x12202d8]:
    - `idx = clamp(nbWins, 0, 5)` [asm 0x1190cb0].
    - `diff = WeightedRandom(_difficultyLevels[idx])`. The weights are 0:{0:1}, 1:{0:7,1:3}, 2:{0:5,1:4,2:1}, 3:{0:3,1:4,2:2}, 4:{0:1,1:4,2:4,3:1}, 5:{2:3,3:3,4:4}.
    - Note that level 5 can roll difficulty 4, which has no saves: the fallback branch 0x12205a0 is **UNKNOWN**.
    - The save is a random element of `saves[level][diff][slot]`.
  - Ghost names are taken from a shuffle of the leaderboard ranking [asm 0x1220160].
  - Ghost playback: `GhostTool2D.StartReplaying`. Each ghost "finishes" after `Task.Delay(duration * 1000)` [asm 0x1221438, 0x1221528].
  - Placement is completion order: `AddPlayerToRanking` on each ghost finish and on the player's finish [asm 0x12ab690, 0x12ab638]. `GetPlayerRank` is a 0-based FindIndex [asm 0x12abb74].
  - Rewards: `GetRaceRewards(clamp(pos, 0, 4))` [asm 0x1190d24]:
    - trophies `[10, 5, 3, 2, 1]`, skin coins `[10, 7, 5, 3, 1]` (×1.2 multiplier constant, use **UNKNOWN**).
    - Source `finish_level_tournament` [asm 0x1190f3c].
    - Trophies are wiped when a new daily leaderboard is created [asm 0x11909bc].
- Daily leaderboard (trophies): the `leaderboard` competition `tournament` has 10 participants and lasts 1 day.
  - AI difficulty by number of wins (minWon 0..4).
  - AI opponents get score ranges per rank segment (`leaderboard.aiDifficulties`, `tournaments.tournamentsAI`).
  - End-of-day rewards: #1 = skin from `reward_pool.tournament_skin` (dolphin, stick_knight, wolf, yeti, mjolnir, sheep) + 1000 coins; #2 500; #3 250; #4 100; #5 50; #6 25; #10 5.
  - The leaderboard has `Seed` and `GetRankedProfiles(timestamp)`, so AI scores are computed locally from seed and elapsed time (inferred, body not read).
  - The day window and seed source are **ONLINE**-ish; offline, use the local date as the seed.
- Daily limit of 2 free games: location in code **UNKNOWN** (config value only).
- Assets: 858 KB bundle (21 maps; 34 of 53 prefabs shared with Normal), spawn-point sprites `SpawnPointGhost` and `SpawnPointPlayer`, UI.
  - Ghost data is 76 MB of base64 raw. Web plan: resample to 10 Hz, int16 x/y/rot, sprite index; or ship 1–2 saves per (level, diff, slot).
  - Estimate: about 1.5 MB total, lazy-loaded per level (about 70 KB per level).

## 6. Lucky Drop (Pachinko)

- Data: `PachinkoGamePlayConfig` (procedural, no pattern lists). Dump `pachinko_raw.json` (11 prefabs: pegs, buckets, walls, bumper, player).
- Settings: TargetRandomness 0.8, TargetDistance 1, Disappearing 1, DisappearingTimer 0.5, Bounce 0.6, GravityMultiplier 1.25,
  CameraSize 7.5, NumberOfBuckets 5, SlopeAngle 7, SlopeSpacing 2, Radius 2, ArcDistance 0.7, StartAngle 45, Gap 1.
- Board:
  - Level type: `GetNextLevel` [asm 0x116f190] returns one of 8 types: FULL_PEGS, HEXAGON, BIG_CIRCLE, PEGS_AND_CUPS, CONCENTRIC_PEG_CIRCLES, PEGS_AND_SLOPES, CUPS, LOOP.
  - Generators:
    - Circle: `count = floor((2πr - gap) / arcDistance)` [asm 0x1215148].
    - Hex grid: row height `spacing * 0.866` with half offsets [asm 0x12156cc].
    - Jitter: `insideUnitCircle * r` [asm 0x1214ff4].
    - Slopes: rect pegs rotated 7°, spaced 2 [asm 0x1215800..0x1215b60].
  - Per-type coordinates in `BuildLevel` [asm 0x121335c]: **UNKNOWN** (a long literal switch, needs a dedicated pass).
  - 5 buckets of width `W/5` at the bottom, each with a reward peg trigger [asm 0x12127ac..0x1212978].
- Play:
  - The stickman drops from the top under gravity `9.81 * 1.25` [asm 0x12a7240].
  - Hook taps work on `PachinkoTarget`s. A top `PachinkoBumper` (deformable mesh) bounces the player until the first grab, then shrinks away [asm 0x121867c, 0x1218918].
  - Each peg hit gives +1 coin (bonus peg ×10), a kick of `normal * _minBumpForce`, and the lit sprite; the peg then disappears after 0.5 s and fires once [asm 0x121b128, 0x121b32c, 0x121b548].
  - Side walls reflect with Bounce 0.6 [asm 0x1219df0].
- End: the first stickman entering a bucket ends the run. The payout is `NbCollectedCoins` (peg hits) plus the bucket reward [asm 0x12a75a0].
- Buckets:
  - The centre bucket holds the main prize: one item from `mainRewardOptions` (8 skins, ropes and trails, weight 10 each).
  - The other 4 buckets hold sorted coin rewards drawn from 150 (w12), 300 (w5), 500 (w2) and 1000 (w1) [asm 0x116ee44, 0x116ef24].
- Cards [asm 0x1212510, 0x1212650, 0x121b3d4, 0x116f2bc]:
  - extra_stickman: chance that one peg spawns a 2nd stickman.
  - x10_multiplier: chance of one bonus peg.
  - bumper_resistance: chance a hit peg stays.
  - lucky_drop_limit: more bonus games per day.
  - daily_coins_boost: max +100/day (`resource_boosting`).
- **UNKNOWN**: use of minBonusPercentage / maxBonusPercentage (0.04–0.06) and of AlwaysCoin; fail condition; `_minBumpForce`.
- Assets: 2.8 MB bundle and 17 new sprites (pegs, buckets: `PegColor`, `PegTouched*`, `Bucket*`, ...).
  - Uses `DeformableMesh2D` and a TextMeshPro x10 label.
  - About 12 MB of dependency bundles not in Normal (mostly UI and currency art).
  - Web estimate: 120–200 KB.

## 7. Adventure (endless runner with firewall)

- Data: `AdventureGamePlayConfig`.
  - `_difficulties[8]` pattern pools of 1/20/30/83/123/145/168/189 patterns; `_increaseDifficultyEveryXPatterns = [0,1,10,25,35,55,65,80]`.
  - Prefabs: player, target, bumper, firewall, gravity zone, portal, score line.
  - gravityZoneSpawnChance 0.15, portalSpawnChance 0.2, maxPortalBonusDistance 300, maxSpawnedPatterns 3, initialSpawnedPatterns 2,
    playerMaxVelocity 35, grabOnHold 1.
  - Dump `adventure_raw.json` (196 prefabs, 45 shared with Normal). Remote: `mode_adventure_remote.json`.
- Spawner (`AdventurePatternSpawner`):
  - Tier: `clamp(lastIndexWhere(_index >= inc[k]), 0, 7)` [asm 0x11fa5f0].
  - Seed: `seed = Leaderboard.Seed + _index`, which feeds both `System.Random` (pattern) and `UnityEngine.Random` (zones and portals) [asm 0x11f950c, 0x11f9584]. The whole run is deterministic per weekly seed.
  - Pattern choice: candidates are filtered by `entryPositions & lastExit != 0` (`Intersects` [asm 0x12a242c]; `lastExit` starts at 7), then
    `System.Random(seed).Next(0, count)` (`RandomElement` [asm 0x17501a8]) [asm 0x11f954c, 0x11f959c].
    *Corrected 2026-10-28 (was UNKNOWN).*
  - Each pattern is placed at the previous pattern's end transform, the first one at `Vector3.zero` [asm 0x11f9700..0x11f9774].
  - `SpawnNextPatternIfNecessary` [asm 0x11f8f0c]: load one more while count <= 3 or the last pattern starts less than 100 ahead of the player;
    drop the first once count >= 3 and the second starts more than 100 behind [asm 0x11f8f8c, 0x11f9118].
  - `UnityEngine.Random` is libunity's Xorshift128 (`InitState` [libunity 0x22a968], `value` = `(w & 0x7FFFFF) * 1.192093e-7`
    [libunity 0x22aa10], `Range(float)` = `t * min + (1 - t) * max` [libunity 0x22a998], `Range(int)` = `min + next % (max - min)`
    [libunity 0x236128]). Ported in `js/advrun.js` `URandom`.
- Skill bias (common to all objects):
  - `skill = lerp(min, max, levelCurve(clamp01((1 + distCurve(x/1000) * maxBonusMult) * lvl/top)))` [asm 0x126a060..0x126a0c4].
    *Corrected 2026-10-28:* `top` is `GetSkillLevelMax` = maxLevel 20 + the limit-boost card's effect at card max (80) = **100**
    [asm 0x1269d78], not 20. Without cards a skill is capped at level 20 (`LOCKED` [asm 0x1269ae0, 0x126a390]), so level 20 gives
    at most `levelCurve(0.2 * (1 + bonus))`.
  - `r = Random.value; v = r + (min(1, r + Range(minSize, maxSize)) - r) * skill`.
  - `bucket = v * (bad+neutral+good)`, compared against bad and bad+neutral, gives 0/1/2 [asm 0x11f9cb8, 0x126ac1c].
  - Skills apply to: bumpers (4 render types; single-use, shrink after hit [asm 0x11fa83c]); targets (default / one-time / timed / moving); wind (gravity zone up or down); teleporters.
- Targets (`Target.Start` replaced by `TargetAdventure` [asm 0x1200e74], `SetType` [asm 0x11fcc48]). *Decoded 2026-10-28 (was UNKNOWN):*
  - `InitState(Seed + static _targetsCount++)`, then `value`, then `Range(minSize, maxSize)`. GOOD → SPINNING, NEUTRAL → NORMAL,
    BAD → `RangeInt(0, 3) + 1` = ONE_TIME / TIMED / MOVING. A target under an `INITIAL` parent is always NORMAL.
  - ONE_TIME dies when let go (shrink 0.1 s) [asm 0x11fdfd0]. TIMED dies 5 s after the first grab, also when let go [asm 0x11fc93c].
    SPINNING turns 180°/s and keeps the hooked player at speed >= 6 [asm 0x11fca84]. MOVING: direction `RangeInt(0, 4)`, ±distance/2,
    SINE_EASE_IN_OUT, speed 2, distance 2 [asm 0x11fe2ac]. A destroyed hooked target forces `UnGrab` [asm 0x120adb8..0x120ae30].
- Bumpers (`BumperAnimationController.Start` [asm 0x11ff9f4] → `SetType` [asm 0x11fa948]): `RangeInt(0, 4)` first (discarded), then
  `InitState(Seed + static _bumpersCount++)`, `value`, `Range`. NEUTRAL → NORMAL, GOOD → HIGH, BAD → `RangeInt(0, 2)` LOW / ONE_TIME;
  INITIAL → SAME. Bounciness NORMAL 1.3, SAME 1.0, LOW 0.5, HIGH 1.5 [asm 0x11fad94].
- Both static counters are only reset by the class constructor, i.e. once per app launch. The web keeps them for the page session
  (`adventure.js COUNTS`; a reload is a launch), since rev 20261028k.
- Gravity zone:
  - `InitState(seed)`, spawns when `value < 0.15`, x = a random place inside the pattern, then `Range` then `value` for the type [asm 0x11f99d0, 0x11f9b80, 0x11f9cb8].
  - BAD → DOWN, GOOD → UP, NEUTRAL → no `SetType`: it stays UP but invisible (no render group).
  - Size 10×30. Force each FixedUpdate is `extraGravityUp (10, 3)` or `extraGravityDown (-3, -1.5)` (AddForce, mass 2), skipped while hooked
    and moving against it [asm 0x11fbcdc, 0x12a0920, 0x12a0b44]. Enter/exit triggers [asm 0x129fe3c, 0x12a0628].
  - Velocity capped at 35 [asm 0x12a0be4].
- Portal:
  - Spawn gate: while the previous pattern starts before x 300 the bonus gate `clamp01((1 - portalBonusCurve(_index/300)) * 0.2)` is
    always <= 0.2, so it always passes; after that `value <= 0.2`. Then `value`, `Range`, and the teleporter skill must roll GOOD [asm 0x11f9f70, 0x11fa0ec].
    It sits 1 unit right of a random spawn point of its pattern [asm 0x11fa3a8].
  - On enter: `RangeInt(1, 3)` patterns ahead, a random spawn point there, 1 unit left of it [asm 0x12a00ec..0x12a0120]. The player turns
    alpha 0.3, flies kinematic at 20 u/s and leaves with velocity (14.7087, 2.94174) [asm 0x12a02b0, 0x12a14d0, 0x12a1660].
    A portal closes once the player is past it [asm 0x12a1b50].
- `rope_length` *(decoded 2026-10-28)*: `AdventurePlayerController.Awake` sets `PlayerHookController.ropeLength` [asm 0x12a081c];
  `UpdateClosestTarget` only picks targets within it [asm 0x120a58c], and the green `RangeIndicator` circle shows it [asm 0x11ffef0].
  Holding grabs as soon as a target comes in range (`grabOnHold` [asm 0x12a18f8..0x12a1940]).
- Firewall [asm 0x11fb4cc..0x11fbc5c]:
  - *Corrected 2026-10-28:* spawned at (0, 0, 0) [asm 0x11fb4cc] and started by the first grab (`OnStartedPlaying`), then waits 3 s.
    The prefab's mode 0 is `ACCELERATE_OVER_TIME`.
  - `speed` starts at 0.1 and grows `+= 0.05 * dt * skill` **with no cap** (`maxSpeed` 3 is only read by mode 1) [asm 0x11fb98c].
    Rubber-band: it never trails more than 30 behind the player.
  - Touching its trigger box (offset (−2.5, 40), size (5, 100)) kills [asm 0x129fdcc]. The firewall skill gives skill = 1 at level 0 and lower with levels.
- Score: `max(best, int(player.x - startX))`, i.e. distance in metres [asm 0x129fa54..0x129faf8]. One life per run (the firewall or a fall ends it).
- End of run *(decoded 2026-10-28)*: `RegisterPendingScore` writes the week's best/last score and `progression.adventure_best_score`
  [asm 0x12680cc]; `ClaimPendingScore` pays **tokens = metres** [asm 0x1268190]. A new week resets the road (`ResetProgressionRoad` [asm 0x1267e24]).
- Meta:
  - Tokens (`currency.adventure_tokens`) buy skill levels: 6 skills × 20 levels. *Corrected 2026-10-28:* cost = `100 + 10 * floor(total levels of all skills / 10)`
    [asm 0x126a184, floorf 0x10b9638], not "+10 per level".
  - Token sources: `weekly.adventure_starter_pack`, cards (weekly_starting_tokens, daily_login_tokens, daily_tokens_multiplier max 1000/day), and the best-score road.
  - Best-score road (`progression.adventure_best_score`): 105 thresholds from 1 to 15000 m giving tokens and boosters.
  - Weekly leaderboard `adventure`: 10000 participants, 6 difficulty tiers; #1 = 3000 coins + boosters + 3 skins from `reward_pool.adventure_skin` (48 collection skins).
  - The weekly seed and leaderboard are **ONLINE** in the original; offline, use a local week seed and a simulated board.
- ~~UNKNOWN~~ (all decoded 2026-10-28, above): the pattern exit filter predicate, where rope_length is applied, the target types' behaviour,
  the end-of-run token formula, the firewall spawn point. Still server-driven: the week's window (seed) and real players.
- Assets: 12.3 MB config bundle; 39 dependency bundles = 53.5 MB, of which 45 MB is not used by Normal.
  - 21 new sprites (bumper types, target variants `Target_OneTime`/`Target_Mooving`, chrono, portal) and 7 new animators (BumperDefault/High/Low/OneTime, Portal, TimedHook).
  - ParticleSystem and Light.
  - Web estimate: 400–700 KB. **Largest mode.** Built 2026-10-28: 564 KB raw / about 220 KB gzip, all lazy
    (`mode-adventure.json` 389 KB raw / 86 KB gzip, `adventure.webp` 111 KB, `adventure.js` + `advrun.js` 64 KB raw).

## 8. TargetMover (moving hooks)

`TargetMover` (Start [asm 0x120173c], OnHooked [asm 0x1201b40], Update [asm 0x1201c64]):
- Moves along a waypoint loop at `speed`; a waypoint is reached when within `minProximity`.
- `waitForHook` holds the target until it is hooked, and it stops again after each lap. `startDelay` and `targetFreezeDelay` set timed holds.
- **No shipped pattern in any mode uses TargetMover** (0 instances in Normal, Challenge, Grapple, Seasonal, Tournament,
  Pachinko and Adventure dumps). Adventure's "moving" targets go through `TargetAdventure` (decoded 2026-10-28, section 7). Low priority.

## 9. Meta systems

All numbers are from `remote_settings_default.json`.

**Currencies** (`game_resources`): skin_coins (coins), skip_tickets, adventure_tokens, progression.xp, progression.race_trophies.
Sprites are under `Sprites/Currencies/*` (10 bundles, 2.5 MB raw).

**Coins per level, Normal**: `NormalGamePlayController.GiveEndGameRewards` [asm 0x12a6048] does the following:
- Adds XP (`AddQuantity`).
- Claims the achieved-level road (`ProgressionRoadService.ClaimAllRewards`).
- Checks the piggy bank (`PiggyBankService.GetRewardId`).

No per-level coin grant was seen. Coins come from the road, the wheel, the piggy bank, races, pachinko and the market's free coins (exact AddQuantity
resource and amount: **UNKNOWN**, very likely `progression.xp` +10).

**XP road** (`meta_xp_road.json`, `XpRoadConfig` = UI prefabs only, 2.6 MB):
- 127 thresholds: 0, 50, 100, 150, 200, 275, 350, then every 100 up to 12350.
- Leagues by XP: Bronze, Silver (2250), Gold (4750), Platine, Diamond, Master (12250).
- Reward kinds: 38 coin rewards (150–500), 29 challenge unlocks, 27 boosters, 9 trails, 8 skins, 7 ropes, 5 modes, 2 flags.
- Fallback once the road is done: 150 coins.
- Other roads: Normal level road (10 seasonal flag; 20/25/35/50/100 skins), Grapple road, Challenge road, card-perk-level road (12 steps), Adventure best-score road.

**Cards and boosters** (`meta_cards_boosters.json`; card art `cards_items` 30 bundles, 8 MB raw):
- 33 cards in 7 categories (global, normal, tournament, adventure, challenge, grapple, pachinko).
  Each card has: rarity, `cardMaxLevel 10`, `requiredCardsPerLevel` (common 30, epic 15, legendary 10), and `minEffect..maxEffect` with `effectGraduation` (e.g. 5..50 % step 5).
- 7 boosters: welcome, common, epic, legendary, and single-card common/epic/legendary.
  - 5 cards each (+1 rewarded, +1 bonus).
  - Stack 11–15 cards (epic 16–20, legendary 20–26).
  - Rarity weights: common 80/15/5, epic 50/25/5 plus a guaranteed epic, legendary 35/25/10 plus a guaranteed legendary.
  - Novelty chance by rarity: 7.5 / 20 / 30 %.
  - Duplicate compensation: 1 / 3 / 10 coins.
- Card effects as resource boosters: `resource_boosting` (12 entries with sources and daily caps).

**Lucky Wheel** (`meta_lucky_wheel.json`, LuckyWheelService):
- Price index is `min(claims, prices.Count - 1)` with prices [0, 500 coins], so the first spin is free and every later spin costs 500 [asm 0x115ab14].
- Pay sets a pending spin; claim grants the reward and increments claims [asm 0x115db94, 0x115dd94].
- Pick: pool weight, then item. Owned customization items are filtered out [asm 0x115c8b4, 0x115d030].
- Pools: booster_card common 80 / epic 40 / legendary 10; booster common 30 / epic 10 / legendary 5; skin epic 10 (6) / legendary 5 (4);
  rope epic 10 (4) / legendary 5 (1); trail epic 10 (empty) / legendary 5 (4).
- `forcedRewards` [skin.potatoz] (rule: first spin, or while not owned: **UNKNOWN**).
- Card `extra_lucky_wheel`.

**Piggy bank** (`meta_piggy_bank.json`, PiggyBankService):
- Progress runs 0..100 [asm 0x1175bd8].
- Fill per source picks the config by claims-count threshold: before the first claim it is 10 per level completed / 30 rewarded / 30 IAP; after that, 3 / 30 / 30 [asm 0x11759b4].
- Claimable at ≥ 100 [asm 0x1175cac].
- Reward: the next unowned skin of 10 (stick_frog, ghost, mommy, dwarf, rock, angel, fly, unicorn, thief, dragon). On claim, progress resets and claims += 1 [asm 0x1175e38].

**Skip level**: daily count limit = effect of card `skip_level` [asm 0x124ea20], tracked by flag `flag.nb_levels_skipped_<day>`.
`currency.skip_tickets` is sold in the market.

**Market** (`meta_market.json`):
- Sections: special offers, boosters, black market, coins, skip tickets.
- Real-money packs are IAP (**ONLINE**, not reproducible; turn them into free or coin offers or drop them).
- Daily free coins and rewarded coins (once a day each, `periodic_resources`).
- Black market: cards for coins, e.g. common card 20 coins (`black_market.unitPrices`, about 250 entries).
- VIP: 3000 coins + 60 skip tickets + no ads + 9 skins, 3 ropes, 3 trails.
- IAP price table: `dump/text/IAPPriceConversion_217.txt`.

**Customization** (`customization_unlock_table.json`: 192 items with unlock method, road threshold, XP reward and asset address; 62 collections):

| unlock method | skins | ropes | trails |
|---|---|---|---|
| adventure (weekly prize pool) | 48 | | |
| progression road (XP / normal / challenge / grapple / card level) | 8 / 5 / 9 / 3 / 4 | 7 / 0 / 0 / 0 / 3 | 8 / 0 / 0 / 1 / 5 |
| lucky_wheel | 12 | 5 | 4 |
| rewarded ad | 12 | | |
| piggy_bank | 10 | | |
| vip (IAP, **ONLINE**) | 9 | 3 | 3 |
| tournament prize pool | 6 | | |
| pachinko | 5 | 2 | 3 |
| seasonal (Easter, Valentine 5 each) | 10 | | |
| external links (Discord/FB/IG/Pocket Champs) | 4 | | |
| default | 1 | 1 | 1 |

- Unlock XP: common 20, epic 30, legendary 50, ultimate 75.
- Collection completion XP: 75–200.
- Assets (raw bundles): skins 336 bundles / 161 MB, ropes 42 / 8 MB, trails 52 / 17 MB, collection icons and materials 1.7 MB.

**Inbox**: not present in the default config (`inbox` key absent). `MessageItem` prefab only. Server-pushed: **ONLINE**. Skip it.

**Social profile**: `social_profile.playerNames` (bot names for leaderboards) and `playerSkinIds`. Offline-usable as fake opponents.

**Ads, analytics, GDPR, IAP, scheduler, A/B tests**: **ONLINE**. Replace "rewarded" with free or cooldown.

## 10. Server-driven vs offline

- **ONLINE in the original** (needs a substitute):
  - Remote config refresh (use the bundled default).
  - Leaderboards' seed, time window and real players (simulate locally: seeded AI from `tournamentsAI` and `leaderboard.aiDifficulties`, names from `social_profile`).
  - Seasonal schedule.
  - IAP and VIP; rewarded ads; inbox; external links.
- **Offline-playable as-is**: Challenge, Grapple, Seasonal levels, Tournament ghosts (all 505 shipped in the APK), Pachinko, Adventure, XP road, wheel, piggy bank, cards, boosters, black market for coins.

## 11. Recommended build order

Sizes are web-download estimates. The Normal remake is 215 KB for about 9.5 MB of source bundles, about 2–3 %.
Skins dominate everything.

| phase | content | why first | est. size |
|---|---|---|---|
| 1 | Meta core: currencies, XP road (127 steps), mode-select screen, unlock gating, save model | everything else hangs off XP and coins | 60–100 KB (+ road UI art) |
| 2 | Grapple (41 levels; reuses the Normal patterns and atlas) + Challenge (30 levels, 1 new sprite) + Seasonal (2×5 levels) | same engine, small deltas, 80 new levels | 150–250 KB |
| 3 | Customization: skins, ropes, trails + collections, starting with the ~60 items reachable offline (road, piggy, wheel, pachinko, seasonal) | it is what all rewards pay out; a skin pipeline is needed before wheel and piggy matter | 1–4 MB lazy (per skin ~10–30 KB; all 336 skins would be far bigger) |
| 4 | Lucky Wheel + Piggy Bank + daily free coins + skip tickets | tiny configs, needs only phase 3 items | 100–200 KB UI art |
| 5 | Tournament race: 21 maps + resampled ghosts + local daily leaderboard and trophies | ghost format fully decoded; placement rules known | 1–2 MB lazy |
| 6 | Lucky Drop (Pachinko) | rules known except per-type board coordinates (one more asm pass on `BuildLevel`) | 150–250 KB |
| 7 | Cards + boosters + black market (33 cards, effects across all modes) | needs all modes in place to have effects to boost | 0.5–1 MB card art |
| 8 | Adventure: 8 tiers / 189 patterns, firewall, gravity zones, portals, 6 skills, tokens, weekly seeded board | largest mode and most UNKNOWNs (target types, rope length, rewards) | 0.5–1 MB |
| skip | IAP, VIP, ads, inbox, external links, A/B scheduler | ONLINE or monetisation only | 0 |

Open UNKNOWNs to resolve before the relevant phase:
- Phase 5: `RefineLevel`, the save fallback for diff 4, `GetNbWins`.
- Phase 6: per-type `BuildLevel` coordinates, minBonus/maxBonus %.
- Phase 8: ~~`TargetAdventure` types, rope_length use, end rewards~~ decoded 2026-10-28 (section 7).
- Phase 1: the exact Normal end-of-level `AddQuantity` resource.
