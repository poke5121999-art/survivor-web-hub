// Opens the camp Cards tab (G.CARDSPANEL) through the game's own API and checks that the panel renders:
// pixel variance on the overlay, card text and paintings batched, OS-font glyphs for tooltips, no new Host.errors.
// Run: ~/handoff/heavy.sh 600 3 node test/browser/cards-panel.mjs   (OUT=<dir> for screenshots, default /tmp)
import { open, ready } from "./util.mjs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../..");
const out = process.env.OUT || "/tmp";
const W = 1280, H = 720;
const { page, logs, close } = await open(root, { width: W, height: H });
let failed = 0;
const check = (ok, what) => { console.log((ok ? "ok   " : "FAIL ") + what); if (!ok) failed++; };

// Reads the panel's composite render target in the panel's own GL context; stats over a screen rect.
const panelStats = (rect) => page.evaluate((r) => {
	const S = G$CARDSPANEL$s;
	const comp = S && S.comp;
	if (!comp) return null;
	const px = UnityGpu.ReadRT(comp);
	const w = comp.width;
	let n = 0, sum = 0, sum2 = 0;
	const colors = new Set();
	for (let y = r.y; y < r.y + r.h; y += 2) for (let x = r.x; x < r.x + r.w; x += 2) {
		const i = (y * w + x) * 4;
		const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
		n++; sum += l; sum2 += l * l;
		if (colors.size < 5000) colors.add((px[i] >> 3) << 10 | (px[i + 1] >> 3) << 5 | (px[i + 2] >> 3));
	}
	const mean = sum / n;
	return { w, h: comp.height, mean, variance: sum2 / n - mean * mean, colors: colors.size };
}, rect);

const texKinds = () => page.evaluate(() => {
	const S = G$CARDSPANEL$s;
	const k = {};
	for (const c of S.cmds) if (c.kind === 0) k[c.tex.kind] = (k[c.tex.kind] || 0) + c.qn;
	return { kinds: k, quads: S.verts.length / 4, batches: S.batches.length, fonts: S.uiFonts.count ?? S.uiFonts.size ?? null };
});

try {
	await ready(page);
	await page.waitForTimeout(1500);
	const errs0 = await page.evaluate(() => Host.errors.length);
	const opened = await page.evaluate(() => {
		const save = (G$s ?? G$cc()).SAVE;
		const ids = (G$CARDS$s ?? G$CARDS$cc()).byId.keysList();
		for (let i = 0; i < ids.length; i += 2) save.cards.set(ids[i], 1 + (i % 3));
		save.levels.set("cards", 1);
		save.levels.set("cardSlot2", 1);
		G$TREE.Recalc();
		G$GAME.OpenTree();
		return { state: G$GAME.state, tab: (G$UI$s ?? G$UI$cc()).treeTab.cur, owned: save.cards.count ?? null, total: ids.length };
	});
	console.log("opened", JSON.stringify(opened));
	for (let i = 0; i < 30; i++) {
		await page.waitForTimeout(500);
		const st = await page.evaluate(() => {
			if ((G$UI$s ?? G$UI$cc()).treeTab.cur !== "cards") G$UI.SetTreeTab("cards");
			const U = G$UI$s ?? G$UI$cc();
			return { state: G$GAME.state, tab: U.treeTab.cur, busy: U.busy, shown: !!(G$CARDSPANEL$s && G$CARDSPANEL$s.shown) };
		});
		if (st.shown) break;
		if (i % 5 === 4) console.log("waiting", JSON.stringify(st));
	}
	await page.waitForFunction(() => typeof G$CARDSPANEL$s !== "undefined" && G$CARDSPANEL$s.shown && UnityGpu.presentedFrame > 0, null, { timeout: 60000 });
	await page.waitForTimeout(2500);
	await page.screenshot({ path: `${out}/cards-panel-a.png` });

	const vis = await page.evaluate(() => getComputedStyle(document.getElementById("cards-overlay")).display);
	check(vis === "block", "overlay canvas shown (" + vis + ")");
	const full = await panelStats({ x: 0, y: 0, w: W, h: H });
	console.log("panel", JSON.stringify(full));
	check(full && full.w === W && full.h === H, "composite is screen sized");
	check(full && full.variance > 300 && full.colors > 200, "panel has non-trivial content");
	const k1 = await texKinds();
	console.log("batches", JSON.stringify(k1));
	check((k1.kinds[1] || 0) > 20, "card text and art images drawn (Img quads " + (k1.kinds[1] || 0) + ")");
	check((k1.kinds[2] || 0) > 0, "card paintings drawn from YUV planes (" + (k1.kinds[2] || 0) + ")");

	// Hover album tiles until a tooltip appears (its title text goes through Font.GetCharacterInfo).
	let k2 = k1;
	for (let i = 0; i < 40 && !(k2.kinds[5] > 0); i++) {
		await page.mouse.move(200 + (i % 8) * 110, 170 + Math.floor(i / 8) * 90);
		await page.waitForTimeout(700);
		k2 = await texKinds();
	}
	console.log("hover", JSON.stringify(k2));
	await page.screenshot({ path: `${out}/cards-panel-b.png` });
	check((k2.kinds[5] || 0) > 0, "OS-font glyph quads drawn (" + (k2.kinds[5] || 0) + ")");

	const sel0 = await page.evaluate(() => G$CARDSPANEL$s.selected);
	await page.mouse.click(135, 200);
	await page.waitForTimeout(2000);
	const sel1 = await page.evaluate(() => G$CARDSPANEL$s.selected);
	check(sel1 != null && sel1 !== sel0, "clicking a tile selects it (" + sel0 + " -> " + sel1 + ")");
	await page.screenshot({ path: `${out}/cards-panel-c.png` });

	const errs = await page.evaluate((n) => Host.errors.slice(n), errs0);
	if (errs.length) console.log(errs.slice(0, 5).map((e) => e.slice(0, 600)).join("\n---\n"));
	check(errs.length === 0, "no new Host.errors (" + errs.length + ")");
	const pageErrs = logs.filter((l) => l.startsWith("pageerror"));
	check(pageErrs.length === 0, "no page errors (" + pageErrs.length + ")");
} catch (e) {
	failed++;
	console.log("FAIL exception: " + (e && e.stack || e));
	try { console.log(await page.evaluate(() => Host.errors.slice(-5).map((e) => e.slice(0, 600)).join("\n---\n"))); } catch (e2) { }
	try { console.log("Frame():", await page.evaluate(() => { try { G$CARDSPANEL.Frame(); return "ok"; } catch (e) { return e.stack.slice(0, 1500); } })); } catch (e2) { }
} finally {
	console.log(logs.filter((l) => !l.startsWith("log")).slice(0, 12).map((l) => l.slice(0, 300)).join("\n"));
	await close();
}
console.log(failed ? `cards-panel: ${failed} failed` : "cards-panel: all passed");
process.exit(failed ? 1 : 0);
