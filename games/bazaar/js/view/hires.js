/* Chợ Phiên — BZHires: nâng ảnh art 512 px lên bản gốc (kho cho-phien-assets) khi cần nét hơn.
   Luật: phần tử luôn hiện bản cục bộ trước. Nếu chiều cao hộp art × devicePixelRatio > 512, hoặc là khung "zoom"
   (tooltip ghim, xem trước khoá, sảnh, chọn bùa), thì tải sẵn URL gốc (cùng đường dẫn tương đối dưới base, ?v=rev)
   và đổi background-image khi tải xong. Lỗi tải: đánh dấu kho "sập" cả phiên, không thử lại, giữ nguyên bản cục bộ
   (không đổi bố cục vì cùng tỉ lệ ảnh; trình duyệt tự ghi một dòng "Failed to load resource" cho yêu cầu hỏng, mã trang không ném lỗi). */
(function (root) {
  'use strict';
  var H = root.BZHires = {}, down = false, cache = {}, LOCAL_PX = 512;
  var cfg = function () { return root.BZ_HIRES || null; };
  H.isDown = function () { return down; };
  H.hiresUrl = function (rel) { // "art/cards/X.webp[?v=..]" -> URL kho, hoặc null nếu ngoài nhóm
    var c = cfg(); if (!c || down || !rel) return null;
    rel = String(rel).split('?')[0].replace(/^\.?\//, '');
    var m = /^art\/([^/]+)\//.exec(rel);
    if (!m || c.groups.indexOf(m[1]) < 0) return null;
    return c.base + rel + '?v=' + (root.BZ_REV || '');
  };
  H.wants = function (h, zoom) { return !!zoom || (h * (root.devicePixelRatio || 1) > LOCAL_PX); };
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
    if (!H.wants(h, o.zoom)) return;
    els.forEach(function (e) { e._hrWant = url; });
    load(url, function () { els.forEach(function (e) { if (e._hrWant === url) e.style.backgroundImage = 'url("' + url + '")'; }); });
  };
})(window);
