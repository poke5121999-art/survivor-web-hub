// Cơ giáp còn lại (rev 20261010zb): m_mech_2..7, m_mech_9, m_mech_coin, m_mech_engineer, m_mecha_normal_b/d/e/2s, cộng nút Phụ của m_mech_0.
// Khung chung ở js/mounts.js (SK.mechDefs). Hình: vẽ nguyên prefab gốc `mount/<id>` bằng SK.drawPrefab (tools/extra/mech.json).
// HP, giáp, tốc lấy từ data/sk-mounts.js (prefab 8.6, khớp wiki). Vũ khí gắn: bộ đạn của vũ khí web gần nhất, số (dmg, tiêu, crit) từ prefab [PF];
// nên mô tả khác bản gốc ở chỗ cùng ghi [ƯỚC LƯỢNG] bên dưới. Nút Phụ = phím kỹ năng (đang cưỡi không dùng được kỹ năng nhân vật).
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.mechDefs) return;
  const U = SK.PPU, I = SK.input;
  const D = SK.mechDefs;

  // lift = độ nhấc người ngồi trong giáp [ƯỚC LƯỢNG, chỉnh bằng ảnh]. gun: dmg/crit/thr/cost từ prefab; base chọn theo kiểu đạn [ƯỚC LƯỢNG].
  Object.assign(D, {
    m_mech_2: { prefab: 'm_mech_2', lift: 12, guns: [{ base: 'pulse', dmg: 3, crit: 0, thr: 0, cost: 1, name: 'Laser Mạch Xung' }], extra: 'radial' },
    m_mech_3: { prefab: 'm_mech_3', lift: 12, guns: [{ base: 'bazooka', dmg: 12, crit: 0, thr: 0, cost: 3, name: 'Cannon Oanh Tạc' }] },
    m_mech_4: { prefab: 'm_mech_4', lift: 14, guns: [], turrets: [[-2.35, 34, 4], [-16.75, 15.8, 4], [13.65, 15.8, 4]] },   // 2 súng + 1 laser lơ lửng tự bắn, damage 4 [PF]
    m_mech_5: { prefab: 'm_mech_5', lift: 12, guns: [{ base: 'pincer', dmg: 10, crit: 20, thr: 0, cost: 0, name: 'Cắn' }, { base: 'rocket_fireworks', dmg: 12, crit: 0, thr: 0, cost: 4, name: 'Pháo Hoa' }] },
    m_mech_6: { prefab: 'm_mech_6', lift: 12, guns: [{ base: 'smg_m2', dmg: 2, crit: 20, thr: 0, cost: 4, name: 'Súng Đôi' }] },
    m_mech_7: { prefab: 'm_mech_7', lift: 12, guns: [{ base: 'arbitrator', dmg: 8, crit: 10, thr: 10, cost: 2, name: 'Laser Xuyên' }] },
    m_mech_9: { prefab: 'm_mech_9', lift: 14, guns: [{ base: 'broadsword', dmg: 15, crit: 20, thr: 0, cost: 0, name: 'Sừng Bọ' }] },
    m_mech_coin: { prefab: 'm_mech_coin', lift: 12, guns: [{ base: 'assault_rifle', dmg: 2, crit: 10, thr: 0, cost: 1, name: 'Súng Xu' }] },
    m_mech_engineer: { prefab: 'm_mech_engineer', lift: 12, guns: [{ base: 'm4', dmg: 3, crit: 10, thr: 10, cost: 1, name: 'Pháo Thần Lửa' }], extra: 'goodbye199' },
    m_mecha_normal_b: { prefab: 'm_mecha_normal_b', lift: 26, guns: [{ base: 'bazooka', dmg: 8, crit: 0, thr: 0, cost: 2, name: 'Đốt Cháy' }] },
    m_mecha_normal_d: { prefab: 'm_mecha_normal_d', lift: 26, guns: [{ base: 'smg_m3', dmg: 3, crit: 0, thr: 0, cost: 2, name: 'Pong Pong' }] },
    m_mecha_normal_e: { prefab: 'm_mecha_normal_e', lift: 26, guns: [{ base: 'blaster', dmg: 4, crit: 0, thr: 0, cost: 1, name: 'Hỗn Loạn' }] },
    m_mecha_normal_2s: { prefab: 'm_mecha_normal_2s', lift: 26, guns: [{ base: 'assault_sniper_rifle', dmg: 8, crit: 15, thr: 0, cost: 4, name: 'Máy Diệt Trừ' }] }
  });
  D.m_mech_0.extra = 'goodbye50';

  // ---- Nút Phụ (phím kỹ năng khi đang trong giáp). Hồi chiêu riêng theo từng giáp.
  const EXTRA = {
    // Tạm Biệt Thế Giới: tự nổ vùng 50 (Kỹ Sư 199) rồi mất giáp [WIKI Prototype Armor; data weapon.blast]; tầm 4 ô [ƯỚC LƯỢNG]
    goodbye50: { cd: 0, run(G, p) { return SK.mechSelfDestruct(G, p, 50); } },
    goodbye199: { cd: 0, run(G, p) { return SK.mechSelfDestruct(G, p, 199); } },
    // Vụ Nổ Tròn: 5 sát thương quanh giáp và xoá đạn địch trong vòng [WIKI Apocalypse]; hồi 4 s, tầm 3 ô [ƯỚC LƯỢNG]
    radial: {
      cd: 4,
      run(G, p) {
        SK.mechBlast(G, p, 5, 3);
        const r = 3 * U;
        for (let i = G.bullets.length - 1; i >= 0; i--) { const b = G.bullets[i]; if (b.side !== 'p' && (b.x - p.x) * (b.x - p.x) + (b.y - p.y) * (b.y - p.y) <= r * r) G.bullets.splice(i, 1); }
        return false;
      }
    }
  };
  const baseUpdate = SK.updatePlayer;
  SK.updatePlayer = function (G, dt) {
    const p = G.player, m = p && p.mount;
    if (m && m.mech && p.st !== 'dead') {
      m.cd = Math.max(0, (m.cd || 0) - dt);
      const C = D[m.id], X = C && EXTRA[C.extra];
      if (X && I && I.edge && I.edge.skill && m.cd <= 0) { I.hit('skill'); m.cd = X.cd; X.run(G, p); }
      if (C && C.turrets && G.phase === 'play') turrets(G, p, m, C, dt);
    }
    return baseUpdate.apply(this, arguments);
  };

  // ---- WiFi Booster: 3 súng/laser lơ lửng tự bắn quái gần nhất trong tầm 9 ô [WIKI WiFi Booster]; miễn năng lượng [ƯỚC LƯỢNG].
  function turrets(G, p, m, C, dt) {
    m.tt = (m.tt || 0) - dt; if (m.tt > 0) return;
    let best = null, bd = (9 * U) * (9 * U);
    for (const e of G.enemies || []) {
      if (!e || e.dead || e.hp <= 0) continue;
      const d = (e.x - p.x) * (e.x - p.x) + (e.y - p.y) * (e.y - p.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) { m.tt = 0.1; return; }
    m.tt = 0.4;
    for (const [px, py, dmg] of C.turrets) {
      const x = p.x + px * (p.face < 0 ? -1 : 1), y = p.y - py, a = Math.atan2(best.y - 6 - y, best.x - x);
      SK.spawnBullet86(G, 'p', 'bullet_0', x, y, a, { dmg, crit: false, repel: 1, spd: 20, h: Math.max(2, p.y - y), owner: p });
    }
  }
})();
