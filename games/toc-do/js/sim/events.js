// Khu Giải Trí: bốn chế độ sự kiện chơi một mình với bot, luật thuần JS (không DOM/THREE) để chạy được trong Node.
//   elim   Đua Loại        mỗi 20 s loại xe đứng cuối, người cuối cùng thắng
//   coins  Săn Xu          nhặt xu dọc đường trong 90 s, va chạm làm rơi xu
//   cops   Cảnh Sát Bắt Cướp  mình và 1 bot là cảnh sát đuổi 4 cướp (bot), chạm là bắt, hết giờ cướp thắng
//   limit  Đua Giới Hạn    mỗi xe có đồng hồ riêng, qua cổng thì cộng giờ, hết giờ bị loại
// Cách móc vào trận: TD.Events.install() đăng ký post vào TD.Race.after (chạy sau mỗi TD.Race.step, một lần):
//   trước bước: cảnh sát tự lái; sau bước: luật chế độ (loại xe, nhặt xu, bắt cướp, đồng hồ), rồi gán lại hạng k.place/R.order
//   theo luật chế độ (race.js xếp hạng theo thứ tự về đích nên xe bị loại sẽ đứng trên người còn đua).
// Trạng thái của chế độ nằm ở R.ev; xe bị loại có k.out = true.
// Sự kiện mới trong R.events: out {kart, why}, coin {kart, n, v}, coin_drop {kart, n}, caught {kart, by}.
(function (G) {
  var TD = G.TD = G.TD || {};
  var E = TD.Events = TD.Events || {};

  // ---------- bảng chế độ ----------
  // Tên và luật theo chuỗi Localization_VN_Base gốc khi có (hash trong ngoặc); không thì tên chọn: ghi rõ ở trường src.
  E.LIST = ['elim', 'coins', 'cops', 'limit'];
  E.DEFS = {
    elim: { name: 'Đua Loại', src: 'đua loại trực tiếp (6 chuỗi 120fe1c2, 037f28b1)', karts: 6, laps: 99,
      rule: 'Sau 20 giây bắt đầu loại, cứ 20 giây loại xe hạng cuối (xếp theo quãng đường đã đua). Xe cuối cùng thắng.' },
    coins: { name: 'Săn Xu', src: 'Tranh Vàng 133c7136, 04acfc4a, 0deb2b58', karts: 6, laps: 99,
      rule: 'Nhặt xu dọc đường trong 90 giây, Xu Lớn tính nhiều điểm hơn. Va chạm mạnh làm rơi xu của xe chậm hơn. Nhiều xu nhất thắng.' },
    cops: { name: 'Cảnh Sát Bắt Cướp', src: 'tên chọn (đặc tả ui/gamemode/#cvrgame, không có chuỗi VN)', karts: 6, laps: 99,
      rule: 'Bạn và một bot là cảnh sát đuổi 4 tên cướp. Chạm vào xe cướp là bắt được. Bắt hết trước 100 giây thì cảnh sát thắng, không thì cướp thắng.' },
    limit: { name: 'Đua Giới Hạn', src: 'ui/race/#limitrally; tên chọn', karts: 6, laps: null,
      rule: 'Mỗi xe có đồng hồ riêng, mỗi cổng đi qua được cộng thêm giờ. Hết giờ là bị loại, về đích trước hoặc đi xa nhất thì thắng.' },
  };
  E.DAY = 'elim';   // chế độ trong ngày mặc định khi chưa tính ngày

  // ---------- số liệu ----------
  var K = E.TUNE = {
    elimStart: 20, elimEvery: 20,   // src: chuỗi 120fe1c2 "sau 20 giây vào giai đoạn loại, cứ 20 giây loại hạng cuối"
    coinTime: 90,                   // chọn: ~1,5 phút, đủ chạy gần hai vòng mà không dài như trận đua thường
    coinGap: 45,                    // chọn: m giữa hai hàng xu dọc đường (xe ~55 m/s đi qua một hàng mỗi ~0,8 s)
    coinRadius: 2.8,                // chọn: nửa thân xe (~1,2 m) + bán kính xu
    coinSmall: 1, coinBig: 3,       // src: 0deb2b58 "Vàng Lớn tăng điểm nhiều hơn"; chọn: tỉ lệ 1 : 3
    coinRespawn: 30,                // chọn: xu mỗi xe đã nhặt mọc lại (cho riêng xe đó) sau 30 s
    dropLife: 10, dropSkip: 1.5,    // chọn: xu rơi tồn tại 10 s; chủ cũ không nhặt lại trong 1,5 s
    bumpMin: 0.15,                  // chọn: lực va chạm (bump.power) tối thiểu để làm rơi xu
    copTime: 100,                   // chọn: ~1,7 phút
    catchPad: 0.6,                  // chọn: hai thân xe chạm nhau là hai bán kính; thêm 0,6 m cho lúc chạm rồi bị đẩy ra
    copSkill: 0.85, copGrace: 10,   // chọn: bot cảnh sát; 10 s đầu chưa bắt được (cả đoàn còn dính nhau ở vạch xuất phát)
    robSkill: [0.9, 0.94, 0.98, 1],   // chọn: cướp lái giỏi hơn cảnh sát bot, phải bám sát và húc trúng mới bắt được
    limitStart: 20, limitKmh: 160, limitGates: 6,   // chọn: đồng hồ đầu 20 s; mỗi cổng (L/6) cộng đúng thời gian đi quãng đó ở 160 km/h (người chơi vừa tay; bot ~200 dư giờ)
  };

  // ---------- tiện ích ----------
  function byId(R, id) { for (var i = 0; i < R.karts.length; i++) if (R.karts[i].id === id) return R.karts[i]; return null; }
  function alive(R) { return R.karts.filter(function (k) { return !k.done; }); }
  function runT(R) { return R.goT == null ? 0 : R.t - R.goT; }
  function byProgress(a, b) { return b.progress - a.progress; }
  function pushEv(R, type, k, extra) {
    var e = { t: R.t, type: type, kart: k ? k.id : null };
    for (var q in extra) e[q] = extra[q];
    R.events.push(e);
  }

  // Cho xe về đích ngay mà không bật đếm lùi kết thúc của race.js (finish() tự đặt finishDeadline ở lần gọi đầu).
  function finishKeep(R, k, timeout) {
    var dl = R.finishDeadline, ph = R.phase;
    TD.Race.finish(R, k, timeout);
    R.finishDeadline = dl; R.phase = ph;
  }

  // Loại một xe: về đích kiểu hết giờ, ẩn khỏi va chạm (xe người chơi vẫn thấy để quay cảnh về đích).
  function out(R, k, why) {
    var S = R.ev;
    k.out = true; S.outs.push(k.id); S.outT[k.id] = runT(R);
    finishKeep(R, k, true);
    k.dnf = true;
    pushEv(R, 'out', k, { why: why });
  }

  // Người chơi: xe có ctrl 'human' lúc dựng luật, không thì xe cuối hàng (ô xuất phát của người chơi trong main.js).
  function humanOf(R) {
    for (var i = 0; i < R.karts.length; i++) if (R.karts[i].ctrl === 'human') return R.karts[i];
    return R.karts[R.karts.length - 1];
  }

  // ---------- luật từng chế độ: setup(R, S), step(R, S, t), order(R, S) ----------
  var RULES = {};

  // --- Đua Loại ---
  // Người chơi xuất phát hàng cuối (main.js) nên hay bị loại đầu tiên chỉ vì kẹt sau đoàn: đổi ô với xe thứ ba (giữa đoàn).
  // Chỉ đổi toạ độ ô xuất phát (mọi xe đang ở 'grid' lúc đếm ngược), đối tượng xe giữ nguyên nên main.js vẫn trỏ đúng.
  function swapGrid(a, b) {
    ['x', 'px', 'z', 'pz', 'y', 'yaw', 'vyaw', 'loc'].forEach(function (f) { var t = a[f]; a[f] = b[f]; b[f] = t; });
  }
  RULES.elim = {
    setup: function (R, S) {
      S.next = K.elimStart; S.wins = [];
      if (R.karts[2] && R.karts[2] !== S.me && R.phase === 'countdown') swapGrid(S.me, R.karts[2]);
    },
    step: function (R, S, t) {
      var left = alive(R);
      while (left.length > 1 && t >= S.next) {
        var v = left.sort(byProgress)[left.length - 1];
        out(R, v, 'last');
        left = alive(R);
        S.next += K.elimEvery;
      }
      if (left.length === 1 && R.karts.length > 1 && !left[0].done) { S.wins.push(left[0].id); finishKeep(R, left[0], false); }
      // Người chơi bị loại: những xe còn lại được xếp theo quãng đường rồi kết thúc trận ngay, không bắt xem tiếp.
      if (S.me.out) alive(R).sort(byProgress).forEach(function (k) { finishKeep(R, k, true); });
    },
    order: function (R, S) {
      var wins = S.wins.map(function (id) { return byId(R, id); });
      var live = alive(R).sort(byProgress);
      var outs = S.outs.slice().reverse().map(function (id) { return byId(R, id); });
      var rest = R.karts.filter(function (k) { return wins.indexOf(k) < 0 && live.indexOf(k) < 0 && outs.indexOf(k) < 0; });
      return wins.concat(live, rest.sort(byProgress), outs);
    },
    hud: function (R, S, t) {
      var left = alive(R).length;
      return { left: left, next: Math.max(0, S.next - t), warm: t < K.elimStart };
    },
  };

  // --- Săn Xu ---
  // Xu đặt dọc nhánh chính của đường (next[0]), cứ coinGap m một hàng 3 xu ngang đường (xe nào cũng với được ít nhất một);
  // hàng thứ 5 có Xu Lớn ở giữa. Hàng lệch pha theo số thứ tự để không thẳng tắp.
  function buildCoins(T) {
    var list = [], seen = {}, acc = 0, g = 0, c0 = T.cps[T.startCp], i = 0, best = 1e18;
    for (var q = 0; q < T.n; q++) {   // bắt đầu từ điểm ruy băng gần vạch xuất phát nhất để hàng xu đầu nằm ngay phía trước đoàn xe
      var d = Math.pow(T.x[q] - c0.x, 2) + Math.pow(T.z[q] - c0.z, 2);
      if (d < best) { best = d; i = q; }
    }
    while (i != null && !seen[i]) {
      seen[i] = 1;
      var j = T.next[i][0];
      if (j == null) break;
      acc += Math.hypot(T.x[j] - T.x[i], T.z[j] - T.z[i]);
      if (acc >= K.coinGap) {
        acc -= K.coinGap; g++;
        var half = Math.min(T.lw[i], T.rw[i]) * 0.8, lx = T.fz[i], lz = -T.fx[i], shift = ((g * 7) % 5 - 2) * 0.08;
        [-0.6, 0, 0.6].forEach(function (u) {
          var lat = (u + shift) * half, big = g % 5 === 0 && u === 0;
          list.push({ x: T.x[i] + lx * lat, z: T.z[i] + lz * lat, y: T.y[i] + 0.9, v: big ? K.coinBig : K.coinSmall, big: big });
        });
      }
      i = j;
    }
    return list;
  }
  function segDist2(ax, az, bx, bz, px, pz) {
    var dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    var u = l2 > 1e-9 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
    var cx = ax + dx * u - px, cz = az + dz * u - pz;
    return cx * cx + cz * cz;
  }
  function dropCoins(R, S, victim, n) {
    S.coins[victim.id] -= n; S.lost[victim.id] += n;
    var fx = Math.sin(victim.yaw), fz = Math.cos(victim.yaw);
    for (var q = 0; q < n; q++) {
      var back = 5 + q * 3.5, side = (q % 2 ? 1 : -1) * (1.2 + q * 0.8);
      S.pile.push({ x: victim.x - fx * back + fz * side, z: victim.z - fz * back - fx * side, y: victim.y + 0.9, v: 1, big: false, on: true,
        drop: true, exp: R.t + K.dropLife, skip: victim.id, skipT: R.t + K.dropSkip });
    }
    pushEv(R, 'coin_drop', victim, { n: n });
  }
  RULES.coins = {
    setup: function (R, S) {
      // Xu trên đường là xu riêng của từng xe (S.until[id][i] = lúc xu i hiện lại với xe đó): xe dẫn đầu không vét hết xu của người sau.
      S.list = buildCoins(R.T); S.pile = []; S.coins = {}; S.lost = {}; S.pos = {}; S.until = {};
      R.karts.forEach(function (k) { S.coins[k.id] = 0; S.lost[k.id] = 0; S.until[k.id] = new Float64Array(S.list.length); });
    },
    step: function (R, S, t) {
      // Xu rơi do va chạm: xe chậm hơn trong cặp va chạm bị rơi 1–3 xu theo lực.
      R.events.slice().forEach(function (e) {
        if (e.type !== 'bump' || e._d || e.kart > e.other || !(e.power >= K.bumpMin)) return;
        e._d = true;   // R.events chỉ được xoá mỗi khung: đừng tính một va chạm hai lần
        var a = byId(R, e.kart), b = byId(R, e.other);
        if (!a || !b || a.done || b.done) return;
        var v = a.kmh <= b.kmh ? a : b, n = Math.min(S.coins[v.id], e.power > 0.6 ? 3 : e.power > 0.3 ? 2 : 1);
        if (n > 0) dropCoins(R, S, v, n);
      });
      var r2 = K.coinRadius * K.coinRadius;
      R.karts.forEach(function (k) {
        if (k.done) return;
        var p = S.pos[k.id] || { x: k.x, z: k.z }, mine = S.until[k.id];
        var take = function (c, v) { S.coins[k.id] += v; pushEv(R, 'coin', k, { n: S.coins[k.id], v: v }); };
        for (var i = 0; i < S.list.length; i++) {
          var c = S.list[i];
          if (mine[i] > R.t || Math.abs(c.y - k.y - 0.9) > 3 || segDist2(p.x, p.z, k.x, k.z, c.x, c.z) > r2) continue;
          mine[i] = R.t + K.coinRespawn;
          take(c, c.v);
        }
        for (i = 0; i < S.pile.length; i++) {
          c = S.pile[i];
          if (!c.on || (c.skip === k.id && R.t < c.skipT) || Math.abs(c.y - k.y - 0.9) > 3 || segDist2(p.x, p.z, k.x, k.z, c.x, c.z) > r2) continue;
          c.on = false;
          take(c, c.v);
        }
        S.pos[k.id] = { x: k.x, z: k.z };
      });
      S.pile = S.pile.filter(function (c) { return c.on && R.t < c.exp; });
      if (t >= K.coinTime) {
        RULES.coins.order(R, S).forEach(function (k) { if (!k.done) finishKeep(R, k, false); });
      }
    },
    order: function (R, S) {
      return R.karts.slice().sort(function (a, b) { return (S.coins[b.id] - S.coins[a.id]) || (b.progress - a.progress); });
    },
    hud: function (R, S, t) { return { mine: S.coins[S.me.id], left: Math.max(0, K.coinTime - t), best: Math.max.apply(null, R.karts.map(function (k) { return S.coins[k.id]; })) }; },
  };

  // --- Cảnh Sát Bắt Cướp ---
  RULES.cops = {
    setup: function (R, S) {
      var n = R.karts.length, nc = Math.min(2, Math.max(1, n - 1));
      S.role = {}; S.catches = {}; S.caughtT = {}; S.copIds = [];
      R.karts.forEach(function (k, i) {
        var cop = i >= n - nc;
        S.role[k.id] = cop ? 'cop' : 'rob'; S.catches[k.id] = 0;
        if (cop) S.copIds.push(k.id);
        if (k.ctrl === 'bot' && k.bot) TD.Bot.init(k, R, cop ? K.copSkill : K.robSkill[i % K.robSkill.length]);
      });
      S.robbers = R.karts.filter(function (k) { return S.role[k.id] === 'rob'; }).length;
    },
    step: function (R, S, t) {
      var r2 = Math.pow(TD.TUNING.radius * 2 + K.catchPad, 2);
      S.copIds.forEach(function (cid) {
        var c = byId(R, cid);
        if (t < K.copGrace) return;
        if (c.done || c.st === 'respawn' || c.st === 'grid') return;
        R.karts.forEach(function (r) {
          if (r.done || S.role[r.id] !== 'rob' || r.st === 'grid' || Math.abs(r.y - c.y) > 2) return;
          var dx = r.x - c.x, dz = r.z - c.z;
          if (dx * dx + dz * dz > r2) return;
          S.caughtT[r.id] = t; S.catches[c.id]++;
          out(R, r, 'caught');
          pushEv(R, 'caught', r, { by: c.id });
        });
      });
      var free = R.karts.filter(function (k) { return S.role[k.id] === 'rob' && !k.done; }).length;
      if (!free || t >= K.copTime) {
        S.copsWin = !free;
        RULES.cops.order(R, S).forEach(function (k) { if (!k.done) finishKeep(R, k, false); });
      }
    },
    // Cảnh sát thắng (bắt hết): cảnh sát theo số vụ bắt, rồi cướp theo thời gian sống sót. Cướp thắng: cướp chưa bị bắt (theo
    // quãng đường), cảnh sát theo số vụ, cướp bị bắt sau cùng bắt đầu từ người sống lâu nhất.
    order: function (R, S) {
      var cops = R.karts.filter(function (k) { return S.role[k.id] === 'cop'; }).sort(function (a, b) { return (S.catches[b.id] - S.catches[a.id]) || (b.progress - a.progress); });
      var rob = R.karts.filter(function (k) { return S.role[k.id] === 'rob'; });
      var free = rob.filter(function (k) { return S.caughtT[k.id] == null; }).sort(byProgress);
      var caught = rob.filter(function (k) { return S.caughtT[k.id] != null; }).sort(function (a, b) { return S.caughtT[b.id] - S.caughtT[a.id]; });
      return S.copsWin || (!free.length) ? cops.concat(caught) : free.concat(cops, caught);
    },
    hud: function (R, S, t) {
      var cop = S.role[S.me.id] === 'cop';
      return { cop: cop, caught: S.robbers - R.karts.filter(function (k) { return S.role[k.id] === 'rob' && S.caughtT[k.id] == null; }).length, total: S.robbers,
        mine: S.catches[S.me.id], left: Math.max(0, K.copTime - t) };
    },
  };

  // --- Đua Giới Hạn ---
  RULES.limit = {
    setup: function (R, S) {
      S.clock = {}; S.gate = {}; S.last = 0; S.spacing = R.T.L / K.limitGates;
      S.bonus = S.spacing / (K.limitKmh / 3.6);
      R.karts.forEach(function (k) { S.clock[k.id] = K.limitStart; S.gate[k.id] = 0; });
    },
    step: function (R, S, t) {
      var dt = Math.max(0, t - S.last); S.last = t;
      R.karts.forEach(function (k) {
        if (k.done) return;
        S.clock[k.id] -= dt;
        var g = Math.floor(Math.max(0, k.progress) / S.spacing);
        if (g > S.gate[k.id]) {
          S.clock[k.id] += S.bonus * (g - S.gate[k.id]); S.gate[k.id] = g;
          pushEv(R, 'gate', k, { gate: g, clock: S.clock[k.id] });
        }
        if (S.clock[k.id] <= 0) { S.clock[k.id] = 0; out(R, k, 'time'); }
      });
    },
    order: function (R, S) {
      var fin = R.karts.filter(function (k) { return k.done && !k.out; }).sort(function (a, b) { return a._finOrder - b._finOrder; });
      var rest = R.karts.filter(function (k) { return fin.indexOf(k) < 0; }).sort(byProgress);
      return fin.concat(rest);
    },
    hud: function (R, S) { return { clock: S.clock[S.me.id], gate: S.gate[S.me.id], gates: K.limitGates, bonus: S.bonus }; },
  };

  // ---------- vòng đời ----------
  function setup(R) {
    var kind = R.mode.event, S = R.ev = { kind: kind, outs: [], outT: {}, me: humanOf(R), over: false };
    RULES[kind].setup(R, S);
    return S;
  }

  // Gán lại hạng theo luật chế độ và vá sự kiện finish của bước này cho khớp.
  function reorder(R, S) {
    var list = RULES[S.kind].order(R, S);
    list.forEach(function (k, i) { k.place = i + 1; if (k.done) k._finOrder = i + 1; });
    R.order = list.map(function (k) { return k.id; });
    R.events.forEach(function (e) {
      if (e.type === 'finish' && e.kart != null) { var k = byId(R, e.kart); if (k) e.place = k.place; }
      if (e.type === 'out' && e.kart != null) { var o = byId(R, e.kart); if (o) e.place = o.place; }
    });
  }

  function post(R) {
    var kind = R.mode.event;
    if (!kind || !RULES[kind]) return;
    var S = R.ev || setup(R);
    if (R.phase === 'countdown') return;
    // race.js phát 'overtake' theo hạng đua của nó; hạng ở các chế độ này do luật chế độ quyết định nên bỏ.
    for (var i = R.events.length - 1; i >= 0; i--) if (R.events[i].type === 'overtake') R.events.splice(i, 1);
    if (!S.over) {
      RULES[kind].step(R, S, runT(R));
      R.karts.forEach(function (k) { if (k.out && k !== S.me) k.ghostT = Math.max(k.ghostT, 1); });   // xe bị loại không va chạm nữa
      if (R.karts.every(function (k) { return k.done; })) { S.over = true; R.phase = 'done'; }
    }
    // Thẻ thưởng tính tốc độ TB = L·R.laps / giờ về đích; laps 99 chỉ là cách tắt về đích theo vòng, nên khi người chơi xong
    // thì đổi laps thành số vòng thật đã đi (progress / L) để tốc độ TB đúng.
    if (R.mode.laps === 99 && S.me.done && !S.lapsFixed) { S.lapsFixed = true; R.laps = Math.max(1, S.me.progress / R.T.L); }
    reorder(R, S);
    if (S.over) R.phase = 'done';
  }

  // Cảnh sát và cướp bot tự lái bằng Bot.think nên chỉ cần móc sau bước.
  E.install = function () {
    if (!TD.Race || TD.Race.after.indexOf(post) >= 0) return;
    TD.Race.after.push(post);
  };
  if (TD.Race) E.install();
  // Dựng luật sớm (trước đếm ngược) cho chế độ sự kiện; main.js gọi qua plugin start. Gọi lại không sao.
  E.prepare = function (R) { return R.mode.event && RULES[R.mode.event] ? (R.ev || setup(R)) : null; };

  // ---------- điểm kỷ lục, ngày, lưu ----------
  // Điểm của người chơi trong trận để so "kỷ lục" (cao hơn là tốt hơn) và đơn vị hiển thị.
  E.score = function (R, k) {
    var S = R.ev; if (!S) return 0;
    if (S.kind === 'elim') return Math.round(k.out ? S.outT[k.id] || 0 : runT(R));
    if (S.kind === 'coins') return S.coins[k.id] | 0;
    if (S.kind === 'cops') return S.catches[k.id] | 0;
    return Math.round(k.progress);
  };
  E.HUDS = function (R, S, t) { return RULES[S.kind].hud(R, S, t); };   // số liệu cho bảng HUD của chế độ
  E.UNIT = { elim: ' giây', coins: ' xu', cops: ' vụ bắt', limit: ' m' };

  // Chế độ của ngày: xoay vòng theo số ngày (giờ địa phương) kể từ 1970.
  E.dayKey = function (d) { d = d || new Date(); return d.getFullYear() + '-' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1) + '-' + (d.getDate() < 10 ? '0' : '') + d.getDate(); };
  E.today = function (d) {
    d = d || new Date();
    var n = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
    return E.LIST[n % E.LIST.length];
  };

  // Bản lưu: TD.save.d.events = { best: { <id chế độ>: điểm }, day: 'YYYY-MM-DD' (ngày đã nhận thưởng ngày) }.
  E.norm = function (o) {
    var src = o.events && typeof o.events === 'object' ? o.events : {}, best = {};
    if (src.best && typeof src.best === 'object') E.LIST.forEach(function (id) { var v = Number(src.best[id]); if (isFinite(v) && v > 0) best[id] = Math.min(99999, Math.floor(v)); });
    o.events = { best: best, day: typeof src.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(src.day) ? src.day : '' };
  };

  // ---------- đăng ký vào TD.MODES ----------
  TD.MODES = TD.MODES || {};
  E.LIST.forEach(function (id) {
    var d = E.DEFS[id];
    TD.MODES[id] = { id: id, name: d.name, karts: d.karts, teams: 0, items: false, laps: d.laps, event: id, hub: true };
  });
})(typeof window !== 'undefined' ? window : globalThis);
