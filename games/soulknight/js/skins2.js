/*
 * Skin nhân vật đợt 2: giá / cách mở skin và hình kỹ năng riêng của skin.
 *
 * (1) Giá (data/skins/econ.js, tools/skins/build_econ.py) [WIKI soul-knight.fandom.com Skinlines + Template:<Hero>_Skins; config skins.json
 *     không có giá]: SK.skin2.price(hero, n) -> {kind: 'free'} | {kind: 'gems', amount} | {kind: 'money', amount} (tiền thật, web
 *     thanh toán giả) | {kind: 'fish', amount} (Cá Khô = Fish Chips) | {kind: 'lock', how} (chỉ mở qua sự kiện / gacha / mảnh skin /
 *     thành tựu...: hiện khoá kèm cách mở, không bán). est: giá [ƯỚC LƯỢNG]. Sở hữu lưu ở hồ sơ (js/lobby.js, P.skinOwn).
 * (2) Hình kỹ năng riêng (data/skins/<hero>.js, skins[sN].fx): mã kỹ năng vẽ sprite `<tiền tố>_0_skill_...` của skin 0 (dạng lăn của
 *     Du Hiệp, dạng sói của Người Sói, khiên Hiệp Sĩ Thánh...); khi người chơi dùng skin N thì đổi tên sang sprite skin N lúc vẽ.
 *     Móc: bọc SK.draw / SK.drawTinted (không sửa engine.js, actors.js, skills.js).
 */
(function () {
  'use strict';
  const SK = window.SK;
  const ECON = window.SK_SKIN_ECON || {};

  function price(hero, n) {
    n = +n || 0;
    const e = n && ECON[hero] && ECON[hero][n];
    if (!n) return { kind: 'free' };
    if (!e) return { kind: 'gems', amount: 12000, est: true };   // không có trong wiki: mức phổ biến nhất [ƯỚC LƯỢNG]
    const est = e[2] ? { est: true } : {};
    switch (e[0]) {
      case '0': return { kind: 'free' };
      case 'g': return Object.assign({ kind: 'gems', amount: e[1] }, est);
      case '$': return Object.assign({ kind: 'money', amount: e[1] }, est);
      case 'f': return Object.assign({ kind: 'fish', amount: e[1] }, est);
      default: return { kind: 'lock', how: e[1] };
    }
  }

  // ---- hình kỹ năng theo skin đang dùng
  // Người chơi hiện tại (SK.G.player, tạo ở SK.makePlayer lúc vào ván) và skin đang dùng của họ; đổi người chơi thì tính lại.
  const cur = { p: null, hero: null, skin: 0, map: null };
  const log = { on: false, names: [], hits: 0 };
  function curMap() {
    const G = SK.G, p = G && G.player;   // SK_GAME.player là bản tóm tắt tạo mới mỗi lần đọc, không dùng được ở đây
    if (p !== cur.p) {
      cur.p = p; cur.map = null;
      cur.hero = p ? p.hero : null;
      cur.skin = p && SK.profile && SK.profile.skinOf ? SK.profile.skinOf(p.hero) | 0 : 0;
    }
    if (!cur.skin) return null;
    if (cur.map) return cur.map;
    const H = SK_DATA.heroes[cur.hero], e = H && H['s' + cur.skin];   // chưa nạp gói thì chưa có sN: thử lại ở lần vẽ sau
    return (cur.map = (e && e.fx) || null);
  }
  const remap = name => {
    const m = curMap(); if (!m) return name;
    const r = m[name];
    if (!r || !SK.frame(r)) return name;
    if (log.on) { log.hits++; if (log.names.indexOf(r) < 0) log.names.push(r); }
    return r;
  };
  if (SK.draw && !SK.draw._skin2) {
    const draw = SK.draw;
    SK.draw = function (ctx, name, x, y, o) { return draw.call(this, ctx, remap(name), x, y, o); };
    SK.draw._skin2 = true;
  }
  if (SK.drawTinted && !SK.drawTinted._skin2) {
    const tinted = SK.drawTinted;
    SK.drawTinted = function (ctx, name, x, y, c, o) { return tinted.call(this, ctx, remap(name), x, y, c, o); };
    SK.drawTinted._skin2 = true;
  }

  SK.skin2 = {
    price,
    get current() { return { hero: cur.hero, skin: cur.skin, fx: !!curMap() }; },
    // Móc kiểm thử: ghi tên khung đã đổi.
    trace(on) { log.on = !!on; if (on) { log.names = []; log.hits = 0; } return log; },
    get log() { return log; }
  };
})();
