// Survival (Endless) end to end through player input: beat the stage 20 boss, watch the finale to its
// "PLAY SURVIVAL" step and press Enter, then play a whole Survival run with the keys a player uses (1-3 picks a
// level-up card and buys from the travelling cart, Esc leaves the cart, Enter closes the Survival lessons) until the horde overruns the squad,
// check the results and the saved records, press Enter (AGAIN) to start the next run, and finally boot a second
// game from the same localStorage to prove the records survive a reload.
// Before the stage 20 fight the save is funded and geared like campaign.mjs does.
// Usage: node test/node/endless.mjs   (spawns itself with --reload <storeFile> for the second boot)
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadGame } from "./load.mjs";
import { driver } from "./play.mjs";

let failed = 0;
const check = (name, ok, info = "") => { if (!ok) failed++; console.log(`${ok ? "ok  " : "FAIL"} ${name}${info ? " " + info : ""}`); };
const realErrors = (E) => E("Host.errors.filter((e) => !e.includes('CARDSPANEL') && !e.includes('sfx.unlock')).length");

if (process.argv[2] === "--reload") {
	const store = new Map(Object.entries(JSON.parse(fs.readFileSync(process.argv[3], "utf8"))));
	const g = loadGame({ storage: store });
	const E = g.eval;
	E("Unity.headlessMouse = true; Host.boot()");
	const want = JSON.parse(process.argv[4]);
	const rec = E("JSON.stringify((() => { const r = G$ENDLESS$cc().rec || G$s.SAVE.endless; return r && { bestTime: r.bestTime, bestLevel: r.bestLevel, mostKills: r.mostKills, runs: r.runs, open: G$ENDLESS.Open }; })())");
	const got = JSON.parse(rec);
	check("records survive a reload", got && got.bestTime === want.bestTime && got.bestLevel === want.bestLevel && got.mostKills === want.mostKills && got.open === true, rec);
	check("no runtime errors after the reload", realErrors(E) === 0);
	process.exit(failed ? 1 : 0);
}

const store = new Map();
const g = loadGame({ storage: store });
const d = driver(g);
const { E, frame, tap, mouse, click } = d;
E("Unity.headlessMouse = true; Host.boot()");

E(`(() => { const s = 20, S = G$s.SAVE; S.stageMax = s; S.stage = s; S.gold = 1e15; G$TREE.Recalc();
	for (let p = 0; p < 8; p++) for (const nd of G$TREE$cc().nodes) { try { if (G$TREE.CanAfford(nd.id)) G$TREE.Buy(nd.id); } catch (e) { } }
	for (const t of G$TRIALS$cc().ALL) G$TRIALS.Accept(t.node);
	for (let i = 0; i < 12; i++) G$LOOT.Give(G$LOOT.RollBag(s, G$LOOT.BestOpen(s), null), "test");
	G$LOOT.AutoEquipAll(); G$LOOT.GrantOre(1e7, "test");
	for (const line of G$LOOT$cc().GEAR) for (let i = 0; i < 3; i++) { const key = G$LOOT.SlotKey(line, i); for (let n = 0; n < 200 && G$REFINE.Refusal(key) == null; n++) G$REFINE.Try(key); } })()`);
check("Survival closed before the last boss", E("G$ENDLESS.Open") === false);
for (let a = 0; a < 6 && !E("G$GAME.BossBeaten(20)"); a++) {
	E("G$GAME.StartRun()");
	d.playRun({ boss: true, maxSec: 900 });
	if (!E("G$GAME.BossBeaten(20)")) d.toCamp();
}
check("stage 20 boss beaten", E("G$GAME.BossBeaten(20)") === true);
check("Survival opens after it", E("G$ENDLESS.Open") === true);

// Finale: Enter skips each act; on the last act the focused button is PLAY SURVIVAL.
let sawEndAct = false;
for (let f = 0; f < 60 * 120 && !E("G$ENDLESS$cc().active"); f++) {
	if (f % 45 === 0) tap("Enter");
	frame();
	if (E("G$UI$cc().fin.on && G$UI$cc().fin.act === 2")) sawEndAct = true;
}
check("finale reaches the SURVIVAL MODE UNLOCKED act", sawEndAct);
check("PLAY SURVIVAL starts a Survival run", E("G$ENDLESS$cc().active") === true && E("G$GAME.state") === "run");

// One whole Survival run.
const S = "(G$ENDLESS$s ?? G$ENDLESS$cc())";
let picks = 0, cartVisits = 0, cartSeqSeen = 0, bossesSeen = new Set(), maxLevel = 0, f = 0, lastLog = 0, bought = 0;
// Level-up pick: a new hero first, then the line with the fewest ranks taken (what the choice cards show).
const PICK = `(() => { const c = G$ENDLESS.Choices; let best = 0, bs = -1e9;
	for (let i = 0; i < Math.min(3, c.length); i++) { const v = (c[i].hero ? 10 : 0) + (c[i].cat <= 2 ? 5 : 0) - c[i].rank; if (v > bs) { bs = v; best = i; } }
	return best; })()`;
