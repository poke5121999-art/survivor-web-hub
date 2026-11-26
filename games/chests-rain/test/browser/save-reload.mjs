// Real input: title -> NEW GAME -> play a run -> camp; reload the page and check the save survived.
import { open, ready } from "./util.mjs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../..");
const { page, close } = await open(root);
const fail = (m) => { console.log("FAIL", m); process.exitCode = 1; };
try {
	await ready(page);
	await page.waitForTimeout(800);
	await page.mouse.click(640, 497);
	const deadline = Date.now() + 240000;
	let s;
	while (Date.now() < deadline) {
		s = await page.evaluate(() => G$GAME.state);
		if (s === "tree") break;
		if (s === "run") {
			await page.mouse.click(400 + Math.random() * 480, 240 + Math.random() * 240);
			for (let i = 0; i < 6; i++) await page.mouse.move(640 + Math.cos(Date.now() / 300 + i) * 500, 360 + Math.sin(Date.now() / 200 + i) * 300, { steps: 2 });
		}
		await page.keyboard.press("Enter");
		await page.waitForTimeout(700);
	}
	if (s !== "tree") fail("never reached camp, state " + s);
	const before = await page.evaluate(() => ({ runs: G$s.SAVE.runs, gold: Math.floor(G$s.SAVE.gold) }));
	console.log("before reload", JSON.stringify(before));
	if (!(before.runs >= 1)) fail("no run recorded");
	await page.reload();
	await ready(page);
	await page.waitForTimeout(500);
	const after = await page.evaluate(() => ({ runs: G$s.SAVE.runs, gold: Math.floor(G$s.SAVE.gold), state: G$GAME.state }));
	console.log("after reload", JSON.stringify(after));
	if (after.runs !== before.runs || after.gold !== before.gold) fail("save not restored");
	const errs = await page.evaluate(() => Host.errors.length);
	if (errs) fail(errs + " runtime errors: " + (await page.evaluate(() => Host.errors[0].slice(0, 300))));
	if (!process.exitCode) console.log("PASS save-reload");
} finally {
	await close();
}
