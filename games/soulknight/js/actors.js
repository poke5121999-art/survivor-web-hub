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
    const ox = (off ? off[0] : 0) - ((o && o.kick) || 0), oy = off ? -off[1] : 0;
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
      dmg: o.dmg || 0, crit: !!o.crit, repel: o.repel || 0, life: o.life || mp.destroy_time || 5, t: 0, r, off, size,
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
    if (B && B.fx && ensureFx()) b.fxh = SK.vfx.spawn(G, 'W:' + pf, x, y, { ang, follow: b, scale: size, flip: b.flip });
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
  function critRoll(p, crit) { return SK.rand() * 100 < ((p.crit || 0) + (crit || 0)); }

  // ---------------------------------------------------------------- một phát bắn của súng 8.6
  // info = bulletsInfo [ĐO]: {p prefab, dmg, spd, size, crit, repel, thr}. Độ lệch: ±deviation/2 độ [ƯỚC LƯỢNG cách chia].
  function shot86(G, p, w, info, mz, ang, o) {
    const d = w.def, crit = critRoll(p, info.crit);
    const base = o && o.dmg != null ? o.dmg : info.dmg;
    const dmg = Math.max(0, Math.round(base * (d.w86.dmf || 1) * (p.dmgMul || 1))) * (crit ? R.critMult : 1);
    const B = XB[info.p] || {};
    const [hx, hy] = handPos(p, w.side || 1);
    // bulletsInfo.size không nhân vào hình: prefab đã mang sẵn cỡ (sword_2_5, bullet_28 nút b ×2) [ƯỚC LƯỢNG sau khi so ảnh]
    const common = { dmg, crit, repel: info.repel, thr: info.thr, size: (o && o.size) || 1, h: Math.max(2, p.y - mz.y), owner: p,
      spd: o && o.spd != null ? o.spd : info.spd, hx, hy, flip: o && o.flip, life: o && o.life, keep: w.beamKeep ? w : null, dur: w.beamKeep ? 0.2 : 0.15 };
    // Họ laser mà prefab đạn không phải lớp đạn bay (bullet_9 của Ion Laser không có MB): vẫn là tia [ĐO cây head/end/img]
    if (BEAM_MV.test(B.mv || '') || (d.w86.fam === 'laser' && !/^(Bullet|RGSBullet)/.test(B.mv || ''))) return beam86(G, 'p', info.p, mz.x, mz.y, ang, common);
    return SK.spawnBullet86(G, 'p', info.p, mz.x, mz.y, ang, common);
  }
  const jitter = dev => SK.deg(SK.randf(-dev / 2, dev / 2));
  // Mẫu bắn theo họ lớp Gun* (tools/weapons86 FAMILY_PREFIX) [ĐO trường: multiCount, angle, continuousCount, delay, max_delay].
  function fireW86(G, p, w, o) {
    const d = w.def, e = d.w86, x = e.x, bs = e.b.filter(b => b.p);
    if (!bs.length) return;
    const mz = { x: o.x, y: o.y }, aim = o.ang, dev = d.spread || 0;
    const pick = () => x.randomBullet ? SK.pick(bs) : bs[x.bulletIndex && bs[x.bulletIndex] ? x.bulletIndex : 0];
    const spdK = () => x.speed_correction ? 1 + SK.randf(-x.speed_correction, x.speed_correction) / 100 : 1;
    const fam = e.fam;
    const mc = d.pellets || x.multiCount || 1;   // def.pellets: buff "Súng Săn" (rooms.js) cộng thêm viên
    if (fam === 'fan') {
      const n = mc, step = x.angle || 0;
      for (let i = 0; i < n; i++) { const b = pick(); shot86(G, p, w, b, mz, aim + SK.deg((i - (n - 1) / 2) * step) + jitter(dev), { spd: b.spd * spdK() }); }
    } else if (fam === 'spray') {
      const n = mc;
      for (let i = 0; i < n; i++) {
        const b = pick(), a = aim + jitter(dev), dl = x.has_delay ? SK.randf(0, x.max_delay || 0) : 0;
        if (dl > 0) w.q.push({ t: dl, fn: () => shot86(G, p, w, b, mz, a, { spd: b.spd * spdK() }) });
        else shot86(G, p, w, b, mz, a, { spd: b.spd * spdK() });
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
      // Nhả nút: k = thời gian giữ / max_time. [ƯỚC LƯỢNG] tốc đạn nội suy giữa hai bulletsInfo, sát thương ×(1+k) như wiki "4~8".
      const k = o.charge == null ? 1 : o.charge, b0 = bs[0], b1 = bs[1] || bs[0];
      const n = x.multiCount || 1, reps = x.continuousCount || 1;
      // LaserRain: releaseAngle là nón thả tia [ƯỚC LƯỢNG]; đạn đầu tốc 0 (tia sinh trong mã) thì lấy số lớn nhất của bulletsInfo
      const step = x.angle != null ? x.angle : (x.releaseAngle && n > 1 ? x.releaseAngle / (n - 1) : 0);
      const sHi = b0.spd || Math.max(...e.b.map(b => b.spd || 0)), sLo = b1.spd || sHi, dB = b0.dmg || Math.max(...e.b.map(b => b.dmg || 0));
      const full = k >= 0.999;
      for (let r = 0; r < reps; r++) {
        const f = () => {
          for (let i = 0; i < n; i++) {
            const a = aim + SK.deg((i - (n - 1) / 2) * step) + jitter(dev);
            if (fam === 'bow') shot86(G, p, w, b0, w.lastMz || mz, a, { spd: sLo + (sHi - sLo) * k, dmg: Math.round(dB * (1 + k)) });
            else shot86(G, p, w, full ? b0 : b1, w.lastMz || mz, a);
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
    const dmg = Math.round((d.dmg || 1) * (p.dmgMul || 1)) * (crit ? R.critMult : 1), a = o.ang + jitter(d.spread || 0);
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
          SK.hurtEnemy(G, e, Math.round(dmg * (p.dmgMul || 1)) * (crit ? R.critMult : 1), crit, o.ang, d.repel || 3);
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
  SK.weaponPool = (level, source) => (DS.weaponPool ? DS.weaponPool(level, source, SK.rand) : DS.chestPool.slice());

  // ---------------------------------------------------------------- người chơi
  SK.makePlayer = function (heroId, x, y) {
    const h = DS.heroes[heroId];
    const hd = D.heroes && D.heroes[heroId] && D.heroes[heroId].s0;
    return {
      hero: heroId, h, anims: hd || {}, x, y, face: 1, aim: 0, moving: false, t: 0,
      hp: h.hp, hpMax: h.hp, armor: h.armor, armorMax: h.armor, energy: h.energy, energyMax: h.energy,
      crit: h.crit || 0, gold: 0, weapons: [SK.makeWeapon(h.weapon), null], cur: 0,
      st: 'alive', stT: 0, invulT: 0, armorT: 0, armorTick: 0, flash: 0,
      skillCd: 0, skillT: 0, dual: null, target: null, god: false, speedMul: 1
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

  function handPos(p, side) {
    const hd = p.h.hand || [3, 6];
    const f = side === 2 ? -p.face : p.face;
    return [p.x + hd[0] * f, p.y - hd[1]];
  }

  // ---------------------------------------------------------------- chạy vũ khí: máy trạng thái Animator thật
  // SM (tools/weapons86 machine()): st[i] = {c clip, len (giây ở tốc 1, đã chia tốc trạng thái), loop, ev [[t, tên]],
  // h: chuyển khi đang giữ nút {to, x} | null, r: khi đã nhả}. x = null là chuyển ngay; x = thời điểm chuẩn hoá (exit time).
  // Thời gian chạy × weapon_speed × rateMul [ĐO RGWeapon.ResetWeaponSpeed -> Animator.set_speed].
  function exitAt(s, t, x) {
    const L = s.len;
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
      } else if (a < e && e <= b + 1e-9) cb(ev[1]);
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
    if (charge == null && p.energy < cost) return;
    if (charge == null) p.energy -= cost;
    const [hx, hy] = handPos(p, side);
    // Rìu (GunAxe*): vòng xoáy quanh người, gun_point của rìu vung lên đầu nên đặt đạn ở tay [ƯỚC LƯỢNG]
    const mz = /^GunAxe/.test(e.cls) ? { x: hx, y: hy, ang: p.aim } : muzzle86(w, hx, hy, p.aim);
    w.lastMz = mz; w.lastAng = p.aim;
    // Góc đạn = góc ngắm (độ giật của clip không đổi hướng đạn) [ƯỚC LƯỢNG]; Attack2 của kiếm là nhát chém ngược.
    (SK.WEAPON_KINDS[d.kind] || SK.WEAPON_KINDS.gun).fire(G, p, w, { x: mz.x, y: mz.y, ang: p.aim, side, charge, fn, flip: /2$/.test(fn || '') });
    if (!gpAnimated(e)) {
      const m = vfxOn() && SK.vfx.muzzleFor(d.prefab);
      if (m) vfx(G, m.muzzle, mz.x, mz.y, { ang: p.aim, flip: Math.cos(p.aim) < 0, dur: m.show });
    }
    SK.emit('fire', G, p, w);
  }
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
    if (p.st === 'dead') { p.stT += dt; return; }
    p.invulT = Math.max(0, p.invulT - dt); p.flash = Math.max(0, p.flash - dt);
    p.skillCd = Math.max(0, p.skillCd - dt);
    for (const w of p.weapons) if (w) { w.cd -= dt; w.kick = Math.max(0, w.kick - dt * 20); w.swing = Math.max(0, (w.swing || 0) - dt); }
    if (p.dual) { p.dual.cd -= dt; p.dual.kick = Math.max(0, p.dual.kick - dt * 20); p.dual.swing = Math.max(0, (p.dual.swing || 0) - dt); }

    // giáp hồi sau một quãng không trúng đòn
    p.armorT -= dt;
    if (p.armorT <= 0 && p.armor < p.armorMax) {
      p.armorTick -= dt;
      if (p.armorTick <= 0) { p.armor++; p.armorTick = R.armorTick; }
    }

    const mv = G.phase === 'portal' ? { x: 0, y: 0 } : I.moveVec();
    p.moving = Math.abs(mv.x) + Math.abs(mv.y) > 0.05;
    const pad = W.obstacleAt(G.map, p.x, p.y - 2);
    p.speedMul = pad && pad.kind === 'pad' ? (pad.p.speed_down ? 1 - pad.p.speed_rate : 1 + pad.p.speed_rate) : 1;
    const spd = p.h.speed * U * p.speedMul * (p.moveMul || 1);
    SK.moveBox(G.map, p, mv.x * spd * dt, mv.y * spd * dt, p.h.body.r);
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
    const want = G.phase !== 'portal' && I.down('attack') && !(I.touchMode && G.interactTarget && I.btn.attack);
    runWeapon(G, p, w, 1, want, dt);
    if (p.dual) runWeapon(G, p, p.dual, 2, want && p.skillT > 0, dt);
    if (want && w) holdMove(G, p, w.def); else releaseMove(p);
    if (G.phase === 'portal') return;
    if (p.skillT > 0) { p.skillT -= dt; const sd = skillDef(p); if (sd.update) sd.update(G, p, dt); if (p.skillT <= 0) SK.endSkill(G, p); }
    if (I.hit('skill') && p.skillCd <= 0 && p.skillT <= 0) startSkill(G, p);
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
  function skillDef(p) {
    const id = p.h.skill && p.h.skill.id;
    if (SK.SKILLS[id]) return SK.SKILLS[id];
    SK.warnOnce('skill' + id, 'skill ' + id + ' not implemented, using dual_wield');
    return SK.SKILLS.dual_wield;
  }
  function startSkill(G, p) {
    skillDef(p).start(G, p);
    if (!(p.skillT > 0)) p.skillCd = p.h.skill.cd;
    SK.emit('skill', G, p);
  }
  SK.endSkill = function (G, p) {
    const sd = skillDef(p);
    p.skillT = 0;
    if (sd.end) sd.end(G, p);
    p.skillCd = p.h.skill.cd;
  };

  SK.hurtPlayer = function (G, dmg) {
    const p = G.player;
    if (p.st === 'dead' || p.invulT > 0 || dmg <= 0) return false;
    if (p.onHurt) { dmg = p.onHurt(G, p, dmg); if (!(dmg > 0)) return false; }
    p.armorT = R.armorDelay; p.armorTick = R.armorTick;
    const a = Math.min(p.armor, dmg);
    p.armor -= a; dmg -= a;
    p.hp -= dmg;
    if (p.god && p.hp < 1) p.hp = 1;
    p.invulT = R.hurtInvuln; p.flash = 0.1;
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
    const w = p.weapons[p.cur];
    // Clip skin_<n>_idle/run/dead gốc: nhún nút img (thân + tay cầm súng) khi chạy, nảy khi chết.
    const fs = p.face < 0 ? -1 : 1;
    const xf = SK.animPose(key, at, p.anims.bodyPath), hf = SK.animPose(key, at, p.anims.handPath);
    const hoff = [hf.dx * fs, hf.dy];
    if (p.st !== 'dead' && p.dual) drawHeld(ctx, p, p.dual, 2, hoff);
    if (!fr || !SK.draw(ctx, fr, p.x + xf.dx * fs, p.y + xf.dy, { flip: p.face < 0, pages, sx: xf.sx, sy: xf.sy, rot: xf.rot * fs })) {
      ctx.fillStyle = '#9aa4b5'; ctx.fillRect(p.x - 6, p.y - 16, 12, 16);
    }
    if (p.st !== 'dead' && w) drawHeld(ctx, p, w, 1, hoff);
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
    SK.fx(G, 'spawn', x, y, { dur: 0.7 });
    return e;
  };

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
  function startAim(G, e, t) { e.st = 'aim'; e.stT = t || R.telegraph; aimAtPlayer(G, e); }

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
    const w = e.w, spdU = Math.min(R.enemyBulletMaxSpeed, (w.p.bullet_speed || 7) * (o && o.spdMul || 1));
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
    SK.emit('enemyFire', G, e);
  }

  SK.updateEnemy = function (G, e, dt) {
    e.t += dt;
    e.flash = Math.max(0, e.flash - dt);
    e.kick = Math.max(0, (e.kick || 0) - dt * 16);
    e.swing = Math.max(0, (e.swing || 0) - dt);
    e.thrust = Math.max(0, (e.thrust || 0) - dt);
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
    SK.AI[e.cls](G, e, dt);
  };

  SK.hurtEnemy = function (G, e, dmg, crit, ang, repel) {
    if (!targetable(e)) return false;
    e.hp -= dmg; e.flash = 0.08;
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
    if (!dead && e.w && e.w.sprite) {
      let [hx, hy] = eHand(e);
      if (e.w.path) { const hf = SK.animPose(pk, at, e.w.path); hx += hf.dx * s * fs; hy += hf.dy * s; }
      let ang = e.w.p.need_lock === 0 && e.st !== 'aim' ? (e.face > 0 ? 0 : Math.PI) : e.aim;
      if (e.st !== 'aim' && e.st !== 'attack' && e.w.p.need_lock !== 0) ang = e.face > 0 ? 0.15 : Math.PI - 0.15;
      if (e.swing > 0) ang += (1 - e.swing / 0.18) * 2.4 - 1.2;
      const push = e.thrust > 0 ? Math.sin(e.thrust / 0.22 * Math.PI) * 8 : 0;
      SK.drawGun(ctx, e.w.sprite, hx + Math.cos(ang) * push, hy + Math.sin(ang) * push, ang, e.w.spriteOff, { scale: s, kick: e.kick, pages });
    }
    if (e.st === 'aim' && e.w && e.w.p && e.w.p.aimTime) drawAimLine(ctx, G, e);
  };
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
    SK.hurtEnemy(G, e, b.dmg, b.crit, b.melee || b.orbit ? Math.atan2(e.y - b.y, e.x - b.x) : Math.atan2(b.vy, b.vx), b.repel);
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
      explode86(G, et.creation, cx, cy, { side: b.side, dmg: et.useParentInfo ? b.dmg : null, size: et.scaleEffectByBulletSize ? b.size : 1 });
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
            SK.hurtEnemy(G, e, b.dmg, b.crit, Math.atan2(b.vy, b.vx), b.repel);
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
