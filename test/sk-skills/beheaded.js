// Ca kiểm Kẻ Bị Chặt Đầu (c19): spartan_sandals.
// Dựng thế đứng trên một làn thoáng (người, quái A trong vùng đá, quái B phía sau), rồi bấm K thật và đo bằng mô hình vận tốc
// của mã gốc: v = lực đơn vị/s, mỗi bước 0,02 s đi v × 0,02 rồi nhân ma sát.
module.exports = h => {
  const T = 16, STEP = 0.02;
  const travel = (force, fric, steps) => { let v = force * T, d = 0; for (let i = 0; i < steps; i++) { d += v * STEP; v *= fric; } return d; };
  const lane = (p, need) => p.evaluate(n => {
    const G = SK.G, W = SK.world, T = 16, dirs = [0, Math.PI, Math.PI / 2, -Math.PI / 2];
    let best = null;
    for (let ty = 2; ty < G.map.H - 2; ty++) for (let tx = 2; tx < G.map.W - 2; tx++) {
      const x = tx * T + 8, y = ty * T + 12;
      if (W.solidAt(G.map, x, y) || W.solidAt(G.map, x - 6, y) || W.solidAt(G.map, x + 6, y) || W.solidAt(G.map, x, y - 5)) continue;
      for (const a of dirs) {
        // đo bằng chính SK.moveBox của quái (bán kính 16) để thấy cả vật cản, không chỉ ô tường
        const o = { x, y }; let d = 0;
        while (d < n && !SK.moveBox(G.map, o, Math.cos(a) * 4, Math.sin(a) * 4, 16)) d += 4;
        if (!best || d > best.d) best = { x, y, a, d };
        if (d >= n) return best;
      }
    }
    return best;
  }, need);
  // Đặt người ở đầu làn hướng theo làn, quái A cách `a` px, quái B cách `b` px (nếu có); mọi quái khác đứng xa.
  const setup = (p, L, a, b) => p.evaluate(([L, a, b]) => {
    const G = SK.G, pl = G.player, es = G.enemies.filter(e => e.st !== 'dead' && e.st !== 'spawn');
    pl.x = L.x; pl.y = L.y; pl.aim = L.a; pl.face = Math.cos(L.a) >= 0 ? 1 : -1; pl.skillCd = 0; pl.skillT = 0; pl.invulT = 0;
    const put = (e, d) => { e.x = L.x + Math.cos(L.a) * d; e.y = L.y + Math.sin(L.a) * d; e.st = 'stun'; e.stT = 99; e._stunT = 99; e.cd = 99; };
    G.enemies.forEach(e => { e._role = ''; });
    es.forEach(e => { e.x = -300; e.y = -300; e.st = 'idle'; e.stT = 99; e.cd = 99; });   // quái thừa đứng ngoài bản đồ để khỏi chắn làn
    put(es[0], a); es[0]._role = 'A';
    if (b != null) { put(es[1], b); es[1]._role = 'B'; }
    window._skHits = [];
    return es.length;
  }, [L, a, b]);
  return {
    async 'beheaded/0'(p) {
      const { check, sleep, near, snap, pressK, seq, real, hitsOf, until } = h;
      const r = await real(p, 'beheaded', 'spartan_sandals');
      const K = await p.evaluate(() => SK.SKILLS.spartan_sandals.KICK);
      const crit = await p.evaluate(() => SK.DS.rules.critMult);
      // Lần 1: A trong vùng đá, B ngay sau A → A trúng B, cả hai nhận kickHitDamage.
      const L1 = await lane(p, 330);
      await setup(p, L1, 34, 100);
      const x0 = await p.evaluate(() => { const pl = SK.G.player; return [pl.x, pl.y]; });
      await pressK(p); await sleep(120);
      const s = await snap(p);
      const during = await p.evaluate(() => ({ noFire: SK.G.player.noFire, hurt: (() => { const pl = SK.G.player; pl.invulT = 0; return SK.hurtPlayer(SK.G, 3); })() }));
      await seq(p, 'beheaded_0', 6, 60);
      await until(p, () => SK.G.player.skillT <= 0, null, 2000);
      const end = await snap(p);
      const fin = await p.evaluate(() => ({ noFire: SK.G.player.noFire }));
      await sleep(900);
      const e1 = await snap(p);
      const kick = hitsOf(e1, 'kick'), col = hitsOf(e1, 'kick_hit');
      check('beheaded spartan_sandals: cd ' + r.cd + ' [ĐO config], cả chiêu 0,5 s [ĐO SkillDuration], không nhận sát thương, khoá vũ khí trong lúc đá',
        s.cd === 1 && near(s.skillT, 0.5 - 0.12, 0.3) && during.hurt === false && during.noFire === true && fin.noFire === false, 'cd ' + s.cd + ' · skillT ' + s.skillT.toFixed(2) + ' · hurt ' + during.hurt + ' · noFire ' + during.noFire + '/' + fin.noFire);
      check('beheaded spartan_sandals: đòn đá 5 sát thương [ĐO SkillBaseDamage] chỉ trúng quái trong vùng đa giác của prefab (A trúng, B xa 6 ô không)',
        kick.length === 1 && (kick[0] === 5 || kick[0] === 5 * crit), 'đòn ' + kick.join(','));
      check('beheaded spartan_sandals: quái bị đá trúng quái khác thì cả hai nhận ' + K.hitDmg + ' [ĐO kickHitDamage]', col.length === 2 && col.every(d => d === 30 || d === 30 * crit), 'đòn va ' + col.join(','));
      // Người lao tới: lùi 5 rồi tiến 40 đơn vị/s, ma sát 0,8 mỗi bước 0,02 s [ĐO SkillBackForce, SkillForwardForce, RGBaseController..ctor].
      const net = await p.evaluate(x => { const pl = SK.G.player; return (pl.x - x[0]) * Math.cos(SK.G.player.aim) + (pl.y - x[1]) * Math.sin(SK.G.player.aim); }, x0);
      const want = travel(40, 0.8, 200) - travel(5, 0.8, 200);
      check('beheaded spartan_sandals: người lao tới thực dời ' + net.toFixed(0) + ' px, mô hình 40 đơn vị/s ma sát 0,8 trừ nhịp lùi 5 = ' + want.toFixed(0) + ' px [ĐO]', near(net, want, 10), 'thực ' + net.toFixed(1) + ' · mô hình ' + want.toFixed(1));
      check('beheaded spartan_sandals: hết chiêu thì hồi chiêu đếm từ ' + r.cd + ' s [ĐO]', end.skillCd > 0 && end.skillCd <= r.cd, 'skillCd ' + end.skillCd.toFixed(2));
      // Lần 2: chỉ quái A; đo quãng bay theo đồng hồ mô phỏng G.t. Mô hình 80 đơn vị/s, ma sát 0,92 mỗi bước 0,02 s: sau 3 bước 71 px,
      // sau 6 bước 128 px; cũ (ước lượng 40 đơn vị/s) chỉ được 38 px và 69 px. Hướng bay lệch nhẹ theo tâm ô trúng của quái nên đo
      // theo quãng đường thực, không theo trục làn.
      const L2 = await lane(p, 330);
      await setup(p, L2, 34, null);
      await pressK(p);
      const flew = await p.evaluate(() => new Promise(res => {
        const G = SK.G, A = G.enemies.find(e => e._role === 'A' && e.st !== 'dead'), t00 = performance.now();
        let x0 = null, y0 = null, t0 = null, ended = null; const tr = [];
        const tick = () => {
          if (A._kf && t0 == null) { x0 = A.x; y0 = A.y; t0 = G.t; }
          if (t0 != null) {
            const d = Math.hypot(A.x - x0, A.y - y0);
            tr.push([+(G.t - t0).toFixed(3), Math.round(d)]);
            if (!A._kf && ended == null) ended = { d, t: G.t - t0 };
          }
          if (ended || performance.now() - t00 > 2000) return res({ ended, tr });
          setTimeout(tick, 4);
        };
        tick();
      }));
      const kh = hitsOf(await snap(p), 'kick_hit');
      const at = t => { const s = flew.tr.filter(x => x[0] <= t).pop(); return s ? s[1] : null; };
      const d60 = at(0.06), d120 = at(0.12);
      const m60 = travel(80, 0.92, 3), m120 = travel(80, 0.92, 6);
      check('beheaded spartan_sandals: quái bị đá bay ' + d60 + ' px sau 0,06 s và ' + d120 + ' px sau 0,12 s; mô hình 80 đơn vị/s ma sát 0,92 = ' + m60.toFixed(0) + ' / ' + m120.toFixed(0) + ' px [ĐO kickEnemyForce, kickFriction]',
        d60 != null && d120 != null && d60 >= m60 - 27 && d60 <= m60 + 27 && d120 >= m120 - 30 && d120 <= m120 + 30, JSON.stringify(flew.tr.slice(0, 12)));
      check('beheaded spartan_sandals: quái bị đá dừng lại: trúng tường thì nhận ' + K.hitDmg + ', không thì hết 0,5 s [ĐO Bullet01.destroy_time 0,5]',
        flew.ended && flew.ended.t <= 0.52 && (kh.length === 0 ? flew.ended.t >= 0.46 : kh.every(d => d === 30 || d === 30 * crit)), 'bay ' + (flew.ended && flew.ended.t.toFixed(3)) + ' s · va ' + kh.join(','));
    }
  };
};
