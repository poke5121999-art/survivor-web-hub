/*
 * Hệ hạt dùng chung: chạy ParticleSystem gốc của DREDGE theo đúng tên prefab/GameObject (data/particles.js, sinh bởi
 * tools/particles.py từ YAML AssetRipper + shader đã biên dịch trong bundle).
 *   DRParticles.init(scene)                 gọi một lần khi tải xong thế giới (main.js)
 *   DRParticles.update(dt, camera)          mỗi khung (main.js)
 *   DRParticles.spawn(name, { pos:[x,y,z]|Vector3, parent:Object3D, yaw, scale, loop, follow:'camera'|'player',
 *                              startLifetime, mini, emit, size, lifetime }) → { stop(), setRate(k), setRateOverTime(r), alive, systems, name }
 *     pos/yaw/parent theo toạ độ three.js. parent: hệ bám vật (HullCriticalEffects chọn biến thể theo parent.name 'Boat<N>').
 *     setRate(k): nhân rateOverTime/rateOverDistance/burst của mọi hệ (khói ống khói: k = burn²).
 *     setRateOverTime(r): đặt thẳng emission.rateOverTime = r hạt/giây cho hệ gốc (nút 0), như WeatherController.cs:418,424
 *       gán emissionRainModule/emissionSnowModule.rateOverTime; r tính theo thời gian mô phỏng (nhân simulationSpeed như Unity).
 *       Không nhân với setRate. null = trả về giá trị trong dữ liệu.
 *     setSimulationSpeed(v): main.simulationSpeed của hệ gốc (WeatherController.cs:417,423 _rainSpeed/_snowSpeed); null = dữ liệu.
 *     setSubEmitProbability(i, p): xác suất sub-emitter thứ i của hệ gốc (SetSubEmitterEmitProbability, WeatherController.cs:419).
 *     stop(): ngừng phát; hạt đang sống chạy hết đời rồi hệ tự giải phóng (alive = false).
 *     Hiệu ứng có hệ gốc loop + playOnAwake (Rain, Snow, khói...) hoặc spawn với loop: true thì giữ sống tới khi stop(),
 *     kể cả lúc rate 0 không còn hạt nào (Snow trong cảnh có rate 0/s, chỉ sống nhờ WeatherController đặt rate).
 *   DRParticles.has(name)  DRParticles.names()  DRParticles.stats()  DRParticles.setGate(name, on)
 * Nguồn đặt sẵn (window.DR_PARTICLES_SCENE): lửa trại Twisted Strand + bến Old Mayor, lấp lánh đêm Stellar Basin (cửa sổ giờ
 * TimeOfDayParticles.cs:14-41 theo DR.s.time), lỗ phun Devil's Spine (bọt nổi theo sóng: SimpleBuoyantObject.cs:28-44),
 * lấp lánh vật kiểm tra, sương đền thờ, đá rơi + bụi Gale Cliffs, bụi nước thác. Bật/tắt theo dải khoảng cách CullingBrain
 * (CullingBrain.cs:118-147, boundingDistances trong Odin) cắt thêm theo tầm sương; bật lại thì chạy lại từ đầu như SetActive.
 *
 * Mô phỏng chạy trong hệ toạ độ Unity (tay trái, như dữ liệu); khi vẽ đổi z → −z (three.js tay phải).
 * Module: main (không gian local/world, prewarm, delay, startX 2 hằng/đường cong), emission (rate, burst, rateOverDistance),
 * shape (sphere, hemisphere, cone, coneVolume, circle, edge, box, donut, rectangle), velocityOverLifetime (x/y/z local hoặc
 * world, orbital, radial, speedModifier), limitVelocity (dampen, drag), inheritVelocity (Initial/Current),
 * lifetimeByEmitterSpeed, sizeOverLifetime (3 trục), rotationOverLifetime, colorOverLifetime, noise (xấp xỉ),
 * textureSheetAnimation (Sprites), subEmitters (Birth, Death). Bỏ: collision, trails (vẽ hạt, không vẽ vệt) [ĐỀ XUẤT].
 * Vẽ: mỗi lô (vật liệu + texture + kiểu mesh) một InstancedMesh, một draw call; quad tự dựng billboard/stretched/
 * horizontal/vertical trong vertex shader; mesh hạt dùng mesh gốc. Blend/ZWrite/ZTest/Cull lấy từ shader đã biên dịch.
 * Thân shader rã từ DXBC (tools/particles.py --dis): Particle_Shader (Lighting None/Half/Full, IgnoreFog, FadeAtWorldYZero,
 * Emission ×4), FloatingParticle (FoamColoured, SnapToWaterSurface, cắt alpha 0,5), CutOutParticle (cắt 0,3), FireGlow,
 * CutsceneOpaque (×EmissionBoost), AlwaysOnTop, FogDevil (shimmer xoắn, sương mũ 25), ShimmerWarp (cộng màu).
 */
