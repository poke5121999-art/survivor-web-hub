// Nhân Tố Thử Thách đợt 2: 29 nhân tố trước đây thiếu hệ thống (may mắn, debuff lên quái, phòng thêm, thú cưỡi, hồi sinh...).
// Từ lúc đó web đã có thú cưỡi/cơ giáp (mounts.js), phụ kiện vũ khí (dnpc2.js), lò đúc (dnpc.js), debuff lên quái (skills.js),
// máu thú cưng (pets.js)..., nên nay làm được. Đăng ký vào SK.FACTORS như js/factors.js (tên Việt + mô tả Việt là LOC task/<khoá>_title/_desc);
// mã lõi vẫn chỉ đọc G.mods: ở đây bọc hàm (hurtEnemy, makeWeapon, weaponPool, world.generate, G.buildWaves, G.onPlayerDead...) hoặc nghe sự kiện.
// Số lấy từ wiki "Challenge Conditions" khi có (ghi [WIKI]), LOC khi mô tả có số, chỗ nguồn không nói số ghi [ƯỚC LƯỢNG].
// Chỗ móc vào tệp khác (tối thiểu): world.js đọc stage.sideRooms (phòng phụ thêm), game.js openChest hỏi SK.factorsChest, dnpc2.js xuất N.attach.
(function () {
  'use strict';
  const SK = window.SK, DS = SK.DS, D = SK.D, T = SK.TILE, W = SK.world, F = SK.FACTORS;
  if (!F || !W) return;
  const G0 = () => SK.G;
  const mods = () => (SK.G && SK.G.mods) || {};

  function def(key, vi, desc, tier, on) { F[key] = { vi, desc, tier, on, stack: 0 }; }
  const set = (G, k, v) => { G.mods[k] = v; };

  // ---- Người chơi / Thú cưng / Vũ khí / Kẻ địch / Màn chơi: mô tả Việt nguyên văn LOC.
  def('GoodLuck', 'May mắn', 'Bạn là người may mắn hôm nay!', 'dễ', G => { G.mods.luck = (G.mods.luck || 0) + 1; });                          // [WIKI] vũ khí bậc tốt hơn có thể xuất hiện
  def('BadLuck', 'Vận xui', 'Hết vận may rồi!', 'vừa', G => { G.mods.luck = (G.mods.luck || 0) - 1; });                                         // [WIKI] hay rơi vũ khí bậc thấp
  def('BlackFog', 'Khí độc lan tràn', 'Trong khu vực sẽ tàng hình và cộng dồn debuff khí độc, sau khi cộng dồn đầy sẽ mất HP.', 'khó', G => set(G, 'blackFog', true));
  def('BombGift', 'Rương Bom', 'Rương thưởng phòng quái thường (Rương Trắng) chỉ xuất hiện Vàng hoặc Bom', 'vừa', G => set(G, 'bombGift', true));
  def('BoxMutation', 'Rương Đột Biến', 'Một số rương trong ải sẽ đột biến thành rương đặc biệt', 'dễ', G => set(G, 'boxMutation', true));
  def('Dejavu', 'Giác quan', 'Có thể sẽ gặp được ải hoàn thành giống nhau', 'dễ', G => set(G, 'dejavu', true));
  def('EnemyBuffImmune', 'Kẻ Địch Tinh Thần', 'Thời gian chịu hiệu quả bất lợi của địch giảm nửa', 'vừa', G => { G.mods.debuffMul = (G.mods.debuffMul || 1) * 0.5; });   // [LOC] -50%
  def('EnemyFlash', 'Kẻ Địch Chớp Nhoáng', 'Địch sau khi chịu DMG sẽ dịch chuyển', 'vừa', G => set(G, 'enemyFlash', 0.5));                          // [ƯỚC LƯỢNG] wiki: "may" teleport; 50% mỗi đòn
  def('EnemyReborn', 'Quái sau không tử vong có xác suất hồi sinh', 'Quái sau không tử vong có xác suất hồi sinh', 'khó', G => set(G, 'enemyReborn', 0.2));   // [ƯỚC LƯỢNG] 20%, một lần, nửa máu
  def('EnemySplit', 'Tế Bào Phân Liệt', 'HP quái dưới một nửa sẽ phân liệt', 'vừa', G => set(G, 'enemySplit', true));                          // [WIKI] hai bản mỗi bản 50% máu gốc
  def('Exception', 'Nguyên Tố Bất Thường', 'Khi nhân vật bị tấn công sẽ kèm trạng thái bất thường ngẫu nhiên, chờ 5 giây', 'khó', G => set(G, 'exception', true));   // [LOC] chờ 5 s
  def('FullHouse', 'Đèn Thần', 'Mỗi ải đều có thể gặp thêm 1 phòng đặc biệt', 'dễ', G => set(G, 'bonusSpecial', true));
  def('GainMount', 'Thuần Thú Sư', 'Mỗi lần vào cảnh mới sẽ được nhận 1 Thú Cưỡi', 'dễ', G => set(G, 'gainMount', true));
  def('GainWeapon', 'Thiên Giáng Thần Binh', 'Mỗi lần vào cảnh mới sẽ được nhận 1 vũ khí', 'dễ', G => set(G, 'gainWeapon', true));
  def('HugePet', 'Biến To Pet', 'Pet hóa khổng lồ, có lực tấn công cao và tính tấn công cao hơn', 'dễ', G => set(G, 'hugePet', true));              // [WIKI] cỡ ×2, sát thương +400%
  def('LongMap', 'Mở Rộng Nhà Ngục', 'Mỗi ải đều có xác suất xuất hiện thêm 1 phòng chiếu đấu', 'vừa', G => set(G, 'longMap', 0.5));              // [ƯỚC LƯỢNG] 50% mỗi ải
  def('MelleWeaken', 'Vũ khí cận chiến không thể tiêu hủy đạn địch', 'Vũ khí cận chiến không thể tiêu hủy đạn địch', 'vừa', G => set(G, 'meleeWeaken', true));
  def('MultiStatue', 'Đa Tượng Điêu Khắc', 'Có thể cùng lúc có nhiều hiệu quả Tượng', 'dễ', G => set(G, 'multiStatue', true));
  def('Painless', 'Không Có Tri Giác', 'Giao diện tính năng mất tác dụng', 'vừa', G => set(G, 'painless', true));                                 // [WIKI] máu, giáp, năng lượng, vàng hiện "???"
  def('RandomCharactor', 'Đa Nhân Cách', 'Khi vào tầng kế ngẫu nhiên đổi nhân vật chọn', 'vừa', G => set(G, 'randomHero', true));
  def('RebornTwice', 'Hồi Sinh Thức TỈnh', 'Số lần hồi sinh khi bị hạ +1', 'dễ', G => { G.mods.revives = (G.mods.revives || 0) + 1; });             // [LOC] +1
  def('ReforgeWeapon', 'Đúc Lại Vũ Khí', 'Khi bắt đầu mỗi ải sẽ đúc lại vũ khí trong tay', 'vừa', G => set(G, 'reforge', true));
  def('SleepWalking', 'Mộng Du', 'Thứ tự Nhà Ngục bị làm rối', 'vừa', G => set(G, 'sleepwalk', true));
  def('SuperFactor', 'Hiệu quả Nhân Tố Thử Thách khác tăng cường', 'Hiệu quả của các Nhân Tố Thử Thách khác được tăng cường', 'vừa', G => set(G, 'superFactor', true));   // LOC desc "-"; [ƯỚC LƯỢNG] độ lệch ×1,5
  def('TimeDistortion', 'Tốc độ dòng chảy thời gian không ổn định', 'Hành động của bạn lúc nhanh lúc chậm', 'vừa', G => set(G, 'timeDist', true));
  def('TrackingLaser', 'Laser theo vết', 'Laser xuất hiện định kỳ sẽ theo dõi người chơi, gây sát thương cho người chơi lẫn kẻ địch!', 'khó', G => set(G, 'trackLaser', true));
  def('WeaponEquip', 'Bậc Thầy Phụ Kiện', 'Tất cả vũ khí tự có 1 bộ phận', 'dễ', G => set(G, 'attachAll', true));
  def('WeaponOverheating', 'Vũ khí quá nóng', 'Vũ khí dạng bắn tấn công liên tục sẽ khiến tốc độ tấn công chậm đi', 'vừa', G => set(G, 'overheat', true));
  def('WrongConfig', 'Thiết lập lỗi', 'Mỗi phòng chỉ sẽ xuất hiện 1 loại kẻ địch', 'dễ', G => set(G, 'oneKind', true));

  SK.FACTOR_KEYS = Object.keys(F);

  // ---- Số [ƯỚC LƯỢNG] gom một chỗ (bộ kiểm đọc/ghi để rút ngắn thời gian chờ).
  const C = SK.factorsCfg = {
    superK: 1.5,                              // Hiệu quả tăng cường: độ lệch khỏi trung tính ×1,5
    reviveHp: 1,                              // hồi sinh: đầy HP/giáp
    splitHp: 0.5,                             // [WIKI] mỗi bản 50% máu gốc
    rebornHp: 0.5,
    boxRate: 0.4,                             // tỉ lệ thùng đột biến
    heat: { shots: 12, idle: 0.7, mul: 0.5 }, // quá nóng: 12 phát liên tiếp, nghỉ 0,7 s thì nguội, tốc đánh ×0,5
    fog: { n: 2, r: 3 * 16, up: 2, down: 6, max: 10, dmg: 2 },   // [WIKI] +1 tầng/0,5 s trong sương, -3 tầng/0,5 s ngoài sương, đủ 10 tầng mất 2 HP/giây
    ail: { cd: 5 },                           // [LOC] chờ 5 giây
    laser: { first: 6, every: 10, aim: 2, beam: 2, dmg: 2, tick: 0.25, turn: 0.9, w: 7, len: 300 },   // [WIKI] 2 s theo dõi, 2 s tia, 2 sát thương mỗi nhịp; còn lại [ƯỚC LƯỢNG]
    time: { lo: 0.6, hi: 1.5, every: [2, 4] },
    pet: { scale: 2, dmg: 5, cd: 0.7 }        // [WIKI] cỡ ×2, sát thương +400%
  };

  // ---------------------------------------------------------------- Hiệu quả tăng cường (SuperFactor)
  const MUL_KEYS = ['enemyHpMul', 'enemySpeedMul', 'enemyAggro', 'enemyBulletSpeedMul', 'spawnMul', 'critRateMul', 'critDmgMul', 'fireRateMul', 'weaponDmgMul',
    'skillCdMul', 'priceMul', 'energyMul', 'healMul', 'moveMul', 'sizeMul', 'bossHpMul', 'debuffMul'];
  const ADD_KEYS = ['enemyDef', 'hpAdd', 'armorAdd', 'buffSlots', 'buffChoices', 'freeBuys'];
  function boost(M) {
    const k = C.superK;
    for (const key of MUL_KEYS) if (M[key] != null && M[key] !== 1) M[key] = Math.max(0.05, 1 + (M[key] - 1) * k);
    for (const key of ADD_KEYS) if (M[key]) M[key] = Math.sign(M[key]) * Math.ceil(Math.abs(M[key]) * k);
    if (M.eliteRate) M.eliteRate = Math.min(1, M.eliteRate * k);
    if (M.enemyStunDur) M.enemyStunDur *= k;
  }
  const baseOn = SK.factorsOn;
  SK.factorsOn = function (G) { const M = baseOn(G); if (M.superFactor) boost(M); return M; };

  // ---------------------------------------------------------------- May mắn / Vận xui
  const baseWP = SK.weaponPool;
  SK.weaponPool = function (level, source) {
    const lk = mods().luck;
    if (lk) level = SK.clamp(level + (lk > 0 ? 1 : -1), 1, 3);   // bể vũ khí bậc trên / dưới 1 cấp
    return baseWP.call(this, level, source);
  };

  // ---------------------------------------------------------------- Bậc Thầy Phụ Kiện
  function attach(w) {
    const N = SK.ROOMS && SK.ROOMS.dnpc && SK.ROOMS.dnpc.attach;
    if (!N || !w || w.att || !DS.weapons[w.id]) return;
    const a = N.roll(DS.weapons[w.id], false);
    if (a) N.equip(w, a);
  }
  const baseMake = SK.makeWeapon;
  SK.makeWeapon = function (id) {
    const w = baseMake.call(this, id);
    if (mods().attachAll) attach(w);
    return w;
  };
  function attachAll(G) { const p = G.player; if (p && G.mods && G.mods.attachAll) for (const w of p.weapons.concat([p.dual, p.extraW])) attach(w); }

  // ---------------------------------------------------------------- Rương Bom (game.js openChest gọi SK.factorsChest)
  const baseClear = G0().onRoomCleared;
  SK.G.onRoomCleared = function (r) {
    const G = SK.G, n = G.chests.length;
    baseClear.call(this, r);
    if (G.mods && G.mods.bombGift) for (let i = n; i < G.chests.length; i++) if (G.chests[i].kind === 'reward') G.chests[i].bomb = SK.chance(0.5);   // [ƯỚC LƯỢNG] 50% bom
  };
  function boom(G, x, y, rad, dmgE, dmgP) {
    if (SK.vfx && SK.vfx.has && SK.vfx.has('explode_hit_enemy')) SK.vfx.spawn(G, 'explode_hit_enemy', x, y - 6, {});
    G.shake = Math.max(G.shake, 4);
    for (const e of G.enemies.slice()) if (e.st !== 'dead' && e.st !== 'spawn' && Math.hypot(e.x - x, e.y - y) < rad) SK.hurtEnemy(G, e, dmgE, false, Math.atan2(e.y - y, e.x - x), 3);
    const p = G.player;
    if (dmgP && p && p.st !== 'dead' && Math.hypot(p.x - x, p.y - y) < rad) SK.hurtPlayer(G, dmgP, x, y);
  }
  SK.factorsChest = function (G, c) {
    const M = G.mods;
    if (!M || !M.bombGift || c.kind !== 'reward') return false;
    if (c.bomb) boom(G, c.x, c.y, 32, 2, 2);                                   // [WIKI] mở rương là nổ ngay, 2 sát thương, không gây cháy
    else for (let i = 0, n = SK.randi(4, 8); i < n; i++) SK.dropPickup(G, 'coin', c.x, c.y - 6);
    return true;
  };

  // ---------------------------------------------------------------- Rương Đột Biến
  const KIT = () => SK.skillKit || {};
  const BOX_OUT = [['coin', 3], ['energy', 3], ['hp_pot', 1], ['bomb', 2], ['poison', 1.5], ['ice', 1.5]];   // [ƯỚC LƯỢNG] trọng số (wiki: độc, băng, bom, năng lượng, vàng...)
  SK.on('stageEnter', G => {
    G._boxLog = [];
    if (!G.mods || !G.mods.boxMutation) return;
    for (const o of G.map.obs.values()) if (o.kind === 'box' && SK.chance(C.boxRate)) o.mutated = true;
    G.props.push({ x: 0, y: 1e8, t: 0, draw(ctx, G2) {
      for (const o of G2.map.obs.values()) {
        if (!o.mutated || !(o.hp > 0)) continue;
        ctx.save(); ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#8a3fd1'; ctx.fillRect(o.x - 6, o.y - 14, 12, 12);
        ctx.strokeStyle = '#2a0f45'; ctx.lineWidth = 1; ctx.strokeRect(o.x - 5.5, o.y - 13.5, 11, 11);
        ctx.restore();
        SK.text(ctx, '?', o.x, o.y - 4, 9, '#fff3a0', 'center', '#2a0f45');
      }
    } });
  });
  SK.on('obstacleBreak', (G, o) => {
    if (!o || !o.mutated || !G.mods || !G.mods.boxMutation) return;
    let t = SK.rand() * BOX_OUT.reduce((a, q) => a + q[1], 0), kind = BOX_OUT[0][0];
    for (const q of BOX_OUT) { if ((t -= q[1]) < 0) { kind = q[0]; break; } }
    (G._boxLog = G._boxLog || []).push(kind);
    const x = o.x, y = o.y - 4;
    if (kind === 'coin') for (let i = 0; i < 5; i++) SK.dropPickup(G, 'coin', x, y);
    else if (kind === 'energy') for (let i = 0; i < 3; i++) SK.dropPickup(G, 'energy', x, y);
    else if (kind === 'hp_pot') SK.dropPickup(G, 'hp_pot', x, y);
    else if (kind === 'bomb') boom(G, x, y, 36, 4, 2);
    else for (const e of G.enemies) if (e.st !== 'dead' && e.st !== 'spawn' && Math.hypot(e.x - x, e.y - y) < 44 && KIT().debuff) KIT().debuff(G, e, kind);   // vũng độc / mảnh băng
  });

  // ---------------------------------------------------------------- Giác quan, Mở Rộng Nhà Ngục, Đèn Thần (dựng màn)
  const baseGen = W.generate;
  W.generate = function (stage) {
    const G = SK.G, M = (G && G.mods) || {};
    if (!M.dejavu && !M.longMap && !M.bonusSpecial) return baseGen.call(this, stage);
    let st = stage;
    const side = [];
    if (!stage.br && !stage.final) {
      if (M.longMap && SK.chance(M.longMap)) side.push('battle');
      if (M.bonusSpecial) side.push('special');
    }
    if (M.dejavu) {
      if (stage === SK.STAGES[0] || !G._dv) G._dv = [];
      const prior = !stage.boss && !stage.br ? G._dv.filter(q => q.level === stage.level && q.n !== stage.n) : [];
      if (prior.length && SK.chance(0.5)) {                                      // [ƯỚC LƯỢNG] 50%: dựng lại đúng ải đã qua (cùng hạt giống, cùng nhãn)
        const q = SK.pick(prior);
        SK.setSeed(q.seed);
        st = Object.assign({}, stage, { label: q.label, n: q.n });
        G.dejavuOf = q.label;
      } else {
        G.dejavuOf = null;
        if (!stage.boss && !stage.br) G._dv.push({ level: stage.level, n: stage.n, label: stage.label, seed: SK.peekSeed() });
      }
    }
    st = Object.assign({}, st, { sideRooms: side });
    try { return baseGen.call(this, st); } catch (e) {
      SK.warnOnce('fx2gen', 'phòng phụ thêm không đặt được: ' + e.message);
      return baseGen.call(this, Object.assign({}, st, { sideRooms: [] }));
    }
  };

  // ---------------------------------------------------------------- Thiết lập lỗi (mỗi phòng một loại quái)
  const baseWaves = G0().buildWaves;
  const consume = id => { const a = D.enemies[id] && D.enemies[id].ai[0]; return Math.max(1, (a && a.p && a.p.consume) || 1); };
  SK.G.buildWaves = function (r) {
    const G = SK.G, waves = baseWaves.call(this, r);
    if (!G.mods || !G.mods.oneKind || r.type === 'boss') return waves;
    const ids = []; for (const w of waves) for (const id of w) ids.push(id);
    if (!ids.length) return waves;
    const one = SK.pick(ids);   // cả phòng cùng loại, tinh anh thì cả phòng đều tinh anh
    return waves.map(w => {
      const budget = w.reduce((a, id) => a + consume(id), 0);
      return Array(Math.max(1, Math.floor(budget / consume(one)))).fill(one);
    });
  };

  // ---------------------------------------------------------------- Mộng Du (xáo thứ tự ải), Thuần Thú Sư, Thiên Giáng Thần Binh, Đúc Lại, Đa Nhân Cách, Biến To Pet
  const mountIds = () => {
    const M = window.SK_MOUNTS; if (!M || !M.sellers) return [];
    return (M.sellers.creature || []).concat((M.sellers.mech || []).filter(id => SK.mechImpl && SK.mechImpl(id)));
  };
  const heroIds = () => Object.keys(DS.heroes).filter(id => !/^envoy/.test(id) && D.heroes && D.heroes[id]);
  function swapHero(G, p, id) {
    const M = G.mods, rt = { hp: p.hp / p.hpMax, ar: p.armorMax ? p.armor / p.armorMax : 1, en: p.energy / p.energyMax };
    if (p.skillT > 0) SK.endSkill(G, p);
    const np = SK.makePlayer(id, p.x, p.y);
    for (const k of ['hero', 'h', 'anims', 'sm']) p[k] = np[k];
    p.hpMax = M.playerHpMax || Math.max(1, np.hpMax + (M.hpAdd || 0));
    p.armorMax = M.playerArmorMax || Math.max(0, np.armorMax + (M.armorAdd || 0));
    p.energyMax = M.playerEnergyMax || Math.max(1, Math.round(np.energyMax * (M.energyMul || 1)));
    p.crit = np.crit + (M.critAdd || 0);
    p.hp = SK.clamp(Math.ceil(rt.hp * p.hpMax), 1, p.hpMax);      // [WIKI] cùng tỉ lệ máu/năng lượng với tầng trước, làm tròn lên
    p.armor = SK.clamp(Math.ceil(rt.ar * p.armorMax), 0, p.armorMax);
    p.energy = SK.clamp(Math.ceil(rt.en * p.energyMax), 0, p.energyMax);
    p.skillCd = 0; p.skillT = 0; p.dual = null; p._fxHp = p.hp; p._fxEn = p.energy;
    G.heroId = id;
  }
  function huge(G) {
    const a = G.pet; if (!a || !G.mods.hugePet || a._huge) return;
    a._huge = true; a.scale = C.pet.scale;
    a.k = Object.assign({}, a.k, { dmg: a.k.dmg * C.pet.dmg, cd: a.k.cd * C.pet.cd });
  }
  function gainMount(G) {
    const st = G.stage, p = G.player; if (!G.mods.gainMount || !p || st.n !== 1 || st.br) return;
    const ids = mountIds(); if (ids.length && SK.mountOn) SK.mountOn(G, p, SK.pick(ids));
  }
  SK.on('stageEnter', G => {
    const M = G.mods, p = G.player; if (!M || !p) return;
    const st = G.stage, first = G.stageIdx === 0;
    if (first && M.sleepwalk && G.mode === 'level') {
      const S = SK.STAGES, hi = S.length - (S[S.length - 1].final ? 1 : 0);
      const mid = SK.shuffle(S.slice(1, hi));
      for (let i = 0; i < mid.length; i++) S[i + 1] = mid[i];
    }
    if (M.randomHero && !first && !st.br) { const ids = heroIds().filter(id => id !== p.hero); if (ids.length) swapHero(G, p, SK.pick(ids)); }
    if (M.reforge && !st.final) {
      const N = SK.ROOMS && SK.ROOMS.dnpc;
      if (N) for (let i = 0; i < p.weapons.length; i++) {
        const w = p.weapons[i], d = w && DS.weapons[w.id];
        if (!d || N.invalidWeapon(d)) continue;
        const pool = N.reforgePool(d);
        if (pool.length) p.weapons[i] = SK.makeWeapon(SK.pick(pool));
      }
    }
    attachAll(G);
    if (!first) gainMount(G);   // 1-1: mounts.js xoá thú cưỡi ở sự kiện runStart (sau stageEnter), nên chỗ đó cấp ở runStart
    if (M.gainWeapon && st.n === 1 && !st.br) {
      const pool = SK.weaponPool(st.level, 'chest');
      if (pool.length) G.items.push({ id: SK.pick(pool), x: p.x, y: p.y + 18, t: 0 });
    }
    huge(G);
  });
  SK.on('runStart', G => {
    G.revivesLeft = (G.mods && G.mods.revives) || 0;
    if (G.player) { G.player._ail = null; G.player._fog = 0; G.player._heat = 0; }
    attachAll(G); huge(G);
    if (G.mods && G.mods.gainMount) gainMount(G);
  });

  // ---------------------------------------------------------------- Hồi sinh thức tỉnh
  const baseDead = SK.G.onPlayerDead;
  SK.G.onPlayerDead = function () {
    const G = SK.G, p = G.player;
    if (G.mods && G.revivesLeft > 0 && G.state === 'stage' && p) {
      G.revivesLeft--;                                                  // [ƯỚC LƯỢNG] web chưa có hồi sinh bằng Ngọc ở ải thường: nhân tố cho thẳng
      p.st = 'alive'; p.stT = 0; p.hp = p.hpMax; p.armor = p.armorMax; p.invulT = 2.5; p._fxHp = p.hp;
      G.toast('Hồi sinh!', 2);
      return;
    }
    return baseDead.apply(this, arguments);
  };

  // ---------------------------------------------------------------- Đa Tượng Điêu Khắc (giữ mọi tượng đã dâng)
  SK.on('statueBuy', G => {
    const p = G.player; if (!p || !G.mods || !G.mods.multiStatue) return;
    for (const id of p._fxSt || []) if (p.statues.indexOf(id) < 0) { p.statues.push(id); p.statueCds[id] = (p._fxStCd && p._fxStCd[id]) || 0; }
    p._fxSt = p.statues.slice(); p._fxStCd = Object.assign({}, p.statueCds);
  });

  // ---------------------------------------------------------------- Kẻ địch: chớp nhoáng, phân liệt, hồi sinh, chịu debuff ngắn
  const isBoss = e => !!(e.bossKey || e.boss);
  function freeSpot(G, e) {
    const r = e.room; if (!r) return null;
    for (let k = 0; k < 14; k++) {
      const x = (SK.randi(r.x0 + 1, r.x1 - 1)) * T + 8, y = (SK.randi(r.y0 + 1, r.y1 - 1)) * T + 12;
      if (!W.solidAt(G.map, x, y) && !W.solidAt(G.map, x - 5, y) && !W.solidAt(G.map, x + 5, y) && !W.solidAt(G.map, x, y - 5)) return [x, y];
    }
    return null;
  }
  SK.on('enemyHit', (G, e) => {
    const M = G.mods; if (!M || !M.enemyFlash || !e || isBoss(e) || e.st === 'spawn' || !SK.chance(M.enemyFlash)) return;
    const s = freeSpot(G, e); if (s) { SK.fx(G, 'spawn', e.x, e.y, { dur: 0.3 }); e.x = s[0]; e.y = s[1]; e.flashed = (e.flashed || 0) + 1; }
  });
  SK.on('enemyKill', (G, e) => {
    const M = G.mods; if (!M || !M.enemyReborn || !e || isBoss(e) || e._reborn || e.noReward || !SK.chance(M.enemyReborn)) return;
    e._reborn = true; e.noReward = true;
    e.st = 'spawn'; e.stT = 0.7; e.hpMax = Math.max(1, Math.round(e.hpMax * C.rebornHp)); e.hp = e.hpMax; e.kx = e.ky = 0;
    G.kills = Math.max(0, G.kills - 1);
    SK.fx(G, 'spawn', e.x, e.y, { dur: 0.7 });
  });
  const baseHE = SK.hurtEnemy;
  SK.hurtEnemy = function (G, e, ...rest) {
    const r = baseHE.call(this, G, e, ...rest);
    const M = G.mods;
    if (r && M && M.enemySplit && e && e.st !== 'dead' && e.st !== 'spawn' && !e._split && !isBoss(e) && e.hp < e.hpMax / 2 && !(e.p && e.p.kinematic)) {
      const half = Math.max(1, Math.ceil(e.hpMax / 2));
      for (const dx of [-7, 7]) {
        let x = e.x + dx, y = e.y;
        if (W.solidAt(G.map, x, y)) { x = e.x; }
        const c = SK.makeEnemy(G, e.id, x, y, e.room);
        c.hpMax = c.hp = half; c._split = true; c.stT = 0.3;
        G.enemies.push(c);
      }
      e._split = true; e.st = 'dead'; e.hp = 0; e.noReward = true; e.draw = () => {};   // bản gốc biến mất, không tính hạ quái
    }
    return r;
  };
  SK.on('statusApply', (G, e, kind) => { if (G.mods && G.mods.debuffMul && e._bmSt && e._bmSt[kind]) e._bmSt[kind].t *= G.mods.debuffMul; });

  // ---------------------------------------------------------------- Vũ khí cận chiến không tiêu hủy đạn địch
  const WK = SK.WEAPON_KINDS;
  if (WK && WK.melee) {
    const baseFire = WK.melee.fire;
    WK.melee.fire = function (G, p, w, o) {
      if (!(G.mods && G.mods.meleeWeaken) || p.reflectBullets) return baseFire.apply(this, arguments);
      const pre = G.bullets.filter(b => b.side === 'e' && !b.dead);
      const r = baseFire.apply(this, arguments);
      for (const b of pre) if (b.dead && !(b.life <= 0)) b.dead = false;
      return r;
    };
  }
  const baseUB = SK.updateBullets;
  SK.updateBullets = function (G, dt) {
    const M = G.mods, p = G.player;
    if (!M || !M.meleeWeaken || !p || p.reflectBullets) return baseUB.call(this, G, dt);
    const slashes = G.bullets.filter(b => b.side === 'p' && b.melee && !b.dead);
    if (!slashes.length) return baseUB.call(this, G, dt);
    const pre = G.bullets.filter(b => b.side === 'e' && !b.dead), hp0 = p.hp + p.armor;
    const r = baseUB.call(this, G, dt);
    if (p.hp + p.armor >= hp0) for (const b of pre) {
      if (!b.dead || b.life <= 0 || W.solidAt(G.map, b.x, b.y + (b.h || 0))) continue;
      if (slashes.some(s => Math.hypot(s.x - b.x, s.y - b.y) < 72)) b.dead = false;
    }
    return r;
  };

  // ---------------------------------------------------------------- Nguyên Tố Bất Thường
  const AIL = [
    { k: 'burn', vi: 'Cháy', t: 3, dmg: 1, every: 1 },     // [ƯỚC LƯỢNG] cả bốn trạng thái
    { k: 'poison', vi: 'Trúng độc', t: 4, dmg: 1, every: 1 },
    { k: 'ice', vi: 'Đóng băng', t: 2, slow: 0.3 },
    { k: 'shock', vi: 'Tê liệt', t: 0.8, slow: 0 }
  ];
  function setKeyMul(p, field, key, val) {
    const k = '_fx2_' + field + '_' + key, old = p[k] == null ? 1 : p[k];
    if (old === val) return;
    p[field] = (p[field] == null ? 1 : p[field]) / (old || 1) * val; p[k] = val;
  }
  SK.on('playerHurt', (G, p) => {
    const M = G.mods; if (!M || !M.exception || G._fxDot || p.st === 'dead') return;
    if (p._ailAt != null && G.t - p._ailAt < C.ail.cd) return;
    p._ailAt = G.t;
    const a = SK.pick(AIL);
    if (p._ail && p._ail.slow != null) setKeyMul(p, 'moveMul', 'ail', 1);
    p._ail = { k: a.k, t: a.t, tick: a.every || 0, dmg: a.dmg, every: a.every, slow: a.slow };
    if (a.slow != null) setKeyMul(p, 'moveMul', 'ail', a.slow || 0.0001);
    G.toast(a.vi + '!', 1.2);
  });
  function ailTick(G, p, dt) {
    const a = p._ail; if (!a) return;
    a.t -= dt;
    if (a.every) { a.tick -= dt; if (a.tick <= 0) { a.tick += a.every; G._fxDot = true; SK.hurtPlayer(G, a.dmg); G._fxDot = false; } }
    if (a.t <= 0) { if (a.slow != null) setKeyMul(p, 'moveMul', 'ail', 1); p._ail = null; }
  }

  // ---------------------------------------------------------------- Khí độc lan tràn
  SK.on('stageEnter', G => {
    G._fog = []; G._laser = null; G._laserWait = 0; G._laserNext = null;
    if (!G.mods || !G.mods.blackFog) return;
    const rooms = G.map.rooms.filter(r => r.type !== 'start' && r.type !== 'end');
    for (const r of SK.shuffle(rooms.slice()).slice(0, C.fog.n)) G._fog.push({ x: (r.cx + SK.randi(-3, 3)) * T + 8, y: (r.cy + SK.randi(-3, 3)) * T + 8, r: C.fog.r, room: r });
    G.props.push({ x: 0, y: 1e8 - 1, t: 0, draw(ctx, G2) {
      for (const z of G2._fog || []) {
        const a = 0.32 + 0.06 * Math.sin(G2.t * 2 + z.x), g = ctx.createRadialGradient(z.x, z.y, z.r * 0.2, z.x, z.y, z.r);
        g.addColorStop(0, 'rgba(120,40,170,' + a + ')'); g.addColorStop(1, 'rgba(120,40,170,0)');
        ctx.fillStyle = g; ctx.fillRect(z.x - z.r, z.y - z.r, z.r * 2, z.r * 2);
      }
    } });
  });
  function fogTick(G, p, dt) {
    const f = C.fog, inside = (G._fog || []).some(z => Math.hypot(p.x - z.x, p.y - 4 - z.y) < z.r);
    p._fog = SK.clamp((p._fog || 0) + (inside ? f.up : -f.down) * dt, 0, f.max);
    if (inside) { p.hidden = true; p._fogHid = true; } else if (p._fogHid) { p.hidden = false; p._fogHid = false; }   // trong sương: quái không thấy
    if (p._fog >= f.max) { p._fogT = (p._fogT || 0) + dt; if (p._fogT >= 1) { p._fogT -= 1; G._fxDot = true; SK.hurtPlayer(G, f.dmg); G._fxDot = false; } }
    else p._fogT = 0;
  }

  // ---------------------------------------------------------------- Vũ khí quá nóng
  const HEATK = { gun: 1, launcher: 1, laser: 1 };
  SK.on('fire', (G, p, w) => {
    if (!G.mods || !G.mods.overheat || !w || !HEATK[w.def.kind]) return;
    p._heat = (p._heat || 0) + 1; p._heatIdle = 0;
    if (p._heat >= C.heat.shots) setKeyMul(p, 'rateMul', 'heat', C.heat.mul);
  });
  function heatTick(G, p, dt) {
    if (!(p._heat > 0)) return;
    p._heatIdle = (p._heatIdle || 0) + dt;
    if (p._heatIdle > C.heat.idle) { p._heat = 0; setKeyMul(p, 'rateMul', 'heat', 1); }
  }

  // ---------------------------------------------------------------- Tốc độ dòng chảy thời gian
  function timeRoll(o, key, G) { o[key] = SK.randf(C.time.lo, C.time.hi); o[key + 'T'] = SK.randf(C.time.every[0], C.time.every[1]); }
  function timeTick(G, p, dt) {
    p._tdT = (p._tdT == null ? 0 : p._tdT) - dt;
    if (p._tdT <= 0) { timeRoll(p, '_tdM', G); p._tdT = p._tdMT; setKeyMul(p, 'moveMul', 'td', p._tdM); }
  }

  // ---------------------------------------------------------------- Laser theo vết
  function laserTick(G, p, dt) {
    const L = C.laser, r = G.room;
    if (G._laser) return;
    if (!r || r.state !== 'locked') { G._laserWait = 0; return; }
    G._laserWait = (G._laserWait || 0) + dt;
    if (G._laserWait < (G._laserNext != null ? G._laserNext : L.first)) return;
    G._laserWait = 0; G._laserNext = L.every;
    const O = [r.cx * T + 8, (r.y0 + 0.5) * T];
    const z = G._laser = { O, t: 0, ang: Math.atan2(p.y - 6 - O[1], p.x - O[0]), tick: 0, hits: 0, pHits: 0 };
    G.props.push({ x: O[0], y: O[1], t: 0,
      update(G2, pr, dt2) {
        const q = G2.player; z.t += dt2;
        if (!q || q.st === 'dead' || z.t >= L.aim + L.beam || (G2.room && G2.room !== r)) { pr.gone = true; G2._laser = null; return; }
        const want = Math.atan2(q.y - 6 - O[1], q.x - O[0]);
        if (z.t < L.aim) z.ang = want;                       // giai đoạn xanh: bám sát người chơi
        else {                                               // giai đoạn đỏ: tia quét về phía người chơi chậm
          let d = want - z.ang; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
          z.ang += SK.clamp(d, -L.turn * dt2, L.turn * dt2);
          z.tick -= dt2;
          if (z.tick <= 0) {
            z.tick += L.tick;
            const hit = (x, y) => { const px = x - O[0], py = y - O[1], u = SK.clamp(px * Math.cos(z.ang) + py * Math.sin(z.ang), 0, L.len); return Math.hypot(px - Math.cos(z.ang) * u, py - Math.sin(z.ang) * u) < L.w; };
            for (const e of G2.enemies.slice()) if (e.st !== 'dead' && e.st !== 'spawn' && hit(e.x, e.y - 6)) { SK.hurtEnemy(G2, e, L.dmg, false, z.ang, 0); z.hits++; }
            if (hit(q.x, q.y - 6)) { SK.hurtPlayer(G2, L.dmg, O[0], O[1]); z.pHits++; }
          }
        }
      },
      draw(ctx, G2) {
        const beam = z.t >= L.aim, red = beam || z.t > L.aim - 0.4, x1 = O[0] + Math.cos(z.ang) * L.len, y1 = O[1] + Math.sin(z.ang) * L.len;
        ctx.save(); ctx.lineCap = 'round';
        if (beam) {
          ctx.strokeStyle = 'rgba(255,60,40,0.35)'; ctx.lineWidth = L.w * 2; ctx.beginPath(); ctx.moveTo(O[0], O[1]); ctx.lineTo(x1, y1); ctx.stroke();
          ctx.strokeStyle = '#fff2c0'; ctx.lineWidth = 2.5;
        } else { ctx.strokeStyle = red ? 'rgba(255,60,40,0.9)' : 'rgba(90,255,120,0.8)'; ctx.lineWidth = 1.2; }
        ctx.beginPath(); ctx.moveTo(O[0], O[1]); ctx.lineTo(x1, y1); ctx.stroke();
        ctx.restore();
      } });
  }

  // ---------------------------------------------------------------- nhịp người chơi / kẻ địch (bọc hàm của factors.js)
  const baseTick = SK.factorsTick;
  SK.factorsTick = function (G, p, dt) {
    baseTick.call(this, G, p, dt);
    const M = G.mods; if (!M || p.st === 'dead') return;
    if (M.multiStatue) { p._fxSt = p.statues ? p.statues.slice() : []; p._fxStCd = Object.assign({}, p.statueCds || {}); }
    if (M.exception) ailTick(G, p, dt);
    if (M.blackFog) fogTick(G, p, dt);
    if (M.overheat) heatTick(G, p, dt);
    if (M.timeDist) timeTick(G, p, dt);
    if (M.trackLaser) laserTick(G, p, dt);
  };
  const baseETick = SK.factorsEnemyTick;
  SK.factorsEnemyTick = function (G, e, dt) {
    baseETick.call(this, G, e, dt);
    const M = G.mods; if (!M || e.st === 'dead' || e.st === 'spawn') return;
    if (M.debuffMul && e._db) for (const k in e._db) {
      const b = e._db[k];
      if (b._fxT == null || b.t > b._fxT + 1e-6) {      // mới gây hoặc vừa gia hạn: rút ngắn theo hệ số
        b.t *= M.debuffMul;
        if (b.freeze && e.st === 'stun' && e.stT > b.t) e.stT = b.t;
      }
      b._fxT = b.t;
    }
    if (M.timeDist && !isBoss(e)) {
      e._tdT = (e._tdT == null ? 0 : e._tdT) - dt;
      if (e._tdT <= 0) { timeRoll(e, '_tdM', G); e._tdT = e._tdMT; setKeyMul(e, 'moveMul', 'td', e._tdM); }
    }
  };

  // ---------------------------------------------------------------- HUD: viền tốc độ, sương độc, Không Có Tri Giác
  SK.on('hud', (ctx, G) => {
    const M = G.mods, p = G.player, v = SK.view; if (!M || !p || G.state !== 'stage') return;
    if (M.timeDist && p._tdM && Math.abs(p._tdM - 1) > 0.02) {
      const fast = p._tdM > 1, a = 0.45 + 0.15 * Math.sin(G.t * 6), c = fast ? '60,255,110' : '255,60,50', b = 5;
      ctx.save(); ctx.fillStyle = 'rgba(' + c + ',' + a + ')';
      ctx.fillRect(0, 0, v.w, b); ctx.fillRect(0, v.h - b, v.w, b); ctx.fillRect(0, 0, b, v.h); ctx.fillRect(v.w - b, 0, b, v.h);
      ctx.restore();
    }
    if (M.blackFog && p._fog > 0) {
      ctx.save(); ctx.fillStyle = 'rgba(110,30,160,' + (0.05 + 0.22 * p._fog / C.fog.max) + ')'; ctx.fillRect(0, 0, v.w, v.h); ctx.restore();
      SK.text(ctx, 'Khí độc ' + Math.floor(p._fog) + '/' + C.fog.max, v.w / 2, 40, 8, '#d9a8ff', 'center', 'rgba(0,0,0,0.9)');
    }
    if (M.painless && SK.hud && SK.hud.rect) {
      const k = v.scale;
      for (const path of ['state_bar/hp_bar/Text', 'state_bar/armor_bar/Text', 'state_bar/energy_bar/Text', 'info_bar/coin/Text']) {
        const r = SK.hud.rect(path); if (!r) continue;
        const w = Math.min(r.w / k, 34), h = Math.min(r.h / k, 11), cx = (r.x + r.w / 2) / k, cy = (r.y + r.h / 2) / k;
        ctx.save(); ctx.fillStyle = 'rgba(24,22,34,0.92)'; ctx.fillRect(cx - w / 2, cy - h / 2, w, h); ctx.restore();
        SK.text(ctx, '???', cx, cy + 3, 8, '#ffffff', 'center', 'rgba(0,0,0,0.9)');
      }
    }
  });
})();
