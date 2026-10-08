// Bảng cá mập. id trùng species trong ../ho-xanh/data/shark_assets.js (HX_SHARKS) để lấy glb, clip, khung va chạm.
// hp, bite, speed là số thiết kế cho đấu 4-2, chỉ dựa tương đối vào hp/damage gốc của Dave the Diver.
// speed, dash: m/s. bite: O₂ trừ mỗi cú cắn (thợ lặn có 100). r: bán kính va chạm (m), quyết định khe nào lọt.
(function (VS) {
  VS.SHARKS = {
    Blacktip_Reefshark: {
      name: 'Cá Mập Vây Đen', rarity: 3, hp: 320, speed: 4.2, dash: 7.0, bite: 26, r: 0.9, skill: 'lao-vut',
      blurb: 'Con mồi đầu đời của mọi thợ lặn. Nhanh, gọn, không có gì bí ẩn.'
    },
    Whitetip_Reefshark: {
      name: 'Cá Mập Vây Trắng', rarity: 3, hp: 300, speed: 4.0, dash: 6.5, bite: 24, r: 0.85, skill: 'lach-khe',
      blurb: 'Ban ngày nằm trong hang, ban đêm lùng mồi trong khe đá.'
    },
    Copper_Shark: {
      name: 'Cá Mập Đồng', rarity: 3, hp: 360, speed: 4.0, dash: 6.5, bite: 28, r: 0.95, skill: 'lua-bay',
      blurb: 'Lùa cả đàn cá mòi thành một khối, che kín đèn pin của thợ lặn.'
    },
    Zebra_Shark: {
      name: 'Cá Mập Vằn', rarity: 3, hp: 380, speed: 3.6, dash: 6.0, bite: 28, r: 0.95, skill: 'an-day',
      blurb: 'Nằm im dưới đáy như một tảng đá có vằn. Đến khi nó há miệng.'
    },
    Shortfin_Mako: {
      name: 'Cá Mập Mako', rarity: 4, hp: 300, speed: 4.8, dash: 8.0, bite: 30, r: 0.9, skill: 'toc-bien',
      blurb: 'Loài cá mập nhanh nhất biển. Đuổi kịp cả máy đẩy.'
    },
    Thresher_Shark: {
      name: 'Cá Mập Đuôi Dài', rarity: 4, hp: 360, speed: 4.2, dash: 7.0, bite: 28, r: 1.0, skill: 'quat-duoi',
      blurb: 'Quất cái đuôi dài bằng nửa thân để làm choáng cả đàn mồi.'
    },
    Longnosesaw_Shark: {
      name: 'Cá Mập Mũi Cưa', rarity: 4, hp: 330, speed: 4.2, dash: 7.0, bite: 26, r: 0.9, skill: 'cua-xe',
      blurb: 'Cái mũi răng cưa cắt đứt dây xiên, lưới và cả bộ đồ lặn.'
    },
    Cookiecutter_Shark: {
      name: 'Cá Mập Cắt Bánh', rarity: 4, hp: 220, speed: 4.4, dash: 7.5, bite: 18, r: 0.5, skill: 'khoet-thit',
      blurb: 'Nhỏ bằng bàn tay, phát sáng trong tối, bám vào ai là khoét một miếng tròn.'
    },
    Tiger_Shark: {
      name: 'Cá Mập Hổ', rarity: 5, hp: 480, speed: 3.8, dash: 6.5, bite: 34, r: 1.2, skill: 'nuot-chung',
      blurb: 'Thùng rác của đại dương. Cái gì rơi xuống đáy, nó nuốt.'
    },
    Smooth_Hammershark: {
      name: 'Cá Mập Búa', rarity: 5, hp: 420, speed: 4.2, dash: 7.0, bite: 32, r: 1.05, skill: 'cam-dien',
      blurb: 'Cái đầu búa nghe được nhịp tim của mọi thứ đang sống, kể cả sau vách đá.'
    },
    Frilled_Shark: {
      name: 'Cá Mập Mang Xếp', rarity: 5, hp: 360, speed: 4.0, dash: 7.0, bite: 30, r: 0.9, skill: 'vo-ran',
      blurb: 'Hoá thạch sống của vực sâu. Vồ mồi như rắn, từ xa.'
    },
    Megamouth_Shark: {
      name: 'Cá Mập Miệng To', rarity: 5, hp: 520, speed: 3.4, dash: 5.5, bite: 30, r: 1.3, skill: 'hut-nuoc',
      blurb: 'Há cái miệng rộng một mét rưỡi là cả dòng nước bị hút vào. Cả kho báu cũng thế.'
    }
  };
  Object.keys(VS.SHARKS).forEach(function (id) { VS.SHARKS[id].id = id; });
})(window.VS = window.VS || {});
