// Thú cưng pet36 (Giảm 10% / 10% Off): "Giảm giá rồi" — dùng vàng mua vật phẩm trong dạng ải thì hoàn 10% vàng đã tiêu
// [LOC pet_36_skill_0_desc; 10% khớp WIKI Pets, hồi chiêu 0]. Lõi trừ vàng ở p.gold trực tiếp (rooms.js pay), nên theo dõi p.gold mỗi khung: mọi lần giảm
// là một lần chi tiêu, hoàn 10% (cộng dồn phần lẻ, làm tròn xuống khi trả). Không cắn khác mặc định.
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const RATE = 0.1;

  SK.petRegister('pet36', {
    init(G, a) { a.lastGold = G.player ? G.player.gold : 0; a.spent = 0; a.refunded = 0; a.frac = 0; },
    stage(G, a) { a.lastGold = G.player.gold; },
    tick(G, a, dt) {
      const p = G.player; if (!p) return false;
      if (p.gold < a.lastGold) {
        const spent = a.lastGold - p.gold; a.spent += spent; a.frac += spent * RATE;
        const r = Math.floor(a.frac + 1e-9);
        if (r > 0) { a.frac -= r; p.gold += r; a.refunded += r; SK.num(G, p.x, p.y - 20, '+' + r, '#ffd200', false); }
      }
      a.lastGold = p.gold;
      return false;
    }
  });
})();
