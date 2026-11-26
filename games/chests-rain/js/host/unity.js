"use strict";
// The Unity and .NET surface the translated game touches (names come from tools/xlate's report),
// re-implemented over the browser: Input System devices fed by DOM events, PlayerPrefs on localStorage,
// Resources from preloaded assets, Time, Screen, plus the BCL members the table does not inline.
const Unity = {
	t0: (typeof performance !== "undefined" ? performance.now() : Date.now()),
	time: 0,
	frame: 0,
	resources: new Map(),
	prefsPrefix: "chestsrain.",
	storage: null,
	screen: { width: 1280, height: 720 },
	focused: true,
	mouse: { x: 0, y: 0, scroll: 0, buttons: [false, false, false], prev: [false, false, false], down: [false, false, false], up: [false, false, false] },
	keys: new Map(),
	padIndex: -1,
	onMotor: null,
	chunkBudgetMs: 6,

	now() { return ((typeof performance !== "undefined" ? performance.now() : Date.now()) - Unity.t0) / 1000; },

	frameStart() {
		Unity.time = Unity.now();
		Unity.frame++;
		const m = Unity.mouse;
		for (let i = 0; i < 3; i++) {
			m.down[i] = m.pend[i] === 1 || (m.buttons[i] && !m.prev[i]);
			m.up[i] = m.pend[i] === 2 || (!m.buttons[i] && m.prev[i]);
			if (m.pend[i] === 3) { m.down[i] = true; m.up[i] = true; }
			m.prev[i] = m.buttons[i];
			m.pend[i] = 0;
		}
		for (const k of Unity.keyList) {
			k.wasPressedThisFrame = k.pendDown || (k.isPressed && !k.prevPressed);
			k.wasReleasedThisFrame = k.pendUp || (!k.isPressed && k.prevPressed);
			k.prevPressed = k.isPressed;
			k.pendDown = k.pendUp = false;
		}
		Unity.pollPad();
		Unity.pumpChunks(Unity.chunkBudgetMs);
	},
	frameEnd() { Unity.mouse.scroll = 0; },

	// Chunk baking ran on worker threads in Unity; here it runs in a per-frame time budget.
	pumpChunks(budgetMs) {
		if (typeof G$WORLD === "undefined" || !G$WORLD.chunkState) return;
		const until = Unity.now() + budgetMs / 1000;
		do {
			let ci;
			try { ci = G$WORLD.ClaimWanted(); } catch (e) { return; }
			if (ci < 0) return;
			G$WORLD.BakeAndStore(ci, true);
		} while (Unity.now() < until);
	},
	pumpOneChunk() {
		let ci;
		try { ci = G$WORLD.ClaimWanted(); } catch (e) { return false; }
		if (ci < 0) return false;
		G$WORLD.BakeAndStore(ci, true);
		return true;
	},

	// ---- devices ----
	keyList: [],
	keyByCode: new Map(),
	makeKeys() {
		for (const [name, code] of Object.entries(UNITY_KEY)) {
			if (Unity.keyByCode.has(code)) continue;
			const k = { keyCode: code, name, isPressed: false, prevPressed: false, wasPressedThisFrame: false, wasReleasedThisFrame: false, pendDown: false, pendUp: false, displayName: name.length === 1 ? name : name };
			Unity.keyByCode.set(code, k);
			Unity.keyList.push(k);
		}
	},
	domKey(code, down) {
		const name = DOM_TO_UNITY_KEY[code] || (code.startsWith("Key") ? code.slice(3) : code);
		const kc = UNITY_KEY[name];
		if (kc === undefined) return false;
		const k = Unity.keyByCode.get(kc);
		if (down) { if (!k.isPressed) k.pendDown = true; k.isPressed = true; }
		else { if (k.isPressed) k.pendUp = true; k.isPressed = false; }
		return true;
	},
	releaseAll() {
		for (const k of Unity.keyList) if (k.isPressed) { k.isPressed = false; k.pendUp = true; }
		for (let i = 0; i < 3; i++) if (Unity.mouse.buttons[i]) Unity.mouseButton(i, false);
	},
	mouseButton(i, down) {
		const m = Unity.mouse;
		if (down === m.buttons[i]) return;
		m.buttons[i] = down;
		m.pend[i] = (m.pend[i] && m.pend[i] !== (down ? 1 : 2)) ? 3 : (down ? 1 : 2);
	},
	// Screen position in Unity convention: pixels from the bottom-left.
	mouseMove(cssX, cssY) { Unity.mouse.x = cssX; Unity.mouse.y = Unity.screen.height - cssY; },

	pad: null,
	pollPad() {
		const pads = typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : [];
		let gp = null;
		for (const p of pads || []) if (p && p.connected && p.mapping === "standard") { gp = p; break; }
		if (!gp) for (const p of pads || []) if (p && p.connected) { gp = p; break; }
		if (!gp) { Unity.pad = null; return; }
		if (!Unity.pad || Unity.pad.id !== gp.id) Unity.pad = makePad(gp.id);
		Unity.pad.update(gp);
	},
};
Unity.mouse.pend = [0, 0, 0];

