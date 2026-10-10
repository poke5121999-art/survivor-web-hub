// Thú cưỡi sinh vật (Bước C của tools/polish/MOUNTS.md). Dữ liệu: data/sk-mounts.js (sinh bởi tools/mounts/build_mounts.py từ prefab 8.6).
// Trạng thái p.mount = {id, hp, hpMax, def, speedRate}. Luật [WIKI Mounts, MOUNTS.md mục 2]:
//  - thú nhận sát thương thay người; vỡ thì biến mất, phần dư bị chặn (không truyền sang người);
//  - lên/xuống bằng phím tương tác; đang cưỡi thì không dùng được kỹ năng (nút kỹ năng bị bỏ qua);
//  - qua tầng: thú hồi floor(hpMax/2) (Kỹ Sư: đầy); buff Thú Cưng (17) +50% máu; chế độ Badass +2 (+3 với Thú Cưng).
// Tốc: hệ số speedRate nhân vào tốc chạy ở actors.js. Chưa làm: cơ giáp (Bước D), thú mùa Tam Quốc, hồi bằng bình máu (xem GAPS.md).
(function () {
  'use strict';
  const SK = window.SK;
  const DS = SK.DS, R = DS.rules;
  const MD = () => window.SK_MOUNTS || { order: [], mounts: {}, sellers: { creature: [] }, rules: {} };
  // Prefab của hai con này tên khác id trong bảng cấu hình.
  const ART = { micemonkey: 'mIceMonkey', mdungbeetle: 'mDungBeetle' };
  SK.mountDef = id => MD().mounts[id] || null;

  function hpOf(G, M) {
    const p = G.player, pet = !!(p && p.buffs && p.buffs.indexOf(17) >= 0);
    let hp = M.hp;
    if (pet) hp = Math.floor(hp * 1.5);
    if (G.badass && M.kind === 'creature') hp += pet ? 3 : 2;
    return hp;
  }

  // Vẽ một con (dùng ở quán, dưới chân người cưỡi, con bỏ lại trên đất).
  SK.mountDraw = function (ctx, id, x, y, t, o) {
    o = o || {};
    const pf = SK.prefab(ART[id] || id), anims = (pf && pf[0] && pf[0].a) || {};
    const key = o.moving ? (anims.run || anims.ide) : (anims.ide || anims.run);
    const fr = key && SK.animFrame(key, t);
    if (!fr || !SK.draw(ctx, fr, x, y, { flip: o.flip, pages: o.flash ? SK.pagesWhite : null })) {
      ctx.fillStyle = '#b07a52'; ctx.fillRect(x - 8, y - 10, 16, 10);
    }
  };

  // Con bị bỏ lại trên đất (xuống thú, đổi sang thú khác): bấm tương tác để cưỡi lại, giữ nguyên máu.
  function dropMount(G, m, x, y) {
    const M = SK.mountDef(m.id), prop = { x, y, t: SK.rand() * 2, gone: false, draw(ctx, G2, pr) {
      if (pr.gone) return;
      SK.mountDraw(ctx, m.id, x, y, G.t + pr.t, { flip: false });
    } };
    G.props.push(prop);
    G.interactables.push({
      x, y: y + 4, r: 22, labelY: 40, get gone() { return prop.gone; },
      get label() { return 'Cưỡi ' + (M ? M.vi : m.id); },
      use() { if (prop.gone) return; prop.gone = true; SK.mountOn(G, G.player, m.id, { hp: m.hp, hpMax: m.hpMax }); }
    });
    return prop;
  }

  // opt: {hp, hpMax} giữ máu cũ (cưỡi lại); không có thì máu đầy theo bảng.
  SK.mountOn = function (G, p, id, opt) {
    const M = SK.mountDef(id); if (!M || !p || p.st === 'dead') return null;
    opt = opt || {};
    if (p.mount) dropMount(G, p.mount, p.x - p.face * 14, p.y);     // đã cưỡi con khác: con cũ bỏ lại mặt đất [WIKI]
    const hpMax = opt.hpMax != null ? opt.hpMax : hpOf(G, M);
    p.mount = { id, hp: opt.hp != null ? opt.hp : hpMax, hpMax, def: M.def || 0, speedRate: M.speedRate || 0, kind: M.kind };
    SK.emit('mountOn', G, p.mount);
    return p.mount;
  };
  SK.mountDismount = function (G, p) {
    const m = p && p.mount; if (!m) return false;
    p.mount = null;
    dropMount(G, m, p.x + p.face * 14, p.y);
    SK.emit('mountOff', G, m);
    return true;
  };
  function mountBreak(G, p) {
    const m = p.mount; p.mount = null;
    if (SK.vfx && SK.vfx.has && SK.vfx.has('effect_smoke')) SK.vfx.spawn(G, 'effect_smoke', p.x, p.y - 6, {});
    SK.emit('mountBreak', G, m);
  }

  // Sát thương: thú nhận trước người. Bỏ qua khi người đang bất tử (hurtPlayer gốc cũng từ chối) hoặc đã chết.
  const baseHurt = SK.hurtPlayer;
  SK.hurtPlayer = function (G, dmg, ...rest) {
    const p = G.player, m = p && p.mount;
    if (!m || p.st === 'dead' || p.invulT > 0 || !(dmg > 0)) return baseHurt.call(this, G, dmg, ...rest);
    if (G.badass) dmg += DS.badass.dmgAdd;
    const take = m.def > 0 ? Math.max(1, dmg - m.def) : dmg;       // giáp trừ mỗi đòn (sinh vật giáp 0; cơ giáp ở Bước D)
    m.hp -= take;
    p.invulT = R.hurtInvuln; p.flash = 0.1;
    G.shake = Math.max(G.shake, 2);
    SK.num(G, p.x, p.y - 26, take, '#ff9a4a');
    if (m.hp <= 0) { m.hp = 0; mountBreak(G, p); }                 // phần dư bị chặn, người không nhận
    return true;
  };

  // Qua tầng: hồi một nửa máu tối đa làm tròn xuống (Kỹ Sư: đầy) [WIKI Mounts].
  SK.on('stageEnter', G => {
    const p = G.player, m = p && p.mount; if (!m) return;
    const full = /engineer/i.test(String(p.hero || ''));
    m.hp = Math.min(m.hpMax, full ? m.hpMax : m.hp + Math.floor(m.hpMax / 2));
  });
  SK.on('runStart', G => { if (G.player) G.player.mount = null; });

  // Vẽ: thú ở dưới, người nhấc lên 6 px; thanh máu thú đỏ dưới chân.
  const baseDraw = SK.drawPlayer;
  SK.drawPlayer = function (ctx, G) {
    const p = G.player, m = p && p.mount;
    if (!m || p.st === 'dead') return baseDraw.call(this, ctx, G);
    ctx.save(); ctx.globalAlpha = G.phase === 'portal' ? Math.max(0, 1 - G.phaseT / 0.6) : 1;
    SK.mountDraw(ctx, m.id, p.x, p.y, p.t, { moving: p.moving, flip: p.face < 0, flash: p.flash > 0 });
    ctx.restore();
    ctx.save(); ctx.translate(0, -6);
    baseDraw.call(this, ctx, G);
    ctx.restore();
    const w = 16, f = m.hp / m.hpMax;
    ctx.fillStyle = '#2a1010'; ctx.fillRect(p.x - w / 2 - 1, p.y + 3, w + 2, 4);
    ctx.fillStyle = '#e24a3a'; ctx.fillRect(p.x - w / 2, p.y + 4, Math.max(1, Math.round(w * f)), 2);
  };
})();
