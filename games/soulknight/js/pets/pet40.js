// Thú cưng pet40 (Búa Nhỏ / Hammery): "Búa Nhỏ đánh bạn đây!" — đòn tấn công có xác suất làm choáng kẻ địch [LOC pet_40_skill_0_desc].
// Mỗi cú cắn có 35% [ƯỚC LƯỢNG] thành đòn búa: sát thương skillDamage 12 [ĐO Pet40Controller.skillDamage] thay cho damage 3,
// hồi chiêu 5 s giữa hai lần choáng [WIKI Pets]; quái bị choáng 1,5 s [ƯỚC LƯỢNG] (e.st = 'stun' ép lại mỗi khung vì không phải AI nào của lõi cũng tự giữ choáng; hết hạn về 'idle').
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const CHANCE = 0.35, STUN = 1.5, CD = 5;   // CD 5 s giữa hai đòn búa [WIKI Pets]

  SK.petRegister('pet40', {
    init(G, a) {
      const m = ((a.parts[0] || {}).mbs || {}).Pet40Controller || {};
      a.skillDmg = m.skillDamage || 12; a.stuns = 0; a.hamCd = 0; a.bites = 0; a.stunE = null;
    },
    bite(G, a, e, dmg) {
      a.bites++;
      if (a.hamCd > 0 || SK.rand() >= (a.chance != null ? a.chance : CHANCE)) return dmg;
      a.stuns++; a.stunE = e; a.hamCd = CD;
      const L = a.stunList || (a.stunList = []), z = L.find(q => q.e === e);
      if (z) z.t = STUN; else L.push({ e, t: STUN });
      if (e.st !== 'dead' && e.st !== 'spawn') { e.st = 'stun'; e.stT = Math.max(e.stT || 0, 0.2); }
      return a.skillDmg;
    },
    tick(G, a, dt) {
      if (a.hamCd > 0) a.hamCd -= dt;
      // giữ trạng thái choáng suốt STUN giây (AI nào không tự đếm stT thì ta ép lại mỗi khung), hết hạn thì trả về idle
      const L = a.stunList || (a.stunList = []);
      for (let i = L.length - 1; i >= 0; i--) {
        const z = L[i]; z.t -= dt;
        if (z.e.st === 'dead') { L.splice(i, 1); continue; }
        if (z.t > 0) { if (z.e.st !== 'spawn') { z.e.st = 'stun'; z.e.stT = Math.max(z.e.stT || 0, 0.2); } }
        else { if (z.e.st === 'stun') z.e.st = 'idle'; L.splice(i, 1); }
      }
      return false;
    }
  });
})();
