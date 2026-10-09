// Vòng đời game: boot → lobby (phòng trưng bày xe) → loading → race (intro, đếm ngược, đua) → result.
// Mô phỏng (js/sim) chạy bước cố định; mọi phản hồi (tiếng, VFX, camera, HUD) đọc race.events rồi xoá.
(function (TD) {
  'use strict';
  const THREE = window.THREE;
  const M = { state: 'boot', t: 0, race: null, me: null, views: [], introT: 0, finishT: 0, paused: false };
  const $ = (id) => document.getElementById(id);
  const INTRO0 = 2.6; // orbit; có camera path thì cam.intro trả độ dài riêng
  let INTRO = INTRO0;
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
    // Sảnh (js/ui/lobby.js) đặt M.lobbyCam = { pos:[x,y,z], look:[x,y,z], fov } theo bố cục của màn đang mở.
    const narrow = innerWidth / innerHeight < 1.2, lc = M.lobbyCam;
    if (lc) { M.camera.position.set(...lc.pos); M.camera.lookAt(...lc.look); M.camera.fov = lc.fov || 45; }
    else { M.camera.position.set(narrow ? 0 : -1.6, 1.55, narrow ? 7.2 : 5.6); M.camera.lookAt(narrow ? 0 : -1.6, 0.55, 0); M.camera.fov = 45; }
    M.camera.updateProjectionMatrix();
    TD.postfx.params.radial = 0; TD.postfx.params.flash = 0;
    TD.postfx.render(S.scene, M.camera);
  }

  // ---------- trận ----------
  // Plugin trận (đạo cụ, luyện tập, xếp hạng, nhiệm vụ...): mỗi tệp tự đẩy vào TD.racePlugins một mục
  //   { start(ctx), update(dt, ctx), event(e, mine, ctx), settle(F, ctx), end(ctx), rects(), draw(g, hud) }
  // ctx = { R, me, M, root (THREE.Group của trận) }. Mục nào không hợp chế độ thì tự bỏ qua (đọc ctx.R.mode).
  TD.racePlugins = TD.racePlugins || [];
  const plug = (fn, ...a) => { for (const p of TD.racePlugins) if (p[fn]) { try { p[fn](...a); } catch (e) { console.error(e); } } };
  M.plug = plug;

  // opts = { mode: id trong TD.MODES } (mặc định chế độ vừa chơi). Đường đua lấy từ bản lưu.
  M.startRace = async function (opts) {
    const d = TD.save.d;
    const mode = TD.MODES[(opts && opts.mode) || d.mode] || TD.MODES.speed;
    d.mode = mode.id;
    if (M.race) plug('end', M.ctx);
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
    const karts = [], n = mode.karts;
    const slot = n - 1;   // người chơi xuất phát ở hàng cuối như đua xếp hạng, có chỗ để vượt
    // Kỹ năng bot: xếp hạng theo bậc (TD.RANK.botSkill), khu luyện đạo cụ dễ, còn lại ngẫu nhiên 0,45–0,9.
    const skill = () => mode.ranked && TD.RANK ? TD.RANK.botSkill(d, rng) : mode.practice ? 0.3 + rng() * 0.2 : 0.45 + rng() * 0.45;
    for (let i = 0; i < n; i++) {
      // Đội: người chơi luôn Đội Xanh (1), xe xen kẽ đội theo ô xuất phát.
      const team = mode.teams ? ((slot - i) % 2 === 0 ? 1 : 0) : undefined;
      if (i === slot) karts.push({ carId: d.car, driverId: d.driver, name: d.name, ctrl: 'human', team });
      else karts.push({ carId: cars[(rng() * cars.length) | 0], driverId: drivers[(rng() * drivers.length) | 0], name: names[i], ctrl: 'bot', skill: skill(), team });
    }
    const R = TD.Race.create({ trackId: d.track, seed, mode, karts });
    M.race = R; M.me = R.karts[slot];
    // Kỹ năng bằng lái (js/ui/garage.js) nhân thông số xe của người chơi.
    if (TD.garage && TD.garage.applySkills) TD.garage.applySkills(M.me, d);
    M.views = R.karts.map((k) => TD.kartView.create(M.raceRoot, k));
    await Promise.all(M.views.map((v) => v.loading));
    TD.menu.loading(TD.TRACKS[d.track], 1);
    for (const v of M.views) TD.kartView.update(v, 0);
    if (TD.fx) TD.fx.reset(M.scene);
    TD.hud.start(R);
    TD.hud.setTouch(TD.input.isTouch());
    M.introT = 0; M.finishT = 0; M.resultShown = false; M.paused = false;
    M.fin = null; M.podState = 0; M.bumps = 0; M.resultDom = false;
    if (TD.podium) TD.podium.leave();
    $('hud').style.visibility = '';
    M.camera.fov = 60; M.camera.updateProjectionMatrix();   // cảnh cận ăn mừng đổi FOV
    M.state = 'race';
    TD.menu.race(TD.TRACKS[d.track], mode);
    M.ctx = { R, me: M.me, M, root: M.raceRoot };
    plug('start', M.ctx);
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
      TD.hud.event(e, mine);
      if (TD.fx && k) TD.fx.onEvent(e, k, v, mine);
      plug('event', e, mine, M.ctx);
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
        case 'bump': if (mine) M.bumps++; if (mine || near > 0.3) TD.audio.play('Play_CollisionCar', { vol: (mine ? 1 : near) * Math.min(1, 0.4 + (e.power || 0.5)), jitter: 0.08 }); if (mine) TD.cam.kick(0.2); break;
        case 'air': if (mine) TD.audio.play('Play_Car_fly', { vol: 0.7 }); break;
        case 'land': if (mine) { TD.audio.play('Play_Car_Land', { vol: Math.min(1, 0.3 + (e.power || 0.5)) }); TD.cam.landDip(e.power || 0.5); TD.cam.kick(0.1 + 0.2 * (e.power || 0)); } break;
        case 'respawn': if (mine) { TD.audio.play('Play_Respawn'); TD.cam.snap(k); } break;
        case 'lap': if (mine && e.lap > 0 && k.lap < R.laps) { TD.audio.play('Play_Race_Lap'); TD.menu.banner('VÒNG ' + k.lap); } break;
        case 'final_lap': if (mine) { TD.audio.play('Play_Race_FinalLap'); TD.menu.banner('VÒNG CUỐI'); } break;
        case 'overtake': if (mine) TD.menu.pop('rank', e.place); break;
        case 'finish':
          if (mine && !M.fin) {
            TD.audio.play('Play_Race_Finish');
            TD.audio.play(e.place <= 3 ? 'Play_UI_Win' : 'Play_UI_Lose', { vol: 0.9 });
            TD.audio.music(null);
            M.finishT = 0.001;
            M.fin = settle(R, k, !!e.dnf);
            TD.menu.goal(!e.dnf);
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
    if (TD.input.takePause() && !M.resultShown && !(M.finishT > 0)) { M.paused = !M.paused; TD.menu.pause(M.paused); }
    if (M.paused) { TD.postfx.render(M.scene, M.camera); return; }
    M.introT += dt;
    const intro = M.introT < INTRO;
    // Ga tự động như bản di động; trong đếm ngược chỉ nhấn ga khi người chơi giữ ↑ (để canh xuất phát nhanh).
    TD.input.apply(me.input);
    if (R.phase === 'countdown') me.input.throttle = (TD.input.keys.ArrowUp || TD.input.keys.KeyW || TD.input.touch.nitro || TD.input.touch.drift) ? 1 : 0;
    if (me.st === 'finish') { me.input.steer = 0; me.input.drift = false; me.input.nitro = false; }
    if (M.fin && M.fin.celebrating) { me.input.throttle = 0; me.input.brake = 1; }   // sau GOAL xe phanh đứng yên
    if (TD.input.takeReset() && R.phase !== 'countdown' && me.st !== 'finish') TD.Race.respawn(R, me, 'manual');
    if (!intro) TD.Race.step(R, dt);
    handleEvents(R);
    for (const v of M.views) TD.kartView.update(v, dt);
    const boost = me.nitro.boostT > 0 ? 1 : 0, mini = me.nitro.miniT > 0 ? 1 : 0;
    if (intro) {
      const len = TD.cam.intro(dt, M.introT, me, R.trackId);
      INTRO = len || INTRO0;
      if (!len) TD.cam.orbit(dt, me.x, me.y, me.z, me.yaw, M.introT);
      if (M.introT + dt >= INTRO) TD.cam.snap(me);
    } else if (M.finishT > 0) {
      M.finishT += dt;
      finishStep(dt, boost, mini);
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
    plug('update', dt, M.ctx);
    const amb = AMB[R.trackId];
    if (amb && R.phase !== 'countdown' && (M.ambT -= dt) <= 0) { M.ambT = 14 + Math.random() * 14; TD.audio.play(pick(amb.pass), { vol: 0.7 }); }
    TD.trackView.update(M.camera);
    TD.hud.update(R, me, dt);
    if (M.podState === 2) { TD.podium.update(dt); TD.podium.render(); }
    else TD.postfx.render(M.scene, M.camera);
    if (M.finishT < FIN.goal) TD.hud.draw(R, R.karts, me);
  }

  // ---------- về đích: GOAL → ăn mừng cận cảnh → sân khấu bục → thẻ thưởng → bảng xếp hạng ----------
  // Mốc theo giây mô phỏng kể từ lúc mình về đích (clip gốc: GOAL ~1,5 s, cận cảnh ~5 s, bục ~8 s).
  const FIN = { goal: 1.6, cel: 6.4, card: 5.4 };

  // Chốt thưởng ngay lúc về đích (thoát giữa chừng vẫn giữ xu/XP/kỷ lục); phần hiển thị đọc lại từ kết quả này.
  function settle(R, k, dnf) {
    const d = TD.save.d, lvA = TD.LEVEL.of(d.xp);
    const reward = [0, 300, 220, 160, 120, 90, 60][k.place] || 50;
    const xp = TD.LEVEL.forPlace(k.place, dnf);
    const prev = d.best[R.trackId];
    const newRecord = k.finishT != null && !dnf && (prev == null || k.finishT < prev);
    d.coins += reward; d.xp += xp; d.races++; if (k.place === 1 && !dnf) d.wins++;
    if (newRecord) d.best[R.trackId] = k.finishT;
    TD.save.save();
    const lvB = TD.LEVEL.of(d.xp);
    const avg = k.finishT ? (R.T.L * R.laps) / k.finishT * 3.6 : 0;
    const F = { dnf, place: k.place, reward, xp, newRecord, prev, lvBefore: lvA, lvAfter: lvB, levelUp: lvB.lv > lvA.lv, mode: R.mode,
      team: R.mode.teams ? TD.teamScore(R) : null, cards: [],
      stats: { drifts: k.stats.drifts, boosts: k.stats.miniBoosts + k.stats.nitros, hits: k.stats.wallHits + M.bumps, avg } };
    // Đội thắng: cả đội nhận thêm 50% xu (chọn).
    if (F.team && F.team.win === k.team) { const add = Math.round(reward / 2); d.coins += add; F.reward += add; }
    // Plugin ghi thêm (sao xếp hạng, nhiệm vụ...) rồi đẩy thẻ HTML vào F.cards; lưu lần nữa sau khi chúng sửa bản lưu.
    plug('settle', F, M.ctx);
    TD.save.save();
    return F;
  }

  function showResult() {
    TD.audio.play('Play_BGM_end');
    setTimeout(() => { if (M.state === 'race' && M.resultShown) TD.audio.music('Play_Music_Lobby'); }, 3500);
    TD.menu.result(M.race, M.me, M.fin);
  }

  // Mỗi khung sau khi mình về đích. camera: chase còn chạy → cận thấp ba phần tư → (sân khấu: podium.js tự đặt camera).
  function finishStep(dt, boost, mini) {
    const R = M.race, me = M.me, f = M.finishT, F = M.fin;
    if (f < FIN.goal) { TD.cam.update(dt, me, boost, mini); return; }
    if (!F.celebrating) {
      // Dừng xe: hết điều khiển bot sau về đích, phanh hẳn để xe đứng yên trong cảnh cận.
      F.celebrating = true; me.bot = null;
      $('hud').style.visibility = 'hidden';
      TD.menu.celebrate(F, me);
      if (TD.podium) TD.podium.load().catch((e) => { console.error(e); M.podState = 3; });
    }
    if (M.podState === 2) {
      // Thẻ thưởng hiện sau mốc card giây trên sân khấu; không có sân khấu (lỗi nạp) thì hiện ngay.
      if (!M.resultDom && TD.podium.t >= FIN.card) { M.resultDom = true; showResult(); }
    } else {
      const fx = Math.sin(me.yaw), fz = Math.cos(me.yaw), t = f - FIN.goal;
      // Trước-trái xe, thấp ngang bánh, quay chậm quanh xe như cú máy cận cảnh gốc.
      const a = 0.62 + t * 0.07, lx = Math.cos(a) * fz + Math.sin(a) * fx, lz = -Math.cos(a) * fx + Math.sin(a) * fz;
      M.camera.position.set(me.x + lx * 5.4, me.y + 0.95 + t * 0.03, me.z + lz * 5.4);
      M.camera.up.set(0, 1, 0); M.camera.lookAt(me.x, me.y + 0.7, me.z);
      if (M.camera.fov !== 36) { M.camera.fov = 36; M.camera.updateProjectionMatrix(); }
      if (f >= FIN.cel && M.podState === 0 && TD.podium) {
        M.podState = 1;
        TD.podium.load().then(() => TD.podium.enter(R, me)).then(() => { M.podState = 2; M.camera.fov = 60; M.camera.updateProjectionMatrix(); TD.menu.celebrateEnd(); })
          .catch((e) => { console.error(e); M.podState = 3; });
      }
      if (M.podState === 3 && !M.resultDom) { M.resultDom = true; showResult(); }
    }
    if (M.resultDom) { TD.menu.tickResult(dt); TD.menu.updateResult(R, me); }
  }

  M.toLobby = function () {
    if (M.race) plug('end', M.ctx);
    TD.audio.engineStop();
    TD.audio.skid(0, 0);
    TD.audio.stopAll();
    TD.audio.music(pick(['Play_Music_Lobby', 'Play_Music_Menu2']));
    TD.hud.setTouch(false);
    if (TD.podium) TD.podium.leave();
    $('hud').style.visibility = '';
    M.state = 'lobby'; M.race = null; M.paused = false;
    TD.postfx.params.radial = 0;
    if (M.show) M.show.key = null;
    M.showCar(TD.save.d.car, TD.save.d.driver);
    TD.hud.ctx.clearRect(0, 0, TD.hud.canvas.width, TD.hud.canvas.height);   // khung HUD cuối trận còn trên canvas
    TD.lobby.show();
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
