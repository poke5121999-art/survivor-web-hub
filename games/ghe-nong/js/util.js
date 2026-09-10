/* util.js — mấy thứ dùng ở khắp nơi.
   Không phụ thuộc file nào khác, nạp đầu tiên. */
(function (G) {
  'use strict';

  /* ── DOM ── */
  G.$ = function (s, g) { return (g || document).querySelector(s); };
  G.$$ = function (s, g) { return Array.prototype.slice.call((g || document).querySelectorAll(s)); };

  /** tạo phần tử: el('div.lop#id', {attr}, [con...] | 'chữ') */
  G.el = function (mo, thuoc, con) {
    var ten = 'div', lop = [], id = null;
    mo.replace(/^([a-z0-9]+)?/i, function (m) { if (m) ten = m; return ''; });
    (mo.match(/\.[-\w]+/g) || []).forEach(function (c) { lop.push(c.slice(1)); });
    var mid = mo.match(/#([-\w]+)/); if (mid) id = mid[1];
    var e = document.createElement(ten);
    if (lop.length) e.className = lop.join(' ');
    if (id) e.id = id;
    if (thuoc) for (var k in thuoc) {
      if (k === 'text') e.textContent = thuoc[k];
      else if (k === 'html') e.innerHTML = thuoc[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), thuoc[k]);
      else if (thuoc[k] != null && thuoc[k] !== false) e.setAttribute(k, thuoc[k]);
    }
    if (con != null) {
      if (typeof con === 'string') e.textContent = con;
      else [].concat(con).forEach(function (c) { if (c) e.appendChild(c); });
    }
    return e;
  };

  G.xoa = function (e) { while (e && e.firstChild) e.removeChild(e.firstChild); return e; };

  /* ── số ── */
  G.kep = function (x, a, b) { return x < a ? a : (x > b ? b : x); };
  G.lam = function (x) { return Math.round(x); };
  G.so = function (n) { return (n | 0).toLocaleString('vi-VN'); };
  G.tien = function (n) {
    if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + ' tỉ';
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + ' tr';
    if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + 'k';
    return String(n | 0);
  };
  G.phanTram = function (x) { return Math.round(x * 100) + '%'; };

  /* ── ngẫu nhiên có hạt giống (mulberry32) ──
     Dùng hạt giống để một ca chơi lại vẫn ra cùng chuỗi sự kiện khi cần gỡ lỗi. */
  G.Rng = function (hat) {
    var a = (hat >>> 0) || 1;
    function r() {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    r.nguyen = function (n) { return Math.floor(r() * n); };
    r.khoang = function (a2, b) { return a2 + Math.floor(r() * (b - a2 + 1)); };
    r.chon = function (m) { return m[Math.floor(r() * m.length)]; };
    r.tron = function (m) {
      var x = m.slice();
      for (var i = x.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = x[i]; x[i] = x[j]; x[j] = t; }
      return x;
    };
    r.duoc = function (p) { return r() < p; };
    /** rút n phần tử theo trọng số w(x) */
    r.rut = function (m, w) {
      var tong = 0, i;
      for (i = 0; i < m.length; i++) tong += w(m[i]);
      var v = r() * tong;
      for (i = 0; i < m.length; i++) { v -= w(m[i]); if (v <= 0) return m[i]; }
      return m[m.length - 1];
    };
    r.hat = function () { return a; };
    return r;
  };

  /* ── hạng chữ cho chỉ số (ngưỡng chốt trong DESIGN.md §2.1) ── */
  var NGUONG = [[1150, 'S'], [1000, 'A'], [800, 'B'], [600, 'C'], [450, 'D'], [300, 'E'], [150, 'F'], [0, 'G']];
  G.hangChu = function (v) {
    for (var i = 0; i < NGUONG.length; i++) {
      if (v >= NGUONG[i][0]) {
        var duoi = NGUONG[i][0], tren = i === 0 ? 1200 : NGUONG[i - 1][0];
        var cong = (v - duoi) >= (tren - duoi) * 0.5 && NGUONG[i][1] !== 'S' ? '+' : '';
        return NGUONG[i][1] + cong;
      }
    }
    return 'G';
  };
  G.hangChuGoc = function (v) { return G.hangChu(v).replace('+', ''); };

  /* ── hạng năng khiếu G..S → hệ số (DESIGN.md §2.3) ── */
  var HESO_NK = { S: 1.10, A: 1.05, B: 1.00, C: 0.95, D: 0.88, E: 0.80, F: 0.70, G: 0.55 };
  G.hesoNangKhieu = function (h) { return HESO_NK[h] != null ? HESO_NK[h] : 1; };
  G.THU_TU_NK = ['G', 'F', 'E', 'D', 'C', 'B', 'A', 'S'];
  /** nâng hạng năng khiếu lên n bậc, tối đa S */
  G.nangNK = function (h, n) {
    var i = G.THU_TU_NK.indexOf(h);
    if (i < 0) i = 0;
    return G.THU_TU_NK[G.kep(i + n, 0, 7)];
  };

  /* ── chờ ── */
  G.doi = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  /* ── rung nhẹ (tắt được trong cài đặt) ── */
  G.rung = function (kieu) {
    if (!G.CAI || !G.CAI.rung) return;
    if (!navigator.vibrate) return;
    navigator.vibrate(kieu === 'to' ? [18, 40, 26] : kieu === 'vua' ? 18 : 8);
  };

  /* ── số bay lên trong khung cảnh ── */
  G.soBay = function (khung, chu, mau, x, y) {
    if (!khung) return;
    var e = G.el('div.so-bay', { text: chu });
    e.style.color = mau || '#3ddc97';
    e.style.left = (x != null ? x : 40 + Math.random() * 20) + '%';
    e.style.top = (y != null ? y : 55) + '%';
    khung.appendChild(e);
    setTimeout(function () { e.remove(); }, 1200);
  };

  /* ── pháo hoa / giấy màu ── */
  G.phaoHoa = function (n, mau) {
    var kh = G.$('#phao-hoa'); if (!kh) return;
    var mausac = mau || ['#ffd76e', '#3ddc97', '#7fd6ff', '#ff9ec4', '#b08af0'];
    for (var i = 0; i < (n || 40); i++) {
      var h = G.el('div.hat');
      h.style.left = (30 + Math.random() * 40) + '%';
      h.style.top = (30 + Math.random() * 20) + '%';
      h.style.background = mausac[i % mausac.length];
      h.style.setProperty('--dx', (Math.random() * 500 - 250) + 'px');
      h.style.setProperty('--dy', (200 + Math.random() * 300) + 'px');
      h.style.animationDelay = (Math.random() * 0.35) + 's';
      kh.appendChild(h);
      (function (x) { setTimeout(function () { x.remove(); }, 2200); })(h);
    }
  };

  /* ── băng thông báo lớn giữa màn ── */
  G.bangLon = function (chu, phu, ms) {
    var b = G.$('#banner-lon'); if (!b) return Promise.resolve();
    G.xoa(b);
    b.appendChild(G.el('div.bn-chu', { text: chu }));
    if (phu) b.appendChild(G.el('div.bn-phu', { text: phu }));
    b.hidden = false;
    return G.doi(ms || 1500).then(function () { b.hidden = true; });
  };

  /* ── hộp thoại ── */
  G.hop = function (opt) {
    return new Promise(function (xong) {
      var phu = G.$('#lop-phu');
      G.xoa(phu);
      var h = G.el('div.hop');
      if (opt.dau) h.appendChild(G.el('div.hop-dau', { text: opt.dau }));
      var than = G.el('div.hop-than');
      if (opt.node) than.appendChild(opt.node);
      else than.innerHTML = opt.html || '';
      h.appendChild(than);
      var chan = G.el('div.hop-chan');
      (opt.nut || [{ chu: 'Đóng', gt: null, chinh: true }]).forEach(function (n) {
        chan.appendChild(G.el('button.nut' + (n.chinh ? '.chinh' : '') + (n.do ? '.do' : ''),
          { text: n.chu, onclick: function () { phu.hidden = true; xong(n.gt); } }));
      });
      h.appendChild(chan);
      phu.appendChild(h);
      phu.hidden = false;
    });
  };

  G.CAI = { rung: true, tocDoSim: 1, mucSim: 'day' };

})(window);
