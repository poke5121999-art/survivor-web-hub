// Bộ hình pixel cho Ca Trực Đêm và Biệt Đội (hai game dùng chung engine game.js).
//
// Mỗi file art/{crew,foe}/<mã>.png là một charset 3 cột x 4 hàng, khung 32x48:
//   cột  = 3 khung bước chân (0 chân trái tới, 1 đứng, 2 chân phải tới), chạy vòng 0-1-2-1
//   hàng = 0 xuống, 1 trái, 2 phải, 3 lên   (thứ tự RPG Maker / Wolf RPG)
// Vẽ tay đè lên đúng khuôn đó là game nhận ngay. Xem art/README.md.
//
// Engine chỉ gọi vào đây đúng ba chỗ (drawMonsters / drawPlayer / drawMates) và luôn
// theo dạng "vẽ được thì thôi, không thì rơi về cách vẽ cũ" — thiếu file hình nào thì
// riêng con đó về hình khối cũ chứ màn không vỡ.
//
// Viền đỏ quanh quái được NƯỚNG SẴN lúc nạp: vẽ lại hình 12 lần lệch quanh tâm, tô đỏ,
// rồi dán hình gốc lên trên. Nướng một lần cho cả bộ; làm lúc vẽ thì mỗi con quái tốn
// 12 lần vẽ mỗi khung hình.
(function (root) {
  'use strict';
  if (root.REPO_SKIN) return;                  // nạp hai lần thì bỏ qua lần sau

  // File hình lưu ở 3 lần cỡ ô trong game: engine vẽ thế giới với hệ số dpr*zoom
  // (khoảng 3,1 trên màn nét cao), nên nếu lưu đúng cỡ thì hình bị phóng to lúc vẽ
  // và nhoè. Lưu dư rồi thu xuống thì nét. Tỉ lệ vẽ chia lại cho SRC nên cỡ nhân
  // vật trên màn không đổi.
  const SRC = 3;
  const FW = 32 * SRC, FH = 48 * SRC, COLS = 3, ROWS = 4;
  // Viền MỎNG. Bộ hình mới lấp gần kín khung 96x144 (nhân vật cao ~48 pixel gốc thay vì 32),
  // nên cùng một bề dày viền giờ ăn nhiều hơn hẳn phần hình bên trong, và ở tỉ lệ vẽ thật
  // (96 -> 25,6 đơn vị thế giới) thì 6px thành một vệt gần 2 pixel màn hình bao quanh mọi thứ.
  // 4px cho ra hơn một pixel màn hình: đủ để tách khỏi nền tối, không đủ để nuốt mất cái áo.
  const RIM = Math.round(SRC * 1.35), RIM_COLOR = '#ff3b30';
  // Người 0,80 và quái 1,05 (trước là 0,55 / 0,80). Bộ hình vẽ tay là tranh pixel: ô
  // nguồn cao 144 px mà vẽ ra chỉ 77 px thì thu hơn một nửa, và nửa số pixel của bộ
  // hình rơi mất trước khi tới mắt người chơi. Vẽ to lên là cách duy nhất thấy được
  // cái áo, cái nơ, cái mặt — thứ mà chủ dự án bỏ công vẽ. Tỉ lệ quái/người giữ ~1,3.
  const CREW_SCALE = 0.80 / SRC, FOE_SCALE = 1.05 / SRC;
  const DOWN = 0, LEFT = 1, RIGHT = 2, UP = 3;

  // Đường dẫn tính từ trang đang mở: Ca Trực Đêm mở games/repo2d/, Biệt Đội mở
  // games/repo-squad/ nhưng nạp chung file này, nên phải suy ra từ src của thẻ script.
  const HERE = (function () {
    const s = document.currentScript;
    if (s && s.src) return s.src.replace(/[^/]*(\?.*)?$/, '');
    return 'games/repo2d/';
  })();

  // ...và LẤY LUÔN dấu ?v= của chính thẻ script này để đóng vào mọi đường dẫn ảnh.
  //
  // Đây là lỗi làm chủ dự án thay cả bộ hình mà trên web vẫn thấy hình cũ, ở CẢ HAI bản. Ba tệp
  // .js đều có ?v= chống cache và được bump mỗi lần sửa, nhưng ẢNH thì không có gì cả — mà tên
  // tệp không đổi, chỉ ruột đổi. Trình duyệt lẫn CDN của GitHub Pages đều coi art/crew/bao.png
  // là đúng cái tệp chúng đã có, nên trả lại bản cũ và không hỏi lại máy chủ.
  //
  // Buộc vào chính dấu của thẻ script chứ không phải một hằng số riêng: bump một chỗ là cả JS
  // lẫn ảnh cùng mới, không có cách nào quên một nửa.
  // SEE: web vẫn thấy art cũ, 2026-08-31
  const VER = (function () {
    const s = document.currentScript;
    const m = s && s.src && s.src.match(/[?&]v=([^&]+)/);
    return m ? '?v=' + m[1] : '';
  })();

  const crew = Object.create(null);
  const foe = Object.create(null);
  let pending = 0, failed = 0;

  // Danh sách này là danh sách TẢI VỀ, nên mỗi tên không có file tương ứng là một request
  // 404 thật trên mạng — bộ kiểm đếm nó thành lỗi console, đúng như nó nên làm.
  // mate0/1/2 là bộ kê chỗ do code sinh ra thuở chưa có hình vẽ tay; ba con bot đã mượn
  // bao/hue/tam từ lâu (xem MATE_LOOK) nên ba tệp đó bị xoá khỏi kho. Bỏ nốt tên ra đây.
  // `lead` KHÔNG còn là một xác riêng. Nhân vật chính của Ca Trực Đêm và Flare "Đèn Pin" của Biệt
  // Đội là cùng một người: `bao`. Trước đây hai mã trỏ vào hai tệp khác nhau, nên cùng một nhân
  // vật ra hai mặt tuỳ bản đang chơi. Xem crewIdOf.
  //
  // ĐỦ CẢ 14. Biệt Đội có 14 nhân vật và `bao` gánh luôn vai chính của Ca Trực Đêm, nên bộ này
  // là đủ, không còn xác nào rơi về hình khối cũ. Mỗi tên ở đây không có tệp tương ứng là một
  // request 404 thật, nên danh sách phải khớp đúng thư mục art/crew.
  const CREW_IDS = ['bao', 'hue', 'tam', 'ky', 'linh', 'dung', 'mai', 'phuc', 'son',
                    'nga', 'khoi', 'van', 'hai', 'tuyet'];

  // Ba con bot của Ca Trực Đêm ("Tổ 2/3/4") mượn ba xác, thứ tự cố định để cùng một con bot
  // luôn ra cùng một mặt trong mọi ván. KHÔNG được có `bao` ở đây: bao giờ cũng là mặt của
  // người chơi, và một con bot đi sau lưng mang đúng mặt mình là thứ đọc nhầm trong nửa giây
  // — đúng nửa giây đắt nhất trong game này. Thiếu cả ba thì crewIdOf trả về một mã không có
  // trong kho, drawCrew trả false, và màn rơi về hình khối cũ — không vỡ.
  const MATE_LOOK = ['hue', 'tam', 'ky'];
  const FOE_IDS = ['patrol', 'listen', 'stalk', 'bomber', 'heavy', 'rook', 'angel',
    'crawler', 'quanca', 'bongden'];

  // Hai game dùng chung thư mục hình nhưng BỘ QUÁI KHÁC NHAU, và tệ hơn: có mã trùng
  // tên mà khác hẳn con. `rook` bên Ca Trực Đêm là Kẻ húc — con thú ngắm một đường rồi
  // lao; bên Biệt Đội là Con Ngồi — mù, chỉ nghe, ngồi thu lu một chỗ, đứng im thì nó
  // đi qua. Một cái tên, hai luật, nên không thể để chung một tấm hình.
  //
  // Bảng này chỉ áp cho trang Biệt Đội, và nó gắn lại theo LUẬT của con quái chứ không
  // theo cái tên: cục ngồi thu lu cho Con Ngồi, con sói không quên mùi cho Thợ Săn,
  // con nhện cho Nhện Trần. Ba tấm đó vẽ sẵn từ lâu, chỉ là đang treo nhầm chỗ.
  const SQUAD_FOE_ART = {
    rook:   'crawler',   // Con Ngồi   — thứ ngồi thu lu dưới đất
    hunter: 'rook',      // Thợ Săn    — con sói mắt đỏ, đánh hơi và không quên
    nhen:   'listen'     // Nhện Trần  — con nhện
  };
  // Nạp lúc trang mở thì `window.SQ` chưa có (content.js nạp sau), nên phải hỏi lúc VẼ.
  const foeArt = (t) => (window.SQ && SQUAD_FOE_ART[t]) || t;

  function cvs(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').imageSmoothingEnabled = false;
    return c;
  }

  // Một bản sao đã phủ màu, chỉ phủ lên chỗ CÓ HÌNH. Phải làm trong canvas riêng —
  // làm thẳng trên màn thì 'source-atop' bám cả sàn nhà đã vẽ trước đó.
  function tinted(src, color) {
    const t = cvs(src.width, src.height);
    const x = t.getContext('2d');
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = color;
    x.fillRect(0, 0, t.width, t.height);
    return t;
  }

  function bakeRim(img) {
    const pad = RIM + SRC, cw = FW + pad * 2, ch = FH + pad * 2;
    const out = cvs(cw * COLS, ch * ROWS);
    const ox = out.getContext('2d');
    const tmp = cvs(cw, ch);
    const tx = tmp.getContext('2d');
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        tx.clearRect(0, 0, cw, ch);
        tx.globalCompositeOperation = 'source-over';
        for (let a = 0; a < 12; a++) {
          const ang = a / 12 * Math.PI * 2;
          tx.drawImage(img, c * FW, r * FH, FW, FH,
            pad + Math.cos(ang) * RIM, pad + Math.sin(ang) * RIM, FW, FH);
        }
        tx.globalCompositeOperation = 'source-in';
        tx.fillStyle = RIM_COLOR;
        tx.fillRect(0, 0, cw, ch);
        tx.globalCompositeOperation = 'source-over';
        tx.drawImage(img, c * FW, r * FH, FW, FH, pad, pad, FW, FH);
        ox.drawImage(tmp, c * cw, r * ch);
      }
    }
    return { cv: out, flash: tinted(out, 'rgba(255,228,216,.75)'), cw: cw, ch: ch, pad: pad };
  }

  // VIỀN RỖNG quanh người, để thay cho cái vòng tròn highlight.
  //
  // Khác bakeRim ở đúng một bước: sau khi bôi 12 bản lệch để lấy bóng người, ta KHOÉT chính hình
  // gốc ra ('destination-out'), nên còn lại đúng cái viền chứ không phải cả cái bóng đặc. Phải rỗng,
  // vì lớp highlight vẽ ở chế độ cộng sáng ('lighter') NGOÀI lớp thế giới — một cái bóng đặc vẽ
  // chồng lên sẽ xoá trắng nhân vật thay vì làm nổi nhân vật lên.
  //
  // Nướng LƯỜI, từng xác một lúc cần tới. Bộ có 18 xác mà một ván chỉ dùng bốn; nướng sẵn cả bộ
  // là ~16MB canvas nằm không trên máy điện thoại.
  // SEE: viền bó sát thay vòng tròn, 2026-08-31
  const halo = Object.create(null);
  function bakeHalo(img) {
    const pad = RIM + SRC, cw = FW + pad * 2, ch = FH + pad * 2;
    const out = cvs(cw * COLS, ch * ROWS);
    const ox = out.getContext('2d');
    const tmp = cvs(cw, ch);
    const tx = tmp.getContext('2d');
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        tx.clearRect(0, 0, cw, ch);
        tx.globalCompositeOperation = 'source-over';
        for (let a = 0; a < 12; a++) {
          const ang = a / 12 * Math.PI * 2;
          tx.drawImage(img, c * FW, r * FH, FW, FH,
            pad + Math.cos(ang) * RIM, pad + Math.sin(ang) * RIM, FW, FH);
        }
        tx.globalCompositeOperation = 'destination-out';
        tx.drawImage(img, c * FW, r * FH, FW, FH, pad, pad, FW, FH);
        tx.globalCompositeOperation = 'source-in';
        tx.fillStyle = '#fff';
        tx.fillRect(0, 0, cw, ch);
        ox.drawImage(tmp, c * cw, r * ch);
      }
    }
    return { cv: out, cw: cw, ch: ch, pad: pad };
  }
  // Một ô nháp dùng chung để nhuộm màu viền lúc vẽ. Nướng viền trắng một lần rồi nhuộm ở đây thì
  // mỗi vai (người chơi / đồng đội) không phải tốn một bộ sheet riêng.
  let tintCv = null;
  function haloOf(id) {
    if (halo[id] === undefined) halo[id] = crew[id] ? bakeHalo(crew[id].img) : null;
    return halo[id];
  }
  // c ĐÃ dịch về chỗ đứng của nhân vật, y hệt hợp đồng của drawCrew.
  function drawCrewHalo(c, a, isPlayer, color, alpha) {
    const s = haloOf(crewIdOf(a, isPlayer));
    if (!s) return false;
    if (!tintCv || tintCv.width < s.cw || tintCv.height < s.ch) tintCv = cvs(s.cw, s.ch);
    const t = tintCv.getContext('2d');
    t.globalCompositeOperation = 'source-over';
    t.clearRect(0, 0, tintCv.width, tintCv.height);
    t.drawImage(s.cv, colFor(a) * s.cw, rowFor(a.dir) * s.ch, s.cw, s.ch, 0, 0, s.cw, s.ch);
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = color;
    t.fillRect(0, 0, s.cw, s.ch);
    // Căn sao cho ô hình gốc nằm trong viền rơi ĐÚNG chỗ drawCrew vẽ nó.
    const w = FW * CREW_SCALE, h = FH * CREW_SCALE, k = CREW_SCALE;
    c.save();
    c.globalAlpha = alpha == null ? 1 : alpha;
    c.imageSmoothingEnabled = false;
    c.drawImage(tintCv, 0, 0, s.cw, s.ch,
      Math.round(-w / 2 - s.pad * k), Math.round(8 - h - s.pad * k), s.cw * k, s.ch * k);
    c.restore();
    return true;
  }

  function load(url, done) {
    pending++;
    const img = new Image();
    img.onload = function () { pending--; done(img); };
    img.onerror = function () { pending--; failed++; };
    img.src = url;
  }

  CREW_IDS.forEach(function (id) {
    load(HERE + 'art/crew/' + id + '.png' + VER, function (im) {
      // Bản đỏ: engine cũ nháy đỏ cả người khi vừa ăn đòn, giữ lại tín hiệu đó.
      crew[id] = { img: im, hurt: tinted(im, 'rgba(214,88,74,.62)') };
    });
  });
  FOE_IDS.forEach(function (id) {
    load(HERE + 'art/foe/' + id + '.png' + VER, function (im) { foe[id] = bakeRim(im); });
  });

  // ---------------------------------------------------------------- đồ vật
  // Món đồ ăn tiền và cái đèn trong tay. Không phải charset: đồ vật không có hướng nhìn,
  // nên mỗi tệp là một DẢI NGANG các ô vuông. Một căn nhà có vài chục món; gộp thành ba
  // dải theo cỡ thì trang tải bốn tệp thay vì hai ba chục.
  const ITEM = 32 * 3;
  const lootStrip = Object.create(null);     // 'nho' | 'vua' | 'to' -> { img, n }
  let lampStrip = null;

  ['nho', 'vua', 'to'].forEach(function (sz) {
    load(HERE + 'art/item/loot-' + sz + '.png' + VER, function (im) {
      lootStrip[sz] = { img: im, n: Math.max(1, Math.round(im.width / ITEM)) };
    });
  });
  load(HERE + 'art/item/lantern.png' + VER, function (im) {
    lampStrip = { img: im, n: Math.max(1, Math.round(im.width / ITEM)) };
  });

  const SZ_KEY = ['nho', 'vua', 'to'];

  // Món nào ra hình nào phải CỐ ĐỊNH theo món, không bốc lại mỗi khung hình. `bob` là số
  // ngẫu nhiên gắn vào món lúc sinh ra và không đổi nữa, nên dùng nó làm hạt giống: cùng
  // một cái ấm thì lúc nào cũng là cái ấm, kể cả sau khi bị vác đi rồi thả xuống.
  function lootIcon(c, l) {
    const s = lootStrip[SZ_KEY[l.sizeIdx | 0] || 'vua'];
    if (!s) return false;
    const i = Math.abs(Math.floor((l.bob || 0) * 997)) % s.n;
    const w = l.r * 2.6, h = w;
    c.imageSmoothingEnabled = false;
    c.drawImage(s.img, i * ITEM, 0, ITEM, ITEM,
      Math.round(l.x - w / 2), Math.round(l.y - h * 0.78), w, h);
    return true;
  }

  // Ngọn lửa lay theo đồng hồ chứ không theo bước chân — cái đèn cháy cả khi đứng im.
  function lamp(c, x, y, size, t) {
    if (!lampStrip) return false;
    const i = Math.floor((t || 0) * 8) % lampStrip.n;
    const h = size, w = size * 0.63;          // khung gốc 32x51, giữ đúng tỉ lệ
    c.imageSmoothingEnabled = false;
    c.drawImage(lampStrip.img, i * ITEM, 0, ITEM, ITEM,
      Math.round(x - w / 2), Math.round(y - h / 2), w, h);
    return true;
  }

  function rowFor(a) {
    const cs = Math.cos(a), sn = Math.sin(a);
    if (Math.abs(cs) > Math.abs(sn)) return cs > 0 ? RIGHT : LEFT;
    return sn > 0 ? DOWN : UP;
  }

  // Cột bước chân đếm theo QUÃNG ĐƯỜNG đã đi, không theo đồng hồ: đứng im thì đứng
  // yên thật, chạy nhanh thì chân đảo nhanh, và một con bị đóng băng không tự múa.
  const CYCLE = [0, 1, 2, 1];
  function colFor(e) {
    let moved = 0;
    if (e._sx !== undefined) moved = Math.hypot(e.x - e._sx, e.y - e._sy);
    e._sx = e.x; e._sy = e.y;
    // _sc = khung chân đang dùng. Ghi lại để kiểm được bằng máy: so ảnh chụp thì
    // hai lần vẽ y hệt nhau vẫn ra pixel khác nhau (trình duyệt đổi cách thu nhỏ
    // sau vài khung đầu), nên bài test phải hỏi thẳng khung nào chứ không so ảnh.
    if (moved < 0.05) { e._sc = 1; return 1; }
    e._sd = (e._sd || 0) + moved;
    e._sc = CYCLE[Math.floor(e._sd / 7) % 4];
    return e._sc;
  }

  // Con bot / người chơi nào là ai: Biệt Đội gắn charId cho từng xác, Ca Trực Đêm thì
  // không có nên rơi về bộ chung (một người dẫn + ba xác trong MATE_LOOK).
  function crewIdOf(a, isPlayer) {
    if (a.charId && crew[a.charId]) return a.charId;
    // Nhân vật chính của Ca Trực Đêm CHÍNH LÀ `bao` — Flare "Đèn Pin" bên Biệt Đội. Cũ thì
    // `lead` là một tệp riêng, nên cùng một người ra hai mặt tuỳ bản đang mở.
    if (isPlayer) return 'bao';
    const n = (a.id | 0) % 3;
    return crew[MATE_LOOK[n]] ? MATE_LOOK[n] : 'mate' + n;
  }

  // c ĐÃ dịch về chỗ đứng của nhân vật và CHƯA xoay. Hình đứng thẳng, không xoay theo
  // hướng — hướng nằm ở chỗ chọn hàng trong charset.
  function drawCrew(c, a, isPlayer) {
    const s = crew[crewIdOf(a, isPlayer)];
    if (!s) return false;
    const w = FW * CREW_SCALE, h = FH * CREW_SCALE;
    // TẮT khử răng cưa. Đo bằng phương sai sai phân bậc hai trên chính ô hình đang vẽ:
    // tắt được 417, bật 336, bật ở mức "high" chỉ 250 — tức là bật lên thì trình duyệt
    // trộn nhoè các ô vuông của tranh pixel. Vẽ to lên (CREW_SCALE) là thứ bù lại phần
    // răng cưa mà chú thích cũ lo, vì tỉ lệ thu nhỏ đã gần 1 hơn nhiều.
    c.imageSmoothingEnabled = false;
    c.drawImage((a.hurt || 0) > 0 ? s.hurt : s.img, colFor(a) * FW, rowFor(a.dir) * FH, FW, FH,
      Math.round(-w / 2), Math.round(8 - h), w, h);
    return true;
  }

  function drawFoe(c, m, d) {
    const s = foe[foeArt(m.type)];
    if (!s) return false;
    const src = (m.flash || 0) > 0 ? s.flash : s.cv;
    const w = s.cw * FOE_SCALE, h = s.ch * FOE_SCALE;
    const feet = (s.ch - s.pad) * FOE_SCALE;
    c.imageSmoothingEnabled = false;   // cùng lý do như bên người, xem drawCrew
    c.drawImage(src, colFor(m) * s.cw, rowFor(m.dir) * s.ch, s.cw, s.ch,
      Math.round(-w / 2), Math.round(9 - feet), w, h);

    // Ba tín hiệu cũ phải giữ nguyên, chỉ dời lên cho khỏi bị hình che:
    // đang ngủ, đang đuổi, và cú choáng của Kẻ húc.
    const top = -h + 12;   // đơn vị thế giới, không đổi theo SRC
    if (m.sleep > 0) {
      c.font = '600 10px ui-monospace, monospace';
      c.fillStyle = 'rgba(160,200,230,0.9)';
      c.fillText('z', 5, top - 2);
      c.strokeStyle = 'rgba(150,190,220,0.9)'; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(-4, top + 3); c.lineTo(-1.6, top + 3);
      c.moveTo(1.6, top + 3); c.lineTo(4, top + 3); c.stroke();
    } else if (m.state === 'chase' || m.rook === 'wind' || m.rook === 'dash') {
      c.fillStyle = (d && d.eye) || '#ff6a4e';
      c.beginPath(); c.arc(0, top + 2, 3.2, 0, Math.PI * 2); c.fill();
    }
    if (m.rook === 'stun') {
      c.strokeStyle = 'rgba(230,200,120,0.9)'; c.lineWidth = 1.4;
      c.beginPath(); c.arc(0, top - 2, 4.5, 0, Math.PI * 2); c.stroke();
    }
    return true;
  }

  root.REPO_SKIN = {
    crew: drawCrew,
    halo: drawCrewHalo,
    foe: drawFoe,
    loot: lootIcon,
    lamp: lamp,
    ready: function () { return pending === 0; },
    failed: function () { return failed; },
    have: function () { return Object.keys(crew).length + Object.keys(foe).length; },
    frame: function (e) { return e._sc; },
    // Xác nào đang được mượn cho một con bot. Mở ra để kiểm được bằng máy: so ảnh
    // chụp thì hai lần vẽ y hệt nhau vẫn ra pixel khác nhau, nên phải hỏi thẳng tên.
    look: function (a, isPlayer) { return crewIdOf(a, !!isPlayer); },
    // Đường dẫn tấm hình THÔ, cho những chỗ vẽ bằng HTML chứ không bằng canvas (bảng wiki).
    // Trả cả VER để bảng không kẹt lại ở tấm hình cũ trong cache như art trong game từng bị.
    foeUrl:  function (type) { return HERE + 'art/foe/'  + foeArt(type) + '.png' + VER; },
    crewUrl: function (id)   { return HERE + 'art/crew/' + id           + '.png' + VER; },
    // Kích thước MỘT khung trong tấm charset thô: 3 cột (trái/đứng/phải) x 4 hàng (hướng).
    cell: { w: FW, h: FH, cols: COLS, rows: ROWS }
  };
})(window);
