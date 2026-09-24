// Pha prep: màn chuẩn bị trên bờ. Ba thẻ: Trang bị và Súng dựng theo ứng dụng iDiver trong điện thoại của Dave,
// Quán dựng theo ô nội thất của quán Bancho. Mọi hình, màu, cỡ, clip và tham số hạt lấy từ bản gốc:
//   - iDiver: prefab Phone/Phone_iDiver/Prefabs/iDiverPanel + IDiverScrollCellView (ô 572×148, bảng lên cấp LevelUpPopup).
//     Manifest chưa có bố cục iDiver nên số đo, border 9 mảnh và clip Focus/UpgradeArrow chép ở IDV bên dưới [DtD].
//   - Súng: ô iDiver + khung chỉ số StatusBox của ứng dụng Duff (Phone_WeaponShop/WeaponCraftPanel, CraftPlanInfoPanel) [DtD].
//   - Quán: art/bar/ui/layout/interiorList.json (ô nội thất 110×140, bong bóng tên) và CookingStudyResultPanel trong
//     art/bar/ui/layout/recipes.json (bảng "nâng cấp xong" + hạt VFX_UI_CookingStudy_*), đọc lúc chạy.
// Mọi dòng dựng từ bảng HX_META (GEAR, GUNS, BAR); mua qua HX_META.buy / buyGun / equipGun, ghi qua HX.save.commit.
(function (HX) {
  'use strict';
  var M = window.HX_META, BA = window.HX_BAR_ASSETS || {}, BO = window.HX_BOAT_ASSETS || {};
  var REV = ((document.currentScript && document.currentScript.src || '').split('v=')[1] || '').split('&')[0];
  function url(p) { return p + (REV && !/^data:/.test(p) ? (p.indexOf('?') < 0 ? '?' : '&') + 'v=' + REV : ''); }

  // ================================================================ số gốc của iDiver (không có trong manifest)
  // Chép từ iDiverPanel.prefab / IDiverScrollCellView.prefab / Phone_iDiver/Animations (bóc bằng rip_bar.dump_prefab) [DtD].
  var IDV = {
    // Sprite.m_Border [trái, dưới, phải, trên]
    border: {
      iDiver_ListBar_Stroke: [84, 19, 84, 19], iDiver_ListBar_Focus: [29, 31, 29, 28], Box_8rad: [15, 15, 15, 15],
      Box_8rad_Stroke: [15, 15, 15, 15], UI_WeaponCraft_Cell_Btn_Pink: [19, 18, 19, 20], UI_WeaponCraft_Cell_Btn_Grey: [19, 18, 19, 20],
    },
    // Focus.controller: UI_Idiver_Focus (hiện) rồi UI_Idiver_Focus_Idle (lặp). Khoá Mecanim [t, v, c, b, a].
    focusIn: { length: 0.667, curves: [
      { attr: 'localScale.x', keys: [[0, 0.97, 0, 1.44, -3.84], [0.25, 1, 0, 0, 0], [0.667, 1, 0, 0, 0]] },
      { attr: 'localScale.y', keys: [[0, 0.9, 0, 4.8, -12.8], [0.25, 1, 0, 0, 0], [0.667, 1, 0, 0, 0]] },
      { attr: 'm_Color.a', keys: [[0, 0, 0, 48, -128], [0.25, 1, 0, 0, 0], [0.667, 1, 0, 0, 0]] }] },
    focusIdle: { length: 0.833, loop: true, curves: [
      { attr: 'm_Color.g', keys: [[0, 0.817, 0, 1.916, -3.066], [0.417, 0.928, 0, -1.916, 3.066], [0.833, 0.817, 0, 0, 0]] },
      { attr: 'm_Color.b', keys: [[0, 0, 0, 10.515, -16.824], [0.417, 0.608, 0, -10.515, 16.824], [0.833, 0, 0, 0, 0]] }] },
    // UpgradeArrowAnimCtrl/UpgradeArrowIdleAnim: ba khung mũi tên, mỗi khung 333 ms
    arrow: [['iDiver_Level_Arrow01', 333], ['iDiver_Level_Arrow02', 333], ['iDiver_Level_Arrow03', 333]],
    // Vị trí từng emitter của VFX nâng cấp trong LevelUpPopup, tính từ tâm vật chủ (px UI gốc, y lên).
    // Công thức hạt trong boat_assets.vfx mất vị trí con (mọi pos = 0), nên ghép lại từ RectTransform của prefab.
    fxOff: {
      upgradeSlot: { BoxLine_01A: [0.5, 63.9], BoxLine_01B: [0.5, -64.1], BoxLine_01C: [74, -0.3], BoxLine_01D: [-74, -0.3],
        'BoxLine_01A (1)': [0.5, 63.9], 'BoxLine_01B (1)': [0.5, -64.1], 'BoxLine_01C (1)': [74, -0.3], 'BoxLine_01D (1)': [-74, -0.3],
        BoxLine_01A_Once: [0.5, 63.9], BoxLine_01B_Once: [0.5, -64.1], BoxLine_01C_Once: [74, -0.3], BoxLine_01D_Once: [-74, -0.3],
        LineRay_01: [150.3, 63.5], LineRay_02: [-153.7, -63.6], Box_01A: [2.2, 0], Seq_Smile: [2, -1] },
      upgradeLv: { Light: [-1.3, -0.4], 'Light (1)': [-1.3, -0.4], Ting_01A: [-3, 0.7], Line_par_02A: [68.6, -1.1], Line_par_02B: [-66.2, -1.1],
        Line_par_01B: [-54.2, 0.9], Line_par_01A: [52.3, 0.9] },
      upgradeTitle: { Box_01A: [-2.4, -2.5], Box_Blur: [-0.7, -3.9], ParBokeh01: [-2, 0.8], 'Box_01A (1)': [-2, -2.5], 'Box_Blur (1)': [-4.2, -3.9], 'ParBokeh01 (1)': [-2, 0.8] },
      upgradeSlotB: {}, upgradeBG: { Box_01A: [0, 3] },
    },
  };
  // Sprite gốc chưa bóc vào repo → sprite gốc gần nhất cùng bộ UI (ghi trong báo cáo, thay bằng bản thật khi manifest có).
  var STANDIN = { Box_8rad: 'Box_6rad', Box_8rad_Stroke: 'UI_Sushi_RoundBorder', UI_WeaponCraft_Cell_Btn_Pink: 'UI_btn_pink', UI_WeaponCraft_Cell_Btn_Grey: 'UI_btn_white' };
  // [ĐỀ XUẤT] ảnh cho từng nâng cấp quán khi bảng BAR của meta.js chưa có trường icon (đều là sprite gốc của quán).
  var BAR_ICON = { seats: 'Sushi_FrontChair01', chef: 'UI_Sushi_Icon_Employee', decor: 'UI_Sushi_Icon_Interior', tea: '@tea' };

  // Màu Image gốc (RGBA 0..1) đọc từ bố cục prefab.
  var C = {
    listBar: [1, 1, 1, 0.235], thumb: [0.137, 0.349, 0.51, 0.729], thumbText: [0.086, 0.271, 0.408, 1], titleBg: [0.212, 0.396, 0.522, 0.392],
    maxStroke: [0.945, 0.863, 0.169, 1], focus: [1, 0.817, 0, 1], equip: [1, 0.831, 0.035, 1], statusBox: [0.11, 0.278, 0.322, 1],
    popBg: [0.918, 0.827, 1, 0.235], popThumb: [0.165, 0.137, 0.51, 0.667], popStroke: [1, 0.773, 0, 1], nextBg: [1, 0.773, 0, 1],
    disabled: [0.584, 0.541, 0.525, 1], tab: [0.212, 0.396, 0.522, 0.392],
    cellGreen: [0.482, 1, 0.043, 1], arrowGreen: [0.482, 0.992, 0.051, 1], lvBox: [0, 0, 0, 0.4],
  };

  // ================================================================ sprite, nhuộm màu, 9 mảnh
  var BARS = (BA.ui && BA.ui.sprites) || {}, IDVS = (BO.gearIcons && BO.gearIcons.idiverUI) || {};
  var standinUsed = {};
  function spr(name) {
    if (name === '@tea') return BA.tea ? { name: 'Drink_Tea', img: BA.tea.img, border: null } : null;
    if (IDVS[name]) return { name: name, img: IDVS[name], border: IDV.border[name] || null };
    if (BARS[name]) return { name: name, img: BARS[name].img, border: BARS[name].border, w: BARS[name].w, h: BARS[name].h };
    if (STANDIN[name]) { standinUsed[name] = STANDIN[name]; return spr(STANDIN[name]); }
    throw new Error('sprite not found in manifests: ' + name);
  }
  var imgs = {}, tints = {}, waiting = {};
  function load(src) {
    if (imgs[src]) return imgs[src].p;
    var im = new Image(), rec = { im: im, ok: false };
    rec.p = new Promise(function (res) {
      im.onload = function () { rec.ok = true; res(im); (waiting[src] || []).forEach(function (f) { f(); }); delete waiting[src]; };
      im.onerror = function () { if (HX.game && HX.game.errors) HX.game.errors.push('image not found: ' + src); res(null); };
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
  function rgba(c) { return 'rgba(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ',' + c[3] + ')'; }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  // Lớp nền 9 mảnh (Image kiểu Sliced): div phủ kín cha, viền = border gốc × --u (hoặc --k trong ô quán).
  function nine(parent, name, color, unit) {
    var s = spr(name), b = (s.border || [0, 0, 0, 0]).slice(), v = unit || 'u', layer = el('i', 'sk');
    // Unity kéo giãn cả phần giữa rộng 0 px (lấy mẫu một cột điểm ảnh); border-image bỏ trống phần giữa rỗng: chừa 1 px.
    if (s.w && b[0] + b[2] >= s.w) b[2] = Math.max(0, s.w - b[0] - 1);
    if (s.h && b[1] + b[3] >= s.h) b[3] = Math.max(0, s.h - b[1] - 1);
    layer.style.borderWidth = [b[3], b[2], b[1], b[0]].map(function (n) { return 'calc(' + n + 'px * var(--' + v + '))'; }).join(' ');
    function set(u) { if (u) layer.style.borderImage = 'url("' + u + '") ' + b[3] + ' ' + b[2] + ' ' + b[1] + ' ' + b[0] + ' fill stretch'; }
    set(tinted(s.img, color, set));
    parent.insertBefore(layer, parent.firstChild);
    parent.classList.add('has9');
    return layer;
  }
  function img(name, cls, color) {
    var s = spr(name), i = el('img', cls);
    i.alt = ''; i.draggable = false;
    if (s) { var u = tinted(s.img, color, function (u2) { i.src = u2; }); if (u) i.src = u; }
    return i;
  }
  function pic(src, cls) { var i = el('img', cls); i.alt = ''; i.draggable = false; if (src) i.src = url(src); return i; }
  function coin(cls) { return img('Coin20', cls); }
  // Image kiểu Tiled (lát gạch) có màu: ảnh nền lặp.
  function tile(elm, name, color) {
    var s = spr(name);
    function set(u) { if (u) elm.style.backgroundImage = 'url("' + u + '")'; }
    set(tinted(s.img, color, set));
    return elm;
  }

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
    var px = st['m_AnchoredPosition.x'], py = st['m_AnchoredPosition.y'];
    if (px != null || py != null) tr += 'translate(calc(' + ((px || 0) - (a.o.x0 || 0)) + 'px * var(--u)), calc(' + (-(py || 0)) + 'px * var(--u))) ';
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
      var s = tw.isFrom ? 1 + (v3[0] - 1) * e : 1 + (v3[0] - 1) * e;
      a.el.style.transform = 'scale(' + s + ')';
    } else if (tw.animationType === 7) {
      a.el.style.opacity = tw.isFrom ? 1 + ((tw.endValueFloat || 0) - 1) * e : 1 + ((tw.endValueFloat || 0) - 1) * e;
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

  // ================================================================ hạt UI (công thức ParticleSystem gốc)
  // Nhận cả hai dạng manifest: boat_assets.vfx (rip_boat) và nút `particle` trong bố cục art/bar/ui/layout (rip_bar).
  function R(v) { return Array.isArray(v) ? v[0] + Math.random() * (v[1] - v[0]) : (+v || 0); }
  function normBoat(e, off) {
    return {
      name: e.name, on: e.active !== false && e.render && e.render.enabled, delay: e.delay || 0, duration: e.duration || 1, loop: !!e.loop,
      prewarm: !!e.prewarm, rate: e.rate || 0, bursts: (e.bursts || []).map(function (b) { return { t: b.time || 0, n: b.count || 0 }; }),
      life: e.lifetime, speed: e.speed, size: e.size, sizeY: e.sizeY, rot: e.rotation || 0, color: e.color, max: e.maxParticles || 1000,
      shape: e.shape || null, sol: e.sizeOverLife || null, col: e.colorOverLife || null, rotLife: e.rotOverLife || null,
      vel: e.velocity ? { x: e.velocity.x, y: e.velocity.y } : null, sheet: e.sheet || null,
      mode: e.render.mode, lenScale: e.render.lengthScale, velScale: e.render.velocityScale, order: e.render.order || 0,
      add: /Add/i.test(e.shader || '') || e.blend === 'add', tint: e.tint || [1, 1, 1, 1], img: e.img, scale: e.scale || 1, off: off || [0, 0],
    };
  }
  function normBar(p, name, off) {
    var r = p.render || {}, tint = r.tint && (r.tint._Color || r.tint._TintColor || r.tint._BaseColor) || [1, 1, 1, 1];
    var tex = r.texture && BA.vfx && BA.vfx.textures && BA.vfx.textures[r.texture];
    return {
      name: name, on: !!r.enabled && !!tex, delay: p.startDelay || 0, duration: p.duration || 1, loop: !!p.loop, prewarm: !!p.prewarm,
      rate: p.rate || 0, bursts: (p.bursts || []).map(function (b) { return { t: b.t || 0, n: b.count || 0 }; }),
      life: p.lifetime, speed: p.speed, size: p.size, sizeY: p.sizeY, rot: p.rotation || 0, color: p.color, max: p.maxParticles || 1000,
      shape: p.shape ? { type: p.shape.type, radius: p.shape.radius, scale: p.shape.scale, arc: p.shape.arc } : null,
      sol: p.sizeOverLife && p.sizeOverLife.curve ? p.sizeOverLife.curve : null,
      col: p.colorOverLife || null, rotLife: p.rotationOverLife ? p.rotationOverLife.curve : null,
      vel: p.velocityOverLife ? { x: p.velocityOverLife.x, y: p.velocityOverLife.y } : null, sheet: p.sheet || null,
      mode: r.mode, lenScale: r.lengthScale == null ? 2 : r.lengthScale, velScale: r.velocityScale || 0, order: r.order || 0,
      add: /One$/.test(r.blend || '') || /Add/i.test(r.shader || ''), tint: tint, img: tex ? tex.img : null, scale: 1, off: off || [0, 0],
    };
  }
  function colorAt(spec, rnd) {
    if (Array.isArray(spec)) return spec;
    var pair = spec && (spec.random || spec.randomColor);
    if (pair) return pair[0].map(function (v, i) { return v + (pair[1][i] - v) * rnd; });
    return [1, 1, 1, 1];
  }
  function gradAt(g, f) {
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
    if (col.gradient) return gradAt(col.gradient, f);
    var two = col.randomGradient || col.between;
    if (two) { var a = gradAt(two[0], f), b = gradAt(two[1], f); return a.map(function (v, i) { return v + (b[i] - v) * rnd; }); }
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
    var px = 0, py = 0, dx = 0, dy = 0, sh = e.shape, sc = sh && sh.scale || [1, 1];
    if (sh) {
      var ang = Math.random() * Math.PI * 2 * ((sh.arc || 360) / 360);
      if (sh.type === 'box') { px = (Math.random() - 0.5) * sc[0]; py = (Math.random() - 0.5) * sc[1]; }
      else if (sh.type === 'edge') { px = (Math.random() * 2 - 1) * (sh.radius || 0) * sc[0]; dy = 1; }
      else if (sh.type === 'donut') { var rr = (sh.radius || 0); px = Math.cos(ang) * rr * sc[0]; py = Math.sin(ang) * rr * sc[1]; dx = Math.cos(ang); dy = Math.sin(ang); }
      else { var r0 = (sh.radius || 0) * Math.sqrt(Math.random()); px = Math.cos(ang) * r0 * sc[0]; py = Math.sin(ang) * r0 * sc[1]; dx = Math.cos(ang); dy = Math.sin(ang); }
    } else { var a0 = Math.random() * Math.PI * 2; dx = Math.cos(a0); dy = Math.sin(a0); }
    var sp = R(e.speed), size = R(e.size);
    s.parts.push({
      x: px, y: py, vx: dx * sp, vy: dy * sp, age: 0, life: Math.max(0.01, R(e.life)),
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
        var f = p.age / p.life, lc = lifeColor(e.col, f, p.rc), k = curveAt(e.sol, f) * e.scale;
        var a = p.c0[3] * lc[3] * e.tint[3] * (e.add && e.tint[3] < 0.6 ? 2 : 1);
        if (a <= 0.003) return;
        var cc = [p.c0[0] * lc[0] * e.tint[0], p.c0[1] * lc[1] * e.tint[1], p.c0[2] * lc[2] * e.tint[2]];
        var w = p.w * k * u, h = p.h * k * u;
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
  function boatFx(key, host, o) {
    var V = BO.vfx && BO.vfx[key];
    if (!V) return null;
    var off = IDV.fxOff[key] || {};
    return fxPlay(V.emitters.map(function (e) { return normBoat(e, off[e.name]); }), host, o);
  }
  // Bố cục quán: gom mọi nút có `particle` dưới một nút VFX, cộng dồn vị trí RectTransform (px UI gốc, y lên).
  function barFx(node, host, o) {
    var out = [];
    // (cx, cy) = tâm khung cha. Hệ hạt phát ở điểm pivot của nút; con của nó neo theo khung của nút.
    (function walk(n, cx, cy, pw, ph) {
      var rt = n.rt, x = cx, y = cy, w = pw, h = ph, mx = cx, my = cy;
      if (rt) {
        w = pw * (rt[2] - rt[0]) + rt[6]; h = ph * (rt[3] - rt[1]) + rt[7];
        x = cx + (rt[0] + (rt[2] - rt[0]) * rt[8] - 0.5) * pw + rt[4];
        y = cy + (rt[1] + (rt[3] - rt[1]) * rt[9] - 0.5) * ph + rt[5];
        mx = x + (0.5 - rt[8]) * w; my = y + (0.5 - rt[9]) * h;
      }
      if (n.particle && !n.off) out.push(normBar(n.particle, n.name, [x, y]));
      (n.children || []).forEach(function (c) { if (!c.off) walk(c, mx, my, w, h); });
    })(node, 0, 0, 100, 100);
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
    })).catch(function (e) { if (HX.game && HX.game.errors) HX.game.errors.push(String(e)); });
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
    root.style.setProperty('--u', u.toFixed(4));
    root.style.setProperty('--k', (u * 1.3).toFixed(4));   // ô nội thất gốc 110×140 phóng ×1,3 cho đọc được [ĐỀ XUẤT]
    fxResize();
  }

  function goldText(s) { return s.gold + ' vàng'; }
  function header(s) {
    var head = el('div', 'pr-head');
    head.appendChild(img('iDiver_Top_BG', 'pr-topbg'));
    head.appendChild(img('iDiver_Logo', 'pr-logo'));
    head.appendChild(el('h2', null, 'Ngày ' + s.day));
    var tabs = el('div', 'pr-tabs');
    tabs.setAttribute('role', 'tablist');
    TABS.forEach(function (t) {
      var on = t.id === tab, b = el('button', 'pr-tab' + (on ? ' on' : ''));
      b.dataset.tab = t.id; b.type = 'button';
      b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', on ? 'true' : 'false');
      nine(b, 'Box_8rad', on ? C.nextBg : C.tab);
      b.appendChild(el('span', null, t.name));
      b.addEventListener('click', function () { unlock(); if (tab !== t.id) { tab = t.id; msg = ''; sfx('ui_click'); render(); focusSel(); } });
      tabs.appendChild(b);
    });
    head.appendChild(tabs);
    var gbox = el('div', 'pr-goldbox'), gold = el('div', 'pr-gold');
    gold.appendChild(img('Coin24', 'pr-coin'));
    gold.appendChild(el('span', 'pr-goldn', goldText(s)));
    gbox.appendChild(gold);
    head.appendChild(gbox);
    var go = el('button', 'pr-go');
    go.id = 'prep-go'; go.type = 'button';
    nine(go, 'UI_WeaponCraft_Cell_Btn_Pink');
    go.appendChild(el('span', null, 'Ra khơi'));
    go.addEventListener('click', function () { unlock(); sfx('ui_click'); closePop(true); HX.game.go('boat', { dir: 'out' }); });
    head.appendChild(go);
    return head;
  }

  function buyButton(label, state) {
    // state: 'ok' (hồng), 'poor' (thiếu tiền: xám nhưng vẫn bấm được để báo), 'max' (tắt), 'grey' (nút xám của iDiver)
    var b = el('button', 'pr-buy ' + state);
    b.type = 'button';
    if (state === 'max') b.disabled = true;
    if (state === 'poor') b.title = 'Thiếu tiền';
    nine(b, state === 'ok' ? 'UI_WeaponCraft_Cell_Btn_Pink' : 'UI_WeaponCraft_Cell_Btn_Grey', state === 'ok' ? null : state === 'grey' ? [0.27, 0.27, 0.27, 1] : C.disabled);
    b.appendChild(el('span', null, label));
    return b;
  }

  // Ô iDiver (IDiverScrollCellView 572×148)
  function cellFrame(key, icon, name) {
    var row = el('div', 'pr-row pr-cell');
    row.dataset.key = key;
    nine(row, 'Box_8rad', C.listBar);
    var th = el('div', 'pr-thumb');
    nine(th, 'Box_6rad', C.thumb);
    if (icon) th.appendChild(pic(icon, 'pr-icon'));
    var tb = el('div', 'pr-thumbtxt'); nine(tb, 'Box_6rad', C.thumbText); th.appendChild(tb);
    row.appendChild(th);
    var tn = el('div', 'pr-titlebg'); nine(tn, 'Box_6rad', C.titleBg); row.appendChild(tn);
    row.appendChild(el('div', 'pr-title', name));
    var focus = el('div', 'pr-focus'); nine(focus, 'iDiver_ListBar_Focus', C.focus); row.appendChild(focus);
    row.addEventListener('pointerenter', function () { select(key, row); });
    row.addEventListener('focusin', function () { select(key, row); });
    row.addEventListener('pointerdown', function () { select(key, row); });
    return { row: row, thumb: th, tb: tb };
  }
  function costRow(tb, cost, text, cls) {
    var c = el('div', 'pr-cost' + (cls ? ' ' + cls : ''));
    if (cost != null) { c.appendChild(coin('pr-c20')); c.appendChild(el('span', null, String(cost))); }
    else c.appendChild(el('span', null, text));
    tb.parentNode.appendChild(c);
  }

  function gearRow(key) {
    var s = HX.save.get(), t = M.GEAR[key], lv = M.level(s, key), max = M.maxLevel(key), cost = M.nextCost(s, key);
    var f = cellFrame(key, t.icon, t.name), row = f.row;
    row.title = t.desc;
    if (cost === null) { row.classList.add('max'); costRow(f.tb, null, 'TỐI ĐA', 'maxt'); }
    else costRow(f.tb, cost);
    var d = el('div', 'pr-detail');
    var cur = el('div', 'pr-lv cur', 'Cấp ' + (lv + 1));
    d.appendChild(cur);
    d.appendChild(el('div', 'pr-stl', statLabel(t)));
    var cs = el('div', 'pr-stat cur');
    cs.appendChild(el('span', 'pr-stv', fmt(M.stat(s, key), t.unit)));
    d.appendChild(cs);
    if (cost !== null) {
      d.appendChild(img(IDV.arrow[0][0], 'pr-arrow'));
      d.appendChild(el('div', 'pr-lv next', 'Cấp ' + (lv + 2)));
      var ns = el('div', 'pr-stat next');
      ns.appendChild(el('span', 'pr-stv', fmt(t.levels[lv + 1].value, t.unit)));
      d.appendChild(ns);
    } else d.appendChild(el('div', 'pr-maxlv', 'Cấp tối đa · ' + (max + 1) + '/' + (max + 1)));
    row.appendChild(d);
    if (cost === null) { var ms = el('div', 'pr-maxstroke'); nine(ms, 'iDiver_ListBar_Stroke', C.maxStroke); row.appendChild(ms); }
    var b = buyButton(cost === null ? 'Tối đa' : 'Nâng cấp', cost === null ? 'max' : s.gold < cost ? 'poor' : 'ok');
    b.addEventListener('click', function () { unlock(); buyGear(key, row); });
    row.appendChild(b);
    return row;
  }

  function gunRow(id) {
    var s = HX.save.get(), g = M.GUNS[id], owned = s.guns.owned.indexOf(id) >= 0, on = s.guns.equipped === id;
    var f = cellFrame(id, g.icon, g.name), row = f.row;
    row.title = g.desc;
    f.thumb.querySelector('.pr-icon').classList.add('gun');
    if (!owned) costRow(f.tb, g.cost);
    else costRow(f.tb, null, on ? 'ĐANG MANG' : 'ĐÃ CÓ', on ? 'maxt' : 'own');
    var box = el('div', 'pr-gstats');
    nine(box, 'Box_6rad', C.statusBox);
    gunStats(g).forEach(function (p) {
      var r = el('div', 'pr-gs');
      r.appendChild(el('span', 'l', p[0])); r.appendChild(el('span', 'v', p[1]));
      box.appendChild(r);
    });
    row.appendChild(box);
    if (on) { row.classList.add('on'); var st = el('div', 'pr-maxstroke'); nine(st, 'iDiver_ListBar_Stroke', C.equip); row.appendChild(st); }
    var b = !owned ? buyButton('Mua', s.gold < g.cost ? 'poor' : 'ok') : on ? buyButton('Cất súng', 'grey') : buyButton('Mang theo', 'ok');
    b.addEventListener('click', function () { unlock(); gunAction(id, row); });
    row.appendChild(b);
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
    var badge = el('div', 'pr-clv', 'Cấp ' + (lv + 1));
    card.appendChild(badge);
    if (cost !== null) {
      var pa = el('div', 'pr-price');
      pa.appendChild(img('Coin24', 'pr-c24'));
      pa.appendChild(el('span', null, String(cost)));
      card.appendChild(pa);
    } else {
      var ow = el('div', 'pr-owned');
      ow.appendChild(el('span', null, 'Tối đa'));
      card.appendChild(ow);
    }
    var foc = el('div', 'pr-cfocus'); nine(foc, 'UI_Sushi_FocusStroke', null, 'k'); card.appendChild(foc);
    wrap.appendChild(card);
    // bong bóng: tên, mô tả, hiệu quả (NameBubble00 + đuôi NameBubble02)
    var bub = el('div', 'pr-bubble'), bin = el('div', 'pr-bubin');
    nine(bin, 'UI_SushiBar_Storage_ListBar_NameBubble00', null, 'k');
    bin.appendChild(el('b', 'nm', t.name));
    bin.appendChild(el('span', 'ds', t.desc));
    bin.appendChild(el('span', 'ef', 'Cấp ' + (lv + 1) + '/' + (max + 1) + ' · ' + fmt(M.stat(s, key), t.unit) + (cost === null ? '' : ' → ' + fmt(t.levels[lv + 1].value, t.unit))));
    bin.appendChild(img('UI_SushiBar_Storage_ListBar_NameBubble02', 'tail'));
    bub.appendChild(bin);
    wrap.appendChild(bub);
    var b = el('button', 'pr-buy ' + (cost === null ? 'max' : s.gold < cost ? 'poor' : 'ok'));
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
  // Focus.controller: vào UI_Idiver_Focus rồi lặp UI_Idiver_Focus_Idle (màu vàng nhấp nháy).
  var focusTints = {};
  function focusAnim(f) {
    var layer = f.querySelector('.sk'), s = spr('iDiver_ListBar_Focus');
    playClip(f, IDV.focusIn, {
      then: function () {
        if (!f.isConnected) return;
        playClip(f, IDV.focusIdle, { color: function (st) {
          var q = Math.round(((st['m_Color.b'] || 0) / 0.608) * 6) / 6, key = q.toFixed(2);
          var c = [1, 0.817 + (0.928 - 0.817) * q, 0.608 * q, 1];
          var u = focusTints[key] || (focusTints[key] = tinted(s.img, c));
          if (u && layer.dataset.t !== key) { layer.dataset.t = key; layer.style.borderImageSource = 'url("' + u + '")'; }
        } });
      },
    });
  }
  function focusSel() {
    var k = sel[tab], row = k && body.querySelector('.pr-row[data-key="' + k + '"]');
    if (!row) row = body.querySelector('.pr-row');
    if (row) select(row.dataset.key, row);
  }

  function render() {
    if (!root) return;
    var s = HX.save.get(), active = document.activeElement, focusKey = null, focusTab = null;
    lastSave = s;
    if (active && root.contains(active)) {
      var r = active.closest('.pr-row');
      if (r) focusKey = r.dataset.key;
      else if (active.classList.contains('pr-tab')) focusTab = active.dataset.tab;
      else if (active.id === 'prep-go') focusTab = '#go';
    }
    if (!app) {
      app = el('div', 'pr-app');
      root.appendChild(app);
    }
    app.dataset.tab = tab;
    app.innerHTML = '';
    var bg = el('div', 'pr-bg'); bg.style.backgroundImage = 'url("' + url(IDVS.iDiver_BG) + '")'; app.appendChild(bg);
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
      if (tab === 'gear') Object.keys(M.GEAR).forEach(function (k) { list.appendChild(gearRow(k)); });
      else Object.keys(M.GUNS).forEach(function (id) { list.appendChild(gunRow(id)); });
      body.appendChild(list);
    }
    var m = el('div', 'pr-msg' + (msg ? ' show' : ''), msg);
    m.setAttribute('role', 'status');
    body.appendChild(m);
    app.appendChild(body);
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
    var p = el('div', 'pr-pay', '−' + cost);
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
    levelUpPopup({ title: 'NÂNG CẤP', name: t.name, icon: t.icon, big: 'Cấp ' + (lv + 1), line: fmt(t.levels[lv].value, t.unit), desc: t.desc });
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
      levelUpPopup({ title: 'SÚNG MỚI', name: g.name, icon: g.icon, gun: true, big: on ? 'Đã mang theo' : 'Đã cất vào kho',
        line: st[0][0] + ' ' + st[0][1] + ' · ' + st[1][0] + ' ' + st[1][1], desc: g.desc });
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
  // iDiverPanel/SelectedPanel/LevelUpPopup (480×560; Root 100×100 ở giữa, toạ độ con tính từ tâm Root)
  function levelUpPopup(o) {
    var layer = popShell('idv');
    var box = el('div', 'pr-lup');
    layer.appendChild(fx.under.cv);
    layer.appendChild(box);
    // đặt bảng trong vùng thân (dưới thanh đầu) và co cho vừa chiều cao
    var rr = root.getBoundingClientRect(), bb = body.getBoundingClientRect(), u0 = unit();
    layer.style.left = (bb.left - rr.left) + 'px'; layer.style.top = (bb.top - rr.top) + 'px';
    layer.style.width = bb.width + 'px'; layer.style.height = bb.height + 'px'; layer.style.right = layer.style.bottom = 'auto';
    var pu = Math.min(u0, (bb.height - 8) / 604);
    box.style.setProperty('--u', pu.toFixed(4));
    var k = pu / u0;
    var bg = el('div', 'pr-lup-bg'); nine(bg, 'Box_8rad', C.popBg);
    var bs = el('div', 'pr-lup-stroke'); nine(bs, 'Box_8rad_Stroke'); bg.appendChild(bs);
    box.appendChild(bg);
    box.appendChild(pic(BA.vfx && BA.vfx.textures && BA.vfx.textures.E_Glow_01J ? BA.vfx.textures.E_Glow_01J.img : null, 'pr-lup-glow'));
    var title = el('div', 'pr-lup-title', o.title); box.appendChild(title);
    var th = el('div', 'pr-lup-thumb'); nine(th, 'Box_8rad', C.popThumb);
    var ts = el('div', 'pr-lup-tstroke'); nine(ts, 'Box_8rad_Stroke', C.popStroke); th.appendChild(ts);
    if (o.icon) th.appendChild(pic(o.icon, 'pr-lup-icon' + (o.gun ? ' gun' : '')));
    box.appendChild(th);
    box.appendChild(el('div', 'pr-lup-name', o.name));
    var nb = el('div', 'pr-lup-next'); nine(nb, 'Box_6rad', C.nextBg);
    nb.appendChild(el('i', 'pr-lup-line'));
    box.appendChild(nb);
    var big = el('div', 'pr-lup-lv', o.big); box.appendChild(big);
    box.appendChild(el('div', 'pr-lup-stat', o.line));
    box.appendChild(el('div', 'pr-lup-desc', o.desc || ''));
    var ok = el('button', 'pr-lup-ok'); ok.type = 'button';
    nine(ok, 'UI_WeaponCraft_Cell_Btn_Pink');
    ok.appendChild(el('span', null, 'Xác nhận'));
    ok.addEventListener('click', function () { unlock(); closePop(); });
    box.appendChild(ok);
    // hiện: PopupShow/UI_PopShowAnim (co 0,8 → 1,05 → 1) [DtD, clip chung của bảng bật lên]
    var show = barClip('PopupShow/UI_PopShowAnim');
    if (show) playClip(box, show, { slot: 'show' });
    pop.fx.push(boatFx('upgradeBG', bg, { under: true, k: k }), boatFx('upgradeTitle', title, { k: k }), boatFx('upgradeSlot', th, { k: k }),
      boatFx('upgradeSlotB', th, { k: k }), boatFx('upgradeLv', big, { k: k }));
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
      .catch(function (e) { if (HX.game && HX.game.errors) HX.game.errors.push(String(e)); return null; }) : Promise.resolve(null);
    return recipes;
  }
  function barPopup(key, t, lv) {
    var layer = popShell('bar');
    var cur = el('div', 'pr-curtain'); layer.appendChild(cur);
    layer.appendChild(fx.under.cv);
    var box = el('div', 'pr-bpop'); layer.appendChild(box);
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
    box.appendChild(el('div', 'pr-bexpl', t.name));
    var ex = el('div', 'pr-bexp');
    var slot = el('div', 'pr-bslot'); nine(slot, 'UI_Sushi_Recipe_Menu_box');
    var ic = barIcon(key, t); if (ic) slot.appendChild(ic);
    ex.appendChild(slot);
    var info = el('div', 'pr-binfo'); nine(info, 'UI_Sushi_Staff_LevelUp_info');
    var lvb = el('div', 'pr-blv'); nine(lvb, 'Roundsquare_10', C.lvBox); lvb.appendChild(el('span', null, 'Cấp ' + (lv + 1)));
    info.appendChild(lvb);
    var val = el('div', 'pr-bval');
    val.appendChild(el('span', null, fmt(t.levels[lv].value, t.unit)));
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
      if (boxFx) mine.fx.push(barFx(boxFx, box, { under: true, k: bk }));
      if (tFx) mine.fx.push(barFx(tFx, sign, { k: bk }));
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

  var arrowT = 0, arrowName = '';
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
      addEventListener('resize', layout);
      addEventListener('keydown', onKey);
      document.addEventListener('pointerdown', onDocDown, true);
    },
    exit: function () {
      closePop(true);
      fxStopAll();
      anims = [];
      removeEventListener('resize', layout);
      removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDocDown, true);
      [fx.over, fx.under].forEach(function (L) { if (L) L.x.clearRect(0, 0, L.cv.width, L.cv.height); });
    },
    update: function (dt) {
      if (!root) return;
      if (HX.save.get() !== lastSave) render();   // sổ đổi từ ngoài (HX_DEBUG.grant…) thì dựng lại
      dt = Math.max(0, Math.min(0.1, dt || 0));
      tickAnims(dt);
      tickFx(dt);
      // UpgradeArrowIdleAnim: 3 khung × 333 ms
      arrowT = (arrowT + dt * 1000) % 999;
      var n = IDV.arrow[Math.min(2, Math.floor(arrowT / 333))][0];
      if (n !== arrowName) {
        arrowName = n;
        var src = url(spr(n).img);
        Array.prototype.forEach.call(root.querySelectorAll('.pr-arrow'), function (i) { i.src = src; });
      }
    },
  };

  // móc cho bộ kiểm (test/ho-xanh-prep.js)
  HX.prep = {
    debug: {
      tab: function () { return tab; },
      popup: function () { return pop ? pop.kind : null; },
      particles: function () { var n = 0; fx.systems.forEach(function (s) { s.ems.forEach(function (e) { n += e.parts.length; }); }); return n; },
      systems: function () { return fx.systems.length; },
      anims: function () { return anims.length; },
      standins: function () { return Object.assign({}, standinUsed); },
      unit: unit,
      sounds: function () { return Object.keys(AU.buf); },
    },
  };
})(window.HX = window.HX || {});
