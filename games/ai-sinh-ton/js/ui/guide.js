// The guided first session and the unlock reveal. Two screens made here:
//   'guide'  - a dim with a rounded spotlight around the target's hit box, a 3D arrow that points at it and one line of
//              big text. Only the target is tappable while a step with a target is up: four invisible blocker buttons
//              (id "guide-block") cover everything outside the spotlight.
//   'reveal' - the padlock pops open and the new feature flies in; tap to continue.
//   'story'  - the two-sentence opening story over the first fight (createStory at the end).
// meta.ftueNext() says what to show, game.events says when; pressing the target (a pointer press on it) completes a step.
import { UNLOCK } from '../data/unlocks.js?v=20261124a';
import { clamp, easeOut, easeBack } from './hud.js?v=20261124a';

const GIVE_UP = 8;
const HAND_LEN = 46, HAND_HALF = 17, HAND_GAP = 4, HAND_BOB = 7;
// the upper third, centred: where the battle's wave and boss banners appear. The speech panel never covers it.
export const BANNER_ZONE = { x: 190, y: 36, w: 400, h: 96 };
const FEATURE_ICON = { slot2: 'shield', slot3: 'shield', slot4: 'shield', levelup: 'up', gacha: 'capsule', spectate: 'eye', speed: 'speed', daily: 'chest', chapter: 'chest', autopick: 'check', equip: 'armor', autoult: 'ult', merge: 'gear', ult: 'ult', cards: 'star', upgrade: 'up', slot_armor: 'armor', slot_hands: 'gloves', slot_charm: 'necklace' };
const isOwn = (id) => id.startsWith('guide') || id.startsWith('reveal');

// a padlock badge and the greyed look of something still locked; the target stays tappable so the tap can say why
export function lockButton(b, locked) {
  if (b.lockedNow === locked) return b;
  b.lockedNow = locked; b.setEnabled(!locked);
  if (locked && b.target) b.target.enabled = true;
  return b;
}

// The pointer: a short, thick 3D arrow with rounded bevels, warm gold with a thin darker rim. Built pointing up, tip at
// the origin, the body below it; the guide turns it toward the target and bobs it softly along its own axis.
function buildArrow(THREE) {
  const L = HAND_LEN, W = HAND_HALF, head = L * 0.5, shaft = W * 0.42;
  const sh = new THREE.Shape();
  sh.moveTo(0, -1.5); sh.quadraticCurveTo(0, 0, -1.6, -1.4); sh.lineTo(-W, -head + 2); sh.quadraticCurveTo(-W - 1, -head, -W + 2, -head);
  sh.lineTo(-shaft, -head); sh.lineTo(-shaft, -L + 4); sh.quadraticCurveTo(-shaft, -L, -shaft + 4, -L); sh.lineTo(shaft - 4, -L); sh.quadraticCurveTo(shaft, -L, shaft, -L + 4);
  sh.lineTo(shaft, -head); sh.lineTo(W - 2, -head); sh.quadraticCurveTo(W + 1, -head, W, -head + 2); sh.lineTo(1.6, -1.4); sh.quadraticCurveTo(0, 0, 0, -1.5);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 5, bevelEnabled: true, bevelThickness: 3, bevelSize: 2.4, bevelSegments: 4, curveSegments: 8 });
  geo.translate(0, 2.4, -2.5);
  const body = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xffd46a, roughness: 0.3, metalness: 0.15, emissive: 0x3a2600, emissiveIntensity: 0.35 }));
  const rim = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x3b2614, side: THREE.BackSide }));
  rim.scale.set(1.07, 1.05, 1.05); rim.position.y = 1.2;
  const g = new THREE.Group(); g.add(rim); g.add(body); g.rotation.x = -0.28;
  const wrap = new THREE.Group(); wrap.add(g);
  return wrap;
}

