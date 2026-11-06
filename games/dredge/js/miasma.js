/*
 * Miasma (FogDevil, FogDevil.cs) — khói đỏ ma ám của The Marrows. Dữ liệu: data/miasma.js (tools/miasma.py, Scenes/Game.unity), hạt dùng sẵn
 * FogDevilParticles / FogDevilAggroParticles trong data/particles.js. Quy tắc: MONSTERS.md §2.2.
 *
 * Hai thực thể (S: FogDevilContainer/FogDevil, FogDevil (1)) cùng số: speed 0,15, chaseDistance 20, spawnDistance 50 ± 30, vòng cung ±60°,
 * giờ hiện > 0,84 hoặc < 0,17 (Time.Time), thử sinh mỗi 1 s, worldPhase 1 / 3. Máy trạng thái FogDevil.cs: NOT_SPAWNED → ATTEMPTING_TO_SPAWN →
 * SPAWNED → DESPAWNING (Update :195-215).
 *   Sinh (DoTrySpawn :274-296): điểm = thuyền + hướng mũi · (50 ± 30), xoay quanh thuyền ±60°; loại nếu SampleWaveSteepnessAtPosition (kênh alpha của
 *     mặt nạ sóng = DRWorld.steep01, KHÔNG phải độ sâu) < 0,05; thành công: spawnPos = điểm, tiếng 0,5, hạt bật, RefreshAggroState(đèn).
 *   Giận (RefreshAggroState :120-161): đèn bật → _NeutralAmount 0 trong 0,1 s (DOTween mặc định OutQuad) + Emit(3) hạt + 15 hạt giận; đèn tắt → 1 trong 1 s.
 *     Vật liệu CHUNG của hai FogDevil (2a95758e = FogDevilParticle_Mat_0) nên một trạng thái cho cả hai.
 *   Di chuyển (AdjustPosition :216-250): giận, không ở bến và thuyền cách spawnPos < 20 m → SanityModifier bật, màu hạt = chaseColor, tuổi hạt ×0,1,
 *     tối đa 5 hạt, noise = invLerp(20, 0, khoảng cách tới thuyền)·3, bước = MoveMod·0,15·invLerp(20, 0, khoảng cách)·dt về phía thuyền (mặt phẳng).
 *     Ngược lại: SanityModifier tắt, tuổi ×1, tối đa 2 hạt, noise 0, màu idleColor, về spawnPos với 2 m/s. Cách thuyền > 80 m → thử sinh lại.
 *   Biến mất (Despawn :252-263): sang ngày (0,17..0,84): tắt phát hạt, tiếng giảm về 0 trong startLifetime.constantMin, rồi tắt SanityModifier.
 *   Gây hại: SanityModifier con: đêm −10 trong 2 m, lerp về 0 ở 10 m, ngày 0 (DRSky.addSanitySource); không trừ thân thuyền.
 *   Tiếng: whispering-sounds (monster.whispers) 3D, 1..30 m, loop.
 * [ĐỀ XUẤT] bản web không có GameMode PASSIVE hay OnFinaleVoyageStarted nên bỏ hai nhánh ấy. ps.startLifetime.constantMin của khoảng ngẫu nhiên
 * lấy mốc đầu (1,5 s) × hệ số tuổi hiện tại. Vòng lặp tự chạy bằng requestAnimationFrame (không cần dây vào main.js); dt = 0 khi ở màn hình
 * tiêu đề / mở khoang. AggroParticles trong dữ liệu chỉ vẽ vệt (không vẽ được ở hệ hạt hiện tại), vẫn phát đúng nhịp.
 *
 *   DRMiasma.debug → { inst(i) → trạng thái sống, count, setRandom(fn|null), step(dt), reset() }
 */
