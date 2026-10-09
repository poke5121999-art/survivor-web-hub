/* Chợ Phiên — BZView: sân khấu 1920×1080 (bố cục chép từ dooley-friends-1.jpg, WIKI.md §2.1), co giãn letterbox.
   Bên 1 = đối thủ (trên), bên 0 = người chơi (dưới) — khớp BZSim (bàn 0 thắng khi cùng chết).
   Cung cấp: cardEl(uid), cardRect(uid), heroRect(side), shake(pct), dựng khối hero (chân dung, kỹ năng, thanh máu, chip trạng thái).
   Thanh máu (HealthBarBase.cs): mất máu → phần máu tụt ngay (10 ms), vệt đỏ "ma" đuổi theo trong 0,4 s;
   hồi máu → vệt sáng nhảy trước, phần máu đầy dần trong 0,4 s. Bỏng/độc: dải sọc ở mép phải phần máu = lượng sẽ mất. */
(function (root) {
  'use strict';
  var V = root.BZView = {};
  var W = 1920, H = 1080;
  V.W = W; V.H = H;
  V.BOARD = { x: 392, w: 1136, pitch: 109.6, top: [553, 305], cardH: 232 }; // top[side]
  V.PORTRAIT = { w: 192, h: 166, y: [840, 86] };
  var REV = function () { return '?v=' + (root.BZ_REV || ''); };
  var R = {}, cards = {}, heroes = [null, null], shakeS = { t0: -1e9, dur: 0, amp: 0 };
  V.refs = R;

  function el(tag, cls, parent, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; }
  V.el = el;

  V.build = function (host) {
    R.root = host;
    var st = R.stage = el('div', '', host); st.id = 'bz-stage';
    var wd = R.world = el('div', '', st); wd.id = 'bz-world';
    // nền sân = ảnh bàn gốc (art/env, data/env.js) theo hero; ảnh đã có thảm, kênh nước, bệ hero, đồ trang trí
    R.bg = el('div', 'bz-bg', wd);
    V.setEnv(null);
    R.boards = [el('div', 'bz-board bot', wd), el('div', 'bz-board top', wd)];
    R.cardLayer = el('div', '', wd); R.cardLayer.style.cssText = 'position:absolute;inset:0;';
    R.sides = [];
    [0, 1].forEach(function (s) {
      var pos = s ? 'top' : 'bot';
      var l = el('div', 'bz-side l ' + pos, wd), r = el('div', 'bz-side r ' + pos, wd);
      R.sides[s] = { l: el('div', 'bz-side-in', l), r: el('div', 'bz-side-in', r) };
    });
    R.heroes = [el('div', 'bz-hero bot', wd), el('div', 'bz-hero top', wd)];
    R.hp = [el('div', 'bz-hp bot', wd), el('div', 'bz-hp top', wd)];
    R.crowns = [el('div', 'bz-crown bot', wd), el('div', 'bz-crown top', wd)];
    // đồng hồ trận
    var dial = R.dial = el('div', 'bz-dial', wd);
    var face = el('div', 'face', dial);
    R.dialRing = el('div', 'ring', face);
    R.dialTime = el('div', 'time', face, '<span>0.0</span><small>GIÂY</small>');
    R.dialTimeN = R.dialTime.firstChild;
    var storm = el('div', 'storm', dial); R.dialStorm = el('i', '', storm);
    R.dialLabel = el('div', 'bz-dial-label', wd, 'Bão cát sau 30 giây');
    R.enrFrame = [el('div', 'bz-enr-frame bot', wd), el('div', 'bz-enr-frame top', wd)];
    R.enrVig = el('div', 'bz-enr-vig', wd);
    R.sand = el('div', 'bz-sand', wd);
    el('div', 'dune', R.sand);
    R.fx = el('canvas', '', wd); R.fx.id = 'bz-fx';
    R.banner = el('div', 'bz-banner', st, '<div class="in"><h2></h2><p></p></div>');
    R.ui = el('div', '', st); R.ui.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    root.BZTooltip.init(st, W, H);
    V.fit();
    root.addEventListener('resize', V.fit);
    root.addEventListener('orientationchange', function () { setTimeout(V.fit, 120); });
    return R;
  };
  // setEnv(hero): chọn ảnh bàn theo hero (BZ_ENV.byHero), không có thì bàn mặc định (defaultKey)
  V.setEnv = function (hero) {
    var E = root.BZ_ENV, key = E && ((hero && E.byHero && E.byHero[hero]) || E.defaultKey), d = E && (E[key] || E[E.defaultKey]);
    if (!d || !R.bg || V.envKey === key) return;
    V.envKey = key; V.env = d;
    R.bg.style.backgroundImage = 'url("' + d.src + REV() + '")';
  };
  V.fit = function () {
    var w = root.innerWidth, h = root.innerHeight, s = Math.min(w / W, h / H);
    V.scale = s;
    R.stage.style.transform = 'translate(' + Math.round((w - W * s) / 2) + 'px,' + Math.round((h - H * s) / 2) + 'px) scale(' + s + ')';
    if (root.BZFX && R.fx) root.BZFX.resize(s, Math.min(2, root.devicePixelRatio || 1));
  };
  // toạ độ client → toạ độ sân khấu
  V.toStage = function (cx, cy) {
    var r = R.stage.getBoundingClientRect();
    return { x: (cx - r.left) / V.scale, y: (cy - r.top) / V.scale };
  };

  // ---------- thẻ ----------
  V.clearCards = function () { R.cardLayer.innerHTML = ''; cards = {}; };
  // layoutBoard(side, [{uid, el, size, socket}]) — xếp theo socket, cả nhóm canh giữa bàn (bàn gốc dồn thẻ vào giữa)
  V.layoutBoard = function (side, list) {
    var B = V.BOARD, sorted = list.slice().sort(function (a, b) { return a.socket - b.socket; });
    var total = 0; sorted.forEach(function (c) { total += c.size; });
    var x = B.x + B.w / 2 - total * B.pitch / 2, y = B.top[side];
    sorted.forEach(function (c) {
      var span = c.size * B.pitch, w = c.el._bz.w;
      var left = x + (span - w) / 2;
      c.el.style.left = left.toFixed(1) + 'px'; c.el.style.top = y + 'px';
      c.rect = { x: left, y: y, w: w, h: B.cardH };
      cards[c.uid] = c;
      if (!c.el.parentNode) R.cardLayer.appendChild(c.el);
      x += span;
    });
  };
  V.cardEl = function (uid) { var c = cards[uid]; return c ? c.el : null; };
  V.cardRect = function (uid) {
    var c = cards[uid]; if (!c) return null;
    var B = c.el._bz, wr = B.winRect;
    return { x: c.rect.x + wr.x, y: c.rect.y + wr.y, w: wr.w, h: wr.h, cx: c.rect.x + wr.x + wr.w / 2, cy: c.rect.y + wr.y + wr.h / 2 };
  };
  V.cards = function () { return cards; };

  // ---------- hero ----------
  V.heroRect = function (side) {
    var P = V.PORTRAIT, x = W / 2 - P.w / 2, y = P.y[side];
    return { x: x, y: y, w: P.w, h: P.h, cx: W / 2, cy: y + P.h * 0.55 };
  };
  V.hpRect = function (side) { return { x: 612, y: side ? 258 : 794, w: 696, h: 40 }; };

  // info: {name, level, tier, char, bg, skills:[{uid,id,tier,art}], rewards:{gold,xp}}
  V.setupHero = function (side, info) {
    var hero = R.heroes[side];
    if (side === 0) V.setEnv(info.name); // bên dưới là hero thì lấy bàn của hero, không thì bàn mặc định
    hero.innerHTML = '';
    var pf = el('div', 'bz-portrait', hero);
    var F = root.BZ_FRAMES && root.BZ_FRAMES.encounter && root.BZ_FRAMES.encounter[info.tier || 'Bronze'];
    var art = el('div', 'pf-art', pf);
    if (F) {
      var k = V.PORTRAIT.h / F.h, w = F.w * k;
      pf.style.width = w + 'px'; pf.style.marginLeft = (-w / 2) + 'px';
      var wn = F.window;
      art.style.cssText = 'left:' + wn.x * k + 'px;top:' + wn.y * k + 'px;width:' + wn.w * k + 'px;height:' + wn.h * k + 'px;border-radius:' +
        (wn.shape === 'arch' ? '46% 46% 6px 6px / 30% 30% 6px 6px' : (wn.r * k) + 'px');
      var fi = el('img', 'pf-frame', pf); fi.src = F.src + REV(); fi.alt = '';
    } else {
      art.style.cssText = 'left:10px;top:10px;right:10px;bottom:10px;border-radius:46% 46% 6px 6px / 30% 30% 6px 6px;';
      pf.style.boxShadow = '0 0 0 4px #e0b25a, 0 0 0 7px #5b3317'; pf.style.borderRadius = '46% 46% 8px 8px / 30% 30% 8px 8px';
    }
    var bg = el('div', 'pf-bg', art), ch = el('div', 'pf-char', art);
    if (info.bg) bg.style.backgroundImage = 'url("' + info.bg + REV() + '")';
    if (info.char) ch.style.backgroundImage = 'url("' + info.char + REV() + '")';
    var tint = el('div', 'pf-tint', art), flash = el('div', 'pf-flash', art);
    var ring = el('div', 'bz-enrage-ring', pf);
    // kỹ năng: 3×2 mỗi bên chân dung (12 chỗ, chỗ trống = sao mờ)
    var skL = el('div', 'bz-skills l', hero), skR = el('div', 'bz-skills r', hero);
    var skillEls = {};
    for (var i = 0; i < 12; i++) {
      var sk = (info.skills || [])[i], host = i % 2 === 0 ? skL : skR;
      // thứ tự lấp: trong cùng (sát chân dung) trước
      var d = el('div', 'bz-skill' + (sk ? '' : ' empty'), host);
      if (sk) {
        var SF = root.BZ_FRAMES && root.BZ_FRAMES.skill && root.BZ_FRAMES.skill[sk.tier || 'Bronze'];
        var a = el('div', 'sk-art', d);
        if (SF) {
          var kk = 82 / SF.w, wn2 = SF.window;
          a.style.cssText = 'left:' + (wn2.x * kk - 2) + 'px;top:' + (wn2.y * kk - 2) + 'px;width:' + (wn2.w * kk + 4) + 'px;height:' + (wn2.h * kk + 4) + 'px;';
          var sf = el('img', 'sk-frame', d); sf.src = SF.src + REV(); sf.alt = '';
          d.style.transform = 'scale(1.18)';
        } else { a.style.cssText = 'inset:8px;box-shadow:0 0 0 3px #e0b25a;'; }
        if (sk.art) a.style.backgroundImage = 'url("' + sk.art + REV() + '")';
        d.dataset.uid = sk.uid;
        skillEls[sk.uid] = d;
      }
    }
    // xếp lại để ô gần chân dung lấp trước: cột phải của nhóm trái, cột trái của nhóm phải
    [skL, skR].forEach(function (g, gi) {
      var kids = Array.prototype.slice.call(g.children);
      kids.forEach(function (c, j) {
        var row = Math.floor(j / 3), col = j % 3;
        c.style.gridRow = String(row + 1);
        c.style.gridColumn = String(gi === 0 ? 3 - col : col + 1);
      });
    });
    // thanh máu
    var hp = R.hp[side];
    hp.innerHTML = '';
    var tr = el('div', 'hp-track', hp);
    var ghost = el('div', 'hp-ghost', tr), fill = el('div', 'hp-fill', tr), burn = el('div', 'hp-burn', tr), poison = el('div', 'hp-poison', tr),
      shield = el('div', 'hp-shield', tr);
    el('div', 'hp-gloss', tr);
    el('div', 'hp-end l', hp); el('div', 'hp-end r', hp);
    var text = el('div', 'hp-text', hp, '<span class="v"></span><span class="sh"></span><span class="rg"></span>');
    var status = el('div', 'bz-status', hp);
    var chips = {};
    [['burn', 'Burn'], ['poison', 'Poison'], ['regen', 'Regeneration'], ['rage', 'Rage']].forEach(function (c) {
      var ch2 = el('div', 'bz-chip ' + c[0], status, '<img alt="" src="art/icons/' + c[1] + '.webp' + REV() + '"><b>0</b>');
      chips[c[0]] = { el: ch2, b: ch2.querySelector('b'), v: 0 };
    });
    // hai ô cạnh
    var S = R.sides[side];
    S.l.innerHTML = '<div class="bz-sublabel">' + (side ? 'Đối thủ' : 'Phe ta') + '</div><div class="bz-name"></div><div class="bz-level"></div>';
    S.l.querySelector('.bz-name').textContent = info.name;
    S.l.querySelector('.bz-level').textContent = info.level || 1;
    var rw = info.rewards || {};
    S.r.innerHTML = '<div class="bz-sublabel">Phần thưởng</div>' +
      '<div class="bz-reward"><img alt="" src="art/ui/ui_sprite_atlas/Icon_Stat_Coins_TUI.webp' + REV() + '"><span>' + (rw.gold || 0) + '</span></div>' +
      '<div class="bz-reward xp"><img alt="" src="art/ui/ui_sprite_atlas/Icon_Stat_XP_TUI.webp' + REV() + '"><span>' + (rw.xp || 0) + '</span></div>' +
      '<div class="bz-sublabel" style="margin-top:4px">' + (info.hpMax || 0) + ' máu</div>';
    heroes[side] = {
      pf: pf, art: art, tint: tint, flash: flash, ring: ring, hp: hp, ghost: ghost, fill: fill, burn: burn, poison: poison, shield: shield,
      textV: text.children[0], textS: text.children[1], textR: text.children[2], chips: chips, skillEls: skillEls,
      v: { shield: -1 }, ghostV: 1, fillV: 1, gainT: -1e9, lossT: -1e9, punchT: -1e9, punchPct: 0, flashT: -1e9, dead: false
    };
    R.crowns[side].classList.remove('on');
  };
  V.skillEl = function (side, uid) { var h = heroes[side]; return h ? h.skillEls[uid] : null; };
  V.hero = function (side) { return heroes[side]; };

  // updateHero(side, {health, shield, burn, poison, regen, rage, enragedMs, healthMax}, t)
  V.updateHero = function (side, v, t) {
    var h = heroes[side]; if (!h) return;
    var o = h.v, mx = Math.max(1, v.healthMax || 1);
    var frac = Math.max(0, Math.min(1, v.health / mx));
    if (o.health !== v.health || o.healthMax !== mx) {
      if (o.health != null) {
        if (v.health < o.health) { h.lossT = t; h.fillV = frac; h.hp.classList.remove('hit'); void h.hp.offsetWidth; h.hp.classList.add('hit'); }
        else { h.gainT = t; }
      } else { h.fillV = frac; h.ghostV = frac; }
      o.health = v.health; o.healthMax = mx;
      h.textV.textContent = Math.max(0, Math.round(v.health));
    }
    h.target = frac;
    if ((o.shield || 0) !== (v.shield || 0)) {
      o.shield = v.shield || 0;
      h.shield.style.transform = 'scaleX(' + Math.min(1, o.shield / mx).toFixed(4) + ')';
      h.shield.style.display = o.shield > 0 ? '' : 'none';
      h.textS.textContent = o.shield > 0 ? o.shield : '';
      h.tint.style.opacity = '';
    }
    var regen = v.regen || 0;
    if (o.regen !== regen) { o.regen = regen; h.textR.textContent = ''; }
    chip(h.chips.burn, v.burn || 0); chip(h.chips.poison, v.poison || 0); chip(h.chips.regen, regen); chip(h.chips.rage, v.rage || 0);
    // dải bỏng/độc: phần máu sẽ mất ở lần nổ tới, đặt ở mép phải phần máu
    var bf = Math.min(frac, (v.burn || 0) / mx), pf = Math.min(frac - bf, (v.poison || 0) / mx);
    if (o.bf !== bf || o.frac2 !== frac) { o.bf = bf; h.burn.style.transform = 'translateX(' + ((frac - bf) * 100).toFixed(3) + '%) scaleX(' + bf.toFixed(4) + ')'; }
    if (o.pf !== pf || o.frac2 !== frac) { o.pf = pf; h.poison.style.transform = 'translateX(' + ((frac - bf - pf) * 100).toFixed(3) + '%) scaleX(' + Math.max(0, pf).toFixed(4) + ')'; }
    o.frac2 = frac;
    var enr = (v.enragedMs || 0) > 0;
    if (o.enr !== enr) {
      o.enr = enr; h.pf.classList.toggle('enraged', enr);
      // nộ: khung đỏ nhấp nháy ở đáy bàn, ~1 s sau mới phủ vành tối đỏ (REF enrage)
      var ef = R.enrFrame[side], on = enr;
      if (ef) { ef.classList.remove('on'); if (on) { void ef.offsetWidth; ef.classList.add('on'); } }
      var any = R.enrFrame.some(function (x) { return x.classList.contains('on'); });
      R.enrVig.classList.toggle('on', any);
    }
    if (enr) {
      var p = Math.min(1, v.enragedMs / 5000);
      h.ring.style.background = 'conic-gradient(#ff2a4a ' + (p * 360).toFixed(1) + 'deg, transparent 0)';
      h.ring.style.webkitMask = h.ring.style.mask = 'radial-gradient(circle, transparent 60%, #000 62%)';
    }
    // màu phủ chân dung theo trạng thái (StatusEffectControllerVFX: bỏng/(25 % máu), độc/(15 % máu), khiên/máu)
    var ib = Math.min(1, (v.burn || 0) / (0.25 * mx)), ip = Math.min(1, (v.poison || 0) / (0.15 * mx)), ish = Math.min(1, (v.shield || 0) / mx);
    var key = (ib * 20 | 0) + ',' + (ip * 20 | 0) + ',' + (ish * 20 | 0);
    if (o.tintKey !== key) {
      o.tintKey = key;
      var layers = [];
      if (ib > 0) layers.push('radial-gradient(ellipse at 50% 100%, rgba(255,113,0,' + (0.25 + 0.5 * ib).toFixed(2) + '), transparent 70%)');
      if (ip > 0) layers.push('radial-gradient(ellipse at 50% 0%, rgba(14,190,78,' + (0.25 + 0.45 * ip).toFixed(2) + '), transparent 70%)');
      if (ish > 0) layers.push('linear-gradient(180deg, rgba(255,230,120,' + (0.12 + 0.3 * ish).toFixed(2) + '), transparent 60%)');
      h.tint.style.background = layers.join(',') || 'none';
      h.tint.style.opacity = layers.length ? '1' : '0';
    }
    h.intens = { burn: ib, poison: ip, shield: ish, regen: regen > 0 ? Math.min(1, regen / (0.02 * mx) + 0.2) : 0, rage: enr ? 1 : 0 };
  };
  function chip(c, v) {
    if (c.v === v) return;
    var up = v > c.v;
    c.v = v; c.b.textContent = v;
    c.el.classList.toggle('on', v > 0);
    if (v > 0 && up) { c.el.classList.remove('bump'); void c.el.offsetWidth; c.el.classList.add('bump'); }
  }
  V.heroPunch = function (side, t, pct) { var h = heroes[side]; if (!h) return; h.punchT = t; h.punchPct = Math.max(0.06, Math.min(1, pct)); h.punchSign = Math.random() < 0.5 ? -1 : 1; };
  V.heroFlash = function (side, t, color) { var h = heroes[side]; if (!h) return; h.flashT = t; h.flash.style.background = color || '#fff'; };
  V.setDead = function (side, on) { var h = heroes[side]; if (!h) return; h.dead = on; h.pf.classList.toggle('dead', on); };
  V.crown = function (side, on) { R.crowns[side].classList.toggle('on', !!on); };
  V.skillPulse = function (side, uid) { var e = V.skillEl(side, uid); if (!e) return; e.classList.remove('pulse'); void e.offsetWidth; e.classList.add('pulse'); };

  // ---------- rung + nhịp mỗi khung ----------
  // shake(pct): HitStunAVFXMod — rung camera khi mất ≥ 20 % máu (biên độ/độ dài phóng to cho màn 2D [ĐỀ XUẤT])
  V.shake = function (pct, t) { pct = Math.max(0, Math.min(1, pct)); shakeS = { t0: t == null ? V.now : t, dur: 120 + 380 * pct, amp: 6 + 34 * pct }; };
  V.tick = function (t, dt) {
    V.now = t; dt = Math.max(0, dt || 0);
    var e = t - shakeS.t0;
    if (e >= 0 && e < shakeS.dur) {
      var k = 1 - e / shakeS.dur, a = shakeS.amp * k;
      R.world.style.transform = 'translate(' + ((Math.random() * 2 - 1) * a * 0.75).toFixed(1) + 'px,' + ((Math.random() * 2 - 1) * a).toFixed(1) + 'px)';
      R._shaking = true;
    } else if (R._shaking) { R._shaking = false; R.world.style.transform = ''; }
    for (var s = 0; s < 2; s++) {
      var h = heroes[s]; if (!h) continue;
      // thanh máu: vệt ma
      var tgt = h.target == null ? 1 : h.target;
      if (tgt < h.ghostV) { // mất máu: máu tụt ngay, ma chờ 120 ms rồi đuổi trong 400 ms
        h.fillV = tgt;
        if (t - h.lossT > 120) h.ghostV = Math.max(tgt, h.ghostV - Math.max((h.ghostV - tgt) * dt / 160, dt * 0.0004));
        h.ghost.classList.remove('gain');
      } else if (tgt > h.fillV) { // hồi máu: vệt sáng nhảy trước, máu đầy dần
        h.ghostV = tgt; h.ghost.classList.add('gain');
        h.fillV = Math.min(tgt, h.fillV + Math.max(dt * 0.0002, (tgt - h.fillV) * dt / 130));
      } else { h.fillV = tgt; if (h.ghostV < tgt) h.ghostV = tgt; }
      if (h._gv !== h.ghostV) { h._gv = h.ghostV; h.ghost.style.transform = 'scaleX(' + h.ghostV.toFixed(4) + ')'; }
      if (h._fv !== h.fillV) { h._fv = h.fillV; h.fill.style.transform = 'scaleX(' + h.fillV.toFixed(4) + ')'; }
      // chân dung: DOPunchPosition((0, pct, ±0,5·pct), pct/2 s) + DOPunchRotation((0, ±5·pct, 0))
      var pe = t - h.punchT, pd = 120 + h.punchPct * 500;
      if (pe >= 0 && pe < pd) {
        var u = pe / pd, damp = Math.sin(u * Math.PI * 2.5) * (1 - u);
        h.pf.style.transform = 'translate(' + (h.punchSign * 10 * h.punchPct * damp).toFixed(1) + 'px,' + (-30 * h.punchPct * damp * (s ? -1 : 1)).toFixed(1) + 'px) rotate(' +
          (h.punchSign * 5 * h.punchPct * damp).toFixed(2) + 'deg) scale(' + (1 - 0.06 * h.punchPct * Math.abs(damp)).toFixed(3) + ')';
        h._punching = true;
      } else if (h._punching) { h._punching = false; h.pf.style.transform = ''; }
      var fe = t - h.flashT;
      var fo = fe >= 0 && fe < 300 ? 0.75 * (1 - fe / 300) : 0;
      if (h._fo !== fo) { h._fo = fo; h.flash.style.opacity = fo.toFixed(3); }
    }
  };
  V.resetBars = function () { heroes.forEach(function (h) { if (h) { h.ghostV = h.fillV = h.target == null ? 1 : h.target; h.punchT = -1e9; h.flashT = -1e9; } }); shakeS.t0 = -1e9; };

  // ---------- đồng hồ, bão cát, băng-rôn ----------
  V.dial = function (t, cfg) {
    var sec = t / 1000;
    var txt = sec.toFixed(1);
    if (R._dt !== txt) { R._dt = txt; R.dialTimeN.textContent = txt; }
    var start = (cfg.countdownStart + cfg.countdown) / 1000;
    var p = Math.min(1, sec / start), storming = sec >= start;
    var key = storming ? 's' : (p * 200 | 0);
    if (R._dk !== key) {
      R._dk = key;
      R.dialRing.style.background = storming ? 'conic-gradient(#ff7a2a, #ffcf6a, #ff7a2a)' :
        'conic-gradient(' + (sec >= cfg.countdownStart / 1000 ? '#ff9a3a' : '#e0b25a') + ' ' + (p * 360).toFixed(1) + 'deg, rgba(0,0,0,.35) 0)';
      R.dialStorm.style.transform = 'scaleX(' + p.toFixed(3) + ')';
      R.dial.classList.toggle('storming', storming);
      R.dialLabel.textContent = storming ? 'Bão cát đang hoành hành' : ('Bão cát sau ' + Math.max(0, Math.ceil(start - sec)) + ' giây');
    }
  };
  V.sand = function (on) { R.sand.classList.toggle('on', !!on); };
  V.sandLevel = function (k) { var q = Math.round(Math.max(0, Math.min(1, k)) * 50) / 50; if (R._sk !== q) { R._sk = q; R.sand.style.setProperty('--sk', q); } };
  // vầng vàng quanh hàng chân dung khi nhận khiên (REF shield: viền hàng chuyển lưới vàng ~1,2 s)
  V.rowGlow = function (side, color, ms) {
    var d = el('div', 'bz-rowglow ' + (side ? 'top' : 'bot'), R.world);
    d.style.setProperty('--rg', color || '#fcdc2c'); d.style.animationDuration = (ms || 1200) + 'ms';
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, (ms || 1200) + 60);
  };
  var bannerTimer = null;
  V.banner = function (title, sub, cls, holdMs) {
    var b = R.banner;
    b.querySelector('h2').textContent = title; b.querySelector('p').textContent = sub || '';
    b.className = 'bz-banner ' + (cls || '');
    void b.offsetWidth; b.classList.add('show');
    clearTimeout(bannerTimer);
    if (holdMs) bannerTimer = setTimeout(V.hideBanner, holdMs);
  };
  V.hideBanner = function (instant) {
    clearTimeout(bannerTimer);
    var b = R.banner;
    if (instant) { b.className = 'bz-banner'; return; }
    if (b.classList.contains('show')) { b.classList.remove('show'); b.classList.add('hide'); }
  };
})(window);
