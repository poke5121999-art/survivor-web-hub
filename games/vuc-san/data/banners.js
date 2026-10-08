// Banner gacha. Mỗi banner một phe; bảo hiểm (pity) đếm riêng từng banner.
// rates: xác suất gốc mỗi lượt quay. soft: từ lượt thứ soft (tính từ lần 5★ trước), mỗi lượt cộng softStep vào tỉ lệ 5★.
// hard: lượt thứ hard chắc chắn 5★. pity4: cứ pity4 lượt không ra 4★ trở lên thì lượt đó chắc chắn 4★.
// featured: nhân vật được tăng tỉ lệ, xoay vòng theo ngày (ngày thứ d dùng phần tử d mod độ dài).
// Ra 5★: 50% là 5★ đang tăng tỉ lệ; trượt thì lần 5★ sau chắc chắn trúng. Ra 4★: 50% là một trong các 4★ đang tăng tỉ lệ.
(function (VS) {
  VS.BANNERS = [
    {
      id: 'den-vuc', team: 'diver', name: 'Ánh Đèn Vực Thẳm',
      rates: { 5: 0.016, 4: 0.13 }, soft: 60, softStep: 0.06, hard: 80, pity4: 10, cost: 160,
      featured: { 5: ['vy', 'khoa', 'linh'], 4: ['bao', 'mai', 'tung', 'ngoc'] }
    },
    {
      id: 'ham-rang', team: 'shark', name: 'Hàm Răng Bóng Tối',
      rates: { 5: 0.016, 4: 0.13 }, soft: 60, softStep: 0.06, hard: 80, pity4: 10, cost: 160,
      featured: {
        5: ['Smooth_Hammershark', 'Tiger_Shark', 'Frilled_Shark', 'Megamouth_Shark'],
        4: ['Shortfin_Mako', 'Thresher_Shark', 'Longnosesaw_Shark', 'Cookiecutter_Shark']
      }
    }
  ];
})(window.VS = window.VS || {});
