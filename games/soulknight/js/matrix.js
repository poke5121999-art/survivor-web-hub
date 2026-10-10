// Mê Trận Tà Vương (G.mode === 'matrix'): chế độ Ải vô tận, tầng nào cũng 5 ải, qua x-5 là nối tầng mới (game.js SK.matrixNextFloor).
// Số lấy từ tools/polish/MODES.md mục 2d; chỗ không có số gốc ghi [ƯỚC LƯỢNG].
//   Uy Áp P = số tầng đã vượt = tầng hiện tại - 1.
//   HP quái và trùm sinh ra = HP × (1 + 0,15 × P) làm tròn; quái đánh người chơi +floor(P/3) sát thương.
//   Mỗi lần P tăng nhận 4 Pha Lê (Lợi Hại 5). Vào cổng x-5 Tà Vương chấm điểm: Thưởng 70% nhân tố tích cực / 30% trung tính,
//   Phạt 40% tiêu cực / 60% trung tính; nhân tố áp bằng SK.factorsAdd (không trùng, mỗi tầng một lần).
// Chưa làm (xem tools/polish/GAPS.md): thanh Uy Áp trên HUD, Quái Gen, cấp vũ khí, 6 nhân tố riêng của Tà Vương, tay sai, Tước Sĩ Lục.
(function () {
  'use strict';
  const SK = window.SK;
  const C = {
    hpPerP: 0.15, dmgEveryP: 3, crystalPerP: 4, crystalPerPBad: 5,
    rewardPos: 0.7, penaltyNeg: 0.4,
    markerSecs: 360   // [ƯỚC LƯỢNG] vạch mốc đầy sau 6 phút mỗi tầng
  };
  // Bể bốc: khoá nhân tố đã có ở SK.FACTORS, phân loại theo wiki.
  const POOL = {
    pos: ['HalfCd', 'Cruel', 'MoreBrave', 'Tenacious'],
    neu: ['Huge', 'Tiny'],
    neg: ['EnemyDefence', 'AggressiveEnemy', 'Intensive', 'FastEnemyBullet', 'DoubleBoss', 'FastEnemy', 'ExEnemy',
      'InferiorMedicine', 'EnemyDoubleHp', 'HardShield', 'DoubleCd', 'AllAlone', 'Inflation']
  };
  const GOOD = ['Làm tốt lắm', 'Thú vị...', 'Yo~', 'Thú vị'];
  const BAD = ['Không ổn lắm...', 'Cái này à?', 'Hả? ...', 'Xem ra không chịu nổi?'];

  const M = SK.matrix = { C, POOL };
  const on = G => G && G.mode === 'matrix' && G.matrix;

  M.init = function (G) {
    return { floor: 1, P: 0, crystals: 0, t0: G.t, kills: 0, spawned: 0, judged: {}, verdicts: [] };
  };
  // Điểm vào tạm (thẻ chế độ ở sảnh nối sau): vào thẳng Mê Trận bằng anh hùng hero.
  M.start = hero => SK.startRun(hero || 'knight', 'matrix', []);
  M.hpMul = P => 1 + C.hpPerP * P;
  M.dmgAdd = P => Math.floor(P / C.dmgEveryP);

  // ---- Uy Áp tăng khi vào ải đầu của tầng mới
  SK.on('stageEnter', (G, st) => {
    const m = on(G); if (!m || !st.floor) return;
    if (st.floor > m.floor) {
      const up = st.floor - 1 - m.P;
      if (up > 0) m.crystals += up * (G.badass ? C.crystalPerPBad : C.crystalPerP);
      m.P = st.floor - 1; m.floor = st.floor;
    }
    if (st.n === 1) { m.t0 = G.t; m.kills = 0; m.spawned = 0; }   // vào tầng mới: thanh và vạch mốc về 0
  });

  // ---- HP quái theo Uy Áp (bọc nhà máy quái: cả trùm, quái triệu hồi)
  const makeEnemy = SK.makeEnemy;
  SK.makeEnemy = function (G, ...args) {
    const e = makeEnemy(G, ...args);
    const m = on(G);
    if (m && e) {
      if (!e.noReward) m.spawned++;
      if (m.P > 0) {
        const f = M.hpMul(m.P);
        e.hp = Math.max(1, Math.round(e.hp * f)); e.hpMax = Math.max(1, Math.round(e.hpMax * f));
      }
    }
    return e;
  };
  SK.on('enemyKill', (G, e) => { const m = on(G); if (m && !(e && e.noReward)) m.kills++; });

  // ---- sát thương quái lên người chơi
  const hurtPlayer = SK.hurtPlayer;
  SK.hurtPlayer = function (G, dmg, ...rest) {   // rest: toạ độ nguồn đòn (khiên lửa/xung kích đọc)
    const m = on(G);
    if (m && dmg > 0) dmg += M.dmgAdd(m.P);
    return hurtPlayer(G, dmg, ...rest);
  };

  // ---- Tà Vương chấm điểm
  // Loại nhân tố theo kết quả; rnd() ∈ [0,1) (bộ kiểm cắm số giả).
  M.pickKind = (reward, rnd) => reward ? (rnd < C.rewardPos ? 'pos' : 'neu') : (rnd < C.penaltyNeg ? 'neg' : 'neu');
  M.progress = G => { const m = G.matrix; return m.spawned ? m.kills / m.spawned : 0; };
  M.marker = G => Math.max(0, G.t - G.matrix.t0) / C.markerSecs;

  // Chấm một tầng; gọi lần hai cùng tầng trả lại kết quả cũ, không thêm nhân tố. opts.reward ép Thưởng/Phạt (kiểm thử).
  M.judge = function (G, opts) {
    const m = on(G); if (!m) return null;
    const floor = m.floor;
    if (m.judged[floor]) return m.judged[floor];
    opts = opts || {};
    const reward = opts.reward != null ? !!opts.reward : M.progress(G) > M.marker(G);
    let kind = M.pickKind(reward, SK.rand());
    const owned = G.factors || [];
    const free = k => POOL[k].filter(f => SK.FACTORS[f] && owned.indexOf(f) < 0);
    let pool = free(kind);
    if (!pool.length) { kind = 'neu'; pool = free('neu'); }
    const key = pool.length ? SK.pick(pool) : null;
    const added = key ? SK.factorsAdd(G, key) : false;
    const line = (reward ? GOOD : BAD)[SK.randi(0, 3)];
    const rec = { floor, reward, kind, key: added ? key : null };
    m.judged[floor] = rec; m.verdicts.push(rec);
    G.toast(line + (added ? ' · ' + SK.FACTORS[key].vi + ': ' + SK.FACTORS[key].desc : ''), 4);
    SK.emit('matrixVerdict', G, rec);
    return rec;
  };
  SK.on('portalEnter', (G, st) => { if (on(G) && st.n === 5) M.judge(G); });
})();
