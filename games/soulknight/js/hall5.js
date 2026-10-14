// Sảnh đợt 5: chỗ đứng của người thuộc Sảnh 2 (js/hall.js placeNpcs đọc SK.HALL_POS[id]).
// Chỗ đứng gốc nằm ở cảnh HeroRoom (characters/cNN, tools/hall/build_hall.py scene_hall → SK_HALL.heroes) [ĐO]: 22 người đứng trong phòng chính
// (c00..c16, c19, c22..c26) dùng thẳng toạ độ đó. 19 người còn lại có chỗ ở y 22..36, tức Sảnh 2 (hero_room/second_hall) mà web chưa dựng:
// họ chỉ hiện khi đã mở khoá và đứng ở phòng chính theo bảng dưới [ƯỚC LƯỢNG], sinh bằng chọn điểm xa nhất lần lượt trên các ô đi được,
// cách mọi ô nội thất ≥ 2,6 đv, cách cửa vào ải ≥ 4,5 đv; 6 chỗ (astrologist, fighter, ninja, shooter, specialforces, warliege) chọn lại
// cho khỏi đè lên chỗ gốc của phòng chính. Toạ độ đv thế giới Unity (y hướng lên), là chân nhân vật.
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK) return;
  SK.HALL_POS = {
    aigirl: [-21.5, 1.5], arcaneknight: [15, 0.5], astrologist: [13, -3], bard: [15, -6.5], captain: [-19, -4], doctor: [-9.5, -1.5],
    envoy: [-2, 4], fighter: [-17, -8.5], gunsexpert: [5.5, 1], joker: [-0.5, -8], ladychef: [2.5, -2], lancer: [-7.5, -4.5], ninja: [-6, 3.5],
    shooter: [11, -8], specialforces: [-13.5, -3.5], swordmaster: [-19.5, 3], transcendent: [3.5, 0], warliege: [-21, -1.5], yinyang: [-0.5, -6]
  };
})();
