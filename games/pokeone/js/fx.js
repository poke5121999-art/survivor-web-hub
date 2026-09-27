/*
 * Hiệu ứng trận: hoạt ảnh sprite từ atlas NGUI (fx_*), hạt kiểu Shuriken, chớp màn hình.
 * Mỗi hiệu ứng là một "handle" { obj, update(dt) -> còn sống?, done: Promise, dispose() }.
 * battle.js giữ danh sách handle và gọi update mỗi khung. Nguồn và cách đo: tools/README-battle.md.
 */
(function (P1) {
  'use strict';

  const images = {};
  function image(url) {
    if (!images[url]) {
      const img = new Image();
      images[url] = { img, ready: new Promise((res) => { img.onload = res; img.onerror = res; }) };
      img.src = url;
    }
    return images[url];
  }

  /* Khung của một hoạt ảnh NGUI: mọi sprite có tên bắt đầu bằng prefix, xếp theo tên (UISpriteAnimation.RebuildSpriteList). */
  function frames(atlasKey, prefix) {
    const a = P1.ATLAS && P1.ATLAS[atlasKey];
    if (!a) return [];
    return Object.keys(a.s).filter((n) => n.startsWith(prefix)).sort()
      .map((n) => { const r = a.s[n]; return { name: n, sx: r[0], sy: r[1], sw: r[2], sh: r[3], pl: r[8], pr: r[9], pt: r[10], pb: r[11] }; });
  }

  function resolve() { let r; const p = new Promise((res) => { r = res; }); p.resolve = r; return p; }

  /*
   * Hoạt ảnh sprite billboard trong 3D. opt: { atlas, prefix, fps, loop, reversed, keepLastFrame,
   *   pxToM (mét cho mỗi điểm ảnh atlas), color:[r,g,b,a], depthTest }
   * Khung có padding NGUI: vẽ vào canvas cỡ khung đầy đủ để các khung thẳng hàng.
   */
  function sprite(opt) {
    const list = frames(opt.atlas, opt.prefix);
    const done = resolve();
    if (!list.length) { done.resolve(); return { obj: new THREE.Object3D(), update: () => false, done, dispose() {} }; }
    const W = Math.max(...list.map((f) => f.sw + f.pl + f.pr)), H = Math.max(...list.map((f) => f.sh + f.pt + f.pb));
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    const col = opt.color || [1, 1, 1, 1];
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: !!opt.depthTest,
      color: new THREE.Color(col[0], col[1], col[2]), opacity: col[3] == null ? 1 : col[3] });
    const obj = new THREE.Sprite(mat);
    const k = opt.pxToM || 0.01;
    obj.scale.set(W * k, H * k, 1);
    obj.renderOrder = 20;
    const src = image((P1.ngui ? P1.ngui.base : '') + P1.ATLAS[opt.atlas].img);
    const order = opt.reversed ? list.slice().reverse() : list;
    const fps = opt.fps || 12;
    let t = 0, shown = -1, alive = true;
    function draw(i) {
      if (i === shown || !src.img.complete) return;
      const f = order[i];
      ctx.clearRect(0, 0, W, H);
      const fw = f.sw + f.pl + f.pr, fh = f.sh + f.pt + f.pb;
      ctx.drawImage(src.img, f.sx, f.sy, f.sw, f.sh, (W - fw) / 2 + f.pl, (H - fh) / 2 + f.pt, f.sw, f.sh);
      tex.needsUpdate = true;
      shown = i;
    }
    return {
      obj, done,
      update(dt) {
        if (!alive) return false;
        t += dt;
        let i = Math.floor(t * fps);
        if (i >= order.length) {
          if (opt.loop) i %= order.length;
          else {
            if (!opt.keepLastFrame) obj.visible = false;
            alive = false; done.resolve();
            return false;
          }
        }
        draw(i);
        return true;
      },
      stop() { alive = false; obj.visible = false; done.resolve(); },
      dispose() { tex.dispose(); mat.dispose(); if (obj.parent) obj.parent.remove(obj); },
    };
  }

  /* ---------------------------------------------------------------- hạt */

  const rand = (r) => (Array.isArray(r) ? r[0] + Math.random() * (r[1] - r[0]) : (r || 0));
  function sample(stops, t, key) {
    if (!stops || !stops.length) return null;
    if (t <= stops[0].t) return stops[0][key];
    for (let i = 1; i < stops.length; i++) {
      const a = stops[i - 1], b = stops[i];
      if (t <= b.t) {
        const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
        const va = a[key], vb = b[key];
        return Array.isArray(va) ? va.map((v, j) => v + (vb[j] - v) * k) : va + (vb - va) * k;
      }
    }
    return stops[stops.length - 1][key];
  }

  const VERT = `
    attribute float size; attribute vec4 pcolor; attribute float rot; attribute float frame;
    uniform float pxScale;
    varying vec4 vColor; varying float vRot; varying float vFrame;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = size * pxScale / max(0.05, -mv.z);
      gl_Position = projectionMatrix * mv;
      vColor = pcolor; vRot = rot; vFrame = frame;
    }`;
  const FRAG = `
    uniform sampler2D map; uniform vec2 tiles;
    varying vec4 vColor; varying float vRot; varying float vFrame;
    void main() {
      vec2 uv = gl_PointCoord - 0.5;
      float c = cos(vRot), s = sin(vRot);
      uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y) + 0.5;
      if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) discard;
      float fx = mod(vFrame, tiles.x), fy = floor(vFrame / tiles.x);
      vec2 st = vec2((fx + uv.x) / tiles.x, 1.0 - (fy + uv.y) / tiles.y);
      vec4 t = texture2D(map, st) * vColor;
      if (t.a < 0.004) discard;
      gl_FragColor = t;
    }`;

  const texCache = {};
  function particleTexture(url) {
    if (!url) return null;
    if (!texCache[url]) {
      texCache[url] = new THREE.TextureLoader().load(url);
      texCache[url].encoding = THREE.sRGBEncoding;
    }
    return texCache[url];
  }
  let whiteTex = null;
  function softDot() {
    if (whiteTex) return whiteTex;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    whiteTex = new THREE.CanvasTexture(cv);
    return whiteTex;
  }

  /*
   * Một ParticleSystem Shuriken xấp xỉ (dữ liệu từ P1.BATTLE, xem tools/rip_battle.py).
   * opt: { origin: Vector3 (thế giới), scale, pxScale, tint:[r,g,b] }
   * Mô phỏng trong không gian thế giới; bỏ qua mô-đun không đọc được (va chạm, sub-emitter…).
   */
  function emitter(spec, opt) {
    const scale = (opt.scale || 1) * (spec.scale || 1);
    const max = Math.max(1, Math.min(400, spec.maxParticles || 50));
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(max * 3), col = new Float32Array(max * 4), size = new Float32Array(max),
      rot = new Float32Array(max), frame = new Float32Array(max);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('pcolor', new THREE.BufferAttribute(col, 4));
    geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('rot', new THREE.BufferAttribute(rot, 1));
    geo.setAttribute('frame', new THREE.BufferAttribute(frame, 1));
    const tiles = spec.sheet ? new THREE.Vector2(spec.sheet[0], spec.sheet[1]) : new THREE.Vector2(1, 1);
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: particleTexture(spec.tex) || softDot() }, pxScale: { value: opt.pxScale || 600 }, tiles: { value: tiles } },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: spec.blend === 'alpha' ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    const obj = new THREE.Points(geo, mat);
    obj.frustumCulled = false;
    obj.renderOrder = 25;
    const origin = (opt.origin || new THREE.Vector3()).clone();
    const off = spec.pos ? new THREE.Vector3(spec.pos[0], spec.pos[1], spec.pos[2]).multiplyScalar(opt.posScale || 1) : new THREE.Vector3();
    origin.add(off);
    const ps = [];
    const duration = spec.duration || 1, delay = rand(spec.delay);
    const bursts = (spec.bursts || []).map((b) => ({ time: b.time || 0, count: Math.round(rand(b.count)), done: false }));
    let t = -delay, emitAcc = 0, alive = true, stopped = false;
    const done = resolve();
    const tint = opt.tint || [1, 1, 1];
    const g = (spec.gravity || 0) * 9.81 * scale;

    function spawn() {
      if (ps.length >= max) return;
      const sh = spec.shape || { type: 'sphere', radius: 0 };
      const r = (sh.radius || 0) * scale;
      let dir = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
      if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0);
      dir.normalize();
      let p = new THREE.Vector3();
      if (sh.type === 'cone') {
        const ang = ((sh.angle || 25) * Math.PI) / 180, a = Math.random() * Math.PI * 2, q = Math.random();
        const rad = r * Math.sqrt(q);
        p.set(Math.cos(a) * rad, 0, Math.sin(a) * rad);
        dir.set(Math.cos(a) * Math.sin(ang) * Math.sqrt(q), 1, Math.sin(a) * Math.sin(ang) * Math.sqrt(q)).normalize();
      } else if (sh.type === 'circle') {
        const a = Math.random() * ((sh.arc || 360) * Math.PI / 180);
        dir.set(Math.cos(a), 0, Math.sin(a));
        p.copy(dir).multiplyScalar(r * Math.random());
      } else if (sh.type === 'hemisphere') {
        dir.y = Math.abs(dir.y);
        p.copy(dir).multiplyScalar(r * Math.random());
      } else if (sh.type === 'box') {
        const b = sh.box || [r, r, r];
        p.set((Math.random() - 0.5) * b[0] * scale, (Math.random() - 0.5) * b[1] * scale, (Math.random() - 0.5) * b[2] * scale);
        dir.set(0, 1, 0);
      } else {
        p.copy(dir).multiplyScalar(r * Math.random());
      }
      const c0 = spec.colorMin && spec.colorMax
        ? spec.colorMin.map((v, i) => v + Math.random() * (spec.colorMax[i] - v)) : (spec.color || [1, 1, 1, 1]);
      ps.push({
        p: p.add(origin), v: dir.multiplyScalar(rand(spec.speed) * scale), age: 0, life: Math.max(0.02, rand(spec.lifetime || [1, 1])),
        size: rand(spec.size || [0.1, 0.1]) * scale, rot: (rand(spec.rotation) * Math.PI) / 180,
        spin: (rand(spec.rotationOverLifetime) * Math.PI) / 180, c: c0,
      });
    }

    return {
      obj, done,
      stop() { stopped = true; },
      update(dt) {
        if (!alive) return false;
        t += dt;
        if (t >= 0 && !stopped && (spec.loop || t <= duration)) {
          const tt = spec.loop ? t % duration : t;
          for (const b of bursts) {
            if (!b.done && tt >= b.time) { for (let i = 0; i < b.count; i++) spawn(); b.done = true; }
            if (spec.loop && tt < b.time) b.done = false;
          }
          emitAcc += (spec.rate || 0) * dt;
          while (emitAcc >= 1) { spawn(); emitAcc -= 1; }
        }
        let n = 0;
        for (let i = ps.length - 1; i >= 0; i--) {
          const q = ps[i];
          q.age += dt;
          if (q.age >= q.life) { ps.splice(i, 1); continue; }
          q.v.y -= g * dt;
          q.p.addScaledVector(q.v, dt);
          q.rot += q.spin * dt;
        }
        for (const q of ps) {
          const k = q.age / q.life;
          const cl = sample(spec.colorOverLifetime, k, 'color') || [1, 1, 1, 1];
          const sl = sample(spec.sizeOverLifetime, k, 'v');
          pos[n * 3] = q.p.x; pos[n * 3 + 1] = q.p.y; pos[n * 3 + 2] = q.p.z;
          col[n * 4] = q.c[0] * cl[0] * tint[0]; col[n * 4 + 1] = q.c[1] * cl[1] * tint[1];
          col[n * 4 + 2] = q.c[2] * cl[2] * tint[2]; col[n * 4 + 3] = (q.c[3] == null ? 1 : q.c[3]) * (cl[3] == null ? 1 : cl[3]);
          size[n] = q.size * (sl == null ? 1 : sl);
          rot[n] = q.rot;
          frame[n] = spec.sheet ? Math.min(tiles.x * tiles.y - 1, Math.floor(k * tiles.x * tiles.y)) : 0;
          n++;
        }
        geo.setDrawRange(0, n);
        for (const k of ['position', 'pcolor', 'size', 'rot', 'frame']) geo.attributes[k].needsUpdate = true;
        const over = (stopped || (!spec.loop && t > duration)) && ps.length === 0;
        if (over) { alive = false; obj.visible = false; done.resolve(); return false; }
        return true;
      },
      setPxScale(v) { mat.uniforms.pxScale.value = v; },
      dispose() { geo.dispose(); mat.dispose(); if (obj.parent) obj.parent.remove(obj); },
    };
  }

  /* Một nhóm ParticleSystem (hiệu ứng Unity gồm hệ cha + con) chạy cùng lúc. */
  function group(specs, opt) {
    const list = (specs || []).map((s) => emitter(s, opt));
    const obj = new THREE.Group();
    list.forEach((e) => obj.add(e.obj));
    return {
      obj, done: Promise.all(list.map((e) => e.done)),
      update(dt) { let any = false; for (const e of list) any = e.update(dt) || any; return any; },
      stop() { list.forEach((e) => e.stop()); },
      setPxScale(v) { list.forEach((e) => e.setPxScale(v)); },
      dispose() { list.forEach((e) => e.dispose()); if (obj.parent) obj.parent.remove(obj); },
    };
  }

  /* Chớp màn hình (lớp DOM phủ trên canvas 3D, dưới HUD). */
  function flash(host, color, seconds) {
    const el = document.createElement('div');
    Object.assign(el.style, { position: 'absolute', inset: '0', background: color || '#fff', opacity: '1', pointerEvents: 'none',
      transition: 'opacity ' + (seconds || 0.3) + 's linear' });
    host.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => { el.style.opacity = '0'; }));
    setTimeout(() => el.remove(), (seconds || 0.3) * 1000 + 100);
  }

  P1.fx = { frames, sprite, emitter, group, flash, image };
})(window.P1 = window.P1 || {});
