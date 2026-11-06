// Gara, Cửa Hàng, Kỹ Năng bằng lái, Nhiệm Vụ (ngày/tuần/chính tuyến + rương sinh lực), Thành Tựu, Phúc Lợi (đăng nhập 7 ngày,
// thắng trận đầu, rương thắng, thưởng lên cấp, thẻ mùa), cộng plugin trận đếm tiến độ nhiệm vụ/thành tựu.
// Sảnh gọi TD.garage.open(tab), tab ∈ cars|shop|skills|quests|ach|welfare; mọi màn quay về bằng TD.lobby.show().
// Số liệu: // src: = có trong clip/APK gốc (clips-lobby-practice.md mục C, strings.md); // chọn: = ta chọn.
(function (TD) {
  'use strict';
  const G = {};
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const click = () => TD.audio && TD.audio.play('Play_UI_Click');
  const save = () => TD.save.d;
  const fmt = (n) => Math.round(n).toLocaleString('vi-VN');

  // ---------- xe: hạng, giá, sở hữu ----------
  // chọn: bản gốc không có số "hạng" trong APK mà ta bóc được; hạng suy từ tổng 5 chỉ số xe (04 = 10 … 55 = 49).
  const CLASSES = [['S', 45], ['A', 35], ['B', 22], ['C', 0]];
  const STARTER = ['04', '06', '16'];   // chọn: bộ xe khởi đầu (bản lưu owned = null)
  const sum = (c) => ['speed', 'accel', 'handling', 'drift', 'nitro'].reduce((a, k) => a + ((c.stats && c.stats[k]) || 0), 0);
  G.classOf = (id) => { const s = sum(TD.CARS[id]); return CLASSES.find((c) => s >= c[1])[0]; };
  // chọn: giá tăng theo bình phương tổng chỉ số (C ~ 1.7k, B ~ 3.5-5k, A ~ 8-11k, S ~ 14k xu), làm tròn 50.
  G.priceOf = (id) => Math.round(Math.pow(sum(TD.CARS[id]), 2) * 6 / 50) * 50;
  G.ownedIds = () => { const o = save().owned; return Object.keys(TD.CARS).filter((id) => (o ? o.indexOf(id) >= 0 : STARTER.indexOf(id) >= 0)); };
  G.owns = (id) => G.ownedIds().indexOf(id) >= 0;
  G.buy = function (id) {
    const d = save(), c = TD.CARS[id];
    if (!c) return { ok: false, why: 'không có xe này' };
    if (G.owns(id)) return { ok: false, why: 'đã sở hữu xe này' };
    const price = G.priceOf(id);
    if (d.coins < price) return { ok: false, why: 'không đủ xu: cần ' + fmt(price) + ', còn ' + fmt(d.coins) };
    d.coins -= price;
    d.owned = G.ownedIds().concat(id);
    TD.save.save();
    return { ok: true, price };
  };

  // ---------- thông số thật của xe (đọc từ TD.TUNING + carParams, có tính kỹ năng) ----------
  G.stats = function (id, sv) {
    const U = TD.TUNING, p = TD.Kart.carParams(id), f = G.effects(sv || save(), id);
    const top = p.top * 3.6 + f.top, nitroCap = top * U.nitroMul * p.nitro * (1 + f.nitro);
    const drift = p.drift * (1 + f.drift);
    return {
      top,                                                   // Tốc độ đường trường (km/h)
      nitroTop: nitroCap,                                    // Tốc độ nitro cao nhất (km/h)
      accel: p.accel * (1 + f.accel),                        // Tăng tốc (m/s²)
      turn: p.handling * 100,                                // Bám lái (% so với xe chuẩn 100)
      mini: U.miniKmh * (1 + f.mini), miniPerfect: U.miniPerfectKmh * (1 + f.mini),   // Mini Boost (+km/h, hoàn hảo)
      miniTime: U.miniTime, nitroTime: U.nitroTime,
      // giây drift hoàn hảo (VD = miniMinVD) ở tốc độ tối đa để đầy một bình: 1 / (gaugeRate · drift · v · sin VD)
      fill: 1 / (U.gaugeRate * drift * (top / 3.6) * Math.sin(U.miniMinVD * Math.PI / 180)),
    };
  };
  // chọn: 6 trục radar suy từ chỉ số 0..10 của xe (gốc: Chống đụng/Tăng tốc/Tích Nitro/Drift/Boost/Đổi hướng ≈ 58-69, X-class)
  const RADAR = [['Chống đụng', (s) => (s.speed + s.handling) / 2], ['Tăng tốc', (s) => s.accel], ['Tích Nitro', (s) => s.drift],
    ['Đổi hướng', (s) => s.handling], ['Boost', (s) => s.nitro], ['Drift', (s) => (s.drift + s.handling) / 2]];
  G.radar = (id) => RADAR.map((r) => ({ name: r[0], v: Math.round(40 + 6 * r[1](TD.CARS[id].stats)) }));   // 40..100

  // ---------- kỹ năng bằng lái ----------
  // src: clip hhbJeuMU1ms t=13/205: ba hàng Bằng Lái-Sơ/Trung/Cao, lục giác cấp x/5, "Tăng cấp" tốn vàng; Chạy Nhanh cấp 1 (hàng Cao)
  //      "Xe B +0.2, Xe A +0.4, Xe S +0.4" km/h. Icon từ id_talent/talent_icon<N> (tools/export_garage_ui.py).
  // chọn: tác dụng các nút còn lại (trần nhỏ để trận công bằng): top = +km/h theo hạng xe [B/C, A/S], còn lại là % nhân.
  //   Mini Boost → sức mạnh phun nhỏ (k.p.mini), Chuyên Gia Nitro/Bơm Hơi → trần nitro, Tăng Thưởng → xu thưởng.
  const MAXLV = 5;
  const SKILL_TIERS = [
    { id: 'so', name: 'Bằng Lái-Sơ', lv: 1, cost: 100, nodes: [   // chọn: giá cấp kế = cost × (cấp hiện tại + 1)
      { id: 'so.run', name: 'Chạy Nhanh', icon: 'talent1', fx: 'top', per: [0.1, 0.2] },
      { id: 'so.mini', name: 'Mini Boost', icon: 'talent2', fx: 'mini', per: 0.008 },
      { id: 'so.coin', name: 'Tăng Thưởng', icon: 'talent3', fx: 'coin', per: 0.01 }] },
    { id: 'trung', name: 'Bằng Lái-Trung', lv: 1, cost: 200, nodes: [
      { id: 'trung.run', name: 'Chạy Nhanh', icon: 'talent4', fx: 'top', per: [0.15, 0.3] },
      { id: 'trung.gas', name: 'Tăng Ga', icon: 'talent5', fx: 'accel', per: 0.004 },
      { id: 'trung.n2o', name: 'Chuyên Gia Nitro', icon: 'talent6', fx: 'nitro', per: 0.002 },
      { id: 'trung.coin', name: 'Tăng Thưởng', icon: 'talent7', fx: 'coin', per: 0.01 }] },
    { id: 'cao', name: 'Bằng Lái-Cao', lv: 20, cost: 350, nodes: [   // chọn: Lv20 (gốc Lv40, game ta ít cấp hơn)
      { id: 'cao.run', name: 'Chạy Nhanh', icon: 'talent8', fx: 'top', per: [0.2, 0.4] },
      { id: 'cao.gas', name: 'Tăng Ga', icon: 'talent9', fx: 'accel', per: 0.005 },
      { id: 'cao.pump', name: 'Bơm Hơi', icon: 'talent10', fx: 'nitro', per: 0.0015 },
      { id: 'cao.mini', name: 'Mini Boost', icon: 'talent11', fx: 'mini', per: 0.01 },
      { id: 'cao.coin', name: 'Tăng Thưởng', icon: 'talent12', fx: 'coin', per: 0.01 }] },
  ];
  const NODES = {};
  for (const t of SKILL_TIERS) for (const n of t.nodes) { n.tier = t; NODES[n.id] = n; }
  const FXTEXT = { top: 'Tăng tốc độ chạy tối đa của xe (km/h)', accel: 'Tăng gia tốc của xe', drift: 'Tăng lượng Nitro nạp khi drift', mini: 'Tăng sức mạnh Mini Boost',
    nitro: 'Tăng tốc độ tối đa khi bật Nitro', coin: 'Tăng xu nhận được cuối mỗi trận' };
  const lvOf = (sv, id) => Math.max(0, Math.min(MAXLV, (sv.skills && sv.skills[id]) | 0));
  const perOf = (n, cls) => (n.fx === 'top' ? n.per[cls === 'A' || cls === 'S' ? 1 : 0] : n.per);
  // Tổng tác dụng của mọi nút theo cấp: top (km/h cộng), còn lại là phần trăm dạng 0.012.
  G.effects = function (sv, carId) {
    const f = { top: 0, accel: 0, drift: 0, nitro: 0, mini: 0, coin: 0 }, cls = G.classOf(carId);
    for (const id in NODES) f[NODES[id].fx] += lvOf(sv, id) * perOf(NODES[id], cls);
    return f;
  };
  // Gọi lúc dựng trận (main.js): tính lại từ thông số gốc của xe nên gọi lặp cũng không cộng dồn.
  G.applySkills = function (me, sv) {
    const base = TD.Kart.carParams(me.carId), f = G.effects(sv, me.carId);
    me.p = Object.assign(me.p || {}, base, {
      top: base.top + f.top / 3.6, accel: base.accel * (1 + f.accel), drift: base.drift * (1 + f.drift), nitro: base.nitro * (1 + f.nitro), mini: base.mini * (1 + f.mini) });
    me.coinMul = 1 + f.coin;
  };
  G.tierOpen = (t) => TD.LEVEL.of(save().xp).lv >= t.lv;
  G.skillCost = (id) => { const n = NODES[id], l = lvOf(save(), id); return l >= MAXLV ? 0 : n.tier.cost * (l + 1); };
  G.upgrade = function (id) {
    const d = save(), n = NODES[id];
    if (!n) return { ok: false, why: 'không có kỹ năng này' };
    if (!G.tierOpen(n.tier)) return { ok: false, why: 'chưa đủ cấp ' + n.tier.lv + ' để mở ' + n.tier.name };
    if (lvOf(d, id) >= MAXLV) return { ok: false, why: 'kỹ năng đã tối đa' };
    const cost = G.skillCost(id);
    if (d.coins < cost) return { ok: false, why: 'không đủ xu: cần ' + fmt(cost) + ', còn ' + fmt(d.coins) };
    d.coins -= cost; d.skills = d.skills || {}; d.skills[id] = lvOf(d, id) + 1;
    TD.save.save();
    return { ok: true, cost };
  };

  // ---------- ngày, tuần, mùa ----------
  // G.now ghi đè được khi kiểm: mọi mốc reset (ngày, thứ Hai, tháng) đều tính từ đây.
  const keyOf = (t) => t.getFullYear() + '-' + (t.getMonth() + 1) + '-' + t.getDate();
  G.now = () => new Date();
  G.dayKey = () => keyOf(G.now());
  G.mondayKey = (t) => keyOf(new Date(t.getFullYear(), t.getMonth(), t.getDate() - ((t.getDay() + 6) % 7)));   // thứ Hai của tuần chứa t
  G.weekKey = () => G.mondayKey(G.now());
  G.seasonKey = () => { const t = G.now(); return t.getFullYear() + '-' + (t.getMonth() + 1); };
  const yesterdayKey = () => { const t = G.now(); return keyOf(new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1)); };

  // ---------- trạng thái nhiệm vụ/phúc lợi: save.d.task (nhỏ, đồng bộ đám mây) ----------
  const PASS_MAX = 20, PASS_STEP = 100;   // chọn: thẻ mùa 20 bậc, mỗi bậc 100 sinh lực
  const num = (x) => Math.max(0, Math.floor(Number(x)) || 0);
  const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  const map = (x, f) => { const o = {}, m = obj(x); for (const k of Object.keys(m)) o[k] = f(m[k]); return o; };
  function cleanTask(t) {
    t = obj(t);
    const L = obj(t.login), F = obj(t.fw), W = obj(t.wc), P = obj(t.pass), C = obj(t.cnt);
    return { v: 1, wk: String(t.wk || ''), wp: map(t.wp, num), wd: map(t.wd, Boolean), chain: num(t.chain), cnt: { ir: num(C.ir), tr: num(C.tr) },
      login: { last: String(L.last || ''), n: Math.min(7, num(L.n)), got: Math.min(7, num(L.got)), streak: num(L.streak) },
      fw: { day: String(F.day || ''), got: !!F.got }, wc: { n: num(W.n), opened: num(W.opened) }, lvc: Math.max(1, num(t.lvc)),
      pass: { season: String(P.season || ''), pts: num(P.pts), got: (Array.isArray(P.got) ? P.got : []).map(num).filter((x) => x >= 1 && x <= PASS_MAX) } };
  }
  TD.save.norms.push((o) => { o.task = cleanTask(o.task); });
  const task = () => { const d = save(); if (!d.task || d.task.v !== 1) d.task = cleanTask(d.task); return d.task; };

  // ---------- nhiệm vụ ngày ----------
  // chọn: danh sách và thưởng (bản gốc có nhiệm vụ ngày ở ui/task/#task, nội dung nằm trên máy chủ).
  // act = sinh lực (元气值, "sinh lực" ở strings 086ffc01) mỗi nhiệm vụ cộng vào thanh rương; tổng 100.
  const QUESTS = [
    { id: 'races', name: 'Tham gia 3 trận đua', target: 3, coins: 250, xp: 40, act: 20 },
    { id: 'top3', name: 'Về đích trong top 3 hai lần', target: 2, coins: 300, xp: 40, act: 20 },
    { id: 'drift', name: 'Drift 30 lần', target: 30, coins: 250, xp: 30, act: 15 },
    { id: 'boost', name: 'Dùng 10 lần Mini Boost hoặc Nitro', target: 10, coins: 250, xp: 30, act: 15 },
    { id: 'items', name: 'Dùng 5 đạo cụ (chế độ Đạo Cụ)', target: 5, coins: 300, xp: 40, act: 10 },
    { id: 'ranked', name: 'Đua một trận X.Hạng-Tốc Độ', target: 1, coins: 400, xp: 60, act: 20 },
  ];
  G.QUESTS = QUESTS;
  // Rương sinh lực hằng ngày: mốc 20/40/60/80/100 (chọn: bản gốc kích hoạt nút theo sinh lực, số mốc theo brief).
  const CHESTS = [{ at: 20, coins: 100, xp: 0 }, { at: 40, coins: 200, xp: 0 }, { at: 60, coins: 300, xp: 30 }, { at: 80, coins: 400, xp: 0 }, { at: 100, coins: 700, xp: 100 }];
  G.CHESTS = CHESTS;
  // Điểm sinh lực cũng đổ vào thẻ mùa khi nhận thưởng nhiệm vụ.
  function addPass(n) {
    const p = passSync();
    p.pts = Math.min(PASS_MAX * PASS_STEP, p.pts + n);
  }
  // Sang ngày mới thì xoá tiến độ, trạng thái đã nhận và rương sinh lực.
  G.quests = function () {
    const d = save(), q = d.quests, day = G.dayKey();
    if (q.day !== day) { q.day = day; q.prog = {}; q.done = {}; q.chest = {}; TD.save.save(); }
    if (!q.chest || typeof q.chest !== 'object') q.chest = {};
    return QUESTS.map((x) => Object.assign({}, x, { prog: Math.min(x.target, q.prog[x.id] | 0), claimed: !!q.done[x.id] }));
  };
  G.claimQuest = function (id) {
    const d = save(), x = G.quests().find((q) => q.id === id);
    if (!x) return { ok: false, why: 'không có nhiệm vụ này' };
    if (x.claimed) return { ok: false, why: 'đã nhận thưởng' };
    if (x.prog < x.target) return { ok: false, why: 'chưa hoàn thành' };
    d.quests.done[id] = true; d.coins += x.coins; d.xp += x.xp; addPass(x.act);
    TD.save.save();
    return { ok: true, coins: x.coins, xp: x.xp };
  };
  G.actPts = () => Math.min(100, G.quests().reduce((a, q) => a + (q.prog >= q.target ? q.act : 0), 0));
  G.chests = function () {
    const pts = G.actPts(), got = save().quests.chest;
    return CHESTS.map((c) => Object.assign({}, c, { claimed: !!got[c.at], ready: pts >= c.at && !got[c.at] }));
  };
  G.claimChest = function (at) {
    const d = save(), c = G.chests().find((x) => x.at === at);
    if (!c) return { ok: false, why: 'không có rương này' };
    if (c.claimed) return { ok: false, why: 'hôm nay đã nhận rương này' };   // src: 0e8f1535
    if (!c.ready) return { ok: false, why: 'chưa đủ sinh lực' };
    d.quests.chest[at] = true; d.coins += c.coins; d.xp += c.xp;
    TD.save.save();
    return { ok: true, coins: c.coins, xp: c.xp };
  };

  // ---------- nhiệm vụ tuần (reset thứ Hai) ----------
  // chọn: danh sách và thưởng; mỗi nhiệm vụ cộng sinh lực vào thẻ mùa.
  const WEEKLY = [
    { id: 'races', name: 'Tham gia 20 trận đua', target: 20, coins: 800, xp: 100, act: 40 },
    { id: 'wins', name: 'Về nhất 5 lần', target: 5, coins: 1000, xp: 120, act: 50 },
    { id: 'top3', name: 'Về đích trong top 3 mười lần', target: 10, coins: 800, xp: 100, act: 40 },
    { id: 'drift', name: 'Drift 200 lần', target: 200, coins: 700, xp: 80, act: 30 },
    { id: 'items', name: 'Dùng 30 đạo cụ', target: 30, coins: 800, xp: 100, act: 40 },
    { id: 'ranked', name: 'Đua 5 trận X.Hạng-Tốc Độ', target: 5, coins: 1200, xp: 150, act: 60 },
    { id: 'team', name: 'Đua 5 trận đồng đội', target: 5, coins: 800, xp: 100, act: 40 },
  ];
  G.WEEKLY = WEEKLY;
  G.weekly = function () {
    const t = task(), wk = G.weekKey();
    if (t.wk !== wk) { t.wk = wk; t.wp = {}; t.wd = {}; TD.save.save(); }
    return WEEKLY.map((x) => Object.assign({}, x, { prog: Math.min(x.target, t.wp[x.id] | 0), claimed: !!t.wd[x.id] }));
  };
  G.claimWeekly = function (id) {
    const d = save(), t = task(), x = G.weekly().find((q) => q.id === id);
    if (!x) return { ok: false, why: 'không có nhiệm vụ này' };
    if (x.claimed) return { ok: false, why: 'đã nhận thưởng' };
    if (x.prog < x.target) return { ok: false, why: 'chưa hoàn thành' };
    t.wd[id] = true; d.coins += x.coins; d.xp += x.xp; addPass(x.act);
    TD.save.save();
    return { ok: true, coins: x.coins, xp: x.xp };
  };

  // ---------- nhiệm vụ chính tuyến: mở lần lượt, xong bước này mới tới bước sau ----------
  // chọn: chuỗi 10 bước dẫn người mới qua các hệ thống; bản gốc (og_taskchaindlg) lấy chuỗi từ máy chủ.
  const rankTier = (d) => (TD.RANK ? TD.RANK.of(Math.max(d.rank.pts | 0, d.rank.best | 0)).tier + 1 : 0);
  const CHAIN = [
    { name: 'Hoàn thành trận đua đầu tiên', target: 1, coins: 200, val: (d) => d.races },
    { name: 'Đua một trận chế độ Đạo Cụ', target: 1, coins: 250, val: (d, t) => t.cnt.ir },
    { name: 'Về nhất một trận', target: 1, coins: 300, val: (d) => d.wins },
    { name: 'Nâng một kỹ năng bằng lái', target: 1, coins: 300, val: (d) => Object.keys(NODES).reduce((a, k) => a + lvOf(d, k), 0) },
    { name: 'Mua một chiếc xe mới', target: 4, coins: 400, val: () => G.ownedIds().length, unit: 'xe sở hữu' },
    { name: 'Drift tổng cộng 100 lần', target: 100, coins: 400, val: (d) => d.totals.drifts },
    { name: 'Đua một trận chế độ Đội', target: 1, coins: 500, val: (d, t) => t.cnt.tr },
    { name: 'Đạt cấp 10', target: 10, coins: 800, val: (d) => TD.LEVEL.of(d.xp).lv, unit: 'cấp' },
    { name: 'Đạt hạng Vàng', target: 3, coins: 1500, val: rankTier, unit: 'bậc hạng (Đồng 1, Bạch Ngân 2, Vàng 3)' },
    { name: 'Về nhất 10 trận', target: 10, coins: 2000, val: (d) => d.wins },
  ];
  G.CHAIN = CHAIN;
  G.chain = function () {
    const d = save(), t = task();
    return CHAIN.map((c, i) => {
      const v = Math.min(c.target, c.val(d, t) | 0), state = i < t.chain ? 'done' : i === t.chain ? 'active' : 'lock';
      return Object.assign({}, c, { i, v, state, ready: state === 'active' && v >= c.target });
    });
  };
  G.claimChain = function () {
    const d = save(), t = task(), c = G.chain()[t.chain];
    if (!c) return { ok: false, why: 'đã nhận hết thưởng' };   // src: ngắn gọn từ "Đã nhận hết thưởng"
    if (!c.ready) return { ok: false, why: 'chưa hoàn thành' };
    t.chain++; d.coins += c.coins;
    TD.save.save();
    return { ok: true, coins: c.coins };
  };

  // Mọi mục nhiệm vụ đang chờ nhận (cho chấm đỏ và thẻ "Nhiệm vụ hoàn thành" cuối trận).
  G.pending = function () {
    const out = [];
    for (const q of G.quests()) if (!q.claimed && q.prog >= q.target) out.push({ id: 'd.' + q.id, name: q.name });
    for (const q of G.weekly()) if (!q.claimed && q.prog >= q.target) out.push({ id: 'w.' + q.id, name: q.name + ' (tuần)' });
    const c = G.chain().find((x) => x.ready);
    if (c) out.push({ id: 'c.' + c.i, name: c.name });
    for (const k of G.chests()) if (k.ready) out.push({ id: 'k.' + k.at, name: 'Rương sinh lực ' + k.at });
    return out;
  };

  // ---------- Phúc Lợi: đăng nhập 7 ngày ----------
  // chọn: thưởng 7 ngày (clip gốc có lịch "Đăng Nhập Mỗi Ngày" 7 ô, số xu lấy từ máy chủ).
  const LOGIN = [{ coins: 200, xp: 0 }, { coins: 300, xp: 0 }, { coins: 400, xp: 0 }, { coins: 500, xp: 0 }, { coins: 600, xp: 0 }, { coins: 800, xp: 0 }, { coins: 1500, xp: 150 }];
  // Vào ngày mới: liền ngày hôm trước thì tiếp chuỗi, lỡ ngày thì lịch quay về ngày 1; xong 7 ngày và đã nhận hết thì sang vòng mới.
  function loginSync() {
    const t = task(), L = t.login, today = G.dayKey();
    if (L.last === today) return L;
    const run = L.last === yesterdayKey();
    L.streak = run ? L.streak + 1 : 1;
    if (!run || (L.n >= 7 && L.got >= 7)) { L.n = 1; L.got = 0; } else if (L.n < 7) L.n++;
    L.last = today;
    TD.save.save();
    return L;
  }
  G.login = function () {
    const L = loginSync();
    return { streak: L.streak, n: L.n, got: L.got, days: LOGIN.map((r, i) => Object.assign({ day: i + 1 }, r, { state: i < L.got ? 'got' : i < L.n ? 'ready' : 'wait' })) };
  };
  G.claimLogin = function (day) {
    const d = save(), L = loginSync();
    if (day !== L.got + 1) return { ok: false, why: day <= L.got ? 'đã nhận thưởng' : 'chưa đủ ngày đăng nhập để nhận' };   // src: 31683005
    if (day > L.n) return { ok: false, why: 'chưa đủ ngày đăng nhập để nhận' };
    const r = LOGIN[day - 1];
    L.got = day; d.coins += r.coins; d.xp += r.xp;
    TD.save.save();
    return { ok: true, coins: r.coins, xp: r.xp };
  };

  // ---------- Phúc Lợi: nhiệm vụ thắng trận đầu (331a41c7), rương thắng cá nhân (d62df820) ----------
  const FIRST_WIN = { coins: 500, xp: 60 };      // chọn
  const WIN_CHEST = { every: 5, coins: 600, xp: 60 };   // chọn: cứ 5 trận thắng mở một rương
  G.firstWin = function () { const f = task().fw, today = G.dayKey(); return { won: f.day === today, claimed: f.day === today && f.got, ready: f.day === today && !f.got, reward: FIRST_WIN }; };
  G.claimFirstWin = function () {
    const d = save(), f = G.firstWin();
    if (!f.won) return { ok: false, why: 'hôm nay chưa thắng trận nào' };
    if (f.claimed) return { ok: false, why: 'đã nhận thưởng' };
    task().fw.got = true; d.coins += FIRST_WIN.coins; d.xp += FIRST_WIN.xp;
    TD.save.save();
    return { ok: true, coins: FIRST_WIN.coins, xp: FIRST_WIN.xp };
  };
  G.winChest = () => { const w = task().wc; return { n: w.n, every: WIN_CHEST.every, ready: w.n >= WIN_CHEST.every, opened: w.opened, reward: WIN_CHEST }; };
  G.claimWinChest = function () {
    const d = save(), w = task().wc;
    if (w.n < WIN_CHEST.every) return { ok: false, why: 'chưa đủ ' + WIN_CHEST.every + ' trận thắng' };
    w.n -= WIN_CHEST.every; w.opened++; d.coins += WIN_CHEST.coins; d.xp += WIN_CHEST.xp;
    TD.save.save();
    return { ok: true, coins: WIN_CHEST.coins, xp: WIN_CHEST.xp };
  };

  // ---------- Phúc Lợi: thưởng lên cấp ----------
  G.levelReward = (lv) => 100 + 25 * lv;   // chọn: cấp 2 = 150 xu ... cấp 10 = 350 xu
  G.levelRewards = function () {
    const cur = TD.LEVEL.of(save().xp).lv, got = task().lvc, out = [];
    for (let lv = 2; lv <= Math.max(cur + 4, 8); lv++) out.push({ lv, coins: G.levelReward(lv), state: lv <= got ? 'got' : lv <= cur ? 'ready' : 'wait' });
    return out;
  };
  G.claimLevels = function () {   // nhận mọi cấp đã đạt, theo thứ tự
    const d = save(), t = task(), cur = TD.LEVEL.of(d.xp).lv;
    if (t.lvc >= cur) return { ok: false, why: 'chưa có thưởng cấp mới' };
    let coins = 0;
    for (let lv = t.lvc + 1; lv <= cur; lv++) coins += G.levelReward(lv);
    t.lvc = cur; d.coins += coins;
    TD.save.save();
    return { ok: true, coins };
  };

  // ---------- Thẻ mùa (chỉ làn miễn phí): bậc tính từ sinh lực nhận được, đổi mùa mỗi tháng ----------
  function passSync() {
    const p = task().pass, k = G.seasonKey();
    if (p.season !== k) { p.season = k; p.pts = 0; p.got = []; TD.save.save(); }
    return p;
  }
  G.passReward = (lv) => ({ coins: 100 + 50 * lv, xp: lv % 5 === 0 ? lv * 10 : 0 });   // chọn
  G.pass = function () {
    const p = passSync(), lv = Math.min(PASS_MAX, Math.floor(p.pts / PASS_STEP)), levels = [];
    for (let i = 1; i <= PASS_MAX; i++) levels.push(Object.assign({ lv: i, state: p.got.indexOf(i) >= 0 ? 'got' : i <= lv ? 'ready' : 'wait' }, G.passReward(i)));
    return { season: p.season, pts: p.pts, lv, step: PASS_STEP, into: lv >= PASS_MAX ? 0 : p.pts - lv * PASS_STEP, levels };
  };
  G.claimPass = function (lv) {
    const d = save(), x = G.pass().levels.find((l) => l.lv === lv);
    if (!x) return { ok: false, why: 'không có bậc này' };
    if (x.state === 'got') return { ok: false, why: 'đã nhận thưởng' };
    if (x.state !== 'ready') return { ok: false, why: 'chưa đạt bậc này' };
    task().pass.got.push(lv); d.coins += x.coins; d.xp += x.xp;
    TD.save.save();
    return { ok: true, coins: x.coins, xp: x.xp };
  };

  G.welfarePending = function () {
    const lg = G.login(), pass = G.pass();
    return { login: lg.days.some((x) => x.state === 'ready') ? 1 : 0, first: G.firstWin().ready ? 1 : 0, chest: G.winChest().ready ? 1 : 0,
      level: task().lvc < TD.LEVEL.of(save().xp).lv ? 1 : 0, pass: pass.levels.some((l) => l.state === 'ready') ? 1 : 0 };
  };

  // ---------- thành tựu ----------
  // chọn: bậc cột mốc và thưởng xu; giá trị đọc thẳng từ bản lưu (d.ach[id] = số bậc đã nhận).
  const ACH = [
    { id: 'races', name: 'Tay Đua Chăm Chỉ', unit: 'trận', tiers: [10, 50, 200, 1000], coins: [300, 800, 2000, 6000], val: (d) => d.races },
    { id: 'wins', name: 'Nhà Vô Địch', unit: 'lần về nhất', tiers: [1, 10, 50, 200], coins: [200, 800, 2500, 8000], val: (d) => d.wins },
    { id: 'drifts', name: 'Vua Drift', unit: 'lần drift', tiers: [100, 1000, 5000], coins: [300, 1500, 5000], val: (d) => d.totals.drifts },
    { id: 'boosts', name: 'Bậc Thầy Nitro', unit: 'lần phun', tiers: [50, 500, 3000], coins: [300, 1500, 5000], val: (d) => d.totals.boosts },
    { id: 'items', name: 'Thợ Đạo Cụ', unit: 'đạo cụ đã dùng', tiers: [20, 200, 1000], coins: [300, 1500, 5000], val: (d) => d.totals.items },
    { id: 'hits', name: 'Xạ Thủ', unit: 'lần trúng đạo cụ', tiers: [10, 100, 500], coins: [300, 1500, 5000], val: (d) => d.totals.hits },
    { id: 'km', name: 'Đường Xa', unit: 'km đã đua', tiers: [50, 500, 3000], coins: [300, 1500, 5000], val: (d) => Math.floor(d.totals.km) },
    { id: 'cars', name: 'Nhà Sưu Tập', unit: 'xe sở hữu', tiers: [4, 6, 8], coins: [500, 2000, 6000], val: () => G.ownedIds().length },
    { id: 'level', name: 'Lên Cấp', unit: 'cấp người chơi', tiers: [5, 10, 20, 40], coins: [300, 800, 2000, 6000], val: (d) => TD.LEVEL.of(d.xp).lv },
    { id: 'skills', name: 'Học Nghề', unit: 'cấp kỹ năng', tiers: [5, 20, 40], coins: [300, 1500, 5000], val: (d) => Object.keys(NODES).reduce((a, k) => a + lvOf(d, k), 0) },
  ];
  G.ACH = ACH;
  G.achievements = function () {
    const d = save();
    return ACH.map((a) => {
      const v = a.val(d), got = Math.min(d.ach[a.id] | 0, a.tiers.length), next = a.tiers[got];
      return Object.assign({}, a, { v, got, next, ready: next != null && v >= next, max: got >= a.tiers.length });
    });
  };
  G.claimAch = function (id) {
    const d = save(), a = G.achievements().find((x) => x.id === id);
    if (!a) return { ok: false, why: 'không có thành tựu này' };
    if (a.max) return { ok: false, why: 'đã nhận hết các bậc' };
    if (!a.ready) return { ok: false, why: 'chưa đạt mốc' };
    d.coins += a.coins[a.got]; d.ach[id] = a.got + 1;
    TD.save.save();
    return { ok: true, coins: a.coins[a.got] };
  };
  G.badges = () => {
    const w = G.welfarePending();
    return { quests: G.pending().length, ach: G.achievements().filter((a) => a.ready).length, welfare: w.login + w.first + w.chest + w.level + w.pass };
  };

  // Đếm một trận đã chốt: c = { items, hits } đếm từ sự kiện. Mỗi trận chỉ qua đây một lần; Huấn luyện không tính.
  G.settleRace = function (F, ctx, c) {
    const d = save(), t = task(), R = ctx.R;
    if (R.mode.practice) return;
    G.quests(); G.weekly();   // sang ngày/tuần mới trước khi cộng
    const before = new Set(G.pending().map((x) => x.id)), achBefore = G.achievements().filter((a) => a.ready).length;
    const win = !F.dnf && F.place === 1, top3 = !F.dnf && F.place <= 3, team = R.mode.teams > 0;
    const add = { races: 1, top3: top3 ? 1 : 0, drift: F.stats.drifts, boost: F.stats.boosts,
      items: R.mode.items ? c.items : 0, ranked: R.mode.ranked ? 1 : 0 };
    const tot = d.totals;
    tot.races++; tot.drifts += F.stats.drifts; tot.boosts += F.stats.boosts; tot.items += c.items; tot.hits += c.hits;
    if (!F.dnf) tot.km += R.T.L * R.laps / 1000;
    for (const k in add) d.quests.prog[k] = (d.quests.prog[k] | 0) + add[k];
    const wadd = { races: 1, wins: win ? 1 : 0, top3: add.top3, drift: add.drift, items: add.items, ranked: add.ranked, team: team ? 1 : 0 };
    for (const k in wadd) t.wp[k] = (t.wp[k] | 0) + wadd[k];
    if (R.mode.items) t.cnt.ir++;
    if (team) t.cnt.tr++;
    const cards = [];
    if (win) {
      if (t.fw.day !== G.dayKey()) { t.fw = { day: G.dayKey(), got: false }; cards.push(card('Nhiệm vụ thắng trận đầu', ['Vào Phúc Lợi để nhận thưởng'])); }
      t.wc.n++;
      if (t.wc.n === WIN_CHEST.every) cards.push(card('Rương Thắng Cá Nhân', ['Đủ ' + WIN_CHEST.every + ' trận thắng, vào Phúc Lợi để mở']));
    }
    const bonus = Math.round(F.reward * ((ctx.me.coinMul || 1) - 1));   // kỹ năng Tăng Thưởng
    if (bonus > 0) { d.coins += bonus; F.reward += bonus; }
    TD.save.save();
    const done = G.pending().filter((x) => !before.has(x.id));
    if (done.length) F.cards.push(card('Nhiệm vụ hoàn thành', done.map((q) => q.name)));
    F.cards.push(...cards);
    if (G.achievements().filter((a) => a.ready).length > achBefore) F.cards.push(card('Thành tựu mới', ['Vào Thành Tựu để nhận thưởng']));
  };

  // ---------- plugin trận: đếm tiến độ ----------
  // drift/phun/hạng lấy từ F (main.js đã tính); đạo cụ chỉ đếm qua sự kiện item_use / item_hit, và chỉ tính khi về đích (settle).
  let cur = null;
  const fresh = () => ({ items: 0, hits: 0 });
  const card = (title, lines) => `<div class="fin-card"><h4>${title}</h4><div class="fin-gain">✓</div>${lines.map((l) => `<small>${esc(l)}</small>`).join('')}</div>`;
  TD.racePlugins = TD.racePlugins || [];
  TD.racePlugins.push({
    start() { cur = fresh(); },
    end() { cur = null; },
    event(e, mine, ctx) {
      if (!cur) cur = fresh();
      if (e.type === 'item_use' && mine) cur.items++;
      else if (e.type === 'item_hit' && !mine && ctx && ctx.me && e.by === ctx.me.id) cur.hits++;
    },
    // drift/phun/hạng/đội lấy từ F do main.js dựng, đạo cụ từ sự kiện item_*.
    settle(F, ctx) { G.settleRace(F, ctx, cur || fresh()); },
  });

  // ---------- giao diện ----------
  const S = { tab: 'cars', sel: null, filter: 'all', node: 'so.run', msg: '', confirm: null, sub: { quests: 'day', welfare: 'login' } };
  const TABS = [['cars', 'Gara'], ['shop', 'Cửa Hàng'], ['skills', 'Kỹ Năng'], ['quests', 'Nhiệm Vụ'], ['ach', 'Thành Tựu'], ['welfare', 'Phúc Lợi']];
  const QSUBS = [['day', 'Hằng ngày'], ['week', 'Hằng tuần'], ['chain', 'Chính tuyến']];
  const WSUBS = [['login', 'Đăng Nhập'], ['first', 'Thắng Đầu'], ['chest', 'Rương Thắng'], ['level', 'Lên Cấp'], ['pass', 'Thẻ Mùa']];
  const css = (c) => 'rgb(' + c.map((x) => Math.round(Math.min(1, x) * 255)).join(',') + ')';
  const swatch = (p) => `linear-gradient(135deg,${css(p[0])} 55%,${css(p[1])} 55%)`;
  const root = () => document.getElementById('ui');

  // Khung xe 3D: tâm xe ở tỉ lệ ngang frac của màn hình (0..1), cao ở tỉ lệ ngang/dọc lookY; xe đứng gốc toạ độ.
  function frame(frac, lookY, dist) {
    const asp = innerWidth / innerHeight, fov = 45, w = 2 * dist * Math.tan(fov * Math.PI / 360) * asp, x = (0.5 - frac) * w;
    TD.main.lobbyCam = { pos: [x, 1.45, dist], look: [x, lookY, 0], fov };
  }
  function preview(id) {
    const d = save();
    TD.main.showCar(id, d.driver);
    if (G.owns(id)) TD.kartView.repaintHuman();
  }
  G.leave = function () {
    const d = save();
    S.confirm = null; root().onclick = null;
    TD.main.lobbyCam = null;
    TD.main.showCar(G.owns(d.car) ? d.car : G.ownedIds()[0], d.driver);
    if (TD.lobby && TD.lobby.show) TD.lobby.show(); else TD.main.toLobby();
  };

  function topBar() {
    const b = G.badges(), d = save(), dot = (n) => (n ? `<i class="gdot">${n}</i>` : '');
    return `<div class="gtop"><button class="gback" data-g="back" aria-label="Về sảnh">‹</button>
      <nav class="gtabs">${TABS.map(([id, n]) => `<button class="gtab ${S.tab === id ? 'on' : ''}" data-tab="${id}">${n}${dot(id === 'quests' ? b.quests : id === 'ach' ? b.ach : id === 'welfare' ? b.welfare : 0)}</button>`).join('')}</nav>
      <div class="gcoins" aria-label="Xu"><img src="art/ui/coin.png" alt=""><b>${fmt(d.coins)}</b></div></div>`;
  }

  function carCard(c, locked, extra) {
    const cls = G.classOf(c.id);
    return `<button class="gcar ${S.sel === c.id ? 'on' : ''} ${locked ? 'lock' : ''}" data-car="${c.id}"><span class="gcls c${cls}">${cls}</span>
      <span class="gname">${esc(c.name)}</span>${extra || ''}</button>`;
  }

  function viewCars() {
    const d = save(), c = TD.CARS[S.sel], own = G.owns(c.id), cls = G.classOf(c.id), st = G.stats(c.id);
    const ids = Object.keys(TD.CARS), owned = ids.filter(G.owns), locked = ids.filter((i) => !G.owns(i));
    const row = (n, v) => `<div class="grow"><span>${n}</span><b>${v}</b></div>`;
    const pi = (d.paint && d.paint[c.id]) | 0;
    const sw = own && c.paintMaps ? [c.paint].concat(TD.PAINTS).map((p, i) =>
      `<button class="gsw ${i === pi ? 'on' : ''}" data-paint="${i}" aria-label="Màu sơn ${i ? esc(p.name) : 'gốc'}" style="background:${swatch(p)}"></button>`).join('') : '';
    return `<div class="gpanel" data-keep="panel">
        <div class="ghead"><span class="gcls big c${cls}">${cls}</span><div><h2>${esc(c.name)}</h2><small>Xe hạng ${cls}${own ? '' : ' · chưa sở hữu'}</small></div></div>
        <h3>Xem thuộc tính</h3><canvas class="gradar" width="300" height="190" aria-label="Biểu đồ radar 6 chỉ số"></canvas>
        <h3>Thuộc tính${save().skills && Object.keys(save().skills).length ? ' (gồm kỹ năng)' : ''}</h3>
        ${row('Tốc độ đường trường', st.top.toFixed(1) + ' km/h')}${row('Tốc độ nitro cao nhất', st.nitroTop.toFixed(1) + ' km/h')}
        ${row('Tăng tốc', st.accel.toFixed(1) + ' m/s²')}${row('Bám lái', st.turn.toFixed(0) + '%')}
        ${row('Mini Boost', '+' + st.mini.toFixed(1) + ' / +' + st.miniPerfect.toFixed(1) + ' km/h')}${row('Thời gian Mini Boost', st.miniTime.toFixed(2) + ' s')}
        ${row('Nạp đầy Nitro (drift)', st.fill.toFixed(1) + ' s')}${row('Thời gian Nitro', st.nitroTime.toFixed(1) + ' s')}
        ${sw ? `<h3>Màu</h3><div class="gsws">${sw}</div>` : ''}
        <h3>Tay đua</h3><div class="gdrivers">${Object.values(TD.DRIVERS).map((x) => `<button class="gchip ${x.id === d.driver ? 'on' : ''}" data-driver="${x.id}">${esc(x.name)}</button>`).join('')}</div>
      </div>
      <div class="gstrip" data-keep="strip">${owned.map((i) => carCard(TD.CARS[i], false)).join('')}${locked.map((i) => carCard(TD.CARS[i], true, `<em><img src="art/ui/coin.png" alt="">${fmt(G.priceOf(i))}</em>`)).join('')}</div>
      <div class="gcta">${own ? `<button class="gbtn gold" data-g="drive">Lái ngay</button>` : `<button class="gbtn gold" data-g="toshop">Mua ở Cửa Hàng · ${fmt(G.priceOf(c.id))} xu</button>`}</div>`;
  }

  function viewShop() {
    const ids = Object.keys(TD.CARS).sort((a, b) => G.priceOf(a) - G.priceOf(b)).filter((i) => S.filter === 'all' || G.classOf(i) === S.filter);
    const tabs = [['all', 'Tất cả'], ['A', 'A'], ['B', 'B'], ['C', 'C'], ['S', 'S']];
    const card = (id) => {
      const c = TD.CARS[id], own = G.owns(id);
      return `<div class="gshopcard ${S.sel === id ? 'on' : ''}" data-car="${id}"><span class="gcls big c${G.classOf(id)}">${G.classOf(id)}</span>
        <div class="gshopinfo"><b>${esc(c.name)}</b><small>Tốc ${c.stats.speed} · Tăng tốc ${c.stats.accel} · Drift ${c.stats.drift}</small>
        <em><img src="art/ui/coin.png" alt="">${fmt(G.priceOf(id))}</em></div>
        ${own ? '<span class="gown">Đã có</span>' : `<button class="gbtn blue" data-buy="${id}">Mua</button>`}</div>`;
    };
    return `<div class="gshop"><div class="gfilter">${tabs.map(([k, n]) => `<button class="gchip ${S.filter === k ? 'on' : ''}" data-filter="${k}">${n}</button>`).join('')}</div>
      <div class="gshoplist" data-keep="shop">${ids.map(card).join('') || '<p class="gempty">Không có xe hạng này.</p>'}</div></div>`;
  }

  function viewSkills() {
    const d = save(), n = NODES[S.node], l = lvOf(d, n.id), cls = G.classOf(d.car), open = G.tierOpen(n.tier);
    const eff = (lv) => {
      if (n.fx !== 'top') return '+' + (lv * n.per * 100).toFixed(2).replace(/\.?0+$/, '') + '%';
      return 'Xe B +' + (lv * n.per[0]).toFixed(2).replace(/\.?0+$/, '') + ', Xe A +' + (lv * n.per[1]).toFixed(2).replace(/\.?0+$/, '') + ', Xe S +' + (lv * n.per[1]).toFixed(2).replace(/\.?0+$/, '');
    };
    const hex = (x) => `<button class="ghex ${S.node === x.id ? 'on' : ''} ${lvOf(d, x.id) >= MAXLV ? 'max' : ''} ${G.tierOpen(x.tier) ? '' : 'lock'} t-${x.tier.id}" data-node="${x.id}">
      <span class="gh"><img src="art/garage/${x.icon}.webp" alt=""></span><em>${esc(x.name)}</em><small>${lvOf(d, x.id)}/${MAXLV}</small></button>`;
    const rows = SKILL_TIERS.map((t) => `<div class="gtier ${G.tierOpen(t) ? '' : 'lock'}"><h4>${t.name}${G.tierOpen(t) ? '' : ` <small>đạt Lv${t.lv} để mở khoá</small>`}</h4>
      <div class="gnodes">${t.nodes.map(hex).join('')}</div></div>`).join('');
    return `<div class="gskills"><div class="gtiers" data-keep="tiers">${rows}</div>
      <div class="gdetail" data-keep="detail"><div class="ghead"><span class="gh t-${n.tier.id}"><img src="art/garage/${n.icon}.webp" alt=""></span><div><h2>${esc(n.name)}</h2><small>${n.tier.name}</small></div></div>
        <p class="glv">Cấp: <b>${l}/${MAXLV}</b></p><p class="gdesc">${FXTEXT[n.fx]}</p>
        <h5>Cấp hiện tại</h5><p class="gfx">${l ? eff(l) : 'Chưa nâng'}</p>
        <h5>Cấp kế</h5><p class="gfx">${l >= MAXLV ? 'Đã tối đa' : eff(l + 1)}</p>
        ${n.fx === 'top' ? `<small class="gnote">Xe đang chọn: hạng ${cls}</small>` : ''}
        <div class="gcost">Tốn <img src="art/ui/coin.png" alt=""><b>${l >= MAXLV ? '--' : fmt(G.skillCost(n.id))}</b></div>
        <button class="gbtn gold" data-up="${n.id}" ${!open || l >= MAXLV ? 'disabled' : ''}>${l >= MAXLV ? 'MAX' : 'Tăng cấp'}</button></div></div>`;
  }

  const subBar = (subs, cur, dots) => `<div class="gsubs">${subs.map(([id, n]) => `<button class="gchip ${cur === id ? 'on' : ''}" data-sub="${id}">${n}${dots[id] ? `<i class="gdot">${dots[id]}</i>` : ''}</button>`).join('')}</div>`;
  const rewardTxt = (r) => fmt(r.coins) + ' xu' + (r.xp ? ', ' + r.xp + ' XP' : '');
  const progLine = (name, prog, target, info, right) => `<div class="gline ${right.done ? 'done' : ''}"><div class="gl"><b>${esc(name)}</b>
    <div class="gbar"><i style="width:${Math.round(100 * prog / target)}%"></i></div><small>${fmt(prog)}/${fmt(target)} · ${info}</small></div>${right.html}</div>`;

  function viewQuests() {
    const sub = S.sub.quests;
    const dots = { day: G.pending().filter((x) => x.id[0] === 'd' || x.id[0] === 'k').length, week: G.pending().filter((x) => x.id[0] === 'w').length, chain: G.pending().filter((x) => x.id[0] === 'c').length };
    let body;
    if (sub === 'day') {
      const pts = G.actPts();
      body = `<h2>Nhiệm Vụ Ngày</h2><p class="gsub">Làm mới mỗi ngày. Sinh lực càng cao thưởng càng nhiều.</p>
        <div class="gsl"><b>Sinh lực</b><div class="gbar tall"><i style="width:${pts}%"></i></div><span>${pts}/100</span></div>
        <div class="gchests">${G.chests().map((c) => `<button class="gchest ${c.claimed ? 'got' : c.ready ? 'ready' : ''}" data-chest="${c.at}" ${c.ready ? '' : 'disabled'} aria-label="Rương ${c.at} sinh lực">
          <img src="art/garage/chest.svg" alt=""><b>${c.at}</b><small>${c.claimed ? 'Đã nhận' : c.ready ? 'Nhận' : fmt(c.coins) + ' xu'}</small></button>`).join('')}</div>
        ${G.quests().map((q) => progLine(q.name, q.prog, q.target, `thưởng ${fmt(q.coins)} xu, ${q.xp} XP · +${q.act} sinh lực`,
          { done: q.claimed, html: q.claimed ? '<span class="gown">Đã nhận</span>' : `<button class="gbtn gold" data-claimq="${q.id}" ${q.prog >= q.target ? '' : 'disabled'}>Nhận</button>` })).join('')}`;
    } else if (sub === 'week') {
      body = `<h2>Nhiệm Vụ Tuần</h2><p class="gsub">Làm mới sáng thứ Hai (tuần từ ${esc(G.weekKey())}). Mỗi nhiệm vụ cộng sinh lực vào Thẻ Mùa.</p>
        ${G.weekly().map((q) => progLine(q.name, q.prog, q.target, `thưởng ${fmt(q.coins)} xu, ${q.xp} XP · +${q.act} sinh lực`,
          { done: q.claimed, html: q.claimed ? '<span class="gown">Đã nhận</span>' : `<button class="gbtn gold" data-claimw="${q.id}" ${q.prog >= q.target ? '' : 'disabled'}>Nhận</button>` })).join('')}`;
    } else {
      body = `<h2>Nhiệm Vụ Chính Tuyến</h2><p class="gsub">Hoàn thành lần lượt từng bước để mở bước kế.</p>
        ${G.chain().map((c) => c.state === 'lock'
          ? `<div class="gline lock"><div class="gl"><b>${c.i + 1}. ${esc(c.name)}</b><small>Hoàn thành bước trước để mở · thưởng ${fmt(c.coins)} xu</small></div><span class="gown">Khóa</span></div>`
          : progLine((c.i + 1) + '. ' + c.name, c.v, c.target, `thưởng ${fmt(c.coins)} xu${c.unit ? ' · ' + c.unit : ''}`,
            { done: c.state === 'done', html: c.state === 'done' ? '<span class="gown">Đã nhận</span>' : `<button class="gbtn gold" data-claimc="1" ${c.ready ? '' : 'disabled'}>Nhận</button>` })).join('')}`;
    }
    return `<div class="gpage" data-keep="page">${subBar(QSUBS, sub, dots)}${body}</div>`;
  }

  function viewWelfare() {
    const sub = S.sub.welfare, w = G.welfarePending();
    let body;
    if (sub === 'login') {
      const L = G.login();
      body = `<h2>Đăng Nhập Mỗi Ngày</h2><p class="gsub">Chuỗi đăng nhập: <b>${L.streak}</b> ngày. Lỡ một ngày, lịch quay về ngày 1.</p>
        <div class="gdays">${L.days.map((x) => `<div class="gday ${x.state}"><span>Ngày ${x.day}</span><b>${fmt(x.coins)} xu</b>${x.xp ? `<small>${x.xp} XP</small>` : '<small>&nbsp;</small>'}
          ${x.state === 'got' ? '<em>Đã nhận</em>' : `<button class="gbtn gold" data-login="${x.day}" ${x.state === 'ready' && x.day === L.got + 1 ? '' : 'disabled'}>${x.state === 'wait' ? 'Chờ' : 'Nhận'}</button>`}</div>`).join('')}</div>`;
    } else if (sub === 'first') {
      const f = G.firstWin();
      body = `<h2>Nhiệm vụ thắng trận đầu</h2><p class="gsub">Về nhất một trận bất kỳ trong ngày để nhận thưởng. Làm mới mỗi ngày.</p>
        ${progLine('Thắng trận đầu tiên trong ngày', f.won ? 1 : 0, 1, 'thưởng ' + rewardTxt(f.reward), { done: f.claimed, html: f.claimed ? '<span class="gown">Đã nhận</span>' : `<button class="gbtn gold" data-fw="1" ${f.ready ? '' : 'disabled'}>Nhận</button>` })}`;
    } else if (sub === 'chest') {
      const c = G.winChest();
      body = `<h2>Rương Thắng Cá Nhân</h2><p class="gsub">Cứ ${c.every} trận về nhất mở một rương. Đã mở ${c.opened} rương.</p>
        ${progLine('Tích lũy trận thắng', Math.min(c.n, c.every), c.every, 'thưởng ' + rewardTxt(c.reward), { html: `<button class="gbtn gold" data-wchest="1" ${c.ready ? '' : 'disabled'}>Mở rương</button>` })}`;
    } else if (sub === 'level') {
      const rs = G.levelRewards();
      body = `<h2>Thưởng Lên Cấp</h2><p class="gsub">Mỗi cấp mới có một phần quà xu.</p>
        <div class="gline"><div class="gl"><b>Cấp hiện tại: ${TD.LEVEL.of(save().xp).lv}</b></div><button class="gbtn gold" data-lvl="1" ${w.level ? '' : 'disabled'}>Nhận tất cả</button></div>
        <div class="glv-list">${rs.map((r) => `<div class="gline ${r.state === 'got' ? 'done' : r.state === 'wait' ? 'lock' : ''}"><div class="gl"><b>Cấp ${r.lv}</b><small>${fmt(r.coins)} xu</small></div><span class="gown">${r.state === 'got' ? 'Đã nhận' : r.state === 'ready' ? 'Có thể nhận' : 'Chưa đạt'}</span></div>`).join('')}</div>`;
    } else {
      const P = G.pass();
      body = `<h2>Thẻ Mùa ${esc(P.season)}</h2><p class="gsub">Làn miễn phí. Nhận thưởng nhiệm vụ ngày/tuần để tích sinh lực; mỗi ${P.step} sinh lực lên một bậc.</p>
        <div class="gsl"><b>Bậc ${P.lv}/${P.levels.length}</b><div class="gbar tall"><i style="width:${P.lv >= P.levels.length ? 100 : Math.round(100 * P.into / P.step)}%"></i></div><span>${P.pts} điểm</span></div>
        <div class="gdays gpass">${P.levels.map((l) => `<div class="gday ${l.state}"><span>Bậc ${l.lv}</span><b>${fmt(l.coins)} xu</b><small>${l.xp ? l.xp + ' XP' : '&nbsp;'}</small>
          ${l.state === 'got' ? '<em>Đã nhận</em>' : `<button class="gbtn gold" data-pass="${l.lv}" ${l.state === 'ready' ? '' : 'disabled'}>${l.state === 'ready' ? 'Nhận' : 'Chờ'}</button>`}</div>`).join('')}</div>`;
    }
    return `<div class="gpage" data-keep="page">${subBar(WSUBS, sub, w)}${body}</div>`;
  }

  function viewAch() {
    return `<div class="gpage" data-keep="page"><h2>Thành Tựu</h2><p class="gsub">Tích lũy suốt đời, mỗi bậc nhận xu một lần.</p>${G.achievements().map((a) => {
      const from = a.got ? a.tiers[a.got - 1] : 0, to = a.next || a.tiers[a.tiers.length - 1];
      const pct = a.max ? 100 : Math.max(0, Math.min(100, Math.round(100 * (a.v - from) / (to - from))));
      return `<div class="gline ${a.max ? 'done' : ''}"><div class="gl"><b>${esc(a.name)} <span class="gstars">${'★'.repeat(a.got)}${'☆'.repeat(a.tiers.length - a.got)}</span></b>
        <div class="gbar"><i style="width:${pct}%"></i></div><small>${a.max ? 'Đã đạt mọi bậc' : fmt(Math.min(a.v, to)) + '/' + fmt(to) + ' ' + a.unit + ' · thưởng ' + fmt(a.coins[a.got]) + ' xu'}</small></div>
        ${a.max ? '<span class="gown">Tối đa</span>' : `<button class="gbtn gold" data-claima="${a.id}" ${a.ready ? '' : 'disabled'}>Nhận</button>`}</div>`;
    }).join('')}</div>`;
  }

  function modal() {
    if (!S.confirm) return '';
    const id = S.confirm, c = TD.CARS[id], price = G.priceOf(id), short = save().coins < price;
    return `<div class="gmodal"><div class="gdlg"><h3>Mua xe</h3><p>Mua <b>${esc(c.name)}</b> (hạng ${G.classOf(id)}) với <b>${fmt(price)}</b> xu?</p>
      <p class="gwarn">${short ? `Không đủ xu: còn ${fmt(save().coins)}, thiếu ${fmt(price - save().coins)}.` : ''}</p>
      <div class="gact"><button class="gbtn gray" data-g="cancel">Hủy</button><button class="gbtn gold" data-g="confirm">Mua</button></div></div></div>`;
  }

  function drawRadar() {
    const cv = document.querySelector('.gradar');
    if (!cv) return;
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, cx = W / 2, cy = H / 2 + 4, R = 52, ax = G.radar(S.sel);
    const pt = (i, r) => [cx + Math.sin(i * Math.PI / 3) * R * r, cy - Math.cos(i * Math.PI / 3) * R * r];
    g.clearRect(0, 0, W, H);
    g.strokeStyle = 'rgba(140,200,255,.35)'; g.lineWidth = 1;
    for (const r of [0.4, 0.7, 1]) { g.beginPath(); for (let i = 0; i < 6; i++) { const p = pt(i, r); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); } g.closePath(); g.stroke(); }
    for (let i = 0; i < 6; i++) { const p = pt(i, 1); g.beginPath(); g.moveTo(cx, cy); g.lineTo(p[0], p[1]); g.stroke(); }
    g.beginPath();
    ax.forEach((a, i) => { const p = pt(i, a.v / 100); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); });
    g.closePath(); g.fillStyle = 'rgba(80,220,200,.45)'; g.fill(); g.strokeStyle = '#6ff5e0'; g.lineWidth = 2; g.stroke();
    g.font = '15px Cafeta, system-ui, sans-serif'; g.fillStyle = '#d8ebff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    ax.forEach((a, i) => { const p = pt(i, 1.42); g.fillText(a.name, p[0], p[1] - 8); g.fillStyle = '#ffd23a'; g.fillText(a.v, p[0], p[1] + 8); g.fillStyle = '#d8ebff'; });
  }

  // Dựng lại cả màn nhưng giữ vị trí cuộn của danh sách (data-keep).
  function render() {
    const el = root(), keep = {};
    for (const k of el.querySelectorAll('[data-keep]')) keep[k.dataset.keep] = [k.scrollLeft, k.scrollTop];
    const view = { cars: viewCars, shop: viewShop, skills: viewSkills, quests: viewQuests, ach: viewAch, welfare: viewWelfare }[S.tab]();
    el.innerHTML = `<div class="gr" data-tab="${S.tab}">${topBar()}${view}${S.msg ? `<div class="gmsg">${esc(S.msg)}</div>` : ''}${modal()}</div>`;
    for (const k of el.querySelectorAll('[data-keep]')) if (keep[k.dataset.keep]) { k.scrollLeft = keep[k.dataset.keep][0]; k.scrollTop = keep[k.dataset.keep][1]; }
    const on = el.querySelector('.gcar.on, .gshopcard.on');
    if (on && !keep.strip && !keep.shop) on.scrollIntoView({ block: 'nearest', inline: 'center' });
    if (S.tab === 'cars') drawRadar();
    el.onclick = onClick;
  }
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  function say(m) { S.msg = m; render(); clearTimeout(say.t); say.t = setTimeout(() => { S.msg = ''; if (document.querySelector('.gr')) render(); }, 2600); }

  function camFor(tab) {
    if (tab === 'cars') innerHeight < 460 ? frame(0.3, 0.5, 7.6) : frame(0.32, 0.25, 6.2);   // điện thoại ngang: lùi xa để xe khỏi chạm thanh trên
    else if (tab === 'shop') frame(0.74, 0.45, 6.2);
    else TD.main.lobbyCam = { pos: [0, 1.45, 6.2], look: [0, 60, 6.2], fov: 45 };   // màn chữ: nhìn lên trời, xe ra khỏi khung
  }

  function onClick(e) {
    const b = e.target.closest('button, .gshopcard');
    if (!b) return;
    click();
    const dt = b.dataset, d = save();
    if (dt.tab) { S.tab = dt.tab; S.msg = ''; camFor(S.tab); if (S.tab === 'cars' || S.tab === 'shop') preview(S.sel); render(); }
    else if (dt.g === 'back') G.leave();
    else if (dt.g === 'drive') { d.car = S.sel; TD.save.save(); TD.audio.play('Play_UI_Confirm'); G.leave(); }
    else if (dt.g === 'toshop') { S.tab = 'shop'; S.filter = 'all'; camFor('shop'); render(); }
    else if (dt.g === 'cancel') { S.confirm = null; render(); }
    else if (dt.g === 'confirm') {
      const r = G.buy(S.confirm);
      if (!r.ok) { render(); return; }
      const c = TD.CARS[S.confirm]; S.confirm = null; say('Đã mua ' + c.name);
    }
    else if (dt.buy) { S.sel = dt.buy; preview(S.sel); S.confirm = dt.buy; render(); }
    else if (dt.car) { S.sel = dt.car; preview(S.sel); render(); }
    else if (dt.paint) { d.paint = d.paint || {}; d.paint[S.sel] = Number(dt.paint); TD.save.save(); TD.kartView.repaintHuman(); render(); }
    else if (dt.driver) { d.driver = dt.driver; TD.save.save(); preview(S.sel); render(); }
    else if (dt.filter) { S.filter = dt.filter; render(); }
    else if (dt.node) { S.node = dt.node; render(); }
    else if (dt.up) { const r = G.upgrade(dt.up); if (r.ok) say('Đã nâng ' + NODES[dt.up].name + ' lên cấp ' + lvOf(d, dt.up)); else say(r.why.charAt(0).toUpperCase() + r.why.slice(1)); }
    else if (dt.claimq) { const r = G.claimQuest(dt.claimq); say(r.ok ? 'Nhận ' + fmt(r.coins) + ' xu, ' + r.xp + ' XP' : r.why); }
    else if (dt.sub) { S.sub[S.tab] = dt.sub; render(); }
    else if (dt.chest) { const r = G.claimChest(Number(dt.chest)); say(r.ok ? 'Nhận ' + rewardTxt(r) : cap(r.why)); }
    else if (dt.claimw) { const r = G.claimWeekly(dt.claimw); say(r.ok ? 'Nhận ' + rewardTxt(r) : cap(r.why)); }
    else if (dt.claimc) { const r = G.claimChain(); say(r.ok ? 'Nhận ' + fmt(r.coins) + ' xu' : cap(r.why)); }
    else if (dt.login) { const r = G.claimLogin(Number(dt.login)); say(r.ok ? 'Nhận ' + rewardTxt(r) : cap(r.why)); }
    else if (dt.fw) { const r = G.claimFirstWin(); say(r.ok ? 'Nhận ' + rewardTxt(r) : cap(r.why)); }
    else if (dt.wchest) { const r = G.claimWinChest(); say(r.ok ? 'Mở rương: ' + rewardTxt(r) : cap(r.why)); }
    else if (dt.lvl) { const r = G.claimLevels(); say(r.ok ? 'Nhận ' + fmt(r.coins) + ' xu' : cap(r.why)); }
    else if (dt.pass) { const r = G.claimPass(Number(dt.pass)); say(r.ok ? 'Nhận ' + rewardTxt(r) : cap(r.why)); }
    else if (dt.claima) { const r = G.claimAch(dt.claima); say(r.ok ? 'Nhận ' + fmt(r.coins) + ' xu' : r.why); }
  }

  G.open = function (tab) {
    const d = save();
    S.tab = TABS.some((t) => t[0] === tab) ? tab : 'cars';
    if (!G.owns(d.car)) d.car = G.ownedIds()[0];
    S.sel = G.owns(S.sel) || S.tab === 'shop' && TD.CARS[S.sel] ? S.sel : d.car;
    if (S.tab === 'cars' && !G.owns(S.sel)) S.sel = d.car;
    S.msg = ''; S.confirm = null;
    camFor(S.tab);
    if (S.tab === 'cars' || S.tab === 'shop') preview(S.sel);
    render();
  };

  // Phúc Lợi là nút nhỏ cạnh xu ở sảnh; Nhiệm Vụ vẫn ở nút linh vật (sảnh gọi TD.garage.open('quests')).
  if (TD.lobby && TD.lobby.add) TD.lobby.add({ id: 'welfare', where: 'top', label: 'Phúc Lợi', icon: 'art/garage/welfare.svg', order: 30, open: () => G.open('welfare'), badge: () => G.badges().welfare });

  TD.garage = G;
})(globalThis.TD = globalThis.TD || {});
