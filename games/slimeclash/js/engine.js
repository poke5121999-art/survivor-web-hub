/*
 * SlimeClash — engine trận đấu.
 *
 * MÔ HÌNH: merge của Slime Legion, KHÔNG phải đội hình-nạp của Clash of Heroes.
 * Bản đầu tôi dựng theo CoH (hai sân đối đầu, mỗi quân có bộ đếm lượt nạp trên đầu) —
 * sai. Sân địch bị bỏ, bộ đếm trên đầu quân bị bỏ.
 *
 * Vòng lặp một lượt:
 *   1. Người chơi tiêu `movesPerTurn` bước. Mỗi bước = kéo một quân sang ô khác
 *      (ô trống thì dời, ô có quân thì đổi chỗ).
 *   2. Xếp được >= 3 quân CÙNG LOẠI CÙNG CẤP thành hàng ngang hoặc dọc -> GỘP thành
 *      MỘT quân cấp cao hơn. Gộp xong có thể lại thành hàng mới -> gộp dây chuyền.
 *   3. Hết bước: MỌI quân trên sân bắn vào quái, sát thương = tổng lực.
 *   4. Quái đánh trả vào một CỘT đã báo trước; quân trong cột đó chịu đòn, dư thì
 *      trừ máu người chơi.
 *   5. Sinh thêm quân mới vào ô trống, sang lượt kế.
 *
 * Vì sao gộp mới là cốt lõi: lực tăng theo CẤP số nhân (gradePowerMul^(cấp-1)), nên
 * ba con cấp 1 gộp lại mạnh hơn hẳn ba con để rời. Đó là toàn bộ bài toán của người chơi.
 */
