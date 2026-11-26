// Touch play on the owner's phone profile (Xiaomi 17T landscape, 1378x634 CSS px @2): tap NEW GAME, tap the
// ground to place a hero, drag the virtual stick to pan the camera, tap SPACE; touch UI stays off the canvas.
// Usage: node touch.mjs [screenshotDir]
import { open, ready } from "./util.mjs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../..");
const outDir = process.argv[2] || "/tmp";
const { page, close } = await open(root, { width: 1378, height: 634, dpr: 2, mobile: true });
let failed = 0;
const check = (n, ok, info) => { if (!ok) failed++; console.log(`${ok ? "ok  " : "FAIL"} ${n}${info ? " " + info : ""}`); };
try {
	await ready(page);
	await page.waitForTimeout(800);
	const c = await page.evaluate(() => { const r = document.getElementById("game").getBoundingClientRect(); return { x: r.left, y: r.top, k: r.width / 640 }; });
	await page.touchscreen.tap(c.x + 320 * c.k, c.y + 248 * c.k);
	await page.waitForTimeout(1500);
	check("tap NEW GAME starts a run", (await page.evaluate(() => G$GAME.state)) === "run");
	for (let i = 0; i < 30; i++) {
		await page.waitForTimeout(400);
		if (i > 4 && !(await page.evaluate(() => !!G$TUTORIAL.ActiveModal))) break;
		await page.keyboard.press("Enter");
	}
	await page.touchscreen.tap(c.x + 360 * c.k, c.y + 200 * c.k);
	await page.waitForTimeout(800);
	const shown = await page.evaluate(() => document.getElementById("touch").classList.contains("show"));
	check("touch controls shown in the run", shown);
	const overlap = await page.evaluate(() => {
		const g = document.getElementById("game").getBoundingClientRect();
		return [...document.querySelectorAll("#stick, .tbtn")].filter((e) => { const r = e.getBoundingClientRect(); return !(r.right <= g.left || r.left >= g.right || r.bottom <= g.top || r.top >= g.bottom); }).length;
	});
	check("touch controls sit outside the canvas (letterbox)", overlap === 0, `(${overlap} overlapping)`);
	const cam0 = await page.evaluate(() => G$E.cam.x);
	const s = await page.evaluate(() => { const r = document.getElementById("stick").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 }; });
	const cdp = await page.context().newCDPSession(page);
	const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 7 }] });
	await touch("touchStart", s.x, s.y);
	for (let i = 1; i <= 5; i++) { await touch("touchMove", s.x + s.r * 0.2 * i, s.y); await page.waitForTimeout(30); }
	await page.waitForTimeout(1200);
	const cam1 = await page.evaluate(() => G$E.cam.x);
	await touch("touchEnd", 0, 0);
	check("stick right pans the camera right", cam1 > cam0 + 20, `(${Math.round(cam0)} -> ${Math.round(cam1)})`);
	await page.screenshot({ path: `${outDir}/touch-run.png` });
	check("no runtime errors", (await page.evaluate(() => Host.errors.length)) === 0);
} finally {
	await close();
}
console.log(failed ? `FAIL touch (${failed})` : "PASS touch");
process.exitCode = failed ? 1 : 0;
