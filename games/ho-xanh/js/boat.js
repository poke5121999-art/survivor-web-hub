// Pha boat: cano của Dave tự chạy từ quán sushi ra Hố Xanh (args.dir 'out' → loading) hoặc từ chỗ lặn về quán
// ('home' → kitchen) — cắt cảnh tự phát, không có phím/nút lái nào. Chuyến là danh sách đoạn TRIP (xem khối TRIP bên dưới).
// Cảnh riêng (surface 'scene'): cano, biển sảnh, trời, mây, trăng, dừa, mòng biển, Dave và hạt VFX đều là asset gốc trong data/boat_assets.js.
// Chuyến ra chạy buổi chiều (DayTime 1, Lobby_Day), chuyến về chạy buổi tối (DayTime 2, Lobby_Evening) vì quán mở lúc tối.
// Hệ toạ độ: manifest ghi theo Unity (z vào màn hình), three thì z hướng ra camera, nên mọi toạ độ Unity đổi z → −z (U2T).
// Mọi shader (trời Skycube, vòng sương Sky_Inner, nước DaveWater, mây Cloud, trăng, 2D_Sprite_Uber, hạt ProjectDR/VFX/*) viết lại
// từ hợp ngữ DXBC gỡ ra khỏi bản gốc (tools/README-boat.md, mục "Shader"). Cảnh vẽ trên màu tuyến tính như URP gốc.
(function (HX) {
  'use strict';
  var B = window.HX_BOAT_ASSETS, L = B.lobby;
  var REV = ((document.currentScript && document.currentScript.src.split('v=')[1]) || '').split('&')[0];
  function url(rel) { return rel + (REV ? '?v=' + REV : ''); }

  // ---------------------------------------------------------------- số liệu
  function U2T(v) { return [v[0], v[1], -v[2]]; }
  function qU2T(q) { return [-q[0], -q[1], q[2], q[3]]; }
  var TIME_OF = { out: 'day', home: 'evening' };           // [ĐỀ XUẤT] chuyến về lúc tối: quán mở buổi tối
  var HEIGHT_OFF = B.sea.boatScene.floatingTransform.heightOffset; // [DtD] cano ngồi thấp hơn mặt sóng 0,2
  var LOBBY = U2T(B.sea.boatScene.pos);                        // [DtD] chỗ cano đậu cạnh quán sushi
  var CAM0 = U2T(B.sea.camera.pos), CAMF = U2T(B.sea.camera.forward); // [DtD] camera sảnh, fov 50
  var PL = L.player;                                           // [DtD] LobbyPlayer: tốc độ đi 2,7 m/s, vùng đi trên boong, mờ màn khi lặn
  var DAVE_LOCAL = [B.sea.boatScene.davePos[0] - B.sea.boatScene.pos[0], B.sea.boatScene.davePos[1] - B.sea.boatScene.pos[1],
    -(B.sea.boatScene.davePos[2] - B.sea.boatScene.pos[2])];  // [DtD] Dave đứng ở boong đuôi
  var WALK_X = PL.moveAreaBoat[1];                             // [DtD] mép đuôi của m_MoveArea (x +4,72 so với gốc cano)
  var DAVE_H = B.dave.cell[0] / B.dave.ppu * B.sea.boatScene.daveScale; // 0,64 m × 3,4


  // Anim gốc của cano (Animator Boat_001), lấy mẫu 30 khung/giây: Idle001 nhấp nhô, Exit001 rời chỗ đậu, Exit002 rời chỗ đậu rẽ vào phía xa.
  // posOffset = độ dời tính từ đầu clip (hai clip cùng bắt đầu ở chỗ đậu, không nối tiếp nhau), euler = độ.
  var CLIP = B.boat.anims;
  var IDLE = CLIP.Boat_Idle001.tracks[''].posOffset;           // nhấp nhô 3,5 s
  var FPS = CLIP.Boat_Idle001.fps;
  var DEG = Math.PI / 180;

  // ---------------------------------------------------------------- chuyến: danh sách đoạn, một bộ phát
  // Bản gốc không có cảnh cano chạy giữa quán và chỗ lặn (lobby.trip.note): rời sảnh đi quán chỉ phát Boat_Exit001
  // rồi tối màn sau 1,5 s. Nhưng camera sảnh gốc thấy cả hai nơi: cano đậu gần camera (chỗ lặn), quán sushi nằm xa
  // phía sau bên phải. Chuyến đi được dựng trong đúng khung đó, ghép từ chuyển động gốc:
  //  - Boat_Exit001 / Boat_Exit002 (Animator Boat_001 của cano Dave): rời chỗ đậu. Exit002 là bản rẽ vào phía xa.
  //  - Lobby_GuestBoat01_Exit01 / Enter01 (thuyền khách của quán): lùi khỏi bến quán rồi chạy về phía camera; chạy
  //    từ phía camera vào bến quán. Cùng quy ước mũi −x như cano Dave.
  //  - Đoạn nối giữa hai chuyển động gốc là đường cong Hermite qua điểm [ĐỀ XUẤT], tốc độ đổi đều từ đoạn trước sang
  //    đoạn sau.
  // Mỗi đoạn: { id, kind, cam, ... }. kind: hold (đứng yên ở at hoặc chỗ cũ, rev = rung máy theo khoá Exit001),
  // guest (đường thế giới của clip thuyền khách từ from tới to), clip (khoá cano Dave, tiến từ chỗ cũ hoặc lùi thời gian
  // để dừng đúng at), link (nối). Toạ độ trong khối này là hệ Unity (x, z), góc = độ quanh Y, mũi = (−cos, sin).
  // ==== TRIP
  var TD = L.trip;
  var LOBBY_U = { x: B.sea.boatScene.pos[0], z: B.sea.boatScene.pos[2], yaw: 0 };   // [DtD] chỗ cano đậu ở sảnh = chỗ lặn
  var EXIT1 = CLIP.Boat_Exit001.tracks[''];
  var REV_LEN = (function () {   // [DtD] đầu Exit001 cano đứng rung máy tại chỗ (~1,1 s) rồi mới nhích
    var P = EXIT1.posOffset, i = 0;
    while (i < P.length && Math.abs(P[i][0]) < 0.01) i++;
    return Math.max(0, i - 1) / FPS;
  })();
  var TRIP = {
    out: [
      { id: 'rev', kind: 'hold', at: 'dock', dur: REV_LEN, rev: true, cam: 'lobby' },
      { id: 'leave', kind: 'guest', clip: 'Lobby_GuestBoat01_Exit01', from: 0, to: 7.5, cam: 'lobby' },   // [ĐỀ XUẤT] to: đã quay mũi hẳn về phía camera
      { id: 'cruise', kind: 'link', turnR: 16, cam: 'lobby' },                                              // [ĐỀ XUẤT] bán kính quay 16 m
      { id: 'arrive', kind: 'clip', clip: 'Boat_Exit001', reverse: true, at: 'mooring', cam: 'lobby' },
    ],
    home: [
      { id: 'respawn', kind: 'hold', at: 'mooring', dur: B.dave.anims.Respawn.length, cam: 'lobby' },
      { id: 'depart', kind: 'clip', clip: 'Boat_Exit002', cam: 'lobby' },
      { id: 'cruise', kind: 'link', turnR: 16, cam: 'lobby' },                                              // [ĐỀ XUẤT] bán kính quay 16 m
      { id: 'arrive', kind: 'guest', clip: 'Lobby_GuestBoat01_Enter01', from: 5, to: 'end', cam: 'lobby' }, // [ĐỀ XUẤT] from: nhập đường gốc khi đã hướng về quán
    ],
  };
  function wrapDeg(a) { a = (a + 180) % 360; return (a < 0 ? a + 360 : a) - 180; }
  function yawOfDir(dx, dz) { return Math.atan2(dz, -dx) / DEG; }
  function rotU(th, x, z, out) { var c = Math.cos(th * DEG), s = Math.sin(th * DEG); out[0] = x * c + z * s; out[1] = -x * s + z * c; return out; }
  function anchorPose(name) { return name === 'dock' ? { x: TD.dock.pos[0], z: TD.dock.pos[1], yaw: TD.dock.yaw } : LOBBY_U; }
  function pose0() { return { x: 0, z: 0, yaw: 0, roll: 0, pitch: 0, heave: 0 }; }
  var tmpO = [0, 0, 0], tmpE = [0, 0, 0], tmpR = [0, 0];
  // Bộ lấy mẫu của một đoạn: { dur, at(t, pose) }. start = tư thế cuối đoạn trước (đoạn có at/guest không cần).
  function segSampler(sg, start) {
    if (sg.kind === 'hold') {
      var p = sg.at ? anchorPose(sg.at) : start;
      return { dur: sg.dur, at: function (t, o) {
        o.x = p.x; o.z = p.z; o.yaw = p.yaw; o.roll = o.pitch = o.heave = 0;
        if (sg.rev) { sampleTrack(EXIT1.euler, t, tmpE); o.roll = tmpE[0]; o.pitch = tmpE[2]; o.heave = sampleTrack(EXIT1.posOffset, t, tmpO)[1]; }
        return o;
      } };
    }
    if (sg.kind === 'guest') {
      var G = TD.guest[sg.clip], t0 = sg.from, t1 = sg.to === 'end' ? G.moveEnd : sg.to;
      return { dur: t1 - t0, at: function (t, o) {
        var f = clamp((t0 + t) * G.fps, 0, G.pos.length - 1), i = Math.floor(f), j = Math.min(G.pos.length - 1, i + 1), k = f - i;
        o.x = lerp(G.pos[i][0], G.pos[j][0], k); o.z = lerp(G.pos[i][1], G.pos[j][1], k);
        o.yaw = G.yaw[i] + wrapDeg(G.yaw[j] - G.yaw[i]) * k; o.roll = o.pitch = o.heave = 0;
        return o;
      } };
    }
    if (sg.kind === 'clip') {
      var C = CLIP[sg.clip].tracks[''], T = CLIP[sg.clip].length, a = sg.reverse ? anchorPose(sg.at) : start;
      return { dur: sg.reverse ? T : Math.min(T, sg.to || T), at: function (t, o) {
        // tiến: tư thế = đầu + xoay(khoá(t)); lùi thời gian: dừng đúng a, vận tốc cùng chiều mũi, hồ sơ tốc độ đảo
        var u = sg.reverse ? T - t : t;
        sampleTrack(C.posOffset, u, tmpO); sampleTrack(C.euler, u, tmpE);
        rotU(a.yaw, tmpO[0], tmpO[2], tmpR);
        var sgn = sg.reverse ? -1 : 1;
        o.x = a.x + sgn * tmpR[0]; o.z = a.z + sgn * tmpR[1]; o.yaw = a.yaw + sgn * tmpE[1];
        o.roll = tmpE[0]; o.pitch = tmpE[2]; o.heave = tmpO[1];
        return o;
      } };
    }
    throw new Error('segment kind not found: ' + sg.kind);
  }
  // Đoạn nối [ĐỀ XUẤT]: đường Dubins (cung – thẳng – cung, bán kính quay sg.turnR) từ tư thế cuối đoạn gốc trước tới tư thế
  // đầu đoạn gốc sau, chọn đường ngắn nhất trong LSL/RSR/LSR/RSL. Tốc độ theo quãng: tăng/giảm với gia tốc ACC từ va lên
  // TOP rồi xuống vb (ACC, TOP đo từ Boat_Exit001). Góc mũi = hướng chạy + độ lệch trôi của hai đầu nội suy dần.
  var EXIT1_V = (function () {   // tốc độ từng khung của Boat_Exit001 (m/s)
    var P = EXIT1.posOffset, v = [0];
    for (var i = 1; i < P.length; i++) v.push(Math.hypot(P[i][0] - P[i - 1][0], P[i][2] - P[i - 1][2]) * FPS);
    return v;
  })();
  var TOP = Math.max.apply(null, EXIT1_V);   // [DtD] ~10,1 m/s: tốc độ cao nhất của cano Dave khi rời sảnh (Boat_Exit001)
  var ACC = (function () {                   // [DtD] gia tốc trung bình từ lúc nhích tới 90% TOP trong Boat_Exit001 (~5 m/s²)
    var i0 = 0, i1 = 0;
    while (i0 < EXIT1_V.length && EXIT1_V[i0] < 0.1) i0++;
    i1 = i0; while (i1 < EXIT1_V.length && EXIT1_V[i1] < 0.9 * TOP) i1++;
    return EXIT1_V[i1] / Math.max(1 / FPS, (i1 - i0) / FPS);
  })();
  function dubins(a, pa, b, pb, R) {   // a, b: [x, z]; pa, pb: góc hướng chạy (rad, toán học trên mặt x–z)
    var TAU = Math.PI * 2, best = null;
    function mod(x) { x %= TAU; return x < 0 ? x + TAU : x; }
    function ctr(p, phi, s) { return [p[0] - s * R * Math.sin(phi), p[1] + s * R * Math.cos(phi)]; }   // s = +1 trái, −1 phải
    [['L', 'L'], ['R', 'R'], ['L', 'R'], ['R', 'L']].forEach(function (w) {
      var s0 = w[0] === 'L' ? 1 : -1, s1 = w[1] === 'L' ? 1 : -1, c0 = ctr(a, pa, s0), c1 = ctr(b, pb, s1);
      var dx = c1[0] - c0[0], dz = c1[1] - c0[1], d = Math.hypot(dx, dz), beta = Math.atan2(dz, dx), l, psi;
      if (s0 === s1) { l = d; psi = beta; }
      else { if (d < 2 * R) return; l = Math.sqrt(d * d - 4 * R * R); psi = beta + s0 * Math.atan2(2 * R, l); }
      var a0 = s0 > 0 ? mod(psi - pa) : mod(pa - psi), a1 = s1 > 0 ? mod(pb - psi) : mod(psi - pb), len = R * (a0 + a1) + l;
      if (!best || len < best.len) best = { len: len, parts: [[s0, R * a0], [0, l], [s1, R * a1]] };
    });
    return best;
  }
  function linkSampler(a, va, da, b, vb, db, R) {
    var pa = Math.atan2(da[1], da[0]), pb = Math.atan2(db[1], db[0]), path = dubins([a.x, a.z], pa, [b.x, b.z], pb, R);
    if (!path) throw new Error('link path not found');
    var S = [0], X = [a.x], Z = [a.z], H = [pa], x = a.x, z = a.z, h = pa, STEP = 0.25;
    path.parts.forEach(function (pt) {
      var n = Math.max(1, Math.ceil(pt[1] / STEP)), du = pt[1] / n;
      for (var k = 0; k < n; k++) {
        if (pt[0]) {
          var cx = x - pt[0] * R * Math.sin(h), cz = z + pt[0] * R * Math.cos(h);
          h += pt[0] * du / R; x = cx + pt[0] * R * Math.sin(h); z = cz - pt[0] * R * Math.cos(h);
        } else { x += du * Math.cos(h); z += du * Math.sin(h); }
        S.push(S[S.length - 1] + du); X.push(x); Z.push(z); H.push(h);
      }
    });
    var Ltot = S[S.length - 1], vtop = Math.max(TOP, va, vb);
    function vAt(s) { return Math.max(0.5, Math.min(vtop, Math.sqrt(va * va + 2 * ACC * s), Math.sqrt(vb * vb + 2 * ACC * Math.max(0, Ltot - s)))); }
    var TS = [0], SS = [0], t = 0, s = 0, dt = 1 / 240;   // bảng thời gian → quãng
    while (s < Ltot) { s = Math.min(Ltot, s + vAt(s) * dt); t += dt; TS.push(t); SS.push(s); }
    var off0 = wrapDeg(a.yaw - yawOfDir(da[0], da[1])), off1 = wrapDeg(b.yaw - yawOfDir(db[0], db[1]));
    function find(arr, v) { var lo = 0, hi = arr.length - 1; while (hi - lo > 1) { var m = (lo + hi) >> 1; if (arr[m] <= v) lo = m; else hi = m; } return lo; }
    return { dur: t, len: Ltot, at: function (tt, o) {
      var j = find(TS, tt), jj = Math.min(TS.length - 1, j + 1), ss = lerp(SS[j], SS[jj], clamp((tt - TS[j]) / ((TS[jj] - TS[j]) || 1), 0, 1));
      var i = find(S, ss), ii = Math.min(S.length - 1, i + 1), f = clamp((ss - S[i]) / ((S[ii] - S[i]) || 1), 0, 1), hh = lerp(H[i], H[ii], f);
      o.x = lerp(X[i], X[ii], f); o.z = lerp(Z[i], Z[ii], f);
      o.yaw = yawOfDir(Math.cos(hh), Math.sin(hh)) + lerp(off0, off1, ss / Ltot);
      o.roll = o.pitch = o.heave = 0;
      return o;
    } };
  }
  // Dựng cả chuyến thành dãy khung 30/giây: x, z, yaw (Unity), roll/pitch (độ), heave (m), v (m/s), seg (chỉ số đoạn).
  function buildTrack(dir) {
    var spec = TRIP[dir], F = { x: [], z: [], yaw: [], roll: [], pitch: [], heave: [], seg: [], segs: [] }, o = pose0();
    function last() { var k = F.x.length - 1; return { x: F.x[k], z: F.z[k], yaw: F.yaw[k] }; }
    function velEnd() {   // hướng + tốc độ ở cuối dãy đã dựng
      var k = F.x.length - 1, dx = F.x[k] - F.x[k - 1], dz = F.z[k] - F.z[k - 1], v = Math.hypot(dx, dz);
      return v > 1e-4 ? { v: v * FPS, d: [dx / v, dz / v] } : { v: 0, d: [-Math.cos(F.yaw[k] * DEG), Math.sin(F.yaw[k] * DEG)] };
    }
    function velStart(sm) {
      var p = sm.at(0, pose0()), q = sm.at(1 / FPS, pose0()), dx = q.x - p.x, dz = q.z - p.z, v = Math.hypot(dx, dz);
      return { p: p, v: v * FPS, d: v > 1e-4 ? [dx / v, dz / v] : [-Math.cos(p.yaw * DEG), Math.sin(p.yaw * DEG)] };
    }
    function push(sm, k, skipFirst) {
      var n = Math.max(1, Math.round(sm.dur * FPS));
      F.segs[k].i0 = F.x.length - (skipFirst ? 1 : 0);
      for (var f = skipFirst ? 1 : 0; f <= n; f++) {
        sm.at(sm.dur * f / n, o);
        F.x.push(o.x); F.z.push(o.z); F.yaw.push(o.yaw); F.roll.push(o.roll); F.pitch.push(o.pitch); F.heave.push(o.heave); F.seg.push(k);
      }
      F.segs[k].i1 = F.x.length - 1; F.segs[k].n = n; F.segs[k].dur = sm.dur;
    }
    for (var k = 0; k < spec.length; k++) {
      var sg = spec[k];
      F.segs.push({ id: sg.id, kind: sg.kind, cam: sg.cam, clip: sg.clip || null });
      if (sg.kind === 'link') {
        var nx = spec[k + 1], ns = segSampler(nx, null), e = velEnd(), s0 = velStart(ns);
        var ls = linkSampler(last(), e.v, e.d, s0.p, s0.v, s0.d, sg.turnR);
        push(ls, k, true);
        F.segs.push({ id: nx.id, kind: nx.kind, cam: nx.cam, clip: nx.clip || null });
        push(ns, ++k, true);
      } else push(segSampler(sg, F.x.length ? last() : null), k, F.x.length > 0);
    }
    var n = F.x.length, cum = [0], v = [0], vmax = 0;
    for (var i = 1; i < n; i++) {
      var d = Math.hypot(F.x[i] - F.x[i - 1], F.z[i] - F.z[i - 1]);
      cum.push(cum[i - 1] + d); v.push(d * FPS); vmax = Math.max(vmax, d * FPS);
    }
    F.n = n; F.cum = cum; F.v = v; F.len = cum[n - 1]; F.vmax = vmax; F.dur = (n - 1) / FPS;
    return F;
  }
  // ==== /TRIP

  // ---------------------------------------------------------------- tiện ích
  function lerp(a, b, k) { return a + (b - a) * k; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lin1(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }  // sRGB → tuyến tính (Color.linear của Unity)
  function linV(c) { return new THREE.Vector3(lin1(c[0]), lin1(c[1]), lin1(c[2])); }
  function sampleTrack(tr, t, out) {
    var f = clamp(t * FPS, 0, tr.length - 1), i = Math.floor(f), j = Math.min(tr.length - 1, i + 1), k = f - i;
    for (var c = 0; c < 3; c++) out[c] = lerp(tr[i][c], tr[j][c], k);
    return out;
  }
  function curveAt(c, t) {
    if (t <= c[0][0]) return c[0][1];
    for (var i = 1; i < c.length; i++) if (t <= c[i][0]) {
      var a = c[i - 1], b = c[i];
      return a[1] + (b[1] - a[1]) * ((t - a[0]) / ((b[0] - a[0]) || 1));
    }
    return c[c.length - 1][1];
  }
  // Số trong công thức VFX: hằng | [a, b] ngẫu nhiên | {curve, mul} | {min, max, mul}. t chuẩn hoá 0..1, r ngẫu nhiên cố định của hạt.
  function num(v, t, r) {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    if (Array.isArray(v)) return v[0] + (v[1] - v[0]) * r;
    if (v.curve) return (v.curve.length ? curveAt(v.curve, t) : 1) * (v.mul == null ? 1 : v.mul);
    if (v.min && v.max) { var a = curveAt(v.min, t), b = curveAt(v.max, t); return (a + (b - a) * r) * (v.mul == null ? 1 : v.mul); }
    return 0;
  }
  function gradAt(g, t, out) {
    var c = g.color, i, k;
    out[0] = c[c.length - 1][1]; out[1] = c[c.length - 1][2]; out[2] = c[c.length - 1][3];
    if (t <= c[0][0]) { out[0] = c[0][1]; out[1] = c[0][2]; out[2] = c[0][3]; }
    else for (i = 1; i < c.length; i++) if (t <= c[i][0]) {
      k = (t - c[i - 1][0]) / ((c[i][0] - c[i - 1][0]) || 1);
      out[0] = lerp(c[i - 1][1], c[i][1], k); out[1] = lerp(c[i - 1][2], c[i][2], k); out[2] = lerp(c[i - 1][3], c[i][3], k);
      break;
    }
    out[3] = curveAt(g.alpha, t);
    return out;
  }
  var tmpA = [0, 0, 0, 0], tmpB = [0, 0, 0, 0];
  function colorAt(v, t, r, out) {
    if (!v) { out[0] = out[1] = out[2] = out[3] = 1; return out; }
    if (Array.isArray(v)) { out[0] = v[0]; out[1] = v[1]; out[2] = v[2]; out[3] = v[3]; return out; }
    if (v.random) { for (var i = 0; i < 4; i++) out[i] = lerp(v.random[0][i], v.random[1][i], r); return out; }
    if (v.gradient) return gradAt(v.gradient, t, out);
    if (v.randomGradient) {
      gradAt(v.randomGradient[0], t, tmpA); gradAt(v.randomGradient[1], t, tmpB);
      for (var j = 0; j < 4; j++) out[j] = lerp(tmpA[j], tmpB[j], r);
      return out;
    }
    out[0] = out[1] = out[2] = out[3] = 1; return out;
  }
  // Euler Unity (độ, thứ tự Z → X → Y) xoay véc-tơ.
  function eulerU(rot, v) {
    if (!rot || (!rot[0] && !rot[1] && !rot[2])) return v;
    var d = Math.PI / 180, x = v[0], y = v[1], z = v[2], c, s, t;
    if (rot[2]) { c = Math.cos(rot[2] * d); s = Math.sin(rot[2] * d); t = x * c - y * s; y = x * s + y * c; x = t; }
    if (rot[0]) { c = Math.cos(rot[0] * d); s = Math.sin(rot[0] * d); t = y * c - z * s; z = y * s + z * c; y = t; }
    if (rot[1]) { c = Math.cos(rot[1] * d); s = Math.sin(rot[1] * d); t = x * c + z * s; z = -x * s + z * c; x = t; }
    v[0] = x; v[1] = y; v[2] = z;
    return v;
  }
  function hermite(keys, t, out) {   // khoá Hermite của anim legacy: [t, px,py,pz, inTan(3), outTan(3)]
    var n = keys.length;
    if (t <= keys[0][0]) { out[0] = keys[0][1]; out[1] = keys[0][2]; out[2] = keys[0][3]; return out; }
    for (var i = 1; i < n; i++) if (t <= keys[i][0]) {
      var a = keys[i - 1], b = keys[i], dt = b[0] - a[0], s = (t - a[0]) / (dt || 1), s2 = s * s, s3 = s2 * s;
      var h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
      for (var c = 0; c < 3; c++) out[c] = h00 * a[1 + c] + h10 * dt * a[7 + c] + h01 * b[1 + c] + h11 * dt * b[4 + c];
      return out;
    }
    var l = keys[n - 1]; out[0] = l[1]; out[1] = l[2]; out[2] = l[3]; return out;
  }
  // ---------------------------------------------------------------- sóng DaveWater (đỉnh), dùng chung cho shader nước và cano dò mặt sóng
  // [DtD] gỡ từ vertex shader DaveWater (biến thể _WAVES): tổng sin/cos 4 hướng, lặp _WaveCount+1 lần, tần số nhân dần.
  function waveParams(W) {
    var F = W.floats, C = W.colors;
    return { h: F._WaveHeight, dist: F._WaveDistance, speed: F._WaveSpeed, steep: F._WaveSteepness, count: Math.max(1, F._WaveCount | 0),
      dir: C._WaveDirection, anim: C._AnimationParams };
  }
  function waveAt(WP, xu, zu, t, out) {   // xu, zu: toạ độ Unity. out: [dx, dy, dz] (m)
    var d = WP.dir, a = WP.anim, tv = t * a[2];
    var r4 = [tv * a[0] * WP.speed * 1.2, tv * a[1] * WP.speed * 1.375, tv * a[0] * WP.speed * 1.1, tv * a[1] * WP.speed * 1.0];
    var f0 = 1 - WP.dist, fr = [f0 * 3.9, f0 * 4.05, f0 * 3.75, f0 * 3.75];
    var r6 = [d[0] * 0.3, d[1] * 0.85, d[2] * 0.85, d[3] * 0.25], r7 = [d[0] * 0.1, d[1] * 0.9, d[2] * -0.5, d[3] * -0.5];
    var st = WP.steep * 12 * (4 * Math.floor(1 / WP.count) + 1);
    var A = [r6[0] * st * 0.3, r6[1] * st * 0.3, r6[2] * st * 0.35, r6[3] * st * 0.35];
    var Bq = [r7[0] * st * 0.25, r7[2] * st * 0.25, r7[1] * st * 0.25, r7[3] * st * 0.25];
    var ph = [r6[0] * xu + r6[1] * zu, r6[2] * xu + r6[3] * zu, r7[0] * xu + r7[1] * zu, r7[2] * xu + r7[3] * zu];
    var dx = 0, dy = 0, dz = 0;
    for (var i = 0; i <= WP.count; i++) {
      var m = i / WP.count + 1;
      for (var k = 0; k < 4; k++) fr[k] *= m;
      var s0 = [], c0 = [];
      for (k = 0; k < 4; k++) { var ar = fr[k] * ph[k] + r4[k]; s0.push(Math.sin(ar)); c0.push(Math.cos(ar)); }
      dx += c0[0] * A[0] + c0[1] * A[2] + c0[2] * Bq[0] + c0[3] * Bq[1];
      dz += c0[0] * A[1] + c0[1] * A[3] + c0[2] * Bq[2] + c0[3] * Bq[3];
      dy += s0[0] * 0.3 + s0[1] * 0.35 + s0[2] * 0.25 + s0[3] * 0.25;
    }
    out[0] = dx * 0.02 * WP.h; out[1] = dy / WP.count * WP.h; out[2] = dz * 0.02 * WP.h;
    return out;
  }
  var WAVE_GLSL = [
    'uniform float uWH, uWDist, uWSpeed, uWSteep, uWCount; uniform vec4 uWDir, uAnim;',
    // trả về (dx, dy, dz) theo mét (hệ Unity) và h = tổng sin chuẩn hoá cho lớp tô theo sóng
    'vec3 hxWave(vec2 p, float t, out float h) {',
    '  float tv = t * uAnim.z; vec4 r4 = vec4(tv * uAnim.x, tv * uAnim.y, tv * uAnim.x, tv * uAnim.y) * uWSpeed * vec4(1.2, 1.375, 1.1, 1.0);',
    '  vec4 fr = (1.0 - uWDist) * vec4(3.9, 4.05, 3.75, 3.75);',
    '  vec4 r6 = uWDir * vec4(0.3, 0.85, 0.85, 0.25), r7 = uWDir * vec4(0.1, 0.9, -0.5, -0.5);',
    '  float st = uWSteep * 12.0 * (4.0 * floor(1.0 / uWCount) + 1.0);',
    '  vec4 A = r6 * st * vec4(0.3, 0.3, 0.35, 0.35); vec4 Bq = r7.xzyw * st * 0.25;',
    '  vec4 ph = vec4(dot(r6.xy, p), dot(r6.zw, p), dot(r7.xy, p), dot(r7.zw, p));',
    '  vec3 d = vec3(0.0); h = 0.0;',
    '  for (int i = 0; i < 8; i++) { if (float(i) > uWCount) break;',
    '    fr *= float(i) / uWCount + 1.0; vec4 a = fr * ph + r4; vec4 s = sin(a), c = cos(a);',
    '    d.x += dot(c, vec4(A.x, A.z, Bq.x, Bq.y)); d.z += dot(c, vec4(A.y, A.w, Bq.z, Bq.w)); d.y += dot(s, vec4(0.3, 0.35, 0.25, 0.25)); }',
    '  h = d.y / uWCount; return vec3(d.x * 0.02 * uWH, h * uWH, d.z * 0.02 * uWH); }',
  ].join('\n');

  // ---------------------------------------------------------------- GLSL chung: màu, sương, đèn (URP)
  var COMMON_GLSL = [
    'vec3 hxLin(vec3 c) { c = max(c, 0.0); return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }',
    'uniform vec3 uFogCol; uniform vec2 uFogP;',   // uFogP = (1/(end−start), end/(end−start)): sương tuyến tính của Unity
    'float hxFog(float z) { return clamp(uFogP.y - z * uFogP.x, 0.0, 1.0); }',
    'uniform vec3 uAmbCol; uniform vec3 uMainDir; uniform vec3 uMainCol;',
    'uniform int uAddN; uniform vec4 uAddPos[8]; uniform vec3 uAddCol[8]; uniform vec4 uAddAtt[8]; uniform vec3 uAddDir[8];',
    'uniform float uMainOn; uniform float uAddOn[8];',
    // URP: 1/d² × (1 − (d²/r²)²)², nhân nón đèn saturate(dot(spotDir, L) × a + b)²
    'float hxAtt(int i, vec3 W, out vec3 L) { vec4 p = uAddPos[i]; vec3 d = p.xyz - W * p.w; float d2 = max(dot(d, d), 6.1e-5);',
    '  L = d * inversesqrt(d2); float f = d2 * uAddAtt[i].x; f = max(1.0 - f * f, 0.0); float s = clamp(dot(uAddDir[i], L) * uAddAtt[i].z + uAddAtt[i].w, 0.0, 1.0);',
    '  return f * f / d2 * s * s; }',
  ].join('\n');

  // ---------------------------------------------------------------- nạp asset (giữ lại cho các chuyến sau)
  var assets = null, loading = null;
  var texLoader = null;
  function loadTex(rel, pixel) {
    return new Promise(function (res, rej) {
      texLoader = texLoader || new THREE.TextureLoader();
      texLoader.load(url(rel), function (t) {
        t.magFilter = pixel ? THREE.NearestFilter : THREE.LinearFilter;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.generateMipmaps = true;
        res(t);
      }, undefined, function () { rej(new Error('image not found: ' + rel)); });
    });
  }
  function loadCube(faces) {
    return new Promise(function (res, rej) {
      new THREE.CubeTextureLoader().load(faces.map(url), function (t) {
        // mặt cube xuất theo thứ tự Unity +X −X +Y −Y +Z −Z, hàng đầu ảnh = t 0; three không lật ảnh cube
        t.flipY = false; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
        res(t);
      }, undefined, function () { rej(new Error('image not found: ' + faces[0])); });
    });
  }
  function loadGlb(rel) {
    return new Promise(function (res, rej) {
      var l = new THREE.GLTFLoader();
      l.setMeshoptDecoder(MeshoptDecoder);
      l.load(url(rel), res, undefined, function () { rej(new Error('model not found: ' + rel)); });
    });
  }
  function drawn(e) { return e.render && e.render.enabled && e.render.mode !== 'none' && (e.mat || e.img) && e.on !== false; }
  function allRecipes() {
    var out = [];
    ['day', 'evening'].forEach(function (k) {
      var T = L.times[k];
      Object.keys(T.vfx).forEach(function (n) { out.push(T.vfx[n]); });
      Object.keys(T.boat.vfx).forEach(function (n) { out.push(T.boat.vfx[n]); });
    });
    Object.keys(L.sceneVfx).forEach(function (n) { out.push(L.sceneVfx[n]); });
    return out;
  }
  function vfxImages() {
    var set = {};
    function add(m) { if (!m) return; Object.keys(m.tex).forEach(function (k) { if (m.tex[k].img) set[m.tex[k].img] = 1; }); }
    allRecipes().forEach(function (r) { r.emitters.forEach(function (e) { if (drawn(e)) { add(e.mat); add(e.trailMat); } }); });
    (L.times.evening.sushiboat.lightBillboards || []).forEach(function (b) { set[b.img] = 1; });
    return Object.keys(set);
  }
  function preload() {
    if (loading) return loading;
    var fxImgs = vfxImages(), W = L.times.day.water.tex, D = L.times.day, E = L.times.evening;
    var moonTex = [E.moon.Moon.mat.tex._MainTex.img, E.moon.Moon.mat.tex[Object.keys(E.moon.Moon.mat.tex).filter(function (k) { return /^_Sample/.test(k); })[0]].img,
      E.moon.Moonshaft.mat.tex[Object.keys(E.moon.Moonshaft.mat.tex).filter(function (k) { return /^_Sample/.test(k); })[0]].img];
    loading = Promise.all([
      loadGlb(B.boat.glb), loadGlb(E.boat.glb), loadGlb(B.sea.glb), loadGlb(E.sushiboat.glb), loadGlb(B.sea.clouds.glb),
      loadTex(B.dave.sheet, true), loadTex(B.sea.animSprites.sheet, true),
      loadTex(W._FoamTex.img), loadTex(W._IntersectionNoise.img),
      loadCube(D.sky.cube.faces), loadCube(E.sky.cube.faces), loadTex(E.sky.tex.Texture2D_D6B3DD8A.img),
      Promise.all(moonTex.map(function (p) { return loadTex(p); })),
      Promise.all(fxImgs.map(function (p) { return loadTex(p); })),
    ]).then(function (r) {
      var fx = {};
      fxImgs.forEach(function (p, i) { fx[p] = r[13][i]; });
      assets = { boat: r[0], boatEve: r[1], sea: r[2], sushiEve: r[3], clouds: r[4], dave: r[5], anim: r[6], foam: r[7], noise: r[8],
        skyDay: r[9], skyEve: r[10], star: r[11], moon: r[12], fx: fx };
      return assets;
    });
    loading.catch(function () { loading = null; });
    return loading;
  }

  // ---------------------------------------------------------------- tiếng: AudioContext riêng để đổi cao độ máy theo tốc độ
  // audio.js không mở ngữ cảnh ra ngoài và bộ kiểm đếm số tệp nó giải mã, nên tiếng cano giải mã riêng ở đây.
  var AU = { ctx: null, master: null, buf: {}, loading: null, live: [] };
  var SND = ['boat_move', 'boat_engine_loop', 'boat_engine_idle', 'boat_engine_start', 'boat_drive', 'boat_amb_day', 'boat_seagull',
    'boat_amb_night', 'boat_amb_night_wave', 'boat_dive', 'boat_foot', 'boat_bgm_lobby'];
  function audioInit() {
    if (AU.ctx) return AU.ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    AU.ctx = new AC();
    AU.master = AU.ctx.createGain();
    AU.master.connect(AU.ctx.destination);
    return AU.ctx;
  }
  function audioLoad() {
    if (AU.loading) return AU.loading;
    if (!audioInit()) return Promise.resolve();
    AU.loading = Promise.all(SND.map(function (k) {
      var a = B.audio[k];
      if (!a) return null;
      return fetch(url(a.src)).then(function (r) {
        if (!r.ok) throw new Error('sound not found: ' + a.src);
        return r.arrayBuffer();
      }).then(function (ab) {
        return new Promise(function (res) { AU.ctx.decodeAudioData(ab, function (b) { AU.buf[k] = b; res(); }, function () { res(); }); });
      });
    }));
    return AU.loading;
  }
  function sfx(key, opts) {
    opts = opts || {};
    if (!AU.ctx || !AU.buf[key]) return null;
    var src = AU.ctx.createBufferSource(), g = AU.ctx.createGain();
    src.buffer = AU.buf[key];
    src.loop = !!opts.loop;
    src.playbackRate.value = opts.rate || 1;
    g.gain.value = opts.vol == null ? 1 : opts.vol;
    src.connect(g); g.connect(AU.master);
    src.start(0, opts.offset || 0);
    var h = { src: src, gain: g, key: key };
    AU.live.push(h);
    src.onended = function () { var i = AU.live.indexOf(h); if (i >= 0) AU.live.splice(i, 1); };
    return h;
  }
  function fadeOut(h, t) {
    if (!h || !AU.ctx) return;
    var now = AU.ctx.currentTime;
    h.gain.gain.cancelScheduledValues(now);
    h.gain.gain.setTargetAtTime(0, now, (t || 0.2) / 3);
    try { h.src.stop(now + (t || 0.2) + 0.05); } catch (e) { /* đã dừng */ }
  }
  function audioStopAll(t) { AU.live.slice().forEach(function (h) { fadeOut(h, t); }); }
  function audioTick() {
    if (!AU.ctx) return;
    AU.master.gain.value = HX.audio && HX.audio.isMuted() ? 0 : 0.9;
  }
  function audioUnlock() { if (AU.ctx && AU.ctx.state === 'suspended') AU.ctx.resume(); }

  // ---------------------------------------------------------------- môi trường (sương, ambient, đèn) dùng chung mọi vật liệu
  var MAXL = 8;
  var ENV = {
    uFogCol: { value: new THREE.Vector3() }, uFogP: { value: new THREE.Vector2(0, 1) },
    uAmbCol: { value: new THREE.Vector3() }, uMainDir: { value: new THREE.Vector3(0, 1, 0) }, uMainCol: { value: new THREE.Vector3() },
    uAddN: { value: 0 }, uAddPos: { value: [] }, uAddCol: { value: [] }, uAddAtt: { value: [] }, uAddDir: { value: [] },
    uTime: { value: 0 },
  };
  for (var li = 0; li < MAXL; li++) {
    ENV.uAddPos.value.push(new THREE.Vector4()); ENV.uAddCol.value.push(new THREE.Vector3());
    ENV.uAddAtt.value.push(new THREE.Vector4(0, 1, 0, 1)); ENV.uAddDir.value.push(new THREE.Vector3(0, 0, 1));
  }
  // Mặt nạ đèn theo lớp (cullingMask gốc): mỗi lớp một bộ uniform dùng chung.
  var LAYER_U = {};
  function layerU(layer) {
    if (!LAYER_U[layer]) {
      var a = []; for (var i = 0; i < MAXL; i++) a.push(0);
      LAYER_U[layer] = { uMainOn: { value: 0 }, uAddOn: { value: a } };
    }
    return LAYER_U[layer];
  }
  function envUniforms(layer, extra) {
    var u = {}, k;
    for (k in ENV) u[k] = ENV[k];
    var lu = layerU(layer);
    u.uMainOn = lu.uMainOn; u.uAddOn = lu.uAddOn;
    for (k in extra) u[k] = extra[k];
    return u;
  }

  // ---------------------------------------------------------------- vật liệu: ProjectDR/2D_Sprite_Uber (_FOG _LIGHTING)
  // [DtD] gỡ từ DXBC: ánh = (SH × _AmbientStrength + Σ đèn (khuếch tán + bóng loá pow(N·H, 2^(10·_Smoothness+1)) × _SpecularColor))
  // × _LightFactor, kẹp [0, _LightThreshold]; màu = ảnh × màu đỉnh × ánh; sương riêng exp(−(độ sâu/(end−start))² × _FogAmplify).
  // _Smoothness là biến toàn cục không material nào đặt, không thấy script đặt → 0 (Unity mặc định).
  var UBER_VERT = [
    'attribute vec4 color; uniform vec4 uRect; uniform mat3 uUvT;',
    'varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying float vZ; varying vec4 vCol;',
    'void main() {',
    '#ifdef RECT',
    '  vUv = uRect.xy + uv * uRect.zw;',
    '#else',
    '  vUv = (uUvT * vec3(uv, 1.0)).xy;',
    '#endif',
    '#ifdef VCOL',
    '  vCol = color;',
    '#else',
    '  vCol = vec4(1.0);',
    '#endif',
    '  vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;',
    '#ifdef NO_NORMAL',
    '  vN = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));',
    '#else',
    '  vN = normalize(mat3(modelMatrix) * normal);',
    '#endif',
    '  vec4 mv = viewMatrix * w; vZ = -mv.z; gl_Position = projectionMatrix * mv;',
    '}',
  ].join('\n');
  var UBER_FRAG = [
    COMMON_GLSL,
    'uniform sampler2D map; uniform vec4 uColor; uniform float uCut; uniform float uLF; uniform float uAmbS; uniform float uThr; uniform float uFogAmp;',
    'uniform vec3 uSpec; uniform sampler2D uGlowMap; uniform float uGlow;',
    'varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying float vZ; varying vec4 vCol;',
    'void main() {',
    '  vec4 t = texture2D(map, vUv); t.rgb = hxLin(t.rgb);',
    '  vec4 c = t * vec4(hxLin(vCol.rgb), vCol.a) * uColor;',
    '  if (c.a < uCut) discard;',
    '  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;',
    '  vec3 V = normalize(cameraPosition - vW);',
    '  vec3 l = uAmbCol * uAmbS;',
    '  float ndl = clamp(dot(N, uMainDir), 0.0, 1.0); vec3 H = normalize(V + uMainDir);',
    '  l += uMainOn * uMainCol * (ndl + pow(clamp(dot(N, H), 0.0, 1.0), 2.0) * uSpec);',
    '  for (int i = 0; i < 8; i++) { if (i >= uAddN) break; if (uAddOn[i] < 0.5) continue;',
    '    vec3 Ld; float a = hxAtt(i, vW, Ld); vec3 lc = uAddCol[i] * a;',
    '    l += lc * (clamp(dot(N, Ld), 0.0, 1.0) + pow(clamp(dot(N, normalize(V + Ld)), 0.0, 1.0), 2.0) * uSpec); }',
    '  l = clamp(l * uLF, 0.0, uThr);',
    '  vec3 col = c.rgb * l;',
    '#ifdef GLOW',
    '  col += hxLin(texture2D(uGlowMap, vUv).rgb) * uGlow;',
    '#endif',
    '  float fz = vZ * uFogP.x; float f = exp(-fz * fz * uFogAmp);',
    '  col = mix(uFogCol, col, f);',
    '#ifdef ADDITIVE',
    '  gl_FragColor = vec4(col * c.a, 1.0);',
    '#else',
    '  gl_FragColor = vec4(col, c.a);',
    '#endif',
    '}',
  ].join('\n');
  // o: {map, color [r,g,b,a] gamma, vcol, cut, lightFactor, ambient, fogAmp, layer, transparent, rect, glowMap, glow, noNormal, doubleSide}
  function uberMat(o) {
    var c = o.color || [1, 1, 1, 1];
    var u = envUniforms(o.layer || 0, {
      map: { value: o.map }, uColor: { value: new THREE.Vector4(lin1(c[0]), lin1(c[1]), lin1(c[2]), c[3]) },
      uCut: { value: o.cut == null ? 0.5 : o.cut }, uLF: { value: o.lightFactor == null ? 1 : o.lightFactor },
      uAmbS: { value: o.ambient == null ? 1 : o.ambient }, uThr: { value: o.threshold == null ? 10 : o.threshold },
      uFogAmp: { value: o.fogAmp == null ? 1 : o.fogAmp }, uSpec: { value: linV(o.spec || [1, 1, 1]) },
      uGlowMap: { value: o.glowMap || null }, uGlow: { value: o.glow || 0 }, uRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      uUvT: { value: o.map && o.map.matrix ? (o.map.updateMatrix(), o.map.matrix.clone()) : new THREE.Matrix3() },
    });
    var defs = {};
    if (o.vcol) defs.VCOL = 1;
    if (o.rect) defs.RECT = 1;
    if (o.noNormal) defs.NO_NORMAL = 1;
    if (o.glowMap && o.glow) defs.GLOW = 1;
    if (o.additive) defs.ADDITIVE = 1;
    var m = new THREE.ShaderMaterial({
      uniforms: u, defines: defs, vertexShader: UBER_VERT, fragmentShader: UBER_FRAG,
      side: o.doubleSide === false ? THREE.FrontSide : THREE.DoubleSide,
      transparent: !!(o.transparent || o.additive), depthWrite: !o.additive,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    m.userData.layer = o.layer || 0;
    return m;
  }
  // Thay material glb (GLTFLoader) bằng Uber theo extras gốc. layerOf(roleName) → lớp Unity.
  function uberize(root, layerOf, spriteMat) {
    root.traverse(function (o) {
      if (!o.isMesh) return;
      var m = o.material, name = m.name || '', role = name.split(':')[0], g = o.geometry;
      if (role === 'water') { o.visible = false; return; }
      var e = m.userData || {};   // GLTFLoader để extras của material ở userData
      var sm = role === 'sprites' ? (spriteMat || {}) : null;
      var F = sm ? sm.floats || {} : {};
      var nm = uberMat({
        map: m.map, color: m.color ? [m.color.r, m.color.g, m.color.b, m.opacity] : [1, 1, 1, 1],   // hệ số màu glb = số gamma của Unity
        vcol: !!g.attributes.color, cut: m.alphaTest > 0 ? m.alphaTest : (e.transparent ? 0.004 : (sm ? F._Cutoff : 0.004)),
        lightFactor: sm ? F._LightFactor : e.lightFactor, ambient: sm ? F._AmbientStrength : e.ambientStrength,
        fogAmp: sm ? F._FogAmplify : e.fogAmplify, layer: layerOf(role), transparent: !!e.transparent,
        glowMap: m.emissiveMap, glow: e.glow, noNormal: !g.attributes.normal,
      });
      nm.name = name;
      if (m.map) m.map.anisotropy = 4;
      if (role === 'sprites' && m.map) m.map.magFilter = THREE.NearestFilter;
      o.material = nm;
      m.dispose();
      o.frustumCulled = true;
    });
  }

  // ---------------------------------------------------------------- trời: Skycube (skybox) + vòng sương Sky_Inner
  // [DtD] Skycube gỡ từ DXBC: lấy mẫu cubemap theo reflect(−V_view, hướng đỉnh + Vector3), cộng sao (Star01 × ô Voronoi lấp lánh),
  // + Vector1_9541F254 × Color_9835C26B, rồi nhân (1 + Vector1_9541F254). Vector1_456FEBB3 cộng vào trục x của V_view.
  var SKY_VERT = 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); gl_Position = p.xyww; }';
  var SKY_FRAG = [
    COMMON_GLSL,
    'uniform samplerCube uCube; uniform sampler2D uStar; uniform float uStarOn; uniform float uBright; uniform float uV456; uniform float uV18;',
    'uniform vec3 uOff; uniform vec3 uStarCol; uniform vec3 uSkyAdd; uniform vec4 uTint; uniform float uT;',
    'varying vec3 vDir;',
    'vec2 hxVor(vec2 uv, float ang, float mulK) { vec2 g0 = floor(uv), f = fract(uv); float md = 8.0;',
    '  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 o = vec2(float(x), float(y)); vec2 c = g0 + o;',
    '    vec2 h = fract(vec2(sin(dot(c, vec2(47.63, 89.98))), sin(dot(c, vec2(15.27, 99.41)))) * mulK) * ang;',
    '    vec2 p = vec2(sin(h.x), cos(h.y)) * 0.5 + o; float d = length(p - f + 0.5); md = min(md, d); }',
    '  return vec2(md, 0.0); }',
    'void main() {',
    '  vec3 dT = normalize(vDir); vec3 d = vec3(dT.x, dT.y, -dT.z);',            // hướng theo hệ Unity
    '  vec3 Vv = mat3(viewMatrix) * (-dT); Vv.x += uV456;',                     // V của Unity trong hệ nhìn
    '  vec3 Nn = d + uOff;',
    '  vec3 I = -Vv; vec3 R = I - 2.0 * dot(I, Nn) * Nn;',
    '  vec3 c = hxLin(textureCube(uCube, R).rgb);',
    '  c += uV18;',                                                              // lớp Texture2D_CADB36A9 (mặc định trắng) × Vector1_18BDFEBE
    // uv của lưới skybox Unity không có trong dữ liệu: dùng toạ độ cầu (kinh độ, vĩ độ) [ĐỀ XUẤT]
    '  vec2 uv = vec2(atan(d.x, d.z) / 6.2831853 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.1415927 + 0.5);',
    '  float w = min(pow(hxVor(uv * 20.0, uT, 1.0).x, 10.0) * 10.0, 1.0);',
    '  vec3 st = hxLin(texture2D(uStar, uv * 3.0).rgb) * uStarOn * (1.0 - w) * uStarCol; st -= uBright * st;',
    '  c += st; c += uBright * uSkyAdd; c *= 1.0 + uBright;',
    '  c = mix(c, uTint.rgb, uTint.a);',
    '  gl_FragColor = vec4(c, 1.0);',
    '}',
  ].join('\n');
  function skyMat(A, T, cube) {
    var S = T.sky, F = S.floats, C = S.colors, off = C.Vector3_0e2cfe6825a645f4b96277769b62c0d6, rv = C._RotateVector || [0, 0, 0, 0];
    var star = S.tex.Texture2D_D6B3DD8A && S.tex.Texture2D_D6B3DD8A.img;
    var u = envUniforms(0, {
      uCube: { value: cube }, uStar: { value: A.star }, uStarOn: { value: star ? 1 : 0 },   // Texture2D_D6B3DD8A mặc định đen
      uBright: { value: F.Vector1_9541F254 }, uV456: { value: F.Vector1_456FEBB3 }, uV18: { value: F.Vector1_18BDFEBE },
      uOff: { value: new THREE.Vector3(off[0] + rv[0], off[1] + rv[1], off[2] + rv[2]) },
      uStarCol: { value: linV(C.Color_8ACEE08) }, uSkyAdd: { value: linV(C.Color_9835C26B) },
      uTint: { value: new THREE.Vector4(lin1(C.Color_a41e301f2ad4456883f2f95eeab33163[0]), lin1(C.Color_a41e301f2ad4456883f2f95eeab33163[1]),
        lin1(C.Color_a41e301f2ad4456883f2f95eeab33163[2]), C.Color_a41e301f2ad4456883f2f95eeab33163[3]) },
      uT: ENV.uTime,
    });
    return new THREE.ShaderMaterial({ uniforms: u, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: false });
  }
  // [DtD] 3D_InnerSkybox_Fog gỡ từ DXBC: màu = unity_FogColor, alpha = max(1 − uv.y^0,7, 0). Vòng trụ bán kính 188 m quanh sảnh.
  function skyRing() {
    var R = L.skyRing, g = new THREE.BufferGeometry(), pos = new Float32Array(R.pos.length * 3), uv = new Float32Array(R.pos.length * 2);
    R.pos.forEach(function (p, i) { pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = -p[2]; uv[i * 2] = R.uv[i][0]; uv[i * 2 + 1] = R.uv[i][1]; });
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(R.index);
    var m = new THREE.ShaderMaterial({
      uniforms: { uFogCol: ENV.uFogCol, uPow: { value: R.power } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 uFogCol; uniform float uPow; varying vec2 vUv; void main(){ gl_FragColor = vec4(uFogCol, max(1.0 - pow(max(vUv.y, 0.0), uPow), 0.0)); }',
    });
    var mesh = new THREE.Mesh(g, m);
    mesh.renderOrder = 1; mesh.frustumCulled = false;
    return mesh;
  }

  // ---------------------------------------------------------------- mây: shader graph Cloud (URP Lit)
  // [DtD] gỡ từ DXBC: albedo = lerp(Color_9C3FBA6D, Color_F2DEC659, saturate(N·V) × Vector1_49F9B29B) + ảnh.r; alpha = saturate(ảnh.g × Vector1_3A2F95CE).
  // PBR kim loại 0, độ nhám 0,64: khuếch tán 0,96 × albedo × (SH + đèn chính × N·L) + loá GGX 0,04; phản chiếu probe lấy cube trời [ĐỀ XUẤT].
  var CLOUD_VERT = 'uniform mat3 uUvT; varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying float vZ;' +
    'void main(){ vUv = (uUvT * vec3(uv, 1.0)).xy; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);' +
    ' vec4 mv = viewMatrix * w; vZ = -mv.z; gl_Position = projectionMatrix * mv; }';
  var CLOUD_FRAG = [
    COMMON_GLSL,
    'uniform sampler2D uMap; uniform vec3 uShade; uniform vec3 uLit; uniform float uFres; uniform float uAlpha; uniform samplerCube uEnv; uniform float uNear;',
    'varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying float vZ;',
    'void main() {',
    '  vec4 t = texture2D(uMap, vUv); t.rgb = hxLin(t.rgb);',
    '  float a = clamp(t.g * uAlpha, 0.0, 1.0); if (a < 0.004) discard;',
    '  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N; vec3 V = normalize(cameraPosition - vW);',
    '  float nv = clamp(dot(N, V), 0.0, 1.0);',
    '  vec3 alb = mix(uShade, uLit, nv * uFres) + t.r;',
    '  vec3 L = uMainDir; vec3 H = normalize(V + L); float nh = clamp(dot(N, H), 0.0, 1.0), lh = clamp(dot(L, H), 0.0, 1.0);',
    '  float dd = nh * nh * -0.5904 + 1.00001; float spec = 0.4096 / (dd * dd * max(lh * lh, 0.1) * 4.56);',
    '  float ndl = clamp(dot(N, L), 0.0, 1.0);',
    '  vec3 Rr = reflect(-V, N); vec3 env = hxLin(textureCube(uEnv, vec3(Rr.x, Rr.y, -Rr.z), 5.0).rgb);',
    '  float fr = pow(1.0 - nv, 4.0) * 0.2 + 0.04;',
    '  vec3 c = alb * 0.96 * uAmbCol + env * fr * 0.709421 + (alb * 0.96 + spec * 0.04) * uMainCol * uMainOn * ndl;',
    '  float f = clamp(uFogP.y - max(vZ - uNear, 0.0) * uFogP.x, 0.0, 1.0);',
    '  gl_FragColor = vec4(mix(uFogCol, c, f), a);',
    '}',
  ].join('\n');

  // ---------------------------------------------------------------- trăng: 3D_Moon / 3D_Moonshaft (quad trên trời buổi tối)
  // [DtD] gỡ từ DXBC: khung pha = floor(_Phase) mod 8 trên dải mặt nạ 8 ô; trăng: màu = _MainTex × Color, alpha = _MainTex.a × V × mặt nạ.r;
  // quầng: màu = mặt nạ × Color, alpha = mặt nạ.a × V. Trộn SrcAlpha/OneMinusSrcAlpha, không sương.
  function moonMesh(part, A, texMain, texMask, isShaft) {
    var g = new THREE.BufferGeometry(), pos = new Float32Array(part.pos.length * 3), uv = new Float32Array(part.pos.length * 2);
    part.pos.forEach(function (p, i) { pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = -p[2]; uv[i * 2] = part.uv[i][0]; uv[i * 2 + 1] = part.uv[i][1]; });
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(part.index);
    var M = part.mat, col = M.colors.Color_B1804469;
    var m = new THREE.ShaderMaterial({
      uniforms: { uMain: { value: texMain }, uMask: { value: texMask }, uCol: { value: linV(col) }, uV: { value: M.floats.Vector1_A4A36367 }, uPhase: { value: M.floats._Phase } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide, defines: isShaft ? { SHAFT: 1 } : {},
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }',
      fragmentShader: [COMMON_GLSL, 'uniform sampler2D uMain; uniform sampler2D uMask; uniform vec3 uCol; uniform float uV; uniform float uPhase; varying vec2 vUv;',
        'void main(){ float ph = floor(fract(abs(floor(uPhase) + 0.00001) * 0.125) * 8.0); float col = ph - 8.0 * floor((ph + 0.5) * 0.125);',
        '  vec4 k = texture2D(uMask, vec2((vUv.x + col) * 0.125, vUv.y)); k.rgb = hxLin(k.rgb);',
        '#ifdef SHAFT', '  gl_FragColor = vec4(k.rgb * uCol, k.a * uV);',
        '#else', '  vec4 t = texture2D(uMain, vUv); gl_FragColor = vec4(hxLin(t.rgb) * uCol, t.a * uV * k.r);', '#endif', '}'].join('\n'),
    });
    var mesh = new THREE.Mesh(g, m);
    mesh.renderOrder = 0; mesh.frustumCulled = false;
    return mesh;
  }

  // ---------------------------------------------------------------- nước: ProjectDR/DaveWater (họ Stylized Water), viết lại từ DXBC
  // Biến thể sảnh: _WAVES _FOAM _REFRACTION _ADVANCED_SHADING _SMOOTH_INTERSECTION _RIPPLESIN (+ _ADDITIONAL_LIGHTS).
  // Chỗ nước chạm thân cano (giao cắt) đo bằng độ sâu cảnh phía sau như bản gốc: vẽ trước một lượt độ sâu các vật đặc.
  // Bản gốc tự trộn với ảnh cảnh phía sau (_CameraOpaqueTexture) rồi ghi alpha 1; ở đây để phần cứng trộn đúng phép đó
  // (One, OneMinusSrcAlpha), chỉ bỏ độ lệch khúc xạ (_RefractionStrength) vì pháp tuyến nước phẳng (_NormalStrength = _WaveNormalStr = 0).
  var WATER_VERT = [
    WAVE_GLSL,
    'uniform float uWY; varying vec3 vW; varying float vH; varying float vZ;',
    'void main() {',
    '  vec3 w = (modelMatrix * vec4(position, 1.0)).xyz; w.y = uWY;',
    '  float h; vec3 d = hxWave(vec2(w.x, -w.z), uTime, h);',
    '  w += vec3(d.x, d.y, -d.z); vW = w; vH = h;',
    '  vec4 mv = viewMatrix * vec4(w, 1.0); vZ = -mv.z; gl_Position = projectionMatrix * mv;',
    '}',
  ].join('\n').replace('uniform float uWH', 'uniform float uTime; uniform float uWH');
  var WATER_FRAG = [
    COMMON_GLSL, 'uniform vec4 uAnim;',
    '#include <packing>',
    'uniform float uTime;',
    'uniform vec4 uShallow, uBase, uHorizon, uFoamCol, uInterCol, uRippleCol;',
    'uniform float uDepth, uDepthExp, uHorizonDist, uFoamTiling, uFoamSpeed, uFoamSize, uFoamMask, uFoamMaskExp, uWaveTint;',
    'uniform float uInterSrc, uInterLen, uInterFall, uInterTiling, uInterSpeed, uEdgeFade;',
    'uniform float uSunDist, uSunSize, uSunStr, uShadowStr;',
    'uniform float uRipSpeed, uRipDensity, uRipSlim, uRipOff, uRipSinT; uniform vec2 uRipDir; uniform vec3 uUvU, uUvV;',
    'uniform sampler2D uFoam, uNoise, tDepth; uniform vec2 uRes; uniform float uNear, uFar; uniform float uNoiseSrgb, uFoamSrgb;',
    'uniform mat4 uInvProj; uniform mat4 uCamWorld;',
    'varying vec3 vW; varying float vH; varying float vZ;',
    'float hxVor(vec2 uv, float ang) { vec2 g0 = floor(uv), f = fract(uv); float md = 8.0;',
    '  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 o = vec2(float(x), float(y)); vec2 c = g0 + o;',
    '    vec2 h = fract(vec2(sin(dot(c, vec2(15.27, 99.41))), sin(dot(c, vec2(47.63, 89.98)))) * 46839.32) * ang;',
    '    vec2 p = vec2(sin(h.x), cos(h.y)) * 0.5 + o; md = min(md, length(p - f + 0.5)); }',
    '  return md; }',
    'vec3 samp(sampler2D t, vec2 uv, float s) { vec3 c = texture2D(t, uv).rgb; return s > 0.5 ? hxLin(c) : c; }',
    'void main() {',
    '  vec3 P = vec3(vW.x, vW.y, -vW.z);',                                   // hệ Unity
    '  vec2 wp = P.xz; vec3 N = vec3(0.0, 1.0, 0.0);',
    '  vec3 Vt = cameraPosition - vW; vec3 V = normalize(vec3(Vt.x, Vt.y, -Vt.z));',
    '  vec2 tv = uTime * uAnim.z * uAnim.xy;',
    // độ sâu cảnh đặc phía sau → vị trí thế giới → độ sâu nước theo pháp tuyến
    '  vec2 suv = gl_FragCoord.xy / uRes; float dz = texture2D(tDepth, suv).x;',
    '  vec4 cp = uInvProj * vec4(suv * 2.0 - 1.0, dz * 2.0 - 1.0, 1.0); cp /= cp.w; vec3 ow = (uCamWorld * cp).xyz; ow.z = -ow.z;',
    '  float d = abs(P.y - ow.y); if (dz >= 0.99999) d = 1000.0;',
    // [DtD] đúng DXBC: exp(−d) chia _Depth (không phải exp(−d/_Depth)); viết sai thì nước tối (_Depth 8) trong như kính, lộ đáy cát
    '  float grad = clamp(d / uDepth + uDepthExp * (1.0 - exp(-d) / uDepth - d / uDepth), 0.0, 1.0);',
    '  float g = 1.0 - clamp(exp(d) / uInterLen, 0.0, 1.0);',
    '  float n1 = samp(uNoise, wp * uInterTiling + tv * uInterSpeed, uNoiseSrgb).r, n2 = samp(uNoise, wp * uInterTiling * 1.5 - tv * uInterSpeed, uNoiseSrgb).r;',
    '  float dist = clamp(g / uInterFall, 0.0, 1.0); float inter = clamp(dist + n1 + n2, 0.0, 1.0) * dist * uInterCol.a;',
    '  if (P.y < ow.y) inter = 0.0;',
    // bọt theo sóng
    '  float hm = clamp(vH * 0.5 + 0.5, 0.0, 1.0);',
    '  float msk = pow(abs(1.0 + uFoamMask * (hm - 1.0)), uFoamMaskExp);',
    '  vec2 fu = wp * uFoamTiling; vec2 f1 = tv * uFoamSpeed + fu; vec2 f2 = fu * 0.5 + (1.0 - uTime * uAnim.z * uAnim.xy) * uFoamSpeed * 0.5;',
    '  float fo = clamp(samp(uFoam, f1, uFoamSrgb).r + samp(uFoam, f2, uFoamSrgb).r, 0.0, 1.0);',
    '  float fx = clamp((fo * msk - uFoamSize) / (1.0 - uFoamSize), 0.0, 1.0); fx = fx * fx * (3.0 - 2.0 * fx);',
    '  float foam = fx * clamp(uFoamCol.a, 0.0, 1.0);',
    '  vec4 base = mix(uShallow, uBase, grad); vec3 col = uWaveTint * hm + base.rgb;',
    // loá mặt trời: chỉ đèn chính
    '  vec3 Lm = vec3(uMainDir.x, uMainDir.y, -uMainDir.z);',
    '  vec3 Hs = V + Lm + N * uSunDist; float sy = clamp(Hs.y * inversesqrt(dot(Hs, Hs)), 0.0, 1.0);',
    '  vec3 sun = pow(sy, 8196.0 - 8132.0 * uSunSize) * uMainCol * uMainOn * uSunStr * clamp((1.0 - foam) * (1.0 - inter), 0.0, 1.0);',
    '  col = mix(col, uFoamCol.rgb, foam);',
    '  col = mix(col, uInterCol.rgb, inter);',
    '  float alpha = clamp(inter + base.a + foam, 0.0, 1.0);',
    '  float hz = min(pow(1.0 - clamp(dot(V, N), 0.0, 1.0), uHorizonDist), 1.0) * uHorizon.a; col = mix(col, uHorizon.rgb, hz);',
    '  float edge = uEdgeFade > 0.0 ? clamp(d / (uEdgeFade * 0.01), 0.0, 1.0) : 1.0; if (ow.y >= P.y) edge = 1.0;',
    '  alpha *= edge;',
    // gợn: Voronoi trên uv lưới gốc, uv xoắn quanh tâm lưới
    '  vec2 uv0 = vec2(dot(uUvU, vec3(P.x, P.z, 1.0)), dot(uUvV, vec3(P.x, P.z, 1.0)));',
    '  vec2 rd = sin(uTime * uRipSinT) * 0.003 * uRipDir; vec2 c0 = uv0 - 0.5; float r2 = dot(c0, c0);',
    '  vec2 tw = vec2(uv0.y - 0.5, 0.5 - uv0.x) * r2 + uv0;',
    '  vec2 ruv = (rd * uRipOff + tw) * uRipDensity;',
    '  col += pow(hxVor(ruv, uTime * uRipSpeed), uRipSlim) * uRippleCol.rgb;',
    // ánh: SH + đèn chính × N·L + đèn phụ; loá của đèn phụ pow(N·H, 0,1 × (8196 − 8132 × _SunReflectionSize))
    '  vec3 lt = uAmbCol + uMainCol * uMainOn * clamp(dot(N, Lm), 0.0, 1.0);',
    '  vec3 sp = vec3(0.0); float spw = 0.1 * (8196.0 - 8132.0 * uSunSize);',
    '  for (int i = 0; i < 8; i++) { if (i >= uAddN) break; if (uAddOn[i] < 0.5) continue;',
    '    vec3 Lt; float a = hxAtt(i, vW, Lt); vec3 Lu = vec3(Lt.x, Lt.y, -Lt.z); vec3 lc = uAddCol[i] * a;',
    '    lt += lc * clamp(dot(N, Lu), 0.0, 1.0); sp += lc * pow(clamp(dot(N, normalize(Lu + V)), 0.0, 1.0), spw); }',
    '  vec3 lit = col * lt + sun + sp;',
    '  float f = hxFog(vZ);',
    '  gl_FragColor = vec4(lit * f * alpha + uFogCol * (1.0 - f), 1.0 - f * (1.0 - alpha));',
    '}',
  ].join('\n');
  function waterUniforms(A) {
    var u = envUniforms(4, {
      uWY: { value: 0 }, uWH: { value: 0 }, uWDist: { value: 0 }, uWSpeed: { value: 0 }, uWSteep: { value: 0 }, uWCount: { value: 1 },
      uWDir: { value: new THREE.Vector4() }, uAnim: { value: new THREE.Vector4() },
      uShallow: { value: new THREE.Vector4() }, uBase: { value: new THREE.Vector4() }, uHorizon: { value: new THREE.Vector4() },
      uFoamCol: { value: new THREE.Vector4() }, uInterCol: { value: new THREE.Vector4() }, uRippleCol: { value: new THREE.Vector4() },
      uDepth: { value: 1 }, uDepthExp: { value: 1 }, uHorizonDist: { value: 1 }, uFoamTiling: { value: 1 }, uFoamSpeed: { value: 0 }, uFoamSize: { value: 0 },
      uFoamMask: { value: 0 }, uFoamMaskExp: { value: 1 }, uWaveTint: { value: 0 }, uInterSrc: { value: 0 }, uInterLen: { value: 1 }, uInterFall: { value: 1 },
      uInterTiling: { value: 1 }, uInterSpeed: { value: 0 }, uEdgeFade: { value: 0 }, uSunDist: { value: 0 }, uSunSize: { value: 1 }, uSunStr: { value: 0 },
      uShadowStr: { value: 0 }, uRipSpeed: { value: 0 }, uRipDensity: { value: 1 }, uRipSlim: { value: 1 }, uRipOff: { value: 0 }, uRipSinT: { value: 0 },
      uRipDir: { value: new THREE.Vector2() }, uUvU: { value: new THREE.Vector3() }, uUvV: { value: new THREE.Vector3() },
      uFoam: { value: A.foam }, uNoise: { value: A.noise }, tDepth: { value: null }, uRes: { value: new THREE.Vector2(1, 1) },
      uNear: { value: 0.3 }, uFar: { value: 350 }, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
      uNoiseSrgb: { value: 1 }, uFoamSrgb: { value: 1 },
    });
    return u;
  }
  function v4lin(v, c) { v.set(lin1(c[0]), lin1(c[1]), lin1(c[2]), c[3]); }
  function applyWater(u, Wm) {
    var F = Wm.floats, C = Wm.colors, WP = waveParams(Wm);
    u.uWY.value = Wm.y; u.uWH.value = WP.h; u.uWDist.value = WP.dist; u.uWSpeed.value = WP.speed; u.uWSteep.value = WP.steep; u.uWCount.value = WP.count;
    u.uWDir.value.fromArray(WP.dir); u.uAnim.value.fromArray(WP.anim);
    v4lin(u.uShallow.value, C._ShallowColor); v4lin(u.uBase.value, C._BaseColor); v4lin(u.uHorizon.value, C._HorizonColor);
    v4lin(u.uFoamCol.value, C._FoamColor); v4lin(u.uInterCol.value, C._IntersectionColor); v4lin(u.uRippleCol.value, C._RippleColor);
    u.uDepth.value = F._Depth; u.uDepthExp.value = F._DepthExp; u.uHorizonDist.value = F._HorizonDistance;
    u.uFoamTiling.value = F._FoamTiling; u.uFoamSpeed.value = F._FoamSpeed; u.uFoamSize.value = F._FoamSize; u.uFoamMask.value = F._FoamWaveMask; u.uFoamMaskExp.value = F._FoamWaveMaskExp;
    u.uWaveTint.value = F._WaveTint; u.uInterSrc.value = F._IntersectionSource; u.uInterLen.value = F._IntersectionLength; u.uInterFall.value = F._IntersectionFalloff;
    u.uInterTiling.value = F._IntersectionTiling; u.uInterSpeed.value = F._IntersectionSpeed; u.uEdgeFade.value = F._EdgeFade;
    u.uSunDist.value = F._SunReflectionDistortion; u.uSunSize.value = F._SunReflectionSize; u.uSunStr.value = F._SunReflectionStrength; u.uShadowStr.value = F._ShadowStrength;
    u.uRipSpeed.value = F._RippleSpeed; u.uRipDensity.value = F._RippleDensity; u.uRipSlim.value = F._RippleSlimless; u.uRipOff.value = F._RippleOffsetFactor;
    u.uRipSinT.value = F._RippleOffsetSinTimeFactor; u.uRipDir.value.set(C._RippleDirection[0], C._RippleDirection[1]);
    u.uUvU.value.fromArray(Wm.uvMap.u); u.uUvV.value.fromArray(Wm.uvMap.v);
    u.uNoiseSrgb.value = Wm.tex._IntersectionNoise.srgb ? 1 : 0; u.uFoamSrgb.value = Wm.tex._FoamTex.srgb ? 1 : 0;
    return WP;
  }

  // ---------------------------------------------------------------- hạt VFX theo công thức ParticleSystem gốc
  // Mỗi nhóm = (material, lưới mẫu): một InstancedBufferGeometry, mỗi hạt một instance (tâm + 3 trục đã nhân cỡ + màu + ô ảnh).
  // Shader theo đúng shader gốc gỡ từ DXBC:
  //   Additive / AdditiveNoFog: màu = 2 × màu hạt × _TintColor × ảnh, alpha × độ mềm (_SoftParticleFactor theo độ sâu cảnh); SrcAlpha, One.
  //   Alpha Blended: như trên, trộn sương theo _FogFactor; SrcAlpha, OneMinusSrcAlpha.
  //   Add_CenterGlow: ảnh chính cuộn theo _SpeedMainTexUVNoiseZW, lệch theo _Flow × _Mask, nhân _Noise, _Color, _Emission; One, _Blend2.
  var PART_VERT = [
    'attribute vec3 iC; attribute vec3 iX; attribute vec3 iY; attribute vec3 iZ; attribute vec4 iCol; attribute vec4 iUV;',
    'varying vec2 vUv; varying vec4 vCol; varying float vZ;',
    'void main() {',
    '  vec3 w = iC + iX * position.x + iY * position.y + iZ * position.z;',
    '  vec4 mv = viewMatrix * vec4(w, 1.0); vZ = -mv.z; gl_Position = projectionMatrix * mv;',
    '  vUv = iUV.xy + uv * iUV.zw; vCol = iCol;',
    '}',
  ].join('\n');
  var PART_FRAG = [
    COMMON_GLSL,
    '#include <packing>',
    'uniform sampler2D uMap; uniform vec4 uTint; uniform float uSoft; uniform float uFogF; uniform float uSrgb;',
    'uniform sampler2D tDepth; uniform vec2 uRes; uniform float uNear; uniform float uFar; uniform float uTime;',
    'uniform sampler2D uFlow; uniform sampler2D uMask; uniform sampler2D uNoise; uniform vec4 uMainST, uFlowST, uMaskST, uNoiseST, uSpeed, uDist, uColor;',
    'uniform float uEmission, uCenter, uSrgbF, uSrgbM, uSrgbN;',
    'varying vec2 vUv; varying vec4 vCol; varying float vZ;',
    'vec4 tx(sampler2D t, vec2 uv, float s) { vec4 c = texture2D(t, uv); if (s > 0.5) c.rgb = hxLin(c.rgb); return c; }',
    'void main() {',
    '  vec4 vc = vec4(hxLin(vCol.rgb), vCol.a);',
    '  float f = hxFog(vZ);',
    '#if defined(GLOW)',
    '  vec2 muv = vUv * uMainST.xy + uMainST.zw + uTime * uSpeed.xy;',
    '  vec2 fl = tx(uFlow, vUv * uFlowST.xy + uFlowST.zw + uTime * uDist.xy, uSrgbF).xy;',
    '  vec4 mk = tx(uMask, vUv * uMaskST.xy + uMaskST.zw, uSrgbM);',
    '  muv -= fl * mk.xy * uDist.z;',
    '  vec4 m = tx(uMap, muv, uSrgb); vec4 nz = tx(uNoise, vUv * uNoiseST.xy + uNoiseST.zw + uTime * uSpeed.zw, uSrgbN);',
    '  vec4 c = m * nz * uColor * vc; c = m.a * c * nz.a * uColor.a * vc.a;',
    '  vec4 cg = clamp(clamp(mk - 1.0, 0.0, 1.0) * mk, 0.0, 1.0); c = mix(c, c * cg, uCenter);',   // custom data 0 → (1 − v2.z) = 1
    '  c *= uEmission;',
    '  gl_FragColor = vec4(c.rgb * f, c.a);',
    '#else',
    '  float soft = 1.0;',
    '#ifdef SOFT',
    '  float dz = texture2D(tDepth, gl_FragCoord.xy / uRes).x; float sz = -perspectiveDepthToViewZ(dz, uNear, uFar);',
    '  soft = clamp((sz - vZ) * uSoft, 0.0, 1.0);',
    '#endif',
    '  vec4 c = vc * uTint * 2.0; c.a *= soft;',
    '  c *= tx(uMap, vUv, uSrgb);',
    '#if defined(ALPHA)',
    '  vec3 cf = mix(uFogCol, c.rgb, f); c.rgb = mix(c.rgb, cf, uFogF);',
    '  gl_FragColor = vec4(c.rgb, clamp(c.a, 0.0, 1.0));',
    '#elif defined(NOFOG)',
    '  gl_FragColor = vec4(c.rgb, clamp(c.a, 0.0, 1.0));',
    '#else',
    '  c.rgb *= mix(1.0, f, uFogF);',
    '  gl_FragColor = vec4(c.rgb, clamp(c.a, 0.0, 1.0));',
    '#endif',
    '#endif',
    '}',
  ].join('\n');

  var QUAD = { pos: [[-0.5, -0.5, 0], [0.5, -0.5, 0], [0.5, 0.5, 0], [-0.5, 0.5, 0]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]], index: [0, 1, 2, 0, 2, 3] };
  var GROUP_CAP = 1024;
  var DEPTH = { tex: null, res: new THREE.Vector2(1, 1), near: { value: 0.3 }, far: { value: 350 } };
  var DEPTH_U = { value: null }, RES_U = { value: new THREE.Vector2(1, 1) };
  function kindOf(mat) {
    var s = (mat && mat.shader) || '';
    if (/Add_CenterGlow/.test(s)) return 'glow';
    if (/AdditiveNoFog/.test(s)) return 'nofog';
    if (/Additive/.test(s)) return 'add';
    return 'alpha';
  }
  var BLEND = { 0: THREE.ZeroFactor, 1: THREE.OneFactor, 2: THREE.DstColorFactor, 3: THREE.SrcColorFactor, 4: THREE.OneMinusDstColorFactor,
    5: THREE.SrcAlphaFactor, 6: THREE.OneMinusSrcColorFactor, 7: THREE.DstAlphaFactor, 8: THREE.OneMinusDstAlphaFactor, 10: THREE.OneMinusSrcAlphaFactor };
  function st4(t) { var s = (t && t.st) || [1, 1, 0, 0]; return new THREE.Vector4(s[0], s[1], s[2], s[3]); }
  function Group(key, mat, tex, template) {
    var tpl = template || QUAD, n = tpl.pos.length, g = new THREE.InstancedBufferGeometry();
    var pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    // lưới hạt ghi theo hệ Unity: đổi z → −z; tam giác đảo chiều do lật trục, vẽ hai mặt nên không cần sửa thứ tự
    tpl.pos.forEach(function (p, i) { pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = -p[2]; uv[i * 2] = tpl.uv[i][0]; uv[i * 2 + 1] = tpl.uv[i][1]; });
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(tpl.index);
    var self = this;
    ['iC', 'iX', 'iY', 'iZ'].forEach(function (k) { self[k] = new THREE.InstancedBufferAttribute(new Float32Array(GROUP_CAP * 3), 3).setUsage(THREE.DynamicDrawUsage); g.setAttribute(k, self[k]); });
    this.iCol = new THREE.InstancedBufferAttribute(new Float32Array(GROUP_CAP * 4), 4).setUsage(THREE.DynamicDrawUsage); g.setAttribute('iCol', this.iCol);
    this.iUV = new THREE.InstancedBufferAttribute(new Float32Array(GROUP_CAP * 4), 4).setUsage(THREE.DynamicDrawUsage); g.setAttribute('iUV', this.iUV);
    g.instanceCount = 0;
    var kind = kindOf(mat), F = (mat && mat.floats) || {}, C = (mat && mat.colors) || {}, T = (mat && mat.tex) || {};
    var tintC = C._TintColor || C._Color || C._BaseColor || [1, 1, 1, 1];
    var main = T._MainTex || T._BaseMap || {};
    var defs = {};
    if (kind === 'glow') defs.GLOW = 1; else if (kind === 'alpha') defs.ALPHA = 1; else if (kind === 'nofog') defs.NOFOG = 1;
    if (kind !== 'glow' && F._SoftParticleFactor != null) defs.SOFT = 1;
    var white = Particles.white;
    var u = envUniforms(0, {
      uMap: { value: tex || white }, uTint: { value: new THREE.Vector4(lin1(tintC[0]), lin1(tintC[1]), lin1(tintC[2]), tintC[3]) },
      uSoft: { value: F._SoftParticleFactor || 1 }, uFogF: { value: F._FogFactor == null ? 1 : F._FogFactor }, uSrgb: { value: main.srgb === 0 ? 0 : 1 },
      tDepth: DEPTH_U, uRes: RES_U, uNear: DEPTH.near, uFar: DEPTH.far, uTime: ENV.uTime,
      uFlow: { value: (T._Flow && T._Flow.img && Particles.tex[T._Flow.img]) || white }, uMask: { value: (T._Mask && T._Mask.img && Particles.tex[T._Mask.img]) || white },
      uNoise: { value: (T._Noise && T._Noise.img && Particles.tex[T._Noise.img]) || white },
      uMainST: { value: st4(main) }, uFlowST: { value: st4(T._Flow) }, uMaskST: { value: st4(T._Mask) }, uNoiseST: { value: st4(T._Noise) },
      uSpeed: { value: new THREE.Vector4().fromArray(C._SpeedMainTexUVNoiseZW || [0, 0, 0, 0]) }, uDist: { value: new THREE.Vector4().fromArray(C._DistortionSpeedXYPowerZ || [0, 0, 0, 0]) },
      uColor: { value: new THREE.Vector4(lin1((C._Color || [1, 1, 1, 1])[0]), lin1((C._Color || [1, 1, 1, 1])[1]), lin1((C._Color || [1, 1, 1, 1])[2]), (C._Color || [1, 1, 1, 1])[3]) },
      uEmission: { value: F._Emission == null ? 1 : F._Emission }, uCenter: { value: F._Usecenterglow || 0 },
      uSrgbF: { value: T._Flow && T._Flow.srgb === 0 ? 0 : 1 }, uSrgbM: { value: T._Mask && T._Mask.srgb === 0 ? 0 : 1 }, uSrgbN: { value: T._Noise && T._Noise.srgb === 0 ? 0 : 1 },
    });
    var m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: PART_VERT, fragmentShader: PART_FRAG, defines: defs,
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide });
    if (kind === 'glow') { m.blending = THREE.CustomBlending; m.blendSrc = THREE.OneFactor; m.blendDst = BLEND[F._Blend2 == null ? 1 : F._Blend2] || THREE.OneFactor; }
    else if (kind === 'add' || kind === 'nofog') { m.blending = THREE.CustomBlending; m.blendSrc = THREE.SrcAlphaFactor; m.blendDst = THREE.OneFactor; }
    else { m.blending = THREE.CustomBlending; m.blendSrc = THREE.SrcAlphaFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor; }
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = kind === 'alpha' ? 5 : 6;
    this.mesh.layers.set(1);
    this.n = 0; this.key = key;
  }
  Group.prototype.begin = function () { this.n = 0; };
  Group.prototype.push = function (c, x, y, z, col, uv) {
    if (this.n >= GROUP_CAP) return;
    var i = this.n++, a3 = i * 3, a4 = i * 4;
    this.iC.array[a3] = c.x; this.iC.array[a3 + 1] = c.y; this.iC.array[a3 + 2] = c.z;
    this.iX.array[a3] = x.x; this.iX.array[a3 + 1] = x.y; this.iX.array[a3 + 2] = x.z;
    this.iY.array[a3] = y.x; this.iY.array[a3 + 1] = y.y; this.iY.array[a3 + 2] = y.z;
    this.iZ.array[a3] = z.x; this.iZ.array[a3 + 1] = z.y; this.iZ.array[a3 + 2] = z.z;
    this.iCol.array[a4] = col[0]; this.iCol.array[a4 + 1] = col[1]; this.iCol.array[a4 + 2] = col[2]; this.iCol.array[a4 + 3] = col[3];
    this.iUV.array[a4] = uv[0]; this.iUV.array[a4 + 1] = uv[1]; this.iUV.array[a4 + 2] = uv[2]; this.iUV.array[a4 + 3] = uv[3];
  };
  Group.prototype.end = function () {
    var g = this.mesh.geometry, n = this.n;
    g.instanceCount = n;
    if (!n) return;
    [this.iC, this.iX, this.iY, this.iZ, this.iCol, this.iUV].forEach(function (a) {
      a.updateRange.offset = 0; a.updateRange.count = n * a.itemSize; a.needsUpdate = true;
    });
  };

  // Khung của emitter: ma trận gốc (cano hoặc thế giới) × ma trận emitter (vị trí, xoay, scale theo chế độ Scaling Mode).
  var V3 = THREE.Vector3;
  function Emitter(sys, rec, root) {
    this.sys = sys; this.rec = rec; this.root = root;          // root: 'boat' | 'world'
    var q = qU2T(rec.rotQ || [0, 0, 0, 1]), p = U2T(rec.pos);
    var sc = rec.scaling === 'local' ? rec.localScale : (rec.lossy || [rec.scale || 1, rec.scale || 1, rec.scale || 1]);
    this.sizeScale = rec.scaling === 'shape' ? 1 : Math.abs(sc[0] || 1);   // scale âm (lật gương) chỉ đổi chiều, không đổi cỡ
    this.local = new THREE.Matrix4().compose(new V3(p[0], p[1], p[2]), new THREE.Quaternion(q[0], q[1], q[2], q[3]), new V3(sc[0] || 1e-4, sc[1] || 1e-4, sc[2] || 1e-4));
    this.world = new THREE.Matrix4().copy(this.local);
    this.ax = [new V3(1, 0, 0), new V3(0, 1, 0), new V3(0, 0, 1)];   // trục xoay (chuẩn hoá) của emitter trong thế giới three
    this.inv = new THREE.Matrix4();
    this.l2w = new THREE.Matrix3(); this.w2l = new THREE.Matrix3();   // phần tuyến tính (có scale) để đổi véc-tơ vận tốc/lực giữa hai hệ
    this.subs = [];
    this.on = false; this.mode = 'once'; this.t = 0; this.acc = 0; this.live = 0; this.rateMul = 1; this.fired = {};
    this.gw = new V3();       // trọng lực (m/s²) trong hệ mô phỏng
    var r = rec.rate, plat = 0;
    if (r && r.curve) { for (var u = 0.25; u <= 0.8; u += 0.05) plat = Math.max(plat, curveAt(r.curve, u)); plat *= r.mul == null ? 1 : r.mul; }
    else plat = num(r, 0.5, 0.5);
    this.plateau = plat;     // mức phát ổn định (đoạn phẳng của đường cong rate) dùng khi cano đang chạy [ĐỀ XUẤT]
  }
  Emitter.prototype.frame = function (rootM) {
    if (rootM) this.world.multiplyMatrices(rootM, this.local); else this.world.copy(this.local);
    var e = this.world.elements;
    this.ax[0].set(e[0], e[1], e[2]).normalize(); this.ax[1].set(e[4], e[5], e[6]).normalize(); this.ax[2].set(e[8], e[9], e[10]).normalize();
    this.inv.copy(this.world).invert();
    this.l2w.setFromMatrix4(this.world); this.w2l.setFromMatrix4(this.inv);
    // trọng lực thế giới (−y) đổi về hệ mô phỏng
    var g = num(this.rec.gravity, 0, 0.5) * 9.81;
    this.gw.set(0, -g, 0);
    if (this.rec.space !== 'world') this.gw.applyMatrix3(this.w2l);
  };
  Emitter.prototype.start = function (mode) { this.on = true; this.mode = mode; this.t = 0; this.acc = 0; this.fired = {}; };
  Emitter.prototype.stop = function () { this.on = false; };
  Emitter.prototype.update = function (dt) {
    if (!this.on) return;
    var rec = this.rec, te;
    this.t += dt;
    te = this.t - num(rec.delay, 0, 0.5);
    if (te < 0) return;
    var dur = rec.duration || 1, loop = this.mode !== 'once' || rec.loop;
    if (!loop && te > dur) { this.on = false; return; }
    var u = loop ? (te % dur) / dur : te / dur;
    var rate = this.mode === 'run' ? this.plateau : num(rec.rate, u, Math.random());
    this.acc += rate * this.rateMul * dt;
    var n = Math.floor(this.acc);
    this.acc -= n;
    var max = rec.maxParticles || 100;
    if (rec.bursts && this.mode !== 'run') {
      var tc = loop ? te % dur : te, cyc = loop ? Math.floor(te / dur) : 0;
      for (var b = 0; b < rec.bursts.length && b < 30; b++) {
        var bu = rec.bursts[b], cycles = Math.max(1, bu.cycles || 1);
        for (var c = 0; c < cycles && c < 20; c++) {
          var key = cyc + ':' + b + ':' + c, tb = bu.time + c * (bu.interval || 0);
          if (this.fired[key] || tc < tb) continue;
          this.fired[key] = 1;
          if (rec.burstProb && Math.random() > rec.burstProb[b]) continue;
          n += Math.round(num(bu.count, 0, Math.random()) * Math.min(1, this.rateMul));
        }
      }
    }
    for (var i = 0; i < n && this.live < max; i++) this.sys.spawn(this, null);
  };

  // Mẫu điểm sinh và hướng theo Shape module (hệ emitter, Unity).
  var SH = { p: [0, 0, 0], d: [0, 0, 1] };
  function shapeSample(sh, more) {
    var p = SH.p, d = SH.d, a, k, R, th, arc;
    p[0] = p[1] = p[2] = 0; d[0] = 0; d[1] = 0; d[2] = 1;
    if (!sh) return SH;
    R = sh.radius || 0; th = sh.thickness == null ? 1 : sh.thickness; arc = (sh.arc == null ? 360 : sh.arc) * Math.PI / 180;
    switch (sh.type) {
      case 'sphere': case 'hemisphere': {
        var z = Math.random() * 2 - 1, ang = Math.random() * Math.PI * 2, rr = Math.sqrt(1 - z * z);
        d[0] = Math.cos(ang) * rr; d[1] = Math.sin(ang) * rr; d[2] = sh.type === 'hemisphere' ? Math.abs(z) : z;
        k = R * (1 - th * (1 - Math.cbrt(Math.random())));
        p[0] = d[0] * k; p[1] = d[1] * k; p[2] = d[2] * k;
        break;
      }
      case 'circle':
        a = Math.random() * arc; k = R * (1 - th * (1 - Math.sqrt(Math.random())));
        d[0] = Math.cos(a); d[1] = Math.sin(a); d[2] = 0; p[0] = d[0] * k; p[1] = d[1] * k;
        break;
      case 'cone': case 'coneVolume': {
        a = Math.random() * arc; k = Math.sqrt(Math.random());
        var sa = (sh.angle || 0) * Math.PI / 180 * k;
        p[0] = Math.cos(a) * R * k; p[1] = Math.sin(a) * R * k;
        d[0] = Math.cos(a) * Math.sin(sa); d[1] = Math.sin(a) * Math.sin(sa); d[2] = Math.cos(sa);
        if (sh.type === 'coneVolume' && more && more.length) { var l = Math.random() * more.length; p[0] += d[0] * l; p[1] += d[1] * l; p[2] += d[2] * l; }
        break;
      }
      case 'box': case 'boxShell': case 'boxEdge':
        p[0] = Math.random() - 0.5; p[1] = Math.random() - 0.5; p[2] = Math.random() - 0.5;
        break;
      case 'edge':
        p[0] = (Math.random() - 0.5) * 2 * R; d[0] = 0; d[1] = 1; d[2] = 0;
        break;
      default:
        break;
    }
    var s = sh.scale || [1, 1, 1];
    p[0] *= s[0]; p[1] *= s[1]; p[2] *= s[2];
    eulerU(sh.rot, p); eulerU(sh.rot, d);
    if (sh.pos) { p[0] += sh.pos[0]; p[1] += sh.pos[1]; p[2] += sh.pos[2]; }
    if (more) {
      if (more.randomDir) {   // Randomize Direction: trộn với một hướng ngẫu nhiên
        var rz = Math.random() * 2 - 1, ra = Math.random() * Math.PI * 2, rs = Math.sqrt(1 - rz * rz), m = more.randomDir;
        d[0] = lerp(d[0], Math.cos(ra) * rs, m); d[1] = lerp(d[1], Math.sin(ra) * rs, m); d[2] = lerp(d[2], rz, m);
      }
      if (more.sphericalDir) {
        var pl = Math.hypot(p[0], p[1], p[2]) || 1, ms = more.sphericalDir;
        d[0] = lerp(d[0], p[0] / pl, ms); d[1] = lerp(d[1], p[1] / pl, ms); d[2] = lerp(d[2], p[2] / pl, ms);
      }
      var dl = Math.hypot(d[0], d[1], d[2]) || 1; d[0] /= dl; d[1] /= dl; d[2] /= dl;
    }
    return SH;
  }
  // Nhiễu vị trí (Noise module): Unity dùng nhiễu riêng không có trong dữ liệu; đây là nhiễu giá trị 3 chiều mượt [ĐỀ XUẤT].
  function hash3(x, y, z) { var s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; }
  function vnoise(x, y, z) {
    var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    function h(a, b, c) { return hash3(xi + a, yi + b, zi + c); }
    return lerp(lerp(lerp(h(0, 0, 0), h(1, 0, 0), u), lerp(h(0, 1, 0), h(1, 1, 0), u), v), lerp(lerp(h(0, 0, 1), h(1, 0, 1), u), lerp(h(0, 1, 1), h(1, 1, 1), u), v), w);
  }

  function Particles(scene, tex) {
    this.scene = scene; Particles.tex = tex;
    if (!Particles.white) { Particles.white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); Particles.white.needsUpdate = true; }
    this.groups = {}; this.list = []; this.pool = [];
    this.sets = {};
    this.col = [1, 1, 1, 1]; this.col2 = [1, 1, 1, 1]; this.uv = [0, 0, 1, 1];
    this.c = new V3(); this.x = new V3(); this.y = new V3(); this.z = new V3(); this.t0 = new V3(); this.t1 = new V3();
    this.cam = null;
  }
  Particles.prototype.group = function (rec, trail) {
    var mat = trail ? rec.trailMat : rec.mat;
    if (!trail && !drawn(rec)) return null;
    if (!mat) return null;
    var main = mat.tex._MainTex || mat.tex._BaseMap || {};
    var tex = main.img ? Particles.tex[main.img] : null;
    var tpl = !trail && rec.render.mode === 'mesh' && rec.mesh ? L.meshes[rec.mesh] : null;
    var key = mat.name + '|' + (tpl ? rec.mesh : 'quad') + '|' + kindOf(mat);
    if (!this.groups[key]) {
      var g = this.groups[key] = new Group(key, mat, tex, tpl);
      this.scene.add(g.mesh);
    }
    return this.groups[key];
  };
  // Nạp một công thức thành một bộ emitter. Emitter trống (không vẽ, không phát) là gốc của một nhóm con trong prefab
  // (Back, Booster, Tube_Side, SideL, SideR, Idle): các emitter sau nó mang tên nhóm đó (thứ tự duyệt cây của rip_boat.py).
  Particles.prototype.load = function (name, recipe, root) {
    var self = this, list = [], part = null;
    var ems = recipe.emitters.map(function (rec) { return new Emitter(self, rec, root); });
    ems.forEach(function (em, i) {
      var rec = em.rec;
      em.group = self.group(rec, false);
      em.trailGroup = rec.trailMore && rec.trailMat ? self.group(rec, true) : null;
      if (!drawn(rec) && !rec.rate && !rec.bursts) { part = rec.name; em.empty = true; }
      em.part = part;
      (rec.subs || []).forEach(function (s) { if (s.index != null && ems[s.index]) { ems[s.index].isSub = true; em.subs.push({ em: ems[s.index], type: s.type }); } });
    });
    ems.forEach(function (em) { if (!em.empty && !em.isSub && em.rec.on !== false) list.push(em); });
    this.sets[name] = { list: list, all: ems, root: root };
    return list;
  };
  Particles.prototype.frames = function (boatM) {
    for (var n in this.sets) {
      var S = this.sets[n], rm = S.root === 'boat' ? boatM : null;
      for (var i = 0; i < S.all.length; i++) S.all[i].frame(rm);
    }
  };
  // at: vị trí sinh (thế giới three) thay cho vị trí emitter; dùng cho emitter con (sub-emitter).
  var tv3 = new V3(), tv3b = new V3();
  Particles.prototype.spawn = function (em, at) {
    var rec = em.rec, p = this.pool.pop() || { pos: new V3(), vel: new V3(), c0: [1, 1, 1, 1], hist: [] };
    var ax = at ? at.x : 0, ay = at ? at.y : 0, az = at ? at.z : 0;
    var sh = shapeSample(rec.shape, rec.shapeMore), S = em.sizeScale;
    p.em = em; p.r = Math.random(); p.r2 = Math.random(); p.r3 = Math.random(); p.age = 0; p.subAcc = 0;
    p.life = Math.max(0.02, num(rec.lifetime, 0, Math.random()));
    var sp = num(rec.speed, 0, Math.random());
    var md = rec.velocityMore && rec.velocityMore.speedModifier; if (md != null) sp *= num(md, 0, 0.5);
    p.world = rec.space === 'world' || !!at;
    // hệ emitter (Unity) → hệ emitter three (z đảo dấu)
    tv3.set(sh.p[0], sh.p[1], -sh.p[2]); tv3b.set(sh.d[0], sh.d[1], -sh.d[2]);
    if (at) {
      p.pos.set(ax + tv3.x * S, ay + tv3.y * S, az + tv3.z * S);
      p.vel.copy(tv3b).multiplyScalar(sp * S);
    } else if (p.world) {
      p.pos.copy(tv3).applyMatrix4(em.world);
      p.vel.copy(tv3b).multiplyScalar(sp).applyMatrix3(em.l2w);
    } else { p.pos.copy(tv3); p.vel.copy(tv3b).multiplyScalar(sp); }
    p.size = num(rec.size, 0, Math.random()) * S;
    p.sizeY = rec.sizeY != null ? num(rec.sizeY, 0, Math.random()) * S : p.size;
    p.sizeZ = rec.sizeZ != null ? num(rec.sizeZ, 0, Math.random()) * S : p.size;
    var flip = rec.flipRot && Math.random() < rec.flipRot ? -1 : 1;
    p.rot = num(rec.rotation, 0, Math.random()) * flip;
    p.rot3 = rec.rot3D ? [num(rec.rot3D[0], 0, Math.random()) * flip, num(rec.rot3D[1], 0, Math.random()) * flip, num(rec.rot3D[2], 0, Math.random()) * flip] : null;
    p.spin = rec.rotOverLife ? flip : 0;
    colorAt(rec.color, em.t / (rec.duration || 1), Math.random(), this.col);
    for (var i = 0; i < 4; i++) p.c0[i] = this.col[i];
    p.frame0 = rec.sheet ? num(rec.sheet.startFrame, 0, Math.random()) : 0;
    p.hist.length = 0;
    em.live++;
    this.list.push(p);
    return p;
  };
  Particles.prototype.kill = function (i) {
    var p = this.list[i], em = p.em;
    em.live--;
    for (var s = 0; s < em.subs.length; s++) {
      if (em.subs[s].type !== 'death') continue;
      var sub = em.subs[s].em, sr = sub.rec, n = 0;
      (sr.bursts || []).forEach(function (b) { n += Math.round(num(b.count, 0, Math.random())); });
      var w = this.worldPos(p, tv3b.set(0, 0, 0));
      for (var k = 0; k < n && sub.live < (sr.maxParticles || 30); k++) this.spawn(sub, w);
    }
    this.list[i] = this.list[this.list.length - 1];
    this.list.pop();
    p.em = null;
    this.pool.push(p);
  };
  Particles.prototype.worldPos = function (p, out) {
    out.copy(p.pos);
    if (!p.world) out.applyMatrix4(p.em.world);
    return out;
  };
  var MQ = new THREE.Matrix4(), EU = new THREE.Euler(0, 0, 0, 'YXZ');
  Particles.prototype.update = function (dt, cam) {
    var k, name, L2 = this.list, uv = this.uv, col = this.col2;
    for (name in this.sets) { var S = this.sets[name]; for (k = 0; k < S.list.length; k++) S.list[k].update(dt); }
    for (k in this.groups) this.groups[k].begin();
    var e = cam.matrixWorld.elements, cr = this.t0.set(e[0], e[1], e[2]).normalize(), cu = this.t1.set(e[4], e[5], e[6]).normalize();
    var cb = new V3(e[8], e[9], e[10]).normalize();
    for (var i = L2.length - 1; i >= 0; i--) {
      var p = L2[i], em = p.em, rec = em.rec;
      p.age += dt;
      var t = p.age / p.life;
      if (t >= 1) { this.kill(i); continue; }
      var S = em.sizeScale;
      // lực, trọng lực, vận tốc theo đời hạt, giới hạn vận tốc (ClampVelocity), cản
      p.vel.addScaledVector(em.gw, dt);
      var F = rec.force;
      if (F) {
        tv3.set(num(F.x, t, p.r), num(F.y, t, p.r2), -num(F.z, t, p.r));
        if (!!F.world !== p.world) tv3.applyMatrix3(F.world ? em.w2l : em.l2w);
        p.vel.addScaledVector(tv3, dt);
      }
      var ox = 0, oy = 0, oz = 0, Vm = rec.velocity;
      if (Vm) {
        tv3.set(num(Vm.x, t, p.r), num(Vm.y, t, p.r2), -num(Vm.z, t, p.r));
        if (Vm.world && !p.world) tv3.applyMatrix3(em.w2l);
        else if (!Vm.world && p.world) tv3.applyMatrix3(em.l2w);
        ox = tv3.x; oy = tv3.y; oz = tv3.z;
      }
      var Cl = rec.clamp;
      if (Cl) {
        // Unity: vận tốc vượt ngưỡng thì kéo về ngưỡng theo _dampen mỗi khung; quy về 30 khung/giây cho khỏi phụ thuộc tốc độ khung [ĐỀ XUẤT]
        var damp = 1 - Math.pow(1 - clamp(Cl.dampen, 0, 1), dt * 30);
        if (Cl.separate) {
          var lx = Math.abs(num(Cl.x, t, p.r)), ly = Math.abs(num(Cl.y, t, p.r)), lz = Math.abs(num(Cl.z, t, p.r));
          if (Math.abs(p.vel.x) > lx) p.vel.x = lerp(p.vel.x, Math.sign(p.vel.x) * lx, damp);
          if (Math.abs(p.vel.y) > ly) p.vel.y = lerp(p.vel.y, Math.sign(p.vel.y) * ly, damp);
          if (Math.abs(p.vel.z) > lz) p.vel.z = lerp(p.vel.z, Math.sign(p.vel.z) * lz, damp);
        } else {
          var lim = num(Cl.magnitude, t, p.r) * (p.world ? S : 1), vv = p.vel.length();
          if (vv > lim && vv > 1e-6) p.vel.multiplyScalar(lerp(1, lim / vv, damp));
        }
        var dr = num(Cl.drag, t, p.r);
        if (dr) { if (Cl.dragSize) dr *= p.size * p.size; if (Cl.dragVel) dr *= p.vel.length(); p.vel.multiplyScalar(Math.max(0, 1 - dr * dt)); }
      }
      var Nz = rec.noise;
      if (Nz) {
        var fq = Nz.frequency || 0.5, sc = num(Nz.scroll, t, p.r) * em.t, st = num(Nz.strength, t, p.r) * num(Nz.pos, t, p.r);
        var bx = p.pos.x * fq + sc, by = p.pos.y * fq, bz = p.pos.z * fq;
        ox += vnoise(bx, by, bz) * st; oy += vnoise(bx + 31.4, by, bz + 7.1) * (Nz.separate ? num(Nz.strengthY, t, p.r) * num(Nz.pos, t, p.r) : st);
        oz += vnoise(bx + 11.3, by + 19.7, bz) * (Nz.separate ? num(Nz.strengthZ, t, p.r) * num(Nz.pos, t, p.r) : st);
      }
      p.pos.x += (p.vel.x + ox) * dt; p.pos.y += (p.vel.y + oy) * dt; p.pos.z += (p.vel.z + oz) * dt;
      if (rec.rotOverLife) p.rot += num(rec.rotOverLife, t, p.r) * p.spin * dt;
      if (p.rot3 && rec.rotAxes) { p.rot3[0] += num(rec.rotAxes[0], t, p.r) * dt; p.rot3[1] += num(rec.rotAxes[1], t, p.r) * dt; p.rot3[2] += num(rec.rotAxes[2], t, p.r) * dt; }
      // emitter con loại birth: phát theo rate của nó từ chỗ hạt cha
      for (var s = 0; s < em.subs.length; s++) {
        if (em.subs[s].type !== 'birth') continue;
        var sub = em.subs[s].em;
        p.subAcc += num(sub.rec.rate, 0.5, 0.5) * dt;
        while (p.subAcc >= 1 && sub.live < (sub.rec.maxParticles || 100)) { p.subAcc -= 1; this.spawn(sub, this.worldPos(p, tv3b)); }
        if (p.subAcc >= 1) p.subAcc = 0;
      }
      var g = em.group;
      if (!g && !em.trailGroup) continue;
      var c = this.worldPos(p, this.c);
      var sm = rec.sizeOverLife ? num(rec.sizeOverLife, t, p.r) : 1, smY = sm, smZ = sm;
      if (rec.sizeAxes) { sm = num(rec.sizeAxes[0], t, p.r); smY = num(rec.sizeAxes[1], t, p.r); smZ = num(rec.sizeAxes[2], t, p.r); }
      colorAt(rec.colorOverLife, t, p.r2, col);
      col[0] *= p.c0[0]; col[1] *= p.c0[1]; col[2] *= p.c0[2]; col[3] *= p.c0[3];
      if (em.trailGroup) this.trail(p, c, col, t);
      if (!g) continue;
      var sht = rec.sheet;
      if (sht) {
        var nf = sht.type === 'singleRow' ? sht.cols : sht.cols * sht.rows;
        var f = Math.floor((num(sht.frameOverTime, t, p.r) * (sht.cycles || 1) % 1) * nf + p.frame0) % nf;
        var cx = f % sht.cols, cy = sht.type === 'singleRow' ? (sht.row || 0) : Math.floor(f / sht.cols);
        uv[0] = cx / sht.cols; uv[1] = 1 - (cy + 1) / sht.rows; uv[2] = 1 / sht.cols; uv[3] = 1 / sht.rows;
      } else { uv[0] = 0; uv[1] = 0; uv[2] = 1; uv[3] = 1; }
      var w = p.size * sm, h = p.sizeY * smY, dz = p.sizeZ * smZ;
      var mode = rec.render.mode, al = rec.align || 'view';
      var X = this.x, Y = this.y, Z = this.z;
      if (mode === 'stretch') {
        var vx = p.vel.x + ox, vy = p.vel.y + oy, vz = p.vel.z + oz;
        tv3.set(vx, vy, vz); if (!p.world) tv3.applyMatrix3(em.l2w);
        var spd = tv3.length();
        // trục dài theo vận tốc chiếu lên mặt phẳng nhìn
        var dp = tv3.dot(cb); tv3b.copy(tv3).addScaledVector(cb, -dp);
        if (tv3b.lengthSq() < 1e-8) tv3b.copy(cu);
        tv3b.normalize();
        var len = w * (rec.render.lengthScale || 1) + spd * (rec.render.velocityScale || 0);
        Y.copy(tv3b).multiplyScalar(len); X.crossVectors(tv3b, cb).normalize().multiplyScalar(w); Z.set(0, 0, 0);
      } else {
        if (mode === 'horizontal') { X.set(1, 0, 0); Y.set(0, 0, -1); Z.set(0, 1, 0); }
        else if (al === 'world') { X.set(1, 0, 0); Y.set(0, 1, 0); Z.set(0, 0, 1); }
        else if (al === 'local') { X.copy(em.ax[0]); Y.copy(em.ax[1]); Z.copy(em.ax[2]); }
        else { X.copy(cr); Y.copy(cu); Z.copy(cb); }
        if (p.rot3) {
          // xoay 3D của Unity (Z → X → Y) trong hệ căn của hạt; three: đảo dấu góc quanh x, y do lật trục z
          EU.set(-p.rot3[0], -p.rot3[1], p.rot3[2], 'YXZ');
          MQ.makeRotationFromEuler(EU);
          var m = MQ.elements, x0 = X.clone(), y0 = Y.clone(), z0 = Z.clone();
          X.set(0, 0, 0).addScaledVector(x0, m[0]).addScaledVector(y0, m[1]).addScaledVector(z0, m[2]);
          Y.set(0, 0, 0).addScaledVector(x0, m[4]).addScaledVector(y0, m[5]).addScaledVector(z0, m[6]);
          Z.set(0, 0, 0).addScaledVector(x0, m[8]).addScaledVector(y0, m[9]).addScaledVector(z0, m[10]);
        } else if (p.rot) {
          var co = Math.cos(-p.rot), si = Math.sin(-p.rot);
          tv3.copy(X).multiplyScalar(co).addScaledVector(Y, si); Y.multiplyScalar(co).addScaledVector(X, -si); X.copy(tv3);
        }
        X.multiplyScalar(w); Y.multiplyScalar(h); Z.multiplyScalar(dz);
      }
      if (rec.flip && rec.flip[0] && p.r3 < rec.flip[0]) X.multiplyScalar(-1);
      if (rec.flip && rec.flip[1] && p.r2 < rec.flip[1]) Y.multiplyScalar(-1);
      g.push(c, X, Y, Z, col, uv);
    }
    for (k in this.groups) this.groups[k].end();
  };
  // Vệt (TrailModule): lưu vị trí thế giới của hạt, vẽ mỗi đoạn một tứ giác theo ảnh vệt (textureMode kéo dài).
  Particles.prototype.trail = function (p, c, col, t) {
    var T = p.em.rec.trailMore, g = p.em.trailGroup, H = p.hist;
    var life = Math.max(0.01, num(T.lifetime, t, p.r) * p.life);
    var last = H[H.length - 1];
    if (!last || Math.hypot(c.x - last[0], c.y - last[1], c.z - last[2]) > (T.minDist || 0.01)) H.push([c.x, c.y, c.z, p.age]);
    while (H.length && p.age - H[0][3] > life) H.shift();
    if (H.length < 2) return;
    var cam = this.cam, cp = cam.position, n = H.length, tc = [0, 0, 0, 0];
    for (var i = n - 1; i > 0; i--) {
      var a = H[i], b = H[i - 1], u0 = (n - 1 - i) / (n - 1), u1 = (n - i) / (n - 1);
      this.x.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      this.c.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
      tv3.set(cp.x - this.c.x, cp.y - this.c.y, cp.z - this.c.z);
      var wd = num(T.width, (u0 + u1) / 2, p.r) * (T.sizeWidth ? p.size : 1);
      this.y.crossVectors(this.x, tv3).normalize().multiplyScalar(wd);
      colorAt(T.colorOverTrail, (u0 + u1) / 2, p.r2, tc);
      if (T.inheritColor) { tc[0] *= col[0]; tc[1] *= col[1]; tc[2] *= col[2]; tc[3] *= col[3]; }
      g.push(this.c, this.x, this.y, this.z.set(0, 0, 0), tc, [u0, 0, u1 - u0, 1]);
    }
  };
  Particles.prototype.clear = function () {
    while (this.list.length) { var p = this.list.pop(); p.em.live = 0; p.em = null; this.pool.push(p); }
    for (var name in this.sets) this.sets[name].all.forEach(function (e) { e.stop(); e.live = 0; });
    for (var k in this.groups) { this.groups[k].begin(); this.groups[k].end(); }
  };
  Particles.prototype.setRun = function (name, parts, mode, mul) {
    this.sets[name].list.forEach(function (e) {
      if (parts && parts.indexOf(e.part) < 0) return;
      if (mode === 'stop') { e.stop(); return; }
      if (!e.on || e.mode !== mode) e.start(mode);
      if (mul != null) e.rateMul = mul;
    });
  };
  Particles.prototype.mul = function (name, parts, mul) {
    this.sets[name].list.forEach(function (e) { if (!parts || parts.indexOf(e.part) >= 0) e.rateMul = mul; });
  };
  // Hiệu ứng nền của sảnh lặp mãi: bật vòng lặp, emitter có prewarm thì chạy trước một vòng.
  Particles.prototype.ambient = function (name, on, cam) {
    var S = this.sets[name], self = this;
    if (!on) { S.list.forEach(function (e) { e.stop(); }); return; }
    S.list.forEach(function (e) { e.start('loop'); });
    var pre = 0;
    S.list.forEach(function (e) { if (e.rec.prewarm) pre = Math.max(pre, Math.min(8, e.rec.duration || 1)); });
    for (var t = 0; t < pre; t += 0.1) {
      S.list.forEach(function (e) { if (e.rec.prewarm) e.update(0.1); });
      self.update(0.1, cam);
    }
  };

  // ---------------------------------------------------------------- dựng cảnh (một lần, giữ lại)
  var W = null;
  function build(A) {
    var scene = new THREE.Scene();
    var cam = new THREE.PerspectiveCamera(B.sea.camera.fov, 16 / 9, B.sea.camera.near, B.sea.camera.far);
    cam.layers.enable(1);
    DEPTH.near.value = B.sea.camera.near; DEPTH.far.value = B.sea.camera.far;
    var disp = [];
    var LY = L.layers;
    function layerOf(role) { return role === 'sprites' ? LY.farSprite : role === 'ground' ? LY.groundMesh : role === 'sushiboat' ? LY.sushiboat : LY.boat; }

    // Trời: quả cầu skybox theo camera (vẽ đầu tiên, sâu nhất) + vòng sương chân trời
    var skyGeo = new THREE.SphereGeometry(1, 48, 24); disp.push(skyGeo);
    var sky = new THREE.Mesh(skyGeo, skyMat(A, L.times.day, A.skyDay));
    sky.renderOrder = -100; sky.frustumCulled = false; sky.layers.set(1);
    scene.add(sky);
    var skyMats = { day: sky.material, evening: skyMat(A, L.times.evening, A.skyEve) };
    var ring = skyRing(); ring.layers.set(1); scene.add(ring); disp.push(ring.geometry);

    // Biển sảnh: quán sushi (ngày), đảo, bụi cây, nền cát. Tấm nước gốc chỉ phủ x −225..115: ẩn đi, thay bằng nước theo camera.
    var sea = A.sea.scene;
    uberize(sea, layerOf, L.spriteMats.far);
    var sushiDay = [];
    sea.traverse(function (o) { if (o.isMesh && /^sushiboat:/.test(o.material.name)) sushiDay.push(o); });
    scene.add(sea);
    var sushiEve = A.sushiEve.scene;
    uberize(sushiEve, function () { return LY.sushiboat; }, L.spriteMats.far);
    // Đốm đèn FX_Light của thuyền quán tối: shader 2D_LightBillboard (rip_boat.py ghi riêng từng đốm với màu HDR + độ đục)
    var bbGeo = new THREE.PlaneGeometry(1, 1); disp.push(bbGeo);
    (L.times.evening.sushiboat.lightBillboards || []).forEach(function (b) {
      var m = new THREE.Mesh(bbGeo, new THREE.ShaderMaterial({
        uniforms: { uMap: { value: A.fx[b.img] }, uCol: { value: linV(b.color) }, uA: { value: b.alpha }, uTint: { value: new THREE.Vector4(lin1(b.tint[0]), lin1(b.tint[1]), lin1(b.tint[2]), b.tint[3]) } },
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: [COMMON_GLSL, 'uniform sampler2D uMap; uniform vec3 uCol; uniform float uA; uniform vec4 uTint; varying vec2 vUv;',
          'void main(){ vec4 t = texture2D(uMap, vUv); gl_FragColor = vec4(hxLin(t.rgb) * uTint.rgb * uCol, t.a * uTint.a * uA); }'].join('\n'),
      }));
      // ma trận thế giới Unity (hàng trước) → three: lật z hai phía (S·M·S); quad cỡ sprite, lệch theo pivot, lật theo flipX/Y
      var e = b.m, M = new THREE.Matrix4().set(e[0], e[1], -e[2], e[3], e[4], e[5], -e[6], e[7], -e[8], -e[9], e[10], -e[11], 0, 0, 0, 1);
      var local = new THREE.Matrix4().makeTranslation((0.5 - b.pivot[0]) * b.size[0], (0.5 - b.pivot[1]) * b.size[1], 0)
        .multiply(new THREE.Matrix4().makeScale(b.size[0] * (b.flip[0] ? -1 : 1), b.size[1] * (b.flip[1] ? -1 : 1), 1));
      m.matrixAutoUpdate = false; m.matrix.multiplyMatrices(M, local);
      m.renderOrder = 4; m.layers.set(1);
      sushiEve.add(m);
    });
    scene.add(sushiEve);

    // Nước: lưới 900 × 700 m, mắt lưới ~6,9 m như wave001 gốc (51 × 51 đỉnh trên 345 × 262 m), bám theo camera
    var wu = waterUniforms(A);
    [A.foam, A.noise].forEach(function (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; });
    var waterGeo = new THREE.PlaneGeometry(900, 700, 130, 101);
    waterGeo.rotateX(-Math.PI / 2); disp.push(waterGeo);
    var water = new THREE.Mesh(waterGeo, new THREE.ShaderMaterial({
      uniforms: wu, vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, side: THREE.DoubleSide,
    }));
    water.renderOrder = 3; water.frustumCulled = false; water.layers.set(1);
    scene.add(water);

    // Mây (chỉ buổi chiều): node giữ tên, anim trôi legacy tính từ gốc "Lobby Clouds" (rip_boat.py ghi cloudsParent)
    var clouds = [];
    A.clouds.scene.traverse(function (o) {
      if (!o.isMesh) return;
      var m = o.material, info = cloudMat(m.name);
      if (m.map) m.map.updateMatrix();
      var u = envUniforms(LY.boat, {
        uMap: { value: m.map }, uUvT: { value: m.map ? m.map.matrix.clone() : new THREE.Matrix3() },
        uShade: { value: linV(info.shade) }, uLit: { value: linV(info.lit) }, uFres: { value: info.fres }, uAlpha: { value: info.alpha },
        uEnv: { value: A.skyDay }, uNear: DEPTH.near,
      });
      o.material = new THREE.ShaderMaterial({ uniforms: u, vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      o.renderOrder = 0; o.frustumCulled = false; o.layers.set(1);
      m.dispose();
    });
    var byName = {};
    Object.keys(B.sea.clouds.anims).forEach(function (k) { byName[k.replace(/\s/g, '_')] = B.sea.clouds.anims[k]; });
    A.clouds.scene.children.forEach(function (n) { var an = byName[n.name]; if (an && an[0]) clouds.push({ node: n, anim: an[0] }); });
    scene.add(A.clouds.scene);

    // Trăng (chỉ buổi tối)
    var E = L.times.evening;
    var moon = new THREE.Group();
    moon.add(moonMesh(E.moon.Moonshaft, A, null, A.moon[2], true));
    moon.add(moonMesh(E.moon.Moon, A, A.moon[0], A.moon[1], false));
    moon.children.forEach(function (m) { m.layers.set(1); disp.push(m.geometry); });
    scene.add(moon);

    // Dừa và mòng biển: sheet lobby_anim, ô 99×99, pivot giữa, 100 px/đv; material Uber gốc (Lobby_2D_Sprite_Lit[_Back])
    var AS = B.sea.animSprites, quad = new THREE.PlaneGeometry(1, 1), anims = [];
    disp.push(quad);
    AS.places.forEach(function (pl) {
      var akey = Object.keys(AS.anims).filter(function (k) { return k.indexOf(pl.kind + '/') === 0; })[0];
      var an = AS.anims[akey];
      if (!an) return;
      var gull = /Seagull/i.test(pl.kind) || /Seagull/i.test(pl.name), SM = gull ? L.spriteMats.gull : L.spriteMats.palm, F = SM.floats;
      var mat = uberMat({ map: A.anim, rect: true, cut: F._Cutoff, lightFactor: F._LightFactor, ambient: F._AmbientStrength, fogAmp: F._FogAmplify,
        layer: gull ? LY.gull : LY.forestSprite });
      var m = new THREE.Mesh(quad, mat);
      var s = AS.cell[0] / an.ppu;
      m.scale.set(s * pl.scale[0], s * pl.scale[1], 1);
      var p = U2T(pl.pos);
      m.position.set(p[0], p[1], p[2]);
      m.renderOrder = 2;
      scene.add(m);
      anims.push({ mesh: m, an: an, flip: pl.flipX, t0: Math.random() * an.length, path: pl.pathAnim && pl.pathAnim[0], base: p, gull: gull });
    });

    // Cano: bản chiều và bản tối (cùng thân, khác material kính/đèn pha)
    var boatRoot = new THREE.Group(), model = A.boat.scene, modelEve = A.boatEve.scene;
    uberize(model, function () { return LY.boat; });
    uberize(modelEve, function () { return LY.boat; });
    [model, modelEve].forEach(function (md) { md.traverse(function (o) { if (o.isMesh) o.frustumCulled = false; }); boatRoot.add(md); });
    boatRoot.rotation.order = 'YZX';
    scene.add(boatRoot);

    // Dave: sheet dave_lobby, ô 64×64, pivot đáy giữa, ×3,4; material Lobby_2D_Player (Uber)
    var dq = new THREE.PlaneGeometry(1, 1); dq.translate(0, 0.5, 0); disp.push(dq);
    var DF = L.spriteMats.dave.floats;
    var daveMat = uberMat({ map: A.dave, rect: true, cut: DF._Cutoff, lightFactor: DF._LightFactor, ambient: DF._AmbientStrength, fogAmp: DF._FogAmplify, layer: LY.dave });
    var dave = new THREE.Mesh(dq, daveMat);
    dave.scale.set(DAVE_H, DAVE_H, 1);
    dave.renderOrder = 3;
    boatRoot.add(dave);

    var fx = new Particles(scene, A.fx);
    fx.cam = cam;
    ['day', 'evening'].forEach(function (k) {
      var T = L.times[k];
      fx.load(k + ':idle', T.boat.vfx.idle, 'boat');
      fx.load(k + ':exit', T.boat.vfx.exit, 'boat');
      Object.keys(T.vfx).forEach(function (n) { fx.load(k + ':env', T.vfx[n], 'world'); });
    });
    fx.load('fish', L.sceneVfx.FishFlock, 'world');

    return {
      scene: scene, cam: cam, sky: sky, skyMats: skyMats, ring: ring, water: water, wu: wu, clouds: clouds, cloudRoot: A.clouds.scene, moon: moon,
      anims: anims, boatRoot: boatRoot, models: { day: model, evening: modelEve }, sushiDay: sushiDay, sushiEve: sushiEve,
      dave: dave, daveMat: daveMat, fx: fx, rt: null, copy: null, depthRt: null, bloomRt: null, disposables: disp, time: null, WP: null,
    };
  }
  // Hai màu HDR và hệ số của từng material mây (extras của glb).
  var CLOUD_MATS = null;
  function cloudMat(name) {
    if (!CLOUD_MATS) {
      CLOUD_MATS = {};
      var raw = assets && assets.clouds && assets.clouds.parser && assets.clouds.parser.json && assets.clouds.parser.json.materials || [];
      raw.forEach(function (m) {
        var ex = m.extras || {}, c = ex.colors || {}, f = ex.floats || {};
        CLOUD_MATS[m.name] = { shade: (c.Color_9C3FBA6D || [1, 1, 1]).slice(0, 3), lit: (c.Color_F2DEC659 || [1, 1, 1]).slice(0, 3),
          fres: f.Vector1_49F9B29B == null ? 0.5 : f.Vector1_49F9B29B, alpha: f.Vector1_3A2F95CE == null ? 1 : f.Vector1_3A2F95CE };
      });
    }
    return CLOUD_MATS[name] || { shade: [1, 1, 1], lit: [1, 1, 1], fres: 0.5, alpha: 1 };
  }

  // Áp môi trường của một buổi: sương, ambient, đèn, trời, nước, PP, bật/tắt vật theo buổi.
  var POST = { exposure: 0, contrast: 0, saturation: 0, vig: [0, 0, 0], vigI: 0, vigC: [0.5, 0.5], vigS: 0.2, bloomI: 0, bloomThr: 1, bloomTint: [1, 1, 1] };
  var LIGHTS = [];   // đèn phụ: {pos (three, thế giới hoặc theo cano), dir, color (tuyến tính × cường độ), att, boat: bool, w}
  var MAIN = null;
  function applyTime(time) {
    var T = L.times[time];
    W.time = time;
    var fog = T.fog;
    ENV.uFogCol.value.copy(linV(fog.color));
    ENV.uFogP.value.set(1 / (fog.end - fog.start), fog.end / (fog.end - fog.start));
    ENV.uAmbCol.value.copy(linV(T.ambient));
    // đèn: đèn có SunLight là đèn chính (URP), còn lại là đèn phụ; MainLight_Back tối hẳn = 0 (LerpLightColorByEveningHour)
    LIGHTS = []; MAIN = null;
    T.lights.forEach(function (l) {
      if (!l.on) return;
      var inten = l.intensity;
      if (T.eveningLerp && l.name === 'MainLight_Back') inten = 0;
      if (!inten) return;
      if (l.sun && l.type === 'directional') MAIN = l;
      else LIGHTS.push(lightRec(l, inten, false));
    });
    T.boat.lights.forEach(function (l) { if (l.on && l.intensity) LIGHTS.push(lightRec(l, l.intensity, true)); });
    LIGHTS = LIGHTS.slice(0, MAXL);
    if (MAIN) {
      var d = U2T(MAIN.dir); ENV.uMainDir.value.set(-d[0], -d[1], -d[2]).normalize();
      var mc = linV(MAIN.color).multiplyScalar(MAIN.intensity); ENV.uMainCol.value.copy(mc);
    } else ENV.uMainCol.value.set(0, 0, 0);
    ENV.uAddN.value = LIGHTS.length;
    LIGHTS.forEach(function (l, i) {
      ENV.uAddCol.value[i].copy(l.color); ENV.uAddAtt.value[i].copy(l.att);
    });
    // mặt nạ đèn theo lớp
    Object.keys(LAYER_U).forEach(function (k) { maskLayer(+k); });
    // trời
    W.sky.material = W.skyMats[time];
    W.cloudRoot.visible = time === 'day';
    W.moon.visible = !!T.moon;
    W.sushiDay.forEach(function (o) { o.visible = time === 'day'; });
    W.sushiEve.visible = time === 'evening';
    W.models.day.visible = time === 'day'; W.models.evening.visible = time === 'evening';
    W.anims.forEach(function (a) { a.mesh.visible = !a.gull || T.seagulls; });
    W.WP = applyWater(W.wu, T.water);
    // PP (Volume gốc)
    var C = T.pp.components, ca = C.ColorAdjustments || {}, vg = C.Vignette || {}, bl = C.Bloom || {};
    POST.exposure = ca.active ? ca.postExposure || 0 : 0; POST.contrast = ca.active ? ca.contrast || 0 : 0; POST.saturation = ca.active ? ca.saturation || 0 : 0;
    POST.vigI = vg.active ? vg.intensity || 0 : 0; POST.vig = vg.color || [0, 0, 0]; POST.vigC = vg.center || [0.5, 0.5]; POST.vigS = vg.smoothness == null ? 0.2 : vg.smoothness;
    POST.bloomI = bl.active ? bl.intensity || 0 : 0; POST.bloomThr = bl.threshold == null ? 0.9 : bl.threshold; POST.bloomTint = bl.tint || [1, 1, 1];
  }
  function lightRec(l, inten, boat) {
    var p = U2T(l.pos), d = U2T(l.dir), rec = { name: l.name, boat: boat, type: l.type, mask: l.cullingMask,
      color: linV(l.color).multiplyScalar(inten), att: new THREE.Vector4(0, 1, 0, 1), lp: new THREE.Vector3(p[0], p[1], p[2]), ld: new THREE.Vector3(d[0], d[1], d[2]) };
    if (l.type !== 'directional') rec.att.x = 1 / (l.range * l.range);
    if (l.type === 'spot') {
      var co = Math.cos(l.spotAngle * Math.PI / 360), ci = Math.cos(l.innerSpotAngle * Math.PI / 360), inv = 1 / Math.max(ci - co, 0.001);
      rec.att.z = inv; rec.att.w = -co * inv;
    }
    return rec;
  }
  function maskLayer(layer) {
    var U = layerU(layer), bit = function (m) { return layer >= 32 ? 0 : ((m >>> layer) & 1); };
    U.uMainOn.value = MAIN ? bit(MAIN.cullingMask) : 0;
    for (var i = 0; i < MAXL; i++) U.uAddOn.value[i] = i < LIGHTS.length ? bit(LIGHTS[i].mask) : 0;
  }
  // vị trí/hướng đèn mỗi khung (đèn trên cano đi theo cano)
  var tmpL = new THREE.Vector3();
  function lightsFrame() {
    var bm = W.boatRoot.matrixWorld;
    LIGHTS.forEach(function (l, i) {
      var P4 = ENV.uAddPos.value[i], D = ENV.uAddDir.value[i];
      if (l.type === 'directional') { P4.set(-l.ld.x, -l.ld.y, -l.ld.z, 0); D.set(0, 0, 1); return; }
      tmpL.copy(l.lp); if (l.boat) tmpL.applyMatrix4(bm);
      P4.set(tmpL.x, tmpL.y, tmpL.z, 1);
      tmpL.copy(l.ld); if (l.boat) tmpL.transformDirection(bm);
      D.set(-tmpL.x, -tmpL.y, -tmpL.z).normalize();
    });
  }

  // Giải phóng mọi tài nguyên GPU của cảnh; ảnh/lưới gốc vẫn nằm trong bộ nhớ nên chuyến sau vẽ lại chỉ việc nạp lên GPU.
  function releaseGpu() {
    if (!W) return;
    var seen = new Set();
    function mat(m) {
      if (!m || seen.has(m)) return;
      seen.add(m);
      for (var k in m) if (m[k] && m[k].isTexture && !seen.has(m[k])) { seen.add(m[k]); m[k].dispose(); }
      if (m.uniforms) for (var u in m.uniforms) {
        var v = m.uniforms[u].value;
        if (v && v.isTexture && !seen.has(v)) { seen.add(v); v.dispose(); }
      }
      m.dispose();
    }
    W.scene.traverse(function (o) {
      if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
      (o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []).forEach(mat);
    });
    mat(W.skyMats.day); mat(W.skyMats.evening);
    ['rt', 'depthRt', 'bloomRt'].forEach(function (k) { if (W[k]) { if (W[k].depthTexture) W[k].depthTexture.dispose(); W[k].dispose(); W[k] = null; } });
    if (W.copy) { W.copy.mesh.geometry.dispose(); W.copy.mesh.material.dispose(); W.copy.pre.material.dispose(); W.copy = null; }
    if (Particles.white) Particles.white.dispose();
  }

  // ---------------------------------------------------------------- trạng thái chuyến
  var st = null;

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function buildHud(root, dir) {
    root.innerHTML = '';
    var hud = el('div', 'bt-hud');
    var top = el('div', 'bt-top');
    var h2 = el('h2', null, dir === 'out' ? 'Cano ra Hố Xanh' : 'Cano về quán');
    var prog = el('div', 'bt-prog');
    var bar = el('div', 'bar bt-bar'), fill = el('div', 'bt-fill'), boatMark = el('i', 'bt-mark');
    bar.appendChild(fill); bar.appendChild(boatMark);
    var dist = el('span', 'bt-dist', '');
    prog.appendChild(bar); prog.appendChild(dist);
    top.appendChild(h2); top.appendChild(prog);
    var speed = el('div', 'bt-speed'); speed.appendChild(el('b', null, '0')); speed.appendChild(el('small', null, 'km/h'));
    var skip = el('button', 'ghost bt-skip', 'Bỏ qua'); skip.id = 'boat-skip';
    var hint = el('div', 'bt-hint', '');
    var fade = el('div', 'bt-fade');
    var load = el('div', 'bt-load', 'Đang tải cano…');
    [top, speed, skip, hint, load, fade].forEach(function (e) { hud.appendChild(e); });
    root.appendChild(hud);
    return { root: root, fill: fill, mark: boatMark, dist: dist, speed: speed.firstChild, skip: skip, hint: hint, fade: fade, load: load };
  }

  // ---------------------------------------------------------------- vòng chuyến (tự chạy, không nhận phím/chạm lái)
  var TRACKS = {};   // dãy khung của mỗi chiều, dựng một lần (số liệu tĩnh)
  // ?boattrace=1: ghi mọi khung của mỗi chuyến vào TRACE (test đọc sau khi pha đã rời, khỏi lệ thuộc độ trễ lúc hỏi)
  var TRACE = /[?&]boattrace=1(&|$)/.test(location.search) ? [] : null, tmpNdc = new THREE.Vector3();
  function traceFrame() {
    if (!TRACE || !st.trace) return;
    tmpNdc.set(RESTO[0], RESTO[1], -RESTO[2]).project(W.cam);
    var sg = st.seg >= 0 ? st.T.segs[st.seg] : null;
    st.trace.frames.push({ tt: st.tt, state: st.state, seg: sg ? sg.id : null, segT: sg ? segTime() : 0, x: st.x, z: st.z, speed: st.speed,
      dR: Math.hypot(st.x - RESTO[0], -st.z - RESTO[2]), ndc: [tmpNdc.x, tmpNdc.y, tmpNdc.z], dave: st.dave.anim, daveT: st.dave.t, daveX: st.dave.x,
      fade: st.fadeK, pan: st.pan });
  }
  function trackOf(dir) { return TRACKS[dir] || (TRACKS[dir] = buildTrack(dir)); }
  var RESTO = TD.restaurant.center;   // [DtD] tâm khung bao quán sushi

  function enter(args) {
    var dir = args && args.dir === 'home' ? 'home' : 'out', T = trackOf(dir);
    st = {
      dir: dir, time: TIME_OF[dir], T: T, state: 'load', t: 0, st: 0, tt: 0, seg: -1, done: false,
      x: 0, z: 0, yaw: 0, roll: 0, pitch: 0, heave: 0, speed: 0, vx: 0, vz: 0,
      total: T.len, dist: T.len, pan: 0,
      dave: { anim: 'Idle', t: 0, x: DAVE_LOCAL[0], y: DAVE_LOCAL[1], z: DAVE_LOCAL[2], flip: false, visible: true },
      snd: {}, boosted: false, camX: 0, camY: 0, camZ: 0, fadeK: 0, stepT: 0,
    };
    if (TRACE) { st.trace = { dir: dir, frames: [], end: null }; TRACE.push(st.trace); }
    var ui = st.ui = buildHud(HX.game.screen('boat'), dir);
    ui.skip.addEventListener('click', finish);
    ui.skip.addEventListener('pointerdown', audioUnlock);
    var me = st;
    audioInit();
    audioLoad().catch(function (e) { if (HX.game.errors) HX.game.errors.push(String(e)); });
    preload().then(function (A) {
      if (st !== me || me.done) return;
      if (!W) W = build(A);
      ui.load.hidden = true;
      begin();
    }).catch(function (e) {
      if (HX.game.errors) HX.game.errors.push(String(e));
      ui.load.textContent = 'Không tải được cano: ' + e.message;
    });
  }

  function begin() {
    applyTime(st.time);
    W.fx.clear();
    trackAt(0);
    poseBoat(0);
    snapCamera();
    W.fx.frames(W.boatRoot.matrixWorld);
    W.fx.setRun(st.time + ':idle', null, 'loop', 1);
    W.fx.ambient(st.time + ':env', true, W.cam);
    W.fx.ambient('fish', true, W.cam);
    enterSeg(0);
    ambience(true);
    hint();
    traceFrame();
  }

  function setState(s) { st.state = s; st.st = 0; }

  function daveAnim(name, flip) { var d = st.dave; d.anim = name; d.t = 0; if (flip != null) d.flip = flip; }

  // Đầu mỗi đoạn: trạng thái = id đoạn; tiếng, VFX, hình Dave theo đoạn (Respawn khi leo lên, Boat_Surprise khi cano vọt đi).
  var SEG_START = {
    rev: function () { departFx(); },
    leave: function () { daveAnim('Boat_Surprise'); },
    respawn: function () { daveAnim('Respawn'); },
    depart: function () { departFx(); daveAnim('Boat_Surprise'); },
    cruise: function () { if (st.snd.start) { fadeOut(st.snd.start, 1.2); st.snd.start = null; } },
  };
  // Boat_Exit00x bật VFX Exit ở khung 0,0167 s; tiếng cano thật của Dave ở sảnh + tiếng nổ máy [DtD]
  function departFx() {
    W.fx.setRun(st.time + ':exit', null, 'once', 1);
    sfx('boat_move', { vol: 0.9 });
    st.snd.start = sfx('boat_engine_start', { vol: 0.55 });
  }
  function enterSeg(k) {
    st.seg = k;
    setState(st.T.segs[k].id);
    if (SEG_START[st.state]) SEG_START[st.state]();
  }

  // Tư thế ở thời điểm tt của dãy khung (nội suy giữa hai khung 30/giây); toạ độ Unity → three (z → −z, góc → −góc).
  function trackAt(tt) {
    var T = st.T, f = clamp(tt * FPS, 0, T.n - 1), i = Math.floor(f), j = Math.min(T.n - 1, i + 1), k = f - i;
    st.x = lerp(T.x[i], T.x[j], k); st.z = -lerp(T.z[i], T.z[j], k);
    st.yaw = -(T.yaw[i] + wrapDeg(T.yaw[j] - T.yaw[i]) * k) * DEG;
    st.roll = lerp(T.roll[i], T.roll[j], k); st.pitch = lerp(T.pitch[i], T.pitch[j], k); st.heave = lerp(T.heave[i], T.heave[j], k);
    var v = j > i ? T.v[j] : T.v[i];
    st.speed = v;
    st.vx = (T.x[j] - T.x[i]) * FPS; st.vz = -(T.z[j] - T.z[i]) * FPS;
    st.dist = Math.max(0, T.len - lerp(T.cum[i], T.cum[j], k));
    return T.seg[i];
  }
  function segTime() {   // giây tính từ đầu đoạn hiện tại, theo đúng cách đoạn đã lấy mẫu
    var s = st.T.segs[st.seg];
    return clamp(st.tt * FPS - s.i0, 0, s.i1 - s.i0) * s.dur / Math.max(1, s.n);
  }

  // Tiếng nền theo buổi: chiều = amb_lobby_Afternoon + chim xa; tối = amb_lobby_Night + sóng đêm (mòng biển chỉ có DayTime 0/1). [DtD]
  function loopsFor() {
    return st.time === 'day' ? [['amb', 'boat_amb_day', 0.5], ['gull', 'boat_seagull', 0.18]] : [['amb', 'boat_amb_night', 0.5], ['gull', 'boat_amb_night_wave', 0.35]];
  }
  function ambience(on) {
    if (!on) return;
    ensureLoops();
  }
  function ensureLoops() {
    var S = st.snd;
    loopsFor().forEach(function (a) { if (!S[a[0]] && AU.buf[a[1]]) S[a[0]] = sfx(a[1], { loop: true, vol: a[2] }); });
    if (!S.music && AU.buf.boat_bgm_lobby) S.music = sfx('boat_bgm_lobby', { loop: true, vol: 0.28 });
    if (!S.idle && AU.buf.boat_engine_idle) S.idle = sfx('boat_engine_idle', { loop: true, vol: 0 });
    if (!S.run && AU.buf.boat_engine_loop) S.run = sfx('boat_engine_loop', { loop: true, vol: 0 });
  }

  var HINTS = {
    rev: 'Nổ máy ở bến quán…', leave: 'Rời quán…', respawn: 'Dave leo lên thuyền…', depart: 'Nổ máy…',
    dive: 'Dave chuẩn bị nhảy xuống…', docked: 'Về tới quán',
  };
  function hint() {
    if (!st || !st.ui) return;
    var s = st.state, out = st.dir === 'out', h = HINTS[s] || '';
    if (s === 'cruise') h = out ? 'Cano tự chạy ra Hố Xanh…' : 'Cano tự chạy về quán…';
    else if (s === 'arrive') h = out ? 'Tới Hố Xanh' : 'Cập bến quán';
    if (st.ui.hint.textContent !== h) st.ui.hint.textContent = h;
  }

  var tmp3 = [0, 0, 0], wv = [0, 0, 0];
  // Mặt sóng tại (x, z) three: độ cao theo đúng hàm sóng của shader nước (DynamicEnvironmentBoatFloating dò ±5 m).
  function waveY(x, z, t) { return waveAt(W.WP, x, -z, t, wv)[1]; }
  function poseBoat(t) {
    var b = W.boatRoot, y = L.times[W.time].water.y + HEIGHT_OFF;
    y += sampleTrack(IDLE, t % CLIP.Boat_Idle001.length, tmp3)[1];   // [DtD] nhấp nhô Boat_Idle001
    y += st.heave;                                                   // [DtD] nhún của clip đang phát (Exit00x)
    // sóng dưới mũi và đuôi (±5 m, rollAmount 0,01 của DynamicEnvironmentBoatFloating)
    var c = Math.cos(st.yaw), s = Math.sin(st.yaw);
    var hb = waveY(st.x - 5 * c, st.z + 5 * s, t), hs = waveY(st.x + 5 * c, st.z - 5 * s, t);
    y += (hb + hs) * 0.5;
    var wavePitch = Math.atan2(hb - hs, 10);
    b.position.set(st.x, y, st.z);
    b.rotation.set(-st.roll * DEG, st.yaw, st.pitch * DEG - wavePitch);
    b.updateMatrixWorld(true);
  }

  function updateDave(dt) {
    var d = st.dave, A = B.dave.anims[d.anim], dave = W.dave;
    d.t += dt;
    // clip một lần (Respawn, Boat_Surprise) chạy hết thì về Idle; Diveready giữ khung cuối tới lúc tối màn
    if (A && !A.loop && d.anim !== 'Diveready' && d.t >= A.length) { daveAnim('Idle'); A = B.dave.anims.Idle; }
    var col = 0;
    if (A && A.frames) {
      var t = A.loop ? d.t % A.length : Math.min(d.t, A.length - 1e-4), acc = 0;
      for (var i = 0; i < A.frames.length; i++) { acc += A.frames[i][1]; if (t < acc) { col = A.frames[i][0]; break; } col = A.frames[i][0]; }
    }
    setCell(W.daveMat, assets.dave, B.dave.cell[0], B.dave.cell[1], col, A ? A.row : 0, d.flip);
    dave.visible = d.visible;
    dave.position.set(d.x, d.y, d.z);
    dave.rotation.set(0, -st.yaw, 0);
  }
  function setCell(mat, tex, cellW, cellH, col, row, flip) {
    var Wt = tex.image.width, Ht = tex.image.height, r = mat.uniforms.uRect.value;
    var u0 = col * cellW / Wt, v0 = 1 - (row + 1) * cellH / Ht, du = cellW / Wt, dv = cellH / Ht;
    if (flip) r.set(u0 + du, v0, -du, dv); else r.set(u0, v0, du, dv);
  }

  // Camera: đúng tư thế camera sảnh gốc (thấy cả chỗ đậu lẫn quán). Màn thấp (điện thoại ngang) kéo lại gần chỗ đậu cho
  // cano và Dave khỏi bé [ĐỀ XUẤT]. Mũi hoặc đuôi cano sắp ra khỏi khung (ngoài PAN_ZONE bề ngang) thì xoay ngang theo,
  // cano vào lại vùng thì quay dần về hướng gốc [ĐỀ XUẤT].
  var PAN_ZONE = 0.88, PAN_RATE = 3;   // [ĐỀ XUẤT]
  var HULL = Math.max(-B.boat.bboxGltf.min[0], B.boat.bboxGltf.max[0]);   // [DtD] nửa thân cano ~6,4 m
  var UP = new THREE.Vector3(0, 1, 0), tmpF = new THREE.Vector3(), tmpD = new THREE.Vector3();
  function camNear() { return lerp(0.74, 1, clamp((innerHeight - 390) / (720 - 390), 0, 1)); }
  function snapCamera() { placeCamera(0, true); }
  function panTarget(cx, cz) {
    var fx = CAMF[0], fz = CAMF[2], fl = Math.hypot(fx, fz); fx /= fl; fz /= fl;
    var th = Math.atan(Math.tan(B.sea.camera.fov / 2 * DEG) * innerWidth / Math.max(1, innerHeight));
    var lim = Math.atan(PAN_ZONE * Math.tan(th)), hi = 0, lo = 0, c = Math.cos(st.yaw), s = Math.sin(st.yaw);
    for (var e = -1; e <= 1; e += 2) {   // mũi và đuôi (mũi = −x cục bộ)
      var px = st.x - e * HULL * c, pz = st.z + e * HULL * s, dx = px - cx, dz = pz - cz;
      var al = Math.atan2(dx * -fz + dz * fx, dx * fx + dz * fz);   // góc ngang so với hướng nhìn gốc, phải +
      hi = Math.max(hi, al - lim); lo = Math.min(lo, al + lim);
    }
    return hi > 0 ? hi : lo < 0 ? lo : 0;
  }
  function placeCamera(dt, snap) {
    var cam = W.cam, n = camNear(), wy = L.times[W.time].water.y;
    var cx = LOBBY[0] + (CAM0[0] - LOBBY[0]) * n, cy = wy + (CAM0[1] - wy) * n, cz = LOBBY[2] + (CAM0[2] - LOBBY[2]) * n;
    var pt = panTarget(cx, cz);
    st.pan = snap ? pt : st.pan + (pt - st.pan) * (1 - Math.exp(-PAN_RATE * dt));
    cam.position.set(cx, cy, cz);
    tmpF.set(CAMF[0], CAMF[1], CAMF[2]).applyAxisAngle(UP, -st.pan);
    cam.lookAt(tmpD.copy(cam.position).add(tmpF));
    cam.aspect = innerWidth / Math.max(1, innerHeight);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  function engineSound() {
    var S = st.snd, k = clamp(Math.abs(st.speed) / st.T.vmax, 0, 1), running = st.state !== 'respawn' && st.state !== 'docked' && st.state !== 'load';
    var gunning = st.state === 'depart' || st.state === 'rev' ? 0.08 : 0;   // đang nổ máy rời chỗ đậu: máy gằn hơn một chút [ĐỀ XUẤT]
    if (S.idle) S.idle.gain.gain.value = running ? 0.35 * (1 - k * 0.7) : 0;
    if (S.run) {
      S.run.gain.gain.value = running ? 0.12 + 0.4 * k + gunning : 0;
      S.run.src.playbackRate.value = 0.75 + 0.7 * k + gunning * 0.75;
    }
  }

  function update(dt) {
    if (!st || st.done) return;
    audioTick();
    if (!W || st.state === 'load') return;
    ensureLoops();
    st.t += dt; st.st += dt;
    ENV.uTime.value = st.t;
    var fx = W.fx, tm = st.time, T = st.T;
    if (st.state !== 'dive' && st.state !== 'docked') {
      // đang phát dãy khung: đổi đoạn thì gọi SEG_START; hết dãy thì chiều ra sang cú lặn, chiều về cập bến quán
      st.tt = Math.min(T.dur, st.tt + dt);
      var k0 = trackAt(st.tt);
      while (st.seg < k0) enterSeg(st.seg + 1);
      if (!st.boosted && st.speed > 5) { st.boosted = true; fx.setRun(tm + ':exit', ['Booster'], 'once', 1); sfx('boat_drive', { vol: 0.5 }); }
      if (st.tt >= T.dur) {
        st.speed = 0; st.vx = st.vz = 0;
        if (st.dir === 'out') { setState('dive'); daveAnim('Walk', false); } else { setState('docked'); daveAnim('Idle'); }
      }
    } else if (st.state === 'dive') {
      // [DtD] LobbyPlayer: đi trên boong 2,7 m/s tới mép m_MoveArea, chạy Diveready tại chỗ (clip không có track vị trí),
      // màn tối dần từ divingFadePercentage (60%) của clip. Độ dài lúc tối hẳn = hết clip [ĐỀ XUẤT: số trong code IL2CPP].
      var d = st.dave, DR = B.dave.anims.Diveready;
      if (d.anim === 'Walk') {
        d.x = Math.min(WALK_X, d.x + PL.moveSpeed * dt);
        st.stepT -= dt;
        if (st.stepT <= 0) { st.stepT = 0.25; sfx('boat_foot', { vol: 0.5, rate: 0.95 + Math.random() * 0.1 }); }
        if (d.x >= WALK_X) { daveAnim('Diveready', false); sfx('boat_dive', { vol: 0.6 }); }
      } else if (d.anim === 'Diveready') {
        var f0 = PL.divingFadePercentage * DR.length;
        st.fadeK = clamp((d.t - f0) / Math.max(0.1, DR.length - f0), 0, 1);
        if (d.t >= DR.length + 0.15) finish();
      }
    } else {
      // cập bến quán: đứng yên một nhịp rồi tối màn sang bếp [ĐỀ XUẤT: 1,4 s + 0,5 s]
      if (st.st > 1.4) st.fadeK = clamp((st.st - 1.4) / 0.5, 0, 1);
      if (st.st > 1.9) finish();
    }
    if (!st || st.done) return;

    // VFX: vệt nước/bọt hai bên và sau đuôi theo tốc độ; đứng yên thì sóng lăn tăn Idle
    var k = clamp(Math.abs(st.speed) / T.vmax, 0, 1), q = HX.game.fps < 40 ? 0.5 : 1, ex = tm + ':exit', parts = ['Back', 'Tube_Side', 'Side', 'SideL', 'SideR'];
    fx.mul(ex, parts, k * q);
    fx.sets[ex].list.forEach(function (e) {
      if (parts.indexOf(e.part) < 0) return;
      if (!e.on && k > 0.05) e.start('run');
      if (e.on && e.mode === 'run' && k <= 0.02) e.stop();
    });
    fx.mul(tm + ':idle', null, clamp(1 - k * 2.5, 0, 1));

    poseBoat(st.t);
    updateDave(dt);
    placeCamera(dt);
    fx.cam = W.cam;
    fx.frames(W.boatRoot.matrixWorld);
    fx.update(dt, W.cam);
    lightsFrame();
    animateScenery(st.t);
    engineSound();
    hint();
    hud();
    traceFrame();
  }

  var tmpP = [0, 0, 0];
  function animateScenery(t) {
    var cam = W.cam;
    // nước bám camera, bước bằng 3 mắt lưới cho đỉnh sóng khỏi trôi
    var step = 900 / 130 * 3;
    W.water.position.x = Math.round(cam.position.x / step) * step;
    W.water.position.z = Math.round((cam.position.z - 250) / step) * step;
    W.water.position.y = 0;
    // trời: quả cầu skybox theo camera; vòng sương và trăng dời theo camera so với chỗ camera sảnh [ĐỀ XUẤT]
    W.sky.position.copy(cam.position); W.sky.scale.setScalar(B.sea.camera.far * 0.9);
    var ox = cam.position.x - CAM0[0], oz = cam.position.z - CAM0[2];
    W.ring.position.set(ox, 0, oz); W.moon.position.set(ox, 0, oz);
    W.clouds.forEach(function (c) {
      var a = c.anim, ks = a.tracks[''].posKeys, tt = (t + 40) % a.length, CP = L.times.day.cloudsParent;
      hermite(ks, tt, tmpP);
      c.node.position.set(CP[0] + tmpP[0], CP[1] + tmpP[1], -(CP[2] + tmpP[2]));
    });
    W.anims.forEach(function (s) {
      var an = s.an, tt = (t + s.t0) % an.length, acc = 0, col = an.frames[0][0];
      for (var i = 0; i < an.frames.length; i++) { acc += an.frames[i][1]; col = an.frames[i][0]; if (tt < acc) break; }
      setCell(s.mesh.material, assets.anim, B.sea.animSprites.cell[0], B.sea.animSprites.cell[1], col, an.row, s.flip);
      if (s.path) {
        var tr = s.path.tracks[Object.keys(s.path.tracks)[0]];
        hermite(tr.posKeys, (t + s.t0) % s.path.length, tmpP);
        s.mesh.position.set(tmpP[0], tmpP[1], -tmpP[2]);
      }
    });
  }

  function hud() {
    var ui = st.ui, k = st.total ? 1 - st.dist / st.total : 1;
    ui.fill.style.width = (clamp(k, 0, 1) * 100).toFixed(1) + '%';
    ui.mark.style.left = (clamp(k, 0, 1) * 100).toFixed(1) + '%';
    var dtxt = Math.round(st.dist) + ' m';
    if (ui.dist.textContent !== dtxt) ui.dist.textContent = dtxt;
    var sp = String(Math.round(Math.abs(st.speed) * 3.6));
    if (ui.speed.textContent !== sp) ui.speed.textContent = sp;
    ui.fade.style.opacity = st.fadeK.toFixed(3);
  }

  // ---------------------------------------------------------------- vẽ: lượt độ sâu → cảnh (tuyến tính, HDR nếu được) → loá sáng → lớp chỉnh màu URP
  // Lớp chỉnh màu theo URP (UberPost + LutBuilder): cộng bloom, viền tối ApplyVignette (d = |uv − tâm| × cường độ × 3,
  // pow(saturate(1 − d·d), độ mịn × 5)), phơi sáng 2^ev, tương phản trên không gian LogC quanh ACEScc_MIDGRAY, bão hoà quanh độ sáng.
  var POST_FRAG = [
    'uniform sampler2D tMap; uniform sampler2D tBloom; uniform float uBloom; uniform vec3 uBloomTint; uniform float uHasBloom;',
    'uniform vec3 uVigCol; uniform float uVig; uniform vec2 uVigC; uniform float uVigS;',
    'uniform float uExpo; uniform float uCon; uniform float uSat; varying vec2 vUv;',
    'vec3 toLogC(vec3 x) { return mix(5.301883 * x + 0.092819, 0.244161 * log(5.555556 * x + 0.047996) / log(10.0) + 0.386036, step(0.011361, x)); }',
    'vec3 fromLogC(vec3 x) { return mix((x - 0.092819) / 5.301883, (pow(vec3(10.0), (x - 0.386036) / 0.244161) - 0.047996) / 5.555556, step(5.301883 * 0.011361 + 0.092819, x)); }',
    'vec3 enc(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }',
    'void main() {',
    '  vec3 c = texture2D(tMap, vUv).rgb;',
    '  if (uHasBloom > 0.5) { vec3 b = texture2D(tBloom, vUv, 1.0).rgb * 0.3 + texture2D(tBloom, vUv, 2.5).rgb * 0.35 + texture2D(tBloom, vUv, 4.0).rgb * 0.35; c += b * uBloom * uBloomTint; }',
    '  vec2 d = abs(vUv - uVigC) * uVig * 3.0; float vf = pow(clamp(1.0 - dot(d, d), 0.0, 1.0), uVigS * 5.0); c *= mix(uVigCol, vec3(1.0), vf);',
    '  c *= exp2(uExpo);',
    '  vec3 lg = toLogC(c); lg = (lg - 0.4135884) * (uCon / 100.0 + 1.0) + 0.4135884; c = max(fromLogC(lg), 0.0);',
    '  float l = dot(c, vec3(0.2126729, 0.7151522, 0.072175)); c = l + (uSat / 100.0 + 1.0) * (c - l);',
    '  gl_FragColor = vec4(enc(clamp(c, 0.0, 1.0)), 1.0);',
    '}',
  ].join('\n');
  // Lọc ngưỡng loá sáng như URP Bloom (ngưỡng tuyến tính, gối mềm = ngưỡng × 0,5), rồi lấy mipmap thay chuỗi làm mờ [ĐỀ XUẤT]
  var PRE_FRAG = [
    'uniform sampler2D tMap; uniform float uThr; varying vec2 vUv;',
    'void main() { vec3 c = texture2D(tMap, vUv).rgb; float br = max(c.r, max(c.g, c.b)); float kn = uThr * 0.5;',
    '  float sf = clamp(br - uThr + kn, 0.0, 2.0 * kn); sf = sf * sf / (4.0 * kn + 1e-4);',
    '  float m = max(br - uThr, sf) / max(br, 1e-4); gl_FragColor = vec4(c * m, 1.0); }',
  ].join('\n');
  var tmpV2 = new THREE.Vector2();
  function ensureRt(r) {
    var size = r.getDrawingBufferSize(tmpV2);
    if (!W.rt) {
      var gl2 = r.capabilities.isWebGL2;
      var hdr = gl2 && r.extensions.has('EXT_color_buffer_float');
      W.hdr = hdr;
      W.rt = new THREE.WebGLRenderTarget(size.x, size.y, { samples: gl2 ? 4 : 0, depthBuffer: true, type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType });
      W.depthRt = new THREE.WebGLRenderTarget(size.x, size.y, { depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
      W.depthRt.depthTexture = new THREE.DepthTexture(size.x, size.y, THREE.UnsignedIntType);
      W.bloomRt = new THREE.WebGLRenderTarget(Math.max(1, size.x >> 1), Math.max(1, size.y >> 1), { type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
        minFilter: THREE.LinearMipmapLinearFilter, generateMipmaps: true, depthBuffer: false });
      W.bloomRt.texture.generateMipmaps = true;
      var vs = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
      var geo = new THREE.PlaneGeometry(2, 2);
      var m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
        uniforms: { tMap: { value: W.rt.texture }, tBloom: { value: W.bloomRt.texture }, uBloom: { value: 0 }, uBloomTint: { value: new THREE.Vector3(1, 1, 1) },
          uHasBloom: { value: 0 }, uVigCol: { value: new THREE.Vector3() }, uVig: { value: 0 }, uVigC: { value: new THREE.Vector2(0.5, 0.5) }, uVigS: { value: 0.2 },
          uExpo: { value: 0 }, uCon: { value: 0 }, uSat: { value: 0 } },
        depthTest: false, depthWrite: false, vertexShader: vs, fragmentShader: POST_FRAG,
      }));
      m.frustumCulled = false;
      var pre = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: { tMap: { value: W.rt.texture }, uThr: { value: 1 } }, depthTest: false, depthWrite: false, vertexShader: vs, fragmentShader: PRE_FRAG }));
      pre.frustumCulled = false;
      var sc = new THREE.Scene(); sc.add(m);
      var sc2 = new THREE.Scene(); sc2.add(pre);
      W.copy = { mesh: m, scene: sc, pre: pre, preScene: sc2, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
    } else if (W.rt.width !== size.x || W.rt.height !== size.y) {
      W.rt.setSize(size.x, size.y); W.depthRt.setSize(size.x, size.y); W.bloomRt.setSize(Math.max(1, size.x >> 1), Math.max(1, size.y >> 1));
    }
    RES_U.value.set(size.x, size.y);
    W.wu.uRes.value.set(size.x, size.y);
  }

  function render() {
    if (!st || !W || st.state === 'load' || st.done) return;
    var r = HX.game.gfx.renderer, cam = W.cam;
    ensureRt(r);
    // 1. độ sâu các vật đặc (lớp 0): nước và hạt đọc để tính bọt chạm thân cano / hạt mềm
    cam.layers.set(0);
    r.setRenderTarget(W.depthRt);
    r.render(W.scene, cam);
    DEPTH_U.value = W.depthRt.depthTexture;
    var u = W.wu;
    u.tDepth.value = W.depthRt.depthTexture; u.uNear.value = cam.near; u.uFar.value = cam.far;
    u.uInvProj.value.copy(cam.projectionMatrixInverse); u.uCamWorld.value.copy(cam.matrixWorld);
    // 2. cảnh đầy đủ
    cam.layers.enableAll();
    r.setRenderTarget(W.rt);
    r.render(W.scene, cam);
    st.stats = { calls: r.info.render.calls, triangles: r.info.render.triangles };
    // 3. loá sáng + chỉnh màu
    var C = W.copy, PU = C.mesh.material.uniforms;
    PU.uHasBloom.value = POST.bloomI > 0 ? 1 : 0;
    if (POST.bloomI > 0) {
      C.pre.material.uniforms.uThr.value = lin1(POST.bloomThr);
      r.setRenderTarget(W.bloomRt);
      r.render(C.preScene, C.cam);
      var tn = linV(POST.bloomTint), lu = tn.x * 0.2126729 + tn.y * 0.7151522 + tn.z * 0.072175;
      PU.uBloomTint.value.copy(lu > 0 ? tn.multiplyScalar(1 / lu) : new THREE.Vector3(1, 1, 1));
      PU.uBloom.value = POST.bloomI;
    }
    PU.uVigCol.value.copy(linV(POST.vig)); PU.uVig.value = POST.vigI; PU.uVigC.value.set(POST.vigC[0], POST.vigC[1]); PU.uVigS.value = POST.vigS;
    PU.uExpo.value = POST.exposure; PU.uCon.value = POST.contrast; PU.uSat.value = POST.saturation;
    r.setRenderTarget(null);
    r.render(C.scene, C.cam);
  }

  function finish() {
    if (!st || st.done) return;
    st.done = true;
    if (st.trace) st.trace.end = st.dir === 'out' ? 'loading' : 'kitchen';
    HX.game.go(st.dir === 'out' ? 'loading' : 'kitchen');
  }

  function exit() {
    if (!st) return;
    st.done = true;
    audioStopAll(0.3);
    if (W) { W.fx.clear(); releaseGpu(); }
    if (st.ui) st.ui.root.innerHTML = '';
    st = null;
  }

  // Nạp trước (chỉ tải và giải mã, chưa đưa lên GPU) khi người chơi đang ở màn chuẩn bị.
  var preTimer = setInterval(function () {
    if (HX.game && (HX.game.phase === 'prep' || HX.game.phase === 'result')) { clearInterval(preTimer); preload().catch(function () { /* nạp lại lúc vào pha */ }); }
  }, 1000);

  HX.phases = HX.phases || {};
  HX.phases.boat = {
    surface: 'scene',
    enter: enter, exit: exit, update: update, render: render,
    // móc chỉ-đọc cho test/ho-xanh-boat.js; trace() = các chuyến đã ghi khi mở trang với ?boattrace=1
    trace: function () { return TRACE; },
    info: function () {
      if (!st) return { active: false };
      var T = st.T, sg = st.seg >= 0 ? T.segs[st.seg] : null, ndc = null;
      if (W && st.state !== 'load') {
        var v = new THREE.Vector3(RESTO[0], RESTO[1], -RESTO[2]).project(W.cam);
        ndc = [v.x, v.y, v.z];
      }
      return {
        active: true, dir: st.dir, time: st.time, state: st.state, dist: st.dist, total: st.total, speed: st.speed,
        x: st.x, z: st.z, yaw: st.yaw, loaded: !!W && st.state !== 'load', fade: st.fadeK,
        tt: st.tt, dur: T.dur, seg: sg ? { id: sg.id, kind: sg.kind, clip: sg.clip, cam: sg.cam, t: segTime() } : null,
        segs: T.segs.map(function (s) { return s.id + ':' + s.kind + (s.clip ? ':' + s.clip : ''); }),
        mooring: { x: LOBBY[0], z: LOBBY[2] }, restaurant: [RESTO[0], RESTO[1], -RESTO[2]], restaurantNdc: ndc,
        distRestaurant: Math.hypot(st.x - RESTO[0], -st.z - RESTO[2]), pan: st.pan,
        dave: { anim: st.dave.anim, visible: st.dave.visible, x: st.dave.x, t: st.dave.t },
        live: W ? W.fx.list.length : 0, groups: W ? Object.keys(W.fx.groups).map(function (k) { return k.split('|')[0] + ':' + W.fx.groups[k].n; }) : [], vmax: T.vmax,
        stats: st.stats || null, hdr: W ? !!W.hdr : null,
      };
    },
  };
})(window.HX = window.HX || {});
