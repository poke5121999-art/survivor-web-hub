// Key bindings: one table of actions, stored by KeyboardEvent.code (layout independent) plus Mouse0/1/2.
// An action keeps as many slots as its default has; bind() replaces one slot, so arrows stay beside WASD.
const KEY = 'dtt.keys.v1';

// mouse: false means the action cannot sit on a mouse button (movement, pause).
export const ACTIONS = [
  { id: 'up', label: 'Đi lên', default: ['KeyW', 'ArrowUp'], mouse: false },
  { id: 'down', label: 'Đi xuống', default: ['KeyS', 'ArrowDown'], mouse: false },
  { id: 'left', label: 'Đi trái', default: ['KeyA', 'ArrowLeft'], mouse: false },
  { id: 'right', label: 'Đi phải', default: ['KeyD', 'ArrowRight'], mouse: false },
  { id: 'fire', label: 'Bắn', default: ['Mouse0'], mouse: true },
  { id: 's1', label: 'Chiêu 1', default: ['KeyQ'], mouse: true },
  { id: 's2', label: 'Chiêu 2', default: ['KeyE'], mouse: true },
  { id: 'ult', label: 'Tuyệt kỹ', default: ['Space'], mouse: true },
  { id: 'heal', label: 'Dùng bình máu', default: ['KeyF'], mouse: true },
  { id: 'score', label: 'Bảng điểm (giữ)', default: ['Tab'], mouse: true },
  { id: 'pause', label: 'Tạm dừng', default: ['Escape'], mouse: false },
];

const byId = new Map(ACTIONS.map((a) => [a.id, a]));
const SPECIAL = {
  Mouse0: 'Chuột trái', Mouse1: 'Chuột giữa', Mouse2: 'Chuột phải', Space: 'Cách', Escape: 'Esc', Tab: 'Tab', Enter: 'Enter', Backspace: 'Xóa lùi',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ShiftLeft: 'Shift trái', ShiftRight: 'Shift phải', ControlLeft: 'Ctrl trái',
  ControlRight: 'Ctrl phải', AltLeft: 'Alt trái', AltRight: 'Alt phải', CapsLock: 'Caps', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[',
  BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Delete: 'Xóa', Insert: 'Ins', Home: 'Home', End: 'End',
  PageUp: 'PgUp', PageDown: 'PgDn', NumpadEnter: 'Num Enter', NumpadAdd: 'Num +', NumpadSubtract: 'Num -', NumpadMultiply: 'Num *', NumpadDivide: 'Num /',
};

export function codeName(code) {
  if (SPECIAL[code]) return SPECIAL[code];
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1];
  m = /^Digit(\d)$/.exec(code);
  if (m) return m[1];
  m = /^Numpad(\d)$/.exec(code);
  if (m) return 'Num ' + m[1];
  return String(code);
}

const valid = (c) => typeof c === 'string' && c.length > 0 && c.length < 24;
let state = {};
const subs = new Set();

function load() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY)); } catch (e) { raw = null; }
  const b = raw && raw.v === 1 && raw.b && typeof raw.b === 'object' ? raw.b : {};
  const out = {};
  const used = new Set();
  for (const a of ACTIONS) {
    const got = Array.isArray(b[a.id]) ? b[a.id] : [];
    // Slot-wise merge: a bad or missing slot falls back to the default, and a code another action already took falls back too.
    out[a.id] = a.default.map((d, i) => {
      const c = got[i];
      const ok = valid(c) && (a.mouse || !/^Mouse/.test(c)) && !used.has(c);
      return ok ? c : d;
    });
    out[a.id].forEach((c) => used.add(c));
  }
  // A fallback to a default can collide with a saved code of a later action: that later action then loses its saved key.
  const seen = new Set();
  for (const a of ACTIONS) {
    out[a.id] = out[a.id].map((c, i) => {
      if (!seen.has(c)) { seen.add(c); return c; }
      const d = a.default[i];
      if (!seen.has(d)) { seen.add(d); return d; }
      return c;
    });
  }
  state = out;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify({ v: 1, b: state })); } catch (e) { /* blocked store: bindings last for this page only */ }
}
const fire = () => { for (const f of subs) { try { f(); } catch (e) { /* a bad listener must not break a rebind */ } } };

load();

export const getBindings = () => Object.fromEntries(ACTIONS.map((a) => [a.id, state[a.id].slice()]));
export const reload = () => { load(); fire(); };
export const onChange = (f) => { subs.add(f); return () => subs.delete(f); };
export const labelFor = (id) => (state[id] ? codeName(state[id][0]) : '');
export const labelsFor = (id) => (state[id] ? state[id].map(codeName) : []);
export const actionOf = (code) => { for (const a of ACTIONS) if (state[a.id].includes(code)) return a.id; return null; };
export const has = (id, code) => !!state[id] && state[id].includes(code);

export function isDown(id, pressed) {
  const l = state[id];
  if (!l) return false;
  for (const c of l) if (pressed.has(c)) return true;
  return false;
}

// bind(id, code): put code on slot `slot` of the action. When another action already owns it nothing changes and the owner is reported;
// pass { swap: true } to trade the two keys instead, so neither action ends up unbound.
export function bind(id, code, slot = 0, opts = {}) {
  const a = byId.get(id);
  if (!a || !valid(code)) return { ok: false, conflict: null };
  if (/^Mouse/.test(code) && !a.mouse) return { ok: false, conflict: null };
  const s = Math.max(0, Math.min(a.default.length - 1, slot | 0));
  const mine = state[id];
  const old = mine[s];
  if (old === code) return { ok: true, conflict: null };
  const sameAt = mine.indexOf(code);
  if (sameAt >= 0) { mine[sameAt] = old; mine[s] = code; save(); fire(); return { ok: true, conflict: null }; }
  const other = actionOf(code);
  if (other) {
    if (!opts.swap) return { ok: false, conflict: other };
    const o = byId.get(other), theirs = state[other], at = theirs.indexOf(code);
    // The other action may not accept our old key (a mouse button on movement): refuse rather than lose a binding.
    if (/^Mouse/.test(old) && !o.mouse) return { ok: false, conflict: other };
    theirs[at] = old; mine[s] = code; save(); fire();
    return { ok: true, conflict: null };
  }
  mine[s] = code; save(); fire();
  return { ok: true, conflict: null };
}

export function resetBindings() {
  state = Object.fromEntries(ACTIONS.map((a) => [a.id, a.default.slice()]));
  save(); fire();
}

// Standard-mapping gamepad: what each button is called on the pad and which action it drives. Fixed, not rebindable.
const PAD_LABEL = { fire: 'RT', s1: 'LB', s2: 'RB', ult: 'LT', heal: 'X', score: 'Back', pause: 'Start' };
export const padLabelFor = (id) => PAD_LABEL[id] || '';
