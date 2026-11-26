import { open, ready } from "./util.mjs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../..");
const out = process.env.OUT || "/tmp";
const { page, logs, close } = await open(root);
const shot = async (n) => page.screenshot({ path: `${out}/play-${n}.png` });
const st = () => page.evaluate(() => JSON.stringify({ state: G$GAME.state, errs: Host.errors.length }));
try {
	await ready(page);
	await page.waitForTimeout(1500);
	await page.mouse.click(640, 497);
	await page.waitForTimeout(2500);
	await shot("a"); console.log("a", await st());
	await page.mouse.click(640, 360);
	await page.waitForTimeout(1500);
	await shot("b"); console.log("b", await st());
	for (let i = 0; i < 6; i++) { await page.mouse.click(500 + i * 50, 300 + (i % 2) * 80); await page.waitForTimeout(400); }
	await page.waitForTimeout(8000);
	await shot("c"); console.log("c", await st());
	await page.waitForTimeout(15000);
	await shot("d"); console.log("d", await st());
	console.log(await page.evaluate(() => Host.errors.slice(1, 6).map((e) => e.slice(0, 400)).join("\n---\n")));
} finally {
	console.log(logs.filter((l) => !l.startsWith("log")).slice(0, 12).map((l) => l.slice(0, 300)).join("\n"));
	await close();
}
