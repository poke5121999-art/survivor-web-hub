// Xe trên màn hình: xe kart (art/cars) + tay đua (art/drivers) ngồi ở node ghế gốc, đọc trạng thái Kart của mô phỏng.
// - Xe xuất từ Unity nhìn về −z, mô phỏng coi yaw 0 là +z: lật π một lần ở node `flip`.
// - Tay đua trộn hoạt ảnh theo blend tree gốc (drivers.js blend.move: Turn −1..1, Accel 0 | 0.7), nội suy song tuyến.
// - Mỗi xe một bản parse riêng từ cùng ArrayBuffer: tay đua là mesh có skin, clone thường sẽ dùng chung xương.
(function (TD) {
  'use strict';
  const THREE = window.THREE;
  const V = { list: [], bufs: {}, shadowTex: null };
  const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0);
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();

  function fetchBuf(url) {
    if (!V.bufs[url]) V.bufs[url] = fetch(url + '?v=' + (TD.REV || '')).then((r) => { if (!r.ok) throw new Error(url + ' http ' + r.status); return r.arrayBuffer(); });
    return V.bufs[url];
  }
  function parse(url) {
    return fetchBuf(url).then((buf) => new Promise((res, rej) => {
      const l = new THREE.GLTFLoader();
      l.setMeshoptDecoder(window.MeshoptDecoder);
      l.parse(buf.slice(0), '', res, rej);
    }));
  }

  // Bóng đổ kiểu decal như bản gốc (config/decalshadow): một tấm bóng mềm hình chữ nhật bo góc theo cỡ thân xe.
  function shadowTexture() {
    if (V.shadowTex) return V.shadowTex;
    const c = document.createElement('canvas'); c.width = 64; c.height = 128;
    const g = c.getContext('2d');
    g.filter = 'blur(9px)'; g.fillStyle = 'rgba(0,0,0,0.85)';
    g.beginPath(); g.roundRect ? g.roundRect(14, 16, 36, 96, 14) : g.rect(14, 16, 36, 96); g.fill();
    V.shadowTex = new THREE.CanvasTexture(c);
    return V.shadowTex;
  }

  // Màu sơn: bản gốc nhân _paintColor1/2 qua mặt nạ (R: màu 1, G: màu 2) lên ảnh nền chưa nhuộm. Glb chỉ có ảnh đã nướng màu
  // mặc định nên nhuộm lại trên canvas rồi thay map của vật liệu 'paint'. Một bộ ảnh nền/mặt nạ đọc một lần cho mỗi xe.
  const paintSrc = {}, paintTex = {};
  function loadPx(url) {
    return new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => {
        const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
        const g = c.getContext('2d'); g.drawImage(im, 0, 0);
        res(g.getImageData(0, 0, c.width, c.height));
      };
      im.onerror = () => rej(new Error(url + ' không tải được'));
      im.src = url + '?v=' + (TD.REV || '');
    });
  }
  function paintPair(car, idx) {
    const P = TD.PAINTS || [];
    return idx > 0 && P[idx - 1] ? P[idx - 1] : car.paint;
  }
  function paintTexture(car, idx, old) {
    const pm = car.paintMaps;
    if (!pm) return Promise.resolve(null);
    const key = car.id + ':' + idx;
    if (paintTex[key]) return paintTex[key];
    const src = paintSrc[car.id] = paintSrc[car.id] || Promise.all([loadPx(pm.base), loadPx(pm.mask)]);
    return (paintTex[key] = src.then(([b, m]) => {
      const [c1, c2] = paintPair(car, idx);
      const c = document.createElement('canvas'); c.width = b.width; c.height = b.height;
      const g = c.getContext('2d'), out = g.createImageData(b.width, b.height), o = out.data, bd = b.data;
      const md = m.width === b.width && m.height === b.height ? m.data : null;
      for (let i = 0; i < o.length; i += 4) {
        const mr = md ? md[i] / 255 : 1, mg = md ? md[i + 1] / 255 : 0;
        for (let k = 0; k < 3; k++) {
          let t = 1 + (c1[k] - 1) * mr;
          t += (c2[k] - t) * mg;
          o[i + k] = Math.min(255, bd[i + k] * t);
        }
        o[i + 3] = 255;
      }
      g.putImageData(out, 0, 0);
      const tx = new THREE.CanvasTexture(c);
      tx.flipY = false; tx.encoding = old.encoding; tx.wrapS = old.wrapS; tx.wrapT = old.wrapT; tx.anisotropy = 4;
      return tx;
    }).catch((e) => { TD.warnOnce('paint' + car.id, String(e)); return null; }));
  }
  // idx 0 = màu gốc của xe; 1.. = TD.PAINTS[idx-1]. Người chơi theo bản lưu, bot lấy ngẫu nhiên cố định theo id.
  function paintIndex(v) {
    const n = (TD.PAINTS || []).length + 1;
    if (v.kart.ctrl === 'human') return ((TD.save.d.paint || {})[v.car.id] | 0) % n;
    return (((v.kart.id | 0) * 2654435761 + v.car.id.length * 97) >>> 0) % n;
  }
  V.applyPaint = function (v) {
    if (!v.model) return Promise.resolve();
    const idx = paintIndex(v);
    if (v.paintIdx === idx) return Promise.resolve();
    v.paintIdx = idx;
    const mats = [];
    v.model.traverse((o) => { if (o.isMesh && o.material && o.material.name === 'paint' && mats.indexOf(o.material) < 0) mats.push(o.material); });
    if (!mats.length || !mats[0].map) return Promise.resolve();
    return paintTexture(v.car, idx, mats[0].map).then((tx) => {
      if (!tx || v.paintIdx !== idx) return;
      for (const m of mats) { m.map = tx; m.needsUpdate = true; }
    });
  };
  // Sảnh đổi màu xong: tô lại xe người chơi đang hiện (xe trưng bày được main.js giữ lại theo cặp xe/tay đua).
  V.repaintHuman = function () { for (const v of V.list) if (v.kart.ctrl === 'human') V.applyPaint(v); };

  V.create = function (scene, kart) {
    const car = TD.CARS[kart.carId] || TD.CARS[Object.keys(TD.CARS)[0]];
    const drv = TD.DRIVERS && TD.DRIVERS[kart.driverId];
    const root = new THREE.Group(), pivot = new THREE.Group(), flip = new THREE.Group();
    flip.rotation.y = Math.PI;
    root.add(pivot); pivot.add(flip); scene.add(root);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(car.size.w * 1.15, car.size.l * 1.12),
      new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.6 }));
    sh.rotation.x = -Math.PI / 2; sh.renderOrder = 1;
    sh.material.polygonOffset = true; sh.material.polygonOffsetFactor = -4;
    root.add(sh);
    const v = { kart, car, root, pivot, flip, shadow: sh, wheels: [], spin: 0, steerVis: 0, lean: 0, dyaw: 0, pitch: 0, bounce: 0, bounceV: 0,
      mixer: null, acts: {}, oneShot: null, exhaust: [], rear: [], ready: false, turn: 0, accel: 0 };
    V.list.push(v);
    const pCar = parse(car.glb).then((g) => {
      const m = g.scene;
      m.traverse((o) => { if (o.isMesh) { o.frustumCulled = true; if (o.material && o.material.map) o.material.map.anisotropy = 4; } });
      flip.add(m);
      for (const n of ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr']) {
        const w = m.getObjectByName(n);
        if (w) v.wheels.push({ o: w, base: w.quaternion.clone(), front: n[6] === 'f', r: (car.wheels.find((q) => q.front === (n[6] === 'f')) || { r: 0.3 }).r });
      }
      for (const n of ['exhaust_l', 'exhaust_r']) { const e = m.getObjectByName(n); if (e) v.exhaust.push(e); }
      for (const n of ['wheel_rl', 'wheel_rr']) { const e = m.getObjectByName(n); if (e) v.rear.push(e); }
      v.model = m;
      V.applyPaint(v);
      return m;
    });
    const pDrv = drv ? parse(drv.glb) : Promise.resolve(null);
    v.loading = Promise.all([pCar, pDrv]).then(([m, dg]) => {
      if (dg) {
        const seat = m.getObjectByName(drv.source && drv.source.gender === 'female' ? 'Car_Seat' : 'Car_Seat_M') || m.getObjectByName('driver_mount') || m;
        const d = dg.scene;
        d.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
        seat.add(d);
        v.driver = d;
        v.mixer = new THREE.AnimationMixer(d);
        for (const c of dg.animations) {
          const a = v.mixer.clipAction(c);
          const info = drv.clipInfo[c.name];
          if (info && !info.loop) { a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; }
          v.acts[c.name] = a;
        }
        v.blend = (drv.blend && drv.blend.move && drv.blend.move.points) || [];
        for (const p of v.blend) if (v.acts[p[0]]) { v.acts[p[0]].play(); v.acts[p[0]].setEffectiveWeight(0); }
      }
      v.ready = true;
    });
    return v;
  };

  // Trọng số song tuyến cho điểm blend (tên, turn, accel): hai hàng accel, mỗi hàng nội suy tuyến tính theo turn.
  function blendWeights(points, turn, accel) {
    const rows = {};
    for (const p of points) (rows[p[2]] = rows[p[2]] || []).push(p);
    const keys = Object.keys(rows).map(Number).sort((a, b) => a - b);
    let lo = keys[0], hi = keys[keys.length - 1];
    for (const k of keys) { if (k <= accel) lo = k; if (k >= accel && hi > k) hi = k; }
    if (hi < lo) hi = lo;
    const ta = hi === lo ? 0 : (accel - lo) / (hi - lo);
    const w = {};
    const row = (k, f) => {
      const r = rows[k].slice().sort((a, b) => a[1] - b[1]);
      let i = 0;
      while (i < r.length - 2 && turn > r[i + 1][1]) i++;
      const a = r[i], b = r[Math.min(i + 1, r.length - 1)];
      const t = b[1] === a[1] ? 0 : Math.max(0, Math.min(1, (turn - a[1]) / (b[1] - a[1])));
      w[a[0]] = (w[a[0]] || 0) + f * (1 - t);
      w[b[0]] = (w[b[0]] || 0) + f * t;
    };
    row(lo, 1 - ta); if (hi !== lo) row(hi, ta);
    return w;
  }

  V.oneShot = function (v, name) {
    const a = v.acts[name];
    if (!a) return;
    if (v.oneShot && v.oneShot !== a) v.oneShot.fadeOut(0.15);
    a.reset(); a.setEffectiveWeight(1); a.fadeIn(0.1); a.play();
    v.oneShot = a; v.oneShotT = a.getClip().duration;
  };

  V.update = function (v, dt, T) {
    const k = v.kart, U = TD.TUNING;
    v.root.position.set(k.x, k.y, k.z);
    v.root.rotation.set(0, k.yaw, 0);
    const n = k.loc && k.loc.normal;
    // Theo pháp tuyến mặt đường: nghiêng thân theo dốc dọc và dốc ngang.
    let gp = 0, gr = 0;
    if (n) {
      const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw);
      gp = -Math.asin(Math.max(-1, Math.min(1, n[0] * fx + n[2] * fz)));
      gr = Math.asin(Math.max(-1, Math.min(1, n[0] * fz - n[2] * fx)));
    }
    const drifting = k.st === 'drift';
    const boost = k.nitro.boostT > 0 ? 1 : (k.nitro.miniT > 0 ? 0.6 : 0);
    const wantLean = drifting ? -k.drift.dir * 0.09 : -k.input.steer * Math.min(1, Math.abs(k.speed) / 40) * 0.035;
    v.lean += (wantLean - v.lean) * (1 - Math.exp(-dt * 8));
    const wantPitch = -boost * 0.05;
    v.pitch += (wantPitch - v.pitch) * (1 - Math.exp(-dt * 6));
    // Euler bán ẩn của lò xo này phân kỳ khi dt > 1/14 s (timeScale của bài kiểm): chia bước nhỏ.
    for (let n = Math.ceil(dt * 60), h = dt / n, i = 0; i < n; i++) {
      v.bounceV += (-v.bounce * 180 - v.bounceV * 14) * h;
      v.bounce += v.bounceV * h;
    }
    // Drift gốc: thân xe xoay 35–50° so với trục camera (nhìn ba phần tư từ sau), sim chỉ trượt ~15–35°. Cộng thêm góc xoay
    // thuần hình ảnh theo độ lệch trượt (không đụng vật lý), tổng với góc lệch của camera bị kẹp ~50°.
    const wantYaw = drifting ? Math.max(-0.5, Math.min(0.5, k.drift.vd * Math.PI / 180 * 0.95)) : 0;
    v.dyaw += (wantYaw - v.dyaw) * (1 - Math.exp(-dt * (drifting ? 7 : 10)));
    v.pivot.rotation.set(gp + v.pitch + v.bounce * 0.4, v.dyaw, gr + v.lean, 'YXZ');
    v.pivot.position.y = v.bounce * 0.5;
    v.shadow.visible = k.grounded || (k.loc && k.y - k.loc.y < 6);
    if (k.loc) { v.shadow.position.set(0, k.loc.y - k.y + 0.03, 0); v.shadow.material.opacity = 0.6 * Math.max(0, 1 - (k.y - k.loc.y) / 6); }
    // Bánh: quay theo quãng đường, bánh trước đánh lái (khi drift bẻ ngược lái như xe thật).
    v.spin += (k.speed * dt) / 0.3;
    const st = drifting ? k.drift.dir * 0.32 : -k.input.steer * 0.42;
    v.steerVis += (st - v.steerVis) * (1 - Math.exp(-dt * 14));
    for (const w of v.wheels) {
      qa.setFromAxisAngle(AY, w.front ? v.steerVis : 0);
      qb.setFromAxisAngle(AX, v.spin * 0.3 / w.r);
      w.o.quaternion.copy(qa).multiply(qb).multiply(w.base);
    }
    if (v.mixer) {
      const turnT = drifting ? k.drift.dir : Math.max(-0.5, Math.min(0.5, k.input.steer * 0.5));
      v.turn += (turnT - v.turn) * (1 - Math.exp(-dt * 9));
      v.accel += (boost * 0.7 - v.accel) * (1 - Math.exp(-dt * 6));
      const w = blendWeights(v.blend, v.turn, v.accel);
      const os = v.oneShot ? Math.max(0, Math.min(1, v.oneShotT / 0.15)) : 0;
      for (const p of v.blend) { const a = v.acts[p[0]]; if (a) a.setEffectiveWeight((w[p[0]] || 0) * (1 - os)); }
      if (v.oneShot) { v.oneShotT -= dt; if (v.oneShotT <= 0) { v.oneShot.fadeOut(0.2); v.oneShot = null; } }
      v.mixer.update(dt);
    }
  };

  V.onEvent = function (v, e) {
    if (e.type === 'land') { v.bounceV -= Math.min(3, 0.6 + (e.power || 0.5) * 2); V.oneShot(v, 'land'); }
    else if (e.type === 'wall') { v.bounceV -= 0.6 * (e.power || 0.5); V.oneShot(v, (e.side || 0) > 0 ? 'crash_l' : (e.side || 0) < 0 ? 'crash_r' : 'crash_f'); }
    else if (e.type === 'bump') V.oneShot(v, 'hit');
    else if (e.type === 'air') V.oneShot(v, 'jump');
    else if (e.type === 'finish') V.oneShot(v, (e.place || 6) <= 3 ? 'win' : 'lose');
  };

  // Vị trí thế giới của ống xả / bánh sau (cho lửa phun, tia lửa drift, vệt lốp).
  V.points = function (v, which, out) {
    const src = which === 'exhaust' ? v.exhaust : v.rear;
    out.length = 0;
    for (const o of src) { const p = new THREE.Vector3(); o.getWorldPosition(p); out.push(p); }
    return out;
  };

  V.clear = function (scene) { for (const v of V.list) scene.remove(v.root); V.list.length = 0; };

  TD.kartView = V;
})(globalThis.TD = globalThis.TD || {});
