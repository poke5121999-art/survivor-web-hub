/*
 * VFX của thuyền chép từ PlayerContainer.prefab (data/vfx.js, sinh bởi tools/vfx.py):
 *
 * 1. Vệt bọt = hệ hạt BoatTrailParticles (con của Player). Đây là toàn bộ vệt nước của bản gốc, kể cả sóng chữ V ở mũi:
 *    - phát theo quãng đường: rateOverDistance 15 hạt/m, từ bề mặt mesh BoatFrontWakeMesh_0 (dải ôm mũi + dải nhỏ ở đuôi)
 *    - mô phỏng trong không gian thế giới; startSpeed 0, thừa hưởng 1,5 × vận tốc Rigidbody lúc sinh (InheritVelocity Initial)
 *    - sống 0,5–1,5 s × LifetimeByEmitterSpeed (đường cong theo tốc độ thuyền 0..1 m/s ⇒ đứng yên thì không có bọt)
 *    - trọng lực × 0,5, cản (LimitVelocity drag 0,5 × |v|), VelocityOverLifetime: y +0,5 (cục bộ), toả ra 2 m/s (radial)
 *    - mỗi hạt là mesh SphereLowPoly_2 cỡ 0,6–1,1 m, SizeOverLifetime (0 → 0,54 ở 11 % → 1), màu trắng/xám 0,79, alpha 0,78
 *      × ColorOverLifetime (1 → 0,7 ở 94 % → 0), vật liệu FoamParticle_Mat (FoamColoured ⇒ màu _FoamColor của WaterController)
 *    - hạt chìm dần nên chỉ phần chỏm nổi trên mặt nước hiện ra (nước ghi chiều sâu, bọt vẽ sau: hàng đợi 3000 < 3020)
 * 2. Cột khói ống khói = LineRenderer 3 điểm + SmokeColumn.cs: điểm i bám theo đích T + (gió + lên)·i·spacing với tốc
 *    Lerp(12, 500, (1 − i/n)^20) nên cột khói ngả về sau khi thuyền chạy; rộng 1,5 × đường cong, đen alpha 0,39 → 0 ở 60 %.
 *
 * 3. Khói ống khói (SmokePuffs, BoatModelProxy.chimneySmoke) chạy qua DRParticles; DRVfx.smokeBoost (0..1) = burn² của Haste.
 *
 *   DRVfx.init(scene)  DRVfx.update(dt, env)  DRVfx.reset()  DRVfx.stats() → { alive, emitted, maxSize, ... }  DRVfx.smokeBoost
 */
