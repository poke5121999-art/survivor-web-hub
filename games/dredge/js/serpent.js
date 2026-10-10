/*
 * Rắn Gale Cliffs (GCMonster) — mối đe doạ trong các hành lang của Gale Cliffs (WORLD-GAPS.md §4 và §6 đơn vị R1). Dữ liệu: data/serpent.js (tools/serpent.py).
 *
 * GCMonsterManager.cs (Game.unity: GaleCliffsMonsterManager):
 *   11 GCMonsterSpawnTrigger (hộp trigger 15 × 5 × 2 m, layer 7) — thuyền chạm trigger thì TrySpawnFromTrigger(tuyến, hướng) (:25-31): chỉ một con cùng lúc,
 *   không khi SuppressSpawns (OnFinaleVoyageStarted), không khi Banish đang bật. KHÔNG có điều kiện worldPhase (worldPhaseMin 1 của MonsterData không ai đọc) và
 *   không có giờ. Sinh ở điểm 0 của tuyến, đặt biến "spawned-gc-monster" (hội thoại Hermit đọc).
 *   11 GCMonsterHole (hộp trigger quanh lỗ vách): đầu rắn (RockCollider, tag Monster) chạm thì OnMonsterReachedHole (:44-69): ≥ 3 s kể từ lần trước, đá cùng đảo
 *   KHÁC lỗ báo động (rung + bụi) sau Random(0, 2) s, đá của đúng lỗ này rơi sau Random(0, 2) s (FallingRocks.cs).
 * GCMonster.cs (máy trạng thái PATROLLING / MOVING_TO_PLAYER / MOVING_TO_PLAYER_GHOST / ATTACKING / MOVING_TO_DESPAWN / NONE):
 *   Init (:176-185): bắt đầu ở tốc độ patrolSpeed 0,7, DoPatrolRoute. Mắt (:196-): canEyesSee = !forceEyesShut && !banish && độ sâu nước ≥ attackDepthThreshold 0,03;
 *   ba FieldOfView (Near 15 m 360°, Middle 15 m 180°, Far 50 m 60°, mỗi 0,25 s, tia chắn layer 7/15); thấy thuyền, không PASSIVE, chưa săn / cắn và đường đi tới được
 *   (CanReachTarget: điểm gần nhất trên NavMesh cách thuyền < arriveThreshold 2) → OnPlayerDetected (:299-320): săn bằng TargetFollow (đích = thuyền + hướng × overshoot 4 → 0,
 *   làm mới 0,25 s, chặn đường khi < 1 m; không có đường thì mất dấu). Săn mà mắt không còn thấy: sau playerLostThreshold 3 s → DoLosePlayer (:331-352): còn tới được thì
 *   GHOST (chạy tới chỗ cuối thấy thuyền) rồi về tuyến gần nhất, không thì về tuyến gần nhất. Săn quá maxChaseTimeSec 30 s → MoveToDespawn. Cách thuyền < attackDistanceThreshold 6 m,
 *   tia tới thuyền không vướng đảo → DoAttack (:354-369): trigger 'attack' (GaleCliffMonster_Attack 2,333 s, sự kiện AnimationComplete), tốc độ ×attackMovementSpeedMultiplier 100
 *   (kẹp attackMaxBoatSpeed 100), VariablePlayerDamager (2 ô, +1 ở NIGHTMARE, một lần, không requireOneHealthToKill, không miễn sát thương) nghe PlayerDetector (capsule r 2 cao 10 ở đầu):
 *   chạm thuyền → hỏng ô, SFX 'Gale Cliffs Monster - Attack', hitVFX BoatDamageFX, MoveToDespawn (:371-378). Hết hoạt ảnh mà chưa chạm → MOVING_TO_PLAYER.
 *   MoveToDespawn (:442-462): mắt nhắm hẳn, đi tới tuyến thoát có điểm đầu ở phía trước mũi nhất (:487-512) rồi Despawn (:463-478): tắt dần âm thanh / volume 2 s rồi huỷ.
 *   Banish bật (:213-224): TriggerThreatBanished, tiếng Banished, mắt nhắm, MoveToDespawn; manager không sinh trong lúc Banish bật (:25-31).
 *   Tốc độ (:267-286): moveSpeedScalar 0,15 · clamp(huntSpeed 0,8 · MovementSpeedModifier, 20, 40) khi săn (tuần tra patrolSpeed 0,7, thoát fleeSpeed 0,8, cắn ×100 kẹp 100), Lerp(dt).
 *   Proximity (:259-266): săn / cắn thì target = 1 − InverseLerp(10, 25, khoảng cách thuyền) (cập nhật mỗi 0,2 s), nếu không 0 (Banish −1), Lerp(dt); cây trộn 1D của
 *   Animator trên PivotTarget: −1 chìm (y −1), 0 lặn (y 0), 1 trồi (y 1,5) — rắn nổi lên khi tới gần.
 *   Tiếng: Idle Loop / Aggro Loop hoà theo targetFollow (Lerp dt), Call / Aggro Call 1-3 mỗi 10-20 s (DoCallAudio :250-266), Target khi phát hiện (10 s một lần).
 * Hình: GaleCliffMonster.prefab (gốc tỉ lệ 0,7; PivotTarget → Animator thân [SwimEyeClosed / SwimEyeOpen / Attack] → head_jnt + 9 đốt spine_jnt chạy TransformFollower
 *   (LateUpdate, tốc độ 2) + SkinnedMesh 9091 đỉnh với Monster_Shader (như Night Angler); y gốc = NavMesh GC_Eel + baseOffset. Volume cục bộ MonsterProfile (như angler).
 *
 *   DRSerpent.update(dt)   (js/boat.js gọi mỗi khung, dt = 0 khi tạm dừng)
 *   DRSerpent.suppress(on) OnFinaleVoyageStarted → không sinh nữa (finale.js gọi)
 *   DRSerpent.debug → { list(), manager(), clear(), fire(i), trigger(name), los(ax, az, bx, bz), path(a, b), walkable(x, z), set y(v) }
 */
