// Thú cưng pet41 (Bánh Ú Con): kỹ năng "Trưởng thành đi!" [LOC pet_41_skill_0_desc]: mỗi ván nhận ngẫu nhiên 1 vị, có hiệu ứng
// riêng suốt ván: Đậu Đỏ (Thủ, HP, Thể Hình), Trứng Muối (cắn kèm bắn thêm đạn), Nhân Thịt (bạo kích, công tốc, tốc chạy),
// Nấm Hương (cắn có xác suất gây hiệu ứng nguyên tố ngẫu nhiên). Mô tả gốc để trống các số {0}..{7} (bảng số nằm trong
// prefab/skill chưa đọc được) nên mọi con số dưới đây là [ƯỚC LƯỢNG]; còn dmg 2, atk_cd 3, max_hp 10 là [ĐO ctl / attr].
// Pet chưa có hệ máu/phòng thủ trong web nên a.hp/a.hpMax/a.armor chỉ là số liệu riêng của tệp này (thể hình thì vẽ to thật).
(function () {
  'use strict';
  if (!window.SK || !SK.petRegister) return;
  const FLAVORS = ['bean', 'egg', 'meat', 'mushroom'];
  const K = {
    armor: 2, hp: 5, size: 1.5,            // Đậu Đỏ: Thủ +2, HP +5, Thể Hình x1,5 [ƯỚC LƯỢNG]
    extraShots: 2,                          // Trứng Muối: +2 viên mỗi lần tấn công [ƯỚC LƯỢNG]
    crit: 30, atkSpd: 0.4, move: 0.3,       // Nhân Thịt: bạo +30%, công tốc +40%, tốc chạy +30% [ƯỚC LƯỢNG]
    elemChance: 0.5                         // Nấm Hương: 50% [ƯỚC LƯỢNG]
  };

  // Hiệu ứng nguyên tố lên quái: chạy qua e._db của skills.js (cùng thông số BuffFire/BuffPoison [ĐO]); băng/điện làm choáng.
  function elem(G, e, kind) {
    if (!e || e.st === 'dead' || e.st === 'spawn') return;
    if (kind === 'ice' || kind === 'ele') {
      const t = kind === 'ice' ? 2.75 : 1;
      if (e.boss) return;
      if (e.st === 'stun') e.stT = Math.max(e.stT, t); else { e.st = 'stun'; e.stT = t; }
      e._stunT = Math.max(e._stunT || 0, t);
      return;
    }
    const db = e._db = e._db || {};
    if (db[kind]) return;
    const f = kind === 'fire' ? { t: 2, dmg: 3, every: 0.5, fx: 'buff_fire' } : { t: 5, dmg: 2, every: 1, fx: 'buff_posion' };
    db[kind] = Object.assign({ tick: f.every, kind }, f);
    if (SK.vfx && SK.vfx.spawn) { try { db[kind].h = SK.vfx.spawn(G, f.fx, e.x, e.y, { follow: e, dy: -(e.hb.off[1] * e.scale), dur: f.t }); } catch (_) {} }
  }

  SK.petRegister('pet41', {
    init(G, a) {
      // Vị chọn một lần mỗi ván (G._pet41Flavor), qua ải vẫn giữ.
      const f = G._pet41Flavor && FLAVORS.indexOf(G._pet41Flavor) >= 0 ? G._pet41Flavor : (G._pet41Flavor = FLAVORS[Math.floor(SK.rand() * 4)]);
      a.flavor = f;
      a.hpMax = (a.info && a.info.attr ? a.info.attr.max_hp : 10); a.hp = a.hpMax; a.armor = 0;
      a.k = Object.assign({}, a.k);
      if (f === 'bean') { a.armor = K.armor; a.hpMax += K.hp; a.hp = a.hpMax; a.scale = K.size; }
      if (f === 'meat') { a.k.cd /= 1 + K.atkSpd; a.k.spd *= 1 + K.move; a.critPct = K.crit; }
    },
    bite(G, a, e, dmg) {
      const ang = Math.atan2(e.y - a.y, e.x - a.x);
      if (a.flavor === 'egg') {
        for (let i = 0; i < K.extraShots; i++) {
          const o = (i - (K.extraShots - 1) / 2) * 0.35;
          SK.spawnBullet86(G, 'p', 'bullet_0', a.x + a.face * 4, a.y - 8, ang + o, { dmg: a.k.dmg, repel: 1, spd: 14, h: 8, owner: a });
        }
      }
      if (a.flavor === 'meat' && SK.rand() * 100 < a.critPct) dmg *= 2;
      if (a.flavor === 'mushroom' && SK.rand() < K.elemChance) elem(G, e, ['fire', 'poison', 'ice', 'ele'][Math.floor(SK.rand() * 4)]);
      return dmg;
    },
    stage(G, a) { a.scale = a.flavor === 'bean' ? K.size : undefined; }
  });
})();
