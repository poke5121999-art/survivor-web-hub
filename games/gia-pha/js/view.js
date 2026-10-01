/*
 * Khung cây: thẻ người là DOM, dây nối là SVG, cả hai nằm trong #world được dịch/thu phóng.
 *
 * Hoạt ảnh dùng một tween JS cho mọi vị trí thay vì CSS transition: dây nối phải bám đúng
 * thẻ ở từng khung hình, mà CSS không cho đọc vị trí giữa chừng. Thẻ mới mọc ra từ tổ tiên
 * gần nhất đang hiện trên màn; thẻ biến mất thu về tổ tiên gần nhất còn lại. Một luật ấy
 * lo luôn cả mở/thu nhánh, thêm, xoá, soi nhánh.
 */
(function (GP) {
  'use strict';
  const M = GP.model, S = GP.store, CARD = GP.CARD;
  const $ = (s, r) => (r || document).querySelector(s);
  const SVGNS = 'http://www.w3.org/2000/svg';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const V = {
    cam: { x: 0, y: 0, k: 1 },
    pos: {}, els: {}, linkEls: {}, sig: {},
    L: null, doc: null, sel: null, drag: null, anim: null, camAnim: null,
    safeRight: 0, safeBottom: 0,
  };

  let stage, world, svg, layer, hint;

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
  function initials(name) {
    const w = String(name || '?').trim().split(/\s+/);
    return (w.length > 1 ? w[w.length - 1][0] : (w[0][0] || '?')).toUpperCase();
  }
  function years(p) {
    if (p.born && p.died) return p.born + ' – ' + p.died;
    if (p.died) return 'mất ' + p.died;
    if (p.born) return 's. ' + p.born;
    return '';
  }

  // ---------- thẻ ----------

  function cardHTML(c, p, doc) {
    const dead = !!p.died;
    const nfile = p.files.length;
    const hasNote = p.note && p.note.replace(/<[^>]*>/g, '').trim().length > 0;
    const isRoot = c.blood && !p.parentUnion;
    return '<div class="av">' + (p.photo ? '<img alt="" data-fid="' + esc(p.photo) + '">' : '<span>' + esc(initials(p.name)) + '</span>') + '</div>' +
      '<div class="tx"><div class="nm">' + (esc(p.name) || '<i>Chưa đặt tên</i>') + '</div>' +
      '<div class="yr">' + esc(years(p)) + (dead ? ' <span class="dead-mark" title="Đã mất">✿</span>' : '') + '</div>' +
      '<div class="mt"><span class="gen">Đời ' + c.gen + '</span>' +
      (nfile ? '<span class="chip" title="Tài liệu">📎' + nfile + '</span>' : '') +
      (hasNote ? '<span class="chip" title="Có ghi chú">✎</span>' : '') + '</div></div>' +
      (c.blood && c.kids ? '<button class="tog" data-act="toggle" title="' + (c.collapsed ? 'Mở nhánh' : 'Thu nhánh') + '">' +
        (c.collapsed ? '+' + c.hidden : '−') + '</button>' : '') +
      '<button class="qa qa-child" data-act="add-child" title="Thêm con">+</button>' +
      (c.blood ? '<button class="qa qa-spouse" data-act="add-spouse" title="Thêm vợ/chồng">♥</button>' : '') +
      (isRoot ? '<button class="qa qa-parent" data-act="add-parent" title="Thêm cha/mẹ">↑</button>' : '');
  }

  function fillPhotos(el) {
    for (const img of el.querySelectorAll('img[data-fid]')) {
      S.url(img.dataset.fid).then((u) => { if (u) img.src = u; else img.remove(); });
    }
  }

  // ---------- tween ----------

  const ease = (k) => 1 - Math.pow(1 - k, 3);
  const easeBack = (k) => { const c = 1.25; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };

  function applyCard(id) {
    const el = V.els[id], p = V.pos[id];
    if (!el || !p) return;
    el.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px) scale(' + p.s + ')';
    el.style.opacity = p.o;
  }

  function nearestShown(doc, id, have) {
    let cur = id;
    for (let i = 0; i < 200 && doc.people[cur]; i++) {
      const a = M.anchorOf(doc, cur);
      if (a !== cur && have[a]) return a;
      const u = doc.unions[doc.people[a].parentUnion];
      if (!u) return null;
      if (have[u.a]) return u.a;
      cur = u.a;
    }
    return null;
  }

  function render(opts) {
    opts = opts || {};
    const doc = S.doc;
    const L = GP.layout(doc, doc.view);
    const prevDoc = V.doc;
    V.L = L; V.doc = doc;
    const target = {};
    for (const c of L.cards) target[c.id] = { x: c.x, y: c.y, o: 1, s: 1 };

    for (const c of L.cards) {
      const p = doc.people[c.id];
      let el = V.els[c.id];
      if (!el) {
        el = document.createElement('div');
        el.dataset.id = c.id;
        layer.appendChild(el);
        V.els[c.id] = el;
        const from = nearestShown(doc, c.id, V.pos);
        const fp = from && V.pos[from];
        V.pos[c.id] = fp ? { x: fp.x, y: fp.y, o: 0, s: 0.55 } : { x: c.x, y: c.y + 24, o: 0, s: 0.8 };
        if (opts.pop === c.id) el.classList.add('born');
      }
      el.className = 'card ' + (p.gender === 'f' ? 'f' : 'm') + (c.blood ? '' : ' spouse') + (p.died ? ' dead' : '') +
        (V.sel === c.id ? ' sel' : '') + (el.classList.contains('born') ? ' born' : '') + (el.classList.contains('dying') ? '' : '');
      const sig = JSON.stringify([p.name, p.gender, p.born, p.died, p.photo, p.files.length, !!p.note, c.gen, c.kids, c.hidden, c.collapsed, c.blood, p.parentUnion ? 1 : 0]);
      if (V.sig[c.id] !== sig) { V.sig[c.id] = sig; el.innerHTML = cardHTML(c, p, doc); fillPhotos(el); }
    }

    for (const id in V.els) {
      if (target[id]) continue;
      const el = V.els[id];
      const into = prevDoc ? nearestShown(prevDoc, id, target) : null;
      const tp = into && target[into];
      target[id] = tp ? { x: tp.x, y: tp.y, o: 0, s: 0.5 } : Object.assign({}, V.pos[id], { o: 0, s: 0.6 });
      el.classList.add('dying');
      el.dataset.dying = '1';
    }

    for (const k in V.linkEls) if (!L.links.some((l) => l.key === k)) V.linkEls[k].dataset.dying = '1';
    for (const l of L.links) {
      let g = V.linkEls[l.key];
      if (!g) {
        g = document.createElementNS(SVGNS, 'g');
        g.setAttribute('class', 'lk new ' + (l.type === 'm' ? 'lk-m' : 'lk-c'));
        const path = document.createElementNS(SVGNS, 'path');
        path.setAttribute('pathLength', '1');
        g.appendChild(path);
        if (l.type === 'm') {
          const h = document.createElementNS(SVGNS, 'path');
          h.setAttribute('class', 'heart');
          h.setAttribute('d', 'M0,3 C-7,-3 -4,-9 0,-5 C4,-9 7,-3 0,3 Z');
          g.appendChild(h);
        }
        svg.appendChild(g);
        V.linkEls[l.key] = g;
      }
      delete g.dataset.dying;
      g._l = l;
    }

    animate(target, opts.instant || reduced ? 0 : (opts.dur || 520));
    if (opts.pop) GP.fx && setTimeout(() => { const p = V.pos[opts.pop]; if (p) GP.fx.burst(toScreen(p.x + CARD.w / 2, p.y + CARD.h / 2)); }, 380);
  }

  function animate(target, dur) {
    const from = {};
    for (const id in target) from[id] = Object.assign({}, V.pos[id] || target[id]);
    V.anim = { t0: performance.now(), dur, from, to: target };
    if (!V.raf) V.raf = requestAnimationFrame(step);
  }

  function step(now) {
    V.raf = 0;
    const A = V.anim;
    if (A) {
      const k = A.dur ? Math.min(1, (now - A.t0) / A.dur) : 1;
      const e = ease(k), eb = easeBack(k);
      for (const id in A.to) {
        if (V.drag && V.drag.id === id) continue;
        const f = A.from[id], t = A.to[id];
        V.pos[id] = { x: f.x + (t.x - f.x) * e, y: f.y + (t.y - f.y) * e, o: f.o + (t.o - f.o) * e, s: f.s + (t.s - f.s) * (t.s > f.s ? eb : e) };
        applyCard(id);
      }
      if (k >= 1) {
        V.anim = null;
        for (const id in V.els) {
          if (!V.els[id].dataset.dying) { V.els[id].classList.remove('born'); continue; }
          V.els[id].remove(); delete V.els[id]; delete V.pos[id]; delete V.sig[id];
        }
        for (const key in V.linkEls) if (V.linkEls[key].dataset.dying) { V.linkEls[key].remove(); delete V.linkEls[key]; }
      }
    }
    drawLinks();
    if (V.anim || V.camAnim || V.drag) V.raf = requestAnimationFrame(step);
    if (V.camAnim) stepCam(now);
  }

  function drawLinks() {
    const W = CARD.w, H = CARD.h;
    for (const key in V.linkEls) {
      const g = V.linkEls[key], l = g._l;
      const a = V.pos[l.a], b = l.b && V.pos[l.b], c = l.c && V.pos[l.c];
      if (!a || (l.b && !b) || (l.c && !c)) { g.style.opacity = 0; continue; }
      const path = g.firstChild;
      if (l.type === 'm') {
        const left = a.x < b.x ? a : b, right = a.x < b.x ? b : a;
        const y = (left.y + right.y) / 2 + H / 2;
        const x1 = left.x + W, x2 = right.x;
        path.setAttribute('d', 'M' + x1 + ',' + y + ' L' + x2 + ',' + y);
        g.lastChild.setAttribute('transform', 'translate(' + (x1 + x2) / 2 + ',' + (y + 1) + ')');
        g.style.opacity = Math.min(a.o, b.o);
      } else {
        let sx, sy;
        if (b) {
          const left = a.x < b.x ? a : b, right = a.x < b.x ? b : a;
          sx = (left.x + W + right.x) / 2; sy = (left.y + right.y) / 2 + H / 2 + 8;
        } else { sx = a.x + 40; sy = a.y + H + 12; }
        const ex = c.x + W / 2, ey = c.y;
        const my = sy + (ey - sy) * 0.55;
        path.setAttribute('d', 'M' + sx + ',' + sy + ' C' + sx + ',' + my + ' ' + ex + ',' + (ey - (ey - sy) * 0.45) + ' ' + ex + ',' + ey);
        g.style.opacity = Math.min(a.o, c.o) * (V.drag && V.drag.sub.has(l.c) ? 0.35 : 1);
      }
    }
  }

  // ---------- camera ----------

  function applyCam() {
    world.style.transform = 'translate(' + V.cam.x + 'px,' + V.cam.y + 'px) scale(' + V.cam.k + ')';
    stage.style.setProperty('--k', V.cam.k);
    stage.style.backgroundPosition = V.cam.x + 'px ' + V.cam.y + 'px';
    stage.style.backgroundSize = (36 * V.cam.k) + 'px ' + (36 * V.cam.k) + 'px';
  }
  function toScreen(x, y) { const r = stage.getBoundingClientRect(); return { x: r.left + V.cam.x + x * V.cam.k, y: r.top + V.cam.y + y * V.cam.k }; }
  function toWorld(cx, cy) { const r = stage.getBoundingClientRect(); return { x: (cx - r.left - V.cam.x) / V.cam.k, y: (cy - r.top - V.cam.y) / V.cam.k }; }

  let saveCamT;
  function camChanged() {
    applyCam();
    clearTimeout(saveCamT);
    saveCamT = setTimeout(() => S.setView({ cam: Object.assign({}, V.cam) }, true), 400);
  }

  function flyTo(cam, dur) {
    if (reduced || dur === 0) { V.cam = cam; camChanged(); return; }
    V.camAnim = { t0: performance.now(), dur: dur || 480, from: Object.assign({}, V.cam), to: cam };
    if (!V.raf) V.raf = requestAnimationFrame(step);
  }
  function stepCam(now) {
    const A = V.camAnim;
    const k = Math.min(1, (now - A.t0) / A.dur), e = ease(k);
    V.cam = { x: A.from.x + (A.to.x - A.from.x) * e, y: A.from.y + (A.to.y - A.from.y) * e, k: A.from.k + (A.to.k - A.from.k) * e };
    camChanged();
    if (k >= 1) V.camAnim = null;
    else if (!V.raf) V.raf = requestAnimationFrame(step);
  }

  function viewport() {
    const r = stage.getBoundingClientRect();
    return { w: Math.max(200, r.width - V.safeRight), h: Math.max(160, r.height - V.safeBottom) };
  }

  // readable: cây lớn quá thì không thu tới mức chữ không đọc được, mà phóng vừa đọc và đặt cụ tổ ở đầu màn.
  function fit(dur, readable) {
    const b = V.L && V.L.bounds;
    if (!b || !b.w) return;
    const vp = viewport();
    const pad = vp.w < 500 ? 24 : 70;
    const k = Math.max(0.15, Math.min(1.1, (vp.w - pad * 2) / b.w, (vp.h - pad * 2) / b.h));
    const minK = vp.w < 500 ? 0.62 : 0.5;
    if (readable && k < minK) {
      const top = V.L.cards.reduce((a, c) => (c.y < a.y || (c.y === a.y && c.blood && !a.blood) ? c : a), V.L.cards[0]);
      flyTo({ k: minK, x: vp.w / 2 - (top.x + CARD.w / 2) * minK, y: 40 - b.y * minK }, dur);
      return;
    }
    flyTo({ k, x: vp.w / 2 - (b.x + b.w / 2) * k, y: vp.h / 2 - (b.y + b.h / 2) * k + 10 }, dur);
  }

  function centerOn(id, opts) {
    const c = V.L && V.L.cards.find((x) => x.id === id);
    if (!c) return;
    const vp = viewport();
    const k = (opts && opts.k) || Math.max(V.cam.k, 0.7);
    const nx = vp.w / 2 - (c.x + CARD.w / 2) * k, ny = vp.h / 2 - (c.y + CARD.h / 2) * k;
    if (opts && opts.ifHidden) {
      const s = { x: V.cam.x + c.x * V.cam.k, y: V.cam.y + c.y * V.cam.k };
      if (s.x > 20 && s.y > 20 && s.x + CARD.w * V.cam.k < vp.w - 20 && s.y + CARD.h * V.cam.k < vp.h - 20) return;
    }
    flyTo({ k, x: nx, y: ny }, opts && opts.dur);
  }

  function zoomAt(f, cx, cy) {
    const r = stage.getBoundingClientRect();
    const k = Math.max(0.12, Math.min(2.6, V.cam.k * f));
    const px = cx - r.left, py = cy - r.top;
    V.cam = { k, x: px - (px - V.cam.x) * (k / V.cam.k), y: py - (py - V.cam.y) * (k / V.cam.k) };
    V.camAnim = null;
    camChanged();
  }

  // ---------- chọn, nhấp nháy ----------

  function select(id, why) {
    if (V.sel && V.els[V.sel]) V.els[V.sel].classList.remove('sel');
    V.sel = id && S.doc.people[id] ? id : null;
    if (V.sel && V.els[V.sel]) V.els[V.sel].classList.add('sel');
    S.emit('select', { id: V.sel, why });
  }

  function pulse(id) {
    const el = V.els[id];
    if (!el) return;
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
    setTimeout(() => el.classList.remove('pulse'), 1700);
  }

  // ---------- con trỏ: kéo nền để dịch, kéo thẻ để chuyển nhánh, chụm hai ngón để thu phóng ----------

  const pointers = new Map();
  let gesture = null;

  function onDown(e) {
    if (e.button > 0) return;
    if (e.target.closest('.no-pan')) return;
    stage.setPointerCapture && stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      cancelHold();
      if (V.drag) endDrag(null);
      const [p1, p2] = Array.from(pointers.values());
      gesture = { type: 'pinch', d: Math.hypot(p1.x - p2.x, p1.y - p2.y), mx: (p1.x + p2.x) / 2, my: (p1.y + p2.y) / 2 };
      return;
    }
    const btn = e.target.closest('button[data-act]');
    const cardEl = e.target.closest('.card');
    V.camAnim = null;
    gesture = { type: 'press', x: e.clientX, y: e.clientY, cx: V.cam.x, cy: V.cam.y, card: cardEl && !cardEl.dataset.dying ? cardEl.dataset.id : null, btn, moved: false, touch: e.pointerType !== 'mouse' };
    if (gesture.card && !btn && gesture.touch && !M.isSpouse(S.doc, gesture.card)) {
      gesture.hold = setTimeout(() => { if (gesture && !gesture.moved) { navigator.vibrate && navigator.vibrate(18); startDrag(gesture.card, e.clientX, e.clientY); } }, 420);
    }
  }
  function cancelHold() { if (gesture && gesture.hold) { clearTimeout(gesture.hold); gesture.hold = 0; } }

  function onMove(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gesture) return;
    if (gesture.type === 'pinch' && pointers.size >= 2) {
      const [p1, p2] = Array.from(pointers.values());
      const d = Math.hypot(p1.x - p2.x, p1.y - p2.y), mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
      zoomAt(d / gesture.d, mx, my);
      V.cam.x += mx - gesture.mx; V.cam.y += my - gesture.my;
      camChanged();
      gesture.d = d; gesture.mx = mx; gesture.my = my;
      return;
    }
    if (V.drag) { moveDrag(e.clientX, e.clientY); return; }
    const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y;
    if (!gesture.moved && Math.hypot(dx, dy) > (gesture.touch ? 9 : 5)) {
      gesture.moved = true;
      cancelHold();
      if (gesture.card && !gesture.btn && !gesture.touch && !M.isSpouse(S.doc, gesture.card)) { startDrag(gesture.card, e.clientX, e.clientY); return; }
      gesture.type = 'pan';
      stage.classList.add('panning');
    }
    if (gesture.type === 'pan') {
      V.cam.x = gesture.cx + dx; V.cam.y = gesture.cy + dy;
      camChanged();
    }
  }

  function onUp(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    stage.classList.remove('panning');
    if (V.drag) { endDrag(e.type === 'pointercancel' ? null : { x: e.clientX, y: e.clientY }); gesture = null; return; }
    const g = gesture;
    if (!g) return;
    cancelHold();
    if (g.type === 'pinch') { if (pointers.size < 2) gesture = null; return; }
    gesture = null;
    if (g.moved || e.type === 'pointercancel') return;
    if (g.btn && g.card) { S.emit('card-action', { id: g.card, act: g.btn.dataset.act, el: g.btn }); return; }
    if (g.card) { select(g.card, 'click'); return; }
    select(null, 'background');
  }

  // ---------- kéo thả thẻ ----------

  function startDrag(id, cx, cy) {
    const p = V.pos[id];
    if (!p) return;
    const w = toWorld(cx, cy);
    const sub = new Set(M.descendants(S.doc, id));
    for (const d of Array.from(sub)) for (const s of M.spousesOf(S.doc, d)) sub.add(s);
    for (const s of M.spousesOf(S.doc, id)) sub.add(s);
    V.drag = { id, ox: w.x - p.x, oy: w.y - p.y, sub, target: null, mode: null, cx, cy };
    V.els[id].classList.add('dragging');
    for (const s of sub) V.els[s] && V.els[s].classList.add('drag-sub');
    stage.classList.add('is-dragging');
    if (!V.raf) V.raf = requestAnimationFrame(step);
    S.emit('drag', true);
  }

  function siblingsRow(doc, id) {
    const s = M.siblingsList(doc, id);
    return s || M.roots(doc);
  }

  function moveDrag(cx, cy) {
    const D = V.drag;
    D.cx = cx; D.cy = cy;
    const w = toWorld(cx, cy);
    V.pos[D.id] = Object.assign({}, V.pos[D.id], { x: w.x - D.ox, y: w.y - D.oy, o: 1, s: 1.04 });
    applyCard(D.id);
    const el = V.els[D.id];
    el.style.pointerEvents = 'none';
    const under = document.elementFromPoint(cx, cy);
    el.style.pointerEvents = '';
    const tEl = under && under.closest('.card');
    const tid = tEl && !tEl.dataset.dying ? tEl.dataset.id : null;
    for (const x of layer.querySelectorAll('.drop-ok,.drop-no,.drop-before,.drop-after')) x.classList.remove('drop-ok', 'drop-no', 'drop-before', 'drop-after');
    D.target = null; D.mode = null;
    let msg = '';
    if (tid && tid !== D.id && !D.sub.has(tid)) {
      const doc = S.doc;
      const row = siblingsRow(doc, D.id);
      const r = tEl.getBoundingClientRect();
      const fx = (cx - r.left) / r.width;
      if (row.includes(tid) && !M.isSpouse(doc, tid) && (fx < 0.3 || fx > 0.7)) {
        D.target = tid; D.mode = fx < 0.3 ? 'before' : 'after';
        tEl.classList.add(fx < 0.3 ? 'drop-before' : 'drop-after');
        msg = 'Đặt ' + (fx < 0.3 ? 'trước' : 'sau') + ' ' + (doc.people[tid].name || 'người này');
      } else {
        const why = M.moveBlocker(doc, D.id, tid);
        if (why) { tEl.classList.add('drop-no'); msg = 'Không được: ' + why; }
        else { D.target = tid; D.mode = 'child'; tEl.classList.add('drop-ok'); msg = 'Thả: làm con của ' + (doc.people[tid].name || 'người này'); }
      }
    } else if (tid && D.sub.has(tid)) { tEl.classList.add('drop-no'); msg = 'Không được: đó là con cháu của người này'; }
    else msg = 'Kéo lên một người để chuyển nhánh';
    hint.textContent = msg;
    hint.style.transform = 'translate(' + (cx + 16) + 'px,' + (cy + 18) + 'px)';
    hint.classList.toggle('show', !!msg);
    hint.classList.toggle('bad', msg.startsWith('Không'));
    const r = stage.getBoundingClientRect(), E = 48;
    D.edge = { x: cx < r.left + E ? 1 : cx > r.right - E ? -1 : 0, y: cy < r.top + E ? 1 : cy > r.bottom - E ? -1 : 0 };
    if ((D.edge.x || D.edge.y) && !D.edgeT) D.edgeT = setInterval(() => {
      if (!V.drag || !(V.drag.edge.x || V.drag.edge.y)) { clearInterval(D.edgeT); D.edgeT = 0; return; }
      V.cam.x += V.drag.edge.x * 12; V.cam.y += V.drag.edge.y * 12; camChanged(); moveDrag(V.drag.cx, V.drag.cy);
    }, 16);
  }

  function endDrag(at) {
    const D = V.drag;
    if (!D) return;
    clearInterval(D.edgeT);
    V.drag = null;
    hint.classList.remove('show');
    stage.classList.remove('is-dragging');
    for (const x of layer.querySelectorAll('.dragging,.drag-sub,.drop-ok,.drop-no,.drop-before,.drop-after')) x.classList.remove('dragging', 'drag-sub', 'drop-ok', 'drop-no', 'drop-before', 'drop-after');
    S.emit('drag', false);
    if (at && D.target && D.mode) {
      const name = (id) => S.doc.people[id].name || 'người này';
      if (D.mode === 'child') {
        const moved = S.commit('Chuyển ' + name(D.id) + ' làm con của ' + name(D.target), (t) => {
          const ok = M.moveUnder(t, D.id, D.target);
          if (ok) delete t.view.collapsed[M.anchorOf(t, D.target)];
          return ok;
        });
        if (moved) { S.emit('toast', { text: 'Đã chuyển ' + name(D.id) + ' sang nhánh ' + name(D.target), undo: true }); return; }
      } else {
        S.commit('Đổi thứ tự ' + name(D.id), (t) => M.reorder(t, D.id, D.target, D.mode === 'after'));
        return;
      }
    }
    render();
  }

  // ---------- thả tệp từ máy vào thẻ ----------

  function onDragOver(e) {
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
    e.preventDefault();
    const tEl = e.target.closest && e.target.closest('.card');
    for (const x of layer.querySelectorAll('.file-over')) if (x !== tEl) x.classList.remove('file-over');
    if (tEl) tEl.classList.add('file-over');
    e.dataTransfer.dropEffect = tEl ? 'copy' : 'none';
  }
  function onDrop(e) {
    if (!e.dataTransfer || !e.dataTransfer.files.length) return;
    e.preventDefault();
    const tEl = e.target.closest && e.target.closest('.card');
    for (const x of layer.querySelectorAll('.file-over')) x.classList.remove('file-over');
    if (tEl) S.emit('drop-files', { id: tEl.dataset.id, files: Array.from(e.dataTransfer.files) });
  }

  function init() {
    stage = $('#stage'); world = $('#world'); svg = $('#links'); layer = $('#cards'); hint = $('#drag-hint');
    stage.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey || Math.abs(e.deltaY) >= 40 || e.deltaMode) zoomAt(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0016) * (e.ctrlKey ? 4 : 1)), e.clientX, e.clientY);
      else { V.cam.x -= e.deltaX; V.cam.y -= e.deltaY; V.camAnim = null; camChanged(); }
    }, { passive: false });
    stage.addEventListener('dblclick', (e) => {
      const c = e.target.closest('.card');
      if (c) S.emit('card-action', { id: c.dataset.id, act: 'edit' });
      else if (!e.target.closest('.no-pan')) fit();
    });
    stage.addEventListener('dragover', onDragOver);
    stage.addEventListener('dragleave', (e) => { if (e.target.closest && e.target.closest('.card')) e.target.closest('.card').classList.remove('file-over'); });
    stage.addEventListener('drop', onDrop);
    window.addEventListener('resize', () => applyCam());
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && V.drag) { V.drag.target = null; endDrag(null); } });
  }

  function reset() {
    for (const id in V.els) V.els[id].remove();
    for (const k in V.linkEls) V.linkEls[k].remove();
    V.els = {}; V.pos = {}; V.sig = {}; V.linkEls = {}; V.doc = null; V.sel = null; V.anim = null;
  }

  function invalidate(id) { if (id) delete V.sig[id]; else V.sig = {}; }

  Object.assign(V, { init, render, fit, centerOn, select, pulse, zoomAt, flyTo, reset, applyCam, toScreen, invalidate,
    zoomBy(f) { const r = stage.getBoundingClientRect(); zoomAt(f, r.left + viewport().w / 2, r.top + viewport().h / 2); } });
  GP.view = V;
})(window.GP);