(function (root) {
  'use strict';
  const T = root.THREE, V = root.DR_VFX;
  if (!V) { root.DRVfx = null; return; }
  const SYS = V.systems.boatTrail;
  const MAX = SYS.maxParticles;
  const G = 9.81;
  const PUFF_Y = 0.35;

  // ---------- đường cong / gradient Unity ----------
  // AnimationCurve Hermite giữa hai khoá [t, v, inSlope, outSlope]
  function curve(keys, t) {
    if (!keys || !keys.length) return 0;
    if (t <= keys[0][0]) return keys[0][1];
    const l = keys[keys.length - 1];
    if (t >= l[0]) return l[1];
    for (let i = 1; i < keys.length; i++) {
      const a = keys[i - 1], b = keys[i];
      if (t > b[0]) continue;
      const d = b[0] - a[0], u = (t - a[0]) / d;
      const m0 = isFinite(a[3]) ? a[3] * d : NaN, m1 = isFinite(b[2]) ? b[2] * d : NaN;
      if (isNaN(m0) || isNaN(m1)) return a[1]; // tiếp tuyến vô hạn = bậc thang (khoá "constant")
      const u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * a[1] + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * b[1] + (u3 - u2) * m1;
    }
    return l[1];
  }
  const mmc = (m, t, rnd) => {
    if ('c' in m) return m.c;
    if ('min' in m) return m.min + (m.max - m.min) * rnd;
    if ('curve' in m) return curve(m.curve, t) * m.k;
    return (curve(m.curveMin, t) + (curve(m.curveMax, t) - curve(m.curveMin, t)) * rnd) * m.k;
  };
  function gradAlpha(g, t) {
    const a = g.a;
    if (t <= a[0][0]) return a[0][1];
    for (let i = 1; i < a.length; i++) if (t <= a[i][0]) {
      const k = (t - a[i - 1][0]) / ((a[i][0] - a[i - 1][0]) || 1);
      return a[i - 1][1] + (a[i][1] - a[i - 1][1]) * k;
    }
    return a[a.length - 1][1];
  }
  function gradColor(g, t, out) {
    const c = g.c;
    let a = c[0], b = c[0];
    for (let i = 1; i < c.length; i++) { b = c[i]; if (t <= c[i][0]) { a = c[i - 1]; break; } a = c[i]; }
    const k = b === a ? 0 : Math.min(1, Math.max(0, (t - a[0]) / ((b[0] - a[0]) || 1)));
    out[0] = a[1] + (b[1] - a[1]) * k; out[1] = a[2] + (b[2] - a[2]) * k; out[2] = a[3] + (b[3] - a[3]) * k;
    return out;
  }
  const srgb2lin = c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  // ---------- mesh phát (BoatFrontWakeMesh_0) ----------
  const EM = V.meshes[SYS.shape.mesh];
  const tris = [];
  let areaSum = 0;
  {
    const P = EM.position, I = EM.index;
    for (let i = 0; i < I.length; i += 3) {
      const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const ar = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
      if (ar <= 0) continue;
      areaSum += ar;
      tris.push({ a, b, c, cdf: areaSum });
    }
  }
  function sampleEmitter(out) {
    // placementMode 2 = Triangle: điểm ngẫu nhiên trên tam giác, chọn tam giác theo diện tích
    const P = EM.position, x = Math.random() * areaSum;
    let lo = 0, hi = tris.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (tris[m].cdf < x) lo = m + 1; else hi = m; }
    const t = tris[lo];
    let u = Math.random(), v = Math.random();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const w = 1 - u - v;
    out.set(P[t.a] * w + P[t.b] * u + P[t.c] * v, P[t.a + 1] * w + P[t.b + 1] * u + P[t.c + 1] * v, P[t.a + 2] * w + P[t.b + 2] * u + P[t.c + 2] * v);
    return out;
  }

  // ---------- trạng thái hạt (mảng phẳng) ----------
  const px = new Float32Array(MAX), py = new Float32Array(MAX), pz = new Float32Array(MAX);
  const vx = new Float32Array(MAX), vy = new Float32Array(MAX), vz = new Float32Array(MAX);
  const age = new Float32Array(MAX), life = new Float32Array(MAX), size0 = new Float32Array(MAX);
  const rot = new Float32Array(MAX), tint = new Float32Array(MAX), alpha0 = new Float32Array(MAX);
  let alive = 0, emitted = 0, emitAcc = 0, lastSize = 0;

  let scene = null, mesh = null, aAlpha = null, foamMat = null;
  const emPos = new T.Vector3(), emPrev = new T.Vector3(), emMat = new T.Matrix4(), emQuat = new T.Quaternion();
  const tmp = new T.Vector3(), tmp2 = new T.Vector3(), up = new T.Vector3();
  const dummy = new T.Object3D(), col = new T.Color();
  let hasPrev = false;

  function init(sc) {
    scene = sc;
    const SM = V.meshes[SYS.renderer.mesh];
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(SM.position), 3));
    g.setIndex(SM.index);
    g.computeVertexNormals();
    aAlpha = new T.InstancedBufferAttribute(new Float32Array(MAX), 1);
    aAlpha.setUsage(T.DynamicDrawUsage);
    g.setAttribute('aAlpha', aAlpha);
    // FloatingParticle_Shader (FoamColoured): màu bọt × màu hạt; [ĐỀ XUẤT] thân shader bị bỏ khi xuất, dùng phong phẳng
    // không bóng để mặt cầu thấp đa giác có mặt sáng/tối theo nắng như ảnh chụp bản gốc
    foamMat = new T.MeshPhongMaterial({ color: 0xffffff, specular: 0x000000, shininess: 0, flatShading: true,
      transparent: true, depthWrite: false });
    foamMat.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vAlpha;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = aAlpha;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vAlpha;')
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse, opacity * vAlpha );');
    };
    mesh = new T.InstancedMesh(g, foamMat, MAX);
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    mesh.setColorAt(0, col.setRGB(1, 1, 1));
    mesh.instanceColor.setUsage(T.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.renderOrder = 2; // FoamParticle_Mat hàng đợi 3020: sau nước (1) và FoamMask (1,5)
    mesh.name = 'BoatTrailParticles';
    scene.add(mesh);
    initSmoke();
    if (root.DRTentacle) root.DRTentacle.init(scene); // V14: xúc tu đỏ của sự kiện TentacleAttack (js/tentacle.js)
    if (root.DRGhostRocks) root.DRGhostRocks.init(scene); // R7 U2: đá ma (js/ghostrocks.js)
    if (root.DRPhantomShark) root.DRPhantomShark.init(scene); // U10 (seam, thêm): cá mập ma của sự kiện PhantomShark (js/phantomshark.js)
    if (root.DRPiranha) root.DRPiranha.init(scene); // R5 (seam, thêm): cá piranha + Mẹ Không Mắt của Devil's Spine (js/piranha.js)
  }

  function reset() {
    alive = 0; emitAcc = 0; hasPrev = false;
    if (mesh) mesh.count = 0;
    for (const c of columns) c.init = false;
    if (root.DRTentacle) root.DRTentacle.finish();
    if (root.DRGhostRocks) root.DRGhostRocks.reset(); // R7 U2: đá ma tồn tại độc lập với thuyền, chỉ bỏ cờ va chạm
    if (root.DRPhantomShark) root.DRPhantomShark.finish(); // U10 (seam, thêm)
  }

  // ma trận emitter = Player (bob) × vị trí cục bộ của BoatTrailParticles
  function emitterMatrix(out) {
    const bob = root.DRBoat && DRBoat.bob;
    if (!bob) return null;
    bob.updateWorldMatrix(true, false);
    out.copy(bob.matrixWorld);
    tmp.fromArray(SYS.pos).applyMatrix4(out);
    out.setPosition(tmp);
    return out;
  }

  function emit(n, M, from, to, rbv, speed01, dt) {
    const lifeK = SYS.lifetimeByEmitterSpeed ? mmc(SYS.lifetimeByEmitterSpeed.curve, speed01, Math.random()) : 1;
    if (lifeK <= 0) return;
    const inh = SYS.inheritVelocity ? mmc(SYS.inheritVelocity.curve, 0, 0) : 0;
    const sc = SYS.startColor;
    for (let k = 0; k < n; k++) {
      if (alive >= MAX) return;
      const f = (k + 1) / n;
      sampleEmitter(tmp2);
      tmp2.applyMatrix4(M);
      // phát rải đều trên đoạn đường đi trong khung (rateOverDistance): lùi điểm về vị trí emitter lúc ấy
      tmp2.x -= (to.x - from.x) * (1 - f); tmp2.y -= (to.y - from.y) * (1 - f); tmp2.z -= (to.z - from.z) * (1 - f);
      const i = alive++;
      emitted++;
      px[i] = tmp2.x; py[i] = tmp2.y; pz[i] = tmp2.z;
      vx[i] = rbv.x * inh; vy[i] = rbv.y * inh; vz[i] = rbv.z * inh;
      age[i] = (1 - f) * dt;
      life[i] = mmc(SYS.startLifetime, 0, Math.random()) * lifeK;
      size0[i] = mmc(SYS.startSize, 0, Math.random());
      rot[i] = mmc(SYS.startRotation, 0, Math.random());
      // startColor: ngẫu nhiên giữa hai màu (minMaxState 2)
      const r = Math.random();
      tint[i] = sc.min ? sc.min[0] + (sc.max[0] - sc.min[0]) * r : (sc.color ? sc.color[0] : 1);
      alpha0[i] = sc.min ? sc.min[3] + (sc.max[3] - sc.min[3]) * r : (sc.color ? sc.color[3] : 1);
      if (life[i] <= age[i]) { alive--; }
    }
  }

  let foamLin = [1, 1, 1];
  function update(dt, env) {
    if (root.DRTentacle) root.DRTentacle.update(dt);
    if (root.DRGhostRocks) root.DRGhostRocks.update(dt); // R7 U2
    if (root.DRPiranha) root.DRPiranha.update(dt); // R5 (seam, thêm)
    if (!mesh) return;
    const D = root.DR, b = D.s && D.s.boat;
    if (!b) return;
    const M = emitterMatrix(emMat);
    if (!M) return;
    emPos.setFromMatrixPosition(M);
    M.decompose(tmp, emQuat, tmp2);
    if (!hasPrev) { emPrev.copy(emPos); hasPrev = true; }
    // Rigidbody.velocity (emitterVelocityMode 1)
    const fl = root.DRBoat.feel ? DRBoat.feel() : { vy: 0 };
    const rbv = tmp.set(b.vx, fl.vy || 0, b.vz).clone();
    const spd = rbv.length();
    if (dt > 0) {
      const dist = emPos.distanceTo(emPrev);
      // dịch chuyển tức thời (teleport/cập bến) không phải đường đi
      if (dist < 5) emitAcc += dist * mmc(SYS.emission.rateOverDistance, 0, 0);
      const n = Math.floor(emitAcc);
      emitAcc -= n;
      const lr = SYS.lifetimeByEmitterSpeed ? SYS.lifetimeByEmitterSpeed.range : { x: 0, y: 1 };
      const s01 = Math.min(1, Math.max(0, (spd - lr.x) / ((lr.y - lr.x) || 1)));
      if (n > 0) emit(n, M, emPrev, emPos, rbv, s01, dt);
      simulate(dt, M);
    }
    emPrev.copy(emPos);
    // màu bọt: WaterController._FoamColor (sRGB → tuyến tính)
    const wp = root.DRWater && DRWater.props ? DRWater.props() : null;
    // V04/halo: bản rã FloatingParticle_Shader (biến thể BOOLEAN_692E…_ON của FoamParticle_Mat) nhân albedo với cb0[126] — màu NƯỚC chứ không phải cb0[128]
    // (_FoamColor của Water_Shader) — nên bọt thuyền cùng tông nước (xanh nhạt) chứ không trắng loang; clip gốc không có cục trắng cạnh thuyền
    const fc = wp ? wp.shallowColor : V.waterController.default.shallowColor;
    foamLin = [srgb2lin(fc[0]), srgb2lin(fc[1]), srgb2lin(fc[2])];
    write();
    updateSmoke(dt);
    updateChimney();
  }

  // ---------- khói ống khói (B2): hệ BoatModelProxy.chimneySmoke của thân đang dùng (DR_PARTICLES.ChimneySmoke, biến thể BoatN).
  // BoostAbility.cs:188: rateOverTime = Lerp(0, chimneySmokeEmissionMax, burn²) khi đang tăng tốc, 0 khi không.
  // Dữ liệu đã ghi rate = chimneySmokeEmissionMax; luồng thiết bị đặt DRVfx.smokeBoost (0..1, = burn² lúc bật Haste).
  let chimney = null, chimneyTier = 0;
  function updateChimney() {
    const P = root.DRParticles, D = root.DR, model = root.DRBoat && DRBoat.model;
    if (!P || !P.has('ChimneySmoke') || !model || !D.s) return;
    const tier = D.s.hullTier || 1;
    if (!chimney || chimneyTier !== tier || !chimney.alive) {
      if (chimney) chimney.stop();
      const node = model.children.find(c => (c.userData && c.userData.name || c.name) === 'Boat' + tier);
      chimney = node ? P.spawn('ChimneySmoke', { parent: node }) : null;
      chimneyTier = tier;
    }
    if (chimney) chimney.setRate(Math.min(1, Math.max(0, +root.DRVfx.smokeBoost || 0)));
  }

  function simulate(dt, M) {
    const gm = mmc(SYS.gravityModifier, 0, 0);
    const L = SYS.limitVelocity, VO = SYS.velocityOverLifetime;
    const drag = L ? mmc(L.drag, 0, 0) : 0;
    // VelocityOverLifetime cục bộ: trục của emitter hiện tại
    up.set(mmc(VO.x, 0, 0), mmc(VO.y, 0, 0), mmc(VO.z, 0, 0)).applyQuaternion(emQuat);
    const radial = mmc(VO.radial, 0, 0), spdMod = mmc(VO.speedModifier, 0, 0);
    let i = 0;
    while (i < alive) {
      age[i] += dt;
      if (age[i] >= life[i]) { kill(i); continue; }
      vy[i] -= G * gm * dt;
      if (drag > 0) {
        const sp = Math.hypot(vx[i], vy[i], vz[i]);
        const k = Math.min(1, drag * (L.multiplyDragByVelocity ? sp : 1) * dt);
        vx[i] -= vx[i] * k; vy[i] -= vy[i] * k; vz[i] -= vz[i] * k;
      }
      // toả ra từ tâm hệ (vị trí emitter hiện tại)
      let rx = px[i] - emPos.x, ry = py[i] - emPos.y, rz = pz[i] - emPos.z;
      const rl = Math.hypot(rx, ry, rz) || 1;
      rx = rx / rl * radial; ry = ry / rl * radial; rz = rz / rl * radial;
      px[i] += (vx[i] + (up.x + rx) * spdMod) * dt;
      py[i] += (vy[i] + (up.y + ry) * spdMod) * dt;
      pz[i] += (vz[i] + (up.z + rz) * spdMod) * dt;
      i++;
    }
  }
  function kill(i) {
    const j = --alive;
    if (i === j) return;
    px[i] = px[j]; py[i] = py[j]; pz[i] = pz[j]; vx[i] = vx[j]; vy[i] = vy[j]; vz[i] = vz[j];
    age[i] = age[j]; life[i] = life[j]; size0[i] = size0[j]; rot[i] = rot[j]; tint[i] = tint[j]; alpha0[i] = alpha0[j];
  }

  const cg = [1, 1, 1];
  const trR = new T.Matrix4(), trM = new T.Matrix4(); // (pmesh) ma trận hạt bọt T·S·Rz
  function write() {
    const SO = SYS.sizeOverLifetime, CO = SYS.colorOverLifetime;
    const al = aAlpha.array;
    let mx = 0;
    for (let i = 0; i < alive; i++) {
      const t = age[i] / life[i];
      const sz = size0[i] * (SO ? mmc(SO.curve, t, 0) : 1);
      if (sz > mx) mx = sz;
      // startRotation (2D) quay quanh trục z của hạt; RenderAlignment World
      // [ĐỀ XUẤT] dẹt theo trục y (PUFF_Y): clip gốc chỉ thấy gợn mảnh sát mặt nước, không có cục nổi cao cạnh thân tàu
      // (pmesh, seam sửa) dẹt theo trục y THẾ GIỚI sau khi quay: M = T·S·Rz. Gốc là cầu đều cỡ (size3D 0) nên quay z không
      // làm nghiêng hình; T·Rz·S cũ quay cả đĩa đã dẹt → thấu kính nghiêng 0–90° quanh thuyền.
      const z0 = Math.max(1e-4, sz);
      trR.makeRotationZ(-rot[i]); trM.makeScale(z0, z0 * PUFF_Y, z0).multiply(trR).setPosition(px[i], py[i], pz[i]);
      mesh.setMatrixAt(i, trM);
      if (CO) gradColor(CO.gradient, t, cg);
      col.setRGB(foamLin[0] * tint[i] * cg[0], foamLin[1] * tint[i] * cg[1], foamLin[2] * tint[i] * cg[2]);
      mesh.setColorAt(i, col);
      al[i] = alpha0[i] * (CO ? gradAlpha(CO.gradient, t) : 1);
    }
    lastSize = mx;
    mesh.count = alive;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    aAlpha.needsUpdate = true;
  }

  // ---------- cột khói ----------
  const columns = [];
  let smokeTex = null, smokeTier = 0;
  function initSmoke() {
    const S = V.textures && V.textures.smokeColumn;
    if (S) {
      smokeTex = new T.TextureLoader().load(S.src);
      smokeTex.wrapS = T.RepeatWrapping; smokeTex.wrapT = T.ClampToEdgeWrapping;
    }
  }
  function buildColumns(tier) {
    for (const c of columns) { scene.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh.material.dispose(); }
    columns.length = 0;
    smokeTier = tier;
    const list = (V.smokeColumns || {})['Boat' + tier] || [];
    for (const d of list) {
      if (!d.active) continue;
      const n = d.positionCount;
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(new Float32Array(n * 2 * 3), 3));
      g.setAttribute('uv', new T.BufferAttribute(new Float32Array(n * 2 * 2), 2));
      g.setAttribute('aCol', new T.BufferAttribute(new Float32Array(n * 2 * 4), 4));
      const idx = [];
      for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      g.setIndex(idx);
      // [ĐỀ XUẤT] thân SmokeColumn_Shader bị bỏ khi xuất: alpha = alpha texture × màu đỉnh (gradient LineRenderer),
      // u trôi theo _Distance (SmokeColumn.cs:66) để dải khói gợn chạy theo quãng đường thuyền đi
      const m = new T.ShaderMaterial({
        transparent: true, depthWrite: false, side: T.DoubleSide, fog: true,
        uniforms: Object.assign({ uTex: { value: smokeTex }, uDist: { value: 0 } }, T.UniformsUtils.clone(T.UniformsLib.fog)),
        vertexShader: `attribute vec4 aCol; varying vec4 vCol; varying vec2 vUv;
#include <fog_pars_vertex>
void main() { vCol = aCol; vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`,
        fragmentShader: `uniform sampler2D uTex; uniform float uDist; varying vec4 vCol; varying vec2 vUv;
#include <fog_pars_fragment>
void main() { float a = texture2D(uTex, vec2(vUv.x - uDist, vUv.y)).a * vCol.a; if (a < 0.003) discard;
  gl_FragColor = vec4(vCol.rgb, a);
#include <fog_fragment>
}`
      });
      const mesh2 = new T.Mesh(g, m);
      mesh2.frustumCulled = false; mesh2.renderOrder = 3; mesh2.name = 'SmokeColumn';
      scene.add(mesh2);
      const lerpSpeeds = [];
      for (let i = 0; i < n; i++) lerpSpeeds.push(12 + (500 - 12) * Math.pow(1 - i / n, 20));
      columns.push({ d, mesh: mesh2, pts: Array.from({ length: n }, () => new T.Vector3()), lerpSpeeds, init: false, dist: d.initialUvOffset, last: new T.Vector3() });
    }
  }
  const wind = new T.Vector3(), tgt = new T.Vector3(), camR = new T.Vector3(), seg = new T.Vector3(), side = new T.Vector3();
  function updateSmoke(dt) {
    const D = root.DR, tier = D.s ? D.s.hullTier || 1 : 1;
    if (tier !== smokeTier) buildColumns(tier);
    const bob = root.DRBoat && DRBoat.bob, cam = root.DRCamera && DRCamera.cam;
    if (!bob || !columns.length) return;
    for (const c of columns) {
      const d = c.d, n = c.pts.length;
      const T0 = tmp.fromArray(d.pos).applyMatrix4(bob.matrixWorld);
      wind.fromArray(d.windDirection); wind.y += 1; wind.multiplyScalar(d.positionSpacing);
      if (!c.init) {
        for (let i = 0; i < n; i++) c.pts[i].copy(T0).addScaledVector(wind, i);
        c.last.copy(T0); c.init = true;
      }
      c.dist += T0.distanceTo(c.last) * 0.75;
      c.last.copy(T0);
      for (let i = 0; i < n; i++) {
        tgt.copy(T0).addScaledVector(wind, i);
        c.pts[i].lerp(tgt, Math.min(1, dt * c.lerpSpeeds[i]));
        c.pts[i].y = tgt.y;
      }
      // LineRenderer alignment View: dải quay mặt về camera; textureMode Tile: u = mét dọc dải
      const pos = c.mesh.geometry.attributes.position.array, uv = c.mesh.geometry.attributes.uv.array, ac = c.mesh.geometry.attributes.aCol.array;
      let acc = 0;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const w = d.widthMultiplier * curve(d.widthCurve, t) / 2;
        seg.subVectors(c.pts[Math.min(n - 1, i + 1)], c.pts[Math.max(0, i - 1)]).normalize();
        if (cam) camR.subVectors(cam.position, c.pts[i]).normalize(); else camR.set(0, 0, 1);
        side.crossVectors(seg, camR).normalize().multiplyScalar(w);
        if (i > 0) acc += c.pts[i].distanceTo(c.pts[i - 1]);
        for (let k = 0; k < 2; k++) {
          const j = i * 2 + k, sg = k ? 1 : -1;
          pos[j * 3] = c.pts[i].x + side.x * sg; pos[j * 3 + 1] = c.pts[i].y + side.y * sg; pos[j * 3 + 2] = c.pts[i].z + side.z * sg;
          uv[j * 2] = acc; uv[j * 2 + 1] = k;
          gradColor(d.colorGradient, t, cg);
          ac[j * 4] = cg[0]; ac[j * 4 + 1] = cg[1]; ac[j * 4 + 2] = cg[2]; ac[j * 4 + 3] = gradAlpha(d.colorGradient, t);
        }
      }
      c.mesh.geometry.attributes.position.needsUpdate = true;
      c.mesh.geometry.attributes.uv.needsUpdate = true;
      c.mesh.geometry.attributes.aCol.needsUpdate = true;
      c.mesh.material.uniforms.uDist.value = c.dist;
      const fog = scene.fog;
      if (fog) { c.mesh.material.uniforms.fogColor.value.copy(fog.color); c.mesh.material.uniforms.fogDensity.value = fog.density; }
    }
  }

  function stats() {
    let ahead = 0, behind = 0, maxBack = 0, maxSide = 0, maxUp = -9;
    const b = root.DR.s && root.DR.s.boat;
    if (b) {
      const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw);
      for (let i = 0; i < alive; i++) {
        const dx = px[i] - b.x, dz = pz[i] - b.z, along = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
        if (along > 0) ahead++; else behind++;
        maxBack = Math.max(maxBack, -along); maxSide = Math.max(maxSide, lat);
        const top = py[i] + size0[i] * 0.5;
        if (top > maxUp) maxUp = top;
      }
    }
    return { alive, emitted, maxSize: lastSize, ahead, behind, maxBack, maxSide, maxTop: maxUp, visible: !!(mesh && mesh.visible && mesh.count > 0),
      smoke: columns.map(c => c.pts.map(p => [p.x, p.y, p.z])) };
  }

  root.DRVfx = { init, update, reset, stats, curve, smokeBoost: 0, get mesh() { return mesh; }, get chimney() { return chimney; } };
})(window);
