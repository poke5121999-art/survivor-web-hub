/*
 * Cảnh trận đấu: P1.scene.add('battle', …).
 *
 *   engine (P1.Battle) ──sự kiện──▶ DIRECTOR[lệnh] (diễn: model, VFX, thanh máu, chữ, tiếng)
 *        ▲                                   │
 *        └──── hành động ◀── MODES[chế độ] ◀─┘ (BattlePanel NGUI + phím)
 *
 * Sân, máy ảnh, anim chung, hiệu ứng bắt: P1.BATTLE (data/battle.js, tools/rip_battle.py).
 * Hằng số lấy từ mã gốc và phần đoán: tools/README-battle.md.
 */
(function (P1) {
  'use strict';
  const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

  /* ================================================================ dữ liệu gốc và bảng tra */

  const DATA = () => P1.BATTLE;
  const ANIM = { spawn: 0, spawnBall: 1, flyInRight: 3, flyInLeft: 4, faint: 5, sendOut: 6, switchOut: 7 };

  const TYPES = ['Normal', 'Fighting', 'Flying', 'Poison', 'Ground', 'Rock', 'Bug', 'Ghost', 'Steel', 'Fire', 'Water', 'Grass',
    'Electric', 'Psychic', 'Ice', 'Dragon', 'Dark', 'Fairy'];
  const TYPE_COLOUR = () => (P1.UI.BattlePanel.mb.BattleHandler.TypeColours || []);
  const STATUS_ICON = { brn: 'Icon_Status_Burn', par: 'Icon_Status_Paralyzed', slp: 'Icon_Status_Sleep', frz: 'Icon_Status_Frozen',
    psn: 'Icon_Status_Poisoned', tox: 'Icon_Status_BadlyPoisoned', fnt: 'Icon_Status_Fainted' };
  const SWITCH_STATUS = { brn: 'Icon_Status_Burn', par: 'paralize', slp: 'Icon_Status_Sleep', frz: 'freeze', psn: 'psn', tox: 'psn' };
  // PlayBattleMusic: nhạc server gửi nếu có, không thì 'Battle_Wild' / 'Trainer_Battle'. Gym: server gửi (đoán battle_gym_kanto).
  const MUSIC = { wild: 'battle_wild', trainer: 'trainer_battle', gym: 'battle_gym_kanto' };
  const BAG_ALIAS = { pokball: 'pokeball' };      // items.txt ghi BattleID của Poké Ball là "pokball"

  // Chỉnh theo mã gốc (xem README-battle.md); giá trị đánh dấu (đoán) chưa có bằng chứng.
  const TUNE = {
    fxPxToM: 0.006,           // (đoán) mét / điểm ảnh atlas cho hoạt ảnh sprite 3D
    hpSeconds: 0.5,           // ChangeHealth: TweenWidth 0.5 s rồi wait 0.5
    oldBarDelay: 0.75,        // thanh "Healthbar Old" TweenWidth 0.5 s, delay 0.75
    logHold: 3.5,             // Update: khung log sáng dần (2/s) trong 3.5 s sau dòng cuối rồi tắt dần (2/s)
    logLines: 4,              // Label 616x80, dòng 20
    textFast: 0.2,            // logText: fast 0.2 s, thường 0.8 s
    textPause: 0.8,
  };

  /* Tên Pokémon trong log: "[ff6600]Tên[-]" cho cả hai phe, không có chữ "wild" (BattlePacketHandler). */
  const NAME_COLOUR = 'ff6600';

  /* ================================================================ đồng hồ trận (mọi chờ/tween đi theo khung hình) */

  function makeClock() {
    const c = { t: 0, waits: [], tweens: [] };
    c.wait = (s) => new Promise((res) => c.waits.push({ at: c.t + Math.max(0, s), res }));
    c.tween = (dur, fn) => new Promise((res) => { fn(0); c.tweens.push({ t0: c.t, dur: Math.max(1e-3, dur), fn, res }); });
    c.tick = (dt) => {
      c.t += dt;
      for (let i = c.tweens.length - 1; i >= 0; i--) {
        const w = c.tweens[i], k = Math.min(1, (c.t - w.t0) / w.dur);
        w.fn(k);
        if (k >= 1) { c.tweens.splice(i, 1); w.res(); }
      }
      for (let i = c.waits.length - 1; i >= 0; i--) if (c.t >= c.waits[i].at) { c.waits[i].res(); c.waits.splice(i, 1); }
    };
    return c;
  }
  const ease = (k) => k * k * (3 - 2 * k);

  /* ================================================================ model Pokémon */

  // Sao chép cây có SkinnedMesh (three r140 không kèm SkeletonUtils).
  function cloneSkinned(src) {
    const clone = src.clone(true);
    const map = new Map();
    (function pair(a, b) { map.set(a, b); for (let i = 0; i < a.children.length; i++) pair(a.children[i], b.children[i]); })(src, clone);
    clone.traverse((n) => {
      if (!n.isSkinnedMesh) return;
      let orig = null;
      map.forEach((v, k) => { if (v === n) orig = k; });
      const sk = orig.skeleton;
      n.bind(new THREE.Skeleton(sk.bones.map((b) => map.get(b)), sk.boneInverses), orig.bindMatrix);
    });
    return clone;
  }

  /*
   * PokeLoader.Setup (0x269080): lấy mẫu clip "0" tại t=0, đặt localScale = 1, cộng Renderer.bounds của mọi lưới
   * (SkinnedMeshRenderer có updateWhenOffscreen, nên là khung bao thật, đơn vị cm của model gốc), rồi
   *   scale = fixedAverage / Lerp(fixedAverage, bounds.size.y, Factor),  fixedAverage = 300 (ctor 0x26ED43),
   *   Factor = 0.7 (ctor 0x26ED4A, 3DPokemonPrefab cũng lưu 0.7).
   * StartUp phóng model tới scale·0.01. glb của rip_poke đã nhân 0.01, nên model trong three nhân đúng `scale`.
   * Loài nhỏ được phóng to, loài lớn thu lại: Charmander 0,59 m → 1,34 m, Pidgey 0,29 m → 0,79 m.
   * ScaleFactor của pokemonmodels.txt chỉ dùng cho dạng "primal" (0x2693B6), không nhân ở đây.
   */
  function pokeLoaderScale(heightM) {
    const H = heightM * 100, avg = 300, factor = 0.7;
    return avg / (avg + (H - avg) * factor);
  }

  class Slot {
    constructor(side, stage) {
      this.side = side; this.stage = stage;
      const st = DATA().stage[side === 'p1' ? 'user' : 'foe'];
      this.home = V3(st.pos);
      this.root = new THREE.Group();
      this.root.position.copy(this.home);
      this.root.rotation.y = side === 'p1' ? 0 : Math.PI;       // model nhìn +Z; phe mình đứng z<0 nhìn sang địch
      stage.scene.add(this.root);
      this.mon = null; this.model = null; this.mixer = null; this.clips = {}; this.mats = [];
      this.height = 1;
      const sh = DATA().stage.shadow || {};
      const tex = P1.texture(sh.tex || 'art/battle/Shadow.png');
      tex.magFilter = THREE.LinearFilter;
      this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.7 }));
      this.shadow.rotation.x = -Math.PI / 2;
      this.shadow.position.y = 0.02;
      this.shadow.visible = false;
      this.root.add(this.shadow);
    }
    get anchor() { return this.root.position.clone().add(new THREE.Vector3(0, this.height * 0.55 * this.root.scale.y, 0)); }
    /* Vị trí xương "Head" (PlayAttackEffect đặt Default Hit ở đó), không có thì giữa thân. */
    head() {
      let h = null;
      if (this.model) this.model.traverse((n) => { if (!h && n.isBone && /head/i.test(n.name)) h = n; });
      return h ? h.getWorldPosition(new THREE.Vector3()) : this.anchor;
    }

    async load(mon) {
      this.clear();
      this.mon = mon;
      const info = P1.POKES && P1.POKES[mon.dex];
      const scale = info ? pokeLoaderScale(info.height) : 1;
      if (info) {
        const gltf = await P1.gltf(info.glb);
        const model = cloneSkinned(gltf.scene);
        model.scale.setScalar(scale);
        model.traverse((n) => {
          if (!n.isMesh) return;
          n.frustumCulled = false;
          n.material = n.material.clone();
          n.material.userData.transparent = n.material.transparent;
          n.material.userData.opacity = n.material.opacity;
          if (mon.shiny && info.shiny && info.shiny[n.material.name]) {
            const t = new THREE.TextureLoader().load(info.shiny[n.material.name]);
            t.flipY = false; t.encoding = THREE.sRGBEncoding;
            n.material.map = t;
          }
          this.mats.push(n.material);
        });
        this.model = model;
        this.height = (info.height || 1) * scale;
        this.mixer = new THREE.AnimationMixer(model);
        this.clips = {};
        for (const [role, name] of Object.entries(info.clips || {})) {
          const clip = gltf.animations.find((a) => a.name === name);
          if (clip) this.clips[role] = clip;
        }
        this.playIdle();
      } else {
        // Loài chưa bóc model: ảnh 2D "big" của game làm billboard.
        const tex = P1.texture('art/sprite/poke/big/' + mon.dex + '.png');
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
        mat.userData.transparent = true; mat.userData.opacity = 1;
        const spr = new THREE.Sprite(mat);
        spr.scale.set(1.6, 1.6, 1); spr.position.y = 0.8;
        this.model = new THREE.Group(); this.model.add(spr);
        this.mats.push(mat);
        this.height = 1.6;
      }
      this.root.add(this.model);
      const w = Math.max(0.9, this.height * 0.9);
      this.shadow.scale.set(w, w, 1);
      this.shadow.visible = true;
      this.setAlpha(1);
      this.root.scale.setScalar(1);
      this.root.position.copy(this.home);
    }
    clear() {
      if (this.model) this.root.remove(this.model);
      this.model = null; this.mixer = null; this.mats = []; this.mon = null;
      this.shadow.visible = false;
    }
    playIdle() {
      if (!this.mixer || !this.clips.idle) return;
      this.mixer.stopAllAction();
      const a = this.mixer.clipAction(this.clips.idle);
      a.setLoop(THREE.LoopRepeat, Infinity).reset().play();
    }
    /* Phát clip theo vai trò (README-poke.md); xong thì về idle. Trả Promise, thời lượng clip. */
    play(role, opt) {
      opt = opt || {};
      const clip = this.clips[role];
      if (!this.mixer || !clip) return { done: Promise.resolve(), duration: 0 };
      this.mixer.stopAllAction();
      const a = this.mixer.clipAction(clip);
      a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.reset().play();
      const done = new Promise((res) => {
        const on = (e) => {
          if (e.action !== a) return;
          this.mixer.removeEventListener('finished', on);
          if (!opt.hold) this.playIdle();
          res();
        };
        this.mixer.addEventListener('finished', on);
      });
      return { done, duration: clip.duration };
    }
    setAlpha(v) {
      for (const m of this.mats) {
        m.transparent = v < 0.999 ? true : m.userData.transparent;
        m.opacity = m.userData.opacity * v;
        m.depthWrite = v >= 0.999;
      }
      this.shadow.material.opacity = 0.7 * v;
    }
    setTint(c) { for (const m of this.mats) if (m.color) m.color.setRGB(c[0], c[1], c[2]); }
    update(dt) { if (this.mixer) this.mixer.update(dt); }
  }

  /* ================================================================ sân và máy ảnh */

  /* Skybox 6 mặt của RenderSettings level2 (Skybox/6 Sided: màu = ảnh · tint · 2 · exposure). */
  function skybox(S, far) {
    const D = far * 0.5, g = new THREE.Group(), h = Math.PI / 2;
    const tint = S.tint || [0.5, 0.5, 0.5], k = 2 * (S.exposure == null ? 1 : S.exposure);
    const face = (key, pos, rot) => {
      if (!S.faces || !S.faces[key]) return;
      const tex = P1.texture(S.faces[key]);
      tex.magFilter = THREE.LinearFilter;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2 * D, 2 * D), new THREE.MeshBasicMaterial({
        map: tex, fog: false, depthWrite: false, depthTest: false, color: new THREE.Color(tint[0] * k, tint[1] * k, tint[2] * k) }));
      m.position.set(pos[0] * D, pos[1] * D, pos[2] * D);
      m.rotation.set(rot[0], rot[1], rot[2]);
      m.renderOrder = -1;
      g.add(m);
    };
    face('front', [0, 0, 1], [0, Math.PI, 0]);
    face('back', [0, 0, -1], [0, 0, 0]);
    face('left', [-1, 0, 0], [0, h, 0]);
    face('right', [1, 0, 0], [0, -h, 0]);
    face('up', [0, 1, 0], [h, 0, Math.PI]);
    face('down', [0, -1, 0], [-h, 0, Math.PI]);
    return g;
  }

  class Stage {
    constructor(bgKey) {
      const d = DATA().stage;
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(d.camera.clearColor || '#000000');
      this.camera = new THREE.PerspectiveCamera(d.camera.fov || 65, 16 / 9, d.camera.near || 0.3, d.camera.far || 70);
      this.bgKey = bgKey;
      const L = d.lights;
      const amb = L && L.ambient;
      this.scene.add(new THREE.HemisphereLight(
        amb ? new THREE.Color().fromArray(amb.sky || [1, 1, 1]) : 0xffffff,
        amb ? new THREE.Color().fromArray(amb.ground || amb.sky || [0.5, 0.5, 0.5]) : 0x8899aa,
        0.85));
      const sun = new THREE.DirectionalLight(L && L.pokemon ? new THREE.Color().fromArray(L.pokemon.color) : 0xffffff, 0.75);
      const dir = L && L.pokemon && L.pokemon.dir ? V3(L.pokemon.dir) : new THREE.Vector3(-0.4, -1, 0.5);
      sun.position.copy(dir.clone().normalize().multiplyScalar(-10));
      this.scene.add(sun);
      this.scene.add(sun.target);
      this.slots = { p1: new Slot('p1', this), p2: new Slot('p2', this) };
      this.fx = [];
      this.cam = new CameraRig(this);
      if (d.sky && d.sky.faces) { this.sky = skybox(d.sky, this.camera.far); this.scene.add(this.sky); }
      this.t = 0;
    }
    async load() {
      const bgs = DATA().stage.backgrounds || {};
      const bg = bgs[this.bgKey] || bgs.grass || Object.values(bgs).find((b) => b.active) || null;
      if (bg && bg.glb) {
        try {
          const g = await P1.gltf(bg.glb);
          const m = g.scene.clone(true);
          m.traverse((n) => { if (n.isMesh) n.frustumCulled = false; });
          this.scene.add(m);
          for (const l of bg.lights || []) {
            const pl = new THREE.PointLight(new THREE.Color().fromArray(l.color || [1, 1, 1]), l.intensity || 1, l.range || 10);
            pl.position.fromArray(l.pos); this.scene.add(pl);
          }
          return;
        } catch (e) { console.warn(e.message); }
      }
      // Không có nền: mặt đất đơn giản bằng ảnh sân gốc (art/battle/Arena.png).
      const tex = P1.texture('art/battle/Arena.png');
      tex.magFilter = THREE.LinearFilter;
      const ground = new THREE.Mesh(new THREE.CircleGeometry(12, 48), new THREE.MeshLambertMaterial({ map: tex }));
      ground.rotation.x = -Math.PI / 2;
      this.scene.add(ground);
    }
    addFx(h) { this.scene.add(h.obj); this.fx.push(h); return h; }
    update(dt) {
      this.slots.p1.update(dt); this.slots.p2.update(dt);
      for (let i = this.fx.length - 1; i >= 0; i--) {
        if (!this.fx[i].update(dt)) { this.fx[i].dispose(); this.fx.splice(i, 1); }
      }
      this.cam.update(dt);
      this.t += dt;
      // BattleCamera.Update: skybox _Rotation = -Time.time·0.5 (độ); lật x nên đổi chiều.
      if (this.sky) { this.sky.position.copy(this.camera.position); this.sky.rotation.y = (this.t * 0.5 * Math.PI) / 180; }
    }
    pxScale(renderer) {
      const h = renderer.domElement.height;
      return h / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    }
    dispose() {
      this.fx.forEach((f) => f.dispose());
      this.scene.traverse((n) => { if (n.geometry) n.geometry.dispose(); });
    }
  }

  /*
   * Máy ảnh theo PSXUtilities.CameraState, dịch từ BattleHandler.MoveCamera (RVA 0x2101D0):
   * vị trí đi thẳng tới đích bằng Vector3.MoveTowards (m/s), hướng nhìn LookAt đích mỗi khung.
   * Idle/Idle2 tới nơi rồi RotateAround tâm sân. Bảng và địa chỉ lệnh: tools/README-battle.md.
   */
  const MOVE = 4.0, SELECT = 6.0;             // BattleHandler..ctor 0x213F48: MovementSpeed, SelectMovementSpeed
  const CAMERA_STATES = {
    Idle: { pos: 'Center Field Pos', look: 'Center Field', speed: MOVE, orbit: -10 },       // Unity +10°/s, đảo chiều do lật x
    Idle2: { pos: 'Center Field Pos (1)', look: 'Center Field', speed: MOVE, orbit: 5 },    // Unity -5°/s
    Default: { pos: 'Select All Pos', look: 'Select All Focus', speed: 3 },
    HitFoe: { pos: 'Select Foe', look: 'Select Foe Focus', speed: 6 },
    HitUser: { pos: 'Select User', look: 'Select Self Focus', speed: 6 },
    SelectFoe: { pos: 'Select Foe', look: 'Select Foe Focus', speed: SELECT },
    SelectUser: { pos: 'Select User', look: 'Select Self Focus', speed: SELECT },
    SelectField: { pos: 'Select All Pos', look: 'Select All Focus', speed: SELECT },
    Still: { pos: 'DefaultStuck', look: 'Select All Focus', speed: 6 },
  };
  CAMERA_STATES.FocusUser = CAMERA_STATES.Default;     // không nơi nào trong mã gán 0/1
  CAMERA_STATES.FocusPlayer = CAMERA_STATES.Default;

  class CameraRig {
    constructor(stage) {
      this.stage = stage;
      const c = DATA().stage.camera;
      this.pos = V3(c.pos || [9, 4, 0]);             // transform "BattleCamera" trong scene = PositionTargets[3]
      this.look = this.anchor('Center Field');
      this.state = 'Idle2';
      this.arrived = false;
      this.follow = null;
      this.apply();
    }
    anchor(name) { const a = DATA().stage.anchors[name]; return a ? V3(a.pos) : new THREE.Vector3(); }
    /* Battle Camera = Set: mọi Idle/Idle2/Default thành Still (DefaultStuck), không xoay (MoveCamera 0x21020A). */
    effective(state) {
      if (!P1.settings.battleCamera && (state === 'Idle' || state === 'Idle2' || state === 'Default')) return 'Still';
      return state;
    }
    set(state) {
      const s = this.effective(state);
      if (s !== this.state) { this.state = s; this.arrived = false; }
    }
    /* SendOutPokemon (chỉ khi Rotate): bám con vừa ra, thả sau 1 s kể từ lần gán cuối rồi nhảy về đích state. */
    focus(slot) {
      if (!P1.settings.battleCamera) return;
      this.follow = { slot, t: 0 };
    }
    release() { if (this.follow) this.follow.t = 1e-6; }
    update(dt) {
      const f = this.follow;
      if (f) {
        if (f.t > 0) f.t += dt;
        if (f.t > 1.0) {
          this.follow = null;
          this.pos.copy(this.anchor(CAMERA_STATES[this.state].pos));
          this.arrived = false;
        } else {
          const p = f.slot.root.position;
          this.pos.set(p.x, p.y + 3.0, p.z - f.slot.home.z * 1.2);
          this.look.copy(p);
          this.apply();
          this.stage.camera.rotateX(10 * Math.PI / 180);   // eulerAngles.x -= 10 (Unity) = ngẩng lên 10°
          return;
        }
      }
      const s = CAMERA_STATES[this.state];
      const tp = this.anchor(s.pos);
      this.look.copy(this.anchor(s.look));
      if (!this.arrived || !s.orbit) {
        const d = tp.clone().sub(this.pos), len = d.length(), step = s.speed * dt;
        if (len <= step) { this.pos.copy(tp); this.arrived = true; } else this.pos.addScaledVector(d, step / len);
      } else {
        const c = this.look, a = (s.orbit * Math.PI / 180) * dt;
        const x = this.pos.x - c.x, z = this.pos.z - c.z;
        this.pos.x = c.x + x * Math.cos(a) + z * Math.sin(a);
        this.pos.z = c.z - x * Math.sin(a) + z * Math.cos(a);
      }
      this.apply();
    }
    apply() { const c = this.stage.camera; c.position.copy(this.pos); c.lookAt(this.look); }
  }

  /* ================================================================ HUD (BattlePanel NGUI) */

  const BAR = { p1: 'Battle Window/User Health Bar', p2: 'Battle Window/FoeHealth' };

  class Hud {
    constructor(host, kind) {
      this.kit = P1.ngui.build('BattlePanel', host, {});
      this.ui = this.kit.ui;
      this.kind = kind;
      this.hp = { p1: null, p2: null };
      for (const p of ['Progress Bar - Timer', 'BattlePanel/Panel', 'Battle Window/FoeHealth (1)', 'Battle Window/FoeHealth (2)',
        'Battle Window/User Health Bar (1)', 'Battle Window/User Health Bar (2)', 'FoeHealth/Hazard - Enemy',
        'User Health Bar/Hazard - Player', 'Attacks/Mega Button', 'Attacks/Z Moves', 'Attacks/Button - Attack (5)',
        'Attacks/Button - Attack (6)', 'Attacks/Button - Attack (7)', 'Attacks/Button - Attack (8)',
        'User Health Bar/Sprite - Caught (1)', 'Button - Attack/Button - Back']) this.hide(p);
      this.fullW = this.ui.need(BAR.p2 + '/Healthbar').w.size[0];     // 211: FoeHealth lưu thanh đầy, User Health Bar lưu mẫu 53
      this.addExpBar();
      this.setMenu(null);
      this.logLines = [];
      this.all = [];
      this.logAlpha = 0; this.logIdle = 0;
      this.label('Debug Log/Label', '');
      this.setLogAlpha(0);
      if (kind !== 'wild') this.kit.enable('Button - Run', false);
    }
    hide(p) { const n = this.ui.find(p); if (n) n.active = false; }
    node(p) { return this.ui.need(p); }
    label(p, t) { this.kit.label(p, t); }
    refresh() { this.ui.refresh(); }

    /* Thanh EXP: panel gốc không có. (đoán) Nhân bản "Healthbar Old", đổi sprite Bar_PokemonEXP của GUIAtlas. */
    addExpBar() {
      const n = this.kit.add(BAR.p1, BAR.p1 + '/Healthbar Old', 'EXP');
      n.pos = [-121, 18]; n.w.sprite = 'Bar_PokemonEXP'; n.w.color = '#5ab4ffff'; n.w.size = [2, 4]; n.w.depth = 9;
      this.expW = 242;
      this.refresh();
    }
    setExp(ratio) {
      const n = this.ui.need(BAR.p1 + '/EXP');
      n.w.size = [Math.max(2, Math.round(this.expW * Math.max(0, Math.min(1, ratio)))), 4];
      n.drawn = null; this.ui.draw(n);
    }

    setMon(side, mon, hp, maxhp, opt) {
      const b = BAR[side];
      const gender = mon.gender === 'M' ? ' [M]' : mon.gender === 'F' ? ' [F]' : '';
      this.label(b + '/lblPokemonname', (mon.shiny ? '[*]' : '') + P1.mon.name(mon) + gender);
      this.label(b + '/Label - Level', '[Lv]' + mon.level);
      if (side === 'p2') {
        const caught = this.ui.find(b + '/Sprite - Caught');
        caught.active = opt && opt.wild ? !!P1.state.dex.caught[mon.dex] : false;
      }
      this.setHp(side, hp, maxhp);
      this.setStatus(side, mon.status);
      this.refresh();
    }
    setStatus(side, st) {
      const n = this.ui.need(BAR[side] + '/Sprite - Status');
      n.active = !!STATUS_ICON[st];
      if (n.active) n.w.sprite = STATUS_ICON[st];
      n.drawn = null;
      this.refresh();
    }
    /* Độ rộng thanh máu theo ChangeHealth (0x215879): (int)(211·cur/max − 1), kẹp [2, 211]. */
    widthOf(hp, max) { return Math.max(2, Math.min(this.fullW, Math.floor(this.fullW * hp / Math.max(1, max) - 1))); }
    drawHp(side) {
      const h = this.hp[side];
      if (!h) return;
      const bar = this.ui.need(BAR[side] + '/Healthbar'), old = this.ui.need(BAR[side] + '/Healthbar Old');
      bar.w.size = [Math.round(h.w), bar.w.size[1]];
      old.w.size = [Math.round(h.ow), old.w.size[1]];
      // HealthBar.Update: sprite rộng ≤ 4 thì alpha 0. Không có ngưỡng màu: màu nằm sẵn trong sprite Fill_HPBar.
      bar.active = h.w > 4; old.active = h.ow > 4 && h.ow > h.w;
      bar.drawn = null; old.drawn = null;
      this.ui.draw(bar); this.ui.draw(old);
      // Phe mình "cur/max"; phe địch trống khi đấu NPC/hoang dã (chỉ PvP mới hiện %). HP 0 → "FNT".
      const lbl = side === 'p1' ? (h.hp <= 0 && h.w <= 2 ? 'FNT' : Math.round(h.shown) + '/' + h.max) : '';
      const ln = this.ui.need(BAR[side] + '/Label - HP');
      if (ln.w.text !== lbl) { ln.w.text = lbl; ln.drawn = null; this.ui.draw(ln); }
    }
    setHp(side, hp, max) {
      const w = this.widthOf(hp, max);
      this.hp[side] = { hp, max, shown: hp, w, ow: 2 };
      this.drawHp(side);
    }
    /* ChangeHealth: Old = rộng cũ + 1; thanh chính TweenWidth 0.5 s; Old đuổi theo 0.5 s sau 0.75 s (không chờ). */
    async animateHp(side, hp, clock) {
      const h = this.hp[side];
      if (!h) return;
      const to = Math.max(0, Math.min(h.max, hp)), from = h.shown, w0 = h.w, w1 = this.widthOf(to, h.max);
      h.hp = to;
      h.ow = w1 < w0 ? w0 + 1 : 2;
      await clock.tween(TUNE.hpSeconds, (k) => { h.shown = from + (to - from) * k; h.w = w0 + (w1 - w0) * k; this.drawHp(side); });
      if (w1 < w0) {
        const o0 = h.ow;
        clock.wait(TUNE.oldBarDelay).then(() => clock.tween(0.5, (k) => { h.ow = o0 + (w1 - 1 - o0) * k; this.drawHp(side); }))
          .then(() => { h.ow = 2; this.drawHp(side); });
      }
      await clock.wait(TUNE.hpSeconds);
    }

    balls(side, party, show) {
      const grid = this.ui.need(side === 'p1' ? 'User Balls/Grid' : 'Foe Pokes/Grid');
      const kids = grid.kids.slice();
      const order = side === 'p1' ? kids.slice().reverse() : kids;       // TeamBalls bắt đầu từ "Sprite - Ball (12)" (dưới cùng)
      order.forEach((n, i) => {
        const m = party[i];
        n.active = !!(show && m);
        if (m) { n.w.sprite = m.hp > 0 ? 'Icon_Pokemon_Alive' : 'Icon_Pokemon_Dead'; n.w.color = '#ffffffff'; n.drawn = null; }
      });
      this.ui.need(side === 'p1' ? 'Battle Window/User Balls' : 'Battle Window/Foe Pokes').w.color = show ? '#ffffffff' : '#ffffff00';
      this.refresh();
    }

    /* UITextList "Debug Log": thêm dòng, giữ vài dòng cuối; khung hiện khi có chữ rồi mờ dần. */
    log(text) {
      this.all.push(text);
      this.logLines.push(text);
      while (this.logLines.length > TUNE.logLines) this.logLines.shift();
      this.label('Debug Log/Label', this.logLines.join('\n'));
      this.logIdle = 0;
    }
    setLogAlpha(a) {
      this.logAlpha = a;
      const n = this.ui.need('Debug Log');
      const hex = Math.round(a * 255).toString(16).padStart(2, '0');
      n.w.color = '#236c99' + hex;
      n.drawn = null;
      this.ui.draw(n);
      n.kids.forEach((k) => { k.drawn = null; this.ui.draw(k); });
    }
    /* BattleHandler.Update: LogSprite sáng dần 2/s trong 3.5 s sau dòng cuối, rồi tối dần 2/s (dưới 0.1 thì 0). */
    update(dt) {
      if (!this.all.length) return;
      this.logIdle += dt;
      let a = this.logIdle < TUNE.logHold ? Math.min(1, this.logAlpha + dt * 2) : this.logAlpha - dt * 2;
      if (this.logIdle >= TUNE.logHold && a < 0.1) a = 0;
      if (a !== this.logAlpha) this.setLogAlpha(a);
    }

    /* Nút nào hiện theo chế độ menu. */
    setMenu(mode) {
      const show = MENU_LAYOUT[mode] || [];
      for (const p of MENU_NODES) this.ui.need(p).active = show.includes(p);
      if (mode === 'moves' || mode === 'menu') this.ui.need('Attacks').alpha = 1;
      const wins = { party: 'Battle Screen Panel/Battle Pokemon', items: 'Battle Screen Panel/Battle Items', learnTarget: 'Battle Screen Panel/Battle Pokemon' };
      for (const [m, p] of Object.entries(wins)) {
        const n = this.ui.need(p);
        if (m === mode || (mode === 'forced' && m === 'party')) { n.active = true; n.w.color = '#ffffffff'; }
      }
      if (!['party', 'forced', 'learnTarget'].includes(mode)) this.ui.need(wins.party).active = false;
      if (mode !== 'items') this.ui.need(wins.items).active = false;
      this.refresh();
    }
    destroy() { this.kit.destroy(); }
  }

  const MENU_NODES = ['Button - Attack', 'Button - Pokemon', 'Button - Items', 'Button - Run', 'Attacks'];
  const MENU_LAYOUT = {
    menu: ['Button - Attack', 'Button - Pokemon', 'Button - Items', 'Button - Run'],
    moves: ['Attacks', 'Button - Pokemon', 'Button - Items', 'Button - Run'],
    party: ['Button - Attack', 'Button - Pokemon', 'Button - Items', 'Button - Run'],
    items: ['Button - Attack', 'Button - Pokemon', 'Button - Items', 'Button - Run'],
    learnTarget: ['Button - Attack', 'Button - Pokemon', 'Button - Items', 'Button - Run'],
    forced: [],
  };

  /* ================================================================ VFX chiêu thức */

  // Hiệu ứng theo hệ/loại chiêu. Bản gốc chọn NewBattleAnimation theo chiêu, nhưng 51 ô battleAnimations
  // của BattleAnimator chỉ có 9 anim chung → mọi ánh xạ chiêu → atlas dưới đây là (đoán) dựa trên tên nhóm khung.
  const MOVE_FX = {
    byName: [
      [/slash|scratch|cut|claw|fury swipes|razor leaf|leaf blade|night slash|x-scissor|false swipe/i, { atlas: 'fx_normal', prefix: 'slash_', fps: 14 }],
      [/growl|sing|supersonic|roar|screech|uproar|perish song|hyper voice|round|echoed voice|bug buzz/i, { atlas: 'fx_normal', prefix: 'notes_', fps: 10 }],
      [/gust|whirlwind|twister|air cutter|razor wind|defog|tailwind/i, { atlas: 'fx_normal', prefix: 'whirlwind_', fps: 10 }],
      [/smokescreen|sand attack|poison gas|haze|smog|mist|sweet scent/i, { atlas: 'fx_normal', prefix: 'cloud_', fps: 16 }],
      [/leer|glare|scary face|mean look|foresight|odor sleuth/i, { atlas: 'fx_normal', prefix: 'eyes_', fps: 4, loop: 3 }],
      [/fire spin|flame wheel|fire blast|flamethrower|heat wave|inferno|flame charge/i, { atlas: 'fx_fire', prefix: 'firewhirl_', fps: 18 }],
      [/surf|waterfall|muddy water|whirlpool|aqua tail|water pulse/i, { atlas: 'fx_water', prefix: 'wave_', fps: 14 }],
      [/thunder wave|charge|magnet rise|electric terrain/i, { atlas: 'fx_electro', prefix: 'emp_', fps: 16 }],
      [/absorb|mega drain|giga drain|leech seed|leech life|drain/i, { atlas: 'fx_plant', prefix: 'deprive_', fps: 6, loop: 3 }],
      [/string shot|spider web|sticky web|electroweb/i, { atlas: 'fx_bug', prefix: 'chitinthread_', fps: 12 }],
      [/karate chop|low kick|double kick|mach punch|comet punch|mega punch|dizzy punch|drain punch|rock smash|focus punch|brick break/i, { atlas: 'fx_normal', prefix: 'smallfist_', fps: 6, then: { atlas: 'fx_normal', prefix: 'tackle_', fps: 18 } }],
      [/earthquake|magnitude|mud|dig|bulldoze|sand tomb|bone/i, { atlas: 'fx_test', prefix: 'erde_', fps: 12 }],
      [/harden|defense curl|withdraw|iron defense|barrier|acid armor|protect|detect|reflect|light screen/i, { atlas: 'fx_test', prefix: 'shine1_', fps: 18, tint: [0.7, 0.9, 1] }],
    ],
    byType: {
      Normal: { atlas: 'fx_normal', prefix: 'tackle_', fps: 18 },
      Fighting: { atlas: 'fx_normal', prefix: 'tackle_', fps: 18, tint: [1, 0.6, 0.4] },
      Flying: { atlas: 'fx_normal', prefix: 'whirlwind_', fps: 12 },
      Poison: { atlas: 'fx_test', prefix: 'acid_', fps: 14 },
      Ground: { atlas: 'fx_test', prefix: 'erde_', fps: 12 },
      Rock: { atlas: 'fx_rock', prefix: 'rockshatter_', fps: 10 },
      Bug: { atlas: 'fx_bug', prefix: 'chitinthread_', fps: 12 },
      Ghost: { atlas: 'fx_test', prefix: 'willpower_', fps: 10, tint: [0.7, 0.45, 1] },
      Steel: { atlas: 'fx_normal', prefix: 'slash_', fps: 14, tint: [0.8, 0.85, 0.95] },
      Fire: { atlas: 'fx_fire', prefix: 'Fire_', fps: 18 },
      Water: { atlas: 'fx_water', prefix: 'water_', fps: 16 },
      Grass: { atlas: 'fx_plant', prefix: 'blatt_', fps: 10, loop: 2 },
      Electric: { atlas: 'fx_electro', prefix: 'blitz_', fps: 18 },
      Psychic: { atlas: 'fx_test', prefix: 'willpower_', fps: 10 },
      Ice: { atlas: 'fx_test', prefix: 'stuck_', fps: 14 },
      Dragon: { atlas: 'fx_test', prefix: 'shine1_', fps: 18, tint: [0.6, 0.45, 1] },
      Dark: { atlas: 'fx_test', prefix: 'willpower_', fps: 10, tint: [0.45, 0.35, 0.5] },
      Fairy: { atlas: 'fx_test', prefix: 'shine1_', fps: 18, tint: [1, 0.6, 0.85] },
    },
  };
  function moveFx(mv) {
    for (const [re, fx] of MOVE_FX.byName) if (re.test(mv.name)) return fx;
    return MOVE_FX.byType[mv.type] || MOVE_FX.byType.Normal;
  }
  // Hiệu ứng trạng thái (atlas fx_statuseffects).
  const STATUS_FX = {
    par: { atlas: 'fx_statuseffects', prefix: 'paralyze_', fps: 16 },
    slp: { atlas: 'fx_statuseffects', prefix: 'sleep_', fps: 8 },
    frz: { atlas: 'fx_statuseffects', prefix: 'frozen', fps: 14 },
    confusion: { atlas: 'fx_statuseffects', prefix: 'confused_', fps: 6, loop: 3 },
    flinch: { atlas: 'fx_statuseffects', prefix: 'flinch_', fps: 3 },
    brn: { atlas: 'fx_fire', prefix: 'Fire_', fps: 18 },
    psn: { atlas: 'fx_test', prefix: 'acid_', fps: 14 },
    tox: { atlas: 'fx_test', prefix: 'acid_', fps: 14 },
  };

  /* ================================================================ lời thoại trong log (giọng BattlePacketHandler) */

  const Y = (s) => '[ffff00]' + s + '[-]';

  /* ================================================================ cảnh */

  const scene = {
    async enter(args) {
      this.args = args;
      this.clock = makeClock();
      BALL_CLOCK = this.clock;
      BALL_MIXERS.length = 0;
      this.speed = +(P1.query && P1.query.get('bspeed')) || 1;
      this.prevMusic = P1.audio.musicKey();
      const host = document.getElementById('ui');
      this.host = document.createElement('div');
      Object.assign(this.host.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
      host.appendChild(this.host);
      this.stage = new Stage(args.bg || 'grass');
      this.hud = new Hud(this.host, args.kind);
      // WorldMapHandler.Fade: màn đen phủ lúc dựng trận, StartUp cho mờ đi 2/s.
      this.fade = document.createElement('div');
      Object.assign(this.fade.style, { position: 'absolute', inset: '0', background: '#000', pointerEvents: 'none' });
      this.host.appendChild(this.fade);
      this.logAll = this.hud.all;
      this.wireUi();
      this.mode = 'busy';
      this.pick = null;
      this.learnQ = [];
      this.leveled = null;
      this.expGained = 0;
      const me = P1.state.party;
      this.battle = new P1.Battle({
        me: { name: P1.state.player.name, party: me },
        foe: { kind: args.kind, name: args.name || '', party: args.foe, money: args.money },
        ctx: args.ctx,
      });
      const music = args.music || (args.kind === 'trainer' ? (args.gym ? MUSIC.gym : MUSIC.trainer) : MUSIC.wild);
      P1.audio.music(music);
      const preload = [this.stage.load()];
      for (const m of me.concat(args.foe)) if (P1.POKES && P1.POKES[m.dex]) preload.push(P1.gltf(P1.POKES[m.dex].glb).catch(() => null));
      await Promise.all(preload);
      await P1.ngui.ready();
      this.running = this.run().catch((e) => { console.error(e); });
    },

    exit() {
      this.hud.destroy();
      if (this.learnUi) this.learnUi.destroy();
      if (this.endUi) this.endUi.destroy();
      this.host.remove();
      this.stage.dispose();
      if (this.prevMusic) P1.audio.music(this.prevMusic);
    },

    update(dt) {
      dt *= this.speed;
      this.clock.tick(dt);
      this.stage.update(dt);
      for (const m of BALL_MIXERS) if (m) m.update(dt);
      this.hud.update(dt);
      this.keys();
    },

    render() {
      const r = P1.renderer(), c = this.stage.camera, el = r.domElement;
      const aspect = el.clientWidth / Math.max(1, el.clientHeight);
      if (Math.abs(c.aspect - aspect) > 1e-3) { c.aspect = aspect; c.updateProjectionMatrix(); }
      r.render(this.stage.scene, c);
    },

    /* ------------------------------------------------ vòng trận */

    /*
     * BattleHandler.StartUp → Setup → SpawnPokes: màn đen mờ đi (2/s), từng con phe mình rồi phe địch
     * TweenScale 0.5 s + cry + wait 0.5; wait 0.5; thanh máu bay vào (anim 4 Fly In Left / 3 Fly In Right).
     * Máy ảnh: Start → Idle2, Setup → Default, hết SpawnPokes → Idle2; cuối mỗi lượt → Idle2.
     */
    async run() {
      const b = this.battle;
      this.hud.balls('p1', P1.state.party, true);
      this.hud.balls('p2', this.args.foe, this.args.kind !== 'wild');
      this.stage.cam.set('Idle2');
      this.intro = true;
      await this.play(b.begin());
      this.intro = false;
      await this.clock.tween(0.5, (k) => { this.fade.style.opacity = String(1 - k); });
      this.fade.style.display = 'none';
      this.stage.cam.set('Default');
      for (const side of ['p1', 'p2']) {
        const slot = this.stage.slots[side];
        if (!slot.mon) continue;
        this.clock.tween(0.5, (k) => slot.root.scale.setScalar(k));
        if (slot.mon.shiny) { P1.audio.sfx('gen_4_shiny_edit2'); await this.wait(0.65); }
        P1.audio.cry(slot.mon.dex);
        await this.wait(0.5);
      }
      await this.wait(0.5);
      this.playAnim(ANIM.flyInLeft, { bar: BAR.p1 });
      this.playAnim(ANIM.flyInRight, { bar: BAR.p2 });
      await this.wait(0.2 + 0.3);
      this.stage.cam.set('Idle2');
      while (!b.result) {
        const req = b.request();
        if (!req) break;
        const action = req.kind === 'switch' ? await this.choose('forced') : await this.choose('menu', req);
        this.setMode('busy');
        await this.play(b.act(action));
        if (!b.result) this.stage.cam.set('Idle2');
      }
      await this.finish();
    },

    async play(events) {
      for (let i = 0; i < events.length; i++) {
        const e = events[i];
        const f = DIRECTOR[e.cmd];
        if (f) await f.call(this, e, events, i);
      }
    },

    wait(s) { return this.clock.wait(s); },
    slotOf(ident) { const w = this.battle.who(ident); return w ? this.stage.slots[w.side] : null; },
    nameOf(ident) {
      const w = this.battle.who(ident);
      if (!w) return '?';
      return '[' + NAME_COLOUR + ']' + P1.mon.name(w.mon) + '[-]';
    },
    trainerName() { return '[ff6666]' + P1.state.player.name + '[-]'; },     // tên người chơi: '[ff6666]User[-]'
    async say(text, pause) { this.hud.log(text); await this.wait(pause == null ? TUNE.textPause : pause); },
    maxHp(ident) { const w = this.battle.who(ident); return w ? this.battle.simMon(w.side, w.index).maxhp : 1; },

    /* ------------------------------------------------ NewBattleAnimation: bộ chạy bước */

    async playAnim(id, ctx) {
      const anim = (DATA().anims || [])[id];
      const steps = anim ? anim.attack : [];
      for (const st of steps) {
        const run = STEP[st.type];
        const p = run ? run.call(this, st, ctx) : null;
        if (st.delay) await this.wait(st.delay);
        else if (p && p.then) await p;
      }
    },
    targetOf(name, ctx) {
      const map = { Target: ctx.target, Source: ctx.source, TargetBar: ctx.targetBar, SourceBar: ctx.sourceBar };
      return map[name] || ctx.target;
    },
    spriteAt(slot, fx, offset) {
      if (!fx || !fx.atlas) return Promise.resolve();
      const h = P1.fx.sprite({ atlas: fx.atlas, prefix: fx.prefix, fps: fx.fps || 12, loop: false, reversed: fx.reversed,
        keepLastFrame: fx.keepLastFrame, pxToM: TUNE.fxPxToM, color: fx.tint ? fx.tint.concat(1) : fx.color });
      h.obj.position.copy(slot.anchor);
      if (offset) h.obj.position.add(offset);
      this.stage.addFx(h);
      let p = h.done;
      const times = fx.loop || 1;
      for (let i = 1; i < times; i++) p = p.then(() => this.spriteAt(slot, Object.assign({}, fx, { loop: 1, then: null }), offset));
      if (fx.then) p = p.then(() => this.spriteAt(slot, fx.then, offset));
      return p;
    },

    /* ------------------------------------------------ chọn hành động */

    setMode(m) {
      this.mode = m;
      const menu = m === 'busy' || m === 'learn' || m === 'end' ? null : m;
      this.hud.setMenu(menu);
      if (m !== 'moves') this.moveTip(null);
      if (m === 'moves') this.fillMoves();
      if (m === 'party' || m === 'forced' || m === 'learnTarget') this.fillParty();
      if (m === 'items') this.fillItems();
    },
    choose(mode, req) {
      this.req = req || this.req;
      return new Promise((res) => { this.pick = (a) => { this.pick = null; res(a); }; this.setMode(mode); });
    },
    send(action) { if (this.pick) { P1.audio.sfx('notify', { volume: 0.4 }); this.pick(action); } },

    fillMoves() {
      const b = this.battle, act = b.active('p1'), sim = b.simMon('p1', act.index);
      for (let k = 0; k < 4; k++) {
        const path = 'Attacks/Attacks/Button - Attack ' + (k + 1);
        const slot = act.mon.moves[k], ms = sim.moveSlots[k];
        const n = this.hud.node(path);
        n.active = !!slot;
        if (!slot) continue;
        const mv = P1.Dex.moves.get(slot.id);
        this.hud.label(path + '/Label - Attack Name', mv.name);
        this.hud.label(path + '/Label - PP', (ms ? ms.pp : slot.pp) + '/' + slot.ppMax);
        n.moveId = mv.id;
        const r = this.req && this.req.moves && this.req.moves[k];
        this.hud.kit.enable(path, !(r && (r.disabled || r.pp === 0)) && !(ms && ms.pp === 0));
      }
      this.hud.refresh();
    },

    fillParty() {
      const b = this.battle, cur = b.active('p1');
      const grid = this.hud.node('Battle Pokemon/Content/Grid');
      grid.kids.forEach((n, i) => {
        const m = P1.state.party[i];
        n.active = !!m;
        if (!m) return;
        const sim = b.order.includes(i) ? b.simMon('p1', i) : null;
        const hp = sim ? sim.hp : m.hp, max = sim ? sim.maxhp : P1.mon.stats(m).hp;
        const gender = m.gender === 'M' ? ' [M]' : m.gender === 'F' ? ' [F]' : '';
        this.hud.label(n.path + '/Content/Label - Name', (cur && cur.index === i ? '[53ff1a]' : '') + P1.mon.name(m) + gender + (cur && cur.index === i ? '[-]' : ''));
        this.hud.label(n.path + '/Content/Label - Level', '[Lv]' + m.level);
        this.hud.label(n.path + '/Content/Label - Health', hp + '/' + max);
        const bar = this.hud.node(n.path + '/Content/Sprite - Health Back/Sprite - Health');
        if (bar.fullW === undefined) bar.fullW = bar.w.size[0];
        const r = max ? hp / max : 0;
        bar.w.size = [Math.max(2, Math.round(bar.fullW * r)), bar.w.size[1]];
        bar.w.sprite = r > 0.5 ? 'Battle_bar_hp_fill' : r > 0.2 ? 'Battle_bar_hp_fill_yellol' : 'Battle_bar_hp_low';
        bar.active = hp > 0;
        const st = this.hud.node(n.path + '/Content/Sprite - Status');
        const s = hp <= 0 ? 'fnt' : (sim ? sim.status : m.status);
        st.active = !!(SWITCH_STATUS[s] || s === 'fnt');
        if (st.active) st.w.sprite = s === 'fnt' ? 'Icon_Status_Fainted' : SWITCH_STATUS[s];
        this.hud.kit.enable(n.path, hp > 0 && !(cur && cur.index === i && this.mode !== 'learnTarget'));
      });
      this.hud.refresh();
    },

    bagItems() {
      const bag = P1.state.bag || {};
      const byId = {};
      for (const it of Object.values(P1.ITEMS || {})) byId[BAG_ALIAS[it.battleId] || it.battleId] = byId[BAG_ALIAS[it.battleId] || it.battleId] || it;
      const out = [];
      for (const [key, qty] of Object.entries(bag)) {
        if (!(qty > 0)) continue;
        const it = byId[key];
        const tab = P1.BALLS[key] ? 'Pokeball' : P1.ITEM_EFFECT[key] ? (/berry$/.test(key) ? 'Berries' : 'Medicine') : null;
        if (!tab) continue;
        out.push({ key, qty, tab, name: it ? it.name : key, img: it && it.img });
      }
      return out;
    },
    fillItems() {
      const ui = this.hud;
      if (!this.itemTab) this.itemTab = this.args.kind === 'wild' ? 'Pokeball' : 'Medicine';
      const grid = ui.node('Panel - Inventory Items/Grid');
      for (const k of grid.kids.slice()) ui.kit.remove(k);
      const list = this.bagItems().filter((x) => x.tab === this.itemTab);
      list.forEach((x, i) => {
        const n = ui.kit.add('Panel - Inventory Items/Grid', 'prefab:Inventory Item', 'item_' + x.key);
        ui.label(n.path + '/Label - Name', x.name);
        ui.label(n.path + '/Label - QTY', 'x' + x.qty);
        if (x.img) ui.kit.texture(n.path + '/Sprite/Texture - Icon', x.img);
        ui.kit.on(n.path, () => this.useItem(x));
        n.item = x;
      });
      for (const t of ['General', 'Pokeball', 'Medicine', 'TM', 'Berries', 'Hold']) {
        ui.kit.color('Battle Items/Sprite - Window/Tab - ' + t, t === this.itemTab ? '#ffffffff' : '#9a9a9aff');
      }
      ui.refresh();
    },
    useItem(x) {
      if (this.mode !== 'items') return;
      if (x.tab === 'Pokeball') {
        if (this.args.kind !== 'wild') { this.hud.log("You can't catch another Trainer's Pokémon!"); return; }
        this.consume(x.key);
        this.send({ type: 'ball', ball: x.key });
        return;
      }
      this.pendingItem = x;
      this.setMode('learnTarget');
    },
    consume(key) { P1.state.bag[key] = Math.max(0, (P1.state.bag[key] || 0) - 1); },

    wireUi() {
      const k = this.hud.kit;
      k.on('Button - Attack', () => { if (this.pick && this.mode === 'menu') this.setMode('moves'); });
      k.on('Button - Pokemon', () => { if (this.pick && !['forced', 'learnTarget'].includes(this.mode)) this.setMode(this.mode === 'party' ? 'menu' : 'party'); });
      k.on('Button - Items', () => { if (this.pick && !['forced'].includes(this.mode)) this.setMode(this.mode === 'items' ? 'menu' : 'items'); });
      k.on('Button - Run', () => { if (this.pick && this.args.kind === 'wild') this.send({ type: 'run' }); });
      k.on('Attacks/No Button', () => { if (this.mode === 'moves') this.setMode('menu'); });
      for (let i = 1; i <= 4; i++) {
        const n = k.on('Attacks/Attacks/Button - Attack ' + i, (b) => { if (this.mode === 'moves' && b.state !== 'disabled') this.send({ type: 'move', slot: i }); });
        // AttackButton.OnHover → BattleMoveDescription ("UIWidget - Mouse Over Move"): hệ tô theo TypeColours.
        n.el.addEventListener('pointerenter', (ev) => { if (ev.pointerType !== 'touch' && this.mode === 'moves') this.moveTip(n.moveId); });
        n.el.addEventListener('pointerleave', () => this.moveTip(null));
      }
      const grid = this.hud.node('Battle Pokemon/Content/Grid');
      grid.kids.forEach((n, i) => k.on(n.path, () => this.pickParty(i)));
      for (const t of ['General', 'Pokeball', 'Medicine', 'TM', 'Berries', 'Hold']) {
        k.on('Battle Items/Sprite - Window/Tab - ' + t, () => { this.itemTab = t; if (this.mode === 'items') this.fillItems(); });
      }
    },
    moveTip(id) {
      const T = 'Attacks/UIWidget - Mouse Over Move';
      const tip = this.hud.node(T);
      if (!id) { tip.w.color = '#ffffff00'; this.hud.refresh(); return; }
      const mv = P1.Dex.moves.get(id);
      this.hud.label(T + '/Label - Movename', mv.name);
      this.hud.label(T + '/Sprite - Type/lblType', mv.type);
      this.hud.kit.color(T + '/Sprite - Type', TYPE_COLOUR()[TYPES.indexOf(mv.type)] || '#ffffffff');
      const cat = this.hud.node(T + '/Sprite - Move Type');
      cat.active = mv.category !== 'Status';
      if (cat.active) cat.w.sprite = mv.category === 'Physical' ? 'physical' : 'special';
      this.hud.label(T + '/Label - Stats', 'Base Power: ' + (mv.basePower || '-') + '\nAccuracy: ' + (mv.accuracy === true ? '-' : mv.accuracy));
      this.hud.label(T + '/Label - Description', (P1.MOVE_DESC && P1.MOVE_DESC[mv.id]) || mv.shortDesc || '');
      tip.w.color = '#ffffffff';
      this.hud.refresh();
    },
    pickParty(i) {
      const n = this.hud.node('Battle Pokemon/Content/Grid').kids[i];
      if (!this.pick || n.state === 'disabled') return;
      if (this.mode === 'learnTarget') {
        const x = this.pendingItem;
        this.consume(x.key);
        this.send({ type: 'item', item: x.key, index: i });
      } else if (this.mode === 'party' || this.mode === 'forced') this.send({ type: 'switch', index: i });
    },

    /* Phím: bảng theo chế độ. Space/Enter xác nhận, Esc/Backspace lùi, 1–4 chọn chiêu. */
    keys() {
      const inp = P1.input, keysFor = KEYS[this.mode];
      if (!keysFor || (!this.pick && this.mode !== 'learn')) { inp.clear(); return; }
      for (const a of ['a', 'b', 'menu', '1', '2', '3', '4']) {
        if (!inp.take(a)) continue;
        const k = KEYS[this.mode];
        if (k && k[a] && (this.pick || this.mode === 'learn')) k[a].call(this);
      }
    },

    /* ------------------------------------------------ EXP, lên cấp, học chiêu */

    async awardExp(foeMon) {
      const gains = this.battle.expFor(foeMon);
      for (const g of gains) {
        const m = P1.state.party[g.index];
        if (!m || m.level >= 100) continue;
        const active = this.battle.active('p1');
        const isActive = active && active.index === g.index;
        await this.say(nameOf(m, 'p1') + ' gained ' + g.exp + ' EXP!', 0.2);
        this.expGained += g.exp;
        if (isActive) this.floatExp(g.exp);
        const lv0 = m.level, exp0 = m.exp;
        const ev = P1.mon.gainExp(m, g.exp);
        P1.mon.addEvs(m, g.evs || {});
        if (isActive) await this.fillExp(m, lv0, exp0);
        for (const e of ev) {
          if (e.type === 'level') {
            this.battle.applyLevel(g.index);
            P1.audio.sfx('level_up');
            if (isActive) {
              const sim = this.battle.simMon('p1', g.index);
              this.hud.label(BAR.p1 + '/Label - Level', '[Lv]' + e.level);
              this.hud.setHp('p1', sim.hp, sim.maxhp);
              this.hud.drawHp('p1');
              this.spriteAt(this.stage.slots.p1, { atlas: 'fx_test', prefix: 'shine1_', fps: 20, tint: [1, 0.95, 0.6] });
            }
            await this.say(nameOf(m, 'p1') + ' grew to level ' + e.level + '!', 1.2);
          } else if (e.type === 'learn') await this.learnMove(m, e.move);
        }
        if (isActive) this.hud.setExp(expRatio(m));
      }
    },
    floatExp(n) {
      const ui = this.hud;
      const node = ui.kit.add(BAR.p1, 'prefab:EXP Gain', 'EXP Gain ' + (this.clock.t | 0));
      ui.label(node.path, '+' + n + ' EXP');
      const spr = ui.ui.find(node.path + '/Sprite'); if (spr) spr.active = false;
      const x0 = node.pos[0];
      this.clock.tween(0.75, (k) => {
        node.pos[0] = x0 - 30 * k;
        node.w.color = '#ffffff' + Math.round((1 - k) * 255).toString(16).padStart(2, '0');
        node.drawn = null; ui.refresh();
      }).then(() => ui.kit.remove(node));
    },
    async fillExp(m, lv0, exp0) {
      let lv = lv0, e = exp0;
      while (lv < m.level) {
        const a = expRatioAt(m.dex, lv, e);
        await this.clock.tween(0.5 * (1 - a), (k) => this.hud.setExp(a + (1 - a) * k));
        lv++; e = P1.mon.expAt(m.dex, lv);
        this.hud.setExp(0);
      }
      const a = expRatioAt(m.dex, lv, e), b = expRatio(m);
      await this.clock.tween(0.5 * Math.max(0.1, b - a), (k) => this.hud.setExp(a + (b - a) * k));
    },
    async learnMove(m, moveId) {
      const mv = P1.Dex.moves.get(moveId);
      if (m.moves.length < 4) {
        P1.mon.learn(m, moveId);
        P1.audio.sfx('tm', { volume: 0.6 });
        await this.say(nameOf(m, 'p1') + ' learned ' + Y(mv.name) + '!', 1);
        return;
      }
      const choice = await this.learnPrompt(m, mv);
      if (choice == null) { await this.say(nameOf(m, 'p1') + ' did not learn ' + Y(mv.name) + '.', 0.8); return; }
      const old = P1.Dex.moves.get(m.moves[choice].id).name;
      P1.mon.learn(m, moveId, choice);
      P1.audio.sfx('tm', { volume: 0.6 });
      await this.say(nameOf(m, 'p1') + ' forgot ' + Y(old) + ' and learned ' + Y(mv.name) + '!', 1);
    },
    /* "Panel - Learn Move" (LearnHandler): 4 nút quên chiêu + "Do not learn this move". */
    learnPrompt(m, mv) {
      if (!this.learnUi) {
        this.learnUi = P1.ngui.build('Widget - Hidden During Battle Or Script', this.host, {});
        this.learnUi.show('Panel - Learn Evolution', false);
      }
      const ui = this.learnUi;
      const W = 'Panel - Learn Move/Sprite - Window';
      ui.show('Panel - Learn Move', true);
      ui.ui.need('Panel - Learn Move').alpha = 1;
      ui.label(W + '/Label - Learning', '[FF9900]' + P1.mon.name(m) + '[-] is trying to learn [FF9900]' + mv.name + '[-], Should it forget another move to learn it?');
      ui.label(W + '/Sprite - Info Background/Label - Title PP', '[FF9900]' + mv.name + '[-]\nPP ' + mv.pp);
      ui.label(W + '/Sprite - Info Background/Label - Accuracy', mv.accuracy === true ? '-' : mv.accuracy + '%');
      ui.label(W + '/Sprite - Info Background/Label - Power', mv.basePower ? String(mv.basePower) : '-');
      ui.label(W + '/Sprite - Info Background/Label - Description', (P1.MOVE_DESC && P1.MOVE_DESC[mv.id]) || mv.shortDesc || mv.desc || '');
      ui.sprite(W + '/Sprite - Info Background/Sprite - Type', mv.type.toLowerCase());
      ui.sprite(W + '/Sprite - Info Background/Sprite - Damage Type', mv.category === 'Physical' ? 'physical' : 'special');
      ui.ui.need(W + '/Sprite - Info Background/Sprite - Damage Type').active = mv.category !== 'Status';
      ui.texture(W + '/Sprite - Platform/Texture - Pokemon', 'art/sprite/poke/big/' + m.dex + '.png');
      ui.show(W + '/Widget - Mouse Over Description', false);
      const btns = ['Button - Learn Move', 'Button - Learn Move (1)', 'Button - Learn Move (2)', 'Button - Learn Move (3)'];
      btns.forEach((b, i) => ui.label(W + '/' + b + '/Label', 'Forget ' + P1.Dex.moves.get(m.moves[i].id).name));
      this.setMode('learn');
      return new Promise((res) => {
        const done = (v) => { this.learnDone = null; ui.show('Panel - Learn Move', false); this.setMode('busy'); res(v); };
        this.learnDone = done;
        if (!this.learnWired) {
          this.learnWired = true;
          btns.forEach((b, i) => ui.on(W + '/' + b, () => this.learnDone && this.learnDone(i)));
          ui.on(W + '/Button - Dont Learn', () => this.learnDone && this.learnDone(null));
        }
      });
    },

    /* ------------------------------------------------ kết thúc */

    async finish() {
      const b = this.battle, res = b.result;
      const out = { outcome: res === 'tie' ? 'lose' : res };
      if (res === 'win' && this.args.kind === 'trainer') {
        const top = Math.max(...this.args.foe.map((m) => m.level));
        const money = this.args.money != null ? this.args.money : top * 24;   // (đoán) chưa có công thức gốc
        P1.state.money += money;
        out.money = money;
        P1.audio.sfx('badge', { volume: 0.5 });
        await this.say('You got [PD]' + money + ' for winning!', 1.2);
      }
      if (res === 'win') await this.say(this.trainerName() + "'s team won the battle!", TUNE.textPause);
      if (res === 'lose') await this.say("Enemy's team won the Battle!", 1.5);
      if (res === 'caught') {
        const m = b.caught;
        m.ot = P1.state.player.name; m.metAt = this.args.where || ''; m.metLevel = m.level;
        P1.caught(m.dex);
        if (P1.state.party.length < 6) P1.state.party.push(m); else P1.state.box.push(m);
        out.caught = m;
        if (P1.state.party.indexOf(m) < 0) await this.say(nameOf(m, 'p2') + ' was sent to the PC.', 1);
      }
      out.exp = this.expGained;
      out.evolve = P1.state.party.map((m, i) => ({ index: i, dex: P1.mon.evolution(m) })).filter((x) => x.dex && this.leveled && this.leveled.has(x.index));
      this.setMode('end');
      await this.wait(0.6);
      if (typeof this.args.onEnd === 'function') {
        P1.fx.flash(this.host, '#000', 0.6);
        await this.wait(0.3);
        this.args.onEnd(out);
        return;
      }
      this.result = out;
      this.showRestart(out);
    },
    showRestart(out) {
      const ui = this.endUi = P1.ngui.build('Widget - Hidden During Battle Or Script', this.host, {});
      ui.show('Panel - Learn Move', false);
      ui.show('Panel - Learn Evolution', true);
      ui.ui.need('Panel - Learn Evolution').alpha = 1;
      const W = 'Panel - Learn Evolution/Sprite - Window';
      const text = { win: 'You won the battle!', lose: 'You lost the battle.', caught: 'You caught ' + (out.caught ? P1.mon.name(out.caught) : '') + '!', ran: 'You got away safely!' }[out.outcome] || out.outcome;
      ui.label(W + '/Label - Evolving', '[FF9900]' + text + '[-]\nBattle again?');
      ui.label(W + '/Sprite - Info Background/Button - Yes/Label', 'Again');
      ui.label(W + '/Sprite - Info Background/Button - No/Label', 'Close');
      const lead = this.stage.slots.p1.mon || P1.state.party[0];
      ui.texture(W + '/Sprite - Platform/Texture - Pokemon', 'art/sprite/poke/big/' + lead.dex + '.png');
      ui.on(W + '/Sprite - Info Background/Button - Yes', () => this.restart());
      ui.on(W + '/Sprite - Info Background/Button - No', () => ui.show('Panel - Learn Evolution', false));
    },
    restart() {
      for (const m of P1.state.party) P1.mon.heal(m);
      const foe = this.args.foe.map((m) => P1.mon.create(m.dex, m.level, { ot: 'Debug' }));
      P1.scene.go('battle', Object.assign({}, this.args, { foe }));
    },
  };

  const nameOf = (m) => '[' + NAME_COLOUR + ']' + P1.mon.name(m) + '[-]';
  const expRatioAt = (dex, lv, exp) => {
    if (lv >= 100) return 1;
    const a = P1.mon.expAt(dex, lv), b = P1.mon.expAt(dex, lv + 1);
    return Math.max(0, Math.min(1, (exp - a) / Math.max(1, b - a)));
  };
  const expRatio = (m) => expRatioAt(m.dex, m.level, m.exp);

  /* Phím theo chế độ. */
  const KEYS = {
    menu: { a() { this.setMode('moves'); }, '1'() { this.setMode('moves'); } },
    moves: {
      b() { this.setMode('menu'); }, menu() { this.setMode('menu'); },
      '1'() { this.keyMove(1); }, '2'() { this.keyMove(2); }, '3'() { this.keyMove(3); }, '4'() { this.keyMove(4); },
      a() { this.keyMove(1); },
    },
    party: { b() { this.setMode('menu'); }, menu() { this.setMode('menu'); } },
    items: { b() { this.setMode('menu'); }, menu() { this.setMode('menu'); } },
    learnTarget: { b() { this.setMode('items'); }, menu() { this.setMode('items'); } },
    learn: { b() { if (this.learnDone) this.learnDone(null); }, menu() { if (this.learnDone) this.learnDone(null); } },
    forced: {},
  };
  scene.keyMove = function (i) {
    const n = this.hud.ui.find('Attacks/Attacks/Button - Attack ' + i);
    if (n && n.active && n.state !== 'disabled') this.send({ type: 'move', slot: i });
  };

  /* ================================================================ bước của NewBattleAnimation */

  const STEP = {
    Wait() {},
    SpriteAnimation(st, ctx) {
      const slot = this.targetOf(st.target, ctx);
      if (!slot || !slot.root) return null;
      const off = st.pos ? new THREE.Vector3(-st.pos[0], st.pos[1], st.pos[2]) : null;
      if (off && ctx.target && slot.side === 'p2' && st.reverseZonEnemies) off.z = -off.z;
      return this.spriteAt(slot, { atlas: st.atlas, prefix: st.prefix, fps: st.fps, reversed: st.reversed, keepLastFrame: st.keepLastFrame, color: st.color }, off);
    },
    TweenColor(st, ctx) {
      const slot = this.targetOf(st.target, ctx);
      if (!slot || !slot.setAlpha) return null;
      const a = st.color || [1, 1, 1, 0], b = st.color2 || [1, 1, 1, 1];
      return this.clock.tween(st.duration || 0.5, (k) => {
        slot.setAlpha(a[3] + (b[3] - a[3]) * k);
        slot.setTint([0, 1, 2].map((j) => a[j] + (b[j] - a[j]) * k));
      });
    },
    TweenPosition(st, ctx) {
      const bar = ctx.bar;
      if (!bar) return null;
      const dx = st.pos ? st.pos[0] : 0;
      return this.clock.tween(st.duration || 0.3, (k) => this.hud.kit.offset(bar, dx * ease(k), 0));
    },
    Shake(st, ctx) {
      const slot = this.targetOf(st.target, ctx);
      if (!slot || !slot.root) return null;
      const amp = 0.12, dur = st.duration || 0.4;
      return this.clock.tween(dur, (k) => { slot.root.position.x = slot.home.x + Math.sin(k * Math.PI * 8) * amp * (1 - k); });
    },
    ChangeBattleCamera(st) { this.stage.cam.set(st.camera || 'Default'); },
    SoundEffect(st) { if (st.audio) P1.audio.sfx(String(st.audio).toLowerCase().replace(/ /g, '_')); },
  };

  /* ================================================================ DIRECTOR: sự kiện Showdown → trình diễn */

  function parseHp(s) {
    const m = /^(\d+)(?:\/(\d+))?/.exec(s || '');
    return m ? { hp: +m[1], max: m[2] ? +m[2] : null } : { hp: 0, max: null };
  }

  const DIRECTOR = {
    /*
     * Thả Pokémon giữa trận: BattleHandler.SendOutPokemon. Rút về = TweenScale 0 trong 0.5 s + wait 1.0;
     * thả ra = (Rotate) máy ảnh bám con đó, wait 0.2, TweenScale 0.5 s, cry, clip "1", wait 0.5, camera Default.
     * Log gốc không ghi dòng nào khi đổi Pokémon.
     */
    async switch(e) {
      const w = this.battle.who(e.args[0]);
      const slot = this.stage.slots[w.side];
      if (slot.mon) {
        const s0 = slot.root.scale.x;
        await this.clock.tween(0.5, (k) => slot.root.scale.setScalar(s0 * (1 - k)));
        await this.wait(1.0);
      }
      await slot.load(w.mon);
      const hp = parseHp(e.args[2]);
      this.hud.setMon(w.side, w.mon, hp.hp, hp.max || this.maxHp(e.args[0]), { wild: this.args.kind === 'wild' });
      if (w.side === 'p1') this.hud.setExp(expRatio(w.mon));
      if (w.side === 'p2') P1.seen(w.mon.dex);
      slot.root.scale.setScalar(0);
      if (this.intro) return;     // mở màn: StartUp diễn riêng
      this.stage.cam.focus(slot);
      await this.wait(0.2);
      this.clock.tween(0.5, (k) => slot.root.scale.setScalar(k));
      if (w.mon.shiny) { P1.audio.sfx('gen_4_shiny_edit2'); await this.wait(0.65); }
      P1.audio.cry(w.mon.dex);
      await slot.play('roar').done;
      await this.wait(0.5);
      this.stage.cam.set('Default');
      this.stage.cam.release();
    },
    async drag(e) { return DIRECTOR.switch.call(this, e); },
    async replace(e) { return DIRECTOR.switch.call(this, e); },

    /* "X used [ffff00]Move[-]!" (logText nhanh), rồi PlayAttackAnimation: clip "8" vật lý / "9" đặc biệt / "13" trạng thái, wait 1.0. */
    async move(e) {
      const src = this.slotOf(e.args[0]), tgt = this.slotOf(e.args[2]) || (src === this.stage.slots.p1 ? this.stage.slots.p2 : this.stage.slots.p1);
      const mv = P1.Dex.moves.get(e.args[1]);
      await this.say(this.nameOf(e.args[0]) + ' used ' + Y(mv.name) + '!', TUNE.textFast);
      if (e.kw.still || e.kw.notarget) return;
      const role = mv.category === 'Physical' ? 'attack' : mv.category === 'Special' ? 'special'
        : (src.clips.hit2 && src.clips.hit2 !== src.clips.hit ? 'hit' : 'special2');
      src.play(role);
      await this.wait(1.0);
      const selfTarget = mv.target === 'self' || mv.target === 'allySide' || mv.target === 'adjacentAllyOrSelf';
      this.lastMove = { mv, on: selfTarget ? src : tgt };
      // Chiêu không gây sát thương: bản gốc không diễn gì thêm. Bản web chiếu hoạt ảnh atlas lên mục tiêu (đoán).
      if (mv.category === 'Status' && !e.kw.miss) await Promise.race([this.spriteAt(this.lastMove.on, moveFx(mv)), this.wait(0.9)]);
    },

    async '-supereffective'() { this.eff = 'super'; await this.say("It's super effective!", TUNE.textFast); },
    async '-resisted'() { this.eff = 'weak'; await this.say("It's not very effective.", TUNE.textFast); },
    async '-crit'() { await this.say('A critical hit!', TUNE.textFast); },
    async '-immune'(e) { await this.say("It doesn't affect " + this.nameOf(e.args[0]) + '!'); },
    async '-miss'(e) { await this.say(this.nameOf(e.args[0]) + "'s attack missed!"); },
    async '-fail'() { await this.say('But it failed!'); },
    async '-ohko'() { await this.say("It's a one-hit KO!"); },
    async '-hitcount'(e) { await this.say('Hit ' + e.args[1] + (e.args[1] === '1' ? ' time!' : ' times!'), TUNE.textFast); },

    /*
     * Trúng đòn: tiếng theo hiệu quả (Attack_Hit_Super_Effective / _Weak_Not_Very_Effective / _Damage),
     * PlayAttackEffect = clip "14" + prefab "Default Hit" ở xương Head, chờ hết clip, rồi ChangeHealth.
     */
    async '-damage'(e, list, i) {
      const w = this.battle.who(e.args[0]);
      const slot = this.stage.slots[w.side];
      const hp = parseHp(e.args[1]);
      const from = e.kw.from || '';
      if (!from) {
        const near = list.slice(Math.max(0, i - 3), i + 3).filter((x) => x.args[0] === e.args[0]).map((x) => x.cmd);
        const eff = near.includes('-supereffective') ? 'super' : near.includes('-resisted') ? 'weak' : this.eff;
        P1.audio.sfx(eff === 'super' ? 'attack_hit_super_effective' : eff === 'weak' ? 'attack_hit_weak_not_very_effective' : 'attack_hit_damage');
        this.eff = null;
        const clip = slot.play('hit2');
        const hit = DATA().hit;
        if (hit && hit.particles) this.stage.addFx(P1.fx.group(hit.particles, { origin: slot.head(), scale: hit.scale || 1, pxScale: this.stage.pxScale(P1.renderer()) }));
        if (this.lastMove && this.lastMove.on === slot) this.spriteAt(slot, moveFx(this.lastMove.mv));   // (đoán) VFX atlas theo hệ chiêu
        if (P1.settings.battleFlash) this.blink(slot);
        await this.wait(clip.duration || 1.0);
      } else {
        const t = DAMAGE_FROM[from.replace(/^(item|ability|move): /, '').toLowerCase()];
        await this.say(this.nameOf(e.args[0]) + (t || ' is hurt!'), TUNE.textFast);
      }
      await this.hud.animateHp(w.side, hp.hp, this.clock);
    },
    async '-heal'(e) {
      const w = this.battle.who(e.args[0]);
      P1.audio.sfx('attack_heal_refresh', { volume: 0.7 });
      this.spriteAt(this.stage.slots[w.side], { atlas: 'fx_test', prefix: 'shine1_', fps: 20, tint: [0.6, 1, 0.6] });
      await this.hud.animateHp(w.side, parseHp(e.args[1]).hp, this.clock);
      const from = (e.kw.from || '').toLowerCase();
      if (from.includes('drain')) await this.say(this.nameOf(e.kw.of || e.args[0]) + ' had its energy drained!');
      else await this.say(this.nameOf(e.args[0]) + (from.startsWith('item') ? ' restored its HP.' : ' restored its HP!'));
    },
    async '-sethp'(e) { const w = this.battle.who(e.args[0]); await this.hud.animateHp(w.side, parseHp(e.args[1]).hp, this.clock); },
    async '-revive'(e) { const w = this.battle.who(e.args[0]); await this.say(nameOf(w.mon) + ' was revived!'); },

    /* "X fainted!" (nhanh), ChangeHealth 0, PlayAnimation(5): clip "17" + anim 5 (Wait 0.4) + Faint_No_Health_Left + wait 0.4. Không có cry. */
    async faint(e) {
      const w = this.battle.who(e.args[0]);
      const slot = this.stage.slots[w.side];
      await this.say(this.nameOf(e.args[0]) + ' fainted!', TUNE.textFast);
      if (this.hud.hp[w.side] && this.hud.hp[w.side].hp > 0) await this.hud.animateHp(w.side, 0, this.clock);
      slot.play('faint', { hold: true });
      await this.playAnim(ANIM.faint, { target: slot });
      P1.audio.sfx('faint_no_health_left');
      await this.wait(0.4);
      this.hud.setStatus(w.side, 'fnt');
      this.hud.balls(w.side, w.side === 'p1' ? P1.state.party.map((m, i) => this.battle.order.includes(i) ? Object.assign({}, m, { hp: this.battle.simMon('p1', i).hp }) : m) : this.args.foe.map((m, i) => Object.assign({}, m, { hp: this.battle.simMon('p2', i).hp })), w.side === 'p1' || this.args.kind !== 'wild');
      if (w.side === 'p2' && this.battle.active('p1')) {
        this.leveled = this.leveled || new Set();
        const before = P1.state.party.map((m) => m.level);
        await this.awardExp(w.mon);
        P1.state.party.forEach((m, i) => { if (m.level > before[i]) this.leveled.add(i); });
      }
    },

    async '-status'(e) {
      const w = this.battle.who(e.args[0]);
      const st = e.args[1];
      this.hud.setStatus(w.side, st);
      const fx = STATUS_FX[st];
      if (fx) this.spriteAt(this.stage.slots[w.side], fx);
      await this.say(this.nameOf(e.args[0]) + (STATUS_TEXT[st] || ' is afflicted!'));
    },
    async '-curestatus'(e) {
      const w = this.battle.who(e.args[0]);
      this.hud.setStatus(w.side, '');
      await this.say(this.nameOf(e.args[0]) + (CURE_TEXT[e.args[1]] || "'s status cleared!"));
    },
    async '-boost'(e) { await statChange.call(this, e, 1); },
    async '-unboost'(e) { await statChange.call(this, e, -1); },
    async cant(e) {
      const reason = e.args[1] || '';
      const w = this.battle.who(e.args[0]);
      const fx = STATUS_FX[reason === 'flinch' ? 'flinch' : reason];
      if (fx && w) this.spriteAt(this.stage.slots[w.side], fx);
      await this.say(this.nameOf(e.args[0]) + (CANT_TEXT[reason] || " can't move!"));
    },
    async '-start'(e) {
      const eff = (e.args[1] || '').replace(/^move: /, '').toLowerCase();
      if (eff === 'confusion') {
        const w = this.battle.who(e.args[0]);
        if (w) this.spriteAt(this.stage.slots[w.side], STATUS_FX.confusion);
        await this.say(this.nameOf(e.args[0]) + ' became confused!');
      } else if (eff === 'substitute') await this.say(this.nameOf(e.args[0]) + ' put in a substitute!');
      else if (eff === 'leech seed') await this.say(this.nameOf(e.args[0]) + ' was seeded!');
    },
    async '-end'(e) {
      const eff = (e.args[1] || '').replace(/^move: /, '').toLowerCase();
      if (eff === 'confusion') await this.say(this.nameOf(e.args[0]) + ' snapped out of confusion!');
      else if (eff === 'substitute') await this.say(this.nameOf(e.args[0]) + "'s substitute faded!");
    },
    async '-activate'(e) {
      const eff = (e.args[1] || '').replace(/^move: /, '').toLowerCase();
      if (eff === 'confusion') {
        const w = this.battle.who(e.args[0]);
        if (w) this.spriteAt(this.stage.slots[w.side], STATUS_FX.confusion);
        await this.say(this.nameOf(e.args[0]) + ' is confused!');
      } else if (eff === 'protect') await this.say(this.nameOf(e.args[0]) + ' protected itself!');
    },
    async '-weather'(e) {
      const t = WEATHER_TEXT[e.args[0]];
      if (t && !e.kw.upkeep) await this.say(t);
    },
    async '-message'(e) { await this.say(e.args[0]); },
    async turn(e) { if (e.args[0] !== '1') this.hud.log('Turn ' + e.args[0]); },     // 'Turn '+n, trừ lượt 1

    /* Hành động riêng của bản web (engine.js): đồ, bóng, chạy. */
    async 'p1-item'(e) {
      const w = this.battle.who(e.args[1]);
      const it = Object.values(P1.ITEMS || {}).find((x) => (BAG_ALIAS[x.battleId] || x.battleId) === e.args[0]);
      P1.audio.sfx('item', { volume: 0.7 });
      await this.say(this.trainerName() + ' used ' + (it ? /^[AEIOU]/.test(it.name) ? 'an ' : 'a ' : '') + Y(it ? it.name : e.args[0]) + ' on ' + nameOf(w.mon, 'p1') + '!', 0.3);
      const p1 = this.battle.active('p1');
      if (p1 && p1.index !== w.index) return;
    },
    async 'p1-ball'(e) { await throwBall.call(this, e); },
    async 'p1-run'(e) {
      if (e.args[0] === '1') { P1.audio.sfx('flee'); await this.say('You got away safely!', 1); }
      else await this.say(Y(P1.state.player.name) + ' failed to run away!');
    },
    async 'p1-norun'() { await this.say("There's no running from a Trainer battle!"); },
    async 'p1-noball'() { await this.say("You can't catch another Trainer's Pokémon!"); },
  };

  const STATUS_TEXT = { brn: ' was burned!', psn: ' was poisoned!', tox: ' was badly poisoned!', par: ' is paralyzed! It may be unable to move!',
    slp: ' fell asleep!', frz: ' was frozen solid!' };
  const CURE_TEXT = { brn: "'s burn was healed.", psn: ' was cured of its poisoning.', tox: ' was cured of its poisoning.',
    par: ' was cured of paralysis.', slp: ' woke up!', frz: ' thawed out!' };
  const CANT_TEXT = { par: " is paralyzed! It can't move!", slp: ' is fast asleep!', frz: ' is frozen solid!',
    flinch: " flinched and couldn't move!", recharge: ' must recharge!', nopp: ' has no PP left!', attract: ' is immobilized by love!',
    truant: ' is loafing around!' };
  const DAMAGE_FROM = { brn: ' was hurt by its burn!', psn: ' was hurt by poison!', tox: ' was hurt by poison!', recoil: ' is damaged by the recoil!',
    sandstorm: ' is buffeted by the sandstorm!', hail: ' is buffeted by the hail!', confusion: ' hurt itself in its confusion!',
    'leech seed': "'s health is sapped by Leech Seed!", spikes: ' is hurt by the spikes!', 'stealth rock': ' was hurt by pointed stones!',
    curse: ' is afflicted by the curse!', nightmare: ' is locked in a nightmare!', 'life orb': ' lost some of its HP!' };
  const WEATHER_TEXT = { RainDance: 'It started to rain!', SunnyDay: 'The sunlight turned harsh!', Sandstorm: 'A sandstorm kicked up!',
    Hail: 'It started to hail!', none: 'The effects of the weather disappeared.' };

  async function statChange(e, dir) {
    const w = this.battle.who(e.args[0]);
    const n = +e.args[2] || 0;
    P1.audio.sfx(dir > 0 ? 'stat_up' : 'stat_down');
    const slot = w && this.stage.slots[w.side];
    if (slot && slot.root) {
      const h = P1.fx.sprite({ atlas: 'fx_test', prefix: 'shine1_', fps: 22, pxToM: TUNE.fxPxToM * 0.8,
        color: dir > 0 ? [1, 0.55, 0.35, 1] : [0.45, 0.6, 1, 1], reversed: dir < 0 });
      h.obj.position.copy(slot.anchor);
      this.stage.addFx(h);
    }
    const nm = this.nameOf(e.args[0]) + "'s " + String(e.args[1]).toUpperCase();   // STAT.ToUpper(): "ATK", "SPE"…
    if (n === 0) await this.say(nm + (dir > 0 ? " won't go any higher!" : " won't go any lower!"));
    else if (dir > 0) await this.say(nm + ' rose' + (n >= 3 ? ' drastically' : n === 2 ? ' sharply' : '') + '!');
    else await this.say(nm + ' fell' + (n >= 3 ? ' severely' : n === 2 ? ' harshly' : '') + '!');
  }

  scene.blink = function (slot) {
    let on = true;
    const n = 6;
    for (let i = 0; i < n; i++) this.wait(i * 0.07).then(() => { if (slot.model) slot.model.visible = (on = !on); });
    this.wait(n * 0.07).then(() => { if (slot.model) slot.model.visible = true; });
  };

  /* ---------------------------------------------------------------- ném bóng (CatchEffect) */

  const BALL_NAME = (key) => {
    const it = Object.values(P1.ITEMS || {}).find((x) => (BAG_ALIAS[x.battleId] || x.battleId) === key);
    return it ? it.name : key;
  };

  /*
   * Ném bóng: CatchEffect.Catch (0x19E520). Clip của bóng: Pokeball_Open_Catch → (Pokeball_Shake × lắc)
   * → Pokeball_Success | Pokeball_Break. Máy ảnh HitFoe suốt đoạn, xong trả state cũ.
   * Hạt: BallEffect (Inside Ball Effect), PokemonEffectIn (In Ball), PokemonEffectOut (Out Of Ball).
   */
  async function throwBall(e) {
    const [key, ident, shakesStr, caughtStr] = e.args;
    const caught = caughtStr === '1';
    const shakes = Math.max(1, +shakesStr);
    const tgt = this.slotOf(ident);
    const name = BALL_NAME(key);
    await this.say(this.trainerName() + ' threw ' + (/^[AEIOU]/.test(name) ? 'an ' : 'a ') + Y(name) + '!', TUNE.textFast);
    const camBefore = this.stage.cam.state;
    this.stage.cam.set('HitFoe');
    const ball = await makeBall(key);
    const fxOpt = (at) => ({ origin: at, scale: 1, posScale: ball.rootScale, pxScale: this.stage.pxScale(P1.renderer()) });
    const open = ball.play('Pokeball_Open_Catch');
    await this.wait(0.1);
    ball.obj.position.copy(tgt.root.position).add(new THREE.Vector3(-1.5, 3.0, 1.0));   // Unity (1.5, 3, 1), x lật
    this.stage.scene.add(ball.obj);
    const trail = this.stage.addFx(P1.fx.group(ball.fx.inside, fxOpt(ball.center())));
    await this.wait(1.0);
    this.stage.addFx(P1.fx.group(ball.fx.in, fxOpt(tgt.anchor)));
    await this.wait(0.3);
    P1.audio.sfx('balldrop');
    const s0 = tgt.root.scale.x;
    await this.clock.tween(0.3, (k) => tgt.root.scale.setScalar(s0 * (1 - k)));
    await this.wait(0.01);
    tgt.root.scale.setScalar(0);
    await open;
    trail.stop();
    for (let i = 0; i < Math.min(3, shakes); i++) {
      P1.audio.sfx('ballshake');
      this.catchPhase = 'shake' + i;
      await ball.play('Pokeball_Shake');
      await this.wait(0.2);
    }
    if (caught) {
      await ball.play('Pokeball_Success', { hold: true });
      await this.wait(0.8);
      await this.say('Gotcha! ' + nameOf(tgt.mon) + ' was caught!', TUNE.textPause);
      this.stage.cam.set(camBefore);
      return;
    }
    const brk = ball.play('Pokeball_Break');
    await this.wait(0.1);
    this.stage.addFx(P1.fx.group(ball.fx.out, fxOpt(tgt.anchor)));
    await this.wait(0.2);
    await this.clock.tween(0.3, (k) => tgt.root.scale.setScalar(s0 * k));
    await this.wait(0.31 + 0.3);
    await brk;
    this.stage.scene.remove(ball.obj);
    this.stage.cam.set(camBefore);
    await this.say(['Oh no! The Pokémon broke free!', 'Aww! It appeared to be caught!', 'Aargh! Almost had it!', 'Aargh! Almost had it!'][+shakesStr] || 'Oh no! The Pokémon broke free!', TUNE.textPause);
  }

  /* Bóng của CatchEffect (art/battle/ball/*.glb, clip Pokeball_*). Không có glb thì quả cầu đỏ/trắng lắc bằng tay. */
  async function makeBall(key) {
    const all = (DATA().catch && DATA().catch.balls) || {};
    const d = all[key] || all[key === 'pokeball' ? 'pokball' : key] || all.pokball || all.pokeball || null;
    const fx = { in: (d && d.in) || [], out: (d && d.out) || [], inside: (d && d.inside) || [] };
    const obj = new THREE.Group();
    const scene = this && this.stage ? this.stage.scene : null;
    let mixer = null, clips = [];
    if (d && d.glb) {
      try {
        const g = await P1.gltf(d.glb);
        const m = cloneSkinned(g.scene);
        m.traverse((n) => { if (n.isMesh) { n.frustumCulled = false; n.material = n.material.clone(); } });
        obj.add(m);
        mixer = new THREE.AnimationMixer(m);
        clips = g.animations;
      } catch (err) { console.warn(err.message); }
    }
    if (!obj.children.length) {
      const top = new THREE.MeshLambertMaterial({ color: key === 'masterball' ? 0x7a3cc8 : key === 'greatball' ? 0x3a78e0 : key === 'ultraball' ? 0x303030 : 0xe03a2c });
      const r = 0.15;
      obj.add(new THREE.Mesh(new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), top),
        new THREE.Mesh(new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 })));
      obj.children.forEach((c) => { c.position.y = r - 3.0; });    // (đoán) bóng nằm dưới gốc hiệu ứng 3 m, như PokeBall (0,-30,0)·0.1
    }
    const clock = BALL_CLOCK;
    const ball = {
      obj, fx, rootScale: (DATA().catch && DATA().catch.rootScale) || 0.1,
      center() { const b = new THREE.Box3().setFromObject(obj); return b.isEmpty() ? obj.position.clone() : b.getCenter(new THREE.Vector3()); },
      play(name, opt) {
        const clip = clips.find((c) => c.name === name);
        if (!mixer || !clip) {
          if (name === 'Pokeball_Shake') return clock.tween(1, (k) => { obj.rotation.z = Math.sin(k * Math.PI * 2) * 0.4; });
          return clock.wait(name === 'Pokeball_Open_Catch' ? 1.95 : 0.75);
        }
        mixer.stopAllAction();
        const a = mixer.clipAction(clip);
        a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.reset().play();
        return clock.wait(clip.duration);
      },
    };
    BALL_MIXERS.push(mixer);
    return ball;
  }
  // Bóng dùng đồng hồ trận; update() của cảnh chạy mixer của bóng.
  let BALL_CLOCK = null;
  const BALL_MIXERS = [];

  P1.battleScene = scene;
  P1.scene.add('battle', scene);
})(window.P1 = window.P1 || {});
