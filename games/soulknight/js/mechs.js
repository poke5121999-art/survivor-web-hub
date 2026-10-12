// Cơ giáp còn lại (rev 20261010zb, đợt 3 rev 20261012a): m_mech_2..7, m_mech_9, m_mech_coin, m_mech_engineer, m_mecha_normal_b/d/e/2s,
// cộng nút Phụ, nâng cấp ★ ở Thương Nhân Vật Chở, đòn thứ hai riêng, xuyên vật cản của m_mech_6/7, đạn gốc.
// Khung chung ở js/mounts.js (SK.mechDefs). Hình: vẽ nguyên prefab gốc `mount/<id>` (và `<id>_update` khi ★) bằng SK.drawPrefab (tools/extra/mech.json).
// HP, giáp, tốc lấy từ data/sk-mounts.js (prefab 8.6, khớp wiki). Vũ khí gắn: bộ bắn của vũ khí web gần nhất nhưng ĐẠN là prefab đạn gốc
// của prefab cơ giáp (g.bullet / g.bl; đạn nạp vào data/sk-weapons86.js qua tools/extra/mech.json "w86_bullets"), số (dmg, tiêu, crit) từ prefab [PF].
// Nút Phụ (Extra) = phím kỹ năng (đang cưỡi không dùng được kỹ năng nhân vật). Súng đặc biệt (Lưới Điện Từ, Pháo Phân Giải, Sấm Sét) nằm ô vũ khí 2 (phím đổi vũ khí).
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.mechDefs) return;
  const U = SK.PPU, I = SK.input;
  const D = SK.mechDefs;
  const K = () => SK.skillKit || {};

  // lift = độ nhấc người ngồi trong giáp [ƯỚC LƯỢNG, chỉnh bằng ảnh]. gun: dmg/crit/thr/cost từ prefab; base chọn theo kiểu bắn [ƯỚC LƯỢNG].
  // upg = bản ★ [PF *_update]: hp / speedRate là giá trị mới, patch[i] chỉnh súng i, add = súng thêm, extra = nút Phụ mới, prefab = hình ★.
  // ws = nhân nhịp bắn: stdCooldown của arm_* đổi 0,7 -> 0,4 (bazooka), 0,35 -> 0,2 (eliminator) khi nâng ★ [PF].
  Object.assign(D, {
    // 4 tia laser bullet_42/40/41/43 sát thương 3/4/8/8, bắn ngẫu nhiên một tia mỗi phát [PF mech_2_1 bulletsInfo]; ★: Lưới Điện Từ (h3 mount_2_2: 8 sát thương, crit 10, tiêu 4, tụ lực 1,5 s) và máu 8 -> 10
    m_mech_2: { prefab: 'm_mech_2', lift: 12, guns: [{ base: 'pulse', bl: [['bullet_42', 3], ['bullet_40', 4], ['bullet_41', 8], ['bullet_43', 8]], spd: 0, dmg: 3, crit: 0, thr: 0, cost: 1, name: 'Laser Mạch Xung' }], extra: 'radial',
      upg: { prefab: 'm_mech_2_update', hp: 10, add: [{ mechx: 'taser', base: 'pulse', dmg: 8, crit: 10, cost: 4, charge: 1.5, name: 'Lưới Điện Từ' }] } },
    // Cannon: bullet_202_invisible (nổ tại điểm rơi); Missile (h2 weapon_902: tối đa 10 tên lửa bullet_86 sát thương 2, tiêu 10) ở nút Phụ; ★: Pháo Phân Giải (h3 mount_3_2: 2 nòng bullet_mech_vc 10 sát thương) + tốc -20% -> -10%
    m_mech_3: { prefab: 'm_mech_3', lift: 12, guns: [{ base: 'bazooka', bullet: 'bullet_202_invisible', spd: 64, dmg: 12, crit: 0, thr: 0, cost: 3, name: 'Cannon Oanh Tạc' }], extra: 'missile',
      upg: { prefab: 'm_mech_3_update', speedRate: -0.1, add: [{ mechx: 'splinter', base: 'bazooka', dmg: 10, crit: 10, cost: 4, charge: 1.5, name: 'Pháo Phân Giải' }] } },
    // WiFi Booster: 3 súng lơ lửng; ★: đòn Phụ ném 6 tam giác bong bóng (h2 weapon: CircularBulletCreator 6 viên, 4 sát thương, hồi 1,7 s) và tốc 0 -> +5%
    m_mech_4: { prefab: 'm_mech_4', lift: 14, guns: [], turrets: [[-2.35, 34, 4], [-16.75, 15.8, 4], [13.65, 15.8, 4]],   // 2 súng + 1 laser lơ lửng, damage 4 [PF]
      upg: { prefab: 'm_mech_4_update', speedRate: 0.05, extra: 'bubble' } },
    // Cắn (sword_bit_lion 10, crit 20) + Pháo Hoa (bullet_202_lion: tên lửa tự dẫn 12, tiêu 4). Không có bản ★ [WIKI Dragon Dance Armor; PF không có m_mech_5_update]
    m_mech_5: { prefab: 'm_mech_5', lift: 12, guns: [{ base: 'pincer', bullet: 'sword_bit_lion', spd: 0, dmg: 10, crit: 20, thr: 0, cost: 0, name: 'Cắn' },
      { base: 'rocket_fireworks', bullet: 'bullet_202_lion', spd: 24, dmg: 12, crit: 0, thr: 0, cost: 4, name: 'Pháo Hoa' }] },
    // Máy Bay Chiến Đấu: xuyên vật cản bất hoại [WIKI Swift Shuttle Jet]; ★: máu 7 -> 9, crit 20 -> 40, thả nút sau 4 phát thì bắn tên lửa tự dẫn miễn phí (10 sát thương, bullet_little_plane_rocket)
    m_mech_6: { prefab: 'm_mech_6', lift: 12, ghost: true, guns: [{ base: 'smg_m2', bullet: 'bullet_little_plane', spd: 40, dmg: 2, crit: 20, thr: 0, cost: 4, name: 'Súng Đôi' }],
      upg: { prefab: 'm_mech_6_update', hp: 9, patch: { 0: { crit: 40 } }, rocket: { p: 'bullet_little_plane_rocket', dmg: 10, spd: 32, shots: 4, rate: 6 } } },
    // Đĩa Nổi 51 (xác nhận bằng wiki: máu 7, giáp 1, tốc +60%, laser 8 sát thương tiêu 2, ★ +2 máu): xuyên vật cản bất hoại; ★: tự phóng điện tối đa 3 quái trong 5 ô, 4 sát thương mỗi 0,8 s [PF attackInterval/maxDistance/maxTargetCount/damage]
    m_mech_7: { prefab: 'm_mech_7', lift: 12, ghost: true, guns: [{ base: 'arbitrator', bullet: 'bullet_40', spd: 0, dmg: 8, crit: 10, thr: 10, cost: 2, name: 'Laser Xuyên' }],
      upg: { prefab: 'm_mech_7_update', hp: 9, patch: { 0: { crit: 20 } }, zap: { dmg: 4, every: 0.8, n: 3, range: 5 } } },
    // Bọ Hung (không bán): sừng bullet_herculesbeetle 15 + sấm (h2 thunder: 10 sát thương, chuỗi 4 quái, tiêu 3)
    m_mech_9: { prefab: 'm_mech_9', lift: 14, guns: [{ base: 'broadsword', bullet: 'bullet_herculesbeetle', spd: 0, dmg: 15, crit: 20, thr: 0, cost: 0, name: 'Sừng Bọ' },
      { mechx: 'thunder', base: 'm4', dmg: 10, crit: 20, cost: 3, name: 'Sấm Sét' }] },
    m_mech_coin: { prefab: 'm_mech_coin', lift: 12, guns: [{ base: 'assault_rifle', bullet: 'bullet_coin_mech', spd: 36, dmg: 2, crit: 10, thr: 0, cost: 1, name: 'Súng Xu' }] },
    m_mech_engineer: { prefab: 'm_mech_engineer', lift: 12, guns: [{ base: 'm4', bullet: 'bullet_6_yellow', spd: 16, dmg: 3, crit: 10, thr: 10, cost: 1, name: 'Pháo Thần Lửa' }], extra: 'goodbye199' },
    // Bốn giáp lớn: đạn của arm_* (bullet_28, normal_bullet_pengpeng, normal_bullet_turbulence); normal_bullet_eliminator_plus chỉ là đạn trong mã (không mv/hình) nên 2s vẫn mượn đạn gần nhất.
    // ★ của cả bốn: sát thương +, nhịp bắn nhanh hơn, tốc +10% (-20% -> -10%; d: -10% -> -5%) [PF]. 2s ★ có thêm Kiếm Điện (hasSpecialSkill, skillConsume 5) ở nút Phụ.
    m_mecha_normal_b: { prefab: 'm_mecha_normal_b', lift: 26, guns: [{ base: 'bazooka', bullet: 'bullet_28', spd: 14, size: 2, dmg: 8, crit: 0, thr: 0, cost: 2, name: 'Đốt Cháy' }],
      upg: { prefab: 'm_mecha_normal_b_update', speedRate: -0.1, patch: { 0: { dmg: 11, ws: 0.7 / 0.4 } } } },
    m_mecha_normal_d: { prefab: 'm_mecha_normal_d', lift: 26, guns: [{ base: 'shotgun_galaxy', bullet: 'normal_bullet_pengpeng', spd: 40, size: 0.6, n: 4, dmg: 3, crit: 0, thr: 0, cost: 2, name: 'Pong Pong' }],
      upg: { prefab: 'm_mecha_normal_d_update', speedRate: -0.05, patch: { 0: { dmg: 4 } } } },
    m_mecha_normal_e: { prefab: 'm_mecha_normal_e', lift: 26, guns: [{ base: 'blaster', bullet: 'normal_bullet_turbulence', spd: 30, dmg: 4, crit: 0, thr: 0, cost: 1, name: 'Hỗn Loạn' }],
      upg: { prefab: 'm_mecha_normal_e_update', speedRate: -0.1, patch: { 0: { dmg: 5 } } } },
    m_mecha_normal_2s: { prefab: 'm_mecha_normal_2s', lift: 26, guns: [{ base: 'assault_sniper_rifle', dmg: 8, crit: 15, thr: 0, cost: 4, name: 'Máy Diệt Trừ' }],
      upg: { prefab: 'm_mecha_normal_2s_update', speedRate: -0.1, extra: 'sword', patch: { 0: { dmg: 10, ws: 0.35 / 0.2 } } } }
  });
  D.m_mech_0.extra = 'goodbye50';
  D.m_mech_1.upg = { prefab: 'm_mech_1_update', hp: 12, extra: 'ram', ramCfg: { speed: 16, dmg: 3, arms: 2, every: 0.2, energy: 1 }, deathBoost: 2 };   // ★: máu 10 -> 12, +2 sát thương khi vỡ, Phụ: húc (h3 m_mech_1_1 bullet_drill 3 sát thương, tiêu 1 NL/s, tốc 16 ô/s) [WIKI Iron Fist]
  // Giáp ★ tồn tại trên mặt đất đi cùng m.up; danh sách giáp nâng được = có `upg` (Prototype Armor, Dragon Dance và 3 giáp ngoài quán không có) [WIKI Armor Merchant].

  // Giá nâng cấp = mountPriceUpdateFactor (0,5) x giá giáp [PF npc_mount_mech]; làm tròn lên [ƯỚC LƯỢNG]. Giá giáp lấy từ SK_ROOMS.mountPrice.
  SK.mechUpgradePrice = id => Math.max(1, Math.ceil(0.5 * (window.SK_ROOMS && SK_ROOMS.mountPrice ? SK_ROOMS.mountPrice(id) : 30)));
  const SAY = { quest: 'Cơ Giáp của bạn rất có tiềm năng, muốn cải tiến không?', ok: 'Sức mạnh lớn quá', weapon: 'Đổi vũ khí thử xem', refuse: 'Xin lỗi, chúng tôi không cung cấp dịch vụ cho vay' };
  // Thương nhân Vật Chở cải tiến giáp đang lái. hook = {pay(n) -> bool, sound()} do js/rooms.js fillMount đưa vào.
  SK.mechUpgradeNpc = function (G, cx, cy, hook) {
    const eligible = () => { const m = G.player && G.player.mount; return SK.mechCanUpgrade(m); };
    const price = () => { const m = G.player && G.player.mount; return m ? SK.mechUpgradePrice(m.id) : 0; };
    const o = { x: cx, y: cy - 4, r: 16, labelY: 44, npcUpgrade: true,
      get gone() { return !eligible(); },
      get label() { const m = G.player.mount, M = m && SK.mountDef(m.id); return 'Cải tiến ' + (M ? M.vi : '') + ' — ' + price() + ' vàng'; },
      use() {
        if (!eligible()) return;
        const p = G.player, n = price();
        if (!hook.pay(n)) { G.toast(SAY.refuse); return; }
        const id = p.mount.id;
        SK.mechUpgrade(G, p);
        if (hook.sound) hook.sound();
        G.toast(SAY.ok + (id === 'm_mech_2' || id === 'm_mech_3' ? ' — ' + SAY.weapon : ''), 2.5);
        SK.emit('mechUpgradeBuy', G, id, n);
      } };
    G.interactables.push(o);
    return o;
  };

  // ---- Tiện ích
  const alive = e => e && !e.dead && e.hp > 0 && !e.noTarget;
  const mid = e => [e.x, e.y - ((e.hb && e.hb.off && e.hb.off[1]) || 6) * (e.scale || 1)];
  function near(G, x, y, range, skip) {
    let best = null, bd = range;
    for (const e of G.enemies || []) {
      if (!alive(e) || (skip && skip.indexOf(e) >= 0)) continue;
      const [cx, cy] = mid(e), d = Math.hypot(cx - x, cy - y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  const dmgOf = (p, n) => Math.max(1, Math.round(n * (p.dmgMul || 1)));
  // Chuỗi sét: mục tiêu đầu = quái gần nhất trong tầm 14 ô, mỗi bước nhảy sang quái gần nhất chưa trúng trong 5 ô, tối đa `n` quái [WIKI Witch Lightning Strike; PF thunder max_count 4;
  // tầm 14 / 5 ô là ƯỚC LƯỢNG]. stun = giây choáng (0 = không).
  SK.mechChain = function (G, p, dmg, n, stun, critPct) {
    const hit = [], from = [p.x, p.y - 14];
    let e = near(G, p.x, p.y - 6, 14 * U), kit = K();
    while (e && hit.length < n) {
      const [cx, cy] = mid(e);
      if (kit.boltProp) kit.boltProp(G, from.slice(), [cx, cy], 0.25);
      const crit = SK.rand() * 100 < (critPct || 0);
      SK.hurtEnemy(G, e, dmgOf(p, dmg) * (crit ? 2 : 1), crit, Math.atan2(cy - from[1], cx - from[0]), 2);
      if (stun > 0 && kit.stun) kit.stun(e, stun);
      hit.push(e); from[0] = cx; from[1] = cy;
      e = near(G, cx, cy, 5 * U, hit);
    }
    return hit;
  };

  // ---- Đòn thứ hai chạy bằng phím Phụ (phím kỹ năng). hold = chạy mỗi nhịp khi giữ phím.
  const EXTRA = {
    // Tạm Biệt Thế Giới: tự nổ vùng 50 (Kỹ Sư 199) rồi mất giáp [WIKI Prototype Armor: nổ 50 trong bán kính 9,5 ô; data weapon.blast]
    goodbye50: { cd: 0, run(G, p) { return SK.mechSelfDestruct(G, p, 50, 9.5); } },
    goodbye199: { cd: 0, run(G, p) { return SK.mechSelfDestruct(G, p, 199, 9.5); } },
    // Vụ Nổ Tròn: 5 sát thương quanh giáp và xoá đạn địch trong vòng [WIKI Apocalypse]; hồi 2 s [WIKI: hồi 2 giây], tầm 3 ô [ƯỚC LƯỢNG]
    radial: {
      cd: 2,
      run(G, p) {
        SK.mechBlast(G, p, 5, 3);
        const r = 3 * U;
        for (let i = G.bullets.length - 1; i >= 0; i--) { const b = G.bullets[i]; if (b.side !== 'p' && (b.x - p.x) * (b.x - p.x) + (b.y - p.y) * (b.y - p.y) <= r * r) G.bullets.splice(i, 1); }
        return false;
      }
    },
    // Missile Barrage (h2 weapon_902): kho 10 tên lửa bullet_86 sát thương 2 tự dẫn, tiêu 1 NL mỗi tên, nạp lại 0,4 s/tên [ƯỚC LƯỢNG], toả 75° [PF deviation 75]
    missile: {
      cd: 0.3,
      run(G, p, m) {
        const n = Math.min(Math.floor(m.ammo != null ? m.ammo : 10), Math.floor(p.energy), 10);
        if (n < 1) return false;
        m.ammo = (m.ammo != null ? m.ammo : 10) - n; p.energy -= n;
        for (let i = 0; i < n; i++) {
          const a = p.aim + SK.deg(SK.randf(-37.5, 37.5));
          SK.spawnBullet86(G, 'p', 'bullet_86', p.x + Math.cos(a) * 8, p.y - 12 + Math.sin(a) * 8, a, { dmg: dmgOf(p, 2), spd: 16, owner: p, h: 12, repel: 3 });
        }
        return false;
      }
    },
    // ★ WiFi Booster: 6 tam giác bong bóng bullet_mech_4_2 (4 sát thương, tốc 16, lệch 30° rồi cách 60°) kéo vệt bong bóng nhỏ 2 sát thương hai bên [PF CircularBulletCreator; RGSBullet01 child_rate 0,2]
    bubble: {
      cd: 1.7,
      run(G, p) {
        for (let i = 0; i < 6; i++) {
          const a = p.aim + SK.deg(30 + i * 60);
          const b = SK.spawnBullet86(G, 'p', 'bullet_mech_4_2', p.x + Math.cos(a) * 8, p.y - 12 + Math.sin(a) * 8, a, { dmg: dmgOf(p, 4), spd: 16, owner: p, h: 12, repel: 3, life: 1.5 });
          if (b) b._trail = 0.2;
        }
        return false;
      }
    },
    // ★ Kiếm Điện (Plume): triệu hồi kiếm khổng lồ chém 5 nhát, mỗi nhát phản đạn địch trong tầm; tiêu 5 NL, hồi 10 s [WIKI Plume; PF skillConsume 5]. Sát thương mỗi nhát 8 và tầm 4 ô là ƯỚC LƯỢNG
    sword: {
      cd: 10,
      run(G, p, m) {
        if (p.energy < 5) { G.toast('Hết năng lượng!'); m.cd = 0.5; return false; }
        p.energy -= 5; m.sw = { n: 5, t: 0 };
        return false;
      }
    },
    // ★ Chưởng Thép: giữ phím thì húc tới quái gần nhất tốc 16 ô/s, mỗi tay 3 sát thương, 1 NL/s [WIKI Iron Fist; PF m_mech_1_update h3]. Nhịp trúng 0,2 s là ƯỚC LƯỢNG
    ram: { hold: true }
  };
  const extraOf = (m, C) => (m.up && C.upg && C.upg.extra) || C.extra;

  const baseUpdate = SK.updatePlayer;
  SK.updatePlayer = function (G, dt) {
    const p = G.player, m = p && p.mount;
    let nf, special = false;
    if (m && m.mech && p.st !== 'dead') {
      m.cd = Math.max(0, (m.cd || 0) - dt);
      const C = D[m.id], X = C && EXTRA[extraOf(m, C)];
      if (m.ammo != null || m.id === 'm_mech_3') m.ammo = Math.min(10, (m.ammo != null ? m.ammo : 10) + dt / 0.4);
      if (X && !X.hold && I && I.edge && I.edge.skill && m.cd <= 0) { I.hit('skill'); m.cd = X.cd; X.run(G, p, m); }
      if (C && C.turrets && G.phase === 'play') turrets(G, p, m, C, dt);
      if (G.phase === 'play') {
        if (m.up && C && C.upg) {
          if (C.upg.zap) zapper(G, p, m, C.upg.zap, dt);
          if (C.upg.rocket) rocketVolley(G, p, m, C.upg.rocket, dt);
        }
        if (m.sw) swordStep(G, p, m, dt);
        const w = p.weapons[p.cur];
        if (w && w.def && w.def.kind === 'mechx') { special = true; nf = p.noFire; p.noFire = true; specialWeapon(G, p, m, w, !nf && I.down('attack'), dt); }
        else if (m.chg) m.chg = null;
      }
    } else if (m === null || (p && !m)) ghostFree(G, p);
    homing(G, dt);
    const r = baseUpdate.apply(this, arguments);
    if (special) p.noFire = nf;
    if (p && m && m.mech && p.st !== 'dead' && G.phase === 'play') {
      const C = D[m.id];
      if (m.up && C && C.upg && C.upg.extra === 'ram') ram(G, p, m, C.upg.ramCfg, dt);
    }
    return r;
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
      SK.spawnBullet86(G, 'p', 'bullet_1', x, y, a, { dmg, crit: false, repel: 1, spd: 32, h: Math.max(2, p.y - y), owner: p });
    }
  }

  // ---- Đĩa Nổi 51 ★: phóng điện tự động [PF m_mech_7_update attackInterval 0,8, damage 4, maxDistance 5, maxTargetCount 3]
  function zapper(G, p, m, Z, dt) {
    m.zt = (m.zt || 0) - dt; if (m.zt > 0) return;
    m.zt = Z.every;
    const hit = [], kit = K();
    for (let i = 0; i < Z.n; i++) {
      const e = near(G, p.x, p.y - 8, Z.range * U, hit); if (!e) break;
      const [cx, cy] = mid(e);
      if (kit.boltProp) kit.boltProp(G, [p.x, p.y - 14], [cx, cy], 0.2);
      SK.hurtEnemy(G, e, dmgOf(p, Z.dmg), false, Math.atan2(cy - p.y, cx - p.x), 1);
      hit.push(e);
    }
    m.lastZap = hit.length;
  }

  // ---- Máy Bay Chiến Đấu ★: nhả nút sau >= 4 phát liên tiếp thì bắn 1 tên lửa tự dẫn, không tốn NL [WIKI Swift Shuttle Jet; PF bulletsInfo[1] bullet_little_plane_rocket 10 sát thương]. 6 phát/s [WIKI]
  function rocketVolley(G, p, m, R, dt) {
    const hold = !p.noFire && I.down('attack') && p.energy > 0;
    if (hold) { m.fh = (m.fh || 0) + dt; return; }
    const fired = Math.floor((m.fh || 0) * R.rate);
    m.fh = 0;
    if (fired >= R.shots) {
      const a = p.aim;
      SK.spawnBullet86(G, 'p', R.p, p.x + Math.cos(a) * 8, p.y - 10 + Math.sin(a) * 8, a, { dmg: dmgOf(p, R.dmg), spd: R.spd, owner: p, h: 10, repel: 3 });
      m.rockets = (m.rockets || 0) + 1;
    }
  }

  // ---- Súng đặc biệt trong ô vũ khí (def.kind === 'mechx'): tự chạy giữ/nhả vì không có dữ liệu clip 8.6.
  // Lưới Điện Từ: giữ nút để tụ lực 1,5 s [PF max_time 1.5], nhả khi đầy thì sét đánh quái gần nhất, 8 sát thương, choáng, nhảy tối đa 4 quái, tiêu 4 NL.
  // Pháo Phân Giải: tụ lực 1,5 s, nhả ra 2 đạn bullet_mech_vc (10 sát thương, crit 10, tốc 20, lệch 10°) vỡ 2 mảnh rồi 3 mảnh nhỏ khi trúng [PF RGBTDivision]; tiêu 4 NL.
  // Sấm Sét (m_mech_9): bấm là bắn, chuỗi 4 quái 10 sát thương, choáng 70% [PF thunder dizzy_rate 70]; tiêu 3 NL, nhịp 0,5 s [ƯỚC LƯỢNG].
  function specialWeapon(G, p, m, w, want, dt) {
    const C = w.def.cfg, kind = w.def.mechx;
    m.sc = Math.max(0, (m.sc || 0) - dt);
    if (kind === 'thunder') {
      if (want && m.sc <= 0 && p.energy >= C.cost) {
        p.energy -= C.cost; m.sc = 0.5;
        SK.mechChain(G, p, C.dmg, 4, SK.rand() < 0.7 ? 2 : 0, C.crit);
      }
      return;
    }
    // tụ lực
    if (want) {
      if (!m.chg) {
        if (p.energy < C.cost) { if (!(G.toastT > 0)) G.toast('Hết năng lượng!'); return; }
        m.chg = { t: 0 };
      }
      m.chg.t += dt * (p.rateMul || 1);
    } else if (m.chg) {
      const full = m.chg.t >= C.charge; m.chg = null;
      if (!full || p.energy < C.cost) return;
      p.energy -= C.cost;
      if (kind === 'taser') {
        SK.mechChain(G, p, C.dmg, 4, 2, C.crit); m.tasers = (m.tasers || 0) + 1;
      } else if (kind === 'splinter') {
        for (let i = 0; i < 2; i++) {
          const a = p.aim + SK.deg(SK.randf(-10, 10)) + SK.deg(i ? 4 : -4);
          SK.spawnBullet86(G, 'p', 'bullet_mech_vc', p.x + Math.cos(a) * 8, p.y - 12 + Math.sin(a) * 8, a, { dmg: dmgOf(p, C.dmg), crit: SK.rand() * 100 < C.crit, spd: 20, owner: p, h: 12, repel: 3 });
        }
        m.splinters = (m.splinters || 0) + 1;
      }
    }
  }

  // ---- Kiếm Điện của Plume ★: 5 nhát cách 0,35 s [ƯỚC LƯỢNG], mỗi nhát: vệt kiếm gốc + 8 sát thương cho quái trong 4 ô + phản đạn địch trong 4 ô
  function swordStep(G, p, m, dt) {
    const s = m.sw; s.t -= dt; if (s.t > 0) return;
    s.t = 0.35; s.n--;
    const r = 4 * U;
    SK.spawnBullet86(G, 'p', 'sword_2_5', p.x, p.y - 8, p.aim, { dmg: 0, size: 3, owner: p, h: 8, hx: p.x, hy: p.y - 8 });
    for (const e of (G.enemies || []).slice()) {
      if (!alive(e)) continue;
      const [cx, cy] = mid(e);
      if (Math.hypot(cx - p.x, cy - p.y) <= r + (e.r || 4)) SK.hurtEnemy(G, e, dmgOf(p, 8), false, Math.atan2(cy - p.y, cx - p.x), 3);
    }
    for (const b of G.bullets || []) {
      if (b.side === 'p' || b.dead || Math.hypot(b.x - p.x, b.y - p.y) > r) continue;
      if (SK.reflectBullet) SK.reflectBullet(G, b, Math.atan2(b.y - p.y, b.x - p.x)); else b.dead = true;
      m.reflected = (m.reflected || 0) + 1;
    }
    m.slashes = (m.slashes || 0) + 1;
    if (s.n <= 0) m.sw = null;
  }

  // ---- Chưởng Thép ★: húc [WIKI Iron Fist: giữ phím Phụ, húc tới quái nhắm tốc cố định 16 ô/s, mỗi tay 3 sát thương, 1 NL/s]
  function ram(G, p, m, R, dt) {
    const hold = I.down('skill') && p.energy > 0;
    if (!hold) { m.ramming = false; return; }
    const e = p.target && alive(p.target) ? p.target : near(G, p.x, p.y - 6, 14 * U);
    const a = e ? Math.atan2(mid(e)[1] - (p.y - 6), e.x - p.x) : (p.face < 0 ? Math.PI : 0);
    m.ramming = true; p.energy = Math.max(0, p.energy - R.energy * dt);
    SK.moveBox(G.map, p, Math.cos(a) * R.speed * U * dt, Math.sin(a) * R.speed * U * dt, p.h.body.r);
    if (Math.abs(Math.cos(a)) > 0.1) p.face = Math.cos(a) > 0 ? 1 : -1;
    m.rt = (m.rt || 0) - dt;
    if (m.rt > 0) return;
    m.rt = R.every;
    for (const q of (G.enemies || []).slice()) {
      if (!alive(q)) continue;
      const [cx, cy] = mid(q);
      if (Math.hypot(cx - p.x, cy - (p.y - 6)) <= 20 + (q.r || 4)) {
        for (let k = 0; k < R.arms; k++) SK.hurtEnemy(G, q, dmgOf(p, R.dmg), false, a, 6);
        m.rams = (m.rams || 0) + 1;
      }
    }
  }

  // ---- Đạn tự dẫn của đạn gốc (Bullet02: sau delay_time, mỗi interval xoay tối đa angle_speed độ về quái gần nhất) + vệt bong bóng (RGSBullet01) + giảm tốc (Bullet04)
  const HOME = { bullet_86: 1, bullet_202_lion: 1, bullet_little_plane_rocket: 1 };
  function homing(G, dt) {
    const p = G.player;
    for (const b of G.bullets || []) {
      if (b.dead || b.side !== 'p' || !b.v86) continue;
      if (HOME[b.v86] && b.owner === p) {
        const mp = (b.B && b.B.m && b.B.m.Bullet02) || {};
        if (b._hm == null) b._hm = { delay: mp.delay_time || 0, turn: SK.deg((mp.angle_speed || 15) / Math.max(0.02, mp.interval || 0.05)), tgt: null };
        const H = b._hm;
        H.delay -= dt; if (H.delay > 0) continue;
        if (!alive(H.tgt)) H.tgt = near(G, b.x, b.y, 14 * U);
        if (!H.tgt) continue;
        const [cx, cy] = mid(H.tgt), want = Math.atan2(cy - b.y, cx - b.x), cur = Math.atan2(b.vy, b.vx);
        let d = want - cur; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
        const na = cur + Math.max(-H.turn * dt, Math.min(H.turn * dt, d)), sp = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
      } else if (b.v86 === 'bullet_mech_4_2' && b._trail != null) {
        b._trail -= dt;
        if (b._trail <= 0) {
          b._trail = 0.2;
          for (const s of [-1, 1]) SK.spawnBullet86(G, 'p', 'bullet_mech_4_2_child', b.x, b.y, b.ang + s * Math.PI / 2, { dmg: dmgOf(p, 2), spd: 6, owner: p, h: b.h, life: 4 });
        }
      } else if (b.v86 === 'bullet_mech_4_2_child') {
        b._dc = (b._dc || 0) - dt;
        if (b._dc <= 0) { b._dc = 0.1; const sp = Math.hypot(b.vx, b.vy), ns = Math.max(1 * U, sp * 0.8); if (sp > 0) { b.vx *= ns / sp; b.vy *= ns / sp; } }
      }
    }
  }

  // ---- Xuyên vật cản bất hoại: m_mech_6 / m_mech_7 đi xuyên vật cản tĩnh (đá, cột...) nhưng không xuyên tường biên và không xuyên thùng phá được [WIKI Swift Shuttle Jet, Floating 51: "move through indestructible objects, but not level borders"]
  const W = SK.world;
  function solidGhost(map, tx, ty) {
    if (!W.solidTile(map, tx, ty)) return false;
    if (tx < 0 || ty < 0 || tx >= map.W || ty >= map.H) return true;
    if (map.tiles[ty * map.W + tx] !== W.OBST) return true;       // tường, hố, cửa khoá: vẫn chặn
    const o = map.obs.get(ty * map.W + tx);
    return !(o && o.kind === 'static');
  }
  function boxGhost(map, x0, y0, x1, y1) {
    const T = 16;
    for (let ty = Math.floor(y0 / T); ty <= Math.floor((y1 - 0.01) / T); ty++)
      for (let tx = Math.floor(x0 / T); tx <= Math.floor((x1 - 0.01) / T); tx++)
        if (solidGhost(map, tx, ty)) return true;
    return false;
  }
  const isGhost = p => !!(p && p.mount && p.mount.mech && D[p.mount.id] && D[p.mount.id].ghost);
  const baseMove = SK.moveBox;
  SK.moveBox = function (map, a, dx, dy, r) {
    const G = SK.G;
    if (!G || a !== G.player || !isGhost(a)) return baseMove.apply(this, arguments);
    let hit = false;
    const stepAxis = (d, ax) => {
      let rem = d;
      while (Math.abs(rem) > 1e-6) {
        const s = Math.abs(rem) > 1 ? Math.sign(rem) : rem;
        const nx = ax ? a.x + s : a.x, ny = ax ? a.y : a.y + s;
        if (boxGhost(map, nx - r, ny - r, nx + r, ny)) { hit = true; return; }
        a.x = nx; a.y = ny; rem -= s;
      }
    };
    stepAxis(dx, true); stepAxis(dy, false);
    a._ghostWas = true;
    return hit;
  };
  // Xuống giáp / giáp vỡ lúc đang đứng trong vật cản: đẩy ra ô trống gần nhất để khỏi kẹt.
  function ghostFree(G, p) {
    if (!p || !p._ghostWas || isGhost(p)) return;
    p._ghostWas = false;
    const map = G.map, r = p.h && p.h.body ? p.h.body.r : 4;
    if (!W.boxHits(map, p.x - r, p.y - r, p.x + r, p.y)) return;
    for (let rad = 2; rad <= 48; rad += 2)
      for (let k = 0; k < 16; k++) {
        const a = k * Math.PI / 8, nx = p.x + Math.cos(a) * rad, ny = p.y + Math.sin(a) * rad;
        if (!W.boxHits(map, nx - r, ny - r, nx + r, ny)) { p.x = nx; p.y = ny; return; }
      }
  }
})();
