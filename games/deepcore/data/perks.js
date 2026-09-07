/*
 * data/perks.js — bảng hiệu ứng của BÙA ĐÁ.
 *
 * Trước đây đây là bộ thẻ "lên cấp, chọn 1 trong 3". Màn chọn thẻ đã bỏ hẳn:
 * nó dừng hình quá nhiều lần một ván, và nó khiến sức mạnh trong ván không dính
 * gì tới bản đồ — cứ đủ điểm là hộp thoại bật ra, đứng ở đâu cũng vậy.
 *
 * Bảng SELF ở dưới sống tiếp, nhưng giờ là phần thưởng của hốc BÙA ĐÁ chôn dưới
 * đá: đục tới thì nhận ngay một hiệu ứng, không có ba lựa chọn nào cả. Các bảng
 * triệu hồi / lên bậc / hiến tế thì bỏ, vì hốc TỔ và hốc ĐÀI CỔ đã làm việc đó
 * theo cách gắn với chỗ đứng trên bản đồ.
 *
 * Bốn loại thẻ, và mỗi loại làm một việc khác nhau về mặt CẢM GIÁC:
 *   TRIỆU   gọi thêm một linh thú chưa có   -> mở rộng đội hình
 *   BẬC     nâng một linh thú đang có        -> đào sâu cái đang dùng
 *   NGƯỜI   buff cho chính người chơi        -> "tôi cũng đang lớn lên"
 *   HY SINH phá một linh thú, số còn lại mạnh hẳn -> một quyết định đau
 *
 * Thẻ NGƯỜI là van chống chán. Không có nó thì mọi lần lên cấp đều là "chọn con
 * nào để cộng số", và người chơi — vốn không được tự đánh — sẽ thấy mình chỉ là
 * khán giả. Chiếm khoảng một phần tư số thẻ.
 *
 * Buff CỘNG chứ không NHÂN (theo đúng DRG:Survivor). Nhân thì hai thẻ tốt gặp
 * nhau là vỡ bảng cân bằng, cộng thì đường cong còn đọc được.
 */
