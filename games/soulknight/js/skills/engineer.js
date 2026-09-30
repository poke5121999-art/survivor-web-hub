// Kỹ năng Kỹ Sư (c05): armor_mount. Đồ nghề chung ở SK.skillKit (js/skills.js).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, DS = SK.DS, T = SK.TILE;
  const { layer, setMul, hurtMods, shoot, inRadius, hit, fx, drawRip, DUR_UI } = K;

  // Vũ Trang Cơ Giáp [ĐO c06/skill 2: cd 14; C06Controller.RoleSkill1 (mech m_mech_0: max_hp = 8, GunMechBoom damage = ProcessSkillDamage(50)),
  // RGMountController.ConsumingHp (trừ 1 máu mỗi 1 s, lần đầu sau 1 s: máu cơ giáp chính là đồng hồ), RGController.GetHurt (đòn vào người lái
  // trừ thủ rồi trừ defence 1 của cơ giáp, sàn 0), RGMountController.Dead/DeadExplode (rơi ra, 1 s sau nổ với sát thương = max_hp);
  // hai súng h1 đều là Gun001 damage 3, speed 36, xuyên 10, critic 10, độ lệch 15 - 8, consume 1 (một năng lượng mỗi loạt); clip fire dài 0.1667 s]:
  // cưỡi cơ giáp Nguyên Mẫu thay cho vũ khí; máu của cơ giáp hứng sát thương trước. Không có nút xuống cơ giáp: hết máu (kể cả bị trừ dần)
  // thì nổ, hoặc bấm nút đặc biệt để tự huỷ: sau 1 s GunMechBoom nổ 50 rồi cơ giáp chết [ĐO GunMechBoom explodeDelay 1, Explode -> Dead].
  const MECH = { hp: 8, drain: 1, def: 1, speed: -0.2, dmg: 3, bulletSpeed: 36, pierce: 10, crit: 10, rps: 1 / 0.1667, dev: 7, cost: 1, lift: 12,
    deadDelay: 1, boom: 50, boomDelay: 1, boomR: 2 * T /* bán kính nổ [ƯỚC LƯỢNG]: collider explode_hit_enemy nằm trong prefab */ };
  DUR_UI.armor_mount = MECH.hp;
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
      p.skillT = MECH.hp;
      p._mech = { hp: MECH.hp, hpMax: MECH.hp, saved: p.weapons[p.cur], slot: p.cur, t: 0, sub: 0, kick: 0, flash: 0, boom: 0 };
      p.weapons[p.cur] = SK.makeWeapon('_mech_gun');
      setMul(p, 'moveMul', 'mech', 1 + MECH.speed);
      hurtMods(p).mech = (G2, pl, dmg) => {
        const m = pl._mech; if (!m) return dmg;
        const d = Math.max(0, dmg - MECH.def);
        m.flash = 0.1;
        SK.num(G2, pl.x, pl.y - 30, d, '#ffb14a');
        pl.invulT = SK.DS.rules.hurtInvuln;
        wound(G2, pl, d);
        return 0;
      };
      fx(G, 'effect_c1_skill', p.x, p.y, { follow: p, dur: 0.5 });
      snd('get_in_mecha');
    },
    update(G, p, dt) {
      const m = p._mech; if (!m) return;
      m.t += dt; m.flash = Math.max(0, m.flash - dt); m.kick = Math.max(0, m.kick - dt * 6);
      p.cur = m.slot;   // trên cơ giáp không đổi sang vũ khí khác
      // Trừ 1 máu mỗi giây, lần đầu sau 1 s [ĐO RGMountController.ConsumingHp].
      for (m.sub += dt; m.sub >= MECH.drain && !m.dead; m.sub -= MECH.drain) wound(G, p, 1);
      if (m.boom > 0 && !m.dead) { m.boom -= dt; if (m.boom <= 0) detonate(G, p); }
      if (!m.dead) p.skillT = Math.max(0.01, m.hp - m.sub);   // vòng HUD = số giây còn lại tới khi cạn máu
    },
    // Nút đặc biệt: tự huỷ, 1 s sau GunMechBoom nổ [ĐO GunMechBoom.Attack: Invoke("Explode", explodeDelay)].
    special(G, p) { const m = p._mech; if (m && !m.dead && !(m.boom > 0)) { m.boom = MECH.boomDelay; m.flash = 0.1; } },
    end(G, p) {
      const m = p._mech; p._mech = null;
      delete hurtMods(p).mech; setMul(p, 'moveMul', 'mech', 1);
      if (!m) return;
      if (p.weapons[m.slot] && p.weapons[m.slot].id === '_mech_gun') p.weapons[m.slot] = m.saved;
      if (m.dead) deadBody(G, p);
    }
  };
  // Máu cơ giáp giảm; hết máu thì cơ giáp chết và người lái rơi ra [ĐO RGMountController.GetHurt / Dead].
  function wound(G, p, d) {
    const m = p._mech; if (!m || m.dead) return;
    m.hp -= d;
    if (m.hp <= 0) { m.dead = true; SK.endSkill(G, p); }
  }
  function detonate(G, p) {
    const m = p._mech, x = p.x, y = p.y - 8;
    fx(G, 'explode_hit_enemy', x, y, {});
    for (const e of inRadius(G, x, y, MECH.boomR)) hit(G, p, e, MECH.boom, { repel: 3, tag: 'mech_boom' });
    G.shake = Math.max(G.shake, 4);
    m.dead = true; SK.endSkill(G, p);
  }
  // Xác cơ giáp nằm lại 1 s rồi nổ với sát thương = max_hp [ĐO DeadExplode: Explode.damage = max_hp; deadExplosionDelay 1].
  function deadBody(G, p) {
    const x = p.x, y = p.y, face = p.face;
    snd('fx_mech_dead');
    G.props.push({ x, y: 1e9, t: 0,
      update(G2, q, dt) {
        q.t += dt; if (q.t < MECH.deadDelay) return;
        q.gone = true;
        fx(G2, 'explode_hit_enemy', x, y - 8, {});
        for (const e of inRadius(G2, x, y - 8, MECH.boomR)) hit(G2, p, e, MECH.hp, { noMul: true, repel: 3, tag: 'mech_dead' });
        G2.shake = Math.max(G2.shake, 3);
      },
      draw(ctx, G2, q) {
        const parts = SK.prefab('m_mech_0');
        if (parts && Math.floor(q.t * 12) % 2 === 0) drawRip(ctx, parts, x, y, { flip: face < 0, skip: r => /mount_hp|dead_tap/.test(r.n) });
      } });
  }

  // Vẽ cơ giáp dưới chân, người lái nâng lên trên thân; thanh máu cơ giáp trên đầu.
  const drawPlayer1 = SK.drawPlayer;
  SK.drawPlayer = function (ctx, G) {
    const p = G.player, m = p && p._mech;
    if (!m || p.st === 'dead') return drawPlayer1(ctx, G);
    const parts = SK.prefab('m_mech_0');
    const pop = Math.min(1, m.t / 0.5);   // showup: cơ giáp trồi từ dưới lên 0.5 s [ĐO clip showup]
    ctx.save();
    ctx.translate(0, (1 - pop) * 6.4);
    if (parts) drawRip(ctx, parts, p.x, p.y, { flip: p.face < 0, skip: q => /mount_hp|dead_tap/.test(q.n), pages: m.flash > 0 || (m.boom > 0 && Math.floor(m.boom * 10) % 2) ? SK.pagesWhite : null });
    ctx.translate(0, -MECH.lift * pop);
    drawPlayer1(ctx, G);
    ctx.restore();
    const w = 16, x = Math.round(p.x - w / 2), y = Math.round(p.y - 44);
    ctx.fillStyle = '#300'; ctx.fillRect(x, y, w, 2);
    ctx.fillStyle = '#3cb4e0'; ctx.fillRect(x, y, Math.round(w * Math.max(0, m.hp) / m.hpMax), 2);
  };
})();
