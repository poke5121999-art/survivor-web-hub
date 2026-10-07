/*
 * Màn hình thu hoạch của DREDGE (HarvestMinigameView) + sáu minigame câu / nạo vét, dựng bằng DOM theo ĐÚNG cây RectTransform
 * của Scenes/Game.unity (tools/harvest_ui.py -> art/ui/minigame/harvest_ui.js): panel 720x320 trượt từ mép trái, vòng chính
 * 274 đơn vị, thanh tiến độ bên trái, thẻ loại cá, chữ "Trữ lượng", nút nhắc phím. Luật chép từ HarvestMinigame.cs, FishMinigame.cs,
 * PendulumMinigame.cs, BallCatcherMinigame.cs (+BallCatcherBall.cs), DiamondMinigame.cs (+Target), SpiralMinigame.cs (+SpiralComponent),
 * DredgeMinigame.cs, HarvestMinigameView.cs; số trong prefab đọc từ scene (tên trường giữ nguyên Unity).
 *
 *   DRMinigame.open({ type, cfg, speed, itemId, info, rollTrophy(), onDone({caught, trophy, aborted}) })
 *       mở panel ở trạng thái CHỜ: chưa tính giờ, chưa có mục tiêu. Bấm F / Space / chạm nút "Bắt đầu" mới chạy.
 *   DRMinigame.isOpen()   true CHỈ khi minigame đang chạy (đồng hồ thế giới chạy: IsTimePassingViaFishing); isShown() = panel đang hiện.
 *   DRMinigame.reveal(made, cb)   thẻ "bắt được" trên panel; refresh(opts) quay về trạng thái chờ cho con kế; close() trượt panel ra.
 * Góc: độ, Unity eulerAngles z (ngược chiều kim đồng hồ dương), 0 = đỉnh vòng. Con trỏ xoay thuận chiều kim đồng hồ = góc GIẢM.
 */
