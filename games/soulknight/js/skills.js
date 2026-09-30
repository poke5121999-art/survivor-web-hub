// Kỹ năng + nội tại của 42 nhân vật: đăng ký SK.SKILLS[id] (id = slug tên kỹ năng, trùng slug của lobby).
// Số lấy từ data/sk-skills86.js (tools/build_skills86.py, bản cài 8.6.0): cd/thời lượng/số lượt từ config/skills,
// số đạn/thú/hiệu ứng từ MonoBehaviour thật, logic và số trong mã C# đọc bằng tools/sk_method.py (ghi [ĐO Lớp.Method]).
// Collider lấy từ sk-data.js; số không có ở đâu cả (hoạt ảnh, collider thiếu) thì theo wiki [WIKI] hoặc ước lượng
// [ƯỚC LƯỢNG]. Hình: SK.vfx (hiệu ứng thật, data/sk-vfx.js) trước, thiếu thì cây prefab thật trong sk-data.js
// (tools/extra/skills.json).
(function () {
  'use strict';
  const SK = window.SK, D = SK.D, DS = SK.DS, W = SK.world, U = SK.PPU, T = SK.TILE;
  const R = DS.rules;
  const I = SK.input;

  // ---------------------------------------------------------------- số thật 8.6
  const S86 = () => window.SK_SKILLS86 || null;
  const H86 = f => { const s = S86(); return (s && s.heroes[f]) || null; };
  const K86 = (f, id) => { const h = H86(f); return (h && h.skills.find(s => s.id === id)) || null; };
  // MB(prefab, lớp, trường, mặc định, chọn?) — prefab trùng tên có nhiều bản thì `pick` chọn bản đúng.
  function MB(pf, cls, field, dflt, pick) {
    const s = S86();
    let o = s && s.mb[pf] && s.mb[pf][cls];
    if (Array.isArray(o)) o = (pick && o.find(pick)) || o[0];
    return o && o[field] != null ? o[field] : dflt;
  }
  const CTRL = (f, field, dflt) => { const h = H86(f); const v = h && h.ctrlFields[field]; return v != null ? v : dflt; };
  // Số của kỹ năng đang cầm: cd / dur / max (số lượt) / args (descriptionArgs).
  const cfg = (p, id) => K86(p.hero, id) || {};

  // ---------------------------------------------------------------- tra hình
  const XP = (D.extra && D.extra.png) || {};
  const XS0 = (D.extra && D.extra.sprites) || {}, XS = {};
  // Cùng một sprite nằm ở hai bundle thì bản thứ hai mang đuôi '~2'; bỏ đi cho khỏi lặp khung.
  for (const k in XS0) XS[k] = XS0[k].filter(n => n.indexOf('~') < 0).sort((x, y) => x.localeCompare(y, 'en', { numeric: true }));
  const XC = (D.extra && D.extra.clips) || {};
  const pngAnim = k => XP[k] || null;
  const firstFrame = k => { const a = XP[k] && SK.anim(XP[k]); return a ? a.f[0] : null; };
  const saFrames = m => (m && m.sprites ? m.sprites.map(s => String(s).replace(/^@/, '')).filter(SK.frame) : []);

  // Quad cộng sáng Unity (light_01, texiao_01): vẽ quầng sáng bằng gradient đúng màu nhuộm của prefab.
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

  // Vẽ cây prefab thật (sk-data.js): Animator (p.a), SpriteAnimation, màu nhuộm, quầng cộng sáng.
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
      const opt = { sx: sc[0] * k, sy: sc[1] * k, flip: !!p.fx, pages: o.pages };
      any = (p.c ? SK.drawTinted(ctx, f, px, py, p.c, opt) : SK.draw(ctx, f, px, py, opt)) || any;
    }
    ctx.restore();
    return any;
  }
  SK.drawRip = drawRip;
  // Animator ở nút cha không có hình nhưng clip đổi sprite của nút con: chuyển hoạt ảnh xuống con đầu tiên có hình.
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
  function ripLen(parts, state) {
    let len = 0;
    for (const p of parts || []) {
      if (p.a) len = Math.max(len, SK.animLen((state && p.a[state]) || p.a[Object.keys(p.a)[0]]));
      const sa = p.mbs && (p.mbs.SpriteAnimation || p.mbs.SpriteAnimationFadeEnd);
      if (sa) len = Math.max(len, saFrames(sa).length / (sa.frameRate || 12));
    }
    return len;
  }
  // Prefab thật (sk-data.js) vẽ một lần trong G.props (có thứ tự theo y).
  function ripFx(G, name, x, y, o) {
    const parts = SK.prefab(name);
    if (!parts) { SK.warnOnce('rip' + name, 'skill prefab missing: ' + name); return null; }
    o = o || {};
    const dur = o.dur || ripLen(parts, o.state) || 0.5;
    const pr = {
      x, y: y + (o.dy || 0), t: 0,
      update(G2, q, dt) {
        q.t += dt;
        if (o.follow) { q.x = o.follow.x + (o.ox || 0); q.fy = o.follow.y + (o.oy || 0); if (!o.ground && !o.top) q.y = q.fy + (o.dy || 0); }
        if (q.t >= dur) q.gone = true;
      },
      draw(ctx, G2, q) {
        const k = q.t / dur;
        const a = o.fade ? Math.max(0, 1 - Math.max(0, k - 0.4) / 0.6) : 1;
        drawRip(ctx, parts, q.x, q.fy != null ? q.fy : y, { t: q.t, state: o.state, scale: o.scale || 1, rot: o.rot, flip: o.flip, alpha: (o.alpha == null ? 1 : o.alpha) * a });
      }
    };
    if (o.ground) pr.y = -1e9 + y;
    if (o.top) pr.y = 1e9;
    G.props.push(pr);
    return pr;
  }
  // Hiệu ứng thật: SK.vfx (ParticleSystem/Animator mô phỏng) nếu có, không thì cây prefab của sk-data.js.
  const hasVfx = n => !!(SK.vfx && window.SK_VFX && SK_VFX.effects[n]);
  function fx(G, name, x, y, o) {
    o = o || {};
    if (hasVfx(name)) return SK.vfx.spawn(G, name, x, y, o);
    if (SK.prefab(name)) return ripFx(G, name, x, y, { follow: o.follow, oy: o.dy, ox: o.dx, dur: o.dur, rot: o.ang, flip: o.flip, scale: o.scale, top: o.layer !== 'ground', ground: o.layer === 'ground', state: o.state });
    SK.warnOnce('fx' + name, 'skill effect missing: ' + name);
    return null;
  }
  function stopFx(h) { if (!h) return; if (h.stop) h.stop(); else h.gone = true; }

  // ---------------------------------------------------------------- tiện ích chiến đấu
  const alive = e => e.st !== 'spawn' && e.st !== 'dead' && e.hp > 0;
  const ec = e => [e.x + ((e.hb.off && e.hb.off[0]) || 0) * e.face * e.scale, e.y - e.hb.off[1] * e.scale];
  const enemyTop = e => e.y - (e.hb.off[1] + e.hb.size[1] / 2) * e.scale;
  const inRoom = (G, e) => G.room == null || e.room == null || e.room === G.room;
  function nearest(G, x, y, range, o) {
    let best = null, bd = range;
    for (const e of G.enemies) {
      if (!alive(e) || !inRoom(G, e) || (o && o.skip && o.skip(e))) continue;
      const [cx, cy] = ec(e), d = Math.hypot(cx - x, cy - y);
      if (d >= bd) continue;
      if (o && o.los && !W.los(G.map, x, y, cx, cy)) continue;
      best = e; bd = d;
    }
    return best;
  }
  function inRadius(G, x, y, r, ry) {
    const k = ry ? r / ry : 1;
    return G.enemies.filter(e => { if (!alive(e)) return false; const [cx, cy] = ec(e); return Math.hypot(cx - x, (cy - y) * k) < r + e.r; });
  }
  function hit(G, p, e, dmg, o) {
    o = o || {};
    const crit = o.crit != null ? o.crit : (o.critChance != null ? SK.rand() * 100 < o.critChance : false);
    const [cx, cy] = ec(e);
    const ang = o.ang != null ? o.ang : Math.atan2(cy - p.y, e.x - p.x);
    G._skHit = o.tag || 'skill';
    const r = SK.hurtEnemy(G, e, Math.max(1, Math.round(dmg * (o.noMul ? 1 : (p.dmgMul || 1)) * (crit ? R.critMult : 1))), crit, ang, o.repel || 0);
    G._skHit = null;
    if (r && o.fx) fx(G, o.fx, cx, cy, { scale: o.fxScale || 1 });
    return r;
  }
  // Choáng: AI01-04 tự đếm e.stT ở trạng thái 'stun'. _stunT chỉ để vẽ biểu tượng.
  function stun(e, t) {
    if (!alive(e) || e.boss) return;
    if (e.st === 'stun') e.stT = Math.max(e.stT, t); else { e.st = 'stun'; e.stT = t; }
    e._stunT = Math.max(e._stunT || 0, t);
  }
  function aimDir(p) {
    const mv = I.moveVec();
    if (Math.hypot(mv.x, mv.y) > 0.1) return Math.atan2(mv.y, mv.x);
    return p.target ? p.aim : (p.face > 0 ? 0 : Math.PI);
  }
  function targetAng(G, p, range) {
    const e = (p.target && alive(p.target) && p.target) || nearest(G, p.x, p.y - 6, range || 14 * U, { los: true });
    return e ? { e, ang: Math.atan2(ec(e)[1] - (p.y - 6), ec(e)[0] - p.x) } : { e: null, ang: aimDir(p) };
  }
  // Hệ số nhân dùng chung với mô-đun khác: mỗi nguồn giữ phần của mình.
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
  function subAnim(src, a, b, name) {
    const A = src && SK.anim(src); if (!A) return src;
    const k = 'sk/' + name;
    if (!D.anims[k]) D.anims[k] = { f: A.f.slice(a, b), d: A.d.slice(a, b), loop: true };
    return k;
  }
  function heal(G, p, n) {
    if (n <= 0 || p.hp >= p.hpMax) return 0;
    const d = Math.min(n, p.hpMax - p.hp); p.hp += d;
    SK.num(G, p.x, p.y - 26, '+' + d, '#6bff6b');
    return d;
  }
  function healFx(G, p) { fx(G, 'effect_health_skill', p.x, p.y - 2, { follow: p, dy: -2, layer: 'ground' }); }
  // Đạn người chơi bắn từ kỹ năng (cùng dạng G.bullets của actors.js).
  function shoot(G, p, x, y, ang, o) {
    const spd = (o.speed || 16) * U;
    const b = Object.assign({ side: 'p', kind: 'pb', x, y, h: Math.max(2, p.y - y), vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, ang,
      dmg: o.dmg, crit: false, repel: o.repel == null ? 1 : o.repel, r: o.r || 2, life: o.life || 1.6, sprite: o.sprite, hit: o.hit, pierce: o.pierce || 0 }, o.extra || {});
    if (o.critChance != null && SK.rand() * 100 < o.critChance) { b.crit = true; b.dmg = b.dmg * R.critMult; }
    G.bullets.push(b);
    return b;
  }

  // ---------------------------------------------------------------- tia sét (dựng lại prefab `thunder` / `lightning_chain_fx`)
  // [ĐO thunder] RGPointLaser: nút `img` = khung effect02_* xoay −90°, dày 1.5 đơn vị × 0.25 → thân tia 24 px kéo từ `head`
  // tới `end`; hai đầu là light_01 cộng sáng màu (0.353, 0.598, 1). Runtime SK.vfx không kéo giãn được nên vẽ ở đây.
  const BOLT_C = [0.3529, 0.5984, 1, 1];
  const boltFrames = () => (XS['^effect02_[0-9]+$'] || []).filter(n => /^effect02_[0-3]$/.test(n));
  function drawBolt(ctx, x0, y0, x1, y1, t, a) {
    const fr = boltFrames(), L = Math.hypot(x1 - x0, y1 - y0);
    ctx.save(); ctx.globalAlpha *= a == null ? 1 : a;
    glow(ctx, x0, y0, 16, BOLT_C, 0.6); glow(ctx, x1, y1, 16, BOLT_C, 0.6);
    const f = fr.length && SK.frame(fr[Math.floor(t * 30) % fr.length]);
    if (f) {
      ctx.translate(x0, y0); ctx.rotate(Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2);
      // Khung dọc 16×64: sau khi xoay, trục dài của khung chạy theo đoạn nối.
      const img = SK.pages[f[0]];
      if (img) ctx.drawImage(img, f[1], f[2], f[3], f[4], -12, -L, 24, L);
    }
    ctx.restore();
  }
  function boltProp(G, from, to, dur) {
    G.props.push({
      x: 0, y: 1e9, t: 0,
      update(G2, q, dt) { q.t += dt; if (q.t >= dur) q.gone = true; },
      draw(ctx, G2, q) {
        const a = typeof from === 'function' ? from() : from, b = typeof to === 'function' ? to() : to;
        if (a && b) drawBolt(ctx, a[0], a[1], b[0], b[1], q.t, 1 - q.t / dur);
      }
    });
  }

  // ---------------------------------------------------------------- hiệu ứng trạng thái lên quái [ĐO common.ab Buff*]
  // fire: BuffFire (elementalType 1) 3 sát thương / 0.5 s trong 2 s; ice: BuffIce đóng băng 2.75 s; ele: BuffElectric 1 s;
  // poison: BuffPoison (elementalType 4) 2 / 0.5 s trong 5 s; nightmare: BuffNightmare 10 s; gas1..3: BulletGasBuff1..3.
  const DEBUFF = {
    fire: () => ({ t: MB('buff_fire', 'BuffFire', 'buff_time', 2, v => v.elementalType === 1), dmg: MB('buff_fire', 'BuffFire', 'enemyDamage', 3, v => v.elementalType === 1), every: MB('buff_fire', 'BuffFire', 'enemyInterval', 0.5, v => v.elementalType === 1), fx: 'buff_fire' }),
    poison: () => ({ t: MB('buff_posion', 'BuffPoison', 'buff_time', 5, v => v.elementalType === 4), dmg: MB('buff_posion', 'BuffPoison', 'enemyDamage', 2, v => v.elementalType === 4), every: MB('buff_posion', 'BuffPoison', 'enemyInterval', 0.5, v => v.elementalType === 4), fx: 'buff_posion' }),
    ice: () => ({ t: MB('buff_ice', 'BuffIce', 'buff_time', 2.75, v => v.elementalType === 2), freeze: true, fx: 'buff_ice' }),
    ele: () => ({ t: MB('buff_ele', 'BuffElectric', 'buff_time', 1), freeze: true, fx: 'buff_ele' }),
    dizzy: () => ({ t: 2, freeze: true, fx: 'fx_buff_dizzy' }),   // [WIKI] choáng ~2 giây
    plague: () => ({ t: MB('buff_plague', 'BuffPlague', 'buff_time', 6), dmg: MB('buff_posion', 'BuffPoison', 'enemyDamage', 2, v => v.elementalType === 4), every: 0.5, fx: 'buff_plague' }),
    gas1: () => ({ t: MB('buff_gas_1', 'BulletGasBuff1', 'buff_time', 6), dmg: MB('buff_gas_1', 'BulletGasBuff1', 'damage', 1), every: MB('buff_gas_1', 'BulletGasBuff1', 'damageInterval', 1), fx: 'buff_gas_1' }),
    gas2: () => ({ t: MB('buff_gas_2', 'BulletGasBuff2', 'buff_time', 4), dmg: MB('buff_gas_2', 'BulletGasBuff2', 'damage', 2), every: MB('buff_gas_2', 'BulletGasBuff2', 'damageInterval', 1), slow: 0.5, fx: 'buff_gas_2' }),
    // Khí của Nhà Giả Kim: ChangeSpeed("gas", −0.8) trong speedDownTime 2 s mỗi đòn [ĐO BulletGas / BulletGasEnhance].
    gasSlow: () => ({ t: 2, slow: 0.2, fx: null }),
    gas3: () => ({ t: MB('buff_gas_3', 'BulletGasBuff3', 'buff_time', 2), dmg: MB('buff_gas_3', 'BulletGasBuff3', 'damage', 3), every: MB('buff_gas_3', 'BulletGasBuff3', 'damageInterval', 1), slow: 0.5, infect: MB('buff_gas_3', 'BulletGasBuff3', 'infect_radius', 3) * U, fx: 'buff_gas_3' })
  };
  function debuff(G, e, kind, o) {
    if (!alive(e)) return null;
    const d = Object.assign(DEBUFF[kind](), o || {});
    const s = (e._db = e._db || {});
    const cur = s[kind];
    if (cur && cur.t >= d.t) return cur;
    const b = cur || { tick: d.every || 0 };
    Object.assign(b, d, { t: d.t, kind });
    s[kind] = b;
    if (d.freeze) stun(e, d.t);
    if (d.slow) e.moveMul = d.slow;
    const hy = (e.hb.off[1]) * e.scale;
    // Còn hiệu ứng cùng loại đang chạy thì kéo dài đời nó thay vì sinh lại (tránh nháy).
    if (b.h && G.vfx && G.vfx.indexOf(b.h) >= 0 && !b.h.stopped) b.h.life = b.h.t + d.t;
    else b.h = hasVfx(d.fx) ? SK.vfx.spawn(G, d.fx, e.x, e.y, { follow: e, dy: -hy, dur: d.t }) : null;
    if (kind === 'poison' || kind.indexOf('gas') === 0) e._psn = b;
    return b;
  }
  function debuffTick(G, e, dt) {
    const s = e._db;
    for (const k in s) {
      const b = s[k];
      if (!alive(e)) { if (b.h && b.h.kill) b.h.kill(); delete s[k]; continue; }
      b.t -= dt;
      if (b.every) {
        b.tick -= dt;
        if (b.tick <= 0) {
          b.tick += b.every;
          G._skHit = 'dot';
          SK.hurtEnemy(G, e, b.dmg, false, 0, 0);
          G._skHit = null;
          if (b.infect) for (const q of inRadius(G, e.x, e.y, b.infect)) if (q !== e && !(q._db && q._db.gas1)) debuff(G, q, 'gas1');
        }
      }
      if (b.t <= 0) {
        if (b.h && b.h.stop) b.h.stop();
        if (b.slow) e.moveMul = 1;
        if (e._psn === b) e._psn = null;
        delete s[k];
      }
    }
  }

  // ---------------------------------------------------------------- đồng minh (thú, bản sao, tháp): nhận đạn địch
  // a = {x, y, hp, hpMax, box:[w, h, dy], update(G,a,dt), draw(ctx,G,a), dead?, down?}
  function allies(G) { return (G._allies = (G._allies || []).filter(a => !a.gone)); }
  function addAlly(G, a) {
    a.t = a.t || 0; a.flash = 0;
    const pr = {
      x: a.x, y: a.y, ally: a,
      update(G2, q, dt) {
        a.t += dt; a.flash = Math.max(0, a.flash - dt);
        if (a.update) a.update(G2, a, dt);
        if (!a.down && !a.gone && a.box) {
          const [w, h, dy] = a.box;
          for (const b of G2.bullets) {
            if (b.side !== 'e' || b.dead) continue;
            if (Math.abs(b.x - a.x) < w / 2 + b.r && Math.abs(b.y - (a.y - dy)) < h / 2 + b.r) {
              b.dead = true; a.hp -= b.dmg || 1; a.flash = 0.08;
              if (a.hp <= 0 && a.onZero) a.onZero(G2, a);
            }
          }
        }
        q.x = a.x; q.y = a.y;
        if (a.gone) q.gone = true;
      },
      draw(ctx, G2) { a.draw(ctx, G2, a); }
    };
    G.props.push(pr);
    allies(G).push(a);
    return a;
  }
  function hpBar(ctx, a, dy, color) {
    if (a.hp >= a.hpMax && !a.down) return;
    const w = 14, x = Math.round(a.x - w / 2), y = Math.round(a.y - dy);
    ctx.fillStyle = '#300'; ctx.fillRect(x, y, w, 2);
    ctx.fillStyle = a.down ? '#e03c3c' : (color || '#3cb4e0'); ctx.fillRect(x, y, Math.round(w * Math.max(0, a.hp) / a.hpMax), 2);
  }
  // Đi về phía (tx, ty) với tốc độ px/s, tránh tường như người chơi.
  function walk(G, a, tx, ty, spd, dt) {
    const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
    if (d < 1) return 0;
    const s = Math.min(d, spd * dt);
    SK.moveBox(G.map, a, dx / d * s, dy / d * s, 4);
    if (Math.abs(dx) > 1) a.face = dx > 0 ? 1 : -1;
    return d;
  }

  // ---------------------------------------------------------------- lớp trạng thái chung (prop vô hình mỗi màn)
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
          chargeTick(G2, p, dt);
          passiveTick(G2, p, dt);
          for (const k in timers) timers[k](G2, p, dt);
        }
        for (const e of G2.enemies) {
          if (e._stunT > 0) e._stunT = e.st === 'stun' && alive(e) ? e._stunT - dt : 0;
          if (e._db) debuffTick(G2, e, dt);
        }
      },
      draw(ctx, G2) {
        const dz = SK.prefab('fx_buff_dizzy'), dzf = dz && dz.find(p => p.f);
        for (const e of G2.enemies) {
          if (!alive(e) || !(e._stunT > 0) || (e._db && (e._db.ice || e._db.ele || e._db.dizzy))) continue;
          if (dzf) SK.draw(ctx, dzf.f, e.x, enemyTop(e) - 6);
        }
        const p = G2.player;
        if (p && p._night > 0) {
          // skill_assassin_night: màn đêm xanh sẫm [ĐO màu prefab]; sprite 34×46 phóng lên cả màn thì vỡ hạt nên chỉ lấy màu.
          const v = SK.view, cam = G2.view || { x: p.x - v.w / 2, y: p.y - v.h / 2 };
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
  const timers = {};   // cập nhật mỗi bước ngoài thời lượng kỹ năng (nạp lượt, trạng thái sau kỹ năng...)

  // ---------------------------------------------------------------- kỹ năng nhiều lượt (maxCount > 0) [ĐO config/skills]
  // Lượt hồi từng cái một theo cd, đồng hồ về 0 sau mỗi lượt [ĐO RoleAttributePlayer.SkillReload]; hết lượt thì nút hiện
  // thời gian chờ lượt kế.
  function charges(p, id) {
    const c = cfg(p, id);
    const max = c.max || 1;
    if (!p._ch || p._ch.id !== id) p._ch = { id, n: max, max, t: 0, cd: c.cd || p.h.skill.cd };
    return p._ch;
  }
  function useCharge(p, id, all) {
    const ch = charges(p, id);
    const n = all ? ch.n : 1;
    ch.n -= n;
    // Còn lượt thì bấm lại được ngay khi kỹ năng trước xong: RoleSkillStart chỉ chặn lúc skillCasting [ĐO RGController.RoleSkillStart].
    p._cdAfter = ch.n > 0 ? 0 : ch.cd - ch.t;
    return n;
  }
  function chargeTick(G, p, dt) {
    const ch = p._ch;
    if (!ch || !p.h.skill || p.h.skill.id !== ch.id) return;
    if (ch.n < ch.max) {
      ch.t += dt;
      if (ch.t >= ch.cd) { ch.t = 0; ch.n++; }
      if (ch.n <= 0 && !(p.skillT > 0)) p.skillCd = Math.max(0.01, ch.cd - ch.t);
    }
    if (ch.n > 0 && !(p.skillT > 0) && p.skillCd > 0) p.skillCd = 0;
  }
  SK.on('hud', (ctx, G) => {
    const p = G.player, ch = p && p._ch;
    if (!ch || !p.h.skill || p.h.skill.id !== ch.id || G.state !== 'stage') return;
    const v = SK.view, cx = v.w - 16, cy = v.h - 17;   // nút kỹ năng của hud.js
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(cx - 14, cy + 5, 9, 8);
    SK.text(ctx, String(ch.n), cx - 9.5, cy + 9, 8, ch.n ? '#ffe06a' : '#8a95a8', 'center', '#000');
  });

  const S = SK.SKILLS;
  const icon = n => firstFrame('sicon_' + n) || firstFrame('icon_skill' + String(n).replace('ui_skill', ''));
  // Biểu tượng thật của mọi kỹ năng [ĐO config/skills icon.sprite]; gán sau khi đăng ký.
  function iconFor(id) {
    const s = S86(); if (!s) return null;
    for (const f in s.heroes) { const k = s.heroes[f].skills.find(x => x.id === id); if (k && k.icon) return firstFrame('sicon_' + k.icon); }
    return null;
  }

  // ================================================================ HIỆP SĨ (c00)
  // Tay thứ hai bắn trễ 0.1 s sau tay chính (Invoke "Hand2Atk" 0.1, "Hand3Atk" 0.2) [ĐO C01Controller.RoleAtk].
  const HAND2 = 0.1;
  // Song Thủ [ĐO c00/skill 1: cd 10, duration 5, prefab effect_c1_skill, tiếng fx_skill_c1]: cầm thêm bản sao vũ khí.
  S.dual_wield = {
    endOnSwap: true,
    start(G, p) {
      layer(G);
      p.skillT = cfg(p, 'dual_wield').dur || 5;
      p.dual = SK.makeWeapon(p.weapons[p.cur].id); p.dual.cd = HAND2;
      fx(G, 'effect_c1_skill', p.x, p.y, { follow: p, dur: 0.5 });
    },
    end(G, p) { p.dual = null; }
  };
  // Hỏa Lực Toàn Diện [ĐO c00/skill 2: cd 10, duration 5]: dùng cùng lúc mọi vũ khí đang mang (web: hai ô).
  S.superior_fire = {
    start(G, p) {
      layer(G);
      p.skillT = cfg(p, 'superior_fire').dur || 5;
      const o = p.weapons[1 - p.cur];
      p.dual = SK.makeWeapon((o || p.weapons[p.cur]).id); p.dual.cd = HAND2;
      fx(G, 'effect_c1_skill', p.x, p.y, { follow: p, dur: 0.5 });
    },
    update(G, p) {
      const o = p.weapons[1 - p.cur] || p.weapons[p.cur];
      if (p.dual && o && p.dual.id !== o.id) { p.dual = SK.makeWeapon(o.id); p.dual.cd = HAND2; }
    },
    end(G, p) { p.dual = null; }
  };
  // Đả Kích Hỗn Độn [ĐO c00/skill 3: cd 8, duration 5; C01Controller.ChaosBulletCreated gắn effect_chaos
  // (BuffRandomEffectTrigger possibility 100) vào mọi viên đạn tạo ra trong lúc kỹ năng]: viên trúng quái rút một kết quả
  // theo trọng số (tổng 111) trong serializationData của effect_chaos [ĐO work/skills/mb/common.json].
  const CHAOS = [
    [10, 'poison'], [7, 'ele'], [10, 'fire'], [10, 'lightning'], [7, 'ice'],
    [10, 'explode_s_hit_enemy'], [10, 'explode_hit_enemy'], [10, 'explode_poly'], [10, 'explode_energy'], [10, 'explode_energy2'],
    [7, 'Fire2'], [7, 'Gas2'], [3, 'bullet_frost']
  ];
  // Số của các prefab kết quả [ĐO common.json]; bán kính nổ explode_hit_enemy 48 px [ĐO collider sk-data], các vụ nổ kia
  // không có collider trong sk-data nên dùng cùng 48 px [ƯỚC LƯỢNG].
  const BOOM_R = 48;
  const CHAOS_BOOM = {
    explode_s_hit_enemy: { dmg: 8, fire: 15 }, explode_hit_enemy: { dmg: 8, fire: 50 },
    explode_energy: { dmg: 5, fire: 0 }, explode_energy2: { dmg: 8, fire: 0 }
  };
  const CHAOS_POOL = {
    Fire2: { vfx: 'Fire2', r: 3, dmg: 2, every: 0.5, dur: 6 },                                    // BulletFire; thời lượng [WIKI]
    Gas2: { vfx: 'Gas2', r: 3, dmg: 2, every: 1, dur: 3, slow: true },                             // BulletGas
    bullet_frost: { vfx: 'bullet_frost', r: 3, dmg: 1, every: 0.5, dur: 5, buff: 'ice', chance: 100 }  // BulletFrost
  };
  // buff_lightning = BuffElectrification: 6 s, mỗi 0.4 s phóng điện sang tối đa 3 quái trong 10 đơn vị, 3 sát thương.
  const ELECTRO = { t: 6, every: 0.4, n: 3, range: 10 * U, dmg: 3 };
  function chaosRoll(G, p, e) {
    let r = SK.rand() * 111, k = CHAOS[0][1];
    for (const [w, n] of CHAOS) { if (r < w) { k = n; break; } r -= w; }
    const [x, y] = ec(e);
    if (DEBUFF[k]) return debuff(G, e, k);
    if (CHAOS_BOOM[k]) {
      const b = CHAOS_BOOM[k];
      fx(G, k, x, y, {});
      for (const t of inRadius(G, x, y, BOOM_R)) { hit(G, p, t, b.dmg, { repel: 3, tag: 'chaos' }); if (SK.rand() * 100 < b.fire) debuff(G, t, 'fire'); }
      return;
    }
    if (CHAOS_POOL[k]) return dmgPool(G, p, x, e.y, CHAOS_POOL[k]);
    if (k === 'explode_poly') {
      // BulletPolymerization hoá cừu (delay 0.8); web chưa có quái cừu nên cho đứng yên — thời gian hoá cừu nằm ở prefab
      // cừu, không có trong dump [ƯỚC LƯỢNG 3 s].
      fx(G, 'explode_poly', x, y, {});
      return stun(e, 3);
    }
    // lightning
    let t = 0, tick = 0;
    G.props.push({ x: 0, y: -1e9, draw() {},
      update(G2, q, dt) {
        t += dt; tick -= dt;
        if (t > ELECTRO.t || !alive(e)) { q.gone = true; return; }
        if (tick > 0) return;
        tick = ELECTRO.every;
        const from = ec(e), got = [];
        for (let i = 0; i < ELECTRO.n; i++) {
          const n = nearest(G2, from[0], from[1], ELECTRO.range, { skip: q2 => q2 === e || got.indexOf(q2) >= 0 });
          if (!n) break;
          got.push(n); boltProp(G2, from, ec(n), 0.2);
          hit(G2, p, n, ELECTRO.dmg, { noMul: true, crit: false, tag: 'chaos' });
        }
      } });
  }
  S.chaotic_strike = {
    start(G, p) {
      layer(G);
      p.skillT = cfg(p, 'chaotic_strike').dur || 5;
      p._chaos = true;
      fx(G, 'effect_c1_skill', p.x, p.y, { follow: p, dur: 0.5, tint: [0.8, 0.5, 1, 1] });
    },
    end(G, p) { p._chaos = false; }
  };
  SK.on('enemyHit', (G, e) => {
    const p = G.player;
    if (!p || !p._chaos || G._skHit || !G._hitBullet) return;
    chaosRoll(G, p, e);
  });

  // ================================================================ KẺ LÃNG DU (c01)
  // Lộn Nhào [ĐO c01/skill 1: cd 2.5; C02Controller.RoleSkill0]: lăn theo hướng đang đi 0.4 s, bỏ qua phím di chuyển
  // (forceLerp 1), vẫn bắn được; miễn sát thương 0.5 s (StartHitTrigger), dài hơn cú lăn.
  // Vận tốc [ĐO GetForce(move_dir, 20) + ma sát "C02Skill0" 0.8 + 0.15 → × 0.95 mỗi bước 0.02 s (RGController.SetVelocity)]:
  // 20 đơn vị/s giảm dần, cả cú lăn ≈ 5.13 đơn vị; RoleSkillEnd0 gọi GetForce(…, 0) nên dừng hẳn ở 0.4 s.
  const ROLL = { t: 0.4, v0: 20 * U, decay: 0.95, step: 0.02, immune: 0.5 };
    S.dodge = {
    start(G, p) {
      layer(G);
      p.skillT = ROLL.t;
      const mv = I.moveVec();
      p._roll = { ang: Math.hypot(mv.x, mv.y) > 0.1 ? Math.atan2(mv.y, mv.x) : (p.face > 0 ? 0 : Math.PI), t: 0 };
      if (Math.abs(Math.cos(p._roll.ang)) > 0.1) p.face = Math.cos(p._roll.ang) > 0 ? 1 : -1;
      ghost(p, true);
      hurtMods(p).dodge = () => 0;
      swapAnims(p, pngAnim('rogue_roll'));
      ripFx(G, 'effect_ranger_roll', p.x, p.y, { ground: true, flip: p.face < 0, dur: 0.34 });
    },
    update(G, p, dt) {
      const r = p._roll; if (!r) return;
      r.t += dt;
      // Huỷ phần đi bộ của lượt này: lúc lăn phím di chuyển không có tác dụng.
      const mv = I.moveVec(), walkPx = p.h.speed * U * (p.speedMul || 1) * (p.moveMul || 1) * dt;
      const spd = ROLL.v0 * CTRL('ranger', 'rollSpeed', 1) * Math.pow(ROLL.decay, r.t / ROLL.step) * dt;
      SK.moveBox(G.map, p, Math.cos(r.ang) * spd - mv.x * walkPx, Math.sin(r.ang) * spd - mv.y * walkPx, p.h.body.r);
    },
    end(G, p) {
      p._roll = null; delete hurtMods(p).dodge; swapAnims(p, null);
      p._immuneT = ROLL.immune - ROLL.t; hurtMods(p).after = () => 0;
    }
  };
  // Bạt Đao [ĐO c01/skill 2: cd 3 mỗi lượt, maxCount 3; C02Controller.RoleSkill1]: lướt thẳng tới quái (không có thì theo
  // hướng mặt) 10 đơn vị hoặc tới tường, trong 0.15 s (CustomTweener.MoveTo); miễn sát thương 0.4 s; kỹ năng xong ở 0.2 s.
  // Vệt chém skill_slash phóng theo quãng / 9 (BulletInfo.SetBulletSize), 8 sát thương (ProcessSkillDamage 8), đẩy lùi 2.
  // Vệt chém: collider skill_slash hộp 144 × 24 px ở cỡ 1 [ĐO sk-data], phóng theo quãng / 9 đơn vị như hình.
  const IAIDO = { dist: 10 * U, move: 0.15, t: 0.2, immune: 0.4, dmg: 8, repel: 2, slashLen: 144, w: 24 };
  S.iaido = {
    start(G, p) {
      layer(G);
      charges(p, 'iaido'); useCharge(p, 'iaido');
      const { ang } = targetAng(G, p, IAIDO.dist);
      p.skillT = IAIDO.t;
      p._iaido = { ang, x0: p.x, y0: p.y, v: IAIDO.dist / IAIDO.move, t: 0 };
      if (Math.abs(Math.cos(ang)) > 0.1) p.face = Math.cos(ang) > 0 ? 1 : -1;
      ghost(p, true); hurtMods(p).iaido = () => 0;
    },
    update(G, p, dt) {
      const s = p._iaido; if (!s) return;
      const mv = I.moveVec(), walkPx = p.h.speed * U * (p.moveMul || 1) * dt;
      const go = Math.max(0, Math.min(dt, IAIDO.move - s.t)); s.t += dt;
      SK.moveBox(G.map, p, Math.cos(s.ang) * s.v * go - mv.x * walkPx, Math.sin(s.ang) * s.v * go - mv.y * walkPx, p.h.body.r);
    },
    end(G, p) {
      const s = p._iaido; p._iaido = null;
      delete hurtMods(p).iaido;
      p._immuneT = IAIDO.immune - IAIDO.t; hurtMods(p).after = () => 0;
      if (!s) return;
      // Vệt chém thật (skill_slash) dọc đường lướt; trúng mọi quái nằm trong dải rộng IAIDO.w.
      const L = Math.hypot(p.x - s.x0, p.y - s.y0), c = Math.cos(s.ang), sn = Math.sin(s.ang);
      for (const e of G.enemies) {
        if (!alive(e)) continue;
        const [x, y] = ec(e), dx = x - s.x0, dy = y - (s.y0 - 7);
        const u = dx * c + dy * sn, v = -dx * sn + dy * c;
        if (u > -8 && u < L + 8 && Math.abs(v) < IAIDO.w * Math.max(0.2, L / IAIDO.slashLen) / 2 + e.r) hit(G, p, e, IAIDO.dmg, { critChance: p.crit, ang: s.ang, repel: IAIDO.repel, fx: 'hit_blue2' });
      }
      const mx = (s.x0 + p.x) / 2, my = (s.y0 + p.y) / 2 - 7;
      ripFx(G, 'skill_slash', mx, my, { top: true, rot: c < 0 ? s.ang + Math.PI : s.ang, flip: c < 0, scale: Math.max(0.2, L / IAIDO.slashLen), dur: 0.3 });
      G.shake = Math.max(G.shake, 2);
    }
  };

  // ================================================================ PHÙ THUỶ (c02)
  // Sét Đánh [ĐO c02/skill 1: cd 6; C03Controller.RoleSkill0 Invoke("CreateThunder", 0.4); thunder BulletThunder max_count 4,
  // dizzy_rate 70]: sét đánh con gần nhất trong 14 đơn vị có tầm nhìn (CircleRayCaster.Cast 14), không có thì không phóng;
  // nhảy tối đa 4 lần sang con gần nhất chưa trúng trong 10 đơn vị (FindNextTarget CircleCastAll 10, không xét tường), mỗi
  // 0.15 s (findTargetInterval). Mỗi tia 8 sát thương: StartThunder ghi đè atk của prefab bằng ProcessSkillDamage(8);
  // 70% gây điện (Random < dizzy_rate → CreateEleBuff), rung màn 3 (Skill0Attack).
  const LS = { jumpRange: 10 * U, range: 14 * U, delay: 0.4, gap: 0.15, dmg: 8, shake: 3 };
  S.lightning_strike = {
    start(G, p) {
      layer(G);
      const jumps = MB('thunder', 'BulletThunder', 'max_count', 4), dz = MB('thunder', 'BulletThunder', 'dizzy_rate', 70);
      fx(G, 'effect_c3_skill', p.x, p.y, { follow: p, layer: 'ground' });
      const chain = [];
      let t = 0;
      G.props.push({
        x: 0, y: -1e9, draw() {},
        update(G2, q, dt) {
          t += dt;
          if (t < LS.delay + chain.length * LS.gap) return;
          const prev = chain[chain.length - 1];
          const e = prev ? nearest(G2, ec(prev)[0], ec(prev)[1], LS.jumpRange, { skip: x => chain.indexOf(x) >= 0 })
            : nearest(G2, p.x, p.y - 6, LS.range, { los: true });
          if (!e) { q.gone = true; return; }
          chain.push(e);
          const [x, y] = ec(e);
          // Tia đầu từ trời xuống, các tia sau nối từ quái trước.
          boltProp(G2, prev ? ec(prev) : [x, y - 150], [x, y], 0.3);
          hit(G2, p, e, LS.dmg, { repel: 1, fx: 'hit_blue' });
          if (SK.rand() * 100 < dz) debuff(G2, e, 'ele');
          G2.shake = Math.max(G2.shake, LS.shake);
          if (chain.length > jumps) q.gone = true;
        }
      });
    }
  };
  // Băng Xuyên [ĐO c02/skill 2: cd 6; C03Controller.CreatingIceWall(1, 6 + level/3); explode_ice_box: ExplodeIceBox damage 6,
  // repel 3, buff_ice]: chờ 0.35 s rồi cứ 0.1 s dựng một hộp băng cách 1.5 đơn vị (hộp i ở 1.5·(i+1)), 6 hộp = 9 đơn vị;
  // gây 6 sát thương (ProcessSkillDamage 6) + đóng băng, chặn đạn, vỡ sau 1 s (SetBrokenDelayTime 1).
  const FROST = { n: 6, step: 1.5 * U, life: 1, lead: 0.35, gap: 0.1, hitR: 12.8 };   // hitR: collider explode_ice_box r 12.8, lệch 8 [ĐO sk-data]
  S.piercing_frost = {
    start(G, p) {
      layer(G);
      const { ang } = targetAng(G, p);
      const dmg = MB('explode_ice_box', 'ExplodeIceBox', 'damage', 6), rep = MB('explode_ice_box', 'ExplodeIceBox', 'repel', 3);
      const hitSet = [], x0 = p.x, y0 = p.y;
      for (let i = 0; i < FROST.n; i++) {
        const d = (i + 1) * FROST.step, x = x0 + Math.cos(ang) * d, y = y0 + Math.sin(ang) * d;
        G.props.push({
          x, y, t: -(FROST.lead + i * FROST.gap), fx: null,
          update(G2, q, dt) {
            const t0 = q.t; q.t += dt;
            if (t0 < 0 && q.t >= 0) {
              q.fx = fx(G2, 'explode_ice_box', x, y, { dur: FROST.life, state: 'explode_ice_box_start' });
              for (const e of inRadius(G2, x, y - 8, FROST.hitR)) if (hitSet.indexOf(e) < 0) { hitSet.push(e); hit(G2, p, e, dmg, { repel: rep, ang, fx: 'hit_blue' }); debuff(G2, e, 'ice'); }
            }
            if (q.t < 0) return;
            for (const b of G2.bullets) if (b.side === 'e' && !b.dead && Math.abs(b.x - x) < 10 && Math.abs(b.y - (y - 8)) < 12) b.dead = true;
            if (q.t > FROST.life) q.gone = true;
          },
          draw() {}
        });
      }
    }
  };
  // Bão Lửa [ĐO c02/skill 3: cd 4.5 mỗi lượt, maxCount 6; C03Controller.RoleSkill2 + BulletFireStorm.<Moving>]: dùng hết
  // lượt, mỗi lượt một cầu lửa (góc đầu 360/n·i) quay quanh điểm (0, 0.5) của người 257.143°/s, bán kính nở 6 đơn vị/s tới
  // 5 đơn vị; sau 4 s thu nhỏ 0.75, bán kính co −10 đơn vị/s và mất khi về trong 0.5 đơn vị (DetectingBack). Kỹ năng
  // đang chạy suốt 4 s (RoleSkillEnd lúc hết). Mỗi cầu 3 sát thương, chí mạng 20, đẩy 3 (DamageInfo.SetUp(3, 20, 3)),
  // xuyên quái; cháy 100% (bullet_fire_storm BuffEffectTrigger.probability 100). Nhịp trúng lại cùng quái không có trong
  // BulletFireStorm [ƯỚC LƯỢNG 0.3 s]; không có thành phần phá đạn địch.
  const STORM = { life: 4, spin: SK.deg(257.143), grow: 6 * U, rMax: 5 * U, back: 10 * U, home: 0.5 * U, dy: 0.5 * U,
    dmg: 3, crit: 20, repel: 3, burn: 100, every: 0.3, hitR: 12 };   // hitR: collider bullet_fire_storm r 12 px [ĐO sk-data]
  S.firestorm = {
    start(G, p) {
      layer(G);
      charges(p, 'firestorm');
      const n = useCharge(p, 'firestorm', true);
      p.skillT = STORM.life;
      const balls = [];
      for (let i = 0; i < n; i++) {
        const b = { a: i / n * Math.PI * 2, r: 0, x: p.x, y: p.y - STORM.dy, hit: new Map(), done: false };
        b.h = fx(G, 'bullet_fire_storm', b.x, b.y, { follow: b, dur: STORM.life + 1 });
        balls.push(b);
      }
      G.props.push({
        x: 0, y: -1e9, t: 0, draw() {},
        update(G2, q, dt) {
          q.t += dt;
          const back = q.t > STORM.life;
          for (const b of balls) {
            if (b.done) continue;
            b.a += STORM.spin * dt;
            b.r = back ? b.r - STORM.back * dt : Math.min(STORM.rMax, b.r + STORM.grow * dt);
            if (back && b.r <= STORM.home) { b.done = true; stopFx(b.h); continue; }
            b.x = p.x + Math.cos(b.a) * b.r; b.y = p.y - STORM.dy + Math.sin(b.a) * b.r;
            if (b.h && b.h.scale != null && back) b.h.scale = 0.75;
            for (const e of G2.enemies) {
              if (!alive(e) || (b.hit.get(e) || 0) > q.t) continue;
              const [cx, cy] = ec(e);
              if (Math.hypot(cx - b.x, cy - b.y) < STORM.hitR + e.r) {
                b.hit.set(e, q.t + STORM.every);
                hit(G2, p, e, STORM.dmg, { critChance: STORM.crit, repel: STORM.repel, fx: 'hit_red' });
                if (SK.rand() * 100 < STORM.burn) debuff(G2, e, 'fire');
              }
            }
          }
          if (balls.every(b => b.done)) q.gone = true;
        }
      });
    }
  };

  // ================================================================ SÁT THỦ (c03)
  // Lưỡi Kiếm Bóng Tối [ĐO c03/skill 1: cd 10, args "4"; C04Controller.RoleSkill0 / AutoLock / AtkCut / IncreaseSkill0Combo /
  // ProcessSkill0Kill / EndSkillEffect; sword_2_5_assassin + c03_trail]: 1.5 s chạy +100% tốc (addSpeedRate 1), miễn sát
  // thương cả 1.5 s tính từ lúc bấm (StartHitTrigger 1.5), không lướt. Một nhát chém mỗi lần: bấm bắn (RoleAtk → AtkCut) hoặc
  // tự chém khi quái cách dưới 2 đơn vị (AutoLock); trước nhát chém vũ khí bị khoá, sau đó bắn thường. Nhát chém =
  // ProcessSkillDamage(5 tay [heroHandAbilities[3]] + 3 + 4 × combo), chí mạng 30, đẩy 2. Mỗi lần bấm combo +1 (tối đa 5,
  // về 0 sau 5 s không bấm — Invoke ResetCombo 5): +5 chí mạng, +0.1 tốc chạy mỗi bậc. Hạ quái trong kỹ năng khi combo < 5
  // thì làm mới hồi chiêu và kết thúc (RefreshSkillCd) → tối đa 4 lần. Chém trúng trùm (một lần mỗi nhát): hồi chiêu
  // giảm một nửa phần còn lại (DecreaseSkillCooldown 0.5).
  const DB = { dur: 1.5, move: 1, hand: 5, base: 3, perCombo: 4, crit: 30, repel: 2, auto: 2 * U, comboMax: 5, comboT: 5, comboCrit: 5, comboMove: 0.1 };
  function asCombo(p, add) {
    const c = p._asCombo || (p._asCombo = { n: 0, t: 0, crit: 0 });
    c.n = Math.min(DB.comboMax, c.n + add); c.t = DB.comboT;
    p.crit = (p.crit || 0) - c.crit + DB.comboCrit * c.n; c.crit = DB.comboCrit * c.n;
    return c.n;
  }
  timers.asCombo = (G, p, dt) => {
    const c = p._asCombo; if (!c || c.n <= 0) return;
    c.t -= dt;
    if (c.t <= 0) { p.crit -= c.crit; c.crit = 0; c.n = 0; setMul(p, 'moveMul', 'db_combo', 1); }
  };
  S.dark_blade = {
    start(G, p) {
      layer(G);
      p.skillT = DB.dur;
      const combo = asCombo(p, 1);
      p._db = { t: 0, slashed: false, trail: [], trailT: 0, combo };
      p.noFire = true;
      setMul(p, 'moveMul', 'db_combo', 1); setMul(p, 'moveMul', 'dark_blade', 1 + DB.move + DB.comboMove * combo);
      ghost(p, true); hurtMods(p).dark_blade = () => 0;
      p._night = DB.dur;
      p._db.h = fx(G, 'c03_trail', p.x, p.y, { follow: p, dur: DB.dur });
      if (!G._dbTrail || G.props.indexOf(G._dbTrail) < 0) G.props.push(G._dbTrail = trailProp(p));
    },
    update(G, p, dt) {
      const s = p._db; if (!s) return;
      s.t += dt;
      s.trailT -= dt;
      if (s.trailT <= 0) { s.trailT = 0.035; s.trail.push({ x: p.x, y: p.y, f: SK.animFrame(p.moving ? p.anims.run : p.anims.idle, p.t), flip: p.face < 0, t: 0 }); }
      if (!s.slashed) {
        const e = nearest(G, p.x, p.y - 7, DB.auto);
        if (I.down('attack') || e) { darkSlash(G, p, s, e); p.noFire = false; }
      }
    },
    end(G, p) {
      const s = p._db; p._db = null;
      p.noFire = false;
      setMul(p, 'moveMul', 'dark_blade', 1);
      setMul(p, 'moveMul', 'db_combo', 1 + DB.comboMove * (p._asCombo ? p._asCombo.n : 0));
      delete hurtMods(p).dark_blade;
      p._night = Math.min(p._night || 0, 0.3);
      // Kết thúc sớm (hạ quái) thì phần miễn sát thương còn lại của 1.5 s vẫn giữ.
      if (s && s.t < DB.dur - 0.02) { p._immuneT = DB.dur - s.t; hurtMods(p).after = () => 0; } else ghost(p, false);
      if (s && s.killed) p._cdAfter = 0;
      if (s) stopFx(s.h);
    }
  };
  function darkSlash(G, p, s, e) {
    s.slashed = true;
    const ang = e ? Math.atan2(ec(e)[1] - (p.y - 7), e.x - p.x) : p.aim;
    const cx = p.x + Math.cos(ang) * 14, cy = p.y - 7 + Math.sin(ang) * 14;
    const dmg = DB.hand + DB.base + DB.perCombo * s.combo;
    let boss = false;
    // Hộp chém của sword_dash: 3.8 × 1.16 đơn vị [ĐO], xoay theo hướng chém.
    const hw = 3.8 * U / 2, hh = 1.16 * U / 2 + 4;
    for (const t of G.enemies) {
      if (!alive(t)) continue;
      const [x, y] = ec(t), dx = x - cx, dy = y - cy;
      const u = dx * Math.cos(ang) + dy * Math.sin(ang), v = -dx * Math.sin(ang) + dy * Math.cos(ang);
      if (Math.abs(u) < hw + t.r && Math.abs(v) < hh + t.r) {
        hit(G, p, t, dmg, { critChance: DB.crit + (p.crit || 0), ang, repel: DB.repel, fx: 'hit_assassin', tag: 'dark_blade' });
        if (t.boss && !boss) { boss = true; p._cdAfter = p.h.skill.cd / 2; }
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
  SK.on('enemyKill', G => { const p = G.player, s = p && p._db; if (s && s.combo < DB.comboMax) { s.killed = true; p.skillT = Math.min(p.skillT, 1e-4); } });
  SK.on('stageEnter', G => { const p = G.player; if (p) p._night = 0; });
  // Tàng Hình [ĐO c03/skill 3: cd 6, duration 6 = skillInfo.maxTime; C04Controller.RoleSkill2; buff_stealth BuffStealth
  // alpha 0.297, BuffSetting destroyWhenAct; BulletStrength; skill_assassin_night]: tàng hình tới hết giờ hoặc tới khi tấn
  // công / dùng kỹ năng (OnAttack, OnSkill, OnSpecial). Đạn của lượt bắn phá tàng hình được cường hoá: sát thương ×1.5
  // (0.5 + 0.5·cấp/15), chí mạng +100 (chắc chắn), cỡ +1. Đồng minh trong 14 đơn vị cũng tàng hình (web một người chơi).
  const INVIS = { alpha: 0.297, dmg: 1.5, size: 2 };
  S.invisibility = {
    start(G, p) {
      layer(G);
      p.skillT = cfg(p, 'invisibility').dur || 6;
      p.hidden = true; p._alpha = INVIS.alpha;
      p._asInvis = true;
      p._night = 0.6;
      fx(G, 'c03_show_effect_s0', p.x, p.y, {});
    },
    press(G, p) { p.skillT = 0; },
    end(G, p) { p._asInvis = false; if (!(p._asCast > 0)) { p.hidden = false; p._alpha = null; } }
  };
  SK.on('fire', (G, p) => {
    if (p._asCast > 0) p._asCast = 1e-4;   // tàng hình lúc gọi phân thân cũng mất khi tấn công (destroyWhenAct)
    if (!p._asInvis) return;
    for (const b of G.bullets) {
      if (b.side !== 'p' || b._seen || b.vis) continue;
      b.dmg *= INVIS.dmg;
      if (!b.crit) { b.crit = true; b.dmg *= R.critMult; }
      b.r = (b.r || 2) * INVIS.size;
    }
    p.skillT = Math.min(p.skillT, 1e-4);
  });
  // Phân Thân [ĐO c03/skill 2: cd 9; C04Controller.RoleSkill1 / CreatePhantom / TrimPhantoms / ApplyPhantomCastStealthBuff;
  // AssassinPhantomSkillController; npc_char_phantom PhantomSplitProcessor damageFactor 0.5]: lúc bấm người chơi tàng hình
  // 1 s và +0.2 tốc chạy (phantomCastInvisibleDuration / phantomCastMoveSpeedBonus); sau 0.8 s (skin0.delayCreatePhantom)
  // gọi một bản sao (tối đa 1, thay bản cũ) máu = 3 × (máu + giáp tối đa), cầm vũ khí đang dùng, đạn 50% sát thương.
  // Bản sao tự dùng Lưỡi Kiếm Bóng Tối (hồi 12 s, làm mới 1 lần khi hạ quái) và Tàng Hình (hồi 8 s, đạn 1 s sau được cường
  // hoá như Tàng Hình); lần đầu gặp quái 20% mở bằng Tàng Hình.
  const PH = { castStealth: 1, castMove: 0.2, sk0: 12, sk2: 8, firstStealth: 20, strong: 1, refresh: 1 };
  S.doppelg_nger = {
    start(G, p) {
      layer(G);
      const delay = (cfg(p, 'doppelg_nger').skin0 || {}).delayCreatePhantom || 0.8;
      fx(G, 'c03_show_effect_s0', p.x, p.y, {});
      p._asCast = PH.castStealth; p.hidden = true; p._alpha = INVIS.alpha;
      setMul(p, 'moveMul', 'as_phantom', 1 + PH.castMove);
      const x = p.x, y = p.y;
      G.props.push({ x, y: -1e9, t: 0, draw() {},
        update(G2, q, dt) { q.t += dt; if (q.t >= delay) { q.gone = true; spawnPhantom(G2, p, x - 14 * p.face, y + 4); } } });
    }
  };
  timers.asCast = (G, p, dt) => {
    if (!(p._asCast > 0)) return;
    p._asCast -= dt;
    if (p._asCast <= 0) { setMul(p, 'moveMul', 'as_phantom', 1); if (!p._asInvis) { p.hidden = false; p._alpha = null; } }
  };
  function spawnPhantom(G, p, x, y) {
    for (const a of allies(G)) if (a.phantom) { a.gone = true; }
    const hpMax = CTRL('assassin', 'phantomHpRatio', 3) * (p.hpMax + p.armorMax);
    const k = MB('npc_char_phantom', 'PhantomSplitProcessor', 'damageFactor', 0.5);
    const w = p.weapons[p.cur], d = w && w.def;
    addAlly(G, {
      phantom: true, x, y, hp: hpMax, hpMax, face: p.face, box: [10, 14, 8], cd: 0.5, aim: 0, moving: false,
      sk0: 0, sk2: 0, first: true, blade: null, hidden: false, strongT: 0, combo: 0, comboT: 0, refresh: PH.refresh,
      onZero(G2, a) { a.gone = true; fx(G2, 'c03_show_effect_s0', a.x, a.y, {}); },
      update(G2, a, dt) {
        a.sk0 -= dt; a.sk2 -= dt; a.strongT -= dt; a.comboT -= dt;
        if (a.comboT <= 0) a.combo = 0;
        const e = nearest(G2, a.x, a.y - 7, 12 * T, { los: true });
        if (a.blade) return phantomBlade(G2, p, a, dt, k);
        if (e && (a.sk0 <= 0 || a.sk2 <= 0)) {
          const stealth = a.first ? SK.rand() * 100 < PH.firstStealth : a.sk0 > 0 || (a.sk2 <= 0 && SK.rand() < 0.5);
          a.first = false;
          if (stealth && a.sk2 <= 0) { a.sk2 = PH.sk2; a.hidden = true; fx(G2, 'c03_show_effect_s0', a.x, a.y, {}); }
          else if (a.sk0 <= 0) { a.sk0 = PH.sk0; a.combo = Math.min(DB.comboMax, a.combo + 1); a.comboT = DB.comboT; a.blade = { t: 0, e }; return; }
        }
        // Giữ khoảng 2..4 ô với chủ; có quái thì đứng bắn [ƯỚC LƯỢNG theo min/max_follow_distance 2/20 của NpcMercenaryController].
        const dp = Math.hypot(p.x - a.x, p.y - a.y);
        a.moving = false;
        if (dp > 20 * U) { a.x = p.x; a.y = p.y; } else if (dp > 4 * T || (!e && dp > 2 * T)) { walk(G2, a, p.x, p.y, 6 * U, dt); a.moving = true; }
        a.cd -= dt;
        if (e) {
          const [cx, cy] = ec(e); a.aim = Math.atan2(cy - (a.y - 7), cx - a.x); a.face = Math.cos(a.aim) >= 0 ? 1 : -1;
          if (a.cd <= 0 && d) {
            a.cd = 1 / (d.rps || 2);
            if (a.hidden) { a.hidden = false; a.strongT = PH.strong; }
            const strong = a.strongT > 0, n = d.pellets || 1;
            for (let i = 0; i < n; i++) {
              const b = shoot(G2, p, a.x + Math.cos(a.aim) * 8, a.y - 7 + Math.sin(a.aim) * 8, a.aim + SK.deg(SK.randf(-(d.spread || 0) / 2, (d.spread || 0) / 2)),
                { dmg: Math.max(1, Math.round((d.dmg || 3) * k * (strong ? INVIS.dmg : 1))), speed: d.bulletSpeed || 16, sprite: d.bullet, hit: d.hit, critChance: strong ? 100 : (d.crit || 0) + p.crit });
              if (strong) b.r = (b.r || 2) * INVIS.size;
            }
          }
        }
      },
      draw(ctx, G2, a) {
        const key = a.moving || a.blade ? p.anims.run : p.anims.idle, fr = SK.animFrame(key, a.t);
        ctx.save(); ctx.globalAlpha *= a.hidden ? INVIS.alpha : 0.75;
        if (fr) SK.drawTinted(ctx, fr, a.x, a.y, [0.12, 0.1, 0.2, 1], { flip: a.face < 0, pages: a.flash > 0 ? SK.pagesWhite : null });
        if (d && d.sprite && !a.blade) SK.drawGun(ctx, d.sprite, a.x + 3 * a.face, a.y - 6, a.aim, null, {});
        ctx.restore();
        hpBar(ctx, a, 22);
      }
    });
  }
  // Lưỡi Kiếm của bản sao: lao tối đa 1.5 s với tốc ×2 tới mục tiêu, chém khi còn dưới 2 đơn vị (sát thương như của người
  // chơi × damageFactor — hệ số này áp cho nhát chém là [ƯỚC LƯỢNG]).
  function phantomBlade(G, p, a, dt, k) {
    const s = a.blade; s.t += dt;
    const e = alive(s.e) ? s.e : nearest(G, a.x, a.y - 7, 12 * T);
    if (!e || s.t > DB.dur) { a.blade = null; return; }
    const [cx, cy] = ec(e);
    a.moving = true;
    if (Math.hypot(cx - a.x, cy - (a.y - 7)) > DB.auto) { walk(G, a, cx, cy + 7, 6 * U * (1 + DB.move), dt); return; }
    const ang = Math.atan2(cy - (a.y - 7), cx - a.x), left = Math.cos(ang) < 0;
    hit(G, p, e, Math.max(1, Math.round((DB.hand + DB.base + DB.perCombo * a.combo) * k)), { critChance: DB.crit, ang, repel: DB.repel, fx: 'hit_assassin', tag: 'phantom' });
    ripFx(G, 'sword_dash', a.x, a.y - 7, { top: true, rot: left ? ang + Math.PI : ang, flip: left, dur: 0.36 });
    if (!alive(e) && a.refresh > 0) { a.refresh--; a.sk0 = 0; }
    a.blade = null;
  }

  // ================================================================ NHÀ GIẢ KIM (c04)
  // Bom Khí [ĐO c04/skill 1: cd 6; C05Controller.RoleSkill0; bullet_bottle_0_enhance: Bullet01 destroy_time 5, rotate_angle 20,
  // can_rebound 1 → Gas_Hit_Enemy_enhance: BulletGasEnhance damage_radius 3, duration 6, buff_gas_1..3]: chai bay 24 đơn vị/s
  // (BulletInfo.SetUp ghi đè speed 10 của prefab), nảy khi chạm tường, vỡ khi chạm quái hoặc hết 5 s. Khí nhịp 0.1 s
  // (hit_invert), cứ 5 nhịp một đòn (normal_hit_count 5) = 2 sát thương mỗi 0.5 s (ProcessSkillDamage 2), mỗi đòn làm chậm
  // 80% trong 2 s (ChangeSpeed "gas" −0.8, speedDownTime 2). Ở trong khí cộng dồn thời gian; đủ duration/3 = 2 s thì lên
  // tầng độc gas1 → gas2 → gas3 (BulletGasEnhance.CheckBuff, buff_time_slot) [ĐO BulletGasBuff1..3].
  const GAS = { speed: 24 * U, every: 0.5, tier: 2 };
  S.gas_grenade = {
    start(G, p) {
      layer(G);
      const { ang } = targetAng(G, p);
      const hy = p.y - 6;
      throwBottle(G, p, p.x + Math.cos(ang) * 6, hy + Math.sin(ang) * 6, ang, {
        speed: GAS.speed, life: MB('bullet_bottle_0_enhance', 'Bullet01', 'destroy_time', 5), bounce: true,
        sprite: 'bullet_48', spin: MB('bullet_bottle_0_enhance', 'Bullet01', 'rotate_angle', 20),
        land: (G2, x, y) => { fx(G2, 'explode_poison', x, y - 4, {}); gasPool(G2, p, x, y); }
      });
    }
  };
  // Chai bay thẳng (Bullet01) hoặc parabol (BulletParabola gravity/y_speed): vỡ khi chạm quái (bay thẳng), khi chạm tường
  // (trừ chai nảy), khi rơi xuống đất (parabol), hoặc khi hết đời (chai nảy).
  function throwBottle(G, p, x, y, ang, o) {
    let dx = Math.cos(ang), dy = Math.sin(ang);
    const pr = {
      x, y, bx: x, by: y, h: 6, t: 0, spin: 0, z: 0, vz: o.vz || 0,
      update(G2, q, dt) {
        q.t += dt; q.spin += dt * (o.spin || 20) * 0.6;
        if (q.t > o.life) { q.gone = true; if (o.bounce) o.land(G2, q.bx, q.by + q.h); return; }
        if (o.vz) { q.vz -= o.grav * dt; q.z += q.vz * dt; if (q.z <= 0 && q.t > 0.05) { q.gone = true; o.land(G2, q.bx, q.by + q.h); return; } }
        const n = 4;
        for (let i = 0; i < n; i++) {
          const nx = q.bx + dx * o.speed * dt / n, ny = q.by + dy * o.speed * dt / n;
          const wall = W.solidAt(G2.map, nx, ny + q.h);
          const e = !o.vz && G2.enemies.find(t => { if (!alive(t)) return false; const [cx, cy] = ec(t); return Math.abs(nx - cx) < t.hb.size[0] * t.scale / 2 + 2 && Math.abs(ny - cy) < t.hb.size[1] * t.scale / 2 + 2; });
          if (wall && o.bounce && !e) {
            if (W.solidAt(G2.map, nx, q.by + q.h)) dx = -dx;
            if (W.solidAt(G2.map, q.bx, ny + q.h)) dy = -dy;
            if (!W.solidAt(G2.map, nx, q.by + q.h) && !W.solidAt(G2.map, q.bx, ny + q.h)) { dx = -dx; dy = -dy; }
            break;
          }
          if (wall || e) {
            const px = wall ? q.bx : nx, py = (wall ? q.by : ny) + q.h;
            const ob = wall && W.obstacleAt(G2.map, nx, ny + q.h);
            if (ob && ob.kind === 'box') SK.hitObstacle(G2, ob, 1);
            q.gone = true; o.land(G2, px, py); return;
          }
          q.bx = nx; q.by = ny;
        }
        q.x = q.bx; q.y = q.by + q.h;
      },
      draw(ctx, G2, q) {
        ctx.save(); ctx.globalAlpha = 0.3; ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(q.bx, q.by + q.h, 3, 1.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        SK.draw(ctx, o.sprite, q.bx, q.by - q.z, { rot: q.spin });
      }
    };
    G.props.push(pr);
    return pr;
  }
  function gasPool(G, p, x, y) {
    const R0 = MB('Gas_Hit_Enemy_enhance', 'BulletGasEnhance', 'damage_radius', 3) * U;
    const dur = MB('Gas_Hit_Enemy_enhance', 'BulletGasEnhance', 'duration', 6);
    const dmg = MB('Gas_Hit_Enemy_enhance', 'BulletGasEnhance', 'damage', 2);
    const h = fx(G, hasVfx('Gas_Hit_Enemy_enhance') ? 'Gas_Hit_Enemy_enhance' : 'Gas_Hit_Enemy', x, y, { dur, layer: 'ground' });
    const soak = new Map();
    G.props.push({
      x, y: -1e9, t: 0, tick: 0, draw() {},
      update(G2, q, dt) {
        q.t += dt; q.tick -= dt;
        if (q.t >= dur) { stopFx(h); q.gone = true; return; }
        const inside = inRadius(G2, x, y, R0, R0 * 0.62);
        for (const e of inside) {
          const s = (soak.get(e) || 0) + dt; soak.set(e, s);
          const lvl = s < GAS.tier ? 'gas1' : s < 2 * GAS.tier ? 'gas2' : 'gas3';
          if (!(e._db && e._db[lvl] && e._db[lvl].t > DEBUFF[lvl]().t - 0.5)) debuff(G2, e, lvl);
        }
        if (q.tick <= 0) { q.tick = GAS.every; for (const e of inside) { hit(G2, p, e, dmg, { noMul: true, crit: false, tag: 'gas' }); debuff(G2, e, 'gasSlow'); } }
      }
    });
  }
  // Bình Nguyên Tố [ĐO c04/skill 2: cd 4 mỗi lượt, maxCount 2 (lượt thật, RoleSkill1 không có mã đếm riêng);
  // C05Controller.RoleSkill1; bullet_botton_gas/explode/frost: BulletParabola gravity 35, y_speed 10]: ném lần lượt độc → lửa
  // → băng (bottleIndex theo skin0 gameObjectList), chai 15 đơn vị/s rơi đúng chỗ mục tiêu (SetTargetPosition), không có
  // mục tiêu thì bay 15 × 2·10/35 ≈ 8.6 đơn vị. Chai mang ProcessSkillDamage(8):
  // độc → explode_hit_enemy_gas (ExplodeDizzy, useParentInfo nên 8; độc 50%) + Gas_Hit_Enemy (BulletGas 1 / 0.5 s, r 3, 6 s,
  // buff null — không gây độc, chỉ làm chậm 80% 2 s mỗi đòn);
  // lửa → explode_hit_enemy (Explode 8, cháy 50%) + Fire2 (BulletFire 2 / 0.5 s, r 3; không tung cháy trong DoDamage);
  // băng → bullet_frost (BulletFrost 1 / 0.5 s, r 3, 5 s, đóng băng mỗi đòn — EnemyAddBuff không có Random).
  // Thời lượng vũng lửa không nằm trong mã (.ctor duration 0, do hoạt ảnh prefab) [WIKI 6 s].
  const POT = ['gas', 'explode', 'frost'];
  const POT_T = { speed: 15 * U, dmg: 8, fireDur: 6 };
  S.elemental_potions = {
    start(G, p) {
      layer(G);
      charges(p, 'elemental_potions'); useCharge(p, 'elemental_potions');
      const kind = POT[(p._potI = ((p._potI == null ? -1 : p._potI) + 1) % 3)];
      const { e, ang } = targetAng(G, p, 14 * T);
      const g = MB('bullet_botton_' + kind, 'BulletParabola', 'gravity', 35) * U, vz = MB('bullet_botton_' + kind, 'BulletParabola', 'y_speed', 10) * U;
      const flight = 2 * vz / g;
      const dist = e ? Math.hypot(ec(e)[0] - p.x, ec(e)[1] - p.y) : POT_T.speed * flight;
      const spr = 'skill_effect_8';
      throwBottle(G, p, p.x, p.y - 6, ang, { speed: dist / flight, life: 5, vz, grav: g, sprite: (SK.prefab('bullet_botton_' + kind) || []).map(q => q.f).find(Boolean) || spr, spin: 17,
        land: (G2, x, y) => potionPool(G2, p, kind, x, y) });
    }
  };
  // Vũng sát thương theo nhịp: o = {vfx, r (đơn vị), dmg, every, dur, buff, chance (% gây buff mỗi nhịp), slow}.
  function dmgPool(G, p, x, y, o) {
    const r0 = o.r * U;
    const h = fx(G, o.vfx, x, y, { dur: o.dur, layer: 'ground' });
    G.props.push({ x, y: -1e9, t: 0, tick: 0, draw() {},
      update(G2, q, dt) {
        q.t += dt; q.tick -= dt;
        if (q.t >= o.dur) { stopFx(h); q.gone = true; return; }
        if (q.tick > 0) return;
        q.tick = o.every;
        for (const e of inRadius(G2, x, y, r0, r0 * 0.62)) {
          hit(G2, p, e, o.dmg, { noMul: true, crit: false, tag: 'pool' });
          if (o.slow) debuff(G2, e, 'gasSlow');
          if (o.buff && SK.rand() * 100 < o.chance) debuff(G2, e, o.buff);
        }
      } });
  }
  const POOLS = {
    gas: () => ({ vfx: 'Gas_Hit_Enemy', r: MB('Gas_Hit_Enemy', 'BulletGas', 'damage_radius', 3), dmg: MB('Gas_Hit_Enemy', 'BulletGas', 'damage', 1), every: MB('Gas_Hit_Enemy', 'BulletGas', 'hit_invert', 0.5), dur: MB('Gas_Hit_Enemy', 'BulletGas', 'duration', 6), slow: true }),
    explode: () => ({ vfx: 'Fire2', r: MB('Fire2', 'BulletFire', 'circleCastRadius', 3), dmg: MB('Fire2', 'BulletFire', 'damage', 2), every: MB('Fire2', 'BulletFire', 'hitInterval', 0.5), dur: POT_T.fireDur }),
    frost: () => ({ vfx: 'bullet_frost', r: MB('bullet_frost', 'BulletFrost', 'damage_radius', 3), dmg: MB('bullet_frost', 'BulletFrost', 'damage', 1), every: MB('bullet_frost', 'BulletFrost', 'hit_invert', 0.5), dur: MB('bullet_frost', 'BulletFrost', 'duration', 5), buff: 'ice', chance: 100 })
  };
  function potionPool(G, p, kind, x, y) {
    if (kind === 'explode' || kind === 'gas') {
      const gas = kind === 'gas';
      fx(G, gas ? 'explode_hit_enemy_gas' : 'explode_hit_enemy', x, y - 4, {});
      const fr = gas ? MB('explode_hit_enemy_gas', 'ExplodeDizzy', 'fire_rate', 50) : MB('explode_hit_enemy', 'Explode', 'fire_rate', 50);
      // Bán kính nổ: collider explode_hit_enemy r 48 px [ĐO sk-data]; explode_hit_enemy_gas không có trong sk-data, lấy cùng số.
      for (const e of inRadius(G, x, y - 4, BOOM_R)) { hit(G, p, e, POT_T.dmg, { repel: 3 }); if (SK.rand() * 100 < fr) debuff(G, e, gas ? 'poison' : 'fire'); }
      G.shake = Math.max(G.shake, 3);
    }
    dmgPool(G, p, x, y, POOLS[kind]());
  }

  // ================================================================ KỸ SƯ (c05)
  // Tháp Súng [ĐO c05/skill 1: cd 9; C06Controller.battery_max_num 3; battery: RGBatteryController damage 3,
  // shoot_time 2, scout_rate 0.5, maxAngle 180, RoleAttribute max_hp 12, fadeDurTime 0.8; C06Controller.RoleSkill0,
  // RGBatteryController.Scout / ShootReflection, BatteryConfig..ctor]: đặt tháp tại chỗ, tối đa 3, sống 10 s (Invoke Dead,
  // destroyOverTime 10); dò quái trong 20 đơn vị có tầm nhìn, bắn liên tục `shoot_time` giây (Invoke StopShooting) rồi dò
  // lại sau `scout_rate`. Súng con Gun001 "img/h1/smg" đổi đạn thành bullet_12 tốc 40, lệch 8°. Nhịp bắn là của súng smg
  // (hoạt ảnh vũ khí, không có trong mã) [ƯỚC LƯỢNG 6 viên/s]; sát thương tới quái là 3 của RGBatteryController hay 2 của
  // bulletsInfo Gun001 thì chưa giải được — giữ 3.
  const GT = { life: 10, range: 20 * U, bulletSpeed: 40, dev: 8, rate: 6 };
  S.gun_turret = {
    start(G, p) {
      layer(G);
      const max = CTRL('engineer', 'battery_max_num', 3);
      const ts = allies(G).filter(a => a.turret && !a.gone);
      while (ts.length >= max) { const old = ts.shift(); old.die = true; }
      turret(G, p, p.x, p.y);
    }
  };
  function turret(G, p, x, y) {
    const pf = SK.prefab('battery') || [];
    const find = n => pf.find(q => q.n && q.n.endsWith(n));
    const body = find('/img/body'), dead = find('/body_dead'), gun = find('/w'), gp = find('/gun_point'), sh = find('/shadow');
    const hp = MB('battery', 'RoleAttribute', 'max_hp', 12), dmg = MB('battery', 'RGBatteryController', 'damage', 3);
    const pause = MB('battery', 'RGBatteryController', 'scout_rate', 0.5), burst = MB('battery', 'RGBatteryController', 'shoot_time', 2);
    const fade = MB('battery', 'RGBatteryController', 'fadeDurTime', 0.8);
    return addAlly(G, {
      turret: true, x, y, hp, hpMax: hp, box: [12.8, 16, 12.8], cd: 0.4, burstT: burst, ang: p.face > 0 ? 0 : Math.PI, fadeT: 0,
      onZero(G2, a) { a.die = true; },
      update(G2, a, dt) {
        if (a.die || a.t > GT.life || a.hp <= 0) {
          a.down = true; a.fadeT += dt;
          if (a.fadeT > fade) a.gone = true;
          return;
        }
        const e = nearest(G2, a.x, a.y - 10, GT.range, { los: true });
        if (e) { const [cx, cy] = ec(e); a.ang = Math.atan2(cy - (a.y - 10), cx - a.x); }
        a.cd -= dt;
        if (a.cd > 0) return;
        if (!e) { a.cd = 0.1; return; }
        const gx = gun ? gun.at[0] : 0, gy = gun ? gun.at[1] : 10;
        const tipL = gp ? Math.hypot(gp.at[0] - gx, gp.at[1] - gy) : 10;
        const mx = a.x + gx + Math.cos(a.ang) * tipL, my = a.y - gy + Math.sin(a.ang) * tipL;
        shoot(G2, p, mx, my, a.ang + SK.deg(SK.randf(-GT.dev / 2, GT.dev / 2)), { dmg, speed: GT.bulletSpeed, sprite: (SK.prefab('bullet_12') || []).map(q => q.f).find(f => f && !GLOW[f]) || 'bullet_1', hit: 'hit_orange', repel: 0.5 });
        SK.fx(G2, 'muzzle', mx, my, { ang: a.ang, dur: 0.05 });
        a.kick = 1.5;
        a.burstT -= 1 / GT.rate;
        if (a.burstT <= 0) { a.burstT = burst; a.cd = pause; } else a.cd = 1 / GT.rate / (p.rateMul || 1);
      },
      draw(ctx, G2, a) {
        const al = a.fadeT > 0 ? Math.max(0, 1 - a.fadeT / fade) : 1;
        const pop = Math.min(1, a.t / 0.15);
        ctx.save(); ctx.globalAlpha *= al;
        if (sh) SK.draw(ctx, sh.f, a.x + sh.at[0], a.y - sh.at[1] + 1, { alpha: 0.5 });
        const pages = a.flash > 0 ? SK.pagesWhite : null;
        const broken = a.down && a.hp <= 0;
        const bf = broken && dead ? dead : body;
        if (bf) SK.draw(ctx, bf.f, a.x + bf.at[0], a.y - bf.at[1], { pages, sy: pop });
        if (gun && !broken && pop >= 1) {
          const left = Math.cos(a.ang) < 0;
          a.kick = Math.max(0, (a.kick || 0) - 0.3);
          ctx.save(); ctx.translate(Math.round(a.x + gun.at[0]), Math.round(a.y - gun.at[1]));
          ctx.rotate(a.ang); if (left) ctx.scale(1, -1);
          SK.draw(ctx, gun.f, -(a.kick || 0), 0, { pages });
          ctx.restore();
        }
        if (!broken) hpBar(ctx, a, 22, '#3ce05a');
        ctx.restore();
      }
    });
  }
  // Tháp Chặn [ĐO c05/skill 3: cd 9; battery_intercept: RGInterceptBatteryController atk_cd 0.75, max_hp 15;
  // GunInterceptBattery: laser_point_line damage 3, repel 10; C06Controller.RoleSkill2, batteryData lvRange / lvHp /
  // batteryLifeTime cấp 0; RGInterceptBatteryController.FindTarget]: tối đa 1 tháp, sống 15 s; cùng một tầm 7 đơn vị: bắn
  // hạ viên đạn địch gần nhất trước, không có thì bắn quái. Năng lượng / nâng cấp (tên lửa, laser nổ, khiên; bấm cạnh tháp
  // để nâng bằng linh kiện qua EngineerSkillBtnManager) chưa làm.
  const ICP = { life: 15, range: 7 * U, atkRange: 7 * U };
  S.interceptor = {
    start(G, p) {
      layer(G);
      for (const a of allies(G)) if (a.intercept) a.die = true;
      const pf = SK.prefab('battery_intercept') || SK.prefab('battery') || [];
      const body = pf.find(q => q.n && /\/img\/body$/.test(q.n));
      const hp = MB('battery_intercept', 'RoleAttribute', 'max_hp', 15), cdT = MB('battery_intercept', 'RGInterceptBatteryController', 'atk_cd', 0.75);
      const dmg = 3;   // [ĐO GunInterceptBattery.bulletsInfo[0].damage]
      addAlly(G, {
        intercept: true, x: p.x, y: p.y, hp, hpMax: hp, box: [12, 16, 12], cd: 0.3, beam: null,
        onZero(G2, a) { a.die = true; },
        update(G2, a, dt) {
          if (a.die || a.t > ICP.life) { a.down = true; a.fadeT = (a.fadeT || 0) + dt; if (a.fadeT > 0.8) a.gone = true; return; }
          a.cd -= dt;
          if (a.beam) { a.beam.t -= dt; if (a.beam.t <= 0) a.beam = null; }
          if (a.cd > 0) return;
          const hx = a.x, hy = a.y - 14;
          let best = null, bd = ICP.range;
          for (const b of G2.bullets) { if (b.side !== 'e' || b.dead) continue; const d = Math.hypot(b.x - hx, b.y - hy); if (d < bd) { bd = d; best = b; } }
          if (best) { best.dead = true; a.beam = { x: best.x, y: best.y, t: 0.12 }; a.cd = cdT; fx(G2, 'hit_blue', best.x, best.y, { scale: 0.6 }); return; }
          const e = nearest(G2, hx, hy, ICP.atkRange, { los: true });
          if (e) { const [cx, cy] = ec(e); hit(G2, p, e, dmg, { repel: 1, fx: 'hit_blue' }); a.beam = { x: cx, y: cy, t: 0.12 }; a.cd = cdT; } else a.cd = 0.1;
        },
        draw(ctx, G2, a) {
          const al = a.fadeT ? Math.max(0, 1 - a.fadeT / 0.8) : Math.min(1, a.t / 0.15);
          ctx.save(); ctx.globalAlpha *= al;
          if (body) SK.draw(ctx, body.f, a.x + body.at[0], a.y - body.at[1], { pages: a.flash > 0 ? SK.pagesWhite : null });
          if (a.beam) drawBolt(ctx, a.x, a.y - 14, a.beam.x, a.beam.y, a.t, a.beam.t / 0.12);
          ctx.restore();
          if (!a.down) hpBar(ctx, a, 24, '#3ce05a');
        }
      });
    }
  };

  // ================================================================ MA CÀ RỒNG (c06)
  // Hút máu chung của Bầy Dơi và giọt máu của Xoáy Không Gian [ĐO C07Controller.BatBack(hasHit)]: cứ 3 lần về có cắn trúng
  // thì hồi 1 máu, hồi xong mà máu đầy thì +5 năng lượng. Hồi giáp (skill0RestoreArmorRate 33) chỉ có khi cường hoá.
  const BAT_BACK = { per: 3, hp: 1, energy: 5 };
  function vpBatBack(G, p) {
    p._vpBack = (p._vpBack || 0) + 1;
    if (p._vpBack % BAT_BACK.per) return;
    heal(G, p, BAT_BACK.hp);
    if (p.hp >= p.hpMax) { p.energy = Math.min(p.energyMax, p.energy + BAT_BACK.energy); SK.num(G, p.x, p.y - 26, '+' + BAT_BACK.energy, '#5ad0ff'); }
    healFx(G, p);
  }
  // Bầy Dơi [ĐO c06/skill 1: cd 8; C07Controller.get_batTotal / BatBack / RoleSkillEnd0; bullet_bat BulletBat damage 5,
  // BulletBat..ctor / Start / HandleState1; bat_particle]: 3 con dơi bay ra 6 đơn vị/s; sau 0.5 s (Invoke FindTarget) mỗi
  // con tìm quái trong 12 đơn vị, lái dần về nó (lệch > 5° thì góc bay += lệch × 0.1 mỗi bước 0.02 s), cắn khi cách dưới
  // 1 đơn vị rồi bay về chủ. Kỹ năng hết khi mọi con đã về; mỗi con không cắn trúng giảm hồi chiêu cd / (2 × 3).
  // Không tìm được quái thì bay về sau [ƯỚC LƯỢNG 4 s].
  const BS = { n: 3, range: 12 * U, speed: 6 * U, seek: 0.5, bite: 1 * U, steer: 0.1, step: 0.02, maxT: 4 };
  S.bat_swarm = {
    start(G, p) {
      layer(G);
      const bats = [];
      for (let i = 0; i < BS.n; i++) {
        const a = -Math.PI / 2 + (i - (BS.n - 1) / 2) * 0.7;
        bats.push({ x: p.x, y: p.y - 10, ang: a, tgt: null, st: 'out', t: 0, ph: SK.rand() * 2, hitOk: false });
      }
      p._bats = { bats, dmg: MB('bullet_bat', 'BulletBat', 'damage', 5) };
      p.skillT = 1e4;
      G.props.push(batProp(p));
      fx(G, 'bat_particle', p.x, p.y - 10, {});
    },
    update(G, p) {
      const s = p._bats; if (!s) return;
      if (s.bats.every(b => b.st === 'home')) p.skillT = 0;
    },
    end(G, p) {
      const s = p._bats; p._bats = null;
      if (!s) return;
      const miss = s.bats.filter(b => !b.hitOk).length;
      p._cdAfter = p.h.skill.cd * (1 - miss / (2 * BS.n));
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
          let tx = null, ty = null;
          if (b.st === 'out' && b.t >= BS.seek) {
            if (!b.tgt || !alive(b.tgt)) b.tgt = nearest(G, b.x, b.y, BS.range);
            if (!b.tgt || b.t > BS.maxT) b.st = 'back';
            else [tx, ty] = ec(b.tgt);
          }
          if (b.st === 'back') { tx = p.x; ty = p.y - 10; }
          if (tx != null) {
            let d = Math.atan2(ty - b.y, tx - b.x) - b.ang;
            while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
            if (Math.abs(d) > SK.deg(5)) b.ang += d * (1 - Math.pow(1 - BS.steer, dt / BS.step));
          }
          b.x += Math.cos(b.ang) * BS.speed * dt; b.y += Math.sin(b.ang) * BS.speed * dt;
          const dist = tx == null ? 1e9 : Math.hypot(tx - b.x, ty - b.y);
          if (b.st === 'out' && dist < BS.bite) {
            hit(G, p, b.tgt, s.dmg, { noMul: true, crit: false, repel: 0.5, fx: 'hit_red' });
            b.hitOk = true; b.st = 'back';
          } else if (b.st === 'back' && dist < BS.bite) {
            b.st = 'home';
            if (b.hitOk) vpBatBack(G, p);
          }
        }
      },
      draw(ctx, G, q) {
        const s = p._bats; if (!s) return;
        for (const b of s.bats) {
          if (b.st === 'home') continue;
          const fr = batFrame(b.t + b.ph);
          if (fr) SK.draw(ctx, fr, b.x, b.y, { flip: Math.cos(b.ang) < 0 });
        }
      }
    };
  }
  // Xoáy Không Gian [ĐO c06/skill 2: cd 11; C07Controller.RoleSkill1; bullet_209 Bullet04 (rate 0.04, speed_value 0.725,
  // min_speed 1) + RGBTCreate explodeDelay 0.4 → bullet_84_blood: BloodHoleTrigger damage 2, radius 3, interval 1,
  // ClearBullets, OnMakeDamage → BloodDot]: viên bay 38 đơn vị/s, cứ 0.04 s nhân tốc 0.725 (tối thiểu 1), nổ sau 0.4 s hoặc
  // khi chạm quái thành hố đen gây sát thương 2.25 s (creationTime, hình tan lúc 3.25 s): 2 sát thương mỗi 1 s trong 3 đơn
  // vị, xoá đạn trong 0.75 đơn vị quanh tâm; mỗi đòn trên mỗi quái bắn một giọt máu về chủ, về tới thì tính như một con dơi
  // về có cắn (BatBack). Lực hút quái / đạn không có trong mã (có lẽ PointEffector2D, không có trong dump) [ƯỚC LƯỢNG 60];
  // tốc giọt máu chưa lần ra [ƯỚC LƯỢNG 8 đơn vị/s].
  const SWIRL = { speed: 38 * U, rate: 0.04, k: 0.725, min: 1 * U, boom: 0.4, life: 2.25, show: 3.25, clear: 0.75 * U, pull: 60, dot: 8 * U };
  S.alien_swirl = {
    start(G, p) {
      layer(G);
      const { ang } = targetAng(G, p);
      const spr = (SK.prefab('bullet_209') || []).map(q => q.f).find(f => f && !GLOW[f]) || 'bullet_7';
      const b = { x: p.x + Math.cos(ang) * 8, y: p.y - 7 + Math.sin(ang) * 8, v: SWIRL.speed, slowT: 0 };
      G.props.push({ x: b.x, y: 1e9, t: 0,
        update(G2, q, dt) {
          q.t += dt; b.slowT += dt;
          while (b.slowT >= SWIRL.rate) { b.slowT -= SWIRL.rate; b.v = Math.max(SWIRL.min, b.v * SWIRL.k); }
          const nx = b.x + Math.cos(ang) * b.v * dt, ny = b.y + Math.sin(ang) * b.v * dt;
          const wall = W.solidAt(G2.map, nx, ny + 7);
          if (!wall) { b.x = nx; b.y = ny; }
          const e = G2.enemies.find(t => alive(t) && Math.hypot(ec(t)[0] - b.x, ec(t)[1] - b.y) < t.r + 5);
          if (q.t >= SWIRL.boom || e) { q.gone = true; blackHole(G2, p, b.x, b.y); }
        },
        draw(ctx) { glow(ctx, b.x, b.y, 8, [0.9, 0.1, 0.1, 0.4]); SK.draw(ctx, spr, b.x, b.y); } });
    }
  };
  function blackHole(G, p, x, y) {
    const r0 = MB('bullet_84_blood', 'BloodHoleTrigger@b', 'radius', 3) * U, dmg = MB('bullet_84_blood', 'BloodHoleTrigger@b', 'damage', 2), every = MB('bullet_84_blood', 'BloodHoleTrigger@b', 'interval', 1);
    const h = fx(G, 'bullet_84_blood', x, y, { dur: SWIRL.show });
    let tick = 0, t = 0;
    G.props.push({ x, y: -1e9, draw() {},
      update(G2, q, dt) {
        t += dt; tick -= dt;
        if (t > SWIRL.life) { q.gone = true; return; }
        for (const e of inRadius(G2, x, y, r0 * 1.3)) {
          if (e.boss) continue;
          const [cx, cy] = ec(e), d = Math.hypot(cx - x, cy - y) || 1;
          e.kx = (x - cx) / d * SWIRL.pull; e.ky = (y - cy) / d * SWIRL.pull;
        }
        for (const b of G2.bullets) {
          if (b.dead || b.vis) continue;
          const d = Math.hypot(b.x - x, b.y - y);
          if (d < r0) { if (d < SWIRL.clear) b.dead = true; else { b.vx += (x - b.x) / d * 600 * dt; b.vy += (y - b.y) / d * 600 * dt; } }
        }
        if (tick <= 0) {
          tick = every;
          for (const e of inRadius(G2, x, y, r0)) { hit(G2, p, e, dmg, { noMul: true, crit: false, fx: 'hit_red' }); bloodDot(G2, p, ec(e)[0], ec(e)[1]); }
        }
      } });
    // Hình hố còn tới 3.25 s rồi tắt.
    G.props.push({ x, y: -1e9, t: 0, draw() {}, update(G2, q, dt) { q.t += dt; if (q.t > SWIRL.show) { stopFx(h); q.gone = true; } } });
  }
  function bloodDot(G, p, x, y) {
    const d = { x, y };
    G.props.push({ x, y: 1e9,
      update(G2, q, dt) {
        const tx = p.x, ty = p.y - 8, L = Math.hypot(tx - d.x, ty - d.y);
        if (L < 6) { q.gone = true; vpBatBack(G2, p); return; }
        const s = Math.min(L, SWIRL.dot * dt); d.x += (tx - d.x) / L * s; d.y += (ty - d.y) / L * s;
      },
      draw(ctx) { glow(ctx, d.x, d.y, 5, [0.9, 0.05, 0.05, 0.5]); } });
  }
  // Bất Tử [ĐO c06/skill 3: cd 13, duration 3.5; C07Controller.AbsordDamage / AddMaxHp / RoleSkillEnd2; effect_vampire_body]:
  // sát thương nhận vào bị hấp thụ: máu chưa đầy thì hồi đúng lượng đó + 5 năng lượng mỗi điểm, đầy thì chỉ +5 năng lượng
  // mỗi điểm. Cứ 5 điểm hấp thụ (dồn qua các đòn) +1 máu tối đa, tối đa +10 (+cấp); hết kỹ năng thì trả lại ngay.
  const IMM = { perHp: 5, cap: 10, energy: 5 };
  S.immortal = {
    start(G, p) {
      layer(G);
      p.skillT = cfg(p, 'immortal').dur || 3.5;
      p._imm = { extra: 0, acc: 0, h: fx(G, 'effect_vampire_body', p.x, p.y, { follow: p, dur: p.skillT }) };
      hurtMods(p).immortal = (G2, pl, dmg) => {
        const s = pl._imm; if (!s) return dmg;
        if (pl.hp < pl.hpMax) heal(G2, pl, dmg);
        pl.energy = Math.min(pl.energyMax, pl.energy + IMM.energy * dmg);
        s.acc += dmg;
        while (s.acc >= IMM.perHp && s.extra < IMM.cap) { s.acc -= IMM.perHp; s.extra++; pl.hpMax++; SK.num(G2, pl.x, pl.y - 34, '+1', '#ff6bd0'); }
        pl.invulT = 0.3;
        return 0;
      };
    },
    end(G, p) {
      const s = p._imm; p._imm = null; delete hurtMods(p).immortal;
      if (!s) return;
      stopFx(s.h);
      p.hpMax -= s.extra; p.hp = Math.min(p.hp, p.hpMax);
    }
  };

  // ================================================================ HIỆP SĨ THÁNH (c07)
  // Khiên Năng Lượng [ĐO c07/skill 1: cd 12, duration 4; prefab shield: CircleCollider r 0.8 trên nút `root`, clip shield_ide
  // đặt root scale 4 → bán kính 3.2 đơn vị; C08Controller.RoleSkill0 SetProtectedFromDamage suốt maxTime 4 (+cấp/3)]: bong
  // bóng hút mọi sát thương, collider chặn đạn địch; hình khép lại 0.333 s sau khi hết (RoleSkillEnd0 → TryCloseShield).
  // Vòng hình của SK.vfx ở cỡ 1 nhỏ hơn collider một chút, phóng 1.2 cho khớp (chỉ là hình).
  const SHIELD = { close: 0.333 };
  S.energy_shield = {
    start(G, p) {
      layer(G);
      p.skillT = cfg(p, 'energy_shield').dur || 4;
      const r = 0.8 * 4 * U;
      hurtMods(p).shield = (G2, pl) => { pl._shieldHit = 0.15; return 0; };
      p._shield = { r, h: fx(G, 'shield', p.x, p.y - 8, { follow: p, dy: -8, scale: 1.2, dur: p.skillT + SHIELD.close }) };
      G.props.push({ x: p.x, y: 1e9, t: 0, draw() {},
        update(G2, q, dt) {
          q.t += dt;
          if (!(p.skillT > 0) || !p._shield) { q.gone = true; return; }
          const cy = p.y - 8;
          for (const b of G2.bullets) {
            if (b.side !== 'e' || b.dead) continue;
            if (Math.hypot(b.x - p.x, b.y - cy) < r + b.r) { b.dead = true; fx(G2, 'hit_blue', b.x, b.y, { scale: 0.6 }); }
          }
        } });
    },
    end(G, p) { delete hurtMods(p).shield; p._shield = null; }
  };

  // ================================================================ TIÊN TỘC (c08)
  // Bắn Tập Trung [ĐO c08/skill 1: cd 6 mỗi mũi, maxCount 3; C09Controller.RoleSkill0 / RoleAtk / ArrowShoot /
  // Skill0ExtraBulletProcess / KillSomeOne; bullet_c09 RGBTEnergy → explode_energy2, sizeFactor 2.5, damageFactor 0.5]:
  // bấm K vào thế ngắm — đứng yên, +25 chí mạng, cần di chuyển dùng để ngắm (không thì tự nhắm quái); nút bắn phóng mũi tên
  // đã nạp (mỗi mũi một lượt) thay cho vũ khí; bấm K lần nữa thì bắn mũi còn nạp rồi thôi ngắm, hết lượt cũng thôi.
  // Mũi tên 36 đơn vị/s, 8 sát thương (+ tầng/2), chí mạng 30, đẩy 3; nổ explode_energy2 × 0.5. Mũi thứ 3, 6, ...: sát
  // thương ×1.3, cỡ ×1.5. Đang ngắm mà hạ quái (bất kể nguồn): +3 năng lượng, cứ 3 lần hạ thêm 1 mũi (không quá tối đa).
  const FF = { speed: 36, dmg: 8, crit: 30, repel: 3, aimCrit: 25, bigDmg: 1.3, bigSize: 1.5, killEnergy: 3, killsPerArrow: 3 };
  S.focus_fire = {
    start(G, p) {
      layer(G);
      charges(p, 'focus_fire');
      p.skillT = 1e4;
      p._ffAim = { ang: targetAng(G, p).ang, kills: 0 };
      p.noFire = true;
      p.crit = (p.crit || 0) + FF.aimCrit;
      I.hit('attack');   // bỏ lần bấm bắn cũ còn đọng trước khi vào thế ngắm
    },
    update(G, p, dt) {
      const s = p._ffAim; if (!s) return;
      // Đứng yên: huỷ phần đi bộ; cần di chuyển chỉ để ngắm.
      const mv = I.moveVec(), walkPx = p.h.speed * U * (p.speedMul || 1) * (p.moveMul || 1) * dt;
      SK.moveBox(G.map, p, -mv.x * walkPx, -mv.y * walkPx, p.h.body.r);
      s.ang = Math.hypot(mv.x, mv.y) > 0.1 ? Math.atan2(mv.y, mv.x) : targetAng(G, p).ang;
      if (Math.abs(Math.cos(s.ang)) > 0.1) p.face = Math.cos(s.ang) > 0 ? 1 : -1;
      p._bow = { t: 0.1, ang: s.ang };
      if (I.hit('attack')) ffShoot(G, p, s.ang);
      if (charges(p, 'focus_fire').n <= 0) p.skillT = 0;
    },
    press(G, p) { const s = p._ffAim; if (s && charges(p, 'focus_fire').n > 0) ffShoot(G, p, s.ang); p.skillT = 0; },
    end(G, p) {
      p._ffAim = null; p.noFire = false;
      p.crit -= FF.aimCrit;
      p._bow = { t: 0.35, ang: p.aim };
    }
  };
  function ffShoot(G, p, ang) {
    useCharge(p, 'focus_fire');
    p._ffN = (p._ffN || 0) + 1;
    const big = p._ffN % 3 === 0;
    const x = p.x + Math.cos(ang) * 8, y = p.y - 7 + Math.sin(ang) * 8;
    const dmg = Math.round(FF.dmg * (big ? FF.bigDmg : 1)), sz = big ? FF.bigSize : 1;
    const exDmg = MB('explode_energy2', 'ExplodeEnergy', 'damage', 8) * MB('bullet_c09', 'RGBTEnergy@b', 'damageFactor', 0.5) * (big ? FF.bigDmg : 1);
    const exR = MB('bullet_c09', 'RGBTEnergy@b', 'sizeFactor', 2.5) * U * 0.5 * sz;
    const b = { x, y, ang, t: 0 };
    G.props.push({ x, y: 1e9,
      update(G2, q, dt) {
        b.t += dt;
        const n = 4;
        for (let i = 0; i < n && !q.gone; i++) {
          b.x += Math.cos(ang) * FF.speed * U * dt / n; b.y += Math.sin(ang) * FF.speed * U * dt / n;
          const e = G2.enemies.find(t => alive(t) && Math.hypot(ec(t)[0] - b.x, ec(t)[1] - b.y) < t.r + 4 * sz);
          if (e || W.solidAt(G2.map, b.x, b.y + 7) || b.t > 1.5) {
            q.gone = true;
            if (e) hit(G2, p, e, dmg, { critChance: FF.crit + (p.crit || 0), ang, repel: FF.repel, fx: 'hit_green', tag: 'arrow' });
            fx(G2, 'explode_energy2', b.x, b.y, { scale: sz });
            for (const t of inRadius(G2, b.x, b.y, exR)) if (t !== e) hit(G2, p, t, exDmg, { repel: 1, tag: 'arrow' });
          }
        }
      },
      draw(ctx) { drawRip(ctx, SK.prefab('bullet_c09'), b.x, b.y, { rot: ang, scale: sz }); } });
  }
  SK.on('enemyKill', G => {
    const p = G.player, s = p && p._ffAim;
    if (!s) return;
    p.energy = Math.min(p.energyMax, p.energy + FF.killEnergy);
    if (++s.kills % FF.killsPerArrow === 0) { const ch = charges(p, 'focus_fire'); if (ch.n < ch.max) ch.n++; }
  });
  // Mưa Tên [ĐO c08/skill 2: cd 9, duration 1.5; C09Controller.RoleSkill1 / UpdateSkill1Radius / CreatingArrowRain;
  // arrow_rain_up khi tụ, arrow_rain DelayExplode boom_time 0.375 → explode_energy2]: giữ K để tụ lực, thả thì bắn.
  // Mức tụ k = thời gian giữ / 1.5 (tối đa 1); số mũi = max(⌊k·15⌋, ⌊0.2·15⌋) = 3..15; bán kính 3 → 5 đơn vị theo k.
  // Sau 0.35 s rơi mỗi 0.04 s một mũi, ưu tiên quái trong vùng (lệch ngẫu nhiên) rồi điểm ngẫu nhiên; mỗi mũi 6 sát thương
  // (ProcessSkillDamage 6), đẩy 2, không chí mạng; vùng nổ × 1.8 (ProcessAoeRange). Tụ lực không làm chậm (không thấy trong
  // RoleSkillStart). Bán kính nổ gốc là collider của explode_energy2, không có trong dump [ƯỚC LƯỢNG 0.67 ô × 1.8].
  const RAIN = { full: 1.5, n: 15, minK: 0.2, r0: 3 * U, r1: 5 * U, lead: 0.35, gap: 0.04, dmg: 6, repel: 2, boomR: 1.2 * T };
  S.arrow_rain = {
    start(G, p) {
      layer(G);
      p.skillT = 1e4;
      p._rain = { t: 0, h: fx(G, 'arrow_rain_up', p.x, p.y - 12, { follow: p, dy: -12, dur: 30 }) };
      p._bow = { t: 30, ang: -Math.PI / 2 };
    },
    update(G, p, dt) {
      const s = p._rain; if (!s) return;
      s.t += dt;
      if (!I.down('skill')) p.skillT = 0;
    },
    end(G, p) {
      const s = p._rain; p._rain = null; p._bow = null;
      if (!s) return;
      stopFx(s.h);
      const k = Math.min(1, s.t / RAIN.full);
      const n = Math.max(Math.floor(k * RAIN.n), Math.floor(RAIN.minK * RAIN.n)), R0 = RAIN.r0 + (RAIN.r1 - RAIN.r0) * k;
      const { e } = targetAng(G, p);
      const cx = e ? ec(e)[0] : p.x + p.face * 5 * T, cy = e ? e.y : p.y;
      const boom = MB('arrow_rain', 'DelayExplode', 'boom_time', 0.375);
      const inside = inRadius(G, cx, cy, R0);
      for (let i = 0; i < n; i++) {
        const tg = inside[i % Math.max(1, inside.length)];
        const a = SK.rand() * Math.PI * 2, d = tg ? SK.rand() * 0.5 * T : Math.sqrt(SK.rand()) * R0;
        const x = (tg ? tg.x : cx) + Math.cos(a) * d, y = (tg ? tg.y : cy) + Math.sin(a) * d * 0.7;
        G.props.push({ x, y: -1e9, t: -(RAIN.lead + i * RAIN.gap), draw() {},
          update(G2, q, dt) {
            const t0 = q.t; q.t += dt;
            if (t0 < 0 && q.t >= 0) fx(G2, 'arrow_rain', x, y, { dur: boom + 0.1 });
            if (q.t >= boom) {
              q.gone = true;
              fx(G2, 'explode_energy2', x, y - 4, { scale: 0.6 });
              for (const t of inRadius(G2, x, y - 4, RAIN.boomR)) hit(G2, p, t, RAIN.dmg, { crit: false, repel: RAIN.repel });
            }
          } });
      }
    }
  };

  // ================================================================ NGƯỜI SÓI (c09)
  // Cuồng Hoá [ĐO c09/skill 1: cd 12; C10Controller.RoleSkill0 / Transfiguration / SkillAtk / HurtSomeOne; effect_c10_skill,
  // c10_skill_atk (RGSword + RGSwordTrigger hit_red)]: lúc bấm, máu < (tối đa+1)/2 thì hồi: dưới tối đa/4 → đầy, còn lại →
  // (tối đa+1)/2. Hoá sói sau 0.4 s (Invoke Transfiguration), sói sống 5 s, +0.3 tốc chạy, vũ khí bị cất (chỉ có vuốt).
  // Mỗi nhát vung (trúng hay trượt) +0.12 s; sát thương ⌈6 × 1.5⌉ × (2 − máu/tối đa) = 9..18, chí mạng (2 − máu/tối đa) × 50,
  // đẩy 3, tự lao GetForce(hướng, 30); cứ 3 nhát trúng +1 giáp. Tầm vuốt = collider c10_skill_atk r 32 px [ĐO sk-data]; nhịp/góc vung là của hoạt ảnh [ƯỚC LƯỢNG rps 3, 150°].
  const WB = { delay: 0.4, dur: 5, move: 1.3, dmg: 9, critK: 50, rps: 3, range: 32, arc: 150, extend: 0.12, lunge: 30 * U };
  // GetForce: vận tốc v giảm × 0.8 mỗi bước 0.02 s (ma sát mặc định RGBaseController..ctor 0.8).
  const FORCE = { decay: 0.8, step: 0.02 };
  const wwK = p => 2 - p.hp / p.hpMax;
  function wwPush(p, ang, v) { p._wwPush = { ang, v }; }
  timers.wwPush = (G, p, dt) => {
    const s = p._wwPush; if (!s) return;
    SK.moveBox(G.map, p, Math.cos(s.ang) * s.v * dt, Math.sin(s.ang) * s.v * dt, p.h.body.r);
    s.v *= Math.pow(FORCE.decay, dt / FORCE.step);
    if (s.v < 1) p._wwPush = null;
  };
  function wolfForm(G, p) {
    const claw = XS['^werewolf_0_skill_0_effect_1_[0-9]$'] || [];
    p._wolf = { t: 0, hits: 0, saved: p.weapons, cur: p.cur };
    // Vuốt là vũ khí cận chiến tạm; ghi vào DS.weapons (ẩn khỏi Object.keys để không lọt vào rương/cửa hàng).
    Object.defineProperty(DS.weapons, '_claw', { configurable: true, writable: true, enumerable: false,
      value: { name: 'Vuốt Sói', kind: 'melee', dmg: WB.dmg, cost: 0, crit: WB.critK, rps: WB.rps, range: WB.range, arc: WB.arc, repel: 3, sprite: claw[0] || null } });
    p.weapons = [SK.makeWeapon('_claw'), null];
    p.cur = 0;
    setMul(p, 'moveMul', 'berserk', WB.move);
    swapAnims(p, subAnim(pngAnim('werewolf_form'), 0, 8, 'wolf_idle'), subAnim(pngAnim('werewolf_form'), 8, 16, 'wolf_run'));
    fx(G, 'effect_c10_skill', p.x, p.y, { follow: p });
    fx(G, 'explode_poly_werewolf', p.x, p.y - 8, { dur: 0.45, scale: 0.6 });
  }
  function humanForm(G, p) {
    const s = p._wolf; p._wolf = null;
    if (s) {
      const got = p.weapons.filter(w => w && w.id !== '_claw');
      p.weapons = s.saved; p.cur = s.cur;
      for (const w of got) { if (!p.weapons[1]) p.weapons[1] = w; else G.items.push({ id: w.id, x: p.x, y: p.y + 4, t: 0 }); }
      G.items = G.items.filter(it => it.id !== '_claw');
      fx(G, 'explode_poly_werewolf', p.x, p.y - 8, { dur: 0.35, scale: 0.5 });
    }
    setMul(p, 'moveMul', 'berserk', 1);
    swapAnims(p, null);
  }
  S.berserk = {
    start(G, p) {
      layer(G);
      p.skillT = WB.delay + WB.dur;
      const half = Math.floor((p.hpMax + 1) / 2);
      if (p.hp < half) p.hp = p.hp < p.hpMax / 4 ? p.hpMax : half;
      p._wwMorph = WB.delay;
      p.noFire = true;
    },
    update(G, p, dt) {
      if (p._wwMorph > 0) { p._wwMorph -= dt; if (p._wwMorph <= 0) { wolfForm(G, p); p.noFire = false; } return; }
      if (!p._wolf) return;
      p._wolf.t += dt;
      // Sát thương/chí mạng của vuốt theo máu hiện tại.
      const k = wwK(p), w = p.weapons[p.cur];
      for (const d of [DS.weapons._claw, w && w.id === '_claw' && w.def]) if (d) { d.dmg = Math.ceil(WB.dmg * k); d.crit = WB.critK * k; }
    },
    end(G, p) { p._wwMorph = 0; p.noFire = false; humanForm(G, p); }
  };
  SK.on('enemyHit', (G, e) => {
    const p = G.player;
    if (!p || !p._wolf || G._skHit || !p.weapons[p.cur] || p.weapons[p.cur].id !== '_claw') return;
    p._wolf.hits++;
    if (p._wolf.hits % 3 === 0 && p.armor < p.armorMax) p.armor++;
  });
  // Mỗi nhát vung: vết cào thật (prefab sword_werewolf), +0.12 s, tự lao về hướng vung.
  SK.on('fire', (G, p, w) => {
    if (!p._wolf || w.id !== '_claw') return;
    const left = Math.cos(p.aim) < 0;
    fx(G, 'sword_werewolf', p.x + Math.cos(p.aim) * 10, p.y - 7 + Math.sin(p.aim) * 6, { ang: left ? p.aim + Math.PI : p.aim, flip: left, dur: 0.25 });
    if (p.h.skill.id === 'berserk') p.skillT += WB.extend;
    wwPush(p, p.aim, WB.lunge);
  });
  // Khát Máu [ĐO c09/skill 2: cd 2 mỗi lượt, maxCount 4; C10Controller.RoleSkill1Start / Skill1Atk* / GetComboFactor /
  // GetHurt; sword_werewolf, werewolf_skill1_skin0_spear]: dùng hết lượt (mỗi lượt một nhát), cả chuỗi 1.2 s
  // (skill1TotalTime), vũ khí bị cất. Nhát thường GetSkillDamage(4) = 6 × (2 − máu/tối đa) = 6..12, chí mạng
  // (2 − máu/tối đa) × 50, tự lao GetForce 30; đủ ≥ 3 lượt thì nhát cuối là đòn kết (hệ số max(0, min(n, 4) − 2)) lao 45.
  // Chỉ khi dùng đủ 4 lượt (hệ số > 1) mỗi nhát trúng mới hồi 1 máu (HpRestoreEffectTrigger). Nhận sát thương: > 2 thì
  // chia 3, còn lại 1. Nhịp từng nhát nằm trong hoạt ảnh [ƯỚC LƯỢNG chia đều 1.2 s]; sát thương đòn kết = nhát thường ×
  // hệ số [ƯỚC LƯỢNG]; gai của đòn kết (skill1FinalSpurCount, nổ 2 sát thương) chưa làm.
  const BT = { total: 1.2, dmg: 6, critK: 50, lunge: 30 * U, lungeEnd: 45 * U, reach: 16 };
  S.blood_thirst = {
    start(G, p) {
      layer(G);
      charges(p, 'blood_thirst');
      const n = useCharge(p, 'blood_thirst', true);
      p.skillT = BT.total;
      const factor = Math.max(0, Math.min(n, 4) - 2);
      p._bt = { n, i: 0, t: 0, factor, gap: BT.total / n, ang: targetAng(G, p, 6 * T).ang };
      p.noFire = true;
      hurtMods(p).bt = (G2, pl, d) => (d > 2 ? Math.floor(d / 3) : 1);
      swapAnims(p, subAnim(pngAnim('werewolf_form'), 0, 8, 'wolf_idle'), subAnim(pngAnim('werewolf_form'), 8, 16, 'wolf_run'));
    },
    update(G, p, dt) {
      const s = p._bt; if (!s) return;
      s.t += dt;
      const e = nearest(G, p.x, p.y - 7, 6 * T);
      if (e) s.ang = Math.atan2(ec(e)[1] - (p.y - 7), ec(e)[0] - p.x);
      while (s.i < s.n && s.t >= s.i * s.gap) {
        s.i++;
        const last = s.i === s.n && s.factor > 0;
        wwPush(p, s.ang, last ? BT.lungeEnd : BT.lunge);
        const cx = p.x + Math.cos(s.ang) * 12, cy = p.y - 7 + Math.sin(s.ang) * 12;
        const left = Math.cos(s.ang) < 0, k = wwK(p);
        fx(G, 'sword_werewolf', cx, cy, { ang: left ? s.ang + Math.PI : s.ang, flip: left === (s.i % 2 === 0), dur: 0.25, scale: last ? 1.4 : 1 });
        const dmg = Math.round(BT.dmg * k) * (last ? s.factor : 1);
        let any = false;
        for (const t of inRadius(G, cx, cy, BT.reach * (last ? 1.4 : 1))) { hit(G, p, t, dmg, { critChance: BT.critK * k, ang: s.ang, repel: 2, fx: 'hit_red' }); any = true; }
        if (any && s.factor > 1) heal(G, p, 1);
      }
    },
    end(G, p) { p._bt = null; p.noFire = false; delete hurtMods(p).bt; swapAnims(p, null); }
  };

  // ================================================================ NỮ TU (c10)
  // Khế Ước Hồi Sinh [ĐO c10/skill 1: cd 14, args "2"; C11Controller.RoleSkill0 → BulletGreenLight (lightRadius 4, SetValue 1.7,
  // FixedUpdate gắn buff C11Skill0 1.7 s, GasEnd); BuffImplC11Skill0 (Tick_Interval 0.8, OnBuffAttached +2 giáp tối đa);
  // Holy_light_c11]: vòng 4 đơn vị tồn tại 1.7 s; đứng trong vòng thì hào quang được làm mới liên tục, ra khỏi vòng / vòng
  // tắt thì hào quang còn 1.7 s. Hào quang: hồi 1 máu lúc gắn rồi mỗi 0.8 s, giáp tối đa +2. Vòng tắt thì đẩy quái trong
  // vòng ra ngoài (lực 20).
  const RP = { r: 4 * U, pact: 1.7, aura: 1.7, every: 0.8, push: 20 };
  S.regeneration_pact = {
    start(G, p) {
      layer(G);
      const add = +(cfg(p, 'regeneration_pact').args || 2);
      const s = p._pact = { x: p.x, y: p.y, t: 0, aura: RP.aura, tick: RP.every, add, pushed: false };
      p.skillT = RP.pact + RP.aura;
      p.armorMax += add;
      heal(G, p, 1);
      s.h1 = fx(G, 'effect_priest_1', s.x, s.y, { dur: RP.pact, scale: RP.r * 2 / 48, layer: 'ground' });
      s.h2 = fx(G, 'Holy_light_c11', s.x, s.y, { dur: RP.pact + RP.aura });
    },
    update(G, p, dt) {
      const s = p._pact; if (!s) return;
      s.t += dt;
      if (s.t < RP.pact && Math.hypot(p.x - s.x, (p.y - s.y) / 0.62) < RP.r) s.aura = RP.aura; else s.aura -= dt;
      if (s.t >= RP.pact && !s.pushed) {
        s.pushed = true;
        for (const e of inRadius(G, s.x, s.y, RP.r, RP.r * 0.62)) {
          if (e.boss) continue;
          const a = Math.atan2(e.y - s.y, e.x - s.x);
          e.kx = Math.cos(a) * RP.push * 30; e.ky = Math.sin(a) * RP.push * 30;   // cùng quy đổi lực đẩy với SK.hurtEnemy
        }
      }
      p.skillT = Math.max(0, s.aura);
      s.tick -= dt;
      if (s.tick <= 0) { s.tick = RP.every; if (heal(G, p, 1)) healFx(G, p); }
    },
    end(G, p) {
      const s = p._pact; p._pact = null;
      if (s) { p.armorMax -= s.add; p.armor = Math.min(p.armor, p.armorMax); stopFx(s.h1); stopFx(s.h2); }
    }
  };
  // Cầu Nguyện [ĐO c10/skill 2: cd 14; C11Controller.RoleSkill1; effect_priest_1_cast + effect_priest_1]: hồi 2 máu + 2 giáp,
  // +0.4 tốc chạy (ChangeSpeedNE "pray"), tốc vũ khí ×1.33 (BuffChangeWeaponSpeed), phòng thủ +1 (ChangeDefenceTemp) trong
  // 5 s; đồng minh trong 16 đơn vị cũng nhận. Phòng thủ +1 = bớt 1 sát thương mỗi đòn, còn tối thiểu 1 [ƯỚC LƯỢNG cách tính].
  const PRAY = { hp: 2, armor: 2, move: 1.4, rate: 1.33, def: 1, dur: 5 };
  S.pray = {
    start(G, p) {
      layer(G);
      p.skillT = PRAY.dur;
      heal(G, p, PRAY.hp);
      const a = Math.min(PRAY.armor, p.armorMax - p.armor); if (a > 0) { p.armor += a; SK.num(G, p.x, p.y - 34, '+' + a, '#9fd8ff'); }
      setMul(p, 'moveMul', 'pray', PRAY.move); setMul(p, 'rateMul', 'pray', PRAY.rate);
      hurtMods(p).pray = (G2, pl, d) => Math.max(1, d - PRAY.def);
      fx(G, 'effect_priest_1_cast', p.x, p.y, { follow: p });
      p._prayH = fx(G, 'effect_priest_1', p.x, p.y, { follow: p, dur: PRAY.dur, layer: 'ground' });
    },
    end(G, p) { setMul(p, 'moveMul', 'pray', 1); setMul(p, 'rateMul', 'pray', 1); delete hurtMods(p).pray; stopFx(p._prayH); p._prayH = null; }
  };

  // ================================================================ TU SĨ RỪNG (c11)
  // Sói Băng Lửa [ĐO c11/skill 1: cd 10, duration 3; wolf1_druid (isFire 1) / wolf2_druid: RoleAttributePet max_hp 25,
  // speed 10, WolfOfDruidController damage 5, atk_cd 1, atkDistance 2, swoopDistance 8; druid_circle, show_effect_wolf;
  // C12Controller.RoleSkill0 → WolfOfDruidController.BeginSkill0(dur, 5, 100); WolfController.Scout; RGPetController.ReplyingHP]:
  // hai con sói luôn đi theo Tu Sĩ, dò quái trong 12 đơn vị; trong swoopDistance thì vồ tới mục tiêu trong 0.2 s, dừng cách
  // ~1.2 đơn vị. Máu dưới tối đa: sau 6 s hồi tối đa/5, rồi cứ 2 s một lần (reply_time 4 + 2); hết máu thì nằm xuống tới khi
  // đầy [WIKI]. Kỹ năng tiếp sức 3 s: sói đầy máu, cắn +5 sát thương, tốc đánh +100%, to ×2 trong 0.5 s (DOScale), cắn gây
  // lửa/băng; đạn của Tu Sĩ trúng quái 50% gây thêm băng hoặc lửa (50/50) (OnAddBuffToEnemy).
  // Đi thường chưa rõ tốc nên lấy 60% tốc 10 đơn vị/s [ƯỚC LƯỢNG].
  const WOLF = { scout: 12 * U, big: 2, grow: 0.5, fast: 0.5, addDmg: 5, swoop: 0.2, stop: 1.2 * U, reply1: 6, reply2: 2, walk: 0.6, elem: 50 };
  function wolfAnims(i) {
    const k = n => XC['wolf_' + i + '_' + n] || null;
    return { idle: k('ide'), run: k('run'), atk: k('atk') };
  }
  function spawnWolves(G, p) {
    for (const a of allies(G)) if (a.wolf) a.gone = true;
    [['wolf1_druid', 0], ['wolf2_druid', 1]].forEach(([pf, i]) => {
      const hp = MB(pf, 'RoleAttributePet', 'max_hp', 25);
      const an = wolfAnims(i);
      addAlly(G, {
        wolf: true, pf, fire: MB(pf, 'WolfOfDruidController', 'isFire', i === 0 ? 1 : 0) === 1,
        x: p.x + (i ? 12 : -12), y: p.y + 4, hp, hpMax: hp, face: 1, box: [14, 10, 6], cd: 0, atkT: 0, moving: false, replyT: 0, swoop: null, scale: 1,
        onZero(G2, a) { a.down = true; a.hp = 0; },
        update(G2, a, dt) {
          const pw = p._wolfBoost > 0;
          a.scale = pw ? Math.min(WOLF.big, a.scale + (WOLF.big - 1) * dt / WOLF.grow) : Math.max(1, a.scale - (WOLF.big - 1) * dt / WOLF.grow);
          if (a.hp < a.hpMax) {
            a.replyT += dt;
            if (a.replyT >= WOLF.reply1) { a.replyT -= WOLF.reply2; a.hp = Math.min(a.hpMax, a.hp + a.hpMax / 5); }
          } else { a.replyT = 0; a.down = false; }
          if (a.swoop) {
            const s = a.swoop; s.t += dt;
            const k = Math.min(1, s.t / WOLF.swoop);
            a.x = s.x0 + (s.x1 - s.x0) * k; a.y = s.y0 + (s.y1 - s.y0) * k; a.moving = true;
            if (k >= 1) a.swoop = null;
            return;
          }
          const spd = MB(pf, 'RoleAttributePet', 'speed', 10) * U * WOLF.walk;
          const dp = Math.hypot(p.x - a.x, p.y - a.y);
          if (dp > MB(pf, 'WolfOfDruidController', 'max_follow_distance', 20) * U) { a.x = p.x; a.y = p.y + 4; }
          a.cd -= dt; a.atkT = Math.max(0, a.atkT - dt); a.moving = false;
          const e = !a.down && nearest(G2, a.x, a.y - 6, WOLF.scout);
          if (e) {
            const [cx, cy] = ec(e), d = Math.hypot(cx - a.x, cy - (a.y - 6));
            const reach = MB(pf, 'WolfOfDruidController', 'atkDistance', 2) * U * a.scale;
            if (d > reach) {
              if (d < MB(pf, 'WolfOfDruidController', 'swoopDistance', 8) * U && d > WOLF.stop) {
                const k = (d - WOLF.stop) / d;
                a.swoop = { t: 0, x0: a.x, y0: a.y, x1: a.x + (cx - a.x) * k, y1: a.y + (cy + 6 - a.y) * k };
                a.face = cx > a.x ? 1 : -1;
              } else { walk(G2, a, cx, cy + 6, spd, dt); a.moving = true; }
            } else if (a.cd <= 0) {
              a.cd = MB(pf, 'WolfOfDruidController', 'atk_cd', 1) * (pw ? WOLF.fast : 1); a.atkT = 0.5; a.face = cx > a.x ? 1 : -1;
              const dmg = MB(pf, 'WolfOfDruidController', 'damage', 5) + (pw ? WOLF.addDmg : 0);
              for (const t of inRadius(G2, cx, cy, 10 * a.scale)) {
                hit(G2, p, t, dmg, { noMul: true, crit: SK.rand() < 0.1, repel: 1, fx: 'hit_red', tag: 'pet' });
                if (pw) debuff(G2, t, a.fire ? 'fire' : 'ice');
              }
            }
          } else if (dp > MB(pf, 'WolfOfDruidController', 'min_follow_distance', 2) * U * 1.5) {
            walk(G2, a, p.x + (i ? 14 : -14), p.y + 4, spd, dt); a.moving = true;
          }
        },
        draw(ctx, G2, a) {
          const s = a.scale;
          const key = a.atkT > 0 && an.atk ? an.atk : a.moving && an.run ? an.run : an.idle;
          const fr = key && SK.animFrame(key, a.atkT > 0 ? 0.5 - a.atkT : a.t);
          ctx.save(); if (a.down) ctx.globalAlpha *= 0.5;
          SK.drawShadow && SK.drawShadow(ctx, 'shadow3', a.x, a.y, null, 0.8 * s);
          if (fr) SK.draw(ctx, fr, a.x, a.y, { flip: a.face < 0, sx: s, sy: s, pages: a.flash > 0 ? SK.pagesWhite : null });
          ctx.restore();
          hpBar(ctx, a, 20 * s);
        }
      });
      fx(G, 'show_effect_wolf', p.x + (i ? 12 : -12), p.y + 4, {});
    });
  }
  function ensureWolves(G) {
    const p = G.player;
    if (!p || p.hero !== 'druid' || G.state !== 'stage') return;
    layer(G);
    if (!allies(G).some(a => a.wolf)) spawnWolves(G, p);
  }
  SK.on('runStart', G => ensureWolves(G));
  SK.on('stageEnter', G => { G._allies = []; setTimeout(() => ensureWolves(G), 0); });
  S.frostfire_wolves = {
    start(G, p) {
      layer(G);
      ensureWolves(G);
      p.skillT = cfg(p, 'frostfire_wolves').dur || 3;
      p._wolfBoost = p.skillT;
      for (const a of allies(G)) if (a.wolf) { a.hp = a.hpMax; a.down = false; fx(G, 'show_effect_wolf', a.x, a.y, {}); }
      p._circle = fx(G, 'druid_circle', p.x, p.y, { follow: p, dur: p.skillT, layer: 'ground' });
    },
    update(G, p) { p._wolfBoost = p.skillT; },
    end(G, p) { p._wolfBoost = 0; stopFx(p._circle); }
  };
  SK.on('enemyHit', (G, e) => {
    const p = G.player;
    if (!p || !(p._wolfBoost > 0) || !G._hitBullet || G._skHit) return;
    if (SK.rand() * 100 < WOLF.elem) debuff(G, e, SK.rand() < 0.5 ? 'ice' : 'fire');
  });

  // ================================================================ NGƯỜI MÁY (c12)
  // Quá Tải Điện [ĐO c12/skill 1: cd 11, duration 4; C13Controller.RoleSkill0, const KillSomeoneIncreaseTimeSkill0 0.5,
  // maxDurationIncreaseOfSkill0 20; ăng-ten GunChain của c12: multiCount 2, bulletsInfo damage 1 / repel 3 / speed 0.15 là
  // nhịp (RGChain.HitTarget), atk_move_speed −0.2; RGChain.FindTarget CircleCast 14 + Linecast]: cuộn Tesla phóng 2 tia vào
  // quái gần nhất trong 14 đơn vị có tầm nhìn, 1 sát thương mỗi 0.15 s, đi chậm 20%; hạ quái +0.5 s, cộng tối đa 20 s.
  // Tia bắt đầu theo sự kiện hoạt ảnh SkillStart (không có trong sk-data.js) [ƯỚC LƯỢNG 0.5 s].
  const EO = { warm: 0.5, beams: 2, every: 0.15, dmg: 1, repel: 3, slow: 0.8, range: 14 * U, killAdd: 0.5 };
  S.electric_overload = {
    start(G, p) {
      layer(G);
      const dur = cfg(p, 'electric_overload').dur || 4;
      p.skillT = dur;
      p._coil = { t: 0, tick: 0, tg: [], added: 0, cap: CTRL('robot', 'maxDurationIncreaseOfSkill0', 20) };
      setMul(p, 'moveMul', 'overload', EO.slow);
      G.props.push(coilProp(p));
    },
    update(G, p, dt) {
      const s = p._coil; if (!s) return;
      s.t += dt;
      if (s.t < EO.warm) return;
      const hx = p.x, hy = p.y - 8;
      s.tg = [];
      const skip = e => s.tg.indexOf(e) >= 0;
      for (let i = 0; i < EO.beams; i++) { const e = nearest(G, hx, hy, EO.range, { los: true, skip }); if (e) s.tg.push(e); }
      s.tick -= dt;
      if (s.tick <= 0) { s.tick = EO.every; for (const e of s.tg) hit(G, p, e, EO.dmg, { noMul: true, crit: false, repel: EO.repel }); }
    },
    end(G, p) { p._coil = null; setMul(p, 'moveMul', 'overload', 1); }
  };
  SK.on('enemyKill', G => {
    const p = G.player, s = p && p._coil;
    if (s && s.added + EO.killAdd <= s.cap) { s.added += EO.killAdd; p.skillT += EO.killAdd; }
  });
  function coilProp(p) {
    const coil = firstFrame('robot_coil');
    return {
      x: 0, y: 1e9, t: 0,
      update(G, q, dt) { q.t += dt; if (!p._coil) q.gone = true; },
      draw(ctx, G, q) {
        const s = p._coil; if (!s) return;
        const rise = Math.min(1, s.t / EO.warm);
        const hx = p.x, hy = p.y - 16 - 6 * rise;
        if (coil) SK.draw(ctx, coil, hx, hy + 6);
        glow(ctx, hx, hy - 6, 8, [0.35, 0.8, 1, 0.35 + 0.15 * Math.sin(q.t * 30)]);
        for (const e of s.tg) { const [x, y] = ec(e); drawBolt(ctx, hx, hy - 6, x, y, q.t, 0.9); }
      }
    };
  }
  // Xung Điện Từ [ĐO c12/skill 3: cd 4; C13Controller.RoleSkill2 (Invoke RoleSkillEnd2 0.45, DORotate +120° / 0.5 s);
  // laser_point_robot_pulse_s0 RGShortLasetBuff buff_ele]: 10 tia cách 36°, dài 2.5 đơn vị, quay quanh người; mỗi tia trúng
  // riêng từng quái 3 sát thương (ProcessSkillDamage 3), chí mạng 50; mọi đòn gây buff_ele; phá đạn địch trong tầm tia.
  const EMP = { n: 10, len: 2.5 * U, dmg: 3, crit: 50, dur: 0.45, spin: SK.deg(120) / 0.5 };
  S.emp = {
    start(G, p) {
      layer(G);
      const hits = Array.from({ length: EMP.n }, () => new Set());
      fx(G, 'effect_shock1', p.x, p.y - 8, { scale: 1.5 });
      G.props.push({ x: p.x, y: 1e9, t: 0,
        update(G2, q, dt) {
          q.t += dt;
          if (q.t > EMP.dur) { q.gone = true; return; }
          const cx = p.x, cy = p.y - 8;
          for (let i = 0; i < EMP.n; i++) {
            const a = i / EMP.n * Math.PI * 2 + q.t * EMP.spin;
            const hitSet = hits[i];
            for (const e of G2.enemies) {
              if (!alive(e) || hitSet.has(e)) continue;
              const [x, y] = ec(e), dx = x - cx, dy = y - cy, u = dx * Math.cos(a) + dy * Math.sin(a), v = -dx * Math.sin(a) + dy * Math.cos(a);
              if (u > 0 && u < EMP.len + e.r && Math.abs(v) < 4 + e.r) {
                hitSet.add(e);
                hit(G2, p, e, EMP.dmg, { critChance: EMP.crit, fx: 'hit_blue' });
                debuff(G2, e, 'ele');
              }
            }
          }
          for (const b of G2.bullets) if (b.side === 'e' && !b.dead && Math.hypot(b.x - cx, b.y - cy) < EMP.len + b.r) b.dead = true;
        },
        draw(ctx, G2, q) {
          const cx = p.x, cy = p.y - 8, al = 1 - q.t / EMP.dur;
          for (let i = 0; i < EMP.n; i++) { const a = i / EMP.n * Math.PI * 2 + q.t * EMP.spin; drawBolt(ctx, cx, cy, cx + Math.cos(a) * EMP.len, cy + Math.sin(a) * EMP.len, q.t + i, al); }
        } });
    }
  };

  // ================================================================ CHIẾN BINH CUỒNG (c13)
  // Cuồng Nộ [ĐO c13/skill 1: cd 4; C14Controller.RoleSkill0 / RoleSkillEnd0]: vũ khí đang cầm tự tấn công (SetAutoAttack)
  // với tốc ×3 trong 0.5 s, chí mạng +25 (+2.5·cấp) tới hết kỹ năng.
  const RG = { dur: 0.5, rate: 3, crit: 25 };
  S.rage = {
    start(G, p) {
      layer(G);
      p.skillT = RG.dur;
      setMul(p, 'rateMul', 'rage', RG.rate);
      p.crit = (p.crit || 0) + RG.crit; p._rageCrit = RG.crit;
      p._rageBtn = !I.btn.attack; I.btn.attack = true;
      for (const w of p.weapons) if (w) w.cd = Math.min(w.cd, 0);
      // PhantomCreator của c13 [ĐO màu 0.937, 0.686, 0.251]: bóng mờ cam bám theo người khi cuồng nộ.
      p._rage = { trail: [], t: 0 };
      G.props.push(mirageProp(p, () => p._rage));
    },
    update(G, p, dt) { I.btn.attack = true; },
    end(G, p) {
      setMul(p, 'rateMul', 'rage', 1); p.crit -= p._rageCrit || 0; p._rageCrit = 0;
      if (p._rageBtn) I.btn.attack = false; p._rageBtn = false; p._rage = null;
    }
  };
  const PH_C = [0.937, 0.686, 0.251, 1];
  function mirageProp(p, get) {
    return { x: 0, y: -1e9 + 2, tr: [], tt: 0,
      update(G, q, dt) {
        const s = get();
        for (const g of q.tr) g.t += dt;
        q.tr = q.tr.filter(g => g.t < 0.4);
        if (s) { q.tt -= dt; if (q.tt <= 0) { q.tt = MB('c13', 'PhantomCreator@phantom', 'interval', 0.1); q.tr.push({ x: p.x, y: p.y, f: SK.animFrame(p.moving ? p.anims.run : p.anims.idle, p.t), flip: p.face < 0, t: 0 }); } }
        else if (!q.tr.length) q.gone = true;
      },
      draw(ctx, G, q) {
        for (const g of q.tr) { if (!g.f) continue; ctx.save(); ctx.globalAlpha = 0.6 * (1 - g.t / 0.4); SK.drawTinted(ctx, g.f, g.x, g.y, PH_C, { flip: g.flip }); ctx.restore(); }
      } };
  }
  // Tự Do [ĐO c13/skill 2: cd 10, duration 5; C14Controller.skill1Config: extraBulletCount 2, extraBulletAngle 10°,
  // damageFactor 0.5, deviation 10°, bulletScaleFactor 0.5]: mỗi phát bắn thành 3 phát nhỏ (1 gốc + 2 lệch), mỗi phát 50%
  // sát thương, nửa cỡ.
  S.free_style = {
    start(G, p) {
      layer(G);
      p.skillT = cfg(p, 'free_style').dur || 5;
      p._free = true;
      fx(G, 'c14_skill1_effect', p.x, p.y, { follow: p, dur: 0.6 });
    },
    end(G, p) { p._free = false; }
  };
  SK.on('fire', (G, p, w) => {
    if (!p._free || !w || w.def.kind === 'melee') return;
    const c = (H86('viking') || {}).ctrlFields || {};
    const sc = c.skill1Config || {};
    const n = sc.extraBulletCount || 2, da = SK.deg(sc.extraBulletAngle || 10), k = sc.damageFactor || 0.5;
    // Đạn vừa bắn trong bước này chưa có dấu _seen (timers.seen đánh dấu mọi viên cuối mỗi bước).
    const fresh = G.bullets.filter(b => b.side === 'p' && !b._free && !b._seen && !b.vis);
    for (const b of fresh) {
      b._free = 1; b.dmg = Math.max(1, Math.round(b.dmg * k)); b.r = (b.r || 2) * (sc.bulletScaleFactor || 0.5);
      const sp = Math.hypot(b.vx, b.vy), a0 = Math.atan2(b.vy, b.vx);
      for (let i = 0; i < n; i++) {
        const a = a0 + (i % 2 ? 1 : -1) * da * Math.ceil((i + 1) / 2) + SK.deg(SK.randf(-(sc.deviation || 10) / 2, (sc.deviation || 10) / 2));
        G.bullets.push(Object.assign({}, b, { _free: 1, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ang: a, hits: null, boxes: null }));
      }
    }
  });
  timers.seen = G => { for (const b of G.bullets) b._seen = 1; };
  // Nhảy Vồ [ĐO c13/skill 3: cd 4 mỗi lượt, maxCount 2; C14Controller.RoleSkill2 / RoleSkillEnd2 / JumpLand; clip skin/L2.jump
  // (sự kiện RoleSkillEnd ở 0.4583 s, img.p cao 28 px)]: bay 0.4583 s, vẫn tự điều khiển với tốc thường (movable), bất tử
  // trên không (StartHitTrigger 99); đáp đất dậm bullet_hammer: 8 sát thương (ProcessSkillDamage 8, ghi đè damage 6 của
  // prefab), chí mạng 50, đẩy 3, gây buff_ele (targetbuff). Đáp xong đứng yên 0.15 s rồi miễn sát thương thêm 0.2 s.
  // Bán kính dậm = collider bullet_hammer /img r 16 px × scale_factor 1.5 [ĐO sk-data].
  // SetFlyable cho bay qua địa hình; web chưa có lớp va chạm riêng cho vật cản thấp nên vẫn chặn như đi bộ.
  const LEAP = { t: 0.4583, h: 28, freeze: 0.15, immune: 0.2, dmg: 8, crit: 50, repel: 3, r: 16 * 1.5 };
  S.leap = {
    start(G, p) {
      layer(G);
      charges(p, 'leap'); useCharge(p, 'leap');
      p.skillT = LEAP.t + LEAP.freeze;
      p._leap = { t: 0, landed: false };
      ghost(p, true); hurtMods(p).leap = () => 0;
      p._liftY = 0;
    },
    update(G, p, dt) {
      const s = p._leap; if (!s) return;
      s.t += dt;
      p._liftY = s.t < LEAP.t ? Math.sin(s.t / LEAP.t * Math.PI) * LEAP.h : 0;
      if (s.t >= LEAP.t && !s.landed) { s.landed = true; leapLand(G, p); }
      if (s.landed) {
        // Đứng yên sau khi đáp: huỷ phần đi bộ của bước này.
        const mv = I.moveVec(), walkPx = p.h.speed * U * (p.speedMul || 1) * (p.moveMul || 1) * dt;
        SK.moveBox(G.map, p, -mv.x * walkPx, -mv.y * walkPx, p.h.body.r);
      }
    },
    end(G, p) {
      const s = p._leap; p._leap = null; p._liftY = 0; delete hurtMods(p).leap;
      if (s && !s.landed) leapLand(G, p);
      p._immuneT = LEAP.immune; hurtMods(p).after = () => 0;
    }
  };
  function leapLand(G, p) {
    fx(G, 'bullet_hammer', p.x, p.y - 2, {});
    for (const e of inRadius(G, p.x, p.y - 4, LEAP.r)) {
      hit(G, p, e, LEAP.dmg, { critChance: LEAP.crit, repel: LEAP.repel, ang: Math.atan2(ec(e)[1] - p.y, ec(e)[0] - p.x) });
      debuff(G, e, 'ele');
    }
    G.shake = Math.max(G.shake, 4);
  }

  // ================================================================ PHÁP SƯ TỬ LINH (c14)
  // Ác Mộng [ĐO c14/skill 1: cd 6; C15Controller.RoleSkill0 / TryAddSkill0BuffToTarget / get_skill0Damage /
  // get_canSummonGhostHand; buff_nightmare: BuffNightmare buff_time 10, maxDamage 50, GetHurt, Summon, OnBuffUnRegister;
  // nec_ghost_hand: GhostHandController atk_cd 0.5, lifeTime 15, RoleAttribute max_hp 10, speed 5]: đánh dấu mục tiêu đang
  // nhắm, không có thì quái trong 14 đơn vị (lần đầu cần tầm nhìn và ưu tiên quái chưa bị dấu, lần sau bỏ cả hai điều
  // kiện); không có quái thì vẫn tính hồi chiêu. Mỗi lần bấm dấu thêm một quái (cùng quái thì làm mới), dấu giữ 10 s.
  // Sát thương dồn lên quái bị dấu đủ 50 thì về 0 và gọi một Bàn Tay Ma; quái chết khi còn dấu cũng gọi một. Tay đánh
  // ProcessSkillDamage(6) (Summon ghi đè damage 5 của prefab); tối đa 15 tay (ghostHandMaxCount).
  const NM = { range: 14 * U, handDmg: 6, maxHands: 15 };
  S.nightmare = {
    start(G, p) {
      layer(G);
      const marks = G._nms || (G._nms = []);
      const marked = e => marks.some(m => m.e === e);
      const e = (p.target && alive(p.target) && p.target) ||
        nearest(G, p.x, p.y - 6, NM.range, { los: true, skip: marked }) || nearest(G, p.x, p.y - 6, NM.range);
      if (!e) return;
      const t = MB('buff_nightmare', 'BuffNightmare', 'buff_time', 10);
      const old = marks.find(m => m.e === e);
      if (old) { old.t = t; if (old.h) old.h.life = old.h.t + t; }
      else marks.push({ e, t, acc: 0, h: fx(G, 'buff_nightmare', e.x, e.y, { follow: e, dy: -(e.hb.off[1] + e.hb.size[1] / 2) * e.scale - 4, dur: t }) });
      fx(G, 'hit_black', ec(e)[0], ec(e)[1], {});
    }
  };
  timers.nightmare = (G, p, dt) => {
    const marks = G._nms; if (!marks) return;
    for (const m of marks) { m.t -= dt; if (m.t <= 0) stopFx(m.h); }
    G._nms = marks.filter(m => m.t > 0 && alive(m.e));
  };
  SK.on('enemyHit', (G, e, dmg) => {
    const m = G._nms && G._nms.find(q => q.e === e); if (!m || m.t <= 0) return;
    m.acc += dmg;
    if (m.acc >= MB('buff_nightmare', 'BuffNightmare', 'maxDamage', 50)) { m.acc = 0; ghostHand(G, G.player, e.x, e.y); }
  });
  SK.on('enemyKill', (G, e) => {
    const m = G._nms && G._nms.find(q => q.e === e); if (!m) return;
    ghostHand(G, G.player, e.x, e.y); stopFx(m.h); m.t = 0;
  });
  function ghostHand(G, p, x, y) {
    if (allies(G).filter(a => a.hand && !a.down).length >= NM.maxHands) return;
    const pf = SK.prefab('nec_ghost_hand') || [];
    const root = pf[0] && pf[0].a ? pf[0].a : {}, body = pf.find(q => /\/img\/body$/.test(q.n));
    const hp = MB('nec_ghost_hand', 'RoleAttribute', 'max_hp', 10), life = MB('nec_ghost_hand', 'GhostHandController', 'lifeTime', 15);
    const K = n => Object.keys(root).find(k => k.indexOf(n) >= 0);
    addAlly(G, {
      hand: true, x: x + SK.randf(-8, 8), y: y + SK.randf(-4, 4), hp, hpMax: hp, face: 1, box: [10, 14, 7], cd: 0.4, st: 'born', stT: 0,
      onZero(G2, a) { a.st = 'die'; a.stT = 0; a.down = true; },
      update(G2, a, dt) {
        a.stT += dt;
        if (a.st === 'die') { if (a.stT > 0.5) a.gone = true; return; }
        if (a.st === 'born') { if (a.stT > SK.animLen(root[K('born')]) || a.stT > 0.6) { a.st = 'idle'; a.stT = 0; } return; }
        if (a.t > life) { a.st = 'die'; a.stT = 0; a.down = true; return; }
        a.cd -= dt;
        const e = nearest(G2, a.x, a.y - 6, 10 * T);
        if (!e) { if (Math.hypot(p.x - a.x, p.y - a.y) > 3 * T) walk(G2, a, p.x, p.y, MB('nec_ghost_hand', 'RoleAttribute', 'speed', 5) * U, dt); return; }
        const [cx, cy] = ec(e);
        if (Math.hypot(cx - a.x, cy - (a.y - 6)) > 14) walk(G2, a, cx, cy + 6, MB('nec_ghost_hand', 'RoleAttribute', 'speed', 5) * U, dt);
        else if (a.cd <= 0) { a.cd = MB('nec_ghost_hand', 'GhostHandController', 'atk_cd', 0.5); a.st = 'atk'; a.stT = 0; hit(G2, p, e, NM.handDmg, { noMul: true, crit: false, repel: 1, fx: 'hit_black', tag: 'pet' }); }
        if (a.st === 'atk' && a.stT > 0.3) a.st = 'idle';
      },
      draw(ctx, G2, a) {
        const key = root[K(a.st === 'born' ? 'born' : a.st === 'die' ? 'die' : 'atk')];
        const fr = (a.st !== 'idle' && key && SK.anim(key) && SK.animFrame(key, a.stT)) || (body && body.f);
        if (fr) SK.draw(ctx, fr, a.x + (body ? body.at[0] : 0), a.y - (body ? body.at[1] : 0), { flip: a.face < 0, pages: a.flash > 0 ? SK.pagesWhite : null });
        if (a.st !== 'die') hpBar(ctx, a, 22, '#b06bff');
      }
    });
  }
  // Đá Điềm Báo [ĐO c14/skill 2: cd 3 mỗi lượt, maxCount 3; C15Controller.RoleSkill1 / GetSkill1Damage / CreatePoisonCircle;
  // nec_fireball: DelayExplode boom_time 1 → explode_hit_enemy_nec (độc 50%); NecFireGas: PlagueGas lifeTime 3 (buff_plague)]:
  // dùng hết n lượt một lần (ConsumeSkillCount(count)); sát thương 8 × n (hệ số tối đa 5), cỡ min(2, 1 + 0.3333·(n − 1)); rơi
  // vào mục tiêu, không có thì lệch ngẫu nhiên ±5 đơn vị quanh người. Bán kính nổ và vùng dịch là collider, không có trong
  // dump [ƯỚC LƯỢNG 2 ô × cỡ]. Nhện dịch (SummonSpider, nec_spider: không đánh, sống 10 s, chết để lại vùng dịch) chưa làm vì
  // không có hình nec_spider trong sk-data.
  const OMEN = { dmg: 8, maxRatio: 5, maxSize: 2, scatter: 5 * U, r: 2 * T };
  S.omen_stone = {
    start(G, p) {
      layer(G);
      charges(p, 'omen_stone');
      const n = useCharge(p, 'omen_stone', true);
      const k = Math.min(OMEN.maxSize, 1 + (n - 1) * CTRL('necromancer', 'oneLevelSkillScaleFactorSkill1', 0.3333));
      const dmg = OMEN.dmg * Math.min(OMEN.maxRatio, n);
      const { e } = targetAng(G, p, 14 * T);
      const x = e ? e.x : p.x + SK.randf(-OMEN.scatter, OMEN.scatter), y = e ? e.y : p.y + SK.randf(-OMEN.scatter, OMEN.scatter);
      const boom = MB('nec_fireball', 'DelayExplode', 'boom_time', 1);
      fx(G, 'nec_fireball', x, y, { scale: k, dur: boom + 0.5 });
      G.props.push({ x, y: -1e9, t: 0, draw() {},
        update(G2, q, dt) {
          q.t += dt; if (q.t < boom) return;
          q.gone = true;
          const r = OMEN.r * k;
          fx(G2, 'explode_hit_enemy', x, y - 4, { scale: k });
          for (const t of inRadius(G2, x, y - 4, r)) { hit(G2, p, t, dmg, { repel: 3 }); if (SK.rand() * 100 < MB('explode_hit_enemy_nec', 'ExplodeDizzy', 'fire_rate', 50)) debuff(G2, t, 'poison'); }
          G2.shake = Math.max(G2.shake, 4);
          const life = MB('NecFireGas', 'PlagueGas', 'lifeTime', 3);
          const h = fx(G2, 'NecFireGas', x, y, { dur: life, scale: k * 0.5, layer: 'ground' });
          G2.props.push({ x, y: -1e9, t: 0, draw() {},
            update(G3, q2, dt2) { q2.t += dt2; if (q2.t > life) { stopFx(h); q2.gone = true; return; }
              for (const t of inRadius(G3, x, y, r, r * 0.7)) if (!(t._db && t._db.plague)) debuff(G3, t, 'plague'); } });
        } });
    }
  };

  // ================================================================ SĨ QUAN (c15)
  // Xoay Súng [ĐO c15/skill 1: cd 2 mỗi lượt, maxCount 2, args "3"; C16Controller.RoleSkill0 / GetKillenemyisExDamage /
  // EnterDuelState / .ctor; weapon_skill_officer: GunOfficerSkill.ReloadGun, bullet_14 damage 8, crit 5, speed 42, deviation 6,
  // delay 0.1, maxCount 5]: bấm kỹ năng nạp 1 viên vào Sứ Giả Hoà Bình (tối đa 5; thông tin ghi 6 là khi có thiên phú); năng
  // lượng dưới (số đã nạp + 1) thì không nạp và không mất lượt. Bấm bắn thì xả hết, mỗi viên tốn 1 năng lượng. Sát thương
  // +1 mỗi 30 quái súng này hạ (_killEnemiesLevelUpCount). Hạ 3 quái, mỗi con cách con trước dưới 3 s → Quyết Đấu 5 s: đạn
  // to hơn và nhanh hơn +0.2 (duelBulletSize / duelBulletSpeed); phần giảm hồi chiêu trong Quyết Đấu chưa lần ra số.
  const SPIN = () => ({ dmg: 8, crit: 5, speed: 42, dev: 6, delay: MB('weapon_skill_officer', 'GunOfficerSkill', 'delay', 0.1), max: MB('weapon_skill_officer', 'GunOfficerSkill', 'maxCount', 5) });
  const DUEL = { kills: 3, gap: 3, dur: 5, bonus: 0.2, perKill: 30 };
  SK.WEAPON_KINDS.officer_spin = {
    fire(G, p, w, o) {
      const s = p._spin; if (!s) return;
      const c = SPIN(), n = s.loaded, duel = p._offDuel > 0;
      const dmg = c.dmg + Math.floor((p._offKills || 0) / DUEL.perKill);
      for (let i = 0; i < n; i++) {
        G.props.push({ x: 0, y: -1e9, t: -i * c.delay, draw() {},
          update(G2, q, dt) {
            q.t += dt; if (q.t < 0) return; q.gone = true;
            const [hx, hy] = [p.x + 3 * p.face, p.y - 6];
            const a = p.aim + SK.deg(SK.randf(-c.dev, c.dev));
            const b = shoot(G2, p, hx + Math.cos(p.aim) * 10, hy + Math.sin(p.aim) * 10, a, { dmg: Math.round(dmg * (p.dmgMul || 1)), speed: c.speed * (duel ? 1 + DUEL.bonus : 1), critChance: c.crit + p.crit, sprite: 'bullet_34', hit: 'hit_orange', repel: 2, extra: { officer: true } });
            if (duel) b.r *= 1 + DUEL.bonus;
            SK.fx(G2, 'muzzle', hx + Math.cos(p.aim) * 10, hy + Math.sin(p.aim) * 10, { ang: p.aim, dur: 0.05 });
          } });
      }
      s.loaded = 0; s.fired = true;
    }
  };
  S.gun_spin = {
    start(G, p) {
      layer(G);
      const c = SPIN();
      const loaded = p._spin ? p._spin.loaded : 0;
      if (loaded >= c.max || p.energy < loaded + 1) { p._cdAfter = 0; return; }
      charges(p, 'gun_spin'); useCharge(p, 'gun_spin');
      if (!p._spin) {
        Object.defineProperty(DS.weapons, '_officer_gun', { configurable: true, writable: true, enumerable: false,
          value: { name: 'Sứ Giả Hoà Bình', kind: 'officer_spin', dmg: c.dmg, cost: 1, crit: c.crit, rps: 3, sprite: 'hero_c15_skin_0_init_weapon_2' } });
        p._spin = { loaded: 0, saved: p.weapons[p.cur], slot: p.cur, fired: false };
        p.weapons[p.cur] = SK.makeWeapon('_officer_gun');
      }
      p._spin.loaded = Math.min(c.max, p._spin.loaded + 1);
      DS.weapons._officer_gun.cost = p._spin.loaded;
      fx(G, 'officer_duel_state', p.x, p.y - 20, { dur: 0.3 });
    }
  };
  // Xả xong (hoặc đổi sang ô kia) thì trả vũ khí cũ vào ô.
  timers.gunSpin = (G, p, dt) => {
    if (p._offDuel > 0) p._offDuel -= dt;
    const s = p._spin; if (!s) return;
    if (!s.fired && p.cur === s.slot) return;
    if (p.weapons[s.slot] && p.weapons[s.slot].id === '_officer_gun') p.weapons[s.slot] = s.saved;
    p._spin = null;
  };
  SK.on('enemyKill', G => {
    const p = G.player;
    if (!p || p.hero !== 'officer' || !p.h.skill || p.h.skill.id !== 'gun_spin') return;
    if (G._hitBullet && G._hitBullet.officer) p._offKills = (p._offKills || 0) + 1;
    const c = p._offChain || (p._offChain = { n: 0, t: -1e9 });
    c.n = G.t - c.t < DUEL.gap ? c.n + 1 : 1; c.t = G.t;
    if (c.n >= DUEL.kills && !(p._offDuel > 0)) { c.n = 0; p._offDuel = DUEL.dur; fx(G, 'officer_duel_state', p.x, p.y - 20, { follow: p, dy: -20, dur: DUEL.dur }); }
  });
  // Treo Thưởng [ĐO c15/skill 2: cd 4; C16Controller._rewardMarkDict / AddFollowMover / FindMarkedTarget / FindNoMarkedTarget /
  // ExtraDamage; buff_reward_mark BuffRewardTarget buff_time 10, extraDamageFactor 1]: đánh dấu mục tiêu 10 s (được dấu
  // nhiều quái; dấu lại quái đang có dấu thì làm mới); không có mục tiêu thì không dùng. Mọi viên đạn của mình bám theo
  // quái bị dấu gần nhất (BulletMoverFollow, không giới hạn tầm). Quái bị dấu nhận thêm sát thương = đòn × 1 (hook cộng
  // vào đòn — suy từ Func<…,int>). Quái bị dấu chết: 0.5 s sau rơi thưởng (prefab chưa rõ, dùng xu), dấu chuyển sang quái
  // gần nhất chưa bị dấu với thời gian còn lại. Tốc bẻ lái của BulletMoverFollow chưa đọc [ƯỚC LƯỢNG 6 rad/s].
  const BOUNTY = { t: 10, extra: 1, turn: 6, reward: 0.5 };
  S.bounty_tag = {
    start(G, p) {
      layer(G);
      const { e } = targetAng(G, p);
      if (!e) { p._cdAfter = 0; return; }
      tagBounty(G, e, BOUNTY.t);
    }
  };
  function tagBounty(G, e, t) {
    const list = G._bounties || (G._bounties = []);
    const old = list.find(b => b.e === e);
    if (old) { old.t = t; if (old.h) old.h.life = old.h.t + t; return; }
    list.push({ e, t, h: fx(G, 'target2', e.x, e.y, { follow: e, dy: -(e.hb.off[1]) * e.scale, dur: t }) });
  }
  timers.bounty = (G, p, dt) => {
    const list = G._bounties; if (!list || !list.length) return;
    for (const b of list) { b.t -= dt; if (b.t <= 0) stopFx(b.h); }
    G._bounties = list.filter(b => b.t > 0 && alive(b.e));
    for (const q of G.bullets) {
      if (q.side !== 'p' || q.dead || q.vis) continue;
      let tg = null, bd = 1e9;
      for (const b of G._bounties) { const [x, y] = ec(b.e), d = Math.hypot(x - q.x, y - q.y); if (d < bd) { bd = d; tg = [x, y]; } }
      if (!tg) break;
      const a = Math.atan2(q.vy, q.vx), want = Math.atan2(tg[1] - q.y, tg[0] - q.x);
      let d = want - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      const sp = Math.hypot(q.vx, q.vy), na = a + Math.max(-BOUNTY.turn * dt, Math.min(BOUNTY.turn * dt, d));
      q.vx = Math.cos(na) * sp; q.vy = Math.sin(na) * sp; q.ang = na;
    }
  };
  SK.on('enemyHit', (G, e, dmg) => {
    if (!G._bounties || G._skHit === 'bounty' || G._skHit === 'dot' || !G._bounties.some(b => b.e === e && b.t > 0) || !alive(e)) return;
    const tag = G._skHit; G._skHit = 'bounty';
    SK.hurtEnemy(G, e, Math.max(1, Math.round(dmg * BOUNTY.extra)), false, 0, 0);
    G._skHit = tag;
  });
  SK.on('enemyKill', (G, e) => {
    const b = G._bounties && G._bounties.find(q => q.e === e); if (!b) return;
    const left = b.t; stopFx(b.h); b.t = 0;
    const x = e.x, y = e.y - 4;
    G.props.push({ x, y: -1e9, t: 0, draw() {}, update(G2, q, dt) { q.t += dt; if (q.t >= BOUNTY.reward) { q.gone = true; SK.dropPickup(G2, 'coin', x, y); } } });
    const n = nearest(G, e.x, e.y, 1e9, { skip: q => q === e || G._bounties.some(m => m.e === q && m.t > 0) });
    if (n && left > 0) tagBounty(G, n, left);
  });
  SK.on('stageEnter', G => { G._bounties = null; G._nms = null; });
  // Không Kích [ĐO c15/skill 3: cd 9; C16Controller.ctor (_skill2BombNum 6, _skill2BombInterval 0.15, _skill2RandomRange 5,
  // _airStrikeRadius 3.5, _skill2Damage 12), BtnSkillDown / AirStrikeDelay / AirStrike; skin0 bullet_airstrike_fire
  // (DelayExplode boom_time 0.375 → explode_fire: SerialExplode cháy 40%); target2 ngắm]: nhấn K đặt vòng ngắm lên mục tiêu,
  // giữ K thì cần di chuyển dời vòng ngắm (10 đơn vị/s, trong 9 đơn vị), thả K thì gọi điện 0.25 s (cất vũ khí) rồi máy bay
  // (50 đơn vị/s) thả 6 quả bom (mã ghi đè args "5"), cách nhau 0.15 s, rải ngẫu nhiên trong 5 đơn vị quanh vòng ngắm; mỗi
  // quả 12 sát thương (ProcessSkillDamage 12), cỡ nổ 3.5. Bán kính nổ gốc là collider [ƯỚC LƯỢNG 0.5 đơn vị × 3.5].
  const AIR = { call: 0.25, n: 6, gap: 0.15, scatter: 5 * U, size: 3.5, r0: 0.5 * U, dmg: 12, aimR: 9 * U, aimV: 10 * U, plane: 50 * U };
  S.close_air_support = {
    start(G, p) {
      layer(G);
      const { e } = targetAng(G, p, AIR.aimR);
      p._offAim = { x: e ? e.x : p.x + p.face * 3 * T, y: e ? e.y : p.y, t: 0 };
      p._offAim.h = fx(G, 'target2', p._offAim.x, p._offAim.y - 6, { follow: p._offAim, dy: -6, scale: 2, dur: 60 });
      p.skillT = 1e4;
    },
    update(G, p, dt) {
      const s = p._offAim; if (!s) return;
      const mv = I.moveVec(), walkPx = p.h.speed * U * (p.speedMul || 1) * (p.moveMul || 1) * dt;
      if (s.call == null) {
        // Đang ngắm: cần di chuyển dời vòng ngắm thay vì đi.
        SK.moveBox(G.map, p, -mv.x * walkPx, -mv.y * walkPx, p.h.body.r);
        s.x += mv.x * AIR.aimV * dt; s.y += mv.y * AIR.aimV * dt;
        const d = Math.hypot(s.x - p.x, s.y - p.y);
        if (d > AIR.aimR) { s.x = p.x + (s.x - p.x) / d * AIR.aimR; s.y = p.y + (s.y - p.y) / d * AIR.aimR; }
        if (!I.down('skill')) { s.call = 0; p.noFire = true; }
        return;
      }
      s.call += dt;
      if (s.call >= AIR.call) { p.skillT = 0; airStrike(G, p, s.x, s.y); }
    },
    end(G, p) { const s = p._offAim; p._offAim = null; p.noFire = false; if (s) stopFx(s.h); }
  };
  function airStrike(G, p, cx, cy) {
    const boom = MB('bullet_airstrike_fire', 'DelayExplode', 'boom_time', 0.375);
    const fr = MB('explode_fire', 'SerialExplode', 'fire_rate', 40), R0 = AIR.r0 * AIR.size;
    const dir = SK.rand() < 0.5 ? 1 : -1;
    for (let i = 0; i < AIR.n; i++) {
      const a = SK.rand() * Math.PI * 2, d = Math.sqrt(SK.rand()) * AIR.scatter;
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      G.props.push({ x, y: -1e9, t: -i * AIR.gap, draw() {},
        update(G2, q, dt) {
          const t0 = q.t; q.t += dt;
          if (t0 < 0 && q.t >= 0) fx(G2, 'bullet_airstrike_fire', x, y, {});
          if (q.t < boom) return;
          q.gone = true;
          fx(G2, 'explode_fire', x, y - 4, {});
          for (const t of inRadius(G2, x, y - 4, R0)) { hit(G2, p, t, AIR.dmg, { repel: 3 }); if (SK.rand() * 100 < fr) debuff(G2, t, 'fire'); }
          G2.shake = Math.max(G2.shake, 3);
        } });
    }
    // Bóng máy bay (officer_3_0 của bullet_plane) lướt qua vùng thả bom.
    const pl = SK.prefab('bullet_plane'), shadow = pl && pl.find(q => q.f);
    const span = AIR.n * AIR.gap * AIR.plane;
    if (shadow) G.props.push({ x: cx, y: 1e9, t: 0,
      update(G2, q, dt) { q.t += dt; if (q.t > AIR.n * AIR.gap + 0.8) q.gone = true; },
      draw(ctx, G2, q) { const x = cx + dir * (-span / 2 - 60 + q.t * AIR.plane); SK.draw(ctx, shadow.f, x, cy - 10, { flip: dir < 0, alpha: 0.6 }); } });
  }

  // ================================================================ ĐẠO SĨ (c16)
  // Vạn Kiếm Quy Tông [ĐO c16/skill 1: cd 7, args "7;3"; C17Controller.CreatingSword / CreateSword / SetBulletTarget;
  // BulletTaoistSword.Takeoff / FixedUpdatePosition / <Attack>d__29; bullet_taoist_sword]: 7 kiếm (góc đầu i·360/7) quay
  // quanh điểm cao 1 đơn vị trên người 720°/s, mỗi kiếm bán kính ngẫu nhiên 1.5..3.5 đơn vị, nở ra với tốc 2·r/s (0.5 s);
  // kiếm chém đạn địch. Trong lúc kiếm quay, đạn của mình trúng quái nào thì đánh dấu quái đó. Sau 3 s (WaitForSeconds 3 =
  // số thứ hai của args) kiếm lao đi 36 đơn vị/s, ưu tiên quái bị đánh dấu rồi tới quái khác, về kho sau 0.7 s; mỗi nhát
  // ProcessSkillDamage(2), xuyên quái.
  const GS = { orbit: 3, spin: SK.deg(720), rMin: 1.5 * U, rMax: 3.5 * U, dy: 1 * U, speed: 36 * U, fly: 0.7, dmg: 2, range: 14 * T };
  S.genesis_of_swords = {
    start(G, p) {
      layer(G);
      const a = String(cfg(p, 'genesis_of_swords').args || '7;3').split(';');
      const n = parseInt(a[0], 10) || 7, orbit = parseFloat(a[1]) || GS.orbit;
      const parts = SK.prefab('bullet_taoist_sword');
      const swords = [];
      for (let i = 0; i < n; i++) swords.push({ a: i / n * Math.PI * 2, r: 0, R: SK.randf(GS.rMin, GS.rMax), x: p.x, y: p.y - GS.dy, st: 'orbit', t: 0, hitSet: [] });
      const run = G._gsRun = { marked: [] };
      G.props.push({
        x: 0, y: 1e9, t: 0,
        update(G2, q, dt) {
          q.t += dt;
          if (q.t >= orbit && run.marked) {
            // SetBulletTarget: quái bị đánh dấu trước, còn kiếm thì chia cho quái gần nhất.
            const rest = G2.enemies.filter(e => alive(e) && inRoom(G2, e) && run.marked.indexOf(e) < 0 && Math.hypot(e.x - p.x, e.y - p.y) < GS.range)
              .sort((x, y) => Math.hypot(x.x - p.x, x.y - p.y) - Math.hypot(y.x - p.x, y.y - p.y));
            const list = run.marked.filter(alive).concat(rest);
            swords.forEach((s, i) => {
              const e = list[i % Math.max(1, list.length)];
              s.ang = e ? Math.atan2(ec(e)[1] - s.y, ec(e)[0] - s.x) : s.a + Math.PI / 2;
              s.st = 'fly'; s.rot = s.ang; s.t = 0;
            });
            for (const m of run.marked) stopFx(m._gsFx);
            run.marked = null;
            if (G2._gsRun === run) G2._gsRun = null;
          }
          for (const s of swords) {
            if (s.st === 'gone') continue;
            if (s.st === 'orbit') {
              s.a += GS.spin * dt; s.r = Math.min(s.R, s.r + 2 * s.R * dt);
              s.x = p.x + Math.cos(s.a) * s.r; s.y = p.y - GS.dy + Math.sin(s.a) * s.r; s.rot = s.a + Math.PI / 2;
            } else {
              s.t += dt;
              if (s.t > GS.fly) { s.st = 'gone'; continue; }
              s.x += Math.cos(s.ang) * GS.speed * dt; s.y += Math.sin(s.ang) * GS.speed * dt;
            }
            for (const e of G2.enemies) {
              if (!alive(e) || s.hitSet.indexOf(e) >= 0) continue;
              const [cx, cy] = ec(e);
              if (Math.abs(s.x - cx) < e.hb.size[0] * e.scale / 2 + 5 && Math.abs(s.y - cy) < e.hb.size[1] * e.scale / 2 + 5) {
                s.hitSet.push(e); hit(G2, p, e, GS.dmg, { noMul: true, crit: false, ang: s.rot, repel: 1, fx: 'hit_white', tag: 'sword' });
              }
            }
            for (const b of G2.bullets) if (b.side === 'e' && !b.dead && Math.hypot(b.x - s.x, b.y - s.y) < 7 + b.r) b.dead = true;
          }
          if (swords.every(s => s.st === 'gone')) q.gone = true;
        },
        draw(ctx) { for (const s of swords) if (s.st !== 'gone') drawRip(ctx, parts, s.x, s.y, { rot: s.rot }); }
      });
    }
  };
  SK.on('enemyHit', (G, e) => {
    const run = G._gsRun;
    if (!run || !run.marked || G._skHit || !G._hitBullet || run.marked.indexOf(e) >= 0) return;
    run.marked.push(e);
    e._gsFx = fx(G, 'skill0_mark_s0', e.x, e.y, { follow: e, dy: -(e.hb.off[1] + e.hb.size[1] / 2) * e.scale - 4, dur: GS.orbit });
  });
  // Bát Quái [ĐO c16/skill 2: cd 8.5, duration 5; C17Controller.RoleSkill1 / RepleEnemy; taoist_gravity: RGShieldRebound
  // angleSpeed 30, RGBulletModTrigger, ảnh skill_taoist_shield]: trận pháp bám theo người 5 s (+0.33 s hiện hình); lúc mở
  // đẩy mọi quái trong 3.5 đơn vị ra ngoài (CircleCastAll 3.5, lực 30); đạn địch vào trận đổi phe, sát thương ×1, bay ngược
  // ra ngoài. Đồng minh trong trận nhận một buff ngẫu nhiên (_randomBuffPath) — chưa làm.
  const BAGUA = { push: 3.5 * U, r: 40, show: 0.33, force: 30 };   // r: collider taoist_gravity r 40 px [ĐO sk-data]
  S.bagua = {
    start(G, p) {
      layer(G);
      p.skillT = (cfg(p, 'bagua').dur || 5) + BAGUA.show;
      const parts = SK.prefab('taoist_gravity'), img = parts && parts.find(q => q.f);
      const spin = MB('taoist_gravity', 'RGShieldRebound', 'angleSpeed', 30);
      p._bagua = { t: 0 };
      for (const e of inRadius(G, p.x, p.y - 6, BAGUA.push)) {
        if (e.boss) continue;
        const a = Math.atan2(ec(e)[1] - (p.y - 6), ec(e)[0] - p.x);
        e.kx = Math.cos(a) * BAGUA.force * U; e.ky = Math.sin(a) * BAGUA.force * U;
      }
      G.props.push({ x: p.x, y: -1e9 + p.y, t: 0,
        update(G2, q, dt) {
          q.t += dt; q.x = p.x;
          if (!p._bagua) { q.gone = true; return; }
          const cx = p.x, cy = p.y - 6;
          for (const b of G2.bullets) {
            if (b.side !== 'e' || b.dead) continue;
            const d = Math.hypot(b.x - cx, b.y - cy);
            if (d < BAGUA.r) {
              const a = Math.atan2(b.y - cy, b.x - cx), sp = Math.max(Math.hypot(b.vx, b.vy), 120);
              b.side = 'p'; b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.ang = a; b.crit = false; b.repel = 1;
              b.dmg = Math.max(1, b.dmg || 1); b.life = Math.max(b.life, 1);
            }
          }
        },
        draw(ctx, G2, q) {
          if (!img) return;
          const f = SK.frame(img.f); if (!f) return;
          const s = BAGUA.r * 2 / f[3], al = Math.min(1, q.t / BAGUA.show) * (p.skillT < 0.5 ? p.skillT / 0.5 : 1);
          ctx.save(); ctx.globalAlpha *= 0.8 * al; ctx.translate(p.x, p.y - 2); ctx.scale(1, 0.62); ctx.rotate(SK.deg(spin) * q.t);
          SK.draw(ctx, img.f, 0, 0, { sx: s, sy: s }); ctx.restore();
        } });
    },
    end(G, p) { p._bagua = null; }
  };
  // Ngự Kiếm [ĐO c16/skill 3: cd 11, duration 2.5; C17Controller.RoleSkill2 → RGMountController.Mount(mtao_sword, thân
  // mech_39); FlyMountController speedRate 2.22]: cưỡi kiếm 2.5 s, tốc ×2.22, bay qua địa hình, miễn sát thương, vẫn bắn
  // được (useControllerWeapon 1); lưỡi kiếm RGSword gây ProcessSkillDamage(10). Nhịp trúng lại cùng quái nằm ở lớp gốc
  // RGSword/RGSwordTrigger chưa đọc [ƯỚC LƯỢNG 0.5 s].
  const FLY = { move: 2.22, dmg: 10, every: 0.5 };
  S.sword_fly = {
    start(G, p) {
      layer(G);
      p.skillT = cfg(p, 'sword_fly').dur || 2.5;
      setMul(p, 'moveMul', 'fly', FLY.move);
      ghost(p, true); hurtMods(p).fly = () => 0;
      p._fly = { hit: new Map() };
      const pf = SK.prefab('mtao_sword'), body = pf && pf.find(q => q.f === 'mech_39');
      G.props.push({ x: p.x, y: p.y + 1, update(G2, q) { q.x = p.x; q.y = p.y + 1; if (!p._fly) q.gone = true; },
        draw(ctx) { if (body) SK.draw(ctx, body.f, p.x, p.y + 2, { flip: p.face < 0, sx: 1.2 }); } });
      p._liftY = 6;
    },
    update(G, p) {
      const s = p._fly; if (!s) return;
      // Lưỡi kiếm: collider /img/blade/b hộp 44 × 24 px lệch (4.8, 2.4) [ĐO sk-data mtao_sword].
      const bx = p.x + 4.8 * p.face, by = p.y - 2.4;
      for (const e of G.enemies.filter(q => alive(q) && Math.abs(ec(q)[0] - bx) < 22 + q.r && Math.abs(ec(q)[1] - by) < 12 + q.r)) if ((s.hit.get(e) || 0) <= G.t) { s.hit.set(e, G.t + FLY.every); hit(G, p, e, FLY.dmg, { repel: 3, fx: 'hit_white' }); }
    },
    end(G, p) { setMul(p, 'moveMul', 'fly', 1); ghost(p, false); delete hurtMods(p).fly; p._fly = null; p._liftY = 0; }
  };

  // ---------------------------------------------------------------- vẽ thêm lên người chơi
  // (tàng hình mờ đi, nhảy vồ / cưỡi kiếm nhấc người lên, cung của Tiên Tộc) — bọc SK.drawPlayer, không sửa actors.js.
  const drawPlayer0 = SK.drawPlayer;
  SK.drawPlayer = function (ctx, G) {
    const p = G.player;
    if (!p) return drawPlayer0(ctx, G);
    const lift = p._liftY || 0;
    ctx.save();
    if (lift) {
      ctx.save(); ctx.globalAlpha *= 0.35; ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 6, 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.translate(0, -lift);
    }
    // drawPlayer của actors.js GÁN globalAlpha (không nhân): tạm chắn thuộc tính trên ctx để độ mờ tàng hình nhân vào.
    if (p._alpha != null) {
      const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ctx), 'globalAlpha'), k = p._alpha;
      Object.defineProperty(ctx, 'globalAlpha', { configurable: true, get() { return d.get.call(this) / k; }, set(v) { d.set.call(this, v * k); } });
      ctx.globalAlpha = 1;
      try { drawPlayer0(ctx, G); } finally { delete ctx.globalAlpha; }
    } else drawPlayer0(ctx, G);
    if (p._bow && p._bow.t > 0) {
      const bow = (XS['^bow_[0-9]$'] || [])[0];
      if (bow) SK.drawGun(ctx, bow, p.x + 3 * p.face, p.y - 6, p._bow.ang, null, {});
    }
    ctx.restore();
  };
  timers.bow = (G, p, dt) => { if (p._bow) { p._bow.t -= dt; if (p._bow.t <= 0) p._bow = null; } };

  // ---------------------------------------------------------------- nội tại [ĐO heroes.json default_buff → Buff_name/info]
  // Mô-đun nâng cấp nhân vật có thể tắt bằng SK.passiveOn = (p) => boolean.
  const passiveOn = p => (SK.passiveOn ? SK.passiveOn(p) : true);
  function passiveTick(G, p, dt) {
    if (!passiveOn(p)) return;
    // Chiến Binh Cuồng — default_buff 32 (MasterSpeedAtk) [ĐO TalentBuff.BuffMasterSpeedAtk const]: mỗi đòn +1 tầng giữ 3 s,
    // +2% tốc đánh/tầng, tối đa 5 tầng, đủ tầng thêm 10%; hết giờ thì rơi 1 tầng mỗi 0.25 s (StackDecayInterval).
    if (p.hero === 'viking') {
      const s = p._fr || (p._fr = { n: 0, t: 0 });
      if (s.t > 0) { s.t -= dt; if (s.t <= 0 && s.n > 0) { s.n--; s.t = s.n ? MSA.decay : 0; } }
      setMul(p, 'rateMul', 'fire_rate', 1 + s.n * MSA.per + (s.n >= MSA.max ? MSA.full : 0));
    }
  }
  const MSA = { dur: 3, per: 0.02, max: 5, full: 0.1, decay: 0.25 };
  SK.on('fire', (G, p) => { if (p.hero === 'viking' && passiveOn(p)) { const s = p._fr || (p._fr = { n: 0, t: 0 }); s.n = Math.min(MSA.max, s.n + 1); s.t = MSA.dur; } });
  // Hiệp Sĩ — Khiên Kiên Cường (Buff 05): "Khi Hộ Giáp bị phá hủy sẽ không chịu thêm DMG" [ĐO Buff_info_05].
  function installPassives(G) {
    const p = G.player; if (!p) return;
    layer(G);
    if (p.hero === 'knight') hurtMods(p).strong_shield = (G2, pl, dmg) => (passiveOn(pl) && pl.armor > 0 ? Math.min(dmg, pl.armor) : dmg);
  }
  SK.on('stageEnter', installPassives);
  SK.on('runStart', installPassives);
  // Kẻ Lãng Du — Rãnh Xuyên Tâm (Buff 00): "Đạn bạo kích sẽ xuyên qua địch" [ĐO Buff_info_00]; mỗi lần xuyên lại tung chí mạng.
  SK.on('enemyHit', (G, e, dmg, crit) => {
    const p = G.player;
    const b = G._hitBullet;
    if (!crit || !b || !b.crit || !p || p.hero !== 'ranger' || !passiveOn(p) || G._skHit) return;
    // Lõi xét b.pierce ngay sau sự kiện này: thêm một lượt xuyên, b.hits giữ con vừa trúng khỏi bị trúng lại.
    b.pierce = (b.pierce || 0) + 1;
  });

  // ---------------------------------------------------------------- áp số thật 8.6 vào bảng nhân vật + tiếng
  // Thời lượng hiển thị vòng HUD của kỹ năng mà start() tự định (không có trong config).
  const DUR_UI = { dodge: ROLL.t, dark_blade: DB.dur, bat_swarm: BS.maxT, berserk: WB.delay + WB.dur, regeneration_pact: RP.pact + RP.aura, pray: PRAY.dur, rage: RG.dur, iaido: IAIDO.t, leap: LEAP.t + LEAP.freeze, firestorm: STORM.life, arrow_rain: RAIN.full };
  function apply86() {
    const s = S86(); if (!s) return false;
    for (const f in s.heroes) {
      const h = DS.heroes[f], r = s.heroes[f]; if (!h) continue;
      h.passive86 = r.passive;
      (h.skills || []).forEach((sk, i) => { const k = r.skills[i]; if (k) { sk.cd = k.cd; sk.dur = k.dur; sk.vi = k.vi; sk.max = k.max; } });
      for (const key of ['skill', '_skill0']) {
        const cur = h[key]; if (!cur) continue;
        const k = r.skills.find(x => x.id === cur.id); if (!k) continue;
        cur.cd = k.cd; cur.dur = DUR_UI[cur.id] != null ? DUR_UI[cur.id] : k.dur;
      }
    }
    return true;
  }
  // Tiếng: SK_AUDIO.byHero đoán 14/42 nhân vật (Knight = c00 là đoán). Thư mục skin ↔ cNN [ĐO sk-data heroes[].s0.index] và
  // clip kỹ năng theo từng ô kỹ năng [ĐO config/skills audioClipList] — ghi đè trong bộ nhớ, sfx.js đọc lúc phát.
  function fixAudio(p) {
    const A = window.SK_AUDIO, s = S86();
    if (!A || !s) return;
    for (const f in s.heroes) {
      const r = s.heroes[f];
      const hit = r.clipHit && A.clips[r.clipHit.trim()] ? r.clipHit.trim() : (A.byPrefab[r.c] || {}).hit;
      const sk = r.clipSkill && A.clips[r.clipSkill] ? r.clipSkill : (A.byPrefab[r.c] || {}).skill;
      A.byHero[f] = Object.assign({}, A.byHero[f], { prefab: r.c, hit: hit || (A.byHero[f] || {}).hit, skill: sk || null, guess: undefined });
    }
    if (p) {
      const k = K86(p.hero, p.h.skill && p.h.skill.id);
      const clip = k && [k.sfxSkin0].concat(k.sfx).find(c => c && A.clips[c]);
      if (clip) A.byHero[p.hero].skill = clip;
    }
  }
  const MULTI = new Set([4, 6, 9, 12]);
  SK.on('runStart', G => {
    apply86();
    const p = G.player; if (!p) return;
    const k = K86(p.hero, p.h.skill && p.h.skill.id);
    if (k) { p.h.skill.cd = k.cd; p.h.skill.dur = DUR_UI[k.id] != null ? DUR_UI[k.id] : (k.dur || p.h.skill.dur); }
    p._ch = null;
    // max là số lượt chỉ khi skillType thuộc {4, 6, 9, 12} [ĐO SkillInfo.get_hasMultiCount]; loại khác tự gọi charges() nếu cần.
    if (k && k.max > 0 && MULTI.has(k.type) && S[k.id]) charges(p, k.id);
    fixAudio(p);
  });
  // Chọn ô kỹ năng (giống lobby.applySkillSlot) — cho kiểm thử và mô-đun khác.
  SK.setSkillSlot = function (folder, slot) {
    const h = DS.heroes[folder]; if (!h) return false;
    if (!h._skill0) h._skill0 = h.skill;
    const sk = (h.skills || [])[slot];
    const slug = n => String(n || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    h.skill = slot > 0 && sk && S[slug(sk.name)] ? Object.assign({}, h._skill0, { id: slug(sk.name), name: sk.name, cd: sk.cd, dur: 0 }) : h._skill0;
    return h.skill.id;
  };
  // Biểu tượng thật cho mọi kỹ năng đã có mã [ĐO config/skills icon.sprite].
  function applyAll() {
    apply86(); fixAudio();
    for (const id in S) if (!S[id].icon) S[id].icon = iconFor(id) || null;
  }
  SK.skills86Apply = applyAll;   // data/sk-skills86.js nạp sau skills.js (kiểm thử chèn thẻ) thì gọi lại
  // Đồ nghề cho js/skills/<thư mục nhân vật>.js: mỗi tệp đăng ký SK.SKILLS[id] của một nhân vật.
  SK.skillKit = {
    S86, H86, K86, MB, CTRL, cfg, XP, XS, XC, pngAnim, firstFrame, saFrames,
    glow, drawRip, ripLen, ripFx, hasVfx, fx, stopFx,
    alive, ec, enemyTop, inRoom, nearest, inRadius, hit, stun, aimDir, targetAng, setMul, hurtMods, ghost,
    swapAnims, subAnim, heal, healFx, shoot, drawBolt, boltProp, DEBUFF, debuff,
    allies, addAlly, hpBar, walk, layer, timers, charges, useCharge, DUR_UI, iconFor
  };
  applyAll();
  if (document.readyState !== 'complete') addEventListener('load', applyAll);

  // Chưa làm (cần hệ riêng: thú cưỡi, chế độ ngắm/giữ nút, đổi hình dạng lớn): Hiệp Sĩ Thánh holy_warrior / splash_bash,
  // Kỹ Sư armor_mount, Kẻ Lãng Du cartwheel, Nhà Giả Kim concoction, Người Sói devour, Nữ Tu moon_shadow, Tu Sĩ Rừng
  // venom_vines / fuzzy_bear, Người Máy drone_swarm, Pháp Sư Tử Linh souls_resurrect và mọi kỹ năng của c17..c41.
  // Các id này rơi về dual_wield (actors.js cảnh báo một lần).
})();
