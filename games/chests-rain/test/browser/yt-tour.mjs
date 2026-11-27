// Parity tour against the full-game walkthrough clip (s_6SEukyh5M): one 1280x720 shot per state key, each from a
// fresh page. The save is set up through the game's own API for the stage the clip shows (stage opened, tree
// bought, gear rolled and refined like a player at that point), then the state is reached with real input.
// Usage: node yt-tour.mjs <outDir> [key...]
import { open, ready } from "./util.mjs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../..");
const outDir = process.argv[2] || "/tmp";
const only = new Set(process.argv.slice(3));

const BIOMES = ["meadow", "forest", "snow", "desert", "swamp", "coast", "volcano", "crystal", "ruins", "sky"];
const STATES = [
	{ key: "camp-tree", stage: 3, camp: "tree" },
	{ key: "camp-warband", stage: 6, camp: "warband", sub: [347, 48] },
	{ key: "camp-refine", stage: 6, camp: "warband", sub: [283, 48] },
	{ key: "camp-cards", stage: 6, camp: "cards" },
	{ key: "camp-shop", stage: 14, camp: "shop" },
	{ key: "camp-quests", stage: 18, camp: "quests", keys: 1 },
	{ key: "camp-book", stage: 15, camp: "book" },
	{ key: "results", stage: 9, results: true },
	{ key: "loot", stage: 3, loot: true },
	...Array.from({ length: 20 }, (_, i) => ({ key: `run-s${String(i + 1).padStart(2, "0")}`, stage: i + 1, sec: 18 })),
	...BIOMES.map((b, i) => ({ key: `boss-${b}`, stage: i * 2 + 1, boss: true })),
	{ key: "finale", stage: 20, finale: true },
	{ key: "survival-map", stage: 20, survival: "map" },
	{ key: "survival-pick", stage: 20, survival: "pick" },
	{ key: "survival-hud", stage: 20, survival: "hud" },
];

async function setup(page, stage, keys) {
	await page.evaluate(([s, keys]) => {
		G$TUTORIAL.SkipAll();
		const S = G$s.SAVE; S.stageMax = Math.max(S.stageMax, s); S.stage = s; S.gold = 1e15; G$TREE.Recalc();
		for (let p = 0; p < 8; p++) for (const nd of G$TREE$cc().nodes) { try { if (G$TREE.CanAfford(nd.id)) G$TREE.Buy(nd.id); } catch (e) { } }
		for (let i = 0; i < 6; i++) G$LOOT.Give(G$LOOT.RollBag(s, G$LOOT.BestOpen(s), null), "tour");
		G$LOOT.AutoEquipAll(); G$LOOT.GrantOre(1e6, "tour");
		for (const line of G$LOOT$cc().GEAR) for (let i = 0; i < 3; i++) { const key = G$LOOT.SlotKey(line, i); for (let n = 0; n < 200 && G$REFINE.Refusal(key) == null; n++) G$REFINE.Try(key); }
		for (let b = 1; b < s; b++) { if (!S.stageBoss) S.stageBoss = new $Dict(); S.stageBoss.set(b, 1); }
		if (keys) G$LOOT.AddKeys(keys);
		S.gold = 12345; G.SaveGame();
	}, [stage, keys || 0]);
}

const state = (page) => page.evaluate(() => ({ st: G$GAME.state, ch: !!G$GAME.challenge, offer: G$GAME.ChallengeOffered && G$GAME.ChallengeOffered(),
	boss: (() => { const b = G$GAME.boss, c = G$E.cam; return b && !b.dead ? [b.x - (c.x + G$E.ViewWidth() / 2), b.y - (c.y + G$E.ViewHeight() / 2)] : null; })() }));
const wander = async (page) => { await page.mouse.move(640 + Math.cos(Date.now() / 400) * 300, 360 + Math.sin(Date.now() / 300) * 200, { steps: 3 }); await page.waitForTimeout(200); };

