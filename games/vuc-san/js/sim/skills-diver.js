// Mô phỏng: kỹ năng thợ lặn. Khung phân phát, nguyên liệu và móc nằm ở js/sim/skills.js; số đọc từ VS.SKILL_DATA[id].
/*
 * Tên cố định cho lớp vẽ.
 *   zone kind: 'flare' (pháo sáng) | 'ink' (bom mực) | 'cage' (lồng thép) | 'mine' (mìn cảm biến) | 'o2gen' (máy tạo O₂, có reviveMul)
 *   đạn kind:  'net' (súng lưới) | 'dart' (phi tiêu mê) | 'snipe' (phát xiên của ống ngắm, đổi tên từ 'harpoon' ngay bước bắn)
 *   sự kiện (sim.emit, ngoài 'skill' do khung phát): 'flare' {id,x,y,r} | 'ink' {id,x,y,r} | 'cage' {id,x,y,r} | 'mine' {id,x,y,r}
 *     | 'boom' {id (chủ mìn), target, x, y, r, dmg} | 'net' {id,x,y,ang} | 'netHit' {id,by} | 'dart' {id,x,y,ang} | 'dartHit' {id,by}
 *     | 'o2gen' {id,x,y,r} | 'snipe' {id,x,y,ang}
 * Mực: tia từ ngoài vào đám mực bị chặn, nhưng cá mập đứng trong đám mực thì bị gắn hiệu ứng blind mỗi bước (zone.onTick).
 */