(function (G) {
  'use strict';

  /* Thẻ NGƯỜI. `apply(st)` sửa thẳng vào bảng chỉ số trong ván. */
  var SELF = [
    { id: 'spd', name: 'Ủng Thợ Mỏ', icon: 458, txt: '+12% tốc chạy',
      apply: function (s) { s.speed *= 1.12; } },
    { id: 'hp', name: 'Bữa Ăn Nóng', icon: 733, txt: '+25 máu tối đa, hồi đầy phần thêm',
      apply: function (s, p) { s.hp += 25; if (p) p.hp += 25; } },
    { id: 'heal', name: 'Băng Cứu Thương', icon: 733, txt: 'Hồi ngay 40% máu',
      apply: function (s, p) { if (p) p.hp = Math.min(s.hp, p.hp + s.hp * 0.4); } },
    { id: 'mine', name: 'Mài Cuốc', icon: 577, txt: '+22% tốc đào',
      apply: function (s) { s.mineRate *= 1.22; } },
    { id: 'power', name: 'Đầu Cuốc Nặng', icon: 577, txt: '+30% sức đào',
      apply: function (s) { s.minePower *= 1.30; } },
    { id: 'light', name: 'Dầu Tốt', icon: 547, txt: '+25% bán kính đèn',
      apply: function (s) { s.light *= 1.25; } },
    { id: 'near', name: 'Dây Xích Ngắn', icon: 581, txt: '+30% vùng "kề bên" — linh thú đánh mạnh hơn quanh bạn',
      apply: function (s) { s.nearR *= 1.30; } },
    { id: 'armor', name: 'Giáp Vá', icon: 455, txt: '+8% giảm sát thương',
      apply: function (s) { s.armor = Math.min(0.7, s.armor + 0.08); } },
    { id: 'xp', name: 'Sổ Ghi Mẫu', icon: 152, txt: '+20% vàng thu về',
      apply: function (s) { s.goldMul *= 1.20; } },
    { id: 'petatk', name: 'Còi Thúc', icon: 586, txt: 'Mọi linh thú +10% tốc đánh',
      apply: function (s) { s.petRate *= 1.10; } },
    { id: 'petdmg', name: 'Mài Nanh', icon: 988, txt: 'Mọi linh thú +12% sát thương',
      apply: function (s) { s.petDmg *= 1.12; } },
    { id: 'pethp', name: 'Vòng Cổ Dày', icon: 580, txt: 'Mọi linh thú +25% máu',
      apply: function (s) { s.petHp *= 1.25; } },
    { id: 'rally', name: 'Còi Bạc', icon: 587, txt: 'Nút GỌI hồi nhanh hơn 25%',
      apply: function (s) { s.rallyCd *= 0.75; } },
    { id: 'magnet', name: 'Nam Châm', icon: 532, txt: '+60% tầm hút quặng rơi',
      apply: function (s) { s.pickR *= 1.6; } },
    { id: 'revive', name: 'Đèn Dự Phòng', icon: 548, rare: true,
      txt: 'Gục một lần thì đứng dậy với 50% máu', once: true,
      apply: function (s) { s.revive = (s.revive || 0) + 1; } }
  ];

  var selfById = {};
  SELF.forEach(function (s) { selfById[s.id] = s; });

  /* Sinh 3 thẻ. Luật:
   *   - còn ô linh thú trống thì LUÔN có ít nhất 1 thẻ TRIỆU (nếu còn con chưa gọi)
   *   - khoảng 1/4 là thẻ NGƯỜI
   *   - thẻ HY SINH chỉ ló ra khi đã có >= 3 linh thú và hiếm
   */
  function roll(run, rng) {
    var out = [];
    var owned = run.pets;                       // [{id, tier}]
    var pool = run.petPool;                     // các id được phép gọi trong ván này
    var canSummon = owned.length < 6;
    var notYet = pool.filter(function (id) {
      return !owned.some(function (p) { return p.id === id; });
    });
    var upgradable = owned.filter(function (p) { return p.tier < 5; });

    function cardSummon(id) {
      var d = G.PET[id];
      return {
        kind: 'summon', id: id, name: d.name, icon: null, art: d.art,
        role: d.role,
        lines: [G.PET_FOLLOW[d.bam], G.PET_AIM[d.ngam],
                d.nhip ? ('một đòn mỗi ' + d.nhip.toFixed(2).replace('.', ',') + ' giây')
                       : 'hào quang, không ra đòn'],
        txt: d.desc
      };
    }
    function cardTier(p) {
      var d = G.PET[p.id];
      var nt = p.tier + 1;
      var gain = nt === 3 ? d.t3 : nt === 5 ? d.t5
        : '+' + Math.round((G.PET_TIER[nt - 1].dmg / G.PET_TIER[nt - 2].dmg - 1) * 100) +
          '% sát thương, +' +
          Math.round((G.PET_TIER[nt - 1].hp / G.PET_TIER[nt - 2].hp - 1) * 100) + '% máu';
      return {
        kind: 'tier', id: p.id, name: d.name, art: d.art, role: 'Bậc ' + nt,
        big: nt === 3 || nt === 5,
        lines: [gain], txt: ''
      };
    }
    function cardSelf(s) {
      return { kind: 'self', id: s.id, name: s.name, icon: s.icon,
               role: 'Người thợ', lines: [s.txt], txt: '' };
    }

    // 1) một thẻ triệu nếu còn chỗ và còn con chưa gọi
    if (canSummon && notYet.length) {
      out.push(cardSummon(rng.pick(notYet)));
    }
    // 2) lấp phần còn lại
    var guard = 0;
    while (out.length < 3 && guard++ < 40) {
      var r = rng.next();
      var c = null;
      if (r < 0.26 || !upgradable.length) {
        var avail = SELF.filter(function (s) {
          if (s.rare && rng.next() > 0.25) return false;
          if (s.once && run.taken[s.id]) return false;
          return true;
        });
        if (avail.length) c = cardSelf(rng.pick(avail));
      } else if (r < 0.94) {
        c = cardTier(rng.pick(upgradable));
      } else if (owned.length >= 3) {
        var victim = rng.pick(owned);
        c = { kind: 'sacrifice', id: victim.id, name: 'Hy Sinh: ' + G.PET[victim.id].name,
              art: G.PET[victim.id].art, role: 'Đánh đổi', big: true,
              lines: ['Phá con này. Mọi linh thú còn lại +35% sát thương tới hết ván.'],
              txt: '' };
      } else {
        c = cardTier(rng.pick(upgradable));
      }
      if (!c) continue;
      // không trùng thẻ trong cùng một lượt
      var dup = out.some(function (o) { return o.kind === c.kind && o.id === c.id; });
      if (!dup) out.push(c);
    }
    return out;
  }

  G.PERK_SELF = SELF;
  G.PERK_SELF_BY = selfById;
  G.rollPerks = roll;
})(window.DC = window.DC || {});
