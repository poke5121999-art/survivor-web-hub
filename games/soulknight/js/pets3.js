// Thú cưng đợt 3: quái nhắm thú cưng, vùng nổ của quái trúng thú cưng, Pet Buff (Bạn Tốt Nhất, id 17) tăng máu / hồi / nghỉ.
// Hồi dần trong trận và Thức Ăn Mèo nằm ở js/pets.js (SK.petHp.tick, SK.petFood); vệt chém cận chiến của quái trúng pet ở SK.petHp.scan.
//
// Quái nhắm thú cưng [WIKI Pets "Pets will attack enemies and draw their fire in combat"]: wiki không nêu luật chọn mục tiêu nên [ƯỚC LƯỢNG]:
// quái thường (không phải trùm / lớp SK*) cứ 0,4~0,6 s chọn lại mục tiêu khi không đang ngắm / bắn / lao: thú cưng đang đánh (không nghỉ) trong tầm
// thấy và LOS mà gần quái hơn chủ thì quái nhắm nó, còn không nhắm chủ. Cách làm: bọc SK.updateEnemy, lúc chạy AI của quái đó thì
// G.player là bản đại diện của thú cưng (Object.create(người chơi) với x, y, st, hidden, face riêng) nên ngắm / đuổi / lao / chém đều hướng vào pet,
// và SK.hurtPlayer bị chuyển thành SK.petHp.hurt. Không đụng js/actors.js. Trùm vẫn nhắm chủ (kịch bản trận trùm viết theo người chơi).
// Chưa làm: tia laze tức thời của quái (kiểm lúc bắn, chỉ tính chủ).
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petHp || !SK.updateEnemy || !SK.hurtPlayer || !SK.updateBullets) return;
  const W = SK.world, U = SK.PPU, HP = SK.petHp, RU = (SK.DS && SK.DS.rules) || {};

  // ---- danh sách thú cưng đang ở trận (chính + cây)
  function allPets(G) {
    const out = [];
    if (G.pet) out.push(G.pet);
    for (const q of G.props) if (q.gardenPet) out.push(q.gardenPet);
    return out;
  }
  const targetable = a => !!a && !(a.rest > 0) && !a.hidden && !(a.def && a.def.ownHp) && !(a.def && a.def.noTarget);

  // ---- bản đại diện làm G.player trong lúc quái chạy AI
  function proxyOf(G, a) {
    let px = a._px;
    if (!px || Object.getPrototypeOf(px) !== G.player) { px = a._px = Object.create(G.player); px._pet = a; }
    px.x = a.x; px.y = a.y; px.st = 'run'; px.hidden = false; px.face = a.face || 1;
    return px;
  }
  const canTarget = e => e && !e.boss && e.st !== 'spawn' && e.st !== 'dead' && !e.noPetTarget && typeof e.cls === 'string' && e.cls.indexOf('SK') !== 0;
  function pick(G, e) {
    const p = G.player, rng = ((e.p && e.p.findTargetRange) || 20) * U * 0.6;
    const dp = p && p.st !== 'dead' && !p.hidden ? Math.hypot(p.x - e.x, p.y - e.y) : Infinity;
    let best = null, bd = dp;
    for (const a of allPets(G)) {
      if (!targetable(a)) continue;
      const d = Math.hypot(a.x - e.x, a.y - e.y);
      if (d < bd && d < rng && W.los(G.map, e.x, e.y - 6, a.x, a.y - 6)) { best = a; bd = d; }
    }
    return best;
  }
  function chooseTarget(G, e, dt) {
    if (!canTarget(e)) { e._pt = null; return null; }
    e._ptT = (e._ptT || 0) - dt;
    const busy = e.st === 'aim' || e.st === 'attack' || e.st === 'charge' || e.burst > 0;
    if (e._ptT <= 0 && !busy) { e._ptT = 0.4 + SK.rand() * 0.2; e._pt = pick(G, e); }
    if (e._pt && !targetable(e._pt)) e._pt = null;
    return e._pt;
  }

  const baseUpdate = SK.updateEnemy;
  SK.updateEnemy = function (G, e, dt) {
    const a = SK.pets3.off ? null : chooseTarget(G, e, dt);   // off: móc kiểm thử tắt việc quái nhắm pet
    if (!a || !G.player) return baseUpdate.call(this, G, e, dt);
    const real = G.player;
    G.player = proxyOf(G, a); G._petSwap = a;
    try { return baseUpdate.call(this, G, e, dt); } finally { G.player = real; G._petSwap = null; }
  };

  const baseHurt = SK.hurtPlayer;
  SK.hurtPlayer = function (G, dmg, ...rest) {
    const a = G._petSwap;
    if (a && G.player === a._px) {   // đòn của quái đang nhắm thú cưng (cận chiến, lao)
      if (!(dmg > 0)) return false;
      return HP.hurt(G, a, Math.max(1, Math.round(dmg)), { side: 'e', melee: true, dmg }) > 0;
    }
    return baseHurt.call(this, G, dmg, ...rest);
  };

  // ---- vùng nổ của quái trúng thú cưng: actors.js (explode86) chỉ tính người chơi. Đạn v86 của quái có nổ (ExplodeEffectTrigger /
  // RGBTEnergy.explode_obj) chết trong nhịp này thì coi là đã nổ ở tâm đạn, bán kính col.r của prefab Explode, sát thương như đòn chủ [ƯỚC LƯỢNG: bỏ qua xác suất nổ].
  const baseBullets = SK.updateBullets;
  SK.updateBullets = function (G, dt) {
    const pre = [];
    for (const b of G.bullets) {
      if (b.side !== 'e' || b.dead || !b.v86 || b.melee || b.orbit || !b.B || !b.B.m) continue;
      const m = b.B.m;
      if ((m.ExplodeEffectTrigger && m.ExplodeEffectTrigger.creation) || (m.RGBTEnergy && m.RGBTEnergy.explode_obj)) pre.push(b);
    }
    baseBullets.call(this, G, dt);
    if (!pre.length) return;
    const XE = (window.SK_W86 && window.SK_W86.explodes) || {}, ps = allPets(G).filter(targetable);
    if (!ps.length) return;
    for (const b of pre) {
      if (!b.dead) continue;
      const m = b.B.m, et = m.ExplodeEffectTrigger, en = m.RGBTEnergy;
      const name = (et && et.creation) || (en && en.explode_obj), E = XE[name];
      if (!E || E.hit_player === 0) continue;
      const size = b.expSize != null ? b.expSize : (et && et.creation && et.scaleEffectByBulletSize ? (b.bsize || b.size || 1) * (et.sizeFactor || 1) : (en && !et ? en.sizeFactor || 1 : 1));
      const rad = ((E.col && E.col.r) || 1.5) * U * size;
      const cx = b.x + Math.cos(b.ang || 0) * (b.off || 0), cy = b.y + Math.sin(b.ang || 0) * (b.off || 0);
      let dmg = E.damage != null ? E.damage : 4;
      if (et && et.creation && et.useParentInfo) dmg = b.dmg;
      const k = Math.max(1, Math.round(dmg * (RU.enemyAtkScale || 0.5)));
      for (const a of ps) if (Math.hypot(a.x - cx, a.y - 7 - cy) < rad + 5) HP.hurt(G, a, k, { side: 'e', area: true, dmg: k });
    }
  };

  // ---- Pet Buff (Bạn Tốt Nhất, id 17) [WIKI Pets "Having Pet Buff will increase their health by 9 and reduce the time they need to rest by half";
  // wiki Pet Buff "doubles health regeneration speed"]. Sát thương ×2 và cỡ ×1,5 của thú cưng chính do js/rooms.js (petTick) lo.
  // Thú cưng cây: Hoa Ăn Thịt +10 HP và +3 sát thương [WIKI Titan Arum]; hai con kia theo cùng mức +9 HP và +3 sát thương [ƯỚC LƯỢNG: trang cây không nêu].
  const BUFF = 17;
  function applyBuff(G) {
    const p = G.player;
    if (!p || !p.buffs || p.buffs.indexOf(BUFF) < 0) return 0;
    let n = 0;
    for (const a of allPets(G)) {
      if (a._b17) continue;
      a._b17 = true; n++;
      const hp = a.plant === 'plant_eator' ? 10 : 9;
      a.hpMax += hp; a.hp += hp;
      a.restMul = (a.restMul || 1) * 0.5; a.regenMul = (a.regenMul || 1) * 2;
      if (a.comp) { a.comp.dmg += 3; if (a.comp.critDmg) a.comp.critDmg += 3; }
    }
    return n;
  }
  SK.on('stageEnter', G => { G.props.push({ x: 0, y: 0, pets3: true, update(G2) { applyBuff(G2); }, draw() {} }); });

  SK.pets3 = { off: false, allPets, pick, chooseTarget, applyBuff, proxyOf, targetable };
})();
