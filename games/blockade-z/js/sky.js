// Time of day and weather. One clock drives the sun / moon, sky, fog, lights and lamps;
// each wave rolls a weather with its own look and its own rule for the fight.
(() => {
  const BZ = window.BZ;
  const THREE = window.THREE;

  // w = how often it is picked; night = only picked after dark
  const WEATHERS = {
    clear: { name: 'Trời quang', desc: '', w: 3 },
    rain: { name: 'Mưa', desc: 'Đường trơn: zombie chậm 10%', w: 2 },
    storm: { name: 'Bão sét', desc: 'Sét đánh trúng zombie bất kỳ lúc nào', w: 1.5 },
    fog: { name: 'Sương mù', desc: 'Không nhìn xa được, nhưng điểm gấp rưỡi', w: 1.4 },
    snow: { name: 'Tuyết rơi', desc: 'Zombie chậm 20%, người cũng chậm 8%', w: 1.2 },
    bloodmoon: { name: 'Trăng máu', desc: 'Zombie trâu hơn 30% và nhanh hơn 15%, điểm gấp đôi', w: 1.1, night: true },
    ash: { name: 'Gió tro', desc: 'Gió tạt làm đạn lệch nhiều hơn', w: 1.1 },
  };
  BZ.WEATHERS = WEATHERS;
  const C = (h) => new THREE.Color(h);
  // looks: sky top / horizon, fog colour, hemisphere sky / ground, sun colour and strength
  const NIGHT = { top: C(0x0a1230), hor: C(0x30384e), fog: C(0x2a2c38), hs: C(0x8aa6e6), hg: C(0x3a3428), hi: 1.35, sc: C(0xb4c8ff), si: 1.1, cloud: C(0x4a4e5e) };
  const DAY = { top: C(0x4f86c8), hor: C(0xb9c2c6), fog: C(0x9aa4aa), hs: C(0xdce8ff), hg: C(0x6a5e4c), hi: 1.7, sc: C(0xfff2dc), si: 2.3, cloud: C(0xd0d4da) };
  const DUSK = { top: C(0x2a3060), hor: C(0xe0743a), fog: C(0x6a4c46), hs: C(0xe0a888), hg: C(0x4a3428), hi: 1.35, sc: C(0xffa060), si: 1.5, cloud: C(0x8a5a50) };
  const TINT = {
    rain: { fog: C(0x4a5260), top: C(0x2a3442), hor: C(0x5a6270), dim: 0.75 }, storm: { fog: C(0x363c48), top: C(0x1a2030), hor: C(0x3a4250), dim: 0.6 },
    fog: { fog: C(0x8a8e94), top: C(0x6a7078), hor: C(0x8a8e94), dim: 0.85 }, snow: { fog: C(0xc4ccd6), top: C(0x9aa6b4), hor: C(0xd0d6de), dim: 0.9 },
    bloodmoon: { fog: C(0x3a0c0c), top: C(0x2a0404), hor: C(0x6a1408), dim: 0.85, red: true }, ash: { fog: C(0x7a5236), top: C(0x4a2a1a), hor: C(0x9a6a40), dim: 0.8 },
  };

  BZ.makeSky = (G) => {
    const scene = G.scene; const W = G.world; const sky = W.sky.material.uniforms;
    const S = { t: +(BZ.params.tod ?? 0.8), dayLen: +(BZ.params.daylen || 480), weather: 'clear', wk: 0, nightK: 1, lastNight: null, boltT: 4 };
    const env = (G.env = { zSpeed: 1, zHp: 1, scoreMul: 1, pSpeed: 1, spread: 0, night: true });
    const tmpC = new THREE.Color(); const mix = (a, b, k, out) => out.copy(a).lerp(b, k);
    const look = {}; for (const k of Object.keys(NIGHT)) look[k] = NIGHT[k].clone ? NIGHT[k].clone() : NIGHT[k];

    // ---------- precipitation: one instanced mesh of boxes that wraps around the camera ----------
    const NP = Math.round(900 * Math.max(0.4, G.quality.particles));
    const precip = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x9ab0d0, transparent: true, opacity: 0.55, depthWrite: false }), NP);
    precip.frustumCulled = false; precip.count = 0; scene.add(precip);
    const pr = BZ.rng('precip'); const pts = []; for (let i = 0; i < NP; i++) pts.push(new THREE.Vector3(pr.range(-16, 16), pr.range(0, 18), pr.range(-16, 16)));
    const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion(); const sc = new THREE.Vector3(); const pv = new THREE.Vector3(); const eu = new THREE.Euler();
    const PRE = {
      rain: { n: 1, col: 0x9ab0d0, op: 0.45, s: [0.025, 0.75, 0.025], vy: -24, vx: 3, sway: 0 }, storm: { n: 1, col: 0xa8bcd8, op: 0.55, s: [0.03, 0.9, 0.03], vy: -30, vx: 7, sway: 0 },
      snow: { n: 1, col: 0xf4f8ff, op: 0.95, s: [0.075, 0.075, 0.075], vy: -1.8, vx: 0.8, sway: 0.9 }, ash: { n: 0.7, col: 0xb07a4a, op: 0.7, s: [0.06, 0.05, 0.22], vy: -0.6, vx: 9, sway: 0.4 },
    };
    function updatePrecip(dt) {
      const P = PRE[S.weather]; if (!P) { precip.count = 0; return; }
      const n = Math.floor(NP * P.n * S.wk); const cam = G.camera.position; const now = performance.now() / 1000;
      precip.material.color.setHex(P.col); precip.material.opacity = P.op * Math.min(1, S.wk * 1.5);
      if (P.vx > 2) { pv.set(P.vx, P.vy, P.vx * 0.3).normalize(); q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pv.negate()); } else q.identity();
      for (let i = 0; i < n; i++) {
        const p = pts[i]; p.y += P.vy * dt; p.x += P.vx * dt + Math.sin(now * 2 + i) * P.sway * dt; p.z += P.vx * 0.3 * dt;
        if (p.y < 0) p.y += 18;
        const x = ((p.x - cam.x) % 32 + 48) % 32 - 16 + cam.x; const z = ((p.z - cam.z) % 32 + 48) % 32 - 16 + cam.z;
        if (S.weather === 'snow') q.setFromEuler(eu.set(i, now + i, 0));
        m4.compose(pv.set(x, p.y + cam.y - 6, z), q, sc.set(P.s[0], P.s[1], P.s[2])); precip.setMatrixAt(i, m4);
        if ((S.weather === 'rain' || S.weather === 'storm') && i % 97 === 0 && G.rng.chance(dt * 30)) G.fx.puff(new THREE.Vector3(x, 0.05, z), { s0: 0.08, s1: 0.4, life: 0.25, c0: 0xb8c8e0, a0: 0.5 });
      }
      precip.count = n; precip.instanceMatrix.needsUpdate = true;
    }

    // ---------- lightning: a jagged bolt of thin boxes, a sky flash, a strike that hurts zombies ----------
    const boltMat = new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const bolt = new THREE.Group(); scene.add(bolt); let boltLife = 0;
    const segGeo = new THREE.BoxGeometry(0.18, 1, 0.18);
    function strike(target, visual) {
      while (bolt.children.length) bolt.remove(bolt.children[0]);
      const pts2 = []; let x = target.x + G.rng.range(-6, 6); let z = target.z + G.rng.range(-6, 6);
      for (let y = 45; y > 0; y -= G.rng.range(2.5, 5)) { pts2.push(new THREE.Vector3(x, y, z)); const k = y / 45; x = BZ.lerp(target.x, x + G.rng.range(-2, 2), k); z = BZ.lerp(target.z, z + G.rng.range(-2, 2), k); }
      pts2.push(new THREE.Vector3(target.x, target.y, target.z));
      for (let i = 0; i < pts2.length - 1; i++) {
        const a = pts2[i]; const b = pts2[i + 1]; const m = new THREE.Mesh(segGeo, boltMat);
        m.position.copy(a).add(b).multiplyScalar(0.5); m.scale.set(1, a.distanceTo(b), 1); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); bolt.add(m);
        if (G.rng.chance(0.3)) { const f = new THREE.Mesh(segGeo, boltMat); const dir = new THREE.Vector3(G.rng.range(-1, 1), -1, G.rng.range(-1, 1)).normalize(); const L = G.rng.range(2, 5); f.position.copy(a).addScaledVector(dir, L / 2); f.scale.set(0.6, L, 0.6); f.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); bolt.add(f); }
      }
      boltLife = 0.22; S.flash = 1;
      G.events.emit('bolt', { p: target });
      if (visual) { G.fx.explosion(new THREE.Vector3(target.x, target.y + 0.3, target.z), 0.6); } else G.gear.explode(new THREE.Vector3(target.x, target.y + 0.3, target.z), 3.2, 340);
      const d = G.camera.position.distanceTo(target);
      setTimeout(() => G.audio.play('thunder', { gain: BZ.clamp(1.4 - d / 60, 0.4, 1.3), rate: G.rng.range(0.85, 1.1) }), Math.min(1800, d * 12));
      const P = G.player; if (!visual && P.alive && Math.hypot(P.pos.x - target.x, P.pos.z - target.z) < 3) G.events.emit('player:hurt', { dmg: 25, from: target });
    }

    // ---------- choosing weather ----------
    function roll(n) {
      if (BZ.params.weather) return BZ.params.weather;
      if (n <= 1) return 'clear';
      const opts = Object.entries(WEATHERS).filter(([, w]) => !w.night || env.night);
      let r = G.rng.next() * opts.reduce((a, [, w]) => a + w.w, 0);
      for (const [id, w] of opts) { r -= w.w; if (r <= 0) return id; }
      return 'clear';
    }
    function setWeather(id, announce = true) {
      S.weather = WEATHERS[id] ? id : 'clear'; S.wk = 0; S.boltT = G.rng.range(2, 5);
      const w = WEATHERS[S.weather];
      if (announce && S.weather !== 'clear') setTimeout(() => { if (G.state === 'playing') G.ui.announce(w.name.toUpperCase(), w.desc, S.weather === 'bloodmoon' || S.weather === 'storm' ? 'hot' : ''); }, 2600);
      G.audio.setMusic({ rain: 0 });
    }
    G.events.on('wave:start', (n) => setWeather(roll(n)));

    function update(dt, playing) {
      const guest = (G.coop && G.coop.guest);
      if (playing && !guest) S.t = (S.t + dt / S.dayLen) % 1;
      S.wk = Math.min(1, S.wk + dt / 5);
      // sun height: -1 midnight, +1 noon
      const e = Math.sin((S.t - 0.25) * Math.PI * 2);
      const day = BZ.clamp((e + 0.08) / 0.4, 0, 1); const sDay = day * day * (3 - 2 * day);
      const dusk = Math.max(0, 1 - Math.abs(e) / 0.22) * 0.85;
      const night = 1 - sDay; env.night = night > 0.5;
      for (const k of ['top', 'hor', 'fog', 'hs', 'hg', 'sc', 'cloud']) { mix(NIGHT[k], DAY[k], sDay, look[k]); look[k].lerp(DUSK[k], dusk); }
      let hi = BZ.lerp(NIGHT.hi, DAY.hi, sDay); let si = BZ.lerp(NIGHT.si, DAY.si, sDay); hi = BZ.lerp(hi, DUSK.hi, dusk); si = BZ.lerp(si, DUSK.si, dusk);
      // weather pulls the palette toward its own and dims the light
      const T = TINT[S.weather]; const wk = S.wk;
      if (T) {
        const k = wk * (S.weather === 'bloodmoon' ? 1 : 0.75 + 0.25 * night);
        look.fog.lerp(T.fog, k * 0.9); look.top.lerp(T.top, k * 0.92); look.hor.lerp(T.hor, k * 0.9); look.cloud.lerp(T.fog, k * 0.6);
        hi *= BZ.lerp(1, T.dim, wk); si *= BZ.lerp(1, T.dim * (S.weather === 'fog' ? 0.6 : 1), wk);
        if (S.weather === 'fog') { look.top.lerp(look.fog, wk * 0.85); look.hor.copy(look.fog); look.cloud.copy(look.fog); }
        if (T.red) { look.hs.lerp(C(0xff6a50), wk * 0.6); look.sc.lerp(C(0xff3020), wk * 0.8); }
      }
      // lightning flash
      S.flash = Math.max(0, (S.flash || 0) - dt * 5);
      sky.flash.value = S.flash * 0.7;
      sky.top.value.copy(look.top); sky.horizon.value.copy(look.hor);
      sky.starK.value = Math.max(0, night - (T ? wk * 0.8 : 0)) * (S.weather === 'bloodmoon' ? 0.4 : 1);
      sky.glowK.value = BZ.lerp(1, 0.35, sDay);
      // sun crosses east to west; at night the moon takes the directional light
      const a = S.t * Math.PI * 2 - Math.PI / 2;
      const sunDir = new THREE.Vector3(Math.cos(a), Math.sin(a), -0.35).normalize();
      const lightDir = sDay > 0.5 || e > 0 ? sunDir : sunDir.clone().negate();
      if (lightDir.y < 0.15) lightDir.y = 0.15; lightDir.normalize();
      sky.sunDir.value.copy(lightDir);
      const isSun = e > 0;
      sky.bodySize.value = isSun ? 0.05 : S.weather === 'bloodmoon' ? 0.05 : 0.032;
      sky.bodyCol.value.set(isSun ? 0xfff4d0 : S.weather === 'bloodmoon' ? 0xff3a20 : 0xf2f0e6);
      if (S.weather === 'fog' || S.weather === 'rain' || S.weather === 'storm' || S.weather === 'snow') sky.bodyCol.value.multiplyScalar(1 - wk * 0.7);
      G.sun.position.copy(lightDir).multiplyScalar(60); G.sun.color.copy(look.sc); G.sun.intensity = si + S.flash * 3;
      G.hemi.color.copy(look.hs); G.hemi.groundColor.copy(look.hg); G.hemi.intensity = hi + S.flash * 2.5;
      scene.fog.color.copy(look.fog);
      const far = G.quality.far * 0.62; const fogK = S.weather === 'fog' ? wk : S.weather === 'storm' || S.weather === 'snow' || S.weather === 'ash' ? wk * 0.45 : S.weather === 'rain' ? wk * 0.3 : 0;
      scene.fog.near = BZ.lerp(BZ.lerp(12, 22, sDay), 2, fogK); scene.fog.far = BZ.lerp(BZ.lerp(far, far * 1.25, sDay), 24, fogK);
      W.cloudMat.color.copy(look.cloud); W.cloudMat.opacity = 0.85;
      if (Math.abs(night - S.nightK) > 0.02) { S.nightK = night; W.setNight(night); }
      G.renderer.setClearColor(look.fog);
      // the night falls / day breaks
      if (playing && S.lastNight !== null && S.lastNight !== env.night) {
        if (env.night) G.ui.announce('MÀN ĐÊM BUÔNG XUỐNG', 'zombie nhanh hơn 15%', 'hot'); else G.ui.announce('TRỜI SÁNG', 'zombie chậm lại', '');
      }
      S.lastNight = env.night;
      // rules of the fight
      const wz = { rain: 0.9, snow: 0.8, bloodmoon: 1.15 }[S.weather] || 1;
      env.zSpeed = (env.night ? 1.15 : 1) * BZ.lerp(1, wz, wk);
      env.zHp = S.weather === 'bloodmoon' ? 1.3 : 1;
      env.scoreMul = S.weather === 'bloodmoon' ? 2 : S.weather === 'fog' ? 1.5 : 1;
      env.pSpeed = S.weather === 'snow' ? BZ.lerp(1, 0.92, wk) : 1;
      env.spread = S.weather === 'ash' ? 0.02 * wk : 0;
      G.audio.setMusic({ rain: (S.weather === 'rain' ? 0.7 : S.weather === 'storm' ? 1 : 0) * wk, wind: 1 + (S.weather === 'ash' || S.weather === 'snow' || S.weather === 'storm' ? 1.2 * wk : 0) });
      updatePrecip(dt);
      if (boltLife > 0) { boltLife -= dt; boltMat.opacity = boltLife > 0.12 ? 1 : Math.max(0, boltLife / 0.12) * (Math.sin(boltLife * 120) > 0 ? 1 : 0.3); bolt.visible = boltLife > 0; }
      if (playing && !guest && S.weather === 'storm' && wk > 0.5) {
        S.boltT -= dt;
        if (S.boltT <= 0) {
          S.boltT = G.rng.range(2.5, 6);
          const alive = G.zombies.list.filter((z) => z.alive);
          const tgt = alive.length && G.rng.chance(0.8) ? G.rng.pick(alive).pos : new THREE.Vector3(G.rng.range(-30, 30), 0, G.rng.range(-30, 30));
          strike(new THREE.Vector3(tgt.x, tgt.y, tgt.z));
        }
      }
    }
    function clear() { setWeather('clear', false); S.t = +(BZ.params.tod ?? 0.8); S.lastNight = null; }
    return { S, update, setWeather, clear, strike, weather: () => S.weather, WEATHERS };
  };
})();
