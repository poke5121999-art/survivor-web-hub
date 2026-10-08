// Mô phỏng: nhân vật. Mỗi phe một bảng trạng thái (FSM) có bảng chuyển hợp lệ; mọi đổi trạng thái đi qua sim.setState.
// Hiệu ứng gom về một chỗ (aggregate, bảng hiệu ứng ở README); sát thương qua damageShark/hurtDiver; đạn có móc onHit/onEnd cho kỹ năng.
(function (VS) {
  'use strict';
  var sim = VS.sim = VS.sim || {};
  var geom = VS.geom;
  var K = sim.K;
  var EPS = 1e-6;

  // Mỗi sự kiện {t, type, id, by?, ...}; id là actor chịu/làm chính, by là actor kia. Mô phỏng chỉ ghi, không bao giờ đọc m.events.
  sim.emit = function (m, type, data) {
    var e = { t: m.t, type: type };
    if (data) for (var k in data) e[k] = data[k];
    m.events.push(e);
    return e;
  };

  function actorOf(m, x) { return typeof x === 'number' ? (m.actors[x] || null) : (x || null); }

  sim.makeIntent = function (x, y) {
    return { mx: 0, my: 0, boost: false, aimX: (x || 0) + 1, aimY: y || 0, fire: false, fireHeld: false, skill: false, light: false, interact: false };
  };

  // ---- Hiệu ứng ----
  // Cùng kind và cùng src thì gia hạn chứ không thêm, để vùng gây hiệu ứng mỗi bước không làm danh sách phình ra.
  // Trả hiệu ứng, hoặc null khi mục tiêu đang miễn (stun/sleep gặp ccImmune, slow trong lúc miễn chậm).
  sim.addEffect = function (a, kind, dur, mag, src) {
    var now = a.m.t, until = now + dur, fx = a.effects;
    if ((kind === 'stun' || kind === 'sleep') && sim.effect(a, 'ccImmune')) return null;
    if (kind === 'slow' && now < a.slowImmuneUntil) return null;
    mag = mag == null ? 1 : mag; src = src == null ? -1 : src;
    for (var i = 0; i < fx.length; i++) {
      if (fx[i].kind === kind && fx[i].src === src && fx[i].until > now) {
        if (until > fx[i].until) fx[i].until = until;
        fx[i].mag = mag;
        return fx[i];
      }
    }
    var e = { kind: kind, until: until, mag: mag, src: src };
    fx.push(e);
    return e;
  };

  // Hiệu ứng mạnh nhất còn hạn: mag lớn nhất; riêng stealth và shrink mag càng nhỏ càng mạnh.
  sim.effect = function (a, kind) {
    var now = a.m.t, best = null, fx = a.effects, small = kind === 'stealth' || kind === 'shrink';
    for (var i = 0; i < fx.length; i++) {
      var e = fx[i];
      if (e.kind !== kind || e.until <= now) continue;
      if (!best || (small ? e.mag < best.mag : e.mag > best.mag) || (e.mag === best.mag && e.until > best.until)) best = e;
    }
    return best;
  };

  sim.removeEffects = function (a, kind) {
    var fx = a.effects, keep = 0;
    for (var i = 0; i < fx.length; i++) if (fx[i].kind !== kind) fx[keep++] = fx[i];
    fx.length = keep;
  };

  // Một chỗ duy nhất đọc danh sách hiệu ứng thành các hệ số dùng trong bước này (a.mod), gỡ hiệu ứng hết hạn,
  // cấp miễn chậm / miễn khống chế khi chậm / choáng / ngủ vừa hết, và co giãn bán kính theo hiệu ứng shrink.
  function aggregate(a, now) {
    var mod = a.mod, fx = a.effects, keep = 0, speed = 1, shrink = 1, shrunk = false, i, E = VS.TUNING.effects;
    mod.slow = 0; mod.armor = 0; mod.bleed = 0; mod.biteMul = 1;
    mod.stun = mod.sleep = mod.blind = mod.noDash = mod.grabImmune = mod.lightOff = false;
    for (i = 0; i < fx.length; i++) {
      var e = fx[i];
      if (e.until <= now) continue;
      fx[keep++] = e;
      switch (e.kind) {
        case 'slow': if (e.mag > mod.slow) mod.slow = e.mag; break;
        case 'speed': if (e.mag > speed) speed = e.mag; break;
        case 'armor': if (e.mag > mod.armor) mod.armor = e.mag; break;
        case 'bleed': if (e.mag > mod.bleed) mod.bleed = e.mag; break;
        case 'biteMul': if (e.mag > mod.biteMul) mod.biteMul = e.mag; break;
        case 'shrink': shrunk = true; if (e.mag < shrink) shrink = e.mag; break;
        case 'stun': mod.stun = true; break;
        case 'sleep': mod.sleep = true; break;
        case 'blind': mod.blind = true; break;
        case 'noDash': mod.noDash = true; break;
        case 'grabImmune': mod.grabImmune = true; break;
        case 'lightOff': mod.lightOff = true; break;
      }
    }
    fx.length = keep;
    mod.speedMul = speed * (1 - Math.min(mod.slow, 0.95));
    var cc = mod.stun || mod.sleep;
    if (a.hadCC && !cc) sim.addEffect(a, 'ccImmune', E.ccImmune, 1, -1);
    a.hadCC = cc;
    if (a.hadSlow && mod.slow === 0) a.slowImmuneUntil = now + E.slowImmune;
    a.hadSlow = mod.slow > 0;
    // Hết shrink mà chỗ đang đứng chưa đủ rộng cho bán kính thật thì vẫn nhỏ, tới khi ra chỗ rộng mới nở lại
    if (shrunk) a.r = a.r0 * shrink;
    else if (a.r !== a.r0 && a.m.world.open(a.x, a.y, a.r0)) a.r = a.r0;
  }

  // Hệ số tốc độ gộp: hiệu ứng (chậm lấy max, speed lấy max) nhân khối lượng mang, không xuống dưới effects.slowFloor.
  function speedFactor(a, carryFactor) {
    var f = a.mod.speedMul * carryFactor, floor = VS.TUNING.effects.slowFloor;
    return f < floor ? floor : f;
  }

  // ---- Tạo nhân vật ----
  sim.makeActor = function (m, id, ent, spawn, spawnIdx) {
    var T = VS.TUNING, team = ent.team, def = (team === 'diver' ? VS.DIVERS : VS.SHARKS)[ent.defId], sd = VS.SKILL_DATA[def && def.skill];
    if (!def) throw new Error('không có ' + team + ' "' + ent.defId + '" trong bảng nhân vật');
    var r = team === 'diver' ? T.diver.r : def.r;
    var a = {
      id: id, team: team, defId: ent.defId, def: def, name: ent.name || def.name, ctrl: ent.ctrl === 'human' ? 'human' : 'bot',
      x: spawn[0], y: spawn[1], vx: 0, vy: 0, face: 1, ang: 0, r: r, r0: r,
      st: 'swim', stT: 0,
      skill: { id: def.skill, cd: 0, t: 0, charges: sd && sd.charges || 0 }, effects: [],
      intent: sim.makeIntent(spawn[0], spawn[1]), brain: null,
      stats: { banked: 0, downs: 0, outs: 0, dmg: 0, revives: 0, bites: 0, sharkOuts: 0 },
      mod: { speedMul: 1, slow: 0, armor: 0, bleed: 0, biteMul: 1, stun: false, sleep: false, blind: false, noDash: false, grabImmune: false, lightOff: false },
      reload: 0, spawnIdx: spawnIdx, hadCC: false, hadSlow: false, slowImmuneUntil: -1e9
    };
    if (team === 'diver') {
      a.o2 = a.o2Max = def.o2; a.carry = []; a.carryKg = 0; a.light = true; a.beamMul = 1;
      a.iframes = 0; a.revT = 0; a.heldBy = -1; a.downBy = -1; a.shotMod = null; a.struggleSign = 0; a.lastHurtBy = -1; a.lastHurtT = -1e9;
    } else {
      a.hp = a.hpMax = def.hp; a.stamina = T.shark.staminaMax; a.biteCd = 0; a.holdId = -1;
      a.lastDmgT = -1e9; a.dashLock = false;
    }
    // Quay lại m để addEffect đọc m.t; không đếm được khi chuyển JSON nên giấu khỏi liệt kê
    Object.defineProperty(a, 'm', { value: m, writable: true, enumerable: false });
    return a;
  };

  // Miễn sát thương match.spawnImmune giây sau khi sinh hoặc hồi sinh (cả hai phe).
  sim.spawnProtect = function (m, a) { sim.addEffect(a, 'spawnImmune', VS.TUNING.match.spawnImmune, 1, -1); };

  // ---- Bảng trạng thái ----
  // to: các trạng thái được phép đi tới. enter(m,a,why) chạy sau khi đã gán a.st; exit(m,a,next,why) chạy trước.
  // Hook chỉ sửa chính actor đó; việc liên quan actor kia (thả mồi, ghi điểm) do hàm gọi làm trước khi đổi trạng thái.
  var FSM = { diver: {}, shark: {} };
  sim.FSM = FSM;

  sim.setState = function (m, a, next, why) {
    var tbl = FSM[a.team], cur = tbl[a.st], nx = tbl[next];
    if (!cur || !nx || a.st === next || cur.to.indexOf(next) < 0) return false;
    if (cur.exit) cur.exit(m, a, next, why);
    a.st = next; a.stT = 0;
    if (nx.enter) nx.enter(m, a, why);
    return true;
  };

  function aim(a, it) {
    var dx = it.aimX - a.x, dy = it.aimY - a.y;
    if (dx * dx + dy * dy < 1e-6) return;
    a.ang = Math.atan2(dy, dx);
    if (dx > 0.05) a.face = 1; else if (dx < -0.05) a.face = -1;
  }

  // v += (muốn - v) × min(1, rate × dt): tốc độ tiến về vận tốc mong muốn theo tỉ lệ (rate tính 1/s).
  function approach(a, tx, ty, rate, dt) {
    var f = rate * dt; if (f > 1) f = 1;
    a.vx += (tx - a.vx) * f; a.vy += (ty - a.vy) * f;
  }

  // Hãm khi không bấm hướng: v mất min(1, drag × dt) phần của chính nó.
  function coast(a, drag, dt) {
    var f = drag * dt; if (f > 1) f = 1;
    a.vx -= a.vx * f; a.vy -= a.vy * f;
  }

  function clampToMap(m, a) {
    var b = m.world.bounds, r = a.r, top = Math.min(b.maxY, K.surfaceY) - r;
    if (a.x < b.minX + r) { a.x = b.minX + r; if (a.vx < 0) a.vx = 0; }
    else if (a.x > b.maxX - r) { a.x = b.maxX - r; if (a.vx > 0) a.vx = 0; }
    if (a.y < b.minY + r) { a.y = b.minY + r; if (a.vy < 0) a.vy = 0; }
    else if (a.y > top) { a.y = top; if (a.vy > 0) a.vy = 0; }
  }

  // Lồng thép: vòng tròn cá mập không vào được (kỹ năng 'long-thep' dựng zone kind 'cage').
  function inCage(m, a) {
    for (var i = 0; i < m.zones.length; i++) {
      var z = m.zones[i];
      if (z.kind !== 'cage' || z.until <= m.t) continue;
      var dx = a.x - z.x, dy = a.y - z.y;
      if (dx * dx + dy * dy < z.r * z.r) return true;
    }
    return false;
  }

  // Đẩy tâm cá mập ra khỏi vòng tròn (cx,cy,rad); trả true nếu có đẩy. Bỏ phần vận tốc hướng vào trong.
  function pushOut(m, a, cx, cy, rad) {
    var dx = a.x - cx, dy = a.y - cy, d = Math.sqrt(dx * dx + dy * dy);
    if (d >= rad) return false;
    var nx = d > 1e-6 ? dx / d : 1, ny = d > 1e-6 ? dy / d : 0;
    a.x = cx + nx * rad; a.y = cy + ny * rad;
    var vn = a.vx * nx + a.vy * ny;
    if (vn < 0) { a.vx -= vn * nx; a.vy -= vn * ny; }
    return true;
  }

  // Cá mập không vào được lồng thép (cách tâm >= r lồng + r cá) và vùng an toàn quanh khoang cứu hộ (tâm cách >= pod.safeR).
  function keepSharkOut(m, a) {
    var i, z, pushed = false, safe = VS.TUNING.pod.safeR;
    for (i = 0; i < m.zones.length; i++) {
      z = m.zones[i];
      if (z.kind === 'cage' && z.until > m.t && pushOut(m, a, z.x, z.y, z.r + a.r)) pushed = true;
    }
    for (i = 0; i < m.pods.length; i++) if (pushOut(m, a, m.pods[i].x, m.pods[i].y, safe)) pushed = true;
    if (pushed) m.world.resolve(a, a.r);
  }

  function moveBody(m, a, dt) {
    m.world.slide(a, a.r, dt);
    if (a.team === 'shark') keepSharkOut(m, a);
    clampToMap(m, a);
  }

  // ---- Kho báu ----
  // Rơi tại chỗ (đẩy ra khỏi đá nếu cần), không bao giờ bị huỷ.
  sim.dropCarry = function (m, d) {
    var n = d.carry.length;
    if (!n) return 0;
    var tmp = { x: 0, y: 0 };
    for (var i = 0; i < n; i++) {
      var lt = m.loot[d.carry[i]], ang = i * 2.399963, rad = i === 0 ? 0 : 0.35;
      tmp.x = d.x + Math.cos(ang) * rad; tmp.y = d.y + Math.sin(ang) * rad;
      m.world.resolve(tmp, 0.25);
      lt.x = tmp.x; lt.y = tmp.y; lt.st = 'rest'; lt.by = -1;
    }
    d.carry.length = 0; d.carryKg = 0;
    sim.emit(m, 'drop', { id: d.id, n: n, x: d.x, y: d.y });
    return n;
  };

  function bank(m, d, podIdx) {
    var value = 0, n = d.carry.length;
    for (var i = 0; i < n; i++) {
      var lt = m.loot[d.carry[i]];
      lt.st = 'banked'; value += lt.value;
    }
    d.carry.length = 0; d.carryKg = 0;
    m.score.banked += value; d.stats.banked += value;
    sim.emit(m, 'bank', { id: d.id, value: value, n: n, pod: podIdx });
  }

  // Chỉ thợ lặn đang bơi nhặt, nộp và nạp O2 (đang bị ngậm, gục hay bị loại thì không).
  function diverTouch(m, a) {
    var T = VS.TUNING, i, dx, dy;
    var rr = a.r + K.lootR;
    for (i = 0; i < m.loot.length; i++) {
      var lt = m.loot[i];
      if (lt.st !== 'rest' || a.carryKg + lt.kg > T.diver.maxKg) continue;
      dx = lt.x - a.x; dy = lt.y - a.y;
      if (dx * dx + dy * dy > rr * rr) continue;
      lt.st = 'carried'; lt.by = a.id; a.carry.push(lt.id); a.carryKg += lt.kg;
      sim.emit(m, 'pickup', { id: a.id, loot: lt.id, value: lt.value, kg: lt.kg });
    }
    if (a.carry.length) {
      for (i = 0; i < m.pods.length; i++) {
        var p = m.pods[i];
        dx = p.x - a.x; dy = p.y - a.y;
        if (dx * dx + dy * dy <= p.r * p.r) { bank(m, a, i); break; }
      }
    }
    var cr = T.o2box.r + a.r;
    for (i = 0; i < m.o2.length; i++) {
      var c = m.o2[i];
      if (c.readyAt > m.t) continue;
      dx = c.x - a.x; dy = c.y - a.y;
      if (dx * dx + dy * dy > cr * cr) continue;
      a.o2 = Math.min(a.o2Max, a.o2 + T.o2box.amount);
      c.readyAt = m.t + T.o2box.cooldown;
      sim.emit(m, 'o2box', { id: a.id, box: i, amount: T.o2box.amount });
      break;
    }
  }

  // ---- Sát thương ----
  // Tách thợ lặn d khỏi miệng cá mập s (cả hai phía), phát 'released'. Trạng thái của d do người gọi đặt.
  function breakHold(m, s, d, why) {
    s.holdId = -1; d.heldBy = -1; d.struggleSign = 0;
    sim.emit(m, 'released', { id: d.id, by: s.id, why: why });
    if (s.st === 'hold') sim.setState(m, s, 'swim', why);
  }

  // Được nhả khỏi miệng cá mập về bơi thường: miễn cắn iframes giây tính từ lúc này, và miễn khống chế (không bị ngậm lại ngay).
  function releaseGrant(m, d) {
    d.iframes = VS.TUNING.diver.iframes;
    sim.addEffect(d, 'ccImmune', VS.TUNING.effects.ccImmune, 1, -1);
  }

  // Cá mập s nhả mồi (hết giờ, bị trúng đòn, choáng, hết máu).
  sim.releaseHold = function (m, s, why) {
    var d = s.holdId >= 0 ? m.actors[s.holdId] : null;
    if (d && d.st === 'held') { breakHold(m, s, d, why); sim.setState(m, d, 'swim', why); releaseGrant(m, d); }
    else { s.holdId = -1; if (s.st === 'hold') sim.setState(m, s, 'swim', why); }
  };

  function outShark(m, s, by) {
    if (!sim.setState(m, s, 'out', 'hp')) return;
    if (by && by.team === 'diver') by.stats.sharkOuts++;
    sim.emit(m, 'shark-out', { id: s.id, by: by ? by.id : -1, x: s.x, y: s.y });
  }

  // Trừ máu cá mập (có giáp). Đòn trúng đánh thức kẻ ngủ và buộc nhả mồi. Trả lượng máu thực sự mất.
  sim.damageShark = function (m, s, dmg, by) {
    if (s.team !== 'shark' || s.st === 'out' || !(dmg > 0) || sim.effect(s, 'spawnImmune')) return 0;
    var arm = sim.effect(s, 'armor'), who = actorOf(m, by);
    var amount = dmg * (1 - (arm ? Math.min(arm.mag, 1) : 0));
    var applied = Math.min(amount, s.hp);
    s.hp -= amount; s.lastDmgT = m.t;
    if (who && who !== s) who.stats.dmg += applied;
    sim.removeEffects(s, 'sleep');
    sim.emit(m, 'hit', { id: s.id, by: who ? who.id : -1, dmg: applied, team: 'shark', x: s.x, y: s.y });
    if (s.holdId >= 0) sim.releaseHold(m, s, 'hit');
    if (s.hp <= 0) { s.hp = 0; outShark(m, s, who); }
    return applied;
  };

  // Công hạ gục thuộc cá mập cuối cùng làm mất O2 của d trong shark.creditWindow giây.
  function creditOf(m, d) {
    if (d.lastHurtBy < 0 || m.t - d.lastHurtT > VS.TUNING.shark.creditWindow) return null;
    return m.actors[d.lastHurtBy];
  }

  function downDiver(m, d) {
    if (d.st === 'held') { var s = d.heldBy >= 0 ? m.actors[d.heldBy] : null; if (s) breakHold(m, s, d, 'down'); }
    if (!sim.setState(m, d, 'down', 'o2')) return false;
    var credit = creditOf(m, d);
    d.o2 = 0; d.downBy = credit ? credit.id : -1;
    d.stats.downs++;
    if (credit) credit.stats.downs++;
    sim.emit(m, 'down', { id: d.id, by: d.downBy, x: d.x, y: d.y });
    return true;
  }

  // Loại thợ lặn. by = kẻ kết liễu bằng cú cắn; không có thì tính cho con cá mập được ghi công hạ gục nó (hết giờ nằm gục).
  sim.outDiver = function (m, d, why, by) {
    if (d.st === 'out') return false;
    var credit = by || (d.downBy >= 0 ? m.actors[d.downBy] : null);
    if (d.st === 'held') { var s = d.heldBy >= 0 ? m.actors[d.heldBy] : null; if (s) breakHold(m, s, d, 'out'); }
    if (!sim.setState(m, d, 'out', why)) return false;
    d.stats.outs++;
    if (credit && credit.team === 'shark') credit.stats.outs++;
    sim.emit(m, 'out', { id: d.id, by: credit ? credit.id : -1, why: why });
    return true;
  };

  // Trừ O2 thợ lặn. kind: 'hit' (mặc định, phát sự kiện hit), 'bite' (bị iframes chặn), 'dot' (hao mòn liên tục: không phát sự kiện).
  // Đang miễn sát thương (spawnImmune) thì không mất gì. Trả lượng O2 thực sự mất. O2 chạm 0 thì ngã xuống.
  sim.hurtDiver = function (m, d, o2, by, kind) {
    if (d.team !== 'diver' || d.st === 'out' || !(o2 > 0) || sim.effect(d, 'spawnImmune')) return 0;
    kind = kind || 'hit';
    if (kind === 'bite' && d.iframes > 0) return 0;
    var who = actorOf(m, by), before = d.o2, applied = Math.min(o2, Math.max(0, before));
    d.o2 = Math.max(0, before - o2);
    if (who && who !== d) {
      who.stats.dmg += applied;
      if (who.team === 'shark' && applied > 0) { d.lastHurtBy = who.id; d.lastHurtT = m.t; }
    }
    if (kind !== 'dot') sim.removeEffects(d, 'sleep');
    if (kind === 'hit') sim.emit(m, 'hit', { id: d.id, by: who ? who.id : -1, dmg: applied, team: 'diver', x: d.x, y: d.y });
    if (before > 0 && d.o2 <= 0 && (d.st === 'swim' || d.st === 'held')) downDiver(m, d);
    return applied;
  };

  // ---- Truy vấn ----
  // Actor còn trên bản đồ trong bán kính r quanh (x,y), gần trước; team lọc theo phe (bỏ trống = cả hai).
  sim.actorsNear = function (m, x, y, r, team) {
    var found = [], r2 = r * r, i, j;
    for (i = 0; i < m.actors.length; i++) {
      var a = m.actors[i];
      if (a.st === 'out' || (team && a.team !== team)) continue;
      var dx = a.x - x, dy = a.y - y, dd = dx * dx + dy * dy;
      if (dd <= r2) found.push({ a: a, d: dd });
    }
    for (i = 1; i < found.length; i++) {
      var cur = found[i];
      for (j = i - 1; j >= 0 && found[j].d > cur.d; j--) found[j + 1] = found[j];
      found[j + 1] = cur;
    }
    return found.map(function (f) { return f.a; });
  };

  // ---- Đạn ----
  // p: {owner, team, kind, x, y, vx, vy, life (s), dmg?, r?, pierce?, fx?, onHit?(m,p,target), onEnd?(m,p,why: 'life'|'wall'|'hit')}
  sim.addProj = function (m, p) {
    p.id = m.nextId++;
    if (p.px == null) { p.px = p.x; p.py = p.y; }
    if (p.r == null) p.r = K.projR;
    if (p.owner == null) p.owner = -1;
    p.hits = [];
    m.projs.push(p);
    return p;
  };

  function projHit(m, p, t) {
    var T = VS.TUNING, owner = actorOf(m, p.owner);
    if (p.dmg > 0) {
      if (t.team === 'shark') sim.damageShark(m, t, p.dmg, owner);
      else sim.hurtDiver(m, t, p.dmg, owner, 'hit');
    }
    if (p.kind === 'harpoon' && t.team === 'shark' && t.st !== 'out') sim.addEffect(t, 'slow', T.diver.harpoonSlowT, T.diver.harpoonSlow, p.owner);
    if (p.onHit) p.onHit(m, p, t);
  }

  sim.stepProjs = function (m, dt) {
    var list = m.projs, keep = 0, i, j;
    for (i = 0; i < list.length; i++) {
      var p = list[i], nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, end = null;
      var tw = m.world._cast(p.x, p.y, nx, ny), tmax = tw > 1 ? 1 : tw;
      for (;;) {
        var bt = 2, bi = null;
        for (j = 0; j < m.actors.length; j++) {
          var a = m.actors[j];
          if (a.team === p.team || a.st === 'out' || (a.team === 'diver' && a.st !== 'swim') || p.hits.indexOf(a.id) >= 0) continue;
          var t = geom.segCircle(p.x, p.y, nx, ny, a.x, a.y, a.r + p.r);
          if (t >= 0 && t <= tmax && t < bt) { bt = t; bi = a; }
        }
        if (!bi) break;
        p.hits.push(bi.id);
        projHit(m, p, bi);
        if (!p.pierce) { end = 'hit'; tmax = bt; break; }
      }
      if (!end && tw <= 1) end = 'wall';
      p.px = p.x; p.py = p.y;
      if (end) { p.x += (nx - p.x) * tmax; p.y += (ny - p.y) * tmax; }
      else { p.x = nx; p.y = ny; p.life -= dt; if (p.life <= EPS) end = 'life'; }
      if (end) { if (p.onEnd) p.onEnd(m, p, end); continue; }
      list[keep++] = p;
    }
    list.length = keep;
  };

  // ---- Thợ lặn ----
  function fireHarpoon(m, a) {
    var D = VS.TUNING.diver, it = a.intent, sm = a.shotMod;
    if (sm && sm.until <= m.t) sm = a.shotMod = null;
    var dx = it.aimX - a.x, dy = it.aimY - a.y, l = Math.sqrt(dx * dx + dy * dy);
    if (l < 1e-6) { dx = Math.cos(a.ang); dy = Math.sin(a.ang); l = 1; }
    var ux = dx / l, uy = dy / l, range = D.harpoonRange * (sm && sm.rangeMul || 1);
    sim.addProj(m, {
      owner: a.id, team: 'diver', kind: 'harpoon', x: a.x + ux * (a.r + 0.1), y: a.y + uy * (a.r + 0.1), px: a.x, py: a.y,
      vx: ux * D.harpoonSpeed, vy: uy * D.harpoonSpeed, life: range / D.harpoonSpeed,
      dmg: sm && sm.dmg != null ? sm.dmg : a.def.dmg, pierce: !!(sm && sm.pierce)
    });
    a.shotMod = null;
    a.reload = a.def.reload;
    sim.emit(m, 'fire', { id: a.id, x: a.x, y: a.y, ang: Math.atan2(uy, ux) });
  }

  function nearestAlive(m, x, y, team) {
    var best = Infinity;
    for (var i = 0; i < m.actors.length; i++) {
      var o = m.actors[i];
      if (o.team !== team || o.st === 'out') continue;
      var dd = (o.x - x) * (o.x - x) + (o.y - y) * (o.y - y);
      if (dd < best) best = dd;
    }
    return best;
  }

  // Hồi sinh ở chỗ thả của mình hoặc ở một khoang cứu hộ, nơi xa cá mập còn sống gần nhất nhất.
  function respawnDiver(m, d) {
    var own = m.spawns.diver[d.spawnIdx] || m.spawns.diver[0], best = own, bd = nearestAlive(m, own[0], own[1], 'shark'), i;
    for (i = 0; i < m.pods.length; i++) {
      var p = m.pods[i], dd = nearestAlive(m, p.x, p.y, 'shark');
      if (dd > bd) { bd = dd; best = [p.x, p.y, i]; }
    }
    var x = best[0], y = best[1];
    if (best.length === 3) {
      // nhiều người cùng hồi sinh ở một khoang thì xếp lệch nhau theo chỗ thả
      var ang = (d.spawnIdx || 0) * Math.PI / 2, o = geom.findOpen(m.world, x + Math.cos(ang) * K.podSpawnOff, y + Math.sin(ang) * K.podSpawnOff, d.r0, null);
      if (o) { x = o.x; y = o.y; }
    }
    d.x = x; d.y = y; d.vx = 0; d.vy = 0;
    d.o2 = d.o2Max; d.effects.length = 0; d.light = true; d.reload = 0; d.iframes = 0; d.downBy = -1; d.heldBy = -1; d.revT = 0;
    d.lastHurtBy = -1; d.struggleSign = 0; d.hadCC = false; d.hadSlow = false; d.slowImmuneUntil = -1e9;
    sim.setState(m, d, 'swim', 'respawn');
    sim.spawnProtect(m, d);
    sim.emit(m, 'respawn', { id: d.id, x: d.x, y: d.y });
  }

  FSM.diver.swim = {
    to: ['held', 'down', 'out'],
    update: function (m, a, dt) {
      var D = VS.TUNING.diver, it = a.intent, mod = a.mod, locked = mod.stun || mod.sleep;
      aim(a, it);
      if (it.light && !locked) a.light = !a.light;
      var mx = locked ? 0 : it.mx, my = locked ? 0 : it.my, mag = Math.sqrt(mx * mx + my * my);
      if (mag > 1) { mx /= mag; my /= mag; mag = 1; }
      var moving = mag > 0.05, boosting = moving && it.boost && !locked;
      var vmax = a.def.speed * (boosting ? D.boostMul : 1) * speedFactor(a, 1 - D.kgSlow * a.carryKg);
      if (moving) approach(a, mx * vmax, my * vmax, D.accel, dt); else coast(a, D.drag, dt);
      a.o2 -= D.o2Drain * (boosting ? D.boostDrainMul : 1) * dt;
      if (a.o2 > a.o2Max) a.o2 = a.o2Max;
      if (mod.bleed > 0) { var bl = sim.effect(a, 'bleed'); sim.hurtDiver(m, a, mod.bleed * dt, bl ? bl.src : -1, 'dot'); }
      if (!locked && (it.fire || it.fireHeld) && a.reload <= 0) fireHarpoon(m, a);
      if (it.skill && !locked) sim.skillPress(m, a);
      moveBody(m, a, dt);
      if (a.st !== 'swim') return;
      diverTouch(m, a);
      if (a.o2 <= 0) downDiver(m, a);
    }
  };

  // Bị ngậm: giãy (đổi chiều mx) rút ngắn thời gian ngậm còn lại của cá mập mỗi lần struggleCut giây.
  FSM.diver.held = {
    to: ['swim', 'down', 'out'],
    update: function (m, a, dt) {
      var it = a.intent;
      aim(a, it);
      var s = a.heldBy >= 0 ? m.actors[a.heldBy] : null;
      if (!s || s.holdId !== a.id || s.st !== 'hold') { a.heldBy = -1; sim.setState(m, a, 'swim', 'orphan'); releaseGrant(m, a); return; }
      var sg = it.mx > K.struggleDead ? 1 : it.mx < -K.struggleDead ? -1 : 0;
      if (sg !== 0) {
        if (a.struggleSign !== 0 && sg !== a.struggleSign) s.stT = Math.max(0, s.stT - VS.TUNING.diver.struggleCut);
        a.struggleSign = sg;
      }
      sim.hurtDiver(m, a, VS.TUNING.shark.holdDrain * dt, s, 'dot');
    }
  };

  FSM.diver.down = {
    to: ['swim', 'out'],
    enter: function (m, a) { a.stT = VS.TUNING.diver.downT; a.revT = 0; sim.dropCarry(m, a); },
    update: function (m, a, dt) {
      var D = VS.TUNING.diver, i, o, rev = null, best = 1e9;
      aim(a, a.intent);
      var f = Math.min(1, D.drag * dt);
      a.vx -= a.vx * f; a.vy += (-K.sinkSpeed - a.vy) * f;
      moveBody(m, a, dt);
      for (i = 0; i < m.actors.length; i++) {
        o = m.actors[i];
        if (o === a || o.team !== 'diver' || o.st !== 'swim') continue;
        var dx = o.x - a.x, dy = o.y - a.y, dd = dx * dx + dy * dy;
        if (dd <= D.interactR * D.interactR && dd < best) { rev = o; best = dd; }
      }
      if (rev) {
        // vùng máy tạo O2 (zone có reviveMul) làm nhanh việc cứu
        var rate = 1;
        for (i = 0; i < m.zones.length; i++) {
          var z = m.zones[i];
          if (!z.reviveMul || z.until <= m.t) continue;
          var zx = z.x - a.x, zy = z.y - a.y;
          if (zx * zx + zy * zy <= z.r * z.r && z.reviveMul > rate) rate = z.reviveMul;
        }
        a.revT += dt * rate;
        if (a.revT >= D.reviveT - EPS) {
          a.o2 = D.reviveO2; a.revT = 0; a.downBy = -1; a.lastHurtBy = -1;
          sim.setState(m, a, 'swim', 'revive');
          rev.stats.revives++;
          sim.emit(m, 'revive', { id: a.id, by: rev.id });
          return;
        }
      } else a.revT = 0;
      a.stT -= dt;
      if (a.stT <= EPS) sim.outDiver(m, a, 'timer', null);
    }
  };

  FSM.diver.out = {
    to: ['swim'],
    enter: function (m, a) {
      a.stT = VS.TUNING.diver.respawnT; a.revT = 0; a.vx = 0; a.vy = 0;
      sim.dropCarry(m, a);
      if (sim.skillCancel) sim.skillCancel(m, a);
    },
    update: function (m, a, dt) {
      a.stT = Math.max(0, a.stT - dt);
      if (a.stT <= EPS && m.tickets > 0) { m.tickets--; respawnDiver(m, a); }
    }
  };

  // ---- Cá mập ----
  // Lái cá mập: quay mũi về (mx,my) theo turnRate, tốc độ dọc mũi tiến về mức mong muốn, không trượt ngang.
  function sharkDrive(m, a, dt) {
    var S = VS.TUNING.shark, it = a.intent, mod = a.mod;
    var mx = it.mx, my = it.my, mag = Math.sqrt(mx * mx + my * my);
    if (mag > 1) { mx /= mag; my /= mag; mag = 1; }
    var thrust = mag > 0.05;
    if (thrust) {
      var da = geom.wrap(Math.atan2(my, mx) - a.ang), lim = S.turnRate * dt;
      a.ang = geom.wrap(a.ang + (da > lim ? lim : da < -lim ? -lim : da));
    }
    var cs = Math.cos(a.ang), sn = Math.sin(a.ang);
    var s = a.vx * cs + a.vy * sn, lx = a.vx - s * cs, ly = a.vy - s * sn;
    var dash = thrust && it.boost && a.stamina > 0 && !a.dashLock && !mod.noDash;
    if (dash) {
      a.stamina -= S.staminaUse * dt;
      if (a.stamina <= 0) { a.stamina = 0; a.dashLock = true; }
    } else {
      a.stamina = Math.min(S.staminaMax, a.stamina + S.staminaRegen * dt);
      if (a.dashLock && a.stamina >= S.staminaMax * K.dashMinFrac) a.dashLock = false;
    }
    var f;
    if (thrust) {
      f = Math.min(1, S.accel * dt);
      s += ((dash ? a.def.dash : a.def.speed) * speedFactor(a, 1) * mag - s) * f;
    } else s -= s * Math.min(1, S.drag * dt);
    var lf = 1 / (1 + K.lateralDrag * dt);
    a.vx = cs * s + lx * lf; a.vy = sn * s + ly * lf;
    if (cs > 0.1) a.face = 1; else if (cs < -0.1) a.face = -1;
    moveBody(m, a, dt);
  }

  function inReach(s, d) {
    var S = VS.TUNING.shark, mx = s.x + Math.cos(s.ang) * s.r, my = s.y + Math.sin(s.ang) * s.r;
    var dx = d.x - mx, dy = d.y - my, reach = S.biteReach + d.r;
    return dx * dx + dy * dy <= reach * reach ? dx * dx + dy * dy : -1;
  }

  function biteDiver(m, s, d) {
    var S = VS.TUNING.shark, bm = sim.effect(s, 'biteMul'), amount = s.def.bite * (bm ? bm.mag : 1), applied = 0;
    s.stats.bites++;
    sim.removeEffects(s, 'biteMul');   // biteMul chỉ cho cú cắn kế tiếp
    if (d.st === 'down') {
      sim.emit(m, 'bite', { id: d.id, by: s.id, o2: 0, x: d.x, y: d.y });
      sim.outDiver(m, d, 'bite', s);
      sim.setState(m, s, 'swim', 'bite');
    } else {
      applied = sim.hurtDiver(m, d, amount, s, 'bite');
      sim.emit(m, 'bite', { id: d.id, by: s.id, o2: applied, x: d.x, y: d.y });
      if (d.st === 'swim' && !sim.effect(d, 'grabImmune') && !sim.effect(d, 'ccImmune')) {
        s.holdId = d.id; d.heldBy = s.id; d.struggleSign = 0;
        sim.setState(m, d, 'held', 'bite');
        sim.setState(m, s, 'hold', 'bite');
        s.stT = S.holdT;
        sim.emit(m, 'held', { id: d.id, by: s.id });
      } else sim.setState(m, s, 'swim', 'bite');
    }
    var sk = VS.SKILLS && VS.SKILLS[s.skill.id];
    if (sk && sk.onBite) sk.onBite(m, s, d, applied);
  }

  // Trong cú lao: tìm thợ lặn gần miệng nhất trong tầm cắn, không bị vách chắn, không miễn cắn (iframes, mới sinh), không ở trong lồng.
  // Người đang bị ngậm không phải mục tiêu (st held): con cá mập thứ hai không cắn được.
  function tryBite(m, s) {
    var best = null, bd = 1e9;
    for (var i = 0; i < m.actors.length; i++) {
      var d = m.actors[i];
      if (d.team !== 'diver' || (d.st !== 'swim' && d.st !== 'down') || d.iframes > 0 || sim.effect(d, 'spawnImmune')) continue;
      var dd = inReach(s, d);
      if (dd < 0 || dd >= bd || inCage(m, d) || !m.world.clear(s.x, s.y, d.x, d.y)) continue;
      best = d; bd = dd;
    }
    if (!best) return false;
    biteDiver(m, s, best);
    return true;
  }

  FSM.shark.swim = {
    to: ['lunge', 'stun', 'out'],
    update: function (m, a, dt) { sharkDrive(m, a, dt); }
  };

  FSM.shark.lunge = {
    to: ['swim', 'hold', 'stun', 'out'],
    enter: function (m, a) {
      var S = VS.TUNING.shark;
      a.stT = S.lungeT; a.biteCd = S.biteCd;
      sim.emit(m, 'lunge', { id: a.id, x: a.x, y: a.y, ang: a.ang });
    },
    update: function (m, a, dt) {
      var sp = a.def.dash * K.lungeMul * speedFactor(a, 1);
      a.vx = Math.cos(a.ang) * sp; a.vy = Math.sin(a.ang) * sp;
      moveBody(m, a, dt);
      if (tryBite(m, a)) return;
      a.stT -= dt;
      if (a.stT <= EPS) sim.setState(m, a, 'swim', 'lunge-end');
    }
  };

  FSM.shark.hold = {
    to: ['swim', 'stun', 'out'],
    update: function (m, a, dt) {
      sharkDrive(m, a, dt);
      var d = a.holdId >= 0 ? m.actors[a.holdId] : null;
      if (!d || d.st !== 'held') { a.holdId = -1; sim.setState(m, a, 'swim', 'orphan'); return; }
      var mx = a.x + Math.cos(a.ang) * a.r, my = a.y + Math.sin(a.ang) * a.r;
      if (m.world.solid(mx, my)) { mx = a.x; my = a.y; }
      d.x = mx; d.y = my; d.vx = a.vx; d.vy = a.vy;
      a.stT -= dt;
      if (a.stT <= EPS) { breakHold(m, a, d, 'time'); sim.setState(m, d, 'swim', 'time'); releaseGrant(m, d); }
    }
  };

  FSM.shark.stun = {
    to: ['swim', 'out'],
    enter: function (m, a) { if (a.holdId >= 0) sim.releaseHold(m, a, 'stun'); },
    update: function (m, a, dt) {
      coast(a, VS.TUNING.shark.drag, dt);
      moveBody(m, a, dt);
    }
  };

  FSM.shark.out = {
    to: ['swim'],
    enter: function (m, a) {
      a.stT = VS.TUNING.shark.outT; a.vx = 0; a.vy = 0;
      if (a.holdId >= 0) sim.releaseHold(m, a, 'out');
      if (sim.skillCancel) sim.skillCancel(m, a);
    },
    update: function (m, a, dt) {
      a.stT -= dt;
      if (a.stT <= EPS) respawnShark(m, a);
    }
  };

  // Chỗ sinh xa thợ lặn còn sống nhất, để cá mập vừa hồi sinh không bị chặn đầu.
  function respawnShark(m, s) {
    var best = m.spawns.shark[0], bd = -1;
    for (var i = 0; i < m.spawns.shark.length; i++) {
      var sp = m.spawns.shark[i], dd = nearestAlive(m, sp[0], sp[1], 'diver');
      if (dd > bd) { bd = dd; best = sp; }
    }
    s.x = best[0]; s.y = best[1]; s.vx = 0; s.vy = 0;
    s.hp = s.hpMax; s.stamina = VS.TUNING.shark.staminaMax; s.dashLock = false; s.biteCd = 0; s.holdId = -1;
    s.lastDmgT = -1e9; s.effects.length = 0; s.hadCC = false; s.hadSlow = false; s.slowImmuneUntil = -1e9;
    sim.setState(m, s, 'swim', 'respawn');
    sim.spawnProtect(m, s);
    sim.emit(m, 'shark-respawn', { id: s.id, x: s.x, y: s.y });
  }

  // ---- Một bước cho một actor ----
  sim.stepActor = function (m, a, dt) {
    aggregate(a, m.t);
    var T = VS.TUNING, it = a.intent, mod = a.mod;
    if (a.team === 'diver') {
      if (a.iframes > 0) { a.iframes -= dt; if (a.iframes < 0) a.iframes = 0; }
      if (a.reload > 0) { a.reload -= dt; if (a.reload < 0) a.reload = 0; }
    } else {
      if (a.biteCd > 0) { a.biteCd -= dt; if (a.biteCd < 0) a.biteCd = 0; }
      if (a.st !== 'out' && a.hp < a.hpMax && m.t - a.lastDmgT >= T.shark.regenDelay) a.hp = Math.min(a.hpMax, a.hp + T.shark.regen * dt);
      var disabled = mod.stun || mod.sleep;
      if (disabled && (a.st === 'swim' || a.st === 'lunge' || a.st === 'hold')) sim.setState(m, a, 'stun', 'effect');
      else if (!disabled && a.st === 'stun') sim.setState(m, a, 'swim', 'effect');
      if (a.st === 'swim' && it.fire && a.biteCd <= 0 && !mod.noDash) sim.setState(m, a, 'lunge', 'fire');
      if (it.skill && (a.st === 'swim' || a.st === 'lunge' || a.st === 'hold')) sim.skillPress(m, a);
    }
    FSM[a.team][a.st].update(m, a, dt);
    sim.skillTick(m, a, dt);
  };
})(window.VS = window.VS || {});
