/*
 * SlimeClash — engine trận đấu.
 *
 * Mô hình: HAI bàn 6x6 giống hệt nhau về logic (_research/00-tong-hop-thiet-ke.md mục 3.2:
 * bố cục hai lưới xếp chồng dọc, đúng như bản DS gốc của Clash of Heroes). Bàn địch chỉ
 * khác ở chỗ render lật ngược. Nhờ vậy toàn bộ luật dưới đây dùng chung cho cả hai bên.
 *
 * Quy ước toạ độ: r = 0 là hàng SAU (xa địch nhất), r = rows-1 là hàng TRƯỚC (giáp mặt địch).
 * Quân rơi về phía hàng TRƯỚC (trọng lực hướng ra mặt trận), nên chồng quân luôn liền mạch
 * từ rows-1 đi ngược lên. "Đầu chồng" (front) = chỉ số r lớn nhất còn quân.
 *
 * Khác bản gốc Clash of Heroes ở đúng một chỗ, cố ý:
 *   - CoH chỉ cho nhấc quân ở hàng đáy. Ở đây nhấc được MỌI quân rảnh (không thuộc đội
 *     hình, không phải tường). Lý do: màn cảm ứng 6 cột, bắt người chơi lùa quân xuống đáy
 *     trước khi nhấc là thao tác thừa và dễ bấm nhầm (_research/mobile-adaptation.md).
 */