(function (root) {
  'use strict';
  const DATA = root.DR_PARTICLES || {}, SCENE = root.DR_PARTICLES_SCENE || [], LIB = root.DR_PARTICLES_LIB || { textures: {}, sprites: {}, meshes: {} };
  const G = 9.81;
  let T = null, scene = null, ready = false, camObj = null;
  const effects = [];          // hiệu ứng đang chạy
  const gates = { OldMayorDock: true };
  const warned = {};
  const stat = { effects: 0, systems: 0, particles: 0, batches: 0, emitted: 0 };

  // ---------------------------------------------------------------- đường cong / gradient Unity
  function curve(keys, t) {
    const n = keys.length;
    if (!n) return 0;
    if (t <= keys[0][0]) return keys[0][1];
    const l = keys[n - 1];
    if (t >= l[0]) return l[1];
    for (let i = 1; i < n; i++) {
      const b = keys[i];
      if (t > b[0]) continue;
      const a = keys[i - 1], d = b[0] - a[0];
      if (d <= 0) return b[1];
      if (Math.abs(a[3]) > 1e20 || Math.abs(b[2]) > 1e20) return a[1]; // tiếp tuyến vô hạn = bậc thang
      const u = (t - a[0]) / d, u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * a[1] + (u3 - 2 * u2 + u) * a[3] * d + (-2 * u3 + 3 * u2) * b[1] + (u3 - u2) * b[2] * d;
    }
    return l[1];
  }
  // MinMaxCurve: {c} | {min,max} (minMaxState 3) | {curve,k} | {curveMin,curveMax,k}
  function ev(m, t, r) {
    if (!m) return 0;
    if (m.c !== undefined) return m.c;
    if (m.min !== undefined) return m.min + (m.max - m.min) * r;
    if (m.curve) return curve(m.curve, t) * m.k;
    const a = curve(m.curveMin, t);
    return (a + (curve(m.curveMax, t) - a) * r) * m.k;
  }
  function gradAt(g, t, out) {
    const c = g.c, a = g.a, fixed = g.mode === 1;
    let i = 0;
    if (t <= c[0][0]) { out[0] = c[0][1]; out[1] = c[0][2]; out[2] = c[0][3]; }
    else {
      for (i = 1; i < c.length && t > c[i][0]; i++);
      if (i >= c.length) { const l = c[c.length - 1]; out[0] = l[1]; out[1] = l[2]; out[2] = l[3]; }
      else {
        const p = c[i - 1], q = c[i], k = fixed ? 1 : (t - p[0]) / ((q[0] - p[0]) || 1);
        out[0] = p[1] + (q[1] - p[1]) * k; out[1] = p[2] + (q[2] - p[2]) * k; out[2] = p[3] + (q[3] - p[3]) * k;
      }
    }
    if (t <= a[0][0]) out[3] = a[0][1];
    else {
      for (i = 1; i < a.length && t > a[i][0]; i++);
      if (i >= a.length) out[3] = a[a.length - 1][1];
      else { const p = a[i - 1], q = a[i]; out[3] = fixed ? q[1] : p[1] + (q[1] - p[1]) * (t - p[0]) / ((q[0] - p[0]) || 1); }
    }
    return out;
  }
  const tmpC = [0, 0, 0, 0], tmpC2 = [0, 0, 0, 0];
  // MinMaxGradient: {color} | {gradient} | {min,max} | {gradMin,gradMax} | {randomColor}
  function evCol(m, t, r, out) {
    if (m.color) { out[0] = m.color[0]; out[1] = m.color[1]; out[2] = m.color[2]; out[3] = m.color[3]; return out; }
    if (m.gradient) return gradAt(m.gradient, t, out);
    if (m.min) { for (let i = 0; i < 4; i++) out[i] = m.min[i] + (m.max[i] - m.min[i]) * r; return out; }
    if (m.gradMin) { gradAt(m.gradMin, t, tmpC2); gradAt(m.gradMax, t, out); for (let i = 0; i < 4; i++) out[i] = tmpC2[i] + (out[i] - tmpC2[i]) * r; return out; }
    if (m.randomColor) return gradAt(m.randomColor, r, out);
    out[0] = out[1] = out[2] = out[3] = 1; return out;
  }
  const s2l = c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const l2s = c => c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  // ColorOverLifetime dạng một gradient: bảng 64 mẫu đã đổi tuyến tính (sRGB gần như nhân được: lin(a·b) ≈ lin(a)·lin(b))
  function colLut(g) {
    if (g._lut) return g._lut;
    const L = new Float32Array(65 * 4), c = [0, 0, 0, 0];
    for (let k = 0; k <= 64; k++) { gradAt(g, k / 64, c); L[k * 4] = s2l(c[0]); L[k * 4 + 1] = s2l(c[1]); L[k * 4 + 2] = s2l(c[2]); L[k * 4 + 3] = c[3]; }
    return (g._lut = L);
  }

  // ---------------------------------------------------------------- ma trận 4x4 (cột trước như three.js) trong hệ Unity
  function compose(p, q, s, out) {
    const [x, y, z, w] = q, x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
    out[0] = (1 - (yy + zz)) * s[0]; out[1] = (xy + wz) * s[0]; out[2] = (xz - wy) * s[0]; out[3] = 0;
    out[4] = (xy - wz) * s[1]; out[5] = (1 - (xx + zz)) * s[1]; out[6] = (yz + wx) * s[1]; out[7] = 0;
    out[8] = (xz + wy) * s[2]; out[9] = (yz - wx) * s[2]; out[10] = (1 - (xx + yy)) * s[2]; out[11] = 0;
    out[12] = p[0]; out[13] = p[1]; out[14] = p[2]; out[15] = 1;
    return out;
  }
  function mul(a, b, out) {
    const r = out === a || out === b ? new Float64Array(16) : out;
    for (let c = 0; c < 4; c++) for (let rr = 0; rr < 4; rr++) {
      r[c * 4 + rr] = a[rr] * b[c * 4] + a[4 + rr] * b[c * 4 + 1] + a[8 + rr] * b[c * 4 + 2] + a[12 + rr] * b[c * 4 + 3];
    }
    if (r !== out) out.set(r);
    return out;
  }
  // three.js → Unity: M_u = S·M·S, S = diag(1, 1, −1, 1)
  function fromThree(e, out) {
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) out[c * 4 + r] = ((r === 2) !== (c === 2)) ? -e[c * 4 + r] : e[c * 4 + r];
    return out;
  }
  const M4 = () => new Float64Array(16);
  function colLen(m, c) { return Math.hypot(m[c * 4], m[c * 4 + 1], m[c * 4 + 2]); }
  // quaternion của phần quay (đã chia tỉ lệ cột)
  function mquat(m, out) {
    const sx = colLen(m, 0) || 1, sy = colLen(m, 1) || 1, sz = colLen(m, 2) || 1;
    const m00 = m[0] / sx, m10 = m[1] / sx, m20 = m[2] / sx, m01 = m[4] / sy, m11 = m[5] / sy, m21 = m[6] / sy, m02 = m[8] / sz, m12 = m[9] / sz, m22 = m[10] / sz;
    const tr = m00 + m11 + m22;
    let x, y, z, w;
    if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); w = 0.25 / s; x = (m21 - m12) * s; y = (m02 - m20) * s; z = (m10 - m01) * s; }
    else if (m00 > m11 && m00 > m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s; }
    else if (m11 > m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s; }
    else { const s = 2 * Math.sqrt(1 + m22 - m00 - m11); w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s; }
    out[0] = x; out[1] = y; out[2] = z; out[3] = w;
    return out;
  }
  // Quaternion.Euler của Unity (độ hoặc radian): quay Z, rồi X, rồi Y
  function euler(x, y, z, out) {
    const cx = Math.cos(x / 2), sx = Math.sin(x / 2), cy = Math.cos(y / 2), sy = Math.sin(y / 2), cz = Math.cos(z / 2), sz = Math.sin(z / 2);
    out[0] = sx * cy * cz + cx * sy * sz; out[1] = cx * sy * cz - sx * cy * sz;
    out[2] = cx * cy * sz - sx * sy * cz; out[3] = cx * cy * cz + sx * sy * sz;
    return out;
  }
  function qrot(q, v, out) {
    const [x, y, z, w] = q, tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
    out[0] = v[0] + w * tx + (y * tz - z * ty); out[1] = v[1] + w * ty + (z * tx - x * tz); out[2] = v[2] + w * tz + (x * ty - y * tx);
    return out;
  }
  function qrot3(q, vx, vy, vz, out) {
    const x = q[0], y = q[1], z = q[2], w = q[3], tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
    out[0] = vx + w * tx + (y * tz - z * ty); out[1] = vy + w * ty + (z * tx - x * tz); out[2] = vz + w * tz + (x * ty - y * tx);
    return out;
  }
  const ONE = [1, 1, 1];
  function qmul(a, b, out) {
    const x = a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], y = a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0];
    const z = a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], w = a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2];
    out[0] = x; out[1] = y; out[2] = z; out[3] = w; return out;
  }

  // ---------------------------------------------------------------- hiệu ứng / hệ
  function variantOf(d, opts) {
    if (!d.variants) return d;
    const p = opts && opts.parent, nm = p && ((p.userData && p.userData.name) || p.name);
    return (nm && d.variants[nm]) || d.variants[d.defaultVariant] || d;
  }

  function makeSystem(eff, node, idx) {
    const m = node.main, N = Math.max(1, Math.min((eff.opts && eff.opts.maxN != null ? eff.opts.maxN : m.maxN) || 1, 4000)); // opts.maxN: sức chứa do người gọi đặt (EyeParticles main.maxParticles 0 trong prefab, EyeParticlesWorldEvent.cs:44-110 gán lúc chạy) [U6 seam]
    const f = n => new Float32Array(n);
    const s = {
      eff, node, idx, N, n: 0, time: 0, delay: m.delay ? ev(m.delay, 0, Math.random()) : 0, playing: !!m.play, emitting: !!m.play,
      emitAcc: 0, distAcc: 0, bursts: (node.emission && node.emission.bursts || []).map(() => ({ k: 0 })),
      px: f(N), py: f(N), pz: f(N), vx: f(N), vy: f(N), vz: f(N), age: f(N), life: f(N), rnd: f(N * 4),
      sx: f(N), sy: f(N), sz: f(N), rx: f(N), ry: f(N), rz: f(N), cr: f(N), cg: f(N), cb: f(N), ca: f(N), fr: f(N),
      M: M4(), q: [0, 0, 0, 1], sc: [1, 1, 1], pos: [0, 0, 0], prev: null, vel: [0, 0, 0], speed: 0, isSub: false, subs: [],
      buoyY: null, buoyT: 0, buoyTarget: 0
    };
    if (node.sub) for (const sb of node.sub) s.subs.push({ sb, acc: f(N), done: new Uint8Array(N * 8), skip: new Uint8Array(N), p: null });
    return s;
  }

  function spawn(name, opts) {
    opts = opts || {};
    const d0 = DATA[name];
    if (!d0) {
      if (!warned[name]) { warned[name] = true; console.warn('[particles] no data for system:', name); }
      return { stop() {}, setRate() {}, setRateOverTime() {}, setSimulationSpeed() {}, setSubEmitProbability() {}, alive: false, systems: [], name };
    }
    const d = variantOf(d0, opts);
    const eff = {
      name, d, opts, alive: true, stopped: false, rate: 1, rateAbs: null, simAbs: null, systems: [], M: M4(), attach: M4(), root: M4(),
      follow: opts.follow || null, scene: opts.scene || null, gate: null
    };
    const at = d.attach || d0.attach;
    if (at) compose(at.pos, at.q, at.scale, eff.attach); else compose([0, 0, 0], [0, 0, 0, 1], [1, 1, 1], eff.attach);
    d.nodes.forEach((n, i) => eff.systems.push(makeSystem(eff, n, i)));
    for (const s of eff.systems) for (const sub of s.subs) { const c = eff.systems[sub.sb.node]; if (c) { c.isSub = true; c.emitting = false; } }
    if (opts.startLifetime != null) eff.lifeOverride = opts.startLifetime;
    eff.y0 = !!((d0.emitOnSpawn || {}).y0);
    // giữ sống khi chưa stop(): loop: true của người gọi, hoặc hệ gốc loop + playOnAwake (Lightning play 0 thì vẫn tự giải phóng)
    eff.held = opts.loop === true || eff.systems.some(s => !s.isSub && s.node.main.loop && s.node.main.play);
    const h = {
      name, systems: eff.systems, get alive() { return eff.alive; },
      stop() { eff.stopped = true; for (const s of eff.systems) s.emitting = false; },
      setRate(k) { eff.rate = Math.max(0, +k || 0); },
      setMaxParticles(n) { const s = eff.systems[0]; if (s) s.cap = Math.max(0, Math.min(s.N, Math.floor(+n || 0))); },   // ParticleSystem.MainModule.maxParticles [U6 seam]
      setRateOverTime(r) { eff.rateAbs = r == null ? null : Math.max(0, +r || 0); },
      setSimulationSpeed(v) { eff.simAbs = v == null ? null : Math.max(0, +v || 0); },
      setSubEmitProbability(i, p) { const s = eff.systems[0], sub = s && s.subs[i]; if (sub) sub.p = p == null ? null : Math.min(1, Math.max(0, +p || 0)); },
      emit(n, o) { emitOnSpawn(eff, Object.assign({ n }, o || {})); },
      get count() { return eff.systems.reduce((a, s) => a + s.n, 0); },
      get emitted() { return eff.systems.reduce((a, s) => a + (s.emitted || 0), 0); },
      positions() { return eff.systems.map(s => [s.pos[0], s.pos[1], -s.pos[2]]); },
      _eff: eff
    };
    eff.handle = h;
    placeEffect(eff, 0);
    for (const s of eff.systems) { s.prev = s.pos.slice(); if (s.node.main.prewarm && s.node.main.loop && s.playing && !s.isSub) prewarm(s); }
    const eo = d0.emitOnSpawn || d.emitOnSpawn;
    // size/lifetime của người gọi = startSize/startLifetime gán trước Emit(1) (FoghornAbility.cs:130-133)
    if (eo || opts.emit) emitOnSpawn(eff, Object.assign({}, eo || {}, opts.emit ? { n: opts.emit } : {}, opts.mini ? (eo && eo.mini) || {} : {},
      opts.size != null ? { size: +opts.size } : {}, opts.lifetime != null ? { life: +opts.lifetime } : {}));
    effects.push(eff);
    return h;
  }

  // Emit(n) của script (FoghornAbility.cs:130-133 đổi startSize/startLifetime; Lightning.cs:87): vào hệ gốc
  function emitOnSpawn(eff, o) {
    const s = eff.systems[0];
    if (!s) return;
    for (let i = 0; i < (o.n || 1); i++) emit(s, 1, 0, o.size, o.life);
  }

  // ---- vị trí gốc: parent (Object3D three.js) | pos/yaw/scale | follow camera/player; rồi × attach (gốc so với Player/BoatN)
  const tmpM = M4(), tmpM2 = M4(), tmpQ = [0, 0, 0, 1], tmpV = [0, 0, 0], tmpV2 = [0, 0, 0];
  function placeEffect(eff, dt) {
    const o = eff.opts, d = eff.d;
    if (o.parent && o.parent.matrixWorld) {
      o.parent.updateWorldMatrix(true, false);
      fromThree(o.parent.matrixWorld.elements, eff.root);
    } else {
      let p = [0, 0, 0];
      if (eff.follow) {
        const fol = (d.follow || DATA[eff.name].follow) || { axes: [1, 1, 1] };
        const src = eff.follow === 'camera' ? (camObj && camObj.position) : (root.DRBoat && root.DRBoat.root ? root.DRBoat.root.position : null);
        if (src) {
          if (!eff.fp) eff.fp = [0, 0, 0];
          if (fol.axes[0]) eff.fp[0] = src.x; if (fol.axes[1]) eff.fp[1] = src.y; if (fol.axes[2]) eff.fp[2] = -src.z;
          p = eff.fp;
        }
      } else if (o.pos) p = Array.isArray(o.pos) ? [o.pos[0], o.pos[1], -o.pos[2]] : [o.pos.x, o.pos.y, -o.pos.z];
      const sc = o.scale == null ? 1 : o.scale;
      const s = Array.isArray(sc) ? sc : [sc, sc, sc];
      const q = o.q || euler(0, -(o.yaw || 0), 0, tmpQ); // yaw three.js quanh +y = yaw Unity đổi dấu
      if (eff.y0) p = [p[0], 0, p[2]];
      compose(p, q, s, eff.root);
    }
    mul(eff.root, eff.attach, eff.M);
    for (const s of eff.systems) placeSystem(eff, s, dt);
  }
  function placeSystem(eff, s, dt) {
    const n = s.node, m = n.main;
    // ma trận emitter: vị trí/quay từ cây, tỉ lệ theo scalingMode (1 Local: chỉ tỉ lệ của chính nó; 0 Hierarchy: dồn cả cây)
    compose(n.t, n.q, ONE, tmpM);
    mul(eff.M, tmpM, tmpM2);
    mquat(tmpM2, s.q);
    s.pos[0] = tmpM2[12]; s.pos[1] = tmpM2[13]; s.pos[2] = tmpM2[14];
    if (n.buoy && root.DRWater && root.DRWorld) {
      // SimpleBuoyantObject: đích = sóng tại chỗ + objectDepth, cập nhật mỗi 0,5 s, y = Lerp(y, đích, dt)
      s.buoyT -= dt;
      if (s.buoyY == null || s.buoyT <= 0) {
        s.buoyT = n.buoy.every || 0.5;
        const x3 = s.pos[0], z3 = -s.pos[2];
        const k = Math.min(1, root.DRWorld.steep01(x3, z3) * 10) * root.DRWater.uniforms.uWaveSteep.value;
        s.buoyTarget = root.DRWater.wave(x3, z3, k)[0] + n.buoy.depth;
        if (s.buoyY == null) s.buoyY = s.pos[1];
      }
      s.buoyY += (s.buoyTarget - s.buoyY) * Math.min(1, dt);
      // +0,25 m [ĐỀ XUẤT]: nước web ghi chiều sâu (nước URP trong suốt thì không), bọt toả ra chỗ sóng cao hơn sẽ bị che
      s.pos[1] = s.buoyY + 0.25;
    }
    if (m.scaling === 1) { s.sc[0] = n.ls[0]; s.sc[1] = n.ls[1]; s.sc[2] = n.ls[2]; }
    else { s.sc[0] = colLen(eff.M, 0) * n.cs[0]; s.sc[1] = colLen(eff.M, 1) * n.cs[1]; s.sc[2] = colLen(eff.M, 2) * n.cs[2]; }
    compose(s.pos, s.q, m.scaling === 2 ? ONE : s.sc, s.M);
    if (dt > 0 && s.prev) {
      s.vel[0] = (s.pos[0] - s.prev[0]) / dt; s.vel[1] = (s.pos[1] - s.prev[1]) / dt; s.vel[2] = (s.pos[2] - s.prev[2]) / dt;
      s.speed = Math.hypot(s.vel[0], s.vel[1], s.vel[2]);
    }
  }

  // ---------------------------------------------------------------- phát
  const SHP = [0, 0, 0], DIR = [0, 0, 1];
  function shapeSample(sh, out, dir) {
    let x = 0, y = 0, z = 0, dx = 0, dy = 0, dz = 1;
    const R = Math.random;
    if (sh) {
      const r = sh.r == null ? 1 : sh.r, rt = sh.rt == null ? 1 : sh.rt;
      const rr = () => r * Math.sqrt((1 - rt) * (1 - rt) + (1 - (1 - rt) * (1 - rt)) * R()); // độ dày bán kính (0 = viền)
      const arc = (sh.arc == null ? 360 : sh.arc) * Math.PI / 180 * R();
      switch (sh.type) {
        case 'sphere': case 'hemisphere': {
          let u = R() * 2 - 1; const a = R() * Math.PI * 2, k = Math.sqrt(1 - u * u);
          dx = k * Math.cos(a); dy = k * Math.sin(a); dz = sh.type === 'hemisphere' ? Math.abs(u) : u;
          const d = r * (1 - rt + rt * Math.cbrt(R()));
          x = dx * d; y = dy * d; z = dz * d; break;
        }
        case 'cone': case 'coneVolume': {
          const th = (sh.angle || 0) * Math.PI / 180, d = rr(), c = Math.cos(arc), s = Math.sin(arc);
          x = c * d; y = s * d; z = 0;
          const k = r > 0 ? d / r : Math.sqrt(R());
          dx = c * k * Math.sin(th); dy = s * k * Math.sin(th); dz = Math.cos(th);
          const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
          if (sh.type === 'coneVolume') { const L = (sh.len || 0) * R(); x += dx * L; y += dy * L; z += dz * L; }
          break;
        }
        case 'circle': { const d = rr(), c = Math.cos(arc), s = Math.sin(arc); x = c * d; y = s * d; dx = c; dy = s; dz = 0; break; }
        case 'edge': x = (R() * 2 - 1) * r; dx = 0; dy = 1; dz = 0; break;
        case 'box': case 'boxShell': case 'boxEdge': x = R() - 0.5; y = R() - 0.5; z = R() - 0.5; dx = 0; dy = 0; dz = 1; break;
        case 'rectangle': x = R() - 0.5; y = R() - 0.5; dx = 0; dy = 0; dz = 1; break;
        case 'donut': {
          const c = Math.cos(arc), s = Math.sin(arc), dr = (sh.donut || 0) * Math.sqrt((1 - rt) * (1 - rt) + (1 - (1 - rt) * (1 - rt)) * R());
          const b = R() * Math.PI * 2;
          dx = c * Math.cos(b); dy = s * Math.cos(b); dz = Math.sin(b);
          x = c * r + dx * dr; y = s * r + dy * dr; z = dz * dr; break;
        }
        default: { const u = R() * 2 - 1, a = R() * Math.PI * 2, k = Math.sqrt(1 - u * u); dx = k * Math.cos(a); dy = k * Math.sin(a); dz = u; }
      }
      if (sh.scl) { x *= sh.scl[0]; y *= sh.scl[1]; z *= sh.scl[2]; }
      if (sh.rot) {
        const q = euler(sh.rot[0] * Math.PI / 180, sh.rot[1] * Math.PI / 180, sh.rot[2] * Math.PI / 180, tmpQ2);
        qrot3(q, x, y, z, SHP); x = SHP[0]; y = SHP[1]; z = SHP[2];
        qrot3(q, dx, dy, dz, SHP); dx = SHP[0]; dy = SHP[1]; dz = SHP[2];
      }
      if (sh.pos) { x += sh.pos[0]; y += sh.pos[1]; z += sh.pos[2]; }
      if (sh.rdir || sh.sdir) {
        const u = R() * 2 - 1, a = R() * Math.PI * 2, k = Math.sqrt(1 - u * u);
        const rd = sh.rdir || 0, sd = sh.sdir || 0, l0 = Math.hypot(x, y, z) || 1;
        dx = dx * (1 - rd - sd) + k * Math.cos(a) * rd + x / l0 * sd; dy = dy * (1 - rd - sd) + k * Math.sin(a) * rd + y / l0 * sd; dz = dz * (1 - rd - sd) + u * rd + z / l0 * sd;
        const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
      }
      if (sh.rpos) { x += (R() * 2 - 1) * sh.rpos; y += (R() * 2 - 1) * sh.rpos; z += (R() * 2 - 1) * sh.rpos; }
    }
    out[0] = x; out[1] = y; out[2] = z; dir[0] = dx; dir[1] = dy; dir[2] = dz;
  }
  const tmpQ2 = [0, 0, 0, 1];

  // phát n hạt; at = vị trí thế giới (sub-emitter) hoặc null (theo shape); inh = hạt cha để kế thừa (sub-emitter)
  function emit(s, n, frac, size, life, at, inh, inhProps) {
    const nd = s.node, m = nd.main, t01 = Math.min(1, s.time / (m.dur || 1));
    const world = m.space === 1;
    for (let k = 0; k < n; k++) {
      if (s.n >= (s.cap != null ? s.cap : s.N)) return;   // s.cap = main.maxParticles gán lúc chạy (handle.setMaxParticles) [U6 seam]
      const i = s.n++;
      stat.emitted++; s.emitted = (s.emitted || 0) + 1;
      const r0 = Math.random(), r1 = Math.random(), r2 = Math.random(), r3 = Math.random();
      s.rnd[i * 4] = r0; s.rnd[i * 4 + 1] = r1; s.rnd[i * 4 + 2] = r2; s.rnd[i * 4 + 3] = r3;
      shapeSample(nd.shape, SHP, DIR);
      const sp = ev(m.speed, t01, Math.random());
      let px = SHP[0], py = SHP[1], pz = SHP[2], vx = DIR[0] * sp, vy = DIR[1] * sp, vz = DIR[2] * sp;
      if (at) {
        // sub-emitter: phát tại vị trí hạt cha (thế giới); shape cục bộ quay theo emitter của hệ con
        qrot3(s.q, px * s.sc[0], py * s.sc[1], pz * s.sc[2], tmpV); qrot3(s.q, vx, vy, vz, tmpV2);
        px = at[0] + tmpV[0]; py = at[1] + tmpV[1]; pz = at[2] + tmpV[2]; vx = tmpV2[0]; vy = tmpV2[1]; vz = tmpV2[2];
        if (!world) { // về toạ độ cục bộ của emitter con
          const ix = px - s.pos[0], iy = py - s.pos[1], iz = pz - s.pos[2], iq = [-s.q[0], -s.q[1], -s.q[2], s.q[3]];
          qrot3(iq, ix / s.sc[0], iy / s.sc[1], iz / s.sc[2], tmpV); px = tmpV[0]; py = tmpV[1]; pz = tmpV[2];
          qrot3(iq, vx, vy, vz, tmpV2); vx = tmpV2[0]; vy = tmpV2[1]; vz = tmpV2[2];
        }
      } else if (world) {
        const M = s.M;
        const wx = M[0] * px + M[4] * py + M[8] * pz + M[12], wy = M[1] * px + M[5] * py + M[9] * pz + M[13], wz = M[2] * px + M[6] * py + M[10] * pz + M[14];
        // rải đều theo quãng emitter đi trong khung
        px = wx - s.vel[0] * frac; py = wy - s.vel[1] * frac; pz = wz - s.vel[2] * frac;
        qrot3(s.q, vx, vy, vz, tmpV2); vx = tmpV2[0]; vy = tmpV2[1]; vz = tmpV2[2];
      }
      if (nd.inherit && nd.inherit.mode === 0) { // Initial: cộng vận tốc emitter lúc sinh
        const k2 = ev(nd.inherit.k, 0, r1);
        if (world) { vx += s.vel[0] * k2; vy += s.vel[1] * k2; vz += s.vel[2] * k2; }
      }
      s.px[i] = px; s.py[i] = py; s.pz[i] = pz; s.vx[i] = vx; s.vy[i] = vy; s.vz[i] = vz;
      let lf = life != null ? life : (s.eff.lifeOverride != null && s.idx === 0 ? s.eff.lifeOverride : ev(m.life, t01, r0));
      if (nd.lbes) { const L = nd.lbes, u = Math.min(1, Math.max(0, (s.speed - L.range[0]) / ((L.range[1] - L.range[0]) || 1))); lf *= ev(L.k, u, r1); }
      if (inh && (inhProps & 8)) lf = inh.life;
      s.life[i] = Math.max(1e-4, lf); s.age[i] = frac;
      if (size != null) { s.sx[i] = s.sy[i] = s.sz[i] = size; }
      else if (m.size3) { s.sx[i] = ev(m.size3[0], t01, r2); s.sy[i] = ev(m.size3[1], t01, r2); s.sz[i] = ev(m.size3[2], t01, r2); }
      else { s.sx[i] = s.sy[i] = s.sz[i] = ev(m.size, t01, r2); }
      if (inh && (inhProps & 2)) { s.sx[i] *= inh.size; s.sy[i] *= inh.size; s.sz[i] *= inh.size; }
      const flip = m.flipRot && Math.random() < m.flipRot ? -1 : 1;
      if (m.rot3) { s.rx[i] = ev(m.rot3[0], t01, r3) * flip; s.ry[i] = ev(m.rot3[1], t01, r3) * flip; s.rz[i] = ev(m.rot3[2], t01, r3) * flip; }
      else { s.rx[i] = 0; s.ry[i] = 0; s.rz[i] = ev(m.rot, t01, r3) * flip; }
      evCol(m.color, t01, Math.random(), tmpC);
      if (inh && (inhProps & 1)) { tmpC[0] *= inh.c[0]; tmpC[1] *= inh.c[1]; tmpC[2] *= inh.c[2]; tmpC[3] *= inh.c[3]; }
      s.cr[i] = s2l(tmpC[0]); s.cg[i] = s2l(tmpC[1]); s.cb[i] = s2l(tmpC[2]); s.ca[i] = tmpC[3]; // tuyến tính một lần lúc sinh
      const sh = nd.sheet;
      s.fr[i] = sh ? ev(sh.start, 0, Math.random()) : 0;
      for (const sub of s.subs) { sub.acc[i] = 0; for (let b = 0; b < 8; b++) sub.done[i * 8 + b] = 0; }
      if (s.subs.length) birthSubs(s, i);
    }
  }

  function prewarm(s) {
    const m = s.node.main, steps = 30, dt = (m.dur || 1) / steps;
    for (let k = 0; k < steps; k++) { stepEmission(s, dt); simulate(s, dt); s.time += dt; }
    s.time = s.time % (m.dur || 1);
  }

  function stepEmission(s, dt) {
    const nd = s.node, m = nd.main, E = nd.emission;
    if (!E || !s.emitting || s.isSub) return;
    const dur = m.dur || 1, t = s.time, t01 = Math.min(1, t / dur), rate = s.eff.rate, abs = s.idx === 0 ? s.eff.rateAbs : null;
    s.emitAcc += (abs != null ? abs : ev(E.rate, t01, Math.random()) * rate) * dt;
    if (E.dist && s.prev) { s.distAcc += Math.hypot(s.pos[0] - s.prev[0], s.pos[1] - s.prev[1], s.pos[2] - s.prev[2]) * ev(E.dist, t01, Math.random()) * rate; }
    let n = Math.floor(s.emitAcc); s.emitAcc -= n;
    const nd2 = Math.floor(s.distAcc); s.distAcc -= nd2; n += nd2;
    for (let k = 0; k < n; k++) emit(s, 1, (1 - (k + 1) / n) * dt);
    if (E.bursts) E.bursts.forEach((b, j) => {
      // burst: thời điểm b.t + k·interval trong [t, t+dt); cycleCount 0 = vô hạn (interval 0 thì 1 lần mỗi vòng)
      const st = s.bursts[j], iv = b.int > 0 ? b.int : Infinity, cyc = b.cyc > 0 ? b.cyc : (iv === Infinity ? 1 : Infinity);
      while (st.k < cyc) {
        if (b.t + st.k * iv >= t + dt) break;
        st.k++;
        if (Math.random() <= (b.p == null ? 1 : b.p)) emit(s, Math.round(ev(b.n, t01, Math.random()) * rate), 0);
      }
    });
  }

  // ---- sub-emitter Birth: hệ con phát theo hạt cha suốt đời hạt (rate + burst theo tuổi hạt cha)
  function birthSubs(s, i) {
    for (const sub of s.subs) if (sub.sb.type === 0) runSub(s, sub, i, 0);
  }
  const inhBuf = { c: [1, 1, 1, 1], size: 1, life: 1 };
  function runSub(s, sub, i, dt) {
    const c = s.eff.systems[sub.sb.node];
    if (!c) return;
    // emitProbability: gieo một lần lúc hạt cha sinh; trượt thì hạt ấy không kéo sub-emitter suốt đời
    if (dt === 0) { const pr = sub.p != null ? sub.p : sub.sb.p == null ? 1 : sub.sb.p; sub.skip[i] = Math.random() > pr ? 1 : 0; }
    if (sub.skip[i]) return;
    const E = c.node.emission;
    if (!E) return;
    worldPos(s, i, tmpW);
    const at = [tmpW[0], tmpW[1], tmpW[2]];
    inhBuf.c[0] = s.cr[i]; inhBuf.c[1] = s.cg[i]; inhBuf.c[2] = s.cb[i]; inhBuf.c[3] = s.ca[i]; inhBuf.size = s.sx[i]; inhBuf.life = s.life[i];
    const age = s.age[i], dur = c.node.main.dur || 1;
    if (dt > 0) {
      sub.acc[i] += ev(E.rate, Math.min(1, age / dur), Math.random()) * dt;
      const n = Math.floor(sub.acc[i]); sub.acc[i] -= n;
      if (n > 0) emit(c, n, 0, null, null, at, inhBuf, sub.sb.props);
    }
    if (E.bursts) E.bursts.forEach((b, j) => {
      if (j < 8 && !sub.done[i * 8 + j] && age >= b.t) {
        sub.done[i * 8 + j] = 1;
        if (Math.random() <= (b.p == null ? 1 : b.p)) emit(c, Math.round(ev(b.n, 0, Math.random())), 0, null, null, at, inhBuf, sub.sb.props);
      }
    });
  }
  function deathSubs(s, i) {
    for (const sub of s.subs) {
      if (sub.sb.type !== 2) continue;
      const c = s.eff.systems[sub.sb.node];
      if (!c || Math.random() > (sub.p != null ? sub.p : sub.sb.p == null ? 1 : sub.sb.p)) continue;
      worldPos(s, i, tmpW);
      const E = c.node.emission; let n = 0;
      if (E && E.bursts) for (const b of E.bursts) n += Math.round(ev(b.n, 0, Math.random()));
      emit(c, n || 1, 0, null, null, [tmpW[0], tmpW[1], tmpW[2]], inhBuf, sub.sb.props);
    }
  }
  const tmpW = [0, 0, 0];
  function worldPos(s, i, out) {
    if (s.node.main.space === 1) { out[0] = s.px[i]; out[1] = s.py[i]; out[2] = s.pz[i]; return out; }
    const M = s.M, x = s.px[i], y = s.py[i], z = s.pz[i];
    out[0] = M[0] * x + M[4] * y + M[8] * z + M[12]; out[1] = M[1] * x + M[5] * y + M[9] * z + M[13]; out[2] = M[2] * x + M[6] * y + M[10] * z + M[14];
    return out;
  }

  // ---------------------------------------------------------------- mô phỏng
  function noise3(x, y, z) { // [ĐỀ XUẤT] nhiễu giá trị rẻ thay Perlin/curl của NoiseModule
    return Math.sin(x * 1.7 + Math.sin(y * 2.3 + z * 1.1)) * Math.cos(z * 1.3 + Math.sin(x * 0.7 + y * 1.9));
  }
  function simulate(s, dt) {
    const nd = s.node, m = nd.main, world = m.space === 1, V = nd.vel, L = nd.limit, Z = nd.noise, IV = nd.inherit, RO = nd.rotOL;
    const t01s = Math.min(1, s.time / (m.dur || 1));
    // trọng lực (thế giới) → cục bộ nếu cần
    const gk = ev(m.grav, t01s, 0.5) * G;
    let gx = 0, gy = -gk, gz = 0;
    if (!world && gk) { const iq = [-s.q[0], -s.q[1], -s.q[2], s.q[3]]; qrot3(iq, 0, -gk, 0, tmpV); gx = tmpV[0] / s.sc[0]; gy = tmpV[1] / s.sc[1]; gz = tmpV[2] / s.sc[2]; }
    const iqs = s.iq || (s.iq = [0, 0, 0, 1]); iqs[0] = -s.q[0]; iqs[1] = -s.q[1]; iqs[2] = -s.q[2]; iqs[3] = s.q[3];
    let i = 0;
    while (i < s.n) {
      s.age[i] += dt;
      if (s.age[i] >= s.life[i]) { kill(s, i); continue; }
      const t = s.age[i] / s.life[i], r0 = s.rnd[i * 4], r1 = s.rnd[i * 4 + 1], r2 = s.rnd[i * 4 + 2];
      s.vx[i] += gx * dt; s.vy[i] += gy * dt; s.vz[i] += gz * dt;
      let ax = 0, ay = 0, az = 0, smod = 1;
      if (V) {
        if (V.x || V.y || V.z) {
          let lx = ev(V.x, t, r0), ly = ev(V.y, t, r1), lz = ev(V.z, t, r2);
          if (V.world !== m.space) { // khác không gian: đổi hệ
            if (V.world) { qrot3(iqs, lx, ly, lz, tmpV); lx = tmpV[0] / s.sc[0]; ly = tmpV[1] / s.sc[1]; lz = tmpV[2] / s.sc[2]; }
            else { qrot3(s.q, lx * s.sc[0], ly * s.sc[1], lz * s.sc[2], tmpV); lx = tmpV[0]; ly = tmpV[1]; lz = tmpV[2]; }
          }
          ax += lx; ay += ly; az += lz;
        }
        if (V.orb || V.radial) {
          // quanh tâm hệ (toạ độ cục bộ của emitter)
          let ox = s.px[i], oy = s.py[i], oz = s.pz[i];
          if (world) { qrot3(iqs, ox - s.pos[0], oy - s.pos[1], oz - s.pos[2], tmpV); ox = tmpV[0]; oy = tmpV[1]; oz = tmpV[2]; }
          if (V.orbOff) { ox -= ev(V.orbOff[0], t, r0); oy -= ev(V.orbOff[1], t, r1); oz -= ev(V.orbOff[2], t, r2); }
          let lx = 0, ly = 0, lz = 0;
          if (V.orb) { const wx = ev(V.orb[0], t, r0), wy = ev(V.orb[1], t, r1), wz = ev(V.orb[2], t, r2); lx = wy * oz - wz * oy; ly = wz * ox - wx * oz; lz = wx * oy - wy * ox; }
          if (V.radial) { const rk = ev(V.radial, t, r0), l = Math.hypot(ox, oy, oz) || 1; lx += ox / l * rk; ly += oy / l * rk; lz += oz / l * rk; }
          if (world) { qrot3(s.q, lx, ly, lz, tmpV); lx = tmpV[0]; ly = tmpV[1]; lz = tmpV[2]; }
          ax += lx; ay += ly; az += lz;
        }
        if (V.speedMod) smod = ev(V.speedMod, t, r0);
      }
      if (IV && IV.mode === 1 && world) { const k = ev(IV.k, t, r1); ax += s.vel[0] * k; ay += s.vel[1] * k; az += s.vel[2] * k; }
      if (Z) {
        const st = ev(Z.str, t, r0) * (Z.pos ? ev(Z.pos, t, r0) : 1), fq = Z.freq || 1, sc = (Z.scroll ? ev(Z.scroll, t, 0) : 0) * s.time;
        const X = s.px[i] * fq + r0 * 10, Y = s.py[i] * fq + sc, Zz = s.pz[i] * fq + r1 * 10;
        const k = Z.damp ? st : st * fq; // damping: cường độ tỉ lệ tần số
        ax += noise3(X, Y, Zz) * k; ay += noise3(Y + 3.1, Zz, X) * k; az += noise3(Zz + 7.7, X, Y) * k;
      }
      if (L) {
        if (L.drag) {
          const sp = Math.hypot(s.vx[i], s.vy[i], s.vz[i]);
          let dk = ev(L.drag, t, r0) * (L.dragVel ? sp : 1) * (L.dragSize ? s.sx[i] * s.sx[i] : 1);
          const f = Math.max(0, 1 - dk * dt); s.vx[i] *= f; s.vy[i] *= f; s.vz[i] *= f;
        }
        const lim = L.mag ? ev(L.mag, t, r1) : 1e9, sp = Math.hypot(s.vx[i] + ax, s.vy[i] + ay, s.vz[i] + az);
        if (sp > lim && sp > 0) {
          // dampen: phần vượt giảm theo tỉ lệ mỗi 1/30 s (độc lập khung hình) [ĐỀ XUẤT]
          const k = 1 - (1 - lim / sp) * (1 - Math.pow(1 - (L.dampen || 0), dt * 30));
          s.vx[i] *= k; s.vy[i] *= k; s.vz[i] *= k; ax *= k; ay *= k; az *= k;
        }
      }
      s.px[i] += (s.vx[i] + ax) * smod * dt; s.py[i] += (s.vy[i] + ay) * smod * dt; s.pz[i] += (s.vz[i] + az) * smod * dt;
      if (RO) {
        if (RO.sep) { s.rx[i] += ev(RO.x, t, r0) * dt; s.ry[i] += ev(RO.y, t, r1) * dt; }
        s.rz[i] += ev(RO.z, t, r2) * dt;
      }
      for (const sub of s.subs) if (sub.sb.type === 0) runSub(s, sub, i, dt);
      i++;
    }
  }
  const PARR = ['px', 'py', 'pz', 'vx', 'vy', 'vz', 'age', 'life', 'sx', 'sy', 'sz', 'rx', 'ry', 'rz', 'cr', 'cg', 'cb', 'ca', 'fr'];
  function kill(s, i) {
    if (s.subs.length) deathSubs(s, i);
    const j = --s.n;
    if (i === j) return;
    for (const k of PARR) s[k][i] = s[k][j];
    for (let k = 0; k < 4; k++) s.rnd[i * 4 + k] = s.rnd[j * 4 + k];
    for (const sub of s.subs) { sub.acc[i] = sub.acc[j]; sub.skip[i] = sub.skip[j]; for (let b = 0; b < 8; b++) sub.done[i * 8 + b] = sub.done[j * 8 + b]; }
  }

  function stepSystem(s, dt) {
    const m = s.node.main;
    if (s.delay > 0) { s.delay -= dt; if (s.delay > 0) return; }
    if (s.playing && !s.isSub) {
      stepEmission(s, dt);
      s.time += dt;
      if (s.time >= (m.dur || 1)) {
        if (m.loop) { s.time -= (m.dur || 1); for (const b of s.bursts) b.k = 0; }
        else { s.emitting = false; s.time = m.dur || 1; }
      }
    }
    simulate(s, dt);
  }

  // ---------------------------------------------------------------- vẽ (lô = vật liệu + texture + mesh)
  const batches = new Map();
  const QUAD_F = 19, MESH_F = 18;
  const FAM = {
    Particle_Shader: 'particle', FloatingParticle_Shader: 'floating', LavaBubbleParticle_Shader: 'floating', CutOutParticle_Shader: 'cutout',
    FireGlow_Shader: 'fire', CutsceneOpaqueParticles_Shader: 'opaque', AlwaysOnTopEffect_Shader: 'ontop', FogDevil_Shader: 'fogdevil',
    ShimmerWarp_Shader: 'shimmer', SonarRingEffect_Shader: 'sonar', Lit_Shader: 'lit', FishParticle_Shader: 'animal', BirdParticle_Shader: 'animal'
  };
  const texCache = {};
  function tex(id) {
    if (!id || !LIB.textures[id]) return null;
    if (!texCache[id]) {
      const rev = root.DRSky && root.DRSky.rev;
      const t = new T.TextureLoader().load(LIB.textures[id].src + (rev ? '?v=' + rev : ''));
      t.encoding = T.sRGBEncoding; t.wrapS = t.wrapT = T.RepeatWrapping;
      texCache[id] = t;
    }
    return texCache[id];
  }
  function matTex(mat, names) { const tx = mat.tex || {}; for (const n of names) if (tx[n]) return tx[n]; return null; }
  const BF = () => ({ 0: T.ZeroFactor, 1: T.OneFactor, 2: T.DstColorFactor, 3: T.SrcColorFactor, 4: T.OneMinusDstColorFactor, 5: T.SrcAlphaFactor,
    6: T.OneMinusSrcColorFactor, 7: T.DstAlphaFactor, 8: T.OneMinusDstAlphaFactor, 9: T.SrcAlphaSaturateFactor, 10: T.OneMinusSrcAlphaFactor });

  const VERT = `
#ifdef MESH
attribute vec4 aCol0;
attribute vec3 iPos; attribute vec4 iQ; attribute vec3 iS; attribute vec4 iCol; attribute vec4 iUV;
#else
attribute vec3 iPos; attribute vec2 iSize; attribute float iRot; attribute float iMode; attribute vec3 iDir; attribute vec4 iCol; attribute vec4 iUV; attribute float iMax;
#endif
varying vec2 vUv; varying vec4 vCol; varying vec3 vW; varying vec2 vUv0;
varying float vFogDepth; varying vec3 vDrFogW;
#ifdef SNAP
${'#'}include <dr_wave>
#endif
void main() {
#ifdef MESH
  vec3 p = position * iS;
  p += 2.0 * cross(iQ.xyz, cross(iQ.xyz, p) + iQ.w * p);
  vec3 wp = iPos + p;
  vCol = iCol * aCol0;
  vUv0 = uv;
  vUv = mix(iUV.xy, iUV.zw, uv);
#else
  vec2 sz = iSize;
  float d = max(0.01, -(viewMatrix * vec4(iPos, 1.0)).z);
  float mx = iMax * 2.0 * d / projectionMatrix[1][1]; // maxParticleSize: phần của chiều cao màn hình
  vec2 c = position.xy;
  vec3 wp;
  vec3 R = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), U = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  if (iMode > 0.5 && iMode < 1.5) { // stretched: đầu ở vị trí hạt, đuôi kéo ngược vận tốc
    vec3 D = iDir; vec3 S = normalize(cross(D, normalize(cameraPosition - iPos)) + 1e-6);
    wp = iPos + S * c.x * min(sz.x, mx) + D * (c.y - 0.5) * sz.y;
  } else {
    float k = min(1.0, mx / max(max(sz.x, sz.y), 1e-6)); sz *= k;
    vec2 cr = vec2(c.x * sz.x, c.y * sz.y);
    float cs = cos(iRot), sn = sin(iRot);
    vec2 r = vec2(cr.x * cs - cr.y * sn, cr.x * sn + cr.y * cs);
    if (iMode < 0.5) wp = iPos + R * r.x + U * r.y;
    else if (iMode < 2.5) wp = iPos + vec3(r.x, 0.0, -r.y);           // horizontal: nằm trên mặt XZ
    else { vec3 F = cameraPosition - iPos; F.y = 0.0; F = normalize(F + vec3(1e-5, 0.0, 0.0)); // vertical: đứng, quay quanh Y
      wp = iPos + vec3(F.z, 0.0, -F.x) * r.x + vec3(0.0, 1.0, 0.0) * r.y; }
  }
  vCol = iCol;
  vUv0 = c + 0.5;
  vUv = mix(iUV.xy, iUV.zw, c + 0.5);
#endif
#ifdef SNAP
  wp.y = drWave(wp.xz, drSteepAt(wp.xz) * uWaveSteep).x + 0.03; // _SNAPTOWATERSURFACE (dịch +0,03 tránh z-fight [ĐỀ XUẤT])
#endif
  vW = wp; vDrFogW = wp;
  vec4 mv = viewMatrix * vec4(wp, 1.0); vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
  const FRAG = `
