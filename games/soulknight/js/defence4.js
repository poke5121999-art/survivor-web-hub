// Thần Điện Thủ Hộ đợt 5 (games/soulknight): trùm sóng thật + Tàu Ngoài Hành Tinh 12-3. Chạy sau js/defence.js (lõi), defence2/3.
// [WIKI Origin "Wave Defense"] Đợt Trùm 3-3 / 6-3 / 9-3 / 12-3: ba trùm vùng Tàu Vũ Trụ lần lượt Đĩa Nổi Laser (boss21), Zulan Khổng Lồ (boss06),
// Thủ Lĩnh Wackern (boss05), rồi ở 12-3 là Tàu Ngoài Hành Tinh (boss_alien_ship, js/bosses/boss_alien_ship.js). AI các trùm là AI trùm thường
// (js/bosses/*.js), ở đây chỉ sinh đúng loại ở đúng chặng, cho đi dần về Đá Phép, nối với đường thắng của Thần Điện.
// Số không có trong nguồn ghi [ƯỚC LƯỢNG]: tốc tiến về Đá Phép (C.bossAdvance), sát thương đạn trùm lên tháp.
(function () {
  'use strict';
  const SK = window.SK, Df = SK && SK.defence;
  if (!Df) return;
  const C = Df.C;
  const on = G => G && G.mode === 'defence' && G.defence;

  // chặng -> trùm sóng [WIKI Origin "Wave Defense": "Floating Laser UFO, Zulan The Colossus, Varkolyn Leader, in that order"; 12-3 Alien Aircraft Carrier]
  const C4 = Df.C4 = { boss: { 3: 'boss21', 6: 'boss06', 9: 'boss05', 12: 'boss_alien_ship' } };

  // ---- đợt trùm: thay Phi Thuyền thường (e_alien03) bằng trùm thật
  const wl0 = Df.waveList;
  Df.waveList = function (G, zone, wave) {
    const list = wl0.call(this, G, zone, wave), id = C4.boss[zone];
    if (id && SK.CUSTOM_ENEMIES[id]) for (const q of list) if (q.boss) q.id = id;
    return list;
  };

  // ---- trùm sóng sinh ở cổng đỏ, đi dần về Đá Phép (AI trùm vẫn chạy trong sàn đấu của nó), không bị khoá giới thiệu khi bật Bỏ qua cốt truyện
  for (const id of [C4.boss[3], C4.boss[6], C4.boss[9]]) {
    const f = SK.CUSTOM_ENEMIES[id]; if (!f) continue;
    SK.CUSTOM_ENEMIES[id] = (G, x, y, room) => {
      const e = f(G, x, y, room);
      if (!on(G) || G.defence.phase !== 'fight') return e;
      e.x = x; e.y = y; e.lastX = x; e.lastY = y;
      e.def = Object.create(e.def, { walk: { value: false } });   // trùm không lang thang: rush() của lõi dẫn nó về phía Đá Phép
      e.dwaveBoss = true;
      if (Df.skipPlot) { e.arena.introT = 99; e.st = 'idle'; e.stT = 0; e.cd = 1.5; }   // Bỏ qua cốt truyện: không màn giới thiệu [WIKI Origin]
      return e;
    };
  }

  // ---- tháp bị đòn của trùm: đạn, tia, nổ
  Df.hurtTower = function (G, a, dmg) {
    if (!a || a.dead) return 0;
    const dm = Df.shieldAbsorb ? Df.shieldAbsorb(G, a.x, a.y, dmg) : dmg;
    if (dm <= 0) return 0;
    a.hp -= dm; a.flash = 0.1; SK.num(G, a.x, a.y - 20, dm, '#ff4a4a');
    if (a.hp <= 0) { a.dead = true; a.onDie(G, a); }
    return dm;
  };
  Df.hurtTowersIn = function (G, x, y, rad, dmg) {
    const d = G.defence; if (!d) return 0;
    let n = 0;
    for (const t of d.towers) { const a = t.ally; if (a && !a.dead && Math.hypot(a.x - x, a.y - y) < rad + 8) { Df.hurtTower(G, a, dmg); n++; } }
    return n;
  };
  Df.tickers.push(G => {
    const d = G.defence; if (!d || !d.towers.length) return;
    for (const b of G.bullets) {
      if (b.side !== 'e' || b.dead || !b.boss || !b.boss.dwave) continue;   // đạn của trùm sóng (fire() ghi b.boss)
      for (const t of d.towers) {
        const a = t.ally; if (!a || a.dead) continue;
        if (Math.hypot(a.x - b.x, a.y - (b.y + (b.h || 0) * 0.3)) < (b.r || 3) + 7) { Df.hurtTower(G, a, Math.max(1, b.dmg || 1)); b.dead = true; break; }
      }
    }
  });
})();
