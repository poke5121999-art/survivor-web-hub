/* Chợ Phiên — BZTooltip: tooltip thẻ theo bố cục gốc (VISUAL.md §14, ảnh cooldown-uzi-1.jpg).
   Chữ thẻ giữ nguyên tiếng Anh từ dữ liệu (BZSim.cardText đã thay {ability.x} bằng số); phần khung giao diện tiếng Việt.
   Từ khoá tô màu theo TooltipTypography (VISUAL.md §17) kèm icon; bảng giải nghĩa lấy BZ_MODE.tooltips[Kw].Keyword.
   Hiện: phóng 100 ms rồi mờ dần vào 50 ms (DesktopTooltipFadeAnimator.cs:14-68). */
(function (root) {
  'use strict';
  var T = root.BZTooltip = {};
  var REV = function () { return '?v=' + (root.BZ_REV || ''); };
  // từ khoá → [màu, icon trong art/icons, khoá giải nghĩa]
  var KW = {
    'Damage': ['#f3523c', 'Damage'], 'Crit Chance': ['#f5523c', 'CritChance', 'Crit Chance'], 'Crit': ['#f5523c', 'CritChance', 'Crit Chance'], 'Crits': ['#f5523c', 'CritChance', 'Crit Chance'],
    'Poison': ['#0ebe4e', 'Poison', 'Poison'], 'Poisons': ['#0ebe4e', 'Poison', 'Poison'],
    'Freeze': ['#3ec8f8', 'Freeze', 'Freeze'], 'Freezes': ['#3ec8f8', 'Freeze', 'Freeze'], 'Frozen': ['#3ec8f8', 'Freeze', 'Freeze'],
    'Charge': ['#00eac2', 'Charge', 'Charge'], 'Charges': ['#00eac2', 'Charge', 'Charge'], 'Cooldown': ['#00eac2', 'Cooldown'], 'Cooldowns': ['#00eac2', 'Cooldown'],
    'Haste': ['#00eac2', 'Haste', 'Haste'], 'Hastes': ['#00eac2', 'Haste', 'Haste'],
    'Slow': ['#cca06e', 'Slow', 'Slow'], 'Slows': ['#cca06e', 'Slow', 'Slow'],
    'Heal': ['#8fe931', 'Health', 'Heal'], 'Heals': ['#8fe931', 'Health', 'Heal'], 'Healing': ['#8fe931', 'Health', 'Heal'],
    'Max Health': ['#8fe931', 'MaxHPHeart'], 'Health': ['#8fe931', 'Health'],
    'Regen': ['#8fe930', 'Regeneration', 'Regen'], 'Regens': ['#8fe930', 'Regeneration', 'Regen'], 'Regeneration': ['#8fe930', 'Regeneration', 'Regen'],
    'Shield': ['#f4cf21', 'Shield', 'Shield'], 'Shields': ['#f4cf21', 'Shield', 'Shield'],
    'Burn': ['#fa943e', 'Burn', 'Burn'], 'Burns': ['#fa943e', 'Burn', 'Burn'],
    'Ammo': ['#fe8e00', 'Ammo', 'Ammo'], 'Reload': ['#fe8e00', 'Reload'], 'Reloads': ['#fe8e00', 'Reload'],
    'Gold': ['#f5d021', 'Income', 'Gold'], 'Income': ['#f5d021', 'Income', 'Income'], 'Value': ['#f5d021', 'Income'],
    'Flying': ['#f5d021', 'Fly', 'Flying'], 'Multicast': ['#f7c892', 'Multicast', 'Multicast'],
    'Lifesteal': ['#bd3e7a', 'Lifesteal', 'Lifesteal'], 'Destroy': ['#c52c41', 'Destroy'], 'Destroys': ['#c52c41', 'Destroy'],
    'Upgrade': ['#b3e4e5', 'Upgrade', 'Upgrade'], 'Upgrades': ['#b3e4e5', 'Upgrade', 'Upgrade'],
    'Transform': ['#5ae6e9', 'Transform', 'Transform'], 'Transforms': ['#5ae6e9', 'Transform', 'Transform'],
    'Rage': ['#f12261', 'Rage', 'Rage'], 'Enrage': ['#f12261', 'Rage', 'Rage'], 'Enraged': ['#f12261', 'Rage', 'Rage'],
    'Joy': ['#cd5fe5', 'Joy', 'Joy'], 'Tempo': ['#cd5fe5', 'TempoSpend'], 'Repair': ['#8ffcbc', null, 'Repair'], 'Repairs': ['#8ffcbc', null, 'Repair'],
    'Heated': ['#ffa550', null], 'Chilled': ['#8ff5fc', null], 'Enchant': ['#ffcd92', null, 'Enchant'], 'Enchanted': ['#ffcd92', null, 'Enchant']
  };
  var VERB = ['Burn', 'Poison', 'Shield', 'Heal', 'Regen', 'Haste', 'Slow', 'Freeze', 'Charge', 'Reload', 'Rage', 'Damage'];
  var TAGS = ['Tool', 'Food', 'Weapon', 'Weapons', 'Aquatic', 'Property', 'Properties', 'Friend', 'Friends', 'Vehicle', 'Vehicles', 'Tech', 'Ray', 'Rays', 'Dinosaur',
    'Dinosaurs', 'Toy', 'Toys', 'Instrument', 'Dragon', 'Dragons', 'Ingredient', 'Relic', 'Relics', 'Apparel', 'Loot', 'Core', 'Potion', 'Potions', 'Reagent', 'Drone', 'Drones', 'Map', 'Key', 'Trap', 'Sigil'];
  var kwAlt = Object.keys(KW).sort(function (a, b) { return b.length - a.length; }).map(function (k) { return k.replace(/ /g, '\\s'); }).join('|');
  var NUM = '\\+?\\d+(?:\\.\\d+)?%?';
  var RE = new RegExp('(' + NUM + ')\\s(' + kwAlt + ')\\b|\\b(' + VERB.join('|') + ')\\s(' + NUM + ')(?![\\w%])|\\b(' + kwAlt + ')\\b|\\b(' + TAGS.join('|') + ')\\b|(' + NUM + ')', 'g');

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function ico(k) { var m = KW[k]; return m && m[1] ? '<i class="ico" style="background-image:url(art/icons/' + m[1] + '.webp' + REV() + ')"></i>' : ''; }
  function kspan(k, txt) { var m = KW[k] || ['#fff']; return '<span class="kw" style="color:' + m[0] + '">' + esc(txt) + '</span>'; }
  function nspan(k, n) { var m = KW[k] || ['#fff']; return '<span class="num" style="color:' + m[0] + '">' + esc(n) + '</span>'; }
  // format(text) → {html, keys[]}
  T.format = function (text) {
    var found = {};
    var html = String(text).split(/(<[^>]*>)/).map(function (chunk) {
      if (/^</.test(chunk)) return '';
      return esc(chunk).replace(RE, function (m, n1, k1, k2, n2, k3, tag, n3) {
        if (n1) { k1 = k1.replace(/\s/g, ' '); note(k1); return ico(k1) + nspan(k1, n1) + ' ' + kspan(k1, k1); }
        if (k2) { note(k2); return ico(k2) + kspan(k2, k2) + ' ' + nspan(k2, n2); }
        if (k3) { k3 = k3.replace(/\s/g, ' '); note(k3); return kspan(k3, k3); }
        if (tag) return '<span class="kw" style="color:#98a8fe">' + tag + '</span>';
        if (n3) return '<span class="num" style="color:#fff">' + n3 + '</span>';
        return m;
      });
    }).join('');
    function note(k) { var m = KW[k]; if (m && m[2]) found[m[2]] = 1; }
    return { html: html, keys: Object.keys(found) };
  };

  var box = null, stageW = 1920, stageH = 1080;
  T.init = function (parent, w, h) {
    box = document.createElement('div'); box.className = 'bz-tip'; parent.appendChild(box);
    stageW = w || 1920; stageH = h || 1080;
  };
  T.el = function () { return box; };
  T.visible = function () { return !!box && box.classList.contains('show'); };

  // info: {name, tier, size ('Small'...), type, tags[], lines[{text,type,ench}], cooldown(ms), ammoMax, crit, multicast, ench}
  T.render = function (info) {
    var keys = {}, act = [], pas = [];
    (info.lines || []).forEach(function (l) {
      var f = T.format(l.text);
      f.keys.forEach(function (k) { keys[k] = 1; });
      var cls = l.ench ? 'ln ench' : (l.type === 'Passive' ? 'ln passive' : 'ln');
      (l.type === 'Passive' && !l.ench ? pas : act).push('<div class="' + cls + '">' + f.html + '</div>');
    });
    // chỉ có dòng bị động, không đồng hồ / đạn: không vẽ ô chủ động (Frame_Active), chữ nằm thẳng dưới tiêu đề sau vạch Divider
    var bodyless = !act.length && !(info.cooldown > 0) && !(info.ammoMax > 0);
    var h = '<div class="tabs">';
    if (info.type === 'Skill') h += '<span class="tab">Kỹ năng</span>';
    else if (info.size) h += '<span class="tab">' + esc(String(info.size).toUpperCase()) + '</span>';
    (info.tags || []).slice(0, 3).forEach(function (t) { h += '<span class="tab t">' + esc(String(t).toUpperCase()) + '</span>'; });
    h += '</div><div class="box"><div class="head"><h3>' + esc(info.name) + '</h3><span class="tier">' + esc(TIER_VI[info.tier] || info.tier || '') +
      (info.ench ? ' · ' + esc(info.ench) : '') + '</span></div>';
    var clock = info.cooldown > 0;
    var crit = info.crit > 0 ? '<div class="crit">Tỉ lệ chí mạng: ' + ico('Crit Chance') + '<span class="num">' + Math.round(info.crit) + '%</span></div>' : '';
    if (bodyless) h += '<div class="passives lines">' + (pas.join('') || '<div class="ln passive" style="opacity:.6">—</div>') + crit + '</div>';
    else {
      h += '<div class="body' + (clock ? ' has-clock' : '') + '">';
      if (clock) h += '<div class="clock"><b>' + (Math.round(info.cooldown / 100) / 10).toFixed(1) + '</b><small>GIÂY</small></div>';
      h += '<div class="lines">' + (act.join('') || '<div class="ln passive" style="opacity:.6">—</div>') + crit + '</div>';
      if (info.ammoMax > 0) h += '<div class="ammo"><i></i>' + info.ammoMax + '</div>';
      h += '</div>';
      if (pas.length) h += '<div class="passives">' + pas.join('') + '</div>';
    }
    h += '</div>';
    var kl = Object.keys(keys).slice(0, 3), MT = (root.BZ_MODE && root.BZ_MODE.tooltips) || {};
    if (kl.length) {
      h += '<div class="keys">';
      kl.forEach(function (k) {
        var d = MT[k] && MT[k].Keyword; if (!d) return;
        var m = KW[k] || ['#fff'];
        h += '<div class="key"><h4 style="color:' + m[0] + '">' + (m[1] ? '<i style="background-image:url(art/icons/' + m[1] + '.webp' + REV() + ')"></i>' : '') + esc(k) +
          '</h4><p>' + esc(d) + '</p></div>';
      });
      h += '</div>';
    }
    return h;
  };
  var TIER_VI = { Bronze: 'Đồng', Silver: 'Bạc', Gold: 'Vàng', Diamond: 'Kim cương', Legendary: 'Huyền thoại' };
  T.TIER_VI = TIER_VI;

  var cur = null;
  T.MIN_PX = 12.5; // cỡ chữ dòng hiệu ứng tối thiểu (px thật trên màn) cho điện thoại
  // show(info, rect {x,y,w,h} trên sân 1920×1080, prefer 'right'|'left')
  T.show = function (info, rect) {
    if (lock) return; // đang ghim: rê sang thẻ khác không đổi tooltip
    showRaw(info, rect);
  };
  function showRaw(info, rect) {
    if (!box) return;
    var showing = box.classList.contains('show');
    if (cur !== info) { box.innerHTML = T.render(info); cur = info; }
    box.className = 'bz-tip t-' + (info.tier || 'Bronze') + (showing ? ' show' : '') + (lock ? ' locked' : '');
    box.style.display = 'flex'; box.style.scale = '';
    // MOBILE-2: sân 1920×1080 co theo màn (0,36 ở 844×390) làm chữ 23 px còn ~8 px thật → phóng tooltip để dòng chữ ≥ ~12 px thật,
    // tối đa 2,2× và không quá khổ sân (chừa 24 px mỗi bên)
    var vs = (root.BZView && root.BZView.scale) || 1, kWant = Math.max(1, Math.min(2.2, T.MIN_PX / (23 * vs)));
    var v = (root.BZView && root.BZView.vis) || { x0: 0, y0: 0, x1: stageW, y1: stageH }; // camera điện thoại chỉ thấy một phần sân
    // bảng từ khoá nằm dưới tooltip (UI-27); không đủ chỗ (điện thoại) thì bỏ bảng chứ không thu nhỏ chữ của tooltip
    var ks = box.querySelector('.keys'); if (ks) ks.style.display = '';
    var w0 = box.offsetWidth, h0 = box.offsetHeight;
    var fit = function () { return Math.max(1, Math.min(kWant, (v.x1 - v.x0 - 24) / w0, (v.y1 - v.y0 - 24) / h0)); }, k = fit();
    if (ks && k < kWant - 0.01) { ks.style.display = 'none'; w0 = box.offsetWidth; h0 = box.offsetHeight; k = fit(); }
    var w = w0 * k, h = h0 * k;
    // clip UBBAzdzXo8g: thẻ ở hàng dưới → tooltip nằm TRÊN thẻ, mép trái lệch ~20 px; hàng trên → bên phải thẻ (lật trái khi hết chỗ)
    var gap = 26, x = rect.x + rect.w + gap, left = false, y = rect.y + rect.h / 2 - h / 2;
    if (rect.y + rect.h / 2 > (v.y0 + v.y1) / 2 && rect.y - h - 14 >= v.y0 + 12) { x = rect.x - 20; y = rect.y - h - 14; }
    else if (x + w > v.x1 - 12) { x = rect.x - gap - w; left = true; }
    x = Math.max(v.x0 + 12, Math.min(v.x1 - w - 12, x));
    y = Math.max(v.y0 + 12, Math.min(v.y1 - h - 12, y));
    // phóng quanh góc trên-trái để (x, y, w, h) đúng là hộp nhìn thấy; hoạt ảnh hiện vẫn nở từ mép gần thẻ khi không phóng
    if (k > 1.001) { box.style.transformOrigin = '0 0'; box.style.scale = k.toFixed(3); }
    else box.style.transformOrigin = (left ? '100%' : '0') + ' 50%';
    box.style.left = Math.round(x) + 'px'; box.style.top = Math.round(y) + 'px';
    T.lastScale = k;
    if (!box.classList.contains('show')) { void box.offsetWidth; box.classList.add('show'); }
  }
  T.hide = function () { if (!box || lock) return; box.classList.remove('show'); box.style.display = 'none'; cur = null; };

  // ---------- ghim tooltip (UI-01) ----------
  // Bản gốc: chuột phải = Gameplay/LockTooltip (BindingPersistence.cs:32), tối màn #000 a.0,35, CardLockVariantPanel.cs thêm ô chọn
  // CẤP + ô chọn BÙA + nút Reset để xem thẻ ở cấp / bùa khác (chỉ xem, không đổi run). Cảm ứng: nhấn giữ. Esc / bấm ngoài = bỏ ghim.
  var lock = null, LONG_MS = 550, MOVE_PX = 10;
  var TIER_ORDER = ['Bronze', 'Silver', 'Gold', 'Diamond', 'Legendary'];
  T.locked = function () { return !!lock; };
  function UI() { return root.BZUI; }
  // thẻ dưới con trỏ → {id, tier, ench}; thẻ của run đọc theo uid, thẻ rời (hàng, loot, bàn cuối) theo _rs.card
  function cardOf(el) {
    var rs = el && el._rs, U = UI(); if (!rs || !U) return null;
    var c = null;
    if (rs.kind === 'own') c = U.state && U.state.run && root.BZRun.findCard(U.state.run, rs.uid);
    else c = rs.card;
    return c && c.id ? { id: c.id, tier: c.tier, ench: c.ench || null } : null;
  }
  function tiersOf(tpl) {
    var have = {}; Object.keys(tpl.Tiers || {}).forEach(function (k) { have[k] = 1; }); if (tpl.StartingTier) have[tpl.StartingTier] = 1;
    return TIER_ORDER.filter(function (k) { return have[k]; });
  }
  function drawLocked() {
    var U = UI(), c = lock.cur, info = U.tipInfo(c, U.looseAttrs(c), null);
    if (!info) return;
    showRaw(info, lock.rect);
    var P = document.createElement('div'); P.className = 'lockpanel';
    var h = '<span class="lbl">Xem thử ở</span><label>Cấp<select class="sel-tier">';
    lock.tiers.forEach(function (t) { h += '<option value="' + t + '"' + (t === c.tier ? ' selected' : '') + '>' + TIER_VI[t] + '</option>'; });
    h += '</select></label>';
    if (lock.enchs.length) {
      h += '<label>Bùa<select class="sel-ench"><option value="">Không</option>';
      lock.enchs.forEach(function (n) { h += '<option value="' + esc(n) + '"' + (n === c.ench ? ' selected' : '') + '>' + esc(n) + '</option>'; });
      h += '</select></label>';
    }
    h += '<button type="button" class="reset">Đặt lại</button>';
    P.innerHTML = h; box.appendChild(P);
    // panel nằm dưới tooltip: nếu tràn đáy sân thì đẩy tooltip lên
    var k = T.lastScale || 1, top = parseFloat(box.style.top) || 0, need = (box.offsetHeight + P.offsetHeight + 12) * k;
    var vy = (root.BZView && root.BZView.vis) || { y0: 0, y1: stageH };
    if (top + need > vy.y1 - 8) box.style.top = Math.max(vy.y0 + 8, Math.round(vy.y1 - 8 - need)) + 'px';
    P.querySelector('.sel-tier').addEventListener('change', function (e) { lock.cur.tier = e.target.value; U.sfx('ui.click'); drawLocked(); });
    var se = P.querySelector('.sel-ench');
    if (se) se.addEventListener('change', function (e) { lock.cur.ench = e.target.value || null; U.sfx('ui.click'); drawLocked(); });
    P.querySelector('.reset').addEventListener('click', function () { lock.cur = { id: lock.orig.id, tier: lock.orig.tier, ench: lock.orig.ench }; U.sfx('ui.click'); drawLocked(); });
  }
  T.lock = function (el) {
    var U = UI(), c = cardOf(el); if (!box || lock || !c || !U) return false;
    var tpl = root.BZRun.tpl(c.id); if (!tpl) return false;
    var r = U.rectOf(el); if (!r) return false;
    var dim = document.createElement('div'); dim.className = 'bz-tipdim'; box.parentNode.insertBefore(dim, box);
    dim.addEventListener('pointerdown', function (e) { e.stopPropagation(); e.preventDefault(); T.unlock(); });
    dim.addEventListener('contextmenu', function (e) { e.preventDefault(); T.unlock(); });
    lock = { dim: dim, rect: { x: r.x, y: r.y - 10, w: r.w, h: r.h }, orig: c, cur: { id: c.id, tier: c.tier, ench: c.ench },
      tiers: tiersOf(tpl), enchs: Object.keys(tpl.Enchantments || {}), screen: U.state.screen };
    lock.timer = setInterval(function () { if (U.state.screen !== lock.screen) T.unlock(); }, 250);
    box.classList.add('locked');
    drawLocked();
    U.sfx('ui.click', { vol: 0.5 });
    return true;
  };
  T.unlock = function () {
    if (!lock) return;
    var l = lock; lock = null; clearInterval(l.timer);
    if (l.dim.parentNode) l.dim.parentNode.removeChild(l.dim);
    if (box) { box.classList.remove('locked'); var p = box.querySelector('.lockpanel'); if (p) p.remove(); }
    T.hide();
  };
  // chuột phải trên thẻ; nhấn giữ (cảm ứng); Esc
  var press = null;
  document.addEventListener('contextmenu', function (e) {
    var el = e.target.closest && e.target.closest('.bz-card');
    if (lock) { if (!(e.target.closest && e.target.closest('.bz-tip'))) { e.preventDefault(); T.unlock(); } return; }
    if (!el || !cardOf(el)) return;
    var U = UI(); if (U && U.drag && U.drag.active && U.drag.active()) return;
    if (T.lock(el)) e.preventDefault();
  }, true);
  document.addEventListener('pointerdown', function (e) {
    if (e.pointerType !== 'touch' || lock) return;
    var el = e.target.closest && e.target.closest('.bz-card'); if (!el || !cardOf(el)) return;
    press = { x: e.clientX, y: e.clientY, id: e.pointerId, t: setTimeout(function () { var p = press; press = null; if (p) { T.lock(el); } }, LONG_MS) };
  }, true);
  function cancelPress(e) { if (press && (!e || e.pointerId === press.id)) { clearTimeout(press.t); press = null; } }
  document.addEventListener('pointermove', function (e) { if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_PX) cancelPress(e); }, true);
  document.addEventListener('pointerup', cancelPress, true);
  document.addEventListener('pointercancel', cancelPress, true);
  document.addEventListener('keydown', function (e) {
    if (lock && e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); T.unlock(); }
  }, true);
})(window);
