// Nhân Tố Thử Thách [LOC gamemode/challenge; task/<khoá>_title, task/<khoá>_desc]: trước Chế độ Ải chọn vài nhân tố, mỗi nhân tố
// đổi một luật của lượt chơi. Mã lõi (actors/game/rooms/pets/hud) chỉ đọc G.mods, không biết tên nhân tố nào.
//   SK.FACTORS[khoá] = { vi, desc, tier: 'dễ'|'vừa'|'khó', on(G) }  — on(G) ghi số/cờ vào G.mods (đã trung tính sẵn).
//   SK.factorsOn(G)      dựng G.mods từ G.factors (mảng khoá); gọi ở đầu mỗi lượt (game.js startRun).
//   SK.factorsPlayer(G,p) áp phần lên người chơi (HP/giáp/năng lượng tối đa, tốc bắn, sát thương...) sau khi nâng cấp sảnh đã cộng.
//   SK.factorsTick(G,p,dt) mỗi nhịp updatePlayer: năng lượng vô hạn, hồi HP dưới nửa, hồi phục -50%, Càng đánh càng hăng.
//   SK.factorsEnemyTick(G,e,dt) mỗi nhịp updateEnemy: địch hăng (hồi chiêu nhanh), thỉnh thoảng choáng.
// Con số lấy từ mô tả gốc ("gấp đôi", "-50%", "+1") ghi [LOC task/<khoá>_desc]; chỗ mô tả không nói số ghi [ƯỚC LƯỢNG].
// Nhân tố gốc chưa làm (cần đối tượng/phòng mới, không có bản web): xem GAPS ở cuối tệp — không có trong danh sách chọn.
(function () {
  'use strict';
  const SK = window.SK, DS = SK.DS;

  // Giá trị trung tính: mọi chỗ móc đọc `(M.x || mặc định)` nên G.mods thiếu (mùa giải) vẫn chạy.
  const neutral = () => ({
    enemyHpMul: 1, enemyDef: 0, enemySpeedMul: 1, enemyAggro: 1, enemyStunEvery: 0, enemyStunDur: 0, enemyBulletSpeedMul: 1,
    spawnMul: 1, eliteRate: 0,
    playerHpMax: 0, playerArmorMax: 0, playerEnergyMax: 0, hpAdd: 0, armorAdd: 0, energyMul: 1, infiniteEnergy: false,
    skillCdMul: 1, critRateMul: 1, critDmgMul: 1, critAdd: 0, fireRateMul: 1, weaponDmgMul: 1, healMul: 1,
    priceMul: 1, freeBuys: 0, buffSlots: 0, buffChoices: 0, noPet: false, oneWeapon: false, meleeOnly: false,
    sizeMul: 1, moveMul: 1, regenBelowHalf: false, armorNoRegen: false, darkVision: false, brave: false,
    doubleBoss: false, bossHpMul: 1,
    // Tà Vương (Mê Trận): cộng dồn n lần; số đọc từ G.factorStack (SK.factorsAdd), mã móc ở js/matrix.js và js/matrix2.js
    playerHurtAdd: 0, enemyHurtAdd: 0, mutateRate: 0, ctlCut: 0, ctlAdd: 0, enemySlow: 0, rebornTeam: false
  });

  const F = SK.FACTORS = {};
  // Gộp nhiều nhân tố: hệ số nhân với nhau, số cộng với nhau, cờ bật là bật.
  const mul = (G, k, v) => { G.mods[k] *= v; };
  const add = (G, k, v) => { G.mods[k] += v; };
  const set = (G, k, v) => { G.mods[k] = v; };
  function def(key, vi, desc, tier, on, stack) { F[key] = { vi, desc, tier, on, stack: stack || 0 }; }
  // Nhân tố cộng dồn (Tà Vương): số lần đã nhận; on() của loại này đặt (không nhân) nên chạy lại bao nhiêu lần cũng ra cùng số.
  const nOf = (G, k) => Math.max(1, (G.factorStack && G.factorStack[k]) || 1);
  SK.factorStack = (G, k) => (G.factorStack && G.factorStack[k]) || 0;

  // ---- Kẻ địch
  def('EnemyDoubleHp', 'Nhân Đôi Niềm Vui', 'Địch có HP gấp đôi', 'dễ', G => mul(G, 'enemyHpMul', 2));                       // [LOC] +100%
  def('EnemyDefence', 'Kẻ Địch Kiên Cuồng', 'Phòng thủ của địch +1', 'dễ', G => add(G, 'enemyDef', 1));                       // [LOC] +1: mỗi đòn trúng bị trừ 1 (tối thiểu 1)
  def('AggressiveEnemy', 'Kẻ Địch Hoang Dã', 'Địch có tính tấn công hơn', 'dễ', G => mul(G, 'enemyAggro', 1.5));              // [ƯỚC LƯỢNG] hồi chiêu địch chạy nhanh ×1,5
  def('FastEnemy', 'Kẻ Địch Chạy', 'Kẻ địch nhanh hơn, nhưng thỉnh thoảng sẽ choáng', 'dễ', G => {
    mul(G, 'enemySpeedMul', 1.3); set(G, 'enemyStunEvery', 6); set(G, 'enemyStunDur', 0.8);                                   // [ƯỚC LƯỢNG] ×1,3; choáng 0,8 s mỗi ~6 s
  });
  def('FastEnemyBullet', 'Kẻ Địch Phấn Khởi', 'Tốc độ đạn của địch tăng', 'dễ', G => mul(G, 'enemyBulletSpeedMul', 1.3));       // [ƯỚC LƯỢNG] ×1,3
  def('Intensive', 'Chiến Thuật Biển Người', 'Địch mật độ cao hơn', 'dễ', G => mul(G, 'spawnMul', 1.5));                       // [ƯỚC LƯỢNG] ×1,5 (Lợi Hại dùng ×1,3)
  def('ExEnemy', 'Cảnh Giác Toàn Diện', 'Xác suất Quái Tinh Anh xuất hiện tăng', 'dễ', G => { G.mods.eliteRate = Math.max(G.mods.eliteRate, 0.4); }); // [ƯỚC LƯỢNG] tối thiểu 40% (Lợi Hại dùng 40%)
  def('DoubleBoss', 'Hai Lãnh Chúa', 'Bạn sẽ cùng lúc đối mặt với 2 Thủ Lĩnh, nhưng Thủ Lĩnh sẽ yếu hơn một chút', 'khó', G => {
    set(G, 'doubleBoss', true); mul(G, 'bossHpMul', 0.7);                                                                      // [ƯỚC LƯỢNG] mỗi trùm 70% máu
  });

  // ---- Người chơi: máu / giáp / năng lượng
  def('LackHp', 'Da Giòn', 'HP tối đa cố định là 1 điểm', 'khó', G => set(G, 'playerHpMax', 1));                                 // [LOC]
  def('LackEnergy', 'Năng Lượng Suy Yếu', 'Năng lượng tối đa giảm nửa', 'dễ', G => mul(G, 'energyMul', 0.5));                  // [LOC] -50%
  def('InfiniteEnergy', 'Năng Lượng Vô Hạn', 'Có năng lượng vô tận', 'dễ', G => set(G, 'infiniteEnergy', true));
  def('MeridianDisorder', 'Kinh Mạch Hỗn Loạn', 'Giới hạn Hộ Giáp HP cố định 1 điểm, giới hạn Năng Lượng cố định 999 điểm', 'khó', G => {
    set(G, 'playerHpMax', 1); set(G, 'playerArmorMax', 1); set(G, 'playerEnergyMax', 999);                                      // [LOC] 1 / 1 / 999
  });
  def('InferiorMedicine', 'Thuốc chất lượng kém', 'Chỉ số trị liệu nhận trong tất cả dạng hồi phục sẽ giảm một nửa', 'vừa', G => mul(G, 'healMul', 0.5)); // [LOC] -50% (HP, năng lượng)
  def('Huge', 'Biến To', 'Thân hình nhân vật biến to, tăng HP và giáp, giảm tốc độ di chuyển', 'vừa', G => {
    mul(G, 'sizeMul', 1.3); add(G, 'hpAdd', 2); add(G, 'armorAdd', 1); mul(G, 'moveMul', 0.85);                                 // [ƯỚC LƯỢNG] ×1,3; +2 HP, +1 giáp; chạy ×0,85
  });
  def('Tiny', 'Biến Nhỏ', 'Thân hình nhân vật biến nhỏ, giảm HP và giáp, tăng tốc độ di chuyển', 'vừa', G => {
    mul(G, 'sizeMul', 0.75); add(G, 'hpAdd', -1); add(G, 'armorAdd', -1); mul(G, 'moveMul', 1.2);                               // [ƯỚC LƯỢNG] ×0,75; -1 HP, -1 giáp; chạy ×1,2
  });
  def('RenduErmai', 'Thông Kinh Mạch', 'Tốc độ tấn công +10%; HP +1; Tốc độ di chuyển +10%; Tỉ lệ bạo kích +5%', 'dễ', G => {
    mul(G, 'fireRateMul', 1.1); add(G, 'hpAdd', 1); mul(G, 'moveMul', 1.1); add(G, 'critAdd', 5);                               // [LOC] đủ bốn số
  });
  def('Tenacious', 'Thuật Hồi HP', 'Khi HP dưới 50% tự động hồi phục', 'dễ', G => set(G, 'regenBelowHalf', true));              // [ƯỚC LƯỢNG] +1 HP mỗi 3 s
  def('HardShield', 'Vỏ Cứng Bảo Vệ', 'Khiên sẽ không khôi phục trong trận, nhưng có phòng thủ mạnh hơn', 'vừa', G => {
    set(G, 'armorNoRegen', true); add(G, 'armorAdd', 3);                                                                       // [ƯỚC LƯỢNG] giáp tối đa +3 (đổi lấy việc hết hồi giáp khi đang đánh)
  });
  def('MoreBrave', 'Càng đánh càng hăng', 'Tiêu diệt quái liên tục sẽ giúp nhân vật mạnh hơn', 'vừa', G => set(G, 'brave', true)); // [ƯỚC LƯỢNG] +4% sát thương mỗi quái liên tiếp (tối đa 10 tầng), mất sau 4 s không hạ quái

  // ---- Vũ khí / kỹ năng
  def('DoubleCd', 'CD Gấp Bội', 'Thời gian chờ kỹ năng gấp đôi', 'dễ', G => mul(G, 'skillCdMul', 2));                          // [LOC] +100%
  def('HalfCd', 'CD Giảm Nửa', 'Thời gian chờ kỹ năng giảm 50%', 'dễ', G => mul(G, 'skillCdMul', 0.5));                         // [LOC] -50%
  def('DoubleCritic', 'Thuật Cường Hóa Chính Xác', 'Tỷ lệ bạo kích của vũ khí tăng gấp đôi, DMG bạo kích giảm nửa', 'dễ', G => {
    mul(G, 'critRateMul', 2); mul(G, 'critDmgMul', 0.5);                                                                       // [LOC] +100% tỉ lệ; -50% phần cộng thêm của bạo kích (×2 → ×1,5)
  });
  def('Cruel', 'Dao Găm Điên Cuồng', 'DMG bạo kích tăng', 'dễ', G => mul(G, 'critDmgMul', 1.5));                                // [ƯỚC LƯỢNG] phần cộng thêm ×1,5 (×2 → ×2,5)
  def('FastShooter', 'Thuật Cường Hóa Tốc Đánh', 'Tốc độ tấn công của vũ khí tăng gấp đôi, nhưng tấn công giảm nửa', 'dễ', G => {
    mul(G, 'fireRateMul', 2); mul(G, 'weaponDmgMul', 0.5);                                                                     // [LOC]
  });
  def('SlowShooter', 'Thuật Cường Hóa Cơ Bắp', 'Tấn công của vũ khí tăng gấp đôi, nhưng tốc độ tấn công giảm nửa', 'dễ', G => {
    mul(G, 'weaponDmgMul', 2); mul(G, 'fireRateMul', 0.5);                                                                     // [LOC]
  });
  def('OneWeapon', 'Vũ Khí Đơn', 'Mặc định chỉ có thể mang theo 1 vũ khí', 'dễ', G => set(G, 'oneWeapon', true));
  def('MelleOnly', 'Cận Chiến Giới Hạn', 'Chỉ có thể dùng vũ khí cận chiến', 'vừa', G => set(G, 'meleeOnly', true));

  // ---- Cửa hàng / thiên phú / thú cưng / tầm nhìn
  def('Inflation', 'Tăng Giá', 'Giá thương phẩm Nhà Ngục tăng gấp đôi', 'dễ', G => mul(G, 'priceMul', 2));                      // [LOC] +100%
  def('BigSale', '3 lần đầu tiêu phí không tốn Vàng', '3 lần đầu tiêu phí không tốn Vàng', 'dễ', G => add(G, 'freeBuys', 3));    // [LOC]
  def('SaleDay', 'Ngày ưu đãi', 'Sự kiện ưu đãi Thương Nhân Thần Bí đã mở!', 'dễ', G => mul(G, 'priceMul', 0.5));                // [ƯỚC LƯỢNG] giảm nửa giá (mô tả gốc không nêu số)
  def('MoreBuff', 'Thiên Phú Dị Bẩm', 'Nhận thêm 3 vị trí thiên phú', 'dễ', G => add(G, 'buffSlots', 3));                       // [LOC] +3
  def('LessBuff', 'Thiên Phú Lựa Chọn +1', 'Giảm 1 vị trí thiên phú, nhưng khi chọn thiên phú sẽ tăng 1 mục chọn', 'dễ', G => {
    add(G, 'buffSlots', -1); add(G, 'buffChoices', 1);                                                                         // [LOC] ô -1, lựa chọn +1
  });
  def('LessChoice', 'Thiên Phú Vị Trí +1', 'Tăng 1 vị trí thiên phú, nhưng khi chọn thiên phú sẽ giảm 1 mục chọn', 'dễ', G => {
    add(G, 'buffSlots', 1); add(G, 'buffChoices', -1);                                                                         // [LOC] ô +1, lựa chọn -1
  });
  def('MoreChoice', 'Thiên Phú Tự Chọn', 'Khi chọn thiên phú tăng 2 mục lựa chọn', 'dễ', G => add(G, 'buffChoices', 2));         // [LOC] +2
  def('AllAlone', 'Dũng Sĩ Cô Độc', 'Không thể mang Pet và Lính Thuê', 'dễ', G => set(G, 'noPet', true));                       // lính thuê chưa có ở bản web
  def('Dark', 'Mắt Cận Thị', 'Tầm nhìn bị giới hạn', 'dễ', G => set(G, 'darkVision', true));

  // ---- 6 nhân tố của Mê Trận Tà Vương, tối đa 10 lần mỗi cái [LOC task/<khoá>_desc; WIKI Matrix]. Không nằm trong SK.FACTOR_KEYS (không chọn ở sảnh).
  const TV = 10;
  def('ReduceEnemyBuffImmune', 'Thuật Suy Yếu (Tà Vương)', 'Triệt tiêu 1 tầng tăng cường miễn dịch đối với hiệu quả khống chế của Uy Áp (được nhận 10 lần)', 'dễ', G => set(G, 'ctlCut', nOf(G, 'ReduceEnemyBuffImmune')), TV);
  def('ReduceEnemyMoveSpeed', 'Thuật Chậm Chạp (Tà Vương)', 'Tốc độ di chuyển của quái -1% (được nhận 10 lần)', 'dễ', G => set(G, 'enemySlow', nOf(G, 'ReduceEnemyMoveSpeed')), TV);   // -1% mỗi lần, cộng (không nhân)
  def('KillEnemyRebornTeammate', 'Thuật Hồi Sinh (Tà Vương)', 'Diệt quái có tỉ lệ hồi sinh toàn bộ đồng đội', 'dễ', G => set(G, 'rebornTeam', true));   // một người chơi: không có đồng đội để hồi sinh, chỉ giữ cờ
  def('MoreGeneEnemy', 'Đột Biến Gen (Tà Vương)', 'Tỉ lệ Quái Gen xuất hiện +2% (được nhận 10 lần)', 'vừa', G => set(G, 'mutateRate', 0.02 * nOf(G, 'MoreGeneEnemy')), TV);
  def('ExtraHurtDamage', 'Kiếm Hai Lưỡi (Tà Vương)', 'DMG nhân vật phải chịu +1, DMG quái phải chịu +2 (được nhận 10 lần)', 'vừa', G => {
    const n = nOf(G, 'ExtraHurtDamage'); set(G, 'playerHurtAdd', n); set(G, 'enemyHurtAdd', 2 * n);
  }, TV);
  def('IncreaseEnemyBuffImmune', 'Gen Miễn Dịch (Tà Vương)', 'Tăng tăng cường miễn dịch đối với hiệu quả khống chế của quái (được nhận 10 lần)', 'vừa', G => set(G, 'ctlAdd', nOf(G, 'IncreaseEnemyBuffImmune')), TV);
  // Ẩn khỏi Object.keys(SK.FACTORS) (bảng chọn ở sảnh và Treo Thưởng duyệt bằng khoá đó); vẫn tra được bằng SK.FACTORS[khoá].
  for (const k of ['ReduceEnemyBuffImmune', 'ReduceEnemyMoveSpeed', 'KillEnemyRebornTeammate', 'MoreGeneEnemy', 'ExtraHurtDamage', 'IncreaseEnemyBuffImmune']) Object.defineProperty(F, k, { enumerable: false });
  SK.TV_KEYS = ['ReduceEnemyBuffImmune', 'ReduceEnemyMoveSpeed', 'KillEnemyRebornTeammate', 'MoreGeneEnemy', 'ExtraHurtDamage', 'IncreaseEnemyBuffImmune'];

  SK.FACTOR_KEYS = Object.keys(F);
  SK.FACTOR_MAX = 3;   // [ƯỚC LƯỢNG] số nhân tố tối đa chọn một lượt (bản gốc không ghi số)

  SK.factorsOn = function (G) {
    G.mods = neutral();
    const seen = {};
    for (const k of G.factors || []) {
      if (!F[k] || seen[k]) continue;   // không trùng nhân tố [LOC I_factor_repeat]; khoá lạ bỏ qua
      seen[k] = 1; F[k].on(G);
    }
    return G.mods;
  };

  // ---------------------------------------------------------------- người chơi
  SK.factorsPlayer = function (G, p) { applyPlayer(p, G.mods); };
  function applyPlayer(p, M) {
    if (!M || !p) return;
    const keep = (a, mx) => Math.max(0, Math.min(a, mx));
    p.hpMax = Math.max(1, p.hpMax + M.hpAdd);
    p.armorMax = Math.max(0, p.armorMax + M.armorAdd);
    p.energyMax = Math.max(1, Math.round(p.energyMax * M.energyMul));
    if (M.playerHpMax) p.hpMax = M.playerHpMax;
    if (M.playerArmorMax) p.armorMax = M.playerArmorMax;
    if (M.playerEnergyMax) p.energyMax = M.playerEnergyMax;
    p.hp = keep(Math.max(p.hp + M.hpAdd, 1), p.hpMax); p.armor = keep(p.armor + M.armorAdd, p.armorMax);
    if (M.playerHpMax) p.hp = p.hpMax;
    if (M.playerArmorMax) p.armor = p.armorMax;
    p.energy = M.playerEnergyMax ? p.energyMax : Math.min(p.energyMax, Math.round(p.energy * M.energyMul));
    if (M.fireRateMul !== 1) p.rateMul = (p.rateMul == null ? 1 : p.rateMul) * M.fireRateMul;
    if (M.weaponDmgMul !== 1) p.dmgMul = (p.dmgMul == null ? 1 : p.dmgMul) * M.weaponDmgMul;
    if (M.critAdd) p.crit = (p.crit || 0) + M.critAdd;
    if (M.sizeMul !== 1) p.sizeMul = M.sizeMul;
    if (M.meleeOnly) {
      const w = p.weapons[0];
      if (!w || w.def.kind !== 'melee') {
        const pool = SK.weaponPool(1, 'chest');
        if (pool.length) p.weapons[0] = SK.makeWeapon(pool[0]);
      }
    }
    p._fxHp = p.hp; p._fxEn = p.energy;
  }

  // Thêm MỘT nhân tố giữa ván (Tà Vương ban): chạy on() của khoá mới rồi áp phần chênh lên người chơi; khoá đã có thì không làm gì
  // (factorsPlayer áp lại cả bộ nên gọi lần hai sẽ cộng hpAdd lần nữa). Trả true nếu vừa thêm.
  SK.factorsAdd = function (G, key) {
    if (!F[key] || !G.mods) return false;
    G.factors = G.factors || [];
    if (F[key].stack) {   // cộng dồn: n lần tới trần, key vào G.factors lần đầu
      G.factorStack = G.factorStack || {};
      const n = G.factorStack[key] || 0;
      if (n >= F[key].stack) return false;
      G.factorStack[key] = n + 1;
      if (G.factors.indexOf(key) < 0) G.factors.push(key);
      F[key].on(G);
      return true;
    }
    if (G.factors.indexOf(key) >= 0) return false;   // [LOC I_factor_repeat]
    const b = Object.assign({}, G.mods);
    G.factors.push(key); F[key].on(G);
    const a = G.mods, d = neutral();
    for (const k of ['hpAdd', 'armorAdd', 'critAdd']) d[k] = a[k] - b[k];
    for (const k of ['energyMul', 'fireRateMul', 'weaponDmgMul']) d[k] = a[k] / b[k];
    for (const k of ['playerHpMax', 'playerArmorMax', 'playerEnergyMax']) d[k] = a[k] !== b[k] ? a[k] : 0;
    d.sizeMul = a.sizeMul !== b.sizeMul ? a.sizeMul : 1;
    d.meleeOnly = a.meleeOnly && !b.meleeOnly;
    applyPlayer(G.player, d);
    return true;
  };

  // Người chơi giả gây vài hiệu ứng riêng (Càng đánh càng hăng): hệ số theo khoá để không giẫm lên buff/kỹ năng cùng sửa dmgMul.
  function setMulKey(p, field, key, val) {
    const k = '_fx_' + field + '_' + key, old = p[k] || 1;
    if (old === val) return;
    p[field] = (p[field] == null ? 1 : p[field]) / old * val; p[k] = val;
  }
  const BRAVE = { per: 0.04, max: 10, hold: 4 };   // [ƯỚC LƯỢNG]
  const REGEN_EVERY = 3;                           // [ƯỚC LƯỢNG] giây mỗi 1 HP khi HP < 50%
  SK.on('enemyKill', (G, e) => {
    const M = G.mods, p = G.player;
    if (!M || !M.brave || !p || (e && e.noReward)) return;
    p._braveN = Math.min(BRAVE.max, (p._braveN || 0) + 1); p._braveT = BRAVE.hold;
  });
  SK.factorsTick = function (G, p, dt) {
    const M = G.mods; if (!M || p.st === 'dead') return;
    if (M.healMul < 1) {
      // Hồi phục: phần HP / năng lượng tăng so với nhịp trước chỉ được giữ healMul (HP, năng lượng; giáp tự hồi không tính).
      if (p._fxHp != null && p.hp > p._fxHp) p.hp = Math.min(p.hpMax, p._fxHp + Math.max(1, Math.round((p.hp - p._fxHp) * M.healMul)));
      if (p._fxEn != null && p.energy > p._fxEn) p.energy = Math.min(p.energyMax, p._fxEn + Math.round((p.energy - p._fxEn) * M.healMul));
    }
    if (M.regenBelowHalf) {
      if (p.hp < p.hpMax / 2) { p._regenT = (p._regenT || 0) + dt; if (p._regenT >= REGEN_EVERY) { p._regenT = 0; p.hp = Math.min(p.hpMax, p.hp + 1); } }
      else p._regenT = 0;
    }
    if (M.brave) {
      if (p._braveT > 0) { p._braveT -= dt; if (p._braveT <= 0) p._braveN = 0; }
      setMulKey(p, 'dmgMul', 'brave', 1 + (p._braveN || 0) * BRAVE.per);
    }
    if (M.infiniteEnergy) p.energy = p.energyMax;
    p._fxHp = p.hp; p._fxEn = p.energy;
  };

  // ---------------------------------------------------------------- kẻ địch
  SK.factorsEnemyTick = function (G, e, dt) {
    const M = G.mods; if (!M || e.st === 'dead' || e.st === 'spawn') return;
    if (M.enemyAggro > 1 && e.cd > 0) e.cd -= dt * (M.enemyAggro - 1);
    if (M.enemyStunEvery && !e.bossKey && !e.boss) {
      e._fxStun = (e._fxStun == null ? SK.randf(0.3, 1) * M.enemyStunEvery : e._fxStun) - dt;
      if (e._fxStun <= 0) {
        e._fxStun = M.enemyStunEvery * SK.randf(0.7, 1.3);
        if (e.st === 'idle' || e.st === 'move') { e.st = 'stun'; e.stT = M.enemyStunDur; }
      }
    }
  };
  // Hệ số máu / tốc độ khi quái vừa sinh (game.js bọc SK.makeEnemy gọi hàm này).
  SK.factorsEnemy = function (G, e) {
    const M = G.mods; if (!M || !e) return e;
    const boss = !!(e.bossKey || e.boss);
    const hp = M.enemyHpMul * (boss ? M.bossHpMul : 1);
    if (hp !== 1) { e.hp = Math.max(1, Math.round(e.hp * hp)); e.hpMax = Math.max(1, Math.round(e.hpMax * hp)); }
    const spd = M.enemySpeedMul * (1 - 0.01 * (M.enemySlow || 0));
    if (spd !== 1 && !boss) e.moveMul = (e.moveMul || 1) * spd;
    return e;
  };

  // ---------------------------------------------------------------- GAPS: nhân tố gốc chưa làm
  // Cần đối tượng/phòng/hệ thống mới, chưa có ở web: AggressiveEnemy dùng tạm hồi chiêu; còn lại BadLuck/GoodLuck (không có điểm may mắn),
  // BlackFog, BombGift, BoxMutation, Dejavu, SleepWalking, EnemyBuffImmune (không có hệ debuff lên quái), EnemyFlash, EnemyReborn,
  // EnemySplit, Exception, FullHouse, LongMap, WrongConfig, GainMount, GainWeapon, WeaponEquip, ReforgeWeapon, HugePet, MultiStatue,
  // MelleWeaken, Painless, RandomCharactor, RebornTwice, TimeDistortion, TrackingLaser, WeaponOverheating, SuperFactor.
})();
