// Parity tour: plays the first run with real input at 1280x720 and saves one screenshot per state:
// title, every tutorial popup (modal-<id>), the loot phase and the results panel.
// Usage: node tour.mjs <outDir>
import { open, ready } from "./util.mjs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../..");
const outDir = process.argv[2] || "/tmp";
const { page, close } = await open(root);
const shots = new Set();
const shot = async (key) => { if (shots.has(key)) return; shots.add(key); await page.screenshot({ path: `${outDir}/${key}.png` }); console.log("shot", key); };
try {
	await ready(page);
	await page.waitForTimeout(2500);
	await shot("title");
	await page.mouse.click(640, 497);
	const end = Date.now() + 180000;
	let placed = 0;
	while (Date.now() < end) {
		const s = await page.evaluate(() => ({ st: G$GAME.state, modal: G$TUTORIAL.ActiveModal || null, loot: G$GAME.chest && G$GAME.chest.phase }));
		if (s.modal) {
			await page.waitForTimeout(1200);
			await shot("modal-" + s.modal);
			await page.keyboard.press("Enter");
		} else if (s.st === "run") {
			if (placed++ < 3) await page.mouse.click(560 + placed * 60, 300);
			await page.mouse.move(640 + Math.cos(Date.now() / 400) * 300, 360 + Math.sin(Date.now() / 300) * 200, { steps: 3 });
		} else if (s.st === "end") {
			await page.waitForTimeout(600);
			await shot("loot");
		} else if (s.st === "results") {
			await page.waitForTimeout(6000);
			await shot("results");
			break;
		}
		await page.waitForTimeout(250);
	}
} finally {
	await close();
}
