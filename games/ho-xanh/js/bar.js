// Quán sushi của Bancho: ba pha kitchen → bar → ledger trong vòng một ngày của Hố Xanh.
// Hình, khung hoạt ảnh, bố cục UI, đường cong clip, tham số tween và tham số hạt đều đọc từ data/bar_assets.js
// và art/bar/** (bóc từ bản gốc Dave the Diver, xem tools/README-bar.md). Tệp này không tự vẽ hình nào.
// Số [DtD] lấy từ bản gốc; [ĐỀ XUẤT] là tự chọn. Sổ lưu chỉ ghi một lần ở ledger: tải lại giữa đêm thì cá còn nguyên.
(function (HX) {
  'use strict';
  var BA = window.HX_BAR_ASSETS, M = window.HX_META;
  if (!BA || !BA.room) throw new Error('HX_BAR_ASSETS not loaded: data/bar_assets.js must come before js/bar.js');
  var REV = ((document.currentScript && document.currentScript.src || '').split('v=')[1] || '').split('&')[0];
  HX.phases = HX.phases || {};

  // ---------- số ----------
  var R = BA.room, RW = R.size[0], RH = R.size[1], U = R.pxPerUnit;   // 1 đơn vị Unity = 50 px phòng [DtD: scale 2, 100 px/đv]
  var UIK = 0.5;   // [ĐỀ XUẤT] 1 px UI gốc (canvas 1920×1080) = 0,5 px phòng: bản gốc vẽ quán ×2 ở 1080p
  var T = {
    night: 180,                  // [ĐỀ XUẤT] giây mở quán mỗi tối
    menuSlots: 5,                // [ĐỀ XUẤT] số ô thực đơn; bố cục gốc không ghi số ô
    cook: 4,                     // [ĐỀ XUẤT] giây Bancho làm một suất ở đầu bếp cấp 0, chia cho HX_META.stat('chef')
    firstGuest: 2,               // [ĐỀ XUẤT] giây tới vị khách đầu
    guestEvery: 5,               // [ĐỀ XUẤT] giây giữa hai khách, chia cho HX_META.stat('decor')
    guestJitter: 0.4,            // [ĐỀ XUẤT] ±40 %
    daveSpeed: 180,              // [ĐỀ XUẤT] px phòng / giây
    carry: 3,                    // [ĐỀ XUẤT] số đĩa Dave bưng cùng lúc
    passX: 792,                  // [ĐỀ XUẤT] chỗ Dave nhận món, sát bên trái Bancho
    daveMin: 150, daveMax: 905,  // [ĐỀ XUẤT] lối đi sau quầy, từ ghế VIP tới ghế đẩu số 7
    reach: 30,                   // [ĐỀ XUẤT] px phòng: đứng trong khoảng này là với tới khách / quầy
    tipK: 0.5,                   // [ĐỀ XUẤT] tip = giá × (trang trí − 1 + 0,5 × phần kiên nhẫn còn lại)
    pour: 1.5,                   // [ĐỀ XUẤT] giây giữ nút để rót đầy chén trà
    perfect: [0.9, 1.04], good: [0.7, 1.12], overflow: 1.2,   // [ĐỀ XUẤT] ngưỡng chấm rót trà (1 = đầy vòng)
    teaBad: 0.5,                 // [ĐỀ XUẤT] trà rót hỏng chỉ thu nửa giá
    tipDelay: 0.25,              // [ĐỀ XUẤT] giây giữa số tiền món và số tip bay lên
  };
  // [ĐỀ XUẤT] ghế mở dần theo HX_META.stat('seats'): gần bếp trước, xen ghế đẩu trước quầy và bàn sau
  var SEAT_ORDER = ['Seat_08', 'Seat_09', 'Seat_10', 'Seat_01', 'Seat_02', 'Seat_11', 'Seat_12', 'Seat_03', 'Seat_04',
    'Seat_13', 'Seat_14', 'Seat_05', 'Seat_06', 'Seat_07', 'Seat_VIP'];
  var SEATS = {};
  R.seats.forEach(function (s) { SEATS[s.name] = s; });
  var DAVE_Y = R.marks.StaffRoot[1], BANCHO = R.marks.Bancho, DOOR_X = R.marks.Door[0];
  var CAT_POS = [(BA.cat.prefabPosUnity[0] - R.originUnity[0]) * U, (R.originUnity[1] - BA.cat.prefabPosUnity[1]) * U];
  var EAT = BA.customerEat;
  // Tên món tiếng Việt, dịch từ RecipeText gốc (bảng chữ gốc có 14 thứ tiếng, không có tiếng Việt). Khoá = NameTextID gốc.
  var VI_DISH = {
    Sushi_ClownFish_Name: 'Sushi cá hề', Sushi_Comber_Name: 'Sushi cá mú sọc', Sushi_RubyCardinalFish_Name: 'Sushi cá sơn',
    Sushi_SquareSpotAnthias_Name: 'Sushi cá anthias vàng', Sushi_PyramidButterflyFish_Name: 'Sushi cá bướm kim tự tháp',
    Sushi_YellowTang_Name: 'Sushi cá đuôi gai vàng', Sushi_BlackspotSeabream_Name: 'Sushi cá tráp salema',
    Sushi_JuvenileCircularBatFishFry_Name: 'Cá dơi tròn chiên', Sushi_Bluetang_Name: 'Sushi cá đuôi gai xanh',
    Menu_Seahorse_Roasted_Name: 'Xiên cá ngựa nướng', Sushi_MediterraneanRainbowWrasse_Name: 'Sushi cá bàng chài cầu vồng',
    Sushi_ReefTriggerfish_Name: 'Sushi cá bò đầm phá', Sushi_SmallspottedDart_Name: 'Sushi cá chim đốm nhỏ',
    Sushi_YellowbackFusilier_Name: 'Sushi cá miền lưng vàng', Sushi_OrnateWrasse_Name: 'Sushi cá bàng chài hoa',
    Sushi_LongfinBatFish_Name: 'Sushi cá dơi vây dài', Sushi_MediterraneanParrotfish_Name: 'Sushi cá mó Địa Trung Hải',
    Sushi_RedtoothedTriggerfish_Name: 'Sushi cá bò răng đỏ', Sushi_BlackandWhiteSnapper_Name: 'Sushi cá hồng đen trắng',
    Sushi_GreenHumpheadParrotfish_Name: 'Sushi cá mó đầu gù', Sushi_FriedEggJellyfish_Name: 'Sushi sứa trứng ốp la',
    Sushi_Stellate_Puffer_Special_Name: 'Sushi đặc biệt cá nóc sao', Sushi_RedLionfish_Name: 'Sushi cá mao tiên đỏ',
    Sushi_Titan_Triggerfish_Name: 'Sushi cá bò titan', Sushi_BoxJellyfish_Name: 'Sushi sứa hộp',
    Sushi_Flame_AngelFish_Name: 'Sushi cá thiên thần lửa', Sushi_Asian_Sheepshead_Name: 'Sushi cá bàng chài đầu bướu',
    Sushi_Emperor_AngelFish_Name: 'Sushi cá thiên thần hoàng đế', Sushi_Whiteleg_Shrimp_Shrimp_Name: 'Sushi tôm thẻ chân trắng chín',
    Sushi_Striped_Catfish_Name: 'Sushi cá da trơn sọc', Menu_Longspine_Porcupinefish_Seasoned_Name: 'Da cá nóc nhím gai dài tẩm gia vị',
    Sushi_Longspine_Squirrelfish_Name: 'Sushi cá sơn đá gai dài', Sushi_Clearfin_Lionfish_Name: 'Sushi cá mao tiên vây trong',
    Sushi_BlueheadTilefish_Name: 'Sushi cá đổng đầu xanh', Sushi_WartyFrogfish_Name: 'Sushi cá ếch sần',
    Sushi_PaintedComber_Name: 'Sushi cá mú vẽ', Sushi_BigeyeScad_Name: 'Sushi cá nục mắt to', Sushi_RedMullet_Name: 'Sushi cá phèn đỏ sọc',
    Sushi_Mackerel_Scad_Name: 'Sushi cá nục thu', Sushi_HarlequinHind_Name: 'Sushi cá mú hề', Sushi_BigeyeTrevally_Name: 'Sushi cá khế mắt to',
    Sushi_CoralTrout_Name: 'Sushi cá mú chấm', Sushi_GreyTriggerfish_Name: 'Sushi cá bò xám', Sushi_AtlanticBonito_Name: 'Sushi cá ngừ sọc',
    Sushi_WhiteTrevally_Name: 'Sushi cá khế trắng', Sushi_CuttleFish_Name: 'Sushi mực nang', Sushi_DuskyGrouper_Name: 'Sushi cá mú nâu',
    Sushi_Atlantic_Mackerel_Name: 'Sushi cá thu Đại Tây Dương', Sushi_GiantTrevally_Name: 'Sushi cá khế vây vàng',
    Sushi_GreatBarracuda_Name: 'Sushi cá nhồng lớn', Sushi_Atlantic_Anglerfish_Name: 'Sushi cá vây chân',
    Sushi_Devil_ScorpionFish_Name: 'Sushi cá mù làn quỷ', Sushi_Blackfin_Barracuda_Name: 'Sushi cá nhồng vây đen',
    Sushi_SpearSquid_Name: 'Sushi mực ống giáo', Sushi_ChamberedNautilus_Name: 'Sushi ốc anh vũ', Sushi_Fangtooth_Name: 'Sushi cá răng nanh',
    Sushi_GreatSpiderCrab_Name: 'Sushi cua nhện', Sushi_Clione_Name: 'Sushi thiên thần biển', Sushi_SeaToad_Name: 'Sushi cá cóc biển',
    Sushi_Pacificfanfish_Name: 'Sushi cá quạt Thái Bình Dương', Sushi_ThreetoothPuffer_Name: 'Sushi cá nóc ba răng',
    Sushi_Comb_Jelly_Name: 'Sushi sứa lược', Sushi_BloodbellyCombJelly_Name: 'Sushi sứa lược bụng máu', Sushi_RedBream_Name: 'Sushi cá tráp đỏ',
  };

  // Câu nói của khách (bảng chữ gốc Talk_Sushibar_*, tiếng Anh), dự án tự dịch. Khoá = khoá chữ gốc.
  var VI_TALK = {
    Talk_Sushibar_Wating_001: 'Món này có vẻ được đây!', Talk_Sushibar_Wating_002: 'Trông ngon quá!',
    Talk_Sushibar_Wating_003: 'Cho tôi món này!', Talk_Sushibar_Wating_004: 'Chảy nước miếng rồi...',
    Talk_Sushibar_Wating_005: 'Ăn thử món gì đây ta?', Talk_Sushibar_Wating_006: 'Quán này có gì đó khác lạ.',
    Talk_Sushibar_Wating_007: 'Không biết món nào ngon nhỉ?',
    Talk_Sushibar_Angry_001: 'Món ra chậm quá...', Talk_Sushibar_Angry_002: 'Đói quá đi mất...',
    Talk_Sushibar_Angry_003: 'Trễ hẹn mất thôi...', Talk_Sushibar_Angry_004: 'Bao giờ mới có món đây...',
    Talk_Sushibar_Angry_005: 'Nhanh giùm cái...', Talk_Sushibar_Angry_006: 'Trời ơi... đói muốn xỉu...',
    Talk_Sushibar_Angry_007: 'Hết chịu nổi rồi...',
    Talk_Sushibar_Eating_001: 'Chà... ngon ghê.', Talk_Sushibar_Eating_002: 'Ừm... thích đấy.',
    Talk_Sushibar_Eating_003: 'Tan ngay trong miệng!', Talk_Sushibar_Eating_004: 'Ngon hết sẩy!',
    Talk_Sushibar_Eating_005: 'Đúng vị này rồi!', Talk_Sushibar_Eating_006: 'Ngon hơn mình tưởng nhiều!',
    Talk_Sushibar_Eating_007: 'Oa, tuyệt quá!',
  };

  // Số ngẫu nhiên có hạt giống cho bộ kiểm (HX.bar.debug.seed); hạt null thì dùng Math.random.
  var seed = null;
  function rnd() {
    if (seed === null) return Math.random();
    seed = (seed + 0x6D2B79F5) | 0;
    var t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // ---------- ảnh ----------
  var IMG = {};
  function url(src) { return src + (REV ? '?v=' + REV : ''); }
  function img(src) {
    var i = IMG[src];
    if (!i) { i = IMG[src] = new Image(); i.src = url(src); }
    return i;
  }
  function ok(i) { return !!i && i.complete && i.naturalWidth > 0; }
  function waitImg(src) {
    var i = img(src);
    if (i.complete) return Promise.resolve();
    return new Promise(function (res) { i.addEventListener('load', res); i.addEventListener('error', res); });
  }
  // tên sprite gốc → đường dẫn ảnh (UI, icon món, ảnh hạt)
  var SPR = {}, TEX = {};
  Object.keys(BA.ui.sprites).forEach(function (k) { SPR[k] = BA.ui.sprites[k].img; });
  Object.keys(BA.dishes).forEach(function (k) { var d = BA.dishes[k]; if (d.icon) SPR[d.icon] = d.img; });
  BA.genericDishes.forEach(function (d) { SPR[d.img.split('/').pop().replace('.png', '')] = d.img; });
  SPR.Drink_Tea = SPR.Drink_Tea || BA.tea.img;
  SPR.UI_Customer_Tea_Pop = BA.tea.orderBubble.img;
  Object.keys(BA.vfx.textures).forEach(function (k) { TEX[k] = BA.vfx.textures[k].img; });
  Object.keys(R.emitterTextures).forEach(function (k) { TEX[k] = TEX[k] || R.emitterTextures[k].img; });
  function spriteSrc(name) { return name ? SPR[name] || TEX[name] || null : null; }
  function sprite(name) { var s = spriteSrc(name); return s ? img(s) : null; }
  // Viền 9 mảnh [trái, dưới, phải, trên]. Sprite có phần giữa rộng 0 (nét cọ UI_Sushi_MenuTitleBg: 77 + 171 = 248):
  // Unity kéo giãn cột điểm ảnh ở mép, CSS/canvas thì bỏ trống, nên chừa 1 px ở giữa.
  function borderOf(name) {
    var s = BA.ui.sprites[name];
    if (!s || !s.border) return null;
    var b = s.border.slice();
    if (b[0] + b[2] >= s.w) b[2] = Math.max(0, s.w - b[0] - 1);
    if (b[1] + b[3] >= s.h) b[1] = Math.max(0, s.h - b[3] - 1);
    return b;
  }

  // Nhuộm màu ảnh (màu Image/hạt của Unity nhân vào ảnh). Lượng tử 1/16 để bộ đệm không phình.
  var TINT = {};
  function tinted(I, c) {
    if (!ok(I) || !c || (c[0] > 0.97 && c[1] > 0.97 && c[2] > 0.97)) return I;
    var q = [Math.round(c[0] * 15), Math.round(c[1] * 15), Math.round(c[2] * 15)];
    var key = I.src + '|' + q.join(',');
    var cv = TINT[key];
    if (!cv) {
      cv = document.createElement('canvas');
      cv.width = I.naturalWidth; cv.height = I.naturalHeight;
      var x = cv.getContext('2d');
      x.drawImage(I, 0, 0);
      x.globalCompositeOperation = 'multiply';
      x.fillStyle = 'rgb(' + Math.round(q[0] * 17) + ',' + Math.round(q[1] * 17) + ',' + Math.round(q[2] * 17) + ')';
      x.fillRect(0, 0, cv.width, cv.height);
      x.globalCompositeOperation = 'destination-in';
      x.drawImage(I, 0, 0);
      TINT[key] = cv;
    }
    return cv;
  }

  // ---------- đường cong, ease, tween ----------
  // Khoá: [t, v, in, out] Hermite (clip legacy); [t, v, c, b, a] đa thức (Mecanim); [t, v] tuyến tính; 'step'.
  function evalKeys(keys, t) {
    if (!keys || !keys.length) return 0;
    var n = keys.length;
    if (n === 1 || t <= keys[0][0]) return keys[0][1];
    if (t >= keys[n - 1][0]) return keys[n - 1][1];
    var i = 0;
    while (i < n - 2 && t >= keys[i + 1][0]) i++;
    var a = keys[i], b = keys[i + 1], dt = t - a[0];
    if (a[2] === 'step' || a[3] === 'step') return a[1];
    if (a.length === 5) return ((a[4] * dt + a[3]) * dt + a[2]) * dt + a[1];
    var h = b[0] - a[0];
    if (a.length === 2 || !(h > 0)) return a[1] + (b[1] - a[1]) * (h > 0 ? dt / h : 0);
    var s = dt / h, s2 = s * s, s3 = s2 * s, m0 = (isFinite(a[3]) ? a[3] : 0) * h, m1 = (isFinite(b[2]) ? b[2] : 0) * h;
    return (2 * s3 - 3 * s2 + 1) * a[1] + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * b[1] + (s3 - s2) * m1;
  }
  function bounceOut(t) {
    if (t < 1 / 2.75) return 7.5625 * t * t;
    if (t < 2 / 2.75) { t -= 1.5 / 2.75; return 7.5625 * t * t + 0.75; }
    if (t < 2.5 / 2.75) { t -= 2.25 / 2.75; return 7.5625 * t * t + 0.9375; }
    t -= 2.625 / 2.75; return 7.5625 * t * t + 0.984375;
  }
  // DG.Tweening.Ease; 0 (Unset) là OutQuad như mặc định của DOTween
  function ease(type, t, curve) {
    switch (type) {
      case 1: return t;
      case 2: return 1 - Math.cos(t * Math.PI / 2);
      case 3: return Math.sin(t * Math.PI / 2);
      case 5: return t * t;
      case 7: return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      case 8: return t * t * t;
      case 9: return 1 - Math.pow(1 - t, 3);
      case 27: { var c1 = 1.70158; return 1 + (c1 + 1) * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
      case 30: return bounceOut(t);
      case 31: return t < 0.5 ? (1 - bounceOut(1 - 2 * t)) / 2 : (1 + bounceOut(2 * t - 1)) / 2;
      case 37: return curve ? evalKeys(curve, t) : t;
      default: return t * (2 - t);
    }
  }
  // Tiến độ đã ease của một DOTweenAnimation ở giây `time` kể từ lúc bật. -1: chưa chạy (giữ giá trị gốc).
  function tweenK(tw, time) {
    var d = tw.duration || 1e-4, t = time - (tw.delay || 0);
    if (t < 0) return tw.isFrom ? 0 : -1;
    var n = tw.loops === -1 ? Infinity : Math.max(1, tw.loops || 1), i = Math.floor(t / d), p;
    if (i >= n) { i = n - 1; p = 1; } else p = (t - i * d) / d;
    if (tw.loopType === 1 && i % 2 === 1) p = 1 - p;
    return ease(tw.easeType, p, tw.easeCurve);
  }
  // Áp danh sách tween gốc lên trạng thái st {x, y, sx, sy, a, rot} (vị trí px UI, trục y hướng lên).
  function applyTweens(tweens, time, st) {
    (tweens || []).forEach(function (tw) {
      var k = tweenK(tw, time);
      if (k < 0) return;
      var v3 = tw.endValueV3 || [0, 0, 0], from, to;
      function mix(base, end) {
        var target = tw.isRelative ? base + end : end;
        from = tw.isFrom ? target : base; to = tw.isFrom ? base : target;
        return from + (to - from) * k;
      }
      switch (tw.animationType) {
        case 1: case 2: st.x = mix(st.x, v3[0]); st.y = mix(st.y, v3[1]); break;
        case 3: case 4: st.rot = mix(st.rot, v3[2]); break;
        case 5: {
          var uni = tw.optionalBool0 || (!v3[0] && !v3[1]);
          st.sx = mix(st.sx, uni ? tw.endValueFloat : v3[0]);
          st.sy = mix(st.sy, uni ? tw.endValueFloat : v3[1]);
          break;
        }
        case 7: st.a = mix(st.a, tw.endValueFloat); break;
      }
    });
    return st;
  }
  // Clip UI gốc → bảng ghi đè theo đường dẫn nút: {sx, sy, x, y, a, ga, active, rot}
  function clipOv(clip, t, ov) {
    ov = ov || {};
    t = clip.loop ? t % clip.length : Math.min(t, clip.length);
    clip.curves.forEach(function (c) {
      if (typeof c.path !== 'string') return;
      var o = ov[c.path] || (ov[c.path] = {}), v = evalKeys(c.keys, t);
      switch (c.attr) {
        case 'localScale.x': o.sx = v; break;
        case 'localScale.y': o.sy = v; break;
        case 'm_AnchoredPosition.x': o.x = v; break;
        case 'm_AnchoredPosition.y': o.y = v; break;
        case 'm_Color.a': o.a = v; break;
        case 'm_Color.r': o.cr = v; break;
        case 'm_Color.g': o.cg = v; break;
        case 'm_Color.b': o.cb = v; break;
        case 'm_Alpha': o.ga = v; break;
        case 'm_IsActive': o.active = v >= 0.5; break;
        case 'localEulerAngles.z': o.rot = v; break;
      }
    });
    return ov;
  }
  function clipAt(name) { var c = BA.ui.clips[name]; if (!c) throw new Error('ui clip not found: ' + name); return c; }
  // Clip đổi sprite (spriteKeys [[tên, ms]]) → tên sprite ở giây t
  function spriteKeyAt(clip, t) {
    var tot = 0, i;
    for (i = 0; i < clip.spriteKeys.length; i++) tot += clip.spriteKeys[i][1];
    var ms = (t * 1000) % tot;
    for (i = 0; i < clip.spriteKeys.length; i++) { ms -= clip.spriteKeys[i][1]; if (ms < 0) return clip.spriteKeys[i][0]; }
    return clip.spriteKeys[0][0];
  }

  // ---------- giá trị MinMax của ParticleSystem ----------
  function isKeys(v) { return Array.isArray(v) && Array.isArray(v[0]); }
  function mm(v, t, r) {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    if (Array.isArray(v)) return isKeys(v) ? evalKeys(v, t) : v[0] + (v[1] - v[0]) * r;
    if (v.min && v.max) { var a = evalKeys(v.min, t), b = evalKeys(v.max, t); return (a + (b - a) * r) * (v.mul == null ? 1 : v.mul); }
    if (v.curve != null) return mm(v.curve, t, r) * (v.mul == null ? 1 : v.mul);
    return 0;
  }
  function gradAt(g, t) {
    var c = [1, 1, 1], a = 1, i, k0, k1, f;
    var C = g.color || [], A = g.alpha || [];
    if (C.length) {
      if (t <= C[0][0]) c = C[0].slice(1);
      else if (t >= C[C.length - 1][0]) c = C[C.length - 1].slice(1);
      else for (i = 0; i < C.length - 1; i++) if (t < C[i + 1][0]) {
        k0 = C[i]; k1 = C[i + 1]; f = (t - k0[0]) / (k1[0] - k0[0]);
        c = [k0[1] + (k1[1] - k0[1]) * f, k0[2] + (k1[2] - k0[2]) * f, k0[3] + (k1[3] - k0[3]) * f]; break;
      }
    }
    if (A.length) {
      if (t <= A[0][0]) a = A[0][1];
      else if (t >= A[A.length - 1][0]) a = A[A.length - 1][1];
      else for (i = 0; i < A.length - 1; i++) if (t < A[i + 1][0]) { k0 = A[i]; k1 = A[i + 1]; a = k0[1] + (k1[1] - k0[1]) * (t - k0[0]) / (k1[0] - k0[0]); break; }
    }
    return [c[0], c[1], c[2], a];
  }
  function rot3(v, e) {
    var r = Math.PI / 180, x = v[0], y = v[1], z = v[2], c, s, t;
    if (e[2]) { c = Math.cos(e[2] * r); s = Math.sin(e[2] * r); t = x * c - y * s; y = x * s + y * c; x = t; }
    if (e[0]) { c = Math.cos(e[0] * r); s = Math.sin(e[0] * r); t = y * c - z * s; z = y * s + z * c; y = t; }
    if (e[1]) { c = Math.cos(e[1] * r); s = Math.sin(e[1] * r); t = x * c + z * s; z = -x * s + z * c; x = t; }
    return [x, y, z];
  }

  // Quaternion [x, y, z, w] của Unity (trục y lên). Hệ hạt phát theo trục cục bộ rồi xoay theo Transform của nó.
  var Q0 = [0, 0, 0, 1];
  function qmul(a, b) {
    return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
      a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
  }
  function qrot(q, v) {
    var x = q[0], y = q[1], z = q[2], w = q[3];
    var tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
    return [v[0] + w * tx + y * tz - z * ty, v[1] + w * ty + z * tx - x * tz, v[2] + w * tz + x * ty - y * tx];
  }
  function qz(deg) { var h = deg * Math.PI / 360; return [0, 0, Math.sin(h), Math.cos(h)]; }
  // Quay cục bộ của một nút bố cục: quaternion đầy đủ (n.q) nếu có quay quanh x/y, không thì rotZ.
  function nodeQ(n) { return n.q ? n.q : n.rotZ ? qz(n.rotZ) : null; }

  // Nhiễu giá trị 3D mượt (hàm băm + nội suy bậc năm) cho mô-đun Noise. Unity dùng nhiễu Perlin riêng;
  // tham số (strength, frequency, scrollSpeed, octaves, damping) là số gốc, hàm nhiễu là thay thế [ĐỀ XUẤT].
  function hash3(x, y, z) {
    var h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1103515245);
    return ((h ^ (h >>> 16)) & 0xffff) / 32767.5 - 1;
  }
  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function vnoise(x, y, z) {
    var X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z), u = fade(x - X), v = fade(y - Y), w = fade(z - Z);
    function L(a, b, t) { return a + (b - a) * t; }
    return L(L(L(hash3(X, Y, Z), hash3(X + 1, Y, Z), u), L(hash3(X, Y + 1, Z), hash3(X + 1, Y + 1, Z), u), v),
      L(L(hash3(X, Y, Z + 1), hash3(X + 1, Y, Z + 1), u), L(hash3(X, Y + 1, Z + 1), hash3(X + 1, Y + 1, Z + 1), u), v), w);
  }

  // Mesh của hạt dạng mesh (art/bar/**/mesh/*.json) và điểm ảnh của ảnh mà shader flow lấy mẫu.
  var MESH = {}, PIX = {};
  function meshSrc(name) { return name ? (BA.vfx.meshes && BA.vfx.meshes[name]) || (R.emitterMeshes && R.emitterMeshes[name]) || null : null; }
  function texInfo(name) { return BA.vfx.textures[name] || R.emitterTextures[name] || null; }
  function pixels(name) {
    var p = PIX[name];
    if (p) return p.data ? p : null;
    var I = TEX[name] ? img(TEX[name]) : null;
    if (!ok(I)) return null;
    var cv = document.createElement('canvas');
    cv.width = I.naturalWidth; cv.height = I.naturalHeight;
    var x = cv.getContext('2d');
    x.drawImage(I, 0, 0);
    var inf = texInfo(name) || {};
    p = PIX[name] = { w: cv.width, h: cv.height, data: x.getImageData(0, 0, cv.width, cv.height).data, clamp: !!(inf.wrap && inf.wrap[0] === 1) };
    return p;
  }
  // Lấy mẫu song tuyến tại (u, v) kiểu Unity (v = 0 ở đáy ảnh), trả 0..1 vào out[0..3].
  function tex2D(P, u, v, out) {
    var w = P.w, h = P.h, x = u * w - 0.5, y = (1 - v) * h - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, d = P.data;
    function ix(a, n) { return P.clamp ? (a < 0 ? 0 : a >= n ? n - 1 : a) : ((a % n) + n) % n; }
    var xa = ix(x0, w), xb = ix(x0 + 1, w), ya = ix(y0, h), yb = ix(y0 + 1, h);
    var i00 = (ya * w + xa) * 4, i10 = (ya * w + xb) * 4, i01 = (yb * w + xa) * 4, i11 = (yb * w + xb) * 4;
    for (var c = 0; c < 4; c++) {
      var a = d[i00 + c] + (d[i10 + c] - d[i00 + c]) * fx, b = d[i01 + c] + (d[i11 + c] - d[i01 + c]) * fx;
      out[c] = (a + (b - a) * fy) / 255;
    }
    return out;
  }

  // Shader ProjectJDLC/VFX/VFX_SH_FlowB_Alpha_J (hơi nước của Bancho), dựng lại theo mã DXBC đã dịch ngược
  // (tools/README-bar.md "Khói nấu"): uvFlow = uv·FlowST.xy + FlowST.zw + t·FlowSpeed.xy + custom1.xy;
  // uvMain = uv·MainST.xy + MainST.zw + t·Speed.xy + custom1.zw + FlowTex(uvFlow).xy·FlowPower;
  // uvMask = uv·MaskST.xy + MaskST.zw + t·Speed.zw; màu = MainTex·MaskTex; rgb ·= màu đỉnh·MainTexColor; a ·= màu đỉnh.a.
  var FLOW_W = 64, FLOW_H = 64;
  function Flow(props) {
    this.p = props;
    this.cv = document.createElement('canvas'); this.cv.width = FLOW_W; this.cv.height = FLOW_H;
    this.x = this.cv.getContext('2d');
    this.id = this.x.createImageData(FLOW_W, FLOW_H);
  }
  Flow.prototype.ready = function () {
    var p = this.p;
    return !!(pixels(p.MainTex) && pixels(p.MaskTex) && pixels(p.FlowTex));
  };
  // Vẽ ảnh của một hạt trong không gian uv (FLOW_W × FLOW_H), t = giây shader (_TimeParameters.x), c = màu đỉnh, cu = Custom1.
  Flow.prototype.render = function (t, c, cu) {
    var p = this.p, M = pixels(p.MainTex), K = pixels(p.MaskTex), F = pixels(p.FlowTex);
    var mst = p['MainTex Tiling XY/ Offset ZW'] || [1, 1, 0, 0], kst = p['MaskTex Tiling XY/ Offset ZW'] || [1, 1, 0, 0];
    var fst = p['FlowTex Tiling XY/ Offset ZW'] || [1, 1, 0, 0], fsp = p['FlowTex Speed XY /  Power Z'] || [0, 0, 0, 0];
    var spd = p['Speed MainTex  XY /  MaskTex  Z/W'] || [0, 0, 0, 0], mc = p.MainTexColor || [1, 1, 1, 1];
    var d = this.id.data, a = [0, 0, 0, 0], b = [0, 0, 0, 0], f = [0, 0, 0, 0], i = 0;
    var r0 = c[0] * mc[0] * 255, g0 = c[1] * mc[1] * 255, b0 = c[2] * mc[2] * 255, a0 = c[3] * 255;
    for (var y = 0; y < FLOW_H; y++) {
      var v = 1 - (y + 0.5) / FLOW_H;
      for (var x = 0; x < FLOW_W; x++, i += 4) {
        var u = (x + 0.5) / FLOW_W;
        tex2D(F, u * fst[0] + fst[2] + t * fsp[0] + cu[0], v * fst[1] + fst[3] + t * fsp[1] + cu[1], f);
        tex2D(M, u * mst[0] + mst[2] + t * spd[0] + cu[2] + f[0] * fsp[2], v * mst[1] + mst[3] + t * spd[1] + cu[3] + f[1] * fsp[2], a);
        tex2D(K, u * kst[0] + kst[2] + t * spd[2], v * kst[1] + kst[3] + t * spd[3], b);
        d[i] = a[0] * b[0] * r0; d[i + 1] = a[1] * b[1] * g0; d[i + 2] = a[2] * b[2] * b0; d[i + 3] = a[3] * b[3] * a0;
      }
    }
    this.x.putImageData(this.id, 0, 0);
    return this.cv;
  };
  // Tam giác có ảnh: ánh xạ afin điểm ảnh nguồn (s0..s2) lên đích (d0..d2), cắt theo tam giác (nới 0,6 px cho khỏi hở mép).
  function texTri(ctx, I, s, d) {
    var x0 = d[0], y0 = d[1], x1 = d[2], y1 = d[3], x2 = d[4], y2 = d[5];
    var u0 = s[0], v0 = s[1], u1 = s[2], v1 = s[3], u2 = s[4], v2 = s[5];
    var den = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0);
    if (Math.abs(den) < 1e-6) return;
    var a = ((x1 - x0) * (v2 - v0) - (x2 - x0) * (v1 - v0)) / den, b = ((x2 - x0) * (u1 - u0) - (x1 - x0) * (u2 - u0)) / den;
    var c = ((y1 - y0) * (v2 - v0) - (y2 - y0) * (v1 - v0)) / den, e = ((y2 - y0) * (u1 - u0) - (y1 - y0) * (u2 - u0)) / den;
    var cx = (x0 + x1 + x2) / 3, cy = (y0 + y1 + y2) / 3;
    function g(x, y) { var dx = x - cx, dy = y - cy, l = Math.sqrt(dx * dx + dy * dy) || 1; return [x + dx / l * 0.6, y + dy / l * 0.6]; }
    var p0 = g(x0, y0), p1 = g(x1, y1), p2 = g(x2, y2);
    ctx.save();
    ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.closePath();
    ctx.clip();
    ctx.transform(a, c, b, e, x0 - a * u0 - b * v0, y0 - c * u0 - e * v0);
    ctx.drawImage(I, 0, 0);
    ctx.restore();
  }

  // Màu ra của shader hạt, đọc từ mã DXBC đã dịch ngược (tools/README-bar.md "Màu của shader hạt"):
  //   ProjectDR/UI/Additive, ProjectDR/UI/Alpha Blended: 2 · ảnh · màu hạt · _Color
  //   ProjectDR/VFX/Additive, AdditiveNoFog:             2 · ảnh · màu hạt · _TintColor
  //   ProjectDR/VFX/Alpha Blended (cả NoFog):            2 · ảnh · màu hạt (không dùng _TintColor)
  //   Legacy Shaders/Particles/*:                        2 · ảnh · màu hạt · _TintColor
  //   URP Particles/Unlit: ảnh · màu hạt · _BaseColor; Mobile, Sprites/Default, UI/*, Unlit/*: ảnh · màu hạt (· _Color)
  // Alpha ra bị kẹp ở 1. Bản trước chỉ nhân 2 cho Legacy: các hiệu ứng UI (ánh sáng khi khách vui, vàng bay, trà
  // perfect…) chỉ còn một nửa độ sáng, vòng sáng mờ trông như một quầng tối.
  function shaderColor(Rd) {
    var sh = Rd.shader || '', t = Rd.tint || {}, one = [1, 1, 1, 1];
    if (/^ProjectDR\/UI\/(Additive|Alpha Blended)/.test(sh)) return { gain: 2, tint: t._Color || one };
    if (/^ProjectDR\/VFX\/Additive/.test(sh)) return { gain: 2, tint: t._TintColor || one };
    if (/^ProjectDR\/VFX\/Alpha Blended/.test(sh)) return { gain: 2, tint: one };
    if (/^Legacy Shaders\/Particles/.test(sh)) return { gain: 2, tint: t._TintColor || one };
    if (/^Universal Render Pipeline\/Particles/.test(sh)) return { gain: 1, tint: t._BaseColor || one };
    if (/^Mobile\//.test(sh)) return { gain: 1, tint: one };
    return { gain: 1, tint: t._Color || one };
  }
  // Màu đã nhân (có thể > 1) → cách vẽ trên canvas. Cộng sáng: phần góp = rgb·a, dồn độ sáng vào globalAlpha
  // (giữ đúng sắc màu), vượt 1 thì vẽ chồng n lượt. Pha alpha: kẹp rgb và a về [0, 1].
  function paintOf(c, add) {
    if (!add) return { col: [Math.min(1, c[0]), Math.min(1, c[1]), Math.min(1, c[2])], a: clamp(c[3], 0, 1), n: 1 };
    var a = Math.min(1, c[3]), e0 = c[0] * a, e1 = c[1] * a, e2 = c[2] * a, m = Math.max(e0, e1, e2);
    if (m <= 0.002) return { col: [0, 0, 0], a: 0, n: 0 };
    var n = Math.ceil(m - 1e-6);
    return { col: [e0 / m, e1 / m, e2 / m], a: m / n, n: n };
  }

  // ---------- hạt: bộ con của Unity ParticleSystem, chạy lại đúng tham số đã bóc ----------
  // x, y: gốc phát (px của không gian vẽ); k: px mỗi đơn vị của hệ hạt; sx, sy: tỉ lệ cộng dồn theo cây;
  // o.q: quaternion thế giới của hệ hạt (hướng phát, vận tốc cục bộ, lực cục bộ đều xoay theo nó).
  // Hạt lưu vị trí + vận tốc bằng đơn vị Unity (y lên) tính từ gốc phát; chỉ đổi sang px lúc vẽ.
  function Emitter(p, x, y, k, o) {
    o = o || {};
    var Rd = p.render || {};
    this.p = p; this.x = x; this.y = y; this.k = k; this.sx = o.sx || 1; this.sy = o.sy || 1; this.q = o.q || Q0;
    this.parts = []; this.t = -mm(p.startDelay, 0, Math.random()) - (o.delay || 0); this.acc = 0; this.cycle = 0; this.fired = {};
    this.stopped = false; this.stopReq = false; this.clock = 0;
    this.add = Rd.blend === 'SrcAlpha+One' || Rd.blend === 'One+One';
    this.tex = TEX[Rd.texture] ? img(TEX[Rd.texture]) : sprite(Rd.texture);
    var sc = shaderColor(Rd);
    this.tint = sc.tint; this.gain = sc.gain;
    this.sheet = p.sheet && p.sheet.tilesX ? p.sheet : null;
    this.stretch = Rd.mode === 'stretch';
    this.mesh = Rd.mode === 'mesh' ? MESH[Rd.mesh] || null : null;
    this.flow = this.mesh && /FlowB/.test(Rd.shader || '') && Rd.props ? new Flow(Rd.props) : null;
    this.fudge = Rd.sortingFudge || 0;
    this.speedMul = p.simulationSpeed || 1;
    this.max = p.maxParticles || 1000;
    if (p.prewarm && p.loop) for (var i = 0; i < (p.duration || 1) * 20; i++) this.update(1 / 20);
  }
  Emitter.prototype.alive = function () { return !this.stopped || this.parts.length > 0; };
  Emitter.prototype.stop = function () { this.stopReq = true; if (!this.p.loop || this.t >= 0) this.stopped = true; };
  // vector cục bộ của hệ hạt → hướng thế giới (bỏ qua khi mô-đun đặt inWorldSpace)
  Emitter.prototype.toWorld = function (v, world) { return world || this.q === Q0 ? v : qrot(this.q, v); };
  Emitter.prototype.update = function (dt) {
    var p = this.p, self = this;
    dt *= this.speedMul;
    this.clock += dt;
    if (!this.stopped) {
      this.t += dt;
      if (this.t >= 0) {
        var dur = p.duration || 1, ct = this.t - this.cycle * dur;
        if (ct >= dur) {
          if (p.loop && !this.stopReq) { this.cycle += Math.floor(ct / dur); ct = ct % dur; this.fired = {}; } else this.stopped = true;
        }
        if (!this.stopped) {
          this.acc += Math.max(0, mm(p.rate, ct / dur, Math.random())) * dt;
          while (this.acc >= 1) { this.acc -= 1; this.emit(ct / dur); }
          (p.bursts || []).forEach(function (b, i) {
            if (self.fired[i] || ct < b.t) return;
            self.fired[i] = 1;
            var n = Math.round(mm(b.count, 0, Math.random()));
            for (var j = 0; j < n; j++) self.emit(ct / dur);
          });
        }
      }
    }
    var g = -9.81, vo = p.velocityOverLife, fo = p.forceOverLife, nz = p.noise;
    for (var i = this.parts.length - 1; i >= 0; i--) {
      var q = this.parts[i];
      q.age += dt;
      if (q.age >= q.life) { this.parts.splice(i, 1); continue; }
      var f = q.age / q.life;
      q.v[1] += g * mm(p.gravity, f, q.r1) * dt;
      if (fo) {
        var fa = this.toWorld([mm(fo.x, f, q.r5), mm(fo.y, f, q.r5), mm(fo.z, f, q.r5)], fo.inWorldSpace);
        q.v[0] += fa[0] * dt; q.v[1] += fa[1] * dt; q.v[2] += fa[2] * dt;
      }
      var mx = q.v[0], my = q.v[1];
      if (vo) {
        var sm = vo.speedModifier == null ? 1 : mm(vo.speedModifier, f, q.r2);
        var va = this.toWorld([mm(vo.x, f, q.r2) * sm, mm(vo.y, f, q.r3) * sm, mm(vo.z, f, q.r3) * sm], vo.inWorldSpace);
        mx += va[0]; my += va[1];
      }
      if (nz) {
        // Noise: độ dời mỗi giây = nhiễu(vị trí·tần số + cuộn·thời gian) · strength · positionAmount (damping: chia tần số)
        var fr = nz.frequency || 1, sc = mm(nz.scrollSpeed, f, 0) * this.clock, amt = nz.positionAmount == null ? 1 : mm(nz.positionAmount, f, 0);
        var st = mm(nz.strength, f, q.r4) * amt / (nz.damping ? fr : 1), sty = nz.separateAxes ? mm(nz.strengthY, f, q.r4) * amt / (nz.damping ? fr : 1) : st;
        var nx = 0, ny = 0, oa = 1, of = fr, oc = Math.max(1, nz.octaves || 1);
        for (var o = 0; o < oc; o++) {
          nx += vnoise(q.p[0] * of + 17.3, q.p[1] * of, sc + q.ph) * oa;
          ny += vnoise(q.p[0] * of, q.p[1] * of + 41.7, sc + q.ph) * oa;
          oa *= nz.octaveMultiplier || 0.5; of *= nz.octaveScale || 2;
        }
        mx += nx * st; my += ny * sty;
      }
      q.p[0] += mx * dt; q.p[1] += my * dt; q.p[2] += q.v[2] * dt;
      q.vis = [mx, my];
      q.rot += q.rotv * dt;
    }
  };
  // Một hạt mới: hình phát (cục bộ của mô-đun Shape, xoay theo Shape.rot rồi theo Transform của hệ), tốc độ đầu, cỡ, màu.
  Emitter.prototype.emit = function (sysT) {
    if (this.parts.length >= this.max) return;
    var p = this.p, sh = p.shape, r = Math.random, pos = [0, 0, 0], dir = [0, 0, 1];
    if (sh && sh.type != null) {
      var ty = sh.type, R0 = sh.radius || 0, th = sh.radiusThickness == null ? 1 : sh.radiusThickness;
      var arc = (sh.arc == null ? 360 : sh.arc) * Math.PI / 180, a, rr = R0 * (1 - th * r());
      if (ty === 'circle' || ty === 'donut') {
        a = r() * arc;
        pos = [Math.cos(a) * rr, Math.sin(a) * rr, 0]; dir = [Math.cos(a), Math.sin(a), 0];
      } else if (ty === 'box' || ty === 'rectangle') {
        pos = [r() - 0.5, r() - 0.5, ty === 'box' ? r() - 0.5 : 0]; dir = [0, 0, 1];
      } else if (ty === 'cone' || ty === 'coneVolume') {
        a = r() * arc;
        var fr = rr / (R0 || 1), tn = Math.tan((sh.angle || 0) * Math.PI / 180) * fr, l = Math.sqrt(tn * tn + 1);
        pos = [Math.cos(a) * rr, Math.sin(a) * rr, 0];
        dir = [Math.cos(a) * tn / l, Math.sin(a) * tn / l, 1 / l];
      } else if (ty === 'edge') {
        pos = [(r() * 2 - 1) * R0, 0, 0]; dir = [0, 1, 0];
      } else {   // sphere / hemisphere
        var u = r() * 2 - 1, ph = r() * Math.PI * 2, sq = Math.sqrt(1 - u * u);
        dir = [sq * Math.cos(ph), sq * Math.sin(ph), ty === 'hemisphere' ? Math.abs(u) : u];
        pos = [dir[0] * rr, dir[1] * rr, dir[2] * rr];
      }
      var sc = sh.scale || [1, 1, 1];
      pos = [pos[0] * sc[0], pos[1] * sc[1], pos[2] * (sc[2] == null ? 1 : sc[2])];
      if (sh.rot) { pos = rot3(pos, sh.rot); dir = rot3(dir, sh.rot); }
      if (sh.pos) { pos[0] += sh.pos[0]; pos[1] += sh.pos[1]; pos[2] += sh.pos[2] || 0; }
    }
    if (this.q !== Q0) { pos = qrot(this.q, pos); dir = qrot(this.q, dir); }
    var sp = mm(p.speed, sysT || 0, r()), col = p.color, c0, m = r();
    if (col && col.randomColor) {
      var A = col.randomColor[0], B = col.randomColor[1];
      c0 = [A[0] + (B[0] - A[0]) * m, A[1] + (B[1] - A[1]) * m, A[2] + (B[2] - A[2]) * m, A[3] + (B[3] - A[3]) * m];
    } else if (col && col.gradient) c0 = gradAt(col.gradient, sysT || 0);
    else if (col && col.between) c0 = mixGrad(col.between, sysT || 0, m);
    else if (col && col.randomGradient) c0 = gradAt(col.randomGradient, m);
    else c0 = Array.isArray(col) ? col.slice() : [1, 1, 1, 1];
    var sz = mm(p.size, sysT || 0, r());
    var s3 = p.size3D ? [sz, mm(p.size3D[1], sysT || 0, r()), mm(p.size3D[2], sysT || 0, r())] : null;
    var ro = p.rotationOverLife;
    this.parts.push({
      p: pos, v: [dir[0] * sp, dir[1] * sp, dir[2] * sp], vis: [dir[0] * sp, dir[1] * sp],
      age: 0, life: Math.max(0.01, mm(p.lifetime, sysT || 0, r())), size: sz, s3: s3,
      rot: mm(p.rotation, sysT || 0, r()), rotv: ro ? mm(ro.curve, 0, r()) : 0,
      c0: c0, r1: r(), r2: r(), r3: r(), r4: r(), r5: r(), gr: r(), ph: r() * 100,
      cu: p.custom1 ? p.custom1.map(function (v) { return mm(v, 0, r()); }).concat([0, 0, 0, 0]).slice(0, 4) : [0, 0, 0, 0],
    });
  };
  // V: {x0, y0, s, ox, oy} đổi toạ độ phát sang toạ độ vẽ (X = (x − x0)·s + ox)
  Emitter.prototype.draw = function (ctx, V) {
    var tex = this.tex, p = this.p;
    if (!this.parts.length) return;
    if (this.mesh) { this.drawMesh(ctx, V); return; }
    if (!ok(tex)) return;
    var sh = this.sheet, nx = sh ? sh.tilesX : 1, ny = sh ? sh.tilesY : 1;
    var fw = tex.naturalWidth / nx, fh = tex.naturalHeight / ny, nt = nx * ny;
    var Rd = p.render || {}, maxPx = (Rd.maxParticleSize || 0) > 0 ? Rd.maxParticleSize * ctx.canvas.height : Infinity;
    ctx.globalCompositeOperation = this.add ? 'lighter' : 'source-over';
    var col = p.colorOverLife, szl = p.sizeOverLife, ku = this.k * V.s;
    for (var i = 0; i < this.parts.length; i++) {
      var q = this.parts[i], f = q.age / q.life, c = this.colorOf(q, f, col);
      if (c[3] <= 0.004) continue;
      var sl = szl ? mm(szl.curve, f, q.r4) : 1, sly = szl && szl.separateAxes ? mm(szl.y, f, q.r4) : sl;
      var w = Math.min(maxPx, (q.s3 ? q.s3[0] : q.size) * sl * ku) * this.sx, h = Math.min(maxPx, (q.s3 ? q.s3[1] : q.size) * sly * ku) * this.sy;
      if (w < 0.4 && h < 0.4) continue;
      var X = (this.x + q.p[0] * this.k * this.sx - V.x0) * V.s + V.ox, Y = (this.y - q.p[1] * this.k * this.sy - V.y0) * V.s + V.oy;
      var fx = 0, fy = 0;
      if (sh) {
        var fot = sh.frameOverTime ? mm(sh.frameOverTime, f, 0) : f;
        var fi = (Math.floor(fot * nt * (sh.cycles || 1)) + (sh.startFrame || 0)) % nt;
        fx = (fi % nx) * fw; fy = Math.floor(fi / nx) * fh;
      }
      var pc = paintOf(c, this.add);
      if (!pc.n || pc.a <= 0.003) continue;
      var src = tinted(tex, pc.col);
      ctx.globalAlpha = pc.a;
      ctx.save();
      ctx.translate(X, Y);
      if (this.stretch) {
        // billboard kéo dài: dài = cỡ·lengthScale + tốc độ·velocityScale (đơn vị), xoay theo hướng bay trên màn
        var vx = q.vis[0] * this.sx, vy = -q.vis[1] * this.sy, spd = Math.sqrt(vx * vx + vy * vy);
        ctx.rotate(Math.atan2(vy, vx));
        var len = Math.max(0, (q.s3 ? q.s3[0] : q.size) * sl * (Rd.lengthScale == null ? 2 : Rd.lengthScale) + spd * (Rd.velocityScale || 0));
        for (var pn = 0; pn < pc.n; pn++) ctx.drawImage(src, fx, fy, fw, fh, -len * ku / 2, -h / 2, len * ku, h);
      } else {
        if (q.rot) ctx.rotate(q.rot);
        for (var pm = 0; pm < pc.n; pm++) ctx.drawImage(src, fx, fy, fw, fh, -w / 2, -h / 2, w, h);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };
  Emitter.prototype.colorOf = function (q, f, col) {
    var c = q.c0.slice();
    if (col) {
      var g = col.gradient ? gradAt(col.gradient, f) : col.between ? mixGrad(col.between, f, q.gr) : null;
      if (g) { c[0] *= g[0]; c[1] *= g[1]; c[2] *= g[2]; c[3] *= g[3]; }
    }
    var k = this.gain;
    c[0] *= this.tint[0] * k; c[1] *= this.tint[1] * k; c[2] *= this.tint[2] * k; c[3] *= this.tint[3] * k;
    return c;
  };
  // Hạt dạng mesh (mặt phẳng): đỉnh mesh · cỡ 3D, quay theo góc hạt, chiếu thẳng lên màn (mesh gốc nằm trên mặt z = 0).
  // Shader flow: mỗi hạt vẽ ảnh uv riêng (Flow.render) rồi dán lên từng tam giác của mesh.
  Emitter.prototype.drawMesh = function (ctx, V) {
    var M = this.mesh, p = this.p, col = p.colorOverLife, szl = p.sizeOverLife, ku = this.k * V.s;
    if (this.flow && !this.flow.ready()) return;
    var n = M.v.length / 3, src = this.flow ? null : this.tex;
    if (!this.flow && !ok(src)) return;
    var sw = this.flow ? FLOW_W : src.naturalWidth, shh = this.flow ? FLOW_H : src.naturalHeight;
    ctx.globalCompositeOperation = this.add ? 'lighter' : 'source-over';
    var smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true;
    for (var i = 0; i < this.parts.length; i++) {
      var q = this.parts[i], f = q.age / q.life, c = this.colorOf(q, f, col);
      if (c[3] <= 0.004) continue;
      var sl = szl ? mm(szl.curve, f, q.r4) : 1, sly = szl && szl.separateAxes ? mm(szl.y, f, q.r4) : sl;
      var ax = (q.s3 ? q.s3[0] : q.size) * sl, ay = (q.s3 ? q.s3[1] : q.size) * sly;
      var cr = Math.cos(q.rot), sr = Math.sin(q.rot);
      var X = (this.x + q.p[0] * this.k * this.sx - V.x0) * V.s + V.ox, Y = (this.y - q.p[1] * this.k * this.sy - V.y0) * V.s + V.oy;
      var D = new Array(n * 2), S = new Array(n * 2);
      for (var j = 0; j < n; j++) {
        var mx = M.v[j * 3] * ax, my = M.v[j * 3 + 1] * ay, rx = mx * cr + my * sr, ry = -mx * sr + my * cr;
        D[j * 2] = X + rx * ku * this.sx; D[j * 2 + 1] = Y - ry * ku * this.sy;
        S[j * 2] = M.uv[j * 2] * sw; S[j * 2 + 1] = (1 - M.uv[j * 2 + 1]) * shh;
      }
      var I;
      if (this.flow) { ctx.globalAlpha = 1; I = this.flow.render(this.clock, c, q.cu); }
      else { var pk = paintOf(c, this.add); if (!pk.n) continue; ctx.globalAlpha = pk.a; I = tinted(src, pk.col); }
      for (var t = 0; t < M.tri.length; t += 3) {
        var a = M.tri[t], b = M.tri[t + 1], e = M.tri[t + 2];
        texTri(ctx, I, [S[a * 2], S[a * 2 + 1], S[b * 2], S[b * 2 + 1], S[e * 2], S[e * 2 + 1]],
          [D[a * 2], D[a * 2 + 1], D[b * 2], D[b * 2 + 1], D[e * 2], D[e * 2 + 1]]);
      }
    }
    ctx.imageSmoothingEnabled = smooth;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };
  function mixGrad(two, f, r) {
    var a = gradAt(two[0], f), b = gradAt(two[1], f);
    return [a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r, a[2] + (b[2] - a[2]) * r, a[3] + (b[3] - a[3]) * r];
  }
  function hasScript(n, name) {
    return (n.scripts || []).some(function (s) { return s === name || (s && typeof s === 'object' && s[name]); });
  }
  // Hạt vẽ được: có ảnh; hệ UI (UiParticles) tắt ParticleSystemRenderer nhưng vẫn hiện.
  // Hạt mesh cần mesh đã nạp; shader riêng chỉ nhận loại đã dựng lại (FlowB của hơi nước Bancho).
  function renderable(n) {
    var p = n.particle;
    if (!p || !p.render) return false;
    var Rd = p.render, tx = Rd.texture;
    if (Rd.blend === 'Zero+Zero') return false;
    if (Rd.enabled === false && !hasScript(n, 'UiParticles')) return false;
    if (/FlowB/.test(Rd.shader || '')) return !!(Rd.mesh && Rd.props && meshSrc(Rd.mesh));
    if (!tx || tx === 'Default-Particle' || !(TEX[tx] || SPR[tx])) return false;
    if (Rd.mode === 'mesh' && !(Rd.mesh && meshSrc(Rd.mesh))) return false;
    if (Rd.props) return false;   // shader riêng chưa dựng lại: vẽ thẳng ảnh là sai (khối trắng đặc)
    return true;
  }

  // ---------- bố cục UI gốc (RectTransform) ----------
  var DEF_RT = [0.5, 0.5, 0.5, 0.5, 0, 0, 100, 100, 0.5, 0.5];
  function rectOf(n, prt, o) {
    var r = n.rt || DEF_RT, pw = prt.w, ph = prt.h;
    var w = (r[2] - r[0]) * pw + r[6], h = (r[3] - r[1]) * ph + r[7];
    if (o && o.w != null) w = o.w;
    var ax = r[0] + (r[2] - r[0]) * r[8], ay = r[1] + (r[3] - r[1]) * r[9];
    return {
      x: (ax - prt.px) * pw + (o && o.x != null ? o.x : r[4]),
      y: (ay - prt.py) * ph + (o && o.y != null ? o.y : r[5]),
      w: w, h: h, px: r[8], py: r[9],
    };
  }
  function findNode(n, name) {
    if (n.name === name) return n;
    for (var i = 0; n.children && i < n.children.length; i++) { var r = findNode(n.children[i], name); if (r) return r; }
    return null;
  }
  function child(n, name) {
    for (var i = 0; n.children && i < n.children.length; i++) if (n.children[i].name === name) return n.children[i];
    throw new Error('ui node not found: ' + n.name + '/' + name);
  }
  function textOf(n) {
    if (n.text) return n.text;
    var s = (n.scripts || []).filter(function (x) { return x && x.Text; })[0];
    return s ? { text: s.Text.m_Text, size: 22, color: [1, 1, 1, 1], align: 2, style: 1 } : null;
  }
  // Font gốc nạp ở css/fonts.css: chữ thân Roboto-Medium, chuỗi chỉ có ký tự Latin không dấu (số tiền, "Lv.3") dùng Snowstorm
  var FONT = "'HX Roboto', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", FONT_NUM = "'HX Snowstorm', " + FONT;
  function fontFor(txt) { return /^[ -~]*$/.test(txt) ? FONT_NUM : FONT; }

  function nine(ctx, I, b, L, Tt, w, h) {
    var iw = I.width, ih = I.height, l = b[0], bt = b[1], r = b[2], t = b[3];
    var k = Math.min(1, w / Math.max(1, l + r), h / Math.max(1, t + bt));
    var dl = l * k, dr = r * k, dt = t * k, db = bt * k;
    var sx = [0, l, iw - r, iw], sw = [l, iw - l - r, r], sy = [0, t, ih - bt, ih], shh = [t, ih - t - bt, bt];
    var dx = [L, L + dl, L + w - dr], dw = [dl, w - dl - dr, dr], dy = [Tt, Tt + dt, Tt + h - db], dh = [dt, h - dt - db, db];
    for (var yy = 0; yy < 3; yy++) for (var xx = 0; xx < 3; xx++) {
      if (sw[xx] <= 0 || shh[yy] <= 0 || dw[xx] <= 0 || dh[yy] <= 0) continue;
      ctx.drawImage(I, sx[xx], sy[yy], sw[xx], shh[yy], dx[xx], dy[yy], dw[xx], dh[yy]);
    }
  }
  function filled(ctx, I, fill, amt, L, Tt, w, h) {
    amt = clamp(amt, 0, 1);
    if (amt <= 0) return;
    ctx.save();
    ctx.beginPath();
    if (fill.method === 0) {
      if (fill.origin === 1) ctx.rect(L + w * (1 - amt), Tt, w * amt, h); else ctx.rect(L, Tt, w * amt, h);
    } else if (fill.method === 1) {
      if (fill.origin === 1) ctx.rect(L, Tt, w, h * amt); else ctx.rect(L, Tt + h * (1 - amt), w, h * amt);
    } else {
      // Radial360: gốc 0 dưới, 1 phải, 2 trên, 3 trái
      var cx = L + w / 2, cy = Tt + h / 2, a0 = [Math.PI / 2, 0, -Math.PI / 2, Math.PI][fill.origin || 0];
      var sweep = amt * Math.PI * 2 * (fill.clockwise === false ? -1 : 1);
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, Math.max(w, h), a0, a0 + sweep, sweep < 0);
      ctx.closePath();
    }
    ctx.clip();
    ctx.drawImage(I, L, Tt, w, h);
    ctx.restore();
  }
  // Vẽ một nút (và con) lên ctx đang ở hệ px UI, gốc = pivot nút cha, trục y hướng xuống.
  // ov: ghi đè theo đường dẫn tương đối {active, sprite, fill, color, a, ga, sx, sy, x, y, text, rot}; time: giây kể từ lúc bật (cho tween).
  function drawNode(ctx, n, prt, path, ov, time) {
    var o = ov[path] || {};
    var active = o.active != null ? o.active : !n.off;
    if (!active || n.particle && !n.img && !(n.children && n.children.length)) return;
    var tx = textOf(n), txt = o.text != null ? String(o.text) : tx ? tx.text : null;
    var size = tx ? tx.size || 22 : 0;
    if (tx && (!n.rt || n.rt[6] === 0) && o.w == null) {
      ctx.font = ((tx.style & 1) ? '800 ' : '700 ') + size + 'px ' + fontFor(txt);
      o = Object.assign({}, o, { w: ctx.measureText(txt).width });
    }
    var r = rectOf(n, prt, o);
    var st = { x: 0, y: 0, sx: 1, sy: 1, a: 1, rot: o.rot || 0 };
    if (n.tweens) applyTweens(n.tweens, time, st);
    var sx = (n.scale ? n.scale[0] : 1) * (o.sx == null ? 1 : o.sx) * st.sx;
    var sy = (n.scale ? n.scale[1] : 1) * (o.sy == null ? 1 : o.sy) * st.sy;
    var ga = (n.alpha != null ? n.alpha : 1) * (o.ga == null ? 1 : o.ga);
    ctx.save();
    ctx.translate(r.x + st.x, -(r.y + st.y));
    if (st.rot || n.rotZ) ctx.rotate(-(st.rot + (n.rotZ || 0)) * Math.PI / 180);
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
    ctx.globalAlpha *= ga;
    var L = -r.px * r.w, Tt = -(1 - r.py) * r.h;
    var im = n.img;
    if (im && !im.off && o.sprite !== null) {
      var name = o.sprite !== undefined ? o.sprite : im.sprite;
      var c = o.color || im.color || [1, 1, 1, 1], a = (o.a != null ? o.a : c[3]) * st.a;
      if (o.cr != null || o.cg != null || o.cb != null) c = [o.cr != null ? o.cr : c[0], o.cg != null ? o.cg : c[1], o.cb != null ? o.cb : c[2], c[3]];
      var I = sprite(name);
      if (a > 0.003) {
        ctx.save();
        ctx.globalAlpha *= a;
        if (!name) { ctx.fillStyle = 'rgb(' + (c[0] * 255 | 0) + ',' + (c[1] * 255 | 0) + ',' + (c[2] * 255 | 0) + ')'; ctx.fillRect(L, Tt, r.w, r.h); }
        else if (ok(I)) {
          var src = tinted(I, c), bd = borderOf(name);
          if (im.type === 3 && im.fill) filled(ctx, src, im.fill, o.fill != null ? o.fill : im.fill.amount, L, Tt, r.w, r.h);
          else if (im.type === 1 && bd) nine(ctx, src, bd, L, Tt, r.w, r.h);
          else ctx.drawImage(src, L, Tt, r.w, r.h);
        }
        ctx.restore();
      }
    }
    if (txt) {
      var tc = tx.color || [1, 1, 1, 1];
      ctx.save();
      ctx.globalAlpha *= (o.a != null ? o.a : tc[3]) * st.a;
      ctx.font = ((tx.style & 1) ? '800 ' : '700 ') + size + 'px ' + fontFor(txt);
      ctx.textBaseline = 'middle';
      ctx.textAlign = tx.align === 1 ? 'left' : tx.align === 4 ? 'right' : 'center';
      var X = tx.align === 1 ? L : tx.align === 4 ? L + r.w : L + r.w / 2, Y = Tt + r.h / 2;
      ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, size * 0.16); ctx.strokeStyle = 'rgba(40,24,16,0.9)';
      ctx.strokeText(txt, X, Y);
      ctx.fillStyle = 'rgb(' + (tc[0] * 255 | 0) + ',' + (tc[1] * 255 | 0) + ',' + (tc[2] * 255 | 0) + ')';
      ctx.fillText(txt, X, Y);
      ctx.restore();
    }
    var me = { w: r.w, h: r.h, px: r.px, py: r.py };
    (n.children || []).forEach(function (ch) { drawNode(ctx, ch, me, path ? path + '/' + ch.name : ch.name, ov, time); });
    ctx.restore();
  }
  // Đi theo đường dẫn tên từ gốc bố cục, cộng dồn vị trí + tỉ lệ; trả về {node, prt, x, y, s} (px UI, y lên).
  function locate(root, names) {
    var rr = root.rt || DEF_RT, n = root, prt = { w: rr[6], h: rr[7], px: rr[8], py: rr[9] }, x = 0, y = 0, s = 1;
    names.forEach(function (nm) {
      n = child(n, nm);
      var r = rectOf(n, prt, null);
      x += r.x * s; y += r.y * s;
      s *= n.scale ? n.scale[0] : 1;
      prt = { w: r.w, h: r.h, px: r.px, py: r.py };
    });
    return { node: n, x: x, y: y, s: s, prt: prt };
  }
  // Vẽ nút ở đường dẫn `names` (bỏ nút gốc) của bố cục, pivot gốc đặt ở toạ độ vẽ (X, Y), k px vẽ mỗi px UI.
  function drawAt(ctx, root, names, X, Y, k, ov, time) {
    var parent = locate(root, names.slice(0, -1)), n = child(parent.node, names[names.length - 1]);
    ctx.save();
    ctx.translate(X + parent.x * k, Y - parent.y * k);
    ctx.scale(k * parent.s, k * parent.s);
    drawNode(ctx, n, parent.prt, '', ov || {}, time || 0);
    ctx.restore();
  }
  // Vị trí (px UI, y lên) của nút ở đường dẫn tính từ pivot gốc.
  function nodePos(root, names) { var l = locate(root, names); return { x: l.x, y: l.y, s: l.s, node: l.node }; }

  // ---------- VFX: cây hệ hạt của prefab gốc ----------
  // Cây hệ hạt: vị trí và tỉ lệ cộng dồn theo 2D; phép quay cộng dồn bằng quaternion (hệ dựng đứng quanh trục x
  // thì hình nón phát lên trên, đúng như Transform gốc). Vị trí con được xoay theo cha chỉ trong mặt phẳng (rotZ).
  function walkVfx(n, prt, x, y, k, sx, sy, out, isRoot, delay, pq) {
    var r = n.rt ? rectOf(n, prt, null) : null;
    var ox = isRoot ? 0 : r ? r.x : n.pos ? n.pos[0] : 0, oy = isRoot ? 0 : r ? r.y : n.pos ? n.pos[1] : 0;
    if (pq && pq !== Q0) { var rp = qrot(pq, [ox, oy, 0]); ox = rp[0]; oy = rp[1]; }
    var nx = x + ox * k * sx, ny = y - oy * k * sy;
    var s2x = sx * (n.scale ? n.scale[0] : 1), s2y = sy * (n.scale ? n.scale[1] : 1);
    var lq = nodeQ(n), q = lq ? qmul(pq || Q0, lq) : pq || Q0;
    if (renderable(n)) out.push(new Emitter(n.particle, nx, ny, k, { sx: s2x, sy: s2y, delay: delay, q: q }));
    var me = r ? { w: r.w, h: r.h, px: r.px, py: r.py } : { w: 0, h: 0, px: 0.5, py: 0.5 };
    (n.children || []).forEach(function (c) { walkVfx(c, me, nx, ny, k, s2x, s2y, out, false, delay, q); });
  }
  function spawnNode(list, n, x, y, k, delay) {
    var out = [];
    // gốc không có RectTransform: con có anchor tính trên khung cỡ 0 (vị trí = anchoredPosition), như Unity
    walkVfx(n, n.rt ? { w: n.rt[6], h: n.rt[7], px: 0.5, py: 0.5 } : { w: 0, h: 0, px: 0.5, py: 0.5 }, x, y, k, 1, 1, out, true, delay || 0, Q0);
    // sortingFudge gốc: số nhỏ hơn vẽ sau (nằm trên), trong cùng một cụm hạt
    out.sort(function (a, b) { return b.fudge - a.fudge; });
    out.forEach(function (e) { list.push(e); });
    return out;
  }
  var VFXL = {}, LAY = {};
  function spawnVfx(list, key, x, y, k, delay) {
    var L = VFXL[key];
    return L ? spawnNode(list, L, x, y, k, delay) : [];
  }
  // Tắt hẳn cụm hạt (GameObject cha bị tắt trong bản gốc): xoá luôn hạt đang bay, khác stop() để hạt sống nốt.
  function killFx(list) { list.forEach(function (e) { e.stopped = true; e.stopReq = true; e.parts.length = 0; }); }
  function tickList(list, dt) {
    for (var i = list.length - 1; i >= 0; i--) { list[i].update(dt); if (!list[i].alive()) list.splice(i, 1); }
  }

  // ---------- nhân vật ----------
  function Actor(ch, x, y, z) {
    this.ch = ch; this.sheet = img(ch.sheet); this.x = x; this.y = y; this.z = z; this.flip = false;
    this.name = null; this.play(Object.keys(ch.anims)[0]);
  }
  Actor.prototype.play = function (name, once, onEnd) {
    if (this.name === name && !once) return;
    var a = this.ch.anims[name];
    if (!a) throw new Error('anim not found: ' + name);
    this.name = name; this.a = a; this.t = 0; this.once = !!once || !a.loop; this.onEnd = onEnd || null; this.done = false;
    this.total = a.frames.reduce(function (s, f) { return s + f[1]; }, 0);
  };
  Actor.prototype.update = function (dt) {
    this.t += dt * 1000;
    if (this.once && this.t >= this.total && !this.done) {
      this.done = true;
      if (this.onEnd) { var f = this.onEnd; this.onEnd = null; f(); }
    }
  };
  Actor.prototype.cell = function () {
    var fr = this.a.frames, t = this.once ? Math.min(this.t, this.total - 1) : this.t % this.total;
    for (var i = 0; i < fr.length; i++) { t -= fr[i][1]; if (t < 0) return fr[i][0]; }
    return fr[fr.length - 1][0];
  };
  Actor.prototype.draw = function (ctx) {
    if (!ok(this.sheet)) return;
    var ch = this.ch, c = this.cell(), cw = ch.cell[0], chh = ch.cell[1];
    var sx = (c % ch.cols) * cw, sy = Math.floor(c / ch.cols) * chh, X = Math.round(this.x), Y = Math.round(this.y) - ch.anchor[1];
    if (this.flip) {
      ctx.save(); ctx.translate(X, 0); ctx.scale(-1, 1);
      ctx.drawImage(this.sheet, sx, sy, cw, chh, -ch.anchor[0], Y, cw, chh);
      ctx.restore();
    } else ctx.drawImage(this.sheet, sx, sy, cw, chh, X - ch.anchor[0], Y, cw, chh);
  };

  // ---------- phòng ----------
  var roomCv = null, roomCtx = null, lightCv = null, roomItems = null, roomFx = [];
  function propFrame(prop, part, t) {
    var an = prop.anims[Object.keys(prop.anims)[0]];
    if (!an || !an.frames) return null;
    var tot = an.frames.reduce(function (s, f) { return s + f[1]; }, 0), ms = (t * 1000) % tot;
    for (var i = 0; i < an.frames.length; i++) { ms -= an.frames[i][1]; if (ms < 0) return prop.frames[an.frames[i][0]] || null; }
    return null;
  }
  function buildRoom() {
    roomItems = [];
    R.layers.forEach(function (l) { roomItems.push({ z: l.z, layer: l, im: img(l.img) }); });
    R.props.forEach(function (pr) {
      pr.parts.forEach(function (part) { roomItems.push({ z: part.order, prop: pr, part: part, im: img(part.img) }); });
      Object.keys(pr.frames).forEach(function (k) { img(pr.frames[k].img); });
    });
    roomFx = [];
    R.emitters.forEach(function (e) {
      var host = R.props.filter(function (p) { return p.name === e.parent || p.animatorPath === e.parent; })[0];
      var z = /tank/i.test(e.parent || '') ? 21 : host ? host.parts[0].order + 0.5 : -399;
      var em = new Emitter(e.particle, e.pos[0], e.pos[1], U * (e.scale || 1), { q: e.q || Q0 });
      roomFx.push(em);
      roomItems.push({ z: z, emitter: em });
    });
  }
  function drawProp(ctx, it, t) {
    var pr = it.prop, part = it.part, an = pr.anims[Object.keys(pr.anims)[0]];
    var fr = propFrame(pr, part, t);
    if (fr) { var fi = img(fr.img); if (ok(fi)) ctx.drawImage(fi, Math.round(part.anchor[0] - fr.pivot[0]), Math.round(part.anchor[1] - fr.pivot[1])); return; }
    if (!ok(it.im)) return;
    var sx = 1, sy = 1, dy = 0;
    if (an && an.curves) {
      var lt = t % an.length;
      an.curves.forEach(function (c) {
        var v = evalKeys(c.keys, lt);
        if (c.attr === 'localScale.x') sx = v; else if (c.attr === 'localScale.y') sy = v; else if (c.attr === 'localPosition.y') dy = -v * U;
      });
    }
    if (sx === 1 && sy === 1) { ctx.drawImage(it.im, part.x, Math.round(part.y + dy)); return; }
    ctx.save();
    ctx.translate(part.anchor[0], part.anchor[1] + dy);
    ctx.scale(sx, sy);
    ctx.drawImage(it.im, part.x - part.anchor[0], part.y - part.anchor[1]);
    ctx.restore();
  }
  // Ánh sáng LightOverlay (DstColor+One): đích + đích × đèn. Nền đen + đèn, nhân với đích, rồi cộng vào.
  function drawLight(ctx, l, im) {
    if (!ok(im)) return;
    if (!lightCv) lightCv = document.createElement('canvas');
    if (lightCv.width < l.w) lightCv.width = l.w;
    if (lightCv.height < l.h) lightCv.height = l.h;
    var x = lightCv.getContext('2d');
    x.globalCompositeOperation = 'source-over';
    x.fillStyle = '#000'; x.fillRect(0, 0, l.w, l.h);
    x.drawImage(im, 0, 0);
    x.globalCompositeOperation = 'multiply';
    x.drawImage(roomCv, l.x, l.y, l.w, l.h, 0, 0, l.w, l.h);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(lightCv, 0, 0, l.w, l.h, l.x, l.y, l.w, l.h);
    ctx.globalCompositeOperation = 'source-over';
  }
  var BG = '#070a12';   // [ĐỀ XUẤT] màu nền thay cho cảnh 3D sau quầy (xem missing.backWall)
  var WORLD_V = { x0: 0, y0: 0, s: 1, ox: 0, oy: 0 };
  function renderRoom(t, actors, worldFx) {
    if (!roomCv) {
      roomCv = document.createElement('canvas'); roomCv.width = RW; roomCv.height = RH;
      roomCtx = roomCv.getContext('2d');
    }
    var ctx = roomCtx;
    ctx.imageSmoothingEnabled = false;
    // Sau quầy trong bản gốc là cảnh 3D (trời, biển) không bóc được: tô nền đặc cùng màu viền đen của khung,
    // để lớp đèn LightOverlay (đích × đèn) không phát sáng trên điểm ảnh trong suốt.
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, RW, RH);
    var items = roomItems.slice();
    actors.forEach(function (a) { items.push({ z: a.z, actor: a }); });
    worldFx.forEach(function (w) { items.push({ z: w.z, emitter: w.em }); });
    items.sort(function (a, b) { return a.z - b.z; });
    items.forEach(function (it) {
      if (it.layer) {
        if (it.layer.blend === 'add') drawLight(ctx, it.layer, it.im);
        else if (ok(it.im)) ctx.drawImage(it.im, it.layer.x, it.layer.y);
      } else if (it.prop) drawProp(ctx, it, t);
      else if (it.emitter) { it.emitter.draw(ctx, WORLD_V); ctx.imageSmoothingEnabled = false; }
      else if (it.actor) it.actor.draw(ctx);
    });
  }

  // ---------- khung nhìn: phủ theo bề ngang, NEAREST ----------
  // [ĐỀ XUẤT] phóng sao cho VIEW_W px phòng (ghế VIP → thùng rượu bên bếp) phủ kín bề ngang màn hình, làm tròn xuống bậc 0,5×
  // để cột điểm ảnh đều; ít nhất MIN_VH dòng phòng phải lọt màn (bong bóng khách, vòng rót trà, quầy, ghế đẩu).
  // Cắt trần từ trên xuống, đáy khung đặt ở VIEW_BOTTOM (sàn dưới quầy); phòng rộng hơn khung thì camera theo Dave.
  var VIEW_W = 870, MIN_VH = 280, VIEW_BOTTOM = 568, SNAP = 0.5;
  var V = { s: 1, x0: 0, y0: 0, ox: 0, oy: 0, vw: RW, vh: RH, camX: RW / 2, dpr: 1 };
  function updateView(W, H, focusX, snap) {
    var s = Math.min(W / VIEW_W, H / MIN_VH);
    if (SNAP) s = Math.max(SNAP, Math.round(s / SNAP) * SNAP);
    var vw = W / s, vh = H / s;
    V.s = s; V.vw = vw; V.vh = vh;
    if (vh >= RH) { V.y0 = 0; V.oy = Math.floor((H - RH * s) / 2); }
    else { V.y0 = Math.round(clamp(VIEW_BOTTOM - vh, 0, RH - vh)); V.oy = 0; }
    if (vw >= RW) { V.x0 = 0; V.ox = Math.floor((W - RW * s) / 2); V.camX = RW / 2; }
    else {
      var tx = clamp(focusX - vw / 2, 0, RW - vw);
      V.camX = snap ? tx : V.camX + (tx - V.camX) * 0.12;
      V.x0 = Math.round(V.camX); V.ox = 0;
    }
  }
  function toStage(x, y) { return { x: (x - V.x0) * V.s + V.ox, y: (y - V.y0) * V.s + V.oy }; }
  function toRoom(cx, cy) { return { x: (cx * V.dpr - V.ox) / V.s + V.x0, y: (cy * V.dpr - V.oy) / V.s + V.y0 }; }
  function blitRoom(ctx, W, H) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    var sw = Math.min(RW - V.x0, Math.ceil(V.vw) + 1), shh = Math.min(RH - V.y0, Math.ceil(V.vh) + 1);
    ctx.drawImage(roomCv, V.x0, V.y0, sw, shh, V.ox, V.oy, sw * V.s, shh * V.s);
  }

  // ---------- nạp tài nguyên ----------
  var UI_LAYOUTS = ['customerAction', 'daveAction', 'staffAction', 'customerTalk', 'hudWatch', 'openAlarm', 'openAlarmFx'];
  var VFX_KEYS = ['cookSmoke_JungleDLC', 'coinAbsorb', 'addGold', 'likeHeart', 'eatHappy', 'customerPop', 'customerFail',
    'teaPerfect', 'teaGood', 'teaBad', 'cookingSlot', 'cookingSlotStart', 'daveSmile'];
  var assetsP = null, assetsReady = false;
  function json(p) {
    return fetch(url(p)).then(function (r) { if (!r.ok) throw new Error('layout not found: ' + p); return r.json(); });
  }
  function collectTex(n, set) {
    if (n.particle && renderable(n)) {
      var Rd = n.particle.render, t = Rd.texture;
      set[TEX[t] || SPR[t]] = 1;
      // ảnh phụ của shader riêng (MainTex / FlowTex của hơi nước Bancho)
      Object.keys(Rd.props || {}).forEach(function (k) { var v = Rd.props[k]; if (typeof v === 'string' && TEX[v]) set[TEX[v]] = 1; });
    }
    if (n.img && n.img.sprite && SPR[n.img.sprite]) set[SPR[n.img.sprite]] = 1;
    (n.children || []).forEach(function (c) { collectTex(c, set); });
  }
  function loadAssets() {
    if (assetsP) return assetsP;
    var set = {};
    R.layers.forEach(function (l) { set[l.img] = 1; });
    R.props.forEach(function (p) { p.parts.forEach(function (q) { set[q.img] = 1; }); Object.keys(p.frames).forEach(function (k) { set[p.frames[k].img] = 1; }); });
    Object.keys(R.emitterTextures).forEach(function (k) { set[R.emitterTextures[k].img] = 1; });
    [BA.dave, BA.bancho, BA.cat].forEach(function (c) { set[c.sheet] = 1; });
    BA.customers.forEach(function (c) { set[c.sheet] = 1; });
    set[BA.tea.img] = 1; set[BA.tea.orderBubble.img] = 1;
    ['Coin32', 'GD_Icon_s', 'UI_TIP_Icon', 'Space_Key_Dark_Symbol', 'Mouse_Simple_Key_Dark', 'UI_QTE_Lever_Arrow_Big', 'UI_SushiOpenText']
      .forEach(function (n) { set[SPR[n]] = 1; });
    // mesh của hạt dạng mesh: nạp trước bố cục VFX để Emitter dựng được ngay
    var meshes = [BA.vfx.meshes || {}, R.emitterMeshes || {}];
    var meshJobs = [];
    meshes.forEach(function (tbl) { Object.keys(tbl).forEach(function (k) { meshJobs.push(json(tbl[k]).then(function (m) { MESH[k] = m; })); }); });
    var jobs = UI_LAYOUTS.map(function (k) { return json('art/bar/ui/layout/' + k + '.json').then(function (L) { LAYOUT_SET(k, L); collectTex(L, set); }); })
      .concat(VFX_KEYS.map(function (k) { return json(BA.vfx.systems[k].layout).then(function (L) { VFXL[k] = L; collectTex(L, set); }); }));
    assetsP = Promise.all(meshJobs.concat(jobs)).then(function () {
      return Promise.all(Object.keys(set).filter(Boolean).map(waitImg));
    }).then(function () { assetsReady = true; });
    assetsP.catch(function (e) { HX.game.errors.push(String(e)); console.error(e); });
    return assetsP;
  }
  function LAYOUT_SET(k, L) { LAY[k] = L; }

  // Tiếng quán: khoá bar_* ghép vào bảng tiếng chung lúc cần (không nạp sẵn lúc mở trang).
  var audioP = null;
  function loadAudio() {
    if (audioP) return audioP;
    var A = window.HX_ASSETS.audio, keys = Object.keys(BA.audio).map(function (k) {
      A['bar_' + k] = { src: BA.audio[k].src };
      return 'bar_' + k;
    });
    audioP = HX.audio.load(keys).catch(function (e) { HX.game.errors.push(String(e)); });
    return audioP;
  }
  function sfx(key, vol) { HX.audio.play('bar_' + key, { vol: vol == null ? 1 : vol }); }

  // ---------- thực đơn ----------
  // Loài không có món gốc (Cow_Pattern_Snapper) thì ghép "Sushi " + tên cá tiếng Việt [ĐỀ XUẤT].
  function viName(sp) {
    var rec = dishRecord(sp);
    return rec && VI_DISH[rec.nameKey] || 'Sushi ' + HX.fish.displayName(sp).toLowerCase();
  }
  function dishRecord(sp) { var d = BA.dishes[sp.tid] || BA.dishes[sp.id]; return d && typeof d === 'object' ? d : null; }
  // Mỗi loài trong tủ một món (giá, ảnh qua HX_META.dishOf); số suất = số con × HX_META.servingsOf.
  function buildMenu(fridge) {
    return Object.keys(fridge).filter(function (id) { return HX.fish.BY_ID[id]; }).map(function (id) {
      var sp = HX.fish.BY_ID[id], per = M.servingsOf(sp), dish = M.dishOf(sp, HX.fish.displayName(sp)), rec = dishRecord(sp);
      return {
        id: id, sp: sp, dish: dish, name: viName(sp), en: rec ? rec.name : dish.name, icon: rec ? rec.icon : null,
        img: dish.img, price: dish.price, fish: fridge[id], per: per, servings: per * fridge[id], sold: 0, pending: 0,
      };
    }).sort(function (a, b) { return b.price - a.price || a.id.localeCompare(b.id); });
  }
  function slots() { return T.menuSlots; }

  // ---------- DOM ----------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function spr(name, cls) {
    var i = el('img', cls || null);
    i.alt = ''; i.draggable = false;
    var s = spriteSrc(name);
    if (s) i.src = url(s);
    return i;
  }
  // 9 mảnh bằng border-image, cỡ viền nhân --k (px CSS mỗi px UI gốc). Ảnh đã nhuộm thì dùng dataURL.
  function nineCss(e, name, tint) {
    var b = borderOf(name) || [0, 0, 0, 0], src = url(spriteSrc(name));
    e.style.borderStyle = 'solid';
    e.style.borderWidth = 'calc(' + b[3] + 'px * var(--k)) calc(' + b[2] + 'px * var(--k)) calc(' + b[1] + 'px * var(--k)) calc(' + b[0] + 'px * var(--k))';
    function set(u) { e.style.borderImage = 'url("' + u + '") ' + b[3] + ' ' + b[2] + ' ' + b[1] + ' ' + b[0] + ' fill stretch'; }
    set(src);
    if (tint) waitImg(spriteSrc(name)).then(function () { var cv = tinted(sprite(name), tint); if (cv.toDataURL) set(cv.toDataURL()); });
    return e;
  }
  // Ảnh nền CSS (lát gạch, giấy) đưa vào biến CSS --<tên sprite> để bar.css dùng được url có ?v=.
  var ART_VARS = ['UI_SushiBar_Menu_Texture_paper01', 'UI_SushiBar_Menu_Pattern01', 'UI_SushiBar_Menu_Pattern02'];
  function setArt(root) { ART_VARS.forEach(function (n) { root.style.setProperty('--' + n, 'url("' + new URL(url(SPR[n]), document.baseURI).href + '")'); }); }
  function tintImg(e, name, tint) { waitImg(spriteSrc(name)).then(function () { var cv = tinted(sprite(name), tint); if (cv.toDataURL) e.src = cv.toDataURL(); }); return e; }
  // 9 mảnh làm lớp nền (chữ phủ lên cả phần viền, như Text đặt chồng lên Image trong prefab gốc)
  function nineBg(e, name, tint) {
    var b = el('div', 'bx-9');
    nineCss(b, name, tint);
    e.insertBefore(b, e.firstChild);
    e.classList.add('bx-has9');
    return e;
  }
  function uiScale() { return clamp(innerHeight / 1080, 0.55, 1.2); }
  function setScale(root, mul) { var u = uiScale(); root.style.setProperty('--u', u.toFixed(3)); root.style.setProperty('--k', (u * (mul || 1)).toFixed(3)); }
  function rgb(c) { return 'rgb(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ')'; }
  function button(id, cls, text, sprName) {
    var b = el('button', 'bx-btn ' + cls);
    b.id = id;
    nineCss(b, sprName);
    b.appendChild(el('span', null, text));
    return b;
  }
  function dishIcon(m, cls) {
    var i = el('img', cls || 'bx-dish');
    i.alt = ''; i.draggable = false;
    if (m.img) i.src = url(m.img);
    else HX.game.loaded.then(function () { i.src = HX.fish.iconFor(HX.game.gfx, m.sp); });
    return i;
  }

  // ---------- cảnh sau quầy (dùng chung cho bếp và sổ) ----------
  var scene = null;   // {dave, bancho, cat, fx: {world: [], ui: [], screen: []}, t}
  function newScene() {
    if (!roomItems) buildRoom();
    var s = {
      t: 0,
      dave: new Actor(BA.dave, 600, DAVE_Y, BA.dave.sortingOrder + 0.2),
      bancho: new Actor(BA.bancho, BANCHO[0], BANCHO[1], BA.bancho.sortingOrder + 0.1),
      cat: new Actor(BA.cat, CAT_POS[0], CAT_POS[1] + BA.cat.anchor[1], BA.cat.sortingOrder + 0.1),
      catT: 6, fx: { world: [], ui: [], screen: [] },
    };
    s.dave.play('Idle1'); s.bancho.play('Idle'); s.cat.play('Idle');
    return s;
  }
  // [ĐỀ XUẤT] Momo đổi dáng ngồi mỗi 5–9 giây bằng các clip gốc; bấm vào thì Momo ngó ra (Watch) và kêu.
  var CAT_IDLES = ['Idle02', 'Idle03', 'Relex', 'Watch', 'Idle'];
  function tickCat(s, dt) {
    s.cat.update(dt);
    s.catT -= dt;
    if (s.catT <= 0) {
      s.catT = 5 + rnd() * 4;
      var n = CAT_IDLES[Math.floor(rnd() * CAT_IDLES.length)];
      s.cat.play(n, true, function () { s.cat.play('Idle'); });
    }
  }
  function worldFxItems(s) {
    return s.fx.world.map(function (e) { return { z: e.z != null ? e.z : 41, em: e }; });
  }
  function drawScene(s, extraActors, focusX, snap) {
    var S = HX.game.stage2d, ctx = S.ctx, W = S.canvas.width, H = S.canvas.height;
    V.dpr = S.dpr || 1;
    if (!assetsReady) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#070a12'; ctx.fillRect(0, 0, W, H); return null; }
    var actors = [s.bancho, s.cat, s.dave].concat(extraActors || []);
    renderRoom(s.t, actors, worldFxItems(s));
    updateView(W, H, focusX == null ? RW / 2 : focusX, snap);
    blitRoom(ctx, W, H);
    return ctx;
  }
  function drawUiFx(ctx, s) {
    s.fx.ui.forEach(function (e) { e.draw(ctx, V); });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    var id = { x0: 0, y0: 0, s: 1, ox: 0, oy: 0 };
    s.fx.screen.forEach(function (e) { e.draw(ctx, id); });
  }
  function tickScene(s, dt) {
    s.t += dt;
    roomFx.forEach(function (e) { e.update(dt); });
    s.dave.update(dt); s.bancho.update(dt);
    tickCat(s, dt);
    tickList(s.fx.world, dt); tickList(s.fx.ui, dt); tickList(s.fx.screen, dt);
  }
  function cookSmoke(s) {
    var L = VFXL.cookSmoke_JungleDLC;
    if (!L) return;
    var out = spawnNode([], L, BANCHO[0], BANCHO[1] - 50, U);
    out.forEach(function (e) { e.z = BA.bancho.sortingOrder + 0.15; s.fx.world.push(e); });
  }

  // ---------- nhập liệu ----------
  var keys = {};
  function onKey(e, down) {
    var ph = HX.game && HX.game.phase;
    if (ph !== 'bar') return;
    var c = e.code;
    if (down) {
      if (c === 'Space' || c === 'ArrowLeft' || c === 'ArrowRight') e.preventDefault();
      if (e.repeat) return;
      keys[c] = true;
      HX.audio.unlock();
      if (c === 'KeyE' || c === 'Space' || c === 'Enter') barAction(true);
      if (c === 'KeyQ') dumpPlate();
    } else {
      keys[c] = false;
      if (c === 'KeyE' || c === 'Space' || c === 'Enter') barRelease();
    }
  }
  addEventListener('keydown', function (e) { onKey(e, true); });
  addEventListener('keyup', function (e) { onKey(e, false); });
  addEventListener('blur', function () { keys = {}; barRelease(); });
  function holdingAction() { return !!(keys.KeyE || keys.Space || keys.Enter || pointerHeld); }
  var pointerHeld = false;
  (function bindPointer() {
    var cv = document.getElementById('stage2d');
    if (!cv) return;
    cv.addEventListener('pointerdown', function (e) {
      if (!HX.game || HX.game.phase !== 'bar') return;
      HX.audio.unlock();
      pointerHeld = true;
      barTap(e.clientX, e.clientY);
    });
    addEventListener('pointerup', function () { if (pointerHeld) { pointerHeld = false; barRelease(); } });
    addEventListener('pointercancel', function () { if (pointerHeld) { pointerHeld = false; barRelease(); } });
  })();

  // =====================================================================================
  // pha kitchen: chọn món cho thực đơn tối nay, Bancho đứng bếp (Cook + khói), nút "Mở quán"
  // =====================================================================================
  var K = null;
  function kitchenBuild() {
    var root = HX.game.screen('kitchen'), s = HX.save.get();
    root.innerHTML = '';
    root.className = 'screen bk';
    setScale(root, 0.9);
    setArt(root);
    var row = el('div', 'bk-row');

    // TODAY'S MENU (Management_Recipes / Contents_02)
    var menu = nineCss(el('div', 'bk-menu'), 'UI_SushiBar_Menu_MenuPanel');
    menu.appendChild(el('div', 'bk-paper'));
    var top = el('div', 'bk-toppat');
    menu.appendChild(top);
    var title = el('div', 'bk-title');
    title.appendChild(tintImg(spr('UI_Sushi_Menu_TitleDeco', 'bk-deco'), 'UI_Sushi_Menu_TitleDeco', [0.239, 0.212, 0.153]));
    title.appendChild(el('span', null, 'Thực đơn hôm nay'));
    title.appendChild(tintImg(spr('UI_Sushi_Menu_TitleDeco', 'bk-deco'), 'UI_Sushi_Menu_TitleDeco', [0.239, 0.212, 0.153]));
    menu.appendChild(title);
    K.sub = el('span');
    menu.appendChild(nineBg(el('div', 'bk-sub'), 'UI_Sushi_BoxR4', [0.934, 0.88, 0.85])).appendChild(K.sub);
    K.cells = el('div', 'bk-cells');
    menu.appendChild(K.cells);
    row.appendChild(menu);

    // tủ cá (RecipeController: UI_Sushi_Pop_Panel)
    var fr = nineCss(el('div', 'bk-fridge'), 'UI_Sushi_Pop_Panel');
    var head = el('div', 'bk-head');
    head.appendChild(el('span', null, 'Tủ cá · ngày ' + s.day));
    fr.appendChild(head);
    var list = el('div', 'bk-list br-list');
    if (!K.all.length) list.appendChild(el('p', 'br-empty', 'Tủ cá trống. Tối nay quán chỉ rót trà.'));
    K.rows = K.all.map(function (m) {
      var r = nineCss(el('div', 'br-row'), 'UI_Sushi_Recipe_Menu_box');
      r.dataset.id = m.id;
      r.appendChild(dishIcon(m));
      var t = el('div', 'br-txt');
      t.appendChild(el('b', null, m.name));
      var meta = el('small');
      meta.appendChild(spr('UI_Sushi_AmountIcon', 'bx-ic'));
      meta.appendChild(document.createTextNode(m.servings + ' suất · ' + m.fish + ' con  '));
      meta.appendChild(spr('Coin24', 'bx-ic'));
      meta.appendChild(document.createTextNode(m.price + '/suất'));
      t.appendChild(meta);
      r.appendChild(t);
      var mark = nineCss(el('div', 'bk-focus'), 'UI_Sushi_FocusStroke');
      r.appendChild(mark);
      r.addEventListener('click', function () { kitchenToggle(m); });
      list.appendChild(r);
      return r;
    });
    fr.appendChild(list);
    var foot = el('div', 'bk-foot');
    K.bancho = spr('NPC_Bancho_Confirm01', 'bk-bancho');
    foot.appendChild(K.bancho);
    var go = button('kitchen-open', 'bx-pink', 'Mở quán', 'UI_btn_pink');
    go.addEventListener('click', function () {
      if (K.opening) return;
      K.opening = true;
      sfx('open');
      HX.game.go('bar', { menu: K.menu.slice() });
    });
    foot.appendChild(go);
    fr.appendChild(foot);
    row.appendChild(fr);
    root.appendChild(row);
    kitchenCells();
  }
  function kitchenCells() {
    K.cells.innerHTML = '';
    for (var i = 0; i < slots(); i++) {
      var m = K.menu[i], c;
      if (m) {
        c = el('div', 'bk-cell on');
        c.style.backgroundImage = 'url("' + url(SPR.UI_Sushi_Menu_Listbar) + '")';
        c.dataset.id = m.id;
        var ic = el('div', 'bk-ic');
        ic.appendChild(dishIcon(m));
        c.appendChild(ic);
        var info = el('div', 'bk-info');
        var nb = nineBg(el('div', 'bk-name'), 'UI_Sushi_MenuTitleBg', [0.8, 0.216, 0.463]);
        nb.appendChild(el('span', null, m.name));
        info.appendChild(nb);
        var pr = el('div', 'bk-price');
        pr.appendChild(spr('UI_Sushi_AmountIcon', 'bx-ic'));
        pr.appendChild(el('span', 'bk-amt', m.servings + ' suất'));
        pr.appendChild(spr('Coin24', 'bx-ic'));
        pr.appendChild(el('b', null, String(m.price)));
        info.appendChild(pr);
        c.appendChild(info);
        c.addEventListener('click', kitchenToggle.bind(null, m));
      } else {
        c = el('div', 'bk-cell');
        c.style.backgroundImage = 'url("' + url(SPR.UI_Sushi_Menu_Listbar_Empty) + '")';
        c.appendChild(tintImg(spr('UI_Sushi_MenuList_AddMark', 'bk-add'), 'UI_Sushi_MenuList_AddMark', [0.439, 0.388, 0.365]));
        c.appendChild(el('span', 'bk-empty', 'Ô trống · chọn món bên tủ cá'));
      }
      K.cells.appendChild(c);
    }
    K.rows.forEach(function (r, i) { r.classList.toggle('on', K.menu.indexOf(K.all[i]) >= 0); });
    var n = K.menu.reduce(function (a, m) { return a + m.servings; }, 0);
    K.sub.textContent = K.menu.length + '/' + slots() + ' món · ' + n + ' suất · trà ' + M.stat(HX.save.get(), 'tea') + ' vàng';
  }
  function kitchenToggle(m) {
    var i = K.menu.indexOf(m);
    if (i >= 0) K.menu.splice(i, 1);
    else if (K.menu.length < slots()) K.menu.push(m);
    else { sfx('dump', 0.6); return; }
    sfx('read_menu', 0.7);
    kitchenCells();
  }

  HX.phases.kitchen = {
    surface: '2d',
    enter: function () {
      var s = HX.save.get();
      var all = buildMenu(s.fridge);
      // [ĐỀ XUẤT] thực đơn tự điền món đắt trước (bản gốc có dấu "Auto" cho ô tự chọn); bấm để bỏ / thêm
      K = { all: all, menu: all.slice(0, slots()), t: 0, opening: false, smokeT: 0.5 };
      scene = newScene();
      scene.dave.x = 640;
      scene.bancho.play('Cook');
      kitchenBuild();
      loadAssets();
      loadAudio().then(function () { if (HX.game.phase === 'kitchen') HX.audio.music('bar_bgm_day', 0.6); });
    },
    exit: function () { HX.audio.stopMusic(0.4); },
    update: function (dt) {
      if (!K || !scene) return;
      K.t += dt;
      if (assetsReady) {
        tickScene(scene, dt);
        K.smokeT -= dt;
        if (K.smokeT <= 0) { K.smokeT = 7.5; cookSmoke(scene); sfx('chop', 0.5); }
      }
      var clip = BA.ui.clips['Bancho_Confirm_AnimCtrl/Bancho_Confirm_Anim'];
      var f = spriteKeyAt(clip, K.t);
      if (K.bancho && K.bancho.dataset.f !== f) { K.bancho.dataset.f = f; K.bancho.src = url(SPR[f]); }
    },
    render: function () {
      if (!scene) return;
      var ctx = drawScene(scene, [], 640, true);
      if (ctx) drawUiFx(ctx, scene);
    },
  };

  // =====================================================================================
  // pha bar: khách vào, gọi món / trà, Bancho làm món, Dave bưng, khách ăn, trả tiền
  // =====================================================================================
  var N = null;   // đêm đang bán
  function openSeats(s) {
    var n = clamp(Math.round(M.stat(s, 'seats')), 1, SEAT_ORDER.length);
    return SEAT_ORDER.slice(0, n).map(function (k) { return SEATS[k]; });
  }
  function newNight(menu) {
    var s = HX.save.get();
    return {
      menu: menu, t: 0, open: true, closing: false, over: false,
      seats: openSeats(s), customers: [], plates: [], uid: 0, pid: 0,
      spawnT: T.firstGuest,
      served: 0, dishes: 0, tips: 0, tea: 0, teaN: 0, angry: 0, likes: 0, events: [],
      gold0: s.gold, credited: 0, shownGold: s.gold,
      chef: M.stat(s, 'chef'), decor: M.stat(s, 'decor'), teaPrice: M.stat(s, 'tea'),
      dave: { x: 620, target: null, carry: [], walkT: 0, idleT: 0, face: 1 },
      qte: null, pops: [], openT: 0, ts: 1,
    };
  }
  function earned() { return N ? N.dishes + N.tips + N.tea : 0; }
  function seatX(seat) { return seat.sit[0]; }
  function seatFree(seat) { return !N.customers.some(function (c) { return c.seat === seat && c.st !== 'leave'; }); }
  function waiting(c) { return c.st === 'order' || c.st === 'angry'; }
  function dishPending(m) { return N.customers.filter(function (c) { return waiting(c) && c.order && c.order.m === m; }).length; }
  function platesOf(m) { return N.plates.filter(function (p) { return p.m === m; }).length; }
  function avail(m) { return m.servings - m.sold - m.pending; }

  function spawnCustomer(force) {
    force = force || {};
    var free = N.seats.filter(seatFree);
    if (force.seat) free = free.filter(function (s) { return s.name === force.seat; });
    if (!free.length) return null;
    var seat = free[Math.floor(rnd() * free.length)];
    var present = N.customers.map(function (c) { return c.ch.id; });
    var pool = BA.customers.filter(function (c) { return present.indexOf(c.id) < 0; });
    var ch = force.id ? BA.customers.filter(function (c) { return c.id === force.id; })[0] : pool[Math.floor(rnd() * pool.length)];
    var z = seat.isFront ? ch.layer.frontLayerOrder : ch.layer.backLayerOrder;
    var a = new Actor(ch, DOOR_X - 20, seat.sit[1], z + 0.1 + N.uid * 0.001);
    a.play('walk');
    var c = {
      id: ++N.uid, ch: ch, seat: seat, st: 'enter', t: 0, actor: a, order: null, happy: true, p: 1,
      eat: EAT[ch.data.EatLevel] || EAT[1], speed: ch.data.EnterSpeed * U, force: force,
      bubbleT: 0, fxT: 0, pay: null, feedback: null, gauge: 0,
    };
    N.customers.push(c);
    sfx(['enter_talk1', 'enter_talk2', 'enter_talk3'][Math.floor(rnd() * 3)], 0.8);
    return c;
  }
  function anim(c, base) {
    var name = (c.seat.isFront ? 'back_' : '') + base;
    if (!c.ch.anims[name]) name = base;
    return name;
  }
  function setSt(c, st) { c.st = st; c.t = 0; }
  // Câu nói trên đầu khách (CustomerToastTalk [DtD]): lúc chờ món, lúc giận, lúc ăn. Mỗi loại có xác suất, giây chờ
  // trước khi hiện và giây hiện. Dùng Math.random (không đụng hạt giống của khách, vì chỉ để nhìn).
  var TALK_STATES = { waiting: ['order'], angry: ['angry'], eating: ['eat', 'like'] };
  function say(c, kind) {
    var d = c.ch.talk && c.ch.talk[kind];
    c.talk = null;
    if (!d || !d.lines.length || Math.random() >= d.chance) return;
    var ln = d.lines[Math.floor(Math.random() * d.lines.length)];
    c.talk = { kind: kind, wait: d.preDelay, show: d.showTime, t: 0, key: ln[0], text: VI_TALK[ln[0]] || ln[1] };
  }
  function tickTalk(c, dt) {
    var k = c.talk;
    if (!k) return;
    if (TALK_STATES[k.kind].indexOf(c.st) < 0) { c.talk = null; return; }
    if (k.wait > 0) { k.wait -= dt; return; }
    // [ĐỀ XUẤT] khách ngồi sát nhau: chờ người bên cạnh nói xong rồi mới hiện, để hai dòng chữ không đè lên nhau
    if (k.t === 0 && N.customers.some(function (o) {
      return o !== c && o.talk && o.talk.t > 0 && Math.abs(o.seat.anchor[0] - c.seat.anchor[0]) < 170;
    })) return;
    k.t += dt;
    if (k.t >= k.show) c.talk = null;
  }
  function decideOrder(c) {
    var menus = N.menu.filter(function (m) { return avail(m) > 0; });
    var teaOk = !c.seat.noDrinkQTE && N.teaPrice > 0;
    var wantTea = c.force.tea != null ? c.force.tea : teaOk && rnd() < c.ch.data.OrderDrinkChance;   // [DtD] OrderDrinkChance
    if (c.force.dish) menus = menus.filter(function (m) { return m.id === c.force.dish; });
    if (wantTea && teaOk) return { kind: 'tea' };
    if (menus.length) return { kind: 'dish', m: menus[Math.floor(rnd() * menus.length)] };
    return teaOk ? { kind: 'tea' } : null;
  }
  function placeOrder(c) {
    var o = decideOrder(c);
    if (!o) { leave(c, false); return; }
    c.order = o;
    setSt(c, 'order');
    say(c, 'waiting');
    c.actor.play(anim(c, 'wait'));
    if (o.kind === 'dish') {
      o.m.pending++;
      var need = dishPending(o.m) - platesOf(o.m);
      if (need > 0) N.plates.push({ id: ++N.pid, m: o.m, st: 'queued', t: 0, dur: T.cook / N.chef });
    }
  }
  function leave(c, angry) {
    if (waiting(c) && c.order && c.order.kind === 'dish') c.order.m.pending--;
    if (angry) {
      N.angry++;
      N.events.push({ type: 'angry', cid: c.id, seat: c.seat.name });
      var b = bubbleAt(c);
      spawnVfx(N.fx.ui, 'customerFail', b.x, b.y, UIK);
      sfx('drink_bad', 0.5);
    }
    setSt(c, 'leave');
    c.angry = angry;
    c.actor.play(angry ? anim(c, 'anger') : 'walk');
    c.leaveDelay = angry ? 0.9 : 0;
    c.speed = (angry ? c.ch.data.AngryExitSpeed : c.ch.data.ExitSpeed) * U;
    if (c.popFx) { killFx(c.popFx); c.popFx = null; }
    if (c.eatFx) { c.eatFx.forEach(function (e) { e.stop(); }); c.eatFx = null; }
  }
  // Toạ độ phòng của gốc UI khách (điểm neo ghế gốc) và bong bóng.
  function bubbleAt(c) { return { x: c.seat.anchor[0], y: c.seat.anchor[1] - 19 }; }

  function tickCustomer(c, dt) {
    var E = c.eat, a = c.actor;
    c.t += dt;
    a.update(dt);
    switch (c.st) {
      case 'enter': {
        var tx = seatX(c.seat), d = tx - a.x, step = c.speed * dt;
        a.flip = d > 0;
        if (Math.abs(d) <= step) { a.x = tx; a.flip = false; setSt(c, 'sit'); a.play(anim(c, 'wait')); }
        else a.x += Math.sign(d) * step;
        break;
      }
      case 'sit':
        if (c.t >= E.PreOrderDelay) { setSt(c, 'menu'); a.play(anim(c, 'menu')); sfx('read_menu', 0.5); }
        break;
      case 'menu':
        if (c.t >= E.OrderTime) placeOrder(c);
        break;
      case 'order': {
        if (N.qte && N.qte.c === c) break;
        var lim = c.order.kind === 'tea' ? E.MaxDrinkWaitTime : E.MaxServingWaitTime;
        c.gauge = c.t / lim;
        if (c.t >= lim) { setSt(c, 'angry'); a.play(anim(c, 'anger')); c.happy = false; say(c, 'angry'); }
        break;
      }
      case 'angry': {
        if (N.qte && N.qte.c === c) break;
        var lim2 = c.order.kind === 'tea' ? E.MaxEndureDrinkWaitTime : E.MaxEndureAngerTime;
        c.gauge = 0.13 + 0.87 * c.t / lim2;   // [DtD] CustomerActionAngry.m_InitGaugeVal = 0.13
        if (c.t >= lim2) leave(c, true);
        break;
      }
      case 'eat':
        c.fxT -= dt;
        if (c.fxT <= 0) { c.fxT = 1.4 + rnd(); sfx(['eat1', 'eat2', 'eat3'][Math.floor(rnd() * 3)], 0.55); }
        if (c.t >= E.EatingTime) {
          setSt(c, 'like');
          a.play(anim(c, 'happy'));
          if (c.eatFx) { c.eatFx.forEach(function (e) { e.stop(); }); c.eatFx = null; }
          if (c.happy) { N.likes++; sfx('like', 0.8); }
          c.likeFxDone = false;
        }
        break;
      case 'like': {
        var clip = clipAt('EatGaugeAni/EatGaugeEndAnimation');
        if (!c.likeFxDone && c.t >= 0.208) {   // [DtD] sự kiện OnAnimShowParticle của clip
          c.likeFxDone = true;
          var L = LAY.customerAction, pos = nodePos(L, ['AtTable', 'EatGaugeAni', 'LikePop_Particle']);
          if (c.happy) spawnNode(N.fx.ui, pos.node, c.seat.anchor[0] + pos.x * UIK, c.seat.anchor[1] - pos.y * UIK, UIK * pos.s);
        }
        if (c.t >= clip.length + E.AfterEatDelay) pay(c);
        break;
      }
      case 'pay':
        payTick(c);
        if (c.t >= 1.3) leave(c, false);
        break;
      case 'leave': {
        if (c.leaveDelay > 0) { c.leaveDelay -= dt; if (c.leaveDelay <= 0) a.play('walk'); break; }
        var sx = DOOR_X - 40;
        a.flip = false;
        a.x -= c.speed * dt;
        if (a.x <= sx) c.gone = true;
        break;
      }
    }
    if (c.feedback) { c.feedback.t += dt; if (c.feedback.t > 1) c.feedback = null; }
    tickTalk(c, dt);
  }

  // Phục vụ món: khách vui (còn kiên nhẫn) hay chỉ mỉm cười (đã giận), rồi ăn.
  function serveDish(c, plate) {
    var d = N.dave;
    d.carry.splice(d.carry.indexOf(plate), 1);
    N.plates.splice(N.plates.indexOf(plate), 1);
    var m = c.order.m;
    m.pending--; m.sold++;
    c.p = c.st === 'order' ? clamp(1 - c.t / c.eat.MaxServingWaitTime, 0, 1) : 0;
    c.happy = c.st === 'order';
    c.feedback = { kind: c.happy ? 'happy' : 'smile', t: 0, fx: false };
    setSt(c, 'eat');
    c.actor.play(anim(c, 'eat'));
    say(c, 'eating');
    c.fxT = 0.3;
    sfx(rnd() < 0.5 ? 'serve' : 'serve2', 0.8);
    if (c.happy) {
      var L = LAY.customerAction, pos = nodePos(L, ['AtTable', 'EatGaugeAni', 'EatRoot', 'HppyParticleParent']);
      c.eatFx = spawnVfx(N.fx.ui, 'eatHappy', c.seat.anchor[0] + pos.x * UIK, c.seat.anchor[1] - pos.y * UIK, UIK);
    }
    N.events.push({ type: 'serve', cid: c.id, dish: m.id, happy: c.happy });
  }
  function pay(c) {
    var price, tip, kind = c.order.kind;
    if (kind === 'dish') {
      price = c.order.m.price;
      tip = Math.max(0, Math.round(price * (N.decor - 1 + T.tipK * c.p)));
      N.dishes += price; N.tips += tip; N.served++;
    } else {
      var g = c.teaGrade;
      price = g === 'bad' ? Math.round(N.teaPrice * T.teaBad) : N.teaPrice;
      tip = g === 'perfect' ? Math.round(N.teaPrice * (N.decor - 1 + T.tipK)) : 0;
      N.tea += price + tip; N.teaN++;
    }
    setSt(c, 'pay');
    c.actor.play(anim(c, kind === 'tea' && c.teaGrade === 'bad' ? 'wait' : 'happy'), true);
    c.pay = { price: price, tip: tip, popped: false, tipPopped: false, credited: false };
    N.events.push({ type: 'pay', cid: c.id, kind: kind, dish: kind === 'dish' ? c.order.m.id : 'tea', price: price, tip: tip,
      grade: c.teaGrade || null, patience: c.p, t: N.t });
    sfx('pay', 0.8);
  }
  function payTick(c) {
    var P = c.pay, L = LAY.customerAction, t = c.t;
    if (!P.popped && t >= 0.06) {   // [DtD] OnAnimShowParticle ở 0,06 s của GoldFadeOutAnimation
      P.popped = true;
      var pos = nodePos(L, ['GivePay_Set', 'PaymentRoot', 'GoldPop_Particle']);
      spawnNode(N.fx.ui, pos.node, c.seat.anchor[0] + pos.x * UIK, c.seat.anchor[1] - pos.y * UIK, UIK * pos.s);
      sfx('coin', 0.7);
    }
    if (P.tip && !P.tipPopped && t >= T.tipDelay + 0.06) { P.tipPopped = true; sfx('tip', 0.7); }
    // [DtD] clip CoinAbsorb: vàng hút vào ô tiền từ 0,567 s tới 0,767 s
    if (!P.absorbed && t >= 0.567) { P.absorbed = true; hudBurst('coinAbsorb'); }
    if (!P.credited && t >= 0.767) { P.credited = true; N.credited += P.price + P.tip; hudBurst('addGold'); }
  }
  function hudBurst(key) {
    var g = N.ui && N.ui.coin;
    if (!g) return;
    var r = g.getBoundingClientRect(), dpr = V.dpr, u = uiScale();
    spawnVfx(N.fx.screen, key, (r.left + r.width / 2) * dpr, (r.top + r.height / 2) * dpr, u * dpr);
  }

  // ---------- Bancho ----------
  function tickKitchen(dt) {
    var b = scene.bancho, cooking = N.plates.filter(function (p) { return p.st === 'cooking'; })[0];
    if (!cooking) {
      cooking = N.plates.filter(function (p) { return p.st === 'queued'; })[0];
      if (cooking) {
        cooking.st = 'cooking'; cooking.t = 0;
        b.play('Cook');
        cookSmoke(scene);
        sfx('chop', 0.6);
        slotFx(cooking, 'cookingSlotStart');
      }
    }
    if (cooking) {
      cooking.t += dt;
      if (cooking.t >= cooking.dur) {
        cooking.st = 'ready';
        N.events.push({ type: 'ready', plate: cooking.id, dish: cooking.m.id });
        sfx(rnd() < 0.5 ? 'food_ready1' : 'food_ready2', 0.8);
        slotFx(cooking, 'cookingSlot');
        var more = N.plates.some(function (p) { return p.st === 'queued'; });
        if (!more) b.play('Cook_Result', true, function () { if (scene.bancho.name === 'Cook_Result') scene.bancho.play('Idle'); });
      }
    } else if (b.name !== 'Idle' && b.name !== 'Cook_Result') b.play('Idle');
  }
  function slotFx(plate, key) {
    var e = N.ui && N.ui.slotEls[plate.id];
    if (!e) { N.pendingSlotFx = N.pendingSlotFx || []; N.pendingSlotFx.push([plate.id, key]); return; }
    var r = e.getBoundingClientRect(), dpr = V.dpr, u = uiScale();
    if (!r.width) return;
    spawnVfx(N.fx.screen, key, (r.left + r.width / 2) * dpr, (r.top + r.height / 2) * dpr, u * dpr);
  }

  // ---------- Dave ----------
  function readyPlates() { return N.plates.filter(function (p) { return p.st === 'ready'; }); }
  function atPass() { return Math.abs(N.dave.x - T.passX) <= T.reach + 12; }
  function pick(plate) {
    var d = N.dave;
    if (!plate || plate.st !== 'ready' || d.carry.length >= T.carry) return false;
    plate.st = 'carried';
    d.carry.push(plate);
    sfx('food_pick', 0.9);
    N.events.push({ type: 'pick', plate: plate.id, dish: plate.m.id });
    return true;
  }
  function dumpPlate() {
    if (!N || N.qte || !N.dave.carry.length) return;
    var p = N.dave.carry.shift();
    N.plates.splice(N.plates.indexOf(p), 1);
    sfx('dump', 0.8);
    N.events.push({ type: 'dump', dish: p.m.id });
  }
  function inReach(c) { return Math.abs(seatX(c.seat) - N.dave.x) <= T.reach; }
  function carriedFor(c) {
    if (!c.order || c.order.kind !== 'dish') return null;
    return N.dave.carry.filter(function (p) { return p.m === c.order.m; })[0] || null;
  }
  function serveable(c) { return waiting(c) && (c.order.kind === 'tea' || !!carriedFor(c)); }
  function actOn(c, fromHold) {
    if (!c || !waiting(c) || !inReach(c)) return false;
    if (c.order.kind === 'tea') { startTea(c, fromHold); return true; }
    var p = carriedFor(c);
    if (p) { serveDish(c, p); return true; }
    return false;
  }
  // E / Space: nhận món ở quầy Bancho, hoặc phục vụ / rót trà cho khách trong tầm.
  function barAction(fromKey) {
    if (!N || N.over) return;
    if (N.qte) { if (N.qte.st === 'ready') qtePour(); return; }
    var d = N.dave;
    d.target = null;
    var near = N.customers.filter(function (c) { return waiting(c) && inReach(c) && serveable(c); })
      .sort(function (a, b) { return Math.abs(seatX(a.seat) - d.x) - Math.abs(seatX(b.seat) - d.x); });
    if (near.length && actOn(near[0], fromKey)) return;
    if (atPass()) pickAll();
  }
  // [ĐỀ XUẤT] ở quầy Bancho một lần bấm là bưng mọi đĩa đã xong, cũ trước, tới khi đầy tay
  function pickAll() {
    var r = readyPlates(), n = 0;
    while (r.length && N.dave.carry.length < T.carry) { if (pick(r.shift())) n++; }
    return n > 0;
  }
  function barRelease() {
    if (N && N.qte && N.qte.st === 'pour' && !holdingAction()) qteRelease();
  }
  function walkTo(x, act) { N.dave.target = { x: clamp(x, T.daveMin, T.daveMax), act: act || null }; }
  function barTap(cx, cy) {
    if (!N || N.over || !assetsReady) return;
    if (N.qte) { if (N.qte.st === 'ready') qtePour(); return; }
    var p = toRoom(cx, cy);
    // khách: bấm vào người đang chờ thì Dave đi tới và phục vụ luôn
    var hit = N.customers.filter(function (c) {
      var a = c.actor, b = bubbleAt(c);
      var onBody = Math.abs(p.x - a.x) <= 24 && p.y <= a.y && p.y >= a.y - 90;
      var onBubble = Math.abs(p.x - b.x) <= 22 && Math.abs(p.y - b.y) <= 22;
      return waiting(c) && (onBody || onBubble);
    })[0];
    if (hit) { walkTo(seatX(hit.seat), function () { actOn(hit, false); }); return; }
    var cat = scene.cat;
    if (Math.abs(p.x - cat.x) <= 22 && p.y <= cat.y + 4 && p.y >= cat.y - 30) {
      sfx('momo', 0.8);
      cat.play('Watch', true, function () { cat.play('Idle'); });
      return;
    }
    if (p.x >= 740 && p.x <= 960 && p.y >= 380 && p.y <= 530) { walkTo(T.passX, pickAll); return; }
    walkTo(p.x, null);
  }
  function tickDave(dt) {
    var d = N.dave, a = scene.dave;
    var dir = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0), moving = false;
    if (N.qte) dir = 0;
    if (dir) { d.target = null; d.x += dir * T.daveSpeed * dt; d.face = dir; moving = true; }
    else if (d.target && !N.qte) {
      var dx = d.target.x - d.x, st = T.daveSpeed * dt;
      if (Math.abs(dx) <= st) {
        d.x = d.target.x;
        var act = d.target.act;
        d.target = null;
        if (act) act();
      } else { d.x += Math.sign(dx) * st; d.face = Math.sign(dx); moving = true; }
    }
    d.x = clamp(d.x, T.daveMin, T.daveMax);
    a.x = d.x; a.flip = d.face > 0;
    if (moving) {
      d.walkT -= dt;
      if (d.walkT <= 0) { d.walkT = 0.34; sfx('dave_foot', 0.25); }
    }
    var carry = d.carry.length > 0;
    if (N.qte) { if (a.name !== 'QTE_Tea') a.play('QTE_Tea'); d.idleT = 0; }
    else if (moving) { a.play(carry ? 'Serve' : 'Walk'); d.idleT = 0; }
    else if (carry) a.play('Serve_Idle');
    else {
      d.idleT += dt;
      if (a.name !== 'Idle1' && a.name !== 'Idle2' && a.name !== 'Idle3') a.play('Idle1');
      if (d.idleT > 7) { d.idleT = 0; a.play(rnd() < 0.5 ? 'Idle2' : 'Idle3', true, function () { a.play('Idle1'); }); }
    }
  }

  // ---------- trà: Dave rót tại ghế khách (QTE_Tea), vòng rót AutoQTE gốc ----------
  function startTea(c, fromHold) {
    N.dave.target = null;
    N.dave.face = seatX(c.seat) >= N.dave.x ? 1 : -1;
    N.qte = { c: c, st: 'ready', fill: 0, t: 0, grade: null, doneT: 0 };
    N.events.push({ type: 'teaStart', cid: c.id });
    if (fromHold && holdingAction()) qtePour();
  }
  function qtePour() {
    var q = N.qte;
    if (!q || q.st !== 'ready') return;
    q.st = 'pour'; q.t = 0;
    sfx('tea_pour', 0.9);
  }
  function qteRelease() { var q = N.qte; if (q && q.st === 'pour') qteFinish(gradeOf(q.fill)); }
  function gradeOf(f) {
    if (f >= T.perfect[0] && f <= T.perfect[1]) return 'perfect';
    if (f >= T.good[0] && f <= T.good[1]) return 'good';
    return 'bad';
  }
  function qteFinish(g) {
    var q = N.qte;
    q.st = 'done'; q.grade = g; q.doneT = 0;
    var P = qtePopupPos();
    spawnVfx(N.fx.ui, g === 'perfect' ? 'teaPerfect' : g === 'good' ? 'teaGood' : 'teaBad', P.x, P.y, UIK);
    sfx('drink_' + g, 0.9);
    N.events.push({ type: 'tea', cid: q.c.id, grade: g, fill: q.fill });
  }
  function tickQte(dt) {
    var q = N.qte;
    if (!q) return;
    q.t += dt;
    if (q.st === 'pour') {
      q.fill += dt / T.pour;
      if (!holdingAction()) qteRelease();
      else if (q.fill >= T.overflow) qteFinish('bad');
    } else if (q.st === 'done') {
      q.doneT += dt;
      if (q.doneT >= 0.9) {
        var c = q.c;
        N.qte = null;
        if (!waiting(c)) return;
        c.teaGrade = q.grade;
        c.p = c.st === 'order' ? 1 : 0;
        c.happy = q.grade !== 'bad' && c.st === 'order';
        c.feedback = { kind: c.happy ? 'happy' : 'smile', t: 0 };
        pay(c);
      }
    }
    if (q.c.gone || q.c.st === 'leave') N.qte = null;
  }
  // [ĐỀ XUẤT] vòng rót vẽ to ×2 so với cỡ gốc của StaffActionInfo để đọc được trên màn nhỏ
  var QTE_K = UIK * 2;
  function qtePopupPos() { return { x: N.dave.x, y: DAVE_Y - 120 }; }

  // ---------- đêm ----------
  function barTick(dt) {
    N.t += dt;
    tickScene(scene, dt);
    if (N.open && N.t >= T.night) { N.open = false; N.events.push({ type: 'timeup' }); }
    var soldOut = N.menu.length > 0 && N.menu.every(function (m) { return m.sold >= m.servings; });
    if (N.open && soldOut) { N.open = false; N.events.push({ type: 'soldout' }); }
    if (N.open) {
      N.spawnT -= dt;
      if (N.spawnT <= 0) {
        var canSell = N.menu.some(function (m) { return avail(m) > 0; }) || N.teaPrice > 0;
        if (canSell) spawnCustomer();
        N.spawnT = T.guestEvery / N.decor * (1 + (rnd() * 2 - 1) * T.guestJitter);
      }
    }
    N.customers.forEach(function (c) { tickCustomer(c, dt); });
    N.customers = N.customers.filter(function (c) { return !c.gone; });
    tickKitchen(dt);
    tickDave(dt);
    tickQte(dt);
    // hào quang bong bóng gọi món khi Dave đứng gần và bưng đúng món (VFX_UI_Customer_Pop_Re)
    N.customers.forEach(function (c) {
      var on = waiting(c) && c.order.kind === 'dish' && inReach(c) && !!carriedFor(c);
      // [DtD] VFX_UI_Customer_Pop_Re là con của bong bóng Order trong SushiBarCustomerActionInfo: bong bóng tắt là
      // hạt tắt ngay cùng GameObject. Bản trước chỉ ngừng phát, viền sáng hình bong bóng (lõi trong suốt) còn lơ lửng
      // ~0,5 s sau khi phục vụ, trông như một quầng tối.
      if (on && !c.popFx) {
        var L = LAY.customerAction, pp = nodePos(L, ['Order', 'VFX_UI_Customer_Pop_Re_A_01']);
        c.popFx = spawnNode(N.fx.ui, pp.node, c.seat.anchor[0] + pp.x * UIK, c.seat.anchor[1] - pp.y * UIK, UIK * pp.s);
      } else if (!on && c.popFx) { killFx(c.popFx); c.popFx = null; }
    });
    if (!N.open && !N.customers.length && !N.qte && !N.over) endNight();
    if (N.shownGold < N.gold0 + N.credited) N.shownGold = Math.min(N.gold0 + N.credited, N.shownGold + Math.max(1, (N.gold0 + N.credited - N.shownGold) * dt * 8));
  }
  function summary() {
    return {
      menu: N.menu.map(function (m) { return { id: m.id, name: m.name, en: m.en, img: m.img, sp: m.sp, price: m.price, sold: m.sold, per: m.per, fish: m.fish, servings: m.servings }; }),
      served: N.served, dishes: N.dishes, tips: N.tips, tea: N.tea, teaN: N.teaN, angry: N.angry, likes: N.likes,
      guests: N.uid, committed: false,
    };
  }
  function endNight() {
    if (N.over) return;
    N.over = true;
    sfx('close', 0.8);
    HX.game.go('ledger', { day: summary() });
  }

  // ---------- HUD (DOM) ----------
  function barHud() {
    var root = HX.game.screen('bar');
    root.innerHTML = '';
    root.className = 'screen bb';
    setScale(root, 1);
    var ui = { slotEls: {} };
    // ô vàng gốc (SushiBarCanvasRoot/…/GoldInfoPanel/LobbyGoldbar): nền MoneyUI_Box đen 94 %, viền MoneyUI_Stroke vàng,
    // Coin32 cách mép trái 16 px, số cỡ 32 căn trái từ px 64. Đồng hồ đeo tay vẽ trên canvas (drawWatch).
    var gold = el('div', 'bb-gold');
    nineBg(gold, 'MoneyUI_Box', [0, 0, 0]);
    gold.firstChild.style.opacity = '0.941';
    var stroke = nineCss(el('div', 'bx-9 bb-stroke'), 'MoneyUI_Stroke', [1, 0.843, 0]);
    stroke.style.opacity = '0.314';
    gold.appendChild(stroke);
    ui.coin = spr('Coin32', 'bb-coin');
    gold.appendChild(ui.coin);
    ui.gold = gold.appendChild(el('b'));
    root.appendChild(gold);
    ui.queue = root.appendChild(el('div', 'bb-queue'));
    var bottom = el('div', 'bb-bottom');
    var list = el('div', 'bb-menu br-list');
    ui.rows = N.menu.map(function (m) {
      var r = el('div', 'br-row');
      r.dataset.id = m.id;
      r.title = m.name;
      r.appendChild(dishIcon(m));
      var n = el('b', 'br-right');
      r.appendChild(n);
      list.appendChild(r);
      return n;
    });
    var tea = el('div', 'br-row bb-tea');
    tea.appendChild(spr('Drink_Tea', 'bx-dish'));
    tea.appendChild(el('b', 'br-right', N.teaPrice + ''));
    list.appendChild(tea);
    bottom.appendChild(list);
    var close = button('bar-close', 'bx-brown', 'Đóng quán', 'UI_btn_brown');
    close.addEventListener('click', function () { if (N && !N.over) endNight(); });
    bottom.appendChild(close);
    root.appendChild(bottom);
    ui.hint = root.appendChild(el('div', 'bb-hint'));
    ui.hintTouch = null;
    return ui;
  }
  function slotEl(p) {
    var e = el('div', 'bb-slot');
    e.dataset.dish = p.m.id;
    var glow = nineCss(el('div', 'bb-glow'), 'UI_Sushi_Cooking_Box_Glow');
    e.appendChild(glow);
    e.appendChild(nineCss(el('div', 'bb-frame'), 'UI_Sushi_Cooking_Box_Complete'));
    var fr = el('div', 'bb-in');
    fr.appendChild(spr('UI_Sushi_Cooking_Icon', 'bb-sym'));
    var g = el('div', 'bb-gauge');
    var fill = el('div', 'bb-fill');
    g.appendChild(fill);
    fr.appendChild(g);
    var ic = el('img', 'bb-cook');
    ic.alt = '';
    if (p.m.img) ic.src = url(p.m.img);
    fr.appendChild(ic);
    e.appendChild(fr);
    e.addEventListener('pointerdown', function (ev) {
      ev.stopPropagation();
      HX.audio.unlock();
      if (!N || N.qte) return;
      if (p.st === 'ready') walkTo(T.passX, function () { pick(p); });
    });
    e._fill = fill; e._glow = glow;
    return e;
  }
  function tickHud() {
    var ui = N.ui;
    var g = String(Math.floor(N.shownGold));
    if (ui.gold.textContent !== g) ui.gold.textContent = g;
    N.menu.forEach(function (m, i) { var t = String(m.servings - m.sold); if (ui.rows[i].textContent !== t) ui.rows[i].textContent = t; });
    // hàng món đang làm / đã xong (CookingProgressSlot_Complete)
    var alive = {};
    N.plates.forEach(function (p) {
      if (p.st === 'carried') return;
      alive[p.id] = 1;
      var e = ui.slotEls[p.id];
      if (!e) { e = ui.slotEls[p.id] = slotEl(p); ui.queue.appendChild(e); }
      var k = p.st === 'ready' ? 1 : p.st === 'cooking' ? p.t / p.dur : 0;
      e._fill.style.width = (k * 100).toFixed(1) + '%';
      e.classList.toggle('ready', p.st === 'ready');
      e.classList.toggle('wait', p.st === 'queued');
      if (p.st === 'ready') {
        // [DtD] tween Fade của Box_Glow: 0,2 s, Linear, lặp yoyo
        var k2 = tweenK({ duration: 0.2, easeType: 1, loops: -1, loopType: 1 }, N.t);
        e._glow.style.opacity = (0.588 * (1 - k2)).toFixed(3);
      } else e._glow.style.opacity = '0';
    });
    Object.keys(ui.slotEls).forEach(function (id) { if (!alive[id]) { ui.slotEls[id].remove(); delete ui.slotEls[id]; } });
    if (N.pendingSlotFx) { var q = N.pendingSlotFx; N.pendingSlotFx = null; q.forEach(function (a) { var p = N.plates.filter(function (x) { return x.id === a[0]; })[0]; if (p) slotFx(p, a[1]); }); }
    var touch = document.body.classList.contains('touch');
    var hint = !N.open && !N.qte ? (N.customers.length ? 'Đã đóng cửa · chờ khách về' : 'Đóng cửa') : N.qte ? (N.qte.st === 'ready' ? (touch ? 'Giữ ngón tay để rót trà, thả ra khi vòng gần đầy' : 'Giữ Space / E để rót trà, thả ra khi vòng gần đầy') : N.qte.st === 'pour' ? 'Thả ra khi vòng gần đầy!' : '')
      : touch ? 'Chạm chỗ trống để đi · chạm món xong ở quầy Bancho để bưng · chạm khách để phục vụ, rót trà'
        : 'A/D hoặc ←/→ đi · E/Space: bưng món ở quầy Bancho, phục vụ, rót trà · Q bỏ đĩa đang bưng · bấm chuột cũng được';
    if (ui.hint.textContent !== hint) ui.hint.textContent = hint;
  }

  // ---------- vẽ UI gắn với nhân vật ----------
  function drawCustomerUi(ctx, c) {
    var L = LAY.customerAction, st = toStage(c.seat.anchor[0], c.seat.anchor[1]), k = UIK * V.s, t = c.t;
    var tm = N.t;
    if (c.st === 'menu') {
      drawAt(ctx, L, ['Menu'], st.x, st.y, k, clipOv(clipAt('UI_Basic/Customer_MenuView'), t, { '': { active: true } }), tm);
    } else if (c.st === 'order' && c.order.kind === 'dish') {
      drawAt(ctx, L, ['Order'], st.x, st.y, k, { MenuIcon: { sprite: c.order.m.icon || null }, Icon_Normal: { active: false } }, tm);
    } else if ((c.st === 'order' || (c.st === 'angry' && N.qte && N.qte.c === c)) && c.order.kind === 'tea') {
      drawAt(ctx, L, ['DrinkOrder'], st.x, st.y, k, { '': { sprite: 'UI_Customer_Tea_Pop' }, Gauge: { fill: c.st === 'order' ? clamp(c.gauge, 0, 1) : 1 }, MenuIcon: { sprite: 'Drink_Tea' }, Root: { active: false } }, tm);
    } else if (c.st === 'angry') {
      drawAt(ctx, L, ['Angry'], st.x, st.y, k, { Gauge: { fill: clamp(c.gauge, 0, 1) }, Icon_Normal: { active: false } }, tm);
    } else if (c.st === 'eat') {
      drawAt(ctx, L, ['AtTable', 'EatGaugeAni'], st.x, st.y, k, { EatGauge: { active: true }, 'EatGauge/Mask': { fill: clamp(c.t / c.eat.EatingTime, 0, 1) } }, tm);
    } else if (c.st === 'like') {
      drawAt(ctx, L, ['AtTable', 'EatGaugeAni'], st.x, st.y, k, clipOv(clipAt('EatGaugeAni/EatGaugeEndAnimation'), t, { EatGauge: { active: true }, 'EatGauge/Mask': { fill: 1 }, LikePop_Particle: { active: false } }), tm);
    } else if (c.st === 'pay') {
      var P = c.pay;
      drawAt(ctx, L, ['GivePay_Set', 'PaymentRoot'], st.x, st.y, k, clipOv(clipAt('PaymentRoot/GoldFadeOutAnimation'), t,
        { Payment: { text: String(P.price) }, 'Payment/Tip': { active: false }, GoldPop_Particle: { active: false }, 'GoldPop_Particle Buff': { active: false } }), tm);
      if (P.tip && t >= T.tipDelay) {
        drawAt(ctx, L, ['GivePay_Set', 'TipRoot'], st.x, st.y, k, clipOv(clipAt('TipRoot/GoldFadeOutAnimation'), t - T.tipDelay,
          { Payment: { text: String(P.tip) } }), tm);
      }
    }
    if (c.feedback) {
      var name = c.feedback.kind === 'happy' ? 'Receive_Happy' : 'Receive_Smile';
      var clip = clipAt(name + '/' + (c.feedback.kind === 'happy' ? 'RecieveHappyFeedback' : 'RecieveSmileFeedback'));
      var ov = clipOv(clip, c.feedback.t, { VFX_UI_DaveAction_Smile_A_01: { active: false } });
      drawAt(ctx, L, ['Served', name], st.x, st.y, k, ov, tm);
      if (!c.feedback.fx && c.feedback.t >= 0.042) {   // [DtD] clip bật VFX_UI_DaveAction_Smile ở 0,042 s
        c.feedback.fx = true;
        var pos = nodePos(L, ['Served', name]);
        spawnVfx(N.fx.ui, 'daveSmile', c.seat.anchor[0] + pos.x * UIK, c.seat.anchor[1] - pos.y * UIK, UIK);
      }
    }
  }
  // CustomerTalkBoxInfo gốc: một dòng TextMeshPro trắng cỡ 16, viền đen (TextMeshProUnderlay), không có ảnh bong bóng.
  // Hộp neo góc phải-dưới tại điểm neo ghế + (20, −40) px UI, chữ mọc sang trái. Chữ < 11 px CSS thì nâng lên 11 [ĐỀ XUẤT].
  function drawTalk(ctx, c) {
    var k = c.talk;
    if (!k || k.wait > 0 || k.t <= 0) return;
    var L = LAY.customerTalk, box = L ? L.rt : [1, 0, 1, 0, 20, -40, 0, 60, 1, 0];
    var msg = L ? child(child(L, 'Root'), 'Message') : null, tx = msg && msg.text || { size: 16, color: [1, 1, 1, 1] };
    var st = toStage(c.seat.anchor[0] + box[4] * UIK, c.seat.anchor[1] - box[5] * UIK);
    var px = Math.max(tx.size * UIK * V.s, 11 * V.dpr);
    ctx.save();
    ctx.font = '700 ' + px.toFixed(1) + 'px ' + FONT;
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, px * 0.28); ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.strokeText(k.text, st.x, st.y);
    var cc = tx.color || [1, 1, 1, 1];
    ctx.fillStyle = rgb(cc);
    ctx.fillText(k.text, st.x, st.y);
    ctx.restore();
  }
  // Nút bố cục gốc vẽ theo toạ độ màn hình (canvas UI 1920 × 1080 co theo uiScale), gốc = giữa màn.
  function drawScreen(ctx, n, ov, time) {
    var S = HX.game.stage2d, W = S.canvas.width, H = S.canvas.height, k = uiScale() * V.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.scale(k, k);
    drawNode(ctx, n, { w: W / k, h: H / k, px: 0.5, py: 0.5 }, '', ov || {}, time || 0);
    ctx.restore();
  }
  // Đồng hồ đeo tay gốc (DayInfoPanel/CalendarWatchPanel/Watch) ở trạng thái clip EveningState.
  // Cung đêm của mặt đồng hồ: ảnh Night_all tô Radial360 từ 10 giờ ngược chiều kim 0,385 vòng (tới ~5 giờ 23).
  // [ĐỀ XUẤT] kim chạy xuôi chiều kim đồng hồ từ đầu cung (5 giờ 23) tới 10 giờ trong T.night giây, phần cung còn tô
  // là thời gian còn lại; dưới eveningWarningValue [DtD 0,142] thì bật Evening_Red (tween nhấp nháy gốc).
  // Biểu tượng trăng đổi theo ngày (8 pha, thứ tự tự chọn). Mã HourInfoPanel gốc không đọc được.
  var MOONS = ['NewMoon', 'WaxingCrescent', 'FirstQuarter', 'WaxingGibbous', 'FullMoon', 'WaningGibbous', 'LastQuarter', 'WaningCrescent'];
  function drawWatch(ctx) {
    var L = LAY.hudWatch;
    if (!L) return;
    var p = clamp(N.t / T.night, 0, 1), fill0 = findNode(L, 'Evening').img.fill.amount, rem = fill0 * (1 - p);
    var warn = N.open && 1 - p < (findNode(L, 'Watch').scripts[0].HourInfoPanel || {}).eveningWarningValue;
    var ov = clipOv(clipAt('Watch/EveningState'), 0, {});
    // góc kim (độ, xuôi chiều kim đồng hồ từ 12 giờ): đầu cung = 300° − 360°·fill0, cuối cung = 300° (10 giờ)
    var ang = 300 - 360 * fill0 * (1 - p), rotZ = 180 - ang;
    ov.EveningPointer = Object.assign(ov.EveningPointer || {}, { rot: rotZ - findNode(L, 'EveningPointer').rotZ });
    ov['Screen/EveningHourSlider/Evening'] = Object.assign(ov['Screen/EveningHourSlider/Evening'] || {}, { fill: rem });
    ov['Screen/EveningHourSlider/Evening_Red'] = { active: warn, fill: rem };
    ov['IconArea/Icon'] = { sprite: 'UI_Watch_Icon_Moon_' + MOONS[(HX.save.get().day - 1) % MOONS.length] };
    var label = 'Buổi tối';
    ctx.font = '700 14px ' + FONT;
    ov['TxtArea'] = Object.assign(ov.TxtArea || {}, { w: ctx.measureText(label).width + 12 });
    // TimeText neo góc trái-dưới của TxtArea (HorizontalLayoutGroup gốc căn giữa): dời vào giữa hộp
    ov['TxtArea/TimeText'] = { text: label, x: ov.TxtArea.w / 2, y: 10 };
    drawScreen(ctx, L, ov, N.t);
  }
  // Băng OPEN gốc (SushibarOpenAlarm_Default): UIRoot (bóng tròn, vầng sáng quay, chữ OPEN, tween gốc) + hạt Root
  // (tia sáng, sushi bay) và hạt VFX_UI_SushibarOpen_A_01. Tween cuối tắt dần xong ở 3,1 s.
  var OPEN_LEN = 3.1;
  function startOpenAlarm() {
    var S = HX.game.stage2d, W = S.canvas.width, H = S.canvas.height, k = uiScale() * V.dpr;
    N.openFx = { bg: [], fg: [] };
    var ui = LAY.openAlarm, fx = LAY.openAlarmFx;
    if (fx) spawnNode(N.openFx.bg, fx, W / 2, H / 2, k);
    if (ui) {
      // UIRoot: neo đỉnh màn, tâm cách đỉnh 200 + 574/2 px UI
      var v = child(ui, 'VFX_UI_SushibarOpen_A_01'), cy = 200 + ui.rt[7] / 2;
      spawnNode(N.openFx.fg, v, W / 2 + v.rt[4] * k, cy * k - v.rt[5] * k, k);
    }
  }
  function drawOpenAlarm(ctx) {
    if (!(N.openT > 0) || N.openT >= OPEN_LEN + 3) return;
    var id = { x0: 0, y0: 0, s: 1, ox: 0, oy: 0 };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (N.openFx) N.openFx.bg.forEach(function (e) { e.draw(ctx, id); });
    if (N.openT < OPEN_LEN && LAY.openAlarm) drawScreen(ctx, LAY.openAlarm, { VFX_UI_SushibarOpen_A_01: { active: false } }, N.openT);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (N.openFx) N.openFx.fg.forEach(function (e) { e.draw(ctx, id); });
  }
  function drawDaveUi(ctx) {
    var d = N.dave, L = LAY.daveAction, n = d.carry.length;
    // [ĐỀ XUẤT] gốc DaveActionInfo đặt trên đầu Dave; nhiều đĩa thì xếp ngang
    var st = toStage(d.x, DAVE_Y - 86), k = UIK * V.s;
    d.carry.forEach(function (p, i) {
      drawAt(ctx, L, ['Order'], st.x + (i - (n - 1) / 2) * 80 * k, st.y, k,
        { MenuIcon: { sprite: p.m.icon || null }, Trash: { active: false }, Icon_Normal: { active: false } }, N.t);
    });
    var q = N.qte;
    if (q) {
      var P = qtePopupPos(), sp = toStage(P.x, P.y), kk = QTE_K * V.s;
      // StaffActionInfo/AutoQTE/Root (bóng rót + vòng đo), đặt giữa đỉnh đầu Dave
      var ov = {
        Icon: { sprite: 'Drink_Tea' }, Gauge: { fill: Math.min(1, q.fill) },
        CompleteMark: { active: q.st === 'done' && q.grade !== 'bad' },
      };
      ctx.save();
      ctx.translate(sp.x, sp.y); ctx.scale(kk, kk);
      drawNode(ctx, child(findNode(LAY.staffAction, 'AutoQTE'), 'Root'), { w: 0, h: 0, px: 0.5, py: 0.5 }, '', ov, q.st === 'done' ? q.doneT : q.t);
      ctx.restore();
      if (q.st !== 'done') {
        // gợi ý phím từ SushiBarQTEPanel: phím + mũi tên chạy clip Ui_SushiBarQTEArrowToBottomAnim
        var touch = document.body.classList.contains('touch');
        var key = sprite(touch ? 'Mouse_Simple_Key_Dark' : 'Space_Key_Dark_Symbol'), arr = sprite('UI_QTE_Lever_Arrow_Big');
        var ao = clipOv(clipAt('QTEArrowToBottom/Ui_SushiBarQTEArrowToBottomAnim'), q.t, {})[''] || {};
        var kx = sp.x + 58 * kk, ky = sp.y - 20 * kk, ks = 40 * kk;
        if (ok(key)) ctx.drawImage(key, kx - ks / 2, ky - ks / 2, ks, ks);
        if (ok(arr)) {
          ctx.save();
          ctx.globalAlpha = ao.a == null ? 1 : clamp(ao.a, 0, 1);
          var ay = ky - (ao.y == null ? -26 : ao.y) * kk * 0.8 - 30 * kk;
          ctx.drawImage(arr, kx - 29 * 0.8 * kk / 2, ay - 36 * 0.8 * kk / 2, 29 * 0.8 * kk, 36 * 0.8 * kk);
          ctx.restore();
        }
      }
    }
  }

  HX.phases.bar = {
    surface: '2d',
    enter: function (args) {
      var s = HX.save.get();
      var menu = args.menu || buildMenu(s.fridge).slice(0, slots());
      menu.forEach(function (m) { m.sold = 0; m.pending = 0; });
      N = newNight(menu);
      scene = newScene();
      scene.dave.x = N.dave.x;
      N.fx = scene.fx;
      N.ui = barHud();
      keys = {};
      loadAssets().then(function () {
        if (HX.game.phase !== 'bar') return;
        N.openT = 0.01;
      });
      loadAudio().then(function () {
        if (HX.game.phase !== 'bar') return;
        sfx('letsrock', 0.8);
        sfx('bancho_exciting' + (rnd() < 0.5 ? 1 : 2), 0.9);
        HX.audio.music('bar_bgm_night', 0.55);
        HX.audio.loop('bar_amb', 'bar_amb_crowd', 0.3);
      });
      tickHud();
    },
    exit: function () {
      HX.audio.stopMusic(0.6);
      HX.audio.stopLoop('bar_amb', 0.5);
      if (N) N.over = true;
      keys = {};
    },
    update: function (dt) {
      if (!N || !assetsReady || N.over) { if (N && N.ui) tickHud(); return; }
      dt *= N.ts;
      if (N.openT > 0 && N.openT < OPEN_LEN + 3) {
        if (!N.openFx) startOpenAlarm();
        N.openT += dt;
        tickList(N.openFx.bg, dt); tickList(N.openFx.fg, dt);
      }
      barTick(dt);
      if (!N.over) tickHud();
    },
    render: function () {
      if (!N || !scene) return;
      var ctx = drawScene(scene, N.customers.map(function (c) { return c.actor; }), N.dave.x, N.t < 0.05);
      if (!ctx) return;
      N.customers.forEach(function (c) { drawCustomerUi(ctx, c); });
      N.customers.forEach(function (c) { drawTalk(ctx, c); });
      drawDaveUi(ctx);
      drawUiFx(ctx, scene);
      drawWatch(ctx);
      drawOpenAlarm(ctx);
    },
  };

  // =====================================================================================
  // pha ledger: sổ cuối ngày (SushiBarAccountInternal), cộng sổ đúng một lần rồi sang ngày mới
  // =====================================================================================
  var LG = null, lastCommit = null;
  function commitNight(d) {
    if (d.committed || lastCommit === d) return;
    d.committed = true; lastCommit = d;
    var total = d.dishes + d.tips + d.tea;
    HX.save.commit(function (s) {
      s.gold += total;
      s.stats.served += d.served;
      s.stats.earned += total;
      // Một con cá đã mổ (bán ít nhất một suất) là hết con đó: bỏ ceil(suất bán / suất mỗi con) con khỏi tủ.
      d.menu.forEach(function (m) {
        if (!m.sold) return;
        var left = (s.fridge[m.id] || 0) - Math.min(m.fish, Math.ceil(m.sold / m.per));
        if (left > 0) s.fridge[m.id] = left; else delete s.fridge[m.id];
      });
      s.day += 1;
      s.stage = 'prep';
    });
  }
  function ledgerBuild(d, before, after) {
    var root = HX.game.screen('ledger');
    root.innerHTML = '';
    root.className = 'screen bl';
    setScale(root, 1);
    root.style.setProperty('--k', ledgerK().toFixed(3));
    var total = d.dishes + d.tips + d.tea;
    LG.els = {};
    // CurtainRoot gốc: ảnh quán đã làm mờ (SushiBar_EndCurtain, kéo phủ cả màn) dưới màn đen 78,4 %
    var dummy = el('div', 'bl-dummy');
    dummy.style.backgroundImage = 'url("' + url(SPR.SushiBar_EndCurtain) + '")';
    root.appendChild(dummy);
    root.appendChild(el('div', 'bl-curtain'));
    // băng "BANCHO SUSHI CLOSED!" (SushibarStateAlarmPanel_Close): hộp Night_AlarmBox 1920 × 172 (9 mảnh) giữa màn, cao +122
    var ban = el('div', 'bl-banner');
    var abox = el('div', 'bl-abox');
    var ab = borderOf('Night_AlarmBox');
    abox.style.borderImage = 'url("' + url(SPR.Night_AlarmBox) + '") ' + ab[3] + ' ' + ab[2] + ' ' + ab[1] + ' ' + ab[0] + ' fill stretch';
    abox.style.borderWidth = 'calc(' + ab[3] + 'px * var(--u)) calc(' + ab[2] + 'px * var(--u)) calc(' + ab[1] + 'px * var(--u)) calc(' + ab[0] + 'px * var(--u))';
    ban.appendChild(abox);
    var fx = tintImg(spr('StarLight_FX', 'bl-star'), 'StarLight_FX', [0.802, 0.245, 0]);
    var bm = el('div', 'bl-bmask');
    var bb = spr('Dialogue_Bancho_Afterwork01', 'bl-bancho');
    bm.appendChild(bb);
    var t1 = el('div', 'bl-t1', 'Hết giờ mở quán'), t2 = el('div', 'bl-t2', 'BANCHO SUSHI'), t3 = el('div', 'bl-t3', 'CLOSED!');
    [fx, bm, t1, t2, t3].forEach(function (e) { ban.appendChild(e); });
    root.appendChild(ban);
    LG.els.banner = { root: ban, box: abox, fx: fx, bancho: bb, t1: t1, t2: t2, t3: t3 };

    var area = el('div', 'bl-area');
    // giấy A: khách
    var pa = el('div', 'bl-paper bl-a');
    pa.style.backgroundImage = 'url("' + url(SPR.UI_Sushi_Account_PaperA) + '")';
    var ta = nineBg(el('div', 'bl-tag'), 'Box_6rad', [0.212, 0.243, 0.376]);
    ta.appendChild(el('span', null, 'Khách tối nay'));
    pa.appendChild(ta);
    var likes = el('div', 'bl-likes');
    likes.appendChild(spr('UI_Sushi_Account_Cookstar_GuageIcon', 'bl-likeic'));
    likes.appendChild(el('b', null, '+' + d.likes));
    pa.appendChild(likes);
    var ga = el('div', 'bl-kv');
    [['Khách vào quán', d.guests], ['Phục vụ món', d.served], ['Chén trà', d.teaN], ['Khách bỏ về', d.angry]].forEach(function (r) {
      ga.appendChild(el('span', null, r[0])); ga.appendChild(el('b', null, String(r[1])));
    });
    pa.appendChild(ga);
    var tb = nineBg(el('div', 'bl-tag'), 'Box_6rad', [0.212, 0.243, 0.376]);
    tb.appendChild(el('span', null, 'Món bán chạy'));
    pa.appendChild(tb);
    var top = el('div', 'bl-top');
    d.menu.filter(function (m) { return m.sold; }).sort(function (a, b) { return b.sold * b.price - a.sold * a.price; }).slice(0, 3).forEach(function (m) {
      var c = nineBg(el('div', 'bl-topm'), 'UI_Sushi_Account_MenuBg');
      c.appendChild(dishIcon(m));
      c.appendChild(el('b', null, '×' + m.sold));
      top.appendChild(c);
    });
    if (!top.children.length) top.appendChild(el('span', 'bl-none', 'Chưa bán được món nào'));
    pa.appendChild(top);
    area.appendChild(pa);

    // giấy B: sổ sách
    var pb = el('div', 'bl-paper bl-b');
    pb.style.backgroundImage = 'url("' + url(SPR.UI_Sushi_Account_PaperB) + '")';
    var hb = el('div', 'bl-head');
    var tc = nineBg(el('div', 'bl-tag'), 'Box_6rad', [0.212, 0.243, 0.376]);
    tc.appendChild(el('span', null, 'Sổ sách'));
    hb.appendChild(tc);
    hb.appendChild(el('span', 'bl-date', 'Ngày ' + before.day));
    pb.appendChild(hb);
    var tbl = el('div', 'br-ledger');
    d.menu.filter(function (m) { return m.sold; }).forEach(function (m) {
      var n = el('span', 'bl-dishn');
      n.appendChild(dishIcon(m, 'bl-dishic'));
      n.appendChild(document.createTextNode(m.name + ' ×' + m.sold));
      tbl.appendChild(n);
      tbl.appendChild(el('b', null, String(m.sold * m.price)));
    });
    [['Suất đã bán', d.served], ['Tiền món', d.dishes], ['Tiền tip', d.tips], ['Tiền trà', d.tea]].forEach(function (r) {
      tbl.appendChild(el('span', null, r[0])); tbl.appendChild(el('b', null, String(r[1])));
    });
    tbl.dataset.earned = total;
    pb.appendChild(tbl);
    var tot = nineBg(el('div', 'bl-total'), 'UI_Sushi_Account_TopSales_ScoreBg', [0.212, 0.243, 0.376]);
    tot.appendChild(el('span', null, 'Tổng thu'));
    tot.appendChild(spr('Coin32', 'bl-coin'));
    tot.appendChild(el('b', null, String(total)));
    pb.appendChild(tot);
    pb.appendChild(el('div', 'bl-gold', 'Vàng ' + before.gold + ' → ' + after.gold));
    area.appendChild(pb);
    root.appendChild(area);
    LG.els.area = area;

    var foot = el('div', 'bl-foot');
    var mood = d.angry > d.served ? 'Bad' : total > 0 && !d.angry ? 'Good' : 'Normal';
    LG.clip = BA.ui.clips['Account_BanchoAnimCtrl/Account_Bancho' + mood + 'Anim'];
    LG.els.react = spr(LG.clip.spriteKeys[0][0], 'bl-react');
    // ResultArea gốc: dải UI_Sushi_Account_ResultBg 1920 × 274 ở đỉnh màn, hai hàng InfoBg + Bancho phản ứng (×4, lật).
    // Bản gốc ghi sao đánh giá và số lửa; game này không có hai số đó nên hai hàng ghi tổng thu và lượt thích [ĐỀ XUẤT].
    var band = el('div', 'bl-result');
    band.style.backgroundImage = 'url("' + url(SPR.UI_Sushi_Account_ResultBg) + '")';
    var info = el('div', 'bl-info');
    var r1 = nineBg(el('div', 'bl-irow'), 'UI_Sushi_Account_Result_InfoBg');
    r1.appendChild(el('span', 'bl-ititle', 'Tổng thu tối nay'));
    r1.appendChild(spr('Coin32', 'bl-iic'));
    r1.appendChild(el('b', 'bl-ival', String(total)));
    var r2 = nineBg(el('div', 'bl-irow'), 'UI_Sushi_Account_Result_InfoBg');
    r2.appendChild(el('span', 'bl-ititle', 'Lượt thích'));
    r2.appendChild(spr('UI_Sushi_Account_Cookstar_GuageIcon', 'bl-iic'));
    r2.appendChild(el('b', 'bl-ival bl-pink', '+' + d.likes));
    info.appendChild(r1); info.appendChild(r2);
    band.appendChild(info);
    var barea = el('div', 'bl-barea');
    band.appendChild(barea);
    root.insertBefore(band, area);
    LG.els.band = band; LG.els.barea = barea;
    foot.appendChild(LG.els.react);
    var b = button('ledger-next', 'bx-pink', 'Sang ngày ' + after.day, 'UI_btn_pink');
    b.addEventListener('click', function () { HX.game.go('prep'); });
    foot.appendChild(b);
    root.appendChild(foot);
    LG.els.foot = foot;
    root.addEventListener('pointerdown', function () { if (LG && LG.t < 3.3) LG.t = 3.3; });
  }
  // Tỉ lệ của sổ: giấy 634 px UI phải lọt màn cùng nút [ĐỀ XUẤT]
  function ledgerK() { return Math.min(uiScale(), (innerHeight - 64) / 720); }
  // Tween gốc của băng CLOSED (accountInternal.json), áp vào DOM mỗi khung.
  function styleFrom(e, tweens, time, base) {
    var st = applyTweens(tweens, time, { x: 0, y: 0, sx: base && base.sx || 1, sy: base && base.sy || 1, a: 1, rot: 0 });
    e.style.transform = 'translate(calc(' + st.x.toFixed(1) + 'px * var(--u)), calc(' + (-st.y).toFixed(1) + 'px * var(--u))) rotate(' + (-st.rot).toFixed(1) + 'deg) scale(' + st.sx.toFixed(3) + ',' + st.sy.toFixed(3) + ')';
    e.style.opacity = clamp(st.a, 0, 1).toFixed(3);
  }
  HX.phases.ledger = {
    surface: '2d',
    enter: function (args) {
      var d = args.day || { menu: [], served: 0, dishes: 0, tips: 0, tea: 0, teaN: 0, angry: 0, likes: 0, guests: 0 };
      var before = HX.save.get();
      commitNight(d);
      var after = HX.save.get();
      LG = { t: 0, d: d, tw: null, popped: false };
      if (!scene) scene = newScene();
      scene.dave.play('Tired_Idle');
      scene.bancho.play('Idle');
      ledgerBuild(d, before, after);
      loadAssets();
      json('art/bar/ui/layout/accountInternal.json').then(function (L) {
        var f = function (n) { return findNode(L, n); };
        LG.tw = { box: f('OpenAlarm').tweens, t1: f('Text01').tweens, t2: f('Text02').tweens, t3: f('Text03').tweens,
          fx: f('Fx').tweens, bancho: f('Bancho').tweens, area: f('CookStarArea').tweens, foot: f('ButtonArea (Must Inactive)').tweens };
      }).catch(function (e) { HX.game.errors.push(String(e)); });
      loadAudio().then(function () {
        if (HX.game.phase !== 'ledger') return;
        sfx('bancho_afterwork1', 0.9);
        HX.audio.music('bar_bgm_day', 0.45);
      });
    },
    exit: function () { HX.audio.stopMusic(0.4); },
    update: function (dt) {
      if (!LG) return;
      LG.t += dt;
      if (assetsReady && scene) tickScene(scene, dt);
      var E = LG.els, tw = LG.tw, t = LG.t;
      if (tw) {
        styleFrom(E.banner.box, tw.box, t);
        styleFrom(E.banner.t1, tw.t1, t);
        styleFrom(E.banner.t2, tw.t2, t);
        styleFrom(E.banner.t3, tw.t3, t);
        styleFrom(E.banner.fx, tw.fx, t, { sx: 1.2, sy: 1.2 });
        styleFrom(E.banner.bancho, tw.bancho, t);
      }
      var show = t >= 3.3;
      E.banner.root.parentNode.classList.toggle('done', t >= 3.6);
      E.area.classList.toggle('show', show);
      E.foot.classList.toggle('show', show);
      // ResultArea chỉ hiện khi cả bố cục gốc 1080 dòng lọt màn (k · 1080 ≤ cao màn); màn thấp thì Bancho đứng cạnh nút
      var fits = ledgerK() * 1080 <= innerHeight + 4;
      if (fits !== LG.fits) {
        LG.fits = fits;
        var host = fits ? E.barea : E.foot;
        host.insertBefore(E.react, host.firstChild);
        E.band.style.display = fits ? '' : 'none';
      }
      if (show && tw) {
        // [DtD] AccountArea / CookStarArea: Move OutBack 0,5 s; ButtonArea: Fade 0,25 s
        var k = tweenK({ duration: 0.5, easeType: 27 }, t - 3.3);
        // [DtD] AnalyticsResultSequence m_StartDelay 0,3 s sau khi giấy lên: ResultArea trượt từ y 300 xuống, AccountArea 200 → 100 (OutBack 0,5 s)
        var k2 = fits ? Math.max(0, tweenK({ duration: 0.5, easeType: 27 }, t - 4.1)) : 1;
        E.area.style.bottom = 'calc(' + (fits ? 200 - 100 * k2 : 100).toFixed(1) + 'px * var(--k))';
        E.band.style.transform = 'translateY(calc(' + (-(374 * (1 - k2))).toFixed(1) + 'px * var(--k)))';
        E.band.style.visibility = t >= 4.1 ? 'visible' : 'hidden';
        E.area.style.transform = 'translateY(calc(' + ((1 - k) * 833).toFixed(1) + 'px * var(--u)))';
        E.foot.style.opacity = clamp((t - 3.55) / 0.25, 0, 1).toFixed(2);
        if (!LG.popped) { LG.popped = true; sfx('result_popup1', 0.8); if (LG.d.dishes + LG.d.tips + LG.d.tea > 0) setTimeout(function () { sfx('result_profit', 0.8); }, 450); }
      }
      if (LG.clip) {
        var f = spriteKeyAt(LG.clip, t);
        if (E.react.dataset.f !== f) { E.react.dataset.f = f; E.react.src = url(SPR[f]); }
      }
    },
    render: function () {
      if (!scene) return;
      var ctx = drawScene(scene, [], RW / 2, true);
      if (ctx) drawUiFx(ctx, scene);
    },
  };

  addEventListener('resize', function () {
    ['kitchen', 'bar', 'ledger'].forEach(function (n) {
      var e = document.getElementById('scr-' + n);
      if (!e) return;
      setScale(e, n === 'kitchen' ? 0.9 : 1);
      if (n === 'ledger') e.style.setProperty('--k', ledgerK().toFixed(3));
    });
  });

  // ---------- móc cho bộ kiểm (test/ho-xanh-bar.js) ----------
  HX.bar = {
    T: T, SEAT_ORDER: SEAT_ORDER,
    debug: {
      seed: function (n) { seed = n == null ? null : n | 0; },
      snap: function (k) { SNAP = k; },
      timeScale: function (k) { if (N) N.ts = k; },
      ready: function () { return assetsReady; },
      // hạt đang sống của cảnh (bếp / quán / sổ): số hạt, gốc phát, có mesh / flow không
      fx: function () {
        if (!scene) return null;
        return ['world', 'ui', 'screen'].reduce(function (o, k) {
          o[k] = scene.fx[k].map(function (e) { var Rd = e.p.render || {}; return { parts: e.parts.length, x: e.x, y: e.y, tex: Rd.texture, shader: Rd.shader, blend: Rd.blend, add: e.add, mesh: !!e.mesh, flow: !!e.flow }; });
          return o;
        }, {});
      },
      info: function () {
        if (!N) return null;
        return {
          t: N.t, open: N.open, over: N.over, earned: earned(), dishes: N.dishes, tips: N.tips, tea: N.tea, served: N.served,
          teaN: N.teaN, angry: N.angry, likes: N.likes, gold0: N.gold0, shownGold: N.shownGold, credited: N.credited,
          seats: N.seats.map(function (s) { return s.name; }),
          menu: N.menu.map(function (m) { return { id: m.id, name: m.name, price: m.price, servings: m.servings, sold: m.sold, pending: m.pending, per: m.per, fish: m.fish }; }),
          customers: N.customers.map(function (c) {
            return { id: c.id, who: c.ch.id, seat: c.seat.name, front: c.seat.isFront, st: c.st, t: c.t, x: c.actor.x, y: c.actor.y,
              sitX: seatX(c.seat), sitY: c.seat.sit[1], anim: c.actor.name, flip: c.actor.flip, z: c.actor.z,
              order: c.order ? (c.order.kind === 'tea' ? 'tea' : c.order.m.id) : null, happy: c.happy,
              talk: c.talk && c.talk.t > 0 ? { kind: c.talk.kind, text: c.talk.text } : null };
          }),
          plates: N.plates.map(function (p) { return { id: p.id, dish: p.m.id, st: p.st }; }),
          dave: { x: N.dave.x, anim: scene.dave.name, carry: N.dave.carry.map(function (p) { return p.m.id; }), target: N.dave.target ? N.dave.target.x : null },
          bancho: scene.bancho.name, qte: N.qte ? { st: N.qte.st, fill: N.qte.fill, grade: N.qte.grade, cid: N.qte.c.id } : null,
          events: N.events.slice(), passX: T.passX, reach: T.reach, view: { s: V.s, x0: V.x0, y0: V.y0, ox: V.ox, oy: V.oy, dpr: V.dpr },
          fx: { world: scene.fx.world.length, ui: scene.fx.ui.length, screen: scene.fx.screen.length },
        };
      },
      // toạ độ phòng → toạ độ CSS của trang (để bấm chuột / chạm)
      toClient: function (x, y) { var p = toStage(x, y); return { x: p.x / V.dpr, y: p.y / V.dpr }; },
      spawn: function (o) { if (!N) return null; var c = spawnCustomer(o || {}); return c ? c.id : null; },
      holdSpawns: function (on) { if (N) N.spawnT = on ? 1e9 : 0.5; },
      endTime: function () { if (N) N.t = T.night; },
    },
  };
})(window.HX = window.HX || {});
