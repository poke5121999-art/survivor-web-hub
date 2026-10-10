// Đạo cụ trong trận: hàng hộp "?", hai ô đạo cụ mỗi xe, rút theo hạng, tên lửa/đĩa bay bay theo đường, vỏ chuối/lốc xoáy/mây
// nằm trên đường, hiệu ứng trúng qua k.fx, bot tự nhặt và dùng. Thuần JS. Luật và số ở data/items.js (TD.ITEMS, TD.ITEM_RULES).
//   R.items = TD.Items.init(R)         (race.js gọi khi mode.items)
//   TD.Items.step(R, h)                (mỗi bước cố định, sau va chạm xe)
//   TD.Items.use(R, k, slot)           → { item, target } hoặc null (ô trống)
//   TD.Items.give(R, k, id)            → bỏ đạo cụ vào ô trống đầu tiên (Khu Luyện Tập, bài kiểm)
// R.items = { boxes[], proj[] (missile, ufo), hz[] (banana, tornado, cloud), ks[id] (ô, khiên, mực...), path }
// Sự kiện: item_get {item}, item_use {item, target}, item_hit {item, by} (kart = nạn nhân), item_block {item, by}, item_full.
(function (G) {
  var TD = G.TD = G.TD || {};

  // ---------- đường chính theo s: dựng một lần cho mỗi đường, để tên lửa / lốc xoáy / hàng hộp đặt theo quãng đường ----------
  function mainPath(T) {
    if (T._itemPath) return T._itemPath;
    var ids = [], seen = {}, i = 0;
    // đường A→B (T.loop false): điểm cuối không có điểm kế tiếp
    while (i != null && !seen[i]) { seen[i] = 1; ids.push(i); i = T.next[i] && T.next[i].length ? T.next[i][0] : null; }
    ids.sort(function (a, b) { return T.s[a] - T.s[b]; });
    return (T._itemPath = { ids: ids, s: ids.map(function (q) { return T.s[q]; }) });
  }

  // Điểm tâm đường ở quãng s (bọc theo chiều dài vòng) lệch ngang d (+ trái): { x, y, z, fx, fz, lw, rw }.
  function at(R, s, d) {
    var T = R.T, P = mainPath(T), L = T.L, n = P.ids.length;
    s = T.loop === false ? Math.min(Math.max(s, P.s[0]), P.s[n - 1] - 1e-6) : ((s % L) + L) % L;   // A→B: kẹp, không bọc
    var lo = 0, hi = n - 1;
    if (s < P.s[0] || s >= P.s[n - 1]) { lo = n - 1; hi = 0; }
    else { while (hi - lo > 1) { var m = (lo + hi) >> 1; if (P.s[m] <= s) lo = m; else hi = m; } }
    var a = P.ids[lo], b = P.ids[hi];
    var sa = P.s[lo], sb = P.s[hi]; if (sb <= sa) sb += L; var sx = s < sa ? s + L : s;
    var t = Math.max(0, Math.min(1, (sx - sa) / ((sb - sa) || 1)));
    var fx = T.fx[a] + (T.fx[b] - T.fx[a]) * t, fz = T.fz[a] + (T.fz[b] - T.fz[a]) * t, fl = Math.hypot(fx, fz) || 1;
    fx /= fl; fz /= fl;
    d = d || 0;
    return { x: T.x[a] + (T.x[b] - T.x[a]) * t + fz * d, y: T.y[a] + (T.y[b] - T.y[a]) * t, z: T.z[a] + (T.z[b] - T.z[a]) * t - fx * d,
      fx: fx, fz: fz, lw: T.lw[a] + (T.lw[b] - T.lw[a]) * t, rw: T.rw[a] + (T.rw[b] - T.rw[a]) * t };
  }

  // Hàng hộp: TD.TRACKS[id].boxes (propspointconfig gốc) nếu có, không thì cứ ~400 m một hàng ngang 5–6 hộp.
  function makeRows(R) {
    var T = R.T, src = T.src.boxes, RU = TD.ITEM_RULES, rows = [];
    if (src && src.length) {
      src.forEach(function (r) {
        rows.push(r.pts.map(function (p) {
          var loc = TD.Track.locate(T, p[0], p[1] + 1, p[2], null);
          return { x: p[0], y: loc.y, z: p[2], s: r.s };
        }));
      });
      return rows;
    }
    // đường A→B: hàng cuối dừng trước checkpoint đích, không bọc qua đầu đường
    var s0 = T.cps[T.startCp].s, end = T.loop === false ? T.cps[T.endCp].s - s0 : T.L;
    for (var s = RU.rowFirst; s < end - RU.rowEndGap; s += RU.rowGap) {
      var c = at(R, s0 + s, 0), w = c.lw + c.rw - 2.5;
      var n = Math.max(3, Math.min(RU.rowMax, Math.floor(w / RU.boxGap) + 1));
      var gap = Math.min(RU.boxGap, w / (n - 1)), mid = (c.lw - c.rw) / 2, row = [];
      for (var j = 0; j < n; j++) {
        var p = at(R, s0 + s, mid + (j - (n - 1) / 2) * gap);
        var loc = TD.Track.locate(T, p.x, c.y + 1, p.z, null);
        row.push({ x: p.x, y: loc.y, z: p.z, s: s0 + s });
      }
      rows.push(row);
    }
    return rows;
  }

  function init(R) {
    var I = { boxes: [], proj: [], hz: [], ks: {}, rows: null, uid: 1 };
    I.rows = makeRows(R);
    I.rows.forEach(function (row, ri) { row.forEach(function (b) { I.boxes.push({ x: b.x, y: b.y, z: b.z, row: ri, on: true, t: 0 }); }); });
    R.karts.forEach(function (k) {
      I.ks[k.id] = { slots: [], got: [], shieldT: 0, shieldKind: null, inkT: 0, inkAcc: 0, fogT: 0, magnet: null, pickCool: 0,
        ai: { hold: 0, think: 0 }, score: { attack: 0, defend: 0, support: 0 } };
      for (var i = 0; i < TD.ITEM_RULES.slots; i++) I.ks[k.id].slots.push(null);
    });
    return I;
  }

  var ev = function (R, k, type, extra) { TD.Kart.ev(R, k, type, extra); };
  var ST = function (R, k) { return R.items.ks[k.id]; };
  var opp = function (a, b) { return a !== b && (a.team == null || a.team !== b.team); };
  var live = function (k) { return k.st !== 'finish' && k.st !== 'respawn'; };

  // ---------- rút đạo cụ theo hạng ----------
  function draw(R, k) {
    var n = R.karts.length, f = n > 1 ? (k.place - 1) / (n - 1) : 0;
    var b = k.place <= 1 || f < 0.34 ? 0 : f > 0.66 ? 2 : 1, tot = 0, list = [];
    for (var id in TD.ITEMS) {
      var it = TD.ITEMS[id], w = it.w[b];
      if (it.team && !R.mode.teams) w = 0;
      if (id === 'ufo' && k.place <= 1) w = 0;   // hạng 1 không rút Đĩa Bay (mẹo 116d5642: Đĩa Bay là khắc tinh của hạng 1)
      if (w > 0) { list.push([id, w]); tot += w; }
    }
    var r = R.rng.next() * tot;
    for (var i = 0; i < list.length; i++) { r -= list[i][1]; if (r <= 0) return list[i][0]; }
    return list[list.length - 1][0];
  }

  function give(R, k, id) {
    var st = ST(R, k), i = st.slots.indexOf(null);
    if (i < 0) return false;
    st.slots[i] = id; st.got[i] = R.t;
    ev(R, k, 'item_get', { item: id, slot: i });
    return true;
  }

  function pickups(R, h) {
    var I = R.items, RU = TD.ITEM_RULES, resp = R.mode.practice ? RU.practiceRespawn : RU.respawn;
    I.boxes.forEach(function (b) { if (!b.on && (b.t -= h) <= 0) b.on = true; });
    R.karts.forEach(function (k) {
      var st = ST(R, k);
      if (st.pickCool > 0) st.pickCool -= h;
      if (!live(k) || k.st === 'grid' || st.pickCool > 0) return;
      for (var i = 0; i < I.boxes.length; i++) {
        var b = I.boxes[i];
        if (!b.on || Math.abs(k.x - b.x) > RU.pickR || Math.abs(k.z - b.z) > RU.pickR || Math.abs(k.y - b.y) > RU.pickDy) continue;
        if (Math.hypot(k.x - b.x, k.z - b.z) > RU.pickR) continue;
        // Ô đầy: hộp vẫn còn cho xe sau ("Đạo cụ đầy, không thể nhặt", 677dfa88).
        if (st.slots.indexOf(null) < 0) { if (!st.fullT || R.t - st.fullT > 2) { st.fullT = R.t; ev(R, k, 'item_full'); } return; }
        b.on = false; b.t = resp; st.pickCool = RU.pickGap;
        give(R, k, draw(R, k));
        R.events[R.events.length - 1].box = i;
        return;
      }
    });
  }

  // ---------- trúng đòn ----------
  function hit(R, v, id, by, extra) {
    var it = TD.ITEMS[id], st = ST(R, v), atk = by != null ? R.karts[by] : null;
    if (!live(v)) return false;
    if (it.block && st.shieldT > 0) {
      st.shieldT = 0;
      st.score.defend++;
      ev(R, v, 'item_block', { item: id, by: by, shield: st.shieldKind });
      return false;
    }
    var fx = v.fx;
    if (it.stun) {
      fx.stunT = Math.max(fx.stunT, it.stun); fx.decay = it.decay;
      fx.kind = { missile: 'flip', banana: 'spin', tornado: 'tornado', lightning: 'shrink', ufo: 'lift' }[id] || 'spin';
    }
    if (it.slowT) { fx.slowT = Math.max(fx.slowT, it.slowT); fx.slowMul = Math.min(fx.slowMul, it.slowMul); }   // hết hãm thì kart.js trả slowMul về 1
    if (it.pop && v.grounded) { v.grounded = false; v.vy = it.pop; v.airT = 0; v._airEv = false; }
    if (extra) extra(v, st);
    if (atk && atk !== v) ST(R, atk).score.attack++;
    ev(R, v, 'item_hit', { item: id, by: by });
    return true;
  }

  // ---------- chọn mục tiêu ----------
  function aheadOf(R, k, range) {
    var best = null, bd = range;
    R.karts.forEach(function (o) {
      if (!opp(o, k) || !live(o)) return;
      var d = o.progress - k.progress;
      if (d > 0 && d < bd) { bd = d; best = o; }
    });
    return best;
  }
  function leaderOpp(R, k) {
    var l = R.karts.filter(function (o) { return o.place === 1; })[0];
    return l && opp(l, k) && live(l) ? l : null;   // hạng 1 là mình hay đồng đội thì Đĩa Bay vô hiệu (116d5642)
  }
  function allAhead(R, k) {
    return R.karts.filter(function (o) { return opp(o, k) && live(o) && o.place < k.place; });
  }

  // ---------- dùng đạo cụ ----------
  function use(R, k, slot) {
    var st = ST(R, k);
    if (!st || R.phase === 'countdown' || k.st === 'respawn') return null;
    slot = slot || 0;
    var id = st.slots[slot];
    if (!id) return null;
    st.slots[slot] = null;
    var it = TD.ITEMS[id], I = R.items, tgt = null, U = TD.TUNING;
    var fx = Math.sin(k.yaw), fz = Math.cos(k.yaw);
    switch (id) {
      case 'missile':
        tgt = aheadOf(R, k, it.range);
        I.proj.push({ id: I.uid++, type: 'missile', by: k.id, target: tgt ? tgt.id : null, t: 0, p: k.progress, d: k.loc ? k.loc.d : 0,
          x: k.x + fx * 2, y: k.y + 1, z: k.z + fz * 2, vx: fx, vy: 0, vz: fz, home: false });
        break;
      case 'ufo':
        tgt = leaderOpp(R, k);
        if (tgt) I.proj.push({ id: I.uid++, type: 'ufo', by: k.id, target: tgt.id, t: 0, phase: 'fly', x: k.x, y: k.y + 4, z: k.z, sx: k.x, sy: k.y + 4, sz: k.z });
        break;
      case 'magnet':
        tgt = aheadOf(R, k, it.range);
        st.magnet = { target: tgt ? tgt.id : null, t: tgt ? it.dur : 1 };
        if (tgt) { tgt.fx.slowT = Math.max(tgt.fx.slowT, it.dur); tgt.fx.slowMul = Math.min(tgt.fx.slowMul, it.slowMul); ev(R, tgt, 'item_hit', { item: id, by: k.id }); st.score.attack++; }
        break;
      case 'banana':
      case 'cloud': {
        var x = k.x - fx * it.back, z = k.z - fz * it.back, loc = TD.Track.locate(R.T, x, k.y + 1, z, k.loc ? k.loc.seg : null);
        I.hz.push({ id: I.uid++, type: id, by: k.id, x: x, y: loc.y, z: z, t: 0, life: it.life, hit: {} });
        break;
      }
      case 'tornado': {
        var p = at(R, (k.loc ? k.loc.s : 0) + it.ahead, 0), loc2 = TD.Track.locate(R.T, p.x, p.y + 1, p.z, null);
        I.hz.push({ id: I.uid++, type: id, by: k.id, x: p.x, y: loc2.y, z: p.z, t: 0, life: it.life, hit: {} });
        break;
      }
      case 'lightning':
      case 'ink':
        allAhead(R, k).forEach(function (v) {
          hit(R, v, id, k.id, id === 'ink' ? function (vk, vs) {
            if (vs.inkT <= 0) { vs.inkAcc = vk.p.accel; vk.p.accel *= it.accelMul; }
            vs.inkT = it.dur;
          } : null);
        });
        break;
      case 'shield':
        st.shieldT = it.dur; st.shieldKind = 'shield';
        break;
      case 'angel':
        R.karts.forEach(function (o) {
          if (o === k || (k.team != null && o.team === k.team && o.st !== 'finish')) { var os = ST(R, o); os.shieldT = it.dur; os.shieldKind = 'angel'; }
        });
        st.score.support++;
        break;
      case 'nitro':
        k.nitro.boostT = U.nitroTime;
        k.stats.nitros++;
        st.score.support++;
        ev(R, k, 'nitro_start', { charges: k.nitro.charges, item: true });
        break;
    }
    ev(R, k, 'item_use', { item: id, target: tgt ? tgt.id : null, slot: slot });
    st.ai.hold = 0;
    return { item: id, target: tgt ? tgt.id : null };
  }

  // ---------- tên lửa, đĩa bay ----------
  function stepProj(R, h) {
    var I = R.items, T = R.T;
    I.proj = I.proj.filter(function (m) {
      m.t += h;
      var tg = m.target != null ? R.karts[m.target] : null, it = TD.ITEMS[m.type];
      if (m.type === 'ufo') {
        if (!tg) return false;
        if (m.phase === 'fly') {
          var a = Math.min(1, m.t / it.fly), e = a * a * (3 - 2 * a);
          m.x = m.sx + (tg.x - m.sx) * e; m.y = m.sy + (tg.y + 3.2 - m.sy) * e + Math.sin(a * Math.PI) * 6; m.z = m.sz + (tg.z - m.sz) * e;
          if (a >= 1) {
            m.phase = 'hover'; m.t = 0;
            if (live(tg)) {
              var up = tg.loc && tg.loc.slope > 0.05;
              hit(R, tg, 'ufo', m.by);
              tg.fx.slowT = Math.max(tg.fx.slowT, it.dur); tg.fx.slowMul = Math.min(tg.fx.slowMul, up ? it.slowMulUp : it.slowMul);
            }
          }
          return true;
        }
        m.x = tg.x; m.y = tg.y + 3.2; m.z = tg.z;
        return m.t < it.dur && tg.st !== 'respawn';
      }
      // tên lửa: chạy dọc đường theo tiến độ, cách mục tiêu < 25 m (hoặc lệch tầng) thì lao thẳng vào xe
      var v = it.speed * h, gap = tg ? tg.progress - m.p : 1e9;
      if (!m.home && tg && (gap < 25 || Math.abs(tg.y - m.y) > 6 && gap < 60)) m.home = true;
      if (m.home && tg && live(tg)) {
        var dx = tg.x - m.x, dy = tg.y + 0.7 - m.y, dz = tg.z - m.z, dl = Math.hypot(dx, dy, dz) || 1;
        m.vx = dx / dl; m.vy = dy / dl; m.vz = dz / dl;
        m.x += m.vx * v; m.y += m.vy * v; m.z += m.vz * v;
        if (dl < it.hitR + v) { hit(R, tg, 'missile', m.by); ev(R, tg, 'item_boom', { item: 'missile', x: tg.x, y: tg.y + 0.7, z: tg.z }); return false; }
      } else {
        m.p += v;
        if (tg) m.d += Math.max(-v * 0.15, Math.min(v * 0.15, (tg.loc ? tg.loc.d : 0) - m.d));
        var c = at(R, T.loop === false ? m.p : m.p - (Math.floor(m.p / T.L) * T.L), m.d), y = c.y + 1;
        m.vx = c.x - m.x; m.vy = y - m.y; m.vz = c.z - m.z;
        var l = Math.hypot(m.vx, m.vy, m.vz) || 1; m.vx /= l; m.vy /= l; m.vz /= l;
        m.x = c.x; m.y = y; m.z = c.z;
      }
      if (m.t > it.life || (!tg && m.t > 2)) { ev(R, R.karts[m.by], 'item_boom', { item: 'missile', x: m.x, y: m.y, z: m.z }); return false; }
      return true;
    });
  }

  // ---------- vật nằm trên đường ----------
  function stepHazards(R, h) {
    var I = R.items;
    I.hz = I.hz.filter(function (z) {
      z.t += h;
      var it = TD.ITEMS[z.type], r = z.type === 'banana' ? it.hitR : it.r, done = false;
      R.karts.forEach(function (k) {
        if (done || !live(k) || z.hit[k.id] || (k.id === z.by && z.t < (it.grace || 1.5))) return;
        if (Math.abs(k.y - z.y) > 3 || Math.hypot(k.x - z.x, k.z - z.z) > r) return;
        z.hit[k.id] = 1;
        if (z.type === 'cloud') {
          // Mây mù chỉ tác dụng với người chạm trúng đầu tiên, cả đồng đội lẫn đối thủ (14aa7210).
          hit(R, k, 'cloud', z.by, function (vk, vs) {
            vs.fogT = it.fog;
            if (vk.ctrl === 'bot') { vk.fx.slowT = Math.max(vk.fx.slowT, it.botSlowT); vk.fx.slowMul = Math.min(vk.fx.slowMul, it.botSlowMul); }
          });
          done = true;
        } else {
          hit(R, k, z.type, z.by);
          done = z.type === 'banana';   // vỏ chuối mất sau lần cán đầu (kể cả khi khiên đỡ), lốc xoáy còn tới hết giờ
        }
      });
      return !done && z.t < z.life;
    });
  }

  // ---------- trạng thái từng xe: khiên, mực, sương, nam châm ----------
  function stepKarts(R, h) {
    R.karts.forEach(function (k) {
      var st = ST(R, k);
      if (st.shieldT > 0) { st.shieldT -= h; if (st.shieldT <= 0) { st.shieldT = 0; st.shieldKind = null; } }
      if (st.fogT > 0) st.fogT = Math.max(0, st.fogT - h);
      if (st.inkT > 0) { st.inkT -= h; if (st.inkT <= 0) { st.inkT = 0; k.p.accel = st.inkAcc; } }
      var mg = st.magnet;
      if (mg) {
        mg.t -= h;
        var tg = mg.target != null ? R.karts[mg.target] : null;
        k.nitro.boostT = Math.max(k.nitro.boostT, Math.min(0.25, mg.t));
        if (tg && live(k) && live(tg)) {
          var dx = tg.x - k.x, dz = tg.z - k.z, fx = Math.sin(k.yaw), fz = Math.cos(k.yaw);
          var lat = dx * fz - dz * fx, dist = Math.hypot(dx, dz), pull = TD.ITEMS.magnet.pull * h;
          // kéo ngang về phía mục tiêu (trái = (fz, −fx)), tường do kart.step đẩy lại
          var m = Math.max(-pull, Math.min(pull, lat));
          k.x += fz * m; k.z -= fx * m;
          if (dist < 5) mg.t = 0;
        }
        if (mg.t <= 0) st.magnet = null;
      }
    });
  }

  // ---------- bot dùng đạo cụ ----------
  function threatened(R, k) {
    return R.items.proj.some(function (m) { return m.target === k.id && m.type === 'missile'; });
  }
  function botThink(R, k, h) {
    var st = ST(R, k), ai = st.ai, RU = TD.ITEM_RULES;
    if (k.ctrl !== 'bot' || !live(k) || R.phase !== 'race') return;
    ai.hold += h;
    if ((ai.think -= h) > 0) return;
    ai.think = 0.25;
    var skill = k.bot ? k.bot.skill : 0.6, wait = RU.botHold[1] - (RU.botHold[1] - RU.botHold[0]) * skill;
    for (var i = 0; i < st.slots.length; i++) {
      var id = st.slots[i];
      if (!id) continue;
      var it = TD.ITEMS[id], go = false, held = R.t - st.got[i];
      if (id === 'shield') go = threatened(R, k) || held > 9;
      else if (held < wait) continue;
      else if (id === 'missile' || id === 'magnet') go = !!aheadOf(R, k, id === 'magnet' ? it.range * 0.7 : it.range);
      else if (id === 'ufo') go = !!leaderOpp(R, k);
      else if (id === 'lightning' || id === 'ink') go = allAhead(R, k).length > 0;
      else if (id === 'banana' || id === 'cloud') {
        go = held > 8 || R.karts.some(function (o) { var d = k.progress - o.progress; return o !== k && live(o) && d > 3 && d < 30; });
      } else if (id === 'tornado') go = held > 6 || !!aheadOf(R, k, 110);
      else if (id === 'nitro') go = k.nitro.boostT <= 0 && k.kmh > 120 && k.st !== 'drift';
      else if (id === 'angel') go = threatened(R, k) || held > 4;
      if (go) { use(R, k, i); return; }
    }
  }

  function step(R, h) {
    if (R.phase === 'countdown') return;
    pickups(R, h);
    stepProj(R, h);
    stepHazards(R, h);
    stepKarts(R, h);
    R.karts.forEach(function (k) { botThink(R, k, h); });
  }

  TD.Items = { init: init, step: step, use: use, give: give, at: at, hit: hit };
})(typeof window !== 'undefined' ? window : globalThis);
