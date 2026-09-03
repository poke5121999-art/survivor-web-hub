/*
 * SlimeClash — kinh tế. Bản cài đặt của _research/economy-design.md.
 *
 * LUẬT XƯƠNG SỐNG (mục 6.1 của tài liệu đó):
 *   1. Vàng và mảnh hero từ MỌI nguồn — kể cả gói miễn phí — đều đi qua trần chương
 *      coin_max / hero_card_max [APK]. Không có đường vòng.
 *   2. Một ngân sách "Phiếu Ưu Đãi" chung cho cả ngày thay chỗ của tiền thật.
 *   3. Chuỗi gói mở theo TIẾN TRÌNH (số chương đã qua), không theo việc mua bậc trước.
 *
 * Vì sao phải có ba luật này: bỏ giá đi thì gói chỉ còn cooldown chặn, mà cooldown gốc
 * cho phép ~276 lượt mở gói/ngày. Đường cong độ khó chỉ là x1.15/ngày, nên không chặn
 * là game sụp trong một buổi.
 */
(function (root) {
  'use strict';

  var CFG = root.CFG || require('./config.js');

  function todayStamp() {
    var d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }

  function Economy(state) {
    this.s = state;
  }

  // Gọi mỗi lần vào game / đổi ngày: nạp lại ngân sách ngày.
  Economy.prototype.rollDaily = function () {
    var t = todayStamp();
    if (this.s.dailyStamp === t) return false;
    this.s.dailyStamp = t;
    this.s.tickets = CFG.economy.ticketsPerDay;
    this.s.gemToday = 0;
    this.s.heroPackToday = 0;
    this.s.epicPackToday = 0;
    this.s.lowGoldPackToday = 0;
    this.s.winBoxToday = 0;
    this.s.preBoostToday = 0;
    this.s.reviveAdToday = 0;
    return true;
  };

  // --- trần theo chương ---------------------------------------------------

  Economy.prototype.goldRoom = function () {
    return Math.max(0, CFG.coinMaxFor(this.s.chapter) - (this.s.chapterGold || 0));
  };
  Economy.prototype.cardRoom = function () {
    return Math.max(0, CFG.cardMaxFor(this.s.chapter) - (this.s.chapterCards || 0));
  };

  /*
   * Cộng tài nguyên. Trả về số THỰC SỰ nhận được sau khi cắt theo trần — người gọi
   * phải dùng số trả về để hiển thị, đừng dùng số yêu cầu.
   */
  Economy.prototype.grant = function (r) {
    var got = { gold: 0, gem: 0, shard: 0, capped: [] };

    if (r.gold) {
      var g = Math.min(r.gold, this.goldRoom());
      if (g < r.gold) got.capped.push('vàng');
      this.s.gold += g; this.s.chapterGold = (this.s.chapterGold || 0) + g;
      got.gold = g;
    }
    if (r.shard) {
      var c = Math.min(r.shard, this.cardRoom());
      if (c < r.shard) got.capped.push('mảnh hero');
      this.s.shards += c; this.s.chapterCards = (this.s.chapterCards || 0) + c;
      got.shard = c;
    }
    if (r.gem) {
      var room = Math.max(0, CFG.economy.gemCapPerDay - (this.s.gemToday || 0));
      var m = Math.min(r.gem, room);
      if (m < r.gem) got.capped.push('kim cương (trần ngày)');
      this.s.gem += m; this.s.gemToday = (this.s.gemToday || 0) + m;
      got.gem = m;
    }
    return got;
  };

  // Sang chương mới thì reset bộ đếm trần.
  Economy.prototype.enterChapter = function (n) {
    this.s.chapter = n;
    this.s.chapterGold = 0;
    this.s.chapterCards = 0;
  };

  // --- gói ----------------------------------------------------------------

  /*
   * Danh mục gói. `sku` là tên thật lấy từ App Store/Google Play của Slime Legion
   * (_research/wiki-gacha-packs.md) — giữ lại để người chơi nhận ra "gói này to cỡ nào".
   * `price` là giá gốc, CHỈ để gạch ngang hiển thị. Mua luôn miễn phí.
   */
  var PACKS = [
    { id: 'newbie', sku: 'NEVERGIVEUPGIFT_V1', name: 'Gói Tân Thủ', price: 0.99,
      reward: { gold: 500, gem: 30, shard: 5 }, once: true, ticket: false },
    { id: 'small', sku: 'SAMLLPACK_V2', name: 'Gói Nhỏ', price: 4.99,
      reward: { gold: 400, gem: 20 }, ticket: true },
    { id: 'supply', sku: 'SUPPLYPACK_V2', name: 'Gói Tiếp Tế', price: 9.99,
      reward: { gold: 900, gem: 40, shard: 6 }, ticket: true },
    { id: 'expert', sku: 'EXPERTGIFTPACK_V2_1', name: 'Gói Cao Thủ', price: 14.99,
      reward: { gold: 1200, gem: 60, shard: 10 }, ticket: true, minChapter: 3 },
    { id: 'extreme', sku: 'EXTREMEGIFTPACK_V2', name: 'Gói Tối Thượng', price: 19.99,
      reward: { gold: 1800, gem: 80, shard: 15 }, ticket: true, minChapter: 6 },
    { id: 'growth', sku: 'GROWTH_FUND', name: 'Quỹ Phát Triển', price: 6.99,
      reward: { gold: 700, gem: 50 }, ticket: true },
    { id: 'bp', sku: 'BATTLEPASS', name: 'Battle Pass', price: 11.99,
      reward: { gold: 1000, gem: 60, shard: 8 }, ticket: true }
  ];

  Economy.prototype.packs = function () {
    var s = this.s, self = this;
    return PACKS.map(function (p) {
      var reason = null;
      if (p.once && s.boughtOnce && s.boughtOnce.indexOf(p.id) >= 0) reason = 'đã nhận';
      else if (p.minChapter && s.chapter < p.minChapter) reason = 'mở ở chương ' + p.minChapter;
      else if (p.ticket && s.tickets <= 0) reason = 'hết phiếu hôm nay';
      return { def: p, available: !reason, reason: reason };
    });
  };

  Economy.prototype.buyPack = function (id) {
    var entry = this.packs().filter(function (e) { return e.def.id === id; })[0];
    if (!entry || !entry.available) return { ok: false, reason: entry ? entry.reason : 'không có gói' };
    var p = entry.def;
    if (p.ticket) this.s.tickets--;
    if (p.once) {
      this.s.boughtOnce = this.s.boughtOnce || [];
      this.s.boughtOnce.push(p.id);
    }
    return { ok: true, got: this.grant(p.reward), pack: p };
  };

  /*
   * Gói kích theo hành vi — giữ nguyên trigger của bản gốc [APK], đổi phần thanh toán.
   *   - thua 3 lần liên tiếp  -> gói trợ giúp, MIỄN PHÍ, không tốn phiếu (chống ức chế)
   *   - thiếu vàng            -> tối đa 2 lần/ngày, tốn 1 phiếu
   */
  Economy.prototype.triggeredOffer = function () {
    var s = this.s;
    if ((s.lossStreak || 0) >= CFG.economy.failPackAfterLosses && !s.failPackClaimed) {
      return {
        id: 'fail', name: 'Gói Gượng Dậy', free: true,
        desc: 'Thua ' + s.lossStreak + ' lần liên tiếp. Nhận miễn phí, không tốn phiếu.',
        reward: { gold: 600, gem: 30, shard: 4 }
      };
    }
    if (s.gold < 200 && (s.lowGoldPackToday || 0) < CFG.economy.lowGoldPackPerDay) {
      return {
        id: 'lowgold', name: 'Gói Cứu Vàng', free: false,
        desc: 'Đang thiếu vàng. Tốn 1 phiếu, còn ' +
              (CFG.economy.lowGoldPackPerDay - (s.lowGoldPackToday || 0)) + ' lần hôm nay.',
        reward: { gold: 500 }
      };
    }
    return null;
  };

  Economy.prototype.claimOffer = function () {
    var o = this.triggeredOffer();
    if (!o) return { ok: false };
    if (!o.free) {
      if (this.s.tickets <= 0) return { ok: false, reason: 'hết phiếu hôm nay' };
      this.s.tickets--;
      this.s.lowGoldPackToday = (this.s.lowGoldPackToday || 0) + 1;
    } else {
      this.s.failPackClaimed = true;
    }
    return { ok: true, got: this.grant(o.reward), offer: o };
  };

  // --- thưởng sau trận ----------------------------------------------------

  /*
   * [APK] ChapterBoxConfig: mốc ngày 5 cho vàng, ngày 10 cho kim cương + hero.
   * [APK] ChapterWave: total_exp 100 -> 550 tăng dần, card_count 1 mảnh/ngày.
   */
  Economy.prototype.battleReward = function (day, won) {
    if (!won) return this.grant({ gold: 20 });
    var base = { gold: 60 + day * 12, shard: 1 };
    var milestone = CFG.economy.dayRewards[day];
    if (milestone) {
      base.gold = (base.gold || 0) + (milestone.gold || 0);
      base.gem = (base.gem || 0) + (milestone.gem || 0);
      base.shard = (base.shard || 0) + (milestone.shard || 0);
    }
    return this.grant(base);
  };

  Economy.prototype.canWinBox = function () {
    return (this.s.winBoxToday || 0) < CFG.economy.winBoxPerDay;
  };
  Economy.prototype.claimWinBox = function () {
    if (!this.canWinBox()) return { ok: false };
    this.s.winBoxToday = (this.s.winBoxToday || 0) + 1;
    return { ok: true, got: this.grant({ gold: 150, gem: 5 }) };
  };

  root.SlimeEconomy = { Economy: Economy, PACKS: PACKS, todayStamp: todayStamp };
  if (typeof module === 'object' && module.exports) module.exports = root.SlimeEconomy;
})(typeof window !== 'undefined' ? window : globalThis);
