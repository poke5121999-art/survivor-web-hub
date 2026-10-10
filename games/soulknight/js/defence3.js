// Thần Điện Thủ Hộ đợt 4 (nối vào js/defence.js + js/defence2.js): sát thương tay không (d.bareDmg) và cấp + của vũ khí nối vào đòn, Cờ Lê có nút
// bấm, thiên phú mỗi cấp của Quan Tế (làm mới bằng ngọc), đợt giới thiệu 0-1 và Robot Tự Nổ, Thầy Hướng Dẫn / Bậc Thầy Vũ Khí (nhốt trong lồng ở
// phòng khác, cứu về) / Kho, nhiệm vụ (3-6 trong 12), ngọc thưởng cuối ván. Số liệu: MODES.md mục 2f [WIKI Origin/SP/Mentor/WS/WH; LOC defence/*];
// chỗ nguồn không có số ghi [ƯỚC LƯỢNG]. Chưa làm: tools/polish/GAPS.md mục Thần Điện.
(function () {
  'use strict';
  const SK = window.SK, Df = SK.defence; if (!Df) return;
  const C = Df.C, D = SK.D, DS = SK.DS, W = SK.world, T = SK.TILE;
  const on = G => G && G.mode === 'defence' && G.defence;
  const say = (G, m, t) => { G.toast(m, t || 2.2); return m; };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const hasBuff = (p, id) => !!(p.buffs && p.buffs.indexOf(id) >= 0);

  Object.assign(C, {
    // tay không [WIKI SP "Bare Hands"]: vũ khí lớp Fighter / Airbender / Transcendent (cùng danh sách rooms.js BARE)
    bareRe: /^(GunInitFighter|WeaponInitAirbender|GunInitTranscendent)$/,
    plusMax: 18, plusDmg: 0.05,          // vũ khí +N: mỗi +1 thêm 5% sát thương [ƯỚC LƯỢNG: wiki bản mới chỉ nói "cấp", bản cũ 10% sát thương gốc / cấp]
    accMul: 1.1,                          // phụ kiện miễn phí của Bậc Thầy Vũ Khí khi được cứu: +10% sát thương [ƯỚC LƯỢNG; hệ phụ kiện đầy đủ ở js/dnpc2.js]
    talentRefresh: [100, 200],           // làm mới thiên phú tối đa 2 lần, 100 rồi 200 ngọc [WIKI SP; LOC defence/refresh_buff]
    // Đợt giới thiệu 0-1 [WIKI Origin "Wave Defense"]: cấp 5, kỹ năng cấp 10, vũ khí +12; sau cảnh phim về cấp 0 / kỹ năng 0 / vũ khí +6
    intro: { delay: 8, level: 5, skillLv: 10, plus: 12, after: 6, towers: [['rage_gun_tower', 2], ['chain_laser_tower', 2], ['hurricane_device', 1]],
      robotSpeed: 34, robotHp: 99999, fuseDist: 56, fuse: 2.2, blastR: 70, blastDmg: 400, tail: 3 },   // tốc, nổ, bán kính, sát thương [ƯỚC LƯỢNG]
    // Thầy Hướng Dẫn [WIKI Mentor]: giá vàng cấp 1-15; mỗi cấp web = hồi chiêu kỹ năng x0,97 [ƯỚC LƯỢNG: bảng hiệu ứng riêng từng kỹ năng không đưa vào]
    mentorCost: [100, 125, 150, 175, 200, 240, 280, 320, 360, 400, 500, 600, 800, 1000, 1200], mentorCd: 0.97,
    // Bậc Thầy Vũ Khí [WIKI Weaponsmith]: hàng = phẩm trắng, lục, lam, tím, cam, đỏ, hồng; cột = +1..+18
    smithCost: [
      [20, 40, 60, 80, 100, 125, 150, 175, 200, 240, 280, 320, 360, 400, 600, 800, 1000, 1200],
      [24, 48, 72, 96, 120, 150, 180, 210, 240, 288, 336, 384, 432, 480, 720, 960, 1200, 1440],
      [28, 56, 84, 112, 140, 175, 210, 245, 280, 336, 392, 448, 504, 560, 840, 1120, 1400, 1680],
      [32, 64, 96, 128, 160, 200, 240, 280, 320, 384, 448, 512, 576, 640, 960, 1280, 1600, 1920],
      [36, 72, 108, 144, 180, 225, 270, 315, 360, 432, 504, 576, 648, 720, 1080, 1440, 1800, 2160],
      [40, 80, 120, 160, 200, 250, 300, 350, 400, 480, 560, 640, 720, 800, 1200, 1600, 2000, 2400],
      [44, 88, 132, 176, 220, 275, 330, 385, 440, 528, 616, 704, 792, 880, 1320, 1760, 2200, 2640]],
    smithRate: [
      [100, 96, 92, 88, 84, 80, 76, 72, 68, 64, 60, 54, 50, 46, 44, 40, 36, 32],
      [98, 94, 90, 86, 82, 78, 74, 70, 66, 62, 58, 54, 50, 46, 42, 38, 34, 30],
      [96, 92, 88, 84, 80, 76, 72, 68, 64, 60, 54, 50, 46, 44, 40, 36, 32, 28],
      [94, 90, 86, 82, 78, 74, 70, 66, 62, 58, 54, 50, 46, 42, 38, 34, 30, 26],
      [92, 88, 84, 80, 76, 72, 68, 64, 60, 54, 50, 46, 44, 40, 36, 32, 28, 24],
      [90, 86, 82, 78, 74, 70, 66, 62, 58, 54, 50, 46, 42, 38, 34, 30, 26, 22],
      [88, 84, 80, 76, 72, 68, 64, 60, 54, 50, 46, 44, 40, 36, 32, 28, 24, 20]],
    smithFailBonus: 0.05,                // mỗi lần hỏng thì lần kế +5% thành công, mất khi thành công [WIKI WS]
    // Kho [WIKI WH]
    storeAfter: 6, remakeMax: 15, remakeBig: 0.1, rarityMax: 6,   // vũ khí rơi sau ~6 giây về Kho; trần cấp 15; "Đại thành công" 10% [ƯỚC LƯỢNG]; web chưa có phẩm hồng ở bể đúc nên trần 6
    // Nhiệm vụ [WIKI Origin "Quests"]: 3-6 trong 12 mỗi ván
    questMin: 3, questMax: 6,
    // Thưởng cuối ván [WIKI Origin "Rewards"]
    gemPerWave: 50, gemWin: 850, gemCap: 3500, gemCapBuff: 4375
  });

  // ================================================================ 1. sát thương tay không + cấp + vào đòn người chơi
  // Đòn của người chơi = đạn có owner là người chơi (actors.js gán G._hitBullet quanh SK.hurtEnemy). Đòn kỹ năng (_skHit) không tính.
  const prevHurt = SK.hurtEnemy;
  SK.hurtEnemy = function (G, e, dmg, ...rest) {
    const d = on(G);
    if (d && dmg > 0 && !G._skHit) {
      const b = G._hitBullet, p = G.player;
      if (b && b.owner === p) {
        const w = p.weapons[p.cur];
        if (w && w.def) {
          const mulv = (1 + C.plusDmg * (w.plus || 0)) * (w.acc ? C.accMul : 1);
          if (mulv !== 1) dmg = Math.round(dmg * mulv);
          const cls = w.def.w86 && w.def.w86.cls;
          if (d.bareDmg && cls && C.bareRe.test(cls)) dmg += d.bareDmg;
        }
        if (d.flatDmg) dmg += d.flatDmg;
      }
    }
    return prevHurt.call(this, G, e, dmg, ...rest);
  };
  const plusName = w => (DS.weapons[w.id] ? DS.weapons[w.id].name : w.id) + (w.plus ? ' +' + w.plus : '');
  Df.plusName = plusName;

  // game.js tạo vũ khí mới mỗi lần nhặt nên w.plus mất: theo dõi vũ khí rơi / được nhặt để giữ cấp + (ground item mang it.plus)
  function plusTrack(G) {
    const d = G.defence, p = G.player, cur = p.weapons[p.cur], tr = d.trk;
    if (tr && tr.w !== cur && p.weapons.indexOf(tr.w) < 0) {
      if (cur && cur.plus == null) { const it = (d.lastItems || []).find(x => G.items.indexOf(x) < 0 && x.id === cur.id && x.plus); if (it) cur.plus = it.plus; }
      if (tr.plus || tr.acc) {
        const n = G.items.find(x => (d.lastItems || []).indexOf(x) < 0 && x.id === tr.id && x.plus == null);
        if (n) { n.plus = tr.plus; n.acc = tr.acc; }
      }
    }
    d.trk = { w: cur, id: cur && cur.id, plus: cur && cur.plus || 0, acc: !!(cur && cur.acc) };
    d.lastItems = G.items.slice();
  }
  // Kho: vũ khí nằm dưới đất ~6 giây thì tự về Kho
  function storeTick(G) {
    const d = G.defence;
    if (d.intro && d.intro.on) return;
    for (const it of G.items.slice()) {
      if (it.t < C.storeAfter) continue;
      G.items.splice(G.items.indexOf(it), 1);
      d.store.push({ id: it.id, plus: it.plus || 0, acc: !!it.acc }); say(G, DS.weapons[it.id].name + ' đã về Kho', 1.6);
    }
  }

  // ================================================================ 2. Cờ Lê: nhấc tháp / phá tháp hỏng
  Df.wrenchToggle = function (G) {
    const d = G.defence;
    if (d.intro && d.intro.on) return { ok: false, why: say(G, 'Tháp có sẵn chưa dùng Cờ Lê được') };
    if (d.wrench < 1 && !d.wrenchMode) return { ok: false, why: say(G, 'Hết Cờ Lê (mua ở Thương Nhân)') };
    d.wrenchMode = !d.wrenchMode; d.carry = null;
    say(G, d.wrenchMode ? 'Cờ Lê: chọn tháp để nhấc (hoặc tháp hỏng để phá)' : 'Cất Cờ Lê', 2.2); return { ok: true, mode: d.wrenchMode };
  };
  Df.breakTower = function (G, padIdx) {
    const d = G.defence, pad = d.pads[padIdx], t = pad && pad.tower;
    if (!t || !t.ally.dead) return { ok: false, why: 'not broken' };
    if (d.wrench < 1) return { ok: false, why: say(G, 'Hết Cờ Lê') };
    d.wrench--; pad.tower = null; d.towers = d.towers.filter(x => x !== t); t.ally.gone = true;
    say(G, 'Đã phá ' + C.towers[t.id].name); SK.emit('towerBreak', G, t); return { ok: true };
  };
  // Nền Tháp bấm E: trả true nếu đã xử lý (tháp có sẵn đợt giới thiệu; Cờ Lê)
  Df.padHook = function (G, i) {
    const d = G.defence, pad = d.pads[i];
    if (pad.locked) { say(G, 'Tháp có sẵn, chưa tương tác được'); return true; }
    if (!d.wrenchMode) return false;
    if (d.carry == null) {
      if (!pad.tower) { say(G, 'Chọn tháp để nhấc'); return true; }
      if (pad.tower.ally.dead) { const r = Df.breakTower(G, i); if (r.ok) d.wrenchMode = false; return true; }
      d.carry = i; say(G, 'Đã nhấc ' + C.towers[pad.tower.id].name + ', chọn Nền Tháp trống'); return true;
    }
    if (d.carry === i) { d.carry = null; say(G, 'Bỏ nhấc'); return true; }
    const r = Df.moveTower(G, d.carry, i); if (r.ok) { d.wrenchMode = false; d.carry = null; }
    return true;
  };
  Df.padLabel = function (d, pad, i) {
    if (pad.locked) return 'Tháp có sẵn (chưa tương tác được)';
    if (!d.wrenchMode) return null;
    if (d.carry != null) return d.carry === i ? 'Cờ Lê: bỏ nhấc' : pad.tower ? 'Nền Tháp đã có tháp' : 'Cờ Lê: đặt tháp ở đây';
    if (!pad.tower) return 'Cờ Lê: Nền Tháp trống';
    return pad.tower.ally.dead ? 'Cờ Lê: phá ' + C.towers[pad.tower.id].name + ' hỏng' : 'Cờ Lê: nhấc ' + C.towers[pad.tower.id].name;
  };

  // ================================================================ 3. thiên phú mỗi cấp của Quan Tế
  // Bốc 3 thiên phú thường (bể thật của rooms.js), chọn 1 bằng phím 1-3 / chạm thẻ; làm mới tối đa 2 lần, tốn 100 rồi 200 ngọc.
  Df.offerTalent = function (G, ids) {
    const R = SK.ROOMS, d = G.defence, p = G.player; if (!R || !R.openChoice) return false;
    if (R.choice.open) return false;
    if ((p.buffs || []).length >= R.buffSlots()) { say(G, 'Đã đầy ô thiên phú', 2.5); return false; }
    R.choice.rerolls = C.talentRefresh.length; d.talentRe = 0;
    if (!R.openChoice(ids)) return false;
    G.hold = true; d.talentOpen = true;
    const ld = SK.loading; if (ld) { ld.on = true; ld.t = 0; ld.outT = -1; ld.tip = ''; }   // bảng thẻ vẽ trên màn tải (js/loading.js)
    return true;
  };
  const lu0 = Df.levelUp;
  Df.levelUp = function (G) {
    const r = lu0.apply(this, arguments);
    if (r && r.ok) Df.offerTalent(G);
    return r;
  };
  (function hookReroll() {
    const R = SK.ROOMS; if (!R || !R.reroll || R.reroll.dwrap) return;
    const o = R.reroll;
    R.reroll = function () {
      const G = SK.G, d = on(G);
      if (!d || !d.talentOpen) return o.apply(this, arguments);
      const cost = C.talentRefresh[d.talentRe];
      if (cost == null || !R.choice.open) return false;
      const pr = SK.profile;
      if (!pr || pr.gems < cost) { say(G, 'Không đủ ngọc (cần ' + cost + ')', 2); return false; }
      const ok = o.apply(this, arguments);
      if (ok) { pr.spend(cost); d.talentRe++; d.gemSpent = (d.gemSpent || 0) + cost; }
      return ok;
    };
    R.reroll.dwrap = true;
  })();
  function talentWatch(G) {
    const d = G.defence, R = SK.ROOMS;
    if (d.talentOpen && !(R && R.choice.open)) { d.talentOpen = false; d.talents = (d.talents || 0) + 1; const ld = SK.loading; if (ld && ld.on) ld.outT = 0; }
  }

  // ================================================================ 4. đợt giới thiệu 0-1 + Robot Tự Nổ
  const boost = (G, k) => {   // k = +1 áp, -1 gỡ chỉ số "cấp 5" (+8 máu, +4 giáp, +100 NL, +5 tay không mỗi cấp)
    const d = G.defence, p = G.player, n = C.intro.level * k;
    p.hpMax += C.lvHp * n; p.armorMax = (p.armorMax || 0) + C.lvArmor * n; p.energyMax += C.lvEnergy * n; d.bareDmg += C.lvBare * n;
    p.hp = Math.min(p.hp, p.hpMax); p.armor = Math.min(p.armor, p.armorMax); p.energy = Math.min(p.energy, p.energyMax);
    if (k > 0) { p.hp = p.hpMax; p.armor = p.armorMax; p.energy = p.energyMax; }
  };
  const setSkillLv = (G, n) => {
    const d = G.defence; G.mods = G.mods || {};
    d.skillLv = n; G.mods.skillCdMul = d.cdBase * Math.pow(C.mentorCd, n);
  };
  Df.skipPlot = false;   // "Bỏ qua cốt truyện" [LOC defence/skip_plot]: bật thì không có đợt giới thiệu và vũ khí không được tăng
  function introStart(G) {
    const d = G.defence, p = G.player, I = C.intro;
    d.intro = { on: true, step: 'fight', robot: null, fuseT: 0, tailT: 0 };
    boost(G, 1); setSkillLv(G, I.skillLv);
    const w = p.weapons[p.cur]; if (w) w.plus = I.plus;
    d.zone = 0; d.wave = 0; d.phase = 'wait'; d.timer = I.delay;
    const toast = G.toast; G.toast = () => {};
    const coins = d.coins;
    I.towers.forEach(([id, star], i) => { d.coins = 99; const r = Df.place(G, i, id); if (r.ok) { r.tower.star = star; d.pads[i].locked = true; } });
    G.toast = toast; d.coins = coins; d.stats.placed = 0;
    say(G, 'Đợt giới thiệu: Quan Tế ban phép, bạn mạnh hơn hẳn. Đợt đầu tới sau ' + I.delay + ' giây', 4);
  }
  Df.introSkip = function (G) {
    const d = G.defence; if (!d || !d.intro || !d.intro.on) return { ok: false };
    introEnd(G, true); return { ok: true };
  };
  // hết đợt 0-1 (hook của updateWaves): cảnh Robot Tự Nổ
  Df.introClear = function (G) {
    const d = G.defence; if (!d.intro || !d.intro.on || d.intro.step !== 'fight') return false;
    d.stats.waves--;   // đợt giới thiệu không tính là đợt đánh lui
    d.intro.step = 'robot'; d.phase = 'robot';
    const g = d.gates[0], e = SK.makeEnemy(G, 'e_robot_rook', g.x, g.y, G.map.rooms[0]);
    e.hpMax = e.hp = C.intro.robotHp; e.hold = true; e.dwave = false; e.drobot = true; e.st = 'move'; e.scale = (e.scale || 1) * 1.7; e.r = (e.r || 5) * 1.5;
    G.enemies.push(e); d.intro.robot = e;
    say(G, 'Quan Tế: "Chuyện gì thế kia?!" Một cỗ máy khổng lồ đang lao tới Đá Phép!', 4);
    SK.emit('defenceRobot', G);
    return true;
  };
  function robotTick(G, dt) {
    const d = G.defence, I = C.intro, it = d.intro; if (!it || !it.on) return;
    if (it.step === 'robot') {
      const e = it.robot, s = d.stoneAt; if (!e) return;
      e.hp = e.hpMax; e.st = 'move'; e.hold = true;
      const dx = s.x - e.x, dy = s.y - e.y, ds = Math.hypot(dx, dy);
      if (it.fuseT <= 0) {
        if (ds <= I.fuseDist) { it.fuseT = I.fuse; it.fuseAt = G.t; say(G, 'Quan Tế: "Tránh ra! Cỗ máy khổng lồ sắp nổ!!"', 3); }
        else { SK.moveBox(G.map, e, dx / ds * I.robotSpeed * dt, dy / ds * I.robotSpeed * dt, e.r); e.face = dx >= 0 ? 1 : -1; }
      } else {
        it.fuseT -= dt; e.flash = 0.06 * (Math.sin(G.t * 30) > 0 ? 1 : 0);
        if (it.fuseT <= 0) robotBlast(G);
      }
    } else if (it.step === 'after') {
      it.tailT -= dt; if (it.tailT <= 0) introEnd(G, false);
    }
  }
  // nổ: sát thương lên quái trong bán kính, mọi tháp có sẵn sập; Quan Tế che chắn nên người chơi và Đá Phép không mất gì rồi kiệt sức
  function robotBlast(G) {
    const d = G.defence, it = d.intro, e = it.robot, I = C.intro; let hit = 0;
    d.shots.push({ k: 'ring', x: e.x, y: e.y, r: I.blastR, t: 0, dur: 0.6, col: '#ffb040' });
    for (const q of G.enemies) if (q !== e && q.st !== 'dead' && q.st !== 'spawn' && Math.hypot(q.x - e.x, q.y - e.y) <= I.blastR) { SK.hurtEnemy(G, q, I.blastDmg, false, Math.atan2(q.y - e.y, q.x - e.x), 3); hit++; }
    for (const t of d.towers) { t.ally.dead = true; t.ally.gone = true; t.pad != null && (d.pads[t.pad].tower = null); }
    d.towers = [];
    d.blast = { dmg: I.blastDmg, hits: hit, stone: d.stone.hp, hp: G.player.hp, x: e.x, y: e.y };
    e.st = 'dead'; e.stT = 9; e.hp = 0; e.hold = true; it.robot = null;
    d.stoneFlash = 1; G.shake = 8; d.priestessSpent = true;
    say(G, 'Quan Tế dốc hết sức dựng lá chắn, bảo vệ bạn và Đá Phép. Sức của bà cạn kiệt...', 4);
    it.step = 'after'; it.tailT = I.tail; SK.emit('defenceBlast', G, d.blast);
  }
  function introEnd(G, skipped) {
    const d = G.defence, p = G.player, I = C.intro, it = d.intro;
    if (it.robot) { it.robot.st = 'dead'; it.robot.stT = 9; it.robot.hp = 0; }
    for (const t of d.towers) { t.ally.dead = true; t.ally.gone = true; if (t.pad != null) d.pads[t.pad].tower = null; }
    d.towers = []; d.pads.forEach(q => { q.locked = false; q.tower = null; }); d.stats.placed = 0; d.shots = [];
    for (const q of G.enemies) if (q.dwave && q.st !== 'dead') { q.st = 'dead'; q.stT = 9; q.hp = 0; q.dwave = false; }
    d.queue = [];
    it.on = false; it.step = 'done'; d.pExp = 0; d.sawFull = false;
    boost(G, -1); setSkillLv(G, 0);
    const w = p.weapons[p.cur]; if (w) w.plus = I.after;   // sau cảnh phim: cấp 0, kỹ năng 0, vũ khí +6 [WIKI Origin]
    d.zone = 1; d.wave = 0; d.phase = 'wait'; d.timer = C.countdown; d.stone.hp = d.stone.max; d.stoneFlash = 0;
    say(G, skipped ? 'Bỏ qua đợt giới thiệu. Đợt 1-1 tới sau ' + C.countdown + ' giây' : 'Quan Tế dẫn bạn về Hậu Điện. Đợt 1-1 tới sau ' + C.countdown + ' giây', 4);
    SK.emit('defenceIntroEnd', G, skipped);
  }

  // ================================================================ 5. NPC bị nhốt (Thầy Hướng Dẫn, Bậc Thầy Vũ Khí) và Kho
  const roomsFar = G => G.map.rooms.slice(1).sort((a, b) => (a.fill ? 1 : 0) - (b.fill ? 1 : 0));   // phòng có NPC / vật phòng đặc biệt xếp sau để lồng không chồng lên
  const spot = (G, r, k) => {
    const [cx, cy] = W.roomCenter(r);
    for (const [ox, oy] of [[(k % 3 - 1) * 20, (k % 2 ? 14 : -12)], [(k % 3 - 1) * 20, 0], [0, 0]]) if (!W.solidAt(G.map, cx + ox, cy + oy)) return [cx + ox, cy + oy];
    return [cx, cy];
  };
  const NPC = {
    mentor: { name: 'Thầy Hướng Dẫn', hero: 'taoist', col: '#ffd070', rescue: 'Thầy Hướng Dẫn: "Cảm ơn! Ta sẽ về Hậu Điện, nâng kỹ năng cho cậu."' },
    smith: { name: 'Bậc Thầy Vũ Khí', hero: 'engineer', col: '#ff9060', rescue: 'Bậc Thầy Vũ Khí: "Lâu quá không gặp! Cầm lấy phụ kiện này."' }
  };
  Df.rescue = function (G, key) {
    const d = G.defence, p = G.player; if (!d || d.rescued[key]) return { ok: false };
    d.rescued[key] = true; say(G, NPC[key].rescue, 4);
    if (key === 'smith') { const w = p.weapons[p.cur]; if (w && !w.acc) { w.acc = true; say(G, 'Nhận phụ kiện: ' + plusName(w) + ' sát thương +' + Math.round((C.accMul - 1) * 100) + '%', 3.5); } }
    SK.emit('defenceRescue', G, key); return { ok: true };
  };
  function figure(ctx, G, key, x, y, cage) {
    const N = NPC[key], hd = SK.heroSkin && SK.heroSkin(N.hero, 0), fr = hd && hd.idle && SK.animFrame(hd.idle, G.t);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, y, 7, 2, 0, 0, Math.PI * 2); ctx.fill();
    if (!fr || !SK.draw(ctx, fr, x, y, {})) { ctx.fillStyle = N.col; ctx.fillRect(x - 4, y - 12, 8, 12); }
    if (cage) {   // lồng sắt: 5 thanh dọc + nắp
      ctx.strokeStyle = '#9aa4b4'; ctx.lineWidth = 1;
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(x + i * 4.5, y + 2); ctx.lineTo(x + i * 4.5, y - 20); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(x - 10, y - 20); ctx.lineTo(x + 10, y - 20); ctx.moveTo(x - 10, y + 2); ctx.lineTo(x + 10, y + 2); ctx.stroke();
    }
  }
  function buildNpcs(G) {
    const d = G.defence, s = d.stoneAt, rooms = roomsFar(G);
    d.cages = [];
    ['mentor', 'smith'].forEach((key, i) => {
      const r = rooms[i % rooms.length]; if (!r) return;
      const [x, y] = spot(G, r, i), cg = { key, x, y };
      d.cages.push(cg);
      G.props.push({ df: 1, x, y, get gone() { return !!d.rescued[key]; }, draw(ctx, G2) { if (!d.rescued[key]) figure(ctx, G2, key, x, y, true); } });
      G.interactables.push({ df: 1, x, y: y + 4, r: 18, labelY: 34, get gone() { return !!d.rescued[key]; }, label: 'Mở lồng cứu ' + NPC[key].name, use: g => Df.rescue(g, key) });
    });
    // chỗ đứng ở Hậu Điện (cùng phòng Đá Phép): hiện sau khi được cứu
    const ms = { x: s.x + 98, y: s.y + 8 }, sm = { x: s.x - 98, y: s.y + 8 };
    G.props.push({ df: 1, x: ms.x, y: ms.y, draw(ctx, G2) { if (d.rescued.mentor) figure(ctx, G2, 'mentor', ms.x, ms.y, false); } });
    G.interactables.push({ df: 1, x: ms.x, y: ms.y + 4, r: 16, labelY: 34, get gone() { return !d.rescued.mentor; }, get label() { return Df.mentorLabel(G); }, use: g => Df.mentorBuy(g) });
    G.props.push({ df: 1, x: sm.x, y: sm.y, draw(ctx, G2) { if (d.rescued.smith) figure(ctx, G2, 'smith', sm.x, sm.y, false); } });
    G.interactables.push({ df: 1, x: sm.x, y: sm.y + 4, r: 16, labelY: 34, get gone() { return !d.rescued.smith; }, get label() { return Df.smithLabel(G); }, use: g => Df.enhance(g) });
    // Cờ Lê (cạnh Bậc Thầy Robot) và Kho (4 nút cạnh nhau phía trên bên phải)
    G.interactables.push({ df: 1, x: s.x - 76, y: s.y + 20, r: 10, labelY: 28,
      get label() { return d.wrenchMode ? 'Cờ Lê: cất đi' : 'Cờ Lê: nhấc / phá tháp (còn ' + d.wrench + ')'; }, use: g => Df.wrenchToggle(g) });
    const kx = s.x + 60, ky = s.y - 46;
    const kos = [['Kho: xem vũ khí kế', () => Df.storeNext(G)], ['Kho: lấy ra', () => Df.storeTake(G)], ['Kho: đánh dấu', () => Df.storeMark(G)], ['Kho: đúc lại', () => Df.remake(G)]];
    kos.forEach(([lab, fn], i) => G.interactables.push({ df: 1, x: kx + i * 14, y: ky + 6, r: 10, labelY: 30, get label() { return Df.storeLabel(d, lab); }, use: () => fn() }));
    G.props.push({ df: 1, x: kx + 21, y: ky, draw(ctx, G2) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(kx - 8, ky - 2, 58, 9);
      ctx.fillStyle = '#59627a'; ctx.fillRect(kx - 8, ky - 12, 58, 12); ctx.fillStyle = '#7f89a6'; ctx.fillRect(kx - 8, ky - 12, 58, 3);
      SK.text(ctx, 'KHO ' + d.store.length, kx + 21, ky - 4, 6, '#ffe08a', 'center', 'rgba(0,0,0,0.9)');
      kos.forEach((_, i) => { ctx.fillStyle = i === 2 ? '#ffd84a' : '#a7b3d2'; ctx.fillRect(kx + i * 14 - 2, ky + 3, 4, 4); });
    } });
  }
  // ---- Thầy Hướng Dẫn: nâng kỹ năng cấp 1-15 bằng vàng [WIKI Mentor]
  const salePrice = (p, n) => hasBuff(p, 10) ? Math.floor(n * 0.9) : n;   // thiên phú Giảm Giá -10% (làm tròn xuống) [WIKI Mentor / WS]
  Df.mentorPrice = G => { const d = G.defence, n = C.mentorCost[d.skillLv]; return n == null ? null : salePrice(G.player, n); };
  Df.mentorLabel = G => { const n = Df.mentorPrice(G); return n == null ? 'Thầy Hướng Dẫn: kỹ năng đã cấp tối đa' : 'Thầy Hướng Dẫn: nâng kỹ năng lên cấp ' + (G.defence.skillLv + 1) + ' (' + n + ' vàng)'; };
  Df.mentorBuy = function (G) {
    const d = G.defence, p = G.player; if (!d.rescued.mentor) return { ok: false };
    const n = Df.mentorPrice(G); if (n == null) return { ok: false, why: say(G, 'Kỹ năng đã cấp tối đa') };
    if (p.gold < n) return { ok: false, why: say(G, 'Không đủ vàng!') };
    p.gold -= n; setSkillLv(G, d.skillLv + 1); if (p.skillCd > 0) p.skillCd *= C.mentorCd;
    SK.num(G, p.x, p.y - 28, 'Kỹ năng cấp ' + d.skillLv, '#ffd070'); say(G, 'Kỹ năng lên cấp ' + d.skillLv + ' (hồi chiêu ngắn hơn)');
    SK.emit('mentorLevel', G, d.skillLv, n); return { ok: true, lv: d.skillLv, cost: n };
  };
  // ---- Bậc Thầy Vũ Khí: cường hóa vũ khí cầm tay +1..+18 bằng vàng, có tỉ lệ [WIKI Weaponsmith]
  const rowOf = w => Math.max(0, Math.min(6, ((DS.weapons[w.id] && DS.weapons[w.id].grade) | 0) - 1));
  Df.smithInfo = function (G) {
    const p = G.player, w = p.weapons[p.cur]; if (!w) return null;
    const n = w.plus || 0; if (n >= C.plusMax) return { w, max: true };
    const r = rowOf(w), fail = w.fails || 0;
    return { w, to: n + 1, cost: salePrice(p, C.smithCost[r][n]), rate: Math.min(1, C.smithRate[r][n] / 100 + fail * C.smithFailBonus) };
  };
  Df.smithLabel = G => {
    const i = Df.smithInfo(G); if (!i) return 'Bậc Thầy Vũ Khí: bạn thân mến, vũ khí của bạn đâu?';
    return i.max ? 'Bậc Thầy Vũ Khí: ' + plusName(i.w) + ' đã tối đa' : 'Bậc Thầy Vũ Khí: cường hóa ' + plusName(i.w) + ' lên +' + i.to + ' (' + i.cost + ' vàng, ' + Math.round(i.rate * 100) + '%)';
  };
  Df.enhance = function (G) {
    const d = G.defence, p = G.player; if (!d.rescued.smith) return { ok: false };
    const i = Df.smithInfo(G); if (!i) return { ok: false, why: say(G, 'Bạn thân mến, vũ khí của bạn đâu?') };
    if (i.max) return { ok: false, why: say(G, 'Vũ khí đã đạt +' + C.plusMax) };
    if (p.gold < i.cost) return { ok: false, why: say(G, 'Em yêu, tiền đâu?') };
    p.gold -= i.cost;
    if (SK.rand() < i.rate) { i.w.plus = i.to; i.w.fails = 0; say(G, 'Xong rồi! ' + plusName(i.w)); SK.emit('weaponEnhance', G, i.w, true); return { ok: true, win: true, plus: i.to, cost: i.cost }; }
    i.w.fails = (i.w.fails || 0) + 1; say(G, 'Tiếc quá, hỏng rồi. Lần sau dễ hơn một chút'); SK.emit('weaponEnhance', G, i.w, false);
    return { ok: true, win: false, plus: i.w.plus || 0, cost: i.cost };
  };
  // ---- Kho: lấy ra / đúc lại [WIKI Warehouse]
  Df.storeLabel = (d, lab) => {
    const e = d.store[d.storeSel]; const nm = e ? DS.weapons[e.id].name + (e.plus ? ' +' + e.plus : '') + (d.storeMarks.indexOf(e) >= 0 ? ' [đã chọn]' : '') : 'trống';
    return lab + ' (' + (d.store.length ? d.storeSel + 1 + '/' + d.store.length : '0') + ': ' + nm + '; đã chọn ' + d.storeMarks.length + '/3)';
  };
  Df.storeNext = function (G) { const d = G.defence; if (!d.store.length) return { ok: false, why: say(G, 'Kho trống') }; d.storeSel = (d.storeSel + 1) % d.store.length; return { ok: true, sel: d.storeSel }; };
  Df.storeMark = function (G) {
    const d = G.defence, e = d.store[d.storeSel]; if (!e) return { ok: false, why: say(G, 'Kho trống') };
    const k = d.storeMarks.indexOf(e);
    if (k >= 0) d.storeMarks.splice(k, 1); else if (d.storeMarks.length >= 3) return { ok: false, why: say(G, 'Chỉ đúc lại 3 vũ khí một lần') }; else d.storeMarks.push(e);
    return { ok: true, marks: d.storeMarks.length };
  };
  Df.storeTake = function (G) {
    const d = G.defence, p = G.player, e = d.store[d.storeSel]; if (!e) return { ok: false, why: say(G, 'Kho trống') };
    const old = p.weapons[p.cur];
    d.store.splice(d.storeSel, 1); d.storeMarks = d.storeMarks.filter(x => x !== e); d.storeSel = Math.max(0, Math.min(d.storeSel, d.store.length - 1));
    const nw = SK.makeWeapon(e.id); nw.plus = e.plus || 0; if (e.acc) nw.acc = true; p.weapons[p.cur] = nw;
    if (old) d.store.push({ id: old.id, plus: old.plus || 0, acc: !!old.acc });
    if (p.skillT > 0 && p.dual) SK.endSkill(G, p);
    say(G, 'Lấy ra ' + plusName(nw)); return { ok: true, w: nw };
  };
  const gradeOf = id => (DS.weapons[id] && DS.weapons[id].grade) | 0;
  // Luật đúc lại 3 vũ khí: cấp = cao nhất đầu vào +0/+1/+2 (trần 15); phẩm theo luật Kho [WIKI Warehouse]. Trả {id, plus, big}
  Df.remakeRule = function (ins, rnd) {
    const ids = ins.map(x => x.id), lv = ins.map(x => x.plus || 0), mx = Math.max.apply(null, lv), mn = Math.min.apply(null, lv);
    const same = ids.every(i => i === ids[0]), srt = lv.slice().sort((a, b) => a - b);
    const adj = srt[1] - srt[0] <= 1 && srt[2] - srt[1] <= 1 && mx - mn <= 2 && mx > mn;
    const bonus = lv.every(v => v === lv[0]) ? 2 : (same || adj) ? 1 : 0;
    const plus = Math.min(C.remakeMax, mx + bonus);
    if (same) return { id: ids[0], plus, big: false };
    const gs = ids.map(gradeOf), lo = Math.min.apply(null, gs), hi = Math.max.apply(null, gs);
    let g = gs.every(v => v === gs[0]) ? lo + 1 : lo + Math.floor(rnd() * (hi - lo + 1));
    const big = rnd() < C.remakeBig; if (big) g = Math.max(g, hi) + 1;
    g = Math.min(C.rarityMax, g);
    const pool = Object.keys(DS.weapons).filter(i => gradeOf(i) === g && !DS.weapons[i].starter && !/^_/.test(i) && DS.weapons[i].dmg > 0 && ids.indexOf(i) < 0);
    return { id: pool.length ? pool[Math.floor(rnd() * pool.length)] : ids[0], plus, big, grade: g };
  };
  Df.remake = function (G) {
    const d = G.defence; if (d.storeMarks.length !== 3) return { ok: false, why: say(G, 'Chọn đúng 3 vũ khí để đúc lại (' + d.storeMarks.length + '/3)') };
    if (d.storeMarks.some(e => DS.weapons[e.id].starter)) return { ok: false, why: say(G, 'Vũ khí khởi đầu không đúc lại được') };
    const ins = d.storeMarks.slice(), out = Df.remakeRule(ins, () => SK.rand());
    d.store = d.store.filter(e => ins.indexOf(e) < 0); d.storeMarks = [];
    d.store.push({ id: out.id, plus: out.plus, acc: false }); d.storeSel = d.store.length - 1; d.remakes++;
    say(G, (out.big ? 'Đại thành công! ' : 'Đúc lại: ') + plusName(out) + ' đã vào Kho', 3); SK.emit('weaponRemake', G, out); return { ok: true, out };
  };

  // ================================================================ 6. nhiệm vụ (3-6 trong 12)
  const weaponItem = (G, grade, plus, x, y) => {
    const pool = Object.keys(DS.weapons).filter(i => gradeOf(i) === grade && !DS.weapons[i].starter && !/^_/.test(i) && DS.weapons[i].dmg > 0);
    const id = pool[Math.floor(SK.rand() * pool.length)]; if (!id) return;
    G.items.push({ id, x, y, t: 0, plus });
  };
  const QR = {   // phần thưởng nhận ngay khi xong; [WIKI Origin "Quests"], phần web không có đổi sang món gần nhất [ƯỚC LƯỢNG]
    gold: n => (G, d) => { G.player.gold += n; },
    coins: n => (G, d) => Df.addCoins(G, n)
  };
  C.quests = [
    { id: 'seedWind', kind: 'collect', n: 3, name: 'Gom 3 hạt Tinh Linh Gió', rw: 'tốc chạy +33%', apply: (G, d) => { G.player.moveMul = (G.player.moveMul == null ? 1 : G.player.moveMul) * 1.33; } },
    { id: 'seedIce', kind: 'collect', n: 3, name: 'Gom 3 hạt Băng', rw: 'Phòng Thủ +5 (giáp tối đa)', apply: (G, d) => { const p = G.player; p.armorMax += 5; p.armor += 5; } },
    { id: 'seedFire', kind: 'collect', n: 3, name: 'Gom 3 hạt Lửa', rw: 'sát thương +10', apply: (G, d) => { d.flatDmg += 10; } },
    { id: 'qi', kind: 'defeat', hp: 11235, name: 'Hạ Người Thần Bí Khí Tông', rw: 'thiên phú Khí Công + 150 ngọc', apply: (G, d) => { if (SK.ROOMS && SK.ROOMS.takeBuff) SK.ROOMS.takeBuff(39); SK.profile && SK.profile.addGems(150); } },
    { id: 'knight', kind: 'defeat', hp: 6000, name: 'Hạ Lãnh Chúa Hiệp Sĩ', rw: 'vũ khí cam +10', apply: (G, d) => weaponItem(G, 5, 10, d.stoneAt.x + 20, d.stoneAt.y + 40) },
    { id: 'ufo', kind: 'defeat', hp: 2500, name: 'Hạ Đĩa Nổi Laser hỏng', rw: '100 Xu Sao', apply: (G, d) => Df.addCoins(G, 100) },
    { id: 'squire', kind: 'protect', n: 2, name: 'Bảo vệ Kỵ Sĩ Tập Sự 2 đợt', rw: '150 vàng', apply: QR.gold(150) },
    { id: 'bugs', kind: 'protect', n: 2, name: 'Bảo vệ bầy côn trùng 2 đợt', rw: 'vũ khí cam +8', apply: (G, d) => weaponItem(G, 5, 8, d.stoneAt.x - 20, d.stoneAt.y + 40) },
    { id: 'kep', kind: 'protect', n: 3, name: 'Bảo vệ Kep Freeman 3 đợt', rw: 'vũ khí tím +5', apply: (G, d) => weaponItem(G, 4, 5, d.stoneAt.x, d.stoneAt.y + 40) },
    { id: 'taro', kind: 'escort', name: 'Hộ tống Chó Con Taro', rw: 'Taro cắn 1000 sát thương mỗi 12 giây', apply: (G, d) => { d.taro = { cd: 12 }; } },
    { id: 'flint', kind: 'escort', name: 'Hộ tống Đá Lửa', rw: 'Đá Phép bị đánh thì nổ lửa 2000 sát thương (hồi 5 phút)', apply: (G, d) => { d.flint = { cd: 0 }; } },
    { id: 'heart', kind: 'escort', name: 'Hộ tống Tâm Mạch Khoáng', rw: 'Đá Phép hồi 2 máu mỗi 5 giây', apply: (G, d) => { d.heart = { t: 0 }; } }
  ];
  C.taro = { dmg: 1000, cd: 12 }; C.flint = { dmg: 2000, cd: 300 }; C.heart = { hp: 2, every: 5 };
  C.protectHp = 40; C.protectHit = 4;   // máu NPC cần bảo vệ và sát thương quái chạm mỗi giây [ƯỚC LƯỢNG]
  Df.forceQuests = null;   // kiểm thử: danh sách id nhiệm vụ cố định
  function buildQuests(G) {
    const d = G.defence, s = d.stoneAt, rooms = roomsFar(G);
    let ids = Df.forceQuests && Df.forceQuests.slice();
    if (!ids) { const all = C.quests.map(q => q.id).sort(() => SK.rand() - 0.5), n = C.questMin + Math.floor(SK.rand() * (C.questMax - C.questMin + 1)); ids = all.slice(0, n); }
    d.quests = []; let ri = 2;   // 2 phòng đầu của danh sách xa dành cho lồng NPC
    ids.forEach((id, qi) => {
      const def = C.quests.find(x => x.id === id); if (!def) return;
      const q = { def, state: 'active', prog: 0, objs: [] }; d.quests.push(q);
      const room = () => rooms[(ri++) % Math.max(1, rooms.length)];
      if (def.kind === 'collect') for (let k = 0; k < def.n; k++) { const r = room(); if (!r) continue; const [x, y] = spot(G, r, k + qi); q.objs.push({ x, y, got: false }); }
      else if (def.kind === 'defeat') { const r = room(); if (r) { const [x, y] = spot(G, r, qi); q.objs.push({ x, y }); spawnQuestEnemy(G, q, x, y, r); } }
      else if (def.kind === 'protect') { q.hp = C.protectHp; q.at = { x: s.x + (qi % 2 ? -34 : 34), y: s.y - 52 - (qi % 3) * 6 }; }
      else if (def.kind === 'escort') { const r = room(); if (r) { const [x, y] = spot(G, r, qi); q.obj = { x, y, carried: false, done: false }; } }
    });
    G.props.push({ df: 1, x: s.x, y: s.y + 62, draw(ctx, G2) { drawQuests(ctx, G2); } });
  }
  function spawnQuestEnemy(G, q, x, y, r) {
    const ids = G.map.th.enemies.filter(i => D.enemies[i] && !/^ex_/.test(i)), id = ids[Math.floor(SK.rand() * ids.length)];
    const e = SK.makeEnemy(G, id, x, y, r); e.hpMax = e.hp = q.def.hp; e.hold = true; e.dquest = q; e.scale = (e.scale || 1) * 1.4;
    G.enemies.push(e); q.enemy = e;
  }
  const qDone = (G, q) => {
    if (q.state !== 'active') return;
    q.state = 'done'; const d = G.defence; d.questsDone++;
    q.def.apply(G, d); say(G, 'Hoàn thành nhiệm vụ: ' + q.def.name + ' (thưởng: ' + q.def.rw + ')', 4); SK.emit('defenceQuest', G, q.def.id);
  };
  Df.questDone = qDone;
  function questTick(G, dt) {
    const d = G.defence, p = G.player, s = d.stoneAt;
    for (const q of d.quests) {
      if (q.state !== 'active') continue;
      const k = q.def.kind;
      if (k === 'collect') {
        for (const o of q.objs) if (!o.got && Math.hypot(o.x - p.x, o.y - p.y) < 12) { o.got = true; q.prog++; say(G, q.def.name + ' (' + q.prog + '/' + q.def.n + ')', 2); }
        if (q.prog >= q.def.n) qDone(G, q);
      } else if (k === 'defeat') {
        const e = q.enemy;
        if (e && e.hold && Math.hypot(e.x - p.x, e.y - p.y) < 150) e.hold = false;   // tỉnh dậy khi người chơi lại gần
        if (e && e.st === 'dead') qDone(G, q);
      } else if (k === 'protect') {
        for (const e of G.enemies) if (e.dwave && e.st !== 'dead' && Math.hypot(e.x - q.at.x, e.y - q.at.y) < 10) { q.hp -= C.protectHit * dt; q.flash = 0.1; }
        q.flash = Math.max(0, (q.flash || 0) - dt);
        if (q.hp <= 0) { q.state = 'failed'; say(G, 'Nhiệm vụ thất bại: ' + q.def.name, 3); }
      } else if (k === 'escort') {
        const o = q.obj; if (!o || o.done) continue;
        if (!o.carried && Math.hypot(o.x - p.x, o.y - p.y) < 14) { o.carried = true; say(G, 'Hộ tống: đưa về Đá Phép', 2.5); }
        if (o.carried) {
          const dx = p.x - o.x, dy = p.y - o.y, ds = Math.hypot(dx, dy); if (ds > 14) { const mv = ds > 40 ? ds - 12 : Math.min(ds - 12, 90 * dt); o.x += dx / ds * mv; o.y += dy / ds * mv; }   // người chơi dịch chuyển xa thì bạn đồng hành theo ngay
          if (Math.hypot(o.x - s.x, o.y - s.y) < 26) { o.done = true; qDone(G, q); }
        }
      }
    }
    // thưởng đang chạy
    if (d.taro) { d.taro.cd -= dt; if (d.taro.cd <= 0) { const es = G.enemies.filter(e => e.dwave && e.st !== 'dead' && e.st !== 'spawn'); if (es.length) { const e = es[Math.floor(SK.rand() * es.length)]; SK.hurtEnemy(G, e, C.taro.dmg, false, 0, 1); d.taro.cd = C.taro.cd; d.taro.hits = (d.taro.hits || 0) + 1; } else d.taro.cd = 0.5; } }
    if (d.heart) { d.heart.t += dt; if (d.heart.t >= C.heart.every) { d.heart.t = 0; if (d.stone.hp < d.stone.max && !d.lost) { d.stone.hp = Math.min(d.stone.max, d.stone.hp + C.heart.hp); SK.num(G, s.x, s.y - 26, '+' + C.heart.hp, '#6cff8a'); } } }
    if (d.flint && d.flint.cd > 0) d.flint.cd -= dt;
  }
  SK.on('defenceWaveClear', (G, zone, wave) => {
    if (!on(G) || !G.defence.quests || zone < 1) return;
    for (const q of G.defence.quests) if (q.state === 'active' && q.def.kind === 'protect') { q.prog++; if (q.prog >= q.def.n) qDone(G, q); }
  });
  // Đá Lửa: Đá Phép bị đánh thì nổ lửa lên mọi quái trong đợt [WIKI Origin "Quests"]
  const dmg0 = Df.damageStone;
  Df.damageStone = function (G, dmg) {
    const d = G.defence;
    if (d && d.flint && d.flint.cd <= 0 && !(d.intro && d.intro.on) && !d.lost && !d.won) {
      d.flint.cd = C.flint.cd; d.shots.push({ k: 'ring', x: d.stoneAt.x, y: d.stoneAt.y, r: 140, t: 0, dur: 0.7, col: '#ff7030' });
      for (const e of G.enemies) if (e.dwave && e.st !== 'dead' && e.st !== 'spawn') SK.hurtEnemy(G, e, C.flint.dmg, false, 0, 1);
      say(G, 'Đá Lửa bùng nổ!', 2);
    }
    return dmg0.apply(this, arguments);
  };
  function drawQuests(ctx, G) {
    const d = G.defence;
    for (const q of d.quests || []) {
      const k = q.def.kind, col = q.def.id === 'seedWind' ? '#9affc8' : q.def.id === 'seedIce' ? '#9adfff' : '#ff9a5a';
      if (k === 'collect' && q.state === 'active') for (const o of q.objs) { if (o.got) continue; const b = Math.sin(G.t * 4 + o.x) * 1.5; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(o.x, o.y - 6 + b, 3.2, 0, 7); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke(); }
      if (k === 'protect' && q.state === 'active') {
        const a = q.at; ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(a.x, a.y, 6, 2, 0, 0, 7); ctx.fill();
        ctx.fillStyle = q.flash > 0 ? '#fff' : '#d0b080'; ctx.fillRect(a.x - 4, a.y - 12, 8, 12);
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(a.x - 8, a.y - 16, 16, 2); ctx.fillStyle = '#6cff8a'; ctx.fillRect(a.x - 8, a.y - 16, 16 * Math.max(0, q.hp) / C.protectHp, 2);
      }
      if (k === 'escort' && q.obj && !q.obj.done) { const o = q.obj; ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(o.x, o.y, 5, 2, 0, 0, 7); ctx.fill(); ctx.fillStyle = q.def.id === 'taro' ? '#e0b070' : q.def.id === 'flint' ? '#ff7040' : '#8ad8ff'; ctx.fillRect(o.x - 3, o.y - 7, 6, 7); }
    }
  }

  // ================================================================ 7. ngọc thưởng cuối ván [WIKI Origin "Rewards"]
  Df.gemsOf = function (G, won) {
    const d = G.defence, p = G.player;
    let g = C.gemPerWave * d.stats.waves + Math.floor(d.coins / 100) + Math.floor(G.kills / 4) + (won ? C.gemWin : 0);   // "hạ Tàu" ở web = thắng chặng 12 [ƯỚC LƯỢNG: web chưa có Tàu]
    const buff = hasBuff(p, 15);
    if (buff) g = Math.floor(g * 1.25);
    return Math.min(buff ? C.gemCapBuff : C.gemCap, g);
  };
  Df.endReward = function (G, won) {
    const d = G.defence; if (d.rewarded) return '';
    d.rewarded = true; const g = Df.gemsOf(G, won); d.gemReward = g;
    if (SK.profile && SK.profile.addGems) SK.profile.addGems(g);
    return ' · Thưởng Thần Điện +' + g + ' ngọc' + (d.questsDone ? ' · ' + d.questsDone + ' nhiệm vụ' : '');
  };

  // ================================================================ khởi tạo, nhịp, HUD
  const init1 = Df.init;
  Df.init = function (G) {
    const d = init1.apply(this, arguments);
    Object.assign(d, { intro: null, talentOpen: false, talentRe: 0, talents: 0, skillLv: 0, cdBase: 1, flatDmg: 0, rescued: {}, cages: [], store: [], storeSel: 0, storeMarks: [],
      remakes: 0, wrenchMode: false, carry: null, quests: [], questsDone: 0, downed: false });
    return d;
  };
  SK.on('stageEnter', G => {
    if (!on(G)) return;
    const d = G.defence; G.mods = G.mods || {}; d.cdBase = G.mods.skillCdMul || 1;
    buildNpcs(G); buildQuests(G);
    if (!Df.skipPlot) introStart(G);
    G.props.push({ df: 1, x: d.stoneAt.x, y: d.stoneAt.y + 66, draw() {}, update(G2, q, dt) {
      if (!on(G2) || G2.state !== 'stage' || d.won || d.lost) return;
      talentWatch(G2); plusTrack(G2); storeTick(G2); robotTick(G2, dt); questTick(G2, dt);
    } });
    // Đá Phép: trong đợt giới thiệu, nói chuyện = bỏ qua đợt giới thiệu
    const st = G.interactables.find(i => i.df && i.x === d.stoneAt.x && i.y === d.stoneAt.y + 12);
    if (st) { const use0 = st.use; st.use = g => { if (d.intro && d.intro.on && d.intro.step === 'fight' && d.phase !== 'wait') return Df.introSkip(g); return use0(g); }; }
  });
  // NPC / Quan Tế kiệt sức: Quan Tế đổi nhãn khi vừa kiệt sức, HUD thêm dòng nhiệm vụ
  SK.on('hud', (ctx, G) => {
    if (!on(G) || !G.map) return;
    const d = G.defence, v = SK.view; let y = 62;
    if (d.intro && d.intro.on) SK.text(ctx, d.intro.step === 'robot' ? 'Robot Tự Nổ đang lao tới!' : 'Đợt giới thiệu: ban phép của Quan Tế', v.w / 2, 48, 8, '#ffb040', 'center', 'rgba(0,0,0,0.9)');
    else if (d.downed) SK.text(ctx, 'Bạn đã ngã gục: giữ Đá Phép, hạ trùm sóng để hồi sinh', v.w / 2, 48, 8, '#ff7a7a', 'center', 'rgba(0,0,0,0.9)');
    for (const q of d.quests || []) {
      const k = q.def.kind, pr = q.state === 'done' ? 'xong' : q.state === 'failed' ? 'thất bại' : k === 'collect' || k === 'protect' ? q.prog + '/' + q.def.n : k === 'escort' ? (q.obj && q.obj.carried ? 'đang dẫn' : 'chưa gặp') : 'chưa hạ';
      SK.text(ctx, q.def.name + ': ' + pr, 6, y, 7, q.state === 'done' ? '#7aff9a' : q.state === 'failed' ? '#ff7a7a' : '#e8f0ff', 'left', 'rgba(0,0,0,0.9)'); y += 9;
    }
  });
})();
