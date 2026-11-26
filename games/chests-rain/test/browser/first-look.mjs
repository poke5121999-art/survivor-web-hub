import { open, ready } from "./util.mjs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../..");
const out = process.env.OUT || "/tmp";
const { page, logs, close } = await open(root);
try {
	const t0 = Date.now();
	await ready(page);
	console.log("ready after", Date.now() - t0, "ms");
	for (const s of [2, 6]) {
		await page.waitForTimeout(s * 1000);
		await page.screenshot({ path: `${out}/first-${s}.png` });
	}
	console.log(await page.evaluate(() => JSON.stringify({ state: G$GAME.state, errors: Host.errors.slice(0, 5), quads: Gfx.quadsLastFrame })));
} finally {
	console.log(logs.filter((l) => !l.startsWith("log")).slice(0, 15).join("\n"));
	await close();
}
