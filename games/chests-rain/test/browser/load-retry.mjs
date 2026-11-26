// Asset loading under a flaky, gzip-encoding host (see util.mjs serve): every pack and the manifest answer 503 on the first request, one pack
// answers 429 twice. The game must still start, with every sound decoded, in a small number of requests.
import { open, ready } from "./util.mjs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../..");
const seen = new Map();
let requests = 0;
const beforeGoto = (page) => page.route("**/assets/**", (route) => {
	const u = new URL(route.request().url()).pathname;
	requests++;
	const n = (seen.get(u) || 0) + 1;
	seen.set(u, n);
	if (n === 1) return route.fulfill({ status: 503, body: "busy" });
	if (u.endsWith("sfx-2.bin") && n === 2) return route.fulfill({ status: 429, body: "slow down" });
	return route.continue();
});
const { page, logs, close } = await open(root, { beforeGoto });
let failed = 0;
const check = (n, ok, info) => { if (!ok) failed++; console.log(`${ok ? "ok  " : "FAIL"} ${n}${info ? " " + info : ""}`); };
try {
	const t0 = Date.now();
	await ready(page, 240000);
	check("game started despite 503s", true, `(${Date.now() - t0} ms)`);
	const r = await page.evaluate(async () => {
		const m = await (await fetch("assets/manifest.json?v=" + REV)).json();
		return { want: Object.keys(m.sfx).length, res: Object.keys(m.res).length, haveRes: Object.keys(m.res).filter((k) => Unity.resources.has(k)).length };
	});
	const sfxLoaded = await page.evaluate(() => window.__sfxLoaded);
	check("all boot resources present", r.haveRes === r.res, `(${r.haveRes}/${r.res})`);
	check("every sound decoded", sfxLoaded === r.want, `(${sfxLoaded}/${r.want})`);
	const decodeFails = logs.filter((l) => l.includes("sfx decode failed")).length;
	check("no sound failed to decode", decodeFails === 0, `(${decodeFails})`);
	const bootRequests = [...seen.keys()].filter((u) => !u.includes("paint-")).length;
	check("boot needs at most 10 distinct asset files", bootRequests <= 10, `(${bootRequests} files, ${requests} requests incl. retries)`);
	await page.waitForTimeout(15000);
	const lateOk = await page.evaluate(() => [...Unity.resources.keys()].filter((k) => k.endsWith("_src")).length);
	check("card paintings arrive in the background", lateOk > 0, `(${lateOk})`);
	const pmax = await page.evaluate(() => window.__progressMax);
	check("progress bar never passes 100%", pmax <= 1.0001, `(max ${(pmax * 100).toFixed(1)}%)`);
	check("no runtime errors", (await page.evaluate(() => Host.errors.length)) === 0);
} finally {
	await close();
}
console.log(failed ? `FAIL load-retry (${failed})` : "PASS load-retry");
process.exitCode = failed ? 1 : 0;
