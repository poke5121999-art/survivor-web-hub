// [ĐỀ XUẤT] keyboard help, the way games/food-gang surfaces its controls (Hud.js KeyLabels): desktop only (the original
// is a touch game with on-screen buttons alone), a key cap under each on-screen control that has a key (Interact E,
// Open / Close F, Throw G, Leave Checkout Esc, placement Q / E / R / Esc), and a one-time bubble for what has no button
// on a desktop (move with WASD, click to look with the mouse). DOM over the canvas, never takes the pointer; a touch
// anywhere removes it for good.
const HINT_KEY = 'ps-hint-move';
const HINT_SECONDS = 12;

// HUD path -> key cap text; shown while that control is visible
const CAPS = [
  ['HudUI/PlayerControls/Interact', 'E'],
  ['HudUI/PlayerControls/BoxButtons/Open', 'F'],
  ['HudUI/PlayerControls/BoxButtons/Closed', 'F'],
  ['HudUI/PlayerControls/BoxButtons/Throw', 'G'],
  ['HudUI/CheckOutCounter/ExitCheckOut', 'Esc'],
  ['HudUI/PlayerControls/MoveObjButtons/Container/RotateRight', 'R'],
  ['HudUI/PlayerControls/MoveObjButtons/Container/RotateLeft', 'Q'],
  ['HudUI/PlayerControls/MoveObjButtons/Container/Place', 'E'],
  ['HudUI/PlayerControls/MoveObjButtons/Container/Cancel', 'Esc'],
];

export class KeyLabels {
  static wanted() {
    if (KeyLabels.touched || !window.matchMedia) return false;
    return matchMedia('(pointer: fine)').matches && !matchMedia('(pointer: coarse)').matches;
  }

  constructor(hud) {
    this.hud = hud;
    const root = this.root = document.createElement('div');
    root.id = 'ps-keys';
    const mk = (cls, html) => { const d = document.createElement('div'); d.className = 'k ' + cls; d.innerHTML = html; root.appendChild(d); d.shown = false; return d; };
    this.caps = CAPS.map(([path, key]) => ({ path, el: mk('cap', `<b>${key}</b>`) }));
    this.hint = mk('hint', '');
    let seen = false;
    try { seen = localStorage.getItem(HINT_KEY) === '1'; } catch (e) { /* private mode */ }
    this.hintState = seen ? 'done' : 'wait';
    this.hintT = 0;
    this.moved = false;
    document.body.appendChild(root);
    this.onTouch = () => { KeyLabels.touched = true; this.dispose(); };
    window.addEventListener('touchstart', this.onTouch, { passive: true });
  }

  dispose() {
    window.removeEventListener('touchstart', this.onTouch);
    this.root.remove();
    this.disposed = true;
  }

  place(el, on, x, y, size) {
    if (on && !(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(size))) on = false;
    if (el.shown !== on) { el.shown = on; el.style.display = on ? 'flex' : 'none'; }
    if (!on) return;
    const k = Math.round(x) + ',' + Math.round(y) + ',' + Math.round(size);
    if (el.at === k) return;
    el.at = k;
    el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px'; el.style.fontSize = Math.round(size) + 'px';
  }

  // st: { canMove, moved, locked } from the game loop
  update(dt, st) {
    if (this.disposed) return;
    const h = this.hud;
    const visible = el => { for (let e = el; e; e = e.parentElement) if (e.hidden) return false; return true; };
    for (const c of this.caps) {
      const el = h.q(c.path);
      const r = el && visible(el) ? el.getBoundingClientRect() : null;
      if (!r || r.width < 1) { this.place(c.el, false); continue; }
      this.place(c.el, true, r.left + r.width / 2, r.top + r.height * 0.98, Math.max(12, r.height * 0.2));
    }
    this.updateHint(dt, st);
  }

  // the first time the player may walk: how to move and look (the touch joystick / look field have no desktop button)
  updateHint(dt, st) {
    if (this.hintState === 'wait' && st.canMove && !this.hud.modal) { this.hintState = 'show'; this.hintT = 0; }
    if (this.hintState === 'show') {
      this.hintT += dt;
      if (st.moved && st.locked) this.doneMove = true;
      if (this.doneMove || this.hintT > HINT_SECONDS) {
        this.hintState = 'done';
        try { localStorage.setItem(HINT_KEY, '1'); } catch (e) { /* private mode */ }
      }
    }
    const show = this.hintState === 'show' && !this.hud.modal && st.canMove;
    if (show) {
      const vi = this.hud.settings.lang === 'vi';
      const html = st.locked
        ? (vi ? 'Đi bằng <b>W</b><b>A</b><b>S</b><b>D</b>' : 'Move with <b>W</b><b>A</b><b>S</b><b>D</b>')
        : (vi ? '<b>Click</b> để nhìn bằng chuột · đi bằng <b>W</b><b>A</b><b>S</b><b>D</b>' : '<b>Click</b> to look with the mouse · move with <b>W</b><b>A</b><b>S</b><b>D</b>');
      if (this.hint.dataset.h !== html) { this.hint.innerHTML = html; this.hint.dataset.h = html; }
      this.place(this.hint, true, innerWidth * 0.5, innerHeight * 0.72, Math.max(16, innerHeight * 0.03));
    } else this.place(this.hint, false);
  }
}
