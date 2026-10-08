// Sảnh: gacha. Hàm thuần: ngẫu nhiên lấy từ rng truyền vào, ngày lấy từ dayIndex truyền vào (không Math.random, không Date).
// Luật đọc từ data/banners.js: tỉ lệ gốc, bảo hiểm mềm (soft) và cứng (hard), bảo hiểm 4★ (pity4), 50/50 có bảo đảm.
// Quay trùng nhân vật đã có thì đổi ra ngọc trai theo TUNING.economy.dupeRefund; owned[team][id] chỉ đếm số bản để hiện.
(function (VS) {
  'use strict';

  function banner(id) {
    var list = VS.BANNERS || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function mod(a, n) { return ((a % n) + n) % n; }
  function table(team) { return team === 'shark' ? VS.SHARKS : VS.DIVERS; }

  // Các nhân vật của một phe theo bậc sao, đúng thứ tự khai báo trong data.
  function pool(team, rarity) {
    var tb = table(team);
    return Object.keys(tb).filter(function (id) { return tb[id].rarity === rarity; });
  }

  // Nhân vật tăng tỉ lệ của ngày: một 5★ xoay từng người, hai 4★ liền nhau trong danh sách (xoay vòng) theo ngày.
  function featured(b, dayIndex) {
    var d = Math.floor(Number(dayIndex) || 0), f5 = b.featured[5], f4 = b.featured[4], two = [];
    for (var i = 0, k = Math.min(2, f4.length); i < k; i++) two.push(f4[mod(d + i, f4.length)]);
    return { 5: f5[mod(d, f5.length)], 4: two };
  }

  // Ngọc trai đổi được khi quay trúng nhân vật đã có.
  function dupeRefund(rarity) {
    var t = VS.TUNING && VS.TUNING.economy && VS.TUNING.economy.dupeRefund || {};
    return typeof t[rarity] === 'number' ? t[rarity] : 0;
  }

  // Tỉ lệ 5★ của lượt thứ k tính từ lần 5★ trước (k bắt đầu từ 1). Từ lượt soft, mỗi lượt cộng softStep.
  function rate5At(b, k) {
    if (k >= b.hard) return 1;
    var r = b.rates[5];
    if (k >= b.soft) r += (k - b.soft + 1) * b.softStep;
    return Math.min(1, r);
  }

  // Lượt sớm nhất mà 5★ chắc chắn ra. Với số hiện tại softStep đẩy tỉ lệ chạm 100% trước khi tới hard.
  function sureAt(b) {
    for (var k = 1; k < b.hard; k++) if (rate5At(b, k) >= 1) return k;
    return b.hard;
  }

  // Trung bình bao nhiêu lượt cho một 5★ (tính cả bảo hiểm), để màn gacha nói thật về tỉ lệ.
  function meanGap5(b) {
    var alive = 1, sum = 0;
    for (var k = 1; k <= b.hard; k++) { sum += alive; alive *= 1 - rate5At(b, k); }
    return sum;
  }

  function pityOf(save, b) {
    var p = save.pity || (save.pity = {});
    return p[b.id] || (p[b.id] = { n5: 0, n4: 0, guar: false });
  }

  function info(save, b) {
    var st = pityOf(save, b), sure = sureAt(b);
    return { n5: st.n5, n4: st.n4, left5: sure - st.n5, left4: b.pity4 - st.n4, guar: !!st.guar };
  }

  function pickFrom(list, rng) { return list[Math.min(list.length - 1, Math.floor(rng() * list.length))]; }

  function one(save, b, st, feat, rng) {
    var cap = VS.META;
    st.n5++; st.n4++;
    var rarity;
    if (st.n5 >= b.hard || rng() < rate5At(b, st.n5)) rarity = 5;
    else if (st.n4 >= b.pity4 || rng() < b.rates[4]) rarity = 4;
    else rarity = 3;

    var id, isFeat = false;
    if (rarity === 5) {
      st.n5 = 0; st.n4 = 0;
      var hit = st.guar || rng() < 0.5;
      var others = pool(b.team, 5).filter(function (x) { return x !== feat[5]; });
      if (hit || !others.length) { id = feat[5]; st.guar = false; }
      else { id = pickFrom(others, rng); st.guar = true; }   // trượt 50/50 thì 5★ sau chắc chắn trúng
      isFeat = id === feat[5];
    } else if (rarity === 4) {
      st.n4 = 0;
      // Nửa số 4★ lấy trong hai nhân vật đang tăng tỉ lệ; nửa kia lấy đều trong cả kho 4★ của phe
      // (nếu chỉ lấy ngoài nhóm tăng thì người "không được tăng" lại ra nhiều hơn người được tăng).
      id = rng() < 0.5 ? pickFrom(feat[4], rng) : pickFrom(pool(b.team, 4), rng);
      isFeat = feat[4].indexOf(id) >= 0;
    } else {
      id = pickFrom(pool(b.team, 3), rng);
    }

    var owned = save.owned[b.team] || (save.owned[b.team] = {});
    var have = Object.prototype.hasOwnProperty.call(owned, id) ? owned[id] : 0;
    var isNew = have === 0, refund = 0;
    if (!isNew) { refund = dupeRefund(rarity); save.pearls += refund; }
    var copies = Math.min(cap.copyCap, have + 1);
    owned[id] = copies;
    return { team: b.team, id: id, rarity: rarity, isNew: isNew, featured: isFeat, copies: copies, refund: refund };
  }

  // Quay n (1 hoặc 10) lượt. Sửa save tại chỗ (ngọc trai, kho nhân vật, bảo hiểm). Thiếu ngọc thì không đổi gì.
  function pull(save, bannerId, n, rng, dayIndex) {
    var b = banner(bannerId);
    if (!b) return { ok: false, why: 'banner' };
    if (n !== 1 && n !== 10) return { ok: false, why: 'count' };
    var cost = b.cost * n;
    if (save.pearls < cost) return { ok: false, why: 'pearls' };
    save.pearls -= cost;
    var st = pityOf(save, b), feat = featured(b, dayIndex), results = [];
    for (var i = 0; i < n; i++) results.push(one(save, b, st, feat, rng));
    return { ok: true, cost: cost, results: results };
  }

  VS.gacha = {
    banner: banner, pool: pool, featured: featured, pull: pull, info: info, dupeRefund: dupeRefund,
    rate5At: rate5At, sureAt: sureAt, meanGap5: meanGap5
  };
})(window.VS = window.VS || {});
