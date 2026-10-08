// Mô phỏng: bot. Mỗi bot nghĩ mỗi TUNING.bots.think giây, lệch pha theo id; chọn mục tiêu rồi đi theo đường của VS.nav (A* trên lưới đi được
// theo bán kính thân). Kẹt thì bỏ mục tiêu đó một lúc và nghĩ lại. Bot chỉ ghi intent, không ghi trạng thái actor.
// Bot chỉ dùng sim.canSee/sharkSees/known (cùng luật tầm nhìn với người chơi): thợ lặn chỉ đi tới kho báu đội đã soi thấy, chưa thấy thì dò đường.
(function (VS) {
  'use strict';
  var sim = VS.sim = VS.sim || {};
  var geom = VS.geom;
  var bots = VS.bots = VS.bots || {};
  var DEG = Math.PI / 180, TAU = Math.PI * 2;

  // Các ngưỡng của bot pha 1 (số trong bản thiết kế, không thuộc TUNING).
  var SHOOT_R = 8, FLEE_R = 4, REVIVE_R = 15, FLEE_O2 = 0.4, BANK_KG = 8, REFILL_O2 = 0.35, REFILL_R = 25;
  var LUNGE_R = 3.2, LUNGE_ARC = 0.3, STUCK_T = 1.5, ESCAPE_T = 1.2, GIVE_UP_T = 40, STRUGGLE_T = 0.2;
  var EXPLORE_CELL = 6, EXPLORE_TRIES = 14, EXPLORE_MIN = 8;
  var STALL_T = 3, STALL_MOVE = 1.5, STALL_SKIP_T = 20, NO_PATH_SKIP_T = 30;   // dịch ròng < 1,5 m sau 3 s khi mục tiêu cách > 3 m là kẹt

  function brainOf(m, a) {
    if (!a.brain) {
      a.brain = {
        nextT: a.id * VS.TUNING.bots.think / 6, has: false, gx: 0, gy: 0, arrive: 0.3, boost: false, key: '', fails: 0, skip: {},
        seen: {}, last: null, lootId: -1, lootUntil: 0, roamUntil: 0, exploreUntil: 0,
        mx: 0, my: 0, winT: -1, winX: 0, winY: 0, winKey: '', stuck: 0, chkT: 0, chkX: a.x, chkY: a.y, escUntil: 0, escA: 0, aimUntil: 0
      };
    }
    return a.brain;
  }

  // Các ô 6 m mà thợ lặn đã đi qua hoặc soi tới, dùng chung cho cả đội để dò đường không dồn về một chỗ. Là trí nhớ của bot, không phải luật trận.
  function memOf(m) {
    if (!m.botMem) Object.defineProperty(m, 'botMem', { value: { seen: {} }, writable: true, enumerable: false });
    return m.botMem;
  }
  function cellKey(x, y) { return Math.floor(x / EXPLORE_CELL) * 4096 + Math.floor(y / EXPLORE_CELL); }
  function markSeen(m, x, y, aimX, aimY) {
    var seen = memOf(m).seen, i, j;
    for (i = -1; i <= 1; i++) for (j = -1; j <= 1; j++) seen[cellKey(x + i * EXPLORE_CELL, y + j * EXPLORE_CELL)] = true;
    seen[cellKey(aimX, aimY)] = true;
  }

  // key nhận diện mục tiêu ('L3' món 3, 'P1' khoang 1...): kẹt hai lần liền khi đi tới một key thì bỏ key đó 40 s, tìm mục tiêu khác.
  function setGoal(b, x, y, arrive, boost, key) {
    if (key !== b.key) { b.key = key || ''; b.fails = 0; }
    b.has = true; b.gx = x; b.gy = y; b.arrive = arrive; b.boost = !!boost;
  }
  function skipped(b, m, key) { return b.skip[key] > m.t; }

  function dist(a, o) { return Math.sqrt((a.x - o.x) * (a.x - o.x) + (a.y - o.y) * (a.y - o.y)); }

  // Hướng thoáng dài nhất trong 8 hướng ngẫu nhiên (dùng khi kẹt).
  function randomOpenDir(m, a) {
    var best = 0, bt = -1;
    for (var i = 0; i < 8; i++) {
      var ang = m.rng() * TAU, t = m.world._cast(a.x, a.y, a.x + Math.cos(ang) * 6, a.y + Math.sin(ang) * 6);
      if (t > 1) t = 1.5;
      if (t > bt) { bt = t; best = ang; }
    }
    return best;
  }

  // Bỏ mục tiêu đang đi tới: key của nó bị bỏ qua skipT giây, bot nghĩ lại ở lần tới.
  function giveUp(m, a, b, skipT) {
    if (b.key) b.skip[b.key] = m.t + skipT;
    b.fails = 0; b.has = false; b.lootId = -1; b.roamUntil = 0; b.exploreUntil = 0; b.last = null; b.nextT = m.t;
    if (VS.nav) VS.nav.forget(a);
  }

  // Mỗi bước: đặt mx,my,boost theo đường nav tới mục tiêu hiện tại; phát hiện kẹt theo hai cách: thân đứng yên (0,5 s một lần)
  // và dịch chuyển ròng quá ít sau STALL_T giây khi mục tiêu còn xa (đi vòng trong khe, trượt dọc vách).
  function steer(m, a, b) {
    var it = a.intent, d;
    if (m.t < b.escUntil) { it.mx = Math.cos(b.escA); it.my = Math.sin(b.escA); it.boost = false; return; }
    if (!b.has) { it.mx = 0; it.my = 0; it.boost = false; b.stuck = 0; b.winT = -1; return; }
    d = dist(a, { x: b.gx, y: b.gy });
    if (d <= b.arrive) { it.mx = 0; it.my = 0; it.boost = false; b.stuck = 0; b.fails = 0; b.winT = -1; return; }
    if (m.tick % 4 === (a.id & 3)) {
      var v = VS.nav.steer(m, a, b.gx, b.gy);
      if (v.mx === 0 && v.my === 0) { giveUp(m, a, b, NO_PATH_SKIP_T); it.mx = 0; it.my = 0; it.boost = false; return; }
      b.mx = v.mx; b.my = v.my;
    }
    it.mx = b.mx; it.my = b.my; it.boost = b.boost;
    if (m.t >= b.chkT) {
      var moved = dist(a, { x: b.chkX, y: b.chkY });
      b.stuck = moved < 0.35 ? b.stuck + 0.5 : 0;
      b.chkT = m.t + 0.5; b.chkX = a.x; b.chkY = a.y;
      if (b.stuck >= STUCK_T) {
        b.escA = randomOpenDir(m, a); b.escUntil = m.t + ESCAPE_T; b.stuck = 0;
        VS.nav.forget(a);
        if (b.key && ++b.fails >= 2) { giveUp(m, a, b, GIVE_UP_T); b.nextT = m.t + ESCAPE_T; }
      }
    }
    if (d > 3) {
      if (b.winT < 0 || b.winKey !== b.key) { b.winT = m.t; b.winX = a.x; b.winY = a.y; b.winKey = b.key; }
      else if (m.t - b.winT >= STALL_T) {
        if (dist(a, { x: b.winX, y: b.winY }) < STALL_MOVE) giveUp(m, a, b, STALL_SKIP_T);
        b.winT = m.t; b.winX = a.x; b.winY = a.y;
      }
    } else b.winT = -1;
    if (a.team === 'diver' && m.t >= b.aimUntil) { it.aimX = a.x + it.mx * 10; it.aimY = a.y + it.my * 10; }
  }

  function nearestPod(m, a, b) {
    var best = null, bd = 1e18, i, p, d;
    for (i = 0; i < m.pods.length; i++) {
      p = m.pods[i]; d = (p.x - a.x) * (p.x - a.x) + (p.y - a.y) * (p.y - a.y);
      if (d < bd && !skipped(b, m, 'P' + i)) { bd = d; best = i; }
    }
    if (best === null) {   // khoang nào cũng đã bỏ thì thử lại khoang gần nhất
      for (i = 0; i < m.pods.length; i++) {
        p = m.pods[i]; d = (p.x - a.x) * (p.x - a.x) + (p.y - a.y) * (p.y - a.y);
        if (d < bd) { bd = d; best = i; }
      }
    }
    return best;
  }

  function goPod(m, a, b) {
    var i = nearestPod(m, a, b);
    if (i === null) { b.has = false; return; }
    setGoal(b, m.pods[i].x, m.pods[i].y, m.pods[i].r * 0.5, false, 'P' + i);
  }

  // Món kho báu đồng đội id thấp hơn đang nhắm tới (để bốn người không dồn về một món).
  function claimedByMate(m, a, lootId) {
    for (var i = 0; i < a.id; i++) {
      var o = m.actors[i];
      if (o.team === 'diver' && o.st === 'swim' && o.brain && o.brain.lootId === lootId && m.t < o.brain.lootUntil) return true;
    }
    return false;
  }

  // Dò đường khi chưa thấy món nào: chọn một ô nước thoáng trong vùng chính, chưa ai tới, cách >= 8 m, gần nhất trong vài ô bốc ngẫu nhiên.
  function pickExplore(m, a, b) {
    var g = geom.reachGrid(m.world, sim.K.navClear, sim.K.navCell), seen = memOf(m).seen, best = -1, bs = 1e18;
    for (var i = 0; i < EXPLORE_TRIES; i++) {
      var c = m.rng.int(0, g.ok.length - 1);
      if (g.comp[c] !== g.main || skipped(b, m, 'E' + c)) continue;
      var x = g.cx(c), y = g.cy(c), d2 = (x - a.x) * (x - a.x) + (y - a.y) * (y - a.y);
      if (d2 < EXPLORE_MIN * EXPLORE_MIN || y > sim.K.surfaceY - 3) continue;
      var score = d2 + (seen[cellKey(x, y)] ? 1e6 : 0);
      if (score < bs) { bs = score; best = c; }
    }
    return best >= 0 ? { c: best, x: g.cx(best), y: g.cy(best) } : null;
  }

  // ---- Thợ lặn ----
  function decideDiver(m, a, b) {
    var T = VS.TUNING, it = a.intent, i, s;
    markSeen(m, a.x, a.y, a.x + Math.cos(a.ang) * 10, a.y + Math.sin(a.ang) * 10);
    // Cá mập đang thấy được: nhớ thời điểm thấy lần đầu để bot có độ trễ phản ứng, quên khi khuất
    var near = null, nd = 1e9, watch = null, wd = 1e9;
    for (i = 0; i < m.actors.length; i++) {
      s = m.actors[i];
      if (s.team !== 'shark') continue;
      if (s.st !== 'out' && sim.canSee(m, 'diver', s)) {
        if (b.seen[s.id] == null) b.seen[s.id] = m.t;
        var d = dist(a, s);
        if (d < wd) { watch = s; wd = d; }
        if (m.t - b.seen[s.id] >= T.bots.reaction && d < nd) { near = s; nd = d; }
      } else delete b.seen[s.id];
    }
    var lowO2 = a.o2 < a.o2Max * FLEE_O2;

    // Chùm đèn quay về phía cá mập đang thấy: không thì bot quay đèn theo hướng bơi, cá mập rời chùm trước khi hết độ trễ phản ứng
    if (watch) { it.aimX = watch.x; it.aimY = watch.y; b.aimUntil = m.t + 0.35; }
    // Bắn cá mập trong tầm khi nạp xong và không bị vách chắn
    if (near && nd <= SHOOT_R && a.reload <= 0 && m.world.clear(a.x, a.y, near.x, near.y)) {
      var tof = nd / T.diver.harpoonSpeed, px = near.x + near.vx * tof, py = near.y + near.vy * tof;
      var ang = Math.atan2(py - a.y, px - a.x) + (m.rng() - 0.5) * 2 * T.bots.aimError;
      it.aimX = a.x + Math.cos(ang) * nd; it.aimY = a.y + Math.sin(ang) * nd;
      it.fire = true; b.aimUntil = m.t + 0.35;
    }
    var sk = sim.skillBot(m, a);
    if (sk && (sk === true || !it.fire)) {
      if (sk !== true) { it.aimX = sk.x; it.aimY = sk.y; b.aimUntil = m.t + 0.35; }
      it.skill = true;
    }

    // Chạy trốn: cá mập sát bên và O2 đã thấp
    if (near && nd <= FLEE_R && lowO2) {
      var fx = a.x - near.x, fy = a.y - near.y, fl = Math.sqrt(fx * fx + fy * fy) || 1;
      setGoal(b, a.x + fx / fl * 8, a.y + fy / fl * 8, 0.5, true, 'F');
      return;
    }
    // Cứu đồng đội đang gục trong 15 m, trừ khi có cá mập đang lởn vởn quanh họ
    var mate = null, md = 1e9;
    for (i = 0; i < m.actors.length; i++) {
      var o = m.actors[i];
      if (o === a || o.team !== 'diver' || o.st !== 'down' || skipped(b, m, 'M' + o.id)) continue;
      var od = dist(a, o);
      if (od > REVIVE_R || od >= md) continue;
      if (near && Math.sqrt((near.x - o.x) * (near.x - o.x) + (near.y - o.y) * (near.y - o.y)) < 6) continue;
      mate = o; md = od;
    }
    if (mate) { setGoal(b, mate.x, mate.y, T.diver.interactR * 0.5, false, 'M' + mate.id); return; }
    // Nạp O2 ở rương gần khi sắp cạn
    if (a.o2 < a.o2Max * REFILL_O2) {
      var box = -1, bd = REFILL_R;
      for (i = 0; i < m.o2.length; i++) {
        var c = m.o2[i], cd = Math.sqrt((c.x - a.x) * (c.x - a.x) + (c.y - a.y) * (c.y - a.y));
        if (c.readyAt <= m.t && cd < bd && !skipped(b, m, 'O' + i)) { box = i; bd = cd; }
      }
      if (box >= 0) { setGoal(b, m.o2[box].x, m.o2[box].y, 0.3, false, 'O' + box); return; }
    }
    // Nộp kho báu: đủ nặng, hoặc món vừa nhặt đủ để đạt chỉ tiêu, hoặc không còn món đã biết nào mang thêm được, hoặc sắp hết giờ
    var known = sim.known(m, 'diver'), carried = 0, fits = false, restLeft = false;
    for (i = 0; i < a.carry.length; i++) carried += m.loot[a.carry[i]].value;
    for (i = 0; i < known.length; i++) {
      if (known[i].st !== 'rest') continue;
      restLeft = true;
      if (a.carryKg + known[i].kg <= T.diver.maxKg) fits = true;
    }
    var hurry = m.t > T.match.length - 45;
    if (a.carry.length && (a.carryKg >= BANK_KG || m.score.banked + carried >= m.score.target || !fits || !restLeft || hurry)) { goPod(m, a, b); return; }
    // Nhặt món đã biết gần nhất mang nổi, chưa ai nhận và chưa bỏ cuộc; giữ mục tiêu cũ tới khi nó bị lấy mất hoặc quá 15 s để không nhảy qua nhảy lại
    var tgt = b.lootId >= 0 && m.t < b.lootUntil ? m.loot[b.lootId] : null;
    if (tgt && (tgt.st !== 'rest' || a.carryKg + tgt.kg > T.diver.maxKg || skipped(b, m, 'L' + tgt.id))) tgt = null;
    if (!tgt) {
      var td = 1e18;
      for (i = 0; i < known.length; i++) {
        var lt = known[i];
        if (lt.st !== 'rest' || a.carryKg + lt.kg > T.diver.maxKg || skipped(b, m, 'L' + lt.id) || claimedByMate(m, a, lt.id)) continue;
        var ld = (lt.x - a.x) * (lt.x - a.x) + (lt.y - a.y) * (lt.y - a.y);
        if (ld < td) { td = ld; tgt = lt; }
      }
      b.lootId = tgt ? tgt.id : -1; b.lootUntil = m.t + 15;
    }
    if (tgt) { setGoal(b, tgt.x, tgt.y, 0.2, false, 'L' + tgt.id); return; }
    // Chưa biết món nào: dò đường tới chỗ chưa ai soi. Đang mang đồ mà không còn gì để dò thì về nộp.
    if (b.has && b.key.charAt(0) === 'E' && m.t < b.exploreUntil && Math.sqrt((b.gx - a.x) * (b.gx - a.x) + (b.gy - a.y) * (b.gy - a.y)) > 4) return;
    var ex = pickExplore(m, a, b);
    if (ex) { setGoal(b, ex.x, ex.y, 3, false, 'E' + ex.c); b.exploreUntil = m.t + 25; return; }
    if (a.carry.length) goPod(m, a, b); else b.has = false;
  }

  // ---- Cá mập ----
  // Cá mập không vào được vùng an toàn quanh khoang cứu hộ, nên thợ lặn đứng trong đó (cộng 1,5 m để đuổi tới mép vẫn còn cắn được) không phải mục tiêu.
  function inPodSafe(m, d) {
    var R = VS.TUNING.pod.safeR + 1.5;
    for (var i = 0; i < m.pods.length; i++) if (dist(d, m.pods[i]) < R) return true;
    return false;
  }

  function decideShark(m, a, b) {
    var T = VS.TUNING, S = T.shark, it = a.intent, i, tgt = null, best = 1e9;
    for (i = 0; i < m.actors.length; i++) {
      var d = m.actors[i];
      if (d.team !== 'diver' || d.st === 'out' || d.st === 'held' || skipped(b, m, 'D' + d.id) || inPodSafe(m, d) || !sim.sharkSees(m, a, d)) continue;
      // Ưu tiên kẻ gục (một cú cắn là loại) và kẻ sắp cạn O2
      var sc = dist(a, d) - (d.st === 'down' ? 5 : 0) - (d.o2 < d.o2Max * 0.3 ? 3 : 0);
      if (sc < best) { best = sc; tgt = d; }
    }
    var sk = sim.skillBot(m, a);
    if (sk) { if (sk !== true) { it.aimX = sk.x; it.aimY = sk.y; } it.skill = true; }
    if (tgt) {
      var dd = dist(a, tgt), lead = Math.min(dd / (a.def.speed * 1.5), 0.6);
      var gx = tgt.x + tgt.vx * lead, gy = tgt.y + tgt.vy * lead;
      b.last = { x: tgt.x, y: tgt.y, t: m.t, key: 'D' + tgt.id };
      setGoal(b, gx, gy, 0.2, dd > 6 && a.stamina > S.staminaMax * 0.4, 'D' + tgt.id);
      if (!sk || sk === true) { it.aimX = tgt.x; it.aimY = tgt.y; }
      var facing = Math.abs(geom.angDiff(Math.atan2(gy - a.y, gx - a.x), a.ang));
      if (dd <= LUNGE_R && facing < LUNGE_ARC && a.st === 'swim' && a.biteCd <= 0 && m.world.clear(a.x, a.y, tgt.x, tgt.y)) it.fire = true;
      return;
    }
    if (b.last && m.t - b.last.t < 3 && !skipped(b, m, b.last.key)) { setGoal(b, b.last.x, b.last.y, 1.5, false, b.last.key); return; }
    // Đi tuần: tới một điểm kho báu ngẫu nhiên, tới nơi, kẹt hoặc quá 12 s thì chọn điểm khác
    if (!b.has || m.t >= b.roamUntil || Math.sqrt((b.gx - a.x) * (b.gx - a.x) + (b.gy - a.y) * (b.gy - a.y)) < 3) {
      var spot = null;
      for (i = 0; i < 4 && m.loot.length; i++) {
        var cand = m.loot[m.rng.int(0, m.loot.length - 1)];
        if (!skipped(b, m, 'R' + cand.id)) { spot = cand; break; }
      }
      if (spot) { setGoal(b, spot.x, spot.y, 3, false, 'R' + spot.id); b.roamUntil = m.t + 12; } else b.has = false;
    }
  }

  // Một bước cho bot a: nghĩ khi tới hạn, rồi lái. Ghi a.intent; sim.step xoá các phím một bước sau khi dùng.
  bots.think = function (m, a, dt) {
    var it = a.intent;
    if (m.phase !== 'play') return;
    // Bị ngậm thì giãy: đổi chiều mx đều đặn để rút ngắn thời gian ngậm
    if (a.st === 'held') { it.mx = Math.floor(m.t / STRUGGLE_T) % 2 ? 1 : -1; it.my = 0; it.boost = false; return; }
    if (a.st === 'out' || a.st === 'down' || a.st === 'stun') { it.mx = 0; it.my = 0; it.boost = false; return; }
    var b = brainOf(m, a);
    if (m.t >= b.nextT) {
      b.nextT = m.t + VS.TUNING.bots.think;
      if (a.team === 'diver') decideDiver(m, a, b); else decideShark(m, a, b);
    }
    steer(m, a, b);
  };
})(window.VS = window.VS || {});
