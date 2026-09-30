// Kỹ năng Trang Phục Hoàng Tử (c26, C27Controller): transform_slime_king, forward_crystal_crab_king, manifest_king_violet.
// Cả ba là hoá thân: p._form giữ hình (prefab CostumePrince_skill_0/1/0_skill_2), thanh máu riêng (Vua Slime, Cua Vua) hoặc
// thanh Chiến Dũng (Tước Sĩ Tím), vũ khí riêng và một chiêu phụ. Nguồn: ctrlFields (s1Init*/s2Init*) và MonoBehaviour của
// CostumePrince_skill_*/C27Skill3ShapeShiftCtrl.config + weapon_c27_skill0/1 trong common.ab/weapon.ab [ĐO], mã ARM của
// C27Skill1/2/3ShapeShiftCtrl, C27Skill2Weapon, Bullet04 đọc bằng tools/sk_method.py [ĐO], mốc thời gian sự kiện của clip Animator
// (AnimaOnMainSkillEffect/Land...) [ĐO], wiki [WIKI]. Bấm K lần nữa để thoát hình (BtnSkillDown -> RoleSkillEnd). Chiêu phụ nằm ở nút
// đặc biệt (BtnSpecialClick -> DoMainSkill, phím L, khai báo special(G, p)): Đập Tử Vong / Phòng Thủ 0 Độ (giữ nút) / Tước Sĩ Bay Nhảy.
// Phím đổi vũ khí không làm gì trong hoá thân (CanSwitchWeapon = !skillCasting).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, DS = SK.DS, W = SK.world, U = SK.PPU, T = SK.TILE;
  const I = SK.input;
  const { fx, hit, alive, ec, inRadius, nearest, aimDir, debuff, layer, hurtMods, setMul, MB, CTRL, stopFx } = K;
  const CT = (f, d) => CTRL('costumeprince', f, d);
  const ANG = a => Math.atan2(Math.sin(a), Math.cos(a));
  const snd = (n, o) => { if (n && window.SK_AUDIO && SK_AUDIO.clips[n] && SK.sfx && SK.sfx.play) SK.sfx.play(n, o || { poly: 2, gap: 0.05, vol: 0.7 }); };
  const FOREVER = 1e6;   // hoá thân kéo dài tới khi bấm K lần nữa hoặc hết máu hình

  // ---------------------------------------------------------------- số thật
  const SLIME = {
    hp: CT('s1InitShiftHp', 20), speed: CT('s1InitShiftSpeed', 0.8), bullet: CT('s1InitMainSkillBulletDamage', 3), hitTimes: CT('s1InitPassiveSkillHitTimes', 2),
    max: CT('s1InitMaxSlimeNum', 5), boom: CT('s1InitPassiveSkillExplodeDamage', 10), slimeBoom: CT('s1InitSlimeExplodeDamage', 6),
    inv: CT('s1InitHitInvincibilityFrameDuration', 0.4), cd: CT('s1InitMainSkillCd', 1),
    // land/end [ĐO clip atk]; shock: ExplodeHammer damage 6, bán kính = CircleCollider 1 x scale gốc 2 x scale_factor 1.5 = 3 ô [ĐO bullet_hammer_c27_skill0].
    // ring [ĐO AnimaOnMainSkillEffect]: 2 x 15 viên, cách nhau 12° quanh một vòng, lệch RGRandom(-8, 8)°; Bullet04: tốc 10, mỗi 0.1 s nhân 0.8
    // tới khi <= min_speed 1, sống 5 s, hộp 0.5 x 0.5 ô. pool [ĐO Gas_Hit_Enemy BulletGas]: 1 sát thương / 0.5 s, bán kính 3, 6 s, không kèm buff.
    land: 0.9375, end: 1.25, shock: 6, shockR: 2 * 1.5 * T, poolDmg: MB('Gas_Hit_Enemy', 'BulletGas', 'damage', 1), poolT: MB('Gas_Hit_Enemy', 'BulletGas', 'duration', 6),
    ring: { n: 30, step: 12, jitter: 8, spd: 10 * U, decay: 0.8, tick: 0.1, min: 1 * U, life: 5, r: 0.25 * T },
    r: 1.1 * T,   // CircleCollider2D "collider" của CostumePrince_skill_0/1: bán kính 1.1 ô [ĐO]
    // Slime con = e_slime01 (levelobjects.ab): RoleAttribute max_hp 12, speed 3; nổ = explode_hit_enemy (CircleCollider 3 ô) [ĐO]. Slime con lao vào quái
    // rồi nổ: cách tấn công của EnemyAI04 nằm trong mã AI, chưa đọc nên "nổ khi chạm" là [ƯỚC LƯỢNG].
    slimeHp: 12, boomR: 3 * T, slimeR: 3 * T, slimeSpd: 3 * U,
    // gloves [ĐO weapon_c27_skill0]; tốc đánh nằm trong Animator của vũ khí (clip), không có trong MonoBehaviour nên rps [ƯỚC LƯỢNG]
    gloves: { dmg: 3, crit: 30, repel: 3, spd: 24 * U, rps: 1.6, n: 3, spread: 8 }
  };
  const CRAB = {
    hp: CT('s2InitShiftHp', 35), move: CT('s2InitShiftMoveSpeed', [0.8, 0.7]), hitTimes: CT('s2InitPassiveSkillHitTimes', 3), iceR: CT('s2InitPassiveSkillIceBulletRadius', 3) * T,
    boom: CT('s2InitPassiveSkillExplodeDamage', 15), inv: CT('s2InitHitInvincibilityFrameDuration', 0.2), hold: CT('s2InitMainSkillHoldDefenceDuration', 4), cd: CT('s2InitMainSkillCd', 6),
    add: CT('s2InitShiftAddHp', 4), zone: CT('s2InitCrystalZoneRadius', 3) * T, icicles: CT('s2InitCreateIcicleTimes', 3), spike: CT('s2InitCrystalSpikeDamage', 6),
    // ice/iceDmg [ĐO CostumePrince_skill_1: passiveSkillIceBulletNum 3, explode_ice_c27_skill1 damage 6]; strikeAt/End [ĐO clip atk]; boomR = CircleCollider 3 x scale 1.5
    // của c27_skill_1_ice_explode [ĐO]. Gai băng = ExplodeLcicle: hộp chạm CircleCollider 1 x scale 0.2 = 0.2 ô (nhân cỡ đạn 2 của vũ khí = 0.4) [ĐO];
    // Gai Pha Lê Chấn Động [ĐO C27Skill2ShapeShiftCtrl.AnimaOnMainSkillEffect/CreateIcicle]: số lượt = max(1, floor(thời gian giữ / 4 x s2InitCreateIcicleTimes)),
    // mỗi lượt 6 gai rơi tại điểm ngẫu nhiên trong bán kính zone, các lượt cách nhau 0.33 s (MonoBehaviour.Invoke "CreateIcicle"); vùng CrystalSpikeShock_skin_0
    // (BuffZoneCtrl buff_ice 0.5 s mỗi 1 s + bulletDestroyer xoá đạn địch) tồn tại tới hết clip atk.
    ice: 3, iceDmg: 6, boomR: 3 * 1.5 * T, strikeAt: 0.5, strikeEnd: 1.0625, wave: 0.33, waveN: 6, iceHit: 0.4 * T, zoneFreeze: 0.5, zoneEvery: 1, r: 1.1 * T,
    // claw [ĐO weapon_c27_skill1 + C27Skill2Weapon.Attack]: MỖI đòn vừa chém (sword_c27_skill1, 12, luân phiên atk_1/atk_2) vừa thả iceBulletNum 5 gai băng 6
    // tại điểm ngẫu nhiên trong bán kính 4 ô quanh điểm đánh; vùng chém = polygon của sword_c27_skill1 nhân cỡ đạn 3, ánh xạ cỡ đạn -> phạm vi của RGSword
    // chưa đọc được nên reach/half và tốc đánh (Animator) là [ƯỚC LƯỢNG]
    claw: { dmg: 12, crit: 10, repel: 3, reach: 3 * T * 0.75, half: 60, rps: 1.6, iceN: 5, iceR: 4 * T, iceDmg: 6 }
  };
  const VIO_CFG = {
      shiftCd: 10, hitInvincibilityFrameDuration: 0.6, landDamage: 13, initPunchDamage: 10, initPunchSize: 2, initBladeDamage: 8, initBladeSize: 3.5, valorBladeSize: 4, initSpearDamage: 8, initSpearSize: 3,
      swordMissileDamage: 5, swordRevolveDamage: 5, swingSwordBulletDamage: 3, swingSwordBulletCreateTimesAfterMainSkill: 3, swingSwordBulletCreateTimesInValor: 3, swingSwordBulletNum: 5,
      initMainSkillCd: 5, jazzLeapLandingDamage: 2, jazzLeapLandingRadius: 4, jazzLeapLandingEffectDuration: 2, jazzLeapLandingDizzyDuration: 2, initValorValue: 30, initValorTurnOnValue: 50,
      initMaxValorValue: 100, turnValorHpProtectTime: 2, createDamageValorConversionRate: 0.25, killedEnemyValorAdditive: 5, valorStateValorValueReducePerSecond: 12, notCreateDamageTimeLimit: 2,
      notCreateDamageValorValueReducePerSecond: 5, notValorGetDamageLimit: 5, valorStateDamageAdditive: 2, valorStateCdAdditive: 0.8, initCritic: 5, valorCriticAdditive: 20, valorAnimatorSpeed: 1.5, attackMoveSpeedAdditive: 1.2,
      getDamageValorConversionRate: 5, notAttackMoveSpeedAdditive: 0.8
    };   // [ĐO C27Skill3ShapeShiftCtrl.config trong common.ab]
  const VIO = {
    cfg: MB('CostumePrince_0_skill_2', 'C27Skill3ShapeShiftCtrl', 'config', VIO_CFG),
    takeoff: 0.1667, land: 0.8, end: 1.2167, range: 8 * T, fly: { missileT: 0.5, missileHover: 2, missileBack: 0.5, revolveR: 6 * T, revolveW: Math.PI * 2, revolveT: 0.25, revolveHover: 2.5, revolveBack: 0.25, tick: 1, r: 2 * T },
    // Bay Nhảy [ĐO AnimaOnMainSkillLand/CreateLandDamage]: landDamage = ExplodeHammer 'landDamage' (CircleCollider 1 x scale gốc 1.5 x scale_factor 1.5 = 2.25 ô,
    // + valorStateDamageAdditive khi Chiến Dũng cao); hai lưỡi kiếm ở hai tay (CreateBlade) tại chỗ đáp; vùng jazzLeapLanding = CircleDamageCarrier startDelay 0.25,
    // damageInterval 1.5, sống jazzLeapLandingEffectDuration, bán kính jazzLeapLandingRadius x (Chiến Dũng + 100) / 100 khi đang Chiến Dũng cao.
    landR: 1 * 1.5 * 1.5 * T, zoneDelay: 0.25, zoneEvery: 1.5,
    // reach = tỉ lệ ô của "size" (ánh xạ cỡ đạn -> phạm vi của RGSword chưa đọc được); rps = tốc Animator của kiếm; holdT = ngưỡng giữ nút để ném kiếm
    // do transition của Animator quyết định, không có trong mã: đều [ƯỚC LƯỢNG]
    reach: 0.8, rps: 2.2, holdT: 0.5
  };

  // ---------------------------------------------------------------- hình thể + hoá thân chung
  function defWeapon(id, def) { Object.defineProperty(DS.weapons, id, { configurable: true, writable: true, enumerable: false, value: def }); }
  const W_DEF = { kind: 'melee', cost: 0, sprite: null, repel: 3 };
  defWeapon('_cp_gloves', Object.assign({}, W_DEF, { name: 'Bao Tay Phép Thuật', kind: 'cp_gloves', dmg: SLIME.gloves.dmg, crit: SLIME.gloves.crit, rps: SLIME.gloves.rps }));
  defWeapon('_cp_claw', Object.assign({}, W_DEF, { name: 'Vuốt Cua Vua', kind: 'cp_claw', dmg: CRAB.claw.dmg, crit: CRAB.claw.crit, rps: CRAB.claw.rps, moveMod: CRAB.move[1] / CRAB.move[0] - 1 }));
  defWeapon('_cp_blade', Object.assign({}, W_DEF, { name: 'Hồn Nhẫn', kind: 'cp_blade', dmg: VIO.cfg.initBladeDamage, crit: VIO.cfg.initCritic, rps: VIO.rps }));

  const TAGS = { fire: 'fire', gas: 'poison' };
  function bodyOf(p, r) {
    const base = p._form.saved.h;
    p.h = Object.assign(Object.create(base), { body: { r }, hurt: { size: [r * 2.2, r * 2], off: [0, r] } });
  }
  function freeSpot(G, p) {
    const r = p.h.body.r;
    if (!W.boxHits(G.map, p.x - r, p.y - r, p.x + r, p.y)) return;
    for (let d = 2; d < 5 * T; d += 2) for (let a = 0; a < 16; a++) {
      const x = p.x + Math.cos(a / 16 * Math.PI * 2) * d, y = p.y + Math.sin(a / 16 * Math.PI * 2) * d;
      if (!W.boxHits(G.map, x - r, y - r, x + r, y)) { p.x = x; p.y = y; return; }
    }
  }
  function enter(G, p, kind, o) {
    layer(G);
    const f = p._form = Object.assign({ kind, t: 0, animT: 0, inv: 0, hits: 0, flash: 0, act: null, actT: 0, cdT: 0, saved: { weapons: p.weapons, cur: p.cur, h: p.h } }, o);
    p.dual = null;
    p.skillT = FOREVER;
    if (o.r) { bodyOf(p, o.r); freeSpot(G, p); }
    p.weapons = [SK.makeWeapon(o.weapon), null]; p.cur = 0;
    setMul(p, 'moveMul', 'form', o.speed || 1);
    hurtMods(p).form = formHurt;
    fx(G, 'CostumePrince_skin0_showUp_effect', p.x, p.y - 4, { dur: 0.8 });
    snd('fx_smoke_bomb_poof');
    return f;
  }
  function leave(G, p) {
    const f = p._form; if (!f) return;
    p._form = null;
    // Nhặt được vũ khí khi đang hoá thân thì giữ lại (ô 2 nếu trống, không thì rơi xuống đất).
    const got = p.weapons.filter(w => w && w.id.indexOf('_cp_') !== 0);
    p.weapons = f.saved.weapons; p.cur = f.saved.cur; p.h = f.saved.h;
    for (const w of got) { if (!p.weapons[1]) p.weapons[1] = w; else G.items.push({ id: w.id, x: p.x, y: p.y + 4, t: 0 }); }
    G.items = G.items.filter(it => it.id.indexOf('_cp_') !== 0);
    p.noFire = false;
    setMul(p, 'moveMul', 'form', 1); setMul(p, 'moveMul', 'formAct', 1); setMul(p, 'rateMul', 'valor', 1); setMul(p, 'moveMul', 'valor', 1);
    delete hurtMods(p).form;
    stopFx(f.auraH);
    fx(G, 'CostumePrince_skin0_showUp_effect', p.x, p.y - 4, { dur: 0.8 });
    snd('fx_short_fart');
  }
  // Đang làm chiêu phụ: đứng yên (SetCantMove), không bắn (DoNormalSkill bị chặn khi IsDoingSkill) -> p.noFire.
  function act(p, name) { const f = p._form; f.act = name; f.actT = 0; p.noFire = true; setMul(p, 'moveMul', 'formAct', name === 'leap' ? 1 : 0.05); }
  function actEnd(p) { const f = p._form; f.act = null; p.noFire = false; setMul(p, 'moveMul', 'formAct', 1); }
  function formHurt(G, p, dmg) {
    const f = p._form;
    if (!f) return dmg;
    if (f.kind === 'violet') return violetHurt(G, p, f, dmg);
    // [ĐO C27Skill1ShapeShiftCtrl.OnGetHurt, mã ARM] _hitCount++ chạy TRƯỚC cổng bất tử (_canHit): đòn trong khung bất tử vẫn được đếm cho nội tại.
    f.hits++;
    if (f.hits >= f.hitTimes) { f.hits = 0; (f.kind === 'slime' ? slimePassive : crabPassive)(G, p, f); }
    if (f.inv > 0 || f.act === 'leap') return 0;
    f.inv = f.invMax; f.flash = 0.12;
    if (f.act === 'hold') {
      f.hp = Math.min(f.hpMax, f.hp + CRAB.add);
      fx(G, 'hit_blue2', p.x, p.y - 12, { scale: 0.8 });
      snd('fx_rebound');
      return 0;
    }
    f.hp -= dmg;
    SK.num(G, p.x, p.y - 34, dmg, '#ff4a4a');
    snd(f.kind === 'slime' ? 'fx_boss20_atk03' : 'fx_ice_hit');
    if (f.hp <= 0) f.broken = true;
    return 0;
  }
  // ---------------------------------------------------------------- vẽ hình
  function drawForm(ctx, G, p) {
    const f = p._form, parts = SK.prefab(f.prefab), fs = p.face < 0 ? -1 : 1;
    if (!parts) return;
    const list = parts._ord || (parts._ord = parts.map((q, i) => [q, i]).sort((a, b) => ((a[0].o || 0) - (b[0].o || 0)) || (a[1] - b[1])).map(x => x[0]));
    const keys = f.keys();
    ctx.save();
    ctx.globalAlpha = f.inv > 0 && Math.floor(f.inv * 16) % 2 ? 0.55 : 1;
    if (f.lift) { ctx.save(); ctx.globalAlpha *= 0.35; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 10, 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    for (const q of list) {
      if (!q.f && !f.body || /UICanvas|ValorSlider|collider|shadow|valorEffect|\/cape/.test(q.n)) continue;
      const rel = q.n[0] === '/' ? q.n.slice(1) : '';
      if (f.hide && f.hide(q, rel)) continue;
      let name = q.f;
      if (rel === f.body) for (const k of keys) { const af = SK.animFrame(k.key, k.t); if (af) name = af; }
      if (!name) continue;
      let dx = q.at[0] * fs, dy = -q.at[1], sx = q.sc ? q.sc[0] : 1, sy = q.sc ? q.sc[1] : 1, rot = 0;
      for (const k of keys) { const xf = SK.animPose(k.key, k.t, rel); dx += xf.dx * fs; dy += xf.dy; sx *= xf.sx; sy *= xf.sy; rot += xf.rot * fs; }
      if (!sx || !sy) continue;
      SK.draw(ctx, name, p.x + dx, p.y + dy, { flip: fs < 0, sx, sy, rot });
    }
    ctx.restore();
    if (f.hpMax) formBar(ctx, p, f);
  }
  function formBar(ctx, p, f) {
    const w = 26, x = Math.round(p.x - w / 2), y = Math.round(p.y - (f.barDy || 40));
    ctx.fillStyle = '#000'; ctx.fillRect(x - 1, y - 1, w + 2, 5);
    ctx.fillStyle = '#331'; ctx.fillRect(x, y, w, 3);
    ctx.fillStyle = f.kind === 'slime' ? '#7be05a' : '#6fd3ff'; ctx.fillRect(x, y, Math.max(0, Math.round(w * f.hp / f.hpMax)), 3);
  }
  const drawPlayer1 = SK.drawPlayer;
  SK.drawPlayer = function (ctx, G) {
    const p = G.player;
    if (!p || !p._form || p.st === 'dead') return drawPlayer1(ctx, G);
    drawForm(ctx, G, p);
  };

  // ---------------------------------------------------------------- tiện ích đòn
  const KEY = (prefab, s) => prefab + '/' + s;
  function arcHit(G, p, ang, reach, halfDeg, dmg, o) {
    o = o || {};
    const cx = p.x, cy = p.y - 8, half = SK.deg(halfDeg);
    let n = 0;
    const inArc = (x, y, pad) => {
      const d = Math.hypot(x - cx, y - cy);
      return d <= reach + pad && (d < 8 || Math.abs(ANG(Math.atan2(y - cy, x - cx) - ang)) <= half);
    };
    for (const e of G.enemies) {
      if (!alive(e)) continue;
      const [x, y] = ec(e);
      if (!inArc(x, y, e.r)) continue;
      hit(G, p, e, dmg, { critChance: o.crit, ang, repel: o.repel == null ? 3 : o.repel, fx: o.hitFx || 'hit_white', tag: o.tag });
      if (o.debuff) o.debuff(e);
      n++;
    }
    for (const b of G.bullets) if (b.side === 'e' && !b.dead && inArc(b.x, b.y, 4)) { b.dead = true; fx(G, 'hit_red', b.x, b.y, { scale: 0.6 }); }
    return n;
  }
  function lineHit(G, p, ang, len, wid, dmg, o) {
    const c = Math.cos(ang), s = Math.sin(ang), cx = p.x, cy = p.y - 8;
    let n = 0;
    for (const e of G.enemies) {
      if (!alive(e)) continue;
      const [x, y] = ec(e), dx = x - cx, dy = y - cy, u = dx * c + dy * s, v = -dx * s + dy * c;
      if (u < -4 || u > len + e.r || Math.abs(v) > wid / 2 + e.r) continue;
      hit(G, p, e, dmg, { critChance: o.crit, ang, repel: 3, fx: 'hit_white', tag: o.tag });
      n++;
    }
    return n;
  }
  const aimAng = p => (Number.isFinite(p.aim) ? p.aim : p.face > 0 ? 0 : Math.PI);
  const faceTo = (p, ang) => { if (Math.abs(Math.cos(ang)) > 0.1) p.face = Math.cos(ang) > 0 ? 1 : -1; };
  // Đạn bay theo hướng, vẽ bằng hiệu ứng thật bám theo viên đạn.
  function bolt(G, p, x, y, ang, o) {
    const b = K.shoot(G, p, x, y, ang, { dmg: o.dmg, speed: o.speed / U, life: o.life || 1.6, pierce: o.pierce || 0, repel: o.repel == null ? 3 : o.repel, r: o.r || 3, critChance: o.crit, extra: Object.assign({ _cp: o.tag || 'cp' }, o.extra) });
    if (o.fx) fx(G, o.fx, x, y, { follow: b, scale: o.scale || 1, dur: (o.life || 1.6) + 0.2 });
    return b;
  }
  // Đạn cp mang nguyên tố (lửa/độc/băng...) thì trúng quái là gây hiệu ứng.
  SK.on('enemyHit', (G, e) => {
    const p = G.player;
    if (!p || p.hero !== 'costumeprince' || !p._form) return;
    const s = e.scale, hw = e.hb.size[0] * s / 2, hh = e.hb.size[1] * s / 2, cx = e.x + e.hb.off[0] * e.face * s, cy = e.y - e.hb.off[1] * s;
    const b = G.bullets.find(q => q.side === 'p' && q._elem && !q.dead && Math.abs(q.x - cx) < hw + q.r + 2 && Math.abs(q.y - cy) < hh + q.r + 2);
    if (b && !(b._elemDone && b._elemDone.has(e))) { (b._elemDone = b._elemDone || new Set()).add(e); if (SK.rand() < (b._elemP == null ? 1 : b._elemP)) debuff(G, e, b._elem); }
  });

  // ================================================================ HOÁ THÂN! VUA SLIME
  // [ĐO ctrlFields s1Init*, CostumePrince_skill_0]: 20 máu hình, chạy x0.8, bất tử 0.4 s sau mỗi đòn; cứ 2 đòn nhận thì nổ 10 sát thương và
  // sinh một Slime nhỏ (tối đa 5; Slime nổ 6); Đập Tử Vong (nút đặc biệt): nhảy lên đập (clip atk 1.3125 s, chạm đất 0.9375 s), sóng xung kích 6 (bullet_hammer_c27_skill0),
  // vòng 30 đạn 3 sát thương (bullet_c27_skill0, tốc 10 giảm dần), vũng độc 1/0.5 s trong 6 s, hồi chiêu 1 s. Vũ khí Bao Tay Phép Thuật: 3 viên/đòn, lửa/độc luân phiên, 3 sát thương.
  const SLIME_KEYS = f => {
    const P = 'CostumePrince_skill_0';
    if (f.act === 'smash') return [{ key: KEY(P, 'ShapeshiftGee_skill_1_skin_0_atk'), t: f.actT }];
    return [{ key: KEY(P, f.moving ? 'run' : 'ide'), t: f.animT }];
  };
  S.transform_slime_king = {
    start(G, p) {
      const f = enter(G, p, 'slime', { prefab: 'CostumePrince_skill_0', weapon: '_cp_gloves', speed: SLIME.speed, r: SLIME.r, hp: SLIME.hp, hpMax: SLIME.hp, invMax: SLIME.inv, hitTimes: SLIME.hitTimes, body: 'img/body', barDy: 44, keys: () => SLIME_KEYS(f) });
    },
    update(G, p, dt) { formTick(G, p, dt, slimeTick); },
    press(G, p) { SK.endSkill(G, p); },
    // Nút đặc biệt = DoMainSkill: nhảy lên đập (hồi chiêu s1InitMainSkillCd), không làm khi đang làm chiêu.
    special(G, p) {
      const f = p._form;
      if (f && f.kind === 'slime' && !f.act && f.cdT <= 0) { act(p, 'smash'); f.landed = false; }
    },
    end(G, p) { leave(G, p); }
  };
  function formTick(G, p, dt, fn) {
    const f = p._form; if (!f) return;
    f.t += dt; f.animT += dt; f.inv = Math.max(0, f.inv - dt); f.flash = Math.max(0, f.flash - dt); f.cdT = Math.max(0, f.cdT - dt);
    f.moving = p.moving;
    if (f.broken) { SK.endSkill(G, p); return; }
    fn(G, p, f, dt);
  }
  function slimeTick(G, p, f, dt) {
    if (f.act === 'smash') {
      const a = p.aim; faceTo(p, a);
      f.actT += dt;
      if (!f.landed && f.actT >= SLIME.land) { f.landed = true; smashLand(G, p); }
      if (f.actT >= SLIME.end) { actEnd(p); f.landed = false; f.cdT = SLIME.cd; }
    }
  }
  function smashLand(G, p) {
    const x = p.x, y = p.y, R = SLIME.ring;
    snd('fx_boss20_atk02');
    fx(G, 'bullet_hammer_c27_skill0', x, y - 4, { layer: 'ground' });
    G.shake = Math.max(G.shake, 4);
    for (const e of inRadius(G, x, y - 4, SLIME.shockR, SLIME.shockR * 0.8)) hit(G, p, e, SLIME.shock, { repel: 3, fx: 'hit_yellow', ang: Math.atan2(ec(e)[1] - y, ec(e)[0] - x) });
    // Vòng đạn: mặt phải đi từ -180° tăng 12°, mặt trái từ 360° giảm 12° (cả hai phủ đủ một vòng), lệch ±8° [ĐO AnimaOnMainSkillEffect].
    const face = p.face < 0 ? -1 : 1, ring = [];
    for (let k = 0; k < R.n; k++) {
      const a = SK.deg((face > 0 ? -180 + R.step * k : 360 - R.step * k) + SK.randf(-R.jitter, R.jitter));
      ring.push(bolt(G, p, x + Math.cos(a) * 8, y - 6 + Math.sin(a) * 8, a, { dmg: SLIME.bullet, speed: R.spd, life: R.life, fx: 'bullet_c27_skill0', tag: 'ring', crit: 0, r: R.r }));
    }
    // Bullet04: mỗi tick nhân speed_value nếu còn nhanh hơn min_speed.
    p._form.ring = ring;
    G.props.push({ x: 0, y: -1e9, t: 0, k: 0, draw() {},
      update(G2, q, dt) {
        q.t += dt; q.k += dt;
        while (q.k >= R.tick) { q.k -= R.tick; for (const b of ring) if (!b.dead && Math.hypot(b.vx, b.vy) > R.min) { b.vx *= R.decay; b.vy *= R.decay; } }
        if (q.t >= R.life) q.gone = true;
      } });
    // Vũng độc Gas_Hit_Enemy [ĐO BulletGas: damage 1, hit_invert 0.5, duration 6, bán kính 3; buff rỗng nên không kèm hiệu ứng].
    const r0 = MB('Gas_Hit_Enemy', 'BulletGas', 'damage_radius', 3) * U, every = MB('Gas_Hit_Enemy', 'BulletGas', 'hit_invert', 0.5);
    const h = fx(G, 'Gas_Hit_Enemy', x, y, { dur: SLIME.poolT, layer: 'ground' });
    G.props.push({ x, y: -1e9, t: 0, tick: 0, draw() {},
      update(G2, q, dt) {
        q.t += dt; q.tick -= dt;
        if (q.t >= SLIME.poolT) { stopFx(h); q.gone = true; return; }
        if (q.tick > 0) return;
        q.tick = every;
        for (const e of inRadius(G2, x, y, r0, r0 * 0.62)) hit(G2, p, e, SLIME.poolDmg, { noMul: true, crit: false, tag: 'pool' });
      } });
  }
  function slimePassive(G, p, f) {
    fx(G, 'explode_hit_enemy', p.x, p.y - 6, { scale: 1.2 });
    G.shake = Math.max(G.shake, 3);
    for (const e of inRadius(G, p.x, p.y - 6, SLIME.boomR, SLIME.boomR * 0.8)) hit(G, p, e, SLIME.boom, { repel: 3, tag: 'passive' });
    spawnSlime(G, p, p.x, p.y);
  }
  function slimeBoom(G, p, a) {
    fx(G, 'explode_hit_enemy', a.x, a.y - 4, { scale: 0.7 });
    for (const e of inRadius(G, a.x, a.y - 4, SLIME.slimeR, SLIME.slimeR * 0.8)) hit(G, p, e, SLIME.slimeBoom, { repel: 3, tag: 'slime' });
    a.gone = true;
  }
  function spawnSlime(G, p, x, y) {
    const list = K.allies(G).filter(a => a.cpSlime && !a.gone);
    if (list.length >= SLIME.max) return;
    K.addAlly(G, {
      cpSlime: true, x: x + SK.randf(-10, 10), y: y + SK.randf(0, 8), hp: SLIME.slimeHp, hpMax: SLIME.slimeHp, box: [10, 10, 6], face: 1, moving: false,
      update(G2, a, dt) {
        if (a.hp <= 0) { slimeBoom(G2, p, a); return; }
        const e = nearest(G2, a.x, a.y - 4, 20 * T);
        const tx = e ? ec(e)[0] : p.x, ty = e ? ec(e)[1] + 4 : p.y;
        const d = K.walk(G2, a, tx, ty, SLIME.slimeSpd, dt);
        a.moving = d > 6;
        if (e && Math.hypot(ec(e)[0] - a.x, ec(e)[1] - (a.y - 4)) < 8 + e.r) slimeBoom(G2, p, a);
      },
      draw(ctx, G2, a) {
        const k = SK.anim(a.moving ? 'slime01/slime01_run' : 'slime01/slime01_ide'), fr = k && SK.animFrame(a.moving ? 'slime01/slime01_run' : 'slime01/slime01_ide', a.t);
        if (fr) SK.draw(ctx, fr, a.x, a.y, { flip: a.face < 0, alpha: a.flash > 0 ? 0.6 : 1 });
        K.hpBar(ctx, a, 18, '#7be05a');
      }
    });
  }
  // Bao Tay Phép Thuật: 3 viên/đòn, lửa (bullet_52) và độc (SlimeSpitGreen) luân phiên, đòn thứ 3-4 to hơn [ĐO bulletsInfo bullet_52/212/78/213].
  SK.WEAPON_KINDS.cp_gloves = {
    fire(G, p, w, o) {
      const g = SLIME.gloves, idx = w.n = ((w.n || 0) + 1) % 4, kind = idx % 2 ? 'gas' : 'fire', big = idx >= 2;
      faceTo(p, o.ang);
      snd('fx_gun_rocket');
      for (let i = 0; i < g.n; i++) {
        const a = o.ang + SK.deg((i - (g.n - 1) / 2) * g.spread + SK.randf(-2, 2));
        const b = bolt(G, p, o.x, o.y, a, { dmg: g.dmg, speed: g.spd, crit: g.crit, life: 1.1, fx: kind === 'fire' ? 'Fire' : 'SlimeSpitGreen', scale: big ? 0.9 : 0.6, r: big ? 4 : 3, tag: 'gloves' });
        b._elem = TAGS[kind]; b._elemP = 0.5;
      }
    }
  };

  // ================================================================ TIẾN CÔNG! CUA VUA PHA LÊ
  // [ĐO ctrlFields s2Init*, CostumePrince_skill_1, weapon_c27_skill1]: 35 máu hình, chạy x0.8 (x0.7 khi đánh), bất tử 0.2 s sau đòn; cứ 3 đòn nhận thì nổ băng 15
  // + 3 gai băng 6 rải ngẫu nhiên quanh 3 ô; Phòng Thủ 0 Độ (giữ nút đặc biệt): tối đa 4 s, không mất máu, mỗi đòn nhận hồi 4 máu hình; nhả ra thì
  // Gai Pha Lê Chấn Động (clip atk: hiệu ứng 0.5 s, xong 1.0625 s): số lượt gai tính theo THỜI GIAN GIỮ (không phải số đòn đã đỡ) [ĐO AnimaOnMainSkillEffect]; hồi chiêu 6 s.
  const CRAB_KEYS = f => {
    const P = 'CostumePrince_skill_1';
    if (f.act === 'hold') return [{ key: KEY(P, 'hold'), t: f.actT }];
    if (f.act === 'strike') return [{ key: KEY(P, 'atk'), t: f.actT }];
    return [{ key: KEY(P, f.moving ? 'run' : 'ide'), t: f.animT }];
  };
  S.forward_crystal_crab_king = {
    start(G, p) {
      const f = enter(G, p, 'crab', { prefab: 'CostumePrince_skill_1', weapon: '_cp_claw', speed: CRAB.move[0], r: CRAB.r, hp: CRAB.hp, hpMax: CRAB.hp, invMax: CRAB.inv, hitTimes: CRAB.hitTimes, body: 'img/body', barDy: 42, hide: (q, rel) => f.act === 'hold' && /^img\/f[1-4]$/.test(rel), keys: () => CRAB_KEYS(f) });
    },
    update(G, p, dt) { formTick(G, p, dt, crabTick); },
    press(G, p) { SK.endSkill(G, p); },
    // Nút đặc biệt: bấm xuống = vào thế thủ, nhả ra = tung Gai Pha Lê (BtnSpecialClick(isDown) -> DoMainSkill hai lần).
    special(G, p) {
      const f = p._form;
      if (f && f.kind === 'crab' && !f.act && f.cdT <= 0) { act(p, 'hold'); snd('fx_shotgun'); }
    },
    end(G, p) { leave(G, p); }
  };
  function crabTick(G, p, f, dt) {
    if (f.act === 'hold') {
      f.actT += dt;
      // Nhả nút (hoặc hết s2InitMainSkillHoldDefenceDuration) thì đọc thời gian giữ: _holdTime = Timer.GetTimeElapsed [ĐO DoMainSkill/MainSkillHoldEnd].
      if (!I.down('special') && f.actT > 0.05 || f.actT >= CRAB.hold) {
        f.holdT = Math.min(f.actT, CRAB.hold);
        act(p, 'strike');
        f.total = Math.max(1, Math.floor(f.holdT / CRAB.hold * CRAB.icicles)); f.waves = 0; f.wave = 0; f.zone = null;
      }
    } else if (f.act === 'strike') {
      f.actT += dt;
      if (f.actT >= CRAB.strikeAt) {
        if (!f.zone) f.zone = { t: 0, tick: 0, h: fx(G, 'CrystalSpikeShock_skin_0', p.x, p.y - 2, { layer: 'ground', scale: CRAB.zone / (3 * T), dur: CRAB.strikeEnd - CRAB.strikeAt + 0.1 }) };
        if (f.actT < CRAB.strikeEnd) zoneTick(G, p, f.zone, dt);
        f.wave -= dt;
        if (f.waves < f.total && f.wave <= 0) { f.wave = CRAB.wave; f.waves++; icicleWave(G, p); }
      }
      if (f.actT >= CRAB.strikeEnd && f.waves >= f.total) { actEnd(p); f.cdT = CRAB.cd; f.zone = null; }
    }
  }
  // CrystalSpikeShock_skin_0: BuffZoneCtrl buff_ice mỗi hitInvert 1 s, bulletDestroyer xoá đạn địch trong vùng [ĐO].
  function zoneTick(G, p, z, dt) {
    z.t += dt; z.tick -= dt;
    if (z.tick <= 0) {
      z.tick = CRAB.zoneEvery;
      for (const e of inRadius(G, p.x, p.y - 2, CRAB.zone, CRAB.zone * 0.8)) debuff(G, e, 'ice', { t: CRAB.zoneFreeze });
    }
    for (const b of G.bullets) if (b.side === 'e' && !b.dead && Math.hypot(b.x - p.x, (b.y - p.y) * 1.25) < CRAB.zone) b.dead = true;
  }
  // Một lượt = 6 gai tại điểm ngẫu nhiên trong bán kính zone quanh người [ĐO C27Skill2ShapeShiftCtrl.CreateIcicle].
  function icicleWave(G, p) {
    snd('fx_ice_shock');
    G.shake = Math.max(G.shake, 2);
    for (let i = 0; i < CRAB.waveN; i++) iceAround(G, p, p.x, p.y - 2, CRAB.zone, CRAB.spike);
  }
  // Gai băng rơi ở một điểm ngẫu nhiên trong đĩa bán kính r; ghi nhật ký cho ca kiểm (p._cpIce).
  function iceAround(G, p, cx, cy, r, dmg) {
    const a = SK.rand() * Math.PI * 2, d = Math.sqrt(SK.rand()) * r;
    iceSpike(G, p, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, dmg);
  }
  function iceSpike(G, p, x, y, dmg) {
    (p._cpIce = p._cpIce || []).push([x, y, dmg]);
    fx(G, 'explode_ice_c27_skill1', x, y - 2, { scale: 0.8 });
    // targetbuff buff_ice: xác suất đóng băng của ExplodeLcicle chưa đọc từ mã [ƯỚC LƯỢNG: luôn đóng băng]
    for (const e of inRadius(G, x, y - 2, CRAB.iceHit)) { hit(G, p, e, dmg, { repel: 3, tag: 'ice' }); debuff(G, e, 'ice'); }
  }
  function crabPassive(G, p, f) {
    fx(G, 'c27_skill_1_ice_explode', p.x, p.y - 4, { scale: 1.2 });
    G.shake = Math.max(G.shake, 3);
    for (const e of inRadius(G, p.x, p.y - 4, CRAB.boomR, CRAB.boomR * 0.8)) { hit(G, p, e, CRAB.boom, { repel: 3, tag: 'passive' }); if (SK.rand() < 0.5) debuff(G, e, 'ice'); }
    for (let i = 0; i < CRAB.ice; i++) iceAround(G, p, p.x, p.y - 4, CRAB.iceR, CRAB.iceDmg);   // RGRandom.RandomInCircle(radius) [ĐO DoPassiveSkill]
  }
  // Vuốt Cua Vua: hai móng luân phiên 12 sát thương; MỖI đòn thả thêm 5 gai băng 6 trong bán kính 4 ô quanh điểm đánh [ĐO C27Skill2Weapon.Attack:
  // AttackSwordBullet + AttackIceBullet; bulletsInfo sword x2 + explode_ice x2, iceBulletNum 5, iceBulletRadius 4].
  SK.WEAPON_KINDS.cp_claw = {
    fire(G, p, w, o) {
      const c = CRAB.claw, n = w.n = (w.n || 0) + 1, left = n % 2 === 0;
      faceTo(p, o.ang);
      snd('fx_sword1');
      arcHit(G, p, o.ang, c.reach, c.half, c.dmg, { crit: c.crit, tag: 'claw' });
      fx(G, 'sword_purple_c27', p.x + Math.cos(o.ang) * 14, p.y - 8 + Math.sin(o.ang) * 10, { ang: Math.cos(o.ang) < 0 ? o.ang + Math.PI : o.ang, flip: left !== (Math.cos(o.ang) < 0), dur: 0.3, scale: 0.9, tint: [0.6, 0.9, 1, 1] });
      for (let i = 0; i < c.iceN; i++) iceAround(G, p, o.x, o.y, c.iceR, c.iceDmg);
    }
  };

  // ================================================================ GIÁNG LÂM! TƯỚC SĨ TÍM
  // [ĐO C27Skill3ShapeShiftCtrl.config, clip L1.skill]: không có máu hình (dùng máu người chơi). Chiến Dũng 30 → cao nhất 100; ≥ 50 bật trạng thái Chiến Dũng
  // (bảo vệ máu 2 s), giảm 12/giây; ngoài trạng thái, 2 s không gây sát thương thì giảm 5/giây; gây sát thương +0.25 x sát thương, hạ quái +5. Chiến Dũng thấp:
  // đòn nhận tối đa 5 [ĐO notValorGetDamageLimit], mỗi đòn nhận cộng ceil(sát thương x 5) Chiến Dũng [ĐO getDamageValorConversionRate]. Chiến Dũng cao: tốc đánh x1.5,
  // +2 sát thương, +20 chí mạng, hồi chiêu x0.8, chưởng thép 10 khi hai kiếm đang bay. Tốc chạy x1.2 trong 2 s sau khi gây sát thương, không thì x0.8 (độc lập
  // Chiến Dũng) [ĐO set_IsSpeedUp]. Đòn thường: kiếm 8 (size 3.5) hai nhát rồi mũi thương 8 (size 3); Tước Sĩ Bay Nhảy (nút đặc biệt): bật lên (nhấc 0.1667 s,
  // chạm đất 0.8 s, xong 1.2167 s), hạ cánh 13 (+2 khi Chiến Dũng cao) sát thương trong 2.25 ô + hai nhát kiếm ở hai tay, vùng 2 mỗi 1.5 s (trễ 0.25 s) + choáng 2 s trong
  // 2 s, bán kính 4 ô (x(Chiến Dũng + 100)/100 khi Chiến Dũng cao), 3 lượt mưa 5 kiếm 3 sát thương; giữ nút đánh lúc Chiến Dũng cao thì ném hai kiếm bay
  // (missile 5: bay 0.5 s, treo 2 s, về 0.5 s; revolve 5: xoay quanh 6 ô, 2.5 s).
  const V_KEY = f => {
    const P = 'CostumePrince_0_skill_2', out = [{ key: KEY(P, (f.on ? 'idle2' : 'idle1').replace(/idle/, f.moving ? 'run' : 'idle')), t: f.animT }];
    if (f.act === 'leap') out.push({ key: KEY(P, 'L1.skill'), t: f.actT });
    else if (f.atkT > 0) out.push({ key: KEY(P, f.atkKey), t: f.atkAge });
    return out;
  };
  S.manifest_king_violet = {
    start(G, p) {
      const c = VIO.cfg;
      const f = enter(G, p, 'violet', { prefab: 'CostumePrince_0_skill_2', weapon: '_cp_blade', valor: c.initValorValue, on: false, protect: 0, swings: 0, combo: 0, atkT: 0, atkAge: 0, atkKey: 'L1.atk1', lastDmgT: G.t, lastHitT: -1e9, swords: null, holdT: 0, body: 'img/body', keys: () => V_KEY(f) });
      setMul(p, 'moveMul', 'valor', c.notAttackMoveSpeedAdditive);
      G.props.push({ x: p.x, y: 1e9, t: 0, update(G2, q) { if (p._form !== f) q.gone = true; }, draw(ctx) { if (p._form === f) valorBar(ctx, p, f); } });
    },
    update(G, p, dt) { formTick(G, p, dt, violetTick); },
    press(G, p) { SK.endSkill(G, p); },
    // Nút đặc biệt = DoMainSkill (Tước Sĩ Bay Nhảy).
    special(G, p) {
      const f = p._form;
      if (f && f.kind === 'violet' && !f.act && f.cdT <= 0) startLeap(G, p, f);
    },
    end(G, p) { const f = p._form; if (f && f.swords) f.swords.gone = true; leave(G, p); }
  };
  // OnGetDamage: sát thương nhận vào bị chặn ở notValorGetDamageLimit khi chưa Chiến Dũng, rồi cộng ceil(sát thương x getDamageValorConversionRate) Chiến Dũng.
  function violetHurt(G, p, f, dmg) {
    const c = VIO.cfg;
    if (f.act === 'leap') return 0;
    if (f.protect > 0) dmg = Math.min(dmg, Math.max(0, p.hp + p.armor - 1));
    if (!f.on) dmg = Math.min(dmg, c.notValorGetDamageLimit);
    if (dmg > 0) f.valor = Math.min(c.initMaxValorValue, f.valor + Math.ceil(dmg * c.getDamageValorConversionRate));
    return dmg;
  }
  function violetTick(G, p, f, dt) {
    const c = VIO.cfg;
    f.protect = Math.max(0, f.protect - dt);
    if (f.atkT > 0) { f.atkT -= dt; f.atkAge += dt; }
    // Chiến Dũng
    if (f.on) f.valor -= c.valorStateValorValueReducePerSecond * dt;
    else if (G.t - f.lastDmgT > c.notCreateDamageTimeLimit) f.valor -= c.notCreateDamageValorValueReducePerSecond * dt;
    f.valor = Math.max(0, Math.min(c.initMaxValorValue, f.valor));
    if (!f.on && f.valor >= c.initValorTurnOnValue) turnValor(G, p, f, true);
    else if (f.on && f.valor <= 0) turnValor(G, p, f, false);
    // Đòn chính (kiếm/thương/chưởng) đọc số từ đây.
    const d = p.weapons[0].def;
    d.dmg = c.initBladeDamage + (f.on ? c.valorStateDamageAdditive : 0); d.crit = c.initCritic + (f.on ? c.valorCriticAdditive : 0);
    // Tốc chạy: x1.2 khi vừa gây sát thương (trong notCreateDamageTimeLimit), không thì x0.8; không phụ thuộc Chiến Dũng [ĐO set_IsSpeedUp].
    setMul(p, 'moveMul', 'valor', G.t - f.lastHitT <= c.notCreateDamageTimeLimit ? c.attackMoveSpeedAdditive : c.notAttackMoveSpeedAdditive);
    // Bay Nhảy
    if (f.act === 'leap') leapTick(G, p, f, dt);
    // Ném kiếm: giữ nút đánh khi Chiến Dũng cao.
    if (f.on && !f.swords && !f.act && I.down('attack')) {
      f.holdT += dt;
      if (f.holdT >= VIO.holdT) { f.holdT = 0; throwSwords(G, p, f); }
    } else if (!I.down('attack')) f.holdT = 0;
  }
  function turnValor(G, p, f, on) {
    const c = VIO.cfg;
    f.on = on;
    setMul(p, 'rateMul', 'valor', on ? c.valorAnimatorSpeed : 1);
    if (on) {
      f.protect = c.turnValorHpProtectTime; f.swings = c.swingSwordBulletCreateTimesInValor;
      f.auraH = fx(G, 'c27_s3_skin0_valorEffect', p.x, p.y - 8, { follow: p, dy: -8, dur: 3600 });
    } else { stopFx(f.auraH); f.auraH = null; }
  }
  function valorBar(ctx, p, f) {
    const c = VIO.cfg, w = 30, x = Math.round(p.x - w / 2), y = Math.round(p.y - 34);
    ctx.fillStyle = '#000'; ctx.fillRect(x - 1, y - 1, w + 2, 4);
    ctx.fillStyle = f.on ? '#ffd24a' : '#a06bff'; ctx.fillRect(x, y, Math.round(w * f.valor / c.initMaxValorValue), 2);
    ctx.fillStyle = '#fff'; ctx.fillRect(x + Math.round(w * c.initValorTurnOnValue / c.initMaxValorValue), y - 1, 1, 4);
  }
  SK.on('enemyHit', (G, e, dmg) => {
    const p = G.player, f = p && p._form;
    if (!f || f.kind !== 'violet') return;
    f.valor = Math.min(VIO.cfg.initMaxValorValue, f.valor + Math.ceil(dmg * VIO.cfg.createDamageValorConversionRate)); f.lastDmgT = f.lastHitT = G.t;   // OnCreateDamage: ceilf
  });
  SK.on('enemyKill', G => {
    const p = G.player, f = p && p._form;
    if (f && f.kind === 'violet') f.valor = Math.min(VIO.cfg.initMaxValorValue, f.valor + VIO.cfg.killedEnemyValorAdditive);
  });
  // Tước Sĩ Bay Nhảy
  function startLeap(G, p, f) {
    const { e } = K.targetAng(G, p, VIO.range), ang = e ? Math.atan2(ec(e)[1] - p.y, ec(e)[0] - p.x) : aimDir(p);
    const dist = e ? Math.max(0, Math.min(VIO.range, Math.hypot(ec(e)[0] - p.x, ec(e)[1] - p.y) - 12)) : 5 * T;
    f.leap = { x0: p.x, y0: p.y, ang, dist };
    faceTo(p, ang);
    act(p, 'leap'); f.landed = false;
    snd('fx_jump');
  }
  function leapTick(G, p, f, dt) {
    const L = f.leap, u = Math.max(0, Math.min(1, (f.actT - VIO.takeoff) / (VIO.land - VIO.takeoff)));
    f.actT += dt;
    if (f.actT < VIO.land) {
      const x = L.x0 + Math.cos(L.ang) * L.dist * u, y = L.y0 + Math.sin(L.ang) * L.dist * u, r = p.h.body.r;
      if (!W.boxHits(G.map, x - r, y - r, x, y)) { p.x = x; p.y = y; }
      f.lift = SK.animPose(KEY('CostumePrince_0_skill_2', 'L1.skill'), f.actT, 'img').dy * -1;
    } else if (!f.landed) { f.landed = true; f.lift = 0; leapLand(G, p, f); }
    if (f.actT >= VIO.end) { actEnd(p); f.cdT = VIO.cfg.initMainSkillCd * (f.on ? VIO.cfg.valorStateCdAdditive : 1); f.lift = 0; }
  }
  function leapLand(G, p, f) {
    const c = VIO.cfg, R = c.jazzLeapLandingRadius * T * (f.on ? (f.valor + 100) / 100 : 1), x = p.x, y = p.y, bonus = f.on ? c.valorStateDamageAdditive : 0;
    fx(G, 'jazzLeapLanding', x, y - 2, { layer: 'ground', dur: c.jazzLeapLandingEffectDuration });
    G.shake = Math.max(G.shake, 4);
    // ExplodeHammer landDamage: GetFinalDamage(landDamage) = landDamage (+2 khi Chiến Dũng cao), targetbuff buff_ele
    for (const e of inRadius(G, x, y - 2, VIO.landR, VIO.landR * 0.8)) { hit(G, p, e, c.landDamage + bonus, { repel: 4, fx: 'hit_purple', tag: 'leap', ang: Math.atan2(ec(e)[1] - y, ec(e)[0] - x) }); debuff(G, e, 'ele'); }
    // Hai lưỡi kiếm ở hai tay theo hướng nhìn (AnimaOnCreateBladeL/R tương đương CreateBlade x2) [ĐO AnimaOnMainSkillLand].
    const crit = c.initCritic + (f.on ? c.valorCriticAdditive : 0), size = f.on ? c.valorBladeSize : c.initBladeSize;
    for (let i = 0; i < 2; i++) arcHit(G, p, aimAng(p), size * T * VIO.reach, 65, c.initBladeDamage + bonus, { crit, tag: 'blade', hitFx: 'hit_purple' });
    f.swings = c.swingSwordBulletCreateTimesAfterMainSkill;
    const z = { t: 0, tick: VIO.zoneDelay };
    G.props.push({ x, y: -1e9, draw() {},
      update(G2, q, dt) {
        q.t += dt; z.tick -= dt;
        if (q.t >= c.jazzLeapLandingEffectDuration) { q.gone = true; return; }
        if (z.tick > 0) return;
        z.tick += VIO.zoneEvery;
        for (const e of inRadius(G2, x, y - 2, R, R * 0.8)) { hit(G2, p, e, c.jazzLeapLandingDamage, { noMul: true, crit: false, tag: 'zone' }); debuff(G2, e, 'dizzy', { t: c.jazzLeapLandingDizzyDuration }); }
      } });
  }
  // Hai kiếm bay: missile (bay tới mục tiêu, treo, về) và revolve (xoay quanh người) [ĐO b_c27_sword_missile / b_c27_sword_revolve].
  function throwSwords(G, p, f) {
    const F = VIO.fly, c = VIO.cfg;
    const e = nearest(G, p.x, p.y, 20 * T, { los: true }), tgt = e ? [ec(e)[0], ec(e)[1]] : [p.x + Math.cos(p.aim) * 6 * T, p.y - 8 + Math.sin(p.aim) * 6 * T];
    const sw = f.swords = { t: 0, gone: false, m: { x: p.x, y: p.y - 8 }, r: { x: p.x, y: p.y - 8, a: p.aim }, hit: new Map() };
    sw.mh = fx(G, 'b_c27_sword_missile', sw.m.x, sw.m.y, { follow: sw.m, dur: 60 });
    sw.rh = fx(G, 'b_c27_sword_revolve', sw.r.x, sw.r.y, { follow: sw.r, dur: 60 });
    snd('sword_costume');
    G.props.push({ x: 0, y: 1e9, draw() {},
      update(G2, q, dt) {
        sw.t += dt;
        const t = sw.t, tm = F.missileT + F.missileHover + F.missileBack, tr = F.revolveT + F.revolveHover + F.revolveBack;
        const cx = p.x, cy = p.y - 8;
        // missile
        if (t < F.missileT) { const u = t / F.missileT; sw.m.x = cx + (tgt[0] - cx) * u; sw.m.y = cy + (tgt[1] - cy) * u; }
        else if (t < F.missileT + F.missileHover) { sw.m.x = tgt[0]; sw.m.y = tgt[1]; }
        else if (t < tm) { const u = (t - F.missileT - F.missileHover) / F.missileBack; sw.m.x = tgt[0] + (cx - tgt[0]) * u; sw.m.y = tgt[1] + (cy - tgt[1]) * u; }
        // revolve
        sw.r.a += F.revolveW * dt;
        const k = t < F.revolveT ? t / F.revolveT : t < F.revolveT + F.revolveHover ? 1 : Math.max(0, 1 - (t - F.revolveT - F.revolveHover) / F.revolveBack);
        sw.r.x = cx + Math.cos(sw.r.a) * F.revolveR * k; sw.r.y = cy + Math.sin(sw.r.a) * F.revolveR * k * 0.75;
        for (const [s, live, dmg] of [[sw.m, t >= F.missileT * 0.5 && t < tm, c.swordMissileDamage], [sw.r, t < tr, c.swordRevolveDamage]]) {
          if (!live) continue;
          for (const en of inRadius(G2, s.x, s.y, F.r)) {
            if ((sw.hit.get(en) || 0) > t) continue;
            sw.hit.set(en, t + F.tick);
            hit(G2, p, en, dmg, { repel: 2, fx: 'hit_purple', tag: 'sword', critChance: c.initCritic + (f.on ? c.valorCriticAdditive : 0) });
          }
        }
        if (t >= Math.max(tm, tr) || p._form !== f || sw.gone) { stopFx(sw.mh); stopFx(sw.rh); f.swords = null; q.gone = true; }
      } });
  }
  // Kiếm (8) hai nhát rồi thương (8); chưởng thép 10 khi hai kiếm đang bay; đòn thường có màn kiếm khi còn lượt [ĐO config].
  SK.WEAPON_KINDS.cp_blade = {
    fire(G, p, w, o) {
      const f = p._form, c = VIO.cfg, ang = o.ang, on = f.on, crit = c.initCritic + (on ? c.valorCriticAdditive : 0), bonus = on ? c.valorStateDamageAdditive : 0;
      faceTo(p, ang);
      f.atkT = 0.75; f.atkAge = 0;
      const dir = [Math.cos(ang), Math.sin(ang)];
      if (f.swords) {
        f.atkKey = 'L1.atk_punch';
        arcHit(G, p, ang, c.initPunchSize * T, 50, c.initPunchDamage + bonus, { crit, tag: 'punch', hitFx: 'hit_white' });
        fx(G, 'b_c27_punch', p.x + dir[0] * 12, p.y - 8 + dir[1] * 8, { ang, dur: 0.3 });
        snd('fx_punch');
      } else {
        const n = f.combo++ % 3;
        if (n < 2) {
          f.atkKey = 'L1.atk1';
          const size = on ? c.valorBladeSize : c.initBladeSize;
          arcHit(G, p, ang, size * T * VIO.reach, 65, c.initBladeDamage + bonus, { crit, tag: 'blade', hitFx: 'hit_purple' });
          fx(G, 'sword_purple_c27', p.x + dir[0] * 12, p.y - 8 + dir[1] * 8, { ang: Math.cos(ang) < 0 ? ang + Math.PI : ang, flip: (n === 1) !== (Math.cos(ang) < 0), dur: 0.3, scale: size / 3.5 });
          snd('fx_sword1');
        } else {
          f.atkKey = 'L1.atk2';
          lineHit(G, p, ang, c.initSpearSize * T * VIO.reach * 1.3, 14, c.initSpearDamage + bonus, { crit, tag: 'spear' });
          fx(G, 'spear_purple_c27', p.x + dir[0] * 12, p.y - 8 + dir[1] * 8, { ang, dur: 0.3, scale: c.initSpearSize / 3 });
          snd('fx_sword1');
        }
      }
      if (f.swings > 0) {
        f.swings--;
        const nb = c.swingSwordBulletNum;
        for (let i = 0; i < nb; i++) bolt(G, p, o.x, o.y - 4, ang + SK.deg((i - (nb - 1) / 2) * 12), { dmg: c.swingSwordBulletDamage, speed: 14 * U, life: 1, fx: 'b_c27_swing', crit: crit, tag: 'swing', pierce: 0, scale: 0.8 });
      }
    }
  };
})();
