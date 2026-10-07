/*
 * Thuyền: mô hình gốc (art/boat/boat.glb), vật lý chép PlayerController.FixedUpdate ở 50 Hz, nhấp nhô theo sóng,
 * đèn (L), tiếng máy, va chạm bờ → hỏng ô khoang (CODE.md 6).
 *
 * Mỗi bước 1/50 s (Unity ForceMode.Force: Δv = F/m·dt):
 *   num2 = DRRules.stats().speed   (= max(BasePlayerSpeed + Σ speedBonus, BasePlayerSpeed) · BaseMovementSpeedModifier)
 *   lực tiến = y·num2 (y < 0: · reverse), AddForce(forward · lực/50); mô-men = x·turn, AddTorque(mô-men/50)
 *   cản sóng: v −= v · clamp01(alpha·10)·Steepness·num2·0.0001
 *   BuoyantObject.FixedUpdate (BuoyantObject.cs:72-93), chép cả 3 chiều (nổi, chúi, nghiêng) chứ không lò xo giả:
 *     mỗi phao i ở P_i:  AddForceAtPosition(g/4 · gravityModifier, P_i, Acceleration)
 *     phao chìm (sóng tại P_i cao hơn P_i.y, d = sâu):  AddForceAtPosition(up · |g|·clamp01(d)/objectDepth·strength, P_i, Acceleration)
 *                        v −= v·velocityDrag·dt (VelocityChange),  ω −= I⁻¹·ω·angularDrag·dt (Impulse)
 *     PhysX: lực Acceleration đặt tại điểm ⇒ gia tốc góc = (P_i − tâm khối) × a, KHÔNG chia quán tính.
 *     Tâm khối + quán tính = MeshCollider lồi của BoatN, khối lượng 1 (DR_VFX.massProperties, tools/vfx.py).
 *     Rigidbody: thêm trọng lực g (m_UseGravity), v ·= 1 − dt·drag, ω ·= 1 − dt·angularDrag; ClampAngle range 55° cho x, z.
 *   Bản gốc KHÔNG có nghiêng khi rẽ hay ngóc mũi khi tăng tốc: AddTorque chỉ quanh trục y, AddForce đặt ở tâm khối
 *   (PlayerController.cs:196-197). Cảm giác "rẽ sóng" là thân bám sóng cứng (nổi ≈ 2,8 Hz, chúi ≈ 2,5 Hz) + vệt bọt.
 *   SteeringAnimator: bánh lái ±rudderMaxTurnDegrees 60° (Lerp dt·10, lùi thì đảo), chân vịt 900°/s · ga (Lerp dt·4).
 *   DRBoat.load(get, scene)  DRBoat.step(input)  DRBoat.update(dt, env)  DRBoat.place(x, z, yaw)
 *   DRBoat.autoMove({x, z, yaw}, cb)  DRBoat.speed()  DRBoat.knots()  DRBoat.feel() (số đo cho kiểm thử)
 */
