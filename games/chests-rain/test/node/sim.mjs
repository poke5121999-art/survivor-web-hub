// Pure-JS sim test: boots the translated game in node (null graphics/audio) and checks shipped-build facts,
// one played run through emulated input, and the save round trip.
import { loadGame } from "./load.mjs";

const g = loadGame();
const E = (s) => g.eval(s);
let failed = 0;
function check(name, got, want) {
	const ok = JSON.stringify(got) === JSON.stringify(want);
	if (!ok) failed++;
	console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${JSON.stringify(got)}${ok ? "" : " (want " + JSON.stringify(want) + ")"}`);
}

E("Unity.headlessMouse = true; Host.boot()");
check("boot errors (cards panel GPU layer excluded in node)", E("Host.errors.filter(e => !e.includes('CARDSPANEL') && !e.includes('sfx.unlock')).length"), 0);
check("flavour FULL.On", E("G$FULL.On"), true);
check("BUILD.demo", E("G$BUILD.demo"), false);
check("BUILD.LastStage", E("G$BUILD.LastStage"), 20);
check("stage count", E("G$DATA.stages.length"), 20);
check("map names", E("G$DATA.maps.map(m => m.name)"), ["Meadow", "Forest", "Snowy Mountains", "Desert Canyon", "Swamp", "Coast", "Volcano", "Crystal Caves", "Ruins", "Sky Islands"]);
check("boss of map 0", E("G$DATA.bosses.get('meadow').name"), "Queen Gloop");
check("ECON.RUN_BASE", E("G$ECON.RUN_BASE"), 150);
check("ECON.HP_K[0..2]", E("Array.from(G$ECON.HP_K.slice(0, 3))"), [0.75, 2.9, 2.7]);
check("title state", E("G$GAME.state"), "title");

// One run through emulated input: click NEW GAME, place heroes, sweep loot, dismiss popups.
const frame = () => E("Host.frame(1/60)");
const mouse = (x, y) => E(`Unity.mouseMove(${x * 2}, ${y * 2})`);
const click = (x, y) => { mouse(x, y); E("Unity.mouseButton(0, true)"); frame(); E("Unity.mouseButton(0, false)"); frame(); };
for (let i = 0; i < 60; i++) frame();
click(320, 248);
let f = 0;
while (E("G$GAME.state") !== "tree" && f < 60 * 240) {
	const st = E("G$GAME.state");
	if (st === "run") {
		mouse(320 + Math.cos(f / 20) * 250, 180 + Math.sin(f / 13) * 140);
		if (f % 40 === 0) click(200 + (f * 7) % 240, 120 + (f * 13) % 120);
	}
	if (f % 120 === 60) { E("Unity.domKey('Enter', true)"); frame(); E("Unity.domKey('Enter', false)"); }
	frame();
	f++;
}
check("reached camp after one run", E("G$GAME.state"), "tree");
check("runs recorded", E("G$s.SAVE.runs"), 1);
const gold = E("G$s.SAVE.gold");
check("earned gold > 0", gold > 0, true);
const keys = [...g.store.keys()];
check("save written to localStorage", keys.some((k) => k.includes("arrowstorm.save.v4")), true);

// Save round trip: a fresh load of the same storage restores the run count and gold.
E("G.LoadGame()");
check("reload runs", E("G$s.SAVE.runs"), 1);
check("reload gold", E("G$s.SAVE.gold"), gold);
console.log(failed ? `FAIL sim (${failed})` : "PASS sim");
process.exitCode = failed ? 1 : 0;
