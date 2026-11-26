import { open, ready } from "./util.mjs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../..");
const out = process.env.OUT || "/tmp";
const { page, logs, close } = await open(root);
const st = () => page.evaluate(() => G$GAME.state);
try {
	await ready(page);
	await page.waitForTimeout(1000);
	await page.mouse.click(640, 497);
	let t = 0, shots = 0;
	while (t < 120) {
		const s = await st();
		if (s === "run") {
			await page.mouse.click(400 + Math.random() * 480, 240 + Math.random() * 240);
			for (let i = 0; i < 8; i++) await page.mouse.move(640 + Math.cos(t + i) * 500, 360 + Math.sin(t * 1.7 + i) * 300, { steps: 3 });
			await page.keyboard.press("Enter");
		} else if (s === "tree") break;
		else { await page.keyboard.press("Enter"); await page.mouse.move(640, 360); }
		if (s !== "run" && shots < 4) { await page.screenshot({ path: `${out}/loop-${s}-${shots++}.png` }); }
		await page.waitForTimeout(1000); t += 1.3;
	}
	await page.waitForTimeout(1500);
	await page.screenshot({ path: `${out}/loop-camp.png` });
	console.log("state", await st(), "t", t.toFixed(0));
	console.log(await page.evaluate(() => JSON.stringify({ gold: G$s.SAVE.gold, runs: G$s.SAVE.runs, errs: Host.errors.length })));
} finally {
	console.log(logs.filter((l) => !l.startsWith("log")).slice(0, 8).map((l) => l.slice(0, 200)).join("\n"));
	await close();
}
