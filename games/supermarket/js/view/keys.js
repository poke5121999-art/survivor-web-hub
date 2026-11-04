// Desktop key labels on the on-screen controls, the same way games/food-gang does it (Hud.js KeyLabels):
// dark keycaps with a white rim stuck to each control, shown only for a fine pointer and dropped on the first touch,
// plus a one-time yellow hint bubble ("Click to look around").
const HINT_KEY = 'supermarket-look-hint';

export class KeyLabels {
  static wanted() {
    if (KeyLabels.touched || !window.matchMedia) return false;
    return matchMedia('(pointer: fine)').matches && !matchMedia('(pointer: coarse)').matches;
  }

  constructor(view) {
    this.view = view;
    const root = this.root = document.createElement('div');
    root.id = 'sm-keys';
    const mk = (cls, html) => { const d = document.createElement('div'); d.className = 'k ' + cls; d.innerHTML = html; root.appendChild(d); d.shown = false; return d; };
    this.stick = document.getElementById('joyhint');
    this.el = {
      w: mk('joy', '<b>W</b>'), a: mk('joy', '<b>A</b>'), s: mk('joy', '<b>S</b>'), d: mk('joy', '<b>D</b>'),
      e: mk('btn', '<b>E</b>'), q: mk('btn', '<b>Q</b>'), tab: mk('btn', '<b>Tab</b>'), look: mk('look', '<b>Mouse</b> look'),
    };
    this.hint = mk('hint', '<b>Click</b> to look around with the mouse');
    let seen = false;
    try { seen = localStorage.getItem(HINT_KEY) === '1'; } catch (e) { /* private mode */ }
    this.hintState = seen ? 'done' : 'show';
    document.body.appendChild(root);
    this.onTouch = () => { KeyLabels.touched = true; this.dispose(); };
    addEventListener('touchstart', this.onTouch, { passive: true });
    this.onLock = () => { if (document.pointerLockElement === view) this.doneHint(); };
    document.addEventListener('pointerlockchange', this.onLock);
    if (this.stick) this.stick.style.display = 'block';
  }

  dispose() {
    removeEventListener('touchstart', this.onTouch);
    document.removeEventListener('pointerlockchange', this.onLock);
    this.root.remove();
    if (this.stick) this.stick.style.display = 'none';
    this.disposed = true;
  }

  doneHint() {
    if (this.hintState === 'done') return;
    this.hintState = 'done';
    try { localStorage.setItem(HINT_KEY, '1'); } catch (e) { /* private mode */ }
  }

  place(el, on, x, y, size) {
    if (on && !(Number.isFinite(x) && Number.isFinite(y))) on = false;
    if (el.shown !== on) { el.shown = on; el.style.display = on ? 'flex' : 'none'; }
    if (!on) return;
    const k = Math.round(x) + ',' + Math.round(y) + ',' + size;
    if (el.at === k) return;
    el.at = k; el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px'; el.style.fontSize = size + 'px';
  }

  update(playing) {
    if (this.disposed) return;
    const box = id => { const n = document.getElementById(id); if (!n || n.style.display === 'none') return null; const r = n.getBoundingClientRect(); return r.width ? r : null; };
    const j = playing ? box('joyhint') : null;
    if (this.stick) this.stick.style.display = playing ? 'block' : 'none';
    if (j) {
      const cx = j.left + j.width / 2, cy = j.top + j.height / 2, o = j.width * 0.5;
      this.place(this.el.w, true, cx, cy - o, 14); this.place(this.el.s, true, cx, cy + o, 14);
      this.place(this.el.a, true, cx - o, cy, 14); this.place(this.el.d, true, cx + o, cy, 14);
    } else for (const k of 'wasd') this.place(this.el[k], false);
    for (const [k, id] of [['e', 'actbtn'], ['q', 'dropbtn'], ['tab', 'taskbtn']]) {
      const r = playing ? box(id) : null;
      if (k === 'tab') this.place(this.el.tab, !!r, r && r.left, r && r.top + r.height / 2, 12);
      else this.place(this.el[k], !!r, r && r.left + r.width / 2, r && r.bottom + 2, 14);
    }
    const locked = document.pointerLockElement === this.view;
    this.place(this.el.look, playing && !locked && this.hintState !== 'show', innerWidth / 2, innerHeight / 2 + 34, 13);
    this.place(this.hint, playing && this.hintState === 'show', innerWidth / 2, innerHeight / 2 - 26, 15);
  }
}
