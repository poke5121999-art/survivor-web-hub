// Kỹ năng + nội tại của 42 nhân vật: đăng ký SK.SKILLS[id] (id = slug tên kỹ năng, trùng slug của lobby).
// Số lấy từ data/sk-skills86.js (tools/build_skills86.py, bản cài 8.6.0): cd/thời lượng/số lượt từ config/skills,
// số đạn/thú/hiệu ứng từ MonoBehaviour thật. Logic nằm trong mã IL2CPP (chưa đọc được) thì theo wiki [WIKI]
// hoặc ước lượng [ƯỚC LƯỢNG]. Hình: SK.vfx (hiệu ứng thật, data/sk-vfx.js) trước, thiếu thì cây prefab thật
// trong sk-data.js (tools/extra/skills.json).
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
  // Lượt hồi từng cái một theo cd; hết lượt thì nút hiện thời gian chờ lượt kế.
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
    p._cdAfter = ch.n > 0 ? 0.25 : ch.cd - ch.t;   // 0.25 s giữa hai lần bấm [ƯỚC LƯỢNG]
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
    if (ch.n > 0 && !(p.skillT > 0) && p.skillCd > 0.25) p.skillCd = 0;
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
  // Song Thủ [ĐO c00/skill 1: cd 10, duration 5, prefab effect_c1_skill, tiếng fx_skill_c1]: cầm thêm bản sao vũ khí.
  S.dual_wield = {
    endOnSwap: true,
    start(G, p) {
      layer(G);
      p.skillT = cfg(p, 'dual_wield').dur || 5;
      p.dual = SK.makeWeapon(p.weapons[p.cur].id); p.dual.cd = 0.06;
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
      p.dual = SK.makeWeapon((o || p.weapons[p.cur]).id); p.dual.cd = 0.06;
      fx(G, 'effect_c1_skill', p.x, p.y, { follow: p, dur: 0.5 });
    },
    update(G, p) {
      const o = p.weapons[1 - p.cur] || p.weapons[p.cur];
      if (p.dual && o && p.dual.id !== o.id) { p.dual = SK.makeWeapon(o.id); p.dual.cd = 0.06; }
    },
    end(G, p) { p.dual = null; }
  };
  // Đả Kích Hỗn Độn [ĐO c00/skill 3: cd 8, duration 5; effect_chaos = BuffRandomEffectTrigger possibility 100]:
  // mỗi đòn vũ khí trúng quái gây một hiệu ứng ngẫu nhiên (lửa / băng / độc / điện / choáng).
  const CHAOS = ['fire', 'ice', 'poison', 'ele', 'dizzy'];
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
    if (!p || !p._chaos || G._skHit) return;
    debuff(G, e, CHAOS[Math.floor(SK.rand() * CHAOS.length)]);
  });

  // ================================================================ KẺ LÃNG DU (c01)
  // Lộn Nhào [ĐO c01/skill 1: cd 2.5; C02Controller.rollSpeed 1]: lăn theo hướng đang đi, né mọi sát thương 0.5 s [WIKI].
  const ROLL_T = 0.5, ROLL_DIST = 4 * T;   // quãng lăn 4 ô [ƯỚC LƯỢNG]
  S.dodge = {
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
      const mv = I.moveVec(), walkPx = p.h.speed * U * (p.speedMul || 1) * (p.moveMul || 1) * dt;
      const k = 2 * (1 - r.t / ROLL_T), spd = ROLL_DIST / ROLL_T * CTRL('ranger', 'rollSpeed', 1) * Math.max(0.2, k) * dt;
      SK.moveBox(G.map, p, Math.cos(r.ang) * spd - mv.x * walkPx, Math.sin(r.ang) * spd - mv.y * walkPx, p.h.body.r);
    },
    end(G, p) { p._roll = null; ghost(p, false); delete hurtMods(p).dodge; swapAnims(p, null); }
  };
  // Bạt Đao [ĐO c01/skill 2: cd 3 mỗi lượt, maxCount 3, prefab skill_slash (RGSwordSlash)]: lướt 10 ô về phía quái,
  // quái trên đường lướt nhận 8 sát thương, không nhận sát thương khi lướt [WIKI].
  const IAIDO = { dist: 10 * T, t: 0.16, dmg: 8, w: 14 };   // thời gian lướt, bề rộng [ƯỚC LƯỢNG]
  S.iaido = {
    start(G, p) {
      layer(G);
      charges(p, 'iaido'); useCharge(p, 'iaido');
      const { e, ang } = targetAng(G, p, IAIDO.dist + 2 * T);
      let dist = IAIDO.dist;
      if (e) dist = Math.min(dist, Math.hypot(ec(e)[0] - p.x, ec(e)[1] - p.y) + 2 * T);
      p.skillT = IAIDO.t;
      p._iaido = { ang, x0: p.x, y0: p.y, v: dist / IAIDO.t, hit: [] };
      if (Math.abs(Math.cos(ang)) > 0.1) p.face = Math.cos(ang) > 0 ? 1 : -1;
      ghost(p, true); hurtMods(p).iaido = () => 0;
    },
    update(G, p, dt) {
      const s = p._iaido; if (!s) return;
      const mv = I.moveVec(), walkPx = p.h.speed * U * (p.moveMul || 1) * dt;
      SK.moveBox(G.map, p, Math.cos(s.ang) * s.v * dt - mv.x * walkPx, Math.sin(s.ang) * s.v * dt - mv.y * walkPx, p.h.body.r);
    },
    end(G, p) {
      const s = p._iaido; p._iaido = null;
      ghost(p, false); delete hurtMods(p).iaido;
      if (!s) return;
      // Vệt chém thật (skill_slash) dọc đường lướt; trúng mọi quái nằm trong dải rộng IAIDO.w.
      const L = Math.hypot(p.x - s.x0, p.y - s.y0), c = Math.cos(s.ang), sn = Math.sin(s.ang);
      for (const e of G.enemies) {
        if (!alive(e)) continue;
        const [x, y] = ec(e), dx = x - s.x0, dy = y - (s.y0 - 7);
        const u = dx * c + dy * sn, v = -dx * sn + dy * c;
        if (u > -8 && u < L + 8 && Math.abs(v) < IAIDO.w / 2 + e.r) hit(G, p, e, IAIDO.dmg, { critChance: p.crit, ang: s.ang, repel: 2, fx: 'hit_blue2' });
      }
      const mx = (s.x0 + p.x) / 2, my = (s.y0 + p.y) / 2 - 7;
      const f = SK.frame('skill_slash_0');
      ripFx(G, 'skill_slash', mx, my, { top: true, rot: c < 0 ? s.ang + Math.PI : s.ang, flip: c < 0, scale: f ? Math.max(1, L / f[3]) : 1, dur: 0.3 });
      G.shake = Math.max(G.shake, 2);
    }
  };

  // ================================================================ PHÙ THUỶ (c02)
  // Sét Đánh [ĐO c02/skill 1: cd 6; thunder BulletThunder: atk 5, max_count 4, dizzy_rate 70, buff_ele]:
  // sét đánh con gần nhất trong tầm nhìn, nhảy thêm tối đa 4 lần (bỏ qua tường); 70% choáng.
  const LS = { jumpRange: 7 * T, range: 13 * T, delay: 0.3, gap: 0.09 };   // tầm nhảy, trễ [ƯỚC LƯỢNG]
  S.lightning_strike = {
    start(G, p) {
      layer(G);
      const atk = MB('thunder', 'BulletThunder', 'atk', 5), jumps = MB('thunder', 'BulletThunder', 'max_count', 4), dz = MB('thunder', 'BulletThunder', 'dizzy_rate', 70);
      fx(G, 'effect_c3_skill', p.x, p.y, { follow: p, layer: 'ground' });
      const first = nearest(G, p.x, p.y - 6, LS.range, { los: true });
      const chain = [];
      if (first) {
        chain.push(first);
        let cur = first;
        for (let j = 0; j < jumps; j++) {
          const [cx, cy] = ec(cur);
          const nx = nearest(G, cx, cy, LS.jumpRange, { skip: e => chain.indexOf(e) >= 0 });
          if (!nx) break;
          chain.push(nx); cur = nx;
        }
      }
      let t = 0, i = 0;
      G.props.push({
        x: 0, y: -1e9, draw() {},
        update(G2, q, dt) {
          t += dt;
          while (t >= LS.delay + i * LS.gap && i < chain.length) {
            const e = chain[i], prev = i ? chain[i - 1] : null;
            const [x, y] = ec(e);
            // Tia đầu từ trời xuống, các tia sau nối từ quái trước.
            boltProp(G2, prev ? ec(prev) : [x, y - 150], [x, y], 0.3);
            if (alive(e)) {
              hit(G2, p, e, atk, { repel: 1, fx: 'hit_blue' });
              debuff(G2, e, 'ele');
              if (SK.rand() * 100 < dz) debuff(G2, e, 'dizzy');
            }
            G2.shake = Math.max(G2.shake, 2.5);
            i++;
          }
          if (i >= chain.length) q.gone = true;
        }
      });
      if (!chain.length) boltProp(G, [p.x + p.face * 40, p.y - 160], [p.x + p.face * 40, p.y - 6], 0.3);
    }
  };
  // Băng Xuyên [ĐO c02/skill 2: cd 6; explode_ice_box: ExplodeIceBox damage 6, repel 3, buff_ice]: một dải 6 gai băng
  // chạy về phía trước 9 ô, gây 6 sát thương + đóng băng, chặn đạn, tan sau 1 s [WIKI].
  const FROST = { n: 6, len: 9 * T, life: 1, gap: 0.05 };
  S.piercing_frost = {
    start(G, p) {
      layer(G);
      const { ang } = targetAng(G, p);
      const dmg = MB('explode_ice_box', 'ExplodeIceBox', 'damage', 6), rep = MB('explode_ice_box', 'ExplodeIceBox', 'repel', 3);
      const hitSet = [];
      for (let i = 0; i < FROST.n; i++) {
        const d = (i + 1) * FROST.len / FROST.n, x = p.x + Math.cos(ang) * d, y = p.y + Math.sin(ang) * d;
        G.props.push({
          x, y, t: -i * FROST.gap, fx: null,
          update(G2, q, dt) {
            const t0 = q.t; q.t += dt;
            if (t0 < 0 && q.t >= 0) {
              q.fx = fx(G2, 'explode_ice_box', x, y, { dur: FROST.life, state: 'explode_ice_box_start' });
              for (const e of inRadius(G2, x, y - 8, 12)) if (hitSet.indexOf(e) < 0) { hitSet.push(e); hit(G2, p, e, dmg, { repel: rep, ang, fx: 'hit_blue' }); debuff(G2, e, 'ice'); }
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
  // Bão Lửa [ĐO c02/skill 3: cd 4.5 mỗi lượt, maxCount 6; bullet_fire_storm: BulletFireStorm + BuffEffectTrigger buff_fire]:
  // dùng hết lượt đang có, mỗi lượt một quả cầu lửa bay vòng quanh người 5 s [WIKI], xuyên tường, phá đạn địch.
  const STORM = { life: 5, r0: 1.5 * T, r1: 6 * T, spin: 3.2, dmg: 3, burn: 30, every: 0.3 };   // quỹ đạo, sát thương, % cháy [ƯỚC LƯỢNG]
  S.firestorm = {
    start(G, p) {
      layer(G);
      charges(p, 'firestorm');
      const n = useCharge(p, 'firestorm', true);
      const balls = [];
      for (let i = 0; i < n; i++) {
        const b = { a: i / n * Math.PI * 2, x: p.x, y: p.y - 8, hit: new Map() };
        b.h = fx(G, 'bullet_fire_storm', b.x, b.y, { follow: b, dur: STORM.life });
        balls.push(b);
      }
      G.props.push({
        x: 0, y: -1e9, t: 0, draw() {},
        update(G2, q, dt) {
          q.t += dt;
          if (q.t > STORM.life) { for (const b of balls) stopFx(b.h); q.gone = true; return; }
          // Vòng xoáy nở dần từ quanh người ra cả phòng.
          const r = STORM.r0 + (STORM.r1 - STORM.r0) * Math.min(1, q.t / (STORM.life * 0.6));
          for (const b of balls) {
            b.a += STORM.spin * dt;
            b.x = p.x + Math.cos(b.a) * r; b.y = p.y - 8 + Math.sin(b.a) * r * 0.8;
            for (const e of G2.enemies) {
              if (!alive(e) || (b.hit.get(e) || 0) > q.t) continue;
              const [cx, cy] = ec(e);
              if (Math.hypot(cx - b.x, cy - b.y) < 8 + e.r) {
                b.hit.set(e, q.t + STORM.every);
                hit(G2, p, e, STORM.dmg, { repel: 1, fx: 'hit_red' });
                if (SK.rand() * 100 < STORM.burn) debuff(G2, e, 'fire');
              }
            }
            for (const q2 of G2.bullets) if (q2.side === 'e' && !q2.dead && Math.hypot(q2.x - b.x, q2.y - b.y) < 7 + q2.r) q2.dead = true;
          }
        }
      });
    }
  };

  // ================================================================ SÁT THỦ (c03)
  // Lưỡi Kiếm Bóng Tối [ĐO c03/skill 1: cd 10, args "4" = 4 lần hồi chiêu; sword_2_5_assassin + c03_trail]:
  // 1.5 s lướt, tốc chạy x2, miễn sát thương; chạm quái / bấm bắn thì chém; hạ quái thì hồi chiêu ngay [WIKI].
  const DB = { dur: 1.5, dmg: 8, crit: 10, lunge: 0.14, lungeDist: 3 * T, touch: 20 };   // [WIKI]; lunge [ƯỚC LƯỢNG]
  S.dark_blade = {
    start(G, p) {
      layer(G);
      p.skillT = DB.dur;
      p._db = { t: 0, ang: aimDir(p), slashed: false, trail: [], trailT: 0 };
      setMul(p, 'moveMul', 'dark_blade', 2);
      ghost(p, true); hurtMods(p).dark_blade = () => 0;
      p._night = DB.dur;
      p._db.h = fx(G, 'c03_trail', p.x, p.y, { follow: p, dur: DB.dur });
      if (!G._dbTrail || G.props.indexOf(G._dbTrail) < 0) G.props.push(G._dbTrail = trailProp(p));
      if (p._dbResetClock != null && G.t - p._dbResetClock > 7) p._dbResets = 0;   // 7 s không dùng thì hồi lại lượt [WIKI]
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
      const resets = +(cfg(p, 'dark_blade').args || 4);
      if (p._db && p._db.killed) { p._immuneT = 1; hurtMods(p).after = () => 0; } else ghost(p, false);
      if (p._db && p._db.killed && (p._dbResets || 0) < resets) { p._dbResets = (p._dbResets || 0) + 1; p._dbResetClock = G.t; p._cdAfter = 0; }
      if (p._db) stopFx(p._db.h);
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
        hit(G, p, t, DB.dmg, { critChance: DB.crit + (p.crit || 0), ang, repel: 3, fx: 'hit_assassin' });
        if (t.boss) p._cdAfter = p.h.skill.cd / 2;   // chém trúng trùm: hồi chiêu còn một nửa [ĐO mô tả c03 skill 0]
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
  // Tàng Hình [ĐO c03/skill 3: cd 6, duration 6; buff_stealth alpha 0.297, skill_assassin_night]: tàng hình (quái không
  // nhắm được) tới hết 6 s hoặc tới khi tấn công; sau đó đòn đánh mạnh hơn một lúc [WIKI].
  const INVIS = { after: 2, mul: 1.5 };   // thời gian và hệ số "đòn mạnh hơn" [ƯỚC LƯỢNG]
  S.invisibility = {
    start(G, p) {
      layer(G);
      p.skillT = cfg(p, 'invisibility').dur || 6;
      p.hidden = true; p._alpha = 0.297;   // [ĐO buff_stealth BuffStealth.buff_color.a]
      p._night = 0.6;
      fx(G, 'c03_show_effect_s0', p.x, p.y, {});
      p._invisT0 = G.t;
    },
    update(G, p) { if (I.down('attack') && G.t - p._invisT0 > 0.2) p.skillT = Math.min(p.skillT, 1e-4); },
    end(G, p) {
      p.hidden = false; p._alpha = null;
      p._strongT = INVIS.after; setMul(p, 'dmgMul', 'invis', INVIS.mul);
    }
  };
  timers.invis = (G, p, dt) => { if (p._strongT > 0) { p._strongT -= dt; if (p._strongT <= 0) setMul(p, 'dmgMul', 'invis', 1); } };
  // Phân Thân [ĐO c03/skill 2: cd 9; C04Controller.phantomHpRatio 3, delayCreatePhantom 0.8; npc_char_phantom:
  // PhantomSplitProcessor damageFactor 0.5, show effect c03_show_effect_s0]: sau 0.8 s gọi một bản sao máu =
  // 3 × (máu + giáp tối đa), cầm vũ khí đang dùng, đạn 50% sát thương; bấm lại thì thay bản sao cũ.
  S.doppelg_nger = {
    start(G, p) {
      layer(G);
      const delay = (cfg(p, 'doppelg_nger').skin0 || {}).delayCreatePhantom || 0.8;
      fx(G, 'c03_show_effect_s0', p.x, p.y, {});
      p._immuneT = 1; hurtMods(p).after = () => 0;
      const x = p.x, y = p.y;
      G.props.push({ x, y: -1e9, t: 0, draw() {},
        update(G2, q, dt) { q.t += dt; if (q.t >= delay) { q.gone = true; spawnPhantom(G2, p, x - 14 * p.face, y + 4); } } });
    }
  };
  function spawnPhantom(G, p, x, y) {
    for (const a of allies(G)) if (a.phantom) { a.gone = true; }
    const hpMax = CTRL('assassin', 'phantomHpRatio', 3) * (p.hpMax + p.armorMax);
    const k = MB('npc_char_phantom', 'PhantomSplitProcessor', 'damageFactor', 0.5);
    const w = p.weapons[p.cur], d = w && w.def;
    addAlly(G, {
      phantom: true, x, y, hp: hpMax, hpMax, face: p.face, box: [10, 14, 8], cd: 0.5, aim: 0, moving: false,
      onZero(G2, a) { a.gone = true; fx(G2, 'c03_show_effect_s0', a.x, a.y, {}); },
      update(G2, a, dt) {
        const e = nearest(G2, a.x, a.y - 7, 12 * T, { los: true });
        // Giữ khoảng 2..4 ô với chủ; có quái thì đứng bắn [ƯỚC LƯỢNG theo min/max_follow_distance 2/20 của NpcMercenaryController].
        const dp = Math.hypot(p.x - a.x, p.y - a.y);
        a.moving = false;
        if (dp > 20 * U) { a.x = p.x; a.y = p.y; } else if (dp > 4 * T || (!e && dp > 2 * T)) { walk(G2, a, p.x, p.y, 6 * U, dt); a.moving = true; }
        a.cd -= dt;
        if (e) {
          const [cx, cy] = ec(e); a.aim = Math.atan2(cy - (a.y - 7), cx - a.x); a.face = Math.cos(a.aim) >= 0 ? 1 : -1;
          if (a.cd <= 0 && d) {
            a.cd = 1 / (d.rps || 2);
            const n = d.pellets || 1;
            for (let i = 0; i < n; i++) shoot(G2, p, a.x + Math.cos(a.aim) * 8, a.y - 7 + Math.sin(a.aim) * 8, a.aim + SK.deg(SK.randf(-(d.spread || 0) / 2, (d.spread || 0) / 2)),
              { dmg: Math.max(1, Math.round((d.dmg || 3) * k)), speed: d.bulletSpeed || 16, sprite: d.bullet, hit: d.hit, critChance: (d.crit || 0) + p.crit });
          }
        }
      },
      draw(ctx, G2, a) {
        const key = a.moving ? p.anims.run : p.anims.idle, fr = SK.animFrame(key, a.t);
        ctx.save(); ctx.globalAlpha *= 0.75;
        if (fr) SK.drawTinted(ctx, fr, a.x, a.y, [0.12, 0.1, 0.2, 1], { flip: a.face < 0, pages: a.flash > 0 ? SK.pagesWhite : null });
        if (d && d.sprite) SK.drawGun(ctx, d.sprite, a.x + 3 * a.face, a.y - 6, a.aim, null, {});
        ctx.restore();
        hpBar(ctx, a, 22);
      }
    });
  }

  // ================================================================ NHÀ GIẢ KIM (c04)
  // Bom Khí [ĐO c04/skill 1: cd 6; bullet_bottle_0_enhance: Bullet01 speed 10, destroy_time 5, rotate_angle 20 →
  // Gas_Hit_Enemy_enhance: BulletGasEnhance damage 2, damage_radius 3, duration 6, buff_gas_1..3]. Ở trong khí thì
  // nhiễm độc tầng 1 → 2 (chậm) → 3 (lây trong 3 đơn vị) [ĐO BulletGasBuff1..3].
  S.gas_grenade = {
    start(G, p) {
      layer(G);
      const { ang } = targetAng(G, p);
      const hy = p.y - 6;
      throwBottle(G, p, p.x + Math.cos(ang) * 6, hy + Math.sin(ang) * 6, ang, {
        speed: MB('bullet_bottle_0_enhance', 'Bullet01', 'speed', 10) * U, life: MB('bullet_bottle_0_enhance', 'Bullet01', 'destroy_time', 5),
        sprite: 'bullet_48', spin: MB('bullet_bottle_0_enhance', 'Bullet01', 'rotate_angle', 20),
        land: (G2, x, y) => { fx(G2, 'explode_poison', x, y - 4, {}); gasPool(G2, p, x, y); }
      });
    }
  };
  // Chai bay thẳng (Bullet01) hoặc parabol (BulletParabola gravity/y_speed): vỡ khi chạm tường, thùng, quái.
  function throwBottle(G, p, x, y, ang, o) {
    const pr = {
      x, y, bx: x, by: y, h: 6, t: 0, spin: 0, z: 0, vz: o.vz || 0,
      update(G2, q, dt) {
        q.t += dt; q.spin += dt * (o.spin || 20) * 0.6;
        if (q.t > o.life) { q.gone = true; return; }
        if (o.vz) { q.vz -= o.grav * dt; q.z += q.vz * dt; if (q.z <= 0 && q.t > 0.05) { q.gone = true; o.land(G2, q.bx, q.by + q.h); return; } }
        const n = 4;
        for (let i = 0; i < n; i++) {
          const nx = q.bx + Math.cos(ang) * o.speed * dt / n, ny = q.by + Math.sin(ang) * o.speed * dt / n;
          const wall = W.solidAt(G2.map, nx, ny + q.h);
          const e = !o.vz && G2.enemies.find(t => { if (!alive(t)) return false; const [cx, cy] = ec(t); return Math.abs(nx - cx) < t.hb.size[0] * t.scale / 2 + 2 && Math.abs(ny - cy) < t.hb.size[1] * t.scale / 2 + 2; });
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
        // Ở trong khí mỗi 2 s thì lên một tầng độc [ƯỚC LƯỢNG]; khí gây `damage` mỗi 1 s [ƯỚC LƯỢNG nhịp].
        for (const e of inside) {
          const s = (soak.get(e) || 0) + dt; soak.set(e, s);
          const lvl = s < 2 ? 'gas1' : s < 4 ? 'gas2' : 'gas3';
          if (!(e._db && e._db[lvl] && e._db[lvl].t > DEBUFF[lvl]().t - 0.5)) debuff(G2, e, lvl);
        }
        if (q.tick <= 0) { q.tick = 1; for (const e of inside) hit(G2, p, e, dmg, { noMul: true, crit: false, tag: 'gas' }); }
      }
    });
  }
  // Bình Nguyên Tố [ĐO c04/skill 2: cd 4 mỗi lượt, maxCount 2; bullet_botton_gas/explode/frost: BulletParabola gravity 35,
  // y_speed 10 → Gas_Hit_Enemy (BulletGas 1 / 0.5 s, r 3) | explode_hit_enemy (Explode 8, cháy 50%) + Fire2 (BulletFire 2 /
  // 0.5 s, r 3) | bullet_frost (BulletFrost 1 / 0.5 s, r 3, 5 s, buff_ice)]: ném lần lượt độc → lửa → băng.
  const POT = ['gas', 'explode', 'frost'];
  S.elemental_potions = {
    start(G, p) {
      layer(G);
      charges(p, 'elemental_potions'); useCharge(p, 'elemental_potions');
      const kind = POT[(p._potI = ((p._potI == null ? -1 : p._potI) + 1) % 3)];
      const { e, ang } = targetAng(G, p, 8 * T);
      const g = MB('bullet_botton_' + kind, 'BulletParabola', 'gravity', 35) * U, vz = MB('bullet_botton_' + kind, 'BulletParabola', 'y_speed', 10) * U;
      const flight = 2 * vz / g;
      const dist = e ? Math.min(8 * T, Math.hypot(ec(e)[0] - p.x, ec(e)[1] - p.y)) : 5 * T;   // tầm ném 8 ô [WIKI]
      const spr = { gas: 'skill_effect_8', explode: 'skill_effect_8', frost: 'skill_effect_8' }[kind];
      throwBottle(G, p, p.x, p.y - 6, ang, { speed: dist / flight, life: 5, vz, grav: g, sprite: (SK.prefab('bullet_botton_' + kind) || []).map(q => q.f).find(Boolean) || spr, spin: 17,
        land: (G2, x, y) => potionPool(G2, p, kind, x, y) });
    }
  };
  function potionPool(G, p, kind, x, y) {
    if (kind === 'explode') {
      fx(G, 'explode_hit_enemy', x, y - 4, {});
      const dmg = MB('explode_hit_enemy', 'Explode', 'damage', 8), fr = MB('explode_hit_enemy', 'Explode', 'fire_rate', 50);
      for (const e of inRadius(G, x, y - 4, 2 * T)) { hit(G, p, e, dmg, { repel: 3 }); if (SK.rand() * 100 < fr) debuff(G, e, 'fire'); }
      G.shake = Math.max(G.shake, 3);
    }
    if (kind === 'gas') fx(G, 'explode_hit_enemy_gas', x, y - 4, {});
    const P = {
      gas: { pf: 'Gas_Hit_Enemy', cls: 'BulletGas', vfx: 'Gas_Hit_Enemy', buff: 'poison' },
      explode: { pf: 'Fire2', cls: 'BulletFire', vfx: 'Fire2', buff: 'fire' },
      frost: { pf: 'bullet_frost', cls: 'BulletFrost', vfx: 'bullet_frost', buff: 'ice' }
    }[kind];
    const r0 = MB(P.pf, P.cls, kind === 'explode' ? 'circleCastRadius' : 'damage_radius', 3) * U;
    const dmg = MB(P.pf, P.cls, 'damage', 1), every = MB(P.pf, P.cls, kind === 'explode' ? 'hitInterval' : 'hit_invert', 0.5);
    const dur = kind === 'frost' ? MB('bullet_frost', 'BulletFrost', 'duration', 5) : 6;   // độc/lửa 6 s [WIKI]
    const h = fx(G, P.vfx, x, y, { dur, layer: 'ground' });
    G.props.push({ x, y: -1e9, t: 0, tick: 0, draw() {},
      update(G2, q, dt) {
        q.t += dt; q.tick -= dt;
        if (q.t >= dur) { stopFx(h); q.gone = true; return; }
        if (q.tick > 0) return;
        q.tick = every;
        for (const e of inRadius(G2, x, y, r0, r0 * 0.62)) {
          hit(G2, p, e, dmg, { noMul: true, crit: false, tag: 'pool' });
          if (SK.rand() < 0.2) debuff(G2, e, P.buff);   // xác suất gây hiệu ứng mỗi nhịp [ƯỚC LƯỢNG]
        }
      } });
  }

  // ================================================================ KỸ SƯ (c05)
  // Tháp Súng [ĐO c05/skill 1: cd 9; C06Controller.battery_max_num 3; battery: RGBatteryController damage 3,
  // atk_cd 0.8, shoot_time 2, maxAngle 180, RoleAttribute max_hp 12, fadeDurTime 0.8; đạn bullet_12]: đặt tháp tại chỗ,
  // sống 10 s [WIKI]; mỗi đợt bắn liên tục `shoot_time` giây rồi nghỉ `atk_cd`.
  const GT = { life: 10, range: 12 * T, bulletSpeed: 18, rate: 6 };   // tầm, tốc đạn, số viên/giây [ƯỚC LƯỢNG]
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
    const pause = MB('battery', 'RGBatteryController', 'atk_cd', 0.8), burst = MB('battery', 'RGBatteryController', 'shoot_time', 2);
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
        shoot(G2, p, mx, my, a.ang + SK.deg(SK.randf(-4, 4)), { dmg, speed: GT.bulletSpeed, sprite: (SK.prefab('bullet_12') || []).map(q => q.f).find(f => f && !GLOW[f]) || 'bullet_1', hit: 'hit_orange', repel: 0.5 });
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
  // GunInterceptBattery: laser_point_line damage 3, repel 10]: tháp laser bắn hạ đạn địch trong tầm, không có đạn thì
  // bắn quái; sống 10 s [WIKI]. Nâng cấp bằng linh kiện chưa làm.
  const ICP = { life: 10, range: 5 * T, atkRange: 10 * T };   // tầm chặn/tầm bắn [ƯỚC LƯỢNG]
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
  // Bầy Dơi [ĐO c06/skill 1: cd 8; bullet_bat: BulletBat damage 5, bat_particle; C07Controller.skill0RestoreArmorRate 33]:
  // 6 con dơi tìm quái, cắn rồi bay về; 3 con về sau khi cắn thì hồi 1 máu; đầy máu thì năng lượng / 33% hồi giáp [WIKI+ĐO].
  const BS = { n: 6, range: 12 * T, speed: 11 * U, per: 3, maxT: 4 };   // số dơi, tầm [WIKI]; tốc bay [ƯỚC LƯỢNG]
  S.bat_swarm = {
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
      p._bats = { bats, back: 0, hits: 0, any: targets.length > 0, dmg: MB('bullet_bat', 'BulletBat', 'damage', 5) };
      p.skillT = BS.maxT + 1;
      G.props.push(batProp(p));
      fx(G, 'bat_particle', p.x, p.y - 10, {});
    },
    update(G, p) {
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
          const want = BS.speed * Math.min(1, 0.4 + b.t * 2);
          b.vx += (dx / (d || 1) * want - b.vx) * Math.min(1, dt * 7);
          b.vy += (dy / (d || 1) * want - b.vy) * Math.min(1, dt * 7);
          b.x += b.vx * dt; b.y += b.vy * dt;
          if (b.st === 'out' && d < 8) {
            hit(G, p, b.tgt, s.dmg, { noMul: true, crit: false, repel: 0.5, fx: 'hit_red' });
            b.hitOk = true; s.hits++; b.st = 'back';
          } else if (b.st === 'back' && (d < 8 || b.t > BS.maxT + 1)) {
            b.st = 'home';
            if (b.hitOk) {
              s.back++;
              if (s.back % BS.per === 0) {
                if (p.hp < p.hpMax) heal(G, p, 1);
                else if (SK.rand() * 100 < CTRL('vampire', 'skill0RestoreArmorRate', 33) && p.armor < p.armorMax) { p.armor++; SK.num(G, p.x, p.y - 26, '+1', '#9fd8ff'); }
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
          if (fr) SK.draw(ctx, fr, b.x, b.y, { flip: b.vx < 0 });
        }
      }
    };
  }
  // Xoáy Không Gian [ĐO c06/skill 2: cd 11; bullet_209: Bullet04 (giảm tốc rate 0.04) → bullet_84_blood:
  // BloodHoleTrigger damage 2, radius 3, interval 1]: phóng một viên, sau 6 ô hoặc khi chạm thì thành hố đen 2 s [WIKI]
  // hút quái + đạn vào, 2 sát thương ngay rồi mỗi giây, hút máu [WIKI].
  const SWIRL = { dist: 6 * T, speed: 10 * U, life: 2, pull: 60, heal: 1 };   // tốc bay, lực hút, hút máu [ƯỚC LƯỢNG]
  S.alien_swirl = {
    start(G, p) {
      layer(G);
      const { ang } = targetAng(G, p);
      const spr = (SK.prefab('bullet_209') || []).map(q => q.f).find(f => f && !GLOW[f]) || 'bullet_7';
      const b = { x: p.x + Math.cos(ang) * 8, y: p.y - 7 + Math.sin(ang) * 8, d: 0 };
      G.props.push({ x: b.x, y: 1e9, t: 0,
        update(G2, q, dt) {
          q.t += dt;
          const step = SWIRL.speed * dt;
          b.x += Math.cos(ang) * step; b.y += Math.sin(ang) * step; b.d += step;
          const e = G2.enemies.find(t => alive(t) && Math.hypot(ec(t)[0] - b.x, ec(t)[1] - b.y) < t.r + 5);
          if (b.d >= SWIRL.dist || e || W.solidAt(G2.map, b.x, b.y + 7)) { q.gone = true; blackHole(G2, p, b.x, b.y); }
        },
        draw(ctx) { glow(ctx, b.x, b.y, 8, [0.9, 0.1, 0.1, 0.4]); SK.draw(ctx, spr, b.x, b.y); } });
    }
  };
  function blackHole(G, p, x, y) {
    const r0 = MB('bullet_84_blood', 'BloodHoleTrigger@b', 'radius', 3) * U, dmg = MB('bullet_84_blood', 'BloodHoleTrigger@b', 'damage', 2), every = MB('bullet_84_blood', 'BloodHoleTrigger@b', 'interval', 1);
    const h = fx(G, 'bullet_84_blood', x, y, { dur: SWIRL.life });
    let tick = 0, t = 0, stolen = 0;
    G.props.push({ x, y: -1e9, draw() {},
      update(G2, q, dt) {
        t += dt; tick -= dt;
        if (t > SWIRL.life) { stopFx(h); q.gone = true; return; }
        for (const e of inRadius(G2, x, y, r0 * 1.3)) {
          if (e.boss) continue;
          const [cx, cy] = ec(e), d = Math.hypot(cx - x, cy - y) || 1;
          e.kx = (x - cx) / d * SWIRL.pull; e.ky = (y - cy) / d * SWIRL.pull;
        }
        for (const b of G2.bullets) {
          if (b.dead || b.vis) continue;
          const d = Math.hypot(b.x - x, b.y - y);
          if (d < r0) { if (d < 5) b.dead = true; else { b.vx += (x - b.x) / d * 600 * dt; b.vy += (y - b.y) / d * 600 * dt; } }
        }
        if (tick <= 0) {
          tick = every;
          for (const e of inRadius(G2, x, y, r0)) { hit(G2, p, e, dmg, { noMul: true, crit: false, fx: 'hit_red' }); stolen++; }
          if (stolen >= 4) { stolen -= 4; heal(G2, p, SWIRL.heal); }
        }
      } });
  }
  // Bất Tử [ĐO c06/skill 3: cd 13, duration 3.5; effect_vampire_body (VampireEffectTrigger hpRestore 1, energyRestore 5);
  // ProcessPlayerMaxHp]: sát thương nhận vào đổi thành máu + năng lượng; đầy máu thì nâng máu tối đa (tối đa +10) [WIKI].
  S.immortal = {
    start(G, p) {
      layer(G);
      p.skillT = cfg(p, 'immortal').dur || 3.5;
      p._imm = { extra: 0, h: fx(G, 'effect_vampire_body', p.x, p.y, { follow: p, dur: p.skillT }) };
      const hpR = MB('effect_vampire_body', 'VampireEffectTrigger@b', 'hpRestore', 1), enR = MB('effect_vampire_body', 'VampireEffectTrigger@b', 'energyRestore', 5);
      hurtMods(p).immortal = (G2, pl, dmg) => {
        const s = pl._imm; if (!s) return dmg;
        for (let i = 0; i < dmg; i++) {
          if (pl.hp < pl.hpMax) heal(G2, pl, hpR);
          else if (s.extra < 10) { s.extra++; pl.hpMax++; pl.hp++; SK.num(G2, pl.x, pl.y - 26, '+1', '#ff6bd0'); }
        }
        pl.energy = Math.min(pl.energyMax, pl.energy + enR * dmg);
        pl.invulT = 0.3;
        return 0;
      };
    },
    end(G, p) {
      const s = p._imm; p._imm = null; delete hurtMods(p).immortal;
      if (!s) return;
      stopFx(s.h);
      // Máu tối đa tăng thêm giữ "một lúc" rồi trả [WIKI]; giữ 10 s [ƯỚC LƯỢNG].
      if (s.extra) p._immExtra = { n: s.extra, t: 10 };
    }
  };
  timers.immortal = (G, p, dt) => {
    const s = p._immExtra; if (!s) return;
    s.t -= dt;
    if (s.t <= 0) { p.hpMax -= s.n; p.hp = Math.min(p.hp, p.hpMax); p._immExtra = null; }
  };

  // ================================================================ HIỆP SĨ THÁNH (c07)
  // Khiên Năng Lượng [ĐO c07/skill 1: cd 12, duration 4; prefab shield: CircleCollider r 0.8 trên nút `root`, clip shield_ide
  // đặt root scale 4 → bán kính 3.2 đơn vị]: bong bóng lớn hút mọi sát thương, nuốt đạn địch. Vòng hình của SK.vfx ở cỡ 1
  // nhỏ hơn collider một chút, phóng 1.2 cho khớp [ƯỚC LƯỢNG].
  S.energy_shield = {
    start(G, p) {
      layer(G);
      p.skillT = cfg(p, 'energy_shield').dur || 4;
      const r = 0.8 * 4 * U;
      hurtMods(p).shield = (G2, pl) => { pl._shieldHit = 0.15; return 0; };
      p._shield = { r, h: fx(G, 'shield', p.x, p.y - 8, { follow: p, dy: -8, scale: 1.2, dur: p.skillT }) };
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
    end(G, p) { delete hurtMods(p).shield; if (p._shield) stopFx(p._shield.h); p._shield = null; }
  };

  // ================================================================ TIÊN TỘC (c08)
  // Bắn Tập Trung [ĐO c08/skill 1: cd 6 mỗi mũi, maxCount 3; bullet_c09: RGBTEnergy → explode_energy2 (ExplodeEnergy
  // damage 8, scaleFactor 2), sizeFactor 2.5, damageFactor 0.5; cung bow_0]: bắn tiễn phép tự ngắm; mũi thứ ba mạnh hơn;
  // hạ quái bằng tiễn hồi 3 năng lượng, 3 lần hạ hồi 1 mũi [WIKI].
  const FF = { speed: 20, dmg: 8, bigMul: 1.5 };   // tốc tiễn, sát thương thân tiễn, hệ số mũi thứ 3 [ƯỚC LƯỢNG]
  S.focus_fire = {
    start(G, p) {
      layer(G);
      charges(p, 'focus_fire'); useCharge(p, 'focus_fire');
      p._ffN = (p._ffN || 0) + 1;
      const big = p._ffN % 3 === 0;
      const { ang } = targetAng(G, p);
      p._bow = { t: 0.35, ang };
      const x = p.x + Math.cos(ang) * 8, y = p.y - 7 + Math.sin(ang) * 8;
      const exDmg = MB('explode_energy2', 'ExplodeEnergy', 'damage', 8) * MB('bullet_c09', 'RGBTEnergy@b', 'damageFactor', 0.5) * (big ? FF.bigMul : 1);
      const exR = MB('bullet_c09', 'RGBTEnergy@b', 'sizeFactor', 2.5) * U * 0.5 * (big ? FF.bigMul : 1);
      const b = { x, y, ang, t: 0, hit: false, big };
      G.props.push({ x, y: 1e9,
        update(G2, q, dt) {
          b.t += dt;
          const n = 3;
          for (let i = 0; i < n && !q.gone; i++) {
            b.x += Math.cos(ang) * FF.speed * U * dt / n; b.y += Math.sin(ang) * FF.speed * U * dt / n;
            const e = G2.enemies.find(t => alive(t) && Math.hypot(ec(t)[0] - b.x, ec(t)[1] - b.y) < t.r + 4);
            if (e || W.solidAt(G2.map, b.x, b.y + 7) || b.t > 1.5) {
              q.gone = true;
              if (e) hit(G2, p, e, FF.dmg * (big ? FF.bigMul : 1), { critChance: p.crit + 25, ang, repel: 2, fx: 'hit_green', tag: 'arrow' });
              fx(G2, 'explode_energy2', b.x, b.y, { scale: big ? 1.4 : 1 });
              for (const t of inRadius(G2, b.x, b.y, exR)) if (t !== e) hit(G2, p, t, exDmg, { noMul: false, repel: 1, tag: 'arrow' });
            }
          }
        },
        draw(ctx) { drawRip(ctx, SK.prefab('bullet_c09'), b.x, b.y, { rot: ang, scale: big ? 1.4 : 1 }); } });
    }
  };
  SK.on('enemyKill', G => {
    const p = G.player;
    if (!p || p.hero !== 'elves' || !p.h.skill || p.h.skill.id !== 'focus_fire' || G._skHit !== 'arrow') return;
    p.energy = Math.min(p.energyMax, p.energy + 3);
    p._ffKills = (p._ffKills || 0) + 1;
    if (p._ffKills % 3 === 0 && p._ch && p._ch.n < p._ch.max) p._ch.n++;
  });
  // Mưa Tên [ĐO c08/skill 2: cd 9, duration 1.5 (tụ lực); arrow_rain_up khi tụ, arrow_rain (DelayExplode boom_time 0.375 →
  // explode_energy2)]: bắn tối đa 14 mũi xuống vùng bán kính 3 ô quanh mục tiêu, mỗi mũi 5 sát thương [WIKI].
  const RAIN = { n: 14, r: 3 * T, dmg: 5, spread: 0.06 };
  S.arrow_rain = {
    start(G, p) {
      layer(G);
      p.skillT = cfg(p, 'arrow_rain').dur || 1.5;
      p._rain = { h: fx(G, 'arrow_rain_up', p.x, p.y - 12, { follow: p, dy: -12, dur: p.skillT }) };
      p._bow = { t: p.skillT, ang: -Math.PI / 2 };
      setMul(p, 'moveMul', 'rain', 0.5);
    },
    end(G, p) {
      setMul(p, 'moveMul', 'rain', 1);
      if (p._rain) stopFx(p._rain.h); p._rain = null;
      const { e } = targetAng(G, p);
      const cx = e ? ec(e)[0] : p.x + p.face * 5 * T, cy = e ? e.y : p.y;
      const boom = MB('arrow_rain', 'DelayExplode', 'boom_time', 0.375);
      for (let i = 0; i < RAIN.n; i++) {
        const a = SK.rand() * Math.PI * 2, d = Math.sqrt(SK.rand()) * RAIN.r;
        const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.7;
        G.props.push({ x, y: -1e9, t: -i * RAIN.spread, draw() {},
          update(G2, q, dt) {
            const t0 = q.t; q.t += dt;
            if (t0 < 0 && q.t >= 0) fx(G2, 'arrow_rain', x, y, { dur: boom + 0.1 });
            if (q.t >= boom) {
              q.gone = true;
              fx(G2, 'explode_energy2', x, y - 4, { scale: 0.6 });
              for (const t of inRadius(G2, x, y - 4, 1.2 * T)) hit(G2, p, t, RAIN.dmg, { repel: 1 });
            }
          } });
      }
    }
  };

  // ================================================================ NGƯỜI SÓI (c09)
  // Cuồng Hoá [ĐO c09/skill 1: cd 12; effect_c10_skill, c10_skill_atk (RGSword + RGSwordTrigger hit_red)]: hoá sói 5 s
  // [WIKI]; máu thấp thì hồi; sát thương 6/7/9 theo máu; 3 đòn trúng hồi 1 giáp; mỗi đòn trúng +0.2 s [WIKI].
  const WB = { dur: 5, morph: 0.5, move: 1.3, crit: 30, rps: 3, range: 30, arc: 150, extend: 0.2 };   // move, crit, rps, tầm [ƯỚC LƯỢNG]
  function wolfForm(G, p, dmg) {
    const claw = XS['^werewolf_0_skill_0_effect_1_[0-9]$'] || [];
    p._wolf = { t: 0, hits: 0, saved: p.weapons, cur: p.cur };
    // Vuốt là vũ khí cận chiến tạm; ghi vào DS.weapons (ẩn khỏi Object.keys để không lọt vào rương/cửa hàng).
    Object.defineProperty(DS.weapons, '_claw', { configurable: true, writable: true, enumerable: false,
      value: { name: 'Vuốt Sói', kind: 'melee', dmg, cost: 0, crit: WB.crit, rps: WB.rps, range: WB.range, arc: WB.arc, repel: 3, sprite: claw[0] || null } });
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
    }
    setMul(p, 'moveMul', 'berserk', 1);
    delete hurtMods(p).morph;
    swapAnims(p, null);
    fx(G, 'explode_poly_werewolf', p.x, p.y - 8, { dur: 0.35, scale: 0.5 });
  }
  S.berserk = {
    start(G, p) {
      layer(G);
      p.skillT = WB.dur;
      if (p.hp < Math.floor(p.hpMax / 5)) p.hp = p.hpMax;
      else if (p.hp <= Math.floor(p.hpMax / 2)) p.hp = Math.max(p.hp, Math.floor(p.hpMax / 2));
      const k = p.hp / p.hpMax;
      wolfForm(G, p, k >= 0.9 ? 6 : k >= 0.7 ? 7 : 9);
      hurtMods(p).morph = (G2, pl, d) => (pl._wolf && pl._wolf.t < WB.morph ? 0 : d);
    },
    update(G, p, dt) { if (p._wolf) p._wolf.t += dt; },
    end(G, p) { humanForm(G, p); }
  };
  SK.on('enemyHit', (G, e) => {
    const p = G.player;
    if (!p || !p._wolf || !p.weapons[p.cur] || p.weapons[p.cur].id !== '_claw' || !(p.weapons[p.cur].swing > 0.12)) return;
    if (p.h.skill.id === 'berserk') p.skillT += WB.extend;
    p._wolf.hits++;
    if (p._wolf.hits % 3 === 0 && p.armor < p.armorMax) p.armor++;
  });
  // Vết cào thật (prefab sword_werewolf) theo hướng vung.
  SK.on('fire', (G, p, w) => {
    if (!p._wolf || w.id !== '_claw') return;
    const left = Math.cos(p.aim) < 0;
    fx(G, 'sword_werewolf', p.x + Math.cos(p.aim) * 10, p.y - 7 + Math.sin(p.aim) * 6, { ang: left ? p.aim + Math.PI : p.aim, flip: left, dur: 0.25 });
  });
  // Khát Máu [ĐO c09/skill 2: cd 2 mỗi lượt, maxCount 4; sword_werewolf, werewolf_skill1_skin0_spear]: dùng hết lượt,
  // lao tới cào liên tiếp (mỗi lượt một nhát), sát thương 8..14 theo máu đã mất, trúng thì hồi máu, nhận 1/3 sát thương [WIKI].
  const BT = { gap: 0.15, lunge: 2.5 * T, heal: 0.25 };   // nhịp cào, quãng lao, hồi máu mỗi nhát trúng (xác suất) [ƯỚC LƯỢNG]
  S.blood_thirst = {
    start(G, p) {
      layer(G);
      charges(p, 'blood_thirst');
      const n = useCharge(p, 'blood_thirst', true);
      p.skillT = n * BT.gap + 0.1;
      const lost = 1 - p.hp / p.hpMax;
      p._bt = { n, i: 0, t: 0, dmg: Math.round(8 + 6 * lost), ang: targetAng(G, p, 6 * T).ang };
      hurtMods(p).bt = (G2, pl, d) => Math.max(1, Math.floor(d / 3));
      swapAnims(p, subAnim(pngAnim('werewolf_form'), 0, 8, 'wolf_idle'), subAnim(pngAnim('werewolf_form'), 8, 16, 'wolf_run'));
    },
    update(G, p, dt) {
      const s = p._bt; if (!s) return;
      s.t += dt;
      const e = nearest(G, p.x, p.y - 7, 6 * T);
      if (e) s.ang = Math.atan2(ec(e)[1] - (p.y - 7), ec(e)[0] - p.x);
      if (s.t < BT.gap) SK.moveBox(G.map, p, Math.cos(s.ang) * BT.lunge / BT.gap * dt, Math.sin(s.ang) * BT.lunge / BT.gap * dt, p.h.body.r);
      while (s.i < s.n && s.t >= s.i * BT.gap) {
        s.i++;
        const cx = p.x + Math.cos(s.ang) * 12, cy = p.y - 7 + Math.sin(s.ang) * 12;
        const left = Math.cos(s.ang) < 0;
        fx(G, 'sword_werewolf', cx, cy, { ang: left ? s.ang + Math.PI : s.ang, flip: left === (s.i % 2 === 0), dur: 0.25 });
        let any = false;
        for (const t of inRadius(G, cx, cy, 16)) { hit(G, p, t, s.dmg, { critChance: p.crit, ang: s.ang, repel: 2, fx: 'hit_red' }); any = true; }
        if (any && SK.rand() < BT.heal) heal(G, p, 1);
      }
    },
    end(G, p) { p._bt = null; delete hurtMods(p).bt; swapAnims(p, null); }
  };

  // ================================================================ NỮ TU (c10)
  // Khế Ước Hồi Sinh [ĐO c10/skill 1: cd 14, args "2" = giáp tối đa +2; Holy_light_c11 (BulletGreenLight, buff_armor 6 s)]:
  // vòng khế ước 4 ô ~1.6 s; đứng trong hồi 1 máu mỗi 0.8 s; hào quang còn 2 s sau khi ra khỏi vòng [WIKI].
  const RP = { r: 4 * T, pact: 1.6, aura: 2, every: 0.8 };
  S.regeneration_pact = {
    start(G, p) {
      layer(G);
      const add = +(cfg(p, 'regeneration_pact').args || 2);
      const s = p._pact = { x: p.x, y: p.y, t: 0, tick: RP.every, inside: true, add };
      p.skillT = RP.pact + RP.aura;
      p.armorMax += add;
      heal(G, p, 1);
      s.h1 = fx(G, 'effect_priest_1', s.x, s.y, { dur: RP.pact, scale: RP.r * 2 / 48, layer: 'ground' });
      s.h2 = fx(G, 'Holy_light_c11', s.x, s.y, { dur: RP.pact + RP.aura });
    },
    update(G, p, dt) {
      const s = p._pact; if (!s) return;
      s.t += dt;
      const inPact = s.t < RP.pact && Math.hypot(p.x - s.x, (p.y - s.y) / 0.62) < RP.r;
      if (!inPact && s.inside) { s.inside = false; p.skillT = Math.min(p.skillT, RP.aura); }
      s.tick -= dt;
      if (s.tick <= 0) { s.tick = RP.every; if (heal(G, p, 1)) healFx(G, p); }
    },
    end(G, p) {
      const s = p._pact; p._pact = null;
      if (s) { p.armorMax -= s.add; p.armor = Math.min(p.armor, p.armorMax); stopFx(s.h1); stopFx(s.h2); }
    }
  };
  // Cầu Nguyện [ĐO c10/skill 2: cd 14; effect_priest_1_cast + effect_priest_1 (6 s)]: hồi 2 máu + 2 giáp, +40% tốc chạy,
  // +33% tốc đánh trong 5 s [WIKI].
  const PRAY = { hp: 2, armor: 2, move: 1.4, rate: 1.33, dur: 5 };
  S.pray = {
    start(G, p) {
      layer(G);
      p.skillT = PRAY.dur;
      heal(G, p, PRAY.hp);
      const a = Math.min(PRAY.armor, p.armorMax - p.armor); if (a > 0) { p.armor += a; SK.num(G, p.x, p.y - 34, '+' + a, '#9fd8ff'); }
      setMul(p, 'moveMul', 'pray', PRAY.move); setMul(p, 'rateMul', 'pray', PRAY.rate);
      fx(G, 'effect_priest_1_cast', p.x, p.y, { follow: p });
      p._prayH = fx(G, 'effect_priest_1', p.x, p.y, { follow: p, dur: PRAY.dur, layer: 'ground' });
    },
    end(G, p) { setMul(p, 'moveMul', 'pray', 1); setMul(p, 'rateMul', 'pray', 1); stopFx(p._prayH); p._prayH = null; }
  };

  // ================================================================ TU SĨ RỪNG (c11)
  // Sói Băng Lửa [ĐO c11/skill 1: cd 10, duration 3; wolf1_druid (isFire 1) / wolf2_druid: RoleAttributePet max_hp 25,
  // speed 10, WolfOfDruidController damage 5, atk_cd 1, atkDistance 2, swoopDistance 8; druid_circle, show_effect_wolf]:
  // hai con sói luôn đi theo Tu Sĩ (không cần bấm); kỹ năng tiếp sức 3 s: sói to hơn, hồi máu, cắn nhanh gấp đôi và gây
  // lửa/băng [WIKI]. Hết máu thì sói nằm xuống, không đánh, hồi 20% máu mỗi giây [WIKI].
  const WOLF = { scout: 8 * T, big: 1.3, fast: 0.5, regen: 0.2 };   // tầm dò, cỡ/nhịp khi tiếp sức [ƯỚC LƯỢNG]
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
        x: p.x + (i ? 12 : -12), y: p.y + 4, hp, hpMax: hp, face: 1, box: [14, 10, 6], cd: 0, atkT: 0, moving: false,
        onZero(G2, a) { a.down = true; a.hp = 0; },
        update(G2, a, dt) {
          const pw = p._wolfBoost > 0;
          if (a.down) { a.hp = Math.min(a.hpMax, a.hp + a.hpMax * WOLF.regen * dt); if (a.hp >= a.hpMax) a.down = false; }
          const spd = MB(pf, 'RoleAttributePet', 'speed', 10) * U * 0.6;   // tốc 10 đơn vị/s là tốc lao; đi thường 60% [ƯỚC LƯỢNG]
          const dp = Math.hypot(p.x - a.x, p.y - a.y);
          if (dp > MB(pf, 'WolfOfDruidController', 'max_follow_distance', 20) * U) { a.x = p.x; a.y = p.y + 4; }
          a.cd -= dt; a.atkT = Math.max(0, a.atkT - dt); a.moving = false;
          const e = !a.down && nearest(G2, a.x, a.y - 6, WOLF.scout);
          if (e) {
            const [cx, cy] = ec(e), d = Math.hypot(cx - a.x, cy - (a.y - 6));
            const reach = MB(pf, 'WolfOfDruidController', 'atkDistance', 2) * U * 0.6;
            if (d > reach) { walk(G2, a, cx, cy + 6, spd * (d > MB(pf, 'WolfOfDruidController', 'swoopDistance', 8) * U ? 1 : 1.6), dt); a.moving = true; }
            else if (a.cd <= 0) {
              a.cd = MB(pf, 'WolfOfDruidController', 'atk_cd', 1) * (pw ? WOLF.fast : 1); a.atkT = 0.5; a.face = cx > a.x ? 1 : -1;
              const dmg = MB(pf, 'WolfOfDruidController', 'damage', 5);
              for (const t of inRadius(G2, cx, cy, 10)) {
                hit(G2, p, t, dmg, { noMul: true, crit: SK.rand() < 0.1, repel: 1, fx: 'hit_red', tag: 'pet' });
                if (pw) debuff(G2, t, a.fire ? 'fire' : 'ice');
              }
            }
          } else if (dp > MB(pf, 'WolfOfDruidController', 'min_follow_distance', 2) * U * 1.5) {
            walk(G2, a, p.x + (i ? 14 : -14), p.y + 4, spd, dt); a.moving = true;
          }
        },
        draw(ctx, G2, a) {
          const s = p._wolfBoost > 0 ? WOLF.big : 1;
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

  // ================================================================ NGƯỜI MÁY (c12)
  // Quá Tải Điện [ĐO c12/skill 1: cd 11, duration 4; C13Controller.maxDurationIncreaseOfSkill0 20]: 0.5 s sau khi bấm,
  // cuộn Tesla phóng 2 tia vào quái gần nhất trong tầm nhìn, 1 sát thương mỗi 0.14 s, đi chậm 20%; hạ quái +0.5 s [WIKI].
  const EO = { warm: 0.5, beams: 2, every: 0.14, dmg: 1, slow: 0.8, range: 9 * T, killAdd: 0.5 };   // tầm [ƯỚC LƯỢNG]
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
      if (s.tick <= 0) { s.tick = EO.every; for (const e of s.tg) hit(G, p, e, EO.dmg, { noMul: true, crit: false }); }
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
  // Xung Điện Từ [ĐO c12/skill 3: cd 4; laser_point_robot_pulse_s0]: 10 tia điện dài ~2.5 ô xoay quanh người, mỗi tia
  // 3 sát thương, 50% chí mạng, chí mạng thì choáng, phá đạn địch [WIKI].
  const EMP = { n: 10, len: 2.5 * T, dmg: 3, crit: 50, dur: 0.5, spin: 6 };   // thời gian/tốc xoay [ƯỚC LƯỢNG]
  S.emp = {
    start(G, p) {
      layer(G);
      const hitSet = new Set();
      fx(G, 'effect_shock1', p.x, p.y - 8, { scale: 1.5 });
      G.props.push({ x: p.x, y: 1e9, t: 0,
        update(G2, q, dt) {
          q.t += dt;
          if (q.t > EMP.dur) { q.gone = true; return; }
          const cx = p.x, cy = p.y - 8;
          for (let i = 0; i < EMP.n; i++) {
            const a = i / EMP.n * Math.PI * 2 + q.t * EMP.spin;
            for (const e of G2.enemies) {
              if (!alive(e) || hitSet.has(e)) continue;
              const [x, y] = ec(e), dx = x - cx, dy = y - cy, u = dx * Math.cos(a) + dy * Math.sin(a), v = -dx * Math.sin(a) + dy * Math.cos(a);
              if (u > 0 && u < EMP.len + e.r && Math.abs(v) < 4 + e.r) {
                hitSet.add(e);
                const crit = SK.rand() * 100 < EMP.crit;
                hit(G2, p, e, EMP.dmg, { crit, fx: 'hit_blue' });
                if (crit) debuff(G2, e, 'dizzy');
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
  // Cuồng Nộ [ĐO c13/skill 1: cd 4]: tấn công liên tục bằng vũ khí đang cầm 0.5 s, tốc bắn +20% [WIKI].
  const RG = { dur: 0.5, rate: 1.2 };
  S.rage = {
    start(G, p) {
      layer(G);
      p.skillT = RG.dur;
      setMul(p, 'rateMul', 'rage', RG.rate);
      p._rageBtn = !I.btn.attack; I.btn.attack = true;
      for (const w of p.weapons) if (w) w.cd = Math.min(w.cd, 0);
      // PhantomCreator của c13 [ĐO màu 0.937, 0.686, 0.251]: bóng mờ cam bám theo người khi cuồng nộ.
      p._rage = { trail: [], t: 0 };
      G.props.push(mirageProp(p, () => p._rage));
    },
    update(G, p, dt) { I.btn.attack = true; },
    end(G, p) { setMul(p, 'rateMul', 'rage', 1); if (p._rageBtn) I.btn.attack = false; p._rageBtn = false; p._rage = null; }
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
  // damageFactor 0.5, deviation 10°]: mỗi phát bắn thành 3 phát nhỏ (1 gốc + 2 lệch), mỗi phát 50% sát thương.
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
      b._free = 1; b.dmg = Math.max(1, Math.round(b.dmg * k));
      const sp = Math.hypot(b.vx, b.vy), a0 = Math.atan2(b.vy, b.vx);
      for (let i = 0; i < n; i++) {
        const a = a0 + (i % 2 ? 1 : -1) * da * Math.ceil((i + 1) / 2) + SK.deg(SK.randf(-(sc.deviation || 10) / 2, (sc.deviation || 10) / 2));
        G.bullets.push(Object.assign({}, b, { _free: 1, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ang: a, hits: null, boxes: null }));
      }
    }
  });
  timers.seen = G => { for (const b of G.bullets) b._seen = 1; };
  // Nhảy Vồ [ĐO c13/skill 3: cd 4 mỗi lượt, maxCount 2; bullet_hammer: ExplodeHammer damage 6, repel 3, scale_factor 1.5,
  // targetbuff buff_ele]: nhảy lên rồi dậm xuống, gây sát thương vùng + choáng; bất tử khi đang ở trên không [WIKI].
  const LEAP = { t: 0.5, dist: 4 * T, h: 22, r: 1.5 * U * 1.5 };   // thời gian, quãng, độ cao, bán kính dậm [ƯỚC LƯỢNG]
  S.leap = {
    start(G, p) {
      layer(G);
      charges(p, 'leap'); useCharge(p, 'leap');
      p.skillT = LEAP.t;
      p._leap = { t: 0, ang: aimDir(p) };
      ghost(p, true); hurtMods(p).leap = () => 0;
      p._liftY = 0;
    },
    update(G, p, dt) {
      const s = p._leap; if (!s) return;
      s.t += dt;
      const k = Math.min(1, s.t / LEAP.t);
      p._liftY = Math.sin(k * Math.PI) * LEAP.h;
      const mv = I.moveVec(), walkPx = p.h.speed * U * (p.moveMul || 1) * dt;
      SK.moveBox(G.map, p, Math.cos(s.ang) * LEAP.dist / LEAP.t * dt - mv.x * walkPx * 0.5, Math.sin(s.ang) * LEAP.dist / LEAP.t * dt - mv.y * walkPx * 0.5, p.h.body.r);
    },
    end(G, p) {
      p._leap = null; p._liftY = 0; ghost(p, false); delete hurtMods(p).leap;
      const dmg = MB('bullet_hammer', 'ExplodeHammer', 'damage', 6), rep = MB('bullet_hammer', 'ExplodeHammer', 'repel', 3);
      fx(G, 'bullet_hammer', p.x, p.y - 2, {});
      for (const e of inRadius(G, p.x, p.y - 4, LEAP.r)) { hit(G, p, e, dmg, { repel: rep, ang: Math.atan2(ec(e)[1] - p.y, ec(e)[0] - p.x) }); debuff(G, e, 'dizzy'); }
      G.shake = Math.max(G.shake, 4);
    }
  };

  // ================================================================ PHÁP SƯ TỬ LINH (c14)
  // Ác Mộng [ĐO c14/skill 1: cd 6; buff_nightmare: BuffNightmare buff_time 10, maxDamage 50; nec_ghost_hand:
  // GhostHandController damage 5, atk_cd 0.5, lifeTime 15, RoleAttribute max_hp 10, speed 5]: đánh dấu một quái 10 s;
  // cứ 50 sát thương gây lên nó hoặc khi nó chết thì gọi một Bàn Tay Ma đánh giúp.
  S.nightmare = {
    start(G, p) {
      layer(G);
      const { e } = targetAng(G, p);
      if (!e) { p._cdAfter = 0.5; return; }
      if (G._nm && G._nm.e !== e) stopFx(G._nm.h);
      const t = MB('buff_nightmare', 'BuffNightmare', 'buff_time', 10);
      G._nm = { e, t, acc: 0, h: fx(G, 'buff_nightmare', e.x, e.y, { follow: e, dy: -(e.hb.off[1] + e.hb.size[1] / 2) * e.scale - 4, dur: t }) };
      fx(G, 'hit_black', ec(e)[0], ec(e)[1], {});
    }
  };
  timers.nightmare = (G, p, dt) => { const m = G._nm; if (m) { m.t -= dt; if (m.t <= 0 || !alive(m.e)) { if (m.t <= 0) stopFx(m.h); if (m.t <= 0) G._nm = null; } } };
  SK.on('enemyHit', (G, e, dmg) => {
    const m = G._nm; if (!m || m.e !== e || m.t <= 0) return;
    m.acc += dmg;
    const step = MB('buff_nightmare', 'BuffNightmare', 'maxDamage', 50);
    while (m.acc >= step) { m.acc -= step; ghostHand(G, G.player, e.x, e.y); }
  });
  SK.on('enemyKill', (G, e) => { const m = G._nm; if (m && m.e === e) { ghostHand(G, G.player, e.x, e.y); stopFx(m.h); G._nm = null; } });
  function ghostHand(G, p, x, y) {
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
        else if (a.cd <= 0) { a.cd = MB('nec_ghost_hand', 'GhostHandController', 'atk_cd', 0.5); a.st = 'atk'; a.stT = 0; hit(G2, p, e, MB('nec_ghost_hand', 'GhostHandController', 'damage', 5), { noMul: true, crit: false, repel: 1, fx: 'hit_black', tag: 'pet' }); }
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
  // Đá Điềm Báo [ĐO c14/skill 2: cd 3 mỗi lượt, maxCount 3; nec_fireball: DelayExplode boom_time 1 → explode_hit_enemy_nec
  // (ExplodeDizzy damage 6, độc 50%), ExplodeHammer scale_factor 1.5; NecFireGas: PlagueGas lifeTime 3 (buff_plague 6 s);
  // C15Controller.oneLevelSkillScaleFactorSkill1 0.3333]: dùng hết lượt, mỗi lượt thêm 1/3 sát thương và tầm.
  S.omen_stone = {
    start(G, p) {
      layer(G);
      charges(p, 'omen_stone');
      const n = useCharge(p, 'omen_stone', true);
      const k = 1 + (n - 1) * CTRL('necromancer', 'oneLevelSkillScaleFactorSkill1', 0.3333);
      const { e } = targetAng(G, p, 12 * T);
      const x = e ? e.x : p.x + SK.randf(-3, 3) * T, y = e ? e.y : p.y + SK.randf(-2, 2) * T;
      const boom = MB('nec_fireball', 'DelayExplode', 'boom_time', 1);
      fx(G, 'nec_fireball', x, y, { scale: k, dur: boom + 0.5 });
      G.props.push({ x, y: -1e9, t: 0, draw() {},
        update(G2, q, dt) {
          q.t += dt; if (q.t < boom) return;
          q.gone = true;
          const dmg = Math.round(MB('explode_hit_enemy_nec', 'ExplodeDizzy', 'damage', 6) * k);
          const r = 2 * T * k;   // bán kính nổ gốc 2 ô [ƯỚC LƯỢNG]
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
  // Xoay Súng [ĐO c15/skill 1: cd 2 mỗi lượt, maxCount 2, args "3" (hạ 3 quái liên tiếp vào Quyết Đấu);
  // weapon_skill_officer: GunOfficerSkill đạn bullet_14 damage 8, crit 5, speed 42, deviation 6, delay 0.1, maxCount 5]:
  // bấm kỹ năng nạp 1 viên vào Sứ Giả Hoà Bình (tối đa 5), bấm bắn thì xả hết số đã nạp; mỗi viên nạp thêm tốn 1 năng lượng.
  const SPIN = () => ({ dmg: 8, crit: 5, speed: 42, dev: 6, delay: MB('weapon_skill_officer', 'GunOfficerSkill', 'delay', 0.1), max: MB('weapon_skill_officer', 'GunOfficerSkill', 'maxCount', 5) });
  SK.WEAPON_KINDS.officer_spin = {
    fire(G, p, w, o) {
      const s = p._spin; if (!s) return;
      const c = SPIN(), n = s.loaded;
      for (let i = 0; i < n; i++) {
        G.props.push({ x: 0, y: -1e9, t: -i * c.delay, draw() {},
          update(G2, q, dt) {
            q.t += dt; if (q.t < 0) return; q.gone = true;
            const [hx, hy] = [p.x + 3 * p.face, p.y - 6];
            const a = p.aim + SK.deg(SK.randf(-c.dev, c.dev));
            shoot(G2, p, hx + Math.cos(p.aim) * 10, hy + Math.sin(p.aim) * 10, a, { dmg: Math.round(c.dmg * (p.dmgMul || 1)), speed: c.speed, critChance: c.crit + p.crit, sprite: 'bullet_34', hit: 'hit_orange', repel: 2, extra: { officer: true } });
            SK.fx(G2, 'muzzle', hx + Math.cos(p.aim) * 10, hy + Math.sin(p.aim) * 10, { ang: p.aim, dur: 0.05 });
          } });
      }
      s.loaded = 0; s.fired = true;
    }
  };
  S.gun_spin = {
    start(G, p) {
      layer(G);
      charges(p, 'gun_spin'); useCharge(p, 'gun_spin');
      const c = SPIN();
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
  timers.gunSpin = (G, p) => {
    const s = p._spin; if (!s) return;
    if (!s.fired && p.cur === s.slot) return;
    if (p.weapons[s.slot] && p.weapons[s.slot].id === '_officer_gun') p.weapons[s.slot] = s.saved;
    p._spin = null;
  };
  // Treo Thưởng [ĐO c15/skill 2: cd 4, duration 999 (tới khi quái chết)]: đánh dấu một quái; đạn của mình bẻ lái về nó;
  // hạ nó thì rơi xu và dấu chuyển sang quái gần nhất [WIKI].
  S.bounty_tag = {
    start(G, p) {
      layer(G);
      const { e } = targetAng(G, p);
      if (!e) { p._cdAfter = 0; return; }
      tagBounty(G, e);
    }
  };
  function tagBounty(G, e) {
    if (G._bounty) stopFx(G._bounty.h);
    G._bounty = { e, h: fx(G, 'target2', e.x, e.y, { follow: e, dy: -(e.hb.off[1]) * e.scale, dur: 999 }) };
  }
  timers.bounty = (G, p, dt) => {
    const b = G._bounty; if (!b) return;
    if (!alive(b.e)) return;
    const [tx, ty] = ec(b.e);
    for (const q of G.bullets) {
      if (q.side !== 'p' || q.dead || q.vis) continue;
      const a = Math.atan2(q.vy, q.vx), want = Math.atan2(ty - q.y, tx - q.x);
      let d = want - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      if (Math.abs(d) > 1.2) continue;   // chỉ bẻ lái đạn đang hướng về phía mục tiêu [ƯỚC LƯỢNG]
      const sp = Math.hypot(q.vx, q.vy), na = a + Math.max(-6 * dt, Math.min(6 * dt, d));
      q.vx = Math.cos(na) * sp; q.vy = Math.sin(na) * sp; q.ang = na;
    }
  };
  SK.on('enemyKill', (G, e) => {
    const b = G._bounty; if (!b || b.e !== e) return;
    stopFx(b.h); G._bounty = null;
    SK.dropPickup(G, 'coin', e.x, e.y - 4);
    const p = G.player, n = p && nearest(G, e.x, e.y, 14 * T);
    if (n && p.h.skill.id === 'bounty_tag') tagBounty(G, n);
  });
  SK.on('stageEnter', G => { G._bounty = null; G._nm = null; });
  // Không Kích [ĐO c15/skill 3: cd 9, args "5" = 5 quả bom; bullet_plane → bullet_airstrike (DelayExplode boom_time 0.375 →
  // explode_no_smoke: Explode damage 8, cháy 50%); target2 ngắm]: máy bay bay qua mục tiêu thả 5 quả bom thành hàng.
  const AIR = { call: 0.6, gap: 0.12, span: 3.75 * T };   // thời gian gọi, nhịp thả, bề dài hàng bom (vòng ngắm 3.75 ô) [WIKI/ƯỚC LƯỢNG]
  S.close_air_support = {
    start(G, p) {
      layer(G);
      const n = +(cfg(p, 'close_air_support').args || 5);
      const { e } = targetAng(G, p);
      const cx = e ? e.x : p.x + p.face * 3 * T, cy = e ? e.y : p.y;
      fx(G, 'target2', cx, cy - 6, { scale: 2 });
      const dir = SK.rand() < 0.5 ? 1 : -1, boom = MB('bullet_airstrike', 'DelayExplode', 'boom_time', 0.375);
      const dmg = MB('explode_no_smoke', 'Explode', 'damage', 8), fr = MB('explode_no_smoke', 'Explode', 'fire_rate', 50);
      for (let i = 0; i < n; i++) {
        const x = cx + dir * (-AIR.span / 2 + AIR.span * i / Math.max(1, n - 1)), y = cy + SK.randf(-6, 6);
        G.props.push({ x, y: -1e9, t: -(AIR.call + i * AIR.gap), draw() {},
          update(G2, q, dt) {
            const t0 = q.t; q.t += dt;
            if (t0 < 0 && q.t >= 0) fx(G2, 'bullet_airstrike', x, y, {});
            if (q.t < boom) return;
            q.gone = true;
            fx(G2, 'explode_no_smoke', x, y - 4, {});
            for (const t of inRadius(G2, x, y - 4, 1.6 * T)) { hit(G2, p, t, dmg, { repel: 3 }); if (SK.rand() * 100 < fr) debuff(G2, t, 'fire'); }
            G2.shake = Math.max(G2.shake, 3);
          } });
      }
      // Bóng máy bay (officer_3_0 của bullet_plane) lướt qua hàng bom.
      const pl = SK.prefab('bullet_plane'), shadow = pl && pl.find(q => q.f);
      if (shadow) G.props.push({ x: cx, y: 1e9, t: -AIR.call + 0.3,
        update(G2, q, dt) { q.t += dt; if (q.t > n * AIR.gap + 0.8) q.gone = true; },
        draw(ctx, G2, q) { if (q.t < 0) return; const x = cx + dir * (-AIR.span / 2 - 60 + q.t * 220); SK.draw(ctx, shadow.f, x, cy - 10, { flip: dir < 0, alpha: 0.6 }); } });
    }
  };

  // ================================================================ ĐẠO SĨ (c16)
  // Vạn Kiếm Quy Tông [ĐO c16/skill 1: cd 7, args "7;3" = 7 kiếm; bullet_taoist_sword; RGHandTaoist.handcutBulletInfoIns
  // damage 3]: 7 thanh kiếm quay quanh người ~1 s, chém đạn địch; rồi bay vào quái (ưu tiên quái bị đánh dấu), xuyên quái.
  const GS = { r: 3 * T, orbit: 1, life: 3, speed: 16 * U, spin: 9 };   // [WIKI]; tốc bay/quay [ƯỚC LƯỢNG]
  S.genesis_of_swords = {
    start(G, p) {
      layer(G);
      const n = parseInt(cfg(p, 'genesis_of_swords').args || '7', 10) || 7;
      const dmg = 3;   // [ĐO hero.ab RGHandTaoist.handcutBulletInfoIns.damage]
      const parts = SK.prefab('bullet_taoist_sword');
      const swords = [];
      for (let i = 0; i < n; i++) swords.push({ a: i / n * Math.PI * 2, x: p.x, y: p.y - 8, st: 'orbit', hitSet: [] });
      fx(G, 'skill0_mark_s0', p.x, p.y, { follow: p, dur: GS.orbit });
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
            } else { s.x += Math.cos(s.ang) * GS.speed * dt; s.y += Math.sin(s.ang) * GS.speed * dt; }
            for (const e of G2.enemies) {
              if (!alive(e) || s.hitSet.indexOf(e) >= 0) continue;
              const [cx, cy] = ec(e);
              if (Math.abs(s.x - cx) < e.hb.size[0] * e.scale / 2 + 5 && Math.abs(s.y - cy) < e.hb.size[1] * e.scale / 2 + 5) {
                s.hitSet.push(e); hit(G2, p, e, dmg, { noMul: true, crit: false, ang: s.rot, repel: 1, fx: 'hit_white' });
              }
            }
            for (const b of G2.bullets) if (b.side === 'e' && !b.dead && Math.hypot(b.x - s.x, b.y - s.y) < 7 + b.r) b.dead = true;
          }
          if (q.t >= GS.orbit) for (const e of G2.enemies) e._gsTaken = 0;
        },
        draw(ctx) { for (const s of swords) drawRip(ctx, parts, s.x, s.y, { rot: s.rot }); }
      });
    }
  };
  // Bát Quái [ĐO c16/skill 2: cd 8.5, duration 5; taoist_gravity: RGShieldRebound angleSpeed 30, ảnh skill_taoist_shield]:
  // trận pháp 4 ô bám theo người, đẩy đạn địch ra ngoài và bẻ ngược thành đạn của mình (100% sát thương) [WIKI].
  const BAGUA = { r: 4 * T };
  S.bagua = {
    start(G, p) {
      layer(G);
      p.skillT = cfg(p, 'bagua').dur || 5;
      const parts = SK.prefab('taoist_gravity'), img = parts && parts.find(q => q.f);
      const spin = MB('taoist_gravity', 'RGShieldRebound', 'angleSpeed', 30);
      p._bagua = { t: 0 };
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
              b.side = 'p'; b.kind = b.kind === 'orb' ? 'orb' : b.kind; b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.crit = false; b.repel = 1;
              b.dmg = Math.max(1, b.dmg || 1); b.life = Math.max(b.life, 1);
            }
          }
        },
        draw(ctx, G2, q) {
          if (!img) return;
          const f = SK.frame(img.f); if (!f) return;
          const s = BAGUA.r * 2 / f[3], al = Math.min(1, q.t / 0.2) * (p.skillT < 0.5 ? p.skillT / 0.5 : 1);
          ctx.save(); ctx.globalAlpha *= 0.8 * al; ctx.translate(p.x, p.y - 2); ctx.scale(1, 0.62); ctx.rotate(SK.deg(spin) * q.t);
          SK.draw(ctx, img.f, 0, 0, { sx: s, sy: s }); ctx.restore();
        } });
    },
    end(G, p) { p._bagua = null; }
  };
  // Ngự Kiếm [ĐO c16/skill 3: cd 11, duration 2.5; mtao_sword (thân mech_39)]: cưỡi kiếm 2.5 s, chạy nhanh hơn nhiều,
  // miễn sát thương, chạm quái gây 10 sát thương [WIKI].
  const FLY = { move: 2, dmg: 10, every: 0.5 };   // hệ số tốc, nhịp chạm [ƯỚC LƯỢNG]
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
      for (const e of inRadius(G, p.x, p.y - 6, 12)) if ((s.hit.get(e) || 0) <= G.t) { s.hit.set(e, G.t + FLY.every); hit(G, p, e, FLY.dmg, { repel: 3, fx: 'hit_white' }); }
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
    // Chiến Binh Cuồng — Ép Xung (Buff 31, "Rapid Fire"): mỗi đòn +1 tầng trong {1} s, {2}%/tầng, tối đa {3} tầng, đủ tầng thêm
    // {4}% [ĐO Buff_info_31]; số điền vào: 3 s, 2%, 5 tầng, 10% [WIKI] (tham số nằm trong mã).
    if (p.hero === 'viking') {
      const s = p._fr || (p._fr = { n: 0, t: 0 });
      if (s.t > 0) { s.t -= dt; if (s.t <= 0 && s.n > 0) { s.n--; s.t = s.n ? 0.4 : 0; } }   // rơi dần 0.4 s/tầng [ƯỚC LƯỢNG]
      setMul(p, 'rateMul', 'fire_rate', 1 + s.n * 0.02 + (s.n >= 5 ? 0.1 : 0));
    }
  }
  SK.on('fire', (G, p) => { if (p.hero === 'viking' && passiveOn(p)) { const s = p._fr || (p._fr = { n: 0, t: 0 }); s.n = Math.min(5, s.n + 1); s.t = 3; } });
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
    if (!crit || !p || p.hero !== 'ranger' || !passiveOn(p) || G._skHit) return;
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

  // ---------------------------------------------------------------- áp số thật 8.6 vào bảng nhân vật + tiếng
  // Thời lượng hiển thị vòng HUD của kỹ năng mà start() tự định (không có trong config).
  const DUR_UI = { dodge: ROLL_T, dark_blade: DB.dur, bat_swarm: BS.maxT, berserk: WB.dur, regeneration_pact: RP.pact + RP.aura, pray: PRAY.dur, rage: RG.dur, iaido: IAIDO.t, leap: LEAP.t };
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
  SK.on('runStart', G => {
    apply86();
    const p = G.player; if (!p) return;
    const k = K86(p.hero, p.h.skill && p.h.skill.id);
    if (k) { p.h.skill.cd = k.cd; p.h.skill.dur = DUR_UI[k.id] != null ? DUR_UI[k.id] : (k.dur || p.h.skill.dur); }
    p._ch = null;
    if (k && k.max > 0 && S[k.id]) charges(p, k.id);
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
