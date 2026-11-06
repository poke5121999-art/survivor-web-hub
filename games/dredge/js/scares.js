/*
 * Sự kiện hù doạ nhẹ của WorldEventManager (U6 scares, MONSTERS.md §2.7, §2.8): Splash, Parasite, Eyes, FlickerLights, GhostWind,
 * LeviathanCall, cộng GhostFoghorn (tiếng còi ma) và LoreRockManager (đá cổ phát sáng khi hoảng loạn). Không có dữ liệu riêng: số lấy từ
 * prefab / cảnh gốc (GameObject/*.prefab, Game.unity) ghi ở từng chỗ; hạt và tiếng đã có từ seam S2 (data/particles.js, data/audio.js).
 *
 * Lịch bốc thăm do js/events.js (DREvents). Mỗi sự kiện đăng ký bằng DREvents.register(tên WorldEventData, { spawn(e, ctx) → handle | null }).
 *   Splash      SplashWorldEvent.cs:17-37: hạt SplashWorldEvent bám thuyền, sống main.duration của hệ gốc (6 s), tiếng monster-splash 0,5 / 300 m.
 *   Parasite    ParasiteWorldEvent.cs:22-47: cùng hạt; sau delayBeforeAddingParasite 2 s lây một con cá ngẫu nhiên chưa nhiễm trong khoang
 *               (GridManager.InfectRandomItemInInventory :689-699, canBeInfected) + thông báo notification.infection-start. Sự lây lan là của U7.
 *   Eyes        EyeParticlesWorldEvent.cs:44-110 (cảnh FollowPlayer/EyeParticles: max 60, min 2, dài 20, ngắn 15, volMax 1, fade 0,5 / 5 / 2):
 *               t = invLerp(maxSanity 0,75, minSanity 0, sanity); thời gian = lerp(15, 20, t); số hạt tối đa = lerp(2, 60, t) tween 5 s (DOTween mặc định OutQuad);
 *               kết thúc (hết giờ, Xua đuổi): tiếng + số hạt tween về 0 trong 2 s rồi mới xong.
 *   FlickerLights FlickerLightsWorldEvent.cs:23-42 + LightFlickerEffect.cs:25-78: bật đèn, khoá, độ sáng = flickerCurve(t / 2 s) qua DRBoat.lightOverride,
 *               hết 2 s thì mở khoá và TẮT đèn (enableAfterFinish 0). Tiếng Flickering Lights âm lượng 1.
 *   GhostWind   GhostWindWorldEvent.cs:41-115 (P: 25–150 m, 20 s, vol 1, fade 0,5 / 5): hạt gió chỉ về điểm đặc biệt đầu tiên cách 25–150 m có
 *               CanBeGhostWindTarget (điểm câu còn kho ≥ 1; điểm kiểm tra đang bật), DestinationWindEffect tại đó; kết thúc khi 20 s, chạm điểm (câu / kiểm tra),
 *               Còi (events.js). Sau RequestEventFinish đợi finishDelaySec (= startLifetime lớn nhất = 5 s) rồi mới xong. Không có điểm nào: kết thúc ngay.
 *               [ĐỀ XUẤT] bản gốc lấy phần tử đầu của FindObjectsOfType (thứ tự không xác định): web lấy điểm GẦN nhất.
 *   LeviathanCall DistantSoundWorldEvent.cs:20-32 (P: distance 1000): tiếng Leviathan Distant Call tại điểm cách người chơi 1000 m theo hướng ngẫu nhiên,
 *               rolloff tuyến tính 1000..2000, ignorePause; xong ngay.
 *   GhostFoghorn GhostFoghorn.cs:84-137 (cảnh Logic/WorldEventManager/GhostFoghorn: fade 0,08 s, cao độ 1,15 → 1, âm 0,5 → 1, từ 0,75 qua nửa đêm tới 0,25, cách 2 ngày,
 *               tối đa 5 s, im 2 s thì chốt): ghi nhịp bật/tắt còi của người chơi, rồi phát lại ở điểm ngẫu nhiên bán kính 1000 m quanh gốc bản đồ (không phải quanh
 *               thuyền) bằng foghorn-loop-far / foghorn-end-far (AudioSource min 10 / 1, max 8000, tuyến tính).
 *   LoreRock    LoreRockManager.cs:26-43 (cảnh: ngưỡng 0,5, maxStrength 60, chu kỳ 3 s, pulseCurve (0, 0,15) → (1, 1) tiếp tuyến 2): _GlowStrength = 60 · current · pulse,
 *               current = Lerp(current, sanity < 0,5 ? 1 : 0, dt). Web: cộng màu Color_a7ce… (LoreRock_Mat) vào ô đá qua uniform uDrGlow của js/world.js.
 *               [ĐỀ XUẤT] hệ số 1,5 giữa _GlowStrength/60 và màu cộng; tầm mờ dần = _EmissionFadeDistance 50 m.
 *
 *   DRScares.debug → { eyes(), flicker(), wind(), foghorn(), lore(), curve(t) }
 */
