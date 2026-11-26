"use strict";
// Touch controls for phones. The game is played with a mouse cursor, so a finger drives the cursor:
// a quick tap is a left click, dragging moves the cursor without pressing (sweeping loot, like hovering),
// a still hold is a held left button (Focus). A virtual stick replaces WASD for panning, and buttons send the
// keys the run uses (Space challenge, Right Shift war cry, Q ability, Tab map, Escape pause).
const Touch = (() => {
	const TAP_MS = 220, HOLD_MS = 320, SLOP = 12;
	let ui = null, stick = null, knob = null, cursorFinger = null, stickFinger = null;
	const held = new Set();

	function setKeys(want) {
		for (const k of ["KeyW", "KeyA", "KeyS", "KeyD"]) {
			if (want.has(k) && !held.has(k)) { Unity.domKey(k, true); held.add(k); }
			else if (!want.has(k) && held.has(k)) { Unity.domKey(k, false); held.delete(k); }
		}
	}

	function onStick(e, end) {
		const r = stick.getBoundingClientRect();
		const cx = r.left + r.width / 2, cy = r.top + r.height / 2, R = r.width / 2;
		let dx = end ? 0 : e.clientX - cx, dy = end ? 0 : e.clientY - cy;
		const d = Math.hypot(dx, dy);
		if (d > R) { dx *= R / d; dy *= R / d; }
		knob.style.transform = `translate(${dx}px, ${dy}px)`;
		const want = new Set();
		if (d > R * 0.3) {
			if (dx > R * 0.35) want.add("KeyD"); else if (dx < -R * 0.35) want.add("KeyA");
			if (dy > R * 0.35) want.add("KeyS"); else if (dy < -R * 0.35) want.add("KeyW");
		}
		setKeys(want);
	}

	function cursorDown(e) {
		cursorFinger = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: false, pressed: false };
		Unity.mouseMove(e.clientX, e.clientY);
		cursorFinger.timer = setTimeout(() => {
			if (cursorFinger && !cursorFinger.moved) { cursorFinger.pressed = true; Unity.mouseButton(0, true); }
		}, HOLD_MS);
	}
	function cursorMove(e) {
		if (!cursorFinger || e.pointerId !== cursorFinger.id) return;
		if (Math.hypot(e.clientX - cursorFinger.x, e.clientY - cursorFinger.y) > SLOP) cursorFinger.moved = true;
		Unity.mouseMove(e.clientX, e.clientY);
	}
	function cursorUp(e) {
		if (!cursorFinger || e.pointerId !== cursorFinger.id) return;
		clearTimeout(cursorFinger.timer);
		Unity.mouseMove(e.clientX, e.clientY);
		if (cursorFinger.pressed) Unity.mouseButton(0, false);
		else if (!cursorFinger.moved && performance.now() - cursorFinger.t < TAP_MS + HOLD_MS) {
			Unity.mouseButton(0, true);
			setTimeout(() => Unity.mouseButton(0, false), 34);
		}
		cursorFinger = null;
	}

	function button(label, code, cls) {
		const b = document.createElement("div");
		b.className = "tbtn " + (cls || "");
		b.textContent = label;
		b.addEventListener("pointerdown", (e) => { e.stopPropagation(); e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add("on"); Unity.domKey(code, true); });
		const up = (e) => { e.stopPropagation(); b.classList.remove("on"); Unity.domKey(code, false); };
		b.addEventListener("pointerup", up);
		b.addEventListener("pointercancel", up);
		return b;
	}

	function build() {
		ui = document.createElement("div");
		ui.id = "touch";
		stick = document.createElement("div");
		stick.id = "stick";
		knob = document.createElement("div");
		knob.id = "knob";
		stick.appendChild(knob);
		stick.addEventListener("pointerdown", (e) => { e.stopPropagation(); e.preventDefault(); stick.setPointerCapture(e.pointerId); stickFinger = e.pointerId; onStick(e, false); });
		stick.addEventListener("pointermove", (e) => { if (e.pointerId === stickFinger) { e.stopPropagation(); onStick(e, false); } });
		const end = (e) => { if (e.pointerId === stickFinger) { e.stopPropagation(); stickFinger = null; onStick(e, true); } };
		stick.addEventListener("pointerup", end);
		stick.addEventListener("pointercancel", end);
		const pad = document.createElement("div");
		pad.id = "tpad";
		pad.append(button("ESC", "Escape", "small"), button("TAB", "Tab", "small"), button("Q", "KeyQ"), button("CRY", "ShiftRight"), button("SPACE", "Space", "wide"));
		ui.append(stick, pad);
		document.body.appendChild(ui);
	}

	// Only shown while a run is on screen; menus and camp are played with taps.
	function update() {
		if (!ui) return;
		let run = false;
		try { run = G$GAME.state === "run"; } catch (e) { }
		ui.classList.toggle("show", run);
		if (!run && held.size) setKeys(new Set());
	}

	function init() {
		const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
		if (!coarse && !("ontouchstart" in window)) return false;
		build();
		window.addEventListener("pointerdown", (e) => { if (e.pointerType === "touch" && cursorFinger === null) cursorDown(e); });
		window.addEventListener("pointermove", (e) => { if (e.pointerType === "touch") cursorMove(e); });
		window.addEventListener("pointerup", (e) => { if (e.pointerType === "touch") cursorUp(e); });
		window.addEventListener("pointercancel", (e) => { if (e.pointerType === "touch") cursorUp(e); });
		return true;
	}

	// Controls go into the letterbox bars when they are wide enough (Xiaomi 17T landscape has ~125 px each side),
	// otherwise over the canvas corners.
	function layout(x, y, w, h) {
		if (!ui) return;
		ui.style.left = "0"; ui.style.top = "0"; ui.style.width = "100%"; ui.style.height = "100%";
		const bars = x >= 100;
		const size = bars ? Math.min(x - 16, 140) : Math.round(w * 0.17);
		stick.style.width = size + "px";
		stick.style.left = (bars ? Math.round((x - size) / 2) : Math.round(x + w * 0.03)) + "px";
		stick.style.bottom = Math.round(innerHeight * 0.08) + "px";
		const pad = ui.querySelector("#tpad");
		pad.style.gridTemplateColumns = bars ? "auto" : "repeat(3, auto)";
		pad.style.right = (bars ? Math.max(4, Math.round((x - 110) / 2)) : Math.round(x + w * 0.02)) + "px";
		pad.style.bottom = Math.round(innerHeight * 0.06) + "px";
		for (const b of pad.querySelectorAll(".wide")) { b.style.gridColumn = bars ? "auto" : "span 3"; b.style.minWidth = bars ? "100px" : "150px"; }
	}

	return { init, update, layout };
})();
