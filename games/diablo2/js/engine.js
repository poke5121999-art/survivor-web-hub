/* Ác Quỷ II - engine.js
 * Vẽ thế giới D2: tile DT1 theo bản đồ DS1, sprite DCC nhiều hướng, nhân vật ghép lớp theo COF.
 * Đơn vị thế giới là subtile (1 tile D2 = 5x5 subtile). Hợp đồng dữ liệu: brain/plans/diablo2-d2r.md
 */
(function () {
  'use strict';
  var D2 = window.D2 = window.D2 || {};
  var W = 960, H = 540;
  var SPR = window.D2_SPRITES || { pages: [], sheets: {}, hero: { cofs: {}, layers: {} } };
  var OBJ = window.D2_SPRITES_OBJ || { pages: [], sheets: {} };
  var WORLD = window.D2_WORLD || { tilesets: {} };
  var UIA = window.D2_UI || { pages: [], icons: {}, skillIcons: {}, sfx: {}, music: {} };

  var E = D2.E = {
    W: W, H: H, canvas: null, ctx: null, images: {}, level: null,
    cam: { x: 0, y: 0 }, tw: 32, th: 16, shake: 0, ver: '', muted: false, view: 1,
    SPR: SPR, OBJ: OBJ, WORLD: WORLD, UI: UIA
  };

  /* ---------------------------------------------------------------- nạp ảnh */
  E.img = function (path) {
    if (!path) return null;
    var rec = E.images[path];
    if (rec) return rec;
    rec = E.images[path] = { img: new Image(), ok: false, fail: false, cbs: [] };
    rec.img.onload = function () { rec.ok = true; rec.cbs.splice(0).forEach(function (f) { f(true); }); };
    rec.img.onerror = function () { rec.fail = true; rec.cbs.splice(0).forEach(function (f) { f(false); }); };
    rec.img.src = path + (E.ver ? '?v=' + E.ver : '');
    return rec;
  };
  function whenLoaded(path) {
    return new Promise(function (res) {
      var r = E.img(path);
      if (r.ok) return res(true);
      if (r.fail) return res(false);
      r.cbs.push(res);
    });
  }

  // Hai cách nạp asset: bản v2 (D2_INDEX + nhóm assets/m/*.js đăng ký qua D2_REG, nạp khi cần) và bản cũ
  // (sprites.js, sprites_obj.js, world.js, ui.js nạp sẵn). Mỗi sheet nhớ mảng pages của nguồn chứa nó.
  var IDX = window.D2_INDEX || null;
  var SHEETS = {}, GROUPS = window.D2_GROUPS = window.D2_GROUPS || {}, waiting = {};
  SPR.heroPages = SPR.heroPages || {};
  window.D2_MAPS = window.D2_MAPS || {};
  window.D2_PRESETS = window.D2_PRESETS || {};
  function addSheets(sheets, pages) { Object.keys(sheets || {}).forEach(function (k) { SHEETS[k] = { s: sheets[k], pages: pages }; }); }
  addSheets(SPR.sheets, SPR.pages);
  addSheets(OBJ.sheets, OBJ.pages);
  if (SPR.pages && SPR.pages.length) ['AM', 'SO', 'NE', 'PA', 'BA', 'DZ', 'AI'].forEach(function (c) { SPR.heroPages[c] = SPR.pages; });

  function groupName(n) { return String(n).replace(/^m\//, ''); }
  window.D2_REG = function (name, g) {
    name = groupName(name); GROUPS[name] = GROUPS['m/' + name] = g;
    var pages = g.pages || [];
    addSheets(g.sheets, pages);
    if (g.hero) {
      Object.assign(SPR.hero.cofs, g.hero.cofs || {});
      Object.assign(SPR.hero.layers, g.hero.layers || {});
      Object.keys(g.hero.cofs || {}).forEach(function (k) { SPR.heroPages[k.split('.')[0]] = pages; });
    }
    Object.keys(g.tilesets || {}).forEach(function (k) { var ts = g.tilesets[k]; if (!ts.pages) ts.pages = pages; WORLD.tilesets[k] = ts; });
    Object.assign(window.D2_MAPS, g.maps || {});
    Object.assign(window.D2_PRESETS, g.presets || {});
    if (g.ui) Object.assign(UIA, g.ui);
    (waiting[name] || []).splice(0).forEach(function (f) { f(true); });
  };
  // Nạp một nhóm bằng thẻ <script> chèn động (chạy được cả trên file://)
  E.loadGroup = function (path) {
    var name = groupName(path);
    if (GROUPS[name]) return Promise.resolve(true);
    return new Promise(function (res) {
      var first = !waiting[name];
      (waiting[name] = waiting[name] || []).push(res);
      if (!first) return;
      var s = document.createElement('script');
      s.src = 'assets/m/' + name + '.js' + (E.ver ? '?v=' + E.ver : '');
      s.onerror = function () { (waiting[name] || []).splice(0).forEach(function (f) { f(false); }); };
      document.head.appendChild(s);
    });
  };
  function loadGroups(list) {
    var seen = {};
    return Promise.all(list.filter(function (g) { if (!g || seen[g]) return false; seen[g] = 1; return true; }).map(E.loadGroup));
  }
  E.index = IDX;
  E.monmap = (IDX && IDX.monmap) || SPR.monmap || {};
  E.objPresets = (IDX && IDX.objPresets) || OBJ.presets || {};

  function pagesOfAnims(anims, pages, out) {
    function scan(f) {
      for (var i = 0; i < f.length; i++) for (var d = 0; d < f[i].length; d++) {
        var r = f[i][d]; if (r && r.length > 6) out[pages[r[6]]] = 1;
      }
    }
    Object.keys(anims || {}).forEach(function (m) {
      scan(anims[m].f || []);
      (anims[m].fx || []).forEach(function (x) { scan(x.f || []); });
    });
    return out;
  }
  E.sheet = function (key) { var e = SHEETS[key]; return e ? e.s : null; };
  E.hasSheet = function (key) { return !!SHEETS[key] || !!(IDX && IDX.sheets && IDX.sheets[key]); };
  function sheetPages(keys) {
    var need = {};
    keys.forEach(function (k) {
      var e = SHEETS[k]; if (!e) return;
      if (!e.need) e.need = Object.keys(pagesOfAnims(e.s.anims, e.pages, {}));
      e.need.forEach(function (p) { need[p] = 1; });
    });
    return Promise.all(Object.keys(need).map(whenLoaded));
  }
  E.ensure = function (keys) {
    return loadGroups(keys.map(function (k) { return !SHEETS[k] && IDX && IDX.sheets && IDX.sheets[k]; }))
      .then(function () { return sheetPages(keys); });
  };
  E.ensurePrefix = function (prefixes) {
    var all = Object.keys(SHEETS).concat(IDX && IDX.sheets ? Object.keys(IDX.sheets) : []);
    return E.ensure(all.filter(function (k) { return prefixes.some(function (p) { return k.indexOf(p) === 0; }); }));
  };
  E.ensureHero = function (cls) {
    return loadGroups([IDX && IDX.hero && IDX.hero[cls]]).then(function () {
      var L = (SPR.hero && SPR.hero.layers) || {}, need = {}, pages = SPR.heroPages[cls] || [];
      Object.keys(L).forEach(function (k) { if (k.indexOf(cls + '.') === 0) pagesOfAnims(L[k], pages, need); });
      return Promise.all(Object.keys(need).map(whenLoaded));
    });
  };
  E.ensureTileset = function (name) {
    return loadGroups([IDX && IDX.tilesets && IDX.tilesets[name]]).then(function () {
      var ts = WORLD.tilesets && WORLD.tilesets[name];
      return ts ? Promise.all(ts.pages.map(whenLoaded)) : false;
    });
  };
  // DS1 + LvlPrest của một act (D2G.build đọc chúng nên phải nạp trước khi dựng khu)
  E.ensureMaps = function (act) {
    var g = [IDX && IDX.maps && IDX.maps[act]];
    Object.keys((IDX && IDX.tilesets) || {}).forEach(function (k) { if (k.indexOf('act' + act) === 0) g.push(IDX.tilesets[k]); });
    return loadGroups(g);
  };
  // Kích thước trang atlas UI để CSS phóng ảnh (background-size) khi vẽ icon to/nhỏ hơn gốc
  E.ensureUi = function () {
    return loadGroups([IDX && IDX.ui]).then(function () {
      return Promise.all((UIA.pages || []).map(whenLoaded));
    }).then(function () {
      UIA.pageSize = UIA.pages.map(function (p) { var im = E.images[p].img; return [im.naturalWidth, im.naturalHeight]; });
    });
  };

  E.init = function (canvas) {
    E.canvas = canvas; canvas.width = W; canvas.height = H;
    E.ctx = canvas.getContext('2d');
    E.ctx.imageSmoothingEnabled = false;
  };

  /* ------------------------------------------------------------- hình học iso */
  E.setLevel = function (lv) { E.level = lv; };
  E.project = function (x, y) { return [(x - y) * 16, (x + y) * 8]; };
  var camCache = [0, 0];
  E.camPx = function () {
    var p = E.project(E.cam.x, E.cam.y), s = E.shake > 0 ? E.shake : 0;
    return [Math.round(p[0] + (s ? (Math.random() - .5) * s : 0)), Math.round(p[1] + (s ? (Math.random() - .5) * s : 0))];
  };
  // viewOffX: mở một bên bảng thì khung nhìn dịch để hero ở giữa nửa còn trống (ViewportToLeft/Right của OpenDiablo2)
  E.updateCam = function () { var c = E.camPx(); camCache[0] = c[0] - (E.viewOffX || 0); camCache[1] = c[1]; };
  E.toScreen = function (x, y) {
    return [Math.round((x - y) * 16 - camCache[0] + W / 2), Math.round((x + y) * 8 - camCache[1] + H / 2)];
  };
  E.toWorld = function (sx, sy) {
    var a = (sx - W / 2 + camCache[0]) / 16, b = (sy - H / 2 + camCache[1]) / 8;
    return [(a + b) / 2, (b - a) / 2];
  };

  /* Hướng nhìn là số thực trong [0, 8): 0 = Tây trên màn hình, tăng theo chiều kim đồng hồ (2 = Bắc, 4 = Đông, 6 = Nam).
   * Sheet có `dirs` hướng thì lấy hướng gần nhất, nên sprite 8 và 16 hướng dùng chung một giá trị. */
  E.dirFromScreen = function (vx, vy) {
    var f = (Math.atan2(vy, vx) - Math.PI) / (2 * Math.PI);
    f -= Math.floor(f);
    return f * 8;
  };
  E.dirFromTiles = function (dx, dy) { return E.dirFromScreen((dx - dy) * 16, (dx + dy) * 8); };
  function dirIdx(dir, n) { return ((Math.round((dir || 0) * n / 8) % n) + n) % n; }
  E.dirIdx = dirIdx;

  /* ------------------------------------------------------- khung hình hoạt ảnh */
  // Thời lượng một lượt hoạt ảnh (ms), theo fps của animdata.d2
  E.animDur = function (anim) {
    if (!anim) return 0;
    var n = anim.frames || (anim.f ? anim.f.length : 1);
    return n * 1000 / (anim.fps || 12.5);
  };
  // once: dừng ở khung cuối thay vì lặp lại
  E.frameIndex = function (anim, t, once) {
    var n = anim.frames || (anim.f ? anim.f.length : 1);
    if (n <= 1) return 0;
    var k = Math.floor(Math.max(0, t) * (anim.fps || 12.5) / 1000);
    return once ? Math.min(n - 1, k) : k % n;
  };
  E.animOf = function (key, mode) { var s = E.sheet(key); return s && s.anims ? s.anims[mode] || null : null; };
  E.pickAnim = function (key, modes) {
    var s = E.sheet(key); if (!s || !s.anims) return null;
    for (var i = 0; i < modes.length; i++) if (s.anims[modes[i]]) return modes[i];
    return null;
  };

  /* Nhuộm màu kiểu colorshift của states.txt (lạnh xanh, độc lục...): E.tint = { k, c, a } đặt quanh lời gọi vẽ.
   * Mỗi cặp (trang atlas, màu) nhuộm một lần ra canvas riêng: nhân màu rồi phủ nhẹ, giữ nguyên alpha của sprite. */
  var tintCache = {};
  function tintedPage(path, img, t) {
    var key = path + '|' + t.k, cv = tintCache[key];
    if (cv) return cv;
    cv = tintCache[key] = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    var x = cv.getContext('2d');
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = 'multiply'; x.fillStyle = t.c; x.fillRect(0, 0, cv.width, cv.height);
    x.globalCompositeOperation = 'source-atop'; x.globalAlpha = t.a || 0; x.fillRect(0, 0, cv.width, cv.height);
    x.globalAlpha = 1; x.globalCompositeOperation = 'destination-in'; x.drawImage(img, 0, 0);
    return cv;
  }
  E.tint = null;
  function blit(pages, r, x, y, alpha, blend) {
    var path = pages[r[6] || 0], rec = E.images[path];
    if (!rec || !rec.ok) { E.img(path); return false; }
    var c = E.ctx, src = E.tint ? tintedPage(path, rec.img, E.tint) : rec.img;
    if (blend === 'add') c.globalCompositeOperation = 'lighter';
    var a = blend === 'alpha50' ? 0.5 : 1;
    if (alpha != null) a *= alpha;
    if (a < 1) c.globalAlpha = a;
    c.drawImage(src, r[0], r[1], r[2], r[3], Math.round(x - r[4]), Math.round(y - r[5]), r[2], r[3]);
    if (a < 1) c.globalAlpha = 1;
    if (blend === 'add') c.globalCompositeOperation = 'source-over';
    return true;
  }
  E.blit = blit;

  /* Vẽ một sprite tại chân (sx, sy). Trả false nếu thiếu sheet/anim (người gọi tự vẽ thay thế). */
  // Lớp trong suốt của vật thể (lửa trại, đuốc...) nằm ở an.fx: [{ blend, under, f }], cùng chỉ số khung và hướng.
  function drawFx(e, an, fi, d, sx, sy, alpha, under) {
    for (var i = 0; i < an.fx.length; i++) {
      var x = an.fx[i]; if (!!x.under !== under) continue;
      var r = x.f[fi] && x.f[fi][d];
      if (r && r.length) blit(e.pages, r, sx, sy, alpha, x.blend);
    }
  }
  E.drawSprite = function (key, mode, t, dir, sx, sy, alpha, once) {
    var e = SHEETS[key];
    if (!e) { if (IDX && IDX.sheets && IDX.sheets[key]) E.loadGroup(IDX.sheets[key]); return false; }
    var an = e.s.anims && e.s.anims[mode]; if (!an || !an.f || !an.f.length) return false;
    var fi = E.frameIndex(an, t, once || an.loop === false), fr = an.f[fi];
    var d = dirIdx(dir, an.dirs || fr.length), r = fr && fr[d];
    if (an.fx) drawFx(e, an, fi, d, sx, sy, alpha, true);
    if (r && r.length) blit(e.pages, r, sx, sy, alpha, an.blend);
    if (an.fx) drawFx(e, an, fi, d, sx, sy, alpha, false);
    return true;   // khung trống là hợp lệ (vd. khung đầu của vụ nổ)
  };

  /* Nhân vật người chơi: look = { cls: 'AM', wclass: '1HT', tok: { HD: 'LIT', RH: 'JAV', SH: 'BUC', ... } }.
   * Thứ tự lớp theo bảng ưu tiên của COF cho từng hướng, từng khung, như D2. */
  E.heroCof = function (look, mode) {
    var cofs = SPR.hero && SPR.hero.cofs; if (!cofs) return null;
    return cofs[look.cls + '.' + mode + '.' + look.wclass] || null;
  };
  E.drawHero = function (look, mode, t, dir, sx, sy, alpha, once) {
    var cof = E.heroCof(look, mode); if (!cof) return false;
    var L = SPR.hero.layers, pages = SPR.heroPages[look.cls] || [], fi = E.frameIndex(cof, t, once), d = dirIdx(dir, cof.dirs);
    var row = cof.pri[d] && cof.pri[d][fi]; if (!row) return false;
    var order = typeof row === 'string' ? row.split(',') : row, any = false;
    for (var i = 0; i < order.length; i++) {
      var ly = order[i], wc = ((cof.wclass && cof.wclass[ly]) || look.wclass).toUpperCase();
      var tok = (look.tok && look.tok[ly]) || 'LIT';
      var sh = L[look.cls + '.' + ly + '.' + tok + '.' + wc] || L[look.cls + '.' + ly + '.LIT.' + wc];
      var an = sh && sh[mode]; if (!an || !an.f) continue;
      var r = an.f[fi] && an.f[fi][d];
      if (r && r.length && blit(pages, r, sx, sy, alpha, cof.blend && cof.blend[ly])) any = true;
    }
    return any;
  };

  /* Bóng + hình thay thế khi thiếu art (để game vẫn chơi được). */
  E.drawBlob = function (sx, sy, color, r, dir, label) {
    var c = E.ctx;
    c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(sx, sy, r * 1.1, r * .5, 0, 0, 7); c.fill();
    c.fillStyle = color; c.beginPath(); c.ellipse(sx, sy - r * 1.2, r * .7, r * 1.3, 0, 0, 7); c.fill();
    c.strokeStyle = '#000'; c.lineWidth = 1; c.stroke();
    if (label) { c.fillStyle = '#fff'; c.font = '10px sans-serif'; c.textAlign = 'center'; c.fillText(label, sx, sy - r * 2.9); }
  };

  /* ------------------------------------------------------------- vẽ thế giới */
  // Ô tile (tx, ty): đỉnh trên của hình thoi ở toạ độ subtile (5tx, 5ty). Biến thể nằm ở bit 16+ của giá trị lớp.
  function tileVariant(ts, o, v) {
    var t = v & 0xffff, list = ts.tiles[o + '_' + (t >> 8) + '_' + (t & 0xff)];
    return list ? list[(v >>> 16) % list.length] : null;
  }
  function drawTile(ts, r, px, py, dy, alpha) {
    if (!r[2] || !r[3]) return;   // tile cổng (orientation 10, 11) và tường giữ chỗ: chỉ có cờ va chạm, không có hình
    if (px - 80 + r[2] < vL || px - 80 > vR || py + dy > vB || py + dy + r[3] < vT) return;
    blit(ts.pages, [r[0], r[1], r[2], r[3], 0, 0, r[6]], px - 80, py + dy, alpha);
  }
  function tileXY(tx, ty) {
    return [(tx - ty) * 80 - camCache[0] + W / 2, (tx + ty) * 40 - camCache[1] + H / 2];
  }
  function drawWall(ts, o, v, p) {
    var r = tileVariant(ts, o, v); if (!r) return;
    drawTile(ts, r, p[0], p[1], r[4] + 80);
    if (o === 3) { var r4 = tileVariant(ts, 4, v & 0xffff); if (r4) drawTile(ts, r4, p[0], p[1], r4[4] + 80); }
  }

  var vL = 0, vR = W, vT = 0, vB = H;
  /* drawables: [{ x, y (subtile), draw(sx, sy, d) }]. Thứ tự theo d2maprenderer: lượt 1 tường thấp + sàn + bóng,
   * lượt 2 theo từng tile (hàng trước, cột sau): tường đứng rồi các thực thể đứng trong tile đó, lượt 3 mái. */
  E.renderWorld = function (drawables) {
    var lv = E.level, c = E.ctx;
    E.updateCam();
    var V = E.view || 1;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    if (!lv) return;
    c.setTransform(V, 0, 0, V, W / 2 * (1 - V), H / 2 * (1 - V));
    vL = W / 2 - W / 2 / V; vR = W / 2 + W / 2 / V; vT = H / 2 - H / 2 / V; vB = H / 2 + H / 2 / V;
    var ts = WORLD.tilesets[lv.tileset];
    var tw = lv.tw, th = lv.th;
    // khung tile nhìn thấy, nới thêm phía dưới vì tường cao vẽ lên trên tile của nó
    var cs = [E.toWorld(vL, vT), E.toWorld(vR, vT), E.toWorld(vL, vB + 400), E.toWorld(vR, vB + 400)];
    var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    cs.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    var tx0 = Math.max(0, Math.floor(x0 / 5) - 2), tx1 = Math.min(tw - 1, Math.ceil(x1 / 5) + 1);
    var ty0 = Math.max(0, Math.floor(y0 / 5) - 2), ty1 = Math.min(th - 1, Math.ceil(y1 / 5) + 1);
    var tx, ty, i, k, p, v, o;

    if (ts) for (ty = ty0; ty <= ty1; ty++) for (tx = tx0; tx <= tx1; tx++) {
      k = ty * tw + tx; p = tileXY(tx, ty);
      for (i = 0; i < lv.walls.length; i++) {
        o = lv.walls[i].o[k];
        if (o >= 16 && o <= 19 && (v = lv.walls[i].t[k])) drawWall(ts, o, v, p);
      }
      for (i = 0; i < lv.floors.length; i++) {
        if ((v = lv.floors[i][k])) { var rf = tileVariant(ts, 0, v); if (rf) drawTile(ts, rf, p[0], p[1], rf[4]); }
      }
      for (i = 0; i < lv.shadows.length; i++) {
        if ((v = lv.shadows[i][k])) { var rs = tileVariant(ts, 13, v); if (rs) drawTile(ts, rs, p[0], p[1], rs[4] + 80, 160 / 255); }
      }
    }

    var buckets = {};
    for (i = 0; i < drawables.length; i++) {
      var d = drawables[i], b = Math.floor(d.y / 5) * tw + Math.floor(d.x / 5);
      (buckets[b] || (buckets[b] = [])).push(d);
    }
    function flushTile(list) {
      list.sort(function (a, b) { return (a.y - b.y) || (a.x - b.x) || ((a.z || 0) - (b.z || 0)); });
      for (var j = 0; j < list.length; j++) { var q = E.toScreen(list[j].x, list[j].y); list[j].draw(q[0], q[1], list[j]); }
    }
    for (ty = ty0; ty <= ty1; ty++) for (tx = tx0; tx <= tx1; tx++) {
      k = ty * tw + tx;
      if (ts) {
        p = tileXY(tx, ty);
        for (i = 0; i < lv.walls.length; i++) {
          o = lv.walls[i].o[k];
          if (o >= 1 && o <= 14 && o !== 10 && o !== 11 && o !== 13 && (v = lv.walls[i].t[k])) drawWall(ts, o, v, p);
        }
      }
      if (buckets[k]) { flushTile(buckets[k]); delete buckets[k]; }
    }
    // thực thể ngoài khung tile (vd. đạn bay ra mép bản đồ) vẫn vẽ, sau cùng
    Object.keys(buckets).forEach(function (b) { flushTile(buckets[b]); });
    // lượt 3: mái (yMin của mái đã trừ sẵn chiều cao mái lúc build)
    if (ts) for (ty = ty0; ty <= ty1; ty++) for (tx = tx0; tx <= tx1; tx++) {
      k = ty * tw + tx;
      for (i = 0; i < lv.walls.length; i++) {
        if (lv.walls[i].o[k] === 15 && (v = lv.walls[i].t[k])) { var rr = tileVariant(ts, 15, v); if (rr) { p = tileXY(tx, ty); drawTile(ts, rr, p[0], p[1], rr[4]); } }
      }
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
  };

  /* Lớp ánh sáng vẽ sau renderWorld: phủ tối `dark` (0..1) rồi khoét bằng các nguồn sáng.
   * lights: [{ x, y (px màn hình, chân nguồn), r (bán kính, subtile), rgb: [r,g,b] | null }]. Một subtile trên màn hình
   * rộng 16√2 px, cao bằng nửa (hình thoi iso), nên vùng sáng là elip dẹt. Vẽ ở 1/4 độ phân giải rồi phóng mượt. */
  var LQ = 4, lightCv = null;
  E.drawLights = function (dark, lights) {
    if (dark <= 0.01) return;
    if (!lightCv) { lightCv = document.createElement('canvas'); lightCv.width = W / LQ; lightCv.height = H / LQ; }
    var x = lightCv.getContext('2d'), V = E.view || 1, i, L, g, rx;
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over';
    x.clearRect(0, 0, lightCv.width, lightCv.height);
    x.fillStyle = 'rgba(0,0,0,' + dark + ')'; x.fillRect(0, 0, lightCv.width, lightCv.height);
    x.globalCompositeOperation = 'destination-out';
    for (i = 0; i < lights.length; i++) {
      L = lights[i]; rx = L.r * 22.6 * V / LQ;
      x.setTransform(1, 0, 0, 0.5, (W / 2 + (L.x - W / 2) * V) / LQ, (H / 2 + (L.y - H / 2) * V) / LQ);
      g = x.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.35, 'rgba(0,0,0,.9)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(-rx, -rx, rx * 2, rx * 2);
    }
    // nguồn có màu (lửa, đạn, quái phát sáng) nhuộm vùng sáng của nó: phủ màu mờ trên cùng lớp, nên cảnh chỉ ngả màu
    // chứ không sáng hơn ban ngày (ánh sáng của D2 là nhân màu, không cộng)
    x.globalCompositeOperation = 'source-over';
    for (i = 0; i < lights.length; i++) {
      L = lights[i]; if (!L.rgb) continue;
      rx = L.r * 22.6 * V / LQ;
      x.setTransform(1, 0, 0, 0.5, (W / 2 + (L.x - W / 2) * V) / LQ, (H / 2 + (L.y - H / 2) * V) / LQ);
      g = x.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, 'rgba(' + L.rgb.join(',') + ',' + (0.12 * dark).toFixed(3) + ')'); g.addColorStop(1, 'rgba(' + L.rgb.join(',') + ',0)');
      x.fillStyle = g; x.fillRect(-rx, -rx, rx * 2, rx * 2);
    }
    var c = E.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.imageSmoothingEnabled = true; c.drawImage(lightCv, 0, 0, W, H); c.imageSmoothingEnabled = false;
  };

  /* Ảnh trong atlas UI -> style CSS cho một phần tử DOM, phóng theo hệ số k. */
  E.uiSprite = function (r, k) {
    if (!r) return '';
    k = k || 1;
    var page = (UIA.pages || [])[r[6] || 0], dim = UIA.pageSize && UIA.pageSize[r[6] || 0];
    var bs = dim ? 'background-size:' + Math.round(dim[0] * k) + 'px ' + Math.round(dim[1] * k) + 'px;' : '';
    return 'background-image:url(' + page + (E.ver ? '?v=' + E.ver : '') + ');background-repeat:no-repeat;' + bs +
      'width:' + Math.round(r[2] * k) + 'px;height:' + Math.round(r[3] * k) + 'px;' +
      'background-position:-' + Math.round(r[0] * k) + 'px -' + Math.round(r[1] * k) + 'px;';
  };

  /* ----------------------------------------------------------------- chữ D2 */
  // Font gốc (local/font/latin/<font>.dc6 + .tbl, _tools/build_ui.py): ảnh lưới glyph mã 32..255, mỗi màu D2 một khối.
  // Bảng latin không có ă ơ ư đ và dấu thanh tiếng Việt, nên chuỗi có ký tự ngoài bảng vẽ bằng web font serif small-caps
  // cùng chiều cao chữ hoa và cùng màu trung bình của glyph. textFontOf là chỗ duy nhất quyết định chuyện đó.
  function textFontOf(str, font) {
    var F = (UIA.fonts || {})[font]; if (!F) return null;
    for (var i = 0; i < str.length; i++) {
      var k = str.charCodeAt(i);
      if (k < 32 || k > 255 || (k >= 127 && k < 160)) return null;   // 128..159: ô giữ chỗ trong bảng D2
    }
    return F;
  }
  function textColorKey(F, color) { return F.colors.indexOf(color) >= 0 ? color : 'white'; }
  function textRgb(font, color) {
    var F = (UIA.fonts || {})[font], c = (F && F.rgb[color]) || (UIA.textColors || {})[color] || [200, 200, 200];
    return 'rgb(' + c.join(',') + ')';
  }
  function webFont(font) {
    var F = (UIA.fonts || {})[font], cap = F ? F.base - F.cap : 10;
    return '600 ' + Math.round(cap / 0.66) + 'px "Palatino Linotype","Book Antiqua",Georgia,serif';
  }
  E.textFontOf = textFontOf;
  E.textHeight = function (font) { var F = (UIA.fonts || {})[font]; return F ? F.h : 16; };
  E.textWidth = function (str, font) {
    str = String(str); var F = textFontOf(str, font), w = 0;
    if (!F) { var c = E.ctx; c.save(); c.font = webFont(font); c.fontVariantCaps = 'small-caps'; w = c.measureText(str).width; c.restore(); return Math.ceil(w); }
    for (var i = 0; i < str.length; i++) w += F.adv[str.charCodeAt(i) - F.first];
    return w;
  };
  // Vẽ chuỗi lên canvas: (x, y) là góc trên của ô chữ cao textHeight(font); align 'left' | 'center' | 'right'.
  E.text = function (str, font, x, y, color, align, ctx) {
    str = String(str == null ? '' : str); color = color || 'white';
    var c = ctx || E.ctx, F = textFontOf(str, font), rec = F && E.img(F.img), w = E.textWidth(str, font);
    x = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x); y = Math.round(y);
    if (!rec || !rec.ok) {
      var G0 = (UIA.fonts || {})[font];
      c.save(); c.font = webFont(font); c.fontVariantCaps = 'small-caps'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      c.fillStyle = textRgb(font, color); c.fillText(str, x, y + (G0 ? G0.base : 13)); c.restore();
      return w;
    }
    var k = F.colors.indexOf(textColorKey(F, color));
    for (var i = 0; i < str.length; i++) {
      var g = str.charCodeAt(i) - F.first;
      c.drawImage(rec.img, (g % F.cols) * F.cw, (k * F.rows + ((g / F.cols) | 0)) * F.h, F.cw, F.h, x, y, F.cw, F.h);
      x += F.adv[g];
    }
    return w;
  };
  // Cùng chuỗi đó cho DOM: mỗi glyph là một <i> nền ảnh (chữ thật vẫn nằm trong, cỡ 0, để tìm/đọc được),
  // hoặc một <span> web font khi font gốc thiếu ký tự. data-f/data-c ghi font và màu D2 đã dùng.
  E.textHtml = function (str, font, color) {
    str = String(str == null ? '' : str); color = color || 'white';
    var F = textFontOf(str, font), esc = function (s) { return s.replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); };
    var head = '<span class="d2t' + (F ? '' : ' wf') + '" data-f="' + font + '" data-c="' + color + '"';
    if (!F) return head + ' style="font:' + webFont(font).replace(/"/g, "'") + ';line-height:' + E.textHeight(font) + 'px;font-variant:small-caps;color:' + textRgb(font, color) + '">' + esc(str) + '</span>';
    var k = F.colors.indexOf(textColorKey(F, color)), out = head + ' style="height:' + F.h + 'px;--fi:url(' + F.img + (E.ver ? '?v=' + E.ver : '') + ')">';
    for (var i = 0; i < str.length; i++) {
      var g = str.charCodeAt(i) - F.first;
      out += '<i style="width:' + F.cw + 'px;margin-right:' + (F.adv[g] - F.cw) + 'px;background-position:-' + ((g % F.cols) * F.cw) + 'px -' + ((k * F.rows + ((g / F.cols) | 0)) * F.h) + 'px">' + esc(str[i]) + '</i>';
    }
    return out + '</span>';
  };
  // nạp sẵn ảnh font để lần vẽ canvas đầu không phải rơi về web font
  E.textPreload = function () { Object.keys(UIA.fonts || {}).forEach(function (k) { E.img(UIA.fonts[k].img); }); };

  /* ----------------------------------------------------------------- âm thanh */
  // Khoá tiếng là tên cột Sound trong sounds.txt của D2 (vd. 'cursor_pickup', 'zombie_hit_1')
  var audioOn = false, musicEl = null, musicKey = null, sfxPool = {};
  E.audioUnlock = function () {
    if (audioOn) return; audioOn = true;
    if (musicKey) { var k = musicKey; musicKey = null; E.music(k); }
  };
  E.sfxFind = function (subs) {
    var m = UIA.sfx || {};
    for (var s = 0; s < subs.length; s++) if (subs[s] && m[subs[s]]) return subs[s];
    return null;
  };
  // Âm lượng lấy trong khoảng Volume Min/Max (0..255) của sounds.txt, cao độ trong Pitch Min/Max (100 = giữ nguyên).
  // pos = { x, y } (subtile): tiếng nhỏ dần theo khoảng cách tới camera (luôn theo hero), quá SFX_FAR thì không phát.
  var SFX_FAR = 30, SFX_NEAR = 5;
  E.sfxMaster = 0.85;
  function rangeOf(v, d) { return v == null ? d : Array.isArray(v) ? v[0] + Math.random() * (v[1] - v[0]) : v; }
  E.sfx = function (subs, vol, pos) {
    if (typeof subs === 'string') subs = [subs];
    var k = E.sfxFind(subs || []); if (!k) return null;
    var att = 1;
    if (pos) {
      var d = Math.hypot(pos.x - E.cam.x, pos.y - E.cam.y);
      if (d >= SFX_FAR) return null;
      att = d <= SFX_NEAR ? 1 : 1 - (d - SFX_NEAR) / (SFX_FAR - SFX_NEAR);
    }
    var grp = UIA.sfxGroup && UIA.sfxGroup[k];
    if (grp && grp.length) k = grp[Math.floor(Math.random() * grp.length)];
    if (!UIA.sfx[k] || !audioOn || E.muted) return k;
    if (vol == null) vol = rangeOf(UIA.sfxVol && UIA.sfxVol[k], 255) / 255;
    var P = window.D2DATA && D2DATA.sfxPitch && D2DATA.sfxPitch[k];
    try {
      var pool = sfxPool[k] || (sfxPool[k] = []), a = null;
      for (var i = 0; i < pool.length; i++) if (pool[i].ended || pool[i].paused) { a = pool[i]; break; }
      if (!a) { if (pool.length > 4) return k; a = new Audio(UIA.sfx[k] + (E.ver ? '?v=' + E.ver : '')); a.preservesPitch = false; pool.push(a); }
      a.volume = Math.max(0, Math.min(1, vol * att * E.sfxMaster)); a.currentTime = 0;
      a.playbackRate = P ? rangeOf(P, 100) / 100 : 1;
      var pr = a.play(); if (pr && pr.catch) pr.catch(function () {});
    } catch (e) {}
    return k;
  };
  // Tiếng nền lặp của khu (Day/Night Ambience của soundenviron); một kênh, đổi khoá thì thay bài
  var ambEl = null, ambKey = null;
  E.ambient = function (key) {
    if (key === ambKey && (ambEl || !audioOn)) return;
    ambKey = key;
    if (ambEl) { ambEl.pause(); ambEl = null; }
    if (!audioOn || E.muted || !key || !UIA.sfx || !UIA.sfx[key]) return;
    try {
      ambEl = new Audio(UIA.sfx[key] + (E.ver ? '?v=' + E.ver : '')); ambEl.loop = true;
      ambEl.volume = rangeOf(UIA.sfxVol && UIA.sfxVol[key], 255) / 255 * E.sfxMaster;
      var pr = ambEl.play(); if (pr && pr.catch) pr.catch(function () {});
    } catch (e) {}
  };
  E.music = function (key) {
    if (key === musicKey) return;
    musicKey = key;
    if (!audioOn) return;
    try {
      if (musicEl) { musicEl.pause(); musicEl = null; }
      var src = UIA.music && UIA.music[key]; if (!src || E.muted) return;
      musicEl = new Audio(src + (E.ver ? '?v=' + E.ver : '')); musicEl.loop = true; musicEl.volume = 0.35;
      var pr = musicEl.play(); if (pr && pr.catch) pr.catch(function () {});
    } catch (e) {}
  };
})();
