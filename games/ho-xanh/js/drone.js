// Drone cứu hộ (LiftDrone gốc): Dave gọi trên xác cá lớn hoặc cá lớn đang ngủ / đông đá; drone bay từ xa phía sau tới,
// thả lưới quấn cá rồi mang cá bay ngược ra xa về thuyền. Cá drone mang đi không chiếm chỗ trong túi, và vẫn còn dù Dave
// ngất (đã ở trên thuyền), như bản gốc. Số drone mỗi lượt = cấp "Drone cứu hộ" trong iDiver (G.loadout.drone).
// Hình: mô hình 3D Underwater_Drone01 + hai clip gốc (tools/rip_gear.py → art/gear/drone/drone.glb), hạt cánh quạt gắn trên xương.
// Đường bay chính là root motion của clip (Root/Transform), nên drone chỉ đặt gốc ở chỗ nâng cá rồi chạy clip một lần.
// Lưới gốc là vải vật lý Obi, không xuất được, nên chỉ có cụm hạt thả lưới VFX_Item_Nettrap_A_01.
(function (HX) {
  'use strict';
  var T = window.HX_TUNING, DT = T.drone, INFO = window.HX_ASSETS.drone || null;
  var REV = ((document.currentScript && document.currentScript.src || '').split('v=')[1] || '').split('&')[0];

  // cụm hạt gắn trên xương drone → khoá công thức trong gear_vfx.json
  var ATTACH_FX = {
    VFX_Underwater_Drone_PropellerL_A_01: 'dronePropL1', VFX_Underwater_Drone_PropellerL_A_02: 'dronePropL2',
    VFX_Underwater_Drone_PropellerR_A_01: 'dronePropR1', VFX_Underwater_Drone_PropellerR_A_02: 'dronePropR2',
    VFX_Underwater_Drone_Bubble_A_01: 'droneBubble1', VFX_Underwater_Drone_Bubble_A_02: 'droneBubble2',
  };
  // Bộ điều khiển gốc có state Lift và WrapLift (tham số "wrap") nhưng bảng state → clip nằm trong blob nhị phân.
  // Chọn [ĐỀ XUẤT]: xác cá dùng clip A (Lift), cá còn sống quấn lưới (ngủ, đông đá) dùng clip B (WrapLift, lơ lửng cao hơn).
  var CLIP = { A: 'Ani3D_UnderwaterDrone01_Normal_Move_A_01', B: 'Ani3D_UnderwaterDrone01_Normal_Move_B_01' };

  var glbP = null;
  function loadModel() {
    if (!INFO) return Promise.reject(new Error('HX_ASSETS.drone missing: run tools/rip_gear.py drone'));
    if (!glbP) glbP = HX.level.loadGlb(INFO.glb + (REV ? '?v=' + REV : ''));
    return glbP;
  }

  // Vật liệu gốc thay bằng vật liệu nước của game (sương, ánh sáng theo độ sâu) như đá và san hô.
  function dress(root) {
    var cache = {};
    root.traverse(function (o) {
      if (!o.isMesh) return;
      var src = o.material, key = src.uuid;
      if (!cache[key]) {
        if (src.map) { src.map.magFilter = THREE.LinearFilter; src.map.needsUpdate = true; }
        cache[key] = HX.gfx.terrainMaterial({ map: src.map, kind: 'deco', color: [src.color.r, src.color.g, src.color.b] });
      }
      o.material = cache[key];
      o.frustumCulled = false;
    });
  }

  function Drone(G, max) {
    this.G = G;
    this.max = max;
    this.left = max;
    this.delivered = [];   // mã loài cá drone đã đưa lên thuyền trong lượt này
    this.flights = [];
    this.gltf = null;
    var self = this;
    loadModel().then(function (g) { self.gltf = g; }, function (e) { G.errors.push(String(e)); });
  }

  // Con cá này drone kéo được không: cá phải xả thịt (cỡ lớn), đã chết, đang ngủ hoặc đông đá, chưa có drone nào nhận.
  Drone.prototype.liftable = function (f) {
    return !!f && !!f.root.parent && f.carvable() && (f.corpse() || f.state === 'sleep' || f.state === 'iced');
  };

  // Con cá gần Dave nhất mà drone kéo được (thân cá nở thêm T.drone.reach).
  Drone.prototype.target = function () {
    var d = this.G.diver, list = this.G.fishes.list, best = null, bd = Infinity;
    if (!d) return null;
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      if (!this.liftable(f) || !f.hitTest(d.pos.x, d.pos.y, DT.reach)) continue;
      var c = f.center(), dd = Math.hypot(c.x - d.pos.x, c.y - d.pos.y);
      if (dd < bd) { bd = dd; best = f; }
    }
    return best;
  };

  // Gọi được ngay lúc này: còn drone, có cá kéo được trong tầm, Dave đang bơi tự do.
  Drone.prototype.canCall = function () {
    var d = this.G.diver;
    return this.left > 0 && !!d && d.state === 'swim' && this.G.phase === 'dive' && !!this.target();
  };

  // Dave gọi xong (hết CallDroneCommand): trừ một drone, drone lặn xuống tới con cá.
  Drone.prototype.launch = function (f) {
    var G = this.G;
    if (this.left <= 0 || !this.liftable(f)) return false;
    this.left--;
    var kind = f.corpse() ? 'A' : 'B';
    f.clearBuffs();
    f.go('lifted');
    var c = f.center();
    // gốc LiftDrone đặt ở chỗ nâng cá; clip đưa drone từ xa tới lơ lửng ngay trên đó
    var fl = { fish: f, kind: kind, phase: 'come', t: 0, x: c.x, y: c.y + f.hh * DT.liftUp, node: null, mixer: null, plays: [], off: null };
    this.flights.push(fl);
    G.audio.play('gear_drone_a', { vol: 0.8 });
    return true;
  };

  Drone.prototype.build = function (fl) {
    var G = this.G, g = this.gltf;
    var node = g.scene.clone(true);
    dress(node);
    node.scale.setScalar(DT.scale);
    G.gfx.scene.add(node);
    fl.node = node;
    fl.mixer = new THREE.AnimationMixer(node);
    var clip = g.animations.filter(function (a) { return a.name === CLIP[fl.kind]; })[0];
    if (clip) fl.mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1).play();
    fl.clip = clip ? clip.name : null;
    fl.length = clip ? clip.duration : 0;
    node.position.set(fl.x, fl.y, 0);
    fl.mixer.update(0);
    var bones = {};
    node.traverse(function (o) { if (o.name) bones[o.name] = o; });
    fl.bones = bones;
    // hạt cánh quạt / bọt bám xương (INFO.attach: xương + độ lệch trong hệ xương)
    var v = new THREE.Vector3();
    (INFO.attach || []).forEach(function (a) {
      var key = ATTACH_FX[a.name], bone = bones[a.bone];
      if (!key || !bone) return;
      fl.plays.push(G.fx.play(G.fx.dive(key), fl.x, fl.y, { z: 0.2, name: 'drone:' + key, follow: function () {
        if (!fl.node) return null;
        v.set(a.pos[0], a.pos[1], a.pos[2]);
        bone.localToWorld(v);
        return { x: v.x, y: v.y, z: v.z };
      } }));
    });
  };

  Drone.prototype.update = function (dt) {
    for (var i = this.flights.length - 1; i >= 0; i--) {
      var fl = this.flights[i];
      if (!fl.node) { if (this.gltf) this.build(fl); else continue; }
      if (this.step(fl, dt)) { this.finish(fl); this.flights.splice(i, 1); }
    }
  };

  // Một nhịp bay. Trả true khi cá đã lên thuyền (hết clip).
  //   come: clip đưa drone từ xa tới; tới mốc arrive thì thả lưới (VFX_Item_Nettrap_A_01), tiếng Underwater_Drone_01B
  //   net:  lơ lửng trên cá; tới mốc grab thì cá bám vào DockingDummy
  //   away: cá theo drone bay ngược ra xa (cả chiều sâu z), hết clip là tới thuyền
  var tmp = new THREE.Vector3();
  Drone.prototype.step = function (fl, dt) {
    var G = this.G, f = fl.fish;
    fl.t += dt;
    fl.mixer.update(dt);
    fl.node.updateMatrixWorld(true);
    var dock = fl.bones.DockingDummy || fl.bones.Bone_DroneBody;
    dock.getWorldPosition(tmp);
    if (fl.phase === 'come' && fl.t >= DT.arrive[fl.kind]) {
      fl.phase = 'net';
      var c = f.center();
      G.fx.play(G.fx.dive('droneNetTrap'), c.x, c.y, { z: f.z + 0.2, scale: f.sp.scale || 1, name: 'droneNetTrap' });
    }
    if (fl.phase === 'net' && fl.t >= DT.grab[fl.kind]) {
      fl.phase = 'away';
      fl.off = { x: f.pos.x - tmp.x, y: f.pos.y - tmp.y, z: f.z - tmp.z };
      G.audio.play('gear_drone_b', { vol: 0.8 });
      fl.net = G.fx.play(G.fx.dive('droneNet'), tmp.x, tmp.y, { z: tmp.z, name: 'droneNet', follow: function () {
        if (!fl.node) return null;
        var q = fl.fish.center();
        return { x: q.x, y: q.y, z: fl.fish.z + 0.2 };
      } });
    }
    if (fl.phase === 'away') { f.pos.x = tmp.x + fl.off.x; f.pos.y = tmp.y + fl.off.y; f.z = tmp.z + fl.off.z; }
    return fl.t >= fl.length;
  };

  // Cá lên thuyền: vào danh sách cá drone của lượt (main.js gộp vào mẻ cá khi hết lượt), thẻ bắt cá như cá vào túi.
  Drone.prototype.finish = function (fl) {
    var G = this.G, f = fl.fish;
    this.delivered.push(f.sp.id);
    f.go('reeled');
    G.hud.toast('Drone đã đưa ' + HX.fish.displayName(f.sp).toLowerCase() + ' lên thuyền');
    G.hud.catchCard(f.sp, HX.fish.iconFor(G.gfx, f.sp));
    this.drop(fl);
  };

  Drone.prototype.drop = function (fl) {
    fl.plays.forEach(function (p) { if (p) p.stop(); });
    if (fl.net) fl.net.stop();
    if (fl.mixer) fl.mixer.stopAllAction();
    if (fl.node) this.G.gfx.scene.remove(fl.node);
    fl.node = null;
  };

  Drone.prototype.remove = function () {
    this.flights.forEach(this.drop, this);
    this.flights.length = 0;
  };

  HX.Drone = Drone;
})(window.HX = window.HX || {});
