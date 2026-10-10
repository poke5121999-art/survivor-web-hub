// Đồ vật / NPC phòng đặc biệt trong hầm ngục: Lò Đúc Lại, Lò Khởi Nguyên, Lò Luyện Dung Hợp, Thầy Huấn Luyện.
// Đăng ký vào SK.ROOMS.extra (js/rooms.js) nên phòng đặc biệt bốc chúng theo trọng số gốc; SK_ROOMS.force.special = 'furnace' | 'furnace_inverse'
// | 'furnace_fuse' | 'trainer' ép loại phòng cho kiểm thử.
// Nguồn số: random_objects.weapon_provider [ĐO config]: furance 2, furance_inverse 2, furance_fuse 2 (điều kiện loại 0 > 2, loại 0 = chỉ số ải
// tính từ 0 [ĐO map_level_base r_slotmachine >= 6 ...], tức từ ải 1-4), tổng trọng số hợp lệ 11 (cùng cách tính với Giếng Ước ở rooms.js)
// nên mỗi lò = phần của r_weapon_provider 150 × 2/11. Luật từng món theo wiki (Reforging Furnace, Resetting Furnace, Fusion Furnace, Drillmaster);
// giá gốc không có trong dữ liệu đọc được nên ghi [ƯỚC LƯỢNG]. Prefab furance*, npc_trainer lấy từ bundle levelcommon/common.
(function () {
  'use strict';
  const SK = window.SK, R = SK.ROOMS, DS = SK.DS, G = SK.G;
  if (!R || !R.util) return;
  const U = R.util;

  // ---------------------------------------------------------------- tiện ích
  const FORGE = () => (window.SK_FORGE && SK_FORGE.forge) || {};
  const ITEMS = () => (window.SK_ITEMS && SK_ITEMS.items) || {};
  const cur = () => { const p = G.player; return p && p.weapons ? p.weapons[p.cur] : null; };
  const wdef = w => (w && DS.weapons[w.id]) || null;
  const rarityName = g => ['Trắng', 'Lục', 'Lam', 'Tím', 'Cam', 'Đỏ', 'Đỏ'][Math.max(0, Math.min(6, (g | 0) - 1))];
  // Vũ khí không bỏ vào lò được [WIKI Reforging Furnace: Qian-kun Punch, Devotee of Peace, Whistle]; dữ liệu 8.6 chỉ có Qian-kun Punch.
  const NO_FURNACE = /Qian-kun Punch|Devotee of Peace|Whistle/i;
  const invalidWeapon = d => !d || NO_FURNACE.test(d.nameEn || '') || d.prefab === 'weapon_init_airbender';
  // Ứng viên đúc/dung hợp: vũ khí đánh số thật (weapon_NNN), có sát thương, không phải vũ khí khởi đầu của nhân vật.
  const eligible = d => d && /^weapon_\d{3}$/.test(d.prefab || '') && d.dmg > 0 && (d.grade | 0) >= 1 && (d.grade | 0) <= 6 && !d.starter && SK.frame(d.sprite) && !NO_FURNACE.test(d.nameEn || '');
  // Nhóm đúc lại: cùng loại (type) ghi trên tooltip; vũ khí đỏ có nhóm riêng [WIKI "Red weapons seem to have their own type for reforging"].
  const groupOf = d => ((d.grade | 0) >= 6 ? 'red' : 'type' + d.type);
  let pools = null;
  function buildPools() {
    pools = { byGroup: {}, byGrade: {} };
    for (const [id, d] of Object.entries(DS.weapons)) {
      if (!eligible(d)) continue;
      (pools.byGroup[groupOf(d)] = pools.byGroup[groupOf(d)] || []).push(id);
      (pools.byGrade[d.grade] = pools.byGrade[d.grade] || []).push(id);
    }
  }
  const reforgePool = d => { if (!pools) buildPools(); return pools.byGroup[groupOf(d)] || []; };
  const fusePool = g => { if (!pools) buildPools(); return pools.byGrade[g] || []; };
  const pick = list => list[Math.floor(SK.rand() * list.length)];
  const price = n => R.priced(n);

  // Đổi vũ khí ở ô slot bằng vũ khí mới; việc đúc ra vũ khí mới tính một lần nhặt [WIKI Reforging Furnace "Trivia"].
  function setWeapon(slot, id) {
    const p = G.player;
    if (SK.profile && SK.profile.pickWeapon) SK.profile.pickWeapon(id);
    p.weapons[slot] = SK.makeWeapon(id);
    p.cur = slot;
    if (p.skillT > 0 && p.dual && SK.endSkill) SK.endSkill(G, p);
  }
  const say = (msg, t) => G.toast(msg, t || 2.5);
  const noGold = () => { say('Vàng không đủ'); U.snd('fx_error', 0.6); };
  const deny = msg => { say(msg); U.snd('fx_error', 0.6); };

  // ---------------------------------------------------------------- vẽ lò
  function drawFurnace(ctx, pf, x, y, lit, t) {
    for (const n of ['/img/top', '/img/botton']) {
      const q = U.prefabPart(pf, n); if (q && q.f) SK.draw(ctx, q.f, x + q.at[0], y - q.at[1]);
    }
    const q = U.prefabPart(pf, '/img/light');
    if (lit && q && q.f) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 + 0.25 * Math.sin(t * 3);
      SK.draw(ctx, q.f, x + q.at[0], y - q.at[1]);
      ctx.restore();
    }
  }
  // Dựng một lò: prop vẽ + ô chặn + điểm tương tác. spec: {key, pf, lit(it), label(it), use(it)}
  function placeFurnace(G2, r, c, spec) {
    const pf = SK.prefab(spec.pf);
    if (!pf) return false;
    const x = c[0], y = c[1] + 4;
    const it = { x, y, t: 0, uses: 0, used: false, key: spec.key, draw(ctx, G3, pr) { drawFurnace(ctx, pf, x, y, spec.lit(pr), G.t); } };
    G.props.push(it);
    U.blockRect(G.map, x - 16, y - 24, x + 16, y + 7);
    G.interactables.push({ x, y: y + 8, r: 30, labelY: 44, get gone() { return false; }, get label() { return spec.label(it); }, use() { spec.use(it); } });
    r.fill = spec.key;
    R.dnpc.last = it;
    return true;
  }

  // ---------------------------------------------------------------- Lò Đúc Lại (furance)
  // [WIKI] trả vàng, bỏ vũ khí đang cầm vào để nhận vũ khí khác CÙNG LOẠI; mỗi lần dùng sau giá gấp đôi; có thể ra lại chính nó.
  // Giá gốc 20 [ƯỚC LƯỢNG: không có trong dữ liệu; theo công thức giá vật phẩm priced()].
  const REFORGE_BASE = 20;
  const reforgePrice = it => price(REFORGE_BASE) * Math.pow(2, it.uses);
  function useReforge(it) {
    const p = G.player, w = cur(), d = wdef(w);
    if (!w || !d) { deny('Không có vũ khí'); return; }                                   // I_no_weapon
    if (invalidWeapon(d)) { deny('Vũ khí này không thể dung luyện'); return; }              // object/furnace_invalid
    const pool = reforgePool(d);
    if (!pool.length) { deny('Vũ khí này không thể dung luyện'); return; }
    const n = reforgePrice(it);
    if (!U.freeBuy()) { if (p.gold < n) { noGold(); return; } p.gold -= n; }
    it.uses++;
    const id = pick(pool);
    setWeapon(p.cur, id);
    U.snd(U.evClip('shop') || 'fx_buy', 0.7);
    U.vfx('effect_smoke', it.x, it.y - 14, {});
    say(DS.weapons[id].name);
    SK.emit('furnaceReforge', G, w.id, id, n);
  }

  // ---------------------------------------------------------------- Lò Khởi Nguyên (furance_inverse)
  // [WIKI Resetting Furnace] vứt vũ khí để nhận nguyên liệu = khoảng một phần ba công thức rèn, làm tròn lên; mỗi lò dùng một lần.
  // Công thức lấy từ data/sk-forge.js (config weapons.Materials) [ĐO]. Miễn phí [ƯỚC LƯỢNG: wiki không nêu giá].
  function resetMats(d) {
    const rec = FORGE()[d.prefab];
    const base = rec ? rec.mats : [['material_iron', Math.max(1, d.grade | 0)]];   // không có công thức: [ƯỚC LƯỢNG] sắt theo bậc
    return base.map(([k, n]) => [k, Math.max(1, Math.ceil(n / 3))]);
  }
  function useReset(it) {
    const p = G.player, w = cur(), d = wdef(w);
    if (it.used) { say('Lò đã tắt lửa'); return; }
    if (!w || !d) { deny('Không có vũ khí'); return; }
    if (invalidWeapon(d)) { deny('Vũ khí này không thể dung luyện'); return; }
    const mats = resetMats(d), got = [];
    for (const [k, n] of mats) {
      if (k === 'material_gem') SK.profile.addGems(n); else SK.profile.addItem(k, n);
      const di = ITEMS()[k];
      got.push(n + ' ' + (k === 'material_gem' ? 'Đá' : (di ? di.vi : k)));
    }
    // Vũ khí biến mất. Còn món khác thì cầm món đó; là món duy nhất thì phát lại khẩu súng yếu nhất để còn chơi tiếp [ƯỚC LƯỢNG].
    const other = p.weapons.findIndex((q, i) => q && i !== p.cur);
    if (other >= 0) { p.weapons[p.cur] = null; p.cur = other; } else p.weapons[p.cur] = SK.makeWeapon('bad_pistol');
    it.used = true; it.uses = 1;
    U.snd(U.evClip('shop') || 'fx_buy', 0.7);
    U.vfx('effect_smoke', it.x, it.y - 14, {});
    say(got.join(', '), 3);
    SK.emit('furnaceReset', G, w.id, mats);
  }

  // ---------------------------------------------------------------- Lò Luyện Dung Hợp (furance_fuse)
  // [WIKI Fusion Furnace] trả vàng, bỏ 2 vũ khí đang có: ra một vũ khí bất kỳ loại nào; hai món cùng bậc thì ra bậc cao hơn một nấc (tối đa đỏ),
  // khác bậc thì theo bậc cao nhất. Giá 30 gấp đôi mỗi lần [ƯỚC LƯỢNG].
  const FUSE_BASE = 30;
  const fusePrice = it => price(FUSE_BASE) * Math.pow(2, it.uses);
  function fuseGrade(a, b) { const hi = Math.max(a, b); return a === b ? Math.min(6, hi + 1) : hi; }
  function useFuse(it) {
    const p = G.player, held = p.weapons.map((w, i) => [w, i]).filter(q => q[0]);
    if (held.length < 2) { deny('Cần có 2 vũ khí mới có thể dung hợp'); return; }       // object/furnace_fuse_not_enough_weapon
    const [[wa, ia], [wb, ib]] = held, da = wdef(wa), db = wdef(wb);
    if (invalidWeapon(da) || invalidWeapon(db)) { deny('Vũ khí này không thể dung luyện'); return; }
    const n = fusePrice(it);
    if (!U.freeBuy()) { if (p.gold < n) { noGold(); return; } p.gold -= n; }
    it.uses++;
    const g = fuseGrade(da.grade | 0, db.grade | 0), id = pick(fusePool(g));
    p.weapons[ib] = null;
    setWeapon(ia, id);
    U.snd(U.evClip('shop') || 'fx_buy', 0.7);
    U.vfx('effect_smoke', it.x, it.y - 14, {});
    say(DS.weapons[id].name + ' (' + rarityName(g) + ')');
    SK.emit('furnaceFuse', G, wa.id, wb.id, id, n);
  }

  // ---------------------------------------------------------------- Thầy Huấn Luyện (npc_trainer)
  // [WIKI Drillmaster] xuất hiện (phòng lính thuê) khi người chơi có lính chưa huấn luyện đủ; trả vàng thì MỌI lính tăng một bậc nếu còn được;
  // mỗi bậc +15 máu (5 bậc = +75) và hung hãn hơn; mỗi lần dùng giá gấp đôi tới khi sang tầng mới (mỗi Thầy tính riêng).
  // Giá gốc 20 [ƯỚC LƯỢNG]. Hung hãn = hồi chiêu ngắn thêm 6% mỗi bậc [ƯỚC LƯỢNG]. Vũ khí tốt hơn theo bậc: lính web cầm một vũ khí cố định (chưa làm).
  // Bậc suy từ hpBonus của lính (35 nếu có Buff Thú Cưng, cộng 15 × bậc) để lính còn nguyên bậc khi qua tầng (actors.js dựng lại lính theo hpBonus).
  const TRAIN_BASE = 20, TRAIN_MAX = 5, TRAIN_HP = 15, TRAIN_ATK = 0.06;
  const rankOf = a => { const b = a.hpBonus | 0; return Math.min(TRAIN_MAX, Math.floor((b % 15 === 5 ? b - 35 : b) / TRAIN_HP)); };
  const mercs = () => (SK.livingMercs ? SK.livingMercs(G) : []);
  const trainable = () => mercs().filter(a => rankOf(a) < TRAIN_MAX);
  function hungry(a) {
    if (a._dn) return;
    a._dn = true;
    const u = a.update;
    a.update = function (G2, aa, dt) { const k = rankOf(aa); if (k) aa.cd -= dt * TRAIN_ATK * k; return u.call(this, G2, aa, dt); };
  }
  SK.on('stageEnter', () => { for (const a of mercs()) if (rankOf(a)) hungry(a); });
  const trainPrice = it => price(TRAIN_BASE) * Math.pow(2, it.uses);
  function fillTrainer(G2, r, c) {
    const pf = SK.prefab('npc_trainer');
    if (!pf || !SK.livingMercs) return false;
    const anims = (pf[0] && pf[0].a) || {}, key = Object.values(anims)[0];
    const x = c[0], y = c[1] + 8;
    const it = { x, y: y + 2, t: SK.rand() * 2, uses: 0, trainer: true, draw(ctx, G3, pr) {
      const q = U.prefabPart(pf, '/shadow'); if (q && q.f) SK.draw(ctx, q.f, x + q.at[0], y - q.at[1]);
      const fr = key && SK.animFrame(key, G.t + pr.t);
      if (!fr || !SK.draw(ctx, fr, x, y)) { ctx.fillStyle = '#d9a066'; ctx.fillRect(x - 4, y - 12, 8, 12); }
    } };
    G.props.push(it);
    U.blockRect(G.map, x - 8, y - 12, x + 8, y + 2);
    G.interactables.push({ x, y: y + 6, r: 26, labelY: 44, get gone() { return false; },
      get label() {
        if (!mercs().length) return 'Thầy Huấn Luyện — tùy tùng của bạn đâu';
        if (!trainable().length) return 'Thầy Huấn Luyện — hết gì để dạy';
        return 'Thầy Huấn Luyện — huấn luyện tùy tùng ' + trainPrice(it) + ' vàng';
      },
      use() {
        const p = G.player, list = trainable();
        if (!mercs().length) { deny('Tùy Tùng của bạn đâu'); return; }                       // object/trainer_no_target
        if (!list.length) { say('Không còn gì để dạy nữa rồi'); return; }                      // object/trainer_max_level
        const n = trainPrice(it);
        if (!U.freeBuy()) { if (p.gold < n) { noGold(); return; } p.gold -= n; }
        it.uses++;
        for (const a of list) {
          a.hpBonus = (a.hpBonus | 0) + TRAIN_HP; a.hpMax += TRAIN_HP; a.hp = Math.min(a.hpMax, a.hp + TRAIN_HP);
          a.trained = rankOf(a);
          hungry(a);
          U.vfx('effect_health', a.x, a.y - 8, { follow: a, dy: -8, scale: 0.7 });
        }
        U.snd(U.evClip('shop') || 'fx_buy', 0.7);
        say('Ừm... Xem ra anh ta đã trở nên cường tráng hơn');                                // object/trainer_talk_success
        SK.emit('mercTrain', G, list.length, n);
      } });
    r.fill = 'trainer';
    return true;
  }
  R.dnpc = { last: null, resetMats, reforgePrice, REFORGE_BASE, fuseGrade, fusePrice, fusePool, reforgePool, rankOf, trainPrice, TRAIN_MAX, TRAIN_HP };

  // ---------------------------------------------------------------- đăng ký phòng
  // Trọng số: r_weapon_provider 150 chia theo 11 trọng số hợp lệ; thầy huấn luyện dùng chỗ r_mercenary 75 khi đã có lính (phòng lính thuê tắt).
  const WP = 150 / 11;
  const mk = (key, pf, wt, extra) => ({ weight: wt, fill: (G2, r, c) => placeFurnace(G2, r, c, Object.assign({ key, pf }, extra)) });
  R.extra.furnace = mk('furnace', 'furance', () => 2 * WP, {
    lit: () => true,
    label: it => 'Lò Đúc Lại — đúc lại vũ khí đang cầm (' + reforgePrice(it) + ' vàng)', use: useReforge
  });
  R.extra.furnace_inverse = mk('furnace_inverse', 'furance_inverse', () => 2 * WP, {
    lit: it => !it.used,
    label: it => it.used ? 'Lò Khởi Nguyên — đã tắt lửa' : 'Lò Khởi Nguyên — vứt vũ khí lấy nguyên liệu', use: useReset
  });
  R.extra.furnace_fuse = mk('furnace_fuse', 'furance_fuse', () => ((G.stageIdx | 0) > 2 ? 2 * WP : 0), {
    lit: () => true,
    label: it => 'Lò Luyện Dung Hợp — bỏ 2 vũ khí (' + fusePrice(it) + ' vàng)', use: useFuse
  });
  R.extra.trainer = { weight: () => (!R.mercRoomAllowed() && trainable().length ? 75 : 0), fill: fillTrainer };
})();