(function (VS) {
  'use strict';
  var sim = VS.sim = VS.sim || {};
  var SK = VS.SKILLS = VS.SKILLS || {};

  function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }

  // Hướng ngắm của a và tầm clamp: {ux, uy, l} với l = min(khoảng cách tới điểm ngắm, range).
  function aimOf(a, range) {
    var it = a.intent, dx = it.aimX - a.x, dy = it.aimY - a.y, l = Math.sqrt(dx * dx + dy * dy);
    if (l < 1e-6) { dx = Math.cos(a.ang); dy = Math.sin(a.ang); l = range; }
    return { ux: dx / l, uy: dy / l, l: Math.min(l, range) };
  }

  // Điểm đặt vật ném: tới chỗ ngắm (tối đa range), dừng cách vách đá 0,3 m nếu có vách chắn giữa đường.
  function throwPoint(m, a, range) {
    var A = aimOf(a, range), x1 = a.x + A.ux * A.l, y1 = a.y + A.uy * A.l, hit = sim.raycast(m, a.x, a.y, x1, y1);
    if (hit) {
      var d = Math.max(0, A.l * hit.t - 0.3);
      return { x: a.x + A.ux * d, y: a.y + A.uy * d };
    }
    return { x: x1, y: y1 };
  }

  // Bắn đạn thẳng theo hướng ngắm, sống range / speed giây.
  function shoot(m, a, kind, speed, range, onHit) {
    var A = aimOf(a, 1e9), ang = Math.atan2(A.uy, A.ux);
    return sim.addProj(m, {
      owner: a.id, team: 'diver', kind: kind, x: a.x + A.ux * (a.r + 0.1), y: a.y + A.uy * (a.r + 0.1), px: a.x, py: a.y,
      vx: A.ux * speed, vy: A.uy * speed, life: range / speed, onHit: onHit, ang: ang
    });
  }

  // Cá mập còn trên bản đồ mà đội thợ lặn đang thấy, gần nhất trong tầm r (dùng đúng luật tầm nhìn như người chơi).
  function seenShark(m, a, r) {
    var best = null, bd = r;
    for (var i = 0; i < m.actors.length; i++) {
      var s = m.actors[i];
      if (s.team !== 'shark' || s.st === 'out' || !sim.canSee(m, 'diver', s)) continue;
      var d = dist(a, s);
      if (d <= bd) { best = s; bd = d; }
    }
    return best;
  }

  // Điểm ngắm đón đầu: chỗ cá mập sẽ tới sau dist / speed giây.
  function lead(a, s, speed) {
    var t = Math.min(dist(a, s) / speed, 0.6);
    return { x: s.x + s.vx * t, y: s.y + s.vy * t };
  }

  // Hồi O2 cho thợ lặn đang bơi trong zone z mỗi bước.
  function regenIn(m, z, perSec, dt) {
    for (var i = 0; i < m.actors.length; i++) {
      var d = m.actors[i];
      if (d.team !== 'diver' || d.st !== 'swim') continue;
      var dx = d.x - z.x, dy = d.y - z.y;
      if (dx * dx + dy * dy <= z.r * z.r) d.o2 = Math.min(d.o2Max, d.o2 + perSec * dt);
    }
  }

  // ---- Pháo Sáng ----
  SK['phao-sang'] = {
    start: function (m, a) {
      var D = VS.SKILL_DATA['phao-sang'], p = throwPoint(m, a, D.range), id = a.id;
      sim.addZone(m, {
        kind: 'flare', x: p.x, y: p.y, r: D.r, dur: D.dur, team: 'diver', owner: id,
        onTick: function (mm, z) {
          for (var i = 0; i < mm.actors.length; i++) {
            var s = mm.actors[i];
            if (s.team !== 'shark' || s.st === 'out') continue;
            var dx = s.x - z.x, dy = s.y - z.y;
            if (dx * dx + dy * dy <= z.r * z.r && mm.world.clear(z.x, z.y, s.x, s.y)) sim.addEffect(s, 'slow', 0.2, D.slow, z.id);
          }
        }
      });
      sim.emit(m, 'flare', { id: id, x: p.x, y: p.y, r: D.r });
    },
    // Cá mập thấy được trong tầm ném thì ném vào nó; không thì ném về chỗ tối phía trước mặt
    bot: function (m, a) {
      var D = VS.SKILL_DATA['phao-sang'], s = seenShark(m, a, D.range);
      if (s) return { x: s.x, y: s.y };
      var x = a.x + Math.cos(a.ang) * D.range * 0.85, y = a.y + Math.sin(a.ang) * D.range * 0.85;
      if (m.world.clear(a.x, a.y, x, y) && !sim.visibleTo(m, 'diver', x, y)) return { x: x, y: y };
      return null;
    }
  };

  // ---- Bom Mực ----
  SK['bom-muc'] = {
    start: function (m, a) {
      var D = VS.SKILL_DATA['bom-muc'];
      sim.addZone(m, {
        kind: 'ink', x: a.x, y: a.y, r: D.r, dur: D.dur, team: 'diver', owner: a.id,
        onTick: function (mm, z) {
          for (var i = 0; i < mm.actors.length; i++) {
            var s = mm.actors[i];
            if (s.team !== 'shark' || s.st === 'out') continue;
            var dx = s.x - z.x, dy = s.y - z.y;
            if (dx * dx + dy * dy <= z.r * z.r) sim.addEffect(s, 'blind', 0.2, 1, z.id);
          }
        }
      });
      sim.emit(m, 'ink', { id: a.id, x: a.x, y: a.y, r: D.r });
    },
    // Đang bị cá mập đuổi sát
    bot: function (m, a) { return seenShark(m, a, 4.5) ? true : null; }
  };

  // ---- Lồng Cá Mập ----
  SK['long-thep'] = {
    start: function (m, a) {
      var D = VS.SKILL_DATA['long-thep'];
      sim.addZone(m, {
        kind: 'cage', x: a.x, y: a.y, r: D.r, dur: D.dur, team: 'diver', owner: a.id,
        onTick: function (mm, z, dt) { regenIn(mm, z, D.o2Regen, dt); }
      });
      sim.emit(m, 'cage', { id: a.id, x: a.x, y: a.y, r: D.r });
    },
    // Đồng đội gục cạnh mình, hoặc mình sắp cạn O2 mà cá mập đang tới gần
    bot: function (m, a) {
      var D = VS.SKILL_DATA['long-thep'], i, o;
      for (i = 0; i < m.actors.length; i++) {
        o = m.actors[i];
        if (o !== a && o.team === 'diver' && o.st === 'down' && dist(a, o) <= D.r - 0.3) return true;
      }
      return a.o2 < a.o2Max * 0.35 && seenShark(m, a, 8) ? true : null;
    }
  };

  // ---- Súng Lưới ----
  SK['sung-luoi'] = {
    start: function (m, a) {
      var D = VS.SKILL_DATA['sung-luoi'], id = a.id;
      var p = shoot(m, a, 'net', D.speed, D.range, function (mm, pr, t) {
        if (t.team !== 'shark') return;
        sim.addEffect(t, 'slow', D.dur, D.slow, id);
        sim.addEffect(t, 'noDash', D.dur, 1, id);
        sim.emit(mm, 'netHit', { id: t.id, by: id, x: t.x, y: t.y });
      });
      sim.emit(m, 'net', { id: id, x: a.x, y: a.y, ang: p.ang });
    },
    bot: function (m, a) {
      var D = VS.SKILL_DATA['sung-luoi'], s = seenShark(m, a, D.range - 1);
      if (!s || !m.world.clear(a.x, a.y, s.x, s.y)) return null;
      return lead(a, s, D.speed);
    }
  };

  // ---- Mìn Cảm Biến ----
  // a.skill.charges là số mìn còn đặt được; mìn nổ hoặc hết giờ thì trả lại một quả.
  SK['min-cam-bien'] = {
    canStart: function (m, a) { return a.skill.charges > 0; },
    start: function (m, a) {
      var D = VS.SKILL_DATA['min-cam-bien'], id = a.id, sk = a.skill;
      sk.charges--;
      sim.addZone(m, {
        kind: 'mine', x: a.x, y: a.y, r: D.r, dur: D.life, team: 'diver', owner: id,
        onTick: function (mm, z) {
          for (var i = 0; i < mm.actors.length; i++) {
            var s = mm.actors[i];
            if (s.team !== 'shark' || s.st === 'out' || sim.effect(s, 'spawnImmune')) continue;
            var dx = s.x - z.x, dy = s.y - z.y;
            if (dx * dx + dy * dy > z.r * z.r) continue;
            var dmg = sim.damageShark(mm, s, D.dmg, id);
            sim.addEffect(s, 'stun', D.stun, 1, id);
            sim.emit(mm, 'boom', { id: id, target: s.id, x: z.x, y: z.y, r: z.r, dmg: dmg });
            z.until = mm.t;
            return;
          }
        },
        onExpire: function () { if (sk.charges < D.charges) sk.charges++; }
      });
      sim.emit(m, 'mine', { id: id, x: a.x, y: a.y, r: D.r });
    },
    // Cá mập đang tới gần: thả mìn ngay dưới chân để nó đuổi qua
    bot: function (m, a) { return a.skill.charges > 0 && seenShark(m, a, 8) ? true : null; }
  };

  // ---- Máy Tạo O₂ ----
  SK['may-o2'] = {
    start: function (m, a) {
      var D = VS.SKILL_DATA['may-o2'];
      sim.addZone(m, {
        kind: 'o2gen', x: a.x, y: a.y, r: D.r, dur: D.dur, team: 'diver', owner: a.id, reviveMul: D.reviveMul,
        onTick: function (mm, z, dt) { regenIn(mm, z, D.o2Regen, dt); }
      });
      sim.emit(m, 'o2gen', { id: a.id, x: a.x, y: a.y, r: D.r });
    },
    // Có đồng đội gục hoặc yếu O2 (kể cả mình) trong tầm máy
    bot: function (m, a) {
      var D = VS.SKILL_DATA['may-o2'];
      for (var i = 0; i < m.actors.length; i++) {
        var o = m.actors[i];
        if (o.team !== 'diver' || dist(a, o) > D.r - 0.5) continue;
        if (o.st === 'down' || (o.st === 'swim' && o.o2 < o.o2Max * 0.5 && !seenShark(m, a, 6))) return true;
      }
      return null;
    }
  };

  // ---- Phi Tiêu Mê ----
  SK['phi-tieu-me'] = {
    start: function (m, a) {
      var D = VS.SKILL_DATA['phi-tieu-me'], id = a.id;
      var p = shoot(m, a, 'dart', D.speed, D.range, function (mm, pr, t) {
        if (t.team !== 'shark') return;
        sim.addEffect(t, 'sleep', D.sleep, 1, id);
        sim.addEffect(t, 'reveal', D.reveal, 1, id);
        sim.emit(mm, 'dartHit', { id: t.id, by: id, x: t.x, y: t.y });
      });
      sim.emit(m, 'dart', { id: id, x: a.x, y: a.y, ang: p.ang });
    },
    bot: function (m, a) {
      var D = VS.SKILL_DATA['phi-tieu-me'], s = seenShark(m, a, D.range - 1);
      if (!s || s.st === 'stun' || dist(a, s) < 2.5 || !m.world.clear(a.x, a.y, s.x, s.y)) return null;
      return lead(a, s, D.speed);
    }
  };

  // ---- Ống Ngắm ----
  // Phát xiên kế tiếp do fireHarpoon dựng từ a.shotMod; update gắn lại tên 'snipe' cho viên đạn đó ngay bước bắn.
  SK['ong-ngam'] = {
    start: function (m, a) {
      var D = VS.SKILL_DATA['ong-ngam'];
      a.skill.t = D.window;
      a.beamMul = D.beamMul;
      a.shotMod = { rangeMul: D.rangeMul, dmg: D.dmg, pierce: true, until: m.t + D.window };
    },
    update: function (m, a) {
      for (var i = 0; i < m.projs.length; i++) {
        var p = m.projs[i];
        if (p.owner === a.id && p.kind === 'harpoon' && p.pierce) {
          p.kind = 'snipe';
          sim.emit(m, 'snipe', { id: a.id, x: a.x, y: a.y, ang: Math.atan2(p.vy, p.vx) });
        }
      }
    },
    end: function (m, a) {
      a.beamMul = 1;
      if (a.shotMod && a.shotMod.pierce) a.shotMod = null;
    },
    // Cá mập thấy được ở tầm mà mũi xiên thường không với tới
    bot: function (m, a) { return seenShark(m, a, 14) ? true : null; }
  };

  // ---- Máy Đẩy Utara ----
  SK['may-day'] = {
    start: function (m, a) {
      var D = VS.SKILL_DATA['may-day'];
      sim.addEffect(a, 'speed', D.dur, D.speedMul, a.id);
      sim.addEffect(a, 'grabImmune', D.dur, 1, a.id);
    },
    // Cá mập sát bên thì bỏ chạy
    bot: function (m, a) { return seenShark(m, a, 6) ? true : null; }
  };
})(window.VS = window.VS || {});
