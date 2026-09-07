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

    // 7) Vỉa quặng + máu ô tường.
    this.seedOres(level);
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
  World.prototype.seedOres = function (level) {
    var r = this.rng, W = this.W, H = this.H;
    var list = this.oreList;
    var budget = {};
    var floorCount = 0, i;
    for (i = 0; i < this.kind.length; i++) if (this.kind[i] === FLOOR) floorCount++;
    var scale = floorCount / 3200;

    list.forEach(function (o) {
      // Đo trong máy: với mức cũ (26/22/14/12 cụm), đục 60 ô tường mới ra
      // trúng chưa tới một vỉa — tức là chỉ tiêu 11 Morkite không thể xong
      // trong mười phút, và cây kinh nghiệm cũng đứng. Nhân đôi rưỡi.
      /* Trữ lượng chỉ nhích nhẹ so với bản đầu (96 -> 124 Morkite).
     *
     * Có một lần thử tăng thẳng lên 230 để đỡ chỉ tiêu mới, và nó phản tác
     * dụng đúng như đáng lẽ phải đoán được: cái quyết định độ dài một ván
     * không phải thời gian ĐỤC mà là thời gian ĐI TÌM. Rải thêm quặng thì
     * quãng đường giữa hai vỉa ngắn lại, và ván ngắn đi chứ không dài ra —
     * đo được 84 Morkite xong ở giây 198, gần y hệt 56 Morkite trước đó. */
    var base = (o === 'nitra') ? 88 : (o === 'morkite') ? 150 : (o === 'redsugar') ? 50 : 40;
      budget[o] = Math.max(8, Math.round(base * scale));
    });

    var edges = [];
    for (var y = 3; y < H - 3; y++) {
      for (var x = 3; x < W - 3; x++) {
        if (this.kind[this.idx(x, y)] !== WALL) continue;
        if (this.at(x + 1, y) === FLOOR || this.at(x - 1, y) === FLOOR ||
            this.at(x, y + 1) === FLOOR || this.at(x, y - 1) === FLOOR) {
          edges.push(y * W + x);
        }
      }
    }
    r.shuffle(edges);
    var ei = 0;

    for (var li = 0; li < list.length; li++) {
      var oid = list[li];
      var oi = li + 1;
      for (var c = 0; c < budget[oid] && ei < edges.length; c++) {
        var start = edges[ei++];
        var sx = start % W, sy = (start / W) | 0;
        var size = r.i(2, 5);
        var open = [[sx, sy]], placed = 0, guard = 0;
        while (open.length && placed < size && guard++ < 60) {
          var k = r.i(0, open.length - 1);
          var p = open.splice(k, 1)[0];
          var id = this.idx(p[0], p[1]);
          if (this.kind[id] !== WALL) continue;
          this.kind[id] = ORE;
          this.ore[id] = oi;
          placed++;
          var nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
          for (var d = 0; d < 4; d++) {
            var nx = p[0] + nb[d][0], ny = p[1] + nb[d][1];
            if (this.inside(nx, ny) && this.kind[this.idx(nx, ny)] === WALL && r.chance(0.65)) {
              open.push([nx, ny]);
            }
          }
        }
      }
    }
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

  World.prototype.dirtyAround = function (x, y) {
    for (var j = -1; j <= 1; j++) {
      for (var i = -1; i <= 1; i++) {
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
          A.draw(g, keys.floor, (h * 20) | 0, px, py, { ax: 0, ay: 0 });
          if (k === LIQ) {
            g.fillStyle = this.ore[id] === 254 ? 'rgba(255,90,30,.72)' : 'rgba(60,150,255,.55)';
            g.fillRect(px, py, T, T);
          } else if (this.deco[id]) {
            A.draw(g, keys.decor, this.deco[id] - 1, px, py, { ax: 0, ay: 0 });
          }
        } else if (k === ROCK) {
          A.draw(g, keys.wall, (h * 20) | 0, px, py, { ax: 0, ay: 0 });
          g.fillStyle = 'rgba(0,0,0,.55)';
          g.fillRect(px, py, T, T);
        } else {
          A.draw(g, keys.wall, (h * 20) | 0, px, py, { ax: 0, ay: 0 });
          if (k === ORE) {
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

    // Lớp 2: viền tối ở mép đá và bóng đổ xuống sàn. Đây là thứ làm khối đá
    // trông có bề dày thay vì như một miếng dán phẳng.
    g.fillStyle = 'rgba(0,0,0,.45)';
    for (y = 0; y < CH; y++) {
      for (x = 0; x < CH; x++) {
        tx = x0 + x; ty = y0 + y;
        if (!this.inside(tx, ty)) continue;
        px = x * T; py = y * T;
        var me = this.solid(tx, ty);
        if (me) {
          if (!this.solid(tx, ty - 1)) g.fillRect(px, py, T, 2);
          if (!this.solid(tx - 1, ty)) g.fillRect(px, py, 2, T);
          if (!this.solid(tx + 1, ty)) g.fillRect(px + T - 2, py, 2, T);
        } else if (this.solid(tx, ty - 1)) {
          // bóng của khối đá phía trên hắt xuống sàn
          var gr = g.createLinearGradient(0, py, 0, py + 7);
          gr.addColorStop(0, 'rgba(0,0,0,.55)');
          gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr;
          g.fillRect(px, py, T, 7);
          g.fillStyle = 'rgba(0,0,0,.45)';
        }
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