(function (root) {
  'use strict';

  var CFG = root.CFG || require('./config.js');
  var DATA = root.DATA || require('./data.js');

  // RNG tất định — cùng seed ra cùng ván. Cần cho test headless.
  function RNG(seed) { this.s = (seed >>> 0) || 1; }
  RNG.prototype.next = function () {
    var x = this.s;
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    this.s = x;
    return x / 4294967296;
  };
  RNG.prototype.int = function (n) { return Math.floor(this.next() * n); };
  RNG.prototype.pick = function (a) { return a[this.int(a.length)]; };
  RNG.prototype.chance = function (p) { return this.next() < p; };
  RNG.prototype.weighted = function (table) {
    var total = 0, i;
    for (i = 0; i < table.length; i++) total += table[i][1];
    var roll = this.next() * total;
    for (i = 0; i < table.length; i++) {
      roll -= table[i][1];
      if (roll <= 0) return table[i][0];
    }
    return table[table.length - 1][0];
  };

  // ---------------------------------------------------------------- Board

  function Board(deck, rng, powerMul) {
    this.cols = CFG.board.cols;
    this.rows = CFG.board.rows;
    this.deck = deck;
    this.rng = rng;
    this.powerMul = powerMul || 1;
    this.cells = [];
    for (var r = 0; r < this.rows; r++) this.cells.push(new Array(this.cols).fill(null));
  }

  Board.prototype.get = function (r, c) {
    return (r >= 0 && r < this.rows && c >= 0 && c < this.cols) ? this.cells[r][c] : null;
  };
  Board.prototype.set = function (r, c, v) { this.cells[r][c] = v; };

  Board.prototype.makeUnit = function (deckEntry, grade) {
    var d = deckEntry || this.rng.pick(this.deck);
    var st = DATA.statAt(d.hero, d.level);
    var g = grade || 1;
    var u = {
      heroId: d.hero.id, name: d.hero.name, color: d.hero.color, klass: d.hero.klass,
      level: d.level, grade: g,
      basePower: Math.max(1, Math.round(st.power * this.powerMul)),
      baseHp: Math.max(1, Math.round(st.hp * this.powerMul))
    };
    applyGrade(u);
    return u;
  };

  function applyGrade(u) {
    var m = Math.pow(CFG.merge.gradePowerMul, u.grade - 1);
    u.power = Math.max(1, Math.round(u.basePower * m));
    u.maxHp = Math.max(1, Math.round(u.baseHp * m));
    if (u.hp == null || u.hp > u.maxHp) u.hp = u.maxHp;
  }

  Board.prototype.emptyCells = function () {
    var out = [];
    for (var r = 0; r < this.rows; r++)
      for (var c = 0; c < this.cols; c++) if (!this.cells[r][c]) out.push({ r: r, c: c });
    return out;
  };

  Board.prototype.units = function () {
    var out = [];
    for (var r = 0; r < this.rows; r++)
      for (var c = 0; c < this.cols; c++) if (this.cells[r][c]) out.push(this.cells[r][c]);
    return out;
  };

  Board.prototype.totalPower = function () {
    var s = 0;
    this.units().forEach(function (u) { s += u.power; });
    return s;
  };

  // Sinh n quân mới vào ô trống ngẫu nhiên.
  Board.prototype.spawn = function (n) {
    var free = this.emptyCells();
    var made = 0;
    for (var i = 0; i < n && free.length; i++) {
      var k = this.rng.int(free.length);
      var p = free.splice(k, 1)[0];
      this.cells[p.r][p.c] = this.makeUnit();
      made++;
    }
    return made;
  };

  /* Đổi chỗ / dời quân. Trả về true nếu bàn cờ có thay đổi. */
  Board.prototype.move = function (r1, c1, r2, c2) {
    if (r1 === r2 && c1 === c2) return false;
    var a = this.get(r1, c1);
    if (!a) return false;
    var b = this.get(r2, c2);
    this.cells[r2][c2] = a;
    this.cells[r1][c1] = b;      // b có thể null -> thành dời chỗ
    return true;
  };

  /*
   * Tìm mọi hàng >= minRun quân CÙNG heroId CÙNG grade (ngang hoặc dọc) rồi gộp.
   * Gộp lặp cho tới khi không còn hàng nào — gộp dây chuyền.
   * Trả về danh sách sự kiện gộp để UI/kỹ năng dùng.
   */
  Board.prototype.resolveMerges = function () {
    var events = [];
    var guard = 0;
    while (guard++ < 24) {
      var run = this.findRun();
      if (!run) break;
      events.push(this.mergeRun(run));
    }
    return events;
  };

  Board.prototype.findRun = function () {
    var minRun = CFG.merge.minRun;
    var r, c, i;
    // ngang
    for (r = 0; r < this.rows; r++) {
      c = 0;
      while (c < this.cols) {
        var u = this.cells[r][c];
        if (!u) { c++; continue; }
        var run = [{ r: r, c: c }];
        var cc = c + 1;
        while (cc < this.cols) {
          var v = this.cells[r][cc];
          if (v && v.heroId === u.heroId && v.grade === u.grade) { run.push({ r: r, c: cc }); cc++; }
          else break;
        }
        if (run.length >= minRun) return { dir: 'h', cells: run };
        c = cc > c ? cc : c + 1;
      }
    }
    // dọc
    for (c = 0; c < this.cols; c++) {
      r = 0;
      while (r < this.rows) {
        var u2 = this.cells[r][c];
        if (!u2) { r++; continue; }
        var run2 = [{ r: r, c: c }];
        var rr = r + 1;
        while (rr < this.rows) {
          var v2 = this.cells[rr][c];
          if (v2 && v2.heroId === u2.heroId && v2.grade === u2.grade) { run2.push({ r: rr, c: c }); rr++; }
          else break;
        }
        if (run2.length >= minRun) return { dir: 'v', cells: run2 };
        r = rr > r ? rr : r + 1;
      }
    }
    return null;
  };

  Board.prototype.mergeRun = function (run) {
    var cells = run.cells;
    var first = this.cells[cells[0].r][cells[0].c];
    var mid = cells[Math.floor(cells.length / 2)];
    var self = this;

    // dọn cả hàng
    cells.forEach(function (p) { self.cells[p.r][p.c] = null; });

    var grade = first.grade + 1;
    var extraGrade = false;
    // [APK] HeroFourMergeExtraGradeProbability = 0.5 — gộp 4 ô thì 50% được thêm 1 cấp
    if (cells.length >= 4 && this.rng.chance(CFG.merge.extraGradeChance)) {
      grade++; extraGrade = true;
    }

    var merged = this.makeUnit(
      { hero: DATA.BY_ID[first.heroId], level: first.level }, grade);
    this.cells[mid.r][mid.c] = merged;

    // [APK] HeroThreeMergeOneMoreProbability = 0.5 — gộp 3 ô thì 50% sinh thêm 1 quân
    var extraUnit = false;
    if (cells.length === 3 && this.rng.chance(CFG.merge.extraUnitChance)) {
      extraUnit = this.spawn(1) > 0;
    }

    return {
      size: cells.length, grade: grade, at: mid, name: merged.name,
      extraGrade: extraGrade, extraUnit: extraUnit, power: merged.power
    };
  };

  // Quái đánh vào một cột: trừ máu từng quân trong cột, dư thì trả về cho người chơi.
  Board.prototype.hitColumn = function (col, dmg) {
    var left = dmg, killed = 0;
    for (var r = this.rows - 1; r >= 0 && left > 0; r--) {
      var u = this.cells[r][col];
      if (!u) continue;
      var take = Math.min(left, u.hp);
      u.hp -= take;
      left -= take;
      if (u.hp <= 0) { this.cells[r][col] = null; killed++; }
    }
    return { overflow: left, killed: killed };
  };

  // ---------------------------------------------------------------- Battle

  function Battle(opts) {
    this.chapter = opts.chapter;
    this.day = opts.day;
    this.rng = new RNG(opts.seed || (opts.chapter * 1000 + opts.day));
    this.maxTurns = CFG.turnsFor(this.day);
    this.turn = 1;
    this.movesLeft = CFG.movesPerTurn;

    this.playerPowerMul = CFG.runPowerMul(this.day) * CFG.metaPowerMul(opts.heroLevel);
    this.board = new Board(opts.deck, this.rng, this.playerPowerMul);
    this.board.spawn(CFG.board.startUnits);
    this.board.resolveMerges();

    this.isBoss = CFG.isBossDay(this.day);
    var ratio = CFG.hpRatio(this.chapter, this.day);
    var chapMul = Math.pow(CFG.enemyPowerChapterMul, this.chapter - 1);

    // MỘT con quái, không phải một sân địch.
    this.foe = {
      name: opts.foeName || 'Quái',
      art: opts.foeArt || null,
      hpMax: Math.round(CFG.hero.enemyHpBase * ratio * (this.isBoss ? CFG.foe.bossHpMul : 1)),
      // Nhân CẢ runPowerMul: quân của người chơi cũng dày máu lên theo ngày, nếu đòn
      // quái đứng yên thì bàn không bao giờ thủng và ngày cuối chương hoá ra dễ nhất.
      atk: Math.round(CFG.foe.atkBase * chapMul * CFG.runPowerMul(this.day) *
                      (this.isBoss ? CFG.foe.bossAtkMul : 1)),
      targetCol: this.rng.int(CFG.board.cols),
      // [APK] boss_forecast_step = 10 — boss báo trước 10 BƯỚC. Quái thường báo ngắn hơn.
      fuse: this.isBoss ? CFG.bossForecastSteps : CFG.foe.normalForecastSteps,
      countdown: this.isBoss ? CFG.bossForecastSteps : CFG.foe.normalForecastSteps
    };
    this.foe.hp = this.foe.hpMax;

    /* Máu người chơi CŨNG phải nhân hệ số run theo ngày.
     * Bản trước chỉ nhân cho quân và cho đòn quái, còn máu người chơi đứng yên -> tới
     * ngày 8-9 một đòn tràn là chết, trận kết thúc ở lượt 4 và người chơi thua vì BỊ
     * GIẾT chứ không vì hết giờ. Trái hẳn kết luận [APK]: "bài toán đủ DPS trong ngần
     * ấy bước, không phải né chết". Nhân đều cả ba (quân, đòn quái, máu người chơi)
     * thì hệ số run triệt tiêu trên trục sống-chết, chỉ còn tác dụng trên trục DPS. */
    this.playerHpMax = Math.round(CFG.playerMaxHp(opts.heroLevel) * CFG.runPowerMul(this.day));
    this.playerHp = this.playerHpMax;

    this.skills = [];
    this.buffs = { atkMul: 1 };
    this.dryStreak = 0;
    this.log = [];
    this.over = false;
    this.won = false;
    this.lastMerges = [];
  }

  Battle.prototype._log = function (s) {
    this.log.push('L' + this.turn + ': ' + s);
    if (this.log.length > 60) this.log.shift();
  };

  Battle.prototype.canAct = function () { return !this.over && this.movesLeft > 0; };

  Battle.prototype.totalPower = function () {
    return Math.round(this.board.totalPower() * this.buffs.atkMul);
  };

  /* Kéo quân: (r1,c1) -> (r2,c2). Tốn 1 bước. */
  Battle.prototype.moveUnit = function (r1, c1, r2, c2) {
    if (!this.canAct()) return false;
    if (!this.board.get(r1, c1)) return false;
    if (!this.board.move(r1, c1, r2, c2)) return false;

    this.movesLeft--;
    var merges = this.board.resolveMerges();
    this.lastMerges = merges;
    for (var i = 0; i < merges.length; i++) {
      var m = merges[i];
      this._log('gộp ' + m.size + ' → ' + m.name + ' cấp ' + m.grade +
                (m.extraGrade ? ' (+1 cấp thưởng)' : '') + (m.extraUnit ? ' (+1 quân)' : ''));
      this._grantSkillBox(m.size);
    }
    // mỗi thao tác đưa đòn của quái tới gần hơn — [APK] boss_forecast_step đếm theo BƯỚC
    this.foe.countdown = Math.max(0, this.foe.countdown - 1);
    return true;
  };

  Battle.prototype.deleteAt = function (r, c) {
    if (!this.canAct()) return false;
    if (!this.board.get(r, c)) return false;
    this.board.set(r, c, null);
    this.movesLeft--;
    this.foe.countdown = Math.max(0, this.foe.countdown - 1);
    return true;
  };

  Battle.prototype._grantSkillBox = function (size) {
    var table = CFG.skillBox[Math.min(5, size)] || CFG.skillBox[3];
    var key = this.rng.weighted(table);
    if (key === 'atk' || key === 'charge') this.dryStreak++; else this.dryStreak = 0;
    if (this.dryStreak >= CFG.safetySkillAfterMisses) { key = 'heal'; this.dryStreak = 0; }
    if (this.skills.length >= CFG.retainSkillLimit) this.skills.shift();
    this.skills.push(key);
  };

  Battle.prototype.useSkill = function (idx) {
    if (this.over) return false;
    var key = this.skills[idx];
    if (!key) return false;
    this.skills.splice(idx, 1);
    var b = this.board;
    switch (key) {
      case 'atk': this.buffs.atkMul *= 1.25; break;
      case 'charge': this.foe.countdown = Math.min(this.foe.fuse, this.foe.countdown + 3); break;
      case 'wall':
        b.units().forEach(function (u) { u.hp = u.maxHp; });
        break;
      case 'pierce': this.foe.hp -= Math.round(this.totalPower() * 0.5); break;
      case 'heal':
        this.playerHp = Math.min(this.playerHpMax,
          this.playerHp + Math.round(this.playerHpMax * 0.15));
        break;
      case 'grade': {
        var us = b.units();
        if (us.length) {
          var t = this.rng.pick(us);
          t.grade++; applyGrade(t);
        }
        break;
      }
      case 'jackpot': this.buffs.atkMul *= 2; break;
    }
    this._log('dùng ' + (DATA.SKILLS[key] ? DATA.SKILLS[key].name : key));
    if (this.foe.hp <= 0) { this.over = true; this.won = true; }
    return true;
  };

  /*
   * Hết bước -> giải quyết lượt:
   *   quân bắn quái  ->  quái bắn vào cột đã báo  ->  sinh quân mới  ->  lượt kế
   */
  Battle.prototype.endTurn = function () {
    if (this.over) return null;
    var report = { dealt: 0, taken: 0, killed: 0, foeHit: false, col: this.foe.targetCol };

    // 1. mọi quân trên sân bắn
    report.dealt = this.totalPower();
    this.foe.hp -= report.dealt;
    this._log('bắn ' + report.dealt + ' vào ' + this.foe.name);
    this.buffs.atkMul = 1;
    if (this.foe.hp <= 0) {
      this.foe.hp = 0;
      this.over = true; this.won = true;
      return report;
    }

    // 2. quái đánh trả nếu đã hết ngòi
    if (this.foe.countdown <= 0) {
      var res = this.board.hitColumn(this.foe.targetCol, this.foe.atk);
      report.foeHit = true;
      report.killed = res.killed;
      report.taken = res.overflow;
      this.playerHp -= res.overflow;
      this._log(this.foe.name + ' đánh cột ' + (this.foe.targetCol + 1) +
                ': mất ' + res.killed + ' quân, chịu ' + res.overflow + ' sát thương');
      this.foe.targetCol = this.rng.int(CFG.board.cols);
      this.foe.countdown = this.foe.fuse;
    }

    if (this.playerHp <= 0) { this.playerHp = 0; this.over = true; this.won = false; return report; }

    // 3. quân mới + sang lượt
    this.board.spawn(CFG.board.spawnPerTurn);
    this.board.resolveMerges();
    this.turn++;
    this.movesLeft = CFG.movesPerTurn;

    // [APK] hết ngân sách lượt mà chưa hạ được quái = thua
    if (this.turn > this.maxTurns) { this.over = true; this.won = false; }
    return report;
  };

  root.SlimeEngine = { Board: Board, Battle: Battle, RNG: RNG, applyGrade: applyGrade };
  if (typeof module === 'object' && module.exports) module.exports = root.SlimeEngine;
})(typeof window !== 'undefined' ? window : globalThis);
