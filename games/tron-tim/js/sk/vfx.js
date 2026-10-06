// Copied from games/soulknight/js/vfx.js @ 957b240b; do not edit here, rerun tools/extract_sk.js --code
// Hiệu ứng thật từ prefab Soul Knight 8.6 (data/sk-vfx.js, sinh bởi tools/vfx/build_vfx.py).
// Mô phỏng một tập con ParticleSystem của Unity + sprite theo khung (SpriteRenderer, SpriteAnimation, clip Animator),
// TrailRenderer/LineRenderer (dải có texture, bề rộng, màu, textureMode). 1 đơn vị Unity = 16 px. Dạng dữ liệu: tools/vfx/README.md.
(function () {
  'use strict';
  const SK = window.SK = window.SK || {};
  const V = window.SK_VFX || { atlas: { pages: [], f: {} }, effects: {}, refs: {}, weapons: {} };
  const FR = V.atlas.f;
  const SMOOTH = new Set(V.atlas.smooth || []); // texture lọc Bilinear trong Unity (glow HD): vẽ mịn, pixel art thì không
  const U = V.ppu || 16;
  const LIMIT = { particles: 2000, perSystem: 200, instances: 400 }; // [ƯỚC LƯỢNG] đo fps trong test/soulknight-vfx.js

  const vfx = SK.vfx = {
    data: V, pages: [], loaded: false, LIMIT,
    stats: { particles: 0, instances: 0, dropped: 0 },
    base: ''
  };

  // ---------------------------------------------------------------- nạp atlas
  // Trang nạp lười: lần đầu một khung cần tới trang nào thì mới tải trang đó (15 trang ~5 MB, không chặn lúc vào game).
  // vfx.load() tải hết và chờ (trang xem, kiểm thử).
  const pending = [];
  function pageImg(i) {
    const im = vfx.pages[i];
    if (im) return im;
    if (!pending[i]) {
      pending[i] = new Promise(res => {
        const img = new Image();
        img.onload = () => { vfx.pages[i] = img; res(img); };
        img.onerror = () => { console.warn('[SK.vfx] atlas page not loaded: ' + V.atlas.pages[i]); res(null); };
        img.src = vfx.base + V.atlas.pages[i] + (V.v ? '?v=' + V.v : '');
      });
    }
    return null;
  }
  vfx.load = function (base) {
    if (base != null) vfx.base = base;
    V.atlas.pages.forEach((_, i) => pageImg(i));
    return Promise.all(pending).then(() => { vfx.loaded = true; });
  };

  // ---------------------------------------------------------------- rng riêng (không làm lệch SK.rand của ván chơi)
  // sfc32 (mulberry32 lấy mẫu theo bước cố định cho chuỗi lệch rõ: hạt khói cùng một phía)
  function rng(seed) {
    let a = 0x9E3779B9, b = 0x243F6A88, c = 0xB7E15162, d = seed >>> 0;
    const f = function () {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      let t = (a + b) | 0;
      a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    };
    for (let i = 0; i < 12; i++) f();
    return f;
  }
  let seedCounter = 0x51a7;

  // ---------------------------------------------------------------- đường cong
  function curve(keys, t) {
    const n = keys.length;
    if (!n) return 0;
    if (t <= keys[0][0] || n === 1) return keys[0][1];
    const last = keys[n - 1];
    if (t >= last[0]) return last[1];
    let i = 0;
    while (i < n - 2 && t >= keys[i + 1][0]) i++;
    const a = keys[i], b = keys[i + 1];
    const dt = b[0] - a[0];
    if (dt <= 0) return b[1];
    if (a[3] === null || b[2] === null) return a[1];
    const s = (t - a[0]) / dt, s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * a[1] + (s3 - 2 * s2 + s) * a[3] * dt + (-2 * s3 + 3 * s2) * b[1] + (s3 - s2) * b[2] * dt;
  }
  // MinMaxCurve: số | {a,b} | {c,m} | {c,c2,m}; t chuẩn hoá 0..1, r ngẫu nhiên riêng của hạt
  function mm(v, t, r) {
    if (typeof v === 'number') return v;
    if (v == null) return 0;
    if (v.c) {
      const hi = curve(v.c, t);
      return (v.c2 ? curve(v.c2, t) + (hi - curve(v.c2, t)) * r : hi) * v.m;
    }
    return v.a + (v.b - v.a) * r;
  }
  function grad(g, t) {
    const c = g.c, a = g.a;
    const out = [1, 1, 1, 1];
    if (c && c.length) {
      if (t <= c[0][0] || c.length === 1) { out[0] = c[0][1]; out[1] = c[0][2]; out[2] = c[0][3]; }
      else if (t >= c[c.length - 1][0]) { const k = c[c.length - 1]; out[0] = k[1]; out[1] = k[2]; out[2] = k[3]; }
      else {
        let i = 0; while (i < c.length - 2 && t >= c[i + 1][0]) i++;
        const k0 = c[i], k1 = c[i + 1];
        const u = g.fixed ? 1 : (t - k0[0]) / ((k1[0] - k0[0]) || 1);
        const kk = g.fixed ? k1 : null;
        for (let j = 0; j < 3; j++) out[j] = kk ? kk[j + 1] : k0[j + 1] + (k1[j + 1] - k0[j + 1]) * u;
      }
    }
    if (a && a.length) {
      if (t <= a[0][0] || a.length === 1) out[3] = a[0][1];
      else if (t >= a[a.length - 1][0]) out[3] = a[a.length - 1][1];
      else {
        let i = 0; while (i < a.length - 2 && t >= a[i + 1][0]) i++;
        const k0 = a[i], k1 = a[i + 1];
        out[3] = g.fixed ? k1[1] : k0[1] + (k1[1] - k0[1]) * (t - k0[0]) / ((k1[0] - k0[0]) || 1);
      }
    }
    return out;
  }
  // MinMaxGradient: [r,g,b,a] | {g} | {a,b} | {g,g2} | {g,rnd}
  function mmg(v, t, r) {
    if (Array.isArray(v)) return v;
    if (v.g && v.rnd) return grad(v.g, r);
    if (v.g && v.g2) { const x = grad(v.g, t), y = grad(v.g2, t); return [y[0] + (x[0] - y[0]) * r, y[1] + (x[1] - y[1]) * r, y[2] + (x[2] - y[2]) * r, y[3] + (x[3] - y[3]) * r]; }
    if (v.g) return grad(v.g, t);
    const x = v.b, y = v.a;
    return [y[0] + (x[0] - y[0]) * r, y[1] + (x[1] - y[1]) * r, y[2] + (x[2] - y[2]) * r, y[3] + (x[3] - y[3]) * r];
  }
  // khoá clip dạng [t, v] (hằng) hoặc [t, c0, c1, c2, c3] (đa thức bậc ba theo dt từ t)
  function clipVal(s, t) {
    let i = 0;
    while (i < s.length - 1 && t >= s[i + 1][0]) i++;
    const k = s[i];
    if (k.length === 2) return k[1];
    const d = t - k[0];
    return ((k[1] * d + k[2]) * d + k[3]) * d + k[4];
  }

  // ---------------------------------------------------------------- ma trận 3x4: [m00 m01 m02 m10 m11 m12 m20 m21 m22 tx ty tz]
  function trs(px, py, pz, qx, qy, qz, qw, sx, sy, sz, out) {
    const n = Math.hypot(qx, qy, qz, qw) || 1;
    qx /= n; qy /= n; qz /= n; qw /= n;
    out[0] = (1 - 2 * (qy * qy + qz * qz)) * sx; out[1] = 2 * (qx * qy - qz * qw) * sy; out[2] = 2 * (qx * qz + qy * qw) * sz;
    out[3] = 2 * (qx * qy + qz * qw) * sx; out[4] = (1 - 2 * (qx * qx + qz * qz)) * sy; out[5] = 2 * (qy * qz - qx * qw) * sz;
    out[6] = 2 * (qx * qz - qy * qw) * sx; out[7] = 2 * (qy * qz + qx * qw) * sy; out[8] = (1 - 2 * (qx * qx + qy * qy)) * sz;
    out[9] = px; out[10] = py; out[11] = pz;
    return out;
  }
  function mul(a, b, out) {
    const r = out || new Array(12);
    const a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], a4 = a[4], a5 = a[5], a6 = a[6], a7 = a[7], a8 = a[8];
    r[0] = a0 * b[0] + a1 * b[3] + a2 * b[6]; r[1] = a0 * b[1] + a1 * b[4] + a2 * b[7]; r[2] = a0 * b[2] + a1 * b[5] + a2 * b[8];
    r[3] = a3 * b[0] + a4 * b[3] + a5 * b[6]; r[4] = a3 * b[1] + a4 * b[4] + a5 * b[7]; r[5] = a3 * b[2] + a4 * b[5] + a5 * b[8];
    r[6] = a6 * b[0] + a7 * b[3] + a8 * b[6]; r[7] = a6 * b[1] + a7 * b[4] + a8 * b[7]; r[8] = a6 * b[2] + a7 * b[5] + a8 * b[8];
    r[9] = a0 * b[9] + a1 * b[10] + a2 * b[11] + a[9]; r[10] = a3 * b[9] + a4 * b[10] + a5 * b[11] + a[10]; r[11] = a6 * b[9] + a7 * b[10] + a8 * b[11] + a[11];
    return r;
  }
  function eulerQuat(ex, ey, ez) {
    const x = ex * Math.PI / 360, y = ey * Math.PI / 360, z = ez * Math.PI / 360;
    const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
    return [cy * sx * cz + sy * cx * sz, sy * cx * cz - cy * sx * sz, cy * cx * sz - sy * sx * cz, cy * cx * cz + sy * sx * sz];
  }

  // ---------------------------------------------------------------- nhuộm màu (nhân) có cache
  const tintCache = new Map();
  function tinted(fname, r, g, b) {
    const qr = Math.round(r * 15), qg = Math.round(g * 15), qb = Math.round(b * 15);
    if (qr === 15 && qg === 15 && qb === 15) return null;
    const key = fname + '|' + qr + '|' + qg + '|' + qb;
    let cv = tintCache.get(key);
    if (cv !== undefined) return cv;
    const f = FR[fname], img = f && pageImg(f[0]);
    if (!img) return null;
    cv = document.createElement('canvas'); cv.width = f[3]; cv.height = f[4];
    const x = cv.getContext('2d');
    x.drawImage(img, f[1], f[2], f[3], f[4], 0, 0, f[3], f[4]);
    x.globalCompositeOperation = 'multiply';
    x.fillStyle = 'rgb(' + (qr * 17) + ',' + (qg * 17) + ',' + (qb * 17) + ')';
    x.fillRect(0, 0, f[3], f[4]);
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(img, f[1], f[2], f[3], f[4], 0, 0, f[3], f[4]);
    if (tintCache.size > 4000) tintCache.clear();
    tintCache.set(key, cv);
    return cv;
  }

  // ---------------------------------------------------------------- tạo instance
  function G_list(G) { return G.vfx || (G.vfx = []); }

  vfx.has = name => !!V.effects[name];
  vfx.def = name => V.effects[name] || null;
  vfx.names = () => Object.keys(V.effects);
  // bảng tra từ prefab gốc (đạn/súng/trùm) -> hiệu ứng nó tham chiếu
  vfx.refsOf = name => V.refs[name] || null;
  vfx.hitFor = bullet => pickRef(bullet, /hit_object|hitFx|broken_effect/);
  vfx.explodeFor = bullet => pickRef(bullet, /ExplodeEffectTrigger\.creation|explode_obj|explode\b|smoke_object/);
  vfx.muzzleFor = weapon => (V.weapons[weapon] || null);
  function pickRef(name, re) {
    const r = V.refs[name]; if (!r) return null;
    for (const k in r) if (re.test(k)) return Array.isArray(r[k]) ? r[k][0] : r[k];
    return null;
  }

  // o: {ang (rad, trục +X của hiệu ứng trên màn hình), scale, flip, follow ({x,y[,ang]}), dx, dy, tint [r,g,b(,a)], state,
  //     layer ('top'|'ground'), dur (giây; bắt buộc để dừng hiệu ứng lặp), seed}
  vfx.spawn = function (G, name, x, y, o) {
    const def = V.effects[name];
    if (!def) { if (SK.warnOnce) SK.warnOnce('vfx' + name, 'vfx not found: ' + name); return null; }
    const list = G_list(G);
    if (list.length >= LIMIT.instances) { vfx.stats.dropped++; dropParticles(list.shift()); }
    o = o || {};
    const h = {
      name, def, x, y, ang: o.ang || 0, scale: o.scale || 1, flip: !!o.flip, follow: o.follow || null,
      dx: o.dx || 0, dy: o.dy || 0, tint: o.tint || null, state: o.state || null, layer: o.layer === 'ground' || o.layer === 'top' ? o.layer : null,
      t: 0, stopped: false, dead: false,
      life: o.dur != null ? o.dur : def.loop ? Infinity : def.dur,
      rnd: rng(o.seed != null ? o.seed : (seedCounter = (seedCounter * 1103515245 + 12345) >>> 0)),
      stop() { if (this.def.end && !this.ending) beginEnd(this); else this.stopped = true; }, kill() { this.dead = true; }
    };
    h.nodes = def.nodes.map(n => ({
      d: n, T: n.T ? n.T.slice() : [0, 0, 0, 0, 0, 0, 1, 1, 1, 1], on: !n.off, en: !(n.sr && n.sr.off), col: n.sr && n.sr.c ? n.sr.c.slice() : [1, 1, 1, 1],
      spr: n.sr ? n.sr.f : null, loc: new Array(12), W: new Array(12), dirty: true, vis: true, saOff: 0, spin: 0
    }));
    // Instantiate(prefab, vị trí, góc) ghi đè vị trí gốc: toạ độ gốc trong prefab (7.32 ở explode_energy*, 4.3,3.08 ở
    // bullet_with_light... [ĐO 355 hiệu ứng]) là dư thừa lúc dựng, không phải độ lệch. Buff gắn làm con của nhân vật thì
    // giữ vị trí cục bộ; chỉ tin khi lệch dọc (x ≈ 0, vd khiên 0,1) [ƯỚC LƯỢNG ngưỡng 0.5].
    const R0 = h.nodes[0].T;
    if (!(def.cat === 'buff' && Math.abs(R0[0]) < 0.5)) { R0[0] = 0; R0[1] = 0; R0[2] = 0; }
    for (const nd of h.nodes) if (nd.d.sa && nd.d.sa.rnd) nd.saOff = Math.floor(h.rnd() * nd.d.sa.f.length);
    h.sys = [];
    h.trails = [];
    h.nodes.forEach((nd, i) => {
      if (nd.d.ps) h.sys.push(newSystem(h, i, nd.d.ps));
      if (nd.d.tr && !nd.d.tr.off) h.trails.push({ i, d: nd.d.tr, pts: [] });
    });
    h.draws = [];
    h.nodes.forEach((nd, i) => {
      const d = nd.d;
      if (d.sr || d.sa) h.draws.push({ k: 'spr', i, L: d.sr ? d.sr.L : 0, o: (d.sr && d.sr.o) || 0 });
      if (d.ps) h.draws.push({ k: 'ps', i, L: d.ps.L, o: d.ps.o || 0 });
      if (d.tr) h.draws.push({ k: 'tr', i, L: d.tr.L, o: d.tr.o || 0 });
      if (d.ln && !d.ln.off) h.draws.push({ k: 'ln', i, L: d.ln.L, o: d.ln.o || 0 });
    });
    h.draws.sort((a, b) => (a.L - b.L) || (a.o - b.o) || (a.i - b.i));
    if (h.state && def.anims && o.dur == null && !def.loop) {
      for (const a of def.anims) {
        const c = a.st && a.st[h.state] != null ? a.clips[a.st[h.state]] : null;
        if (c && !c.loop) h.life = Math.max(h.life, c.len / (c.spd || 1));
      }
    }
    follow(h);
    applyAnims(h, 0);
    computeWorld(h);
    for (const s of h.sys) if (s.d.prewarm && s.d.loop) prewarm(h, s);
    list.push(h);
    return h;
  };

  // def.end (BuffIce): hết buff thì tách khỏi quái, đổi sprite (băng vỡ), đứng yên `after` giây rồi chạy trạng thái
  // `state` (disappear: mờ dần 1 s) và tắt. [ĐO BuffIce.BuffEnd]
  function beginEnd(h) {
    const e = h.def.end;
    h.ending = true; h.endT0 = h.t; h.follow = null;
    const root = h.nodes[0];
    if (e.spr) root.spr = e.spr;
    let len = 0;
    for (const a of h.def.anims || []) { const i = a.st && a.st[e.state]; if (i != null) len = Math.max(len, a.clips[i].len / (a.clips[i].spd || 1)); }
    h.life = h.t + (e.after || 0) + len;
    if (e.L != null) { for (const dr of h.draws) if (dr.i === 0 && dr.k === 'spr') dr.L = e.L; h.draws.sort((a, b) => (a.L - b.L) || (a.o - b.o) || (a.i - b.i)); }
  }

  function follow(h) {
    const f = h.follow;
    if (!f) return;
    if (f.dead || f.gone) { h.follow = null; h.stop(); return; }
    h.x = f.x + h.dx; h.y = f.y + h.dy;
    if (f.ang != null && h.followAng !== false) h.ang = f.ang;
  }

  // ---------------------------------------------------------------- clip Animator
  // anims[i] = {n, clips:[clip], seq:[chỉ số clip theo chuỗi mặc định], st?:{tên trạng thái: chỉ số}}
  // o.state lúc spawn chọn một trạng thái (vd explode_s: 'explode_small' | 'explode_big' | 'explode_nuclear').
  function applyAnims(h, t) {
    const an = h.def.anims;
    if (!an) return;
    for (const a of an) {
      let order = a.seq, ta = t;
      if (h.ending) {
        // trạng thái kết thúc chạy sau `after` giây; trước đó sprite đứng yên
        const e = h.def.end, i = a.st && a.st[e.state];
        ta = h.t - h.endT0 - (e.after || 0);
        if (i == null || ta < 0) continue;
        order = [i];
      } else if (h.state && a.st && a.st[h.state] != null) order = [a.st[h.state]];
      else if (!order || !order.length) {
        // Trạng thái mặc định rỗng: script gọi Play/SetTrigger. Chạy clip 0 (vd Explode -> explode_small) trừ khi mọi
        // trạng thái của nó là trạng thái kết thúc (buff_ice chỉ có 'disappear': băng phải đứng yên suốt lúc đóng băng).
        const names = a.st ? Object.keys(a.st).filter(k => a.st[k] === 0) : [];
        if (names.length && names.every(k => /disappear/i.test(k))) continue;
        order = [0];
      }
      let tt = ta, clip = null, ct = 0;
      for (let i = 0; i < order.length; i++) {
        const c = a.clips[order[i]], sp = c.spd || 1, len = c.len / sp;
        if (c.loop || i === order.length - 1) {
          clip = c;
          ct = c.loop && c.len > 0 ? (tt * sp) % c.len : Math.min(tt * sp, c.len);
          break;
        }
        if (tt < len) { clip = c; ct = tt * sp; break; }
        tt -= len;
      }
      if (!clip) continue;
      for (const cv of clip.curves) {
        const nd = h.nodes[cv.n]; if (!nd) continue;
        const k = cv.k;
        if (k === 'spr') {
          let i = 0; while (i < cv.s.length - 1 && ct >= cv.s[i + 1][0]) i++;
          nd.spr = cv.s[i][1];
          continue;
        }
        const v = clipVal(cv.s, ct);
        switch (k) {
          case 'px': nd.T[0] = v; nd.dirty = true; break;
          case 'py': nd.T[1] = v; nd.dirty = true; break;
          case 'pz': nd.T[2] = v; nd.dirty = true; break;
          case 'qx': nd.T[3] = v; nd.dirty = true; break;
          case 'qy': nd.T[4] = v; nd.dirty = true; break;
          case 'qz': nd.T[5] = v; nd.dirty = true; break;
          case 'qw': nd.T[6] = v; nd.dirty = true; break;
          case 'sx': nd.T[7] = v; nd.dirty = true; break;
          case 'sy': nd.T[8] = v; nd.dirty = true; break;
          case 'sz': nd.T[9] = v; nd.dirty = true; break;
          case 'ex': (nd.E || (nd.E = [0, 0, 0]))[0] = v; nd.dirtyE = true; break;
          case 'ey': (nd.E || (nd.E = [0, 0, 0]))[1] = v; nd.dirtyE = true; break;
          case 'ez': (nd.E || (nd.E = [0, 0, 0]))[2] = v; nd.dirtyE = true; break;
          case 'on': nd.on = v > 0.5; break;
          case 'en': nd.en = v > 0.5; break;
          case 'cr': nd.col[0] = v; break;
          case 'cg': nd.col[1] = v; break;
          case 'cb': nd.col[2] = v; break;
          case 'ca': nd.col[3] = v; break;
        }
      }
    }
  }

  function computeWorld(h) {
    const ns = h.nodes;
    for (let i = 0; i < ns.length; i++) {
      const nd = ns[i];
      if (nd.dirtyE) {
        const q = eulerQuat(nd.E[0], nd.E[1], nd.E[2]);
        nd.T[3] = q[0]; nd.T[4] = q[1]; nd.T[5] = q[2]; nd.T[6] = q[3];
        nd.dirtyE = false; nd.dirty = true;
      }
      if (nd.dirty || nd.spin) {
        const T = nd.T;
        trs(T[0], T[1], T[2], T[3], T[4], T[5], T[6], T[7], T[8], T[9], nd.loc);
        nd.dirty = false;
        if (nd.spin) { // ObjectRotate: quay thêm quanh Z cục bộ
          const a = nd.spin * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), L = nd.loc;
          for (let r = 0; r < 9; r += 3) { const x = L[r], y = L[r + 1]; L[r] = x * c + y * s; L[r + 1] = -x * s + y * c; }
        }
      }
      const p = nd.d.p;
      if (p < 0) { for (let j = 0; j < 12; j++) nd.W[j] = nd.loc[j]; nd.vis = nd.on; }
      else { mul(ns[p].W, nd.loc, nd.W); nd.vis = nd.on && ns[p].vis; }
    }
  }

  // gốc 2D: đơn vị Unity (y lên) -> px màn hình (y xuống), xoay ang theo chiều kim đồng hồ trên màn hình
  function rootMat(h) {
    const k = h.scale * U, c = Math.cos(h.ang), s = Math.sin(h.ang), fx = h.flip ? -1 : 1;
    return [k * c * fx, -k * s, k * s * fx, k * c, h.x, h.y]; // [a b; c d] áp lên (X, -Y)
  }
  // nút -> màn hình: trả [A00 A01 A02 A10 A11 A12 ox oy] (px trên mỗi đơn vị theo x,y,z cục bộ)
  function nodeScreen(R, W, out) {
    // màn hình = R2 * (W * p) với R2 = [[a, b],[c, d]] * diag(1,-1)
    const a = R[0], b = -R[1], c = R[2], d = -R[3];
    out[0] = a * W[0] + b * W[3]; out[1] = a * W[1] + b * W[4]; out[2] = a * W[2] + b * W[5];
    out[3] = c * W[0] + d * W[3]; out[4] = c * W[1] + d * W[4]; out[5] = c * W[2] + d * W[5];
    out[6] = R[4] + a * W[9] + b * W[10]; out[7] = R[5] + c * W[9] + d * W[10];
    return out;
  }

  // ---------------------------------------------------------------- hệ hạt
  function newSystem(h, i, d) {
    const s = { i, d, t: 0, acc: 0, parts: [], bursts: (d.bursts || []).map(() => ({ n: 0, next: 0 })), delay: 0, done: false, lastPos: null, k: [1, 1, 1] };
    s.delay = d.delay != null ? mm(d.delay, 0, h.rnd()) : 0;
    s.bursts.forEach((b, j) => { b.next = d.bursts[j][0]; });
    return s;
  }
  // scalingMode của ParticleSystem: 0 Hierarchy = thước cả cây; 1 Local = chỉ thước của chính nút (gốc thì cả thước
  // spawn o.scale); 2 Shape = thước chỉ nới vùng phát, cỡ hạt và chuyển động giữ nguyên đơn vị. S = khung vẽ của hệ;
  // s.k = hệ số nhân vị trí lúc phát (chế độ Shape).
  function sysScreen(h, s, R, S) {
    const nd = h.nodes[s.i];
    nodeScreen(R, nd.W, S);
    const m = s.d.scl;
    if (!m) return S;
    const W = nd.W;
    for (let j = 0; j < 3; j++) {
      const act = (Math.hypot(W[j], W[3 + j], W[6 + j]) || 1) * h.scale;
      const want = m === 1 ? Math.abs(nd.T[7 + j]) * (nd.d.p < 0 ? h.scale : 1) : 1;
      S[j] *= want / act; S[3 + j] *= want / act;
      s.k[j] = m === 2 ? act : 1;
    }
    return S;
  }
  function prewarm(h, s) {
    const step = 1 / 30, n = Math.min(90, Math.ceil(s.d.dur / step));
    const S = new Array(8);
    sysScreen(h, s, rootMat(h), S);
    for (let k = 0; k < n; k++) stepSystem(h, s, step, S);
  }

  const TMP_V = [0, 0, 0];
  function shapeSample(h, d, out, dir) {
    const sh = d.shape, r = h.rnd;
    let x = 0, y = 0, z = 0, dx = 0, dy = 0, dz = 1;
    if (sh) {
      const R = sh.r, arc = (sh.arc != null ? sh.arc : 360) * Math.PI / 180;
      const thick = sh.thick != null ? sh.thick : 1;
      switch (sh.t) {
        case 0: case 1: case 2: case 3: { // cầu / bán cầu
          const u = r() * 2 - 1, ph = r() * Math.PI * 2, rr = Math.sqrt(1 - u * u);
          dx = rr * Math.cos(ph); dy = rr * Math.sin(ph); dz = u;
          if (sh.t >= 2 && dz < 0) dz = -dz;
          const rad = R * (sh.t === 1 || sh.t === 3 ? 1 : (1 - thick) + thick * Math.cbrt(r()));
          x = dx * rad; y = dy * rad; z = dz * rad;
          break;
        }
        case 4: case 7: case 8: case 9: { // nón: đáy tròn XY, phóng theo +Z, góc mở theo khoảng cách tâm
          const ph = r() * arc, dd = sh.t === 7 || sh.t === 9 ? 1 : Math.sqrt((1 - thick) * (1 - thick) + r() * (1 - (1 - thick) * (1 - thick)));
          const cx = Math.cos(ph), cy = Math.sin(ph);
          const th = (sh.ang || 0) * Math.PI / 180 * dd;
          x = cx * R * dd; y = cy * R * dd;
          dx = cx * Math.sin(th); dy = cy * Math.sin(th); dz = Math.cos(th);
          if (sh.t >= 8) { const l = r() * (sh.len || 0); x += dx * l; y += dy * l; z += dz * l; }
          break;
        }
        case 5: case 15: case 16: case 18: { // hộp / chữ nhật (thước đo nằm trong ma trận shape)
          x = r() - 0.5; y = r() - 0.5; z = sh.t === 18 ? 0 : r() - 0.5;
          dx = 0; dy = 0; dz = 1;
          break;
        }
        case 10: case 11: { // tròn / viền tròn trên mặt XY
          const ph = r() * arc, rad = sh.t === 11 ? R : R * ((1 - thick) + thick * Math.sqrt(r()));
          dx = Math.cos(ph); dy = Math.sin(ph); dz = 0;
          x = dx * rad; y = dy * rad;
          break;
        }
        case 12: { // cạnh một phía: đoạn trên trục X, phóng theo +Y
          x = (r() * 2 - 1) * R; dx = 0; dy = 1; dz = 0;
          break;
        }
        case 17: { // bánh donut trên mặt XY
          const ph = r() * arc, tube = (sh.donut || 0) * Math.sqrt(r()), tp = r() * Math.PI * 2;
          dx = Math.cos(ph); dy = Math.sin(ph); dz = 0;
          const rad = R + tube * Math.cos(tp);
          x = dx * rad; y = dy * rad; z = tube * Math.sin(tp);
          break;
        }
        default: dx = 0; dy = 0; dz = 1;
      }
      if (sh.sphDir) {
        const l = Math.hypot(x, y, z) || 1, k = sh.sphDir;
        dx += (x / l - dx) * k; dy += (y / l - dy) * k; dz += (z / l - dz) * k;
      }
      if (sh.rndDir) {
        const u = r() * 2 - 1, ph = r() * Math.PI * 2, rr = Math.sqrt(1 - u * u), k = sh.rndDir;
        dx += (rr * Math.cos(ph) - dx) * k; dy += (rr * Math.sin(ph) - dy) * k; dz += (u - dz) * k;
      }
      if (sh.m) {
        const m = sh.m;
        const X = m[0] * x + m[1] * y + m[2] * z, Y = m[3] * x + m[4] * y + m[5] * z, Z = m[6] * x + m[7] * y + m[8] * z;
        x = X; y = Y; z = Z;
        const DX = m[0] * dx + m[1] * dy + m[2] * dz, DY = m[3] * dx + m[4] * dy + m[5] * dz, DZ = m[6] * dx + m[7] * dy + m[8] * dz;
        dx = DX; dy = DY; dz = DZ;
      }
      if (sh.pos) { x += sh.pos[0]; y += sh.pos[1]; z += sh.pos[2]; }
      const l = Math.hypot(dx, dy, dz) || 1;
      dx /= l; dy /= l; dz /= l;
    }
    out[0] = x; out[1] = y; out[2] = z;
    dir[0] = dx; dir[1] = dy; dir[2] = dz;
  }

  const P0 = [0, 0, 0], D0 = [0, 0, 1];
  function emit(h, s, S, n) {
    const d = s.d, r = h.rnd, st = d.dur ? (s.t % d.dur) / d.dur : 0;
    for (let k = 0; k < n; k++) {
      if (s.parts.length >= Math.min(d.max || 1000, LIMIT.perSystem) || vfx.stats.particles >= LIMIT.particles) { vfx.stats.dropped++; return; }
      shapeSample(h, d, P0, D0);
      const sp = mm(d.speed, st, r());
      const life = Math.max(0.01, mm(d.life, st, r()));
      const K = s.k;
      const p = {
        x: P0[0] * K[0], y: P0[1] * K[1], z: P0[2] * K[2], vx: D0[0] * sp, vy: D0[1] * sp, vz: D0[2] * sp,
        age: 0, life, size: mm(d.size, st, r()), sizeY: d.sizeY != null ? mm(d.sizeY, st, r()) : null,
        rot: d.rot != null ? mm(d.rot, st, r()) : 0, dirRot: 1,
        c: mmg(d.color, st, r()), r1: r(), r2: r(), r3: r(), r4: r(), gx: 0, gy: 0, gv: 0, wx: 0, wy: 0,
        frame0: 0, row: 0, S: null
      };
      if (d.flipRot && r() < d.flipRot) { p.dirRot = -1; p.rot = -p.rot; }
      if (d.uv) {
        p.frame0 = mm(d.uv.sf, 0, r());
        if (d.uv.anim === 1 && (d.uv.rowMode == null || d.uv.rowMode === 1)) p.row = Math.floor(r() * d.uv.ty);
        else p.row = d.uv.row || 0;
      }
      if (d.world) p.S = S.slice(); // mô phỏng thế giới: giữ khung toạ độ lúc sinh
      s.parts.push(p);
      vfx.stats.particles++;
    }
  }

  function stepSystem(h, s, dt, S) {
    const d = s.d;
    dt *= d.simSpeed || 1;
    // phát
    if (s.delay > 0) { s.delay -= dt; }
    else if (!s.done) {
      const t0 = s.t, t1 = s.t + dt;
      const emitting = !h.stopped;
      if (emitting && d.rate != null) {
        s.acc += mm(d.rate, d.dur ? (t0 % d.dur) / d.dur : 0, h.rnd()) * dt;
        const n = Math.floor(s.acc); s.acc -= n;
        if (n > 0) emit(h, s, S, n);
      }
      if (emitting && d.rateDist != null) {
        // rateOverDistance: theo quãng đường gốc hệ đi được (đơn vị Unity)
        if (s.lastPos) {
          const dist = Math.hypot(S[6] - s.lastPos[0], S[7] - s.lastPos[1]) / (U * h.scale);
          s.accD = (s.accD || 0) + mm(d.rateDist, d.dur ? (t0 % d.dur) / d.dur : 0, h.rnd()) * dist;
          const n = Math.floor(s.accD); s.accD -= n;
          if (n > 0) emit(h, s, S, Math.min(n, 50));
        }
        s.lastPos = [S[6], S[7]];
      }
      if (emitting && d.bursts) {
        d.bursts.forEach((b, j) => {
          const st = s.bursts[j];
          const cyc = b[2] || 0;
          while ((cyc === 0 || st.n < cyc) && st.next < t1 && st.next >= t0 - 1e-6) {
            if (b[4] >= 1 || h.rnd() < b[4]) emit(h, s, S, Math.round(mm(b[1], 0, h.rnd())));
            st.n++; st.next += Math.max(0.01, b[3] || 0.01);
            if (cyc === 1) break;
          }
        });
      }
      s.t = t1;
      if (d.dur && s.t >= d.dur) {
        if (d.loop) {
          s.t -= d.dur;
          s.bursts.forEach((st, j) => { st.n = 0; st.next = d.bursts[j][0]; });
        } else s.done = true;
      }
    }
    // mô phỏng
    const parts = s.parts;
    const grav = d.grav != null ? mm(d.grav, d.dur ? (s.t % d.dur) / d.dur : 0, 0.5) * 9.81 : 0;
    const vel = d.vel, lim = d.limit, force = d.force;
    let w = 0;
    for (let k = 0; k < parts.length; k++) {
      const p = parts[k];
      p.age += dt;
      if (p.age >= p.life) { vfx.stats.particles--; continue; }
      const a = p.age / p.life;
      if (force) {
        const fx = mm(force.x, a, p.r1), fy = mm(force.y, a, p.r2), fz = mm(force.z, a, p.r3);
        if (force.world) { p.wvx = (p.wvx || 0) + fx * dt; p.wvy = (p.wvy || 0) + fy * dt; }
        else { p.vx += fx * dt; p.vy += fy * dt; p.vz += fz * dt; }
      }
      if (lim) {
        const L = mm(lim.mag != null ? lim.mag : lim.x, a, p.r4);
        const sp = Math.hypot(p.vx, p.vy, p.vz);
        if (sp > L && sp > 0) { const k2 = (sp - (sp - L) * (lim.damp || 0)) / sp; p.vx *= k2; p.vy *= k2; p.vz *= k2; }
        if (lim.drag) { const k3 = Math.max(0, 1 - mm(lim.drag, a, p.r4) * dt); p.vx *= k3; p.vy *= k3; p.vz *= k3; }
      }
      let vx = p.vx, vy = p.vy, vz = p.vz;
      if (vel) {
        const m = vel.mul != null ? mm(vel.mul, a, p.r1) : 1;
        const ax = mm(vel.x, a, p.r1), ay = mm(vel.y, a, p.r2), az = mm(vel.z, a, p.r3);
        if (vel.world) { p.wx += ax * dt * m; p.wy += ay * dt * m; }
        else { vx += ax; vy += ay; vz += az; }
        vx *= m; vy *= m; vz *= m;
        if (vel.radial) {
          const rv = mm(vel.radial, a, p.r4), l = Math.hypot(p.x, p.y, p.z) || 1;
          vx += p.x / l * rv; vy += p.y / l * rv; vz += p.z / l * rv;
        }
        if (vel.orbZ) {
          const om = mm(vel.orbZ, a, p.r4) * dt, c = Math.cos(om), sn = Math.sin(om);
          const nx = p.x * c - p.y * sn, ny = p.x * sn + p.y * c; p.x = nx; p.y = ny;
        }
      }
      p.x += vx * dt; p.y += vy * dt; p.z += vz * dt;
      p.lvx = vx; p.lvy = vy; p.lvz = vz;
      if (p.wvx || p.wvy) { p.wx += (p.wvx || 0) * dt; p.wy += (p.wvy || 0) * dt; }
      if (grav) { p.gv += grav * dt; p.gy += p.gv * dt; }
      if (d.rol != null) p.rot += mm(d.rol, a, p.r2) * dt * p.dirRot;
      parts[w++] = p;
    }
    parts.length = w;
  }

  // ---------------------------------------------------------------- vòng đời
  vfx.update = function (G, dt) {
    const list = G.vfx;
    if (!list || !list.length) return;
    const S = new Array(8);
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const h = list[i];
      if (h.dead) { dropParticles(h); continue; }
      follow(h);
      h.t += dt;
      if (h.t >= h.life && !h.stopped) { if (h.def.end && !h.ending) beginEnd(h); else h.stopped = true; }
      applyAnims(h, h.t);
      for (const nd of h.nodes) {
        if (nd.d.spin) nd.spin = (nd.spin || 0) + nd.d.spin * dt;
        if (nd.d.die != null && h.t >= nd.d.die) nd.on = false;
      }
      computeWorld(h);
      const R = rootMat(h);
      let alive = !h.stopped;
      for (const s of h.sys) {
        const nd = h.nodes[s.i];
        sysScreen(h, s, R, S);
        // GameObject tắt = Unity xoá hạt của nó; đồng hồ hệ vẫn chạy
        if (!nd.vis) { if (s.parts.length) { vfx.stats.particles -= s.parts.length; s.parts.length = 0; } if (!h.stopped) s.t += dt; }
        else stepSystem(h, s, dt, S);
        if (s.parts.length) alive = true;
      }
      for (const tr of h.trails) {
        const nd = h.nodes[tr.i];
        nodeScreen(R, nd.W, S);
        const now = h.t;
        // Unity: đỉnh cố định mỗi khi đi xa hơn minVertexDistance, cộng một đỉnh đầu luôn ở vị trí hiện tại (tr.head).
        // (Trước đây dời đỉnh cuối theo vật: vật chậm hơn minD mỗi khung thì vệt chỉ có một điểm, không bao giờ hiện.)
        if (!h.stopped && nd.vis && !tr.d.noEmit) {
          const last = tr.pts[tr.pts.length - 1];
          const minD = (tr.d.minD || 0.1) * U * h.scale;
          if (!last || Math.hypot(S[6] - last[0], S[7] - last[1]) >= minD) tr.pts.push([S[6], S[7], now]);
          tr.head = [S[6], S[7], now];
        } else if (tr.head) { tr.pts.push(tr.head); tr.head = null; }
        while (tr.pts.length && now - tr.pts[0][2] > tr.d.time) tr.pts.shift();
        if (tr.pts.length + (tr.head ? 1 : 0) > 1) alive = true;
      }
      if (!alive) { dropParticles(h); continue; }
      list[w++] = h;
    }
    list.length = w;
  };
  function dropParticles(h) { for (const s of h.sys) { vfx.stats.particles -= s.parts.length; s.parts.length = 0; } }
  vfx.clear = function (G) { if (G.vfx) { for (const h of G.vfx) dropParticles(h); G.vfx.length = 0; } };

  // ---------------------------------------------------------------- vẽ
  // layer: 'top' | 'ground' | true (= ground, khớp chữ ký SK.drawFx) | undefined (tất cả).
  // Tự chia theo sorting layer thật [ĐO data.unity3d TagManager]: 1 BackGround, 2 Floor, 3 Shadow vẽ lượt 'ground'
  // (dưới nhân vật); 0 Default, 4 Wall, 5 Character, 6..8 tường/cửa, 9 Effect, 10 UI vẽ lượt 'top'. o.layer lúc spawn ép cả hiệu ứng.
  vfx.draw = function (ctx, G, layer) {
    const list = G.vfx;
    if (!list || !list.length) return;
    if (layer === true) layer = 'ground'; else if (layer === false) layer = 'top';
    const B = ctx.getTransform();
    const prevComp = ctx.globalCompositeOperation, prevAlpha = ctx.globalAlpha, prevSmooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    const S = new Array(8);
    for (const h of list) {
      if (layer && h.layer && h.layer !== layer) continue;
      const R = rootMat(h);
      drawn = 0;
      for (const dr of h.draws) {
        if (layer && !h.layer && ((dr.L >= 1 && dr.L <= 3) ? 'ground' : 'top') !== layer) continue;
        const nd = h.nodes[dr.i];
        if (dr.k === 'spr') { if (!h.stopped && nd.vis && nd.en) drawSprite(ctx, B, h, nd, R, S); }
        else if (dr.k === 'ps') drawSystem(ctx, B, h, h.sys.find(s => s.i === dr.i), R, S);
        else if (dr.k === 'tr') drawTrail(ctx, B, h, h.trails.find(t => t.i === dr.i));
        else if (dr.k === 'ln' && nd.vis && !h.stopped) drawLine(ctx, B, h, nd, R, S);
      }
      h.drawn = drawn;
    }
    ctx.setTransform(B);
    ctx.globalCompositeOperation = prevComp; ctx.globalAlpha = prevAlpha; ctx.imageSmoothingEnabled = prevSmooth;
  };

  let drawn = 0; // số lần vẽ của instance đang xét (h.drawn: công cụ xem biết hiệu ứng còn hiện gì không)
  function setT(ctx, B, a, b, c, d, e, f) {
    drawn++;
    ctx.setTransform(B.a * a + B.c * b, B.b * a + B.d * b, B.a * c + B.c * d, B.b * c + B.d * d, B.a * e + B.c * f + B.e, B.b * e + B.d * f + B.f);
  }
  function blendOf(b) { return b === 'add' ? 'lighter' : b === 'mul' ? 'multiply' : b === 'screen' ? 'screen' : 'source-over'; }

  function spriteFrame(h, nd) {
    const sa = nd.d.sa;
    if (sa && sa.f.length) {
      const n = sa.f.length, fi = Math.floor(h.t * (sa.fps || 10)) + nd.saOff + (sa.off || 0);
      if (sa.mode === 1) { if (fi >= n) return sa.hide ? null : sa.f[n - 1]; return sa.f[fi]; }
      if (sa.mode === 2) { const m = fi % (2 * n - 2 || 1); return sa.f[m < n ? m : 2 * n - 2 - m]; }
      return sa.f[fi % n];
    }
    return nd.spr;
  }

  function drawSprite(ctx, B, h, nd, R, S) {
    const fname = spriteFrame(h, nd);
    const f = fname && FR[fname];
    if (!f) return;
    const img = pageImg(f[0]); if (!img) return;
    nodeScreen(R, nd.W, S);
    const k = (f[7] || 1) / U, sr = nd.d.sr || {};
    const fx = sr.fx ? -1 : 1, fy = sr.fy ? -1 : 1;
    let c = nd.col;
    const t = h.tint, m = sr.tint; // m: tint vật liệu (shader Particles cổ = 2 × _TintColor, có thể > 1)
    const cr = c[0] * (t ? t[0] : 1) * (m ? m[0] : 1), cg = c[1] * (t ? t[1] : 1) * (m ? m[1] : 1), cb = c[2] * (t ? t[2] : 1) * (m ? m[2] : 1);
    const ca = c[3] * (t && t[3] != null ? t[3] : 1) * (m ? m[3] : 1);
    if (ca <= 0.003) return;
    ctx.globalAlpha = Math.min(1, ca);
    ctx.globalCompositeOperation = blendOf(sr.b);
    // (u,v) pixel sprite -> đơn vị: X = u*k, Y = -v*k
    setT(ctx, B, S[0] * k * fx, S[3] * k * fx, -S[1] * k * fy, -S[4] * k * fy, S[6], S[7]);
    const tc = tinted(fname, Math.min(1, cr), Math.min(1, cg), Math.min(1, cb));
    ctx.imageSmoothingEnabled = SMOOTH.has(fname);
    if (tc) ctx.drawImage(tc, -f[5], -f[6]);
    else ctx.drawImage(img, f[1], f[2], f[3], f[4], -f[5], -f[6], f[3], f[4]);
  }

  function drawSystem(ctx, B, h, s, R, S) {
    if (!s || !s.parts.length) return;
    const d = s.d, nd = h.nodes[s.i];
    const fname = d.tex, f = FR[fname];
    if (!f) return;
    const img = pageImg(f[0]); if (!img) return;
    sysScreen(h, s, R, S);
    ctx.globalCompositeOperation = blendOf(d.blend);
    ctx.imageSmoothingEnabled = SMOOTH.has(fname);
    const tint = d.tint, ht = h.tint;
    // cỡ hạt theo thước của nút (chế độ Hierarchy) và thước gốc
    const scl = Math.sqrt(Math.abs(S[0] * S[4] - S[1] * S[3])) || h.scale * U;
    const uv = d.uv;
    const sprs = uv && uv.mode === 1 && uv.spr && uv.spr.length ? uv.spr : null;
    const nFrames = uv ? (sprs ? sprs.length : (uv.anim === 1 ? uv.tx : uv.tx * uv.ty)) : 1;
    for (const p of s.parts) {
      const a = p.age / p.life;
      const M = p.S || S;
      let px = M[6] + M[0] * p.x + M[1] * p.y + M[2] * p.z, py = M[7] + M[3] * p.x + M[4] * p.y + M[5] * p.z;
      const pscl = p.S ? (Math.sqrt(Math.abs(M[0] * M[4] - M[1] * M[3])) || scl) : scl;
      px += p.wx * U * h.scale; py -= p.wy * U * h.scale;
      py += p.gy * U * h.scale;
      let sz = p.size * pscl;
      let szY = p.sizeY != null ? p.sizeY * pscl : sz;
      if (d.sol != null) { const m = mm(d.sol, a, p.r3); sz *= m; szY *= d.solY != null ? mm(d.solY, a, p.r3) : m; }
      if (d.maxSize) { const cap = d.maxSize * 225 * 2; if (sz > cap) { szY *= cap / sz; sz = cap; } }
      if (sz < 0.25 && szY < 0.25) continue;
      let c0 = p.c[0], c1 = p.c[1], c2 = p.c[2], c3 = p.c[3];
      if (d.col) { const g = mmg(d.col, a, p.r4); c0 *= g[0]; c1 *= g[1]; c2 *= g[2]; c3 *= g[3]; }
      if (tint) { c0 *= tint[0]; c1 *= tint[1]; c2 *= tint[2]; c3 *= tint[3]; }
      if (ht) { c0 *= ht[0]; c1 *= ht[1]; c2 *= ht[2]; if (ht[3] != null) c3 *= ht[3]; }
      if (c3 <= 0.004) continue;
      // khung texture sheet
      let fn = fname, ff = f, sx = f[1], sy = f[2], sw = f[3], sh = f[4], fr = 0;
      if (uv && (nFrames > 1 || sprs)) { // chế độ Sprite dù chỉ một sprite: vẽ sprite đó, không phải texture vật liệu
        if (uv.time === 2) fr = Math.floor(p.age * (uv.fps || 30));
        else fr = Math.floor((mm(uv.fot, (a * (uv.cyc || 1)) % 1, p.r1) + (typeof p.frame0 === 'number' ? p.frame0 : 0)) * nFrames);
        fr = ((fr % nFrames) + nFrames) % nFrames;
        if (sprs) { fn = sprs[fr]; ff = FR[fn]; if (!ff) continue; sx = ff[1]; sy = ff[2]; sw = ff[3]; sh = ff[4]; }
        else {
          const cw = f[3] / uv.tx, ch = f[4] / uv.ty;
          const col = uv.anim === 1 ? fr : fr % uv.tx, row = uv.anim === 1 ? p.row : Math.floor(fr / uv.tx);
          sx = f[1] + col * cw; sy = f[2] + row * ch; sw = cw; sh = ch;
        }
      }
      ctx.globalAlpha = Math.min(1, c3);
      let rot = p.rot;
      let w = sz, hgt = szY;
      if (d.rm === 1) { // kéo dài theo vận tốc (trên màn hình)
        const vx = M[0] * p.lvx + M[1] * p.lvy + M[2] * p.lvz, vy = M[3] * p.lvx + M[4] * p.lvy + M[5] * p.lvz;
        const vlen = Math.hypot(vx, vy);
        // [ĐO] texture dành cho chế độ này (#triangle_soft, #circlestretchy) vẽ ngang, đầu nhọn bên trái:
        // trục X của ảnh nằm theo vận tốc, mép trái đi trước
        rot = Math.atan2(vy, vx) + Math.PI;
        w = sz * (d.lenScale || 1) + vlen * (d.velScale || 0);
        hgt = szY;
      }
      const cs = Math.cos(rot), sn = Math.sin(rot);
      if (sprs && d.rm !== 1) {
        // [ĐO 610 hệ pixel art] chế độ Sprite: cỡ hạt = bề rộng rect của sprite (cao theo tỉ lệ ảnh), hạt đặt ở pivot.
        // VerticleStrike 16×64 px cỡ 1 -> đúng 16 px rộng; luật "cạnh dài = cỡ" cho tia sét 4 px, mưa 1×8 rộng 0,1 px.
        const rw = (uv.rw && uv.rw[fr]) || sw * (ff[7] || 1), kx = w / rw, ky = hgt / rw, s7 = ff[7] || 1;
        setT(ctx, B, cs * kx * s7, sn * kx * s7, -sn * ky * s7, cs * ky * s7, px, py);
        drawCell(ctx, fn, ff, c0, c1, c2, p, sx, sy, sw, sh, -ff[5], -ff[6]);
        continue;
      }
      setT(ctx, B, cs * w / sw, sn * w / sw, -sn * hgt / sh, cs * hgt / sh, px, py);
      drawCell(ctx, fn, ff, c0, c1, c2, p, sx, sy, sw, sh, -sw / 2, -sh / 2);
    }
  }
  // một ô texture (sx,sy,sw,sh trên trang atlas) nhuộm màu (c0,c1,c2), góc trên-trái ở (dx,dy) của khung vẽ hiện tại.
  // p (hạt, có thể null) giữ khoá màu lượng tử 4 bit/kênh: khỏi ghép chuỗi tra cache mỗi khung.
  function drawCell(ctx, fn, ff, c0, c1, c2, p, sx, sy, sw, sh, dx, dy) {
    if (fn === '#white') { // ô vuông đặc (vật liệu không có _MainTex): tô thẳng đúng màu, khỏi nhuộm lượng tử
      ctx.fillStyle = 'rgb(' + (Math.min(1, c0) * 255 + 0.5 | 0) + ',' + (Math.min(1, c1) * 255 + 0.5 | 0) + ',' + (Math.min(1, c2) * 255 + 0.5 | 0) + ')';
      ctx.fillRect(dx, dy, sw, sh);
      return;
    }
    const qk = (Math.round(Math.min(1, c0) * 15) << 8) | (Math.round(Math.min(1, c1) * 15) << 4) | Math.round(Math.min(1, c2) * 15);
    let tc = null;
    if (qk !== 0xFFF) {
      if (p && p.qk === qk && p.qf === fn) tc = p.qc;
      else { tc = tinted(fn, Math.min(1, c0), Math.min(1, c1), Math.min(1, c2)); if (p) { p.qk = qk; p.qf = fn; p.qc = tc; } }
    }
    if (tc) ctx.drawImage(tc, sx - ff[1], sy - ff[2], sw, sh, dx, dy, sw, sh);
    else { const im2 = pageImg(ff[0]); if (im2) ctx.drawImage(im2, sx, sy, sw, sh, dx, dy, sw, sh); }
  }

  // Dải TrailRenderer / LineRenderer. P: [[x, y]] px màn hình từ đầu (0) tới đuôi. Unity [ĐO dữ liệu + tài liệu
  // LineRenderer]: bề rộng (widthCurve × widthMultiplier) và màu (colorGradient × tint vật liệu) lấy theo phần quãng
  // đường từ đầu; texture theo textureMode: 0 Stretch (u = phần quãng đường), 1 Tile (u = quãng đường đơn vị Unity),
  // 2 DistributePerSegment (u = chỉ số / số đoạn), 3 RepeatPerSegment (u = chỉ số), 4 Static (quãng đường tính từ
  // đuôi, texture đứng yên); rồi u × tiling + offset của
  // _MainTex. v = 0..1 ngang bề rộng. Mỗi đoạn là một tứ giác nối pháp tuyến trung bình ở đỉnh (không chồng mép như nét
  // bút round-cap cũ, vốn đậm lên ở mỗi khớp khi vệt trong mờ).
  const STRIP = { n: [], w: [], c: [], u: [], L: [] };
  function drawStrip(ctx, B, h, d, P) {
    const n = P.length;
    if (n < 2) return;
    const T = STRIP, k = U * h.scale;
    let tot = 0;
    T.L[0] = 0;
    for (let i = 1; i < n; i++) { tot += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); T.L[i] = tot; }
    if (tot < 0.5) return;
    const tint = d.tint, ht = h.tint, st = d.st, tm = d.tm || 0;
    for (let i = 0; i < n; i++) {
      const f = T.L[i] / tot;
      T.w[i] = (d.w.c.length ? curve(d.w.c, f) : 1) * d.w.m * k;
      const c = d.g ? grad(d.g, f) : [1, 1, 1, 1];
      if (tint) { c[0] *= tint[0]; c[1] *= tint[1]; c[2] *= tint[2]; c[3] *= tint[3]; }
      if (ht) { c[0] *= ht[0]; c[1] *= ht[1]; c[2] *= ht[2]; if (ht[3] != null) c[3] *= ht[3]; }
      T.c[i] = c;
      let u = tm === 1 ? T.L[i] / k : tm === 2 ? i / (n - 1) : tm === 3 ? i : tm === 4 ? (tot - T.L[i]) / k : f;
      if (st) u = u * st[0] + st[2];
      T.u[i] = u;
      // pháp tuyến trung bình của hai đoạn kề
      const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      T.n[i] = [-dy / l, dx / l];
    }
    const fname = d.tex, ff = fname && fname !== '#white' ? FR[fname] : null;
    const img = ff && pageImg(ff[0]);
    if (ff && !img) return; // trang atlas chưa tải
    ctx.globalCompositeOperation = blendOf(d.blend);
    ctx.imageSmoothingEnabled = !!ff && SMOOTH.has(fname);
    for (let i = 0; i < n - 1; i++) {
      const w0 = T.w[i], w1 = T.w[i + 1];
      if (w0 < 0.3 && w1 < 0.3) continue;
      const c0 = T.c[i], c1 = T.c[i + 1];
      const al = (c0[3] + c1[3]) / 2;
      if (al <= 0.004) continue;
      const r = (c0[0] + c1[0]) / 2, g = (c0[1] + c1[1]) / 2, bb = (c0[2] + c1[2]) / 2;
      ctx.globalAlpha = Math.min(1, al);
      const A = P[i], Bp = P[i + 1], nA = T.n[i], nB = T.n[i + 1];
      if (!ff) {
        setT(ctx, B, 1, 0, 0, 1, 0, 0);
        ctx.fillStyle = 'rgb(' + (Math.min(1, r) * 255 + 0.5 | 0) + ',' + (Math.min(1, g) * 255 + 0.5 | 0) + ',' + (Math.min(1, bb) * 255 + 0.5 | 0) + ')';
        ctx.beginPath();
        ctx.moveTo(A[0] + nA[0] * w0 / 2, A[1] + nA[1] * w0 / 2); ctx.lineTo(Bp[0] + nB[0] * w1 / 2, Bp[1] + nB[1] * w1 / 2);
        ctx.lineTo(Bp[0] - nB[0] * w1 / 2, Bp[1] - nB[1] * w1 / 2); ctx.lineTo(A[0] - nA[0] * w0 / 2, A[1] - nA[1] * w0 / 2);
        ctx.closePath(); ctx.fill();
        continue;
      }
      // texture: tứ giác đúng (cạnh chung với đoạn kề ở mỗi đỉnh) chia hai tam giác, mỗi tam giác một phép affine + clip.
      // (Hình bình hành một phép affine lệch mép ở khớp gấp: vệt rộng hiện răng cưa sọc tối.)
      const ax0 = A[0] + nA[0] * w0 / 2, ay0 = A[1] + nA[1] * w0 / 2, ax1 = A[0] - nA[0] * w0 / 2, ay1 = A[1] - nA[1] * w0 / 2;
      const bx0 = Bp[0] + nB[0] * w1 / 2, by0 = Bp[1] + nB[1] * w1 / 2, bx1 = Bp[0] - nB[0] * w1 / 2, by1 = Bp[1] - nB[1] * w1 / 2;
      const ua = T.u[i], ub = T.u[i + 1];
      if (ua === ub) continue;
      const lo = Math.min(ua, ub), hi = Math.max(ua, ub), sh = ff[4];
      // cắt theo biên số nguyên (texture lặp, wrap Repeat)
      for (let q = Math.floor(lo); q < hi; q++) {
        const p0 = Math.max(lo, q), p1 = Math.min(hi, q + 1);
        if (p1 - p0 < 1e-6) continue;
        // vị trí s (0 = A, 1 = B) của hai mép miếng; toạ độ cục bộ = điểm ảnh của cả khung (x = (u - q) × rộng, y = v × cao).
        // Vẽ cả khung rồi để clip cắt: cắt ô nguồn lẻ điểm ảnh (sx, sw không nguyên) thì Chrome làm tròn -> khe tối giữa các đoạn.
        const fw = ff[3], xa = (p0 - q) * fw, xb = (p1 - q) * fw;
        const s0 = (p0 - ua) / (ub - ua), s1 = (p1 - ua) / (ub - ua);
        const P0x = ax0 + (bx0 - ax0) * s0, P0y = ay0 + (by0 - ay0) * s0, Q0x = ax1 + (bx1 - ax1) * s0, Q0y = ay1 + (by1 - ay1) * s0;
        const P1x = ax0 + (bx0 - ax0) * s1, P1y = ay0 + (by0 - ay0) * s1, Q1x = ax1 + (bx1 - ax1) * s1, Q1y = ay1 + (by1 - ay1) * s1;
        texTri(ctx, B, fname, ff, r, g, bb, xa, 0, P0x, P0y, xb, 0, P1x, P1y, xa, sh, Q0x, Q0y);
        texTri(ctx, B, fname, ff, r, g, bb, xb, 0, P1x, P1y, xb, sh, Q1x, Q1y, xa, sh, Q0x, Q0y);
      }
    }
  }
  // Vẽ tam giác (x0,y0)(x1,y1)(x2,y2) (điểm ảnh của khung ff) lên tam giác màn hình (X0,Y0)... bằng affine + clip.
  function texTri(ctx, B, fname, ff, r, g, bb, x0, y0, X0, Y0, x1, y1, X1, Y1, x2, y2, X2, Y2) {
    const ux = x1 - x0, uy = y1 - y0, vx = x2 - x0, vy = y2 - y0, det = ux * vy - vx * uy;
    if (Math.abs(det) < 1e-9) return;
    const px = X1 - X0, py = Y1 - Y0, qx = X2 - X0, qy = Y2 - Y0;
    if (Math.abs(px * qy - qx * py) < 0.05) return; // tam giác màn hình suy biến
    const a = (px * vy - qx * uy) / det, c = (qx * ux - px * vx) / det;
    const b = (py * vy - qy * uy) / det, d = (qy * ux - py * vx) / det;
    const e = X0 - a * x0 - c * y0, f = Y0 - b * x0 - d * y0;
    ctx.save();
    ctx.setTransform(B);
    ctx.beginPath(); ctx.moveTo(X0, Y0); ctx.lineTo(X1, Y1); ctx.lineTo(X2, Y2); ctx.closePath();
    ctx.clip();
    setT(ctx, B, a, b, c, d, e, f);
    drawCell(ctx, fname, ff, r, g, bb, null, ff[1], ff[2], ff[3], ff[4], 0, 0);
    ctx.restore();
  }

  function drawTrail(ctx, B, h, tr) {
    if (!tr) return;
    const n = tr.pts.length + (tr.head ? 1 : 0);
    if (n < 2) return;
    const P = new Array(n);
    let j = 0;
    if (tr.head) P[j++] = tr.head;
    for (let i = tr.pts.length - 1; i >= 0; i--) P[j++] = tr.pts[i];
    drawStrip(ctx, B, h, tr.d, P);
  }

  function drawLine(ctx, B, h, nd, R, S) {
    const d = nd.d.ln, pts = d.pts;
    if (!pts || pts.length < 2) return;
    nodeScreen(R, nd.W, S);
    const Rm = rootMat(h);
    const P = pts.map(p => d.world ? [Rm[4] + Rm[0] * p[0] - Rm[1] * p[1], Rm[5] + Rm[2] * p[0] - Rm[3] * p[1]] : [S[6] + S[0] * p[0] + S[1] * p[1], S[7] + S[3] * p[0] + S[4] * p[1]]);
    if (d.loop) P.push(P[0]);
    drawStrip(ctx, B, h, d, P);
  }

  // ---------------------------------------------------------------- móc vào vòng lặp game mà không sửa tệp chung:
  // bọc SK.updateFx / SK.drawFx (actors.js) — game.js gọi chúng mỗi bước / mỗi khung.
  vfx.hook = function () {
    if (SK.updateFx && !SK.updateFx._vfx) {
      const u = SK.updateFx;
      SK.updateFx = function (G, dt) { u(G, dt); vfx.update(G, dt); };
      SK.updateFx._vfx = 1;
    }
    if (SK.drawFx && !SK.drawFx._vfx) {
      const d0 = SK.drawFx;
      SK.drawFx = function (ctx, G, ground) { d0(ctx, G, ground); vfx.draw(ctx, G, ground ? 'ground' : 'top'); };
      SK.drawFx._vfx = 1;
    }
    if (SK.on && !vfx._runHook) { vfx._runHook = 1; SK.on('stageEnter', G => vfx.clear(G)); }
    return !!(SK.updateFx && SK.updateFx._vfx);
  };
  if (!vfx.hook()) addEventListener('DOMContentLoaded', () => vfx.hook());
})();
