// Campaign harness: beats the boss of each stage in order and checks that the game itself opens the next stage
// (SAVE.stageMax moves only through the run results), and that Endless opens after the stage-20 boss.
// Before each attempt the save is funded, every affordable tree node bought and every shown trial accepted (trial
// nodes open for purchase once their trial is done in a run), a dozen item bags of the stage's best rarity rolled
// and auto-equipped, and every gear slot refined up to the stage's cap, so this proves the stage chain
// and the boss fights, not the economy's pacing. Up to `tries` attempts per stage.
// Usage: node test/node/campaign.mjs [first=1] [last=20] [tries=6]
// A first stage above 1 starts from a save where stageMax = first (the earlier stages are another chunk's job).
import { loadGame } from "./load.mjs";
import { driver } from "./play.mjs";

const first = Number(process.argv[2] || 1), last = Number(process.argv[3] || 20), tries = Number(process.argv[4] || 6);
const g = loadGame();
const d = driver(g);
const { E } = d;
E("Unity.headlessMouse = true; Host.boot()");
if (first > 1) E(`(() => { const S = G$s.SAVE; S.stageMax = ${first}; S.stage = ${first}; G.SaveGame(); })()`);

let failed = 0;
for (let s = first; s <= last; s++) {
	const errs0 = E("Host.errors.length");
	let beaten = false, attempt = 0, info = [];
	while (!beaten && attempt < tries) {
		attempt++;
		E(`(() => { const S = G$s.SAVE; S.gold += 1e12; S.stage = ${s}; G$TREE.Recalc();
			for (let p = 0; p < 8; p++) for (const nd of G$TREE$cc().nodes) { try { if (G$TREE.CanAfford(nd.id)) G$TREE.Buy(nd.id); } catch (e) { } }
			for (const t of G$TRIALS$cc().ALL) G$TRIALS.Accept(t.node);
			for (let i = 0; i < 12; i++) G$LOOT.Give(G$LOOT.RollBag(${s}, G$LOOT.BestOpen(${s}), null), "test");
			G$LOOT.AutoEquipAll();
			G$LOOT.GrantOre(1e7, "test");
			for (const line of G$LOOT$cc().GEAR) for (let i = 0; i < 3; i++) {
				const key = G$LOOT.SlotKey(line, i);
				for (let n = 0; n < 200 && G$REFINE.Refusal(key) == null; n++) G$REFINE.Try(key);
			} })()`);
		const kit = E(`(() => { const out = []; for (const line of G$LOOT$cc().GEAR) { const w = G$LOOT.Worn(line); out.push(line + ":" + (w ? w.filter(Boolean).length : 0) + "/+" + G$LOOT.LineLevel(line)); } return out.join(" "); })()`);
		E("G$GAME.StartRun()");
		const stageNow = E("G$s.SAVE.stage");
		const r = d.playRun({ boss: true, maxSec: 900 });
		const hpLeft = Math.round(r.bossLeft * 100);
		d.toCamp();
		beaten = E(`G$GAME.BossBeaten(${s})`);
		info.push(`${attempt === 1 ? "kit " + kit + " " : ""}${stageNow === s ? "" : "WRONG-STAGE " + stageNow + " "}${r.challenged ? (beaten ? "won" : `lost(${hpLeft}%)`) : "no-fight"}`);
	}
	const next = E("G$s.SAVE.stageMax");
	const opens = s < 20 ? next === s + 1 : E("G$ENDLESS.Open") === true;
	const errs = E("Host.errors.length") - errs0;
	const ok = beaten && opens && errs === 0;
	if (!ok) failed++;
	console.log(`${ok ? "ok  " : "FAIL"} stage ${String(s).padStart(2)} ${E(`G$DATA.stages[${s - 1}].name`).padEnd(26)} boss ${beaten ? "beaten" : "standing"} after ${attempt} [${info.join(", ")}] ${s < 20 ? `stageMax ${next}` : `endless open ${E("G$ENDLESS.Open")}`} errors ${errs}`);
	for (const e of E(`Host.errors.slice(${errs0}, ${errs0 + 3})`)) console.log("   ", e.split("\n").slice(0, 3).join(" | ").slice(0, 300));
	if (!beaten) break;
}
console.log(failed ? `FAIL campaign ${first}-${last} (${failed})` : `PASS campaign ${first}-${last}`);
process.exitCode = failed ? 1 : 0;
