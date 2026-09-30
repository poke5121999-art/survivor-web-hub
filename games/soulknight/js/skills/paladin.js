// Kỹ năng Kỵ Sĩ Thánh (c07): holy_warrior, splash_bash. Đồ nghề chung ở SK.skillKit (js/skills.js).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, DS = SK.DS, U = SK.PPU, T = SK.TILE, W = SK.world;
  const { cfg, layer, alive, ec, nearest, inRadius, hit, fx, ripFx, hurtMods, swapAnims, DUR_UI } = K;
  const snd = (n, o) => { if (n && window.SK_AUDIO && SK_AUDIO.clips[n] && SK.sfx && SK.sfx.play) SK.sfx.play(n, o || { poly: 2, gap: 0.05, vol: 0.7 }); };
  const weaponDef = (id, def) => Object.defineProperty(DS.weapons, id, { configurable: true, writable: true, enumerable: false, value: def });
  // Thay vũ khí đang cầm bằng vũ khí kỹ năng; trả lại bằng disarm. Đổi ô (Q) bị kéo về ô đang cầm.
  function arm(p, st, id) { st.saved = p.weapons[p.cur]; st.slot = p.cur; p.weapons[p.cur] = SK.makeWeapon(id); return p.weapons[p.cur]; }
  function disarm(p, st, id) { if (p.weapons[st.slot] && p.weapons[st.slot].id === id) p.weapons[st.slot] = st.saved; }
  // Vệt chém lưỡi liềm (clip axe của bullet_axe_ranger), xoay theo hướng chém.
  function crescent(G, x, y, ang, scale, dur) {
    const key = 'bullet_axe_ranger/axe', left = Math.cos(ang) < 0;
    G.props.push({ x, y: 1e9, t: 0,
      update(G2, q, dt) { q.t += dt; if (q.t >= dur) q.gone = true; },
      draw(ctx, G2, q) {
        const f = SK.animFrame(key, q.t / dur * SK.animLen(key));
        if (f) SK.draw(ctx, f, x, y, { rot: left ? ang + Math.PI : ang, sx: scale, sy: scale, flip: left });
      } });
  }

  // Thần Hoá [ĐO c07/skill 2: cd 14, duration 6.5; m_mech_paladin: RGMountController, /img scale 1.75 (= C07Controller.skill1Scale[0]),
  // thân paladin_god_0..3 (clip m_paladin_controller/idle), kiếm weapons3_89; vũ khí GunBadminton: đạn[0] damage 10 critic 10
  // size 4 speed 0 (nhát chém), đạn[1] damage 10 critic 10 speed 32 (sóng kiếm), weapon_speed 0.5, atk_move_speed -0.2; clip
  // w_sword 0 dài 0.5 s, sự kiện Attack ở 0.0667 s]: hoá võ sĩ cao 1.75 lần, chỉ dùng được kiếm: mỗi 1 s chém một nhát rộng,
  // đồng thời bắn sóng kiếm xuyên quái và xoá đạn địch [WIKI: "like Caliburn"]. Tầm chém là [ƯỚC LƯỢNG].
  const HW = { scale: 1.75, dmg: 10, crit: 10, swing: 1, hitAt: 0.0667, reach: 3.5 * T, wave: 32 * U, waveLife: 0.9, waveR: 9, move: -0.2 };
  weaponDef('_holy_sword', { name: 'Kiếm Thần', kind: 'holy_sword', dmg: HW.dmg, cost: 0, crit: HW.crit, rps: 1 / HW.swing, moveMod: HW.move, sprite: 'nothing' });
  SK.WEAPON_KINDS.holy_sword = {
    fire(G, p, w) {
      const h = p._holy; if (!h) return;
      const ang = p.aim; h.swingT = 0.5;
      G.props.push({ x: 0, y: -1e9, t: 0, draw() {},
        update(G2, q, dt) {
          q.t += dt; if (q.t < HW.hitAt) return;
          q.gone = true;
          const cx = p.x, cy = p.y - 14, c1 = Math.cos(ang), s1 = Math.sin(ang);
          const inArc = (x, y, pad) => { const dx = x - cx, dy = y - cy; return Math.hypot(dx, dy) < HW.reach + pad && dx * c1 + dy * s1 > -pad; };   // nửa vòng phía trước
          for (const e of G2.enemies) { if (!alive(e)) continue; const [x, y] = ec(e); if (inArc(x, y, e.r)) hit(G2, p, e, HW.dmg, { critChance: HW.crit + (p.crit || 0), ang, repel: 3, fx: 'hit_white', tag: 'holy_slash' }); }
          for (const b of G2.bullets) if (b.side === 'e' && !b.dead && inArc(b.x, b.y, 4)) { b.dead = true; fx(G2, 'hit_orange', b.x, b.y, { scale: 0.6 }); }
          crescent(G2, cx + c1 * 14, cy + s1 * 14, ang, HW.reach / 30, 0.26);
          waveOf(G2, p, cx + c1 * 10, cy + s1 * 10, ang);
          G2.shake = Math.max(G2.shake, 2);
        } });
    }
  };
  // Sóng kiếm bay thẳng 32 đơn vị/s, xuyên mọi quái (mỗi con một lần), triệt đạn địch chạm phải.
  function waveOf(G, p, x, y, ang) {
    const seen = new Set(), c1 = Math.cos(ang), s1 = Math.sin(ang);
    G.props.push({ x, y: 1e9, t: 0,
      update(G2, q, dt) {
        q.t += dt;
        const n = 4;
        for (let i = 0; i < n; i++) {
          x += c1 * HW.wave * dt / n; y += s1 * HW.wave * dt / n;
          if (W.solidAt(G2.map, x, y + 6) || q.t > HW.waveLife) { q.gone = true; return; }
          for (const e of G2.enemies) { if (!alive(e) || seen.has(e)) continue; const [ex, ey] = ec(e); if (Math.hypot(ex - x, ey - y) < HW.waveR + e.r) { seen.add(e); hit(G2, p, e, HW.dmg, { critChance: HW.crit + (p.crit || 0), ang, repel: 3, fx: 'hit_white', tag: 'holy_wave' }); } }
          for (const b of G2.bullets) if (b.side === 'e' && !b.dead && Math.hypot(b.x - x, b.y - y) < HW.waveR + b.r) { b.dead = true; fx(G2, 'hit_orange', b.x, b.y, { scale: 0.6 }); }
        }
      },
      draw(ctx, G2, q) { const left = c1 < 0; SK.draw(ctx, 'effect_axe_2', x, y, { rot: left ? ang + Math.PI : ang, flip: left, sx: 0.5, sy: 0.5, alpha: Math.min(1, (HW.waveLife - q.t) * 3) }); }
    });
  }
  S.holy_warrior = {
    start(G, p) {
      layer(G);
      p.skillT = cfg(p, 'holy_warrior').dur || 6.5;
      const h = p._holy = { swingT: 0, alpha: p._alpha };
      arm(p, h, '_holy_sword');
      swapAnims(p, 'm_paladin_controller/idle', 'm_paladin_controller/run');
      p._alpha = 0.694;   // [ĐO m_mech_paladin/img/body màu (1,1,1,0.694)]
      fx(G, 'effect_up', p.x, p.y, { follow: p, dur: 1 });
      snd('fx_skill_c8');
    },
    update(G, p, dt) { const h = p._holy; if (h) { h.swingT = Math.max(0, h.swingT - dt); p.cur = h.slot; } },
    end(G, p) {
      const h = p._holy; p._holy = null;
      swapAnims(p, null);
      if (!h) return;
      p._alpha = h.alpha; disarm(p, h, '_holy_sword');
    }
  };

  // Thuẫn Vỡ Nứt [ĐO c07/skill 3: cd 9.5, duration 1.5; weapon_skill_paladin: GunPaladinSkill defence 2, đạn bullet_shield_jump speed 22,
  // damage 6, throughCount 7; C07Controller.skill2Info: flyTime 4, jumpSearchRange 14, waveRange 0.5, waveDamage[0] 3, reflectCount[0] 7;
  // BuffWaterShield: armor 2, energy 5; sfx fx_shield_up, fx_whistled]: giơ khiên thay vũ khí (thủ +2); bấm đánh thì ném khiên,
  // khiên nảy qua tối đa 7 quái trong 14 đơn vị và mỗi lần trúng phát xung thánh quang 3 sát thương; hết quãng hoặc hết quái thì
  // quay về người, hồi 2 giáp + 5 năng lượng rồi kỹ năng kết thúc [WIKI]. Bấm kỹ năng lần nữa: cất khiên / gọi khiên về.
  // Thời gian giơ khiên không có trong config (duration 1.5 chưa rõ nghĩa): giơ tới khi bấm lại, tối đa 30 s [ƯỚC LƯỢNG].
  const SB = { hold: 30, def: 2, dmg: 6, speed: 22 * U, hitR: 8, wave: 3, waveR: 28, reflect: 7, fly: 4, range: 14 * U, armor: 2, energy: 5 };
  DUR_UI.splash_bash = SB.hold;
  weaponDef('_shield_weapon', { name: 'Khiên Thánh', kind: 'shield_throw', dmg: SB.dmg, cost: 0, crit: 0, rps: 2, sprite: 'paladin_0_skill_0_effect_0_0' });
  SK.WEAPON_KINDS.shield_throw = {
    fire(G, p) {
      const s = p._sb; if (!s || s.state !== 'held') return;
      s.state = 'fly'; s.t = 0; s.jumps = 0; s.last = null; s.x = p.x + p.face * 6; s.y = p.y - 8;
      s.spin = 0; s.target = null;
      p.weapons[s.slot].def = Object.assign({}, DS.weapons._shield_weapon, { sprite: 'nothing' });
      delete hurtMods(p).splash;
      snd('fx_whistled');
    }
  };
  S.splash_bash = {
    start(G, p) {
      layer(G);
      p.skillT = SB.hold;
      const s = p._sb = { state: 'held', x: p.x, y: p.y, t: 0, jumps: 0, last: null, spin: 0 };
      arm(p, s, '_shield_weapon');
      hurtMods(p).splash = (G2, pl, dmg) => Math.max(1, dmg - SB.def);   // thủ +2 khi cầm khiên [ĐO defence 2]
      fx(G, 'buff_water_shield', p.x, p.y - 8, { follow: p, dy: -8, dur: 0.6 });
      snd('fx_shield_up');
    },
    update(G, p, dt) {
      const s = p._sb; if (!s) return;
      p.cur = s.slot;
      if (s.state === 'held') return;
      s.t += dt; s.spin += dt * 18;
      let tx, ty, back = s.state === 'back';
      if (!back) {
        if (s.jumps >= SB.reflect || s.t >= SB.fly) back = true;
        else {
          if (!s.target || !alive(s.target)) s.target = s.jumps === 0 ? (K.targetAng(G, p).e || nearest(G, s.x, s.y, SB.range)) : nearest(G, s.x, s.y, SB.range, { skip: e => e === s.last });
          if (!s.target) back = true; else [tx, ty] = ec(s.target);
        }
        if (back) s.state = 'back';
      }
      if (back) { tx = p.x; ty = p.y - 8; }
      const dx = tx - s.x, dy = ty - s.y, d = Math.hypot(dx, dy), step = SB.speed * dt;
      if (d <= Math.max(step, back ? 6 : SB.hitR)) {
        s.x = tx; s.y = ty;
        if (back) { returned(G, p); return; }
        onHit(G, p, s.target); s.last = s.target; s.target = null; s.jumps++;
      } else { s.x += dx / d * step; s.y += dy / d * step; }
    },
    press(G, p) {
      const s = p._sb; if (!s) return;
      if (s.state === 'held') SK.endSkill(G, p);
      else s.state = 'back';   // gọi khiên về
    },
    end(G, p) {
      const s = p._sb; p._sb = null;
      delete hurtMods(p).splash;
      if (s) disarm(p, s, '_shield_weapon');
    }
  };
  function onHit(G, p, e) {
    const [x, y] = ec(e), a = Math.atan2(y - p._sb.y, x - p._sb.x);
    hit(G, p, e, SB.dmg, { critChance: p.crit, ang: a, repel: 2, fx: 'hit_white', tag: 'shield' });
    // xung thánh quang quanh chỗ trúng [ĐO shield_wave, waveRange 0.5]
    ripFx(G, 'shield_wave', x, y, { top: true, scale: SB.waveR / 56, dur: 0.5 });
    for (const q of inRadius(G, x, y, SB.waveR)) hit(G, p, q, SB.wave, { repel: 1, tag: 'shield_wave' });
    G.shake = Math.max(G.shake, 1.5);
  }
  function returned(G, p) {
    p._sb.state = 'done';
    p.armor = Math.min(p.armorMax, p.armor + SB.armor);
    p.energy = Math.min(p.energyMax, p.energy + SB.energy);
    SK.num(G, p.x, p.y - 30, '+' + SB.armor, '#c9d2df');
    fx(G, 'effect_health_skill', p.x, p.y - 2, { follow: p, dy: -2, layer: 'ground' });
    SK.endSkill(G, p);
  }
  // Khiên đang bay (thanh chứa trạng thái ở p._sb): vẽ xoay tròn.
  const drawPlayer1 = SK.drawPlayer;
  SK.drawPlayer = function (ctx, G) {
    const p = G.player, hw = p && p._holy;
    if (hw) {
      ctx.save();
      ctx.translate(p.x, p.y); ctx.scale(HW.scale, HW.scale); ctx.translate(-p.x, -p.y);
      drawPlayer1(ctx, G);
      ctx.restore();
      if (p.st !== 'dead') {
        // Kiếm cầm ở tay (prefab h1 [8.4, 15.4] × 1.75), quét theo clip w_sword 0: từ trên xuống rồi về thế nghỉ.
        const hx = p.x + 8.4 * HW.scale * p.face * 0.5, hy = p.y - 15.4 * HW.scale * 0.8, dir = Math.cos(p.aim) < 0 ? -1 : 1;
        const k = hw.swingT > 0 ? 1 - hw.swingT / 0.5 : 1;
        const ang = p.aim + (hw.swingT > 0 ? (k * 2.4 - 1.2) : -0.7) * dir;
        SK.drawGun(ctx, 'weapons3_89', hx, hy, ang, null, { scale: HW.scale });
      }
      return;
    }
    drawPlayer1(ctx, G);
    const s = p && p._sb;
    if (s && (s.state === 'fly' || s.state === 'back') && p.st !== 'dead') {
      ctx.save(); ctx.globalAlpha = 0.3; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(s.x, s.y + 8, 5, 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      SK.draw(ctx, 'paladin_0_skill_0_effect_0_0', s.x, s.y, { rot: s.spin });
    }
  };
})();
