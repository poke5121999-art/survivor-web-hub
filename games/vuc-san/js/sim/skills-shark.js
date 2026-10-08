// Mô phỏng: kỹ năng cá mập. Khung phân phát, nguyên liệu và móc nằm ở js/sim/skills.js; số đọc từ VS.SKILL_DATA[id].
/*
 * SỰ KIỆN cho lớp vẽ (sim.emit; id = cá mập dùng kỹ năng, target = thợ lặn bị ảnh hưởng):
 *   'tail'      {id, x, y, ang, r, arc, hits}              quất đuôi (quat-duoi), cung tâm ở ang, bán kính r, arc theo rad
 *   'bait'      {id, x, y, r, dur, fromX, fromY}           lùa bầy dựng zone kind 'bait' tại (x,y)
 *   'saw'       {id, x, y, ang, dist, phase: 'start'|'end'} cưa xẻ lao dọc ang; 'saw-cut' {id, x, y, what: 'cage'|'net'} khi phá lồng/lưới
 *   'latch'     {id, target, x, y} khoét thịt bám vào;  'unlatch' {id, target, why: 'time'|'shake'|'shot'|'lost'}
 *   'swallow'   {id, target, x, y, heal}                   nuốt chửng; 'guard' {id, dur, armor} khi không có ai để nuốt
 *   'sense'     {id, x, y, dur}                            cảm điện
 *   'jaw'       {id, target, x, y, fromX, fromY}           hàm vồ rắn trúng người (đạn bay là proj kind 'jaw')
 *   'suck'      {id, x, y, ang, range, arc, dur}           hút nước bắt đầu; 'suck-pull' {id, target} lần đầu một người bị hút
 * Đạn: kind 'jaw'.  Zone: kind 'bait'.  Hiệu ứng ghi lên cá mập: shrink, speed, stealth, biteMul, armor; lên thợ lặn: stun, lightOff, bleed, reveal, slow.
 * Móc lõi dùng thêm: a.lockMove = {ang, vx, vy} (actors.js, chiếm quyền lái), loot.freeAt (actors.js, khoá nhặt tạm).
 */
