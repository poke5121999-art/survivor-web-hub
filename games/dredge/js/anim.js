/*
 * DRAnim — chạy AnimationClip / AnimatorController của Unity (dữ liệu data/animlib.js do tools/anim.py bóc).
 * Không phụ thuộc three.js khi chỉ lấy mẫu; bản đích three.js dùng đối tượng THREE.Object3D, bản đích DOM dùng "rig" RectTransform.
 *
 * ── Lấy mẫu ─────────────────────────────────────────────────────────────────────────────────────────────
 *   DRAnim.evalCurve(keys, t)              keys = [[t, giá trị, tiếp tuyến vào, tiếp tuyến ra], ...]; Hermite như Unity,
 *                                          ngoài khoảng thì giữ giá trị đầu/cuối (m_PreInfinity = m_PostInfinity = 2, đo ở 13.154/13.154 curve);
 *                                          tiếp tuyến ±Infinity = bậc thang (giữ giá trị khoá trái tới khoá phải).
 *   DRAnim.sample(clip, t, {wrap})         → { [path]: { [prop]: giá trị } }; wrap (mặc định true) lặp t theo clip.loop, không thì kẹp vào [0, len].
 *   DRAnim.value(clip, path, prop, t)      một giá trị. `clip` là tên (DR_ANIM.clips[tên]) hoặc chính đối tượng clip.
 *   Tên thuộc tính (prop) theo Unity: m_LocalPosition.x|y|z, m_LocalRotation.x|y|z|w (quaternion), localEulerAnglesRaw.x|y|z (độ, thứ tự ZXY),
 *   m_LocalScale.x|y|z, m_IsActive, m_Enabled, m_Alpha, m_Color.r|g|b|a, m_AnchoredPosition.x|y, m_SizeDelta.x|y, m_Pivot.x|y,
 *   EmissionModule.enabled, blendShape.<tên> (0..100)...; `path` tương đối với GameObject mang Animator ("" = chính nó).
 *
 * ── Máy trạng thái ───────────────────────────────────────────────────────────────────────────────────────
 *   const p = DRAnim.bind(đích, 'TrawlNet_Animator', { onEvent, onFloat, auto, unity, speed });
 *   p.set('isDeployed', true)   p.set('fullness', 0.4)   p.trigger('deploy')   p.reset('deploy')   p.get('fullness')
 *   p.update(dt)                dt giây. Đích DOM tự chạy bằng requestAnimationFrame (auto = true); đích khác thì chủ gọi update(dt) mỗi khung.
 *   Người chạy tự động dừng vòng requestAnimationFrame khi mọi layer đã đứng yên (clip không lặp chạy hết, không chuyển trạng thái tự động);
 *   set/trigger/play/seek đánh thức lại. p.idle cho biết đang đứng yên.
 *   p.state(layer=0) → {name, t, n, clip, next}    p.play(state, normalizedTime=0, layer=0)   p.seek(giây, layer=0)   p.destroy()
 *   p.missing → danh sách path không tìm thấy ở đích (đích three).     p.events → số sự kiện đã phát.
 *   Layer: layer 0 ở gốc controller, các layer sau ở ctrl.layers, trọng số cố định, ghi đè (không hỗ trợ additive/mặt nạ).
 *   Chuyển trạng thái: any-state trước, rồi theo thứ tự trong tệp; điều kiện if/ifnot/gt/lt/eq/ne; trigger bị tiêu thụ khi chuyển;
 *   exitTime (chuẩn hoá) theo thời gian trong trạng thái; dur > 0 thì chéo mờ tuyến tính (fixed=0: tính theo phần của clip nguồn);
 *   dur = 0 chuyển ngay, phần dư của khung chạy tiếp ở trạng thái mới. Một chuyển trạng thái mỗi khung mỗi layer.
 *   WriteDefaultValues: trạng thái có wd ≠ 0 trả thuộc tính mà clip của nó không đụng nhưng clip khác trong layer có về giá trị nghỉ của đích.
 *   Sự kiện clip {fn, data, f, i}: phát khi đầu đọc đi qua (prev, t]; clip lặp phát mỗi vòng. onEvent(ev, player), ev = {fn, data, f, i, t, clip, state, layer}.
 *
 * ── Đích three.js ────────────────────────────────────────────────────────────────────────────────────────
 *   DRAnim.bind(object3D, ctrl): path = tên node con (so khớp name, userData.name, hoặc tên đã qua PropertyBinding.sanitizeNodeName vì
 *   GLTFLoader đã bỏ [ ] . : / và đổi khoảng trắng thành _). Mặc định đổi hệ Unity (trái) → three.js (phải): vị trí (x,y,-z),
 *   quaternion (-x,-y,z,w), euler đổi qua quaternion ZXY; opts.unity = false để tắt. m_IsActive/m_Enabled → .visible,
 *   blendShape.<tên> → morphTargetInfluences (chia 100). Thuộc tính khác (EmissionModule.enabled, m_Color...) gọi opts.onFloat(path, prop, v, cls)
 *   và ghi vào node.userData['an:' + prop].
 *
 * ── Đích DOM (RectTransform) ─────────────────────────────────────────────────────────────────────────────
 *   const h = DRAnim.rig('Mayor' | nodes, container, { shadow, sprite });  rig = cây RectTransform (DR_ANIM.rigs[prefab].nodes).
 *   Mỗi nút có ảnh thành một <img class="an-i"> đặt phẳng trong container theo thứ tự cây (con đè cha, như Canvas), toạ độ đơn vị canvas
 *   (px ở tỉ lệ 1; chủ container tự co bằng transform: scale(--s), transform-origin 0 0). Bố cục: neo, pivot, sizeDelta, scale, xoay z, theo công thức
 *   RectTransform; ma trận CSS tính trên số thực nên scale 100 của sprite không bị LayoutUnit (1/64 px) làm lệch.
 *   Image.preserveAspect (nút có pa = 1): <img> dùng object-fit: contain + object-position theo pivot; hộp của nút vẫn là hình chữ nhật của prefab.
 *   Màu Image (m_Color) nhân vào ảnh: r=g=b dùng brightness(), khác kênh dùng bộ lọc SVG feColorMatrix (sRGB); a nhân CanvasGroup.alpha của
 *   mọi nút tổ tiên → opacity. m_IsActive tắt cả nhánh (display none). opts.shadow = chuỗi filter nối sau màu (ví dụ drop-shadow(...)).
 *   opts.adopt(node) → phần tử có sẵn của chủ (div, button...) thay vì <img>: thư viện đặt position:absolute, width/height, transform: matrix(), opacity, filter
 *   lên nó (đừng đặt các thuộc tính này ở CSS của phần tử); node = {path, base: dữ liệu nút, cur: giá trị đang chạy}. Chủ tự dựng danh sách nút
 *   cùng lược đồ DR_ANIM.rigs[...].nodes ({n, p (chỉ số cha, -1 = gốc), ap, sd, an:[minX,minY,maxX,maxY], pv, sc, rz, [on], [cg], [col], [img], [pa]}).
 *   h.restBoxes() → [{path, img, x, y, w, h}] bố cục lúc nghỉ; h.nodes; h.byPath; h.layout(); h.write(); h.destroy().
 *   DRAnim.bind(h | container, ctrl) chạy hoạt hình lên rig; tự đăng ký requestAnimationFrame.
 *
 * ── Đích tuỳ ý ───────────────────────────────────────────────────────────────────────────────────────────
 *   DRAnim.bind({ set(path, prop, value, cls), end() , rest(path, prop, cls) , sprite(path, tên) }, ctrl): nhận mọi giá trị đã trộn; mọi hàm trừ set là tuỳ chọn.
 *   DRAnim.bind(null, ctrl) chỉ chạy máy trạng thái (kiểm thử).
 *
 * ── Bẫy ──────────────────────────────────────────────────────────────────────────────────────────────────
 *   - Tên clip = tên tệp .anim của AssetRipper (không phải m_Name: nhiều clip tên Idle).
 *   - Hệ toạ độ: animlib giữ nguyên Unity; đích three.js phải đổi (mặc định đã đổi). Nút glb đã đổi sẵn cùng công thức.
 *   - m_IsActive là đường bậc thang; đọc >= 0,5 là bật.
 *   - Curve vật lý của lưới (khớp CharacterJoint, Rigidbody) đã bị tools/anim.py bỏ.
 *   - DRAnim.paused / DRAnim.timeScale chỉ tác động bộ chạy tự động (DOM); kiểm thử dùng p.seek / p.update(dt) cho chắc.
 */
