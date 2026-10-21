/* Chợ Phiên — hero Spine động ở sảnh (W-30). Bộ xương gốc Spine 4.2.43 nhị phân (art/heroes/skin_<xxx>_01/spine), bản chạy
   @esotericsoftware/spine-webgl@4.2.119 (jsDelivr, ghim đúng phiên bản; cùng nhánh 4.2 đọc được .skel 4.2.43) chỉ tải khi vào sảnh.
   Mọi lỗi (không WebGL, mạng, tệp hỏng, quá hạn giờ) → bỏ canvas, giữ ảnh tĩnh: show() báo qua onFail, không ném lỗi ra ngoài.
   Atlas ghi trang .png nhưng art/ chỉ giữ .webp cùng thư mục cha → tự nạp ảnh webp rồi gắn vào trang atlas. */
(function (root) {
  'use strict';
  var RT_URL = 'https://cdn.jsdelivr.net/npm/@esotericsoftware/spine-webgl@4.2.119/dist/iife/spine-webgl.js';
  var RT_TIMEOUT = 12000, MAX_PX = 1400;
  var CODE = { Vanessa: 'van', Pygmalien: 'pyg', Dooley: 'doo', Mak: 'mak', Stelle: 'ste', Jules: 'jul', Karnok: 'kar' };
  var S = root.BZSpine = { stats: { runtimeMs: 0, loadMs: {}, firstFrameMs: {}, frameMs: 0, frames: 0, anim: {}, ok: false, error: '' } };

  var rtPromise = null, cache = {}, host = null, canvas = null, gl = null, renderer = null, cur = null, raf = 0, token = 0, lastT = 0;

  function fail(msg) { S.stats.error = String(msg && msg.message || msg); S.stats.ok = false; }

  function loadRuntime() {
    if (root.spine && root.spine.SceneRenderer) return Promise.resolve();
    if (rtPromise) return rtPromise;
    var t0 = performance.now();
    rtPromise = new Promise(function (res, rej) {
      var sc = document.createElement('script'), done = false;
      var to = setTimeout(function () { if (!done) { done = true; rej(new Error('runtime Spine tải quá hạn')); } }, RT_TIMEOUT);
      sc.src = RT_URL; sc.async = true;
      sc.onload = function () { if (done) return; done = true; clearTimeout(to); S.stats.runtimeMs = Math.round(performance.now() - t0); res(); };
      sc.onerror = function () { if (done) return; done = true; clearTimeout(to); rej(new Error('không tải được runtime Spine')); };
      document.head.appendChild(sc);
    });
    rtPromise.catch(function () { rtPromise = null; }); // cho phép thử lại lần vào sảnh sau
    return rtPromise;
  }

  function fetchBuf(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url); return r.arrayBuffer(); }); }
  function fetchTxt(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url); return r.text(); }); }
  function loadImg(url) {
    return new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { rej(new Error('ảnh ' + url)); }; i.src = url; });
  }

  function ensureGl() {
    if (canvas) return;
    var c = document.createElement('canvas');
    c.className = 'bz-spine'; c.setAttribute('aria-hidden', 'true');
    c.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none';
    // antialias tắt: hero Spine là ảnh có viền alpha nên MSAA gần như không thấy khác, mà tốn ~40% CPU sảnh trên GPU phần mềm (đo ở đợt fix8)
    var g = c.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false }) || c.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!g) throw new Error('không có WebGL');
    canvas = c; gl = g;
    renderer = new root.spine.SceneRenderer(canvas, gl);
  }

  function loadHero(h) {
    if (cache[h]) return cache[h];
    var code = CODE[h]; if (!code) return Promise.reject(new Error('hero không có Spine: ' + h));
    var t0 = performance.now(), N = 'Skin_' + code.toUpperCase() + '_01a', dir = 'art/heroes/skin_' + code + '_01/';
    cache[h] = Promise.all([fetchBuf(dir + 'spine/' + N + '.skel'), fetchTxt(dir + 'spine/' + N + '.atlas'), loadImg(dir + N + '.webp')]).then(function (a) {
      var sp = root.spine;
      var atlas = new sp.TextureAtlas(a[1]);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); // webp giữ alpha thẳng; atlas khai pma nên nhân trước khi nạp
      atlas.pages.forEach(function (p) { p.setTexture(new sp.GLTexture(gl, a[2])); });
      var bin = new sp.SkeletonBinary(new sp.AtlasAttachmentLoader(atlas));
      var data = bin.readSkeletonData(new Uint8Array(a[0]));
      var names = data.animations.map(function (x) { return x.name; });
      var idle = names.filter(function (n) { return /idle/i.test(n); })[0] || names[0];
      var skel = new sp.Skeleton(data); skel.setToSetupPose(); skel.updateWorldTransform(sp.Physics ? sp.Physics.update : undefined);
      var state = new sp.AnimationState(new sp.AnimationStateData(data));
      if (idle) state.setAnimation(0, idle, true);
      state.update(0); state.apply(skel); skel.updateWorldTransform(sp.Physics ? sp.Physics.update : undefined);
      var b = skel.getBoundsRect();
      S.stats.loadMs[h] = Math.round(performance.now() - t0); S.stats.anim[h] = { idle: idle, all: names };
      return { skel: skel, state: state, idle: idle, bounds: b, h: h };
    });
    cache[h].catch(function () { delete cache[h]; });
    return cache[h];
  }

  function resize() {
    var r = host.getBoundingClientRect(), dpr = Math.min(root.devicePixelRatio || 1, 2);
    var w = Math.max(2, Math.min(MAX_PX, Math.round(r.width * dpr))), hh = Math.max(2, Math.min(MAX_PX, Math.round(r.height * dpr)));
    // host nằm trong sân khấu bị scale: r.width đã là kích thước thật trên màn hình
    if (canvas.width !== w || canvas.height !== hh) { canvas.width = w; canvas.height = hh; }
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (!cur || !host || document.hidden) { lastT = now; return; }
    var t0 = performance.now();
    var dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000)); lastT = now;
    resize();
    var sp = root.spine, c = cur, b = c.bounds;
    c.state.update(dt); c.state.apply(c.skel); c.skel.updateWorldTransform(sp.Physics ? sp.Physics.update : undefined);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    // khung nhìn cố định theo hộp bao lúc bắt đầu: hero đứng sát đáy, vừa chiều cao/rộng, chừa 4% viền
    var pad = 1.06, sc = Math.min(canvas.width / (b.width * pad), canvas.height / (b.height * pad));
    var cam = renderer.camera;
    var vh = canvas.height / sc;
    cam.position.x = b.x + b.width / 2; cam.position.y = b.y + vh / 2 - b.height * 0.02;
    cam.viewportWidth = canvas.width / sc; cam.viewportHeight = canvas.height / sc; cam.update();
    renderer.begin(); renderer.drawSkeleton(c.skel, true); renderer.end();
    var ms = performance.now() - t0, st = S.stats;
    st.frames++; st.frameMs = st.frameMs ? st.frameMs * 0.95 + ms * 0.05 : ms;
    if (c.first) { st.firstFrameMs[c.h] = Math.round(performance.now() - c.first); c.first = 0; if (c.onShown) c.onShown(); }
  }

  // show(el, hero, onShown, onFail): vẽ hero Spine vào el; hero cũ vẫn chạy tới khi hero mới sẵn sàng.
  S.show = function (el, hero, onShown, onFail) {
    var my = ++token, t0 = performance.now();
    function bad(e) { if (my !== token) return; fail(e); S.hide(); if (onFail) onFail(e); }
    try {
      loadRuntime().then(function () {
        if (my !== token) return;
        host = el; ensureGl();
        return loadHero(hero).then(function (c) {
          if (my !== token) return;
          if (canvas.parentNode !== el) el.appendChild(canvas);
          c.state.setAnimation(0, c.idle, true); c.skel.setToSetupPose();
          c.first = t0; c.onShown = function () { S.stats.ok = true; S.stats.error = ''; if (onShown) onShown(); };
          cur = c; lastT = performance.now();
          if (!raf) raf = requestAnimationFrame(tick);
        });
      }).catch(bad);
    } catch (e) { bad(e); }
  };
  // hide(): dừng vẽ, gỡ canvas (giữ cache xương, giải phóng ngữ cảnh GL khi rời sảnh)
  S.hide = function () {
    token++; cur = null;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    host = null;
  };
  S.supported = function (hero) { return !!CODE[hero]; };
  S.currentHero = function () { return cur ? cur.h : null; };
})(typeof window !== 'undefined' ? window : globalThis);
