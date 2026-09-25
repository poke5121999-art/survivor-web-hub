// Pha prep: màn chuẩn bị trên bờ. Ba thẻ: Trang bị và Súng dựng theo ứng dụng iDiver trong điện thoại của Dave,
// Quán dựng theo ô nội thất của quán Bancho. Mọi hình, màu, cỡ, clip, gradient, font và tham số hạt lấy từ bản gốc:
//   - iDiver: bố cục prefab Phone_iDiver/iDiverPanel + IDiverScrollCellView (art/gear/idiver/layout/*.json, sinh bởi
//     tools/rip_ui.py), đọc lúc chạy. Ô 572×148, bảng lên cấp LevelUpPopup, clip Focus/UpgradeArrow, hạt nâng cấp gốc.
//   - Súng: ô iDiver + khung chỉ số StatusBox, nền, màu đầu, logo và ba VFX "súng mới" của app Duff (art/gear/duff).
//   - Quán: art/bar/ui/layout/interiorList.json (ô nội thất 110×140, bong bóng tên) và CookingStudyResultPanel trong
//     art/bar/ui/layout/recipes.json (bảng "nâng cấp xong" + hạt VFX_UI_CookingStudy_*), đọc lúc chạy.
//   - Font: Roboto-Medium cho chuỗi tiếng Việt, Snowstorm cho chuỗi nó phủ đủ ở nút gốc dùng preset số (css/fonts.css).
// Mọi dòng dựng từ bảng HX_META (GEAR, GUNS, BAR); mua qua HX_META.buy / buyGun / equipGun, ghi qua HX.save.commit.
(function (HX) {
  'use strict';
  var M = window.HX_META, BA = window.HX_BAR_ASSETS || {}, BO = window.HX_BOAT_ASSETS || {}, UI = window.HX_UI_ASSETS || {};
  var IDA = UI.idiver || {}, DUF = UI.duff || {}, FNT = UI.fonts || {};
  var REV = ((document.currentScript && document.currentScript.src || '').split('v=')[1] || '').split('&')[0];
  function url(p) { return p + (REV && !/^data:/.test(p) ? (p.indexOf('?') < 0 ? '?' : '&') + 'v=' + REV : ''); }
  function report(e) { if (HX.game && HX.game.errors) HX.game.errors.push(String(e)); }

  // [ĐỀ XUẤT] ảnh cho từng nâng cấp quán khi bảng BAR của meta.js chưa có trường icon (đều là sprite gốc của quán).
  var BAR_ICON = { seats: 'Sushi_FrontChair01', chef: 'UI_Sushi_Icon_Employee', decor: 'UI_Sushi_Icon_Interior', tea: '@tea' };
  // Màu cho phần màn chuẩn bị tự thêm (thẻ, nút mua, bảng quán). Phần dựng từ bố cục thì lấy màu trong bố cục.
  var C = {
    equip: [1, 0.831, 0.035, 1], disabled: [0.584, 0.541, 0.525, 1],   // disabled = Button_Disalbe của app Duff
    cellGreen: [0.482, 1, 0.043, 1], arrowGreen: [0.482, 0.992, 0.051, 1], lvBox: [0, 0, 0, 0.4],
  };

  // ================================================================ bố cục prefab (đọc lúc chạy)
  var LAY = null, layP = null;
  function loadLayouts() {
    if (layP) return layP;
    var want = [['panel', IDA.layouts && IDA.layouts.panel], ['cell', IDA.layouts && IDA.layouts.cell], ['duffApp', DUF.layouts && DUF.layouts.app]];
    Object.keys(DUF.vfx || {}).forEach(function (k) { want.push([k, DUF.vfx[k]]); });
    layP = Promise.all(want.map(function (w) {
      if (!w[1]) return Promise.reject(new Error('layout not found in HX_UI_ASSETS: ' + w[0]));
      return fetch(url(w[1].layout)).then(function (r) { if (!r.ok) throw new Error('layout not found: ' + w[1].layout); return r.json(); })
        .then(function (j) { return [w[0], j]; });
    })).then(function (list) {
      var o = {};
      list.forEach(function (p) { o[p[0]] = p[1]; });
      return (LAY = o);
    }, function (e) { report(e); return null; });
    return layP;
  }
  loadLayouts();   // nạp ngay khi tải trang: tới lúc vào pha prep thường đã xong
  // Nút theo đường dẫn tên con 'A/B/C'.
  function N(root, path) {
    var n = root;
    path.split('/').forEach(function (name) {
      var hit = null;
      (n && n.children || []).forEach(function (c) { if (!hit && c.name === name) hit = c; });
      n = hit;
    });
    if (!n) throw new Error('layout node not found: ' + path);
    return n;
  }
  function kid(n, name) { var r = null; (n.children || []).forEach(function (c) { if (!r && c.name === name) r = c; }); return r; }
  function script(n, cls) {
    var r = null;
    (n.scripts || []).forEach(function (s) { if (!r && s && typeof s === 'object' && s[cls]) r = s[cls]; });
    return r;
  }
  // RectTransform -> hộp trong khung cha (px UI gốc, gốc toạ độ góc trên trái). rt như rip_bar: [aMin.x, aMin.y, aMax.x, aMax.y,
  // pos.x, pos.y, size.x, size.y, pivot.x, pivot.y], y hướng lên.
  function rectOf(rt, pw, ph) {
    var w = pw * (rt[2] - rt[0]) + rt[6], h = ph * (rt[3] - rt[1]) + rt[7];
    var X = pw * (rt[0] + (rt[2] - rt[0]) * rt[8]) + rt[4], Y = ph * (rt[1] + (rt[3] - rt[1]) * rt[9]) + rt[5];
    return { x: X - rt[8] * w, y: ph - (Y + (1 - rt[9]) * h), w: w, h: h, px: rt[8], py: rt[9] };
  }
  function px(n) { return 'calc(var(--u) * ' + (Math.round(n * 100) / 100) + 'px)'; }
  function place(e, node, pw, ph) {
    var r = rectOf(node.rt, pw, ph), s = e.style;
    s.left = px(r.x); s.top = px(r.y); s.width = px(r.w); s.height = px(r.h);
    if (node.scale) { s.transform = 'scale(' + node.scale[0] + ',' + node.scale[1] + ')'; s.transformOrigin = (r.px * 100) + '% ' + ((1 - r.py) * 100) + '%'; }
    return r;
  }

  // ================================================================ sprite, nhuộm màu, 9 mảnh
  var UIS = IDA.sprites || {}, BARS = (BA.ui && BA.ui.sprites) || {}, IDVS = (BO.gearIcons && BO.gearIcons.idiverUI) || {};
  function spr(name) {
    if (name === '@tea') return BA.tea ? { name: 'Drink_Tea', img: BA.tea.img, border: null } : null;
    var s = UIS[name];
    if (s && s.img) return { name: name, img: s.img, border: s.border, w: s.w, h: s.h };
    if (IDVS[name]) return { name: name, img: IDVS[name], border: null };
    if (BARS[name]) return { name: name, img: BARS[name].img, border: BARS[name].border, w: BARS[name].w, h: BARS[name].h };
    throw new Error('sprite not found in manifests: ' + name);
  }
  // Sprite gốc cố ý không xuất (nút tay cầm Xbox…): nút mang nó thì bỏ.
  function unused(name) { return !!(name && UIS[name] && !UIS[name].img); }
  var imgs = {}, tints = {}, waiting = {};
  function load(src) {
    if (imgs[src]) return imgs[src].p;
    var im = new Image(), rec = { im: im, ok: false };
    rec.p = new Promise(function (res) {
      im.onload = function () { rec.ok = true; res(im); (waiting[src] || []).forEach(function (f) { f(); }); delete waiting[src]; };
      im.onerror = function () { report('image not found: ' + src); res(null); };
    });
    im.src = url(src);
    imgs[src] = rec;
    return rec.p;
  }
  function white(c) { return !c || (c[0] > 0.995 && c[1] > 0.995 && c[2] > 0.995 && c[3] > 0.995); }
  // Image.color gốc nhân vào màu sprite: nhuộm một lần trên canvas rồi giữ dataURL.
  function tinted(src, c, cb) {
    if (white(c)) return url(src);
    var key = src + '|' + c.map(function (v) { return v.toFixed(3); }).join(',');
    if (tints[key]) return tints[key];
    var rec = imgs[src];
    if (!rec || !rec.ok) { load(src); (waiting[src] = waiting[src] || []).push(function () { if (cb) cb(tinted(src, c)); }); return null; }
    var im = rec.im, cv = document.createElement('canvas'), x = cv.getContext('2d');
    cv.width = im.naturalWidth; cv.height = im.naturalHeight;
    x.drawImage(im, 0, 0);
    x.globalCompositeOperation = 'multiply';
    x.fillStyle = rgb(c); x.fillRect(0, 0, cv.width, cv.height);
    x.globalCompositeOperation = 'destination-in';
    x.globalAlpha = c[3]; x.drawImage(im, 0, 0);
    try { tints[key] = cv.toDataURL(); } catch (e) { tints[key] = url(src); }   // file:// làm bẩn canvas: bỏ nhuộm
    return tints[key];
  }
  function rgb(c) { return 'rgb(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ')'; }
  function rgba(c) { return 'rgba(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ',' + (+c[3]).toFixed(3) + ')'; }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function border9(s) {
    var b = (s.border || [0, 0, 0, 0]).slice();
    // Unity kéo giãn cả phần giữa rộng 0 px (lấy mẫu một cột điểm ảnh); border-image bỏ trống phần giữa rỗng: chừa 1 px.
    if (s.w && b[0] + b[2] >= s.w) b[2] = Math.max(0, s.w - b[0] - 1);
    if (s.h && b[1] + b[3] >= s.h) b[3] = Math.max(0, s.h - b[1] - 1);
    return b;
  }
  // Lớp nền 9 mảnh (Image kiểu Sliced): phủ kín cha, viền = border gốc × --u (hoặc --k trong ô quán).
  function nine(parent, name, color, unit) {
    var s = spr(name), b = border9(s), v = unit || 'u', layer = el('i', 'sk');
    layer.style.borderWidth = [b[3], b[2], b[1], b[0]].map(function (n) { return 'calc(' + n + 'px * var(--' + v + '))'; }).join(' ');
    function set(u) { if (u) layer.style.borderImage = 'url("' + u + '") ' + b[3] + ' ' + b[2] + ' ' + b[1] + ' ' + b[0] + ' fill stretch'; }
    set(tinted(s.img, color, set));
    parent.insertBefore(layer, parent.firstChild);
    parent.classList.add('has9');
    return layer;
  }
  // Image kiểu Simple: ảnh kéo kín hộp (preserveAspect thì vừa khít giữ tỉ lệ).
  function simple(e, name, color, keep) {
    var s = spr(name);
    function set(u) { if (u) e.style.backgroundImage = 'url("' + u + '")'; }
    set(tinted(s.img, color, set));
    e.style.backgroundSize = keep ? 'contain' : '100% 100%';
    e.style.backgroundRepeat = 'no-repeat'; e.style.backgroundPosition = 'center';
  }
  function img(name, cls, color) {
    var s = spr(name), i = el('img', cls);
    i.alt = ''; i.draggable = false;
    if (s) { var u = tinted(s.img, color, function (u2) { i.src = u2; }); if (u) i.src = u; }
    return i;
  }
  function pic(src, cls) { var i = el('img', cls); i.alt = ''; i.draggable = false; if (src) i.src = url(src); return i; }
  // Image kiểu Tiled (lát gạch) có màu: ảnh nền lặp.
  function tile(elm, name, color) {
    var s = spr(name);
    function set(u) { if (u) elm.style.backgroundImage = 'url("' + u + '")'; }
    set(tinted(s.img, color, set));
    return elm;
  }

  // ================================================================ gradient gốc (Gradient2, JoshH UIGradient)
  // Màu đỉnh = Image.color rồi lần lượt qua từng gradient như ModifyMesh chạy nối tiếp. Mọi gradient màn này đều góc 0/360:
  // Gradient2 horizontal và UIGradient linear/complexLinear chạy theo x (trái → phải) [xem HX_UI_ASSETS._about.gradients].
  function gradAt(g, t) {
    if (g.colors) return g.colors[0].map(function (v, i) { return v + (g.colors[1][i] - v) * t; });
    var s = g.gradient.stops;
    if (t <= s[0][0]) return s[0].slice(1);
    for (var i = 0; i < s.length - 1; i++) {
      if (t <= s[i + 1][0]) {
        var k = (t - s[i][0]) / Math.max(1e-6, s[i + 1][0] - s[i][0]);
        return s[i].slice(1).map(function (v, j) { return v + (s[i + 1][j + 1] - v) * k; });
      }
    }
    return s[s.length - 1].slice(1);
  }
  function blendCol(c, g, mode, k) {
    var t = mode === 'multiply' ? c.map(function (v, i) { return v * g[i]; }) : mode === 'add' ? c.map(function (v, i) { return Math.min(1, v + g[i]); }) : g;
    return c.map(function (v, i) { return v + (t[i] - v) * k; });
  }
  function gradCss(list, base) {
    var T = { 0: 1, 1: 1 };
    list.forEach(function (g) { if (g.gradient) g.gradient.stops.forEach(function (s) { T[s[0]] = 1; }); });
    var ts = Object.keys(T).map(Number).sort(function (a, b) { return a - b; });
    var dir = list[0].type === 'vertical' ? 'to top' : 'to right';
    return 'linear-gradient(' + dir + ', ' + ts.map(function (t) {
      var c = (base || [1, 1, 1, 1]).slice();
      list.forEach(function (g) { c = blendCol(c, gradAt(g, t), g.blend, g.intensity == null ? 1 : g.intensity); });
      return rgba(c) + ' ' + (t * 100).toFixed(1) + '%';
    }).join(', ') + ')';
  }
  // Gradient trên Image có sprite: màu gradient đổ kín hộp, hình sprite làm mặt nạ (9 mảnh thì mask-border).
  function paintGradient(e, im, list) {
    e.style.backgroundImage = gradCss(list, im.color);
    if (!im.sprite) return;
    var s = spr(im.sprite), u = url(s.img), st = e.style;
    if (im.type === 1 && s.border) {
      var b = border9(s), sl = [b[3], b[2], b[1], b[0]].join(' '), w = [b[3], b[2], b[1], b[0]].map(px).join(' ');
      st.webkitMaskBoxImage = 'url("' + u + '") ' + sl + ' / ' + w + ' stretch';
      st.setProperty('mask-border', 'url("' + u + '") ' + sl + ' fill / ' + w + ' stretch');
      st.borderRadius = px(b[0] / 2);   // trình duyệt không có mask-border: bo góc gần đúng
    } else {
      st.webkitMaskImage = st.maskImage = 'url("' + u + '")';
      st.webkitMaskSize = st.maskSize = '100% 100%';
    }
  }
  function paint(e, node) {
    var im = node.img;
    if (!im || im.off) return;
    if (node.gradients && node.gradients.length) return paintGradient(e, im, node.gradients);
    if (!im.sprite) { e.style.backgroundColor = rgba(im.color || [1, 1, 1, 1]); return; }
    if (im.type === 1) nine(e, im.sprite, im.color); else simple(e, im.sprite, im.color, im.preserveAspect);
  }

  // ================================================================ chữ: font theo preset gốc, cỡ tự co như TMP
  var SNOW = (FNT.files && FNT.files.snowstorm && FNT.files.snowstorm.cmap) || [];
  var ROBO = (FNT.files && FNT.files.roboto && FNT.files.roboto.cmap) || [];
  function inRanges(list, c) { for (var j = 0; j < list.length; j++) if (c >= list[j][0] && c <= list[j][1]) return true; return false; }
  // Chữ mà cả Roboto cũng không có (₂, →) không bắt đổi font: chúng vá từng chữ bằng font hệ thống trong mọi trường hợp.
  // Chữ Latin có dấu (â, á, ơ…) là chuỗi tiếng Việt: cả chuỗi sang Roboto dù Snowstorm có riêng chữ ấy, cho khỏi lẫn hai font
  // trong một câu ("5 giây" cạnh "mọi con").
  var LATIN_MARKED = /[À-ɏḀ-ỿ]/;
  function snowHas(str) {
    if (LATIN_MARKED.test(str)) return false;
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c !== 10 && !inRanges(SNOW, c) && (inRanges(ROBO, c) || !ROBO.length)) return false;
    }
    return SNOW.length > 0;
  }
  // Preset số/chỉ-tiếng-Anh (OnlyEnglish_SnowStorm, *_Num) giữ Snowstorm ở mọi ngôn ngữ nếu nó phủ đủ chuỗi.
  // Preset chữ khác đổi cả chuỗi sang Roboto, như game đổi sang Apotek khi Snowstorm không phủ tiếng Ba Lan/Thổ.
  function fontKind(t, str) {
    var p = t && t.font && t.font.preset, P = p && FNT.presets && FNT.presets[p];
    return P && /Snowstorm/.test(P.en || '') && /OnlyEnglish|Num$/.test(p) && snowHas(String(str)) ? 'num' : 'ui';
  }
  function setText(e, node, str) {
    var t = node.text, s = e.style;
    str = str == null ? '' : String(str);
    e.textContent = str;
    e.classList.add('pt');
    var kind = fontKind(t, str);
    e.classList.toggle('hx-f-num', kind === 'num'); e.classList.toggle('hx-f-ui', kind !== 'num');
    s.fontSize = px(t.size); s.color = rgba(t.color || [1, 1, 1, 1]);
    s.justifyContent = t.align & 2 ? 'center' : t.align & 4 ? 'flex-end' : 'flex-start';
    s.textAlign = t.align & 2 ? 'center' : t.align & 4 ? 'right' : 'left';
    s.alignItems = t.valign & 256 ? 'flex-start' : t.valign & 1024 ? 'flex-end' : 'center';
    s.fontStyle = t.style & 2 ? 'italic' : '';
    if (t.auto && t.sizeMinMax) e.dataset.fit = t.sizeMinMax.join(',');
    // hộp cao từ hai dòng trở lên (DescriptText…) thì xuống dòng như TMP; còn lại một dòng, giữ dấu xuống dòng của chuỗi gốc
    var rt = node.rt;
    e.classList.toggle('wrap', !!rt && rt[1] === rt[3] && rt[7] >= t.size * 2.2);
    var sc = script(node, 'UITextScroller');
    if (sc && sc.m_ScrollSpeed > 0) e.dataset.scroll = sc.m_ScrollSpeed + ',' + (sc.m_Padding || 0);
    return e;
  }
  // TMP auto size: co cỡ chữ tới khi vừa hộp, không nhỏ hơn cỡ min gốc.
  function fitText(e) {
    var mm = e.dataset.fit.split(',').map(Number), u = unit(), size = mm[1];
    e.style.fontSize = px(size);
    while (size > mm[0] && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1)) { size -= 1; e.style.fontSize = px(size); }
    return u;
  }
  // UITextScroller (m_ScrollSpeed px/giây, m_Padding, m_IsClone): chữ dài hơn hộp thì chạy vòng sang trái nối bản sao
  // [ĐỀ XUẤT: hành vi đoán theo tên trường của script gốc, code IL2CPP không đọc được].
  var scrollers = [], SCROLL_HOLD = 1.2;
  function armScroll(e) {
    if (e.querySelector('.pt-run')) return;
    var str = e.textContent;
    if (e.scrollWidth <= e.clientWidth + 1) return;
    var cfg = e.dataset.scroll.split(',').map(Number), run = el('span', 'pt-run'), a = el('span', null, str), b = el('span', null, str);
    a.style.paddingRight = px(cfg[1]);
    b.setAttribute('aria-hidden', 'true');
    run.appendChild(a); run.appendChild(b);
    e.textContent = ''; e.appendChild(run);
    e.style.justifyContent = 'flex-start';
    scrollers.push({ run: run, first: a, speed: cfg[0], t: 0 });
  }
  function fitAll(scope) {
    if (!scope) return;
    Array.prototype.forEach.call(scope.querySelectorAll('[data-fit]'), fitText);
    Array.prototype.forEach.call(scope.querySelectorAll('[data-scroll]'), armScroll);
  }
  function tickScroll(dt) {
    var u = unit();
    scrollers = scrollers.filter(function (s) {
      if (!s.run.isConnected) return false;
      // mỗi vòng dừng SCROLL_HOLD giây ở đầu chữ cho kịp đọc [ĐỀ XUẤT]
      var w = s.first.getBoundingClientRect().width / u, T = w / s.speed + SCROLL_HOLD;
      s.t = (s.t + dt) % T;
      s.run.style.transform = 'translateX(' + px(-Math.max(0, s.t - SCROLL_HOLD) * s.speed) + ')';
      return true;
    });
  }

  // ================================================================ dựng một nút bố cục thành DOM
  // Div định vị tuyệt đối theo RectTransform (px UI gốc × --u), vẽ Image/gradient/chữ, con đệ quy.
  // LayoutGroup gốc -> flex (con theo luồng). Nút tắt, nút hạt, nút có sprite không xuất, nút opt.skip() trả true: bỏ.
  var ALIGN = ['flex-start', 'center', 'flex-end'];
  function mk(node, pw, ph, opt) {
    opt = opt || {};
    var e = el(opt.tag && opt.tag(node) || 'div', 'pn');
    e.dataset.n = node.name;
    var r = place(e, node, pw, ph);
    paint(e, node);
    if (node.text) setText(e, node, node.text.text);
    var hg = script(node, 'HorizontalLayoutGroup'), vg = script(node, 'VerticalLayoutGroup'), lg = hg || vg;
    if (lg) {
      var a = lg.m_ChildAlignment || 0, s = e.style;
      s.display = 'flex'; s.flexDirection = hg ? 'row' : 'column'; s.gap = px(lg.m_Spacing || 0);
      s.justifyContent = hg ? ALIGN[a % 3] : ALIGN[Math.floor(a / 3)];
      s.alignItems = hg ? ALIGN[Math.floor(a / 3)] : ALIGN[a % 3];
    }
    (node.children || []).forEach(function (c) {
      if (c.off || c.particle || c.skipped || (c.img && unused(c.img.sprite)) || (opt.skip && opt.skip(c))) return;
      var ce = mk(c, r.w, r.h, opt);
      if (lg) {
        var cs = ce.style, fit = script(c, 'ContentSizeFitter');
        cs.position = 'relative'; cs.left = cs.top = ''; cs.flex = 'none';
        // LayoutGroup điều khiển cỡ con = cỡ ưa thích: chữ co theo nội dung, Image lấy cỡ gốc của sprite.
        // (Bẫy đã sập: div chỉ có ảnh nền mà để width:auto thì rộng 0, xu trong ô giá biến mất.)
        var sp = c.img && c.img.sprite && UIS[c.img.sprite];
        if (lg.m_ChildControlWidth || (fit && fit.m_HorizontalFit === 2)) cs.width = sp && sp.w ? px(sp.w) : 'auto';
        if (lg.m_ChildControlHeight || (fit && fit.m_VerticalFit === 2)) cs.height = sp && sp.h ? px(sp.h) : 'auto';
      }
      e.appendChild(ce);
    });
    return e;
  }
  function pick(e, path) {
    var cur = e;
    path.split('/').forEach(function (n) {
      var hit = null;
      Array.prototype.forEach.call(cur ? cur.children : [], function (c) { if (!hit && c.dataset && c.dataset.n === n) hit = c; });
      cur = hit;
    });
    if (!cur) throw new Error('layout element not found: ' + path);
    return cur;
  }
  // Nút bấm theo nút bố cục (ảnh nền 9 mảnh gốc) với nhãn tự đặt; cỡ chữ lấy từ nút Text con.
  function textNodeIn(n) { if (n.text) return n; for (var i = 0; n.children && i < n.children.length; i++) { var t = textNodeIn(n.children[i]); if (t) return t; } return null; }

  // ================================================================ đường cong, clip, DOTween
  // Khoá: [t, v] tuyến tính; [t, v, in, out] Hermite (clip legacy, đường cong hạt); [t, v, c, b, a] Mecanim đã nén.
  function evalKeys(k, t) {
    var n = k.length;
    if (!n) return 0;
    if (n === 1 || t <= k[0][0]) return k[0][1];
    if (t >= k[n - 1][0]) return k[n - 1][1];
    var i = 0;
    while (i < n - 2 && t >= k[i + 1][0]) i++;
    var a = k[i], b = k[i + 1], d = t - a[0], L = b[0] - a[0];
    if (a.length === 5) return ((a[4] * d + a[3]) * d + a[2]) * d + a[1];
    var s = L > 0 ? d / L : 0;
    if (a.length >= 4 && b.length >= 4) {
      var s2 = s * s, s3 = s2 * s;
      return (2 * s3 - 3 * s2 + 1) * a[1] + (s3 - 2 * s2 + s) * L * a[3] + (-2 * s3 + 3 * s2) * b[1] + (s3 - s2) * L * b[2];
    }
    return a[1] + (b[1] - a[1]) * s;
  }
  // DG.Tweening.Ease: chỉ những kiểu bố cục gốc dùng tới.
  var EASE = {
    1: function (t) { return t; }, 3: function (t) { return Math.sin(t * Math.PI / 2); },
    6: function (t) { return t * (2 - t); }, 9: function (t) { return 1 - Math.pow(1 - t, 3); },
    21: function (t) { return Math.sqrt(1 - (t - 1) * (t - 1)); },
    27: function (t) { var s = 1.70158; t -= 1; return t * t * ((s + 1) * t + s) + 1; },
  };

  var anims = [];
  // clip: { length, loop, curves:[{attr, keys, path}], spriteKeys:[[tên, ms]] }. Áp lên el; path khác gốc thì bỏ.
  function playClip(elm, clip, o) {
    o = o || {};
    stopAnim(elm, o.slot || 'clip');
    var a = { el: elm, slot: o.slot || 'clip', t: 0, clip: clip, o: o };
    anims.push(a);
    applyClip(a);
    return a;
  }
  function stopAnim(elm, slot) { anims = anims.filter(function (a) { return !(a.el === elm && a.slot === slot); }); }
  function applyClip(a) {
    var c = a.clip, t = c.loop ? a.t % c.length : Math.min(a.t, c.length), st = a.state = a.state || {};
    (c.curves || []).forEach(function (cv) {
      if (cv.path && cv.path !== 0 && cv.path !== '' && cv.path !== a.o.path) return;
      st[cv.attr] = evalKeys(cv.keys, t);
    });
    var tr = '';
    var ax = st['m_AnchoredPosition.x'], ay = st['m_AnchoredPosition.y'];
    if (ax != null || ay != null) tr += 'translate(calc(' + ((ax || 0) - (a.o.x0 || 0)) + 'px * var(--u)), calc(' + (-(ay || 0)) + 'px * var(--u))) ';
    if (st['localScale.x'] != null || st['localScale.y'] != null) tr += 'scale(' + (st['localScale.x'] != null ? st['localScale.x'] : 1) + ',' + (st['localScale.y'] != null ? st['localScale.y'] : 1) + ')';
    if (tr) a.el.style.transform = tr;
    var alpha = st['m_Color.a'] != null ? st['m_Color.a'] : st.m_Alpha;
    if (alpha != null) a.el.style.opacity = Math.max(0, Math.min(1, alpha));
    if (a.o.color && (st['m_Color.g'] != null || st['m_Color.b'] != null)) a.o.color(st);
    if (c.spriteKeys && a.o.sprite) {
      var ms = t * 1000, acc = 0, name = c.spriteKeys[0][0];
      for (var i = 0; i < c.spriteKeys.length; i++) { acc += c.spriteKeys[i][1]; name = c.spriteKeys[i][0]; if (ms < acc) break; }
      if (a.sprite !== name) { a.sprite = name; a.o.sprite(name); }
    }
  }
  // DOTweenAnimation gốc (animationType 1/2 Move, 5 Scale, 7 Fade), loops -1 + loopType 1 = Yoyo.
  function tween(elm, tw, slot) {
    var a = { el: elm, slot: slot || 'tween', t: -(tw.delay || 0), tw: tw };
    stopAnim(elm, a.slot);
    anims.push(a);
    applyTween(a);
    return a;
  }
  function applyTween(a) {
    var tw = a.tw, d = tw.duration || 0.001, t = Math.max(0, a.t), k = t / d, loops = tw.loops == null ? 1 : tw.loops;
    if (loops >= 0 && k >= loops) { k = 1; a.done = true; } else {
      var n = Math.floor(k); k -= n;
      if (tw.loopType === 1 && n % 2 === 1) k = 1 - k;
    }
    var e = (EASE[tw.easeType] || EASE[1])(k), v3 = tw.endValueV3 || [0, 0, 0];
    if (tw.isFrom) e = 1 - e;
    if (tw.animationType === 1 || tw.animationType === 2) {
      a.el.style.transform = 'translate(calc(' + (v3[0] * e) + 'px * var(--u)), calc(' + (-v3[1] * e) + 'px * var(--u)))';
    } else if (tw.animationType === 5) {
      a.el.style.transform = 'scale(' + (1 + (v3[0] - 1) * e) + ')';
    } else if (tw.animationType === 7) {
      a.el.style.opacity = 1 + ((tw.endValueFloat || 0) - 1) * e;
    }
  }
  function tickAnims(dt) {
    anims = anims.filter(function (a) {
      if (!a.el.isConnected) return false;
      a.t += dt;
      if (a.clip) {
        applyClip(a);
        if (!a.clip.loop && a.t >= a.clip.length) { if (a.o.then) a.o.then(); return false; }
        return true;
      }
      applyTween(a);
      return !a.done;
    });
  }
  function barClip(name) { return BA.ui && BA.ui.clips && BA.ui.clips[name] || null; }
  function idvClip(name) {
    var c = IDA.clips && IDA.clips[name];
    if (!c) throw new Error('clip not found in HX_UI_ASSETS: ' + name);
    return c;
  }

  // ================================================================ hạt UI (công thức ParticleSystem gốc)
  // Dạng nút `particle` trong bố cục (rip_bar.dump_node, dùng cho cả iDiver, Duff và quán). Ảnh hạt tìm trong
  // HX_UI_ASSETS rồi tới HX_BAR_ASSETS. Hạt rip_ui đã đánh dấu skip (shader flow/mask, mesh) thì bỏ.
  function R(v) { return Array.isArray(v) ? v[0] + Math.random() * (v[1] - v[0]) : (+v || 0); }
  function texOf(name) {
    var t = (IDA.textures && IDA.textures[name]) || (DUF.textures && DUF.textures[name]) || (BA.vfx && BA.vfx.textures && BA.vfx.textures[name]);
    return t || null;
  }
  function normBar(p, name, off, scale) {
    var r = p.render || {}, tint = r.tint && (r.tint._Color || r.tint._TintColor || r.tint._BaseColor) || [1, 1, 1, 1];
    var tex = typeof r.texture === 'string' ? texOf(r.texture) : null;
    return {
      name: name, on: !!r.enabled && !!tex && !p.skip, delay: p.startDelay || 0, duration: p.duration || 1, loop: !!p.loop, prewarm: !!p.prewarm,
      rate: typeof p.rate === 'number' ? p.rate : 0,
      bursts: (p.bursts || []).map(function (b) { var c = b.count; return { t: b.t || 0, n: typeof c === 'number' ? c : Array.isArray(c) ? Math.round(R(c)) : (c && c.mul) || 0 }; }),
      life: p.lifetime, speed: p.speed, size: p.size, sizeY: p.sizeY, rot: p.rotation || 0, color: p.color, max: p.maxParticles || 1000,
      shape: p.shape ? { type: p.shape.type, radius: p.shape.radius, scale: p.shape.scale, arc: p.shape.arc } : null,
      sol: p.sizeOverLife && p.sizeOverLife.curve ? p.sizeOverLife.curve : null,
      col: p.colorOverLife || null, rotLife: p.rotationOverLife ? p.rotationOverLife.curve : null,
      vel: p.velocityOverLife ? { x: p.velocityOverLife.x, y: p.velocityOverLife.y } : null, sheet: p.sheet || null,
      mode: r.mode, lenScale: r.lengthScale == null ? 2 : r.lengthScale, velScale: r.velocityScale || 0, order: r.order || 0,
      add: /One$/.test(r.blend || '') || /Add/i.test(r.shader || ''), tint: tint, img: tex ? tex.img : null, scale: scale || [1, 1], off: off || [0, 0],
    };
  }
  function colorAt(spec, rnd) {
    if (Array.isArray(spec)) return spec;
    var pair = spec && (spec.random || spec.randomColor);
    if (pair) return pair[0].map(function (v, i) { return v + (pair[1][i] - v) * rnd; });
    return [1, 1, 1, 1];
  }
  function gradPart(g, f) {
    function ch(list, f, n) {
      if (!list || !list.length) return n === 1 ? [1] : [1, 1, 1];
      if (f <= list[0][0]) return list[0].slice(1);
      for (var i = 0; i < list.length - 1; i++) {
        var a = list[i], b = list[i + 1];
        if (f <= b[0]) { var s = (f - a[0]) / Math.max(1e-6, b[0] - a[0]); return a.slice(1).map(function (v, j) { return v + (b[j + 1] - v) * s; }); }
      }
      return list[list.length - 1].slice(1);
    }
    var c = ch(g.color, f, 3), al = ch(g.alpha, f, 1);
    return [c[0], c[1], c[2], al[0]];
  }
  function lifeColor(col, f, rnd) {
    if (!col) return [1, 1, 1, 1];
    if (col.gradient) return gradPart(col.gradient, f);
    var two = col.randomGradient || col.between;
    if (two) { var a = gradPart(two[0], f), b = gradPart(two[1], f); return a.map(function (v, i) { return v + (b[i] - v) * rnd; }); }
    return [1, 1, 1, 1];
  }
  function curveAt(c, f) {
    if (c == null) return 1;
    if (typeof c === 'number') return c;
    if (c.curve && typeof c.curve === 'object' && !Array.isArray(c.curve)) return curveAt(c.curve, f);
    return evalKeys(c.curve || [], f) * (c.mul == null ? 1 : c.mul);
  }

  // Hai tấm vẽ hạt: 'over' phủ trên mọi thứ; 'under' đặt ngay dưới bảng đang bật (hạt là nút anh đứng trước bảng trong prefab).
  var fx = { over: null, under: null, dpr: 1, systems: [] };
  function fxCanvas() { var cv = el('canvas', 'pr-fx'); return { cv: cv, x: cv.getContext('2d') }; }
  function Sys(ems, host, o) {
    this.ems = ems.filter(function (e) { return e.on && e.img; }).map(function (e) { return { e: e, t: 0, acc: 0, done: {}, parts: [] }; });
    this.ems.sort(function (a, b) { return a.e.order - b.e.order; });
    this.host = host; this.o = o || {}; this.stopped = false; this.t = 0;
    this.ems.forEach(function (s) { load(s.e.img); if (s.e.prewarm && s.e.loop) for (var i = 0; i < 30; i++) this.stepEm(s, s.e.duration / 30); }, this);
  }
  Sys.prototype.spawn = function (s) {
    var e = s.e;
    if (s.parts.length >= e.max) return;
    var px0 = 0, py0 = 0, dx = 0, dy = 0, sh = e.shape, sc = sh && sh.scale || [1, 1];
    if (sh) {
      var ang = Math.random() * Math.PI * 2 * ((sh.arc || 360) / 360);
      if (sh.type === 'box') { px0 = (Math.random() - 0.5) * sc[0]; py0 = (Math.random() - 0.5) * sc[1]; }
      else if (sh.type === 'edge') { px0 = (Math.random() * 2 - 1) * (sh.radius || 0) * sc[0]; dy = 1; }
      else if (sh.type === 'donut') { var rr = (sh.radius || 0); px0 = Math.cos(ang) * rr * sc[0]; py0 = Math.sin(ang) * rr * sc[1]; dx = Math.cos(ang); dy = Math.sin(ang); }
      else { var r0 = (sh.radius || 0) * Math.sqrt(Math.random()); px0 = Math.cos(ang) * r0 * sc[0]; py0 = Math.sin(ang) * r0 * sc[1]; dx = Math.cos(ang); dy = Math.sin(ang); }
    } else { var a0 = Math.random() * Math.PI * 2; dx = Math.cos(a0); dy = Math.sin(a0); }
    var sp = R(e.speed), size = R(e.size);
    s.parts.push({
      x: px0, y: py0, vx: dx * sp, vy: dy * sp, age: 0, life: Math.max(0.01, R(e.life)),
      w: size, h: e.sizeY != null ? R(e.sizeY) : size, rot: R(e.rot), rv: e.rotLife == null ? 0 : (typeof e.rotLife === 'number' ? e.rotLife : R(e.rotLife)),
      c0: colorAt(e.color, Math.random()), rc: Math.random(),
      ex: e.vel ? R(e.vel.x) : 0, ey: e.vel ? R(e.vel.y) : 0,
    });
  };
  Sys.prototype.stepEm = function (s, dt) {
    var e = s.e;
    s.t += dt;
    var lt = s.t - e.delay;
    if (!this.stopped && lt >= 0) {
      var cyc = e.loop ? Math.floor(lt / e.duration) : 0, inCyc = e.loop ? lt - cyc * e.duration : lt;
      e.bursts.forEach(function (b, i) {
        var key = cyc + ':' + i;
        if (!s.done[key] && inCyc >= b.t && (e.loop || lt <= e.duration + 1e-3)) { s.done[key] = 1; for (var n = 0; n < b.n; n++) this.spawn(s); }
      }, this);
      if (e.rate > 0 && (e.loop || lt <= e.duration)) {
        s.acc += e.rate * dt;
        while (s.acc >= 1) { s.acc -= 1; this.spawn(s); }
      }
    }
    s.parts = s.parts.filter(function (p) {
      p.age += dt;
      if (p.age >= p.life) return false;
      p.x += (p.vx + p.ex) * dt; p.y += (p.vy + p.ey) * dt; p.rot += p.rv * dt;
      return true;
    });
  };
  Sys.prototype.alive = function () {
    if (!this.host.isConnected) return false;
    var busy = false;
    this.ems.forEach(function (s) {
      if (s.parts.length) busy = true;
      else if (!this.stopped && (s.e.loop || s.t < s.e.delay + s.e.duration + 0.05)) busy = true;
    }, this);
    return busy;
  };
  var tintCache = {};
  function tintedCanvas(im, c) {
    var q = function (v) { return Math.round(Math.max(0, Math.min(1, v)) * 8) / 8; };
    var r = q(c[0]), g = q(c[1]), b = q(c[2]);
    if (r === 1 && g === 1 && b === 1) return im;
    var key = im.src + '|' + r + ',' + g + ',' + b;
    if (tintCache[key]) return tintCache[key];
    var cv = document.createElement('canvas'), x = cv.getContext('2d');
    cv.width = im.naturalWidth; cv.height = im.naturalHeight;
    x.drawImage(im, 0, 0);
    x.globalCompositeOperation = 'multiply'; x.fillStyle = rgb([r, g, b]); x.fillRect(0, 0, cv.width, cv.height);
    x.globalCompositeOperation = 'destination-in'; x.drawImage(im, 0, 0);
    return (tintCache[key] = cv);
  }
  Sys.prototype.draw = function (x, u) {
    var r = this.host.getBoundingClientRect(), ox = r.left + r.width / 2 + (this.o.dx || 0) * u, oy = r.top + r.height / 2 - (this.o.dy || 0) * u;
    this.ems.forEach(function (s) {
      var e = s.e, rec = imgs[e.img];
      if (!rec || !rec.ok || !s.parts.length) return;
      var im = rec.im, cols = e.sheet ? e.sheet.cols || e.sheet.tilesX || 1 : 1, rows = e.sheet ? e.sheet.rows || e.sheet.tilesY || 1 : 1;
      var fw = im.naturalWidth / cols, fh = im.naturalHeight / rows, frames = cols * rows;
      x.globalCompositeOperation = e.add ? 'lighter' : 'source-over';
      s.parts.forEach(function (p) {
        var f = p.age / p.life, lc = lifeColor(e.col, f, p.rc), k = curveAt(e.sol, f);
        var a = p.c0[3] * lc[3] * e.tint[3] * (e.add && e.tint[3] < 0.6 ? 2 : 1);
        if (a <= 0.003) return;
        var cc = [p.c0[0] * lc[0] * e.tint[0], p.c0[1] * lc[1] * e.tint[1], p.c0[2] * lc[2] * e.tint[2]];
        var w = p.w * k * e.scale[0] * u, h = p.h * k * e.scale[1] * u;
        if (w < 0.3 || h < 0.3) return;
        var X = ox + (e.off[0] + p.x) * u, Y = oy - (e.off[1] + p.y) * u, ang = -p.rot;
        if (e.mode === 'stretch') {
          var vx = p.vx + p.ex, vy = p.vy + p.ey, spd = Math.sqrt(vx * vx + vy * vy);
          ang = Math.atan2(-vy, vx);
          w = Math.max(w, (p.w * k * (e.lenScale || 1) + spd * (e.velScale || 0)) * u);
        }
        var fi = 0;
        if (frames > 1) {
          var fot = e.sheet.frameOverTime ? curveAt(e.sheet.frameOverTime, f) : f;
          fi = Math.min(frames - 1, Math.floor(fot * frames * (e.sheet.cycles || 1)) % frames);
        }
        var src = tintedCanvas(im, cc);
        x.globalAlpha = Math.min(1, a);
        x.save(); x.translate(X, Y); if (ang) x.rotate(ang);
        x.drawImage(src, (fi % cols) * fw, Math.floor(fi / cols) * fh, fw, fh, -w / 2, -h / 2, w, h);
        x.restore();
      });
    });
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  };
  function fxPlay(ems, host, o) { var s = new Sys(ems, host, o); fx.systems.push(s); return s; }
  // Gom mọi nút có `particle` dưới một nút VFX, cộng dồn vị trí RectTransform (px UI gốc, y lên) và scale của nút.
  function layoutFx(node, host, o) {
    var out = [];
    // (cx, cy) = tâm khung cha. Hệ hạt phát ở điểm pivot của nút; con của nó neo theo khung của nút.
    (function walk(n, cx, cy, pw, ph, k) {
      var rt = n.rt, x = cx, y = cy, w = pw, h = ph, mx = cx, my = cy;
      if (rt) {
        w = pw * (rt[2] - rt[0]) + rt[6]; h = ph * (rt[3] - rt[1]) + rt[7];
        x = cx + (rt[0] + (rt[2] - rt[0]) * rt[8] - 0.5) * pw + rt[4];
        y = cy + (rt[1] + (rt[3] - rt[1]) * rt[9] - 0.5) * ph + rt[5];
        mx = x + (0.5 - rt[8]) * w; my = y + (0.5 - rt[9]) * h;
      }
      var kk = n.scale ? [k[0] * n.scale[0], k[1] * n.scale[1]] : k;
      if (n.particle && !n.off) out.push(normBar(n.particle, n.name, [x, y], kk));
      (n.children || []).forEach(function (c) { if (!c.off) walk(c, mx, my, w, h, kk); });
    })(node, 0, 0, 100, 100, [1, 1]);
    return fxPlay(out, host, o);
  }
  function fxResize() {
    var d = Math.min(2, window.devicePixelRatio || 1), w = Math.round(innerWidth * d), h = Math.round(innerHeight * d);
    [fx.over, fx.under].forEach(function (L) { if (L && (L.cv.width !== w || L.cv.height !== h)) { L.cv.width = w; L.cv.height = h; } });
    fx.dpr = d;
  }
  function tickFx(dt) {
    if (!fx.over) return;
    fxResize();
    var u = unit();
    [fx.over, fx.under].forEach(function (L) { L.x.setTransform(fx.dpr, 0, 0, fx.dpr, 0, 0); L.x.clearRect(0, 0, innerWidth, innerHeight); });
    fx.systems = fx.systems.filter(function (s) {
      s.ems.forEach(function (em) { s.stepEm(em, dt); });
      if (!s.alive()) return false;
      s.draw((s.o.under ? fx.under : fx.over).x, u * (s.o.k || 1));
      return true;
    });
  }
  function fxStopAll() { fx.systems.forEach(function (s) { s.stopped = true; s.ems.forEach(function (e) { e.parts = []; }); }); fx.systems = []; }

  // ================================================================ tiếng UI gốc
  // Giải mã bằng AudioContext riêng như boat.js: bộ kiểm đếm số tệp HX.audio giải mã (34), không được cộng thêm.
  var SFX = { ui_click: 'ui_click', ui_buy: 'ui_buy', ui_levelup: 'ui_levelup', ui_fail: 'ui_fail', ui_slot: 'ui_slot', ui_close: 'ui_close', ui_app: 'ui_app' };
  var AU = { ctx: null, buf: {}, p: null };
  function audioLoad() {
    if (AU.p) return AU.p;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return (AU.p = Promise.resolve());
    AU.ctx = new AC();
    var list = Object.keys(SFX).map(function (k) { return [k, BO.audio && BO.audio[SFX[k]] && BO.audio[SFX[k]].src]; });
    if (BA.audio && BA.audio.result_popup1) list.push(['bar_result', BA.audio.result_popup1.src]);
    AU.p = Promise.all(list.filter(function (x) { return x[1]; }).map(function (x) {
      return fetch(url(x[1])).then(function (r) { if (!r.ok) throw new Error('sound not found: ' + x[1]); return r.arrayBuffer(); })
        .then(function (ab) { return new Promise(function (res) { AU.ctx.decodeAudioData(ab, function (b) { AU.buf[x[0]] = b; res(); }, function () { res(); }); }); });
    })).catch(report);
    return AU.p;
  }
  function sfx(key, vol) {
    if (!AU.ctx || !AU.buf[key] || (HX.audio && HX.audio.isMuted())) return;
    if (AU.ctx.state === 'suspended') AU.ctx.resume();
    var s = AU.ctx.createBufferSource(), g = AU.ctx.createGain();
    s.buffer = AU.buf[key]; g.gain.value = vol == null ? 0.9 : vol;
    s.connect(g); g.connect(AU.ctx.destination); s.start();
  }
  function unlock() { if (AU.ctx && AU.ctx.state === 'suspended') AU.ctx.resume(); if (HX.audio) HX.audio.unlock(); }

  // ================================================================ số và chữ
  function num(v) { return String(Math.round(v * 100) / 100).replace('.', ','); }
  function fmt(v, unit) { return unit === '×' ? '×' + num(v) : num(v) + (unit ? ' ' + unit : ''); }
  function statLabel(t) { return t.stat || String(t.desc || '').split(/[;,]/)[0]; }
  function lvText(n) { return 'Lv.' + n; }   // nút CurrentLevel/NextLevel gốc: preset OnlyEnglish, "Lv." ở mọi ngôn ngữ
  function gunStats(g) {
    var L = M.gunStat(g.id, 1), extra;
    if (g.mode === 'spread') extra = ['Số viên', L.pellets + ' (±' + num(L.spreadDeg / 2) + '°)'];
    else if (g.mode === 'pierce') extra = ['Đạn xuyên', 'mọi con'];
    else if (g.mode === 'sleep') extra = ['Gây ngủ', num(L.sleep) + ' giây'];
    else if (g.mode === 'net') extra = ['Lưới', 'cỡ ≤ ' + num(L.netSize) + ', ' + L.netCount + ' con'];
    else if (g.mode === 'grenade') extra = ['Nổ', 'bán kính ' + num(L.blast) + ' m'];
    else extra = ['Nhịp bắn', num(L.cooldown) + ' giây'];
    return [['Sát thương', L.dmg ? num(L.dmg) : '0'], ['Số đạn', String(L.ammo)], ['Tầm bắn', num(L.range) + ' m'], extra];
  }
  function numSpan(v, cls) { var s = el('span', 'hx-f-num' + (cls ? ' ' + cls : ''), String(v)); return s; }

  // ================================================================ dựng màn
  var TABS = [
    { id: 'gear', name: 'Trang bị' },
    { id: 'guns', name: 'Súng' },
    { id: 'bar', name: 'Quán' },
  ];
  var root = null, app = null, body = null, tab = 'gear', msg = '', sel = {}, lastSave = null, pop = null, recipes = null;

  function unit() { return root ? +root.style.getPropertyValue('--u') || 1 : 1; }
  // Cỡ: 2 cột ô iDiver 572 px gốc + lề; cao: thanh đầu 70 + 3 hàng 148 + thanh báo. Màn dọc hẹp thì 1 cột.
  function layout() {
    if (!root) return;
    var cs = getComputedStyle(root), W = root.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var H = root.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    var uh = H / (70 + 20 + 3 * 148 + 2 * 12 + 48), uw = W / (2 * 572 + 12 + 28 + 16);   // +16: chỗ thanh cuộn
    if (uw < 0.5) uw = W / (572 + 28);
    var u = Math.max(0.42, Math.min(1.15, Math.min(uw, uh)));
    var changed = Math.abs(u - unit()) > 1e-4;
    root.style.setProperty('--u', u.toFixed(4));
    root.style.setProperty('--k', (u * 1.3).toFixed(4));   // ô nội thất gốc 110×140 phóng ×1,3 cho đọc được [ĐỀ XUẤT]
    fxResize();
    if (changed && app) fitAll(app);
  }

  function goldText(s) { return s.gold + ' vàng'; }
  function header(s) {
    var P = LAY.panel, top = N(P, 'CommonBg/LogoTitle'), logo = N(top, 'Logo'), duff = tab === 'guns';
    var head = el('div', 'pr-head'), lr = rectOf(logo.rt, 604, top.rt[7]);
    head.style.minHeight = px(top.rt[7]);
    head.style.paddingLeft = px(logo.rt[4]);
    if (duff && DUF.header) {
      // app Duff: HeaderImage màu gốc + logo UI_WeaponCraft_Logo (dải 604×72 gốc, cắt lấy phần giữa có chữ)
      head.classList.add('duff');
      head.style.backgroundColor = rgba(DUF.header.color);
      var dl = el('div', 'pr-logo duff');
      dl.style.backgroundImage = 'url("' + url(DUF.images.logo.img) + '")';
      // cao bằng khung logo iDiver (38 × 1,2), cắt lấy 58% giữa dải (mặt Duff + chữ) cho vừa hàng thẻ [ĐỀ XUẤT]
      var lh = lr.h * (logo.scale ? logo.scale[1] : 1);
      dl.style.height = px(lh); dl.style.width = px(DUF.images.logo.w * lh / DUF.images.logo.h * 0.58);
      dl.setAttribute('role', 'img'); dl.setAttribute('aria-label', "Duff's Weapon Shop");
      head.appendChild(dl);
    } else {
      var tb = el('div', 'pr-topbg'); simple(tb, top.img.sprite); head.appendChild(tb);
      var lg = img(logo.img.sprite, 'pr-logo');
      lg.style.width = px(lr.w); lg.style.height = px(lr.h);
      if (logo.scale) { lg.style.transform = 'scale(' + logo.scale[0] + ',' + logo.scale[1] + ')'; lg.style.transformOrigin = '0 50%'; lg.style.marginRight = px(lr.w * (logo.scale[0] - 1)); }
      head.appendChild(lg);
    }
    head.appendChild(el('h2', 'hx-f-ui', 'Ngày ' + s.day));
    var tabs = el('div', 'pr-tabs'), tabOn = N(P, 'CommonBg/SelectedPanel/LevelUpPopup/Root/Next_BG').img.color, tabOff = N(LAY.cell, 'TitleName_BG').img.color;
    tabs.setAttribute('role', 'tablist');
    TABS.forEach(function (t) {
      var on = t.id === tab, b = el('button', 'pr-tab hx-f-ui' + (on ? ' on' : ''));
      b.dataset.tab = t.id; b.type = 'button';
      b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', on ? 'true' : 'false');
      nine(b, 'Box_8rad', on ? tabOn : tabOff);
      b.appendChild(el('span', null, t.name));
      b.addEventListener('click', function () { unlock(); if (tab !== t.id) { tab = t.id; msg = ''; sfx('ui_click'); render(); focusSel(); } });
      tabs.appendChild(b);
    });
    head.appendChild(tabs);
    var gbox = el('div', 'pr-goldbox'), gold = el('div', 'pr-gold');
    gold.appendChild(img('Coin24', 'pr-coin'));
    var gn = el('span', 'pr-goldn');
    gn.appendChild(numSpan(s.gold)); gn.appendChild(document.createTextNode(' vàng'));
    gold.appendChild(gn);
    gbox.appendChild(gold);
    head.appendChild(gbox);
    var go = el('button', 'pr-go hx-f-ui');
    go.id = 'prep-go'; go.type = 'button';
    nine(go, 'UI_WeaponCraft_Cell_Btn_Pink');
    go.appendChild(el('span', null, 'Ra khơi'));
    go.addEventListener('click', function () { unlock(); sfx('ui_click'); closePop(true); HX.game.go('boat', { dir: 'out' }); });
    head.appendChild(go);
    return head;
  }

  function buyButton(label, state) {
    // state: 'ok' (hồng), 'poor' (thiếu tiền: xám nhưng vẫn bấm được để báo), 'max' (tắt), 'grey' (nút xám của iDiver)
    var b = el('button', 'pr-buy hx-f-ui ' + state);
    b.type = 'button';
    if (state === 'max') b.disabled = true;
    if (state === 'poor') b.title = 'Thiếu tiền';
    nine(b, state === 'ok' ? 'UI_WeaponCraft_Cell_Btn_Pink' : 'UI_WeaponCraft_Cell_Btn_Grey', state === 'ok' ? null : state === 'grey' ? [0.27, 0.27, 0.27, 1] : C.disabled);
    b.appendChild(el('span', null, label));
    return b;
  }

  // Ô iDiver (IDiverScrollCellView 572×148), dựng từ bố cục. o: { key, icon, name, max, stroke, gun }
  function cellFrame(o) {
    var L = LAY.cell, W = L.rt[6], H = L.rt[7];
    var row = el('div', 'pr-row pr-cell');
    row.dataset.key = o.key;
    row.style.width = px(W); row.style.height = px(H);
    var skip = function (n) {
      return n.name === 'Focus' || n.name === 'NewMark' || (n.name === 'MaxLevelBG' && !o.max) || (n.name === 'MaxStroke' && !o.stroke) ||
        (n.name === 'UpgradeDetailPanel' && o.gun) || (n.name === 'ItemName');
    };
    (L.children || []).forEach(function (c) {
      if (c.off || c.particle || skip(c)) return;
      row.appendChild(mk(c, W, H, { skip: skip }));
    });
    if (o.stroke && o.strokeColor) { var ms = pick(row, 'MaxStroke'); ms.innerHTML = ''; nine(ms, 'iDiver_ListBar_Stroke', o.strokeColor); }
    // hình trong ô: nút Image gốc (128×96, phóng 0,9) giữ khung, ảnh là icon của HX_META
    var im = pick(row, 'Thumbnail/Image');
    im.style.backgroundImage = '';
    im.appendChild(pic(o.icon, 'pr-icon' + (o.gun ? ' gun' : '')));
    var title = pick(row, 'TitleName');
    title.classList.add('pr-title');
    setText(title, N(L, 'TitleName'), o.name);
    // khung chọn: nút Focus gốc (ẩn tới khi được chọn), nút bấm đặt đúng chỗ Focus/Button gốc
    var fN = N(L, 'Focus'), focus = mk(fN, W, H, { skip: function () { return true; } });
    focus.classList.add('pr-focus');
    row.appendChild(focus);
    var fr = rectOf(fN.rt, W, H), br = rectOf(N(fN, 'Button').rt, fr.w, fr.h);
    row._btnRect = { x: fr.x + br.x, y: fr.y + br.y, w: br.w, h: br.h };
    row.addEventListener('pointerenter', function () { select(o.key, row); });
    row.addEventListener('focusin', function () { select(o.key, row); });
    row.addEventListener('pointerdown', function () { select(o.key, row); });
    return row;
  }
  function placeBuy(row, b) {
    var r = row._btnRect, s = b.style;
    s.left = px(r.x); s.top = px(r.y); s.width = px(r.w); s.height = 'max(' + px(r.h + 2) + ', 24px)';
    row.appendChild(b);
  }
  // Ô thumbnail: dòng giá (Cost: xu + số) hoặc chữ ở vị trí MaxLevelText gốc.
  function costRow(row, cost, text, color) {
    var cost0 = pick(row, 'Thumbnail/Cost'), mt = pick(row, 'Thumbnail/MaxLevelText'), L = LAY.cell;
    if (cost != null) {
      cost0.classList.add('pr-cost');
      setText(pick(cost0, 'Text'), N(L, 'Thumbnail/Cost/Text'), cost);
      mt.remove();
    } else {
      cost0.remove();
      mt.classList.add('pr-cost', 'maxt');
      setText(mt, N(L, 'Thumbnail/MaxLevelText'), text);
      if (color) mt.style.color = rgba(color);
    }
  }

  function gearRow(key) {
    var s = HX.save.get(), t = M.GEAR[key], lv = M.level(s, key), cost = M.nextCost(s, key), max = cost === null, L = LAY.cell;
    var row = cellFrame({ key: key, icon: t.icon, name: t.name, max: max, stroke: max });
    row.title = t.desc;
    costRow(row, cost, 'TỐI ĐA');
    var D = 'UpgradeDetailPanel/';
    var cur = pick(row, D + 'CurrentLevel'); cur.classList.add('pr-lv', 'cur'); setText(cur, N(L, D + 'CurrentLevel'), lvText(lv + 1));
    var cp = pick(row, D + 'CurrentStatusPanel'); cp.classList.add('pr-stat', 'cur');
    setText(pick(cp, 'CurrentStatusText'), N(L, D + 'CurrentStatusPanel/CurrentStatusText'), statLabel(t)).classList.add('pr-stl');
    setText(pick(cp, 'CurrentStatusValue'), N(L, D + 'CurrentStatusPanel/CurrentStatusValue'), fmt(M.stat(s, key), t.unit)).classList.add('pr-stv');
    if (!max) {
      pick(row, D + 'Arrow').classList.add('pr-arrow');
      var nx = pick(row, D + 'NextLevel'); nx.classList.add('pr-lv', 'next'); setText(nx, N(L, D + 'NextLevel'), lvText(lv + 2));
      var np = pick(row, D + 'NextStatusPanel'); np.classList.add('pr-stat', 'next');
      setText(pick(np, 'NextStatusText'), N(L, D + 'NextStatusPanel/NextStatusText'), statLabel(t)).classList.add('pr-stl');
      setText(pick(np, 'NextStatusValue'), N(L, D + 'NextStatusPanel/NextStatusValue'), fmt(t.levels[lv + 1].value, t.unit)).classList.add('pr-stv');
    } else {
      ['Arrow', 'NextLevel', 'NextStatusPanel'].forEach(function (n) { pick(row, D + n).remove(); });
      // MaxLevel_Text gốc (tắt sẵn, preset OnlyEnglish: "MAX LEVEL" ở mọi ngôn ngữ) thế chỗ cột cấp kế tiếp
      var mN = N(L, 'MaxLevel_Text'), m = mk(mN, L.rt[6], L.rt[7]);
      m.classList.add('pr-maxlv');
      row.insertBefore(m, pick(row, 'MaxStroke'));
    }
    var b = buyButton(max ? 'Tối đa' : 'Nâng cấp', max ? 'max' : s.gold < cost ? 'poor' : 'ok');
    b.addEventListener('click', function () { unlock(); buyGear(key, row); });
    placeBuy(row, b);
    return row;
  }

  // Khung chỉ số StatusBox của app Duff (CraftPlanInfoPanel): Box_6rad màu gốc, nhãn trái, số phải, cỡ chữ gốc.
  function statusBox(g) {
    var SB = N(LAY.duffApp, 'CraftPlanInfoPanel/InfoPanel/StatusBoxReinforce/StatusBox');
    var lab = N(SB, 'LabelPanel/PowerLabel'), val = N(SB, 'ValuePanel/PowerValue');
    var box = el('div', 'pr-gstats');
    nine(box, SB.img.sprite, SB.img.color);
    gunStats(g).forEach(function (p) {
      var r = el('div', 'pr-gs');
      var l = setText(el('span', 'l'), lab, p[0]), v = setText(el('span', 'v'), val, p[1]);
      delete l.dataset.fit; l.style.fontSize = px(lab.text.size);
      r.appendChild(l); r.appendChild(v);
      box.appendChild(r);
    });
    return box;
  }
  function gunRow(id) {
    var s = HX.save.get(), g = M.GUNS[id], owned = s.guns.owned.indexOf(id) >= 0, on = s.guns.equipped === id;
    var row = cellFrame({ key: id, icon: g.icon, name: g.name, gun: true, stroke: on, strokeColor: C.equip });
    row.title = g.desc;
    if (!owned) costRow(row, g.cost);
    else costRow(row, null, on ? 'ĐANG MANG' : 'ĐÃ CÓ', on ? null : [1, 1, 1, 1]);
    row.insertBefore(statusBox(g), row.querySelector('.pr-focus'));
    if (on) row.classList.add('on');
    var b = !owned ? buyButton('Mua', s.gold < g.cost ? 'poor' : 'ok') : on ? buyButton('Cất súng', 'grey') : buyButton('Mang theo', 'ok');
    b.addEventListener('click', function () { unlock(); gunAction(id, row); });
    placeBuy(row, b);
    return row;
  }

  // Ô nội thất (SushiBarInteriorListBar 110×140) + bong bóng tên khi chọn
  function barIcon(key, t) {
    if (t.icon) return pic(t.icon, 'pr-bicon');
    var n = BAR_ICON[key];
    if (!n) return null;
    try { var s = spr(n); return s ? pic(s.img, 'pr-bicon') : null; } catch (e) { return null; }
  }
  function barRow(key) {
    var s = HX.save.get(), t = M.BAR[key], lv = M.level(s, key), max = M.maxLevel(key), cost = M.nextCost(s, key);
    var wrap = el('div', 'pr-row pr-card');
    wrap.dataset.key = key;
    var card = el('div', 'pr-cardin');
    nine(card, 'UI_SushiBar_Storage_ListBar_Select', null, 'k');
    var top = el('div', 'pr-ctop'), ic = barIcon(key, t);
    if (ic) top.appendChild(ic);
    card.appendChild(top);
    card.appendChild(img('UI_SushiBar_Storage_TagSushiBar', 'pr-place'));
    var badge = el('div', 'pr-clv hx-f-ui', 'Cấp ' + (lv + 1));
    card.appendChild(badge);
    if (cost !== null) {
      var pa = el('div', 'pr-price');
      pa.appendChild(img('Coin24', 'pr-c24'));
      pa.appendChild(numSpan(cost));
      card.appendChild(pa);
    } else {
      var ow = el('div', 'pr-owned hx-f-ui');
      ow.appendChild(el('span', null, 'Tối đa'));
      card.appendChild(ow);
    }
    var foc = el('div', 'pr-cfocus'); nine(foc, 'UI_Sushi_FocusStroke', null, 'k'); card.appendChild(foc);
    wrap.appendChild(card);
    // bong bóng: tên, mô tả, hiệu quả (NameBubble00 + đuôi NameBubble02)
    var bub = el('div', 'pr-bubble'), bin = el('div', 'pr-bubin hx-f-ui');
    nine(bin, 'UI_SushiBar_Storage_ListBar_NameBubble00', null, 'k');
    bin.appendChild(el('b', 'nm', t.name));
    bin.appendChild(el('span', 'ds', t.desc));
    // cấp có tên (Trang trí: Quán cũ → Sửa quán …, HX_META.BAR_TIERS)
    if (t.levels[lv].name) bin.appendChild(el('span', 'ln', t.levels[lv].name + (cost === null ? '' : ' → ' + t.levels[lv + 1].name)));
    bin.appendChild(el('span', 'ef', 'Cấp ' + (lv + 1) + '/' + (max + 1) + ' · ' + fmt(M.stat(s, key), t.unit) + (cost === null ? '' : ' → ' + fmt(t.levels[lv + 1].value, t.unit)) + (t.effect ? ' ' + t.effect : '')));
    bin.appendChild(img('UI_SushiBar_Storage_ListBar_NameBubble02', 'tail'));
    bub.appendChild(bin);
    wrap.appendChild(bub);
    var b = el('button', 'pr-buy hx-f-ui ' + (cost === null ? 'max' : s.gold < cost ? 'poor' : 'ok'));
    b.type = 'button';
    nine(b, cost === null || s.gold < cost ? 'UI_btn_white' : 'UI_btn_pink', cost === null || s.gold < cost ? C.disabled : null);
    b.appendChild(el('span', null, cost === null ? 'Tối đa' : 'Nâng cấp'));
    if (cost === null) b.disabled = true;
    else if (s.gold < cost) b.title = 'Thiếu tiền';
    b.addEventListener('click', function () { unlock(); buyBar(key, wrap); });
    wrap.appendChild(b);
    ['pointerenter', 'focusin', 'pointerdown'].forEach(function (ev) { wrap.addEventListener(ev, function () { select(key, wrap); }); });
    return wrap;
  }

  function select(key, row) {
    if (sel[tab] === key && row.classList.contains('sel')) return;
    sel[tab] = key;
    Array.prototype.forEach.call(body.querySelectorAll('.pr-row.sel'), function (r) { if (r !== row) { r.classList.remove('sel'); var c = r.querySelector('.pr-cardin'); if (c) c.style.transform = ''; } });
    row.classList.add('sel');
    var f = row.querySelector('.pr-focus');
    if (f) focusAnim(f);
    var card = row.querySelector('.pr-cardin');
    // InteriorScrollCellView Root: DOTween LocalMove (0, 5) 0,25 s OutQuad khi ô được chọn [DtD]
    if (card) tween(card, { animationType: 2, duration: 0.25, easeType: 6, endValueV3: [0, 5, 0], loops: 1 });
    var bub = row.querySelector('.pr-bubin');
    if (bub) {
      var sh = barClip('SpeechBubble/UI_SpeechBubbleAnim');
      if (sh) playClip(bub, sh, { slot: 'bubble' });
      clampBubble(row);
    }
  }
  // Bong bóng tên của ô sát mép khung quán thì dời vào trong, đuôi vẫn chỉ đúng ô.
  function clampBubble(row) {
    var b = row.querySelector('.pr-bubble'), panel = row.closest('.pr-barpanel');
    if (!b || !panel) return;
    b.style.marginLeft = '0px';
    var r = b.getBoundingClientRect(), p = panel.getBoundingClientRect(), pad = 6, dx = 0;
    if (r.left < p.left + pad) dx = p.left + pad - r.left;
    else if (r.right > p.right - pad) dx = p.right - pad - r.right;
    b.style.marginLeft = dx + 'px';
    var tail = b.querySelector('.tail');
    if (tail) tail.style.marginLeft = (-dx) + 'px';
  }
  // Focus.controller: vào UI_Idiver_Focus rồi lặp UI_Idiver_Focus_Idle (màu vàng nhấp nháy), clip gốc trong HX_UI_ASSETS.
  var focusTints = {};
  function focusAnim(f) {
    var layer = f.querySelector('.sk'), s = spr('iDiver_ListBar_Focus'), idle = idvClip('Focus/UI_Idiver_Focus_Idle');
    var gk = null, bk = null;
    idle.curves.forEach(function (c) { if (c.attr === 'm_Color.g') gk = c.keys; if (c.attr === 'm_Color.b') bk = c.keys; });
    var g0 = gk ? gk[0][1] : 1, g1 = gk ? gk[1][1] : 1, b1 = bk ? bk[1][1] : 1;
    playClip(f, idvClip('Focus/UI_Idiver_Focus'), {
      then: function () {
        if (!f.isConnected) return;
        playClip(f, idle, { color: function (st) {
          var q = Math.round(((st['m_Color.b'] || 0) / (b1 || 1)) * 6) / 6, key = q.toFixed(2);
          var c = [1, g0 + (g1 - g0) * q, b1 * q, 1];
          var u = focusTints[key] || (focusTints[key] = tinted(s.img, c));
          if (u && layer && layer.dataset.t !== key) { layer.dataset.t = key; layer.style.borderImageSource = 'url("' + u + '")'; }
        } });
      },
    });
  }
  function focusSel() {
    if (!body) return;
    var k = sel[tab], row = k && body.querySelector('.pr-row[data-key="' + k + '"]');
    if (!row) row = body.querySelector('.pr-row');
    if (row) select(row.dataset.key, row);
  }

  function render() {
    if (!root) return;
    if (!LAY) { loadLayouts().then(function () { if (root && LAY) { render(); focusSel(); } }); return; }
    if (!LAY.cell) return;
    var s = HX.save.get(), active = document.activeElement, focusKey = null, focusTab = null;
    lastSave = s;
    if (active && root.contains(active)) {
      var r = active.closest('.pr-row');
      if (r) focusKey = r.dataset.key;
      else if (active.classList.contains('pr-tab')) focusTab = active.dataset.tab;
      else if (active.id === 'prep-go') focusTab = '#go';
    }
    if (!app) {
      app = el('div', 'pr-app hx-f-ui');
      root.appendChild(app);
    }
    app.dataset.tab = tab;
    app.innerHTML = '';
    var bg = el('div', 'pr-bg');
    bg.style.backgroundImage = 'url("' + url(tab === 'guns' && DUF.images ? DUF.images.bg.img : spr(N(LAY.panel, 'CommonBg').img.sprite).img) + '")';
    app.appendChild(bg);
    app.appendChild(header(s));
    body = el('div', 'pr-body');
    if (tab === 'bar') {
      var panel = el('div', 'pr-barpanel');
      nine(panel, 'UI_Sushi_Pop_Panel');
      var tp = tile(el('div', 'pr-bartop'), 'UI_SushiBar_Menu_Pattern02', [0.226, 0.165, 0.138, 0.588]);
      tp.appendChild(el('span', null, 'Quán Bancho · nâng cấp quán'));
      panel.appendChild(tp);
      var cards = el('div', 'pr-cards');
      Object.keys(M.BAR).forEach(function (k) { cards.appendChild(barRow(k)); });
      panel.appendChild(cards);
      body.appendChild(panel);
    } else {
      var list = el('div', 'pr-list');
      // EnhancedScroller gốc: khoảng cách ô 14 px
      var sc = script(N(LAY.panel, 'CommonBg/SubEquipUpgradeScroll/SubEquipScroll'), 'EnhancedScroller');
      if (sc) list.style.gap = px(sc.spacing);
      if (tab === 'gear') Object.keys(M.GEAR).forEach(function (k) { list.appendChild(gearRow(k)); });
      else Object.keys(M.GUNS).forEach(function (id) { list.appendChild(gunRow(id)); });
      body.appendChild(list);
    }
    var m = el('div', 'pr-msg' + (msg ? ' show' : ''), msg);
    m.setAttribute('role', 'status');
    body.appendChild(m);
    app.appendChild(body);
    arrowName = '';
    fitAll(app);
    // giữ chỗ chọn và tiêu điểm bàn phím qua lần dựng lại
    var k = sel[tab], row = k && body.querySelector('.pr-row[data-key="' + k + '"]');
    if (row) { row.classList.add('sel'); var f = row.querySelector('.pr-focus'); if (f) focusAnim(f); clampBubble(row); }
    if (focusKey) { var fr = body.querySelector('.pr-row[data-key="' + focusKey + '"] .pr-buy'); if (fr) fr.focus({ preventScroll: true }); }
    else if (focusTab === '#go') app.querySelector('#prep-go').focus();
    else if (focusTab) { var ft = app.querySelector('.pr-tab[data-tab="' + focusTab + '"]'); if (ft) ft.focus(); }
    if (row) row.scrollIntoView({ block: 'nearest' });
  }

  // ================================================================ mua
  function refuse(r, cost) {
    msg = 'Chưa mua được: ' + r.reason + (cost != null && r.reason === 'thiếu tiền' ? ' (cần ' + cost + ' vàng, đang có ' + HX.save.get().gold + ')' : '');
    sfx('ui_fail', 0.8);
    render();
  }
  function spent(cost) {
    // PaymentRoot/GoldFadeOutAnimation của quán: số tiền nổi lên rồi mờ đi [DtD]
    var g = app && app.querySelector('.pr-goldbox');
    var clip = barClip('UI/GoldFadeOutAnimation');
    if (!g || !clip) return;
    var p = el('div', 'pr-pay hx-f-num', '−' + cost);
    g.appendChild(p);
    playClip(p, { length: clip.length, curves: clip.curves.map(function (c) { return { attr: c.attr, keys: c.keys, path: 'Payment' }; }) },
      { path: 'Payment', x0: 14, then: function () { p.remove(); } });
  }
  function buyGear(key) {
    var cur = HX.save.get(), cost = M.nextCost(cur, key), r = M.buy(cur, key);
    if (!r.ok) return refuse(r, cost);
    HX.save.commit(function () { return r.save; });
    msg = '';
    var t = M.GEAR[key], lv = M.level(HX.save.get(), key);
    render();
    spent(r.cost);
    sfx('ui_levelup');
    levelUpPopup({ name: t.name, icon: t.icon, big: lvText(lv + 1), stat: [statLabel(t), fmt(t.levels[lv].value, t.unit)], desc: t.desc });
  }
  function gunAction(id) {
    var cur = HX.save.get(), g = M.GUNS[id], owned = cur.guns.owned.indexOf(id) >= 0;
    if (!owned) {
      var r = M.buyGun(cur, id);
      if (!r.ok) return refuse(r, g.cost);
      HX.save.commit(function () { return r.save; });
      msg = '';
      render();
      spent(r.cost);
      sfx('ui_buy');
      var on = HX.save.get().guns.equipped === id, st = gunStats(g);
      levelUpPopup({ gun: true, name: g.name, icon: g.icon, big: on ? 'Đã mang theo' : 'Đã cất vào kho',
        stat: [st[0][0], st[0][1] + ' · ' + st[1][0] + ' ' + st[1][1]], desc: g.desc });
      return;
    }
    var eq = M.equipGun(cur, cur.guns.equipped === id ? null : id);
    if (!eq.ok) return refuse(eq);
    HX.save.commit(function () { return eq.save; });
    msg = '';
    sfx('ui_slot');
    render();
    var row = body.querySelector('.pr-row[data-key="' + id + '"]');
    if (row) { var f = row.querySelector('.pr-focus'); if (f) focusAnim(f); }
  }
  function buyBar(key) {
    var cur = HX.save.get(), cost = M.nextCost(cur, key), r = M.buy(cur, key);
    if (!r.ok) return refuse(r, cost);
    HX.save.commit(function () { return r.save; });
    msg = '';
    var t = M.BAR[key], lv = M.level(HX.save.get(), key);
    render();
    spent(r.cost);
    sfx('ui_buy');
    barPopup(key, t, lv);
  }

  // ================================================================ bảng sau khi mua
  function closePop(silent) {
    if (!pop) return;
    var p = pop; pop = null;
    p.fx.forEach(function (s) { if (s) s.stopped = true; });
    if (fx.under && root) root.insertBefore(fx.under.cv, root.firstChild);
    p.el.remove();
    if (app) app.classList.remove('popped');
    if (!silent) sfx('ui_close', 0.7);
    var b = body && body.querySelector('.pr-row.sel .pr-buy');
    if (b && !silent) b.focus({ preventScroll: true });
  }
  function popShell(kind) {
    closePop(true);
    var layer = el('div', 'pr-pop pr-pop-' + kind);
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-modal', 'false');
    root.appendChild(layer);
    root.appendChild(fx.over.cv);   // tấm 'over' luôn trên cùng
    pop = { el: layer, fx: [], kind: kind };
    if (app) app.classList.add('popped');   // bảng lên cấp đè lên danh sách: ẩn danh sách cho khỏi lẫn chữ
    // bấm ra ngoài bảng thì đóng (chỉ bảng chặn chuột; nền để lọt để vẫn bấm được Ra khơi, đổi thẻ)
    return layer;
  }
  // iDiverPanel/SelectedPanel/LevelUpPopup (480×560; Root 100×100 ở giữa), dựng nguyên từ bố cục: nền gradient hoàng hôn,
  // dải tiêu đề gradient tím, viền gradient, quầng sáng, ô hình, hộp cấp vàng, hạt VFX_UI_iDiver_Upgrade_* đúng chỗ gốc.
  // Súng mới: cùng bảng, hạt là ba VFX_UI_WeaponCraft_NewWeapn_* của app Duff (chữ "NEW WEAPON" nằm trong hạt tiêu đề) [ĐỀ XUẤT ghép].
  var LUP_TEXT = { Title: 'pr-lup-title', TitleText: 'pr-lup-name', NextLevel: 'pr-lup-lv', DescriptText: 'pr-lup-desc' };
  function levelUpPopup(o) {
    var layer = popShell('idv');
    var P = N(LAY.panel, 'CommonBg/SelectedPanel/LevelUpPopup'), RootN = N(P, 'Root'), PW = P.rt[6], PH = P.rt[7];
    var rr0 = rectOf(RootN.rt, PW, PH), bgr = rectOf(N(RootN, 'BG').rt, rr0.w, rr0.h);
    var bx = rr0.x + bgr.x, by = rr0.y + bgr.y;   // hộp BG trong khung LevelUpPopup
    layer.appendChild(fx.under.cv);
    // đặt bảng trong vùng thân (dưới thanh đầu) và co cho vừa chiều cao
    var rr = root.getBoundingClientRect(), bb = body.getBoundingClientRect(), u0 = unit();
    layer.style.left = (bb.left - rr.left) + 'px'; layer.style.top = (bb.top - rr.top) + 'px';
    layer.style.width = bb.width + 'px'; layer.style.height = bb.height + 'px'; layer.style.right = layer.style.bottom = 'auto';
    var pu = Math.min(u0, (bb.height - 8) / (bgr.h + 4), (bb.width - 8) / (bgr.w + 4));
    var box = el('div', 'pr-lup');
    box.style.setProperty('--u', pu.toFixed(4));
    box.style.width = px(bgr.w); box.style.height = px(bgr.h);
    var inner = el('div', 'pr-lup-in');
    inner.style.left = px(-bx); inner.style.top = px(-by); inner.style.width = px(PW); inner.style.height = px(PH);
    var skip = function (n) { return n.name === 'NameText' || n.name === 'NewMark' || n.name === 'LockImage'; };
    var rootE = mk(RootN, PW, PH, { skip: skip, tag: function (n) { return n.name === 'Button' ? 'button' : null; } });
    inner.appendChild(rootE);
    box.appendChild(inner);
    layer.appendChild(box);
    var k = pu / u0;
    // chữ
    Object.keys(LUP_TEXT).forEach(function (n) { pick(rootE, n).classList.add(LUP_TEXT[n]); });
    setText(pick(rootE, 'Title'), N(RootN, 'Title'), o.gun ? '' : 'UPGRADE');   // bản gốc ghi "UPGRADE" ở mọi ngôn ngữ
    if (o.gun) pick(rootE, 'Title').setAttribute('aria-label', 'Súng mới');
    setText(pick(rootE, 'TitleText'), N(RootN, 'TitleText'), o.name);
    setText(pick(rootE, 'NextLevel'), N(RootN, 'NextLevel'), o.big);
    var sp = pick(rootE, 'CurrentStatusPanel');
    setText(pick(sp, 'CurrentStatusText'), N(RootN, 'CurrentStatusPanel/CurrentStatusText'), o.stat[0]);
    setText(pick(sp, 'CurrentStatusValue'), N(RootN, 'CurrentStatusPanel/CurrentStatusValue'), o.stat[1]);
    setText(pick(rootE, 'DescriptText'), N(RootN, 'DescriptText'), o.desc || '');
    var th = pick(rootE, 'Thumbnail/Image');
    th.style.backgroundColor = '';   // Image sprite null: script gốc gán hình lúc chạy, không phải ô trắng
    if (o.icon) th.appendChild(pic(o.icon, 'pr-lup-icon' + (o.gun ? ' gun' : '')));
    // nút Xác nhận: nút Footer/Button gốc (Btn_Pink 180×50), nhãn cỡ chữ gốc
    var okN = N(RootN, 'Footer/Button'), ok = pick(rootE, 'Footer/Button');
    Array.prototype.forEach.call(ok.querySelectorAll('.pn'), function (c) { c.remove(); });
    ok.type = 'button'; ok.classList.add('pr-lup-ok');
    var lab = setText(el('span', 'pr-lup-oktxt'), textNodeIn(okN), 'Xác nhận');
    lab.style.position = 'static'; lab.style.width = lab.style.height = 'auto';
    ok.appendChild(lab);
    ok.addEventListener('click', function () { unlock(); closePop(); });
    fitAll(box);
    // hiện: PopupShow/UI_PopShowAnim (co 0,8 → 1,05 → 1) [DtD, clip chung của bảng bật lên]
    var show = barClip('PopupShow/UI_PopShowAnim');
    if (show) playClip(box, show, { slot: 'show' });
    // Mọi nút VFX_* con của các nút đang hiện, đúng vị trí trong prefab. Súng mới: hạt tiêu đề (ảnh chữ "UPGRADE") thay bằng
    // VFX_UI_WeaponCraft_NewWeapn_Title_A_01 của app Duff (ảnh chữ "NEW WEAPON"). Hai VFX Duff còn lại vẽ khung thẻ súng
    // ngang ~600×510 của bảng chế súng gốc, không khớp bảng dọc 460×600 này nên không phát [ĐỀ XUẤT ghép].
    (function walk(n, e) {
      (n.children || []).forEach(function (c) {
        if (c.off) return;
        if (c.particle) {
          if (!/^VFX_/.test(c.name) || !e) return;
          var src = o.gun && /Upgrade_Title/.test(c.name) ? LAY.newWeaponTitle : c;
          if (src) pop.fx.push(layoutFx(src, e, { k: k }));
          return;
        }
        var ce = null;
        if (e) Array.prototype.forEach.call(e.children, function (x) { if (!ce && x.dataset && x.dataset.n === c.name) ce = x; });
        walk(c, ce);
      });
    })(RootN, rootE);
    ok.focus({ preventScroll: true });
  }
  // Management_Recipes/…/CookingStudyResultPanel: bảng gỗ PopUpPanel01 bung từ 0 (DOTween Scale isFrom 0,2 s) + hạt [DtD]
  function findNode(n, name) {
    if (n.name === name) return n;
    for (var i = 0; n.children && i < n.children.length; i++) { var r = findNode(n.children[i], name); if (r) return r; }
    return null;
  }
  function loadRecipes() {
    if (recipes) return recipes;
    var p = BA.ui && BA.ui.panels && BA.ui.panels.recipes && BA.ui.panels.recipes.layout;
    recipes = p ? fetch(url(p)).then(function (r) { if (!r.ok) throw new Error('layout not found: ' + p); return r.json(); })
      .catch(function (e) { report(e); return null; }) : Promise.resolve(null);
    return recipes;
  }
  function barPopup(key, t, lv) {
    var layer = popShell('bar');
    var cur = el('div', 'pr-curtain'); layer.appendChild(cur);
    layer.appendChild(fx.under.cv);
    var box = el('div', 'pr-bpop hx-f-ui'); layer.appendChild(box);
    var bu = Math.min(unit(), (root.clientHeight - 16) / 560, (root.clientWidth - 16) / 640);
    box.style.setProperty('--u', bu.toFixed(4));
    var bk = bu / unit();
    nine(box, 'UI_Sushi_PopUpPanel01');
    var top = el('div', 'pr-bdeco'); nine(top, 'UI_Sushi_PopUpPanelDeco02');
    var dl = el('div', 'pr-bdecoline');
    for (var i = 0; i < 9; i++) dl.appendChild(img('UI_Sushi_PopUpPanelDecoLine'));
    top.appendChild(dl);
    box.appendChild(top);
    var sign = el('div', 'pr-bsign'); nine(sign, 'UI_Sushi_Recipe_Sign_Box');
    var st = el('span', null, 'Nâng cấp quán'); sign.appendChild(st);
    box.appendChild(sign);
    box.appendChild(el('div', 'pr-bexpl', t.levels[lv].name ? t.name + ' · ' + t.levels[lv].name : t.name));
    var ex = el('div', 'pr-bexp');
    var slot = el('div', 'pr-bslot'); nine(slot, 'UI_Sushi_Recipe_Menu_box');
    var ic = barIcon(key, t); if (ic) slot.appendChild(ic);
    ex.appendChild(slot);
    var info = el('div', 'pr-binfo'); nine(info, 'UI_Sushi_Staff_LevelUp_info');
    var lvb = el('div', 'pr-blv'); nine(lvb, 'Roundsquare_10', C.lvBox); lvb.appendChild(el('span', null, 'Cấp ' + (lv + 1)));
    info.appendChild(lvb);
    var val = el('div', 'pr-bval');
    val.appendChild(el('span', /^[\d,.×\s]*$/.test(fmt(t.levels[lv].value, t.unit)) ? 'hx-f-num' : null, fmt(t.levels[lv].value, t.unit)));
    var arw = img('UI_Sushi_Account_Arrow24', 'pr-barrow', C.arrowGreen);
    val.appendChild(arw);
    info.appendChild(val);
    var fb = el('div', 'pr-bfocus'); nine(fb, 'UI_Sushi_RoundBorder', C.cellGreen); info.appendChild(fb);
    ex.appendChild(info);
    box.appendChild(ex);
    box.appendChild(tile(el('div', 'pr-bbot'), 'UI_SushiBar_Menu_Pattern02', [0.263, 0.212, 0.188, 0.392]));
    layer.addEventListener('click', function () { closePop(); });
    layer.tabIndex = -1;
    // mũi tên xanh: DOTween Move (5, 2) 0,3 s OutQuad, lặp Yoyo [DtD]
    tween(arw, { animationType: 1, duration: 0.3, easeType: 6, endValueV3: [5, 2, 0], loops: -1, loopType: 1 });
    tween(box, { animationType: 5, duration: 0.2, easeType: 1, endValueV3: [0, 0, 0], isFrom: 1, loops: 1 });
    sfx('bar_result', 0.8);
    var mine = pop;
    loadRecipes().then(function (lay) {
      if (!lay || pop !== mine) return;
      var a = findNode(lay, 'CookingStudyResultPanel'), boxFx = a && findNode(a, 'VFX_UI_CookingStudy_Box_A_01'), tFx = a && findNode(a, 'VFX_UI_CookingStudy_A_01');
      if (boxFx) mine.fx.push(layoutFx(boxFx, box, { under: true, k: bk }));
      if (tFx) mine.fx.push(layoutFx(tFx, sign, { k: bk }));
    });
    layer.focus({ preventScroll: true });
  }

  function onKey(e) {
    if (HX.game.phase !== 'prep') return;
    if (pop && (e.code === 'Escape' || (pop.kind === 'bar' && (e.code === 'Enter' || e.code === 'Space')))) { e.preventDefault(); closePop(); return; }
    if (pop) return;
    // Q/E đổi thẻ như tay cầm LB/RB [ĐỀ XUẤT]
    if (e.code === 'KeyQ' || e.code === 'KeyE') {
      var i = TABS.map(function (t) { return t.id; }).indexOf(tab);
      i = (i + (e.code === 'KeyE' ? 1 : TABS.length - 1)) % TABS.length;
      tab = TABS[i].id; msg = ''; sfx('ui_click'); render(); focusSel();
    }
  }
  function onDocDown(e) {
    if (!pop || pop.kind !== 'idv') return;
    var box = pop.el.querySelector('.pr-lup');
    if (box && !box.contains(e.target)) closePop(true);
  }

  // UpgradeArrowAnimCtrl/UpgradeArrowIdleAnim: đổi sprite theo khoá của clip gốc
  var arrowT = 0, arrowName = '';
  function tickArrow(dt) {
    var c = IDA.clips && IDA.clips['UpgradeArrowAnimCtrl/UpgradeArrowIdleAnim'];
    if (!c || !root) return;
    arrowT = (arrowT + dt) % c.length;
    var ms = arrowT * 1000, acc = 0, n = c.spriteKeys[0][0];
    for (var i = 0; i < c.spriteKeys.length; i++) { acc += c.spriteKeys[i][1]; n = c.spriteKeys[i][0]; if (ms < acc) break; }
    if (n === arrowName) return;
    arrowName = n;
    var src = 'url("' + url(spr(n).img) + '")';
    Array.prototype.forEach.call(root.querySelectorAll('.pr-arrow'), function (a) { a.style.backgroundImage = src; });
  }

  function onFonts() { if (app && app.isConnected) fitAll(app); }
  HX.phases = HX.phases || {};
  HX.phases.prep = {
    surface: 'dom',
    enter: function () {
      root = HX.game.screen('prep');
      root.classList.add('pr-root');
      if (!fx.over) { fx.over = fxCanvas(); fx.under = fxCanvas(); fx.under.cv.classList.add('under'); }
      msg = ''; pop = null; app = null;
      root.innerHTML = '';
      root.appendChild(fx.under.cv);
      root.appendChild(fx.over.cv);
      layout();
      render();
      focusSel();
      audioLoad();
      loadRecipes();
      // nạp sẵn icon mọi dòng và ảnh app Duff: đổi thẻ khỏi thấy ô trống vài khung đầu
      Object.keys(M.GEAR).forEach(function (k) { if (M.GEAR[k].icon) load(M.GEAR[k].icon); });
      Object.keys(M.GUNS).forEach(function (k) { if (M.GUNS[k].icon) load(M.GUNS[k].icon); });
      if (DUF.images) { load(DUF.images.bg.img); load(DUF.images.logo.img); }
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(onFonts);
      addEventListener('resize', layout);
      addEventListener('keydown', onKey);
      document.addEventListener('pointerdown', onDocDown, true);
    },
    exit: function () {
      closePop(true);
      fxStopAll();
      anims = []; scrollers = [];
      removeEventListener('resize', layout);
      removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDocDown, true);
      [fx.over, fx.under].forEach(function (L) { if (L) L.x.clearRect(0, 0, L.cv.width, L.cv.height); });
    },
    update: function (dt) {
      if (!root) return;
      if (LAY && HX.save.get() !== lastSave) render();   // sổ đổi từ ngoài (HX_DEBUG.grant…) thì dựng lại
      dt = Math.max(0, Math.min(0.1, dt || 0));
      tickAnims(dt);
      tickFx(dt);
      tickScroll(dt);
      tickArrow(dt);
    },
  };

  // móc cho bộ kiểm (test/ho-xanh-prep.js)
  HX.prep = {
    debug: {
      tab: function () { return tab; },
      popup: function () { return pop ? pop.kind : null; },
      particles: function () { var n = 0; fx.systems.forEach(function (s) { s.ems.forEach(function (e) { n += e.parts.length; }); }); return n; },
      systems: function () { return fx.systems.length; },
      fxList: function () {
        return fx.systems.map(function (s) {
          var r = s.host.getBoundingClientRect();
          return { host: s.host.dataset.n || s.host.className, cx: r.left + r.width / 2, cy: r.top + r.height / 2,
            ems: s.ems.map(function (e) { return [e.e.name, e.e.off, e.parts.length]; }) };
        });
      },
      anims: function () { return anims.length; },
      standins: function () { return {}; },   // bốn sprite thay tạm đã có bản gốc (tools/rip_ui.py)
      layouts: function () { return LAY ? Object.keys(LAY) : null; },
      unit: unit,
      sounds: function () { return Object.keys(AU.buf); },
    },
  };
})(window.HX = window.HX || {});
