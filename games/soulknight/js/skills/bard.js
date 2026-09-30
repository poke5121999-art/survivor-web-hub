// Kỹ năng Người Hát Rong (c35): melodic_pulse, resonant_symphony. Đồ nghề chung ở SK.skillKit (js/skills.js).
(function () {
  'use strict';
  const SK = window.SK, K = SK.skillKit, S = SK.SKILLS, T = SK.TILE;
  const C = (f, d) => K.CTRL('bard', f, d);
  const fx = (G, n, x, y, o) => (K.hasVfx(n) || SK.prefab(n)) ? K.fx(G, n, x, y, o) : null;
  const ec = K.ec, alive = K.alive;
  const args = (p, id) => String(K.cfg(p, id).args || '').split(';').map(Number);
  const st = p => p._bd || (p._bd = { m: null, sym: null, crit: 0 });
  const upgraded = () => !!(SK.profile && SK.profile.level('bard') >= 5);

  // ---------------------------------------------------------------- Nhịp Âm Luật
  // [ĐO C36Controller.<RhytemState>d__52 + RoleSkill0 + BeatSuccess + ctor] cd 8, args 20;2;20. maxCount 2 KHÔNG phải số lượt
  // (SkillInfo.get_hasMultiCount chỉ đúng với skillType 4/6/9/12; melodic_pulse là loại 0), dùng một lần rồi hồi chiêu 8 s. Pháp trận là con của
  // người hát, đi theo người (Instantiate(proto, transform)). Bấm kỹ năng: chờ BGMOffset 0,3 s rồi đếm nhịp mỗi 60/BPM = 0,5 s;
  // mốc bấm đầu = 4 nhịp sau (2,3 s), mỗi mốc sau cách (_exBeatCount 2 + 4) nhịp = 3 s và chỉ mở khi đếm tới nhịp 8, 14. Bấm:
  // d = giờ - mốc + 0,1; |d| < perfectOffset 0,25 + 0,025 là trúng (cấp +1, tối đa BeatMaxLevel 2, có nâng cấp cấp 5 thì 3);
  // |d| trong [0,275; badOffset 0,4 + 0,025) là trượt nhịp; xa hơn thì bỏ qua. Quá mốc badOffset 0,4 s chưa bấm cũng trượt. Trượt =
  // Skill0End: pháp trận tan ngay, vào hồi chiêu. Tổng (BeatMaxLevel + 1) x 6 nhịp, hết thì pháp trận còn 5 s nữa rồi tan.
  // Mỗi lần trúng: sóng bard_sound_wave 16 sát thương (OnBeatSuccess; 17 khi có một buff hiếm), tâm trên người 1 ô.
  // Buff trong pháp trận theo cấp (BuffImplBardSkill0.AddRoleBuff, switch 0..3 cộng dồn OnBuffLevelUp): cấp 0 có ngay khi bấm.
  const MP = {
    bgm: () => C('BGMOffset', 0.3), beat: () => 60 / C('BPM', 120), ex: () => C('_exBeatCount', 2) + 4,
    first: 4, lead: 0.1, perfect: 0.25, edge: 0.025, bad: 0.4, linger: 5, wave: 16, keep: 3,
    cap: () => (upgraded() ? 3 : 2),
    r: 45.12 * 2, waveR: 48 * 2, cy: 16   // bán kính vùng buff và sóng: collider prefab bard_skill1 / bard_sound_wave nhân scale gốc 2 [ĐO prefab]
  };
  function pulse(G, p, m) {
    m.lvl = Math.min(m.lvl + 1, MP.cap()); m.canBeat = false;
    const x = p.x, y = p.y - MP.cy;
    fx(G, 'bard_sound_wave', x, y, { layer: 'ground', dur: 0.6 });
    for (const e of K.inRadius(G, x, y, MP.waveR)) K.hit(G, p, e, MP.wave, { critChance: 0, repel: 1, fx: 'hit_blue', tag: 'pulse' });
    G.shake = Math.max(G.shake, 2);
    m.ok++;
  }
  // Đồng hồ nhịp: vòng thu nhỏ về mốc, vàng khi còn sớm, xanh trong cửa sổ trúng, đỏ khi sắp trượt.
  function drawMetronome(ctx, p, m) {
    ctx.save();
    const cx = p.x, cy = p.y - 34, k = m.next - m.t;
    if (m.canBeat && !m.endBeat && k > -MP.bad) {
      const d = m.t - m.next + MP.lead, live = Math.abs(d) < MP.perfect + MP.edge, early = d < 0 && !live;
      ctx.strokeStyle = live ? (k < -0.1 ? '#ff9a4a' : '#6bff8a') : early && d > -(MP.bad + MP.edge) ? '#ff5a4a' : '#ffe06a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, live ? 7 : 4 + 6 * Math.min(1, Math.max(0, k)), 0, Math.PI * 2); ctx.stroke();
      SK.text(ctx, '♪', cx, cy - 4, 9, '#fff', 'center', '#000');
    }
    SK.text(ctx, 'Lv' + (m.lvl + 1), cx, p.y - 48, 8, '#bfe3ff', 'center', '#000');
    ctx.restore();
  }
  function miss(G, p) { p.skillT = 0; }   // core gọi SK.endSkill ngay sau đó
  S.melodic_pulse = {
    start(G, p) {
      K.layer(G);
      const start = MP.bgm(), m = st(p).m = { t: 0, lvl: 0, ok: 0, canBeat: true, next: start + MP.first * MP.beat(), count: 0, total: (MP.cap() + 1) * MP.ex(), endBeat: false, endT: 0, start };
      p.skillT = 1e4;
      m.fx = K.ripFx(G, 'bard_skill1', p.x, p.y, { ground: true, follow: p, dur: 60, alpha: 0.45 });
      G.props.push({ x: p.x, y: p.y + 1, update(G2, q) { if (st(p).m !== m) q.gone = true; q.x = p.x; q.y = p.y + 1; }, draw(ctx) { drawMetronome(ctx, p, m); } });
    },
    press(G, p) {
      const m = st(p).m; if (!m || !m.canBeat) return;
      const d = m.t - m.next + MP.lead;
      if (Math.abs(d) < MP.perfect + MP.edge) pulse(G, p, m);
      else if (Math.abs(d) < MP.bad + MP.edge && !m.endBeat) miss(G, p);
    },
    update(G, p, dt) {
      const m = st(p).m; if (!m) return;
      m.t += dt;
      while (m.t >= m.start + MP.beat() * (m.count + 1) && !m.endBeat) {
        m.count++;
        if (m.count % MP.ex() === 2 && m.count >= 5) { m.next += MP.ex() * MP.beat(); m.canBeat = true; }
        if (m.count >= m.total) { m.endBeat = true; m.endT = m.t; }
      }
      if (m.canBeat && !m.endBeat && m.t - m.next > MP.bad) { miss(G, p); return; }
      if (m.endBeat && m.t - m.endT > MP.linger) p.skillT = 0;
    },
    end(G, p) { const m = st(p).m; if (m) { K.stopFx(m.fx); st(p).m = null; } }
  };
  // Buff theo cấp cho người chơi (luôn nằm trong pháp trận vì nó đi theo người).
  K.timers.bard = (G, p, dt) => {
    if (p.hero !== 'bard') return;
    const s = st(p), m = s.m, a = args(p, 'melodic_pulse');
    const lvl = m ? m.lvl : -1;
    s.lvl = lvl;
    K.setMul(p, 'rateMul', 'bard_pulse', lvl >= 0 ? 1 + a[0] / 100 : 1);
    if (lvl >= 1 && !s.critOn) { s.critOn = true; p.crit += a[2]; }
    if (lvl < 1 && s.critOn) { s.critOn = false; p.crit -= a[2]; }
  };
  // Cấp 2 (chỉ số 1): +2 sát thương mỗi viên; cấp 3 (chỉ số 2): hoàn 1 năng lượng mỗi phát.
  SK.on('fire', (G, p, w) => {
    if (p.hero !== 'bard') return;
    const s = st(p), a = args(p, 'melodic_pulse');
    for (const b of G.bullets) if (b.side === 'p' && !b._bd) { b._bd = true; if (s.lvl >= 1) b.dmg += a[1]; }
    if (s.lvl >= 2) p.energy = Math.min(p.energyMax, p.energy + Math.min(1, (w && w.def && w.def.cost) || 0));
  });
  // ---------------------------------------------------------------- Khúc Nhạc Cộng Hưởng
  // [ĐO C36Controller.RoleSkill1 + BardSkill1LinkCircle + BardSkill1BuffCircle + BuffBardSkill1] cd 8, dur 5, args 3 (skillType 1: không có số lượt). Nhạc cụ dựng tại
  // người + hướng nhìn 1 ô + lên 1 ô (CreateLinkCircle), tồn tại dur 5 s. BardSkill1LinkCircle.Update cứ checkInterval 0,05 s bỏ quái
  // chết khỏi tập nối rồi FindTarget bù tới LinkMaxCount 3 quái gần nhất trong linkRange 10 ô. Đòn ĐẠN của người chơi trúng quái nối
  // (PlayerBulletHitEnemyEvent) chia cho mọi quái nối khác trunc(sát thương x %/100), tối thiểu 1: % = linkSingleExtraDamagePercent 100
  // khi đang nối đúng 2 quái, còn lại linkDamagePercent 50. Vòng buff (BuffStart, một lần, quét linkBuffRange 5 ô quanh người): tối đa giáp
  // +linkBuffExArmor 2 và hồi đầy 2, chạy +10%, tốc đánh +20%, năng lượng +1 mỗi 0,25 s, kéo dài linkBuffDuration 5 s. Sóng âm xoá đạn
  // địch trong vùng nối. Nâng cấp (nối thêm sát thương khi quái chết) chưa làm; thú cưng chưa có.
  const RS = {
    range: () => C('linkRange', 10) * T, buffT: () => C('linkBuffDuration', 5), check: 0.05,
    armor: () => C('linkBuffExArmor', 2), move: () => 1 + C('linkBuffMoveSpeed', 10) / 100, rate: () => 1 + C('linkBuffAttackSpeed', 20) / 100,
    energy: () => C('linkBuffEnergyValue', 1), every: () => C('linkBuffEnergyInterval', 0.25),
    pct: n => (n === 2 ? C('linkSingleExtraDamagePercent', 100) : C('linkDamagePercent', 50)) / 100,
    boxW: 24, boxH: 40,   // BoxCollider2D của "center" trong prefab bard_skill1_link_circle: 24 x 40 px [ĐO prefab]
    stakeShare: 0.5       // đòn vào nhạc cụ chia cho quái nối, giảm 50% khi nối từ 2 quái [WIKI]
  };
  function relink(G, s, n) {
    s.links = s.links.filter(alive);
    if (s.links.length >= n) return;
    const near = G.enemies.filter(e => alive(e) && K.inRoom(G, e) && s.links.indexOf(e) < 0 && Math.hypot(e.x - s.x, e.y - s.y) < RS.range())
      .sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y));
    for (const e of near) { if (s.links.length >= n) break; s.links.push(e); }
  }
  S.resonant_symphony = {
    start(G, p) {
      K.layer(G);
      const n = args(p, 'resonant_symphony')[0] || C('linkMaxCount', 3);
      const s = st(p).sym = { x: p.x + p.face * T, y: p.y - T, t: 0, links: [], n, chk: 0, tick: 0 };
      relink(G, s, n);
      p.skillT = K.cfg(p, 'resonant_symphony').dur || 5;
      s.fx = fx(G, 'bard_skill1_link_circle', s.x, s.y, { layer: 'ground', dur: p.skillT });
      s.fxB = fx(G, 'bard_skill1_buff_circle', p.x, p.y, { follow: p, layer: 'ground', dur: 1 });
      // Sóng âm xoá đạn địch trong vùng.
      for (const b of G.bullets) if (b.side === 'e' && !b.dead && Math.hypot(b.x - s.x, b.y - s.y) < RS.range()) b.dead = true;
      // Buff cho người chơi (một lần, kéo dài linkBuffDuration): giáp tối đa tạm thời + hồi đầy phần đó.
      s.ex = RS.armor(); p.armorMax += s.ex; p.armor = Math.min(p.armorMax, p.armor + s.ex);
      K.setMul(p, 'moveMul', 'bard_sym', RS.move()); K.setMul(p, 'rateMul', 'bard_sym', RS.rate());
      G.props.push({
        x: s.x, y: s.y, sym: s,
        update(G2, q, dt) {
          if (st(p).sym !== s) { q.gone = true; return; }
          for (const b of G2.bullets) {   // nhạc cụ nhận đòn của người chơi rồi chia cho quái nối
            if (b.side !== 'p' || b.dead || Math.abs(b.x - s.x) > RS.boxW / 2 + (b.r || 0) || Math.abs(b.y - s.y) > RS.boxH / 2 + (b.r || 0)) continue;
            b.dead = true;
            const d = Math.max(1, Math.round(b.dmg * (s.links.length >= 2 ? RS.stakeShare : 1)));
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
      s.t += dt; s.tick += dt; s.chk += dt;
      if (s.chk >= RS.check) { s.chk = 0; relink(G, s, s.n); }
      while (s.tick >= RS.every()) { s.tick -= RS.every(); p.energy = Math.min(p.energyMax, p.energy + RS.energy()); }
    },
    end(G, p) {
      const s = st(p).sym; if (!s) return;
      st(p).sym = null;
      K.stopFx(s.fx);
      K.setMul(p, 'moveMul', 'bard_sym', 1); K.setMul(p, 'rateMul', 'bard_sym', 1);
      p.armorMax -= s.ex; p.armor = Math.min(p.armor, p.armorMax);
    }
  };
  // Quái nối cộng hưởng: mỗi đòn đạn của người chơi trúng một quái nối chia cho các quái nối khác.
  SK.on('enemyHit', (G, e, dmg) => {
    const p = G.player, s = p && p._bd && p._bd.sym;
    if (!s || !G._hitBullet || G._skHit === 'link' || s.links.indexOf(e) < 0) return;
    const d = Math.max(1, Math.trunc(dmg * RS.pct(s.links.length)));
    for (const o of s.links) if (o !== e && alive(o)) K.hit(G, p, o, d, { noMul: true, tag: 'link' });
  });
})();