// The squad follows the view centre (GAME.cap), which WASD moves; walking it onto the cart opens the cart.
const CART = `(() => { const s = ${S}; if (!s.cartOn || s.cartOpen) return null; return [s.cartX - G$GAME.cap.x, s.cartY - G$GAME.cap.y]; })()`;
const held = {};
const walk = (want) => { for (const k of ["KeyW", "KeyA", "KeyS", "KeyD"]) { const on = want.has(k); if (on !== !!held[k]) { E(`Unity.domKey("${k}", ${on})`); held[k] = on; } } };
while (f < 60 * 60 * 45 && E("G$GAME.state") === "run") {
	if (E("G$TUTORIAL.ActiveModal != null || G$TUTORIAL$cc().enCur != null")) {
		tap("Enter");
	} else if (E("G$ENDLESS.Picking")) {
		const seq = E("G$ENDLESS.ChoiceSeq");
		tap(["Digit1", "Digit2", "Digit3"][E(PICK)]);
		if (E("G$ENDLESS.ChoiceSeq") !== seq || !E("G$ENDLESS.Picking")) picks++;
		else if (f % 20 === 0) tap("Enter");
	} else if (E(`${S}.cartOpen`)) {
		const seq = E(`${S}.cartSeq`);
		if (seq !== cartSeqSeen) { cartSeqSeen = seq; cartVisits++; }
		const before = E(`[0, 1, 2].filter((i) => G$ENDLESS.CartSold(i)).length`);
		for (const k of ["Digit1", "Digit2", "Digit3"]) tap(k);
		bought += E(`[0, 1, 2].filter((i) => G$ENDLESS.CartSold(i)).length`) - before;
		tap("Escape");
	} else {
		const cart = E(CART), want = new Set();
		if (cart) {
			if (cart[0] > 10) want.add("KeyD"); else if (cart[0] < -10) want.add("KeyA");
			if (cart[1] > 10) want.add("KeyS"); else if (cart[1] < -10) want.add("KeyW");
		}
		walk(want);
		if (f % 50 === 0) click(250 + (f * 7) % 140, 140 + (f * 13) % 80);
		else mouse(320 + Math.cos(f / 20) * 250, 180 + Math.sin(f / 13) * 140);
		if (f % 60 === 0) for (const k of ["Digit1", "Digit2", "Digit3", "Digit4", "ShiftRight"]) tap(k);
	}
	frame();
	f++;
	if (f % 60 === 0) {
		const st = JSON.parse(E(`JSON.stringify({ lv: ${S}.level, alive: ${S}.alive, cap: G$ENDLESS.Cap, over: G$ENDLESS.OverrunK, boss: [0, 1].filter((k) => G$ENDLESS.BossAlive(k) || ${S}.bossBeaten[k]) })`));
		maxLevel = Math.max(maxLevel, st.lv || 0);
		for (const k of st.boss) bossesSeen.add(k);
		const min = Math.floor(E(`${S}.survived`) / 60);
		if (min > lastLog) { lastLog = min; console.log(`     minute ${min}: level ${st.lv}, alive ${st.alive}/${st.cap}, overrun ${st.over.toFixed(2)}, picks ${picks}, cart ${cartVisits}/${bought}, bosses ${[...bossesSeen]}`); }
	}
}
const survived = E(`${S}.survived`);
check("the run ends by itself (horde overrun or victory)", E("G$GAME.state") !== "run", `(state ${E("G$GAME.state")} after ${(survived / 60).toFixed(1)} min)`);
check("level-ups offered and picked with the keys", picks > 0 && maxLevel > 1, `(${picks} picks, level ${maxLevel})`);
check("travelling cart visited", cartVisits > 0, `(${cartVisits} visits, ${bought} wares bought)`);
walk(new Set());
const beaten = E(`JSON.stringify(${S}.bossBeaten)`);
check("the minute-15 Survival boss shows up and falls", E(`${S}.bossBeaten[0]`) === true, `(seen ${[...bossesSeen]}, beaten ${beaten}, victory ${E(`${S}.victory`)})`);

for (let i = 0; i < 60 * 20 && E("G$GAME.state") !== "results"; i++) frame();
for (let i = 0; i < 60 * 4; i++) frame();
const rec = JSON.parse(E("JSON.stringify((() => { const r = G$ENDLESS$cc().rec; return r && { bestTime: r.bestTime, bestLevel: r.bestLevel, mostKills: r.mostKills, runs: r.runs }; })())"));
check("results screen shown", E("G$GAME.state") === "results");
check("records written", rec && rec.runs === 1 && Math.abs(rec.bestTime - survived) < 1 && rec.bestLevel >= 1 && rec.mostKills > 0, JSON.stringify(rec));
check("records saved to localStorage", [...store.values()].some((v) => v.includes('"endless"') && v.includes(String(rec && rec.mostKills))));

// AGAIN: Enter on the focused button starts the next Survival run from scratch.
for (let i = 0; i < 60 * 10 && !(E("G$GAME.state") === "run" && E(`${S}.survived`) < 5); i++) { if (i % 30 === 0) tap("Enter"); frame(); }
check("AGAIN starts a fresh Survival run", E("G$GAME.state") === "run" && E(`${S}.active`) === true && E(`${S}.survived`) < 5);
check("no runtime errors in Survival", realErrors(E) === 0, `(${realErrors(E)})`);

const file = path.join(fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "cr-endless-")), "store.json");
fs.writeFileSync(file, JSON.stringify(Object.fromEntries(store)));
const self = fileURLToPath(import.meta.url);
const child = spawnSync(process.execPath, [self, "--reload", file, JSON.stringify(rec)], { encoding: "utf8" });
process.stdout.write(child.stdout.split("\n").filter((l) => /^(ok|FAIL)/.test(l)).join("\n") + "\n");
if (child.status !== 0) failed++;
fs.rmSync(path.dirname(file), { recursive: true, force: true });
console.log(failed ? `FAIL endless (${failed})` : "PASS endless");
process.exitCode = failed ? 1 : 0;
