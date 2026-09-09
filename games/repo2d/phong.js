// KIỂU PHÒNG — sàn, tường, đồ đạc, tranh treo và thảm, lấy từ tấm tile thật.
//
// Chủ dự án, lần lượt qua mấy vòng sửa:
//   "dùng Modern_Interiors dàn nhiều room style mới... nhớ gắn các tile cho hợp lý"
//   "phần wall bạn phải dựng kiểu soul knight như vậy nè"
//   "Interiors_free nhìn rõ từng object mà nhỉ, bạn cắt ra đc mà phải không, đừng có cắt đều"
//   "có cửa kiếng, cửa sổ, bức tranh, thảm, bàn, ghế, tủ... ráng mà xài cho hết, đừng bỏ phí"
//   "mấy cái bàn bạn có thể dàn bự ra xong để decor lên trên cho đẹp — như để chậu bông, quả địa cầu"
//   "giảm số lượng cột, decor lại, hiện tại các phòng đang nhiều quá, cần thoáng hơn"
//
// Bộ hình: Modern Interiors (free v2.2) của LimeZu — https://limezu.itch.io/moderninteriors
// Giấy phép ở art/room/LICENSE-limezu.txt: **CHỈ DỰ ÁN PHI THƯƠNG MẠI**, kể cả bản đã sửa.
// Ngày nào hub này bán vé thì mua bản đầy đủ (1,20$) thay hai tệp png, hoặc gỡ tệp này ra — game
// vẫn chạy, mọi phòng rơi về nước sơn vẽ bằng mã ghi trong FLOORS/WALLS.
//
// ============================================================ CẮT THEO OBJECT, KHÔNG CẮT THEO LƯỚI
//
// Bảng `M` dưới đây ghi mỗi miếng bằng **điểm ảnh của chính nó** — `[x, y, rộng, cao]` — chứ không
// phải "ô số mấy, rộng mấy ô". Đó là chỗ khác căn bản so với bản đầu, và là chỗ bản đầu sai: cắt
// theo lưới 48 thì cái tủ cao 111 điểm ảnh bị xén còn 96, cây dừa cao 93 bị xén còn 48, và chủ dự
// án nhìn phát ra ngay ("mấy cây dừa, cột, tủ sách, bàn bị cắt kìa").
//
// Mấy con số này KHÔNG gõ tay. Chúng do một lượt loang vùng điểm ảnh liền nhau trên chính tấm
// interiors.png sinh ra: 269 vùng, mỗi vùng một món đồ, lấy hộp bao sát của nó. Chỗ duy nhất phải
// cắt tay là mấy DÃY đồ dính liền nhau trên tấm nguồn (dãy quầy bar chín ô liền một vệt, dãy kệ
// hàng, dãy ghế sofa) — ở đó phép loang gộp tất cả làm một khối nên phải cắt trong khung ô.
//
// Vẽ ra thì mỗi miếng giữ đúng tỉ lệ điểm ảnh của nó (1 điểm ảnh nguồn = nửa đơn vị thế giới, vì
// prerenderWorld vẽ ở SS=2 và ô game rộng 24), CHÂN nó chiếm `round(rộng/48)` ô, và nó đứng giữa
// cái chân ấy, đáy chạm đáy ô. Cao hơn một ô thì phần thừa tràn LÊN TRÊN — đúng cách một cái tủ
// được nhìn từ 3/4, và vì prerenderWorld quét từ trên xuống nên phần tràn đè lên ô đã vẽ xong.
//
// ============================================================ NĂM THỨ MỘT KIỂU PHÒNG KHAI
//
//   san    khối 3×2 ô trong Room_Builder = sáu biến thể lát được, bốc theo toạ độ ô.
//   tuong  [hàng trên của khối, độ lệch cắt mặt trên] — xem chú thích ở bảng TUONG.
//   do     mỗi chữ trong mẫu phòng (T bàn, S kệ, C thùng, P tủ/chậu, x khối) ứng với một danh
//          sách miếng. Một mẫu phòng vẽ tay chạy được với MỌI kiểu: chữ 'T' trong bếp ra cái quầy,
//          cũng chữ ấy trong lớp học ra cái bàn học sinh.
//   ban    những miếng trong `do` được coi là MẶT BÀN — đồ trang trí sẽ đứng lên trên chúng.
//   treo   tranh, gương, cửa sổ — treo lên MẶT TƯỜNG, không phải đồ đặc, không chắn đường.
//   tham   thảm trải sàn, neo ở góc dưới-phải một mảng sàn trống.
//
// Hầm mộ KHÔNG có trong bảng này. Nó vẫn là kiểu vẽ bằng mã trong game.js (paintStone,
// paintStoneInlay, paintStoneFrieze, quan tài / đá vụn / vò gốm) — giữ nguyên, và là một kiểu
// ngang hàng với chín kiểu ở đây chứ không phải cái bị thay.
(function (root) {
  'use strict';
  if (root.REPO_PHONG) return;

  // Đường dẫn và dấu ?v= suy ra từ chính thẻ script này — cùng một mẹo với sprites.js, và vì cùng
  // một lý do: MỘT tệp js phục vụ hai trang nằm ở hai thư mục khác nhau, còn ảnh thì không có dấu
  // chống cache nào của riêng nó.
  const HERE = (function () {
    const s = document.currentScript;
    if (s && s.src) return s.src.replace(/[^/]*(\?.*)?$/, '');
    return 'games/repo2d/';
  })();
  const VER = (function () {
    const s = document.currentScript;
    const m = s && s.src && s.src.match(/[?&]v=([^&]+)/);
    return m ? '?v=' + m[1] : '';
  })();

  const O = 48;                       // cạnh một ô trên tấm nguồn
  function nap(tep){
    const im = new Image();
    im.src = HERE + tep + VER;
    return im;
  }
  const RB = nap('art/room/room-builder.png');   // sàn + tường
  const IT = nap('art/room/interiors.png');      // đồ đạc
  const xong = im => !!(im && im.complete && im.naturalWidth > 0);

  // ---------------------------------------------------------------- SÀN VÀ TƯỜNG
  // Toạ độ hai bảng này tính bằng Ô (trùng lưới với bản 16×16 của bộ gốc), khác bảng đồ đạc. Sàn
  // và tường LÀ ô lưới thật — chúng sinh ra để lát kín một mặt phẳng — nên ở đây đếm ô là đúng.
  const SAN = {
    gach_do:    [11, 5],
    men_kem:    [11, 7],
    men_ngoc:   [11, 9],
    be_tong:    [11, 11],
    go_xuongca: [11, 13]
  };
  // TƯỜNG — [hàng trên của khối, độ lệch cắt mặt trên].
  //
  // Bộ Modern Interiors vẽ tường cho khung nhìn ĐỨNG: một bức cao hai ô, phào ở trên, chân tường ở
  // dưới. Game này nhìn từ trên xuống, tường dày đúng một ô. Dán thẳng một mặt tường phẳng lên thì
  // bức tường mất bề dày, và dải trang trí nằm ngang của giấy dán tường lặp lại ở MỌI ô của một
  // bức tường DỌC, thành một cái thang sọc.
  //
  // Nên mỗi ô tường dựng bằng hai lượt: mặt trên (tối) và mặt trước (chỉ khi ô dưới là chỗ trống).
  // Xem veTuong().
  //
  // ĐỘ LỆCH là số ĐO ra, không đoán: quét cả 49 vị trí trong khối tường cao 96 điểm ảnh ở cột 1,
  // chấm bằng tổng biến động trong cửa sổ cộng ba lần độ lệch giữa hàng đầu và hàng cuối. Ba nước
  // sơn có dải trang trí chấm 200-350; năm nước còn lại 12-42, gần như trơn hẳn. Cửa sổ được chọn
  // có hàng đầu trùng màu hàng cuối, tức lát dọc bao nhiêu ô cũng không lộ mối.
  const TUONG = {
    hong_dat: [5, 24], kem: [7, 24], ngoc: [9, 24], go_nhat: [11, 27],
    go_vua: [13, 27], go_do: [15, 27], xam_lam: [17, 31], reu: [19, 31]
  };

  // ---------------------------------------------------------------- BẢNG MIẾNG ĐỒ
  // [x, y, rộng, cao] tính bằng ĐIỂM ẢNH trên interiors.png. Sinh bằng máy, xem đầu tệp.
  const M = {
    thung_go:   [[192,1491,42,42],[240,1491,42,42],[288,1491,42,42],[336,1491,42,42],
                 [192,1539,42,42],[240,1539,42,42],[288,1539,42,42],[336,1539,42,42]],
    thung:      [[531,510,45,39],[579,531,45,39],[195,1491,42,42]],
    quay:       [[48,1584,48,81],[96,1584,48,81],[192,1584,48,81],[240,1584,48,81],
                 [336,1584,48,81],[384,1584,48,81]],
    quay_ngan:  [[0,2751,144,60],[240,2772,96,60],[156,2784,75,48]],
    bep_quay:   [[576,3792,96,72],[672,3792,96,72]],
    bep_lo:     [[672,4032,96,72],[432,4128,96,120],[672,4128,96,120]],
    ghe:        [[243,1491,42,42],[291,1491,42,42],[339,1491,42,42],[195,1539,42,42],
                 [243,1539,42,42],[291,1539,42,42],[339,1539,42,42],[582,2979,36,66],
                 [630,2979,36,66],[627,4038,42,63],[579,4131,42,66],[627,4134,42,63],
                 [291,627,42,42]],
    ghe_trai:   [[438,1491,39,63],[486,1491,39,63],[534,1491,39,63],[582,1491,39,63],
                 [642,1587,30,63],[690,1587,30,63],[738,1587,30,63],[294,1026,39,75]],
    ghe_phai:   [[624,1491,30,63],[672,1491,30,63],[720,1491,30,63],[435,1587,39,63],
                 [483,1587,39,63],[531,1587,39,63],[579,1587,39,63],[339,1026,39,75]],
    ban_hoc:    [[3,1716,42,69],[105,1827,39,66],[147,1827,36,63],
                 [249,1827,66,66],[51,1851,42,48],[363,1854,84,66],[117,1923,66,66],
                 [192,1923,39,66],[249,1923,36,63]],
    ban_gv:     [[357,1713,72,105],[531,1713,72,105],[246,1749,84,75],[363,1941,84,75]],
    bang:       [[624,1848,93,63],[630,1941,84,69]],
    tu_sat:     [[576,1923,48,93]],
    tu_trang:   [[48,750,189,93]],
    ke_le:      [[96,888,48,93],[144,888,48,96],[192,888,48,96],[240,888,48,96]],
    ke:         [[306,891,63,93]],
    ke_hang:    [[480,3282,96,102],[576,3282,96,102],[672,3282,96,102],
                 [480,3426,96,102],[576,3426,96,102],[672,3426,96,102]],
    tu_cao:     [[9,2181,78,111],[342,2316,81,117],[438,2352,81,81],[342,2460,81,117],
                 [432,2460,96,117],[486,2748,81,117],[672,2841,48,111],[687,3003,69,93]],
    tu_thap:    [[576,2478,96,66],[57,2847,81,69],[156,2847,75,63],[240,2847,96,63],
                 [0,2847,48,60],[48,2469,48,66],[288,2469,48,66]],
    giuong:     [[102,2337,84,90],[198,2337,84,90]],
    sofa:       [[99,2136,90,54],[243,2163,90,45],[99,2481,90,54],[195,2481,90,54]],
    sofa_lon:   [[48,3471,144,81],[192,3471,144,81]],
    cay:        [[639,2112,69,93],[501,2139,54,93],[579,2166,42,69]],
    cay_nho:    [[6,2370,36,42]],
    den:        [[726,2475,36,57],[678,2481,36,51],[528,2568,45,72],[678,2760,36,54],
                 [576,2568,45,99],[579,2712,39,99],[624,2712,45,99]],
    guong:      [[402,3192,60,96],[306,3240,60,96],[402,3336,60,96]],
    qua_cau:    [[627,1731,39,63],[675,1731,39,63]],
    vo_gom:     [[3,3204,45,48],[51,3204,45,48],[3,3300,45,48],[51,3300,45,48],[99,3204,45,48],
                 [435,3000,42,57],[51,2565,42,54],[99,2565,42,54],[3,2568,45,51]],
    nat:        [[585,2856,81,108],[339,2880,45,63],[528,2889,48,78],[390,2892,75,69],
                 [480,2895,48,63],[336,2976,60,63],[480,2985,48,78]],
    treo_nho:   [[18,990,63,42],[495,1038,63,39],
                 [18,1086,63,42],[390,1086,84,39],[18,1182,63,42],[114,1182,63,42],
                 [480,1275,36,48],[438,1371,36,48],[432,1716,39,57],
                 [489,1716,39,57],[6,3390,39,45],[54,3390,39,45],
                 [102,3390,39,45],[6,3486,39,45],[6,3678,39,45]],
    treo_to:    [[9,702,78,54],[342,1371,84,63],[624,1848,93,63],[630,1941,84,69],
                 [9,1968,78,39],[480,3195,96,57],[39,1269,114,75]],
    cua_so:     [[156,651,75,45],[345,1173,75,60],[441,1173,75,60]],
    tham:       [[543,762,72,54],[540,858,72,54],[540,954,72,54],
                 [633,1002,72,54],[636,1098,72,54],[489,1353,78,84],[576,1353,48,84],
                 [9,2022,129,84],[144,2022,144,84]],
    ban_to:     [[99,2136,90,54],[243,2163,90,45],[99,2481,90,54],[195,2481,90,54],
                 [0,2751,144,60],[57,2847,81,69],[156,2847,75,63],[240,2847,96,63],
                 [39,483,114,111]],
    tren_ban:   [[537,681,33,33],
                 [51,2565,42,54],[99,2565,42,54],[3,2568,45,51],[627,1731,39,63],
                 [675,1731,39,63],[579,3171,39,63],[6,2370,36,42],[156,2784,75,48],
                 [435,3000,42,57],[3,3300,45,48],[51,3300,45,48],
                 [726,2475,36,57],[678,2481,36,51]]
  };
  const gop = (...ten) => [].concat(...ten.map(t => M[t]));

  // Chân của một miếng, tính bằng Ô. `round` chứ không `ceil`: cái ghế rộng 42 điểm ảnh vẫn là một
  // cái ghế đứng trong một ô, còn cái sofa rộng 144 thì chiếm đúng ba.
  const rongO = m => Math.max(1, Math.round(m[2] / O));
  const caoO  = m => Math.max(1, Math.round(m[3] / O));

  // ---------------------------------------------------------------- CHÍN KIỂU PHÒNG
  // Mỗi kiểu là một CĂN PHÒNG CÓ NGHỀ, không phải một bảng màu: sàn, tường và đồ phải cùng kể một
  // câu. Bộ đồ của mỗi kiểu lấy theo đúng mấy CỤM mà tấm free_overview.png của bộ gốc đã xếp sẵn —
  // bộ phòng ngủ nằm một cụm, bộ lớp học một cụm, bộ tiệm một cụm.
  //
  // LUẬT BỐN MIẾNG: mỗi chữ trong mỗi kiểu phải có ÍT NHẤT bốn miếng để bốc. Ít hơn thì cả căn
  // phòng lát lại đúng một hình, và mắt đọc ra giấy dán tường chứ không đọc ra đồ đạc. Đo được:
  // lớp học từng khai `P: gop('tu_sat')` — đúng một cái tủ sắt — và một gian ra mười lăm cái tủ
  // sắt giống hệt nhau xếp thành lưới.
  //
  // LUẬT MỘT Ô: mỗi họ đồ dùng cho một chữ PHẢI có ít nhất một miếng chân rộng đúng một ô. veDo()
  // cắt dãy ngang thành từng miếng; tới cuối dãy, nếu chỗ còn lại hẹp hơn miếng hẹp nhất thì nó bỏ
  // cuộc và paintProp() rơi về cái hộp xám vẽ bằng mã — đúng một ô cuối của MỌI dãy lẻ trong nhà.
  const KIEU = [
    { ma:'khach', ten:'Phòng khách', san:'go_xuongca', tuong:'reu',
      do:{ T: gop('sofa_lon','sofa','ban_to'), S: gop('tu_thap','ke','tu_cao'),
           C: gop('thung_go'), P: gop('cay','den','cay_nho'), x: gop('ghe','ban_to') },
      ban: gop('ban_to'), treo: gop('treo_to','treo_nho','cua_so'), tham: gop('tham') },
    { ma:'bep', ten:'Bếp', san:'men_kem', tuong:'ngoc',
      do:{ T: gop('quay'), S: gop('bep_quay','bep_quay','bep_lo','bep_lo','tu_trang'),
           C: gop('thung_go'), P: gop('cay_nho','cay'), x: gop('quay_ngan') },
      ban: gop('quay_ngan'), treo: gop('treo_nho','cua_so'), tham: [] },
    { ma:'ngu', ten:'Phòng ngủ', san:'go_xuongca', tuong:'hong_dat',
      do:{ T: gop('giuong','giuong','ghe'), S: gop('tu_cao','tu_thap'),
           C: gop('thung_go'), P: gop('den','cay','guong'), x: gop('ghe','tu_thap') },
      ban: gop('tu_thap'), treo: gop('treo_nho','cua_so'), tham: gop('tham') },
    { ma:'tam', ten:'Phòng tắm', san:'men_ngoc', tuong:'ngoc',
      do:{ T: gop('tu_trang','quay_ngan'), S: gop('tu_trang','guong','ke'),
           C: gop('thung_go'), P: gop('cay_nho','cay'), x: gop('quay_ngan') },
      ban: gop('quay_ngan'), treo: gop('treo_nho'), tham: [] },
    { ma:'kho', ten:'Nhà kho', san:'be_tong', tuong:'go_nhat',
      do:{ T: gop('thung_go','tu_thap'), S: gop('ke_le','ke','tu_cao'),
           C: gop('thung_go','thung'), P: gop('tu_sat','thung_go'), x: gop('thung_go') },
      ban: gop('tu_thap'), treo: gop('treo_nho'), tham: [] },
    { ma:'thu', ten:'Thư phòng', san:'go_xuongca', tuong:'go_do',
      do:{ T: gop('ban_hoc','ban_gv'), S: gop('ke','tu_cao','tu_thap'),
           C: gop('thung_go'), P: gop('cay','tu_cao'), x: gop('ghe','qua_cau','den') },
      ban: gop('ban_gv','ban_to'), treo: gop('treo_to','treo_nho'), tham: gop('tham') },
    { ma:'tiem', ten:'Tiệm tạp hoá', san:'gach_do', tuong:'kem',
      do:{ T: gop('quay_ngan'), S: gop('ke_hang','ke_hang','ke_le'),
           C: gop('thung_go','thung'), P: gop('tu_sat','vo_gom'), x: gop('thung_go') },
      ban: gop('quay_ngan'), treo: gop('treo_nho'), tham: [] },
    { ma:'lop', ten:'Lớp học', san:'men_kem', tuong:'xam_lam',
      do:{ T: gop('ban_hoc'), S: gop('bang','bang','ban_gv','tu_sat'),
           C: gop('thung_go'), P: gop('tu_sat','ke_le','cay','ban_gv'), x: gop('ghe','ban_hoc') },
      ban: gop('ban_gv'), treo: gop('treo_to','treo_nho'), tham: [] },
    // Do vo la GIA VI, khong phai ca can phong. Ban truoc cho ca nam chu deu tro vao mot ho
    // `nat`, va ket qua la mot can phong lat kin bang tam manh do vo lap di lap lai — doc ra
    // giay dan tuong chu khong doc ra mot can nha bi bo. Chu du an: 'khong he hop ly'.
    //
    // Mot can nha bo hoang van la MOT CAN NHA: van co tu, co ban, co ke — chi la chung sut
    // gay va phu bui. Nen bo do dac binh thuong lam nen, do vo chi chen vao chu 'x' va mot
    // phan chu 'C'.
    { ma:'hoang', ten:'Phòng bỏ hoang', san:'be_tong', tuong:'go_vua',
      do:{ T: gop('ban_to','tu_thap'), S: gop('tu_cao','ke_le'),
           C: gop('thung_go','nat'), P: gop('vo_gom','cay'), x: gop('nat') },
      ban: gop('ban_to','tu_thap'), treo: gop('treo_nho'), tham: [] }
  ];
  // ĐỒ ĐỂ LÊN MẶT BÀN — chậu bông, quả địa cầu, giỏ trái cây, cái đèn. Chủ dự án: "mấy cái bàn
  // bạn có thể dàn bự ra xong để decor lên trên cho đẹp — như để chậu bông, quả địa cầu, vv".
  //
  // CHIA THEO KIỂU PHÒNG, không dùng chung một rổ. Bản trước dùng chung, và một người soi lại
  // đã bắt đúng chỗ đó: trên quầy của tiệm tạp hoá mọc ra một quả địa cầu. Quả địa cầu là đồ
  // của lớp học và thư phòng; giỏ trái cây là đồ của tiệm và bếp; cái đèn thì ở đâu cũng được.
  const BAN_CHUNG = gop('den', 'cay_nho');
  const TREN_BAN = {
    khach: gop('den','cay_nho','vo_gom'),
    bep:   gop('cay_nho').concat(M.tren_ban.slice(0, 7)),
    ngu:   gop('den','cay_nho'),
    tam:   gop('cay_nho'),
    kho:   gop('thung'),
    thu:   gop('qua_cau','den','cay_nho'),
    tiem:  M.tren_ban.slice(0, 7).concat(gop('cay_nho')),
    lop:   gop('qua_cau'),
    hoang: gop('vo_gom')
  };

  // ---------------------------------------------------------------- BỐC BIẾN THỂ
  // Bốc theo TOẠ ĐỘ Ô, không theo dòng ngẫu nhiên — cùng cái luật đã có sẵn trong game.js cho sàn
  // vẽ bằng mã ("vân ngẫu nhiên từng ô biến bức tường thành vệt loang"), và nó áp cho cả đồ đạc:
  // một cái tủ bốc lại kiểu mỗi lần vẽ là một cái tủ nhấp nháy.
  function bam(a, b, c){
    let h = (a * 374761393 + b * 668265263 + c * 2246822519) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0);
  }

  // ---------------------------------------------------------------- SÀN
  function veSan(c, x, y, ki, gx, gy, T){
    const k = KIEU[ki];
    if (!k || !xong(RB)) return false;
    const g = SAN[k.san];
    const v = bam(gx, gy, ki + 11) % 6;
    c.drawImage(RB, (g[0] + v % 3) * O, (g[1] + (v / 3 | 0)) * O, O, O, x, y, T, T);
    return true;
  }

  // ---------------------------------------------------------------- TƯỜNG
  // `mat` = ô ngay dưới là khoảng trống, tức bức tường này đang quay mặt xuống một căn phòng.
  function veTuong(c, x, y, ki, gx, gy, T, mat){
    const k = KIEU[ki];
    if (!k || !xong(RB)) return false;
    const t = TUONG[k.tuong], r = t[0], lech = t[1];
    // 1. MẶT TRÊN. Cắt ở độ lệch đã đo nên hai ô chồng lên nhau không lộ mối, rồi phủ một lớp tối:
    //    đỉnh tường là mặt quay đi khỏi nguồn sáng, và nó phải TỐI HƠN mặt trước thì cả bức mới đọc
    //    ra một khối có bề dày. Đây cũng là quy ước sẵn có của game (xem dốc mặt sau trong
    //    prerenderWorld).
    c.drawImage(RB, 1 * O, r * O + lech, O, O, x, y, T, T);
    c.fillStyle = 'rgba(8,6,4,0.40)';
    c.fillRect(x, y, T, T);
    // 2. MẶT TRƯỚC, nửa dưới ô. Lấy đúng nửa DƯỚI của mặt tường nguồn — chỗ có dải trang trí và
    //    chân tường — chứ không thu cả mặt tường vào nửa ô: thu là méo, cắt là nét.
    if (mat){
      const nua = O >> 1;
      c.drawImage(RB, 1 * O, (r + 2) * O - nua, O, nua, x, y + T / 2, T, T / 2);
      // Một vạch tối ở chỗ mặt trên gặp mặt trước. Không có nó thì hai mảng cùng nước sơn dính vào
      // nhau và cái gờ biến mất — mà chính cái gờ là thứ nói "đây là một khối".
      c.fillStyle = 'rgba(0,0,0,0.42)';
      c.fillRect(x, y + T / 2 - 0.5, T, 1);
    }
    return true;
  }

  // ---------------------------------------------------------------- VẼ MỘT MIẾNG
  // Giữ đúng tỉ lệ điểm ảnh của miếng, đứng giữa cái chân `chan` ô, đáy chạm đáy ô.
  // `nangDay` để nhấc món lên khỏi mặt sàn — dùng khi đặt đồ LÊN MẶT BÀN hoặc treo lên tường.
  // BÁO RA MỖI MIẾNG VỪA VẼ — `onMieng(x, y, rộng, cao)` trong toạ độ thế giới.
  //
  // Vì sao tệp này phải nói ra: lưới ô của game chỉ đánh dấu MỘT ô là "có đồ", mà 145 trên 194
  // miếng trong bảng `M` CAO HƠN một ô — cây dừa 93 điểm ảnh nguồn tràn 0,94 ô, cái tủ 117 tràn
  // 1,44 ô, cái bếp lò 120 tràn 1,5 ô. Lớp ánh sáng bên game.js dựng theo lưới, nên nó soi đúng
  // một ô rồi tắt, cắt ngang thân món đồ. Nó không thể tự biết: `bam(...)` bốc một miếng ở dòng
  // dưới rồi vứt đi, chiều cao thật không được lưu vào đâu cả.
  //
  // Một cái móc một chiều chứ không phải một mảng trả về: `veDo` vẽ nhiều miếng ở nhiều ô trong
  // một lần gọi (dãy ngang, cột dọc, đồ đặt lên bàn), nên gom lại thành giá trị trả về là dựng
  // một cấu trúc thứ hai để rồi bên kia tháo ra. Ai cần thì gắn móc, không ai gắn thì không tốn gì.
  function veMieng(c, m, x, y, T, chan, nangDay){
    const k = T / O;                      // 1 điểm ảnh nguồn = nửa đơn vị thế giới
    const w = m[2] * k, h = m[3] * k;
    const dx = x + (chan * T - w) / 2, dy = y + T - h - (nangDay || 0);
    c.drawImage(IT, m[0], m[1], m[2], m[3], dx, dy, w, h);
    if (root.REPO_PHONG && root.REPO_PHONG.onMieng) root.REPO_PHONG.onMieng(dx, dy, w, h);
  }

  // ---------------------------------------------------------------- ĐỒ ĐẠC
  //
  // Mẫu phòng viết đồ thành DÃY — ngang ('TTT') lẫn dọc. Nếu mỗi ô tự bốc một miếng thì cái ghế
  // sofa rộng ba ô không bao giờ dùng được, và một dãy dọc bốn ô ra bốn cái tủ đè lên nhau.
  //
  // Nên chỗ này CẮT CẢ HAI CHIỀU, và tính lại từ đầu dãy cho từng ô chứ không nhớ trạng thái giữa
  // hai lần gọi. Đắt hơn (một dãy 19 ô thì tính 19 lần) nhưng đổi lại paintProp() vẫn là một hàm
  // thuần: vẽ lại một ô bất kỳ, ở bất kỳ thứ tự nào, vẫn ra đúng cái đã có. Vẽ nền chỉ chạy một lần
  // mỗi màn, nên cái giá ấy là vài trăm phép tính cho cả căn nhà.
  function veDo(c, x, y, ki, ch, gx, gy, T, dauX, dai, dauY, cao, chatTren){
    const k = KIEU[ki];
    if (!k || !xong(IT)) return false;
    const ds0 = k.do[ch];
    if (!ds0 || !ds0.length) return false;

    // ---- CẮT DÃY DỌC TRƯỚC
    //
    // ROOT-CAUSE của lỗi "đồ chồng lên nhau thành một vệt": bản trước chỉ cắt theo hàng ngang. Mẫu
    // phòng có cả cột dọc, và mỗi ô trong cột đều tự vẽ một miếng cao hơn một ô — mà miếng cao thì
    // tràn LÊN TRÊN, đè đúng vào ô vừa vẽ xong.
    //
    // Cắt từ ĐÁY dãy lên: đáy là ô neo, rồi cứ mỗi `buoc` ô lại một ô neo. Neo từ đáy chứ không từ
    // đỉnh vì miếng đồ đặt đáy ở đáy ô — phần thừa của một dãy lẻ phải rơi lên ĐỈNH, chỗ nó tràn ra
    // ngoài dãy và dựa vào bức tường phía trên, đúng như một cái tủ dựa tường.
    const buoc = ds0.reduce((m, p) => Math.max(m, caoO(p)), 1);
    const duoi = dauY + cao - 1;
    if (buoc > 1 && ((duoi - gy) % buoc)) return true;
    // Còn đủ chỗ cho một miếng cao trọn vẹn thì BẮT BUỘC lấy miếng cao. Lấy miếng thấp ở đây là để
    // hở đúng cái ô phía trên vừa bị tuyên bố "đã có người phủ".
    const conDoc = gy - dauY + 1;
    let ds = (buoc > 1 && conDoc >= buoc) ? ds0.filter(m => caoO(m) === buoc) : ds0;
    // Ô NGAY TRÊN ĐÃ CÓ MÓN KHÁC LOẠI đứng rồi thì món ở đây phải LÙN. Dãy dọc ở trên chỉ cắt
    // theo cùng một loại đồ, nên hai loại xếp chồng nhau ('S' nằm ngay trên 'T') vẫn lọt: cả
    // hai đều tưởng mình đứng một mình và cùng vươn cao hai ô. Người soi lại đếm được mười ba
    // bản sao chồng lên nhau kiểu đó ở riêng thư phòng.
    if (chatTren){
      const lun = ds.filter(m => caoO(m) === 1);
      if (lun.length) ds = lun;
    }
    if (!ds.length) return false;

    // ---- RỒI CẮT DÃY NGANG
    let i = dauX;
    while (i <= gx){
      const conLai = dauX + dai - i;
      // Bốc trong số những miếng KHÔNG rộng quá chỗ còn lại. Không lọc thì cái sofa ba ô rơi vào
      // hai ô cuối dãy và thò một phần ba sang ô của bức tường bên cạnh.
      let vua = ds;
      if (conLai < 3){
        vua = ds.filter(m => rongO(m) <= conLai);
        if (!vua.length) vua = ds.filter(m => rongO(m) === 1);
        if (!vua.length) return false;
      }
      const m = vua[bam(i, gy, ki + 29) % vua.length];
      const r = rongO(m);
      // VẼ Ở Ô CUỐI CÙNG CỦA MIẾNG, KHÔNG PHẢI Ô ĐẦU.
      //
      // Vòng vẽ thế giới quét từ trái sang phải, và MỖI Ô TỰ TÔ SÀN CỦA NÓ ngay trước khi vẽ
      // đồ lên. Neo miếng ở ô đầu thì phần thân tràn sang phải bị chính mấy ô bên phải tô sàn
      // đè mất — một cái bảng đen rộng hai ô hiện ra đúng một ô rồi bị cắt đứng một nhát. Chủ
      // dự án: "vẫn còn art bị cắt, khuyết".
      //
      // Neo ở ô CUỐI thì cả thân miếng tràn về bên TRÁI, tức về phía ĐÃ VẼ XONG. Đây đúng là
      // luật mà veTham() đã phải theo, chỉ là veDo() chưa theo.
      const cuoi = Math.min(i + r - 1, dauX + dai - 1);
      if (gx >= i && gx <= cuoi){
        if (gx < cuoi) return true;                 // còn ô nữa mới tới lượt vẽ
        const x0 = x - (gx - i) * T;
        veMieng(c, m, x0, y, T, r);
        // ĐỒ ĐỂ LÊN MẶT BÀN. Chỉ những miếng nằm trong danh sách `ban` của kiểu này mới được nhận —
        // để một quả địa cầu không mọc trên nóc cái tủ lạnh. Nhấc lên 55% chiều cao miếng bàn thì
        // nó đứng đúng trên mặt bàn chứ không lửng lơ giữa thân bàn.
        const tb = TREN_BAN[k.ma] || BAN_CHUNG;
        if (k.ban && k.ban.indexOf(m) >= 0 && tb.length){
          const h2 = bam(i, gy, ki + 71);
          if (h2 % 100 < 62){
            const d = tb[(h2 >>> 7) % tb.length];
            veMieng(c, d, x0, y, T, r, m[3] * (T / O) * 0.55);
          }
          // GHẾ KÊ BÊN BÀN. Ghế nhìn nghiêng chỉ có đúng một chỗ đứng: quay mặt vào một cái
          // bàn. Ghế lưng-trái ngồi bên TRÁI bàn, ghế lưng-phải ngồi bên PHẢI. Chỉ kê cho bàn
          // rộng từ hai ô, vì bàn một ô thì cái ghế phủ kín mặt bàn.
          // MOT cai ghe, ke BEN TRAI ban. Ke ca hai ben thi hai cai lung ghe kep lay mat ban
          // va ca cum doc ra mot khoi do lien chu khong ra ban voi ghe. Ben trai chu khong
          // ben phai vi vong ve quet tu trai sang phai: cho ben trai ban DA TO SAN XONG, tran
          // ra do thi khong ai to de len nua.
          if (r >= 2){
            const h3 = bam(i, gy, ki + 113);
            if (h3 % 100 < 60)
              veMieng(c, M.ghe_trai[(h3 >>> 5) % M.ghe_trai.length], x0 - T*0.3, y, T, 1);
          }
        }
        return true;
      }
      i += r;
    }
    return true;                                  // ô này nằm trong bụng một miếng đã vẽ
  }

  // ---------------------------------------------------------------- TRANH, GƯƠNG, CỬA SỔ
  //
  // Treo lên MẶT TƯỜNG, nên chỉ những ô tường đang quay mặt xuống một căn phòng mới nhận. Không
  // phải đồ đặc: nó không chắn đường, không chắn tầm nhìn, và game.js không đụng gì tới lưới va
  // chạm khi gọi hàm này.
  //
  // `rongTuong` là số ô tường liền mặt còn lại tính từ ô này sang PHẢI — game.js đếm hộ, vì nó là
  // đứa giữ lưới. Không có nó thì bức tranh rộng ba ô treo lên đoạn tường chỉ còn hai ô và thò một
  // phần ba ra ngoài trời.
  function veTreo(c, x, y, ki, gx, gy, T, rongTuong){
    const k = KIEU[ki];
    if (!k || !xong(IT) || !k.treo || !k.treo.length) return false;
    const h = bam(gx, gy, ki + 53);
    if (h % 100 >= 22) return false;              // thưa: chừng bốn ô tường mới có một món
    // KHONG TREO MON CAO HON MOT O. Buc tuong day dung mot o; mot buc tranh cao 75 diem anh
    // treo len no se tho gan mot o len tren, tuc sang han SAN CUA CAN PHONG PHIA TREN. Chu du
    // an chi dung cho do: 'sao anh review cua ban van bi cat ne'. Cai bi cat khong phai anh ma
    // la buc tranh — no dang nam nua trong nua ngoai.
    const vua = k.treo.filter(m => rongO(m) <= rongTuong && m[3] <= O);
    if (!vua.length) return false;
    const m = vua[(h >>> 7) % vua.length];
    // Treo CAO nhung khong qua mep tren cua o: nhac len mot phan chieu cao con thua, toi da
    // 0,22 o. Dat sat day o thi no dung tren san va doc ra mot tam van dua tuong.
    const thua = (T - m[3] * (T / O)) / T;
    veMieng(c, m, x, y, T, rongO(m), T * Math.min(0.22, Math.max(0, thua)));
    return true;
  }

  // ---------------------------------------------------------------- THẢM
  //
  // Neo ở góc DƯỚI-PHẢI của mảng sàn, không phải góc trên-trái. Lý do là thứ tự vẽ: prerenderWorld
  // quét từ trên xuống, trái sang phải, nên tấm thảm chỉ được phép tràn về phía đã vẽ xong. Neo
  // trên-trái thì mấy ô bên phải vẽ sau sẽ tô sàn đè lên chính tấm thảm.
  //
  // `trong(w, h)` là câu hỏi gửi ngược cho game.js: hình chữ nhật w×h ô kết thúc ở ô này có sạch
  // không (toàn sàn, không đồ, cùng một phòng). Phải hỏi vì trải thảm đè lên một cái tủ đã vẽ xong
  // thì cái tủ biến mất.
  function veTham(c, x, y, ki, gx, gy, T, trong){
    const k = KIEU[ki];
    if (!k || !xong(IT) || !k.tham || !k.tham.length) return false;
    // Neo tren mot LUOI THUA 6x5 chu khong ra o nao cung duoc. Chi tha ngau nhien thi hai tam
    // tham canh nhau cung do va de len nhau — do that o thu phong: hai tam chong nhau giua
    // phong, tam duoi thanh mot cai vien vo nghia. Luoi thua thi hai neo cach nhau it nhat sau
    // o, con tam rong nhat chi ba o.
    if ((gx % 6) !== 3 || (gy % 5) !== 3) return false;
    const h = bam(gx, gy, ki + 97);
    if (h % 100 >= 45) return false;
    const m = k.tham[(h >>> 7) % k.tham.length];
    const rw = rongO(m), rh = caoO(m);
    if (!trong(rw, rh)) return false;
    const kk = T / O, w = m[2] * kk, hh = m[3] * kk;
    // Trải PHẲNG: căn giữa cả bề ngang lẫn bề dọc của mảng ô, không đặt đáy chạm đáy ô như đồ đứng.
    // Thảm nằm trên mặt sàn, nó không có mặt đứng để mà neo.
    c.drawImage(IT, m[0], m[1], m[2], m[3],
                x + T - (rw * T + w) / 2, y + T - (rh * T + hh) / 2, w, hh);
    return true;
  }

  root.REPO_PHONG = {
    KIEU, veSan, veTuong, veDo, veTreo, veTham,
    so: KIEU.length,
    ten: i => (KIEU[i] && KIEU[i].ten) || '',
    ma:  i => (KIEU[i] && KIEU[i].ma) || '',
    // Bảng có sẵn hay chưa. game.js hỏi câu này để biết nên vẽ bằng tile hay rơi về nước sơn vẽ
    // bằng mã — và nó hỏi ở MỖI Ô chứ không hỏi một lần, vì ảnh nạp xong lúc nào không biết.
    sanSang: () => xong(RB) && xong(IT)
  };
})(window);
