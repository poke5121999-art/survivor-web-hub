// Nhân vật, vũ khí (bảng theo kind), quái (bảng AI theo lớp Unity), súng quái, đạn, đồ rơi, hiệu ứng.
(function () {
  'use strict';
  const SK = window.SK, D = SK.D, DS = SK.DS, T = SK.TILE, W = SK.world;
  const R = DS.rules;
  const U = SK.PPU;

  // ---------------------------------------------------------------- di chuyển có va chạm
  // Hộp chân: rộng 2r, cao r, đáy tại y (chân).
  function blocked(map, x, y, r) { return W.boxHits(map, x - r, y - r, x + r, y); }
  SK.moveBox = function (map, a, dx, dy, r) {
    let hit = false;
    const stepAxis = (d, ax) => {
      let rem = d;
      while (Math.abs(rem) > 1e-6) {
        const s = Math.abs(rem) > 1 ? Math.sign(rem) : rem;
        const nx = ax ? a.x + s : a.x, ny = ax ? a.y : a.y + s;
        if (blocked(map, nx, ny, r)) { hit = true; return; }
        a.x = nx; a.y = ny; rem -= s;
      }
    };
    stepAxis(dx, true); stepAxis(dy, false);
    return hit;
  };

  // ---------------------------------------------------------------- vẽ súng xoay quanh tay
  SK.drawGun = function (ctx, sprite, hx, hy, ang, off, o) {
    const left = Math.cos(ang) < 0;
    ctx.save();
    ctx.translate(Math.round(hx), Math.round(hy));
    ctx.rotate(ang);
    if (left) ctx.scale(1, -1);
    if (o && o.rot) ctx.rotate(o.rot);
    if (o && o.scale && o.scale !== 1) ctx.scale(o.scale, o.scale);
    let ox = (off ? off[0] : 0) - ((o && o.kick) || 0), oy = off ? -off[1] : 0;
    // o.xf: tư thế nút sprite 'w' theo clip Animator của vũ khí ({dx, dy, sx, sy, rot} của SK.animXform, trong hệ súng)
    const xf = o && o.xf;
    if (xf) { ctx.translate(ox + xf.dx, oy + xf.dy); if (xf.rot) ctx.rotate(xf.rot); if (xf.sx !== 1 || xf.sy !== 1) ctx.scale(xf.sx, xf.sy); ox = oy = 0; }
    if (!sprite || !SK.draw(ctx, sprite, ox, oy, { pages: o && o.pages })) {
      ctx.fillStyle = '#3a3f4a'; ctx.fillRect(ox - 2, oy - 2, 11, 4);
      ctx.fillStyle = '#8b93a3'; ctx.fillRect(ox - 2, oy - 2, 11, 1);
    }
    ctx.restore();
  };
  // Điểm nòng (gp theo trục súng, y hướng lên) ra toạ độ thế giới.
  function gunTip(hx, hy, ang, gp, scale) {
    const s = scale || 1, left = Math.cos(ang) < 0;
    const gx = gp[0] * s, gy = (left ? gp[1] : -gp[1]) * s;
    return [hx + gx * Math.cos(ang) - gy * Math.sin(ang), hy + gx * Math.sin(ang) + gy * Math.cos(ang)];
  }

  // ---------------------------------------------------------------- hiệu ứng + số sát thương
  // SK.fx: hiệu ứng vẽ tay còn lại cho mô-đun khác (ring, dust, spawn, prefab). 'muzzle' giờ là lửa nòng thật (SK.vfx).
  SK.fx = function (G, kind, x, y, o) {
    if (kind === 'muzzle' && vfxOn()) {
      const n = o && o.frame ? 'muzzle_' + o.frame : 'muzzle_bullet_4';
      if (SK.vfx.has(n)) { SK.vfx.spawn(G, n, x, y, { ang: (o && o.ang) || 0, flip: Math.cos((o && o.ang) || 0) < 0 }); return; }
    }
    if (kind === 'muzzle') return;
    G.fx.push(Object.assign({ kind, x, y, t: 0, dur: 0.5 }, o));
  };
  SK.num = function (G, x, y, val, color, big) { G.nums.push({ x: x + SK.randf(-3, 3), y, val, color, big, t: 0 }); };

  // ---------------------------------------------------------------- dữ liệu thật 8.6 (data/sk-weapons86.js)
  const X = window.SK_W86 || null;
  const XB = X ? X.bullets : {}, XE = X ? X.explodes : {};
  const vfxOn = () => !!(SK.vfx && SK.vfx.spawn);
  function vfx(G, name, x, y, o) { return name && vfxOn() && SK.vfx.has(name) ? SK.vfx.spawn(G, name, x, y, o) : null; }
  // Thân đạn (X.fx, khung 'W:*', trang art/w86) ghép vào SK_VFX lúc cần lần đầu: vfx.js nạp sau actors.js.
  let fxReady = false;
  function ensureFx() {
    if (fxReady) return true;
    const V = window.SK_VFX;
    if (!X || !V || !vfxOn()) return false;
    const base = V.atlas.pages.length;
    for (const pg of X.atlas.pages) V.atlas.pages.push(pg + '?w=' + X.v);
    for (const k in X.atlas.f) { const f = X.atlas.f[k].slice(); f[0] += base; V.atlas.f[k] = f; }
    for (const k in X.fx) V.effects['W:' + k] = X.fx[k];
    fxReady = true;
    return true;
  }
  // ---------------------------------------------------------------- tiếng (js/sfx.js: SK.sfx.play / preload)
  // Tiếng bắn thật = Gun*.audio_clip của prefab súng [ĐO]; tiếng trúng/nổ = SK_AUDIO.byPrefab[đạn | nổ].
  const AU = () => window.SK_AUDIO || null;
  function snd(name, o) { if (name && SK.sfx && SK.sfx.play) SK.sfx.play(name, o); }
  function fireClip86(d) {
    const A = AU(); if (!A || !d) return null;
    const c = d.w86 && d.w86.sfx && d.w86.sfx.split('@')[0];
    if (c && A.clips[c]) return c;
    const bp = d.prefab && A.byPrefab[d.prefab];
    return bp && bp.fire ? (Array.isArray(bp.fire) ? bp.fire[0] : bp.fire) : null;
  }
  // sfx.js tra tiếng bắn theo SK_AUDIO.byWeapon[w.id]: vũ khí mới (id = tên prefab) chưa có thì ghi thêm, rồi nạp trước
  // tiếng bắn + tiếng trúng của đạn để phát súng đầu không bị câm.
  function weaponAudio(w) {
    const A = AU(); if (!A || !w || !w.def) return;
    const fc = fireClip86(w.def);
    if (fc && (!A.byWeapon[w.id] || !A.byWeapon[w.id].fire)) A.byWeapon[w.id] = { prefab: w.def.prefab, fire: fc };
    const names = [fc];
    for (const b of (w.def.w86 && w.def.w86.b) || []) { const bp = b.p && A.byPrefab[b.p]; if (bp && bp.hit) names.push(bp.hit); }
    const ch = w.def.w86 && (w.def.w86.x.clip_hold || w.def.w86.x.clipHold);
    if (ch) names.push(ch);
    if (SK.sfx && SK.sfx.preload) SK.sfx.preload(names.filter(Boolean));
  }
  function hitSnd(pf) { const A = AU(), bp = A && pf && A.byPrefab[pf]; if (bp && bp.hit) snd(Array.isArray(bp.hit) ? bp.hit[0] : bp.hit, { ev: 'bulletHit', poly: 2, gap: 0.05, vol: 0.5, jit: 0.08 }); }
  function boomSnd(name, small) {
    const A = AU(), bp = A && A.byPrefab[name];
    if (bp) snd((small ? bp.small_clip : bp.big_clip) || bp.fire || bp.big_clip, { ev: 'explode', poly: 2, gap: 0.08, vol: 0.8 });
  }

  SK.w86 = { data: X, ensureFx, vfx, pose: w => pose(w) };
  // Tia lửa trúng đích / nổ: hiệu ứng thật mà prefab đạn trỏ tới (RGBulletTrigger.hit_object, ExplodeEffectTrigger.creation).
  function hitVfx(G, pf, x, y, ang, dflt) {
    const n = (pf && vfxOn() && SK.vfx.hitFor(pf)) || dflt;
    return vfx(G, n, x, y, { ang: ang || 0 });
  }

  // ---------------------------------------------------------------- hình súng: cây nút + clip Animator thật
  // Nút rig: {n, p, T:[px,py,rz°,sx,sy] (đơn vị Unity, y lên), f, o, dis, off, c, fx, fy}. Clip: {len, loop, cv:[{n,k,s}]}.
  function clipVal(s, t) {
    let i = 0;
    while (i < s.length - 1 && t >= s[i + 1][0]) i++;
    const k = s[i];
    if (k.length === 2) return k[1];
    const d = t - k[0];
    return ((k[1] * d + k[2]) * d + k[3]) * d + k[4];
  }
  const aff = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
    A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
  // Tư thế rig ở trạng thái Animator hiện tại của vũ khí -> [{M (Unity, theo gốc súng), f, show, a, n}]
  function pose(w) {
    const e = w.def.w86, rig = e.rig, SM = e.SM;
    let clip = null, ct = 0;
    if (SM) {
      const s = SM.st[w.st == null ? SM.def : w.st];
      if (s && s.c != null && e.CL[s.c]) {
        clip = e.CL[s.c];
        const k = s.len > 0 ? clip.len / s.len : 1, t = (w.t || 0) * k;
        ct = clip.len > 0 ? (clip.loop ? t % clip.len : Math.min(t, clip.len)) : 0;
      }
    }
    const L = rig.map(n => {
      const T = n.T || [0, 0, 0, 1, 1], r = T[2] * Math.PI / 360;
      return { px: T[0], py: T[1], qz: Math.sin(r), qw: Math.cos(r), ez: null, sx: T[3], sy: T[4], f: n.f, en: !n.dis, on: !n.off, a: 1 };
    });
    if (clip) {
      for (const cv of clip.cv) {
        const l = L[cv.n]; if (!l) continue;
        if (cv.k === 'spr') { let i = 0; while (i < cv.s.length - 1 && ct >= cv.s[i + 1][0]) i++; l.f = cv.s[i][1]; continue; }
        const v = clipVal(cv.s, ct);
        switch (cv.k) {
          case 'px': l.px = v; break; case 'py': l.py = v; break; case 'sx': l.sx = v; break; case 'sy': l.sy = v; break;
          case 'qz': l.qz = v; break; case 'qw': l.qw = v; break; case 'ez': l.ez = v; break;
          case 'en': l.en = v > 0.5; break; case 'on': l.on = v > 0.5; break; case 'ca': l.a = v; break;
        }
      }
    }
    const out = [];
    for (let i = 0; i < rig.length; i++) {
      const l = L[i], rz = l.ez != null ? l.ez * Math.PI / 180 : 2 * Math.atan2(l.qz, l.qw);
      const c = Math.cos(rz), s = Math.sin(rz);
      const M = [c * l.sx, s * l.sx, -s * l.sy, c * l.sy, l.px, l.py];
      const par = rig[i].p >= 0 ? out[rig[i].p] : null;
      out.push({ M: par ? aff(par.M, M) : M, f: l.f, show: l.on && (!par || par.vis) && l.en, vis: l.on && (!par || par.vis), a: l.a * (par ? par.a : 1), n: rig[i] });
    }
    return out;
  }
  // Gốc súng trên màn hình: tịnh tiến tới tay, xoay theo góc ngắm, ngắm sang trái thì lật dọc (như SK), đơn vị Unity -> px.
  function rootMat(hx, hy, ang, scale) {
    const c = Math.cos(ang), s = Math.sin(ang), fy = c < 0 ? -1 : 1, k = U * (scale || 1);
    return [c * k, s * k, s * fy * k, -c * fy * k, hx, hy];
  }
  function drawRig(ctx, w, hx, hy, ang, o) {
    const P = pose(w), R = rootMat(hx, hy, ang, o && o.scale);
    const order = P.map((q, i) => i).sort((a, b) => ((P[a].n.o || 0) - (P[b].n.o || 0)) || (a - b));
    for (const i of order) {
      const q = P[i];
      // w.frameOverride: lớp đổi sprite nút 'w' bằng mã (Cào Trúng Thưởng: weapons_332_1/_2) [ĐO GunLottery.OnSpecialAnimFinish]
      if (w.frameOverride && q.n.n === 'w' && SK.frame(w.frameOverride)) q.f = w.frameOverride;
      if (!q.show || !q.f || q.f === 'nothing' || !SK.frame(q.f)) continue;
      const M = aff(R, q.M);
      ctx.save();
      ctx.transform(M[0], M[1], M[2], M[3], M[4], M[5]);
      ctx.scale((q.n.fx ? -1 : 1) / U, (q.n.fy ? 1 : -1) / U);
      const op = { pages: o && o.pages, alpha: q.a * ((o && o.alpha) != null ? o.alpha : 1) };
      if (q.n.c && !(o && o.pages)) SK.drawTinted(ctx, q.f, 0, 0, q.n.c, op); else SK.draw(ctx, q.f, 0, 0, op);
      ctx.restore();
    }
  }
  // Điểm nòng (nút gun_point ở tư thế hiện tại) -> {x, y, ang} màn hình. Không có gun_point: mép khung súng.
  function muzzle86(w, hx, hy, ang) {
    const e = w.def.w86, P = pose(w), R = rootMat(hx, hy, ang);
    let i = e.rig.findIndex(n => n.n === 'gun_point');
    if (i < 0) {
      const f = SK.frame(w.def.sprite);
      const d = f ? f[3] - f[5] : 10;
      return { x: hx + Math.cos(ang) * d, y: hy + Math.sin(ang) * d, ang };
    }
    const M = aff(R, P[i].M);
    return { x: M[4], y: M[5], ang: Math.atan2(M[1], M[0]) };
  }

  // ---------------------------------------------------------------- đạn 8.6
  // Hành vi theo lớp di chuyển của prefab đạn [ĐO bullets: MonoBehaviour gốc]: RGSword* = vệt chém bám người,
  // RGShortLaser/RGLaser/RGPointLaser = tia tức thì, BulletFollow = cầu xoay quanh, BulletParabola = ném vòng cung,
  // còn lại bay thẳng. Tốc độ lấy từ bulletsInfo của súng (đơn vị/giây).
  const MELEE_MV = /^RGSword/, BEAM_MV = /^(RGShortLaser|RGLaser|RGPointLaser)$/;
  SK.spawnBullet86 = function (G, side, pf, x, y, ang, o) {
    o = o || {};
    const B = XB[pf] || null, m = B ? B.m : {};
    const mv = (B && B.mv) || 'Bullet01', mp = m[mv] || {};
    const size = o.size || 1, col = B && B.col;
    let r = 2, off = 0;
    if (col && col.box) { r = Math.max(1.5, Math.min(col.box[2], col.box[3]) * U * size / 2); off = col.box[0] * U * size; }
    else if (col && col.r != null) { r = Math.max(1.5, col.r * U * size); off = (col.off ? col.off[0] : 0) * U * size; }
    const spdU = o.spd != null ? o.spd : (mp.speed != null ? mp.speed : 10);
    const b = {
      side, v86: pf, B, mv, x, y, h: o.h != null ? o.h : 6, ang, vx: Math.cos(ang) * spdU * U, vy: Math.sin(ang) * spdU * U,
      dmg: o.dmg || 0, crit: !!o.crit, repel: o.repel || 0, life: o.life || mp.destroy_time || 5, t: 0, r, off, size, bsize: o.bsize || size, expSize: o.expSize,
      pierce: o.thr || 0, reb: m.RGBTRebound ? (m.RGBTRebound.max_rebound_count || 0) : 0, owner: o.owner || null,
      flip: !!o.flip, hits: null, spin: mp.rotate_angle && mv !== 'BulletFollow' ? mp.rotate_angle : 0
    };
    if (MELEE_MV.test(mv) && spdU > 0.01) {
      // RGSword có tốc (thánh giá của Nữ Tu, sóng kiếm...): bay thẳng, xuyên quái, tắt theo autoDestroyDelay [ĐO]
      b.life = o.life || mp.autoDestroyDelay || 2; b.slashFly = true;
    } else if (MELEE_MV.test(mv)) {
      // [ĐO] RGSword.autoDestroyDelay là trần; vệt chém tắt theo hoạt ảnh của chính prefab (fx.dur)
      const fd = X && X.fx[pf] ? X.fx[pf].dur : 0.3;
      b.life = Math.min(mp.autoDestroyDelay || 2, fd || 0.3); b.melee = true; b.vx = b.vy = 0;
      b.hx = o.hx != null ? x - o.hx : 0; b.hy = o.hy != null ? y - o.hy : 0;
    } else if (mv === 'BulletFollow') {
      b.orbit = { r: (mp.ballPositionOffset || 2) * U, w: (mp.rotate_angle || 360) * Math.PI / 180, a0: ang, cd: {} };
      b.life = o.life || mp.destroy_time || 5; b.vx = b.vy = 0;
    } else if (mv === 'BulletParabola') {
      b.gy = y + b.h; b.z = 0; b.vz = (mp.y_speed || 10) * U; b.gz = (mp.gravity || 35) * U;
    } else if (spdU <= 0.01 && !BEAM_MV.test(mv)) {
      b.area = true; b.life = Math.min(b.life, (X && X.fx[pf] ? X.fx[pf].dur : 0.4) || 0.4);   // đạn đứng yên: vùng sát thương một lần
    }
    G.bullets.push(b);
    if (o.flipY) {
      // Nhát chém ngược: Unity đặt localScale.y = -1 (gương trục Y cục bộ, vệt vẫn ở phía trước) [ĐO Gun006.CreateBullet];
      // vfx.flip là gương trục X, nên vẽ bằng góc + π kèm flip. Hộp trúng (localOf) đã coi b.flip là gương Y.
      b.flip = true;
      const fol = { get x() { return b.x; }, get y() { return b.y; }, get ang() { return b.ang + Math.PI; }, get dead() { return b.dead; }, get gone() { return b.gone; } };
      if (B && B.fx && ensureFx()) b.fxh = SK.vfx.spawn(G, 'W:' + pf, x, y, { ang: ang + Math.PI, follow: fol, scale: size, flip: true });
    } else if (B && B.fx && ensureFx()) b.fxh = SK.vfx.spawn(G, 'W:' + pf, x, y, { ang, follow: b, scale: size, flip: b.flip });
    return b;
  };

  // Tia: dò theo hướng tới tường (tối đa maxDistance đơn vị), trúng mọi quái trên đường (tia SK xuyên quái).
  function beam86(G, side, pf, x, y, ang, o) {
    const B = XB[pf] || {}, m = B.m || {}, mp = m[B.mv] || {};
    const maxL = Math.min(50, mp.laserLength || mp.maxDistance || mp.range || 20) * U;   // [ĐO RGLaser.laserLength, RGShortLaser.maxDistance]
    const c = Math.cos(ang), s = Math.sin(ang), h = o.h != null ? o.h : 6, hit = [];
    let len = 0;
    while (len < maxL) {
      len += 2;
      const bx = x + c * len, by = y + s * len;
      if (W.solidAt(G.map, bx, by + h)) {
        const ob = W.obstacleAt(G.map, bx, by + h);
        if (ob && ob.kind === 'box' && side === 'p') SK.hitObstacle(G, ob, o.dmg);
        break;
      }
      if (side === 'p') {
        for (const e of G.enemies) {
          if (!targetable(e) || hit.indexOf(e) >= 0 || !hitsEnemy(e, bx, by, 2)) continue;
          hit.push(e);
          SK.hurtEnemy(G, e, o.dmg, o.crit, ang, o.repel || 0);
          hitVfx(G, pf, bx, by, ang, 'hit_yellow');
        }
      } else if (hitsPlayer(G, bx, by, 2)) { SK.hurtPlayer(G, o.dmg, bx, by); break; }
    }
    // Hình tia: prefab thật, kéo nút thân ('img'/'bullet') dài theo tia, dời nút 'end' tới điểm chạm [ĐO RGShortLaser: head/end/img].
    if (B.fx && ensureFx()) {
      // Tia liên tục (o.keep = vũ khí đang giữ): giữ MỘT hiệu ứng, cập nhật vị trí/góc/độ dài mỗi nhịp, để clip mở tia chạy trọn.
      let hh = o.keep && o.keep.beamH;
      if (hh && !hh.dead && hh.name === 'W:' + pf) { hh.x = x; hh.y = y; hh.ang = ang; hh.life = hh.t + (o.dur || 0.15); }
      else { hh = SK.vfx.spawn(G, 'W:' + pf, x, y, { ang, dur: o.dur || 0.15 }); if (o.keep) o.keep.beamH = hh; }
      if (hh) {
        // chỉ kéo nút thân cấp cao nhất (img), con của nó (bullet, light) kéo theo
        const bi = hh.nodes.findIndex(nd => nd.d.n === 'img'), body = hh.nodes[bi >= 0 ? bi : hh.nodes.findIndex(nd => /^(bullet|laser|line)$/.test(nd.d.n))];
        const bodyI = hh.nodes.indexOf(body), endI = hh.nodes.findIndex(nd => nd.d.n === 'end');
        // clip của tia (nếu có) đặt lại cỡ thân / vị trí đầu cuối mỗi khung: bản def riêng bỏ hai đường đó
        if (hh.def.anims) hh.def = beamDef(pf, hh.def, bodyI, endI);
        if (endI >= 0) { hh.nodes[endI].T[0] = len / U; hh.nodes[endI].dirty = true; }
        if (body) { body.T[7] = len / U; body.dirty = true; }
      }
    }
    return len;
  }

  const beamDefs = {};
  function beamDef(pf, def, bodyI, endI) {
    if (beamDefs[pf]) return beamDefs[pf];
    const anims = def.anims.map(a => Object.assign({}, a, { clips: a.clips.map(c => Object.assign({}, c, {
      curves: c.curves.filter(cv => !((cv.n === bodyI && cv.k === 'sx') || (cv.n === endI && cv.k === 'px')))
    })) }));
    return (beamDefs[pf] = Object.assign({}, def, { anims }));
  }
  function hitsEnemy(e, x, y, r) {
    const s = e.scale, hw = e.hb.size[0] * s / 2 + r, hh = e.hb.size[1] * s / 2 + r;
    const cx = e.x + e.hb.off[0] * e.face * s, cy = e.y - e.hb.off[1] * s;
    return Math.abs(x - cx) < hw && Math.abs(y - cy) < hh;
  }
  function hitsPlayer(G, x, y, r) {
    const p = G.player; if (!p || p.st === 'dead') return false;
    const hb = p.h.hurt, cy = p.y - hb.off[1];
    return Math.abs(x - p.x) < hb.size[0] / 2 + r && Math.abs(y - cy) < hb.size[1] / 2 + r;
  }
  // Nhân tố thử thách (SK.FACTORS, js/factors.js) chỉ đọc G.mods; thiếu G.mods (mùa giải...) thì trung tính.
  const MODS = () => SK.G.mods || {};
  const critRoll = (p, crit) => SK.rand() * 100 < ((p.crit || 0) + (crit || 0)) * (MODS().critRateMul || 1);
  // Bạo kích = 1 + (hệ số gốc − 1) × critDmgMul: Thuật Cường Hóa Chính Xác ×2 → ×1,5, Dao Găm Điên Cuồng ×2 → ×2,5.
  const CM = () => 1 + ((R.critMult || 2) - 1) * (MODS().critDmgMul || 1);

  // ---------------------------------------------------------------- một phát bắn của súng 8.6
  // info = bulletsInfo [ĐO]: {p prefab, dmg, spd, size, crit, repel, thr}.
  // Cỡ nghỉ của nút 'b' trong prefab vệt chém (sword_1_75: 1,75; sword_0: 1,5) [ĐO X.fx nút b, T[7]].
  const swordB = {};
  function swordBase(pf) {
    if (swordB[pf] != null) return swordB[pf];
    const f = X && X.fx[pf], b = f && f.nodes.find(n => n.n === 'b');
    return (swordB[pf] = b && b.T && Math.abs(b.T[7]) > 1e-6 ? Math.abs(b.T[7]) : 0);
  }
  function shot86(G, p, w, info, mz, ang, o) {
    const d = w.def, crit = critRoll(p, o && o.crit != null ? o.crit : info.crit);
    const base = o && o.dmg != null ? o.dmg : info.dmg;
    const dmg = Math.max(0, Math.round(base * (d.w86.dmf || 1) * (p.dmgMul || 1))) * (crit ? CM() : 1);
    const B = XB[info.p] || {}, x = d.w86.x;
    const [hx, hy] = handPos(p, w.side || 1);
    const spd = o && o.spd != null ? o.spd : info.spd;
    // Đạn thường: bulletsInfo.size không nhân vào hình, prefab đã mang sẵn cỡ (bullet_28 nút b ×2) [ƯỚC LƯỢNG sau khi so ảnh].
    // Vệt chém RGSword thì khác: ResetSize ĐẶT cỡ nút b = (size, ±size) [ĐO RGSword.ResetSize, size = bulletInfo.size > 0],
    // nên cỡ thật = size / cỡ nghỉ của b (Kiếm Laser Tím 3,5/2,5; Thiết Tướng 2/1,5; Kiếm Sư 1/1,75).
    let size = (o && o.size) || 1;
    const sword = MELEE_MV.test(B.mv || '');
    if (sword && info.size > 0 && swordBase(info.p)) size *= info.size / swordBase(info.p);
    // Vệt chém đứng yên sinh ở tay (transform.parent = h1), không ở nòng đang vung [ĐO CreateBullet của Gun006, Gun015,
    // GunAxe, GunInitAssassin, GunInitJoker, GunInitCaptain, Katana]; Gun015.createBulletAtGunpoint / GunHarmmer.useGunPoint thì ở nòng.
    let at = mz;
    if (sword && !(spd > 0.01) && !x.createBulletAtGunpoint && !x.useGunPoint && !(o && o.at)) at = { x: hx, y: hy };
    // Cỡ logic của đạn = bulletInfo.size (sau tụ lực). Thân đạn thường KHÔNG đổi cỡ: RGBullet.UpdateInfo chỉ đặt nút 'b' khi
    // updataInfoWithSize, mà trường này không có trong typetree bundle 8.6 -> mặc định false [ĐO RGBullet.UpdateInfo, bullet.ab].
    // Nhưng nổ ExplodeEffectTrigger.scaleEffectByBulletSize lấy đúng cỡ này × sizeFactor [ĐO ExplodeStart] (bazooka nổ ×2).
    const bsize = (info.size > 0 ? info.size : 1) * ((o && o.size) || 1);
    // Vệt chém: Gun006 & họ đặt localScale = (facing, reverse ? -1 : 1) [ĐO Gun006.CreateBullet]: quay mặt trái thì vệt là
    // ảnh gương như thân nhân vật (gương trục Y cục bộ quanh hướng ngắm), cộng dồn với nhát chém ngược.
    const flipY = !!(o && o.flip) !== (sword && p.face < 0);
    const common = { dmg, crit, repel: info.repel, thr: o && o.thr != null ? o.thr : info.thr, size, bsize, h: Math.max(2, p.y - at.y), owner: p,
      spd, hx, hy, flipY, life: o && o.life, keep: w.beamKeep ? w : null, dur: w.beamKeep ? 0.2 : 0.15, expSize: o && o.expSize };
    // Họ laser mà prefab đạn không phải lớp đạn bay (bullet_9 của Ion Laser không có MB): vẫn là tia [ĐO cây head/end/img]
    if (BEAM_MV.test(B.mv || '') || (d.w86.fam === 'laser' && !/^(Bullet|RGSBullet)/.test(B.mv || ''))) return beam86(G, 'p', info.p, at.x, at.y, ang, common);
    return SK.spawnBullet86(G, 'p', info.p, at.x, at.y, ang, common);
  }
  // Độ lệch mỗi viên: RGRandom.Range(-d, d), d = deviation × (1 + deviation của nhân vật) [ĐO GameUtil.GetFinalDeviation].
  const jitter = dev => SK.deg(SK.randf(-dev, dev));
  // Mẫu bắn theo họ lớp Gun* (tools/weapons86 FAMILY_PREFIX) [ĐO trường: multiCount, angle, continuousCount, delay, max_delay].
  function fireW86(G, p, w, o) {
    const d = w.def, e = d.w86, x = e.x, bs = e.b.filter(b => b.p);
    if (!bs.length) return;
    const mz = { x: o.x, y: o.y }, aim = o.ang, dev = d.spread || 0;
    const pick = () => x.randomBullet ? SK.pick(bs) : bs[x.bulletIndex && bs[x.bulletIndex] ? x.bulletIndex : 0];
    // Tốc mỗi viên = bullet_speed + RGRandom.Range(-sc, sc), sc tính bằng đơn vị/giây, không phải % [ĐO Gun002/Gun004.CreateBullet].
    const spdOf = b => b.spd + (x.speed_correction ? SK.randf(-x.speed_correction, x.speed_correction) : 0);
    const fam = e.fam;
    const mc = d.pellets || x.multiCount || 1;   // def.pellets: buff "Súng Săn" (rooms.js) cộng thêm viên
    if (fam === 'fan') {
      const n = mc, step = x.angle || 0;
      for (let i = 0; i < n; i++) { const b = pick(); shot86(G, p, w, b, mz, aim + SK.deg((i - (n - 1) / 2) * step) + jitter(dev), { spd: spdOf(b) }); }
    } else if (fam === 'spray') {
      const n = mc;
      for (let i = 0; i < n; i++) {
        // has_delay: Invoke("CreateBullet", max_delay), mọi viên cùng trễ đúng max_delay [ĐO Gun004.Attack]
        const b = pick(), a = aim + jitter(dev), dl = x.has_delay ? x.max_delay || 0 : 0;
        if (dl > 0) w.q.push({ t: dl, fn: () => shot86(G, p, w, b, mz, a, { spd: spdOf(b) }) });
        else shot86(G, p, w, b, mz, a, { spd: spdOf(b) });
      }
    } else if (fam === 'burst') {
      const n = x.continuousCount || 1;
      for (let i = 0; i < n; i++) {
        const b = pick(), f = () => { const m2 = w.lastMz || mz; shot86(G, p, w, b, m2, (w.lastAng != null ? w.lastAng : aim) + jitter(dev)); };
        if (i === 0) f(); else w.q.push({ t: i * (x.delay || 0.1), fn: f });
      }
    } else if (fam === 'orbit') {
      // [WIKI Magic Staff] cầu đang có thì dùng lại để kéo dài thời gian; [ĐO] Gun010.destory_time
      const life = x.destory_time || 5;
      const own = G.bullets.find(b => b.orbit && b.owner === p && b.v86 === bs[0].p && !b.dead);
      if (own) own.life = life; else shot86(G, p, w, bs[0], { x: p.x, y: p.y - 7 }, aim, { life });
    } else if (fam === 'bow' || fam === 'charge') {
      // Nhả nút: k = thời gian giữ / max_time.
      const k = o.charge == null ? 1 : o.charge, b0 = bs[0], b1 = bs[1] || bs[0];
      const n = x.multiCount || 1, reps = x.continuousCount || 1;
      // LaserRain: releaseAngle là nón thả tia [ƯỚC LƯỢNG]; đạn đầu tốc 0 (tia sinh trong mã) thì lấy số lớn nhất của bulletsInfo
      const step = x.angle != null ? x.angle : (x.releaseAngle && n > 1 ? x.releaseAngle / (n - 1) : 0);
      const sHi = b0.spd || Math.max(...e.b.map(b => b.spd || 0)), sLo = b1.spd || sHi, dB = b0.dmg || Math.max(...e.b.map(b => b.dmg || 0));
      const full = k >= 0.999, tr = Math.trunc;
      let info = full ? b0 : b1, so = {};
      if ((fam === 'bow' && e.cls !== 'LaserRain') || (fam === 'charge' && (x.clip_big != null || x.a_interval != null))) {
        // bulletsInfo[1] là PHẦN CỘNG khi tụ đầy (bulletDelta): số = số[0] + (int)(k × số[1]) cho sát thương, crit, tốc, xuyên
        // [ĐO Gun005.Attack, Gun007.<CreateBullet>]. Cung: 4→8 sát thương, 30→40 đơn vị/giây, crit 0→50. Cỡ (Gun007) = size0 + k × size1.
        info = b0;
        so = { dmg: b0.dmg + tr(k * b1.dmg), crit: b0.crit + tr(k * b1.crit), spd: b0.spd + tr(k * b1.spd), thr: b0.thr + tr(k * b1.thr) };
        if (fam === 'charge' && b0.size > 0 && b1 !== b0) so.size = Math.max(0.1, (b0.size + k * b1.size) / b0.size);
      } else if (e.cls === 'WeaponChargeStaff' && b1 !== b0) {
        // Nội suy bulletsInfo[0] -> [1] theo k, làm tròn [ĐO WeaponChargeStaff.CreateBullet: GetBulletInfo(1), GetBulletInfo(0), modf/floor]
        const L = (a, b) => a + (b - a) * k;
        info = b0;
        so = { dmg: Math.round(L(b0.dmg, b1.dmg)), crit: Math.round(L(b0.crit, b1.crit)), spd: L(b0.spd, b1.spd), size: b0.size > 0 ? L(b0.size, b1.size) / b0.size : 1 };
      } else if (e.cls === 'GunInitPaladin' && x.max_atk_add != null) {
        // [ĐO trường max_atk_add 4, max_critical_add 35, scale 1 -> max_scale 1,7] [ƯỚC LƯỢNG nội suy tuyến tính theo k]
        info = b0;
        so = { dmg: b0.dmg + Math.round(k * x.max_atk_add), crit: b0.crit + Math.round(k * (x.max_critical_add || 0)),
          size: (x.scale || 1) > 0 ? ((x.scale || 1) + k * ((x.max_scale || 1) - (x.scale || 1))) / (x.scale || 1) : 1 };
      }
      for (let r = 0; r < reps; r++) {
        const f = () => {
          for (let i = 0; i < n; i++) {
            const a = aim + SK.deg((i - (n - 1) / 2) * step) + jitter(dev);
            if (e.cls === 'LaserRain') shot86(G, p, w, b0, w.lastMz || mz, a, { spd: sLo + (sHi - sLo) * k, dmg: Math.round(dB * (1 + k)) });
            else shot86(G, p, w, info, w.lastMz || mz, a, so);
          }
        };
        if (r === 0) f(); else w.q.push({ t: r * (x.a_interval || 0.15), fn: f });
      }
    } else {
      const n = fam === 'single' || fam === 'throw' || fam === 'spin' ? 1 : (x.multiCount || 1);
      // Đạn có prefab mà số 0 (Cung Thợ Săn: lông vũ trang trí), số thật nằm ở mục bulletsInfo không prefab [ĐO weapon_083]
      const alt = e.b.find(b => !b.p && b.spd > 0);
      for (let i = 0; i < n; i++) {
        let b = pick();
        if (alt && !b.spd && !b.dmg) b = Object.assign({}, b, { spd: alt.spd, dmg: alt.dmg, crit: alt.crit, repel: alt.repel });
        shot86(G, p, w, b, mz, aim + jitter(dev), { flip: o.flip });
      }
    }
  }

  // Hành vi theo kind (API cho mô-đun khác: SK.WEAPON_KINDS[kind].fire(G, p, w, {x, y, ang, side, charge})).
  // Vũ khí 8.6 (def.w86) đều đi qua fireW86; kind chỉ còn để phân loại (cửa hàng, buff, tiếng dự phòng).
  const w86Kind = { fire(G, p, w, o) { if (w.def.w86) fireW86(G, p, w, o); else legacyShot(G, p, w, o); } };
  // Vũ khí tự định nghĩa không có dữ liệu 8.6 (kỹ năng...): một viên thẳng bằng prefab đạn nếu có.
  function legacyShot(G, p, w, o) {
    const d = w.def, crit = critRoll(p, d.crit);
    const dmg = Math.round((d.dmg || 1) * (p.dmgMul || 1)) * (crit ? CM() : 1), a = o.ang + jitter(d.spread || 0);
    if (X) {
      const n = d.pellets || 1;
      for (let i = 0; i < n; i++) {
        SK.spawnBullet86(G, 'p', d.bullet && XB[d.bullet] ? d.bullet : 'bullet_0', o.x, o.y, a + SK.deg((i - (n - 1) / 2) * (d.fan || 0)),
          { dmg, crit, repel: d.repel || 1, spd: d.bulletSpeed || 20, h: Math.max(2, p.y - o.y), owner: p });
      }
      return;
    }
    // chưa nạp data/sk-weapons86.js: viên đạn sprite kiểu cũ (số wiki)
    const spd = (d.bulletSpeed || 18) * U;
    G.bullets.push({ side: 'p', kind: 'pb', x: o.x, y: o.y, h: Math.max(2, p.y - o.y), vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, ang: a,
      dmg, crit, repel: d.repel || 1, r: 2, life: 1.6, sprite: SK.frame(d.bullet) ? d.bullet : 'bullet_38', hit: d.hit, pierce: d.pierce || 0 });
  }
  SK.WEAPON_KINDS = {
    gun: w86Kind, staff: w86Kind, bow: w86Kind, laser: w86Kind, launcher: w86Kind, throw: w86Kind,
    // Cận chiến không có dữ liệu 8.6 (vuốt sói của kỹ năng...): quạt tầm range, góc arc; có w86 thì là vệt chém thật.
    melee: {
      fire(G, p, w, o) {
        if (w.def.w86) { fireW86(G, p, w, o); return; }
        const d = w.def, reach = d.range || 24, half = SK.deg((d.arc || 150) / 2);
        const cx = p.x, cy = p.y - 7, dmg = d.dmg || 1;
        const inArc = (x, y, pad) => {
          const dd = Math.hypot(x - cx, y - cy);
          if (dd > reach + pad) return false;
          const a = Math.atan2(y - cy, x - cx) - o.ang;
          return Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) <= half || dd < 8;
        };
        for (const e of G.enemies) {
          if (!targetable(e) || !inArc(e.x, e.y - e.hb.off[1] * e.scale, e.r)) continue;
          const crit = critRoll(p, d.crit);
          SK.hurtEnemy(G, e, Math.round(dmg * (p.dmgMul || 1)) * (crit ? CM() : 1), crit, o.ang, d.repel || 3);
          vfx(G, 'hit_white', e.x, e.y - e.hb.off[1] * e.scale, { ang: o.ang });
        }
        for (const b of G.bullets) {
          if (b.side !== 'e' || b.dead || !inArc(b.x, b.y, 4)) continue;
          if (p.reflectBullets) SK.reflectBullet(G, b, o.ang); else { b.dead = true; vfx(G, 'hit_red', b.x, b.y, {}); }
        }
        w.swing = 0.16;
      }
    }
  };

  // ---------------------------------------------------------------- vũ khí người chơi
  // st/t: trạng thái Animator + thời gian trong trạng thái; q: phát trễ (loạt, súng săn có trễ); hold: giây đã tụ lực.
  SK.makeWeapon = id => {
    const w = { id, def: DS.weapons[id], cd: 0, kick: 0, hold: 0, charging: false, heldAt: -1, st: null, t: 0, q: [] };
    weaponAudio(w);
    return w;
  };
  // Ứng viên rương/lái buôn (design.js); nơi gọi SK.pick() trong danh sách trả về.
  SK.weaponPool = (level, source) => {
    const all = DS.weaponPool ? DS.weaponPool(level, source, SK.rand) : DS.chestPool.slice();
    if (!MODS().meleeOnly) return all;
    // meleeOnly (Cận Chiến Giới Hạn): chỉ cận chiến; bể cấp này không có thì lấy mọi vũ khí cận chiến trong các bể.
    const melee = all.filter(id => DS.weapons[id] && DS.weapons[id].kind === 'melee');
    if (melee.length) return melee;
    const any = []; for (const l of Object.values(DS.weaponPools || {})) for (const id of l) if (DS.weapons[id] && DS.weapons[id].kind === 'melee' && any.indexOf(id) < 0) any.push(id);
    return any.length ? any : all;
  };

  // ---------------------------------------------------------------- người chơi
  // Tay cầm súng theo skin: DS.heroes[].hand tính từ pivot của s0 (design.js handOf); skin khác dời theo độ lệch pivot.
  SK.heroHand = function (heroId, skin, left) {
    const h = DS.heroes[heroId], base = (left && h.hand2) || h.hand || [3, 6];
    const H = D.heroes && D.heroes[heroId], e = SK.heroSkin(heroId, skin);
    if (!H || !e || e === H.s0 || !e.pivot || !H.s0.pivot) return base;
    return [+(base[0] + e.pivot[0] - H.s0.pivot[0]).toFixed(2), +(base[1] - e.pivot[1] + H.s0.pivot[1]).toFixed(2)];
  };
  SK.makePlayer = function (heroId, x, y) {
    const skin = SK.profile && SK.profile.skinOf ? SK.profile.skinOf(heroId) : 0;
    const hd = D.heroes && SK.heroSkin(heroId, skin);
    let h = DS.heroes[heroId];
    if (hd && D.heroes[heroId].s0 !== hd) h = Object.assign(Object.create(h), { hand: SK.heroHand(heroId, skin), hand2: SK.heroHand(heroId, skin, true) });
    return {
      hero: heroId, h, anims: hd || {}, x, y, face: 1, aim: 0, moving: false, t: 0,
      hp: h.hp, hpMax: h.hp, armor: h.armor, armorMax: h.armor, energy: h.energy, energyMax: h.energy,
      crit: h.crit || 0, gold: 0, weapons: [SK.makeWeapon(h.weapon), null], cur: 0,
      st: 'alive', stT: 0, invulT: 0, armorT: 0, armorTick: 0, flash: 0,
      skillCd: 0, skillT: 0, dual: null, target: null, god: false, speedMul: 1,
      // Layer >= 1 của controller skin gốc (L1.char_hit khi trúng đòn), chạy bằng SK.smStep.
      sm: hd && hd.ctrl ? SK.smNew(hd.ctrl, hd.layers) : null
    };
  };

  function targetable(e) { return e.st !== 'spawn' && e.st !== 'dead'; }

  // Ưu tiên con thấy được; không có thì con gần nhất cùng phòng (bắn vỡ thùng chắn đường như SK).
  function pickTarget(G, p) {
    let best = null, bd = R.autoAimRange, hidden = null, hd = R.autoAimRange;
    for (const e of G.enemies) {
      if (!targetable(e)) continue;
      const ey = e.y - e.hb.off[1] * e.scale;
      const d = Math.hypot(e.x - p.x, ey - p.y);
      if (d >= bd && d >= hd) continue;
      if (W.los(G.map, p.x, p.y - 6, e.x, ey)) { if (d < bd) { best = e; bd = d; } }
      else if (e.room === G.room && d < hd) { hidden = e; hd = d; }
    }
    return best || hidden;
  }

  // Tay phải = nút img/h1, tay trái (súng thứ hai khi Song Thủ) = img/h2: cả hai cùng phía mặt, h2 xa hơn về trước
  // (Hiệp Sĩ h2 (0,55; 0,6) đv -> [12,72; 8,4] px) [ĐO hero.ab]. Bản cũ lật h2 ra sau lưng.
  function handPos(p, side) {
    const hd = (side === 2 && p.h.hand2) || p.h.hand || [3, 6];
    return [p.x + hd[0] * p.face, p.y - hd[1]];
  }
  SK.handPos = handPos;

  // ---------------------------------------------------------------- chạy vũ khí: máy trạng thái Animator thật
  // SM (tools/weapons86 machine()): st[i] = {c clip, len (giây ở tốc 1, đã chia tốc trạng thái), loop, ev [[t, tên]],
  // h: chuyển khi đang giữ nút {to, x} | null, r: khi đã nhả}. x = null là chuyển ngay; x = thời điểm chuẩn hoá (exit time).
  // Thời gian chạy × weapon_speed × rateMul [ĐO RGWeapon.ResetWeaponSpeed -> Animator.set_speed].
  function exitAt(s, t, x) {
    const L = s.len;
    // Trạng thái không lặp có exit time 0 và sự kiện bắn do tools tự thêm (syn): Unity chuyển ở vòng kế (hết clip), không chuyển
    // ngay lúc vào — không thì hai trạng thái chuyền qua lại tức thì, bắn mỗi khung (Lá Phong Khổng Lồ 600 phát/giây) [ĐO clip
    // w_staff_normal_atk 0,5833 s]
    if (s.syn && !s.loop && x <= 0) x = 1;
    if (L <= 0) return t;
    if (s.loop && x < 1) return (Math.floor(t / L - x) + 1 + x) * L;
    const T0 = x * L;
    return T0 > t ? T0 : t;
  }
  function evWindow(s, a, b, cb) {
    for (const ev of s.ev) {
      const e = ev[0] || 1e-4;   // sự kiện ở 0 s chạy ngay khi vào trạng thái (Unity)
      if (s.loop && s.len > 0) {
        for (let k = Math.floor((a - e) / s.len) + 1, n = 0; e + k * s.len <= b + 1e-9 && n < 8; k++, n++) cb(ev[1]);
      } else if (a + 1e-9 < e && e <= b + 1e-9) cb(ev[1]);   // cùng dung sai hai đầu: 0,2333 + 0,01667 = 0,24999… không bắn đôi
    }
  }
  // Có đường bật tắt gun_point trong clip thì lửa nòng là chính nút đó (vẽ trong rig); không thì dùng SK_VFX.weapons.
  function gpAnimated(e) {
    if (e._gp != null) return e._gp;
    const gi = e.rig.findIndex(n => n.n === 'gun_point');
    e._gp = gi >= 0 && e.CL.some(c => c && c.cv.some(v => v.n === gi && (v.k === 'en' || v.k === 'on')));
    return e._gp;
  }
  function fireEvent(G, p, w, side, fn, charge) {
    const d = w.def, e = d.w86, cost = d.cost || 0;
    const ws = WEAPON_SPECIALS[e.cls];
    if (ws && ws.blockFire && ws.blockFire(w)) return;
    if (charge == null && p.energy < cost) return;
    if (charge == null) p.energy -= cost;
    const [hx, hy] = handPos(p, side);
    // Rìu (GunAxe*): vòng xoáy quanh người, gun_point của rìu vung lên đầu nên đặt đạn ở tay [ƯỚC LƯỢNG]
    const mz = /^GunAxe/.test(e.cls) ? { x: hx, y: hy, ang: p.aim } : muzzle86(w, hx, hy, p.aim);
    w.lastMz = mz; w.lastAng = p.aim;
    // Góc đạn = fixedAngle của nhân vật (góc ngắm), không theo nòng đang giật [ĐO RGWeapon.GetBulletInfo: directionAngle =
    // get_fixedAngle + GetFinalDeviation]. Kiếm: Attack chém với reverse = sword_reverse, Attack2 với !sword_reverse [ĐO Gun006.Attack/Attack2].
    const flip = /2$/.test(fn || '') !== !!e.x.sword_reverse;
    const cf = CUSTOM_FIRE[e.cls];
    if (cf) {
      // Lớp tự viết (gọi lính, sổ tử thần...): false = không làm gì, hoàn năng lượng (gốc chỉ MakeConsume khi thành công)
      if (cf(G, p, w, { x: mz.x, y: mz.y, ang: p.aim, side, charge, fn, flip }) === false) { if (charge == null) p.energy += cost; return; }
    } else (SK.WEAPON_KINDS[d.kind] || SK.WEAPON_KINDS.gun).fire(G, p, w, { x: mz.x, y: mz.y, ang: p.aim, side, charge, fn, flip });
    const sf = SELF_FORCE[e.cls];
    if (sf) { const f = sf(e.x, fn, w, p, G); if (f) SK.selfForce(p, p.aim, f); }
    if (ws && ws.onAttack) ws.onAttack(G, p, w, side);
    if (!gpAnimated(e)) {
      const m = vfxOn() && SK.vfx.muzzleFor(d.prefab);
      if (m) vfx(G, m.muzzle, mz.x, mz.y, { ang: p.aim, flip: Math.cos(p.aim) < 0, dur: m.show });
    }
    SK.emit('fire', G, p, w);
  }
  // ---------------------------------------------------------------- lao người khi đánh (RGWeapon.ApplySelfForce)
  // [ĐO RGBaseController.GetForce]: force_direction = dir, inertial_vel = min(|force|, 300). [ĐO RGController.SetVelocity]:
  // khi inertial_vel > 1 thì velocity = lerp(tốc chạy, dir × inertial_vel, forceLerp) với forceLerp = 1 (bỏ hẳn phím chạy),
  // rồi inertial_vel *= min(friction, 1), friction = 0,8 [ĐO RGBaseController..ctor], mỗi FixedUpdate 0,02 s [ĐO TimeManager].
  // Lực 30: đi 30 × 0,02 × (1 − 0,8^16)/0,2 = 2,916 đv = 46,7 px trong 0,32 s.
  const FORCE_DT = 0.02, FORCE_FRICTION = 0.8, FORCE_MAX = 300;
  SK.selfForce = function (p, ang, force) {
    const v = Math.min(Math.abs(force), FORCE_MAX), s = force < 0 ? -1 : 1;
    if (v > 1) p.lunge = { dx: Math.cos(ang) * s, dy: Math.sin(ang) * s, v, acc: 0 };
  };
  function stepPush(G, p, dt) {
    const f = p.lunge;
    f.acc += dt;
    while (f.acc >= FORCE_DT - 1e-9 && f.v > 1) {
      SK.moveBox(G.map, p, f.dx * f.v * U * FORCE_DT, f.dy * f.v * U * FORCE_DT, p.h.body.r);
      f.v *= FORCE_FRICTION; f.acc -= FORCE_DT;
    }
    if (f.v <= 1) p.lunge = null;
  }
  // Lực theo lớp súng, hướng = hướng ngắm (transform.right × facing, hoặc lực đổi dấu theo facing — cùng một kết quả).
  // [ĐO] Gun015/GunSpearLaser: mỗi Attack, trường force. GunInitAssassin: Attack/Attack2 lực 0, Attack3/Attack4 (nhát tụ đầy)
  // max_hold_force. GunInitJoker: attackForce (prefab = 0). GunInitMiner.AttackNormal: 0 (chỉ AttackHold dùng force — web chưa có
  // nhát giữ). GunInitFighter/GunInitBaserker/GunHurricaneGloves: mọi cú đấm Attack(bullet, pos, repel, rev), atk_force.
  // Katana: _forces = [0, 20, 15][_attackIndex] × clamp((khoảng cách tới mục tiêu − 4) / 4, 0, 1), không mục tiêu thì × 1;
  // _attackIndex = lần bấm trước + 1 nếu bấm lại trong nextStateThreshold 0,25 s, tối đa 2, không thì 0 [ĐO Katana..ctor,
  // AttackKeyDown, get_ForceModifierByDistToTgt]. Web đếm theo cạnh bấm nút bắn.
  const KATANA_FORCES = [0, 20, 15];
  const SELF_FORCE = {
    Gun015: x => x.force || 0,
    GunSpearLaser: x => x.force || 0,
    GunInitAssassin: (x, fn) => /^Attack[34]$/.test(fn || '') ? x.max_hold_force || 0 : 0,
    GunInitJoker: x => x.attackForce || 0,
    GunInitFighter: x => x.atk_force || 0,
    GunInitBaserker: x => x.atk_force || 0,
    GunHurricaneGloves: x => x.atk_force || 0,
    Katana: (x, fn, w, p, G) => {
      const t = p.target;
      w.katT = G.t;   // _lastAttackTime
      let k = 1;
      if (t) k = Math.max(0, Math.min(1, (Math.hypot(t.x - p.x, t.y - p.y) / U - 4) * 0.25));
      return KATANA_FORCES[w.katIdx || 0] * k;
    }
  };
  SK.SELF_FORCE = SELF_FORCE;

  // ---------------------------------------------------------------- chiêu phụ của vũ khí (IWeaponSpecial, nút btn_special)
  // [ĐO RGController.SpecialClick]: nút đặc biệt đi lần lượt onUseSpecialButton -> special_item -> thú cưỡi -> vũ khí tay trước
  // nếu `isSpecialWeapon` (= weaponSpecial.IsSpecial) -> `WeaponSpecial(isDown)` (cả lúc bấm và lúc nhả). Nút kỹ năng nhân vật là
  // nút riêng. Web: kỹ năng khai báo special() thì giữ nút cho kỹ năng (khối ở updatePlayer); không thì chuyển cho vũ khí.
  // Gatling và Katana: IsSpecial = RGWeapon.get_IsEvolvedWeapon — bản thường KHÔNG có chiêu phụ, không tích nhiệt [ĐO].
  // Web chưa có lò rèn tiến hoá: đặt w.evolved = true để bật.
  const WEAPON_SPECIALS = {
    // GunGatlin [ĐO Attack, SetHeatValue, WeaponSpecial, PowerAttackSequence]: mỗi Attack ở tay h1 cộng heatIncreasePerShot 3,
    // kẹp [0, maxHeat 100]; đầy thì quá nhiệt = sẵn sàng. Bấm: 4 loạt cách delay 0,25 s (floor(duration 1 / 0,25)), mỗi loạt
    // multiCount 4 viên bulletsInfo[1] (bullet_gatlin_power 2 sát thương, 20 đv/s), không tốn năng lượng; trong 1 s đó Attack bị chặn.
    GunGatlin: {
      isSpecial: w => !!w.evolved,
      progress: w => (w.heat || 0) / (w.def.w86.x.maxHeat || 100),
      blockFire: w => !!w.powerT,
      onAttack(G, p, w, side) {
        if (!w.evolved || side !== 1) return;
        const x = w.def.w86.x, mx = x.maxHeat || 100;
        w.heat = Math.max(0, Math.min(mx, (w.heat || 0) + (x.heatIncreasePerShot || 3)));
        if (w.heat >= mx) w.overheat = true;
      },
      press(G, p, w, down) {
        if (!down || !w.evolved || !w.overheat) return false;
        const x = w.def.w86.x, n = Math.floor((x.duration || 1) / (x.delay || 0.25)), b1 = w.def.w86.b[1];
        w.overheat = false; w.heat = 0; w.powerT = x.duration || 1;
        for (let r = 0; r < n; r++) {
          const f = () => {
            const [hx, hy] = handPos(p, 1), mz = muzzle86(w, hx, hy, p.aim);
            for (let i = 0; i < (x.multiCount || 4); i++) shot86(G, p, w, b1, mz, p.aim + jitter(w.def.spread || 0), { spd: b1.spd });
            G.shake = Math.max(G.shake || 0, 2);
            SK.emit('fire', G, p, w);
          };
          if (r === 0) f(); else w.q.push({ t: r * (x.delay || 0.25), fn: f });
        }
        return true;
      },
      update(G, p, w, dt) { if (w.powerT > 0) w.powerT = Math.max(0, w.powerT - dt); }
    },
    // Katana [ĐO WeaponSpecial, UpdateSpecialBtn, SpecialAtk, SpecialAtkDash; hằng SpecialAtkCoolDown 6, SpecialAtkSpeed 40,
    // SpecialAtkDistance 8, SpecialAtkDelay 0,15, InvincibleDurTolerance 0,8]: năng lượng chiêu nạp 1/giây tới 6; bấm khi đầy:
    // có mục tiêu thì lao tới nó (khoảng cách + 0,5 đv), không thì 8 đv theo hướng ngắm (dừng ở tường); vệt bulletsInfo[0] ở tay,
    // lướt 40 đv/s, chờ 0,15 s rồi chém sword_katana_slash (bulletsInfo[5], 24 sát thương) ở điểm đến − 0,5 đv.
    // StartHitTrigger(dist/40 + 0,8) coi như bất tử trong lúc lướt [ƯỚC LƯỢNG nghĩa của hàm].
    Katana: {
      isSpecial: w => !!w.evolved,
      progress: w => Math.min(1, (w.spE || 0) / 6),
      update(G, p, w, dt) {
        if (w.evolved) w.spE = Math.min(6, (w.spE || 0) + dt);
        const ds = w.dash;
        if (!ds) return;
        ds.t += dt;
        if (ds.moved < ds.len) {
          // Vector3.MoveTowards(pos, tgtPos, 40·dt): đi đúng tới đích, không vượt
          const s = Math.min(40 * U * dt, ds.len - ds.moved);
          ds.moved += s;
          SK.moveBox(G.map, p, ds.dx * s, ds.dy * s, p.h.body.r);
        } else if (!ds.done && ds.t >= ds.dur + 0.15) {
          ds.done = true; w.dash = null;
          const b5 = w.def.w86.b[5];
          if (b5 && b5.p) {
            // scale.x = dir.x < 0 ? 1 : −1: vệt quay ngược về đường vừa lướt (cùng quy ước gương với vệt thường khi mặt trái)
            const a = Math.atan2(ds.dy, ds.dx) + Math.PI, want = ds.dx >= 0;
            shot86(G, p, w, b5, { x: p.x - ds.dx * 0.5 * U, y: p.y - 7 - ds.dy * 0.5 * U }, a, { at: true, flip: want !== (p.face < 0) });
          }
          SK.emit('fire', G, p, w);
        }
      },
      press(G, p, w, down) {
        if (!down || !w.evolved || (w.spE || 0) < 6 || w.dash) return false;
        let dx = Math.cos(p.aim), dy = Math.sin(p.aim), dist = 8;
        const t = p.target;
        if (t) { const ex = t.x - p.x, ey = t.y - p.y, L = Math.hypot(ex, ey) || 1; dx = ex / L; dy = ey / L; dist = L / U + 0.5; }
        else {
          for (let s = 0; s <= 8 * U; s += 2) if (W.solidAt(G.map, p.x + dx * s, p.y - 8 + dy * s)) { dist = s / U; break; }
        }
        const dur = dist / 40;
        w.spE = 0; w.dash = { dx, dy, dur, t: 0, len: dist * U, moved: 0 };
        p.invulT = Math.max(p.invulT, dur + 0.8);
        const [hx, hy] = handPos(p, 1);
        shot86(G, p, w, w.def.w86.b[0], { x: hx, y: hy }, Math.atan2(dy, dx), {});
        return true;
      }
    }
  };
  SK.WEAPON_SPECIALS = WEAPON_SPECIALS;

  // ---------------------------------------------------------------- lính do vũ khí gọi ra (G.props, nhận đạn địch)
  // a = {x, y, hp, hpMax, face, t, dead, gone, life, update(G, a, dt), draw(ctx, G, a)}. Đạn địch trúng hộp 10×14 thì mất máu.
  function weaponAllies(G) { return (G._wAllies = (G._wAllies || []).filter(a => !a.gone)); }
  SK.weaponAllies = weaponAllies;
  function addWeaponAlly(G, a) {
    a.t = 0; a.flash = 0; a.face = a.face || 1;
    G.props.push({
      x: a.x, y: a.y, wAlly: a,
      update(G2, q, dt) {
        a.t += dt; a.flash = Math.max(0, a.flash - dt);
        if (!a.dead) {
          if (a.life != null && a.t >= a.life) allyDie(G2, a);
          else {
            a.update(G2, a, dt);
            for (const b of G2.bullets) {
              if (b.side !== 'e' || b.dead || Math.abs(b.x - a.x) > 5 + (b.r || 2) || Math.abs(b.y - (a.y - 7)) > 7 + (b.r || 2)) continue;
              if (b.v86) endB86(G2, b, 'hit'); else b.dead = true;
              a.hp -= b.dmg || 1; a.flash = 0.08;
              if (a.hp <= 0) { allyDie(G2, a); break; }
            }
          }
        }
        q.x = a.x; q.y = a.y;
        if (a.gone) q.gone = true;
      },
      draw(ctx, G2) { a.draw(ctx, G2, a); }
    });
    weaponAllies(G).push(a);
    return a;
  }
  function allyDie(G, a) { if (a.dead) return; a.dead = true; a.deadT = a.t; if (a.onDie) a.onDie(G, a); else a.gone = true; }
  // Mục tiêu gần nhất trong r px (có tầm nhìn).
  function nearestEnemy(G, x, y, r) {
    let best = null, bd = r;
    for (const e of G.enemies) {
      if (!targetable(e)) continue;
      const ey = e.y - e.hb.off[1] * e.scale, d = Math.hypot(e.x - x, ey - y);
      if (d < bd && W.los(G.map, x, y, e.x, ey)) { best = e; bd = d; }
    }
    return best;
  }
  function allyWalk(G, a, tx, ty, spd, dt) {
    const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
    if (d < 1) return;
    const s = Math.min(d, spd * dt);
    SK.moveBox(G.map, a, dx / d * s, dy / d * s, 4);
    if (Math.abs(dx) > 1) a.face = dx > 0 ? 1 : -1;
    a.moving = true;
  }
  // Theo chủ ở 2 đv, quá 20 đv thì dịch chuyển về cạnh chủ [ĐO NpcSummon01/NpcMercenaryController: follow 2, max_follow_distance 20].
  function allyFollow(G, a, p, dt, spd, e) {
    const dp = Math.hypot(p.x - a.x, p.y - a.y);
    if (dp > 20 * U) { a.x = p.x - p.face * 8; a.y = p.y; return; }
    if (!e && dp > 2 * U) allyWalk(G, a, p.x, p.y, spd, dt);
  }

  // ---------------------------------------------------------------- lính thuê (13, data/sk-mercs.js; prefab npc_NN)
  // Dùng lại addWeaponAlly/allyFollow/allyDie: nhận đạn địch, theo chủ 2–20 đv, chết thì biến mất kèm vũ khí. HP/tốc/chí mạng/atk_cd/giá
  // đọc từ prefab [ĐO npc_NN]; sát thương = damage đạn của vũ khí mặc định [ĐO bulletsInfo]. Cách đánh (cận chiến/bắn, loạt 3 phát)
  // theo loại vũ khí wiki [ƯỚC LƯỢNG: AI "đánh từng đợt cố định rồi nghỉ" không có số].
  // G.mercs = danh sách lính còn sống (hired = thuê ở phòng đặc biệt, chặn phòng lính thuê tầng sau; lồng nhốt thì không).
  // Mỗi mục: kind, spd (px/s trước nhân), pf (đạn), n (số phát mỗi đợt), melee, heal.
  const MERC_ATK = {
    npc_01: { melee: 1 }, npc_02: { pf: 'bullet_1', spd: 36, n: 3 }, npc_03: { pf: 'bullet_1', spd: 20, n: 3, fan: 3 },
    npc_04: { pf: 'bullet_13', spd: 14, n: 2 }, npc_05: { melee: 1 }, npc_06: { pf: 'bullet_1', spd: 12, n: 2 },
    npc_07: { pf: 'bullet_2', spd: 40, n: 3 }, npc_08: { melee: 1 }, npc_09: { pf: 'bullet_13', spd: 14, n: 1 },
    npc_10: { pf: 'bullet_2', spd: 50, n: 2 }, npc_11: { heal: 1 }, npc_12: { melee: 1 }, npc_13: { pf: 'bullet_1', spd: 30, n: 3 }
  };
  SK.MERC_ATK = MERC_ATK;
  const MERC_ART = { npc_01: 'npc_knight_01' };   // prefab npc_01 trùng tên với một prefab UI; wiki: hiệp sĩ tượng dùng chung hình Kỵ Sĩ Hoàng Gia
  function livingMercs(G) { return (G.mercs = (G.mercs || []).filter(a => !a.dead && !a.gone)); }
  SK.livingMercs = livingMercs;
  // opt: {hired, armed (false = tay không, lồng nhốt), hpBonus}
  SK.addMercenary = function (G, p, id, x, y, opt) {
    const M = window.SK_MERCS && window.SK_MERCS.mercs[id]; if (!M) return null;
    opt = opt || {};
    const pf = SK.prefab(MERC_ART[id] || id), anims = (pf && pf[0] && pf[0].a) || {}, A = MERC_ATK[id] || {};
    const hpMax = M.hp + (opt.hpBonus || 0);
    const a = addWeaponAlly(G, {
      merc: id, M, hired: !!opt.hired, armed: opt.armed !== false, x, y: Math.max(y, p.y - 2), hp: opt.hp != null ? opt.hp : hpMax, hpMax, cd: 1, owner: p, hpBonus: opt.hpBonus || 0,
      update(G2, a, dt) {
        a.moving = false; a.cd -= dt;
        if (a.armed && A.heal) {                       // Kỵ Sĩ Hy Vọng: hồi chậm cho chủ (atk_cd 15 s) [ĐO npc_11 atk_cd 15]
          if (a.cd <= 0 && p.st !== 'dead' && p.hp < p.hpMax) { a.cd = M.atkCd; p.hp = Math.min(p.hpMax, p.hp + 1); vfx(G2, 'effect_health', p.x, p.y - 8, { follow: p, dy: -8, scale: 0.7 }); }
          else if (a.cd <= 0) a.cd = 0.5;
        }
        const e = nearestEnemy(G2, a.x, a.y - 7, 12 * U);
        const spd = M.speed * U * 1.0;
        allyFollow(G2, a, p, dt, spd, e);
        if (!e || A.heal) return;
        const ey = e.y - e.hb.off[1] * e.scale, d = Math.hypot(e.x - a.x, ey - (a.y - 7));
        a.face = e.x >= a.x ? 1 : -1;
        const melee = A.melee || !a.armed;
        if (melee && d > 2 * U) { allyWalk(G2, a, e.x, e.y, spd, dt); return; }
        if (a.cd > 0) return;
        a.cd = M.atkCd;
        const ang = Math.atan2(ey - (a.y - 7), e.x - a.x);
        if (melee) {
          const crit = SK.rand() * 100 < M.crit, dmg = a.armed ? M.damage : 1;
          SK.hurtEnemy(G2, e, dmg * (crit ? CM() : 1), crit, ang, 2);
          return;
        }
        const n = A.n || 1, fan = A.fan || 1;
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < fan; j++) {
            const crit = SK.rand() * 100 < M.crit, aj = ang + (fan > 1 ? (j - (fan - 1) / 2) * 0.18 : 0) + (SK.rand() - 0.5) * 0.12;
            SK.spawnBullet86(G2, 'p', A.pf, a.x + Math.cos(ang) * 6, a.y - 7 + Math.sin(ang) * 6, aj, { dmg: M.damage * (crit ? CM() : 1), crit, repel: 2, owner: a, h: 7, spd: A.spd });
          }
        }
      },
      onDie(G2, a) { a.gone = true; G2.mercs = (G2.mercs || []).filter(q => q !== a); SK.emit('mercDie', G2, a); },
      draw(ctx, G2, a) {
        const key = a.moving ? (anims.run || anims.npc_run || Object.values(anims).find(v => /run|walk/.test(v))) : (anims.idle || Object.values(anims).find(v => /ide|idle|stand/.test(v)) || Object.values(anims)[0]);
        const fr = key && SK.animFrame(key, a.t);
        if (!fr || !SK.draw(ctx, fr, a.x, a.y, { flip: a.face < 0, pages: a.flash > 0 ? SK.pagesWhite : null })) {
          ctx.fillStyle = '#9fd2ff'; ctx.fillRect(a.x - 4, a.y - 12, 8, 12);
        }
      }
    });
    (G.mercs = G.mercs || []).push(a);
    return a;
  };
  // Qua cổng: lính còn sống về đầy máu [WIKI Followers "vào tầng mới hồi đầy"] và đứng cạnh chủ; lính lồng nhốt cầm vũ khí mặc định.
  SK.on('runStart', G => { G.mercs = []; });
  SK.on('stageEnter', (G, stage) => {
    const p = G.player, old = livingMercs(G);
    G.mercs = [];
    old.forEach((m, i) => {
      m.gone = true;
      SK.addMercenary(G, p, m.merc, p.x - p.face * (8 + i * 6), p.y, { hired: m.hired, armed: true, hpBonus: m.hpBonus });
    });
  });

  // ---------------------------------------------------------------- vũ khí lớp tự viết (CUSTOM_FIRE[cls](G, p, w, o))
  // Gọi thay cho WEAPON_KINDS ở sự kiện Attack; trả false = không làm gì (fireEvent hoàn năng lượng).
  const CUSTOM_FIRE = {}, CUSTOM_HOLD = {};
  SK.CUSTOM_FIRE = CUSTOM_FIRE; SK.CUSTOM_HOLD = CUSTOM_HOLD;
  // Vùng hút/sát thương đứng yên (lỗ đen): prop tự đếm nhịp. z = {x, y, r (px), dmg, every, pull (px/s), pullR (px), life}
  function addZone(G, p, z) {
    z.t = 0; z.tick = 0;
    G.props.push({
      x: z.x, y: z.y - 1, zone: z,
      update(G2, q, dt) {
        z.t += dt;
        if (z.follow) { z.x = z.follow.x; z.y = z.follow.y; }
        if (z.life != null && z.t >= z.life) { z.gone = true; if (z.h) z.h.stop(); if (z.onEnd) z.onEnd(G2, z); }
        if (z.gone) { q.gone = true; return; }
        if (z.pull && z.pullR) {
          for (const e of G2.enemies) {
            if (!targetable(e) || e.boss) continue;
            const dx = z.x - e.x, dy = z.y - e.y, d = Math.hypot(dx, dy);
            if (d > 2 && d < z.pullR) SK.moveBox(G2.map, e, dx / d * Math.min(d, z.pull * dt), dy / d * Math.min(d, z.pull * dt), e.r || 4);
          }
        }
        if (z.every && z.r) {
          z.tick -= dt;
          if (z.tick <= 0) {
            z.tick += z.every;
            for (const e of G2.enemies) {
              if (!targetable(e)) continue;
              if (Math.hypot(e.x - z.x, e.y - e.hb.off[1] * e.scale - z.y) < z.r + e.r) SK.hurtEnemy(G2, e, Math.round(z.dmg * (p.dmgMul || 1)), false, Math.atan2(e.y - z.y, e.x - z.x), 0);
            }
          }
        }
        if (z.update) z.update(G2, z, dt);
        q.x = z.x; q.y = z.y - 1;
      },
      draw() {}
    });
    return z;
  }
  function zoneFx(G, pf, x, y) { return X && X.fx[pf] && ensureFx() ? SK.vfx.spawn(G, 'W:' + pf, x, y, { dur: 999 }) : null; }
  // Điểm cách nòng d px theo góc ang, dừng ở tường (raycast bước 2 px).
  function castTo(G, x, y, ang, d) {
    const c = Math.cos(ang), s = Math.sin(ang);
    for (let k = 0; k <= d; k += 2) if (W.solidAt(G.map, x + c * k, y + s * k + 6)) return [x + c * Math.max(0, k - 2), y + s * Math.max(0, k - 2)];
    return [x + c * d, y + s * d];
  }

  // Vùng đánh mỗi quái một lần trong suốt đời sống (đạn AoE đứng yên có trigger).
  function onceZone(G, p, o) {
    const hit = new Set();
    return addZone(G, p, { x: o.x, y: o.y, life: o.life, h: o.h, update(G2, z) {
      for (const e of G2.enemies) {
        if (!targetable(e) || hit.has(e)) continue;
        const ey = e.y - e.hb.off[1] * e.scale;
        if (Math.hypot(e.x - z.x, ey - z.y) >= o.r + e.r) continue;
        hit.add(e);
        const crit = critRoll(p, o.crit), dmg = Math.round(o.dmg * (p.dmgMul || 1)) * (crit ? CM() : 1);
        SK.hurtEnemy(G2, e, dmg, crit, Math.atan2(ey - z.y, e.x - z.x), o.repel || 0);
      }
    } });
  }
  const isBoss = e => !!(e.arena || e.isBoss || /^boss/i.test(e.id || ''));

  // Sổ Tay Chết Chóc (GunDeadNote, weapon_276) [ĐO GunDeadNote.Attack, BuffDeadNote]: Attack (0,6667 s mỗi vòng clip 1 s) nhắm
  // mục tiêu tự ngắm: quái thường đang thức -> chết ngay (RGEController.Dead, không số sát thương), gắn buff_deadnote trên đầu
  // (0, 0,75 đv), −6 năng lượng. Trùm/không mục tiêu: không tốn năng lượng; không mục tiêu thì phá thùng trong 1,5 đv quanh người.
  CUSTOM_FIRE.GunDeadNote = function (G, p, w) {
    const e = p.target;
    if (e && targetable(e) && !isBoss(e)) {
      killEnemy(G, e, Math.atan2(e.y - p.y, e.x - p.x));
      if (X && X.fx.buff_deadnote && ensureFx()) SK.vfx.spawn(G, 'W:buff_deadnote', e.x, e.y - 0.75 * U - e.hb.size[1] * e.scale * 0.5, {});
      return true;
    }
    if (!e) {
      for (let a = 0; a < 8; a++) {
        const ob = W.obstacleAt(G.map, p.x + Math.cos(a * Math.PI / 4) * 1.5 * U, p.y - 2 + Math.sin(a * Math.PI / 4) * 1.5 * U);
        if (ob && ob.kind === 'box') { SK.hitObstacle(G, ob, 999); break; }
      }
    }
    return false;
  };

  // Cào Trúng Thưởng (GunLottery, weapon_332) [ĐO GunLottery.SetAttack/Toss/OnSpecialAnimFinish/GetReward/CreateCoin]: bấm (không
  // giữ, cost 0) khi chưa ở trạng thái "use": ran = 0..99. 0,6333 s sau đổi hình (ran < 50: weapons_332_1 trúng, không thì _2),
  // thêm 0,7 s: ≤0 → 130 xu coin_0 + 4 coin_1 + 4 coin_2 ("Giải Đặc Biệt"), 1–5 → 20 coin_0 ("Giải 1!!"), 6–20 → 10 coin_0 ("Giải 2!"),
  // 21–49 → 4 coin_1 + 3 coin_2 ("Giải 3"), ≥50 → fx_fart ("Không trúng thưởng"). Xu: coin_0 = 5, coin_1 = 3, coin_2 = 1 vàng
  // (RGCoin.value, nghĩa "vàng nhặt được" [ƯỚC LƯỢNG]). Xong thì thẻ bị bỏ (DropWeapon + huỷ). bullet_93 không dùng.
  const LOTTERY = [[0, [130, 4, 4], 'Giải Đặc Biệt'], [5, [20, 0, 0], 'Giải 1!!'], [20, [10, 0, 0], 'Giải 2!'], [49, [0, 4, 3], 'Giải 3']];
  SK.LOTTERY = LOTTERY;
  CUSTOM_FIRE.GunLottery = () => false;
  CUSTOM_HOLD.GunLottery = {
    down(G, p, w) {
      if (w.lot) return;
      const ran = w.forceRan != null ? w.forceRan : Math.floor(SK.rand() * 100), x = w.def.w86.x;
      w.lot = { ran };
      snd('fx_dead_note', { ev: 'fire', poly: 1, gap: 0.1, vol: 0.7 });
      w.q.push({ t: 0.6333, fn: () => { w.frameOverride = ran < 50 ? x.spriteReward || 'weapons_332_1' : x.spriteNothing || 'weapons_332_2'; } });
      w.q.push({ t: 0.6333 + 0.7, fn: () => {
        const tier = LOTTERY.find(r => ran <= r[0]);
        const [hx, hy] = handPos(p, 1);
        if (tier) {
          const vals = [5, 3, 1];
          tier[1].forEach((n, i) => { for (let k = 0; k < n; k++) SK.dropPickup(G, 'coin', hx, hy, { value: vals[i] }); });
          G.toast(tier[2]);
        } else { snd(x.audioNothing || 'fx_fart', { ev: 'fire', poly: 1, gap: 0.1, vol: 0.8 }); G.toast('Không trúng thưởng'); }
        w.lotDone = tier ? tier[2] : 'none';
        // thẻ dùng rồi bị bỏ
        const i = p.weapons.indexOf(w);
        if (i >= 0) { p.weapons[i] = null; if (p.cur === i && p.weapons[1 - i]) p.cur = 1 - i; }
      } });
    }
  };

  // Lá Phong Khổng Lồ (PrequelStaff, weapon_374) [ĐO PrequelStaff.GetBulletInfo/Attack/ChangeMode, BaseRevolver coldDown 7,
  // Bullet374; clip w_staff_normal_atk(2)]: đánh thường (Attack 0,25 / 0,1944 s, luân phiên hai clip 0,5833 s) = bullet_aoe_w374_2:
  // vòng 4 đv tâm cách nòng 6,06 đv theo hướng ngắm, 12 sát thương, crit 10, đánh mỗi quái một lần, sống 5 s. Chiêu phụ (nút đặc
  // biệt, hồi 7 s, sẵn sàng từ đầu): 0,3 s sau bắn bullet_aoe_w374_1: vòng 6 đv tại nòng (12 sát thương) + 5 lá ở vòng 5 đv
  // cách 72°, trôi vào 5 đv/s trong 0,5 s, chờ 1 s rồi phóng vào tâm 16 đv/s (8 sát thương, sống 7 s; hình lá thay bằng bullet_0
  // [ƯỚC LƯỢNG hình — prefab bullet_shoot_w374_3 không có trong SK_W86]).
  CUSTOM_FIRE.PrequelStaff = function (G, p, w, o) {
    const b = w.def.w86.b, sp = !!w.pqNext;
    w.pqNext = false;
    const info = sp ? b[1] : b[0], c = Math.cos(o.ang), s = Math.sin(o.ang);
    const h = X && X.fx[info.p] && ensureFx() ? SK.vfx.spawn(G, 'W:' + info.p, o.x, o.y, { ang: o.ang, flip: Math.cos(o.ang) < 0 }) : null;
    if (!sp) { onceZone(G, p, { x: o.x + c * 6.06 * U, y: o.y + s * 6.06 * U, r: 4 * U, dmg: info.dmg, crit: info.crit, repel: info.repel, life: 5, h }); return true; }
    onceZone(G, p, { x: o.x, y: o.y, r: 6 * U, dmg: info.dmg, crit: info.crit, repel: info.repel, life: 10, h });
    for (let i = 0; i < 5; i++) {
      const a = i * SK.deg(72), lx = o.x + Math.cos(a) * 5 * U, ly = o.y + Math.sin(a) * 5 * U, ang = a + Math.PI;
      const leaf = { x: lx, y: ly };
      addZone(G, p, { x: lx, y: ly, life: 1.5, update(G2, z) { if (z.t <= 0.5) { z.x = lx + Math.cos(ang) * 5 * U * z.t; z.y = ly + Math.sin(ang) * 5 * U * z.t; } leaf.x = z.x; leaf.y = z.y; },
        onEnd(G2) { SK.spawnBullet86(G2, 'p', 'bullet_0', leaf.x, leaf.y, ang, { dmg: Math.round(8 * (p.dmgMul || 1)), crit: critRoll(p, 10), repel: 3, spd: 16, life: 7, owner: p, h: 6 }); } });
    }
    return true;
  };
  WEAPON_SPECIALS.PrequelStaff = {
    isSpecial: () => true,
    progress: w => Math.min(1, w.pqCast == null ? 1 : w.pqCast / 7),
    update(G, p, w, dt) { if (w.pqCast != null) w.pqCast = Math.min(7, w.pqCast + dt); },
    press(G, p, w, down) {
      if (!down || (w.pqCast != null && w.pqCast < 7) || w.pqNext) return false;
      w.pqCast = 0; w.pqNext = true;
      // clip w_staff_atk_special: Attack ở 0,3 s
      w.q.push({ t: 0.3, fn: () => fireEvent(G, p, w, 1, 'Attack') });
      return true;
    }
  };

  // Đạn Đạo Lỗ Đen (GunBlackHoleMissile : GunChannel, weapon_160) [ĐO GunChannel.AttackStart/Attack/EndShooting/Update,
  // GunBlackHoleMissile.EndShooting/CreateEndShootBullet/DestroyChannelBulletOnEnd, BulletImmediately.Start]:
  // bấm: đồng hồ nạp shoot_end_time 0,8 s (thanh reload_clip). Sự kiện Attack đầu tiên: sinh lỗ đen bullet_84 cách nòng 7 đv theo
  // hướng ngắm (gặp vật cản thì dừng ở đó), đứng yên; mỗi Attack −1 năng lượng. Lỗ: 1 sát thương / 0,5 s trong bán kính 3 đv
  // (ContinuousDamageTrigger), hút quái trong 5,5 đv (PointEffector2D −375 — web kéo 3 đv/s [ƯỚC LƯỢNG]). Nhả: nạp đủ 0,8 s thì
  // bắn 1 tên lửa bullet_89 (16 sát thương, 32 đv/s, nổ explode_scale cỡ explosionSize 1 = size 2 × sizeFactor 1/2), chưa đủ thì
  // không bắn. Lỗ đen ở lại releaseLingerTime 1,2 s rồi tắt. Bản tiến hoá (xung 1 s, thêm tên lửa, nổ to dần) chưa làm.
  CUSTOM_HOLD.GunBlackHoleMissile = {
    down(G, p, w) { w.bh = { t: 0, zone: null }; startChargeFx(G, p, w); },
    hold(G, p, w, dt) {
      const x = w.def.w86.x, s = w.bh; if (!s) return;
      s.t += dt * (p.rateMul || 1);
      if (w.chargeFx) w.chargeFx.t = Math.min(0.999, s.t / (x.shoot_end_time || 0.8));
    },
    up(G, p, w) {
      const x = w.def.w86.x, s = w.bh; stopChargeFx(w);
      if (!s) return;
      w.bh = null;
      if (s.zone) { s.zone.life = s.zone.t + (x.releaseLingerTime || 1.2); }
      if (s.t >= (x.shoot_end_time || 0.8) && x.need_create_bullet_end !== 0) {
        const b1 = w.def.w86.b[1], [hx, hy] = handPos(p, 1), mz = muzzle86(w, hx, hy, p.aim);
        shot86(G, p, w, b1, mz, p.aim, { expSize: 1 });
        snd(x.clip_end_shoot, { ev: 'fire', poly: 1, gap: 0.1, vol: 0.8 });
        SK.emit('fire', G, p, w);
      }
    }
  };
  CUSTOM_FIRE.GunBlackHoleMissile = function (G, p, w, o) {
    const s = w.bh;
    if (!s || s.zone) return true;   // Attack sau: chỉ trừ năng lượng
    const [x, y] = castTo(G, o.x, o.y, o.ang, 7 * U);
    s.zone = addZone(G, p, { x, y, r: 3 * U, dmg: 1, every: 0.5, pull: 3 * U, pullR: 5.5 * U, h: zoneFx(G, 'bullet_84', x, y) });
    return true;
  };

  // Sách Bóng Tối (GunDarkBook, weapon_367) [ĐO GunDarkBook.AttackKeyDown/Update/CreateBullet/GetSpawnPosition,
  // BulletDarkBook.SetState/OnStateEnter2/OnStateEnter3/Stop]: sự kiện Attack rỗng; logic theo nút. Bấm (hồi attackCooldown
  // 0,7 s): sinh lỗ bullet_weapon_367 trên mục tiêu tự ngắm, không có thì cách 6,5 đv phía trước; −2 năng lượng, giữ thêm mỗi
  // consumeTime 1 s −2. Giai đoạn theo timeIntervals [0,3; 1,5; 3]: (1) bán kính 0,1; (2) sau 0,3 s: 2 sát thương / 0,5 s trong 2,2 đv,
  // hút trong 2,3 đv; (3) sau thêm 1,5 s: 3 cầu con quay bán kính 1,2 đv −200°/s (2 sát thương), nổ cuối +8; hết 3 s nữa tự nhả.
  // Nhả ở (1): xì hơi, nổ nhỏ 0,5 đv 2 sát thương. Nhả ở (2)/(3): xoay 0,75 s, co 0,567 s rồi nổ 2,8 đv (2, hoặc 10 nếu đã tới (3)),
  // xoá đạn địch. Bán kính nhân "scale" của nút b chưa rõ có ×2,75 (size) không — web lấy ×1 [ƯỚC LƯỢNG]. Bản tiến hoá chưa làm.
  CUSTOM_FIRE.GunDarkBook = () => false;
  CUSTOM_HOLD.GunDarkBook = {
    down(G, p, w) {
      const x = w.def.w86.x;
      if (w.dbCd > G.t) return;
      if (p.energy < (w.def.cost || 2)) return;
      w.dbCd = G.t + (x.attackCooldown || 0.7);
      if (w.db) this.up(G, p, w);
      p.energy -= w.def.cost || 2;
      const t = p.target, ang = p.aim;
      const [sx, sy] = t ? [t.x, t.y - t.hb.off[1] * t.scale] : [p.x + Math.cos(ang) * 6.5 * U, p.y - 7 + Math.sin(ang) * 6.5 * U];
      const b0 = w.def.w86.b[0], I = x.timeIntervals || [0.3, 1.5, 3];
      const z = addZone(G, p, { x: sx, y: sy, r: 0.1 * U, dmg: b0.dmg || 2, every: 0.5, h: zoneFx(G, b0.p, sx, sy) });
      w.db = { z, stage: 1, st: 0, pay: x.consumeTime || 1, I, orbs: [] };
      snd('fx_fire', { ev: 'fire', poly: 1, gap: 0.1, vol: 0.7 });
      SK.emit('fire', G, p, w);
    },
    hold(G, p, w, dt) {
      const s = w.db; if (!s) return;
      const x = w.def.w86.x;
      s.st += dt;
      if (s.stage < 3) {
        s.pay -= dt;
        if (s.pay <= 0) {
          s.pay += x.consumeTime || 1;
          if (p.energy < (w.def.cost || 2)) { this.up(G, p, w); return; }
          p.energy -= w.def.cost || 2;
        }
      }
      if (s.stage === 1 && s.st >= s.I[0]) { s.stage = 2; s.st = 0; s.z.r = 2.2 * U; s.z.pull = 3 * U; s.z.pullR = 2.3 * U; }
      else if (s.stage === 2 && s.st >= s.I[1]) {
        s.stage = 3; s.st = 0;
        s.z.update = (G2, z, dt2) => {
          // 3 cầu con quay bán kính 1,2 đv, −200°/s, 2 sát thương khi chạm (mỗi con một lần mỗi 0,5 s) [ĐO OnStateEnter3]
          z.oa = (z.oa || 0) - SK.deg(200) * dt2;
          for (let i = 0; i < 3; i++) {
            const a = z.oa + i * Math.PI * 2 / 3, ox = z.x + Math.cos(a) * 1.2 * U, oy = z.y + Math.sin(a) * 1.2 * U;
            for (const e of G2.enemies) {
              if (!targetable(e) || (e._dbOrb || 0) > G2.t) continue;
              if (hitsEnemy(e, ox, oy, 0.24 * U)) { e._dbOrb = G2.t + 0.5; SK.hurtEnemy(G2, e, Math.round(2 * (p.dmgMul || 1)), false, a, 0); }
            }
          }
        };
      } else if (s.stage === 3 && s.st >= s.I[2]) this.up(G, p, w);
    },
    up(G, p, w) {
      const s = w.db; if (!s) return;
      w.db = null;
      const z = s.z, big = s.stage >= 3;
      z.update = null; z.every = 0; z.pull = 0;
      if (s.stage === 1) {
        // xì hơi ~0,8 s sau khi bấm: nổ nhỏ 0,5 đv, 2 sát thương [ĐO Stop]
        z.life = z.t + 0.8;
        z.onEnd = G2 => boom(G2, z.x, z.y, 0.5 * U, 2);
      } else {
        // xoay 0,75 s + co 0,567 s rồi nổ EndExplosion 2,8 đv, sát thương 2 (+8 khi đã tới giai đoạn 3), xoá đạn địch
        z.life = z.t + 0.75 + 0.567;
        z.onEnd = G2 => {
          boom(G2, z.x, z.y, 2.8 * U, 2 + (big ? 8 : 0));
          for (const q of G2.bullets) if (q.side === 'e' && !q.dead && Math.hypot(q.x - z.x, q.y - z.y) < 2.8 * U) { if (q.v86) endB86(G2, q, 'hit'); else q.dead = true; }
        };
      }
      function boom(G2, bx, by, r, dmg) {
        for (const e of G2.enemies) {
          if (!targetable(e)) continue;
          if (Math.hypot(e.x - bx, e.y - e.hb.off[1] * e.scale - by) < r + e.r) SK.hurtEnemy(G2, e, Math.round(dmg * (p.dmgMul || 1)), false, Math.atan2(e.y - by, e.x - bx), 3);
        }
        vfx(G2, 'hit_white_large', bx, by, {});
      }
    }
  };

  // Gậy Tử Linh (StaffOfNecromancy, weapon_116) [ĐO GunSummon01.Attack, StaffOfNecromancy.Summon/AfterSummonPet/
  // RefreshSummonLeaderCondition, NpcSummon01.Start; prefab pet/*.ab]: mỗi Attack gọi 1 lính xương tại tay: đếm 1, 2 là
  // npc_skeleton_01, lần 3 (spawnEliteAfterSummonCount) là ex_npc_skeleton_01 rồi đếm lại. Lính chết để lại xác; đủ 6 xác
  // (spawnLeaderAfterSummonCount) thì lần gọi sau ra Thủ lĩnh npc_skeleton_03, xác bị gom (xương bay vào Thủ lĩnh).
  // Lính tự chết sau life_time 15 s (Thủ lĩnh 20 s). Tìm địch trong 12 đv, đánh khi cách 2 đv. Tốc chạy = speed đv/s [ƯỚC LƯỢNG
  // cách ghép speed_rate 0,5]. Mã gốc so khoảng cách xác với collectBoneRadius² (56,25) nên gom mọi xác trong phòng.
  const SKEL = {
    npc_skeleton_01: { hp: 8, spd: 6, dmg: 4, crit: 0, repel: 3, pf: 'sword_1_75', cd: 2, life: 15 },
    ex_npc_skeleton_01: { hp: 16, spd: 8, dmg: 6, crit: 0, repel: 3, pf: 'sword_1_75', cd: 2, life: 15, ex: true },
    npc_skeleton_03: { hp: 28, spd: 5, dmg: 20, crit: 40, repel: 4, pf: 'bullet_hammer', size: 1.75, off: 1.5, cd: 1.5, life: 20, leader: true }
  };
  SK.SKELETONS = SKEL;
  let skelAnims = null;
  function skelAnim() {
    if (skelAnims) return skelAnims;
    const ed = D.enemies && (D.enemies.e_skeleton01 || D.enemies.e_skeleton02);
    return (skelAnims = ed ? resolveAnims(ed) : {});
  }
  function necroState(w) { return (w.necro = w.necro || { count: 0, canLeader: false, pets: [], bones: [] }); }
  function necroRefresh(G, w) {
    const S = necroState(w), dead = S.pets.filter(a => a.dead);
    if (dead.length < (w.def.w86.x.spawnLeaderAfterSummonCount || 6)) return;
    for (const a of dead) { S.pets.splice(S.pets.indexOf(a), 1); S.bones.push(a); }
    S.canLeader = true;
  }
  CUSTOM_FIRE.StaffOfNecromancy = function (G, p, w, o) {
    const S = necroState(w), x = w.def.w86.x;
    let kind;
    if (S.canLeader) { kind = 'npc_skeleton_03'; S.count = 0; S.canLeader = false; }
    else { S.count++; if (S.count >= (x.spawnEliteAfterSummonCount || 3)) { kind = 'ex_npc_skeleton_01'; S.count = 0; } else kind = 'npc_skeleton_01'; }
    const k = SKEL[kind], sx = o.x, sy = Math.max(o.y + 6, p.y - 2);
    vfx(G, x.smoke_effect || 'effect_smoke', sx, sy - 6, {});
    if (k.leader) {
      // xương bay từ các xác vào Thủ lĩnh rồi xác biến mất [ĐO <Summon>b__0: boneProto tại xác + 0,5 đv, FlyingBone.StartFlying]
      for (const c of S.bones) { vfx(G, x.boneProto, c.x, c.y - 8, {}); c.gone = true; }
      S.bones = [];
    }
    const a = addWeaponAlly(G, {
      kind, skel: k, x: sx, y: sy, hp: k.hp, hpMax: k.hp, life: k.life, cd: 0.5, owner: p,
      update(G2, a, dt) {
        a.moving = false; a.cd -= dt;
        const e = nearestEnemy(G2, a.x, a.y - 7, 12 * U);
        allyFollow(G2, a, p, dt, k.spd * U, e);
        if (!e) return;
        const ey = e.y - e.hb.off[1] * e.scale, d = Math.hypot(e.x - a.x, ey - (a.y - 7));
        a.face = e.x >= a.x ? 1 : -1;
        if (d > 2 * U) { allyWalk(G2, a, e.x, e.y, k.spd * U, dt); return; }
        if (a.cd > 0) return;
        a.cd = k.cd;
        const ang = Math.atan2(ey - (a.y - 7), e.x - a.x), crit = SK.rand() * 100 < k.crit;
        const dmg = Math.round(k.dmg * (p.dmgMul || 1)) * (crit ? CM() : 1);
        const bx = a.x + Math.cos(ang) * (k.off || 0) * U, by = a.y - 7 + Math.sin(ang) * (k.off || 0) * U;
        SK.spawnBullet86(G2, 'p', k.pf, bx, by, ang, { dmg, crit, repel: k.repel, owner: a, h: 7, spd: 0, size: k.size || 1, flipY: a.face < 0 });
      },
      onDie(G2, a) {
        if (k.leader) { a.gone = true; return; }
        a.corpse = true;   // autoDestroyAfterDead = false: xác nằm lại
        necroRefresh(G2, w);
      },
      draw(ctx, G2, a) {
        const A = skelAnim(), key = a.dead ? A.dead : a.moving ? A.run : A.idle, fr = key && SK.animFrame(key, a.dead ? a.t - a.deadT : a.t);
        const sc = k.leader ? 1.3 : 1;   // [ƯỚC LƯỢNG hình: dùng khung skeleton01 của quái cho mọi lính]
        if (!fr || !SK.draw(ctx, fr, a.x, a.y, { flip: a.face < 0, sx: sc, sy: sc, pages: a.flash > 0 ? SK.pagesWhite : null })) {
          ctx.fillStyle = '#e8e4d8'; ctx.fillRect(a.x - 4, a.y - 12, 8, 12);
        }
      }
    });
    if (!k.leader) S.pets.push(a);
    necroRefresh(G, w);
    return true;
  };

  // Gậy Ảo Ảnh (GunPhantom, weapon_174) [ĐO GunPhantom.Attack/CreatePhantom/SetupPhatom/GetPhatomWeapon; npc_char_phantom
  // trong common.ab]: gọi count 1 bản sao tại tay, tối đa count con. Đã đủ thì chỉ thay con đã chết hoặc đang cầm vũ khí khác
  // tên; không thay được thì không làm gì và không tốn năng lượng. Bản sao mang hình người chơi, cầm bản sao vũ khí đeo sau lưng
  // (bỏ qua nếu không có hoặc là chính Gậy Ảo Ảnh), máu 100 + giáp tối đa, sống tới khi bị giết. AI: dò 12 đv, theo chủ 2–20 đv,
  // atk_cd 1 s (một lần bóp cò mỗi giây [ƯỚC LƯỢNG nhịp của AI lính đánh thuê]); tay không thì đấm 1 sát thương [ƯỚC LƯỢNG].
  CUSTOM_FIRE.GunPhantom = function (G, p, w, o) {
    const back = p.weapons[1 - p.cur], bw = back && back.def.prefab !== 'weapon_174' ? back : null;
    const lim = w.def.w86.x.count || 1;
    const mine = weaponAllies(G).filter(a => a.phantomOf === w && !a.gone);
    if (mine.length >= lim) {
      const old = mine.find(a => a.dead || (a.w ? a.w.id : null) !== (bw ? bw.id : null));
      if (!old) return false;
      old.gone = true;
    }
    const hpMax = 100 + (p.armorMax || 0);
    const cw = bw ? SK.makeWeapon(bw.id) : null;
    // "người chơi giả" để bắn bằng WEAPON_KINDS (handPos/crit/dmgMul/face đọc từ đây)
    addWeaponAlly(G, {
      phantomOf: w, w: cw, x: o.x, y: Math.max(o.y + 6, p.y - 2), hp: hpMax, hpMax, cd: 1, h: p.h, crit: p.crit, dmgMul: p.dmgMul, aim: 0,
      weapons: [cw, null], cur: 0, energy: 1e9, energyMax: 1e9,
      update(G2, a, dt) {
        a.moving = false; a.cd -= dt; a.crit = p.crit; a.dmgMul = p.dmgMul;
        if (a.w && a.w.q.length) {   // phát trễ của loạt/súng săn (như runWeapon)
          for (const q of a.w.q) q.t -= dt;
          const due = a.w.q.filter(q => q.t <= 0);
          if (due.length) { a.w.q = a.w.q.filter(q => q.t > 0); for (const q of due) q.fn(); }
        }
        const e = nearestEnemy(G2, a.x, a.y - 7, 12 * U);
        allyFollow(G2, a, p, dt, p.h.speed * U, e);
        if (!e) return;
        const ey = e.y - e.hb.off[1] * e.scale;
        a.aim = Math.atan2(ey - (a.y - 7), e.x - a.x); a.face = Math.cos(a.aim) >= 0 ? 1 : -1;
        if (!a.w && Math.hypot(e.x - a.x, ey - (a.y - 7)) > 2 * U) { allyWalk(G2, a, e.x, e.y, p.h.speed * U, dt); return; }
        if (a.cd > 0) return;
        a.cd = 1;
        if (!a.w) { SK.hurtEnemy(G2, e, 1, false, a.aim, 1); return; }
        const [hx, hy] = handPos(a, 1), dw = a.w.def;
        const mz = dw.w86 ? muzzle86(a.w, hx, hy, a.aim) : { x: hx + Math.cos(a.aim) * 8, y: hy + Math.sin(a.aim) * 8 };
        a.w.lastMz = mz; a.w.lastAng = a.aim;
        (SK.WEAPON_KINDS[dw.kind] || SK.WEAPON_KINDS.gun).fire(G2, a, a.w, { x: mz.x, y: mz.y, ang: a.aim, side: 1, charge: 1 });
      },
      draw(ctx, G2, a) {
        const key = a.moving ? p.anims.run : p.anims.idle, fr = SK.animFrame(key, a.t);
        ctx.save(); ctx.globalAlpha *= 0.75;
        if (fr) SK.drawTinted(ctx, fr, a.x, a.y, [0.12, 0.1, 0.2, 1], { flip: a.face < 0, pages: a.flash > 0 ? SK.pagesWhite : null });
        if (a.w) { const [hx, hy] = handPos(a, 1); if (a.w.def.w86) drawRig(ctx, a.w, hx, hy, a.aim); else SK.drawGun(ctx, a.w.def.sprite, hx, hy, a.aim, null, {}); }
        ctx.restore();
      }
    });
    return true;
  };
  // Vũ khí tay trước có chiêu phụ đang bật không (HUD có thể hiện btn_special theo hàm này).
  SK.weaponSpecial = p => {
    const w = p && p.weapons[p.cur], ws = w && w.def.w86 && WEAPON_SPECIALS[w.def.w86.cls];
    return ws && ws.isSpecial(w) ? { w, ws, progress: ws.progress ? ws.progress(w) : 1 } : null;
  };
  function startChargeFx(G, p, w) {
    const ro = w.def.w86.x.reload_obj || w.def.w86.x.reloadObj;
    // [ĐO] Gun005.reload_obj = reload_clip (vòng tụ lực trên đầu); vị trí trên đầu [ƯỚC LƯỢNG]
    if (ro) w.chargeFx = vfx(G, ro, p.x, p.y, { follow: p, state: 'reloading', dur: 60, layer: 'top' });
  }
  function stopChargeFx(w) { if (w.chargeFx) { w.chargeFx.kill(); w.chargeFx = null; } }

  // Gọi mỗi bước cho vũ khí đang cầm (và tay trái khi Song Thủ). want = đang giữ nút bắn.
  function runWeapon(G, p, w, side, want, dt) {
    if (!w) return;
    w.side = side;
    if (w.q.length) {
      for (const q of w.q) q.t -= dt;
      const due = w.q.filter(q => q.t <= 0);
      if (due.length) { w.q = w.q.filter(q => q.t > 0); for (const q of due) q.fn(); }
    }
    const d = w.def, e = d.w86;
    if (!e || !e.SM) { legacyRun(G, p, w, side, want); return; }
    const SM = e.SM, cost = d.cost || 0, chargeFam = e.fam === 'bow' || e.fam === 'charge';
    const evFire = !!(e.fire && e.fire.n3s);
    let held = want;
    if (want && !chargeFam && p.energy < cost) { held = false; if (!(G.toastT > 0)) G.toast('Hết năng lượng!'); }
    if (want && chargeFam && !w.charging && p.energy < cost) { held = false; if (!(G.toastT > 0)) G.toast('Hết năng lượng!'); }
    if (w.st == null || !SM.st[w.st]) { w.st = SM.def; w.t = 0; }
    let release = false;
    if (chargeFam) {
      if (held) {
        if (!w.charging) {
          w.charging = true; w.hold = 0; startChargeFx(G, p, w);
          const ch = e.x.clip_hold || e.x.clipHold;   // [ĐO Gun005.clip_hold = fx_bow_draw]
          if (ch) snd(ch, { ev: 'chargeStart', poly: 1, gap: 0.1, vol: 0.6 });
        }
        w.hold += dt * (p.rateMul || 1);
        // [ĐO] clip 'reloading' của reload_clip dài 1 s; tua theo tỉ lệ tụ lực (max_time) [ƯỚC LƯỢNG: ReloadClip đặt tốc Animator]
        if (w.chargeFx) w.chargeFx.t = Math.min(0.999, w.hold / (d.charge || 1));
      }
      else if (w.charging) { w.charging = false; stopChargeFx(w); release = true; }
    }
    // Lớp tự viết có logic theo bấm/giữ/nhả (AttackKeyDown/AttackStop gốc): CUSTOM_HOLD[cls] = {down, hold, up}
    const ch = CUSTOM_HOLD[e.cls];
    if (ch) {
      if (held && !w._chHeld && ch.down) ch.down(G, p, w);
      else if (!held && w._chHeld && ch.up) ch.up(G, p, w);
      w._chHeld = held;
      if (held && ch.hold) ch.hold(G, p, w, dt);
    }
    let rem = dt * (e.ws || 1) * (p.rateMul || 1), guard = 0;
    const onEv = fn => { if (!chargeFam || evFire) fireEvent(G, p, w, side, fn); };
    while (guard++ < 12) {
      const s = SM.st[w.st];
      const tr = held ? s.h : s.r;
      if (tr && tr.x == null) { w.st = tr.to; w.t = 0; continue; }
      const tEnd = tr ? exitAt(s, w.t, tr.x) : Infinity;
      const step = Math.min(rem, Math.max(0, tEnd - w.t));
      if (step > 0 && s.ev.length) evWindow(s, w.t, w.t + step, onEv);
      w.t += step; rem -= step;
      if (tr && w.t >= tEnd - 1e-9) { w.st = tr.to; w.t = 0; if (rem > 1e-9) continue; }
      break;
    }
    // Súng không có sự kiện Attack nào (logic nằm trong mã IL2CPP): bắn theo tốc wiki khi giữ nút [ƯỚC LƯỢNG]
    if (!evFire && !chargeFam) {
      if (e.fam === 'laser') {
        // Tia liên tục khi giữ (Gun003/RGLaser): trúng mỗi 0,1 s, trừ năng lượng mỗi 0,5 s [ƯỚC LƯỢNG: nhịp nằm trong mã]
        if (!held && w.beamH) { w.beamH.stop(); w.beamH = null; }
        w.beamKeep = true;
        if (held && w.cd <= 0) {
          w.cost = (w.cost || 0) - 0.1;
          const pay = w.cost <= 0;
          if (!pay || p.energy >= cost) {
            if (pay) { p.energy -= cost; w.cost = 0.5; }
            fireEvent(G, p, w, side, 'Attack', 1);
          }
          w.cd = 0.1 / (p.rateMul || 1);
        }
      } else if (held && w.cd <= 0) { fireEvent(G, p, w, side, 'Attack'); w.cd = 1 / Math.max(0.2, (d.rps || 2) * (p.rateMul || 1)); }
    }
    if (release && p.energy >= cost) {
      const mx = d.charge || 1, k = Math.min(1, w.hold / mx);
      // Vũ khí vừa chém thường vừa tụ lực (rìu...): nhả khi chưa đầy thì thôi [ƯỚC LƯỢNG]
      if (!evFire || k >= 1) { p.energy -= cost; fireEvent(G, p, w, side, 'Release', k); }
      w.hold = 0;
    }
  }
  // Vũ khí không có dữ liệu 8.6 (kỹ năng tự tạo: vuốt sói...): hồi chiêu theo rps như trước.
  function legacyRun(G, p, w, side, want) {
    if (!want || w.cd > 0) return;
    const d = w.def;
    if (p.energy < (d.cost || 0)) { w.cd = 0.35; if (!(G.toastT > 0)) G.toast('Hết năng lượng!'); return; }
    p.energy -= d.cost || 0;
    w.cd = 1 / ((d.rps || 2) * (p.rateMul || 1));
    w.kick = d.kind === 'melee' ? 0 : 2;
    const [hx, hy] = handPos(p, side);
    const f = SK.frame(d.sprite);
    const tip = d.kind === 'melee' ? [hx, hy] : gunTip(hx, hy, p.aim, [f ? f[3] - f[5] : 10, 0]);
    (SK.WEAPON_KINDS[d.kind] || SK.WEAPON_KINDS.gun).fire(G, p, w, { x: tip[0], y: tip[1], ang: p.aim, side, charge: 1 });
    SK.emit('fire', G, p, w);
  }
  // moveMod [ĐO atk_move_speed]: nhân tốc chạy (1 + moveMod) khi giữ nút. Nhân vào p.moveMul và chỉ gỡ phần mình đã nhân,
  // để kỹ năng khác đang đặt p.moveMul không bị đè.
  function holdMove(G, p, d) {
    const cur = p.moveMul == null ? 1 : p.moveMul;
    const base = p._wMoveSet != null && cur === p._wMoveSet ? cur / (p._wMove || 1) : cur;
    const f = 1 + (d.moveMod || 0);
    p._wMove = f; p.moveMul = base * f; p._wMoveSet = p.moveMul; p._wHeldAt = G.t;
  }
  function releaseMove(p) {
    if (p._wMoveSet == null) return;
    if (p.moveMul === p._wMoveSet) p.moveMul = Math.round(p.moveMul / (p._wMove || 1) * 1e6) / 1e6;
    p._wMove = 1; p._wMoveSet = null;
  }

  SK.updatePlayer = function (G, dt) {
    const p = G.player, I = SK.input;
    p.t += dt;
    SK.smStep(p.sm, dt, fn => SK.emit('animEvent', G, p, fn));
    if (p.st === 'dead') { p.stT += dt; return; }
    p.invulT = Math.max(0, p.invulT - dt); p.flash = Math.max(0, p.flash - dt);
    p.skillCd = Math.max(0, p.skillCd - dt);
    if (SK.factorsTick) SK.factorsTick(G, p, dt);
    for (const w of p.weapons) if (w) { w.cd -= dt; w.kick = Math.max(0, w.kick - dt * 20); w.swing = Math.max(0, (w.swing || 0) - dt); }
    { const w = p.weapons[p.cur], ws = w && w.def.w86 && WEAPON_SPECIALS[w.def.w86.cls]; if (ws && ws.update) ws.update(G, p, w, dt); }
    if (p.dual) { p.dual.cd -= dt; p.dual.kick = Math.max(0, p.dual.kick - dt * 20); p.dual.swing = Math.max(0, (p.dual.swing || 0) - dt); }

    // giáp hồi sau một quãng không trúng đòn
    p.armorT -= dt;
    // armorNoRegen (Vỏ Cứng Bảo Vệ): giáp không hồi khi đang đánh nhau (phòng khoá).
    if (p.armorT <= 0 && p.armor < p.armorMax && !(MODS().armorNoRegen && G.room && G.room.state === 'locked')) {
      p.armorTick -= dt;
      if (p.armorTick <= 0) { p.armor++; p.armorTick = R.armorTick; }
    }

    const mv = G.phase === 'portal' ? { x: 0, y: 0 } : I.moveVec();
    p.moving = Math.abs(mv.x) + Math.abs(mv.y) > 0.05;
    const pad = W.obstacleAt(G.map, p.x, p.y - 2);
    p.speedMul = pad && pad.kind === 'pad' ? (pad.p.speed_down ? 1 - pad.p.speed_rate : 1 + pad.p.speed_rate) : 1;
    const spd = p.h.speed * U * p.speedMul * (p.moveMul || 1) * (MODS().moveMul || 1) * (p.mount ? 1 + p.mount.speedRate : 1);
    if (p.lunge) stepPush(G, p, dt);   // đang lao người (forceLerp = 1: phím chạy bị bỏ qua) [ĐO RGController.SetVelocity]
    else if (!(p.weapons[p.cur] && p.weapons[p.cur].dash)) SK.moveBox(G.map, p, mv.x * spd * dt, mv.y * spd * dt, p.h.body.r);
    if (p.moving && Math.random() < dt * 8) SK.fx(G, 'dust', p.x - p.face * 4, p.y, { dur: 0.2 });

    p.target = pickTarget(G, p);
    if (p.target) {
      const e = p.target, [hx, hy] = handPos(p, 1);
      p.aim = Math.atan2(e.y - e.hb.off[1] * e.scale - hy, e.x - hx);
      p.face = Math.cos(p.aim) >= 0 ? 1 : -1;
    } else if (p.moving) {
      p.aim = Math.atan2(mv.y, mv.x);
      if (Math.abs(mv.x) > 0.1) p.face = mv.x > 0 ? 1 : -1;
    }

    const w = p.weapons[p.cur];
    // p.noFire: kỹ năng đang khoá vũ khí (chui đất, gọi tàu, hoá thân...).
    const want = G.phase !== 'portal' && !p.noFire && I.down('attack') && !(I.touchMode && G.interactTarget && I.btn.attack);
    if (w && want && !p._wantPrev && w.def.w86 && w.def.w86.cls === 'Katana') {
      // Katana.AttackKeyDown: bấm lại trong 0,25 s sau nhát trước thì nối combo (_attackIndex + 1, tối đa 2), không thì 0 [ĐO]
      const th = w.def.w86.x.nextStateThreshold || 0.25;
      w.katIdx = w.katT != null && G.t - w.katT < th && (w.katIdx || 0) < 2 ? (w.katIdx || 0) + 1 : 0;
    }
    p._wantPrev = want;
    runWeapon(G, p, w, 1, want, dt);
    if (p.dual) runWeapon(G, p, p.dual, 2, want && p.skillT > 0, dt);
    if (want && w) holdMove(G, p, w.def); else releaseMove(p);
    if (G.phase === 'portal') return;
    if (p.skillT > 0) { p.skillT -= dt; const sd = skillDef(p); if (sd.update) sd.update(G, p, dt); if (p.skillT <= 0) SK.endSkill(G, p); }
    // Đang cưỡi thú: không dùng được kỹ năng nhân vật [WIKI Mounts]; nút bị bỏ qua.
    if (I.hit('skill') && !p.mount) {
      // Kỹ năng nhiều giai đoạn (bấm lần nữa khi đang chạy: xuống thú, kích nổ...) khai báo press(G, p).
      const sd = skillDef(p);
      if (p.skillT > 0) { if (sd.press) { const n = p._skEnds; sd.press(G, p); if (p.skillT <= 0 && p._skEnds === n) SK.endSkill(G, p); } }
      else if (p.skillCd <= 0) startSkill(G, p);
      else if (sd.pressCd) sd.pressCd(G, p);
    }
    // Nút đặc biệt (btn_special gốc): chiêu phụ của kỹ năng, khai báo special(G, p).
    if (I.hit('special')) { const sd = skillDef(p); if (sd.special) sd.special(G, p); }
    // Kỹ năng không có chiêu phụ: nút đặc biệt về vũ khí tay trước, gửi cả lúc bấm và lúc nhả [ĐO RGController.SpecialClick,
    // TriggerSpecialWeapon -> weaponSpecial.WeaponSpecial(isDown)]. Theo dõi I.down vì I.hit ở dòng trên đã tiêu cạnh bấm.
    const spDown = !!I.down('special');
    if (spDown !== !!p._spPrev && !skillDef(p).special) { const sw = SK.weaponSpecial(p); if (sw) sw.ws.press(G, p, sw.w, spDown); }
    p._spPrev = spDown;
    if (I.hit('swap') && p.weapons[1 - p.cur]) {
      const old = p.weapons[p.cur];
      if (old) { old.charging = false; old.hold = 0; stopChargeFx(old); old.st = null; old.q = []; }
      p.cur = 1 - p.cur;
      p.weapons[p.cur].st = null;
      weaponAudio(p.weapons[p.cur]);
      const A = AU();
      if (A && A.events.weaponSwitch) snd(A.events.weaponSwitch, { ev: 'weaponSwitch', poly: 1, gap: 0.1, vol: 0.7 });   // [ĐO events: fx_gun_draw]
      if (p.skillT > 0 && skillDef(p).endOnSwap) SK.endSkill(G, p);
      G.toast(p.weapons[p.cur].def.name);
    }
    const wantInteract = I.hit('interact') || (I.touchMode && I.hit('attack') && G.interactTarget);
    if (wantInteract && G.interactTarget) G.interactTarget.use(G);
    else if (wantInteract && p.mount && SK.mountDismount) SK.mountDismount(G, p);   // đang cưỡi, không có gì để tương tác: xuống thú
  };

  // Bảng kỹ năng theo p.h.skill.id. start() đặt p.skillT > 0 nếu kỹ năng kéo dài; không thì hồi chiêu ngay.
  SK.SKILLS = {
    dual_wield: {
      endOnSwap: true,
      start(G, p) {
        p.skillT = p.h.skill.dur;
        p.dual = SK.makeWeapon(p.weapons[p.cur].id); p.dual.cd = 0.06;
        SK.fx(G, 'ring', p.x, p.y - 8, { dur: 0.35, color: '#7fd3ff' });
      },
      end(G, p) { p.dual = null; }
    }
  };
  SK.skillDef = p => skillDef(p);
  function skillDef(p) {
    const id = p.h.skill && p.h.skill.id;
    if (SK.SKILLS[id]) return SK.SKILLS[id];
    SK.warnOnce('skill' + id, 'skill ' + id + ' not implemented, using dual_wield');
    return SK.SKILLS.dual_wield;
  }
  function startSkill(G, p) {
    skillDef(p).start(G, p);
    if (!(p.skillT > 0)) p.skillCd = p.h.skill.cd * (MODS().skillCdMul || 1);
    SK.emit('skill', G, p);
  }
  SK.endSkill = function (G, p) {
    const sd = skillDef(p);
    p.skillT = 0;
    p._skEnds = (p._skEnds || 0) + 1;
    if (sd.end) sd.end(G, p);
    p.skillCd = p.h.skill.cd * (MODS().skillCdMul || 1);
  };

  SK.hurtPlayer = function (G, dmg) {
    const p = G.player;
    if (p.st === 'dead' || p.invulT > 0 || dmg <= 0) return false;
    if (G.badass) dmg += DS.badass.dmgAdd;
    if (p.onHurt) { dmg = p.onHurt(G, p, dmg); if (!(dmg > 0)) return false; }
    p.armorT = R.armorDelay; p.armorTick = R.armorTick;
    const a = Math.min(p.armor, dmg);
    p.armor -= a; dmg -= a;
    p.hp -= dmg;
    if (p.god && p.hp < 1) p.hp = 1;
    p.invulT = R.hurtInvuln; p.flash = 0.1;
    SK.smTrig(p.sm, 'hit');
    G.shake = Math.max(G.shake, 3); G.hurtT = 0.35;
    SK.num(G, p.x, p.y - 26, a + dmg, a && !dmg ? '#c9d2df' : '#ff4a4a');
    SK.emit('playerHurt', G, p, a + dmg);
    if (p.hp <= 0) { p.hp = 0; p.st = 'dead'; p.stT = 0; if (p.skillT > 0) SK.endSkill(G, p); G.onPlayerDead(); }
    return true;
  };

  SK.drawPlayer = function (ctx, G) {
    const p = G.player;
    if (p.invulT > 0 && p.st !== 'dead' && Math.floor(p.invulT * 14) % 2 === 0) return;
    const key = p.st === 'dead' ? p.anims.dead : p.moving ? p.anims.run : p.anims.idle;
    const at = p.st === 'dead' ? p.stT : p.t;
    const fr = SK.animFrame(key, at);
    const pages = p.flash > 0 ? SK.pagesWhite : null;
    const alpha = G.phase === 'portal' ? Math.max(0, 1 - G.phaseT / 0.6) : 1;
    ctx.save(); ctx.globalAlpha = alpha;
    if (p.sizeMul && p.sizeMul !== 1) { ctx.translate(p.x, p.y); ctx.scale(p.sizeMul, p.sizeMul); ctx.translate(-p.x, -p.y); }   // Biến To / Biến Nhỏ
    const w = p.weapons[p.cur];
    // Clip skin_<n>_idle/run/dead gốc: nhún nút img (thân + tay cầm súng) khi chạy, nảy khi chết.
    const fs = p.face < 0 ? -1 : 1;
    const xf = SK.animPose(key, at, p.anims.bodyPath), hf = SK.animPose(key, at, p.anims.handPath);
    const hoff = [hf.dx * fs, hf.dy];
    if (!fr || !SK.draw(ctx, fr, p.x + xf.dx * fs, p.y + xf.dy, { flip: p.face < 0, pages, sx: xf.sx, sy: xf.sy, rot: xf.rot * fs })) {
      ctx.fillStyle = '#9aa4b5'; ctx.fillRect(p.x - 6, p.y - 16, 12, 16);
    }
    if (p.st !== 'dead' && w && !p.hideHeld) drawHeld(ctx, p, w, 1, hoff);
    // Súng thứ hai (Song Thủ) ở tay h2 trước mặt, vẽ SAU thân và súng chính nên nằm trên cùng [ĐO hero.ab img/h2 x > 0].
    if (p.st !== 'dead' && p.dual) drawHeld(ctx, p, p.dual, 2, hoff);
    ctx.restore();
  };
  function drawHeld(ctx, p, w, side, off) {
    let [hx, hy] = handPos(p, side);
    if (off) { hx += off[0]; hy += off[1]; }
    if (w.def.w86) { drawRig(ctx, w, hx, hy, p.aim); return; }
    let ang = p.aim;
    if (w.def.kind === 'melee') ang += (w.swing > 0 ? (1 - w.swing / 0.16) * 2.2 - 1.1 : -0.6) * (Math.cos(p.aim) < 0 ? -1 : 1);
    SK.drawGun(ctx, w.def.sprite, hx, hy, ang, null, { kick: w.kick });
  }

  // ---------------------------------------------------------------- quái
  function resolveAnims(d) {
    const out = {};
    for (const [k, v] of Object.entries(d.anims || {})) {
      if (k.startsWith('L2.')) continue;
      if (!out.idle && /(^|_)(ide|idle)$/.test(k)) out.idle = v;
      else if (!out.run && /(^|_)run$/.test(k)) out.run = v;
      else if (!out.dead && /dead$/.test(k)) out.dead = v;
      else if (!out.atk && /atk/.test(k)) out.atk = v;
    }
    out.idle = out.idle || out.run || out.atk;
    out.run = out.run || out.idle;
    return out;
  }

  // Lớp AI Unity lạ nhưng biết mượn hành vi của lớp nào.
  const AI_ALIAS = {
    EliteArcher: 'EnemyAI03', EnemyFireSacrifice: 'EnemyAI01', EnemyAIWitch: 'EnemyAI04',
    EnemyAISwampRider: 'EnemyAI04', EnemyAI15: 'EnemyAI02', EnemyAI09: 'EnemyAI04', EnemyAI06: 'EnemyAIStatic'
  };
  function resolveAI(cls) {
    if (SK.AI[cls]) return cls;
    if (AI_ALIAS[cls]) return AI_ALIAS[cls];
    SK.warnOnce('ai' + cls, 'AI class ' + cls + ' not implemented, using EnemyAI01');
    return 'EnemyAI01';
  }

  // Quái không có trong SK_DATA.enemies (trùm...) đăng ký nhà máy riêng ở đây.
  SK.CUSTOM_ENEMIES = {};
  SK.makeEnemy = function (G, id, x, y, room) {
    const e = makeEnemy0(G, id, x, y, room);
    return SK.factorsEnemy ? SK.factorsEnemy(G, e) : e;   // máu / tốc độ theo G.mods (enemyHpMul, enemySpeedMul)
  };
  function makeEnemy0(G, id, x, y, room) {
    if (SK.CUSTOM_ENEMIES[id]) return SK.CUSTOM_ENEMIES[id](G, x, y, room);
    const d = D.enemies[id];
    const ai = (d.ai && d.ai[0]) || { cls: 'EnemyAI01', p: {} };
    const elite = id.startsWith('ex_');
    const col = d.col || {};
    const e = {
      id, d, p: ai.p || {}, cls: resolveAI(ai.cls), rawCls: ai.cls, x, y, kx: 0, ky: 0,
      hp: d.hp, hpMax: d.hp, face: SK.chance(0.5) ? 1 : -1, aim: 0, st: 'spawn', stT: 0.7, t: SK.rand() * 2,
      cd: SK.randf(0.6, 1.4) * ((ai.p && ai.p.shoot_cd) || 2), room, elite, flash: 0,
      w: (d.weapons && d.weapons[0]) || null, anims: resolveAnims(d), pose: d.pose ? resolveAnims(d.pose) : null,
      r: Math.max(3, Math.min(8, col.circle ? col.circle.r * 0.8 : 5)),
      hb: col.hurt_box || { size: [12, 16], off: [0, 8] }, scale: elite ? R.eliteScale : 1, burst: 0
    };
    // Animator gốc (layer 1 char_hit, layer 2 dấu "!"/hồn ma ở nút dead_tap) và Animator của súng (w_ide, fire, w_bow*,
    // w_sword*...), chạy theo đồ thị controller thật (SK_DATA.ctrl) bằng SK.smStep.
    e.sm = SK.smNew(d.ctrl, d.anims);
    e.wsm = e.w && e.w.ctrl ? SK.smNew(e.w.ctrl, e.w.anims) : null;
    SK.fx(G, 'spawn', x, y, { dur: 0.7 });
    return e;
  }

  function enemyDmg(atk) { return Math.max(1, Math.round((atk || 1) * R.enemyAtkScale)); }
  function walkSpeed(e) { return (e.d.speed || 3) * U * R.enemyMoveScale * (e.moveMul || 1); }
  function seesPlayer(G, e, range) {
    const p = G.player; if (p.st === 'dead' || p.hidden) return false;
    const rng = range || ((e.p.findTargetRange || 20) * U * 0.6);
    return Math.hypot(p.x - e.x, p.y - e.y) < rng && W.los(G.map, e.x, e.y - 6, p.x, p.y - 6);
  }
  function faceTo(e, x) { if (Math.abs(x - e.x) > 1) e.face = x > e.x ? 1 : -1; }
  function aimAtPlayer(G, e) {
    const p = G.player, [hx, hy] = eHand(e);
    e.aim = Math.atan2(p.y - 7 - hy, p.x - hx);
    faceTo(e, p.x);
  }
  function eHand(e) {
    const at = (e.w && e.w.at) || (e.d.hands && e.d.hands[0]) || [0, 6];
    return [e.x + at[0] * e.face * e.scale, e.y - at[1] * e.scale];
  }
  function wanderPoint(G, e, near) {
    const r = e.room, map = G.map;
    for (let k = 0; k < 12; k++) {
      const a = SK.rand() * Math.PI * 2, d = SK.randf(16, near || 64);
      const x = e.x + Math.cos(a) * d, y = e.y + Math.sin(a) * d;
      const tx = Math.floor(x / T), ty = Math.floor(y / T);
      if (r && (tx < r.x0 || tx > r.x1 || ty < r.y0 || ty > r.y1)) continue;
      if (!W.solidAt(map, x, y)) return [x, y];
    }
    return [e.x, e.y];
  }
  function moveTo(G, e, tx, ty, spd, dt) {
    const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
    if (d < 2) return { arrived: true, hit: false };
    const s = Math.min(d, spd * dt);
    faceTo(e, tx);
    return { arrived: false, hit: SK.moveBox(G.map, e, dx / d * s, dy / d * s, e.r) };
  }
  function startAim(G, e, t) {
    e.st = 'aim'; e.stT = t || R.telegraph; aimAtPlayer(G, e);
    // Trigger "atk" của Animator gốc -> state L2.char_dizzy (clip char_atk: dấu "!" đỏ ở nút dead_tap 0,875 s).
    // [ƯỚC LƯỢNG] Unity bật nó trong RGEController.Scout() (lúc phát hiện mục tiêu); ở đây: lần giao chiến đầu tiên,
    // bỏ qua quái có need_tap = 0.
    if (!e.alerted && e.p.need_tap !== 0) { e.alerted = true; SK.smTrig(e.sm, 'atk'); }
  }

  // Bước chung "đi dạo": idle ↔ move. Trả true nếu đang dạo (có thể bị ngắt để tấn công).
  function wander(G, e, dt) {
    if (e.st === 'idle') {
      e.stT -= dt;
      if (e.stT <= 0) { [e.tx, e.ty] = wanderPoint(G, e); e.st = 'move'; e.stT = SK.randf(0.8, 1.6); }
      return true;
    }
    if (e.st === 'move') {
      e.stT -= dt;
      const m = moveTo(G, e, e.tx, e.ty, walkSpeed(e), dt);
      if (m.arrived || m.hit || e.stT <= 0) { e.st = 'idle'; e.stT = SK.randf(0.3, 1.0); }
      return true;
    }
    return false;
  }

  function fireOrLunge(G, e) {
    if (e.w) { enemyFire(G, e); e.burst = e.elite ? R.eliteBurst - 1 : 0; e.burstT = 0.13; e.st = 'attack'; e.stT = 0.3; }
    else { e.st = 'charge'; e.stT = 0.35; e.dir = e.aim; e.hitOnce = false; e.chargeSpd = walkSpeed(e) * 3; }
  }
  function tickAttack(G, e, dt) {
    if (e.burst > 0) {
      e.burstT -= dt;
      if (e.burstT <= 0) { aimAtPlayer(G, e); enemyFire(G, e); e.burst--; e.burstT = 0.13; e.stT = 0.3; }
      return;
    }
    e.stT -= dt;
    if (e.stT <= 0) { e.st = 'idle'; e.stT = SK.randf(0.2, 0.6); }
  }
  function tickCharge(G, e, dt) {
    e.stT -= dt;
    const s = e.chargeSpd * dt;
    const hit = SK.moveBox(G.map, e, Math.cos(e.dir) * s, Math.sin(e.dir) * s, e.r);
    faceTo(e, e.x + Math.cos(e.dir));
    const p = G.player;
    if (!e.hitOnce && Math.hypot(p.x - e.x, p.y - e.y) < e.r + 8) {
      e.hitOnce = true;
      SK.hurtPlayer(G, enemyDmg(e.p.damage || 2), e.x, e.y);
    }
    if (hit || e.stT <= 0) { e.st = 'stun'; e.stT = hit ? 0.7 : 0.35; if (hit) G.shake = Math.max(G.shake, 1.5); }
  }

  // Bảng AI theo tên lớp Unity trong ai[0].cls.
  SK.AI = {
    // Đi dạo, đến lượt thì đứng khựng ngắm rồi bắn (shoot_cd, attackProbability /10).
    EnemyAI01(G, e, dt) {
      if (e.st === 'aim') { e.stT -= dt; aimAtPlayer(G, e); if (e.stT <= 0) fireOrLunge(G, e); return; }
      if (e.st === 'attack') return tickAttack(G, e, dt);
      if (e.st === 'charge') return tickCharge(G, e, dt);
      if (e.st === 'stun') { e.stT -= dt; if (e.stT <= 0) e.st = 'idle'; return; }
      wander(G, e, dt);
      e.cd -= dt;
      if (e.cd <= 0) {
        e.cd = (e.p.shoot_cd || 2) * SK.randf(0.75, 1.2);
        if (seesPlayer(G, e) && SK.rand() * 10 < (e.p.attackProbability != null ? e.p.attackProbability : 7)) startAim(G, e);
      }
    },
    // Lao vào cận chiến: kiếm chém (ESword01) hay giáo đâm (EGun010).
    EnemyAI02(G, e, dt) {
      const p = G.player;
      if (e.st === 'aim') { e.stT -= dt; aimAtPlayer(G, e); if (e.stT <= 0) { enemyFire(G, e); e.st = 'attack'; e.stT = 0.35; } return; }
      if (e.st === 'attack') return tickAttack(G, e, dt);
      if (e.st === 'charge') return tickCharge(G, e, dt);
      if (e.st === 'stun') { e.stT -= dt; if (e.stT <= 0) e.st = 'idle'; return; }
      e.cd -= dt;
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (seesPlayer(G, e)) {
        const reach = (e.p.atk_range || 2.5) * U;
        if (d < reach && e.cd <= 0) { e.cd = e.p.shoot_cd || 1; startAim(G, e, (e.p.atkDelay || 1) * 0.35); return; }
        if (d > reach * 0.6) { e.st = 'move'; moveTo(G, e, p.x, p.y, (e.d.speed || 4) * U * 0.9 * (e.moveMul || 1), dt); }
        else e.st = 'idle';
        return;
      }
      wander(G, e, dt);
    },
    // Giữ khoảng cách rồi bắn cung (EGun004) / cung tinh anh có vạch ngắm.
    EnemyAI03(G, e, dt) {
      const p = G.player;
      if (e.st === 'aim') {
        e.stT -= dt;
        if (e.p.lock_in_shooting !== 0) aimAtPlayer(G, e);
        if (!e.p.stand_in_shooting) moveTo(G, e, e.tx || e.x, e.ty || e.y, walkSpeed(e) * 0.5, dt);
        if (e.stT <= 0) fireOrLunge(G, e);
        return;
      }
      if (e.st === 'attack') return tickAttack(G, e, dt);
      if (e.st === 'stun') { e.stT -= dt; if (e.stT <= 0) e.st = 'idle'; return; }
      e.cd -= dt;
      const d = Math.hypot(p.x - e.x, p.y - e.y), want = 6 * T;
      if (e.st === 'idle' || e.st === 'move') {
        e.stT -= dt;
        if (e.stT <= 0 || e.st === 'idle') {
          const a = Math.atan2(e.y - p.y, e.x - p.x) + SK.randf(-0.9, 0.9);
          const dist = d < want ? SK.randf(24, 48) : -SK.randf(16, 40);
          e.tx = e.x + Math.cos(a) * dist; e.ty = e.y + Math.sin(a) * dist;
          if (W.solidAt(G.map, e.tx, e.ty)) [e.tx, e.ty] = wanderPoint(G, e);
          e.st = 'move'; e.stT = SK.randf(0.6, 1.2);
        }
        const m = moveTo(G, e, e.tx, e.ty, walkSpeed(e), dt);
        if (m.arrived || m.hit) { e.st = 'idle'; e.stT = SK.randf(0.2, 0.5); }
      }
      if (e.cd <= 0) {
        e.cd = (e.p.shoot_cd || 3) * SK.randf(0.8, 1.2);
        const aimT = e.w && e.w.p && e.w.p.aimTime ? e.w.p.aimTime + 0.3 : R.telegraph + 0.15;
        if (seesPlayer(G, e)) startAim(G, e, aimT);
      }
    },
    // Heo rừng: đi dạo, gồng lên rồi húc thẳng; đâm tường thì choáng.
    EnemyAI04(G, e, dt) {
      if (e.st === 'aim') {
        e.stT -= dt; aimAtPlayer(G, e);
        if (e.stT <= 0) { e.st = 'charge'; e.stT = 1.3; e.dir = e.aim; e.hitOnce = false; e.chargeSpd = (e.p.sprintForce || 9) * U; }
        return;
      }
      if (e.st === 'charge') return tickCharge(G, e, dt);
      if (e.st === 'stun') { e.stT -= dt; if (e.stT <= 0) { e.st = 'idle'; e.stT = 0.4; } return; }
      wander(G, e, dt);
      e.cd -= dt;
      if (e.cd <= 0) { e.cd = (e.p.shoot_cd || 2) * SK.randf(0.8, 1.3); if (seesPlayer(G, e)) startAim(G, e, 0.5); }
    },
    // Đứng yên một chỗ (cây chậu, xương rồng): ngắm rồi bắn.
    EnemyAIStatic(G, e, dt) {
      if (e.st === 'aim') { e.stT -= dt; aimAtPlayer(G, e); if (e.stT <= 0) { if (e.w) enemyFire(G, e); e.st = 'attack'; e.stT = 0.4; e.burst = 0; } return; }
      if (e.st === 'attack') return tickAttack(G, e, dt);
      if (e.st !== 'idle') e.st = 'idle';
      e.cd -= dt;
      if (e.cd <= 0) { e.cd = (e.p.shoot_cd || 2) * SK.randf(0.85, 1.15); if (seesPlayer(G, e)) startAim(G, e); }
    },
    // Tổ quái: đứng yên, định kỳ gọi thêm quái rẻ nhất của theme (tối đa 3 con cùng lúc).
    EnemyAISummon(G, e, dt) {
      e.st = e.st === 'spawn' ? e.st : 'idle';
      e.cd -= dt;
      if (e.cd > 0) return;
      e.cd = (e.p.shoot_cd || 4) * SK.randf(0.9, 1.3);
      const kids = G.enemies.filter(k => k.parent === e && k.st !== 'dead').length;
      if (kids >= 3) return;
      const th = G.map.th;
      const cheap = th.enemies.filter(id => D.enemies[id] && D.enemies[id].ai[0] && D.enemies[id].ai[0].cls !== 'EnemyAISummon' && (D.enemies[id].ai[0].p.consume || 1) <= 1);
      if (!cheap.length) return;
      const [x, y] = wanderPoint(G, e, 40);
      const k = SK.makeEnemy(G, SK.pick(cheap), x, y, e.room);
      k.parent = e; G.enemies.push(k);
    }
  };

  // ---------------------------------------------------------------- súng quái (bảng theo EGun*)
  function bulletSprite(w) {
    const b = w.bullet && D.bullets && D.bullets[w.bullet];
    return b && SK.frame(b.sprite) ? b.sprite : null;
  }
  // Đạn quái = prefab đạn thật của EGun (bay/nổ/tách theo MonoBehaviour, hình + tia trúng đích thật). [ĐO EGun*.bullet, bullet_speed, atk]
  function eShoot(G, e, x, y, ang, o) {
    const w = e.w, spdU = Math.min(R.enemyBulletMaxSpeed, (w.p.bullet_speed || 7) * (o && o.spdMul || 1) * (MODS().enemyBulletSpeedMul || 1));
    if (w.bullet && XB[w.bullet]) {
      return SK.spawnBullet86(G, 'e', w.bullet, x, y, ang, { spd: spdU, dmg: enemyDmg(w.p.atk), repel: w.p.repel || 0, h: Math.max(2, e.y - y), owner: e });
    }
    const spd = spdU * U;
    G.bullets.push({ side: 'e', kind: 'orb', x, y, h: Math.max(2, e.y - y), vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, ang,
      dmg: enemyDmg(w.p.atk), repel: w.p.repel || 0, r: 3, life: 5, sprite: bulletSprite(w) });
  }
  // Vũ khí cận chiến của quái (kiếm, giáo): prefab vệt chém/đâm thật bám theo quái, trúng theo hộp va chạm của prefab.
  function eMelee(G, e) {
    const w = e.w, [hx, hy] = eHand(e);
    if (w.bullet && XB[w.bullet]) SK.spawnBullet86(G, 'e', w.bullet, hx, hy, e.aim, { spd: 0, dmg: enemyDmg(w.p.atk), owner: e, h: Math.max(2, e.y - hy), flip: e.face < 0 && Math.cos(e.aim) > 0 });
    else slash(G, e, 18 + (w.p.bulletSize || 1) * 12);
  }
  function muzzleOf(e) {
    const [hx, hy] = eHand(e);
    const gp = (e.w && e.w.gunPoint) || [8, 0];
    return gunTip(hx, hy, e.aim, gp, e.scale);
  }
  function dev(w) { return SK.deg(SK.randf(-(w.p.deviation || 0), w.p.deviation || 0)); }
  function spread(G, e) {
    const w = e.w, n = w.p.count || 1, step = SK.deg(w.p.angle || 0);
    const [mx, my] = muzzleOf(e);
    for (let i = 0; i < n; i++) {
      const sc = w.p.speed_correction ? SK.randf(1 - 0.12 * w.p.speed_correction, 1) : 1;
      eShoot(G, e, mx, my, e.aim + (i - (n - 1) / 2) * step + dev(w), { spdMul: sc });
    }
    muzzleFx(G, e, mx, my);
  }
  // Lửa nòng quái: nút gun_point thật (sprite e.w.muzzle) -> hiệu ứng muzzle_<sprite> của SK_VFX.
  function muzzleFx(G, e, x, y) { if (e.w.muzzle && e.w.muzzle !== 'nothing') vfx(G, 'muzzle_' + e.w.muzzle, x, y, { ang: e.aim, flip: Math.cos(e.aim) < 0 }); }
  function slash(G, e, reachPx) {
    const p = G.player, [hx, hy] = eHand(e);
    const d = Math.hypot(p.x - hx, p.y - 7 - hy);
    const da = Math.abs(Math.atan2(Math.sin(Math.atan2(p.y - 7 - hy, p.x - hx) - e.aim), Math.cos(Math.atan2(p.y - 7 - hy, p.x - hx) - e.aim)));
    if (d < reachPx && da < 1.2) SK.hurtPlayer(G, enemyDmg(e.w.p.atk), e.x, e.y);
    e.swing = 0.18;
  }

  const EGUN = SK.EGUN = {
    EGun001(G, e) { const [mx, my] = muzzleOf(e); eShoot(G, e, mx, my, e.aim + dev(e.w)); muzzleFx(G, e, mx, my); },
    EGun002: spread,
    EGun009: spread,
    EGun004(G, e) {
      const w = e.w, n = w.p.count || 1, [mx, my] = muzzleOf(e);
      for (let i = 0; i < n; i++) eShoot(G, e, mx, my, e.aim + (i - (n - 1) / 2) * SK.deg(w.p.angle || 0) + dev(w));
    },
    EGunEliteArcher(G, e) { const [mx, my] = muzzleOf(e); eShoot(G, e, mx, my, e.aim + dev(e.w)); },
    EGunFireSacrifice(G, e) {
      const [mx, my] = muzzleOf(e);
      for (let i = 0; i < 8; i++) eShoot(G, e, mx, my, e.aim + i * Math.PI / 4);
    },
    // Giáo: lao người tới trước theo lực "force" [ĐO EGun010.force], mũi giáo là prefab đâm thật (spear_*).
    EGun010(G, e) {
      e.st = 'charge'; e.stT = 0.22; e.dir = e.aim; e.hitOnce = true;
      e.chargeSpd = (e.w.p.force || 10) * U * 1.1; e.thrust = 0.22;
      eMelee(G, e);
    },
    ESword01(G, e) { eMelee(G, e); e.swing = 0.18; }
  };
  function enemyFire(G, e) {
    const w = e.w; if (!w) return;
    let fn = EGUN[w.cls];
    if (!fn) {
      SK.warnOnce('egun' + w.cls, 'enemy gun ' + w.cls + ' not implemented, using ' + (w.p.count > 1 ? 'EGun002' : 'EGun001'));
      fn = w.p.count > 1 ? EGUN.EGun002 : EGUN.EGun001;
    }
    fn(G, e);
    e.kick = 2;
    // RGEWeapon.atkMode [ĐO w.p.atkMode]: 0 SetAttack(bool atk_b), 1 SetAttackTrigger (atk_t), 2 cả hai.
    if (e.wsm) {
      const m = w.p.atkMode || 0;
      if (m !== 0) SK.smTrig(e.wsm, 'atk_t');
      if (m !== 1) e.wAtk = 0.1;
    }
    SK.emit('enemyFire', G, e);
  }
  // Cung (EGun004/EGunEliteArcher có s_atk): SetAttack(true) lúc giương (e.st 'aim'), thả khi bắn. Súng/kiếm: atk_b bật
  // từ phát bắn tới hết trạng thái 'attack' (tối thiểu 0,1 s).
  function drivesWeapon(e, dt) {
    const w = e.w, sm = e.wsm;
    e.wAtk = Math.max(0, (e.wAtk || 0) - dt);
    const draw = !!(w.spr && w.spr.s_atk);
    SK.smSet(sm, 'atk_b',draw ? e.st === 'aim' : (e.st === 'attack' || e.wAtk > 0));
    SK.smStep(sm, dt);
  }

  SK.updateEnemy = function (G, e, dt) {
    e.t += dt;
    e.flash = Math.max(0, e.flash - dt);
    e.kick = Math.max(0, (e.kick || 0) - dt * 16);
    e.swing = Math.max(0, (e.swing || 0) - dt);
    e.thrust = Math.max(0, (e.thrust || 0) - dt);
    SK.smStep(e.sm, dt, fn => SK.emit('animEvent', G, e, fn));
    if (e.wsm && e.st !== 'dead') drivesWeapon(e, dt);
    if (e.st === 'dead') {
      e.stT += dt;
      if (Math.abs(e.kx) + Math.abs(e.ky) > 0.5) { SK.moveBox(G.map, e, e.kx * dt, e.ky * dt, e.r); const k = Math.exp(-dt * 7); e.kx *= k; e.ky *= k; }
      return;
    }
    if (e.st === 'spawn') { e.stT -= dt; if (e.stT <= 0) { e.st = 'idle'; e.stT = SK.randf(0.1, 0.5); } return; }
    if (Math.abs(e.kx) + Math.abs(e.ky) > 0.5) {
      SK.moveBox(G.map, e, e.kx * dt, e.ky * dt, e.r);
      const k = Math.exp(-dt * 12); e.kx *= k; e.ky *= k;
    }
    if (SK.factorsEnemyTick) SK.factorsEnemyTick(G, e, dt);
    SK.AI[e.cls](G, e, dt);
  };

  SK.hurtEnemy = function (G, e, dmg, crit, ang, repel) {
    if (!targetable(e)) return false;
    const df = MODS().enemyDef; if (df && dmg > 0) dmg = Math.max(1, dmg - df);   // Kẻ Địch Kiên Cuồng: phòng thủ +1
    e.hp -= dmg; e.flash = 0.08;
    SK.smTrig(e.sm, 'hit');   // L1.char_hit (clip gốc rỗng, chỉ có sự kiện HitBack ở 0,0667 s)
    if (!(e.p.kinematic)) { e.kx += Math.cos(ang) * repel * 30; e.ky += Math.sin(ang) * repel * 30; }
    // [ĐO] CommonConfig.normalDamageColor (0.925, 0, 0) / criticDamageColor (1, 0.929, 0) trong common.ab.
    SK.num(G, e.x, e.y - e.hb.off[1] * e.scale - e.hb.size[1] * 0.5 * e.scale - 4, dmg, crit ? '#ffed00' : '#ec0000', crit);
    SK.emit('enemyHit', G, e, dmg, crit);
    if (e.hp <= 0) killEnemy(G, e, ang);
    return true;
  };

  // Chết: xác văng theo hướng đòn cuối rồi trượt chậm dần (updateEnemy), nằm lại với anim dead thật.
  // [ƯỚC LƯỢNG] tốc văng 150 px/s; không có anim dead thì khói 'smoke' thật (common.ab).
  function killEnemy(G, e, ang) {
    e.st = 'dead'; e.stT = 0; e.hp = 0;
    SK.smTrig(e.sm, 'dead');   // L2.char_tap_dead: hồn ma ở nút dead_tap từ 0,625 s tới 2 s
    const k = e.p.kinematic ? 0 : 150;
    e.kx = Math.cos(ang || 0) * k; e.ky = Math.sin(ang || 0) * k;
    G.kills++;
    SK.emit('enemyKill', G, e);
    if (!e.anims.dead) vfx(G, 'smoke', e.x, e.y - 8, { state: 'smoke' });
    const rate = e.p.reward_rate != null ? e.p.reward_rate : 20, rv = e.p.reward_value || [0, 0, 1, 1];
    if (SK.rand() * 100 < rate) {
      // reward_value [?, ?, xu, năng lượng] — cách đọc [ƯỚC LƯỢNG]
      for (let i = 0; i < (rv[2] || 0); i++) SK.dropPickup(G, 'coin', e.x, e.y - 4);
      for (let i = 0; i < (rv[3] || 0); i++) SK.dropPickup(G, 'energy', e.x, e.y - 4);
    }
  }

  function stateAnim(e, an, dead) {
    return dead ? an.dead : (e.st === 'move' || e.st === 'charge') ? an.run : (e.st === 'aim' || e.st === 'attack') && an.atk ? an.atk : an.idle;
  }
  SK.drawEnemy = function (ctx, G, e) {
    if (e.draw) return e.draw(ctx, G, e);
    if (e.st === 'spawn') return;
    const dead = e.st === 'dead';
    if (dead && !e.anims.dead) return;
    const key = stateAnim(e, e.anims, dead);
    const at = dead ? e.stT : e.t;
    const fr = SK.animFrame(key, at) || e.d.body;
    const pages = e.flash > 0 ? SK.pagesWhite : e.elite ? SK.pagesElite : null;
    let x = e.x, y = e.y;
    if (e.st === 'aim' && (e.cls === 'EnemyAI04' || !e.w)) x += Math.sin(e.t * 60) * 1;
    const s = e.scale;
    const flip = e.face < 0, fs = flip ? -1 : 1;
    // Đường cong Transform của clip gốc lên nút thân (e.d.bodyPath, vd 'img/body' dưới Animator ở gốc prefab).
    // e.pose: Animator gốc chỉ động Transform còn khung ở Animator của thân (e_owl_metal) -> cộng cả hai.
    const xf = SK.animPose(key, at, e.d.bodyPath), pk = e.pose ? stateAnim(e, e.pose, dead) : key;
    if (e.pose) { const q = SK.animPose(pk, at, e.d.pose.body); xf.dx += q.dx; xf.dy += q.dy; xf.sx *= q.sx; xf.sy *= q.sy; xf.rot += q.rot; }
    if (!fr || !SK.draw(ctx, fr, x + xf.dx * s * fs, y + xf.dy * s, { flip, sx: s * xf.sx, sy: s * xf.sy, rot: xf.rot * fs, pages })) {
      ctx.fillStyle = e.elite ? '#b33' : '#7a3'; ctx.fillRect(x - 6, y - 14, 12, 14);
    }
    if (!dead && e.w && e.w.sprite && !weaponHidden(e, pk, at)) {
      let [hx, hy] = eHand(e);
      if (e.w.path) { const hf = SK.animPose(pk, at, e.w.path); hx += hf.dx * s * fs; hy += hf.dy * s; }
      let ang = e.w.p.need_lock === 0 && e.st !== 'aim' ? (e.face > 0 ? 0 : Math.PI) : e.aim;
      if (e.st !== 'aim' && e.st !== 'attack' && e.w.p.need_lock !== 0) ang = e.face > 0 ? 0.15 : Math.PI - 0.15;
      // Có Animator súng: tư thế nút 'w' lấy từ clip gốc của state hiện tại (giật, vung kiếm, đâm giáo, giương cung)
      // thay cho giật/vung/đâm vẽ tay. EGun004: SetAttack đổi sprite s_ide <-> s_atk.
      const wk = e.wsm && SK.smKey(e.wsm), wxf = wk ? SK.animXform(wk, e.wsm.L[0].t, 'w') : null;
      let spr = e.w.sprite;
      if (e.wsm && e.w.spr && e.w.spr.s_atk) spr = e.wsm.P.atk_b ? e.w.spr.s_atk : (e.w.spr.s_ide || spr);
      if (!e.wsm && e.swing > 0) ang += (1 - e.swing / 0.18) * 2.4 - 1.2;
      const push = !e.wsm && e.thrust > 0 ? Math.sin(e.thrust / 0.22 * Math.PI) * 8 : 0;
      SK.drawGun(ctx, spr, hx + Math.cos(ang) * push, hy + Math.sin(ang) * push, ang, e.w.spriteOff, { scale: s, kick: e.wsm ? 0 : e.kick, pages, xf: wxf });
    }
    if (e.d.nodes && e.sm) drawNodes(ctx, e, x, y, s, flip, pk, at);
    if (e.st === 'aim' && e.w && e.w.p && e.w.p.aimTime) drawAimLine(ctx, G, e);
  };
  // Clip layer 0 tắt nút tay/súng (tr[..].on = 0) -> không vẽ súng.
  function weaponHidden(e, key, t) {
    const parts = (e.w.path || '').split('/');
    for (let i = 1; i <= parts.length; i++) if (SK.animOn(key, t, parts.slice(0, i).join('/')) === 0) return true;
    return false;
  }
  // Nút phụ mà layer >= 1 của Animator gốc điều khiển (dead_tap): bật/tắt theo tr.on, khung theo anim có fp = nút,
  // chồng theo thứ tự layer như Unity (layer sau ghi đè).
  function drawNodes(ctx, e, x, y, s, flip, key0, t0) {
    const fs = flip ? -1 : 1;
    for (const [path, n] of Object.entries(e.d.nodes)) {
      let on = n.on, f = n.f;
      for (let li = 1; li < e.sm.L.length; li++) {
        const k = SK.smKey(e.sm, li); if (!k) continue;
        const lt = e.sm.L[li].t, v = SK.animOn(k, lt, path);
        if (v != null) on = v;
        const a = SK.anim(k);
        if (a && a.fp === path) { const af = SK.animFrame(k, lt); if (af) f = af; }
      }
      if (!on || !f) continue;
      const q = SK.animPose(key0, t0, path);
      SK.draw(ctx, f, x + (n.at[0] + q.dx) * s * fs, y + (-n.at[1] + q.dy) * s, { flip, sx: s * q.sx, sy: s * q.sy });
    }
  }
  function drawAimLine(ctx, G, e) {
    const [mx, my] = muzzleOf(e);
    let len = 0;
    while (len < 320 && !W.solidAt(G.map, mx + Math.cos(e.aim) * len, my + Math.sin(e.aim) * len + 6)) len += 4;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,40,40,' + (0.35 + 0.3 * Math.sin(e.t * 40)) + ')';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + Math.cos(e.aim) * len, my + Math.sin(e.aim) * len); ctx.stroke();
    ctx.restore();
  }
  SK.drawShadow = function (ctx, name, x, y, off, s) {
    const f = name && SK.frame(name);
    if (f) { SK.draw(ctx, name, x + (off ? off[0] : 0), y - (off ? off[1] : 0) + 1, { alpha: 0.45, sx: s || 1, sy: s || 1 }); return; }
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(x, y, 6 * (s || 1), 2.5, 0, 0, Math.PI * 2); ctx.fill();
  };

  // ---------------------------------------------------------------- đạn
  // Đạn 8.6 (b.v86 = tên prefab): bay, va chạm, nổ theo MonoBehaviour thật; hình = hiệu ứng SK.vfx bám theo (b.fxh).
  const MELEE_ACTIVE = 0.2; // giây đầu của vệt chém còn gây sát thương [ƯỚC LƯỢNG: collider tắt theo clip, runtime không đọc]
  function trigOf(b) { return b.B && b.B.tg ? b.B.m[b.B.tg] || {} : {}; }
  function stepB86(G, b, dt) {
    b.t += dt; b.life -= dt;   // life = giây còn lại (như đạn kiểu cũ, để mô-đun khác kéo dài được)
    if (b.life <= 0) { endB86(G, b, 'timeout'); return; }
    if (b.melee) { meleeB86(G, b); return; }
    if (b.orbit) { orbitB86(G, b); return; }
    if (b.area) { areaB86(G, b); return; }
    if (b.spin) b.ang += SK.deg(b.spin) * dt;
    const map = G.map;
    if (b.gz) {
      // BulletParabola [ĐO y_speed, gravity]: bay vòng cung, chạm đất thì vỡ.
      b.z += b.vz * dt; b.vz -= b.gz * dt;
      b.x += b.vx * dt; b.gy += b.vy * dt;
      if (b.h0 == null) b.h0 = b.h;
      b.h = b.h0 + Math.max(0, b.z); b.y = b.gy - b.h;
      if (W.solidAt(map, b.x, b.gy)) { endB86(G, b, 'wall'); return; }
      if (b.z <= 0 && b.vz < 0) { endB86(G, b, 'land'); return; }
      contact(G, b);   // RGBulletTrigger vẫn bật khi bay: trúng giữa đường thì dừng + nổ (stop_parent) [ĐO bullet_91]
      return;
    }
    if (!b.spin && (b.vx || b.vy)) b.ang = Math.atan2(b.vy, b.vx);   // mô-đun khác đổi vx/vy (phản đạn, nảy) thì hình quay theo
    const n = Math.max(1, Math.ceil(Math.hypot(b.vx, b.vy) * dt / 3));
    for (let k = 0; k < n && !b.dead; k++) {
      const nx = b.x + b.vx * dt / n, ny = b.y + b.vy * dt / n;
      if (W.solidAt(map, nx, ny + b.h)) {
        const ob = W.obstacleAt(map, nx, ny + b.h);
        if (ob && ob.kind === 'box' && !(b.boxes && b.boxes.has(ob))) { SK.hitObstacle(G, ob, b.side === 'p' ? b.dmg : 1); (b.boxes = b.boxes || new Set()).add(ob); }
        if (b.reb > 0 || b.bounce > 0) {
          // RGBTRebound.max_rebound_count [ĐO]: nảy khỏi tường, đổi trục nào chạm; b.bounce = số lần nảy do buff cấp
          if (b.reb > 0) b.reb--; else b.bounce--;
          const hx = W.solidAt(map, nx, b.y + b.h), hy = W.solidAt(map, b.x, ny + b.h);
          if (hx || !hy) b.vx = -b.vx;
          if (hy || !hx) b.vy = -b.vy;
          b.ang = Math.atan2(b.vy, b.vx);
          hitVfx(G, b.v86, b.x, b.y, b.ang, null);
          continue;
        }
        endB86(G, b, 'wall');
        return;
      }
      b.x = nx; b.y = ny;
      contact(G, b);
    }
  }
  function contact(G, b) {
    const cx = b.x + Math.cos(b.ang) * b.off, cy = b.y + Math.sin(b.ang) * b.off;
    if (b.side === 'p') {
      for (const e of G.enemies) {
        if (b.dead) return;
        if (!targetable(e) || (b.hits && b.hits.indexOf(e) >= 0) || (b.cd && b.cd.get(e) > b.t) || !hitsEnemy(e, cx, cy, b.r)) continue;
        hitEnemyB86(G, b, e, cx, cy);
      }
    } else if (hitsPlayer(G, cx, cy, b.r)) {
      const tm = trigOf(b);
      hitVfx(G, b.v86, cx, cy, b.ang, null);
      SK.hurtPlayer(G, b.dmg, b.x, b.y);
      if (tm.destory_parent === 0) { b.hits = [G.player]; return; }
      endB86(G, b, 'hit');
    }
  }
  function hitEnemyB86(G, b, e, cx, cy) {
    G._hitBullet = b;   // sự kiện enemyHit đọc được viên đạn gây ra
    SK.hurtEnemy(G, e, b.dmg, b.crit, b.melee || b.orbit ? Math.atan2(e.y - b.y, e.x - b.x) : Math.atan2(b.vy, b.vx), b.repel);
    G._hitBullet = null;
    hitVfx(G, b.v86, cx, cy, b.ang, 'hit_orange');
    hitSnd(b.v86);
    const tm = trigOf(b);
    // [ĐO] destory_parent 0 (cầu năng lượng, tên xuyên, vệt chém): không vỡ; disableTime = hồi trúng lại cùng con
    if (b.melee || b.area || b.slashFly || (tm.destory_parent === 0 && !tm.stop_parent)) {
      if (tm.disableTime) (b.cd = b.cd || new Map()).set(e, b.t + tm.disableTime);
      else (b.hits = b.hits || []).push(e);
      return;
    }
    if (b.pierce > 0) { b.pierce--; (b.hits = b.hits || []).push(e); return; }
    endB86(G, b, 'hit');
  }
  function endB86(G, b, why) {
    if (b.dead) return;
    b.dead = true;
    if (b.fxh && b.melee) b.fxh.stop();
    const m = b.B ? b.B.m : {}, mp = m[b.mv] || {};
    // Trigger nằm ở nút con 'b' (đầu đạn): nổ/tia trúng đích đặt ở tâm hộp va chạm, không ở gốc prefab.
    const cx = b.x + Math.cos(b.ang) * (b.off || 0), cy = b.y + Math.sin(b.ang) * (b.off || 0);
    if (!b.melee && !b.orbit && !b.area && (why === 'wall' || why === 'land' || (why === 'timeout' && mp.createHitFxWhenTimeout))) hitVfx(G, b.v86, cx, cy, b.ang, null);
    if (b.melee || b.orbit) return;
    const et = m.ExplodeEffectTrigger;
    if (et && et.creation && SK.rand() * 100 < (et.probability != null ? et.probability : 100)) {
      explode86(G, et.creation, cx, cy, { side: b.side, dmg: et.useParentInfo ? b.dmg : null, size: b.expSize != null ? b.expSize : et.scaleEffectByBulletSize ? (b.bsize || b.size) * (et.sizeFactor || 1) : 1 });
    }
    const en = m.RGBTEnergy;
    if (en && en.explode_obj && why !== 'timeout') {
      explode86(G, en.explode_obj, cx, cy, { side: b.side, dmg: en.customExplodeDamage ? Math.max(1, Math.round(b.dmg * (en.damageFactor || 0.5))) : null, size: en.sizeFactor || 1 });
    }
    const dv = m.RGBTDivision;
    if (dv && dv.bullet && why !== 'timeout') {
      // [ĐO] RGBTDivision count/angle/atk/bullet_speed: tách thành count viên cách nhau angle độ quanh hướng bay
      const n = dv.count || 3, step = dv.angle || 30;
      for (let i = 0; i < n; i++) {
        const a = b.ang + SK.deg((i - (n - 1) / 2) * step);
        SK.spawnBullet86(G, b.side, dv.bullet, b.x - Math.cos(b.ang) * 3, b.y - Math.sin(b.ang) * 3, a,
          { spd: dv.bullet_speed || 8, dmg: b.side === 'e' ? enemyDmg(dv.atk || 1) : (dv.atk || 1), h: b.h, owner: b.owner });
      }
    }
  }
  // Nổ thật: prefab Explode (bán kính = CircleCollider2D, sát thương Explode.damage, hit_enemy/hit_player) [ĐO explodes].
  function explode86(G, name, x, y, o) {
    const E = XE[name] || {};
    const rad = ((E.col && E.col.r) || 1.5) * U * (o.size || 1);
    vfx(G, name, x, y, { state: E.small ? 'explode_small' : 'explode_big', scale: o.size || 1 });
    boomSnd(name, E.small);
    if (E.shakeCamera !== 0) G.shake = Math.max(G.shake, E.small ? 3 : 5);
    let dmg = o.dmg != null ? o.dmg : (E.damage != null ? E.damage : 4);
    if (o.side === 'p' && o.dmg == null) dmg = Math.round(dmg * ((G.player && G.player.dmgMul) || 1));
    if (o.side === 'p' ? E.hit_enemy !== 0 : E.hit_enemy === 1) {
      for (const e of G.enemies) {
        if (!targetable(e)) continue;
        const ey = e.y - e.hb.off[1] * e.scale;
        if (Math.hypot(e.x - x, ey - y) < rad + e.r) SK.hurtEnemy(G, e, dmg, false, Math.atan2(ey - y, e.x - x), E.forceFactor || 3);
      }
    }
    const p = G.player;
    if (p && (o.side === 'e' ? E.hit_player !== 0 : E.hit_player === 1) && Math.hypot(p.x - x, p.y - 7 - y) < rad + 5) {
      SK.hurtPlayer(G, o.side === 'e' ? enemyDmg(dmg) : 1, x, y);
    }
    const seen = new Set();
    for (let yy = y - rad; yy <= y + rad; yy += T / 2) {
      for (let xx = x - rad; xx <= x + rad; xx += T / 2) {
        if (Math.hypot(xx - x, yy - y) > rad) continue;
        const ob = W.obstacleAt(G.map, xx, yy + 6);
        if (ob && ob.kind === 'box' && !seen.has(ob)) { seen.add(ob); SK.hitObstacle(G, ob, dmg); }
      }
    }
  }
  SK.explode86 = explode86;
  // Trả đạn địch thành đạn của người chơi bay theo hướng ang (hoặc ngược lại). Dùng cho vệt chém khi p.reflectBullets.
  SK.reflectBullet = function (G, q, ang) {
    const sp = Math.hypot(q.vx, q.vy) || 8 * U, a = ang != null ? ang : Math.atan2(-q.vy, -q.vx);
    q.side = 'p'; q.vx = Math.cos(a) * sp; q.vy = Math.sin(a) * sp; q.ang = a;
    q.crit = false; q.pierce = 0; q.hits = null; q.cd = null; q.life = Math.max(q.life, 1.2);
    vfx(G, 'hit_yellow', q.x, q.y, { scale: 0.7 });
  };
  // Toạ độ màn hình -> hệ cục bộ Unity của vệt chém (vfx: gốc xoay ang, lật = gương trục Y cục bộ).
  function localOf(b, x, y) {
    const dx = x - b.x, dy = y - b.y, c = Math.cos(b.ang), s = Math.sin(b.ang), k = U * b.size;
    const X = (c * dx + s * dy) / k, Y = (s * dx - c * dy) / k;
    return [X, b.flip ? -Y : Y];
  }
  function inBox(b, x, y, pad) {
    const col = b.B && b.B.col, box = col && col.box;
    const [X, Y] = localOf(b, x, y), pd = pad / (U * b.size);
    if (!box) return col && col.r ? Math.hypot(X - col.off[0], Y - col.off[1]) < col.r + pd : Math.hypot(X, Y) < 1 + pd;
    return Math.abs(X - box[0]) <= box[2] / 2 + pd && Math.abs(Y - box[1]) <= box[3] / 2 + pd;
  }
  function meleeB86(G, b) {
    const o = b.owner;
    if (o) { if (b.ax == null) { b.ax = b.x - o.x; b.ay = b.y - o.y; } b.x = o.x + b.ax; b.y = o.y + b.ay; }
    if (b.t > MELEE_ACTIVE) return;
    if (b.side === 'p') {
      for (const e of G.enemies) {
        if (!targetable(e) || (b.hits && b.hits.indexOf(e) >= 0)) continue;
        const ex = e.x, ey = e.y - e.hb.off[1] * e.scale;
        if (inBox(b, ex, ey, e.r)) hitEnemyB86(G, b, e, ex, ey);
      }
      // Kiếm chém tan đạn địch (SK) — theo hộp va chạm thật của vệt chém. Chủ có reflectBullets (buff) thì trả đạn.
      for (const q of G.bullets) {
        if (q.side !== 'e' || q.dead || !inBox(b, q.x, q.y, 2)) continue;
        if (o && o.reflectBullets) SK.reflectBullet(G, q, b.ang);
        else if (q.v86) endB86(G, q, 'hit'); else q.dead = true;
      }
      if (!b.boxDone) {
        b.boxDone = true;
        const seen = new Set(), box = b.B && b.B.col && b.B.col.box;
        const w2 = box ? box[2] / 2 : 1, h2 = box ? box[3] / 2 : 1, cx0 = box ? box[0] : 0, cy0 = box ? box[1] : 0;
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
          const X = cx0 + i * w2 * 0.8, Y = (cy0 + j * h2 * 0.8) * (b.flip ? -1 : 1);
          const c = Math.cos(b.ang), s = Math.sin(b.ang), k = U * b.size;
          const px = b.x + k * (c * X + s * Y), py = b.y + k * (s * X - c * Y);
          const ob = W.obstacleAt(G.map, px, py + 7);
          if (ob && ob.kind === 'box' && !seen.has(ob)) { seen.add(ob); SK.hitObstacle(G, ob, b.dmg); }
        }
      }
    } else if (!(b.hits && b.hits.length)) {
      const p = G.player;
      if (p && p.st !== 'dead' && inBox(b, p.x, p.y - 7, 4)) { b.hits = [p]; SK.hurtPlayer(G, b.dmg, b.x, b.y); }
    }
  }
  // BulletFollow [ĐO ballPositionOffset, rotate_angle]: hai cầu ở ±offset quay quanh người bắn.
  function orbitB86(G, b) {
    const o = b.owner, O = b.orbit;
    b.ang = O.a0 + O.w * b.t;
    if (o) { b.x = o.x; b.y = o.y - 7; }
    const c = Math.cos(b.ang), s = Math.sin(b.ang);
    for (const sg of [1, -1]) {
      const Y = sg * O.r, px = b.x + s * Y, py = b.y - c * Y;
      for (const e of G.enemies) {
        if (!targetable(e) || (b.cd && b.cd.get(e) > b.t)) continue;
        if (hitsEnemy(e, px, py, b.r)) hitEnemyB86(G, b, e, px, py);
      }
      for (const q of G.bullets) if (q.side === 'e' && !q.dead && Math.abs(q.x - px) < b.r + 3 && Math.abs(q.y - py) < b.r + 3) { if (q.v86) endB86(G, q, 'hit'); else q.dead = true; }
    }
  }
  function areaB86(G, b) {
    if (b.side === 'p') {
      for (const e of G.enemies) {
        if (!targetable(e) || (b.hits && b.hits.indexOf(e) >= 0)) continue;
        if (hitsEnemy(e, b.x, b.y, b.r)) hitEnemyB86(G, b, e, b.x, b.y);
      }
    } else if (!(b.hits && b.hits.length) && hitsPlayer(G, b.x, b.y, b.r)) { b.hits = [G.player]; SK.hurtPlayer(G, b.dmg, b.x, b.y); }
  }

  // Đạn kiểu cũ của mô-đun khác (kỹ năng, trùm): giữ nguyên hành vi, tia trúng đích/nổ dùng hiệu ứng thật.
  function legacyBoom(G, b) {
    const rad = b.boom, x = b.x, y = b.y, big = b.boomState === 'explode_big';
    b.boom = 0;
    vfx(G, big ? 'enemy_dead_explode' : 'explode_s', x, y, { state: b.boomState || 'explode_small', scale: Math.max(0.6, Math.min(1.5, rad / (big ? 46 : 18))) });
    G.shake = Math.max(G.shake, big ? 5 : 3);
    const dmg = Math.round((b.boomDmg || b.dmg) * (G.player.dmgMul || 1));
    for (const e of G.enemies) {
      if (!targetable(e)) continue;
      const ey = e.y - e.hb.off[1] * e.scale;
      if (Math.hypot(e.x - x, ey - y) < rad + e.r) SK.hurtEnemy(G, e, dmg, false, Math.atan2(ey - y, e.x - x), 4);
    }
  }
  SK.updateBullets = function (G, dt) {
    const map = G.map, p = G.player;
    for (const b of G.bullets) {
      if (b.dead) continue;
      if (b.v86) { stepB86(G, b, dt); continue; }
      b.life -= dt;
      if (b.life <= 0) { b.dead = true; if (b.side === 'p' && b.boom) legacyBoom(G, b); continue; }
      if (b.vis) { if (b.follow) { b.x = b.follow.x; b.y = b.follow.y - 7; } continue; }
      const sp = Math.hypot(b.vx, b.vy), n = Math.max(1, Math.ceil(sp * dt / 4));
      for (let k = 0; k < n && !b.dead; k++) {
        b.x += b.vx * dt / n; b.y += b.vy * dt / n;
        const gy = b.y + b.h;
        if (W.solidAt(map, b.x, gy)) {
          const o = W.obstacleAt(map, b.x, gy);
          if (b.side === 'p') {
            const box = o && o.kind === 'box';
            if (box && !(b.boxes && b.boxes.has(o))) { SK.hitObstacle(G, o, b.dmg); (b.boxes = b.boxes || new Set()).add(o); }
            if (b.kind === 'wave' && box) continue;
            if (b.bounce > 0) {
              // b.bounce: nảy tường (buff đạn nảy)
              const px = b.x - b.vx * dt / n, py = b.y - b.vy * dt / n;
              const sx = W.solidAt(map, b.x, py + b.h), sy = W.solidAt(map, px, b.y + b.h);
              b.x = px; b.y = py;
              if (sx || !sy) b.vx = -b.vx;
              if (sy || !sx) b.vy = -b.vy;
              b.bounce--; b.ang = Math.atan2(b.vy, b.vx);
              vfx(G, b.hit || 'hit_yellow', b.x, b.y, {});
              continue;
            }
            b.x -= b.vx * dt / n; b.y -= b.vy * dt / n;
            b.dead = true;
            if (b.boom) legacyBoom(G, b); else vfx(G, b.hit || 'hit_yellow', b.x, b.y, {});
            break;
          }
          b.dead = true;
          if (o && o.kind === 'box') SK.hitObstacle(G, o, 1);
          vfx(G, 'hit_orange', b.x - b.vx * dt / n, b.y - b.vy * dt / n, {});
          break;
        }
        if (b.side === 'p') {
          for (const e of G.enemies) {
            if (!targetable(e) || (b.hits && b.hits.indexOf(e) >= 0) || !hitsEnemy(e, b.x, b.y, b.r)) continue;
            G._hitBullet = b;
            SK.hurtEnemy(G, e, b.dmg, b.crit, Math.atan2(b.vy, b.vx), b.repel);
            G._hitBullet = null;
            if (b.boom) { legacyBoom(G, b); b.dead = true; break; }
            vfx(G, b.hit || 'hit_yellow', b.x, b.y, {});
            if (b.pierce > 0) { b.pierce--; (b.hits = b.hits || []).push(e); continue; }
            b.dead = true; break;
          }
          if (b.eatBullets && !b.dead) {
            for (const q of G.bullets) if (q.side === 'e' && !q.dead && Math.abs(q.x - b.x) < b.r + 5 && Math.abs(q.y - b.y) < b.r + 5) q.dead = true;
          }
        } else if (p.st !== 'dead') {
          const hb = p.h.hurt, cx = p.x, cy = p.y - hb.off[1];
          if (Math.abs(b.x - cx) < hb.size[0] / 2 + b.r && Math.abs(b.y - cy) < hb.size[1] / 2 + b.r) {
            b.dead = true;
            vfx(G, 'hit_red', b.x, b.y, {});
            SK.hurtPlayer(G, b.dmg, b.x, b.y);
          }
        }
      }
      if (b.kind === 'sprite-spin') b.ang += dt * 12;
    }
    G.bullets = G.bullets.filter(b => !b.dead);
  };

  // Vẽ đạn kiểu cũ (mô-đun khác đẩy vào G.bullets): sprite bullet_N thật. Đạn 8.6 do SK.vfx vẽ (b.fxh);
  // chỉ khi hiệu ứng chưa có (vfx chưa nạp) mới vẽ khung đầu của prefab.
  const BULLET_DRAW = {
    pb(ctx, b) {
      const a = Math.atan2(b.vy, b.vx);
      if (b.sprite) SK.draw(ctx, b.sprite, b.x, b.y, { rot: a });
    },
    orb(ctx, b) { if (b.sprite) SK.draw(ctx, b.sprite, b.x, b.y, { rot: b.ang }); },
    arrow(ctx, b) { if (b.sprite) SK.draw(ctx, b.sprite, b.x, b.y, { rot: b.side === 'p' ? Math.atan2(b.vy, b.vx) : b.ang }); },
    wave(ctx, b) {
      const a = Math.atan2(b.vy, b.vx);
      ctx.save(); ctx.globalAlpha = Math.min(1, b.life / 0.25);
      SK.draw(ctx, b.sprite, b.x, b.y, { rot: a, sx: 1.2, sy: 1.2 });
      ctx.restore();
    }
  };
  function drawB86(ctx, b) {
    if (b.fxh && !b.fxh.dead) return;
    const eb = D.bullets && D.bullets[b.v86];
    if (eb && eb.sprite) SK.draw(ctx, eb.sprite, b.x, b.y, { rot: b.ang });
  }
  SK.drawBullets = function (ctx, G) {
    for (const b of G.bullets) {
      if (b.v86) drawB86(ctx, b);
      else (BULLET_DRAW[b.kind] || BULLET_DRAW.orb)(ctx, b);
    }
  };

  // ---------------------------------------------------------------- vật cản phá được
  SK.hitObstacle = function (G, o, dmg) {
    o.hp -= dmg; o.flash = 0.06;
    if (o.hp > 0) return;
    W.removeObstacle(G.map, o);
    SK.emit('obstacleBreak', G, o);
    vfx(G, 'smoke', o.x, o.y - 8, { state: 'smoke' });
    if (o.explode) {
      vfx(G, 'explode_s', o.x, o.y - 8, { state: 'explode_small' });
      G.shake = Math.max(G.shake, 4);
      for (const e of G.enemies) if (targetable(e) && Math.hypot(e.x - o.x, e.y - o.y) < 40) SK.hurtEnemy(G, e, 6, false, Math.atan2(e.y - o.y, e.x - o.x), 4);
      if (Math.hypot(G.player.x - o.x, G.player.y - o.y) < 32) SK.hurtPlayer(G, 2, o.x, o.y);
    }
  };

  // ---------------------------------------------------------------- đồ rơi
  function mbsNum(prefabKind, cls, field, dflt) {
    const m = SK.prefabMbs(SK.art.object(prefabKind), cls);
    return m && m[field] != null ? m[field] : dflt;
  }
  SK.dropPickup = function (G, kind, x, y, extra) {
    if (!PICKUP[kind]) { SK.warnOnce('pickup' + kind, 'pickup kind not found: ' + kind); return; }   // loại lạ làm vỡ vòng vẽ mỗi khung
    const a = SK.rand() * Math.PI * 2, s = SK.randf(30, 70);
    G.pickups.push(Object.assign({ kind, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, z: 0, vz: 60 }, extra));
  };
  const PICKUP = {
    coin: {
      range: () => mbsNum('coin', 'RGCoin', 'range', 7) * U,
      take(G, p, k) { p.gold += k && k.value != null ? k.value : mbsNum('coin', 'RGCoin', 'value', R.coinValue); return true; },
      draw(ctx, k, t) {
        const pf = SK.art.object('coin');
        if (!SK.drawPrefab(ctx, pf, k.x, k.y - k.z, { t, state: 'coin_copper' })) { ctx.fillStyle = '#f0b43a'; ctx.fillRect(k.x - 3, k.y - k.z - 7, 6, 7); }
      }
    },
    energy: {
      range: () => mbsNum('energy_orb', 'RGEnergy', 'range', 6) * U,
      take(G, p) { p.energy = Math.min(p.energyMax, p.energy + mbsNum('energy_orb', 'RGEnergy', 'value', R.energyOrb)); return true; },
      draw(ctx, k, t) {
        ctx.fillStyle = 'rgba(80,190,255,' + (0.18 + 0.08 * Math.sin(t * 8)) + ')';
        ctx.beginPath(); ctx.arc(k.x, k.y - k.z - 4, 6, 0, Math.PI * 2); ctx.fill();
        if (!SK.drawPrefab(ctx, SK.art.object('energy_orb'), k.x, k.y - k.z - 4, { t })) { ctx.fillStyle = '#5ad0ff'; ctx.fillRect(k.x - 2, k.y - k.z - 6, 4, 4); }
      }
    },
    hp_pot: {
      range: () => 0,
      take(G, p) { if (p.hp >= p.hpMax) return false; p.hp = Math.min(p.hpMax, p.hp + mbsNum('hp_potion', 'RGHealthPot', 'health', R.potionHp)); return true; },
      draw(ctx, k, t) { if (!SK.drawPrefab(ctx, SK.art.object('hp_potion'), k.x, k.y - k.z, { t })) { ctx.fillStyle = '#e33'; ctx.fillRect(k.x - 3, k.y - 9, 6, 8); } }
    },
    en_pot: {
      range: () => 0,
      take(G, p) { if (p.energy >= p.energyMax) return false; p.energy = Math.min(p.energyMax, p.energy + mbsNum('energy_potion', 'RGEnergyPot', 'energy', R.potionEnergy)); return true; },
      draw(ctx, k, t) { if (!SK.drawPrefab(ctx, SK.art.object('energy_potion'), k.x, k.y - k.z, { t })) { ctx.fillStyle = '#39f'; ctx.fillRect(k.x - 3, k.y - 9, 6, 8); } }
    }
  };
  SK.pickupKinds = PICKUP;   // js/drops.js đăng ký thêm kiểu 'material' (vật liệu/hạt giống/bản vẽ rơi từ quái)
  SK.updatePickups = function (G, dt) {
    const p = G.player;
    for (const k of G.pickups) {
      k.t += dt;
      k.vz -= 300 * dt; k.z = Math.max(0, k.z + k.vz * dt);
      if (k.z === 0) k.vz = Math.abs(k.vz) > 40 ? -k.vz * 0.35 : 0;
      const def = PICKUP[k.kind];
      const d = Math.hypot(p.x - k.x, p.y - 6 - k.y);
      const mag = def.range() && k.t > 0.35 && d < def.range() && p.st !== 'dead';
      if (mag) {
        const s = 140 + k.t * 120;
        k.vx = (p.x - k.x) / d * s; k.vy = (p.y - 6 - k.y) / d * s;
      } else { const f = Math.exp(-dt * 5); k.vx *= f; k.vy *= f; }
      SK.moveBox(G.map, k, k.vx * dt, k.vy * dt, 1);
      if (d < 8 && k.t > 0.2 && p.st !== 'dead' && def.take(G, p, k)) { k.gone = true; SK.emit('pickup', G, k.kind); }
    }
    G.pickups = G.pickups.filter(k => !k.gone);
  };
  SK.drawPickup = function (ctx, G, k) { PICKUP[k.kind].draw(ctx, k, G.t + k.x * 0.01); };

  // ---------------------------------------------------------------- hiệu ứng
  const FX_DRAW = {
    prefab(ctx, f) {
      if (!f.parts || !SK.drawPrefab(ctx, f.parts, f.x, f.y, { t: f.t, state: f.state, scale: f.scale })) {
        ctx.fillStyle = 'rgba(255,240,200,' + (1 - f.t / f.dur) + ')';
        ctx.beginPath(); ctx.arc(f.x, f.y, 2 + f.t * 12, 0, Math.PI * 2); ctx.fill();
      }
    },
    ring(ctx, f) {
      const k = f.t / f.dur;
      ctx.save(); ctx.strokeStyle = f.color || '#fff'; ctx.globalAlpha = 1 - k; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(f.x, f.y, 6 + k * 18, 3 + k * 9, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    },
    dust(ctx, f) {
      const pf = SK.art.vfx('dust');
      const m = SK.prefabMbs(pf, 'SpriteAnimation');
      if (m && m.sprites) {
        const i = Math.min(m.sprites.length - 1, Math.floor(f.t * (m.frameRate || 20)));
        if (SK.draw(ctx, m.sprites[i].replace(/^@/, ''), f.x, f.y)) return;
      }
      ctx.fillStyle = 'rgba(200,200,200,' + (0.5 - f.t) + ')'; ctx.fillRect(f.x - 1, f.y - 2, 3, 2);
    },
    // Chưa có sprite xuất quái: cột sáng + vòng đất (vẽ tay).
    spawn(ctx, f) {
      const vfx = SK.art.vfx('enemy_spawn');
      if (typeof vfx === 'string' && SK.anim(vfx)) { const fr = SK.animFrame(vfx, f.t); if (fr && SK.draw(ctx, fr, f.x, f.y)) return; }
      const k = f.t / f.dur;
      ctx.save();
      ctx.globalAlpha = Math.sin(k * Math.PI);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      const w = 10 * (1 - k * 0.6);
      ctx.fillRect(Math.round(f.x - w / 2), f.y - 34, Math.round(w), 34);
      ctx.strokeStyle = '#bdf6ff'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(f.x, f.y, 4 + k * 10, 2 + k * 4, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  };
  SK.updateFx = function (G, dt) {
    for (const f of G.fx) f.t += dt;
    G.fx = G.fx.filter(f => f.t < f.dur);
    for (const n of G.nums) n.t += dt;
    G.nums = G.nums.filter(n => n.t < 0.8);
  };
  SK.drawFx = function (ctx, G, ground) {
    for (const f of G.fx) {
      const isGround = f.kind === 'dust' || f.kind === 'ring';
      if (isGround === ground) (FX_DRAW[f.kind] || FX_DRAW.prefab)(ctx, f);
    }
  };
})();
