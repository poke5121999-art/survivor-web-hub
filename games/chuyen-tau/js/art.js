/*
 * CHUYẾN TÀU CUỐI — đường ống hình.
 *
 * Kho này có sẵn HAI đường ống, mỗi cái giải một việc khác nhau, và game này cần cả hai:
 *
 *   1. CHARSET 4 HƯỚNG (repo2d/art/) — file 288×576 chia 3 cột × 4 hàng, mỗi ô 96×144.
 *      Hàng = hướng nhìn (xuống/trái/phải/lên), cột = nhịp chân. Dùng cho NGƯỜI và QUÁI.
 *      WHY bắt buộc 4 hướng: đây là game nhìn từ trên xuống và người chơi đi lại trên
 *      nóc toa. Lật gương trái-phải kiểu dragonproj thì không có hình lưng và hình mặt,
 *      nên người chơi không biết mình đang quay về đâu — mà quay về đâu là thứ quyết
 *      định súng bắn ra hướng nào.
 *
 *   2. DẢI NGANG THEO MANIFEST (dragonproj/assets/) — mỗi mục tự khai w/h/ox/oy/frames.
 *      Dùng cho NỀN, VẬT TRANG TRÍ, ĐỒ VẬT, HIỆU ỨNG. Khuôn cứng 96×144 không nhét
 *      được một cái xương rồng 56×84 hay một tấm nền 256×256.
 *
 * Và ba thứ bê nguyên từ repo2d vì chúng là bản vá cho lỗi thật:
 *   - `?v=` lấy từ chính thẻ script rồi đóng vào MỌI url ảnh. Không có nó thì đổi cả bộ
 *     hình mà GitHub Pages vẫn trả bản cũ, im lặng, tới mười phút.
 *   - Nướng sẵn viền lúc nạp (một lần cho cả bộ), không nướng mỗi khung.
 *   - Khử răng cưa TẮT ở MỌI hàm vẽ. Đo bằng phương sai sai phân bậc hai trên đúng ô
 *     hình đang vẽ: tắt được 417, bật 336, bật ở mức 'high' chỉ 250.
 *
 * Thiếu ảnh thì hàm vẽ trả FALSE và bên gọi tự vẽ hình khối. Một hiệu ứng thiếu thì
 * mất đẹp; một hiệu ứng NÉM LỖI thì mất cả khung hình.
 */