for (const st of STATES) {
	if (only.size && !only.has(st.key)) continue;
	const { page, close } = await open(root);
	try {
		await ready(page);
		await page.waitForTimeout(1500);
		await setup(page, st.stage, st.keys);
		if (st.camp) {
			await page.evaluate(() => G$GAME.OpenTree());
			await page.waitForTimeout(1500);
			await page.evaluate((tab) => G$UI.SetTreeTab(tab), st.camp);
			await page.waitForTimeout(1500);
			if (st.sub) { await page.mouse.click(st.sub[0] * 2, st.sub[1] * 2); await page.waitForTimeout(1200); }
			await page.mouse.move(1270, 700);
			await page.waitForTimeout(600);
		} else if (st.survival) {
			await page.evaluate(() => { const S = G$s.SAVE; S.stageBoss.set(20, 1); S.endless = S.endless || new EndlessSave(); S.endless.open = true; G$GAME.OpenTree(); });
			await page.waitForTimeout(1500);
			if (st.survival === "map") {
				await page.evaluate(() => { G$UI.OpenStagePanel(); });
				await page.waitForTimeout(1200);
				await page.evaluate(() => G$UI.SelectEndless());
				await page.waitForTimeout(2500);
			} else {
				await page.evaluate(() => G$ENDLESS.Start("normal"));
				await page.waitForTimeout(800);
				const t0 = Date.now();
				while (Date.now() - t0 < (st.survival === "hud" ? 100000 : 300000)) {
					const p = await page.evaluate(() => [G$ENDLESS.Picking, G$TUTORIAL$cc().enCur != null]);
					if (p[1]) { await page.keyboard.press("Enter"); await page.waitForTimeout(300); continue; }
					if (p[0]) {
						if (st.survival === "pick") { await page.waitForTimeout(1200); break; }
						await page.keyboard.press("Digit1");
					}
					if (Date.now() % 5000 < 400) await page.mouse.click(500 + Math.cos(Date.now() / 700) * 200, 360 + Math.sin(Date.now() / 500) * 120);
					await wander(page);
				}
			}
		} else if (st.finale) {
			await page.evaluate(() => { G$s.SAVE.stageBoss.set(20, 1); G$GAME.OpenTree(); G$UI.FinaleStart(); });
			for (let i = 0; i < 60; i++) {
				const f = await page.evaluate(() => [G$UI$cc().fin.act, G$UI$cc().fin.t]);
				if (f[0] === 2 && f[1] > 2.6) break;
				if (f[0] < 2 && f[1] > 1.5) await page.keyboard.press("Enter");
				await page.waitForTimeout(500);
			}
		} else {
			await page.evaluate(() => G$GAME.StartRun());
			await page.waitForTimeout(800);
			for (let i = 0; i < 3; i++) { await page.mouse.click(560 + i * 80, 330 + (i % 2) * 60); await page.waitForTimeout(300); }
			const t0 = Date.now();
			const limit = st.sec ? st.sec * 1000 : 300000;
			while (Date.now() - t0 < limit) {
				const s = await state(page);
				if (s.st !== "run" && s.st !== "end" && !st.results) break;
				if (st.loot) { await page.waitForFunction(() => G$GAME.chest && G$GAME.chest.phase === "gather", null, { timeout: 300000, polling: 30 }); for (let i = 0; i < 10; i++) { await page.screenshot({ path: `${outDir}/../web-seq/loot-${i}.png` }); await page.waitForTimeout(150); } break; }
				if (st.results && s.st === "results") { await page.waitForFunction(() => G$UI$cc().rp.built && G$UI$cc().rp.panelT > 3 && G$UI$cc().rp.panelT < 1e6, null, { timeout: 120000, polling: 200 }).catch(() => {}); await page.waitForTimeout(1500); break; }
				if (st.results && s.st === "end") { await page.waitForTimeout(500); continue; }
				if (st.boss && s.ch) { await page.waitForTimeout(5000); break; }
				if (st.boss && s.boss) {
					const keys = [];
					if (s.boss[0] > 60) keys.push("KeyD"); else if (s.boss[0] < -60) keys.push("KeyA");
					if (s.boss[1] > 60) keys.push("KeyS"); else if (s.boss[1] < -60) keys.push("KeyW");
					for (const k of keys) await page.keyboard.down(k);
					await page.waitForTimeout(250);
					for (const k of keys) await page.keyboard.up(k);
					if (s.offer) await page.keyboard.press("Space");
				} else await wander(page);
			}
		}
		await page.screenshot({ path: `${outDir}/${st.key}.png` });
		console.log("shot", st.key, await page.evaluate(() => `${G$GAME.state} stage ${G$s.SAVE.stage} errors ${Host.errors.length}`));
	} catch (e) {
		console.log("FAIL", st.key, String(e).slice(0, 200));
	} finally {
		await close();
	}
}