(function (VS) {
  'use strict';
  var sim = VS.sim = VS.sim || {};
  var geom = VS.geom;
  var SK = VS.SKILLS = VS.SKILLS || {};
  var EPS = 1e-6;
  var DEG = Math.PI / 180;

  function dat(id) { return VS.SKILL_DATA[id]; }
  function dist(a, b) { return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)); }

  // Đang đứng trong vùng zone kind nào đó (ink, cage)
  function inZone(m, d, kind) {
    for (var i = 0; i < m.zones.length; i++) {
      var z = m.zones[i];
      if (z.kind !== kind || z.until <= m.t) continue;
      if ((d.x - z.x) * (d.x - z.x) + (d.y - z.y) * (d.y - z.y) < z.r * z.r) return true;
    }
    return false;
  }

  // Mục tiêu chịu được đòn: đang bơi, không miễn sát thương mới sinh, không trốn trong lồng thép
  function targetable(m, d) {
    return d.team === 'diver' && d.st === 'swim' && !sim.effect(d, 'spawnImmune') && !inZone(m, d, 'cage');
  }
  // Bám, ngậm, kéo: thêm miễn khống chế và miễn bám (Máy Đẩy)
  function grabbable(m, d) {
    return targetable(m, d) && !sim.effect(d, 'grabImmune') && !sim.effect(d, 'ccImmune');
  }

  // Hướng ngắm (chuột) tính từ cá mập; không ngắm thì theo mũi
  function aimAngle(a) {
    var dx = a.intent.aimX - a.x, dy = a.intent.aimY - a.y;
    return dx * dx + dy * dy < 1e-6 ? a.ang : Math.atan2(dy, dx);
  }

  // Thợ lặn mà cá mập này thấy được theo luật tầm nhìn chung
  function seenDivers(m, a) {
    var out = [];
    for (var i = 0; i < m.actors.length; i++) {
      var d = m.actors[i];
      if (d.team === 'diver' && d.st !== 'out' && sim.sharkSees(m, a, d)) out.push(d);
    }
    return out;
  }

  // Thợ lặn thấy được, đang bơi, gần nhất trong [lo, hi] mét và nằm lệch mũi không quá maxOff rad, không vách chắn
  function nearestFront(m, a, lo, hi, maxOff) {
    var best = null, bd = 1e9, list = seenDivers(m, a);
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      if (!targetable(m, d)) continue;
      var dd = dist(a, d);
      if (dd < lo || dd > hi || dd >= bd) continue;
      if (maxOff < Math.PI && Math.abs(geom.angDiff(Math.atan2(d.y - a.y, d.x - a.x), a.ang)) > maxOff) continue;
      if (!m.world.clear(a.x, a.y, d.x, d.y)) continue;
      best = d; bd = dd;
    }
    return best;
  }

  function inCone(a, d, range, arcRad, ang) {
    var dx = d.x - a.x, dy = d.y - a.y, dd = Math.sqrt(dx * dx + dy * dy);
    if (dd > range) return false;
    return dd < 1e-6 || Math.abs(geom.angDiff(Math.atan2(dy, dx), ang)) <= arcRad / 2;
  }

  // ---- Lách Khe ----
  // Co lại là hiệu ứng shrink; actors.js lo va chạm và chỉ nở lại khi chỗ đứng đủ rộng cho bán kính thật.
  SK['lach-khe'] = {
    start: function (m, a) {
      var D = dat('lach-khe');
      sim.addEffect(a, 'shrink', D.dur, D.rMul, a.id);
      sim.addEffect(a, 'speed', D.dur, D.speedMul, a.id);
    },
    // Dùng khi thợ lặn đang thấy nằm trong chỗ cá mập thật không lọt, hoặc đường tới nó có khe hẹp hơn thân mình nhưng lọt khi nhỏ
    bot: function (m, a) {
      var D = dat('lach-khe'), w = m.world, list = seenDivers(m, a), small = a.r0 * D.rMul;
      if (a.r !== a.r0) return null;
      for (var i = 0; i < list.length; i++) {
        var d = list[i], dd = dist(a, d);
        if (d.st === 'out' || dd > 12) continue;
        if (!w.open(d.x, d.y, a.r0)) return true;
        for (var s = 1.5; s < dd; s += 0.5) {
          var px = a.x + (d.x - a.x) * s / dd, py = a.y + (d.y - a.y) * s / dd;
          if (!w.open(px, py, a.r0) && w.open(px, py, small)) return true;
        }
      }
      return null;
    }
  };

  // ---- Lùa Bầy ----
  SK['lua-bay'] = {
    start: function (m, a) {
      var D = dat('lua-bay'), ang = aimAngle(a), want = Math.min(D.range, dist(a, { x: a.intent.aimX, y: a.intent.aimY }));
      if (a.intent.aimX === a.x && a.intent.aimY === a.y) want = D.range;
      var ux = Math.cos(ang), uy = Math.sin(ang), px = a.x + ux * want, py = a.y + uy * want;
      var hit = m.world.raycast(a.x, a.y, px, py);
      if (hit) { var back = Math.max(0, hit.t * want - D.r * 0.5); px = a.x + ux * back; py = a.y + uy * back; }
      sim.addZone(m, {
        kind: 'bait', x: px, y: py, r: D.r, dur: D.dur, team: 'shark', owner: a.id,
        onTick: function (mm, z) {
          for (var i = 0; i < mm.actors.length; i++) {
            var d = mm.actors[i];
            if (d.team !== 'diver' || d.st === 'out' || sim.effect(d, 'spawnImmune')) continue;
            if ((d.x - z.x) * (d.x - z.x) + (d.y - z.y) * (d.y - z.y) < z.r * z.r) sim.addEffect(d, 'slow', 0.2, D.slow, z.id);
          }
        }
      });
      sim.emit(m, 'bait', { id: a.id, x: px, y: py, r: D.r, dur: D.dur, fromX: a.x, fromY: a.y });
    },
    // Thả lên đầu thợ lặn thấy được cách 3 m tới tầm ném, ngắm trước theo hướng nó bơi
    bot: function (m, a) {
      var D = dat('lua-bay'), d = nearestFront(m, a, 3, D.range, Math.PI);
      return d ? { x: d.x + d.vx * 0.5, y: d.y + d.vy * 0.5 } : null;
    }
  };

  // ---- Ẩn Đáy ----
  SK['an-day'] = {
    start: function (m, a) {
      var D = dat('an-day');
      sim.addEffect(a, 'stealth', D.dur, D.revealR, a.id);
      a.skill.ambush = true;
    },
    end: function (m, a) { sim.removeEffects(a, 'stealth'); a.skill.ambush = false; },
    // Cú cắn đầu tiên trong lúc tàng hình: choáng; mất lượt dù mục tiêu miễn khống chế
    onBite: function (m, s, d) {
      if (!s.skill.ambush || s.skill.t <= 0) return;
      s.skill.ambush = false;
      if (d.st !== 'out' && !sim.effect(d, 'spawnImmune')) sim.addEffect(d, 'stun', dat('an-day').ambushStun, 1, s.id);
    },
    // Tàng hình khi đang thấy con mồi ở xa vừa tầm rình
    bot: function (m, a) { return nearestFront(m, a, 5, 14, Math.PI) ? true : null; }
  };

  // ---- Tốc Biến ----
  SK['toc-bien'] = {
    start: function (m, a) {
      var D = dat('toc-bien');
      sim.addEffect(a, 'speed', D.dur, D.speedMul, a.id);
      sim.addEffect(a, 'biteMul', D.dur, D.biteMul, a.id);
    },
    bot: function (m, a) { return nearestFront(m, a, 3, 13, 0.6) ? true : null; }
  };

  // ---- Quất Đuôi ----
  SK['quat-duoi'] = {
    start: function (m, a) {
      var D = dat('quat-duoi'), arc = D.arc * DEG, hits = 0;
      for (var i = 0; i < m.actors.length; i++) {
        var d = m.actors[i];
        if (!targetable(m, d) || !inCone(a, d, D.r, arc, a.ang) || !m.world.clear(a.x, a.y, d.x, d.y)) continue;
        sim.addEffect(d, 'lightOff', D.lightOff, 1, a.id);
        hits++;
        if (sim.effect(d, 'grabImmune') || sim.effect(d, 'ccImmune')) continue;
        sim.addEffect(d, 'stun', D.stun, 1, a.id);
        var dx = d.x - a.x, dy = d.y - a.y, l = Math.sqrt(dx * dx + dy * dy) || 1;
        d.vx = dx / l * D.push; d.vy = dy / l * D.push;
      }
      sim.emit(m, 'tail', { id: a.id, x: a.x, y: a.y, ang: a.ang, r: D.r, arc: arc, hits: hits });
    },
    bot: function (m, a) { return nearestFront(m, a, 0, dat('quat-duoi').r - 0.5, dat('quat-duoi').arc * DEG / 2 - 0.15) ? true : null; }
  };

  // ---- Cưa Xẻ ----
  // Lao thẳng dist mét bằng tốc độ cú lao (dash × lungeMul), nên thời gian lao là dist / tốc độ.
  function sawFinish(m, a) {
    var sk = a.skill;
    if (!a.lockMove && !sk.saw) return;
    a.lockMove = null; sk.saw = null; sk.t = 0; a.vx = a.vy = 0;   // dừng đúng ở cuối đường cưa, không trượt thêm
    sim.emit(m, 'saw', { id: a.id, x: a.x, y: a.y, ang: a.ang, dist: dat('cua-xe').dist, phase: 'end' });
  }

  SK['cua-xe'] = {
    start: function (m, a) {
      var D = dat('cua-xe'), sp = a.def.dash * sim.K.lungeMul, sk = a.skill, ang = a.ang;
      sk.t = D.dist / sp;
      sk.saw = { px: a.x, py: a.y, hit: [] };
      a.lockMove = { ang: ang, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp };
      sim.removeEffects(a, 'slow'); sim.removeEffects(a, 'noDash');   // xé lưới trói mình
      sim.emit(m, 'saw', { id: a.id, x: a.x, y: a.y, ang: ang, dist: D.dist, phase: 'start' });
    },
    update: function (m, a) {
      var D = dat('cua-xe'), sk = a.skill, sw = sk.saw, i;
      if (!sw) return;
      if (a.st !== 'swim') { sawFinish(m, a); return; }
      for (i = 0; i < m.zones.length; i++) {
        var z = m.zones[i];
        if ((z.kind !== 'cage' && z.kind !== 'net') || z.until <= m.t) continue;
        if (geom.segDist2(sw.px, sw.py, a.x, a.y, z.x, z.y) <= (z.r + a.r + 0.3) * (z.r + a.r + 0.3)) {
          z.until = m.t;
          sim.emit(m, 'saw-cut', { id: a.id, x: z.x, y: z.y, what: z.kind });
        }
      }
      for (i = 0; i < m.actors.length; i++) {
        var d = m.actors[i];
        if (!targetable(m, d) || sw.hit.indexOf(d.id) >= 0) continue;
        var rr = D.width / 2 + d.r;
        if (geom.segDist2(sw.px, sw.py, a.x, a.y, d.x, d.y) > rr * rr) continue;
        sw.hit.push(d.id);
        sim.hurtDiver(m, d, D.dmg, a, 'hit');
        sim.addEffect(d, 'bleed', D.bleedDur, D.bleed, a.id);
      }
      sw.px = a.x; sw.py = a.y;
    },
    end: function (m, a) { sawFinish(m, a); },
    bot: function (m, a) { return nearestFront(m, a, 2, dat('cua-xe').dist, 0.3) ? true : null; }
  };

  // ---- Khoét Thịt ----
  function latchTarget(m, a) {
    var D = dat('khoet-thit'), best = null, bd = 1e9;
    for (var i = 0; i < m.actors.length; i++) {
      var d = m.actors[i];
      if (!grabbable(m, d)) continue;
      var dd = dist(a, d);
      if (dd > D.range || dd >= bd || !m.world.clear(a.x, a.y, d.x, d.y)) continue;
      best = d; bd = dd;
    }
    return best;
  }

  function unlatch(m, a, why) {
    var sk = a.skill;
    if (sk.target == null || sk.target < 0) return;
    var id = sk.target;
    sk.target = -1; sk.t = 0; a.lockMove = null;
    sim.emit(m, 'unlatch', { id: a.id, target: id, why: why });
  }

  SK['khoet-thit'] = {
    canStart: function (m, a) { return !!latchTarget(m, a); },
    start: function (m, a) {
      var d = latchTarget(m, a), sk = a.skill, ang = Math.atan2(d.y - a.y, d.x - a.x);
      sk.target = d.id; sk.boostT = 0; sk.latchT = m.t;
      a.lockMove = { ang: ang, vx: d.vx, vy: d.vy };
      sim.emit(m, 'latch', { id: a.id, target: d.id, x: d.x, y: d.y });
    },
    update: function (m, a, dt) {
      var D = dat('khoet-thit'), sk = a.skill, d = sk.target >= 0 ? m.actors[sk.target] : null;
      if (!d || d.st !== 'swim' || a.st !== 'swim' || sim.effect(d, 'grabImmune')) { unlatch(m, a, 'lost'); return; }
      if (a.lastDmgT >= sk.latchT - EPS) { unlatch(m, a, 'shot'); return; }
      var it = d.intent, moving = it.mx * it.mx + it.my * it.my > 0.0025;
      sk.boostT = moving && it.boost && !d.mod.stun && !d.mod.sleep ? sk.boostT + dt : 0;
      if (sk.boostT >= D.shakeT - EPS) { unlatch(m, a, 'shake'); return; }
      var ang = a.lockMove.ang, off = (a.r + d.r) * 0.7;
      a.lockMove.vx = d.vx; a.lockMove.vy = d.vy;
      a.x = d.x - Math.cos(ang) * off; a.y = d.y - Math.sin(ang) * off;
      if (!m.world.open(a.x, a.y, a.r)) m.world.resolve(a, a.r);
      sim.hurtDiver(m, d, D.drain * dt, a, 'dot');
    },
    end: function (m, a) { unlatch(m, a, 'time'); },
    bot: function (m, a) { return latchTarget(m, a) && sim.sharkSees(m, a, latchTarget(m, a)) ? true : null; }
  };

  // ---- Nuốt Chửng ----
  function swallowTarget(m, a) {
    var D = dat('nuot-chung'), best = null, bs = 1e9;
    for (var i = 0; i < m.actors.length; i++) {
      var d = m.actors[i];
      if (d.team !== 'diver' || sim.effect(d, 'spawnImmune') || sim.effect(d, 'grabImmune') || inZone(m, d, 'cage')) continue;
      var down = d.st === 'down';
      if (!down && !(d.st === 'swim' && d.o2 < D.lowO2 && !sim.effect(d, 'ccImmune'))) continue;
      var dd = dist(a, d);
      if (dd > D.range || !m.world.clear(a.x, a.y, d.x, d.y)) continue;
      var sc = dd - (down ? 100 : 0);
      if (sc < bs) { best = d; bs = sc; }
    }
    return best;
  }

  SK['nuot-chung'] = {
    start: function (m, a) {
      var D = dat('nuot-chung'), d = swallowTarget(m, a);
      if (d) {
        var tx = d.x, ty = d.y;
        a.skill.t = 0;   // nuốt xong là xong, không có giai đoạn kéo dài
        if (sim.outDiver(m, d, 'swallow', a)) {
          a.hp = Math.min(a.hpMax, a.hp + a.hpMax * D.heal);
          sim.emit(m, 'swallow', { id: a.id, target: d.id, x: tx, y: ty, heal: D.heal });
          return;
        }
      }
      sim.addEffect(a, 'armor', D.dur, D.armor, a.id);
      sim.emit(m, 'guard', { id: a.id, dur: D.dur, armor: D.armor });
    },
    bot: function (m, a) {
      if (swallowTarget(m, a)) return true;
      return a.hp < a.hpMax * 0.6 && nearestFront(m, a, 0, 10, Math.PI) ? true : null;
    }
  };

  // ---- Cảm Điện ----
  // Dùng hiệu ứng reveal từng thợ lặn (không dùng m.reveal vì nó không loại trừ được ai): người trong mực hoặc lồng thì không lộ.
  function senseRevoke(m, a) {
    for (var i = 0; i < m.actors.length; i++) {
      var d = m.actors[i];
      if (d.team !== 'diver') continue;
      for (var k = 0; k < d.effects.length; k++) if (d.effects[k].kind === 'reveal' && d.effects[k].src === a.id) d.effects[k].until = 0;
    }
  }

  SK['cam-dien'] = {
    start: function (m, a) { sim.emit(m, 'sense', { id: a.id, x: a.x, y: a.y, dur: dat('cam-dien').dur }); },
    update: function (m, a) {
      for (var i = 0; i < m.actors.length; i++) {
        var d = m.actors[i];
        if (d.team !== 'diver' || d.st === 'out') continue;
        if (inZone(m, d, 'ink') || inZone(m, d, 'cage')) {
          for (var k = 0; k < d.effects.length; k++) if (d.effects[k].kind === 'reveal' && d.effects[k].src === a.id) d.effects[k].until = 0;
        } else sim.addEffect(d, 'reveal', a.skill.t, 1, a.id);
      }
    },
    end: function (m, a) { senseRevoke(m, a); },
    // Dùng khi cả đội đang chẳng thấy ai mà vẫn còn thợ lặn trên bản đồ
    bot: function (m, a) {
      var any = false, i, d;
      for (i = 0; i < m.actors.length; i++) {
        d = m.actors[i];
        if (d.team !== 'diver' || d.st === 'out') continue;
        any = true;
        for (var j = 0; j < m.actors.length; j++) {
          var s = m.actors[j];
          if (s.team === 'shark' && s.st !== 'out' && sim.sharkSees(m, s, d)) return null;
        }
      }
      return any ? true : null;
    }
  };

  // ---- Vồ Rắn ----
  // data không có tốc độ hàm nên lấy 2 lần tốc độ cú lao của chính con cá mập.
  function pullTo(m, d, a, amount) {
    var dx = a.x - d.x, dy = a.y - d.y, l = Math.sqrt(dx * dx + dy * dy);
    var mv = Math.min(amount, l - (a.r + d.r + 0.2));
    if (l < 1e-6 || mv <= 0) return 0;
    for (; mv > 0.01; mv -= 0.25) {
      var px = d.x + dx / l * mv, py = d.y + dy / l * mv;
      if (m.world.open(px, py, d.r) && m.world.clear(d.x, d.y, px, py)) { d.x = px; d.y = py; d.vx = d.vy = 0; return mv; }
    }
    return 0;
  }

  SK['vo-ran'] = {
    start: function (m, a) {
      var D = dat('vo-ran'), ang = aimAngle(a), sp = a.def.dash * sim.K.lungeMul * 2, ux = Math.cos(ang), uy = Math.sin(ang);
      var fromX = a.x, fromY = a.y;
      sim.addProj(m, {
        owner: a.id, team: 'shark', kind: 'jaw', x: a.x + ux * (a.r + 0.1), y: a.y + uy * (a.r + 0.1), px: a.x, py: a.y,
        vx: ux * sp, vy: uy * sp, life: D.dist / sp, r: 0.4,
        onHit: function (mm, p, t) {
          if (t.team !== 'diver' || a.st === 'out' || !grabbable(mm, t)) return;
          pullTo(mm, t, a, D.pull);
          sim.addEffect(t, 'stun', D.stun, 1, a.id);
          sim.emit(mm, 'jaw', { id: a.id, target: t.id, x: t.x, y: t.y, fromX: fromX, fromY: fromY });
        }
      });
    },
    bot: function (m, a) {
      var D = dat('vo-ran'), d = nearestFront(m, a, 3, D.dist - 1, 0.5);
      if (!d || !grabbable(m, d)) return null;
      var tof = dist(a, d) / (a.def.dash * sim.K.lungeMul * 2);
      return { x: d.x + d.vx * tof, y: d.y + d.vy * tof };
    }
  };

  // ---- Hút Nước ----
  SK['hut-nuoc'] = {
    start: function (m, a) {
      var D = dat('hut-nuoc');
      a.skill.pulled = [];
      sim.emit(m, 'suck', { id: a.id, x: a.x, y: a.y, ang: a.ang, range: D.range, arc: D.arc * DEG, dur: D.dur });
    },
    update: function (m, a, dt) {
      var D = dat('hut-nuoc'), sk = a.skill, arc = D.arc * DEG;
      for (var i = 0; i < m.actors.length; i++) {
        var d = m.actors[i];
        if (!grabbable(m, d) || !inCone(a, d, D.range, arc, a.ang) || !m.world.clear(a.x, a.y, d.x, d.y)) continue;
        if (d.carry.length) {
          var ids = d.carry.slice();
          sim.dropCarry(m, d);
          for (var k = 0; k < ids.length; k++) m.loot[ids[k]].freeAt = m.t + sk.t;   // khỏi nhặt lại ngay dưới chân
        }
        if (sk.pulled.indexOf(d.id) < 0) { sk.pulled.push(d.id); sim.emit(m, 'suck-pull', { id: a.id, target: d.id }); }
        pullTo(m, d, a, D.pullSpeed * dt);
      }
    },
    bot: function (m, a) { return nearestFront(m, a, 2, dat('hut-nuoc').range - 1, dat('hut-nuoc').arc * DEG / 2 - 0.1) ? true : null; }
  };
})(window.VS = window.VS || {});
