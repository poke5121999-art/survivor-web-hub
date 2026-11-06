// Desktop key labels on the on-screen controls, the way games/food-gang does it (Hud.js KeyLabels): a DOM layer over
// the canvas with small black keycaps sitting on each touch control while a stage is being played, plus a one-time
// yellow hint bubble. Shown only for a fine pointer without a coarse one (mouse + keyboard), and gone for good after
// the first touch. Keys match main.js: arrows / A D slash, X dash, Space Sword Storm, E potion, P pause.
const HINT_KEY = 'ds.hint.keys.v1';

export function createKeyLabels(canvas, BTN) {
  const wanted = () => !touched && !!window.matchMedia && matchMedia('(pointer: fine)').matches && !matchMedia('(pointer: coarse)').matches;
  let touched = false;
  const root = document.createElement('div');
  root.id = 'ds-keys';
  const mk = (cls, html) => { const d = document.createElement('div'); d.className = `k ${cls}`; d.innerHTML = html; d.shown = false; root.appendChild(d); return d; };
  // label anchors in canvas pixels (480x800), on the controls drawn by render.js
  const el = [
    { d: mk('slash', '<b>←</b><b>A</b>'), at: () => [BTN.left.x + BTN.left.w / 2, BTN.left.y + BTN.left.h - 26] },
    { d: mk('slash', '<b>→</b><b>D</b>'), at: () => [BTN.right.x + BTN.right.w / 2, BTN.right.y + BTN.right.h - 26] },
    { d: mk('dash', '<b>X</b>'), at: () => [BTN.red.cx + BTN.red.r - 6, BTN.red.cy - BTN.red.r + 8] },
    { d: mk('storm', '<b>Space</b>'), at: () => [BTN.blue.cx - BTN.blue.r - 14, BTN.blue.cy + BTN.blue.r - 10] },
    { d: mk('potion', '<b>E</b>'), at: () => [BTN.potion.x + BTN.potion.w - 22, BTN.potion.y + BTN.potion.h - 18] },
    { d: mk('pause', '<b>P</b>'), at: () => [BTN.pause.x + BTN.pause.w + 14, BTN.pause.y + 12] },
  ];
  const hint = { d: mk('hint', 'Press <b>←</b> <b>→</b> to slash, <b>X</b> to dash!'), at: () => [BTN.red.cx + 70, BTN.red.cy - 70] };
  let hintState = 'wait';
  try { if (localStorage.getItem(HINT_KEY) === '1') hintState = 'done'; } catch (e) { /* storage blocked */ }
  let hintT = 0;
  document.body.appendChild(root);
  window.addEventListener('touchstart', () => { touched = true; root.remove(); }, { passive: true, once: true });

  function place(item, on, size) {
    const d = item.d;
    if (d.shown !== on) { d.shown = on; d.style.display = on ? 'flex' : 'none'; }
    if (!on) return;
    const r = canvas.getBoundingClientRect();
    const s = r.width / 480;
    const [x, y] = item.at();
    d.style.left = `${Math.round(r.left + x * s)}px`;
    d.style.top = `${Math.round(r.top + y * s)}px`;
    d.style.fontSize = `${Math.round(size * s)}px`;
  }

  // sim: the running stage or null; called every frame
  function update(sim, dt) {
    const on = wanted() && !!sim && sim.phase === 'play' && !sim.paused && !sim.tutoHold && !sim.offer;
    for (const it of el) place(it, on && (it.d.classList.contains('potion') ? sim.potions > 0 : it.d.classList.contains('storm') ? sim.skillCharges > 0 : true), 15);
    if (hintState === 'wait' && on) { hintState = 'show'; hintT = 0; }
    if (hintState === 'show') {
      hintT += dt;
      if (hintT > 6 || (sim && sim.attacks > 0)) {
        hintState = 'done';
        try { localStorage.setItem(HINT_KEY, '1'); } catch (e) { /* storage blocked */ }
      }
    }
    place(hint, on && hintState === 'show', 15);
  }
  return { update, root, get shown() { return el.filter(i => i.d.shown).length; } };
}
