// KIỂU PHÒNG — sàn, tường và đồ đạc lấy từ tấm tile thật.
//
// Chủ dự án: "dùng Modern_Interiors dàn nhiều room style mới... nhớ gắn các tile cho hợp lý.
// sau đó thì 1 map random nhiều room style khác nhau. room style cũ hiện tại (cổ mộ) thì cứ
// giữ lại để làm 1 style riêng."
//
// Bộ hình: Modern Interiors (free v2.2) của LimeZu — https://limezu.itch.io/moderninteriors
// Giấy phép ở art/room/LICENSE-limezu.txt: **CHỈ DỰ ÁN PHI THƯƠNG MẠI**. Bản free không được
// dùng cho dự án thương mại, kể cả bản đã sửa. Ngày nào hub này bán vé thì phải mua bản đầy đủ
// (1,20$) hoặc gỡ tệp này ra — game vẫn chạy, mọi phòng rơi về nước sơn vẽ bằng mã.
//
// ============================================================ VÌ SAO LÀ BẢN 48×48
//
// prerenderWorld() vẽ cả thế giới ở SS=2, tức mỗi ô 24 đơn vị thế giới được 48 điểm ảnh để vẽ.
// Bộ này có sẵn ba cỡ 16/32/48, nên bản 48 dán vào ĐÚNG MỘT ĐỔI MỘT: không phóng, không thu,
// không một điểm ảnh nào bị nội suy. Chọn bản 16 rồi phóng lên 3 lần cũng ra hình đó, nhưng khi
// ấy mọi nét chéo trong tấm gỗ xương cá đều phải qua một lần lọc — mà thứ duy nhất bộ tile này
// bán cho ta là NÉT.
//
// ============================================================ BA THỨ MỘT KIỂU PHÒNG PHẢI KHAI
//
//   san    một khối 3×2 ô trong Room_Builder = SÁU biến thể lát được, bốc theo toạ độ ô.
//   tuong  một khối 2 hàng. Hàng trên (cột 5) là thân tường không viền hông; hàng dưới (cột 1)
//          là mặt tường, có sẵn chân tường ở đáy.
//   do     mỗi chữ trong mẫu phòng (T bàn, S kệ, C thùng, P tủ/chậu, x khối) ứng với một danh
//          sách miếng đồ. Nhờ vậy MỘT mẫu phòng vẽ tay chạy được với MỌI kiểu: chữ 'T' trong
//          bếp ra cái quầy, cũng chữ ấy trong lớp học ra cái bàn học sinh.
//
// Hầm mộ KHÔNG có mặt trong bảng này. Nó vẫn là kiểu vẽ bằng mã trong game.js (paintStone,
// paintStoneInlay, paintStoneFrieze, mấy món quan tài/vò/đá vụn) — giữ nguyên, và nó là một
// kiểu ngang hàng với chín kiểu ở đây chứ không phải cái bị thay.
(function (root) {
  'use strict';
  if (root.REPO_PHONG) return;

  // Đường dẫn và dấu ?v= suy ra từ chính thẻ script này — cùng một mẹo với sprites.js, và vì
  // cùng một lý do: MỘT tệp js phục vụ hai trang nằm ở hai thư mục khác nhau, còn ảnh thì không
  // có dấu chống cache nào của riêng nó.
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
    im.onerror = () => { im._hong = true; };
    im.src = HERE + tep + VER;
    return im;
  }
  const RB = nap('art/room/room-builder.png');   // sàn + tường
  const IT = nap('art/room/interiors.png');      // đồ đạc
  const xong = im => !!(im && im.complete && im.naturalWidth > 0);

  // ---------------------------------------------------------------- BẢNG Ô NGUỒN
  // Toạ độ tính bằng Ô, không bằng điểm ảnh, và trùng khít với lưới của bản 16×16 — nên soi
  // bảng này bằng bản 16 rồi dùng cho bản 48 vẫn đúng số.
  //
  // SÀN: goc trên trái của khối 3×2. Sáu ô trong khối là sáu biến thể của CÙNG một mặt sàn
  // (gạch lệch mạch, vệt mòn khác chỗ), lát cạnh nhau thế nào cũng liền.
  const SAN = {
    gach_do:    [11, 5],
    men_kem:    [11, 7],
    men_ngoc:   [11, 9],
    be_tong:    [11, 11],
    go_xuongca: [11, 13]
  };
  // TƯỜNG — [hàng trên của khối, độ lệch cắt mặt trên].
  //
  // Chủ dự án: "phần wall bạn phải dựng kiểu soul knight như vậy nè", kèm ảnh: tường là một
  // dãy KHỐI, mỗi khối có mặt trên tối và một mặt trước sáng ở cạnh dưới.
  //
  // Bản trước dán nguyên một mặt tường phẳng lên mọi ô, và đó là chỗ sai: bộ Modern Interiors
  // vẽ tường cho khung nhìn ĐỨNG (một bức tường cao hai ô, có phào trên và chân tường dưới),
  // còn game này nhìn từ trên xuống với tường dày đúng một ô. Dán thẳng thì bức tường không có
  // bề dày — và tệ hơn, cái dải trang trí nằm ngang của giấy dán tường lặp lại ở MỌI ô của một
  // bức tường dọc, thành một cái thang sọc.
  //
  // Nay mỗi ô tường dựng bằng hai lượt:
  //   1. MẶT TRÊN  — mảng tường trơn, làm tối. Đây là đỉnh khối nhìn từ phía khuất.
  //   2. MẶT TRƯỚC — nửa dưới của mặt tường (dải trang trí + chân tường), chỉ vẽ khi ô ngay
  //      dưới là khoảng trống. Đó đúng là cái mặt đứng mà người chơi nhìn thấy.
  //
  // ĐỘ LỆCH là con số cứu lượt 1. Trong khối tường cao 96 điểm ảnh (hai hàng ở cột 1), không
  // có ô 48 nào trơn tuyệt đối, nhưng CÓ một cửa sổ mà hàng đầu và hàng cuối trùng màu — lát
  // dọc bao nhiêu ô cũng không lộ mối. Bốn số 24/27/31 dưới đây là đo ra: quét cả 49 vị trí,
  // chấm bằng tổng biến động trong cửa sổ cộng ba lần độ lệch giữa hàng đầu và hàng cuối.
  // Ba nước sơn có dải trang trí (hồng đất, kem, ngọc) chấm 200-350; năm nước còn lại 12-42,
  // tức gần như trơn hẳn. Đổi tấm png thì phải đo lại, đừng đoán.
  const TUONG = {
    hong_dat: [5, 24], kem: [7, 24], ngoc: [9, 24], go_nhat: [11, 27],
    go_vua: [13, 27], go_do: [15, 27], xam_lam: [17, 31], reu: [19, 31]
  };

  // ---------------------------------------------------------------- MIẾNG ĐỒ
  // [cột, hàng, rộng, cao] tính bằng ô. Cao 2 nghĩa là món đồ ĐỨNG: nó chiếm ô của nó và tràn
  // một ô LÊN TRÊN. Đó không phải lỗi mà là cách một cái tủ được nhìn từ 3/4 — và vì
  // prerenderWorld() quét từ trên xuống nên phần tràn ấy đè lên ô đã vẽ xong, đúng thứ tự xa-gần.
  //
  // KHÔNG có miếng nào cao 3. Hàng đồ trong mẫu phòng thường nằm ngay sát tường trên, mà tràn
  // ba ô là nuốt trọn bức tường ấy — cái tủ khi đó không dựa vào tường, nó THAY tường.
  const M = {
    // thùng, hòm — cao 1 ô, đặt đâu cũng được
    thung:      [[4,31,1,1],[5,31,1,1],[6,31,1,1],[7,31,1,1],
                 [4,32,1,1],[5,32,1,1],[6,32,1,1],[7,32,1,1]],
    thung_nho:  [[12,11,1,1]],
    // quầy bar / quầy bếp — dãy ngang, ghép bao nhiêu cái cũng liền mạch
    quay:       [[0,33,1,2],[1,33,1,2],[3,33,1,2],[4,33,1,2],[6,33,1,2],[7,33,1,2]],
    quay_guong: [[2,33,1,2],[5,33,1,2]],
    quay_ngan:  [[0,57,1,2],[1,57,1,2],[2,57,1,2]],
    ghe:        [[9,31,1,2],[10,31,1,2],[12,33,1,2]],
    ghe_go:     [[12,62,1,2],[13,62,1,2]],
    ban_hoc:    [[0,36,1,2],[1,36,1,2],[2,36,1,2],[3,36,1,2],[4,36,1,2]],
    tu_sat:     [[12,40,1,2]],
    bang:       [[13,40,2,2],[6,36,2,2],[13,38,2,2]],
    cay:        [[13,44,1,2],[11,44,1,2],[0,49,1,2]],
    cay_nho:    [[12,45,1,1]],
    tu_go:      [[11,48,2,2],[13,48,2,2]],
    tu_thap:    [[0,59,2,2],[2,59,2,2]],
    den_ban:    [[14,51,1,2],[15,51,1,2],[11,53,1,2],[12,53,1,2]],
    den_dung:   [[12,57,1,2]],
    tu_trang:   [[1,16,2,2],[3,16,2,2]],
    tu_le:      [[1,16,1,2],[2,16,1,2],[3,16,1,2],[4,16,1,2]],
    ke_do:      [[2,19,2,2],[4,19,2,2]],
    ke_le:      [[2,19,1,2],[3,19,1,2],[4,19,1,2],[5,19,1,2]],
    gia_sat:    [[6,19,1,2],[7,19,1,2]],
    ke_hang:    [[10,69,2,2],[12,69,2,2],[14,69,2,2],
                 [10,72,2,2],[12,72,2,2],[14,72,2,2]],
    sofa:       [[1,72,3,2],[4,72,3,2],[7,72,3,2]],
    ghe_bet:    [[1,74,2,2],[3,74,2,2]],
    bep_lo:     [[12,79,2,2],[14,79,2,2]],
    nat_dung:   [[7,59,1,2],[9,61,1,2]],
    nat_bet:    [[2,62,2,2],[4,62,2,2],[8,59,2,2]],
    vo_gom:     [[0,67,1,1],[1,67,1,1],[2,67,1,1]]
  };
  const gop = (...ten) => [].concat(...ten.map(t => M[t]));

  // LUAT MOT O: MOI ho do duoi day PHAI co it nhat mot mieng rong dung mot o.
  //
  // Day khong phai lam cho dep. veDo() cat mot day ngang thanh tung mieng; toi cuoi day,
  // neu cho con lai hep hon mieng hep nhat thi no bo cuoc va tra false, va paintProp() roi
  // ve cai hop xam ve bang ma. Do duoc: mot ho toan mieng rong hai o, gap day le ('SSS'),
  // cho ra hai cai ke hang tu te roi mot cai hop xam dung canh - dung mot o cuoi cua MOI
  // day le trong ca can nha. Mot mieng rong mot o thi cai o thua ay luon co cho lap.
  //
  // Kiem lai bang tay khi them kieu moi: doc theo cot, moi dong phai co it nhat mot ten ho
  // ma mieng dau tien cua no ket thuc bang `,1,` hoac `,1,1]`.

  // ---------------------------------------------------------------- CHÍN KIỂU PHÒNG
  // Mỗi kiểu là một CĂN PHÒNG CÓ NGHỀ, không phải một bảng màu: sàn, tường và đồ phải cùng kể
  // một câu. Đó là chỗ "gắn các tile cho hợp lý" nằm — cái quầy bếp chỉ xuất hiện trên nền gạch
  // men, cái kệ hàng chỉ đứng trên nền gạch đỏ của tiệm tạp hoá.
  //
  // Chín kiểu này KHÔNG dùng lại một cặp sàn+tường nào: chỉ có năm mặt sàn trong bộ free, nên
  // sàn phải lặp, nhưng cặp sàn-tường thì mỗi kiểu một cặp riêng. Nhìn nước tường là biết đang
  // ở phòng nào, kể cả khi hai phòng cùng lát một thứ gỗ.
  const KIEU = [
    { ma:'khach', ten:'Phòng khách', san:'go_xuongca', tuong:'reu', do:{
        T: gop('sofa','ghe_bet','ghe_go'), S: gop('tu_go','tu_thap','tu_le'),
        C: gop('thung'), P: gop('cay','cay_nho'), x: gop('ghe_go') } },
    { ma:'bep', ten:'Bếp', san:'men_kem', tuong:'ngoc', do:{
        T: gop('quay'), S: gop('bep_lo','tu_go','tu_le'),
        C: gop('thung'), P: gop('cay','cay_nho'), x: gop('quay_ngan') } },
    { ma:'ngu', ten:'Phòng ngủ', san:'go_xuongca', tuong:'hong_dat', do:{
        T: gop('ghe_bet','tu_thap','ghe_go'), S: gop('tu_go','tu_le'),
        C: gop('thung'), P: gop('den_ban','cay','cay_nho'), x: gop('ghe_go','den_dung') } },
    { ma:'tam', ten:'Phòng tắm', san:'men_ngoc', tuong:'ngoc', do:{
        T: gop('quay_guong'), S: gop('tu_trang','tu_le'),
        C: gop('thung'), P: gop('cay','cay_nho'), x: gop('quay_ngan') } },
    { ma:'kho', ten:'Nhà kho', san:'be_tong', tuong:'go_nhat', do:{
        T: gop('tu_thap','quay_ngan'), S: gop('gia_sat','ke_do','ke_le'),
        C: gop('thung','thung_nho'), P: gop('tu_sat','tu_le'), x: gop('thung') } },
    { ma:'thu', ten:'Thư phòng', san:'go_xuongca', tuong:'go_do', do:{
        T: gop('ban_hoc','ghe_go'), S: gop('tu_go','tu_thap','ke_le'),
        C: gop('thung'), P: gop('cay','cay_nho'), x: gop('ghe_go','den_dung') } },
    { ma:'tiem', ten:'Tiệm tạp hoá', san:'gach_do', tuong:'kem', do:{
        T: gop('quay_ngan'), S: gop('ke_hang','ke_le'),
        C: gop('thung','thung_nho'), P: gop('tu_sat','cay'), x: gop('thung') } },
    { ma:'lop', ten:'Lớp học', san:'men_kem', tuong:'xam_lam', do:{
        T: gop('ban_hoc'), S: gop('bang','tu_sat'),
        C: gop('thung'), P: gop('tu_sat'), x: gop('ghe') } },
    { ma:'hoang', ten:'Phòng bỏ hoang', san:'be_tong', tuong:'go_vua', do:{
        T: gop('nat_bet','nat_dung'), S: gop('nat_bet','nat_dung'),
        C: gop('nat_dung','thung'), P: gop('vo_gom'), x: gop('nat_dung') } }
  ];


  // ---------------------------------------------------------------- BỐC BIẾN THỂ
  // Bốc theo TOẠ ĐỘ Ô, không theo dòng ngẫu nhiên. Đây là cái luật đã có sẵn trong game.js cho
  // sàn vẽ bằng mã ("vân ngẫu nhiên từng ô biến bức tường thành vệt loang"), và nó áp cho cả
  // đồ đạc: một cái tủ bốc lại kiểu mỗi lần vẽ là một cái tủ nhấp nháy.
  function bam(a, b, c){
    let h = (a * 374761393 + b * 668265263 + c * 2246822519) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0);
  }

  // ---------------------------------------------------------------- VẼ
  function veSan(c, x, y, ki, gx, gy, T){
    const k = KIEU[ki];
    if (!k || !xong(RB)) return false;
    const g = SAN[k.san];
    const v = bam(gx, gy, ki + 11) % 6;
    c.drawImage(RB, (g[0] + v % 3) * O, (g[1] + (v / 3 | 0)) * O, O, O, x, y, T, T);
    return true;
  }

  // `mat` = ô ngay dưới là khoảng trống, tức bức tường này đang quay mặt xuống một căn phòng.
  function veTuong(c, x, y, ki, gx, gy, T, mat){
    const k = KIEU[ki];
    if (!k || !xong(RB)) return false;
    const t = TUONG[k.tuong], r = t[0], lech = t[1];
    // 1. MẶT TRÊN. Cắt ở độ lệch đã đo nên hai ô chồng lên nhau không lộ mối, rồi phủ một lớp
    //    tối: đỉnh tường là mặt quay đi khỏi nguồn sáng, và nó phải TỐI HƠN mặt trước thì cả
    //    bức mới đọc ra một khối có bề dày. Đây cũng là quy ước sẵn có của game (xem chỗ vẽ
    //    dốc mặt sau trong prerenderWorld).
    c.drawImage(RB, 1 * O, r * O + lech, O, O, x, y, T, T);
    c.fillStyle = 'rgba(8,6,4,0.40)';
    c.fillRect(x, y, T, T);
    // 2. MẶT TRƯỚC, nửa dưới ô. Lấy đúng nửa DƯỚI của mặt tường nguồn — chỗ có dải trang trí
    //    và chân tường — chứ không thu cả mặt tường vào nửa ô: thu là méo, cắt là nét.
    if (mat){
      const nua = O >> 1;
      c.drawImage(RB, 1 * O, (r + 2) * O - nua, O, nua, x, y + T / 2, T, T / 2);
      // Một vạch tối ở chỗ mặt trên gặp mặt trước. Không có nó thì hai mảng cùng nước sơn
      // dính vào nhau và cái gờ biến mất — mà chính cái gờ là thứ nói 'đây là một khối'.
      c.fillStyle = 'rgba(0,0,0,0.42)';
      c.fillRect(x, y + T / 2 - 0.5, T, 1);
    }
    return true;
  }

  // ---------------------------------------------------------------- ĐỒ ĐẠC THEO DÃY
  //
  // Mẫu phòng viết đồ thành DÃY — ngang ('TTT') lẫn dọc. Nếu mỗi ô tự bốc một miếng thì cái ghế
  // sofa rộng ba ô không bao giờ dùng được, và một dãy bảy ô kệ ra bảy cái kệ giống hệt nhau
  // dính vào nhau.
  //
  // Nên chỗ này CẮT CẢ DÃY một lần: đi từ đầu dãy, mỗi bước bốc một miếng vừa chỗ còn lại, cộng
  // bề rộng của nó rồi bước tiếp. Ô nào rơi đúng chỗ bắt đầu một miếng thì vẽ miếng đó; ô nào
  // nằm giữa một miếng đã vẽ thì không vẽ gì — nó đã bị phủ rồi.
  //
  // Phép cắt ấy được TÍNH LẠI TỪ ĐẦU DÃY cho từng ô, chứ không nhớ trạng thái giữa hai lần gọi.
  // Đắt hơn (một dãy dài 19 ô thì tính 19 lần) nhưng đổi lại paintProp() vẫn là một hàm thuần:
  // vẽ lại một ô bất kỳ, ở bất kỳ thứ tự nào, vẫn ra đúng cái đã có. Vẽ nền chỉ chạy một lần
  // mỗi màn, nên cái giá ấy là vài trăm phép tính cho cả căn nhà.
  function veDo(c, x, y, ki, ch, gx, gy, T, dauX, dai, dauY, cao){
    const k = KIEU[ki];
    if (!k || !xong(IT)) return false;
    const ds0 = k.do[ch];
    if (!ds0 || !ds0.length) return false;

    // ---- CẮT DÃY DỌC TRƯỚC
    //
    // ROOT-CAUSE của lỗi 'đồ chồng lên nhau thành một vệt': bản trước chỉ cắt theo HÀNG NGANG.
    // Mẫu phòng có cả cột dọc ('S' nằm chồng nhau bốn hàng), và mỗi ô trong cột ấy đều tự vẽ
    // một miếng cao hai ô — mà miếng cao hai ô thì tràn LÊN TRÊN, đè đúng vào ô vừa vẽ xong.
    // Bốn ô liên tiếp là bốn cái tủ cắt ngang nhau. Thấy rõ ở phòng khách, thư phòng, nhà kho.
    //
    // Cắt từ ĐÁY dãy lên: đáy là ô neo, rồi cứ mỗi `buoc` ô lại một ô neo. Ô không phải neo thì
    // đã nằm trong bụng miếng phía dưới, không vẽ gì. Neo từ đáy chứ không từ đỉnh vì miếng đồ
    // đặt đáy ở đáy ô — phần thừa của một dãy lẻ phải rơi lên ĐỈNH, chỗ nó tràn ra ngoài dãy và
    // dựa vào bức tường phía trên, đúng như một cái tủ dựa tường.
    const buoc = ds0.reduce((m, p) => Math.max(m, p[3]), 1);
    const duoi = dauY + cao - 1;
    if (buoc > 1 && ((duoi - gy) % buoc)) return true;
    // Còn đủ chỗ cho một miếng cao trọn vẹn thì BẮT BUỘC lấy miếng cao. Lấy miếng thấp ở đây là
    // để hở đúng cái ô phía trên vừa bị tuyên bố 'đã có người phủ'.
    const conDoc = gy - dauY + 1;
    const ds = (buoc > 1 && conDoc >= buoc) ? ds0.filter(m => m[3] === buoc) : ds0;
    if (!ds.length) return false;

    // ---- RỒI CẮT DÃY NGANG
    let i = dauX;
    while (i <= gx){
      const conLai = dauX + dai - i;
      // Bốc trong số những miếng KHÔNG rộng quá chỗ còn lại. Không lọc thì cái sofa ba ô rơi
      // vào hai ô cuối dãy và thò một phần ba sang ô của bức tường bên cạnh.
      let vua = ds;
      if (conLai < 3){
        vua = ds.filter(m => m[2] <= conLai);
        if (!vua.length) vua = ds.filter(m => m[2] === 1);
        if (!vua.length) return false;
      }
      const m = vua[bam(i, gy, ki + 29) % vua.length];
      if (i === gx){
        // Đáy miếng đặt ở đáy ô; cao 2 thì tràn một ô lên trên.
        c.drawImage(IT, m[0] * O, m[1] * O, m[2] * O, m[3] * O,
                    x, y - (m[3] - 1) * T, m[2] * T, m[3] * T);
        return true;
      }
      i += m[2];
    }
    return true;                                  // ô này nằm trong bụng một miếng đã vẽ
  }

  root.REPO_PHONG = {
    KIEU, veSan, veTuong, veDo,
    so: KIEU.length,
    ten: i => (KIEU[i] && KIEU[i].ten) || '',
    ma:  i => (KIEU[i] && KIEU[i].ma) || '',
    // Bảng có sẵn hay chưa. game.js hỏi câu này để biết nên vẽ bằng tile hay rơi về nước sơn
    // vẽ bằng mã — và nó hỏi ở MỖI Ô chứ không hỏi một lần, vì ảnh nạp xong lúc nào không biết.
    sanSang: () => xong(RB) && xong(IT)
  };
})(window);
