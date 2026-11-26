// Self-play bot: plays the translated game in node through emulated mouse/keyboard input (title, hero
// placement, loot sweeping, popups, boss challenge) and the game's own TREE API in camp. Logs state
// changes and progress, and fails on stalls or runtime errors.
// Usage: node test/node/bot.mjs [gameMinutes=20] [seed]
import { loadGame } from "./load.mjs";

const minutes = Number(process.argv[2] || 20);
const g = loadGame();
g.eval("Unity.headlessMouse = true; Host.boot()");
const bootErrors = g.eval("Host.errors.length");
const E = (s) => g.eval(s);

const W = 1280, H = 720, K = 2;
const mouse = (gx, gy) => E(`Unity.mouseMove(${gx * K}, ${gy * K})`);
const press = (b, down) => E(`Unity.mouseButton(${b}, ${down})`);
const key = (code, down) => E(`Unity.domKey(${JSON.stringify(code)}, ${down})`);
const frame = () => E("Host.frame(1/60)");

let t = 0, lastState = "", stateSince = 0, lastProgressT = 0, lastProgress = "";
const log = [];
const taps = [];
function tap(gx, gy) { taps.push(["move", gx, gy], ["down"], ["up"]); }
function keyTap(code) { taps.push(["kd", code], ["ku", code]); }

function progress() {
	return E(`JSON.stringify({ st: G$GAME.state, stage: G$s.SAVE.stage, max: G$s.SAVE.stageMax, gold: Math.floor(G$s.SAVE.gold), runs: G$s.SAVE.runs })`);
}

const held = {};
let sweep = 0, buys = 0, runsStarted = 0, boughtThisCamp = false;
const totalFrames = minutes * 60 * 60;
for (let f = 0; f < totalFrames; f++) {
	t = f / 60;
	if (taps.length) {
		const a = taps.shift();
		if (a[0] === "move") mouse(a[1], a[2]);
		else if (a[0] === "down") press(0, true);
		else if (a[0] === "up") press(0, false);
		else if (a[0] === "kd") key(a[1], true);
		else if (a[0] === "ku") key(a[1], false);
	} else {
		const st = E("G$GAME.state");
		if (st !== lastState && st !== "run") for (const k of Object.keys(held)) if (held[k]) { key(k, false); held[k] = false; }
		if (st !== lastState) { log.push(`${t.toFixed(1)}s state ${lastState} -> ${st}`); lastState = st; stateSince = t; }
		const inState = t - stateSince;
		if (st === "title" && inState > 1 && f % 60 === 0) tap(320, 248);
		else if (st === "run") {
			// Pan the camera toward the sleeping boss with held WASD keys so the challenge is offered.
			const nav = E(`(() => { const b = G$GAME.boss, c = G$E.cam; if (!b || b.dead || G$GAME.challenge) return null; return [b.x - (c.x + G$E.ViewWidth() / 2), b.y - (c.y + G$E.ViewHeight() / 2), G$GAME.ChallengeOffered()]; })()`);
			const want = new Set();
			if (nav) {
				const [dx, dy, offered] = nav;
				if (dx > 60) want.add("KeyD"); else if (dx < -60) want.add("KeyA");
				if (dy > 60) want.add("KeyS"); else if (dy < -60) want.add("KeyW");
				if (offered && f % 30 === 0) keyTap("Space");
			}
			for (const k of ["KeyW", "KeyA", "KeyS", "KeyD"]) {
				const on = want.has(k);
				if (on !== !!held[k]) { key(k, on); held[k] = on; }
			}
			sweep += 1 / 60;
			const gx = 320 + Math.cos(sweep * 2.1) * 260 * Math.sin(sweep * 0.37);
			const gy = 180 + Math.sin(sweep * 3.3) * 140;
			mouse(gx, gy);
			if (f % 45 === 0) tap(200 + Math.random() * 240, 120 + Math.random() * 120);
			if (f % 120 === 30) keyTap("Enter");
		} else if (st === "end" || st === "results" || st === "collect") {
			mouse(320 + Math.cos(t * 3) * 100, 180 + Math.sin(t * 3) * 60);
			if (f % 90 === 0) keyTap("Enter");
			if (f % 90 === 45) tap(320, 300);
		} else if (st === "tree") {
			if (inState > 0.5 && !boughtThisCamp) {
				boughtThisCamp = true;
				const n = E(`(() => { let n = 0; for (let pass = 0; pass < 5; pass++) for (const nd of G$TREE$cc().nodes) { try { if (G$TREE.CanAfford(nd.id) && G$TREE.Buy(nd.id)) n++; } catch (e) { } } return n; })()`);
				buys += n;
				log.push(`${t.toFixed(1)}s camp bought ${n} nodes, ${progress()}`);
			}
			if (inState > 1.5) { E("G$GAME.StartRun()"); runsStarted++; boughtThisCamp = false; }
		}
		if (inState > 240) { log.push(`STALL in ${st} for ${inState.toFixed(0)}s at ${t.toFixed(0)}s ${progress()}`); break; }
	}
	try { frame(); } catch (e) { log.push(`FRAME ERROR at ${t.toFixed(1)}s: ${e.stack.split("\n").slice(0, 4).join(" | ")}`); break; }
	if (f % 3600 === 0) log.push(`${t.toFixed(0)}s ${progress()}`);
}
const errs = E("Host.errors");
console.log(log.join("\n"));
console.log("final", progress(), "buys", buys, "runs started", runsStarted);
console.log("new runtime errors", errs.length - bootErrors);
for (const e of errs.slice(bootErrors, bootErrors + 8)) console.log(" -", e.split("\n").slice(0, 4).join(" | ").slice(0, 400));
const stalled = log.some((l) => l.startsWith("STALL") || l.startsWith("FRAME ERROR"));
const newErrors = errs.length - bootErrors;
console.log(stalled || newErrors ? "FAIL bot" : "PASS bot (no stall, no runtime error)");
process.exitCode = stalled || newErrors ? 1 : 0;
