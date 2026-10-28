// End game of a solo mode (Normal, Grapple, Challenge, events), loaded at the first finish (main.js loadEnd):
//   1. PiggyBankPopup (Normal only, while a piggy skin is left; rules in bonus.js): the next skin fills from the bottom,
//      full -> UNLOCK (rewarded ad, here 1 skip ticket) or LOSE IT.
//   2. The end page (NormalEndGame prefab): "Stage n / Completed!", the equipped skin dancing on the finish platform,
//      the Play button (next level) and the Home button (home page).
// Layout from the prefabs (ui_pages_endgame_normal, ui_popups_piggybank) on the 750 x 1334 canvas matched to the height
// (u = height / 1334 CSS px), checked against the 2026 clip (0:18 piggy, 0:27.6 end page). Art: art/ui.webp
// (tools/build_ui.py), the piggy skins art/piggy.webp, the dance clip from the skin sheet (main.js look.dance).

const REF_H = 1334;
const PIGGY_FILL_S = 0.8; // [ĐỀ XUẤT] fill animation length

const CSS = `
#endgame { z-index: 4; overflow: hidden; }
#endgame > div { position: absolute; inset: 0; display: none; overflow: hidden; }
#endgame > div.on { display: block; }
#endgame .art { position: absolute; background-repeat: no-repeat; }
#endgame canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
#endgame button { border: 0; padding: 0; background-color: transparent; cursor: pointer; }
#egPiggy { background: linear-gradient(#40E8EC, #008FE1); }
#egPiggy .pat { position: absolute; left: -100%; top: -100%; width: 300%; height: 300%; background-repeat: repeat;
  mix-blend-mode: plus-lighter; opacity: .17; transform: rotate(-30deg); }
#egPiggy .acts { position: absolute; left: 0; right: 0; display: flex; justify-content: center; gap: calc(var(--u) * 20); }
#egPiggy .gold, #egPiggy .green { position: relative; width: calc(var(--u) * 310); height: calc(var(--u) * 120); background-size: 100% 100%; }
#egPiggy .gold i { position: absolute; left: 12%; top: 22%; width: 22%; height: 46%; background-repeat: no-repeat; }
#egPiggy .tap { position: absolute; inset: 0; }
#egPage .home { position: absolute; left: 0; top: env(safe-area-inset-top); width: 13%; height: 7%; }
#egPage .home i { position: absolute; inset: 10%; background-repeat: no-repeat; }
#egPage .play { position: absolute; left: 50%; transform: translateX(-50%); width: calc(var(--u) * 234); height: calc(var(--u) * 223);
  bottom: calc(var(--u) * 188); }
#egPage .play i { position: absolute; inset: 0; background-repeat: no-repeat; animation: egBounce 1s ease-in-out infinite; }
@keyframes egBounce { 50% { transform: scale(1.05); } }
`;

// Junegull text into a 2D context (CSS px): the renderer's baked font, tinted per colour (render.js fontIn).
function text(R, g, str, x, y, px, color = null, align = 0.5) {
  const { font } = R, img = R.fontIn(color), s = px / font.size, up = str.toUpperCase();
  let w = 0;
  for (const ch of up) w += (font.glyphs[ch] || font.glyphs[' '])[6];
  let cx = x - w * s * align;
  const base = y + font.ascent * s * 0.5;
  for (const ch of up) {
    const q = font.glyphs[ch] || font.glyphs[' '];
    if (q[2] > 1) g.drawImage(img, q[0], q[1], q[2], q[3], cx + q[4] * s, base - q[5] * s, q[2] * s, q[3] * s);
    cx += q[6] * s;
  }
}

