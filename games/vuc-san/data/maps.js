// Kho bản đồ. Mỗi lần ghép trận bốc đúng một bản đồ ngẫu nhiên từ đây.
// id là khoá trong ../ho-xanh/data/zones.js (HX_ZONES): vách va chạm, rương O₂, khoang cứu hộ, glb.
// theme khớp chủ đề ánh sáng của Hố Xanh. divers/sharks/lootSpots do tools/mapgen.js sinh từ lưới đi được;
// bản đồ chưa sinh thì để mảng rỗng và mô phỏng tự tìm chỗ lúc tạo trận.
(function (VS) {
  VS.MAPS = [
    { id: 'A01', name: 'Rạn San Hô', theme: 'day', divers: [], sharks: [], lootSpots: [] },
    { id: 'A05', name: 'Bãi Đá Nông', theme: 'evening', divers: [], sharks: [], lootSpots: [] },
    { id: 'A03N', name: 'Rạn Đêm', theme: 'night', divers: [], sharks: [], lootSpots: [] },
    { id: 'B01', name: 'Rừng Tảo', theme: 'kelp', divers: [], sharks: [], lootSpots: [] },
    { id: 'B04N', name: 'Hẻm Đêm', theme: 'night', divers: [], sharks: [], lootSpots: [] },
    { id: 'C03', name: 'Vực Sâu', theme: 'night', divers: [], sharks: [], lootSpots: [] }
  ];
})(window.VS = window.VS || {});
