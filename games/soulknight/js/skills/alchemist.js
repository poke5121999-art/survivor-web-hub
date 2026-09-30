// Kỹ năng Nhà Giả Kim (c04): concoction. Đồ nghề chung ở SK.skillKit (js/skills.js).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, DS = SK.DS;
  const { layer, charges, useCharge, setMul, heal, healFx, timers } = K;

  // Thuốc Mật Ong [ĐO c04/skill 3: cd 5, maxCount 3; weapon_skill_achemist: GunAchemistSkill duration 6, maxMixCount 3, 5 màu/5 khung
  // nguyên liệu, gapX 0.5]: mỗi lần bấm nạp các lượt đang có vào chai (tối đa 3 nguyên liệu, mỗi nguyên liệu tốn 1 lượt), chai thay
  // vũ khí đang cầm; bấm đánh thì uống, nhận cường hoá 6 s [WIKI]. Hiệu ứng từng nguyên liệu nằm trong mã IL2CPP, wiki chỉ nêu
  // "Armor Boost 6 s (25%)": chia đều 5 loại theo màu [ƯỚC LƯỢNG].
  const MIX = { dur: 6, max: 3 };   // [ĐO GunAchemistSkill.duration / maxMixCount]
  // khung nguyên liệu + màu nước [ĐO GunAchemistSkill.sprites/colors], hiệu ứng [ƯỚC LƯỢNG]
  const ING = [
    { s: 'alchemist_0_skill_2_effect_0_3', c: [0.984, 0.773, 0.216, 1], name: 'tốc bắn' },
    { s: 'alchemist_0_skill_2_effect_0_2', c: [0.910, 0.443, 0.333, 1], name: 'tốc chạy' },
    { s: 'alchemist_0_skill_2_effect_0_5', c: [0.980, 0.925, 0.871, 1], name: 'giáp' },
    { s: 'alchemist_0_skill_2_effect_0_4', c: [0.741, 0, 0, 1], name: 'sát thương' },
    { s: 'alchemist_0_skill_2_effect_0_6', c: [0.412, 0.694, 0.129, 1], name: 'hồi máu' }
  ];
  const BUFF = { rate: 0.3, move: 0.3, armor: 3, dmg: 0.5, regen: 1, regenEvery: 1.5 };   // mỗi nguyên liệu cùng loại [ƯỚC LƯỢNG]
  const LIQ_Y = [5.49, 3.76, 2, 0.26, -1.52];   // [ĐO prefab liquid_0..4, y Unity đổi dấu]

  const snd = (n, o) => { if (n && SK.sfx && SK.sfx.play && window.SK_AUDIO && SK_AUDIO.clips[n]) SK.sfx.play(n, o || { poly: 2, gap: 0.05, vol: 0.7 }); };
  // Chai là "vũ khí" không có dữ liệu 8.6: actors.js chạy nó bằng legacyRun (bấm đánh -> WEAPON_KINDS.concoction.fire).
  Object.defineProperty(DS.weapons, '_concoction', { configurable: true, writable: true, enumerable: false,
    value: { name: 'Thuốc Mật Ong', kind: 'concoction', dmg: 0, cost: 0, rps: 2, sprite: 'nothing' } });
  SK.WEAPON_KINDS.concoction = { fire(G, p) { drink(G, p); } };

  S.concoction = {
    start(G, p) {
      layer(G);
      const ch = charges(p, 'concoction');
      const c = p._conc || (p._conc = { list: [], saved: null, slot: 0 });
      const take = Math.min(ch.n, MIX.max - c.list.length);
      for (let i = 0; i < take; i++) { useCharge(p, 'concoction'); c.list.push(Math.floor(SK.rand() * ING.length)); }
      if (take > 0) c.mixT = 0.44;   // [ĐO clip weapon_pot/rotate 0.4375 s, sự kiện MixComplete]
      if (c.list.length) equip(p);
      else p._cdAfter = 0.25;
    },
    // Đổi sang ô kia làm chai cất đi (giữ nguyên liệu); bấm kỹ năng lúc còn nguyên liệu thì cầm lại chai.
    pressCd(G, p) { if (p._conc && p._conc.list.length && !p._conc.held) equip(p); }
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
  function drink(G, p) {
    const c = p._conc;
    if (!c || !c.held || !c.list.length) return;
    const n = c.list.reduce((a, i) => { a[i]++; return a; }, [0, 0, 0, 0, 0]);
    stow(p);
    endPotion(p);
    p._pot = { t: MIX.dur, n, regen: BUFF.regenEvery, armor: n[2] * BUFF.armor };
    setMul(p, 'rateMul', 'pot', 1 + n[0] * BUFF.rate);
    setMul(p, 'moveMul', 'pot', 1 + n[1] * BUFF.move);
    setMul(p, 'dmgMul', 'pot', 1 + n[3] * BUFF.dmg);
    p.armor += p._pot.armor;
    c.list = [];
    healFx(G, p);
    snd('fx_healthpot');
  }
  function endPotion(p) {
    if (!p._pot) return;
    setMul(p, 'rateMul', 'pot', 1); setMul(p, 'moveMul', 'pot', 1); setMul(p, 'dmgMul', 'pot', 1);
    p.armor = Math.min(p.armor, Math.max(p.armorMax, p.armor - p._pot.armor));
    p._pot = null;
  }
  timers.concoction = (G, p, dt) => {
    const c = p._conc;
    if (c) {
      if (c.mixT > 0) c.mixT -= dt;
      if (c.held && p.cur !== c.slot) stow(p);
      if (p.hero !== 'alchemist' || !p.h.skill || p.h.skill.id !== 'concoction') { stow(p); p._conc = null; }
    }
    const t = p._pot; if (!t) return;
    t.t -= dt;
    if (t.n[4] > 0) { t.regen -= dt; if (t.regen <= 0) { t.regen += BUFF.regenEvery; heal(G, p, t.n[4] * BUFF.regen); } }
    if (t.t <= 0) endPotion(p);
  };
  SK.on('stageEnter', () => { const p = SK.G && SK.G.player; if (p) { stow(p); p._conc = null; endPotion(p); } });

  // Chai cầm thẳng đứng ở tay, mức nước theo từng nguyên liệu đã nạp (nút liquid_0..4 của prefab), biểu tượng nguyên liệu trên đầu.
  const drawPlayer1 = SK.drawPlayer;
  SK.drawPlayer = function (ctx, G) {
    drawPlayer1(ctx, G);
    const p = G.player, c = p && p._conc;
    if (!c || !c.held || p.st === 'dead') return;
    const wob = c.mixT > 0 ? Math.sin(c.mixT * 60) * 0.18 : 0;   // lắc chai khi trộn
    const hd = p.h.hand || [3, 6], hx = p.x + (hd[0] + 6) * p.face, hy = p.y - hd[1] - 1;
    ctx.save(); ctx.translate(Math.round(hx), Math.round(hy)); ctx.rotate(wob);
    SK.draw(ctx, 'alchemist_0_skill_2_effect_0_0', 0, 0);
    c.list.forEach((i, j) => SK.drawTinted(ctx, 'alchemist_0_skill_2_effect_0_7', 0, LIQ_Y[Math.min(4, j + 1)] - 1, ING[i].c, {}));
    ctx.restore();
    c.list.forEach((i, j) => SK.draw(ctx, ING[i].s, p.x + (j - (c.list.length - 1) / 2) * 11, p.y - 30));
  };
})();
