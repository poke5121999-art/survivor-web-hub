/* data-thoai.js — lời tuyển thủ nói trong trận.

   Trong Teamfight Manager 2, thứ biến một bảng số thành trận đấu có hồn chính là dòng thoại
   chạy ở góc dưới trái: "Ganking top", "Not in shape, pulling back", "They're stacked here,
   give Morgard" (RESEARCH.md §2.9 — chép lại từ ảnh chụp). Không có nó thì người xem chỉ
   nhìn mấy chấm màu chạy qua chạy lại.

   Chọn câu theo TÌNH HUỐNG + TÍNH CÁCH của tuyển thủ (nong · lanh · vui · it_noi · tu_tin).
*/
(function (G) {
  'use strict';

  var T = {
    /* mở màn */
    vaoTran: {
      nong: ['Vào là ăn thôi.', 'Đừng có rụt rè.', 'Tôi đi trước.'],
      lanh: ['Chơi đúng bài.', 'Giữ nhịp.', 'Đừng vội.'],
      vui: ['Đi nào cả nhà!', 'Hôm nay có kèo hay đây.', 'Ai thua trả tiền cơm.'],
      it_noi: ['Ừ.', 'Đi.', 'Rõ.'],
      tu_tin: ['Kèo này của tôi.', 'Cứ để đó.', 'Dễ.']
    },
    gank: {
      nong: ['Tôi lên trên!', 'Bắt thằng này!', 'Đứng yên đó!'],
      lanh: ['Đang lên đường trên.', 'Có kèo, vào chậm thôi.', 'Chờ tôi vòng sau.'],
      vui: ['Ghé thăm tí!', 'Xin chào hàng xóm!', 'Có người tới chơi này.'],
      it_noi: ['Lên.', 'Có kèo.', 'Vòng sau.'],
      tu_tin: ['Để tôi.', 'Xong ngay.', 'Bắt được rồi.']
    },
    danh: {
      nong: ['Đánh! Đánh!', 'Dồn thằng đó!', 'Đừng lùi!'],
      lanh: ['Tập trung mục tiêu.', 'Giữ đội hình.', 'Đánh vào sau.'],
      vui: ['Vui rồi đây!', 'Quẩy nào!', 'Ai mời tôi ly nước?'],
      it_noi: ['Vào.', 'Dồn.', 'Tôi đây.'],
      tu_tin: ['Xử gọn.', 'Nó chết chắc.', 'Của tôi.']
    },
    rut: {
      nong: ['Khỉ thật, lùi!', 'Sao không ai vào?', 'Tôi rút đây.'],
      lanh: ['Không ăn được, lùi.', 'Rút, đừng tham.', 'Đổi mục tiêu.'],
      vui: ['Ối, chạy thôi!', 'Thôi thôi, về nhà.', 'Hôm nay chưa hợp tuổi.'],
      it_noi: ['Lùi.', 'Không nổi.', 'Về.'],
      tu_tin: ['Tạm rút, lát tính.', 'Chưa phải lúc.', 'Cho nó sống thêm tí.']
    },
    mauThap: {
      nong: ['Cần người! Nhanh!', 'Ai đỡ tôi cái!', 'Tôi sắp nằm rồi!'],
      lanh: ['Máu thấp, tôi lùi.', 'Cần hỗ trợ.', 'Về nhà tí.'],
      vui: ['Máu tôi mỏng như giấy!', 'Cứu với!', 'Sắp thành ma rồi!'],
      it_noi: ['Yếu.', 'Cần đỡ.', 'Lùi.'],
      tu_tin: ['Còn tí máu vẫn chơi được.', 'Đừng lo.', 'Tôi tự lo.']
    },
    hagục: {
      nong: ['Chết đi!', 'Có rồi!', 'Ai tiếp?'],
      lanh: ['Xong một.', 'Được rồi.', 'Tiếp.'],
      vui: ['Yê!', 'Đẹp quá!', 'Cho xin cái cúp.'],
      it_noi: ['Xong.', 'Rồi.', 'Một.'],
      tu_tin: ['Nói rồi mà.', 'Dễ.', 'Của tôi thôi.']
    },
    biGiet: {
      nong: ['Sao không ai đỡ?!', 'Ức chế!', 'Lần sau tôi trả.'],
      lanh: ['Tôi sai vị trí.', 'Rút kinh nghiệm.', 'Không sao, đứng dậy.'],
      vui: ['Nằm rồi!', 'Xin lỗi cả nhà.', 'Cho tôi xin lượt hồi sinh.'],
      it_noi: ['...', 'Chết.', 'Lỗi tôi.'],
      tu_tin: ['Xui thôi.', 'Tôi về ngay.', 'Không đáng.']
    },
    quaiLon: {
      nong: ['Rồng đây, vào hết!', 'Cướp được đó!', 'Tôi đánh trước!'],
      lanh: ['Chuẩn bị mục tiêu.', 'Cắm mắt trước đã.', 'Vào theo hiệu tôi.'],
      vui: ['Đi bắt thú cưng nào!', 'Con này to ghê!', 'Chia thịt nhé.'],
      it_noi: ['Mục tiêu.', 'Vào.', 'Sắp hiện.'],
      tu_tin: ['Của mình.', 'Không mất đâu.', 'Tôi lo.']
    },
    tru: {
      nong: ['Đập trụ đi!', 'Đừng đứng nhìn!', 'Trụ đây, vào!'],
      lanh: ['Ăn trụ rồi rút.', 'Đẩy lẻ đường này.', 'Giữ lính đã.'],
      vui: ['Gõ cửa nhà người ta!', 'Trụ ơi trụ à.', 'Đổ rồi kìa!'],
      it_noi: ['Trụ.', 'Đẩy.', 'Đổ.'],
      tu_tin: ['Trụ này của tôi.', 'Vài giây nữa thôi.', 'Xong trụ.']
    },
    thuNha: {
      nong: ['Thủ nhà! Về hết!', 'Đừng để mất!', 'Đứng lại đánh!'],
      lanh: ['Về thủ, đừng ra.', 'Giữ trong nhà.', 'Chờ hồi chiêu.'],
      vui: ['Nhà mình cháy rồi!', 'Về nhà thôi bà con!', 'Ai khoá cửa hộ!'],
      it_noi: ['Thủ.', 'Về.', 'Giữ.'],
      tu_tin: ['Không mất đâu.', 'Để tôi đỡ.', 'Bình tĩnh.']
    },
    thang: {
      nong: ['Xong! Đáng đời!', 'Ai bảo động vào tôi.', 'Đấy!'],
      lanh: ['Kết thúc.', 'Đúng kế hoạch.', 'Tốt.'],
      vui: ['Vô địchhh!', 'Tối nay ăn mừng!', 'Đẹp trai quá!'],
      it_noi: ['Thắng.', 'Xong.', 'Ừ.'],
      tu_tin: ['Đã bảo mà.', 'Dễ thôi.', 'Ai nghi ngờ nữa không?']
    },
    thua: {
      nong: ['Chán!', 'Lần sau khác.', 'Tôi không phục.'],
      lanh: ['Xem lại băng.', 'Thua thì học.', 'Về tập tiếp.'],
      vui: ['Thôi kệ, mai đánh tiếp!', 'Buồn tí rồi thôi.', 'Ai mời cơm không?'],
      it_noi: ['...', 'Thua.', 'Về.'],
      tu_tin: ['Chỉ là một trận.', 'Còn lượt sau.', 'Không sao.']
    }
  };

  /** lấy một câu theo tình huống + tính cách */
  G.thoai = function (tinhHuong, tinh, rng) {
    var nhom = T[tinhHuong];
    if (!nhom) return null;
    var ds = nhom[tinh] || nhom.lanh;
    return ds[Math.floor((rng ? rng() : Math.random()) * ds.length)];
  };

  G.THOAI = T;

})(window);
