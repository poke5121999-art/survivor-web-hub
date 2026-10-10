// Cốt Truyện: nhân vật, chương, ải, mục tiêu và bộ chấm sao (thuần JS, chạy được trong Node: test/toc-do-story.js).
// APK có màn Cốt Truyện (ui/story/*, uitextures/id_career) và gói lời thoại giọng nói, nhưng KHÔNG có nội dung ải/lời thoại
// dạng dữ liệu đọc được (cấu hình ải và truyện nằm trên máy chủ). Nên: chân dung NPC và nền bản đồ là ảnh gốc, ải, mục tiêu, lời thoại
// và tên chương là do ta chọn (viết ngắn, giọng gần với bản gốc). Chuỗi UI có thật: "Chương N", "Vượt ải", "Cốt Truyện",
// "[Vượt ải] Dẫn trước đối thủ 30 mét", "Ải chưa mở khóa, cần vượt ải trước đó".
(function (G) {
  var TD = G.TD = G.TD || {};
  var S = TD.Story = {};

  var P = 'art/story/npchead_Icon_SuperProp_';
  // Chân dung: tệp npchead/Icon_SuperProp_<pinyin> trong APK. Tên hiển thị là phiên âm Việt do ta đặt (chọn).
  S.NPC = {
    quat: { name: 'Tiểu Quất', img: P + 'XiaoJuZi.webp' },       // hướng dẫn viên (小橘子, "Citrus" trong chuỗi gốc)
    bsq: { name: 'Bác Sĩ Quái', img: P + 'GuaiBoShi.webp' },     // chuyên gia đạo cụ (怪博士)
    rezzo: { name: 'Rezzo', img: 'art/story/npchead_Icon_Rezzo.webp' },
    kaili: { name: 'Khải Lợi', img: P + 'KaiLi.webp' },
    kazami: { name: 'Kazami', img: 'art/story/npchead_Icon_Kazami.webp' },
    enzuo: { name: 'Ân Tả', img: P + 'EnZuo.webp' },
    tris: { name: 'Tris Tan', img: P + 'TeLiSiTan.webp' },
    xizeer: { name: 'Hy Trạch', img: P + 'XiZeEr.webp' },
    yilian: { name: 'Y Liên', img: P + 'YiLian.webp' },
    leiyin: { name: 'Lôi Âm', img: P + 'LeiYin.webp' },
    kuluo: { name: 'Khô Lạc', img: P + 'KuLuoDiKa.webp' },        // trùm cuối
    me: { name: 'Bạn', img: null },                                 // người chơi: giao diện dùng avatar sảnh
  };

  // Thời gian vòng nhanh nhất của bot kỹ năng cao (giây/vòng): node games/toc-do/tools/race_stats.js <đường> 5, vòng 2.
  // Đường chưa đo: chiều dài / 62 m/s (trung bình các đường đã đo 52–73 m/s).
  S.REF_LAP = { '11citynew': 65.5, chinatown: 53.5, troypalace: 60, winterolympic01: 71.5, xintianebao: 88.5, troycity: 93 };
  S.ORDER = ['11citynew', 'chinatown', 'troypalace', 'winterolympic01', 'xintianebao', 'troycity'];

  // Các đường dùng cho cốt truyện: đường vòng (loop !== false), theo ORDER rồi đến đường mới thêm. Số đường bao nhiêu cũng chạy (ải lấy theo chỉ số, quay vòng).
  S.trackIds = function () {
    var all = Object.keys(TD.TRACKS || {}).filter(function (id) { return TD.TRACKS[id].loop !== false; });
    return S.ORDER.filter(function (id) { return all.indexOf(id) >= 0; }).concat(all.filter(function (id) { return S.ORDER.indexOf(id) < 0; }));
  };
  S.trackOf = function (slot) { var ids = S.trackIds(); return ids[slot % ids.length]; };
  S.refTime = function (trackId, laps) {
    var T = TD.TRACKS && TD.TRACKS[trackId];
    return (S.REF_LAP[trackId] || (T ? T.length / 62 : 90)) * laps;
  };

  // ---------- mục tiêu ----------
  // Đếm (đạt là xong): drifts, boosts, itemGet, itemHit, topspeed. Giới hạn (vượt là hỏng): nowall, norespawn, time.
  // Chốt khi về đích: place, rival, gap. Mọi ải có mục tiêu đầu = hạng (qua ải); mỗi mục tiêu đạt = 1 sao.
  S.goal = {
    place: function (n) { return { type: 'place', n: n }; },
    time: function (mult) { return { type: 'time', mult: mult }; },             // giờ giới hạn = giờ chuẩn × mult
    drifts: function (n) { return { type: 'drifts', n: n }; },
    boosts: function (n) { return { type: 'boosts', n: n }; },
    nowall: function (n) { return { type: 'nowall', n: n || 0 }; },             // va tường tối đa n lần
    norespawn: function () { return { type: 'norespawn', n: 0 }; },
    itemGet: function (n) { return { type: 'itemGet', n: n }; },
    itemHit: function (n) { return { type: 'itemHit', n: n }; },
    rival: function () { return { type: 'rival' }; },
    gap: function (m) { return { type: 'gap', n: m }; },
    topspeed: function (kmh) { return { type: 'topspeed', n: kmh }; },
  };
  var COUNT = { drifts: 'drifts', boosts: 'boosts', itemGet: 'itemsGot', itemHit: 'itemHits', topspeed: 'topKmh' };
  var LIMIT = { nowall: 'wallHits', norespawn: 'respawns' };

  function mmss(t) { var m = Math.floor(t / 60), s = Math.round(t - m * 60); if (s === 60) { m++; s = 0; } return m + ':' + (s < 10 ? '0' : '') + s; }

  // Mục tiêu đã gắn số theo ải: giờ giới hạn đổi ra giây, chữ hiển thị.
  S.resolve = function (L) {
    var trackId = S.trackOf(L.slot), laps = L.laps;
    return L.goals.map(function (g) {
      var r = { type: g.type, n: g.n, sec: null, text: '' };
      var n = g.n;
      switch (g.type) {
        case 'place': r.text = n === 1 ? 'Về nhất' : 'Về đích trong top ' + n; break;
        case 'time': r.sec = Math.round(S.refTime(trackId, laps) * g.mult); r.text = 'Hoàn thành trong ' + mmss(r.sec); break;
        case 'drifts': r.text = 'Drift ' + n + ' lần'; break;
        case 'boosts': r.text = 'Phun tăng tốc ' + n + ' lần'; break;
        case 'nowall': r.text = n ? 'Va tường tối đa ' + n + ' lần' : 'Không va tường'; break;
        case 'norespawn': r.text = 'Không bị hồi sinh'; break;
        case 'itemGet': r.text = 'Nhặt ' + n + ' hộp đạo cụ'; break;
        case 'itemHit': r.text = 'Dùng đạo cụ trúng đối thủ ' + n + ' lần'; break;
        case 'rival': r.text = 'Về trước ' + (S.NPC[L.rival.npc] || {}).name; break;
        case 'gap': r.text = 'Dẫn trước đối thủ ' + n + ' mét'; break;   // "[Vượt ải] Dẫn trước đối thủ 30 mét"
        case 'topspeed': r.text = 'Đạt ' + n + ' km/h'; break;
      }
      return r;
    });
  };

  // Số liệu của trận từ mô phỏng. c = bộ đếm do plugin ghi theo sự kiện: { itemsGot, itemHits, gap }.
  S.stats = function (R, me, c, rivalKart) {
    var s = me.stats, over = !!me.done;
    return {
      over: over, dnf: !!me.dnf, place: me.place, t: R.goT != null ? R.t - R.goT : 0, time: me.finishT,
      drifts: s.drifts, boosts: s.miniBoosts + s.nitros, wallHits: s.wallHits, respawns: s.respawns, topKmh: Math.round(s.topKmh),
      itemsGot: c.itemsGot, itemHits: c.itemHits, gap: c.gap,
      rivalAhead: !!rivalKart && over && !me.dnf && me.place < rivalKart.place,
    };
  };

  // Trạng thái một mục tiêu: { val, need, done, failed }. done chỉ chốt khi st.over (mình đã về đích), trừ nhóm đếm đạt là xong ngay.
  S.status = function (g, st) {
    var over = st.over, o = { val: 0, need: g.n, done: false, failed: false };
    if (COUNT[g.type]) {
      o.val = st[COUNT[g.type]]; o.done = o.val >= g.n; o.failed = over && !o.done;
    } else if (LIMIT[g.type]) {
      o.val = st[LIMIT[g.type]]; o.failed = o.val > g.n; o.done = over && !st.dnf && !o.failed;
    } else if (g.type === 'time') {
      o.need = g.sec; o.val = over ? st.time : st.t;
      o.failed = over ? (st.dnf || st.time == null || st.time > g.sec) : st.t > g.sec;
      o.done = over && !o.failed;
    } else if (g.type === 'place') {
      o.val = st.place; o.done = over && !st.dnf && st.place <= g.n; o.failed = over && !o.done;
    } else if (g.type === 'rival') {
      o.done = over && st.rivalAhead; o.failed = over && !o.done;
    } else if (g.type === 'gap') {
      o.val = st.gap || 0; o.done = over && !st.dnf && st.place === 1 && st.gap >= g.n; o.failed = over && !o.done;
    }
    return o;
  };

  // Chấm cả ải: met[i] cho từng mục tiêu; qua ải khi đạt mục tiêu đầu (hạng); sao = số mục tiêu đạt (0 nếu chưa qua ải).
  S.evaluate = function (goals, st) {
    var met = goals.map(function (g) { return S.status(g, st).done; });
    var cleared = !!met[0];
    return { met: met, cleared: cleared, stars: cleared ? met.filter(Boolean).length : 0 };
  };

  // ---------- thưởng ----------
  S.STAR_COINS = 40;      // chọn: xu cho mỗi sao mới đạt (lần đầu hoặc nâng thêm sao)
  // Lần đầu qua ải nhận thưởng ải; mỗi sao mới thêm STAR_COINS. Ải đã đủ sao chơi lại chỉ nhận thưởng trận thường của main.js.
  S.reward = function (L, oldStars, newStars) {
    var first = oldStars === 0 && newStars > 0, add = Math.max(0, newStars - oldStars);
    return { coins: (first ? L.coins : 0) + add * S.STAR_COINS, xp: first ? L.xp : 0, first: first, newStars: add };
  };

  // ---------- chương và ải ----------
  // Lời thoại: [npc, chữ]. pre = trước ải, win / lose = sau ải. coins/xp: chọn (150 + 30·thứ tự ải; 40 + 4·thứ tự).
  var D = S.chapters = [];
  var seq = 0;
  function chapter(title, sub, npc, reward, intro) {
    var c = { n: D.length + 1, title: title, sub: sub, npc: npc, reward: reward, intro: intro, levels: [] };
    D.push(c);
    return c;
  }
  function level(c, name, slot, laps, o) {
    var q = seq++;
    var L = {
      id: 'c' + c.n + 'l' + (c.levels.length + 1), ch: c.n, i: c.levels.length + 1, seq: q, name: name, slot: slot, laps: laps,
      karts: o.karts || 6, items: !!o.items, skill: o.skill, rival: o.rival || null, goals: o.goals,
      pre: o.pre, win: o.win, lose: o.lose, coins: 150 + 30 * q, xp: 40 + 4 * q, boss: !!o.rival && !!o.boss,
    };
    c.levels.push(L);
    return L;
  }
  var g = S.goal;

  var c1 = chapter('Tân Binh Lên Đường', 'Làm quen vô lăng, drift và phun tăng tốc.', 'quat', { coins: 600, xp: 150 },
    [['quat', 'Chào mừng đến đường đua! Chị là Tiểu Quất, sẽ kèm em vài vòng đầu.'], ['quat', 'Chạm vạch đích trước là thắng. Còn mấy ngôi sao thì... tuỳ tay lái của em.']]);
  level(c1, 'Vạch Xuất Phát', 0, 1, { karts: 4, skill: [0.25, 0.35], goals: [g.place(3), g.drifts(3), g.time(1.6)],
    pre: [['quat', 'Giữ ga ngay khi đèn xanh để lao ra cho nhanh nhé.'], ['quat', 'Nhớ, về top 3 là qua ải.']],
    win: [['quat', 'Khởi đầu tốt lắm! Qua ải sau thôi.']], lose: [['quat', 'Chưa sao, đua lại nào. Nhớ bám đường ruột.']] });
  level(c1, 'Bẻ Lái Đầu Tiên', 1, 1, { karts: 4, skill: [0.3, 0.4], goals: [g.place(2), g.drifts(6), g.nowall(3)],
    pre: [['quat', 'Vào cua thì giữ phím drift rồi bẻ lái, ra cua thì nhả ra.'], ['quat', 'Cố đừng quệt tường nhiều nhé, tường không nhường đâu.']],
    win: [['quat', 'Drift mượt đấy! Em học nhanh hơn chị tưởng.']], lose: [['quat', 'Cua gấp thì nhả ga sớm một chút, thử lại đi.']] });
  level(c1, 'Phun Nhỏ', 2, 1, { karts: 5, skill: [0.35, 0.45], goals: [g.place(3), g.boosts(4), g.time(1.45)],
    pre: [['quat', 'Thả drift đúng lúc, xe sẽ phun nhỏ một cú tăng tốc.'], ['quat', 'Bắt cho được vài cú trong một vòng xem.']],
    win: [['quat', 'Cú phun hoàn hảo rồi đó!']], lose: [['quat', 'Thả drift hơi sớm rồi, giữ lâu thêm một nhịp nữa.']] });
  level(c1, 'Không Chạm Tường', 3, 1, { karts: 5, skill: [0.4, 0.5], goals: [g.place(2), g.nowall(1), g.norespawn()],
    pre: [['quat', 'Ải này chấm điểm sạch sẽ: ít va chạm, không rơi khỏi đường.']],
    win: [['quat', 'Đường đua sạch tinh! Chị nể em đấy.']], lose: [['quat', 'Chậm mà chắc cũng được, đừng nóng.']] });
  level(c1, 'Thử Lửa', 0, 2, { karts: 6, skill: [0.4, 0.55], rival: { npc: 'rezzo', skill: 0.62 }, boss: true, goals: [g.place(3), g.rival(), g.time(1.3)],
    pre: [['rezzo', 'Nghe nói có tân binh vừa nổi? Để tôi xem thực lực thế nào.'], ['quat', 'Đó là Rezzo, tay đua lão luyện. Đừng để cậu ta bỏ xa.'], ['me', 'Em sẽ thử.']],
    win: [['rezzo', 'Hừ... Không tệ. Gặp lại ở đường khó hơn.'], ['quat', 'Chương một xong rồi! Giỏi lắm!']], lose: [['rezzo', 'Chỉ có thế thôi sao? Quay lại khi nào sẵn sàng.']] });

  var c2 = chapter('Đường Đua Nóng', 'Drift sâu, phun liên tục, đối đầu trực diện.', 'kaili', { coins: 1000, xp: 220, car: true },
    [['kaili', 'Tân binh mới nổi à? Ở đây người ta chỉ nhìn đuôi xe người dẫn đầu.'], ['quat', 'Đây là giải đấu nóng nhất mùa. Cố lên!']]);
  level(c2, 'Cua Gấp', 1, 1, { skill: [0.45, 0.55], goals: [g.place(3), g.drifts(10), g.nowall(4)],
    pre: [['kaili', 'Cua gấp là chỗ người ta bộc lộ tay nghề.']], win: [['kaili', 'Cũng biết vào cua đấy.']], lose: [['kaili', 'Phanh hơi nhiều rồi. Đã drift thì drift cho tới.']] });
  level(c2, 'Dòng Chảy', 4, 1, { skill: [0.5, 0.6], goals: [g.place(2), g.boosts(8), g.topspeed(240)],
    pre: [['xizeer', 'Phun liên tục, đừng để xe mất đà.'], ['quat', 'Hy Trạch nổi tiếng giữ tốc độ đấy, học lỏm đi.']],
    win: [['xizeer', 'Giữ đà tốt đấy.']], lose: [['xizeer', 'Xe chậm lại ở đoạn thẳng. Phun sớm hơn.']] });
  level(c2, 'Đối Đầu Song Song', 2, 2, { karts: 2, skill: [0.6, 0.6], rival: { npc: 'kaili', skill: 0.66 }, goals: [g.place(1), g.rival(), g.gap(30)],
    pre: [['kaili', 'Một chọi một. Đến cuối còn đứng trước thì mới kể chuyện được.']],
    win: [['kaili', 'Tôi thua rồi... Lần sau không dễ vậy đâu.']], lose: [['kaili', 'Chưa đủ tầm đâu, bé.']] });
  level(c2, 'Vòng Kép', 3, 2, { skill: [0.5, 0.65], goals: [g.place(3), g.time(1.3), g.drifts(16)],
    pre: [['quat', 'Hai vòng liền, giữ sức bền nhé.']], win: [['quat', 'Vòng sau còn nhanh hơn vòng đầu, hay lắm!']], lose: [['quat', 'Hơi vội ở vòng một. Bình tĩnh hơn nữa.']] });
  level(c2, 'Nước Rút', 0, 2, { skill: [0.55, 0.7], goals: [g.place(2), g.boosts(14), g.norespawn()],
    pre: [['yilian', 'Chặng cuối nước rút, ai dám bứt phá sớm?']], win: [['yilian', 'Nước rút tuyệt vời!']], lose: [['yilian', 'Thiếu một chút nữa thôi.']] });
  level(c2, 'Kazami Xuất Hiện', 1, 2, { skill: [0.55, 0.7], rival: { npc: 'kazami', skill: 0.72 }, boss: true, goals: [g.place(2), g.rival(), g.time(1.25)],
    pre: [['kazami', 'Ta là Kazami. Muốn đi tiếp thì phải bỏ ta lại phía sau.'], ['quat', 'Hắn mạnh hơn Rezzo đấy, đừng chủ quan.']],
    win: [['kazami', 'Thú vị. Chương sau mới thật sự bắt đầu.']], lose: [['kazami', 'Chưa đủ.']] });

  var c3 = chapter('Hộp Bí Ẩn', 'Chế độ đạo cụ: nhặt, bắn, né, và đừng bị bắn.', 'bsq', { coins: 1400, xp: 300 },
    [['bsq', 'Hà hà! Ta là Bác Sĩ Quái, chuyên chế tạo hộp bí ẩn đấy.'], ['bsq', 'Nhặt hộp, dùng đúng lúc. Tốc độ không phải tất cả!']]);
  level(c3, 'Hộp Đầu Tiên', 0, 1, { items: true, skill: [0.45, 0.55], goals: [g.place(3), g.itemGet(2), g.drifts(5)],
    pre: [['bsq', 'Lao qua hộp "?", rồi bấm E để dùng đạo cụ.']], win: [['bsq', 'Hà hà, đạo cụ nghe lời em đấy!']], lose: [['bsq', 'Hộp nằm đầy đường mà, sao không nhặt?']] });
  level(c3, 'Bắn Trúng', 2, 1, { items: true, skill: [0.5, 0.6], goals: [g.place(3), g.itemHit(1), g.itemGet(3)],
    pre: [['bsq', 'Nhắm kẻ đi trước mà bắn. Trúng là hắn khựng lại.']], win: [['bsq', 'Trúng phóc! Ta đã nói mà.']], lose: [['bsq', 'Đạo cụ chỉ có lợi nếu em dùng.']] });
  level(c3, 'Hỗn Chiến', 3, 2, { items: true, skill: [0.5, 0.65], goals: [g.place(2), g.itemHit(2), g.nowall(6)],
    pre: [['bsq', 'Ai cũng có đạo cụ cả. Biết khiên không?']], win: [['bsq', 'Hay! Hỗn chiến mà vẫn giữ được hạng.']], lose: [['bsq', 'Bị bắn nhiều quá. Giữ khiên lại mà dùng chứ.']] });
  level(c3, 'Thám Hiểm Kho Báu', 4, 2, { items: true, skill: [0.55, 0.7], goals: [g.place(3), g.itemGet(6), g.norespawn()],
    pre: [['bsq', 'Đường này nhiều hộp lắm, nhặt càng nhiều càng tốt.']], win: [['bsq', 'Túi đầy hộp! Ta quý em rồi.']], lose: [['bsq', 'Hộp còn thừa đấy, về thu cho hết!']] });
  level(c3, 'Ân Tả Gài Bẫy', 1, 2, { items: true, skill: [0.55, 0.7], rival: { npc: 'enzuo', skill: 0.72 }, boss: true, goals: [g.place(2), g.rival(), g.itemHit(3)],
    pre: [['enzuo', 'Chào, tân binh. Ta thích những cái bẫy thật khéo.'], ['bsq', 'Hắn là học trò cũ của ta... đừng để hắn gài bẫy nhé!']],
    win: [['enzuo', 'Em... khéo hơn ta tưởng.'], ['bsq', 'Hà hà! Qua chương ba rồi!']], lose: [['enzuo', 'Cái bẫy này ngon quá, cảm ơn.']] });

  var c4 = chapter('Đỉnh Cao Tốc Độ', 'Vòng chung kết: mọi kỹ năng đều phải dùng tới.', 'tris', { coins: 2400, xp: 450, car: true },
    [['tris', 'Em đã đi một chặng đường dài. Chỉ còn bước cuối.'], ['quat', 'Đây là giải cao nhất. Chị tin em!']]);
  level(c4, 'Giải Mùa Thu', 5, 1, { skill: [0.6, 0.75], goals: [g.place(3), g.time(1.3), g.drifts(12)],
    pre: [['tris', 'Thành Troy vào mùa gió. Đường dài, đừng mất nhịp.']], win: [['tris', 'Em đã sẵn sàng.']], lose: [['tris', 'Gió ngược đấy. Thử lại.']] });
  level(c4, 'Mưa Gió', 3, 2, { skill: [0.6, 0.78], goals: [g.place(2), g.boosts(18), g.nowall(3)],
    pre: [['xizeer', 'Hôm nay trời xấu. Ai giữ được đường, người đó thắng.']], win: [['xizeer', 'Tay lái chắc lắm.']], lose: [['xizeer', 'Mất lái rồi. Nhẹ tay hơn.']] });
  level(c4, 'Cuộc Truy Đuổi', 2, 2, { karts: 3, skill: [0.65, 0.7], rival: { npc: 'leiyin', skill: 0.78 }, goals: [g.place(1), g.rival(), g.gap(20)],
    pre: [['leiyin', 'Ba xe, một ngôi vương. Đuổi kịp tôi đi.']], win: [['leiyin', 'Vượt cả tôi... Tôi phục.']], lose: [['leiyin', 'Bóng lưng của tôi, nhìn cho kỹ nhé.']] });
  level(c4, 'Vòng Loại Cuối', 4, 2, { items: true, skill: [0.65, 0.82], goals: [g.place(2), g.itemHit(3), g.itemGet(5)],
    pre: [['bsq', 'Ta chế tạo vài thứ mới. Phải thử trên người em!']], win: [['bsq', 'Hà hà, hoàn hảo!']], lose: [['bsq', 'Bị ăn đạo cụ liên tục rồi, ta cười nhé.']] });
  level(c4, 'Hoàn Hảo', 0, 2, { skill: [0.7, 0.85], goals: [g.place(3), g.time(1.15), g.nowall(1)],
    pre: [['quat', 'Ải này chị chấm kỹ lắm: nhanh, sạch, và chắc.']], win: [['quat', 'Chị tự hào về em!']], lose: [['quat', 'Gần tới rồi. Một chút nữa thôi.']] });
  level(c4, 'Trận Chung Kết', 5, 2, { skill: [0.75, 0.9], rival: { npc: 'kuluo', skill: 0.88 }, boss: true, goals: [g.place(1), g.rival(), g.time(1.2)],
    pre: [['kuluo', 'Ta là Khô Lạc, vua của đường đua này. Đến đây là hết.'], ['tris', 'Hắn chưa từng thua. Nhưng hôm nay có em.'], ['me', 'Em sẽ thắng.']],
    win: [['kuluo', 'Ta... thua rồi sao. Ngai vàng giờ là của em.'], ['quat', 'Chúng ta làm được rồi! Hoàn thành Cốt Truyện!']], lose: [['kuluo', 'Hãy trở lại khi thật sự mạnh hơn.']] });

  S.levels = [];
  D.forEach(function (c) { c.levels.forEach(function (L) { S.levels.push(L); }); });
  S.levelById = function (id) { for (var i = 0; i < S.levels.length; i++) if (S.levels[i].id === id) return S.levels[i]; return null; };

  // ---------- tiến độ ----------
  // sv = TD.save.d.story = { stars: { <levelId>: 0..3 }, chapter, got: { <số chương>: 1 } }
  S.starsOf = function (sv, L) { return (sv.stars && sv.stars[L.id]) | 0; };
  // Ải mở khi ải liền trước (theo thứ tự toàn bộ) đã qua; ải đầu luôn mở.
  S.unlocked = function (sv, L) { return L.seq === 0 || S.starsOf(sv, S.levels[L.seq - 1]) > 0; };
  S.chapterStars = function (sv, c) { return c.levels.reduce(function (a, L) { return a + S.starsOf(sv, L); }, 0); };
  S.chapterMax = function (c) { return c.levels.reduce(function (a, L) { return a + L.goals.length; }, 0); };
  S.chapterCleared = function (sv, c) { return c.levels.every(function (L) { return S.starsOf(sv, L) > 0; }); };
  S.chapterOpen = function (sv, c) { return S.unlocked(sv, c.levels[0]); };
  // Ải tiếp theo chưa qua (để nút "Ải tiếp"): null khi đã hết.
  S.nextOf = function (L) { return S.levels[L.seq + 1] || null; };
  S.firstOpen = function (sv) {
    for (var i = 0; i < S.levels.length; i++) if (S.starsOf(sv, S.levels[i]) === 0 && S.unlocked(sv, S.levels[i])) return S.levels[i];
    return S.levels[S.levels.length - 1];
  };
})(typeof window !== 'undefined' ? window : globalThis);
