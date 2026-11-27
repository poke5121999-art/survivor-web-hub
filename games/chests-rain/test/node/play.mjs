// Shared input driver for node harnesses: plays the current run through emulated mouse/keyboard the way a
// player would (place heroes, sweep loot with the cursor, close popups, pan to the boss and challenge it,
// keep the cursor on the boss during the fight).
// Screen point (and count of heroes to call) outside every slam circle while a slam is coming, else null.
const SLAM_SAFE = `(() => {
	const G = G$GAME$s ?? G$GAME$cc(), c = G$E.cam, b = G.boss;
	if (!G$GAME.SlamWarning || !b) return null;
	if (!G.heroes.some((h) => G$GAME.SlamWouldStun(h))) return null;
	let R = 0;
	for (let i = 0; i < G.slamN; i++) R = Math.max(R, G.slamCR[i]);
	for (let a = 0; a < 16; a++) {
		const x = b.x + Math.cos(a * Math.PI / 8) * (R * 1.5 + 30), y = b.y + Math.sin(a * Math.PI / 8) * (R * 1.5 + 30);
		const sx = x - c.x, sy = y - c.y;
		if (sx > 10 && sx < 630 && sy > 10 && sy < 350 && !G$GAME.SlamCaughtAt(x, y)) return [sx, sy];
	}
	return null;
})()`;
// Screen point of what to hit: the highest-ranked standing crown guard, else the boss; with the boss HP fraction.
const TARGET = `(() => {
	const G = G$GAME$s ?? G$GAME$cc(), c = G$E.cam, b = G.boss;
	let t = null;
	for (const p of G.fightParts) if (G$GAME.GuardUp(p) && p.guardRole !== 0 && (!t || G$GAME.GuardRank(p) < G$GAME.GuardRank(t))) t = p;
	if (!t && b && !b.dead) t = b;
	return t ? [t.x - c.x, t.y - c.y, b ? b.hp / b.maxHp : 1] : null;
})()`;

export function driver(g) {
	const E = (s) => g.eval(s);
	const held = {};
	const frame = () => E("Host.frame(1/60)");
	const mouse = (x, y) => E(`Unity.mouseMove(${x * 2}, ${y * 2})`);
	const tap = (code) => { E(`Unity.domKey("${code}", true)`); frame(); E(`Unity.domKey("${code}", false)`); };
	const click = (x, y) => { mouse(x, y); E("Unity.mouseButton(0, true)"); frame(); E("Unity.mouseButton(0, false)"); };
	const setKeys = (want) => {
		for (const k of ["KeyW", "KeyA", "KeyS", "KeyD"]) {
			const on = want.has(k);
			if (on !== !!held[k]) { E(`Unity.domKey("${k}", ${on})`); held[k] = on; }
		}
	};

	// Plays until the run leaves "run"/"end" or maxSec game seconds pass. Returns what happened.
	function playRun({ boss = true, maxSec = 300, endless = false } = {}) {
		let f = 0, challenged = false, bossLeft = 1;
		const limit = maxSec * 60;
		while (f < limit) {
			const st = E("G$GAME.state");
			if (st !== "run" && st !== "end") break;
			if (f % 90 === 45) tap("Enter");
			if (st === "run") {
				if (f % 50 === 0 && !E("G$GAME.challenge")) click(250 + (f * 7) % 140, 140 + (f * 13) % 80);
				const nav = boss && !endless ? E(`(() => { const b = G$GAME.boss, c = G$E.cam; if (!b || b.dead || G$GAME.challenge) return null; return [b.x - (c.x + G$E.ViewWidth() / 2), b.y - (c.y + G$E.ViewHeight() / 2), G$GAME.ChallengeOffered()]; })()`) : null;
				const want = new Set();
				const fighting = E("G$GAME.challenge");
				if (nav) {
					if (nav[0] > 60) want.add("KeyD"); else if (nav[0] < -60) want.add("KeyA");
					if (nav[1] > 60) want.add("KeyS"); else if (nav[1] < -60) want.add("KeyW");
					if (nav[2] && f % 30 === 0) tap("Space");
				}
				if (fighting) {
					// What a player does in a boss fight (the boss book's hints, BOOK.BOSS_BEAT_FULL): during a slam warning,
					// click safe ground so every hero standing in a red circle is called out of it (GAME.SlamCallHero); down
					// the crown guards first (GAME.GuardRank order); otherwise hold LMB on the real boss (FOCUS / dash), fire the
					// ultimates (keys 1-4; 1 aims, then a click casts) and War Cry (Shift).
					challenged = true;
					const slam = E(SLAM_SAFE);
					if (slam) {
						if (held.lmb) { E("Unity.mouseButton(0, false)"); held.lmb = false; }
						click(slam[0], slam[1]);
					} else {
						const b = E(TARGET);
						if (b) { bossLeft = Math.min(bossLeft, b[2]); mouse(Math.max(10, Math.min(630, b[0])), Math.max(10, Math.min(350, b[1]))); }
						else mouse(320 + Math.cos(f / 20) * 250, 180 + Math.sin(f / 13) * 140);
						if (b && !held.lmb) { E("Unity.mouseButton(0, true)"); held.lmb = true; }
						if (f % 40 === 0) for (const k of ["Digit2", "Digit3", "Digit4", "ShiftRight"]) tap(k);
						if (f % 40 === 20 && b) { E("Unity.mouseButton(0, false)"); tap("Digit1"); E("Unity.mouseButton(0, true)"); }
					}
				} else if (!nav) mouse(320 + Math.cos(f / 20) * 250, 180 + Math.sin(f / 13) * 140);
				if (!fighting && held.lmb) { E("Unity.mouseButton(0, false)"); held.lmb = false; }
				setKeys(want);
			} else mouse(320 + Math.cos(f / 9) * 120, 180 + Math.sin(f / 7) * 70);
			frame();
			f++;
		}
		setKeys(new Set());
		if (held.lmb) { E("Unity.mouseButton(0, false)"); held.lmb = false; }
		return { seconds: f / 60, challenged, bossLeft, state: E("G$GAME.state") };
	}

	// After a run: close the results and loot screens until the camp shows.
	function toCamp(maxFrames = 1200) {
		for (let i = 0; i < maxFrames && E("G$GAME.state") !== "tree"; i++) { if (i % 30 === 0) tap("Enter"); frame(); }
		return E("G$GAME.state") === "tree";
	}

	return { E, frame, mouse, tap, click, setKeys, playRun, toCamp };
}