(function (root) {
  'use strict';
  const T = root.THREE, S = root.DR_SERPENT;
  if (!T || !S || !S.nodes) { root.DRSerpent = null; return; }
  const MD = S.data, MM = S.monster, MG = S.manager, AG = S.agent, AU = S.audio, NAV = S.nav;
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
  const ST = { NONE: 0, PATROLLING: 1, MOVING_TO_PLAYER: 2, MOVING_TO_PLAYER_GHOST: 3, MOVING_TO_DESPAWN: 4, ATTACKING: 5 };
  const STN = Object.keys(ST);
  const ROOT_Y = NAV.y + AG.baseOffset;                       // NavMeshAgent: độ cao NavMesh + baseOffset (−0,05)
  const G_DIR = { FORWARDS: 0, BACKWARDS: 1 };

  // ---------------------------------------------------------------- âm thanh: 5 clip chưa có trong data/audio.js (tools/serpent.py mã hoá thêm)
  (function registerAudio() {
    const A = root.DR_AUDIO;
    if (!A) return;
    for (const nm in AU.extra) A['monster.galeextra.' + nm.replace(/^Gale Cliffs Monster - /, '').replace(/\s+/g, '').toLowerCase()] = AU.extra[nm];
  })();

  // ---------------------------------------------------------------- lưới NavMesh GC_Eel (1 m, bit đóng gói), A* và tia
  const NW = NAV.w, NH = NAV.h, NX0 = NAV.x0, NZ0 = NAV.z0;
  const GRID = (function () {
    const b = atob(NAV.bits), g = new Uint8Array(NW * NH);
    for (let k = 0; k < g.length; k++) g[k] = (b.charCodeAt(k >> 3) >> (7 - (k & 7))) & 1;
    return g;
  })();
  const walk = (i, j) => i >= 0 && j >= 0 && i < NW && j < NH && GRID[j * NW + i] === 1;
  const walkable = (x, z) => walk(Math.floor(x - NX0), Math.floor(z - NZ0));
  // NavMesh.SamplePosition: ô đi được gần nhất trong bán kính r (vòng vuông tăng dần)
  function sample(x, z, r) {
    if (walkable(x, z)) return { x, z };
    const ci = Math.floor(x - NX0), cj = Math.floor(z - NZ0), R = Math.ceil(r);
    let best = null, bd = Infinity;
    for (let d = 1; d <= R; d++) {
      if (best && d * d > bd) break;
      for (let a = -d; a <= d; a++) for (const [i, j] of [[ci + a, cj - d], [ci + a, cj + d], [ci - d, cj + a], [ci + d, cj + a]]) {
        if (!walk(i, j)) continue;
        const px = NX0 + i + 0.5, pz = NZ0 + j + 0.5, dd = (px - x) * (px - x) + (pz - z) * (pz - z);
        if (dd < bd && dd <= r * r) { bd = dd; best = { x: px, z: pz }; }
      }
    }
    return best;
  }
  function lineBlocked(a, b) {                                   // Bresenham có kiểm ô kề ở bước chéo
    let i = a[0], j = a[1];
    const di = Math.abs(b[0] - i), dj = Math.abs(b[1] - j), si = i < b[0] ? 1 : -1, sj = j < b[1] ? 1 : -1;
    let err = di - dj;
    for (;;) {
      if (!walk(i, j)) return true;
      if (i === b[0] && j === b[1]) return false;
      const e2 = 2 * err;
      let ni = i, nj = j;
      if (e2 > -dj) { err -= dj; ni += si; }
      if (e2 < di) { err += di; nj += sj; }
      if (ni !== i && nj !== j && (!walk(ni, j) || !walk(i, nj))) return true;
      i = ni; j = nj;
    }
  }
  const SQ2 = Math.SQRT2, NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];
  function astar(si, sj, ti, tj, i0, j0, w, h) {
    const n = w * h, Gc = new Float32Array(n).fill(Infinity), par = new Int32Array(n).fill(-1), closed = new Uint8Array(n);
    const heap = [], push = (f, k) => {
      heap.push([f, k]); let c = heap.length - 1;
      while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; }
    }, pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last; let c = 0;
        for (;;) {
          const l = 2 * c + 1, r = l + 1; let m = c;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m;
        }
      }
      return top;
    };
    const hf = (i, j) => { const dx = Math.abs(i - ti), dz = Math.abs(j - tj); return dx + dz + (SQ2 - 2) * Math.min(dx, dz); };
    const s = (sj - j0) * w + (si - i0), t = (tj - j0) * w + (ti - i0);
    Gc[s] = 0; push(hf(si, sj), s);
    while (heap.length) {
      const [, k] = pop();
      if (closed[k]) continue;
      if (k === t) { const out = []; for (let c = t; c !== -1; c = par[c]) out.push([i0 + c % w, j0 + (c / w | 0)]); return out.reverse(); }
      closed[k] = 1;
      const i = i0 + k % w, j = j0 + (k / w | 0);
      for (const [di, dj, c] of NB) {
        const ni = i + di, nj = j + dj;
        if (ni < i0 || nj < j0 || ni >= i0 + w || nj >= j0 + h || !walk(ni, nj)) continue;
        if (di && dj && (!walk(i + di, j) || !walk(i, j + dj))) continue;
        const nk = (nj - j0) * w + (ni - i0), ng = Gc[k] + c;
        if (ng < Gc[nk]) { Gc[nk] = ng; par[nk] = k; push(ng + hf(ni, nj), nk); }
      }
    }
    return null;
  }
  // NavMesh.CalculatePath: {pts [{x,z}…], end} — đích được kéo về ô đi được gần nhất trong snap m (đường cụt tới điểm gần nhất, như đường "partial" của Unity)
  function findPath(a, b, snap) {
    const sa = sample(a.x, a.z, 8), sb = sample(b.x, b.z, snap == null ? 8 : snap);
    if (!sa || !sb) return null;
    const si = Math.floor(sa.x - NX0), sj = Math.floor(sa.z - NZ0), ti = Math.floor(sb.x - NX0), tj = Math.floor(sb.z - NZ0);
    let cells = null;
    for (const margin of [40, 120, 400]) {
      const i0 = Math.max(0, Math.min(si, ti) - margin), j0 = Math.max(0, Math.min(sj, tj) - margin);
      const i1 = Math.min(NW - 1, Math.max(si, ti) + margin), j1 = Math.min(NH - 1, Math.max(sj, tj) + margin);
      cells = astar(si, sj, ti, tj, i0, j0, i1 - i0 + 1, j1 - j0 + 1);
      if (cells || (i0 === 0 && j0 === 0 && i1 === NW - 1 && j1 === NH - 1)) break;
    }
    if (!cells) return null;
    const keep = [cells[0]];
    let at = 0;
    while (at < cells.length - 1) {
      let far = at + 1;
      for (let k = cells.length - 1; k > at + 1; k--) if (!lineBlocked(cells[at], cells[k])) { far = k; break; }
      keep.push(cells[far]); at = far;
    }
    const pts = keep.map(c => ({ x: NX0 + c[0] + 0.5, z: NZ0 + c[1] + 0.5 }));
    pts[0] = { x: sa.x, z: sa.z }; pts[pts.length - 1] = { x: sb.x, z: sb.z };
    return { pts, end: pts[pts.length - 1] };
  }

  // ---------------------------------------------------------------- tầm nhìn (layer 7/15 = đảo, vách): landmask của DRWorld [ĐỀ XUẤT như js/angler.js]
  function los(ax, az, bx, bz) {
    const W = root.DRWorld, d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d));
    if (!W || !W.sdf) return true;
    for (let i = 1; i < n; i++) { const k = i / n; if (W.sdf(ax + (bx - ax) * k, az + (bz - az) * k) <= 0) return false; }
    return true;
  }

  // ---------------------------------------------------------------- toán học Unity (tay trái; z three = −z Unity): Euler ZXY, LookRotation
  const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
  function qeuler(x, y, z) {                                      // Quaternion.Euler: Y · X · Z
    const h = D2R / 2, sx = Math.sin(x * h), cx = Math.cos(x * h), sy = Math.sin(y * h), cy = Math.cos(y * h), sz = Math.sin(z * h), cz = Math.cos(z * h);
    return qmul([0, sy, 0, cy], qmul([sx, 0, 0, cx], [0, 0, sz, cz]));
  }
  function qrot(q, v) {
    const [x, y, z, w] = q, tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
    return [v[0] + w * tx + y * tz - z * ty, v[1] + w * ty + z * tx - x * tz, v[2] + w * tz + x * ty - y * tx];
  }
  function qmat(q) {
    const [x, y, z, w] = q;
    return [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
      [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]];
  }
  function eulerOf(q) {                                           // eulerAngles (độ) của R = Ry·Rx·Rz
    const m = qmat(q), sx = clamp(-m[1][2], -1, 1);
    if (Math.abs(sx) > 0.999999) return [Math.asin(sx) * R2D, Math.atan2(-m[2][0], m[0][0]) * R2D, 0];
    return [Math.asin(sx) * R2D, Math.atan2(m[0][2], m[2][2]) * R2D, Math.atan2(m[1][0], m[1][1]) * R2D];
  }
  function lookRotation(f, up) {
    let l = Math.hypot(f[0], f[1], f[2]) || 1;
    const z = [f[0] / l, f[1] / l, f[2] / l];
    let x = [up[1] * z[2] - up[2] * z[1], up[2] * z[0] - up[0] * z[2], up[0] * z[1] - up[1] * z[0]];
    l = Math.hypot(x[0], x[1], x[2]);
    if (l < 1e-6) x = [1, 0, 0]; else x = [x[0] / l, x[1] / l, x[2] / l];
    const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    const m00 = x[0], m01 = y[0], m02 = z[0], m10 = x[1], m11 = y[1], m12 = z[1], m20 = x[2], m21 = y[2], m22 = z[2], tr = m00 + m11 + m22;
    let q;
    if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4]; }
    else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; q = [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]; }
    else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; q = [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s]; }
    else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; q = [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s]; }
    const n = Math.hypot(q[0], q[1], q[2], q[3]);
    return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
  }

  // ---------------------------------------------------------------- giải mã mesh (xem tools/serpent.py: UV có thể ngoài [0,1])
  function bytes(s) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function geometry(M) {
    const g = new T.BufferGeometry(), q = new Int16Array(bytes(M.pos).buffer), pos = new Float32Array(q.length);
    for (let i = 0; i < q.length; i++) { const c = i % 3; pos[i] = M.min[c] + (q[i] + 32768) / 65535 * (M.max[c] - M.min[c]); }
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    const uq = new Uint16Array(bytes(M.uv).buffer), uv = new Float32Array(uq.length);
    for (let i = 0; i < uq.length; i++) { const c = i % 2; uv[i] = M.uvMin[c] + uq[i] / 65535 * (M.uvMax[c] - M.uvMin[c]); }
    g.setAttribute('uv', new T.BufferAttribute(uv, 2));
    g.setAttribute('skinIndex', new T.BufferAttribute(new Uint16Array(bytes(M.skinIndex)), 4));
    g.setAttribute('skinWeight', new T.BufferAttribute(bytes(M.skinWeight), 4, true));
    g.setIndex(new T.BufferAttribute(new Uint16Array(bytes(M.index).buffer), 1));
    return g;
  }

  // ---------------------------------------------------------------- hoạt ảnh (AnimationCurve Hermite; như js/angler.js)
  function hermite(keys, t, n, out) {
    const last = keys[keys.length - 1];
    let a = keys[0], b = keys[0];
    if (t >= last[0]) a = b = last;
    else if (t > keys[0][0]) for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { a = keys[i - 1]; b = keys[i]; break; }
    if (a === b) { for (let c = 0; c < n; c++) out[c] = a[1 + c]; return out; }
    const d = b[0] - a[0], u = (t - a[0]) / d, u2 = u * u, u3 = u2 * u;
    for (let c = 0; c < n; c++) {
      const m0 = a[1 + 2 * n + c], m1 = b[1 + n + c];
      if (!isFinite(m0) || !isFinite(m1)) { out[c] = a[1 + c]; continue; }
      out[c] = (2 * u3 - 3 * u2 + 1) * a[1 + c] + (u3 - 2 * u2 + u) * m0 * d + (-2 * u3 + 3 * u2) * b[1 + c] + (u3 - u2) * m1 * d;
    }
    return out;
  }
  const CLIPS = S.clips, _v = [0, 0, 0, 0];
  for (const k in CLIPS) {
    const c = CLIPS[k];
    c.byNode = {};
    for (const cv of c.curves) (c.byNode[cv.node] = c.byNode[cv.node] || {})[cv.kind] = cv.keys;
    c.nodes = Object.keys(c.byNode).map(Number);
  }
  const pose = () => ({ p: new T.Vector3(), q: new T.Quaternion(), s: new T.Vector3() });
  function sample1(clip, t, node, out) {
    const r = S.nodes[node], c = clip.byNode[node];
    out.p.fromArray(r.p); out.q.fromArray(r.q); out.s.fromArray(r.s);
    if (!c) return out;
    if (c.p) { hermite(c.p, t, 3, _v); out.p.set(_v[0], _v[1], _v[2]); }
    if (c.q) { hermite(c.q, t, 4, _v); out.q.set(_v[0], _v[1], _v[2], _v[3]).normalize(); }
    if (c.s) { hermite(c.s, t, 3, _v); out.s.set(_v[0], _v[1], _v[2]); }
    return out;
  }
  const clipT = (c, t) => (c.loop ? ((t % c.len) + c.len) % c.len : Math.min(t, c.len));
  const AN = S.animator.GaleCliffMonsterAnimator, DEPTH = S.animator.GaleCliffMonsterDepthAnimator, SS = AN.states;
  const ATTACK = 'GaleCliffMonster_Attack', CLOSED = 'SwimEyeClosed', OPEN = 'SwimEyeOpen';
  const TREE = DEPTH.states[DEPTH.default].tree;

  // ---------------------------------------------------------------- vật liệu (Monster_Shader_0, như js/angler.js; ở đây EmissionStrength 8 và khoảng 100 m)
  let monsterMat = null, geoSkin = null, scene = null;
  function materials() {
    const L = new T.TextureLoader(), M = S.mat;
    const alb = L.load(M.albedo), emi = L.load(M.emission);
    alb.encoding = T.sRGBEncoding; emi.encoding = T.LinearEncoding;
    alb.wrapS = alb.wrapT = emi.wrapS = emi.wrapT = T.RepeatWrapping;
    monsterMat = new T.MeshBasicMaterial({ map: alb });
    const um = { uEmis: { value: emi }, uEmisDist: { value: M.emissionEffectiveDistance }, uEmisK: { value: M.emissionStrength } };
    monsterMat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, um);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uEmis; uniform float uEmisDist; uniform float uEmisK;')
        .replace('#include <output_fragment>', `
  vec3 wpA = vDrFogW;
  vec3 litA = diffuseColor.rgb * (uDrSunCol + drEnvLights(wpA) + uDrAmb + (1.0 - drEnvMaskB(wpA.xz)) + vec3(uDrTintK, 0.0, 0.0));
  vec3 emA = clamp(drS2L(texture2D(uEmis, vUv).rgb) * (1.0 - clamp(vFogDepth / uEmisDist, 0.0, 1.0)), 0.0, 1.0) * uEmisK;
  gl_FragColor = vec4(litA, 1.0);`)
        .replace('#include <fog_fragment>', '#include <fog_fragment>\n  gl_FragColor.rgb += linearToOutputTexel(vec4(emA, 1.0)).rgb;');
    };
    monsterMat.customProgramCacheKey = () => 'drSerpentMonster';
    geoSkin = geometry(S.skin.mesh);
  }
  function sceneOf() {
    if (scene) return scene;
    let o = root.DRBoat && DRBoat.root;
    while (o && o.parent) o = o.parent;
    if (o && o.isScene) { scene = o; materials(); }
    return scene;
  }
  function build() {
    const nodes = S.nodes.map((n, i) => {
      const o = S.skin.bones.includes(i) ? new T.Bone() : new T.Object3D();
      o.name = n.name; o.position.fromArray(n.p); o.quaternion.fromArray(n.q); o.scale.fromArray(n.s);
      return o;
    });
    S.nodes.forEach((n, i) => { if (n.parent >= 0) nodes[n.parent].add(nodes[i]); });
    const skin = new T.SkinnedMesh(geoSkin, monsterMat);
    skin.name = 'GaleCliffMonster 1';
    skin.frustumCulled = false;                                   // AABB gốc rất lớn; một con, 11,8 nghìn tam giác
    skin.bind(new T.Skeleton(S.skin.bones.map(i => nodes[i]), S.skin.bindPoses.map(a => new T.Matrix4().fromArray(a))), new T.Matrix4());
    nodes[S.skin.node].add(skin);
    return { root: nodes[0], nodes, skin };
  }
  const NI = {};
  S.nodes.forEach((n, i) => { NI[n.name + (NI[n.name] !== undefined ? '#' : '')] = i; });
  const N_ROOT = 0, N_PIVOT = 1, N_BODY = 2, N_HEAD = NI.head_jnt, N_FX = NI.BoatDamageFX, N_WAKE = NI.BoatTrailParticles, N_VOL = N_ROOT;
  const EYES = S.eyes.map(e => ({ node: e.node, r: e.viewRadius, a: e.viewAngle, iv: e.interval }));

  // ---------------------------------------------------------------- thuyền: hộp định hướng (collider tag Player, như js/tentacle.js / angler.js) và capsule của đầu
  const PC = (root.DR_BOAT && DR_BOAT.colliderSize && DR_BOAT.colliderSize.player) || { center: [0, 0.376, 0], size: [1.216, 0.648, 2.529] };
  const _a = new T.Vector3(), _b = new T.Vector3(), _c = new T.Vector3();
  function hullObb() {
    const bob = root.DRBoat && DRBoat.bob;
    if (!bob) return null;
    bob.updateWorldMatrix(true, false);
    const e = bob.matrixWorld.elements, h = [PC.size[0] / 2, PC.size[1] / 2, PC.size[2] / 2], ax = [];
    for (let i = 0; i < 3; i++) {
      const v = [e[i * 4], e[i * 4 + 1], e[i * 4 + 2]], l = Math.hypot(v[0], v[1], v[2]) || 1;
      ax.push({ u: [v[0] / l, v[1] / l, v[2] / l], h: h[i] * l });
    }
    const p = _c.set(PC.center[0], PC.center[1], -PC.center[2]).applyMatrix4(bob.matrixWorld);
    return { p: [p.x, p.y, p.z], ax };
  }
  function pointObb(o, x, y, z) {
    const d = [x - o.p[0], y - o.p[1], z - o.p[2]];
    let s = 0;
    for (const a of o.ax) { const t = d[0] * a.u[0] + d[1] * a.u[1] + d[2] * a.u[2], ex = Math.abs(t) - a.h; if (ex > 0) s += ex * ex; }
    return Math.sqrt(s);
  }
  // PlayerDetector: capsule dọc trục z cục bộ của nút (r 2, cao 10, nút tỉ lệ 100 dưới đầu 0,01 dưới gốc 0,7 → r thế giới 1,4, dài 7)
  function detectorHits(m) {
    const C = S.collider.detector, n = m.o.nodes[C.node], hull = hullObb();
    if (!hull) return false;
    n.updateWorldMatrix(true, false);
    const e = n.matrixWorld.elements, sc = Math.hypot(e[0], e[1], e[2]), half = Math.max(0, C.height / 2 - C.radius);
    _a.set(C.center[0], C.center[1], C.center[2] - half).applyMatrix4(n.matrixWorld);
    _b.set(C.center[0], C.center[1], C.center[2] + half).applyMatrix4(n.matrixWorld);
    for (let i = 0; i <= 8; i++) {
      const k = i / 8;
      if (pointObb(hull, lerp(_a.x, _b.x, k), lerp(_a.y, _b.y, k), lerp(_a.z, _b.z, k)) < C.radius * sc) return true;
    }
    return false;
  }
  // hộp trigger (trục ax, az trong three.js) so với thuyền (đường tròn bán kính 1,3 quanh tâm thuyền: nửa chiều dài thân 1,26 [ĐỀ XUẤT])
  const BOAT_R = 1.3;
  function inBox(bx, x, z, pad) {
    const dx = x - bx.c[0], dz = z - bx.c[1], u = dx * bx.ax[0] + dz * bx.ax[1], v = dx * bx.az[0] + dz * bx.az[1];
    const ex = Math.max(0, Math.abs(u) - bx.h[0]), ez = Math.max(0, Math.abs(v) - bx.h[1]);
    return ex * ex + ez * ez <= (pad || 0) * (pad || 0);
  }

  // ---------------------------------------------------------------- một con rắn
  const list = [];
  let clock = 0, lastMode = 'NORMAL', banish = false, suppressed = false, isSpawned = false, lastRock = -Infinity;
  const gameMode = () => (root.DRMenus && DRMenus.gameMode ? DRMenus.gameMode() : 'NORMAL');
  const boatPos = () => { const b = root.DR.s.boat, y = root.DRBoat && DRBoat.root ? DRBoat.root.position.y : 0; return { x: b.x, y, z: b.z }; };

  function spawnSerpent(routeIdx, direction) {
    const sc = sceneOf();
    if (!sc) return null;
    const rt = MG.routes[routeIdx], o = build();
    sc.add(o.root);
    const m = {
      o, route: routeIdx, x: rt.pts[0][0], z: rt.pts[0][1], yaw: rt.yaw0, vx: 0, vz: 0, y: ROOT_Y, done: false, age: 0,
      state: ST.NONE, canEyesSee: false, forceEyesShut: false, banishActive: false, loseAt: null, chase: 0, didHit: false, listeners: false,
      follow: false, move: false, pf: false, target: null, tpos: null, lastSet: -Infinity, patrol: null, pathIndex: 0, route2: null, corners: null, ci: 0,
      speed: MD.patrolSpeed, lerped: MD.patrolSpeed, depth: 0, depthT: Infinity, prox: 0, proxT: Infinity, proxCur: 0, proxLerp: 0, idleVol: 0, blendAmb: true,
      lastDetectAudio: -Infinity, lastCall: -Infinity, nextCall: 0, reachT: 0, reachOk: false,
      eyes: EYES.map(() => ({ last: -Infinity, tracked: false })),
      // Animator trạng thái
      cur: CLOSED, curT: 0, prev: null, prevT: 0, blend: 1, blendDur: 0, detects: false, attackTrig: false, swimClock: 0,
      fadeK: 0, fadeFrom: 0, fadeTo: 1, fadeT: 0, timers: [], fol: []
    };
    // Init: patrolRoute (:176-185)
    m.patrol = { route: rt.pts, startIndex: direction !== G_DIR.FORWARDS ? rt.pts.length - 1 : 0, direction };
    // TransformFollower: currentPos khởi đầu = vị trí đốt lúc đặt (Start / OnEnable)
    o.root.position.set(m.x, m.y, m.z); o.root.rotation.set(0, m.yaw, 0);
    animate(m, 0);
    o.root.updateMatrixWorld(true);
    for (const f of S.followers) { o.nodes[f.node].getWorldPosition(_a); m.fol.push([_a.x, _a.y, -_a.z]); }
    m.wake = root.DRParticles ? DRParticles.spawn(S.particles.wake[0], { parent: o.nodes[N_WAKE], loop: true }) : null;
    const vp = { x: m.x, y: 0, z: m.z };
    m.snd = {};
    if (root.DRAudio) for (const k of ['idle', 'aggro']) m.snd[k] = DRAudio.voice(AU[k].clip, { loop: true, vol: 0, pos: vp, min: AU[k].min, max: AU[k].max });
    list.push(m);
    isSpawned = true;
    root.DR.s.vars['spawned-gc-monster'] = true;                    // GCMonsterManager.SpawnMonster :44
    doPatrolRoute(m, m.patrol);
    root.DR.emit('serpentSpawned', { route: rt.name, x: m.x, z: m.z });
    return m;
  }
  function destroy(m) {
    if (m.done) return;
    m.done = true;
    if (m.o.root.parent) m.o.root.parent.remove(m.o.root);
    m.o.skin.skeleton.dispose();
    if (m.wake) m.wake.stop();
    for (const k in m.snd) if (m.snd[k]) m.snd[k].stop(0.2);
    const i = list.indexOf(m);
    if (i >= 0) list.splice(i, 1);
    isSpawned = list.length > 0;                                   // OnMonsterDespawned
    root.DR.emit('serpentGone', { route: MG.routes[m.route].name });
  }

  // ---------------------------------------------------------------- NavMeshAgent (như js/angler.js agentStep) trên lưới GC_Eel
  function setDestination(m, x, z) {
    const p = findPath({ x: m.x, z: m.z }, { x, z });
    m.corners = p ? p.pts : null; m.ci = p ? 1 : 0;
    return p;
  }
  function setPath(m, p) { m.corners = p.pts; m.ci = 1; }
  function agentStep(m, dt) {
    let dx = 0, dz = 0, want = 0;
    if (m.corners && m.ci < m.corners.length) {
      let c = m.corners[m.ci], d = Math.hypot(c.x - m.x, c.z - m.z);
      while (d < 0.5 && m.ci < m.corners.length - 1) { m.ci++; c = m.corners[m.ci]; d = Math.hypot(c.x - m.x, c.z - m.z); }
      if (d >= 0.05) { dx = (c.x - m.x) / d; dz = (c.z - m.z) / d; want = m.speed; }
      if (d < 0.05 || (m.ci === m.corners.length - 1 && d < m.speed * dt)) want = Math.min(want, d / Math.max(dt, 1e-4));
    }
    const tx = dx * want - m.vx, tz = dz * want - m.vz, tl = Math.hypot(tx, tz), mx = AG.acceleration * dt;
    if (tl > mx) { m.vx += tx / tl * mx; m.vz += tz / tl * mx; } else { m.vx += tx; m.vz += tz; }
    const sp = Math.hypot(m.vx, m.vz);
    if (sp > m.speed && sp > 0) { m.vx *= m.speed / sp; m.vz *= m.speed / sp; }
    m.x += m.vx * dt; m.z += m.vz * dt;
    if (sp > 0.05) {                                              // updateRotation: quay về hướng vận tốc, angularSpeed °/s; hướng tiến three = (−sin θ, −cos θ)
      const goal = Math.atan2(-m.vx, -m.vz);
      let d = goal - m.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      const st = AG.angularSpeed * D2R * dt;
      m.yaw += clamp(d, -st, st);
    }
  }
  const fwd = m => [-Math.sin(m.yaw), -Math.cos(m.yaw)];

  // ---------------------------------------------------------------- SimplePathFollow, TargetFollow, TargetMove
  function pathInit(m, rc) { m.route2 = rc; m.pathIndex = rc.startIndex; m.pf = true; setDestination(m, rc.route[m.pathIndex][0], rc.route[m.pathIndex][1]); }
  function pathUpdate(m) {                                         // SimplePathFollow.Update (:53-91)
    const rc = m.route2;
    if (!m.pf || !rc) return;
    const n = rc.route.length;
    if ((rc.direction === G_DIR.FORWARDS && m.pathIndex >= n) || (rc.direction === G_DIR.BACKWARDS && m.pathIndex < 0)) return;
    const p = rc.route[m.pathIndex];
    if (!(Math.hypot(m.x - p[0], m.z - p[1], ROOT_Y) < S.pathFollow.waypointDistanceThreshold)) return;   // y điểm tuyến = 0, y rắn = ROOT_Y
    m.pathIndex += rc.direction === G_DIR.FORWARDS ? 1 : -1;
    if ((rc.direction === G_DIR.FORWARDS && m.pathIndex >= n) || (rc.direction === G_DIR.BACKWARDS && m.pathIndex < 0)) onPathComplete(m);
    else setDestination(m, rc.route[m.pathIndex][0], rc.route[m.pathIndex][1]);
  }
  function followUpdate(m) {                                       // TargetFollow.Update (:35-68)
    if (!m.follow) return;
    const t = m.target;
    const dist = Math.hypot(t.x - m.x, t.z - m.z);
    if (dist < S.follow.pathLockThreshold || !(clock > m.lastSet + S.follow.timeBetweenPathRefreshesSec)) return;
    let ok = false, p = null, num = S.follow.overshootDistance;
    do {
      const l = Math.hypot(t.x - m.x, t.z - m.z) || 1, px = t.x + (t.x - m.x) / l * num, pz = t.z + (t.z - m.z) / l * num;
      p = findPath({ x: m.x, z: m.z }, { x: px, z: pz });
      if (p) ok = Math.hypot(px - p.end.x, pz - p.end.z) < S.follow.arriveThreshold;
      num--;
    } while (!ok && num >= 0);
    if (ok) { setPath(m, p); m.lastSet = clock; }
    else doLosePlayer(m);                                           // OnPathError
  }
  function moveUpdate(m) {                                         // TargetMove.Update: tới điểm cuối thấy thuyền (đo 3 chiều tới vị trí thuyền lúc đó)
    if (!m.move) return;
    if (Math.hypot(m.x - m.tpos.x, ROOT_Y - m.tpos.y, m.z - m.tpos.z) < S.move.waypointDistanceThreshold) findClosestPatrolRoute(m);   // OnMoveToPlayerGhostComplete
  }

  // ---------------------------------------------------------------- GCMonster
  function canReach(m, t) {                                        // CanReachTarget (:279-291)
    const p = findPath({ x: m.x, z: m.z }, { x: t.x, z: t.z });
    return !!p && Math.hypot(t.x - p.end.x, t.z - p.end.z) < MM.arriveThreshold;
  }
  function onPlayerDetected(m, t) {
    m.loseAt = null;
    m.detects = true;                                              // animator.SetBool("detectsPlayer", true)
    if (m.state === ST.PATROLLING) m.chase = 0;
    m.state = ST.MOVING_TO_PLAYER;
    m.move = false; m.follow = true; m.target = t; m.lastSet = -Infinity;
    if (clock > m.lastDetectAudio + MM.timeBetweenPlayerDetectionAudioClips) {
      m.lastDetectAudio = clock;
      playAt(m, AU.detected.clip, AU.detected);
      doCallAudio(m);
    }
    root.DR.emit('serpentHunt', { route: MG.routes[m.route].name });
  }
  function onPlayerDetectionLost(m) { m.loseAt = clock + MD.playerLostThreshold; }          // LosePlayerDelayed
  function doLosePlayer(m) {
    m.loseAt = null;
    m.follow = false;
    m.detects = false;
    const t = m.target;
    if (t && canReach(m, t)) {
      m.state = ST.MOVING_TO_PLAYER_GHOST;
      m.move = true; m.tpos = { x: t.x, y: t.y, z: t.z };
      setDestination(m, t.x, t.z);
    } else findClosestPatrolRoute(m);
  }
  function tryDoAttack(m) {                                        // :316-323: tia từ rắn tới ColliderCenter của thuyền, layer đảo; trúng thuyền đầu tiên thì cắn
    const b = boatPos();
    if (los(m.x, m.z, b.x, b.z)) doAttack(m);
  }
  function doAttack(m) {
    m.state = ST.ATTACKING; m.didHit = false; m.listeners = true; m.attackTrig = true;
    root.DR.emit('serpentAttack', { route: MG.routes[m.route].name });
  }
  function onAttackComplete(m) {
    m.listeners = false;
    if (!m.didHit) m.state = ST.MOVING_TO_PLAYER;
  }
  function onPlayerHit(m) {                                        // VariablePlayerDamager.OnPlayerHit + GCMonster.OnPlayerHit (:340-347)
    m.listeners = false; m.didHit = true;
    let pts = S.damager.damagePoints;
    if (gameMode() === 'NIGHTMARE') pts += S.damager.extraDamageInNightmareMode;
    if (root.DRBoat && DRBoat.monsterHit) DRBoat.monsterHit(pts, { requireOneHealth: !!S.damager.requireOneHealthToKill, source: 'GCMonster' });
    if (root.DRAudio) DRAudio.play(AU.attack, undefined, undefined, { pos: { x: m.x, y: 0, z: m.z }, min: 10, max: 100 });
    if (root.DRParticles) DRParticles.spawn(S.particles.hit[0], { parent: m.o.nodes[N_FX] });   // hitVFX = BoatDamageFX (nút bị tắt trong prefab, hạt vẫn chạy khi spawn)
    moveToDespawn(m);
  }
  function findClosestPatrolRoute(m) {                             // FindClosestRoute (:526-565) + DoPatrolRoute / MoveToDespawn
    const f = fwd(m);
    let best = -Infinity, br = -1, bj = -1;
    MG.routes.forEach((r, ri) => {
      for (let j = 1; j < r.pts.length - 1; j++) {
        const lx = r.pts[j][0] - m.x, lz = r.pts[j][1] - m.z, ly = -ROOT_Y, dist = Math.hypot(lx, ly, lz);
        const sc = (lx * f[0] + lz * f[1]) / (dist + 0.01);
        if (sc > best) { best = sc; br = ri; bj = j; }
      }
    });
    if (br < 0) { moveToDespawn(m); return; }
    const r = MG.routes[br].pts;
    let dir = G_DIR.FORWARDS;
    if (bj > 0 && bj < r.length - 1) {
      const v = [r[bj][0] - m.x, 0 - 0, r[bj][1] - m.z], v2 = [r[bj - 1][0] - r[bj][0], r[bj - 1][1] - r[bj][1]], v3 = [r[bj + 1][0] - r[bj][0], r[bj + 1][1] - r[bj][1]];
      const nv = Math.hypot(v[0], v[2]) || 1, n2 = Math.hypot(v2[0], v2[1]) || 1, n3 = Math.hypot(v3[0], v3[1]) || 1;
      const d3v = (v[0] * v3[0] + v[2] * v3[1]) / (nv * n3), d2v = (v[0] * v2[0] + v[2] * v2[1]) / (nv * n2);
      dir = d3v > d2v ? G_DIR.FORWARDS : G_DIR.BACKWARDS;
    }
    doPatrolRoute(m, { route: r, startIndex: bj, direction: dir });
  }
  function doPatrolRoute(m, rc) {
    doCallAudio(m);
    m.state = ST.PATROLLING; m.follow = false; m.move = false;
    pathInit(m, rc);
  }
  function onPathComplete(m) {
    m.pf = false;
    if (m.state === ST.PATROLLING || m.state === ST.MOVING_TO_DESPAWN) despawn(m);
  }
  function moveToDespawn(m) {
    m.move = false; m.follow = false; m.forceEyesShut = true; m.detects = false;
    let best = -Infinity, br = null;
    const f = fwd(m);
    for (const r of MG.exitRoutes) {                               // FindClosestExitRoute (:489-512): chỉ điểm đầu, góc so với hướng mũi
      const lx = r[0][0] - m.x, lz = r[0][1] - m.z, ly = -ROOT_Y, dist = Math.hypot(lx, ly, lz), sc = (lx * f[0] + lz * f[1]) / (dist + 0.01);
      if (sc > best) { best = sc; br = r; }
    }
    if (br) { m.state = ST.MOVING_TO_DESPAWN; pathInit(m, { route: br, startIndex: 0, direction: G_DIR.FORWARDS }); root.DR.emit('serpentDespawn', { route: MG.routes[m.route].name }); }
    else destroy(m);
  }
  function despawn(m) {                                            // :463-478: tắt dần volume / âm thanh trong ambienceFadeDurationSec rồi huỷ
    m.blendAmb = false; m.state = ST.NONE; m.pf = false;
    m.fadeFrom = m.fadeK; m.fadeTo = 0; m.fadeT = 0;
    m.fadeOutT = MM.ambienceFadeDurationSec; m.idleFrom = m.snd.idle ? m.idleVol : 0;
  }
  function playAt(m, key, src, rate) {
    if (root.DRAudio) DRAudio.play(key, src.vol, rate, { pos: { x: m.x, y: 0, z: m.z }, min: src.min, max: src.max });
  }
  function doCallAudio(m) {                                        // :250-266
    if (clock < m.lastCall + MM.callAudioDelayMin) return;
    const set = m.state === ST.PATROLLING ? AU.idleCalls : (m.state === ST.MOVING_TO_PLAYER || m.state === ST.MOVING_TO_PLAYER_GHOST) ? AU.aggroCalls : null;
    if (set) playAt(m, set[Math.floor(Math.random() * set.length)], AU.call, lerp(MM.callAudioPitchMin, MM.callAudioPitchMax, Math.random()));
    m.lastCall = clock;
    m.nextCall = lerp(MM.callAudioDelayMin, MM.callAudioDelayMax, Math.random());
  }

  // ---------------------------------------------------------------- Animator
  function setState(m, name, dur) { m.prev = m.cur; m.prevT = m.curT; m.cur = name; m.curT = 0; m.blendDur = dur; m.blend = dur > 0 ? 0 : 1; }
  function transitions(m) {                                        // AnimatorStateTransition của GaleCliffMonsterAnimator (điều kiện If = 1 / IfNot = 2, exitTime)
    const c = CLIPS[SS[m.cur].clip];
    for (const t of AN.transitions) {
      if (t.from !== m.cur) continue;
      let ok = true;
      for (const [p, mode] of t.when) {
        const v = p === 'attack' ? m.attackTrig : m.detects;
        if ((mode === 1 && !v) || (mode === 2 && v)) ok = false;
      }
      if (t.exitTime != null && !(m.curT / c.len >= t.exitTime)) ok = false;
      if (!ok) continue;
      if (t.when.some(w => w[0] === 'attack')) m.attackTrig = false;
      setState(m, t.to, t.duration);
      return;
    }
  }
  const _p1 = pose(), _p2 = pose();
  function animate(m, dt) {
    const o = m.o;
    // Animator PivotTarget: cây trộn 1D theo Proximity (−1 chìm, 0 lặn, 1 trồi)
    const kids = TREE.children, v = clamp(m.proxLerp, kids[0].t, kids[kids.length - 1].t);
    let i = 0; while (i < kids.length - 2 && v > kids[i + 1].t) i++;
    const a = kids[i], b = kids[i + 1], w = (v - a.t) / (b.t - a.t);
    sample1(CLIPS[a.clip], 0, N_PIVOT, _p1); sample1(CLIPS[b.clip], 0, N_PIVOT, _p2);
    o.nodes[N_PIVOT].position.copy(_p1.p).lerp(_p2.p, w);
    // Animator thân: SwimEyeClosed ⇄ SwimEyeOpen ⇄ GaleCliffMonster_Attack
    const cs = CLIPS[SS[m.cur].clip], t0 = m.curT;
    m.curT += dt * SS[m.cur].speed;
    if (m.prev) m.prevT += dt * SS[m.prev].speed;
    if (m.blend < 1) { m.blend = Math.min(1, m.blend + dt / m.blendDur); if (m.blend >= 1) m.prev = null; }
    for (const e of cs.events) if (e.t > t0 && e.t <= m.curT && e.fn === 'AnimationComplete') onAttackComplete(m);
    if (dt > 0) transitions(m);
    const cur = CLIPS[SS[m.cur].clip], prv = m.prev ? CLIPS[SS[m.prev].clip] : null;
    for (const ni of cur.nodes) {
      sample1(cur, clipT(cur, m.curT), ni, _p1);
      if (prv) { sample1(prv, clipT(prv, m.prevT), ni, _p2); _p1.p.lerp(_p2.p, 1 - m.blend); _p1.q.slerp(_p2.q, 1 - m.blend); _p1.s.lerp(_p2.s, 1 - m.blend); }
      const n = o.nodes[ni]; n.position.copy(_p1.p); n.quaternion.copy(_p1.q); n.scale.copy(_p1.s);
    }
  }
  // TransformFollower.LateUpdate cho 9 đốt sống (không gian Unity: z đảo). Vị trí / góc đốt = hàm của đốt cha và độ trễ lerp(speed·dt).
  const _m = new T.Matrix4(), _inv = new T.Matrix4(), _q = new T.Quaternion(), _pq = new T.Quaternion(), _s = new T.Vector3(), _s2 = new T.Vector3(), _pp = new T.Vector3(), _wp = new T.Vector3();
  function followers(m, dt) {
    const o = m.o;
    o.root.updateMatrixWorld(true);
    S.followers.forEach((f, k) => {
      const par = o.nodes[f.parent], me = o.nodes[f.node];
      par.updateWorldMatrix(true, false);
      par.matrixWorld.decompose(_pp, _pq, _s);
      const P = [_pp.x, _pp.y, -_pp.z], Rp = [-_pq.x, -_pq.y, _pq.z, _pq.w];
      const rv = qrot(Rp, f.offset), b = [P[0] + rv[0], P[1] + rv[1], P[2] + rv[2]], cur = m.fol[k], t = Math.min(1, dt * f.speed);
      for (let c = 0; c < 3; c++) cur[c] = lerp(cur[c], b[c], t);
      const dx = cur[0] - P[0], dy = cur[1] - P[1], dz = cur[2] - P[2], l = Math.hypot(dx, dy, dz) || 1;
      const pos = [P[0] + dx / l * f.dist, P[1] + dy / l * f.dist, P[2] + dz / l * f.dist];
      const e = eulerOf(lookRotation([P[0] - pos[0], P[1] - pos[1], P[2] - pos[2]], [0, 1, 0]));
      const q = qeuler(e[0] + f.rot[0], e[1] + f.rot[1], e[2] + f.rot[2]);
      // thế giới Unity → three → cục bộ của nút cha (tỉ lệ thế giới = tỉ lệ cha × tỉ lệ cục bộ của đốt)
      const ls = S.nodes[f.node].s, mp = me.parent;
      mp.updateWorldMatrix(true, false);
      mp.matrixWorld.decompose(_pp, _pq, _s);
      _s2.set(_s.x * ls[0], _s.y * ls[1], _s.z * ls[2]);
      _q.set(-q[0], -q[1], q[2], q[3]);
      _m.compose(_wp.set(pos[0], pos[1], -pos[2]), _q, _s2);
      _inv.copy(mp.matrixWorld).invert();
      _m.premultiply(_inv);
      _m.decompose(me.position, me.quaternion, _s2);
      me.updateMatrixWorld(true);
    });
  }

  // ---------------------------------------------------------------- một khung (GCMonster.Update :196-286)
  function eyeFind(m, e, i) {
    if (dbg.blind) return false;                                   // móc kiểm thử: mắt không thấy gì
    const E = EYES[i];
    m.o.nodes[E.node].getWorldPosition(_a);
    const b = boatPos(), f = fwd(m), dx = b.x - _a.x, dz = b.z - _a.z, dist = Math.hypot(dx, dz);
    if (dist > E.r + 1) return false;                              // OverlapSphere(viewRadius) vs collider thuyền (+1 m bán kính thân [ĐỀ XUẤT])
    const ang = Math.acos(clamp((dx * f[0] + dz * f[1]) / (dist || 1), -1, 1)) * R2D;
    if (!(ang < E.a / 2)) return false;
    return los(_a.x, _a.z, b.x, b.z);                              // Physics.Raycast(obstacleMask) không trúng đảo
  }
  function tick(m, dt) {
    const b = boatPos();
    m.age += dt;
    // DepthMonitor (0,25 s) và PlayerProximityMonitor (0,2 s)
    if ((m.depthT += dt) > S.depthMonitor.updateSec) { m.depthT = 0; m.depth = root.DRWorld ? DRWorld.depth01(m.x, m.z) : 1; }
    if ((m.proxT += dt) > S.proximity.updateSec) { m.proxT = 0; m.prox = Math.hypot(m.x - b.x, ROOT_Y - b.y, m.z - b.z); }
    for (let i = 0; i < EYES.length; i++) {                         // FieldOfView.Update: tìm mỗi interval
      const ey = m.eyes[i];
      if (clock > ey.last + EYES[i].iv) { ey.tracked = eyeFind(m, ey, i); ey.last = clock; }
    }
    const anyTracked = m.eyes.some(e => e.tracked);
    // [ĐỀ XUẤT] đang neo ở bến thì rắn không săn / cắn (bản web teleport thuyền vào bến; bản gốc thuyền vẫn là vật thể trong nước)
    m.canEyesSee = !m.forceEyesShut && !m.banishActive && m.depth >= MM.attackDepthThreshold && root.DR.mode !== 'dock';
    const mode = gameMode();
    if (m.canEyesSee && mode !== 'PASSIVE' && m.state !== ST.MOVING_TO_PLAYER && m.state !== ST.ATTACKING && anyTracked) {
      if ((m.reachT -= dt) <= 0) {                                  // CanReachTarget mỗi khung ở bản gốc; ở đây 0,1 s một lần cho đường không tới được [ĐỀ XUẤT]
        m.reachT = 0.1;
        const tgt = { x: b.x, y: b.y, z: b.z };
        if (canReach(m, tgt)) { m.reachT = 0; onPlayerDetected(m, tgt); }
      }
    }
    if (m.canEyesSee && m.state === ST.MOVING_TO_PLAYER && m.loseAt === null && !anyTracked) onPlayerDetectionLost(m);
    if (m.loseAt !== null && clock >= m.loseAt) doLosePlayer(m);
    if (m.follow && m.target) { m.target.x = b.x; m.target.y = b.y; m.target.z = b.z; }   // TargetFollow bám GameObject thuyền: vị trí hiện tại
    if (m.state === ST.MOVING_TO_PLAYER || m.state === ST.MOVING_TO_PLAYER_GHOST) {
      m.chase += dt;
      if (m.chase >= MM.maxChaseTimeSec) { doCallAudio(m); moveToDespawn(m); }
    }
    if (m.state === ST.MOVING_TO_PLAYER && Math.hypot(m.x - b.x, ROOT_Y - b.y, m.z - b.z) < MM.attackDistanceThreshold) tryDoAttack(m);
    if (m.state === ST.MOVING_TO_PLAYER || m.state === ST.ATTACKING) m.proxCur = 1 - invLerp(MM.proximityAnimatorThresholdNear, MM.proximityAnimatorThresholdFar, m.prox);
    else m.proxCur = m.banishActive ? -1 : 0;
    m.proxLerp = lerp(m.proxLerp, m.proxCur, Math.min(1, dt));
    // tốc độ (:267-286)
    const mod = (root.DRBoat && DRBoat.stats && DRBoat.stats.moveMod) || 10;
    let sp = MD.patrolSpeed;
    switch (m.state) {
      case ST.MOVING_TO_PLAYER: case ST.MOVING_TO_PLAYER_GHOST: sp = MD.huntSpeed; break;
      case ST.ATTACKING: sp = MD.huntSpeed * MM.attackMovementSpeedMultiplier; break;
      case ST.MOVING_TO_DESPAWN: sp = MD.fleeSpeed; break;
      default: sp = MD.patrolSpeed;
    }
    const goal = MM.moveSpeedScalar * clamp(sp * mod, MM.boatSpeedMin, m.state === ST.ATTACKING ? MM.attackMaxBoatSpeed : MM.boatSpeedMax);
    m.goal = goal;
    m.lerped = lerp(m.lerped, goal, Math.min(1, dt));
    m.speed = m.lerped;
    // các thành phần điều hướng (thứ tự Update trong một khung không quan trọng)
    pathUpdate(m); followUpdate(m); moveUpdate(m);
    agentStep(m, dt);
    // PlayerDetector chạm thuyền khi đang cắn
    if (m.listeners && !m.didHit && detectorHits(m)) onPlayerHit(m);
    // lỗ vách: đầu rắn (RockCollider) chạm GCMonsterHole → rơi đá
    m.o.nodes[N_HEAD].getWorldPosition(_a);
    for (const h of MG.holes) {
      const inside = inBox(h.box, _a.x, _a.z, 0);
      if (inside && !(m.inHole && m.inHole[h.name])) reachedHole(h);
      (m.inHole = m.inHole || {})[h.name] = inside;
    }
    // VFXVolumeFader, tắt dần
    m.fadeT += dt;
    m.fadeK = lerp(m.fadeFrom, m.fadeTo, Math.min(1, m.fadeT / (m.fadeOutT !== undefined ? MM.ambienceFadeDurationSec : S.fader.blendDurationSec)));
    // tiếng (:240-249): Idle / Aggro hoà theo targetFollow; Despawn thì idle tắt dần
    if (m.fadeOutT !== undefined) {
      m.fadeOutT -= dt;
      m.idleVol = Math.max(0, (m.idleFrom || 0) * Math.max(0, m.fadeOutT) / MM.ambienceFadeDurationSec);
      if (m.snd.aggro) m.snd.aggro.gain(0);
      if (m.fadeOutT <= 0) { destroy(m); return; }
    } else if (m.blendAmb) m.idleVol = lerp(m.idleVol, m.follow ? 0 : 1, Math.min(1, dt));
    if (m.snd.idle) { m.snd.idle.gain(m.idleVol); m.snd.idle.pos(m.x, 0, m.z); }   // AudioSource.volume = idleLoopAudioVolume (0..1); m_Volume 0 của prefab chỉ là giá trị khởi đầu
    if (m.snd.aggro) { if (m.fadeOutT === undefined && m.blendAmb) m.snd.aggro.gain(1 - m.idleVol); m.snd.aggro.pos(m.x, 0, m.z); }
    if (m.state === ST.PATROLLING || m.state === ST.MOVING_TO_PLAYER || m.state === ST.MOVING_TO_PLAYER_GHOST) { if ((m.nextCall -= dt) <= 0) doCallAudio(m); }
    // đặt hình
    const o = m.o;
    o.root.position.set(m.x, dbg.y == null ? m.y : dbg.y, m.z); o.root.rotation.set(0, m.yaw, 0);
    animate(m, dt);
    followers(m, dt);
  }

  // ---------------------------------------------------------------- GCMonsterManager
  const dbg = { y: null, blind: false };
  const inside = MG.triggers.map(() => false);
  const falls = [];                                                // đá báo động / rơi đang chờ
  function trySpawnFromTrigger(i) {                                // :25-31
    const t = MG.triggers[i];
    if (!isSpawned && !suppressed && !banish) return spawnSerpent(t.route, t.direction);
    return null;
  }
  function reachedHole(h) {                                        // OnMonsterReachedHole :44-69
    if (clock < lastRock + MG.minTimeBetweenRockFallsSec) return;
    lastRock = clock;
    const island = MG.rocks.filter(r => r.island === h.island), same = island.filter(r => r.hole === h.hole);
    for (const r of island) if (!same.includes(r)) falls.push({ at: clock + Math.random() * 2, kind: 'warning', rock: r });
    for (const r of same) falls.push({ at: clock + Math.random() * 2, kind: 'rockfall', rock: r });
    root.DR.emit('serpentHole', { hole: h.name, island: h.island });
  }
  function rockEvents() {
    for (const f of falls.slice()) {
      if (clock < f.at) continue;
      falls.splice(falls.indexOf(f), 1);
      const b = root.DR.s.boat, d = Math.hypot(b.x - f.rock.pos[0], b.z - f.rock.pos[1]);
      // CinemachineImpulseSource.GenerateImpulse: rung máy quay giảm theo khoảng cách [ĐỀ XUẤT: biên độ; bản gốc dùng NoiseSettings của impulse]
      if (root.DRBoat) DRBoat.shake = Math.max(DRBoat.shake || 0, (f.kind === 'rockfall' ? 0.25 : 0.1) * clamp(1 - d / 120, 0, 1));
      root.DR.emit(f.kind === 'rockfall' ? 'serpentRockfall' : 'serpentRockWarning', { rock: f.rock.name, x: f.rock.pos[0], z: f.rock.pos[1], island: f.rock.island, hole: f.rock.hole });
    }
  }
  function clear() { for (const m of list.slice()) destroy(m); isSpawned = false; falls.length = 0; }

  // ---------------------------------------------------------------- volume cục bộ MonsterProfile (như js/angler.js) và vignette đỏ
  let vig = null;
  function post() {
    const cam = root.DRCamera && DRCamera.cam, P = root.DRSky && DRSky.post;
    let w = 0;
    for (const m of list) {
      const bd = S.fader.maxBlendDistance * m.fadeK;
      if (bd <= 0 || !cam) continue;
      const d = Math.max(0, Math.hypot(cam.position.x - m.x, cam.position.y - m.y, cam.position.z - m.z) - 0.7);   // SphereCollider r 1 × 0,7
      w = Math.max(w, 1 - d / bd);
    }
    w = clamp(w, 0, 1);
    if (P && P.uber && P.uber.uniforms.uCA && w > 0) { const u = P.uber.uniforms.uCA, cur = u.value / 0.05; u.value = lerp(cur, 0.6, w) * 0.05; }
    if (!vig) {
      if (w <= 0 || typeof document === 'undefined') return;
      const cv = document.getElementById('dr-canvas');
      vig = document.createElement('div');
      vig.id = 'dr-serpent-vignette';
      vig.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:1;opacity:0;background:radial-gradient(ellipse at center, rgba(255,0,2,0) 45%, rgba(255,0,2,0.35) 100%)';
      (cv && cv.parentNode ? cv.parentNode : document.body).insertBefore(vig, cv ? cv.nextSibling : null);
    }
    vig.style.opacity = w.toFixed(3);
  }

  function update(dt) {
    const Dr = root.DR, s = Dr && Dr.s;
    if (!s || !s.boat) return;
    if (Dr.mode === 'title') { if (list.length) clear(); return; }
    if (!sceneOf()) return;
    if (Dr.mode === 'over') dt = 0;
    clock += dt;
    const gm = gameMode();
    if (gm !== lastMode) {                                         // OnGameModeChanged :86-92: sang PASSIVE thì đang săn → mất dấu
      lastMode = gm;
      if (gm === 'PASSIVE') for (const m of list) if (m.state === ST.MOVING_TO_PLAYER || m.state === ST.MOVING_TO_PLAYER_GHOST) doLosePlayer(m);
    }
    if (dt > 0) {
      const b = s.boat;
      MG.triggers.forEach((t, i) => {                              // OnTriggerEnter: thuyền vào hộp
        const now = inBox(t.box, b.x, b.z, BOAT_R);
        if (now && !inside[i]) trySpawnFromTrigger(i);
        inside[i] = now;
      });
      rockEvents();
      for (const m of list.slice()) tick(m, dt);
    }
    post();
  }

  function bind() {
    const Dr = root.DR;
    if (!Dr || !Dr.on) return;
    Dr.on('banish', on => {                                        // OnPlayerAbilityToggled(banish) (:213-224) + manager.isBanishActive
      banish = !!on;
      if (!on) return;
      for (const m of list.slice()) {
        if (m.state === ST.NONE) continue;
        Dr.emit('threatBanished', { source: 'GCMonster', active: m.state === ST.MOVING_TO_PLAYER || m.state === ST.MOVING_TO_PLAYER_GHOST || m.state === ST.ATTACKING });
        if (root.DRAudio) DRAudio.play(AU.banish.clip, AU.banish.vol, 1, { pos: { x: m.x, y: 0, z: m.z }, min: AU.banish.min, max: AU.banish.max });
        m.banishActive = true; m.canEyesSee = false; m.forceEyesShut = true; m.listeners = false;
        moveToDespawn(m);
      }
    });
    const reset = () => { clear(); banish = false; suppressed = false; lastRock = -Infinity; inside.fill(false); };
    Dr.on('newgame', reset); Dr.on('load', reset);
    Dr.on('mode', m => { if (m === 'title') clear(); });
    Dr.on('finaleVoyageStarted', () => { suppressed = true; });
  }
  bind();

  root.DRSerpent = {
    update,
    suppress: on => { suppressed = !!on; },
    get active() { return list.length; },
    debug: {
      list: () => list.map(m => ({ route: MG.routes[m.route].name, x: +m.x.toFixed(2), z: +m.z.toFixed(2), y: m.y, yaw: m.yaw, speed: m.speed, state: STN[m.state], anim: m.cur,
        follow: m.follow, detects: m.detects, listeners: m.listeners, didHit: m.didHit, prox: +m.proxLerp.toFixed(3), fade: m.fadeK, chase: m.chase, depth: m.depth, age: m.age,
        canEyesSee: m.canEyesSee, forceEyesShut: m.forceEyesShut, banishActive: m.banishActive, pathIndex: m.pathIndex, goal: m.goal,
        dest: m.route2 && m.route2.route[m.pathIndex] ? m.route2.route[m.pathIndex].slice() : null, fadeOut: m.fadeOutT !== undefined })),
      manager: () => ({ isSpawned, suppressed, banish, lastRock, falls: falls.length, inside: inside.slice() }),
      // móc kiểm thử: đặt rắn tại (x, z) (xoá vận tốc và đường đang đi, đốt sống về đúng chỗ) rồi cho nó đi tiếp tuyến hiện tại
      place: (i, x, z, pi) => { const m = list[i]; if (!m) return false; if (pi != null) m.pathIndex = pi; m.x = x; m.z = z; m.vx = m.vz = 0; m.corners = null; m.o.root.position.set(x, m.y, z); animate(m, 0); m.o.root.updateMatrixWorld(true);
        S.followers.forEach((f, k) => { m.o.nodes[f.node].getWorldPosition(_a); m.fol[k] = [_a.x, _a.y, -_a.z]; }); if (m.route2) setDestination(m, m.route2.route[m.pathIndex][0], m.route2.route[m.pathIndex][1]); return true; },
      clear, los, walkable, path: (a, b) => findPath(a, b), fire: i => trySpawnFromTrigger(i), force: (r, d) => spawnSerpent(r, d || 0),
      trigger: name => MG.triggers.findIndex(t => t.name === name),
      get objects() { return list.map(m => m.o.root); }, set y(v) { dbg.y = v; }, get y() { return dbg.y; }, set blind(v) { dbg.blind = !!v; }, get blind() { return dbg.blind; }, setChase: (i, v) => { if (list[i]) list[i].chase = v; }, followersOf: i => list[i] && list[i].fol.map(a => a.slice())
    }
  };
})(window);
