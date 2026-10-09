/* Chợ Phiên — BZCard: dựng/cập nhật phần tử thẻ từ một instance + thuộc tính đã tính.
   Khung + neo (gem, tag cooldown, đạn, multicast) lấy từ window.BZ_FRAMES (tools/frames.py); chưa có thì vẽ khung CSS
   theo màu bậc (VISUAL.md §17) với neo dự phòng chép từ khung Bronze.
   Dùng lại được cho pha sau (cửa hàng, kéo-thả): không phụ thuộc trận đấu, chỉ nhận số.
   Hover (VISUAL.md §1): nhấc 150 ms OutQuad, nghiêng tối đa ±6° theo vị trí con trỏ, làm mượt hệ số 10/s;
   rời chuột: xoay bật về 0, trượt về chỗ 150 ms có nảy nhẹ (movementEase OutBounce).
   Giật lùi khi bắn: Card_Kickback_A 0,333 s (VISUAL.md §3), đồng hồ = thời gian phát lại để tua 3× vẫn đúng nhịp. */
(function (root) {
  'use strict';
  var C = root.BZCard = {};
  var SZ = { 1: 'S', 2: 'M', 3: 'L' };
  var FALL = { // neo dự phòng = khung Bronze trong frames.js (ảnh cao 512)
    S: { w: 247, h: 512, window: { x: 20, y: 43, w: 206, h: 426, r: 13 }, anchors: { gemTop: { x: 123, y: 24, w: 102, h: 51 }, tag: { x: 55, y: 408, w: 61, h: 46 },
      ammo: { x: 123, y: 446, w: 181, h: 30, pip: 23 }, multicast: { x: 191, y: 78, w: 61, h: 61 } } },
    M: { w: 486, h: 512, window: { x: 20, y: 43, w: 446, h: 427, r: 12 }, anchors: { gemTop: { x: 243, y: 24, w: 102, h: 51 }, tag: { x: 55, y: 409, w: 61, h: 46 },
      ammo: { x: 243, y: 447, w: 392, h: 30, pip: 23 }, multicast: { x: 431, y: 78, w: 61, h: 61 } } },
    L: { w: 730, h: 512, window: { x: 20, y: 43, w: 689, h: 427, r: 13 }, anchors: { gemTop: { x: 364, y: 22, w: 102, h: 51 }, tag: { x: 55, y: 409, w: 61, h: 46 },
      ammo: { x: 364, y: 447, w: 606, h: 30, pip: 23 }, multicast: { x: 674, y: 78, w: 61, h: 61 } } }
  };
  var GEMS = [['DamageAmount', 'damage'], ['BurnApplyAmount', 'burn'], ['PoisonApplyAmount', 'poison'], ['ShieldApplyAmount', 'shield'],
    ['HealAmount', 'heal'], ['RegenApplyAmount', 'regen']];
  var GEM_CSS = { damage: '#d21e1e', burn: '#f07a12', poison: '#0f8f3f', shield: '#e8c020', heal: '#2e9a3a', regen: '#3cae5a', lifesteal: '#9d2a5f' };
  var ENCH_COL = { Deadly: '#be47ff', Fiery: '#ff7a1a', Heavy: '#cca06e', Icy: '#77beff', Golden: '#ffcd19', Obsidian: '#7a3aff', Radiant: '#fff2a0',
    Restorative: '#00ff60', Shielded: '#d9c22e', Shiny: '#ffffff', Toxic: '#0ebe4e', Turbo: '#00eac2', Mossy: '#7ac943', Ethereal: '#b9a3ff', Mystical: '#c58bff' };
  C.ENCH_COL = ENCH_COL;
  var REV = function () { return '?v=' + (root.BZ_REV || ''); };

  C.frameOf = function (tier, size) {
    var F = root.BZ_FRAMES && root.BZ_FRAMES.item;
    var k = SZ[size] || 'S';
    var f = F && F[tier] && F[tier][k];
    return f ? { f: f, real: true } : { f: FALL[k], real: false };
  };
  // kích thước hộp thẻ ở chiều cao h (giữ tỉ lệ ảnh khung)
  C.boxSize = function (tier, size, h) { var f = C.frameOf(tier, size).f; return { w: Math.round(f.w * h / f.h), h: h }; };
  C.artSrc = function (id) { var m = root.BZ_ART && root.BZ_ART.map; return m && m[id] ? m[id] : null; };

  function el(tag, cls, parent) { var e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; }
  function place(e, x, y, w, h) { e.style.left = x + 'px'; e.style.top = y + 'px'; e.style.width = w + 'px'; e.style.height = h + 'px'; }

  // create(inst {uid,id,tier,size,ench}, opts {h, attrs, side}) → phần tử .bz-card (chưa đặt left/top)
  C.create = function (inst, opts) {
    opts = opts || {};
    var root_ = el('div', 'bz-card t-' + (inst.tier || 'Bronze'));
    root_.dataset.uid = inst.uid;
    var cb = el('div', 'cb', root_);
    el('div', 'shadow', cb);
    var win = el('div', 'win', cb);
    var art = el('div', 'art', win);
    var src = C.artSrc(inst.id);
    if (src) art.style.backgroundImage = 'url("' + src + REV() + '")';
    else art.style.background = 'linear-gradient(160deg,#4a3324,#24160d)';
    var veil = el('div', 'veil', win);
    var line = el('div', 'cdline', win);
    var stH = el('div', 'st st-haste', win), stS = el('div', 'st st-slow', win), stF = el('div', 'st st-freeze', win);
    var hit = el('div', 'hit', win);
    var ench = null;
    if (inst.ench) { ench = el('div', 'ench', win); ench.style.setProperty('--ec', ENCH_COL[inst.ench] || '#be47ff'); }
    var frame = el('img', 'frame', cb); frame.alt = ''; frame.draggable = false;
    var cssf = el('div', 'cssframe', cb);
    var fglow = el('div', 'fglow', cb);
    var gems = el('div', 'gems', cb);
    var mc = el('div', 'mc', cb);
    var tag = el('div', 'cdtag', cb);
    var ammo = el('div', 'ammo', cb);
    var chH = el('div', 'chip haste', cb), chS = el('div', 'chip slow', cb), chF = el('div', 'chip freeze', cb);
    var buff = el('div', 'buff', cb);
    var B = root_._bz = {
      inst: inst, attrs: opts.attrs || {}, side: opts.side || 0, h: opts.h || 230, w: 0,
      cb: cb, win: win, art: art, veil: veil, line: line, stH: stH, stS: stS, stF: stF, hit: hit, frame: frame, cssf: cssf, fglow: fglow,
      gems: gems, mc: mc, tag: tag, ammo: ammo, chH: chH, chS: chS, chF: chF, buff: buff, ench: ench,
      s: {}, gemVals: {}, pips: [],
      // animation
      hover: 0, hoverTo: 0, hoverT0: 0, hoverFrom: 0, rx: 0, ry: 0, trx: 0, try_: 0, kickT: -1e9, punchT: -1e9, flashT: -1e9, flashCol: '#00ffa8', hitT: -1e9, dirty: true
    };
    C.layout(root_);
    return root_;
  };

  // đặt mọi lớp con theo khung (gọi lại khi BZ_FRAMES tới hoặc đổi bậc)
  C.layout = function (e) {
    var B = e._bz, inst = B.inst, fr = C.frameOf(inst.tier || 'Bronze', inst.size || 1), f = fr.f;
    var h = B.h, k = h / f.h, w = Math.round(f.w * k);
    B.w = w; B.k = k; B.real = fr.real;
    e.style.width = w + 'px'; e.style.height = h + 'px';
    var wn = f.window;
    place(B.win, wn.x * k, wn.y * k, wn.w * k, wn.h * k);
    B.win.style.borderRadius = Math.max(4, (wn.r || 10) * k) + 'px';
    B.winRect = { x: wn.x * k, y: wn.y * k, w: wn.w * k, h: wn.h * k };
    if (fr.real) {
      B.frame.style.display = ''; B.cssf.style.display = 'none';
      var s = f.src + REV();
      if (B.frame.getAttribute('src') !== s) B.frame.setAttribute('src', s);
    } else {
      B.frame.style.display = 'none'; B.cssf.style.display = '';
      place(B.cssf, wn.x * k - 6, wn.y * k - 6, wn.w * k + 12, wn.h * k + 12);
    }
    var A = f.anchors || FALL[SZ[inst.size] || 'S'].anchors;
    var ga = A.gemTop; B.gemH = ga.h * k * 1.12; B.gemW = ga.w * k * 1.12;
    place(B.gems, -20, ga.y * k - B.gemH / 2, w + 40, B.gemH);
    var ma = A.multicast; place(B.mc, ma.x * k - ma.w * k / 2, ma.y * k - ma.h * k / 2, ma.w * k, ma.h * k);
    var parts = root.BZ_FRAMES && root.BZ_FRAMES.parts;
    B.mc.style.backgroundImage = parts && parts.multicast ? 'url("' + parts.multicast.src + REV() + '")' : '';
    if (!parts || !parts.multicast) { B.mc.style.background = '#22262e'; B.mc.style.borderRadius = '4px'; }
    var ta = A.tag, th = ta.h * k * 1.18, tw = th * 2.0;
    place(B.tag, ta.x * k - th * 0.62, ta.y * k - th / 2, tw, th);
    if (parts && parts.tag2) { B.tag.classList.remove('css'); B.tag.style.backgroundImage = 'url("' + parts.tag2.src + REV() + '")'; }
    else { B.tag.classList.add('css'); B.tag.style.backgroundImage = ''; }
    B.tag.style.fontSize = Math.round(th * 0.62) + 'px';
    var am = A.ammo; B.ammoA = { x: am.x * k, y: am.y * k, w: am.w * k, h: am.h * k, pip: am.pip * k };
    place(B.ammo, am.x * k - am.w * k / 2, am.y * k - am.h * k / 2, am.w * k, am.h * k);
    B.ammo.style.backgroundImage = parts && parts.ammoBar ? 'url("' + parts.ammoBar.src + REV() + '")' : '';
    B.ammo.style.backgroundSize = '100% 100%';
    C.setAttrs(e, B.attrs, true);
    B.pips = []; B.ammo.innerHTML = ''; B.s.ammo = undefined;
    C.update(e, B.s.last || {}, true);
  };

  // thuộc tính tĩnh: gem số, tag cooldown, multicast, khung đạn
  C.setAttrs = function (e, a, silent) {
    var B = e._bz; B.attrs = a = a || {};
    var html = [], key, i, parts = root.BZ_FRAMES && root.BZ_FRAMES.gems;
    B.gems.innerHTML = '';
    B.gemEls = {};
    for (i = 0; i < GEMS.length; i++) {
      var v = a[GEMS[i][0]];
      if (!(v > 0)) continue;
      key = GEMS[i][1];
      if (key === 'damage' && (a.Lifesteal || 0) > 0) key = 'lifesteal';
      var g = el('div', 'gem', B.gems);
      g.style.width = B.gemW + 'px';
      if (parts && parts[key]) g.style.backgroundImage = 'url("' + parts[key].src + REV() + '")';
      else { g.classList.add('css'); g.style.background = GEM_CSS[key]; }
      g.style.fontSize = Math.round(B.gemH * 0.78) + 'px';
      g.textContent = Math.round(v);
      B.gemEls[GEMS[i][0]] = g;
      if (!silent && B.gemVals[GEMS[i][0]] !== v) { g.classList.add('pop'); }
      B.gemVals[GEMS[i][0]] = v;
      html.push(key);
    }
    var cd = a.CooldownEffective || a.CooldownMax || 0;
    if (cd > 0 && B.inst.type !== 'Skill') { B.tag.style.display = ''; B.tag.textContent = fmtSec(cd); } else B.tag.style.display = 'none';
    var mcv = Math.round(a.Multicast || 1);
    if (mcv > 1) { B.mc.style.display = ''; B.mc.textContent = 'x' + mcv; } else B.mc.style.display = 'none';
    B.ammo.style.display = (a.AmmoMax || 0) > 0 ? '' : 'none';
  };
  function fmtSec(ms) { var s = ms / 1000; return (Math.round(s * 10) / 10).toString(); }
  C.fmtSec = fmtSec;
  // đổi một gem giữa trận (sự kiện attr), có nảy
  C.setGem = function (e, attr, v) {
    var B = e._bz;
    var a = Object.assign({}, B.attrs); a[attr] = v;
    var old = B.gemVals[attr];
    C.setAttrs(e, a, true);
    var g = B.gemEls[attr];
    if (g && old !== v) { void g.offsetWidth; g.classList.add('pop'); }
  };

  // update(e, {progress, ammo, haste, slow, freeze, destroyed, flying}) — ghi DOM chỉ khi đổi
  C.update = function (e, s, force) {
    var B = e._bz, o = B.s;
    o.last = s;
    var p = s.progress || 0;
    var charging = p > 0.0005 && !s.destroyed;
    if (force || Math.abs((o.p == null ? -1 : o.p) - p) > 0.0008) {
      o.p = p;
      B.veil.style.transform = 'scaleY(' + (1 - p).toFixed(4) + ')';
      B.line.style.transform = 'translateY(' + ((1 - p) * B.winRect.h).toFixed(1) + 'px)';
    }
    if (force || o.charging !== charging) { o.charging = charging; e.classList.toggle('charging', charging); }
    var hasCd = (B.attrs.CooldownEffective || B.attrs.CooldownMax || 0) > 0;
    if (force || o.hasCd !== hasCd) { o.hasCd = hasCd; B.veil.style.display = hasCd ? '' : 'none'; B.line.style.display = hasCd ? '' : 'none'; }
    tog(e, o, 'haste', s.haste > 0, force); tog(e, o, 'slow', s.slow > 0, force); tog(e, o, 'freeze', s.freeze > 0, force);
    tog(e, o, 'destroyed', !!s.destroyed, force); tog(e, o, 'flying', !!s.flying, force);
    txt(B.chH, o, 'th', s.haste > 0 ? fmtSec(s.haste) : '');
    txt(B.chS, o, 'ts', s.slow > 0 ? fmtSec(s.slow) : '');
    txt(B.chF, o, 'tf', s.freeze > 0 ? fmtSec(s.freeze) : '');
    var am = B.attrs.AmmoMax || 0;
    if (am > 0 && s.ammo != null && s.ammo >= 0 && (force || o.ammo !== s.ammo)) {
      if (B.pips.length !== am) buildPips(B, am);
      for (var i = 0; i < B.pips.length; i++) B.pips[i].classList.toggle('off', i >= s.ammo);
      o.ammo = s.ammo;
    }
  };
  function tog(e, o, k, v, force) { if (force || o[k] !== v) { o[k] = v; e.classList.toggle(k, v); } }
  function txt(n, o, k, v) { if (o[k] !== v) { o[k] = v; n.textContent = v; } }
  function buildPips(B, n) {
    B.ammo.innerHTML = ''; B.pips = [];
    var parts = root.BZ_FRAMES && root.BZ_FRAMES.parts;
    var A = B.ammoA, size = Math.min(A.pip, (A.w * 0.9) / n - 1);
    for (var i = 0; i < n; i++) {
      var p = el('div', 'pip', B.ammo);
      p.style.width = p.style.height = size + 'px';
      if (parts && parts.pipFull) { p.style.backgroundImage = 'url("' + parts.pipFull.src + REV() + '")'; }
      else p.classList.add('css');
      B.pips.push(p);
    }
  }
  C.reloadFlash = function (e) { var a = e._bz.ammo; a.classList.remove('reload'); void a.offsetWidth; a.classList.add('reload'); };
  C.buffText = function (e, text, color) {
    var b = e._bz.buff; b.textContent = text; b.style.color = color || '#b6ff7a';
    b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
  };
  C.multicastFlash = function (e) { var m = e._bz.mc; m.classList.remove('flash'); void m.offsetWidth; m.classList.add('flash'); };

  // ---------- chuyển động: hover (đồng hồ thật) + giật lùi/chớp (đồng hồ phát lại) ----------
  C.kick = function (e, t) { e._bz.kickT = t; e._bz.dirty = true; };
  C.flash = function (e, t, color) { var B = e._bz; B.flashT = t; B.flashCol = color || '#00ffa8'; B.fglow.style.setProperty('--gc', B.flashCol); B.dirty = true; };
  C.hitFlash = function (e, t) { e._bz.hitT = t; e._bz.dirty = true; };
  C.punch = function (e, t) { e._bz.punchT = t; e._bz.dirty = true; };
  C.setHover = function (e, on, now) {
    var B = e._bz;
    if (!!on === (B.hoverTo === 1)) return;
    B.hoverFrom = B.hover; B.hoverTo = on ? 1 : 0; B.hoverT0 = now;
    if (!on) { B.rx = B.ry = B.trx = B.try_ = 0; } // VISUAL §1: rời chuột → xoay bật về gốc, không lerp
    e.classList.toggle('hover', !!on);
    B.dirty = true;
  };
  C.pointer = function (e, nx, ny) { // nx, ny ∈ [-1, 1] trong hộp thẻ
    var B = e._bz;
    B.trx = 6 * Math.max(-1, Math.min(1, ny));
    B.try_ = -6 * Math.max(-1, Math.min(1, nx));
    B.dirty = true;
  };
  // Card_Kickback_A (z: lùi xa người xem, y: nhấc) — khoá thời gian (ms, giá trị) từ clips.txt
  var KZ = [[0, 0], [17, -0.703], [33, -0.824], [83, -0.865], [233, 0.068], [283, -0.02], [317, 0.01], [333, 0]];
  var KY = [[0, 0], [17, 0.119], [33, 0.191], [83, 0.161], [233, 0]];
  function keyAt(K, t) {
    if (t <= 0 || t >= K[K.length - 1][0]) return 0;
    for (var i = 0; i < K.length - 1; i++) if (t < K[i + 1][0]) { var a = K[i], b = K[i + 1], u = (t - a[0]) / (b[0] - a[0]); u = u * u * (3 - 2 * u); return a[1] + (b[1] - a[1]) * u; }
    return 0;
  }
  function outQuad(u) { return 1 - (1 - u) * (1 - u); }
  function outBounceSoft(u) { var s = 1.25; u -= 1; return 1 + u * u * ((s + 1) * u + s); } // OutBack nhẹ thay OutBounce (đỡ giật trên web) [ĐỀ XUẤT]
  // tick(e, nowWall, tReplay, dtWall) → true nếu còn chuyển động
  C.tick = function (e, now, t, dt) {
    var B = e._bz;
    var u = Math.min(1, (now - B.hoverT0) / 150);
    B.hover = B.hoverFrom + (B.hoverTo - B.hoverFrom) * (B.hoverTo ? outQuad(u) : outBounceSoft(u));
    var kz = keyAt(KZ, t - B.kickT), ky = keyAt(KY, t - B.kickT);
    var a = 1 - Math.exp(-10 * dt / 1000); // Quaternion.Lerp(cur, target, dt*10)
    B.rx += (B.trx - B.rx) * a; B.ry += (B.try_ - B.ry) * a;
    var dir = B.side === 1 ? -1 : 1; // bàn trên (đối thủ) giật ngược lên (Card_Kickback_A_Mirrored)
    var sc = (1 + 0.085 * B.hover) * (1 + kz * 0.06) * (1 + ky * 0.22);
    var pu = t - B.punchT, punch = pu > 0 && pu < 220 ? Math.sin(pu / 220 * Math.PI * 3) * (1 - pu / 220) * 7 : 0;
    var ty = -16 * B.hover + dir * (-kz * 18) + punch;
    var tr = 'translate3d(0,' + ty.toFixed(2) + 'px,0) scale(' + sc.toFixed(4) + ')';
    if (B.hover > 0.01) tr += ' rotateX(' + (B.rx * B.hover).toFixed(2) + 'deg) rotateY(' + (B.ry * B.hover).toFixed(2) + 'deg)';
    B.cb.style.transform = tr;
    var fl = t - B.flashT, fo = fl >= 0 && fl < 500 ? (fl < 60 ? fl / 60 : 1 - (fl - 60) / 440) : 0; // FrameGlow 0,5 s
    B.fglow.style.opacity = fo.toFixed(3);
    var ht = t - B.hitT, ho = ht >= 0 && ht < 140 ? 0.7 * (1 - ht / 140) : 0;
    B.hit.style.opacity = ho.toFixed(3);
    var moving = u < 1 || Math.abs(B.trx - B.rx) > 0.02 || Math.abs(B.try_ - B.ry) > 0.02 || (t - B.kickT) < 340 || fo > 0 || ho > 0 || (pu > 0 && pu < 220);
    if (!moving) { B.dirty = false; if (B.hover < 0.01) B.cb.style.transform = ''; }
    return moving;
  };
})(window);