(function (root) {
  'use strict';
  const LIB = () => root.DR_ANIM || (root.DR_ANIM = { v: 1, clips: {}, controllers: {}, rigs: {} });
  const A = {};
  const INF = Infinity;
  const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);

  // ───────────────────────────────────────────────────────────── Hermite (Unity AnimationCurve.Evaluate)
  function evalCurve(keys, t) {
    const n = keys.length;
    if (!n) return 0;
    let k0 = keys[0];
    if (n === 1 || t <= k0[0]) return k0[1];
    const kl = keys[n - 1];
    if (t >= kl[0]) return kl[1];
    let lo = 0, hi = n - 1;                       // keys[lo][0] <= t < keys[hi][0]
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (keys[mid][0] <= t) lo = mid; else hi = mid; }
    k0 = keys[lo];
    const k1 = keys[hi], dt = k1[0] - k0[0], m0 = k0[3], m1 = k1[2];
    if (m0 === INF || m0 === -INF || m1 === INF || m1 === -INF) return k0[1];   // tiếp tuyến vô cực = bậc thang
    const s = (t - k0[0]) / dt, s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * k0[1] + (s3 - 2 * s2 + s) * m0 * dt + (s3 - s2) * m1 * dt + (3 * s2 - 2 * s3) * k1[1];
  }
  A.evalCurve = evalCurve;

  function clipOf(c) {
    if (typeof c !== 'string') return c;
    const k = LIB().clips[c];
    if (!k) throw new Error('animation clip not found: ' + c);
    return k;
  }
  function clipTime(clip, t) {
    const len = clip.len;
    if (clip.loop && len > 0) { const x = t % len; return x < 0 ? x + len : x; }
    return t < 0 ? 0 : t > len ? len : t;
  }
  A.clipTime = clipTime;
  A.sample = function (clip, t, opt) {
    clip = clipOf(clip);
    const tt = !opt || opt.wrap !== false ? clipTime(clip, t) : t;
    const out = {};
    for (const c of clip.curves) (out[c.path] || (out[c.path] = {}))[c.prop] = evalCurve(c.keys, tt);
    return out;
  };
  A.value = function (clip, path, prop, t) {
    clip = clipOf(clip);
    for (const c of clip.curves) if (c.path === path && c.prop === prop) return evalCurve(c.keys, clipTime(clip, t));
    return undefined;
  };

  // ───────────────────────────────────────────────────────────── quaternion / euler Unity (trái, thứ tự ZXY)
  const D2R = Math.PI / 180;
  function qmul(a, b) {
    return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
      a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
  }
  // Quaternion.Euler(x, y, z) của Unity: xoay z rồi x rồi y (quanh trục cố định) = Qy · Qx · Qz
  function eulerToQuat(xd, yd, zd) {
    const hx = xd * D2R / 2, hy = yd * D2R / 2, hz = zd * D2R / 2;
    return qmul(qmul([0, Math.sin(hy), 0, Math.cos(hy)], [Math.sin(hx), 0, 0, Math.cos(hx)]), [0, 0, Math.sin(hz), Math.cos(hz)]);
  }
  function quatToEuler(q) {
    const x = q[0], y = q[1], z = q[2], w = q[3];
    const m13 = 2 * (x * z + y * w), m23 = 2 * (y * z - x * w), m33 = 1 - 2 * (x * x + y * y), m21 = 2 * (x * y + z * w), m22 = 1 - 2 * (x * x + z * z);
    const m31 = 2 * (x * z - y * w), m11 = 1 - 2 * (y * y + z * z);
    const ex = Math.asin(-Math.max(-1, Math.min(1, m23)));
    let ey, ez;
    if (Math.abs(m23) < 0.9999999) { ey = Math.atan2(m13, m33); ez = Math.atan2(m21, m22); } else { ey = Math.atan2(-m31, m11); ez = 0; }
    return [ex / D2R, ey / D2R, ez / D2R];
  }
  A.eulerToQuat = eulerToQuat;
  A.quatToEuler = quatToEuler;

  // ───────────────────────────────────────────────────────────── đích three.js
  const sanitize = s => String(s).replace(/\s/g, '_').replace(/[\[\].:\/]/g, '');
  const TR = {   // prop → [nhóm, trục]
    'm_LocalPosition.x': ['p', 0], 'm_LocalPosition.y': ['p', 1], 'm_LocalPosition.z': ['p', 2],
    'localEulerAnglesRaw.x': ['e', 0], 'localEulerAnglesRaw.y': ['e', 1], 'localEulerAnglesRaw.z': ['e', 2],
    'm_LocalRotation.x': ['q', 0], 'm_LocalRotation.y': ['q', 1], 'm_LocalRotation.z': ['q', 2], 'm_LocalRotation.w': ['q', 3],
    'm_LocalScale.x': ['s', 0], 'm_LocalScale.y': ['s', 1], 'm_LocalScale.z': ['s', 2]
  };
  const RENDERERS = { 23: 1, 25: 1, 137: 1, 212: 1, 120: 1 };   // MeshRenderer, SpriteRenderer..., SkinnedMeshRenderer, LineRenderer

  function ThreeTarget(rootObj, opts) {
    this.root = rootObj; this.unity = opts.unity !== false; this.recs = new Map(); this.missing = []; this.touched = []; this.onFloat = opts.onFloat || null;
  }
  ThreeTarget.prototype.find = function (path) {
    let o = this.root;
    if (path === '') return o;
    for (const seg of path.split('/')) {
      let hit = null;
      const sg = sanitize(seg);
      for (const c of o.children) { if (c.name === seg || (c.userData && c.userData.name === seg) || c.name === sg) { hit = c; break; } }
      if (!hit) return null;
      o = hit;
    }
    return o;
  };
  ThreeTarget.prototype.rec = function (path) {
    let r = this.recs.get(path);
    if (r !== undefined) return r;
    const o = this.find(path);
    if (!o) { r = null; this.missing.push(path); } else {
      const u = this.unity, p = o.position, q = o.quaternion, s = o.scale;
      const uq = u ? [-q.x, -q.y, q.z, q.w] : [q.x, q.y, q.z, q.w];   // phép đảo (x,y,z,w) ↔ (-x,-y,z,w) tự nghịch
      r = { o, path, mask: 0, act: o.visible, ren: true,
        rest: { p: [p.x, p.y, u ? -p.z : p.z], q: uq, e: quatToEuler(uq), s: [s.x, s.y, s.z] },
        p: [0, 0, 0], e: [0, 0, 0], q: [0, 0, 0, 1], s: [1, 1, 1], pm: 0, em: 0, qm: 0, sm: 0, touched: false, flags: 0 };
    }
    this.recs.set(path, r);
    return r;
  };
  ThreeTarget.prototype.set = function (path, prop, v, cls) {
    const r = this.rec(path);
    if (!r) return;
    const tr = TR[prop];
    if (tr) {
      const g = tr[0], i = tr[1];
      r[g][i] = v; r[g + 'm'] |= 1 << i;
    } else if (prop === 'm_IsActive') { r.act = v >= 0.5; r.flags |= 2; }
    else if (prop === 'm_Enabled' && RENDERERS[cls]) { r.ren = v >= 0.5; r.flags |= 4; }
    else if (prop.indexOf('blendShape.') === 0) {
      const o = r.o, nm = prop.slice(11), d = o.morphTargetDictionary;
      if (d && o.morphTargetInfluences && d[nm] !== undefined) { o.morphTargetInfluences[d[nm]] = v / 100; return; }
      if (this.onFloat) this.onFloat(path, prop, v, cls);
      r.o.userData['an:' + prop] = v;
    } else {
      r.o.userData['an:' + prop] = v;
      if (this.onFloat) this.onFloat(path, prop, v, cls);
    }
    if (!r.touched) { r.touched = true; this.touched.push(r); }
  };
  ThreeTarget.prototype.end = function () {
    const u = this.unity;
    for (const r of this.touched) {
      r.touched = false;
      const o = r.o;
      if (r.pm) {
        const rp = r.rest.p, p = r.p, m = r.pm;
        const x = m & 1 ? p[0] : rp[0], y = m & 2 ? p[1] : rp[1], z = m & 4 ? p[2] : rp[2];
        o.position.set(x, y, u ? -z : z);
      }
      let q = null;
      if (r.qm) {
        const rq = r.rest.q, a = r.q, m = r.qm;
        q = [m & 1 ? a[0] : rq[0], m & 2 ? a[1] : rq[1], m & 4 ? a[2] : rq[2], m & 8 ? a[3] : rq[3]];
        const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
        q = [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
      } else if (r.em) {
        const re = r.rest.e, a = r.e, m = r.em;
        q = eulerToQuat(m & 1 ? a[0] : re[0], m & 2 ? a[1] : re[1], m & 4 ? a[2] : re[2]);
      }
      if (q) { if (u) o.quaternion.set(-q[0], -q[1], q[2], q[3]); else o.quaternion.set(q[0], q[1], q[2], q[3]); }
      if (r.sm) {
        const rs = r.rest.s, s = r.s, m = r.sm;
        o.scale.set(m & 1 ? s[0] : rs[0], m & 2 ? s[1] : rs[1], m & 4 ? s[2] : rs[2]);
      }
      if (r.flags & 6) o.visible = r.act && r.ren;
      r.pm = r.qm = r.em = r.sm = 0;
    }
    this.touched.length = 0;
  };
  ThreeTarget.prototype.rest = function (path, prop, cls) {
    const r = this.rec(path);
    if (!r) return undefined;
    const tr = TR[prop];
    if (tr) return r.rest[tr[0]][tr[1]];
    if (prop === 'm_IsActive') return 1;
    if (prop === 'm_Enabled') return 1;
    return undefined;
  };

  // ───────────────────────────────────────────────────────────── rig RectTransform (đích DOM)
  const IDENT = [1, 0, 0, 1, 0, 0];
  function amul(A_, B_) {
    return [A_[0] * B_[0] + A_[2] * B_[1], A_[1] * B_[0] + A_[3] * B_[1], A_[0] * B_[2] + A_[2] * B_[3], A_[1] * B_[2] + A_[3] * B_[3],
      A_[0] * B_[4] + A_[2] * B_[5] + A_[4], A_[1] * B_[4] + A_[3] * B_[5] + A_[5]];
  }
  const f4 = x => Math.round(x * 10000) / 10000;

  function RigNode(n, i, nodes) {
    this.i = i; this.n = n.n; this.p = n.p; this.base = n;
    this.path = n.p < 0 ? '' : (nodes[n.p].path === '' ? n.n : nodes[n.p].path + '/' + n.n);
    this.cur = null; this.m = IDENT; this.size = [0, 0]; this.active = true; this.alpha = 1; this.k = [1, 1];
    this.el = null; this.sig = ''; this.filterId = null; this.fe = null;
    this.reset();
  }
  RigNode.prototype.reset = function () {
    const b = this.base, col = b.col || [1, 1, 1, 1];
    this.cur = { ap: b.ap.slice(), sd: b.sd.slice(), an: b.an.slice(), pv: b.pv.slice(), sc: b.sc.slice(), rz: b.rz, on: b.on === 0 ? 0 : 1,
      cg: b.cg === undefined ? 1 : b.cg, col: col.slice(), en: 1, inter: 1, ray: 1 };
  };

  function layoutNodes(nodes) {
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i], c = n.cur, par = n.p >= 0 ? nodes[n.p] : null;
      const pm = par ? par.m : IDENT, ps = par ? par.size : [0, 0], ppv = par ? par.cur.pv : [0, 0];
      const a0 = c.an[0], a1 = c.an[1], b0 = c.an[2], b1 = c.an[3];
      const sx = (b0 - a0) * ps[0] + c.sd[0], sy = (b1 - a1) * ps[1] + c.sd[1];
      const px = -ppv[0] * ps[0] + a0 * ps[0] + c.pv[0] * (b0 - a0) * ps[0] + c.ap[0];
      const py = -ppv[1] * ps[1] + a1 * ps[1] + c.pv[1] * (b1 - a1) * ps[1] + c.ap[1];
      const th = c.rz * D2R, cs = Math.cos(th), sn = Math.sin(th);
      n.m = amul(pm, [cs * c.sc[0], sn * c.sc[0], -sn * c.sc[1], cs * c.sc[1], px, py]);
      n.size = [sx, sy];
      n.active = (par ? par.active : true) && c.on === 1;
      n.alpha = (par ? par.alpha : 1) * c.cg;
    }
  }
  A.layoutNodes = layoutNodes;

  let filterSeq = 0;
  function RigHandle(spec, container, opts) {
    const R = typeof spec === 'string' ? LIB().rigs[spec] : spec;
    if (!R) throw new Error('animation rig not found: ' + spec);
    const list = R.nodes || R;
    this.name = typeof spec === 'string' ? spec : (R.name || ''); this.ctrl = R.ctrl || null;
    this.nodes = [];
    for (let i = 0; i < list.length; i++) this.nodes.push(new RigNode(list[i], i, this.nodes));
    this.byPath = new Map();
    for (const n of this.nodes) if (!this.byPath.has(n.path)) this.byPath.set(n.path, n);
    this.container = container || null; this.opts = opts || {};
    layoutNodes(this.nodes);
    for (const n of this.nodes) n.k = [Math.hypot(n.m[0], n.m[1]) || 1, Math.hypot(n.m[2], n.m[3]) || 1];   // cỡ nghỉ của hộp CSS
    this.svg = null;
    if (container) this.build();
    this._players = [];
  }
  RigHandle.prototype.build = function () {
    const c = this.container, doc = c.ownerDocument || document;
    for (const n of this.nodes) {
      let im = this.opts.adopt ? this.opts.adopt(n) : null;   // phần tử có sẵn của chủ: chỉ nhận vị trí/cỡ/ma trận/độ mờ/lọc màu
      const adopted = !!im;
      if (!im) {
        if (!n.base.img) continue;
        im = doc.createElement('img');
        im.className = 'an-i'; im.alt = ''; im.draggable = false;
        im.src = this.opts.src ? this.opts.src(n.base.img, n) : n.base.img;
        if (n.base.pa) {   // Image.preserveAspect: sprite vừa khít trong hộp, lệch theo pivot như Image.PreserveSpriteAspectRatio (y của CSS đi xuống)
          im.style.objectFit = 'contain'; im.style.objectPosition = f4(n.base.pv[0] * 100) + '% ' + f4((1 - n.base.pv[1]) * 100) + '%';
        }
      }
      im.dataset.an = n.path;
      const st = im.style;
      st.position = 'absolute'; st.left = '0'; st.top = '0'; st.transformOrigin = '0 0'; st.pointerEvents = 'none'; st.userSelect = 'none';
      if (!adopted || im.parentNode !== c) c.appendChild(im);
      n.el = im;
    }
    c._anRig = this;
    this.write();
  };
  RigHandle.prototype.layout = function () { layoutNodes(this.nodes); };
  RigHandle.prototype.restBoxes = function () {
    const save = this.nodes.map(n => n.cur);
    for (const n of this.nodes) n.reset();
    layoutNodes(this.nodes);
    const out = [];
    for (const n of this.nodes) {
      if (!n.base.img || !n.active) continue;
      out.push({ path: n.path, img: n.base.img, x: n.m[4], y: n.m[5], w: n.size[0] * n.k[0], h: n.size[1] * n.k[1] });
    }
    this.nodes.forEach((n, i) => { n.cur = save[i]; });
    layoutNodes(this.nodes);
    return out;
  };
  RigHandle.prototype.tint = function (n) {
    const c = n.cur.col, r = c[0], g = c[1], b = c[2];
    if (r === 1 && g === 1 && b === 1) return '';
    if (r === g && g === b) return 'brightness(' + f4(r) + ')';
    if (!n.fe) {   // bộ lọc SVG riêng của nút, tạo khi cần lần đầu (màu khác kênh)
      const NS = 'http://www.w3.org/2000/svg', doc = this.container.ownerDocument || document;
      if (!this.svg) {
        this.svg = doc.createElementNS(NS, 'svg');
        this.svg.setAttribute('width', '0'); this.svg.setAttribute('height', '0'); this.svg.style.position = 'absolute';
        this.container.appendChild(this.svg);
      }
      const f = doc.createElementNS(NS, 'filter');
      n.filterId = 'an-t' + (++filterSeq);
      f.setAttribute('id', n.filterId); f.setAttribute('color-interpolation-filters', 'sRGB');
      f.setAttribute('x', '0'); f.setAttribute('y', '0'); f.setAttribute('width', '1'); f.setAttribute('height', '1');
      n.fe = doc.createElementNS(NS, 'feColorMatrix'); n.fe.setAttribute('type', 'matrix');
      f.appendChild(n.fe); this.svg.appendChild(f);
    }
    const v = f4(r) + ' 0 0 0 0  0 ' + f4(g) + ' 0 0 0  0 0 ' + f4(b) + ' 0 0  0 0 0 1 0';
    if (n.fv !== v) { n.fv = v; n.fe.setAttribute('values', v); }
    return 'url(#' + n.filterId + ')';
  };
  RigHandle.prototype.write = function () {
    layoutNodes(this.nodes);
    const shadow = this.opts.shadow || '';
    for (const n of this.nodes) {
      const el = n.el;
      if (!el) continue;
      const c = n.cur, st = el.style, vis = n.active && c.en === 1;
      if (!vis) { if (n.sig !== 'x') { st.display = 'none'; n.sig = 'x'; } continue; }
      const sx = n.size[0], sy = n.size[1], kx = n.k[0], ky = n.k[1];
      // Mc = F · Mw · G ; G: toạ độ CSS của hộp → toạ độ nút (y lên, gốc ở pivot); F: lật y
      const G = [1 / kx, 0, 0, -1 / ky, -c.pv[0] * sx, (1 - c.pv[1]) * sy];
      const T = amul(n.m, G), M = [T[0], -T[1], T[2], -T[3], T[4], -T[5]];
      const w = f4(sx * kx), h = f4(sy * ky);
      const tint = this.tint(n);
      const op = f4(n.alpha * c.col[3]);
      const sig = w + ',' + h + ',' + M.map(f4).join(',') + ',' + op + ',' + tint;
      if (sig === n.sig) continue;
      n.sig = sig;
      st.display = '';
      st.width = w + 'px'; st.height = h + 'px';
      st.transform = 'matrix(' + M.map(v => +v.toFixed(5)).join(',') + ')';
      st.opacity = String(op);
      st.filter = (tint + (tint && shadow ? ' ' : '') + shadow) || 'none';
    }
  };
  RigHandle.prototype.destroy = function () {
    for (const p of this._players.slice()) p.destroy();
    if (this.container) {
      for (const n of this.nodes) if (n.el && n.el.parentNode === this.container) this.container.removeChild(n.el);
      if (this.svg && this.svg.parentNode) this.svg.parentNode.removeChild(this.svg);
      if (this.container._anRig === this) delete this.container._anRig;
    }
    for (const n of this.nodes) n.el = null;
  };
  A.rig = (spec, container, opts) => new RigHandle(spec, container, opts);
  A.hasRig = name => !!LIB().rigs[name];
  A.restBoxes = nodes => new RigHandle(nodes, null, null).restBoxes();

  const RECT = {
    'm_AnchoredPosition.x': ['ap', 0], 'm_AnchoredPosition.y': ['ap', 1], 'm_SizeDelta.x': ['sd', 0], 'm_SizeDelta.y': ['sd', 1],
    'm_Pivot.x': ['pv', 0], 'm_Pivot.y': ['pv', 1], 'm_AnchorMin.x': ['an', 0], 'm_AnchorMin.y': ['an', 1], 'm_AnchorMax.x': ['an', 2], 'm_AnchorMax.y': ['an', 3],
    'm_LocalScale.x': ['sc', 0], 'm_LocalScale.y': ['sc', 1], 'm_Color.r': ['col', 0], 'm_Color.g': ['col', 1], 'm_Color.b': ['col', 2], 'm_Color.a': ['col', 3]
  };
  function RigTarget(h, opts) { this.h = h; this.onFloat = opts.onFloat || null; this.q = new Map(); }
  RigTarget.prototype.set = function (path, prop, v, cls) {
    const n = this.h.byPath.get(path);
    if (!n) return;
    const c = n.cur, r = RECT[prop];
    if (r) c[r[0]][r[1]] = v;
    else if (prop === 'm_Alpha') c.cg = v;
    else if (prop === 'm_IsActive') c.on = v >= 0.5 ? 1 : 0;
    else if (prop === 'm_Enabled') { if (cls === 114) c.en = v >= 0.5 ? 1 : 0; }
    else if (prop === 'm_Interactable') c.inter = v >= 0.5 ? 1 : 0;
    else if (prop === 'm_BlocksRaycasts') c.ray = v >= 0.5 ? 1 : 0;
    else if (prop === 'localEulerAnglesRaw.z') c.rz = v;
    else if (prop === 'm_LocalRotation.z') { n._qz = v; c.rz = 2 * Math.atan2(v, n._qw === undefined ? Math.sqrt(Math.max(0, 1 - v * v)) : n._qw) / D2R; }
    else if (prop === 'm_LocalRotation.w') { n._qw = v; if (n._qz !== undefined) c.rz = 2 * Math.atan2(n._qz, v) / D2R; }
    else if (this.onFloat && prop !== 'localEulerAnglesRaw.x' && prop !== 'localEulerAnglesRaw.y' && prop !== 'm_LocalScale.z') this.onFloat(path, prop, v, cls);
  };
  RigTarget.prototype.sprite = function (path, name) {
    const n = this.h.byPath.get(path);
    if (n && n.el && this.h.opts.sprite) { const u = this.h.opts.sprite(name, n); if (u) n.el.src = u; }
  };
  RigTarget.prototype.end = function () { this.h.write(); };
  RigTarget.prototype.rest = function (path, prop, cls) {
    const n = this.h.byPath.get(path);
    if (!n) return undefined;
    const b = n.base, r = RECT[prop];
    if (r) {
      if (r[0] === 'col') return (b.col || [1, 1, 1, 1])[r[1]];
      return b[r[0]][r[1]];
    }
    if (prop === 'm_Alpha') return b.cg === undefined ? 1 : b.cg;
    if (prop === 'm_IsActive') return b.on === 0 ? 0 : 1;
    if (prop === 'm_Enabled' || prop === 'm_Interactable' || prop === 'm_BlocksRaycasts') return 1;
    if (prop === 'localEulerAnglesRaw.z') return b.rz;
    return undefined;
  };

  // ───────────────────────────────────────────────────────────── máy trạng thái
  const live = new Set();
  let raf = 0, lastNow = 0;
  A.paused = false; A.timeScale = 1;
  function tickAll(now) {
    raf = 0;
    const dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 0;
    lastNow = now;
    if (!A.paused) for (const p of Array.from(live)) { p.update(dt * A.timeScale); if (p.idle) live.delete(p); }   // đứng yên thì thôi chạy tới khi set/trigger/play/seek đánh thức
    if (live.size) raf = root.requestAnimationFrame(tickAll); else lastNow = 0;
  }
  function register(p) {
    live.add(p);
    if (!raf && root.requestAnimationFrame) { lastNow = 0; raf = root.requestAnimationFrame(tickAll); }
  }
  A.live = () => Array.from(live);

  function makeTarget(t, opts) {
    if (t == null) return null;
    if (t.isObject3D) return new ThreeTarget(t, opts);
    if (t instanceof RigHandle) return new RigTarget(t, opts);
    if (t._anRig instanceof RigHandle) return new RigTarget(t._anRig, opts);
    if (typeof t.set === 'function') return t;
    throw new Error('animation target not supported (need Object3D, rig, element with rig, or {set})');
  }

  function Player(name, ctrl, target, opts, handle) {
    this.name = name; this.ctrl = ctrl; this.target = target; this.opts = opts; this.handle = handle || null;
    this.speed = opts.speed === undefined ? 1 : opts.speed;
    this.events = 0; this.dead = false; this.spLast = new Map();
    this.dirty = true; this.idle = false; this.auto = false;   // idle: mọi layer đã dừng ở cuối clip không lặp, không có chuyển trạng thái tự động
    this.params = {}; this.ptype = {};
    for (const p of ctrl.params || []) { this.ptype[p[0]] = p[1]; this.params[p[0]] = p[1] === 'float' ? +p[2] : p[1] === 'int' ? p[2] | 0 : !!p[2]; }
    const defs = [{ name: 'Base Layer', weight: 1, default: ctrl.default, states: ctrl.states, transitions: ctrl.transitions }].concat(ctrl.layers || []);
    this.ch = []; const chMap = new Map(); this.clipCh = new Map();
    this.layers = defs.map((def, li) => {
      const L = { def, idx: li, weight: def.weight === undefined ? 1 : def.weight, state: null, next: null, bound: [], bset: new Set(), byFrom: new Map() };
      for (const sn of Object.keys(def.states)) {
        const sd = def.states[sn];
        if (!sd.clip) continue;
        const clip = clipOf(sd.clip);
        if (!this.clipCh.has(sd.clip)) {
          const idx = new Int32Array(clip.curves.length);
          clip.curves.forEach((c, ci) => {
            const key = c.path + '#' + c.prop;
            let id = chMap.get(key);
            if (id === undefined) { id = this.ch.length; chMap.set(key, id); this.ch.push({ path: c.path, prop: c.prop, cls: c.cls }); }
            idx[ci] = id;
          });
          this.clipCh.set(sd.clip, idx);
        }
        for (const id of this.clipCh.get(sd.clip)) if (!L.bset.has(id)) { L.bset.add(id); L.bound.push(id); }
      }
      for (const tr of def.transitions) {
        if (!(tr.from in def.states) && tr.from !== '*') throw new Error('animator transition from unknown state: ' + tr.from + ' (' + name + ')');
        if (!(tr.to in def.states)) throw new Error('animator transition to unknown state: ' + tr.to + ' (' + name + ')');
        for (const c of tr.cond) if (!(c[0] in this.ptype)) throw new Error('animator parameter not found: ' + c[0] + ' (' + name + ')');
      }
      for (const sn of Object.keys(def.states)) {   // chuyển trạng thái áp dụng cho sn: any-state trước, rồi của riêng sn, đúng thứ tự trong tệp
        L.byFrom.set(sn, def.transitions.filter(t => t.from === '*').concat(def.transitions.filter(t => t.from === sn)));
      }
      return L;
    });
    const n = this.ch.length;
    this.fv = new Float64Array(n); this.fh = new Uint8Array(n);
    for (const L of this.layers) { L.av = new Float64Array(n); L.ah = new Uint8Array(n); L.bv = new Float64Array(n); L.bh = new Uint8Array(n); }
    this.restc = new Float64Array(n); this.restok = new Int8Array(n);   // 0 chưa hỏi, 1 có, -1 không có
    for (const L of this.layers) L.state = this._mk(L, L.def.default, 0);
  }
  Player.prototype._mk = function (L, name, t0) {
    const sd = L.def.states[name];
    if (!sd) throw new Error('animator state not found: ' + name + ' (' + this.name + ')');
    return { name, def: sd, clip: sd.clip ? clipOf(sd.clip) : null, cidx: sd.clip ? this.clipCh.get(sd.clip) : null, t: t0, prev: t0 - 1e-9 };
  };
  Player.prototype._sp = function (S) {
    const d = S.def;
    return d.speed * (d.speedParam ? this.params[d.speedParam] : 1);
  };
  Player.prototype.set = function (name, v) {
    const t = this.ptype[name];
    if (t === undefined) throw new Error('animator parameter not found: ' + name + ' (' + this.name + ')');
    this.params[name] = t === 'float' ? +v : t === 'int' ? v | 0 : !!v;
    this._wake();
  };
  Player.prototype._wake = function () {
    this.dirty = true; this.idle = false;
    if (this.auto && !this.dead && !live.has(this)) register(this);
  };
  Player.prototype.get = function (name) {
    if (this.ptype[name] === undefined) throw new Error('animator parameter not found: ' + name + ' (' + this.name + ')');
    return this.params[name];
  };
  Player.prototype.trigger = function (name) { this.set(name, true); };
  Player.prototype.reset = function (name) { this.set(name, false); };
  Player.prototype._cond = function (cond) {
    for (const c of cond) {
      const v = this.params[c[0]];
      switch (c[1]) {
        case 'if': if (!v) return false; break;
        case 'ifnot': if (v) return false; break;
        case 'gt': if (!(v > c[2])) return false; break;
        case 'lt': if (!(v < c[2])) return false; break;
        case 'eq': if (v !== c[2]) return false; break;
        case 'ne': if (v === c[2]) return false; break;
        default: throw new Error('animator condition not supported: ' + c[1]);
      }
    }
    return true;
  };
  // Tìm chuyển trạng thái của L đang chạy từ thời gian pre → S.t (giây trong trạng thái, chưa lặp). Trả {tr, carry} hoặc null.
  Player.prototype._pick = function (L, S, pre) {
    const list = L.byFrom.get(S.name);
    for (const tr of list) {
      if (tr.from === '*' && tr.to === S.name && tr.self === 0) continue;   // CanTransitionToSelf = false
      if (!this._cond(tr.cond)) continue;
      let carry = 0;
      if (tr.exitTime !== null && tr.exitTime !== undefined) {
        const len = S.clip ? S.clip.len : 0;
        if (len > 0) {
          const n0 = pre / len, n1 = S.t / len, ex = tr.exitTime;
          if (S.clip.loop) {
            const k = Math.floor(n1 - ex);
            if (!(k >= 0 && k + ex > n0)) continue;       // phải cắt mốc thoát trong khung này
            carry = (n1 - (k + ex)) * len;
          } else {
            if (n1 < ex) continue;
            if (n0 < ex) carry = (n1 - ex) * len;          // vừa cắt trong khung này; đã qua từ trước thì không dư
          }
        }
      }
      return { tr, carry };
    }
    return null;
  };
  Player.prototype._consume = function (tr) { for (const c of tr.cond) if (c[1] === 'if' && this.ptype[c[0]] === 'trigger') this.params[c[0]] = false; };
  Player.prototype._fire = function (L, S, t0, t1) {
    const clip = S.clip;
    if (!clip || !clip.events || !this.opts.onEvent || t1 < t0) return;
    const len = clip.len;
    if (clip.loop && len > 0) {
      const k0 = Math.floor(Math.max(t0, 0) / len), k1 = Math.floor(t1 / len);
      for (let k = k0; k <= k1 && k - k0 < 8; k++) {
        const lo = k === k0 ? t0 - k * len : -1e-9, hi = (k === k1 ? t1 : (k + 1) * len) - k * len;   // vòng sau: sự kiện t = 0 tính ở vòng đó
        for (const e of clip.events) if (e.t > lo && e.t <= hi) this._emit(L, S, e);
      }
    } else {
      for (const e of clip.events) if (e.t > t0 && e.t <= t1) this._emit(L, S, e);
    }
  };
  Player.prototype._emit = function (L, S, e) {
    this.events++;
    this.opts.onEvent({ fn: e.fn, data: e.data === undefined ? null : e.data, f: e.f || 0, i: e.i || 0, t: e.t, clip: S.def.clip, state: S.name, layer: L.idx }, this);
  };
  Player.prototype._adv = function (L, S, dt) {
    const pre = S.t;
    S.t += dt * this._sp(S);
    this._fire(L, S, S.prev, S.t);
    S.prev = S.t;
    return pre;
  };
  Player.prototype._start = function (L, hit, dtLeft) {
    const tr = hit.tr, sd = L.def.states[tr.to];
    this._consume(tr);
    const len = sd.clip ? clipOf(sd.clip).len : 0;
    const t0 = (tr.offset || 0) * len + hit.carry * sd.speed;
    const ns = this._mk(L, tr.to, t0);
    if (tr.dur > 0) {
      const src = L.state, slen = src.clip ? src.clip.len : 0;
      const dur = tr.fixed === 0 ? tr.dur * (slen || 1) / Math.max(1e-6, Math.abs(this._sp(src)) || 1) : tr.dur;
      L.next = { state: ns, dur, e: 0 };
      if (dtLeft > 0) this._stepTr(L, dtLeft);
    } else {
      L.state = ns; L.next = null;
      if (dtLeft > 0) this._adv(L, ns, dtLeft);
      else this._fire(L, ns, ns.prev, ns.t), ns.prev = ns.t;
    }
  };
  Player.prototype._stepTr = function (L, dt) {
    this._adv(L, L.state, dt);
    this._adv(L, L.next.state, dt);
    L.next.e += dt;
    if (L.next.e >= L.next.dur) { L.state = L.next.state; L.next = null; }
  };
  Player.prototype._step = function (L, dt) {
    if (L.next) { this._stepTr(L, dt); return; }
    let S = L.state;
    let hit = this._pick(L, S, S.t);                  // điều kiện đã thoả (kể cả đã qua exitTime) → chuyển ngay, cả khung chạy ở trạng thái mới
    if (hit) { hit.carry = 0; this._start(L, hit, dt); return; }
    const pre = this._adv(L, S, dt);
    hit = this._pick(L, S, pre);                      // vừa cắt exitTime trong khung này → phần dư chạy ở trạng thái mới
    if (hit) this._start(L, hit, 0);
  };
  Player.prototype._restOf = function (id) {
    if (this.restok[id] === 0) {
      const c = this.ch[id], t = this.target, v = t && t.rest ? t.rest(c.path, c.prop, c.cls) : undefined;
      if (v === undefined) this.restok[id] = -1; else { this.restok[id] = 1; this.restc[id] = v; }
    }
    return this.restok[id] === 1 ? this.restc[id] : undefined;
  };
  // Trộn tư thế của trạng thái S vào (vals, has) của layer L
  Player.prototype._pose = function (L, S, vals, has) {
    for (const id of L.bound) has[id] = 0;
    const clip = S.clip;
    if (clip) {
      const tc = clipTime(clip, S.t), cs = clip.curves, ci = S.cidx;
      for (let i = 0; i < cs.length; i++) { const id = ci[i]; vals[id] = evalCurve(cs[i].keys, tc); has[id] = 1; }
    }
    if (S.def.wd !== 0) {
      for (const id of L.bound) if (!has[id]) { const r = this._restOf(id); if (r !== undefined) { vals[id] = r; has[id] = 1; } }
    }
  };
  Player.prototype.update = function (dt) {
    if (this.dead || (this.idle && !this.dirty)) return;
    dt = dt * this.speed;
    if (dt < 0) dt = 0;
    for (const L of this.layers) this._step(L, dt);
    this._compose();
    this.dirty = false;
    this.idle = this.layers.every(L => this._still(L));
  };
  // Layer đã đứng yên: không chéo, clip không lặp và đã qua hết, không có chuyển trạng thái nào tự đi theo exitTime. Chuyển theo tham số thì set() đánh thức.
  Player.prototype._still = function (L) {
    if (L.next) return false;
    const S = L.state, clip = S.clip;
    if (clip && ((clip.loop && clip.len > 0) || S.t < clip.len)) return false;   // clip lặp dài 0 s là tư thế tĩnh
    for (const tr of L.byFrom.get(S.name)) if (tr.exitTime !== null && tr.exitTime !== undefined) return false;
    return true;
  };
  Player.prototype._compose = function () {
    const fv = this.fv, fh = this.fh, tg = this.target;
    fh.fill(0);
    for (const L of this.layers) {
      const w = L.weight;
      if (w <= 0) continue;
      this._pose(L, L.state, L.av, L.ah);
      let pv = L.av, ph = L.ah;
      if (L.next) {
        this._pose(L, L.next.state, L.bv, L.bh);
        const k = clamp01(L.next.e / L.next.dur);
        for (const id of L.bound) {
          if (L.ah[id] && L.bh[id]) L.av[id] += (L.bv[id] - L.av[id]) * k;
          else if (L.bh[id]) { L.av[id] = L.bv[id]; L.ah[id] = 1; }
        }
      }
      for (const id of L.bound) {
        if (!ph[id]) continue;
        if (!fh[id] || w >= 1) fv[id] = pv[id]; else fv[id] += (pv[id] - fv[id]) * w;
        fh[id] = 1;
      }
    }
    if (!tg) return;
    const ch = this.ch;
    for (let id = 0; id < ch.length; id++) if (fh[id]) tg.set(ch[id].path, ch[id].prop, fv[id], ch[id].cls);
    // sprite (m_PPtrCurves): khoá bậc thang theo thời gian của trạng thái đầu layer 0 không chéo
    if (tg.sprite) {
      for (const L of this.layers) {
        const S = L.state, cl = S.clip;
        if (!cl || !cl.sprites) continue;
        const tc = clipTime(cl, S.t);
        for (const sp of cl.sprites) {
          let name = null;
          for (const k of sp.keys) if (k[0] <= tc) name = k[1];
          const key = L.idx + ':' + sp.path + ':' + sp.prop;
          if (name !== null && this.spLast.get(key) !== name) { this.spLast.set(key, name); tg.sprite(sp.path, name); }
        }
      }
    }
    if (tg.end) tg.end();
  };
  Player.prototype.state = function (li) {
    const L = this.layers[li || 0], S = L.state, len = S.clip ? S.clip.len : 0;
    return { name: S.name, t: S.t, n: len > 0 ? S.t / len : 0, clip: S.def.clip, next: L.next ? L.next.state.name : null };
  };
  Player.prototype.play = function (name, norm, li) {
    const L = this.layers[li || 0], sd = L.def.states[name];
    if (!sd) throw new Error('animator state not found: ' + name + ' (' + this.name + ')');
    const len = sd.clip ? clipOf(sd.clip).len : 0;
    L.next = null;
    L.state = this._mk(L, name, (norm || 0) * len);
    this._wake();
    this._compose();
  };
  Player.prototype.seek = function (sec, li) {
    const L = this.layers[li || 0];
    L.next = null;
    L.state.t = sec; L.state.prev = sec;
    this._wake();
    this._compose();
  };
  Player.prototype.destroy = function () {
    this.dead = true; live.delete(this);
    if (this.handle) { const i = this.handle._players.indexOf(this); if (i >= 0) this.handle._players.splice(i, 1); }
  };

  A.bind = function (target, ctrlName, opts) {
    opts = opts || {};
    const ctrl = typeof ctrlName === 'string' ? LIB().controllers[ctrlName] : ctrlName;
    if (!ctrl) throw new Error('animator controller not found: ' + ctrlName);
    let handle = null;
    if (target instanceof RigHandle) handle = target; else if (target && target._anRig instanceof RigHandle) handle = target._anRig;
    const tg = makeTarget(target, opts);
    const p = new Player(typeof ctrlName === 'string' ? ctrlName : (ctrl.name || 'controller'), ctrl, tg, opts, handle);
    p.missing = tg && tg.missing ? tg.missing : [];
    if (handle) handle._players.push(p);
    if (opts.init !== false) p.update(0);
    p.auto = !!(handle && opts.auto !== false) || opts.auto === true;
    if (p.auto && !p.idle) register(p);
    return p;
  };
  A.addClip = (name, clip) => { LIB().clips[name] = clip; };
  A.addController = (name, ctrl) => { LIB().controllers[name] = ctrl; };
  A.addRig = (name, rig) => { LIB().rigs[name] = rig; };

  root.DRAnim = A;
})(typeof window !== 'undefined' ? window : globalThis);
