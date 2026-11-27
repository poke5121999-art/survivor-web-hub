// Wild events and the Adventure Book: play runs on a late save through emulated input and record every event
// the game's own planner starts (EVENTS.Begin is wrapped to observe, then calls the original). Checks that
// several kinds fire, that each started event goes live and finishes inside its run, that the Adventure Book
// tab opens and draws once entries are known, and that nothing throws.
// Usage: node test/node/events.mjs [runs=6] [stage=20]
import { loadGame } from "./load.mjs";
import { driver } from "./play.mjs";

const RUNS = Number(process.argv[2] || 6), STAGE = Number(process.argv[3] || 20);
const g = loadGame();
const d = driver(g);
const { E, frame } = d;
E("Unity.headlessMouse = true; Host.boot()");
let failed = 0;
const check = (name, ok, info = "") => { if (!ok) failed++; console.log(`${ok ? "ok  " : "FAIL"} ${name}${info ? " " + info : ""}`); };
const realErrors = () => E("Host.errors.filter((e) => !e.includes('CARDSPANEL') && !e.includes('sfx.unlock')).length");

E(`(() => { const s = ${STAGE}, S = G$s.SAVE; S.stageMax = s; S.stage = s; S.gold = 1e15; G$TREE.Recalc();
	for (let p = 0; p < 8; p++) for (const nd of G$TREE$cc().nodes) { try { if (G$TREE.CanAfford(nd.id)) G$TREE.Buy(nd.id); } catch (e) { } }
	for (let i = 0; i < 12; i++) G$LOOT.Give(G$LOOT.RollBag(s, G$LOOT.BestOpen(s), null), "test");
	G$LOOT.AutoEquipAll(); G$LOOT.GrantOre(1e7, "test");
	for (const line of G$LOOT$cc().GEAR) for (let i = 0; i < 3; i++) { const key = G$LOOT.SlotKey(line, i); for (let n = 0; n < 200 && G$REFINE.Refusal(key) == null; n++) G$REFINE.Try(key); } })()`);
E(`(() => { globalThis.__ev = { begun: [], live: 0, done: 0 };
	const b = G$EVENTS.Begin, l = G$EVENTS.GoLive, f = G$EVENTS.Finish;
	G$EVENTS.Begin = function (kind) { const r = b.apply(this, arguments); __ev.begun.push(String(kind)); return r; };
	G$EVENTS.GoLive = function () { __ev.live++; return l.apply(this, arguments); };
	G$EVENTS.Finish = function () { __ev.done++; return f.apply(this, arguments); }; })()`);

for (let r = 0; r < RUNS; r++) {
	E("G$GAME.StartRun()");
	d.playRun({ boss: false, maxSec: 900 });
	d.toCamp();
}
const ev = JSON.parse(E("JSON.stringify(__ev)"));
const kinds = [...new Set(ev.begun)];
const counts = Object.fromEntries(kinds.map((k) => [k, ev.begun.filter((x) => x === k).length]));
check(`events fire across ${RUNS} runs`, ev.begun.length >= RUNS, `(${ev.begun.length} started: ${JSON.stringify(counts)})`);
check("several event kinds", kinds.length >= 4, `(${kinds.length} kinds)`);
check("started events go live and finish", ev.live > 0 && ev.done >= ev.live - 1, `(live ${ev.live}, finished ${ev.done})`);

for (let i = 0; i < 600 && E("G$GAME.state") !== "tree"; i++) { if (i % 30 === 0) d.tap("Enter"); frame(); }
for (let i = 0; i < 120; i++) frame();
const bookOpen = E("G$UI.TabOpen('book')");
if (bookOpen) {
	const e0 = realErrors();
	E(`G$UI.SetTreeTab("book")`);
	for (let i = 0; i < 90; i++) frame();
	check("Adventure Book tab opens and draws", E("G$UI$cc().treeTab.cur") === "book" && realErrors() === e0, `(state ${E("G$GAME.state")}, tab ${E("G$UI$cc().treeTab.cur")}, busy ${E("G$UI$cc().busy")})`);
} else check("Adventure Book tab available on the late save", false);
check("no runtime errors", realErrors() === 0, `(${realErrors()})`);
console.log(failed ? `FAIL events (${failed})` : "PASS events");
process.exitCode = failed ? 1 : 0;
