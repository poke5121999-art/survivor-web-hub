// Progression harness: for every stage 1..20, open the stage in the save (stageMax), give gold, buy every
// available tree node through the game's TREE API, then play one run through emulated input (place heroes,
// sweep loot, pan to the boss and press Space). Records per stage: run ended normally, boss challenge started,
// boss beaten, gold earned, runtime errors. This checks every stage's content runs; it does not judge pacing.
// Usage: node test/node/stages.mjs [firstStage=1] [lastStage=20]
import { loadGame } from "./load.mjs";

const first = Number(process.argv[2] || 1), last = Number(process.argv[3] || 20);
const g = loadGame();
const E = (s) => g.eval(s);
E("Unity.headlessMouse = true; Host.boot()");

const frame = () => E("Host.frame(1/60)");
const mouse = (x, y) => E(`Unity.mouseMove(${x * 2}, ${y * 2})`);
const held = {};
const setKeys = (want) => {
	for (const k of ["KeyW", "KeyA", "KeyS", "KeyD"]) {
		const on = want.has(k);
		if (on !== !!held[k]) { E(`Unity.domKey("${k}", ${on})`); held[k] = on; }
	}
};
const tap = (code) => { E(`Unity.domKey("${code}", true)`); frame(); E(`Unity.domKey("${code}", false)`); };
const click = (x, y) => { mouse(x, y); E("Unity.mouseButton(0, true)"); frame(); E("Unity.mouseButton(0, false)"); };

let failed = 0;
for (let s = first; s <= last; s++) {
	const errs0 = E("Host.errors.length");
	E(`(() => { const S = G$s.SAVE; S.stageMax = Math.max(S.stageMax, ${s}); S.stage = ${s}; S.gold += 1e12; G.SaveGame(); G$TREE.Recalc(); })()`);
	E(`(() => { for (let pass = 0; pass < 8; pass++) for (const nd of G$TREE$cc().nodes) { try { if (G$TREE.CanAfford(nd.id)) G$TREE.Buy(nd.id); } catch (e) { } } })()`);
	E("G$GAME.StartRun()");
	const gold0 = E("G$s.SAVE.gold");
	let challenged = false, f = 0, ended = false;
	const beatenBefore = E(`G$GAME.BossBeaten(${s})`);
	while (f < 60 * 300) {
		const st = E("G$GAME.state");
		if (st !== "run" && st !== "end") { ended = true; break; }
		if (f % 90 === 45) tap("Enter");
		if (st === "run") {
			if (f % 50 === 0) click(250 + (f * 7) % 140, 140 + (f * 13) % 80);
			const nav = E(`(() => { const b = G$GAME.boss, c = G$E.cam; if (!b || b.dead || G$GAME.challenge) return null; return [b.x - (c.x + G$E.ViewWidth() / 2), b.y - (c.y + G$E.ViewHeight() / 2), G$GAME.ChallengeOffered()]; })()`);
			const want = new Set();
			if (nav) {
				if (nav[0] > 60) want.add("KeyD"); else if (nav[0] < -60) want.add("KeyA");
				if (nav[1] > 60) want.add("KeyS"); else if (nav[1] < -60) want.add("KeyW");
				if (nav[2] && f % 30 === 0) tap("Space");
			} else if (E("G$GAME.challenge")) {
				challenged = true;
				const b = E("(() => { const b = G$GAME.boss, c = G$E.cam; return b ? [b.x - c.x, b.y - c.y] : null; })()");
				if (b) mouse(Math.max(10, Math.min(630, b[0])), Math.max(10, Math.min(350, b[1])));
			}
			setKeys(want);
			if (!nav && !E("G$GAME.challenge")) mouse(320 + Math.cos(f / 20) * 250, 180 + Math.sin(f / 13) * 140);
		}
		frame();
		f++;
	}
	setKeys(new Set());
	const beaten = E(`G$GAME.BossBeaten(${s})`);
	const newErrs = E("Host.errors.length") - errs0;
	const ok = ended && newErrs === 0;
	if (!ok) failed++;
	console.log(`${ok ? "ok  " : "FAIL"} stage ${String(s).padStart(2)} ${E(`G$DATA.stages[${s - 1}].name`).padEnd(26)} ended ${ended} challenge ${challenged} boss beaten ${beaten && !beatenBefore} gold +${Math.round(E("G$s.SAVE.gold") - gold0)} errors ${newErrs}`);
	for (const e of E(`Host.errors.slice(${errs0}, ${errs0 + 3})`)) console.log("   ", e.split("\n").slice(0, 3).join(" | ").slice(0, 300));
	for (let i = 0; i < 120 && E("G$GAME.state") !== "tree"; i++) { if (i % 30 === 0) tap("Enter"); frame(); }
}
console.log(failed ? `FAIL stages (${failed})` : "PASS stages");
process.exitCode = failed ? 1 : 0;
