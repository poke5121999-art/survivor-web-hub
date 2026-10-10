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

  // ---------------------------------------------------------------- phụ kiện nhóm Đặc biệt / Nâng cấp (đợt 5) [WIKI Attachments + trang từng món]
  // Tên Việt [LOC weapon_item/wi*]; g = 'sp' (Đặc biệt: thêm chiêu/chức năng, xử lý ở SK.on('fire') bên dưới) | 'up' (Nâng cấp: dùng một lần, đổi vũ khí sang bản khác).
  // ok(d): vũ khí hợp (wiki ghi theo nhóm vũ khí); eff trả {} vì không đổi chỉ số. var: [độ hiếm, số] (số = sát thương/lượng khi có).
  // Tỉ lệ kích hoạt mỗi lần đánh (Hilt không cần: mỗi đòn): Starfish/Bullet Fish/Energy Stone 25% [ƯỚC LƯỢNG], wiki chỉ ghi "ngẫu nhiên".
  const famOf = d => (d.w86 && d.w86.fam) || '';
  const isBeam = d => famOf(d) === 'laser';
  const MELEE_FAM = { sword: 1, spear: 1, hammer: 1 };
  const UP = {
    // Đồng hồ thời gian: vũ khí cổ -> bản hiện đại (số hiệu prefab weapon_NNN; Bad Pistol -> New Pistol chưa tìm ra trong dữ liệu 8.6 nên bỏ)
    timegadget: { weapon_152: 'weapon_032', weapon_153: 'weapon_111', weapon_026: 'weapon_048', weapon_066: 'weapon_075', weapon_064: 'weapon_074', weapon_243: 'weapon_145' },
    // Sơn Vàng: Desert Eagle, Revolver, AK-47, Sniper Rifle, Magic Staff, Fine Magic Staff -> bản vàng
    goldpaint: { weapon_010: 'weapon_257', weapon_015: 'weapon_287', weapon_002: 'weapon_256', weapon_032: 'weapon_288', weapon_112: 'weapon_285', weapon_113: 'weapon_286' }
  };
  const SP5 = {
    mirror: { vi: 'Trang Bị Mặt Gương', g: 'sp', ok: d => isBeam(d), var: [['white', 1]], eff: () => ({}), txt: () => 'tia laser nảy thêm một lần khi chạm tường' },
    hilt: { vi: 'Cán Kiếm Tụ Năng', g: 'sp', ok: d => kindOf(d) === 'melee' && !!MELEE_FAM[famOf(d)], var: [['green', 2], ['blue', 2], ['purple', 3]], eff: () => ({}),
      txt: (v, r) => 'mỗi đòn đánh tung một vệt trăng ' + v + ' sát thương' + (r && r !== 'green' ? ', xuyên quái' : '') },
    enhanced: { vi: 'Đầu Đạn Cường Hóa', g: 'sp', ok: d => kindOf(d) === 'gun' && !isBeam(d), var: [['green', 1]], eff: () => ({}), txt: () => 'đạn xuyên thêm một quái' },
    energystone: { vi: 'Đá Năng Lượng', g: 'sp', ok: () => true, var: [['blue', 2]], eff: () => ({}), txt: v => 'khi đánh có cơ hội hồi ' + v + ' năng lượng' },
    bulletfish: { vi: 'Cá Viên Đạn', g: 'sp', fish: true, ok: d => kindOf(d) === 'gun' && !isBeam(d), var: [['purple', 10]], eff: () => ({}), txt: v => 'ngẫu nhiên thay một viên đạn bằng Cá Đạn ' + v + ' sát thương, xuyên quái' },
    starfish: { vi: 'Kiếm Hải Tinh', g: 'sp', fish: true, ok: d => !isBeam(d), var: [['blue', 5]], eff: () => ({}), txt: v => 'ngẫu nhiên thay đòn đánh bằng sao biển ' + v + ' sát thương' },
    jellyfish: { vi: 'Sứa Hai Tua', g: 'sp', fish: true, ok: d => isBeam(d), var: [['orange', 50]], eff: () => ({}), txt: () => 'tia laser chạm mục tiêu thì tách thành 2 tia, mỗi tia 50% sát thương' },
    timegadget: { vi: 'Máy Thời Gian', g: 'up', ok: d => !!upgradeTo(d, 'timegadget'), var: [['white', 0]], eff: () => ({}), txt: () => 'đổi vũ khí cổ thành bản hiện đại' },
    goldpaint: { vi: 'Sơn Phun Màu Vàng', g: 'up', ok: d => !!upgradeTo(d, 'goldpaint'), var: [['white', 0]], eff: () => ({}), txt: () => 'đổi vũ khí thành bản vàng' }
  };
  Object.assign(ATT, SP5);
  const FISH_ONLY = /Bladefish|Swordfish|Deep-sea Laser Fish|Baby Laser Fish|Hammerhead Shark|Pincer|Octopus|Pufferfish|^Laser Fish$|Fishing Rod|Rod$/i;
  const kindOf = d => d.kind || 'gun';
  function blocked(d) { return !d || N.invalidWeapon(d) || (d.grade | 0) >= 6 || FISH_ONLY.test(d.nameEn || '') || /fish_rod/.test(d.prefab || ''); }
  const fits = (a, d) => a.ok ? !!a.ok(d) : ((!a.k || a.k.indexOf(kindOf(d)) >= 0) && (!a.needCost || (d.cost || 0) > 0));
  // Cơ hội một lần bốc ra nhóm Đặc biệt/Nâng cấp thay vì nhóm Chỉ số khi vũ khí hợp cả hai [ƯỚC LƯỢNG] (wiki không ghi xác suất).
  const CFG5 = { special: 0.5, proc: 0.25 };
  const attList = (d, fish, opt) => blocked(d) ? [] : Object.keys(ATT).filter(k => !!ATT[k].fish === !!fish && fits(ATT[k], d) && !(opt && opt.noUp && ATT[k].g === 'up'));
  function rollAtt(d, fish, opt) {
    const all = attList(d, fish, opt);
    if (!all.length) return null;
    const sp = all.filter(k => ATT[k].g), st = all.filter(k => !ATT[k].g);
    const list = opt && opt.stat && st.length ? st : !st.length ? sp : !sp.length ? st : (SK.rand() < CFG5.special ? sp : st);
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
  const attText = a => ATT[a.key].vi + ' (' + RAR[a.rar] + '): ' + ATT[a.key].txt(a.v, a.rar);
  // Bậc Thầy Phụ Kiện (js/factors2.js) chỉ bốc nhóm Chỉ số: bộ kiểm factors đo chỉ số đổi trên vũ khí khởi đầu; wiki cho phép cả nhóm Đặc biệt [chỗ lệch ghi GAPS.md].
  N.attach = { roll: (d, fish) => rollAtt(d, fish, { noUp: true, stat: true }), equip, text: attText };   // Bậc Thầy Phụ Kiện (js/factors2.js) gắn phụ kiện cho vũ khí mới

  // ---------------------------------------------------------------- tác dụng của phụ kiện Đặc biệt (chạy ở sự kiện 'fire' của mỗi đòn đánh)
  // Đạn mới của đòn này = đạn phe 'p' cuối G.bullets chưa gắn dấu _a5 (cùng cách js/plantbuff.js dò đạn của một nhát bắn).
  function freshBullets(G2) {
    const out = [];
    for (let i = G2.bullets.length - 1; i >= 0; i--) { const b = G2.bullets[i]; if (b._a5) break; b._a5 = 1; if (b.side === 'p' && !b.dead) out.push(b); }
    return out;
  }
  const muzzle = (p, w) => { if (w.lastMz) return [w.lastMz.x, w.lastMz.y]; const h = SK.handPos(p, w.side || 1), a = p.aim || 0; return [h[0] + Math.cos(a) * 6, h[1] + Math.sin(a) * 6]; };
  // Sát thương một tia của vũ khí (cùng công thức shot86 trong actors.js, chưa bạo kích).
  function beamDmg(p, d) {
    const b = d.w86 && d.w86.b && d.w86.b.find(q => q.p);
    return b ? Math.max(1, Math.round((b.dmg || 0) * (d.w86.dmf || 1) * (p.dmgMul || 1))) : 0;
  }
  const liveE = e => e && e.st !== 'spawn' && e.st !== 'dead' && e.hb && e.hp > 0;
  function hitE(e, x, y, r) {
    const sc = e.scale || 1, hw = e.hb.size[0] * sc / 2 + r, hh = e.hb.size[1] * sc / 2 + r;
    return Math.abs(x - (e.x + e.hb.off[0] * (e.face || 1) * sc)) < hw && Math.abs(y - (e.y - e.hb.off[1] * sc)) < hh;
  }
  // Dò một tia từ (x, y) theo ang dài len: trả {len, hit: [quái], wall, enemyAt}; onHit(e) gọi cho mỗi quái trúng (mỗi con một lần).
  function march(G2, x, y, ang, len, h, skip, onHit, stopAtEnemy) {
    const c = Math.cos(ang), s = Math.sin(ang), hit = [];
    let l = 0, wall = false, at = null;
    while (l < len) {
      l += 2;
      const bx = x + c * l, by = y + s * l;
      if (SK.world.solidAt(G2.map, bx, by + h)) { wall = true; l -= 2; break; }
      for (const e of G2.enemies) {
        if (!liveE(e) || hit.indexOf(e) >= 0 || (skip && skip.indexOf(e) >= 0) || !hitE(e, bx, by, 2)) continue;
        hit.push(e); if (onHit) onHit(e, bx, by);
        if (!at) at = [bx, by, e];
      }
      if (stopAtEnemy && at) break;
    }
    return { len: l, hit, wall, at };
  }
  function flash(G2, x0, y0, ang, len, col) {   // vệt sáng ngắn của tia phản xạ / tách
    G2.props.push({ x: x0, y: y0, t: 0, update(G3, pr, dt) { pr.t += dt; if (pr.t > 0.14) pr.gone = true; },
      draw(ctx, G3, pr) { ctx.save(); ctx.globalAlpha = 1 - pr.t / 0.14; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len); ctx.stroke(); ctx.restore(); } });
  }
  const BEAM_LEN = 20 * SK.PPU;                     // [ĐO RGLaser.laserLength 20 đv, actors.js beam86]
  const JELLY_LEN = 6 * SK.PPU;                     // độ dài 2 tia tách [ƯỚC LƯỢNG]
  const JELLY_SPREAD = SK.deg ? SK.deg(35) : 0.61;  // góc tách mỗi bên [ƯỚC LƯỢNG]
  const HOOK = {
    mirror(G2, p, w) {
      const d = w.def, dmg = beamDmg(p, d); if (!dmg) return;
      const [x, y] = muzzle(p, w), h = Math.max(2, p.y - y), a = p.aim || 0;
      const r1 = march(G2, x, y, a, BEAM_LEN, h, null, null);
      if (!r1.wall) return;                         // chưa chạm tường thì chưa có gì để phản xạ
      let c = Math.cos(a), s = Math.sin(a);
      const px = x + c * r1.len, py = y + s * r1.len;
      // tường dọc đổi dấu x, tường ngang đổi dấu y, góc đổi cả hai
      const sx = SK.world.solidAt(G2.map, px + c * 3, py + h) && !SK.world.solidAt(G2.map, px, py + s * 3 + h), sy = SK.world.solidAt(G2.map, px, py + s * 3 + h) && !SK.world.solidAt(G2.map, px + c * 3, py + h);
      if (sx) c = -c; else if (sy) s = -s; else { c = -c; s = -s; }
      const a2 = Math.atan2(s, c), r2 = march(G2, px, py, a2, Math.max(0, BEAM_LEN - r1.len), h, null, e => SK.hurtEnemy(G2, e, dmg, false, a2, 0));
      flash(G2, px, py, a2, r2.len, '#bfe9ff');
      SK.emit('mirrorBounce', G2, p, w, r2.hit.length, dmg);
    },
    jellyfish(G2, p, w) {
      const d = w.def, dmg = beamDmg(p, d); if (!dmg) return;
      const [x, y] = muzzle(p, w), h = Math.max(2, p.y - y), a = p.aim || 0;
      const r1 = march(G2, x, y, a, BEAM_LEN, h, null, null, true);
      if (!r1.at) return;
      const half = Math.ceil(dmg / 2), [cx, cy, e0] = r1.at, n0 = r1.hit.length;
      for (const sg of [-1, 1]) {
        const a2 = a + sg * JELLY_SPREAD;
        march(G2, cx, cy, a2, JELLY_LEN, h, [e0], e => SK.hurtEnemy(G2, e, half, false, a2, 0));
        flash(G2, cx, cy, a2, JELLY_LEN, '#ffb347');
      }
      SK.emit('jellySplit', G2, p, w, half);
    },
    hilt(G2, p, w, a) {
      const d = w.def, name = d.nameEn || '', n = /Laser Sword (Purple|Gold)/i.test(name) ? 3 : /Laser Sword (Red|Green|Blue)/i.test(name) ? 2 : 1;
      const size = { green: 1, blue: 1.4, purple: 1.7 }[a.rar] || 1, thr = a.rar === 'green' ? 0 : 99, [x, y] = muzzle(p, w), ang = p.aim || 0;
      for (let i = 0; i < n; i++) {
        const o = SK.spawnBullet86(G2, 'p', '_bullet_sword_light', x, y, ang + SK.deg((i - (n - 1) / 2) * 14), { dmg: a.v, crit: false, spd: 14, size, thr, owner: p, h: Math.max(2, p.y - y), life: 1 });
        if (o) { o._a5 = 1; o.hilt = true; }
      }
    },
    enhanced(G2, p, w) { for (const b of freshBullets(G2)) b.pierce = (b.pierce | 0) + 1; },
    energystone(G2, p, w, a) {
      if (SK.rand() >= CFG5.proc) return;
      const e0 = p.energy; p.energy = Math.min(p.energyMax, p.energy + a.v);
      if (p.energy > e0) SK.num(G2, p.x + 4, p.y - 20, '+' + (p.energy - e0), '#6ac8ff');
      SK.emit('energyStone', G2, p, p.energy - e0);
    },
    bulletfish(G2, p, w, a) {
      const f = freshBullets(G2).filter(b => !b.melee && !b.slashFly && !b.orbit);
      if (!f.length || SK.rand() >= CFG5.proc) return;
      const b0 = f[Math.floor(SK.rand() * f.length)];
      b0.dead = true;
      const o = SK.spawnBullet86(G2, 'p', 'bullet_fish_evo', b0.x, b0.y, p.aim || 0, { dmg: a.v, crit: false, spd: 24, thr: 99, owner: p, h: b0.h, life: 2 });
      if (o) { o._a5 = 1; o.fish = true; }
    },
    starfish(G2, p, w, a) {
      if (SK.rand() >= CFG5.proc) return;
      const f = freshBullets(G2); let x, y;
      if (f.length) { x = f[0].x; y = f[0].y; for (const b of f) b.dead = true; } else { [x, y] = muzzle(p, w); }
      const o = SK.spawnBullet86(G2, 'p', 'bullet_38_star', x, y, p.aim || 0, { dmg: a.v, crit: false, spd: 14, owner: p, h: Math.max(2, p.y - y), life: 1.2 });
      if (o) { o._a5 = 1; o.star = true; o.reb = 0; }
    }
  };
  SK.on('fire', (G2, p, w) => {
    const a = w && w.att, h = a && HOOK[a.key];
    if (h && G2.player === p) h(G2, p, w, a);
  });
  // Phụ kiện Nâng cấp: dùng một lần, đổi vũ khí đang cầm sang bản khác (bản đồ theo số hiệu prefab); trả id mới hoặc null.
  function upgradeTo(d, key) {
    const to = UP[key] && UP[key][d.prefab];
    return to ? Object.keys(DS.weapons).find(id => DS.weapons[id].prefab === to) || null : null;
  }
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
    if (ATT[a.key].g === 'up') {
      const id = upgradeTo(d, a.key), p = G.player;
      if (SK.profile && SK.profile.pickWeapon) SK.profile.pickWeapon(id);
      p.weapons[p.cur] = SK.makeWeapon(id);
      it.used = true; it.uses++; it.anim = 1.6;
      U.snd(U.evClip('shop') || 'fx_buy', 0.7);
      U.vfx('effect_smoke', it.x, it.y - 14, {});
      say('Xong rồi — ' + ATT[a.key].vi + ': ' + DS.weapons[id].name, 3.2);
      SK.emit(fish ? 'fishAttach' : 'smithAttach', G, w.id, a, n);
      return;
    }
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

  R.dnpc2 = { ATT, UP, CFG5, HOOK, march, upgradeTo, attList, rollAtt, withAtt, equip, blocked, smithPrice, FISH_PRICE, MENTOR_MAX, MENTOR_CD, mentorPrice, slotRoll, slotPrice, SLOT_PRICE, SLOT_HIT, SLOT_AWARDS, SLOT_PUNISH, SLOT_POOL };
})();
