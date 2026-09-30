// Ca kiểm Người Máy (c12): ô 1 drone_swarm.
module.exports = h => ({
  async 'robot/1'(p) {
    const { check, sleep, near, standNear, snap, pressK, seq, real, hitsOf, until } = h;
    const r = await real(p, 'robot', 'drone_swarm');
    const DR = await p.evaluate(() => SK.SKILLS.drone_swarm.DR);
    const crit = await p.evaluate(() => SK.DS.rules.critMult);
    const wid = await p.evaluate(() => {
      const W = SK.DS.weapons, ks = Object.keys(W), pl = SK.G.player;
      const pick = kind => ks.find(k => W[k].kind === kind && !k.startsWith('_'));
      return { gun: pick('gun'), melee: pick('melee'), laser: pick('laser') };
    });
    const setW = id => p.evaluate(id => { const pl = SK.G.player; pl.weapons[pl.cur] = SK.makeWeapon(id); pl.energy = pl.energyMax || 999; }, id);
    const info = () => p.evaluate(() => { const m = SK.G.player._drones; return m ? { type: m.type, n: m.list.filter(d => !d.gone).length, mode: m.mode } : null; });
    await p.evaluate(() => { for (const e of SK.G.enemies) e.hp = e.hpMax = 5000; window._nb = 0; const o = SK.spawnBullet86; SK.spawnBullet86 = function (G, side) { if (side === 'p') window._nb++; return o.apply(this, arguments); }; });
    await standNear(p, 70);
    // 1) súng: bấm lần đầu chỉ triệu hồi, hồi chiêu chạy ngay
    await setW(wid.gun);
    await pressK(p); await sleep(200);
    const a = await info(), s0 = await snap(p);
    check('robot drone_swarm: 4 drone theo loại vũ khí (súng), hồi chiêu ' + r.cd + ' s chạy ngay [ĐO args, cd]', a && a.type === 'gun' && a.n === 4 && r.args === '4' && s0.cd === r.cd && near(s0.skillCd, r.cd, 0.5), JSON.stringify(a) + ' · skillCd ' + s0.skillCd.toFixed(2));
    const K0 = await p.evaluate(() => { const D = SK.SKILLS.drone_swarm.DR, U = SK.PPU; return [D.orbit / U, D.speed / U, D.range / U, D.every, D.gun.dmg, D.gun.shots, D.laser.dmg, D.laser.len / U, D.melee.dmg, D.melee.blast, D.melee.burn, D.ex.dur, D.ex.gap, D.ex.ring, D.ex.volleys, +D.spin.toFixed(3), +D.rocketTurn.toFixed(2)]; });
    check('robot drone_swarm: quỹ đạo 2,25 ô, bay 15, dò 14 ô quanh chủ, nhịp 1,5 s, súng 2 ×2, laser 3 dài 100, kiếm 5, nổ 15 cháy 50%, đòn riêng 1,6 s nhịp 0,5 s 7 viên 4 loạt, xoay 2°/khung, tên lửa 30°/0,02 s [ĐO CreatingFunnel/GetFunnelRootPos/FindTarget/Skill1ExAttack/FunnelRotating]',
      JSON.stringify(K0) === JSON.stringify([2.25, 15, 14, 1.5, 2, 2, 3, 100, 5, 15, 0.5, 1.6, 0.5, 7, 4, 2.094, 26.18]), JSON.stringify(K0));
    await resetD(p);
    await sleep(2600);
    await seq(p, 'robot_1', 6, 100);
    const g = await snap(p);
    check('robot drone_swarm: drone súng bắn 2 sát thương mỗi viên [ĐO gunDamage]', g.dmg > 0 && hitsOf(g).every(d => d === 2), 'đòn ' + hitsOf(g).join(','));
    // 2) đòn riêng của drone súng (vũ khí lúc bấm là cận chiến -> bộ mới là cận chiến)
    await setW(wid.melee);
    await p.evaluate(() => { SK.G.player.skillCd = 0; });
    await resetD(p);
    await p.evaluate(() => { window._nb = 0; });
    await pressK(p); await sleep(250);
    const nb = await p.evaluate(() => window._nb);
    const sp = await snap(p);
    check('robot drone_swarm: bấm lại = đòn riêng: mỗi loạt ' + DR.n + ' drone × 7 viên (2 + 5) [ĐO gunBulletCount + gunExBulletCount], skill đang chạy', nb >= 7 * DR.n && sp.skillT > 0, 'đạn ' + nb + ' · skillT ' + sp.skillT.toFixed(2));
    await sleep(1000);
    const nb2 = await p.evaluate(() => window._nb);
    check('robot drone_swarm: đòn riêng súng bắn 4 loạt 0, 0,5, 1, 1,5 s (nhịp gunExInterval 0,5), tổng ≥ ' + (7 * DR.n * 3) + ' viên sau 1,25 s [ĐO Skill1ExAttack]', nb2 >= 7 * DR.n * 3, 'đạn ' + nb2);
    await until(p, () => SK.G.player.skillT <= 0, null, 4000);
    await sleep(200);
    const b = await info();
    check('robot drone_swarm: xong đòn riêng thì triệu hồi bộ mới theo vũ khí đang cầm (cận chiến)', b && b.type === 'melee' && b.n === DR.n, JSON.stringify(b));
    // 3) drone cận chiến quét vòng, đòn riêng = lao vào tự nổ
    await standNear(p, 20);
    await resetD(p);
    await sleep(1800);
    const m = await snap(p);
    check('robot drone_swarm: drone cận chiến quét vòng 5 sát thương [ĐO meleeDamage]', hitsOf(m, 'drone').length > 0 && hitsOf(m, 'drone').every(d => d === 5), 'đòn ' + hitsOf(m, 'drone').join(','));
    await setW(wid.laser);
    await p.evaluate(() => { SK.G.player.skillCd = 0; });
    await resetD(p);
    await pressK(p); await sleep(200);
    await seq(p, 'robot_1b', 6, 120);
    await until(p, () => SK.G.player.skillT <= 0, null, 4000);
    const bl = await snap(p);
    check('robot drone_swarm: đòn riêng cận chiến: mỗi drone phóng tên lửa tự dẫn, trúng gây 15 [ĐO explodeDamage, robot_skill1_melee_bullet]', hitsOf(bl).some(d => d === 15 || d === 15 * crit), 'đòn ' + hitsOf(bl).join(','));
    await sleep(200);
    const c = await info();
    await resetD(p);
    await standNear(p, 70);
    await sleep(2500);
    await seq(p, 'robot_1c', 6, 100);
    const l = await snap(p);
    check('robot drone_swarm: bộ mới là laser, mỗi tia 3 sát thương (chí mạng x' + crit + ') [ĐO laserDamage]', c && c.type === 'laser' && hitsOf(l, 'drone').length > 0 && hitsOf(l, 'drone').every(d => d === 3 || d === 3 * crit), JSON.stringify(c) + ' · đòn ' + hitsOf(l, 'drone').join(','));
  }
});
async function resetD(p) { await p.evaluate(() => { window._skDmg = 0; window._skHits = []; }); }
