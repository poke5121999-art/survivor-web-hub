/* data-tuong.js — 20 tướng, mỗi tướng đúng 3 kỹ năng: NỘI TẠI + CHIÊU + CHIÊU CUỐI.

   Chỉ số bày theo đúng cách Teamfight Manager 2 làm (RESEARCH.md §2.7):
   mỗi dòng là [mức ở cấp 1, cộng mỗi cấp], tướng lên tới cấp 12 trong một trận.

   cs = [atk1,atk+, ap1,ap+, hp1,hp+, giap1,giap+, khang1,khang+, tam, tocdanh, tocchay]
        atk  sát thương vật lý     ap   sức mạnh phép
        tam  tầm đánh (27 = cận chiến, 60+ = xạ thủ)   tocdanh đòn/giây   tocchay ô/giây

   Kỹ năng — trường "h" là thứ bộ mô phỏng đọc:
     dmg   { g: hệ số theo atk/ap, c: cộng thẳng, loai:'vl'|'pt', dien: true nếu diện rộng }
     kc    số giây khống chế (trói/choáng/hất)
     cham  { muc, giay }  làm chậm
     hoi   { g, c }  hồi máu           chan { g, c } khiên
     buff  { atk, ap, tocdanh, tocchay, giap, khang, giay, doi:true nếu cho cả đội }
     giam  { giap, khang, sat, giay }  nợ chỉ số lên kẻ địch
     dac   thẻ đặc biệt cho bộ mô phỏng: 'anminh','xuyen','xuly','keo','doicho','tru','rung'
*/
(function (G) {
  'use strict';

  function T(id, ten, lop, vt, cs, noi, chieu, cuoi, the, mota) {
    return {
      id: id, ten: ten, lop: lop, vt: vt, cs: cs, the: the, mota: mota,
      kn: { noi: noi, chieu: chieu, cuoi: cuoi }
    };
  }
  function N(ten, mo, h) { return { ten: ten, mo: mo, h: h || {}, loai: 'noi' }; }
  function C(ten, mo, hoi, h) { return { ten: ten, mo: mo, hoi: hoi, h: h || {}, loai: 'chieu' }; }
  function U(ten, mo, hoi, h) { return { ten: ten, mo: mo, hoi: hoi, h: h || {}, loai: 'cuoi' }; }

  G.TUONG = [
    /* ═══════════ ĐƯỜNG TRÊN ═══════════ */
    T('kiemsi', 'Kiếm Sĩ', 'can', 'tren',
      [92, 21, 0, 0, 940, 92, 27, 7, 16, 3, 28, 1.15, 74],
      N('Lưỡi Mài', 'Cứ ba đòn đánh thường thì đòn thứ ba gây thêm 30% sát thương vật lý.',
        { moiN: 3, dmg: { g: 0.30, loai: 'vl' } }),
      C('Chém Vòng', 'Chém một vòng quanh mình: 35 + 85% sát thương vật lý lên mọi kẻ địch gần.', 8,
        { dmg: { g: 0.85, c: 35, loai: 'vl', dien: true } }),
      U('Bão Kiếm', 'Xoay kiếm 3 giây, mỗi giây gây 45 + 45% sát thương vật lý diện rộng.', 60,
        { dmg: { g: 0.45, c: 45, loai: 'vl', dien: true }, lap: 3 }),
      ['toa', 'lao'], 'Đánh đều tay, không sợ ai ở đường trên.'),

    T('cuongchien', 'Cuồng Chiến', 'can', 'tren',
      [100, 24, 0, 0, 900, 88, 24, 6, 14, 3, 26, 1.25, 76],
      N('Càng Đau Càng Mạnh', 'Cứ 3% máu đã mất thì +2% sát thương gây ra, tối đa +40%.',
        { theoMau: { moi: 0.03, cong: 0.02, tran: 0.40 } }),
      C('Nộ Chém', 'Bổ mạnh: 50 + 120% sát thương vật lý, hút 25% số đó thành máu.', 6,
        { dmg: { g: 1.20, c: 50, loai: 'vl' }, hut: 0.25 }),
      U('Không Lùi', 'Trong 3.5 giây không thể tụt xuống dưới 1 máu.', 80,
        { batTu: 3.5 }),
      ['don', 'cuoi'], 'Càng gần chết càng đáng sợ.'),

    T('phaco', 'Phá Cổ', 'can', 'tren',
      [88, 20, 0, 0, 1020, 100, 30, 8, 18, 4, 30, 1.10, 71],
      N('Búa Nặng', 'Đòn đánh thường gây thêm 4% máu tối đa của mục tiêu (tối đa 120 lên quái).',
        { dmgTheoMauDich: 0.04, tranQuai: 120 }),
      C('Đập Đất', 'Đập xuống đất: 45 + 90% sát thương vật lý diện rộng và làm chậm 30% trong 2 giây.', 9,
        { dmg: { g: 0.90, c: 45, loai: 'vl', dien: true }, cham: { muc: 0.30, giay: 2 } }),
      U('Công Thành', 'Trong 8 giây, sát thương lên trụ và quái lớn tăng 120%.', 60,
        { buff: { danhTru: 1.20, giay: 8 }, dac: 'tru' }),
      ['le', 'toa'], 'Sinh ra để phá trụ, không phải để nói chuyện.'),

    T('thanhkiem', 'Thánh Kiếm', 'can', 'tren',
      [88, 20, 22, 7, 980, 96, 28, 7, 22, 5, 30, 1.10, 73],
      N('Giáp Thành Kiếm', 'Sát thương đòn đánh cộng thêm 25% giá trị giáp của mình (sát thương phép).',
        { dmgTheoGiap: 0.55 }),
      C('Kiếm Sáng', 'Chém ra sóng ánh sáng bay xa: 65 + 95% sát thương vật lý, xuyên hàng.', 7,
        { dmg: { g: 0.95, c: 65, loai: 'vl' }, dac: 'xuyen' }),
      U('Thánh Vực', 'Vùng thánh 5 giây: đồng đội trong đó hồi 3.5% máu mỗi giây, kẻ địch bị chậm 25%.', 85,
        { hoi: { g: 0, c: 0, phanTramMau: 0.035 }, doi: true, cham: { muc: 0.25, giay: 5 }, lap: 5 }),
      ['toa', 'hoi'], 'Nửa đỡ đòn nửa gây sát thương, không giỏi nhất việc nào.'),

    /* ═══════════ ĐI RỪNG ═══════════ */
    T('kynhan', 'Kỵ Nhân', 'can', 'rung',
      [90, 20, 0, 0, 900, 90, 25, 7, 15, 3, 27, 1.20, 78],
      N('Vó Ngựa', 'Ngoài giao tranh, tốc chạy tăng dần tới +25% sau 4 giây.',
        { buff: { tocchayNgoai: 0.25 } }),
      C('Xung Thương', 'Lao thẳng, xuyên mục tiêu đầu tiên, trói 1 giây: 30 + 120% sát thương vật lý.', 6,
        { dmg: { g: 1.20, c: 30, loai: 'vl' }, kc: 1.0, dac: 'xuyen' }),
      U('Mở Đường', '+50% tốc chạy trong 4 giây và tạo vệt đường; đồng đội chạy theo cũng +50% tốc.', 60,
        { buff: { tocchay: 0.50, giay: 4, doi: true } }),
      ['lao', 'kc'], 'Dựng lại từ Cavalry của Teamfight Manager 2 — số liệu đọc thẳng từ ảnh trong game.'),

    T('gaosu', 'Gấu Sư', 'can', 'rung',
      [90, 21, 0, 0, 1000, 98, 29, 7, 18, 4, 26, 1.15, 77],
      N('Da Thú', 'Nhận thêm 15% giáp và kháng phép khi đánh quái rừng và quái lớn.',
        { buffRung: { giap: 0.15, khang: 0.15 } }),
      C('Vồ', 'Nhảy vồ tới: 40 + 100% sát thương vật lý và làm chậm 20% trong 1.5 giây.', 8,
        { dmg: { g: 1.00, c: 40, loai: 'vl' }, cham: { muc: 0.20, giay: 1.5 } }),
      U('Cuồng Thú', '6 giây: +40% tốc đánh, mỗi đòn hồi 3% máu tối đa.', 75,
        { buff: { tocdanh: 0.40, giay: 6 }, hutMau: 0.03 }),
      ['lao', 'don'], 'Cắm mặt ăn quái rồi lao vào người.'),

    T('bongma', 'Bóng Ma', 'sat', 'rung',
      [92, 22, 16, 5, 820, 80, 21, 6, 18, 4, 28, 1.20, 81],
      N('Không Dấu Chân', 'Trong rừng: +12% tốc chạy và không hiện trên bản đồ nhỏ của đối thủ.',
        { buff: { tocchayRung: 0.20 }, dac: 'anminh' }),
      C('Xuyên Tường', 'Đi xuyên địa hình một đoạn; đòn đánh kế tiếp gây thêm 110% sát thương.', 8,
        { dmg: { g: 1.10, loai: 'vl' }, dac: 'xuyen' }),
      U('Hồn Lìa', 'Đánh dấu một mục tiêu; nếu mục tiêu chết trong 4 giây, chiêu cuối hồi lại ngay.', 75,
        { dmg: { g: 1.40, c: 120, loai: 'vl' }, dac: 'xuly' }),
      ['don'], 'Đi rừng nhanh nhất bản đồ, và không ai chặn được đường về.'),

    T('thoisan', 'Thợ Săn', 'xa', 'rung',
      [82, 21, 0, 0, 830, 81, 21, 6, 16, 3, 46, 1.25, 76],
      N('Dấu Vết', 'Kẻ địch bị đánh sẽ lộ vị trí trong 3 giây.',
        { dac: 'mat' }),
      C('Bẫy Kẹp', 'Đặt bẫy; kẻ giẫm phải bị trói 1.5 giây và nhận 60 + 60% sát thương vật lý.', 10,
        { dmg: { g: 0.60, c: 60, loai: 'vl' }, kc: 1.5 }),
      U('Vây Bắt', 'Rải bẫy khắp một vùng lớn trong 6 giây.', 70,
        { dmg: { g: 0.50, c: 80, loai: 'vl', dien: true }, kc: 1.0, lap: 3 }),
      ['kc', 'pk'], 'Rừng của nó thì nó đặt luật.'),

    /* ═══════════ ĐƯỜNG GIỮA ═══════════ */
    T('phaposu', 'Pháp Sư', 'phep', 'giua',
      [58, 12, 48, 15, 860, 86, 18, 4, 21, 4, 58, 1.05, 73],
      N('Tàn Lửa', 'Kỹ năng gây bỏng thêm 20% sát thương phép trong 2 giây.',
        { dot: { g: 0.42, giay: 2, loai: 'pt' } }),
      C('Cầu Lửa', 'Ném cầu lửa: 80 + 92% sức mạnh phép.', 5,
        { dmg: { g: 0.92, c: 80, loai: 'pt' } }),
      U('Thiên Thạch', 'Gọi thiên thạch xuống sau 1.2 giây: 200 + 110% sức mạnh phép diện rộng.', 65,
        { dmg: { g: 1.10, c: 200, loai: 'pt', dien: true }, tre: 1.2 }),
      ['toa', 'pk'], 'Dọn lính, dọn người, dọn cả hy vọng.'),

    T('phapset', 'Pháp Sét', 'phep', 'giua',
      [56, 12, 48, 15, 760, 74, 16, 4, 20, 4, 56, 1.10, 71],
      N('Tích Điện', 'Cứ 4 đòn/kỹ năng trúng mục tiêu thì đòn kế tiếp làm choáng 0.6 giây.',
        { moiN: 4, kc: 0.6 }),
      C('Tia Chớp', 'Sét nảy qua 3 mục tiêu: 60 + 70% sức mạnh phép, giảm 15% mỗi lần nảy.', 6,
        { dmg: { g: 0.70, c: 60, loai: 'pt' }, nay: 3, giamNay: 0.15 }),
      U('Bão Sét', 'Sét đánh liên tục vào một vùng trong 3 giây: mỗi giây 90 + 45% sức mạnh phép.', 70,
        { dmg: { g: 0.45, c: 90, loai: 'pt', dien: true }, lap: 3 }),
      ['toa', 'kc'], 'Đám đông đứng gần nhau là món quà.'),

    T('bongdem', 'Bóng Đêm', 'sat', 'giua',
      [88, 21, 20, 6, 800, 78, 20, 5, 18, 4, 26, 1.15, 79],
      N('Bóng Dài', 'Đánh từ phía sau lưng mục tiêu gây thêm 30% sát thương.',
        { sauLung: 0.30 }),
      C('Nuốt Bóng', 'Dịch chuyển tới mục tiêu: 60 + 70% sát thương phép.', 12,
        { dmg: { g: 0.70, c: 60, loai: 'pt' }, dac: 'nhay' }),
      U('Đêm Đen', 'Che mắt mọi kẻ địch quanh mình 2 giây — họ không thấy đồng đội của họ.', 75,
        { kc: 0.4, muMat: 2, dien: true }),
      ['don', 'kc'], 'Không ai biết nó ở đâu cho tới lúc muộn.'),

    T('tuchien', 'Tử Chiến', 'sat', 'giua',
      [86, 20, 0, 0, 850, 83, 23, 6, 16, 3, 27, 1.18, 78],
      N('Song Đao', 'Đòn thứ hai lên cùng một mục tiêu gây thêm 25% sát thương.',
        { lienDon: 0.15 }),
      C('Phản Kích', 'Chặn đòn đánh thường tiếp theo và phản lại 80 + 90% sát thương vật lý.', 15,
        { dmg: { g: 0.90, c: 80, loai: 'vl' }, chan1: true }),
      U('Quyết Đấu', 'Khoá một mục tiêu 4 giây: hai bên không rời xa nhau được.', 80,
        { khoa: 4, dmg: { g: 0.60, c: 60, loai: 'vl' } }),
      ['don', 'kc'], 'Chọn một người và kéo họ đi cùng.'),

    /* ═══════════ XẠ THỦ ═══════════ */
    T('xathu', 'Xạ Thủ', 'xa', 'duoi',
      [76, 20, 0, 0, 770, 75, 18, 5, 14, 3, 62, 1.28, 72],
      N('Nhịp Bắn', 'Mỗi đòn đánh cộng dồn +6% tốc đánh, tối đa 5 lần, mất khi ngừng bắn 3 giây.',
        { congDon: { tocdanh: 0.06, lan: 5 } }),
      C('Mũi Xuyên', 'Bắn xuyên hàng: 50 + 90% sát thương vật lý.', 8,
        { dmg: { g: 0.90, c: 50, loai: 'vl' }, dac: 'xuyen' }),
      U('Mưa Tên', 'Rót tên xuống vùng lớn 3 giây: mỗi giây 70 + 50% sát thương vật lý.', 65,
        { dmg: { g: 0.50, c: 70, loai: 'vl', dien: true }, lap: 3 }),
      ['toa', 'cuoi'], 'Về cuối trận là cả đội đứng quanh bảo vệ.'),

    T('sungtruong', 'Súng Trường', 'xa', 'duoi',
      [82, 23, 0, 0, 760, 74, 17, 5, 14, 3, 66, 1.20, 71],
      N('Càng Xa Càng Đau', 'Sát thương tăng thêm tới 25% theo khoảng cách tới mục tiêu.',
        { theoTam: 0.25 }),
      C('Bắn Tỉa', 'Ngắm 0.8 giây rồi bắn: 90 + 110% sát thương vật lý, bỏ qua 20% giáp.', 10,
        { dmg: { g: 1.10, c: 90, loai: 'vl' }, xuyenGiap: 0.20, tre: 0.8 }),
      U('Phát Kết Liễu', 'Bắn xuyên bản đồ vào mục tiêu máu thấp nhất: 250 + 60% máu đã mất của mục tiêu.', 90,
        { dmg: { g: 0, c: 250, loai: 'vl' }, theoMauMat: 0.60, dac: 'xuly' }),
      ['pk', 'don', 'cuoi'], 'Đứng xa nhất, gây đau nhất.'),

    T('nodoc', 'Nỏ Độc', 'xa', 'duoi',
      [74, 20, 14, 4, 800, 78, 18, 5, 15, 3, 58, 1.40, 73],
      N('Tẩm Độc', 'Đòn đánh gây độc 3 giây (12 + 15% sức mạnh phép mỗi giây), cộng dồn 5 lần.',
        { dot: { g: 0.15, c: 12, giay: 3, loai: 'pt', congDon: 5 } }),
      C('Sương Độc', 'Ném bình độc: làm chậm 25% trong vùng 3 giây và cộng 2 tầng độc.', 12,
        { cham: { muc: 0.25, giay: 3 }, themDot: 2, dien: true }),
      U('Bùng Độc', 'Kích nổ toàn bộ độc đang có: mỗi tầng gây 60 + 30% sức mạnh phép.', 60,
        { noDot: { g: 0.30, c: 60, loai: 'pt' } }),
      ['pk', 'toa'], 'Không giết nhanh, nhưng ai dính cũng phải về nhà.'),

    T('bomxich', 'Bom Xích', 'xa', 'duoi',
      [76, 20, 32, 10, 820, 80, 19, 5, 16, 3, 50, 1.15, 72],
      N('Dư Chấn', 'Kỹ năng diện rộng gây thêm 15% sát thương lên lính và quái.',
        { themLinh: 0.15 }),
      C('Ném Bom', 'Bom nổ sau 1 giây: 80 + 90% sát thương phép diện rộng.', 8,
        { dmg: { g: 0.90, c: 80, loai: 'pt', dien: true }, tre: 1 }),
      U('Bom Chùm', 'Ba quả bom rơi liên tiếp xuống vùng lớn.', 70,
        { dmg: { g: 0.55, c: 70, loai: 'pt', dien: true }, lap: 3 }),
      ['toa', 'pk'], 'Dọn lính nhanh, mà dọn cả người.'),

    /* ═══════════ HỖ TRỢ ═══════════ */
    T('hiepsi', 'Hiệp Sĩ', 'can', 'ho',
      [72, 15, 0, 0, 1000, 98, 32, 8, 21, 4, 26, 1.00, 72],
      N('Vai Kề Vai', 'Đồng đội đứng cạnh nhận thêm 8% giáp và kháng phép.',
        { hao: { giap: 0.03, khang: 0.03 }, doi: true }),
      C('Khiên Dội', 'Húc mục tiêu: 40 + 70% sát thương vật lý và hất tung 0.8 giây.', 10,
        { dmg: { g: 0.70, c: 40, loai: 'vl' }, kc: 0.8 }),
      U('Chốt Chặn', 'Cắm cờ 4 giây: đồng đội trong vùng giảm 12% sát thương nhận.', 70,
        { giamNhan: 0.12, giay: 4, doi: true }),
      ['kc', 'lao', 'hoi'], 'Cái khiên của đội. Vào trước, chết sau.'),

    T('thaythuoc', 'Thầy Thuốc', 'ho', 'ho',
      [48, 10, 34, 10, 860, 84, 20, 5, 24, 5, 50, 1.00, 71],
      N('Tay Lành', 'Mọi hiệu ứng hồi máu của mình mạnh thêm 15%.',
        { hoiThem: 0.15 }),
      C('Ánh Sáng', 'Hồi 60 + 45% sức mạnh phép cho đồng đội yếu máu nhất trong tầm.', 6,
        { hoi: { g: 0.45, c: 60 } }),
      U('Cứu Rỗi', 'Hồi 180 + 80% sức mạnh phép cho toàn đội trong vùng và gỡ khống chế.', 90,
        { hoi: { g: 0.80, c: 180 }, doi: true, goKc: true }),
      ['hoi'], 'Ai cũng chê cho đến lúc thiếu.'),

    T('khienhon', 'Khiên Hồn', 'ho', 'ho',
      [50, 11, 36, 11, 900, 88, 24, 6, 26, 5, 48, 1.00, 70],
      N('Vỏ Cứng', 'Khiên do mình tạo ra tồn tại lâu thêm 2 giây.',
        { chanLau: 2 }),
      C('Chắn Hồn', 'Tạo khiên 90 + 60% sức mạnh phép cho một đồng đội trong 4 giây.', 8,
        { chan: { g: 0.60, c: 90, giay: 4 } }),
      U('Vòm Chắn', 'Vòm chắn 3 giây: đồng đội bên trong miễn nhiễm khống chế.', 95,
        { mienKc: 3, doi: true, chan: { g: 0.40, c: 120, giay: 3 } }),
      ['hoi', 'kc'], 'Không hồi máu, nhưng không cho mất máu.'),

    T('nhacsi', 'Nhạc Sĩ', 'ho', 'ho',
      [52, 11, 34, 11, 890, 88, 22, 5, 23, 5, 58, 1.05, 74],
      N('Khúc Hành', 'Đồng đội quanh mình luôn được +10% tốc chạy.',
        { hao: { tocchay: 0.10, tocdanh: 0.07 }, doi: true }),
      C('Nốt Ru', 'Ru ngủ một mục tiêu 2.1 giây: 60 + 70% sức mạnh phép, tỉnh dậy thì nhận thêm 20% sát thương.', 12,
        { dmg: { g: 0.70, c: 60, loai: 'pt' }, kc: 2.1, danhThuc: 0.28 }),
      U('Đại Hợp Xướng', 'Toàn đội +42% tốc đánh và +22% tốc chạy trong 9 giây.', 72,
        { buff: { tocdanh: 0.42, tocchay: 0.22, giay: 9, doi: true } }),
      ['hoi', 'kc'], 'Buff cả đội, ai cũng nhanh hơn một nhịp.')
  ];

  G.TUONG_THEO_ID = {};
  G.TUONG.forEach(function (t) { G.TUONG_THEO_ID[t.id] = t; });

  G.VITRI = [
    { id: 'tren', ten: 'Đường Trên', tat: 'TR', buff: 'Hồi 1.5% máu tối đa mỗi giây khi ngoài giao tranh' },
    { id: 'rung', ten: 'Đi Rừng', tat: 'RỪ', buff: '+20% tốc chạy trong rừng; hành quyết quái lớn khi máu ≤ 700' },
    { id: 'giua', ten: 'Đường Giữa', tat: 'GI', buff: '+20% kinh nghiệm' },
    { id: 'duoi', ten: 'Xạ Thủ', tat: 'XẠ', buff: '+20% vàng' },
    { id: 'ho', ten: 'Hỗ Trợ', tat: 'HỖ', buff: '−30% kinh nghiệm, −15% vàng; last-hit thì đồng đội gần nhất nhận vàng' }
  ];
  G.VITRI_THEO_ID = {};
  G.VITRI.forEach(function (v) { G.VITRI_THEO_ID[v.id] = v; });

  G.LOP_TEN = { can: 'Cận Chiến', xa: 'Xạ Thủ', phep: 'Pháp Sư', ho: 'Hỗ Trợ', sat: 'Sát Thủ' };

  /* thông thạo: N < R < SR < SSR < UR (DESIGN.md §3.4) */
  /* Hệ số nhân thẳng vào mọi chỉ số chiến đấu của tướng. Đo bằng máy: với thang cũ
     (0.82 … 1.22) thì UR gặp N thắng 20/20, còn chỉ số huấn luyện viên lệch hết cỡ (1200 so
     với 100) cũng chỉ thắng 16/20 — tức là cả mùa nuôi quân thua một dòng bảng thông thạo.
     Thu lại còn 0.90 … 1.12: thông thạo vẫn đáng để cấm theo người, nhưng không còn ăn trùm. */
  G.THONG_THAO = [
    { id: 'N', ten: 'N', heso: 0.90, mau: '#7d8794' },
    { id: 'R', ten: 'R', heso: 0.95, mau: '#6fc4f0' },
    { id: 'SR', ten: 'SR', heso: 1.00, mau: '#b08af0' },
    { id: 'SSR', ten: 'SSR', heso: 1.06, mau: '#ffd76e' },
    { id: 'UR', ten: 'UR', heso: 1.12, mau: '#ff8fb0' }
  ];
  G.TT_THEO_ID = {};
  G.THONG_THAO.forEach(function (t) { G.TT_THEO_ID[t.id] = t; });

  /** chỉ số tướng ở một cấp trận (1..12) */
  G.tuongOCap = function (t, cap) {
    var c = t.cs, n = cap - 1;
    return {
      atk: c[0] + c[1] * n, ap: c[2] + c[3] * n, hp: c[4] + c[5] * n,
      giap: c[6] + c[7] * n, khang: c[8] + c[9] * n,
      tam: c[10], tocdanh: c[11], tocchay: c[12]
    };
  };

  /** tướng theo vị trí */
  G.tuongTheoViTri = function (vt) {
    return G.TUONG.filter(function (t) { return t.vt === vt; });
  };

})(window);
