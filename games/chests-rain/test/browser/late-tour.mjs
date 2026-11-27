// Parity tour for the later game, matching the Steam store shots (release UI): skill tree camp, warband, runs on
// the meadow, forest, snowy and desert biomes, the loot phase on snow, and a boss fight. Each state starts from a
// fresh page with a late save written through the game's own API, then plays with real input; 1280x720 shots.
// Usage: node late-tour.mjs <outDir> [key...]
import { open, ready } from "./util.mjs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../..");
const outDir = process.argv[2] || "/tmp";
const only = new Set(process.argv.slice(3));

// stage ids follow G$DATA.stages: 1 Meadow Morning, 3 Forest Morning, 5 Snowy Mountains Morning,
// 6 Snowy Mountains Night, 8 Desert Canyon Night.
const STATES = [
	{ key: "camp-tree", stage: 3, camp: "tree" },
	{ key: "camp-warband", stage: 10, camp: "warband" },
	{ key: "run-meadow", stage: 1, sec: 14 },
	{ key: "run-forest", stage: 3, sec: 20 },
	{ key: "run-snowy-night", stage: 6, sec: 14 },
	{ key: "run-desert-night", stage: 8, sec: 25 },
	{ key: "loot-snowy", stage: 5, loot: true },
	{ key: "boss-fight", stage: 1, boss: true },
];

async function setup(page, stage) {
	await page.evaluate((s) => {
		G$TUTORIAL.SkipAll();
		const S = G$s.SAVE; S.stageMax = Math.max(S.stageMax, s); S.stage = s; S.gold = 1e9; G$TREE.Recalc();
		for (let p = 0; p < 8; p++) for (const nd of G$TREE$cc().nodes) { try { if (G$TREE.CanAfford(nd.id)) G$TREE.Buy(nd.id); } catch (e) { } }
		S.gold = 99999; G.SaveGame();
	}, stage);
}

for (const st of STATES) {
	if (only.size && !only.has(st.key)) continue;
	const { page, close } = await open(root);
	try {
		await ready(page);
		await page.waitForTimeout(1500);
		await setup(page, st.stage);
		if (st.camp) {
			await page.evaluate(() => G$GAME.OpenTree());
			await page.waitForTimeout(1500);
			await page.evaluate((tab) => G$UI.SetTreeTab(tab), st.camp);
			await page.waitForTimeout(2000);
		} else {
			await page.evaluate(() => G$GAME.StartRun());
			await page.waitForTimeout(800);
			for (let i = 0; i < 3; i++) { await page.mouse.click(560 + i * 80, 330 + (i % 2) * 60); await page.waitForTimeout(300); }
			const t0 = Date.now();
			const limit = st.loot || st.boss ? 240000 : st.sec * 1000;
			while (Date.now() - t0 < limit) {
				const s = await page.evaluate(() => ({ st: G$GAME.state, ch: !!G$GAME.challenge, offer: G$GAME.ChallengeOffered && G$GAME.ChallengeOffered(),
					boss: (() => { const b = G$GAME.boss, c = G$E.cam; return b && !b.dead ? [b.x - (c.x + G$E.ViewWidth() / 2), b.y - (c.y + G$E.ViewHeight() / 2), b.x - c.x, b.y - c.y] : null; })() }));
				if (st.loot && s.st === "end") {
					// The burst comes a moment after TIME'S UP; keep the frames so the loot phase can be picked.
					for (let i = 0; i < 8; i++) { await page.waitForTimeout(400); await page.screenshot({ path: `${outDir}/${st.key}-t${i}.png` }); }
					break;
				}
				if (st.boss && s.ch) { await page.waitForTimeout(4000); break; }
				if (st.boss && s.boss) {
					const keys = [];
					if (s.boss[0] > 60) keys.push("KeyD"); else if (s.boss[0] < -60) keys.push("KeyA");
					if (s.boss[1] > 60) keys.push("KeyS"); else if (s.boss[1] < -60) keys.push("KeyW");
					for (const k of keys) await page.keyboard.down(k);
					await page.waitForTimeout(250);
					for (const k of keys) await page.keyboard.up(k);
					if (s.offer) await page.keyboard.press("Space");
				} else {
					await page.mouse.move(640 + Math.cos(Date.now() / 400) * 300, 360 + Math.sin(Date.now() / 300) * 200, { steps: 3 });
					await page.waitForTimeout(200);
				}
				if (s.st !== "run" && s.st !== "end") break;
			}
		}
		await page.screenshot({ path: `${outDir}/${st.key}.png` });
		console.log("shot", st.key, await page.evaluate(() => `${G$GAME.state} stage ${G$s.SAVE.stage} errors ${Host.errors.length}`));
	} finally {
		await close();
	}
}
