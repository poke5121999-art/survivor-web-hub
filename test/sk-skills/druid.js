// Ca kiểm Tu Sĩ Rừng (c11): ô 1 venom_vines, ô 2 fuzzy_bear.
module.exports = h => ({
  async 'druid/1'(p) {
    const { check, sleep, near, standNear, snap, pressK, seq, real, hitsOf, until } = h;
    const r = await real(p, 'druid', 'venom_vines');
    const VV = await p.evaluate(() => SK.SKILLS.venom_vines.VV);
    const hp = (await p.evaluate(() => SK.SKILLS.venom_vines.V)).hp;
    await p.evaluate(() => { for (const e of SK.G.enemies) e.hp = e.hpMax = 5000; });
    await standNear(p, 60);
    await pressK(p); await sleep(300);
    const a = await p.evaluate(() => { const v = (SK.G._allies || []).filter(x => x.vine); return { n: v.length, hp: v.map(x => x.hp), max: v.map(x => x.hpMax) }; });
    const s0 = await snap(p);
    check('druid venom_vines: mọc 6 dây leo máu 10 [ĐO RoleAttribute.max_hp, CreatingVines 6 + cấp/3], hồi chiêu ' + r.cd + ' s [ĐO]', VV.n === 6 && hp === 10 && a.n === 6 && a.max.every(m => m === 10) && s0.cd === r.cd && near(s0.skillCd, r.cd, 0.6), JSON.stringify(a) + ' · skillCd ' + s0.skillCd.toFixed(2));
    check('druid venom_vines: dây cách nhau 0,15 s, sống 8 s, tầm dò 12 ô có tường chặn, đạn bẻ lái 15°/0,02 s dò 12 ô mỗi 0,1 s [ĐO CreatingVines, VineController.Start/Scout, Bullet02]',
      VV.stagger === 0.15 && VV.life === 8 && VV.sight === 12 * 16 && near(VV.turn, 13.09, 0.01) && VV.homing === 12 * 16 && VV.retarget === 0.1, JSON.stringify([VV.stagger, VV.life, VV.sight, VV.turn, VV.homing, VV.retarget]));
    // đạn địch bị dây chặn
    const eaten = await p.evaluate(() => {
      const G = SK.G, v = G._allies.find(x => x.vine);
      G.bullets.push({ side: 'e', kind: 'orb', x: v.x - 14, y: v.y - 14, h: 8, vx: 120, vy: 0, ang: 0, dmg: 2, repel: 0, r: 3, life: 3, _probe: 1 });
      window._hp0 = G._allies.filter(x => x.vine).reduce((t, x) => t + x.hp, 0);
      return true;
    });
    await sleep(500);
    const blocked = await p.evaluate(() => !SK.G.bullets.some(b => b._probe) && SK.G._allies.filter(x => x.vine).reduce((t, x) => t + x.hp, 0) === window._hp0 - 2);
    check('druid venom_vines: dây leo chặn đạn địch (mất máu bằng sát thương viên đạn)', blocked, 'tổng máu dây ' + (await p.evaluate(() => SK.G._allies.filter(x => x.vine).reduce((t, x) => t + x.hp, 0))));
    await resetD(p);
    await sleep(1400);
    await seq(p, 'druid_1', 6, 150);
    const s = await snap(p);
    const b = await p.evaluate(() => SK.G.bullets.filter(x => x._hm).length);
    check('druid venom_vines: mỗi dây toả 8 viên lưỡi liềm, mỗi viên 3 sát thương [ĐO Gun002 bullet_50_c11]', hitsOf(s, 'weapon').length > 0 && hitsOf(s, 'weapon').every(d => d === 3), 'đòn ' + hitsOf(s, 'weapon').slice(0, 8).join(',') + ' · đạn đang bay ' + b);
    await sleep((VV.life - 2.4) * 1000 + 900);
    const w = await p.evaluate(() => (SK.G._allies || []).filter(x => x.vine && !x.gone).length);
    check('druid venom_vines: héo sau 8 s [ĐO VineController.Start Invoke("Passaway", 8)]', w === 0, 'còn ' + w);
  },
  async 'druid/2'(p) {
    const { check, sleep, near, standNear, snap, pressK, seq, real, hitsOf, until } = h;
    const r = await real(p, 'druid', 'fuzzy_bear');
    const BR = await p.evaluate(() => SK.SKILLS.fuzzy_bear.BR);
    const BM = await p.evaluate(() => SK.SKILLS.fuzzy_bear.BM), hp = BM.hp, dmg = BM.dmg;
    await p.evaluate(() => { for (const e of SK.G.enemies) e.hp = e.hpMax = 5000; });
    await standNear(p, 90);
    const a0 = await snap(p);
    await pressK(p); await sleep(300);
    const m = await p.evaluate(() => { const b = SK.G._allies.find(x => x.bear), pl = SK.G.player; return b ? { hp: b.hp, mounted: b.mounted, lift: pl._liftY, move: pl.moveMul, cd: pl.skillCd } : null; });
    await seq(p, 'druid_2', 6, 100);
    check('druid fuzzy_bear: gọi gấu máu 30 [ĐO RoleAttributePlayer] và cưỡi (người nhấc lên, tốc ×1,7/1,5 = speed_rate 0,5 + 0,2 [ĐO ResetCommon]), hồi chiêu ' + r.cd + ' s [ĐO]', hp === 30 && m && m.hp === 30 && m.mounted && m.lift > 0 && near(m.move, 1.7 / 1.5, 0.005) && near(m.cd, r.cd, 0.6), JSON.stringify(m));
    const t = await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; const r = SK.hurtPlayer(SK.G, 2); const b = SK.G._allies.find(x => x.bear); return { r, php: pl.hp, parm: pl.armor, bhp: b.hp }; });
    check('druid fuzzy_bear: đang cưỡi gấu chịu sát thương thay ×4 [ĐO MountBearController.GetHurt: damage << 2]', BR.dmgTaken === 4 && t.r === false && t.php === a0.php && t.parm === a0.parm && t.bhp === hp - 2 * 4, JSON.stringify(t));
    await pressL(p); await sleep(150);   // nút đặc biệt = xuống gấu (btn_unmount gốc)
    await resetD(p);
    const d = await p.evaluate(() => { const b = SK.G._allies.find(x => x.bear), pl = SK.G.player; return { mounted: b.mounted, lift: pl._liftY, move: pl.moveMul }; });
    await sleep(3200);
    await seq(p, 'druid_2b', 6, 120);
    const s = await snap(p);
    check('druid fuzzy_bear: nút đặc biệt (L) xuống gấu, gấu tự đập 12 sát thương [ĐO BearController.damage]', dmg === 12 && !d.mounted && d.lift === 0 && d.move === 1 && hitsOf(s, 'bear').length > 0 && hitsOf(s, 'bear').every(x => x === 12), JSON.stringify(d) + ' · đòn ' + hitsOf(s, 'bear').join(','));
    // hết máu thì nằm xuống, hồi 20% / 2 s, chưa đầy thì không bị đánh
    await p.evaluate(() => { const G = SK.G, b = G._allies.find(x => x.bear); for (const a of G._allies) if (a.wolf) a.gone = true; G.bullets.push({ side: 'e', kind: 'orb', x: b.x, y: b.y - 13, h: 8, vx: 0, vy: 0, ang: 0, dmg: 999, repel: 0, r: 3, life: 3 }); });
    await sleep(200);
    const dn = await p.evaluate(() => { const b = SK.G._allies.find(x => x.bear); return { down: b.down, hp: b.hp }; });
    await sleep(2400);
    const w1 = await p.evaluate(() => { const b = SK.G._allies.find(x => x.bear); return { down: b.down, hp: b.hp }; });
    await sleep(4000);   // ~6,6 s sau đòn cuối: lần hồi đầu
    const w2 = await p.evaluate(() => { const b = SK.G._allies.find(x => x.bear); return { down: b.down, hp: b.hp }; });
    await sleep(2000);   // ~8,6 s: lần hồi thứ hai
    const rg = await p.evaluate(() => { const b = SK.G._allies.find(x => x.bear); return { down: b.down, hp: b.hp }; });
    check('druid fuzzy_bear: hết máu thì nằm xuống còn 1 máu, 6 s sau đòn cuối hồi 6 (20% của 30), rồi mỗi 2 s một lần [ĐO RGPetController.ReplyingHP, reply_time 4 + 2]',
      BR.regenDelay === 6 && BR.regen === 0.2 && BR.regenEvery === 2 && dn.down && dn.hp === 1 && w1.down && w1.hp === 1 && w2.down && w2.hp === 7 && rg.down && rg.hp === 13, JSON.stringify([dn, w1, w2, rg]));
    await p.evaluate(() => { SK.G.player.skillCd = 0; });
    await pressK(p); await sleep(200);
    const rm = await p.evaluate(() => { const b = SK.G._allies.find(x => x.bear); return { mounted: b.mounted, down: b.down, hp: b.hp }; });
    check('druid fuzzy_bear: bấm khi hết hồi chiêu = cưỡi lại, gấu hồi 1/4 máu tối đa (7) [ĐO BearController.ForceRecover]', BR.remountFrac === 0.25 && rm.mounted && !rm.down && rm.hp >= rg.hp + 7 && rm.hp <= rg.hp + 7 + 6, JSON.stringify(rm));
  }
});
async function resetD(p) { await p.evaluate(() => { window._skDmg = 0; window._skHits = []; }); }
async function pressL(p) { await p.keyboard.down('KeyL'); await new Promise(r => setTimeout(r, 40)); await p.keyboard.up('KeyL'); }
