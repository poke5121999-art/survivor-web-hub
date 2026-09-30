// Kỹ năng Kỹ Sư (c05): armor_mount. Đồ nghề chung ở SK.skillKit (js/skills.js).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, DS = SK.DS, T = SK.TILE;
  const { layer, MB, setMul, hurtMods, shoot, inRadius, hit, fx, drawRip, DUR_UI } = K;

  // Vũ Trang Cơ Giáp [ĐO c05/skill 2: cd 14; m_mech_0: RoleAttributePlayer max_hp 7, RGMountController defence 1, speedRate -0.2,
  // deadObject explode_hit_enemy, deadClip fx_mech_dead; hai súng h1 đều là Gun001 damage 3, speed 36, xuyên 10, critic 10,
  // độ lệch 15 - 8, consume 1 (một năng lượng mỗi loạt); clip fire dài 0.1667 s]: cưỡi cơ giáp Nguyên Mẫu thay cho vũ khí; máu của
  // cơ giáp hứng sát thương trước (trừ thủ 1), hết máu thì cơ giáp nổ và người chơi rơi ra. Hạn giờ nằm trong mã, wiki không nêu
  // số: 10 s [ƯỚC LƯỢNG].
  const MECH = { life: 10, hp: 7, def: 1, speed: -0.2, dmg: 3, bulletSpeed: 36, pierce: 10, crit: 10, rps: 1 / 0.1667, dev: 7, cost: 1, lift: 12 };
  DUR_UI.armor_mount = MECH.life;
  const GUN = [[11.18, 9.98], [-12.51, 9.98]];   // [ĐO prefab] vị trí m_mech_0_1 và missle_left
  const snd = n => { if (window.SK_AUDIO && SK_AUDIO.clips[n] && SK.sfx && SK.sfx.play) SK.sfx.play(n, { poly: 2, gap: 0.05, vol: 0.7 }); };

  // Súng của cơ giáp không có dữ liệu 8.6 trong vũ khí người chơi: chạy bằng legacyRun, mỗi loạt bắn cả hai nòng.
  Object.defineProperty(DS.weapons, '_mech_gun', { configurable: true, writable: true, enumerable: false,
    value: { name: 'Súng Cơ Giáp', kind: 'mech_gun', dmg: MECH.dmg, cost: MECH.cost, crit: MECH.crit, rps: MECH.rps, sprite: 'nothing' } });
  SK.WEAPON_KINDS.mech_gun = {
    fire(G, p, w) {
      const m = p._mech; if (!m) return;
      for (const [ox, oy] of GUN) {
        const mx = p.x + (ox * p.face) + Math.cos(p.aim) * 8, my = p.y - oy + Math.sin(p.aim) * 8;
        shoot(G, p, mx, my, p.aim + SK.deg(SK.randf(-MECH.dev, MECH.dev)), { dmg: Math.round(MECH.dmg * (p.dmgMul || 1)), speed: MECH.bulletSpeed, critChance: MECH.crit + (p.crit || 0), sprite: 'bullet_12', hit: 'hit_orange', repel: 1, pierce: MECH.pierce });
        SK.fx(G, 'muzzle', mx, my, { ang: p.aim, dur: 0.05 });
      }
      m.kick = 1;
    }
  };

  S.armor_mount = {
    start(G, p) {
      layer(G);
      p.skillT = MECH.life;
      p._mech = { hp: MECH.hp, hpMax: MECH.hp, saved: p.weapons[p.cur], slot: p.cur, t: 0, kick: 0, flash: 0 };
      p.weapons[p.cur] = SK.makeWeapon('_mech_gun');
      setMul(p, 'moveMul', 'mech', 1 + MECH.speed);
      hurtMods(p).mech = (G2, pl, dmg) => {
        const m = pl._mech; if (!m) return dmg;
        const d = Math.max(1, dmg - MECH.def);
        m.hp -= d; m.flash = 0.1; m.hurt = true;
        SK.num(G2, pl.x, pl.y - 30, d, '#ffb14a');
        pl.invulT = SK.DS.rules.hurtInvuln;
        if (m.hp <= 0) { m.dead = true; SK.endSkill(G2, pl); }
        return 0;
      };
      fx(G, 'effect_c1_skill', p.x, p.y, { follow: p, dur: 0.5 });
      snd('get_in_mecha');
    },
    update(G, p, dt) {
      const m = p._mech; if (!m) return;
      m.t += dt; m.flash = Math.max(0, m.flash - dt); m.kick = Math.max(0, m.kick - dt * 6);
      p.cur = m.slot;   // trên cơ giáp không đổi sang vũ khí khác
    },
    press(G, p) { SK.endSkill(G, p); },   // bấm kỹ năng lần nữa: xuống cơ giáp
    end(G, p) {
      const m = p._mech; p._mech = null;
      delete hurtMods(p).mech; setMul(p, 'moveMul', 'mech', 1);
      if (!m) return;
      if (p.weapons[m.slot] && p.weapons[m.slot].id === '_mech_gun') p.weapons[m.slot] = m.saved;
      if (m.dead) {
        // deadObject explode_hit_enemy [ĐO]: nổ tại chỗ, quái xung quanh nhận sát thương của vụ nổ.
        const dmg = MB('explode_hit_enemy', 'Explode', 'damage', 8);
        fx(G, 'explode_hit_enemy', p.x, p.y - 8, {});
        for (const e of inRadius(G, p.x, p.y - 8, 2 * T)) hit(G, p, e, dmg, { noMul: true, repel: 3, tag: 'mech_boom' });
        G.shake = Math.max(G.shake, 3);
        snd('fx_mech_dead');
        p.invulT = Math.max(p.invulT, 0.8);
      }
    }
  };

  // Vẽ cơ giáp dưới chân, người lái nâng lên trên thân; thanh máu cơ giáp trên đầu.
  const drawPlayer1 = SK.drawPlayer;
  SK.drawPlayer = function (ctx, G) {
    const p = G.player, m = p && p._mech;
    if (!m || p.st === 'dead') return drawPlayer1(ctx, G);
    const parts = SK.prefab('m_mech_0');
    const pop = Math.min(1, m.t / 0.5);   // showup: cơ giáp trồi từ dưới lên 0.5 s [ĐO clip showup]
    ctx.save();
    ctx.translate(0, (1 - pop) * 6.4);
    if (parts) drawRip(ctx, parts, p.x, p.y, { flip: p.face < 0, skip: q => /mount_hp|dead_tap/.test(q.n), pages: m.flash > 0 ? SK.pagesWhite : null });
    ctx.translate(0, -MECH.lift * pop);
    drawPlayer1(ctx, G);
    ctx.restore();
    const w = 16, x = Math.round(p.x - w / 2), y = Math.round(p.y - 44);
    ctx.fillStyle = '#300'; ctx.fillRect(x, y, w, 2);
    ctx.fillStyle = '#3cb4e0'; ctx.fillRect(x, y, Math.round(w * Math.max(0, m.hp) / m.hpMax), 2);
  };
})();