(function (root) {
  'use strict';
  const me = document.currentScript;
  const ver = (me && me.src.match(/\?v=[^&]*/) || [''])[0];
  const URLB = f => new URL('../' + f, (me && me.src) || location.href).href;
  if (!document.querySelector('link[href*="minigame.css"]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = URLB('css/minigame.css' + ver); document.head.appendChild(l);
  }
  const HUI = root.DR_HARVEST_UI;
  if (!HUI) console.error('[minigame] art/ui/minigame/harvest_ui.js not loaded; harvest view disabled');
  const COL = HUI ? HUI.colors : {};
  const MI = HUI ? HUI.mini : {};

  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));          // số lượng: Random.Range(min, max + 1) kiểu int
  const rint = (a, b) => Math.floor(rand(a, b));                 // Random.Range(int, int): loại trừ cận trên (độ rộng mục tiêu là int)
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const norm360 = a => ((a % 360) + 360) % 360;
  const norm180 = a => { a = norm360(a); return a > 180 ? a - 360 : a; };   // MathUtil.TransformAngleToNegative180Positive180 sau eulerAngles
  const isBetween = (t, a, b) => t >= Math.min(a, b) && t <= Math.max(a, b);
  const outQuad = t => 1 - (1 - t) * (1 - t);                     // DOTween mặc định
  const play = (k, v) => { try { root.DRAudio && DRAudio.play(k, v); } catch (e) { /* tiếng là phần phụ */ } };

  // Tiếng của sáu minigame (guid addressables -> catalog.json, xem tools/harvest_ui.py). Ba tiếng cánh cổng là của DLC2.
  if (root.DR_AUDIO) {
    const A = n => 'art/ui/minigame/audio/' + n + '.mp3';
    Object.assign(root.DR_AUDIO, {
      'fish.spiral.gateOpen': { src: A('gate-open'), loop: false, vol: 0.8 },
      'fish.spiral.gateClose': { src: A('gate-close'), loop: false, vol: 0.8 },
      'fish.spiral.gateHit': { src: A('gate-hit'), loop: false, vol: 0.8 }
    });
  }

  // ---------------------------------------------------------------------------------------------- chữ (tiếng Việt, theo chuỗi gốc)
  const T = {
    title: { fish: 'Vùng nước động', dredge: 'Bóng hình dưới đáy' },                     // spot.fishing / spot.dredging
    stock: { high: 'Trữ lượng: Nhiều', medium: 'Trữ lượng: Vừa', low: 'Trữ lượng: Ít', none: 'Trữ lượng: Cạn' },
    stockColor: { high: COL.POSITIVE, medium: COL.NEUTRAL, low: COL.WARNING, none: COL.NEGATIVE },
    start: { fish: 'Bắt đầu câu', dredge: 'Bắt đầu nạo vét' },                          // prompt.start-fishing / start-dredging
    pull: 'Kéo',                                                                         // prompt.interact-harvest
    leave: 'Rời đi (Esc)',
    cannot: {
      no_stock: 'Điểm này đã cạn.', wrong_time: 'Giờ này không có cá ở đây.', need_rod: 'Bạn không có đúng dụng cụ để câu ở đây.',
      no_equipment: 'Bạn không có đúng dụng cụ cho điểm này.', need_advanced: 'Bạn không có đúng dụng cụ cho điểm này.',
      broken: 'Dụng cụ hỏng. Hiệu quả câu giảm.'
    },
    type: { COASTAL: 'VEN BỜ', SHALLOW: 'NÔNG', OCEANIC: 'NGOÀI KHƠI', ABYSSAL: 'VỰC SÂU', HADAL: 'HẺM SÂU', VOLCANIC: 'NÚI LỬA', MANGROVE: 'NGẬP MẶN', DREDGE: 'NẠO VÉT', CRAB: 'CUA', ICE: 'BĂNG' },
    tut: {                                                                               // tutorial.35 .. 39, 130 (khoá = HarvestMinigameType)
      FISHING_RADIAL: 'Nhấn {k} <b>đúng lúc</b> để kéo cá <b>nhanh hơn</b>.', FISHING_PENDULUM: 'Nhấn {k} <b>đúng lúc</b> để kéo cá <b>nhanh hơn</b>.',
      FISHING_BALL_CATCHER: 'Nhấn {k} khi <b>quả bóng chạm vùng bắt</b> ở trên đỉnh để kéo cá <b>nhanh hơn</b>.',
      FISHING_DIAMOND: 'Nhấn {k} khi <b>hình thoi khớp</b> vòng để kéo cá <b>nhanh hơn</b>.',
      FISHING_SPIRAL: 'Nhấn {k} <b>đúng lúc</b> để <b>mở cổng</b> cho quả bóng đi qua.', DREDGE_RADIAL: 'Nhấn {k} để <b>đổi làn</b> và <b>tránh các khoảng trống</b>.'
    },
    tags: { trophy: 'KỶ LỤC', aberrant: 'DỊ BIẾN', isnew: 'MỚI' }, size: 'Dài ', cm: ' cm'
  };

  const WHEEL = { FISHING_RADIAL: 'RadialFishMinigameWheel', FISHING_PENDULUM: 'PendulumMinigame', FISHING_BALL_CATCHER: 'BallCatcherMinigame', FISHING_DIAMOND: 'DiamondMinigame', FISHING_SPIRAL: 'SpiralMinigame', DREDGE_RADIAL: 'DredgeMinigameWheel' };

  // ---------------------------------------------------------------------------------------------- nút giao diện (RectTransform -> CSS)
  const DIRTY = new Set();
  const NODES = {};                       // đường dẫn đầy đủ -> Nd
  const PREFIX = 'CombinedMinigameView/Container/';
  const Q = rel => NODES[rel === '' ? 'CombinedMinigameView/Container' : PREFIX + rel] || null;
  let USC = 1;                            // đơn vị canvas -> px
  const spriteUrl = n => URLB('art/ui/minigame/sprites/' + n + '.webp' + ver);
  const colArr = h => { const s = String(h).replace('#', ''); return [0, 2, 4, 6].map(i => s.length > i ? parseInt(s.substr(i, 2), 16) / 255 : 1); };
  const colCss = c => 'rgb(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ')';
  const COLORS = Object.fromEntries(Object.entries(COL).map(([k, v]) => [k, colArr(v)]));
  const NEG_SET = new Set(['FishingUICircle']);

  function sectorClip(amount, origin, clockwise) {                      // Image.fillMethod Radial360
    if (amount >= 0.9999) return 'none';
    if (amount <= 0.0001) return 'polygon(0 0, 0 0, 0 0)';
    const start = [180, 90, 0, 270][origin] || 0, dir = clockwise ? 1 : -1, steps = Math.max(2, Math.ceil(amount * 360 / 5)), pts = ['50% 50%'];
    for (let i = 0; i <= steps; i++) {
      const a = (start + dir * amount * 360 * i / steps) * Math.PI / 180;
      pts.push((50 + 72 * Math.sin(a)).toFixed(2) + '% ' + (50 - 72 * Math.cos(a)).toFixed(2) + '%');
    }
    return 'polygon(' + pts.join(',') + ')';
  }
  function linearClip(amount, method, origin) {                         // fillMethod 0 ngang (0 trái, 1 phải) / 1 dọc (0 đáy, 1 đỉnh)
    const r = ((1 - clamp(amount, 0, 1)) * 100).toFixed(3) + '%';
    if (method === 0) return origin === 0 ? 'inset(0 ' + r + ' 0 0)' : 'inset(0 0 0 ' + r + ')';
    return origin === 0 ? 'inset(' + r + ' 0 0 0)' : 'inset(0 0 ' + r + ' 0)';
  }

  class Nd {
    constructor(node, path, parent) {
      this.node = node; this.path = path; this.parent = parent; this.kids = []; this.rt = node.rt || null;
      this.el = document.createElement('div');
      this.img = (node.c || []).find(c => c.script === 'Image') || null;
      this.tmp = (node.c || []).find(c => c.script === 'TMP') || null;
      const r = this.rt;
      this.s = { apx: r ? r.ap[0] : 0, apy: r ? r.ap[1] : 0, sx: r ? r.sc[0] : 1, sy: r ? r.sc[1] : 1, rot: r ? r.rot : 0, on: !!node.on, col: this.img ? colArr(this.img.col) : [1, 1, 1, 1], fill: this.img && this.img.fill ? this.img.fill[0] : 1, vis: true };
      this.base = Object.assign({}, this.s, { col: this.s.col.slice() });
      this.f = { all: true };
      this.el.className = 'mg-n' + (this.img ? ' mg-i' : '') + (this.tmp ? ' mg-t' : '');
      this.el.dataset.n = node.n;
      if (this.img && this.img.off) this.s.vis = false;
      if (this.img) this.initImage();
      if (this.tmp) this.initText();
      if (node.n === 'X') this.el.style.visibility = 'visible';
      this.touch('all');
    }
    initImage() {
      const im = this.img, el = this.el, meta = im.spr && HUI.sprites[im.spr];
      if (im.spr === 'square_0') el.classList.add('plain');
      else if (im.spr) el.style.setProperty('--s', 'url(' + spriteUrl(im.spr) + ')');
      if (im.pa) el.classList.add('pa');
      if (im.type === 1 && meta && meta.border.some(v => v > 0)) {      // Image Sliced: biên theo ppu của sprite
        const b = meta.border, k = 100 / meta.ppu;
        el.classList.add('sl');
        el.style.setProperty('--sl', b[3] + ' ' + b[2] + ' ' + b[1] + ' ' + b[0]);
        el.style.setProperty('--bw', [b[3], b[2], b[1], b[0]].map(v => 'calc(' + (v * k).toFixed(3) + ' * var(--u))').join(' '));
      }
    }
    initText() {
      this.span = document.createElement('span'); this.el.appendChild(this.span);
      const t = this.tmp, h = t.halign, v = t.valign;
      this.el.style.justifyContent = h === 2 ? 'center' : h === 4 ? 'flex-end' : 'flex-start';
      this.el.style.alignItems = v === 256 ? 'flex-start' : (v === 1024 ? 'flex-end' : 'center');
      this.el.style.textAlign = h === 2 ? 'center' : h === 4 ? 'right' : 'left';
      this.el.style.color = t.col.slice(0, 7);
      this.size = t.size; this.fitMin = t.min; this.fitMax = t.max; this.auto = !!t.auto;
      this.setText(t.text);
    }
    setText(html, opt) {
      if (!this.span) return;
      this.html = html;
      this.span.innerHTML = html;
      const latin = /^[\x20-\x7e -ÿ]*$/.test(String(html).replace(/<[^>]*>/g, ''));
      this.el.style.setProperty('--f', latin ? '"FrontPageNeue", "Signika", sans-serif' : '"Signika", "Segoe UI", sans-serif');
      if (opt && opt.color) this.el.style.color = opt.color;
      this.fit();
    }
    fit() {                                                                // TMP enableAutoSizing: tìm cỡ lớn nhất còn vừa khung
      if (!this.span || !this.el.isConnected) { this.fitPending = true; return; }
      this.fitPending = false;
      const el = this.el, sp = this.span;
      let lo = this.auto ? this.fitMin : this.size, hi = this.auto ? this.fitMax : this.size;
      const ok = sz => { el.style.fontSize = (sz * USC).toFixed(2) + 'px'; return sp.scrollWidth <= el.clientWidth + 1 && sp.offsetHeight <= el.clientHeight + 1; };
      if (ok(hi)) return;
      for (let i = 0; i < 9 && hi - lo > 0.25; i++) { const mid = (lo + hi) / 2; if (ok(mid)) lo = mid; else hi = mid; }
      el.style.fontSize = (lo * USC).toFixed(2) + 'px';
    }
    touch(k) { this.f[k] = true; DIRTY.add(this); }
    set(k, v) { if (this.s[k] !== v) { this.s[k] = v; this.touch(k === 'on' || k === 'vis' ? 'on' : k === 'col' || k === 'fill' ? 'col' : (k === 'apx' || k === 'apy') ? 'pos' : 'tf'); } }
    setCol(c) { const o = this.s.col; if (o[0] !== c[0] || o[1] !== c[1] || o[2] !== c[2] || o[3] !== c[3]) { this.s.col = c.slice(); this.touch('col'); } }
    apply() {
      const f = this.f, s = this.s, r = this.rt, el = this.el;
      if (r && (f.all || f.pos)) {
        const [ax0, ay0] = r.amin, [ax1, ay1] = r.amax, [px, py] = r.piv, [sw, sh] = r.sd;
        el.style.left = 'calc(' + (ax0 * 100) + '% + ' + (s.apx - px * sw) + ' * var(--u))';
        el.style.bottom = 'calc(' + (ay0 * 100) + '% + ' + (s.apy - py * sh) + ' * var(--u))';
        if (f.all) {
          el.style.width = ax0 === ax1 ? 'calc(' + sw + ' * var(--u))' : 'calc(' + ((ax1 - ax0) * 100) + '% + ' + sw + ' * var(--u))';
          el.style.height = ay0 === ay1 ? 'calc(' + sh + ' * var(--u))' : 'calc(' + ((ay1 - ay0) * 100) + '% + ' + sh + ' * var(--u))';
          el.style.transformOrigin = (px * 100) + '% ' + ((1 - py) * 100) + '%';
        }
      }
      if (r && (f.all || f.tf)) el.style.transform = (s.rot ? 'rotate(' + (-s.rot) + 'deg) ' : '') + (s.sx !== 1 || s.sy !== 1 ? 'scale(' + s.sx + ',' + s.sy + ')' : '');
      if (f.all || f.on) { el.classList.toggle('off', !s.on); el.style.visibility = s.vis || this.node.n === 'X' ? '' : 'hidden'; if (this.node.n === 'X') el.style.visibility = 'visible'; }
      if (this.img && (f.all || f.col)) {
        const c = s.col, white = c[0] > 0.995 && c[1] > 0.995 && c[2] > 0.995;
        el.style.setProperty('--c', colCss(c));
        el.classList.toggle('white', white);
        el.style.opacity = c[3] >= 1 ? '' : String(c[3]);
        if (this.img.fill) {
          const [, m, o, cw] = this.img.fill;
          el.style.clipPath = m === 4 ? sectorClip(s.fill, o, cw) : linearClip(s.fill, m, o);
        }
      }
      this.f = {};
    }
  }
  function flush() { if (!DIRTY.size) return; for (const n of DIRTY) n.apply(); DIRTY.clear(); }

  function build(node, path, parent, parentEl, reg) {
    const nd = new Nd(node, path, parent);
    if (reg) reg[path] = nd;
    parentEl.appendChild(nd.el);
    if (parent) parent.kids.push(nd);
    for (const k of node.k || []) build(k, path + '/' + k.n, nd, nd.el, reg);
    return nd;
  }
  const sub = (nd, rel) => { let c = nd; for (const p of rel.split('/')) { c = c && c.kids.find(k => k.node.n === p); } return c; };

  // ---------------------------------------------------------------------------------------------- hoạt hình phản hồi (Animator)
  function hermite(keys, t) {
    const n = keys.length;
    if (t <= keys[0][0]) return keys[0][1];
    if (t >= keys[n - 1][0]) return keys[n - 1][1];
    let i = 0; while (i < n - 2 && t >= keys[i + 1][0]) i++;
    const k0 = keys[i], k1 = keys[i + 1], dt = k1[0] - k0[0], s = (t - k0[0]) / dt;
    if (Array.isArray(k0[1])) return k0[1].map((v, j) => v + (k1[1][j] - v) * s);
    const o = k0[3], inn = k1[2];
    if (!isFinite(o) || !isFinite(inn)) return k0[1];
    const s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * k0[1] + (s3 - 2 * s2 + s) * o * dt + (-2 * s3 + 3 * s2) * k1[1] + (s3 - s2) * inn * dt;
  }
  class Anim {
    constructor(clipNames, resolve, idle) {
      this.clips = {}; this.touched = new Map(); this.cur = null; this.t = 0; this.idle = idle || null; this.curName = '';
      for (const n of clipNames) {
        const c = HUI.clips[n]; if (!c) continue;
        const curves = [];
        for (const cv of c.curves) {
          const nd = resolve(cv.path); if (!nd) continue;
          const prop = cv.kind === 'scale' ? 'scale' : cv.kind === 'euler' ? 'rot' : cv.attr;
          curves.push({ nd, prop, keys: cv.keys });
          this.touched.set(nd.path + '|' + prop, [nd, prop]);
        }
        this.clips[n] = { len: c.len, loop: !!c.loop, curves };
      }
    }
    resetAll() {
      for (const [nd, prop] of this.touched.values()) {
        const b = nd.base;
        if (prop === 'scale') { nd.set('sx', b.sx); nd.set('sy', b.sy); }
        else if (prop === 'rot') nd.set('rot', b.rot);
        else if (prop === 'm_AnchoredPosition.x') nd.set('apx', b.apx);
        else if (prop === 'm_AnchoredPosition.y') nd.set('apy', b.apy);
        else if (prop === 'm_IsActive') nd.set('on', b.on);
        else if (prop === 'm_Enabled') nd.set('vis', b.vis);
        else if (prop.indexOf('m_Color.') === 0) nd.setCol(b.col);
      }
    }
    play(name) { if (!this.clips[name]) return; this.resetAll(); this.cur = this.clips[name]; this.curName = name; this.t = 0; this.sample(); }
    stop() { this.resetAll(); this.cur = null; }
    update(dt) {
      if (!this.cur) return;
      this.t += dt;
      if (this.t > this.cur.len) {
        if (this.cur.loop && this.cur.len > 0) this.t %= this.cur.len;
        else {                                                           // clip hết giờ: Hit/Miss quay về Idle (HasExitTime), End giữ khung cuối
          this.t = this.cur.len; this.sample();
          if (this.idle && this.curName !== this.idle && !/End/.test(this.curName)) this.play(this.idle);
          return;
        }
      }
      this.sample();
    }
    sample() {
      const c = this.cur; if (!c) return;
      for (const cv of c.curves) {
        const v = hermite(cv.keys, this.t), nd = cv.nd, p = cv.prop;
        if (p === 'scale') { nd.set('sx', v[0]); nd.set('sy', v[1]); }
        else if (p === 'rot') nd.set('rot', v[2]);
        else if (p === 'm_AnchoredPosition.x') nd.set('apx', v);
        else if (p === 'm_AnchoredPosition.y') nd.set('apy', v);
        else if (p === 'm_IsActive') nd.set('on', v >= 0.5);
        else if (p === 'm_Enabled') nd.set('vis', v >= 0.5);
        else if (p.indexOf('m_Color.') === 0) { const c2 = nd.s.col.slice(); c2['rgba'.indexOf(p[8])] = v; nd.setCol(c2); }
      }
    }
  }

  // ---------------------------------------------------------------------------------------------- phiên hiện tại
  let host = null, catcher = null, leaveBtn = null, VIEW = null, M = null, raf = 0, lastT = 0, TS = 1;
  let ANIM = null, ANIM_D = null, TUT = null, lastTargetPos = 0;     // lastTargetPos: trường của PendulumMinigame, sống suốt ứng dụng
  const CBS = {};                                                    // hàm gọi lại cuối phiên

  function ensureDom() {
    if (host) return;
    host = document.createElement('div'); host.id = 'dr-hv'; host.className = 'dr-ui';
    catcher = document.createElement('div'); catcher.className = 'hv-catch';
    catcher.addEventListener('pointerdown', e => { if (e.button === 2) return; e.preventDefault(); onAction(); });
    catcher.addEventListener('contextmenu', e => e.preventDefault());
    host.appendChild(catcher);
    document.body.appendChild(host);
    VIEW = build(HUI.tree, HUI.tree.n, null, host, NODES);
    VIEW.el.style.pointerEvents = 'none';
    const cont = Q('');
    cont.el.classList.add('hv-slide');
    cont.set('apx', 0);                                                // trạng thái "đang hiện"; ẩn = dịch -100% chiều rộng (DOAnchorPosX(-width))
    // nút nhắc phím = ControlPromptEntry (BasicButtonWrapper): bấm chuột/chạm = nhấn phím
    const frame = Q('Frame');
    frame.el.classList.add('mg-btn');
    Q('Frame/ControlPromptEntry/Backplate').el.classList.add('bp');
    frame.el.addEventListener('pointerdown', e => { if (e.button === 2) return; e.stopPropagation(); e.preventDefault(); onAction(); });
    leaveBtn = document.createElement('button');
    leaveBtn.className = 'dr-btn hv-leave'; leaveBtn.textContent = T.leave;
    leaveBtn.addEventListener('pointerdown', e => e.stopPropagation());
    leaveBtn.addEventListener('click', e => { e.stopPropagation(); leave(); });
    host.appendChild(leaveBtn);
    // Animator của panel đặt trên Container; Ring / Indicator của vòng xoay cá là hai đường dẫn băm trong clip (tools/harvest_ui.py).
    const res = (rel, root2) => {
      if (rel === 'path_0xDFDB0ECB_tjUlINJ') return Q('RadialFishMinigameWheel/Ring');
      if (rel === 'path_0xA6710CB7_WlhLHvH') return Q('RadialFishMinigameWheel/Ring/Indicator');
      return rel === '' ? cont : Q(rel);
    };
    ANIM = new Anim(['HarvestMinigameIdle', 'HarvestMinigameHit', 'HarvestMinigameMiss', 'HarvestMinigameHitSpecial', 'HarvestMinigameEnd', 'HarvestMinigameEndSpecial'], res, 'HarvestMinigameIdle');
    ANIM_D = new Anim(['DredgeMinigameIdle', 'DredgeMinigameHit', 'DredgeMinigameMiss', 'DredgeMinigameEnd'], res, 'DredgeMinigameIdle');
    resize();
  }

  function resize() {
    if (!host) return;
    const W = root.innerWidth, Hh = root.innerHeight;
    USC = Math.max(Hh / 1080, Math.min(0.6, W / 1440));              // [ĐỀ XUẤT] sàn 0,6 cho điện thoại ngang (bản gốc chỉ khớp theo chiều cao)
    host.style.setProperty('--u', USC + 'px');
    flush();
    for (const k in NODES) if (NODES[k].span) NODES[k].fit();
    placeFloaters();
  }
  function placeFloaters() {
    if (!VIEW) return;
    const Hh = root.innerHeight, bottom = Hh / 2 + 160 * USC;           // Container: 320 đơn vị cao, căn giữa dọc, sát mép trái
    leaveBtn.style.left = Math.round(10 * USC) + 'px';
    leaveBtn.style.top = Math.round(bottom + 8 * USC) + 'px';
    const tp = Q('TutorialPopup');
    if (tp) {
      const top = Hh / 2 - 380 * USC;                                   // đỉnh popup gốc: đáy Container + 340 + 200 đơn vị
      if (top < 6) { tp.set('apx', 590); tp.set('apy', 60); }          // [ĐỀ XUẤT] máy thấp: popup sang phải panel thay vì nằm trên
      else { tp.set('apx', tp.base.apx); tp.set('apy', tp.base.apy); }
    }
  }
  root.addEventListener('resize', resize);

  // ---------------------------------------------------------------------------------------------- lõi HarvestMinigame
  function makeCore(opts) {
    const type = opts.type, dredge = type === 'DREDGE_RADIAL';
    const C = {
      type, dredge, cfg: opts.cfg, speed: opts.speed == null ? 1 : opts.speed, progress: 0, running: false, progressDisabled: false, inputEnabled: false,
      hitSpecial: false, penalty: 0, anim: dredge ? ANIM_D : ANIM, ctl: null, mc: null
    };
    C.cls = { FISHING_RADIAL: 'FishMinigame', FISHING_PENDULUM: 'PendulumMinigame', FISHING_BALL_CATCHER: 'BallCatcherMinigame', FISHING_DIAMOND: 'DiamondMinigame', FISHING_SPIRAL: 'SpiralMinigame', DREDGE_RADIAL: 'DredgeMinigame' }[type];
    C.mc = MI[C.cls];
    C.sfx = {
      hit: dredge ? 'fish.dredge.hitNotch' : 'fish.minigame.hit', miss: dredge ? 'fish.dredge.hitNotch' : 'fish.minigame.miss',
      special: dredge ? 'fish.dredge.changeLane' : 'fish.minigame.hit', end: dredge ? 'fish.dredge.complete' : 'fish.end', loop: dredge ? 'fish.dredge.loop' : 'fish.loop'
    };
    const CLIP = dredge ? { start: 'DredgeMinigameIdle', hit: 'DredgeMinigameHit', miss: 'DredgeMinigameMiss', end: 'DredgeMinigameEnd', 'end-special': 'DredgeMinigameEnd', 'hit-special': 'DredgeMinigameHit' }
      : { start: 'HarvestMinigameIdle', hit: 'HarvestMinigameHit', miss: 'HarvestMinigameMiss', 'hit-special': 'HarvestMinigameHitSpecial', end: 'HarvestMinigameEnd', 'end-special': 'HarvestMinigameEndSpecial' };
    C.trigger = n => { C.anim.play(CLIP[n]); };
    C.addProgress = a => { C.progress = clamp(C.progress + a, 0, 1); };
    C.removeProgress = (a, initial) => {
      if (root.DR && DR.s && DR.s.settings && DR.s.settings.noFail) return;       // noFailBehaviour = 1
      C.progress = clamp(C.progress - a, 0, 1);
      if (initial !== false && opts.onProgressRemoved) opts.onProgressRemoved();
    };
    C.disableInput = () => { C.inputEnabled = false; C.ctl.onInputDisabled(); C.penalty = C.mc.inputDisablePenaltySec; };
    return C;
  }
  const NEG = () => COLORS.NEGATIVE, POS = () => COLORS.POSITIVE, VAL = () => COLORS.VALUABLE, DIS = () => COLORS.DISABLED;

  function tgtShow(nd, ang, width, col) { nd.set('on', true); nd.set('rot', ang + width * 0.5); nd.set('fill', width / 360); nd.setCol(col); }

  // ---- FISHING_RADIAL (FishMinigame.cs)
  function Radial(C) {
    const c = C.cfg, imgs = C.mc.targetImages.map(p => NODES[p]), ind = NODES[C.mc.indicatorObject];
    let tc = [], angle = 0, prev = Infinity, trophyShowing = false, specialIdx = -1, hitThis = [];
    const clear = () => imgs.forEach(n => { n.set('on', false); n.setCol(POS()); });
    const upd = () => { angle = norm360(angle); ind.set('rot', angle); };
    return {
      prepare() { },
      reset() { angle = 0; upd(); prev = Infinity; hitThis = []; clear(); tc = []; },
      start(showTargets, trophy) {
        trophyShowing = trophy;
        if (!showTargets) return;
        const n = randInt(c.minTargets, c.maxTargets), slot = (360 - 60) / n;
        tc = [];
        for (let i = 0; i < n; i++) {
          const t = { special: false };
          if (trophy && i === 1) { t.special = true; specialIdx = i; t.w = c.specialTargetWidth; } else t.w = rint(c.minTargetWidth, c.maxTargetWidth);
          const mid = slot * i + slot * 0.5, span = slot - t.w - 20;
          t.a = rand(mid - span * 0.5, mid + span * 0.5);
          tc.push(t);
        }
        tc.forEach((t, j) => tgtShow(imgs[j], t.a, t.w, t.special ? VAL() : POS()));
      },
      update(dt) {
        angle += -c.rotationSpeed * dt; upd();
        if (prev < angle) { hitThis = []; if (trophyShowing) { imgs[specialIdx].set('on', false); trophyShowing = false; } }
        prev = angle;
      },
      press() {
        for (let i = 0; i < tc.length; i++) {
          const t = tc[i];
          if (t.special && !trophyShowing) continue;
          const cur = norm360(angle);
          if (cur > t.a - t.w * 0.5 && cur < t.a + t.w * 0.5 && !hitThis.includes(i)) {
            hitThis.push(i);
            if (t.special) { imgs[specialIdx].set('on', false); return 'special'; }
            return 'hit';
          }
        }
        return 'miss';
      },
      onInputDisabled() { imgs.forEach(n => n.setCol(NEG())); },
      onInputReenabled() { tc.forEach((t, i) => imgs[i].setCol(t.special ? VAL() : POS())); },
      debug: () => ({ angle: norm360(angle), speed: -c.rotationSpeed, targets: tc.map(t => ({ a: t.a, w: t.w, special: t.special })), trophyShowing, hitThis: hitThis.slice() })
    };
  }

  // ---- FISHING_PENDULUM (PendulumMinigame.cs)
  function Pendulum(C) {
    const c = C.cfg, mc = C.mc, arc = mc.segmentAngleArcHalfWidth, pend = NODES[mc.pendulumObject], segs = mc.segments.map(p => NODES[p]), tg = mc.segmentTargets.map(p => NODES[p]);
    const segRot = segs.map(s => norm360(s.rt.rot));                    // Transform.eulerAngles.z: -120 -> 240
    let n = 1, active = 0, ind = 0, right = true, hitSwing = false, tc = [], trophyRound = false, specialCounter = 0;
    const start = i => segRot[i] + arc, end = i => segRot[i] - arc;
    const redraw = () => pend.set('rot', ind);
    function gen(i) {
      const t = { special: false };
      if (trophyRound) { specialCounter--; if (specialCounter <= 0) { t.special = true; trophyRound = false; } }
      t.w = t.special ? c.specialTargetWidth : rint(c.minTargetWidth, c.maxTargetWidth);
      tc[i] = t;
      const half = t.w * 0.5, span = arc - half;
      let pos = 0;
      if (n === 1) {
        let k = 0;
        do { k++; pos = lastTargetPos < 0 ? rand(0, span) : (!(lastTargetPos > 0) ? rand(-span, span) : rand(-span, 0)); } while (k < 10 && Math.abs(lastTargetPos) - Math.abs(pos) < arc * 0.5);
      } else pos = rand(-span, span);
      lastTargetPos = pos;
      t.local = pos + half;                                              // localEulerAngles z của ảnh mục tiêu
      tg[i].set('rot', t.local); tg[i].set('fill', t.w / 360); tg[i].setCol(t.special ? VAL() : POS()); tg[i].set('on', true);
    }
    function next() {
      hitSwing = false;
      const was = active; gen(active);
      active = (((active + (right ? 1 : -1)) % n) + n) % n;
      if (active !== was) { ind = right ? start(active) : end(active); }
    }
    return {
      prepare() {
        n = clamp(c.numPendulumSegments || 1, 1, 3);
        for (let i = 0; i < 3; i++) segs[i].set('on', i < n);
        active = 0; ind = start(0); redraw(); right = true; hitSwing = false;
      },
      reset() { ind = start(active); redraw(); tg.forEach(t => { t.set('on', false); t.setCol(POS()); }); tc = []; },
      start(showTargets, trophy) {
        trophyRound = trophy; specialCounter = mc.notchesUntilSpecialNotchCanSpawn; tc = new Array(n).fill(null);
        if (showTargets) for (let i = 0; i < n; i++) gen(i);
      },
      update(dt) {
        if (right) { ind -= c.rotationSpeed * dt; if (ind < end(active)) { right = false; hitSwing = false; } }
        else { ind += c.rotationSpeed * dt; if (ind > start(active)) { right = true; hitSwing = false; } }
        redraw();
      },
      press() {
        const t = tc[active];
        if (t) {
          const test = norm180(ind), z = norm360(segRot[active] + t.local);
          if (isBetween(test, norm180(z), norm180(z - t.w)) && !hitSwing) {
            hitSwing = true;
            return t.special ? 'special' : 'hit';
          }
        }
        return 'miss';
      },
      afterHit(prog) { if (prog < 1) next(); },
      onInputDisabled() {
        if (trophyRound) trophyRound = false;
        for (let i = 0; i < n; i++) if (tc[i]) { if (tc[i].special) gen(i); tg[i].setCol(NEG()); }
      },
      onInputReenabled() { for (let i = 0; i < n; i++) if (tc[i]) tg[i].setCol(tc[i].special ? VAL() : POS()); },
      debug: () => ({ angle: ind, norm: norm180(ind), right, active, segments: n, segRot, hitSwing, targets: tc.map((t, i) => t && { w: t.w, local: t.local, world: norm360(segRot[i] + t.local), special: t.special }) })
    };
  }

  // ---- DREDGE/FISHING nhỏ: dựng nút từ prefab
  function prefabNode(name, parentNd) {
    const P = HUI.prefabs[name], p = parentNd;
    const wrap = Object.assign({}, P);
    return build(wrap, p.path + '/' + name, p, p.el, null);
  }
  function stripGone(nd) { if (nd.el.parentNode) nd.el.parentNode.removeChild(nd.el); if (nd.parent) nd.parent.kids = nd.parent.kids.filter(k => k !== nd); DIRTY.delete(nd); }

  // ---- FISHING_BALL_CATCHER (BallCatcherMinigame.cs + BallCatcherBall.cs)
  function BallCatcher(C) {
    const c = C.cfg, mc = C.mc, zoneNd = NODES[mc.targetZoneImage], cont = NODES[mc.ballContainer];
    const BP = HUI.prefabs.BallCatcherBall, launcher = (BP.c.find(x => x.script === 'BallCatcherBall') || {}).launcherAngle || 155;
    let balls = [], zMin = 0, zMax = 0, state = 'NONE', pattern = null, idx = 0, ballDelay = 0, patDelay = 0, showTrophy = false;
    const pats = c.ballCatcherPatterns || [];
    const gen = () => { pattern = pats[Math.floor(Math.random() * pats.length)]; idx = 0; patDelay = mc.basePatternDelaySec / c.speedFactor; state = 'WAITING'; };
    function kill(b) { stripGone(b.nd); balls = balls.filter(x => x !== b); }
    function setType(b, type) {
      b.type = type;
      const im = b.nd.kids[0];
      const spr = type === 'OBSTACLE' ? (BP.c.find(x => x.script === 'BallCatcherBall').negativeBallSprite) : (BP.c.find(x => x.script === 'BallCatcherBall').regularBallSprite);
      im.el.style.setProperty('--s', 'url(' + spriteUrl(spr) + ')');
      im.setCol(type === 'OBSTACLE' ? NEG() : type === 'SPECIAL' ? VAL() : POS());
    }
    return {
      prepare() {
        zMin = norm180(-c.targetZoneDegrees * 0.5); zMax = norm180(c.targetZoneDegrees * 0.5);
        zoneNd.set('fill', c.targetZoneDegrees / 360); zoneNd.set('rot', zMax);
      },
      reset() { balls.slice().forEach(kill); state = 'NONE'; },
      start(showTargets, trophy) {
        showTrophy = trophy;
        if (showTargets) gen(); else state = 'NONE';
        ballDelay = 0; patDelay = 0;
      },
      update(dt) {
        if (state === 'FIRING' || state === 'FINISHING') {
          ballDelay -= dt;
          if (ballDelay <= 0) { if (state === 'FIRING') fire(); else state = 'FINISHED'; }
        }
        if (state === 'FINISHED') gen();
        if (state === 'WAITING') { patDelay -= dt; if (patDelay < 0) state = 'FIRING'; }
        for (const b of balls.slice()) {                                 // BallCatcherBall.Update
          b.ang = norm180(b.rot);
          if (!b.gone) {
            if ((b.dir === 'LEFT' && b.ang < zMin) || (b.dir === 'RIGHT' && b.ang > zMax)) { b.gone = true; b.nd.kids[0].setCol([1, 1, 1, 0.15]); }
          }
          b.rot += b.speed * dt; b.nd.set('rot', b.rot);
          if ((b.dir === 'LEFT' && b.ang < -launcher) || (b.dir === 'RIGHT' && b.ang > launcher)) kill(b);
        }
      },
      press() {
        const list = balls.filter(b => !b.gone && isBetween(norm180(b.rot), zMin, zMax));
        let best = 'miss';
        if (!list.some(b => b.type === 'OBSTACLE')) for (const b of list) {
          const r = b.type === 'SPECIAL' ? 'special' : 'hit';
          if ((best === 'miss' && r !== 'miss') || (best === 'hit' && r === 'special')) best = r;
        }
        list.forEach(kill);
        return best;
      },
      onInputDisabled() { balls.forEach(b => { if (!b.gone) b.nd.kids[0].setCol(NEG()); }); },
      onInputReenabled() { balls.forEach(b => { if (!b.gone) setType(b, b.type); }); },
      debug: () => ({ zone: [zMin, zMax], state, balls: balls.map(b => ({ type: b.type, dir: b.dir, ang: norm180(b.rot), speed: b.speed, gone: b.gone })) })
    };
    function fire() {
      const cfg = pattern[idx]; let type = cfg.ballType, speed = mc.baseSpeed * c.speedFactor;
      if (showTrophy) { type = 'SPECIAL'; speed /= c.ballTrophySpeedFactor; showTrophy = false; }
      const left = cfg.direction === 'LEFT';
      const nd = prefabNode('BallCatcherBall', cont);
      const b = { nd, type, dir: cfg.direction, rot: left ? launcher : -launcher, speed: left ? -speed : speed, gone: false, ang: 0 };
      nd.set('rot', b.rot); setType(b, type);
      balls.push(b); idx++;
      ballDelay = cfg.delayBeforeNextBall / c.speedFactor;
      if (idx > pattern.length - 1) state = 'FINISHING';
    }
  }

  // ---- FISHING_DIAMOND (DiamondMinigame.cs + DiamondMinigameTarget.cs)
  function Diamond(C) {
    const c = C.cfg, mc = C.mc, cont = NODES[mc.targetContainer], DP = HUI.prefabs.DiamondTarget;
    const dc = DP.c.find(x => x.script === 'DiamondMinigameTarget');
    let tg = [], state = 'NONE', wait = 0;
    function fire(trophy) {
      let T = c.diamondScaleUpTimeSec; if (trophy) T *= c.diamondTrophySpeedFactor;
      const nd = prefabNode('DiamondTarget', cont);
      const t = { nd, T, life: 0, special: !!trophy, inPlay: true, dismiss: null, limit: mc.thresholdMax, from: c.diamondRotation, scale: 0 };
      nd.set('sx', 0); nd.set('sy', 0); nd.setCol(trophy ? VAL() : POS());
      tg.push(t);
      wait = rand(c.timeBetweenDiamondTargetsMin, c.timeBetweenDiamondTargetsMax); state = 'WAITING';
    }
    function dismiss(t, success) {
      if (!success) t.nd.setCol(NEG());
      t.inPlay = false; t.dismiss = { t: 0, from: t.scale, a: t.nd.s.col[3] };
    }
    const hits = s => s > mc.thresholdMin && s < mc.thresholdMax;
    return {
      prepare() { },
      reset() { tg.forEach(t => stripGone(t.nd)); tg = []; state = 'NONE'; },
      start(showTargets, trophy) { state = showTargets ? 'FIRING' : 'NONE'; if (trophy) fire(true); },
      update(dt) {
        if (state === 'WAITING') { wait -= dt; if (wait <= 0) state = 'FIRING'; }
        if (state === 'FIRING') fire(false);
        for (const t of tg.slice()) {
          t.life += dt;
          if (t.inPlay) {
            const k = clamp(t.life / t.T, 0, 1e9), s = k * t.limit;      // scaleCurve tuyến tính (prefab: (0,0) -> (1,1), dốc 1)
            t.scale = s; t.nd.set('sx', s); t.nd.set('sy', s);
            t.nd.set('rot', -t.from * (1 - outQuad(clamp(t.life / t.T, 0, 1))));   // DORotate(0).From(-angle): OutQuad
            if (s >= t.limit) dismiss(t, false);
          } else if (t.dismiss) {
            const d = t.dismiss; d.t += dt;
            const sc = d.from + (dc.dismissScale - d.from) * outQuad(clamp(d.t / dc.dismissScaleDurationSec, 0, 1));
            t.scale = sc; t.nd.set('sx', sc); t.nd.set('sy', sc);
            const col = t.nd.s.col.slice(); col[3] = d.a * (1 - clamp(d.t / dc.dismissFadeDurationSec, 0, 1)); t.nd.setCol(col);
            if (d.t >= dc.dismissScaleDurationSec) { stripGone(t.nd); tg = tg.filter(x => x !== t); }
          }
        }
      },
      press() {
        const list = tg.filter(t => t.inPlay && hits(t.scale));
        let res = 'miss';
        for (const t of tg) {                                            // TryHitTarget duyệt MỌI mục tiêu, kể cả cái đang tan
          const r = hits(t.scale) ? (t.special ? 'special' : 'hit') : 'miss';
          if ((res === 'miss' && r !== 'miss') || (res === 'hit' && r === 'special')) res = r;
        }
        list.forEach(t => dismiss(t, true));
        return res;
      },
      onInputDisabled() { tg.forEach(t => t.nd.setCol(NEG())); },
      onInputReenabled() { tg.forEach(t => { if (t.inPlay) t.nd.setCol(t.special ? VAL() : POS()); }); },
      debug: () => ({ min: mc.thresholdMin, max: mc.thresholdMax, targets: tg.map(t => ({ s: t.scale, T: t.T, special: t.special, inPlay: t.inPlay })) })
    };
  }

  // ---- FISHING_SPIRAL (SpiralMinigame.cs + SpiralComponent.cs)
  function Spiral(C) {
    const c = C.cfg, mc = C.mc, sc = mc.spiralConfig, spNd = NODES[mc.spiralImage], gates = NODES[mc.gateContainer], ball = NODES[mc.ballSpiralComponent];
    const RING = colArr('#8b3636'), imgEl = spNd.el;                      // _ring_color của SpiralMinigameRing_Mat
    let notches = [], gs = [], gateNds = [], prop = 0, forward = true, blocking = 0, justOpened = -1, prevGate = 0, nextGate = 0, trophyIdx = -1, showTargets = false, showTrophy = false;
    const overlay = document.createElement('div');                        // tô notch lên đường xoắn (shader _notchN_start/_end/_color)
    overlay.className = 'mg-n sp-ov'; overlay.style.cssText = 'inset:0;pointer-events:none';
    imgEl.appendChild(overlay);
    // Sprite 50PercentSpiral KHÔNG kéo giãn vào RectTransform 280x280: đường xoắn của SpiralComponent (r 127 -> 63,5) chỉ trùng nét sprite khi vẽ nó
    // đúng cỡ tự nhiên (ppu 200 -> 240 x 255,5 đơn vị) với pivot (0,4625; 0,4696) đặt giữa khung (khớp bình phương tối thiểu: trùng 100% điểm trên đường cong).
    function pos(p) {                                                     // SpiralComponent.SetPosition (toạ độ đơn vị canvas, y lên)
      let a = (p * sc.totalDegrees + sc.startAngleOffset) * Math.PI / 180 * sc.direction;
      const r = sc.startRadius + (sc.endRadius - sc.startRadius) * p;
      return [r * Math.cos(a), r * Math.sin(a)];
    }
    const rotOf = p => (p * sc.totalDegrees + sc.startAngleOffset) * sc.direction;   // cục bộ: world = cục bộ + baseGameRotation (CircleFrame xoay 75)
    function setNotchCol(i, col) { if (notches[i]) notches[i].col = col; paint(); }
    function paint() {
      // vẽ vòng xoắn: sprite 50PercentSpiral nhân _ring_color; mỗi notch là một lớp mask theo đoạn đường xoắn
      const W = 280, sz = W, svg = [];
      notches.forEach((n, i) => {
        const pts = []; const a = n.x, b = n.x + n.y, steps = Math.max(6, Math.ceil((b - a) * 120));
        for (let k = 0; k <= steps; k++) { const p = pos(a + (b - a) * k / steps); pts.push((sz / 2 + p[0]).toFixed(1) + ',' + (sz / 2 - p[1]).toFixed(1)); }
        svg.push('<polyline points="' + pts.join(' ') + '" stroke="' + colCss(n.col) + '" stroke-width="17" fill="none" stroke-linecap="butt"/>');
      });
      // overlay nằm TRONG CircleFrame (đã xoay baseGameRotation) nên dùng đúng hệ toạ độ cục bộ của SpiralComponent
      overlay.innerHTML = notches.length ? '<svg viewBox="0 0 ' + sz + ' ' + sz + '" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible">' + svg.join('') + '</svg>' : '';
    }
    function refreshPrev() { prevGate = blocking === 0 ? 0 : notches[blocking - 1].x + notches[blocking - 1].y + mc.preAndPostGateBufferProp; }
    function refreshNext() { nextGate = blocking === notches.length ? 1 : notches[blocking].x + notches[blocking].y - mc.preAndPostGateBufferProp; }
    const notchAt = p => { for (let i = 0; i < notches.length; i++) { const n = notches[i]; if (p >= n.x - mc.preNotchPadding && p <= n.x + n.y) return i; } return -1; };
    const place = () => { const p = pos(prop); ball.set('apx', p[0]); ball.set('apy', p[1]); };
    return {
      prepare() { gates.kids.slice().forEach(stripGone); /* 5 bản SpiralGate(Clone) dính sẵn trong cảnh editor */ spNd.set('rot', sc.baseGameRotation); spNd.setCol(RING); spNd.el.classList.add('sp-nat'); },
      reset() {
        gateNds.forEach(stripGone); gateNds = []; notches = []; gs = []; overlay.innerHTML = '';
        blocking = 0; prop = 0; place(); forward = true; justOpened = -1;
      },
      start(st, trophy) {
        showTargets = st; showTrophy = trophy; forward = true;
        notches = []; gs = new Array(mc.maxNumNotches).fill(false);
        if (st) {
          const n = c.spiralNumNotches, slot = 1 / n;
          for (let i = 0; i < n; i++) {
            const y = rand(c.spiralMinNotchWidth, c.spiralMaxNotchWidth);
            const mn = i === 0 ? mc.startDeadzone : 0, mx = i === n - 1 ? slot - mc.endDeadzone - y : slot - y;
            notches.push({ x: rand(mn, mx) + slot * i, y, col: POS() });
          }
          trophyIdx = trophy ? 1 : -1;
          notches.forEach((n, i) => {
            if (i === trophyIdx) n.col = VAL();
            const g = prefabNode('SpiralGate', gates), end = n.x + n.y, p = pos(end);
            g.set('apx', p[0]); g.set('apy', p[1]); g.set('rot', rotOf(end));
            g.anim = new Anim(['SpiralGateIdleClosed', 'SpiralGateIdleOpen', 'SpiralGateOpening', 'SpiralGateClosing'], rel => !rel ? g : sub(g, rel));
            g.anim.play('SpiralGateIdleClosed');
            gateNds.push(g);
          });
          paint();
        }
        blocking = 0; justOpened = -1; refreshPrev(); refreshNext();
      },
      update(dt) {
        if (forward && prop > nextGate && (blocking >= gs.length || !gs[blocking])) { forward = false; play('fish.spiral.gateHit'); }
        else if (!forward && prop < prevGate) { forward = true; play('fish.spiral.gateHit'); }
        prop += (forward ? 1 : -1) * mc.baseSpeed * c.spiralRotationSpeed * dt;
        if (prop >= 1 && showTargets) { C.addProgress(1); prop = 1; }
        place();
        if (justOpened !== -1 && prop > notches[justOpened].x + notches[justOpened].y) {
          gateNds[justOpened].anim.play('SpiralGateClosing'); play('fish.spiral.gateClose'); justOpened = -1; refreshPrev();
        }
        gateNds.forEach(g => g.anim.update(dt));
      },
      press() {
        const i = notchAt(prop);
        if (i === -1) return 'miss';
        if (trophyIdx === i) return 'special';
        if (!gs[i]) { this.opened = i; return 'hit'; }
        return 'miss';
      },
      onHit(prog) {
        const i = this.opened;
        gateNds[i].anim.play('SpiralGateOpening'); setNotchCol(i, DIS()); gs[i] = true; justOpened = i; blocking++; refreshNext(); play('fish.spiral.gateOpen');
      },
      onMiss() { trophyIdx = -1; },
      hitFactor: () => c.spiralValueFactor,
      onInputDisabled() { notches.forEach(n => { n.savedCol = n.col; n.col = DIS(); }); paint(); },
      onInputReenabled() { notches.forEach((n, i) => { n.col = gs[i] ? DIS() : POS(); if (i === trophyIdx && !gs[i]) n.col = VAL(); }); paint(); },
      debug: () => ({ prop, forward, blocking, trophyIdx, notches: notches.map((n, i) => ({ x: n.x, y: n.y, open: !!gs[i] })), ball: pos(prop), prev: prevGate, next: nextGate, pos })
    };
  }

  // ---- DREDGE_RADIAL (DredgeMinigame.cs)
  function Dredge(C) {
    const c = C.cfg, mc = C.mc, oT = mc.outerTargetImages.map(p => NODES[p]), iT = mc.innerTargetImages.map(p => NODES[p]);
    const oRing = NODES[mc.outerRing], iRing = NODES[mc.innerRing], oImg = NODES[mc.outerRingImage], iImg = NODES[mc.innerRingImage], oInd = NODES[mc.outerIndicator], iInd = NODES[mc.innerIndicator];
    const ACT = colArr(mc.activeRingColor), INACT = colArr(mc.inactiveRingColor);
    let inner = false, offset = 0, until = 0, ot = [], it = [];
    const blk = nd => { nd.set('on', false); nd.setCol([0, 0, 0, 1]); };
    const rings = () => { offset = norm360(offset); iRing.set('rot', offset); oRing.set('rot', offset); };
    const lanes = () => { iInd.set('on', inner); oInd.set('on', !inner); };
    const ang = () => norm360(-offset);
    const overlap = () => (inner ? it : ot).some(t => { const a = ang(); return a > t.a - t.w * 0.5 && a < t.a + t.w * 0.5; });
    function cfgImg(img, t) { img.set('on', true); img.set('rot', t.a + t.w * 0.5); img.set('fill', t.w / 360); }
    return {
      prepare() { },
      reset() { inner = false; offset = 0; rings(); lanes(); oT.concat(iT).forEach(blk); ot = []; it = []; until = 0; },
      start(showTargets) {
        oT.concat(iT).forEach(blk);
        ot = []; it = [];
        if (!showTargets) return;
        const n = randInt(c.minTargets, c.maxTargets), slot = (360 - 60) / n;
        let flag = true;
        for (let i = 0; i < n; i++) {
          const t = { w: rint(c.minTargetWidth, c.maxTargetWidth) * mc.widthFactor };
          const mid = slot * i + slot * 0.5, span = slot - t.w - 20;
          t.a = rand(mid - span * 0.5, mid + span * 0.5);
          if (i === n - 1) flag = true; else if (Math.random() < 0.9) flag = !flag;
          (flag ? it : ot).push(t);
        }
        ot.forEach((t, j) => cfgImg(oT[j], t)); it.forEach((t, j) => cfgImg(iT[j], t));
      },
      update(dt) {
        offset += c.rotationSpeed * dt; rings();
        if (overlap()) {
          if (!C.progressDisabled) {
            C.removeProgress(c.targetValue); C.trigger('miss'); play(C.sfx.hit); until = C.mc.inputDisablePenaltySec;
          }
          C.progressDisabled = true;
          C.removeProgress(0.01 * dt * 60, false);                        // RemoveProgress(0.01f) MỖI KHUNG trong mã gốc: quy về 60 khung/giây
        }
        until -= dt;
        if (until <= 0) C.progressDisabled = false;
        iImg.setCol(inner ? ACT : INACT); oImg.setCol(inner ? INACT : ACT);   // LateUpdate
      },
      press() { inner = !inner; lanes(); play(C.sfx.special); return 'lane'; },
      onInputDisabled() { }, onInputReenabled() { },
      debug: () => ({ angle: ang(), speed: c.rotationSpeed, offset, inner, outer: ot.map(t => ({ a: t.a, w: t.w })), innerT: it.map(t => ({ a: t.a, w: t.w })), overlap: overlap() })
    };
  }
  const CTL = { FISHING_RADIAL: Radial, FISHING_PENDULUM: Pendulum, FISHING_BALL_CATCHER: BallCatcher, FISHING_DIAMOND: Diamond, FISHING_SPIRAL: Spiral, DREDGE_RADIAL: Dredge };

  // ---------------------------------------------------------------------------------------------- HarvestMinigameView
  const BUCKET = s => { const n = Math.floor(s); return n >= 5 ? 'high' : n >= 3 ? 'medium' : n > 0 ? 'low' : 'none'; };
  const itemOf = id => (root.DR_ITEMS && DR_ITEMS[id]) || null;
  const itemSize = d => d && d.dims ? d.dims.length : 4;

  function setHint(show, id, silhouette) {
    const hint = Q('HintImage'), img = Q('HintImage/Image'), d = itemOf(id);
    hint.set('on', !!show && !!d);
    if (!d) return;
    const trinket = String(d.subtype) === 'TRINKET';
    const src = trinket && silhouette ? spriteUrl('QuestionMark') : URLB(d.sprite);
    img.el.style.setProperty('--s', 'url(' + src + ')');
    img.el.classList.remove('mg-i'); img.el.style.background = 'var(--s) center / contain no-repeat';
    img.el.style.filter = silhouette ? 'brightness(0) invert(1)' : '';
    img.el.style.opacity = silhouette ? '0.24' : '';
    const small = itemSize(d) === 1;
    hint.set('sx', small && !trinket ? 0.5 : 1); hint.set('sy', small && !trinket ? 0.5 : 1);
    const spiral = M && M.type === 'FISHING_SPIRAL';                      // HarvestMinigameView.RefreshHarvestTarget: offsetMin/Max theo loại
    img.rt.sd = spiral ? [-50, -20] : [-20, -20]; img.set('apx', spiral ? 5 : 0); img.set('apy', spiral ? 10 : 0); img.touch('all');
  }

  function refreshInfo(o) {
    const info = o.info || {}, dredgeSpot = info.kind === 'dredge' || M.dredge;
    Q('Title').setText(dredgeSpot ? T.title.dredge : T.title.fish);
    const b = BUCKET(info.stock == null ? 3 : info.stock);
    Q('StockText').setText(T.stock[b], { color: T.stockColor[b] });
    const tag = Q('HarvestableTypeTag'), tg = HUI.tags[info.harvestType || 'NONE'] || HUI.tags.NONE;
    tag.setCol(colArr(tg.col)); Q('HarvestableTypeTag/Text').setText(T.type[info.harvestType] || '', { color: tg.text });
    Q('HarvestableTypeTag/AdvancedTypeIcon').set('on', !!info.advanced);
    Q('HarvestableTypeTag').set('on', !!info.harvestType);
    const bad = info.status && info.status !== 'ok';
    Q('InvalidEquipmentIndicator').set('on', !!bad && /equipment|rod|advanced/.test(info.status));
    Q('BrokenMinigameOverlay').set('on', !!info.broken);
  }

  function showPrompt(mode) {                                           // 'start' | 'pull' | 'none'
    const fr = Q('Frame'), txt = Q('Frame/ControlPromptEntry/Text');
    const on = mode !== 'none';
    fr.set('on', on);
    if (on) {
      txt.setText(mode === 'start' ? (M.dredge ? T.start.dredge : T.start.fish) : T.pull);
      const icon = Q('Frame/ControlPromptEntry/ControlPromptContainer/ControlPromptIcon1');
      sub(icon, 'HoldActionBack').set('on', false); sub(icon, 'HoldActionFill').set('on', false); sub(icon, 'HoldDelegateAction').set('on', false);
      const k = sub(icon, 'Icon'); k.el.style.setProperty('--s', 'url(' + spriteUrl('keyboard-icon-f') + ')'); k.set('on', true);
      const q2 = Q('Frame/ControlPromptEntry/ControlPromptContainer/ControlPromptIcon2'); if (q2) q2.set('on', false);
    }
    fr.el.classList.toggle('shiny', mode === 'start');
    fr.el.classList.toggle('dis', !on);
  }

  function showWheel(type) {
    for (const [t, n] of Object.entries(WHEEL)) { const nd = Q(n); if (nd) nd.set('on', t === type); }
  }

  function tutorial(show) {
    const tp = Q('TutorialPopup'), tx = Q('TutorialPopup/TutorialText');
    if (!show) { tp.set('on', false); return; }
    const k = '<span class="kc" style="--k:url(' + spriteUrl('keyboard-icon-f-line') + ')"></span>';
    tx.setText((T.tut[M.type] || '').replace('{k}', k));
    tp.set('on', true); tp.el.classList.remove('hv-pop'); void tp.el.offsetWidth; tp.el.classList.add('hv-pop');
    placeFloaters();
  }

  function setPhase(p) { M.phase = p; }

  function open(opts) {
    if (!HUI) return false;
    if (M) closeNow(true);
    ensureDom();
    host.classList.add('on');
    resize();
    const type = WHEEL[opts.type] ? opts.type : 'FISHING_RADIAL';
    M = { opts, type, dredge: type === 'DREDGE_RADIAL', phase: 'prestart', t: 0, doneT: 0, wasTutorial: false, revealT: 0, closing: false };
    setupSession(opts);
    const cont = Q('');
    cont.el.classList.remove('in'); void cont.el.offsetWidth;
    requestAnimationFrame(() => { if (M) cont.el.classList.add('in'); placeFloaters(); });
    leaveBtn.style.display = '';
    cancelAnimationFrame(raf); lastT = performance.now(); raf = requestAnimationFrame(tick);
    flush();
    return true;
  }

  function setupSession(opts) {                                         // dùng chung cho open() và refresh()
    const type = M.type;
    M.opts = opts; M.item = itemOf(opts.itemId);
    M.core = makeCore(Object.assign({}, opts, { type }));
    const C = M.core;
    showWheel(type);
    // hình ảnh/đối tượng phụ của panel về trạng thái nghỉ
    for (const p of ['NegativePulseRing', 'PositivePulseRing', 'TrophyPulseRing', 'Line', 'OozeOverlay', 'StartText']) { const n = Q(p); if (n) n.set('on', false); }
    ['ProgressBar'].forEach(p => Q(p).set('on', false));
    Q('ProgressBar/FishIcon').el.style.setProperty('--s', 'url(' + spriteUrl(M.dredge ? 'DredgingChestIcon' : 'FishingFishIcon') + ')');
    Q('ProgressBar/FishIcon').setCol([1, 1, 1, 1]);
    Q('ProgressBar/Bar').setCol([1, 1, 1, 1]);
    C.anim.stop();
    tutorial(false);
    const info = opts.info || {};
    refreshInfo(opts);
    C.ctl = CTL[type](C);
    C.ctl.prepare(); C.ctl.reset();
    const bad = info.status && info.status !== 'ok';
    const lock = !!info.locked;
    setHint(!bad && !lock, opts.itemId, true);
    Q('CannotStartText').set('on', !!bad);
    if (bad) Q('CannotStartText').setText(T.cannot[info.status] || '', { color: COLORS.NEGATIVE ? colCss(COLORS.NEGATIVE) : '#dc2c38' });
    showPrompt(bad || lock ? 'none' : 'start');
    updateBar();
    M.phase = 'prestart';
    catcher.classList.remove('on');
    if (opts.autostart) startGame();
  }

  function updateBar() {
    const C = M && M.core, p = C ? clamp(C.progress, 0, 1) : 0;
    Q('ProgressBar/Bar').set('fill', 1 - p);
    Q('ProgressBar/FishIcon').set('apy', -115 + 230 * p);              // Lerp(progressBarIconMaxY, MinY, Progress): ±115 suy từ bố cục
  }

  function startGame() {
    if (!M || M.phase !== 'prestart') return;
    const C = M.core, o = M.opts, info = o.info || {};
    if (info.status && info.status !== 'ok') return;
    M.phase = 'running'; M.t = 0;
    const key = 'played-minigame-type-' + M.type;
    const vars = root.DR && DR.s && DR.s.vars;
    M.wasTutorial = !!(vars && !vars[key]);
    tutorial(M.wasTutorial);
    Q('ProgressBar').set('on', true); Q('ProgressBar/FishIcon').set('on', true);
    showPrompt('pull');
    const trophy = !C.dredge && !!(o.rollTrophy ? o.rollTrophy() : o.trophy);
    M.trophyShown = trophy;
    C.hitSpecial = false;
    C.ctl.reset();
    C.ctl.start(!info.broken, trophy);
    C.running = true; C.inputEnabled = true;
    try { root.DRAudio && DRAudio.loop(C.sfx.loop, 1); } catch (e) { /* tiếng là phần phụ */ }
    C.trigger('start');
    catcher.classList.add('on');
    leaveBtn.style.display = 'none';
  }

  function onAction() {
    if (!M) return;
    if (M.phase === 'prestart') { startGame(); return; }
    if (M.phase === 'reveal') { M.revealT = 99; return; }
    if (M.phase !== 'running') return;
    const C = M.core;
    if (!C.running) return;
    pressMini();
  }

  function pressMini() {                                                // OnMinigameInteractPress của từng lớp
    const C = M.core;
    if (!C.dredge && !C.inputEnabled) return;
    if (C.dredge && !C.inputEnabled) return;
    const ctl = C.ctl, cfg = C.cfg;
    const r = ctl.press();
    if (C.dredge) { return; }
    const spiral = C.type === 'FISHING_SPIRAL';
    let trig;
    if (r === 'special') { C.addProgress(1); trig = 'hit-special'; C.hitSpecial = true; }
    else if (r === 'hit') {
      const f = spiral ? cfg.spiralValueFactor : 1;
      C.addProgress(cfg.targetValue * C.speed * f); trig = 'hit';
      if (spiral && ctl.onHit) ctl.onHit(C.progress);
      if (C.progress < 1) { play(C.sfx.hit); if (ctl.afterHit) ctl.afterHit(C.progress); }
    } else {
      const f = C.type === 'FISHING_BALL_CATCHER' || C.type === 'FISHING_DIAMOND' ? (cfg.valueFactor == null ? 1 : cfg.valueFactor) : 1;
      if (C.mc.removeProgressOnMiss) C.removeProgress(cfg.targetValue * f);
      if (ctl.onMiss) ctl.onMiss();
      trig = 'miss'; play(C.sfx.miss);
      C.disableInput();
    }
    M.lastTrig = trig;
    C.trigger(trig);
  }

  // --- vòng lặp
  function step(dt) {
    const C = M.core;
    if (M.phase === 'running' && C.running) {
      M.t += dt;
      if (C.penalty > 0) { C.penalty -= dt; if (C.penalty <= 0) { C.ctl.onInputReenabled(); C.progressDisabled = false; C.inputEnabled = true; } }
      if (C.penalty > 0 && !C.dredge) C.progressDisabled = true;
      C.ctl.update(dt);
      // HarvestMinigame.Update: tiến độ thụ động
      if (!C.progressDisabled) C.progress += dt / (C.dredge ? C.cfg.secondsToPassivelyCatch / C.speed : C.cfg.secondsToPassivelyCatch);
      updateBar();
      if (C.progress >= 1) complete();
    }
  }
  function complete() {
    const C = M.core;
    C.running = false; M.phase = 'ending'; M.doneT = 0;
    try { root.DRAudio && DRAudio.stopLoop(C.sfx.loop); } catch (e) { /* tiếng là phần phụ */ }
    play(C.sfx.end);
    C.trigger(C.hitSpecial ? 'end-special' : 'end');
    C.ctl.reset();                                                      // ClearTargetImages
    Q('ProgressBar/FishIcon').set('on', false);
    showPrompt('none');
    catcher.classList.remove('on');
    const vars = root.DR && DR.s && DR.s.vars;
    if (vars && M.wasTutorial) vars['played-minigame-type-' + M.type] = true;
    if (M.wasTutorial) tutorial(false);
  }

  function tick(now) {
    if (!M) return;
    raf = requestAnimationFrame(tick);
    const real = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    const eff = real * TS, n = Math.max(1, Math.ceil(eff / (1 / 60))), dt = eff / n;
    for (let i = 0; i < n && M; i++) {
      step(dt);
      if (M) M.core.anim.update(dt);
    }
    if (!M) return;
    if (M.phase === 'ending') {
      M.doneT += eff;
      if (M.doneT >= 0.45) { const o = M.opts, r = { caught: true, trophy: !!M.core.hitSpecial, aborted: false }; setPhase('wait'); if (o.onDone) o.onDone(r); }
    } else if (M.phase === 'reveal') {
      M.revealT += eff;
      if (M.revealT >= 2.4) { const cb = M.revealCb; M.revealCb = null; setPhase('wait'); if (cb) cb(); }
    }
    flush();
  }

  function leave() {
    if (!M) return;
    const o = M.opts, wasRunning = M.phase === 'running';
    if (M.core.running) { try { root.DRAudio && DRAudio.stopLoop(M.core.sfx.loop); } catch (e) { /* tiếng là phần phụ */ } }
    closeNow(false);
    if (o.onDone) o.onDone({ caught: false, trophy: false, aborted: true });
  }

  function closeNow(silent) {                                           // HarvestMinigameView.Hide: trượt ra -width, 0,35 s
    if (!M) return;
    const m = M; M = null;
    cancelAnimationFrame(raf);
    try { root.DRAudio && DRAudio.stopLoop(m.core.sfx.loop); } catch (e) { /* tiếng là phần phụ */ }
    m.core.ctl && m.core.ctl.reset();
    catcher.classList.remove('on');
    const cont = Q(''); cont.el.classList.remove('in'); tutorial(false);
    leaveBtn.style.display = 'none';
    setTimeout(() => { if (!M && host) host.classList.remove('on'); }, silent ? 0 : 380);
    if (silent) host.classList.remove('on');
    ANIM && ANIM.stop(); ANIM_D && ANIM_D.stop();
    flush();
  }

  // thẻ "bắt được": HintImage hiện cá thật (không còn bóng), tiêu đề = tên cá, chữ phụ = kích thước, thẻ loại = Mới / Kỷ lục / Dị biến
  function reveal(made, cb) {
    if (!M || !made) { if (cb) cb(); return; }
    M.phase = 'reveal'; M.revealT = 0; M.revealCb = cb;
    const it = made.item || itemOf(made.id);
    setHint(true, made.id, false);
    const hint = Q('HintImage'); hint.el.classList.remove('hv-pop'); void hint.el.offsetWidth; hint.el.classList.add('hv-pop');
    Q('Title').setText(it ? it.name : '');
    const cm = made.cm || 0;
    Q('StockText').setText(cm ? T.size + cm + T.cm : '', { color: '#ffffff' });
    const tag = Q('HarvestableTypeTag'), which = made.trophy ? 'trophy' : made.aberrant ? 'aberrant' : made.isNew ? 'isnew' : '';
    tag.set('on', !!which);
    if (which) {
      tag.setCol(colArr(which === 'trophy' ? COL.VALUABLE : which === 'aberrant' ? '#cd46d6' : COL.EMPHASIS));
      Q('HarvestableTypeTag/Text').setText(T.tags[which], { color: which === 'trophy' ? '#1b1410' : '#ffffff' });
      Q('HarvestableTypeTag/AdvancedTypeIcon').set('on', false);
    }
    Q('InvalidEquipmentIndicator').set('on', false);
    play(made.aberrant ? 'fish.new.aberration' : made.isNew ? 'fish.new' : 'fish.minigame.hit');
  }

  // quay lại trạng thái chờ cho con kế (HarvestMinigameView.RefreshHarvestTarget sau OnItemPlaceComplete)
  function refresh(opts) {
    if (!M) return open(opts);
    M.type = WHEEL[opts.type] ? opts.type : 'FISHING_RADIAL'; M.dredge = M.type === 'DREDGE_RADIAL';
    M.revealCb = null;
    setupSession(opts);
    leaveBtn.style.display = '';
    return true;
  }
  function setInfo(info) {                                              // cập nhật thẻ khi kho/trạng thái đổi mà không đổi cá
    if (!M) return;
    M.opts.info = Object.assign({}, M.opts.info, info);
    setupSession(M.opts);
  }

  // phím: chặn hẳn để engine không lái thuyền / mở cargo khi đang câu
  root.addEventListener('keydown', e => {
    if (!M) return;
    if (M.phase === 'wait' || M.phase === 'cargo') return;           // cargo.js tự xử lý Esc / Tab
    if (e.code === 'Space' || e.code === 'KeyF') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) onAction(); }
    else if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (M.phase === 'reveal') M.revealT = 99; else leave(); }
    else if (M.phase === 'running' || M.phase === 'prestart' || M.phase === 'reveal' || M.phase === 'ending') {
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'KeyI', 'KeyL'].includes(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); }
    }
  }, true);
  root.addEventListener('keyup', e => { if (M && (e.code === 'Space' || e.code === 'KeyF') && M.phase !== 'wait') e.stopImmediatePropagation(); }, true);

  const dbg = () => {
    if (!M) return null;
    const C = M.core;
    return Object.assign({ type: M.type, phase: M.phase, progress: C.progress, running: C.running, inputEnabled: C.inputEnabled, penalty: C.penalty, progressDisabled: C.progressDisabled, hitSpecial: C.hitSpecial, trophy: !!M.trophyShown, u: USC }, C.ctl.debug());
  };
  root.DRMinigame = {
    open, refresh, setInfo, reveal, close: () => leave(), hide: () => closeNow(false),
    isOpen: () => !!(M && M.phase === 'running'),                       // thời gian trôi chỉ khi đang chạy
    isShown: () => !!M,
    wait: () => { if (M) M.phase = 'wait'; },                           // spots.js giữ panel trong lúc cargo mở
    phase: () => M && M.phase,
    nodeRect: rel => { const n = Q(rel); return n && n.el.getBoundingClientRect(); },
    node: rel => Q(rel),
    _debug: dbg, _press: () => onAction(), _scale: () => USC, _ts: k => { TS = k; }, _data: () => HUI, _flush: flush,
    _info: () => M && { dredge: M.dredge, itemId: M.opts.itemId }
  };
})(window);