(function (root) {
  'use strict';

  const CT = root.CT;
  const A = CT.ART = {};

  // --- chống cache ------------------------------------------------------------
  const VER = (function () {
    try {
      const s = document.currentScript && document.currentScript.src;
      const m = s && s.match(/[?&]v=([^&]+)/);
      return m ? m[1] : '';
    } catch (e) { return ''; }
  })();
  const q = u => VER ? (u + (u.indexOf('?') < 0 ? '?' : '&') + 'v=' + VER) : u;

  // Ảnh dùng chung với hai game kia. Đường dẫn tương đối từ games/chuyen-tau/.
  const R2D = '../repo2d/art/';
  const DP  = '../dragonproj/assets/spr/';

  // --- khuôn charset ----------------------------------------------------------
  const SRC = 3;                       // file lưu gấp 3 cỡ thật
  const FW = 32 * SRC, FH = 48 * SRC;  // 96 × 144
  const COLS = 3, ROWS = 4;
  const DOWN = 0, LEFT = 1, RIGHT = 2, UP = 3;
  const CYCLE = [0, 1, 2, 1];          // ping-pong, cột 1 là đứng
  A.cell = { w: FW, h: FH, cols: COLS, rows: ROWS };

  // Người vẽ nhỏ hơn quái. Cả hai là hệ số THU NHỎ vì file lưu gấp ba.
  const MAN_SCALE = 0.82 / SRC;
  const FOE_SCALE = 1.02 / SRC;

  const RIM = 4;
  const RIM_COLOR = '#ff3b30';

  // --- kho ảnh ----------------------------------------------------------------
  const sheets = {};       // key -> { img, ok, rim, halo, pad }
  const strips = {};       // key -> { img, ok, w, h, frames, ox, oy, fps, loop }
  A.failed = [];

  function loadImg(url, onOk) {
    const im = new Image();
    im.onload = () => onOk(im);
    im.onerror = () => { A.failed.push(url); };
    im.src = q(url);
    return im;
  }

  // Nướng viền: vẽ hình 12 lần lệch quanh tâm, tô đỏ bằng source-in, rồi dán hình gốc
  // lên trên. Làm MỘT LẦN lúc nạp, không làm mỗi khung.
  function bakeRim(img) {
    const p = RIM;
    const c = document.createElement('canvas');
    c.width = img.width + p * 2; c.height = img.height + p * 2;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      x.drawImage(img, p + Math.cos(a) * p, p + Math.sin(a) * p);
    }
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = RIM_COLOR;
    x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'source-over';
    x.drawImage(img, p, p);
    return c;
  }

  // Nướng bóng TRẮNG của cả tấm — dùng cho cú nhấp trắng lúc trúng đòn.
  //
  // WHY không dùng ctx.filter: iOS Safari TẮT MẶC ĐỊNH thuộc tính đó từ bản 18.0, và
  // không hỗ trợ gì ở 3.2–17.7. Game này chạy trên điện thoại, nên dùng filter nghĩa là
  // mọi iPhone không thấy hiệu ứng — im lặng, không lỗi console, không ai biết.
  // Cách chạy được mọi nơi là 'source-atop' trên một canvas RIÊNG (gọi trên canvas
  // chính thì nó tô trắng cả màn hình), và nướng sẵn thì lúc chạy chỉ còn drawImage.
  function bakeWhite(img) {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, c.width, c.height);
    return c;
  }

  // Nướng một bản ĐỔI BẢNG MÀU của cả tấm. Dùng cho xác sống: kho không có lấy một
  // tấm zombie nào (tra hết 6 tấm foe của repo2d và 294 tệp spr của dragonproj), nên
  // xác sống phải mượn charset NGƯỜI — và một xác sống trông y hệt một người sống thì
  // người chơi không phân biệt được cái gì đang đuổi mình với cái gì mình đang cứu.
  //
  // Công thức: 'multiply' phủ màu lên cả tấm rồi 'destination-in' cắt lại theo đúng mặt
  // nạ alpha của ảnh gốc. Bước cắt là BẮT BUỘC — 'multiply' là chế độ HOÀ TRỘN chứ
  // không phải chế độ GHÉP, nên nó tô màu vào cả vùng trong suốt và bỏ qua bước đó thì
  // được một khối chữ nhật đặc.
  //
  // KHÔNG dùng ctx.filter cho việc này, cùng lý do đã ghi ở bakeWhite: iOS Safari tắt
  // mặc định từ bản 18.0.
  function bakeTint(img, col) {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = 'multiply';
    x.fillStyle = col;
    x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(img, 0, 0);
    return c;
  }

  function addSheet(key, url, opt) {
    opt = opt || {};
    sheets[key] = { ok: false };
    loadImg(url, im0 => {
      const s = sheets[key];
      // Đổi màu TRƯỚC khi nướng viền và bóng trắng, để cả ba bản cùng một gốc.
      const im = opt.tint ? bakeTint(im0, opt.tint) : im0;
      s.img = im; s.ok = true;
      s.cw = im.width / COLS; s.ch = im.height / ROWS;
      s.white = bakeWhite(im);
      if (opt.rim) { s.rim = bakeRim(im); s.pad = RIM; }
    });
  }
  function addStrip(key, url, def) {
    strips[key] = Object.assign({ ok: false, frames: 1, fps: 14, loop: true }, def);
    loadImg(url, im => {
      const s = strips[key];
      s.img = im; s.ok = true;
      // Bề rộng khung đo TỪ ẢNH, không tin số trong bảng — ảnh vẽ đè cỡ khác vẫn chạy.
      s.w = im.width / s.frames;
      s.h = im.height;
      if (s.ox == null) s.ox = s.w / 2;
      if (s.oy == null) s.oy = s.h;
    });
  }

  // --- danh mục ---------------------------------------------------------------
  // Người chơi: mượn charset của hai game kia. Mỗi nhân vật khai `art` trong content.js.
  const MAN_IDS = ['mai', 'dung', 'phuc', 'khoi', 'linh', 'nga', 'van', 'hue', 'son', 'tam', 'bao', 'ky'];
  MAN_IDS.forEach(id => addSheet('man.' + id, R2D + 'crew/' + id + '.png'));

  // Quái: bốn tấm dùng được ngay. `gunner` là một tay súng đội mũ vành rộng cầm khẩu
  // lục chĩa ra ở cả mười hai khung — đúng bài cho một game Viễn Tây, không sửa gì.
  const FOE_ART = ['gunner', 'rook', 'mirror', 'banger', 'angel', 'gnome'];
  FOE_ART.forEach(id => addSheet('foe.' + id, R2D + 'foe/' + id + '.png', { rim: true }));
  // Xác sống không có tấm riêng trong cả kho, nên mượn charset người và ĐỔI BẢNG MÀU
  // lúc nạp (bakeTint). Màu chọn là một cái xám ngả lục nhạt: nhân vào thì da xuống
  // xanh tái, quần áo xuống bạc phếch, và cái bóng đen của thân vẫn còn — tức vẫn đọc
  // ra là một người, chỉ là một người đã chết. Đây là bản vá cho chỗ bản trước hứa
  // trong chú thích ('xem tintZombie') mà chưa bao giờ viết: hai con quái ĐÔNG NHẤT
  // game — Kẻ Lê Bước và Kẻ Chạy — vẫn đang hiện ra dưới hình một người sống bình thường.
  addSheet('foe.zombie', R2D + 'crew/ky.png', { rim: true, tint: '#8fae86' });

  // Đồ vật: dải ngang 96×96.
  addStrip('item.lantern', R2D + 'item/lantern.png',  { frames: 4, w: 96, h: 96, ox: 48, oy: 60, fps: 6 });
  addStrip('item.small',   R2D + 'item/loot-nho.png', { frames: 8, w: 96, h: 96, ox: 48, oy: 60, loop: false });
  addStrip('item.mid',     R2D + 'item/loot-vua.png', { frames: 8, w: 96, h: 96, ox: 48, oy: 60, loop: false });
  addStrip('item.big',     R2D + 'item/loot-to.png',  { frames: 5, w: 96, h: 96, ox: 48, oy: 60, loop: false });

  // Nền và vật trang trí sa mạc — lấy từ dragonproj, đã vá liền mạch sẵn.
  addStrip('bg.sand',   DP + 'BG_newgrass__c704_64_s_p6f5330d3b47e.png', { frames: 1, ox: 0, oy: 0 });
  addStrip('deco.cactus', DP + 'BG_cactus.png',    { frames: 1, ox: 25, oy: 76 });
  addStrip('deco.tree',   DP + 'BG_DeadTree.png',  { frames: 1, ox: 56, oy: 117 });
  addStrip('deco.fence',  DP + 'BG_fence1.png',    { frames: 1, ox: 19, oy: 21 });
  addStrip('deco.rockA',  DP + 'BG_floorstoneA.png', { frames: 1, ox: 3, oy: 5 });
  addStrip('deco.rockB',  DP + 'BG_floorstoneB.png', { frames: 1, ox: 5, oy: 9 });
  addStrip('deco.rockC',  DP + 'BG_floorstoneC.png', { frames: 1, ox: 4, oy: 8 });
  addStrip('deco.bush',   DP + 'BG_bush2.png',     { frames: 1, ox: 14, oy: 25 });
  addStrip('deco.wall',   DP + 'BG_stonewall1.png',{ frames: 1, ox: 48, oy: 47 });
  addStrip('deco.pillar', DP + 'BG_Pillar.png',    { frames: 2, ox: 14, oy: 45 });
  addStrip('item.crate',  DP + 'BG_ItemCrate.png', { frames: 1, ox: 14, oy: 36 });
  addStrip('item.coin',   DP + 'spr_holoCoin.png', { frames: 8, ox: 7, oy: 15, fps: 12 });

  // --- HIỆU ỨNG ---------------------------------------------------------------
  // Bộ PVFX Foundry Thirteen (nerijs), CC0 1.0. Khuôn: ô 96×96, xếp 5 cột, 50ms mỗi
  // khung = 20 khung/giây. `py` là CHÂN của hiệu ứng, lấy từ manifest gốc — vụ nổ neo ở
  // tâm (58) còn đám bụi neo ở đáy (70), nên vẽ cả hai từ giữa khung thì bụi lơ lửng
  // trên không cách mặt đất nửa ô.
  //
  // `lop`: 'sang' = tự phát sáng, vẽ ở lớp cộng sáng SAU khi đã nhân đèn.
  //        'toi'  = bụi và đất, vẽ cùng lớp với người, CHỊU ánh sáng. Rắc bụi vào lớp
  //                 cộng sáng thì nó thành một quầng vàng lơ lửng trong bóng tối — đọc
  //                 ra là phép thuật, không đọc ra là bụi.
  const VFX_F = 96, VFX_COLS = 5, VFX_FPS = 20;
  A.VFX_FPS = VFX_FPS;
  const VFX = {
    'no':       { file: 'warm-explosion',  n: 15, py: 58, lop: 'sang' },
    'no-lon':   { file: 'solar-shrapnel',  n: 14, py: 56, lop: 'sang' },
    'bui':      { file: 'landing-dust',    n: 14, py: 70, lop: 'toi'  },
    'nut-dat':  { file: 'earth-rupture',   n: 20, py: 71, lop: 'toi'  },
    'chem':     { file: 'crescent-slash',  n: 10, py: 50, lop: 'sang' },
    'dan':      { file: 'magical-projectile', n: 12, py: 50, lop: 'sang' },
    'trung':    { file: 'electric-impact', n: 13, py: 54, lop: 'sang' },
    'tia':      { file: 'beam-cutoff-burst', n: 11, py: 48, lop: 'sang' },
    'nong':     { file: 'ember-jet',       n: 14, py: 56, lop: 'sang', ox: 24 },
    'mau':      { file: 'acid-splash',     n: 14, py: 64, lop: 'toi', blood: true },
    'khoi':     { file: 'smoke-puff',      n: 14, py: 48, lop: 'toi'  },
    'hoi':      { file: 'radiant-heal',    n: 14, py: 67, lop: 'sang' },
    'khien':    { file: 'arcane-parry',    n: 16, py: 72, lop: 'sang' },
    'nap':      { file: 'focus-charge',    n: 13, py: 48, lop: 'sang' },
    'hut':      { file: 'void-implosion',  n: 14, py: 50, lop: 'sang' },
    'bang':     { file: 'frost-nova',      n: 13, py: 61, lop: 'sang' },
    'cong':     { file: 'rift-portal',     n: 16, py: 48, lop: 'sang', loop: true },
    'luoi':     { file: 'lattice-beam',    n: 16, py: 48, lop: 'sang', loop: true },
    'bay-len':  { file: 'spectral-bloom',  n: 16, py: 64, lop: 'sang' }
  };
  // ⚠ Bốn tấm dưới đây KHAI 14 khung nhưng chỉ có 11 hoặc 13 ô THẬT SỰ có hình — ba
  // khung cuối của beam-cutoff-burst là trống, tức 21% thời lượng chạy không. Số ở
  // bảng trên đã sửa: tia 11, trúng 13, nạp 13. Đo bằng cách đếm ô có pixel khác 0.
  A.VFX = VFX;
  Object.keys(VFX).forEach(k => {
    const v = VFX[k];
    v.key = 'vfx.' + k;
    sheets[v.key] = { ok: false };
    loadImg(R2D + 'vfx/' + v.file + '.png', im => {
      const s = sheets[v.key];
      s.img = im; s.ok = true;
      s.cw = VFX_F; s.ch = VFX_F;
    });
  });

  // ---------------------------------------------------------------------------
  // VẼ
  // ---------------------------------------------------------------------------
  function rowFor(dx, dy) {
    if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? LEFT : RIGHT;
    return dy < 0 ? UP : DOWN;
  }
  A.rowFor = rowFor;

  // Cột chọn theo QUÃNG ĐƯỜNG đã đi, không theo đồng hồ. Đứng im thì đứng yên thật,
  // chạy nhanh thì chân đảo nhanh, và một con đang bị choáng không tự múa.
  //
  // BƯỚC CHÂN LÀ MỘT SỐ RIÊNG CHO TỪNG CON, không phải hằng số 8 dùng chung.
  // ROOT-CAUSE của bản trước: một con đi 176 điểm ảnh mỗi giây với bước 8 thì đổi khung
  // 22 lần mỗi giây — 45ms một khung. Chuẩn của hoạt hoạ pixel là 80-150ms cho đi bộ và
  // 50-80ms cho chạy, nên 45ms không đọc ra là bước chân, nó đọc ra là RUNG. Còn con Kẻ
  // Lê Bước đi 46 điểm ảnh mỗi giây thì cùng bước 8 lại thành 174ms — lê thật, nhưng
  // chỉ là ăn may, không phải chủ ý.
  //
  // Cách chữa: suy bước chân TỪ TỐC ĐỘ DANH NGHĨA của con đó, sao cho khi nó chạy hết
  // sức thì cadence rơi đúng vào STEP_S. Chạy chậm hơn tốc độ danh nghĩa (vác xác, bị
  // làm chậm) thì chân tự chậm theo, vì colFor vẫn đo bằng quãng đường THẬT.
  const STEP_S = 0.105;              // giây mỗi khung chân ở tốc độ danh nghĩa
  A.stepLen = function (spd) {
    const v = spd * STEP_S;
    return v < 4.5 ? 4.5 : v > 26 ? 26 : v;
  };
  function colFor(dist, step) {
    return CYCLE[Math.floor(Math.abs(dist) / (step || 8)) % 4];
  }
  A.colFor = colFor;

  // Bóng đổ dưới chân. Trước bản này CHỈ cái xác và món đồ rơi có bóng, còn người sống
  // và quái thì không — nên nhân vật đứng trên cát mà đọc ra là một hình dán trôi trên
  // nền, không phải một người đứng trên mặt đất. Vẽ TRƯỚC thân, ở lớp thường (bóng chịu
  // ánh sáng chứ không tự phát sáng).
  A.shadow = function (c, x, y, rx, alpha) {
    c.save();
    c.globalAlpha = alpha == null ? 0.30 : alpha;
    c.fillStyle = '#000';
    c.beginPath();
    c.ellipse(x, y, rx, rx * 0.42, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  };

  A.have = key => !!(sheets[key] && sheets[key].ok) || !!(strips[key] && strips[key].ok);

  // Vẽ một người/quái. Trả false nếu chưa có ảnh — bên gọi tự vẽ hình khối.
  //   o = { x, y, dist, dirX, dirY, scale, flash (0..1), rim, tint }
  A.drawActor = function (c, key, o) {
    const s = sheets[key];
    if (!s || !s.ok) return false;
    const src = (o.rim && s.rim) ? s.rim : s.img;
    const pad = (o.rim && s.rim) ? s.pad : 0;
    const cw = s.cw + pad * 2, ch = s.ch + pad * 2;
    const col = o.col != null ? o.col : colFor(o.dist || 0, o.step);
    const row = o.row != null ? o.row : rowFor(o.dirX || 0, o.dirY || 1);
    const k = (o.scale || 1) * (o.foe ? FOE_SCALE : MAN_SCALE);
    const w = cw * k, h = ch * k;
    c.save();
    c.imageSmoothingEnabled = false;
    c.translate(o.x, o.y);
    if (o.squash) c.scale(o.squash.x, o.squash.y);
    if (o.rot) c.rotate(o.rot);
    if (o.alpha != null) c.globalAlpha = o.alpha;
    c.drawImage(src, col * cw, row * ch, cw, ch, -w / 2, -h + 6 * k, w, h);
    if (o.flash > 0 && s.white) {
      c.globalAlpha = (o.alpha != null ? o.alpha : 1) * o.flash;
      c.drawImage(s.white, col * s.cw, row * s.ch, s.cw, s.ch,
                  -w / 2 + pad * k, -h + 6 * k + pad * k, s.cw * k, s.ch * k);
    }
    c.restore();
    return true;
  };

  // Vẽ một dải ngang theo manifest.
  A.drawStrip = function (c, key, x, y, o) {
    const s = strips[key];
    if (!s || !s.ok) return false;
    o = o || {};
    let f = o.frame;
    if (f == null) {
      const ms = o.ms != null ? o.ms : 0;
      f = Math.floor(ms / 1000 * (o.fps || s.fps));
      f = (s.loop === false) ? Math.min(f, s.frames - 1) : (f % s.frames);
    }
    f = Math.max(0, Math.min(s.frames - 1, f | 0));
    const k = o.scale || 1;
    c.save();
    c.imageSmoothingEnabled = false;
    c.translate(x, y);
    if (o.rot) c.rotate(o.rot);
    if (o.flip) c.scale(-1, 1);
    if (o.alpha != null) c.globalAlpha = o.alpha;
    c.drawImage(s.img, f * s.w, 0, s.w, s.h,
                -s.ox * k, -s.oy * k, s.w * k, s.h * k);
    c.restore();
    return true;
  };

  // Lát nền bằng một ô liền mạch. Toạ độ cuộn đưa về số nguyên trước khi vẽ —
  // toạ độ lẻ bắt trình duyệt khử răng cưa thêm một lớp không ai yêu cầu.
  A.tile = function (c, key, ox, oy, w, h, scale) {
    const s = strips[key];
    if (!s || !s.ok) return false;
    const tw = s.w * (scale || 1), th = s.h * (scale || 1);
    let x0 = -(((ox % tw) + tw) % tw);
    let y0 = -(((oy % th) + th) % th);
    c.save();
    c.imageSmoothingEnabled = false;
    for (let y = y0; y < h; y += th)
      for (let x = x0; x < w; x += tw)
        c.drawImage(s.img, 0, 0, s.w, s.h, Math.floor(x), Math.floor(y),
                    Math.ceil(tw) + 1, Math.ceil(th) + 1);
    c.restore();
    return true;
  };

  // Vẽ một khung hiệu ứng. `t` tính bằng giây kể từ lúc nổ ra.
  A.drawVfx = function (c, id, x, y, t, o) {
    const v = VFX[id];
    if (!v) return false;
    const s = sheets[v.key];
    if (!s || !s.ok) return false;
    o = o || {};
    let i = Math.floor(t * (o.fps || VFX_FPS));
    if (v.loop) i %= v.n; else if (i >= v.n) return true;   // đã tắt, coi như xong
    const k = o.scale || 1;
    const w = VFX_F * k, h = VFX_F * k;
    const px = (v.ox != null ? v.ox : VFX_F / 2);
    c.save();
    c.imageSmoothingEnabled = false;
    c.translate(x, y);
    if (o.rot) c.rotate(o.rot);
    if (o.alpha != null) c.globalAlpha = o.alpha;
    c.drawImage(s.img, (i % VFX_COLS) * VFX_F, ((i / VFX_COLS) | 0) * VFX_F, VFX_F, VFX_F,
                -px * k, -v.py * k, w, h);
    c.restore();
    return true;
  };
  A.vfxDur = id => VFX[id] ? VFX[id].n / VFX_FPS : 0;
  A.vfxLayer = id => (VFX[id] && VFX[id].lop) || 'sang';

  // Vũng máu in xuống nền. Dùng khung CUỐI của tấm toé, đổi sang đỏ.
  //
  // WHY tấm acid-splash: nó là một cú toé CÓ GIỌT BẮN — đúng hình dạng của máu, chỉ sai
  // màu. Bộ này là CC0 nên đổi bảng màu thoải mái. Đây là món duy nhất trong danh mục
  // VFX mà kho không có sẵn, và cũng là món rẻ nhất để lấp.
  A.stampBlood = function (c, x, y, r, seed) {
    const v = VFX['mau'];
    const s = sheets[v.key];
    c.save();
    c.translate(x, y);
    c.rotate(seed * 6.28);
    c.globalAlpha = 0.55;
    if (s && s.ok) {
      const i = v.n - 2;
      const k = r / 34;
      // Đỏ hoá: vẽ tấm rồi phủ đỏ bằng source-atop trên canvas phụ đã nướng sẵn.
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = '#7a1414';
      c.imageSmoothingEnabled = false;
      c.drawImage(s.img, (i % VFX_COLS) * VFX_F, ((i / VFX_COLS) | 0) * VFX_F, VFX_F, VFX_F,
                  -VFX_F / 2 * k, -VFX_F / 2 * k, VFX_F * k, VFX_F * k);
    } else {
      c.fillStyle = '#5e1010';
      for (let i = 0; i < 5; i++) {
        const a = seed * 9 + i * 1.3, d = r * (0.2 + (i % 3) * 0.28);
        c.beginPath();
        c.ellipse(Math.cos(a) * d, Math.sin(a) * d * 0.55, r * 0.4, r * 0.24, a, 0, 6.283);
        c.fill();
      }
    }
    c.restore();
  };

  // ---------------------------------------------------------------------------
  // CON SÓI — vẽ 100% bằng mã, giống đoàn tàu, và vì cùng một lý do.
  // ---------------------------------------------------------------------------
  // Cả kho không có một con vật bốn chân nào: 6 tấm trong repo2d/art/foe/ và 294 tệp
  // trong dragonproj/assets/spr/ đều là hình NGƯỜI hoặc đồ vật. Bản trước cho Sói Hoang
  // mượn tấm `rook` — cùng tấm với Con Húc — nên một BẦY BỐN CON sói hiện ra dưới hình
  // bốn người, và người chơi đọc chúng là bốn Con Húc nhỏ. Sai cả loài lẫn cách đánh:
  // Con Húc lao một đường thẳng có báo trước, sói thì bâu vào từ bốn phía.
  //
  // Thứ phân biệt một con thú với một con người ở góc nhìn từ trên xuống là BÓNG DÁNG,
  // không phải chi tiết: người thì cao và hẹp, thú thì DÀI và THẤP. Nên hình này dựng
  // trên một thân dài gấp đôi bề ngang, nằm sát đất, mũi chúc về hướng đi.
  //
  // Bốn chân đảo theo QUÃNG ĐƯỜNG như charset, không theo đồng hồ — cùng một luật với
  // colFor, nên một con sói bị ghim chân thì đứng yên thật.
  A.wolf = function (c, x, y, dirX, dirY, dist, o) {
    o = o || {};
    // 1,35 chứ không phải 1,15: đo trên ảnh chụp thật, ở cỡ cũ con sói dài 31 điểm ảnh
    // trên màn 390 và nằm cạnh Con Húc cao 49 — nó đọc ra là một vệt bẩn chứ không phải
    // một con vật. Thú bốn chân vốn THẤP, nên bù lại bằng chiều DÀI, không bằng chiều cao.
    const k = (o.scale || 1) * 1.35;
    const a = Math.atan2(dirY || 0, dirX || -1);
    const alpha = o.alpha == null ? 1 : o.alpha;
    const ph = (dist || 0) / 9;              // nhịp chân
    const sw = Math.sin(ph);                 // chân trước trái / sau phải
    const L = 15 * k, W = 7.4 * k;           // nửa thân: dài gấp đôi bề ngang

    c.save();
    c.translate(x, y);
    c.globalAlpha = alpha;
    c.rotate(a);

    // Viền đỏ: quy ước "đây là địch" của cả game. Vẽ bằng một lớp thân PHÌNH RA nằm
    // dưới, không bằng stroke — stroke trên bảy hình rời thì các đường viền cắt qua
    // nhau ở mọi khớp.
    c.fillStyle = '#ff3b30';
    c.beginPath(); c.ellipse(0, 0, L + 3, W + 3, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(L * 0.86, 0, 8.2 * k, 7.2 * k, 0, 0, Math.PI * 2); c.fill();

    // Đuôi — cong ra sau, ve vẩy nhẹ theo nhịp chân.
    c.strokeStyle = '#5a5145';
    c.lineWidth = 4.4 * k; c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-L * 0.9, 0);
    c.quadraticCurveTo(-L * 1.5, sw * 4 * k, -L * 1.9, sw * 8 * k);
    c.stroke();

    // Bốn chân. Hai cặp lệch pha nửa vòng — đó là dáng chạy nước kiệu của loài bốn chân.
    c.fillStyle = '#453d33';
    const leg = (lx, ly, s) => {
      c.beginPath();
      c.ellipse(lx + s * 3.4 * k, ly, 3.1 * k, 2.3 * k, 0, 0, Math.PI * 2);
      c.fill();
    };
    leg(L * 0.55, -W * 0.85,  sw);
    leg(L * 0.55,  W * 0.85, -sw);
    leg(-L * 0.55, -W * 0.85, -sw);
    leg(-L * 0.55,  W * 0.85,  sw);

    // Thân: lưng sẫm, bụng nhạt — cho ra khối, không phải một vết dán phẳng.
    c.fillStyle = '#6f6454';
    c.beginPath(); c.ellipse(0, 0, L, W, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#9a8d78';
    c.beginPath(); c.ellipse(-L * 0.1, W * 0.3, L * 0.8, W * 0.5, 0, 0, Math.PI * 2); c.fill();

    // Đầu, tai, mõm.
    const hx = L * 0.86;
    c.fillStyle = '#7d7160';
    c.beginPath(); c.ellipse(hx, 0, 7 * k, 6 * k, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#4e463b';
    [-1, 1].forEach(sgn => {
      c.beginPath();
      c.moveTo(hx - 1 * k, sgn * 5.4 * k);
      c.lineTo(hx - 4.6 * k, sgn * 8.6 * k);
      c.lineTo(hx + 1.6 * k, sgn * 7.6 * k);
      c.closePath(); c.fill();
    });
    c.fillStyle = '#2b251f';
    c.beginPath(); c.ellipse(hx + 6 * k, 0, 3.6 * k, 2.6 * k, 0, 0, Math.PI * 2); c.fill();
    // Sống lưng sáng chạy dọc thân. Đây là thứ tách con vật ra khỏi cái bóng đổ của
    // chính nó khi nó đi qua chỗ tối — một khối một màu thì dù đúng bóng dáng vẫn đọc
    // ra là một vệt bẩn.
    c.fillStyle = '#8e8270';
    c.beginPath(); c.ellipse(-L * 0.05, -W * 0.34, L * 0.72, W * 0.22, 0, 0, Math.PI * 2); c.fill();

    // Mắt: chỉ sáng khi con này ĐANG THỨC. Một bầy sói đang ngủ mà mắt vẫn cháy vàng
    // thì cái dấu 'z' bên trên nói một đằng, cái mặt nói một nẻo.
    if (!o.sleep) {
      c.fillStyle = '#ffcf6a';
      [-1, 1].forEach(sgn => {
        c.beginPath();
        c.ellipse(hx + 2.6 * k, sgn * 2.7 * k, 1.5 * k, 1.1 * k, 0, 0, Math.PI * 2);
        c.fill();
      });
    }

    // Nhấp trắng lúc trúng đòn — cùng ngôn ngữ với drawActor, làm bằng một lớp phủ
    // theo đúng bóng dáng thân chứ không phải một vòng tròn.
    if (o.flash > 0) {
      c.globalAlpha = alpha * o.flash;
      c.fillStyle = '#fff';
      c.beginPath(); c.ellipse(0, 0, L, W, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(hx, 0, 7 * k, 6 * k, 0, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  };

  // Hình khối vẽ tay — đường lui khi thiếu ảnh, và là hình chính thức của mấy thứ
  // KHÔNG có ảnh trong cả kho (than, vỏ đạn, vết đạn).
  A.coal = function (c, x, y, r) {
    c.save(); c.translate(x, y);
    c.fillStyle = '#15161a';
    c.beginPath();
    c.moveTo(-r, r * 0.2); c.lineTo(-r * 0.5, -r); c.lineTo(r * 0.6, -r * 0.7);
    c.lineTo(r, r * 0.3); c.lineTo(r * 0.1, r); c.closePath(); c.fill();
    c.fillStyle = '#3c3f46';
    c.beginPath(); c.moveTo(-r * 0.4, -r * 0.5); c.lineTo(r * 0.1, -r * 0.6);
    c.lineTo(-r * 0.1, 0); c.closePath(); c.fill();
    c.restore();
  };
  A.shell = function (c, x, y, rot, a) {
    c.save(); c.translate(x, y); c.rotate(rot); c.globalAlpha = a;
    c.fillStyle = '#c8a03c'; c.fillRect(-3, -1.2, 6, 2.4);
    c.fillStyle = '#e8c86a'; c.fillRect(-3, -1.2, 2, 2.4);
    c.restore();
  };

  A.ready = () => Object.keys(sheets).every(k => sheets[k].ok || A.failed.length);

})(window);