function makeButton() {
	return { isPressed: false, prev: false, wasPressedThisFrame: false, wasReleasedThisFrame: false, value: 0, displayName: "" };
}
// Unity's DualShockGamepad subclass decides PlayStation button prompts (E.PollPad).
class DualShockGamepad { }
function makePad(id) {
	const b = {};
	for (const n of ["buttonSouth", "buttonEast", "buttonWest", "buttonNorth", "leftShoulder", "rightShoulder", "selectButton", "startButton", "leftStickButton", "rightStickButton", "up", "down", "left", "right", "leftTrigger", "rightTrigger"]) b[n] = makeButton();
	// Standard mapping indices.
	const idx = { buttonSouth: 0, buttonEast: 1, buttonWest: 2, buttonNorth: 3, leftShoulder: 4, rightShoulder: 5, leftTrigger: 6, rightTrigger: 7, selectButton: 8, startButton: 9, leftStickButton: 10, rightStickButton: 11, up: 12, down: 13, left: 14, right: 15 };
	const pad = {
		id, b, raw: null,
		leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 },
		dpad: { up: b.up, down: b.down, left: b.left, right: b.right },
		update(gp) {
			pad.raw = gp;
			for (const [n, i] of Object.entries(idx)) {
				const btn = gp.buttons[i];
				const v = btn ? (typeof btn === "object" ? btn.value : btn) : 0;
				const pressed = btn ? (btn.pressed || v > 0.5) : false;
				const c = b[n];
				c.wasPressedThisFrame = pressed && !c.isPressed;
				c.wasReleasedThisFrame = !pressed && c.isPressed;
				c.isPressed = pressed;
				c.value = v;
			}
			// Unity sticks are y-up; the Gamepad API is y-down.
			pad.leftStick = { x: gp.axes[0] || 0, y: -(gp.axes[1] || 0) };
			pad.rightStick = { x: gp.axes[2] || 0, y: -(gp.axes[3] || 0) };
		},
	};
	if (/054c|dualsense|dualshock|wireless controller/i.test(id || "")) Object.setPrototypeOf(pad, DualShockGamepad.prototype);
	return pad;
}

const UNITY_KEY = {"None": 0, "Space": 1, "Enter": 2, "Tab": 3, "Backquote": 4, "Quote": 5, "Semicolon": 6, "Comma": 7, "Period": 8, "Slash": 9, "Backslash": 10, "LeftBracket": 11, "RightBracket": 12, "Minus": 13, "Equals": 14, "A": 15, "B": 16, "C": 17, "D": 18, "E": 19, "F": 20, "G": 21, "H": 22, "I": 23, "J": 24, "K": 25, "L": 26, "M": 27, "N": 28, "O": 29, "P": 30, "Q": 31, "R": 32, "S": 33, "T": 34, "U": 35, "V": 36, "W": 37, "X": 38, "Y": 39, "Z": 40, "Digit1": 41, "Digit2": 42, "Digit3": 43, "Digit4": 44, "Digit5": 45, "Digit6": 46, "Digit7": 47, "Digit8": 48, "Digit9": 49, "Digit0": 50, "LeftShift": 51, "RightShift": 52, "LeftAlt": 53, "RightAlt": 54, "LeftCtrl": 55, "RightCtrl": 56, "LeftMeta": 57, "RightMeta": 58, "ContextMenu": 59, "Escape": 60, "LeftArrow": 61, "RightArrow": 62, "UpArrow": 63, "DownArrow": 64, "Backspace": 65, "PageDown": 66, "PageUp": 67, "Home": 68, "End": 69, "Insert": 70, "Delete": 71, "CapsLock": 72, "NumLock": 73, "PrintScreen": 74, "ScrollLock": 75, "Pause": 76, "NumpadEnter": 77, "NumpadDivide": 78, "NumpadMultiply": 79, "NumpadPlus": 80, "NumpadMinus": 81, "NumpadPeriod": 82, "NumpadEquals": 83, "Numpad0": 84, "Numpad1": 85, "Numpad2": 86, "Numpad3": 87, "Numpad4": 88, "Numpad5": 89, "Numpad6": 90, "Numpad7": 91, "Numpad8": 92, "Numpad9": 93, "F1": 94, "F2": 95, "F3": 96, "F4": 97, "F5": 98, "F6": 99, "F7": 100, "F8": 101, "F9": 102, "F10": 103, "F11": 104, "F12": 105};
const DOM_TO_UNITY_KEY = {
	Space: "Space", Enter: "Enter", Tab: "Tab", Backquote: "Backquote", Quote: "Quote", Semicolon: "Semicolon", Comma: "Comma",
	Period: "Period", Slash: "Slash", Backslash: "Backslash", BracketLeft: "LeftBracket", BracketRight: "RightBracket", Minus: "Minus",
	Equal: "Equals", ShiftLeft: "LeftShift", ShiftRight: "RightShift", AltLeft: "LeftAlt", AltRight: "RightAlt", ControlLeft: "LeftCtrl",
	ControlRight: "RightCtrl", MetaLeft: "LeftMeta", MetaRight: "RightMeta", ContextMenu: "ContextMenu", Escape: "Escape",
	ArrowLeft: "LeftArrow", ArrowRight: "RightArrow", ArrowUp: "UpArrow", ArrowDown: "DownArrow", Backspace: "Backspace",
	PageDown: "PageDown", PageUp: "PageUp", Home: "Home", End: "End", Insert: "Insert", Delete: "Delete", CapsLock: "CapsLock",
	NumLock: "NumLock", PrintScreen: "PrintScreen", ScrollLock: "ScrollLock", Pause: "Pause", NumpadEnter: "NumpadEnter",
	NumpadDivide: "NumpadDivide", NumpadMultiply: "NumpadMultiply", NumpadAdd: "NumpadPlus", NumpadSubtract: "NumpadMinus",
	NumpadDecimal: "NumpadPeriod", NumpadEqual: "NumpadEquals",
};
for (let i = 0; i <= 9; i++) { DOM_TO_UNITY_KEY["Digit" + i] = "Digit" + i; DOM_TO_UNITY_KEY["Numpad" + i] = "Numpad" + i; }
for (let i = 1; i <= 12; i++) DOM_TO_UNITY_KEY["F" + i] = "F" + i;
Unity.makeKeys();

