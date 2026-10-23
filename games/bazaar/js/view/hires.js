/* Chợ Phiên — BZHires: nâng ảnh art 512 px lên bản gốc (kho cho-phien-assets) khi cần nét hơn.
   Luật: phần tử luôn hiện bản cục bộ trước. Nếu chiều cao hộp art × devicePixelRatio > 512, hoặc là khung "zoom"
   (tooltip ghim, xem trước khoá, sảnh, chọn bùa), thì tải sẵn URL gốc (cùng đường dẫn tương đối dưới base, ?v=rev)
   và đổi background-image khi tải xong. Lỗi tải: đánh dấu kho "sập" cả phiên, không thử lại, giữ nguyên bản cục bộ
   (không đổi bố cục vì cùng tỉ lệ ảnh; trình duyệt tự ghi một dòng "Failed to load resource" cho yêu cầu hỏng, mã trang không ném lỗi). */
(function (root) {
  'use strict';
  // cạnh bản cục bộ theo nhóm (tools/shrink_art.py SIZE): ô art × DPR lớn hơn thì đổi sang bản gốc của kho
  var H = root.BZHires = {}, down = false, cache = {}, LOCAL_PX = { cards: 320, encounters: 256 }, sharp = {};
  var cfg = function () { return root.BZ_HIRES || null; };
  H.isDown = function () { return down; };
  H.hiresUrl = function (rel) { // "art/cards/X.webp[?v=..]" -> URL kho, hoặc null nếu ngoài nhóm
    var c = cfg(); if (!c || down || !rel) return null;
    rel = String(rel).split('?')[0].replace(/^\.?\//, '');
    var m = /^art\/([^/]+)\//.exec(rel);
    if (!m || c.groups.indexOf(m[1]) < 0) return null;
    return c.base + rel + '?v=' + (root.BZ_REV || '');
  };
  H.wants = function (h, zoom, rel) {
    var m = /^art\/([^/]+)\//.exec(String(rel || '').replace(/^\.?\//, '')), px = (m && LOCAL_PX[m[1]]) || 512;
    return !!zoom || (h * (root.devicePixelRatio || 1) > px);
  };
  // Mờ → rõ dần (chủ dự án 2026-10-23): els[0] là lớp art chính, các phần tử sau (màn xám hồi chiêu) chỉ nhận ảnh, không nhận lớp mờ.
  // Chưa có bản thật trong cache thì vẽ hai lớp "bản thật, bản 32 px (data/thumbs.js)": trình duyệt hiện bản 32 px tới khi bản thật giải
  // mã xong; tải xong thì bỏ lớp 32 px (ảnh char có nền trong suốt, để lại sẽ thành quầng mờ) và chạy hiệu ứng rõ dần.
  H.paint = function (els, rel, url) {
    els = els && els.length != null ? Array.prototype.slice.call(els) : [els];
    var key = String(rel || '').split('?')[0].replace(/^\.?\//, ''), th = root.BZ_THUMBS && root.BZ_THUMBS[key], full = 'url("' + url + '")';
    if (!th || sharp[url]) { els.forEach(function (e) { e.style.backgroundImage = full; }); return; }
    var both = full + ', url("' + th + '")';
    els.forEach(function (e) { e.style.backgroundImage = both; e._lq = both; });
    els[0].classList.add('bz-lq');
    var im = new Image();
    im.onload = im.onerror = function () {
      sharp[url] = 1;
      els.forEach(function (e, i) {
        if (e._lq !== both) return;
        e._lq = null;
        if (e.style.backgroundImage.indexOf('data:') >= 0) e.style.backgroundImage = full; // BZHires.apply có thể đã đổi sang bản gốc
        if (i === 0) { e.classList.remove('bz-lq'); e.classList.add('bz-sharp'); setTimeout(function () { e.classList.remove('bz-sharp'); }, 600); }
      });
    };
    im.src = url;
  };
  function load(url, ok) {
    var c = cache[url];
    if (c === 1) return ok();
    if (c === 2) return;               // đã hỏng
    if (c) return c.push(ok);          // đang tải: xếp hàng chờ
    var q = cache[url] = [ok], im = new Image();
    im.onload = function () { cache[url] = 1; q.forEach(function (f) { f(); }); };
    im.onerror = function () { cache[url] = 2; down = true; };   // một lỗi là đủ: không gọi kho nữa trong phiên
    im.src = url;
  }
  // apply(els, rel, {h, zoom}): els = phần tử hoặc mảng; h = chiều cao hộp art (px CSS), thiếu thì đo
  H.apply = function (els, rel, o) {
    o = o || {}; els = els && els.length != null ? Array.prototype.slice.call(els) : [els];
    var url = H.hiresUrl(rel); if (!url || !els[0]) return;
    var h = o.h != null ? o.h : els[0].clientHeight;
    if (!h && !o.zoom) { if (!o.retry && root.requestAnimationFrame) root.requestAnimationFrame(function () { H.apply(els, rel, { zoom: o.zoom, retry: 1 }); }); return; }
    if (!H.wants(h, o.zoom, rel)) return;
    els.forEach(function (e) { e._hrWant = url; });
    load(url, function () { els.forEach(function (e) { if (e._hrWant === url) e.style.backgroundImage = 'url("' + url + '")'; }); });
  };
})(window);
