// Xếp hạng: bậc, bậc phụ, sao, cộng/trừ sao theo hạng về đích, kỹ năng bot theo bậc. Thuần JS (chạy được trong Node).
//
// Game gốc (X.Hạng-Tốc Độ, chuỗi 3e677851) có các bậc Đồng → Bạch Ngân → Vàng → Bạch Kim → Kim Cương → Vua Xe → Siêu Đẳng
// → Huyền Thoại; bậc có số phụ (Đồng IV, Vàng VI, Bạch Kim III, Vua Xe Vinh Quang V) và sao. APK không có bảng điểm
// (nằm trên máy chủ), nên mọi con số dưới đây là tự chọn, chỉ giữ hai điểm tựa quan sát được: thứ tự bậc theo chuỗi gốc và
// ngưỡng 300 điểm lên Huyền Thoại trong clip (299 → 300, OHonpASPNZo t=486..492).
(function (G) {
  var TD = G.TD = G.TD || {};

  // subs = số bậc phụ; w = số điểm của một bậc phụ (5 sao mỗi bậc phụ, 1 sao = w/5 điểm).
  // chọn: bậc cao rộng hơn để leo chậm dần; tổng 4·5 + 4·5 + 6·5 + 5·10 + 5·10 + 5·10 + 4·20 = 300 đúng ngưỡng của clip.
  // Số bậc phụ theo chuỗi gốc: Vàng tới VI, Kim Cương/Vua Xe tới V. badge = mã tệp art/rank/ (id_rank_<mã> trong uitextures/id_rank).
  var DEF = [
    { id: 'qt', name: 'Đồng', subs: 4, w: 5 },        // 热血青铜
    { id: 'by', name: 'Bạch Ngân', subs: 4, w: 5 },   // 不屈白银
    { id: 'hj', name: 'Vàng', subs: 6, w: 5 },        // 疾风黄金
    { id: 'bj', name: 'Bạch Kim', subs: 5, w: 10 },   // 尊贵铂金
    { id: 'zs', name: 'Kim Cương', subs: 5, w: 10 },  // 钻石
    { id: 'xy', name: 'Vua Xe', subs: 5, w: 10 },     // 荣耀车神
    { id: 'zq', name: 'Siêu Đẳng', subs: 4, w: 20 },  // 最强车神
    { id: 'cq', name: 'Huyền Thoại', subs: 0, w: 0 }, // bậc cuối, không chia bậc phụ (clip: huy hiệu vàng-đen sau Siêu Đẳng)
  ];
  var STARS = 5, ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];

  var tiers = [], at = 0;
  DEF.forEach(function (t, i) {
    var o = { idx: i, id: t.id, name: t.name, subs: t.subs, w: t.w, starPts: t.w / STARS, start: at, badge: 'art/rank/rank_' + t.id + '.webp' };
    at += t.subs * t.w;
    o.end = t.subs ? at : Infinity;
    tiers.push(o);
  });
  var TOP = tiers[tiers.length - 1];
  var TOP_STAR = 4;   // chọn: Huyền Thoại không chia bậc phụ, đổi sao theo mức của Siêu Đẳng (4 điểm/sao)

  function of(pts) {
    pts = Math.max(0, Math.floor(pts || 0));
    var t = tiers[0];
    for (var i = tiers.length - 1; i >= 0; i--) if (pts >= tiers[i].start) { t = tiers[i]; break; }
    if (!t.subs) return { tier: t.idx, tierName: t.name, name: t.name, sub: 0, subLabel: '', stars: 0, maxStars: 0, badge: t.badge, pts: pts, top: true, inSub: 0, subW: 0, toNext: 0, nextName: null };
    var into = pts - t.start, sub = Math.floor(into / t.w), inSub = into - sub * t.w;
    var last = sub === t.subs - 1, nxt = last ? tiers[t.idx + 1] : null;
    return {
      tier: t.idx, tierName: t.name, name: t.name + ' ' + ROMAN[sub + 1], sub: sub + 1, subLabel: ROMAN[sub + 1],
      stars: Math.floor(inSub / t.starPts), maxStars: STARS, badge: t.badge, pts: pts, top: false, inSub: inSub, subW: t.w,
      toNext: t.w - inSub, nextName: nxt ? nxt.name : t.name + ' ' + ROMAN[sub + 2],
    };
  }

  // Sao đổi theo hạng: hạng nửa trên thắng sao, nửa dưới mất sao, trải đều từ +3 đến −3. Về hạng nhất lần thứ 3 liên tiếp
  // trở đi thưởng thêm 1 sao. Hết giờ (không về đích) tính như bét bảng. chọn: cả bảng không có số thật, giữ cân bằng:
  // người chơi ngang tài (hạng giữa) đứng yên, thắng nhiều thì lên.
  var MAX_STARS_GAIN = 3, STREAK_FROM = 3;
  function starsFor(place, n, dnf) {
    if (dnf) return -MAX_STARS_GAIN;
    if (n < 2) return 0;
    var mid = (n + 1) / 2;
    return Math.round((mid - place) / (mid - 1) * MAX_STARS_GAIN);
  }

  // ---------- mùa giải (tháng dương lịch, giờ máy) ----------
  // chọn: APK chỉ có chuỗi mùa (Bậc đầu mùa giải S1 13cfe95c, Mùa giải kết thúc còn 21c8c959), thời lượng nằm trên máy chủ:
  // mỗi mùa một tháng, S1 = tháng 10/2026 (ngày làm bản web). Cuối mùa phát thưởng theo bậc CAO NHẤT (406a75f0) rồi kéo
  // điểm về đầu bậc liền dưới bậc đang đứng (6e3a831e: "căn cứ biểu hiện mùa trước, tạo lại bậc ban đầu").
  var S1 = { y: 2026, m: 9 };
  function seasonOf(now) { return Math.max(1, (now.getFullYear() - S1.y) * 12 + now.getMonth() - S1.m + 1); }
  function seasonLeft(now) {
    var ms = new Date(now.getFullYear(), now.getMonth() + 1, 1) - now;
    return { ms: ms, days: Math.floor(ms / 864e5), hours: Math.floor(ms % 864e5 / 36e5) };
  }
  var SEASON_COINS = 400, SEASON_XU = 25;   // chọn: thưởng mỗi bậc = 400 xu và 25 Xu Xếp Hạng nhân (chỉ số bậc + 1)

  // Chuyển mùa: trả thưởng mùa cũ (và áp vào bản lưu) hoặc null. Bản lưu chưa có mùa thì nhận mùa hiện tại, không thưởng.
  function rollover(save, now) {
    now = now || new Date();
    var r = rankOf(save), s = seasonOf(now);
    if (!r.season) { r.season = s; return null; }
    if (r.season >= s) return null;
    var peak = of(r.best), cur = of(r.pts);
    var rw = { season: r.season, tier: peak.tier, name: peak.name, badge: peak.badge, coins: SEASON_COINS * (peak.tier + 1), xu: SEASON_XU * (peak.tier + 1) };
    save.coins = (save.coins || 0) + rw.coins; r.xu += rw.xu;
    r.pts = r.best = tiers[Math.max(0, cur.tier - 1)].start;
    rw.start = of(r.pts).name;
    r.streak = 0; r.series = null; r.season = s; r.last = { s: rw.season, tier: rw.tier, coins: rw.coins, xu: rw.xu };
    return rw;
  }

  // ---------- khung giờ không mất điểm và thưởng 3 trận đầu ngày ----------
  // src: chuỗi 1c31755f "Đua Xếp Hạng không mất điểm mở: 20:00-22:00" (giờ máy), 1755b612 "3 trận đầu Đua Xếp Hạng mỗi ngày".
  var NOLOSS = [20, 22], DAILY_N = 3;
  function noLoss(now) { var h = (now || new Date()).getHours(); return h >= NOLOSS[0] && h < NOLOSS[1]; }
  function dayKey(now) { return now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate(); }
  function dailyLeft(save, now) { var r = rankOf(save); return r.day === dayKey(now || new Date()) ? Math.max(0, DAILY_N - r.dn) : DAILY_N; }

  // Xu Xếp Hạng mỗi trận theo hạng (chọn), trận 3 đầu ngày nhân đôi và được +1 sao nếu trận đó có sao dương.
  var XU_PLACE = [3, 20, 16, 12, 8, 6, 4], XU_SERIES_WIN = 30;   // [0] = hết giờ; 30 = thưởng thắng Vòng Trong (chọn)

  // ---------- Vòng Trong (晋级赛, 436d39fc) ----------
  // Chạm đỉnh bậc (điểm vượt ranh giới sang bậc lớn kế) thì điểm dừng ở đỉnh bậc và mở Vòng Trong: thắng SERIES_WIN trận trong tối
  // đa SERIES_OF trận (thắng = về top nửa bảng, 6 xe → top 3) thì lên bậc ("Tăng cấp thành công" aab732ea); thua SERIES_LOSE
  // trận thì "Tăng cấp thất bại" (f0d9d00c) và mất SERIES_DROP sao. Số trận/sao do chọn (APK không có luật, nằm ở máy chủ).
  var SERIES_WIN = 2, SERIES_OF = 3, SERIES_LOSE = SERIES_OF - SERIES_WIN + 1, SERIES_DROP = 2;

  // Xu Xếp Hạng / khiên: cửa hàng nhỏ. effect áp thẳng vào bản lưu; chọn hết (không có bảng giá trong APK).
  var SHOP = [
    { id: 'coin1', name: 'Túi Xu', desc: '+1.000 xu', cost: 20, coins: 1000 },
    { id: 'coin2', name: 'Rương Xu', desc: '+5.000 xu', cost: 80, coins: 5000 },
    { id: 'xp', name: 'Sách Kinh Nghiệm', desc: '+300 XP', cost: 30, xp: 300 },
    { id: 'shield', name: 'Khiên Giữ Sao', desc: 'Trận thua kế tiếp không mất sao (tối đa 3)', cost: 40, shield: 1 },
  ];
  var MAX_SHIELD = 3;
  function buy(save, id) {
    var r = rankOf(save), it = null;
    SHOP.forEach(function (x) { if (x.id === id) it = x; });
    if (!it) return { ok: false, why: 'không có món "' + id + '"' };
    if (r.xu < it.cost) return { ok: false, why: 'không đủ Xu Xếp Hạng: cần ' + it.cost + ', còn ' + r.xu };
    if (it.shield && r.shield >= MAX_SHIELD) return { ok: false, why: 'đã đủ ' + MAX_SHIELD + ' khiên' };
    r.xu -= it.cost;
    if (it.coins) save.coins = (save.coins || 0) + it.coins;
    if (it.xp) save.xp = (save.xp || 0) + it.xp;
    if (it.shield) r.shield += it.shield;
    return { ok: true, item: it };
  }

  function rankOf(save) {
    var r = save.rank = save.rank || {};
    ['pts', 'best', 'streak', 'games', 'wins', 'xu', 'shield', 'dn'].forEach(function (k) { r[k] = Math.max(0, Math.floor(Number(r[k]) || 0)); });
    return r;
  }

  function settle(save, place, n, dnf, now) {
    now = now || new Date();
    var r = rankOf(save), season = rollover(save, now);
    var before = of(r.pts), win = place === 1 && !dnf;
    r.streak = win ? r.streak + 1 : 0;
    var t = tiers[before.tier], unit = t.subs ? t.starPts : TOP_STAR;
    // Thưởng 3 trận đầu ngày.
    var key = dayKey(now);
    if (r.day !== key) { r.day = key; r.dn = 0; }
    var first = r.dn < DAILY_N; r.dn++;
    var xu = (dnf ? XU_PLACE[0] : XU_PLACE[place] || XU_PLACE[0]) * (first ? 2 : 1);
    var out = { series: null, seriesOpened: false, failed: false, shield: false, noLoss: noLoss(now), daily: first, dailyStar: 0, season: season };
    var stars = 0, pts = r.pts, promoted = false, wasSeries = !!(r.series && r.series.tier === before.tier && pts === t.end - 1);
    if (!wasSeries) r.series = null;

    if (wasSeries) {
      var s = r.series, good = !dnf && place <= Math.ceil(n / 2);
      s.r.push(good ? 1 : 0);
      var w = s.r.filter(Boolean).length, l = s.r.length - w;
      out.series = { good: good, wins: w, losses: l, need: SERIES_WIN, of: SERIES_OF, done: false };
      if (w >= SERIES_WIN) {
        pts = tiers[t.idx + 1].start; promoted = true; r.series = null; out.series.done = 'win'; xu += XU_SERIES_WIN;
      } else if (l >= SERIES_LOSE) {
        var drop = out.noLoss ? 0 : SERIES_DROP;   // khung không mất điểm: vẫn trượt vòng nhưng không mất sao
        pts = t.end - 1 - drop * t.starPts; r.series = null; out.failed = true; out.series.done = 'lose'; stars = -drop;
      }
    } else {
      stars = starsFor(place, n, dnf);
      if (win && r.streak >= STREAK_FROM) stars += 1;
      if (first && stars > 0) { stars += 1; out.dailyStar = 1; }
      if (stars < 0 && (out.noLoss || before.tier === 0)) stars = 0;   // Đồng không mất điểm (chọn); khung 20:00-22:00 không trừ
      if (stars < 0 && r.shield > 0) { r.shield--; stars = 0; out.shield = true; }
      pts = Math.max(0, r.pts + stars * unit);
      if (t.subs && pts >= t.end) {   // chạm đỉnh bậc: dừng ở đỉnh, mở Vòng Trong
        pts = t.end - 1; stars = Math.round((pts - r.pts) / unit);
        r.series = { tier: t.idx, r: [] }; out.seriesOpened = true;
      }
    }
    var bonus = win && r.streak >= STREAK_FROM && !wasSeries ? 1 : 0;
    r.xu += xu;
    r.pts = pts; r.best = Math.max(r.best, pts);
    r.games++; if (win) r.wins = (r.wins || 0) + 1;
    var after = of(pts);
    var hist = r.hist = r.hist || [];
    hist.unshift({ place: dnf ? 0 : place, n: n, d: pts - before.pts, s: stars, t: now.getTime() });
    if (hist.length > 10) hist.length = 10;
    out.before = before; out.after = after; out.delta = pts - before.pts; out.stars = stars; out.streakBonus = bonus; out.streak = r.streak; out.xu = xu;
    out.promoted = promoted || after.tier > before.tier;
    out.demoted = after.tier < before.tier;
    out.subUp = after.tier === before.tier && after.sub > before.sub;
    out.subDown = after.tier === before.tier && after.sub < before.sub;
    return out;
  }

  // Kỹ năng bot: tăng theo điểm bậc từ 0,35 (Đồng) tới 0,98 (Huyền Thoại), mỗi bot lệch ±0,08.
  function botSkill(save, rng) {
    var pts = save && save.rank ? save.rank.pts : 0, r = typeof rng === 'function' ? rng() : Math.random();
    var base = 0.35 + 0.55 * Math.min(1, pts / TOP.start);
    return Math.max(0.35, Math.min(0.98, base + (r - 0.5) * 0.16 + (pts >= TOP.start ? 0.08 : 0)));
  }

  TD.RANK = {
    tiers: tiers, STARS: STARS, of: of, starsFor: starsFor, settle: settle, botSkill: botSkill,
    seasonOf: seasonOf, seasonLeft: seasonLeft, rollover: rollover, noLoss: noLoss, NOLOSS: NOLOSS, dailyLeft: dailyLeft, DAILY_N: DAILY_N,
    SERIES_WIN: SERIES_WIN, SERIES_OF: SERIES_OF, SERIES_LOSE: SERIES_LOSE, SERIES_DROP: SERIES_DROP, SHOP: SHOP, MAX_SHIELD: MAX_SHIELD, buy: buy, rankOf: rankOf,
  };
})(typeof window !== 'undefined' ? window : globalThis);
