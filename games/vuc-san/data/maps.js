// Kho bản đồ. Mỗi lần ghép trận bốc đúng một bản đồ ngẫu nhiên từ đây.
// id là khoá trong ../ho-xanh/data/zones.js (HX_ZONES): vách va chạm, rương O₂, khoang cứu hộ, glb.
// theme khớp chủ đề ánh sáng của Hố Xanh. divers/sharks/lootSpots do tools/mapgen.js sinh từ lưới đi được;
// bản đồ chưa sinh thì để mảng rỗng và mô phỏng tự tìm chỗ lúc tạo trận.
// Bỏ C03 (khe giữa các khoang chỉ rộng ~1,6 m, cá mập r >= 0,85 bị nhốt một vùng) và A05 (trùng bố cục A01).
// tools/mapgen.js phải khẳng định mọi cặp khoang cứu hộ nối nhau với khoảng trống >= r của cá mập lớn nhất.
(function (VS) {
  VS.MAPS = [
    { id: 'A01', name: 'Rạn San Hô', theme: 'day', divers: [], sharks: [], lootSpots: [] },
    { id: 'A03N', name: 'Rạn Đêm', theme: 'night', divers: [], sharks: [], lootSpots: [] },
    { id: 'B01', name: 'Vách Mưa', theme: 'rain', divers: [], sharks: [], lootSpots: [] },
    { id: 'B02', name: 'Hẻm Chiều', theme: 'evening', divers: [], sharks: [], lootSpots: [] },
    { id: 'B04N', name: 'Vực Đêm', theme: 'night', divers: [], sharks: [], lootSpots: [] },
    { id: 'B06', name: 'Hang Lam', theme: 'day', divers: [], sharks: [], lootSpots: [] }
  ];
})(window.VS = window.VS || {});
