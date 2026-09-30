// Kiểm thử kỹ năng Thợ Mỏ (c24) — số thật ở data/sk-skills86.js và ctrlFields C25Controller.
module.exports = h => {
  const { check, sleep, until, near, standNear, snap, resetDmg, pressK, seq, real, hitsOf } = h;
  const ctrl = (p, f) => p.evaluate(f => SK_SKILLS86.heroes.miner.ctrlFields[f], f);
  const crit = 2;   // R.critMult
  return {
    async 'miner/0'(p) {
      const r = await real(p, 'miner', 'underground_operations');
      await standNear(p, 40);
      // Chạy về phía có chỗ trống để lên ở chỗ khác chỗ xuống.
      const key = await p.evaluate(() => {
        const G = SK.G, pl = G.player, W = SK.world;
        const opts = [['KeyD', 1, 0], ['KeyA', -1, 0], ['KeyS', 0, 1], ['KeyW', 0, -1]];
        const room = k => { let n = 0; while (n < 60 && !W.solidAt(G.map, pl.x + k[1] * (n + 1) * 2, pl.y + k[2] * (n + 1) * 2)) n++; return n; };
        return opts.sort((a, b) => room(b) - room(a))[0][0];
      });
      await p.keyboard.down(key);
      await pressK(p); await sleep(150);
      const s = await snap(p);
      const imm = await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; return SK.hurtPlayer(SK.G, 3); });
      await seq(p, 'miner_0', 6, 60);
      await p.keyboard.up(key);
      check('miner underground_operations: chui xuống ' + r.dur + ' s [ĐO], ẩn thân và bất tử', s.hidden && imm === false && near(s.skillT, r.dur - 0.15, 0.4), 'skillT ' + s.skillT.toFixed(2) + ' · hidden ' + s.hidden);
      const enter = hitsOf(s, 'skill');
      check('miner underground_operations: sóng xung kích lúc xuống gây 15 [ĐO explode_miner_skill0]', enter.length >= 1 && enter.every(d => d === 15 || d === 15 * crit), 'đòn ' + enter.join(','));
      await until(p, () => SK.G.player.skillT <= 0, null, 6000);
      await sleep(100);
      const e = await snap(p);
      const holes = await p.evaluate(() => (SK.G._minerHoles || []).filter(x => !x.gone).map(x => [Math.round(x.x), Math.round(x.y), !!x.partner]));
      check('miner underground_operations: lên khỏi đất, hồi chiêu ' + r.cd + ' s [ĐO]', !e.hidden && near(e.skillCd, r.cd, 0.4) && e.cd === r.cd, 'skillCd ' + e.skillCd.toFixed(2));
      check('miner underground_operations: để lại hố (xuống và lên), mỗi hố có hố cặp', holes.length === 2 && holes.every(x => x[2]), JSON.stringify(holes));
      // Dùng hố: đứng cạnh hố thứ nhất, ấn E thì sang hố kia.
      const tp = await p.evaluate(() => {
        const G = SK.G, hs = G._minerHoles.filter(x => !x.gone), a = hs[0], b = a.partner;
        G.player.x = a.x + 2; G.player.y = a.y;
        return [b.x, b.y];
      });
      await sleep(150);
      await p.keyboard.down('KeyE'); await sleep(90); await p.keyboard.up('KeyE'); await sleep(120);
      const q = await snap(p);
      check('miner underground_operations: ấn E ở hố thì sang hố cặp', Math.hypot(q.px - tp[0], q.py - tp[1]) < 6, 'tới ' + Math.round(q.px) + ',' + Math.round(q.py) + ' · hố cặp ' + tp.map(Math.round));
    },
    async 'miner/1'(p) {
      const r = await real(p, 'miner', 'cart_delivery');
      const v0 = await ctrl(p, 'skill1StartSpeed'), cast = await ctrl(p, 'skill1CastTime');
      await standNear(p, 60);
      const a = await snap(p);
      await p.keyboard.down('KeyD');
      await pressK(p); await sleep(350);
      const s = await snap(p);
      await seq(p, 'miner_1', 6, 60);
      await p.keyboard.up('KeyD');
      const d = Math.hypot(s.px - a.px, s.py - a.py);
      check('miner cart_delivery: xe chạy từ tốc ' + v0 + ' đơn vị/s [ĐO], quãng ≥ 45 px sau 0,35 s', near(s.skillT, cast - 0.35, 0.45) && d > 45, 'skillT ' + s.skillT.toFixed(2) + ' · đi ' + d.toFixed(0) + ' px');
      const car = hitsOf(s, 'cart');
      check('miner cart_delivery: tông quái = 5 × chí mạng 100% [ĐO critical 100]', car.length === 0 || car.every(x => x === 5 * crit), 'đòn ' + car.join(','));
      // Nhảy xuống ở tốc tối đa: hồi nửa giáp đã mất.
      await p.evaluate(() => { const pl = SK.G.player; pl.armor = 0; pl.armorT = 99; pl._cart.v = pl._cart.max; });
      await resetDmg(p);
      await pressK(p); await sleep(150);
      const e = await snap(p);
      check('miner cart_delivery: nhảy xuống ở tốc tối đa hồi nửa giáp đã mất (' + Math.ceil(e.parmMax / 2) + '/' + e.parmMax + ') [ĐO info]', e.parm === Math.ceil(e.parmMax / 2) && e.skillT <= 0, 'giáp ' + e.parm);
      const ex = hitsOf(e, 'skill');
      check('miner cart_delivery: xe nổ khi nhảy xuống gây 15 [ĐO explode_miner_skill1], hồi chiêu ' + r.cd + ' s', near(e.skillCd, r.cd, 0.4) && ex.every(x => x === 15 || x === 15 * crit), 'đòn ' + ex.join(',') + ' · skillCd ' + e.skillCd.toFixed(2));
    },
    async 'miner/2'(p) {
      const r = await real(p, 'miner', 'sandworm_storm');
      const gmax = await ctrl(p, 'skill2MaxPassiveEnergy'), gd = await ctrl(p, 'giantWormDamage'), add = await ctrl(p, 'giantWormDamageAddPerRelease');
      await standNear(p, 45);
      await p.evaluate(() => { SK.G.player.energy = SK.G.player.energyMax; });
      const en0 = (await snap(p)).en;
      await pressK(p); await sleep(3300);
      const s = await snap(p);
      await seq(p, 'miner_2', 6, 70);
      const worms = hitsOf(s, 'worm');
      const gauge = await p.evaluate(() => SK.G.player._sw && SK.G.player._sw.gauge);
      check('miner sandworm_storm: bật tay (không thời lượng), tiêu năng lượng tăng dần (0,1,2... mỗi giây) [ĐO AddCost 1]', s.skillT > 1000 && s.en <= en0 - 3 && s.en >= en0 - 8, 'năng lượng ' + en0 + ' → ' + s.en.toFixed(1));
      check('miner sandworm_storm: sâu nhỏ cắn 15 [ĐO explode_miner_skill2], tích thanh Khổng Lồ 3/quái (tối đa ' + gmax + ')', worms.length >= 1 && worms.every(x => x === 15 || x === 15 * crit) && gauge >= 3 && gauge % 3 === 0, 'đòn ' + worms.join(',') + ' · thanh ' + gauge);
      // Sâu Khổng Lồ khi thanh đầy: 19 (+5 mỗi lần).
      await p.evaluate(g => { SK.G.player._sw.gauge = g; SK.G.player._sw.spawnT = 99; }, gmax);
      await resetDmg(p);
      await pressK(p); await sleep(900);
      const g1 = await snap(p);
      const first = hitsOf(g1, 'giant');
      const rel = await p.evaluate(() => SK.G.player._sw.rel);
      check('miner sandworm_storm: Sâu Khổng Lồ ' + gd + ' sát thương, lần sau +' + add + ' [ĐO giantWormDamage]', first.length >= 1 && first.every(x => x === gd || x === gd * crit) && rel === 1, 'đòn ' + first.join(',') + ' · lần ' + rel);
      // Lần hai (giãn cách 1 s): giữ phím hướng thì sâu ở dưới chân và hất bay.
      await sleep(900);
      await resetDmg(p);
      const a = await snap(p);
      await p.keyboard.down('KeyD'); await pressK(p); await sleep(800);
      const fly = await p.evaluate(() => { const st = SK.G.player._sw; return st && st.fly ? 1 : 0; });
      const imm = await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; return SK.hurtPlayer(SK.G, 3); });
      await seq(p, 'miner_2b', 6, 80);
      await p.keyboard.up('KeyD');
      await sleep(700);
      const l = await snap(p);
      check('miner sandworm_storm: nhờ sâu khổng lồ hất bay: bất tử khi bay, đáp cách xa và nổ ' + (await ctrl(p, 'jumpEndDamage')) + ' [ĐO jumpEndDamage]', fly === 1 && imm === false && Math.hypot(l.px - a.px, l.py - a.py) > 60, 'bay ' + fly + ' · đi ' + Math.hypot(l.px - a.px, l.py - a.py).toFixed(0) + ' px');
      const second = hitsOf(l, 'giant');
      check('miner sandworm_storm: sâu khổng lồ lần hai ' + (gd + add) + ' [ĐO]', second.length === 0 || second.every(x => x === gd + add || x === (gd + add) * crit), 'đòn ' + second.join(','));
      await p.evaluate(() => { const pl = SK.G.player; if (pl._sw) { pl._sw.gauge = 0; pl._sw.hyper = false; } });
      await pressK(p); await sleep(200);
      const e = await snap(p);
      check('miner sandworm_storm: bấm lần nữa (chưa đủ thanh) thì tắt, hồi chiêu ' + r.cd + ' s [ĐO]', e.skillT <= 0 && near(e.skillCd, r.cd, 0.4), 'skillT ' + e.skillT + ' · skillCd ' + e.skillCd.toFixed(2));
    }
  };
};