const KEYBOARD = {
	get allKeys() { return Unity.keyList; },
	key(code) { return Unity.keyByCode.get(code) || null; },
	get shiftKey() { const a = Unity.keyByCode.get(51), b = Unity.keyByCode.get(52); return { isPressed: a.isPressed || b.isPressed }; },
	get ctrlKey() { const a = Unity.keyByCode.get(55), b = Unity.keyByCode.get(56); return { isPressed: a.isPressed || b.isPressed }; },
	get altKey() { const a = Unity.keyByCode.get(53), b = Unity.keyByCode.get(54); return { isPressed: a.isPressed || b.isPressed }; },
	get leftMetaKey() { return Unity.keyByCode.get(57); },
	get rightMetaKey() { return Unity.keyByCode.get(58); },
};
const MOUSE = {
	get position() { return { $v2: true, x: Unity.mouse.x, y: Unity.mouse.y }; },
	leftButton: { b: 0 }, rightButton: { b: 1 }, middleButton: { b: 2 },
	get scroll() { return { $v2: true, x: 0, y: Unity.mouse.scroll }; },
};
const MOUSE_BTN = (c) => c.b;

// ---- Unity value types ----
function $uV2(x, y) { return { $v2: true, x, y }; }
function inflateZlib(bytes) { return $inflate(bytes.subarray ? bytes.subarray(2, bytes.length - 4) : bytes.slice(2, bytes.length - 4)); }

