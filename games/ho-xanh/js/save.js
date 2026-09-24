// Sổ lưu một ngày trọn vòng (localStorage `hx.save.v1`). Đọc vào là chuẩn hoá từng khoá; trình duyệt chặn lưu thì vẫn chơi được trong bộ nhớ.
(function (root) {
  'use strict';
  var KEY = 'hx.save.v1';
  var M = root.HX_META;
  var STAGES = ['prep', 'bar'];

  function nat(v) { v = Math.floor(+v); return isFinite(v) && v > 0 ? v : 0; }
  function plain(o) { return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; }
  // Mã loài cá có thật hay không: có bảng cá thì tra, chạy trong node (không có bảng) thì nhận mọi chuỗi.
  function knownFish(id) {
    var A = root.HX_ASSETS;
    if (!A || !A.fish) return typeof id === 'string' && id.length > 0;
    if (!knownFish.set) { knownFish.set = {}; A.fish.forEach(function (s) { knownFish.set[s.id] = 1; }); }
    return knownFish.set[id] === 1;
  }

  // Dữ liệu lạ ở ranh giới (sổ cũ, sửa tay, hỏng) thì lấy mặc định, ghép từng khoá một.
  function parse(raw) {
    var src = raw;
    if (typeof raw === 'string') { try { src = JSON.parse(raw); } catch (e) { src = null; } }
    src = plain(src);
    var s = M.defaults();
    s.day = Math.max(1, nat(src.day));
    s.stage = STAGES.indexOf(src.stage) >= 0 ? src.stage : 'prep';
    s.gold = nat(src.gold);
    ['gear', 'bar'].forEach(function (slot) {
      var g = plain(src[slot]);
      Object.keys(s[slot]).forEach(function (k) { s[slot][k] = Math.min(M.maxLevel(k), nat(g[k])); });
    });
    var guns = plain(src.guns), owned = Array.isArray(guns.owned) ? guns.owned : [];
    s.guns.owned = owned.filter(function (id, i) { return M.GUNS[id] && owned.indexOf(id) === i; });
    s.guns.equipped = s.guns.owned.indexOf(guns.equipped) >= 0 ? guns.equipped : null;
    var fr = plain(src.fridge);
    Object.keys(fr).forEach(function (id) { var n = nat(fr[id]); if (n && knownFish(id)) s.fridge[id] = n; });
    var dex = plain(src.dex);
    Object.keys(dex).forEach(function (id) { if (dex[id] && knownFish(id)) s.dex[id] = 1; });
    var st = plain(src.stats);
    s.stats.served = nat(st.served); s.stats.earned = nat(st.earned);
    return s;
  }

  function freeze(o) {
    Object.keys(o).forEach(function (k) { if (o[k] && typeof o[k] === 'object') freeze(o[k]); });
    return Object.freeze(o);
  }

  var cur = freeze(M.defaults());

  function read() {
    try { return root.localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function write(s) {
    try { root.localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch (e) { return false; }
  }

  var Save = {
    KEY: KEY,
    parse: parse,
    load: function () { cur = freeze(parse(read())); return cur; },
    // Sổ đang dùng, đã đóng băng: muốn đổi thì qua commit.
    get: function () { return cur; },
    // fn nhận bản nháp (sao chép sâu): sửa tại chỗ, hoặc trả về một sổ mới (như kết quả HX_META.buy), trả false để huỷ.
    commit: function (fn) {
      var draft = JSON.parse(JSON.stringify(cur));
      var r = fn(draft);
      if (r === false) return cur;
      cur = freeze(parse(r && typeof r === 'object' ? r : draft));
      write(cur);
      return cur;
    },
    wipe: function () {
      try { root.localStorage.removeItem(KEY); } catch (e) { /* trình duyệt chặn lưu thì thôi */ }
      cur = freeze(M.defaults());
      return cur;
    },
  };

  root.HX = root.HX || {};
  root.HX.save = Save;
})(typeof window !== 'undefined' ? window : globalThis);
