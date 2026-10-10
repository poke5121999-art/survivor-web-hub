// Sảnh đợt 5: bảng vị trí đứng của nhân vật trong phòng chính (js/hall.js placeNpcs đọc SK.HALL_POS[id]).
// Bảng gốc không có trong dữ liệu đọc được: prefab hall_0_normal chỉ có đồ trang trí (objects/*) và các ô function/slots, không có nút nào mang
// tên nhân vật; vị trí đứng dựng trong IL2CPP (RoleSelect) mà máy này không có dump. Clip https://youtu.be/rhNuFTPktF4?t=74 chỉ cho thấy cả phòng
// từ trên xuống, mỗi người cạnh đồ trang trí riêng, không đọc được toạ độ [THẤY].
// Nên: 6 nhân vật có đồ trang trí riêng (mage, vampire, engineer, alchemist, airbender, warlock) vẫn đứng cạnh đồ ấy (js/hall.js DECO);
// 36 người còn lại đứng ở bảng cố định dưới đây [ƯỚC LƯỢNG], sinh bằng chọn điểm xa nhất lần lượt (theo tên, trên các ô đi được của phòng chính đã có đủ nội thất/Xưởng/Vườn/Giếng/Tượng),
// cách mọi ô nội thất ≥ 2,6 đv, cách cửa vào ải ≥ 4,5 đv và cách nhau ≥ 2,0 đv. Cố định theo nhân vật nên không còn phụ thuộc thứ tự mở khoá.
// Toạ độ đv thế giới Unity (y hướng lên), là chân nhân vật.
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK) return;
  SK.HALL_POS = {
    aigirl: [-21.5, 1.5], arcaneknight: [15, 0.5], assassin: [-12.5, 3], astrologist: [7, 5], bard: [15, -6.5], beheaded: [1.5, 1.5],
    captain: [-19, -4], costumeprince: [-0.5, -4], doctor: [-9.5, -1.5], druid: [-16.5, -8], elves: [11.5, -2.5], envoy: [-2, 4],
    fighter: [-17.5, 2], gunsexpert: [5.5, 1], joker: [-0.5, -8], knight: [-13.5, -2.5], ladychef: [2.5, -2], lancer: [-7.5, -4.5], miner: [15, -3],
    necromancer: [-8, 1.5], ninja: [-3.5, -2.5], officer: [8.5, 2], paladin: [-6.5, -1.5], priest: [4.5, 3.5], ranger: [-20.5, -1], robot: [0, -1],
    shooter: [-10.5, 1], specialforces: [-14, -8], swordmaster: [-19.5, 3], taoist: [-1, 2], transcendent: [3.5, 0], trapmaster: [12.5, -0.5],
    viking: [6.5, 3], warliege: [-11.5, -1], werewolf: [-9.5, -4], yinyang: [-0.5, -6]
  };
})();