(function (root) {
  'use strict';
  const T = root.THREE, DATA = root.DR_MIASMA;
  if (!T || !DATA || !DATA.instances) { root.DRMiasma = null; return; }
  const NOT = 0, TRY = 1, UP = 2, DOWN = 3, NAMES = ['NOT_SPAWNED', 'ATTEMPTING_TO_SPAWN', 'SPAWNED', 'DESPAWNING'];
  const LIFE_MIN = 1.5;                                  // FogDevilParticles main.startLifetime: hai hằng 1,5 / 0,1 (constantMin = mốc đầu)
  let rand = Math.random, clock = 0, scene = null, mats = [], matT = 0, lastMode = null;
  const D = () => root.DR;

  const invLerp = (a, b, v) => { const t = (v - a) / (b - a); return t < 0 ? 0 : t > 1 ? 1 : t; };
  const outQuad = t => 1 - (1 - t) * (1 - t);

  // _NeutralAmount chung: tween DOFloat (OutQuad)
  const neutral = { v: DATA.neutral.start, from: 0, to: 0, t: 1, dur: 1 };
  function neutralTo(to, dur) { neutral.from = neutral.v; neutral.to = to; neutral.t = 0; neutral.dur = dur; }
  function neutralTick(dt) {
    if (neutral.t < 1) { neutral.t = Math.min(1, neutral.t + dt / neutral.dur); neutral.v = neutral.from + (neutral.to - neutral.from) * outQuad(neutral.t); }
    const sc = findScene();
    if (!sc) return;
    matT -= dt;
    if (matT <= 0) { matT = 1; mats = []; for (const o of sc.children) if (o.isMesh && o.name && o.name.indexOf('particles FogDevilParticle_Mat_0|') === 0) mats.push(o.material); }
    for (const m of mats) if (m.uniforms && m.uniforms.uP) m.uniforms.uP.value.y = neutral.v;
  }
  function findScene() {
    if (scene) return scene;
    let o = root.DRBoat && root.DRBoat.root;
    while (o && o.parent) o = o.parent;
    scene = o || null;
    return scene;
  }

  function make(d) {
    const anchor = new T.Object3D();
    const o = {
      d, state: NOT, anchor, x: d.x, z: d.z, spawnX: d.x, spawnZ: d.z, lastTry: -1e9, aggro: false, chasing: false, despawnT: 0, despawnFrom: 0,
      enableNext: false, ps: null, aps: null, vol: 0, voice: null, voiceT: 0, sanity: null, color: d.idleColor.slice(), maxN: DATA.idle.maxParticles
    };
    return o;
  }
  const inst = DATA.instances.map(make);

  // ---------------------------------------------------------------- hạt
  // Hệ gốc dùng chung dữ liệu: sao riêng node của hệ này để đổi main.color / life / noise như ParticleSystem.MainModule của bản gốc
  function ownNode(s) { s.node = Object.assign({}, s.node, { main: Object.assign({}, s.node.main), noise: s.node.noise ? Object.assign({}, s.node.noise) : s.node.noise }); }
  function ensureParticles(o) {
    if (o.ps || !root.DRParticles) return;
    o.ps = DRParticles.spawn('FogDevilParticles', { parent: o.anchor, loop: true });
    o.aps = DRParticles.spawn('FogDevilAggroParticles', { parent: o.anchor, loop: true });
    for (const h of [o.ps, o.aps]) for (const s of h.systems) { ownNode(s); s.emitting = false; }   // em.enabled = false (Start :172)
    o.baseLife = o.ps.systems[0] ? o.ps.systems[0].node.main.life : null;
    if (o.ps.systems[0]) o.baseN = o.ps.systems[0].N;
    setMain(o, d0(o).idleColor, DATA.idle.lifetimeMul, DATA.idle.maxParticles, DATA.idle.noise);
  }
  const d0 = o => o.d;
  function mainSys(o) { return o.ps && o.ps.systems[0]; }
  // ma.startColor / startLifetimeMultiplier / maxParticles, no.strength
  function setMain(o, col, lifeMul, maxN, noise) {
    o.color = col.slice();
    o.maxN = maxN; o.lifeMul = lifeMul; o.noiseStr = noise;
    const s = mainSys(o);
    if (!s) return;
    const m = s.node.main;
    m.color = { color: col.slice() };
    m.life = { min: o.baseLife.min * lifeMul, max: o.baseLife.max * lifeMul };
    s.N = Math.min(maxN, o.baseN);
    if (s.node.noise) s.node.noise.str = { c: noise };
  }
  function emitting(o, on) {
    for (const h of [o.ps, o.aps]) if (h) for (const s of h.systems) { s.emitting = on; if (on) s.playing = true; }
  }

  // ---------------------------------------------------------------- tiếng (AudioSource trên SanityModifier con, 1..30 m, loop)
  function voiceTick(o, dt) {
    const A = root.DRAudio;
    if (!A || !A.voice) return;
    if (o.state === UP || o.state === DOWN) {
      if (!o.voice || (!o.voice.alive && !o.voice.stopped)) {
        o.voiceT -= dt;
        if (o.voiceT <= 0) { o.voiceT = 1; o.voice = A.voice('monster.whispers', { loop: true, vol: 0, pos: { x: o.x, y: 0, z: o.z }, min: o.d.audio.min, max: o.d.audio.max }); }
      }
      if (o.voice && o.voice.alive) { o.voice.pos(o.x, 0, o.z); o.voice.gain(o.vol / (o.voice.kv || 1), 0.05); }
    } else if (o.voice) { o.voice.stop(0.2); o.voice = null; }
  }

  // ---------------------------------------------------------------- vòng đời
  function playerXZ() { const b = D().s && D().s.boat; return b ? [b.x, b.z] : null; }
  function docked() { const s = D().s; return !!(s && (s.dock || D().mode === 'dock')); }
  const phaseNow = () => (D().s && D().s.worldPhase) | 0;
  const timeNow = () => { const t = D().s ? D().s.time : 0.5; return t - Math.floor(t); };
  const lightsOn = () => !!(D().s && D().s.lightsOn);

  function refreshAggro(o, active) {
    if (active) {
      if (o.state === UP) {
        if (o.ps) o.ps.emit(DATA.aggroEmit.main);
        if (o.aps) o.aps.emit(DATA.aggroEmit.aggro);
      }
      neutralTo(0, DATA.neutral.aggroSec);
      o.aggro = true;
    } else {
      neutralTo(1, DATA.neutral.calmSec);
      o.aggro = false;
    }
  }

  function trySpawn(o) {
    const b = D().s.boat, d = o.d;
    // point = player + forward · (spawnDistance + Random(−off, +off)), xoay quanh thuyền Random(−arc, +arc) độ quanh trục Y
    const dist = d.spawnDistance + (rand() * 2 - 1) * d.spawnDistanceRandomOffset;
    const f = root.DREvents ? DREvents.offsetWorld(b, [0, 0, dist]) : [b.x - Math.sin(b.yaw) * dist, b.z - Math.cos(b.yaw) * dist];
    const a = (rand() * 2 - 1) * d.spawnArcRadius * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const dx = f[0] - b.x, dz = f[1] - b.z;
    const px = b.x + dx * c - dz * s, pz = b.z + dx * s + dz * c;
    if (root.DRWorld.steep01(px, pz) < d.minimumDepthSpawn) return false;   // SampleWaveSteepnessAtPosition(point) < minimumDepthSpawn
    o.x = px; o.z = pz; o.spawnX = px; o.spawnZ = pz;
    o.state = UP; o.vol = d.audioVolume;
    ensureParticles(o);
    o.anchor.position.set(px, 0, pz); o.anchor.updateMatrixWorld(true);
    o.enableNext = true;                                   // bật phát hạt ở khung sau: không rải hạt theo quãng dịch chuyển 50 m (rateOverDistance)
    if (!o.sanity && root.DRSky && DRSky.addSanitySource) {
      const sn = d.sanity;
      o.sanity = DRSky.addSanitySource({ x: px, z: pz, day: sn.fullValueDay, night: sn.fullValueNight, r0: sn.fullValueRadius, r1: sn.partialValueRadius, min: [sn.partialValueMinDay, sn.partialValueMinNight] });
      o.sanity.on = false;
    }
    if (o.sanity) { o.sanity.x = px; o.sanity.z = pz; o.sanity.on = true; }
    refreshAggro(o, lightsOn());
    return true;
  }

  function adjust(o, dt) {
    const p = playerXZ(), d = o.d;
    if (!p) return;
    const vx = p[0] - o.x, vz = p[1] - o.z, mag = Math.hypot(vx, vz);
    const num = Math.hypot(p[0] - o.spawnX, p[1] - o.spawnZ);      // khoảng cách thuyền tới spawnPos (không phải tới FogDevil)
    if (o.aggro && !docked() && num < d.chaseDistance) {
      o.chasing = true;
      if (o.sanity) o.sanity.on = true;
      const k = invLerp(d.chaseDistance, 0, mag);
      setMain(o, d.chaseColor, DATA.chase.lifetimeMul, DATA.chase.maxParticles, k * DATA.chase.noiseK);
      const mm = (root.DRBoat && DRBoat.stats && DRBoat.stats.moveMod) || 1, sp = mm * d.speed;
      if (mag > 1e-6) { o.x += vx / mag * dt * sp * k; o.z += vz / mag * dt * sp * k; }
    } else {
      o.chasing = false;
      if (o.sanity) o.sanity.on = false;
      setMain(o, d.idleColor, DATA.idle.lifetimeMul, DATA.idle.maxParticles, DATA.idle.noise);
      const hx = o.spawnX - o.x, hz = o.spawnZ - o.z, hl = Math.hypot(hx, hz);
      if (hl > 1e-9) { o.x += hx / hl * dt * DATA.idle.homeSpeed; o.z += hz / hl * dt * DATA.idle.homeSpeed; }   // Vector3.normalized (0 → 0)
    }
    if (mag > d.spawnDistance + d.spawnDistanceRandomOffset) o.state = TRY;
  }

  function startDespawn(o) {
    o.state = DOWN;
    emitting(o, false);
    o.despawnFrom = o.vol;
    o.despawnDur = LIFE_MIN * (o.lifeMul == null ? 1 : o.lifeMul);   // ma.startLifetime.constantMin
    o.despawnT = 0;
  }

  function tickOne(o, dt) {
    const d = o.d, p = playerXZ();
    if (o.enableNext && o.state === UP) { emitting(o, true); o.enableNext = false; }
    if (p) {
      const t = timeNow(), night = t < d.disappearTime || t > d.appearTime, day = t > d.disappearTime && t < d.appearTime;
      if (o.state === NOT && phaseNow() >= d.phase && night) o.state = TRY;
      if (o.state === TRY && clock > o.lastTry + d.retrySec) { o.lastTry = clock; trySpawn(o); }
      if ((o.state === UP || o.state === TRY) && day) startDespawn(o);
      if (o.state === UP) adjust(o, dt);
    }
    if (o.state === DOWN) {
      o.despawnT += dt;
      o.vol = o.despawnFrom * (1 - Math.min(1, o.despawnT / Math.max(1e-6, o.despawnDur)));
      if (o.despawnT >= o.despawnDur) { if (o.sanity) o.sanity.on = false; o.state = NOT; o.chasing = false; o.vol = 0; }
    }
    if (o.sanity) { o.sanity.x = o.x; o.sanity.z = o.z; }
    if (o.ps) { o.anchor.position.set(o.x, 0, o.z); o.anchor.updateMatrixWorld(true); }
    voiceTick(o, dt);
  }

  function reset() {
    for (const o of inst) {
      if (o.ps) o.ps.stop(); if (o.aps) o.aps.stop();
      if (o.voice) o.voice.stop(0.1);
      if (o.sanity) o.sanity.remove();
      o.ps = o.aps = o.voice = o.sanity = null;
      o.state = NOT; o.x = o.spawnX = o.d.x; o.z = o.spawnZ = o.d.z; o.aggro = false; o.chasing = false; o.vol = 0; o.enableNext = false; o.lastTry = -1e9;
    }
    neutral.v = DATA.neutral.start; neutral.t = 1;
  }

  // lights ability: đổi đèn → RefreshAggroState cho từng FogDevil (OnPlayerAbilityToggled)
  let lastLights = null;
  function tick(dt) {
    const Dr = D();
    if (!Dr || !Dr.s || !root.DRWorld || !Dr.s.boat) return;
    if (Dr.mode === 'title') { if (lastMode !== 'title') reset(); lastMode = 'title'; return; }
    lastMode = Dr.mode;
    if (Dr.mode === 'cargo') dt = 0;
    clock += dt;
    const L = lightsOn();
    if (lastLights !== null && L !== lastLights) for (const o of inst) refreshAggro(o, L);
    lastLights = L;
    for (const o of inst) tickOne(o, dt);
    neutralTick(dt);
  }

  let last = 0;
  function frame(now) {
    root.requestAnimationFrame(frame);
    const rdt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    try { tick(rdt * (D() && D().timeScale != null ? D().timeScale : 1)); } catch (e) { if (!frame.warned) { frame.warned = true; console.error('[miasma]', e); } }
  }
  if (root.requestAnimationFrame) root.requestAnimationFrame(frame);

  root.DRMiasma = {
    inst,
    debug: {
      count: inst.length,
      inst: i => {
        const o = inst[i];
        return o && { state: NAMES[o.state], x: o.x, z: o.z, spawnX: o.spawnX, spawnZ: o.spawnZ, aggro: o.aggro, chasing: o.chasing, color: o.color.slice(),
          maxParticles: o.maxN, lifeMul: o.lifeMul, noise: o.noiseStr, sanityOn: !!(o.sanity && o.sanity.on), volume: o.vol, neutral: neutral.v,
          emitting: !!(o.ps && o.ps.systems[0] && o.ps.systems[0].emitting), particles: o.ps ? o.ps.count : 0, voice: !!(o.voice && o.voice.alive) };
      },
      setRandom: fn => { rand = fn || Math.random; },
      step: dt => tick(dt),
      reset
    }
  };
})(window);
