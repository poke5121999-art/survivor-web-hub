// Kỹ năng nhân vật: đăng ký vào SK.SKILLS[id] (id = slug tên kỹ năng 1 trên wiki), kèm nội tại đơn giản.
// Số [WIKI] lấy từ tools/wiki/heroes.json + trang nhân vật trên soul-knight.fandom.com; hình từ prefab thật
// trong common.ab (liệt kê ở tools/extra/skills.json).
(function () {
  'use strict';
  const SK = window.SK, D = SK.D, DS = SK.DS, W = SK.world, U = SK.PPU, T = SK.TILE;
  const R = DS.rules;
  const I = SK.input;

  // ---------------------------------------------------------------- tra hình
  const XP = (D.extra && D.extra.png) || {};
  const XS0 = (D.extra && D.extra.sprites) || {}, XS = {};
  // Cùng một sprite nằm ở hai bundle thì bản thứ hai mang đuôi '~2'; bỏ đi cho khỏi lặp khung.
  for (const k in XS0) XS[k] = XS0[k].filter(n => n.indexOf('~') < 0).sort((x, y) => x.localeCompare(y, 'en', { numeric: true }));
  const pngAnim = k => XP[k] || null;
  const firstFrame = k => { const a = XP[k] && SK.anim(XP[k]); return a ? a.f[0] : null; };
  // Khung SpriteAnimation ghi '@tên'; khung nào không có trong atlas thì bỏ.
  const saFrames = m => (m && m.sprites ? m.sprites.map(s => String(s).replace(/^@/, '')).filter(SK.frame) : []);

  // Quad cộng sáng Unity: vẽ quầng sáng bằng gradient đúng màu nhuộm.
  const GLOW = { texiao_01: 20, light_01: 20, UISprite: 8 };
  function glow(ctx, x, y, r, c, a) {
    const col = c || [1, 1, 1, 0.3];
    const rgb = (col[0] * 255 | 0) + ',' + (col[1] * 255 | 0) + ',' + (col[2] * 255 | 0);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(' + rgb + ',' + Math.min(1, col[3] * 2.2 * (a == null ? 1 : a)) + ')');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
  }

  // Vẽ cây prefab thật: hỗ trợ Animator (p.a), SpriteAnimation (mbs), màu nhuộm, quầng cộng sáng.
  // o: {t, state, scale, flip, rot, alpha, skip(part), glow:false}
  function drawRip(ctx, parts, x, y, o) {
    if (!parts) return false;
    o = o || {};
    const t = o.t || 0, k = o.scale || 1;
    const list = parts._ord || (parts._ord = ordered(parts));
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    if (o.rot) ctx.rotate(o.rot);
    if (o.flip) ctx.scale(-1, 1);
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    let any = false;
    for (const p of list) {
      if (o.skip && o.skip(p)) continue;
      let f = p.f;
      if (p.a) {
        const key = (o.state && p.a[o.state]) || p.a[Object.keys(p.a)[0]];
        if (SK.anim(key)) f = SK.animFrame(key, t);
      }
      const sa = p.mbs && (p.mbs.SpriteAnimation || p.mbs.SpriteAnimationFadeEnd);
      if (sa) {
        const fr = saFrames(sa);
        if (fr.length) {
          let i = Math.floor(t * (sa.frameRate || 12));
          i = sa.mode === 1 ? Math.min(fr.length - 1, i) : i % fr.length;
          f = fr[i];
        }
      }
      if (!f) continue;
      const sc = p.sc || [1, 1];
      const px = p.at[0] * k, py = -p.at[1] * k;
      if (GLOW[f]) {
        if (o.glow !== false) glow(ctx, px, py, GLOW[f] * Math.abs(sc[0]) * k, p.c);
        continue;
      }
      if (Math.abs(sc[0]) > 6 || Math.abs(sc[1]) > 6) continue;
      const opt = { sx: sc[0] * k, sy: sc[1] * k, flip: !!p.fx };
      any = (p.c ? SK.drawTinted(ctx, f, px, py, p.c, opt) : SK.draw(ctx, f, px, py, opt)) || any;
    }
    ctx.restore();
    return any;
  }
  SK.drawRip = drawRip;
  // Animator đặt ở nút cha không có hình nhưng clip đổi sprite của nút con: chuyển hoạt ảnh xuống con đầu tiên có hình.
  function ordered(parts) {
    const ps = parts.map(p => Object.assign({}, p));
    // Tỉ lệ của nút gốc (vd. sword_dash lật -1) áp cho cả cây: prefab_parts chỉ ghi tỉ lệ riêng từng nút.
    const root = ps[0] && ps[0].n.charAt(0) !== '/' ? ps[0] : null;
    if (root && root.sc) {
      const [rx, ry] = root.sc;
      for (const p of ps) if (p !== root) { p.at = [p.at[0] * rx, p.at[1] * ry]; p.sc = [(p.sc ? p.sc[0] : 1) * rx, (p.sc ? p.sc[1] : 1) * ry]; }
      delete root.sc;
    }
    for (const p of ps) {
      if (!p.a || p.f) continue;
      const pre = p.n.charAt(0) === '/' ? p.n + '/' : '/';
      const kid = ps.find(q => q !== p && q.f && !q.a && !GLOW[q.f] && q.n.indexOf(pre) === 0);
      if (kid) { kid.a = p.a; delete p.a; }
    }
    return ps.map((p, i) => [p, i]).sort((a, b) => ((a[0].o || 0) - (b[0].o || 0)) || (a[1] - b[1])).map(q => q[0]);
  }
  // Thời lượng hoạt ảnh dài nhất trong prefab (Animator hoặc SpriteAnimation).
  function ripLen(parts, state) {
    let len = 0;
    for (const p of parts || []) {
      if (p.a) len = Math.max(len, SK.animLen((state && p.a[state]) || p.a[Object.keys(p.a)[0]]));
      const sa = p.mbs && (p.mbs.SpriteAnimation || p.mbs.SpriteAnimationFadeEnd);
      if (sa) len = Math.max(len, saFrames(sa).length / (sa.frameRate || 12));
    }
    return len;
  }

  // Hiệu ứng một lần (prefab thật) đặt vào G.props để có thứ tự vẽ theo y.
  function ripFx(G, name, x, y, o) {
    const parts = SK.prefab(name);
    if (!parts) { SK.warnOnce('rip' + name, 'skill prefab missing: ' + name); return null; }
    o = o || {};
    const dur = o.dur || ripLen(parts, o.state) || 0.5;
    const pr = {
      x, y: y + (o.dy || 0), t: 0, ground: o.ground, top: o.top,
      update(G2, q, dt) {
        q.t += dt;
        if (o.follow) { q.x = o.follow.x + (o.ox || 0); q.fy = o.follow.y + (o.oy || 0); if (!o.ground && !o.top) q.y = q.fy + (o.dy || 0); }
        if (q.t >= dur) q.gone = true;
      },
      draw(ctx, G2, q) {
        const k = q.t / dur;
        // grow: sprite tĩnh (vòng phép, vòng hồi máu) nở ra rồi mờ dần như tween của Unity [ƯỚC LƯỢNG].
        const a = o.fade || o.grow ? Math.max(0, 1 - Math.max(0, k - 0.4) / 0.6) : 1;
        const sc = (o.scale || 1) * (o.grow ? 0.55 + 0.45 * Math.min(1, k * 3) : 1);
        drawRip(ctx, parts, q.x, q.fy != null ? q.fy : y, { t: q.t, state: o.state, scale: sc, rot: o.rot, flip: o.flip, alpha: (o.alpha == null ? 1 : o.alpha) * a });
      }
    };
    if (o.ground) pr.y = -1e9 + y;
    if (o.top) pr.y = 1e9;
    G.props.push(pr);
    return pr;
  }

  // ---------------------------------------------------------------- tiện ích chiến đấu
  const alive = e => e.st !== 'spawn' && e.st !== 'dead' && e.hp > 0;
  const ec = e => [e.x + ((e.hb.off && e.hb.off[0]) || 0) * e.face * e.scale, e.y - e.hb.off[1] * e.scale];
  const enemyTop = e => e.y - (e.hb.off[1] + e.hb.size[1] / 2) * e.scale;
  function nearest(G, x, y, range, o) {
    let best = null, bd = range;
    for (const e of G.enemies) {
      if (!alive(e) || (o && o.skip && o.skip(e))) continue;
      const [cx, cy] = ec(e), d = Math.hypot(cx - x, cy - y);
      if (d >= bd) continue;
      if (o && o.los && !W.los(G.map, x, y, cx, cy)) continue;
      best = e; bd = d;
    }
    return best;
  }
  function inRadius(G, x, y, r) {
    return G.enemies.filter(e => { if (!alive(e)) return false; const [cx, cy] = ec(e); return Math.hypot(cx - x, (cy - y)) < r + e.r; });
  }
  function hit(G, p, e, dmg, o) {
    o = o || {};
    const crit = o.crit != null ? o.crit : (o.critChance != null ? SK.rand() * 100 < o.critChance : false);
    const [cx, cy] = ec(e);
    const ang = o.ang != null ? o.ang : Math.atan2(cy - p.y, e.x - p.x);
    return SK.hurtEnemy(G, e, Math.round(dmg * (o.noMul ? 1 : (p.dmgMul || 1)) * (crit ? R.critMult : 1)), crit, ang, o.repel || 0);
  }
  // Choáng: AI01-04 tự đếm e.stT ở trạng thái 'stun'. _stunT chỉ để vẽ biểu tượng.
  function stun(e, t) {
    if (!alive(e)) return;
    if (e.st === 'stun') e.stT = Math.max(e.stT, t); else { e.st = 'stun'; e.stT = t; }
    e._stunT = Math.max(e._stunT || 0, t);
  }
  function aimDir(p) {
    const mv = I.moveVec();
    if (Math.hypot(mv.x, mv.y) > 0.1) return Math.atan2(mv.y, mv.x);
    return p.target ? p.aim : (p.face > 0 ? 0 : Math.PI);
  }

  // Hệ số nhân dùng chung với mô-đun khác: mỗi nguồn giữ phần của mình, nhân/chia đúng phần đó.
  function setMul(p, field, key, f) {
    p._mulSrc = p._mulSrc || {};
    const k = field + ':' + key, prev = p._mulSrc[k] || 1;
    if (prev === f) return;
    p[field] = (p[field] || 1) / prev * f;
    if (f === 1) delete p._mulSrc[k]; else p._mulSrc[k] = f;
  }
  // Chuỗi chặn sát thương: kỹ năng / nội tại thêm bớt bộ lọc, p.onHurt gọi lần lượt.
  function hurtMods(p) {
    if (!p._hurt) {
      p._hurt = {};
      const prev = p.onHurt;
      p.onHurt = function (G, pl, dmg) {
        if (prev) { dmg = prev(G, pl, dmg); if (!(dmg > 0)) return 0; }
        for (const k in pl._hurt) { dmg = pl._hurt[k](G, pl, dmg); if (!(dmg > 0)) return 0; }
        return dmg;
      };
    }
    return p._hurt;
  }
  // Đạn địch đi xuyên qua (lăn, lướt): dời hộp trúng đòn đi xa rồi trả lại khi xong.
  function ghost(p, on) {
    if (on && !p._hOrig) { p._hOrig = p.h; p.h = Object.assign(Object.create(p.h), { hurt: { size: [0, 0], off: [0, -1e5] } }); }
    if (!on && p._hOrig) { p.h = p._hOrig; p._hOrig = null; }
  }
  function swapAnims(p, key, runKey) {
    if (key) { if (!p._animsOrig) p._animsOrig = p.anims; p.anims = { idle: key, run: runKey || key, dead: p._animsOrig.dead }; }
    else if (p._animsOrig) { p.anims = p._animsOrig; p._animsOrig = null; }
  }
  // Tách một đoạn khung của hoạt ảnh bóc từ PNG thành khoá riêng (vd. 8 khung đứng + 8 khung chạy).
  function subAnim(src, a, b, name) {
    const A = src && SK.anim(src); if (!A) return src;
    const k = 'sk/' + name;
    if (!D.anims[k]) D.anims[k] = { f: A.f.slice(a, b), d: A.d.slice(a, b), loop: true };
    return k;
  }
  function healFx(G, p) { ripFx(G, 'effect_health_skill', p.x, p.y - 2, { follow: p, oy: -2, ground: true, grow: true, dur: 0.7 }); }

  // ---------------------------------------------------------------- vẽ tia sét
  function zigzag(x0, y0, x1, y1, seg, amp) {
    const pts = [[x0, y0]], dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
    const n = Math.max(2, Math.round(L / seg)), nx = -dy / L, ny = dx / L;
    for (let i = 1; i < n; i++) { const o = SK.randf(-amp, amp); pts.push([x0 + dx * i / n + nx * o, y0 + dy * i / n + ny * o]); }
    pts.push([x1, y1]);
    return pts;
  }
  function strokeBolt(ctx, pts, color, a) {
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = color; ctx.lineWidth = 3;
    ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
    ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
    ctx.restore();
  }
  // Đầu mút tia: sprite "thunder 1_*" của lightning_chain_fx [ĐO màu 0.35,1,0.95].
  const CHAIN = () => { const pf = SK.prefab('lightning_chain_fx'); return pf ? saFrames(SK.prefabMbs(pf, 'SpriteAnimation')) : []; };
  function boltEnd(ctx, x, y, t, c) {
    const fr = CHAIN(); if (!fr.length) return;
    SK.drawTinted(ctx, fr[Math.floor(t * 32) % fr.length], x, y, c || [0.353, 1, 0.951, 1], { sx: 0.6, sy: 0.6 });
  }
  // Tia từ trời: khung effect02_* (tia dọc 16×64 của prefab proj_thunder) kéo dài từ mép trên xuống mục tiêu,
  // quầng sáng màu 'light' của prefab lightning_0 [ĐO 0.99,1,0.287], tia lửa 'thunder 1_*' ở điểm chạm.
  function skyBolt(G, x, y) {
    const fr = ['effect02_0', 'effect02_1', 'effect02_2', 'effect02_3'].filter(SK.frame);
    const pf = SK.prefab('lightning_0'), light = pf && pf.find(q => q.n === '/light');
    const H = 170, dur = 0.34;
    G.props.push({
      x, y: 1e9, t: 0,
      update(G2, q, dt) { q.t += dt; if (q.t >= dur) q.gone = true; },
      draw(ctx, G2, q) {
        const a = 1 - q.t / dur;
        glow(ctx, x, y, 44, light ? light.c : [0.99, 1, 0.287, 0.2], a);
        ctx.save(); ctx.globalAlpha *= Math.min(1, a * 1.6);
        if (fr.length) { const f = fr[Math.floor(q.t * 30) % fr.length]; SK.draw(ctx, f, x, y, { sx: 1.3, sy: H / 64 }); }
        else strokeBolt(ctx, zigzag(x, y - H, x, y, 10, 5), '#5ad8ff', 1);
        ctx.restore();
        boltEnd(ctx, x, y, q.t);
      }
    });
  }
  function boltFx(G, x0, y0, x1, y1, o) {
    o = o || {};
    const dur = o.dur || 0.28;
    G.props.push({
      x: x1, y: 1e9, t: 0, pts: zigzag(x0, y0, x1, y1, 7, 4),
      update(G2, q, dt) { q.t += dt; q.rt = (q.rt || 0) + dt; if (q.rt > 0.05) { q.rt = 0; q.pts = zigzag(x0, y0, x1, y1, 7, 4); } if (q.t >= dur) q.gone = true; },
      draw(ctx, G2, q) { const a = 1 - q.t / dur; strokeBolt(ctx, q.pts, o.color || '#5ad8ff', a); boltEnd(ctx, x1, y1, q.t); }
    });
  }

  // ---------------------------------------------------------------- lớp trạng thái (choáng, độc) + đồ trong màn
  function layer(G) {
    if (G._skLayer && G.props.indexOf(G._skLayer) >= 0) return G._skLayer;
    const L = G._skLayer = {
      x: 0, y: 1e9 + 1, t: 0,
      update(G2, q, dt) {
        q.t += dt;
        const p = G2.player;
        if (p) {
          if (p._cdAfter != null && p.skillT <= 0) { p.skillCd = Math.min(p.skillCd, p._cdAfter); p._cdAfter = null; }
          if (p._immuneT > 0) { p._immuneT -= dt; if (p._immuneT <= 0) { delete hurtMods(p).after; if (!(p.skillT > 0)) ghost(p, false); } }
          if (p._night > 0) p._night = Math.max(0, p._night - dt);
          passiveTick(G2, p, dt);
        }
        for (const e of G2.enemies) {
          if (e._stunT > 0) e._stunT = e.st === 'stun' && alive(e) ? e._stunT - dt : 0;
          if (e._psn) poisonTick(G2, e, dt);
        }
      },
      draw(ctx, G2) {
        const dz = SK.prefab('fx_buff_dizzy'), dzf = dz && dz[0] && dz.find(p => p.f);
        for (const e of G2.enemies) {
          if (!alive(e)) continue;
          const top = enemyTop(e);
          if (e._stunT > 0) {
            const f = dzf ? dzf.f : null;
            if (!f || !SK.draw(ctx, f, e.x, top - 6)) {
              ctx.fillStyle = '#ffe96a';
              for (let i = 0; i < 3; i++) { const a = G2.t * 5 + i * 2.1; ctx.fillRect(Math.round(e.x + Math.cos(a) * 6), Math.round(top - 4 + Math.sin(a) * 2), 2, 2); }
            }
          }
          if (e._psn && e._psn.t > 0) {
            const icon = ['poison_1', 'poison_2', 'poison_3'][e._psn.lvl - 1];
            if (!SK.draw(ctx, icon, e.x, top - (e._stunT > 0 ? 18 : 6), { alpha: 0.9 })) {
              ctx.fillStyle = ['#6bff5a', '#5ab8ff', '#c05aff'][e._psn.lvl - 1]; ctx.fillRect(e.x - 2, top - 8, 4, 4);
            }
          }
        }
        const p = G2.player;
        if (p && p._night > 0) {
          const v = SK.view, cam = G2.view || { x: p.x - v.w / 2, y: p.y - v.h / 2 };
          // skill_assassin_night phủ màn tối xanh đêm; phóng sprite 34×46 lên cả màn thì vỡ hạt, nên chỉ lấy
          // màu của nó làm quầng tối, chừa sáng quanh người chơi.
          ctx.save(); ctx.globalAlpha = Math.min(1, p._night / 0.25);
          const g = ctx.createRadialGradient(p.x, p.y - 8, 24, p.x, p.y - 8, Math.max(v.w, v.h) * 0.75);
          g.addColorStop(0, 'rgba(12,8,40,0)'); g.addColorStop(1, 'rgba(12,8,40,0.62)');
          ctx.fillStyle = g; ctx.fillRect(cam.x, cam.y, v.w, v.h);
          ctx.restore();
        }
      }
    };
    G.props.push(L);
    return L;
  }

  // Độc của Bom Khí [WIKI]: cấp 1/2/3 mất 3/4/5 máu mỗi giây, kéo dài 2/2/6 giây; ở lâu trong vũng thì lên cấp.
  const PSN = [null, { dps: 3, dur: 2 }, { dps: 4, dur: 2 }, { dps: 5, dur: 6 }];
  function poison(e, grow) {
    const s = e._psn || (e._psn = { lvl: 1, t: 0, tick: 1, soak: 0 });
    s.soak += grow;
    if (s.soak >= 2 && s.lvl < 3) { s.lvl++; s.soak = 0; }   // 2 giây ngâm độc thì lên cấp [ƯỚC LƯỢNG]
    s.t = PSN[s.lvl].dur;
  }
  function poisonTick(G, e, dt) {
    const s = e._psn;
    if (!alive(e) || s.t <= 0) { e._psn = null; return; }
    s.t -= dt; s.tick -= dt;
    if (s.tick <= 0) { s.tick = 1; SK.hurtEnemy(G, e, PSN[s.lvl].dps, false, 0, 0); }
  }

  // ---------------------------------------------------------------- bảng kỹ năng
  const S = SK.SKILLS;
  const icon = n => firstFrame('icon_skill' + (n < 10 ? '0' : '') + n);
  const heroSkill = (folder, dur) => { const h = DS.heroes[folder]; if (h && h.skill && dur != null) h.skill.dur = dur; };

  // Hiệp Sĩ — Song Thủ [WIKI]: cầm thêm bản sao vũ khí đang dùng 5 giây, đổi súng thì kết thúc.
  S.dual_wield = {
    icon: icon(1), endOnSwap: true,
    start(G, p) {
      layer(G);
      p.skillT = p.h.skill.dur || 5;
      p.dual = SK.makeWeapon(p.weapons[p.cur].id); p.dual.cd = 0.06;
      ripFx(G, 'effect_c1_skill', p.x, p.y + 2, { follow: p, oy: 2, top: true });
    },
    end(G, p) { p.dual = null; }
  };
  heroSkill('knight', 5);

  // Kẻ Lãng Du — Lộn Nhào [WIKI]: lăn theo hướng đang đi, né mọi sát thương 0.5 giây, vẫn bắn được.
  const ROLL_T = 0.5, ROLL_DIST = 4 * T;   // quãng lăn 4 ô [ƯỚC LƯỢNG]
  S.dodge = {
    icon: icon(2),
    start(G, p) {
      layer(G);
      p.skillT = ROLL_T;
      p._roll = { ang: aimDir(p), t: 0 };
      if (Math.abs(Math.cos(p._roll.ang)) > 0.1) p.face = Math.cos(p._roll.ang) > 0 ? 1 : -1;
      ghost(p, true);
      hurtMods(p).dodge = () => 0;
      swapAnims(p, pngAnim('rogue_roll'));
      ripFx(G, 'effect_ranger_roll', p.x, p.y, { ground: true, flip: p.face < 0, dur: 0.34 });
    },
    update(G, p, dt) {
      const r = p._roll; if (!r) return;
      r.t += dt;
      // Huỷ phần đi bộ của lượt này để cú lăn giữ đúng hướng, giảm tốc về cuối.
      const mv = I.moveVec(), walk = p.h.speed * U * (p.speedMul || 1) * (p.moveMul || 1) * dt;
      const k = 2 * (1 - r.t / ROLL_T), spd = ROLL_DIST / ROLL_T * Math.max(0.2, k) * dt;
      SK.moveBox(G.map, p, Math.cos(r.ang) * spd - mv.x * walk, Math.sin(r.ang) * spd - mv.y * walk, p.h.body.r);
    },
    end(G, p) { p._roll = null; ghost(p, false); delete hurtMods(p).dodge; swapAnims(p, null); }
  };
  heroSkill('ranger', ROLL_T);

  // Phù Thuỷ — Sét Đánh [WIKI]: sét đánh con gần nhất trong tầm nhìn rồi nhảy thêm tối đa 4 lần,
  // mỗi lần 8 sát thương + choáng ~2 giây; không còn con nào khác thì đánh lại con đó 16.
  const LS = { dmg: 8, stun: 2, jumps: 4, solo: 16, jumpRange: 7 * T, range: 13 * T, delay: 0.3, gap: 0.09 };  // tầm [ƯỚC LƯỢNG]
  S.lightning_strike = {
    icon: icon(3),
    start(G, p) {
      layer(G);
      ripFx(G, 'effect_c3_skill', p.x, p.y - 2, { ground: true, follow: p, oy: -2, grow: true, dur: 0.6 });
      const first = nearest(G, p.x, p.y - 6, LS.range, { los: true });
      const chain = [];
      if (first) {
        chain.push(first);
        let cur = first;
        for (let j = 0; j < LS.jumps; j++) {
          const [cx, cy] = ec(cur);
          const nx = nearest(G, cx, cy, LS.jumpRange, { skip: e => chain.indexOf(e) >= 0 });
          if (!nx) break;
          chain.push(nx); cur = nx;
        }
      }
      const tx = first ? ec(first)[0] : p.x + p.face * 40, ty = first ? ec(first)[1] : p.y - 6;
      let t = 0, i = 0, prev = null;
      G.props.push({
        x: 0, y: -1e9, gone: false, draw() {},
        update(G2, q, dt) {
          t += dt;
          while (t >= LS.delay + i * LS.gap && i <= chain.length) {
            if (!chain.length) {
              skyBolt(G2, tx, ty);
              G2.shake = Math.max(G2.shake, 2); q.gone = true; return;
            }
            if (i === chain.length) {
              // Chỉ trúng một con: đánh lại con đó thêm 16 [WIKI].
              if (chain.length === 1 && alive(chain[0])) strike(G2, p, chain[0], null, LS.solo);
              q.gone = true; return;
            }
            strike(G2, p, chain[i], prev, LS.dmg);
            prev = chain[i]; i++;
          }
        }
      });
    }
  };
  function strike(G, p, e, from, dmg) {
    const [x, y] = ec(e);
    if (from) { const [fx, fy] = ec(from); boltFx(G, fx, fy, x, y); }
    skyBolt(G, x, y);
    G.shake = Math.max(G.shake, 2.5);
    if (alive(e)) { hit(G, p, e, dmg, { noMul: false, repel: 1 }); stun(e, LS.stun); }
  }
  heroSkill('mage', 0);

  // Sát Thủ — Lưỡi Kiếm Bóng Tối [WIKI]: 1.5 giây lướt, tốc chạy x2, miễn sát thương, xuyên đạn; bấm bắn hoặc
  // chạm quái trong tầm cận chiến thì chém một nhát 8 sát thương (chí mạng ẩn 10%). Hạ quái trong lúc lướt
  // thì hồi chiêu ngay (tối đa 4 lần), vẫn miễn sát thương thêm 1 giây.
  const DB = { dur: 1.5, dmg: 8, crit: 10, resets: 4, lunge: 0.14, lungeDist: 3 * T, touch: 20 };  // lunge [ƯỚC LƯỢNG]
  S.dark_blade = {
    icon: icon(4),
    start(G, p) {
      layer(G);
      p.skillT = DB.dur;
      p._db = { t: 0, ang: aimDir(p), slashed: false, trail: [], trailT: 0 };
      setMul(p, 'moveMul', 'dark_blade', 2);
      ghost(p, true); hurtMods(p).dark_blade = () => 0;
      p._night = DB.dur;
      if (!G._dbTrail || G.props.indexOf(G._dbTrail) < 0) G.props.push(G._dbTrail = trailProp(p));
      if (p._dbResetClock != null && G.t - p._dbResetClock > 7) p._dbResets = 0;   // 7 giây không dùng thì hồi lại 4 lượt [WIKI]
    },
    update(G, p, dt) {
      const s = p._db; if (!s) return;
      s.t += dt;
      if (s.t < DB.lunge) SK.moveBox(G.map, p, Math.cos(s.ang) * DB.lungeDist / DB.lunge * dt, Math.sin(s.ang) * DB.lungeDist / DB.lunge * dt, p.h.body.r);
      s.trailT -= dt;
      if (s.trailT <= 0) { s.trailT = 0.035; s.trail.push({ x: p.x, y: p.y, f: SK.animFrame(p.moving ? p.anims.run : p.anims.idle, p.t), flip: p.face < 0, t: 0 }); }
      if (!s.slashed) {
        const e = nearest(G, p.x, p.y - 7, DB.touch + 6);
        if (I.down('attack') || e) darkSlash(G, p, s, e);
      }
    },
    end(G, p) {
      setMul(p, 'moveMul', 'dark_blade', 1);
      delete hurtMods(p).dark_blade;
      p._night = Math.min(p._night || 0, 0.3);
      if (p._db && p._db.killed) { p._immuneT = 1; hurtMods(p).after = () => 0; } else ghost(p, false);
      if (p._db && p._db.killed && (p._dbResets || 0) < DB.resets) { p._dbResets = (p._dbResets || 0) + 1; p._dbResetClock = G.t; p._cdAfter = 0; }
      p._db = null;
    }
  };
  function darkSlash(G, p, s, e) {
    s.slashed = true;
    const ang = e ? Math.atan2(ec(e)[1] - (p.y - 7), e.x - p.x) : p.aim;
    const cx = p.x + Math.cos(ang) * 14, cy = p.y - 7 + Math.sin(ang) * 14;
    // Hộp chém của sword_dash: 3.8 × 1.16 đơn vị [ĐO], xoay theo hướng chém.
    const hw = 3.8 * U / 2, hh = 1.16 * U / 2 + 4;
    for (const t of G.enemies) {
      if (!alive(t)) continue;
      const [x, y] = ec(t), dx = x - cx, dy = y - cy;
      const u = dx * Math.cos(ang) + dy * Math.sin(ang), v = -dx * Math.sin(ang) + dy * Math.cos(ang);
      if (Math.abs(u) < hw + t.r && Math.abs(v) < hh + t.r) {
        hit(G, p, t, DB.dmg, { critChance: DB.crit + (p.crit || 0), ang, repel: 3 });
        ripFx(G, 'hit_assassin', x, y, { top: true, dur: 0.35 });
      }
    }
    ripFx(G, 'sword_dash', p.x, p.y - 7, { top: true, rot: Math.cos(ang) < 0 ? ang + Math.PI : ang, flip: Math.cos(ang) < 0, follow: p, oy: -7, dur: 0.36 });
    G.shake = Math.max(G.shake, 2);
  }
  function trailProp(p) {
    return {
      x: 0, y: -1e9 + 1,
      update(G, q, dt) { const s = p._db; const tr = q.tr = (s ? s.trail : q.tr) || []; for (const g of tr) g.t += dt; q.tr = tr.filter(g => g.t < 0.3); if (s) s.trail = q.tr; },
      draw(ctx, G, q) {
        for (const g of q.tr || []) {
          if (!g.f) continue;
          ctx.save(); ctx.globalAlpha = 0.45 * (1 - g.t / 0.3);
          SK.drawTinted(ctx, g.f, g.x, g.y, [0.55, 0.1, 0.25, 1], { flip: g.flip });
          ctx.restore();
        }
      }
    };
  }
  SK.on('enemyKill', G => { const p = G.player; if (p && p._db) { p._db.killed = true; p.skillT = Math.min(p.skillT, 1e-4); } });
  SK.on('stageEnter', G => { const p = G.player; if (p) { p._dbResets = 0; p._night = 0; } });
  heroSkill('assassin', DB.dur);

  // Nhà Giả Kim — Bom Khí [WIKI]: ném một bình về phía quái gần nhất (hoặc hướng đang đi); chạm vật cản hay
  // quái thì vỡ thành vũng độc bán kính 3 ô trong 6 giây: 4 sát thương mỗi 0.5 giây + trúng độc.
  const GG = { speed: 14 * U, life: 5.25, radius: 3 * T, dur: 6, tick: 0.5, dmg: 4 };   // tốc bình [ƯỚC LƯỢNG]
  S.gas_grenade = {
    icon: icon(5),
    start(G, p) {
      layer(G);
      const e = p.target && alive(p.target) ? p.target : null;
      const hy = p.y - 6;
      const ang = e ? Math.atan2(ec(e)[1] - hy, e.x - p.x) : aimDir(p);
      G.props.push(bottle(p.x + Math.cos(ang) * 6, hy + Math.sin(ang) * 6, ang));
    }
  };
  function bottle(x, y, ang) {
    return {
      x, y, bx: x, by: y, h: 6, ang, t: 0, spin: 0,
      update(G, q, dt) {
        q.t += dt; q.spin += dt * 14;
        if (q.t > GG.life) { q.gone = true; return; }
        const n = 4;
        for (let i = 0; i < n; i++) {
          const nx = q.bx + Math.cos(q.ang) * GG.speed * dt / n, ny = q.by + Math.sin(q.ang) * GG.speed * dt / n;
          const wall = W.solidAt(G.map, nx, ny + q.h);
          const e = G.enemies.find(t => { if (!alive(t)) return false; const [cx, cy] = ec(t); return Math.abs(nx - cx) < t.hb.size[0] * t.scale / 2 + 2 && Math.abs(ny - cy) < t.hb.size[1] * t.scale / 2 + 2; });
          if (wall || e) {
            const px = wall ? q.bx : nx, py = (wall ? q.by : ny) + q.h;
            const o = wall && W.obstacleAt(G.map, nx, ny + q.h);
            if (o && o.kind === 'box') SK.hitObstacle(G, o, 1);
            gasPool(G, px, py);
            q.gone = true; return;
          }
          q.bx = nx; q.by = ny;
        }
        q.x = q.bx; q.y = q.by + q.h;
      },
      draw(ctx, G, q) {
        ctx.save(); ctx.globalAlpha = 0.3; ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(q.bx, q.by + q.h, 3, 1.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        if (!SK.draw(ctx, 'bullet_48', q.bx, q.by, { rot: q.spin })) { ctx.fillStyle = '#3c3'; ctx.fillRect(q.bx - 2, q.by - 3, 4, 6); }
      }
    };
  }
  function gasPool(G, x, y) {
    const p = G.player;
    ripFx(G, 'explode_poison', x, y - 4, { top: true, dur: 0.6 });
    const pf = SK.prefab('Gas_Alchemist_0');
    const img = pf && pf.find(q => q.f);
    const cloud = XS['^c03_show_effect01_s0_[0-9]+$'] || [];
    const puffs = [];
    for (let i = 0; i < 9; i++) { const a = SK.rand() * Math.PI * 2, d = Math.sqrt(SK.rand()) * GG.radius * 0.8; puffs.push({ x: Math.cos(a) * d, y: Math.sin(a) * d * 0.6, ph: SK.rand() * 3, s: SK.randf(0.5, 0.8) }); }
    G.props.push({
      x, y: -1e9 + y, px: x, py: y, t: 0, tick: 0,
      update(G2, q, dt) {
        q.t += dt; q.tick -= dt;
        if (q.t >= GG.dur) { q.gone = true; return; }
        const inside = inRadius(G2, q.px, q.py, GG.radius);
        for (const e of inside) poison(e, dt);
        if (q.tick <= 0) { q.tick = GG.tick; for (const e of inside) hit(G2, p, e, GG.dmg, { noMul: true, crit: false }); }
      },
      draw(ctx, G2, q) {
        const fade = Math.min(1, q.t / 0.25) * Math.min(1, (GG.dur - q.t) / 0.6);
        const f = img && SK.frame(img.f);
        if (f) {
          // texture_c4 là đĩa trắng; nhuộm màu Gas_Alchemist_0 [ĐO 0.125,0.294,0.134,0.434] rồi phóng tới bán kính vũng.
          const s = GG.radius * 2 / f[3];
          SK.drawTinted(ctx, img.f, q.px, q.py, (img.c || [0.125, 0.294, 0.134, 0.434]).map((v, i) => (i === 3 ? v * fade : v)), { sx: s, sy: s * 0.62 });
        } else {
          ctx.save(); ctx.globalAlpha = 0.35 * fade; ctx.fillStyle = '#3aa845';
          ctx.beginPath(); ctx.ellipse(q.px, q.py, GG.radius, GG.radius * 0.62, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
        if (cloud.length) {
          for (const u of puffs) {
            const fr = cloud[Math.min(cloud.length - 1, 1 + Math.floor(((q.t * 0.7 + u.ph) % 2.2) / 2.2 * (cloud.length - 1)))];
            SK.drawTinted(ctx, fr, q.px + u.x, q.py + u.y + 6, [0.3, 0.85, 0.25, 0.32 * fade], { sx: u.s, sy: u.s });
          }
        }
      }
    });
  }
  heroSkill('alchemist', 0);

  // Kỹ Sư — Tháp Súng [WIKI]: đặt tháp tại chỗ đứng, 12 máu, sống 10 giây; mỗi đợt 12 viên trong 2 giây
  // vào con gần nhất rồi nghỉ 1 giây; mỗi viên 2 sát thương, 0 chí mạng, lệch 8°; tối đa 3 tháp.
  const GT = { hp: 12, life: 10, burst: 12, burstT: 2, pause: 1, dmg: 2, spread: 8, max: 3, range: 12 * T, bulletSpeed: 18 * U };  // tầm, tốc đạn [ƯỚC LƯỢNG]
  S.gun_turret = {
    icon: icon(6),
    start(G, p) {
      layer(G);
      G._turrets = (G._turrets || []).filter(t => !t.gone && G.props.indexOf(t) >= 0);
      while (G._turrets.length >= GT.max) { const old = G._turrets.shift(); old.die = true; }
      const t = turret(G, p, p.x, p.y);
      G._turrets.push(t); G.props.push(t);
    }
  };
  function turret(G, p, x, y) {
    const pf = SK.prefab('battery') || [];
    const find = n => pf.find(q => q.n && q.n.endsWith(n));
    const body = find('/img/body'), dead = find('/body_dead'), gun = find('/w'), gp = find('/gun_point'), sh = find('/shadow');
    const m = SK.prefabMbs(pf, 'RGBatteryController') || {};
    return {
      x, y, t: 0, hp: GT.hp, burstLeft: GT.burst, cd: 0.4, ang: p.face > 0 ? 0 : Math.PI, fadeT: 0, turret: true,
      update(G2, q, dt) {
        q.t += dt;
        if (q.die || q.t > GT.life || q.hp <= 0) {
          q.fadeT += dt;
          if (q.fadeT > (m.fadeDurTime || 0.8)) q.gone = true;   // tắt dần 0.8 giây [ĐO]
          return;
        }
        // Đạn địch bay vào thân tháp thì trúng tháp (hộp 0.8 × 1 đơn vị lệch lên 0.8) [ĐO].
        for (const b of G2.bullets) {
          if (b.side !== 'e' || b.dead) continue;
          if (Math.abs(b.x - (q.x - 1.6)) < 6.4 + b.r && Math.abs(b.y - (q.y - 12.8)) < 8 + b.r) { b.dead = true; q.hp -= b.dmg || 1; q.flash = 0.08; }
        }
        q.flash = Math.max(0, (q.flash || 0) - dt);
        const e = nearest(G2, q.x, q.y - 10, GT.range, { los: true });
        if (e) { const [cx, cy] = ec(e); q.ang = Math.atan2(cy - (q.y - 10), cx - q.x); }
        q.cd -= dt;
        if (q.cd > 0) return;
        if (!e) { q.cd = 0.1; return; }
        const gx = gun ? gun.at[0] : 0, gy = gun ? gun.at[1] : 10;
        const tipL = gp ? Math.hypot(gp.at[0] - gx, gp.at[1] - gy) : 10;
        const hx = q.x + gx, hy = q.y - gy;
        const a = q.ang + SK.deg(SK.randf(-GT.spread / 2, GT.spread / 2));
        const mx = hx + Math.cos(q.ang) * tipL, my = hy + Math.sin(q.ang) * tipL;
        G2.bullets.push({ side: 'p', kind: 'pb', x: mx, y: my, h: Math.max(2, q.y - my), vx: Math.cos(a) * GT.bulletSpeed, vy: Math.sin(a) * GT.bulletSpeed, ang: a,
          dmg: GT.dmg, crit: false, repel: 0.5, r: 2, life: 1.2 });
        SK.fx(G2, 'muzzle', mx, my, { ang: q.ang, dur: 0.05 });
        q.kick = 1.5;
        q.burstLeft--;
        if (q.burstLeft <= 0) { q.burstLeft = GT.burst; q.cd = GT.pause; } else q.cd = GT.burstT / GT.burst / (p.rateMul || 1);
      },
      draw(ctx, G2, q) {
        const a = q.fadeT > 0 ? Math.max(0, 1 - q.fadeT / 0.8) : 1;
        const pop = Math.min(1, q.t / 0.15);
        ctx.save(); ctx.globalAlpha *= a;
        if (sh) SK.draw(ctx, sh.f, q.x + sh.at[0], q.y - sh.at[1] + 1, { alpha: 0.5 });
        const pages = q.flash > 0 ? SK.pagesWhite : null;
        const broken = q.fadeT > 0 && q.hp <= 0;
        const bf = broken && dead ? dead : body;
        if (bf) SK.draw(ctx, bf.f, q.x + bf.at[0], q.y - bf.at[1], { pages, sy: pop });
        if (gun && !broken && pop >= 1) {
          const left = Math.cos(q.ang) < 0;
          q.kick = Math.max(0, (q.kick || 0) - 0.3);
          ctx.save(); ctx.translate(Math.round(q.x + gun.at[0]), Math.round(q.y - gun.at[1]));
          ctx.rotate(q.ang); if (left) ctx.scale(1, -1);
          SK.draw(ctx, gun.f, -(q.kick || 0), 0, { pages });
          ctx.restore();
        }
        if (!bf) { ctx.fillStyle = '#c86a2a'; ctx.fillRect(q.x - 6, q.y - 12, 12, 12); }
        // Vạch máu nhỏ như thú cưng/tháp trong SK.
        if (q.hp < GT.hp && !broken) { ctx.fillStyle = '#300'; ctx.fillRect(q.x - 7, q.y - 22, 14, 2); ctx.fillStyle = '#3ce05a'; ctx.fillRect(q.x - 7, q.y - 22, Math.round(14 * q.hp / GT.hp), 2); }
        ctx.restore();
      }
    };
  }
  heroSkill('engineer', 0);

  // Ma Cà Rồng — Bầy Dơi [WIKI]: thả 6 con dơi tìm quái trong tầm ~12 ô, mỗi con cắn 5 rồi bay về; cứ 3 con về
  // sau khi cắn trúng thì hồi 1 máu (đầy máu thì 5 năng lượng). Hồi chiêu tính khi cả bầy đã về, con nào hụt
  // thì rút ngắn theo tỉ lệ; không có mục tiêu thì không tính hồi chiêu.
  const BS = { n: 6, range: 12 * T, dmg: 5, speed: 11 * U, per: 3, maxT: 4 };   // tốc bay [ƯỚC LƯỢNG]
  S.bat_swarm = {
    icon: icon(7),
    start(G, p) {
      layer(G);
      const targets = G.enemies.filter(e => alive(e) && Math.hypot(e.x - p.x, e.y - p.y) < BS.range)
        .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
      const bats = [];
      for (let i = 0; i < BS.n; i++) {
        const a = -Math.PI / 2 + (i - (BS.n - 1) / 2) * 0.5;
        bats.push({ x: p.x + Math.cos(a) * 6, y: p.y - 10 + Math.sin(a) * 4, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60 - 30,
          tgt: targets.length ? targets[i % targets.length] : null, st: targets.length ? 'out' : 'back', t: 0, ph: SK.rand() * 2, hitOk: false });
      }
      p._bats = { bats, back: 0, hits: 0, heals: 0, any: targets.length > 0 };
      p.skillT = BS.maxT + 1;
      G.props.push(batProp(p));
      // Dơi nhỏ trang trí bay toả ra [WIKI "some smaller bats, cosmetic"].
      for (let i = 0; i < 8; i++) {
        const a = SK.rand() * Math.PI * 2, s = SK.randf(40, 90);
        G.props.push({ x: p.x, y: 1e9, bx: p.x, by: p.y - 10, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7, t: 0, ph: SK.rand(),
          update(G2, q, dt) { q.t += dt; q.bx += q.vx * dt; q.by += q.vy * dt; if (q.t > 0.7) q.gone = true; },
          draw(ctx, G2, q) { const fr = batFrame(q.t + q.ph); if (fr) SK.draw(ctx, fr, q.bx, q.by, { sx: 0.55, sy: 0.55, alpha: 1 - q.t / 0.7, flip: q.vx < 0 }); } });
      }
    },
    update(G, p, dt) {
      const s = p._bats; if (!s) return;
      if (s.bats.every(b => b.st === 'home')) p.skillT = Math.min(p.skillT, 1e-4);
    },
    end(G, p) {
      const s = p._bats; p._bats = null;
      if (!s) return;
      p._cdAfter = s.any ? p.h.skill.cd * Math.max(0.25, s.hits / BS.n) : 0;
    }
  };
  function batFrame(t) {
    const pf = SK.prefab('bullet_bat');
    const key = pf && pf.find(q => q.a) && Object.values(pf.find(q => q.a).a)[0];
    if (key && SK.anim(key)) return SK.animFrame(key, t);
    const fr = XS['^bat_[0-9]$'] || [];
    return fr.length ? fr[Math.floor(t * 12) % fr.length] : null;
  }
  function batProp(p) {
    return {
      x: 0, y: 1e9,
      update(G, q, dt) {
        const s = p._bats; if (!s) { q.gone = true; return; }
        for (const b of s.bats) {
          if (b.st === 'home') continue;
          b.t += dt;
          let tx, ty;
          if (b.st === 'out') {
            if (!b.tgt || !alive(b.tgt)) b.tgt = nearest(G, b.x, b.y, BS.range);
            if (!b.tgt || b.t > BS.maxT) { b.st = 'back'; continue; }
            [tx, ty] = ec(b.tgt);
          } else { tx = p.x; ty = p.y - 10; }
          const dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy);
          // Bay vòng nhẹ: lái vận tốc về phía đích thay vì lao thẳng.
          const want = BS.speed * Math.min(1, 0.4 + b.t * 2);
          b.vx += (dx / (d || 1) * want - b.vx) * Math.min(1, dt * 7);
          b.vy += (dy / (d || 1) * want - b.vy) * Math.min(1, dt * 7);
          b.x += b.vx * dt; b.y += b.vy * dt;
          if (b.st === 'out' && d < 8) {
            hit(G, p, b.tgt, BS.dmg, { noMul: true, crit: false, repel: 0.5 });
            b.hitOk = true; s.hits++; b.st = 'back';
          } else if (b.st === 'back' && (d < 8 || b.t > BS.maxT + 1)) {
            b.st = 'home';
            if (b.hitOk) {
              s.back++;
              if (s.back % BS.per === 0) {
                if (p.hp < p.hpMax) { p.hp++; SK.num(G, p.x, p.y - 26, '+1', '#6bff6b'); }
                else { p.energy = Math.min(p.energyMax, p.energy + 5); SK.num(G, p.x, p.y - 26, '+5', '#5ad0ff'); }
                healFx(G, p);
              }
            }
          }
        }
      },
      draw(ctx, G, q) {
        const s = p._bats; if (!s) return;
        for (const b of s.bats) {
          if (b.st === 'home') continue;
          const fr = batFrame(b.t + b.ph);
          if (!fr || !SK.draw(ctx, fr, b.x, b.y, { flip: b.vx < 0 })) { ctx.fillStyle = '#511'; ctx.fillRect(b.x - 3, b.y - 2, 6, 3); }
        }
      }
    };
  }
  heroSkill('vampire', BS.maxT);

  // Hiệp Sĩ Thánh — Khiên Năng Lượng [WIKI]: bong bóng lớn 4 giây, hút hết sát thương, chặn đạn địch.
  const ES = { dur: 4, r: 22 };   // bán kính bong bóng [ƯỚC LƯỢNG ~1.4 ô]
  S.energy_shield = {
    icon: icon(8),
    start(G, p) {
      layer(G);
      p.skillT = ES.dur;
      hurtMods(p).shield = (G2, pl) => { pl._shieldHit = 0.15; return 0; };
      const pf = SK.prefab('shield');
      const ring = pf && pf.find(q => q.f && !GLOW[q.f]), light = pf && pf.find(q => GLOW[q.f]);
      G.props.push(p._shield = {
        x: p.x, y: p.y + 0.5, t: 0,
        update(G2, q, dt) {
          q.t += dt; q.x = p.x; q.y = p.y + 0.5;
          if (!(p.skillT > 0) || p._shield !== q) { q.gone = true; return; }
          p._shieldHit = Math.max(0, (p._shieldHit || 0) - dt);
          const cy = p.y - 8;
          for (const b of G2.bullets) {
            if (b.side !== 'e' || b.dead) continue;
            if (Math.hypot(b.x - p.x, b.y - cy) < ES.r + b.r) { b.dead = true; p._shieldHit = 0.15; SK.fx(G2, 'prefab', b.x, b.y, { parts: SK.art.vfx('bullet_hit'), state: 'sample_hit', dur: 0.2, scale: 0.6 }); }
          }
        },
        draw(ctx, G2, q) {
          const cy = p.y - 8, left = Math.max(0, p.skillT);
          const blink = left < 0.8 && Math.floor(left * 10) % 2 === 0;
          const pop = Math.min(1, q.t / 0.12);
          const r = ES.r * pop * (1 + (p._shieldHit > 0 ? 0.08 : 0));
          ctx.save();
          if (blink) ctx.globalAlpha *= 0.4;
          glow(ctx, p.x, cy, r * 1.5, light ? light.c : [0.42, 0.953, 1, 0.267]);
          ctx.fillStyle = 'rgba(120,220,255,' + (p._shieldHit > 0 ? 0.28 : 0.14) + ')';
          ctx.beginPath(); ctx.arc(p.x, cy, r, 0, Math.PI * 2); ctx.fill();
          // Vành bong bóng: sprite bullet_43 thật của prefab "shield", phóng tới cỡ bong bóng.
          const f = ring && SK.frame(ring.f);
          if (f) SK.draw(ctx, ring.f, p.x, cy, { sx: r * 2 / f[3], sy: r * 2 / f[4] });
          else { ctx.strokeStyle = '#8fe8ff'; ctx.lineWidth = 1.5; ctx.stroke(); }
          ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(Math.round(p.x - r * 0.45), Math.round(cy - r * 0.6), 3, 2);
          ctx.restore();
        }
      });
    },
    end(G, p) { delete hurtMods(p).shield; p._shield = null; }
  };
  heroSkill('paladin', ES.dur);

  // Chiến Binh Cuồng — Cuồng Nộ [WIKI]: tấn công liên tục bằng vũ khí đang cầm trong 0.5 giây, tốc bắn +20%.
  const RG = { dur: 0.5, rate: 1.2 };
  S.rage = {
    icon: icon(14),
    start(G, p) {
      layer(G);
      p.skillT = RG.dur;
      setMul(p, 'rateMul', 'rage', RG.rate);
      p._rageBtn = !I.btn.attack; I.btn.attack = true;
      for (const w of p.weapons) if (w) w.cd = Math.min(w.cd, 0);
      SK.fx(G, 'ring', p.x, p.y, { dur: 0.35, color: '#ff5a3a' });
      // Không thấy prefab riêng cho Cuồng Nộ trong common.ab: quầng đỏ vẽ tay.
      G.props.push({ x: p.x, y: p.y - 0.5, t: 0,
        update(G2, q, dt) { q.t += dt; q.x = p.x; q.y = p.y - 0.5; if (q.t > RG.dur + 0.15) q.gone = true; },
        draw(ctx, G2, q) { glow(ctx, p.x, p.y - 8, 20, [1, 0.25, 0.1, 0.35], Math.max(0, 1 - q.t / (RG.dur + 0.15)) * (0.8 + 0.2 * Math.sin(q.t * 40))); } });
    },
    update(G, p) { I.btn.attack = true; },
    end(G, p) { setMul(p, 'rateMul', 'rage', 1); if (p._rageBtn) I.btn.attack = false; p._rageBtn = false; }
  };
  heroSkill('viking', RG.dur);

  // Người Sói — Cuồng Hoá [WIKI]: hoá sói 5 giây, lúc biến hình không mất máu; máu dưới 1/5 thì hồi đầy, dưới 1/2
  // thì hồi lên 1/2; cào diện rộng chí mạng cao, sát thương 6/7/9 theo máu còn lại; mỗi đòn trúng +0.2 giây,
  // 3 đòn trúng hồi 1 giáp; chạy nhanh hơn; không đổi được vũ khí.
  const WB = { dur: 5, morph: 0.5, move: 1.3, crit: 30, rps: 3, range: 30, arc: 150, extend: 0.2 };  // move, crit, rps, tầm [ƯỚC LƯỢNG]
  S.berserk = {
    icon: icon(10),
    start(G, p) {
      layer(G);
      p.skillT = WB.dur;
      if (p.hp < Math.floor(p.hpMax / 5)) p.hp = p.hpMax;
      else if (p.hp <= Math.floor(p.hpMax / 2)) p.hp = Math.max(p.hp, Math.floor(p.hpMax / 2));
      const k = p.hp / p.hpMax, dmg = k >= 0.9 ? 6 : k >= 0.7 ? 7 : 9;
      const claw = XS['^werewolf_0_skill_0_effect_1_[0-9]$'] || [];
      p._wolf = { t: 0, hits: 0, saved: p.weapons, cur: p.cur };
      // Vuốt là vũ khí cận chiến tạm; ghi vào DS.weapons (ẩn khỏi Object.keys để không lọt vào rương/cửa hàng)
      // để lỡ bị thả xuống đất (nhặt súng lúc đang hoá sói) cũng vẽ được.
      Object.defineProperty(DS.weapons, '_claw', { configurable: true, writable: true, enumerable: false,
        value: { name: 'Vuốt Sói', kind: 'melee', dmg, cost: 0, crit: WB.crit, rps: WB.rps, range: WB.range, arc: WB.arc, repel: 3, sprite: claw[0] || null } });
      p.weapons = [SK.makeWeapon('_claw'), null];
      p.cur = 0;
      setMul(p, 'moveMul', 'berserk', WB.move);
      hurtMods(p).morph = (G2, pl, d) => (pl._wolf && pl._wolf.t < WB.morph ? 0 : d);
      // 16 khung hình sói: 8 đứng + 8 chạy như mọi nhân vật SK [ĐO trên ảnh].
      swapAnims(p, subAnim(pngAnim('werewolf_form'), 0, 8, 'wolf_idle'), subAnim(pngAnim('werewolf_form'), 8, 16, 'wolf_run'));
      ripFx(G, 'effect_c10_skill', p.x, p.y, { follow: p, top: true });
      ripFx(G, 'explode_poly_werewolf', p.x, p.y - 8, { top: true, grow: true, scale: 0.45, dur: 0.45 });
    },
    update(G, p, dt) { if (p._wolf) p._wolf.t += dt; },
    end(G, p) {
      const s = p._wolf; p._wolf = null;
      if (s) {
        // Súng nhặt được trong lúc hoá sói: nhét vào ô trống, hết chỗ thì thả xuống chân.
        const got = p.weapons.filter(w => w && w.id !== '_claw');
        p.weapons = s.saved; p.cur = s.cur;
        for (const w of got) { if (!p.weapons[1]) p.weapons[1] = w; else G.items.push({ id: w.id, x: p.x, y: p.y + 4, t: 0 }); }
        G.items = G.items.filter(it => it.id !== '_claw');
      }
      setMul(p, 'moveMul', 'berserk', 1);
      delete hurtMods(p).morph;
      swapAnims(p, null);
      ripFx(G, 'explode_poly_werewolf', p.x, p.y - 8, { top: true, grow: true, scale: 0.35, dur: 0.35 });
    }
  };
  SK.on('enemyHit', (G, e) => {
    const p = G.player;
    if (!p || !p._wolf || p.weapons[p.cur].id !== '_claw' || !(p.weapons[p.cur].swing > 0.12)) return;
    p.skillT += WB.extend;
    p._wolf.hits++;
    if (p._wolf.hits % 3 === 0 && p.armor < p.armorMax) p.armor++;
  });
  // Vết cào thật (prefab sword_werewolf, khung effect_08_27) theo hướng vung.
  SK.on('fire', (G, p, w) => {
    if (!p._wolf || w.id !== '_claw') return;
    const left = Math.cos(p.aim) < 0;
    ripFx(G, 'sword_werewolf', p.x, p.y - 7, { top: true, rot: left ? p.aim + Math.PI : p.aim, flip: left, follow: p, oy: -7, dur: 0.22, fade: true });
  });
  heroSkill('werewolf', WB.dur);

  // Nữ Tu — Khế Ước Hồi Sinh [WIKI]: vòng phép bán kính 4 ô trong ~1.6 giây; đứng trong hồi 1 máu ngay và 1 máu
  // mỗi 0.8 giây; hào quang hồi máu còn 2 giây sau khi ra khỏi vòng; giáp tối đa +2 trong lúc có hào quang;
  // vòng tan thì gây 20 sát thương cho quái trong vòng.
  const RP = { r: 4 * T, pact: 1.6, aura: 2, every: 0.8, armor: 2, burst: 20 };
  S.regeneration_pact = {
    icon: icon(11),
    start(G, p) {
      layer(G);
      const s = p._pact = { x: p.x, y: p.y, t: 0, tick: RP.every, aura: RP.aura, inside: true };
      p.skillT = RP.pact + RP.aura;
      if (!s.armorUp) { s.armorUp = true; p.armorMax += RP.armor; }
      if (p.hp < p.hpMax) { p.hp++; SK.num(G, p.x, p.y - 26, '+1', '#6bff6b'); }
      ripFx(G, 'effect_priest_1_cast', p.x, p.y, { follow: p, top: true });
      const pf = SK.prefab('effect_priest_1');
      const part = pf && pf.find(q => q.f || q.a);
      G.props.push({
        x: s.x, y: -1e9 + s.y, t: 0,
        update(G2, q, dt) { q.t += dt; if (q.t > RP.pact + 0.4) q.gone = true; },
        draw(ctx, G2, q) {
          const a = q.t < RP.pact ? Math.min(1, q.t / 0.2) : Math.max(0, 1 - (q.t - RP.pact) / 0.4);
          ctx.save(); ctx.globalAlpha *= a;
          ctx.fillStyle = 'rgba(255,230,120,0.12)';
          ctx.beginPath(); ctx.ellipse(s.x, s.y, RP.r, RP.r * 0.62, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(255,236,150,0.7)'; ctx.lineWidth = 1; ctx.stroke();
          // Animator của effect_priest_1 không bóc được: lật tay các khung skill_effect_priest_0..7 (vòng phép hiện chữ dần).
          const seq = (XS['^skill_effect_priest(_cast)?_[0-9]+$'] || []).filter(n => /^skill_effect_priest_[0-9]+$/.test(n));
          const fr = seq.length ? seq[Math.min(seq.length - 1, Math.floor(q.t * 10))] : part && part.f;
          const f = fr && SK.frame(fr);
          // Khung neo ở đáy: dời theo điểm neo để tâm vòng trùng tâm khế ước.
          if (f) { const sx = RP.r * 2 / f[3], sy = RP.r * 2 * 0.62 / f[4]; SK.draw(ctx, fr, s.x, s.y + (f[6] - f[4] / 2) * sy, { sx, sy }); }
          ctx.restore();
        }
      });
    },
    update(G, p, dt) {
      const s = p._pact; if (!s) return;
      s.t += dt;
      const inPact = s.t < RP.pact && Math.hypot(p.x - s.x, (p.y - s.y) / 0.62) < RP.r;
      if (s.t >= RP.pact && !s.burst) {
        s.burst = true;
        for (const e of G.enemies) { if (!alive(e)) continue; const [x, y] = ec(e); if (Math.hypot(x - s.x, (y - s.y) / 0.62) < RP.r) hit(G, p, e, RP.burst, { noMul: true, crit: false, repel: 2 }); }
        ripFx(G, 'effect_health_skill', s.x, s.y, { ground: true, scale: 2.5, grow: true, dur: 0.6 });
      }
      if (!inPact && s.inside) { s.inside = false; p.skillT = Math.min(p.skillT, RP.aura); }
      s.tick -= dt;
      if (s.tick <= 0) { s.tick = RP.every; if (p.hp < p.hpMax) { p.hp++; SK.num(G, p.x, p.y - 26, '+1', '#6bff6b'); healFx(G, p); } }
    },
    end(G, p) {
      const s = p._pact; p._pact = null;
      if (s && s.armorUp) { p.armorMax -= RP.armor; p.armor = Math.min(p.armor, p.armorMax); }
    }
  };
  heroSkill('priest', RP.pact + RP.aura);

  // Người Máy — Quá Tải Điện [WIKI]: 0.5 giây sau khi bấm, cuộn Tesla trên đầu phóng 2 tia vào quái gần nhất
  // trong tầm nhìn, mỗi tia 1 sát thương / 0.14 giây trong 3.5 giây, không chí mạng; đi chậm 20%;
  // hạ quái thì +0.5 giây (tối đa 20 giây).
  const EO = { warm: 0.5, dur: 3.5, beams: 2, every: 0.14, dmg: 1, slow: 0.8, range: 9 * T, killAdd: 0.5, cap: 20 };  // tầm [ƯỚC LƯỢNG]
  S.electric_overload = {
    icon: icon(13),
    start(G, p) {
      layer(G);
      p.skillT = EO.warm + EO.dur;
      p._coil = { t: 0, tick: 0, tg: [], total: EO.warm + EO.dur };
      setMul(p, 'moveMul', 'overload', EO.slow);
      G.props.push(coilProp(p));
    },
    update(G, p, dt) {
      const s = p._coil; if (!s) return;
      s.t += dt;
      if (s.t < EO.warm) return;
      // Dò mục tiêu từ ngực (đầu cuộn Tesla cao hơn mép tường trên, dò từ đó thì hay vướng tường).
      const hx = p.x, hy = p.y - 8;
      s.tg = [];
      const skip = e => s.tg.indexOf(e) >= 0;
      for (let i = 0; i < EO.beams; i++) { const e = nearest(G, hx, hy, EO.range, { los: true, skip }); if (e) s.tg.push(e); }
      s.tick -= dt;
      if (s.tick <= 0) { s.tick = EO.every; for (const e of s.tg) hit(G, p, e, EO.dmg, { noMul: true, crit: false }); }
    },
    end(G, p) { p._coil = null; setMul(p, 'moveMul', 'overload', 1); }
  };
  SK.on('enemyKill', G => { const p = G.player; if (p && p._coil && p._coil.total + EO.killAdd <= EO.cap) { p._coil.total += EO.killAdd; p.skillT += EO.killAdd; } });
  function coilProp(p) {
    const coil = firstFrame('robot_coil');
    return {
      x: 0, y: 1e9, t: 0,
      update(G, q, dt) { q.t += dt; if (!p._coil) q.gone = true; },
      draw(ctx, G, q) {
        const s = p._coil; if (!s) return;
        const rise = Math.min(1, s.t / EO.warm);
        const hx = p.x, hy = p.y - 16 - 6 * rise;
        if (!coil || !SK.draw(ctx, coil, hx, hy + 6)) { ctx.fillStyle = '#9ab'; ctx.fillRect(hx - 2, hy - 8, 4, 8); }
        glow(ctx, hx, hy - 6, 8, [0.35, 0.8, 1, 0.35 + 0.15 * Math.sin(q.t * 30)]);
        for (const e of s.tg) {
          const [x, y] = ec(e);
          strokeBolt(ctx, zigzag(hx, hy - 6, x, y, 6, 3), '#58c8ff', 0.9);
          boltEnd(ctx, x, y, q.t);
        }
      }
    };
  }
  heroSkill('robot', EO.warm + EO.dur);

  // Đạo Sĩ — Vạn Kiếm Quy Tông [WIKI]: 7 thanh kiếm quay quanh người bán kính ~3 ô khoảng 1 giây, chém đạn
  // địch; sau đó bay vào quái trong tầm, mỗi lần chạm 3 sát thương, xuyên quái; 3 giây thì bay khỏi màn.
  const GS = { n: 7, r: 3 * T, orbit: 1, dmg: 3, life: 3, speed: 16 * U, spin: 9 };   // tốc bay, tốc quay [ƯỚC LƯỢNG]
  S.genesis_of_swords = {
    icon: null,
    start(G, p) {
      layer(G);
      const sprite = (DS.weapons.short_sword && DS.weapons.short_sword.sprite) || 'weapons_s_01';
      const swords = [];
      for (let i = 0; i < GS.n; i++) swords.push({ a: i / GS.n * Math.PI * 2, x: p.x, y: p.y - 8, st: 'orbit', hitSet: [] });
      G.props.push({
        x: 0, y: 1e9, t: 0,
        update(G2, q, dt) {
          q.t += dt;
          if (q.t > GS.life) { q.gone = true; return; }
          for (const s of swords) {
            if (s.st === 'orbit') {
              s.a += GS.spin * dt;
              const r = GS.r * Math.min(1, q.t / 0.2);
              s.x = p.x + Math.cos(s.a) * r; s.y = p.y - 8 + Math.sin(s.a) * r * 0.8; s.rot = s.a + Math.PI / 2;
              if (q.t >= GS.orbit) {
                const e = nearest(G2, s.x, s.y, 14 * T, { skip: t => t._gsTaken > 1 });
                if (e) e._gsTaken = (e._gsTaken || 0) + 1;
                s.ang = e ? Math.atan2(ec(e)[1] - s.y, ec(e)[0] - s.x) : s.a + Math.PI / 2;
                s.st = 'fly'; s.rot = s.ang;
              }
            } else {
              s.x += Math.cos(s.ang) * GS.speed * dt; s.y += Math.sin(s.ang) * GS.speed * dt;
            }
            for (const e of G2.enemies) {
              if (!alive(e) || s.hitSet.indexOf(e) >= 0) continue;
              const [cx, cy] = ec(e);
              if (Math.abs(s.x - cx) < e.hb.size[0] * e.scale / 2 + 5 && Math.abs(s.y - cy) < e.hb.size[1] * e.scale / 2 + 5) {
                s.hitSet.push(e); hit(G2, p, e, GS.dmg, { noMul: true, crit: false, ang: s.rot, repel: 1 });
              }
            }
            for (const b of G2.bullets) if (b.side === 'e' && !b.dead && Math.hypot(b.x - s.x, b.y - s.y) < 7 + b.r) b.dead = true;
          }
          if (q.t >= GS.orbit) for (const e of G2.enemies) e._gsTaken = 0;
        },
        draw(ctx, G2, q) {
          for (const s of swords) {
            glow(ctx, s.x, s.y, 7, [0.5, 0.9, 1, 0.25]);
            if (!SK.draw(ctx, sprite, s.x, s.y, { rot: s.rot })) { ctx.fillStyle = '#cfe'; ctx.fillRect(s.x - 4, s.y - 1, 8, 2); }
          }
        }
      });
      SK.fx(G, 'ring', p.x, p.y, { dur: 0.4, color: '#9fe8ff' });
    }
  };
  heroSkill('taoist', 0);

  // ---------------------------------------------------------------- nội tại (bậc 6) đơn giản
  // Mô-đun nâng cấp nhân vật có thể tắt bằng SK.passiveOn = (p) => boolean.
  const passiveOn = p => (SK.passiveOn ? SK.passiveOn(p) : true);
  function passiveTick(G, p, dt) {
    if (!passiveOn(p)) return;
    // Chiến Binh Cuồng — Tốc Bắn [WIKI]: mỗi đòn +1 tầng trong 3 giây, 2%/tầng, tối đa 5 tầng; đủ 5 tầng thêm 10%.
    if (p.hero === 'viking') {
      const s = p._fr || (p._fr = { n: 0, t: 0 });
      if (s.t > 0) { s.t -= dt; if (s.t <= 0 && s.n > 0) { s.n--; s.t = s.n ? 0.4 : 0; } }   // rơi dần từng tầng [ƯỚC LƯỢNG 0.4 giây/tầng]
      setMul(p, 'rateMul', 'fire_rate', 1 + s.n * 0.02 + (s.n >= 5 ? 0.1 : 0));
    }
  }
  SK.on('fire', (G, p) => { if (p.hero === 'viking' && passiveOn(p)) { const s = p._fr || (p._fr = { n: 0, t: 0 }); s.n = Math.min(5, s.n + 1); s.t = 3; } });
  // Hiệp Sĩ — Khiên Vững [WIKI]: còn giáp thì phần sát thương vượt giáp không trừ vào máu.
  function installPassives(G) {
    const p = G.player; if (!p) return;
    layer(G);
    if (p.hero === 'knight') hurtMods(p).strong_shield = (G2, pl, dmg) => (passiveOn(pl) && pl.armor > 0 ? Math.min(dmg, pl.armor) : dmg);
  }
  SK.on('stageEnter', installPassives);
  SK.on('runStart', installPassives);
  // Kẻ Lãng Du — Xuyên Chí Mạng [WIKI]: đạn chí mạng xuyên qua quái, mỗi lần xuyên lại tung chí mạng.
  SK.on('enemyHit', (G, e, dmg, crit) => {
    const p = G.player;
    if (!crit || !p || p.hero !== 'ranger' || !passiveOn(p)) return;
    const s = e.scale, hw = e.hb.size[0] * s / 2, hh = e.hb.size[1] * s / 2;
    const cx = e.x + e.hb.off[0] * e.face * s, cy = e.y - e.hb.off[1] * s;
    const b = G.bullets.find(q => q.side === 'p' && !q.dead && q.crit && !q._pierced && Math.abs(q.x - cx) < hw + q.r + 1 && Math.abs(q.y - cy) < hh + q.r + 1);
    if (!b) return;
    b._pierced = true;
    const sp = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / sp, uy = b.vy / sp;
    let x = b.x, y = b.y, n = 0;
    while (n++ < 60 && Math.abs(x - cx) < hw + b.r + 1 && Math.abs(y - cy) < hh + b.r + 1) { x += ux; y += uy; }
    const again = SK.rand() * 100 < (p.crit || 0);
    const base = b.dmg / R.critMult;
    G.bullets.push(Object.assign({}, b, { x, y, dead: false, _pierced: false, crit: again, dmg: again ? base * R.critMult : base }));
  });

  // Chưa làm (cần hệ thú cưng / chế độ ngắm riêng): Tiên Tộc focus_fire, Tu Sĩ Rừng frostfire_wolves,
  // Pháp Sư Tử Linh nightmare, Sĩ Quan gun_spin. Các id này rơi về dual_wield (actors.js cảnh báo một lần).
})();
