/* ==========================================================================
 * ATLAS — lớp vẽ bằng ẢNH
 *
 * Trước file này, mọi thứ trên màn hình vẽ bằng lệnh hình học. Nó chạy được,
 * nhưng không "feel" — một con quái là một hình elip màu phẳng thì có tô đẹp
 * tới đâu vẫn là một hình elip.
 *
 * Nguyên tắc của file này, và là lý do nó tồn tại tách riêng:
 *
 *     ĐỔI ART = THAY FILE PNG + SỬA assets/asset-map.json. KHÔNG ĐỤNG CODE.
 *
 * Không có tên sprite nào nằm trong code game. Code chỉ hỏi Atlas bằng KHOÁ
 * ('mobs.purun.idle', 'elem.thunder.trail'), Atlas tra manifest rồi vẽ. Muốn vẽ
 * đè art mới thì vẽ lại đúng dải ảnh đó là xong, không phải đi tìm chỗ nào trong
 * 2700 dòng game.js đang gọi nó.
 *
 * Mỗi sprite là MỘT file: dải ngang gồm N khung dán liền nhau. Một file cho một
 * hành động — dễ mở ra vẽ đè, dễ đếm khung, và chạy được từ file:// không cần
 * server (chỉ drawImage, không đọc pixel, nên không dính chuyện canvas bị nhiễm).
 *
 * ĐIỂM NEO (origin) là thứ dễ sai nhất và sai thì thấy ngay: neo sai một chút là
 * cả con quái trôi khỏi cái bóng của nó. Manifest giữ nguyên ox/oy của sprite gốc.
 *
 * Thiếu ảnh KHÔNG BAO GIỜ được làm hỏng trận đấu: Atlas trả về null, và bên gọi
 * rơi về đúng đoạn vẽ hình học cũ. Nhờ vậy thay art được từng phần một.
 * ========================================================================== */
