// Static server + headless Chromium for browser tests. Always call close() (it kills only what it started).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.HOME + "/.cache/pw-node/node_modules/playwright-core");

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".ogg": "audio/ogg", ".bin": "application/octet-stream", ".wav": "audio/wav" };

// Serves like GitHub Pages (Fastly): gzip for everything but already-compressed media, with Content-Length
// giving the COMPRESSED size, so loader code that trusts Content-Length fails here as it does on Pages.
const NO_GZIP = new Set([".png", ".ogg", ".jpg", ".webp", ".mp4"]);
export function serve(root) {
	const server = http.createServer((req, res) => {
		const u = decodeURIComponent(new URL(req.url, "http://x").pathname);
		const f = path.join(root, u.endsWith("/") ? u + "index.html" : u);
		if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
		const ext = path.extname(f);
		const headers = { "content-type": TYPES[ext] || "application/octet-stream" };
		let body = fs.readFileSync(f);
		if (!NO_GZIP.has(ext) && /\bgzip\b/.test(req.headers["accept-encoding"] || "")) {
			body = zlib.gzipSync(body, { level: 6 });
			headers["content-encoding"] = "gzip";
		}
		headers["content-length"] = body.length;
		res.writeHead(200, headers);
		res.end(body);
	});
	return new Promise((r) => server.listen(0, "127.0.0.1", () => r({ server, url: `http://127.0.0.1:${server.address().port}/` })));
}

export async function open(root, { width = 1280, height = 720, dpr = 1, mobile = false, query = "", beforeGoto = null } = {}) {
	const { server, url } = await serve(root);
	const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"] });
	const close = async () => { try { await browser.close(); } catch (e) { } server.close(); };
	process.on("exit", () => { try { browser.process()?.kill("SIGKILL"); } catch (e) { } });
	try {
		const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
		const page = await ctx.newPage();
		const logs = [];
		page.on("console", (m) => logs.push(m.type() + ": " + m.text()));
		page.on("pageerror", (e) => logs.push("pageerror: " + e.message));
		if (beforeGoto) await beforeGoto(page);
		await page.goto(url + "index.html" + query);
		return { browser, page, logs, close, url };
	} catch (e) { await close(); throw e; }
}

export async function ready(page, timeout = 180000) {
	await page.waitForFunction(() => window.__ready === true, null, { timeout });
}
