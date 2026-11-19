// The guided first session and the unlock reveal. Two screens made here:
//   'guide'  - a dim with a rounded spotlight around the target's hit box, a 3D hand that points at it and one line of
//              big text. Only the target is tappable while a step with a target is up: four invisible blocker buttons
//              (id "guide-block") cover everything outside the spotlight.
//   'reveal' - the padlock pops open and the new feature flies in; tap to continue.
// meta.ftueNext() says what to show, game.events says when; pressing the target (a pointer press on it) completes a step.
import { UNLOCK } from '../data/unlocks.js?v=20261120b';
import { kill, clamp, easeOut, easeBack } from './hud.js?v=20261120b';

const GIVE_UP = 8;
const HAND_LEN = 84;
const FEATURE_ICON = { slot2: 'shield', slot3: 'shield', slot4: 'shield', levelup: 'up', gacha: 'capsule', spectate: 'eye', speed: 'speed', daily: 'chest', chapter: 'chest', autopick: 'check', equip: 'armor', autoult: 'ult', merge: 'gear', ult: 'ult', cards: 'star', upgrade: 'up', slot_armor: 'armor', slot_hands: 'gloves', slot_charm: 'necklace' };
const isOwn = (id) => id.startsWith('guide') || id.startsWith('reveal');

// a padlock badge and the greyed look of something still locked; the target stays tappable so the tap can say why
export function lockButton(b, locked) {
  if (b.lockedNow === locked) return b;
  b.lockedNow = locked; b.setEnabled(!locked);
  if (locked && b.target) b.target.enabled = true;
  return b;
}

function buildHand(THREE) {
  const g = new THREE.Group();
  const glove = new THREE.MeshStandardMaterial({ color: 0xfff6e6, roughness: 0.42 });
  const cuffM = new THREE.MeshStandardMaterial({ color: 0xff5a3c, roughness: 0.4 });
  const ink = new THREE.MeshBasicMaterial({ color: 0x1a1420, side: THREE.BackSide });
  const part = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1, rz = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.z = rz;
    const h = new THREE.Mesh(geo, ink); h.scale.setScalar(1.12); m.add(h); g.add(m); return m;
  };
  const ball = new THREE.SphereGeometry(1, 20, 14);
  part(new THREE.CapsuleGeometry(8, 30, 6, 14), glove, -6, -23, 2);
  part(ball, glove, 0, -54, 0, 22, 21, 15);
  part(ball, glove, 9, -42, 5, 8.5, 8.5, 8);
  part(ball, glove, 18, -45, 4, 8, 8, 7.5);
  part(new THREE.CapsuleGeometry(6.5, 13, 5, 12), glove, -21, -52, 5, 1, 1, 1, 0.9);
  part(new THREE.CylinderGeometry(19, 20, 13, 22), cuffM, 0, -76, 0);
  g.rotation.set(-0.18, 0.32, 0);
  const wrap = new THREE.Group(); wrap.add(g);
  return wrap;
}

