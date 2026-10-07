/*
 * Thuyền: mô hình gốc (art/boat/boat.glb), vật lý chép PlayerController.FixedUpdate ở 50 Hz, nhấp nhô theo sóng,
 * đèn (L), tiếng máy, va chạm bờ → hỏng ô khoang (CODE.md 6).
 *
 * Mỗi bước 1/50 s (Unity ForceMode.Force: Δv = F/m·dt):
 *   num2 = DRRules.stats().speed   (= max(BasePlayerSpeed + Σ speedBonus, BasePlayerSpeed) · BaseMovementSpeedModifier)
 *   lực tiến = y·num2 (y < 0: · reverse), AddForce(forward · lực/50); mô-men = x·turn, AddTorque(mô-men/50)
 *   cản sóng: v −= v · clamp01(alpha·10)·Steepness·num2·0.0001
 *   BuoyantObject: mỗi phao chìm (4 phao) v −= v·velocityDrag·dt, ω −= ω·angularDrag·dt / I (Impulse)
 *   Rigidbody: v ·= 1 − dt·drag (drag = 0,1, khoá di chuyển = 3), ω ·= 1 − dt·angularDrag, |ω| ≤ 7
 *   DRBoat.load(get, scene)  DRBoat.step(input)  DRBoat.update(dt, env)  DRBoat.place(x, z, yaw)
 *   DRBoat.autoMove({x, z, yaw}, cb)  DRBoat.speed()  DRBoat.knots()
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

  const Bt = root.DRBoat = {
    root: null, model: null, input: { x: 0, y: 0 }, inputMag: 0, moved: false, blocked: false, auto: null,
    lights: [], stats: null, steer: 0, shake: 0, lastHit: -1e9, inertia: 1, half: [0.6, 1.26]
  };
  let player = null, tierNodes = [], tier = 1, bob = null, props = [], rudders = [], beams = [];
  let smoothSteep = 0, heave = 0, pitch = 0, roll = 0, vh = 0, vp = 0, vr = 0;
  const s = () => root.DR.s.boat;

  function child(o, name) { return o.children.find(c => c.userData.name === name || c.name === name) || null; }
  function path(o, p) { for (const n of p.split('/')) { o = o && child(o, n); } return o; }

  // ---------- nạp ----------
  async function load(get, scene) {
    const buf = await get(B.glb, 'buffer');
    const gltf = await new Promise((res, rej) => new T.GLTFLoader().parse(buf, '', res, rej));
    player = gltf.scene.getObjectByName('Player') || gltf.scene;
    player.traverse(o => {
      if ('active' in o.userData) o.visible = o.userData.active !== false;
      if (o.userData.mask) o.visible = false;
      if (o.isMesh) {
        const src = o.material;
        if (/Mask_Mat/.test(src.name)) { o.visible = false; return; }
        const m = new T.MeshLambertMaterial({ color: src.color, map: src.map, vertexColors: !!src.vertexColors, side: src.side,
          alphaTest: src.alphaTest || (src.transparent ? 0.5 : 0) });
        if (src.emissiveMap) { m.emissiveMap = src.emissiveMap; m.emissive = new T.Color(0, 0, 0); m.userData.glow = true; }
        o.material = m;
      }
    });
    bob = new T.Group(); bob.add(player);
    Bt.root = new T.Group(); Bt.root.name = 'boat'; Bt.root.add(bob);
    Bt.model = player;
    scene.add(Bt.root);
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
    // [ĐỀ XUẤT] mô-men quán tính trục y của hộp va chạm (khối lượng 1): Unity tính tensor từ MeshCollider lồi, không lưu trong prefab
    Bt.inertia = RB.m_Mass * (cs.size[0] * cs.size[0] + cs.size[2] * cs.size[2]) / 12;
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
    sync();
  }
  function stop() { const b = s(); b.vx = b.vz = b.w = 0; }

  // ---------- vật lý 50 Hz ----------
  function step() {
    const D = root.DR, b = s(), st = Bt.stats;
    Bt.moved = false;
    if (Bt.auto) { autoStep(); return; }
    // cập bến: Rigidbody bị khoá vị trí (constraints = FreezePositionX|Z)
    if (D.mode === 'dock' || D.mode === 'title' || D.mode === 'over') { b.vx = b.vz = b.w = 0; Bt.inputMag = 0; return; }
    const allowed = D.mode === 'sail' && !Bt.blocked;
    let x = 0, y = 0;
    if (allowed) { x = Bt.input.x; y = Bt.input.y; }
    Bt.inputMag = Math.max(Math.abs(x), Math.abs(y));
    Bt.moved = Math.abs(x) > 1e-6 || Math.abs(y) > 1e-6;
    const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw);
    if (allowed && st) {
      const num2 = st.speed;
      const force = y > 0 ? y * num2 : y < 0 ? y * num2 * st.reverse : 0;
      const torque = x * st.turn;
      const sw = Math.min(1, root.DRWorld.steep01(b.x, b.z) * 10) * root.DRWater.uniforms.uWaveSteep.value * (num2 * 0.0001);
      b.vx -= b.vx * sw; b.vz -= b.vz * sw;
      b.vx += fx * (force / 50) / RB.m_Mass * DT; b.vz += fz * (force / 50) / RB.m_Mass * DT;
      // Unity +y = theo chiều kim đồng hồ nhìn từ trên; three.js +y ngược lại ⇒ đổi dấu
      b.w -= (torque / 50) / Bt.inertia * DT;
    }
    for (let i = 0; i < EFFECTORS.length; i++) {
      b.vx -= b.vx * BO.velocityDrag * DT; b.vz -= b.vz * BO.velocityDrag * DT;
      b.w -= b.w * BO.angularDrag * DT / Bt.inertia;
    }
    const drag = allowed ? PH.controller.defaultDrag : PH.controller.movementBlockedDrag;
    b.vx *= 1 - DT * drag; b.vz *= 1 - DT * drag;
    b.w *= 1 - DT * RB.m_AngularDrag;
    b.w = Math.max(-MAX_W, Math.min(MAX_W, b.w));
    b.x += b.vx * DT; b.z += b.vz * DT; b.yaw += b.w * DT;
    collide();
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
    b.vx = b.vz = b.w = 0;
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
  function sync() {
    const b = s();
    Bt.root.position.set(b.x, 0, b.z);
    Bt.root.rotation.set(0, b.yaw, 0);
  }

  function update(dt, env) {
    if (!player || !root.DR.s) return;
    const b = s();
    sync();
    // sóng ở 4 phao (BuoyantObject: steepness làm mượt theo dt)
    smoothSteep += (Math.min(1, root.DRWorld.steep01(b.x, b.z) * 10) - smoothSteep) * Math.min(1, dt);
    const st = smoothSteep * root.DRWater.uniforms.uWaveSteep.value;
    const cs = Math.cos(b.yaw), sn = Math.sin(b.yaw), h = [];
    for (const e of EFFECTORS) {
      const wx = b.x + e[0] * cs + e[2] * sn, wz = b.z - e[0] * sn + e[2] * cs;
      h.push(root.DRWater.wave(wx, wz, st)[0]);
    }
    // phao 1,2 ở mũi (z −1), 3,4 ở đuôi (z +0,75); 1,4 trái (x −0,45), 2,3 phải
    const tHeave = (h[0] + h[1] + h[2] + h[3]) / 4 - SINK;
    const tPitch = Math.atan2(((h[0] + h[1]) - (h[2] + h[3])) / 2, 1.75);
    const tRoll = Math.atan2(((h[1] + h[2]) - (h[0] + h[3])) / 2, 0.9);
    // lò xo tắt dần cho cảm giác nổi (thay cho mô phỏng lực nổi từng phao)
    const k = 18, c = 6;
    vh += (k * (tHeave - heave) - c * vh) * dt; heave += vh * dt;
    vp += (k * (tPitch - pitch) - c * vp) * dt; pitch += vp * dt;
    vr += (k * (tRoll - roll) - c * vr) * dt; roll += vr * dt;
    const sp = speed();
    bob.position.y = heave;
    bob.rotation.set(pitch + Math.min(0.06, sp * 0.012), 0, -roll, 'YXZ'); // mũi hơi ngóc khi chạy nhanh
    const thr = Bt.auto ? 0.4 : Bt.input.y;
    for (const p of props) p.rotation.z += dt * thr * 30;
    Bt.steer += ((Bt.auto ? 0 : -Bt.input.x * 0.5) - Bt.steer) * Math.min(1, dt * 6);
    for (const r of rudders) r.rotation.y = Bt.steer;
    Bt.shake = Math.max(0, Bt.shake - dt * 1.5);
    // tiếng máy theo tốc độ (PlayerEngineAudio: âm lượng lerp(min, max, clamp01(v·velocityModifier)))
    if (root.DRAudio) {
      const D = root.DR, on = D.mode === 'sail' || D.mode === 'harvest' || D.mode === 'cargo';
      const t = Math.min(1, sp / 3.6);
      // [ĐỀ XUẤT] min/max âm lượng và cao độ (minPitch/maxPitch) nằm ở prefab, chưa bóc được
      DRAudio.loop('boat.engine.' + tier, on ? 0.25 + 0.75 * t : 0, 0.8 + 0.45 * t);
      DRAudio.loop('ambience.boatWake', on ? t : 0);
    }
  }

  const speed = () => { const D = root.DR; return D.s ? Math.hypot(D.s.boat.vx, D.s.boat.vz) : 0; };
  const knots = () => speed() * 1.943844;

  Object.assign(Bt, { load, setTier, refresh, applyLights, toggleLights, place, stop, step, update, autoMove, speed, knots, sync, damage, DT, SINK });
})(window);