(function (root) {
  'use strict';
  const D = root.DR, EV = root.DR_WORLDEVENTS;
  if (!D || !EV || !root.DREvents) { root.DRScares = null; return; }
  const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
  const invLerp = (a, b, v) => (b === a ? 0 : Math.max(0, Math.min(1, (v - a) / (b - a))));
  const outQuad = t => 1 - (1 - t) * (1 - t);                       // DOTween Ease.OutQuad (mặc định của DOTween.To)
  const S = () => D.s;
  const toast = t => { if (root.DRHud && DRHud.toast) DRHud.toast(t); };
  const audio = (key, o) => (root.DRAudio ? DRAudio.voice(key, o) : { gain() {}, stop() {}, pos() {}, alive: false });
  const particles = (n, o) => (root.DRParticles ? DRParticles.spawn(n, o) : { stop() {}, setMaxParticles() {}, alive: false });
  const handleStop = h => { try { h.stop(); } catch (e) { /* hạt đã dọn */ } };

  // ---------------------------------------------------------------- Splash / Parasite
  const SPLASH_DUR = ((root.DR_PARTICLES || {}).SplashWorldEvent || { nodes: [{ main: { dur: 6 } }] }).nodes[0].main.dur;   // particles.main.duration
  function splashLike(name, onTick) {
    return {
      spawn() {
        const b = S().boat;
        // FollowPlayerInWorld: chỉ theo x, z của người chơi, y = 0 (mặt nước); 'follow: player' của DRParticles theo cả y nhấp nhô của thuyền nên dùng gốc riêng
        const T = root.THREE, aim = T ? new T.Object3D() : null;
        const place = () => { if (!aim) return; const bb = S().boat; aim.position.set(bb.x, 0, bb.z); aim.updateMatrixWorld(true); };
        place();
        const fx = particles(name === 'Parasite' ? 'ParasiteWorldEvent' : 'SplashWorldEvent', aim ? { parent: aim, loop: false } : { follow: 'player', loop: false });
        const snd = root.DRAudio && DRAudio.play('monster.generic.splash', 0.5, 1, { pos: { x: b.x, y: 0, z: b.z }, min: 1, max: 300 });
        const h = {
          t: 0, done: false, fx, snd, ticked: false,
          update(dt) {
            this.t += dt;
            place();
            if (onTick) onTick(this);
            if (!this.done && this.t > SPLASH_DUR) this.requestFinish();
          },
          requestFinish() { if (this.done) return; this.done = true; handleStop(fx); },
          dispose() { this.requestFinish(); if (snd && snd.stop) snd.stop(0.2); }
        };
        return h;
      }
    };
  }
  const DELAY_PARASITE = 2;                                       // ParasiteWorldEvent.delayBeforeAddingParasite (ParasiteWorldEvent.prefab:273)
  // GridManager.InfectRandomItemInInventory: cá ngẫu nhiên, chưa nhiễm, canBeInfected; không đổi thành quái dị (canBecomeAberrations false)
  function infectRandom() {
    const inv = D.grid('INVENTORY'), G = root.DRGrid, I = root.DR_ITEMS;
    if (!inv || !G) return null;
    const list = inv.items.filter(i => { const d = I[i.id]; return d && (G.subOf(d) & G.SUB.FISH) && d.canBeInfected && !i.infected; });
    if (!list.length) return null;
    const f = list[Math.floor(Math.random() * list.length)];
    f.infected = true;                                             // FishItemInstance.Infect(): cá nhiễm đứng độ tươi, không ươn (rules.js, grid.js)
    D.emit('cargo', 'INVENTORY', f);
    toast('Có thứ gì đó trườn vào khoang chứa của bạn.');          // notification.infection-start: "Something slithers into your cargo hold."
    return f;
  }
  const splash = splashLike('Splash');
  const parasite = splashLike('Parasite', h => {
    if (!h.ticked && h.t > DELAY_PARASITE) { h.ticked = true; h.infected = infectRandom(); }
  });

  // ---------------------------------------------------------------- Eyes
  const EYE = { countMax: 60, countMin: 2, durMax: 20, durMin: 15, volMax: 1, volFadeIn: 0.5, evFadeIn: 5, evFadeOut: 2 };   // Game.unity FollowPlayer/EyeParticles
  const eye = { cur: null };
  function eyesActivate(e) {
    const t = invLerp(e.maxSanity, e.minSanity, S().sanity);
    const h = {
      dur: lerp(EYE.durMin, EYE.durMax, t), target: lerp(EYE.countMin, EYE.countMax, t), cap: 0, from: 0, k: 0, mode: 'in', done: false,
      fx: particles('EyeParticles', { follow: 'player', loop: true, maxN: EYE.countMax }),
      snd: audio('event.eyes', { vol: 0 }), t
    };
    if (h.fx.setMaxParticles) h.fx.setMaxParticles(0);
    h.snd.gain(EYE.volMax, EYE.volFadeIn / 3);
    h.update = function (dt) {
      if (this.mode === 'in' || this.mode === 'out') {             // particleTween: số hạt tối đa chạy tới đích (OnUpdate → main.maxParticles)
        const len = this.mode === 'in' ? EYE.evFadeIn : EYE.evFadeOut;
        this.k = Math.min(1, this.k + dt / len);
        this.cap = this.from + ((this.mode === 'in' ? this.target : 0) - this.from) * outQuad(this.k);
        if (this.fx.setMaxParticles) this.fx.setMaxParticles(Math.floor(this.cap));
        if (this.mode === 'out' && this.k >= 1) { handleStop(this.fx); this.snd.stop(0.1); this.done = true; }
      }
      if (!this.finishing) { this.dur -= dt; if (this.dur <= 0) this.requestFinish(); }
    };
    h.requestFinish = function () {
      if (this.finishing) return;
      this.finishing = true; this.mode = 'out'; this.from = this.cap; this.k = 0;   // RequestEventFinish: tiếng + hạt mờ dần EventFadeOutDuration
      this.snd.gain(0, EYE.evFadeOut / 3);
    };
    h.dispose = function () { handleStop(this.fx); this.snd.stop(0.1); this.done = true; };
    eye.cur = h;
    return h;
  }
  // RegisterStaticWorldEvent(EYE_PARTICLES): vật FollowPlayer/EyeParticles duy nhất, đi theo người chơi (toạ độ không dùng)
  DREvents.staticEvent('EYE_PARTICLES', { x: 0, z: 0, activate: eyesActivate });

  // ---------------------------------------------------------------- FlickerLights
  // FlickerLightsWorldEvent.prefab flickerCurve: [t, giá trị, tiếp tuyến vào, tiếp tuyến ra]; vô cực = bậc thang (như AnimationCurve)
  const INF = Infinity;
  const FLICKER = [[0, 1, 0, 0], [0.012105716, 0, -82.605606, 0], [0.055194408, 0, -0, 57.197533], [0.11859788, 0.7297606, -59.577656, INF],
    [0.27514023, 0, -4.6617455, 14.504749], [0.33233228, 0.82955647, 14.504749, -10.73151], [0.38036942, 0.5997629, -22.022947, -0.9952142],
    [0.44627932, 0, INF, INF], [0.49529505, 0.70802003, INF, 0.030892178], [0.53226405, 0.4197486, 0, 0], [0.56536025, 0.6411762, -98.01009, -98.01009],
    [0.61016953, 0.59724337, -0.32089028, -1.5855122], [0.671502, 0.5, -1.5855122, -1.5220792], [1, 0, -1.5220792, 0]];
  function hermite(keys, t) {
    const n = keys.length;
    if (t <= keys[0][0]) return keys[0][1];
    if (t >= keys[n - 1][0]) return keys[n - 1][1];
    for (let i = 1; i < n; i++) {
      const a = keys[i - 1], b = keys[i];
      if (t > b[0]) continue;
      const d = b[0] - a[0];
      if (!isFinite(a[3]) || !isFinite(b[2])) return a[1];
      const u = (t - a[0]) / d, u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * a[1] + (u3 - 2 * u2 + u) * a[3] * d + (-2 * u3 + 3 * u2) * b[1] + (u3 - u2) * b[2] * d;
    }
    return keys[n - 1][1];
  }
  const flicker = {
    spawn(e) {
      const A = root.DRAbilities, lights = A && A.ability && A.ability('lights');
      if (!lights || !(S().abilities || {}).lights || A.locked('lights')) return null;   // GetAbilityForData == null: chưa có năng lực Đèn thì không làm gì
      if (!S().lightsOn) lights.activate();                         // LightAbility.Activate (đèn đã bật: bản gốc bật/tắt rồi BeginFlicker bật lại — kết quả như nhau)
      A.lock('lights', true);                                       // lightAbility.Locked = true
      const dur = e.durationSec || 2;
      const snd = root.DRAudio && DRAudio.play('event.flicker', 1);
      const h = {
        t: 0, done: false, k: 1,
        update(dt) {
          if (this.done) return;
          this.t += dt;
          this.k = hermite(FLICKER, Math.min(1, this.t / dur));
          if (root.DRBoat && DRBoat.lightOverride) DRBoat.lightOverride(this.k);
          if (this.t >= dur) this.finish();
        },
        finish() {                                                  // DelayedEventFinish: Locked = false; Deactivate (enableAfterFinish 0: người chơi ở trong tối)
          if (this.done) return;
          this.done = true;
          A.lock('lights', false);
          if (root.DRBoat && DRBoat.lightOverride) DRBoat.lightOverride(null);
          lights.deactivate();
        },
        requestFinish() { /* không huỷ được giữa chừng: Invoke("DelayedEventFinish", durationSec) */ },
        dispose() { this.finish(); if (snd && snd.stop) snd.stop(0.1); }
      };
      return h;
    }
  };

  // ---------------------------------------------------------------- GhostWind
  const WIND = { min: 25, max: 150, volMax: 1, fadeIn: 0.5, fadeOut: 5, finishDelay: 5 };   // GhostWindEvent.prefab
  function windTargets(b) {
    const out = [], s = S();
    for (const sp of (root.DRSpots && DRSpots.list) || []) {          // HarvestPOI.CanBeGhostWindTarget: kho ≥ 1
      const r = s.spots && s.spots[sp.id], stock = r ? r.stock : sp.d.startStock;
      if (stock >= 1) out.push({ x: sp.x, z: sp.z, kind: 'harvest', id: sp.id });
    }
    for (const p of (root.DRPoi && DRPoi.points) || []) {             // ConversationPOI.CanBeGhostWindTarget: cầu tương tác đang bật
      try { if (DRPoi.enabled(p)) out.push({ x: p.x, z: p.z, kind: 'inspect', id: p.id }); } catch (e) { /* điểm lạ */ }
    }
    return out.map(o => Object.assign(o, { d: Math.hypot(o.x - b.x, o.z - b.z) })).filter(o => o.d > WIND.min && o.d < WIND.max).sort((a, c) => a.d - c.d);
  }
  const wind = {
    spawn(e) {
      const b = S().boat, T = root.THREE;
      const tg = windTargets(b)[0] || null;
      const h = { t: 0, done: false, finishing: false, target: tg, finishT: 0, fx: null, dest: null, snd: null, aim: T ? new T.Object3D() : null, dur: e.durationSec || 20 };
      const poke = () => h.requestFinish();                          // OnPlayerInteractedWithPOI
      for (const ev of ['harvestStart', 'poiInspect']) D.on(ev, poke);
      h.alive = true; h.poke = poke;
      if (tg) {
        orient(h);
        h.fx = particles('GhostWindEvent', { parent: h.aim, loop: true });
        h.dest = particles('DestinationWindEffect', { pos: [tg.x, 0, tg.z], loop: true });
        if (!(root.DRAudio && DRAudio.stingerPlaying && DRAudio.stingerPlaying())) { h.snd = audio('event.ghostWind', { vol: 0 }); h.snd.gain(WIND.volMax, WIND.fadeIn / 3); }
      } else h.requestFinishLater = true;
      h.update = function (dt) {
        if (this.requestFinishLater) { this.requestFinishLater = false; this.requestFinish(); }
        if (this.finishing) { this.finishT += dt; if (this.finishT >= WIND.finishDelay) this.end(); return; }
        this.t += dt;
        if (this.target) orient(this);
        if (this.t > this.dur) this.requestFinish();
      };
      h.requestFinish = function () {
        if (this.finishing) return;
        this.finishing = true; this.finishT = 0;
        if (this.fx) handleStop(this.fx);
        if (this.dest) handleStop(this.dest);
        if (this.snd) this.snd.gain(0, WIND.fadeOut / 3);
      };
      h.end = function () { if (this.done) return; this.done = true; if (this.snd) this.snd.stop(0.1); };
      h.dispose = function () { this.finishing = true; if (this.fx) handleStop(this.fx); if (this.dest) handleStop(this.dest); this.end(); };
      return h;
    }
  };
  // transform.LookAt(target): hướng đuôi hạt của GhostWindEvent hướng về điểm. Neo tại thuyền; yaw three.js (0 nhìn −z) = atan2(−dx, −dz); đã đo bằng hạt thế giới (test/dredge-m2scares.js).
  function orient(h) {
    if (!h.aim) return;
    const b = S().boat, tg = h.target, T = root.THREE;
    const dx = tg.x - b.x, dz = tg.z - b.z;
    h.aim.position.set(b.x, 0, b.z);
    h.aim.rotation.set(0, Math.atan2(-dx, -dz), 0);
    h.aim.updateMatrixWorld(true);
    h.yaw = h.aim.rotation.y;
  }

  // ---------------------------------------------------------------- LeviathanCall
  const leviathan = {
    spawn() {
      const b = S().boat, a = Math.random() * Math.PI * 2, R = 1000;           // Random.insideUnitCircle.normalized * distance
      const pos = { x: b.x + Math.cos(a) * R, y: 0, z: b.z + Math.sin(a) * R };
      const v = root.DRAudio && DRAudio.play('event.leviathan.distant', 1, 1, { pos, min: R, max: R * 2 });
      return { done: true, pos, v, requestFinish() {}, dispose() {} };       // Activate() gọi RequestEventFinish ngay
    }
  };

  DREvents.register('Splash', splash);
  DREvents.register('Parasite', parasite);
  DREvents.register('FlickerLights', flicker);
  DREvents.register('GhostWind', wind);
  DREvents.register('LeviathanCall', leviathan);

  // ---------------------------------------------------------------- GhostFoghorn (GhostFoghorn.cs:84-137)
  const GF = { fadeIn: 0.08, pitch0: 1.15, pitch1: 1, vol0: 0.5, vol1: 1, minTime: 0.75, maxTime: 0.25, days: 2, maxSec: 5, timeout: 2 };   // Game.unity Logic/WorldEventManager/GhostFoghorn
  const gf = { clock: 0, canRecord: false, recording: false, replaying: false, open: false, blare: null, start: 0, last: -Infinity, voice: null, voiceAge: 0, timers: [], pos: null };
  function gfToggle(on) {
    if ((!gf.recording && !gf.canRecord) || gf.replaying) return;
    if (on && gf.canRecord && !gf.recording && !gf.replaying) { gf.recording = true; gf.blare = []; }
    if (gf.blare && (gf.blare.length !== 0 || on)) {
      if (gf.blare.length === 0) { gf.blare = []; gf.recording = true; gf.start = gf.clock; gf.last = S().time; }   // timeOfLastEvent = TimeAndDay
      gf.blare.push(gf.clock);
      gf.open = gf.blare.length % 2 === 1;
    }
  }
  D.on('abilityToggled', a => { if (a && a.id === 'foghorn') gfToggle(!!a.active); });
  function gfBlare(on) {
    if (on) {                                                       // StartBlare: cao độ 1,15 → 1 và âm 0,5 → 1 trong fadeInSec rồi phát vòng lặp
      if (gf.voice) gf.voice.stop(0.05);
      gf.voice = audio('boat.horn.far.loop', { loop: true, vol: GF.vol0, rate: GF.pitch0, pos: gf.pos, min: 10, max: 8000 });
      gf.voice.gain(GF.vol1, GF.fadeIn / 3);
      gf.voiceAge = 0;
    } else {                                                        // EndBlare: dừng vòng lặp, phát foghorn-end-far
      if (gf.voice) { gf.voice.stop(0.02); gf.voice = null; }
      if (root.DRAudio) DRAudio.play('boat.horn.far.end', 0.5, 1, { pos: gf.pos, min: 1, max: 8000 });
    }
  }
  function gfTick(dt) {
    gf.clock += dt;
    const s = S(), tod = s.time - Math.floor(s.time);
    gf.canRecord = (tod > GF.minTime || tod < GF.maxTime) && s.time > gf.last + GF.days;
    if (gf.voice && gf.voiceAge < 0.2) {                            // pitch tween của foghornMidSource (DOPitch 1,15 → 1)
      gf.voiceAge += dt;
      if (gf.voice.src && gf.voice.src.playbackRate) gf.voice.src.playbackRate.value = lerp(GF.pitch0, GF.pitch1, gf.voiceAge / GF.fadeIn);
    }
    if (gf.replaying) {
      for (const tm of gf.timers.slice()) if (gf.clock >= tm.at) { gf.timers.splice(gf.timers.indexOf(tm), 1); tm.fn(); }
    }
    if (!gf.recording || !gf.blare || gf.blare.length <= 0) return;
    const lastB = gf.blare[gf.blare.length - 1];
    if (!((!gf.open && gf.clock > lastB + GF.timeout) || gf.clock > gf.blare[0] + GF.maxSec)) return;
    gf.recording = false;
    if (gf.blare.length % 2 === 1) gf.blare.push(gf.clock);       // bấm mà chưa thả: chốt tại đây
    gf.replaying = true;
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 1000;   // insideUnitCircle * 1000, quanh gốc bản đồ
    gf.pos = { x: Math.cos(a) * r, y: 0, z: Math.sin(a) * r };
    gf.timers = [];
    gf.blare.forEach((tt, i) => gf.timers.push({ at: gf.clock + (tt - gf.start), fn: () => gfBlare(i % 2 === 0) }));
    gf.timers.push({ at: gf.clock + (gf.blare[gf.blare.length - 1] - gf.start), fn: () => { gf.replaying = false; } });   // EndReplaying
    gf.timers.sort((x, y) => x.at - y.at);
  }

  // ---------------------------------------------------------------- LoreRockManager (LoreRockManager.cs:26-43)
  const LORE = { threshold: 0.5, max: 60, period: 3, curve: [[0, 0.15, 0, 0], [1, 1, 2, 2]], color: [0.5566038, 0.04988429, 0.10212336], k: 1.5, fade: 50 };
  const lore = { cur: 0, strength: 0, pulse: 0 };
  function loreTick(dt, t) {
    const s = S();
    if (!s) return;
    const pp = Math.abs(((t % (2 * LORE.period)) + 2 * LORE.period) % (2 * LORE.period) - LORE.period);   // Mathf.PingPong(Time.time, period) = period − |t mod 2p − p|
    const pingpong = LORE.period - pp;
    lore.pulse = hermite(LORE.curve, invLerp(0, LORE.period, pingpong));
    lore.cur = lerp(lore.cur, s.sanity < LORE.threshold ? 1 : 0, dt);
    lore.strength = LORE.max * lore.cur * lore.pulse;               // _GlowStrength
    const g = (root.DRWorld && DRWorld.loreGlow) || [], k = lore.strength / LORE.max * LORE.k;
    for (const v of g) v.set(LORE.color[0] * k, LORE.color[1] * k, LORE.color[2] * k, lore.cur > 0.02 ? LORE.fade : 0);
  }

  // ---------------------------------------------------------------- vòng lặp riêng (js/main.js không gọi): GhostFoghorn dùng Time.time, đá cổ dùng Time.time + deltaTime
  let lastT = null;
  function frame(now) {
    const t = now / 1000, dt = lastT == null ? 0 : Math.min(0.1, t - lastT);
    lastT = t;
    try {
      if (S() && S().boat && D.mode !== 'title') { gfTick(dt); }
      loreTick(dt, t);
    } catch (err) { console.error('[scares] frame failed:', err); }
    root.requestAnimationFrame(frame);
  }
  root.requestAnimationFrame(frame);

  root.DRScares = {
    infectRandom, curve: t => hermite(FLICKER, t),
    debug: {
      eyes: () => eye.cur && { cap: Math.floor(eye.cur.cap), target: eye.cur.target, dur: eye.cur.dur, mode: eye.cur.mode, done: eye.cur.done, t: eye.cur.t },
      lore: () => Object.assign({}, lore, { mats: ((root.DRWorld && DRWorld.loreGlow) || []).length }),
      foghorn: () => ({ canRecord: gf.canRecord, recording: gf.recording, replaying: gf.replaying, blare: gf.blare && gf.blare.slice(), pos: gf.pos, clock: gf.clock }),
      windTargets: () => windTargets(S().boat), gf
    }
  };
})(window);
