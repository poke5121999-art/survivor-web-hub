// Layout at phone and desktop sizes: the game canvas keeps 16:9 inside the window, nothing scrolls, and the
// hub link does not cover the game's corner buttons (language picker top-left, settings/sound top-right).
// Usage: node overlap.mjs [screenshotDir]
import { open, ready } from "./util.mjs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../..");
const outDir = process.argv[2] || "/tmp";
const sizes = [[1378, 634, 2], [844, 390, 3], [640, 360, 2], [1280, 720, 1], [1920, 1080, 1], [390, 844, 3]];
let failures = 0;
for (const [w, h, dpr] of sizes) {
	const { page, close } = await open(root, { width: w, height: h, dpr, mobile: dpr > 1 });
	try {
		await ready(page);
		await page.waitForTimeout(500);
		const r = await page.evaluate(() => {
			const c = document.getElementById("game").getBoundingClientRect();
			const b = document.getElementById("back").getBoundingClientRect();
			const sx = document.documentElement.scrollWidth > innerWidth, sy = document.documentElement.scrollHeight > innerHeight;
			const k = c.width / 640;
			const hot = [[0, 0, 75, 28], [580, 0, 640, 28]].map(([x0, y0, x1, y1]) => ({ x0: c.left + x0 * k, y0: c.top + y0 * k, x1: c.left + x1 * k, y1: c.top + y1 * k }));
			const hits = hot.filter((q) => !(b.right <= q.x0 || b.left >= q.x1 || b.bottom <= q.y0 || b.top >= q.y1)).length;
			return { c: [c.left, c.top, c.width, c.height].map(Math.round), aspect: c.width / c.height, sx, sy, hits, inside: c.left >= -0.5 && c.top >= -0.5 && c.right <= innerWidth + 0.5 && c.bottom <= innerHeight + 0.5 };
		});
		const ok = Math.abs(r.aspect - 16 / 9) < 0.01 && !r.sx && !r.sy && r.hits === 0 && r.inside;
		if (!ok) failures++;
		console.log(`${ok ? "ok  " : "FAIL"} ${w}x${h}@${dpr} canvas ${r.c.join(",")} hubLinkHits ${r.hits} scroll ${r.sx || r.sy}`);
		await page.screenshot({ path: `${outDir}/overlap-${w}x${h}.png` });
	} finally { await close(); }
}
console.log(failures ? `FAIL overlap (${failures})` : "PASS overlap");
process.exitCode = failures ? 1 : 0;
