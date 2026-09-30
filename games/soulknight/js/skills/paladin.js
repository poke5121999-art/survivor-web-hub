// Kỹ năng Kỵ Sĩ Thánh (c07): holy_warrior, splash_bash. Đồ nghề chung ở SK.skillKit (js/skills.js).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, DS = SK.DS, U = SK.PPU, T = SK.TILE, W = SK.world;
  const { cfg, layer, alive, ec, nearest, inRadius, hit, fx, ripFx, hurtMods, swapAnims, setMul, timers, DUR_UI } = K;
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

  // Thần Hoá [ĐO c07/skill 2: cd 14, duration 6.5 (maxTime); C08Controller.RoleSkill1: cưỡi m_mech_paladin (RGMountController hasHp 0, /img scale
  // 1.75 = C08Controller.skill1Scale[0]), thân paladin_god_0..3 (clip m_paladin_controller/idle), kiếm weapons3_89; vũ khí GunBadminton (h1 weapon_225):
  // đạn[0] damage 10 critic 10 size 4 speed 0 (nhát chém, CreateSword), đạn[1] damage 10 critic 10 speed 32 (sóng kiếm, CreateBullet), cả hai cùng
  // lúc trong Attack(); weapon_speed 0.5 nên clip w_sword 0 (dài 0.5 s, sự kiện Attack ở 0.0667 s) chạy chậm gấp đôi, atk_move_speed -0.2]: hoá
  // võ sĩ cao 1.75 lần, chỉ dùng được kiếm: mỗi 1 s chém một nhát rộng, đồng thời bắn sóng kiếm xuyên quái và xoá đạn địch. Tầm chém (collider của
  // prefab đạn kiếm, chưa đọc được) và bán kính sóng là [ƯỚC LƯỢNG].
  const HW = { scale: 1.75, dmg: 10, crit: 10, speed: 0.5, clip: 0.5, hitAt: 0.0667, reach: 3.5 * T, wave: 32 * U, waveLife: 0.9, waveR: 9, move: -0.2 };
  HW.swing = HW.clip / HW.speed;   // 1 s mỗi nhát [ĐO clip / weapon_speed]
  HW.hitAt /= HW.speed;            // sự kiện Attack ở 0.133 s
  weaponDef('_holy_sword', { name: 'Kiếm Thần', kind: 'holy_sword', dmg: HW.dmg, cost: 0, crit: HW.crit, rps: 1 / HW.swing, moveMod: HW.move, sprite: 'nothing' });
  SK.WEAPON_KINDS.holy_sword = {
    fire(G, p, w) {
      const h = p._holy; if (!h) return;
      const ang = p.aim; h.swingT = HW.swing;
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
    hw: HW,   // để bài kiểm đọc số đo
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

  // Thuẫn Vỡ Nứt [ĐO c07/skill 3: cd 9.5, duration 1.5 (không dùng: RoleSkill2 không đặt giờ giơ khiên); C08Controller.RoleSkill2, weapon_skill_paladin:
  // GunPaladinSkill defence 2, đạn bullet_shield_jump speed 22; C08Controller.skill2Info: flyTime 4, jumpSearchRange 14, waveRange 0.5,
  // waveDamage [3,4,5,6], reflectCount [7,8,9,10], exShieldScale [1,1.2,1.4,1.6], exShieldDamage [6,8,10,12]; addMoveSpeed 1.3, addAtkSpeed 0.2]:
  // giơ khiên thay vũ khí (thủ +2, mỗi đòn nhận lúc giơ khiên nâng một bậc bảng trên tới bậc 3 [ĐO GunPaladinSkill.PlayerGetHurtHandler]);
  // bấm đánh thì ném khiên: khiên bay thẳng theo hướng ngắm, chạm quái thì gây sát thương + phát xung thánh quang rồi nhảy sang quái gần nhất trong 14
  // đơn vị chưa trúng (hết thì xoá danh sách; không có quái thì bay hướng ngẫu nhiên), tối đa reflectCount lần nảy; chạm tường, hết 4 s hoặc
  // hết lượt nảy thì quay về người [ĐO JumpShieldEffectTrigger.Update/TriggerWith/FindNextTarget]. Ném xong vũ khí cũ trả lại ngay và kỹ năng
  // kết thúc, hồi chiêu bắt đầu [ĐO OnShieldDestroy: SwitchWeapon, RoleSkillEnd, ReSetSkillReload]; từ lúc ném tới khi khiên về người chạy +1.3 và
  // tốc bắn +0.2 [ĐO TriggerSkill2WhenAttack/ModifyAttribute]. Khiên về: mỗi người chơi hồi giáp cấp/3 + 2 và năng lượng cấp + 10 (cấp 0: 2 và 10),
  // hồi chiêu tính lại từ lúc này [ĐO OnShieldReturn: RestoreArmorAndEnergy, ReSetSkillReload]. Bấm kỹ năng lần nữa: cất khiên khi đang giơ,
  // gọi khiên về khi đang bay [ĐO RoleSkill2: hủy vũ khí / JumpShieldEffectTrigger.CallBack]. Cộng dồn giảm hồi chiêu 0.2 mỗi lần trúng chỉ có khi
  // kỹ năng cường hoá (HasSkillStrengthen) nên không có ở đây.
  const SB = { def: 2, speed: 22 * U, fly: 4, range: 14 * U, dmg: [6, 8, 10, 12], scale: [1, 1.2, 1.4, 1.6], reflect: [7, 8, 9, 10], wave: [3, 4, 5, 6],
    addMove: 1.3, addAtk: 0.2, armor: 2, energy: 10,
    hitR: 8, waveR: 28 /* bán kính khiên và xung là [ƯỚC LƯỢNG]: collider trong prefab */ };
  DUR_UI.splash_bash = 1e4;
  weaponDef('_shield_weapon', { name: 'Khiên Thánh', kind: 'shield_throw', dmg: SB.dmg[0], cost: 0, crit: 0, rps: 2, sprite: 'paladin_0_skill_0_effect_0_0' });
  SK.WEAPON_KINDS.shield_throw = { fire(G, p) { if (p._sb) launch(G, p); } };
  S.splash_bash = {
    start(G, p) {
      layer(G);
      p.skillT = 1e4;
      const s = p._sb = { hurts: 0 };
      arm(p, s, '_shield_weapon');
      hurtMods(p).splash = (G2, pl, dmg) => { if (pl._sb && dmg > 0) pl._sb.hurts = Math.min(pl._sb.hurts + 1, SB.dmg.length - 1); return Math.max(0, dmg - SB.def); };
      fx(G, 'buff_water_shield', p.x, p.y - 8, { follow: p, dy: -8, dur: 0.6 });
      snd('fx_shield_up');
    },
    update(G, p) { const s = p._sb; if (s) p.cur = s.slot; },
    press(G, p) { if (p._sb) SK.endSkill(G, p); },   // đang giơ khiên: cất khiên
    pressCd(G, p) { const f = p._sbf; if (f && !f.back) f.back = true; },   // đang bay: gọi về
    end(G, p) {
      const s = p._sb; p._sb = null;
      delete hurtMods(p).splash;
      if (s) disarm(p, s, '_shield_weapon');
    }
  };
  function launch(G, p) {
    const s = p._sb, t = s.hurts;
    p._sbf = { x: p.x + p.face * 6, y: p.y - 8, dx: Math.cos(p.aim), dy: Math.sin(p.aim), t: 0, spin: 0, back: false, tier: t, dmg: SB.dmg[t], scale: SB.scale[t],
      reflect: SB.reflect[t], seen: new Set(), last: null };
    const base = p.h.speed;
    setMul(p, 'moveMul', 'sb', (base + SB.addMove) / base);
    setMul(p, 'rateMul', 'sb', 1 + SB.addAtk);
    snd('fx_whistled');
    SK.endSkill(G, p);
  }
  // Khiên đang bay, chạy mỗi khung dù kỹ năng đã kết thúc.
  timers.splash_bash = (G, p, dt) => {
    const f = p._sbf; if (!f) return;
    f.t += dt; f.spin += dt * 18;
    if (!f.back && f.t >= SB.fly) f.back = true;
    const n = Math.max(1, Math.ceil(SB.speed * dt / 4)), step = SB.speed * dt / n;
    for (let i = 0; i < n && p._sbf; i++) {
      if (f.back) {
        const tx = p.x, ty = p.y - 8, dx = tx - f.x, dy = ty - f.y, d = Math.hypot(dx, dy);
        if (d <= Math.max(step, 6)) { returned(G, p); return; }
        f.x += dx / d * step; f.y += dy / d * step;
        continue;
      }
      f.x += f.dx * step; f.y += f.dy * step;
      if (W.solidAt(G.map, f.x, f.y + 2)) { f.back = true; continue; }
      for (const e of G.enemies) {
        if (!alive(e) || f.seen.has(e)) continue;
        const [x, y] = ec(e);
        if (Math.hypot(x - f.x, y - f.y) <= SB.hitR * f.scale + e.r) { onHit(G, p, f, e); break; }
      }
    }
  };
  function nextTarget(G, f, cur) {
    const pick = () => nearest(G, f.x, f.y, SB.range, { skip: e => e === cur || f.seen.has(e) });
    let e = pick();
    if (!e) { f.seen.clear(); f.seen.add(cur); e = pick(); }
    return e;
  }
  function onHit(G, p, f, e) {
    const [x, y] = ec(e), a = Math.atan2(y - f.y, x - f.x);
    hit(G, p, e, f.dmg, { critChance: p.crit, ang: a, repel: 2, fx: 'hit_white', tag: 'shield' });
    // xung thánh quang quanh chỗ trúng [ĐO shield_wave, waveRange 0.5]
    ripFx(G, 'shield_wave', x, y, { top: true, scale: SB.waveR / 56, dur: 0.5 });
    for (const q of inRadius(G, x, y, SB.waveR)) hit(G, p, q, SB.wave[f.tier], { repel: 1, tag: 'shield_wave' });
    G.shake = Math.max(G.shake, 1.5);
    f.seen.add(e); f.last = e; f.reflect--;
    if (f.reflect <= 0) { f.back = true; return; }
    const nx = nextTarget(G, f, e);
    let dx, dy;
    if (nx) { const [tx, ty] = ec(nx); dx = tx - f.x; dy = ty - f.y; }
    else { const r = SK.rand() * Math.PI * 2; dx = Math.cos(r); dy = Math.sin(r); }
    const d = Math.hypot(dx, dy) || 1; f.dx = dx / d; f.dy = dy / d;
  }
  function returned(G, p) {
    p._sbf = null;
    setMul(p, 'moveMul', 'sb', 1); setMul(p, 'rateMul', 'sb', 1);
    p.armor = Math.min(p.armorMax, p.armor + SB.armor);
    p.energy = Math.min(p.energyMax, p.energy + SB.energy);
    SK.num(G, p.x, p.y - 30, '+' + SB.armor, '#c9d2df');
    fx(G, 'effect_health_skill', p.x, p.y - 2, { follow: p, dy: -2, layer: 'ground' });
    p.skillCd = p.h.skill.cd;
  }
  SK.on('stageEnter', () => { const p = SK.G && SK.G.player; if (p && p._sbf) { p._sbf = null; setMul(p, 'moveMul', 'sb', 1); setMul(p, 'rateMul', 'sb', 1); } });
  // Khiên đang bay (trạng thái ở p._sbf): vẽ xoay tròn theo cỡ của bậc.
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
        const k = hw.swingT > 0 ? 1 - hw.swingT / HW.swing : 1;
        const ang = p.aim + (hw.swingT > 0 ? (k * 2.4 - 1.2) : -0.7) * dir;
        SK.drawGun(ctx, 'weapons3_89', hx, hy, ang, null, { scale: HW.scale });
      }
      return;
    }
    drawPlayer1(ctx, G);
    const s = p && p._sbf;
    if (s && p.st !== 'dead') {
      ctx.save(); ctx.globalAlpha = 0.3; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(s.x, s.y + 8, 5, 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      SK.draw(ctx, 'paladin_0_skill_0_effect_0_0', s.x, s.y, { rot: s.spin, sx: s.scale, sy: s.scale });
    }
  };
})();