Object.assign($x, {
	// Input System
	Keyboard_get_current_0: () => KEYBOARD,
	Keyboard_get_allKeys_0: (k) => k.allKeys,
	Keyboard_get_this___1: (k, code) => k.key(code),
	Keyboard_get_shiftKey_0: (k) => k.shiftKey,
	Keyboard_get_ctrlKey_0: (k) => k.ctrlKey,
	Keyboard_get_altKey_0: (k) => k.altKey,
	Keyboard_get_leftMetaKey_0: (k) => k.leftMetaKey,
	Keyboard_get_rightMetaKey_0: (k) => k.rightMetaKey,
	KeyControl_get_keyCode_0: (k) => k.keyCode,
	InputControl_get_displayName_0: (c) => c.displayName || "",
	Mouse_get_current_0: () => (typeof window !== "undefined" || Unity.headlessMouse) ? MOUSE : null,
	Pointer_get_position_0: (m) => m.position,
	Mouse_get_leftButton_0: (m) => m.leftButton,
	Mouse_get_rightButton_0: (m) => m.rightButton,
	Mouse_get_middleButton_0: (m) => m.middleButton,
	Mouse_get_scroll_0: (m) => m.scroll,
	Mouse_WarpCursorPosition_1: (m, p) => { },
	ButtonControl_get_isPressed_0: (c) => c.b !== undefined ? Unity.mouse.buttons[c.b] : c.isPressed,
	ButtonControl_get_wasPressedThisFrame_0: (c) => c.b !== undefined ? Unity.mouse.down[c.b] : c.wasPressedThisFrame,
	ButtonControl_get_wasReleasedThisFrame_0: (c) => c.b !== undefined ? Unity.mouse.up[c.b] : c.wasReleasedThisFrame,
	InputControl_1_ReadValue_0: (c) => c.$v2 ? c : (c.value !== undefined ? c.value : c),
	Gamepad_get_current_0: () => Unity.pad,
	Gamepad_get_leftStick_0: (p) => $uV2(p.leftStick.x, p.leftStick.y),
	Gamepad_get_rightStick_0: (p) => $uV2(p.rightStick.x, p.rightStick.y),
	Gamepad_get_leftTrigger_0: (p) => p.b.leftTrigger,
	Gamepad_get_rightTrigger_0: (p) => p.b.rightTrigger,
	Gamepad_get_buttonSouth_0: (p) => p.b.buttonSouth,
	Gamepad_get_buttonEast_0: (p) => p.b.buttonEast,
	Gamepad_get_buttonWest_0: (p) => p.b.buttonWest,
	Gamepad_get_buttonNorth_0: (p) => p.b.buttonNorth,
	Gamepad_get_leftShoulder_0: (p) => p.b.leftShoulder,
	Gamepad_get_rightShoulder_0: (p) => p.b.rightShoulder,
	Gamepad_get_selectButton_0: (p) => p.b.selectButton,
	Gamepad_get_startButton_0: (p) => p.b.startButton,
	Gamepad_get_leftStickButton_0: (p) => p.b.leftStickButton,
	Gamepad_get_rightStickButton_0: (p) => p.b.rightStickButton,
	Gamepad_get_dpad_0: (p) => p.dpad,
	DpadControl_get_up_0: (d) => d.up,
	DpadControl_get_down_0: (d) => d.down,
	DpadControl_get_left_0: (d) => d.left,
	DpadControl_get_right_0: (d) => d.right,
	Gamepad_SetMotorSpeeds_2: (p, lo, hi) => {
		const gp = p.raw;
		if (gp && gp.vibrationActuator && (lo > 0 || hi > 0)) {
			try { gp.vibrationActuator.playEffect("dual-rumble", { duration: 120, strongMagnitude: Math.min(1, lo), weakMagnitude: Math.min(1, hi) }); } catch (e) { }
		}
	},
	Enum_TryParse_2: (s, box) => { const v = UNITY_KEY[s]; if (v === undefined) { box.v = 0; return false; } box.v = v; return true; },

	// Vectors and rects
	new_Vector2: (x, y) => $uV2(x, y),
	new_Vector3: (x, y, z) => ({ x, y, z }),
	new_Vector4: (x, y, z, w) => ({ x, y, z, w }),
	new_Color: (r, g, b, a) => ({ r, g, b, a: a === undefined ? 1 : a }),
	new_Color32: (r, g, b, a) => ({ r, g, b, a }),
	Vector2_x_0: (v) => v.x,
	Vector2_y_0: (v) => v.y,
	Vector2_get_zero_0: () => $uV2(0, 0),
	Vector2_get_one_0: () => $uV2(1, 1),
	Vector2_get_sqrMagnitude_0: (v) => v.x * v.x + v.y * v.y,
	Vector2_op_Inequality_2: (a, b) => a.x !== b.x || a.y !== b.y,
	Vector2_op_Subtraction_2: (a, b) => $uV2(a.x - b.x, a.y - b.y),
	Vector3_get_zero_0: () => ({ x: 0, y: 0, z: 0 }),
	Vector3_get_one_0: () => ({ x: 1, y: 1, z: 1 }),
	Vector3_op_Multiply_2: (a, k) => typeof a === "number" ? { x: k.x * a, y: k.y * a, z: k.z * a } : { x: a.x * k, y: a.y * k, z: a.z * k },
	Vector4_get_zero_0: () => ({ x: 0, y: 0, z: 0, w: 0 }),
	Matrix4x4_get_identity_0: () => ({ identity: true }),
	new_Rect: (x, y, width, height) => ({ x, y, width, height }),
	Rect_get_x_0: (r) => r.x, Rect_get_y_0: (r) => r.y,
	Rect_get_width_0: (r) => r.width, Rect_get_height_0: (r) => r.height,
	Rect_get_xMin_0: (r) => r.x, Rect_get_yMin_0: (r) => r.y,
	Rect_get_xMax_0: (r) => r.x + r.width, Rect_get_yMax_0: (r) => r.y + r.height,
	Rect_Contains_1: (r, p) => p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height,
	Rect_MinMaxRect_4: (x0, y0, x1, y1) => ({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 }),
	Rect_op_Inequality_2: (a, b) => a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height,
	new_RectInt: (x, y, width, height) => ({ x, y, width, height }),
	RectInt_get_x_0: (r) => r.x, RectInt_get_y_0: (r) => r.y, RectInt_get_width_0: (r) => r.width, RectInt_get_height_0: (r) => r.height,

	// Engine
	Time_get_realtimeSinceStartupAsDouble_0: () => Unity.now(),
	Screen_get_width_0: () => Unity.screen.width,
	Screen_get_height_0: () => Unity.screen.height,
	Application_get_isFocused_0: () => Unity.focused,
	Application_get_persistentDataPath_0: () => "",
	Application_get_systemLanguage_0: () => Unity.systemLanguage(),
	Application_Quit_0: () => { },
	QualitySettings_get_activeColorSpace_0: () => 1,
	SystemInfo_get_graphicsUVStartsAtTop_0: () => false,
	Debug_Log_1: (m) => console.log($os(m)),
	Debug_LogWarning_1: (m) => console.warn($os(m)),
	Debug_LogError_1: (m) => { console.error($os(m)); if (typeof Host !== "undefined") Host.errors.push($os(m)); },
	Cursor_SetCursor_3: () => { },
	Object_op_Equality_2: (a, b) => (a == null ? null : a) === (b == null ? null : b),
	Object_op_Inequality_2: (a, b) => (a == null ? null : a) !== (b == null ? null : b),
	Object_Destroy_1: (o) => { if (o && o.$destroy) o.$destroy(); },
	Object_set_hideFlags_1: () => { },
	Object_set_name_1: (o, n) => { if (o) o.name = n; },
	Behaviour_get_enabled_0: (b) => b ? b.enabled !== false : false,
	Behaviour_set_enabled_1: (b, v) => { if (b) b.enabled = v; },

	// PlayerPrefs -> localStorage
	PlayerPrefs_HasKey_1: (k) => Unity.prefGet(k) !== null,
	PlayerPrefs_GetString_1: (k) => { const v = Unity.prefGet(k); return v === null ? "" : v; },
	PlayerPrefs_SetString_2: (k, v) => Unity.prefSet(k, v),
	PlayerPrefs_DeleteKey_1: (k) => Unity.prefDel(k),
	PlayerPrefs_Save_0: () => { },

	// Resources (text assets preloaded as bytes)
	Resources_Load_1: (name) => {
		const b = Unity.resources.get(String(name).toLowerCase());
		return b ? { $textAsset: true, name, bytes: b } : null;
	},
	Resources_UnloadAsset_1: () => { },
	TextAsset_get_bytes_0: (t) => t.bytes,
	TextAsset_get_text_0: (t) => new TextDecoder("utf-8").decode(t.bytes),
	Encoding_get_UTF8_0: () => "utf-8",
	Encoding_GetString_1: (enc, bytes) => new TextDecoder("utf-8").decode(bytes),

	// Files: no file system on the web; Steam cloud mirror and dev telemetry stay off.
	File_Exists_1: () => false,
	File_ReadAllText_1: () => { throw $exc("FileNotFoundException", "no file system"); },
	File_WriteAllText_2: () => { }, File_AppendAllText_2: () => { }, File_Delete_1: () => { }, File_Move_2: () => { },
	File_Copy_3: () => { }, File_Replace_3: () => { }, File_WriteAllBytes_2: () => { },
	Directory_CreateDirectory_1: () => null, Directory_GetFiles_2: () => [],
	Path_Combine_2: (a, b) => a + "/" + b,
	Path_GetDirectoryName_1: (p) => p.replace(/\/[^/]*$/, ""),
	Path_GetFullPath_1: (p) => p,
	Environment_GetCommandLineArgs_0: () => [],
	Environment_get_ProcessorCount_0: () => 2,

	// Threads: chunk baking is pumped from the frame loop (Unity.pumpChunks).
	new_Thread: (fn) => ({ fn, IsAlive: true }),
	Thread_set_IsBackground_1: () => { }, Thread_set_Priority_1: () => { }, Thread_set_Name_1: () => { },
	Thread_Start_0: (t) => { t.IsAlive = true; },
	Thread_get_IsAlive_0: (t) => !!t.IsAlive,
	Thread_Join_0: () => { },
	Monitor_PulseAll_1: () => { },
	Monitor_Wait_1: () => { Unity.pumpOneChunk(); return true; },
	Monitor_Wait_2: () => { Unity.pumpOneChunk(); return true; },
	Interlocked_Increment_1: (b) => ++b.v,
	Interlocked_Decrement_1: (b) => --b.v,
	Interlocked_CompareExchange_3: (b, v, cmp) => { const o = b.v; if (o === cmp) b.v = v; return o; },
	Volatile_Read_1: (b) => b.v,
	Volatile_Write_2: (b, v) => { b.v = v; },
	ThreadPool_QueueUserWorkItem_1: (fn) => { setTimeout(() => fn(null), 0); return true; },
	Parallel_For_3: (a, b, fn) => { for (let i = a; i < b; i++) fn(i); return null; },
	GC_KeepAlive_1: () => { },

	// Time
	Stopwatch_StartNew_0: () => ({ t: Unity.now() }),
	Stopwatch_get_Elapsed_0: (s) => ({ ms: (Unity.now() - s.t) * 1000 }),
	Stopwatch_get_ElapsedMilliseconds_0: (s) => Math.floor((Unity.now() - s.t) * 1000),
	Stopwatch_GetTimestamp_0: () => Math.floor(Unity.now() * 1e7),
	Stopwatch_Frequency_0: () => 1e7,
	TimeSpan_get_TotalMilliseconds_0: (t) => t.ms,
	TimeSpan_get_TotalSeconds_0: (t) => t.ms / 1000,
	DateTime_get_Now_0: () => ({ $date: new Date() }),
	DateTime_get_UtcNow_0: () => ({ $date: new Date(), utc: true }),
	DateTime_op_Subtraction_2: (a, b) => ({ ms: a.$date - b.$date }),
	DateTime_ToString_2: (d, f) => {
		const x = d.$date, p = (n, w = 2) => String(n).padStart(w, "0");
		return String(f).replace("yyyy", x.getFullYear()).replace("MM", p(x.getMonth() + 1)).replace("dd", p(x.getDate()))
			.replace("HH", p(x.getHours())).replace("mm", p(x.getMinutes())).replace("ss", p(x.getSeconds()));
	},

	// Strings, numbers, chars
	CultureInfo_get_InvariantCulture_0: () => null,
	StringComparer_get_Ordinal_0: () => ({ $ordinal: true }),
	StringComparer_get_OrdinalIgnoreCase_0: () => ({ $ignoreCase: true }),
	String_Split_2: (s, seps, opt) => {
		if (typeof seps === "number") seps = [seps];
		let parts = [s];
		for (const c of Array.from(seps || [32])) {
			const ch = typeof c === "number" ? String.fromCharCode(c) : c;
			parts = parts.flatMap((p) => p.split(ch));
		}
		if (opt === 1) parts = parts.filter((p) => p.length > 0);
		return parts;
	},
	String_Split_1: (s, seps) => $x.String_Split_2(s, seps, 0),
	String_Join_2: (sep, items) => Array.from(items, (v) => $os(v)).join(sep),
	String_TrimEnd_1: (s, chars) => { const set = new Set(Array.from(typeof chars === "number" ? [chars] : chars, (c) => typeof c === "number" ? String.fromCharCode(c) : c)); let e = s.length; while (e > 0 && set.has(s[e - 1])) e--; return s.slice(0, e); },
	String_TrimStart_1: (s, chars) => { const set = new Set(Array.from(typeof chars === "number" ? [chars] : chars, (c) => typeof c === "number" ? String.fromCharCode(c) : c)); let b = 0; while (b < s.length && set.has(s[b])) b++; return s.slice(b); },
	String_Trim_1: (s, chars) => $x.String_TrimStart_1($x.String_TrimEnd_1(s, chars), chars),
	String_IndexOf_3: (s, x, from, cmp) => typeof cmp === "number" && typeof x === "string" ? s.indexOf(x, from) : s.indexOf(typeof x === "number" ? String.fromCharCode(x) : x, from),
	String_IndexOf_2: (s, x, b) => typeof b === "number" ? $strIndexOf(s, x, b) : $strIndexOf(s, x, 0),
	String_CompareOrdinal_5: (a, ai, b, bi, n) => $cmpOrd(a.substr(ai, n), b.substr(bi, n)),
	String_StartsWith_2: (s, x) => s.startsWith(x),
	String_Format_2: (f, a) => $fmtStr(f, [a]),
	String_Format_3: (f, a, b) => $fmtStr(f, [a, b]),
	String_Format_4: (f, a, b, c) => $fmtStr(f, [a, b, c]),
	Convert_ToString_2: (v, base) => typeof base === "number" ? (v >>> 0).toString(base) : $os(v),
	Char_IsDigit_1: (c) => c >= 48 && c <= 57,
	Char_IsLetter_1: (c) => /\p{L}/u.test(String.fromCharCode(c)),
	Char_IsLetterOrDigit_1: (c) => /[\p{L}\p{Nd}]/u.test(String.fromCharCode(c)),
	Char_IsUpper_1: (c) => { const s = String.fromCharCode(c); return s !== s.toLowerCase() && s === s.toUpperCase(); },
	Char_IsLower_1: (c) => { const s = String.fromCharCode(c); return s !== s.toUpperCase() && s === s.toLowerCase(); },
	Char_IsWhiteSpace_1: (c) => /\s/.test(String.fromCharCode(c)),
	Char_ToUpperInvariant_1: (c) => String.fromCharCode(c).toUpperCase().charCodeAt(0),
	Char_ToLowerInvariant_1: (c) => String.fromCharCode(c).toLowerCase().charCodeAt(0),
	Char_ToUpper_1: (c) => String.fromCharCode(c).toUpperCase().charCodeAt(0),
	Char_ToLower_1: (c) => String.fromCharCode(c).toLowerCase().charCodeAt(0),
	Int32_ToString_1: (v, f) => typeof f === "string" ? $fmt(v, f) : String(v),
	Int32_ToString_2: (v, f) => $fmt(v, f),
	Int64_ToString_1: (v, f) => typeof f === "string" ? $fmt(v, f) : String(v),
	Byte_ToString_1: (v, f) => typeof f === "string" ? $fmt(v, f) : String(v),
	SByte_ToString_1: (v, f) => typeof f === "string" ? $fmt(v, f) : String(v),
	Double_ToString_1: (v, f) => typeof f === "string" ? $fmt(v, f) : $ds(v),
	Double_ToString_2: (v, f) => $fmt(v, f),
	Single_ToString_1: (v, f) => typeof f === "string" ? $fmt(v, f) : $ds(v),
	Single_GetHashCode_0: (v) => { const b = new Float32Array([v]); return new Int32Array(b.buffer)[0]; },
	Int32_Parse_1: (s) => { const v = $parseInt(s); if (v === null) throw $exc("FormatException", s); return v; },
	Int32_Parse_2: (s, st) => typeof st === "number" && (st & 512) ? $x.Int32_Parse_hex(s) : $x.Int32_Parse_1(s),
	Int32_Parse_3: (s, st) => typeof st === "number" && (st & 512) ? $x.Int32_Parse_hex(s) : $x.Int32_Parse_1(s),
	Int32_Parse_hex: (s) => { const t = String(s).trim(); if (!/^[0-9a-fA-F]+$/.test(t)) throw $exc("FormatException", s); return parseInt(t, 16) | 0; },
	Int32_TryParse_2: (s, box) => { const v = $parseInt(s); box.v = v === null ? 0 : v; return v !== null; },
	Int32_TryParse_4: (s, st, c, box) => {
		if (st & 512) { const t = String(s).trim(); const ok = /^[0-9a-fA-F]+$/.test(t); box.v = ok ? parseInt(t, 16) | 0 : 0; return ok; }
		return $x.Int32_TryParse_2(s, box);
	},
	Int64_TryParse_4: (s, st, c, box) => $x.Int32_TryParse_2(s, box),
	Double_Parse_3: (s) => { const v = $parseDbl(s); if (v === null) throw $exc("FormatException", s); return v; },
	Double_TryParse_4: (s, st, c, box) => { const v = $parseDbl(s); box.v = v === null ? 0 : v; return v !== null; },
	Nullable_Equals_2: (a, b) => a === b,
	Buffer_BlockCopy_5: (src, si, dst, di, n) => {
		const s = new Uint8Array(src.buffer, src.byteOffset, src.byteLength), d = new Uint8Array(dst.buffer, dst.byteOffset, dst.byteLength);
		d.set(s.subarray(si, si + n), di);
	},
	Array_Sort_3: (keys, items, cmp) => { if (Array.isArray(items) || ArrayBuffer.isView(items)) throw new Error("Array.Sort(keys, items)"); $sort(keys, null, items, cmp); },
	Array_Sort_4: (a, index, length, cmp) => $sort(a, cmp, index, length),
	Array_Reverse_3: (a, i, n) => { for (let lo = i, hi = i + n - 1; lo < hi; lo++, hi--) { const t = a[lo]; a[lo] = a[hi]; a[hi] = t; } },
	Comparer_1_Create_1: (fn) => ({ Compare: fn }),
	HashSet_1_RemoveWhere_1: (s, pred) => { let n = 0; for (const x of Array.from(s)) if (pred(x)) { s.delete(x); n++; } return n; },
	IDictionary_2_TryGetValue_2: (d, k, box) => d.tryGet(k, box, null),
	List_1_GetEnumerator_0: (l) => ({ l, i: -1, Dispose() { } }),
	Enumerator_MoveNext_0: (e) => ++e.i < e.l.length,
	Enumerator_get_Current_0: (e) => e.l[e.i],
	Enumerator_Dispose_0: () => { },
	DictionaryEntry_get_Key_0: (e) => e[0],
	DictionaryEntry_get_Value_0: (e) => e[1],
	new_SortedDictionary_2: () => new $SortedDict(),
	SortedDictionary_2_set_this___2: (d, k, v) => d.set(k, v),
	SortedDictionary_2_TryGetValue_2: (d, k, box) => d.tryGet(k, box, null),
	Exception_get_Message_0: (e) => (e && e.message) || "",
	ExceptionDispatchInfo_Capture_1: (e) => ({ e }),
	ExceptionDispatchInfo_Throw_0: (d) => { throw d.e; },
	new_StackTrace_2: () => ({ frames: [] }),
	StackTrace_get_FrameCount_0: () => 0,
	StackTrace_GetFrame_1: () => null,
	StackFrame_GetMethod_0: () => null,
	MethodBase_op_Equality_2: (a, b) => a === b,
	MemberInfo_get_Name_0: (m) => (m && m.name) || "",
	MemberInfo_get_DeclaringType_0: (m) => null,
	Type_get_DeclaringType_0: (t) => null,
	Type_op_Equality_2: (a, b) => a === b,
	Type_op_Inequality_2: (a, b) => a !== b,
	Object_MemberwiseClone_0: (o) => Object.assign(Object.create(Object.getPrototypeOf(o)), o),
	new_Object_0: () => ({}),
	new_Object: () => ({}),
	new_InvalidDataException: (m) => $exc("InvalidDataException", m),
	new_Nullable_1: (v) => v,

	// Regex
	new_Regex: (p) => new RegExp($netRegex(p)),
	Regex_IsMatch_1: (r, s) => { r.lastIndex = 0; return r.test(s); },
	Regex_Replace_2: (r, s, rep) => s.replace(new RegExp(r.source, "g"), typeof rep === "function" ? (m) => rep(m) : rep.replace(/\$(\d)/g, "$$$1")),
	Regex_Match_1: (r, s) => $match(r.exec(s)),
	Regex_Matches_1: (r, s) => Array.from(s.matchAll(new RegExp(r.source, "g")), $match),
	Regex_Escape_1: (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
	Match_get_Groups_0: (m) => m.groups,
	GroupCollection_get_this___1: (g, i) => g[i] || { Success: false, Value: "", Index: 0, Length: 0 },
	Group_get_Success_0: (g) => g.Success,
	Capture_get_Value_0: (c) => c.Value,
	Capture_get_Index_0: (c) => c.Index,
	Capture_get_Length_0: (c) => c.Length,

	// Streams (only zlib payloads inside resources use them)
	new_MemoryStream: (buf, off, n) => buf ? { data: buf.subarray(off || 0, (off || 0) + (n === undefined ? buf.length : n)), pos: 0, parts: [], Dispose() { } } : { parts: [], pos: 0, Dispose() { } },
	MemoryStream_Write_3: (m, b, o, n) => { m.parts.push(b.slice(o, o + n)); },
	MemoryStream_set_Position_1: (m, p) => { if (m.parts.length) m.data = $concat(m.parts); m.pos = p; },
	MemoryStream_ToArray_0: (m) => m.parts.length ? $concat(m.parts) : m.data.slice(),
	new_DeflateStream: (m) => ({ out: $inflate(m.data ? m.data.subarray(m.pos) : $concat(m.parts)), pos: 0, Dispose() { } }),
	DeflateStream_Read_3: (s, buf, off, n) => { const k = Math.min(n, s.out.length - s.pos); buf.set(s.out.subarray(s.pos, s.pos + k), off); s.pos += k; return k; },
	Stream_CopyTo_1: (s, m) => { m.parts.push(s.out.subarray(s.pos)); s.pos = s.out.length; },
	Linq_ToArray_1: (e) => Array.from(e),
});

// LINQ over any iterable, eager.
Object.assign($x, {
	Enumerable_ToList_1: (e) => Array.from(e),
	Enumerable_ToArray_1: (e) => Array.from(e),
	Enumerable_Where_2: (e, f) => Array.from(e).filter((x) => f(x)),
	Enumerable_Select_2: (e, f) => Array.from(e, (x) => f(x)),
	Enumerable_Any_1: (e) => { for (const _ of e) return true; return false; },
	Enumerable_Any_2: (e, f) => { for (const x of e) if (f(x)) return true; return false; },
	Enumerable_All_2: (e, f) => { for (const x of e) if (!f(x)) return false; return true; },
	Enumerable_Count_1: (e) => Array.from(e).length,
	Enumerable_Count_2: (e, f) => { let n = 0; for (const x of e) if (f(x)) n++; return n; },
	Enumerable_Cast_1: (e) => Array.from(e),
	Enumerable_OfType_1: (e) => Array.from(e).filter((x) => x != null),
	Enumerable_Concat_2: (a, b) => Array.from(a).concat(Array.from(b)),
	Enumerable_Contains_2: (e, v) => { for (const x of e) if (x === v) return true; return false; },
	Enumerable_FirstOrDefault_1: (e) => { for (const x of e) return x; return null; },
	Enumerable_FirstOrDefault_2: (e, f) => { for (const x of e) if (f(x)) return x; return null; },
	Enumerable_First_1: (e) => { for (const x of e) return x; throw new Error("Sequence contains no elements"); },
	Enumerable_OrderBy_2: (e, f) => { const a = Array.from(e, (x, i) => [f(x), i, x]); a.sort((p, q) => $defaultCompare(p[0], q[0]) || p[1] - q[1]); return a.map((p) => p[2]); },
	Enumerable_OrderByDescending_2: (e, f) => { const a = Array.from(e, (x, i) => [f(x), i, x]); a.sort((p, q) => $defaultCompare(q[0], p[0]) || p[1] - q[1]); return a.map((p) => p[2]); },
	Enumerable_ToDictionary_2: (e, kf) => { const d = new $Dict(); for (const x of e) d.add(kf(x), x); return d; },
	Enumerable_Sum_2: (e, f) => { let s = 0; for (const x of e) s += f(x); return s; },
	Enumerable_Max_2: (e, f) => { let m = -Infinity; for (const x of e) m = Math.max(m, f(x)); return m; },
	Enumerable_Min_2: (e, f) => { let m = Infinity; for (const x of e) m = Math.min(m, f(x)); return m; },
	Enumerable_Distinct_1: (e) => Array.from(new Set(e)),
	Enumerable_Reverse_1: (e) => Array.from(e).reverse(),
	Enumerable_Skip_2: (e, n) => Array.from(e).slice(n),
	Enumerable_Take_2: (e, n) => Array.from(e).slice(0, n),
	Enumerable_Last_1: (e) => { const a = Array.from(e); return a[a.length - 1]; },
	Enumerable_Sum_1: (e) => { let s = 0; for (const x of e) s += x; return s; },
	Enumerable_Max_1: (e) => Math.max(...e),
	Enumerable_Min_1: (e) => Math.min(...e),
});

function $parseInt(s) {
	if (s == null) return null;
	const t = String(s).trim();
	if (!/^[+-]?\d+$/.test(t)) return null;
	const v = parseInt(t, 10);
	return v > 2147483647 || v < -2147483648 ? null : v;
}
function $parseDbl(s) {
	if (s == null) return null;
	const t = String(s).trim();
	if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) {
		if (t === "NaN") return NaN;
		if (t === "Infinity" || t === "∞") return Infinity;
		if (t === "-Infinity" || t === "-∞") return -Infinity;
		return null;
	}
	return parseFloat(t);
}
function $netRegex(p) { return p.replace(/\(\?<([A-Za-z_]\w*)>/g, "(?<$1>"); }
function $match(m) {
	if (!m) return { Success: false, Value: "", Index: 0, Length: 0, groups: [] };
	const groups = Array.from(m, (v, i) => v === undefined ? { Success: false, Value: "", Index: 0, Length: 0 } : { Success: true, Value: v, Index: m.index, Length: v.length });
	return { Success: true, Value: m[0], Index: m.index, Length: m[0].length, groups };
}
function $concat(parts) {
	let n = 0; for (const p of parts) n += p.length;
	const out = new Uint8Array(n); let o = 0;
	for (const p of parts) { out.set(p, o); o += p.length; }
	return out;
}

class $SortedDict extends $Dict {
	*[Symbol.iterator]() {
		const keys = this.keysList().sort((a, b) => $defaultCompare(a, b));
		for (const k of keys) yield [k, this.get(k)];
	}
	keysList() { return super.keysList().sort((a, b) => $defaultCompare(a, b)); }
	valuesList() { return this.keysList().map((k) => this.get(k)); }
}

Unity.prefGet = (k) => {
	try { const s = Unity.storage || (typeof localStorage !== "undefined" ? localStorage : null); return s ? s.getItem(Unity.prefsPrefix + k) : null; } catch (e) { return null; }
};
Unity.prefSet = (k, v) => {
	try { const s = Unity.storage || (typeof localStorage !== "undefined" ? localStorage : null); if (s) s.setItem(Unity.prefsPrefix + k, v); } catch (e) { }
};
Unity.prefDel = (k) => {
	try { const s = Unity.storage || (typeof localStorage !== "undefined" ? localStorage : null); if (s) s.removeItem(Unity.prefsPrefix + k); } catch (e) { }
};
// The Steam build starts in English unless the player picks a language (UnityEngine.SystemLanguage.English).
Unity.systemLanguage = () => 10;

// Raw DEFLATE decoder (RFC 1951), synchronous, for zlib payloads inside the game's resources.
function $inflate(src) {
	const out = [];
	let outLen = 0, buf = new Uint8Array(1 << 16), pos = 0, bit = 0;
	const need = (n) => { if (outLen + n > buf.length) { let m = buf.length * 2; while (m < outLen + n) m *= 2; const b = new Uint8Array(m); b.set(buf.subarray(0, outLen)); buf = b; } };
	const bits = (n) => { let v = 0; for (let i = 0; i < n; i++) { v |= ((src[pos] >> bit) & 1) << i; if (++bit === 8) { bit = 0; pos++; } } return v; };
	const build = (lens) => {
		const count = new Uint16Array(16), offs = new Uint16Array(16);
		for (const l of lens) count[l]++;
		count[0] = 0;
		for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + count[i - 1];
		const sym = new Uint16Array(lens.length);
		for (let i = 0; i < lens.length; i++) if (lens[i]) sym[offs[lens[i]]++] = i;
		return { count, sym };
	};
	const decode = (t) => {
		let code = 0, first = 0, index = 0;
		for (let len = 1; len < 16; len++) {
			code |= bits(1);
			const c = t.count[len];
			if (code - c < first) return t.sym[index + (code - first)];
			index += c; first += c; first <<= 1; code <<= 1;
		}
		throw new Error("inflate: bad code");
	};
	const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
	const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
	const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
	const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
	let fixedL = null, fixedD = null;
	let final = 0;
	while (!final) {
		final = bits(1);
		const type = bits(2);
		if (type === 0) {
			if (bit) { bit = 0; pos++; }
			const len = src[pos] | (src[pos + 1] << 8); pos += 4;
			need(len); buf.set(src.subarray(pos, pos + len), outLen); outLen += len; pos += len;
			continue;
		}
		let lt, dt;
		if (type === 1) {
			if (!fixedL) {
				const l = new Uint8Array(288);
				for (let i = 0; i < 144; i++) l[i] = 8; for (let i = 144; i < 256; i++) l[i] = 9; for (let i = 256; i < 280; i++) l[i] = 7; for (let i = 280; i < 288; i++) l[i] = 8;
				fixedL = build(l); fixedD = build(new Uint8Array(30).fill(5));
			}
			lt = fixedL; dt = fixedD;
		} else {
			const hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
			const ORD = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
			const cl = new Uint8Array(19);
			for (let i = 0; i < hclen; i++) cl[ORD[i]] = bits(3);
			const ct = build(cl);
			const lens = new Uint8Array(hlit + hdist);
			for (let i = 0; i < hlit + hdist;) {
				const s = decode(ct);
				if (s < 16) lens[i++] = s;
				else if (s === 16) { const p = lens[i - 1]; for (let r = 3 + bits(2); r > 0; r--) lens[i++] = p; }
				else if (s === 17) { for (let r = 3 + bits(3); r > 0; r--) lens[i++] = 0; }
				else { for (let r = 11 + bits(7); r > 0; r--) lens[i++] = 0; }
			}
			lt = build(lens.subarray(0, hlit)); dt = build(lens.subarray(hlit));
		}
		for (;;) {
			const s = decode(lt);
			if (s < 256) { need(1); buf[outLen++] = s; continue; }
			if (s === 256) break;
			const li = s - 257;
			const len = LBASE[li] + bits(LEXT[li]);
			const di = decode(dt);
			const dist = DBASE[di] + bits(DEXT[di]);
			need(len);
			for (let i = 0; i < len; i++) { buf[outLen] = buf[outLen - dist]; outLen++; }
		}
	}
	return buf.slice(0, outLen);
}

// DevTools.cs: the dev console and telemetry are off in the shipped build.
class DevTools { static get Enabled() { return false; } }

// ArrowstormMain.cs is the Unity host (js/host/boot.js plays its role); the panel code reads its Instance.
class ArrowstormMain { }
ArrowstormMain.Instance = null;
