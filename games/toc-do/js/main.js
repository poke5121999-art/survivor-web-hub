// Vòng đời game: boot → lobby (phòng trưng bày xe) → loading → race (intro, đếm ngược, đua) → result.
// Mô phỏng (js/sim) chạy bước cố định; mọi phản hồi (tiếng, VFX, camera, HUD) đọc race.events rồi xoá.
(function (TD) {
  'use strict';
  const THREE = window.THREE;
  const M = { state: 'boot', t: 0, race: null, me: null, views: [], introT: 0, finishT: 0, paused: false };
  const $ = (id) => document.getElementById(id);
  const INTRO = 2.6;
  // Tiếng nền theo đường: Troy có bank riêng trong APK (Saidao_TroyCity.bnk), hai đường còn lại mượn tiếng khán giả Rome.
  const AMB = { troycity: { start: 'Play_TroyCity_Amb_Cheer', pass: ['Play_TroyCity_Amb_CarPassby', 'Play_TroyCity_Amb_TrainPassby'] } };
  const pick = (a) => a[(Math.random() * a.length) | 0];

  function setupRenderer() {
    const canvas = $('gl');
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, innerWidth > 1000 ? 1.5 : 2));
    r.setSize(innerWidth, innerHeight, false);
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.NoToneMapping;
    M.renderer = r;
    M.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.3, 3000);
    M.scene = new THREE.Scene();
    // Ánh sáng cho xe và tay đua (đường đua tự tô bằng lightmap trong shader riêng).
    M.hemi = new THREE.HemisphereLight(0xdfe8ff, 0x50483c, 0.85);
    M.sun = new THREE.DirectionalLight(0xffffff, 1.5);
    M.scene.add(M.hemi, M.sun, M.sun.target);
    const pm = new THREE.PMREMGenerator(r);
    const s = new THREE.Scene();
    s.add(new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.MeshBasicMaterial({ color: 0x6d88a8, side: THREE.BackSide })));
    const box = (w, h, x, y, z, c) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m); };
    box(16, 6, 0, 14, 0, 0xffffff); box(6, 8, 12, 4, 4, 0xffffff); box(6, 8, -12, 4, -4, 0xcfe0ff); box(30, 4, 0, -6, 0, 0x404850);
    M.env = pm.fromScene(s, 0.02).texture;
    M.scene.environment = M.env;
    TD.postfx.init(r);
    TD.cam.init(M.camera);
    addEventListener('resize', onResize);
  }

  function onResize() {
    M.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, innerWidth > 1000 ? 1.5 : 2));
    M.renderer.setSize(innerWidth, innerHeight, false);
    M.camera.aspect = innerWidth / innerHeight; M.camera.updateProjectionMatrix();
    TD.postfx.resize();
  }

  // ---------- phòng trưng bày (sảnh) ----------
  function showroom() {
    if (M.show) return M.show;
    const sc = new THREE.Scene();
    const c = document.createElement('canvas'); c.width = 4; c.height = 256;
    const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#0b2a5c'); gr.addColorStop(0.55, '#2a6fc1'); gr.addColorStop(1, '#9fd2ff');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    sc.background = new THREE.CanvasTexture(c);
    sc.environment = M.env;
    sc.add(new THREE.HemisphereLight(0xe8f0ff, 0x304060, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(4, 8, 5); sc.add(key);
    const rim = new THREE.DirectionalLight(0x9fd0ff, 0.7); rim.position.set(-5, 3, -6); sc.add(rim);
    // Bệ xoay: đĩa có vòng sáng như bệ trưng bày trong gara gốc.
    const rc = document.createElement('canvas'); rc.width = rc.height = 256;
    const rg = rc.getContext('2d');
    const rad = rg.createRadialGradient(128, 128, 20, 128, 128, 128);
    rad.addColorStop(0, 'rgba(160,220,255,0.55)'); rad.addColorStop(0.78, 'rgba(60,140,230,0.35)'); rad.addColorStop(0.9, 'rgba(160,230,255,0.95)'); rad.addColorStop(1, 'rgba(160,230,255,0)');
    rg.fillStyle = rad; rg.fillRect(0, 0, 256, 256);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(3.2, 64), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(rc), transparent: true, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.01; sc.add(disc);
    const holder = new THREE.Group(); sc.add(holder);
    M.show = { scene: sc, holder, view: null, key: null, idleT: 4, yaw: 0.6 };
    return M.show;
  }

  function displayKart(carId, driverId) {
    const k = TD.Kart.create({ id: 0, carId, driverId, name: '', ctrl: 'human' });
    k.st = 'grid';
    return k;
  }

  M.showCar = function (carId, driverId) {
    const S = showroom();
    const key = carId + '/' + driverId;
    if (S.key === key) return;
    S.key = key;
    TD.kartView.list.length = 0;
    while (S.holder.children.length) S.holder.remove(S.holder.children[0]);
    const v = TD.kartView.create(S.holder, displayKart(carId, driverId));
    v.shadow.material.opacity = 0.5;
    S.view = v;
    v.loading.then(() => { if (S.view === v) TD.kartView.oneShot(v, 'idle' + (1 + ((Math.random() * 6) | 0))); });
  };

  function updateLobby(dt) {
    const S = showroom();
    S.yaw += dt * 0.35;
    if (S.view) {
      const k = S.view.kart;
      k.yaw = S.yaw;
      TD.kartView.update(S.view, dt);
      S.idleT -= dt;
      if (S.idleT <= 0 && S.view.ready) { S.idleT = 6 + Math.random() * 4; TD.kartView.oneShot(S.view, 'idle' + (1 + ((Math.random() * 6) | 0))); }
    }
    const narrow = innerWidth / innerHeight < 1.2;
    M.camera.position.set(narrow ? 0 : -1.6, 1.55, narrow ? 7.2 : 5.6);
    M.camera.lookAt(narrow ? 0 : -1.6, 0.55, 0);
    M.camera.fov = 45; M.camera.updateProjectionMatrix();
    TD.postfx.params.radial = 0; TD.postfx.params.flash = 0;
    TD.postfx.render(S.scene, M.camera);
  }

  // ---------- trận ----------
  M.startRace = async function () {
    const d = TD.save.d;
    TD.audio.unlock();
    TD.audio.music(null);
    M.state = 'loading';
    TD.menu.loading(TD.TRACKS[d.track], 0);
    TD.kartView.list.length = 0;
    M.scene.remove(M.raceRoot || new THREE.Object3D());
    M.raceRoot = new THREE.Group(); M.scene.add(M.raceRoot);
    if (M.trackId !== d.track) {
      await TD.trackView.load(M.scene, M.renderer, d.track, (p) => TD.menu.loading(TD.TRACKS[d.track], p * 0.8));
      M.trackId = d.track;
    }
    const tv = TD.trackView;
    // Nắng của xe theo nắng của đường (meta.sun) để thân xe sáng cùng hướng với bóng nướng sẵn trên đường.
    M.sun.position.copy(tv.sun.toSun).multiplyScalar(60);
    M.sun.color.copy(tv.sun.sunCol).multiplyScalar(0.9);
    M.hemi.color.copy(tv.sun.amb).multiplyScalar(1.4);
    const seed = (Date.now() & 0xffffff) >>> 0;
    const R0 = TD.RNG(seed), rng = () => R0.next();
    const cars = Object.keys(TD.CARS), drivers = Object.keys(TD.DRIVERS);
    const names = TD.BOT_NAMES.slice().sort(() => rng() - 0.5);
    const karts = [];
    const slot = 5;   // người chơi xuất phát ở hàng cuối như đua xếp hạng, có chỗ để vượt
    for (let i = 0; i < 6; i++) {
      if (i === slot) karts.push({ carId: d.car, driverId: d.driver, name: d.name, ctrl: 'human' });
      else karts.push({ carId: cars[(rng() * cars.length) | 0], driverId: drivers[(rng() * drivers.length) | 0], name: names[i], ctrl: 'bot', skill: 0.45 + rng() * 0.45 });
    }
    const R = TD.Race.create({ trackId: d.track, seed, karts });
    M.race = R; M.me = R.karts[slot];
    M.views = R.karts.map((k) => TD.kartView.create(M.raceRoot, k));
    await Promise.all(M.views.map((v) => v.loading));
    TD.menu.loading(TD.TRACKS[d.track], 1);
    for (const v of M.views) TD.kartView.update(v, 0);
    if (TD.fx) TD.fx.reset(M.scene);
    TD.hud.start(R);
    TD.hud.setTouch(TD.input.isTouch());
    M.introT = 0; M.finishT = 0; M.resultShown = false; M.paused = false;
    M.state = 'race';
    TD.menu.race(TD.TRACKS[d.track]);
    TD.audio.engineStart();
    const amb = AMB[d.track];
    TD.audio.play(amb ? amb.start : 'Play_Amb_Crowd', { vol: 0.8 });
    M.ambT = 12 + Math.random() * 10;
  };

  function handleEvents(R) {
    const me = M.me;
    for (const e of R.events) {
      const v = e.kart != null ? M.views[e.kart] : null;
      const k = e.kart != null ? R.karts[e.kart] : null;
      const mine = k === me;
      const dist = k ? Math.hypot(k.x - me.x, k.z - me.z) : 0;
      const near = Math.max(0, 1 - dist / 70);
      if (e.type === 'finish' && k) k.dnf = !!e.dnf;
      if (v) TD.kartView.onEvent(v, e);
      if (TD.fx && k) TD.fx.onEvent(e, k, v, mine);
      switch (e.type) {
        case 'countdown': TD.audio.play('Play_BGM_CountDown'); break;
        case 'go':
          TD.audio.play('Play_BGM_Go');
          TD.audio.music(pick(['Play_QQfeiche_BGM', 'Play_Music_Race2']));
          for (const w of M.views) TD.kartView.oneShot(w, 'little_brake');
          break;
        case 'miniboost':
          if (mine) {
            TD.audio.play('Play_miniboost', { jitter: 0.04 });
            TD.cam.kick(0.12); M.flash = Math.max(M.flash, e.kind === 'perfect' ? 0.22 : 0.12);
            TD.menu.pop(e.kind === 'perfect' || e.kind === 'start' ? 'perfect' : (e.kind === 'dual' ? 'dual' : 'mini'));
          } else if (near > 0) TD.audio.play('Play_miniboost', { vol: near * 0.5, jitter: 0.06 });
          break;
        case 'nitro_start':
          if (mine) { TD.audio.play('Play_supperboost'); TD.audio.play('Play_jiasu', { vol: 0.8 }); TD.cam.kick(0.25); M.flash = 0.3; }
          else if (near > 0) TD.audio.play('Play_supperboost', { vol: near * 0.45 });
          break;
        case 'gauge_full': if (mine) { TD.audio.play('Play_UI_Select', { vol: 0.7 }); TD.menu.pop('n2o'); } break;
        case 'wall':
          if (mine) { TD.audio.play('Play_Collision', { vol: 0.35 + 0.65 * Math.min(1, e.power), jitter: 0.08 }); TD.cam.kick(0.25 + 0.6 * Math.min(1, e.power)); if (navigator.vibrate && TD.save.d.settings.shake) navigator.vibrate(30); }
          else if (near > 0) TD.audio.play('Play_Collision', { vol: near * 0.4 * Math.min(1, e.power), jitter: 0.08 });
          break;
        case 'bump': if (mine || near > 0.3) TD.audio.play('Play_CollisionCar', { vol: (mine ? 1 : near) * Math.min(1, 0.4 + (e.power || 0.5)), jitter: 0.08 }); if (mine) TD.cam.kick(0.2); break;
        case 'air': if (mine) TD.audio.play('Play_Car_fly', { vol: 0.7 }); break;
        case 'land': if (mine) { TD.audio.play('Play_Car_Land', { vol: Math.min(1, 0.3 + (e.power || 0.5)) }); TD.cam.landDip(e.power || 0.5); TD.cam.kick(0.1 + 0.2 * (e.power || 0)); } break;
        case 'respawn': if (mine) { TD.audio.play('Play_Respawn'); TD.cam.snap(k); } break;
        case 'lap': if (mine && e.lap > 0 && k.lap < R.laps) { TD.audio.play('Play_Race_Lap'); TD.menu.banner('VÒNG ' + k.lap); } break;
        case 'final_lap': if (mine) { TD.audio.play('Play_Race_FinalLap'); TD.menu.banner('VÒNG CUỐI'); } break;
        case 'overtake': if (mine) TD.menu.pop('rank', e.place); break;
        case 'finish':
          if (mine) {
            TD.audio.play('Play_Race_Finish');
            TD.audio.play(e.place <= 3 ? 'Play_UI_Win' : 'Play_UI_Lose', { vol: 0.9 });
            TD.audio.music(null);
            TD.menu.banner(e.place === 1 ? 'VỀ NHẤT!' : 'VỀ ĐÍCH', true);
            M.finishT = 0.001;
          }
          break;
      }
    }
    R.events.length = 0;
  }

  function updateRace(rdt) {
    const R = M.race, me = M.me;
    // timeScale chỉ dùng cho bài kiểm (máy ảo vẽ phần mềm chạy vài khung/giây): tua nhanh mô phỏng lẫn hình.
    const dt = rdt * (M.timeScale || 1);
    if (TD.input.takePause() && !M.resultShown) { M.paused = !M.paused; TD.menu.pause(M.paused); }
    if (M.paused) { TD.postfx.render(M.scene, M.camera); return; }
    M.introT += dt;
    const intro = M.introT < INTRO;
    // Ga tự động như bản di động; trong đếm ngược chỉ nhấn ga khi người chơi giữ ↑ (để canh xuất phát nhanh).
    TD.input.apply(me.input);
    if (R.phase === 'countdown') me.input.throttle = (TD.input.keys.ArrowUp || TD.input.keys.KeyW || TD.input.touch.nitro || TD.input.touch.drift) ? 1 : 0;
    if (me.st === 'finish') { me.input.steer = 0; me.input.drift = false; me.input.nitro = false; }
    if (TD.input.takeReset() && R.phase !== 'countdown' && me.st !== 'finish') TD.Race.respawn(R, me, 'manual');
    if (!intro) TD.Race.step(R, dt);
    handleEvents(R);
    for (const v of M.views) TD.kartView.update(v, dt);
    const boost = me.nitro.boostT > 0 ? 1 : 0, mini = me.nitro.miniT > 0 ? 1 : 0;
    if (intro) {
      const c = R.T.cps[R.T.startCp];
      TD.cam.orbit(dt, me.x, me.y, me.z, me.yaw, M.introT);
      if (M.introT + dt >= INTRO) TD.cam.snap(me);
    } else if (M.finishT > 0) {
      M.finishT += dt;
      const a = me.yaw + Math.PI + M.finishT * 0.35;
      M.camera.position.set(me.x + Math.sin(a) * 6.5, me.y + 2.2, me.z + Math.cos(a) * 6.5);
      M.camera.up.set(0, 1, 0); M.camera.lookAt(me.x, me.y + 0.8, me.z);
      if (M.finishT > 2.6 && !M.resultShown) { M.resultShown = true; showResult(); }
      if (M.resultShown) TD.menu.updateResult(R, me);
    } else TD.cam.update(dt, me, boost, mini);
    // Xe khác chen giữa camera và xe mình thì che nửa màn: ẩn khi nó gần camera hơn xe mình và cách camera < 4,5 m.
    const cp = M.camera.position, dMe = Math.hypot(me.x - cp.x, me.z - cp.z);
    for (const v of M.views) {
      if (v.kart === me) continue;
      const d = Math.hypot(v.kart.x - cp.x, v.kart.y + 0.6 - cp.y, v.kart.z - cp.z);
      v.root.visible = !(d < 4.5 && d < dMe);
    }
    // Hậu kỳ khi phun: nhoè xuyên tâm theo nitro/phun nhỏ, loé trắng ngắn lúc bắt đầu.
    const pf = TD.postfx.params;
    const wantRadial = M.finishT > 0 ? 0 : boost * 1 + mini * 0.45;
    pf.radial += (wantRadial - pf.radial) * (1 - Math.exp(-dt * (wantRadial > pf.radial ? 8 : 3)));
    M.flash = Math.max(0, (M.flash || 0) - dt * 1.6);
    pf.flash = M.flash * 0.35;
    const kmh = Math.abs(me.speed) * 3.6;
    TD.audio.engineUpdate(kmh, me.input.throttle, Math.max(boost, mini * 0.6), dt);
    TD.audio.skid(me.st === 'drift' && me.grounded ? Math.min(1, 0.45 + Math.abs(me.drift.vd) / 90) : 0, kmh);
    if (TD.fx) TD.fx.update(dt, M.views, me, M.camera);
    const amb = AMB[R.trackId];
    if (amb && R.phase !== 'countdown' && (M.ambT -= dt) <= 0) { M.ambT = 14 + Math.random() * 14; TD.audio.play(pick(amb.pass), { vol: 0.7 }); }
    TD.trackView.update(M.camera);
    TD.hud.update(R, me, dt);
    TD.postfx.render(M.scene, M.camera);
    TD.hud.draw(R, R.karts, me);
  }

  function showResult() {
    const R = M.race, me = M.me, d = TD.save.d;
    const reward = [0, 300, 220, 160, 120, 90, 60][me.place] || 50;
    d.coins += reward; d.races++; if (me.place === 1) d.wins++;
    const prev = d.best[R.trackId];
    const newRecord = me.finishT != null && !me.dnf && (prev == null || me.finishT < prev);
    if (newRecord) d.best[R.trackId] = me.finishT;
    TD.save.save();
    TD.audio.play('Play_BGM_end');
    setTimeout(() => { if (M.state === 'race' && M.resultShown) TD.audio.music('Play_Music_Lobby'); }, 3500);
    TD.menu.result(R, me, { reward, newRecord });
  }

  M.toLobby = function () {
    TD.audio.engineStop();
    TD.audio.skid(0, 0);
    TD.audio.stopAll();
    TD.audio.music(pick(['Play_Music_Lobby', 'Play_Music_Menu2']));
    TD.hud.setTouch(false);
    M.state = 'lobby'; M.race = null; M.paused = false;
    TD.postfx.params.radial = 0;
    if (M.show) M.show.key = null;
    M.showCar(TD.save.d.car, TD.save.d.driver);
    TD.menu.lobby();
  };

  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - (M.last || now)) / 1000));
    M.last = now; M.t += dt;
    try {
      if (M.state === 'lobby') updateLobby(dt);
      else if (M.state === 'race') updateRace(dt);
      else if (M.state === 'loading') TD.postfx.render(M.scene, M.camera);
    } catch (e) { console.error(e); }
    requestAnimationFrame(frame);
  }

  M.boot = async function () {
    TD.save.load();
    setupRenderer();
    TD.input.bind($('hud'));
    TD.hud.init($('hud'));
    TD.menu.init();
    await TD.ugui.load();
    M.toLobby();
    $('boot').style.display = 'none';
    requestAnimationFrame(frame);
  };

  TD.main = M;
  addEventListener('load', () => M.boot().catch((e) => { console.error(e); $('boot').textContent = 'Lỗi khởi động: ' + e.message; }));
})(globalThis.TD = globalThis.TD || {});