export function createGuide(game) {
  const ui = game.ui, meta = game.meta, THREE = ui.THREE, PAL = ui.PAL, frame = document.getElementById('frame');
  const scr = ui.screen('guide');
  const dimCan = document.createElement('canvas'); const dimTex = new THREE.CanvasTexture(dimCan); dimTex.colorSpace = THREE.SRGBColorSpace;
  const dimMesh = new THREE.Mesh(new THREE.PlaneGeometry(360, 100), new THREE.MeshBasicMaterial({ map: dimTex, transparent: true, depthWrite: false, toneMapped: false }));
  scr.holder.add(dimMesh);
  const hand = buildHand(THREE); scr.holder.add(hand); hand.visible = false;

  // four invisible buttons as blockers around the spotlight; one covers the whole frame when there is no target
  const bands = [0, 1, 2, 3, 4, 5, 6, 7].map(() => {
    const b = ui.button({ id: 'guide-block', w: 100, h: 100, shadow: false, onTap: () => onBlocked() });
    b.traverse((o) => { if (o.isMesh) o.visible = false; });
    scr.put(b, 0, 0, 10); return b;
  });
  const skipBtn = ui.button({ id: 'guide-skip', w: 112, h: 40, r: 13, color: PAL.disabled, label: 'BỎ QUA', size: 14, onTap: () => skip() });
  scr.put(skipBtn, 124, 8, 70); skipBtn.setVisible(false);

  let panel = null, panelKey = '', panelH = 60;
  const S = { step: null, idx: 0, wait: 0, miss: 0, t: 0, wrapped: null, rect: null, queue: [], noTarget: false, hold: null };
  let reveal = null;

  function toDesign(r) { const fr = frame.getBoundingClientRect(), k = fr.width / 360; return { x: (r.x - fr.left) / k, y: (r.y - fr.top) / k, w: r.w / k, h: r.h / k }; }

  // ---- the dim with the hole ----
  let dimKey = '';
  function drawDim(rect, extra = []) {
    const H = ui.H, k = 2, cw = 360 * k, ch = Math.ceil(H * k);
    const key = rect ? [rect.x, rect.y, rect.w, rect.h, ch, ...extra.flatMap((e) => [e.x, e.y, e.w, e.h])].map((v) => Math.round(v * 2)).join('|') : 'none|' + ch;
    if (key === dimKey) return; dimKey = key;
    if (dimCan.width !== cw || dimCan.height !== ch) { dimCan.width = cw; dimCan.height = ch; dimMesh.geometry.dispose(); dimMesh.geometry = new THREE.PlaneGeometry(360, H); dimMesh.position.set(180, -H / 2, 0); }
    const c = dimCan.getContext('2d'); c.clearRect(0, 0, cw, ch);
    if (!rect) { dimTex.needsUpdate = true; return; }
    c.fillStyle = 'rgba(10,6,24,0.8)'; c.fillRect(0, 0, cw, ch);
    const r = Math.min(16, rect.w / 2, rect.h / 2) * k, x = rect.x * k, y = rect.y * k, w = rect.w * k, h = rect.h * k;
    const path = () => { c.beginPath(); c.roundRect(x, y, w, h, r); };
    c.globalCompositeOperation = 'destination-out'; c.shadowColor = '#000'; c.shadowBlur = 16 * k; c.fillStyle = '#000'; path(); c.fill();
    c.shadowBlur = 0; path(); c.fill();
    for (const e of extra) { c.beginPath(); c.roundRect(e.x * k, e.y * k, e.w * k, e.h * k, Math.min(13, e.h / 2) * k); c.fill(); }
    c.globalCompositeOperation = 'source-over'; c.shadowColor = 'rgba(255,200,40,0.9)'; c.shadowBlur = 12 * k; c.strokeStyle = '#ffc21f'; c.lineWidth = 3.4 * k; path(); c.stroke();
    c.shadowBlur = 0; c.strokeStyle = '#1a1420'; c.lineWidth = 1.2 * k; c.beginPath(); c.roundRect(x - 2.4 * k, y - 2.4 * k, w + 4.8 * k, h + 4.8 * k, r + 2.4 * k); c.stroke();
    dimTex.needsUpdate = true;
  }

  // the frame minus the spotlight and any extra holes, as up to eight rectangles
  function layoutBands(rect, extra = []) {
    const H = ui.H, lip = 11;
    const set = (b, x, y, w, h) => {
      if (w < 0.5 || h < 0.5) { b.setVisible(false); return; }
      b.setVisible(true); b.pos(x, y); b.scale.set(w / 100, h / (100 + lip), 1);
    };
    let parts = [{ x: 0, y: 0, w: 360, h: H }];
    for (const hole of rect ? [rect, ...extra] : []) {
      const x0 = clamp(hole.x, 0, 360), x1 = clamp(hole.x + hole.w, 0, 360), y0 = clamp(hole.y, 0, H), y1 = clamp(hole.y + hole.h, 0, H);
      parts = parts.flatMap((q) => {
        if (x1 <= q.x || x0 >= q.x + q.w || y1 <= q.y || y0 >= q.y + q.h) return [q];
        const out = [];
        if (y0 > q.y) out.push({ x: q.x, y: q.y, w: q.w, h: y0 - q.y });
        if (y1 < q.y + q.h) out.push({ x: q.x, y: y1, w: q.w, h: q.y + q.h - y1 });
        const ya = Math.max(y0, q.y), yb = Math.min(y1, q.y + q.h);
        if (x0 > q.x) out.push({ x: q.x, y: ya, w: x0 - q.x, h: yb - ya });
        if (x1 < q.x + q.w) out.push({ x: x1, y: ya, w: q.x + q.w - x1, h: yb - ya });
        return out;
      });
    }
    bands.forEach((b, i) => { const q = parts[i]; if (q) set(b, q.x, q.y, q.w, q.h); else b.setVisible(false); });
  }

  // ---- the speech panel ----
  function buildPanel(text, hint) {
    const key = text + '|' + hint; if (key === panelKey) return; panelKey = key;
    if (panel) { kill(panel); panel = null; }
    const t = ui.text(text, { size: 20, align: 'center', maxW: 282, lineH: 26 });
    const h2 = hint ? ui.text(hint, { size: 11, align: 'center', color: 0xffe9a8, outlineW: 1.4 }) : null;
    const w = 316, h = Math.round(t.h + 30 + (h2 ? 18 : 0));
    const g = ui.group({ w, h }); g.put(ui.panel({ w, h, r: 20, color: 0x4a3a86, depth: 6, bevel: 3 }), 0, 0, 0);
    g.put(t, w / 2, 15, 16); if (h2) g.put(h2, w / 2, h - 22, 16);
    scr.put(g, 22, 0, 40); panel = g; panelH = h;
  }

  // ---- steps ----
  // A path entry is a target id (or a token meta.guideTokens() resolves), or { wait } for a pause with no target.
  // pathOf gives the resolved ids (null for a pause); entryOf the entry with its one line of text.
  const heroesOwned = () => Object.values(meta.acc.heroes).filter((h) => h.level > 0).length;
  const rawPath = (step) => (step.path || (step.target ? [step.target] : [])).map((e) => (typeof e === 'string' ? { id: e } : e)).filter((e) => !(e.only === 'multiHero' && heroesOwned() < 2));
  function pathOf(step) { const tk = meta.guideTokens(); return rawPath(step).map((e) => (e.id ? (tk[e.id] !== undefined ? tk[e.id] : e.id) : null)); }
  const entryOf = (step, i) => rawPath(step)[i] || null;
  // a press is a pointer down and up on the target; the kit's own listener on the frame runs first, so its onTap has fired
  let downId = null, downOn = false, downXY = [0, 0];
  frame.addEventListener('pointerdown', (e) => { downId = ui.hitAt(e.clientX, e.clientY); const t = downId && ui.targets().find((q) => q.id === downId); downOn = !!(t && t.enabled); downXY = [e.clientX, e.clientY]; });
  frame.addEventListener('pointerup', (e) => {
    const step = S.step, id = downId; downId = null;
    if (!step || S.noTarget || !id || isOwn(id) || id !== pathOf(step)[S.idx] || Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) > 10) return;
    if (downOn) pressed(step);
  });
  function pressed(step) {
    if (S.step !== step) return;
    S.idx++; S.miss = 0; S.wait = 0; S.t = 0;
    if (S.idx >= rawPath(step).length) finish(step);
  }
  function onBlocked() {
    if (S.step && S.noTarget) finish(S.step);
    else if (S.step && !(entryOf(S.step, S.idx) || {}).wait) S.t = 0;
  }
  function begin(step) {
    S.step = step; S.idx = 0; S.wait = 0; S.miss = 0; S.t = 0; S.rect = null; S.noTarget = rawPath(step).length === 0; panelKey = '';
    if (step.freeze) game.frozen = true;
    hand.visible = false; dimKey = '';
  }
  function finish(step) {
    if (S.step !== step) return;
    game.frozen = false; S.step = null; S.rect = null;
    meta.ftueDone(step.id);
    hand.visible = false; ui.hide('guide', { transition: 'none' });
    if (step.later && meta.pendingReveals().length) reveal.soon(0.4);
    drain(step.when === 'home' || step.id === 'reward', step.later);
  }
  function skip() { if (S.step) finish(S.step); }

  function offer(ctx) {
    if ((reveal && reveal.busy()) || S.step) { S.queue.push(ctx); return; }
    const step = meta.ftueNext(ctx);
    if (step) begin(step);
  }
  function drain(home, later) {
    while (!S.step && S.queue.length && !(reveal && reveal.busy())) offer(S.queue.shift());
    if (!S.step && later && !reveal.busy()) offer(game.screen === 'hud' ? { screen: 'battle' } : { screen: 'home', event: 'home' });
    if (!S.step && home && game.screen !== 'hud' && !reveal.busy()) offer({ screen: 'home', event: 'home' });
  }

  game.events.on('screen', ({ name }) => {
    if (S.step || (reveal && reveal.busy())) { if (name !== 'hud' && name !== 'result') S.queue.push({ screen: 'home', event: 'home' }); return; }
    if (name === 'hud') { if (meta.acc.ftue.session) offer({ screen: 'battle' }); return; }
    if (name === 'result' && game.lastReward) return;
    offer({ screen: 'home', event: 'home' });
  });
  for (const ev of ['start', 'ult_ready', 'pick', 'join', 'boss', 'won']) game.events.on('tutorial:' + ev, () => offer({ screen: 'battle', event: 'tutorial:' + ev }));

  // ---- per frame ----
  function placeHand(rect, tt) {
    const H = ui.H, cx = rect.x + rect.w / 2, below = rect.y + rect.h / 2 < H * 0.58;
    const bob = (Math.sin(tt * 7) * 0.5 + 0.5) * 9, pop = easeBack(clamp(tt / 0.3, 0, 1));
    hand.visible = true; hand.scale.setScalar(Math.max(0.01, pop));
    const tipY = below ? rect.y + rect.h - Math.min(14, rect.h * 0.25) + bob : rect.y + Math.min(14, rect.h * 0.25) - bob;
    hand.rotation.z = below ? 0 : Math.PI;
    hand.position.set(cx, -tipY, 60);
    return { below, tipY };
  }
  function placePanel(rect, hh, fixedY) {
    if (!panel) return;
    const H = ui.H; let y;
    if (fixedY !== undefined && !rect) y = fixedY;
    else if (!rect) y = S.step && S.step.where === 'battle' ? 112 : H * 0.3;
    else if (hh.below) { y = rect.y + rect.h + HAND_LEN + 14; if (y + panelH > H - 20) y = Math.max(70, rect.y - panelH - 18); }
    else { y = rect.y - HAND_LEN - 14 - panelH; if (y < 64) y = Math.min(H - panelH - 20, rect.y + rect.h + 18); }
    const k = easeBack(clamp(S.t / 0.28, 0, 1));
    panel.pos(22 + 158 * (1 - k), y + panelH / 2 * (1 - k)); panel.scale.set(Math.max(0.01, k), Math.max(0.01, k), 1);
  }

  function update(dt) {
    if (reveal) reveal.update(dt);
    if (!S.step) { if (ui.isShown('guide')) ui.hide('guide', { transition: 'none' }); if (S.queue.length && !reveal.busy()) drain(false); return; }
    if (reveal && reveal.active()) { if (ui.isShown('guide')) ui.hide('guide', { transition: 'none' }); return; }
    const step = S.step, path = pathOf(step);
    ui.show('guide', { transition: 'none' });
    S.t += dt;
    skipBtn.setVisible(!!meta.acc.ftue.session);
    const ent = entryOf(step, S.idx);
    if (!S.noTarget && !ent) { finish(step); return; }
    if (ent && ent.wait !== undefined) {
      buildPanel(ent.line || step.text, '');
      S.rect = null; drawDim(null); layoutBands(null); hand.visible = false; placePanel(null, null, ent.y);
      if (!game.paused) S.wait += dt;
      if (S.wait >= ent.wait) pressed(step);
      return;
    }
    buildPanel((ent && ent.line) || step.text, S.noTarget && step.wait === undefined ? '' : S.noTarget ? 'Chạm để tiếp tục' : '');
    if (S.noTarget) {
      S.rect = null; drawDim(null); layoutBands(null); hand.visible = false; placePanel(null, null);
      if (step.wait !== undefined && !game.paused) { S.wait += dt; if (S.wait >= step.wait) finish(step); }
      return;
    }
    const id = path[S.idx];
    const hit = ui.targets().find((t) => t.id === id && !isOwn(t.id));
    if (hit && !hit.enabled && S.idx < path.length - 1) { S.idx++; return; }
    if (!hit) {
      S.miss += dt; S.rect = null; drawDim(null); layoutBands(null); hand.visible = false; placePanel(null, null);
      if (S.miss > GIVE_UP) { game.frozen = false; finish(step); }
      return;
    }
    S.miss = 0;
    const rect = toDesign(hit); S.rect = { x: hit.x, y: hit.y, w: hit.w, h: hit.h, id: hit.id };
    const extra = (step.allow || []).map((id) => ui.targets().find((t) => t.id === id && t.enabled && !isOwn(t.id))).filter(Boolean).map(toDesign);
    drawDim(rect, extra); layoutBands(rect, extra);
    placePanel(rect, placeHand(rect, S.t));
  }

  const api = {
    name: 'guide', show() {}, hide() {}, update,
    dbg() {
      const s = S.step, e = s ? entryOf(s, S.idx) : null;
      return { active: !!s, id: s ? s.id : null, text: s ? (e && e.line) || s.text : '', target: s && !S.noTarget ? pathOf(s)[S.idx] : null, idx: S.idx, path: s ? pathOf(s) : [], noTarget: S.noTarget || !!(e && e.wait !== undefined), waiting: !!(e && e.wait !== undefined), rect: S.rect, allow: s ? s.allow || [] : [], skipVisible: skipBtn.visible, frozen: !!game.frozen, reveal: reveal ? reveal.dbg() : null };
    },
  };
  game.guide = api;
  reveal = createReveal(game, { onDone: () => drain(false), blocked: () => !!(S.step && S.step.later && S.idx > 0) });
  return [api, reveal.api];
}

