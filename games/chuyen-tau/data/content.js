/*
 * CHUYẾN TÀU CUỐI — bảng nội dung.
 *
 * Mọi CON SỐ cân bằng nằm ở đây, không nằm trong bộ máy. Đổi một con số ở đây là đổi
 * game; đổi một dòng trong game.js là đổi luật. Hai việc khác nhau, để hai chỗ khác nhau.
 *
 * NGUỒN CỦA CÁC CON SỐ: game này dựng lại Dead Rails (RCM Games, Roblox 2025) ở dạng
 * 2D nhìn từ trên xuống. Chỗ nào lấy số của bản gốc thì ghi [DR]; chỗ nào lấy từ một
 * game khác thì ghi tên game; chỗ nào tự nghĩ ra thì ghi [ĐỀ XUẤT]. Ghi chép đầy đủ
 * kèm URL: RESEARCH.md.
 */
(function (root) {
  'use strict';

  const CT = root.CT = root.CT || {};

  // ---------------------------------------------------------------------------
  // NHỊP MỘT VÁN
  // ---------------------------------------------------------------------------
  // [DR] Bản gốc: 80 km, 8 pháo đài, một ván 30-45 phút. Chính tác giả đã phải làm
  // chế độ Bite-Sized nén còn 40 km / 15-25 phút — tức 80 km là quá dài kể cả với
  // người chơi PC. Chuẩn phiên chơi của roguelite di động là 5-15 phút.
  //
  // Nên ở đây KHÔNG đo bằng km, đo bằng CHẶNG. Một chặng = một lần tàu chạy cộng một
  // lần dừng ga. Số km vẫn hiện lên đồng hồ vì nó là thứ người chơi khoe với nhau,
  // nhưng nó là HỆ QUẢ của chặng chứ không phải thước đo.
  //
  // WHY 3-4-5 rồi lặp lại từ 3: mượn nguyên nhịp của Biệt Đội. Người chơi đo được sức
  // mình bằng cùng một cái thước qua từng vòng. Vòng sau KHÔNG dài hơn, chỉ nặng hơn —
  // map thứ chín mà dài 25 phút là mất đúng nhóm người chơi điện thoại mình đang nhắm.
  CT.LEG = {
    // runSec 10, không phải 40.
    //
    // Bản đầu để 40 giây với lý do "pha phòng thủ trên tàu". Lý do đó chỉ đúng vào BAN
    // ĐÊM — mà ban ngày thì luật cốt lõi là KHÔNG sinh một con quái nào, nên một cú
    // chạy ban ngày 40 giây là 40 giây đứng nhìn cát trôi qua, không có một việc gì để
    // làm. Đó không phải là nhịp nghỉ, đó là thời gian chết.
    //
    // Cái giá của việc rút xuống 10: đêm gần như không còn rơi vào lúc tàu đang chạy
    // nữa, tức là "phòng thủ trên nóc toa" sẽ biến mất. Nên vòng ngày-đêm bên dưới
    // được thu nhỏ theo cho vừa MỘT chặng (74 giây so với chặng 72 giây) — mỗi chặng
    // đi qua trọn một ngày và một đêm, và cái đêm đó vắt qua cả lúc chạy lẫn lúc đỗ.
    // Không thu nhỏ vòng thì trời sẽ sáng suốt cả ván ngắn.
    runSec: 10,
    stationSec: 62,      // pha dừng ga: 62 giây đếm ngược để xuống lục soát
    warnAt: [30, 10, 5, 4, 3, 2, 1],  // mốc đọc còi báo lúc ĐỖ, dày dần

    // Người chơi KHÔNG có nút dừng tàu — tàu tự đỗ. Nên phải báo trước, nếu không thì
    // trải nghiệm là "đang bắn thì tàu tự nhiên đứng khựng".
    //   seeAheadSec: còn mấy giây thì tháp nước và biển tên ga hiện ra ở mép phải.
    //                7 giây × 168 đơn vị/giây ≈ 1.180 đơn vị — cái mốc lớn dần lên
    //                trong khung chứ không bật ra.
    //   arriveAt:    mốc báo bằng chữ. 5 giây đủ để chạy hết chiều dài đoàn tàu.
    seeAheadSec: 7, arriveAt: [5],

    boardGrace: 1.4      // giây ân xá sau khi hết giờ, tính từ lúc chạm bậc lên tàu
    // WHY boardGrace: Lethal Company chỉ tính "mất tích" khi CỬA ĐÓNG HẲN. Một cú nước
    // rút tuyệt vọng phải có khả năng thành công, nếu không người chơi thấy bất công
    // chứ không thấy căng.
  };

  // ---------------------------------------------------------------------------
  // NGÀY / ĐÊM — nhịp tim của cả game
  // ---------------------------------------------------------------------------
  // [DR] 1 ngày = 480 giây thật; BAN NGÀY KHÔNG CÓ MỘT CON QUÁI NÀO SPAWN (320s), ban
  // đêm mới đổ ra (160s), báo trước bằng tiếng sói tru.
  //
  // WHY đây là luật quan trọng nhất chép từ bản gốc: ban ngày áp lực do LÒNG THAM của
  // người chơi tự tạo ("dừng thêm một nhà nữa?"), ban đêm áp lực do hệ thống áp đặt.
  // Không có một giây nào là chờ suông — và đó chính là câu trả lời cho "ngồi tàu ngắn
  // nếu không cần".
  //
  // Một chặng ~102 giây nên chu kỳ phải nén, giữ nguyên tỉ lệ 2:1.
  // Tổng vòng = 40 + 4 + 26 + 4 = 74 giây, so với một chặng 10 + 62 = 72 giây. Cố ý
  // gần bằng nhau chứ không bằng chằn chặn: lệch 2 giây thì mỗi chặng trời tối ở một
  // chỗ khác nhau một chút, nên không ván nào lặp lại y hệt ván trước.
  //
  // Đêm chiếm 26/74 = 35% thời gian, so với 30% của bản 113 giây trước — nhỉnh hơn một
  // chút vì chặng đã ngắn đi, tổng thời gian phơi mặt ra trước quái vẫn giảm.
  CT.DAY = {
    daySec: 40, nightSec: 26,
    duskSec: 4,            // hoàng hôn: chuyển màu, và tiếng sói tru rơi vào đây
    dawnSec: 4
  };

  // [DR] Bốn loại đêm, nhận ra bằng MÀU TRỜI chứ không bằng chữ. Số quái tăng theo đêm
  // thứ mấy trong ván (đêm 1 ít nhất, trần ở đêm 5).
  // Đêm đầu tiên của mọi ván LUÔN là đêm mây — người chơi mới không bao giờ gặp sói hay
  // bóng ở lần đầu tiên trời tối.
  CT.NIGHTS = [
    { id: 'may',  name: 'Đêm Mây',   sky: '#12151c', amb: 0.30, tint: '#2a3550',
      foes: ['bo', 'chay'],  count: [6, 12, 18, 24, 30],
      hint: 'Trời xám, trăng bình thường.' },
    { id: 'lam',  name: 'Đêm Sói',   sky: '#0d1626', amb: 0.38, tint: '#2b4a7a',
      foes: ['soi', 'thu'],  count: [2, 4, 6, 8, 10],
      hint: 'Trăng ánh xanh, quang đãng — sáng hơn mọi đêm khác, và đó không phải điều tốt.' },
    { id: 'mau',  name: 'Đêm Máu',   sky: '#1a0a0c', amb: 0.20, tint: '#5a1a20',
      foes: ['bong'],        count: [3, 6, 9, 12, 15],
      hint: 'Trăng đỏ. Tối hơn bình thường.' },
    { id: 'bao',  name: 'Đêm Bão',   sky: '#0b1016', amb: 0.26, tint: '#3a4a5e',
      foes: [],              count: [0, 0, 0, 0, 0], storm: true,
      hint: 'Không một con quái nào. Nguy hiểm rơi thẳng từ trên trời xuống.' }
  ];
  // [DR] sét trong đêm bão gây 500 sát thương — giết bất kể máu và giáp. Cột thu lôi
  // trên tàu hút nó. WHY giữ: đây là loại đêm duy nhất mà đứng yên trong toa là ĐÚNG,
  // nên nó phá thói quen vừa hình thành của người chơi.
  CT.STORM = { boltEvery: [4, 9], boltDmg: 500, warnSec: 1.1, rodRange: 220 };

  // ---------------------------------------------------------------------------
  // ÁNH SÁNG — vẽ bằng một canvas phụ rồi NHÂN vào cảnh, cộng một lớp tự phát sáng.
  // ---------------------------------------------------------------------------
  // Ba lớp, và phải đúng ba lớp:
  //   1. lớp TỐI  — một hình chữ nhật màu trời phủ kín, khoét lỗ bằng các vũng sáng.
  //                 Ghép vào cảnh bằng 'multiply'. Đây là thứ làm trời tối.
  //   2. lớp SÁNG — thứ TỰ PHÁT SÁNG (lửa, chớp nòng, sét). Ghép bằng 'lighter', vẽ
  //                 SAU khi đã nhân lớp tối, nếu không thì đèn cũng bị chính nó làm tối.
  //   3. VIGNETTE — tối bốn góc, luôn có, kể cả ban ngày, chỉ đậm nhạt khác nhau.
  //
  // WHY vũng sáng dưới chân người chơi phải SÁNG GẦN HẾT ở tâm rồi mới tụt: lớp tối
  // được nhân lên CẢ NHÂN VẬT, nên nếu vũng sáng dịu quá thì bộ hình vẽ tay ra một cục
  // xám. Cảnh vẫn tối như cũ; thứ đổi là người chơi nhìn rõ chính mình.
  CT.LIGHT = {
    // Đèn pha đầu máy: một hình nón dài quét về phía trước. Đây là nguồn sáng mạnh nhất
    // và là lý do người chơi vẫn thấy đường ray trong Đêm Máu.
    head:   { r: 460, half: 0.42, warm: '#ffe9b8', power: 1.0, flickHz: 0 },
    // Đèn lồng treo trên mỗi toa: vũng tròn nhỏ, ấm, đứng yên.
    lamp:   { r: 130, warm: '#ffd79a', power: 0.85, core: 0.55, flickHz: 1.6, flickAmp: 0.05 },
    // Đèn người chơi cầm: vũng tròn + một nón hẹp theo hướng nhìn.
    hand:   { r: 118, half: 0.55, coneR: 250, warm: '#ffeccb', power: 0.95, core: 0.60 },
    // Lửa lò: nguồn ấm nhất, và là nguồn DUY NHẤT nhấp nháy thấy được.
    // Hai thành phần, và phải hai:
    //   9,9 Hz biên ±0.035 — đúng tần số dao động của một ngọn lửa thật đo bằng
    //     photodiode, nhưng biên độ dưới ngưỡng 10% nên KHÔNG bị tính là một "flash".
    //   2,4 Hz biên ±0.06  — nhịp bùng than, đủ lớn để thấy, và 2,4 < 3 lần/giây nên
    //     vẫn nằm trong giới hạn của WCAG 2.3.1.
    // Cộng lại ra dải sáng ~0,19 đỉnh-đỉnh: sinh động mà không vi phạm cả hai điều kiện.
    fire:   { r: 165, warm: '#ff9a3c', power: 1.0, base: 0.55,
              hzFast: 9.9, ampFast: 0.035, hzSlow: 2.4, ampSlow: 0.06, maxR: 83 },
    // Chớp nòng. DOOM không phủ trắng cả màn — nó nâng độ sáng cả cảnh lên 1-2 nấc
    // trong thang 16, tức 6-12%, trong đúng 200ms. Làm y hệt.
    muzzle: { r: 96, warm: '#fff3cf', power: 0.9, ms: 90, ambPlus: 0.09 },
    // Cửa sổ nhà ở ga: vàng ấm, đứng yên, và là thứ nói cho người chơi biết nhà nào
    // còn người ở — kể cả khi "người" là cách nói giảm.
    win:    { r: 96, warm: '#ffcf7a', power: 0.7 },
    // Sét: trắng xanh, một khung hình, sáng cả màn.
    bolt:   { r: 520, warm: '#dff0ff', power: 1.0, ms: 120 },
    vignette: { day: 0.16, night: 0.42 }
  };

  // ---------------------------------------------------------------------------
  // TÀU
  // ---------------------------------------------------------------------------
  // [DR] Bình 2400 đơn vị, tiêu 1 đơn vị mỗi 0,267 giây KHI TÀU ĐANG CHẠY, không phụ
  // thuộc tốc độ. Đây là luật hay nhất của bản gốc và phải giữ nguyên: đi chậm là ĐỐT
  // TIỀN. Nó biến "dừng lại lục soát" thành một quyết định có giá thật, chứ không phải
  // một lựa chọn miễn phí.
  CT.FUEL = {
    tank: 2400,
    burnPerSec: 3.75,        // = 1 / 0.267
    marks: 50,               // [DR] đồng hồ 50 vạch, mỗi vạch 48 đơn vị

    // [ĐO TRONG REPO] Hai con số dưới đây là thứ quyết định cái lò có tồn tại hay không.
    // Một chặng chạy 40 giây × 3,75 = 150 nhiên liệu. Một ga 62 giây × 0,35 × 3,75 = 81.
    // Chuyến ngắn nhất (3 chặng) tốn 612; chuyến dài nhất (5 chặng) tốn 1074.
    //
    // Bản đầu cho khởi đầu 0,72 bình = 1728, và hậu quả là KHÔNG chuyến nào cần tiếp
    // than lấy một lần — cái lò, cái toa than, cái xẻng, cái xác đốt được đều thành đồ
    // trang trí.
    //
    // Cân lại lần hai sau khi chặng rút từ 40 giây xuống 10: một chặng giờ chỉ tốn
    // 10 × 3,75 = 37,5 lúc chạy, cộng 62 × 0,35 × 3,75 = 81 lúc đỗ, tổng 119. Chuyến
    // ngắn nhất (3 chặng) tốn 357; chuyến dài nhất (5 chặng) tốn 595. Khởi đầu 0,19
    // bình = 456 giữ nguyên ý đồ cũ: chuyến ngắn vừa đủ đi một mạch, chuyến dài bắt
    // buộc phải tiếp than ít nhất một lần.
    start: 0.19,

    // [DR] Bản gốc đốt cả lúc dừng. Đó chính là thứ khiến "nán lại lục thêm một căn nhà
    // nữa" có giá phải trả. Cầm chừng 0,35 vì lò đứng chỉ giữ hơi, không kéo tải.
    idleMul: 0.35
  };

  // [DR] bảng giá trị nhiên liệu. Xác chết đốt được là lý do giết quái không bao giờ
  // công cốc — và là đường lui khi hết than giữa sa mạc.
  CT.BURNABLE = {
    than:      600,   // 1/4 bình
    thung:     300,
    ghe:       250,
    day:       200,
    sach:      150,
    banh:      150,
    xac:       100,   // xác bất kỳ
    bao:        50    // tờ báo
  };

  // ---------------------------------------------------------------------------
  // TOA TÀU — mua bằng VÀNG và VẬT LIỆU nhặt trong ván, KHÔNG gacha.
  // ---------------------------------------------------------------------------
  // WHY không gacha: đã có hai băng quay (xác + trang bị). Băng thứ ba xé ngọc làm ba
  // mà màn chọn map chỉ hiện MỘT con số lực chiến — người chơi không đọc được nên đổ
  // ngọc vào đâu. Toa tàu là chỗ để người chơi F2P có một trục tiến bộ chắc chắn: cày
  // là mạnh lên, không phụ thuộc may rủi.
  //
  // Và toa tàu là tiến bộ dạng MỞ THÊM LỰA CHỌN, không phải TĂNG SỐ. Toa pháo, toa kho,
  // toa y tế đổi CÁCH chơi một ván; +5% máu thì không.
  CT.CAR_SLOTS = 5;          // đoàn tàu tối đa: đầu máy + 5 ô toa
  CT.CARS = [
    { id: 'tran',  name: 'Toa Trần',   gold: 0,     scrap: 0,
      icon: '🚋', desc: 'Sàn gỗ trống. Không che được gì, nhưng nhẹ và nhìn thấy cả hai bên.' },
    { id: 'giap',  name: 'Toa Bọc Thép', gold: 9000, scrap: 40,
      icon: '🛡️', desc: 'Vách thép hai bên. Quái phải leo qua nóc mới vào được.',
      wall: 2 },
    { id: 'phao',  name: 'Toa Pháo',   gold: 16000, scrap: 65,
      icon: '💥', desc: 'Một khẩu súng máy tự bắn con gần nhất. Ăn đạn nặng từ kho.',
      turret: { dps: 42, range: 220, ammoPerSec: 1.6 } },
    { id: 'kho',   name: 'Toa Kho',    gold: 12000, scrap: 45,
      icon: '📦', desc: 'Giá đỡ và móc treo. Bao tải mang thêm 4 ô.',
      bagPlus: 4 },
    { id: 'y',     name: 'Toa Y Tế',   gold: 14000, scrap: 55,
      icon: '✚', desc: 'Băng ca và tủ thuốc. Đứng trong toa thì hồi máu chậm.',
      regen: 2.4 },
    { id: 'lo',    name: 'Toa Lò Phụ', gold: 18000, scrap: 70,
      icon: '🔥', desc: 'Lò đốt thứ hai. Tàu chạy nhanh hơn, chặng ngắn lại.',
      speedMul: 1.22 }
  ];
  CT.CAR_BY_ID = {};
  CT.CARS.forEach(c => { CT.CAR_BY_ID[c.id] = c; });

  // Nâng cấp một toa đã lắp: mỗi cấp cộng thêm, trần 5.
  CT.CAR_LV_MAX = 5;
  CT.carUpCost = lv => ({ gold: Math.round(4000 * Math.pow(1.85, lv)),
                          scrap: Math.round(18 * Math.pow(1.55, lv)) });

  // ---------------------------------------------------------------------------
  // VŨ KHÍ. [DR] giữ nguyên hình dáng cân bằng của bản gốc: súng lục rẻ và yếu, súng
  // trường đắt và mạnh, súng hoa cải sát mặt.
  // ---------------------------------------------------------------------------
  CT.AMMO = [
    { id: 'nhe',  name: 'Đạn ngắn', icon: '🔸', box: 24, gold: 240 },
    { id: 'dai',  name: 'Đạn dài',  icon: '🔹', box: 24, gold: 300 },
    { id: 'hoa',  name: 'Đạn hoa cải', icon: '🔶', box: 24, gold: 300 },
    { id: 'nang', name: 'Đạn nặng', icon: '⬛', box: 100, gold: 520 }   // cho toa pháo
  ];
  CT.AMMO_BY_ID = {};
  CT.AMMO.forEach(a => { CT.AMMO_BY_ID[a.id] = a; });

  // dmg = sát thương một viên. rof = giây giữa hai phát. spread = độ tản (radian).
  // pellets = số viên một phát (súng hoa cải).
  CT.GUNS = [
    { id: 'luc',   name: 'Súng Lục',      ammo: 'nhe', dmg: 30,  rof: 0.42, mag: 6,  reload: 1.5,
      spread: 0.035, range: 300, gold: 700,  icon: '🔫',
      desc: 'Sáu viên, nạp nhanh. Không giết được gì nhanh, nhưng không bao giờ hết đạn.' },
    { id: 'lucdb', name: 'Lục Hải Quân',  ammo: 'nhe', dmg: 50,  rof: 0.5,  mag: 6,  reload: 2.1,
      spread: 0.035, range: 320, gold: 1400, icon: '🔫',
      desc: 'Nặng tay hơn, nạp chậm hơn. Đổi nhịp lấy sức.' },
    { id: 'hoacai',name: 'Súng Hoa Cải',  ammo: 'hoa', dmg: 17,  rof: 0.85, mag: 6,  reload: 2.6,
      spread: 0.20, range: 150, pellets: 6, gold: 1600, icon: '💥',
      desc: 'Sáu viên chì một phát. Sát mặt thì không con nào đứng nổi; xa ba bước thì vô dụng.' },
    { id: 'cuaduoi', name: 'Cưa Nòng',    ammo: 'hoa', dmg: 20,  rof: 0.22, mag: 2,  reload: 2.3,
      spread: 0.36, range: 110, pellets: 5, gold: 2600, icon: '💥',
      desc: 'Hai phát liên tiếp gần như tức thì, rồi hai giây rưỡi đứng không.' },
    { id: 'truong', name: 'Súng Trường',  ammo: 'dai', dmg: 70,  rof: 0.55, mag: 6,  reload: 2.4,
      spread: 0.018, range: 460, gold: 2400, icon: '🎯',
      desc: 'Bắn xa, đi thẳng. Thứ để dọn đường trước khi tàu tới.' },
    { id: 'chotxoay', name: 'Chốt Xoay',  ammo: 'dai', dmg: 100, rof: 1.05, mag: 5,  reload: 3.0,
      spread: 0.006, range: 560, gold: 4200, icon: '🎯',
      desc: 'Một phát một mạng, rồi kéo chốt. Người bắn nó phải biết mình bắn ai.' }
  ];
  CT.GUN_BY_ID = {};
  CT.GUNS.forEach(g => { CT.GUN_BY_ID[g.id] = g; });

  // Đánh gần. [DR] cận chiến KHÔNG đánh thức quái đang ngủ — đó là cả một lớp chơi lén
  // miễn phí, và là lý do người chơi mới sống sót được ván đầu.
  CT.MELEE = { dmg: 34, charged: 68, chargeSec: 0.6, reach: 46, arc: 1.5, cd: 0.32 };

  // ---------------------------------------------------------------------------
  // KẺ ĐỊCH
  // ---------------------------------------------------------------------------
  // [DR] Quái spawn ở trạng thái ĐANG NGỦ, thức dậy theo bán kính tiếng động tăng dần:
  // đến gần < kéo đồ < chạy nước rút < tàu chạy qua < BẮN SÚNG < nổ.
  // Giữ nguyên luật này: nó biến mỗi phát súng thành một quyết định.
  CT.NOISE = { chan: 34, keo: 60, sprint: 96, tau: 150, sung: 300, no: 460 };

  CT.FOES = [
    { id: 'bo',     name: 'Kẻ Lê Bước',  hp: 100, dmg: 8,  spd: 46,  sight: 150, r: 11,
      art: 'zombie', bounty: 0, corpse: true,
      wiki: 'Đi chậm, không nghĩ gì. Nguy hiểm nằm ở chỗ nó không bao giờ dừng.' },
    { id: 'chay',   name: 'Kẻ Chạy',     hp: 100, dmg: 8,  spd: 88,  sight: 190, r: 11,
      art: 'zombie', bounty: 0, corpse: true, weave: 0.9,
      wiki: 'Lảo đảo trái phải lúc đuổi. Chậm hơn đường thẳng, nhưng khó bắn trúng đầu.' },
    { id: 'nomin',  name: 'Kẻ Ôm Mìn',   hp: 60,  dmg: 0,  spd: 62,  sight: 200, r: 10,
      art: 'banger', bounty: 0, corpse: false, fuse: 2.4, blast: { dmg: 70, r: 82 },
      wiki: 'Thấy bạn là châm ngòi rồi chạy tới. Ngòi vẫn cháy kể cả khi nó đã chết.' },
    { id: 'cao',    name: 'Cao Bồi',     hp: 100, dmg: 22, spd: 40,  sight: 340, r: 11,
      art: 'gunner', bounty: 350, corpse: true, gun: { rof: 1.15, range: 300, spread: 0.16 },
      wiki: 'Đứng xa bắn tới. Không bao giờ đánh tay. Xác nó bán được ở đồn cảnh sát.' },
    { id: 'soi',    name: 'Sói Hoang',   hp: 90,  dmg: 14, spd: 104, sight: 220, r: 12,
      art: 'rook', bounty: 0, corpse: true, pack: 4,
      wiki: 'Đi đàn ba tới bảy con. Nhỏ và nhanh, khó bắn từ xa.' },
    { id: 'thu',    name: 'Con Húc',     hp: 320, dmg: 30, spd: 58,  sight: 260, r: 18, scale: 1.5,
      art: 'rook', bounty: 0, corpse: true, dash: { wind: 1.1, spd: 300, dur: 0.85 },
      wiki: 'Không đuổi. Nó ngắm một đường thẳng, gồng ba nhịp, rồi lao. Bước sang bên là xong.' },
    { id: 'bong',   name: 'Cái Bóng',    hp: 150, dmg: 16, spd: 70,  sight: 400, r: 12,
      art: 'mirror', bounty: 0, corpse: false, blink: 3.2, night: true,
      wiki: 'Chỉ ra ban đêm. Không đi tới bạn — nó xuất hiện ở chỗ bạn SẮP tới.' },
    { id: 'trum',   name: 'Trùm Toa Cuối', hp: 2600, dmg: 40, spd: 62, sight: 9999, r: 26, scale: 2.1,
      art: 'gunner', bounty: 3000, corpse: true, boss: true,
      gun: { rof: 0.55, range: 380, spread: 0.10 }, dash: { wind: 1.3, spd: 340, dur: 1.0 },
      wiki: 'Chờ ở ga cuối. Vừa bắn vừa lao, và không bao giờ mất dấu bạn.' }
  ];
  CT.FOE_BY_ID = {};
  CT.FOES.forEach(f => { CT.FOE_BY_ID[f.id] = f; });

  // Bộ quái theo vòng. WHY viết tay ba vòng đầu: dạy một cơ chế một lúc. Vòng 1 chỉ có
  // thứ đi thẳng; vòng 2 thêm thứ bắn từ xa; vòng 3 mới có thứ lao và thứ chớp.
  CT.ROSTER = [
    ['bo', 'chay'],
    ['bo', 'chay', 'nomin'],
    ['bo', 'chay', 'nomin', 'cao'],
    ['bo', 'chay', 'cao', 'soi'],
    ['chay', 'cao', 'soi', 'nomin'],
    ['chay', 'cao', 'soi', 'thu'],
    ['chay', 'cao', 'thu', 'bong'],
    ['chay', 'soi', 'thu', 'bong', 'nomin'],
    ['chay', 'cao', 'soi', 'thu', 'bong', 'nomin']
  ];

  // ---------------------------------------------------------------------------
  // ĐỒ NHẶT ĐƯỢC
  // ---------------------------------------------------------------------------
  // Cỡ quyết định ô chiếm trong bao tải; chất liệu quyết định giá.
  CT.SIZES = [
    { id: 'nho', name: 'nhỏ', cells: 1, r: 8,  mul: 1.0 },
    { id: 'vua', name: 'vừa', cells: 1, r: 11, mul: 2.7 },
    { id: 'to',  name: 'to',  cells: 2, r: 15, mul: 5.6 }
  ];
  CT.MATS = [
    // CHÁY ĐƯỢC. Ba chất liệu đầu vừa bán được vừa đốt được, nên mỗi món nhặt lên là một
    // câu hỏi nhỏ: bán lấy tiền, mang về lấy vàng, hay ném vào lò lấy thêm mười phút sống?
    { id: 'giay', name: 'giấy',      mul: 0.40, ramp: ['#4a4232', '#d8cba8'] },
    { id: 'vai',  name: 'vải',       mul: 0.55, ramp: ['#3a2430', '#c08a9a'] },
    { id: 'go',   name: 'gỗ',       mul: 1.0, ramp: ['#3a2a18', '#a8794a'] },
    { id: 'thuy', name: 'thuỷ tinh',mul: 1.6, ramp: ['#22403f', '#7fc4c0'] },
    { id: 'dong', name: 'đồng',     mul: 2.1, ramp: ['#4a2c10', '#d09a4a'] },
    { id: 'bac',  name: 'bạc',      mul: 3.2, ramp: ['#3d4348', '#dfe6ec'] },
    { id: 'vang', name: 'vàng',     mul: 4.8, ramp: ['#5a4208', '#ffd964'] }
  ];
  CT.LOOT_NOUNS = ['đồng hồ', 'chân nến', 'hộp thuốc', 'khung ảnh', 'bình', 'chuông',
                   'lư hương', 'tách trà', 'mâm', 'két nhỏ', 'tượng', 'kính'];

  // Đồ dùng — vào 3 ô tay, không phải bao tải.
  CT.USABLES = [
    { id: 'bang',   name: 'Băng',       icon: '🩹', uses: 1, gold: 200,
      act: { heal: 35 }, desc: 'Hồi 35 máu. Dùng mất 1,2 giây và bạn đứng yên.' },
    { id: 'dauran', name: 'Dầu Rắn',    icon: '🧪', uses: 1, gold: 700,
      act: { hot: 11, hotSec: 10, spd: 0.16 }, desc: 'Hồi 11 máu mỗi giây trong 10 giây, và chạy nhanh hơn.' },
    { id: 'molotov',name: 'Bom Xăng',   icon: '🔥', uses: 1, gold: 700,
      act: { throw: true, fire: { dmg: 26, r: 70, sec: 5 } }, desc: 'Ném. Vũng lửa cháy 5 giây.' },
    { id: 'thuocno',name: 'Thuốc Nổ',   icon: '🧨', uses: 1, gold: 500,
      act: { throw: true, blast: { dmg: 160, r: 96 } }, desc: 'Ném. Nổ to, và đánh thức cả thị trấn.' },
    { id: 'ton',    name: 'Tấm Tôn',    icon: '🪣', uses: 1, gold: 400, scrapVal: 4,
      act: { wall: { hp: 260 } }, desc: 'Dựng lên mép toa làm vách chắn đạn.' },
    { id: 'kemgai', name: 'Kẽm Gai',    icon: '🌵', uses: 1, gold: 240, scrapVal: 2,
      act: { wire: { dmg: 50, stun: 0.8, hits: 12 } }, desc: 'Rải xuống. Con nào giẫm phải thì choáng và mất máu.' }
  ];
  CT.USABLE_BY_ID = {};
  CT.USABLES.forEach(u => { CT.USABLE_BY_ID[u.id] = u; });

  CT.BAG_BASE = 10;          // [DR] bao tải 10 ô
  CT.HAND_SLOTS = 3;         // ba ô tay trên HUD


  // ---------------------------------------------------------------------------
  // TIỀN TRONG VÁN — khác hẳn vàng ngoài ván
  // ---------------------------------------------------------------------------
  // [DR] Bản gốc tách rất rõ: $ chỉ sống trong một ván và mất sạch khi hết ván; Bonds
  // mới là thứ mang về được. Giữ nguyên vì nó tạo ra một quyết định thật ở mỗi ga:
  //
  //     BÁN NGAY để có tiền mua than và đạn đi tiếp
  //     hay GIỮ LẠI trong tủ để mang về đổi thành vàng?
  //
  // Bán thì sống được chặng này. Giữ thì giàu hơn — nếu về được tới nơi.
  CT.SELL_TO_CASH = 1.0;     // bán ở ga: 1 đồng ăn 1 giá trị
  CT.KEEP_TO_GOLD = 1.0;     // mang về: cũng 1 ăn 1, nhưng còn nhân hệ số Mặc Cả
  CT.START_CASH = 60;

  // Hàng ở ga. Mỗi ga bốc ngẫu nhiên một phần, nên không ga nào có đủ mọi thứ — và
  // "ga sau chắc có" là một canh bạc chứ không phải một lời hứa.
  CT.STOCK = [
    { id: 'than',   name: 'Than',        icon: '🪨', cash: 120, kind: 'fuel',  n: 1, always: true,
      desc: 'Một phần tư bình. Thứ duy nhất ở đây mà thiếu nó là hết chuyến.' },
    { id: 'anhe',   name: 'Đạn ngắn',    icon: '🔸', cash: 90,  kind: 'ammo', ammo: 'nhe', n: 24, always: true },
    { id: 'adai',   name: 'Đạn dài',     icon: '🔹', cash: 120, kind: 'ammo', ammo: 'dai', n: 24 },
    { id: 'ahoa',   name: 'Đạn hoa cải', icon: '🔶', cash: 120, kind: 'ammo', ammo: 'hoa', n: 24 },
    { id: 'anang',  name: 'Đạn nặng',    icon: '⬛', cash: 200, kind: 'ammo', ammo: 'nang', n: 100,
      desc: 'Cho toa pháo. Không lắp toa pháo thì mua về cũng để đó.' },
    { id: 'bang',   name: 'Băng',        icon: '🩹', cash: 70,  kind: 'use', use: 'bang',   n: 2, always: true },
    { id: 'dauran', name: 'Dầu Rắn',     icon: '🧪', cash: 190, kind: 'use', use: 'dauran', n: 1 },
    { id: 'molotov',name: 'Bom Xăng',    icon: '🔥', cash: 170, kind: 'use', use: 'molotov',n: 2 },
    { id: 'thuocno',name: 'Thuốc Nổ',    icon: '🧨', cash: 140, kind: 'use', use: 'thuocno',n: 2 },
    { id: 'ton',    name: 'Tấm Tôn',     icon: '🪣', cash: 100, kind: 'use', use: 'ton',    n: 3 },
    { id: 'kemgai', name: 'Kẽm Gai',     icon: '🌵', cash: 70,  kind: 'use', use: 'kemgai', n: 3 },
    { id: 'gluc',   name: 'Súng Lục',    icon: '🔫', cash: 240, kind: 'gun', gun: 'luc' },
    { id: 'glucdb', name: 'Lục Hải Quân',icon: '🔫', cash: 520, kind: 'gun', gun: 'lucdb' },
    { id: 'ghoa',   name: 'Súng Hoa Cải',icon: '💥', cash: 600, kind: 'gun', gun: 'hoacai' },
    { id: 'gcua',   name: 'Cưa Nòng',    icon: '💥', cash: 900, kind: 'gun', gun: 'cuaduoi' },
    { id: 'gtruong',name: 'Súng Trường', icon: '🎯', cash: 820, kind: 'gun', gun: 'truong' },
    { id: 'gchot',  name: 'Chốt Xoay',   icon: '🎯', cash: 1500,kind: 'gun', gun: 'chotxoay' }
  ];

  // ---------------------------------------------------------------------------
  // NHÂN VẬT — mỗi người MỘT chiêu chủ động, MỘT bị động đổi luật, MỘT đặc quyền ở ga.
  // ---------------------------------------------------------------------------
  // WHY ba phần chứ không phải một: một game hai pha mà nhân vật chỉ mạnh ở một pha thì
  // nửa ván người chơi cầm một nút chết. Mỗi người phải có việc để làm ở cả hai pha.
  //
  // WHY lướt KHÔNG phải chiêu riêng của ai: Enter the Gungeon cho mọi nhân vật cùng một
  // cú lăn né, và cái riêng nằm ở chỗ khác. Nếu để dash làm đặc quyền một người thì chín
  // người còn lại cầm một nhân vật cứng đơ — mà cảm giác cơ động là NỀN của game bắn
  // nhìn từ trên xuống, không phải phần thưởng.
  //
  // Số của cú lướt đọc thẳng từ mã nguồn Celeste (Player.cs): DashSpeed 240, DashTime .15,
  // EndDashSpeed 160, DashCornerCorrection 4. Quãng 36px trên khung 320 rộng = 11%.
  CT.DODGE = {
    dur: 0.20, spd: 470, iframe: 0.15, endMul: 0.66, cd: 2.5, charges: 2, corner: 4
  };

  CT.CHARS = [
    // ---- 3★ : dễ đọc ngay ván đầu ----
    {
      id: 'hai', name: 'Chị Hai', role: 'Xạ Thủ Hai Súng', star: 3, art: 'mai',
      skill: {
        id: 'chan', name: 'Bắn Chặn', icon: '✋', cd: 0.0, aim: 'none',
        window: 0.20, lock: 0.6, reflect: 1.5,
        // Dead Cells: cửa sổ parry 0,2s; trượt thì khoá 0,6s; trúng thì 0 sát thương và
        // parry lại được NGAY. Tỉ lệ thưởng-phạt 1:3 chính là thứ làm nó "đã tay".
        desc: 'Giơ nòng chặn trong 0,2 giây. Trúng thì đạn địch rơi và bay ngược lại 150% sát thương, chặn lại được ngay. Trượt thì khoá 0,6 giây, kể cả nút lướt.'
      },
      passive: { id: 'nongdoi', name: 'Nòng Đôi', mul: 0.6, noReload: true,
        desc: 'Cầm hai súng bắn hai hướng ngược nhau, mỗi khẩu 60% sát thương. Không nạp đạn được — phải nhặt băng rơi.' },
      station: { id: 'vohaitay', name: 'Vơ Hai Tay',
        desc: 'Nhặt được hai món cùng lúc. Đổi lại không mang được đồ cỡ to.' },
      base: { hp: 100, spd: 1.0, dmg: 1.0 }
    },
    {
      id: 'bay', name: 'Số 47', role: 'Cựu Tù', star: 3, art: 'dung',
      skill: {
        id: 'huc', name: 'Húc Xích', icon: '💢', cd: 11, aim: 'stick',
        dist: 250, spdMul: 3.0, ccImmune: true, up: 1.2, r: 70,
        desc: 'Lao thẳng theo hướng cần gạt, nhanh gấp ba. Miễn nhiễm mọi choáng và đẩy trong lúc lao (nhưng vẫn ăn đòn). Va vào ai thì hất tung 1,2 giây.'
      },
      passive: { id: 'dondu', name: 'Càng Dồn Càng Dữ', perLostPct: 0.015, noHeal: true,
        desc: '+1,5% sát thương cho mỗi 1% máu đã mất. Đổi lại không hồi máu được bằng bất cứ cách nào trong lúc tàu chạy — chỉ hồi khi qua ga.' },
      station: { id: 'quensat', name: 'Quen Song Sắt',
        desc: 'Thấy két và tủ khoá xuyên tường. Nhưng chỉ phá được, không mở được.' },
      base: { hp: 115, spd: 1.0, dmg: 1.0 }
    },

    // ---- 4★ : mạnh rõ ở một pha, yếu rõ ở pha kia ----
    {
      id: 'cole', name: 'Cờ-lê', role: 'Thợ Máy', star: 4, art: 'phuc',
      skill: {
        id: 'moctoa', name: 'Móc Toa', icon: '🪝', cd: 9, aim: 'point',
        range: 380, delay: 0.35, iframe: 0.2, pullUp: 0.5,
        desc: 'Bắn móc. Trúng tường thì tự kéo mình tới, bất tử 0,2 giây trong lúc bay. Trúng quái thì kéo nó về và hất tung 0,5 giây.'
      },
      passive: { id: 'hannong', name: 'Hàn Nóng', repair: true,
        desc: 'Hàn lại được toa hỏng ngay khi tàu đang chạy — người khác mất toa là mất luôn. Lúc hàn thì không bắn được và ăn đòn gấp đôi.' },
      station: { id: 'thaomay', name: 'Tháo Máy',
        desc: 'Tháo rời máy móc trong nhà lấy phế liệu. Mỗi lần tốn 2 giây đếm ngược.' },
      base: { hp: 105, spd: 1.0, dmg: 0.95 }
    },
    {
      id: 'dieuhau', name: 'Mắt Diều Hâu', role: 'Bắn Tỉa', star: 4, art: 'khoi',
      skill: {
        id: 'ninthở', name: 'Nín Thở', icon: '⏳', cd: 30, aim: 'none',
        slow: 0.35, dur: 2.5,
        desc: 'Cả thế giới chậm còn 35% trong 2,5 giây, riêng bạn chạy và bắn như thường. Đường đạn hiện thành vệt sáng.'
      },
      passive: { id: 'ngambancung', name: 'Ngắm Bắn', rootToFire: 0.5, pierce: true,
        desc: 'Không bắn được khi đang di chuyển. Đứng yên nửa giây thì đạn xuyên hết cả hàng quái, và càng xa càng đau.' },
      station: { id: 'treonoc', name: 'Trèo Nóc',
        desc: 'Leo lên nóc nhà (mất 4 giây) để thấy toàn bản đồ ga và mọi rương trong 5 giây.' },
      base: { hp: 90, spd: 0.95, dmg: 1.15 }
    },
    {
      id: 'chuong', name: 'Chuông', role: 'Người Dụ Quái', star: 4, art: 'linh',
      skill: {
        id: 'goihon', name: 'Chuông Gọi Hồn', icon: '🔔', cd: 13, aim: 'point',
        range: 260, delay: 0.5, r: 150, stun: 0.8,
        desc: 'Ném chuông. Nửa giây sau, mọi con trong vòng bị hút vào tâm và choáng 0,8 giây. Không kéo xuyên tường.'
      },
      passive: { id: 'thamoi', name: 'Thả Mồi', mul: 0.6, baitSec: 8,
        desc: 'Ném mồi thì quái bỏ bạn đi về phía nó trong 8 giây. Đổi lại sát thương gốc giảm 40%.' },
      station: { id: 'danduong', name: 'Dẫn Đường',
        desc: 'Quái bị dụ đi trước dò bẫy hộ. Bẫy nổ vào chúng chứ không nổ vào bạn.' },
      base: { hp: 100, spd: 1.05, dmg: 0.85 }
    },
    {
      id: 'mem', name: 'Ngón Mềm', role: 'Kẻ Trộm', star: 4, art: 'nga',
      skill: {
        id: 'khoimu', name: 'Khói Mù', icon: '💨', cd: 16, aim: 'none',
        dur: 4, spdPlus: 0.25, dr: 0.2, relock: 0.8, twoStep: true,
        desc: 'Bấm lần một: thả khói tại chỗ, tàng hình 4 giây, chạy nhanh hơn 25%, chịu đòn nhẹ đi 20%. Bấm lần hai: dịch chuyển tức thời về đúng chỗ thả khói, xuyên tường. Bắn hoặc bị chạm thì lộ.'
      },
      passive: { id: 'mokhoa', name: 'Bộ Mở Khoá', pickSec: 2, hpMul: 0.75,
        desc: 'Mở két và tủ khoá trong 2 giây, im lặng. Người khác phải phá: 15 giây và gọi cả thị trấn tới. Đổi lại máu tối đa giảm một phần tư.' },
      station: { id: 'tuibagang', name: 'Túi Ba Gang',
        desc: 'Mang thêm 2 ô đồ khỏi ga. Nhưng mỗi ô thừa làm đồng hồ chạy nhanh hơn 5%.' },
      base: { hp: 75, spd: 1.1, dmg: 1.0 }
    },
    {
      id: 'rosa', name: 'Bà Rosa', role: 'Thầy Bói', star: 4, art: 'van',
      skill: {
        id: 'baingươc', name: 'Lá Bài Ngược', icon: '🃏', cd: 40, aim: 'none',
        stasis: 0.6, rewind: 4,
        desc: 'Bất tử 0,6 giây rồi quay về đúng chỗ và đúng lượng máu của 4 giây trước. Miễn nhiễm mọi thứ đẩy hất trong lúc đó. Một bóng ma mờ luôn đi theo, chỉ sẵn chỗ bạn sẽ quay về.'
      },
      passive: { id: 'nhintruoc', name: 'Nhìn Trước Ga', foresee: 3,
        desc: 'Trước khi tàu dừng, thấy sẵn bản đồ ga và ba rương giá trị nhất. Rương bẫy hiện màu đỏ.' },
      station: { id: 'boibala', name: 'Bói Ba Lá',
        desc: 'Mỗi ga rút ba lá chọn một: thêm 8 giây, mở sẵn mọi khoá một căn nhà, hoặc biết trước chặng sau.' },
      base: { hp: 90, spd: 1.0, dmg: 0.95 }
    },
    {
      id: 'hale', name: 'Ông Đốc Hale', role: 'Bác Sĩ', star: 4, art: 'hue',
      skill: {
        id: 'ongtiem', name: 'Ống Tiêm', icon: '💉', cd: 35, aim: 'none',
        healPct: 0.30, cleanse: true, ccImmune: 1.5, usableWhileStunned: true,
        desc: 'Hồi 30% máu tối đa tức thì, xoá sạch mọi thứ bất lợi, miễn nhiễm khống chế 1,5 giây. Bấm được cả khi đang bị choáng — nút thoát hiểm duy nhất trong game làm được điều đó.'
      },
      passive: { id: 'tramcuu', name: 'Trạm Cứu Thương', noStationHeal: true, tradeSec: 3, tradePct: 0.10,
        desc: 'Không tự hồi máu khi qua ga như người khác. Thay vào đó đổi thời gian lấy máu: mỗi 3 giây đếm ngược bỏ ra là 10% máu, và hồi được cả cho toa tàu.' },
      station: { id: 'docnhan', name: 'Đọc Nhãn Thuốc',
        desc: 'Thấy đúng món gì nằm trong rương trước khi mở.' },
      base: { hp: 100, spd: 1.0, dmg: 0.9 }
    },

    // ---- 5★ : bỏ hẳn một trụ cột của game ----
    {
      id: 'de', name: 'Đe', role: 'Thợ Hàn Giáp', star: 5, art: 'son',
      skill: {
        id: 'vachthep', name: 'Vách Thép', icon: '🧱', cd: 16, charges: 2, aim: 'stick',
        w: 150, hp: 340, dur: 6,
        desc: 'Dựng một tấm thép trước mặt. Phá huỷ mọi viên đạn chạm vào và chặn đường quái. Có máu riêng, tan sau 6 giây. Giữ được hai lượt để dựng góc chữ L.'
      },
      passive: { id: 'taybua', name: 'Tay Búa', noLongGun: true, wallMul: 3, shootThrough: true,
        desc: 'Không cầm được súng dài, chỉ có súng lục. Đổi lại mọi vách của bạn bền gấp ba, và bạn bắn xuyên được từ phía sau vách của chính mình.' },
      station: { id: 'cayban', name: 'Cạy Bản Lề',
        desc: 'Gỡ cửa sắt, két, tấm tôn thành nguyên liệu. Đây là nguồn phế liệu duy nhất trong game.' },
      base: { hp: 135, spd: 0.9, dmg: 0.9 }
    },
    {
      id: 'soi', name: 'Chó Sói', role: 'Người Thuần Thú', star: 5, art: 'tam',
      skill: {
        id: 'thaxich', name: 'Thả Xích', icon: '🐕', cd: 12, charges: 3, aim: 'point',
        pin: 2.0, dogHp: 90, dogDps: 26, sleepAt: 8,
        desc: 'Một con chó lao tới ghim chặt mục tiêu 2 giây và cắn liên tục. Giữ được ba lượt: thả ba hướng, hoặc dồn cả ba vào một con.'
      },
      passive: { id: 'baydan', name: 'Bầy Đàn', noGun: true, dogs: 3,
        desc: 'Không cầm được súng, chỉ có dao. Đổi lại có ba con chó tự đánh, và sát thương của chúng ăn theo mọi chỉ số sát thương bạn nhặt được.' },
      station: { id: 'muicho', name: 'Mũi Chó',
        desc: 'Chó đánh hơi ra rương ẩn và hầm bí mật. Nó sủa báo trước khi quái tràn vào nhà.' },
      base: { hp: 100, spd: 1.05, dmg: 0.7 }
    }
  ];
  CT.CHAR_BY_ID = {};
  CT.CHARS.forEach(c => { CT.CHAR_BY_ID[c.id] = c; });
  CT.STARTER = 'hai';   // tài khoản mới có đúng một người. Bốn ô còn lại quay ra.

  // Nâng cấp chiêu bằng MẢNH khi quay trùng. WHY nâng chiêu chứ không nâng chỉ số: giữ
  // đúng tinh thần "kỹ năng độc quyền". Và cấp 5 phải MỞ MỘT CƠ CHẾ MỚI, không phải một
  // con số to hơn — đó là cách duy nhất thêm nhân vật mà không đẩy nhân vật cũ vào sọt.
  CT.SHARD_PER_LV = 5;
  CT.SKILL_LV_MAX = 5;
  CT.SKILL_LV = [
    null,
    { cdMul: 1.00, note: '' },
    { cdMul: 0.85, note: 'Hồi chiêu nhanh hơn 15%.' },
    { cdMul: 0.85, plus: true,  note: 'Thêm một lượt tích, hoặc tầm và thời lượng +30%.' },
    { cdMul: 0.72, plus: true,  note: 'Hồi chiêu nhanh thêm 15% nữa.' },
    { cdMul: 0.72, plus: true,  awaken: true, note: 'Mở một hiệu ứng hoàn toàn mới.' }
  ];
  CT.AWAKEN = {
    hai:     'Chặn trúng thì phản đạn ra ba hướng thay vì một.',
    bay:     'Đường lao để lại vệt lửa cháy ba giây.',
    cole:    'Bấm lại trong ba giây để bay ngược về chỗ cũ.',
    de:      'Vách phản 30% sát thương đạn nó chặn về phía kẻ bắn.',
    dieuhau: 'Trong lúc nín thở, mọi phát bắn đều chí mạng.',
    chuong:  'Quái bị gom nhận thêm 25% sát thương trong bốn giây sau đó.',
    mem:     'Đòn bắn đầu tiên sau khi lộ gây gấp đôi sát thương.',
    rosa:    'Quay ngược hồi lại cả một lượt lướt và một lượt chiêu đã tiêu.',
    hale:    'Ống tiêm chia một nửa hiệu ứng cho toa tàu gần nhất.',
    soi:     'Chó chết thì hồi sinh sau 15 giây thay vì mất hẳn.'
  };

  // ---------------------------------------------------------------------------
  // TRANG BỊ — sáu ô, chỉ số chính và phụ ngẫu nhiên.
  // ---------------------------------------------------------------------------
  CT.SLOTS = [
    { id: 'mu',   name: 'Mũ',     icon: '🎩' },
    { id: 'ao',   name: 'Áo',     icon: '🧥' },
    { id: 'tay',  name: 'Găng',   icon: '🧤' },
    { id: 'giay', name: 'Giày',   icon: '🥾' },
    { id: 'dai',  name: 'Thắt Lưng', icon: '🪢' },
    { id: 'bua',  name: 'Bùa',    icon: '🔮' }
  ];
  CT.SLOT_BY_ID = {};
  CT.SLOTS.forEach(s => { CT.SLOT_BY_ID[s.id] = s; });

  CT.STATS = {
    hp:   { name: 'Máu',        fmt: v => '+' + Math.round(v) },
    dmg:  { name: 'Sát thương', fmt: v => '+' + (v * 100).toFixed(1) + '%' },
    spd:  { name: 'Tốc chạy',   fmt: v => '+' + (v * 100).toFixed(1) + '%' },
    cd:   { name: 'Hồi chiêu',  fmt: v => '-' + (v * 100).toFixed(1) + '%' },
    grit: { name: 'Chịu đòn',   fmt: v => '-' + (v * 100).toFixed(1) + '%' },
    luck: { name: 'Mặc cả',     fmt: v => '+' + (v * 100).toFixed(1) + '%' },
    bag:  { name: 'Ô bao tải',  fmt: v => '+' + Math.round(v) }
  };
  CT.MAIN_BY_SLOT = {
    mu:   ['hp', 'grit'],
    ao:   ['hp', 'grit'],
    tay:  ['dmg', 'cd'],
    giay: ['spd', 'dmg'],
    dai:  ['bag', 'luck'],
    bua:  ['dmg', 'cd', 'luck']
  };
  CT.SUBS = ['hp', 'dmg', 'spd', 'cd', 'grit', 'luck'];

  // ---------------------------------------------------------------------------
  // TIẾN HOÁ — cộng thẳng cho người chơi, mở bằng vàng.
  // ---------------------------------------------------------------------------
  CT.EVOL = [
    { id: 'hp',   name: 'Thể Lực',  stat: 'hp',   per: 14,    max: 20, base: 900,  step: 0.55, icon: '❤️', desc: '+14 máu mỗi cấp.' },
    { id: 'dmg',  name: 'Tay Súng', stat: 'dmg',  per: 0.014, max: 20, base: 1000, step: 0.60, icon: '⚔️', desc: '+1,4% sát thương mỗi cấp.' },
    { id: 'spd',  name: 'Chân Chạy',stat: 'spd',  per: 0.012, max: 15, base: 1200, step: 0.62, icon: '👟', desc: '+1,2% tốc chạy mỗi cấp.' },
    { id: 'cd',   name: 'Thuộc Bài',stat: 'cd',   per: 0.015, max: 12, base: 1600, step: 0.70, icon: '⏱️', desc: 'Hồi chiêu nhanh thêm 1,5% mỗi cấp.' },
    { id: 'grit', name: 'Da Trâu',  stat: 'grit', per: 0.012, max: 12, base: 1500, step: 0.66, icon: '🛡️', desc: 'Chịu đòn tốt thêm 1,2% mỗi cấp.' },
    { id: 'bag',  name: 'Vai Gánh', stat: 'bag',  per: 0.4,   max: 10, base: 1800, step: 0.72, icon: '🎒', desc: 'Bao tải rộng thêm 0,4 ô mỗi cấp.' },
    { id: 'luck', name: 'Mặc Cả',   stat: 'luck', per: 0.018, max: 15, base: 1700, step: 0.72, icon: '💰', desc: 'Bán được thêm 1,8% mỗi cấp.' },
    { id: 'fuel', name: 'Tiết Kiệm',stat: 'fuel', per: 0.012, max: 12, base: 2000, step: 0.75, icon: '🪵', desc: 'Tàu ăn ít than hơn 1,2% mỗi cấp.' }
  ];

  // ---------------------------------------------------------------------------
  // MAP. Không lặp vô hạn: mỗi map có số CHẶNG cố định, hết chặng là thắng.
  // ---------------------------------------------------------------------------
  // `power` là KHUYẾN NGHỊ, không phải khoá. Tài liệu về meta-progression roguelite
  // cảnh báo đúng chuyện gate cứng theo lực chiến: nó biến game thành bắt buộc cày.
  // Ở đây map hiện chữ "còn yếu" và cho vào.
  CT.MAPS = [
    // --- VÒNG 1 — học nghề ---
    { id: 'm1', name: 'Ga Bụi Đỏ',    cycle: 1, legs: 3, tier: 1, power: 0,
      pal: { sky: '#2a1c14', sand: '#6f5330', far: '#3d2c1d' },
      desc: 'Ba chặng đầu tiên. Trời còn sáng, và thứ trên đường ray còn đi được bằng hai chân.',
      first: { gold: 3000, gem: 300, ticketC: 1 }, clear: { gold: 900, gem: 20 } },
    { id: 'm2', name: 'Thị Trấn Cạn', cycle: 1, legs: 4, tier: 2, power: 3800,
      pal: { sky: '#2b1f14', sand: '#74582f', far: '#40301c' },
      desc: 'Giếng cạn từ lâu. Người ở lại thì không.',
      first: { gold: 6000, gem: 500, ticketE: 2 }, clear: { gold: 1800, gem: 30 } },
    { id: 'm3', name: 'Hẻm Đá Gãy',   cycle: 1, legs: 5, tier: 3, power: 7600,
      pal: { sky: '#1e1a1c', sand: '#5f4a35', far: '#332a26' },
      desc: 'Vách đá hai bên, đường ray chạy giữa. Không có chỗ nào để tránh.',
      first: { gold: 12000, gem: 800, ticketC: 2 }, clear: { gold: 3200, gem: 45 } },

    // --- VÒNG 2 — cùng bấy nhiêu giống quái, khoẻ hơn ---
    { id: 'm4', name: 'Mỏ Bỏ Hoang',  cycle: 2, legs: 3, tier: 4, power: 10000,
      pal: { sky: '#191418', sand: '#4e4038', far: '#2c2422' },
      desc: 'Vòng hai bắt đầu lại từ ba chặng. Đường thì ngắn lại, thứ trên đường thì không.',
      first: { gold: 20000, gem: 1200, ticketE: 3 }, clear: { gold: 5200, gem: 60 } },
    { id: 'm5', name: 'Đồng Muối',    cycle: 2, legs: 4, tier: 5, power: 13500,
      pal: { sky: '#1b1f26', sand: '#8a8577', far: '#3c4048' },
      desc: 'Trắng tới tận chân trời. Không có gì để nấp sau, và cũng không có gì nấp được sau bạn.',
      first: { gold: 30000, gem: 1500, ticketC: 2, ticketE: 2 }, clear: { gold: 7000, gem: 75 } },
    { id: 'm6', name: 'Trại Ngoài Luật', cycle: 2, legs: 5, tier: 6, power: 17500,
      pal: { sky: '#241419', sand: '#6a4432', far: '#3a2119' },
      desc: 'Ở đây người còn sống nguy hiểm hơn người đã chết.',
      first: { gold: 45000, gem: 2000, ticketC: 3 }, clear: { gold: 10000, gem: 95 } },

    // --- VÒNG 3 — chỉ tiêu nặng, đêm dài ---
    { id: 'm7', name: 'Cầu Sắt Dài',  cycle: 3, legs: 3, tier: 7, power: 20500,
      pal: { sky: '#121821', sand: '#4a4e52', far: '#242c34' },
      desc: 'Lại ba chặng. Nhưng dưới đường ray không còn mặt đất nữa.',
      first: { gold: 70000, gem: 2600, ticketE: 4 }, clear: { gold: 15000, gem: 120 } },
    { id: 'm8', name: 'Đêm Không Trăng', cycle: 3, legs: 4, tier: 8, power: 24000,
      pal: { sky: '#0d0f16', sand: '#3a3630', far: '#1c1f26' },
      desc: 'Đèn tàu soi được mười bước. Xa hơn thế thì bạn chỉ nghe thấy.',
      first: { gold: 95000, gem: 3200, ticketC: 4 }, clear: { gold: 21000, gem: 150 } },
    { id: 'm9', name: 'Ga Cuối',      cycle: 3, legs: 5, tier: 9, power: 27500,
      pal: { sky: '#150c10', sand: '#4a2f2c', far: '#2a1618' },
      desc: 'Không có trên bản đồ nào. Đường ray đến đây thì hết.',
      first: { gold: 150000, gem: 5000, ticketC: 5, ticketE: 5 }, clear: { gold: 32000, gem: 220 } }
  ];
  CT.MAP_BY_ID = {};
  CT.MAPS.forEach(m => { CT.MAP_BY_ID[m.id] = m; });

  // ---------------------------------------------------------------------------
  // GACHA. Hai băng. Tỉ lệ CÔNG BỐ NGAY TRÊN MÀN QUAY, kèm bộ đếm bảo hiểm.
  // ---------------------------------------------------------------------------
  // WHY 2% chứ không phải 0,6% như Genshin: 0,6% chỉ hợp lý khi có doanh thu thật để
  // nuôi một roster hàng trăm nhân vật. Ở đây mười người và không bán gì — vòng phản hồi
  // phải nhanh hơn, nếu không người chơi bỏ trước khi thấy người thứ hai.
  // Mốc lấy từ Arknights (2% cho hạng cao nhất, soft pity sau 50, +2%/lượt).
  //
  // Và bốn thứ dưới đây làm theo mức chuẩn cao nhất dù game không bán gì bằng tiền thật:
  // hiện tỉ lệ ngay trên màn quay, hiện bộ đếm bảo hiểm, nói rõ cơ chế bằng lời, và
  // không bao giờ đổi tỉ lệ mà không báo. Hàn Quốc phạt Nexon 8,3 triệu USD vì đúng
  // điều cuối; Nhật cấm hình sự kiểu gacha "gom đủ bộ mới nhận thưởng" từ 2012.
  CT.GACHA = {
    char: {
      id: 'char', name: 'Băng Người', costGem: 160, ticket: 'ticketC', color: '#e0a53c',
      rate5: 0.020, rate4: 0.180, soft: 40, softStep: 0.03, hard: 60, pity4: 10,
      desc: 'Ra người mới. Trùng thì thành mảnh để nâng cấp chiêu của chính người đó.'
    },
    equip: {
      id: 'equip', name: 'Băng Đồ', costGem: 120, ticket: 'ticketE', color: '#a678d8',
      rate5: 0.035, rate4: 0.200, soft: 999, softStep: 0, hard: 50, pity4: 10,
      desc: 'Ra trang bị sáu ô. Chỉ số chính và phụ đều quay ngẫu nhiên.'
    }
  };
  CT.SPARK = 100;   // 100 lượt tích luỹ thì chọn thẳng một người bất kỳ.

  // ---------------------------------------------------------------------------
  // CỬA HÀNG. NẠP LÀ GIẢ — không có cổng thanh toán nào ở đây, bấm là có ngọc.
  // Sự minh bạch này phải hiện ở BA chỗ và người chơi phải thấy được HAI trong ba:
  // hộp cảnh báo đầu màn cửa hàng, và chữ "(nạp giả)" trong thông báo mỗi lần mua.
  // Một quầy nạp trông y như thật mà không nói mình là giả thì đó là một cái bẫy,
  // kể cả khi không ai mất đồng nào.
  // ---------------------------------------------------------------------------
  CT.PACKS = [
    { id: 'p1', name: 'Gói Vé Lẻ',     vnd: 22000,   gem: 300,   bonus: 0,     tag: '' },
    { id: 'p2', name: 'Gói Toa Ghế',   vnd: 109000,  gem: 1600,  bonus: 100,   tag: '' },
    { id: 'p3', name: 'Gói Toa Nằm',   vnd: 249000,  gem: 3800,  bonus: 400,   tag: 'HOT' },
    { id: 'p4', name: 'Gói Trưởng Tàu',vnd: 549000,  gem: 8800,  bonus: 1200,  tag: '' },
    { id: 'p5', name: 'Gói Chủ Ga',    vnd: 999000,  gem: 16800, bonus: 3200,  tag: 'LỜI NHẤT' },
    { id: 'p6', name: 'Gói Ông Trùm',  vnd: 2499000, gem: 45000, bonus: 12000, tag: 'V.I.P' }
  ];
  CT.FIRST_BONUS = 2;   // lần mua đầu của mỗi gói được nhân đôi.

  CT.EXCHANGE = [
    { id: 'x1', gem: 50,  gold: 6500,  limit: 20 },
    { id: 'x2', gem: 200, gold: 30000, limit: 10 },
    { id: 'x3', gem: 60,  ticketC: 1,  limit: 5 },
    { id: 'x4', gem: 45,  ticketE: 1,  limit: 5 },
    { id: 'x5', gem: 80,  scrap: 25,   limit: 8 }
  ];

  // ---------------------------------------------------------------------------
  // NHIỆM VỤ & THÀNH TỰU
  // ---------------------------------------------------------------------------
  CT.QUESTS = {
    daily: [
      { id: 'd_run',  text: 'Đi 2 chuyến bất kỳ',        counter: 'runs',   need: 2,     r: { gold: 700, gem: 15 } },
      { id: 'd_loot', text: 'Mang về 15.000 giá trị đồ', counter: 'loot',   need: 15000, r: { gold: 1000 } },
      { id: 'd_kill', text: 'Hạ 40 con',                 counter: 'kills',  need: 40,    r: { gold: 800 } },
      { id: 'd_leg',  text: 'Qua 6 chặng',               counter: 'legs',   need: 6,     r: { gold: 900, ticketE: 1 } },
      { id: 'd_skill',text: 'Dùng chiêu 20 lần',         counter: 'skills', need: 20,    r: { gold: 600, gem: 10 } },
      { id: 'd_pull', text: 'Quay 5 lượt',               counter: 'pulls',  need: 5,     r: { gold: 1100 } },
      { id: 'd_fuel', text: 'Đốt 8 cục than',            counter: 'coal',   need: 8,     r: { gold: 700, gem: 10 } }
    ],
    weekly: [
      { id: 'w_win',  text: 'Phá đảo 3 map',             counter: 'wins',    need: 3,      r: { gold: 7000, gem: 200 } },
      { id: 'w_loot', text: 'Mang về 150.000 giá trị đồ',counter: 'loot',    need: 150000, r: { gold: 9000, ticketC: 1 } },
      { id: 'w_kill', text: 'Hạ 300 con',                counter: 'kills',   need: 300,    r: { gold: 8000, ticketE: 2 } },
      { id: 'w_car',  text: 'Nâng cấp toa 6 lần',        counter: 'carUps',  need: 6,      r: { gold: 6000, gem: 150 } }
    ]
  };
  CT.ACHS = [
    { id: 'a_first', text: 'Phá đảo map đầu tiên',       counter: 'wins',     need: 1,       r: { gem: 300 } },
    { id: 'a_all',   text: 'Phá đảo cả 9 map',           counter: 'mapsDone', need: 9,       r: { gem: 2500, ticketC: 5 } },
    { id: 'a_five',  text: 'Sở hữu một người 5★',        counter: 'own5',     need: 1,       r: { gem: 400 } },
    { id: 'a_ten',   text: 'Sở hữu đủ 10 người',         counter: 'ownAll',   need: 10,      r: { gem: 3000 } },
    { id: 'a_awake', text: 'Đưa một chiêu lên cấp 5',    counter: 'skillMax', need: 1,       r: { gem: 800 } },
    { id: 'a_train', text: 'Lắp đủ 5 toa',               counter: 'carsFull', need: 5,       r: { gold: 20000 } },
    { id: 'a_kill1k',text: 'Hạ 1.000 con',               counter: 'kills',    need: 1000,    r: { gold: 25000 } },
    { id: 'a_loot1m',text: 'Mang về 1.000.000 giá trị đồ',counter: 'loot',    need: 1000000, r: { gem: 1500 } }
  ];

})(window);
