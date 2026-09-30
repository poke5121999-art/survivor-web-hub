// Kỹ năng Nhà Giả Kim (c04): concoction. Đồ nghề chung ở SK.skillKit (js/skills.js).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, DS = SK.DS;
  const { layer, charges, useCharge, setMul, heal, healFx, timers } = K;

  // Thuốc Mật Ong [ĐO c05/skill 3: cd 5, maxCount 3; C05Controller.RoleSkill2, weapon_skill_achemist: GunAchemistSkill duration 6,
  // maxMixCount 3 (+ SkillExtraUpdate + skill_strengthen, hai số này bằng 0 ở đây), gapX 0.5, clip weapon_pot/drink]: mỗi lần bấm nạp
  // min(lượt đang có, chỗ còn trống) nguyên liệu vào chai, chai thay vũ khí đang cầm; nguyên liệu bốc ngẫu nhiên có trọng số
  // [ĐO GunAchemistSkill..cctor distribute], được lặp. Bấm đánh thì uống: 0.75 s sau (sự kiện Attack của clip drink) mới nhận cường hoá,
  // rồi chai biến mất và trả vũ khí [ĐO Attack: MakeEffects, DestroySelf, SwitchToLastWeapon]. Nút đặc biệt (isSpecialWeapon = 1) của
  // chai là cất chai về [ĐO WeaponSpecial: gọi SwitchWeapon].
  const MIX = { dur: 6, max: 3, drinkAt: 0.75 };   // [ĐO duration / maxMixCount / clip drink]
  // Nguyên liệu theo enum emEffectStuff [ĐO]: khung + màu nước theo GunAchemistSkill.sprites/colors, trọng số theo distribute.
  const ING = [
    { name: 'máu', w: 7, s: 'alchemist_0_skill_2_effect_0_3', c: [0.984, 0.773, 0.216, 1] },
    { name: 'giáp', w: 20, s: 'alchemist_0_skill_2_effect_0_2', c: [0.910, 0.443, 0.333, 1] },
    { name: 'năng lượng', w: 7, s: 'alchemist_0_skill_2_effect_0_5', c: [0.980, 0.925, 0.871, 1] },
    { name: 'tốc bắn', w: 20, s: 'alchemist_0_skill_2_effect_0_4', c: [0.741, 0, 0, 1] },
    { name: 'tốc chạy', w: 20, s: 'alchemist_0_skill_2_effect_0_6', c: [0.412, 0.694, 0.129, 1] }
  ];
  // Giá trị mỗi nguyên liệu ở cấp 0 [ĐO GetEffectValue: hp = cấp/3 + 1, năng lượng = 30 + 2 cấp, tốc bắn = 0.5 + 0.02 cấp,
  // tốc chạy = 0.4 + 0.02 cấp]; giáp là buff_armor: restoreValue 1 (BuffArmor..ctor), hồi lại sau mỗi 1.6 s (GetArmor), sống duration 6 s.
  // Cộng dồn theo loại [ĐO MakeEffects]. Giá trị tốc bắn/tốc chạy là số cộng vào hệ số 1 [ƯỚC LƯỢNG: ChangeWeaponSpeed/ChangeSpeed nhận số gì].
  const BUFF = { hp: 1, energy: 30, rate: 0.5, move: 0.4, armor: 1, armorEvery: 1.6 };
  const LIQ_Y = [5.49, 3.76, 2, 0.26, -1.52];   // [ĐO prefab liquid_0..4, y Unity đổi dấu]
  // Clip weapon_pot/drink: xoay chai 0 -> 119° trong 0.25 s, giữ tới 0.75 s, về 0 lúc 1 s; vị trí tay [ĐO sk-data].
  const DRINK_R = [[0, 0], [0.25, 119], [0.75, 119], [1, 0]];
  const DRINK_P = [[0, 0, 0], [0.25, 8.8, 8], [0.375, 8.8, 7.2], [0.5, 8.8, 8], [0.625, 8.8, 7.2], [0.75, 8.8, 8], [1, 0, 0]];
  const keyf = (tr, t, k) => {
    for (let i = 1; i < tr.length; i++) if (t <= tr[i][0]) { const a = tr[i - 1], b = tr[i], f = (t - a[0]) / (b[0] - a[0] || 1); return a[k] + (b[k] - a[k]) * f; }
    return tr[tr.length - 1][k];
  };
  const pick = () => { let r = SK.rand() * ING.reduce((a, g) => a + g.w, 0); for (let i = 0; i < ING.length; i++) { r -= ING[i].w; if (r < 0) return i; } return ING.length - 1; };

  const snd = (n, o) => { if (n && SK.sfx && SK.sfx.play && window.SK_AUDIO && SK_AUDIO.clips[n]) SK.sfx.play(n, o || { poly: 2, gap: 0.05, vol: 0.7 }); };
  // Chai là "vũ khí" không có dữ liệu 8.6: actors.js chạy nó bằng legacyRun (bấm đánh -> WEAPON_KINDS.concoction.fire).
  Object.defineProperty(DS.weapons, '_concoction', { configurable: true, writable: true, enumerable: false,
    value: { name: 'Thuốc Mật Ong', kind: 'concoction', dmg: 0, cost: 0, rps: 2, sprite: 'nothing' } });
  SK.WEAPON_KINDS.concoction = { fire(G, p) { drink(G, p); } };

  S.concoction = {
    start(G, p) {
      layer(G);
      const ch = charges(p, 'concoction');
      const c = p._conc || (p._conc = { list: [], saved: null, slot: 0, drinkT: 0 });
      const take = Math.min(ch.n, MIX.max - c.list.length);
      for (let i = 0; i < take; i++) { useCharge(p, 'concoction'); c.list.push(pick()); }
      if (take > 0) c.mixT = 0.44;   // [ĐO clip weapon_pot/rotate 0.4375 s, sự kiện MixComplete]
      if (c.list.length) equip(p);
      else p._cdAfter = 0.25;
    },
    // Bấm kỹ năng khi đang hồi mà còn nguyên liệu: cầm lại chai.
    pressCd(G, p) { if (p._conc && p._conc.list.length && !p._conc.held) equip(p); },
    // Nút đặc biệt: cất chai về, nguyên liệu giữ nguyên [ĐO GunAchemistSkill.WeaponSpecial -> SwitchWeapon].
    special(G, p) { const c = p._conc; if (c && c.held && !(c.drinkT > 0)) stow(p); }
  };
  function equip(p) {
    const c = p._conc;
    if (c.held) return;
    c.saved = p.weapons[p.cur]; c.slot = p.cur; c.held = true;
    p.weapons[p.cur] = SK.makeWeapon('_concoction');
  }
  function stow(p) {
    const c = p._conc;
    if (!c || !c.held) return;
    if (p.weapons[c.slot] && p.weapons[c.slot].id === '_concoction') p.weapons[c.slot] = c.saved;
    c.held = false;
  }
  // Bấm đánh: bắt đầu clip drink, chưa đánh được gì khác cho tới sự kiện Attack.
  function drink(G, p) {
    const c = p._conc;
    if (!c || !c.held || !c.list.length || c.drinkT > 0) return;
    c.drinkT = 0.001; p.noFire = true;
  }
  function apply(G, p) {
    const c = p._conc;
    const n = c.list.reduce((a, i) => { a[i]++; return a; }, [0, 0, 0, 0, 0]);
    stow(p);
    endPotion(p);
    c.list = []; c.drinkT = 0; p.noFire = false;
    p._pot = { t: MIX.dur, n, armT: n[1] > 0 ? 0 : Infinity };
    if (n[0]) heal(G, p, n[0] * BUFF.hp);
    if (n[2]) p.energy = Math.min(p.energyMax, p.energy + n[2] * BUFF.energy);
    setMul(p, 'rateMul', 'pot', 1 + n[3] * BUFF.rate);
    setMul(p, 'moveMul', 'pot', 1 + n[4] * BUFF.move);
    healFx(G, p);
    snd('fx_healthpot');
  }
  function endPotion(p) {
    if (!p._pot) return;
    setMul(p, 'rateMul', 'pot', 1); setMul(p, 'moveMul', 'pot', 1);
    p._pot = null;
  }
  timers.concoction = (G, p, dt) => {
    const c = p._conc;
    if (c) {
      if (c.mixT > 0) c.mixT -= dt;
      if (c.drinkT > 0) { c.drinkT += dt; if (c.drinkT >= MIX.drinkAt) apply(G, p); }
      else if (c.held && p.cur !== c.slot) stow(p);
      if (p.hero !== 'alchemist' || !p.h.skill || p.h.skill.id !== 'concoction') { stow(p); p._conc = null; p.noFire = false; }
    }
    const t = p._pot; if (!t) return;
    t.t -= dt;
    // buff_armor: hồi 1 giáp ngay khi uống rồi mỗi 1.6 s cho tới hết 6 s [ĐO BuffArmor.GetArmor].
    for (t.armT -= dt; t.armT <= 0 && t.t > 0; t.armT += BUFF.armorEvery) p.armor = Math.min(p.armorMax, p.armor + BUFF.armor);
    if (t.t <= 0) endPotion(p);
  };
  SK.on('stageEnter', () => { const p = SK.G && SK.G.player; if (p) { stow(p); p._conc = null; p.noFire = false; endPotion(p); } });

  // Chai cầm thẳng đứng ở tay, mức nước theo từng nguyên liệu đã nạp (nút liquid_0..4 của prefab), biểu tượng nguyên liệu trên đầu.
  const drawPlayer1 = SK.drawPlayer;
  SK.drawPlayer = function (ctx, G) {
    drawPlayer1(ctx, G);
    const p = G.player, c = p && p._conc;
    if (!c || !c.held || p.st === 'dead') return;
    const wob = c.mixT > 0 ? Math.sin(c.mixT * 60) * 0.18 : 0;   // lắc chai khi trộn
    let rot = wob, ox = 0, oy = 0;
    if (c.drinkT > 0) {
      rot = keyf(DRINK_R, c.drinkT, 1) * Math.PI / 180 * p.face; ox = keyf(DRINK_P, c.drinkT, 1) * p.face; oy = -keyf(DRINK_P, c.drinkT, 2);
    }
    const hd = p.h.hand || [3, 6], hx = p.x + (hd[0] + 6) * p.face + ox, hy = p.y - hd[1] - 1 + oy;
    ctx.save(); ctx.translate(Math.round(hx), Math.round(hy)); ctx.rotate(rot);
    SK.draw(ctx, 'alchemist_0_skill_2_effect_0_0', 0, 0);
    c.list.forEach((i, j) => SK.drawTinted(ctx, 'alchemist_0_skill_2_effect_0_7', 0, LIQ_Y[Math.min(4, j + 1)] - 1, ING[i].c, {}));
    ctx.restore();
    c.list.forEach((i, j) => SK.draw(ctx, ING[i].s, p.x + (j - (c.list.length - 1) / 2) * 11, p.y - 30));
  };
})();
