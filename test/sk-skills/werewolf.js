// Ca kiểm Người Sói (c09): ô 2 devour.
module.exports = h => ({
  async 'werewolf/2'(p) {
    const { check, sleep, near, standNear, snap, pressK, seq, real, hitsOf, until } = h;
    const r = await real(p, 'werewolf', 'devour');
    const DV = await p.evaluate(() => SK.SKILLS.devour.DV), BUL = await p.evaluate(() => SK.SKILLS.devour.BUL);
    await p.evaluate(() => { for (const e of SK.G.enemies) if (e.hpMax < 5000) e.hp = e.hpMax = 5000; });
    // 1) trượt: không có quái trong tầm lao -> hồi chiêu ngắn hơn
    await p.evaluate(() => { for (const e of SK.G.enemies) { e._st0 = e.st; e.st = 'spawn'; e.stT = 99; } });   // không còn quái hợp lệ trong tầm
    await pressK(p); await sleep(700);
    await p.evaluate(() => { for (const e of SK.G.enemies) if (e._st0) { e.st = 'idle'; e.stT = 99; } });
    const miss = await snap(p);
    check('werewolf devour: bấm nhanh mà trượt thì hồi chiêu ngắn hơn (' + DV.missCd + ' s thay vì ' + r.cd + ' s) [WIKI]', miss.cd === r.cd && miss.skillCd > 0.5 && miss.skillCd <= DV.missCd + 0.05, 'skillCd ' + miss.skillCd.toFixed(2));
    await p.evaluate(() => { SK.G.player.skillCd = 0; });
    // 2) trúng: lao tới nuốt một quái, hồi máu + năng lượng, thành Đạn Quái
    await p.evaluate(() => { const pl = SK.G.player; pl.hp = Math.max(1, pl.hpMax - 3); pl.energy = 10; });
    await standNear(p, 50);
    const a = await snap(p);
    await resetD(p);
    await pressK(p); await sleep(500);
    const b = await snap(p);
    await seq(p, 'werewolf_2', 6, 60);
    const st = await p.evaluate(() => { const s = SK.G.player._dv; return { mons: s.mons.length, eaten: SK.G.enemies.filter(e => e._eaten).length }; });
    check('werewolf devour: nuốt 1 quái (biến mất), hồi ' + DV.reward[0][0] + ' máu + ' + DV.reward[0][1] + ' năng lượng, thành 1 Đạn Quái; hồi chiêu ' + r.cd + ' s [ĐO cd]',
      st.eaten === 1 && st.mons === 1 && b.php === a.php + DV.reward[0][0] && b.en >= a.en + DV.reward[0][1] && b.cd === r.cd && near(b.skillCd, r.cd, 0.7), JSON.stringify(st) + ' · máu ' + a.php + ' → ' + b.php + ' · năng lượng ' + a.en + ' → ' + b.en + ' · skillCd ' + b.skillCd.toFixed(2));
    // 3) bắn Đạn Quái bằng nút thứ hai (K đang hồi chiêu)
    await standNear(p, 70);
    await resetD(p);
    await pressK(p); await sleep(700);
    await seq(p, 'werewolf_2b', 6, 80);
    const c = await snap(p);
    const left = await p.evaluate(() => SK.G.player._dv.mons.length);
    check('werewolf devour: bấm K khi đang hồi chiêu bắn Đạn Quái ' + BUL[0].dmg + ' sát thương xuyên ' + BUL[0].thr + ' [ĐO Skill2Info.defauleBullet]', left === 0 && hitsOf(c).length > 0 && hitsOf(c).every(d => d === BUL[0].dmg || d === BUL[0].dmg * 2), 'đòn ' + hitsOf(c).join(',') + ' · còn ' + left);
    // 4) giữ để tụ lực: hút quái và đạn
    await p.evaluate(() => { SK.G.player.skillCd = 0; SK.G.player._dv.ate = 0; });
    await standNear(p, 70);
    await p.evaluate(() => { const G = SK.G, pl = G.player; window._e0 = G.enemies.filter(e => e.st !== 'dead' && e.st !== 'spawn').map(e => Math.hypot(e.x - pl.x, e.y - pl.y)); G.bullets.push({ side: 'e', kind: 'orb', x: pl.x + Math.cos(pl.aim) * 60, y: pl.y - 8 + Math.sin(pl.aim) * 60, h: 8, vx: 0, vy: 0, ang: 0, dmg: 1, repel: 0, r: 3, life: 6, _probe: 1 }); });
    await p.keyboard.down('KeyK'); await sleep(700);
    const ch = await p.evaluate(() => { const pl = SK.G.player, s = pl._dv; return { mode: s.mode, move: pl.moveMul, near: SK.G.enemies.filter(e => e.st !== 'dead' && e.st !== 'spawn').map(e => Math.hypot(e.x - pl.x, e.y - pl.y)), probe: SK.G.bullets.some(b => b._probe) }; });
    await seq(p, 'werewolf_2c', 6, 100);
    await sleep(900);
    const probe2 = await p.evaluate(() => SK.G.bullets.some(b => b._probe));
    await p.keyboard.up('KeyK'); await sleep(200);
    const e1 = await p.evaluate(() => ({ eaten: SK.G.enemies.filter(e => e._eaten).length, mons: SK.G.player._dv.mons.length, cd: SK.G.player.skillCd }));
    const want = (DV.slow > 0) ? (await p.evaluate(() => (SK.G.player.h.speed - 3.5) / SK.G.player.h.speed)) : 1;
    check('werewolf devour: giữ > ' + DV.thr + ' s thì tụ lực: chạy chậm bớt ' + DV.slow + ' [ĐO], hút quái tới miệng, nuốt đạn địch', ch.mode === 'charge' && near(ch.move, Math.max(0.2, want), 0.02) && !probe2 && e1.eaten >= 2, JSON.stringify(ch.mode) + ' move ' + ch.move.toFixed(2) + ' · đạn địch còn ' + probe2 + ' · nuốt thêm ' + e1.eaten + ' · Đạn Quái ' + e1.mons);
  }
});
async function resetD(p) { await p.evaluate(() => { window._skDmg = 0; window._skHits = []; }); }
