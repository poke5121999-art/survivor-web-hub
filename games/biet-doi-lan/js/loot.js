// Đồ cổ dưới đáy (REPO "valuables"): rải theo tầng, chìm, nằm trên đá, va đập trừ tiền hoặc vỡ.
// Cùng tệp: vật lý thân chìm dùng chung cho xác cá to (xác cá to không nổi lên, không tan, chìm dần như đồ cổ).
window.BDL = window.BDL || {};
(function (BDL) {
  'use strict';
  var T = window.HX_TUNING;

  var DRAG = 1.5;              // [ĐỀ XUẤT] cản nước của vật bị kéo (1/s)
  var SINK = 0.6;              // [ĐỀ XUẤT] tốc độ chìm cuối của đồ cổ (m/s); gia tốc chìm = DRAG × SINK
  var CORPSE_SINK = 0.3;       // [ĐỀ XUẤT] xác cá to chìm chậm hơn
  var DMG_SCALE = 0.35;        // [REPO] DMG_SCALE: mất 35% giá gốc ở va đập gấp đôi ngưỡng
  var INVULN = 0.8;            // [REPO] INVULN_AFTER_HIT
  var SHATTER_AT = 0.12;       // [REPO] chất liệu vỡ được còn ≤ 12% giá gốc thì vỡ hẳn
  var BLOW = 4;                // [REPO] đòn quái vào món đang ôm = va đập dmg × 4 px/s (lootDmg)
  var BOAT_CLEAR = 12;         // tầng 0: không rải trong 12 m quanh chỗ thuyền thả Dave
  var GRID = 0.6;              // ô lưới loang tìm chỗ bơi tới được (m)

  var texCache = {};
  function texOf(path) {
    if (!texCache[path]) {
      var t = new THREE.TextureLoader().load(path);
      t.magFilter = THREE.NearestFilter;   // ảnh điểm DtD: phóng to lấy mẫu gần nhất như sprite khác của Hố Xanh
      t.minFilter = THREE.LinearMipmapLinearFilter;
      texCache[path] = t;
    }
    return texCache[path];
  }

  // ---------- thân chìm: trọng lực trừ sức nổi, cản nước, trượt theo vách ----------
  // ox, oy: lệch từ pos tới tâm va chạm. Trả { imp (|Δv| do vách chặn, m/s), floor (đang tì lên mặt ngửa) }.
  function bodyStep(G, pos, vel, r, dt, sink, ox, oy) {
    vel.y -= DRAG * sink * dt;
    var k = Math.exp(-DRAG * dt);
    vel.x *= k; vel.y *= k;
    var c = { x: pos.x + (ox || 0), y: pos.y + (oy || 0) }, vx = vel.x, vy = vel.y;
    var hit = G.world.move(c, vel, r, dt);
    var top = T.water.surfaceY - r - 0.05;
    if (c.y > top) { c.y = top; if (vel.y > 0) vel.y = 0; }
    var floor = !!hit && hit.y > 0.55;
    if (floor) vel.x *= Math.exp(-5 * dt);
    pos.x = c.x - (ox || 0); pos.y = c.y - (oy || 0);
    return { imp: Math.hypot(vel.x - vx, vel.y - vy), floor: floor };
  }
  BDL.bodyStep = bodyStep;

  // ---------- chữ "−$X" bay lên ----------
  var css = null;
  function ensureCss() {
    if (css) return;
    css = document.createElement('style');
    css.id = 'loot-css';
    css.textContent = [
      '.loot-pop { position: absolute; transform: translate(-50%, -100%); font: 900 calc(15px * var(--px, 1))/1 system-ui, sans-serif;',
      '  color: #ffb39a; text-shadow: 0 2px 0 #000, 0 0 6px #000; white-space: nowrap; animation: lootPop 1.3s ease-out forwards; }',
      '.loot-pop.big { color: #ff6a55; font-size: calc(19px * var(--px, 1)); }',
      '@keyframes lootPop { 0% { opacity: 0; margin-top: 6px; } 12% { opacity: 1; margin-top: 0; } 70% { opacity: 1; } 100% { opacity: 0; margin-top: -34px; } }',
    ].join('\n');
    document.head.appendChild(css);
  }
  function pop(G, x, y, text, big) {
    var host = document.getElementById('hud') || document.body;
    var s = G.gfx.worldToScreen(x, y);
    var el = document.createElement('div');
    el.className = 'loot-pop' + (big ? ' big' : '');
    el.textContent = text;
    el.style.left = Math.round(s.x) + 'px'; el.style.top = Math.round(s.y) + 'px';
    host.appendChild(el);
    el.addEventListener('animationend', function () { el.remove(); });
    setTimeout(function () { el.remove(); }, 2000);
  }
  BDL.lootPop = pop;

  // ---------- một món đồ cổ ----------
  var lid = 0;
  function Loot(G, row, x, y, value0) {
    this.id = ++lid;
    this.G = G; this.row = row; this.key = row.key; this.name = row.name;
    this.size = row.size; this.matKey = row.mat; this.mat = BDL.LOOT_MATS[row.mat];
    this.mass = row.mass;
    this.value0 = value0; this.value = value0;
    this.pos = { x: x, y: y }; this.vel = { x: 0, y: 0 };
    var px = row.px || [64, 64], s = row.len / Math.max(px[0], px[1]);
    this.w = px[0] * s; this.h = px[1] * s;
    this.hw = this.w / 2; this.hh = this.h / 2; this.cx = 0; this.cy = 0;
    // vòng va chạm = nửa chiều cao (đáy ảnh chạm đá); món dẹt dài thì hai đầu chòi ra ngoài vòng
    this.r = Math.max(0.12, Math.min(this.hw, this.hh) * 0.95);
    this.state = 'rest'; this.tethered = false; this.asleep = false; this.restT = 0;
    this.invulnUntil = 0; this.grace = 0; this.flashT = 0; this.tilt = 0;
    this.facing = 1; this.flip = 1; this.z = 0.03 + (this.id % 17) * 0.0015;
    this.sp = { id: row.key, name: row.name, size: row.size, loot: true };
    this.isLoot = true;
    this.buffs = {};
    this.mesh = HX.gfx.sprite(texOf(row.sprite), this.w, this.h, { alphaCut: 0.5, depthWrite: true });
    this.root = this.mesh;
    G.gfx.scene.add(this.mesh);
    this.draw();
  }

  // Giả giao diện Fish đủ để mã quét danh sách cá (xiên, súng, drone, HUD) không vỡ nếu lỡ nhận một món đồ cổ.
  Loot.prototype.alive = function () { return false; };
  Loot.prototype.corpse = function () { return false; };
  Loot.prototype.carvable = function () { return false; };
  Loot.prototype.center = function () { return { x: this.pos.x, y: this.pos.y }; };
  Loot.prototype.hitTest = function (x, y, pad) {
    var ex = (x - this.pos.x) / (this.hw + pad), ey = (y - this.pos.y) / (this.hh + pad);
    return ex * ex + ey * ey <= 1;
  };
  Loot.prototype.damage = function (n, fx, fy) { this.hit(n, fx, fy); return 'alive'; };
  Loot.prototype.dot = function () { return false; };
  Loot.prototype.die = function () {};
  Loot.prototype.go = function () {};
  Loot.prototype.sleep = function () { return false; };
  Loot.prototype.addBuff = function () { return null; };
  Loot.prototype.endBuff = function () {};
  Loot.prototype.clearBuffs = function () {};

  Loot.prototype.deckItem = function () {
    return { kind: 'loot', key: this.key, label: this.name, value: Math.round(this.value), icon: this.row.sprite };
  };
  Loot.prototype.floorIndex = function () { return BDL.floorAt(this.pos.y, this.G.floors); };

  Loot.prototype.wake = function () { this.asleep = false; this.restT = 0; };

  // Va đập kiểu REPO damageLoot: chỉ cú dừng đột ngột (|Δv|) vượt ngưỡng chất liệu mới trừ tiền.
  Loot.prototype.impact = function (imp) {
    var G = this.G, m = this.mat;
    if (this.state === 'gone' || this.state === 'onDeck') return 0;
    if (imp > 1.2 && BDL.noise) BDL.noise(this.pos.x, this.pos.y, 3 + imp * 2.5, Math.min(2, imp / 2));
    if (G.t < this.invulnUntil || G.t < this.grace || imp <= m.thresh) return 0;
    var before = this.value;
    var loss = this.value0 * m.frag * DMG_SCALE * (imp - m.thresh) / m.thresh;
    this.value = Math.max(0, this.value - loss);
    this.invulnUntil = G.t + INVULN;
    if (m.shatter && this.value <= this.value0 * SHATTER_AT) this.value = 0;
    var lost = before - this.value;
    this.flashT = 0.18;
    if (lost > 0.5) {
      pop(G, this.pos.x, this.pos.y + this.hh, '−' + BDL.fmt(lost), this.value <= 0);
      G.shake(Math.min(1.4, 0.3 + lost / 2500));
    }
    if (this.value <= 0) this.shatter(before);
    else if (lost > 0.5) G.audio.play('harpoon_hit_rock', { vol: 0.8, rate: m.shatter ? 1.3 : 0.8 });
    return lost;
  };

  // Đòn quái / vụ nổ vào món đồ: REPO đổi đòn thành va đập dmg × 4 px/s rồi qua cùng công thức.
  Loot.prototype.hit = function (dmg, fromX, fromY) {
    if (!(dmg > 0)) return 0;
    this.wake();
    if (fromX != null) {
      var dx = this.pos.x - fromX, dy = this.pos.y - fromY, l = Math.hypot(dx, dy) || 1, kick = Math.min(4, dmg * 0.08 * 24 / this.mass);
      this.vel.x += dx / l * kick; this.vel.y += dy / l * kick;
    }
    return this.impact(dmg * BLOW / BDL.LOOT_PX_PER_M);
  };

  Loot.prototype.shatter = function (before) {
    var G = this.G;
    G.fx.burst('bubbleBig', this.pos.x, this.pos.y, 14, 1.4);
    G.fx.burst('dust', this.pos.x, this.pos.y, 5, 0.8, 0.2);
    G.fx.spawn('hit', this.pos.x, this.pos.y, 0.2, 0, 0, 0.9);
    G.audio.play('gear_ice_break', { vol: 1 });
    G.shake(1.6);
    G.hud.toast('Vỡ mất ' + BDL.fmt(before) + ' · ' + this.name);
    if (BDL.noise) BDL.noise(this.pos.x, this.pos.y, 10, 2);
    this.removeFromWorld('gone');
  };

  Loot.prototype.removeFromWorld = function (state) {
    if (this.state === 'gone' || this.state === 'onDeck') return;
    this.state = state || 'onDeck';
    this.tethered = false;
    this.G.gfx.scene.remove(this.mesh);
    var list = this.G.loot, i = list ? list.indexOf(this) : -1;
    if (i >= 0) list.splice(i, 1);
  };
  Loot.prototype.remove = function () { this.G.gfx.scene.remove(this.mesh); };

  Loot.prototype.update = function (dt) {
    if (this.state === 'gone' || this.state === 'onDeck') return;
    this.flashT = Math.max(0, this.flashT - dt);
    if (this.tethered) this.asleep = false;
    if (!this.asleep) {
      var r = bodyStep(this.G, this.pos, this.vel, this.r, dt, SINK);
      if (r.imp > 0.05) this.impact(r.imp);
      if (this.state === 'gone') return;
      var sp = Math.hypot(this.vel.x, this.vel.y);
      if (!this.tethered && r.floor && sp < 0.06) {
        this.restT += dt;
        if (this.restT > 0.5) { this.asleep = true; this.vel.x = this.vel.y = 0; }
      } else this.restT = 0;
      this.state = this.tethered ? 'tethered' : this.asleep ? 'rest' : 'sinking';
      // nghiêng theo hướng trôi, nằm thẳng lại khi nghỉ
      var want = this.asleep ? 0 : Math.max(-0.35, Math.min(0.35, -this.vel.x * 0.18));
      this.tilt += (want - this.tilt) * Math.min(1, dt * 4);
    }
    this.draw();
  };

  Loot.prototype.draw = function () {
    this.mesh.position.set(this.pos.x, this.pos.y, this.z);
    this.mesh.rotation.z = this.tilt;
    this.mesh.material.uniforms.flash.value = this.flashT > 0 ? 0.7 : 0;
  };

  BDL.Loot = Loot;

  // ---------- xác cá: xác cá to (và mọi xác đang buộc dây) chìm dần như đồ cổ thay vì nổi lên ----------
  // fish.js / shark.js (không thuộc hệ này) vẫn giữ state dying/dead và bộ đếm tan xác; f.tethered = true thì state dead
  // đứng yên, không đếm giờ. Hệ này mỗi khung trả pos về chỗ nó mô phỏng; vận tốc thật nằm ở f.bdlBody.vel
  // vì state dead ghi đè f.vel mỗi khung.
  function managed(f) {
    if (f.isLoot || !f.sp || f.state === 'reeled' || f.state === 'hauled' || f.state === 'lifted') return false;
    return !!f.tethered || (f.sp.size >= 1 && (f.state === 'dying' || f.state === 'dead'));
  }
  function bodyOf(f) {
    if (f.isLoot) return f;
    if (!f.bdlBody) f.bdlBody = { x: f.pos.x, y: f.pos.y, vel: { x: f.vel.x * 0.5, y: Math.min(0, f.vel.y * 0.5) } };
    return f.bdlBody;
  }
  // Vận tốc dây kéo cộng vào: đồ cổ là vel của nó, cá là thân mô phỏng ở trên.
  BDL.bodyVel = function (t) { return bodyOf(t).vel; };

  function stepCorpses(G, dt) {
    var list = G.fishes ? G.fishes.list : [];
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      if (!managed(f)) { f.bdlBody = null; continue; }
      var fresh = !f.bdlBody, b = bodyOf(f);
      if (!fresh) { f.pos.x = b.x; f.pos.y = b.y; }
      var c = f.center();
      bodyStep(G, f.pos, b.vel, Math.max(0.15, (f.radius || 0.3) * 0.8), dt, CORPSE_SINK, c.x - f.pos.x, c.y - f.pos.y);
      b.x = f.pos.x; b.y = f.pos.y;
      if (f.root) f.root.position.set(f.pos.x, f.pos.y, f.z);
    }
  }

  // ---------- rải đồ cổ ----------
  // Lưới loang từ chỗ Dave nhảy xuống: chỉ rải ở chỗ bơi tới được.
  function reachGrid(G) {
    var W = G.world, x0 = -T.view.boundX - 2, x1 = T.view.boundX + 2;
    var yTop = T.water.surfaceY - 0.3, yBot = G.floors[G.floors.length - 1].y1 - 1;
    var nx = Math.ceil((x1 - x0) / GRID), ny = Math.ceil((yTop - yBot) / GRID);
    var cell = new Uint8Array(nx * ny);   // 0 chưa xét, 1 nước tới được, 2 đá
    var idx = function (x, y) {
      var i = Math.floor((x - x0) / GRID), j = Math.floor((yTop - y) / GRID);
      return i < 0 || j < 0 || i >= nx || j >= ny ? -1 : j * nx + i;
    };
    var d = G.diver, s = idx(d.pos.x, Math.min(d.pos.y, yTop - 0.1)), q = [s];
    if (s < 0) return function () { return true; };
    cell[s] = 1;
    while (q.length) {
      var k = q.pop(), ci = k % nx, cj = (k - ci) / nx;
      var nb = [ci > 0 ? k - 1 : -1, ci < nx - 1 ? k + 1 : -1, cj > 0 ? k - nx : -1, cj < ny - 1 ? k + nx : -1];
      for (var n = 0; n < 4; n++) {
        var m = nb[n];
        if (m < 0 || cell[m]) continue;
        var mi = m % nx, mj = (m - mi) / nx;
        cell[m] = W.solid(x0 + (mi + 0.5) * GRID, yTop - (mj + 0.5) * GRID) ? 2 : 1;
        if (cell[m] === 1) q.push(m);
      }
    }
    return function (x, y) { var i = idx(x, y); return i >= 0 && cell[i] === 1; };
  }

  // Tầng phía dưới nhô lên trên mép nối bị tầng trên che: chỉ đặt lên đá của đúng tầng địa hình đang hiện ở độ cao đó.
  function layerWorld(G, L, cache) {
    if (!cache[L.i]) cache[L.i] = new HX.World(L.zone.walls.map(function (p) { return p.map(function (q) { return [q[0], q[1] + L.yOff]; }); }));
    return cache[L.i];
  }

  // Tầng của một chỗ đặt. Đáy biển hay nằm ngay dưới mép tầng cuối (map 0: tầng 5 là nước trống tới −44,5, đá ở −45…−47):
  // mép trên vùng áp suất (DEEP_LIP m) vẫn tính cho tầng cuối, móc từ phía trên với tới được mà không phải xuống vùng áp suất.
  var DEEP_LIP = 3;
  function floorOf(G, y) {
    var n = G.floors.length, i = BDL.floorAt(y, G.floors);
    return i === n && y >= G.floors[n - 1].y1 - DEEP_LIP ? n - 1 : i;
  }

  function findSpot(G, ctx, fl, row, rnd) {
    var W = G.world, px = row.px || [64, 64], sc = row.len / Math.max(px[0], px[1]);
    var w = px[0] * sc, h = px[1] * sc, r = Math.max(0.12, Math.min(w, h) / 2 * 0.95);
    var bx = T.view.boundX - 1.5, E = ctx.edges[fl.i], why = ctx.why;
    if (!E || !E.total) { why.noFloor++; return null; }
    for (var t = 0; t < 120; t++) {
      // điểm ngẫu nhiên trên mặt đá ngửa của tầng (chọn cạnh theo độ dài), rồi bắn tia từ trên xuống để lấy đúng mặt trên cùng
      var pick = rnd() * E.total, e = E.list[0];
      for (var q = 0; q < E.list.length; q++) { pick -= E.list[q].len; if (pick <= 0) { e = E.list[q]; break; } }
      var u = rnd(), x = e.ax + (e.bx - e.ax) * u, y = e.ay + (e.by - e.ay) * u + 1.2;
      if (Math.abs(x) > bx) { why.reach++; continue; }
      if (fl.i === 0 && Math.abs(x - ctx.startX) < BOAT_CLEAR) { why.boat++; continue; }
      if (!ctx.reach(x, y)) { why.reach++; continue; }
      var hit = W.raycast(x, y, x, y - 2);
      if (!hit || hit.ny < 0.6) { why.noFloor++; continue; }
      var L = G.stack.layerAt(hit.y + 0.05), hl = layerWorld(G, L, ctx.layers).raycast(x, y, x, y - 2);
      if (!hl || Math.abs(hl.y - hit.y) > 0.05) { why.layer++; continue; }
      var cy = hit.y + r + 0.02;
      if (floorOf(G, cy) !== fl.i) { why.band++; continue; }
      if (W.solid(x, cy + h * 0.45) || !ctx.reach(x, cy + h * 0.5 + 0.3)) { why.room++; continue; }
      // món dài: hai đầu ảnh không cắm vào đá
      if (w > 2 * r + 0.1 && (W.solid(x - w * 0.42, cy + h * 0.2) || W.solid(x + w * 0.42, cy + h * 0.2))) { why.wide++; continue; }
      var near = false;
      for (var i = 0; i < G.loot.length; i++) {
        var o = G.loot[i];
        if (Math.abs(o.pos.x - x) < (o.hw + w / 2 + 0.6) && Math.abs(o.pos.y - cy) < 1.5) { near = true; break; }
      }
      if (near) { why.near++; continue; }
      return { x: x, y: cy };
    }
    return null;
  }

  function pickRow(size, wreck, rnd) {
    var rows = BDL.LOOT.filter(function (r) { return r.size === size && !!r.wreck === !!wreck; });
    return rows[Math.floor(rnd() * rows.length)];
  }

  // REPO buildLevel: rải trước, chỉ tiêu tính sau từ đúng tổng giá đã rải. Mỗi tầng = một phòng nhà REPO.
  function scatter(G, map) {
    var rnd = Math.random, t0 = performance.now();
    var cap = BDL.lootCap(map.level), mul = map.lootMul || 1, valueCap = cap.value * mul;
    var floors = G.floors, n = floors.length;
    var L0 = G.stack.layers[0], st = L0.zone.start;
    var edges = floors.map(function () { return { list: [], total: 0 }; });
    G.world.upwardEdges(0.6).forEach(function (e) {
      var fi = floorOf(G, (e.ay + e.by) / 2 + 0.3);
      if (fi < n) { edges[fi].list.push(e); edges[fi].total += e.len; }
    });
    var ctx = { edges: edges, reach: reachGrid(G), layers: {}, startX: st ? st[0] : G.diver.pos.x, why: { boat: 0, reach: 0, noFloor: 0, layer: 0, band: 0, room: 0, wide: 0, near: 0 } };
    var gridMs = performance.now() - t0;
    lastCtx = ctx;
    // số món mỗi tầng: tầng sâu nhiều hơn (×1 → ×1,6), mỗi tầng ít nhất một món
    var count = Math.max(n, cap.count), wts = floors.map(function (f, i) { return 1 + 0.6 * i / Math.max(1, n - 1); });
    var wsum = wts.reduce(function (a, b) { return a + b; }, 0);
    var per = wts.map(function (w) { return Math.max(1, Math.floor(count * w / wsum)); });
    var left = count - per.reduce(function (a, b) { return a + b; }, 0);
    for (var j = n - 1; left > 0; j = (j - 1 + n) % n) { per[j]++; left--; }
    // xếp xen kẽ tầng (món thứ nhất của mọi tầng trước, mỗi vòng từ tầng sâu lên) để trần giá cắt vào tầng nông
    var plan = [], most = Math.max.apply(null, per);
    for (var k = 0; k < most; k++) for (var i = n - 1; i >= 0; i--) if (k < per[i]) plan.push(i);
    var capValue = 0, capBig = 0, capMed = 0, made = [];
    for (var p = 0; p < plan.length; p++) {
      if (capValue >= valueCap) break;
      var fi = plan[p], deep = fi / Math.max(1, n - 1), roll = rnd();
      var size = roll < 0.45 - 0.2 * deep ? 0 : roll < 0.82 - 0.1 * deep ? 1 : 2;
      if (size === 2 && capBig >= cap.big) size = 1;
      if (size === 1 && capMed >= cap.med) size = 0;
      var wreck = size === 2 && deep >= 0.4 && rnd() < 0.25 + 0.3 * deep;
      var row = pickRow(size, wreck, rnd);
      var spot = findSpot(G, ctx, floors[fi], row, rnd);
      if (!spot && wreck) { row = pickRow(size, false, rnd); spot = findSpot(G, ctx, floors[fi], row, rnd); }
      // tầng hết chỗ (nước trống, toàn vách đứng) thì nhường món cho tầng gần nhất còn chỗ, ưu tiên tầng sâu hơn
      for (var dd = 1; !spot && dd < n; dd++) {
        if (fi + dd < n && (spot = findSpot(G, ctx, floors[fi + dd], row, rnd))) fi += dd;
        else if (fi - dd >= 0 && (spot = findSpot(G, ctx, floors[fi - dd], row, rnd))) fi -= dd;
      }
      if (!spot) continue;
      // tầng sâu đắt hơn tới ×1,4 [ĐỀ XUẤT]; lootMul của map như AI.lootValueMul của REPO
      var v0 = Math.round((row.vmin + (row.vmax - row.vmin) * rnd()) * mul * (1 + 0.4 * deep) / 50) * 50;
      capValue += v0;
      if (size === 2) capBig++; else if (size === 1) capMed++;
      var l = new Loot(G, row, spot.x, spot.y, v0);
      l.floor = fi; l.asleep = true;
      G.loot.push(l);
      made.push(l);
    }
    var sum = made.reduce(function (a, l) { return a + l.value0; }, 0);
    BDL.run.setQuota(sum);
    return { sum: sum, count: made.length, cap: cap, valueCap: valueCap, why: ctx.why, gridMs: Math.round(gridMs), ms: Math.round(performance.now() - t0) };
  }

  var stats = null, lastCtx = null;

  BDL.systems.push({
    name: 'loot',
    build: function (G, map) {
      ensureCss();
      G.loot = [];
      stats = scatter(G, map);
      window.BDL_DEBUG.loot = {
        list: function () {
          return G.loot.map(function (l) {
            return { id: l.id, key: l.key, name: l.name, size: l.size, mat: l.matKey, wreck: !!l.row.wreck, x: l.pos.x, y: l.pos.y,
              floor: l.floor, value0: l.value0, value: l.value, mass: l.mass, state: l.state, r: l.r, w: l.w, h: l.h };
          });
        },
        spawn: function (key, x, y) {
          var row = BDL.LOOT_BY_KEY[key];
          if (!row) throw new Error('không có đồ cổ "' + key + '"');
          var l = new Loot(G, row, x, y, Math.round((row.vmin + row.vmax) / 2 / 50) * 50);
          l.floor = BDL.floorAt(y, G.floors);
          G.loot.push(l);
          return l.id;
        },
        reachAt: function (x, y) { return lastCtx ? lastCtx.reach(x, y) : null; },
        edgesOf: function (i) { return lastCtx ? lastCtx.edges[i].list.map(function (e) { return [e.ax, e.ay, e.bx, e.by]; }) : null; },
        get: function (id) { return G.loot.filter(function (l) { return l.id === id; })[0] || null; },
        info: function () {
          var per = G.floors.map(function () { return 0; });
          G.loot.forEach(function (l) { if (l.floor != null && l.floor < per.length) per[l.floor]++; });
          var d = BDL.run.dive, m = G.map;
          return { count: G.loot.length, perFloor: per, built: stats, quota: d ? d.quota : 0, lootTotal: d ? d.lootTotal : 0,
            level: m.level, curve: BDL.curve(m.level), quotaMul: m.quotaMul, lootMul: m.lootMul };
        },
      };
    },
    update: function (dt) {
      var G = HX.game;
      for (var i = G.loot.length - 1; i >= 0; i--) if (G.loot[i]) G.loot[i].update(dt);
      stepCorpses(G, dt);
    },
    teardown: function (G) {
      (G.loot || []).forEach(function (l) { l.remove(); });
      G.loot = [];
      var host = document.getElementById('hud');
      if (host) Array.prototype.slice.call(host.querySelectorAll('.loot-pop')).forEach(function (e) { e.remove(); });
    },
  });
})(window.BDL);
