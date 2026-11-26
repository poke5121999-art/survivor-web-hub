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
		bar.style.width = Math.round(100 * done / Math.max(1, total)) + "%";
		status.textContent = what;
	}

	async function fetchBytes(url) {
		const r = await fetch(url);
		if (!r.ok) throw new Error(url + ": http " + r.status);
		return new Uint8Array(await r.arrayBuffer());
	}

	async function loadAssets() {
		const man = await (await fetch("assets/manifest.json?v=" + REV)).json();
		const res = Object.entries(man.res);
		const total = res.length + man.sfx.length;
		let done = 0;
		const queue = res.slice();
		const work = async () => {
			while (queue.length) {
				const [path, v] = queue.shift();
				Unity.resources.set(path, await fetchBytes("assets/" + v.file + "?v=" + REV));
				setProgress(++done, total, "Loading");
			}
		};
		await Promise.all([work(), work(), work(), work()]);
		const decoder = { native: new OfflineAudioContext(2, 1, 48000) };
		const names = man.sfx.slice();
		const map = new Map();
		const chunk = 40;
		for (let i = 0; i < names.length; i += chunk) {
			const part = await WebAudioHost.preloadSfx(decoder, names.slice(i, i + chunk), (n) => "assets/res/sfx/" + n + ".ogg?v=" + REV);
			for (const [k, v] of part) map.set(k, v);
			done += Math.min(chunk, names.length - i);
			setProgress(done, total, "Loading sounds");
		}
		return map;
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
			G$SFX.SetSampleSource(WebAudioHost.sfxSource(sfx));
			G$SFX.DecodeWav = WebAudioHost.sfxDecodeWav;
			layout();
			Host.boot();
			layout();
			wireInput();
			if (Touch.init()) Touch.layout(...lastRect);
			loader.remove();
			window.__ready = true;
			requestAnimationFrame(loop);
		} catch (e) {
			status.textContent = "Failed to start: " + (e && e.message || e);
			console.error(e);
		}
	}
	start();
})();
