// Kỹ năng Người Hát Rong (c35): melodic_pulse, resonant_symphony. Đồ nghề chung ở SK.skillKit (js/skills.js).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, T = SK.TILE;
  const C = (f, d) => K.CTRL('bard', f, d);
  const fx = (G, n, x, y, o) => (K.hasVfx(n) || SK.prefab(n)) ? K.fx(G, n, x, y, o) : null;
  const ec = K.ec, alive = K.alive;
  const args = (p, id) => String(K.cfg(p, id).args || '').split(';').map(Number);
  const st = p => p._bd || (p._bd = { m: null, sym: null, crit: 0 });

  // ---------------------------------------------------------------- Nhịp Âm Luật
  // [ĐO config + WIKI] cd 8, dur 2, args 20;2;20. Pháp trận bán kính 9 ô quanh chỗ tung; nốt nhịp đầu hiện sau 0,8 s, các nốt sau
  // sau 0,5 s kể từ nhát đánh trúng; bấm kỹ năng trong 0,1–0,8 s sau khi nốt hiện là trúng nhịp: pháp trận phóng một đợt sóng
  // 16 sát thương lên mọi quái trong vùng và lên cấp. Cấp 1: tốc đánh +20%; cấp 2: tấn công +2, bạo kích +20%; cấp 3: vũ khí
  // đỡ tốn 1 năng lượng (tác dụng cho người chơi đứng trong vùng). Trượt nhịp hoặc đủ cấp thì pháp trận còn dur 2 s rồi tan.
  // Cấp 4 và choáng của nâng cấp chưa làm (cần nâng cấp nhân vật); đồng minh khác ngoài người chơi chưa nhận buff.
  const MP = {
    r: 9 * T, art: 24, dmg: 16, first: 0.8, next: 0.5, early: 0.1, late: 0.8, maxLvl: 3,   // [WIKI]
    lingerFor: p => K.cfg(p, 'melodic_pulse').dur || 2
  };
  function noteReset(m, delay) { m.note = { t: 0, at: delay }; }
  function pulse(G, p, m) {
    m.lvl++;
    fx(G, 'bard_sound_wave', m.x, m.y - 6, { layer: 'ground', dur: 0.6 });
    for (const e of K.inRadius(G, m.x, m.y - 6, MP.r)) K.hit(G, p, e, MP.dmg, { critChance: 0, repel: 1, fx: 'hit_blue', tag: 'pulse' });
    G.shake = Math.max(G.shake, 2);
    if (m.lvl >= MP.maxLvl) finish(p, m); else noteReset(m, MP.next);
  }
  function finish(p, m) { m.note = null; m.linger = MP.lingerFor(p); p.skillT = m.linger; }
  // Đồng hồ nhịp: vòng thu nhỏ tới lúc nốt hiện, vàng trong 0,1 s đầu (còn sớm), xanh khi bấm được, đỏ khi sắp trượt.
  function drawMetronome(ctx, m) {
    ctx.save();
    if (m.note) {
      const n = m.note, live = n.t >= n.at, cx = m.x, cy = m.y - 34;
      const early = n.t < n.at + MP.early, late = n.t > n.at + MP.late - 0.2;
      ctx.globalAlpha = live ? 1 : 0.35;
      ctx.strokeStyle = !live ? '#9ab' : early ? '#ffe06a' : late ? '#ff5a4a' : '#6bff8a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, live ? 7 : 4 + 6 * (1 - n.t / n.at), 0, Math.PI * 2); ctx.stroke();
      SK.text(ctx, '♪', cx, cy - 4, 9, '#fff', 'center', '#000');
    }
    SK.text(ctx, 'Lv' + m.lvl, m.x, m.y - 48, 8, '#bfe3ff', 'center', '#000');
    ctx.restore();
  }
  S.melodic_pulse = {
    start(G, p) {
      K.layer(G);
      K.charges(p, 'melodic_pulse'); K.useCharge(p, 'melodic_pulse');
      const m = st(p).m = { x: p.x, y: p.y, lvl: 0, note: null, linger: 0, hitT: 0 };
      noteReset(m, MP.first);
      p.skillT = 60;
      m.fx = K.ripFx(G, 'bard_skill1', m.x, m.y, { ground: true, dur: 60, scale: MP.r / MP.art, alpha: 0.45 });
      G.props.push({ x: m.x, y: m.y + 1, update(G2, q) { if (st(p).m !== m) q.gone = true; }, draw(ctx) { drawMetronome(ctx, m); } });
    },
    press(G, p) {
      const m = st(p).m; if (!m || !m.note) return;
      const n = m.note;
      if (n.t < n.at + MP.early) return;                 // chưa tới nhịp: bỏ qua, không phạt
      if (n.t <= n.at + MP.late) pulse(G, p, m);
    },
    update(G, p, dt) {
      const m = st(p).m; if (!m) return;
      if (m.note) {
        m.note.t += dt;
        p.skillT = Math.max(p.skillT, 1);
        if (m.note.t > m.note.at + MP.late) finish(p, m);   // trượt nhịp
      }
    },
    end(G, p) { const m = st(p).m; if (m) { K.stopFx(m.fx); st(p).m = null; } }
  };
  // Buff theo cấp cho người chơi đứng trong pháp trận.
  K.timers.bard = (G, p, dt) => {
    if (p.hero !== 'bard') return;
    const s = st(p), m = s.m, a = args(p, 'melodic_pulse');
    const lvl = m && Math.hypot(p.x - m.x, p.y - m.y) < MP.r ? m.lvl : 0;
    s.lvl = lvl;
    K.setMul(p, 'rateMul', 'bard_pulse', lvl >= 1 ? 1 + a[0] / 100 : 1);
    if (lvl >= 2 && !s.critOn) { s.critOn = true; p.crit += a[2]; }
    if (lvl < 2 && s.critOn) { s.critOn = false; p.crit -= a[2]; }
  };
  // Cấp 2: +2 sát thương mỗi viên; cấp 3: hoàn 1 năng lượng mỗi phát.
  SK.on('fire', (G, p, w) => {
    if (p.hero !== 'bard') return;
    const s = st(p), a = args(p, 'melodic_pulse');
    for (const b of G.bullets) if (b.side === 'p' && !b._bd) { b._bd = true; if (s.lvl >= 2) b.dmg += a[1]; }
    if (s.lvl >= 3) p.energy = Math.min(p.energyMax, p.energy + Math.min(1, (w && w.def && w.def.cost) || 0));
  });
  // ---------------------------------------------------------------- Khúc Nhạc Cộng Hưởng
  // [ĐO C36Controller + config] cd 8, dur 5, args 3. Nhạc cụ dựng tại chỗ trong dur 5 s, nối tối đa 3 (args) quái trong
  // linkRange 10 ô; quái nối chịu linkDamagePercent 50% sát thương của quái nối khác. Sóng âm xoá đạn địch trong vùng; người
  // chơi nhận buff linkBuffDuration 5 s: giáp tạm +linkBuffExArmor 2, chạy +linkBuffMoveSpeed 10%, tốc đánh +linkBuffAttackSpeed
  // 20%, năng lượng +linkBuffEnergyValue 1 mỗi linkBuffEnergyInterval 0,25 s. Đánh trúng nhạc cụ thì chia sát thương cho quái nối
  // (giảm 50% khi nối từ 2 quái) [WIKI]. Nâng cấp (quái nối chết: quái còn lại +3 sát thương) chưa làm; thú cưng chưa có.
  const RS = {
    range: () => C('linkRange', 10) * T, pct: () => C('linkDamagePercent', 50) / 100, buffT: () => C('linkBuffDuration', 5),
    armor: () => C('linkBuffExArmor', 2), move: () => 1 + C('linkBuffMoveSpeed', 10) / 100, rate: () => 1 + C('linkBuffAttackSpeed', 20) / 100,
    energy: () => C('linkBuffEnergyValue', 1), every: () => C('linkBuffEnergyInterval', 0.25), hitR: 10
  };
  S.resonant_symphony = {
    start(G, p) {
      K.layer(G);
      K.charges(p, 'resonant_symphony'); K.useCharge(p, 'resonant_symphony');
      const n = args(p, 'resonant_symphony')[0] || C('linkMaxCount', 3);
      const links = G.enemies.filter(e => alive(e) && K.inRoom(G, e) && Math.hypot(e.x - p.x, e.y - p.y) < RS.range())
        .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)).slice(0, n);
      const s = st(p).sym = { x: p.x + p.face * 16, y: p.y - 2, t: 0, links, tick: 0 };
      p.skillT = RS.buffT();
      s.fx = fx(G, 'bard_skill1_link_circle', s.x, s.y, { layer: 'ground', dur: p.skillT });
      s.fxB = fx(G, 'bard_skill1_buff_circle', p.x, p.y, { follow: p, layer: 'ground', dur: 1 });
      // Sóng âm xoá đạn địch trong vùng.
      for (const b of G.bullets) if (b.side === 'e' && !b.dead && Math.hypot(b.x - s.x, b.y - s.y) < RS.range()) b.dead = true;
      // Buff cho người chơi.
      p.armor = Math.min(p.armorMax + RS.armor(), p.armor + RS.armor());
      K.setMul(p, 'moveMul', 'bard_sym', RS.move()); K.setMul(p, 'rateMul', 'bard_sym', RS.rate());
      G.props.push({
        x: s.x, y: s.y, sym: s,
        update(G2, q, dt) {
          if (st(p).sym !== s) { q.gone = true; return; }
          s.links = s.links.filter(alive);
          for (const b of G2.bullets) {   // nhạc cụ nhận đòn của người chơi rồi chia cho quái nối
            if (b.side !== 'p' || b.dead || Math.abs(b.x - s.x) > RS.hitR || Math.abs(b.y - (s.y - 8)) > RS.hitR) continue;
            b.dead = true;
            const d = Math.max(1, Math.round(b.dmg * (s.links.length >= 2 ? 0.5 : 1)));
            for (const e of s.links) K.hit(G2, p, e, d, { noMul: true, tag: 'link' });
          }
        },
        draw(ctx) {
          const t = s.t;
          ctx.save();
          for (const e of s.links) {
            if (!alive(e)) continue;
            const [x, y] = ec(e);
            ctx.strokeStyle = 'rgba(255,214,90,' + (0.5 + 0.3 * Math.sin(t * 8)) + ')'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(s.x, s.y - 12);
            const N = 8;
            for (let i = 1; i <= N; i++) { const k = i / N, w = Math.sin(k * Math.PI * 4 + t * 12) * 3 * Math.sin(k * Math.PI); ctx.lineTo(s.x + (x - s.x) * k, s.y - 12 + (y - (s.y - 12)) * k + w); }
            ctx.stroke();
          }
          SK.text(ctx, '♫', s.x, s.y - 12, 14, '#ffe9a0', 'center', '#000');
          ctx.restore();
        }
      });
    },
    update(G, p, dt) {
      const s = st(p).sym; if (!s) return;
      s.t += dt; s.tick += dt;
      while (s.tick >= RS.every()) { s.tick -= RS.every(); p.energy = Math.min(p.energyMax, p.energy + RS.energy()); }
    },
    end(G, p) {
      const s = st(p).sym; if (!s) return;
      st(p).sym = null;
      K.stopFx(s.fx);
      K.setMul(p, 'moveMul', 'bard_sym', 1); K.setMul(p, 'rateMul', 'bard_sym', 1);
      p.armor = Math.min(p.armor, p.armorMax);
    }
  };
  // Quái nối cộng hưởng: nhận linkDamagePercent% sát thương của mỗi quái nối khác vừa bị đánh.
  SK.on('enemyHit', (G, e, dmg) => {
    const p = G.player, s = p && p._bd && p._bd.sym;
    if (!s || G._skHit === 'link' || s.links.indexOf(e) < 0) return;
    const d = Math.max(1, Math.round(dmg * RS.pct()));
    for (const o of s.links) if (o !== e && alive(o)) K.hit(G, p, o, d, { noMul: true, tag: 'link' });
  });
})();