export function createGuide(game) {
  const ui = game.ui, meta = game.meta, THREE = ui.THREE, PAL = ui.PAL, frame = document.getElementById('frame');
  const scr = ui.screen('guide');
  const dimCan = document.createElement('canvas'); const dimTex = new THREE.CanvasTexture(dimCan); dimTex.colorSpace = THREE.SRGBColorSpace;
  const dimMesh = new THREE.Mesh(new THREE.PlaneGeometry(780, 100), new THREE.MeshBasicMaterial({ map: dimTex, transparent: true, depthWrite: false, toneMapped: false }));
  scr.holder.add(dimMesh);
  const hand = buildArrow(THREE); scr.holder.add(hand); hand.visible = false;

  // four invisible buttons as blockers around the spotlight; one covers the whole frame when there is no target
  const bands = [0, 1, 2, 3, 4, 5, 6, 7].map(() => {
    const b = ui.button({ id: 'guide-block', w: 100, h: 100, shadow: false, onTap: () => onBlocked() });
    b.traverse((o) => { if (o.isMesh) o.visible = false; });
    scr.put(b, 0, 0, 10); return b;
  });
  const skipBtn = ui.button({ id: 'guide-skip', w: 96, h: 44, r: 13, color: PAL.disabled, label: 'BỎ QUA', size: 14, onTap: () => skip() });
  scr.put(skipBtn, 0, 0, 70); skipBtn.setVisible(false);

  let narrow = false, panel = null, panelKey = '', panelH = 60, panelW = 340, panelAt = null, handAt = null;
  const S = { step: null, idx: 0, wait: 0, miss: 0, t: 0, wrapped: null, rect: null, queue: [], dis: 0, skipped: new Set(), noTarget: false, hold: null };
  let reveal = null;
  const story = createStory(game, { onDone: () => offer({ screen: 'battle', event: 'tutorial:start' }) });

  function toDesign(r) { const fr = frame.getBoundingClientRect(), k = fr.width / 780; return { x: (r.x - fr.left) / k, y: (r.y - fr.top) / k, w: r.w / k, h: r.h / k }; }

  // ---- the dim with the hole ----
  let dimKey = '';
  function drawDim(rect, extra = []) {
    const H = ui.H, k = 2, cw = 780 * k, ch = Math.ceil(H * k);
    const key = rect ? [rect.x, rect.y, rect.w, rect.h, ch, ...extra.flatMap((e) => [e.x, e.y, e.w, e.h])].map((v) => Math.round(v * 2)).join('|') : 'none|' + ch;
    if (key === dimKey) return; dimKey = key;
    if (dimCan.width !== cw || dimCan.height !== ch) { dimCan.width = cw; dimCan.height = ch; dimMesh.geometry.dispose(); dimMesh.geometry = new THREE.PlaneGeometry(780, H); dimMesh.position.set(390, -H / 2, 0); }
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
    let parts = [{ x: 0, y: 0, w: 780, h: H }];
    for (const hole of rect ? [rect, ...extra] : []) {
      const x0 = clamp(hole.x, 0, 780), x1 = clamp(hole.x + hole.w, 0, 780), y0 = clamp(hole.y, 0, H), y1 = clamp(hole.y + hole.h, 0, H);
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

  // ---- the speech panel: short and wide, the skip button sits inside it at the right ----
  function buildPanel(text, hint) {
    const withSkip = !!meta.acc.ftue.session, key = text + '|' + hint + '|' + withSkip + '|' + narrow; if (key === panelKey) return; panelKey = key;
    if (panel) { panel.dispose(); panel = null; }
    const t = ui.text(text, { size: 17, align: 'center', maxW: narrow ? 150 : 320, lineH: 22 });
    const h2 = hint ? ui.text(hint, { size: 11, align: 'center', color: 0xffe9a8, outlineW: 1.4 }) : null;
    const skipW = withSkip ? 108 : 0, tw = Math.max(narrow ? 150 : 210, Math.round(t.w) + 36), w = tw + skipW, h = Math.max(Math.round(t.h + 24 + (h2 ? 16 : 0)), withSkip ? 62 : 0);
    const g = ui.group({ w, h }); g.put(ui.panel({ w, h, r: 18, color: 0x4a3a86, depth: 6, bevel: 3 }), 0, 0, 0);
    g.put(t, tw / 2, (h - t.h - (h2 ? 16 : 0)) / 2, 16); if (h2) g.put(h2, tw / 2, h - 22, 16);
    scr.put(g, 0, 0, 40); panel = g; panelH = h; panelW = w; panel.skipW = skipW;
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
  frame.addEventListener('pointerdown', (e) => { game.guideRefused = false; downId = ui.hitAt(e.clientX, e.clientY); const t = downId && ui.targets().find((q) => q.id === downId); downOn = !!(t && t.enabled); downXY = [e.clientX, e.clientY]; });
  frame.addEventListener('pointerup', (e) => {
    const step = S.step, id = downId; downId = null;
    if (!step || S.noTarget || !id || isOwn(id) || id !== pathOf(step)[S.idx] || Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) > 10) return;
    if (downOn && !game.guideRefused) pressed(step);
  });
  function pressed(step) {
    if (S.step !== step) return;
    S.idx++; S.miss = 0; S.dis = 0; S.wait = 0; S.t = 0;
    if (S.idx >= rawPath(step).length) finish(step);
  }
  function onBlocked() {
    if (S.step && S.noTarget) finish(S.step);
    else if (S.step && !(entryOf(S.step, S.idx) || {}).wait) S.t = 0;
  }
  function begin(step) {
    narrow = false; S.step = step; S.idx = 0; S.wait = 0; S.miss = 0; S.dis = 0; S.t = 0; S.rect = null; S.noTarget = rawPath(step).length === 0; panelKey = '';
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
    const step = meta.ftueNext({ ...ctx, skip: [...S.skipped] });
    if (step) { begin(step); S.home = ctx.screen === 'home'; }
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
  for (const ev of ['ult_ready', 'pick', 'join', 'boss', 'won']) game.events.on('tutorial:' + ev, () => offer({ screen: 'battle', event: 'tutorial:' + ev }));
  // the first fight opens on the story; its first guide step comes when the story closes
  game.events.on('tutorial:start', () => { if (story.want()) story.open(); else offer({ screen: 'battle', event: 'tutorial:start' }); });

  // ---- per frame ----
  const inter = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const grow = (r, m) => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });
  // The arrow lies on a free side of the target: below, above, right of it, then left of it. Its rectangle is the swept
  // body beyond the target's edge, so it never meets the target; `k` shrinks it where a full one has no room.
  const HAND_SIDES = [];
  for (const k of [1, 0.7, 0.56]) {
    const R = (HAND_LEN + HAND_BOB) * k + HAND_GAP, Hf = HAND_HALF * k, G = HAND_GAP;
    HAND_SIDES.push(
      { k, rot: 0, box: (r, c) => ({ x: c.x - Hf, y: r.y + r.h + G, w: 2 * Hf, h: R - G }), tip: (r, c, b) => [c.x, r.y + r.h + G + b * k] },
      { k, rot: Math.PI, box: (r, c) => ({ x: c.x - Hf, y: r.y - R, w: 2 * Hf, h: R - G }), tip: (r, c, b) => [c.x, r.y - G - b * k] },
      { k, rot: Math.PI / 2, box: (r, c) => ({ x: r.x + r.w + G, y: c.y - Hf, w: R - G, h: 2 * Hf }), tip: (r, c, b) => [r.x + r.w + G + b * k, c.y] },
      { k, rot: -Math.PI / 2, box: (r, c) => ({ x: r.x - R, y: c.y - Hf, w: R - G, h: 2 * Hf }), tip: (r, c, b) => [r.x - G - b * k, c.y] });
  }
  let handSide = null;
  function chooseHand(rect) {
    const H = ui.H, c = { x: clamp(rect.x + rect.w / 2, rect.x + Math.min(10, rect.w / 2), rect.x + rect.w - Math.min(10, rect.w / 2)), y: rect.y + rect.h / 2 };
    c.x = clamp(c.x, 34, 780 - 34); c.y = clamp(c.y, 34, H - 34);
    const fits = (b) => b.x >= 4 && b.y >= 4 && b.x + b.w <= 776 && b.y + b.h <= H - 4;
    // of the sides that fit, the one that lies on the least text the player may need to read (the target's own text excepted)
    const key = [rect.x, rect.y, rect.w, rect.h].map(Math.round).join('|');
    if (key !== handSide?.key) {
      const texts = textBoxes(rect), on = (b) => texts.reduce((a, t) => a + Math.max(0, Math.min(b.x + b.w, t.x + t.w) - Math.max(b.x, t.x)) * Math.max(0, Math.min(b.y + b.h, t.y + t.h) - Math.max(b.y, t.y)), 0);
      let best = null, bestA = Infinity;
      for (const q of HAND_SIDES) { const bx = q.box(rect, c); if (!fits(bx)) continue; const a = on(bx); if (a < bestA - 1) { best = q; bestA = a; } }
      handSide = { key, side: best || HAND_SIDES[0] };
    }
    const side = handSide.side;
    return { side, c, box: side.box(rect, c) };
  }
  // design boxes of the visible texts outside the guide and outside the target's own node
  const B3 = new THREE.Box3();
  function textBoxes(rect) {
    const out = [], scene = ui.scene, tnode = rect && rect.id ? ui.node(rect.id) : null; scene.updateMatrixWorld(true);
    scene.traverse((o) => {
      const n = o.parent; if (!(o.isMesh && n && n.mesh === o && n.canvas)) return;
      for (let a = o; a && a !== scene; a = a.parent) { if (!a.visible || a === tnode || a === scr || (a.isScreen && a.hiding)) return; }
      B3.setFromObject(o); out.push({ x: B3.min.x, y: -B3.max.y, w: B3.max.x - B3.min.x, h: B3.max.y - B3.min.y });
    });
    return out;
  }
  function placeHand(rect, tt) {
    const h = chooseHand(rect), ph = (tt * 2.2) % 1, bob = (0.5 - 0.5 * Math.cos(ph * Math.PI * 2)) * HAND_BOB, pop = easeBack(clamp(tt / 0.3, 0, 1));
    const squash = 1 - 0.06 * Math.max(0, Math.cos(ph * Math.PI * 2));
    const pk = Math.max(0.01, pop) * h.side.k; hand.visible = true; hand.scale.set(pk * (2 - squash), pk * squash, pk);
    const [tx, ty] = h.side.tip(rect, h.c, bob);
    hand.rotation.z = h.side.rot; hand.position.set(tx, -ty, 60);
    handAt = h.box; return h;
  }
  // The panel goes where it covers neither the target nor the hand nor the banner zone, as far from the target as the
  // frame allows (so it sits on the other side of the frame); in battle it also stays off the two hero-card corners.
  function placePanel(rect, hh) {
    if (!panel) return;
    const H = ui.H, w = panelW, h = panelH, battle = S.step && S.step.where === 'battle';
    let best = null;
    // the banners really up in the HUD (a stack of two reaches below BANNER_ZONE) are avoided too
    const hudB = battle && game.screens && game.screens.hud && game.screens.hud.bannerRects ? game.screens.hud.bannerRects().map((q) => grow(q, 4)) : [];
    if (!rect) {
      best = { x: 390 - w / 2, y: battle ? 148 : H - 12 - h };
      const below = Math.max(0, ...hudB.filter((q) => inter({ x: best.x, y: best.y, w, h }, q)).map((q) => q.y + q.h + 2));
      if (below) best.y = Math.min(H - 12 - h, below);
    } else {
      const avoid = [grow(rect, 8), grow(hh.box, 4), BANNER_ZONE, ...hudB], tc = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
      const corners = battle ? [{ x: 0, y: H - 100, w: 190, h: 100 }, { x: 590, y: H - 100, w: 190, h: 100 }] : [];
      let bs = -1e9;
      for (const hard of [avoid, avoid.slice(0, 2)]) {
        for (let y = 48; y <= H - 12 - h; y += 6) for (let x = 24; x <= 756 - w; x += 12) {
          const r = { x, y, w, h }; if (hard.some((q) => inter(r, q))) continue;
          const d = Math.hypot(x + w / 2 - tc.x, (y + h / 2 - tc.y) * 1.6) - (corners.some((q) => inter(r, q)) ? 140 : 0);
          if (d > bs) { bs = d; best = { x, y }; }
        }
        if (best) break;
      }
      if (!best && !narrow) { narrow = true; panelKey = ''; panel.visible = false; return; }
      if (!best) best = { x: 390 - w / 2, y: H - 12 - h };
    }
    const k = easeBack(clamp(S.t / 0.28, 0, 1));
    panel.pos(best.x + w / 2 * (1 - k), best.y + h / 2 * (1 - k)); panel.scale.set(Math.max(0.01, k), Math.max(0.01, k), 1);
    panelAt = { x: best.x, y: best.y, w, h };
    skipBtn.pos(best.x + w - panel.skipW + 6, best.y + (h - 44) / 2 - 1); skipBtn.setVisible(!!panel.skipW && k > 0.99);
  }

  function update(dt) {
    if (reveal) reveal.update(dt);
    if (story.active()) { if (ui.isShown('guide')) ui.hide('guide', { transition: 'none' }); return; }
    if (!S.step) { if (ui.isShown('guide')) ui.hide('guide', { transition: 'none' }); if (S.queue.length && !reveal.busy()) drain(false); return; }
    if (reveal && reveal.active()) { if (ui.isShown('guide')) ui.hide('guide', { transition: 'none' }); return; }
    // a step offered at home waits while a fight is up (a quick tap on BẮT ĐẦU beats it): it must neither show over the
    // fight nor run out its give-up clock there and be marked done unseen
    if (S.home && game.B) { if (ui.isShown('guide')) ui.hide('guide', { transition: 'none' }); hand.visible = false; S.miss = 0; S.dis = 0; S.t = 0; return; }
    const step = S.step, path = pathOf(step);
    ui.show('guide', { transition: 'none' });
    S.t += dt;
    const ent = entryOf(step, S.idx);
    if (!S.noTarget && !ent) { finish(step); return; }
    if (ent && ent.wait !== undefined) {
      buildPanel(ent.line || step.text, '');
      S.rect = null; handAt = null; drawDim(null); layoutBands(null); hand.visible = false; placePanel(null, null);
      if (!game.paused) S.wait += dt;
      if (S.wait >= ent.wait) pressed(step);
      return;
    }
    buildPanel((ent && ent.line) || step.text, S.noTarget && step.wait === undefined ? '' : S.noTarget ? 'Chạm để tiếp tục' : '');
    if (S.noTarget) {
      S.rect = null; handAt = null; drawDim(null); layoutBands(null); hand.visible = false; placePanel(null, null);
      if (step.wait !== undefined && !game.paused) { S.wait += dt; if (S.wait >= step.wait) finish(step); }
      return;
    }
    const id = path[S.idx];
    const hit = ui.targets().find((t) => t.id === id && !isOwn(t.id));
    if (hit && !hit.enabled && S.idx < path.length - 1) { S.idx++; return; }
    // the last target stays disabled: give up for this session without marking the guide done, so it can run again later
    if (hit && !hit.enabled) { S.dis += dt; if (S.dis > GIVE_UP) { S.skipped.add(step.id); game.frozen = false; S.step = null; S.rect = null; hand.visible = false; ui.hide('guide', { transition: 'none' }); drain(false, step.later); return; } } else S.dis = 0;
    if (!hit) {
      S.miss += dt; S.rect = null; handAt = null; drawDim(null); layoutBands(null); hand.visible = false; placePanel(null, null);
      if (S.miss > GIVE_UP) { game.frozen = false; finish(step); }
      return;
    }
    S.miss = 0;
    const rect = { ...toDesign(hit), id: hit.id }; S.rect = { x: hit.x, y: hit.y, w: hit.w, h: hit.h, id: hit.id };
    const extra = (step.allow || []).map((id) => ui.targets().find((t) => t.id === id && t.enabled && !isOwn(t.id))).filter(Boolean).map(toDesign);
    drawDim(rect, extra); layoutBands(rect, extra);
    placePanel(rect, placeHand(rect, S.t));
  }

  // design units to client px, the unit of ui.targets()
  function toClient(r) { if (!r) return null; const fr = frame.getBoundingClientRect(), k = fr.width / 780; return { x: fr.left + r.x * k, y: fr.top + r.y * k, w: r.w * k, h: r.h * k }; }
  const api = {
    name: 'guide', show() {}, hide() {}, update,
    dbg() {
      const s = S.step, e = s ? entryOf(s, S.idx) : null;
      const parked = !!(s && S.home && game.B);
      return { active: !!s && !parked, parked, id: s ? s.id : null, text: s ? (e && e.line) || s.text : '', target: s && !S.noTarget ? pathOf(s)[S.idx] : null, idx: S.idx, path: s ? pathOf(s) : [], noTarget: S.noTarget || !!(e && e.wait !== undefined), waiting: !!(e && e.wait !== undefined), rect: S.rect, allow: s ? s.allow || [] : [], skipVisible: skipBtn.visible, panel: toClient(panelAt), hand: toClient(handAt), bannerZone: toClient(BANNER_ZONE), frame: toClient({ x: 0, y: 0, w: 780, h: ui.H }), frozen: !!game.frozen, reveal: reveal ? reveal.dbg() : null, story: story.dbg() };
    },
  };
  game.guide = api;
  reveal = createReveal(game, { onDone: () => drain(false), blocked: () => !!(S.step && S.step.later && S.idx > 0) });
  return [api, reveal.api, story.api];
}
// ---------- the opening story ----------
// Two sentences over the frozen first fight, the very first time a fresh account starts it (SCOPE section 1). A tap
// shows the second line, the next tap (or BỎ QUA) closes it and the fight starts with its first guide step. It never
// comes back: it is shown only while the guide's first step ('intro') is not done.
export const STORY = [
  'Dịch xác sống tràn khắp các vùng đất, con người lui về những thành cuối cùng.',
  'Muông thú rừng sâu thức tỉnh Mầm Sống, tiến hoá và lập nên Đội Hộ Vệ.',
];
function createStory(game, { onDone }) {
  const ui = game.ui, meta = game.meta, THREE = ui.THREE, PAL = ui.PAL;
  const scr = ui.screen('story', { modal: true });
  const dim = new THREE.Mesh(new THREE.PlaneGeometry(1200, 800), new THREE.MeshBasicMaterial({ color: 0x0c0718, transparent: true, opacity: 0.86, depthWrite: false })); scr.put(dim, 390, 180, -5);
  const band = ui.panel({ w: 620, h: 178, r: 22, color: 0x2a2150, depth: 5, bevel: 3 }); scr.put(band, 80, 78, 2);
  const title = ui.text('Ải Sinh Tồn: Thú Hộ Vệ', { size: 15, color: PAL.gold, align: 'center' }); band.put(title, 310, 15, 8);
  const lines = STORY.map((s, i) => { const n = ui.text(s, { size: 16, maxW: 570, lineH: 20, align: 'center' }); band.put(n, 310, 62 + i * 54, 8); n.setOpacity(0); return n; });
  const hint = ui.text('Chạm để tiếp tục', { size: 11, color: 0xc8c0f0, align: 'center' }); scr.put(hint, 390, 270, 8);
  const tapAll = ui.button({ id: 'story-next', w: 780, h: 360, flat: true, alpha: 0.001, label: '', onTap: () => next() }); scr.put(tapAll, 0, 0, 20);
  const skipB = ui.button({ id: 'story-skip', w: 96, h: 44, r: 13, color: PAL.disabled, label: 'BỎ QUA', size: 14, onTap: () => close() }); scr.put(skipB, 664, 14, 40);
  const S = { on: false, t: 0, shown: 0 };
  const want = () => !meta.acc.ftue.done.intro && !meta.acc.ftue.session;
  function open() { S.on = true; S.t = 0; S.shown = 1; game.frozen = true; lines.forEach((n) => n.setOpacity(0)); ui.show('story', { transition: 'none' }); }
  function next() { if (!S.on) return; if (S.shown < STORY.length) { S.shown++; S.lineT = S.t; return; } close(); }
  function close() { if (!S.on) return; S.on = false; game.frozen = false; ui.hide('story', { transition: 'pop' }); onDone(); }
  function update(dt) {
    if (!S.on) return; S.t += dt;
    lines.forEach((n, i) => { const t0 = i === 0 ? 0.15 : S.lineT ?? 99; n.setOpacity(i < S.shown ? Math.min(1, Math.max(0, (S.t - t0) / 0.5)) : 0); });
    hint.setOpacity(S.t > 0.8 ? 0.55 + 0.45 * Math.sin(S.t * 4) : 0);
  }
  return {
    api: { name: 'story', show() {}, hide() {}, update },
    want, open, active: () => S.on,
    dbg: () => ({ on: S.on, shown: S.on ? S.shown : 0, lines: STORY.slice() }),
  };
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
  const dim = new THREE.Mesh(new THREE.PlaneGeometry(900, 500), new THREE.MeshBasicMaterial({ color: 0x0a0618, transparent: true, opacity: 0.74, depthWrite: false, toneMapped: false }));
  scr.put(dim, 390, 180, 0);
  const gc = document.createElement('canvas'); gc.width = gc.height = 128;
  { const c = gc.getContext('2d'), g = c.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,196,64,0.9)'); g.addColorStop(0.5, 'rgba(255,140,40,0.35)'); g.addColorStop(1, 'rgba(255,120,40,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); }
  const glowM = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(gc), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0 });
  // a wide, short card in the middle: the lock and its icon on the left, the words on the right
  const CARD = { x: 150, y: 80, w: 480, h: 200 }, LK = { x: CARD.x + 100, y: CARD.y + CARD.h / 2 };
  const card = ui.panel({ w: CARD.w, h: CARD.h, r: 26, color: 0x3a2d78, depth: 6, bevel: 3 }); scr.put(card, CARD.x, CARD.y, 1);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), glowM); scr.put(glow, LK.x, LK.y, 2);
  const lock = buildPadlock(THREE); lock.scale.setScalar(96); scr.holder.add(lock); lock.position.set(LK.x, -LK.y, 30);
  const tap = ui.button({ id: 'reveal-tap', w: 100, h: 100, shadow: false, onTap: () => advance() });
  tap.traverse((o) => { if (o.isMesh) o.visible = false; });
  scr.put(tap, 0, 0, 60);
  const R = { ids: [], cur: '', t: 0, nodes: [], wait: 0, icon: null, head: null, name: null, hint: null };

  const fit = () => { tap.scale.set(7.8, ui.H / 111, 1); };
  function clearNodes() { for (const n of R.nodes) n.dispose(); R.nodes = []; R.icon = R.head = R.name = R.hint = null; }
  function setup(id) {
    clearNodes(); R.cur = id; R.t = 0;
    const u = UNLOCK[id], ic = FEATURE_ICON[id] || 'star';
    R.icon = ui.icon(ic, { size: 104 }); scr.put(R.icon, LK.x - 52, LK.y - 52, 36); R.icon.visible = false;
    R.head = ui.text('MỞ KHOÁ', { size: 18, align: 'center', color: 0xffd860, outlineW: 3 }); scr.put(R.head, 470, CARD.y + 34, 36);
    R.name = ui.text(u.name.toLocaleUpperCase('vi'), { size: 28, align: 'center', maxW: 280, lineH: 36, outlineW: 3.4 }); scr.put(R.name, 470, CARD.y + 74, 36);
    R.hint = ui.text('Chạm để tiếp tục', { size: 13, align: 'center', color: 0xffe9a8, outlineW: 1.6 }); scr.put(R.hint, 470, CARD.y + CARD.h - 34, 36);
    R.nodes = [R.icon, R.head, R.name, R.hint];
    R.label = 'MỞ KHOÁ: ' + R.name.str;
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
    lock.visible = gone < 1; lock.scale.setScalar(Math.max(0.01, 96 * pop * (1 - gone * 0.7)));
    lock.rotation.set(-0.16, 0.4 + Math.sin(t * 1.4) * 0.18, shake);
    ud.pivot.rotation.y = -open * 2.5; ud.pivot.position.y = 0.34 + open * 0.14;
    lock.position.set(LK.x, -(LK.y + gone * 8), 30);
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
