// Đồ vật / NPC phòng đặc biệt đợt 2: Người Câu Cá (npc_weapon_item_fish), Máy Thử Vận May (slotmachine), Đạo Sư (npc_skill_update),
// Thợ Thủ Công (npc_smith). Đăng ký vào SK.ROOMS.extra như js/dnpc.js; SK_ROOMS.force.special = 'fishnpc' | 'slotmachine' | 'mentor' | 'smith'.
// Nguồn: random_objects.weapon_provider [CFG]: npc_weapon_item_fish 1, npc_skill_update 1, npc_smith 4 trên cùng tổng 11 trọng số hợp lệ
// nên mỗi đơn vị = r_weapon_provider 150 / 11 (cùng cách tính với js/dnpc.js); map_levels.SpecialRooms: r_slotmachine trọng số 10 từ chỉ số
// ải >= 6 [CFG]. Luật từng món theo wiki (Weaponsmith, Attachments, Mentor) và LOC (object/smith_*, object/skill_update_*,
// object/weapon_item_fish_talk_*, object/slotmachine_*); giá và xác suất không nằm trong dữ liệu đọc được nên ghi [ƯỚC LƯỢNG].
(function () {
  'use strict';
  const SK = window.SK, R = SK.ROOMS, DS = SK.DS, G = SK.G;
  if (!R || !R.util || !R.dnpc) return;
  const U = R.util, N = R.dnpc, WP = N.WP;
  const price = n => R.priced(n);
  const say = N.say, deny = N.deny;
  const pay = n => { const p = G.player; if (U.freeBuy()) return true; if (p.gold < n) { N.noGold(); return false; } p.gold -= n; return true; };
  const pickOf = list => list[Math.floor(SK.rand() * list.length)];
  function weighted(list, wf) {
    let t = SK.rand() * list.reduce((a, x) => a + wf(x), 0);
    for (const x of list) { if ((t -= wf(x)) < 0) return x; }
    return list[list.length - 1];
  }
  const RAR = { white: 'Trắng', green: 'Lục', blue: 'Lam', purple: 'Tím', orange: 'Cam', red: 'Đỏ' };

  // Dựng một NPC / vật đứng yên: prop vẽ + ô chặn + điểm tương tác. spec: {key, pf, dy, label(it), use(it), draw(ctx, pf, x, y, pr), update(it, dt)}
  function placeNpc(r, c, spec) {
    const pf = SK.prefab(spec.pf);
    if (!pf) return false;
    const x = c[0], y = c[1] + (spec.dy == null ? 8 : spec.dy);
    const it = Object.assign({ x, y: y + 2, t: SK.rand() * 2, key: spec.key, used: false, uses: 0, anim: 0 }, spec.init || {});
    it.draw = (ctx, G3, pr) => spec.draw(ctx, pf, x, y, it);
    it.update = (G3, pr, dt) => { it.t += dt; if (it.anim > 0) it.anim = Math.max(0, it.anim - dt); if (spec.update) spec.update(it, dt); };
    G.props.push(it);
    U.blockRect(G.map, x - (spec.bw || 10), y - (spec.bh || 14), x + (spec.bw || 10), y + 2);
    G.interactables.push({ x, y: y + 8, r: 28, labelY: 46, get gone() { return false; }, get label() { return spec.label(it); }, use() { spec.use(it); } });
    r.fill = spec.key;
    N.last2 = it;
    return true;
  }

  // ================================================================ phụ kiện vũ khí (Thợ Thủ Công + Người Câu Cá)
  // Bản tối thiểu của hệ phụ kiện [WIKI Attachments]: mỗi vũ khí gắn tối đa 1 phụ kiện (gắn cái khác thì cái cũ bị thay); chỉ nhóm "Chỉ số".
  // Số theo bảng wiki. Vũ khí đỏ/hồng, vũ khí chỉ câu cá, Qian-kun Punch không gắn được. Phụ kiện thuộc vũ khí (w.att), mất khi vũ khí bị
  // đúc lại/dung hợp (wiki: rơi ra; web chưa có phụ kiện rơi nhặt được).
  // var: [độ hiếm, số]; k: loại vũ khí gắn được (d.kind); fish: phụ kiện câu cá (Người Câu Cá bán), còn lại do Thợ Thủ Công làm.
  const ATT = {
    grindstone: { vi: 'Đá Mài Dao', k: ['melee'], var: [['white', 2], ['blue', 3], ['purple', 4]], eff: v => ({ dmg: v }), txt: v => 'sát thương +' + v },
    gauss: { vi: 'Cuộn Dây Gaussian', k: ['gun', 'launcher'], var: [['white', 1], ['blue', 2], ['purple', 3]], eff: v => ({ dmg: v }), txt: v => 'sát thương +' + v },
    collector: { vi: 'Máy Tụ Năng', k: ['laser'], var: [['white', 1], ['green', 2], ['blue', 3]], eff: v => ({ dmg: v }), txt: v => 'sát thương +' + v },
    chip: { vi: 'Chip “Tàn Khốc”', k: null, var: [['white', 5], ['blue', 10], ['orange', 15]], eff: v => ({ crit: v }), txt: v => 'tỉ lệ bạo kích +' + v + '%' },
    reactor: { vi: 'Lò Phản Ứng Hiệu Suất Cao', k: ['gun', 'laser', 'launcher', 'staff', 'bow'], needCost: true, var: [['green', 1], ['blue', 2], ['orange', 3]], eff: v => ({ cost: -v }), txt: v => 'tiêu hao năng lượng -' + v },
    barnacle: { vi: 'Balanus', fish: true, k: null, var: [['blue', 1]], eff: v => ({ dmg: v, rpsMul: 0.95 }), txt: v => 'sát thương +' + v + ', tốc đánh -5%' },
    whetstone: { vi: 'Cá Đao', fish: true, k: ['melee'], var: [['purple', 2]], eff: v => ({ dmg: v }), txt: v => 'sát thương +' + v },
    sage: { vi: 'Đá Hiền Giả', fish: true, k: ['staff'], var: [['red', 1]], eff: v => ({ dmg: v, costZero: true }), txt: v => 'không tốn năng lượng, sát thương +' + v }
  };
  const FISH_ONLY = /Bladefish|Swordfish|Deep-sea Laser Fish|Baby Laser Fish|Hammerhead Shark|Pincer|Octopus|Pufferfish|^Laser Fish$|Fishing Rod|Rod$/i;
  const kindOf = d => d.kind || 'gun';
  function blocked(d) { return !d || N.invalidWeapon(d) || (d.grade | 0) >= 6 || FISH_ONLY.test(d.nameEn || '') || /fish_rod/.test(d.prefab || ''); }
  const fits = (a, d) => (!a.k || a.k.indexOf(kindOf(d)) >= 0) && (!a.needCost || (d.cost || 0) > 0);
  const attList = (d, fish) => blocked(d) ? [] : Object.keys(ATT).filter(k => !!ATT[k].fish === !!fish && fits(ATT[k], d));
  function rollAtt(d, fish) {
    const list = attList(d, fish);
    if (!list.length) return null;
    const key = pickOf(list), v = pickOf(ATT[key].var);
    return { key, rar: v[0], v: v[1] };
  }
  // Vũ khí tính ra bản def mới (không đụng DS.weapons): sát thương cộng vào d.dmg và mọi đạn có sát thương trong w86.b.
  function withAtt(base, a) {
    const A = ATT[a.key], e = A.eff(a.v), d = Object.assign({}, base);
    d.name = base.name + ' ★';
    if (e.dmg) d.dmg = (base.dmg || 0) + e.dmg;
    if (e.crit) d.crit = (base.crit || 0) + e.crit;
    if (e.cost || e.costZero) d.cost = e.costZero ? 0 : Math.max(0, (base.cost || 0) + e.cost);
    if (e.rpsMul) d.rps = (base.rps || 2) * e.rpsMul;
    if (base.w86) {
      const w = Object.assign({}, base.w86);
      if (base.w86.b) w.b = base.w86.b.map(b => {
        const o = Object.assign({}, b);
        if (e.dmg && (b.dmg || 0) > 0) o.dmg = b.dmg + e.dmg;
        if (e.crit && (b.crit == null || b.crit > -100)) o.crit = (b.crit || 0) + e.crit;
        return o;
      });
      if (w.cost != null && (e.cost || e.costZero)) w.cost = d.cost;
      d.w86 = w;
    }
    return d;
  }
  // w.def đọc ra bản có phụ kiện, ghi vào (rooms.js refreshWeapons, buff...) vẫn đổi bản gốc nên phụ kiện không bị mất.
  function equip(w, a) {
    if (!w._attHook) {
      let base = w.def, cache = null;
      Object.defineProperty(w, 'def', { configurable: true, enumerable: true,
        get() { const at = this.att; if (!at) return base; if (!cache || cache.b !== base || cache.a !== at) cache = { b: base, a: at, d: withAtt(base, at) }; return cache.d; },
        set(v) { base = v; } });
      w._attHook = true;
    }
    w.att = a;
  }
  const attText = a => ATT[a.key].vi + ' (' + RAR[a.rar] + '): ' + ATT[a.key].txt(a.v);
  // Giá: tối thiểu 15 vàng ở vũ khí trắng [WIKI Weaponsmith "minimum basic cost is 15"], +5 mỗi bậc vũ khí [ƯỚC LƯỢNG]; Người Câu Cá 30 [ƯỚC LƯỢNG].
  const smithPrice = d => price(15 + 5 * Math.max(0, ((d && d.grade) | 0) - 1));
  const FISH_PRICE = 30;
  function useAttach(it, fish) {
    const w = N.cur(), d = N.wdef(w);
    if (it.used) { say(fish ? 'Đừng làm ồn, đi câu đây.' : 'Xong rồi'); return; }
    if (!w || !d) { deny(fish ? 'Bạn cần có vũ khí' : 'Bạn thân mến, vũ khí của bạn đâu'); return; }          // object/smith_no_weapon
    const a = rollAtt(d, fish);
    if (!a) { deny('Không có bộ phận có thể chế tạo'); return; }                                                  // object/smith_no_suitable
    const n = fish ? price(FISH_PRICE) : smithPrice(d);
    if (!pay(n)) return;
    equip(w, a);
    it.used = true; it.uses++; it.anim = 1.6;
    U.snd(U.evClip('shop') || 'fx_buy', 0.7);
    U.vfx('effect_smoke', it.x, it.y - 14, {});
    say(fish ? attText(a) : 'Xong rồi — ' + attText(a), 3.2);                                                    // object/smith_done
    SK.emit(fish ? 'fishAttach' : 'smithAttach', G, w.id, a, n);
  }

  // ---------------------------------------------------------------- Thợ Thủ Công (npc_smith)
  const smithLabel = it => {
    if (it.used) return 'Thợ Thủ Công — xong rồi';
    const d = N.wdef(N.cur());
    return 'Thợ Thủ Công — cải tiến vũ khí này? (' + smithPrice(d) + ' vàng)';
  };
  // ---------------------------------------------------------------- Người Câu Cá (npc_weapon_item_fish)
  const fishLabel = it => it.used ? 'Người Câu Cá — đừng làm ồn, đi câu đây' : 'Người Câu Cá — vừa câu được, lấy không? (' + price(FISH_PRICE) + ' vàng)';

  // ================================================================ Đạo Sư (npc_skill_update)
  // [WIKI Mentor] nâng cấp kỹ năng của nhân vật; ở hầm là mua một lần mỗi Đạo Sư. Web chưa có cấp kỹ năng nên mỗi cấp = hồi chiêu kỹ năng
  // ngắn thêm 6% [ƯỚC LƯỢNG], tối đa 5 cấp một ván, giá 40 × (cấp kế) vàng [ƯỚC LƯỢNG]. G.mods.skillLv giữ số cấp.
  const MENTOR_MAX = 5, MENTOR_BASE = 40, MENTOR_CD = 0.94;
  const lvOf = () => (G.mods && G.mods.skillLv) | 0;
  const mentorPrice = () => price(MENTOR_BASE * (lvOf() + 1));
  function useMentor(it) {
    const p = G.player;
    if (it.used || lvOf() >= MENTOR_MAX) { say('Đã không còn gì để truyền thụ cho bạn nữa rồi'); return; }     // object/skill_update_already
    const n = mentorPrice();
    if (!pay(n)) return;
    G.mods = G.mods || {};
    G.mods.skillLv = lvOf() + 1;
    G.mods.skillCdMul = (G.mods.skillCdMul || 1) * MENTOR_CD;
    if (p.skillCd > 0) p.skillCd *= MENTOR_CD;
    it.used = true; it.uses++;
    U.snd(U.evClip('shop') || 'fx_buy', 0.7);
    U.vfx('effect_health', p.x, p.y - 8, { follow: p, dy: -8, scale: 0.8 });
    say('Bạn đã trở nên mạnh hơn', 3);                                                                            // object/skill_update_success
    SK.emit('mentorUpgrade', G, G.mods.skillLv, n);
  }

  // ================================================================ Máy Thử Vận May (slotmachine, "Deelili Claw Fun")
  // Bảng trong prefab slotmachine (Odin) [ĐO]: awardArr 5 phần thưởng trọng số 10, số lượt còn lại (restCount) 3, 3, 10000, 10, 1;
  // punishmentArr 2 mục trọng số 1000. Bể vật phẩm: random_objects.slot_machine [CFG]. Ý nghĩa các số hiệu và các phần dưới là [ƯỚC LƯỢNG]:
  // giá 30, 40% trúng; trúng thì bốc phần thưởng theo trọng số còn lượt; 1-4 là một bình từ bể (bình hồi phục tối đa dành cho 5), 5 là
  // "giải đặc biệt" (hạt nhân bay lên, hồi đầy máu và năng lượng, máy hỏng); trượt thì bốc 6 (cảm ơn ủng hộ) hoặc 7 (dòng điện thất thường: giật 1 sát thương).
  const SLOT_PRICE = 30, SLOT_HIT = 0.4;
  const SLOT_AWARDS = [[1, 10, 3], [2, 10, 3], [3, 10, 10000], [4, 10, 10], [5, 10, 1]];
  const SLOT_PUNISH = [[6, 1000], [7, 1000]];
  const SLOT_POOL = [['energy_pot', 10, 'RGEnergyPot'], ['energy_pot_big', 10, 'RGEnergyPot'], ['health_pot', 10, 'RGHealthPot'], ['health_pot_big', 10, 'RGHealthPot'],
    ['restore_pot', 5, 'RGBothPot'], ['restore_pot_big', 5, 'RGBothPot']];
  const POT_NAME = { health_pot: 'Bình Máu', health_pot_big: 'Bình Máu Lớn', energy_pot: 'Bình Năng Lượng', energy_pot_big: 'Bình Năng Lượng Lớn', restore_pot: 'Bình Hồi Phục', restore_pot_big: 'Bình Hồi Phục Lớn', restore_pot_max: 'Thuốc Hồi Phục Toàn Bộ' };
  const slotPrice = () => price(SLOT_PRICE);
  function drink(prefab, cls) {
    const p = G.player, m = SK.prefabMbs(SK.prefab(prefab), cls) || {};
    if (m.health) { p.hp = Math.min(p.hpMax, p.hp + m.health); SK.num(G, p.x - 4, p.y - 26, '+' + Math.min(m.health, 99), '#ff6a6a'); }
    if (m.energy) { p.energy = Math.min(p.energyMax, p.energy + m.energy); SK.num(G, p.x + 4, p.y - 20, '+' + Math.min(m.energy, 999), '#6ac8ff'); }
    U.snd(U.evClip('hpPot'), 0.7);
    U.vfx(m.health ? 'effect_health' : 'energy', p.x, p.y - 8, { follow: p, dy: -8 });
  }
  // Một lượt chơi: trả {hit, award, pot} sau khi đã trừ lượt còn lại; rest là mảng lượt còn lại theo thứ tự SLOT_AWARDS.
  function slotRoll(rest) {
    if (SK.rand() < SLOT_HIT) {
      const open = SLOT_AWARDS.filter((q, i) => rest[i] > 0);
      const a = weighted(open, q => q[1]);
      rest[SLOT_AWARDS.indexOf(a)]--;
      return { hit: true, award: a[0], pot: a[0] === 5 ? 'restore_pot_max' : weighted(SLOT_POOL, q => q[1])[0] };
    }
    return { hit: false, award: weighted(SLOT_PUNISH, q => q[1])[0] };
  }
  function usePlay(it) {
    const p = G.player;
    if (it.broken) { say('Thử Vận May đã hư tổn'); return; }                                                      // object/slotmachine_destory
    if (it.anim > 0) return;
    const n = slotPrice();
    if (!U.freeBuy()) { if (p.gold < n) { say('Làm ăn nhỏ, vui lòng không ghi nợ'); U.snd('fx_error', 0.6); return; } p.gold -= n; }   // object/slotmachine_not_enough
    const r = slotRoll(it.rest);
    it.plays++; it.anim = 1.4; it.last = r;
    if (r.hit) {
      if (r.award === 5) {
        drink('restore_pot_max', 'RGBothPot');
        p.hp = p.hpMax; p.energy = p.energyMax;
        it.rocket = 1.2; it.broken = true; G.shake = Math.max(G.shake || 0, 4);
        U.snd('fx_explode_big', 0.8); U.vfx('explode_energy2_orange', it.x, it.y - 40, { scale: 1.4 });
        say('Ồ! Giải đặc biệt!', 3);                                                                              // object/slotmachine_nuclear_boom
      } else {
        const cls = (SLOT_POOL.find(q => q[0] === r.pot) || [])[2];
        drink(r.pot, cls);
        say('Bạn tuyệt quá! ' + POT_NAME[r.pot], 3);                                                              // object/slotmachine_hit
      }
    } else if (r.award === 7) {
      SK.hurtPlayer(G, 1);
      U.vfx('thunder_child', p.x, p.y - 10, {});
      say('Dòng điện thất thường', 3);                                                                            // object/slotmachine_thunder
    } else say('Cảm ơn ủng hộ');                                                                                  // object/slotmachine_not_hit
    SK.emit('slotPlay', G, r, n);
  }

  // ---------------------------------------------------------------- vẽ
  const drawFish = (ctx, pf, x, y) => SK.drawPrefab(ctx, pf, x, y, {});
  const drawMentor = (ctx, pf, x, y, it) => SK.drawPrefab(ctx, pf, x, y, { t: G.t + it.t });
  const drawSmith = (ctx, pf, x, y, it) => SK.drawPrefab(ctx, pf, x, y, { t: G.t + it.t, state: it.anim > 0 ? 'smith_work' : 'smith_idle' });
  function drawSlot(ctx, pf, x, y, it) {
    // Cần gạt (hand + point) hạ xuống rồi nâng lên khi đang chơi; tên lửa chỉ hiện khi trúng giải đặc biệt.
    const dy = it.anim > 0 ? Math.sin(Math.min(1, (1.4 - it.anim) / 1.4) * Math.PI) * -14 : 0;
    const hand = U.prefabPart(pf, '/img/hand'), pt = U.prefabPart(pf, '/img/hand/point');
    const o0 = hand && hand.at[1], o1 = pt && pt.at[1];
    if (hand) hand.at[1] = o0 + dy;
    if (pt) pt.at[1] = o1 + dy;
    try {
      SK.drawPrefab(ctx, pf, x, y, { t: G.t + it.t, skip: q => /^\/rocket/.test(q.n) });
    } finally { if (hand) hand.at[1] = o0; if (pt) pt.at[1] = o1; }
    if (it.rocket > 0) { const k = 1 - it.rocket / 1.2; SK.draw(ctx, 'df_tower_2_5', x, y - 30 - k * 120, { sx: 0.8, sy: 0.8 }); }
  }

  // ---------------------------------------------------------------- đăng ký phòng
  R.extra.fishnpc = { weight: () => WP, fill: (G2, r, c) => placeNpc(r, c, { key: 'fishnpc', pf: 'npc_weapon_item_fish', label: fishLabel, use: it => useAttach(it, true), draw: drawFish }) };
  R.extra.mentor = { weight: () => (lvOf() < MENTOR_MAX ? WP : 0), fill: (G2, r, c) => placeNpc(r, c, { key: 'mentor', pf: 'npc_skill_update', label: it => it.used || lvOf() >= MENTOR_MAX ? 'Đạo Sư — hết gì để dạy' : 'Đạo Sư — hãy để tôi kích hoạt tiềm năng của bạn (' + mentorPrice() + ' vàng)', use: useMentor, draw: drawMentor }) };
  R.extra.smith = { weight: () => 4 * WP, fill: (G2, r, c) => placeNpc(r, c, { key: 'smith', pf: 'npc_smith', dy: 6, bw: 14, label: smithLabel, use: it => useAttach(it, false), draw: drawSmith }) };
  R.extra.slotmachine = { weight: () => ((G.stageIdx | 0) >= 6 ? 10 : 0), fill: (G2, r, c) => placeNpc(r, c, { key: 'slotmachine', pf: 'slotmachine', dy: 6, bw: 14, bh: 14,
    init: { rest: SLOT_AWARDS.map(q => q[2]), plays: 0, rocket: 0, last: null },
    update: (it, dt) => { if (it.rocket > 0) it.rocket = Math.max(0, it.rocket - dt); },
    label: it => it.broken ? 'Thử Vận May — đã hư tổn' : 'Thử Vận May bài “Dilili” — chỉ cần ' + slotPrice() + ' vàng, không thử sao?', use: usePlay, draw: drawSlot }) };

  N.attach = { roll: rollAtt, equip, text: attText };   // Bậc Thầy Phụ Kiện (js/factors2.js) gắn phụ kiện cho vũ khí mới
  R.dnpc2 = { ATT, attList, rollAtt, withAtt, equip, blocked, smithPrice, FISH_PRICE, MENTOR_MAX, MENTOR_CD, mentorPrice, slotRoll, slotPrice, SLOT_PRICE, SLOT_HIT, SLOT_AWARDS, SLOT_PUNISH, SLOT_POOL };
})();
