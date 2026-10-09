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
    if (!act.length && pas.length) { act = pas; pas = []; }
    var h = '<div class="tabs">';
    if (info.type === 'Skill') h += '<span class="tab">Kỹ năng</span>';
    else if (info.size) h += '<span class="tab">' + esc(String(info.size).toUpperCase()) + '</span>';
    (info.tags || []).slice(0, 3).forEach(function (t) { h += '<span class="tab t">' + esc(String(t).toUpperCase()) + '</span>'; });
    h += '</div><div class="box"><div class="head"><h3>' + esc(info.name) + '</h3><span class="tier">' + esc(TIER_VI[info.tier] || info.tier || '') +
      (info.ench ? ' · ' + esc(info.ench) : '') + '</span></div>';
    var clock = info.cooldown > 0;
    h += '<div class="body' + (clock ? ' has-clock' : '') + '">';
    if (clock) h += '<div class="clock"><b>' + (Math.round(info.cooldown / 100) / 10).toFixed(1) + '</b><small>GIÂY</small></div>';
    h += '<div class="lines">' + (act.join('') || '<div class="ln passive" style="opacity:.6">—</div>') + '</div>';
    if (info.ammoMax > 0) h += '<div class="ammo"><i></i>' + info.ammoMax + '</div>';
    h += '</div>';
    if (pas.length) h += '<div class="passives">' + pas.join('') + '</div>';
    if (info.crit > 0) h += '<div class="crit">TỈ LỆ CHÍ MẠNG: ' + ico('Crit Chance') + '<span class="num">' + Math.round(info.crit) + '%</span></div>';
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
  // show(info, rect {x,y,w,h} trên sân 1920×1080, prefer 'right'|'left')
  T.show = function (info, rect) {
    if (!box) return;
    var showing = box.classList.contains('show');
    if (cur !== info) { box.innerHTML = T.render(info); cur = info; }
    box.className = 'bz-tip t-' + (info.tier || 'Bronze') + (showing ? ' show' : '');
    box.style.display = 'block';
    var w = box.offsetWidth, h = box.offsetHeight;
    var gap = 26, x = rect.x + rect.w + gap, left = false;
    if (x + w > stageW - 12) { x = rect.x - gap - w; left = true; }
    if (x < 12) x = 12;
    var y = rect.y + rect.h / 2 - h / 2;
    y = Math.max(12, Math.min(stageH - h - 12, y));
    box.style.left = Math.round(x) + 'px'; box.style.top = Math.round(y) + 'px';
    box.style.transformOrigin = (left ? '100%' : '0') + ' 50%';
    if (!box.classList.contains('show')) { void box.offsetWidth; box.classList.add('show'); }
  };
  T.hide = function () { if (!box) return; box.classList.remove('show'); box.style.display = 'none'; cur = null; };
})(window);