// ---------- unlock reveal ----------
function buildPadlock(THREE) {
  const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
  const ink = new THREE.MeshBasicMaterial({ color: 0x1a1420, side: THREE.BackSide });
  const gold = new THREE.MeshStandardMaterial({ color: 0xffb62e, roughness: 0.35 }), steel = new THREE.MeshStandardMaterial({ color: 0xcfd8e6, roughness: 0.3 }), dark = new THREE.MeshStandardMaterial({ color: 0x6b4300, roughness: 0.6 });
  const hulled = (geo, mat, k = 1.07) => { const m = new THREE.Mesh(geo, mat); const h = new THREE.Mesh(geo, ink); h.scale.setScalar(k); m.add(h); return m; };
  const body = hulled(new THREE.BoxGeometry(1.0, 0.78, 0.44), gold); body.position.y = -0.05; inner.add(body);
  const band = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.2, 0.46), new THREE.MeshStandardMaterial({ color: 0xffd45e, roughness: 0.3 })); band.position.y = 0.22; inner.add(band);
  const keyH = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 16), dark); keyH.rotation.x = Math.PI / 2; keyH.position.set(0, -0.06, 0.23); inner.add(keyH);
  const keyS = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.05), dark); keyS.position.set(0, -0.2, 0.23); inner.add(keyS);
  const pivot = new THREE.Group(); pivot.position.set(0.3, 0.34, 0); inner.add(pivot);
  const sh = hulled(new THREE.TorusGeometry(0.3, 0.075, 10, 24, Math.PI), steel, 1.12); sh.position.x = -0.3; pivot.add(sh);
  for (const x of [-0.6, 0]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.12, 10), steel); leg.position.set(x, -0.03, 0); pivot.add(leg); }
  g.userData = { inner, pivot };
  return g;
}

