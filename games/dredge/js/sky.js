/*
 * Thời gian, ánh sáng, sương, bầu trời và hoảng loạn.
 *   TimeController: t += dt / (hourDurationInSeconds·24) · modifier; mặt trời góc lightAngleMin + 360·t quanh trục
 *   Euler (x, −90°, 0) ⇒ đi từ đông (+x) qua đỉnh xuống tây; màu nắng / ambient từ gradient sunColour /
 *   ambientLightColor; FogController: mật độ defaultFogDensityOverDay, màu defaultFogColorOverDay (+ FogPropertyModifier).
 *   PlayerSanity: sanity += sanityRate · dt · modifier (CODE.md 3).
 *   DRSky.init(scene, world)  DRSky.update(dt, ctx)  DRSky.passTime(hours, reason)  DRSky.env
 */
(function (root) {
  'use strict';
  const T = root.THREE, R = root.DRRules, CFG = root.DR_CONFIG;
  // [ĐỀ XUẤT] _FogDensity gốc là tham số 0..1 của shader sương riêng; quy ra FogExp2: nền mù ban ngày + phần theo đường cong
  const FOG_BASE = 0.0026, FOG_K = 0.034;
  // [ĐỀ XUẤT] shader toon gốc trộn ambient như màu bóng chứ không cộng thẳng; hạ cả hai để trưa không cháy sáng
  const AMB_K = 0.55, SUN_K = 0.85;

  const S = root.DRSky = {
    env: { isDay: true, night: 0, dayK: 1, sunDir: new T.Vector3(0, 1, 0), fogDensity: 0, timeMode: 'idle', timeMod: 0 },
    gameTime: 0, forced: null
  };
  let TC = null, FC = null, sun = null, amb = null, scene = null, dome = null, fogMods = [], sanityVols = [];

  // ---- Unity Gradient / AnimationCurve ----
  function gradient(g, t) {
    const c = g.colors;
    if (t <= c[0][0]) return [c[0][1], c[0][2], c[0][3]];
    for (let i = 1; i < c.length; i++) if (t <= c[i][0]) {
      const a = c[i - 1], b = c[i], k = (t - a[0]) / (b[0] - a[0] || 1);
      if (g.mode === 1) return [a[1], a[2], a[3]]; // GradientMode.Fixed
      return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
    }
    const l = c[c.length - 1];
    return [l[1], l[2], l[3]];
  }
  function curve(cv, t) {
    const k = cv.keys;
    if (!k.length) return 0;
    if (t <= k[0][0]) return k[0][1];
    for (let i = 1; i < k.length; i++) if (t <= k[i][0]) {
      const a = k[i - 1], b = k[i], d = b[0] - a[0];
      if (Math.abs(a[3]) > 1e20 || Math.abs(b[2]) > 1e20) return a[1]; // tiếp tuyến vô hạn = bậc thang
      const u = (t - a[0]) / d, u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * a[1] + (u3 - 2 * u2 + u) * a[3] * d + (-2 * u3 + 3 * u2) * b[1] + (u3 - u2) * b[2] * d;
    }
    return k[k.length - 1][1];
  }
  const lin = (c, out) => (out || new T.Color()).setRGB(c[0], c[1], c[2]).convertSRGBToLinear();

  function skyDome() {
    const m = new T.ShaderMaterial({
      depthWrite: false, depthTest: false, side: T.BackSide, fog: false,
      uniforms: { uHorizon: { value: new T.Color() }, uZenith: { value: new T.Color() }, uSun: { value: new T.Vector3() }, uDay: { value: 1 }, uNight: { value: 0 } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
      fragmentShader: `uniform vec3 uHorizon; uniform vec3 uZenith; uniform vec3 uSun; uniform float uDay; uniform float uNight; varying vec3 vD;
float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main(){
  vec3 d = normalize(vD);
  float up = clamp(d.y, 0.0, 1.0);
  vec3 c = mix(uHorizon, uZenith, smoothstep(0.02, 0.55, up));
  float sd = max(dot(d, normalize(uSun)), 0.0);
  c += vec3(1.0, 0.92, 0.75) * (pow(sd, 900.0) * 2.0 + pow(sd, 12.0) * 0.12) * uDay;
  vec3 g = floor(d * 420.0);
  float st = step(0.9975, h(g)) * smoothstep(0.08, 0.35, up) * uNight * (0.55 + 0.45 * sin(h(g + 1.0) * 60.0));
  c += vec3(st * 0.8);
  gl_FragColor = vec4(c, 1.0);
  #include <encodings_fragment>
}`
    });
    const mesh = new T.Mesh(new T.SphereGeometry(900, 32, 16), m);
    mesh.frustumCulled = false; mesh.renderOrder = -10;
    return mesh;
  }

  function init(sc, world) {
    scene = sc;
    const L = world.data.scene.logic;
    TC = L.TimeController[0].fields; FC = L.FogController[0].fields;
    const DL = world.data.scene.directionalLight;
    sun = new T.DirectionalLight(0xffffff, DL.intensity); sun.userData.base = DL.intensity;
    amb = new T.AmbientLight(0xffffff, AMB_K);
    scene.add(sun, sun.target, amb);
    scene.fog = new T.FogExp2(0x000000, 0.01);
    scene.background = new T.Color(0);
    dome = skyDome(); scene.add(dome);
    fogMods = world.data.markers.markers.filter(m => m.kind === 'waterProperty' && m.fields && m.fields.FogPropertyModifier)
      .map(m => ({ x: m.pos[0], z: m.pos[2], f: m.fields.FogPropertyModifier }));
    sanityVols = world.data.markers.volumes.filter(v => v.type === 'sanity' && v.active !== false && v.colliders && v.colliders.length)
      .map(v => ({ x: v.colliders[0].pos[0], z: v.colliders[0].pos[2], r: v.colliders[0].radius * Math.max(v.colliders[0].scale[0], v.colliders[0].scale[2]), f: v.fields }));
    root.DR.on('passTime', (hours, reason) => passTime(hours, reason));
  }

  // RestDestination gọi ForcefullyPassTime(hours, reason, SLEEP); ngủ thì sanity dùng SleepingSanityModifier.
  function passTime(hours, reason) {
    S.forced = { left: hours / 24, total: hours / 24, reason: reason || '', sleep: /sleep|rest|ngủ/i.test(reason || '') };
    const f = document.getElementById('dr-fade');
    if (f) f.classList.add('on');
    if (root.DRAudio) DRAudio.loop('ui.passTime.loop', 0.6);
  }

  function timeMode(ctx) {
    if (S.forced) return ['forced', 0];
    const mg = root.DRMinigame && typeof DRMinigame.isOpen === 'function' && DRMinigame.isOpen();
    if (mg || (root.DRSpots && DRSpots.fishing)) return ['fishing', 0];
    if (ctx.moving) return ['move', ctx.inputMag];
    return ['idle', 0];
  }

  // Tổng SanityModifier đang phủ lên SanityModifierDetector (cầu 1,5 m) của thuyền.
  function localSanity(x, z, day, lightsOn, st) {
    let sum = 0;
    for (const v of sanityVols) {
      const d = Math.hypot(x - v.x, z - v.z);
      if (d < v.r + 1.5) sum += R.sanityVolume(v.f, d, day);
    }
    // LightAbility bật SanityModifier con của thuyền; VariableSanityModifier ghi PlayerStats.SanityModifier vào giá trị đêm.
    // [ĐỀ XUẤT] chỉ ghi giá trị đêm (cờ affectsNightValue/affectsDayValue nằm ở prefab, chưa bóc)
    if (lightsOn && !day && st) sum += st.lightSanity;
    return sum;
  }

  function update(dt, ctx) {
    const D = root.DR, s = D.s;
    const playing = s && D.mode !== 'title' && !ctx.paused;
    let mode = 'idle', input = 0;
    if (playing) {
      [mode, input] = timeMode(ctx);
      const before = s.time;
      s.time = R.advance(CFG, s.time, dt, mode, input);
      if (S.forced) {
        S.forced.left -= s.time - before;
        if (S.forced.left <= 0) {
          const reason = S.forced.reason; S.forced = null;
          const f = document.getElementById('dr-fade');
          if (f) f.classList.remove('on');
          if (root.DRAudio) { DRAudio.loop('ui.passTime.loop', 0); DRAudio.play('ui.passTime.complete'); }
          D.emit('passTimeDone', reason);
        }
      }
    }
    const tmod = R.timeModifier(CFG, mode, input);
    S.env.timeMode = mode; S.env.timeMod = tmod;
    S.gameTime += dt * (S.forced ? CFG.forcedTimePassageSpeedModifier : 1);
    root.DRWater.uniforms.uGameTime.value = S.gameTime % 1000; // GameManager.gameTime quấn ở 1000

    const t = s ? R.timeOfDay(s.time) : 0.3;
    const day = R.isDay(s ? s.time : 0.3, TC.dawnTime, TC.duskTime);
    // sanity
    if (playing && tmod > 0) {
      const st = root.DRBoat && DRBoat.stats;
      const local = localSanity(ctx.x, ctx.z, day, s.lightsOn, st);
      const sleeping = !!(S.forced && S.forced.sleep);
      const rate = R.sanityRate(CFG, day, local, 0, sleeping, 0);
      s.sanity = R.stepSanity(s.sanity, rate, dt, tmod);
    }

    // ánh sáng
    const ang = T.MathUtils.degToRad(TC.lightAngleMin + 360 * t);
    S.env.sunDir.set(Math.cos(ang), Math.sin(ang), 0);
    const sc = gradient(TC.sunColour, t);
    lin(sc, sun.color);
    sun.intensity = sun.userData.base * SUN_K;
    sun.position.set(ctx.x + S.env.sunDir.x * 200, S.env.sunDir.y * 200, ctx.z);
    sun.target.position.set(ctx.x, 0, ctx.z);
    lin(gradient(TC.ambientLightColor, t), amb.color);
    const dayK = Math.max(sc[0], sc[1], sc[2]);
    const night = curve(TC.sceneLights, t);
    S.env.isDay = day; S.env.dayK = dayK; S.env.night = 1 - dayK;
    S.env.sceneLights = night;

    // sương (FogController + FogPropertyModifier mạnh nhất tại thuyền)
    let dens = curve(FC.defaultFogDensityOverDay, t), col = gradient(FC.defaultFogColorOverDay, t);
    let best = null, bk = 0;
    for (const m of fogMods) {
      const d = Math.hypot(ctx.x - m.x, ctx.z - m.z);
      const k = 1 - R.invLerp(m.f.fullValueRadius, m.f.partialValueRadius, d);
      if (k > bk) { bk = k; best = m; }
    }
    if (best) {
      const fp = best.f.fogProperty, d2 = curve(fp.fogDensityOverDay, t), c2 = gradient(fp.fogColorOverDay, t);
      dens += (d2 - dens) * bk; col = col.map((v, i) => v + (c2[i] - v) * bk);
    }
    S.env.fogDensity = FOG_BASE + Math.max(0, dens) * FOG_K;
    S.env.fogFar = 1.98 / S.env.fogDensity; // exp(-(ρd)²) < 2 %: quá đây là màu sương thuần
    scene.fog.density = S.env.fogDensity;
    // three r140 trộn sương SAU khi mã hoá sRGB (fog_fragment đứng sau encodings_fragment) ⇒ màu sương/nền giữ nguyên giá trị sRGB
    scene.fog.color.setRGB(col[0], col[1], col[2]);
    scene.background.copy(scene.fog.color);
    // trời: chân trời = màu sương; đỉnh lấy màu skybox gốc (Color_E54291A1 ngày, Color_C6772644 đêm)
    const u = dome.material.uniforms;
    lin(col, u.uHorizon.value);
    lin([0.25191, 0.3961, 0.48113], u.uZenith.value).lerp(lin([0.15758, 0.15041, 0.18868]), 1 - dayK);
    u.uZenith.value.lerp(u.uHorizon.value, Math.min(1, Math.max(0, dens)) * 0.85);
    u.uSun.value.copy(S.env.sunDir); u.uDay.value = dayK; u.uNight.value = Math.max(0, 1 - dayK * 3) * (1 - Math.min(1, Math.max(0, dens - 0.6)));
    if (ctx.cam) dome.position.copy(ctx.cam);
    root.DRWorld.setNight(night);
  }

  Object.assign(S, { init, update, passTime, gradient, curve });
  Object.defineProperty(S, 'sun', { get: () => sun });
  Object.defineProperty(S, 'ambient', { get: () => amb });
})(window);
