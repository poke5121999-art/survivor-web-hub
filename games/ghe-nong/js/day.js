/* day.js — dạy chơi.

   Bốn hệ thống chồng lên nhau (nuôi quân, cấm chọn, mô phỏng, gacha) mà ném hết một lúc là
   người ta bỏ game. Ở đây mỗi màn chỉ nói ĐÚNG MỘT LẦN, ĐÚNG LÚC người chơi vừa mở nó ra,
   và không quá năm dòng (DESIGN.md §10.1).

   Cờ "đã xem" nằm trong bản lưu, nên đọc rồi là thôi.
*/
(function (G) {
  'use strict';

  var BAI = {
    ca: {
      dau: 'Một ngày ở trung tâm',
      html:
        '<b>Mỗi lượt chọn đúng một việc.</b> Năm ô dưới là năm giáo án: ' +
        '<b>CƠ</b> thao tác · <b>BỀN</b> thể lực · <b>LỰC</b> sức đánh · <b>LÌ</b> bản lĩnh · <b>NÃO</b> tư duy.' +
        '<br><br>Chạm một giáo án để <b>xem trước</b> ăn được bao nhiêu và tỉ lệ hỏng bao nhiêu. ' +
        'Chạm lần nữa là tập thật.' +
        '<br><br>Thể lực dưới 50 thì bắt đầu có nguy cơ hỏng buổi tập — số phần trăm luôn hiện, không giấu.' +
        '<br><br>Tuyển thủ đứng ở giáo án nào thì thân thiết với người đó tăng. Đủ <b>80</b> là mở ' +
        '<b>cầu vồng</b>: tập đúng sân sở trường của họ sẽ ăn gấp rưỡi tới gấp đôi.'
    },
    draft: {
      dau: 'Cấm và chọn',
      html:
        'Bốn lượt cấm, rồi mười lượt chọn theo từng vị trí.' +
        '<br><br><b>Vị trí của tuyển thủ là khoá cứng</b> — không ai đá thay ai. Nên mỗi lượt chọn ' +
        'là chọn tướng <i>cho một người cụ thể</i>.' +
        '<br><br>Chạm một tướng để xem chỉ số, ba kỹ năng, và quan trọng nhất: <b>mức thông thạo</b> ' +
        'của chính người sẽ cầm nó — N &lt; R &lt; SR &lt; SSR &lt; <b>UR</b>. Thông thạo càng cao, ' +
        'chỉ số tướng càng mạnh (UR ×1.22, N ×0.82).' +
        '<br><br>Vì thế <b>cấm là cấm theo người</b>: cấm đúng con tủ của đối thủ mới đáng.'
    },
    tran: {
      dau: 'Bạn không cầm chuột',
      html:
        'Trận tự đánh. Việc của huấn luyện viên đã xong ở khâu cấm chọn và chiến thuật — giờ chỉ xem.' +
        '<br><br>Chỉ số bạn nuôi <b>không cộng thẳng vào sát thương</b>, mà đổi cách người ta ra quyết định: ' +
        'NÃO thấp thì đếm quân sai và đi mục tiêu sai giờ, LÌ thấp thì thua vài mạng là co rúm, ' +
        'CƠ thấp thì hay ăn chiêu.' +
        '<br><br>Đồ cũng không ai chọn hộ: mỗi người tự nhìn đội địch đánh bằng gì rồi mua.' +
        '<br><br>Dưới đáy có tốc độ <b>0.5 → ×3</b>, và nút <b>xem kết quả luôn</b> nếu bạn vội.'
    },
    gacha: {
      dau: 'Tuyển mộ',
      html:
        'Hai banner riêng: <b>huấn luyện viên</b> (thứ được nuôi) và <b>tuyển thủ</b> (thứ ra sân).' +
        '<br><br>Tỉ lệ: bậc cao <b>3%</b> · bậc giữa <b>18%</b> · bậc thấp <b>79%</b>. Quay 10 chắc chắn ' +
        'có ít nhất một cái bậc giữa trở lên.' +
        '<br><br>Mỗi lần quay được <b>1 vé</b>. Đủ <b>200 vé</b> thì tự chọn thẳng một cái bậc cao. ' +
        'Vé không mang sang banner khác.' +
        '<br><br>Quay trúng người đã có thì <b>không mất</b>: bản trùng thành một <b>mảnh ◆</b> nằm trong kho. ' +
        'Mang mảnh sang màn <b>Nuôi thẻ</b> để <b>mở trần</b> — bốn bậc, mỗi bậc ăn một mảnh và nới trần cấp thêm 5. ' +
        'Bậc thứ tư mở luôn hiệu ứng ẩn.'
    },
    ketthua: {
      dau: 'Thua một giải là hết mùa',
      html:
        'Giải nào cũng có mục tiêu tối thiểu. Không đạt là mùa dừng tại đó — vẫn được kết toán và ' +
        'vẫn để lại hồ sơ cho đời sau, nhưng hạng thấp.' +
        '<br><br>Mỗi mùa có <b>một vé cứu</b>: thua một lần thì được đá lại giải đó từ đầu.'
    }
  };

  /** hiện bài dạy nếu chưa xem lần nào; trả về Promise */
  G.day = function (khoa) {
    if (!G.S) return Promise.resolve();
    G.S.day = G.S.day || {};
    if (G.S.day[khoa]) return Promise.resolve();
    var b = BAI[khoa];
    if (!b) return Promise.resolve();
    G.S.day[khoa] = 1;
    G.luu();
    return G.hop({ dau: b.dau, html: b.html, nut: [{ chu: 'Hiểu rồi', chinh: true }] });
  };

  /** đọc lại bất cứ bài nào (từ Sổ tay) */
  G.dayLai = function (khoa) {
    var b = BAI[khoa];
    if (!b) return Promise.resolve();
    return G.hop({ dau: b.dau, html: b.html, nut: [{ chu: 'Đóng', chinh: true }] });
  };

  G.DAY_BAI = BAI;

})(window);
