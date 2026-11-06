/* Sprite pixel từ atlas Soul Knight — lớp vẽ nằm TRÊN bộ hình vector cũ.
 *
 * WHY: chủ dự án muốn game "động đậy": quái thở, lửa bập bùng, nhân vật chạy
 * có khung chân. Hình vector trong art.js vẽ được dáng nhưng không có khung
 * hoạt ảnh. Atlas cho khung thật; art.js vẫn giữ làm lưới đỡ, nên thiếu một vai
 * trò (hay atlas không tải được) thì game vẫn chạy bằng hình vector — không bao
 * giờ ra một ô trống.
 * ROOT-CAUSE: pixel art phóng bằng số lẻ thì nhoè và nhấp nháy khi cuộn. Mọi
 * lệnh vẽ ở đây làm tròn toạ độ về điểm ảnh màn hình và tắt làm mịn.
 *
 * Neo khung: GIỮA ĐÁY. Xem art/tools/build_sk_atlas.py vì sao không cắt viền.
 */
(function (global) {
  'use strict';

  var SK = global.HIC_SK || null;
  var img = null, ready = false, failed = false;
  var listeners = [];

  function load(src) {
    if (!SK) { failed = true; return; }
    img = new Image();
    img.onload = function () {
      ready = true;
      listeners.splice(0).forEach(function (f) { try { f(); } catch (e) { console.error(e); } });
    };
    img.onerror = function () { failed = true; console.warn('[hic] không tải được atlas sprite, dùng hình vector'); };
    img.src = src;
  }

  function group(role) { return SK && SK.g[role]; }
  function has(role) { return !!(ready && group(role)); }

  function rect(id) {
    var f = SK.f, o = id * 4;
    return [f[o], f[o + 1], f[o + 2], f[o + 3]];
  }

  /* Chọn danh sách khung cho một hoạt ảnh, lùi dần về thứ có sẵn.
     'run' và 'move' là một; thiếu 'attack' thì dùng 'idle'. */
  var FALLBACK = { run: ['run', 'move', 'walk', 'idle'], move: ['move', 'run', 'walk', 'idle'],
    attack: ['attack', 'idle'], hit: ['hit', 'idle'], dead: ['dead', 'hit', 'idle'], idle: ['idle', 'move', 'run'] };
  function framesOf(role, anim) {
    var g = group(role);
    if (!g) return null;
    if (g.frames) return g.frames;
    var list = FALLBACK[anim] || [anim, 'idle'];
    for (var i = 0; i < list.length; i++) if (g.anims[list[i]]) return g.anims[list[i]];
    for (var k in g.anims) return g.anims[k];
    return null;
  }
  function hasAnim(role, anim) {
    var g = group(role);
    return !!(g && g.anims && g.anims[anim]);
  }

  var DEFAULT_FPS = { idle: 6, run: 12, move: 10, attack: 14, hit: 10, dead: 10 };
  function frameAt(role, anim, t, loop) {
    var fr = framesOf(role, anim);
    if (!fr || !fr.length) return null;
    var g = group(role);
    var fps = g.fps || DEFAULT_FPS[anim] || 8;
    var n = Math.floor((t / 1000) * fps);
    if (loop === false) n = Math.min(fr.length - 1, n);
    else n = ((n % fr.length) + fr.length) % fr.length;
    return fr[n];
  }
  function animDuration(role, anim) {
    var fr = framesOf(role, anim), g = group(role);
    if (!fr) return 0;
    return fr.length / ((g && g.fps) || DEFAULT_FPS[anim] || 8) * 1000;
  }

  /* Bản tô trắng/đỏ của từng khung, làm một lần rồi giữ lại.
     WHY: cú loé trắng khi trúng đòn là thứ làm cú đánh "có lực". Tô bằng
     globalCompositeOperation trên canvas chính thì phủ luôn cả nền. */
  var tintCache = {};
  function tinted(id, color) {
    var key = id + color;
    if (tintCache[key]) return tintCache[key];
    var r = rect(id);
    var c = document.createElement('canvas');
    c.width = r[2]; c.height = r[3];
    var x = c.getContext('2d');
    x.drawImage(img, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color;
    x.fillRect(0, 0, r[2], r[3]);
    tintCache[key] = c;
    return c;
  }

  /* Vẽ một khung. (x, y) là điểm GIỮA ĐÁY trên màn hình; scale là số điểm ảnh
     màn hình cho mỗi điểm ảnh gốc.
     opts: flip, alpha, flash (0..1 trắng), tint (màu phủ), sx/sy (co giãn quanh
     đáy — dùng cho nhún và bẹp), rot, outline. */
  function drawId(ctx, id, x, y, scale, opts) {
    opts = opts || {};
    var r = rect(id);
    var w = r[2] * scale * (opts.sx || 1), h = r[3] * scale * (opts.sy || 1);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (opts.alpha != null) ctx.globalAlpha *= opts.alpha;
    ctx.translate(Math.round(x), Math.round(y));
    if (opts.rot) ctx.rotate(opts.rot);
    if (opts.flip) ctx.scale(-1, 1);
    var dx = Math.round(-w / 2), dy = Math.round(-h);
    ctx.drawImage(img, r[0], r[1], r[2], r[3], dx, dy, Math.round(w), Math.round(h));
    if (opts.flash > 0) {
      ctx.globalAlpha *= Math.min(1, opts.flash);
      ctx.drawImage(tinted(id, opts.flashColor || '#ffffff'), dx, dy, Math.round(w), Math.round(h));
    }
    ctx.restore();
    return { w: w, h: h };
  }

  /* Tô màu kiểu NHÂN (multiply): trắng thành màu, đen giữ đen.
     WHY: chữ số HoloCure có sẵn viền đen trong sprite. Tô bằng source-in thì cả
     viền lẫn ruột thành một khối màu đặc — số "-2" hiện ra như một ô vuông xanh. */
  var mulCache = {};
  function tintedMul(id, color) {
    var key = id + color;
    if (mulCache[key]) return mulCache[key];
    var r = rect(id);
    var c = document.createElement('canvas');
    c.width = r[2]; c.height = r[3];
    var x = c.getContext('2d');
    x.drawImage(img, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
    x.globalCompositeOperation = 'multiply';
    x.fillStyle = color;
    x.fillRect(0, 0, r[2], r[3]);
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(img, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
    mulCache[key] = c;
    return c;
  }

  /* Vẽ quanh một điểm xoay tuỳ chọn (px, py tính theo tỉ lệ khung, 0..1).
     Dùng cho vũ khí trên tay: điểm xoay là chuôi, không phải giữa đáy. */
  function drawPivot(ctx, id, x, y, scale, opts) {
    opts = opts || {};
    var r = rect(id);
    var w = Math.round(r[2] * scale), h = Math.round(r[3] * scale);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (opts.alpha != null) ctx.globalAlpha *= opts.alpha;
    ctx.translate(Math.round(x), Math.round(y));
    if (opts.flip) ctx.scale(-1, 1);
    if (opts.rot) ctx.rotate(opts.rot);
    var dx = -Math.round(w * (opts.px == null ? 0.5 : opts.px)), dy = -Math.round(h * (opts.py == null ? 0.5 : opts.py));
    ctx.drawImage(img, r[0], r[1], r[2], r[3], dx, dy, w, h);
    if (opts.flash > 0) {
      ctx.globalAlpha *= Math.min(1, opts.flash);
      ctx.drawImage(tinted(id, opts.flashColor || '#ffffff'), dx, dy, w, h);
    }
    ctx.restore();
  }

  /* Khung thứ n của một vai trò (dùng cho chữ số, icon trạng thái). */
  function frameN(role, n) {
    var fr = framesOf(role, 'idle');
    return fr && fr.length ? fr[((n % fr.length) + fr.length) % fr.length] : null;
  }

  function draw(ctx, role, anim, t, x, y, scale, opts) {
    if (!ready) return false;
    var id = frameAt(role, anim, t, opts && opts.loop);
    if (id == null) return false;
    return drawId(ctx, id, x, y, scale, opts);
  }

  /* Chọn một biến thể ổn định theo toạ độ ô — cùng ô luôn ra cùng hình. */
  function variant(role, seed) {
    var fr = framesOf(role, 'idle');
    if (!fr || !fr.length) return null;
    var h = (seed * 2654435761) >>> 0;
    return fr[h % fr.length];
  }

  var maxCache = {};
  function maxDim(role) {
    if (maxCache[role] != null) return maxCache[role];
    var fr = framesOf(role, 'idle');
    var m = 0;
    (fr || []).forEach(function (id) { var r = rect(id); m = Math.max(m, r[2], r[3]); });
    return (maxCache[role] = m);
  }

  function size(role, anim) {
    var fr = framesOf(role, anim || 'idle');
    if (!fr) return null;
    var r = rect(fr[0]);
    return { w: r[2], h: r[3] };
  }

  /* --------------------------------------------------------- tên -> vai trò */

  function mobRole(name) {
    var n = (name || '').toLowerCase();
    if (n.indexOf('honeybear') >= 0) return 'mob.honeybear';
    if (n.indexOf('werewolf') >= 0) return 'mob.werewolf';
    var list = ['wolf', 'bat', 'bear', 'hedgehog', 'spider', 'raven'];
    for (var i = 0; i < list.length; i++) if (n.indexOf(list[i]) >= 0) return 'mob.' + list[i];
    return null;
  }
  function creatureRole(name) {
    var m = mobRole(name);
    if (m && has(m)) return m;
    var b = 'boss.' + (name || '').toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '');
    if (has(b)) return b;
    return m && has(m) ? m : null;
  }

  /* Hình vật phẩm đoán theo TÊN GỐC tiếng Anh (bản dịch có thể đổi, tên gốc thì
     không). Chữ riêng xét trước chữ chung: "Honeycomb" phải ra mật ong chứ không
     ra "comb"; "Earring" phải ra khuyên tai chứ không ra "ring". */
  /* Vũ khí tra bảng riêng: "Heart Drinker" là vũ khí chứ không phải bùa, và
     "Spearshield Lance" là giáo chứ không phải khiên. */
  var WEAPON_RULES = [
    ['whip', 'whip'], ['bow', 'bow'], ['spear', 'spear'], ['lance', 'spear'],
    ['dagger', 'dagger'], ['needle', 'dagger'], ['hook', 'dagger'],
    ['axe', 'axe'], ['hammer', 'hammer'], ['club', 'hammer'], ['haymaker', 'hammer'],
    ['stick', 'staff'], ['staff', 'staff'], ['rod', 'staff'], ['scepter', 'staff']
  ];
  var ICON_RULES = [
    ['whetstone', 'whetstone'],
    // Tên đá quý xét TRƯỚC "sap": "Sapphire Crown" từng ra lọ thuốc vì chứa chữ "sap".
    ['earring', 'earring'], ['crown', 'crown'], ['helmet', 'helmet'],
    ['gemstone', 'gem'], ['crystal', 'gem'], ['tree sap', 'potion'], ['ring', 'ring'], ['bracelet', 'ring'], ['crown', 'crown'], ['tiara', 'crown'],
    ['helmet', 'helmet'], ['mask', 'helmet'], ['hat', 'helmet'], ['hood', 'helmet'],
    ['boots', 'boots'], ['greaves', 'boots'], ['sandals', 'boots'], ['shoes', 'boots'],
    ['gauntlet', 'glove'], ['glove', 'glove'],
    ['shield', 'shield'], ['buckler', 'shield'], ['mirror', 'shield'],
    ['cloak', 'cloak'], ['cape', 'cloak'], ['robe', 'cloak'],
    ['armor', 'armor'], ['plate', 'armor'], ['mail', 'armor'], ['vest', 'armor'],
    ['coat', 'armor'], ['scales', 'armor'], ['physique', 'armor'], ['belt', 'armor'],
    ['potion', 'potion'], ['flask', 'potion'], ['wine', 'potion'], ['cocktail', 'potion'], ['transfusion', 'potion'], ['burst', 'potion'],
    ['bomb', 'bomb'], ['firecracker', 'bomb'], ['cherry', 'bomb'], ['explosive', 'bomb'],
    ['honey', 'honey'], ['acorn', 'honey'],
    ['feather', 'feather'],
    ['talisman', 'talisman'], ['bond', 'talisman'], ['charm', 'talisman'], ['amulet', 'talisman'],
    ['pendant', 'talisman'], ['doll', 'talisman'], ['contract', 'talisman'], ['necklace', 'talisman'],
    ['ritual', 'talisman'], ['curse', 'talisman'], ['heart', 'talisman'],
    ['rose', 'thorn'], ['thorn', 'thorn'], ['razorvine', 'thorn'], ['vine', 'thorn'], ['bramble', 'thorn'],
    ['steak', 'food'], ['ham', 'food'], ['roast', 'food'], ['meat', 'food'], ['stew', 'food'], ['soup', 'food'], ['pie', 'food']
  ];
  function iconRole(item) {
    var n = ((item && item.name) || '').toLowerCase();
    var i;
    if (item && item.weapon) {
      for (i = 0; i < WEAPON_RULES.length; i++) {
        if (n.indexOf(WEAPON_RULES[i][0]) >= 0 && has('icon.' + WEAPON_RULES[i][1])) return 'icon.' + WEAPON_RULES[i][1];
      }
      return has('icon.sword') ? 'icon.sword' : null;
    }
    for (i = 0; i < ICON_RULES.length; i++) {
      if (n.indexOf(ICON_RULES[i][0]) >= 0 && has('icon.' + ICON_RULES[i][1])) return 'icon.' + ICON_RULES[i][1];
    }
    var tags = (item && item.tags) || [];
    if (tags.indexOf('food') >= 0 && has('icon.food')) return 'icon.food';
    if (tags.indexOf('jewelry') >= 0 && has('icon.ring')) return 'icon.ring';
    return has('icon.misc') ? 'icon.misc' : null;
  }

  /* Hình tĩnh cho DOM (thẻ đồ, ô túi). Trả canvas MỚI mỗi lần — một nút DOM chỉ
     nằm được một chỗ. Nền và khung vẽ bằng CSS, ở đây chỉ có hình. */
  var domCache = {};
  function canvasFor(role, px, opts) {
    opts = opts || {};
    if (!has(role)) return null;
    var dpr = Math.min(3, global.devicePixelRatio || 1);
    var key = role + '|' + px + '|' + (opts.frame || 0) + '|' + dpr + '|' + (opts.gray ? 1 : 0);
    var src = domCache[key];
    if (!src) {
      var fr = framesOf(role, opts.anim || 'idle');
      var id = fr[(opts.frame || 0) % fr.length];
      var r = rect(id);
      src = document.createElement('canvas');
      src.width = src.height = Math.round(px * dpr);
      var c = src.getContext('2d');
      c.imageSmoothingEnabled = false;
      var inner = px * dpr * (opts.fill || 0.86);
      var sc = Math.max(1, Math.floor(inner / Math.max(r[2], r[3])));
      if (r[2] * sc > px * dpr || r[3] * sc > px * dpr) sc = inner / Math.max(r[2], r[3]);
      var w = r[2] * sc, h = r[3] * sc;
      if (opts.gray) c.filter = 'grayscale(1) brightness(.7)';
      c.drawImage(img, r[0], r[1], r[2], r[3], Math.round((src.width - w) / 2), Math.round((src.height - h) / 2), Math.round(w), Math.round(h));
      domCache[key] = src;
    }
    var out = document.createElement('canvas');
    out.width = src.width; out.height = src.height;
    out.style.width = px + 'px'; out.style.height = px + 'px';
    out.style.imageRendering = 'pixelated';
    out.getContext('2d').drawImage(src, 0, 0);
    return out;
  }

  global.HIC_SPR = {
    load: load,
    onReady: function (f) { if (ready) f(); else listeners.push(f); },
    get ready() { return ready; },
    get failed() { return failed; },
    has: has, hasAnim: hasAnim, frames: framesOf, frameAt: frameAt, duration: animDuration,
    draw: draw, drawId: drawId, drawPivot: drawPivot, frameN: frameN, tinted: function (id, c) { return tinted(id, c); }, tintedMul: tintedMul, variant: variant, size: size, maxDim: function (role) { return has(role) ? maxDim(role) : 0; }, rect: function (id) { return rect(id); },
    mobRole: mobRole, creatureRole: creatureRole, iconRole: iconRole, canvasFor: canvasFor,
    group: group
  };
})(window);
