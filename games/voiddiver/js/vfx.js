/*
 * vfx.js — trình phát hệ hạt Shuriken gốc của VOID DIVER từ art/vfx/*.json (tools/fx_export.py).
 *
 * VD.vfx.load(name) → Promise           nạp prefab (tên gốc, có hoặc không thư mục; tên "…_Hit" theo hệ
 *                                        nguyên tố tự chọn biến thể theo opts.element khi play, mặc định None)
 * VD.vfx.preload(names) → Promise    nạp trước (không chặn); tên "…_Hit" nạp mọi biến thể nguyên tố
 * VD.vfx.play(name, {pos, dir, aim, follow, followRot, scale, scaleX, local, speeds, element, loop, loopDuration,
 *                    duration, owner, tracking}) → handle
 *        pos   {x,y,z} (toạ độ three). dir: yaw (rad) sao cho hướng tới của prefab (Unity +Z) chỉ về
 *        (sin dir, 0, cos dir); hoặc aim {x,z}. follow: Object3D bám vị trí (followRot: bám cả hướng);
 *        khi follow, pos là độ lệch so với follow (như VfxOffset/boneType của bảng).
 *        loop: true = mọi hệ hạt lặp theo chu kỳ duration của nó cho tới stop() (VfxEvent.IsLoop,
 *        HitBox.IsLoopVfx, hiệu ứng trạng thái VfxDuration −1 "còn buff là còn hiệu ứng").
 *        duration: > 0 thì tự xoá ngay sau chừng ấy giây (Destroy sau VfxDuration / hitVfxDuration).
 *        loopDuration > 0 (cùng loop): mỗi chừng ấy giây phát lại mọi hệ (ParticleLooper gốc), hạt cũ chạy nốt.
 *        speeds [{endTime, speed}]: tốc độ phát từng đoạn theo giờ của hiệu ứng (VfxSpeeds/vfxSpeeds của bảng).
 *        local {x,y,z}: độ lệch trong khung của hiệu ứng, toạ độ Unity (z tới trước), quay theo dir/follow.
 *        scaleX: −1 lật gương trục X cục bộ (HitBox.InheritOwnerScaleX theo hướng lật của chủ).
 *        owner: Object3D của chủ skill, tracking: bám hitbox — cho script trong prefab (ChainSkillVfx).
 *        only: tên GameObject trong prefab — chỉ phát nhánh đó (bật nó + tổ tiên, như script SetActive(true)).
 *        Dùng cho prefab đồ vật nhiều trạng thái: WaveExit/SafeExit 'phonebooth_begin' (gọi bốt tới),
 *        'phonebooth_end' (thoát). Con bị tắt sẵn trong nhánh vẫn tắt.
 * VD.vfx.stop(handle, mode)              ngừng phát (hạt còn sống chạy nốt); true = xoá ngay; 'end' = chạy trạng thái
 *                                        End của Animator nếu có, không thì xoá ngay (Destroy/PlayEnd gốc)
 * VD.vfx.update(dt, camera)              mô phỏng + ghi buffer; gọi mỗi khung trước render
 * VD.vfx.setScene(scene)                 gắn nhóm vẽ + 4 PointLight dùng chung
 *
 * Mỗi hệ hạt của một prefab = một "mẫu" (template). Mọi bản đang phát của cùng mẫu dồn vào MỘT
 * InstancedBufferGeometry + MỘT ShaderMaterial (1 draw call / mẫu đang hiện). Mô phỏng trên CPU,
 * không cấp phát trong vòng lặp nóng (mảng typed cấp theo dung lượng, gấp đôi khi thiếu).
 *
 * Shader: dịch từ DXBC của shader nhà (ArtTeam/VFX/VFX_Master_typeA, typeB, typeB_Xpan, typeA_Trail),
 * đọc bằng fxc /dumpbin — xem tools/fx_README.md. Dữ liệu từng hạt đi qua TEXCOORD1..3 theo đúng cách
 * Unity nhồi custom vertex stream (slots trong JSON).
 */
