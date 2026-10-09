// Trùm cuối ải x-5 dựng từ dữ liệu thật Soul Knight 8.6 (data/sk-bosses86.js, sinh bởi tools/bosses/build_bosses86.py):
// cây prefab + Animator thật (đường cong Transform/sprite/bật-tắt, sự kiện InAtkNN trong clip), đạn thật (prefab + tham số
// MonoBehaviour), hiệu ứng SK.vfx, tiếng SK_AUDIO, màn giới thiệu BossInfo + thanh máu thật.
// Logic đòn nằm trong mã IL2CPP (chưa dịch được hết): đếm/góc/tốc nào không có trong dữ liệu thì lấy [WIKI] hoặc [ƯỚC LƯỢNG].
// Mỗi trùm chạy máy trạng thái trong một prop "sàn đấu" (G.props): Giun Cát lặn đất phải để e.st = 'spawn'
// (không trúng đạn) mà core bỏ qua SK.AI ở trạng thái đó.
(function () {
  'use strict';
  const SK = window.SK, D = SK.D, DS = SK.DS, W = SK.world, U = SK.PPU, R = DS.rules;
  const B86 = window.SK_BOSSES86;
  const AT = window.SK_ATLAS;
  const TAU = Math.PI * 2, DEG = Math.PI / 180;
  SK.bossDebug = { force: null, next: null, hold: false };
  SK.bossHud = { visible: false, intro: false, name: null, hp: 0, hpMax: 0 };
  if (!B86) { SK.warnOnce && SK.warnOnce('boss86', 'data/sk-bosses86.js chưa nạp: không có trùm'); SK.bossWaves = () => []; return; }

  // [ĐO] máu trùm = enemies.Hp × 1.2: wiki ghi 480/600/720/960 cho Hp 400/500/600/800 (hệ số trùm chế độ thường).
  const HP_FACTOR = 1.2;
  const ENRAGE_AT = 0.5;      // [WIKI] nửa máu thì nổi giận (angry_clip) — ngưỡng nằm trong mã, chưa đọc được
  const INTRO_LEN = 3.0;      // [ĐO clip show_boss_info: 3 s, EndAnim ở 2.967 s]
  const SUBSPECIES_RATE = 30; // [ĐO BossCreator.GetSubspeciesBossPrefab: RGRandom.Range(0,100) < 30 ở chế độ thường]
  const dmgOf = x => Math.max(1, Math.round(x * R.enemyAtkScale));   // cùng hệ số quái thường của core
  const angTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
  const smooth = k => { k = SK.clamp(k, 0, 1); return k * k * (3 - 2 * k); };

  // ---------------------------------------------------------------- sprite: tên Unity -> khung atlas
  const FR = {};
  (function () {
    const ex = (D.extra && D.extra.sprites) || {};
    for (const k of B86.spriteKeys || []) {
      for (const f of ex[k] || []) {
        const n = f.split('~')[0];
        if (!FR[n] || f.indexOf('~') < 0) FR[n] = f;
      }
    }
    // Lever gộp sprite trùng điểm ảnh + điểm neo làm một khung: tra qua nhóm trùng.
    for (const [n, g] of Object.entries(B86.alias || {})) if (!FR[n]) { const h = g.find(x => FR[x]); if (h) FR[n] = FR[h]; }
  })();
  const frameOf = n => (n && (FR[n] || (AT.f[n] ? n : null))) || null;
  const uiFrame = n => { const k = D.extra && D.extra.png && D.extra.png['bossui_' + n]; return k ? SK.animFrame(k, 0) : null; };
  // Quad màu trơn blend cộng (quầng sáng) — vẽ thường thì thành mảng trắng; bỏ.
  const GLOW = new Set(['texiao_01', 'texture_c4', 'texture_c2', 'texture_c5', 'light_01']);

  // ---------------------------------------------------------------- đường cong + rig (Animator thu nhỏ)
  // Đoạn [t, v] là hằng; [t, c0, c1, c2, c3] là đa thức ((c0·d + c1)·d + c2)·d + c3 với d = t − t0 (dạng streamed của Unity).
  function cval(s, t) {
    let i = s.length - 1;
    while (i > 0 && s[i][0] > t) i--;
    const g = s[i];
    if (g.length === 2) return g[1];
    const d = t - g[0];
    return ((g[1] * d + g[2]) * d + g[3]) * d + g[4];
  }

  function rigNew(def) {
    return {
      def, pose: null, ov: {},
      anims: def.anims.map(a => ({ node: a.node, layers: a.layers.map(L => ({ L, st: L.def && L.states[L.def] ? L.def : null, t: 0 })) }))
    };
  }
  const nodeIdx = (def, name) => def.nodes.findIndex(n => n.n === name);
  // Chạy state `name` trên Animator đầu tiên có nó (hoặc Animator gắn ở nút `at`).
  function rigPlay(Rg, name, at) {
    for (const a of Rg.anims) {
      if (at != null && a.node !== at) continue;
      for (const ly of a.layers) if (ly.L.states[name]) { ly.st = name; ly.t = 0; return true; }
    }
    return false;
  }
  function rigState(Rg, at) { const a = at == null ? Rg.anims[0] : Rg.anims.find(x => x.node === at); return a && a.layers[0].st; }
  function rigTime(Rg) { return Rg.anims[0] ? Rg.anims[0].layers[0].t : 0; }
  // Sự kiện clip nổ trong [t0, t1); hết một vòng clip thì chuyển sang state `next` (exit time, như Unity — cả clip lặp).
  function rigTick(Rg, dt, onEv) {
    for (const a of Rg.anims) {
      for (const ly of a.layers) {
        if (!ly.st) continue;
        const s = ly.L.states[ly.st], st = ly.st;
        const t0 = ly.t, t1 = t0 + dt * (s.spd || 1);
        ly.t = t1;
        if (s.ev && onEv) {
          for (const ev of s.ev) {
            if (s.loop && s.len > 0) {
              for (let k = Math.floor(t0 / s.len); k <= Math.floor(t1 / s.len); k++) {
                const at = k * s.len + ev[0];
                if (at >= t0 && at < t1) onEv(ev[1], ev[2], a.node, st);
              }
            } else if (ev[0] >= t0 && ev[0] < t1) onEv(ev[1], ev[2], a.node, st);
          }
        }
        if (ly.st === st && ly.t >= s.len && s.next && ly.L.states[s.next]) { ly.t -= s.len; ly.st = s.next; }
      }
    }
  }
  // Tư thế hiện tại: giá trị gốc của prefab rồi đè đường cong của state đang chạy (Unity "write defaults").
  function rigPose(Rg) {
    const N = Rg.def.nodes;
    const P = Rg.pose || (Rg.pose = N.map(() => ({ m: [1, 0, 0, 1, 0, 0] })));
    for (let i = 0; i < N.length; i++) {
      const d = N[i], p = P[i];
      p.x = d.x || 0; p.y = d.y || 0; p.r = d.r || 0; p.sx = d.sx != null ? d.sx : 1; p.sy = d.sy != null ? d.sy : 1;
      p.on = !d.off; p.en = d.en !== 0; p.f = d.f || null; p.a = d.c ? d.c[3] : 1; p.qz = null; p.qw = null; p.col = null;
    }
    for (const a of Rg.anims) {
      for (const ly of a.layers) {
        if (!ly.st) continue;
        const s = ly.L.states[ly.st];
        const t = s.loop && s.len > 0 ? ly.t % s.len : Math.min(ly.t, s.len);
        for (const c of s.cv) {
          const p = P[c.n], v = cval(c.s, t);
          switch (c.k) {
            case 'px': p.x = v; break;
            case 'py': p.y = v; break;
            case 'ez': p.r = v; break;
            case 'qz': p.qz = v; break;
            case 'qw': p.qw = v; break;
            case 'sx': p.sx = v; break;
            case 'sy': p.sy = v; break;
            case 'on': p.on = v > 0.5; break;
            case 'en': p.en = v > 0.5; break;
            case 'ca': p.a = v; break;
            case 'spr': p.f = v; break;
            case 'col': p.col = v > 0.5; break;
          }
        }
      }
    }
    for (let i = 0; i < N.length; i++) {
      const p = P[i], o = Rg.ov[i];
      if (p.qz != null || p.qw != null) {
        const qz = p.qz != null ? p.qz : Math.sqrt(Math.max(0, 1 - p.qw * p.qw)), qw = p.qw != null ? p.qw : Math.sqrt(Math.max(0, 1 - qz * qz));
        p.r = 2 * Math.atan2(qz, qw) / DEG;
      }
      if (o) {
        if (o.r != null) p.r += o.r;
        if (o.f !== undefined) p.f = o.f;
        if (o.on != null) p.on = o.on;
        if (o.x != null) p.x += o.x;
        if (o.sx != null) { p.sx *= o.sx; p.sy *= o.sy; }
      }
      const c = Math.cos(p.r * DEG), s = Math.sin(p.r * DEG);
      const l = [c * p.sx, s * p.sx, -s * p.sy, c * p.sy, p.x, p.y];
      const pi = N[i].p;
      if (pi < 0) { p.m = l; p.vis = p.on; continue; }
      const q = P[pi].m;
      p.m = [q[0] * l[0] + q[2] * l[1], q[1] * l[0] + q[3] * l[1], q[0] * l[2] + q[2] * l[3], q[1] * l[2] + q[3] * l[3],
        q[0] * l[4] + q[2] * l[5] + q[4], q[1] * l[4] + q[3] * l[5] + q[5]];
      p.vis = p.on && P[pi].vis;
    }
    return P;
  }
  // Điểm (px thế giới) của gốc nút `i` khi rig đặt ở (x, y), fl = ±1 (lật ngang).
  function rigPoint(Rg, i, x, y, fl) {
    const m = rigPose(Rg)[i].m;
    return [x + fl * U * m[4], y - U * m[5]];
  }
  // Hướng trục +X của nút `i` trên màn hình (radian).
  function rigAng(Rg, i, fl) {
    const m = rigPose(Rg)[i].m;
    return Math.atan2(-m[1], fl * m[0]);
  }
  function rigDraw(ctx, Rg, x, y, o) {
    o = o || {};
    const P = rigPose(Rg), N = Rg.def.nodes, fl = o.flip ? -1 : 1;
    const list = [];
    for (let i = 0; i < N.length; i++) {
      const p = P[i];
      if (!p.vis || !p.en || !p.f || p.a <= 0.01 || GLOW.has(p.f) || (o.skip && o.skip(N[i], i))) continue;
      list.push(i);
    }
    list.sort((a, b) => ((N[a].o || 0) - (N[b].o || 0)) || a - b);
    const pages = o.pages || SK.pages;
    for (const i of list) {
      const p = P[i], fn = frameOf(p.f);
      const f = fn && AT.f[fn];
      if (!f) continue;
      const img = pages[f[0]];
      if (!img) continue;
      const m = p.m;
      // màn = [16·fl, 0, 0, −16, x, y] ∘ nút ∘ ảnh [1/16, 0, 0, −1/16, −ax/16, ay/16]
      const a = fl * m[0], b = -m[1], c = -fl * m[2], d = m[3];
      let e = x + fl * U * m[4] - (a * f[5]) - (c * f[6]), g = y - U * m[5] - (b * f[5]) - (d * f[6]);
      const alpha = (o.alpha != null ? o.alpha : 1) * p.a;
      ctx.save();
      if (alpha < 1) ctx.globalAlpha *= alpha;
      if (a === 1 && d === 1 && !b && !c) { e = Math.round(e); g = Math.round(g); }
      ctx.transform(a, b, c, d, e, g);
      ctx.drawImage(img, f[1], f[2], f[3], f[4], 0, 0, f[3], f[4]);
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------- tiếng
  const clipName = v => typeof v === 'string' ? v.replace(/^AudioClip:/, '').replace(/@.*$/, '') : null;
  function sfx(G, v) {
    const n = clipName(v), A = window.SK_AUDIO;
    if (n && SK.sfx && A && A.clips && A.clips[n]) SK.sfx.play(n);
  }

  // ---------------------------------------------------------------- đạn thật
  const BUL = B86.bullets;
  const BUL_INFO = {};
  function bulInfo(name) {
    if (BUL_INFO[name]) return BUL_INFO[name];
    const b = BUL[name];
    if (!b) return null;
    const N = b.rig.nodes, mbs = b.mbs || {};
    const main = ['Bullet01', 'Bullet02', 'Bullet04', 'Bullet05', 'RGSBullet01', 'RGBDelayDivision', 'BulletFollow'].map(k => mbs[k] && Object.assign({ cls: k }, mbs[k])).find(Boolean) || {};
    const trig = ['RGBulletTrigger', 'RGBTDivision', 'RGBTRebound', 'RGBTEnergy', 'RGBulletBuffTrigger', 'RGEnergyBallTrigger'].map(k => mbs[k] && Object.assign({ cls: k }, mbs[k])).find(Boolean) || {};
    // Các viên con có collider (đạn đội hình: bullet_e_5/9/10 là 12–16 viên xếp hình).
    const parts = [];
    N.forEach((n, i) => {
      if (!n.col || i === 0 && N.length > 1 && !n.f) return;
      let x = 0, y = 0, j = i;
      while (j > 0) { x += N[j].x || 0; y += N[j].y || 0; j = N[j].p; }
      const box = n.col.box || n.col.cir;
      const sz = box.size ? Math.max(box.size[0], box.size[1]) : box.r * 2;
      const sp = n.f && !GLOW.has(n.f) ? n.f : (N.find((m, k) => k > i && m.f && !GLOW.has(m.f) && m.p === i) || {}).f;
      parts.push({ x, y, r: Math.max(2, sz * U / 2), f: sp || null });
    });
    if (!parts.length) {
      const sp = N.find(n => n.f && !GLOW.has(n.f));
      parts.push({ x: 0, y: 0, r: 3, f: sp ? sp.f : null });
    }
    BUL_INFO[name] = { name, main, trig, parts, mbs, vfx: window.SK_VFX && SK_VFX.effects[name] && SK_VFX.effects[name].cat === 'trail' ? name : null };
    return BUL_INFO[name];
  }
  const goRef = v => typeof v === 'string' ? v.replace(/^GameObject:/, '') : null;

  // o: {spd (đơn vị/giây), dmg (số trước hệ số), life, h (độ cao trên sàn, px), bounce, decel, onEnd, tick, spin, noKids,
  //     home: {interval, delay, limit, turn} — mặc định lấy từ Bullet02 của prefab}
  function fire(G, e, name, x, y, ang, o) {
    o = o || {};
    const I = bulInfo(name);
    if (!I) { SK.warnOnce && SK.warnOnce('bul' + name, 'boss bullet ' + name + ' missing'); return null; }
    const mul = e && e.def && e.enraged && e.def.enrageSpd ? e.def.enrageSpd : 1;
    const spdU = (o.spd != null ? o.spd : (I.main.speed || 10)) * mul;
    const life = o.life || I.main.destroy_time || 5;
    const pp = I.parts[0];
    const b = {
      side: 'e', kind: 'arrow', x, y, h: o.h != null ? o.h : 12, vx: Math.cos(ang) * spdU * U, vy: Math.sin(ang) * spdU * U,
      ang, dmg: dmgOf(o.dmg || 2), repel: 0, r: o.r || Math.min(6, pp.r), life, age: 0, px: x, py: y,
      sprite: frameOf(pp.f) || 'bullet_29', boss: e, pname: name, dir: ang
    };
    // Bullet01.rotate_angle: độ mỗi FixedUpdate (50/giây) [ƯỚC LƯỢNG đơn vị]
    const rot = I.main.cls === 'BulletFollow' ? 0 : (I.main.rotate_angle || 0);
    if (o.spin != null) b.spin = o.spin; else if (rot) b.spin = rot * 50 * DEG;
    if (I.main.cls === 'Bullet04' && !o.noDecel) b.decel = { rate: I.main.rate, k: I.main.speed_value, min: I.main.min_speed * U };
    if (I.main.cls === 'Bullet06' && spdU > 0) {
      // Bullet06: lượn zigzag biên độ offset_y, tần số frequency [ĐO]
      const amp = (I.main.offset_y || 0.6) * U, fq = I.main.frequency || 2, c = Math.cos(ang), s = Math.sin(ang), sp = spdU * U;
      b.tick = (G2, bb) => { const w = amp * TAU * fq * Math.cos(TAU * fq * bb.age); bb.vx = c * sp - s * w; bb.vy = s * sp + c * w; };
    }
    const hm = o.home || (I.main.cls === 'Bullet02' && { interval: I.main.interval, delay: I.main.delay_time, limit: I.main.has_limit ? I.main.limit_time : 1e9, turn: I.main.angle_speed });
    if (hm) {
      // Bullet02: sau delay_time, mỗi interval giây xoay tối đa angle_speed độ về mục tiêu, tới limit_time [ĐO trường; ƯỚC LƯỢNG cách hiểu]
      let nx = (hm.delay || 0) + (hm.interval || 0.1);
      b.tick = (G2, bb) => {
        while (bb.age >= nx && bb.age <= (hm.limit || 15)) {
          nx += hm.interval || 0.1;
          const want = aimAt(G2, bb.x, bb.y + bb.h - 7), sp = Math.hypot(bb.vx, bb.vy);
          let d = want - bb.dir;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          bb.dir += SK.clamp(d, -(hm.turn || 15) * DEG, (hm.turn || 15) * DEG);
          bb.vx = Math.cos(bb.dir) * sp; bb.vy = Math.sin(bb.dir) * sp; bb.ang = bb.dir;
        }
      };
    }
    if (I.trig.cls === 'RGBTRebound') b.bounce = I.trig.max_rebound_count || 1;
    for (const k of ['bounce', 'decel', 'onEnd', 'tick']) if (o[k] != null) b[k] = o[k];
    kidsOf(G, e, b, I, o);
    G.bullets.push(b);
    e.arena.tracked.push(b);
    if (I.vfx && SK.vfx) SK.vfx.spawn(G, I.vfx, x, y, { follow: b, ang });
    return b;
  }

  // Hành vi lấy từ MonoBehaviour thật của prefab đạn [ĐO bullets của sk-bosses86.js].
  function kidsOf(G, e, b, I, o) {
    const m = I.main, t = I.trig;
    if (m.cls === 'RGSBullet01' && !o.noKids) {
      // Rải đạn con mỗi child_rate giây. Hướng con: angle ≥ 360 → một viên theo hướng mẹ (tốc 0 = trụ đứng yên);
      // 180 → hai viên vuông góc; 90 → bốn viên chữ thập [ƯỚC LƯỢNG cách hiểu trường angle].
      const kid = goRef(m.bullet), rate = o.kidRate || m.child_rate || 0.4;
      let next = rate;
      const prev = b.tick;
      b.tick = (G2, bb, dt) => {
        if (prev) prev(G2, bb, dt);
        while (bb.age >= next) {
          next += rate;
          if (o.kidDirs) { for (const a of o.kidDirs(bb)) spawnKid(a); continue; }
          const ang = m.angle || 360;
          if (ang >= 360) spawnKid(m.child_bullet_speed ? bb.dir + SK.randf(-Math.PI, Math.PI) : bb.dir);
          else for (let k = 0; k < Math.round(360 / ang); k++) spawnKid(bb.dir + (ang === 180 ? Math.PI / 2 : 0) + k * ang * DEG);
        }
        function spawnKid(a) {
          fire(G2, e, kid, bb.x, bb.y, a, { spd: m.child_bullet_speed || 0, dmg: m.child_bullet_damage || 2, life: m.child_destory_time || 4, h: bb.h });
        }
      };
    }
    if (m.cls === 'RGBDelayDivision') {
      const prev = b.tick;
      b.tick = (G2, bb, dt) => {
        if (prev) prev(G2, bb, dt);
        if (bb.age < m.delay_time || bb.divided) return;
        bb.divided = true; bb.dead = true;
        const n = m.c_count || 3;
        for (let k = 0; k < n; k++) fire(G2, e, goRef(m.c_bullet), bb.x, bb.y, bb.dir + (k - (n - 1) / 2) * (m.c_angle || 15) * DEG, { spd: m.c_bullet_speed || 6, dmg: m.c_atk || 2, h: bb.h });
        sfx(G2, m.c_audio_clip);
      };
    }
    if (t.cls === 'RGBTDivision') {
      // Vỡ khi chạm (tường hoặc người chơi) thành `count` viên cách nhau `angle` độ, quay ngược hướng bay [ƯỚC LƯỢNG].
      const prev = b.onEnd;
      b.onEnd = (G2, bb, wall) => {
        if (prev) prev(G2, bb, wall);
        const n = t.count || 6, mid = bb.dir + Math.PI;
        for (let k = 0; k < n; k++) fire(G2, e, goRef(t.bullet), bb.px, bb.py, mid + (k - (n - 1) / 2) * (t.angle || 30) * DEG, { spd: t.bullet_speed || 6, dmg: t.atk || 2, h: bb.h });
        sfx(G2, t.audio_clip);
      };
    }
    if (t.cls === 'RGBTEnergy') {
      const ex = BUL[goRef(t.explode_obj)], E = ex && ex.mbs.ExplodeEnergy;
      const prev = b.onEnd;
      b.onEnd = (G2, bb, wall) => {
        if (prev) prev(G2, bb, wall);
        const col = ex && ex.rig.nodes[0].col && ex.rig.nodes[0].col.cir;
        const rad = (col ? col.r : 0.5) * (E ? E.scaleFactor || 1 : 1) * U;
        blast(G2, bb.px, bb.py + bb.h - 4, rad, Math.max(1, Math.round((bb.dmgRaw || 4) * (t.damageFactor || 0.5))), goRef(t.explode_obj));
        if (E) sfx(G2, E.audio_clip);
      };
    }
    if (I.mbs.ExplodeEffectTrigger) {
      const cr = goRef(I.mbs.ExplodeEffectTrigger.creation), ex = BUL[cr], X = ex && ex.mbs.Explode;
      const prev = b.onEnd;
      b.onEnd = (G2, bb, wall) => {
        if (prev) prev(G2, bb, wall);
        explode(G2, bb.px, bb.py + bb.h - 4, cr, X && X.small ? 'explode_small' : 'explode_big', o.boomDmg || (X && X.damage) || 5);
      };
    }
  }

  // Nổ Explode (explode_hit_player...): VFX thật + trúng người chơi trong bán kính collider [ĐO cir r 3 đơn vị].
  function explode(G, x, y, name, state, dmg) {
    const ex = BUL[name], r0 = ex && ex.rig.nodes[0];
    const cir = r0 && r0.col && r0.col.cir;
    // bán kính collider × thước gốc prefab (explode_hit_player: r 3 × 0.6 = 1.8 đơn vị) [ĐO]
    const rad = (cir ? cir.r : 1.5) * (r0 && r0.sx ? Math.abs(r0.sx) : 1) * U * (state === 'explode_small' ? 0.6 : 1);
    if (SK.vfx) SK.vfx.spawn(G, name || 'explode_hit_player', x, y, { state });
    G.shake = Math.max(G.shake, state === 'explode_small' ? 2 : 4);
    const X = ex && ex.mbs.Explode;
    if (X) sfx(G, state === 'explode_small' ? X.small_clip : X.big_clip);
    hurtIn(G, x, y, rad, dmg);
  }
  function blast(G, x, y, rad, dmg, name) {
    if (SK.vfx && name) SK.vfx.spawn(G, name, x, y, {});
    hurtIn(G, x, y, rad, dmg);
  }
  function hurtIn(G, x, y, rad, dmg) {
    const p = G.player;
    if (p.st !== 'dead' && Math.hypot(p.x - x, (p.y - 5) - y) < rad + 4) SK.hurtPlayer(G, dmgOf(dmg));
  }

  // Đạn đội hình (bullet_e_5/9/10): các viên con xếp theo vị trí trong prefab, cả khối bay và xoay.
  function formation(G, e, name, x, y, ang, o) {
    const I = bulInfo(name);
    if (!I) return;
    const spd = (o.spd != null ? o.spd : (I.main.speed || 5)) * U * (e.enraged && e.def.enrageSpd ? e.def.enrageSpd : 1);
    const hub = { x, y, a: 0, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, t: 0, life: o.life || I.main.destroy_time || 5, spin: (I.main.rotate_angle || 0) * 50 * DEG * (o.dir || 1) };
    const kids = I.parts.map(pt => {
      const b = { side: 'e', kind: 'arrow', x, y, h: o.h || 12, vx: 0, vy: 0, ang: 0, dmg: dmgOf(o.dmg || 3), repel: 0, r: Math.min(4, pt.r), life: hub.life, sprite: frameOf(pt.f) || 'bullet_29', lx: pt.x * U, ly: -pt.y * U, pname: name };
      G.bullets.push(b);
      if (I.trig.cls === 'RGBTEnergy') {
        // Mỗi cầu vỡ ra explode_energy3 (damageFactor × sát thương) [ĐO RGBTEnergy]
        b.age = 0; b.px = b.x; b.py = b.y; b.dmgRaw = o.dmg || 3;
        b.onEnd = (G2, bb) => blast(G2, bb.px, bb.py + bb.h - 4, 16, Math.max(1, Math.round(bb.dmgRaw * (I.trig.damageFactor || 0.5))), goRef(I.trig.explode_obj));
        e.arena.tracked.push(b);
      }
      return b;
    });
    e.arena.objs.push({
      t: 0, dur: hub.life,
      update(G2, ob, dt) {
        hub.x += hub.vx * dt; hub.y += hub.vy * dt; hub.a += hub.spin * dt;
        const c = Math.cos(hub.a), s = Math.sin(hub.a);
        let alive = 0;
        for (const b of kids) {
          if (b.dead) continue;
          alive++;
          b.x = hub.x + b.lx * c - b.ly * s; b.y = hub.y + b.lx * s + b.ly * c; b.ang += dt * 6;
        }
        return alive > 0 && ob.t < ob.dur;
      }
    });
  }

  // ---------------------------------------------------------------- sàn đấu: cập nhật sau core, hai lớp vẽ
  function makeArena(G, e) {
    const A = { e, objs: [], tracked: [], introT: 0, done: false, frozen: false };
    G.props.push({ x: e.x, y: -1e9, draw: ctx => drawLayer(ctx, G, A, 'ground'), update: (G2, pr, dt) => { updateArena(G2, A, dt); pr.gone = A.done; } });
    G.props.push({ x: e.x, y: 1e9, draw: ctx => drawLayer(ctx, G, A, 'air'), update: (G2, pr) => { pr.gone = A.done; } });
    return A;
  }
  function drawLayer(ctx, G, A, layer) { for (const o of A.objs) if (o[layer]) o[layer](ctx, G, o); }

  function freeze(G, A, on) {
    const p = G.player;
    if (on && !A.frozen) { A.frozen = true; A.savedMove = p.moveMul; p.moveMul = 0; }
    if (!on && A.frozen) { A.frozen = false; p.moveMul = A.savedMove; }
    if (on) for (const w of p.weapons.concat(p.dual)) if (w) w.cd = Math.max(w.cd, 0.1);
  }

  function updateArena(G, A, dt) {
    const e = A.e;
    if (e.st === 'dead' && !e.deathDone) onBossDeath(G, e);
    if (A.introT < INTRO_LEN) {
      A.introT += dt;
      freeze(G, A, A.introT < INTRO_LEN);
      if (A.introT >= INTRO_LEN) { e.st = 'idle'; e.stT = 0; e.cd = e.def.firstCd != null ? e.def.firstCd : 0.6; }
    } else if (!e.deathDone) brain(G, e, dt);
    if (e.deathDone) e.deathT += dt;
    rigTick(e.R, dt, e.deathDone || A.introT < INTRO_LEN ? null : (fn, arg, node, st) => onClipEvent(G, e, fn, arg, node, st));
    updateTracked(G, A, dt);
    // Vật mới đẩy vào trong lúc cập nhật (thiên thạch sinh vụ nổ...) nằm ở mảng mới, ghép lại sau.
    const cur = A.objs;
    A.objs = [];
    const keep = cur.filter(o => { o.t += dt; return o.update ? o.update(G, o, dt) !== false : o.t < o.dur; });
    A.objs = keep.concat(A.objs);
    if (e.deathDone && e.deathT > 2.5 && !A.objs.length) A.done = true;
  }

  // Chạy sau SK.updateBullets: đạn nảy tường hồi sinh ở vị trí khung trước, đạn nổ/tách gọi onEnd.
  function updateTracked(G, A, dt) {
    const keep = [], map = G.map;
    for (const b of A.tracked) {
      if (b.dead) {
        if (b.divided) continue;
        const wall = b.life > 0 && W.solidAt(map, b.x, b.y + b.h);
        if (wall && b.bounce > 0) {
          const hx = W.solidAt(map, b.px + b.vx * dt * 1.5, b.py + b.h), hy = W.solidAt(map, b.px, b.py + b.vy * dt * 1.5 + b.h);
          if (hx || !hy) b.vx = -b.vx;
          if (hy || !hx) b.vy = -b.vy;
          b.x = b.px; b.y = b.py; b.dead = false; b.bounce--;
          b.dir = Math.atan2(b.vy, b.vx); b.ang = b.spin ? b.ang : b.dir;
          G.bullets.push(b); keep.push(b);
          continue;
        }
        if (b.onEnd && !b.ended && b.life > 0) { b.ended = true; b.onEnd(G, b, wall); }
        continue;
      }
      b.age += dt;
      if (b.decel) {
        // Bullet04: mỗi `rate` giây tốc × speed_value, không dưới min_speed [ĐO]
        b.decT = (b.decT || 0) + dt;
        while (b.decT >= b.decel.rate) {
          b.decT -= b.decel.rate;
          const sp = Math.hypot(b.vx, b.vy);
          if (sp > b.decel.min) { const k = Math.max(b.decel.k, b.decel.min / sp); b.vx *= k; b.vy *= k; }
        }
      }
      if (b.spin) b.ang += b.spin * dt;
      if (b.tick) b.tick(G, b, dt);
      b.px = b.x; b.py = b.y;
      keep.push(b);
    }
    A.tracked = keep;
  }

  // ---------------------------------------------------------------- khung trùm chung
  // Lợi Hại: trùm là bản tinh anh, vẽ bằng trang tô đỏ như quái tinh anh.
  function pagesOf(e) { return e.flash > 0 ? SK.pagesWhite : e.badass ? SK.pagesElite : null; }
  function drawBoss(ctx, G, e) {
    if (e.hidden) return;
    const def = e.def;
    if (def.drawUnder) def.drawUnder(ctx, G, e);
    rigDraw(ctx, e.R, e.x, e.y, { flip: e.face < 0, pages: pagesOf(e), skip: def.skipNode });
    if (def.drawOver) def.drawOver(ctx, G, e);
  }

  function aimAt(G, x, y) { const p = G.player; return angTo(x, y, p.x, p.y - 7); }
  function point(e, name) {
    const i = e.nodes[name];
    return i == null || i < 0 ? [e.x, e.y - 14] : rigPoint(e.R, i, e.x, e.y, e.face < 0 ? -1 : 1);
  }
  // Tay cầm vũ khí (RGEHand) xoay theo mục tiêu khi AI khoá hướng [ƯỚC LƯỢNG: lúc nào khoá nằm trong mã].
  function aimHand(G, e, on) {
    const i = e.nodes[e.def.hand];
    if (i == null || i < 0) return;
    if (!on) { delete e.R.ov[i]; return; }
    const [hx, hy] = point(e, e.def.hand);
    const a = aimAt(G, hx, hy), fl = e.face < 0 ? -1 : 1;
    e.aim = a;
    e.R.ov[i] = { r: Math.atan2(-Math.sin(a), fl * Math.cos(a)) / DEG };
  }

  function brain(G, e, dt) {
    const def = e.def, p = G.player;
    if (!e.enraged && e.hp <= e.hpMax * ENRAGE_AT) {
      e.enraged = true;
      sfx(G, e.ai.angry_clip);
      if (def.enrage) def.enrage(G, e);
    }
    // Collider gốc bị clip tắt (Giun Cát lặn đất) thì không trúng đạn.
    const P = rigPose(e.R);
    const hid = P[0].col === false;
    if (hid && e.st !== 'spawn') { e.st = 'spawn'; e.stT = 1e9; }
    if (!hid && e.st === 'spawn') { e.st = 'idle'; e.stT = 0; }
    if (def.tick) def.tick(G, e, dt);
    if (e.busy > 0) e.busy -= dt;
    if (e.atk) {
      const st = rigState(e.R);
      // Clip đòn không có End* và không có exit time (Người Cây đứng dậy): hết clip là hết đòn.
      const ly = e.R.anims[0].layers[0], S = ly.L.states[ly.st];
      const ranOut = S && !S.next && !S.loop && ly.t >= S.len && !(S.ev || []).some(v => /^End/.test(v[1]));
      if (e.atkEnd || st !== e.atk || ranOut) {
        const was = e.atk;
        e.atk = null; e.atkEnd = false; aimHand(G, e, false);
        e.cd = (e.ai.shoot_cd || 2) * (e.enraged ? def.enrageCd || 0.7 : 1) * SK.randf(0.85, 1.15);
        const chain = def.after && def.after[was] && def.after[was](G, e);
        if (chain) startAttack(G, e, chain);
        else if (st === was) rigPlay(e.R, def.idle);
      } else if (e.lockAim) aimHand(G, e, true);
    } else {
      if (def.walk !== false && !(e.busy > 0 && def.stillWhileBusy)) wander(G, e, dt);
      else setMove(e, false);
      e.cd -= dt;
      const held = SK.bossDebug.hold && !SK.bossDebug.next;
      if (e.cd <= 0 && !(e.busy > 0) && !held && p.st !== 'dead' && (!def.canAttack || def.canAttack(e))) startAttack(G, e);
    }
    if (!e.noFace && Math.abs(p.x - e.x) > 2) e.face = p.x > e.x ? 1 : -1;
    contactTick(G, e);
    e.lastX = e.x; e.lastY = e.y;
  }
  function setMove(e, on) {
    if (e.moving === on) return;
    e.moving = on;
    const d = e.def;
    if (!e.atk) rigPlay(e.R, on && d.run ? d.run : d.idle);
  }
  function startAttack(G, e, force) {
    const def = e.def;
    let list = def.pick ? def.pick(G, e) : def.atks;
    let opts = list.filter(n => n !== e.lastAtk);
    if (!opts.length) opts = list;
    const dbg = SK.bossDebug.next;
    if (dbg) SK.bossDebug.next = null;
    const name = dbg || force || SK.pick(opts);
    e.lastAtk = name; e.used[name] = (e.used[name] || 0) + 1;
    e.moving = false;
    if (def.start && def.start[name]) def.start[name](G, e);
    const state = (def.state && def.state[name]) || name;
    if (!rigPlay(e.R, state)) { SK.warnOnce && SK.warnOnce('bst' + state, 'boss state ' + state + ' missing'); return; }
    e.atk = state; e.atkEnd = false; e.lockAim = !!(def.aimDuring && def.aimDuring.indexOf(name) >= 0);
    const clips = e.ai.boss_clip || [];
    let i = def.atks.indexOf(name);
    if (i < 0) i = 0;
    if (clips.length > 1 && i >= 0) sfx(G, clips[Math.min(i, clips.length - 2)]);   // [ƯỚC LƯỢNG] clip thứ i cho đòn thứ i, clip cuối là "angry"
  }
  function onClipEvent(G, e, fn, arg, node, st) {
    if (/^End/.test(fn)) { if (st === e.atk) e.atkEnd = true; return; }
    const h = e.def.ev && e.def.ev[fn];
    if (h) h(G, e, arg, st);
  }

  function roomPoint(G, e, minD, maxD) {
    const r = e.room, p = G.player, T = SK.TILE;
    for (let k = 0; k < 30; k++) {
      const x = SK.randf((r.x0 + 2) * T, (r.x1 - 1) * T), y = SK.randf((r.y0 + 3) * T, (r.y1 - 1) * T);
      if (W.solidAt(G.map, x, y) || W.solidAt(G.map, x, y - 8)) continue;
      const d = Math.hypot(x - p.x, y - p.y);
      if (d >= minD && d <= maxD) return [x, y];
    }
    return W.roomCenter(r);
  }
  function wander(G, e, dt) {
    if (!e.goal || e.goalT <= 0) { e.goal = roomPoint(G, e, 50, 150); e.goalT = SK.randf(1.0, 2.0); }
    e.goalT -= dt;
    // [ĐO enemies.Speed] đơn vị/giây; [ƯỚC LƯỢNG] trùm đi 55% tốc tối đa giữa hai đòn như quái thường
    const spd = e.speed * U * 0.55 * (e.enraged ? 1.25 : 1);
    const dx = e.goal[0] - e.x, dy = e.goal[1] - e.y, d = Math.hypot(dx, dy);
    if (d < 3) { setMove(e, false); e.goalT = Math.min(e.goalT, 0.3); return; }
    const s = Math.min(d, spd * dt);
    const hit = SK.moveBox(G.map, e, dx / d * s, dy / d * s, e.r);
    setMove(e, true);
    if (hit) e.goalT = 0;
  }

  // ---------------------------------------------------------------- 1-5: Thầy Tế Goblin (boss08)
  function meteor(G, e, x, y, name, dmg) {
    // e_fireball: quả cầu rơi + vệt sáng trên sàn; DelayExplode.boom_time 1 s rồi nổ explode_hit_player [ĐO]
    name = name || 'e_fireball';
    const df = BUL[name] && BUL[name].mbs.DelayExplode;
    const h = SK.vfx && SK.vfx.spawn(G, name, x, y, {});
    e.arena.objs.push({
      t: 0, dur: df ? df.boom_time : 1,
      update(G2, o) {
        if (o.t < o.dur) return true;
        if (h) h.kill();   // DelayExplode huỷ quả cầu lúc nổ (destroyTime 4 s chỉ là dự phòng)
        const X = BUL.explode_hit_player && BUL.explode_hit_player.mbs.Explode;
        explode(G2, x, y, df ? goRef(df.bullet) : 'explode_hit_player', 'explode_big', dmg || (X ? X.damage : 6));
        sfx(G2, df && df.audio_clip);
        return false;
      }
    });
  }
  const boss08 = {
    atks: ['atk1', 'atk2', 'atk3', 'atk4'], idle: 'ide', run: 'run', hand: 'img/h1', muzzle: 'img/h1/weapon/point_1',
    aimDuring: ['atk2'], enrageCd: 0.6,
    after: {
      // [ĐO BossAI08.InAtk02: RGRandom.Range(0,100) < 51 thì StartAtk04 khi cờ bật — coi cờ là nổi giận]
      atk2: (G, e) => e.enraged && SK.rand() * 100 < 51 ? 'atk4' : null
    },
    ev: {
      // [WIKI] 3 thiên thạch quanh mục tiêu, nổi giận 4; rơi lệch nhau 0.15 s [ƯỚC LƯỢNG]
      InAtk01(G, e) {
        const n = e.enraged ? 4 : 3;
        for (let i = 0; i < n; i++) {
          e.arena.objs.push({ t: 0, dur: i * 0.15, update(G2, o) {
            if (o.t < o.dur) return true;
            const p = G2.player, a = SK.rand() * TAU, d = i === 0 ? 0 : SK.randf(1.5, 3.5) * U;
            const [x, y] = clampRoom(e, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
            meteor(G2, e, x, y);
            return false;
          } });
        }
      },
      // bullet_e_32 bay theo mục tiêu, rải trụ bullet_e_31 bắn bullet_e_33 vuông góc [ĐO RGSBullet01]; sát thương 3 [ƯỚC LƯỢNG]
      InAtk02(G, e) {
        const [x, y] = point(e, boss08.muzzle), a = aimAt(G, x, y);
        fire(G, e, 'bullet_e_32', x, y, a, { dmg: 3, h: e.y - y });
      },
      // bullet_e_16: hai cầu cách tâm 2 đơn vị quay quanh trùm 360°/giây, sống 5 giây [ĐO BulletFollow]; 4 sát thương [WIKI]
      InAtk03(G, e) {
        const I = bulInfo('bullet_e_16'), bf = I.main, dis = (I.trig.disableTime || 1.5);
        const a0 = SK.rand() * TAU, parts = I.parts;
        parts.forEach((pt, k) => {
          const b = { side: 'e', kind: 'arrow', x: e.x, y: e.y, h: 14, vx: 0, vy: 0, ang: 0, dmg: dmgOf(4), repel: 0, r: 5, life: bf.destroy_time || 5, sprite: frameOf(pt.f) || 'bullet_37', boss: e };
          const rad = Math.hypot(pt.x, pt.y) * U || (bf.ballPositionOffset || 2) * U, off = Math.atan2(-pt.y, pt.x);
          let a = a0 + off, off2 = 0;
          e.arena.objs.push({ t: 0, dur: b.life, update(G2, o, dt) {
            if (e.deathDone) { b.dead = true; return false; }
            a += (bf.rotate_angle || 360) * DEG * dt;
            b.x = e.x + Math.cos(a) * rad; b.y = e.y - 14 + Math.sin(a) * rad;
            // RGEnergyBallTrigger không tự huỷ khi trúng mà tắt disableTime giây [ĐO]
            if (b.dead && b.life > 0 && o.t < o.dur) { b.dead = false; off2 = dis; b.sprite = null; G2.bullets.push(b); }
            if (off2 > 0) { off2 -= dt; b.x = -1e5; if (off2 <= 0) b.sprite = frameOf(pt.f) || 'bullet_37'; }
            if (o.t >= o.dur) b.dead = true;
            return o.t < o.dur;
          } });
          G.bullets.push(b);
          void k;
        });
      },
      // Atk04Combo: vòng 6 bullet_e_30 [WIKI], 0.3 s sau mỗi viên tách 3 bullet_e_1 lệch 15° tốc 6 sát thương 2 [ĐO RGBDelayDivision]
      InAtk04(G, e) {
        const [x, y] = point(e, boss08.muzzle), a0 = aimAt(G, x, y);
        for (let k = 0; k < 6; k++) fire(G, e, 'bullet_e_30', x, y, a0 + k * TAU / 6, { dmg: 3, h: e.y - y });
      }
    }
  };
  function clampRoom(e, x, y) {
    const r = e.room, T = SK.TILE;
    return [SK.clamp(x, (r.x0 + 1.5) * T, (r.x1 - 0.5) * T), SK.clamp(y, (r.y0 + 2) * T, (r.y1 + 0.5) * T)];
  }

  // ---------------------------------------------------------------- 1-5: Hoa Ma Mandala (boss07)
  const T_NODES = ['img/t1', 'img/t2', 'img/t3', 'img/t4'];
  function snareStream(G, e, dur, poison) {
    // [WIKI] bắn đều từ 4 điểm theo 4 hướng rồi xoay dần; nhịp 0.1 s, xoay 1.2 rad/s [ƯỚC LƯỢNG]
    const dir = SK.chance(0.5) ? 1 : -1;
    let base = SK.rand() * TAU, cd = 0, pcd = 0.6;
    e.busy = dur;
    e.arena.objs.push({ t: 0, dur, update(G2, o, dt) {
      if (e.deathDone) return false;
      base += dir * 1.2 * dt; cd -= dt; pcd -= dt;
      if (cd <= 0) {
        cd = 0.1;
        for (let k = 0; k < 4; k++) {
          const a = base + k * Math.PI / 2;
          fire(G2, e, 'bullet_e_1', e.x + Math.cos(a) * 14, e.y - 16 + Math.sin(a) * 10, a, { spd: e.enraged ? 8 : 6, dmg: 2, h: 16 });
        }
      }
      if (poison && pcd <= 0) { pcd = 1.2; snareBeams(G2, e); }
      return o.t < o.dur;
    } });
  }
  function snareBeams(G, e) {
    // bullet_e_37: tia xanh gây độc (RGBulletBuffTrigger buff_posion) [ĐO]; 16 viên [ƯỚC LƯỢNG]
    const a0 = SK.rand() * TAU;
    for (let k = 0; k < 16; k++) fire(G, e, 'bullet_e_37', e.x, e.y - 16, a0 + k * TAU / 16, { spd: 7, dmg: 3, h: 16 });
  }
  const boss07 = {
    atks: ['bubbles', 'spin4', 'beams', 'pool'], idle: 'ide', walk: false, stillWhileBusy: true, firstCd: 0.8,
    pick(G, e) { return e.enraged ? ['bubbles', 'spin4', 'beams', 'pool', 'rails', 'pull'] : boss07.atks; },
    // Mọi đòn dùng chung clip atk1 (thân co lại rồi nở, InAtk01 ở 1.375 s) [ĐO controller chỉ có atk1]
    state: { bubbles: 'atk1', spin4: 'atk1', beams: 'atk1', pool: 'atk1', rails: 'atk1', pull: 'atk1' },
    enrage(G, e) {
      // angry_body boss07_13 thay nụ hoa; con quái trong nụ (b2) + 4 xúc tu hiện ra [ĐO BossAI07.angry_body, prefab]
      const b1 = e.nodes['img/body/b1'], b2 = e.nodes['img/body/b2'];
      e.R.ov[b1] = { f: (e.ai.angry_body || '').replace(/^Sprite:/, '') || 'boss07_13' };
      e.R.ov[b2] = { on: true };
      for (const t of T_NODES) {
        e.R.ov[e.nodes[t]] = { on: true };
        rigPlay(e.R, 'boss07_tentacle_show', e.nodes[t + '/boss07_tentacle']);
      }
    },
    tick(G, e) {
      if (!e.enraged || e.deathDone) return;
      // [WIKI] xúc tu chạm là mất máu; 2 sát thương [ƯỚC LƯỢNG]
      const p = G.player;
      for (const t of T_NODES) {
        const [x, y] = point(e, t + '/boss07_tentacle/p1/p2');
        if (Math.hypot(p.x - x, p.y - 7 - y) < 9) { SK.hurtPlayer(G, dmgOf(2)); break; }
      }
    },
    ev: {
      InAtk01(G, e) {
        const k = e.lastAtk;
        if (k === 'bubbles') {
          // [WIKI] 18 bong bóng rất chậm, tan sau 4 s (nổi giận bay xa hơn); bullet_e_24 chậm dần ×0.8 mỗi 0.1 s [ĐO Bullet04]
          const a0 = SK.rand() * TAU;
          for (let i = 0; i < 18; i++) fire(G, e, 'bullet_e_24', e.x, e.y - 16, a0 + i * TAU / 18, { spd: e.enraged ? 7 : 5, dmg: 2, life: e.enraged ? 6 : 4, h: 16 });
        } else if (k === 'spin4') snareStream(G, e, 3.2, e.enraged);
        else if (k === 'beams') snareBeams(G, e);
        else if (k === 'pool') {
          // Gas: bán kính 3 đơn vị, 1 sát thương mỗi 0.5 s, 6 giây [ĐO BulletGas]
          const gs = BUL.Gas && BUL.Gas.mbs.BulletGas, dur = gs ? gs.duration : 6, rad = (gs ? gs.damage_radius : 3) * U;
          const h = SK.vfx && SK.vfx.spawn(G, 'Gas', e.x, e.y - 4, { state: 'gas_start', dur, scale: 1 });
          let tickT = 0;
          e.arena.objs.push({ t: 0, dur, update(G2, o, dt) {
            tickT -= dt;
            const p = G2.player;
            if (tickT <= 0 && Math.hypot(p.x - e.x, p.y - e.y + 4) < rad) { tickT = gs ? gs.hit_invert : 0.5; SK.hurtPlayer(G2, gs ? gs.damage : 1); }
            if (e.deathDone || o.t >= o.dur) { if (h) h.stop(); return false; }
            return true;
          } });
        } else if (k === 'rails') {
          // bullet_e_34 nhanh về 4 góc phòng, mỗi 0.2 s rải 2 bong bóng bullet_e_24 vuông góc tốc 6 [ĐO RGSBullet01]
          const r = e.room, T = SK.TILE;
          const corners = [[r.x0 * T, r.y0 * T], [(r.x1 + 1) * T, r.y0 * T], [r.x0 * T, (r.y1 + 1) * T], [(r.x1 + 1) * T, (r.y1 + 1) * T]];
          T_NODES.forEach((t, i) => {
            const [x, y] = point(e, t + '/boss07_tentacle/p1/p2/p3');
            fire(G, e, 'bullet_e_34', x, y, angTo(x, y, corners[i][0], corners[i][1]), { spd: 14, dmg: 3, h: e.y - y });
            rigPlay(e.R, 'boss07_tentacle_atk', e.nodes[t + '/boss07_tentacle']);
          });
        } else if (k === 'pull') {
          // explode_E_poly: hút người chơi về tâm, range 20 đơn vị, power 36 [ĐO BulletEPoly]; tường chặn được
          const ep = BUL.explode_E_poly, bp = ep && ep.mbs.BulletEPoly;
          const Rg = ep && rigNew(ep.rig);
          if (Rg) rigPlay(Rg, 'explode_blast_poly');
          sfx(G, bp && bp.audio_clip);
          const range = (bp ? bp.range : 20) * U, power = bp ? bp.power : 36;
          e.arena.objs.push({ t: 0, dur: 0.8, update(G2, o, dt) {
            if (Rg) rigTick(Rg, dt);
            const p = G2.player, d = Math.hypot(p.x - e.x, p.y - e.y);
            if (p.st !== 'dead' && d < range && d > 12 && o.t < 0.6) {
              // [ƯỚC LƯỢNG] lực power đổi ra tốc hút 0.3·power đơn vị/giây, giảm theo khoảng cách
              const v = power * 0.3 * (1 - d / range) * U, a = angTo(p.x, p.y, e.x, e.y);
              SK.moveBox(G2.map, p, Math.cos(a) * v * dt, Math.sin(a) * v * dt, p.h.body.r);
            }
            return o.t < o.dur;
          }, ground(ctx) { if (Rg) rigDraw(ctx, Rg, e.x, e.y - 12, {}); } });
        }
      }
    }
  };

  // ---------------------------------------------------------------- 2-5: Kỵ Sĩ Lớn (boss01)
  const boss01 = {
    atks: ['boss01_atk1', 'boss01_atk2', 'boss01_atk3', 'boss01_atk4'], idle: 'boss01_ide', run: 'boss01_run',
    hand: 'img/h1', muzzle: 'img/h1/weapon/point_1', shield: 'img/h2/shield/point_2', aimDuring: ['boss01_atk1', 'boss01_atk4'],
    ev: {
      // Đâm kiếm: khối tam giác 15 bullet_e_1 bay thẳng [WIKI hình tam giác; số viên ƯỚC LƯỢNG]
      InAtk01(G, e) {
        const [x, y] = point(e, boss01.muzzle), a = aimAt(G, x, y), c = Math.cos(a), s = Math.sin(a);
        for (let row = 0; row < 5; row++) {
          for (let k = 0; k <= row; k++) {
            const lat = (k - row / 2) * 7, back = row * 7;
            fire(G, e, 'bullet_e_1', x - c * back - s * lat, y - s * back + c * lat, a, { spd: 9, dmg: 3, h: e.y - y });
          }
        }
      },
      // Thúc khiên: vòng 8 chữ thập bullet_e_28 [WIKI; số viên ƯỚC LƯỢNG]
      InAtk02(G, e) {
        const [x, y] = point(e, boss01.shield), a0 = aimAt(G, x, y);
        for (let k = 0; k < 8; k++) fire(G, e, 'bullet_e_28', x, y, a0 + k * TAU / 8, { spd: 6, dmg: 3, h: e.y - y });
      },
      // Giơ kiếm: 6 cầu bullet_e_7 [WIKI], chạm là vỡ 6 bullet_e_1 lệch 30° [ĐO RGBTDivision]; nổi giận thêm vòng chữ thập [WIKI]
      InAtk03(G, e) {
        const [x, y] = point(e, boss01.muzzle), a = aimAt(G, x, y);
        for (let k = 0; k < 6; k++) fire(G, e, 'bullet_e_7', x, y, a + (k - 2.5) * 14 * DEG, { spd: 7, dmg: 5, h: e.y - y });
        if (e.enraged) for (let k = 0; k < 8; k++) fire(G, e, 'bullet_e_28', e.x, e.y - 14, a + (k + 0.5) * TAU / 8, { spd: 6, dmg: 3, h: 14 });
      },
      // Hai nhát chém, mỗi nhát một vòng cung 9 tam giác bullet_e_26 [WIKI; góc 120° ƯỚC LƯỢNG]
      InAtk04(G, e) {
        const [x, y] = point(e, boss01.muzzle), a = aimAt(G, x, y);
        for (let k = 0; k < 9; k++) fire(G, e, 'bullet_e_26', x, y, a + (k - 4) * 15 * DEG, { spd: 9, dmg: 4, h: e.y - y });
      }
    }
  };

  // ---------------------------------------------------------------- 2-5: Kỵ Sĩ Bóng Tối (boss01_2, biến thể 30%)
  function arc9(G, e, name, x, y, a, o) { for (let k = 0; k < 9; k++) fire(G, e, name, x, y, a + (k - 4) * 22.5 * DEG, o); }
  const boss01_2 = {
    atks: ['boss01_atk1', 'boss01_atk2', 'boss01_atk3', 'boss01_atk4', 'boss01_atk5'], idle: 'boss01_ide', run: 'boss01_run',
    hand: 'img/h1', muzzle: 'img/h1/weapon/point_1', muzzle2: 'img/h2/weapon_2/point_2', enrageSpd: 1.5, enrageCd: 0.6,
    contact: 2,   // CollisionDamage trên collider [ĐO]; 2 sát thương [ƯỚC LƯỢNG]
    ev: {
      // Hai kiếm giơ cao: 6 cầu lớn bullet_e_7 quanh mình (5 sát thương, vỡ thành đạn nhỏ) [WIKI]
      InAtk01(G, e) { const a0 = SK.rand() * TAU; for (let k = 0; k < 6; k++) fire(G, e, 'bullet_e_7', e.x, e.y - 16, a0 + k * TAU / 6, { spd: 6, dmg: 5, h: 16 }); },
      // Hai kiếm đâm tới: 2 đạn lớn + 2 khối tam giác bullet_e_71 [WIKI]
      InAtk02(G, e) {
        for (const nm of [boss01_2.muzzle, boss01_2.muzzle2]) {
          const [x, y] = point(e, nm), a = aimAt(G, x, y), c = Math.cos(a), s = Math.sin(a);
          fire(G, e, 'bullet_e_7', x, y, a, { spd: 8, dmg: 5, h: e.y - y });
          for (let row = 1; row < 4; row++) for (let k = 0; k <= row; k++) {
            const lat = (k - row / 2) * 6, back = row * 6 + 6;
            fire(G, e, 'bullet_e_71', x - c * back - s * lat, y - s * back + c * lat, a, { spd: 8, dmg: 3, h: e.y - y });
          }
        }
      },
      // Vòng đạn nảy bullet_e_6 (nảy 1 lần [ĐO RGBTRebound]), 3 sát thương [WIKI]; 16 viên [ƯỚC LƯỢNG]
      InAtk03(G, e) { const a0 = SK.rand() * TAU; for (let k = 0; k < 16; k++) fire(G, e, 'bullet_e_6', e.x, e.y - 16, a0 + k * TAU / 16, { spd: 6, dmg: 3, h: 16 }); },
      // Chém mỗi tay: 9 tam giác bullet_e_26 trong 180° [WIKI]; tham số sự kiện 1/2 = kiếm nào [ĐO clip boss01_2_atk5]
      InAtk04(G, e, arg) {
        const [x, y] = point(e, arg === 2 ? boss01_2.muzzle2 : boss01_2.muzzle);
        arc9(G, e, 'bullet_e_26', x, y, aimAt(G, x, y), { spd: 9, dmg: 4, h: e.y - y });
      },
      // 9 bullet_e_35 trong 180° kéo vệt đạn nhỏ bullet_e_1 (tốc 2, sống 1 s, mỗi 0.15 s) [WIKI + ĐO RGSBullet01]
      InAtk05(G, e) {
        const [x, y] = point(e, boss01_2.muzzle);
        arc9(G, e, 'bullet_e_35', x, y, aimAt(G, x, y), { spd: 8, dmg: 4, h: e.y - y });
      }
    }
  };

  // ---------------------------------------------------------------- 2-5: Phù Thủy Lớn (boss02)
  function beamLen(G, x, y, a, max) {
    let len = 0;
    while (len < (max || 420) && !W.solidAt(G.map, x + Math.cos(a) * len, y + Math.sin(a) * len + 10)) len += 3;
    return Math.min(len, max || 420);
  }
  // Tia laser prefab (bullet_e_8 / bullet_e_61): b_laser_start → b_laser (lặp) → b_laser_end (DestoryLaser).
  // Trúng người chơi mỗi `rate` giây sau `startDelay` [ĐO RGELaserTrigger]; dài tới tường (RGELaser.hit_wall) hoặc o.len px.
  // o: {origin() → [x, y], ang(dt) → rad, alive() → bool, dmg, len, width}
  function beam(G, e, name, o) {
    const L = BUL[name], lt = (L && L.mbs.RGELaserTrigger) || {};
    if (!L) return;
    const Rg = rigNew(L.rig);
    rigPlay(Rg, 'b_laser_start');
    const ei = nodeIdx(L.rig, 'end'), ii = nodeIdx(L.rig, 'img');
    let hitT = lt.startDelay || 0.4, ending = false;
    const bm = { a: 0, ox: 0, oy: 0, len: 0 };
    e.arena.objs.push({
      t: 0, dur: 30,
      update(G2, ob, dt) {
        if (e.deathDone) return false;
        rigTick(Rg, dt, fn => { if (fn === 'DestoryLaser') ob.dur = 0; });
        if (!ending && !o.alive()) { ending = true; rigPlay(Rg, 'b_laser_end'); }
        if (!ending) bm.a = o.ang(dt);
        [bm.ox, bm.oy] = o.origin();
        bm.len = beamLen(G2, bm.ox, bm.oy, bm.a, o.len);
        hitT -= dt;
        if (!ending && hitT <= 0 && rigState(Rg) !== 'b_laser_start') {
          const p = G2.player, px = p.x - bm.ox, py = p.y - 7 - bm.oy, c = Math.cos(bm.a), s = Math.sin(bm.a);
          const along = px * c + py * s, off = Math.abs(-px * s + py * c);
          if (along > 0 && along < bm.len && off < (o.width || 7)) { SK.hurtPlayer(G2, dmgOf(o.dmg || 4)); hitT = lt.rate || 0.2; }
        }
        return ob.t < ob.dur;
      },
      air(ctx) {
        // Thân tia = sprite bullet_18 (16 px) kéo theo chiều dài (RGELaser đặt scale.x = khoảng tới tường), hai đầu bullet_37.
        const lenU = bm.len / U;
        Rg.ov[ii] = { sx: lenU, sy: o.thick || 1 };
        Rg.ov[ei] = { x: lenU };
        ctx.save();
        ctx.translate(bm.ox, bm.oy); ctx.rotate(bm.a);
        rigDraw(ctx, Rg, 0, 0, {});
        ctx.restore();
      }
    });
  }
  const boss02 = {
    atks: ['boss02_atk1', 'boss02_atk2', 'boss02_atk3', 'boss02_atk4'], idle: 'boss02_ide', run: 'boss02_run',
    hand: 'img/h1', muzzle: 'img/h1/weapon/point_1', aimDuring: ['boss02_atk2', 'boss02_atk3'],
    ev: {
      // Tia laser bullet_e_8 (RGELaser) quét ngang phòng tới EndAtk01; 5 sát thương [WIKI]; tốc quét 70°/giây [ƯỚC LƯỢNG]
      InAtk01(G, e) {
        const [hx, hy] = point(e, boss02.muzzle);
        const dir = SK.chance(0.5) ? 1 : -1, sweep = 70 * DEG;
        let a = aimAt(G, hx, hy) - dir * sweep * 0.9;
        beam(G, e, 'bullet_e_8', {
          dmg: 5, alive: () => e.atk === 'boss02_atk1',
          origin: () => point(e, boss02.muzzle),
          ang(dt) {
            a += dir * sweep * dt;
            e.R.ov[e.nodes[boss02.hand]] = { r: Math.atan2(-Math.sin(a), (e.face < 0 ? -1 : 1) * Math.cos(a)) / DEG };
            return a;
          }
        });
      },
      // Phun bullet_e_27 lỏng, bám theo mục tiêu tới EndAtk02 [WIKI]; nhịp 0.08 s, lệch ±24° [ƯỚC LƯỢNG]
      InAtk02(G, e) {
        let cd = 0;
        e.arena.objs.push({ t: 0, dur: 9, update(G2, o, dt) {
          if (e.deathDone || e.atk !== 'boss02_atk2') return false;
          cd -= dt;
          if (cd > 0) return true;
          cd = 0.08;
          const [x, y] = point(e, boss02.muzzle);
          fire(G2, e, 'bullet_e_27', x, y, aimAt(G2, x, y) + SK.randf(-24, 24) * DEG, { spd: SK.randf(6, 9), dmg: 3, h: e.y - y });
          return true;
        } });
      },
      // Hai vòng đạn chậm nảy tường bullet_e_6 (nảy 1 lần [ĐO]), 4 sát thương [WIKI]; 20 viên/vòng [ƯỚC LƯỢNG]
      InAtk03(G, e) {
        const a0 = SK.rand() * TAU;
        for (let k = 0; k < 20; k++) {
          fire(G, e, 'bullet_e_6', e.x, e.y - 14, a0 + k * TAU / 20, { spd: 3.5, dmg: 4, h: 14 });
          fire(G, e, 'bullet_e_6', e.x, e.y - 14, a0 + (k + 0.5) * TAU / 20, { spd: 5, dmg: 4, h: 14 });
        }
      },
      // Khối hình học xoay (bullet_e_5 vuông 16 viên, bullet_e_9 tam giác 12, bullet_e_10 lục giác 12) [ĐO prefab]; mỗi lần 3 khối [ƯỚC LƯỢNG]
      InAtk04(G, e) {
        const [x, y] = point(e, boss02.muzzle), a = aimAt(G, x, y);
        const kinds = ['bullet_e_5', 'bullet_e_9', 'bullet_e_10'];
        for (let k = 0; k < 3; k++) formation(G, e, kinds[(k + e.used.boss02_atk4) % 3], x, y, a + (k - 1) * 25 * DEG, { spd: 4.5, dmg: 3, h: e.y - y, dir: k % 2 ? 1 : -1 });
      }
    }
  };

  // ---------------------------------------------------------------- 3-5: Sâu Cát Núi Lửa (boss11)
  function wormStar(G, e) {
    // bullet_e_43 đứng yên, mỗi 0.4 s bắn bullet_e_33 chữ thập (nổi giận chéo) [ĐO RGSBullet01 angle 90; WIKI 13 viên]
    const diag = e.enraged ? Math.PI / 4 : 0;
    let n = 0;
    fire(G, e, 'bullet_e_43', e.x, e.y - 6, diag, { spd: 0, dmg: 3, life: 1.8, h: 6, kidDirs: bb => { n++; return n <= 3 ? [0, 1, 2, 3].map(k => diag + k * Math.PI / 2) : n === 4 ? [aimAt(G, bb.x, bb.y)] : []; } });
  }
  function wormShock(G, e) {
    // effect_shock3: 4 sát thương, collider r 1 × scaleFactor 2 [ĐO ExplodeEnergy]
    const X = BUL.effect_shock3 && BUL.effect_shock3.mbs.ExplodeEnergy;
    blast(G, e.x, e.y, (X ? X.scaleFactor : 2) * U, X ? X.damage : 4, 'effect_shock3');
    sfx(G, X && X.audio_clip);
    G.shake = Math.max(G.shake, 3);
  }
  function wormSurface(G, e) {
    wormShock(G, e);
    wormStar(G, e);
    // [WIKI] 12 viên nảy bullet_e_44 (nảy 3 lần [ĐO]) 4 sát thương; nổi giận thêm 12 bong bóng bullet_e_24
    const a0 = SK.rand() * TAU;
    for (let k = 0; k < 12; k++) fire(G, e, 'bullet_e_44', e.x, e.y - 16, a0 + k * TAU / 12, { spd: 5, dmg: 4, h: 16 });
    if (e.enraged) for (let k = 0; k < 12; k++) fire(G, e, 'bullet_e_24', e.x, e.y - 16, a0 + (k + 0.5) * TAU / 12, { spd: 4, dmg: 2, life: 5, h: 16 });
  }
  const boss11 = {
    atks: ['atk1', 'atk2', 'atk3'], idle: 'ide', run: 'ide', walk: false, canAttack: e => rigState(e.R) !== 'boss11_ide_down', head: 'img/body/body1/body2/body3/body4/body5/body6/head/point',
    enrageCd: 0.6,
    pick(G, e) { return (e.sinceDig || 0) >= 2 ? ['atk1', 'atk2', 'atk3', 'atk3'] : ['atk1', 'atk2']; },
    start: {
      atk1(G, e) { e.sinceDig = (e.sinceDig || 0) + 1; },
      atk2(G, e) { e.sinceDig = (e.sinceDig || 0) + 1; },
      atk3(G, e) { e.sinceDig = 0; }
    },
    tick(G, e, dt) {
      const st = rigState(e.R);
      if (st === 'boss11_ide_down') {
        // Dưới đất bò theo mục tiêu (tốc 4 [ĐO enemies.Speed], nổi giận nhanh hơn [WIKI]); rồi trồi lên hoặc lao lên cắn
        e.under = (e.under || 0) + dt;
        const p = G.player, a = angTo(e.x, e.y, p.x, p.y), d = Math.hypot(p.x - e.x, p.y - e.y);
        const v = e.speed * U * (e.enraged ? 1.5 : 1);
        if (d > 6) SK.moveBox(G.map, e, Math.cos(a) * Math.min(d, v * dt), Math.sin(a) * Math.min(d, v * dt), e.r);
        const wait = e.enraged ? 1.2 : 2.0;   // [ƯỚC LƯỢNG]
        if (e.under > wait && (d < 20 || e.under > wait + 1.2)) {
          e.under = 0;
          const up = SK.chance(0.5) ? 'boss11_out' : 'boss11_atk2';
          rigPlay(e.R, up); e.atk = up; e.used[up] = (e.used[up] || 0) + 1;
        }
      }
    },
    ev: {
      // Ngửa đầu phun bullet_e_14 lớn (nổi giận 3 quả), vỡ ra explode_hit_player 5 sát thương [WIKI + ĐO ExplodeEffectTrigger]
      InAtk01(G, e) {
        const [x, y] = point(e, boss11.head), a = aimAt(G, x, y), n = e.enraged ? 3 : 1;
        for (let k = 0; k < n; k++) fire(G, e, 'bullet_e_14', x, y, a + (k - (n - 1) / 2) * 20 * DEG, { spd: 7, dmg: 5, h: e.y - y, boomDmg: 5 });
      },
      // 8 viên lớn bullet_e_39 (nổi giận 12) toả rộng, nổ explode_energy3 khi chạm [WIKI + ĐO RGBTEnergy]; chậm dần [WIKI]
      InAtk02(G, e) {
        const [x, y] = point(e, boss11.head), a = aimAt(G, x, y), n = e.enraged ? 12 : 8;
        for (let k = 0; k < n; k++) {
          const b = fire(G, e, 'bullet_e_39', x, y, a + (k - (n - 1) / 2) * (110 / (n - 1)) * DEG, { spd: 10, dmg: 4, life: 1.7, h: e.y - y, decel: { rate: 0.1, k: 0.88, min: 2 * U } });
          if (b) b.dmgRaw = 4;
        }
      },
      // Lặn xuống (atk3) / cắn rồi lặn lại (boss11_atk2): sao chữ thập + sóng chấn động [WIKI]
      InAtk03(G, e) { wormShock(G, e); wormStar(G, e); },
      IntAtkIn(G, e) { wormShock(G, e); },
      InAtkOut(G, e) { wormSurface(G, e); }
    },
    after: {
      atk3: () => null
    }
  };

  // ---------------------------------------------------------------- quái con / vật triệu hồi
  // Quái thường của theme (e_slime01, e_mummy0X...) sinh bằng core; chết theo trùm (onBossDeath).
  function spawnMinion(G, e, id, x, y) {
    if (!D.enemies[id]) return null;
    const [fx, fy] = SK.freeNear([x, y]);
    const m = SK.makeEnemy(G, id, fx, fy, e.room);
    m.bossMinion = e;
    G.enemies.push(m);
    return m;
  }
  // Vật triệu hồi phá được (bia mộ, cột đá, trứng...): một "quái" không AI, vẽ bằng rig prefab thật, logic trong sàn đấu.
  // o: {rig, state, hp, hb, life, tick(G, pr, dt, ob), onEv(G, pr, fn), onEnd(G, pr, killed)}
  function bossProp(G, e, pid, x, y, o) {
    o = o || {};
    const ent = pid && B86.bosses[pid];
    const rigDef = o.rig || (ent && ent.rig);
    if (!rigDef) return null;
    const ra = (ent && ent.mbs && ent.mbs.RoleAttribute) || {};
    const ai = (ent && Object.values(ent.mbs || {}).find(v => v && v.reward_value)) || {};
    const Rg = rigNew(rigDef);
    const root = rigDef.nodes[0].col && rigDef.nodes[0].col.box;
    const hb = o.hb || (root ? { size: [root.size[0] * U, root.size[1] * U], off: [root.off[0] * U, root.off[1] * U] } : { size: [16, 20], off: [0, 10] });
    const hp = o.hp || ra.max_hp || 40;
    const pr = {
      id: pid || 'prop', d: { shadow: null, shadowOff: [0, 1e5] }, p: { kinematic: 1, reward_rate: ai.reward_rate || 0, reward_value: ai.reward_value || [0, 0, 0, 0] },
      cls: 'SKBossProp', rawCls: 'SKBossProp', x, y, kx: 0, ky: 0, hp, hpMax: hp, face: 1, aim: 0,
      st: 'idle', stT: 1e9, t: 0, room: e.room, elite: false, flash: 0, w: null, anims: { dead: true },
      r: 6, hb, scale: 1, R: Rg, boss: e,
      draw(ctx, G2, q) { if (q.st !== 'dead') rigDraw(ctx, q.R, q.x, q.y, { pages: q.flash > 0 ? SK.pagesWhite : null }); }
    };
    if (o.state) rigPlay(Rg, o.state);
    G.enemies.push(pr);
    e.arena.objs.push({ t: 0, dur: o.life || 8, update(G2, ob, dt) {
      rigTick(Rg, dt, fn => { if (o.onEv) o.onEv(G2, pr, fn); });
      const killed = pr.st === 'dead';
      if (killed || ob.t >= ob.dur || (e.deathDone && groupDone(G2, e))) {
        pr.st = 'dead'; pr.hp = 0;
        if (o.onEnd && !pr.ended) { pr.ended = true; o.onEnd(G2, pr, killed); }
        return false;
      }
      if (o.tick) o.tick(G2, pr, dt, ob);
      return true;
    } });
    return pr;
  }
  SK.AI.SKBossProp = function () {};

  // ---------------------------------------------------------------- 2-5: Slime Lớn (boss20)
  const boss20 = {
    atks: ['boss20_atk1', 'boss20_atk2', 'boss20_atk3'], idle: 'boss20_ide', run: 'boss20_run', muzzle: 'img/h1/point_1',
    // [WIKI] 4 đòn: vòng đạn đọng hình hoa, triệu hồi Slime, dậm độc, dậm hai lần; atk1 dùng chung cho hoa và triệu hồi [ĐO controller có 3 clip]
    pick() { return ['flower', 'spawn', 'boss20_atk2', 'boss20_atk3']; },
    state: { flower: 'boss20_atk1', spawn: 'boss20_atk1' },
    contact: 2,   // [WIKI] chạm thân mất máu; 2 sát thương [ƯỚC LƯỢNG]
    enrage(G, e) { slimeBoom(G, e); },
    ev: {
      InAtk01(G, e) {
        if (e.lastAtk === 'spawn') {
          // [ĐO BossAI20.maxCountSlim 4]: tối đa 4 Slime cùng lúc; quái e_slime01 của Lâu Đài thay cho e_slime01_temp
          const alive = G.enemies.filter(m => m.bossMinion === e && m.st !== 'dead').length;
          if (alive < (e.ai.maxCountSlim || 4)) spawnMinion(G, e, 'e_slime01', e.x + SK.randf(-12, 12), e.y + 6);
          return;
        }
        // [WIKI] 4 vòng liên tiếp, bay 10 ô rồi đứng lại thành hình hoa, 2 sát thương; lệch 10°/vòng [ĐO BossAI20.unitAngle];
        // 18 viên/vòng, cách 0.12 s [ƯỚC LƯỢNG]
        const a0 = SK.rand() * TAU, unit = (e.ai.unitAngle || 10) * DEG;
        for (let r = 0; r < 4; r++) {
          e.arena.objs.push({ t: 0, dur: r * 0.12, update(G2, o) {
            if (o.t < o.dur) return true;
            for (let k = 0; k < 18; k++) {
              fire(G2, e, 'bullet_e_72', e.x, e.y - 12, a0 + r * unit + k * TAU / 18, { spd: 10, dmg: 2, life: 5, h: 12,
                tick(G3, b) { if (b.age >= 1 && !b.stopped) { b.stopped = true; b.vx = 0; b.vy = 0; } } });
            }
            return false;
          } });
        }
      },
      // Nhảy lên dậm xuống: vũng độc Gas + 12 bong bóng đọng bullet_e_24, 3 sát thương [WIKI; số viên ƯỚC LƯỢNG]
      InAtk02(G, e) {
        gasPool(G, e, e.x, e.y);
        const a0 = SK.rand() * TAU;
        for (let k = 0; k < 12; k++) fire(G, e, 'bullet_e_24', e.x, e.y - 8, a0 + k * TAU / 12, { spd: 6, dmg: e.enraged ? 5 : 3, life: 5, h: 8 });
        G.shake = Math.max(G.shake, 3);
      },
      // Dậm đất hai lần: chùm đạn đỏ bullet_e_2 hướng và tốc ngẫu nhiên, 3 sát thương (nổi giận 5) [WIKI]; 16 viên/lần [ƯỚC LƯỢNG]
      IntAtk03(G, e) {
        for (let k = 0; k < 16; k++) fire(G, e, 'bullet_e_2', e.x, e.y - 8, SK.rand() * TAU, { spd: SK.randf(3, 9), dmg: e.enraged ? 5 : 3, h: 8 });
        G.shake = Math.max(G.shake, 2);
      }
    },
    // Chết: co lại (clip boss20_dead 3.1 s), nổ 7 lần, từ lần thứ 3 mỗi lần ra một Slime (5 con) [WIKI]
    dead(G, e) {
      for (let i = 0; i < 7; i++) {
        e.arena.objs.push({ t: 0, dur: 0.35 + i * 0.4, update(G2, o) {
          if (o.t < o.dur) return true;
          explode(G2, e.x + SK.randf(-10, 10), e.y - SK.randf(2, 14), 'explode_hit_player', 'explode_small', 0);
          if (i >= 2) spawnMinion(G2, e, 'e_slime01', e.x + SK.randf(-16, 16), e.y + SK.randf(-8, 8));
          return false;
        } });
      }
    }
  };
  function gasPool(G, e, x, y) {
    // Gas: bán kính 3 đơn vị, 1 sát thương mỗi 0.5 s, 6 giây [ĐO BulletGas]
    const gs = BUL.Gas && BUL.Gas.mbs.BulletGas, dur = gs ? gs.duration : 6, rad = (gs ? gs.damage_radius : 3) * U;
    const h = SK.vfx && SK.vfx.spawn(G, 'Gas', x, y - 4, { state: 'gas_start', dur });
    let tickT = 0;
    e.arena.objs.push({ t: 0, dur, update(G2, o, dt) {
      tickT -= dt;
      const p = G2.player;
      if (tickT <= 0 && Math.hypot(p.x - x, p.y - y + 4) < rad) { tickT = gs ? gs.hit_invert : 0.5; SK.hurtPlayer(G2, gs ? gs.damage : 1); }
      if (e.deathDone || o.t >= o.dur) { if (h) h.stop(); return false; }
      return true;
    } });
  }
  // Nổi giận: nổ ngay tại chỗ, rồi mỗi 15 lần trúng đòn lại nổ [WIKI]; explode_hit_player 6 sát thương [ĐO Explode.damage]
  function slimeBoom(G, e) {
    const X = BUL.explode_hit_player && BUL.explode_hit_player.mbs.Explode;
    explode(G, e.x, e.y - 8, 'explode_hit_player', 'explode_big', X ? X.damage : 6);
  }
  SK.on('enemyHit', (G, e) => {
    if (e.bossKey !== 'boss20' || !e.enraged || e.deathDone) return;
    e.hitN = (e.hitN || 0) + 1;
    if (e.hitN >= 15) { e.hitN = 0; slimeBoom(G, e); }
  });

  // ---------------------------------------------------------------- 3-5: Anubis (boss18)
  function laserStaff(G, e, x, y) {
    // bullet_e_laserstaff: gậy cắm xuống (staff_laser_show), 0.5 s sau sinh bullet_e_61 quay 90°/giây trong 6 giây,
    // gậy biến mất sau 8 giây [ĐO RGBDelayCreate, RGERotationLaser]; dài 7 ô, nổi giận 10 ô; 3 sát thương [WIKI]
    const S = BUL.bullet_e_laserstaff, dc = (S && S.mbs.RGBDelayCreate) || {};
    const rl = (BUL.bullet_e_61 && BUL.bullet_e_61.mbs.RGERotationLaser) || {};
    const Rg = S && rigNew(S.rig);
    if (!Rg) return;
    rigPlay(Rg, 'staff_laser_show');
    const len = (e.enraged ? (rl.laser_len || 10) : 7) * U;
    let a = SK.rand() * TAU, on = false;
    const dir = SK.chance(0.5) ? 1 : -1, life = dc.destory_time || 8;
    e.arena.objs.push({ t: 0, dur: life,
      update(G2, o, dt) {
        rigTick(Rg, dt);
        if (!on && o.t >= (dc.delay_time || 0.5)) {
          on = true;
          const t0 = o.t;
          beam(G2, e, 'bullet_e_61', { dmg: 3, len, alive: () => o.t - t0 < (rl.duration_time || 6) && !e.deathDone,
            origin: () => [x, y - 14], ang: dt2 => (a += dir * (rl.rot_speed || 90) * DEG * dt2) });
        }
        if (o.t > life - 0.5 && rigState(Rg) !== 'staff_laser_hide') rigPlay(Rg, 'staff_laser_hide');
        return o.t < o.dur && !e.deathDone;
      },
      air(ctx) { rigDraw(ctx, Rg, x, y, {}); }
    });
  }
  const boss18 = {
    atks: ['boss02_atk1', 'boss02_atk2', 'boss02_atk3', 'boss02_atk4'], idle: 'boss02_ide', run: 'boss02_run',
    hand: 'img/h1', muzzle: 'img/h1/weapon/point_1', aimDuring: ['boss02_atk2', 'boss02_atk4'],
    ev: {
      InAtk01(G, e) {
        const [x, y] = roomPoint(G, e, 30, 110);
        laserStaff(G, e, x, y);
      },
      // 3 cầu bullet_e_77 xếp tam giác, xoay khi bay (xoắn), 3 sát thương, vỡ ra explode_energy3 [ĐO prefab + WIKI];
      // nổi giận 9 cầu 4 sát thương [WIKI]
      InAtk02(G, e) {
        const [x, y] = point(e, boss18.muzzle), a = aimAt(G, x, y), n = e.enraged ? 3 : 1;
        for (let k = 0; k < n; k++) formation(G, e, 'bullet_e_77', x, y, a + (k - (n - 1) / 2) * 30 * DEG, { spd: 5, dmg: e.enraged ? 4 : 3, h: e.y - y });
      },
      // Gõ gậy: bia mộ (gọi Xác Ướp mỗi 2 s) + cột đá rơi (3 sát thương) [WIKI]; tối đa 4 mỗi loại [ĐO tombstone0X_max];
      // 40 máu [ĐO RoleAttribute], sống 8 giây [WIKI]
      InAtk03(G, e) {
        const count = id => G.enemies.filter(m => m.id === id && m.boss === e && m.st !== 'dead').length;
        if (count('temp_tombstone1') < (e.ai.tombstone01_max || 4)) {
          const [x, y] = roomPoint(G, e, 40, 120);
          let next = 2;
          bossProp(G, e, 'temp_tombstone1', x, y, { state: 'show', life: 8, tick(G2, pr, dt, ob) {
            if (ob.t >= next) { next += 2; spawnMinion(G2, e, SK.pick(['e_mummy03', 'e_mummy04', 'e_mummy05']), pr.x, pr.y + 10); }
          } });
        }
        if (count('temp_tombstone2') < (e.ai.tombstone02_max || 4)) {
          const p = G.player;
          const [x, y] = clampRoom(e, p.x + SK.randf(-16, 16), p.y + SK.randf(-10, 10));
          bossProp(G, e, 'temp_tombstone2', x, y, { state: 'show', life: 8, onEv(G2, pr, fn) {
            // show dài 1.667 s, OnAtk01 lúc chạm đất [ĐO clip e_tombstone2_show]
            if (fn === 'OnAtk01') { hurtIn(G2, pr.x, pr.y - 4, 16, 3); G2.shake = Math.max(G2.shake, 3); if (SK.vfx) SK.vfx.spawn(G2, 'effect_shock1', pr.x, pr.y, {}); }
          } });
        }
      },
      // Trụ bullet_e_74 đứng yên bắn bullet_e_73 4 hướng, 2 sát thương, mất sau 5 s [ĐO + WIKI]; nhịp 0.3 s [ƯỚC LƯỢNG, prefab ghi 0.04]
      InAtk04(G, e) {
        const [x, y] = point(e, boss18.muzzle);
        fire(G, e, 'bullet_e_74', x, y, 0, { spd: 0, dmg: 2, life: 5, h: e.y - y, kidRate: 0.3 });
      }
    }
  };

  // ---------------------------------------------------------------- 3-5: Rồng Bay Con (boss12_1 xám, boss12_2 đen)
  function dragonDef(grey) {
    const self = {
      atks: ['atk1', 'atk2', 'atk3', 'atk4'], idle: 'ide', run: 'ide', hand: 'img/h1', muzzle: 'img/h1/weapon',
      group: 'boss12_parent',
      ev: {
        // Xám: đầu mũi tên bám nhẹ bullet_e_46, 3 sát thương; Đen: tam giác bullet_e_47 lơ lửng rồi lao tới [WIKI]
        InAtk01(G, e) {
          const [x, y] = point(e, self.muzzle), a0 = aimAt(G, x, y);
          const n = e.enraged ? 12 : 8;   // [ƯỚC LƯỢNG]; nổi giận dày hơn và bắn hai lượt [WIKI]
          const volley = dly => e.arena.objs.push({ t: 0, dur: dly, update(G3, o) {
            if (o.t < o.dur) return true;
            if (grey) {
              for (let k = 0; k < n; k++) fire(G3, e, 'bullet_e_46', x, y, a0 + (k - (n - 1) / 2) * 12 * DEG, { spd: 7, dmg: 3, h: e.y - y,
                tick(G4, b, dt) {
                  const want = aimAt(G4, b.x, b.y), cur = Math.atan2(b.vy, b.vx), sp = Math.hypot(b.vx, b.vy);
                  const d = Math.atan2(Math.sin(want - cur), Math.cos(want - cur)), na = cur + SK.clamp(d, -1.2 * dt, 1.2 * dt);
                  b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp; b.ang = na;
                } });
            } else {
              for (let k = 0; k < n + 4; k++) fire(G3, e, 'bullet_e_47', e.x, e.y - 14, k * TAU / (n + 4), { spd: 3, dmg: 3, h: 14,
                tick(G4, b) {
                  if (!b.launched && b.age > 0.6) { b.launched = true; const a = aimAt(G4, b.x, b.y), sp = 10 * U; b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.ang = a; }
                  else if (!b.launched) { b.vx *= 0.9; b.vy *= 0.9; }
                } });
            }
            return false;
          } });
          volley(0);
          if (e.enraged) volley(0.5);
        },
        // Tia laser quét bullet_e_8 từ InAtk02 tới EndAtk02, 4 sát thương (nổi giận 5, to hơn) [WIKI]
        InAtk02(G, e) {
          const [x, y] = point(e, self.muzzle), dir = SK.chance(0.5) ? 1 : -1;
          let a = aimAt(G, x, y) - dir * 0.9;
          beam(G, e, 'bullet_e_8', { dmg: e.enraged ? 5 : 4, thick: e.enraged ? 1.6 : 1, width: e.enraged ? 10 : 7, alive: () => e.atk === 'atk2',
            origin: () => point(e, self.muzzle), ang: dt => (a += dir * 60 * DEG * dt) });
        },
        // Xám nổi giận: loạt tia ngắn bullet_e_15 ra mọi hướng, 2 sát thương [WIKI]; 12 tia [ƯỚC LƯỢNG]
        OnAtk2Angry(G, e) {
          if (!grey || !e.enraged) return;
          const a0 = SK.rand() * TAU;
          for (let k = 0; k < 12; k++) shortLaser(G, e, e.x, e.y - 14, a0 + k * TAU / 12, 2);
        },
        // 3 mũi lớn (nổi giận 5): xám bullet_e_45 → trứng nổ bullet_e_48 khi chạm; đen bullet_e_49 → vũng lửa Fire [WIKI + ĐO]
        InAtk03(G, e) {
          const [x, y] = point(e, self.muzzle), a = aimAt(G, x, y), n = e.enraged ? 5 : 3;
          for (let k = 0; k < n; k++) {
            fire(G, e, grey ? 'bullet_e_45' : 'bullet_e_49', x, y, a + (k - (n - 1) / 2) * 18 * DEG, { spd: 9, dmg: 4, h: e.y - y,
              onEnd(G2, b) { (grey ? dragonEgg : firePool)(G2, e, b.px, b.py + b.h - 4); } });
          }
        },
        // Lao vào mục tiêu, rải trứng (xám) / vũng lửa (đen) mỗi InAtk04 [WIKI + ĐO 4 sự kiện]; tốc 12 đơn vị/giây [ƯỚC LƯỢNG]
        InAtk04(G, e) {
          if (!e.dashing) {
            const a = aimAt(G, e.x, e.y - 8);
            e.dashing = { vx: Math.cos(a) * 12 * U, vy: Math.sin(a) * 12 * U };
          }
          (grey ? dragonEgg : firePool)(G, e, e.x, e.y);
        }
      },
      tick(G, e, dt) {
        if (!e.dashing) return;
        if (e.atk !== 'atk4') { e.dashing = null; return; }
        if (SK.moveBox(G.map, e, e.dashing.vx * dt, e.dashing.vy * dt, e.r)) e.dashing = null;
      }
    };
    return self;
  }
  function dragonEgg(G, e, x, y) {
    // bullet_e_48: trứng nổ sau boom_time 2 s hoặc khi bị bắn vỡ (3 máu), explode_hit_player 8 sát thương [ĐO BulletBoom]
    const B = BUL.bullet_e_48, bb = (B && B.mbs.BulletBoom) || {};
    if (!B) return;
    bossProp(G, e, null, x, y, { rig: B.rig, state: 'boom_ide', hp: bb.hp || 3, life: bb.boom_time || 2, hb: { size: [14, 14], off: [0, 7] },
      onEnd(G2, pr) { explode(G2, pr.x, pr.y - 6, goRef(bb.explode) || 'explode_hit_player', 'explode_small', bb.damage || 8); } });
  }
  // name: 'Fire' (trứng đỏ, rồng) hoặc 'FireGas' (trứng xanh lá: lửa độc) [ĐO ExplodeEffectTrigger.creation trong refs]
  function firePool(G, e, x, y, name) {
    name = name || 'Fire';
    // Fire: vòng lửa 5 giây, 2 sát thương mỗi giây [ĐO BulletGasBuff]; bán kính baseRadius 2.6 × 0.6 [ƯỚC LƯỢNG thước];
    // FireGas dùng cùng số [ƯỚC LƯỢNG — BulletFireGas chưa bóc]
    const fb = (BUL.Fire && BUL.Fire.mbs.BulletGasBuff) || {};
    const dur = fb.duration || 5, rad = (fb.baseRadius || 2.6) * U * 0.6;
    const h = SK.vfx && SK.vfx.spawn(G, name, x, y, { state: 'gas_start', dur, scale: name === 'Fire' ? 0.6 : 0.5 });
    let tickT = 0;
    e.arena.objs.push({ t: 0, dur, update(G2, o, dt) {
      tickT -= dt;
      const p = G2.player;
      if (tickT <= 0 && Math.hypot(p.x - x, p.y - y) < rad) { tickT = fb.damageInterval || 1; SK.hurtPlayer(G2, dmgOf(fb.damage || 2)); }
      if (groupDone(G2, e) || o.t >= o.dur) { if (h) h.stop(); return false; }
      return true;
    } });
  }
  function shortLaser(G, e, x, y, a, dmg) {
    // bullet_e_15: tia ngắn laser_short 0.33 s, dài tới tường [ĐO RGShortLaser]
    const S = BUL.bullet_e_15;
    if (!S) return;
    const Rg = rigNew(S.rig);
    rigPlay(Rg, 'laser_short');
    const ei = nodeIdx(S.rig, 'end'), ii = nodeIdx(S.rig, 'img');
    const len = beamLen(G, x, y, a);
    let hit = false;
    e.arena.objs.push({ t: 0, dur: 0.34, update(G2, o, dt) {
      rigTick(Rg, dt);
      if (!hit && o.t > 0.08) {
        const p = G2.player, px = p.x - x, py = p.y - 7 - y, c = Math.cos(a), s = Math.sin(a);
        const along = px * c + py * s, off = Math.abs(-px * s + py * c);
        if (along > 0 && along < len && off < 6) { hit = true; SK.hurtPlayer(G2, dmgOf(dmg)); }
      }
      return o.t < o.dur;
    }, air(ctx) {
      Rg.ov[ii] = { sx: len / U, sy: 1 }; Rg.ov[ei] = { x: len / U };
      ctx.save(); ctx.translate(x, y); ctx.rotate(a); rigDraw(ctx, Rg, 0, 0, {}); ctx.restore();
    } });
  }
  const boss12_1 = dragonDef(true), boss12_2 = dragonDef(false);
  // Hai rồng một nhóm: chỉ coi là xong khi cả nhóm chết.
  function groupDone(G, e) {
    if (!e.def.group) return e.deathDone;
    return G.enemies.every(o => o.def !== undefined && o.bossGroup === e.bossGroup ? o.deathDone : true);
  }

  // ---------------------------------------------------------------- 1-5: Người Cây Giáng Sinh (boss14)
  // bullet_e_shock: viên vô hình bay thẳng, mỗi 0.2 s để lại effect_shock1 [ĐO RGBTDelayCreate delay 0.2];
  // effect_shock1 3 sát thương [ĐO ExplodeEnergy]; bán kính 14 px [ƯỚC LƯỢNG]
  function shockLine(G, e, x, y, ang) {
    const dc = (BUL.bullet_e_shock && BUL.bullet_e_shock.mbs.RGBTDelayCreate) || {}, X = BUL.effect_shock1 && BUL.effect_shock1.mbs.ExplodeEnergy;
    const sp = ((BUL.bullet_e_shock && BUL.bullet_e_shock.mbs.Bullet01 || {}).speed || 10) * U, c = Math.cos(ang), s = Math.sin(ang);
    let next = 0;
    e.arena.objs.push({ t: 0, dur: 5, x, y, update(G2, o) {
      if (e.deathDone) return false;
      while (o.t >= next) {
        const d = next * sp;
        next += dc.delay || 0.2;
        const px = x + c * d, py = y + s * d;
        if (W.solidAt(G2.map, px, py)) return false;
        blast(G2, px, py, 14, X ? X.damage : 3, 'effect_shock1');
      }
      return o.t < o.dur;
    } });
  }
  const boss14 = {
    atks: ['atk4', 'atk5', 'atk6'], idle: 'root', run: 'root', walk: false, muzzle: 'img/energy_ball/ball', star: 'img/star',
    // [WIKI] pha thường đứng yên (state root); nổi giận đứng dậy (stand_up) rồi mới đi và đổi bộ đòn
    pick(G, e) { return e.standing ? ['atk1', 'atk2', 'atk3'] : ['atk4', 'atk5', 'atk6']; },
    canAttack: e => !e.rising,
    enrage(G, e) {
      e.rising = true;
      rigPlay(e.R, 'stand_up'); e.atk = 'stand_up';
    },
    after: {
      stand_up(G, e) { e.rising = false; e.standing = true; e.def = boss14Up; rigPlay(e.R, 'ide'); return null; }
    },
    ev: {
      // Sóng chấn động theo 3 hướng (atk4 tham số 3), 7 hướng lúc đứng dậy (tham số 7) [ĐO sự kiện InAtk04]; cách nhau 25° [ƯỚC LƯỢNG]
      InAtk04(G, e, n) {
        n = n || 3;
        const a0 = aimAt(G, e.x, e.y), step = n >= 7 ? TAU / n : 25 * DEG;
        for (let k = 0; k < n; k++) shockLine(G, e, e.x, e.y - 2, a0 + (k - (n - 1) / 2) * step);
        G.shake = Math.max(G.shake, 3);
      },
      // Ném cầu năng lượng bullet_e_50: bay tới mục tiêu, mỗi 0.25 s bắn 8 bullet_e_1 (angle 45, tốc 7, 2 sát thương),
      // chạm thì nổ explode_energy3 [ĐO RGSBullet01, RGBTEnergy]; tốc cầu 5, 4 sát thương [ƯỚC LƯỢNG]
      InAtk05(G, e) {
        const [x, y] = point(e, boss14.muzzle);
        const b = fire(G, e, 'bullet_e_50', x, y, aimAt(G, x, y), { spd: 5, dmg: 4, h: e.y - y });
        if (b) b.dmgRaw = 4;
      },
      // Giữ cầu năng lượng phun đạn ra mọi hướng tới khi cầu tắt (1.8 s) [WIKI + ĐO clip atk6]; xoắn 8 hướng, nhịp 0.2 s [ƯỚC LƯỢNG]
      InAtk06(G, e) {
        let cd = 0, rot = SK.rand() * TAU;
        e.arena.objs.push({ t: 0, dur: 1.1, update(G2, o, dt) {
          if (e.deathDone || e.atk !== 'atk6') return false;
          cd -= dt; rot += dt * 1.5;
          if (cd <= 0) {
            cd = 0.2;
            const [x, y] = point(e, boss14.muzzle);
            for (let k = 0; k < 8; k++) fire(G2, e, 'bullet_e_1', x, y, rot + k * TAU / 8, { spd: 6, dmg: 2, h: e.y - y });
          }
          return o.t < o.dur;
        } });
      }
    }
  };
  // Pha nổi giận: đi lại, lao húc, sao đuổi, vòng chữ thập + một dải sóng [WIKI]
  const boss14Up = Object.assign({}, boss14, {
    idle: 'ide', run: 'run', walk: true, canAttack: e => !e.charging,
    ev: Object.assign({}, boss14.ev, {
      // Một dải sóng về mục tiêu (tham số 1 [ĐO]) + chữ thập lớn bullet_e_28 ra mọi hướng [WIKI]; 8 viên [ƯỚC LƯỢNG]
      InAtk01(G, e, n) {
        shockLine(G, e, e.x, e.y - 2, aimAt(G, e.x, e.y));
        void n;
        const a0 = SK.rand() * TAU;
        for (let k = 0; k < 8; k++) fire(G, e, 'bullet_e_28', e.x, e.y - 14, a0 + k * TAU / 8, { spd: 6, dmg: 3, h: 14 });
      },
      // bullet_boss_14_atk2: 5 viên bullet_e_4 xếp sẵn quanh ngôi sao trên đầu, cả cụm bám mục tiêu
      // (Bullet02: mỗi 0.1 s xoay tối đa 15°, bám trong 24 s, tự huỷ sau 8 s) [ĐO]; tốc 5, 3 sát thương [ƯỚC LƯỢNG]
      InAtk02(G, e) {
        const [x, y] = point(e, boss14.star);
        const I = bulInfo('bullet_boss_14_atk2'), m = (I && I.main) || {}, life = (I && I.mbs.RGAutoDestory && I.mbs.RGAutoDestory.d_time) || 8;
        const a = aimAt(G, x, y);
        for (const pt of (I ? I.parts : [{ x: 0, y: 0 }])) {
          fire(G, e, 'bullet_e_4', x + pt.x * U, y - pt.y * U, a, { spd: 5, dmg: 3, life, h: e.y - y + pt.y * U, home: { interval: m.interval || 0.1, delay: m.delay_time || 0, limit: m.limit_time || 24, turn: m.angle_speed || 15 } });
        }
      }
    }),
    start: {
      // atk3: lao húc từ 0.5 s tới EndAtk03 (2.75 s), không nhận sát thương, chạm 4 sát thương [ĐO RGDash.damage 4, clip atk3; WIKI]
      atk3(G, e) {
        e.charging = true;
        const dmg = 4;
        let a = aimAt(G, e.x, e.y), hitCd = 0;
        e.arena.objs.push({ t: 0, dur: 2.75, update(G2, o, dt) {
          if (e.deathDone) { e.charging = false; e.noFace = false; return false; }
          if (o.t < 0.5) { a = aimAt(G2, e.x, e.y); return true; }
          e.st = 'spawn'; e.stT = 1e9;
          const v = 11 * U;   // [ƯỚC LƯỢNG] tốc húc
          e.noFace = true;
          if (SK.moveBox(G2.map, e, Math.cos(a) * v * dt, Math.sin(a) * v * dt, e.r)) a = aimAt(G2, e.x, e.y) + SK.randf(-0.4, 0.4);
          e.face = Math.cos(a) >= 0 ? 1 : -1;
          hitCd -= dt;
          const p = G2.player;
          if (hitCd <= 0 && Math.hypot(p.x - e.x, p.y - e.y) < 18) { hitCd = 0.5; SK.hurtPlayer(G2, dmgOf(dmg)); }
          if (o.t >= o.dur) { e.charging = false; e.noFace = false; e.st = 'idle'; e.stT = 0; return false; }
          return true;
        } });
      }
    },
    after: {}
  });

  // ---------------------------------------------------------------- 1-5: Thỏ Trứng Màu (boss19)
  // Trứng bay parabol: y_speed 12, gravity 35 → 0.69 s trên không [ĐO BulletParabola]; nở/nổ khi chạm đất.
  function throwEgg(G, e, name, x0, y0, x1, y1, land) {
    const B = BUL[name], bp = (B && B.mbs.BulletParabola) || {};
    const T = 2 * (bp.y_speed || 12) / (bp.gravity || 35);
    const f = B && frameOf((B.rig.nodes.find(n => n.f && !GLOW.has(n.f)) || {}).f);
    e.arena.objs.push({ t: 0, dur: T, x: x0, y: y0, update(G2, o) {
      const k = SK.clamp(o.t / T, 0, 1);
      o.x = x0 + (x1 - x0) * k; o.y = y0 + (y1 - y0) * k;
      o.h = (bp.y_speed || 12) * o.t - 0.5 * (bp.gravity || 35) * o.t * o.t;
      if (o.t >= T) { land(G2, x1, y1); return false; }
      return true;
    }, air(ctx, G2, o) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(o.x, o.y, 4, 1.5, 0, 0, TAU); ctx.fill();
      if (f) SK.draw(ctx, f, o.x, o.y - Math.max(0, o.h) * U - 4, { rot: o.t * 8 });
    } });
  }
  const boss19 = {
    atks: ['atk1'], idle: 'ide', run: 'run', enrageCd: 0.6,
    // [WIKI] hai đòn chung clip atk1 (StartAtk01 0.14 s, InAtk01 0.71 s, EndAtk01 1.5 s [ĐO]): ném trứng / trứng lớn gọi thiên thạch
    pick() { return ['eggs', 'eggs', 'bigegg']; },
    state: { eggs: 'atk1', bigegg: 'atk1' },
    ev: {
      InAtk01(G, e) {
        const p = G.player, x0 = e.x + 8 * e.face, y0 = e.y - 10;
        if (e.lastAtk === 'bigegg') {
          // bullet_e_68 bay lên (move_speed 40) rồi gọi e_fireball_egg rơi xuống mục tiêu: 2 quả, nổi giận 3 [WIKI + ĐO RGBMoveToSpawn]
          const B = BUL.bullet_e_68, f = B && frameOf((B.rig.nodes.find(n => n.f) || {}).f);
          e.arena.objs.push({ t: 0, dur: 0.5, air(ctx, G2, o) { if (f) SK.draw(ctx, f, x0, y0 - o.t * 40 * U, {}); } });
          const n = e.enraged ? 3 : 2;
          for (let i = 0; i < n; i++) {
            e.arena.objs.push({ t: 0, dur: 1 + i * 0.25, update(G2, o) {
              if (o.t < o.dur) return true;
              const q = G2.player, a = SK.rand() * TAU, d = i ? SK.randf(1.5, 3) * U : 0;
              const [x, y] = clampRoom(e, q.x + Math.cos(a) * d, q.y + Math.sin(a) * d);
              meteor(G2, e, x, y, 'e_fireball_egg');
              return false;
            } });
          }
          return;
        }
        // Tối đa 5 trứng xoè rộng [WIKI]; loại trứng theo prefab: xanh dương bullet_e_62 (12 cầu tuyết 30°), xanh lá bullet_e_63
        // (vũng lửa độc), đỏ bullet_e_65 (vũng lửa), vàng bullet_e_67 (heo rừng); nổi giận thêm trứng bản tinh anh bullet_e_69/70 [WIKI + ĐO]
        const kinds = e.enraged ? ['bullet_e_62', 'bullet_e_63', 'bullet_e_65', 'bullet_e_69', 'bullet_e_70'] : ['bullet_e_62', 'bullet_e_63', 'bullet_e_65', 'bullet_e_67', 'bullet_e_67'];
        const n = 3 + Math.floor(SK.rand() * 3), a0 = aimAt(G, x0, y0), d0 = Math.min(150, Math.hypot(p.x - x0, p.y - y0));
        for (let i = 0; i < n; i++) {
          const a = a0 + (i - (n - 1) / 2) * 22 * DEG, d = d0 * SK.randf(0.8, 1.1);
          const [x1, y1] = clampRoom(e, x0 + Math.cos(a) * d, y0 + Math.sin(a) * d);
          const kind = SK.pick(kinds);
          throwEgg(G, e, kind, x0, y0, x1, y1, (G2, x, y) => eggLand(G2, e, kind, x, y));
        }
      }
    }
  };
  function eggLand(G, e, kind, x, y) {
    const B = BUL[kind], m = (B && B.mbs) || {};
    if (m.RGBTDivision) {
      // Cầu tuyết bullet_e_41 cách 30°, tốc 6, 2 sát thương [ĐO RGBTDivision]; prefab ghi count 6 nhưng trứng rơi đất
      // vỡ thành vòng kín 12 viên [WIKI] — hàm Division của đạn parabol chưa đọc được
      const t = m.RGBTDivision;
      for (let k = 0; k < Math.round(360 / (t.angle || 30)); k++) fire(G, e, goRef(t.bullet), x, y - 4, k * (t.angle || 30) * DEG, { spd: t.bullet_speed || 6, dmg: t.atk || 2, h: 4 });
      sfx(G, t.audio_clip);
    } else if (m.RGBTSpawn) {
      // Trứng nở ra quái trứng: e_egg01 (EnemyAI09 lao húc) / e_egg02 (EnemyAI01 cầm súng) [ĐO tmp_*_egg0*];
      // web chưa có hai quái này nên dùng heo rừng / yêu tinh súng của Rừng, cùng kiểu AI [ƯỚC LƯỢNG thay da]
      const src = goRef(m.RGBTSpawn.explode_obj) || '';
      spawnMinion(G, e, (/tmp_ex_/.test(src) ? 'ex_' : 'e_') + (/egg00/.test(src) ? 'boar01' : 'orc01'), x, y);
    } else {
      const cr = SK.vfx && SK.vfx.explodeFor(kind);
      if (cr) firePool(G, e, x, y, cr);
    }
  }

  // ---------------------------------------------------------------- 1-5: Thầy Tế Goblin (Ma ám) (boss25)
  // Boss25Skill: bốn mô hình kỹ năng có cd, trọng số thường/nổi giận, số viên, đạn, sát thương, tốc — toàn bộ [ĐO].
  const B25 = () => (B86.bosses.boss25 && B86.bosses.boss25.mbs.Boss25Skill) || {};
  const bulletOf = bi => ({ name: goRef(bi && bi.bulletProto), spd: bi && bi.speed, dmg: bi && bi.damage });
  const boss25 = {
    atks: ['boss25_atk1', 'boss25_atk2', 'boss25_atk3'], idle: 'ide', run: 'run',
    // atk_1..atk_4 là trigger Animator; controller chỉ có 3 clip nên atk_4 dùng clip atk3 [ƯỚC LƯỢNG]
    state: { predict: 'boss25_atk1', ring: 'boss25_atk2', follow: 'boss25_atk3', trace: 'boss25_atk3' },
    pick(G, e) {
      const S = B25(), now = G.t, out = [];
      const models = { predict: S.predictExplodeModel, ring: S.ringBulletModel, follow: S.followBulletModel, trace: S.traceBulletModel };
      for (const [k, m] of Object.entries(models)) {
        if (!m) continue;
        const w = e.enraged ? m.angryWeight : m.normalWeight;
        if (w > 0 && now - ((e.skillAt || {})[k] || -99) >= m.cd) for (let i = 0; i < w; i++) out.push(k);
      }
      return out.length ? out : ['ring'];
    },
    start: new Proxy({}, { get: (t, k) => (G, e) => { (e.skillAt = e.skillAt || {})[k] = G.t; boss25Skill(G, e, k); } })
  };
  function boss25Skill(G, e, k) {
    const S = B25();
    const at = (dly, fn) => e.arena.objs.push({ t: 0, dur: dly, update(G2, o) { if (o.t < o.dur) return true; if (!e.deathDone) fn(G2); return false; } });
    if (k === 'predict') {
      // 5 thiên thạch nối nhau đúng chỗ người chơi (directlyHitPlayerRate 100), cách 0.3 s, 4 sát thương [ĐO predictExplodeModel]
      const m = S.predictExplodeModel || {};
      for (let i = 0; i < (m.releaseCount || 5); i++) at((m.initDelay || 0.3) + i * (m.releaseDuration || 0.3), G2 => {
        const p = G2.player;
        meteor(G2, e, p.x, p.y, goRef(m.explodeBullet && m.explodeBullet.bulletProto) || 'e_fireball', (m.explodeBullet && m.explodeBullet.damage) || 4);
      });
    } else if (k === 'ring') {
      // 3 lượt × 6 cụm bullet_e_88 (một vuông giữa sáu tròn, xoay), tốc 8, 3 sát thương, cách 0.4 s [ĐO ringBulletModel]
      const m = S.ringBulletModel || {}, b = bulletOf(m.bulletInfo);
      for (let i = 0; i < (m.releaseTimes || 3); i++) at((m.initDelay || 0.5) + i * (m.releaseDuration || 0.4), G2 => {
        const off = m.releasePositionOffset || { x: 2, y: 1 };
        const x = e.x + off.x * U * 0.5 * e.face, y = e.y - off.y * U - 8, a0 = aimAt(G2, x, y) + i * 0.3;
        for (let j = 0; j < (m.bulletCount || 6); j++) formation(G2, e, b.name || 'bullet_e_88', x, y, a0 + j * TAU / (m.bulletCount || 6), { spd: b.spd || 8, dmg: b.dmg || 3, h: 14 });
      });
    } else if (k === 'follow') {
      // bullet_e_87: 4 cầu cách tâm 2 đơn vị quay quanh trùm 10 giây (4 sát thương); sau 1 s, mỗi 2 s mỗi cầu bắn bullet_e_4 bám (tốc 6, 3 sát thương)
      // [ĐO followBulletModel + BulletFollow + DelayBulletCreator]
      const m = S.followBulletModel || {}, b = bulletOf(m.bulletInfo);
      const I = bulInfo(b.name || 'bullet_e_87'), dc = (I && I.mbs.DelayBulletCreator) || {}, kid = bulletOf(dc.bullet);
      const dur = m.duration || 10, a0 = SK.rand() * TAU, oy = ((m.positionOffset && m.positionOffset.y) || 1.68) * U;
      const balls = (I ? I.parts : []).map(pt => {
        const bl = { side: 'e', kind: 'arrow', x: e.x, y: e.y, h: 14, vx: 0, vy: 0, ang: 0, dmg: dmgOf(b.dmg || 4), repel: 0, r: 5, life: dur, sprite: frameOf(pt.f) || 'bullet_37', pname: b.name || 'bullet_e_87' };
        bl.rad = Math.hypot(pt.x, pt.y) * U; bl.off = Math.atan2(-pt.y, pt.x);
        G.bullets.push(bl);
        return bl;
      });
      let a = a0, fireAt = dc.initDelay || 1;
      e.arena.objs.push({ t: 0, dur, update(G2, o, dt) {
        if (e.deathDone) { for (const bl of balls) bl.dead = true; return false; }
        a += ((I && I.main.rotate_angle) || 360) * DEG * dt;
        for (const bl of balls) {
          if (bl.dead && o.t < o.dur) { bl.dead = false; bl.life = dur - o.t; G2.bullets.push(bl); }
          bl.x = e.x + Math.cos(a + bl.off) * bl.rad; bl.y = e.y - oy + Math.sin(a + bl.off) * bl.rad;
        }
        if (o.t >= fireAt) {
          fireAt += dc.duration || 2;
          for (const bl of balls) fire(G2, e, kid.name || 'bullet_e_4', bl.x, bl.y, a + bl.off, { spd: kid.spd || 6, dmg: kid.dmg || 3, h: 14, home: { interval: 0.1, delay: 0.3, limit: 15, turn: 15 } });
        }
        if (o.t >= o.dur) { for (const bl of balls) bl.dead = true; return false; }
        return true;
      } });
    } else if (k === 'trace') {
      // Chỉ khi nổi giận: lao 7 đơn vị trong 0.47 s theo đường cong moveCurve, sóng effect_shock1, lưỡi liềm bullet_e_29 (tốc 8)
      // + 3 giáo bám bullet_e_89 lệch 30° (tốc 5), 4 sát thương [ĐO traceBulletModel]
      const m = S.traceBulletModel || {}, mb = bulletOf(m.mainBullet), tb = bulletOf(m.traceBullet);
      at(m.initDelay || 0.5, G2 => {
        const a = aimAt(G2, e.x, e.y - 8), dist = (m.moveAmount || 7) * U, dur = m.moveDuration || 0.4667;
        const x0 = e.x, y0 = e.y, curve = m.moveCurve && m.moveCurve.m_Curve;
        blast(G2, e.x, e.y, 16, (m.shockBullet && m.shockBullet.damage) || 4, 'effect_shock1');
        e.arena.objs.push({ t: 0, dur, update(G3, o) {
          const k2 = SK.clamp(o.t / dur, 0, 1), c = curve ? hermite(curve, k2) : k2;
          const tx = x0 + Math.cos(a) * dist * c, ty = y0 + Math.sin(a) * dist * c;
          SK.moveBox(G3.map, e, tx - e.x, ty - e.y, e.r);
          return o.t < o.dur;
        } });
        const off = m.mainBulletReleaseOffset || { x: 1.5, y: 0.9 };
        const x = e.x + off.x * U * 0.5 * e.face, y = e.y - off.y * U;
        fire(G2, e, mb.name || 'bullet_e_29', x, y, a, { spd: mb.spd || 8, dmg: mb.dmg || 4, h: e.y - y });
        for (let j = 0; j < (m.releaseCount || 3); j++) {
          fire(G2, e, tb.name || 'bullet_e_89', x, y, a + (j - 1) * (m.traceBulletAngle || 30) * DEG, { spd: tb.spd || 5, dmg: tb.dmg || 4, h: e.y - y });
        }
      });
    }
  }
  // AnimationCurve của Unity (khoá time/value/inSlope/outSlope) — Hermite bậc ba.
  function hermite(keys, t) {
    if (t <= keys[0].time) return keys[0].value;
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i], b = keys[i + 1];
      if (t > b.time) continue;
      const dt = b.time - a.time, s = (t - a.time) / dt, s2 = s * s, s3 = s2 * s;
      return (2 * s3 - 3 * s2 + 1) * a.value + (s3 - 2 * s2 + s) * a.outSlope * dt + (-2 * s3 + 3 * s2) * b.value + (s3 - s2) * b.inSlope * dt;
    }
    return keys[keys.length - 1].value;
  }

  // Đồ nghề cho trùm ở tệp riêng: rig, đạn thật, nổ, điểm nút, ngắm, sàn đấu (e.arena.objs), quái con.
  SK.BOSS_KIT = { TAU, DEG, U, B86, BUL, dmgOf, angTo, smooth, frameOf, goRef, rigPlay, rigState, rigTime, rigPoint, rigAng, rigPose,
    sfx, bulInfo, fire, explode, blast, hurtIn, formation, aimAt, point, aimHand, roomPoint, clampRoom, wander, setMove,
    startAttack, meteor, spawnMinion, bossProp, beam, beamLen, shortLaser, firePool, gasPool, throwEgg, groupDone };

  // ---------------------------------------------------------------- bảng trùm
  const AIS = { boss08, boss07, boss14, boss19, boss25, boss01, boss01_2, boss02, boss20, boss11, boss18, boss12_1, boss12_2 };
  // Bể ghi boss12_parent (BossAI12Parent: boss1_obj/boss2_obj) [ĐO] = hai rồng cùng lúc.
  const GROUPS = { boss12_parent: ['boss12_1', 'boss12_2'] };
  SK.BOSS_AIS = AIS;
  // Bể trùm theo theme [ĐO enemies.LevelKey + IsBoss]; chọn đều [ƯỚC LƯỢNG]; chỉ giữ trùm đã có AI.
  // Vùng đất mà chưa trùm nào của nó có AI thì mượn bể của vùng gốc cùng tầng [SUY] (GAPS.md).
  function poolOf(theme) {
    const ok = id => AIS[id] || GROUPS[id];
    const own = (B86.pool[theme] || []).filter(ok);
    if (own.length) return own;
    const th = SK.D.themes[theme];
    return (B86.pool[th ? SK.tierAnchor(th.level) : 'forest'] || []).filter(ok);
  }

  function makeBoss(G, pid, room) {
    const ent = B86.bosses[pid], def = AIS[pid];
    const ai = Object.values(ent.mbs || {}).find(v => v && v.shoot_cd != null) || {};
    const hp = Math.round((ent.hp || 500) * HP_FACTOR * (G.badass ? DS.badass.bossHp : 1));
    const p = G.player, T = SK.TILE;
    let [x, y] = W.roomCenter(room);
    y += 4;
    const grp = Object.keys(GROUPS).find(g => GROUPS[g].indexOf(pid) >= 0);
    if (grp) {
      // doubleboss_offset {x: 2} [ĐO]: hai rồng đứng hai bên tâm phòng
      const off = (ai.doubleboss_offset && ai.doubleboss_offset.x) || 2;
      x += (GROUPS[grp].indexOf(pid) ? 1 : -1) * off * U;
    } else if (def.walk !== false && Math.hypot(p.x - x, p.y - y) < 72) {
      const a = angTo(p.x, p.y, x, y);
      [x, y] = SK.freeNear([x + Math.cos(a) * 4 * T, y + Math.sin(a) * 4 * T]);
    }
    const root = ent.rig.nodes[0].col && ent.rig.nodes[0].col.box;
    const hb = root ? { size: [root.size[0] * U, root.size[1] * U], off: [root.off[0] * U, root.off[1] * U] } : { size: [20, 28], off: [0, 14] };
    const Rg = rigNew(ent.rig);
    const nodes = {};
    ent.rig.nodes.forEach((n, i) => { nodes[n.n] = i; });
    const e = {
      id: pid, bossKey: pid, def, ai, ent, R: Rg, nodes, speed: ent.speed || 4,
      d: { shadow: null, shadowOff: [0, 1e5], speed: ent.speed || 4 },
      p: { kinematic: 1, reward_rate: ai.reward_rate != null ? ai.reward_rate : 100, reward_value: ai.reward_value || [0, 0, 0, 10] },
      cls: 'SKBoss', rawCls: 'SKBoss', x, y, kx: 0, ky: 0, hp, hpMax: hp, face: p.x > x ? 1 : -1, aim: 0,
      st: 'spawn', stT: 1e9, t: 0, cd: 0, room, elite: false, flash: 0, w: null, anims: { dead: true },
      r: Math.max(6, hb.size[0] / 2), hb, scale: 1, burst: 0,
      used: {}, busy: 0, atk: null, enraged: false, moving: false, deathDone: false, deathT: 0,
      lastX: x, lastY: y, draw: drawBoss, bossGroup: grp || pid, badass: !!G.badass
    };
    rigPlay(Rg, def.idle);
    e.arena = makeArena(G, e);
    return e;
  }
  for (const pid of Object.keys(AIS)) SK.CUSTOM_ENEMIES[pid] = (G, x, y, room) => makeBoss(G, pid, room);
  // Trùm viết ở tệp riêng (js/bosses/<pid>.js, nạp sau tệp này): SK.bossRegister(pid, def[, nhóm]) + bộ đồ nghề SK.BOSS_KIT.
  SK.bossRegister = function (pid, def, group) {
    if (!B86.bosses[pid] && !group) { SK.warnOnce('breg' + pid, 'boss ' + pid + ' not in sk-bosses86'); return false; }
    if (group) { GROUPS[pid] = group; return true; }
    AIS[pid] = def;
    SK.CUSTOM_ENEMIES[pid] = (G, x, y, room) => makeBoss(G, pid, room);
    return true;
  };

  // Trùm x-5: chọn đều trong bể của theme; có biến thể (SubspeciesBoss) thì 30% ra biến thể [ĐO].
  SK.bossWaves = function (G) {
    const f = SK.bossDebug.force;
    let id = f && (AIS[f] || GROUPS[f]) ? f : null;
    if (!id) {
      const all = poolOf(G.stage.theme);
      // Khu Thí Luyện: cố tránh gặp lại trùm đã đánh trong lượt (G.bossSeen) [SUY].
      const fresh = all.filter(x => (G.bossSeen || []).indexOf(x) < 0), list = fresh.length ? fresh : all;
      id = list.length ? SK.pick(list) : Object.keys(AIS)[0];
      if (G.bossSeen) G.bossSeen.push(id);
      const sub = B86.bosses[id] && B86.bosses[id].sub;
      if (sub && AIS[sub] && SK.rand() * 100 < SUBSPECIES_RATE) id = sub;
    }
    if (f && GROUPS[f]) id = f;
    return [GROUPS[id] ? GROUPS[id].slice() : [id]];
  };
  // Não trùm chạy trong prop sàn đấu; core vẫn gọi SK.AI[cls] ở trạng thái thường.
  SK.AI.SKBoss = function () {};

  function onBossDeath(G, e) {
    e.deathDone = true; e.deathT = 0; e.atk = null; e.dashing = null;
    e.x = e.lastX; e.y = e.lastY;
    const A = e.arena;
    freeze(G, A, false);
    A.objs = [];
    const last = groupDone(G, e);
    if (last) {
      // Trùm (cả nhóm) chết: xoá đạn, quái con và vật triệu hồi trong phòng
      A.tracked = [];
      for (const b of G.bullets) if (b.side === 'e') b.dead = true;
      for (const o of G.enemies) if (o !== e && o.room === e.room && o.st !== 'dead' && !(o.bossKey && o.bossGroup === e.bossGroup)) { o.st = 'dead'; o.hp = 0; o.stT = 0; }
    } else for (const b of A.tracked) b.dead = true;
    const hi = e.nodes[e.def.hand];
    if (hi != null) delete e.R.ov[hi];
    if (e.def.dead) e.def.dead(G, e);
    rigPlay(e.R, e.def.deadState || (e.R.def.anims[0].layers[0].states.dead ? 'dead' : Object.keys(e.R.def.anims[0].layers[0].states).find(k => /dead/.test(k))));
    for (const a of e.R.anims) for (const ly of a.layers) for (const k of Object.keys(ly.L.states)) if (/dead/.test(k) && a.node !== 0) { ly.st = k; ly.t = 0; }
    for (const a of e.R.anims) if (a.node === 0) for (const ly of a.layers.slice(1)) { const k = Object.keys(ly.L.states).find(s => /dead/.test(s)); if (k) { ly.st = k; ly.t = 0; } }
    G.shake = Math.max(G.shake, 5);
  }
  SK.on('enemyKill', (G, e) => { if (e.bossKey && e.def && !e.deathDone) onBossDeath(G, e); });

  // Chạm thân (CollisionDamage) — chỉ trùm có trường contact.
  function contactTick(G, e) {
    if (!e.def.contact || e.deathDone || e.st === 'spawn') return;
    const p = G.player;
    if (Math.abs(p.x - e.x) < e.hb.size[0] / 2 + 4 && Math.abs((p.y - 6) - (e.y - e.hb.off[1])) < e.hb.size[1] / 2 + 4) SK.hurtPlayer(G, dmgOf(e.def.contact));
  }

  // ---------------------------------------------------------------- HUD: màn giới thiệu BossInfo + thanh máu
  function roomBosses(G) { return G.enemies.filter(e => e.bossKey && e.arena && e.room === G.room && !e.arena.done); }
  // Kéo camera về trùm lúc giới thiệu: render() nội suy 18% về phía người chơi mỗi khung.
  function focusCam(G, e, k) {
    const v = SK.view, p = G.player, lead = p.target ? 14 : 6;
    const tx = p.x - v.w / 2 + Math.cos(p.aim) * lead, ty = p.y - 10 - v.h / 2 + Math.sin(p.aim) * lead;
    const dx = tx + (e.x - v.w / 2 - tx) * k, dy = ty + (e.y - 20 - v.h / 2 - ty) * k;
    G.cam.x = (dx - 0.18 * tx) / 0.82; G.cam.y = (dy - 0.18 * ty) / 0.82;
  }

  // Canvas UI thật: tham chiếu 1280×720, khớp theo chiều cao [ĐO CanvasScaler scene_game].
  function uiNodeRect(v, n, P) {
    const k = v.h / 720, W0 = v.w / k;
    const ax = P.ax != null ? P.ax : n.pos[0], ay = P.ay != null ? P.ay : n.pos[1];
    const cx = (n.amin[0] - 0.5) * W0 + ax, cy = (n.amin[1] - 0.5) * 720 + ay;
    return { k, x: v.w / 2 + cx * k, y: v.h / 2 - cy * k, w: n.size[0] * k, h: n.size[1] * k };
  }
  function drawIntro(ctx, G, e, t) {
    const v = SK.view, info = B86.info[e.bossGroup] || B86.info[e.id];
    if (!info) return;
    const N = info.nodes, st = info.anims[0] && info.anims[0].layers[0].states.show_boss_info;
    const P = N.map(() => ({}));
    if (st) for (const c of st.cv) P[c.n][c.k] = c.k === 'spr' ? c.s : cval(c.s, Math.min(t, st.len));
    const on = i => (P[i].on == null || P[i].on > 0.5) && (P[i].en == null || P[i].en > 0.5);
    const idx = n => N.findIndex(x => x.n === n);
    const bg = idx('bg'), im = idx('Image'), m1 = idx('mask1'), m2 = idx('mask2'), tx = idx('Text1');
    ctx.save();
    // Nền màu riêng từng trùm, alpha theo clip [ĐO bg Image.m_Color + đường ca]
    if (bg >= 0 && on(bg)) {
      const c = N[bg].c || [0, 0, 0, 1], a = P[bg].ca != null ? P[bg].ca : c[3];
      ctx.fillStyle = 'rgba(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ',' + SK.clamp(a, 0, 1) + ')';
      ctx.fillRect(0, 0, v.w, v.h);
    }
    const rectNode = i => {
      if (i < 0 || !on(i)) return;
      const n = N[i], r = uiNodeRect(v, n, P[i]);
      ctx.save();
      ctx.translate(r.x, r.y); ctx.rotate(-(n.r || 0) * DEG);
      ctx.scale(n.sx || 1, n.sy || 1);
      return { n, r };
    };
    // Chân dung: Image 300×300 phóng (−3, 3) [ĐO]
    let q = rectNode(im);
    if (q) {
      const f = uiFrame((q.n.img || '').replace(/^Sprite:/, ''));
      const fr = f && AT.f[f];
      if (fr) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(SK.pages[fr[0]], fr[1], fr[2], fr[3], fr[4], -q.r.w / 2, -q.r.h / 2, q.r.w, q.r.h);
      }
      ctx.restore();
    }
    for (const i of [m1, m2]) {
      q = rectNode(i);
      if (!q) continue;
      const c = q.n.c || [0.1255, 0.1255, 0.1255, 1];
      ctx.fillStyle = 'rgba(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ',' + c[3] + ')';
      ctx.fillRect(-q.r.w / 2, -q.r.h / 2, q.r.w, q.r.h);
      ctx.restore();
    }
    // Tên: Text1 cỡ 150 trong khung 800×240, bóng (0,−12) đen 50% [ĐO]; chữ là tên tiếng Việt chính thức (localization)
    q = rectNode(tx);
    if (q) {
      const name = (e.ent.name && (e.ent.name.vi || e.ent.name.en)) || e.id;
      const words = name.split(' ');
      let size = Math.round(150 * q.r.k), lines = [name];
      ctx.font = size + 'px ' + SK.FONT;
      if (ctx.measureText(name).width > q.r.w && words.length > 1) {
        const mid = Math.ceil(words.length / 2);
        lines = [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
      }
      const widest = () => Math.max(...lines.map(l => ctx.measureText(l).width));
      while (size > 8 && (widest() > q.r.w || size * lines.length * 1.05 > q.r.h * 1.3)) { size--; ctx.font = size + 'px ' + SK.FONT; }
      const sh = q.n.shadow && q.n.shadow.d ? q.n.shadow.d[1] * q.r.k : -3;
      lines.forEach((l, j) => {
        const yy = (j - (lines.length - 1) / 2) * size * 1.05;
        SK.text(ctx, l, 0, yy - sh, size, 'rgba(0,0,0,0.5)', 'center');
        SK.text(ctx, l, 0, yy, size, '#ffffff', 'center');
      });
      ctx.restore();
    }
    ctx.restore();
  }

  // Thanh máu boss_hp: neo giữa-trên, y −51.9; nền 410×35 #252525, máu 400×25 màu (0.91, 0.23, 0.23) [ĐO]
  function drawBar(ctx, G, e, hp, hpMax) {
    const v = SK.view, info = B86.info[e.bossGroup] || B86.info[e.id];
    const N = info ? info.nodes : [];
    const hpN = N.find(n => n.n === 'boss_hp'), bgN = N.find(n => n.n === 'boss_hp/bg'), hN = N.find(n => n.n === 'boss_hp/hp');
    const k = v.h / 720;
    const cy = 51.9 * k + (hpN ? (hpN.piv[1] - 0.8) : 0);
    const bw = (bgN ? bgN.size[0] : 410) * k, bh = (bgN ? bgN.size[1] : 35) * k;
    const hw = (hN ? hN.size[0] : 400) * k, hh = (hN ? hN.size[1] : 25) * k;
    const x0 = v.w / 2;
    const bc = (bgN && bgN.c) || [0.1451, 0.1451, 0.1451, 1], hc = (hN && hN.c) || [0.9118, 0.2346, 0.2346, 1];
    const rgb = c => 'rgb(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ')';
    ctx.fillStyle = rgb(bc); ctx.fillRect(Math.round(x0 - bw / 2), Math.round(cy - bh / 2), Math.round(bw), Math.round(bh));
    const ratio = SK.clamp(hp / hpMax, 0, 1);
    const f = uiFrame((hN && hN.img) || 'ui_12'), fr = f && AT.f[f];
    const hx = Math.round(x0 - hw / 2), hy = Math.round(cy - hh / 2), w = Math.max(0, Math.round(hw * ratio));
    if (fr && w > 0) {
      ctx.save();
      ctx.drawImage(SK.pages[fr[0]], fr[1], fr[2], fr[3], fr[4], hx, hy, w, Math.round(hh));
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = rgb(hc); ctx.fillRect(hx, hy, w, Math.round(hh));
      ctx.restore();
    } else if (w > 0) { ctx.fillStyle = rgb(hc); ctx.fillRect(hx, hy, w, Math.round(hh)); }
    return { x: Math.round(x0 - bw / 2), y: Math.round(cy - bh / 2), w: Math.round(bw), h: Math.round(bh) };
  }

  SK.on('hud', (ctx, G) => {
    const H = SK.bossHud, list = roomBosses(G), e = list[0];
    H.visible = false; H.intro = false;
    if (!e) return;
    const A = e.arena;
    // Nhóm (hai rồng): thanh máu là tổng máu cả nhóm [WIKI]
    H.name = e.ent.name && e.ent.name.vi; H.key = e.bossGroup;
    H.hp = list.reduce((s, b) => s + Math.max(0, b.hp), 0); H.hpMax = list.reduce((s, b) => s + b.hpMax, 0);
    if (A.introT < INTRO_LEN) {
      H.intro = true;
      focusCam(G, e, smooth(Math.min(A.introT / 0.4, (INTRO_LEN - A.introT) / 0.5)));
      drawIntro(ctx, G, e, A.introT);
      return;
    }
    if (list.every(b => b.deathDone)) return;
    H.visible = true;
    H.rect = drawBar(ctx, G, e, H.hp, H.hpMax);
  });

  // Cho kiểm thử/xem thử: rig + đạn
  SK.bossRig = { rigNew, rigPlay, rigTick, rigDraw, rigPose, frameOf, bulInfo, B86 };
})();
