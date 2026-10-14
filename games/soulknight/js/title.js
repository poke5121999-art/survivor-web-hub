// Màn hình tựa của Soul Knight 8.6 ("Tap to Start"): nền Spine title_bg_860 + hiệp sĩ title_knight_860 + logo, chạm / Enter / Space
// thì vào sảnh (js/hall.js). Art bóc bằng tools/title/build_title.py ra art/title/ (nguồn title_background/860.ab).
// Hai rig là SkeletonGraphic cùng neo giữa-dưới, pos (-20, 513) trên canvas 1280x720, animation movement_ide lặp [ĐO prefab title_860];
// 1 đơn vị Spine = 1 điểm canvas (scale SkeletonData 0,01 × 100 px/đv) nên px = cao màn / 720 [SUY].
// Bố cục logo (góc trên trái) và chữ "Nhấp bắt đầu" (term 'TAP TO START') theo khung 2019 [ƯỚC LƯỢNG], cảnh gốc nằm trong scene APK.
// Không hiện khi ?quick=1, ?notitle=1, hoặc trình duyệt tự động (navigator.webdriver, trừ khi ?title=1); Spine hỏng thì bỏ qua màn tựa.
// SK.title = {on, t, want(), show(), start(), state}
(function () {
  'use strict';
  const SK = window.SK;
  const DIR = 'art/title/', ANIM = 'movement_ide';
  const REF_W = 1280, REF_H = 720, POS = [-20, 513];
  const FADE = 0.35, DILATE = 1.5;   // nở mỗi tam giác ~1,5 điểm ảnh màn để hết khe hở giữa các mảnh lưới
  const T = SK.title = { on: false, t: 0, out: -1, ready: false, rigs: null };

  T.want = function () {
    const q = location.search;
    if (SK.QUICK || /[?&]notitle=1\b/.test(q)) return false;
    if (navigator.webdriver && !/[?&]title=1\b/.test(q)) return false;
    return true;
  };

  const fetchBuf = u => fetch(u).then(r => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.arrayBuffer(); });
  const fetchTxt = u => fetch(u).then(r => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.text(); });
  const image = u => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(u + ' image failed')); i.src = u; });

  // Atlas nhiều trang: tên trang trong .atlas.txt trùng tên .png cạnh nó.

  // spine-canvas vẽ lưới bằng clip từng tam giác, mép khử răng cưa để lộ khe sáng giữa hai tam giác kề nhau. Bản này giống drawTriangle gốc
  // (4.2.40) nhưng đường clip nở `dil` đơn vị Spine ra khỏi trọng tâm; ánh xạ ảnh vẫn theo đỉnh gốc nên không méo.
  function drawTriangle(img, x0, y0, u0, v0, x1, y1, u1, v1, x2, y2, u2, v2) {
    const ctx = this.ctx, dil = this.dil || 0;
    u0 *= img.width; v0 *= img.height; u1 *= img.width; v1 *= img.height; u2 *= img.width; v2 *= img.height;
    const gx = (x0 + x1 + x2) / 3, gy = (y0 + y1 + y2) / 3;
    const grow = (x, y) => { const dx = x - gx, dy = y - gy, l = Math.hypot(dx, dy) || 1; return [x + dx / l * dil, y + dy / l * dil]; };
    const a0 = grow(x0, y0), a1 = grow(x1, y1), a2 = grow(x2, y2);
    ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.lineTo(a2[0], a2[1]); ctx.closePath();
    x1 -= x0; y1 -= y0; x2 -= x0; y2 -= y0; u1 -= u0; v1 -= v0; u2 -= u0; v2 -= v0;
    const det = 1 / (u1 * v2 - u2 * v1), a = (v2 * x1 - v1 * x2) * det, b = (v2 * y1 - v1 * y2) * det, c = (u1 * x2 - u2 * x1) * det, d = (u1 * y2 - u2 * y1) * det,
      e = x0 - a * u0 - c * v0, f = y0 - b * u0 - d * v0;
    ctx.save(); ctx.transform(a, b, c, d, e, f); ctx.clip(); ctx.drawImage(img, 0, 0); ctx.restore();
  }

  function loadRig(name) {
    const sp = window.spine;
    return Promise.all([fetchBuf(DIR + name + '.skel.bytes'), fetchTxt(DIR + name + '.atlas.txt')]).then(([bin, atxt]) => {
      const atlas = new sp.TextureAtlas(atxt);
      return Promise.all(atlas.pages.map(p => image(DIR + p.name).then(img => p.setTexture(new sp.CanvasTexture(img))))).then(() => {
        const data = new sp.SkeletonBinary(new sp.AtlasAttachmentLoader(atlas)).readSkeletonData(new Uint8Array(bin));
        const skel = new sp.Skeleton(data), st = new sp.AnimationState(new sp.AnimationStateData(data));
        if (data.findAnimation(ANIM)) st.setAnimation(0, ANIM, true);
        st.update(0); st.apply(skel); skel.updateWorldTransform(sp.Physics.update);
        return { skel, st, anims: data.animations.map(a => a.name), renderer: Object.assign(new sp.SkeletonRenderer(null), { triangleRendering: true, drawTriangle }) };   // lưới (mesh) chỉ vẽ khi bật triangleRendering
      });
    });
  }
  function loadAll() {
    if (T.loading) return T.loading;
    return (T.loading = SK.spine.init().then(ok => {
      if (!ok) throw new Error('spine-canvas unavailable');
      return Promise.all([loadRig('title_bg_860'), loadRig('title_knight_860'), image(DIR + 'logo.png')]);
    }).then(([bg, kn, logo]) => { T.rigs = { bg, kn }; T.logo = logo; T.ready = true; }));
  }

  let cv = null, cx = null;
  function build() {
    cv = document.createElement('canvas');
    cv.id = 'sk-title';
    cv.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:50;touch-action:none;background:#000;cursor:pointer';
    document.body.appendChild(cv);
    cx = cv.getContext('2d');
    cv.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); T.start(); });
    addEventListener('keydown', e => {
      if (T.on && (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter')) { e.preventDefault(); e.stopPropagation(); T.start(); }
    }, true);
  }

  T.show = function () {
    SK.G.state = 'title';
    SK.setOverlay && SK.setOverlay(null);
    T.on = true; T.t = 0; T.out = -1;
    if (!cv) build();
    cv.style.display = '';
    let last = performance.now();
    const frame = now => {
      if (!T.on) return;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      tick(dt);
      requestAnimationFrame(frame);
    };
    loadAll().then(() => { last = performance.now(); requestAnimationFrame(frame); }, e => { SK.warnOnce && SK.warnOnce('title', e.message); finish(); });
  };

  T.start = function () {
    if (!T.on || T.out >= 0 || !T.ready) return;
    T.out = 0;
  };

  function finish() {
    T.on = false;
    if (cv) cv.style.display = 'none';
    if (SK.G.state === 'title') SK.hall.enter('select');
  }

  function tick(dt) {
    T.t += dt;
    for (const k in T.rigs) { const r = T.rigs[k]; r.st.update(dt); r.st.apply(r.skel); r.skel.updateWorldTransform(window.spine.Physics.update); }
    const dpr = Math.min(2, devicePixelRatio || 1), W = Math.round(innerWidth * dpr), H = Math.round(innerHeight * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    cx.setTransform(1, 0, 0, 1, 0, 0);
    cx.fillStyle = T.fill || '#000'; cx.fillRect(0, 0, W, H);
    const k = H / REF_H;
    cx.imageSmoothingEnabled = true;
    // SkeletonGraphic: gốc xương đặt tại điểm neo (giữa-dưới) cộng pos, y Unity hướng lên.
    const ox = W / 2 + POS[0] * k, oy = H - POS[1] * k;
    for (const key of ['bg', 'kn']) {
      const r = T.rigs[key];
      if (T.hide && T.hide[key]) continue;   // móc dò bố cục
      r.renderer.ctx = cx; r.renderer.dil = T.noDilate ? 0 : DILATE / k;
      cx.save(); cx.translate(ox, oy); cx.scale(k, -k);
      r.renderer.draw(r.skel);
      cx.restore();
    }
    // Logo góc trên trái [ƯỚC LƯỢNG theo khung 2019]: cao ~21% màn, lệch 4% mép.
    const lh = H * 0.21, lw = lh * T.logo.width / T.logo.height;
    cx.drawImage(T.logo, W * 0.03, H * 0.02, lw, lh);
    // Chữ nhấp nháy ở đáy (term TAP TO START → "Nhấp bắt đầu").
    const a = 0.55 + 0.45 * Math.sin(T.t * 3.2);
    const fs = Math.round(H * 0.065);
    cx.save();
    cx.font = fs + 'px "skui_BeVietnamPro-Regular", "skui_pixel_bold", sans-serif';
    cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.globalAlpha = a;
    cx.lineJoin = 'round'; cx.lineWidth = fs * 0.18; cx.strokeStyle = '#000';
    cx.strokeText('Nhấp bắt đầu', W / 2, H * 0.9);
    cx.fillStyle = '#fff'; cx.fillText('Nhấp bắt đầu', W / 2, H * 0.9);
    cx.restore();
    if (T.out >= 0) {
      T.out += dt;
      cx.fillStyle = 'rgba(0,0,0,' + Math.min(1, T.out / FADE) + ')'; cx.fillRect(0, 0, W, H);
      if (T.out >= FADE) finish();
    }
  }

  T.state = () => ({ on: T.on, t: T.t, ready: T.ready, out: T.out, anims: T.rigs && { bg: T.rigs.bg.anims, kn: T.rigs.kn.anims } });
})();