(function (VD) {
  'use strict';
  var THREE = window.THREE;
  var LN = 64;                      // số mẫu bảng tra đường cong
  var MAX_LIGHTS = 4;
  var GRAVITY = 9.81;               // Physics.gravity mặc định của Unity (không có trong bảng)

  var V = VD.vfx = {
    base: 'art/vfx/',
    stats: { effects: 0, systems: 0, particles: 0, drawCalls: 0, simMs: 0 },
    unsupported: {},
  };

  // ------------------------------------------------------------------ util --
  var seed = 0x9e3779b9;
  function rand() {                 // mulberry32
    seed = (seed + 0x6D2B79F5) | 0;
    var t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  V.seed = function (s) { seed = s | 0; };
  function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
  function frac(x) { return x - Math.floor(x); }
  function s2l(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }

  // ------------------------------------------------------ curve / gradient --
  function hermite(k, t) {
    var n = k.length / 4;
    if (n === 0) return 0;
    if (t <= k[0] || n === 1) return k[1];
    var last = (n - 1) * 4;
    if (t >= k[last]) return k[last + 1];
    for (var i = 0; i < n - 1; i++) {
      var a = i * 4, b = a + 4;
      if (t <= k[b]) {
        var t0 = k[a], t1 = k[b], v0 = k[a + 1], v1 = k[b + 1], m0 = k[a + 3], m1 = k[b + 2];
        var dt = t1 - t0;
        if (dt <= 0) return v1;
        if (Math.abs(m0) >= 1e8 || Math.abs(m1) >= 1e8) return v0;   // tiếp tuyến "constant"
        var s = (t - t0) / dt, s2 = s * s, s3 = s2 * s;
        return (2 * s3 - 3 * s2 + 1) * v0 + (s3 - 2 * s2 + s) * dt * m0 + (-2 * s3 + 3 * s2) * v1 + (s3 - s2) * dt * m1;
      }
    }
    return k[last + 1];
  }
  function bakeCurve(keys, mult) {
    var L = new Float32Array(LN + 1);
    for (var i = 0; i <= LN; i++) L[i] = hermite(keys || [], i / LN) * mult;
    return L;
  }
  function lut(L, t) {
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    var f = t * LN, i = f | 0;
    if (i >= LN) return L[LN];
    return L[i] + (L[i + 1] - L[i]) * (f - i);
  }
  // MinMaxCurve: {t:0 hằng a | 1 cong L | 2 hai cong L,L0 | 3 hai hằng a,b}
  function mmc(src, dflt) {
    if (src === undefined || src === null) src = dflt === undefined ? 0 : dflt;
    if (typeof src === 'number') return { t: 0, a: src, b: src, max: src };
    if (Array.isArray(src)) return { t: 3, a: src[0], b: src[1], max: Math.max(src[0], src[1]) };
    var c = { t: src.k0 ? 2 : 1, L: bakeCurve(src.k, src.m), m: src.m };
    if (src.k0) c.L0 = bakeCurve(src.k0, src.m);
    var mx = -1e9;
    for (var i = 0; i <= LN; i++) { mx = Math.max(mx, c.L[i]); if (c.L0) mx = Math.max(mx, c.L0[i]); }
    c.max = mx;
    c.a = c.L[0];
    return c;
  }
  function ev(c, t, r) {
    switch (c.t) {
      case 0: return c.a;
      case 3: return c.a + (c.b - c.a) * r;
      case 1: return lut(c.L, t);
      default: { var x = lut(c.L0, t); return x + (lut(c.L, t) - x) * r; }
    }
  }
  function isZero(c) { return c.t === 0 && c.a === 0; }
  function bakeGrad(g, linear) {
    var L = new Float32Array((LN + 1) * 4);
    var c = g.c, a = g.a, fixed = !!g.f;
    for (var i = 0; i <= LN; i++) {
      var t = i / LN, o = i * 4;
      for (var ch = 0; ch < 3; ch++) L[o + ch] = gradKey(c, 4, ch + 1, t, fixed);
      L[o + 3] = gradKey(a, 2, 1, t, fixed);
      if (linear) for (ch = 0; ch < 3; ch++) L[o + ch] = s2l(Math.max(0, L[o + ch]));
    }
    return L;
  }
  function gradKey(k, stride, off, t, fixed) {
    var n = k.length / stride;
    if (n === 0) return 1;
    if (t <= k[0]) return k[off];
    for (var i = 0; i < n - 1; i++) {
      var a = i * stride, b = a + stride;
      if (t <= k[b]) {
        if (fixed) return k[b + off];
        var d = k[b] - k[a], s = d > 0 ? (t - k[a]) / d : 1;
        return k[a + off] + (k[b + off] - k[a + off]) * s;
      }
    }
    return k[(n - 1) * stride + off];
  }
  // MinMaxGradient: {t:0 hằng c | 1 grad L | 2 hai màu c0,c1 | 3 hai grad L,L0 | 4 màu ngẫu nhiên L}
  // Giữ gamma (như vertex color của Unity trước khi GPU đổi sang linear) — đổi trong vertex shader.
  function mmg(src) {
    if (!src) return { t: 0, c: [1, 1, 1, 1], white: true };
    if (Array.isArray(src)) return { t: 0, c: src, white: src[0] === 1 && src[1] === 1 && src[2] === 1 && src[3] === 1 };
    if (src.g && src.g0) return { t: 3, L: bakeGrad(src.g), L0: bakeGrad(src.g0) };
    if (src.g) return { t: 1, L: bakeGrad(src.g) };
    if (src.c0) return { t: 2, c0: src.c0, c1: src.c1 };
    return { t: 4, L: bakeGrad(src.rc) };
  }
  function lutG(L, t, o, oi) {
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    var f = t * LN, i = f | 0, fr = f - i;
    if (i >= LN) { i = LN - 1; fr = 1; }
    var a = i * 4, b = a + 4;
    for (var ch = 0; ch < 4; ch++) o[oi + ch] = L[a + ch] + (L[b + ch] - L[a + ch]) * fr;
  }
  var tmpG = new Float32Array(4);
  function evG(g, t, r, o, oi) {
    switch (g.t) {
      case 0: o[oi] = g.c[0]; o[oi + 1] = g.c[1]; o[oi + 2] = g.c[2]; o[oi + 3] = g.c[3]; return;
      case 1: lutG(g.L, t, o, oi); return;
      case 2: for (var i = 0; i < 4; i++) o[oi + i] = g.c0[i] + (g.c1[i] - g.c0[i]) * r; return;
      case 3: lutG(g.L0, t, tmpG, 0); lutG(g.L, t, o, oi); for (i = 0; i < 4; i++) o[oi + i] = tmpG[i] + (o[oi + i] - tmpG[i]) * r; return;
      default: lutG(g.L, r, o, oi);
    }
  }

  // ------------------------------------------------------------- shaders --
  var VERT = [
    'attribute vec4 iPos;', 'attribute vec4 iSize;', 'attribute vec4 iRot;', 'attribute vec4 iCol;',
    'attribute vec4 iUV;', 'attribute vec4 iVel;', 'attribute vec4 iC1;', 'attribute vec4 iC2;', 'attribute vec4 iC3;',
    '#ifdef HAS_MCOL', 'attribute vec4 mcol;', '#endif',
    'uniform vec3 uPivot;', 'uniform vec4 uStretch;', 'uniform vec2 uSzClamp;',
    'varying vec2 vUV; varying vec4 vCol; varying vec4 vC1; varying vec4 vC2; varying vec4 vC3; varying float vNdV; varying float vMir;',
    'vec3 qrot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }',
    'vec3 s2l(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c)); }',
    'void main() {',
    '  vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);',
    '  vec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);',
    '  vec3 camB = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);', // hướng về phía camera
    '  vec3 c = iPos.xyz; vec3 wp; vec3 nrm = camB;',
    '  vec2 sz = iSize.xy;',
    '#if MODE != 4',
    '  float dist = max(dot(c - cameraPosition, -camB), 0.01);',
    '  float viewH = 2.0 * dist / projectionMatrix[1][1];',
    '  float big = max(abs(sz.x), abs(sz.y));',
    '  if (big > uSzClamp.y * viewH) sz *= uSzClamp.y * viewH / big;',
    '  if (big < uSzClamp.x * viewH && big > 0.0) sz *= uSzClamp.x * viewH / big;',
    // lật (flip) chỉ lật hình, không lật pivot: 1001_01_SwordAttack_Cast_1st có flip z 0.5 + pivot z -0.3 trên mesh phẳng,
    // lật cả pivot thì 2 hạt của cùng burst tách nhau 1,6 m theo chiều dọc
    '  vec2 q = position.xy * sz + uPivot.xy * abs(sz);',
    '  float sn = sin(iRot.x), cs = cos(iRot.x);',
    '  q = vec2(q.x * cs + q.y * sn, -q.x * sn + q.y * cs);',   // dương = theo chiều kim đồng hồ trên màn hình
    '#endif',
    '#if MODE == 0 && defined(ALIGNQ)',
    // billboard căn World/Local: mặt quad theo khung (quaternion từ CPU, đã gồm góc xoay hạt)
    '  vec2 qa = position.xy * sz + uPivot.xy * abs(sz);',
    '  wp = c + qrot(iRot, vec3(qa, -uPivot.z * abs(sz.x)));',
    '  nrm = qrot(iRot, vec3(0.0, 0.0, 1.0));',
    '#elif MODE == 0',
    // pivot.z của Unity dọc theo hướng nhìn (+z = xa camera): hit flash dùng -2 để kéo lên trước nhân vật
    '  wp = c + camR * q.x + camU * q.y - camB * (uPivot.z * abs(sz.x));',
    '#elif MODE == 1',
    '  vec3 vel = iVel.xyz;',
    '  float sp = length(vel);',
    '  vec3 ax = sp > 1e-5 ? vel / sp : camU;',
    '  vec3 toCam = normalize(cameraPosition - c);',
    '  vec3 side = cross(ax, toCam); float sl = length(side);',
    '  side = sl > 1e-5 ? side / sl : camR;',
    // U chạy theo hướng bay (ảnh gốc: đầu vệt ở U=1). Đầu (U=1) nằm ở vị trí hạt, thân kéo về sau;
    // lengthScale âm (muzzle 100003: -2) lật quad ra phía trước.
    '  float len = abs(sz.x) * uStretch.y + sp * uStretch.x;',   // lengthScale, velocityScale
    '  vec2 p0 = position.xy + uPivot.xy;',
    '  wp = c + ax * ((p0.x - 0.5) * len) + side * (p0.y * abs(sz.y));',
    '#elif MODE == 2',
    '  wp = c + vec3(q.x, 0.0, -q.y); nrm = vec3(0.0, 1.0, 0.0);',
    '#elif MODE == 3',
    '  vec3 r2 = normalize(vec3(camR.x, 0.0, camR.z));',
    '  wp = c + r2 * q.x + vec3(0.0, q.y, 0.0); nrm = normalize(vec3(camB.x, 0.0, camB.z));',
    '#else',
    '  vec3 lp = position * iSize.xyz + uPivot * abs(iSize.xyz);',
    '  wp = c + qrot(iRot, lp);',
    '  nrm = normalize(qrot(iRot, normal * sign(iSize.xyz)));',
    '#endif',
    '  vUV = uv * iUV.zw + iUV.xy;',
    '  vec4 col = clamp(iCol, 0.0, 1.0);',   // vertex color của Unity là Color32
    '#ifdef HAS_MCOL', '  col *= mcol;', '#endif',
    '  vCol = vec4(s2l(col.rgb), col.a);',
    '  vC1 = iC1; vC2 = iC2; vC3 = iC3;',
    '  vNdV = dot(nrm, normalize(cameraPosition - wp));',
    '  vMir = iPos.w < 0.0 ? -1.0 : 1.0;',
    '  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);',
    '}'
  ].join('\n');

  // vệt (TrailRenderer, trail module kiểu Ribbon): đỉnh đã tính sẵn trong thế giới trên CPU.
  // Luồng đỉnh mặc định của vệt Unity chỉ có Position/Color/UV → TEXCOORD1..3 = 0.
  var VERT_RIBBON = [
    'attribute vec4 rcol;',
    'varying vec2 vUV; varying vec4 vCol; varying vec4 vC1; varying vec4 vC2; varying vec4 vC3; varying float vNdV; varying float vMir;',
    'vec3 s2l(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c)); }',
    'void main() {',
    '  vUV = uv; vec4 c = clamp(rcol, 0.0, 1.0); vCol = vec4(s2l(c.rgb), c.a);',
    '  vC1 = vec4(0.0); vC2 = vec4(0.0); vC3 = vec4(0.0); vNdV = 1.0; vMir = 1.0;',
    '  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);',
    '}'
  ].join('\n');

  var FRAG_HEAD = [
    'varying vec2 vUV; varying vec4 vCol; varying vec4 vC1; varying vec4 vC2; varying vec4 vC3; varying float vNdV; varying float vMir;',
    'uniform float uTime; uniform vec2 uScreen;',
    'uniform sampler2D tMain; uniform sampler2D tMask; uniform sampler2D tDis; uniform sampler2D tDef; uniform sampler2D tGrad2;',
    'uniform vec4 stMain; uniform vec4 stMask; uniform vec4 stDis; uniform vec4 stDef; uniform vec4 uSRGB;',
    'uniform vec4 uMainCol; uniform vec4 uEdgeCol; uniform vec4 uDirs; uniform vec2 uMainOff;',
    'uniform vec4 uA0; uniform vec4 uA1; uniform vec4 uA2; uniform vec4 uA3; uniform vec4 uA4; uniform vec4 uA5;',
    'vec4 dec(vec4 t, float s) { if (s > 0.5) t.rgb = mix(t.rgb / 12.92, pow((t.rgb + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), t.rgb)); return t; }',
    'vec2 rot(vec2 p, float a) { float s = sin(a), c = cos(a); return vec2(p.x * c + p.y * s, -p.x * s + p.y * c); }',
    'float sstep(float x) { x = clamp(x, 0.0, 1.0); return x * x * (3.0 - 2.0 * x); }',
    'vec2 pixel(vec2 uv, float px) { vec2 s = px / uScreen; return floor(uv / s) * s; }'
  ].join('\n');

  // VFX_Master_typeA — uA0 (isColor, mainA, radial, useTO) uA1 (mainRot, disRot, disG, disOff)
  // uA2 (disA, useDisP, disP, disSharp) uA3 (disPow, edge, edgeW, edgeS) uA4 (defOff, defStr, useDefStr, maskRot)
  // uA5 (fresThr, fresOff, fresRev, thr); uDirs = (disDir.xy, defDir.xy); uMainOff = _Main_Offset_UV1xy.xy
  var FRAG_A = [
    'void main() {',
    '  vec2 uv0 = vUV; vec2 cuv = uv0 - 0.5;',
    '  vec2 polar = vec2(length(cuv) * 2.0, atan(cuv.x, cuv.y) * 0.159236);',
    '  vec2 base = mix(uv0, polar, uA0.z);',
    '  vec2 tiling = mix(vC1.zw, vec2(1.0), uA0.w);',
    '  vec2 offs = mix(vC1.xy * (uMainOff * uTime + 1.0), uMainOff * uTime, uA0.w);',
    '  vec2 uv = base * tiling + offs;',
    '  vec2 q0 = pixel(uv0, PIXELATION);',
    '#ifdef DEFORM',
    '  float dtm = abs(uA4.x) >= 0.001 ? uA4.x * uTime : (uA4.x * uTime + 1.0) * vC2.y;',
    '  vec4 d = dec(texture2D(tDef, (q0 + dtm * uDirs.zw) * stDef.xy + stDef.zw), uSRGB.w);',
    '  d.x *= d.w;',
    '  float dstr = mix(vC2.x * (1.0 + uA4.y), uA4.y, uA4.z);',
    '  uv += dstr * (d.xy * 2.0 - 1.0);',
    '#endif',
    '  uv = pixel(uv, PIXELATION);',
    '  vec2 muv = rot(uv - 0.5, uA1.x) + 0.5;',
    '  vec4 t = dec(texture2D(tMain, muv * stMain.xy + stMain.zw), uSRGB.x);',
    '  vec3 col = mix(t.rrr, t.rgb, uA0.x) * vCol.rgb * max(vC2.z, 1.0) * uMainCol.rgb;',
    '#ifdef SECONDARY',
    '  vec4 g2 = texture2D(tGrad2, vec2(vC3.x, 0.5));',
    '  col = mix(col, g2.rgb, t.b * g2.a);',
    '#endif',
    '  float dof = abs(uA1.w) >= 0.001 ? uA1.w * uTime : (uA1.w * uTime + 1.0) * vC2.y;',
    '  vec2 duv = rot(uv + dof * uDirs.xy - 0.5, uA1.y) + 0.5;',
    '  vec4 dn = dec(texture2D(tDis, duv * stDis.xy + stDis.zw), uSRGB.z);',
    '  float n = mix(dn.r, dn.g, uA1.z);',
    '  float p = mix(vC2.w, uA2.z, uA2.y);',
    '  p = clamp(mix(p, vCol.a * 2.0 - 1.0, uA2.x), -1.0, 1.0);',
    '  float es = uA3.w - 0.5;',
    '  float e = sstep((1.0 - (n + p - uA3.z) - es) / max(1.0 - 2.0 * es, 1e-4));',
    '  col = mix(col, uEdgeCol.rgb, e * uA3.y);',
    '  float a = sstep((n + p - uA2.w * 0.5) / max(1.0 - uA2.w, 1e-4));',
    '  a = min(pow(max(a, 1e-6), uA3.x), 1.0);',
    '  float alpha = mix(vCol.a, 1.0, uA2.x) * t.a * a;',
    '#ifdef MASK',
    '  vec4 m = dec(texture2D(tMask, (rot(cuv, uA4.w) + 0.5) * stMask.xy + stMask.zw), uSRGB.y);',
    '  alpha *= m.a * m.r;',
    '#endif',
    '  float nd = min(abs(vNdV), 1.0); nd = mix(nd, 1.0 - nd, uA5.z);',
    '  float lo = (uA5.x + 1.0) * uA5.y - uA5.x;',
    '  alpha *= sstep((nd - lo) / max(uA5.y - lo, 1e-4));',
    '  alpha = clamp(alpha * uA0.y, 0.0, 1.0);',
    '#ifdef CLIP',
    '  if (alpha < uA5.w) discard;',
    '#endif',
    '#ifndef TRANSPARENT', '  alpha = 1.0;', '#endif',
    '  gl_FragColor = linearToOutputTexel(vec4(col, alpha));',
    '}'
  ].join('\n');

  // VFX_Master_typeB — uA0 (invB, thr, fresPow, fres)
  var FRAG_B = [
    'void main() {',
    '  vec4 t = dec(texture2D(tMain, pixel(vUV, PIXELATION) * stMain.xy + stMain.zw), uSRGB.x);',
    '  float s = clamp(vC1.y, 0.0, 1.0), p = clamp(vC1.x, 0.0, 1.0);',
    '  float lo = s * 0.5 - 1.0, hi = 1.0 - s * 0.5;',
    '  float pp = p * (hi - lo) + lo;',
    '  float x = sstep(((1.0 - t.g) + pp - s * 0.5) / max(1.0 - s, 1e-4));',
    '  float alpha = clamp(t.a - x, 0.0, 1.0) * vCol.a;',
    '  vec4 m = dec(texture2D(tMask, vUV * stMask.xy + stMask.zw), uSRGB.y);',
    '  alpha = clamp(alpha * m.a * m.r, 0.0, 1.0);',
    '  float bm = mix(t.b, 1.0 - t.b, clamp(uA0.x, 0.0, 1.0));',
    '  vec3 col = t.r * vCol.rgb;',
    '  float fr = pow(max(1.0 - clamp(vNdV, 0.0, 1.0), 1e-6), uA0.z) * uA0.w;',
    '  col = mix(col, col * max(vC1.w, 1.0), fr);',
    '  col = mix(col, vC2.rgb, bm * vC2.w);',
    '  col *= vC1.z;',
    '#ifdef CLIP',
    '  if (alpha < uA0.y) discard;',
    '#endif',
    '#ifndef TRANSPARENT', '  alpha = 1.0;', '#endif',
    '  gl_FragColor = linearToOutputTexel(vec4(col, alpha));',
    '}'
  ].join('\n');

  // VFX_Master_typeB_Xpan — uA0 (invB, disSharp, -, -); UV x cuộn theo C1.z, giãn theo C1.w; sáng = C1.y
  var FRAG_BX = [
    'void main() {',
    '  vec2 q = pixel(vUV, PIXELATION) + vec2(vC1.z, 0.0);',
    '  q *= vec2(vC1.w, 1.0);',
    '  vec4 t = dec(texture2D(tMain, q * stMain.xy + stMain.zw), uSRGB.x);',
    '  float s = clamp(uA0.y, 0.0, 1.0), p = clamp(vC1.x, 0.0, 1.0);',
    '  float lo = s * 0.5 - 1.0, hi = 1.0 - s * 0.5;',
    '  float pp = p * (hi - lo) + lo;',
    '  float x = sstep(((1.0 - t.g) + pp - s * 0.5) / max(1.0 - s, 1e-4));',
    '  float alpha = clamp(t.a - x, 0.0, 1.0) * vCol.a;',
    '  vec4 m = dec(texture2D(tMask, vUV * stMask.xy + stMask.zw), uSRGB.y);',
    '  alpha *= m.a * m.r;',
    '  float bm = mix(t.b, 1.0 - t.b, clamp(uA0.x, 0.0, 1.0));',
    '  vec3 col = mix(t.r * vCol.rgb, vC2.rgb, bm * vC2.w) * vC1.y;',
    '#ifdef CLIP',
    '  if (alpha < 0.5) discard;',
    '#endif',
    '#ifndef TRANSPARENT', '  alpha = 1.0;', '#endif',
    '  gl_FragColor = linearToOutputTexel(vec4(col, alpha));',
    '}'
  ].join('\n');

  // VFX_Master_typeA_Trail (gần đúng) — uA0 (isColor, emis, flow, thr)
  var FRAG_AT = [
    'void main() {',
    '  vec2 uv = vUV + vec2(fract(uTime * uA0.z), 0.0);',
    '  vec4 t = dec(texture2D(tMain, uv * stMain.xy + stMain.zw), uSRGB.x);',
    '  vec4 m = dec(texture2D(tMask, vUV * stMask.xy + stMask.zw), uSRGB.y);',
    '  vec3 col = mix(t.rrr, t.rgb, uA0.x) * vCol.rgb * max(uA0.y, 1.0) * uMainCol.rgb;',
    '  float alpha = clamp(t.a * vCol.a * m.a * m.r, 0.0, 1.0);',
    '#ifdef CLIP', '  if (alpha < uA0.w) discard;', '#endif',
    '#ifndef TRANSPARENT', '  alpha = 1.0;', '#endif',
    '  gl_FragColor = linearToOutputTexel(vec4(col, alpha));',
    '}'
  ].join('\n');

  // VFX_Master_typeB_forMesh trên MeshRenderer (xích 1001_02_SwordSkill_01_Chain), dịch từ DXBC [ĐO]:
  // tMask = _MaskTex_G_Dissolve_B_2ndColor_A_alpha (G nhiễu dissolve, B vùng màu phụ, A alpha), tMain = _MainTex (màu).
  // uA0 (_invertB, _Dissolve, _DissolveSharpness, _Emission); uMainCol = _TintColor; uEdgeCol = _2ndColor;
  // uA1 (_FresnelColor.rgb, _FresnelPower). Ngưỡng cắt 0.5 là hằng trong bytecode.
  var FRAG_BM = [
    'void main() {',
    '  vec4 m = dec(texture2D(tMask, vUV * stMask.xy + stMask.zw), uSRGB.y);',
    '  float s = clamp(uA0.z, 0.0, 1.0), p = clamp(uA0.y, 0.0, 1.0);',
    '  float n = p * (2.0 - s) + (0.5 * s - 1.0) + (1.0 - m.g);',
    '  float alpha = clamp(m.a - sstep((n - 0.5 * s) / max(1.0 - s, 1e-4)), 0.0, 1.0) * uMainCol.a;',
    '#ifdef CLIP', '  if (alpha < 0.5) discard;', '#endif',
    '  float bm = (clamp(uA0.x, 0.0, 1.0) * (1.0 - 2.0 * m.b) + m.b) * uEdgeCol.a;',
    '  vec4 t = dec(texture2D(tMain, vUV * stMain.xy + stMain.zw), uSRGB.x);',
    '  vec3 col = mix(t.rgb * uMainCol.rgb, uEdgeCol.rgb, bm);',
    '  col += pow(max(1.0 - clamp(vNdV, 0.0, 1.0), 1e-6), uA1.w) * uA1.rgb;',
    '  col *= uA0.w;',
    '#ifndef TRANSPARENT', '  alpha = 1.0;', '#endif',
    '  gl_FragColor = linearToOutputTexel(vec4(col, alpha));',
    '}'
  ].join('\n');

  // MeshRenderer tĩnh trong prefab VFX: mesh thường, ma trận node do CPU tính (Mesh.matrix).
  var VERT_MR = [
    '#ifdef HAS_MCOL', 'attribute vec4 mcol;', '#endif',
    'varying vec2 vUV; varying vec4 vCol; varying vec4 vC1; varying vec4 vC2; varying vec4 vC3; varying float vNdV; varying float vMir;',
    'void main() {',
    '  vec4 wp = modelMatrix * vec4(position, 1.0);',
    '  vUV = uv; vCol = vec4(1.0);',
    '#ifdef HAS_MCOL', '  vCol = mcol;', '#endif',
    '  vC1 = vec4(0.0); vC2 = vec4(0.0); vC3 = vec4(0.0); vMir = 1.0;',
    '  vNdV = dot(normalize(mat3(modelMatrix) * normal), normalize(cameraPosition - wp.xyz));',
    '  gl_Position = projectionMatrix * viewMatrix * wp;',
    '}'
  ].join('\n');

  // URP/Lit, URP/Unlit, Mobile/Particles, ... : ảnh × màu vật liệu × màu hạt
  var FRAG_U = [
    'void main() {',
    '  vec4 t = dec(texture2D(tMain, vUV * stMain.xy + stMain.zw), uSRGB.x);',
    '  vec4 c = t * uMainCol * vCol;',
    '#ifdef CLIP', '  if (c.a < uA0.w) discard;', '#endif',
    '#ifndef TRANSPARENT', '  c.a = 1.0;', '#endif',
    '  gl_FragColor = linearToOutputTexel(c);',
    '}'
  ].join('\n');

  var FRAGS = { A: FRAG_A, B: FRAG_B, BX: FRAG_BX, AT: FRAG_AT, U: FRAG_U, BM: FRAG_BM };
  function fragSrc(body) {
    return FRAG_HEAD + '\n' + body.replace('void main() {',
      'void main() {\n#ifdef CULLSIGN\n  if ((gl_FrontFacing ? 1.0 : -1.0) * vMir * CULLSIGN < 0.0) discard;\n#endif');
  }

  var BLEND = null;
  function blendFactor(i) {
    if (!BLEND) {
      BLEND = [THREE.ZeroFactor, THREE.OneFactor, THREE.DstColorFactor, THREE.SrcColorFactor,
        THREE.OneMinusDstColorFactor, THREE.SrcAlphaFactor, THREE.OneMinusSrcColorFactor, THREE.DstAlphaFactor,
        THREE.OneMinusDstAlphaFactor, THREE.SrcAlphaSaturateFactor, THREE.OneMinusSrcAlphaFactor];
    }
    return BLEND[i] !== undefined ? BLEND[i] : THREE.OneFactor;
  }

  // --------------------------------------------------------------- nạp --
  var index = null, indexP = null;
  var allMats = [];
  var texCache = {}, meshCache = {}, meshP = {}, fxCache = {}, fxP = {};
  var shared = { uTime: { value: 0 }, uScreen: { value: new THREE.Vector2(1920, 1080) } };
  var whiteTex = null, blackTex = null;

  function fetchJSON(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('vfx: tải ' + url + ' lỗi ' + r.status);
      return r.json();
    });
  }
  function loadIndex() {
    if (!indexP) indexP = fetchJSON(V.base + 'index.json').then(function (j) {
      index = j;
      index.leaf = {};
      Object.keys(j.alias || {}).forEach(function (k) { index.leaf[leafName(k)] = j.alias[k]; });
      return j;
    });
    return indexP;
  }
  function leafName(name) { var s = String(name).replace(/\\/g, '/'); return s.slice(s.lastIndexOf('/') + 1); }
  // tên tham chiếu → danh sách tên prefab (1, hoặc biến thể theo nguyên tố)
  function resolveName(name, element) {
    var a = index.alias[name];
    var leaf = leafName(name);
    if (a === undefined) a = index.leaf[leaf];
    if (typeof a === 'string') return a;
    if (Array.isArray(a)) {
      var want = leaf + '_' + (element || 'None');
      return a.indexOf(want) >= 0 ? want : a[0];
    }
    if (index.fx[leaf]) return leaf;
    if (index.fx[name]) return name;
    return null;
  }
  function makeSolidTex(r, g, b, a) {
    var t = new THREE.DataTexture(new Uint8Array([r, g, b, a]), 1, 1, THREE.RGBAFormat);
    t.needsUpdate = true;
    return t;
  }
  function getTex(name) {
    if (texCache[name]) return texCache[name];
    var info = (index.tex && index.tex[name]) || {};
    var t;
    var p = new Promise(function (res) {
      t = new THREE.TextureLoader().load(V.base + 'tex/' + name + '.webp', res, undefined, function () {
        console.error('vfx: tải ảnh lỗi ' + name);
        res();
      });
    });
    t.userData.p = p;
    var wrap = [THREE.RepeatWrapping, THREE.ClampToEdgeWrapping, THREE.MirroredRepeatWrapping, THREE.MirroredRepeatWrapping];
    t.wrapS = wrap[info.wrapU || 0]; t.wrapT = wrap[info.wrapV || 0];
    if (info.filter === 0) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapNearestFilter; }
    else { t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; }
    t.encoding = THREE.LinearEncoding;   // giải sRGB trong shader theo cờ (như Unity linear)
    t.flipY = true;
    t.userData.srgb = info.srgb === undefined ? 1 : info.srgb;
    texCache[name] = t;
    return t;
  }
  function loadMesh(name) {
    if (meshP[name]) return meshP[name];
    meshP[name] = fetchJSON(V.base + 'mesh/' + name + '.json').then(function (m) {
      var g = new THREE.InstancedBufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(m.pos, 3));
      var n = m.pos.length / 3;
      g.setAttribute('uv', new THREE.Float32BufferAttribute(m.uv || new Array(n * 2).fill(0), 2));
      if (m.col) g.setAttribute('mcol', new THREE.Float32BufferAttribute(m.col, 4));
      g.setIndex(m.idx);
      g.computeVertexNormals();
      meshCache[name] = g;
      return g;
    });
    return meshP[name];
  }
  function quadGeom() {
    var g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    return g;
  }
  function unityQuad() {
    // Quad dựng sẵn của Unity (1×1, mặt nhìn -Z Unity = +Z three)
    return quadGeom();
  }

  V.load = function (name, element) {
    return loadIndex().then(function () {
      var real = resolveName(name, element);
      if (!real) throw new Error('vfx: không có prefab "' + name + '"');
      return loadFx(real);
    });
  };
  V.loadAll = function (names) { return Promise.all(names.map(function (n) { return V.load(n); })); };
  // Nạp trước (JSON + mesh + ảnh + dựng vật liệu) để lần phát đầu không khựng. Tên thiếu bị bỏ qua; tên "…_Hit" nạp
  // mọi biến thể nguyên tố. Trả Promise số prefab đã nạp.
  V.preload = function (names) {
    return loadIndex().then(function () {
      var reals = {};
      (names || []).forEach(function (n) {
        if (!n || n === 'None') return;
        var a = index.alias[n];
        if (a === undefined) a = index.leaf[leafName(n)];
        if (Array.isArray(a)) a.forEach(function (x) { reals[x] = 1; });
        else { var r = resolveName(n); if (r) reals[r] = 1; }
      });
      var ks = Object.keys(reals).filter(function (k) { return index.fx[k]; });
      return Promise.all(ks.map(function (k) { return loadFx(k).then(queueWarm).catch(function () { return null; }); })).then(function () { return ks.length; });
    });
  };
  // Nạp trước cũng "vẽ khống" mẫu một khung (batch hiện với 0 bản, mesh drawRange 0): three biên dịch chương trình và
  // tải ảnh lên GPU ngay trong đường vẽ thật (đúng render target của hậu kỳ). renderer.compile() không dùng được:
  // khoá chương trình khác (outputEncoding của render target). Đo: lần phát đầu mất 100–180 ms một khung nếu thiếu bước này.
  var warmQ = [], warmTmp = [];
  function queueWarm(tp) { if (tp && !tp.warmed) { tp.warmed = true; warmQ.push(tp); } }
  function runWarm() {
    for (var i = 0; i < warmTmp.length; i++) if (warmTmp[i].parent) warmTmp[i].parent.remove(warmTmp[i]);
    warmTmp.length = 0;
    if (!group) return;
    while (warmQ.length) {
      var tp = warmQ.pop();
      tp.systems.forEach(function (st) {
        if (st.visible) getBatch(st).warm = true;
        if (st.ribbon) getRibbon(st.ribbon, st.ribbon.rmat, st.ribbon.order).warm = true;
      });
      tp.trails.forEach(function (tr) { if (tr.visible) getRibbon(tr, tr.rmat, tr.order).warm = true; });   // vệt: shader đỉnh riêng
      tp.meshes.forEach(function (m) {
        var g = new THREE.BufferGeometry();
        ['position', 'uv', 'normal', 'mcol'].forEach(function (k) { var a = m.geo.getAttribute(k); if (a) g.setAttribute(k, a); });
        g.setIndex(m.geo.index); g.setDrawRange(0, 0);
        var o = new THREE.Mesh(g, m.mat);
        o.frustumCulled = false; group.add(o); warmTmp.push(o);
      });
    }
  }
  V.isLoaded = function (name, element) { var r = index ? resolveName(name, element) : null; return !!(r && fxCache[r]); };

  function loadFx(real) {
    if (fxP[real]) return fxP[real];
    var info = index.fx[real];
    fxP[real] = fetchJSON(V.base + info.file).then(function (doc) {
      var meshes = [];
      doc.systems.forEach(function (s) { if (s.r && s.r.mode === 4 && s.r.mesh && s.r.mesh !== 'quad') meshes.push(loadMesh(s.r.mesh)); });
      (doc.meshes || []).forEach(function (m) { if (m.mesh) meshes.push(loadMesh(m.mesh)); });
      return Promise.all(meshes).then(function () {
        var tp = buildTemplate(doc);
        var waits = [];
        allMats.forEach(function (m) {
          ['tMain', 'tMask', 'tDis', 'tDef'].forEach(function (k) { var t = m.uniforms[k].value; if (t && t.userData.p) waits.push(t.userData.p); });
        });
        return Promise.all(waits).then(function () { fxCache[real] = tp; return tp; });
      });
    });
    return fxP[real];
  }

  // ------------------------------------------------------------ template --
  function buildTemplate(doc) {
    var tp = { name: doc.name, nodes: doc.nodes, systems: [], lights: doc.lights || [], trails: doc.trails || [], len: doc.len || 0 };
    // node bị tắt: tắt luôn cả con
    var off = new Uint8Array(doc.nodes.length);
    doc.nodes.forEach(function (n, i) { off[i] = (n.off || (n.p >= 0 && off[n.p])) ? 1 : 0; });
    tp.nodeOff = off;
    // ma trận local của node
    tp.local = doc.nodes.map(function (n) {
      var m = new THREE.Matrix4();
      // gốc prefab: Instantiate(prefab, pos, rot) thay vị trí/hướng của gốc, chỉ giữ scale
      // (vd 1001_01_SwordAttack_Hit_Fire có gốc lệch (0.13, 0, 1.31) trong prefab)
      var root = n.p < 0;
      var p = (!root && n.pos) || [0, 0, 0], r = (!root && n.rot) || [0, 0, 0, 1], s = n.scl || [1, 1, 1];
      m.compose(new THREE.Vector3(p[0], p[1], p[2]), new THREE.Quaternion(r[0], r[1], r[2], r[3]), new THREE.Vector3(s[0], s[1], s[2]));
      return m;
    });
    doc.systems.forEach(function (s, si) {
      var st = buildSystem(s, doc, tp);
      st.index = si;
      tp.systems.push(st);
    });
    tp.anims = doc.anims || [];
    tp.anims.forEach(function (a) {
      a.clips.forEach(function (c) {
        c.tracks.forEach(function (tr) {
          if (tr.p.charAt(0) === 'c' && tr.p.charAt(1) === 'd') { tr.k = +tr.p.charAt(2); tr.q = +tr.p.charAt(4); }
        });
      });
      a.endState = -1;
      a.states.forEach(function (sd, i) { if (/^end$/i.test(sd.name)) a.endState = i; });
    });
    // TrailRenderer
    tp.trails.forEach(function (tr) {
      tr.W = mmc({ m: tr.width === undefined ? 1 : tr.width, k: tr.widthCurve && tr.widthCurve.length ? tr.widthCurve : [0, 1, 0, 0] });
      tr.G = tr.grad ? mmg({ g: tr.grad }) : mmg([1, 1, 1, 1]);
      tr.life = tr.time || 0.5;
      tr.visible = !!(tr.mat && tr.mat.sh !== 'skip');
      if (tr.visible) {
        var o = makeMat(tr.mat, { mode: 0 }, [0, 0, 0], null, true);
        tr.rmat = o.sm; tr.order = o.order;
      }
    });
    tp.lights.forEach(function (l) { l.linColor = new THREE.Color(s2l(l.color[0]), s2l(l.color[1]), s2l(l.color[2])); });
    // MeshRenderer tĩnh (fx_export: doc.meshes) và script điều khiển node (doc.script, vd ChainSkillVfx)
    tp.meshes = (doc.meshes || []).filter(function (m) { return m.mesh && meshCache[m.mesh] && m.mat && m.mat.sh !== 'skip'; }).map(function (m) {
      var o = makeMat(m.mat, { mode: 4 }, [0, 0, 0], null, false, m.mesh);
      return { node: m.node, mat: o.sm, geo: o.geo, order: o.order };
    });
    tp.script = doc.script || null;
    return tp;
  }

  var SRC_ID = { '0': 0, c1x: 1, c1y: 2, c1z: 3, c1w: 4, c2x: 5, c2y: 6, c2z: 7, c2w: 8, age: 9, invlife: 10, speed: 11,
    sr0: 12, sr1: 13, sr2: 14, sr3: 15, vr0: 16, vr1: 17, vr2: 18, vr3: 19, sx: 20, sy: 21, sz: 22, rot: 23,
    cx: 24, cy: 25, cz: 26, vx: 27, vy: 28, vz: 29, frame: 30, rotspd: 31, rx: 32, ry: 33 };

  function buildSystem(s, doc, tp) {
    var r = s.r || { mode: 5 };
    var st = {
      name: s.name, node: s.node, src: s,
      dur: s.dur || 1, loop: !!s.loop, prewarm: !!s.prewarm, delay: mmc(s.delay), simSpeed: s.simSpeed || 1,
      world: s.space === 1, scaling: s.scaling === undefined ? 1 : s.scaling, maxP: s.max === undefined ? 1000 : s.max,
      life: mmc(s.life, 5), speed: mmc(s.speed, 5), grav: mmc(s.grav),
      size3: !!s.size3, rot3: !!s.rot3, flipRot: s.flipRot || 0,
      color: mmg(s.color || [1, 1, 1, 1]), col: s.col ? mmg(s.col) : null,
      mode: r.mode, render: r,
    };
    if (s.size3) { st.sizeX = mmc(s.size3[0]); st.sizeY = mmc(s.size3[1]); st.sizeZ = mmc(s.size3[2]); }
    else { st.sizeX = mmc(s.size === undefined ? 1 : s.size); }
    if (s.rot3) { st.rotX = mmc(s.rot3[0]); st.rotY = mmc(s.rot3[1]); st.rotZ = mmc(s.rot3[2]); }
    else { st.rotZ = mmc(s.rot || 0); }
    var e = s.emit;
    st.emitOff = !!(e && e.off) || !e;
    st.rate = e ? mmc(e.rate) : mmc(0);
    st.rateDist = e ? mmc(e.rateDist) : mmc(0);
    st.bursts = e && e.bursts ? e.bursts.map(function (b) { return { time: b[0], count: mmc(b[1]), cycles: b[2], interval: b[3], prob: b[4] === undefined ? 1 : b[4] }; }) : [];
    st.shape = s.shape || null;
    if (st.shape) {
      var sh = st.shape;
      sh.q = new THREE.Quaternion().fromArray(sh.quat || [0, 0, 0, 1]);
      sh.p = sh.pos || [0, 0, 0]; sh.s = sh.scale || [1, 1, 1];
      sh.t = sh.type === undefined ? 4 : sh.type;
      sh.R = sh.radius === undefined ? 1 : sh.radius;
      sh.th = sh.radiusThick === undefined ? 1 : sh.radiusThick;
      sh.A = (sh.angle === undefined ? 25 : sh.angle) * Math.PI / 180;
      sh.arcR = (sh.arc === undefined ? 360 : sh.arc) * Math.PI / 180;
      sh.len = sh.length === undefined ? 5 : sh.length;
      sh.arcSpd = mmc(sh.arcSpeed === undefined ? 1 : sh.arcSpeed);
      if (sh.meshApprox) note('shape mesh → hộp');
    }
    if (s.vel) {
      var v = s.vel;
      st.vel = { x: mmc(v.x), y: mmc(v.y), z: mmc(v.z), ox: mmc(v.ox), oy: mmc(v.oy), oz: mmc(v.oz),
        offx: mmc(v.offx), offy: mmc(v.offy), offz: mmc(v.offz), radial: mmc(v.radial), speedMod: mmc(v.speedMod === undefined ? 1 : v.speedMod), world: !!v.world };
      st.vel.orbit = !(isZero(st.vel.ox) && isZero(st.vel.oy) && isZero(st.vel.oz));
      st.vel.lin = !(isZero(st.vel.x) && isZero(st.vel.y) && isZero(st.vel.z));
    }
    if (s.limit) {
      var l = s.limit;
      st.limit = { sep: !!l.sep, damp: l.damp === undefined ? 1 : l.damp, drag: mmc(l.drag), dragSize: l.dragSize !== 0, dragVel: l.dragVel !== 0,
        mag: mmc(l.mag === undefined ? 1 : l.mag), x: mmc(l.x === undefined ? 1 : l.x), y: mmc(l.y === undefined ? 1 : l.y), z: mmc(l.z === undefined ? 1 : l.z) };
    }
    if (s.force) st.force = { x: mmc(s.force.x), y: mmc(s.force.y), z: mmc(s.force.z), world: !!s.force.world };
    if (s.sizeLife) st.sizeLife = { x: mmc(s.sizeLife.x), y: s.sizeLife.y !== undefined ? mmc(s.sizeLife.y) : null, z: s.sizeLife.z !== undefined ? mmc(s.sizeLife.z) : null };
    if (s.rotLife) st.rotLife = { x: s.rotLife.x !== undefined ? mmc(s.rotLife.x) : null, y: s.rotLife.y !== undefined ? mmc(s.rotLife.y) : null, z: mmc(s.rotLife.z || 0) };
    if (s.uv) {
      var u = s.uv;
      st.uv = { tx: u.tx || 1, ty: u.ty || 1, anim: u.anim || 0, time: u.time || 0, fps: u.fps || 30, fot: mmc(u.fot === undefined ? 0 : u.fot),
        start: mmc(u.start || 0), cycles: u.cycles === undefined ? 1 : u.cycles, row: u.row || 0, rowMode: u.rowMode === undefined ? 1 : u.rowMode,
        flipU: u.flipU || 0, flipV: u.flipV || 0 };
      st.uv.frames = st.uv.anim === 1 ? st.uv.tx : st.uv.tx * st.uv.ty;
    }
    st.cd = [null, null];
    if (s.cd) {
      for (var k = 0; k < 2; k++) {
        var c = s.cd[k];
        if (!c) continue;
        if (c.v) st.cd[k] = { v: c.v.map(function (x) { return mmc(x); }) };
        else st.cd[k] = { c: mmg(c.c) };
      }
    }
    // slots TEXCOORD1..3 → mã nguồn
    st.slots = new Int8Array(12);
    (r.slots || []).forEach(function (nm, i) { if (i < 12) st.slots[i] = SRC_ID[nm] !== undefined ? SRC_ID[nm] : 0; });
    st.needC = [false, false];
    for (var i2 = 0; i2 < 12; i2++) {
      var sid = st.slots[i2];
      if (sid >= 1 && sid <= 4) st.needC[0] = true;
      if (sid >= 5 && sid <= 8) st.needC[1] = true;
    }
    st.grad2 = s.grad2 || null;
    st.lightsMod = s.lightsMod || null;
    if (s.trail && (s.trail.mode === 1) && r.trailMat && r.trailMat.sh !== 'skip') {
      var tm = s.trail;
      st.ribbon = { W: mmc(tm.width === undefined ? 1 : tm.width), CT: mmg(tm.colTrail || [1, 1, 1, 1]), CL: mmg(tm.colLife || [1, 1, 1, 1]),
        sizeW: tm.sizeW !== 0, inherit: tm.inheritCol !== 0, texMode: tm.texMode || 0 };
      var ro = makeMat(r.trailMat, r, [0, 0, 0], null, true);
      st.ribbon.rmat = ro.sm; st.ribbon.order = ro.order;
    } else if (s.trail) note('trail module kiểu PerParticle — chưa vẽ');
    if (s.sub) note('sub emitter — chưa phát');
    (s.skipped || []).forEach(function (m) { note(m); });
    // renderer
    st.flip = r.flip || [0, 0, 0];
    st.pivot = r.pivot || [0, 0, 0];
    st.sort = r.sort || 0;
    st.visible = r.mode !== 5 && !!r.mat && r.mat.sh !== 'skip';
    if (r.mat && r.mat.sh === 'skip') note('shader ' + r.mat.shader + ' — bỏ qua');
    st.align = r.align || 0;
    if (st.visible) buildRender(st, r);
    return st;
  }
  function note(k) { V.unsupported[k] = (V.unsupported[k] || 0) + 1; }

  function texUni(slot, mat, fallback) {
    var e = mat.tex && mat.tex[slot];
    if (!e) return { t: fallback, st: new THREE.Vector4(1, 1, 0, 0), srgb: 0 };
    var tx = getTex(e.t);
    var s = e.st || [1, 1, 0, 0];
    return { t: tx, st: new THREE.Vector4(s[0], s[1], s[2], s[3]), srgb: tx.userData.srgb };
  }

  function buildRender(st, r) {
    var o = makeMat(r.mat, r, st.pivot, st.grad2, false);
    st.mat = o.sm;
    st.baseGeo = o.geo;
    st.renderOrder = o.order;
  }
  // mat: vật liệu JSON; r: renderer JSON (mode, vs, ls, ...); ribbon: dùng shader đỉnh của vệt; meshR: MeshRenderer tĩnh
  function makeMat(mat, r, pivot, grad2, ribbon, meshR) {
    if (!whiteTex) { whiteTex = makeSolidTex(255, 255, 255, 255); blackTex = makeSolidTex(0, 0, 0, 0); }
    var kind = mat.sh in FRAGS ? mat.sh : 'U';
    if (meshR && mat.shader === 'ArtTeam/VFX/VFX_Master_typeB_forMesh') kind = 'BM';
    var f = mat.f || {}, c = mat.c || {};
    var defines = { MODE: r.mode === 4 ? 4 : r.mode, PIXELATION: (f.px === undefined ? 1 : f.px).toFixed(4) };
    if (r.mode === 0 && (r.align === 1 || r.align === 2)) defines.ALIGNQ = 1;
    if (mat.surf) defines.TRANSPARENT = 1;
    if (mat.clip) defines.CLIP = 1;
    var kw = mat.kw || [];
    if (kind === 'A') {
      if (kw.indexOf('_DEFORM_USE') >= 0 && mat.tex && mat.tex.def) defines.DEFORM = 1;
      if (kw.indexOf('_MASK_USE') >= 0) defines.MASK = 1;
      if (kw.indexOf('_USE_SECONDARYCOLOR') >= 0) defines.SECONDARY = 1;
    }
    var tm = texUni('main', mat, whiteTex), tk = texUni('mask', mat, whiteTex), td = texUni('dis', mat, whiteTex), tf = texUni('def', mat, whiteTex);
    var lin = function (a, dflt) { a = a || dflt; return new THREE.Vector4(s2l(a[0]), s2l(a[1]), s2l(a[2]), a[3]); };
    // Màu cờ [HDR] (m_Flags 16 trong shader: typeA _DissolveEdge_Color; forMesh _TintColor/_2ndColor/_FresnelColor)
    // là giá trị tuyến tính, không đổi sRGB. [SUY LUẬN] thanh Intensity của bảng màu HDR "mỗi nấc gấp đôi ánh sáng" chỉ
    // đúng khi số lưu tỉ lệ thẳng với ánh sáng; ảnh gốc ss03 (thanh tẩy) chỉ có đốm trắng nhỏ, còn đổi sRGB thì viền 32
    // thành 3617 và bloom ra đĩa trắng 1 m.
    var hdr = function (a, dflt) { a = a || dflt; return new THREE.Vector4(a[0], a[1], a[2], a[3]); };
    var D2R = 0.017444;   // hằng trong shader gốc
    var u = {
      uTime: shared.uTime, uScreen: shared.uScreen,
      tMain: { value: tm.t }, tMask: { value: tk.t }, tDis: { value: td.t }, tDef: { value: tf.t }, tGrad2: { value: whiteTex },
      stMain: { value: tm.st }, stMask: { value: tk.st }, stDis: { value: td.st }, stDef: { value: tf.st },
      uSRGB: { value: new THREE.Vector4(tm.srgb, tk.srgb, td.srgb, tf.srgb) },
      uMainCol: { value: lin(c.mainCol, [1, 1, 1, 1]) }, uEdgeCol: { value: hdr(c.edgeCol, [0, 0, 0, 0]) },
      uDirs: { value: new THREE.Vector4((c.disDir || [0, 0])[0], (c.disDir || [0, 0])[1], (c.defDir || [0, 0])[0], (c.defDir || [0, 0])[1]) },
      uMainOff: { value: new THREE.Vector2((c.mainOff || [0, 0])[0], (c.mainOff || [0, 0])[1]) },
      uA0: { value: new THREE.Vector4() }, uA1: { value: new THREE.Vector4() }, uA2: { value: new THREE.Vector4() },
      uA3: { value: new THREE.Vector4() }, uA4: { value: new THREE.Vector4() }, uA5: { value: new THREE.Vector4() },
      uPivot: { value: new THREE.Vector3(pivot[0], pivot[1], pivot[2]) },
      uStretch: { value: new THREE.Vector4(r.vs || 0, r.ls === undefined ? 2 : r.ls, r.cvs || 0, 0) },
      uSzClamp: { value: new THREE.Vector2(r.minSz || 0, r.maxSz === undefined ? 0.5 : r.maxSz) },
    };
    function F(k, d) { return f[k] === undefined ? d : f[k]; }
    if (kind === 'A') {
      u.uA0.value.set(F('isColor', 1), F('mainA', 1), F('radial', 0), F('useTO', 0));
      u.uA1.value.set(F('mainRot', 0) * D2R, F('disRot', 0) * D2R, F('disG', 0), F('disOff', 0));
      u.uA2.value.set(F('disA', 0), F('useDisP', 0), F('disP', 1), F('disSharp', 0));
      u.uA3.value.set(F('disPow', 1), F('edge', 0), F('edgeW', 0), F('edgeS', 0));
      u.uA4.value.set(F('defOff', 0), F('defStr', 0), F('useDefStr', 0), F('maskRot', 0) * D2R);
      u.uA5.value.set(F('fresThr', 1), F('fresOff', 0), F('fresRev', 0), F('thr', 0.5));
      if (defines.SECONDARY) u.tGrad2.value = grad2 ? gradTex(grad2) : whiteTex;
    } else if (kind === 'BM') {
      var tg = texUni('gb', mat, whiteTex);
      u.tMask.value = tg.t; u.stMask.value = tg.st; u.uSRGB.value.y = tg.srgb;
      u.uA0.value.set(F('invB', 0), F('dis', 0), F('disSharp', 0.5), F('emis', 1));
      u.uMainCol.value = hdr(c.mainCol, [1, 1, 1, 1]);
      u.uEdgeCol.value = hdr(c.col2, [0, 0, 0, 0]);
      var fc = hdr(c.fresCol, [0, 0, 0, 0]);
      u.uA1.value.set(fc.x, fc.y, fc.z, F('fresPow', 1));
    } else if (kind === 'B') {
      u.uA0.value.set(F('invB', 0), F('thr', 0.5), F('fresPow', 2), F('fres', 0));
    } else if (kind === 'BX') {
      u.uA0.value.set(F('invB', 0), F('disSharp', 1), 0, 0);
    } else if (kind === 'AT') {
      u.uA0.value.set(F('isColor', 1), F('emis', 1), F('flow', 0), F('thr', 0.5));
    } else {
      u.uA0.value.set(0, 0, 0, F('thr', 0.5));
    }
    var geo = null;
    if (ribbon) {
      geo = null;
    } else if (meshR) {
      var src = meshCache[meshR];
      geo = new THREE.BufferGeometry();
      ['position', 'uv', 'normal', 'mcol'].forEach(function (k) { var a = src && src.getAttribute(k); if (a) geo.setAttribute(k, a); });
      if (src) geo.setIndex(src.index);
      if (src && src.getAttribute('mcol')) defines.HAS_MCOL = 1;
    } else if (r.mode === 4) {
      var mg = r.mesh && r.mesh !== 'quad' ? meshCache[r.mesh] : null;
      geo = mg ? cloneBase(mg) : unityQuad();
      if (mg && mg.getAttribute('mcol')) defines.HAS_MCOL = 1;
    } else {
      geo = quadGeom();
    }
    // Cull của vật liệu làm trong fragment theo dấu gương của bản phát (vMir): hiệu ứng lật X (InheritOwnerScaleX)
    // đảo chiều tam giác, cull cứng của GL sẽ bỏ mất mặt trước.
    // (MeshRenderer: three tự đảo mặt trước khi ma trận có định thức âm, để GL cull.)
    var glCull = ribbon || meshR;
    if (!glCull && (mat.cull === 2 || mat.cull === 1)) defines.CULLSIGN = mat.cull === 2 ? '1.0' : '-1.0';
    var sm = new THREE.ShaderMaterial({
      uniforms: u, vertexShader: ribbon ? VERT_RIBBON : meshR ? VERT_MR : VERT, fragmentShader: fragSrc(FRAGS[kind]), defines: defines,
      transparent: !!mat.surf, depthWrite: !mat.surf, depthTest: mat.zt !== 8,
      side: glCull ? (mat.cull === 2 ? THREE.FrontSide : (mat.cull === 1 ? THREE.BackSide : THREE.DoubleSide)) : THREE.DoubleSide,
    });
    if (mat.surf) {
      sm.blending = THREE.CustomBlending;
      sm.blendSrc = blendFactor(mat.blend[0]); sm.blendDst = blendFactor(mat.blend[1]);
      sm.blendSrcAlpha = THREE.OneFactor; sm.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
      sm.blendEquation = THREE.AddEquation;
    } else {
      sm.blending = THREE.NoBlending;
    }
    allMats.push(sm);
    return { sm: sm, geo: geo, order: (r.order || 0) * 1000 - Math.round(r.fudge || 0) + (mat.queue || 0) };
  }
  function cloneBase(g) {
    var n = new THREE.InstancedBufferGeometry();
    ['position', 'uv', 'normal', 'mcol'].forEach(function (k) { var a = g.getAttribute(k); if (a) n.setAttribute(k, a); });
    n.setIndex(g.index);
    return n;
  }
  var gradTexCache = new WeakMap();
  function gradTex(g) {
    if (gradTexCache.has(g)) return gradTexCache.get(g);
    var L = bakeGrad(g, true), W = 64, data = new Uint8Array(W * 4);
    for (var i = 0; i < W; i++) {
      tmpG[0] = 0; lutG(L, i / (W - 1), tmpG, 0);
      for (var ch = 0; ch < 4; ch++) data[i * 4 + ch] = Math.max(0, Math.min(255, Math.round(tmpG[ch] * 255)));
    }
    var t = new THREE.DataTexture(data, W, 1, THREE.RGBAFormat);
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
    gradTexCache.set(g, t);
    return t;
  }

  // ------------------------------------------------------ render batches --
  // Một batch cho mỗi mẫu hệ hạt có vẽ: buffer instanced tăng dần.
  var ATTR = [['iPos', 4], ['iSize', 4], ['iRot', 4], ['iCol', 4], ['iUV', 4], ['iVel', 4], ['iC1', 4], ['iC2', 4], ['iC3', 4]];
  var group = null, batches = [];
  function getBatch(st) {
    if (st.batch) return st.batch;
    var b = { st: st, cap: 0, n: 0, geo: st.baseGeo, arrs: {}, attrs: {}, mesh: null, perm: null, keys: null };
    growBatch(b, 64);
    b.mesh = new THREE.Mesh(b.geo, st.mat);
    b.mesh.frustumCulled = false;
    b.mesh.renderOrder = st.renderOrder;
    b.mesh.visible = false;
    b.mesh.name = 'vfx:' + st.name;
    st.batch = b;
    batches.push(b);
    if (group) group.add(b.mesh);
    return b;
  }
  function growBatch(b, need) {
    var cap = Math.max(64, b.cap);
    while (cap < need) cap *= 2;
    if (cap === b.cap) return;
    ATTR.forEach(function (a) {
      var arr = new Float32Array(cap * a[1]);
      if (b.arrs[a[0]]) arr.set(b.arrs[a[0]]);
      var at = new THREE.InstancedBufferAttribute(arr, a[1]);
      at.setUsage(THREE.DynamicDrawUsage);
      b.arrs[a[0]] = arr; b.attrs[a[0]] = at;
      b.geo.setAttribute(a[0], at);
    });
    b.keys = new Float32Array(cap); b.perm = new Int32Array(cap); b.tmp = new Float32Array(cap * 4);
    b.cap = cap;
  }

  // --------------------------------------------------------------- vệt --
  var ribbons = [];
  function getRibbon(owner, mat, order) {
    if (owner.rb) return owner.rb;
    var cap = 256;
    var rb = { cap: 0, nv: 0, ni: 0, geo: new THREE.BufferGeometry(), mesh: null };
    growRibbon(rb, cap);
    rb.mesh = new THREE.Mesh(rb.geo, mat);
    rb.mesh.frustumCulled = false;
    rb.mesh.renderOrder = order;
    rb.mesh.visible = false;
    owner.rb = rb;
    ribbons.push(rb);
    if (group) group.add(rb.mesh);
    return rb;
  }
  function growRibbon(rb, needV) {
    if (needV <= rb.cap) return;
    var cap = Math.max(256, rb.cap);
    while (cap < needV) cap *= 2;
    function mk(name, size, Arr, old) {
      var a = new Arr(cap * size);
      if (old) a.set(old.array);
      var at = new THREE.BufferAttribute(a, size);
      at.setUsage(THREE.DynamicDrawUsage);
      return at;
    }
    rb.pos = mk('position', 3, Float32Array, rb.pos); rb.geo.setAttribute('position', rb.pos);
    rb.uv = mk('uv', 2, Float32Array, rb.uv); rb.geo.setAttribute('uv', rb.uv);
    rb.col = mk('rcol', 4, Float32Array, rb.col); rb.geo.setAttribute('rcol', rb.col);
    var ia = new THREE.BufferAttribute(new Uint32Array(cap * 3), 1);
    if (rb.idx) ia.array.set(rb.idx.array.subarray(0, Math.min(rb.idx.array.length, ia.array.length)));
    ia.setUsage(THREE.DynamicDrawUsage);
    rb.idx = ia; rb.geo.setIndex(ia);
    rb.cap = cap;
  }
  // P: điểm tạm [x,y,z,width,r,g,b,a,u] × k, đầu vệt trước
  var RP = new Float32Array(9 * 1024);
  function emitRibbon(rb, k) {
    if (k < 2) return;
    growRibbon(rb, rb.nv + k * 2);
    var P = RP, pos = rb.pos.array, uv = rb.uv.array, col = rb.col.array, idx = rb.idx.array;
    var v0 = rb.nv;
    for (var i = 0; i < k; i++) {
      var a = Math.max(0, i - 1) * 9, b = Math.min(k - 1, i + 1) * 9, o = i * 9;
      var tx = P[b] - P[a], ty = P[b + 1] - P[a + 1], tz = P[b + 2] - P[a + 2];
      var cx = _camPos.x - P[o], cy = _camPos.y - P[o + 1], cz = _camPos.z - P[o + 2];
      var sx = ty * cz - tz * cy, sy = tz * cx - tx * cz, sz = tx * cy - ty * cx;
      var sl = Math.sqrt(sx * sx + sy * sy + sz * sz);
      var hw = P[o + 3] * 0.5 / (sl > 1e-8 ? sl : 1);
      if (sl <= 1e-8) { sx = 0; sy = 1; sz = 0; hw = P[o + 3] * 0.5; }
      var vi = (rb.nv + i * 2);
      pos[vi * 3] = P[o] + sx * hw; pos[vi * 3 + 1] = P[o + 1] + sy * hw; pos[vi * 3 + 2] = P[o + 2] + sz * hw;
      pos[vi * 3 + 3] = P[o] - sx * hw; pos[vi * 3 + 4] = P[o + 1] - sy * hw; pos[vi * 3 + 5] = P[o + 2] - sz * hw;
      uv[vi * 2] = P[o + 8]; uv[vi * 2 + 1] = 1; uv[vi * 2 + 2] = P[o + 8]; uv[vi * 2 + 3] = 0;
      for (var c = 0; c < 4; c++) { col[vi * 4 + c] = P[o + 4 + c]; col[vi * 4 + 4 + c] = P[o + 4 + c]; }
    }
    for (i = 0; i < k - 1; i++) {
      var q = v0 + i * 2, ii = rb.ni + i * 6;
      idx[ii] = q; idx[ii + 1] = q + 1; idx[ii + 2] = q + 2; idx[ii + 3] = q + 1; idx[ii + 4] = q + 3; idx[ii + 5] = q + 2;
    }
    rb.nv += k * 2; rb.ni += (k - 1) * 6;
  }
  // TrailRenderer: lịch sử vị trí node trong thế giới; trả true nếu còn điểm
  function updateTrail(fx, j) {
    var tr = fx.tp.trails[j], T = fx.trs[j], pts = T.pts;
    var now = fx.t, n = T.n;
    // bỏ điểm quá tuổi (điểm cũ nhất ở đầu mảng)
    var drop = 0;
    while (drop < n && now - pts[drop * 4 + 3] > tr.life) drop++;
    if (drop) { pts.copyWithin(0, drop * 4, n * 4); n -= drop; }
    var on = !!fx.act[tr.node] && (!fx.inOnly || !!fx.inOnly[tr.node]) && tr.emitting !== 0 && !fx.stopped;
    _v.setFromMatrixPosition(fx.world[tr.node]);
    if (on) {
      var need = n === 0;
      if (!need) {
        var o = (n - 1) * 4, dx = _v.x - pts[o], dy = _v.y - pts[o + 1], dz = _v.z - pts[o + 2];
        need = dx * dx + dy * dy + dz * dz >= tr.minDist * tr.minDist;
      }
      if (need) {
        if (n >= TRAIL_MAX) { pts.copyWithin(0, 4, n * 4); n--; }
        pts[n * 4] = _v.x; pts[n * 4 + 1] = _v.y; pts[n * 4 + 2] = _v.z; pts[n * 4 + 3] = now; n++;
      }
    }
    T.n = n;
    if (!tr.visible || n < 1) return n > 0;
    // đầu vệt = vị trí hiện tại (nếu còn phát), rồi các điểm từ mới tới cũ
    var k = 0, P = RP, i;
    if (on) { P[0] = _v.x; P[1] = _v.y; P[2] = _v.z; k = 1; }
    for (i = n - 1; i >= 0; i--, k++) { P[k * 9] = pts[i * 4]; P[k * 9 + 1] = pts[i * 4 + 1]; P[k * 9 + 2] = pts[i * 4 + 2]; }
    if (k < 2) return n > 0;
    for (i = 0; i < k; i++) {
      var u = i / (k - 1), o3 = i * 9;
      P[o3 + 3] = ev(tr.W, u, 0);
      evG(tr.G, u, 0, P, o3 + 4);
      P[o3 + 8] = u;
    }
    emitRibbon(getRibbon(tr, tr.rmat, tr.order), k);
    return true;
  }
  // trail module kiểu Ribbon: nối các hạt theo tuổi (mới nhất = đầu vệt)
  function writeParticleRibbon(fx, si) {
    var st = si.st, R = st.ribbon, d = si.buf.d, n = Math.min(si.n, 1024), e = si.M.elements, local = !st.world;
    var P = RP;
    for (var i = 0; i < n; i++) {
      var o = (si.n - 1 - i) * NF, q = i * 9;
      var x = d[o + F.px], y = d[o + F.py], z = d[o + F.pz];
      if (local) { var X = x, Y = y, Z = z; x = e[0] * X + e[4] * Y + e[8] * Z + e[12]; y = e[1] * X + e[5] * Y + e[9] * Z + e[13]; z = e[2] * X + e[6] * Y + e[10] * Z + e[14]; }
      var t = d[o + F.age] / d[o + F.life], u = n > 1 ? i / (n - 1) : 0;
      P[q] = x; P[q + 1] = y; P[q + 2] = z;
      var w = ev(R.W, u, 0);
      if (R.sizeW) {
        var sz = d[o + F.sx];
        if (st.sizeLife) sz *= ev(st.sizeLife.x, t, d[o + F.r0]);
        w *= sz;
      }
      P[q + 3] = w;
      if (R.inherit) {
        P[q + 4] = d[o + F.cr]; P[q + 5] = d[o + F.cg]; P[q + 6] = d[o + F.cb]; P[q + 7] = d[o + F.ca];
        if (st.col) { evG(st.col, t, d[o + F.r1], tmpG, 0); P[q + 4] *= tmpG[0]; P[q + 5] *= tmpG[1]; P[q + 6] *= tmpG[2]; P[q + 7] *= tmpG[3]; }
      } else { P[q + 4] = 1; P[q + 5] = 1; P[q + 6] = 1; P[q + 7] = 1; }
      evG(R.CT, u, 0, tmpG, 0);
      P[q + 4] *= tmpG[0]; P[q + 5] *= tmpG[1]; P[q + 6] *= tmpG[2]; P[q + 7] *= tmpG[3];
      evG(R.CL, t, 0, tmpG, 0);
      P[q + 4] *= tmpG[0]; P[q + 5] *= tmpG[1]; P[q + 6] *= tmpG[2]; P[q + 7] *= tmpG[3];
      P[q + 8] = u;
    }
    emitRibbon(getRibbon(R, R.rmat, R.order), n);
  }

  // --------------------------------------------------------- hạt (pool) --
  // Mỗi bản phát của một hệ hạt: SoA theo dung lượng.
  var F = { px: 0, py: 1, pz: 2, vx: 3, vy: 4, vz: 5, age: 6, life: 7, sx: 8, sy: 9, sz: 10, rx: 11, ry: 12, rz: 13,
    cr: 14, cg: 15, cb: 16, ca: 17, r0: 18, r1: 19, r2: 20, r3: 21, fx: 22, fy: 23, fz: 24, rs: 25, uf: 26, row: 27 };
  var NF = 28;
  var pools = {};
  function allocSys(cap) {
    var k = 16;
    while (k < cap) k *= 2;
    var p = pools[k] || (pools[k] = []);
    if (p.length) return p.pop();
    return { cap: k, d: new Float32Array(k * NF) };
  }
  function freeSys(buf) { (pools[buf.cap] || (pools[buf.cap] = [])).push(buf); }

  // -------------------------------------------------------------- effect --
  var effects = [], nextId = 1, pending = [];
  var _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(),
    _v2 = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _camQ = new THREE.Quaternion(),
    _camPos = new THREE.Vector3(), _camDir = new THREE.Vector3(),
    _oC = new THREE.Vector3(), _oQi = new THREE.Quaternion(), _oP = new THREE.Vector3(), _oM = new THREE.Vector3();
  var UP = new THREE.Vector3(0, 1, 0);

  V.play = function (name, opts) {
    opts = opts || {};
    var h = { id: nextId++, name: name, alive: true, fx: null };
    var real = index ? resolveName(name, opts.element) : null;
    if (real && fxCache[real]) {
      startEffect(h, fxCache[real], opts);
    } else {
      pending.push(h);
      V.load(name, opts.element).then(function (tp) {
        var i = pending.indexOf(h);
        if (i >= 0) pending.splice(i, 1);
        if (h.alive) startEffect(h, tp, opts);
      }).catch(function (err) { h.alive = false; console.warn(String(err && err.message || err)); });
    }
    return h;
  };
  // mode: không có = ngừng phát, hạt còn sống chạy nốt; true = xoá ngay; 'end' = như Destroy/PlayEnd của SkillVfx gốc:
  // có trạng thái End của Animator thì chạy nó rồi mới xoá, không có thì xoá ngay.
  V.stop = function (h, mode) {
    if (!h) return;
    if (!h.fx) { h.alive = false; return; }
    var fx = h.fx;
    if (mode === true) { fx.stopped = true; endEffect(fx); return; }
    var toEnd = false;
    if (fx.anims) fx.anims.forEach(function (A) { if (A.a.endState >= 0 && A.state !== A.a.endState) { A.state = A.a.endState; A.t = 0; A.ending = true; toEnd = true; } });
    if (toEnd) fx.ending = true;   // Animator tự tắt phát trong clip End, rồi mới dừng hẳn
    else if (mode === 'end') { fx.stopped = true; endEffect(fx); }
    else fx.stopped = true;
  };
  V.isAlive = function (h) { return !!(h && h.alive); };

  function startEffect(h, tp, opts) {
    var n = tp.nodes.length;
    var fx = {
      h: h, tp: tp, t: 0, stopped: false, done: false,
      root: new THREE.Matrix4(), rootPos: new THREE.Vector3(), rootQ: new THREE.Quaternion(), rootS: new THREE.Vector3(1, 1, 1),
      follow: opts.follow || null, followRot: !!opts.followRot, offset: new THREE.Vector3(),
      keepAlive: !!opts.loop, forceLoop: !!opts.loop && !(opts.loopDuration > 0),
      loopIv: opts.loop && opts.loopDuration > 0 ? +opts.loopDuration : 0, loopT: 0,
      life: opts.duration > 0 ? +opts.duration : 0, rt: 0, et: 0, speeds: parseSpeeds(opts.speeds),
      local3: opts.local ? new THREE.Vector3(+opts.local.x || 0, +opts.local.y || 0, -(+opts.local.z || 0)) : null,
      owner: opts.owner || null, tracking: !!opts.tracking, mir: opts.scaleX < 0 ? -1 : 1,
      world: [], worldQ: [], worldS: [], sys: [], lightT: 0,
    };
    var p = opts.pos || { x: 0, y: 0, z: 0 };
    fx.offset.set(p.x || 0, p.y || 0, p.z || 0);
    var yaw = opts.dir;
    if (opts.aim) yaw = Math.atan2(opts.aim.x, opts.aim.z);
    // hướng tới prefab = +Z Unity = -Z three; xoay thêm π để -Z three chỉ về (sin yaw, 0, cos yaw)
    fx.rootQ.setFromAxisAngle(UP, (yaw || 0) + Math.PI);
    var sc = opts.scale === undefined ? 1 : opts.scale;
    fx.rootS.set(sc * fx.mir, sc, sc);   // scaleX −1: lật theo trục X cục bộ (HitBox.InheritOwnerScaleX)
    for (var i = 0; i < n; i++) { fx.world.push(new THREE.Matrix4()); fx.worldQ.push(new THREE.Quaternion()); fx.worldS.push(new THREE.Vector3()); }
    // trạng thái bật/tắt node của bản phát này (Animator có thể đổi)
    fx.own = new Uint8Array(n); fx.act = new Uint8Array(n);
    for (i = 0; i < n; i++) fx.own[i] = tp.nodes[i].off ? 0 : 1;
    fx.inOnly = null;
    if (opts.only) {
      var oi = -1;
      for (i = 0; i < n; i++) if (tp.nodes[i].n === opts.only) { oi = i; break; }
      if (oi < 0) console.warn('vfx: ' + tp.name + ' không có node "' + opts.only + '"');
      else {
        fx.inOnly = new Uint8Array(n);
        for (var a = oi; a >= 0; a = tp.nodes[a].p) fx.own[a] = 1;
        for (i = 0; i < n; i++) {
          for (var b2 = i; b2 >= 0; b2 = tp.nodes[b2].p) if (b2 === oi) { fx.inOnly[i] = 1; break; }
        }
      }
    }
    if (tp.anims.length || tp.script) {
      // TRS local riêng để Animator / script ghi đè
      fx.local = [];
      fx.lp = new Float32Array(n * 3); fx.lq = new Float32Array(n * 4); fx.ls = new Float32Array(n * 3);
      for (i = 0; i < n; i++) {
        tp.local[i].decompose(_v, _q, _s);
        fx.lp[i * 3] = _v.x; fx.lp[i * 3 + 1] = _v.y; fx.lp[i * 3 + 2] = _v.z;
        fx.lq[i * 4] = _q.x; fx.lq[i * 4 + 1] = _q.y; fx.lq[i * 4 + 2] = _q.z; fx.lq[i * 4 + 3] = _q.w;
        fx.ls[i * 3] = _s.x; fx.ls[i * 3 + 1] = _s.y; fx.ls[i * 3 + 2] = _s.z;
        fx.local.push(new THREE.Matrix4().copy(tp.local[i]));
      }
      fx.anims = tp.anims.map(function (a) {
        var d = a.delayCfg ? (a.delayCfg.delay || a.delayCfg.delayTime || a.delayCfg.Delay || 0) : 0;
        return { a: a, state: a.def || 0, t: -d, ending: false };
      });
    }
    fx.trs = tp.trails.map(function (tr) { return { pts: new Float32Array(TRAIL_MAX * 4), n: 0 }; });
    tp.systems.forEach(function (st) {
      var cap = Math.min(Math.max(st.maxP, 1), estimateCap(st));
      var si = { st: st, buf: allocSys(cap), n: 0, t: 0, emitAcc: 0, burstK: new Int32Array(st.bursts.length),
        loopN: 0, finished: false, prev: new THREE.Vector3(), hasPrev: false, gx: 0, gy: -1, gz: 0,
        emitOn: !st.emitOff, wasAct: false, cdOv: new Float32Array(8).fill(NaN) };
      resetSys(si);
      fx.sys.push(si);
    });
    if (fx.anims) stepAnims(fx, 0);
    runScript(fx);
    computeActive(fx);
    updateRoot(fx);
    fx.meshObjs = tp.meshes.map(function (m) {
      var o = new THREE.Mesh(m.geo, m.mat);
      o.matrixAutoUpdate = false; o.frustumCulled = false; o.renderOrder = m.order;
      if (group) group.add(o);
      return o;
    });
    placeMeshes(fx);
    for (i = 0; i < fx.sys.length; i++) fx.sys[i].wasAct = !!fx.act[fx.sys[i].st.node] && (!fx.inOnly || !!fx.inOnly[fx.sys[i].st.node]);
    fx.sys.forEach(function (si) {
      if (si && si.st.prewarm && si.st.loop) {
        for (var k = 0, steps = Math.ceil(si.st.dur * 30); k < steps; k++) simSystem(fx, si, 1 / 30);
      }
    });
    h.fx = fx;
    effects.push(fx);
  }
  function resetSys(si) {
    si.t = -ev(si.st.delay, 0, rand());
    si.emitAcc = 0; si.burstK.fill(0); si.loopN = 0; si.finished = false; si.n = 0; si.hasPrev = false;
  }
  function computeActive(fx) {
    var nodes = fx.tp.nodes;
    for (var i = 0; i < nodes.length; i++) {
      var p = nodes[i].p;
      fx.act[i] = fx.own[i] && (p < 0 || fx.act[p]) ? 1 : 0;
    }
  }
  // ----------------------------------------------------------- animator --
  function trackVal(tr, ct, k) {
    if (tr.c !== undefined) return Array.isArray(tr.c) ? tr.c[k] : tr.c;
    var v = tr.v, size = tr.p === 'rot' ? 4 : (tr.p === 'pos' || tr.p === 'scl' ? 3 : 1);
    var nf = v.length / size, f = ct * 30;   // mẫu 30 Hz (ANIM_RATE của fx_export.py)
    if (f <= 0) return v[k];
    if (f >= nf - 1) return v[(nf - 1) * size + k];
    var i = f | 0, fr = f - i;
    return v[i * size + k] + (v[(i + 1) * size + k] - v[i * size + k]) * fr;
  }
  function stepVal(s, ct) {
    var val = s.length ? s[1] : 0;
    for (var i = 0; i < s.length; i += 2) { if (s[i] <= ct + 1e-6) val = s[i + 1]; else break; }
    return val;
  }
  function stepAnims(fx, dt) {
    for (var ai = 0; ai < fx.anims.length; ai++) {
      var A = fx.anims[ai], a = A.a;
      A.t += dt;
      if (A.t < 0) continue;
      var sd = a.states[A.state];
      if (!sd) continue;
      var clip = a.clips[sd.clip];
      if (!clip) continue;
      var len = clip.len > 0 ? clip.len : 0.0001;
      // chuyển trạng thái theo exit time (không điều kiện)
      var guard = 0;
      while (sd.next !== undefined && A.t * (sd.speed || 1) >= (sd.exit === undefined ? 1 : sd.exit) * len && guard++ < 4) {
        A.t -= (sd.exit === undefined ? 1 : sd.exit) * len / (sd.speed || 1);
        A.state = sd.next; sd = a.states[A.state]; clip = a.clips[sd.clip];
        if (!clip) break;
        len = clip.len > 0 ? clip.len : 0.0001;
      }
      if (!clip) continue;
      var tt = A.t * (sd.speed || 1);
      var ct = clip.loop ? tt % len : Math.min(tt, len);
      var trs = clip.tracks;
      for (var k = 0; k < trs.length; k++) {
        var tr = trs[k], n = tr.n;
        switch (tr.p) {
          case 'pos': fx.lp[n * 3] = trackVal(tr, ct, 0); fx.lp[n * 3 + 1] = trackVal(tr, ct, 1); fx.lp[n * 3 + 2] = trackVal(tr, ct, 2); break;
          case 'scl': fx.ls[n * 3] = trackVal(tr, ct, 0); fx.ls[n * 3 + 1] = trackVal(tr, ct, 1); fx.ls[n * 3 + 2] = trackVal(tr, ct, 2); break;
          case 'rot':
            _q.set(trackVal(tr, ct, 0), trackVal(tr, ct, 1), trackVal(tr, ct, 2), trackVal(tr, ct, 3)).normalize();
            fx.lq[n * 4] = _q.x; fx.lq[n * 4 + 1] = _q.y; fx.lq[n * 4 + 2] = _q.z; fx.lq[n * 4 + 3] = _q.w;
            break;
          case 'active': fx.own[n] = stepVal(tr.s, ct); break;
          case 'emit':
            for (var j = 0; j < fx.sys.length; j++) if (fx.sys[j].st.node === n) fx.sys[j].emitOn = !!stepVal(tr.s, ct);
            break;
          default:
            if (tr.k !== undefined) {
              for (j = 0; j < fx.sys.length; j++) if (fx.sys[j].st.node === n) fx.sys[j].cdOv[tr.k * 4 + tr.q] = trackVal(tr, ct, 0);
            }
        }
      }
      A.done = !clip.loop && tt >= len && sd.next === undefined;
    }
  }
  function estimateCap(st) {
    var life = st.life.max > 0 ? st.life.max : 1;
    var rate = st.rate.max > 0 ? st.rate.max : 0;
    var burst = 0;
    st.bursts.forEach(function (b) { burst += Math.max(b.count.max, 0) * Math.max(1, Math.min(b.cycles || 1, Math.ceil(life / Math.max(b.interval, 0.01)) + 1)); });
    return Math.ceil(rate * life * 1.3 + burst + 4);
  }
  function endEffect(fx) {
    if (fx.done) return;
    fx.done = true;
    fx.h.alive = false;
    fx.sys.forEach(function (si) { if (si) { freeSys(si.buf); si.buf = null; si.n = 0; } });
    if (fx.meshObjs) fx.meshObjs.forEach(function (o) { if (o.parent) o.parent.remove(o); });
  }
  // VfxSpeeds / vfxSpeeds (AnimationSpeed gốc: {endTime, speed}): tốc độ phát từng đoạn, endTime tính theo giờ của
  // hiệu ứng như animationSpeeds của skill; sau mốc cuối tốc độ về 1 (SpeedVfxObject.ResetSimulationSpeed). [SUY LUẬN]
  function parseSpeeds(a) {
    if (!a || !a.length) return null;
    var out = a.map(function (x) { return { end: +x.endTime, sp: +x.speed }; }).filter(function (x) { return x.end > 0; });
    return out.length ? out : null;
  }
  function effDt(fx, dt) {
    var S = fx.speeds;
    if (!S) { fx.et += dt; return dt; }
    var et = fx.et, left = dt;
    for (var i = 0; i < S.length && left > 0; i++) {
      if (et >= S[i].end) continue;
      if (!(S[i].sp > 0)) { left = 0; break; }
      var need = (S[i].end - et) / S[i].sp;
      if (left <= need) { et += left * S[i].sp; left = 0; break; }
      left -= need; et = S[i].end;
    }
    et += left;
    var d = et - fx.et;
    fx.et = et;
    return d;
  }
  // ChainSkillVfx (mã gốc, trường đọc từ prefab): _chainTransform = ChainLine01_02 (mesh dài _chainLength về phía sau,
  // bật sẵn, scale z 0), _playerChainTransform = ChainLine01_01 (mesh dài về phía trước, tắt sẵn), _chainOffset.
  // Bám hitbox (đạn xích đang bay): gốc ở đầu đạn, xích 01_02 kéo ngược về chủ. Gắn trên mục tiêu (VfxEvent
  // ActionTarget TriggerTarget lúc lao tới): bật 01_01, quay về chủ. Độ dài = (khoảng cách + _chainOffset) / _chainLength
  // đặt vào scale z. [SUY LUẬN: tên trường + hình học mesh; mã C# không đọc được]
  function runScript(fx) {
    var sc = fx.tp.script;
    if (!sc || sc.type !== 'ChainSkillVfx' || !fx.local) return;
    var on = fx.tracking ? sc.chain : sc.player, off = fx.tracking ? sc.player : sc.chain;
    if (on >= 0) fx.own[on] = 1;
    if (off >= 0) fx.own[off] = 0;
    if (!fx.owner || on < 0) return;
    _v.copy(fx.offset);
    if (fx.follow) { fx.follow.updateWorldMatrix(true, false); _v2.setFromMatrixPosition(fx.follow.matrixWorld); _v.add(_v2); }
    fx.owner.updateWorldMatrix(true, false);
    _v2.setFromMatrixPosition(fx.owner.matrixWorld);
    var dx = _v2.x - _v.x, dz = _v2.z - _v.z, d = Math.sqrt(dx * dx + dz * dz);
    if (d > 1e-4) {
      var yaw = fx.tracking ? Math.atan2(-dx, -dz) : Math.atan2(dx, dz);
      fx.rootQ.setFromAxisAngle(UP, yaw + Math.PI);
      fx.followRot = false;
    }
    fx.ls[on * 3 + 2] = Math.max(0, d + (sc.off || 0)) / (sc.len || 1);
  }
  function placeMeshes(fx) {
    var ms = fx.meshObjs, tm = fx.tp.meshes;
    if (!ms) return;
    for (var i = 0; i < ms.length; i++) {
      var o = ms[i], n = tm[i].node;
      o.visible = !!fx.act[n] && (!fx.inOnly || !!fx.inOnly[n]);
      o.matrix.copy(fx.world[n]);
      o.matrixWorldNeedsUpdate = true;
    }
  }
  var TRAIL_MAX = 48;

  function updateRoot(fx) {
    var tp = fx.tp;
    _v.copy(fx.offset);
    _q.copy(fx.rootQ);
    if (fx.follow) {
      fx.follow.updateWorldMatrix(true, false);
      fx.follow.matrixWorld.decompose(_v2, _q2, _s);
      _v.add(_v2);
      if (fx.followRot) _q.premultiply(_q2);
    }
    if (fx.local3) _v.add(_v2.copy(fx.local3).applyQuaternion(_q));   // độ lệch cục bộ (VfxEvent.offset, VfxZOffset…) quay theo khung
    fx.rootPos.copy(_v);
    fx.root.compose(_v, _q, fx.rootS);
    var L = tp.local;
    if (fx.local) {
      L = fx.local;
      for (var k = 0; k < tp.nodes.length; k++) {
        _v2.set(fx.lp[k * 3], fx.lp[k * 3 + 1], fx.lp[k * 3 + 2]);
        _q2.set(fx.lq[k * 4], fx.lq[k * 4 + 1], fx.lq[k * 4 + 2], fx.lq[k * 4 + 3]);
        _s.set(fx.ls[k * 3], fx.ls[k * 3 + 1], fx.ls[k * 3 + 2]);
        if (tp.nodes[k].p < 0) { _v2.set(0, 0, 0); _q2.set(0, 0, 0, 1); }
        L[k].compose(_v2, _q2, _s);
      }
    }
    for (var i = 0; i < tp.nodes.length; i++) {
      var p = tp.nodes[i].p;
      if (p < 0) fx.world[i].multiplyMatrices(fx.root, L[i]);
      else fx.world[i].multiplyMatrices(fx.world[p], L[i]);
      fx.world[i].decompose(_v2, fx.worldQ[i], fx.worldS[i]);
    }
  }

  // ma trận mô phỏng của hệ: Hierarchy = world; Local = world nhưng scale chỉ lấy của node
  function simMatrix(fx, st, out) {
    var i = st.node;
    if (st.scaling === 0) { out.copy(fx.world[i]); return; }
    fx.world[i].decompose(_v2, _q2, _s);
    var ls = fx.tp.nodes[i].scl || [1, 1, 1];
    if (st.scaling === 1) _s.set(ls[0], ls[1], ls[2]);
    else _s.set(1, 1, 1);   // Shape: scale chỉ tác động lên hình phát
    out.compose(_v2, _q2, _s);
  }

  // ------------------------------------------------------------ emission --
  var _sp = new Float32Array(6);   // px,py,pz, dx,dy,dz (không gian hệ)
  function shapeSample(st, si, k, count) {
    var sh = st.shape;
    var x = 0, y = 0, z = 0, dx = 0, dy = 0, dz = 1;   // Unity local của shape
    if (sh) {
      var R = sh.R, th = sh.th, u, phi, r, ct, stt;
      switch (sh.t) {
        case 0: case 1: case 2: case 3: {
          ct = 2 * rand() - 1; phi = 2 * Math.PI * rand(); stt = Math.sqrt(1 - ct * ct);
          dx = stt * Math.cos(phi); dy = stt * Math.sin(phi); dz = ct;
          if (sh.t >= 2 && dz < 0) dz = -dz;
          var rr = sh.t === 1 || sh.t === 3 ? R : R * Math.cbrt(Math.pow(1 - th, 3) + (1 - Math.pow(1 - th, 3)) * rand());
          x = dx * rr; y = dy * rr; z = dz * rr;
          break;
        }
        case 4: case 7: case 8: case 9: {
          phi = arcAngle(sh, si, k, count);
          r = sh.t === 7 || sh.t === 9 ? R : R * Math.sqrt(Math.pow(1 - th, 2) + (1 - Math.pow(1 - th, 2)) * rand());
          var rho = R > 0 ? r / R : 0, sa = Math.sin(sh.A);
          x = r * Math.cos(phi); y = r * Math.sin(phi); z = 0;
          dx = Math.cos(phi) * rho * sa; dy = Math.sin(phi) * rho * sa; dz = Math.cos(sh.A);
          var dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1; dx /= dl; dy /= dl; dz /= dl;
          if (sh.t === 8 || sh.t === 9) { u = rand() * sh.len; x += dx * u; y += dy * u; z += dz * u; }
          break;
        }
        case 5: case 15: case 16: case 6: case 13: case 14:
          x = rand() - 0.5; y = rand() - 0.5; z = rand() - 0.5; dx = 0; dy = 0; dz = 1;
          break;
        case 10: case 11:
          phi = arcAngle(sh, si, k, count);
          r = sh.t === 11 ? R : R * Math.sqrt(Math.pow(1 - th, 2) + (1 - Math.pow(1 - th, 2)) * rand());
          dx = Math.cos(phi); dy = Math.sin(phi); dz = 0; x = dx * r; y = dy * r; z = 0;
          break;
        case 12:
          x = (rand() * 2 - 1) * R; y = 0; z = 0; dx = 0; dy = 1; dz = 0;
          break;
        case 17: {
          phi = arcAngle(sh, si, k, count);
          var tube = sh.donut === undefined ? 0.2 : sh.donut, a2 = 2 * Math.PI * rand(), rt = tube * Math.sqrt(rand());
          var cx = Math.cos(phi), cy = Math.sin(phi);
          dx = cx * Math.cos(a2); dy = cy * Math.cos(a2); dz = Math.sin(a2);
          x = cx * R + dx * rt; y = cy * R + dy * rt; z = dz * rt;
          break;
        }
        case 18:
          x = rand() - 0.5; y = rand() - 0.5; z = 0; dx = 0; dy = 0; dz = 1;
          break;
        default:
          x = 0; y = 0; z = 0;
      }
      if (sh.randPos) { var rp = sh.randPos * rand(); x += (rand() * 2 - 1) * rp; y += (rand() * 2 - 1) * rp; z += (rand() * 2 - 1) * rp; }
      if (sh.sphDir) { var pl = Math.sqrt(x * x + y * y + z * z); if (pl > 1e-6) { dx += (x / pl - dx) * sh.sphDir; dy += (y / pl - dy) * sh.sphDir; dz += (z / pl - dz) * sh.sphDir; } }
      if (sh.randDir) {
        var rc = 2 * rand() - 1, rph = 2 * Math.PI * rand(), rs = Math.sqrt(1 - rc * rc);
        dx += (rs * Math.cos(rph) - dx) * sh.randDir; dy += (rs * Math.sin(rph) - dy) * sh.randDir; dz += (rc - dz) * sh.randDir;
      }
      // Unity → three (lật z), rồi scale/xoay/dời của shape (đã đổi sẵn)
      z = -z; dz = -dz;
      x *= sh.s[0]; y *= sh.s[1]; z *= sh.s[2];
      _v.set(x, y, z).applyQuaternion(sh.q);
      x = _v.x + sh.p[0]; y = _v.y + sh.p[1]; z = _v.z + sh.p[2];
      _v.set(dx * sh.s[0], dy * sh.s[1], dz * sh.s[2]).applyQuaternion(sh.q);
      var ln = _v.length() || 1;
      dx = _v.x / ln; dy = _v.y / ln; dz = _v.z / ln;
    } else {
      dz = -1;   // không có shape: phát theo +Z Unity
    }
    _sp[0] = x; _sp[1] = y; _sp[2] = z; _sp[3] = dx; _sp[4] = dy; _sp[5] = dz;
  }
  function arcAngle(sh, si, k, count) {
    var mode = sh.arcMode || 0, arc = sh.arcR;
    if (mode === 0) {
      var a = rand() * arc;
      if (sh.arcSpread > 0) { var st = sh.arcSpread * arc; a = Math.floor(a / st) * st; }
      return a;
    }
    if (mode === 3) return count > 0 ? arc * (k / count) : 0;   // burst spread
    var ph = frac(si.t * ev(sh.arcSpd, 0, 0) / Math.max(1e-3, 1));
    if (mode === 2) ph = 1 - Math.abs(ph * 2 - 1);
    return ph * arc;
  }

  function spawn(fx, si, k, count, tNorm) {
    var st = si.st;
    if (si.n >= Math.min(si.buf.cap, st.maxP || 0)) {
      if (si.n >= (st.maxP || 0)) return;
      growSys(si, si.n + 1);
    }
    var d = si.buf.d, o = si.n * NF;
    shapeSample(st, si, k, count);
    var sp = ev(st.speed, tNorm, rand());
    var px = _sp[0], py = _sp[1], pz = _sp[2], vx = _sp[3] * sp, vy = _sp[4] * sp, vz = _sp[5] * sp;
    if (st.scaling === 2) {   // Shape: scale của node chỉ nhân vào vị trí phát
      var ns = fx.worldS[st.node];
      px *= ns.x; py *= ns.y; pz *= ns.z;
    }
    if (st.world) {
      _v.set(px, py, pz).applyMatrix4(si.M);
      px = _v.x; py = _v.y; pz = _v.z;
      _v.set(vx, vy, vz).applyQuaternion(fx.worldQ[st.node]);
      vx = _v.x; vy = _v.y; vz = _v.z;
    }
    d[o + F.px] = px; d[o + F.py] = py; d[o + F.pz] = pz;
    d[o + F.vx] = vx; d[o + F.vy] = vy; d[o + F.vz] = vz;
    d[o + F.age] = 0;
    var life = ev(st.life, tNorm, rand());
    d[o + F.life] = life > 1e-4 ? life : 1e-4;
    var r0 = rand();
    d[o + F.sx] = ev(st.sizeX, tNorm, r0);
    if (st.size3) { d[o + F.sy] = ev(st.sizeY, tNorm, rand()); d[o + F.sz] = ev(st.sizeZ, tNorm, rand()); }
    else { d[o + F.sy] = d[o + F.sx]; d[o + F.sz] = d[o + F.sx]; }
    var sgn = rand() < st.flipRot ? -1 : 1;
    d[o + F.rs] = sgn;
    d[o + F.rz] = ev(st.rotZ, tNorm, rand()) * sgn;
    if (st.rot3) { d[o + F.rx] = ev(st.rotX, tNorm, rand()) * sgn; d[o + F.ry] = ev(st.rotY, tNorm, rand()) * sgn; }
    else { d[o + F.rx] = 0; d[o + F.ry] = 0; }
    evG(st.color, tNorm, rand(), d, o + F.cr);
    d[o + F.r0] = rand(); d[o + F.r1] = rand(); d[o + F.r2] = rand(); d[o + F.r3] = rand();
    var fl = st.flip;
    d[o + F.fx] = rand() < fl[0] ? -1 : 1; d[o + F.fy] = rand() < fl[1] ? -1 : 1; d[o + F.fz] = rand() < fl[2] ? -1 : 1;
    if (st.uv) {
      if (rand() < st.uv.flipU) d[o + F.fx] *= -1;
      if (rand() < st.uv.flipV) d[o + F.fy] *= -1;
      d[o + F.uf] = ev(st.uv.start, 0, rand());
      d[o + F.row] = st.uv.anim === 1 ? (st.uv.rowMode === 1 ? Math.floor(rand() * st.uv.ty) : st.uv.row) : 0;
    }
    si.n++;
  }
  function growSys(si, need) {
    if (need <= si.buf.cap) return;
    var nb = allocSys(need * 2);
    nb.d.set(si.buf.d.subarray(0, si.n * NF));
    freeSys(si.buf);
    si.buf = nb;
  }

  // ----------------------------------------------------------- simulation --
  function simSystem(fx, si, dtIn) {
    var st = si.st;
    var dt = dtIn * st.simSpeed;
    if (!si.M) si.M = new THREE.Matrix4();
    simMatrix(fx, st, si.M);
    // trọng lực (thế giới -Y) trong không gian mô phỏng
    if (st.world) { si.gx = 0; si.gy = -1; si.gz = 0; }
    else { _q.copy(fx.worldQ[st.node]).invert(); _v.set(0, -1, 0).applyQuaternion(_q); si.gx = _v.x; si.gy = _v.y; si.gz = _v.z; }
    var prevT = si.t;
    si.t += dt;
    // phát
    if (!si.finished && si.t >= 0 && !fx.stopped && si.emitOn) {
      var dur = st.dur;
      var t0 = Math.max(prevT, 0), t1 = si.t;
      if (st.loop || fx.forceLoop) {
        var l0 = Math.floor(t0 / dur), l1 = Math.floor(t1 / dur);
        if (l0 === l1) emitRange(fx, si, t0 - l0 * dur, t1 - l0 * dur, dt);
        else {
          emitRange(fx, si, t0 - l0 * dur, dur, dt);
          si.burstK.fill(0);
          emitRange(fx, si, 0, t1 - l1 * dur, dt);
        }
      } else {
        emitRange(fx, si, t0, Math.min(t1, dur), dt);
        if (t1 >= dur || (!fx.anims && st.rate.max <= 0 && isZero(st.rateDist) && burstsDone(si))) si.finished = true;
      }
      // rate over distance
      if (!isZero(st.rateDist)) {
        var wp = fx.world[st.node];
        _v.setFromMatrixPosition(wp);
        if (si.hasPrev) {
          si.emitDist = (si.emitDist || 0) + _v.distanceTo(si.prev) * ev(st.rateDist, frac(si.t / dur), rand());
          while (si.emitDist >= 1) { si.emitDist -= 1; spawn(fx, si, 0, 0, frac(si.t / dur)); }
        }
        si.prev.copy(_v); si.hasPrev = true;
      }
    }
    // tiến hoá
    var d = si.buf ? si.buf.d : null, n = si.n, w = 0;
    if (!d) return;
    var vel = st.vel, lim = st.limit, frc = st.force;
    var gv = ev(st.grav, frac(Math.max(si.t, 0) / st.dur), 0) * GRAVITY * dt;
    var invQ = null;
    // Orbital/Radial xoay quanh gốc của hệ theo trục cục bộ của hệ, kể cả khi mô phỏng trong không gian thế giới.
    // Bẫy đã sập: dùng thẳng toạ độ thế giới thì hạt quay quanh gốc bản đồ (0,0,0) — FireSparks của Purification
    // (orbital ±5 rad/s) bay cách 20–25 m, lên cao 13–24 m, thành đĩa trắng trôi trên màn hình.
    var oW = !!(vel && st.world && (vel.orbit || !isZero(vel.radial))), oC = null, oQ = null, oQi = null;
    if (oW) { oC = _oC.setFromMatrixPosition(fx.world[st.node]); oQ = fx.worldQ[st.node]; oQi = _oQi.copy(oQ).invert(); }
    for (var i = 0; i < n; i++) {
      var o = i * NF;
      var age = d[o + F.age] + dt;
      var life = d[o + F.life];
      if (age >= life || (fx.stopped && life > 100)) continue;   // hạt "vĩnh viễn" (Frozen): Destroy khi dừng
      if (w !== i) d.copyWithin(w * NF, o, o + NF);
      o = w * NF;
      d[o + F.age] = age;
      var t = age / life;
      var vx = d[o + F.vx], vy = d[o + F.vy], vz = d[o + F.vz];
      if (gv !== 0) { vx += si.gx * gv; vy += si.gy * gv; vz += si.gz * gv; }
      if (frc) {
        var r2 = d[o + F.r2];
        var fxv = ev(frc.x, t, r2) * dt, fyv = ev(frc.y, t, r2) * dt, fzv = ev(frc.z, t, r2) * dt;
        if (frc.world !== st.world) { _v.set(fxv, fyv, fzv); toSim(fx, st, _v, frc.world); fxv = _v.x; fyv = _v.y; fzv = _v.z; }
        vx += fxv; vy += fyv; vz += fzv;
      }
      if (lim) {
        var r3 = d[o + F.r3];
        var damp = 1 - Math.pow(1 - Math.min(lim.damp, 1), dt * 30);
        if (lim.sep) {
          var lx = ev(lim.x, t, r3), ly = ev(lim.y, t, r3), lz = ev(lim.z, t, r3);
          if (Math.abs(vx) > lx) vx += (Math.sign(vx) * lx - vx) * damp;
          if (Math.abs(vy) > ly) vy += (Math.sign(vy) * ly - vy) * damp;
          if (Math.abs(vz) > lz) vz += (Math.sign(vz) * lz - vz) * damp;
        } else {
          var sp2 = Math.sqrt(vx * vx + vy * vy + vz * vz), lm = ev(lim.mag, t, r3);
          if (sp2 > lm && sp2 > 0) { var k2 = 1 + (lm / sp2 - 1) * damp; vx *= k2; vy *= k2; vz *= k2; }
        }
        var drag = ev(lim.drag, t, r3);
        if (drag > 0) {
          var dm = drag * dt;
          if (lim.dragSize) dm *= Math.max(Math.abs(d[o + F.sx]), 0.0001);
          if (lim.dragVel) dm *= Math.sqrt(vx * vx + vy * vy + vz * vz);
          var kd = Math.max(0, 1 - dm);
          vx *= kd; vy *= kd; vz *= kd;
        }
      }
      d[o + F.vx] = vx; d[o + F.vy] = vy; d[o + F.vz] = vz;
      var mx = vx, my = vy, mz = vz, smod = 1;
      if (vel) {
        var r1 = d[o + F.r1];
        if (vel.lin) {
          _v.set(ev(vel.x, t, r1), ev(vel.y, t, d[o + F.r2]), ev(vel.z, t, d[o + F.r3]));
          if (vel.world !== st.world) toSim(fx, st, _v, vel.world);
          mx += _v.x; my += _v.y; mz += _v.z;
        }
        var rad = ev(vel.radial, t, r1);
        if (vel.orbit || rad !== 0) {
          // vị trí so với gốc hệ, trong khung cục bộ của hệ
          _oP.set(d[o + F.px], d[o + F.py], d[o + F.pz]);
          if (oW) _oP.sub(oC).applyQuaternion(oQi);
          _oM.set(0, 0, 0);
          if (vel.orbit) {
            var ox = ev(vel.ox, t, r1), oy = ev(vel.oy, t, r1), oz = ev(vel.oz, t, r1);
            var cx = _oP.x - ev(vel.offx, t, r1), cy = _oP.y - ev(vel.offy, t, r1), cz = _oP.z - ev(vel.offz, t, r1);
            _oM.x += oy * cz - oz * cy; _oM.y += oz * cx - ox * cz; _oM.z += ox * cy - oy * cx;
          }
          if (rad !== 0) { var pl = _oP.length(); if (pl > 1e-5) _oM.addScaledVector(_oP, rad / pl); }
          if (oW) _oM.applyQuaternion(oQ);
          mx += _oM.x; my += _oM.y; mz += _oM.z;
        }
        smod = ev(vel.speedMod, t, r1);
      }
      d[o + F.px] += mx * smod * dt; d[o + F.py] += my * smod * dt; d[o + F.pz] += mz * smod * dt;
      // vận tốc hiện (cho stretch) lưu tạm vào r? — không: tính lại khi ghi. Lưu tổng vào vx.. không được (mất base).
      if (st.rotLife) {
        var rl = st.rotLife, sg = d[o + F.rs], r0 = d[o + F.r0];
        d[o + F.rz] += ev(rl.z, t, r0) * sg * dt;
        if (rl.x) d[o + F.rx] += ev(rl.x, t, r0) * sg * dt;
        if (rl.y) d[o + F.ry] += ev(rl.y, t, r0) * sg * dt;
      }
      w++;
    }
    si.n = w;
  }
  function burstsDone(si) {
    var bs = si.st.bursts;
    for (var b = 0; b < bs.length; b++) {
      var B = bs[b], k = si.burstK[b];
      if (B.cycles > 0 && k >= B.cycles) continue;
      if (B.time + k * B.interval > si.st.dur) continue;
      return false;
    }
    return true;
  }
  function toSim(fx, st, v, fromWorld) {
    if (fromWorld) { _q2.copy(fx.worldQ[st.node]).invert(); v.applyQuaternion(_q2); }
    else v.applyQuaternion(fx.worldQ[st.node]);
  }
  function emitRange(fx, si, t0, t1, dt) {
    var st = si.st, dur = st.dur;
    if (t1 < t0) return;
    var tn = clamp01(t1 / dur);
    var rate = ev(st.rate, tn, rand());
    if (rate > 0) {
      si.emitAcc += rate * (t1 - t0);
      while (si.emitAcc >= 1) { si.emitAcc -= 1; spawn(fx, si, 0, 0, tn); }
    }
    for (var b = 0; b < st.bursts.length; b++) {
      var B = st.bursts[b];
      var cyc = B.cycles > 0 ? B.cycles : 1e9;
      while (si.burstK[b] < cyc) {
        var bt = B.time + si.burstK[b] * B.interval;
        if (bt > t1 || bt > dur + 1e-6) break;
        si.burstK[b]++;
        if (rand() > B.prob) continue;
        var cnt = Math.round(ev(B.count, clamp01(bt / dur), rand()));
        for (var k = 0; k < cnt; k++) spawn(fx, si, k, cnt, clamp01(bt / dur));
        if (B.interval <= 0) break;
      }
    }
  }

  // --------------------------------------------------------------- ghi --
  var _cd = new Float32Array(8), _src = new Float32Array(34), _col = new Float32Array(4);
  function writeSystem(fx, si, b, camera) {
    var st = si.st, d = si.buf.d, n = si.n;
    if (!n) return;
    growBatch(b, b.n + n);
    var A = b.arrs;
    var M = si.M, local = !st.world;
    var e = M.elements;
    var ws = fx.worldS[st.node];
    // hệ số scale cho kích thước: Hierarchy dùng scale thế giới; Local dùng scale riêng node; Shape: 1
    var sclX = 1, sclY = 1, sclZ = 1;
    if (st.scaling === 0) { sclX = ws.x; sclY = ws.y; sclZ = ws.z; }
    else if (st.scaling === 1) { var ls = fx.tp.nodes[st.node].scl; if (ls) { sclX = ls[0]; sclY = ls[1]; sclZ = ls[2]; } }
    var mode = st.mode, uv = st.uv, cdv = st.cd, slots = st.slots;
    var align = st.align;
    var baseQ = _q2;
    var alignQ = mode === 0 && (align === 1 || align === 2);
    if (alignQ) {
      if (align === 2) baseQ.copy(fx.worldQ[st.node]); else baseQ.identity();
    } else if (mode === 4) {
      if (align === 0) baseQ.copy(_camQ);
      else if (align === 2) baseQ.copy(fx.worldQ[st.node]);
      else baseQ.identity();
    }
    var vel = st.vel;
    for (var i = 0; i < n; i++) {
      var o = i * NF, j = b.n++;
      var age = d[o + F.age], life = d[o + F.life], t = age / life;
      var x = d[o + F.px], y = d[o + F.py], z = d[o + F.pz];
      if (local) { var X = x, Y = y, Z = z; x = e[0] * X + e[4] * Y + e[8] * Z + e[12]; y = e[1] * X + e[5] * Y + e[9] * Z + e[13]; z = e[2] * X + e[6] * Y + e[10] * Z + e[14]; }
      var j4 = j * 4;
      A.iPos[j4] = x; A.iPos[j4 + 1] = y; A.iPos[j4 + 2] = z; A.iPos[j4 + 3] = fx.mir;   // w: dấu gương cho cull
      // kích thước
      var sx = d[o + F.sx], sy = d[o + F.sy], sz = d[o + F.sz];
      if (st.sizeLife) {
        var r0 = d[o + F.r0], sl = st.sizeLife, kx = ev(sl.x, t, r0);
        if (sl.y) { sx *= kx; sy *= ev(sl.y, t, r0); sz *= ev(sl.z, t, r0); }
        else { sx *= kx; sy *= kx; sz *= kx; }
      }
      A.iSize[j4] = sx * sclX * d[o + F.fx]; A.iSize[j4 + 1] = sy * sclY * d[o + F.fy]; A.iSize[j4 + 2] = sz * sclZ * d[o + F.fz]; A.iSize[j4 + 3] = 0;
      // xoay
      if (mode === 4) {
        _e.set(d[o + F.rx], d[o + F.ry], d[o + F.rz], 'YXZ');   // Unity: Z, rồi X, rồi Y
        _q.setFromEuler(_e).premultiply(baseQ);
        A.iRot[j4] = _q.x; A.iRot[j4 + 1] = _q.y; A.iRot[j4 + 2] = _q.z; A.iRot[j4 + 3] = _q.w;
      } else if (alignQ) {
        // cuộn 2D của billboard: theo chiều kim đồng hồ khi nhìn mặt quad (như billboard hướng camera)
        _e.set(d[o + F.rx], d[o + F.ry], -d[o + F.rz], 'YXZ');
        _q.setFromEuler(_e).premultiply(baseQ);
        A.iRot[j4] = _q.x; A.iRot[j4 + 1] = _q.y; A.iRot[j4 + 2] = _q.z; A.iRot[j4 + 3] = _q.w;
      } else {
        A.iRot[j4] = d[o + F.rz]; A.iRot[j4 + 1] = 0; A.iRot[j4 + 2] = 0; A.iRot[j4 + 3] = 0;
      }
      // màu
      _col[0] = d[o + F.cr]; _col[1] = d[o + F.cg]; _col[2] = d[o + F.cb]; _col[3] = d[o + F.ca];
      if (st.col) { evG(st.col, t, d[o + F.r1], tmpG, 0); _col[0] *= tmpG[0]; _col[1] *= tmpG[1]; _col[2] *= tmpG[2]; _col[3] *= tmpG[3]; }
      A.iCol[j4] = _col[0]; A.iCol[j4 + 1] = _col[1]; A.iCol[j4 + 2] = _col[2]; A.iCol[j4 + 3] = _col[3];
      // flipbook
      if (uv) {
        var fr = uv.frames, idx;
        if (uv.time === 2) idx = Math.floor(age * uv.fps + d[o + F.uf] * fr);
        else idx = Math.floor((ev(uv.fot, frac(t * uv.cycles), d[o + F.r2]) + d[o + F.uf]) * fr);
        idx = ((idx % fr) + fr) % fr;
        var col, row;
        if (uv.anim === 1) { col = idx; row = d[o + F.row]; } else { col = idx % uv.tx; row = Math.floor(idx / uv.tx); }
        A.iUV[j4] = col / uv.tx; A.iUV[j4 + 1] = 1 - (row + 1) / uv.ty; A.iUV[j4 + 2] = 1 / uv.tx; A.iUV[j4 + 3] = 1 / uv.ty;
      } else {
        A.iUV[j4] = 0; A.iUV[j4 + 1] = 0; A.iUV[j4 + 2] = 1; A.iUV[j4 + 3] = 1;
      }
      // vận tốc (stretch): base + module, ra thế giới
      var vx = d[o + F.vx], vy = d[o + F.vy], vz = d[o + F.vz];
      if (mode === 1 && vel && vel.lin) {
        _v.set(ev(vel.x, t, d[o + F.r1]), ev(vel.y, t, d[o + F.r2]), ev(vel.z, t, d[o + F.r3]));
        if (vel.world !== st.world) toSim(fx, st, _v, vel.world);
        vx += _v.x; vy += _v.y; vz += _v.z;
      }
      if (local) { var VX = vx, VY = vy, VZ = vz; vx = e[0] * VX + e[4] * VY + e[8] * VZ; vy = e[1] * VX + e[5] * VY + e[9] * VZ; vz = e[2] * VX + e[6] * VY + e[10] * VZ; }
      A.iVel[j4] = vx; A.iVel[j4 + 1] = vy; A.iVel[j4 + 2] = vz; A.iVel[j4 + 3] = 0;
      // custom data + slots
      for (var c = 0; c < 2; c++) {
        var cd = cdv[c];
        if (!cd || !st.needC[c]) { _cd[c * 4] = 0; _cd[c * 4 + 1] = 0; _cd[c * 4 + 2] = 0; _cd[c * 4 + 3] = 0; continue; }
        if (cd.v) {
          for (var q = 0; q < 4; q++) {
            var ov = si.cdOv[c * 4 + q];
            if (q >= cd.v.length) { _cd[c * 4 + q] = 0; continue; }
            var cv = cd.v[q];
            if (ov === ov) {   // Animator ghi đè hệ số (scalar) của MinMaxCurve
              if (cv.t === 0) _cd[c * 4 + q] = ov;
              else if (cv.t === 3) _cd[c * 4 + q] = cv.a + (ov - cv.a) * d[o + F.r0 + q];
              else _cd[c * 4 + q] = cv.m ? ev(cv, t, d[o + F.r0 + q]) * ov / cv.m : 0;
            } else _cd[c * 4 + q] = ev(cv, t, d[o + F.r0 + q]);
          }
        } else {
          evG(cd.c, t, d[o + F.r3], _cd, c * 4);
        }
      }
      _src[0] = 0;
      for (q = 0; q < 8; q++) _src[1 + q] = _cd[q];
      _src[9] = t; _src[10] = 1 / life; _src[11] = Math.sqrt(vx * vx + vy * vy + vz * vz);
      _src[12] = d[o + F.r0]; _src[13] = d[o + F.r1]; _src[14] = d[o + F.r2]; _src[15] = d[o + F.r3];
      _src[16] = rand(); _src[17] = rand(); _src[18] = rand(); _src[19] = rand();
      _src[20] = sx; _src[21] = sy; _src[22] = sz; _src[23] = d[o + F.rz];
      _src[24] = x; _src[25] = y; _src[26] = z; _src[27] = vx; _src[28] = vy; _src[29] = vz;
      _src[30] = 0; _src[31] = 0; _src[32] = d[o + F.rx]; _src[33] = d[o + F.ry];
      A.iC1[j4] = _src[slots[0]]; A.iC1[j4 + 1] = _src[slots[1]]; A.iC1[j4 + 2] = _src[slots[2]]; A.iC1[j4 + 3] = _src[slots[3]];
      A.iC2[j4] = _src[slots[4]]; A.iC2[j4 + 1] = _src[slots[5]]; A.iC2[j4 + 2] = _src[slots[6]]; A.iC2[j4 + 3] = _src[slots[7]];
      A.iC3[j4] = _src[slots[8]]; A.iC3[j4 + 1] = _src[slots[9]]; A.iC3[j4 + 2] = _src[slots[10]]; A.iC3[j4 + 3] = _src[slots[11]];
      if (st.sort === 1) b.keys[j] = (x - _camPos.x) * _camDir.x + (y - _camPos.y) * _camDir.y + (z - _camPos.z) * _camDir.z;
      else if (st.sort === 2) b.keys[j] = -age;        // OldestInFront: già nhất vẽ sau cùng
      else if (st.sort === 3) b.keys[j] = age;         // YoungestInFront
    }
  }
  function sortBatch(b) {
    var n = b.n, perm = b.perm, keys = b.keys;
    if (n < 2) return;
    for (var i = 0; i < n; i++) perm[i] = i;
    // chèn: xa trước (key lớn trước) — vẽ từ xa tới gần
    for (i = 1; i < n; i++) {
      var p = perm[i], k = keys[p], j = i - 1;
      while (j >= 0 && keys[perm[j]] < k) { perm[j + 1] = perm[j]; j--; }
      perm[j + 1] = p;
    }
    for (var a = 0; a < ATTR.length; a++) {
      var arr = b.arrs[ATTR[a][0]], tmp = b.tmp;
      tmp.set(arr.subarray(0, n * 4));
      for (i = 0; i < n; i++) {
        var s = perm[i] * 4, dd = i * 4;
        arr[dd] = tmp[s]; arr[dd + 1] = tmp[s + 1]; arr[dd + 2] = tmp[s + 2]; arr[dd + 3] = tmp[s + 3];
      }
    }
  }

  // ------------------------------------------------------------- lights --
  var lights = [], lightCand = [];
  for (var li0 = 0; li0 < 64; li0++) lightCand.push({ w: 0, x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, i: 0, range: 0 });
  var nCand = 0;
  function addLight(x, y, z, color, intensity, range) {
    if (nCand >= lightCand.length || intensity <= 0) return;
    var c = lightCand[nCand++];
    c.x = x; c.y = y; c.z = z; c.r = color.r; c.g = color.g; c.b = color.b; c.i = intensity; c.range = range;
    c.w = intensity * range / (1 + (x - _camPos.x) * (x - _camPos.x) * 0.001 + (z - _camPos.z) * (z - _camPos.z) * 0.001);
  }
  function lightCurve(node, attr, t) {
    var a = node.anim;
    if (!a || !a.clips) return null;
    for (var i = 0; i < a.clips.length; i++) {
      var cl = a.clips[i];
      for (var k = 0; k < cl.curves.length; k++) {
        var cv = cl.curves[k];
        if (cv.attr === attr && cv.k.length) {
          var end = cv.k[cv.k.length - 4];
          var tt = cl.loop && end > 0 ? t % end : t;
          return hermite(cv.k, tt);
        }
      }
    }
    return null;
  }

  // ------------------------------------------------------------- update --
  V.setScene = function (scene) {
    if (!group) {
      group = new THREE.Group();
      group.name = 'vfx';
      for (var i = 0; i < MAX_LIGHTS; i++) {
        var l = new THREE.PointLight(0xffffff, 0, 5, 2);
        l.name = 'vfx-light-' + i;
        lights.push(l);
        group.add(l);
      }
      batches.forEach(function (b) { group.add(b.mesh); });
      ribbons.forEach(function (b) { group.add(b.mesh); });
    }
    if (group.parent) group.parent.remove(group);
    scene.add(group);
  };
  V.setScreen = function (w, h) { shared.uScreen.value.set(w, h); };

  V.update = function (dt, camera) {
    var t0 = performance.now();
    if (dt > 0.1) dt = 0.1;
    shared.uTime.value += dt;
    if (camera) {
      camera.updateMatrixWorld();
      camera.matrixWorld.decompose(_camPos, _camQ, _s);
      camera.getWorldDirection(_camDir);
    }
    var i, j;
    runWarm();
    for (i = 0; i < batches.length; i++) batches[i].n = 0;
    for (i = 0; i < ribbons.length; i++) { ribbons[i].nv = 0; ribbons[i].ni = 0; }
    nCand = 0;
    var np = 0, ns = 0;
    for (i = 0; i < effects.length; i++) {
      var fx = effects[i];
      if (fx.done) continue;
      var dte = effDt(fx, dt);   // giờ của hiệu ứng (VfxSpeeds); Destroy sau duration tính theo giờ thật (fx.rt)
      fx.rt += dt;
      fx.t += dte;
      if (fx.anims) {
        stepAnims(fx, dte);
        computeActive(fx);
        if (fx.ending) {
          var allDone = true;
          for (j = 0; j < fx.anims.length; j++) if (!fx.anims[j].done) allDone = false;
          if (allDone) { fx.stopped = true; fx.ending = false; }
        }
      }
      if (fx.tp.script) { runScript(fx); computeActive(fx); }
      updateRoot(fx);
      placeMeshes(fx);
      if (fx.loopIv > 0 && !fx.stopped) {
        // ParticleLooper gốc: RestartAllParticles mỗi _loopInterval (VfxLoopDuration / LoopDuration)
        fx.loopT += dte;
        if (fx.loopT >= fx.loopIv) {
          fx.loopT -= fx.loopIv;
          for (j = 0; j < fx.sys.length; j++) { var sr = fx.sys[j], nKeep = sr.n; resetSys(sr); sr.n = nKeep; }
        }
      }
      var anyAlive = false;
      for (j = 0; j < fx.sys.length; j++) {
        var si = fx.sys[j];
        var on = !!fx.act[si.st.node] && (!fx.inOnly || !!fx.inOnly[si.st.node]);
        if (on !== si.wasAct) {   // GameObject bật lại: Play() từ đầu; tắt: xoá hạt
          si.wasAct = on;
          resetSys(si);
        }
        if (!on) continue;
        simSystem(fx, si, dte);
        if (si.n > 0 || (!si.finished && !fx.stopped) || si.t < 0) anyAlive = true;
        if (si.st.ribbon && si.n > 1) writeParticleRibbon(fx, si);
        if (si.st.visible && si.n > 0) {
          var b = getBatch(si.st);
          writeSystem(fx, si, b, camera);
          np += si.n; ns++;
        }
        if (si.st.lightsMod && si.n > 0 && si.st.lightsMod.light) {
          var lm = si.st.lightsMod, L = lm.light;
          if (!L.lin) L.lin = new THREE.Color(s2l(L.color[0]), s2l(L.color[1]), s2l(L.color[2]));
          _v.setFromMatrixPosition(fx.world[si.st.node]);
          addLight(_v.x, _v.y, _v.z, L.lin, L.intensity * ev(lm.intensity, 0, 0.5) * Math.min(1, si.n * lm.ratio), L.range * ev(lm.range, 0, 0.5));
        }
      }
      // TrailRenderer
      for (j = 0; j < fx.trs.length; j++) {
        if (updateTrail(fx, j)) anyAlive = true;
      }
      if (fx.ending) anyAlive = true;
      if (fx.keepAlive && !fx.stopped) anyAlive = true;   // lặp tới khi stop()
      if (fx.meshObjs && fx.meshObjs.length && !fx.stopped) anyAlive = true;   // MeshRenderer: sống tới stop()/duration
      if (fx.anims && !fx.stopped) for (j = 0; j < fx.anims.length; j++) if (!fx.anims[j].done) anyAlive = true;
      // Light trên prefab: sống cùng hiệu ứng
      var tl = fx.tp.lights;
      for (j = 0; j < tl.length; j++) {
        var lt = tl[j];
        if (!lt.enabled || !fx.act[lt.node] || (fx.inOnly && !fx.inOnly[lt.node])) continue;
        var node = fx.tp.nodes[lt.node];
        var inten = lightCurve(node, 'm_Intensity', fx.t);
        if (inten === null) inten = lt.intensity * (anyAlive ? 1 : 0);
        var rng = lightCurve(node, 'm_Range', fx.t);
        _v.setFromMatrixPosition(fx.world[lt.node]);
        addLight(_v.x, _v.y, _v.z, lt.linColor, inten, rng === null ? lt.range : rng);
      }
      if ((!anyAlive && fx.t > 0.05) || (fx.life > 0 && fx.rt >= fx.life)) endEffect(fx);
    }
    // dọn danh sách
    for (i = effects.length - 1; i >= 0; i--) if (effects[i].done) effects.splice(i, 1);
    var dc = 0;
    for (i = 0; i < batches.length; i++) {
      var bb = batches[i];
      if (bb.n > 0 && bb.st.sort && bb.n > 1) sortBatch(bb);
      bb.geo.instanceCount = bb.n;
      bb.mesh.visible = bb.n > 0 || !!bb.warm;
      bb.warm = false;
      if (bb.n > 0) {
        dc++;
        for (var a = 0; a < ATTR.length; a++) {
          var at = bb.attrs[ATTR[a][0]];
          at.updateRange.offset = 0; at.updateRange.count = bb.n * 4;
          at.needsUpdate = true;
        }
      }
    }
    for (i = 0; i < ribbons.length; i++) {
      var rb = ribbons[i];
      rb.geo.setDrawRange(0, rb.ni);
      rb.mesh.visible = rb.ni > 0 || !!rb.warm; rb.warm = false;
      if (rb.ni > 0) {
        dc++;
        rb.pos.updateRange.count = rb.nv * 3; rb.pos.needsUpdate = true;
        rb.uv.updateRange.count = rb.nv * 2; rb.uv.needsUpdate = true;
        rb.col.updateRange.count = rb.nv * 4; rb.col.needsUpdate = true;
        rb.idx.updateRange.count = rb.ni; rb.idx.needsUpdate = true;
      }
    }
    // đèn: chọn MAX_LIGHTS mạnh nhất
    for (i = 0; i < lights.length; i++) {
      var best = -1, bw = 0;
      for (j = 0; j < nCand; j++) if (lightCand[j].w > bw) { bw = lightCand[j].w; best = j; }
      var PL = lights[i];
      if (best < 0) { PL.intensity = 0; continue; }
      var cc = lightCand[best];
      cc.w = 0;
      PL.position.set(cc.x, cc.y, cc.z);
      PL.color.setRGB(cc.r, cc.g, cc.b);
      PL.intensity = cc.i;
      PL.distance = cc.range;
    }
    V.stats.effects = effects.length;
    V.stats.systems = ns;
    V.stats.particles = np;
    V.stats.drawCalls = dc;
    V.stats.simMs = performance.now() - t0;
  };

  V.clear = function () {
    effects.forEach(function (fx) { endEffect(fx); });
    effects.length = 0;
    batches.forEach(function (b) { b.n = 0; b.geo.instanceCount = 0; b.mesh.visible = false; });
    ribbons.forEach(function (b) { b.nv = 0; b.ni = 0; b.mesh.visible = false; });
  };
  V.index = function () { return loadIndex(); };
})(window.VD = window.VD || {});
