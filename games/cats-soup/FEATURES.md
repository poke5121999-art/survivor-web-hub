# Adding a system of the original game (feature module)

Cats&Soup web (`games/cats-soup`) grows one system at a time. Each system is a feature module pair registered in
`js/sim/registry.js` and `js/view/registry.js`; the contract is written at the top of those two files. Read them,
`README.md`, `js/sim/game.js`, `js/view/hud.js` and `js/main.js` before starting.

## Files a feature owns

For feature `<id>` you write only these, so several agents can work at once without touching each other's files:

- `js/sim/features/<id>.js`: rules, pure JS (no DOM, no THREE). State lives in `game.state.<id>`, created in `init`.
- `js/view/features/<id>.js`: HUD buttons, panels, 3D extras, tap handling.
- `css/<id>.css`: styles, loaded from `mount` with `ctx.css('css/<id>.css')`.
- `tools/export_<id>.py`: writes `data/<id>.json` (only the table columns the feature uses) and any art.
- `data/<id>.json`, `art/<id>/` (3D exports), `art/ui/panels/*.json` the feature exported.
- `test/cats-soup-<id>.js` (node, rules) and `test/cats-soup-<id>-play.js` (Playwright, the real page).
- `D:\catsoup-ref\rules\<id>.md`: the rules with citations.

Do not edit core or shared files: `js/sim/game.js`, `js/sim/registry.js`, `js/sim/boot.js`, `js/view/*.js` outside
`features/`, `js/main.js`, `index.html`, `css/game.css`, `data/tables.json`, `art/ui/atlases.json`, `art/ui/hud.json`.
If the feature needs a core hook that does not exist, work around it inside your files and name the hook you needed in
your report. No git command that writes (add, commit, stash, checkout, reset); the coordinator commits and deploys.

## Sources (all on this PC)

- Tables: `D:\catsoup-ref\flat\<Table>.json` (`Fish.json`, `Quest.json`, ...). Values are already plain (ObscuredTypes resolved to `fakeValue`).
- Strings: `data/lang-vi.json` (the official Vietnamese of the original; `ctx.t(key, ...args)` fills `{0}`). Use the
  original keys; do not invent UI text where the original has a string.
- Code: Ghidra decompile `D:\catsoup-ref\udk\decomp\Assembly-CSharp\<Class>.c`, method list `D:\catsoup-ref\udk\methods.tsv`,
  class layouts `D:\catsoup-ref\il2cpp-dump\dump.cs`. Existing rules: `D:\catsoup-ref\rules\{economy,cats,map,specials}.md`.
  Cite `File.c:line` for every rule; mark anything not read from code as `(inferred)`.
- UI layouts: `py -3.12 -I tools/export_ui.py --prefab ui/<group>/<name> ...` writes `art/ui/panels/<name>.json`
  (same node format as `art/ui/hud.json`); build with `ctx.ng.build(node)` and find children with `find(el, 'a/b')`
  from `js/view/ngui.js`. All 31 NGUI atlases are in `art/ui`. Prefab list: `D:\catsoup-ref\resources.json`
  (`[path, file, ...]`), UI prefabs under `ui/`.
- 3D: `py -3.12 -I tools/export_prefabs.py <out> <resources path or file:pathid>...` writes `art/<out>/scene.json` +
  `geo.glb`; load with `loadLib` from `js/view/world.js` and `lib.instantiate(key)`. Every facility is already exported.
- Python reads one asset file at a time through `D:\catsoup-ref\tools\cns.py`; never load the whole Data folder (tens of
  GB of commit on a shared PC). Run Python as `py -3.12 -I` and call `sys.stdout.reconfigure(encoding='utf-8')`.
  A hook blocks shell commands that contain `cns.env`; write scripts to a file and use `getattr(cns, "env")`.

## Core hooks that exist

- `game.reward(type, value, extra)`: types 1 gold, 2 energy, 3 gems, 4 coins in core; other types go to the first
  feature whose `rewards` lists the type (registry order).
- `mult(game, kind, arg)` on a sim feature: a factor core multiplies into `price(food)` (kind `'price'`, arg = Food row)
  and rest energy (kind `'energy'`, arg = rest work record). Use it for any "+x % price / energy" effect.
- Items kept as counts: a sim feature that stores items exposes `bag(game)` (its `{type: n}` map); everyone counts and
  spends through `game.itemCount(type)` / `game.spendItem(type, n)`, never another feature's state.
- `game.isNight()` (day/night clock in core), `game.feat.<id>` for another feature's actions (check it exists).
- Facility layout: `game.moveWork`, `keepWork`, `keepOut`, `setMapSize`; stored facilities sit in `game.state.storage`.
- Events (`onEvent`): core emits `sell`, `food`, `build`, `upgrade`, `recipe`, `energy`, `jar`, `expand`,
  `expandReward`, `resize`, `move`, `keep`, `keepOut`, `reward`, `day`, `night`. Features emit: specials `chest`,
  `balloon`, `crane`, `basketball`, `specialorder`, `trade`, `bgm`, `newday`; fishing `fish`, `fishCast`, `fishSell`,
  `fishHeart`; cats `heartLevel`, `catSwap`, `catGift`; missions `missionClaim`, `questClaim`, `attendClaim`.
  Emit an event for every player action of your feature so missions can count it.
- View hooks are isolated: a throwing `mount`/`update`/`onTap`/`onEvent` disables only that feature
  (`window.__failed()` lists them in the page). Play tests should assert `__failed().length === 0`.
- `ctx.ng.build(node)` resolves NGUI anchors, depth, tint (`color`), sliced sprites and label size/outline, so exported
  prefabs (`art/ui/panels/*.json`) can be used as they are; prefer them over hand-made DOM.

## Rules of the port

- Ads: an ad button stays and pays at once (hub rule from My Mini Mart). Real-money items: show them disabled.
- Server-only features (friends, visiting other players, rankings): leave out and say so.
- Reward types go through `game.reward(type, value, extra)`; a feature that grants a new type lists it in `rewards`.

## Done

- `node test/cats-soup-<id>.js` passes with literal expected values from the tables or rules.
- `node test/cats-soup-<id>-play.js` passes on the local page; `node test/cats-soup-sim.js` and
  `node test/cats-soup-play.js` still pass.
- A screenshot of each new panel (`node test/cats-soup-shot.js "index.html?..." out.png 540 960`) has been looked at.
- Every process you start has a timeout (`timeout 300 node ...`).

## HUD entry points

The original reaches most windows through facilities (tap -> your view's `onTap`) or the "more" quick menu (`bt_more`).
Do not add free-floating HUD buttons: register a quick-menu entry with
`ctx.hud.addMenu({ sec: 'cat' | 'forest' | 'minigame' | 'shop' | 'etc', key: '<lang key>', sprite: '<atlas sprite>', run })`.
Bind an existing HUD node of `art/ui/hud.json` with `ctx.hud.bind(path, fn)` when the original has one. In move mode
every child of `.hud` except `.panel` / `.toast` is hidden.
