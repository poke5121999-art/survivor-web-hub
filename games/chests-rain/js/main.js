"use strict";
// Page glue: load assets, feed DOM input into the Unity device emulation, run the frame loop.
(() => {
	const stage = document.getElementById("stage");
	const bar = document.getElementById("bar");
	const status = document.getElementById("status");
	const loader = document.getElementById("loader");
	const audioContexts = [];

	AudioContext.nativeFactory = (sr) => {
		const c = new WebAudioHost.NativeAudioContext({ sampleRate: sr, latencyHint: "interactive" });
		audioContexts.push(c);
		return c;
	};

	function setProgress(done, total, what) {
		bar.style.width = Math.min(100, Math.round(100 * done / Math.max(1, total))) + "%";
		window.__progressMax = Math.max(window.__progressMax || 0, done / Math.max(1, total));
		status.textContent = what;
	}

	// Static hosts (GitHub Pages behind Fastly) answer bursts with 503/429 now and then: retry with backoff.
	// `size` is the decoded size from the manifest. Hosts that gzip (GitHub Pages) send the compressed size in
	// Content-Length, so that header is only trusted when the response is not content-encoded.
	// `onProgress(n)` gets the bytes received so far in the current attempt.
	async function fetchBytes(url, size, onProgress) {
		let wait = 400;
		for (let attempt = 1; ; attempt++) {
			try {
				const r = await fetch(url, { cache: attempt > 1 ? "reload" : "default" });
				if (r.ok) {
					const expect = size || (r.headers.get("content-encoding") ? 0 : Number(r.headers.get("content-length")) || 0);
					let out;
					if (!onProgress || !r.body) out = new Uint8Array(await r.arrayBuffer());
					else {
						const reader = r.body.getReader(), parts = [];
						let got = 0;
						onProgress(0);
						for (;;) {
							const { done, value } = await reader.read();
							if (done) break;
							parts.push(value); got += value.length; onProgress(got);
						}
						out = new Uint8Array(got);
						let o = 0;
						for (const p of parts) { out.set(p, o); o += p.length; }
					}
					if (expect && out.length !== expect) throw new Error(url + ": got " + out.length + " bytes, expected " + expect);
					return out;
				}
				if (r.status < 500 && r.status !== 429 && r.status !== 408) throw Object.assign(new Error(url + ": http " + r.status), { fatal: true });
				throw new Error(url + ": http " + r.status);
			} catch (e) {
				if (e.fatal || attempt >= 7) throw e;
				console.warn("retry", attempt, e.message);
				await new Promise((res) => setTimeout(res, wait + Math.random() * wait));
				wait = Math.min(wait * 2, 8000);
			}
		}
	}

	const slice = (packs, [name, off, len]) => packs.get(name).subarray(off, off + len);

	async function loadAssets() {
		let man;
		for (let i = 0; ; i++) {
			try { man = JSON.parse(new TextDecoder().decode(await fetchBytes("assets/manifest.json?v=" + REV))); break; }
			catch (e) { if (i > 3) throw e; }
		}
		const bootPacks = [...new Set([...Object.values(man.res), ...Object.values(man.sfx)].map((e) => e[0]))];
		const totalBytes = bootPacks.reduce((n, p) => n + man.packs[p], 0);
		const got = new Map();
		const progress = (p) => (n) => {
			got.set(p, Math.min(n, man.packs[p]));
			let bytes = 0;
			for (const v of got.values()) bytes += v;
			setProgress(bytes * 0.85, totalBytes, "Loading");
		};
		const packs = new Map();
		const decoder = new OfflineAudioContext(2, 1, 48000);
		const sfx = new Map();
		const byPack = new Map();
		for (const [name, e] of Object.entries(man.sfx)) { if (!byPack.has(e[0])) byPack.set(e[0], []); byPack.get(e[0]).push([name, e]); }
		const decodes = [];
		let decoded = 0;
		const total = Object.keys(man.sfx).length;
		const queue = bootPacks.slice();
		const work = async () => {
			while (queue.length) {
				const p = queue.shift();
				packs.set(p, await fetchBytes("assets/" + p + "?v=" + REV, man.packs[p], progress(p)));
				for (const [name, e] of byPack.get(p) || []) {
					decodes.push(decoder.decodeAudioData(slice(packs, e).slice().buffer)
						.then((buf) => { sfx.set(name, AudioBuffer.wrap(buf)); })
						.catch((err) => console.warn("sfx decode failed", name, err))
						.finally(() => { decoded++; setProgress(totalBytes * 0.85 + totalBytes * 0.15 * decoded / total, totalBytes, "Loading sounds"); }));
				}
			}
		};
		await Promise.all([work(), work(), work()]);
		for (const [path, e] of Object.entries(man.res)) Unity.resources.set(path, slice(packs, e));
		await Promise.all(decodes);
		late = man;
		return sfx;
	}

	// Full-size card paintings load after boot; the Cards tab opens late in progression.
	let late = null;
	async function loadDeferred() {
		const names = [...new Set(Object.values(late.late).map((e) => e[0]))];
		const packs = new Map();
		for (const p of names) {
			try { packs.set(p, await fetchBytes("assets/" + p + "?v=" + REV, late.packs[p])); } catch (e) { console.warn(e); continue; }
			for (const [path, e] of Object.entries(late.late)) {
				if (e[0] !== p) continue;
				Unity.resources.set(path, slice(packs, e));
				// An entry asked for before its bytes arrived failed with "missing asset"; let it start again.
				const id = path.slice("cardpaint/".length, -"_src".length);
				try {
					for (const [, en] of G$CARDPAINT$cc().entries) if (en.state === 3 && !en.thumb && String(en.id).toLowerCase() === id) { en.state = 0; en.error = null; }
				} catch (err) { }
			}
		}
	}

	function layout() {
		const w = window.innerWidth, h = window.innerHeight;
		Host.screen.width = w; Host.screen.height = h;
		Unity.screen.width = w; Unity.screen.height = h;
		Host.layout();
	}
	let lastRect = [0, 0, 640, 360];
	Host.onLayout = (x, y, w, h) => {
		const c = Gfx.canvas;
		c.style.left = x + "px";
		c.style.top = y + "px";
		c.style.width = w + "px";
		c.style.height = h + "px";
		lastRect = [x, y, w, h];
		Touch.layout(x, y, w, h);
		// The hub link sits in a letterbox bar when there is one, otherwise over the bottom-left corner,
		// which no game screen uses for buttons.
		const back = document.getElementById("back");
		if (back) {
			if (x >= 30) { back.style.left = Math.round((x - 24) / 2) + "px"; back.style.top = "8px"; back.style.bottom = ""; }
			else if (y >= 30) { back.style.left = "8px"; back.style.top = Math.round((y - 24) / 2) + "px"; back.style.bottom = ""; }
			else { back.style.left = "4px"; back.style.top = ""; back.style.bottom = "2px"; }
		}
	};
	Host.setCursor = (visible) => { Gfx.canvas.style.cursor = visible ? "default" : "none"; };

	let unlocked = false;
	function unlockAudio() {
		if (unlocked) return;
		unlocked = true;
		for (const c of audioContexts) if (c.state !== "running") c.resume().catch(() => { });
		try { G$SFX.Unlock(); } catch (e) { Host.fail("SFX.Unlock", e); }
		for (const c of audioContexts) if (c.state !== "running") c.resume().catch(() => { });
	}

	function wireInput() {
		const btn = (b) => b === 0 ? 0 : b === 2 ? 1 : b === 1 ? 2 : -1;
		window.addEventListener("pointermove", (e) => { if (e.pointerType !== "touch") Unity.mouseMove(e.clientX, e.clientY); });
		window.addEventListener("pointerdown", (e) => {
			unlockAudio();
			if (e.pointerType === "touch") return;
			Unity.mouseMove(e.clientX, e.clientY);
			const b = btn(e.button);
			if (b >= 0) Unity.mouseButton(b, true);
		});
		window.addEventListener("pointerup", (e) => {
			if (e.pointerType === "touch") return;
			Unity.mouseMove(e.clientX, e.clientY);
			const b = btn(e.button);
			if (b >= 0) Unity.mouseButton(b, false);
		});
		window.addEventListener("pointercancel", () => Unity.releaseAll());
		window.addEventListener("wheel", (e) => { Unity.mouse.scroll += e.deltaY < 0 ? 120 : -120; }, { passive: true });
		window.addEventListener("contextmenu", (e) => e.preventDefault());
		window.addEventListener("keydown", (e) => {
			unlockAudio();
			if (Unity.domKey(e.code, true) && !(e.ctrlKey && (e.code === "KeyR" || e.code === "F5")) && e.code !== "F11" && e.code !== "F12") e.preventDefault();
		});
		window.addEventListener("keyup", (e) => { Unity.domKey(e.code, false); });
		window.addEventListener("blur", () => { Unity.focused = false; Unity.releaseAll(); try { G$E.Blur(); } catch (err) { } });
		window.addEventListener("focus", () => { Unity.focused = true; });
		window.addEventListener("resize", layout);
		document.addEventListener("visibilitychange", () => {
			for (const c of audioContexts) {
				if (document.hidden) c.suspend().catch(() => { });
				else if (unlocked) c.resume().catch(() => { });
			}
		});
	}

	let last = 0;
	function loop(t) {
		requestAnimationFrame(loop);
		const dt = last ? Math.min(0.25, (t - last) / 1000) : 1 / 60;
		last = t;
		try { Host.frame(dt); } catch (e) { Host.fail("frame", e); }
		Touch.update();
	}

	async function start() {
		try {
			const sfx = await loadAssets();
			setProgress(1, 1, "Starting");
			await new Promise((r) => setTimeout(r, 0));
			Gfx.Init();
			stage.appendChild(Gfx.canvas);
			Gfx.canvas.id = "game";
			window.__sfxLoaded = sfx.size;
			G$SFX.SetSampleSource(WebAudioHost.sfxSource(sfx));
			G$SFX.DecodeWav = WebAudioHost.sfxDecodeWav;
			layout();
			Host.boot();
			layout();
			wireInput();
			if (Touch.init()) Touch.layout(...lastRect);
			loader.remove();
			window.__ready = true;
			loadDeferred();
			requestAnimationFrame(loop);
		} catch (e) {
			status.textContent = "Failed to start: " + (e && e.message || e);
			console.error(e);
		}
	}
	start();
})();