(function (G) {
  'use strict';

  var Atlas = {
    base: 'assets/spr/',
    map: null,
    ready: false,
    entries: {},      // khoá -> { img, frames, w, h, ox, oy, loaded }
    missing: {},      // khoá đã hỏi mà không có — để báo một lần, không spam
    pending: 0
  };

  /* Nạp manifest rồi nạp mọi ảnh nó nhắc tới.
   *
   * Nạp bằng THẺ SCRIPT chứ không phải fetch(): game này mở được bằng cách bấm
   * đúp vào index.html, và fetch() trên file:// bị trình duyệt chặn thẳng. Thẻ
   * script thì không. `_tools/pack.py` xuất cả hai bản — .json để người sửa,
   * .js để máy nạp — nên bản .js luôn khớp bản .json.
   *
   * Chưa có file cũng không sao: `ready` vẫn bật, entries rỗng, và mọi chỗ vẽ rơi
   * về hình học như trước. */
  Atlas.load = function (url, cb) {
    var self = this;
    var done = function () { self.ready = true; if (cb) cb(self); };
    var s = document.createElement('script');
    s.src = url.replace(/\.json$/, '.js');
    s.onload = function () {
      if (G.ASSET_MAP) { self.map = G.ASSET_MAP; self.flatten(G.ASSET_MAP, ''); }
      if (!self.pending) done(); else self._done = done;
    };
    s.onerror = done;      // chưa đóng gói art thì thôi, không kêu ca
    document.head.appendChild(s);
  };

  /* Đi khắp manifest, hễ gặp một nút có `spr` thì đăng ký nó thành một entry. */
  Atlas.flatten = function (node, prefix) {
    var self = this;
    if (!node || typeof node !== 'object') return;
    if (typeof node.spr === 'string') { this.register(prefix, node); return; }
    Object.keys(node).forEach(function (k) {
      if (k === 'note') return;
      self.flatten(node[k], prefix ? prefix + '.' + k : k);
    });
  };

  Atlas.register = function (key, def) {
    var self = this;
    var e = {
      spr: def.spr,
      frames: Math.max(1, def.frames || 1),
      w: def.w || 0, h: def.h || 0,
      ox: def.ox || 0, oy: def.oy || 0,
      fps: def.fps || 14,
      scale: def.scale || 1,
      // Thuộc tính của ẢNH, không phải của game: hướng mũi (rot), chiều dài khi
      // cầm (len), chỗ nắm dọc trục (grip). Đổi ảnh vũ khí khác hướng thì sửa
      // ba số này trong asset-map, không đụng code vẽ.
      rot: (def.rot || 0) * Math.PI / 180,
      len: def.len || 0,
      grip: def.grip === undefined ? 0.5 : def.grip,
      file: def.file || (def.spr + '.png'),
      loaded: false, img: null
    };
    this.entries[key] = e;
    this.pending++;
    var img = new Image();
    img.onload = function () {
      e.img = img; e.loaded = true;
      // Dải ngang: bề rộng một khung suy ra từ ảnh, không tin số trong manifest —
      // ảnh mới vẽ đè có thể to nhỏ khác đi, và nó phải vẫn chạy.
      e.w = img.width / e.frames;
      e.h = img.height;
      self.pending--;
      if (!self.pending && self._done) { self._done(); self._done = null; }
    };
    img.onerror = function () {
      e.loaded = false;
      self.pending--;
      if (!self.pending && self._done) { self._done(); self._done = null; }
    };
    img.src = this.base + (def.file || def.spr + '.png');
  };

  /* Tra một khoá. Không có thì trả null — bên gọi tự lo phần vẽ hình học. */
  Atlas.get = function (key) {
    var e = this.entries[key];
    if (e && e.loaded) return e;
    if (!this.missing[key]) this.missing[key] = 1;
    return null;
  };
  Atlas.has = function (key) { return !!this.get(key); };

  /* Đường dẫn file của một khoá — để HTML dùng thẻ <img>, chứ canvas thì đã có
     entry.img rồi. Trả '' nếu chưa có ảnh, bên gọi tự lo. */
  Atlas.src = function (key) {
    var e = this.entries[key];
    return e ? this.base + e.file : '';
  };

  /* Mọi khoá đã nạp xong nằm dưới một nhánh, ví dụ 'doodads.grass'.
     Nhờ nó mà code game không cần biết biome đó có mấy món trang trí, tên gì —
     thêm một bụi cỏ mới = thêm một dòng trong asset-map, không đụng code. */
  Atlas.keysUnder = function (prefix) {
    var out = [], pre = prefix + '.', e = this.entries;
    // KHÔNG sắp xếp: giữ đúng thứ tự trong asset-map, vì bên rải trang trí
    // dựa vào đó để thiên về mấy món nhỏ đứng đầu danh sách.
    for (var k in e) if (k.indexOf(pre) === 0 && e[k].loaded) out.push(k);
    return out;
  };

  /* Khung nào theo thời gian. loop=false thì dừng ở khung cuối. */
  Atlas.frameAt = function (e, ms, loop) {
    var f = Math.floor(ms / 1000 * (e.fps || 14));
    if (loop === false) return Math.min(e.frames - 1, Math.max(0, f));
    return ((f % e.frames) + e.frames) % e.frames;
  };

  /* Vẽ. (x, y) là ĐIỂM NEO trong thế giới — thường là chỗ chân chạm đất.
   * opt: { frame, ms, loop, flip, scale, alpha, rot, tint, tintA }
   *
   * `flip` chỉ lật theo trục X quanh chính điểm neo. Đây là toàn bộ chuyện
   * "hướng nhìn" của một game top-down làm theo kiểu rẻ nhất: thân lật trái/phải,
   * còn vũ khí thì code game tự xoay riêng bằng ctx.rotate. */
  Atlas.draw = function (ctx, key, x, y, opt) {
    var e = (typeof key === 'string') ? this.get(key) : key;
    if (!e) return false;
    opt = opt || {};
    var f = (opt.frame !== undefined) ? Math.min(e.frames - 1, Math.max(0, opt.frame | 0))
                                      : this.frameAt(e, opt.ms || 0, opt.loop);
    var s = opt.scale || 1;
    ctx.save();
    // Art là pixel art. Để trình duyệt nội suy khi phóng to là nát hết nét —
    // con boss 28px thổi lên 110px thành một vũng màu nhoè. Tắt làm mượt thì nó
    // lên thành khối pixel to, sắc, và ĐÚNG với phần art còn lại.
    ctx.imageSmoothingEnabled = false;
    if (opt.alpha !== undefined) ctx.globalAlpha *= opt.alpha;
    ctx.translate(x, y);
    if (opt.rot) ctx.rotate(opt.rot);
    if (s !== 1 || opt.flip) ctx.scale(opt.flip ? -s : s, s);
    if (opt.blend) ctx.globalCompositeOperation = opt.blend;
    if (opt.tint) {
      ctx.drawImage(this.tinted(e, f, opt.tint, opt.tintA), -e.ox, -e.oy);
    } else {
      ctx.drawImage(e.img, f * e.w, 0, e.w, e.h, -e.ox, -e.oy, e.w, e.h);
    }
    ctx.restore();
    return true;
  };

  /* Loé trắng lúc ăn đòn phải bám ĐÚNG HÌNH DẠNG sprite.
   *
   * Cách hiển nhiên — vẽ sprite rồi `globalCompositeOperation='source-atop'` +
   * fillRect — SAI trên canvas chính, và sai theo kiểu rất dễ tin là đúng: 'source-atop'
   * tô lên mọi chỗ đích ĐANG CÓ MÀU, mà đích ở đây là cả mặt sân đã vẽ xong, nên
   * nó tô kín nguyên hình chữ nhật. Trên màn hình ra một ô vuông trắng đứng giữa
   * trận đấu.
   *
   * Phải làm trên một canvas phụ TRỐNG: ở đó ngoài sprite ra không có gì, nên
   * 'source-atop' mới cắt đúng theo alpha của chính nó. */
  Atlas.tinted = function (e, frame, color, alpha) {
    var c = this._scratch;
    if (!c) { c = this._scratch = document.createElement('canvas'); this._sctx = c.getContext('2d'); }
    if (c.width !== e.w || c.height !== e.h) { c.width = e.w; c.height = e.h; }
    var g = this._sctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, e.w, e.h);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.drawImage(e.img, frame * e.w, 0, e.w, e.h, 0, 0, e.w, e.h);
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = alpha === undefined ? 1 : alpha;
    g.fillStyle = color;
    g.fillRect(0, 0, e.w, e.h);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    return c;
  };

  /* Vẽ một dải sprite kéo dài giữa hai điểm — dùng cho vệt nguyên tố. Ảnh được
   * xoay theo hướng và kéo giãn cho vừa quãng đường. */
  Atlas.drawStretched = function (ctx, key, x0, y0, x1, y1, opt) {
    var e = (typeof key === 'string') ? this.get(key) : key;
    if (!e) return false;
    opt = opt || {};
    var dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
    var f = (opt.frame !== undefined) ? Math.min(e.frames - 1, Math.max(0, opt.frame | 0))
                                      : this.frameAt(e, opt.ms || 0, opt.loop);
    ctx.save();
    if (opt.alpha !== undefined) ctx.globalAlpha *= opt.alpha;
    if (opt.blend) ctx.globalCompositeOperation = opt.blend;
    ctx.translate(x0, y0);
    ctx.rotate(Math.atan2(dy, dx));
    var th = (opt.thickness || e.h) ;
    ctx.drawImage(e.img, f * e.w, 0, e.w, e.h, 0, -th / 2, L, th);
    ctx.restore();
    return true;
  };

  /* Danh sách khoá đã hỏi mà chưa có ảnh — để biết còn thiếu gì mà vẽ. */
  Atlas.report = function () {
    return { loaded: Object.keys(this.entries).filter(function (k) { return Atlas.entries[k].loaded; }).length,
             total: Object.keys(this.entries).length,
             missing: Object.keys(this.missing) };
  };

  G.Atlas = Atlas;
})(window.DP = window.DP || {});
