// Vai của từng loài cá trong Biệt Đội Lặn (chủ dự án, 2026-10-02):
//   decor: cá nhỏ (cỡ 0) bơi làm cảnh, mũi xiên / dao / súng / bom đi xuyên qua, không chết, không bán.
//   bag:   cá vừa (cỡ 1) và mọi loài sứa: giằng co xong thì vào túi luôn, không phải kéo xác.
//   drag:  cá lớn (cỡ 2): chết thành xác nằm lại, móc dây kéo lên thuyền.
//   gone:  cá ngựa, tôm: không sinh; allocator của chúng đổi sang cá lớn / sứa cùng vùng.
// Quái (js/foes.js) không qua bảng này: thân quái luôn đánh được dù là loài cỡ 0.
window.BDL = window.BDL || {};
(function (BDL) {
  'use strict';

  var GONE = { Seahorse: 1, Whiteleg_Shrimp: 1 };
  var isJelly = function (sp) { return /Jelly/i.test(sp.id); };

  BDL.fishRole = function (sp) {
    if (GONE[sp.id]) return 'gone';
    if (isJelly(sp)) return 'bag';
    return sp.size >= 2 ? 'drag' : sp.size >= 1 ? 'bag' : 'decor';
  };

  // Cá lớn / sứa thay chỗ allocator cá ngựa, tôm và một phần đàn cá cảnh, theo vùng (A nông, B giữa, C sâu).
  // Chỉ dùng loài có Spine 2D trong HX_ASSETS.fish; n = số con mỗi allocator.
  BDL.FISH_BIG = {
    A: [{ id: 'Green_Humphead_Parrotfish', n: 1 }, { id: 'Asian_Sheepshead', n: 1 }, { id: 'Fried_Egg_Jellyfish', n: 2 }],
    B: [{ id: 'Giant_Trevally', n: 1 }, { id: 'Fried_Egg_Jellyfish', n: 2 }, { id: 'Box_JellyFish', n: 1 }],
    C: [{ id: 'Comb_Jelly', n: 2 }, { id: 'Bloodbelly_Comb_Jelly', n: 2 }, { id: 'Box_JellyFish', n: 1 }],
  };
  // Phần đàn cá cảnh đổi thành cá lớn / sứa [ĐỀ XUẤT]: cá nhỏ thành cảnh thì phải bù con đáng săn.
  BDL.FISH_UPGRADE = 0.25;

  // Giá gốc trước khi chia quỹ tiền của map (js/run.js nhân tỉ lệ): cá kéo xác ×3 vì phải kéo cả con lên.
  BDL.fishRaw = function (sp) { return BDL.fishValue(sp) * (BDL.fishRole(sp) === 'drag' ? 3 : 1); };
})(window.BDL);
