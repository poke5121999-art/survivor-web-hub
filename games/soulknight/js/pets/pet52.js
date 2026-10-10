// Thú cưng pet52 (Vua Người Tuyết Hỏa Lực), kỹ năng "Cháy Rụi" [LOC pet_52_skill_0_desc]: tự đốt mình, bắn lượng lớn cầu tuyết về bốn
// hướng; cầu tuyết trúng có xác suất Đóng Băng; trong lúc đó liên tục mất HP, HP cạn thì ngừng phóng. Số [ĐO ctl]: mất 5 HP/s
// (skillHpLossPerSecond), 0,075 s một lượt bắn (skillShootInterval), 9 cầu mỗi vòng (skillSnowballsPerCircle: mỗi lượt các hướng xoay
// 360/9 độ), sát thương 3 (damage), HP 20 (attr.max_hp). [ƯỚC LƯỢNG]: xác suất đóng băng 25% và 1,5 s (làm choáng như SK.stun, trừ trùm),
// bắt đầu khi HP đầy, có kẻ địch và hồi chiêu 30 s [WIKI Pets] đã hết, HP tự hồi 2/s ngoài lúc cháy, cầu tuyết 'bullet_milk_tea_ice' bay 9 đv/s sống 1,5 s.
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const U = SK.PPU, DIRS = 4, FREEZE_P = 0.25, FREEZE_T = 1.5, REGEN = 2, CD = 30;

  const foes = G => G.enemies.filter(e => e.st !== 'spawn' && e.st !== 'dead');
  SK.on('enemyHit', (G, e) => {
    const b = G._hitBullet, a = b && b.pet52;
    if (a && !e.boss && e.st !== 'dead' && SK.rand() < FREEZE_P) { e.st = 'stun'; e.stT = FREEZE_T; e._stunT = FREEZE_T; a.frozen++; }
  });

  SK.petRegister('pet52', {
    ownHp: true,   // a.hp là nhiên liệu cháy của riêng pet này, không phải máu hệ chung
    init(G, a) {
      const c = a.info.ctl;
      a.hpMax = a.hp = a.info.attr.max_hp || 20; a.burn = false; a.burnCd = 0; a.shootT = 0; a.spin = 0; a.balls = 0; a.frozen = 0;
      a.lossPs = c.skillHpLossPerSecond || 5; a.iv = c.skillShootInterval || 0.075; a.circle = c.skillSnowballsPerCircle || 9; a.dmg = c.damage || 3;
    },
    tick(G, a, dt) {
      if (!a.burn) {
        if (a.burnCd > 0) a.burnCd -= dt;
        if (a.hp < a.hpMax) a.hp = Math.min(a.hpMax, a.hp + REGEN * dt);
        if (a.burnCd > 0 || a.hp < a.hpMax || !foes(G).length) return false;
        a.burn = true; a.shootT = 0; a.stT = 0; a.st = 'pet_52_skin_0_skill';
      }
      a.stT += dt; a.hp -= a.lossPs * dt; a.shootT -= dt;
      while (a.shootT <= 0 && a.hp > 0) {
        a.shootT += a.iv; a.spin += 2 * Math.PI / a.circle;
        for (let i = 0; i < DIRS; i++) {
          const b = SK.spawnBullet86(G, 'p', 'bullet_milk_tea_ice', a.x, a.y - 8, a.spin + i * 2 * Math.PI / DIRS,
            { dmg: a.dmg, spd: 9, life: 1.5, repel: 1, owner: a, h: 8, size: 0.8 });
          b.pet52 = a; a.balls++;
        }
      }
      if (a.hp <= 0) { a.hp = 0; a.burn = false; a.burnCd = CD; a.st = 'ide'; a.stT = 0; }
      return true;
    },
    draw(ctx, G, a) {
      if (!a.burn) return;
      ctx.save(); ctx.fillStyle = 'rgba(255,120,30,' + (0.35 + 0.15 * Math.sin(a.stT * 20)) + ')';
      ctx.beginPath(); ctx.ellipse(a.x, a.y - 8, 10, 12, 0, 0, 7); ctx.fill(); ctx.restore();
    }
  });
})();
