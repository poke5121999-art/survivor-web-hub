// Kiểm thử kỹ năng Thợ Mỏ (c24) — số thật ở data/sk-skills86.js và ctrlFields C25Controller; công thức đo bằng sk_method.py.
module.exports = h => {
  const { check, sleep, until, near, standNear, snap, resetDmg, pressK, seq, real, hitsOf } = h;
  const ctrl = (p, f) => p.evaluate(f => SK_SKILLS86.heroes.miner.ctrlFields[f], f);
  const pressL = async p => { await p.keyboard.down('KeyL'); await sleep(40); await p.keyboard.up('KeyL'); };
  const crit = 2;   // R.critMult
  return {
    async 'miner/0'(p) {
      const r = await real(p, 'miner', 'underground_operations');
      const base = await ctrl(p, 'basicSkill0CastTime'), extra = await ctrl(p, 'extraSkill0Time');
      await standNear(p, 18);
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
      const ug = await p.evaluate(() => { const pl = SK.G.player, u = pl._ug; return { phase: u.phase, held: u.held, cast: u.cast, noFire: pl.noFire }; });
      const imm = await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; return SK.hurtPlayer(SK.G, 3); });
      await seq(p, 'miner_0', 6, 60);
      await p.keyboard.up(key);
      check('miner underground_operations: loại Prepare, nhả nút thì chui: ' + base + ' + ' + extra + ' × min(1, giữ / ' + r.dur + ') s [ĐO RoleSkill0]',
        ug.phase === 'dig' && ug.held < 0.3 && ug.cast === base + extra * Math.min(1, ug.held / r.dur) && near(s.skillT, ug.cast - 0.15, 0.4), 'giữ ' + ug.held.toFixed(3) + ' · cast ' + ug.cast.toFixed(3) + ' · skillT ' + s.skillT.toFixed(2));
      check('miner underground_operations: dưới đất ẩn thân, bất tử, khoá vũ khí (p.noFire)', s.hidden && imm === false && ug.noFire === true, 'hidden ' + s.hidden + ' · noFire ' + ug.noFire);
      const enter = hitsOf(s, 'skill');
      check('miner underground_operations: sóng xung kích lúc xuống gây 15 [ĐO explode_miner_skill0]', enter.length >= 1 && enter.every(d => d === 15 || d === 15 * crit), 'đòn ' + enter.join(','));
      await until(p, () => SK.G.player.skillT <= 0, null, 6000);
      await sleep(100);
      const e = await snap(p);
      const holes = await p.evaluate(() => (SK.G._minerHoles || []).filter(x => !x.gone).map(x => [Math.round(x.x), Math.round(x.y), !!x.partner]));
      const nf = await p.evaluate(() => SK.G.player.noFire);
      check('miner underground_operations: lên khỏi đất, mở khoá vũ khí, hồi chiêu ' + r.cd + ' s [ĐO]', !e.hidden && !nf && near(e.skillCd, r.cd, 0.4) && e.cd === r.cd, 'skillCd ' + e.skillCd.toFixed(2) + ' · noFire ' + nf);
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
      // Giữ nút đủ maxTime: dưới đất lâu nhất; bấm đánh thì lên ngay và nuốt phát bắn (noFire tới khi nhả nút).
      await p.evaluate(() => { SK.G.player.skillCd = 0; });
      await p.keyboard.down('KeyK'); await sleep(1500);
      const lg = await p.evaluate(() => { const u = SK.G.player._ug; return u && { phase: u.phase, cast: u.cast }; });
      await p.keyboard.up('KeyK');
      check('miner underground_operations: giữ nút đủ ' + r.dur + ' s thì dưới đất ' + (base + extra) + ' s [ĐO]', !!lg && lg.phase === 'dig' && lg.cast === base + extra, JSON.stringify(lg));
      await p.keyboard.down('KeyJ'); await sleep(150);
      const up = await p.evaluate(() => ({ t: SK.G.player.skillT, nf: SK.G.player.noFire, hid: !!SK.G.player.hidden }));
      await p.keyboard.up('KeyJ'); await sleep(150);
      const nf2 = await p.evaluate(() => SK.G.player.noFire);
      check('miner underground_operations: bấm đánh thì lên ngay [ĐO AttackDig], khoá bắn tới khi nhả nút', up.t <= 0 && !up.hid && up.nf === true && nf2 === false, 'skillT ' + up.t.toFixed(2) + ' · noFire ' + up.nf + ' → ' + nf2);
    },
    async 'miner/1'(p) {
      const r = await real(p, 'miner', 'cart_delivery');
      const v0 = await ctrl(p, 'skill1StartSpeed'), cast = await ctrl(p, 'skill1CastTime'), defWait = await ctrl(p, 'defenceAddSpeed');
      await standNear(p, 60);
      const a = await snap(p);
      await p.keyboard.down('KeyD');
      await pressK(p); await sleep(350);
      const s = await snap(p);
      const c0 = await p.evaluate(() => SK.G.player._cart.dmg);
      await seq(p, 'miner_1', 6, 60);
      await p.keyboard.up('KeyD');
      const d = Math.hypot(s.px - a.px, s.py - a.py);
      check('miner cart_delivery: xe chạy từ tốc ' + v0 + ' đơn vị/s [ĐO], quãng ≥ 45 px sau 0,35 s', near(s.skillT, cast - 0.35, 0.45) && d > 45, 'skillT ' + s.skillT.toFixed(2) + ' · đi ' + d.toFixed(0) + ' px');
      const car = hitsOf(s, 'cart');
      check('miner cart_delivery: tốc xe gần mức đầu thì sát thương tông = 5 (sàn của clamp 5..20) × chí mạng 100% [ĐO Skill1Update]', c0 === 5 && (car.length === 0 || car.every(x => x === 5 * crit)), 'dmg ' + c0 + ' · đòn ' + car.join(','));
      // Tốc tối đa: sát thương 15, giáp hồi 1 mỗi 0,5 / (1 × 1,5) s, Phòng Thủ +1 mỗi ' + defWait + ' s, hồi cả khi bị đánh thì xe nổ.
      await p.evaluate(() => { const pl = SK.G.player, c = pl._cart; pl.armor = 0; pl.armorT = 99; c.v = c.max; c.defT = 1.9; c.blasts = 0; });
      await sleep(1000);
      const m = await p.evaluate(() => { const pl = SK.G.player, c = pl._cart; return { dmg: c.dmg, def: c.def, arm: pl.armor, bl: c.blasts }; });
      check('miner cart_delivery: tốc tối đa 30 → sát thương tông (30−15)/15×15 = 15 [ĐO]', m.dmg === 15, 'dmg ' + m.dmg);
      check('miner cart_delivery: giáp hồi 1 mỗi 0,5/(1×1,5) s ở tốc tối đa (1 s → 2-3), Phòng Thủ +1 mỗi ' + defWait + ' s [ĐO armorRestoreSpeed, defenceAddSpeed]', m.arm >= 2 && m.arm <= 3 && m.def === 1, 'giáp ' + m.arm + ' · thủ ' + m.def);
      const hb = await p.evaluate(() => { const pl = SK.G.player, c = pl._cart, b0 = c.blasts, dmg = pl._hurt.cart(SK.G, pl, 3); return { dmg, d: c.blasts - b0 }; });
      check('miner cart_delivery: bị đánh thì xe nổ [ĐO GetHurt], Phòng Thủ 1 giảm 3 → 2', hb.d === 1 && hb.dmg === 2, 'nổ +' + hb.d + ' · sát thương ' + hb.dmg);
      // Nhảy xuống ở tốc tối đa: hồi nửa giáp đã mất, xe chạy tự động tiếp thời gian còn lại rồi biến mất, không nổ ở chỗ xuống.
      await p.evaluate(() => { const pl = SK.G.player; pl.armor = 0; pl.armorT = 99; pl.skillT = 0.8; pl._cart.arm = 0; });
      await sleep(80);
      await resetDmg(p);
      await pressK(p); await sleep(150);
      const e = await snap(p);
      const auto = await p.evaluate(() => (SK.G._minerCars || []).filter(c => !c.gone).length);
      check('miner cart_delivery: nhảy xuống ở tốc tối đa hồi nửa giáp đã mất (' + Math.ceil(e.parmMax / 2) + '/' + e.parmMax + ') [ĐO RestoreHalfLostArmor]', e.parm === Math.ceil(e.parmMax / 2) && e.skillT <= 0, 'giáp ' + e.parm);
      check('miner cart_delivery: nhảy xuống khi còn thời gian thì xe chạy tự động, hồi chiêu ' + r.cd + ' s [ĐO InitAutoMinerCar]', auto === 1 && near(e.skillCd, r.cd, 0.4), 'xe tự động ' + auto + ' · skillCd ' + e.skillCd.toFixed(2));
      await sleep(1100);
      const gone = await p.evaluate(() => (SK.G._minerCars || []).filter(c => !c.gone).length);
      check('miner cart_delivery: xe tự động biến mất khi hết thời gian còn lại', gone === 0, 'còn ' + gone);
    },
    async 'miner/2'(p) {
      const r = await real(p, 'miner', 'sandworm_storm');
      const gmax = await ctrl(p, 'skill2MaxPassiveEnergy'), gd = await ctrl(p, 'giantWormDamage'), add = await ctrl(p, 'giantWormDamageAddPerRelease');
      const hyperAdd = await ctrl(p, 'skill3HyperMoveSpeedAdd');
      await standNear(p, 45);
      await p.evaluate(() => { SK.G.player.energy = SK.G.player.energyMax; });
      const en0 = (await snap(p)).en;
      await pressK(p); await sleep(3300);
      const s = await snap(p);
      await seq(p, 'miner_2', 6, 70);
      const worms = hitsOf(s, 'worm');
      const gauge = await p.evaluate(() => SK.G.player._sw && SK.G.player._sw.gauge);
      check('miner sandworm_storm: bật tay (không thời lượng); năng lượng trừ mỗi 1,5 s theo mức tiêu (0 rồi +1 mỗi 2 s): sau 3,3 s mất đúng 1 [ĐO RoleSkill2]', s.skillT > 1000 && near(en0 - s.en, 1, 0.01), 'năng lượng ' + en0 + ' → ' + s.en);
      check('miner sandworm_storm: sâu nhỏ cắn 15 [ĐO explode_miner_skill2], tích thanh 3/quái (tối đa ' + gmax + ')', worms.length >= 1 && worms.every(x => x === 15 || x === 15 * crit) && gauge >= 3 && gauge % 3 === 0, 'đòn ' + worms.join(',') + ' · thanh ' + gauge);
      // Thanh đầy: nút special (L) vào chế độ Khổng Lồ 6 s, sâu ở chân, giữ nguyên sát thương cả lượt (19; lần vào sau +5).
      await p.evaluate(g => { const pl = SK.G.player; pl._sw.gauge = g; pl._sw.spawnT = 99; }, gmax);
      await sleep(100);
      const ready = await p.evaluate(() => !!SK.G.player._ultReady);
      await resetDmg(p);
      const a = await snap(p);
      await pressL(p); await sleep(650);
      const fly = await p.evaluate(() => { const st = SK.G.player._sw; return st && st.fly ? 1 : 0; });
      const imm = await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; return SK.hurtPlayer(SK.G, 3); });
      const hy = await p.evaluate(() => { const st = SK.G.player._sw; return { hyper: st.hyper, mv: SK.G.player.moveMul, rel: SK.G._minerRel, dmg: st.dmg, t: st.hyperT }; });
      await until(p, () => !SK.G.player._sw.fly, null, 1500);
      const l = await snap(p);
      await seq(p, 'miner_2b', 6, 80);
      const g1 = await snap(p);
      const first = hitsOf(g1, 'giant');
      check('miner sandworm_storm: L khi thanh đầy → chế độ Khổng Lồ, tốc chạy x' + (1 + hyperAdd / 6.5).toFixed(3) + ' [ĐO skill3HyperMoveSpeedAdd 2 / speed 6,5]', ready && hy.hyper && near(hy.mv, 1 + hyperAdd / 6.5, 0.01), 'ultReady ' + ready + ' · move ' + hy.mv.toFixed(3));
      check('miner sandworm_storm: Sâu Khổng Lồ ' + gd + ' sát thương lần vào đầu, +' + add + ' mỗi lần vào sau [ĐO giantWormDamage]', hy.rel === 1 && hy.dmg === gd && first.length >= 1 && first.every(x => x === gd || x === gd * crit), 'đòn ' + first.join(',') + ' · lần ' + hy.rel);
      const dist = Math.hypot(l.px - a.px, l.py - a.py);
      check('miner sandworm_storm: đứng ngay tâm sâu thì bị hất bay 4 đơn vị (64 px, ngắn hơn nếu vướng tường), bất tử khi bay [ĐO _giantWormLaunchMinDistance 4, duration 0,5]', fly === 1 && imm === false && dist > 24 && dist <= 4 * 16 + 4, 'bay ' + fly + ' · đi ' + dist.toFixed(0) + ' px');
      // Hết chế độ (xả về 0 trong 6 s) rồi vào lại: lần hai +5.
      await p.evaluate(() => { SK.G.player._sw.hyperT = 0.01; });
      await sleep(300);
      const off = await p.evaluate(() => { const st = SK.G.player._sw; return { hyper: st.hyper, g: st.gauge, mv: SK.G.player.moveMul || 1 }; });
      await p.evaluate(g => { const pl = SK.G.player; pl._sw.gauge = g; pl._sw.spawnT = 99; pl._sw.fly = null; }, gmax);
      await sleep(100);
      const has = await standNear(p, 45);
      await resetDmg(p);
      await pressL(p); await sleep(900);
      const g2 = await snap(p);
      const second = hitsOf(g2, 'giant');
      const rel2 = await p.evaluate(() => SK.G._minerRel);
      check('miner sandworm_storm: hết chế độ thì thanh về 0, tốc chạy trở lại', !off.hyper && off.g === 0 && near(off.mv, 1, 0.01), 'hyper ' + off.hyper + ' · thanh ' + off.g + ' · move ' + off.mv);
      check('miner sandworm_storm: lần vào chế độ thứ hai Sâu Khổng Lồ ' + (gd + add) + ' [ĐO minerSkill2GiantWormReleaseCount]', rel2 === 2 && (!has || second.length >= 1) && second.every(x => x === gd + add || x === (gd + add) * crit), 'đòn ' + second.join(',') + ' · lần ' + rel2);
      await p.evaluate(() => { const pl = SK.G.player; if (pl._sw) { pl._sw.gauge = 0; pl._sw.hyperT = 0.01; } });
      await sleep(200);
      await pressK(p); await sleep(200);
      const e = await snap(p);
      check('miner sandworm_storm: bấm K lần nữa thì tắt, hồi chiêu ' + r.cd + ' s [ĐO]', e.skillT <= 0 && near(e.skillCd, r.cd, 0.4), 'skillT ' + e.skillT + ' · skillCd ' + e.skillCd.toFixed(2));
    }
  };
};
