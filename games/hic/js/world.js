/* Bản đồ, đồng hồ ngày/đêm và lũ quái đi trên đó.
 *
 * WHY: nhịp của game nằm ở đây, không nằm ở trận đánh. Mỗi bước chân là một
 * đơn vị thời gian, và thời gian là thứ duy nhất người chơi không mua lại được.
 * ROOT-CAUSE: nếu thời gian trôi theo giây thay vì theo bước, người chơi sẽ
 * bị phạt vì đứng nghĩ — đúng thứ mà một game chiến thuật không được làm.
 * SEE: docs/proposals/he-is-coming-clone.md — mục "Thế giới"
 *
 * Các con số dưới đây lấy nguyên từ bản gốc:
 *   ngày 50 bước, đêm 30 bước, một tuần 3 ngày 3 đêm rồi tới trùm.
 *   tầm nhìn 5 ô ban ngày, 3 ô ban đêm.
 *   ban ngày quái đứng yên; ban đêm quái thấy bạn thì đuổi.
 */
(function (global) {
  'use strict';

  var DAY_STEPS = 50;
  var NIGHT_STEPS = 30;
  var SIGHT_DAY = 5;
  var SIGHT_NIGHT = 3;
  var PHASES = ['day', 'night', 'day', 'night', 'day', 'night'];

  /* Kích thước vùng và số sự kiện được chọn theo NGÂN SÁCH BƯỚC CHÂN, không phải
   theo thẩm mỹ: một tuần cho 3x50 + 3x30 = 240 bước, nên bản đồ phải nhỏ vừa đủ
   để 240 bước là đi được kha khá chỗ. Bản 34x34 với 26 sự kiện đầu tiên cho ra
   2 sự kiện mỗi tuần — tức là người chơi không có gì để quyết định. */
var W = 28, H = 28;

  var TILE = { GRASS: 0, TREE: 1, WATER: 2, ROCK: 3, PATH: 4, FLOWER: 5 };
  var BLOCKED = {};
  BLOCKED[TILE.TREE] = true;
  BLOCKED[TILE.WATER] = true;
  BLOCKED[TILE.ROCK] = true;

  function Rng(seed) { this.s = (seed >>> 0) || 1; }
  Rng.prototype.next = function () {
    var x = this.s;
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    this.s = x || 1;
    return this.s / 4294967296;
  };
  Rng.prototype.int = function (n) { return Math.floor(this.next() * n); };
  Rng.prototype.pick = function (a) { return a[this.int(a.length)]; };
  Rng.prototype.shuffle = function (a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = this.int(i + 1), t = a[i];
      a[i] = a[j]; a[j] = t;
    }
    return a;
  };

  /* Danh sách sự kiện trên bản đồ. `weight` quyết định độ hiếm khi rải.
     Mọi ô đều dùng một lần rồi biến mất — xem ghi chú ở game.js openEvent. */
  var EVENTS = [
    { id: 'chest', name: 'Rương gỗ', icon: 'chest', weight: 16 },
    { id: 'jewelrybox', name: 'Hộp trang sức', icon: 'jewel', weight: 6 },
    { id: 'grave', name: 'Nấm mồ', icon: 'grave', weight: 5 },
    { id: 'anvil', name: 'Đe rèn', icon: 'anvil', weight: 5 },
    { id: 'oil', name: 'Lọ dầu', icon: 'oil', weight: 4 },
    { id: 'merchant', name: 'Lái buôn', icon: 'merchant', weight: 6 },
    { id: 'campfire', name: 'Đống lửa', icon: 'fire', weight: 6 },
    { id: 'house', name: 'Căn nhà', icon: 'house', weight: 3 },
    { id: 'golem', name: 'Golem thợ rèn', icon: 'golem', weight: 4 },
    { id: 'cauldron', name: 'Vạc nấu', icon: 'cauldron', weight: 4 },
    { id: 'tower', name: 'Chòi canh', icon: 'tower', weight: 3 },
    { id: 'well', name: 'Giếng ước', icon: 'well', weight: 3 }
  ];

  function World(seed, week) {
    this.rng = new Rng(seed);
    this.week = week;
    this.w = W; this.h = H;
    this.tiles = new Uint8Array(W * H);
    this.explored = new Uint8Array(W * H);
    this.events = [];
    this.monsters = [];
    this.phaseIndex = 0;
    this.stepsLeft = DAY_STEPS;
    this.px = W >> 1;
    this.py = H >> 1;
    this.generate();
    this.revealAround();
  }

  World.prototype.idx = function (x, y) { return y * this.w + x; };
  World.prototype.inside = function (x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; };
  World.prototype.tile = function (x, y) { return this.inside(x, y) ? this.tiles[this.idx(x, y)] : TILE.ROCK; };
  World.prototype.blocked = function (x, y) { return !!BLOCKED[this.tile(x, y)]; };

  World.prototype.phase = function () { return PHASES[this.phaseIndex] || 'night'; };
  World.prototype.isNight = function () { return this.phase() === 'night'; };
  World.prototype.sight = function () { return this.isNight() ? SIGHT_NIGHT : SIGHT_DAY; };
  World.prototype.dayNumber = function () { return Math.floor(this.phaseIndex / 2) + 1; };
  World.prototype.bossDue = function () { return this.phaseIndex >= PHASES.length; };

  /* ------------------------------------------------------------- tạo bản đồ */

  World.prototype.generate = function () {
    var r = this.rng, x, y, i;

    // Nền cỏ, rồi rắc rừng thành từng đám để bản đồ có hình dạng chứ không nhiễu đều.
    for (i = 0; i < this.tiles.length; i++) this.tiles[i] = TILE.GRASS;
    var clumps = 48 + r.int(20);
    for (i = 0; i < clumps; i++) {
      var cx = r.int(this.w), cy = r.int(this.h);
      var kind = r.next() < 0.68 ? TILE.TREE : (r.next() < 0.5 ? TILE.ROCK : TILE.WATER);
      var size = 2 + r.int(4);
      for (var k = 0; k < size * size; k++) {
        var dx = r.int(size) - (size >> 1), dy = r.int(size) - (size >> 1);
        x = cx + dx; y = cy + dy;
        if (this.inside(x, y)) this.tiles[this.idx(x, y)] = kind;
      }
    }
    // Vài khoảng đất trống, cho bản đồ có chỗ nghỉ mắt giữa rừng.
    for (i = 0; i < 7; i++) {
      var dxc = 2 + r.int(this.w - 4), dyc = 2 + r.int(this.h - 4), dsz = 2 + r.int(3);
      for (y = dyc; y < dyc + dsz; y++) {
        for (x = dxc; x < dxc + dsz; x++) {
          if (this.inside(x, y) && this.tiles[this.idx(x, y)] === TILE.GRASS) {
            this.tiles[this.idx(x, y)] = TILE.PATH;
          }
        }
      }
    }
    // Vài bụi hoa cho đỡ trống.
    for (i = 0; i < 90; i++) {
      x = r.int(this.w); y = r.int(this.h);
      if (this.tiles[this.idx(x, y)] === TILE.GRASS) this.tiles[this.idx(x, y)] = TILE.FLOWER;
    }
    // Viền bản đồ là đá — không ai đi ra khỏi vùng được.
    for (x = 0; x < this.w; x++) { this.tiles[this.idx(x, 0)] = TILE.ROCK; this.tiles[this.idx(x, this.h - 1)] = TILE.ROCK; }
    for (y = 0; y < this.h; y++) { this.tiles[this.idx(0, y)] = TILE.ROCK; this.tiles[this.idx(this.w - 1, y)] = TILE.ROCK; }

    // Chỗ đứng đầu tiên phải trống, và phải nối được ra ngoài.
    this.carve(this.px, this.py, 2);
    this.connect();
    this.placeEvents();
    this.placeMonsters();
  };

  World.prototype.carve = function (cx, cy, rad) {
    for (var y = cy - rad; y <= cy + rad; y++) {
      for (var x = cx - rad; x <= cx + rad; x++) {
        if (this.inside(x, y) && x > 0 && y > 0 && x < this.w - 1 && y < this.h - 1) {
          this.tiles[this.idx(x, y)] = TILE.GRASS;
        }
      }
    }
  };

  /* Đục đường tới mọi mảng cỏ bị rừng cắt rời.
     WHY: một sự kiện rơi vào ô kín thì người chơi mất luôn nó mà không hiểu vì sao. */
  World.prototype.connect = function () {
    var seen = new Uint8Array(this.w * this.h);
    this.flood(this.px, this.py, seen);
    /* Lặp cho tới khi không còn mảnh cỏ nào bị cắt rời. Mỗi vòng chỉ đục MỘT
       hành lang rồi loang lại — đục từng ô một sẽ để lại những vệt đất rộng
       trông như sẹo trên bản đồ. Hành lang được đục thành cỏ chứ không phải
       đường mòn, để nó chìm vào cảnh chứ không chỉ cho người chơi thấy chỗ
       thuật toán vừa sửa. */
    for (var round = 0; round < 40; round++) {
      var sx = -1, sy = -1;
      for (var y = 1; y < this.h - 1 && sx < 0; y++) {
        for (var x = 1; x < this.w - 1; x++) {
          if (!this.blocked(x, y) && !seen[this.idx(x, y)]) { sx = x; sy = y; break; }
        }
      }
      if (sx < 0) break;
      var cx = sx, cy = sy, guard = 0;
      while ((cx !== this.px || cy !== this.py) && guard++ < 200) {
        this.tiles[this.idx(cx, cy)] = TILE.GRASS;
        if (cx !== this.px) cx += cx < this.px ? 1 : -1;
        else if (cy !== this.py) cy += cy < this.py ? 1 : -1;
        if (seen[this.idx(cx, cy)]) break;
      }
      seen = new Uint8Array(this.w * this.h);
      this.flood(this.px, this.py, seen);
    }
    this.reachable = seen;
  };

  World.prototype.flood = function (sx, sy, seen) {
    var q = [sx, sy], count = 0;
    seen[this.idx(sx, sy)] = 1;
    while (q.length) {
      var y = q.pop(), x = q.pop();
      count++;
      var d = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var k = 0; k < 4; k++) {
        var nx = x + d[k][0], ny = y + d[k][1];
        if (!this.inside(nx, ny) || this.blocked(nx, ny)) continue;
        var i = this.idx(nx, ny);
        if (seen[i]) continue;
        seen[i] = 1;
        q.push(nx, ny);
      }
    }
    return count;
  };

  World.prototype.freeSpots = function (minDist) {
    var out = [], taken = {}, i;
    for (i = 0; i < this.events.length; i++) taken[this.events[i].x + ',' + this.events[i].y] = 1;
    for (i = 0; i < this.monsters.length; i++) taken[this.monsters[i].x + ',' + this.monsters[i].y] = 1;
    for (var y = 1; y < this.h - 1; y++) {
      for (var x = 1; x < this.w - 1; x++) {
        if (this.blocked(x, y)) continue;
        if (!this.reachable || !this.reachable[this.idx(x, y)]) continue;
        if (taken[x + ',' + y]) continue;
        var d = Math.abs(x - this.px) + Math.abs(y - this.py);
        if (d < (minDist || 0)) continue;
        out.push({ x: x, y: y });
      }
    }
    return out;
  };

  World.prototype.placeEvents = function () {
    var r = this.rng, bag = [], i, e;
    for (i = 0; i < EVENTS.length; i++) {
      for (var k = 0; k < EVENTS[i].weight; k++) bag.push(EVENTS[i]);
    }
    var spots = r.shuffle(this.freeSpots(3));
    var count = Math.min(spots.length, 38 + r.int(8));
    for (i = 0; i < count; i++) {
      e = r.pick(bag);
      this.events.push({
        id: e.id, name: e.name, icon: e.icon,
        x: spots[i].x, y: spots[i].y, used: false, seed: r.int(1e9)
      });
    }
  };

  World.prototype.placeMonsters = function () {
    var r = this.rng;
    var level = Math.min(3, this.week);
    var pool = global.HIC_mobsForLevel(level);
    var spots = r.shuffle(this.freeSpots(5));
    var count = Math.min(spots.length, 10 + this.week * 3);
    for (var i = 0; i < count; i++) {
      var def = r.pick(pool);
      this.monsters.push({
        def: def, x: spots[i].x, y: spots[i].y,
        hp: def.health, awake: false, id: 'm' + i
      });
    }
  };

  /* ------------------------------------------------------------ tầm nhìn */

  World.prototype.revealAround = function () {
    var rad = this.sight();
    for (var y = this.py - rad; y <= this.py + rad; y++) {
      for (var x = this.px - rad; x <= this.px + rad; x++) {
        if (!this.inside(x, y)) continue;
        var dx = x - this.px, dy = y - this.py;
        if (dx * dx + dy * dy <= rad * rad + rad) this.explored[this.idx(x, y)] = 1;
      }
    }
  };

  World.prototype.visible = function (x, y) {
    var rad = this.sight(), dx = x - this.px, dy = y - this.py;
    return dx * dx + dy * dy <= rad * rad + rad;
  };

  World.prototype.revealAll = function () {
    for (var i = 0; i < this.explored.length; i++) this.explored[i] = 1;
  };

  /* --------------------------------------------------------------- di chuyển */

  World.prototype.monsterAt = function (x, y) {
    for (var i = 0; i < this.monsters.length; i++) {
      if (this.monsters[i].x === x && this.monsters[i].y === y) return this.monsters[i];
    }
    return null;
  };
  World.prototype.eventAt = function (x, y) {
    for (var i = 0; i < this.events.length; i++) {
      var e = this.events[i];
      if (e.x === x && e.y === y && !e.used) return e;
    }
    return null;
  };
  World.prototype.removeMonster = function (m) {
    var i = this.monsters.indexOf(m);
    if (i >= 0) this.monsters.splice(i, 1);
  };

  /* Một bước chân. Trả về chuyện gì chặn bước đó lại — người gọi quyết định
     mở trận đánh hay mở sự kiện. Thời gian CHỈ trôi khi bước thật sự đi được. */
  World.prototype.step = function (dx, dy) {
    var nx = this.px + dx, ny = this.py + dy;
    if (!this.inside(nx, ny) || this.blocked(nx, ny)) return { kind: 'blocked' };

    var mob = this.monsterAt(nx, ny);
    if (mob) return { kind: 'monster', monster: mob };

    this.px = nx; this.py = ny;
    this.advanceClock();
    this.revealAround();
    this.moveMonsters();

    var onMe = this.monsterAt(this.px, this.py);
    if (onMe) return { kind: 'monster', monster: onMe };

    var ev = this.eventAt(this.px, this.py);
    if (ev) return { kind: 'event', event: ev };
    return { kind: 'ok' };
  };

  World.prototype.advanceClock = function () {
    this.stepsLeft--;
    if (this.stepsLeft > 0) return;
    this.phaseIndex++;
    this.stepsLeft = this.phase() === 'night' ? NIGHT_STEPS : DAY_STEPS;
    // Trời sáng thì lũ quái thôi đuổi.
    if (!this.isNight()) {
      for (var i = 0; i < this.monsters.length; i++) this.monsters[i].awake = false;
    }
  };

  /* Ban ngày quái đứng yên kể cả khi thấy bạn. Ban đêm, thấy là đuổi. */
  World.prototype.moveMonsters = function () {
    if (!this.isNight()) return;
    var rad = SIGHT_NIGHT + 1;
    for (var i = 0; i < this.monsters.length; i++) {
      var m = this.monsters[i];
      var dx = this.px - m.x, dy = this.py - m.y;
      var dist2 = dx * dx + dy * dy;
      if (dist2 <= rad * rad) m.awake = true;
      if (!m.awake) continue;
      if (dist2 > (rad + 4) * (rad + 4)) { m.awake = false; continue; }

      var sx = dx === 0 ? 0 : (dx > 0 ? 1 : -1);
      var sy = dy === 0 ? 0 : (dy > 0 ? 1 : -1);
      var tries = Math.abs(dx) >= Math.abs(dy) ? [[sx, 0], [0, sy]] : [[0, sy], [sx, 0]];
      for (var t = 0; t < tries.length; t++) {
        var nx = m.x + tries[t][0], ny = m.y + tries[t][1];
        if (!tries[t][0] && !tries[t][1]) continue;
        if (!this.inside(nx, ny) || this.blocked(nx, ny)) continue;
        if (this.monsterAt(nx, ny)) continue;
        if (this.eventAt(nx, ny)) continue;
        m.x = nx; m.y = ny;
        break;
      }
    }
  };

  /* Tìm đường cho cú chạm vào bản đồ: đi vòng qua vật cản, và mặc định vòng
     luôn qua quái. `allowMonsters` là đường lùi khi KHÔNG có lối nào khác —
     hành lang rộng một ô mà có con quái đứng giữa thì cả một vùng bản đồ coi
     như biến mất, và người chơi chỉ nhận được câu "không đi tới đó được".
     Khi đi đường đó, bước chân đâm vào quái sẽ mở trận đánh như bình thường. */
  World.prototype.pathTo = function (tx, ty, allowMonsters) {
    if (!this.inside(tx, ty) || this.blocked(tx, ty)) return null;
    var prev = new Int32Array(this.w * this.h).fill(-1);
    var seen = new Uint8Array(this.w * this.h);
    var q = [this.px, this.py], head = 0;
    seen[this.idx(this.px, this.py)] = 1;
    var d = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (head < q.length) {
      var x = q[head++], y = q[head++];
      if (x === tx && y === ty) break;
      for (var k = 0; k < 4; k++) {
        var nx = x + d[k][0], ny = y + d[k][1];
        if (!this.inside(nx, ny) || this.blocked(nx, ny)) continue;
        var i = this.idx(nx, ny);
        if (seen[i]) continue;
        // Quái chặn đường, trừ khi chính nó là đích (đi vào là đánh nhau).
        if (!allowMonsters && this.monsterAt(nx, ny) && !(nx === tx && ny === ty)) continue;
        seen[i] = 1;
        prev[i] = this.idx(x, y);
        q.push(nx, ny);
      }
    }
    var end = this.idx(tx, ty);
    if (!seen[end]) return null;
    var path = [], cur = end;
    while (cur !== this.idx(this.px, this.py)) {
      path.push({ x: cur % this.w, y: (cur / this.w) | 0 });
      cur = prev[cur];
      if (cur < 0) return null;
    }
    return path.reverse();
  };

  World.prototype.skipToMorning = function () {
    // Đống lửa và căn nhà đẩy thẳng tới sáng hôm sau.
    if (this.isNight()) {
      this.phaseIndex++;
    } else {
      this.phaseIndex += 2;
    }
    this.stepsLeft = this.phase() === 'night' ? NIGHT_STEPS : DAY_STEPS;
    for (var i = 0; i < this.monsters.length; i++) this.monsters[i].awake = false;
  };

  global.HIC_World = World;
  global.HIC_TILE = TILE;
  global.HIC_WORLD_CONST = {
    DAY_STEPS: DAY_STEPS, NIGHT_STEPS: NIGHT_STEPS,
    SIGHT_DAY: SIGHT_DAY, SIGHT_NIGHT: SIGHT_NIGHT,
    PHASES: PHASES, EVENTS: EVENTS
  };
  global.HIC_Rng = Rng;
})(window);