uniform sampler2D uMap; uniform sampler2D uMap2; uniform sampler2D uEmis; uniform vec4 uP; uniform vec4 uP2; uniform vec3 uFoam;
varying vec2 vUv; varying vec4 vCol; varying vec3 vW; varying vec2 vUv0;
${'#'}include <fog_pars_fragment>
void main() {
  vec4 c = texture2D(uMap, vUv) * vCol;
  vec3 rgb; float a = c.a;
  float mb = drEnvMaskB(vW.xz);
#if defined(FAM_FOGDEVIL)
  vec2 u2 = vUv0 * 2.0 + vec2(uDrTime * uP.x, 0.0);
  vec2 dd = texture2D(uMap2, vUv0).zw - 0.5;
  vec4 sh = texture2D(uMap2, u2 + dd * vec2(0.2, 1.0));
  rgb = mix(sh.rgb * vCol.rgb, vec3(0.4), uP.y);
  a = texture2D(uMap, vUv).a * vCol.a * clamp(vW.y * 0.4, 0.0, 1.0) * sh.a;
  float f = pow(drEnvFogAmount(vW, vec3(0.0), mb), 25.0);
  rgb = mix(rgb, drEnvFogColor(vW), f);
#elif defined(FAM_SHIMMER)
  vec3 uvt = texture2D(uMap, vUv0).xyz;
  vec4 im = texture2D(uMap2, uvt.xy * uP.zw + uDrTime * uP2.xy);
  rgb = im.rgb; a = clamp(uvt.z * im.a * vCol.a * uP.x * 5.0, 0.0, 1.0);
#elif defined(FAM_SONAR)
  float rr = vCol.r; rr = rr * rr; rr = rr * rr; rr = rr * rr; // vcol.r^8 (vành sáng của mesh); phần giao cắt cảnh cần depth texture: bỏ [ĐỀ XUẤT]
  rgb = vCol.rgb; a = min(1.0, rr) * vCol.a;
#elif defined(FAM_ONTOP)
  rgb = c.rgb;
#elif defined(FAM_OPAQUE)
  if (a < 0.5) discard;
  rgb = c.rgb * uP.x; // EmissionBoost
#else
  vec3 L = vec3(0.0), lit = vec3(1.0);
  #if defined(FAM_FLOATING)
    if (a < 0.5) discard;
    #ifdef FOAMCOL
      c.rgb = uFoam * vCol.rgb; a = texture2D(uMap, vUv).a * vCol.a;
    #endif
    L = clamp(drEnvLights(vW), 0.0, 1.0);
    lit = uDrSunCol + L + uDrAmb + (1.0 - mb) + vec3(uDrTintK, 0.0, 0.0);
  #elif defined(FAM_CUTOUT)
    if (a < 0.3) discard;
  #elif defined(FAM_FIRE)
    if (a < 0.5) discard;
  #elif defined(FAM_LIT)
    c = texture2D(uMap, vUv0) * vCol;
    L = drEnvLights(vW);
    lit = uDrSunCol + L + uDrAmb + (1.0 - mb);
  #elif defined(FAM_ANIMAL)
    c = texture2D(uMap, vUv0) * vec4(1.0, 1.0, 1.0, vCol.a);
    if (c.a < 0.5) discard;
    lit = 0.5 * (1.0 + uDrSunCol + uDrAmb + (1.0 - mb)); // [ĐỀ XUẤT] bỏ vỗ vây/cánh của FishParticle/BirdParticle
  #elif defined(LIGHT_FULL)
    L = drEnvLights(vW);
    lit = uDrSunCol + L + uDrAmb + (1.0 - mb) + vec3(uDrTintK, 0.0, 0.0);
  #elif defined(LIGHT_HALF)
    lit = 0.5 * (1.0 + uDrSunCol + uDrAmb + (1.0 - mb) + vec3(uDrTintK, 0.0, 0.0));
  #endif
  float f = drEnvFogAmount(vW, L, mb);
  #ifdef IGNOREFOG
    f = max(f - clamp(vW.y * 0.5, 0.0, 1.0), 0.0);
  #endif
  rgb = mix(c.rgb * lit, drEnvFogColor(vW), f);
  #ifdef EMIS
    rgb += texture2D(uEmis, vUv).rgb * 4.0;
  #endif
  #ifdef FADEY
    a *= clamp(vW.y, 0.0, 1.0);
  #endif
#endif
  gl_FragColor = vec4(rgb, a);
${'#'}include <encodings_fragment>
}`;

  function makeMaterial(mat, mapId, kind) {
    const fam = FAM[mat.shader] || 'particle', kw = mat.kw || [], fl = mat.fl || {};
    const defines = { ['FAM_' + fam.toUpperCase()]: '' };
    if (kind !== 'quad') defines.MESH = '';
    if (kw.some(k => /ENUM_5D56C994BDE941F59A6C6CEA347437AF_FULL/.test(k))) defines.LIGHT_FULL = '';
    if (kw.some(k => /ENUM_5D56C994BDE941F59A6C6CEA347437AF_HALF/.test(k))) defines.LIGHT_HALF = '';
    if (kw.includes('BOOLEAN_BB87E796BC3A411C8E839A6AD4D54093_ON')) defines.IGNOREFOG = '';
    if (kw.includes('_FADEATWORLDYZERO')) defines.FADEY = '';
    if (kw.includes('BOOLEAN_692E8C117AD14315B7D4311EEECA9E43_ON')) defines.FOAMCOL = '';
    if (kw.includes('_SNAPTOWATERSURFACE') && root.DRWater) defines.SNAP = '';
    const emis = matTex(mat, ['Emission']);
    if (emis && fam === 'particle') defines.EMIS = '';
    const WHITE = whiteTex();
    let map2 = null;
    if (fam === 'fogdevil') map2 = tex(matTex(mat, ['Texture2D_296edb7b559a4465a03e5064e2dd628b']));
    if (fam === 'shimmer') map2 = tex(matTex(mat, ['Image']));
    const col = mat.col || {};
    const uni = Object.assign({
      uMap: { value: tex(mapId) || WHITE }, uMap2: { value: map2 || WHITE }, uEmis: { value: tex(emis) || WHITE },
      uP: { value: new T.Vector4(fam === 'fogdevil' ? fl.SpinSpeed || 0 : fam === 'shimmer' ? (fl.Opacity == null ? 1 : fl.Opacity) : fl.EmissionBoost || 1,
        fl.NeutralAmount || 0, (col.Tiling || [1, 1])[0], (col.Tiling || [1, 1])[1]) },
      uP2: { value: new T.Vector4((col.ScrollSpeed || [0, 0])[0], (col.ScrollSpeed || [0, 0])[1], 0, 0) },
      uFoam: { value: new T.Color(1, 1, 1) }
    }, T.UniformsUtils.clone(T.UniformsLib.fog));
    if (defines.SNAP) Object.assign(uni, root.DRWater.uniforms);
    const blend = mat.blend || [1, 0, 1, 0], opaque = blend[0] === 1 && blend[1] === 0;
    defines.DR_OWN_FOG = '';
    const m = new T.ShaderMaterial({
      uniforms: uni, defines, fog: true, transparent: !opaque, depthWrite: !!(mat.zw === 1 || mat.zw === undefined && opaque),
      // quad tự dựng (billboard/stretched/vertical) luôn quay về camera; DoubleSide để chiều quấn không làm mất hạt
      depthTest: mat.zt !== 8, side: mat.cull === 0 || kind === 'quad' ? T.DoubleSide : T.FrontSide,
      vertexShader: VERT.replace('#include <dr_wave>', root.DRWater ? root.DRWater.GLSL_WAVE : ''),
      fragmentShader: FRAG
    });
    if (!opaque) {
      const F = BF(), num = v => typeof v === 'number' ? v : 1;
      m.blending = T.CustomBlending;
      m.blendSrc = F[num(blend[0])]; m.blendDst = F[num(blend[1])]; m.blendSrcAlpha = F[num(blend[2])]; m.blendDstAlpha = F[num(blend[3])];
    }
    m.userData.fam = fam;
    m.userData.foam = !!defines.FOAMCOL;
    return m;
  }
  let white = null;
  function whiteTex() { if (!white) { white = new T.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); white.needsUpdate = true; } return white; }

  function getBatch(matId, mat, mapId, kind) {
    const key = matId + '|' + (mapId || '') + '|' + kind;
    let b = batches.get(key);
    if (b) return b;
    const quad = kind === 'quad', F = quad ? QUAD_F : MESH_F;
    const g = new T.InstancedBufferGeometry();
    if (quad) {
      g.setAttribute('position', new T.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
      g.setAttribute('uv', new T.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
      g.setIndex([0, 1, 2, 0, 2, 3]);
    } else {
      const me = LIB.meshes[kind];
      const n = me.pos.length / 3;
      g.setAttribute('position', new T.BufferAttribute(new Float32Array(me.pos), 3));
      g.setAttribute('normal', new T.BufferAttribute(new Float32Array(me.nrm || new Array(n * 3).fill(0)), 3));
      g.setAttribute('uv', new T.BufferAttribute(new Float32Array(me.uv || new Array(n * 2).fill(0)), 2));
      const cc = new Float32Array(n * 4).fill(1);
      if (me.col) for (let i = 0; i < n * 4; i++) cc[i] = me.col[i];
      g.setAttribute('aCol0', new T.BufferAttribute(cc, 4));
      g.setIndex(me.index);
    }
    b = { key, matId, mat, kind, F, cap: 0, g, mesh: null, data: null, n: 0, order: [], depth: null };
    b.material = makeMaterial(mat, mapId, kind);
    grow(b, 64);
    const mesh = new T.Mesh(g, b.material);
    mesh.frustumCulled = false;
    const q = mat.queue >= 0 ? mat.queue : (mat.sq || 3000);
    // hàng đợi Unity → renderOrder: nước 1 (trong suốt), bọt thuyền 2; hạt trong suốt sau nước, đục theo lượt đục
    mesh.renderOrder = q >= 2500 ? 2 + (q - 3000) / 1000 : 0;
    mesh.name = 'particles ' + key;
    scene.add(mesh);
    b.mesh = mesh;
    batches.set(key, b);
    return b;
  }
  function grow(b, need) {
    let cap = Math.max(64, b.cap);
    while (cap < need) cap *= 2;
    if (cap === b.cap) return;
    const data = new Float32Array(cap * b.F);
    if (b.data) data.set(b.data.subarray(0, Math.min(b.data.length, data.length)));
    const ib = new T.InstancedInterleavedBuffer(data, b.F);
    ib.setUsage(T.DynamicDrawUsage);
    const A = (name, size, off) => b.g.setAttribute(name, new T.InterleavedBufferAttribute(ib, size, off));
    if (b.kind === 'quad') { A('iPos', 3, 0); A('iSize', 2, 3); A('iRot', 1, 5); A('iMode', 1, 6); A('iDir', 3, 7); A('iCol', 4, 10); A('iUV', 4, 14); A('iMax', 1, 18); }
    else { A('iPos', 3, 0); A('iQ', 4, 3); A('iS', 3, 7); A('iCol', 4, 10); A('iUV', 4, 14); }
    b.data = data; b.ib = ib; b.cap = cap;
    // three r140 chỉ gán _maxInstanceCount một lần (lần vẽ đầu, theo cỡ bộ đệm lúc đó) rồi vẽ min(instanceCount, nó): không xoá thì lô đã tăng cỡ vẫn bị cắt ở cỡ cũ
    b.g._maxInstanceCount = undefined;
  }

  const MODE = { billboard: 0, stretched: 1, horizontal: 2, vertical: 3 };
  const qa = [0, 0, 0, 1], qb = [0, 0, 0, 1];
  function draw(s, camPos) {
    const nd = s.node, R = nd.r;
    if (!s.n || !R || R.on === 0 || R.mode === 'none') return;
    const matId = R.mats && R.mats[0], mat = matId && s.eff.d.materials ? s.eff.d.materials[matId] || (DATA[s.eff.name].materials || {})[matId] : null;
    if (!mat) return;
    const SH = nd.sheet, sprites = SH && SH.mode === 1 ? (SH._spr || (SH._spr = SH.sprites.filter(Boolean))) : null;
    const sp0 = sprites && sprites.length ? LIB.sprites[sprites[0]] : null;
    const fam = FAM[mat.shader] || 'particle';
    const mapId = sp0 ? sp0.tex : matTex(mat, fam === 'floating' || fam === 'fire' ? ['Sprite', 'Texture'] : fam === 'shimmer' ? ['UVTexture'] :
      fam === 'lit' ? ['Albedo'] : fam === 'animal' ? ['MainTex'] : ['Texture', 'Sprite', 'MainTex']);
    const kind = R.mode === 'mesh' ? (R.mesh && LIB.meshes[R.mesh] ? R.mesh : null) : 'quad';
    if (!kind) return;
    const b = getBatch(matId, mat, mapId, kind);
    grow(b, b.n + s.n);
    const D = b.data, F = b.F, world = nd.main.space === 1, M = s.M;
    const SO = nd.sizeOL, CO = nd.colorOL, mode = MODE[R.mode] || 0, LUT = CO && CO.gradient ? colLut(CO.gradient) : null;
    const sc = (Math.abs(s.sc[0]) + Math.abs(s.sc[1]) + Math.abs(s.sc[2])) / 3;
    const tiles = SH && SH.mode === 0 ? SH.tiles : null;
    for (let i = 0; i < s.n; i++) {
      const t = s.age[i] / s.life[i], r0 = s.rnd[i * 4];
      let x = s.px[i], y = s.py[i], z = s.pz[i];
      if (!world) { const X = x, Y = y, Z = z; x = M[0] * X + M[4] * Y + M[8] * Z + M[12]; y = M[1] * X + M[5] * Y + M[9] * Z + M[13]; z = M[2] * X + M[6] * Y + M[10] * Z + M[14]; }
      let kx = 1, ky = 1, kz = 1;
      if (SO) { kx = ev(SO.x, t, r0); if (SO.sep) { ky = ev(SO.y, t, r0); kz = ev(SO.z, t, r0); } else ky = kz = kx; }
      const k = world ? 1 : 1;
      const w = s.sx[i] * kx * sc * k, h = s.sy[i] * ky * sc * k, dpt = s.sz[i] * kz * sc * k;
      let cr = s.cr[i], cg = s.cg[i], cb = s.cb[i], ca = s.ca[i];
      if (LUT) { const j = Math.min(64, Math.max(0, Math.round(t * 64))) * 4; cr *= LUT[j]; cg *= LUT[j + 1]; cb *= LUT[j + 2]; ca *= LUT[j + 3]; }
      else if (CO) { evCol(CO, t, r0, tmpC); cr *= s2l(tmpC[0]); cg *= s2l(tmpC[1]); cb *= s2l(tmpC[2]); ca *= tmpC[3]; }
      let u0 = 0, v0 = 0, u1 = 1, v1 = 1;
      if (sp0 && sprites.length === 1) { u0 = sp0.r[0]; v0 = sp0.r[1]; u1 = sp0.r[2]; v1 = sp0.r[3]; }
      else if (sprites && sprites.length) {
        const fi = Math.floor((ev(SH.fot, t, r0) * (SH.cycles || 1) + s.fr[i]) % 1 * sprites.length);
        const spr = LIB.sprites[sprites[Math.max(0, Math.min(sprites.length - 1, fi))]];
        if (spr) { u0 = spr.r[0]; v0 = spr.r[1]; u1 = spr.r[2]; v1 = spr.r[3]; }
      } else if (tiles) {
        const nT = tiles[0] * tiles[1], f = Math.floor(((ev(SH.fot, t, r0) * (SH.cycles || 1) + s.fr[i]) % 1) * nT) % nT;
        const cx = f % tiles[0], cy = Math.floor(f / tiles[0]);
        u0 = cx / tiles[0]; u1 = (cx + 1) / tiles[0]; v1 = 1 - cy / tiles[1]; v0 = 1 - (cy + 1) / tiles[1];
      }
      const o = (b.n++) * F;
      // three.js: z → −z; màu: gamma → tuyến tính (ParticleSystemRenderer m_ApplyActiveColorSpace)
      D[o] = x; D[o + 1] = y; D[o + 2] = -z;
      if (kind === 'quad') {
        D[o + 3] = w; D[o + 4] = mode === 1 ? h * (R.lscale == null ? 1 : R.lscale) : h; D[o + 5] = -s.rz[i]; D[o + 6] = mode;
        if (mode === 1) {
          let vx = s.vx[i], vy = s.vy[i], vz = s.vz[i];
          if (nd.vel && nd.vel.world) { vx += ev(nd.vel.x, t, r0); vy += ev(nd.vel.y, t, s.rnd[i * 4 + 1]); vz += ev(nd.vel.z, t, s.rnd[i * 4 + 2]); }
          if (!world) { qrot3(s.q, vx, vy, vz, tmpV); vx = tmpV[0]; vy = tmpV[1]; vz = tmpV[2]; }
          const sp = Math.hypot(vx, vy, vz) || 1;
          D[o + 4] += sp * (R.vscale || 0);
          D[o + 7] = vx / sp; D[o + 8] = vy / sp; D[o + 9] = -vz / sp;
        } else { D[o + 7] = 0; D[o + 8] = 1; D[o + 9] = 0; }
        D[o + 10] = cr; D[o + 11] = cg; D[o + 12] = cb; D[o + 13] = ca;
        D[o + 14] = u0; D[o + 15] = v0; D[o + 16] = u1; D[o + 17] = v1; D[o + 18] = R.maxSz || 0.5;
      } else {
        // hướng mesh: Euler hạt (Unity ZXY); alignment Local(2) nhân quay emitter; View(0) theo camera [ĐỀ XUẤT: coi như World]
        euler(s.rx[i], s.ry[i], s.rz[i], qa);
        if (R.align === 2) qmul(s.q, qa, qa);
        D[o + 3] = -qa[0]; D[o + 4] = -qa[1]; D[o + 5] = qa[2]; D[o + 6] = qa[3];
        // cỡ theo từng trục = startSize (1 số hoặc 3D) × SizeOverLifetime từng trục khi separateAxes, kể cả lúc startSize3D tắt
        // (SmallSplash/EndSplash của cá heo: startSize 0,5 một số, sizeOL y lên 1 ở 14 % đời còn x/z lớn dần) [pmesh]
        D[o + 7] = w; D[o + 8] = h; D[o + 9] = dpt;
        D[o + 10] = cr; D[o + 11] = cg; D[o + 12] = cb; D[o + 13] = ca;
        D[o + 14] = u0; D[o + 15] = v0; D[o + 16] = u1; D[o + 17] = v1;
      }
    }
  }
  function flush(camPos) {
    stat.batches = 0;
    const wp = root.DRWater && DRWater.props ? DRWater.props() : null;
    for (const b of batches.values()) {
      const used = b.n;
      b.g.instanceCount = used;
      b.mesh.visible = used > 0;
      if (!used) continue;
      stat.batches++;
      // trong suốt: xếp xa → gần trong lô (Unity xếp theo renderer; ở đây cả lô chung một draw call)
      // xếp chỉ cho vật liệu mềm (Particle/FogDevil/AlwaysOnTop); FloatingParticle cắt alpha 0,5 nên thứ tự gần như không lộ
      if (b.material.transparent && used > 1 && b.material.userData.fam !== 'floating' && b.material.userData.fam !== 'shimmer') {
        const F = b.F, D = b.data;
        if (!b.depth || b.depth.length < used) { b.depth = new Float32Array(b.cap); b.tmp = new Float32Array(b.cap * F); }
        const idx = b.order; idx.length = used;
        for (let i = 0; i < used; i++) { idx[i] = i; const o = i * F; b.depth[i] = (D[o] - camPos.x) ** 2 + (D[o + 1] - camPos.y) ** 2 + (D[o + 2] - camPos.z) ** 2; }
        idx.sort((a, c) => b.depth[c] - b.depth[a]);
        for (let i = 0; i < used; i++) b.tmp.set(D.subarray(idx[i] * F, idx[i] * F + F), i * F);
        D.set(b.tmp.subarray(0, used * F));
      }
      b.ib.updateRange.offset = 0; b.ib.updateRange.count = used * b.F;
      b.ib.needsUpdate = true;
      if (b.material.userData.foam && wp) { const fc = wp.foamColor; b.material.uniforms.uFoam.value.setRGB(s2l(fc[0]), s2l(fc[1]), s2l(fc[2])); }
      const fog = scene.fog;
      if (fog) b.material.uniforms.fogColor.value.copy(fog.color);
    }
  }

  // ---------------------------------------------------------------- nguồn đặt sẵn
  const ambient = [];  // { e (dòng SCENE), h (handle), check }
  let ambT = 0;
  function todOn(tod) {
    if (!tod) return true;
    const D = root.DR, t = D && D.s ? ((D.s.time % 1) + 1) % 1 : 0.5;
    return tod[0] > tod[1] ? (t < tod[1] || t > tod[0]) : (t < tod[1] && t > tod[0]);
  }
  function updateAmbient(dt, cam) {
    ambT -= dt;
    if (ambT > 0) return;
    ambT = 0.25;
    const fogFar = root.DRSky && DRSky.env ? DRSky.env.fogFar : 350;
    if (!frustum) frustum = new T.Frustum();
    cam.updateMatrixWorld(); projM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); frustum.setFromProjectionMatrix(projM);
    for (const a of ambient) {
      const e = a.e, c = e.cull;
      const cx = c ? c.c[0] + c.off[0] : e.pos[0], cy = c ? c.c[1] + c.off[1] : e.pos[1], cz = -(c ? c.c[2] + c.off[2] : e.pos[2]);
      const d = Math.hypot(cx - cam.position.x, cy - cam.position.y, cz - cam.position.z);
      const r = c ? c.r : 5, far = Math.min(c ? c.far : 200, fogFar + 40);
      sphere.center.set(cx, cy, cz); sphere.radius = r + 10;
      // CullingBrain: dải 0 luôn bật; dải 1 bật khi trong khung nhìn; xa hơn tắt. Thêm: quá tầm sương thì tắt.
      const on = (e.gate ? gates[e.gate] !== false : true) && (d - r < (c ? c.near : 1) || (d - r < far && frustum.intersectsSphere(sphere)));
      if (on && !a.h) a.h = spawn(e.name, { pos: [e.pos[0], e.pos[1], -e.pos[2]], q: e.q, scale: e.scale, scene: e });
      else if (!on && a.h) { kill_(a.h._eff); a.h = null; }
      if (a.h) { const want = todOn(e.tod); for (const s of a.h._eff.systems) if (!s.isSub) { if (want && !s.emitting && s.node.main.play) { s.emitting = true; s.playing = true; } else if (!want) s.emitting = false; } }
    }
  }
  let frustum = null, projM = null, sphere = null;
  function kill_(eff) { eff.alive = false; const i = effects.indexOf(eff); if (i >= 0) effects.splice(i, 1); }

  // ---------------------------------------------------------------- vòng đời
  function init(sc) {
    T = root.THREE; scene = sc; ready = !!(T && sc);
    if (!ready) return;
    projM = new T.Matrix4(); sphere = new T.Sphere();
    // q của SCENE là hệ Unity: spawn nhận q Unity qua opts.q (bỏ qua yaw)
    for (const e of SCENE) if (DATA[e.name]) ambient.push({ e, h: null });
  }
  function update(dt, cam) {
    if (!ready) return;
    const t0 = performance.now();
    camObj = cam;
    if (cam) updateAmbient(dt, cam);
    stat.particles = 0; stat.systems = 0;
    for (const b of batches.values()) b.n = 0;
    for (let k = effects.length - 1; k >= 0; k--) {
      const eff = effects[k];
      for (const s of eff.systems) { if (!s.prev) s.prev = [0, 0, 0]; s.prev[0] = s.pos[0]; s.prev[1] = s.pos[1]; s.prev[2] = s.pos[2]; }
      placeEffect(eff, dt);
      let live = 0, emitting = false;
      for (const s of eff.systems) {
        const sim = s.idx === 0 && eff.simAbs != null ? eff.simAbs : s.node.main.simSpeed == null ? 1 : s.node.main.simSpeed;
        if (dt > 0) stepSystem(s, dt * sim * (eff.speed || 1));
        live += s.n; if (s.emitting && !s.isSub) emitting = true;
        stat.particles += s.n; stat.systems++;
      }
      // hệ một lần (không loop, hoặc đã stop, hoặc rate 0 không burst) hết hạt thì giải phóng; hệ đang được giữ (eff.held) thì chỉ khi stop()
      if (!live && (eff.stopped || !eff.held) && (eff.stopped || !emitting || eff.systems.every(s => !s.node.emission || s.isSub ||
        (ev(s.node.emission.rate, 0, 0) === 0 && !s.node.emission.bursts && !s.node.emission.dist))) && !eff.opts.scene && eff.age > 0.05) { kill_(eff); continue; }
      eff.age = (eff.age || 0) + dt;
      if (cam) for (const s of eff.systems) draw(s, cam.position);
    }
    stat.effects = effects.length;
    if (cam) flush(cam.position);
    const ms = performance.now() - t0; stat.ms = stat.ms == null ? ms : stat.ms * 0.95 + ms * 0.05;
  }
  function has(name) { return !!DATA[name]; }
  function names() { return Object.keys(DATA); }
  function stats() {
    const by = {};
    for (const e of effects) { const k = e.name; by[k] = by[k] || { n: 0, particles: 0, systems: e.systems.length }; by[k].n++; by[k].particles += e.systems.reduce((a, s) => a + s.n, 0); }
    // drawn: số hạt three vẽ thật = min(instanceCount, _maxInstanceCount) như WebGLRenderer r140
    let drawn = 0;
    for (const b of batches.values()) if (b.mesh.visible) drawn += Math.min(b.g.instanceCount, b.g._maxInstanceCount == null ? Infinity : b.g._maxInstanceCount);
    return Object.assign({}, stat, { byName: by, ambientOn: ambient.filter(a => a.h).length, ambient: ambient.length, drawCalls: stat.batches, drawn });
  }
  function setGate(name, on) { gates[name] = !!on; }
  root.DRParticles = { init, update, spawn, has, names, stats, setGate, get effects() { return effects; }, get ambient() { return ambient; },
    _ev: ev, _curve: curve };
})(typeof window !== 'undefined' ? window : globalThis);
