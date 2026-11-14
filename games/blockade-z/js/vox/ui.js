// Blockade Z voxel prototype: the vox panel and hit feedback (?vox=1).
//  - a corner chip on the title and pause screens opens a small panel: voxel mode on/off (reloads without ?vox=1) and
//    voxel quality low / medium / high (reloads with ?voxq=). Both are plain links to a new URL, so nothing hides state.
//  - api.hit({ kill, head }) draws a pixel hit marker around the crosshair: white ticks for a hit, gold with a pip for a head, a larger red
//    X with flying squares for a kill. The game's own #marker stays untouched; this one sits outside it (14-24 px from the centre).
// Rules applied (skills make-interfaces-feel-better, interaction-design): hit areas >= 40 px; scale(.96) on press; transitions list their
// properties; tabular numbers; the press shows its result within one frame (selection fills at once, the reload starts 140 ms later);
// the marker animates only transform and opacity, 110 ms for a hit and 300 ms for a kill; prefers-reduced-motion drops movement and
// keeps a short opacity flash; focus is visible and kept inside the panel's trigger; Esc and an outside tap close; the chip is
// pointer-events:auto only while a title or pause screen is up, so it never steals a shot.
(() => {
  const BZ = (window.BZ = window.BZ || {});
  if (!BZ.vox || !BZ.vox.register) return;
  const NOOP = () => {};
  const noopApi = () => ({ hit: NOOP, update: NOOP, open: NOOP, close: NOOP, noop: true });

  const T = {
    en: { chip: 'Voxel', on: 'Voxel mode', onH: 'Blocky world, zombies and effects.', off: 'Off', onS: 'On', q: 'Voxel detail', low: 'Low', medium: 'Medium', high: 'High', reload: 'Reloading', aria: 'Voxel options', close: 'Close' },
    vi: { chip: 'Voxel', on: 'Chế độ voxel', onH: 'Thế giới, zombie và hiệu ứng dựng bằng khối.', off: 'Tắt', onS: 'Bật', q: 'Độ chi tiết voxel', low: 'Thấp', medium: 'Vừa', high: 'Cao', reload: 'Đang tải lại', aria: 'Tuỳ chọn voxel', close: 'Đóng' },
  };

  const CSS = `
.vx-chip, .vx-panel, .vx-panel button { font-family: var(--f, 'Trebuchet MS', system-ui, sans-serif); box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
.vx-wrap { position: fixed; z-index: 35; top: max(6px, env(safe-area-inset-top)); right: max(8px, env(safe-area-inset-right)); display: none; flex-direction: column; align-items: flex-end; gap: var(--s-2, 8px); }
body.vx-menu .vx-wrap { display: flex; }
.vx-chip { display: inline-flex; align-items: center; gap: 8px; min-width: 40px; min-height: 40px; padding: 0 12px; cursor: pointer; color: var(--bone, #fff4dc); background: var(--plate, rgba(21,17,12,.78));
  border: var(--b-thick, 3px) solid #000; box-shadow: inset 0 0 0 2px #4a3a26, var(--px, 3px 3px 0 #000); font: 800 var(--t-s, 13px)/1 var(--f, sans-serif); letter-spacing: .08em; text-transform: uppercase; font-variant-numeric: tabular-nums;
  transition: transform .12s ease-out, background-color .12s ease-out, box-shadow .12s ease-out; touch-action: manipulation; }
.vx-chip i { display: inline-block; width: 12px; height: 12px; background: var(--gold, #f4c04a); box-shadow: inset -3px -3px 0 var(--gold-d, #b9801c), 1px 1px 0 #000; flex: none; }
.vx-chip.off i { background: #6b5d4a; box-shadow: inset -3px -3px 0 #3f352a, 1px 1px 0 #000; }
.vx-chip b { font-weight: 900; color: var(--gold, #f4c04a); }
.vx-chip:hover { background-color: rgba(48, 38, 26, .9); }
.vx-chip:active, .vx-panel button:active { transform: scale(.96); }
.vx-chip:focus-visible, .vx-panel button:focus-visible { outline: 3px solid var(--gold, #f4c04a); outline-offset: 2px; }
.vx-panel { width: min(300px, calc(100vw - 24px)); padding: var(--s-3, 12px); color: var(--bone, #fff4dc); background: rgba(28, 22, 16, .94); border: var(--b-thick, 3px) solid #000; box-shadow: inset 0 0 0 2px #4a3a26, 5px 5px 0 rgba(0, 0, 0, .55);
  transform-origin: 100% 0; transition: opacity .14s ease-out, transform .14s ease-out; }
.vx-panel[hidden] { display: none; }
.vx-panel.pre { opacity: 0; transform: translateY(-4px) scale(.96); }
.vx-panel h3 { margin: 0 0 var(--s-2, 8px); font: 900 var(--t-m, 15px)/1.2 var(--f, sans-serif); letter-spacing: .08em; text-transform: uppercase; color: var(--gold, #f4c04a); text-shadow: 2px 2px 0 #000; }
.vx-panel p { margin: 4px 0 var(--s-3, 12px); font: 400 var(--t-s, 13px)/1.4 var(--f, sans-serif); color: #d8c8a8; text-wrap: pretty; }
.vx-panel label { display: block; margin: var(--s-3, 12px) 0 var(--s-1, 4px); font: 700 var(--t-xs, 11px)/1 var(--mono, monospace); letter-spacing: .14em; text-transform: uppercase; color: #cdb892; }
.vx-seg { display: flex; gap: 0; }
.vx-seg button { flex: 1 1 0; min-height: 40px; padding: 0 6px; cursor: pointer; color: var(--bone, #fff4dc); background: rgba(21, 17, 12, .85); border: var(--b-thin, 2px) solid #000; margin-left: -2px; font: 800 var(--t-s, 13px)/1 var(--f, sans-serif); letter-spacing: .04em;
  box-shadow: inset 0 -4px 0 #2c2216; transition: transform .12s ease-out, background-color .12s ease-out, color .12s ease-out; touch-action: manipulation; }
.vx-seg button:first-child { margin-left: 0; }
.vx-seg button:hover { background-color: #3a2c1c; }
.vx-seg button[aria-pressed="true"] { color: #000; background: var(--gold, #f4c04a); box-shadow: inset 0 -4px 0 var(--gold-d, #b9801c), inset 0 2px 0 #ffe9a8; }
.vx-seg button:disabled { cursor: progress; }
.vx-panel .vx-note { margin: var(--s-3, 12px) 0 0; font: 700 var(--t-xs, 11px)/1 var(--mono, monospace); letter-spacing: .1em; text-transform: uppercase; color: var(--gold, #f4c04a); min-height: 11px; font-variant-numeric: tabular-nums; }

/* hit marker: four pixel ticks on the diagonals, 14 px from the centre; the container is the only thing that animates (transform, opacity) */
#vox-hit { position: absolute; left: 50%; top: 50%; width: 0; height: 0; opacity: 0; pointer-events: none; will-change: transform, opacity; }
#vox-hit i { position: absolute; width: 5px; height: 5px; margin: -2.5px 0 0 -2.5px; background: var(--c, #fff); box-shadow: 0 0 0 1px #000; }
#vox-hit i:nth-child(1) { transform: translate(-16px, -16px); } #vox-hit i:nth-child(2) { transform: translate(16px, -16px); }
#vox-hit i:nth-child(3) { transform: translate(-16px, 16px); } #vox-hit i:nth-child(4) { transform: translate(16px, 16px); }
#vox-hit i:nth-child(5), #vox-hit i:nth-child(6), #vox-hit i:nth-child(7), #vox-hit i:nth-child(8) { display: none; }
#vox-hit i::after { content: ''; position: absolute; left: 50%; top: 50%; width: 5px; height: 5px; background: inherit; box-shadow: 0 0 0 1px #000; }
#vox-hit i:nth-child(1)::after, #vox-hit i:nth-child(4)::after { transform: translate(-5px, -5px); } #vox-hit i:nth-child(2)::after, #vox-hit i:nth-child(3)::after { transform: translate(5px, -5px); }
#vox-hit i:nth-child(n+5)::after { display: none; }
#vox-hit.head { --c: var(--gold, #f4c04a); }
#vox-hit.head i:nth-child(5) { display: block; width: 7px; height: 7px; margin: -3.5px 0 0 -3.5px; transform: translate(0, -29px) rotate(45deg); }
#vox-hit.kill { --c: #ff3a28; } #vox-hit.kill i { width: 6px; height: 6px; margin: -3px 0 0 -3px; }
#vox-hit.kill i:nth-child(1) { transform: translate(-20px, -20px); } #vox-hit.kill i:nth-child(2) { transform: translate(20px, -20px); } #vox-hit.kill i:nth-child(3) { transform: translate(-20px, 20px); } #vox-hit.kill i:nth-child(4) { transform: translate(20px, 20px); }
#vox-hit.kill i:nth-child(n+5) { display: block; width: 5px; height: 5px; margin: -2.5px 0 0 -2.5px; background: #ffd9a0; }
#vox-hit.kill i:nth-child(5) { transform: translate(0, -30px); } #vox-hit.kill i:nth-child(6) { transform: translate(30px, 0); } #vox-hit.kill i:nth-child(7) { transform: translate(0, 30px); } #vox-hit.kill i:nth-child(8) { transform: translate(-30px, 0); }
@media (max-width: 480px) { .vx-chip span { display: none; } .vx-chip { padding: 0 10px; } }
@media (prefers-reduced-motion: reduce) { .vx-chip, .vx-seg button, .vx-panel { transition: none; } .vx-chip:active, .vx-panel button:active { transform: none; } .vx-panel.pre { transform: none; } }
`;

  BZ.vox.register('ui', (G) => {
    if (!BZ.vox.want('ui')) return noopApi();
    const L = T[BZ.lang === 'vi' ? 'vi' : 'en'];
    const doc = document; const P = BZ.params || Object.fromEntries(new URLSearchParams(location.search));
    const reduce = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const q = G.vox && G.vox.q || 'medium';

    const st = doc.createElement('style'); st.id = 'vox-ui-css'; st.textContent = CSS; doc.head.appendChild(st);

    // ---- panel ----
    const wrap = doc.createElement('div'); wrap.className = 'vx-wrap';
    wrap.innerHTML = `<button type="button" class="vx-chip" aria-haspopup="dialog" aria-expanded="false" aria-controls="vx-panel"><i></i><span>${L.chip}</span><b>${q === 'low' ? L.low : q === 'high' ? L.high : L.medium}</b></button>
<div class="vx-panel pre" id="vx-panel" role="dialog" aria-label="${L.aria}" hidden>
  <h3>${L.on}</h3><p>${L.onH}</p>
  <div class="vx-seg" data-k="mode"><button type="button" data-v="0" aria-pressed="false">${L.off}</button><button type="button" data-v="1" aria-pressed="true">${L.onS}</button></div>
  <label>${L.q}</label>
  <div class="vx-seg" data-k="q"><button type="button" data-v="low" aria-pressed="${q === 'low'}">${L.low}</button><button type="button" data-v="medium" aria-pressed="${q === 'medium'}">${L.medium}</button><button type="button" data-v="high" aria-pressed="${q === 'high'}">${L.high}</button></div>
  <div class="vx-note" aria-live="polite"></div>
</div>`;
    doc.body.appendChild(wrap);
    const chip = wrap.querySelector('.vx-chip'); const panel = wrap.querySelector('.vx-panel'); const note = wrap.querySelector('.vx-note');
    let isOpen = false;
    function open(v) {
      if (v === isOpen) return; isOpen = v; chip.setAttribute('aria-expanded', String(v));
      if (v) { panel.hidden = false; void panel.offsetWidth; panel.classList.remove('pre'); const on = panel.querySelector('[aria-pressed="true"]'); if (on) on.focus({ preventScroll: true }); }
      else { panel.classList.add('pre'); setTimeout(() => { if (!isOpen) panel.hidden = true; }, reduce() ? 0 : 140); chip.focus({ preventScroll: true }); }
    }
    chip.addEventListener('click', () => open(!isOpen));
    doc.addEventListener('keydown', (e) => { if (isOpen && e.key === 'Escape') { e.stopPropagation(); open(false); } }, true);
    doc.addEventListener('pointerdown', (e) => { if (isOpen && !wrap.contains(e.target)) open(false); }, true);
    let going = false;
    function go(mode, quality) {
      if (going) return; going = true;
      const u = new URL(location.href);
      if (mode === '0') u.searchParams.delete('vox'); else u.searchParams.set('vox', '1');
      if (quality) u.searchParams.set('voxq', quality);
      for (const b of panel.querySelectorAll('button')) b.disabled = true;
      note.textContent = L.reload + ' …';
      setTimeout(() => { location.href = u.toString(); }, 140); // the pressed state is already on screen; 140 ms lets it register
    }
    panel.addEventListener('click', (e) => {
      const b = e.target.closest('.vx-seg button'); if (!b || going) return;
      const seg = b.parentNode.dataset.k; if (b.getAttribute('aria-pressed') === 'true' && seg === 'q') return;
      for (const o of b.parentNode.children) o.setAttribute('aria-pressed', String(o === b));
      if (seg === 'mode') { if (b.dataset.v === '1') return; go('0', null); } else go('1', b.dataset.v);
    });
    // visible only while a title or pause screen is up (the sections toggle .on)
    const screens = ['title', 'pause'].map((id) => doc.getElementById(id)).filter(Boolean);
    function sync() { const m = screens.some((s) => s.classList.contains('on')); doc.body.classList.toggle('vx-menu', m); if (!m && isOpen) open(false); }
    const mo = new MutationObserver(sync); for (const s of screens) mo.observe(s, { attributes: true, attributeFilter: ['class'] });
    sync();

    // ---- hit marker ----
    const hud = doc.getElementById('hud') || doc.body;
    const mk = doc.createElement('div'); mk.id = 'vox-hit'; mk.setAttribute('aria-hidden', 'true'); mk.innerHTML = '<i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>'; hud.appendChild(mk);
    let anim = null; let lastT = -1; let lastRank = -1;
    // ranks: hit 0, head 1, kill 2; the game's own 'hit' event and zombie.js both report one bullet, so the stronger call inside 50 ms wins
    function hit(o) {
      const kill = !!(o && o.kill); const head = !!(o && o.head); const rank = kill ? 2 : head ? 1 : 0;
      const now = performance.now(); if (now - lastT < 50 && rank <= lastRank) return;
      lastT = now; lastRank = rank;
      mk.className = kill ? 'kill' : head ? 'head' : '';
      if (anim) anim.cancel();
      const dur = kill ? 300 : 110;
      if (reduce()) { anim = mk.animate([{ opacity: 1 }, { opacity: 0 }], { duration: kill ? 220 : 110, easing: 'linear' }); return; }
      const s0 = kill ? 0.55 : 1.45; const s1 = kill ? 1.35 : 1;
      anim = mk.animate([{ opacity: 1, transform: `scale(${s0})`, offset: 0 }, { opacity: 1, transform: `scale(${s1})`, offset: 0.25 }, { opacity: 1, transform: `scale(${s1})`, offset: 0.6 }, { opacity: 0, transform: `scale(${kill ? 1.5 : 1.1})`, offset: 1 }], { duration: dur, easing: 'linear' });
    }
    // the game reports every bullet on its event bus; this makes the marker cover hits that carve nothing too
    try { G.events.on('hit', (e) => { if (!e || !e.z || e.melee === false) return; hit({ head: e.part === 'head' || !!e.crit, kill: !!e.died }); }); } catch (e) { /* no bus: zombie.js calls hit() itself */ }

    return { hit, open, close: () => open(false), update: NOOP, el: wrap, marker: mk };
  });
})();
