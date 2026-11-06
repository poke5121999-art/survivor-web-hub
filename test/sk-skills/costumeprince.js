// Ca kiểm Trang Phục Hoàng Tử (c26): transform_slime_king (ô 0), forward_crystal_crab_king (ô 1), manifest_king_violet (ô 2).
// Số thật: ctrlFields của data/sk-skills86.js (s1Init*/s2Init*) và config của C27Skill3ShapeShiftCtrl / weapon_c27_skill0/1 (common.ab, weapon.ab);
// hằng đọc từ mã ARM (sk_method.py) ghi ngay ở từng ca. Chiêu phụ đi bằng nút đặc biệt KeyL; phím đổi vũ khí KeyQ không được kích hoạt gì.
module.exports = h => {
  const state = p => p.evaluate(() => {
    const G = SK.G, pl = G.player, f = pl._form;
    return {
      kind: f && f.kind, hp: f && f.hp, hpMax: f && f.hpMax, act: f && f.act, cdT: f && f.cdT, hits: f && f.hits, stack: f && f.stack, valor: f && f.valor, on: f && f.on, swings: f && f.swings, swords: !!(f && f.swords),
      weapon: pl.weapons[pl.cur] && pl.weapons[pl.cur].id, skillT: pl.skillT, skillCd: pl.skillCd, move: pl.moveMul || 1, rate: pl.rateMul || 1, php: pl.hp, parm: pl.armor, r: pl.h.body.r,
      slimes: (G._allies || []).filter(a => a.cpSlime && !a.gone).length, slimeHp: ((G._allies || []).find(a => a.cpSlime && !a.gone) || {}).hp, noFire: pl.noFire, ice: (pl._cpIce || []).slice(), zone: !!(f && f.zone), total: f && f.total, holdT: f && f.holdT, ring: G.bullets.filter(b => b._cp === 'ring').length, swing: G.bullets.filter(b => b._cp === 'swing').length
    };
  });
  const hurt = (p, d) => p.evaluate(d => { const G = SK.G, pl = G.player; pl.god = false; return SK.hurtPlayer(G, d); }, d);
  return {
    async 'costumeprince/0'(p) {
      const r = await h.real(p, 'costumeprince', 'transform_slime_king');
      const cf = await p.evaluate(() => SK_SKILLS86.heroes.costumeprince.ctrlFields);
      await p.evaluate(() => { for (const e of SK.G.enemies) e.hp = e.hpMax = 900; });
      await h.standNear(p, 24);
      const a = await state(p);
      await h.pressK(p); await h.sleep(150);
      const s = await state(p);
      await h.seq(p, 'costumeprince_0a', 6, 60);
      // Trúng đòn: máu hình trừ, máu người giữ nguyên, bất tử 0.4 s; đòn thứ hai nổ 10 + sinh Slime.
      // Phím đổi vũ khí không kích hoạt chiêu phụ.
      await p.keyboard.down('KeyQ'); await h.sleep(60); await p.keyboard.up('KeyQ'); await h.sleep(60);
      const qKey = await state(p);
      await h.resetDmg(p);
      const h1 = await hurt(p, 3), h1b = await hurt(p, 3), m1 = await state(p);
      await h.sleep(cf.s1InitHitInvincibilityFrameDuration * 1000 + 250);
      const h2 = await hurt(p, 2), m2 = await state(p);
      await h.sleep(200);
      const b = await h.snap(p);
      // Đập Tử Vong: nút đặc biệt (KeyL).
      await h.resetDmg(p);
      await p.keyboard.down('KeyL'); await h.sleep(60); await p.keyboard.up('KeyL');
      await h.sleep(300);
      const air = await state(p);
      const seqP = h.seq(p, 'costumeprince_0b', 6, 130);
      await h.until(p, () => SK.G.bullets.some(b => b._cp === 'ring'), null, 3000);
      const d = await state(p);
      const spd = await p.evaluate(() => { const r = SK.G.bullets.filter(b => b._cp === 'ring'); return { v0: Math.max(...r.map(b => Math.hypot(b.vx, b.vy))), n: SK.G.player._form.ring.length }; });
      await seqP;
      await h.sleep(300);
      const e = await h.snap(p);
      const decayed = await p.evaluate(() => { const r = SK.G.bullets.filter(b => b._cp === 'ring' && !b.dead); return r.length ? Math.max(...r.map(b => Math.hypot(b.vx, b.vy))) : null; });
      await h.sleep(1200);
      const pool = h.hitsOf(await h.snap(p), 'pool');
      // Bao Tay: 3 viên/đòn.
      await p.evaluate(() => { const G = SK.G; G.bullets.length = 0; });
      await p.keyboard.down('KeyJ');
      const gl = await p.evaluate(async () => { let best = []; for (let i = 0; i < 25; i++) { const c = SK.G.bullets.filter(b => b._cp === 'gloves').map(b => b.dmg); if (c.length > best.length) best = c; await new Promise(r => setTimeout(r, 20)); } return best; });
      await p.keyboard.up('KeyJ');
      // Thoát hình.
      await h.pressK(p); await h.sleep(200);
      const x = await state(p);
      h.check('costumeprince slime: hoá Vua Slime ' + cf.s1InitShiftHp + ' máu hình [ĐO s1InitShiftHp], chạy x' + cf.s1InitShiftSpeed + ' [ĐO s1InitShiftSpeed], thân CircleCollider 1.1 ô [ĐO], Bao Tay', s.kind === 'slime' && s.hp === cf.s1InitShiftHp && Math.abs(s.move - cf.s1InitShiftSpeed) < 1e-6 && s.weapon === '_cp_gloves' && a.cdT == null && Math.abs(s.r - 1.1 * 16) < 1e-6, JSON.stringify({ kind: s.kind, hp: s.hp, move: s.move, w: s.weapon, r: s.r }));
      h.check('costumeprince slime: đòn nhận trừ máu hình không trừ máu người, bất tử ' + cf.s1InitHitInvincibilityFrameDuration + ' s [ĐO]', h1 === false && h1b === false && m1.hp === cf.s1InitShiftHp - 3 && m1.php === s.php && m1.parm === s.parm, JSON.stringify({ h1, h1b, hình: m1.hp, php: m1.php }));
      h.check('costumeprince slime: đòn thứ ' + cf.s1InitPassiveSkillHitTimes + ' (đếm cả đòn trong khung bất tử [ĐO mã OnGetHurt]) nổ ' + cf.s1InitPassiveSkillExplodeDamage + ' [ĐO] và sinh Slime nhỏ', m1.hits === 0 && m2.hits === 1 && h.hitsOf(b, 'passive').length > 0 && h.hitsOf(b, 'passive').every(v => v === cf.s1InitPassiveSkillExplodeDamage) && m1.slimes === 1 && m1.slimeHp === 12, 'nổ ' + h.hitsOf(b, 'passive').join(',') + ' · Slime ' + m1.slimes + ' hp ' + m1.slimeHp + ' (12 = max_hp e_slime01 [ĐO]) · đếm ' + m1.hits + '/' + m2.hits);
      h.check('costumeprince slime: phím đổi vũ khí (KeyQ) không làm gì, nút đặc biệt (KeyL) mới đập; đang đập thì khoá đánh (noFire)', qKey.act == null && air.act === 'smash' && air.noFire === true, JSON.stringify({ q: qKey.act, l: air.act, noFire: air.noFire }));
      h.check('costumeprince slime: Đập Tử Vong nhảy lên rồi đập xuống (clip 1.3125 s), sóng 6 [ĐO ExplodeHammer damage]', air.act === 'smash' && h.hitsOf(e, 'skill').length > 0 && h.hitsOf(e, 'skill').every(v => v === 6 || v === 12), JSON.stringify({ air: air.act, sóng: h.hitsOf(e, 'skill').join(',') }));
      h.check('costumeprince slime: vòng đạn 30 viên (2 x 15) [ĐO AnimaOnMainSkillEffect], tốc 10 ô/s rồi giảm x0.8 mỗi 0.1 s tới min_speed 1 [ĐO Bullet04]', spd.n === 30 && d.ring >= 25 && spd.v0 <= 10 * 16 + 1e-6 && spd.v0 > 8 * 16 && (decayed == null || decayed < 10 * 16 * 0.5), JSON.stringify({ đạn: spd.n, còn: d.ring, v0: spd.v0, sau: decayed }));
      h.check('costumeprince slime: vũng độc 1 sát thương/0.5 s, 6 s [ĐO Gas_Hit_Enemy BulletGas damage/hit_invert/duration]', pool.length > 0 && pool.every(v => v === 1), 'nhịp ' + pool.slice(0, 6).join(','));
      h.check('costumeprince slime: Bao Tay bắn 3 viên/đòn, 3 sát thương [ĐO weapon_c27_skill0]', gl.length > 0 && gl.length % 3 === 0 && gl.every(v => v === 3 || v === 6), 'viên ' + gl.join(','));
      h.check('costumeprince slime: bấm K lần nữa thì thoát hình, trả vũ khí, hồi chiêu ' + r.cd + ' s [ĐO]', x.kind == null && x.weapon !== '_cp_gloves' && x.move === 1 && Math.abs(x.skillCd - r.cd) < 0.6, JSON.stringify({ w: x.weapon, move: x.move, cd: x.skillCd }));
    },
    async 'costumeprince/1'(p) {
      const r = await h.real(p, 'costumeprince', 'forward_crystal_crab_king');
      const cf = await p.evaluate(() => SK_SKILLS86.heroes.costumeprince.ctrlFields);
      await p.evaluate(() => { for (const e of SK.G.enemies) e.hp = e.hpMax = 900; });
      await h.standNear(p, 30);
      await h.pressK(p); await h.sleep(150);
      const s = await state(p);
      await h.seq(p, 'costumeprince_1a', 6, 60);
      await h.resetDmg(p);
      // Ba đòn nhận (cách nhau > 0.2 s): nổ băng 15 + 3 gai băng ngẫu nhiên; lặp 4 lần cho gai trúng ít nhất một con.
      await p.evaluate(() => { const pl = SK.G.player; pl._cpIce = []; for (const e of SK.G.enemies) { e.x = pl.x + 4; e.y = pl.y; } });
      for (let i = 0; i < cf.s2InitPassiveSkillHitTimes * 4; i++) { await hurt(p, 1); await h.sleep(cf.s2InitHitInvincibilityFrameDuration * 1000 + 120); }
      const m = await state(p), b = await h.snap(p);
      const passiveIce = m.ice.slice();
      // Phòng Thủ 0 Độ: giữ phím, nhận đòn hồi máu hình và tích năng lượng.
      await p.evaluate(() => { SK.G.player._form.hp = 20; SK.G.player._form.hits = 0; SK.G.player._cpIce = []; });
      await h.standNear(p, 24);
      await p.evaluate(() => { const pl = SK.G.player; for (const e of SK.G.enemies) { e.x = pl.x + 3; e.y = pl.y; } });
      await h.resetDmg(p);
      // Phím đổi vũ khí không vào thế thủ; nút đặc biệt giữ = thế thủ, giữ đủ 4 s = 3 lượt gai (floor(4 / 4 x 3)).
      await p.keyboard.down('KeyQ'); await h.sleep(80); await p.keyboard.up('KeyQ'); await h.sleep(60);
      const qKey = await state(p);
      await p.keyboard.down('KeyL'); await h.sleep(250);
      const holdA = await state(p);
      const hh = await hurt(p, 5);
      await h.sleep(300);
      const hh2 = await hurt(p, 5);
      const holdB = await state(p);
      await h.seq(p, 'costumeprince_1b', 6, 90);
      await h.until(p, () => SK.G.player._form.act === 'strike', null, 6000);
      await p.keyboard.up('KeyL');
      const strike = await state(p);
      await h.sleep(700);
      const zoneMid = await state(p);
      await h.until(p, () => !SK.G.player._form.act, null, 6000);
      await h.sleep(200);
      const e = await h.snap(p), z = await state(p);
      const crystal = h.hitsOf(e, 'ice'), icicles = z.ice;
      // Vuốt.
      await h.standNear(p, 24);
      await h.resetDmg(p);
      await p.evaluate(() => { const pl = SK.G.player; pl._cpIce = []; for (const e of SK.G.enemies) { e.x = pl.x + 20; e.y = pl.y; } });
      await p.keyboard.down('KeyJ'); await h.sleep(1300); await p.keyboard.up('KeyJ');
      const c = await h.snap(p), clawIce = (await state(p)).ice;
      await h.pressK(p); await h.sleep(150);
      h.check('costumeprince crab: hoá Cua Vua ' + cf.s2InitShiftHp + ' máu hình [ĐO s2InitShiftHp], chạy x' + cf.s2InitShiftMoveSpeed[0] + ' [ĐO], Vuốt', s.kind === 'crab' && s.hp === cf.s2InitShiftHp && Math.abs(s.move - cf.s2InitShiftMoveSpeed[0]) < 1e-6 && s.weapon === '_cp_claw', JSON.stringify({ hp: s.hp, move: s.move, w: s.weapon }));
      h.check('costumeprince crab: cứ ' + cf.s2InitPassiveSkillHitTimes + ' đòn nhận thì nổ băng ' + cf.s2InitPassiveSkillExplodeDamage + ' [ĐO] bán kính 4.5 ô + ' + 3 + ' gai băng ' + cf.s2InitCrystalSpikeDamage + ' rải ngẫu nhiên trong ' + cf.s2InitPassiveSkillIceBulletRadius + ' ô [ĐO DoPassiveSkill]', h.hitsOf(b, 'passive').length > 0 && h.hitsOf(b, 'passive').every(v => v === cf.s2InitPassiveSkillExplodeDamage) && passiveIce.length === 12 && passiveIce.every(v => v[2] === 6), 'nổ ' + h.hitsOf(b, 'passive').join(',') + ' · gai ' + passiveIce.length);
      h.check('costumeprince crab: phím đổi vũ khí không vào thế thủ; Phòng Thủ 0 Độ (giữ KeyL) không mất máu, mỗi đòn đỡ (2 đòn) hồi ' + cf.s2InitShiftAddHp + ' máu hình [ĐO s2InitShiftAddHp], khoá đánh', qKey.act == null && holdA.act === 'hold' && holdA.noFire === true && hh === false && holdB.hp === 20 + 2 * cf.s2InitShiftAddHp && holdB.php === s.php, JSON.stringify({ q: qKey.act, act: holdA.act, hp: holdB.hp }));
      h.check('costumeprince crab: nhả nút thì Gai Pha Lê: giữ ' + cf.s2InitMainSkillHoldDefenceDuration + ' s ' + '(hoặc ngắn hơn) -> floor(giữ / 4 x ' + cf.s2InitCreateIcicleTimes + ') lượt, mỗi lượt 6 gai ' + cf.s2InitCrystalSpikeDamage + ' sát thương [ĐO], vùng bắn ra, hồi chiêu ' + cf.s2InitMainSkillCd + ' s [ĐO]', strike.act === 'strike' && strike.total === Math.max(1, Math.floor(strike.holdT / cf.s2InitMainSkillHoldDefenceDuration * cf.s2InitCreateIcicleTimes)) && icicles.length === strike.total * 6 && icicles.every(v => v[2] === cf.s2InitCrystalSpikeDamage) && zoneMid.zone === true && crystal.every(v => v === cf.s2InitCrystalSpikeDamage) && z.cdT > cf.s2InitMainSkillCd - 1.5, 'lượt ' + strike.total + ' · gai ' + icicles.length + ' · trúng ' + crystal.length + ' · cd ' + (z.cdT || 0).toFixed(1));
      h.check('costumeprince crab: Vuốt 12 sát thương [ĐO weapon_c27_skill1], mỗi đòn thả 5 gai băng 6 [ĐO C27Skill2Weapon.Attack], thoát hình', c.hits.some(v => v[1] === 'claw' && (v[0] === 12 || v[0] === 24)) && clawIce.length >= 5 && clawIce.length % 5 === 0 && clawIce.every(v => v[2] === 6), 'đòn ' + c.hits.filter(v => v[1] === 'claw').map(v => v[0]).join(',') + ' · gai ' + clawIce.length);
    },
    async 'costumeprince/2'(p) {
      const r = await h.real(p, 'costumeprince', 'manifest_king_violet');
      const cfg = await p.evaluate(() => { const s = SK_SKILLS86.mb.CostumePrince_0_skill_2; return s && s.C27Skill3ShapeShiftCtrl ? s.C27Skill3ShapeShiftCtrl.config : null; }) || {
        initValorValue: 30, initValorTurnOnValue: 50, notValorGetDamageLimit: 5, initBladeDamage: 8, initSpearDamage: 8, landDamage: 13, jazzLeapLandingDamage: 2, valorAnimatorSpeed: 1.5, initMainSkillCd: 5, swingSwordBulletCreateTimesAfterMainSkill: 3, initPunchDamage: 10, valorStateDamageAdditive: 2, turnValorHpProtectTime: 2,
        getDamageValorConversionRate: 5, notAttackMoveSpeedAdditive: 0.8, attackMoveSpeedAdditive: 1.2, notCreateDamageTimeLimit: 2 };   // literal đọc từ config của C27Skill3ShapeShiftCtrl (common.ab)
      await p.evaluate(() => { for (const e of SK.G.enemies) e.hp = e.hpMax = 900; });
      await h.standNear(p, 26);
      await h.pressK(p); await h.sleep(150);
      const s = await state(p);
      // Đòn thường: kiếm 8, kiếm 8, thương 8.
      await h.resetDmg(p);
      await p.keyboard.down('KeyJ'); await h.sleep(1500);
      await h.seq(p, 'costumeprince_2a', 6, 60);
      await p.keyboard.up('KeyJ');
      const a = await h.snap(p), va = await state(p);
      // Chiến Dũng thấp: đòn nhận tối đa 5; mỗi đòn nhận cộng ceil(sát thương x getDamageValorConversionRate) Chiến Dũng.
      await p.evaluate(() => { const f = SK.G.player._form; f.on = false; f.valor = 10; f.lastDmgT = SK.G.t; });
      const before = await state(p);
      await p.evaluate(() => { SK.G.player.invulT = 0; });
      const hLow = await p.evaluate(() => { const G = SK.G, pl = G.player, t0 = pl.hp + pl.armor; pl.god = false; pl.hp = 30; pl.hpMax = 30; pl.armor = 0; SK.hurtPlayer(G, 9); return 30 - pl.hp; });
      const afterHurt = await state(p);
      // Bật Chiến Dũng.
      await p.evaluate(() => { const f = SK.G.player._form; f.valor = 60; });
      await h.sleep(200);
      const on = await state(p);
      await p.evaluate(() => { const G = SK.G, pl = G.player; pl.invulT = 0; pl.hp = 30; pl.armor = 0; });
      const hHigh = await p.evaluate(() => { const G = SK.G, pl = G.player; pl.invulT = 0; pl.hp = 2; SK.hurtPlayer(G, 9); return pl.hp; });
      // Bay Nhảy.
      await h.resetDmg(p);
      await p.evaluate(() => { const f = SK.G.player._form; f.cdT = 0; f.valor = 80; SK.G.player.hp = 30; });
      // Phím đổi vũ khí không nhảy; nút đặc biệt (KeyL) mới nhảy.
      await p.keyboard.down('KeyQ'); await h.sleep(60); await p.keyboard.up('KeyQ'); await h.sleep(60);
      const qKey = await state(p);
      await p.keyboard.down('KeyL'); await h.sleep(60); await p.keyboard.up('KeyL');
      await h.sleep(250);
      const air = await state(p);
      await h.seq(p, 'costumeprince_2b', 6, 150);
      await h.sleep(700);
      const l = await h.snap(p), ls = await state(p);
      await h.sleep(1500);
      const zoneSnap = await h.snap(p), zone = h.hitsOf(zoneSnap, 'zone');

      await h.pressK(p); await h.sleep(150);
      const x = await state(p);
      h.check('costumeprince violet: hoá Tước Sĩ Tím, Chiến Dũng ' + cfg.initValorValue + ' [ĐO initValorValue], vũ khí Hồn Nhẫn, dùng máu người chơi', s.kind === 'violet' && Math.abs(s.valor - cfg.initValorValue) < 1 && s.weapon === '_cp_blade' && s.hp == null, JSON.stringify({ valor: s.valor, w: s.weapon }));
      const blades = a.hits.filter(v => v[1] === 'blade' || v[1] === 'spear').map(v => v[0]);
      h.check('costumeprince violet: đòn thường kiếm/thương ' + cfg.initBladeDamage + ' sát thương [ĐO config], gây sát thương thì tích Chiến Dũng', blades.length >= 3 && blades.every(v => v === cfg.initBladeDamage || v === cfg.initBladeDamage * 2) && va.valor > s.valor - 5, 'đòn ' + blades.join(',') + ' · Chiến Dũng ' + (va.valor || 0).toFixed(1));
      h.check('costumeprince violet: Chiến Dũng thấp thì đòn nhận tối đa ' + cfg.notValorGetDamageLimit + ' [ĐO notValorGetDamageLimit] (9 → 5), cộng ceil(5 x ' + cfg.getDamageValorConversionRate + ') = 25 Chiến Dũng [ĐO getDamageValorConversionRate]', hLow === cfg.notValorGetDamageLimit && afterHurt.valor >= before.valor + 25 - 2 && afterHurt.valor <= before.valor + 25 + 0.5, 'mất ' + hLow + ' · Chiến Dũng ' + (before.valor || 0).toFixed(1) + ' → ' + (afterHurt.valor || 0).toFixed(1));
      h.check('costumeprince violet: tốc chạy x' + cfg.notAttackMoveSpeedAdditive + ' khi chưa gây sát thương, x' + cfg.attackMoveSpeedAdditive + ' trong ' + cfg.notCreateDamageTimeLimit + ' s sau khi gây sát thương (không phụ thuộc Chiến Dũng) [ĐO set_IsSpeedUp]', Math.abs(s.move - cfg.notAttackMoveSpeedAdditive) < 1e-6 && Math.abs(va.move - cfg.attackMoveSpeedAdditive) < 1e-6, JSON.stringify({ đầu: s.move, saugây: va.move }));
      h.check('costumeprince violet: Chiến Dũng ≥ ' + cfg.initValorTurnOnValue + ' bật trạng thái: tốc đánh x' + cfg.valorAnimatorSpeed + ', bảo vệ máu ' + cfg.turnValorHpProtectTime + ' s [ĐO]', on.on === true && Math.abs(on.rate - cfg.valorAnimatorSpeed) < 1e-6 && hHigh >= 1, JSON.stringify({ on: on.on, rate: on.rate, hpSau: hHigh }));
      h.check('costumeprince violet: phím đổi vũ khí (KeyQ) không nhảy, nút đặc biệt (KeyL) mới nhảy và khoá đánh (noFire)', qKey.act == null && air.act === 'leap' && air.noFire === true, JSON.stringify({ q: qKey.act, l: air.act, noFire: air.noFire }));
      h.check('costumeprince violet: Bay Nhảy hạ cánh ' + cfg.landDamage + ' + ' + cfg.valorStateDamageAdditive + ' (Chiến Dũng cao) = ' + (cfg.landDamage + cfg.valorStateDamageAdditive) + ' sát thương [ĐO landDamage + GetFinalDamage], vùng ' + cfg.jazzLeapLandingDamage + ' mỗi ' + 1.5 + ' s + choáng [ĐO CircleDamageCarrier damageInterval 1.5], hồi chiêu ' + cfg.initMainSkillCd + ' s x0.8 khi Chiến Dũng cao', air.act === 'leap' && h.hitsOf(l, 'leap').length > 0 && h.hitsOf(l, 'leap').every(v => v === cfg.landDamage + cfg.valorStateDamageAdditive || v === (cfg.landDamage + cfg.valorStateDamageAdditive) * 2) && ls.swings <= cfg.swingSwordBulletCreateTimesAfterMainSkill && zone.length > 0 && zone.length <= 2 * 6 && zone.every(v => v === cfg.jazzLeapLandingDamage) && ls.cdT > 2 && ls.cdT <= cfg.initMainSkillCd, JSON.stringify({ air: air.act, nện: h.hitsOf(l, 'leap').join(','), vùng: zone.join(','), cd: ls.cdT }));
      h.check('costumeprince violet: bấm K thoát hình, trả vũ khí, hồi chiêu ' + r.cd + ' s [ĐO]', x.kind == null && x.weapon !== '_cp_blade' && x.rate === 1 && x.move === 1, JSON.stringify({ w: x.weapon, rate: x.rate, move: x.move }));
    }
  };
};