(function (root) {
  'use strict';

  var CFG = root.CFG || require('./config.js');
  var DATA = root.DATA || require('./data.js');

  // RNG tất định — cùng seed ra cùng ván. Cần cho test headless và cho việc chơi lại ải.
  function RNG(seed) {
    this.s = (seed >>> 0) || 1;
  }
  RNG.prototype.next = function () {
    // xorshift32
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
  // Chọn theo trọng số: bảng [[key, weight], ...]
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
    this.powerMul = powerMul || 1;
    this.cols = CFG.board.cols;
    this.rows = CFG.board.rows;
    this.deck = deck;            // [{hero, level}]
    this.rng = rng;
    this.cells = [];
    for (var r = 0; r < this.rows; r++) {
      this.cells.push(new Array(this.cols).fill(null));
    }
    this.nextFormationId = 1;
    this.pending = [];           // đội hình đang nạp
  }

  Board.prototype.get = function (r, c) { return this.cells[r][c]; };
  Board.prototype.set = function (r, c, v) { this.cells[r][c] = v; };

  Board.prototype.inside = function (r, c) {
    return r >= 0 && r < this.rows && c >= 0 && c < this.cols;
  };

  // Chỉ số r lớn nhất còn quân trong cột (đầu chồng, chỗ hứng đòn trước tiên).
  Board.prototype.frontRow = function (c) {
    for (var r = this.rows - 1; r >= 0; r--) if (this.cells[r][c]) return r;
    return -1;
  };

  Board.prototype.spawnUnit = function () {
    var cores = this.deck.filter(function (d) { return d.hero.klass === 'core'; });
    var others = this.deck.filter(function (d) { return d.hero.klass !== 'core'; });
    // Elite/champion hiếm hơn hẳn core, nếu không bàn cờ toàn quân to.
    var d = (others.length && this.rng.chance(0.12)) ? this.rng.pick(others) : this.rng.pick(cores);
    var st = DATA.statAt(d.hero, d.level);
    return {
      heroId: d.hero.id, name: d.hero.name, color: d.hero.color, klass: d.hero.klass,
      level: d.level,
      hp: Math.max(1, Math.round(st.hp * this.powerMul)),
      maxHp: Math.max(1, Math.round(st.hp * this.powerMul)),
      power: Math.max(1, Math.round(st.power * this.powerMul)),
      charge: 0, fid: 0, kind: 'idle', grade: 1
    };
  };

  // Trọng lực: dồn mọi quân về phía hàng TRƯỚC (r lớn), giữ nguyên thứ tự tương đối.
  Board.prototype.settle = function () {
    for (var c = 0; c < this.cols; c++) {
      var stack = [];
      for (var r = 0; r < this.rows; r++) if (this.cells[r][c]) stack.push(this.cells[r][c]);
      for (var r2 = 0; r2 < this.rows; r2++) this.cells[r2][c] = null;
      // stack[0] là quân ở sau nhất -> đặt sao cho quân cuối cùng nằm ở rows-1
      var start = this.rows - stack.length;
      for (var i = 0; i < stack.length; i++) this.cells[start + i][c] = stack[i];
    }
  };

  // Đổ đầy bàn: mỗi cột được bù quân mới cho tới khi đủ `fillTo` quân.
  Board.prototype.refill = function (fillTo) {
    var target = fillTo == null ? this.rows - 1 : fillTo;
    for (var c = 0; c < this.cols; c++) {
      var count = 0;
      for (var r = 0; r < this.rows; r++) if (this.cells[r][c]) count++;
      while (count < target) {
        // chèn vào hàng sau cùng còn trống
        var placed = false;
        for (var rr = 0; rr < this.rows; rr++) {
          if (!this.cells[rr][c]) { this.cells[rr][c] = this.spawnUnit(); placed = true; break; }
        }
        if (!placed) break;
        count++;
      }
    }
    this.settle();
  };

  Board.prototype.countUnits = function () {
    var n = 0;
    for (var r = 0; r < this.rows; r++)
      for (var c = 0; c < this.cols; c++) if (this.cells[r][c]) n++;
    return n;
  };

  // Quân rảnh: nhấc lên được (không thuộc đội hình đang nạp, không phải tường).
  Board.prototype.isFree = function (r, c) {
    var u = this.cells[r][c];
    return !!u && u.kind === 'idle';
  };

  Board.prototype.removeAt = function (r, c) {
    var u = this.cells[r][c];
    this.cells[r][c] = null;
    this.settle();
    return u;
  };

  // Thả một quân vào cột: nằm ở hàng SAU cùng còn trống rồi rơi xuống.
  Board.prototype.dropInto = function (c, unit) {
    for (var r = 0; r < this.rows; r++) {
      if (!this.cells[r][c]) { this.cells[r][c] = unit; this.settle(); return true; }
    }
    return false;
  };

  /*
   * Dò đội hình mới sinh ra.
   *  - Dọc, 3+ quân cùng màu liền nhau trong 1 cột  -> ĐỘI HÌNH TẤN CÔNG
   *  - Ngang, 3+ quân cùng màu liền nhau trong 1 hàng -> TƯỜNG
   *  - Elite cần `need` core cùng màu ngay phía sau; champion cần 4.
   * Trả về danh sách đội hình vừa tạo (để tính hộp kỹ năng).
   */
  Board.prototype.detectFormations = function () {
    var made = [];
    var c, r, i;

    // --- dọc: tấn công
    for (c = 0; c < this.cols; c++) {
      r = this.rows - 1;
      while (r >= 0) {
        var u = this.cells[r][c];
        if (!u || u.kind !== 'idle') { r--; continue; }
        var run = [{ r: r, c: c }];
        var rr = r - 1;
        while (rr >= 0) {
          var v = this.cells[rr][c];
          if (v && v.kind === 'idle' && v.color === u.color) { run.push({ r: rr, c: c }); rr--; }
          else break;
        }
        if (run.length >= 3) {
          made.push(this._makeAttack(run));
          r = rr;
        } else {
          r--;
        }
      }
    }

    // --- ngang: tường
    for (r = 0; r < this.rows; r++) {
      c = 0;
      while (c < this.cols) {
        var u2 = this.cells[r][c];
        if (!u2 || u2.kind !== 'idle') { c++; continue; }
        var run2 = [{ r: r, c: c }];
        var cc = c + 1;
        while (cc < this.cols) {
          var v2 = this.cells[r][cc];
          if (v2 && v2.kind === 'idle' && v2.color === u2.color) { run2.push({ r: r, c: cc }); cc++; }
          else break;
        }
        if (run2.length >= 3) { made.push(this._makeWall(run2)); c = cc; }
        else c++;
      }
    }

    return made;
  };

  Board.prototype._makeAttack = function (run) {
    var fid = this.nextFormationId++;
    var lead = this.cells[run[0].r][run[0].c];       // quân ở đầu chồng dẫn đòn
    var power = 0, self = this;
    run.forEach(function (p) { power += self.cells[p.r][p.c].power; });

    // [APK] ghép 4 ô -> 50% được +1 cấp (HeroFourMergeExtraGradeProbability)
    var grade = 1;
    if (run.length >= 4 && this.rng.chance(CFG.merge.extraGradeChance)) {
      grade = CFG.merge.gradeMul;
    }
    var charge = CFG.charge[lead.klass] || CFG.charge.core;

    run.forEach(function (p) {
      var u = self.cells[p.r][p.c];
      u.kind = 'charging'; u.fid = fid; u.charge = charge; u.grade = grade;
    });
    return {
      fid: fid, kind: 'attack', col: run[0].c, color: lead.color,
      size: run.length, power: Math.round(power * grade), charge: charge,
      cells: run
    };
  };

  Board.prototype._makeWall = function (run) {
    var fid = this.nextFormationId++;
    var hp = 0, self = this;
    run.forEach(function (p) { hp += self.cells[p.r][p.c].maxHp; });
    run.forEach(function (p) {
      var u = self.cells[p.r][p.c];
      u.kind = 'wall'; u.fid = fid; u.hp = hp; u.maxHp = hp;
    });
    return { fid: fid, kind: 'wall', size: run.length, hp: hp, cells: run };
  };

  // Đội hình tấn công đã nạp xong, gom theo fid.
  Board.prototype.readyFormations = function () {
    var map = {}, r, c;
    for (r = 0; r < this.rows; r++) {
      for (c = 0; c < this.cols; c++) {
        var u = this.cells[r][c];
        if (u && u.kind === 'charging' && u.charge <= 0) {
          if (!map[u.fid]) map[u.fid] = { fid: u.fid, col: c, power: 0, cells: [], grade: u.grade };
          map[u.fid].power += u.power;
          map[u.fid].cells.push({ r: r, c: c });
        }
      }
    }
    return Object.keys(map).map(function (k) {
      var f = map[k];
      f.power = Math.round(f.power * (f.grade || 1));
      return f;
    });
  };

  Board.prototype.tickCharge = function (amount) {
    var n = amount == null ? 1 : amount;
    for (var r = 0; r < this.rows; r++)
      for (var c = 0; c < this.cols; c++) {
        var u = this.cells[r][c];
        if (u && u.kind === 'charging') u.charge = Math.max(0, u.charge - n);
      }
  };

  Board.prototype.clearFormation = function (fid) {
    for (var r = 0; r < this.rows; r++)
      for (var c = 0; c < this.cols; c++) {
        var u = this.cells[r][c];
        if (u && u.fid === fid) this.cells[r][c] = null;
      }
    this.settle();
  };

  /*
   * Nhận một đòn `power` vào cột `col`. Sát thương xuyên tuyến: trừ dần máu từng quân
   * từ đầu chồng đi ngược về sau; quân chết thì biến mất; dư bao nhiêu trả về cho hero.
   * ([CoH] _research/clash-of-heroes-combat.md mục 6)
   */
  Board.prototype.takeHit = function (col, power, opts) {
    var ignoreWall = opts && opts.ignoreWall;
    var left = power, killed = 0;
    for (var r = this.rows - 1; r >= 0 && left > 0; r--) {
      var u = this.cells[r][col];
      if (!u) continue;
      if (ignoreWall && u.kind === 'wall') continue;
      var absorbed = Math.min(left, u.hp);
      u.hp -= absorbed;
      left -= absorbed;
      if (u.hp <= 0) { this.cells[r][col] = null; killed++; }
    }
    this.settle();
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

    // Sức mạnh người chơi = nhân theo NGÀY trong run (roguelike) x nhân vĩnh viễn từ cấp Hero.
    // Sức mạnh địch = chỉ nhân theo CHƯƠNG — [APK] attack_ratio = 1, sát thương địch
    // không tăng theo ngày.
    this.playerPowerMul = CFG.runPowerMul(this.day) * CFG.metaPowerMul(opts.heroLevel);
    this.enemyPowerMul = Math.pow(CFG.enemyPowerChapterMul, this.chapter - 1);
    this.player = new Board(opts.deck, this.rng, this.playerPowerMul);
    this.enemy = new Board(opts.enemyDeck, this.rng, this.enemyPowerMul);
    this.player.refill();
    this.enemy.refill();
    this.player.detectFormations();   // dọn đội hình sinh sẵn lúc đổ bàn
    this.enemy.detectFormations();

    var ratio = CFG.hpRatio(this.chapter, this.day);
    this.enemyHpMax = Math.round(CFG.hero.enemyHpBase * ratio);
    this.enemyHp = this.enemyHpMax;
    this.playerHpMax = CFG.playerMaxHp(opts.heroLevel);
    this.playerHp = this.playerHpMax;

    this.isBoss = CFG.isBossDay(this.day);
    // [APK] boss_forecast_step = 10 — boss báo trước đúng 10 bước.
    this.bossCountdown = this.isBoss ? CFG.bossForecastSteps : 0;
    this.bossHit = Math.round(this.playerHpMax * 0.45);   // [TUNE] đủ đau để phải chặn

    this.skills = [];          // kỹ năng đang giữ, trần CFG.retainSkillLimit
    this.buffs = { atkMul: 1, pierce: false, jackpot: false };
    this.dryStreak = 0;        // đếm hộp liên tiếp không ra gì tốt -> bảo hiểm
    this.log = [];
    this.over = false;
    this.won = false;
    this.pickedUp = null;      // { unit, r, c }
  }

  Battle.prototype._log = function (s) {
    this.log.push('L' + this.turn + ': ' + s);
    if (this.log.length > 60) this.log.shift();
  };

  Battle.prototype.canAct = function () {
    return !this.over && this.movesLeft > 0;
  };

  Battle.prototype.pickUp = function (r, c) {
    if (!this.canAct() || this.pickedUp) return false;
    if (!this.player.isFree(r, c)) return false;
    this.pickedUp = { unit: this.player.removeAt(r, c), from: { r: r, c: c } };
    return true;
  };

  Battle.prototype.cancelPick = function () {
    if (!this.pickedUp) return false;
    // trả về đúng cột cũ, không tốn move ([MOB] thả hụt không bị phạt)
    this.player.dropInto(this.pickedUp.from.c, this.pickedUp.unit);
    this.pickedUp = null;
    return true;
  };

  Battle.prototype.dropAt = function (col) {
    if (!this.pickedUp) return false;
    var u = this.pickedUp.unit;
    if (!this.player.dropInto(col, u)) { this.cancelPick(); return false; }
    this.pickedUp = null;
    this.movesLeft--;
    this._afterBoardChange(this.player, true);
    return true;
  };

  // Xoá 1 quân, tốn 1 move ([CoH] xoá quân cũng là một move)
  Battle.prototype.deleteAt = function (r, c) {
    if (!this.canAct() || this.pickedUp) return false;
    if (!this.player.isFree(r, c)) return false;
    this.player.removeAt(r, c);
    this.movesLeft--;
    this._afterBoardChange(this.player, true);
    return true;
  };

  Battle.prototype._afterBoardChange = function (board, isPlayer) {
    var made = board.detectFormations();
    if (isPlayer) {
      for (var i = 0; i < made.length; i++) this._grantSkillBox(made[i]);
      // [APK] ghép 3 -> 50% sinh thêm 1 quân (HeroThreeMergeOneMoreProbability)
      for (var j = 0; j < made.length; j++) {
        if (made[j].kind === 'attack' && made[j].size === 3 &&
            this.rng.chance(CFG.merge.extraUnitChance)) {
          board.refill(board.rows);
        }
      }
      if (this.isBoss && this.bossCountdown > 0) this.bossCountdown--;
    }
    board.refill();
  };

  Battle.prototype._grantSkillBox = function (f) {
    var table = CFG.skillBox[Math.min(5, f.size)] || CFG.skillBox[3];
    var key = this.rng.weighted(table);
    // [APK] SafetySkills — chuỗi xui quá dài thì ép ra kỹ năng bảo hiểm.
    if (key === 'atk' || key === 'charge') this.dryStreak++; else this.dryStreak = 0;
    if (this.dryStreak >= CFG.safetySkillAfterMisses) { key = 'heal'; this.dryStreak = 0; }
    if (this.skills.length >= CFG.retainSkillLimit) this.skills.shift();
    this.skills.push(key);
    this._log('nhận kỹ năng ' + (DATA.SKILLS[key] ? DATA.SKILLS[key].name : key));
  };

  Battle.prototype.useSkill = function (idx) {
    if (this.over) return false;
    var key = this.skills[idx];
    if (!key) return false;
    this.skills.splice(idx, 1);
    var b = this.player;
    switch (key) {
      case 'atk': this.buffs.atkMul *= 1.25; break;
      case 'charge': b.tickCharge(1); break;
      case 'wall':
        for (var r = 0; r < b.rows; r++) for (var c = 0; c < b.cols; c++) {
          var u = b.get(r, c);
          if (u && u.kind === 'wall') { u.hp *= 2; u.maxHp *= 2; }
        }
        break;
      case 'pierce': this.buffs.pierce = true; break;
      case 'heal':
        this.playerHp = Math.min(this.playerHpMax, this.playerHp + Math.round(this.playerHpMax * 0.15));
        break;
      case 'grade': {
        var fs = [];
        for (var r2 = 0; r2 < b.rows; r2++) for (var c2 = 0; c2 < b.cols; c2++) {
          var v = b.get(r2, c2);
          if (v && v.kind === 'charging') fs.push(v);
        }
        if (fs.length) {
          var target = this.rng.pick(fs).fid;
          for (var r3 = 0; r3 < b.rows; r3++) for (var c3 = 0; c3 < b.cols; c3++) {
            var w = b.get(r3, c3);
            if (w && w.fid === target) w.grade = (w.grade || 1) * CFG.merge.gradeMul;
          }
        }
        break;
      }
      case 'jackpot': this.buffs.jackpot = true; break;
    }
    this._log('dùng ' + (DATA.SKILLS[key] ? DATA.SKILLS[key].name : key));
    return true;
  };

  /*
   * Bắn toàn bộ đội hình đã nạp xong của `from` sang `to`.
   * [CoH] fusion (2 đội hình cùng cột) x3; link (>=2 đội hình bắn cùng lượt) x3.3.
   */
  Battle.prototype._fire = function (from, to, isPlayer) {
    var ready = from.readyFormations();
    if (!ready.length) return 0;

    var byCol = {};
    ready.forEach(function (f) { (byCol[f.col] = byCol[f.col] || []).push(f); });

    var mul = 1;
    var cols = Object.keys(byCol);
    var anyFusion = cols.some(function (k) { return byCol[k].length >= 2; });
    if (anyFusion) mul = CFG.fusionMul;
    else if (ready.length >= 2) mul = CFG.linkMul;

    if (isPlayer) {
      mul *= this.buffs.atkMul;
      if (this.buffs.jackpot) mul *= 2;
    }

    var total = 0, self = this;
    cols.forEach(function (k) {
      var col = parseInt(k, 10);
      var power = 0;
      byCol[k].forEach(function (f) { power += f.power; });
      power = Math.round(power * mul);
      var res = to.takeHit(col, power, { ignoreWall: isPlayer && self.buffs.pierce });
      total += res.overflow;
      byCol[k].forEach(function (f) { from.clearFormation(f.fid); });
    });

    if (isPlayer) { this.buffs.atkMul = 1; this.buffs.jackpot = false; this.buffs.pierce = false; }
    from.refill();
    return total;
  };

  Battle.prototype.endTurn = function () {
    if (this.over) return;
    if (this.pickedUp) this.cancelPick();

    // 1. người chơi bắn
    var dmg = this._fire(this.player, this.enemy, true);
    if (dmg > 0) {
      this.enemyHp -= dmg;
      this._log('bạn gây ' + dmg + ' lên hero địch');
    }
    if (this.enemyHp <= 0) { this.over = true; this.won = true; return; }

    // 2. địch đi
    if (root.SlimeAI) root.SlimeAI.takeTurn(this);
    var edmg = this._fire(this.enemy, this.player, false);
    if (edmg > 0) {
      this.playerHp -= edmg;
      this._log('địch gây ' + edmg + ' lên bạn');
    }

    // 3. boss đếm ngược
    if (this.isBoss) {
      this.bossCountdown--;
      if (this.bossCountdown <= 0) {
        this.playerHp -= this.bossHit;
        this._log('BOSS RA ĐÒN LỚN: -' + this.bossHit);
        this.bossCountdown = CFG.bossForecastSteps;
      }
    }

    if (this.playerHp <= 0) { this.over = true; this.won = false; return; }

    // 4. sang lượt mới
    this.player.tickCharge(1);
    this.enemy.tickCharge(1);
    this.turn++;
    this.movesLeft = CFG.movesPerTurn;

    // [APK] hết ngân sách bước mà chưa hạ được địch = thua.
    // "Độ khó là bài toán đủ DPS trong 6 bước" — datamine mục 5.
    if (this.turn > this.maxTurns) { this.over = true; this.won = false; }
  };

  root.SlimeEngine = { Board: Board, Battle: Battle, RNG: RNG };
  if (typeof module === 'object' && module.exports) module.exports = root.SlimeEngine;
})(typeof window !== 'undefined' ? window : globalThis);