(function (root) {
  'use strict';
  const T = root.THREE, B = root.DR_BOAT, CFG = root.DR_CONFIG, R = root.DRRules;
  const PH = B.physics, RB = PH.rigidbody, BO = PH.buoyantObject;
  const DT = 1 / 50;
  const EFFECTORS = ['BuoyancyEffector1', 'BuoyancyEffector2', 'BuoyancyEffector3', 'BuoyancyEffector4'].map(n => B.playerAttach[n].pos);
  // Chìm cân bằng của phao: 4 · g·d/objectDepth·strength = g·(1 + gravityModifier)  ⇒  d = 0,25 m;
  // phao nằm ở y = 0,07 cục bộ nên gốc thuyền thấp hơn mặt sóng 0,32 m.
  const SINK = (1 + BO.gravityModifier) * BO.objectDepth / (EFFECTORS.length * BO.strength) + EFFECTORS[0][1];
  const MAX_W = 7; // Physics.defaultMaxAngularSpeed của Unity
  const AUTO_SPEED = 1, LOOK_SPEED = 1; // PlayerController._autoMoveSpeed, _lookSpeed
  const IMPACT_HIT = 0.8, IMPACT_SAFE = 0.25; // [ĐỀ XUẤT] m/s theo pháp tuyến; bản gốc tính mọi OnCollisionEnter là đâm
  const SAFE_NEAR_DOCK = 15; // [ĐỀ XUẤT] cầu tàu gốc gắn tag SafeCollider: trong 15 m quanh bến coi là va chạm êm
  const G = 9.81;
  const CLAMP = T.MathUtils.degToRad(55); // Player/ClampAngle.range
  const RUDDER_MAX = T.MathUtils.degToRad(60), PROP_SPEED = T.MathUtils.degToRad(900); // SteeringAnimator (prefab)
  const VFX = root.DR_VFX || {};
  const AUD = VFX.audio || null;

  const Bt = root.DRBoat = {
    root: null, model: null, bob: null, input: { x: 0, y: 0 }, inputMag: 0, moved: false, blocked: false, auto: null,
    lights: [], stats: null, steer: 0, shake: 0, lastHit: -1e9, inertia: 1, half: [0.6, 1.26],
    com: [0, 0.35, 0], I: [0.41, 0.47, 0.11], waveSteep: 0
  };
  let player = null, tierNodes = [], tier = 1, bob = null, props = [], rudders = [], beams = [];
  // trạng thái nổi (không lưu vào sổ): cao độ gốc, vận tốc đứng, chúi/nghiêng (rad) và tốc độ góc của chúng
  const F = { y: 0, vy: 0, p: 0, r: 0, wp: 0, wr: 0, steepT: 0, steepTarget: 0, smoothSteep: 0, sub: 0 };
  const prev = { x: 0, z: 0, yaw: 0, y: 0, p: 0, r: 0 };
  let stepAt = 0, lerpY = 0;
  const s = () => root.DR.s.boat;

  function child(o, name) { return o.children.find(c => c.userData.name === name || c.name === name) || null; }
  function path(o, p) { for (const n of p.split('/')) { o = o && child(o, n); } return o; }

  // ---------- nạp ----------
  async function load(get, scene) {
    const buf = await get(B.glb, 'buffer');
    const gltf = await new Promise((res, rej) => new T.GLTFLoader().parse(buf, '', res, rej));
    player = gltf.scene.getObjectByName('Player') || gltf.scene;
    // WaterMask (WaterMask_Mat, hàng đợi 2090) và FoamMask (FoamMask_Mat, 3010) = Unlit/DepthMaskShader: chỉ ghi chiều sâu.
    // WaterMask vẽ sau thân (2000) trước nước ⇒ nước không lọt vào lòng thuyền; FoamMask vẽ sau nước trước bọt (3020).
    const depthOnly = new T.MeshBasicMaterial({ colorWrite: false, depthWrite: true, transparent: true });
    player.traverse(o => {
      if ('active' in o.userData) o.visible = o.userData.active !== false;
      if (o.isMesh && o.userData.mask) {
        o.material = depthOnly; o.visible = true;
        o.renderOrder = /Foam/.test(o.name) ? 1.5 : 0.5; // nước renderOrder 1, bọt 2
        return;
      }
      if (o.userData.mask) { o.visible = true; return; }
      if (o.isMesh) {
        const src = o.material;
        if (/Mask_Mat/.test(src.name)) { o.material = depthOnly; o.renderOrder = /Foam/.test(src.name) ? 1.5 : 0.5; return; }
        const m = new T.MeshLambertMaterial({ color: src.color, map: src.map, vertexColors: !!src.vertexColors, side: src.side,
          alphaTest: src.alphaTest || (src.transparent ? 0.5 : 0) });
        if (src.emissiveMap) { m.emissiveMap = src.emissiveMap; m.emissive = new T.Color(0, 0, 0); m.userData.glow = true; }
        o.material = m;
      }
    });
    bob = new T.Group(); bob.add(player);
    Bt.root = new T.Group(); Bt.root.name = 'boat'; Bt.root.add(bob);
    Bt.model = player; Bt.bob = bob;
    scene.add(Bt.root);
    if (root.DRVfx) DRVfx.init(scene);
    for (let i = 1; i <= 5; i++) tierNodes[i] = child(player, 'Boat' + i);
    // Đèn: số đèn cố định để three.js không biên dịch lại shader khi bật/tắt (tắt = cường độ 0).
    const point = new T.PointLight(0xfff4d6, 0, 10, 1.4);
    const spots = [0, 1].map(() => { const l = new T.SpotLight(0xffdaa7, 0, 10, Math.PI / 3, 0.45, 1.2); l.target.position.set(0, 0, -1); l.add(l.target); return l; });
    Bt.lights = { point, spots };
    bob.add(point); spots.forEach(l => bob.add(l));
    for (let i = 0; i < 2; i++) beams.push(beamMesh(bob));
    setTier(root.DR.s ? root.DR.s.hullTier : 1);
  }

  // [ĐỀ XUẤT] nón sáng: node Beam1/Beam2 gốc là hệ hạt/billboard không xuất ra glb, vẽ thay bằng nón cộng màu mờ
  function beamMesh(parent) {
    const g = new T.ConeGeometry(1, 1, 20, 1, true); g.translate(0, -0.5, 0); g.rotateX(Math.PI / 2);
    const m = new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
      uniforms: { uA: { value: 0 } },
      vertexShader: 'varying float vZ; varying vec3 vN; varying vec3 vV; void main(){ vZ = -position.z; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform float uA; varying float vZ; varying vec3 vN; varying vec3 vV; void main(){ float rim = pow(abs(dot(vN, vV)), 1.5); gl_FragColor = vec4(vec3(1.0,0.86,0.62) * uA * (1.0 - vZ) * rim * 0.35, 1.0); }'
    });
    const mesh = new T.Mesh(g, m); mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 3;
    parent.add(mesh);
    return mesh;
  }

  function setTier(t) {
    tier = Math.max(1, Math.min(5, t || 1));
    for (let i = 1; i <= 5; i++) if (tierNodes[i]) tierNodes[i].visible = i === tier;
    const tn = tierNodes[tier], name = 'Boat' + tier;
    props = []; rudders = [];
    for (const p of ['propeller', 'propeller2']) { const o = path(tn, 'SteeringAnimator/' + p); if (o) props.push(o); }
    for (const p of ['rudder', 'rudder2']) { const o = path(tn, 'SteeringAnimator/' + p); if (o) rudders.push(o); }
    const cs = B.colliderSize.tiers[name] || B.colliderSize.player;
    Bt.half = [cs.size[0] / 2, cs.size[2] / 2];
    // Tâm khối + quán tính: PhysX tính từ MeshCollider lồi (khối đặc đồng chất, khối lượng 1) vì prefab không ghi đè.
    // tools/vfx.py dựng bao lồi CollisionShape của BoatN rồi tích phân ⇒ DR_VFX.massProperties.
    const mp = VFX.massProperties && VFX.massProperties[name];
    if (mp) {
      Bt.com = mp.com.slice();
      Bt.I = [mp.inertia[0][0], mp.inertia[1][1], mp.inertia[2][2]].map(v => v * RB.m_Mass);
    } else {
      // [ĐỀ XUẤT] thiếu data/vfx.js: hộp va chạm
      const w = cs.size[0], h = cs.size[1], l = cs.size[2];
      Bt.com = cs.center.slice();
      Bt.I = [(h * h + l * l) / 12, (w * w + l * l) / 12, (w * w + h * h) / 12].map(v => v * RB.m_Mass);
    }
    Bt.inertia = Bt.I[1];
    const lights = B.lights.filter(l => l.tier === tier);
    const pl = lights.find(l => l.type === 'point'), sl = lights.filter(l => l.type === 'spot');
    if (pl) Bt.lights.point.position.fromArray(pl.pose.pos);
    Bt.lights.spots.forEach((l, i) => {
      const d = sl[Math.min(i, sl.length - 1)];
      if (!d) return;
      l.position.fromArray(d.pose.pos); l.quaternion.fromArray(d.pose.quat);
      l.angle = T.MathUtils.degToRad(d.spotAngle / 2); l.userData.def = d;
      beams[i].position.copy(l.position); beams[i].quaternion.copy(l.quaternion);
    });
    refresh();
  }

  // ---------- trang bị hiện trên thuyền (BoatSubModelToggler) ----------
  function refresh() {
    const D = root.DR;
    if (!D || !D.s || !player) return;
    if (D.s.hullTier !== tier) { setTier(D.s.hullTier); return; }
    const inv = D.grid('INVENTORY');
    Bt.stats = R.stats(CFG, inv, root.DR_ITEMS);
    const G = root.DRGrid, eq = B.tierEquipment['Boat' + tier] || {};
    const live = sub => inv.items.filter(i => { const d = root.DR_ITEMS[i.id]; return d && (G.subOf(d) & sub) && !G.onDamaged(inv, i); });
    const show = (list, k) => (list || []).forEach((p, i) => { const o = path(tierNodes[tier], p); if (o) o.visible = i < k; });
    const rods = live(G.SUB.ROD), lights = live(G.SUB.LIGHT), dredges = live(G.SUB.DREDGE);
    show(eq.rod && eq.rod.nodes, rods.length);
    show(eq.light && eq.light.nodes, lights.length);
    show(eq.dredge && eq.dredge.nodes, dredges.length);
    // thùng cá: ceil(n · độ đầy khoang hàng)
    let used = 0, cap = 0;
    for (let y = 0; y < inv.rows; y++) for (let x = 0; x < inv.cols; x++) {
      const c = inv.cells[y * inv.cols + x];
      if (!c || c.type === 0 || c.hidden || !(c.type & G.TYPE.GENERAL)) continue;
      cap++; const it = G.itemAt(inv, x, y);
      if (it && (G.typeOf(root.DR_ITEMS[it.id] || {}) & G.TYPE.GENERAL)) used++;
    }
    const fc = eq.fishContainers || [];
    show(fc, Math.ceil(fc.length * (cap ? used / cap : 0)));
    // vỏ hỏng: BoatN_Damage<i>, i = ceil(ô hỏng / 2), tối đa 3
    const dmg = Math.min(3, Math.ceil(inv.damage.length / 2)), tn = tierNodes[tier];
    for (let i = 1; i <= 3; i++) { const o = child(tn, 'Boat' + tier + '_Damage' + i); if (o) o.visible = i === dmg; }
    tn.children.forEach(c => { if (c.isMesh && !('active' in c.userData)) c.visible = dmg === 0; });
    if (tn.isMesh) tn.material.visible = dmg === 0;
    Bt.lightItems = lights.map(i => root.DR_ITEMS[i.id]);
    applyLights();
  }

  function applyLights() {
    const D = root.DR, on = !!(D.s && D.s.lightsOn);
    // Light0: FixedPlayerLight (fixedIntensity 1, fixedRange 10); Light1/2: lumens · lumensIntensityCoefficient
    const p = B.lights.find(l => l.tier === tier && l.type === 'point');
    Bt.lights.point.intensity = on ? (p ? p.playerLight.fixedIntensity : 1) * 1.6 : 0; // [ĐỀ XUẤT] ×1,6 bù khác biệt đơn vị URP → three.js
    Bt.lights.point.distance = p ? p.playerLight.fixedRange : 10;
    Bt.lights.spots.forEach((l, i) => {
      const it = (Bt.lightItems || [])[i], d = l.userData.def;
      const k = on && it ? it.lumens * (d ? d.playerLight.lumensIntensityCoefficient : 0.02) : 0;
      l.intensity = k * 0.35; // [ĐỀ XUẤT] 500 lm · 0,02 = 10 (Unity) → 3,5 (three.js, decay 1,2)
      l.distance = it ? it.range * 1.5 : 10;
      beams[i].visible = k > 0;
      // nón hẹp hơn góc spot 120° (vùng sáng chính của đèn pha), dài nửa tầm chiếu, tối đa 7 m
      if (k > 0) { const len = Math.min(7, it.range * 0.5), r = Math.tan(T.MathUtils.degToRad(22)) * len; beams[i].scale.set(r, r * 0.6, len); beams[i].material.uniforms.uA.value = Math.min(1, k / 20) * 0.6; }
    });
    player.traverse(o => { if (o.isMesh && o.material.userData.glow) o.material.emissive.setRGB(on ? 1 : 0, on ? 0.8 : 0, on ? 0.5 : 0); });
  }

  function toggleLights() {
    const D = root.DR;
    if (!D.s.abilities || !D.s.abilities.lights) return false;
    D.s.lightsOn = !D.s.lightsOn;
    if (root.DRAudio) DRAudio.play(D.s.lightsOn ? 'boat.light.on' : 'boat.light.off');
    applyLights();
    D.emit('lights', D.s.lightsOn);
    return true;
  }

  function place(x, z, yaw) {
    const b = s();
    b.x = x; b.z = z; b.yaw = yaw || 0; b.vx = b.vz = b.w = 0;
    Bt.auto = null;
    settle();
    sync();
    if (root.DRVfx) DRVfx.reset();
  }
  // đặt thân ở độ chìm cân bằng trên mặt nước phẳng, hết dao động
  function settle() {
    F.y = -SINK; F.vy = 0; F.p = F.r = F.wp = F.wr = 0;
    const b = s();
    Object.assign(prev, { x: b.x, z: b.z, yaw: b.yaw, y: F.y, p: 0, r: 0 });
  }
  function stop() { const b = s(); b.vx = b.vz = b.w = 0; }

  // ---------- vật lý 50 Hz ----------
  function step() {
    const D = root.DR, b = s(), st = Bt.stats;
    Object.assign(prev, { x: b.x, z: b.z, yaw: b.yaw, y: F.y, p: F.p, r: F.r });
    stepAt = performance.now();
    Bt.moved = false;
    if (Bt.auto) { autoStep(); buoyancy(b, false, 0, 0); return; }
    // cập bến: Rigidbody bị khoá vị trí x, z (constraints = FreezePositionX|Z) nhưng vẫn nổi theo sóng
    if (D.mode === 'dock' || D.mode === 'title' || D.mode === 'over') {
      b.vx = b.vz = b.w = 0; Bt.inputMag = 0;
      buoyancy(b, false, 0, 0); b.vx = b.vz = b.w = 0;
      return;
    }
    const allowed = D.mode === 'sail' && !Bt.blocked;
    let x = 0, y = 0;
    if (allowed) { x = Bt.input.x; y = Bt.input.y; }
    Bt.inputMag = Math.max(Math.abs(x), Math.abs(y));
    Bt.moved = Math.abs(x) > 1e-6 || Math.abs(y) > 1e-6;
    let force = 0, torque = 0;
    if (allowed && st) {
      const num2 = st.speed;
      force = y > 0 ? y * num2 : y < 0 ? y * num2 * st.reverse : 0;
      torque = x * st.turn;
      const sw = Math.min(1, root.DRWorld.steep01(b.x, b.z) * 10) * root.DRWater.uniforms.uWaveSteep.value * (num2 * 0.0001);
      b.vx -= b.vx * sw; b.vz -= b.vz * sw;
    }
    buoyancy(b, allowed, force, torque);
    collide();
  }

  // Một bước PhysX của Rigidbody thuyền: lực PlayerController + BuoyantObject, rồi tích phân bán ẩn (v trước, vị trí sau).
  function buoyancy(b, allowed, force, torque) {
    // độ dốc sóng tại thuyền: UpdateWaveSteepness mỗi 0,5 s, Lerp(smoothed, target, fixedDeltaTime) mỗi bước
    F.steepT -= DT;
    if (F.steepT <= 0) { F.steepT += 0.5; F.steepTarget = Math.min(1, root.DRWorld.steep01(b.x, b.z) * 10); }
    F.smoothSteep += (F.steepTarget - F.smoothSteep) * DT;
    const steep = root.DRWater.uniforms.uWaveSteep.value * F.smoothSteep;
    Bt.waveSteep = steep;
    const cy = Math.cos(b.yaw), sy = Math.sin(b.yaw), cp = Math.cos(F.p), sp = Math.sin(F.p), cr = Math.cos(F.r), sr = Math.sin(F.r);
    // R = Ry(yaw)·Rx(p)·Rz(r) (thứ tự 'YXZ' như bob)
    const rot = (v, o) => {
      const x1 = v[0] * cr - v[1] * sr, y1 = v[0] * sr + v[1] * cr, z1 = v[2];          // Rz
      const y2 = y1 * cp - z1 * sp, z2 = y1 * sp + z1 * cp;                              // Rx
      o[0] = x1 * cy + z2 * sy; o[1] = y2; o[2] = -x1 * sy + z2 * cy;                    // Ry
      return o;
    };
    const com = rot(Bt.com, [0, 0, 0]);
    const fw = rot([0, 0, -1], [0, 0, 0]);
    const vx0 = b.vx, vy0 = F.vy, vz0 = b.vz;
    // gia tốc thẳng và gia tốc góc (khung thế giới) gom trong bước
    let ax = 0, ay = -G * (RB.m_UseGravity === false ? 0 : 1), az = 0, tx = 0, tz = 0;
    // PlayerController: AddForce(forward · lực/50) (Force: chia khối lượng), AddTorque(0, mô-men/50, 0) (Force: I⁻¹)
    ax += fw[0] * (force / 50) / RB.m_Mass; ay += fw[1] * (force / 50) / RB.m_Mass; az += fw[2] * (force / 50) / RB.m_Mass;
    // Unity +y = theo chiều kim đồng hồ nhìn từ trên; three.js +y ngược lại ⇒ đổi dấu
    let dw = -(torque / 50) / Bt.I[1] * DT;
    let dvx = 0, dvy = 0, dvz = 0, dwp = 0, dwr = 0;
    const gEach = -G / EFFECTORS.length * BO.gravityModifier, r = [0, 0, 0], e = [0, 0, 0];
    let sub = 0;
    for (let i = 0; i < EFFECTORS.length; i++) {
      rot(EFFECTORS[i], e);
      const px = b.x + e[0], py = F.y + e[1], pz = b.z + e[2];
      r[0] = e[0] - com[0]; r[1] = e[1] - com[1]; r[2] = e[2] - com[2];
      // lực Acceleration tại điểm: τ = r × (0, a, 0) = (−r_z·a, 0, r_x·a), không chia quán tính
      ay += gEach; tx += -r[2] * gEach; tz += r[0] * gEach;
      const d = root.DRWater.wave(px, pz, steep)[0] - py;
      if (d > 0) {
        sub++;
        const up = G * Math.min(1, d) / BO.objectDepth * BO.strength;
        ay += up; tx += -r[2] * up; tz += r[0] * up;
        dvx -= vx0 * BO.velocityDrag * DT; dvy -= vy0 * BO.velocityDrag * DT; dvz -= vz0 * BO.velocityDrag * DT;
        // Impulse: Δω = I⁻¹·(−ω·angularDrag·dt) theo trục thân (chúi = x, đứng = y, nghiêng = z)
        dwp -= F.wp * BO.angularDrag * DT / Bt.I[0];
        dw -= b.w * BO.angularDrag * DT / Bt.I[1];
        dwr -= F.wr * BO.angularDrag * DT / Bt.I[2];
      }
    }
    F.sub = sub;
    // gia tốc góc thế giới → trục chúi (x thân) và nghiêng (z thân) sau khi bỏ hướng mũi
    const ap = tx * cy - tz * sy, ar = tx * sy + tz * cy;
    b.vx += ax * DT + dvx; F.vy += ay * DT + dvy; b.vz += az * DT + dvz;
    F.wp += ap * DT + dwp; F.wr += ar * DT + dwr; b.w += dw;
    const drag = allowed ? PH.controller.defaultDrag : PH.controller.movementBlockedDrag;
    const kd = Math.max(0, 1 - DT * drag), ka = Math.max(0, 1 - DT * RB.m_AngularDrag);
    b.vx *= kd; F.vy *= kd; b.vz *= kd;
    b.w *= ka; F.wp *= ka; F.wr *= ka;
    b.w = Math.max(-MAX_W, Math.min(MAX_W, b.w));
    b.x += b.vx * DT; F.y += F.vy * DT; b.z += b.vz * DT; b.yaw += b.w * DT;
    F.p += F.wp * DT; F.r += F.wr * DT;
    // ClampAngle: góc Euler x, z không quá 55°
    if (Math.abs(F.p) > CLAMP) { F.p = Math.sign(F.p) * CLAMP; F.wp = 0; }
    if (Math.abs(F.r) > CLAMP) { F.r = Math.sign(F.r) * CLAMP; F.wr = 0; }
  }

  function collide() {
    const D = root.DR, b = s();
    const hit = root.DRWorld.resolve(b, Bt.half[0], Bt.half[1]);
    if (!hit || D.mode !== 'sail') return;
    b.w *= 0.5;
    const now = performance.now() / 1000;
    const nearDock = root.DRDocks && DRDocks.nearestDist(b.x, b.z) < SAFE_NEAR_DOCK;
    if (hit.impact >= IMPACT_HIT && !nearDock) {
      if (now <= Bt.lastHit + PH.playerCollider.invulnerabilityTimeInSeconds) return;
      Bt.lastHit = now;
      damage(hit.impact);
    } else if (hit.impact >= IMPACT_SAFE && now > Bt.lastHit + 0.6) {
      Bt.lastHit = now;
      if (root.DRAudio) DRAudio.play('boat.impact.safe', 0.6);
      Bt.shake = Math.max(Bt.shake, 0.15);
    }
  }

  // Player.OnCollision → GridManager.AddDamageToInventory(1); chết khi số ô hỏng > DamageThreshold.
  function damage(impact) {
    const D = root.DR, inv = D.grid('INVENTORY');
    const res = root.DRGrid.addDamage(inv, root.DR_ITEMS, false);
    if (root.DRAudio) DRAudio.play('boat.impact.' + (1 + Math.floor(Math.random() * 5)));
    Bt.shake = Math.max(Bt.shake, 0.35 * CFG.cameraShakeScaleFactor);
    D.emit('damage', res, impact);
    if (res && res.destroyed && root.DRHud) DRHud.toast('Mất ' + (root.DR_ITEMS[res.destroyed.id] || {}).name + ' khi đâm vào đá');
    if (res) D.emit('cargo', 'INVENTORY', null);
    refresh();
    const limit = R.damageThreshold(CFG, D.s.hullTier);
    if (inv.damage.length > limit) D.emit('death', 'hull');
  }

  // ---------- tự lái (cập bến / rời bến): MoveTowards + Slerp như PlayerController ----------
  function autoMove(target, done, speed) { Bt.auto = { target, done, speed: speed || AUTO_SPEED }; }
  function autoStep() {
    const b = s(), a = Bt.auto, t = a.target;
    b.vx = b.vz = b.w = 0; F.vy = 0; // rb.velocity = Vector3.zero (PlayerController.cs:160)
    const dx = t.x - b.x, dz = t.z - b.z, d = Math.hypot(dx, dz), stepLen = a.speed * DT;
    if (d <= stepLen) { b.x = t.x; b.z = t.z; } else { b.x += dx / d * stepLen; b.z += dz / d * stepLen; }
    if (t.yaw != null) {
      let dy = t.yaw - b.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      b.yaw += dy * Math.min(1, LOOK_SPEED * DT); // Quaternion.Slerp(rot, đích, _lookSpeed·dt)
    }
    Bt.moved = true; Bt.inputMag = 0;
    let dy = t.yaw == null ? 0 : Math.abs(Math.atan2(Math.sin(t.yaw - b.yaw), Math.cos(t.yaw - b.yaw)));
    if (d <= (t.reach || 0.02) && dy < (t.angle || 0.05)) {
      const cb = a.done; Bt.auto = null;
      if (cb) cb();
    }
  }

  // ---------- hình ảnh ----------
  // Rigidbody.interpolation = Interpolate (m_Interpolate 1): hình vẽ nội suy giữa hai bước vật lý gần nhất
  function sync(alpha) {
    const b = s();
    const k = alpha == null ? 1 : alpha;
    const L = (a, c) => a + (c - a) * k;
    let dy = b.yaw - prev.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    Bt.root.position.set(L(prev.x, b.x), L(prev.y, F.y), L(prev.z, b.z));
    Bt.root.rotation.set(0, prev.yaw + dy * k, 0);
    if (bob) bob.rotation.set(L(prev.p, F.p), 0, L(prev.r, F.r), 'YXZ');
  }

  let lerpThr = 0;
  function update(dt, env) {
    if (!player || !root.DR.s) return;
    const D = root.DR;
    sync(Math.min(1, Math.max(0, (performance.now() - stepAt) / (DT * 1000))));
    bob.position.y = 0;
    // SteeringAnimator.Update: chỉ khi được lái tay (không tự lái), lùi thì bánh lái đảo chiều
    const manual = !Bt.auto && D.mode === 'sail' && !Bt.blocked;
    let mx = manual ? Bt.input.x : 0;
    const my = manual ? Bt.input.y : 0;
    lerpThr += (my - lerpThr) * Math.min(1, dt * 4);
    if (my < 0) mx = -mx;
    for (const p of props) p.rotation.z += PROP_SPEED * lerpThr * dt;
    // Unity quay quanh y theo chiều kim đồng hồ; three.js ngược lại: góc −60°·x (Unity) ⇒ +60°·x
    Bt.steer += (RUDDER_MAX * mx - Bt.steer) * Math.min(1, dt * 10);
    for (const r of rudders) r.rotation.y = Bt.steer;
    Bt.shake = Math.max(0, Bt.shake - dt * 1.5);
    if (root.DRVfx) DRVfx.update(dt, env);
    if (root.DRAudio) audio();
  }

  // Tiếng thuyền theo tốc độ Rigidbody (vận tốc 3 chiều):
  //   PlayerEngineAudio: t = clamp01(v·velocityModifier), cao độ lerp(minPitch, maxPitch, t), âm lượng lerp(minVolume, maxVolume, t);
  //     tự lái: v = autoMoveSpeed·autoMoveVelocityModifier, cao độ × autoMovePitchModifier
  //   BoatWakeAudio: âm lượng lerp(min, max, clamp01(v·velocityModifier))
  //   HeavyWavesAudio: âm lượng lerp(min, max, InverseLerp(minSteepness, maxSteepness, CurrentWaveSteepness))
  //   WavesLappingAudioSource: AudioSource.volume 0,5 cố định
  function audio() {
    const D = root.DR, on = D.mode !== 'title' && D.mode !== 'over';
    const b = s(), v = Math.hypot(b.vx, F.vy, b.vz);
    const E = AUD ? AUD.engine : { velocityModifier: 0.1, minPitch: 0.9, maxPitch: 1.3, minVolume: 0.1, maxVolume: 1, autoMoveVelocityModifier: 4, autoMovePitchModifier: 0.9 };
    const auto = !!Bt.auto;
    const te = Math.min(1, (auto ? (Bt.auto.speed || AUTO_SPEED) * E.autoMoveVelocityModifier : v) * E.velocityModifier);
    const pitchK = auto ? E.autoMovePitchModifier : 1;
    Bt.audio = { engineVol: E.minVolume + (E.maxVolume - E.minVolume) * te, enginePitch: (E.minPitch + (E.maxPitch - E.minPitch) * te) * pitchK };
    DRAudio.loop('boat.engine.' + tier, on ? Bt.audio.engineVol : 0, Bt.audio.enginePitch);
    const W = AUD ? AUD.wake : { velocityModifier: 0.05, minVolume: 0, maxVolume: 1 };
    Bt.audio.wakeVol = W.minVolume + (W.maxVolume - W.minVolume) * Math.min(1, v * W.velocityModifier);
    DRAudio.loop('ambience.boatWake', on ? Bt.audio.wakeVol : 0);
    const H = AUD ? AUD.heavyWaves : { minSteepness: 0, maxSteepness: 0.2, minVolume: 0.3, maxVolume: 1 };
    const th = Math.min(1, Math.max(0, (Bt.waveSteep - H.minSteepness) / ((H.maxSteepness - H.minSteepness) || 1)));
    Bt.audio.heavyVol = H.minVolume + (H.maxVolume - H.minVolume) * th;
    DRAudio.loop('ambience.waves.large', on ? Bt.audio.heavyVol : 0);
    DRAudio.loop('ambience.waves.boat', on ? (AUD ? AUD.wavesLapping.source.volume : 0.5) : 0);
  }

  // số đo cho kiểm thử (test/dredge-sea.js)
  function feel() {
    const b = s();
    return { y: F.y, vy: F.vy, pitch: F.p, roll: F.r, wp: F.wp, wr: F.wr, submerged: F.sub, waveSteep: Bt.waveSteep,
      speed3: Math.hypot(b.vx, F.vy, b.vz), steer: Bt.steer, lerpThr, com: Bt.com, I: Bt.I, audio: Bt.audio || null };
  }

  const speed = () => { const D = root.DR; return D.s ? Math.hypot(D.s.boat.vx, D.s.boat.vz) : 0; };
  const knots = () => speed() * 1.943844;

  Object.assign(Bt, { load, setTier, refresh, applyLights, toggleLights, place, stop, step, update, autoMove, speed, knots, sync, damage, settle, feel, DT, SINK });
})(window);
