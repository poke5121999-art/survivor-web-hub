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
  const RIM = 2 * SRC, RIM_COLOR = '#ff3b30';
  const CREW_SCALE = 0.55 / SRC, FOE_SCALE = 0.80 / SRC;   // quái to hơn người khoảng 1,45 lần
  const DOWN = 0, LEFT = 1, RIGHT = 2, UP = 3;

  // Đường dẫn tính từ trang đang mở: Ca Trực Đêm mở games/repo2d/, Biệt Đội mở
  // games/repo-squad/ nhưng nạp chung file này, nên phải suy ra từ src của thẻ script.
  const HERE = (function () {
    const s = document.currentScript;
    if (s && s.src) return s.src.replace(/[^/]*(\?.*)?$/, '');
    return 'games/repo2d/';
  })();

  const crew = Object.create(null);
  const foe = Object.create(null);
  let pending = 0, failed = 0;

  const CREW_IDS = ['lead', 'mate0', 'mate1', 'mate2',
    'bao', 'hue', 'tam', 'ky', 'linh', 'dung', 'mai', 'phuc', 'son',
    'nga', 'khoi', 'van', 'hai', 'tuyet'];

  // Ba con bot của Ca Trực Đêm ("Tổ 2/3/4") không có xác riêng nên trước đây dùng
  // mate0/1/2 — bộ kê chỗ do code sinh ra. Cho chúng mượn ba xác đã có hình vẽ tay,
  // thứ tự cố định để cùng một con bot luôn ra cùng một mặt trong mọi ván.
  // mate0/1/2 vẫn nằm lại làm lưới đỡ: thiếu file vẽ tay thì rơi về đó, không vỡ màn.
  const MATE_LOOK = ['bao', 'hue', 'tam'];
  const FOE_IDS = ['patrol', 'listen', 'stalk', 'bomber', 'heavy', 'rook', 'angel'];

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

  function load(url, done) {
    pending++;
    const img = new Image();
    img.onload = function () { pending--; done(img); };
    img.onerror = function () { pending--; failed++; };
    img.src = url;
  }

  CREW_IDS.forEach(function (id) {
    load(HERE + 'art/crew/' + id + '.png', function (im) {
      // Bản đỏ: engine cũ nháy đỏ cả người khi vừa ăn đòn, giữ lại tín hiệu đó.
      crew[id] = { img: im, hurt: tinted(im, 'rgba(214,88,74,.62)') };
    });
  });
  FOE_IDS.forEach(function (id) {
    load(HERE + 'art/foe/' + id + '.png', function (im) { foe[id] = bakeRim(im); });
  });

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
    if (isPlayer) return 'lead';
    const n = (a.id | 0) % 3;
    return crew[MATE_LOOK[n]] ? MATE_LOOK[n] : 'mate' + n;
  }

  // c ĐÃ dịch về chỗ đứng của nhân vật và CHƯA xoay. Hình đứng thẳng, không xoay theo
  // hướng — hướng nằm ở chỗ chọn hàng trong charset.
  function drawCrew(c, a, isPlayer) {
    const s = crew[crewIdOf(a, isPlayer)];
    if (!s) return false;
    const w = FW * CREW_SCALE, h = FH * CREW_SCALE;
    // Bật khử răng cưa: bộ hình là tranh vẽ tay đã thu nhỏ, không phải lưới ô vuông
    // vẽ đúng từng pixel — tắt đi thì mỗi lần thu tỉ lệ lẻ là rụng mất nét.
    c.imageSmoothingEnabled = true;
    c.drawImage((a.hurt || 0) > 0 ? s.hurt : s.img, colFor(a) * FW, rowFor(a.dir) * FH, FW, FH,
      Math.round(-w / 2), Math.round(8 - h), w, h);
    return true;
  }

  function drawFoe(c, m, d) {
    const s = foe[m.type];
    if (!s) return false;
    const src = (m.flash || 0) > 0 ? s.flash : s.cv;
    const w = s.cw * FOE_SCALE, h = s.ch * FOE_SCALE;
    const feet = (s.ch - s.pad) * FOE_SCALE;
    c.imageSmoothingEnabled = true;
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
    foe: drawFoe,
    ready: function () { return pending === 0; },
    failed: function () { return failed; },
    have: function () { return Object.keys(crew).length + Object.keys(foe).length; },
    frame: function (e) { return e._sc; },
    // Xác nào đang được mượn cho một con bot. Mở ra để kiểm được bằng máy: so ảnh
    // chụp thì hai lần vẽ y hệt nhau vẫn ra pixel khác nhau, nên phải hỏi thẳng tên.
    look: function (a, isPlayer) { return crewIdOf(a, !!isPlayer); }
  };
})(window);
