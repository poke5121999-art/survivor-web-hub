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

  function settle(save, place, n, dnf) {
    var r = save.rank = save.rank || { pts: 0, best: 0, streak: 0, games: 0, wins: 0 };
    var before = of(r.pts), win = place === 1 && !dnf;
    r.streak = win ? (r.streak || 0) + 1 : 0;
    var stars = starsFor(place, n, dnf), bonus = win && r.streak >= STREAK_FROM ? 1 : 0;
    stars += bonus;
    var t = tiers[before.tier];
    // Mỗi sao đổi bằng điểm của bậc đang đứng. Bậc thấp nhất không mất điểm (Đồng): chỉ lên, không tụt.
    var delta = stars * (t.subs ? t.starPts : TOP_STAR);
    if (before.tier === 0 && delta < 0) { delta = 0; stars = 0; }
    var pts = Math.max(0, r.pts + delta);
    r.pts = pts; r.best = Math.max(r.best || 0, pts);
    r.games = (r.games || 0) + 1; if (win) r.wins = (r.wins || 0) + 1;
    var after = of(pts);
    var hist = r.hist = r.hist || [];
    hist.unshift({ place: dnf ? 0 : place, n: n, d: pts - before.pts, s: stars, t: Date.now() });
    if (hist.length > 10) hist.length = 10;
    return {
      before: before, after: after, delta: pts - before.pts, stars: stars, streakBonus: bonus, streak: r.streak,
      promoted: after.tier > before.tier, demoted: after.tier < before.tier,
      subUp: after.tier === before.tier && after.sub > before.sub, subDown: after.tier === before.tier && after.sub < before.sub,
    };
  }

  // Kỹ năng bot: tăng theo điểm bậc từ 0,35 (Đồng) tới 0,98 (Huyền Thoại), mỗi bot lệch ±0,08.
  function botSkill(save, rng) {
    var pts = save && save.rank ? save.rank.pts : 0, r = typeof rng === 'function' ? rng() : Math.random();
    var base = 0.35 + 0.55 * Math.min(1, pts / TOP.start);
    return Math.max(0.35, Math.min(0.98, base + (r - 0.5) * 0.16 + (pts >= TOP.start ? 0.08 : 0)));
  }

  TD.RANK = { tiers: tiers, STARS: STARS, of: of, starsFor: starsFor, settle: settle, botSkill: botSkill };
})(typeof window !== 'undefined' ? window : globalThis);
