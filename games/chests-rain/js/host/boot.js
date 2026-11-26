"use strict";
// ArrowstormMain.cs (the Unity MonoBehaviour host) for the browser: boot order, frame loop, layout.
// Values serialized in the shipped scene level0: seed 20261005, audioAtBoot, vSync, polish, motion 1,
// post = PostFxSettings defaults with enabled, demoBuild = false, fullRelease = false.
const Host = {
	seed: 20261005,
	audioAtBoot: true,
	polish: true,
	motion: 1.0,
	post: null,
	booted: false,
	lastW: -1,
	lastH: -1,
	bootLog: "",
	errors: [],
	screen: { width: 1280, height: 720 },

	moduleLoads() {
		const list = [
			["E", () => G$E.ModuleLoad()], ["SPR", () => G$SPR.ModuleLoad()], ["WORLD", () => G$WORLD.ModuleLoad()],
			["FX", () => G$FX.ModuleLoad()], ["SFX", () => G$SFX.ModuleLoad()], ["UI", () => G$UI.ModuleLoad()],
			["CARDPAINT", () => G$CARDPAINT.ModuleLoad()], ["CARDSPANEL", () => G$CARDSPANEL.ModuleLoad()],
			["CARDART", () => G$CARDART.ModuleLoad()], ["CARDS", () => G$CARDS.ModuleLoad()], ["ITEMS", () => G$ITEMS.ModuleLoad()],
			["GAME", () => G$GAME.ModuleLoad()], ["HEROES", () => G$HEROES.ModuleLoad()], ["EVENTS", () => G$EVENTS.ModuleLoad()],
			["TREEICONS", () => G$TREEICONS.ModuleLoad()], ["CHEATS", () => G$CHEATS.ModuleLoad()],
		];
		for (const [name, f] of list) {
			try { f(); } catch (e) { Host.fail("[load] " + name, e); }
		}
	},

	init(name, f) {
		const t0 = performance.now();
		try { f(); } catch (e) { Host.fail("[boot] init failed: " + name, e); }
		Host.bootLog += name + " " + Math.round(performance.now() - t0) + " ms, ";
	},

	fail(where, e) {
		Host.errors.push(where + ": " + (e && e.stack || e));
		console.error(where, e);
	},

	boot() {
		const t0 = performance.now();
		G$E.reloadHook = () => location.reload();
		Host.moduleLoads();
		G$E.Mount();
		G.LoadGame();
		G$BRAND.wishlistUrl = "";
		G$BRAND.openUrl = (url) => { try { window.open(url, "_blank", "noopener"); } catch (e) { } };
		G$BUILD.applyFullScreen = (on) => Host.fullScreen(on);
		G$BUILD.readFullScreen = () => !!(typeof document !== "undefined" && document.fullscreenElement);
		G$BUILD.quitGame = null;
		G$LOC.verification = false;
		Host.init("LOC", () => G$LOC.Init());
		Host.init("SPR", () => G$SPR.Init());
		Host.init("WORLD", () => G$WORLD.Init(Host.seed));
		Host.init("FX", () => G$FX.Init());
		Host.init("HEROES", () => G$HEROES.Init());
		Host.init("SFX", () => G$SFX.Init());
		Host.init("CARDART", () => G$CARDART.Init());
		Host.init("CARDS", () => G$CARDS.Init());
		Host.init("ITEMS", () => G$ITEMS.Init());
		Host.init("EVENTS", () => G$EVENTS.Init());
		Host.init("TREEICONS", () => G$TREEICONS.Init());
		Host.init("SPRITEART", () => G$SPRITEART.Init());
		Host.init("CHEATS", () => G$CHEATS.Init());
		Host.init("SOUNDUI", () => G$SOUNDUI.Init());
		Host.init("SANDBOXUI", () => G$SANDBOXUI.Init());
		Host.init("UI", () => G$UI.Init());
		Host.init("GAME", () => G$GAME.Init());
		Host.init("SKILLS", () => G$SKILLS.Init());
		Host.init("BOSSART", () => G$BOSSART.Init());
		Host.init("SHOP", () => G$SHOP.Init());
		Host.init("PAD", () => G$PAD.Init());
		Host.init("JUICE", () => G$JUICE.Init());
		G$TUTORIAL.enabled = true;
		Host.init("TUTORIAL", () => G$TUTORIAL.Init());
		Host.post = new PostFxSettings();
		Host.post.enabled = true;
		PostFx.Init();
		Host.booted = true;
		G$ACH.Init();
		console.log("Arrowstorm booted in " + Math.round(performance.now() - t0) + " ms (" + Host.bootLog.replace(/[, ]+$/, "") + ")");
		if (Host.audioAtBoot) { try { G$SFX.Unlock(); } catch (e) { Host.fail("SFX.Unlock", e); } }
		Host.layout();
	},

	// 640x360 logical frame, integer-scaled when the scale is 2 or more and close to the fit.
	layout() {
		const width = Host.screen.width, height = Host.screen.height;
		if (width === Host.lastW && height === Host.lastH) return;
		Host.lastW = width; Host.lastH = height;
		const fit = Math.max(0.25, Math.min(width / 640, height / 360));
		let scale = Math.floor(fit + 1e-6);
		let frac;
		if (!(scale < 2)) frac = (scale / fit < 0.8) ? 1 : 0;
		else frac = 1;
		if (frac) scale = fit;
		const w = 640 * scale, h = 360 * scale;
		let x = (width - w) / 2, y = (height - h) / 2;
		if (!frac) { x = Math.floor(x); y = Math.floor(y); }
		G$E.display = $x.new_Rect(x, y, w, h);
		G$E.cssScale = scale;
		if (Host.onLayout) Host.onLayout(x, y, w, h);
	},

	frame(dt) {
		if (!Host.booted) return;
		Unity.frameStart(dt);
		try { G$CLOUDSAVE.Tick(Unity.time); } catch (e) { Host.fail("CLOUDSAVE.Tick", e); }
		Host.layout();
		G$BRAND.wishlistUrl = "";
		Host.syncPolish();
		G$E.PollInput();
		Host.updateCursor();
		Gfx.BeginFrame();
		G$E.Tick(dt);
		Gfx.EndFrame();
		PostFx.Render(Host.post);
		Unity.frameEnd();
	},

	syncPolish() {
		if (typeof G$E.polish !== "undefined") G$E.polish = Host.polish;
	},

	updateCursor() {
		if (Host.setCursor && G$E.hitTest) {
			const d = G$E.display;
			const mx = Unity.mouse.x, my = Unity.mouse.y;
			const lx = (mx - d.x) / d.width * 640, ly = (my - d.y) / d.height * 360;
			let hot = false;
			try { hot = G$E.hitTest(lx, ly) != null; } catch (e) { }
			Host.setCursor(hot);
		}
	},

	fullScreen(on) {
		if (typeof document === "undefined") return;
		try {
			if (on && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => { });
			else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => { });
		} catch (e) { }
	},
};