export function makeEndgame(app, d) {
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);
  document.body.insertAdjacentHTML('beforeend', `<div class="ui overlay" id="endgame">
    <div id="egPiggy"><div class="pat"></div><button class="tap" title="Tiếp tục"></button>
      <div class="acts"></div><canvas></canvas></div>
    <div id="egPage"><div class="art top"></div><div class="art bot"></div><div class="art halo"></div><div class="art line"></div>
      <button class="home" id="egHome" title="Trang chính"><i></i></button>
      <button class="play" id="egPlay" title="Màn tiếp theo"><i></i></button><canvas></canvas></div></div>`);
  const $ = (id) => document.getElementById(id);
  const root = $('endgame'), piggyEl = $('egPiggy'), pageEl = $('egPage');
  const url = `url(./art/ui.webp${app.V})`, [W, H] = d._size;

  // a sheet sprite fitted to its element's box (percent background maths: any box size)
  function icon(el, key) {
    const r = d[key];
    Object.assign(el.style, { backgroundImage: url, backgroundSize: `${(W / r[2]) * 100}% ${(H / r[3]) * 100}%`,
      backgroundPosition: `${(r[0] / (W - r[2])) * 100}% ${(r[1] / (H - r[3])) * 100}%` });
  }
  // same, at a fixed size in reference units
  function place(el, key, css) { icon(el, key); Object.assign(el.style, css); }

  let anim = 0, state = null, sheet = null;
  // one sprite of the sheet as its own image (CSS can only repeat a whole image)
  async function tile(key) {
    sheet ||= await app.image('./art/ui.webp');
    const r = d[key], c = document.createElement('canvas');
    c.width = r[2]; c.height = r[3];
    c.getContext('2d').drawImage(sheet, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
    return c.toDataURL();
  }
  const u = () => window.innerHeight / REF_H;
  function canvasOf(el) {
    const c = el.querySelector('canvas'), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, c.clientWidth, c.clientHeight);
    return [g, c.clientWidth, c.clientHeight];
  }
  function loop(f) {
    cancelAnimationFrame(anim);
    const t0 = performance.now();
    const step = (now) => { if (f((now - t0) / 1000) !== false) anim = requestAnimationFrame(step); };
    anim = requestAnimationFrame(step);
  }

  // ---- 1. PiggyBankPopup ------------------------------------------------------------------------------------------
  let piggyImg = null;
  async function piggy(r) {
    const b = app.bonus, s = app.save;
    piggyImg ||= await app.image('./art/piggy.webp');
    const res = b.piggyReward(s);
    if (!res) return;
    const A = b.d.piggyArt, rr = A[res];
    root.style.setProperty('--u', u() + 'px');
    // Image Tiled, pixelsPerUnitMultiplier 1.5: one 512 px tile = 341 units; MaterialTranslation scrolls it (speed 50)
    const pat = piggyEl.querySelector('.pat');
    Object.assign(pat.style, { backgroundImage: `url(${await tile('Pattern_MainMenu')})`, backgroundSize: `${341 * u()}px ${341 * u()}px` });
    const from = r && r.res === res ? r.before : b.piggyProgress(s);
    let mode = b.piggyFull(s) && from >= 100 ? 'full' : 'fill', unlockedAt = 0;
    const acts = piggyEl.querySelector('.acts');
    acts.style.bottom = (240 - 60) * u() + 'px'; // ActionButton: 120 high at 240 from the bottom
    piggyEl.dataset.res = res;
    piggyEl.classList.add('on');
    return new Promise((done) => {
      function buttons() {
        acts.innerHTML = '';
        if (mode === 'unlocked') {
          const eq = document.createElement('button');
          eq.className = 'green'; eq.title = 'Trang bị';
          icon(eq, 'OutlinedButtonGreen');
          eq.onclick = (e) => {
            e.stopPropagation();
            const it = app.meta.byId.get(res);
            if (it) { s.equipped.skins = it.name; app.writeSave(); app.applyEquip(); }
            app.play('button'); finish();
          };
          acts.appendChild(eq);
          return;
        }
        if (mode === 'fill' && b.piggyProgress(s) >= 100) return;
        // PlayRewarded: "+N%" (rewarded.piggy_bank_fill) or UNLOCK when full (rewarded.piggy_bank_unlock). The web pays
        // each rewarded ad with 1 skip ticket (skipPrice of rewarded.default), so the ad icon shows a ticket.
        const go = document.createElement('button');
        go.className = 'gold'; go.title = '1 vé bỏ qua';
        go.innerHTML = '<i></i>';
        icon(go, 'OutlinedButtonGold');
        icon(go.querySelector('i'), 'SkipTickets');
        go.onclick = (e) => {
          e.stopPropagation();
          const was = b.piggyProgress(s);
          const out = mode === 'full' ? b.piggyUnlock(s) : b.piggyBoost(s);
          if (!out) return;
          if (out.refused) { app.toast('Cần 1 vé bỏ qua (mua ở Chợ trên trang chính)'); return; }
          app.play('popup_in'); app.writeSave(); app.hud();
          if (mode === 'full') { mode = 'unlocked'; unlockedAt = performance.now(); buttons(); return; }
          fill(was, b.piggyProgress(s));
        };
        acts.appendChild(go);
      }
      const tap = piggyEl.querySelector('.tap');
      tap.onclick = () => {
        if (mode === 'full') { app.play('popup_out'); b.piggyLose(s); app.writeSave(); } // LOSE IT
        else app.play('button');
        finish();
      };
      function finish() { cancelAnimationFrame(anim); piggyEl.classList.remove('on'); done(); }
      let a0 = from, a1 = b.piggyProgress(s), tStart = performance.now();
      function fill(x, y) { a0 = x; a1 = y; tStart = performance.now(); acts.innerHTML = ''; }
      buttons();
      acts.style.visibility = 'hidden';
      loop(() => {
        const [g, w, h] = canvasOf(piggyEl), U = u();
        piggyEl.dataset.mode = mode; // fill / full / unlocked (tests)
        pat.style.backgroundPosition = `${((performance.now() / 1000) * 50 * U) % (341 * U)}px 0`;
        const k = Math.min(1, (performance.now() - tStart) / 1000 / PIGGY_FILL_S);
        const p = a0 + (a1 - a0) * (1 - (1 - k) * (1 - k));
        if (k >= 1 && acts.style.visibility === 'hidden') acts.style.visibility = '';
        if (k >= 1 && mode === 'fill' && !acts.childElementCount && b.piggyProgress(s) < 100) buttons();
        if (k >= 1 && mode === 'fill' && b.piggyFull(s)) { mode = 'full'; buttons(); }
        // StageCompletedText at 250 from the top, two lines, Junegull 49 under its container's Animation, which shows it
        // 1.2x (2026 clip 0:18: "COMPLETED" spans 57 % of the width, like the in-game 60); "New skin / unlocked!" once unlocked
        const px = 49 * 1.2 * U, lh = (app.R.font.lineHeight / app.R.font.size) * px;
        const lines = mode === 'unlocked' ? [['new skin', '#FFC327'], ['unlocked!', null]]
          : [['stage ' + (app.world.index + 1), '#9FFF54'], ['completed', null]];
        lines.forEach(([t, c], i) => text(app.R, g, t, w / 2, 250 * U + (i - 0.5) * lh, px, c));
        // PiggyBankSkin 570 x 570 at (0, 15) from the centre: the skin, its unfilled part #252252, the filled part
        // in the purple Gradient (#cc00ff x #7621D6..white), a white Outline; revealed in colour once full
        // the skin fills ~60 % of the 570 box (2026 clip 0:18: 290 of 1280 px high)
        const box = 570 * U * 0.6, sc = box / Math.max(rr[2], rr[3]), dw = rr[2] * sc, dh = rr[3] * sc;
        const x0 = w / 2 - dw / 2, y0 = h / 2 - 15 * U - dh / 2;
        const sil = (color) => {
          const c = document.createElement('canvas'); c.width = rr[2]; c.height = rr[3];
          const q = c.getContext('2d'); q.drawImage(piggyImg, rr[0], rr[1], rr[2], rr[3], 0, 0, rr[2], rr[3]);
          q.globalCompositeOperation = 'source-in'; q.fillStyle = color; q.fillRect(0, 0, rr[2], rr[3]);
          return c;
        };
        state ||= {};
        const key = res;
        if (state.key !== key) {
          const grad = sil('#000'), q = grad.getContext('2d'), lg = q.createLinearGradient(0, 0, 0, rr[3]);
          lg.addColorStop(0, '#cc00ff'); lg.addColorStop(1, '#5e00d6');
          q.fillStyle = lg; q.fillRect(0, 0, rr[2], rr[3]);
          state = { key, white: sil('#fff'), dark: sil('#252252'), purple: grad };
        }
        const o = 4 * U; // Outline
        for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o], [-o, -o], [o, o], [-o, o], [o, -o]]) g.drawImage(state.white, x0 + dx, y0 + dy, dw, dh);
        if (mode === 'unlocked' || mode === 'full') {
          const fl = mode === 'unlocked' ? Math.max(0, 1 - (performance.now() - unlockedAt) / 400) : 0;
          if (mode === 'unlocked') g.drawImage(piggyImg, rr[0], rr[1], rr[2], rr[3], x0, y0, dw, dh);
          else g.drawImage(state.purple, x0, y0, dw, dh);
          if (fl) { g.globalAlpha = fl; g.drawImage(state.white, x0, y0, dw, dh); g.globalAlpha = 1; }
        } else {
          g.drawImage(state.dark, x0, y0, dw, dh);
          const fh = dh * (p / 100);
          g.drawImage(state.purple, 0, rr[3] * (1 - p / 100), rr[2], rr[3] * (p / 100), x0, y0 + dh - fh, dw, fh);
          text(app.R, g, Math.round(p) + '%', w / 2 + 5 * U, h / 2 - 20 * U, 72 * U); // ProgressText
        }
        // button labels (Junegull on the art), and LOSE IT / TAP TO CONTINUE under them
        const ab = h - 240 * U;
        if (acts.style.visibility !== 'hidden' && acts.childElementCount) {
          const lab = mode === 'unlocked' ? 'equip it!' : mode === 'full' ? 'unlock' : '+' + b.piggyFill(s, 2 /* PIGGY_REWARDED */) + '%';
          text(app.R, g, lab, w / 2 + (mode === 'unlocked' ? 0 : 30 * U), ab - 4 * U, (mode === 'unlocked' ? 36 : 42) * U);
        }
        if (mode === 'full') text(app.R, g, 'lose it!', w / 2, ab + 110 * U, 44 * U, '#092b57');
        if (mode === 'unlocked') text(app.R, g, 'tap to continue', w / 2, h - 100 * U - 30 * U, 50 * U, '#092b57');
        return true;
      });
    });
  }

  // ---- 2. End page (NormalEndGame) --------------------------------------------------------------------------------
  const TITLES = { // TextCompleted / Level_Text per end page prefab: [first line, colour of "Completed!"]
    'mode.normal': ['stage', '#FFC327'], 'mode.grapple': ['grapple stage', '#76E97E'], 'mode.challenge': ['challenge', '#76E97E'],
  };
  function page(o) {
    const U = u(), th = app.R.theme;
    const css = (c) => `rgb(${c.slice(0, 3).map((v) => Math.round(v * 255)).join(',')})`;
    // behind the page: the level background (camera colour, effect gradient at the bottom)
    pageEl.style.background = `linear-gradient(${th.bg} 15%, ${css(th.effect)} 100%)`;
    // TopBackground 748 x 601 at the top left, BotBackground (its mirror) 750 x 606 at the bottom right
    place(pageEl.querySelector('.top'), 'BackgroundEndRace', { left: 0, top: -28.5 * U + 'px', width: 748 * U + 'px', height: 601 * U + 'px' });
    place(pageEl.querySelector('.bot'), 'BackgroundEndRace', { right: -2 * U + 'px', bottom: -36 * U + 'px', width: 750 * U + 'px',
      height: 606 * U + 'px', transform: 'rotate(180deg)' });
    // PlayerFinish (anchors y 0.11..1.11): FinishHalo at anchors (0.21, 0.27)..(0.79, 0.49); FinishLine 600 x 300 at y 0.30,
    // the platform sprite fitted in it (2026 clip: 516 units wide); the skin 450 x 464 156 units above
    const lineY = 0.59 * window.innerHeight;
    place(pageEl.querySelector('.halo'), 'LightEndRace_01', { left: '21%', width: '58%', top: '40%', height: '22%' });
    const lw = 516 * U, lh = lw * (105 / 446);
    place(pageEl.querySelector('.line'), 'NewAN_Grap1_FinishPlatform0001', { left: `calc(50% - ${lw / 2}px)`, top: lineY - lh / 2 + 'px',
      width: lw + 'px', height: lh + 'px' });
    icon(pageEl.querySelector('.home i'), 'Icon_Home');
    icon($('egPlay').firstChild, 'PlayButton_03');
    const [first, col] = TITLES[o.mode] || TITLES['mode.normal'];
    pageEl.classList.add('on');
    loop((t) => {
      const [g, w, h] = canvasOf(pageEl), V = u();
      // Level_Text "stage {0}\n<color=#FFC327><size=120%>Completed!", Junegull 56.8, centred 300 from the top
      const px = 56.8 * V, lhh = (app.R.font.lineHeight / app.R.font.size) * px;
      text(app.R, g, first + ' ' + (o.level + 1), w / 2, 300 * V - lhh * 0.55, px);
      text(app.R, g, 'completed!', w / 2, 300 * V + lhh * 0.6, px * 1.2, col);
      // the skin's dance clip (SkinAnimatorManager), native size: 100 reference units per world unit
      const sk = app.look.dance;
      if (sk && sk.dance.frames.length) {
        const name = sk.dance.frames[Math.floor(t * sk.dance.fps) % sk.dance.frames.length];
        const f = sk.frames[name];
        if (f) {
          const [img, r] = f, k = (100 / r[6]) * V;
          const cx = w / 2, cy = lineY - 156 * V + 30 * V;
          g.drawImage(img, r[0], r[1], r[2], r[3], cx - r[4] * k, cy - r[5] * k, r[2] * k, r[3] * k);
        }
      }
      return true;
    });
  }

  function hide() {
    cancelAnimationFrame(anim);
    piggyEl.classList.remove('on');
    pageEl.classList.remove('on');
    if (root.classList.contains('on')) app.overlay('endgame', false);
  }

  $('egPlay').onclick = () => { hide(); app.nextLevel(); };
  $('egHome').onclick = () => { app.play('popup_in'); hide(); app.overlay('start', true); app.hud(); };

  return {
    icon,
    hide,
    async show(o) {
      root.style.setProperty('--u', u() + 'px');
      app.overlay('endgame', true);
      app.play('popup_in');
      if (o.piggy && app.bonus) await piggy(o.piggy);
      page(o);
    },
  };
}
