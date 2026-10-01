// Hệ quái REPO dưới nước: ngủ đầu lượt, sinh xa, phát hiện bằng mắt và tai, mệt rồi bỏ cuộc, chết thì để xác (tối đa 3 lần bán mỗi loại) hoặc tan,
// sau 45 s hồi sinh. Thân quái là cá / cá mập DtD (js/engine/fish.js, shark.js) đặt `brain` = quái; thân chạy trạng thái 'brain' gọi foe.step.
// Luật tra từ REPO_Meta (run_timers, stage_houses, foes) và repo2d/game.js (FOE_KINDS). Số đo lường ở data/foes.js.
(function (BDL) {
  'use strict';
  var HX = window.HX, T = window.HX_TUNING, FD = BDL.FOES;
  var F = null;            // trạng thái của lượt lặn đang chơi
  var fid = 0;
  var CELL = 1.5;

  // ---------- tiện ích ----------
  function mulberry(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var seedParam = parseInt(new URLSearchParams(location.search).get('seed'), 10);
  function lerp(a, b, k) { return a + (b - a) * k; }
  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
  function lastY1() { return F.G.floors[F.G.floors.length - 1].y1; }
  function surf() { return T.water.surfaceY; }

  function daveGone() {
    var G = F.G, d = G.diver;
    return !d || G.phase !== 'dive' || d.state === 'dead' || d.state === 'surfaced' || d.state === 'enter' || !!(G.deck && G.deck.on);
  }

  // Người lặn khác (G.mates do js/mates.js dựng): quái nhắm kẻ gần nhất nhìn thấy được, như foeTarget của REPO.
  function mateAlive(m) { return !!m && !!m.pos && (typeof m.alive === 'function' ? m.alive() : m.alive !== false) && typeof m.hurt === 'function'; }
  function targets() {
    var G = F.G, a = [];
    if (!daveGone() && F.blindT <= 0) a.push(G.diver);
    (G.mates || []).forEach(function (m) { if (mateAlive(m)) a.push(m); });
    return a;
  }
  function tgtOf(foe) {
    var t = foe.tgt;
    return t && t !== F.G.diver && mateAlive(t) ? t : F.G.diver;
  }
  function gone(d) { return d === F.G.diver ? daveGone() : !mateAlive(d); }
  function vulnerable(d) { return d.vulnerable ? d.vulnerable() : true; }

  // ---------- lưới ô nước thông (đi được từ chỗ xuất phát) ----------
  // Chỗ sinh quái và chỗ hồi sinh chỉ lấy ở ô nước nối liền với Dave, không lấy túi nước kín.
  function buildCells(G) {
    var W = G.world, d = G.diver.pos;
    var x0 = W.box.minX, y0 = lastY1() + 0.6, y1 = surf() - 1.6;
    var nx = Math.ceil((W.box.maxX - x0) / CELL), ny = Math.max(1, Math.ceil((y1 - y0) / CELL));
    var st = new Uint8Array(nx * ny);   // 0 chưa xét, 1 thoáng, 2 chặn
    var reach = new Uint8Array(nx * ny);
    function cx(i) { return x0 + (i + 0.5) * CELL; }
    function cy(j) { return y0 + (j + 0.5) * CELL; }
    function open(i, j) {
      if (i < 0 || j < 0 || i >= nx || j >= ny) return false;
      var k = i * ny + j;
      if (!st[k]) st[k] = W.open(cx(i), cy(j), 0.55) ? 1 : 2;
      return st[k] === 1;
    }
    var si = Math.floor((d.x - x0) / CELL), sj = Math.max(0, Math.min(ny - 1, Math.floor((d.y - y0) / CELL)));
    var found = false;
    for (var r = 0; r < 6 && !found; r++) for (var a = -r; a <= r && !found; a++) for (var b = -r; b <= r && !found; b++) {
      if (open(si + a, sj + b)) { si += a; sj += b; found = true; }
    }
    var cells = [], q = [si * ny + sj];
    reach[q[0]] = 1;
    var DIR = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var h = 0; h < q.length; h++) {
      var k = q[h], i = (k / ny) | 0, j = k - i * ny;
      cells.push({ x: cx(i), y: cy(j), fl: BDL.floorAt(cy(j), G.floors) });
      for (var m = 0; m < 4; m++) {
        var ni = i + DIR[m][0], nj = j + DIR[m][1], nk = ni * ny + nj;
        if (!open(ni, nj) || reach[nk]) continue;
        if (W.raycast(cx(i), cy(j), cx(ni), cy(nj))) continue;
        reach[nk] = 1; q.push(nk);
      }
    }
    var byFloor = [];
    G.floors.forEach(function (f, i) { byFloor[i] = cells.filter(function (c) { return c.fl === i; }); });
    return { cells: cells, byFloor: byFloor, reach: reach, nx: nx, ny: ny, x0: x0, y0: y0 };
  }

  function cellAt(x, y) {
    var C = F.grid, i = Math.floor((x - C.x0) / CELL), j = Math.floor((y - C.y0) / CELL);
    return (i < 0 || j < 0 || i >= C.nx || j >= C.ny) ? false : !!C.reach[i * C.ny + j];
  }

  // Điểm thông gần (x, y) trong vòng rmin..rmax.
  function nearSpot(x, y, rmin, rmax) {
    for (var i = 0; i < 24; i++) {
      var a = F.rnd() * Math.PI * 2, r = lerp(rmin, rmax, F.rnd()), px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * 0.6;
      if (cellAt(px, py) && !F.G.world.raycast(x, y, px, py)) return { x: px, y: py };
    }
    return null;
  }

  // Chỗ sinh xa: o = { minDist, maxDist, floor, noLos, boat (mặc định true), avoid[] }. Ngoài khung hình, nước rộng, nối liền với Dave.
  function pickSpot(o) {
    var G = F.G, d = G.diver.pos, cam = G.gfx.camera.position, hv = G.viewHalf, W = G.world;
    var pool = o.floor != null ? F.grid.byFloor[o.floor] || [] : F.grid.cells;
    if (!pool.length) return null;
    for (var k = 0; k < 220; k++) {
      var c = pool[Math.floor(F.rnd() * pool.length)];
      var dd = dist(c.x, c.y, d.x, d.y);
      if (dd < (o.minDist || 0) || dd > (o.maxDist || 1e9)) continue;
      if (o.boat !== false && dist(c.x, c.y, F.boat.x, F.boat.y) < (o.minDist || 0)) continue;
      if (Math.abs(c.x - cam.x) < hv.w + 3 && Math.abs(c.y - cam.y) < hv.h + 3) continue;
      if (!W.open(c.x, c.y, 1.1)) continue;
      if (o.noLos && !W.raycast(c.x, c.y, d.x, d.y) && dd < 40) continue;
      var clash = false;
      (o.avoid || []).forEach(function (p) { if (dist(c.x, c.y, p.x, p.y) < 6) clash = true; });
      if (clash) continue;
      return { x: c.x, y: c.y };
    }
    return null;
  }

  // ---------- dấu hiệu trên đầu (Z ngủ, ! báo trước) ----------
  var texCache = {};
  function markTex(ch, color) {
    var key = ch + color;
    if (texCache[key]) return texCache[key];
    var cv = document.createElement('canvas'); cv.width = cv.height = 96;
    var c = cv.getContext('2d');
    c.font = 'bold 64px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 8; c.strokeStyle = 'rgba(0,20,40,0.85)'; c.strokeText(ch, 48, 52);
    c.fillStyle = color; c.fillText(ch, 48, 52);
    var t = new THREE.CanvasTexture(cv);
    texCache[key] = t;
    return t;
  }
  var MARKS = { Z: ['Zz', '#bfe6ff'], '!': ['!', '#ff5a4a'], '?': ['?', '#ffd54a'], '*': ['*', '#7fd6ff'] };
  function setMark(foe, want) {
    if (foe.markCh === want) return;
    if (foe.mark) { F.G.gfx.scene.remove(foe.mark); foe.mark.material.dispose(); foe.mark = null; }
    foe.markCh = want;
    if (!want) return;
    var m = MARKS[want];
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: markTex(m[0], m[1]), transparent: true, depthTest: false, depthWrite: false }));
    sp.scale.set(0.7, 0.7, 1); sp.renderOrder = 60;
    F.G.gfx.scene.add(sp);
    foe.mark = sp;
  }
  function placeMark(foe) {
    var f = foe.body, sp = foe.mark;
    if (!sp) return;
    var c = f.center(), bob = Math.sin(F.t * 3 + foe.id) * 0.08;
    sp.position.set(c.x, c.y + f.hh + 0.45 + bob + (foe.markCh === 'Z' ? (F.t * 0.35 + foe.id) % 0.5 : 0), 0.8);
    sp.visible = !!f.root.visible;
    sp.material.opacity = foe.markCh === 'Z' ? 0.6 + 0.4 * Math.sin(F.t * 2 + foe.id) : 1;
  }

  // ---------- chuyển động ----------
  function blockedAt(x, y) { return F.G.world.solid(x, y) || y > surf() - 1.0 || y < lastY1() + 0.2; }

  // Một bước theo vận tốc hiện tại, trượt theo vách. Trả 'ok' | 'slide' | 'blocked'. noclip: xuyên đá (sứa ma).
  function stepBody(f, dt, noclip) {
    var nx = f.pos.x + f.vel.x * dt, ny = f.pos.y + f.vel.y * dt;
    if (noclip) {
      f.pos.x = nx; f.pos.y = Math.max(lastY1() + 0.3, Math.min(surf() - 1.0, ny));
      return 'ok';
    }
    var sp = Math.hypot(f.vel.x, f.vel.y) || 1, ahead = Math.min(f.hw * 0.6, 0.9);
    var ux = f.vel.x / sp * ahead, uy = f.vel.y / sp * ahead;
    if (!blockedAt(nx + ux, ny + uy) && !blockedAt(nx, ny)) { f.pos.x = nx; f.pos.y = ny; return 'ok'; }
    if (!blockedAt(nx + Math.sign(ux) * ahead, f.pos.y) && !blockedAt(nx, f.pos.y)) { f.pos.x = nx; f.vel.y *= 0.4; return 'slide'; }
    if (!blockedAt(f.pos.x, ny + Math.sign(uy) * ahead) && !blockedAt(f.pos.x, ny)) { f.pos.y = ny; f.vel.x *= 0.4; return 'slide'; }
    f.vel.x *= -0.3; f.vel.y *= -0.3;
    return 'blocked';
  }

  function steerTo(f, tx, ty, speed, dt, turn) {
    var dx = tx - f.pos.x, dy = ty - f.pos.y, l = Math.hypot(dx, dy) || 1, k = Math.min(1, (turn || 3) * dt);
    speed *= f.slow == null ? 1 : f.slow;
    f.vel.x += (dx / l * speed - f.vel.x) * k;
    f.vel.y += (dy / l * speed - f.vel.y) * k;
    return l;
  }

  // Bơi tới (tx, ty); kẹt vách quá 1 s thì vòng sang một điểm thông gần đó 2 s.
  function swimTo(foe, f, tx, ty, speed, dt, turn, noclip) {
    if (foe.detourT > 0) { foe.detourT -= dt; tx = foe.detour.x; ty = foe.detour.y; }
    var l = steerTo(f, tx, ty, speed, dt, turn);
    var r = stepBody(f, dt, noclip);
    if (r === 'blocked' && !noclip) foe.stuckT += dt; else foe.stuckT = Math.max(0, foe.stuckT - dt);
    if (foe.stuckT > 1) {
      foe.stuckT = 0; foe.stuckN = (foe.stuckN || 0) + 1;
      var p = nearSpot(f.pos.x, f.pos.y, 3, 8);
      if (p) { foe.detour = p; foe.detourT = 2; }
    }
    return l;
  }

  function anim(f, role, speed) {
    if (f.sp.shark) f.play(role, { speed: speed || 1 });
    else f.setAnim(role === 'sprint' || role === 'dash' ? 'sprint' : 'swim', true, speed || 1);
  }
  function faceTo(f, x) {
    var want = x > f.pos.x ? 1 : -1;
    if (f.sp.shark) f.face(want); else if (f.sp.id.indexOf('Jelly') < 0) f.facing = want;
  }
  function freezeAnim(f, on) {
    if (f.sp.shark) f.setFrozenAnim(on); else f.mesh.state.timeScale = on ? 0 : 1;
  }
  function tint(f, r, g, b, a) { f.fu.tint.value.set(r, g, b, a); }
  function untint(f) { f.buffLook(); }

  // ---------- cảm nhận ----------
  function lineOfSight(foe) {
    var G = F.G, c = foe.body.center(), d = G.diver.pos;
    return !G.world.raycast(c.x, c.y, d.x, d.y);
  }

  function lootTarget() {
    var t = BDL.tether && BDL.tether.target && BDL.tether.target();
    return t && t.pos ? t : null;
  }

  function sense(foe) {
    var G = F.G, f = foe.body, d = G.diver, row = foe.row;
    foe.sensed = false;
    var c = f.center();
    foe.ddDave = daveGone() ? 99 : dist(c.x, c.y, d.pos.x, d.pos.y);
    var list = targets();
    if (!list.length) { foe.see = false; foe.dd = 99; return; }
    // kỹ năng crew: quái đang bị choáng / dụ / nhốt thì không thấy, không nghe gì (Dave tàng hình: Dave rời danh sách, đồng đội vẫn bị thấy)
    if (ctlActive(foe)) { foe.see = false; foe.dd = foe.ddDave; return; }
    var best = null, bd = 1e9, heardDave = false;
    list.forEach(function (t) {
      var dd = dist(c.x, c.y, t.pos.x, t.pos.y);
      var los = row.immune || !G.world.raycast(c.x, c.y, t.pos.x, t.pos.y);
      var dx = t.pos.x - c.x, cone = false;
      if (dd < FD.SIGHT_NEAR || row.immune) cone = true;
      else if (dx * f.facing > 0 && Math.acos(Math.min(1, dx * f.facing / dd)) < FD.SIGHT_CONE) cone = true;
      if (dd <= row.sight && los && cone && dd < bd) { bd = dd; best = t; }
      if (t === d && dd < row.hear * 0.6 && Math.hypot(d.vel.x, d.vel.y) > 0.5 && !d.boosting) heardDave = true;
    });
    foe.see = !!best;
    if (!best && heardDave) best = d;
    if (best) { foe.tgt = best; foe.dd = dist(c.x, c.y, best.pos.x, best.pos.y); } else foe.dd = dist(c.x, c.y, tgtOf(foe).pos.x, tgtOf(foe).pos.y);
    if (foe.see) foe.lastSeenT = F.t;
    if (best) { foe.sensed = true; foe.invest = null; foe.lastKnown = { x: best.pos.x, y: best.pos.y }; }
    // lũ rỉa và kẻ cướp để ý món đồ Dave đang kéo
    if ((row.brain === 'gnome' || row.brain === 'brat') && !foe.sensed) {
      var t = lootTarget();
      if (t && dist(c.x, c.y, t.pos.x, t.pos.y) < row.sight && (!G.world.raycast(c.x, c.y, t.pos.x, t.pos.y))) {
        foe.sensed = true; foe.lastKnown = { x: d.pos.x, y: d.pos.y };
      }
    }
  }

  function alertFoe(foe, x, y, force) {
    if (foe.dead || foe.asleep || foe.restT > 0) return;
    if (ctlActive(foe) || (F.blindT > 0 && !force)) return;
    foe.alertT = 2.6;
    if (x != null) foe.lastKnown = { x: x, y: y };
    if (!foe.aware) {
      foe.aware = true; foe.chaseT = 0;
      var B = BR[foe.row.brain];
      if (B.onAlert) B.onAlert(foe, foe.body);
    }
  }
  function calmFoe(foe) {
    if (!foe.aware) return;
    foe.aware = false; foe.alertT = 0; foe.chaseT = 0;
    var B = BR[foe.row.brain];
    if (B.onCalm) B.onCalm(foe, foe.body);
    foe.body.slow = 1; if (foe.body.buffLook) foe.body.buffLook();
  }

  function wakeFoe(foe, why) {
    if (!foe.asleep || foe.dead) return;
    foe.asleep = false;
    var f = foe.body;
    if (f.state === 'sleep') f.go('brain');
    foe.mode = 'patrol'; foe.mt = 0; foe.rm = null; foe.pauseT = 0; foe.lastSeenT = F.t;
    setMark(foe, null);
    (foe.pack || []).forEach(function (o) { if (o !== foe) wakeFoe(o, why); });
    foe.wokeBy = why;
  }

  // BDL.noise(x, y, r, strength): quái trong r × strength mét nghe thấy: đang ngủ thì tỉnh, đang thức thì cảnh giác, tới chỗ tiếng động.
  BDL.noise = function (x, y, r, strength) {
    if (!F) return 0;
    var reach = r * (strength || 1), n = 0;
    F.foes.forEach(function (foe) {
      if (foe.dead || foe.row.noise === false) return;
      var c = foe.body.center();
      if (dist(c.x, c.y, x, y) > reach) return;
      n++;
      var was = foe.asleep, near = dist(c.x, c.y, x, y) < 6;
      if (was) wakeFoe(foe, 'noise');
      // tiếng động xa: đi tới xem (REPO investigate), tới gần mà thấy Dave mới đuổi; vừa bị đánh thức hoặc ngay cạnh thì giật mình
      if (was || near) alertFoe(foe, x, y);
      if (!foe.dead) { foe.invest = { x: x, y: y }; foe.investT = F.t + 30; }
    });
    return n;
  };

  // ---------- bắn gai ----------
  function fireSpine(foe, f, tx, ty) {
    var G = F.G, c = f.center(), a = Math.atan2(ty - c.y, tx - c.x), sx = c.x + Math.cos(a) * (f.hw * 0.6), sy = c.y + Math.sin(a) * (f.hw * 0.4);
    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.1), new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, depthTest: false, depthWrite: false }));
    mesh.rotation.z = a; mesh.position.set(sx, sy, 0.3); mesh.renderOrder = 55;
    G.gfx.scene.add(mesh);
    var sp = foe.row.shotSpeed || 7;
    F.shots.push({ x: sx, y: sy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, dmg: foe.dmg, mesh: mesh, from: foe });
    G.fx.burst('bubble', sx, sy, 3, 0.8);
    if (window.HX_ASSETS.audio.harpoon_shot) G.audio.play('harpoon_shot', { vol: 0.35, rate: 1.5 });
    BDL.noise(sx, sy, 6, 1);
  }

  function updateShots(dt) {
    var G = F.G, d = G.diver;
    for (var i = F.shots.length - 1; i >= 0; i--) {
      var s = F.shots[i], gone = false;
      s.t += dt;
      var nx = s.x + s.vx * dt, ny = s.y + s.vy * dt;
      if (G.world.raycast(s.x, s.y, nx, ny) || G.world.solid(nx, ny) || s.t > 3) {
        gone = true; G.fx.burst('spark', nx, ny, 3, 1.2);
      } else {
        var ts = targets();
        for (var k = 0; k < ts.length; k++) {
          if (dist(nx, ny, ts[k].pos.x, ts[k].pos.y) < 0.4 && vulnerable(ts[k])) {
            ts[k].hurt(s.dmg, s.x - s.vx * 0.1, s.y - s.vy * 0.1);
            G.fx.burst('spark', nx, ny, 4, 1.5);
            gone = true; break;
          }
        }
      }
      s.x = nx; s.y = ny;
      s.mesh.position.set(nx, ny, 0.3);
      if (gone) { G.gfx.scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); F.shots.splice(i, 1); }
    }
  }

  // ---------- nổ ----------
  function explode(foe, f) {
    var G = F.G, c = f.center(), d = G.diver, R = foe.row.blast || 3;
    G.fx.burst('puff', c.x, c.y, 14, 2.2);
    G.fx.burst('spark', c.x, c.y, 12, 3);
    G.fx.burst('bubbleBig', c.x, c.y, 8, 2);
    G.fx.spawn('glow', c.x, c.y, 0.5, 0, 0, 2.2);
    G.shake(1.5);
    G.audio.play(window.HX_ASSETS.audio.gun_grenade_explode ? 'gun_grenade_explode' : 'harpoon_hit_rock', { vol: 0.8 });
    foe.exploded = true;
    var hurt = false;
    targets().forEach(function (t) {
      if (dist(c.x, c.y, t.pos.x, t.pos.y) <= R) { var h = t.hurt(foe.dmg, c.x, c.y); if (t === d) hurt = h; }
    });
    (G.loot || []).forEach(function (l) { if (l.pos && l.hit && dist(c.x, c.y, l.pos.x, l.pos.y) <= R) l.hit(foe.dmg * 2, c.x, c.y); });
    foe.explodeHurt = hurt;
    BDL.noise(c.x, c.y, 8, 1);
    f.hp = 0;
    f.go('reeled');
  }

  // ---------- các bộ não ----------
  // Mọi bộ não: step(foe, f, G, dt) chạy trong trạng thái 'brain' của thân; onAlert / onCalm tuỳ chọn.
  var BR = {};

  function setMode(foe, m) { foe.mode = m; foe.mt = 0; }

  // ---------- đi lang thang (REPO: quái đi giữa các phòng, nghe tiếng thì tới xem) ----------
  // Tầng = "phòng" của REPO. Đường đi là BFS trên lưới ô nước thông rồi làm thẳng bằng tia, nên không xuyên đá.
  function floorOfY(y) { return Math.max(0, Math.min(F.G.floors.length - 1, BDL.floorAt(y, F.G.floors))); }

  function nodeCell(x, y) {
    var C = F.grid, i0 = Math.floor((x - C.x0) / CELL), j0 = Math.floor((y - C.y0) / CELL);
    for (var r = 0; r <= 4; r++) {
      for (var a = -r; a <= r; a++) for (var b = -r; b <= r; b++) {
        if (Math.max(Math.abs(a), Math.abs(b)) !== r) continue;
        var i = i0 + a, j = j0 + b;
        if (i >= 0 && j >= 0 && i < C.nx && j < C.ny && C.reach[i * C.ny + j]) return i * C.ny + j;
      }
    }
    return -1;
  }

  function findPath(sx, sy, tx, ty) {
    var C = F.grid, ny = C.ny, s = nodeCell(sx, sy), t = nodeCell(tx, ty);
    if (s < 0 || t < 0) return null;
    var par = new Int32Array(C.nx * ny).fill(-2), q = [s], h = 0;
    par[s] = -1;
    while (h < q.length && par[t] === -2) {
      var k = q[h++], i = (k / ny) | 0, j = k - i * ny;
      for (var di = -1; di <= 1; di++) for (var dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        var ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= C.nx || nj >= ny) continue;
        var nk = ni * ny + nj;
        if (!C.reach[nk] || par[nk] !== -2) continue;
        if (di && dj && (!C.reach[(i + di) * ny + j] || !C.reach[i * ny + nj])) continue;
        par[nk] = k; q.push(nk);
      }
    }
    if (par[t] === -2) return null;
    var nodes = [];
    for (var c = t; c >= 0; c = par[c]) { var ci = (c / ny) | 0, cj = c - ci * ny; nodes.push({ x: C.x0 + (ci + 0.5) * CELL, y: C.y0 + (cj + 0.5) * CELL }); }
    nodes.reverse();
    nodes[0] = { x: sx, y: sy }; nodes.push({ x: tx, y: ty });
    // làm thẳng: nhảy tới nút xa nhất còn nhìn thấy nhau (3 tia để chừa bề ngang thân)
    var W = F.G.world, out = [], i2 = 0, last = nodes.length - 1;
    function clear(a, b) {
      var dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, nx = -dy / l * 0.5, ny2 = dx / l * 0.5;
      return !W.raycast(a.x, a.y, b.x, b.y) && !W.raycast(a.x + nx, a.y + ny2, b.x + nx, b.y + ny2) && !W.raycast(a.x - nx, a.y - ny2, b.x - nx, b.y - ny2);
    }
    while (i2 < last) {
      var j2 = Math.min(last, i2 + 14);
      while (j2 > i2 + 1 && !clear(nodes[i2], nodes[j2])) j2--;
      out.push(nodes[j2]); i2 = j2;
    }
    return out;
  }

  function planTo(foe, goal, kind, noclip) {
    var f = foe.body, path = noclip ? null : findPath(f.pos.x, f.pos.y, goal.x, goal.y);
    if (!path) { if (!noclip && kind !== 'noise') return null; path = [{ x: goal.x, y: goal.y }]; }
    var len = 0, px = f.pos.x, py = f.pos.y;
    path.forEach(function (p) { len += dist(px, py, p.x, p.y); px = p.x; py = p.y; });
    return { path: path, pi: 0, kind: kind, goal: goal, ttl: len / Math.max(0.3, foe.row.speed * 0.4) + 10 };
  }

  function pickCell(fl, ok) {
    var pool = F.grid.byFloor[fl] || [];
    for (var k = 0; k < 24 && pool.length; k++) {
      var c = pool[Math.floor(F.rnd() * pool.length)];
      if (ok(c) && F.G.world.open(c.x, c.y, 1.1)) return c;
    }
    return null;
  }

  // Phòng kế bên là chính, thỉnh thoảng nhảy 2 phòng, ít khi ở lại phòng cũ.
  function pickRoam(foe, noclip) {
    var nF = F.G.floors.length, f = foe.body, cur = floorOfY(f.pos.y), r = F.rnd();
    var step = r < 0.7 ? 1 : r < 0.9 ? 2 : 0, sgn = F.rnd() < 0.5 ? -1 : 1;
    for (var tries = 0; tries < 6; tries++) {
      var fl = cur + sgn * step;
      if (fl < 0 || fl >= nF) { sgn = -sgn; fl = cur + sgn * step; }
      if (fl < 0 || fl >= nF) fl = cur;
      var c = pickCell(fl, function (c) { return dist(c.x, c.y, f.pos.x, f.pos.y) > 12; });
      if (c) { var p = planTo(foe, { x: c.x, y: c.y }, 'roam', noclip); if (p) return p; }
      step = tries % 2 ? 1 : 0; sgn = -sgn;
    }
    return null;
  }

  // Lượt "săn lạc" (REPO relocate): đi tới một chỗ khuất tầm nhìn ở tầng Dave đang đứng hoặc tầng kề. Không dịch chuyển.
  function pickHunt(foe, noclip) {
    if (daveGone()) return null;
    var G = F.G, d = G.diver.pos, cam = G.gfx.camera.position, hv = G.viewHalf, df = floorOfY(d.y);
    var order = [df, df - 1, df + 1].filter(function (x) { return x >= 0 && x < G.floors.length; }).sort(function () { return F.rnd() - 0.5; });
    for (var pass = 0; pass < 2; pass++) for (var i = 0; i < order.length; i++) {
      var c = pickCell(order[i], function (c) {
        var dd = dist(c.x, c.y, d.x, d.y);
        if (Math.abs(c.x - cam.x) < hv.w + 4 && Math.abs(c.y - cam.y) < hv.h + 4) return false;
        if (dd < 10 || dd > 60) return false;
        return pass ? true : !!G.world.raycast(c.x, c.y, d.x, d.y);
      });
      if (c) { var p = planTo(foe, { x: c.x, y: c.y }, 'hunt', noclip); if (p) return p; }
    }
    return null;
  }

  function huntChance(foe) {
    var unseen = F.t - foe.lastSeenT;
    return Math.min(0.9, 0.2 + 0.4 * Math.min(1, unseen / 90) + 0.025 * (F.roster.level - 1));
  }

  function patrol(foe, f, dt, noclip) {
    var row = foe.row, rm = foe.rm;
    if (foe.invest && F.t > foe.investT) foe.invest = null;
    if (foe.invest) {
      rm = foe.rm = planTo(foe, foe.invest, 'noise', noclip); foe.invest = null; foe.pauseT = 0; foe.stuckN = 0;
    } else if (!rm || rm.kind !== 'noise') {
      foe.huntT -= dt;
      if (foe.huntT <= 0) {
        foe.huntT = 20 + F.rnd() * 15;
        if (F.rnd() < huntChance(foe)) { var hp = pickHunt(foe, noclip); if (hp) { rm = foe.rm = hp; foe.pauseT = 0; foe.stuckN = 0; foe.hunts = (foe.hunts || 0) + 1; } }
      }
    }
    var slow = foe.restT > 0 ? 0.55 : 1;
    if (foe.pauseT > 0) {
      foe.pauseT -= dt;
      var kd = Math.exp(-2 * dt); f.vel.x *= kd; f.vel.y *= kd;
      stepBody(f, dt, noclip);
      anim(f, 'swim', 0.5);
      return;
    }
    if (!rm) {
      rm = foe.rm = pickRoam(foe, noclip); foe.stuckN = 0;
      if (!rm) { var sp = nearSpot(f.pos.x, f.pos.y, 3, 9) || { x: f.pos.x, y: f.pos.y }; rm = foe.rm = { path: [sp], pi: 0, kind: 'roam', goal: sp, ttl: 10 }; }
    }
    var p = rm.path[rm.pi];
    if (dist(f.pos.x, f.pos.y, p.x, p.y) < (rm.pi === rm.path.length - 1 ? 1 : 1.8)) rm.pi++;
    rm.ttl -= dt;
    if (rm.pi >= rm.path.length || rm.ttl <= 0 || (foe.stuckN || 0) >= 3) {
      var arrived = rm.pi >= rm.path.length;
      foe.rm = null; foe.stuckN = 0;
      if (arrived) foe.pauseT = rm.kind === 'noise' ? 2.5 + F.rnd() * 2 : 1.2 + F.rnd() * 2.2;
      return;
    }
    var k = (rm.kind === 'roam' ? 0.6 : 0.85) * slow * (noclip ? 1.3 : 1);
    swimTo(foe, f, p.x, p.y, row.speed * k, dt, 1.8, noclip);
    anim(f, 'swim', 0.8);
  }

  function targetPos(foe) {
    var d = tgtOf(foe);
    return foe.see || !foe.lastKnown ? { x: d.pos.x, y: d.pos.y } : foe.lastKnown;
  }

  // Kẻ húc
  BR.rook = {
    step: function (foe, f, G, dt) {
      var row = foe.row, d = tgtOf(foe);
      foe.mt += dt;
      switch (foe.mode) {
        case 'patrol':
          if (foe.aware) { setMode(foe, 'approach'); break; }
          patrol(foe, f, dt);
          break;
        case 'approach': {
          if (!foe.aware) { setMode(foe, 'patrol'); break; }
          var tp = targetPos(foe);
          swimTo(foe, f, tp.x, tp.y, row.speed * foe.speedK, dt, 2.5);
          anim(f, 'cruise', 1);
          if (foe.see && foe.dd < 8.5) { setMode(foe, 'telegraph'); foe.aimAt = null; }
          break;
        }
        case 'telegraph': {
          f.vel.x *= Math.exp(-5 * dt); f.vel.y *= Math.exp(-5 * dt);
          faceTo(f, d.pos.x);
          f.pos.x += Math.sin(foe.mt * 45) * 0.012;
          var pulse = 0.25 + 0.2 * Math.sin(foe.mt * 14);
          tint(f, 1, 0.2, 0.1, pulse);
          anim(f, 'swim', 0.5);
          if (foe.mt >= row.telegraph) {
            var tp2 = gone(d) ? foe.lastKnown || d.pos : d.pos, c = f.center();
            var l = dist(c.x, c.y, tp2.x, tp2.y) || 1;
            foe.dir = { x: (tp2.x - c.x) / l, y: (tp2.y - c.y) / l };
            setMode(foe, 'charge'); untint(f);
            G.audio.play(window.HX_ASSETS.audio.dave_dash ? 'dave_dash' : 'harpoon_shot', { vol: 0.4, rate: 0.6 });
          }
          break;
        }
        case 'charge': {
          var sp = row.chargeSpeed * (f.slow == null ? 1 : f.slow);
          f.vel.x = foe.dir.x * sp; f.vel.y = foe.dir.y * sp;
          faceTo(f, f.pos.x + foe.dir.x);
          anim(f, 'sprint', 1.3);
          var r = stepBody(f, dt, false);
          if (!gone(d) && f.hitTest(d.pos.x, d.pos.y, 0.35) && vulnerable(d)) {
            var cc = f.center();
            if (d.hurt(foe.dmg, cc.x, cc.y)) { f.vel.x *= 0.2; f.vel.y *= 0.2; setMode(foe, 'recover'); foe.hitDave = (foe.hitDave || 0) + 1; break; }
          }
          if (r !== 'ok') {
            setMode(foe, 'stun'); foe.stunned = (foe.stunned || 0) + 1;
            G.shake(1); G.fx.burst('dust', f.pos.x + foe.dir.x, f.pos.y + foe.dir.y, 8, 1.5);
            G.audio.play('harpoon_hit_rock', { vol: 0.7 });
            BDL.noise(f.pos.x, f.pos.y, 6, 1);
          } else if (foe.mt >= row.chargeTime) setMode(foe, 'recover');
          break;
        }
        case 'stun':
          f.vel.x *= Math.exp(-6 * dt); f.vel.y *= Math.exp(-6 * dt);
          stepBody(f, dt, false);
          freezeAnim(f, true);
          tint(f, 0.4, 0.6, 1, 0.35);
          if (foe.mt >= row.stun) { freezeAnim(f, false); untint(f); setMode(foe, 'recover'); foe.mt = 0.6; }
          break;
        case 'recover': {
          // sau cú húc: lùi ra xa một nhịp rồi tính tiếp
          var back = targetPos(foe);
          swimTo(foe, f, f.pos.x - (back.x - f.pos.x), f.pos.y, row.speed * 0.5, dt, 2);
          anim(f, 'swim', 0.8);
          if (foe.mt >= 1.6) setMode(foe, foe.aware ? 'approach' : 'patrol');
          break;
        }
      }
    },
    mark: function (foe) { return foe.mode === 'telegraph' ? '!' : foe.mode === 'stun' ? '*' : null; },
    busy: function (foe) { return foe.mode === 'telegraph' || foe.mode === 'charge' || foe.mode === 'stun'; },
    onCalm: function (foe, f) { if (foe.mode !== 'stun' && foe.mode !== 'charge' && foe.mode !== 'telegraph') setMode(foe, 'patrol'); },
  };

  // Cá mập săn: AI đuổi + cắn gốc của cá mập (chase → charge → attack → recover). Bộ não chỉ lo tuần và bật / tắt chế độ săn.
  BR.chaser = {
    step: function (foe, f, G, dt) {
      foe.mt += dt;
      if (foe.aware && !foe.hunt) { foe.hunt = true; f.go('chase'); return; }
      patrol(foe, f, dt);
    },
    onAlert: function (foe, f) {
      if (foe.asleep || foe.hunt) return;
      if (f.state === 'brain') { foe.hunt = true; f.go('chase'); }
    },
    onCalm: function (foe, f) {
      if (foe.hunt) { foe.hunt = false; if (['chase', 'charge', 'recover'].indexOf(f.state) >= 0) { f.go('wander'); } }
    },
  };

  // Kẻ bắn
  BR.gunner = {
    step: function (foe, f, G, dt) {
      var row = foe.row, d = tgtOf(foe);
      foe.mt += dt; foe.cd = Math.max(0, (foe.cd || 0) - dt);
      if (foe.mode === 'patrol') {
        if (foe.aware) setMode(foe, 'engage'); else { patrol(foe, f, dt); return; }
      }
      if (!foe.aware && foe.mode === 'engage') { setMode(foe, 'patrol'); return; }
      var tp = targetPos(foe), c = f.center(), dd = dist(c.x, c.y, tp.x, tp.y);
      if (foe.mode === 'aim') {
        f.vel.x *= Math.exp(-5 * dt); f.vel.y *= Math.exp(-5 * dt);
        faceTo(f, tp.x);
        anim(f, 'swim', 0.4);
        if (foe.mt >= row.aim) {
          fireSpine(foe, f, d.pos.x, d.pos.y);
          foe.shots = (foe.shots || 0) + 1;
          foe.cd = row.cooldown; setMode(foe, 'engage');
        }
        return;
      }
      faceTo(f, tp.x);
      if (foe.see && foe.cd <= 0 && dd <= row.shotRange && dd >= 2.5) { setMode(foe, 'aim'); return; }
      var want = row.keep, sp = row.speed * foe.speedK;
      if (!foe.see) swimTo(foe, f, tp.x, tp.y, sp, dt, 2.2);
      else if (dd < want - 1.2) swimTo(foe, f, f.pos.x + (c.x - tp.x), f.pos.y + (c.y - tp.y), sp, dt, 3);
      else if (dd > want + 1.5) swimTo(foe, f, tp.x, tp.y, sp, dt, 2.2);
      else swimTo(foe, f, f.pos.x - (tp.y - c.y) * 0.3, f.pos.y + (tp.x - c.x) * 0.3, sp * 0.5, dt, 2);
      anim(f, 'swim', 1);
    },
    mark: function (foe) { return foe.mode === 'aim' ? '!' : null; },
    busy: function (foe) { return foe.mode === 'aim'; },
  };

  // Bom con
  BR.banger = {
    step: function (foe, f, G, dt) {
      var row = foe.row, d = tgtOf(foe);
      foe.mt += dt;
      if (foe.mode === 'patrol') {
        if (foe.aware) setMode(foe, 'rush'); else { patrol(foe, f, dt); return; }
      }
      if (!foe.aware && foe.mode === 'rush') { setMode(foe, 'patrol'); return; }
      var tp = targetPos(foe);
      if (foe.mode === 'rush') {
        // mỗi con lệch một chút để cả bầy không dồn thành một điểm
        var ox = Math.cos(foe.id * 1.7) * 0.5, oy = Math.sin(foe.id * 2.3) * 0.5;
        swimTo(foe, f, tp.x + ox, tp.y + oy, row.speed * foe.speedK, dt, 3);
        anim(f, 'sprint', 1);
        if (foe.dd < row.fuseNear && !gone(d)) setMode(foe, 'fuse');
        return;
      }
      if (foe.mode === 'fuse') {
        swimTo(foe, f, d.pos.x, d.pos.y, row.speed * 0.6, dt, 3);
        anim(f, 'sprint', 1.4);
        var k = foe.mt / row.fuse, blink = Math.sin(foe.mt * (6 + k * 20)) > 0;
        if (blink) tint(f, 1, 0.15, 0.05, 0.7); else untint(f);
        if (foe.mt > 0.4 && foe.dd > row.fuseNear * 2.2) { untint(f); setMode(foe, 'rush'); return; }
        if (foe.mt >= row.fuse) explode(foe, f);
      }
    },
    mark: function (foe) { return foe.mode === 'fuse' ? '!' : null; },
    busy: function (foe) { return foe.mode === 'fuse'; },
  };

  // Lũ rỉa
  BR.gnome = {
    step: function (foe, f, G, dt) {
      var row = foe.row, d = tgtOf(foe);
      foe.mt += dt; foe.cd = Math.max(0, (foe.cd || 0) - dt);
      if (foe.mode === 'patrol') {
        if (foe.aware) setMode(foe, 'rush'); else { patrol(foe, f, dt); return; }
      }
      if (!foe.aware) { setMode(foe, 'patrol'); return; }
      var loot = lootTarget(), tx, ty;
      if (loot) { tx = loot.pos.x; ty = loot.pos.y; } else { var tp = targetPos(foe); tx = tp.x; ty = tp.y; }
      var a = F.t * 4 + foe.id * 2.1, orbit = foe.cd > 0 ? 0.9 : 0.25;
      swimTo(foe, f, tx + Math.cos(a) * orbit, ty + Math.sin(a) * orbit, row.speed * foe.speedK, dt, 5);
      anim(f, 'sprint', 1.3);
      var near = dist(f.pos.x, f.pos.y, tx, ty);
      if (near < 0.8 && foe.cd <= 0) {
        foe.cd = row.biteCd;
        if (loot) {
          foe.lootBites = (foe.lootBites || 0) + 1;
          if (loot.hit) loot.hit(foe.dmg * row.lootMul, f.pos.x, f.pos.y);
          G.fx.burst('spark', tx, ty, 3, 1);
        } else if (!gone(d) && vulnerable(d)) {
          foe.daveBites = (foe.daveBites || 0) + 1;
          d.hurt(foe.dmg, f.pos.x, f.pos.y);
        }
      }
    },
  };

  // Kẻ cướp
  BR.brat = {
    step: function (foe, f, G, dt) {
      var row = foe.row, d = tgtOf(foe);
      foe.mt += dt;
      if (foe.mode === 'flee') {
        var carry = foe.carry;
        if (!foe.flee || dist(f.pos.x, f.pos.y, foe.flee.x, foe.flee.y) < 1.5 || foe.mt >= row.carryTime) { dropCarry(foe); setMode(foe, 'patrol'); foe.home = { x: f.pos.x, y: f.pos.y }; return; }
        swimTo(foe, f, foe.flee.x, foe.flee.y, row.speed * 0.85, dt, 3);
        anim(f, 'sprint', 1);
        if (carry) { carry.pos.x = f.pos.x; carry.pos.y = f.pos.y - 0.2; if (carry.vel) { carry.vel.x = 0; carry.vel.y = 0; } }
        return;
      }
      if (foe.mode === 'patrol') {
        if (foe.aware) setMode(foe, 'stalk'); else { patrol(foe, f, dt); return; }
      }
      if (!foe.aware) { setMode(foe, 'patrol'); return; }
      var loot = lootTarget();
      if (loot) {
        swimTo(foe, f, loot.pos.x, loot.pos.y, row.speed * foe.speedK, dt, 4);
        anim(f, 'sprint', 1.2);
        if (dist(f.pos.x, f.pos.y, loot.pos.x, loot.pos.y) < 0.8) grab(foe, f, loot);
      } else {
        // chưa có gì để cướp: lượn quanh Dave, giữ cách khoảng 8 m
        var tp = targetPos(foe), dd = dist(f.pos.x, f.pos.y, tp.x, tp.y);
        if (dd < 6) swimTo(foe, f, f.pos.x + (f.pos.x - tp.x), f.pos.y + (f.pos.y - tp.y), row.speed * 0.6, dt, 3);
        else if (dd > 10) swimTo(foe, f, tp.x, tp.y, row.speed * 0.6, dt, 3);
        else swimTo(foe, f, f.pos.x - (tp.y - f.pos.y) * 0.4, f.pos.y + (tp.x - f.pos.x) * 0.4, row.speed * 0.4, dt, 2);
        anim(f, 'swim', 1);
      }
    },
    onCalm: function (foe) { if (foe.mode !== 'flee') setMode(foe, 'patrol'); },
  };
  function grab(foe, f, loot) {
    var G = F.G;
    if (BDL.tether && BDL.tether.release) BDL.tether.release();
    foe.carry = loot; loot.carriedBy = foe;
    foe.grabs = (foe.grabs || 0) + 1;
    var d = G.diver.pos, best = null, bd = -1;
    for (var i = 0; i < 24; i++) {
      var c = F.grid.cells[Math.floor(F.rnd() * F.grid.cells.length)], dd = dist(c.x, c.y, d.x, d.y);
      if (dd > bd && dd < 60 && dist(c.x, c.y, f.pos.x, f.pos.y) < 45) { bd = dd; best = c; }
    }
    foe.flee = best ? { x: best.x, y: best.y } : { x: f.pos.x + (f.pos.x - d.x) * 3, y: f.pos.y };
    setMode(foe, 'flee');
    G.fx.burst('bubble', f.pos.x, f.pos.y, 6, 1);
    if (G.hud && G.hud.toast) G.hud.toast('Kẻ cướp giật mất đồ!');
  }
  function dropCarry(foe) {
    if (foe.carry) { foe.carry.carriedBy = null; foe.carry = null; }
  }

  // Sứa ma
  BR.ghost = {
    init: function (foe, f) { f.fu.opacity.value = 0.55; },
    step: function (foe, f, G, dt) {
      var row = foe.row, d = tgtOf(foe);
      foe.mt += dt; foe.cd = Math.max(0, (foe.cd || 0) - dt);
      f.fu.opacity.value = 0.55;
      if (foe.mode === 'retreat') {
        swimTo(foe, f, f.pos.x - foe.away.x * 3, f.pos.y - foe.away.y * 3, row.speed, dt, 1.5, true);
        anim(f, 'swim', 1);
        if (foe.mt > 2) setMode(foe, 'patrol');
        return;
      }
      if (foe.aware) {
        var tp = targetPos(foe);
        swimTo(foe, f, tp.x, tp.y, row.speed, dt, 1.2, true);
      } else patrol(foe, f, dt, true);
      anim(f, 'swim', 1);
      if (!gone(d) && foe.cd <= 0 && f.hitTest(d.pos.x, d.pos.y, 0.2)) {
        var c = f.center();
        if (d.hurt(foe.dmg, c.x, c.y)) {
          foe.touches = (foe.touches || 0) + 1;
          foe.cd = 1.5;
          var l = dist(c.x, c.y, d.pos.x, d.pos.y) || 1;
          foe.away = { x: (d.pos.x - c.x) / l, y: (d.pos.y - c.y) / l };
          setMode(foe, 'retreat');
        }
      }
    },
  };
  // ---------- sinh quái ----------
  function rowOf(key) { return FD.kinds[key]; }

  function makeFoe(row, x, y, o) {
    var G = F.G, R = F.roster, id = BDL.foeBody(row, R.level), f;
    f = HX.Shark.BY_ID[id] ? G.fishes.spawnShark({ id: id }, x, y) : G.fishes.spawnAt(HX.fish.BY_ID[id], x, y);
    var hp = Math.max(1, Math.round(row.hp * R.hpMul)), dmg = Math.round(row.dmg * R.dmgMul * 10) / 10;
    var sp = {}; for (var k in f.sp) sp[k] = f.sp[k];
    sp.hp = hp; sp.damage = dmg; f.sp = sp;
    f.hp = f.maxHp = hp;
    f.corpseTime = FD.CORPSE_TIME;
    var foe = {
      id: ++fid, row: row, key: row.key, body: f, dmg: dmg, hpMax: hp,
      value: BDL.foeValue(hp, dmg),
      asleep: false, aware: false, alertT: 0, chaseT: 0, restT: 0, lostT: 0, senseT: Math.random() * 0.15,
      see: false, dd: 99, speedK: 1, mode: 'patrol', mt: 0, home: { x: x, y: y }, wp: null, wt: 0,
      stuckT: 0, detourT: 0, rm: null, pauseT: 0, invest: null, investT: 0, huntT: 20 + F.rnd() * 15, lastSeenT: F.t, stuckN: 0, tgt: null, ddDave: 99, hunt: false, dead: false, corpse: false, pack: null, immune: !!row.immune,
      markCh: null, mark: null, lastKnown: null,
    };
    foe.step = function (ff, GG, dt) { if (foe.ctl && ctlStep(foe, ff, dt)) return; BR[row.brain].step(foe, ff, GG, dt); };
    foe.onHurt = function (ff, n, fx, fy) {
      if (foe.asleep) wakeFoe(foe, 'hurt');
      // bị đánh thì biết Dave ở đâu, kể cả đang nghỉ mệt
      foe.restT = 0;
      alertFoe(foe, G.diver.pos.x, G.diver.pos.y, true);
      (foe.pack || []).forEach(function (o) { if (o !== foe && !o.dead) { if (o.asleep) wakeFoe(o, 'hurt'); alertFoe(o, G.diver.pos.x, G.diver.pos.y, true); } });
    };
    f.brain = foe; f.foe = foe; f.isFoe = true;
    f.deckItem = function () {
      return { kind: 'foe', key: row.key, label: 'Xác ' + row.name.toLowerCase(), value: foe.value, icon: HX.fish.iconFor(G.gfx, f.sp), name: row.name };
    };
    f.removeFromWorld = function () { foe.consumed = true; if (f.state !== 'reeled') f.go('reeled'); };
    f.go('brain');
    if (BR[row.brain].init) BR[row.brain].init(foe, f);
    F.foes.push(foe);
    return foe;
  }

  function spawnFoe(row, x, y, o) {
    o = o || {};
    var foes = [], n = row.pack || 1;
    for (var i = 0; i < n; i++) {
      var px = x, py = y;
      if (i > 0) {
        for (var t = 0; t < 12; t++) {
          var a = (i / n) * Math.PI * 2 + t * 0.5, r = 1.1 + (t % 4) * 0.3;
          if (F.G.world.open(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7, 0.35) && !blockedAt(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7)) { px = x + Math.cos(a) * r; py = y + Math.sin(a) * r * 0.7; break; }
        }
      }
      foes.push(makeFoe(row, px, py, o));
    }
    if (n > 1) foes.forEach(function (f) { f.pack = foes; });
    foes.forEach(function (foe) {
      if (o.asleep) { foe.asleep = true; foe.body.go('sleep', { time: Infinity, x: foe.body.pos.x, y: foe.body.pos.y }); setMark(foe, 'Z'); }
    });
    return foes;
  }

  // Chia các ổ quái của map cho từng tầng: loại nào cũng có ít nhất một ổ (kẻ húc đứng đầu), quái khó nghiêng về tầng sâu.
  function planSlots(R) {
    var slots = [], kinds = R.kinds, nF = F.G.floors.length;
    kinds.forEach(function (r) { if (slots.length < R.count) slots.push(r); });
    var tot = kinds.reduce(function (s, r) { return s + r.weight; }, 0);
    while (slots.length < R.count) {
      var x = F.rnd() * tot, pick = kinds[0];
      for (var i = 0; i < kinds.length; i++) { x -= kinds[i].weight; if (x < 0) { pick = kinds[i]; break; } }
      slots.push(pick);
    }
    return slots.map(function (row) {
      var rank = kinds.indexOf(row), h = kinds.length > 1 ? rank / (kinds.length - 1) : 0.5;
      var ws = [], sum = 0;
      for (var fl = 0; fl < nF; fl++) {
        var fr = nF > 1 ? fl / (nF - 1) : 0.5, w = (0.25 + fr) * Math.exp(-2.2 * Math.abs(h - fr));
        ws.push(w); sum += w;
      }
      var r2 = F.rnd() * sum, fl2 = 0;
      for (var j = 0; j < nF; j++) { r2 -= ws[j]; if (r2 < 0) { fl2 = j; break; } }
      return { row: row, floor: fl2 };
    });
  }

  function placeAll() {
    var G = F.G, avoid = [], placed = 0;
    planSlots(F.roster).forEach(function (s) {
      var spot = null, md = FD.MIN_SPAWN_DIST;
      // tầng đã bốc không có chỗ thì thử tầng khác; không đâu có chỗ thì hạ khoảng cách (ghi lỗi để biết)
      var order = [s.floor];
      for (var i = 1; i < G.floors.length; i++) { order.push((s.floor + i) % G.floors.length); }
      for (var o = 0; o < order.length && !spot; o++) spot = pickSpot({ minDist: md, floor: order[o], avoid: avoid });
      if (!spot) { spot = pickSpot({ minDist: md, avoid: [] }); }
      if (!spot) { G.errors.push('foes: không có chỗ sinh ' + s.row.key + ' cách ≥' + md + ' m'); return; }
      avoid.push(spot);
      spawnFoe(s.row, spot.x, spot.y, { asleep: F.sleep.on });
      placed++;
    });
    return placed;
  }

  // ---------- chết, xác, hồi sinh ----------
  function dissolve(foe, why) {
    var f = foe.body, G = F.G, c = f.center();
    foe.corpse = false;
    G.fx.burst('puff', c.x, c.y, 10, 1.2);
    G.fx.burst('bubble', c.x, c.y, 12, 1.5);
    if (why === 'cap' && G.hud && G.hud.toast) G.hud.toast('Xác ' + foe.row.name.toLowerCase() + ' tan mất (đã bán đủ ' + BDL.SELL_CAP + ' lần)');
    if (f.state !== 'reeled') f.go('reeled');
  }

  function onDeath(foe) {
    foe.dead = true;
    var f = foe.body, row = foe.row;
    if (foe.ctl) clearCtl(foe, true);
    dropCarry(foe);
    setMark(foe, null);
    if (f.sp.shark) f.stopFx();
    if (!foe.exploded && !foe.consumed) { if (BDL.run.dive) BDL.run.dive.kills++; foe.killed = true; F.kills++; }
    if (!row.pack) F.respawns.push({ key: row.key, due: F.t + FD.RESPAWN });
    if (foe.exploded || foe.consumed) return;
    var keep = !row.noCorpse && !row.pack && BDL.run.sellable(row.key);
    if (keep) { foe.corpse = true; return; }
    dissolve(foe, row.noCorpse || row.pack ? 'nocorpse' : 'cap');
    foe.dissolvedByCap = !(row.noCorpse || row.pack);
  }

  function processRespawns() {
    for (var i = F.respawns.length - 1; i >= 0; i--) {
      var r = F.respawns[i];
      if (F.t < r.due) continue;
      var spot = pickSpot({ minDist: FD.MIN_SPAWN_DIST }) || pickSpot({ minDist: 22 }) || pickSpot({ minDist: 16 });
      if (!spot) { r.due = F.t + 3; continue; }
      F.respawns.splice(i, 1);
      spawnFoe(rowOf(r.key), spot.x, spot.y, {});
      F.respawned++;
    }
  }

  function relocate(foe) {
    var spot = pickSpot({ minDist: 12, maxDist: 24, noLos: true, boat: false });
    if (!spot) return;
    var f = foe.body;
    f.pos.x = spot.x; f.pos.y = spot.y; f.vel.x = f.vel.y = 0;
    foe.home = { x: spot.x, y: spot.y }; foe.rm = null; foe.lostT = 0; foe.relocations = (foe.relocations || 0) + 1;
    F.G.fx.burst('bubble', spot.x, spot.y, 5, 0.8);
  }

  // ---------- mỗi khung ----------
  function tickFoe(foe, dt) {
    var f = foe.body, B = BR[foe.row.brain];
    if (foe.dead) return;
    if (!f.alive()) { if (f.hp <= 0 || f.state === 'reeled') onDeath(foe); return; }
    if (f.state === 'reeled') { foe.dead = true; return; }
    if (foe.asleep) {
      // thân đã thức vì lý do khác (hết giờ đạn gây mê): coi như tỉnh
      if (f.state === 'brain') wakeFoe(foe, 'external');
      setMark(foe, 'Z'); placeMark(foe);
      return;
    }
    var hurtState = f.state === 'sleep' || f.state === 'iced' || f.state === 'lifted' || f.state === 'hooked';
    foe.restT = Math.max(0, foe.restT - dt);
    foe.senseT -= dt;
    if (foe.senseT <= 0) {
      foe.senseT = 0.15;
      sense(foe);
      if (foe.sensed && !hurtState) { foe.lostT = 0; alertFoe(foe, foe.lastKnown.x, foe.lastKnown.y); if (foe.aware) foe.alertT = 2.6; }
      else foe.lostT += 0.15;
    }
    if (foe.aware) {
      foe.alertT -= dt;
      var busy = B.busy && B.busy(foe);
      if (!busy) foe.chaseT += dt;
      // mệt dần: 2,5 s bắt đầu, 8 s mệt (chậm 0,6), 12 s bỏ cuộc rồi nghỉ 6 s
      foe.speedK = foe.chaseT >= FD.TIRED_AT ? FD.TIRED_SPEED : 1;
      if (foe.chaseT >= FD.GIVE_UP_AT && !busy) {
        calmFoe(foe); foe.restT = FD.REST; foe.gaveUp = (foe.gaveUp || 0) + 1;
        if (f.state === 'chase' || f.state === 'charge') f.go('wander');
        foe.hunt = false;
      } else if (foe.alertT <= 0 && !foe.hunt) calmFoe(foe);
      else if (foe.alertT <= 0 && foe.hunt && f.state === 'brain') calmFoe(foe);
    } else foe.speedK = 1;
    if (foe.hunt) {
      if (f.state === 'brain') { foe.hunt = false; if (foe.aware && foe.alertT <= 0) calmFoe(foe); }
      else { f.buffLook(); f.slow *= foe.speedK; }
    }
    // mất dấu Dave 40 s và xa quá 16 m thì dời tới gần Dave, khuất tầm nhìn
    if (foe.lostT > FD.RELOCATE_AFTER && foe.ddDave > FD.RELOCATE_DIST && !daveGone()) relocate(foe);
    setMark(foe, B.mark ? B.mark(foe) : null);
    placeMark(foe);
  }

  function cleanCorpses() {
    F.foes.forEach(function (foe) {
      if (!foe.dead || !foe.corpse) return;
      var f = foe.body;
      if (f.state === 'reeled') { foe.corpse = false; return; }
      // đã bán đủ 3 xác cùng loại thì xác còn nằm lại tan mất
      if (!f.tethered && !BDL.run.sellable(foe.row.key)) dissolve(foe, 'cap');
    });
    F.foes = F.foes.filter(function (foe) {
      var gone = foe.dead && !foe.corpse && (foe.body.state === 'reeled' && foe.body.st > 0.3);
      if (gone && foe.mark) setMark(foe, null);
      return !gone;
    });
  }

  function wakeAll(why) {
    F.foes.forEach(function (foe) { wakeFoe(foe, why || 'timer'); });
    F.sleep.on = false;
  }

  function timers(sec) {
    F.t += sec;
    if (F.blindT > 0) F.blindT = Math.max(0, F.blindT - sec);
    if (F.sleep.on) {
      F.sleep.left -= sec;
      if (F.sleep.left <= 0) { F.sleep.left = 0; wakeAll('timer'); }
    }
    processRespawns();
  }

  // ---------- điều khiển từ ngoài (kỹ năng crew, js/skills.js) ----------
  // Một quái chịu tối đa ba kiểu điều khiển, kiểm trong foe.step trước bộ não: nhốt > choáng/đông > dụ.
  // Quái đang săn bằng trạng thái cá mập gốc (chase/charge/...) không chạy foe.step nên bị kéo về 'brain' trước.
  var HUNT_STATES = ['chase', 'charge', 'attack', 'recover', 'flee', 'defend'];
  function ctlOf(foe) { return foe.ctl || (foe.ctl = { stunT: 0, kind: null, lureT: 0, lure: null, cageT: 0, cage: null, cageMesh: null, on: false }); }
  function ctlActive(foe) { var c = foe.ctl; return !!c && (c.stunT > 0 || c.lureT > 0 || c.cageT > 0); }
  function controllable(foe) { return !foe.dead && !foe.asleep && foe.body.alive() && foe.body.state !== 'sleep' && foe.body.state !== 'iced' && foe.body.state !== 'hooked'; }

  function seize(foe) {
    var f = foe.body, c = ctlOf(foe);
    if (!c.on) {
      c.on = true;
      calmFoe(foe);
      foe.hunt = false;
      if (HUNT_STATES.indexOf(f.state) >= 0) f.go('brain');
    }
  }

  var cageTexCache = null;
  function cageTex() {
    if (cageTexCache) return cageTexCache;
    var cv = document.createElement('canvas'); cv.width = cv.height = 128;
    var g = cv.getContext('2d');
    g.lineCap = 'round';
    function stroke(w, col) {
      g.lineWidth = w; g.strokeStyle = col;
      g.beginPath(); g.ellipse(64, 64, 52, 52, 0, 0, Math.PI * 2); g.stroke();
      for (var i = 0; i < 7; i++) { var x = 22 + i * 14; g.beginPath(); g.moveTo(x, 14); g.lineTo(x, 114); g.stroke(); }
      g.beginPath(); g.moveTo(12, 28); g.lineTo(116, 28); g.moveTo(12, 100); g.lineTo(116, 100); g.stroke();
    }
    stroke(9, 'rgba(0,20,40,0.85)'); stroke(4, '#cfe3ee');
    cageTexCache = new THREE.CanvasTexture(cv);
    return cageTexCache;
  }
  function placeCage(foe) {
    var c = foe.ctl, f = foe.body;
    if (!c || !c.cageMesh) return;
    var ct = f.center();
    c.cageMesh.position.set(ct.x, ct.y, 0.7);
    c.cageMesh.material.opacity = c.cageT < 1 ? 0.4 + 0.6 * Math.abs(Math.sin(F.t * 16)) : 0.95;
  }
  function dropCageMesh(c) {
    if (c.cageMesh) { F.G.gfx.scene.remove(c.cageMesh); c.cageMesh.material.dispose(); c.cageMesh = null; }
  }
  // Hết mọi điều khiển (hoặc bị bỏ giữa chừng): trả thân về bộ não, đời mới tuần quanh chỗ đang đứng.
  function clearCtl(foe, silent) {
    var c = foe.ctl, f = foe.body;
    if (!c) return;
    dropCageMesh(c);
    if (!c.on) return;
    c.on = false; c.stunT = c.lureT = c.cageT = 0; c.kind = null; c.lure = null; c.cage = null;
    if (silent && (foe.dead || !f.alive())) return;
    freezeAnim(f, false); untint(f);
    setMode(foe, 'patrol'); foe.home = { x: f.pos.x, y: f.pos.y }; foe.rm = null; foe.stuckT = 0; foe.detourT = 0;
    setMark(foe, null);
  }

  var STUN_TINT = { stun: [0.4, 0.6, 1, 0.35], ice: [0.55, 0.9, 1, 0.55], flash: [1, 1, 0.75, 0.6] };
  function ctlStep(foe, f, dt) {
    var c = foe.ctl, ghost = foe.row.brain === 'ghost';
    if (!c.on) return false;
    if (c.cageT > 0) {
      c.cageT -= dt;
      if (c.stunT > 0) c.stunT -= dt;
      f.vel.x = f.vel.y = 0;
      if (c.cage) { f.pos.x = c.cage.x; f.pos.y = c.cage.y; }
      anim(f, 'swim', 0.5);
      placeCage(foe);
      if (c.cageT <= 0) clearCtl(foe);
      return true;
    }
    if (c.stunT > 0) {
      c.stunT -= dt;
      var k = Math.exp(-6 * dt);
      f.vel.x *= k; f.vel.y *= k;
      stepBody(f, dt, ghost);
      freezeAnim(f, true);
      var tt = STUN_TINT[c.kind] || STUN_TINT.stun;
      tint(f, tt[0], tt[1], tt[2], tt[3] * (c.kind === 'flash' ? 0.7 + 0.3 * Math.sin(F.t * 18) : 1));
      setMark(foe, '*'); placeMark(foe);
      if (c.stunT <= 0) { if (c.lureT > 0) { freezeAnim(f, false); untint(f); } else clearCtl(foe); }
      return true;
    }
    if (c.lureT > 0) {
      c.lureT -= dt;
      var L = c.lure, near = dist(f.pos.x, f.pos.y, L.x, L.y), a = F.t * 1.6 + foe.id;
      if (near > 2) swimTo(foe, f, L.x, L.y, foe.row.speed * 1.15, dt, 3, ghost);
      else swimTo(foe, f, L.x + Math.cos(a) * 1.8, L.y + Math.sin(a) * 1.1, foe.row.speed * 0.5, dt, 2, ghost);
      faceTo(f, L.x);
      anim(f, 'cruise', 1);
      setMark(foe, '?'); placeMark(foe);
      if (c.lureT <= 0) clearCtl(foe);
      return true;
    }
    clearCtl(foe);
    return false;
  }

  function foeList() { return F ? F.foes.filter(function (o) { return !o.dead && o.body.alive(); }) : []; }

  BDL.foes = {
    list: foeList,
    // quái gần (x, y) nhất trong r mét; opt.awake bỏ qua quái đang ngủ; opt.filter(foe) lọc thêm
    nearest: function (x, y, r, opt) {
      var best = null, bd = r == null ? 1e9 : r;
      foeList().forEach(function (foe) {
        if (opt && opt.awake && foe.asleep) return;
        if (opt && opt.filter && !opt.filter(foe)) return;
        var c = foe.body.center(), dd = dist(c.x, c.y, x, y);
        if (dd <= bd) { bd = dd; best = foe; }
      });
      return best;
    },
    // Choáng mọi quái thức trong r quanh (x, y) t giây. opt: kind 'stun' | 'ice' | 'flash' (màu + thôi theo dõi),
    // forget (quên mục tiêu, nghỉ 2 s sau khi tỉnh), dmg (sát thương), push (m/s hất ra xa tâm). Trả số quái dính.
    stunAt: function (x, y, r, t, opt) {
      opt = opt || {};
      var n = 0;
      foeList().forEach(function (foe) {
        var f = foe.body, c0 = f.center();
        if (foe.asleep || !controllable(foe) || dist(c0.x, c0.y, x, y) > r) return;
        if (opt.dmg) f.damage(opt.dmg, x, y);
        if (!controllable(foe)) return;     // chết vì sát thương
        seize(foe);
        var c = ctlOf(foe);
        c.stunT = Math.max(c.stunT, t); c.kind = opt.kind || 'stun';
        if (opt.forget) { foe.lastKnown = null; foe.restT = Math.max(foe.restT, t + 2); }
        if (opt.push) {
          var dx = c0.x - x, dy = c0.y - y, l = Math.hypot(dx, dy) || 1;
          f.vel.x = dx / l * opt.push; f.vel.y = dy / l * opt.push;
        }
        foe.stunned = (foe.stunned || 0) + 1;
        n++;
      });
      return n;
    },
    // Dụ quái về (x, y) t giây, bỏ mục tiêu cũ. opt: radius (quanh cx, cy; mặc định quanh (x, y)), filter(foe). Trả số quái bị dụ.
    lureTo: function (x, y, t, opt) {
      opt = opt || {};
      var cx = opt.cx == null ? x : opt.cx, cy = opt.cy == null ? y : opt.cy, n = 0;
      foeList().forEach(function (foe) {
        var f = foe.body, c0 = f.center();
        if (foe.asleep || !controllable(foe)) return;
        if (opt.radius != null && dist(c0.x, c0.y, cx, cy) > opt.radius) return;
        if (opt.filter && !opt.filter(foe)) return;
        var c = ctlOf(foe);
        if (c.cageT > 0) return;
        seize(foe);
        c.lureT = Math.max(c.lureT, t); c.lure = { x: x, y: y };
        n++;
      });
      return n;
    },
    // Dave tàng hình t giây: quái không thấy, không nghe; đang đuổi thì bỏ cuộc ngay.
    blind: function (t) {
      if (!F) return 0;
      F.blindT = Math.max(F.blindT, t);
      var n = 0;
      F.foes.forEach(function (foe) {
        if (foe.dead || foe.asleep) return;
        if (foe.aware && !ctlActive(foe)) {
          calmFoe(foe); foe.lastKnown = null; foe.hunt = false;
          if (HUNT_STATES.indexOf(foe.body.state) >= 0) foe.body.go('brain');
          n++;
        }
      });
      return n;
    },
    blindLeft: function () { return F ? F.blindT : 0; },
    // Nhốt một quái tại chỗ t giây (lồng sắt vẽ đè lên thân). Trả true nếu nhốt được.
    cage: function (foe, t) {
      if (!F || !foe || !controllable(foe)) return false;
      seize(foe);
      var c = ctlOf(foe), f = foe.body, ct = f.center();
      c.cageT = Math.max(c.cageT, t); c.cage = { x: f.pos.x, y: f.pos.y }; c.lureT = 0; c.kind = c.kind || 'stun';
      if (!c.cageMesh) {
        var m = new THREE.Sprite(new THREE.SpriteMaterial({ map: cageTex(), transparent: true, depthTest: false, depthWrite: false }));
        var s = Math.max(1.6, Math.max(f.hw, f.hh) * 2.7);
        m.scale.set(s, s, 1); m.renderOrder = 61;
        F.G.gfx.scene.add(m);
        c.cageMesh = m;
      }
      placeCage(foe);
      return true;
    },
    // trạng thái điều khiển của một quái: 'cage' | 'stun' | 'lure' | null
    stateOf: function (foe) {
      var c = foe && foe.ctl;
      return !c ? null : c.cageT > 0 ? 'cage' : c.stunT > 0 ? 'stun' : c.lureT > 0 ? 'lure' : null;
    },
  };

  var system = {
    name: 'foes',

    build: function (G, map) {
      var seed = isNaN(seedParam) ? Math.floor(Math.random() * 1e9) : seedParam + map.id * 7919;
      F = { G: G, map: map, t: 0, foes: [], respawns: [], shots: [], kills: 0, respawned: 0, rnd: mulberry(seed), seed: seed,
        noiseT: 0, blindT: 0, roster: BDL.foeRoster(map), sleep: { on: false, total: 0, left: 0, skipped: false }, grid: null, boat: null };
      var st = G.stack.layers[0].zone.start, d = G.diver.pos;
      F.boat = { x: st ? st[0] : d.x, y: surf() };
      F.grid = buildCells(G);
      // một lần bốc cho cả lượt lặn (run_timers.initialSleep): 20% lượt không ngủ, còn lại 40-60 s co theo cấp, hết từ cấp 11
      var S = FD.sleep, skip = F.rnd() < S.skipChance, base = lerp(S.min, S.max, F.rnd());
      var total = map.level >= S.endLevel ? 0 : base * Math.pow(Math.max(0, 1 - (map.level - 1) / 10), S.exp);
      F.sleep = { total: skip ? 0 : total, left: skip ? 0 : total, skipped: skip, on: !skip && total > 0.5 };
      placeAll();

      // một đòn không quá 72% dưỡng khí tối đa khi còn đầy (REPO HIT_MAX_FRAC)
      var orig = d && G.diver.hurt;
      if (orig) {
        G.diver.hurt = function (dmg, fx, fy, soft) {
          var mx = G.loadout ? G.loadout.o2 : 100;
          if (!soft && this.o2 >= mx - 0.01) dmg = Math.min(dmg, FD.HIT_MAX_FRAC * mx);
          return orig.call(this, dmg, fx, fy, soft);
        };
      }
      installDebug(G);
    },

    update: function (dt) {
      if (!F) return;
      var G = F.G, d = G.diver;
      timers(dt);
      // Dave tăng tốc ồn ×2,6; súng phụ nổ ồn hơn
      F.noiseT -= dt;
      if (d && d.boosting && F.noiseT <= 0 && !daveGone()) { F.noiseT = 0.35; BDL.noise(d.pos.x, d.pos.y, 4, 2.6); }
      if (G.gun && !G.gun._bdlNoise) {
        G.gun._bdlNoise = true;
        var tr = G.gun.trigger;
        G.gun.trigger = function () {
          var n0 = this.shots ? this.shots.length : 0, r = tr.apply(this, arguments);
          if (!this.shots || this.shots.length > n0) BDL.noise(G.diver.pos.x, G.diver.pos.y, 14, 1);
          return r;
        };
      }
      for (var i = 0; i < F.foes.length; i++) tickFoe(F.foes[i], dt);
      updateShots(dt);
      cleanCorpses();
    },

    teardown: function (G) {
      if (!F) return;
      F.foes.forEach(function (foe) { setMark(foe, null); if (foe.ctl) clearCtl(foe, true); });
      F.shots.forEach(function (s) { G.gfx.scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); });
      F = null;
    },
  };
  BDL.systems.push(system);

  // ---------- debug ----------
  function view(foe) {
    var f = foe.body, d = F.G.diver.pos;
    return { id: foe.id, key: foe.key, x: f.pos.x, y: f.pos.y, dist: dist(f.pos.x, f.pos.y, d.x, d.y), asleep: foe.asleep, aware: foe.aware, mode: foe.mode,
      state: f.state, hp: f.hp, hpMax: foe.hpMax, dmg: foe.dmg, dead: foe.dead, corpse: foe.corpse, value: foe.value, species: f.sp.id, pack: foe.pack ? foe.pack.length : 0,
      tethered: !!f.tethered, hunt: foe.hunt, roam: foe.rm ? foe.rm.kind : null, goal: foe.rm ? foe.rm.goal : null, hunts: foe.hunts || 0, stunned: foe.stunned || 0, hitDave: foe.hitDave || 0, shots: foe.shots || 0, lootBites: foe.lootBites || 0, daveBites: foe.daveBites || 0,
      grabs: foe.grabs || 0, touches: foe.touches || 0, exploded: !!foe.exploded, dissolvedByCap: !!foe.dissolvedByCap, restT: foe.restT, chaseT: foe.chaseT, wokeBy: foe.wokeBy || null };
  }
  function byId(id) { for (var i = 0; i < F.foes.length; i++) if (F.foes[i].id === id) return F.foes[i]; return null; }

  function installDebug(G) {
    window.BDL_DEBUG = window.BDL_DEBUG || {};
    window.BDL_DEBUG.foes = {
      list: function () { return F.foes.map(view); },
      get: function (id) { var f = byId(id); return f ? view(f) : null; },
      spawn: function (key, x, y, o) {
        var foes = spawnFoe(rowOf(key), x, y, { asleep: !!(o && o.asleep) });
        // mặc định thức, đi thẳng vào việc: gọi alert luôn nếu o.alert
        if (o && o.alert) foes.forEach(function (fo) { alertFoe(fo, G.diver.pos.x, G.diver.pos.y); });
        return foes.map(function (f) { return f.id; });
      },
      wakeAll: function () { wakeAll('debug'); },
      killNearest: function (key) {
        var d = G.diver.pos, best = null, bd = 1e9;
        F.foes.forEach(function (foe) {
          if (foe.dead || (key && foe.key !== key) || foe.immune) return;
          var dd = dist(foe.body.pos.x, foe.body.pos.y, d.x, d.y);
          if (dd < bd) { bd = dd; best = foe; }
        });
        if (!best) return null;
        best.body.hp = 0; best.body.die(false);
        return best.id;
      },
      sleepLeft: function () { return F.sleep.left; },
      sleepInfo: function () { return { total: F.sleep.total, left: F.sleep.left, skipped: F.sleep.skipped, on: F.sleep.on, level: F.map.level, seed: F.seed }; },
      respawns: function () { return F.respawns.map(function (r) { return { key: r.key, in: r.due - F.t }; }); },
      advance: function (sec) { timers(sec); },
      // chạy nhanh AI + thân cá sec giây mô phỏng (bước 0,05 s như khung hình), cho bộ kiểm không phải chờ giờ thật
      tick: function (sec) { for (var t = 0; t < sec; t += 0.05) { G.fishes.update(0.05); system.update(0.05); } },
      roster: function () { return { kinds: F.roster.kinds.map(function (r) { return r.key; }), count: F.roster.count, hpMul: F.roster.hpMul, dmgMul: F.roster.dmgMul }; },
      stats: function () { return { kills: F.kills, respawned: F.respawned, shots: F.shots.length, cells: F.grid.cells.length, boat: F.boat }; },
      noise: function (x, y, r, s) { return BDL.noise(x, y, r, s); },
      setMode: function (id, m) { var f = byId(id); if (f) setMode(f, m); },
      charge: function (id, dx, dy) { var f = byId(id); if (!f) return; var l = Math.hypot(dx, dy) || 1; f.dir = { x: dx / l, y: dy / l }; wakeFoe(f, 'debug'); setMode(f, 'charge'); },
      clearAll: function () {
        F.foes.forEach(function (foe) { setMark(foe, null); if (foe.ctl) clearCtl(foe, true); G.fishes.drop([foe.body]); });
        F.foes = []; F.respawns = [];
      },
      alert: function (id) { var f = byId(id); if (f) alertFoe(f, G.diver.pos.x, G.diver.pos.y); },
    };
  }
})(window.BDL);