function createReveal(game, { onDone, blocked }) {
  const ui = game.ui, meta = game.meta, THREE = ui.THREE, frame = document.getElementById('frame');
  const scr = ui.screen('reveal', { modal: true });
  const dim = new THREE.Mesh(new THREE.PlaneGeometry(420, 900), new THREE.MeshBasicMaterial({ color: 0x0a0618, transparent: true, opacity: 0.74, depthWrite: false, toneMapped: false }));
  scr.put(dim, 180, 390, 0);
  const gc = document.createElement('canvas'); gc.width = gc.height = 128;
  { const c = gc.getContext('2d'), g = c.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,196,64,0.9)'); g.addColorStop(0.5, 'rgba(255,140,40,0.35)'); g.addColorStop(1, 'rgba(255,120,40,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); }
  const glowM = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(gc), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0 });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(380, 380), glowM); scr.put(glow, 180, 300, 2);
  const lock = buildPadlock(THREE); lock.scale.setScalar(110); scr.holder.add(lock); lock.position.set(180, -300, 30);
  const tap = ui.button({ id: 'reveal-tap', w: 100, h: 100, shadow: false, onTap: () => advance() });
  tap.traverse((o) => { if (o.isMesh) o.visible = false; });
  scr.put(tap, 0, 0, 60);
  const R = { ids: [], cur: '', t: 0, nodes: [], wait: 0, icon: null, head: null, name: null, hint: null };

  const fit = () => { tap.scale.set(3.6, ui.H / 111, 1); };
  function clearNodes() { for (const n of R.nodes) kill(n); R.nodes = []; R.icon = R.head = R.name = R.hint = null; }
  function setup(id) {
    clearNodes(); R.cur = id; R.t = 0;
    const u = UNLOCK[id], ic = FEATURE_ICON[id] || 'star';
    R.icon = ui.icon(ic, { size: 118 }); scr.put(R.icon, 180 - 59, 300 - 59, 36); R.icon.visible = false;
    R.head = ui.text('MỞ KHOÁ', { size: 19, align: 'center', color: 0xffd860, outlineW: 3 }); scr.put(R.head, 180, 168, 36);
    R.name = ui.text(u.name.toLocaleUpperCase('vi'), { size: 30, align: 'center', maxW: 320, lineH: 38, outlineW: 3.6 }); scr.put(R.name, 180, 392, 36);
    R.hint = ui.text('Chạm để tiếp tục', { size: 13, align: 'center', color: 0xffe9a8, outlineW: 1.6 }); scr.put(R.hint, 180, 640, 36);
    R.nodes = [R.icon, R.head, R.name, R.hint];
    R.label = 'MỞ KHOÁ: ' + u.name.toLocaleUpperCase('vi');
    for (const n of [R.head, R.name, R.hint]) n.setOpacity(0);
    lock.visible = true; lock.scale.setScalar(0.01);
  }
  function start() {
    const list = meta.pendingReveals(); if (!list.length) return;
    R.ids = list.slice(); setup(R.ids[0]); fit();
    ui.show('reveal', { transition: 'none' });
  }
  function advance() {
    if (!R.ids.length) return;
    if (R.t < 1.7) { R.t = 1.7; return; }
    meta.markSeen(R.ids.shift());
    if (R.ids.length) { setup(R.ids[0]); return; }
    clearNodes(); R.cur = ''; ui.hide('reveal', { transition: 'none' }); onDone();
  }

  function update(dt) {
    if (!R.ids.length) {
      if (R.wait > 0) { R.wait -= dt; if (R.wait <= 0 && blocked()) R.wait = 0.2; else if (R.wait <= 0) { const B = game.B; if (!(B && (B.phase === 'fight' || B.phase === 'pick')) && !game.paused) start(); } }
      return;
    }
    ui.show('reveal', { transition: 'none' });
    R.t += dt; const t = R.t, ud = lock.userData;
    const pop = easeBack(clamp(t / 0.35, 0, 1)), shake = t > 0.35 && t < 0.75 ? Math.sin(t * 60) * 0.14 * (1 - (t - 0.35) / 0.4) : 0;
    const open = easeOut(clamp((t - 0.75) / 0.35, 0, 1)), gone = easeOut(clamp((t - 1.15) / 0.35, 0, 1));
    lock.visible = gone < 1; lock.scale.setScalar(Math.max(0.01, 110 * pop * (1 - gone * 0.7)));
    lock.rotation.set(-0.16, 0.4 + Math.sin(t * 1.4) * 0.18, shake);
    ud.pivot.rotation.y = -open * 2.5; ud.pivot.position.y = 0.34 + open * 0.14;
    lock.position.set(180, -(300 + gone * 8), 30);
    glowM.opacity = (0.42 + Math.sin(t * 3) * 0.05) * clamp(t / 0.5, 0, 1); glow.scale.setScalar(0.8 + clamp(t / 1.2, 0, 1) * 0.35);
    const iconT = clamp((t - 1.15) / 0.45, 0, 1);
    R.icon.visible = iconT > 0; R.icon.scale.setScalar(Math.max(0.01, easeBack(iconT)));
    const txt = clamp((t - 1.2) / 0.4, 0, 1); R.head.setOpacity(txt); R.name.setOpacity(txt);
    R.hint.setOpacity(t > 1.7 ? 0.55 + 0.45 * Math.sin(t * 5) : 0);
  }

  const wantSoon = (s) => { R.wait = Math.max(R.wait, s); };
  game.events.on('battle:result', () => wantSoon(1.0));
  game.events.on('screen', ({ name }) => {
    if (name === 'home') wantSoon(0.5);
    if (R.ids.length) ui.show('reveal', { transition: 'none' });
  });

  return {
    api: { name: 'reveal', show() {}, hide() {}, update: () => {} },
    update, soon: wantSoon, active: () => R.ids.length > 0, busy: () => R.ids.length > 0 || R.wait > 0,
    dbg: () => (R.ids.length ? { id: R.cur, label: R.label, t: R.t, left: R.ids.length } : null),
  };
}
