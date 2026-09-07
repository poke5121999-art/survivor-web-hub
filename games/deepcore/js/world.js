/*
 * world.js — sinh hang + vẽ hang + đục tường.
 *
 * Trộn hai công thức:
 *   Core Keeper  đá đặc là mặc định, hang là thứ được KHOÉT ra; vỉa quặng mọc
 *                thành cụm trong đá chứ không rải đều; biome loang vào nhau
 *                bằng mảng chứ không có đường kẻ.
 *   DRG:Survivor phòng có chủ đích (POI) nối bằng hành lang, để nhiệm vụ có chỗ
 *                mà đặt và để người chơi luôn có một hướng đi rõ ràng.
 *
 * Vẽ theo Ô VUÔNG 16px, đệm sẵn theo khối 16x16 ô. Không đệm thì mỗi khung phải
 * vẽ ~400 ô kèm viền và bóng — máy điện thoại không chịu nổi ở 60 khung/giây.
 */
(function (G) {
  'use strict';

  var T = 16;                       // một ô = 16px art
  var CH = 16;                      // một khối đệm = 16x16 ô

  var FLOOR = 0, WALL = 1, ORE = 2, ROCK = 3, LIQ = 4;

  function World() {}

  World.prototype.init = function (w, h, biomeId, seed) {
    this.W = w; this.H = h;
    this.seed = seed;
    this.rng = new G.Rng(seed);
    this.biomeId = biomeId;
    this.bio = G.BIOME[biomeId] || G.BIOMES[0];
    this.subBio = G.BIOME[this.bio.sub] || this.bio;

    var n = w * h;
    this.kind = new Uint8Array(n);
    this.ore = new Uint8Array(n);      // 0 = không có; ngược lại là chỉ số trong oreList
    this.hp = new Float32Array(n);
    this.hpMax = new Float32Array(n);
    this.sub = new Uint8Array(n);      // 1 = thuộc mảng quần thể phụ
    this.seen = new Uint8Array(n);     // đã lộ trên bản đồ nhỏ
    this.deco = new Uint8Array(n);     // 0 = trống, >0 là biến thể trang trí + 1
    this.oreList = this.bio.ores.slice();

    this.chunksX = Math.ceil(w / CH);
    this.chunksY = Math.ceil(h / CH);
    this.chunks = new Array(this.chunksX * this.chunksY);

    this.rooms = [];
    this.hazards = [];
    this.caches = [];                  // hốc kín chôn sâu, đục tới mới thấy
    this.depth = new Int16Array(n);    // độ sâu ô đá tính từ hang gần nhất
    return this;
  };

  World.prototype.idx = function (x, y) { return y * this.W + x; };
  World.prototype.inside = function (x, y) {
    return x >= 0 && y >= 0 && x < this.W && y < this.H;
  };
  World.prototype.at = function (x, y) {
    if (!this.inside(x, y)) return ROCK;
    return this.kind[y * this.W + x];
  };
  /* Chặn đường đi? Chất lỏng KHÔNG chặn (lội được, chỉ chậm và đau). */
  World.prototype.solid = function (x, y) {
    var k = this.at(x, y);
    return k === WALL || k === ORE || k === ROCK;
  };
  World.prototype.diggable = function (x, y) {
    var k = this.at(x, y);
    return k === WALL || k === ORE;
  };

  // ---------------------------------------------------------------- sinh hang

  World.prototype.generate = function (level) {
    var r = this.rng, W = this.W, H = this.H, i, x, y;
    var n = W * H;
    for (i = 0; i < n; i++) this.kind[i] = WALL;

    // 1) Rải phòng. Ô vào nằm ở đáy bản đồ: màn hình dọc nên đi lên là thuận mắt.
    var roomN = 13 + Math.min(7, (level / 3) | 0);
    var tries = 0;
    var minD = 15;
    // Cach mep duoi it nhat 20 o: camera bi chan o bien, dat sat qua thi nguoi
    // choi tut xuong day man hinh va khong thay duoc gi phia truoc.
    this.rooms.push({ x: (W / 2) | 0, y: H - 20, r: 7, kind: 'start' });
    while (this.rooms.length < roomN && tries < 900) {
      tries++;
      x = r.i(9, W - 10); y = r.i(7, H - 8);
      var ok = true;
      for (i = 0; i < this.rooms.length; i++) {
        var d = Math.hypot(this.rooms[i].x - x, this.rooms[i].y - y);
        if (d < minD) { ok = false; break; }
      }
      if (ok) this.rooms.push({ x: x, y: y, r: r.i(4, 8), kind: 'cave' });
    }

    // 2) Khoét từng phòng bằng "giun bò": vài đường đi lảo đảo, mỗi bước quét
    //    một hình tròn. Ra hang méo mó chứ không ra hình tròn công nghiệp.
    for (i = 0; i < this.rooms.length; i++) this.carveRoom(this.rooms[i]);

    // 3) Nối phòng. Mỗi phòng nối về phòng GẦN NHẤT đã nằm trong mạng — đủ để
    //    không có phòng mồ côi, mà vẫn không thành lưới ô vuông.
    var linked = [0], rest = [];
    for (i = 1; i < this.rooms.length; i++) rest.push(i);
    while (rest.length) {
      var bi = 0, bj = 0, bd = 1e9;
      for (i = 0; i < rest.length; i++) {
        for (var j = 0; j < linked.length; j++) {
          var a = this.rooms[rest[i]], b = this.rooms[linked[j]];
          var dd = Math.hypot(a.x - b.x, a.y - b.y);
          if (dd < bd) { bd = dd; bi = i; bj = j; }
        }
      }
      this.carveCorridor(this.rooms[rest[bi]], this.rooms[linked[bj]]);
      linked.push(rest[bi]);
      rest.splice(bi, 1);
    }
    // Vài đường vòng để hang có nhánh chạy trốn, không phải cây một chiều.
    for (i = 0; i < 3 + (level / 4 | 0); i++) {
      var a2 = r.pick(this.rooms), b2 = r.pick(this.rooms);
      if (a2 !== b2) this.carveCorridor(a2, b2);
    }

    // 4) Làm mềm mép: ô sàn mà quanh nó gần như toàn đá thì lấp lại, ô đá mà
    //    quanh nó gần như toàn sàn thì đục ra. Xoá hết góc vuông của bước 2-3.
    this.smooth(2);

    // 5) Viền đá gốc, không ai đục thủng ra ngoài bản đồ được.
    for (x = 0; x < W; x++) for (y = 0; y < H; y++) {
      if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) this.kind[this.idx(x, y)] = ROCK;
    }

    // 6) Mảng quần thể phụ: một vệt loang quanh một phòng ở xa ô vào.
    var far = this.rooms[this.rooms.length - 1];
    for (i = 1; i < this.rooms.length; i++) {
      if (this.rooms[i].y < far.y) far = this.rooms[i];
    }
    this.paintSub(far.x, far.y, 22 + r.i(0, 8));

    // 7) Vỉa quặng + hốc kín + máu ô tường.
    this.seedOres(level);
    this.placeCaches(level);
    this.rollHp();

    // 8) Trang trí sàn + mối nguy.
    this.decorate();
    this.placeHazards(level);
    return this;
  };

  World.prototype.carveRoom = function (room) {
    var r = this.rng;
    var worms = 2 + r.i(0, 2);
    for (var w = 0; w < worms; w++) {
      var x = room.x, y = room.y;
      var a = r.f(0, Math.PI * 2);
      var steps = room.r * 3 + r.i(0, 10);
      for (var s = 0; s < steps; s++) {
        this.disc(x, y, r.f(1.6, room.r * 0.55));
        a += r.f(-0.7, 0.7);
        x += Math.cos(a) * 1.4;
        y += Math.sin(a) * 1.4;
        if (x < 4 || y < 4 || x > this.W - 5 || y > this.H - 5) break;
      }
    }
    this.disc(room.x, room.y, room.r * 0.7);
  };

  World.prototype.carveCorridor = function (a, b) {
    var r = this.rng;
    var x = a.x, y = a.y;
    var guard = 0;
    while ((Math.abs(x - b.x) > 1 || Math.abs(y - b.y) > 1) && guard++ < 4000) {
      // Đi giật cấp về phía đích, thêm nhiễu để hành lang không thẳng băng.
      if (r.chance(0.5)) x += Math.sign(b.x - x) || 0;
      else y += Math.sign(b.y - y) || 0;
      if (r.chance(0.12)) { x += r.i(-1, 1); y += r.i(-1, 1); }
      x = Math.max(3, Math.min(this.W - 4, x));
      y = Math.max(3, Math.min(this.H - 4, y));
      this.disc(x, y, r.f(1.3, 2.3));
    }
  };

  World.prototype.disc = function (cx, cy, rad) {
    var r2 = rad * rad;
    var x0 = Math.max(1, Math.floor(cx - rad)), x1 = Math.min(this.W - 2, Math.ceil(cx + rad));
    var y0 = Math.max(1, Math.floor(cy - rad)), y1 = Math.min(this.H - 2, Math.ceil(cy + rad));
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        var dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= r2) this.kind[this.idx(x, y)] = FLOOR;
      }
    }
  };

  World.prototype.smooth = function (passes) {
    var W = this.W, H = this.H;
    for (var p = 0; p < passes; p++) {
      var src = this.kind.slice();
      for (var y = 2; y < H - 2; y++) {
        for (var x = 2; x < W - 2; x++) {
          var open = 0;
          for (var j = -1; j <= 1; j++) {
            for (var i = -1; i <= 1; i++) {
              if (i === 0 && j === 0) continue;
              if (src[(y + j) * W + (x + i)] === FLOOR) open++;
            }
          }
          var k = this.idx(x, y);
          if (src[k] === FLOOR && open <= 1) this.kind[k] = WALL;
          else if (src[k] === WALL && open >= 7) this.kind[k] = FLOOR;
        }
      }
    }
  };

  World.prototype.paintSub = function (cx, cy, rad) {
    var r = this.rng;
    for (var y = Math.max(0, cy - rad); y < Math.min(this.H, cy + rad); y++) {
      for (var x = Math.max(0, cx - rad); x < Math.min(this.W, cx + rad); x++) {
        var d = Math.hypot(x - cx, y - cy) / rad;
        // Mép loang chứ không phải đường tròn: xác suất giảm dần + nhiễu.
        if (d < 1 && r.chance(1 - d * d * 0.85)) this.sub[this.idx(x, y)] = 1;
      }
    }
  };

  /* Vỉa quặng mọc thành CỤM, và chỉ mọc ở ô đá có ít nhất một mặt giáp hang —
   * quặng chôn sâu trong đá thì người chơi không bao giờ thấy, đặt vào chỉ tổ
   * phí. Đây đúng là cách Core Keeper rải quặng: nhìn thấy rồi mới thèm. */
  /*
   * ĐỘ SÂU của một ô đá = số bước ngắn nhất ra tới ô sàn gần nhất (BFS bốn
   * hướng, xuất phát cùng lúc từ MỌI ô sàn). Ô sàn sâu 0, ô đá kề hang sâu 1,
   * càng vào trong càng lớn. Đây là thước đo trung tâm của cả việc đặt quặng
   * lẫn đặt hốc kín — không có nó thì "sâu" chỉ là cảm giác chứ không đo được.
   */
  World.prototype.computeDepth = function () {
    var W = this.W, H = this.H, n = W * H, d = this.depth, i;
    var q = new Int32Array(n), head = 0, tail = 0;
    for (i = 0; i < n; i++) {
      if (this.kind[i] === FLOOR || this.kind[i] === LIQ) { d[i] = 0; q[tail++] = i; }
      else d[i] = -1;
    }
    while (head < tail) {
      var id = q[head++], x = id % W, y = (id / W) | 0, k;
      for (k = 0; k < 4; k++) {
        var nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
        var ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        var ni = ny * W + nx;
        if (d[ni] !== -1) continue;
        d[ni] = d[id] + 1;
        q[tail++] = ni;
      }
    }
    return d;
  };

  /*
   * ĐẶT QUẶNG THEO ĐỘ SÂU.
   *
   * Bản trước gieo vỉa từ danh sách `edges` — các ô đá KỀ SÀN. Đo lại bản đồ đã
   * sinh: 738 ô quặng ở độ sâu 1, 383 ở độ sâu 2, 94 ở độ sâu 3, 16 ở độ sâu 4,
   * và KHÔNG CÓ GÌ sâu hơn — trong khi bản đồ có 2.500-3.400 ô đá ở độ sâu từ 6
   * trở lên. Nói cách khác toàn bộ phần ruột của mọi khối đá đều rỗng tuếch, và
   * men theo mép hang là nhặt sạch. Đục vào trong vừa không được gì vừa mất
   * thời gian, nên không ai đục — đúng như người chơi báo lại.
   *
   * Ba luật mới, mượn thẳng của Core Keeper:
   *
   *   1. VỈA MỌC TỪ NGOÀI VÀO. Hạt giống nằm nông nên nhìn thấy được từ trong
   *      hang, nhưng khi lớn thì vỉa ƯU TIÊN ĐI VỀ PHÍA SÂU HƠN. Thấy một cục
   *      lấp ló ở vách, đục vào, vỉa chạy tiếp — chứ không phải nhặt một cục
   *      rồi hết.
   *   2. CÀNG QUÝ CÀNG CHÔN SÂU. Mỗi loại có ngưỡng độ sâu tối thiểu xếp theo
   *      giá trị: Đường Đỏ nằm ngay vách, Thiên Hà và Nhật Diệu chỉ có ở lòng
   *      khối đá.
   *   3. MORKITE — quặng nhiệm vụ — nằm khoảng giữa: đủ nông để tìm ra mà vẫn
   *      phải đục vào. Bản đồ nhỏ vẫn lộ Morkite kể cả vùng chưa đi qua, nên nó
   *      thành cái la bàn dò quặng chứ không thành trò mò kim đáy bể.
   */
  var ORE_MIN_DEPTH = {
    redsugar: 1, nitra: 1, copper: 2, tin: 2,
    morkite: 2, iron: 3, scarlet: 4, octarine: 5, galaxite: 6, solarite: 7
  };

  World.prototype.seedOres = function (level) {
    var r = this.rng, W = this.W, i;
    var list = this.oreList;
    var d = this.computeDepth();

    var floorCount = 0;
    for (i = 0; i < this.kind.length; i++) if (this.kind[i] === FLOOR) floorCount++;
    var scale = floorCount / 3200;

    // Gom ô đá theo độ sâu để bốc hạt giống cho nhanh.
    var byDepth = [];
    for (i = 0; i < this.kind.length; i++) {
      if (this.kind[i] !== WALL) continue;
      var dp = d[i];
      if (dp < 1) continue;
      var b = Math.min(12, dp);
      (byDepth[b] || (byDepth[b] = [])).push(i);
    }
    for (i = 1; i <= 12; i++) if (byDepth[i]) r.shuffle(byDepth[i]);
    var cursor = new Int32Array(13);

    function takeSeed(minD, maxD) {
      for (var dd = minD; dd <= maxD; dd++) {
        var arr = byDepth[dd];
        if (!arr) continue;
        if (cursor[dd] < arr.length) return arr[cursor[dd]++];
      }
      return -1;
    }

    for (var li = 0; li < list.length; li++) {
      var oid = list[li];
      var oi = li + 1;
      var base = (oid === 'nitra') ? 88 : (oid === 'morkite') ? 150
               : (oid === 'redsugar') ? 50 : 40;
      var want = Math.max(8, Math.round(base * scale));
      var minD = ORE_MIN_DEPTH[oid] || 2;
      var placed = 0, guard = 0;

      while (placed < want && guard++ < want * 8) {
        var seed = takeSeed(minD, Math.min(12, minD + 3));
        if (seed < 0) break;
        if (this.kind[seed] !== WALL) continue;

        // Vỉa quặng quý dài hơn, để công đục sâu có chỗ được trả lại.
        var size = r.i(3, 5) + (minD >= 4 ? r.i(1, 4) : 0);
        var open = [seed];
        while (open.length && placed < want && size > 0) {
          // Bốc ô SÂU NHẤT đang chờ chứ không bốc ngẫu nhiên: chính chỗ này
          // khiến vỉa chạy vào lòng đá thay vì loang dọc theo vách.
          var bi = 0;
          for (var q = 1; q < open.length; q++) {
            if (d[open[q]] > d[open[bi]]) bi = q;
          }
          var id2 = open.splice(bi, 1)[0];
          if (this.kind[id2] !== WALL) continue;
          this.kind[id2] = ORE;
          this.ore[id2] = oi;
          placed++;
          size--;
          var x2 = id2 % W, y2 = (id2 / W) | 0;
          for (var k = 0; k < 4; k++) {
            var nx = x2 + (k === 0 ? 1 : k === 1 ? -1 : 0);
            var ny = y2 + (k === 2 ? 1 : k === 3 ? -1 : 0);
            if (!this.inside(nx, ny)) continue;
            var ni = this.idx(nx, ny);
            if (this.kind[ni] !== WALL) continue;
            // Nghiêng hẳn về phía sâu hơn; ra phía nông thì hiếm khi nhận.
            var deeper = d[ni] >= d[id2];
            if (r.chance(deeper ? 0.86 : 0.16)) open.push(ni);
          }
        }
      }
    }
  };

  /*
   * HỐC KÍN — lý do để đục vào lòng đá, và là thứ THAY CHO thẻ lên cấp.
   *
   * Mỗi hốc là một buồng 2-4 ô nằm sâu trong khối đá, KHÔNG nối với mạng hành
   * lang: không đục thì không có đường vào. Bên trong đặt một phần thưởng,
   * quanh miệng rải một vòng quặng quý để lúc đục tới còn có tín hiệu.
   *
   * Đây là chỗ toàn bộ sức mạnh trong ván chuyển tới sau khi bỏ màn "chọn 1
   * trong 3": trước đây đủ điểm là dừng hình và hiện ba tấm thẻ; giờ phần
   * thưởng nằm trong lòng đất và phải đào mới có. Vẫn trao đúng ngần ấy sức
   * mạnh, nhưng trao bằng động từ trung tâm của game thay vì bằng hộp thoại.
   */
  var CACHE_KINDS = ['to', 'dai', 'bua', 'ruong'];

  World.prototype.placeCaches = function (level) {
    var r = this.rng, W = this.W, i;
    var d = this.depth;
    var deep = [];
    for (i = 0; i < this.kind.length; i++) {
      if (this.kind[i] === WALL && d[i] >= 3) deep.push(i);
    }
    if (!deep.length) return;
    r.shuffle(deep);

    var want = 13 + Math.min(5, (level / 2) | 0);
    var minGap = 11;
    var used = [];
    var rich = this.oreList.length;              // loại quý nhất của quần thể

    for (var t = 0; t < deep.length && this.caches.length < want; t++) {
      var id = deep[t];
      var x = id % W, y = (id / W) | 0;
      var ok = true;
      for (i = 0; i < used.length; i++) {
        if (Math.hypot(used[i][0] - x, used[i][1] - y) < minGap) { ok = false; break; }
      }
      if (!ok) continue;
      used.push([x, y]);

      /* KHÔNG khoét buồng sẵn.
       *
       * Bản đầu khoét luôn 2-4 ô thành sàn rồi mới đặt phần thưởng vào. Buồng
       * ấy đúng là kín — quanh nó vẫn là đá — nhưng ô của chính cái hốc thì đã
       * là sàn ngay từ giây đầu, nên vòng sáng của nó hiện xuyên qua đá và
       * người chơi nhìn thấy phần thưởng trước cả khi đục. Mất sạch cái không
       * biết, mà không biết mới chính là thứ khiến việc đục vào lòng đá đáng
       * làm. Bộ kiểm bắt được: "0/11 còn kín".
       *
       * Giờ hốc nằm nguyên trong đá, và ô của nó là một ô QUẶNG QUÝ NHẤT của
       * quần thể, có thêm một vòng quặng quý bao quanh. Người chơi đang đục
       * thấy vỉa quý dày lên bất thường — đó là tín hiệu — đục nốt thì hốc bật
       * ra. Đúng nhịp "đục vào chỗ không biết rồi tìm thấy thứ gì đó" của Core
       * Keeper, chứ không phải nhặt một cái hộp phát sáng đã thấy từ xa.
       */
      this.kind[id] = ORE;
      this.ore[id] = rich;
      /* Vầng quặng quý bán kính 2 quanh hốc. Bán kính 1 thì cả cụm nằm lọt
       * trong đá và người đứng ngoài hành lang không thấy gì để mà tò mò; bán
       * kính 2 thì mấy ô ngoài cùng chạm tới độ sâu 1-2, tức là NHÌN THẤY ĐƯỢC
       * từ trong hang. Đó chính là cái mồi: thấy một vầng quặng quý dày bất
       * thường, đục vào, và hốc nằm ở tâm. Đo bằng máy trước khi nới: người
       * chơi giả chỉ mở được 1 hốc trong năm phút. */
      for (var oy = -2; oy <= 2; oy++) {
        for (var ox = -2; ox <= 2; ox++) {
          if (!ox && !oy) continue;
          var ax = x + ox, ay = y + oy;
          if (!this.inside(ax, ay)) continue;
          var ai = this.idx(ax, ay);
          if (this.kind[ai] !== WALL) continue;
          var far = Math.max(Math.abs(ox), Math.abs(oy));
          if (r.chance(far === 1 ? 0.9 : 0.5)) {
            this.kind[ai] = ORE;
            this.ore[ai] = rich;
          }
        }
      }

      this.caches.push({
        x: x * T + 8, y: y * T + 8, tx: x, ty: y,
        kind: CACHE_KINDS[this.caches.length % CACHE_KINDS.length],
        taken: false, t: 0
      });
    }
    r.shuffle(this.caches);
  };

  /* Máu ô tường. KHÔNG nhân theo ải — ải sau khó hơn bằng QUÁI, không bằng
   * việc bắt đứng đục lâu hơn. Đục lâu không phải là khó, chỉ là chậm; và cái
   * động từ trung tâm của game mà chậm thì cả ván ì theo.
   *
   * Thang cũ là 26 × độ-cứng-quần-thể × (1 + 0,02·ải): một ô đất thường mất
   * 1,5 giây, một vỉa Morkite mất 2,9 giây. Nhân với vài trăm ô mỗi ván thì
   * phần lớn thời gian là đứng chờ. Thang mới 14: ô thường ~0,4 giây, vỉa
   * ~0,8 giây. */
  World.prototype.rollHp = function () {
    var hard = this.bio.hard;
    for (var i = 0; i < this.kind.length; i++) {
      var k = this.kind[i];
      if (k === WALL) {
        this.hp[i] = this.hpMax[i] = 14 * hard;
      } else if (k === ORE) {
        var o = G.ORE[this.oreList[this.ore[i] - 1]];
        this.hp[i] = this.hpMax[i] = 14 * hard * (o ? o.hp : 1.4);
      }
    }
  };

  World.prototype.decorate = function () {
    for (var y = 2; y < this.H - 2; y++) {
      for (var x = 2; x < this.W - 2; x++) {
        var id = this.idx(x, y);
        if (this.kind[id] !== FLOOR) continue;
        var h = G.hash2(x * 7 + 3, y * 13 + 5);
        if (h < 0.09) this.deco[id] = 1 + Math.floor(G.hash2(x, y) * 5);
      }
    }
  };

  /* Mối nguy đặt Ở ĐÂU cũng quan trọng như đặt CÁI GÌ: đặt trong hành lang hẹp
   * thì thành thuế đường đi, đặt trong phòng thì thành bài toán chọn chỗ đứng.
   * Ở đây rải trong phòng, tránh phòng xuất phát. */
  World.prototype.placeHazards = function (level) {
    var r = this.rng;
    var kinds = this.bio.hazards;
    var count = 6 + level;
    for (var i = 0; i < count; i++) {
      var room = r.pick(this.rooms);
      if (room.kind === 'start') continue;
      var a = r.f(0, Math.PI * 2), d = r.f(0, room.r);
      var x = Math.round(room.x + Math.cos(a) * d);
      var y = Math.round(room.y + Math.sin(a) * d);
      if (!this.inside(x, y) || this.kind[this.idx(x, y)] !== FLOOR) continue;
      this.hazards.push({ type: r.pick(kinds), tx: x, ty: y });
    }
    // Vũng chất lỏng cho quần thể có nước/nham
    if (kinds.indexOf('lava') >= 0 || kinds.indexOf('water') >= 0) {
      var liq = kinds.indexOf('lava') >= 0 ? 'lava' : 'water';
      for (var p = 0; p < 5 + level; p++) {
        var rm = r.pick(this.rooms);
        if (rm.kind === 'start') continue;
        this.pool(rm.x + r.i(-4, 4), rm.y + r.i(-4, 4), r.f(2, 4.5), liq);
      }
    }
  };

  World.prototype.pool = function (cx, cy, rad, liq) {
    for (var y = Math.max(2, cy - rad | 0); y <= Math.min(this.H - 3, cy + rad); y++) {
      for (var x = Math.max(2, cx - rad | 0); x <= Math.min(this.W - 3, cx + rad); x++) {
        if (Math.hypot(x - cx, y - cy) > rad) continue;
        var id = this.idx(x, y);
        if (this.kind[id] === FLOOR) { this.kind[id] = LIQ; this.ore[id] = liq === 'lava' ? 254 : 253; }
      }
    }
  };

  /* Ô sàn trống gần nhất quanh (x,y) — dùng để thả người chơi, quái, đồ. */
  World.prototype.nearestFloor = function (x, y, maxR) {
    maxR = maxR || 24;
    if (this.at(x, y) === FLOOR) return { x: x, y: y };
    for (var r = 1; r <= maxR; r++) {
      for (var a = 0; a < 24; a++) {
        var ang = a / 24 * Math.PI * 2;
        var nx = Math.round(x + Math.cos(ang) * r);
        var ny = Math.round(y + Math.sin(ang) * r);
        if (this.at(nx, ny) === FLOOR) return { x: nx, y: ny };
      }
    }
    return { x: x, y: y };
  };

  // ---------------------------------------------------------------- đục tường

  /* Trả về null nếu chưa vỡ, hoặc {ore, x, y} khi ô vừa vỡ. */
  World.prototype.dig = function (x, y, dmg) {
    if (!this.diggable(x, y)) return null;
    var id = this.idx(x, y);
    this.hp[id] -= dmg;
    this.dirtyAround(x, y);
    if (this.hp[id] > 0) return null;
    var oid = this.ore[id];
    var oreName = (this.kind[id] === ORE && oid > 0) ? this.oreList[oid - 1] : null;
    this.kind[id] = FLOOR;
    this.ore[id] = 0;
    this.hp[id] = 0;
    this.deco[id] = 0;
    return { ore: oreName, x: x, y: y };
  };

  /* Bán kính 2 chứ không phải 1: wallFrame() nhìn tới ô cách hai bước về phía
   * bắc (để biết mình là hàng thứ mấy tính từ mặt trên khối đá), nên đục một ô
   * có thể đổi khung của ô cách đó hai bước. Để nguyên bán kính 1 thì thỉnh
   * thoảng còn sót lại một vệt sáng mép trên nằm giữa lòng đá cho tới khi khối
   * đệm đó tình cờ được vẽ lại. */
  World.prototype.dirtyAround = function (x, y) {
    for (var j = -2; j <= 2; j++) {
      for (var i = -2; i <= 2; i++) {
        var cx = ((x + i) / CH) | 0, cy = ((y + j) / CH) | 0;
        if (cx >= 0 && cy >= 0 && cx < this.chunksX && cy < this.chunksY) {
          var c = this.chunks[cy * this.chunksX + cx];
          if (c) c.dirty = true;
        }
      }
    }
  };

  // ---------------------------------------------------------------- vẽ

  World.prototype.tileKeys = function (isSub) {
    var b = isSub ? this.subBio : this.bio;
    return {
      floor: 'tile.' + b.id + '.floor',
      wall: 'tile.' + b.id + '.wall',
      decor: 'tile.' + b.id + '.decor',
      ore: 'tile.' + b.id + '.ore',
      crack: 'tile.' + b.id + '.crack'
    };
  };

  /*
   * CHỌN KHUNG CHO Ô TƯỜNG / Ô SÀN — bộ 20 khung KHÔNG phải 20 biến thể.
   *
   * Vùng cắt trong tileset gốc của Core Keeper là một khối 5 cột × 4 hàng, và
   * đo độ sáng từng mép của từng khung (cả chín quần thể) cho ra cùng một cấu
   * trúc: đây là một bộ NINE-SLICE 3×3 có nhân đôi biến thể.
   *
   *      cột 0      mép TÂY        (mép trái tối/sáng riêng)
   *      cột 1..3   ruột, 3 biến thể
   *      cột 4      mép ĐÔNG
   *      hàng 0     mép BẮC        (vành trên bắt sáng)
   *      hàng 1     ngay dưới mép bắc
   *      hàng 2     ruột sâu       (tối nhất phần thân)
   *      hàng 3     mép NAM        (gờ dưới tối hẳn — mặt đứng nhìn thấy được)
   *
   * Số đo, quần thể `dirt`, trung bình 5 cột:
   *      hàng 0  trên 82,2  giữa 95,0  dưới  99,9
   *      hàng 3  trên 88,4  giữa 77,2  dưới  63,1   <- gờ dưới tối rõ rệt
   * và `mold`: cột 0 mép trái 44,3 so với 98,4 của các cột giữa.
   *
   * Bản cũ bốc `hash*20` — tức là rải ngẫu nhiên cả hai mươi khung. Hậu quả là
   * vành sáng của mép bắc rơi vào giữa lòng khối đá, gờ tối của mép nam nằm
   * lửng lơ, còn rìa hang thì lại là ruột đá phẳng lì. Khối đá vì thế trông
   * như một miếng dán nhiễu chứ không ra một khối có bề dày — và cách chữa
   * trước đây là vẽ tay thêm viền 2px, càng làm nó giống hình vẽ web.
   *
   * Mép NAM được ưu tiên cao nhất: trong góc nhìn từ trên xuống hơi chếch, mặt
   * đứng người chơi thật sự nhìn thấy là mặt quay xuống dưới.
   */
  World.prototype.wallFrame = function (tx, ty, h) {
    var col = !this.solid(tx - 1, ty) ? 0
            : !this.solid(tx + 1, ty) ? 4
            : 1 + ((h * 3) | 0);
    var row = !this.solid(tx, ty + 1) ? 3
            : !this.solid(tx, ty - 1) ? 0
            : !this.solid(tx, ty - 2) ? 1
            : 2;
    return row * 5 + col;
  };

  /* Ô sàn dùng cùng bộ nine-slice nhưng ĐẢO LẠI: dải tối nằm ở phía có ĐÁ.
   * Nhờ thế bóng chân tường là một phần của bộ art chứ không phải một dải
   * gradient vẽ tay đè lên — thứ trước đây làm mọi mép hang trông như nhau. */
  World.prototype.floorFrame = function (tx, ty, h) {
    var col = this.solid(tx - 1, ty) ? 0
            : this.solid(tx + 1, ty) ? 4
            : 1 + ((h * 3) | 0);
    var row = this.solid(tx, ty - 1) ? 0
            : this.solid(tx, ty + 1) ? 3
            : 1 + ((h * 2) | 0);
    return row * 5 + col;
  };

  World.prototype.renderChunk = function (cx, cy) {
    var i = cy * this.chunksX + cx;
    var c = this.chunks[i];
    if (!c) {
      var cv = document.createElement('canvas');
      cv.width = CH * T; cv.height = CH * T;
      c = this.chunks[i] = { cv: cv, g: cv.getContext('2d'), dirty: true };
    }
    if (!c.dirty) return c;
    var g = c.g;
    g.clearRect(0, 0, CH * T, CH * T);
    g.imageSmoothingEnabled = false;

    var A = G.Atlas;
    var x0 = cx * CH, y0 = cy * CH;
    var x, y, tx, ty, id, px, py, keys, h;

    // Lớp 1: nền + tường
    for (y = 0; y < CH; y++) {
      for (x = 0; x < CH; x++) {
        tx = x0 + x; ty = y0 + y;
        if (!this.inside(tx, ty)) continue;
        id = this.idx(tx, ty);
        px = x * T; py = y * T;
        keys = this.tileKeys(this.sub[id]);
        var k = this.kind[id];
        h = G.hash2(tx, ty);

        if (k === FLOOR || k === LIQ) {
          A.draw(g, keys.floor, this.floorFrame(tx, ty, h), px, py, { ax: 0, ay: 0 });
          if (k === LIQ) {
            g.fillStyle = this.ore[id] === 254 ? 'rgba(255,90,30,.72)' : 'rgba(60,150,255,.55)';
            g.fillRect(px, py, T, T);
          } else if (this.deco[id]) {
            A.draw(g, keys.decor, this.deco[id] - 1, px, py, { ax: 0, ay: 0 });
          }
        } else if (k === ROCK) {
          A.draw(g, keys.wall, this.wallFrame(tx, ty, h), px, py, { ax: 0, ay: 0 });
          g.fillStyle = 'rgba(0,0,0,.55)';
          g.fillRect(px, py, T, T);
        } else {
          A.draw(g, keys.wall, this.wallFrame(tx, ty, h), px, py, { ax: 0, ay: 0 });
          /* Chỉ vẽ quặng khi ô đá này CÓ MẶT LỘ RA hang.
            *
            * Core Keeper sinh trường quặng cho mọi vị trí kể cả trong lòng đá
            * đặc (tài liệu mod chính chủ: ba bit alpha của mỗi điểm ảnh bản đồ
            * là loại quặng tại vị trí đó), nhưng chỉ VẼ ở ô có cạnh lộ ra —
            * wiki mô tả người chơi nhận ra quặng nhờ "đốm lấp lánh trắng trên
            * vách". Nhờ vậy lòng khối đá là một ẩn số thật: đục vào mới biết
            * có gì. Bản trước vẽ mọi ô quặng, nên chỉ cần đèn sáng là nhìn
            * xuyên qua đá thấy hết vỉa, và chẳng còn gì để tò mò. */
          if (k === ORE && (!this.solid(tx - 1, ty) || !this.solid(tx + 1, ty) ||
                            !this.solid(tx, ty - 1) || !this.solid(tx, ty + 1))) {
            A.draw(g, keys.ore, (this.ore[id] * 2 + ((h * 2) | 0)) % 6, px, py, { ax: 0, ay: 0 });
            var o = G.ORE[this.oreList[this.ore[id] - 1]];
            if (o) {
              // Quang phat sang bang MOT DOM tron o giua o, khong phai to kin ca
              // o vuong. To kin thi via quang thanh mot manh mau chu nhat, nhin
              // ra o ban co chu khong ra da co quang.
              g.save();
              g.globalCompositeOperation = 'lighter';
              var gd = g.createRadialGradient(px + 8, py + 8, 1, px + 8, py + 8, 8);
              gd.addColorStop(0, o.col);
              gd.addColorStop(1, 'rgba(0,0,0,0)');
              g.globalAlpha = 0.55;
              g.fillStyle = gd;
              g.fillRect(px, py, T, T);
              g.restore();
            }
          }
          if (this.hp[id] < this.hpMax[id] * 0.75) {
            A.draw(g, keys.crack,
              this.hp[id] < this.hpMax[id] * 0.35 ? 3 : 1, px, py, { ax: 0, ay: 0 });
          }
        }
      }
    }

    /* Lớp 2: CHỈ còn bóng đổ mềm xuống sàn ngay dưới chân khối đá.
     *
     * Ba đường viền 2px vẽ tay ở bản trước đã bỏ: bộ nine-slice đã có sẵn mép
     * tây/đông/bắc/nam vẽ đúng chất liệu của từng quần thể, nên kẻ thêm một
     * đường đen đều tăm tắp lên trên chỉ tổ dìm mất chi tiết và làm cái hang
     * trông như hình vẽ vector. Bóng thì vẫn giữ, vì nó là thứ duy nhất chạy
     * RA NGOÀI ô đá, mà một tấm sprite 16x16 thì không tự làm được. */
    for (y = 0; y < CH; y++) {
      for (x = 0; x < CH; x++) {
        tx = x0 + x; ty = y0 + y;
        if (!this.inside(tx, ty)) continue;
        if (this.solid(tx, ty) || !this.solid(tx, ty - 1)) continue;
        px = x * T; py = y * T;
        var gr = g.createLinearGradient(0, py, 0, py + 6);
        gr.addColorStop(0, 'rgba(0,0,0,.42)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(px, py, T, 6);
      }
    }
    c.dirty = false;
    return c;
  };

  /* cam = {x, y, scale} tính bằng pixel thế giới ở tâm màn hình. */
  World.prototype.draw = function (ctx, cam, vw, vh) {
    var s = cam.scale;
    var halfW = vw / 2 / s, halfH = vh / 2 / s;
    var wx0 = cam.x - halfW, wy0 = cam.y - halfH;
    var c0x = Math.max(0, Math.floor(wx0 / (CH * T)));
    var c0y = Math.max(0, Math.floor(wy0 / (CH * T)));
    var c1x = Math.min(this.chunksX - 1, Math.floor((cam.x + halfW) / (CH * T)));
    var c1y = Math.min(this.chunksY - 1, Math.floor((cam.y + halfH) / (CH * T)));
    for (var cy = c0y; cy <= c1y; cy++) {
      for (var cx = c0x; cx <= c1x; cx++) {
        var c = this.renderChunk(cx, cy);
        ctx.drawImage(c.cv, cx * CH * T, cy * CH * T);
      }
    }
  };

  /* Mở màn sương trên bản đồ nhỏ quanh người chơi. */
  World.prototype.reveal = function (tx, ty, rad) {
    var r2 = rad * rad;
    for (var y = ty - rad; y <= ty + rad; y++) {
      for (var x = tx - rad; x <= tx + rad; x++) {
        if (!this.inside(x, y)) continue;
        var dx = x - tx, dy = y - ty;
        if (dx * dx + dy * dy <= r2) this.seen[this.idx(x, y)] = 1;
      }
    }
  };

  G.World = World;
  G.TILE = T;
  G.TK = { FLOOR: FLOOR, WALL: WALL, ORE: ORE, ROCK: ROCK, LIQ: LIQ };
})(window.DC = window.DC || {});
