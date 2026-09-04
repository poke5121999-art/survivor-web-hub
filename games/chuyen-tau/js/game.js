/*
 * CHUYẾN TÀU CUỐI — bộ máy một ván.
 *
 * ============================================================================
 * HAI HỆ TOẠ ĐỘ, VÀ VÌ SAO CON TÀU KHÔNG BAO GIỜ "DI CHUYỂN"
 * ============================================================================
 * Tra cả thể loại thì không tìm được một game 2D nhìn từ trên xuống nào thật sự cho
 * người chơi ĐI BỘ trên một phương tiện đang chạy. Game duy nhất giải được bài này là
 * Barotrauma — thuỷ thủ đi lại trong một tàu ngầm 2D — và họ giải bằng cách gian lận:
 * "con tàu không thật sự di chuyển, chỉ có bản đồ di chuyển". Lý do tác giả nêu: engine
 * vật lý không xử lý nổi va chạm khi một vật lớn hơn vật kia rất nhiều, và di chuyển
 * một vật đang CHỨA các vật nhỏ bên trong cũng hỏng.
 *
 * Bằng chứng phụ: Godot ở chế độ top-down vẫn chưa hỗ trợ sàn di động (lỗi còn mở), và
 * chính Dead Rails cũng chưa giải sạch — diễn đàn của họ thừa nhận người chơi ĐANG ĐỨNG
 * bị giật hình ở tốc độ cao, và họ phải vá bằng một điều luật ("không rơi khỏi tàu kể
 * cả khi nhảy") chứ không phải bằng vật lý.
 *
 * Nên ở đây:
 *   - MỌI thực thể sống trong TOẠ ĐỘ THẾ GIỚI. Không có hệ toạ độ con nào.
 *   - Con tàu là một khoảng thế giới chạy từ `R.dist - trainLen` tới `R.dist`.
 *   - Người chơi đứng trên tàu thì mỗi khung được CỘNG THẲNG quãng đường tàu vừa đi.
 *     Không có va chạm, không có kế thừa vận tốc, không trượt, không giật — vì cả hai
 *     đầu đều do mình viết nên phép cộng là chính xác tuyệt đối.
 *   - Nền cuộn theo `R.dist`. `R.dist` là số duy nhất lớn dần, và nó chỉ dùng để lấy
 *     phần dư khi lát nền, nên không bao giờ chạm tới giới hạn độ chính xác của số thực.
 *
 * ============================================================================
 * HAI PHA, VÀ KHÔNG PHA NÀO LÀ CHỜ
 * ============================================================================
 * Chu kỳ ngày/đêm là nhịp tim, chép từ bản gốc: BAN NGÀY KHÔNG CÓ MỘT CON QUÁI NÀO
 * SPAWN. Áp lực ban ngày do LÒNG THAM của người chơi tự tạo — dừng thêm một nhà nữa
 * hay chạy về cho kịp? Áp lực ban đêm do hệ thống áp đặt.
 *
 *   PHA CHẠY  — tàu lăn bánh, người chơi đi lại trên nóc toa, quái leo lên từ hai bên.
 *               Phải tiếp than, vá vách, bắn. Không có một giây nào đứng không.
 *   PHA GA    — tàu dừng, đồng hồ đếm ngược chạy. Xuống lục soát nhà, nhét đầy bao tải,
 *               chạy về. Tàu CHẠY DÙ CÓ BẠN HAY KHÔNG — và câu đó được nói thẳng ra
 *               bằng chữ ngay lúc đồng hồ bắt đầu, chứ không để người chơi tự đoán.
 *
 * Cửa sổ ở ga cố ý RỘNG — khoảng gấp đôi thời gian thật cần để đi và về. Áp lực đến từ
 * việc CÓ một cái đồng hồ, không đến từ việc đồng hồ ngắn. Dấu hiệu cơ chế đang chạy
 * đúng là người chơi phải VỨT BỚT ĐỒ để về kịp — chứ không phải người chơi thua vì
 * thiếu ba giây.
 */
(function (root) {
  'use strict';

  const CT = root.CT;
  const A = CT.ART, FX = CT.FX, TA = CT.TRAIN_ART;
  const G = CT.GAME = {};
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[(Math.random() * a.length) | 0];
  const dist2 = (a, b) => { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; };

  // ---------------------------------------------------------------------------
  // KHUNG NHÌN
  // ---------------------------------------------------------------------------
  // Bao nhiêu THẾ GIỚI lọt vào khung là MỘT con số, không phải hai — và nó đo theo
  // CẠNH NGẮN của khung chứ không theo bề ngang. Lý do: bề ngang đổi gấp ba khi xoay
  // máy, cạnh ngắn thì gần như không đổi. Neo theo bề ngang thì màn to thành ăn gian
  // (nhìn xa hơn) còn màn nhỏ thì nhân vật to như cái nhà.
  //
  // Game này CHỈ chạy nằm ngang, nhưng luật vẫn giữ nguyên vì màn hình điện thoại nằm
  // ngang cũng chênh nhau rất nhiều về tỉ lệ.
  const VIEW_H_WORLD = 430;      // chiều cao thế giới lọt vào khung
  let viewW = 960, viewH = 540, dpr = 1;
  const zoom = () => viewH / VIEW_H_WORLD;

  // ---------------------------------------------------------------------------
  // TRẠNG THÁI MỘT VÁN — tách hoàn toàn khỏi CT.M
  // ---------------------------------------------------------------------------
  let R = null;
  G.R = () => R;

  function newRun(mapId, charId) {
    const map = CT.MAP_BY_ID[mapId];
    const cd = CT.CHAR_BY_ID[charId];
    const st = CT.statsOf(charId);
    const sk = CT.skillOf(charId);
    const spec = CT.trainSpec();

    R = {
      map, mapId, charId, cd, st, sk, spec,
      phase: 'chay',            // 'chay' | 'ga' | 'xong'
      leg: 1, legs: map.legs,
      t: 0, phaseT: 0, dist: 0, prevDist: 0, spd: 0,
      // ngày đêm
      clock: 0, isNight: false, nightIdx: 0, nightNo: 0, night: CT.NIGHTS[0],
      amb: 1, tint: null,
      // nhiên liệu
      fuel: CT.FUEL.tank * CT.FUEL.start, coalBurned: 0,
      // đoàn tàu
      cars: [], trainLen: 0, trainHp: 0,
      // thực thể
      foes: [], bullets: [], loots: [], walls: [], dogs: [], drops: [],
      corpses: [], decals: [],
      // người chơi
      p: null,
      // bao tải và tủ
      bag: [], bagMax: st.bag, stash: [], hand: [null, null, null],
      ammo: { nhe: 48, dai: 24, hoa: 24, nang: 0 },
      gun: null, gunAlt: null, gunMag: 0, gunAltMag: 0, reloadT: 0,
      // TIỀN TRONG VÁN — không phải vàng. Xem ghi chú ở CT.SELL_TO_CASH.
      cash: CT.START_CASH, spent: 0, sold: 0,
      // Than nằm trong TOA THAN, không nằm trong bao tải. Phải xúc vào lò mới thành
      // nhiên liệu — đó là lý do cái lò là một chỗ người chơi phải quay lại, chứ không
      // phải một thanh tự đầy.
      coal: 1, dryT: 0, shovels: 0,
      // ga
      station: null, timer: 0, warned: {}, arrWarn: {}, boarded: true,
      // tổng kết
      kills: 0, lootVal: 0, skills: 0, scrap: 0, goldEarned: 0,
      msg: '', msgT: 0, timers: [],
      over: null, paused: false
    };

    // đoàn tàu: đầu máy ở mũi, các toa nối phía sau
    let x = 0;
    spec.cars.forEach(c => {
      R.cars.push({ def: c.def, lv: c.lv, id: c.id, hp: c.hp, hpMax: c.hp,
                    turret: c.turret, hurt: 0, ox: x, ammo: 300, turretAng: 0 });
      x -= (TA.CAR_W + TA.GAP);
    });
    R.trainLen = TA.LOCO_W + spec.cars.length * (TA.CAR_W + TA.GAP);

    // vũ khí khởi đầu theo bị động
    const p = cd.passive || {};
    R.gun = p.noGun ? null : (p.noLongGun ? CT.GUN_BY_ID['luc'] : CT.GUN_BY_ID['luc']);
    R.gunMag = R.gun ? R.gun.mag : 0;

    // người chơi đứng trên toa đầu tiên sau đầu máy
    R.p = {
      x: -TA.LOCO_W - 60, y: deckMidY(), vx: 0, vy: 0,
      hp: st.hp, hpMax: st.hp, r: 9,
      dirX: -1, dirY: 0, aim: Math.PI, dist: 0,
      onTrain: true, car: 0,
      dodgeT: 0, dodgeCd: 0, dodgeCh: CT.DODGE.charges,
      skillCd: 0, skillCh: sk.charges || 1, skillT: 0, skillLock: 0,
      atkCd: 0, hurtT: 0, flash: 0, iframe: 0, stun: 0,
      invis: 0, blinkAt: null, slowT: 0, hot: 0, hotT: 0, spdBuff: 0,
      ghost: [], firing: 0
    };
    // ba ô tay: cho sẵn một băng và một cuộn băng gạc
    R.hand[0] = { id: 'bang', n: 2 };
    R.hand[1] = { id: 'ton', n: 1 };

    FX.reset();
    setPhase('chay');
    say('Chặng 1 / ' + R.legs + ' — giữ lò đỏ lửa.');
    return R;
  }
  G.newRun = newRun;

  // Mặt nóc toa nằm ở đâu trong thế giới. Toàn bộ sân chơi của pha chạy là dải này.
  const DECK_TOP = -TA.DECK_H;
  const DECK_BOT = 0;
  function deckMidY() { return DECK_TOP + TA.DECK_H * 0.5; }
  const GROUND_Y = 96;          // mặt đất bên dưới đường ray, chỗ người chơi xuống ga

  // ---------------------------------------------------------------------------
  // PHA
  // ---------------------------------------------------------------------------
  function setPhase(ph) {
    R.phase = ph; R.phaseT = 0;
    if (ph === 'chay') {
      R.station = null; R.warned = {}; R.arrWarn = {};
      R.p.onTrain = true;
    } else if (ph === 'ga') {
      R.spd = 0;
      R.timer = CT.LEG.stationSec;
      R.warned = {};
      buildStation();
      // Nói thẳng luật ra bằng chữ ngay lúc đồng hồ bắt đầu. Người chơi cần biết hậu
      // quả TRƯỚC, không phải sau khi đã mất chuyến.
      say('GA ' + R.leg + ' — tàu chạy tiếp dù có bạn hay không.', 3.4);
      // Nhắc riêng cái quầy ở ga đầu tiên. Từ ga hai trở đi người chơi đã biết rồi, và
      // một dòng chữ lặp lại năm lần là một dòng chữ người ta thôi đọc.
      if (R.leg === 1) later(3.6, () => say('Đẩy cần xuống để nhảy khỏi tàu. Quầy hàng ở gần chỗ đỗ.', 3.2));
      // Bác sĩ không tự hồi máu qua ga; ai khác thì hồi một phần.
      const pa = R.cd.passive || {};
      if (!pa.noStationHeal) R.p.hp = Math.min(R.p.hpMax, R.p.hp + R.p.hpMax * 0.35);
    }
  }

  function nextLeg() {
    R.leg++;
    if (R.leg > R.legs) { finish(true); return; }
    setPhase('chay');
    say('Chặng ' + R.leg + ' / ' + R.legs);
  }

  function finish(won) {
    if (R.over) return;
    R.over = { won };
    R.phase = 'xong';
    // Bán sạch bao tải và tủ. Đồ trong TỦ luôn về được; đồ trong BAO TẢI thì mất nếu
    // chết — đó là toàn bộ sức nặng của quyết định "mang thêm một chuyến nữa".
    let gold = 0;
    R.stash.forEach(it => { gold += it.val; });
    if (won) R.bag.forEach(it => { gold += it.val; });
    gold = Math.round(gold * (1 + (R.st.luck || 0)));
    R.goldEarned = gold;
    const res = {
      won, mapId: R.mapId, legs: R.leg - (won ? 1 : 1), km: R.dist / 1000,
      loot: Math.round(gold), kills: R.kills, skills: R.skills,
      coal: R.coalBurned, scrap: R.scrap, gold
    };
    res.legs = Math.max(0, Math.min(R.legs, won ? R.legs : R.leg - 1));
    R.reward = CT.finishRun(res);
    if (G.onOver) G.onOver(R);
  }
  G.finish = finish;

  function say(s, t) { R.msg = s; R.msgT = t || 2.2; }
  G.say = say;

  // ---------------------------------------------------------------------------
  // NGÀY / ĐÊM
  // ---------------------------------------------------------------------------
  function stepClock(dt) {
    const D = CT.DAY;
    const full = D.daySec + D.nightSec;
    R.clock = (R.clock + dt) % full;
    const wasNight = R.isNight;
    R.isNight = R.clock >= D.daySec;

    if (R.isNight && !wasNight) {
      R.nightNo++;
      // Đêm đầu tiên của MỌI ván luôn là đêm mây. Người chơi mới không bao giờ gặp sói
      // hay bóng ở lần đầu tiên trời tối — họ chưa biết chúng làm gì.
      R.nightIdx = R.nightNo === 1 ? 0 : (Math.random() * CT.NIGHTS.length) | 0;
      R.night = CT.NIGHTS[R.nightIdx];
      say(R.night.name + ' — ' + R.night.hint, 3.2);
      if (R.night.storm) R.nextBolt = rnd(CT.STORM.boltEvery[0], CT.STORM.boltEvery[1]);
    }

    // độ sáng nền: mượt qua hoàng hôn/bình minh chứ không bật tắt
    const d = R.clock;
    let amb;
    if (d < D.daySec - D.duskSec) amb = 1;
    else if (d < D.daySec) amb = 1 - (d - (D.daySec - D.duskSec)) / D.duskSec * (1 - R.night.amb);
    else if (d < full - D.dawnSec) amb = R.night.amb;
    else amb = R.night.amb + (d - (full - D.dawnSec)) / D.dawnSec * (1 - R.night.amb);
    R.amb = amb;
    R.tint = R.isNight || amb < 0.99 ? R.night.tint : null;

    // sét trong đêm bão
    if (R.isNight && R.night.storm) {
      R.nextBolt -= dt;
      if (R.nextBolt <= 0) {
        R.nextBolt = rnd(CT.STORM.boltEvery[0], CT.STORM.boltEvery[1]);
        fireBolt();
      }
    }
  }

  function fireBolt() {
    // Sét đánh gần người chơi, báo trước 1,1 giây bằng một vòng sáng. Cột thu lôi trên
    // tàu hút nó — nên đứng trong toa là ĐÚNG trong đêm bão, và đó là loại đêm duy nhất
    // phá được thói quen "cứ chạy là sống" mà người chơi vừa hình thành.
    const p = R.p;
    const onTrain = p.onTrain;
    const bx = onTrain ? p.x + rnd(-40, 40) : p.x + rnd(-90, 90);
    const by = onTrain ? p.y : GROUND_Y;
    R.pendingBolt = { x: bx, y: by, t: CT.STORM.warnSec, safe: onTrain };
    FX.vfx('nap', bx, by, { scale: 1.6 });
  }

  // ---------------------------------------------------------------------------
  // TÀU
  // ---------------------------------------------------------------------------
  const MAX_SPD = 168;                    // đơn vị thế giới mỗi giây
  function stepTrain(dt) {
    R.prevDist = R.dist;
    if (R.phase !== 'chay') { R.spd = Math.max(0, R.spd - 420 * dt); }
    else {
      const want = R.fuel > 0 ? MAX_SPD * R.spec.speedMul : 0;
      R.spd += (want - R.spd) * Math.min(1, dt * 1.4);
    }
    R.dist += R.spd * dt;

    // Nhiên liệu tiêu theo THỜI GIAN, không theo quãng đường — đi chậm là đốt tiền.
    // Một dòng luật, và nó biến "dừng lại lục soát" thành một quyết định có giá thật.
    // Chạy thì đốt đủ; đỗ ở ga thì đốt cầm chừng để giữ hơi. Vế thứ hai mới là vế đắt:
    // nó biến mỗi giây nán lại ở ga thành một giây quãng đường bị trừ đi.
    const burning = R.spd > 4 ? 1 : (R.phase === 'ga' ? CT.FUEL.idleMul : 0);
    if (burning > 0) {
      R.fuel = Math.max(0, R.fuel - CT.FUEL.burnPerSec * R.spec.fuelMul * burning * dt);
      if (R.fuel <= 0 && !R.saidDry) {
        R.saidDry = true;
        say(R.coal > 0
          ? ('LÒ TẮT. Còn ' + R.coal + ' cục than trong toa — chạy lên mũi tàu xúc vào lò.')
          : 'LÒ TẮT. Không còn than. Đốt xác hoặc đốt đồ trong bao.', 4.5);
      }
    }

    // Bốn nhịp xả mỗi vòng bánh — khói, tiếng và bánh khoá vào cùng một nhịp.
    const ch = TA.chuffsBetween(R.prevDist, R.dist);
    if (ch > 0 && R.spd > 8) {
      const sn = clamp(R.spd / MAX_SPD, 0, 1);
      const lx = locoX(), ly = deckMidY() - TA.DECK_H * 0.35;
      // Tải càng nặng khói càng đen — thang Ringelmann dùng làm tín hiệu gameplay
      // miễn phí: nhìn màu khói là biết tàu đang gắng sức hay chạy đều.
      const ring = R.spd < MAX_SPD * 0.6 ? 0.75 : 0.35;
      for (let i = 0; i < Math.min(ch, 2); i++) FX.chuff(lx + TA.LOCO_W - 30, ly, sn, ring);
      if (G.onChuff) G.onChuff(sn);
    }
    // bụi bánh xe: sinh theo QUÃNG ĐƯỜNG, không theo thời gian
    if (R.spd > 40) {
      R.dustAcc = (R.dustAcc || 0) + (R.dist - R.prevDist);
      while (R.dustAcc > 16) {
        R.dustAcc -= 16;
        const sn = clamp(R.spd / MAX_SPD, 0, 1);
        FX.dust(R.dist - rnd(0, R.trainLen), TA.SKIRT_H - 4, 1, sn);
      }
    }

    // tới ga
    if (R.phase === 'chay') {
      R.phaseT += dt;

      // BÁO TRƯỚC. Người chơi không có nút dừng tàu — tàu tự dừng — nên nếu không báo
      // gì thì trải nghiệm là "đang bắn thì tự nhiên đứng khựng". Cái cần báo không
      // phải là "sắp dừng" mà là "chuẩn bị nhảy xuống": ba mốc, và mốc cuối đủ sớm để
      // kịp chạy về cuối tàu.
      const left = CT.LEG.runSec - R.phaseT;
      CT.LEG.arriveAt.forEach(sc => {
        if (left <= sc && !R.arrWarn[sc]) {
          R.arrWarn[sc] = 1;
          say(sc >= 8 ? ('Ga phía trước — ' + sc + ' giây nữa tàu đỗ.')
                      : ('SẮP ĐỖ — ' + sc + '. Xuống ở mép sàn.'), 1.5);
          if (G.onSfx) G.onSfx('whistle');
        }
      });

      if (R.phaseT >= CT.LEG.runSec && R.fuel > 0) setPhase('ga');
    }

    // CHỐNG KẸT. Lò tắt thì tàu đứng, mà tàu đứng thì chặng không bao giờ hết — nên nếu
    // người chơi thật sự KHÔNG CÒN GÌ đốt được ở bất cứ đâu, cứ hai mươi hai giây thả
    // xuống sàn một bao than. Không phải lòng tốt: một bao than chỉ đủ đi tiếp, và mỗi
    // hai mươi hai giây đứng yên trong đêm là một đợt quái nữa. Thà để người chơi trả
    // giá bằng máu còn hơn để họ ngồi nhìn một màn hình không lối ra.
    if (R.phase === 'chay' && R.fuel <= 0) {
      R.dryT += dt;
      if (R.dryT > 22 && !anythingBurnable()) {
        R.dryT = 0;
        R.drops.push({ x: R.dist - TA.LOCO_W - 40, y: deckMidY(), kind: 'coal',
                       r: 9, bob: Math.random(), onTrain: true });
        say('Một bao than rơi ra từ toa hàng. Nhặt đi.', 3);
      }
    } else R.dryT = 0;

    // toa y tế hồi máu, toa pháo bắn
    R.cars.forEach(c => {
      if (c.hurt > 0) c.hurt = Math.max(0, c.hurt - dt * 3);
      if (c.def.regen && R.p.onTrain && onCar(R.p, c)) {
        R.p.hp = Math.min(R.p.hpMax, R.p.hp + R.spec.regen * dt);
      }
      if (c.turret && c.hp > 0) stepTurret(c, dt);
    });
  }

  function locoX() { return R.dist - TA.LOCO_W; }
  function carX(i) { return R.dist - TA.LOCO_W + R.cars[i].ox - TA.CAR_W; }
  function onCar(e, c) {
    const i = R.cars.indexOf(c);
    const x = carX(i);
    return e.x >= x && e.x <= x + TA.CAR_W;
  }
  // Toàn bộ mặt sàn đi được: từ mũi đầu máy tới đuôi toa cuối.
  function deckSpan() {
    const front = R.dist;
    const back = R.cars.length ? carX(R.cars.length - 1) : R.dist - TA.LOCO_W;
    return { a: back, b: front };
  }

  function stepTurret(c, dt) {
    const i = R.cars.indexOf(c);
    const tx = carX(i) + TA.CAR_W / 2, ty = deckMidY();
    let best = null, bd = c.turret.range * c.turret.range;
    for (const f of R.foes) {
      if (f.dead) continue;
      const d = (f.x - tx) * (f.x - tx) + (f.y - ty) * (f.y - ty);
      if (d < bd) { bd = d; best = f; }
    }
    if (!best) return;
    c.turretAng = Math.atan2(best.y - ty, best.x - tx);
    c.tCd = (c.tCd || 0) - dt;
    if (c.tCd > 0) return;
    if (R.ammo.nang <= 0) return;
    c.tCd = 0.14;
    R.ammo.nang--;
    hurtFoe(best, c.turret.dps * 0.14 * 7, tx, ty, false);
    FX.vfx('nong', tx + Math.cos(c.turretAng) * 44, ty + Math.sin(c.turretAng) * 44,
           { rot: c.turretAng, scale: 0.5 });
    FX.light({ x: tx, y: ty, r: 90, warm: '#fff3cf', power: 0.7 });
  }

  // ---------------------------------------------------------------------------
  // SINH QUÁI
  // ---------------------------------------------------------------------------
  function roster() {
    const idx = Math.min(CT.ROSTER.length - 1, R.map.tier - 1);
    let list = CT.ROSTER[idx].slice();
    if (R.isNight && R.night.foes.length) list = list.concat(R.night.foes);
    if (!R.isNight) list = list.filter(id => !CT.FOE_BY_ID[id].night);
    return list;
  }

  function stepSpawn(dt) {
    if (R.phase === 'xong') return;
    // BAN NGÀY KHÔNG SPAWN. Đây là luật, không phải một con số cân bằng.
    if (!R.isNight) return;
    R.spawnT = (R.spawnT || 0) - dt;
    if (R.spawnT > 0) return;

    const nightN = Math.min(4, R.nightNo - 1);
    const cap = (R.night.count[nightN] || 8) + R.map.tier * 2;
    if (R.foes.length >= cap) { R.spawnT = 1.2; return; }
    R.spawnT = Math.max(0.35, 1.9 - R.map.tier * 0.13);

    const id = pick(roster());
    const def = CT.FOE_BY_ID[id];
    const n = def.pack ? 1 + ((Math.random() * def.pack) | 0) : 1;
    for (let i = 0; i < n; i++) spawnFoe(def);
  }

  function spawnFoe(def) {
    let x, y;
    if (R.phase === 'chay') {
      // sinh phía trước tàu, ngoài khung nhìn, rồi tàu chạy tới chỗ nó
      x = R.dist + rnd(viewW / zoom() * 0.55, viewW / zoom() * 0.95);
      y = rnd(-40, GROUND_Y + 60);
    } else {
      const p = R.p;
      const a = Math.random() * TAU, d = rnd(340, 520);
      x = p.x + Math.cos(a) * d; y = clamp(p.y + Math.sin(a) * d, -160, GROUND_Y + 220);
    }
    R.foes.push({
      def, id: def.id, x, y, vx: 0, vy: 0,
      hp: def.hp * (1 + (R.map.tier - 1) * 0.24),
      hpMax: def.hp * (1 + (R.map.tier - 1) * 0.24),
      r: def.r, dead: false, sleep: true, wake: 0,
      dirX: -1, dirY: 0, dist: 0, flash: 0, stun: 0, stopT: 0,
      tx: x, ty: y, cd: 0, state: 'sleep', pin: 0,
      // painchance: quái càng mạnh càng KHÓ làm choáng, nhưng khi choáng được thì choáng
      // LÂU HƠN. Đó là cách biến "làm choáng" thành phần thưởng chứ không phải cái khoá.
      pain: def.boss ? 0.04 : def.hp >= 300 ? 0.2 : def.hp >= 150 ? 0.5 : 0.78,
      painDur: def.boss ? 0.286 : def.hp >= 300 ? 0.286 : def.hp >= 150 ? 0.171 : 0.114,
      onTrain: false, climb: 0, seed: Math.random()
    });
  }

  // Tiếng động đánh thức. Bán kính tăng dần: đến gần < kéo đồ < chạy < tàu < BẮN < nổ.
  // Đánh cận chiến KHÔNG đánh thức con nào khác — đó là cả một lớp chơi lén miễn phí,
  // và là lý do người chơi mới sống sót được ván đầu.
  function noise(x, y, r) {
    for (const f of R.foes) {
      if (!f.sleep || f.dead) continue;
      const dx = f.x - x, dy = f.y - y;
      if (dx * dx + dy * dy < r * r) { f.sleep = false; f.wake = rnd(0.1, 0.35); f.state = 'chase'; }
    }
  }
  G.noise = noise;

  // ---------------------------------------------------------------------------
  // NGƯỜI CHƠI
  // ---------------------------------------------------------------------------
  const IN = { mx: 0, my: 0, ax: 0, ay: 0, aiming: false, fire: false,
               dodge: false, skill: false, use: -1, act: false };
  G.IN = IN;

  function stepPlayer(dt) {
    const p = R.p, st = R.st, pa = R.cd.passive || {};

    if (p.hurtT > 0) p.hurtT -= dt;
    if (p.flash > 0) p.flash = Math.max(0, p.flash - dt * 8);
    if (p.iframe > 0) p.iframe -= dt;
    if (p.stun > 0) p.stun -= dt;
    if (p.atkCd > 0) p.atkCd -= dt;
    if (p.skillLock > 0) p.skillLock -= dt;
    if (p.parryOk > 0) p.parryOk -= dt;
    // Cửa sổ chặn đóng lại. Không chặn được viên nào thì ăn phạt.
    if (p.parry > 0) {
      p.parry -= dt;
      if (p.parry <= 0) { p.parry = 0; if (p.parryOk <= 0) p.skillLock = R.sk.lock || 0.6; }
    }
    if (p.blinkAt) { p.blinkAt.t -= dt; if (p.blinkAt.t <= 0) p.blinkAt = null; }
    if (p.dodgeCd > 0) {
      p.dodgeCd -= dt;
      if (p.dodgeCd <= 0 && p.dodgeCh < CT.DODGE.charges) {
        p.dodgeCh++;
        if (p.dodgeCh < CT.DODGE.charges) p.dodgeCd = CT.DODGE.cd;
      }
    }
    if (p.skillCd > 0) {
      p.skillCd -= dt;
      if (p.skillCd <= 0 && p.skillCh < (R.sk.charges || 1)) {
        p.skillCh++;
        if (p.skillCh < (R.sk.charges || 1)) p.skillCd = R.sk.cd;
      }
    }
    if (p.hotT > 0) { p.hotT -= dt; p.hp = Math.min(p.hpMax, p.hp + p.hot * dt); }
    if (p.spdBuff > 0) p.spdBuff -= dt;
    if (p.invis > 0) {
      p.invis -= dt;
      if (p.invis <= 0) say('Lộ rồi.', 1.1);
    }

    // bóng ma của Bà Rosa: luôn hiện đúng chỗ bốn giây trước, để người chơi NHÌN THẤY
    // mình sẽ quay về đâu chứ không phải đoán
    if (R.sk.rewind) {
      p.ghost.push({ x: p.x, y: p.y, hp: p.hp, t: R.t });
      while (p.ghost.length && R.t - p.ghost[0].t > R.sk.rewind) p.ghost.shift();
    }

    // --- di chuyển ---
    let spd = 176 * st.spd * (1 + (p.spdBuff > 0 ? 0.25 : 0));
    if (p.carry) spd *= 0.72;                 // vác xác thì đi chậm
    if (p.invis > 0 && R.sk.spdPlus) spd *= 1 + R.sk.spdPlus;
    if (p.stun > 0) spd = 0;

    if (p.dodgeT > 0) {
      p.dodgeT -= dt;
      const k = CT.DODGE.spd;
      p.x += p.ddx * k * dt; p.y += p.ddy * k * dt;
      if (p.dodgeT <= 0) { p.vx = p.ddx * k * CT.DODGE.endMul; p.vy = p.ddy * k * CT.DODGE.endMul; }
    } else if (p.chargeT > 0) {
      p.chargeT -= dt;
      p.x += p.cdx * R.sk.spdMul * 176 * dt;
      p.y += p.cdy * R.sk.spdMul * 176 * dt;
      chargeHits();
      if (p.chargeT <= 0) FX.shake('trung');
    } else {
      const mag = Math.hypot(IN.mx, IN.my);
      // Bắn tỉa không bắn được khi đang đi — nên cần gạt vẫn nghe, chỉ súng câm.
      if (mag > 0.001) {
        const nx = IN.mx / Math.max(1, mag), ny = IN.my / Math.max(1, mag);
        p.vx += (nx * spd - p.vx) * Math.min(1, dt * 14);
        p.vy += (ny * spd - p.vy) * Math.min(1, dt * 14);
        p.dirX = nx; p.dirY = ny;
        p.moving = mag;
      } else {
        p.vx *= Math.exp(-11 * dt); p.vy *= Math.exp(-11 * dt);
        p.moving = 0;
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    p.dist += Math.hypot(p.vx, p.vy) * dt + (p.dodgeT > 0 ? 300 * dt : 0);

    // Người đứng trên tàu được CỘNG THẲNG quãng đường tàu vừa đi. Không va chạm, không
    // kế thừa vận tốc, không trượt.
    if (p.onTrain) p.x += (R.dist - R.prevDist);

    // --- giới hạn sàn ---
    if (p.onTrain) {
      const s = deckSpan();
      p.x = clamp(p.x, s.a + 8, s.b - 8);
      p.y = clamp(p.y, DECK_TOP + 10, DECK_BOT - 8);
      // rơi khỏi tàu khi ở ga và đi quá mép: xuống đất
      if (R.phase === 'ga' && IN.my > 0.6 && p.y >= DECK_BOT - 9) {
        p.onTrain = false; p.y = GROUND_Y - 4; R.boarded = false;
        say('Xuống tàu. Nghe còi là chạy về.', 1.6);
      }
    } else {
      p.y = clamp(p.y, GROUND_Y - 150, GROUND_Y + 210);
      // leo lại lên tàu
      const s = deckSpan();
      if (p.x > s.a && p.x < s.b && p.y < GROUND_Y - 40) {
        p.onTrain = true; p.y = DECK_BOT - 12; R.boarded = true;
        say('Lên tàu.', 1.2);
      }
    }

    // --- ngắm ---
    if (IN.aiming) p.aim = Math.atan2(IN.ay, IN.ax);
    else {
      // Tự ngắm con gần nhất. Khảo sát hành vi: ba game bắn di động thành công nhất
      // (Archero, Survivor.io, Soul Knight) đều TRÁNH thao tác ngắm hướng — và cầm máy
      // nằm ngang bằng hai tay chỉ chiếm một phần mười người dùng.
      const t = nearestFoe(p.x, p.y, 460);
      if (t) p.aim = Math.atan2(t.y - p.y, t.x - p.x);
      else if (p.moving) p.aim = Math.atan2(p.dirY, p.dirX);
    }

    // --- bắn ---
    if (R.reloadT > 0) {
      R.reloadT -= dt;
      if (R.reloadT <= 0) {
        const need = R.gun.mag - R.gunMag;
        const have = R.ammo[R.gun.ammo] | 0;
        const take = Math.min(need, have);
        R.gunMag += take; R.ammo[R.gun.ammo] -= take;
      }
    }
    p.firing = Math.max(0, p.firing - dt);
    if (IN.fire && p.carry && p.atkCd <= 0) {
      // Hai tay đang bận. Không câm lặng: nói ra lý do, mỗi giây rưỡi một lần.
      p.atkCd = 1.5;
      say('Đang vác xác — bỏ xuống rồi mới bắn được.', 1.2);
    }
    else if (IN.fire && R.gun && p.atkCd <= 0 && p.stun <= 0 && p.skillLock <= 0 && p.dodgeT <= 0) {
      if (pa.rootToFire && p.moving > 0.15) { /* bắn tỉa: đứng yên mới bắn */ }
      else if (R.gunMag > 0) shoot();
      else if (R.reloadT <= 0 && !pa.noReload) reload();
    }
    if (IN.fire && !R.gun && !p.carry && p.atkCd <= 0) melee();

    // --- nút lướt ---
    if (IN.dodge) { IN.dodge = false; doDodge(); }
    if (IN.skill) { IN.skill = false; doSkill(); }
    if (IN.use >= 0) { const s = IN.use; IN.use = -1; useHand(s); }
    if (IN.act) { IN.act = false; doAct(); }

    if (p.hp <= 0) finish(false);
  }

  function nearestFoe(x, y, r) {
    let best = null, bd = r * r;
    for (const f of R.foes) {
      if (f.dead) continue;
      const d = (f.x - x) * (f.x - x) + (f.y - y) * (f.y - y);
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  function doDodge() {
    const p = R.p;
    if (p.dodgeCh <= 0 || p.dodgeT > 0 || p.skillLock > 0 || p.stun > 0) return;
    p.dodgeCh--;
    if (p.dodgeCd <= 0) p.dodgeCd = CT.DODGE.cd;
    const mag = Math.hypot(IN.mx, IN.my);
    const dx = mag > 0.1 ? IN.mx / mag : Math.cos(p.aim);
    const dy = mag > 0.1 ? IN.my / mag : Math.sin(p.aim);
    p.ddx = dx; p.ddy = dy;
    p.dodgeT = CT.DODGE.dur;
    p.iframe = Math.max(p.iframe, CT.DODGE.iframe);
    FX.dust(p.x, p.y + 6, 4, 0.5);
    FX.shake(0.06);
    if (G.onSfx) G.onSfx('dodge');
  }

  // ---------------------------------------------------------------------------
  // SÚNG
  // ---------------------------------------------------------------------------
  function shoot() {
    const p = R.p, g = R.gun, pa = R.cd.passive || {};
    p.atkCd = g.rof;
    R.gunMag--;
    p.firing = 0.08;

    const dmgMul = R.st.dmg * (pa.mul || 1) *
                   (pa.perLostPct ? 1 + (1 - p.hp / p.hpMax) * 100 * pa.perLostPct : 1);
    const shots = [p.aim];
    // Chị Hai cầm hai súng bắn hai hướng NGƯỢC nhau — thứ duy nhất trong game giữ được
    // cả hai đầu toa cùng lúc.
    if (pa.mul === 0.6 && pa.noReload) shots.push(p.aim + Math.PI);

    shots.forEach(ang => {
      const n = g.pellets || 1;
      for (let i = 0; i < n; i++) {
        const a = ang + (Math.random() - 0.5) * g.spread * 2;
        R.bullets.push({
          x: p.x + Math.cos(ang) * 14, y: p.y + Math.sin(ang) * 14,
          vx: Math.cos(a) * 1250, vy: Math.sin(a) * 1250,
          dmg: g.dmg * dmgMul, life: g.range / 1250, mine: true,
          pierce: pa.pierce && p.moving < 0.15, hit: []
        });
      }
      // Chớp nòng: DOOM cho 200ms và nâng độ sáng CẢ CẢNH lên một hai nấc trong thang
      // mười sáu — tức 6-12%, KHÔNG phải một tấm trắng phủ màn.
      FX.vfx('nong', p.x + Math.cos(ang) * 16, p.y + Math.sin(ang) * 16,
             { rot: ang, scale: 0.55, dur: 0.2 });
      FX.sparks(p.x + Math.cos(ang) * 18, p.y + Math.sin(ang) * 18, ang, 4);
      FX.shell(p.x, p.y - 4, ang);
    });
    FX.S.ambPlus = Math.max(FX.S.ambPlus, CT.LIGHT.muzzle.ambPlus);
    FX.shake(g.pellets ? 'hoacai' : 'ban');
    noise(p.x, p.y, CT.NOISE.sung);
    if (G.onSfx) G.onSfx(g.pellets ? 'shotgun' : 'shot');
  }

  function reload() {
    if (!R.gun) return;
    if ((R.ammo[R.gun.ammo] | 0) <= 0) { say('Hết đạn ' + CT.AMMO_BY_ID[R.gun.ammo].name.toLowerCase() + '.', 1.2); return; }
    R.reloadT = R.gun.reload;
    if (G.onSfx) G.onSfx('reload');
  }
  G.reload = reload;

  function melee() {
    const p = R.p, M = CT.MELEE;
    p.atkCd = M.cd;
    const dmg = M.dmg * R.st.dmg * (R.cd.passive && R.cd.passive.mul || 1);
    for (const f of R.foes) {
      if (f.dead) continue;
      const dx = f.x - p.x, dy = f.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > M.reach + f.r) continue;
      const a = Math.abs(angDiff(Math.atan2(dy, dx), p.aim));
      if (a > M.arc / 2) continue;
      hurtFoe(f, dmg, p.x, p.y, false);
    }
    FX.vfx('chem', p.x + Math.cos(p.aim) * 26, p.y + Math.sin(p.aim) * 26, { rot: p.aim, scale: 0.7 });
    // Cận chiến KHÔNG gây tiếng động đánh thức. Cố ý.
    if (G.onSfx) G.onSfx('melee');
  }
  function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; }

  function stepBullets(dt) {
    for (let i = R.bullets.length - 1; i >= 0; i--) {
      const b = R.bullets[i];
      const px = b.x, py = b.y;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.life -= dt;
      let gone = b.life <= 0;

      if (b.mine) {
        for (const f of R.foes) {
          if (f.dead || b.hit.indexOf(f) >= 0) continue;
          if (segHit(px, py, b.x, b.y, f.x, f.y, f.r + 3)) {
            hurtFoe(f, b.dmg, px, py, true);
            b.hit.push(f);
            if (!b.pierce) { gone = true; break; }
          }
        }
        // vách của Đe chặn được đạn địch, nhưng đạn MÌNH thì xuyên qua từ phía sau
      } else {
        // đạn địch: vách chắn
        for (const w of R.walls) {
          if (w.hp <= 0) continue;
          if (segHit(px, py, b.x, b.y, w.x, w.y, w.r)) {
            w.hp -= b.dmg;
            FX.sparks(b.x, b.y, Math.atan2(-b.vy, -b.vx), 5, '160,200,255');
            if (R.sk.awakened && R.charId === 'de') {
              R.bullets.push({ x: b.x, y: b.y, vx: -b.vx, vy: -b.vy,
                               dmg: b.dmg * 0.3, life: 0.3, mine: true, hit: [] });
            }
            gone = true; break;
          }
        }
        const p = R.p;
        if (!gone && p.iframe <= 0 && segHit(px, py, b.x, b.y, p.x, p.y, p.r + 2)) {
          // Bắn Chặn của Chị Hai
          if (p.parry > 0) {
            p.parry = 0; p.parryOk = 0.35;
            R.bullets.push({ x: b.x, y: b.y, vx: -b.vx, vy: -b.vy,
                             dmg: b.dmg * R.sk.reflect, life: 0.6, mine: true, hit: [] });
            if (R.sk.awakened) {
              for (const s of [-0.4, 0.4]) {
                const a = Math.atan2(-b.vy, -b.vx) + s;
                R.bullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * 1250, vy: Math.sin(a) * 1250,
                                 dmg: b.dmg * R.sk.reflect, life: 0.6, mine: true, hit: [] });
              }
            }
            FX.vfx('khien', p.x, p.y, { scale: 0.9 });
            FX.hitstop('nang'); FX.shake('dinhdon');
            if (G.onSfx) G.onSfx('parry');
          } else hurtPlayer(b.dmg, Math.atan2(b.vy, b.vx));
          gone = true;
        }
      }
      if (gone) R.bullets.splice(i, 1);
    }
  }
  function segHit(x1, y1, x2, y2, cx, cy, r) {
    const dx = x2 - x1, dy = y2 - y1;
    const l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((cx - x1) * dx + (cy - y1) * dy) / l2 : 0;
    t = clamp(t, 0, 1);
    const px = x1 + dx * t - cx, py = y1 + dy * t - cy;
    return px * px + py * py <= r * r;
  }

  // ---------------------------------------------------------------------------
  // SÁT THƯƠNG
  // ---------------------------------------------------------------------------
  function hurtFoe(f, dmg, fromX, fromY, ranged) {
    if (f.dead) return;
    f.hp -= dmg;
    f.flash = 1;
    const ang = Math.atan2(f.y - fromY, f.x - fromX);
    FX.blood(f.x, f.y - 6, ang, 20);
    FX.pop(f.x, f.y - f.r - 8, dmg, dmg > 60 ? '#ffd06a' : '#f2e7cf', dmg > 60, f);
    // Người bị đánh đứng hình LÂU HƠN người đánh hai khung — người đánh thoát trước nên
    // thao tác tiếp mượt, mà cú đánh vẫn nặng.
    f.stopT = Math.max(f.stopT, dmg > 60 ? 0.185 : 0.118);
    FX.hitstop(dmg > 60 ? 'nang' : 'nhe');
    // choáng vi mô, theo painchance
    if (Math.random() < f.pain) f.stun = Math.max(f.stun, f.painDur);
    const k = clamp(dmg / 60, 0.2, 1.4);
    f.vx += Math.cos(ang) * 130 * k; f.vy += Math.sin(ang) * 130 * k;
    if (f.sleep) { f.sleep = false; f.state = 'chase'; }
    if (f.hp <= 0) killFoe(f, ang);
  }
  G.hurtFoe = hurtFoe;

  function killFoe(f, ang) {
    f.dead = true;
    R.kills++;
    FX.blood(f.x, f.y - 6, ang, 26);
    FX.shake('chet');
    // Xác giết cực ngắn thay vì dừng lâu — để cái xác bay đi ngay, đọc ra là "đứt phựt".
    FX.hitstop(0.02);
    if (f.def.corpse) {
      R.corpses.push({ x: f.x, y: f.y, t: 0, life: 12, fade: 3.6, art: f.def.art,
                       row: A.rowFor(f.dirX, f.dirY), seed: f.seed, scale: f.def.scale || 1,
                       bounty: f.def.bounty || 0, onTrain: !!f.onTrain });
      // trần 24 xác: đầy thì cho xác cũ nhất bắt đầu mờ NGAY, không xoá phựt
      if (R.corpses.length > 24) { const o = R.corpses.shift(); }
    }
    if (R.decals.length < 200)
      R.decals.push({ x: f.x, y: f.y, r: 16 + Math.random() * 12, seed: Math.random() });
    if (f.def.bounty) R.goldPending = (R.goldPending || 0) + f.def.bounty;
    // rơi đồ
    if (Math.random() < 0.22) dropAmmo(f.x, f.y);
    if (f.def.boss) { say('Ga cuối đã sạch.', 3); }
    if (G.onSfx) G.onSfx('kill');
  }

  function hurtPlayer(dmg, ang) {
    const p = R.p;
    if (p.iframe > 0 || p.dodgeT > 0) return;
    const grit = R.st.grit || 0;
    const dr = p.invis > 0 && R.sk.dr ? R.sk.dr : 0;
    const real = dmg * (1 - grit) * (1 - dr);
    p.hp -= real;
    p.hurtT = 0.3; p.flash = 1;
    p.vx += Math.cos(ang) * 150; p.vy += Math.sin(ang) * 150;
    // Chớp đỏ: alpha theo mức sát thương, và màu giữ dưới ngưỡng đỏ bão hoà.
    const a = clamp(0.12 + real / 100 * 0.42, 0.12, 0.55);
    FX.flash(a, real > 25 ? '150,30,32' : '190,60,50');
    FX.shake('dinhdon');
    FX.hitstop('nguoi');
    FX.pop(p.x, p.y - 22, '-' + Math.round(real), '#ff8a7a');
    if (p.invis > 0) p.invis = 0;
    if (G.onSfx) G.onSfx('hurt');
  }
  G.hurtPlayer = hurtPlayer;

  // ---------------------------------------------------------------------------
  // AI QUÁI
  // ---------------------------------------------------------------------------
  function stepFoes(dt) {
    const p = R.p;
    for (let i = R.foes.length - 1; i >= 0; i--) {
      const f = R.foes[i];
      if (f.dead) { R.foes.splice(i, 1); continue; }
      if (f.flash > 0) f.flash = Math.max(0, f.flash - dt * 7);
      if (f.stopT > 0) { f.stopT -= dt; continue; }      // đứng hình vì vừa ăn đòn
      if (f.stun > 0) { f.stun -= dt; continue; }
      if (f.pin > 0) { f.pin -= dt; continue; }          // bị chó ghim

      // xa quá thì dọn đi cho nhẹ
      if (Math.abs(f.x - p.x) > 1400) { R.foes.splice(i, 1); continue; }

      const def = f.def;
      if (f.sleep) {
        // ngủ: chỉ tỉnh bởi tiếng động (xem noise()) hoặc khi người chơi tới rất gần
        if (dist2(f, p) < CT.NOISE.chan * CT.NOISE.chan) { f.sleep = false; f.state = 'chase'; }
        continue;
      }
      if (f.wake > 0) { f.wake -= dt; continue; }

      // mục tiêu: người chơi, hoặc mồi nếu đang bị dụ
      let tx = p.x, ty = p.y;
      if (R.bait && R.bait.t > 0) { tx = R.bait.x; ty = R.bait.y; }
      if (p.invis > 0 && !R.bait) { tx = f.tx; ty = f.ty; }   // mất dấu: đi tới chỗ vừa thấy
      else { f.tx = tx; f.ty = ty; }

      const dx = tx - f.x, dy = ty - f.y;
      const d = Math.hypot(dx, dy) || 1;
      f.dirX = dx / d; f.dirY = dy / d;

      // --- con lao ---
      if (def.dash) {
        f.rk = f.rk || 'walk';
        if (f.rk === 'walk' && d < def.sight * 0.8) {
          f.rk = 'wind'; f.rt = def.dash.wind;
          f.rax = f.dirX; f.ray = f.dirY;
        } else if (f.rk === 'wind') {
          f.rt -= dt;
          if (f.rt <= 0) { f.rk = 'dash'; f.rt = def.dash.dur; }
        } else if (f.rk === 'dash') {
          f.rt -= dt;
          f.x += f.rax * def.dash.spd * dt;
          f.y += f.ray * def.dash.spd * dt;
          if (dist2(f, p) < (f.r + p.r) * (f.r + p.r) * 1.6) {
            hurtPlayer(def.dmg * 1.5, Math.atan2(f.ray, f.rax));
            f.rk = 'stun'; f.rt = 1.4;
          }
          if (f.rt <= 0) { f.rk = 'stun'; f.rt = 1.1; }
          f.dist += def.dash.spd * dt;
          continue;
        } else if (f.rk === 'stun') {
          f.rt -= dt;
          if (f.rt <= 0) f.rk = 'walk';
          continue;
        }
      }

      // --- con bắn ---
      if (def.gun && d < def.gun.range) {
        f.cd -= dt;
        if (f.cd <= 0) {
          f.cd = def.gun.rof;
          const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * def.gun.spread * 2;
          R.bullets.push({ x: f.x + Math.cos(a) * 14, y: f.y + Math.sin(a) * 14,
                           vx: Math.cos(a) * 620, vy: Math.sin(a) * 620,
                           dmg: def.dmg, life: def.gun.range / 620, mine: false });
          FX.vfx('nong', f.x + Math.cos(a) * 15, f.y + Math.sin(a) * 15, { rot: a, scale: 0.42, dur: 0.2 });
        }
        // giữ khoảng cách
        const keep = def.gun.range * 0.7;
        const push = d < keep ? -1 : 0.35;
        f.x += f.dirX * def.spd * push * dt;
        f.y += f.dirY * def.spd * push * dt;
        f.dist += def.spd * Math.abs(push) * dt;
        continue;
      }

      // --- con nổ ---
      if (def.fuse != null) {
        if (d < 150 && f.fuseT == null) { f.fuseT = def.fuse; FX.vfx('nap', f.x, f.y - 14, { scale: 0.5 }); }
        if (f.fuseT != null) {
          f.fuseT -= dt;
          if (f.fuseT <= 0) { blast(f.x, f.y, def.blast.dmg, def.blast.r); f.dead = true; R.kills++; continue; }
        }
      }

      // --- con chớp ---
      if (def.blink) {
        f.bt = (f.bt || def.blink) - dt;
        if (f.bt <= 0) {
          f.bt = def.blink;
          // xuất hiện ở chỗ người chơi SẮP tới, không phải chỗ đang đứng
          FX.vfx('cong', f.x, f.y, { scale: 0.8, dur: 0.5 });
          f.x = p.x + p.vx * 0.45 + rnd(-40, 40);
          f.y = p.y + p.vy * 0.45 + rnd(-30, 30);
          FX.vfx('cong', f.x, f.y, { scale: 0.8, dur: 0.5 });
        }
      }

      // --- đi tới ---
      let s = def.spd;
      if (def.weave) {
        // lảo đảo trái phải: chậm hơn đường thẳng nhưng khó bắn trúng
        const w = Math.sin(R.t * 6 + f.seed * 9) * def.weave;
        f.x += -f.dirY * w * 40 * dt;
        f.y += f.dirX * w * 40 * dt;
      }
      f.x += f.dirX * s * dt; f.y += f.dirY * s * dt;
      f.dist += s * dt;

      // đánh
      if (d < f.r + p.r + 6) {
        f.cd -= dt;
        if (f.cd <= 0 && def.dmg > 0) {
          f.cd = 1.0;
          hurtPlayer(def.dmg, Math.atan2(dy, dx));
        }
      }

      // giữ khoảng cách với đồng bọn — mười con dồn vào một điểm thì đọc ra là một con
      for (const o of R.foes) {
        if (o === f || o.dead) continue;
        const ox = f.x - o.x, oy = f.y - o.y;
        const od = ox * ox + oy * oy;
        const rr = (f.r + o.r) * (f.r + o.r);
        if (od < rr && od > 0.01) {
          const l = Math.sqrt(od);
          f.x += ox / l * 34 * dt; f.y += oy / l * 34 * dt;
        }
      }

      // vướng vách
      for (const w of R.walls) {
        if (w.hp <= 0) continue;
        const wx = f.x - w.x, wy = f.y - w.y;
        const wd = Math.hypot(wx, wy);
        if (wd < w.r + f.r) {
          const l = Math.max(0.01, wd);
          f.x = w.x + wx / l * (w.r + f.r);
          f.y = w.y + wy / l * (w.r + f.r);
          w.hp -= def.dmg * dt * 2.2;
        }
      }
      // kẽm gai
      for (const wire of (R.wires || [])) {
        if (wire.hits <= 0) continue;
        if (dist2(f, wire) < wire.r * wire.r && (f.wireCd || 0) <= 0) {
          f.wireCd = 0.6; wire.hits--;
          hurtFoe(f, wire.dmg, wire.x, wire.y, false);
          f.stun = Math.max(f.stun, wire.stun);
        }
      }
      if (f.wireCd > 0) f.wireCd -= dt;

      // trèo lên tàu và đánh toa
      if (R.phase === 'chay') {
        const s2 = deckSpan();
        if (f.x > s2.a && f.x < s2.b && f.y > DECK_TOP && f.y < DECK_BOT) {
          const idx = carIndexAt(f.x);
          if (idx >= 0 && R.cars[idx].hp > 0 && (f.carCd || 0) <= 0) {
            f.carCd = 1.2;
            const c = R.cars[idx];
            c.hp -= def.dmg * 0.5;
            c.hurt = 1;
            FX.shake('tau');
            if (c.hp <= 0) say('Toa ' + (idx + 1) + ' hỏng.', 2);
          }
        }
      }
      if (f.carCd > 0) f.carCd -= dt;
    }
  }

  function carIndexAt(x) {
    for (let i = 0; i < R.cars.length; i++) {
      const cx = carX(i);
      if (x >= cx && x <= cx + TA.CAR_W) return i;
    }
    return -1;
  }

  function blast(x, y, dmg, r) {
    FX.vfx('no', x, y, { scale: r / 48 });
    FX.shake('no');
    FX.flash(0.3, '255,190,120');
    FX.sparks(x, y, 0, 14, '255,190,90');
    noise(x, y, CT.NOISE.no);
    for (const f of R.foes) {
      if (f.dead) continue;
      const d = Math.hypot(f.x - x, f.y - y);
      if (d < r) hurtFoe(f, dmg * (1 - d / r), x, y, false);
    }
    const p = R.p;
    const pd = Math.hypot(p.x - x, p.y - y);
    if (pd < r) hurtPlayer(dmg * 0.45 * (1 - pd / r), Math.atan2(p.y - y, p.x - x));
    if (G.onSfx) G.onSfx('boom');
  }
  G.blast = blast;

  // ---------------------------------------------------------------------------
  // CHIÊU
  // ---------------------------------------------------------------------------
  // Hẹn giờ chạy bằng ĐỒNG HỒ CỦA VÁN, không phải setTimeout. setTimeout vẫn chạy khi
  // game đang tạm dừng, đang trong hit-stop, hoặc khi người chơi đã chuyển tab — nên một
  // chiêu hẹn giờ bằng nó sẽ nổ ra giữa màn hình tạm dừng, hoặc nổ vào một ván khác.
  function later(sec, fn) { R.timers.push({ t: sec, fn }); }
  function stepTimers(dt) {
    for (let i = R.timers.length - 1; i >= 0; i--) {
      const t = R.timers[i];
      t.t -= dt;
      if (t.t <= 0) { R.timers.splice(i, 1); try { t.fn(); } catch (e) { /* một chiêu hỏng không được giết cả ván */ } }
    }
  }

  function doSkill() {
    const p = R.p, sk = R.sk;
    // Ống tiêm của bác sĩ bấm được CẢ KHI ĐANG BỊ CHOÁNG — nút thoát hiểm duy nhất
    // trong game hoạt động lúc bạn không điều khiển được nhân vật.
    if (p.stun > 0 && !sk.usableWhileStunned) return;
    if (p.skillCh <= 0) return;
    if (sk.twoStep && p.blinkAt) { blinkBack(); return; }
    p.skillCh--;
    if (p.skillCd <= 0) p.skillCd = sk.cd;
    R.skills++;

    switch (sk.id) {
      case 'chan':
        // Cửa sổ 0,2 giây. Trúng thì đạn bay ngược lại và chặn được ngay lần nữa;
        // TRƯỢT thì khoá 0,6 giây, kể cả nút lướt. Tỉ lệ thưởng-phạt một-ăn-ba đó
        // chính là thứ làm cú bấm này "đã tay" thay vì "bấm bừa cũng được".
        // Đếm bằng đồng hồ của ván (xem stepParry) chứ không bằng setTimeout — setTimeout
        // chạy tiếp cả khi game đã tạm dừng hoặc đang trong hit-stop.
        p.parry = sk.window;
        p.parryOk = 0;
        FX.vfx('khien', p.x, p.y, { scale: 0.55, dur: 0.25 });
        break;
      case 'huc': {
        const mag = Math.hypot(IN.mx, IN.my);
        p.cdx = mag > 0.1 ? IN.mx / mag : Math.cos(p.aim);
        p.cdy = mag > 0.1 ? IN.my / mag : Math.sin(p.aim);
        p.chargeT = sk.dist / (sk.spdMul * 176);
        p.ccImmune = p.chargeT;
        FX.dust(p.x, p.y + 6, 6, 1);
        FX.shake(0.12);
        break;
      }
      case 'moctoa': {
        const t = nearestFoe(p.x, p.y, sk.range);
        if (t) {
          t.vx += (p.x - t.x) * 3.4; t.vy += (p.y - t.y) * 3.4;
          t.stun = Math.max(t.stun, sk.pullUp);
          FX.vfx('luoi', (p.x + t.x) / 2, (p.y + t.y) / 2,
                 { rot: Math.atan2(t.y - p.y, t.x - p.x), scale: 0.8, dur: 0.4 });
        } else {
          const a = p.aim;
          p.ddx = Math.cos(a); p.ddy = Math.sin(a);
          p.dodgeT = sk.range / CT.DODGE.spd;
          p.iframe = Math.max(p.iframe, sk.iframe);
        }
        break;
      }
      case 'vachthep': {
        const a = p.aim;
        const wx = p.x + Math.cos(a) * 48, wy = p.y + Math.sin(a) * 48;
        const hpMul = (R.cd.passive && R.cd.passive.wallMul) || 1;
        R.walls.push({ x: wx, y: wy, r: sk.w * 0.34, hp: sk.hp * hpMul,
                       hpMax: sk.hp * hpMul, t: 0, life: sk.dur, ang: a + Math.PI / 2 });
        FX.vfx('khien', wx, wy, { scale: 1.1 });
        break;
      }
      case 'ninthở':
        FX.slowmo(sk.slow, sk.dur);
        FX.vfx('nap', p.x, p.y, { scale: 1.2 });
        break;
      case 'goihon': {
        const t = nearestFoe(p.x, p.y, sk.range) || { x: p.x + Math.cos(p.aim) * 180, y: p.y + Math.sin(p.aim) * 180 };
        const bx = t.x, by = t.y;
        FX.vfx('hut', bx, by, { scale: sk.r / 48 });
        later(sk.delay, () => {
          for (const f of R.foes) {
            if (f.dead) continue;
            const d = Math.hypot(f.x - bx, f.y - by);
            if (d > sk.r) continue;
            f.x += (bx - f.x) * 0.72; f.y += (by - f.y) * 0.72;
            f.stun = Math.max(f.stun, sk.stun);
            if (R.sk.awakened) f.mark = 4;
          }
          FX.shake('no');
        });
        break;
      }
      case 'khoimu':
        p.invis = sk.dur;
        p.blinkAt = { x: p.x, y: p.y, t: sk.dur };
        FX.vfx('khoi', p.x, p.y, { scale: 1.4 });
        break;
      case 'baingươc': {
        const g = p.ghost[0];
        p.iframe = Math.max(p.iframe, sk.stasis);
        FX.vfx('cong', p.x, p.y, { scale: 1.0, dur: 0.5 });
        later(sk.stasis, () => {
          if (!g) return;
          p.x = g.x; p.y = g.y; p.hp = Math.max(p.hp, g.hp);
          p.ghost.length = 0;
          FX.vfx('cong', p.x, p.y, { scale: 1.0, dur: 0.5 });
          // Quay ngược ở ga cũng hồi lại bốn giây đếm ngược — biến chiêu cứu mạng thành
          // một chiêu tiết kiệm thời gian, tức nó có việc ở CẢ HAI pha.
          if (R.phase === 'ga') R.timer = Math.min(CT.LEG.stationSec, R.timer + sk.rewind);
          if (R.sk.awakened) { p.dodgeCh = CT.DODGE.charges; p.skillCh = R.sk.charges || 1; }
        });
        break;
      }
      case 'ongtiem':
        p.hp = Math.min(p.hpMax, p.hp + p.hpMax * sk.healPct);
        p.stun = 0; p.slowT = 0; p.iframe = Math.max(p.iframe, sk.ccImmune);
        FX.vfx('hoi', p.x, p.y, { scale: 1.0 });
        FX.pop(p.x, p.y - 26, '+' + Math.round(p.hpMax * sk.healPct), '#8ce08c', true);
        break;
      case 'thaxich': {
        const t = nearestFoe(p.x, p.y, 420);
        R.dogs.push({ x: p.x, y: p.y, hp: sk.dogHp, hpMax: sk.dogHp,
                      target: t, t: 0, dps: sk.dogDps, pinLeft: sk.pin, seed: Math.random() });
        break;
      }
    }
    if (G.onSfx) G.onSfx('skill');
  }

  function blinkBack() {
    const p = R.p;
    if (!p.blinkAt) return;
    FX.vfx('cong', p.x, p.y, { scale: 0.9, dur: 0.45 });
    p.x = p.blinkAt.x; p.y = p.blinkAt.y;
    FX.vfx('cong', p.x, p.y, { scale: 0.9, dur: 0.45 });
    p.blinkAt = null;
    if (R.sk.awakened) p.nextShotX2 = true;
  }

  function chargeHits() {
    const p = R.p, sk = R.sk;
    for (const f of R.foes) {
      if (f.dead || f.charged) continue;
      if (dist2(f, p) < (f.r + p.r + 10) * (f.r + p.r + 10)) {
        f.charged = 1;
        hurtFoe(f, 40 * R.st.dmg, p.x, p.y, false);
        f.stun = Math.max(f.stun, sk.up);
        f.vx += p.cdx * 320; f.vy += p.cdy * 320;
      }
    }
    if (sk.awakened && (R.fireTrailT || 0) <= 0) {
      R.fireTrailT = 0.06;
      R.fires = R.fires || [];
      R.fires.push({ x: p.x, y: p.y, r: 34, dmg: 22, t: 0, life: 3 });
    }
  }

  function stepSkillObjects(dt) {
    const p = R.p;
    if (R.fireTrailT > 0) R.fireTrailT -= dt;
    // vách
    for (let i = R.walls.length - 1; i >= 0; i--) {
      const w = R.walls[i];
      w.t += dt;
      if (R.phase === 'chay' && p.onTrain) w.x += (R.dist - R.prevDist);
      if (w.t >= w.life || w.hp <= 0) {
        FX.vfx('bui', w.x, w.y, { scale: 0.8 });
        R.walls.splice(i, 1);
      }
    }
    // kẽm gai
    R.wires = (R.wires || []).filter(w => w.hits > 0);
    // vũng lửa
    R.fires = (R.fires || []).filter(f => {
      f.t += dt;
      if (f.t >= f.life) return false;
      if ((f.cd = (f.cd || 0) - dt) <= 0) {
        f.cd = 0.4;
        for (const e of R.foes) {
          if (!e.dead && dist2(e, f) < f.r * f.r) hurtFoe(e, f.dmg, f.x, f.y, false);
        }
      }
      if (Math.random() < 0.5) FX.embers(f.x + rnd(-f.r, f.r), f.y + rnd(-8, 8), 1);
      return true;
    });
    // chó
    for (let i = R.dogs.length - 1; i >= 0; i--) {
      const d = R.dogs[i];
      d.t += dt;
      let t = d.target;
      if (!t || t.dead) t = d.target = nearestFoe(d.x, d.y, 500);
      if (t) {
        const dx = t.x - d.x, dy = t.y - d.y, l = Math.hypot(dx, dy) || 1;
        if (l > 20) { d.x += dx / l * 210 * dt; d.y += dy / l * 210 * dt; }
        else {
          t.pin = Math.max(t.pin, 0.2);
          d.bite = (d.bite || 0) - dt;
          if (d.bite <= 0) { d.bite = 0.5; hurtFoe(t, d.dps * 0.5, d.x, d.y, false); }
        }
      } else {
        const dx = p.x - d.x, dy = p.y - d.y, l = Math.hypot(dx, dy) || 1;
        if (l > 40) { d.x += dx / l * 170 * dt; d.y += dy / l * 170 * dt; }
      }
      if (d.hp <= 0) R.dogs.splice(i, 1);
    }
    // mồi
    if (R.bait) { R.bait.t -= dt; if (R.bait.t <= 0) R.bait = null; }
    // sét
    if (R.pendingBolt) {
      R.pendingBolt.t -= dt;
      if (R.pendingBolt.t <= 0) {
        const b = R.pendingBolt; R.pendingBolt = null;
        FX.flash(0.5, '210,235,255');
        FX.shake('set');
        FX.vfx('tia', b.x, b.y, { scale: 1.6 });
        FX.light({ x: b.x, y: b.y, r: CT.LIGHT.bolt.r, warm: CT.LIGHT.bolt.warm, power: 1 });
        // cột thu lôi trên tàu hút sét — đứng trong toa là đúng
        if (!b.safe && Math.hypot(p.x - b.x, p.y - b.y) < 60) {
          p.hp = 0; hurtPlayer(CT.STORM.boltDmg, 0);
        }
        for (const f of R.foes) if (Math.hypot(f.x - b.x, f.y - b.y) < 70) hurtFoe(f, 500, b.x, b.y, false);
        if (G.onSfx) G.onSfx('bolt');
      }
    }
    // xác mờ dần
    for (let i = R.corpses.length - 1; i >= 0; i--) {
      const c = R.corpses[i];
      c.t += dt;
      if (R.phase === 'chay' && c.onTrain) c.x += (R.dist - R.prevDist);
      if (c.t > c.life + c.fade) R.corpses.splice(i, 1);
    }
  }

  // ---------------------------------------------------------------------------
  // ĐỒ VÀ BAO TẢI
  // ---------------------------------------------------------------------------
  function makeLoot(x, y) {
    const size = pick(CT.SIZES), mat = pick(CT.MATS);
    const val = Math.round(180 * size.mul * mat.mul * (1 + (R.map.tier - 1) * 0.34));
    return { x, y, size, mat, val, cells: size.cells,
             name: mat.name + ' ' + pick(CT.LOOT_NOUNS),
             bob: Math.random(), r: size.r };
  }
  function dropAmmo(x, y) {
    const a = pick(CT.AMMO.filter(a => a.id !== 'nang'));
    R.drops.push({ x, y, kind: 'ammo', ammo: a.id, n: Math.ceil(a.box / 3), r: 8, bob: Math.random() });
  }

  // ---------------------------------------------------------------------------
  // MUA VÀ BÁN — tiền trong ván
  // ---------------------------------------------------------------------------
  // Giá bán một món ở quầy. Đúng bằng giá trị của nó: quầy không ép giá, vì cái giá
  // thật của việc bán nằm ở chỗ KHÁC — bán rồi thì không mang về đổi vàng được nữa.
  G.sellPriceOf = it => Math.round(it.val * CT.SELL_TO_CASH);

  G.sellOne = function (from, i) {
    if (!nearShop()) { say('Phải đứng ở quầy mới bán được.', 1.4); return 0; }
    const arr = from === 'stash' ? R.stash : R.bag;
    const it = arr[i];
    if (!it) return 0;
    if (from === 'stash' && !R.p.onTrain) { say('Tủ ở trên tàu.', 1.3); return 0; }
    arr.splice(i, 1);
    const v = G.sellPriceOf(it);
    R.cash += v; R.sold += v; R.lootVal -= it.val;
    if (G.onSfx) G.onSfx('sell');
    return v;
  };

  G.sellAllBag = function () {
    if (!nearShop()) { say('Phải đứng ở quầy mới bán được.', 1.4); return 0; }
    let v = 0;
    R.bag.forEach(it => { v += G.sellPriceOf(it); R.lootVal -= it.val; });
    R.bag.length = 0;
    R.cash += v; R.sold += v;
    if (v && G.onSfx) G.onSfx('sell');
    return v;
  };

  // Mua. Ba đường đi khác nhau cho ba loại hàng, và KHÔNG loại nào chiếm ô bao tải:
  //   đạn  → thùng đạn      (luật đã hứa từ đầu: đạn không ăn chỗ)
  //   than → toa than       (rồi vẫn phải xúc vào lò)
  //   đồ dùng → thẳng ô tay (luật đã hứa: mua là vào slot)
  //   súng → tay hoặc lưng  (hai khẩu, đổi qua lại được)
  G.buy = function (stockId) {
    let gunSlot = null, gunDropped = null;
    const k = CT.STOCK.find(x => x.id === stockId);
    if (!k) return { ok: false, why: 'Không có món này.' };
    const st = R.station && R.station.shop;
    const row = st && st.stock.find(x => x.id === stockId);
    if (!row || row.left <= 0) return { ok: false, why: 'Quầy hết món này.' };
    if (R.cash < k.cash) return { ok: false, why: 'Không đủ tiền.' };

    if (k.kind === 'ammo') {
      R.ammo[k.ammo] = (R.ammo[k.ammo] | 0) + k.n;
    } else if (k.kind === 'fuel') {
      R.coal += k.n;
    } else if (k.kind === 'use') {
      const slot = handSlotFor(k.use);
      if (slot < 0) return { ok: false, why: 'Ba ô tay đã đầy, và không ô nào cùng loại.' };
      if (R.hand[slot]) R.hand[slot].n += k.n;
      else R.hand[slot] = { id: k.use, n: k.n };
    } else if (k.kind === 'gun') {
      const g = CT.GUN_BY_ID[k.gun];
      const pa = R.cd.passive || {};
      if (pa.noGun) return { ok: false, why: R.cd.name + ' không dùng súng.' };
      if (pa.noLongGun && g.ammo !== 'nhe')
        return { ok: false, why: R.cd.name + ' chỉ cầm được súng ngắn.' };
      const r = G.takeGun(k.gun);
      if (!r.ok) return r;
      gunSlot = r.slot; gunDropped = r.dropped;
    }

    R.cash -= k.cash; R.spent += k.cash;
    row.left--;
    if (G.onSfx) G.onSfx('buy');
    return { ok: true, name: k.name, slot: gunSlot, dropped: gunDropped };
  };

  // Ô tay nào nhận được món này: ô đang giữ đúng món đó trước, rồi tới ô trống.
  function handSlotFor(useId) {
    for (let i = 0; i < CT.HAND_SLOTS; i++) if (R.hand[i] && R.hand[i].id === useId) return i;
    for (let i = 0; i < CT.HAND_SLOTS; i++) if (!R.hand[i]) return i;
    return -1;
  }
  G.handSlotFor = handSlotFor;

  // ---------------------------------------------------------------------------
  // HAI KHẨU SÚNG
  // ---------------------------------------------------------------------------
  // Cầm một khẩu, đeo lưng một khẩu, đổi qua lại mất một nhịp nạp. Hai là con số đúng:
  // một khẩu thì mua súng mới là mất trắng khẩu cũ, ba khẩu thì phải có thêm nút.
  G.takeGun = function (gunId) {
    const g = CT.GUN_BY_ID[gunId];
    if (!g) return { ok: false, why: 'Không có khẩu đó.' };
    if (R.gun && R.gun.id === gunId) return { ok: false, why: 'Đang cầm khẩu này rồi.' };
    if (R.gunAlt && R.gunAlt.id === gunId) return { ok: false, why: 'Đã đeo khẩu này sau lưng.' };
    if (!R.gun) { R.gun = g; R.gunMag = 0; R.reloadT = 0; return { ok: true, slot: 'tay' }; }
    if (!R.gunAlt) { R.gunAlt = g; R.gunAltMag = 0; return { ok: true, slot: 'lưng' }; }
    // Cả hai chỗ đã có: khẩu trên LƯNG bị bỏ lại, không phải khẩu đang cầm. Người chơi
    // đang cầm khẩu nào là do họ chọn, nên đừng giật nó khỏi tay họ.
    const drop = R.gunAlt;
    R.gunAlt = g; R.gunAltMag = 0;
    return { ok: true, slot: 'lưng', dropped: drop.name };
  };

  G.swapGun = function () {
    if (!R.gunAlt) { say('Không có khẩu thứ hai.', 1.2); return false; }
    const g = R.gun, m = R.gunMag;
    R.gun = R.gunAlt; R.gunMag = R.gunAltMag;
    R.gunAlt = g; R.gunAltMag = m;
    R.reloadT = 0;
    R.p.atkCd = Math.max(R.p.atkCd, 0.35);     // đổi súng mất một nhịp
    say('Rút ' + R.gun.name + '.', 1.2);
    if (G.onSfx) G.onSfx('reload');
    return true;
  };

  function bagUsed() { return R.bag.reduce((s, i) => s + i.cells, 0); }
  G.bagUsed = bagUsed;
  function bagFree() { return R.bagMax + (R.spec.bagPlus || 0) - bagUsed(); }
  G.bagFree = bagFree;

  function tryPick(it) {
    if (it.cells > bagFree()) { say('Bao tải đầy.', 1.2); return false; }
    R.bag.push(it);
    R.lootVal += it.val;
    FX.pop(it.x, it.y - 12, '+' + CT.money(it.val), '#ffd06a');
    if (G.onSfx) G.onSfx('pick');
    return true;
  }
  G.tryPick = tryPick;

  // Nhét hết bao tải vào tủ. Tủ nằm trên tàu và không giới hạn — đó là lý do vòng lặp
  // tự nhiên thành: chạy vào nhặt đầy bao → chạy về đổ lên tàu → quay lại nếu còn giờ.
  G.dumpAll = function () {
    if (!R.p.onTrain) { say('Phải đứng trên tàu mới mở tủ được.', 1.4); return 0; }
    const n = R.bag.length;
    R.stash = R.stash.concat(R.bag);
    R.bag.length = 0;
    if (n) { say('Đã cất ' + n + ' món vào tủ.', 1.4); if (G.onSfx) G.onSfx('stash'); }
    return n;
  };
  G.nearTrain = function () { return R.p.onTrain; };

  // ---------------------------------------------------------------------------
  // ĐỐT: bốn thứ khác nhau, cùng một cái lò
  // ---------------------------------------------------------------------------
  // Có gì đốt được không, ở BẤT CỨ ĐÂU: toa than, xác quanh đây, đồ trong bao, trong tủ.
  // Câu trả lời "không" là điều kiện duy nhất để hệ thống thả than cứu kẹt.
  function anythingBurnable() {
    if (R.coal > 0) return true;
    if (R.corpses.length) return true;
    if (R.p.carry && R.p.carry.kind === 'corpse') return true;
    if (R.bag.some(it => burnValOf(it) > 0)) return true;
    if (R.stash.some(it => burnValOf(it) > 0)) return true;
    return false;
  }
  G.anythingBurnable = anythingBurnable;

  // Một món đồ bán được thì đáng bao nhiêu nhiên liệu. Bảng này đọc theo CHẤT LIỆU chứ
  // không theo giá tiền: cái ghế gỗ rẻ tiền cứu được chuyến tàu, cái nhẫn vàng thì không.
  const BURN_MAT = { go: CT.BURNABLE.ghe, vai: CT.BURNABLE.sach, giay: CT.BURNABLE.bao };
  function burnValOf(it) {
    if (!it) return 0;
    const m = (it.mat && it.mat.id) || '';
    return BURN_MAT[m] || 0;
  }
  G.burnValOf = burnValOf;

  function addFuel(n, label) {
    R.fuel = Math.min(CT.FUEL.tank, R.fuel + n);
    R.saidDry = false; R.dryT = 0;
    FX.pop(R.p.x, R.p.y - 26, '+' + label, '#ffb45a');
    FX.embers(locoX() + 96, deckMidY(), 8);
    if (G.onSfx) G.onSfx('fuel');
  }

  // XÚC THAN. Một cục = 600 nhiên liệu ≈ một trăm sáu mươi giây chạy.
  G.shovel = function () {
    if (R.coal <= 0) { say('Toa than trống.', 1.3); return false; }
    if (R.fuel > CT.FUEL.tank - 60) { say('Lò đã đầy.', 1.3); return false; }
    R.coal--; R.shovels++; R.coalBurned++;
    addFuel(CT.BURNABLE.than, 'than');
    FX.shake('ban');
    return true;
  };

  // Đốt một món trong bao hoặc trong tủ. Mất món đó, mất luôn tiền bán nó.
  G.burnItem = function (from, i) {
    const arr = from === 'stash' ? R.stash : R.bag;
    const it = arr[i];
    if (!it) return false;
    const v = burnValOf(it);
    if (v <= 0) { say(it.name + ' không cháy.', 1.4); return false; }
    arr.splice(i, 1);
    R.lootVal -= it.val;
    addFuel(v, it.name.toLowerCase());
    return true;
  };

  // Đốt cái xác đang vác, hoặc cái xác gần nhất trong tầm với.
  G.burnCorpse = function () {
    const p = R.p;
    if (p.carry && p.carry.kind === 'corpse') {
      p.carry = null;
      addFuel(CT.BURNABLE.xac, 'nhiên liệu');
      return true;
    }
    let c = null, ci = -1, bd = 90 * 90;
    R.corpses.forEach((x, i) => { const d = dist2(x, p); if (d < bd) { bd = d; c = x; ci = i; } });
    if (!c) return false;
    R.corpses.splice(ci, 1);
    addFuel(CT.BURNABLE.xac, 'nhiên liệu');
    return true;
  };

  // ---------------------------------------------------------------------------
  // MỘT NÚT, NHIỀU VIỆC — nhưng người chơi phải BIẾT TRƯỚC nó sẽ làm việc gì
  // ---------------------------------------------------------------------------
  // Nút ⓐ gánh sáu việc: nhặt đồ, vác xác, thả xác, xúc than, đốt lò, mở quầy. Gộp
  // như vậy vì màn hình điện thoại nằm ngang chỉ đủ chỗ cho một vùng ngón cái, và bảy
  // nút đã là trần rồi. Cái giá của việc gộp là người chơi không đoán được nó sẽ làm
  // gì — nên hàm này trả về CẢ hành động lẫn NHÃN, và HUD in cái nhãn đó ngay dưới
  // nút. Không bao giờ để người chơi bấm rồi mới biết.
  const FIRE_R = 58, SHOP_R = 62;
  function fireboxX() { return locoX() + 96; }
  G.fireboxX = fireboxX;

  function nearFirebox() {
    const p = R.p;
    if (!p.onTrain) return false;
    return Math.abs(p.x - fireboxX()) < FIRE_R && Math.abs(p.y - deckMidY()) < TA.DECK_H;
  }
  G.nearFirebox = nearFirebox;

  function nearShop() {
    const st = R.station;
    if (!st || !st.shop || R.p.onTrain) return false;
    return dist2(R.p, st.shop) < SHOP_R * SHOP_R;
  }
  G.nearShop = nearShop;

  // Việc mà nút ⓐ sẽ làm ngay lúc này. Trả về { kind, label, ... } hoặc null.
  function actTarget() {
    const p = R.p;

    // 1. Đang vác thì mọi thứ khác đứng sau. Vác xác mà đứng cạnh lò là chuyện duy nhất
    //    người chơi muốn làm; vác xác đứng chỗ khác thì chỉ còn nước bỏ xuống.
    if (p.carry) {
      if (nearFirebox()) return { kind: 'burn-carry', label: 'Ném vào lò' };
      // Xác có tiền thưởng bán được ở quầy. Đốt nó thì được nhiên liệu mà mất tiền —
      // hai thứ đó không bao giờ cùng lúc, và đó chính là chỗ để người chơi cân.
      if (nearShop() && p.carry.bounty > 0)
        return { kind: 'sell-carry', label: 'Bán xác ' + CT.money(p.carry.bounty) };
      return { kind: 'drop-carry', label: 'Bỏ xác xuống' };
    }

    // 2. Lò. LUÔN mở bảng, kể cả khi chỉ định xúc một cục than — vì bảng đó là chỗ
    //    DUY NHẤT nói ra "lò còn cháy được bao nhiêu giây nữa", và đó đúng là con số
    //    người chơi cần đọc ngay lúc họ đứng trước cửa lò. Một cú bấm nữa rẻ hơn nhiều
    //    so với việc đoán mò xem còn đủ than tới ga hay không.
    if (nearFirebox()) {
      const s2 = Math.round(R.fuel / (CT.FUEL.burnPerSec * R.spec.fuelMul));
      return { kind: 'fire', label: 'Lò · ' + s2 + 's · than ' + R.coal };
    }

    // 3. Nhặt: đồ bán và đồ rơi. Đứng TRƯỚC quầy hàng, vì cái quầy lúc nào cũng ở đó
    //    còn món đồ dưới chân thì không — và người chơi vào ga là để nhặt.
    let best = null, bd = 46 * 46, bi = -1, kind = null;
    R.loots.forEach((l, i) => { const d = dist2(l, p); if (d < bd) { bd = d; best = l; bi = i; kind = 'loot'; } });
    R.drops.forEach((l, i) => { const d = dist2(l, p); if (d < bd) { bd = d; best = l; bi = i; kind = 'drop'; } });
    if (best) {
      let lb = 'Nhặt';
      if (kind === 'loot') lb = 'Nhặt ' + best.name;
      else if (best.kind === 'ammo') lb = 'Nhặt ' + best.n + ' đạn';
      else if (best.kind === 'coal') lb = 'Nhặt than';
      else if (best.kind === 'scrap') lb = 'Nhặt phế liệu';
      return { kind: kind, i: bi, it: best, label: lb };
    }

    // 4. Xác — cũng là thứ "dưới chân". Vác được thì vác: nó vừa là nhiên liệu vừa là
    //    tiền thưởng, và một cái xác nằm ngay trước quầy thì phải dọn được, không thì
    //    nó khoá luôn cái quầy.
    let c = null, ci = -1, cd = 52 * 52;
    R.corpses.forEach((x, i) => { const d = dist2(x, p); if (d < cd) { cd = d; c = x; ci = i; } });
    if (c) return { kind: 'corpse', i: ci, it: c,
                    label: c.bounty ? ('Vác xác (' + CT.money(c.bounty) + ')') : 'Vác xác' };

    // 5. Quầy hàng, khi dưới chân đã sạch. LUẬT MỘT CÂU: nút ⓐ dọn chỗ đứng trước, mở
    //    quầy sau. Cái quầy không bỏ đi đâu cả; món đồ và cái xác thì có.
    if (nearShop()) return { kind: 'shop', label: 'Quầy hàng' };

    return null;
  }
  G.actTarget = actTarget;
  G.actHint = function () { const t = actTarget(); return t ? t.label : ''; };

  function doAct() {
    const p = R.p;
    const t = actTarget();
    if (!t) { say('Không có gì ở đây.', 0.9); return; }

    if (t.kind === 'burn-carry') { G.burnCorpse(); return; }
    if (t.kind === 'sell-carry') {
      const v = p.carry.bounty;
      p.carry = null;
      R.cash += v; R.sold += v;
      FX.pop(p.x, p.y - 26, '+' + CT.money(v), '#ffd06a');
      say('Bán xác lấy ' + CT.money(v) + '.', 1.6);
      if (G.onSfx) G.onSfx('sell');
      return;
    }
    if (t.kind === 'drop-carry') {
      const cc = p.carry;
      R.corpses.push({ x: p.x, y: p.y, t: 0, life: 12, fade: 3.6, art: cc.art,
                       row: cc.row || 0, seed: cc.seed || 0, scale: cc.scale || 1,
                       bounty: cc.bounty || 0, onTrain: p.onTrain });
      p.carry = null;
      return;
    }
    if (t.kind === 'shop') { if (G.onShop) G.onShop(); return; }
    if (t.kind === 'fire') { if (G.onFire) G.onFire(); return; }

    if (t.kind === 'corpse') {
      // Vác xác: chậm hơn và KHÔNG bắn được. Hai bàn tay đang bận, và cái giá đó là
      // toàn bộ lý do vác xác đáng gọi là một quyết định.
      const c = R.corpses.splice(t.i, 1)[0];
      p.carry = { kind: 'corpse', art: c.art, row: c.row, seed: c.seed,
                  scale: c.scale, bounty: c.bounty || 0 };
      say('Đang vác xác — không bắn được. Bấm lại để bỏ xuống.', 1.8);
      if (G.onSfx) G.onSfx('pick');
      return;
    }

    if (t.kind === 'loot') { if (tryPick(t.it)) R.loots.splice(t.i, 1); return; }

    const best = t.it;
    if (best.kind === 'ammo') {
      R.ammo[best.ammo] += best.n;
      FX.pop(best.x, best.y - 10, '+' + best.n + ' đạn', '#9fd0ff');
    } else if (best.kind === 'coal') {
      // Than KHÔNG thành nhiên liệu ngay. Nó vào toa than, và phải xúc.
      R.coal++;
      FX.pop(best.x, best.y - 10, '+1 than', '#ffb45a');
    } else if (best.kind === 'scrap') {
      R.scrap += best.n;
      FX.pop(best.x, best.y - 10, '+' + best.n + ' phế liệu', '#c8d0d8');
    }
    R.drops.splice(t.i, 1);
    if (G.onSfx) G.onSfx('pick');
  }

  function feedFire() {
    if (!G.burnCorpse()) say('Không có gì để đốt ở đây.', 1.2);
  }

  function useHand(i) {
    const slot = R.hand[i];
    if (!slot || slot.n <= 0) return;
    const u = CT.USABLE_BY_ID[slot.id];
    if (!u) return;
    const p = R.p, act = u.act;
    if (act.heal) { p.hp = Math.min(p.hpMax, p.hp + act.heal); FX.vfx('hoi', p.x, p.y, { scale: 0.7 });
                    FX.pop(p.x, p.y - 24, '+' + act.heal, '#8ce08c'); }
    if (act.hot) { p.hot = act.hot; p.hotT = act.hotSec; p.spdBuff = act.hotSec; }
    if (act.throw) {
      const tx = p.x + Math.cos(p.aim) * 150, ty = p.y + Math.sin(p.aim) * 150;
      if (act.blast) blast(tx, ty, act.blast.dmg, act.blast.r);
      if (act.fire) { R.fires = R.fires || [];
                      R.fires.push({ x: tx, y: ty, r: act.fire.r, dmg: act.fire.dmg, t: 0, life: act.fire.sec });
                      FX.vfx('no', tx, ty, { scale: 0.9 }); }
    }
    if (act.wall) R.walls.push({ x: p.x + Math.cos(p.aim) * 40, y: p.y + Math.sin(p.aim) * 40,
                                 r: 26, hp: act.wall.hp, hpMax: act.wall.hp, t: 0, life: 999 });
    if (act.wire) { R.wires = R.wires || [];
                    R.wires.push({ x: p.x, y: p.y, r: 30, dmg: act.wire.dmg,
                                   stun: act.wire.stun, hits: act.wire.hits }); }
    slot.n--;
    if (slot.n <= 0) R.hand[i] = null;
    if (G.onSfx) G.onSfx('use');
  }
  G.useHand = useHand;

  // ---------------------------------------------------------------------------
  // GA
  // ---------------------------------------------------------------------------
  function buildStation() {
    const base = R.dist + 40;
    const st = { houses: [], props: [] };

    // QUẦY HÀNG dựng TRƯỚC nhà cửa, vì nhà phải tránh nó chứ không phải ngược lại.
    // Đặt sát chỗ tàu đỗ, không đặt cuối ga: quầy phải là thứ ghé được TRONG lúc chạy đi
    // chạy về, chứ không phải một chuyến riêng ăn hết đồng hồ.
    //
    // y = GROUND_Y + 92, không phải sát đường ray: dải ray vẽ dày tới GROUND_Y + 26 và
    // mái bạt quầy cao 60 đơn vị — đặt gần hơn thì cái mái chui vào trong đường ray.
    // x = base − 180, tức là NGANG VỚI ĐOÀN TÀU chứ không phải phía trước đầu máy.
    // Đặt ở base + 150 thì quầy nằm trước mũi tàu, mà lúc đỗ khung hình nhìn NGƯỢC về
    // phía đuôi tàu (người chơi đứng ở toa cuối) — nên cái quầy dạt hẳn ra rìa phải,
    // nấp sau nút Bắn. Ngang thân tàu thì nó nằm giữa khung ngay lúc vừa đỗ, và đúng
    // với lời hứa "ghé được trong lúc chạy đi chạy về".
    st.shop = { x: base - 180, y: GROUND_Y + 92, r: SHOP_R, seed: Math.random(), stock: [] };
    const SHOP_CLEAR = 170;      // bán kính cấm dựng nhà quanh quầy

    const n = 3 + ((Math.random() * 3) | 0) + Math.floor(R.map.tier / 3);
    for (let i = 0; i < n; i++) {
      let hx = 0, hy = 0;
      // Bốc lại tối đa tám lần rồi thôi. Tám lần là quá đủ trên một dải rộng 900 đơn vị,
      // và một vòng lặp vô hạn trong hàm dựng ga thì tệ hơn một căn nhà đặt xấu.
      for (let k = 0; k < 8; k++) {
        hx = base + rnd(60, 900);
        hy = GROUND_Y + rnd(40, 190);
        if (Math.hypot(hx - st.shop.x, hy - st.shop.y) > SHOP_CLEAR) break;
      }
      const w = rnd(90, 150), h = rnd(70, 110);
      const house = { x: hx, y: hy, w, h, looted: false, locked: Math.random() < 0.35,
                      lootN: 1 + ((Math.random() * 3) | 0), seed: Math.random() };
      st.houses.push(house);
      // đồ trong nhà
      for (let k = 0; k < house.lootN; k++) {
        R.loots.push(makeLoot(hx + rnd(-w / 2 + 16, w / 2 - 16), hy + rnd(-h / 2 + 16, h / 2 - 16)));
      }
    }
    // than và đạn rải quanh ga — luôn có, vì hết than giữa sa mạc phải là một cú sợ
    // chứ không phải một ngõ cụt
    for (let i = 0; i < 2 + (Math.random() * 2 | 0); i++)
      R.drops.push({ x: base + rnd(40, 800), y: GROUND_Y + rnd(20, 170),
                     kind: 'coal', r: 9, bob: Math.random() });
    for (let i = 0; i < 3; i++) dropAmmo(base + rnd(40, 800), GROUND_Y + rnd(20, 170));
    for (let i = 0; i < 2; i++)
      R.drops.push({ x: base + rnd(40, 800), y: GROUND_Y + rnd(20, 170),
                     kind: 'scrap', n: 2 + (Math.random() * 3 | 0), r: 8, bob: Math.random() });
    const always = CT.STOCK.filter(k => k.always);
    const rest = CT.STOCK.filter(k => !k.always).slice();
    for (let i = rest.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;
                                                const t = rest[i]; rest[i] = rest[j]; rest[j] = t; }
    // Càng đi sâu quầy càng nhiều hàng — nhưng KHÔNG BAO GIỜ đủ mọi thứ. "Ga sau chắc
    // có súng trường" phải là một canh bạc, không phải một lời hứa.
    const nExtra = 3 + Math.min(3, Math.floor(R.map.tier / 3)) + (R.leg > 1 ? 1 : 0);
    st.shop.stock = always.concat(rest.slice(0, nExtra))
      .map(k => ({ id: k.id, left: k.kind === 'gun' ? 1 : (2 + (Math.random() * 2 | 0)) }));

    // vật trang trí
    for (let i = 0; i < 26; i++) {
      const px = base + rnd(-200, 1100), py = GROUND_Y + rnd(-60, 230);
      // Cây xương rồng cao bằng người mọc ngay trước mặt quầy thì che mất tấm biển.
      // 150 chứ không phải 90: cây khô và xương rồng cao gần bằng chiều cao cả cái sạp,
      // nên chúng che được biển hàng từ khoảng cách xa hơn nhiều bán kính chân của chúng.
      if (Math.hypot(px - st.shop.x, py - st.shop.y) < 150) continue;
      st.props.push({ x: px, y: py,
                      k: pick(['cactus', 'tree', 'rockA', 'rockB', 'rockC', 'bush', 'fence']),
                      seed: Math.random() });
    }
    R.station = st;

    // trùm ở chặng cuối của map cuối
    if (R.leg === R.legs && R.map.tier >= 9) {
      const b = CT.FOE_BY_ID['trum'];
      spawnFoe(b);
      R.foes[R.foes.length - 1].x = base + 620;
      R.foes[R.foes.length - 1].y = GROUND_Y + 60;
      R.foes[R.foes.length - 1].sleep = false;
      say('Có thứ gì đó đang đợi ở cuối ga.', 3);
    }
  }

  function stepStation(dt) {
    R.timer -= dt;
    // báo mốc, dày dần. Ngưỡng mười giây là lúc chuyển sang đếm từng giây — đó là giới
    // hạn người ta còn dán mắt được vào một cái đồng hồ.
    CT.LEG.warnAt.forEach(s => {
      if (R.timer <= s && !R.warned[s]) {
        R.warned[s] = 1;
        say(s <= 10 ? ('TÀU CHẠY SAU ' + s) : ('Tàu chạy sau ' + s + ' giây'), 1.2);
        if (G.onSfx) G.onSfx(s <= 5 ? 'whistleShort' : 'whistle');
      }
    });
    if (R.timer <= 0) {
      // Ân xá: đã chạm được bậc lên tàu thì vẫn kịp. Một cú nước rút tuyệt vọng phải có
      // khả năng thành công, nếu không người chơi thấy bất công chứ không thấy căng.
      if (!R.p.onTrain) {
        R.graceT = (R.graceT || CT.LEG.boardGrace) - dt;
        const s = deckSpan();
        const near = R.p.x > s.a - 60 && R.p.x < s.b + 60 && R.p.y < GROUND_Y + 30;
        if (R.graceT > 0 && near) return;
        // bỏ lại: mất sạch bao tải, nhưng tủ thì vẫn còn
        say('Tàu chạy mất. Bao tải rơi hết.', 3);
        R.bag.length = 0;
        R.p.hp = Math.max(1, R.p.hp - R.p.hpMax * 0.4);
        R.p.onTrain = true; R.p.y = deckMidY(); R.p.x = R.dist - TA.LOCO_W - 60;
      }
      R.graceT = null;
      // dọn thị trấn khỏi thế giới
      R.loots.length = 0; R.drops.length = 0; R.station = null;
      nextLeg();
    }
  }

  // ---------------------------------------------------------------------------
  // CAMERA
  // ---------------------------------------------------------------------------
  const cam = { x: 0, y: 0 };
  G.cam = cam;
  function stepCam(dt) {
    const p = R.p;
    let tx, ty;
    if (R.phase === 'chay') {
      // khoá vào đoàn tàu; mũi tàu nằm ở 76% bề ngang
      tx = R.dist - (viewW / zoom()) * 0.76;
      // ty là MÉP TRÊN của khung, không phải tâm — nhánh 'ga' bên dưới tính đúng như vậy
      // (p.y trừ đi nửa khung). Nhánh này trước đây gán thẳng −22 như thể đó là tâm, mà
      // nóc toa nằm ở −96: hậu quả là 74 đơn vị trên cùng của sàn tàu bị đẩy ra ngoài mép
      // trên, còn nửa dưới màn hình là cát trống. Người chơi đứng trên nóc toa mà nóc toa
      // bị cắt.
      //
      // Căn ĐÚNG GIỮA vào sàn tàu — tức là vào chính chỗ người chơi đứng suốt cả pha
      // này. Có thử căn vào "dải có việc xảy ra" (nóc toa xuống tới dưới đường ray) để
      // thấy được nhiều mặt đất hơn, nhưng làm vậy thì đoàn tàu bị đẩy lên khoảng 44%
      // chiều cao khung, và thứ người chơi nhìn suốt ván lại không nằm ở chỗ mắt nhìn
      // vào. Đất trống phía trên là cái giá phải trả, và nó rẻ hơn.
      ty = deckMidY() - (viewH / zoom()) * 0.5;
    } else {
      // theo người chơi, nhưng nhìn trước 22% về phía đoàn tàu để lối về luôn trong khung
      const back = R.dist - (viewW / zoom()) * 0.5;
      tx = p.x - (viewW / zoom()) * 0.5 + (R.dist > p.x ? 60 : -60);
      tx = Math.max(tx, back - 260);
      // Đang đứng TRÊN TÀU ở ga thì đừng căn vào người chơi: sàn tàu ở −48, mà thị trấn
      // trải từ mặt đất 96 xuống tới 188 (chỗ cái quầy). Căn vào người chơi thì đáy khung
      // dừng ở 167 — cái quầy nằm ngay dưới mép, tức là thứ đáng làm nhất ở ga lại là
      // thứ duy nhất không nhìn thấy lúc vừa tới nơi.
      //
      // Nên khi còn trên tàu thì nhìn vào KHOẢNG GIỮA sàn tàu và thị trấn; nhảy xuống
      // rồi thì camera bám người chơi như bình thường. Chuyển mượt vì camera vốn đã nội suy.
      const focusY = p.onTrain ? (deckMidY() + GROUND_Y + 60) * 0.5 : p.y;
      ty = focusY - (viewH / zoom()) * 0.5;
    }
    const k = Math.min(1, dt * (R.phase === 'chay' ? 14 : 6.5));
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;
  }

  // ---------------------------------------------------------------------------
  // NHỊP
  // ---------------------------------------------------------------------------
  G.step = function (dtReal) {
    if (!R || R.paused) return;
    FX.step(dtReal);
    if (FX.isFrozen()) return;
    const dt = dtReal * FX.timeScale();
    if (R.phase === 'xong') return;

    R.t += dt;
    if (R.msgT > 0) R.msgT -= dtReal;

    stepTimers(dt);
    stepClock(dt);
    stepTrain(dt);
    stepPlayer(dt);
    stepFoes(dt);
    stepBullets(dt);
    stepSkillObjects(dt);
    stepSpawn(dt);
    if (R.phase === 'ga') stepStation(dt);
    stepCam(dt);

    // tự nhặt đồ đứng đè lên
    const p = R.p;
    for (let i = R.loots.length - 1; i >= 0; i--) {
      if (dist2(R.loots[i], p) < 20 * 20) { if (tryPick(R.loots[i])) R.loots.splice(i, 1); }
    }
    // tàu chạy qua thì tiếng động đánh thức
    if (R.spd > 20) noise(R.dist - R.trainLen * 0.5, deckMidY(), CT.NOISE.tau * clamp(R.spd / MAX_SPD, 0.3, 1));
  };

  // ---------------------------------------------------------------------------
  // VẼ
  // ---------------------------------------------------------------------------
  G.resize = function (w, h, d) { viewW = w; viewH = h; dpr = d || 1; };
  G.view = () => ({ w: viewW, h: viewH, zoom: zoom() });

  G.draw = function (c) {
    if (!R) return;
    const z = zoom();
    const sh = FX.shakeOffset(viewW);

    c.save();
    c.imageSmoothingEnabled = false;

    // --- nền trời và sa mạc, cuộn theo tàu ---
    drawBackground(c, z);

    c.save();
    c.translate(viewW / 2 + sh.x, viewH / 2 + sh.y);
    c.rotate(sh.rot);
    c.scale(z, z);
    c.translate(-(cam.x + (viewW / z) / 2), -(cam.y + (viewH / z) / 2));

    drawWorld(c);

    c.restore();

    // --- ánh sáng, sau thế giới, trước HUD ---
    const amb = clamp(R.amb, 0, 1);
    if (amb < 0.995) {
      collectLights(z, sh);
      FX.drawLight(c, viewW, viewH, amb, R.tint ? tintRGB(R.tint, amb) : null);
      // lớp tự phát sáng vẽ SAU khi đã nhân đèn — nếu không thì chính ngọn lửa cũng bị
      // lớp tối làm tối đi
      c.save();
      c.translate(viewW / 2 + sh.x, viewH / 2 + sh.y);
      c.rotate(sh.rot); c.scale(z, z);
      c.translate(-(cam.x + (viewW / z) / 2), -(cam.y + (viewH / z) / 2));
      FX.drawParts(c, true);
      FX.drawVfx(c, 'sang');
      c.restore();
    } else {
      c.save();
      c.translate(viewW / 2 + sh.x, viewH / 2 + sh.y);
      c.rotate(sh.rot); c.scale(z, z);
      c.translate(-(cam.x + (viewW / z) / 2), -(cam.y + (viewH / z) / 2));
      FX.drawParts(c, true);
      FX.drawVfx(c, 'sang');
      c.restore();
    }

    FX.drawVignette(c, viewW, viewH,
      R.isNight ? CT.LIGHT.vignette.night : CT.LIGHT.vignette.day);
    FX.drawFlash(c, viewW, viewH);
    c.restore();
  };

  function tintRGB(hex, amb) {
    const n = parseInt(hex.slice(1), 16);
    const k = 1 - amb;
    const g = Math.round(amb * 255);
    return 'rgb(' + Math.round(g + ((n >> 16 & 255) - g) * k * 0.55) + ',' +
                    Math.round(g + ((n >> 8 & 255) - g) * k * 0.55) + ',' +
                    Math.round(g + ((n & 255) - g) * k * 0.55) + ')';
  }

  // Parallax. Tỉ lệ theo dáng hyperbol chứ không chia đều — tốc độ biểu kiến của một
  // lớp tỉ lệ nghịch với độ sâu của nó, nên 0.08 / 0.22 / 0.45 / 1.0 đọc ra là bốn lớp
  // ở bốn khoảng cách, còn 0.25 / 0.5 / 0.75 / 1.0 đọc ra là bốn tấm bìa trượt.
  function drawBackground(c, z) {
    const pal = R.map.pal;
    const amb = clamp(R.amb, 0, 1);
    // trời
    const g = c.createLinearGradient(0, 0, 0, viewH);
    g.addColorStop(0, mix(pal.sky, R.isNight ? R.night.sky : pal.sky, R.isNight ? 0.85 : 0));
    g.addColorStop(1, mix(pal.far, '#000000', R.isNight ? 0.4 : 0));
    c.fillStyle = g;
    c.fillRect(0, 0, viewW, viewH);

    const horizon = viewH * 0.34;
    // núi xa
    layerHills(c, R.dist * 0.08, horizon, viewH * 0.16, mix(pal.far, '#000', R.isNight ? 0.45 : 0.1), 260);
    layerHills(c, R.dist * 0.22, horizon + viewH * 0.05, viewH * 0.11, mix(pal.far, '#000', R.isNight ? 0.3 : -0.05), 170);

    // mặt cát
    c.fillStyle = mix(pal.sand, '#000', R.isNight ? 0.55 : 0);
    c.fillRect(0, horizon + viewH * 0.10, viewW, viewH);
    if (!A.tile(c, 'bg.sand', R.dist * 0.9, 0, viewW, viewH, 0.6)) { /* rơi về màu phẳng */ }
  }
  function layerHills(c, off, y, h, col, w) {
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(0, y + h);
    const x0 = -(((off % w) + w) % w);
    for (let x = x0; x < viewW + w; x += w) {
      c.lineTo(x, y + h);
      c.lineTo(x + w * 0.5, y - h * 0.2);
      c.lineTo(x + w, y + h);
    }
    c.lineTo(viewW, viewH); c.lineTo(0, viewH);
    c.closePath(); c.fill();
  }
  function mix(a, b, k) {
    if (k <= 0) return a;
    const n1 = parseInt(a.slice(1), 16), n2 = parseInt(b.slice(1), 16);
    const r = Math.round((n1 >> 16 & 255) + ((n2 >> 16 & 255) - (n1 >> 16 & 255)) * k);
    const g = Math.round((n1 >> 8 & 255) + ((n2 >> 8 & 255) - (n1 >> 8 & 255)) * k);
    const bl = Math.round((n1 & 255) + ((n2 & 255) - (n1 & 255)) * k);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  function drawWorld(c) {
    const z = zoom();
    // đường ray
    drawRailsWorld(c);

    // thị trấn ở ga
    if (R.station) drawStation(c);

    // vết máu in xuống nền
    for (const d of R.decals) A.stampBlood(c, d.x, d.y, d.r, d.seed);

    // đoàn tàu
    drawTrain(c);

    // xác
    for (const co of R.corpses) {
      const k = co.t < co.life ? 1 : 1 - (co.t - co.life) / co.fade;
      if (k <= 0) continue;
      if (!A.drawActor(c, 'foe.' + co.art, { x: co.x, y: co.y, row: co.row, col: 1,
                                             foe: true, alpha: k * 0.9, rot: 0.42,
                                             squash: { x: 1.06, y: 0.86 }, scale: co.scale })) {
        c.globalAlpha = k * 0.7; c.fillStyle = '#3a2a24';
        c.beginPath(); c.ellipse(co.x, co.y, 14, 7, 0, 0, TAU); c.fill(); c.globalAlpha = 1;
      }
    }

    // đồ rơi
    for (const l of R.loots) drawLoot(c, l);
    for (const d of R.drops) drawDrop(c, d);

    // vũng lửa, kẽm gai, vách
    for (const f of (R.fires || [])) {
      c.save(); c.globalCompositeOperation = 'lighter';
      c.fillStyle = 'rgba(255,120,40,0.24)';
      c.beginPath(); c.arc(f.x, f.y, f.r, 0, TAU); c.fill();
      c.restore();
    }
    for (const w of (R.wires || [])) {
      c.strokeStyle = '#8a8f96'; c.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        c.beginPath(); c.arc(w.x, w.y, w.r * (0.5 + i * 0.25), 0, TAU); c.stroke();
      }
    }
    for (const w of R.walls) drawWall(c, w);

    // hạt lớp thường + hiệu ứng lớp tối
    FX.drawParts(c, false);
    FX.drawVfx(c, 'toi');

    // chó
    for (const d of R.dogs) {
      c.fillStyle = '#6b5a44';
      c.beginPath(); c.ellipse(d.x, d.y, 11, 7, 0, 0, TAU); c.fill();
      c.fillStyle = '#8a7458';
      c.beginPath(); c.arc(d.x + 7, d.y - 3, 5, 0, TAU); c.fill();
    }

    // quái
    const order = R.foes.slice().sort((a, b) => a.y - b.y);
    for (const f of order) drawFoe(c, f);

    // đạn
    for (const b of R.bullets) {
      c.strokeStyle = b.mine ? 'rgba(255,236,190,0.95)' : 'rgba(255,150,120,0.95)';
      c.lineWidth = b.mine ? 2.4 : 2;
      c.beginPath();
      c.moveTo(b.x, b.y);
      c.lineTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012);
      c.stroke();
    }

    // người chơi
    drawFirebox(c);
    drawPlayer(c);
    drawActPrompt(c);

    // vòng báo sét
    if (R.pendingBolt) {
      const b = R.pendingBolt;
      const k = 1 - b.t / CT.STORM.warnSec;
      c.strokeStyle = 'rgba(200,225,255,' + (0.35 + k * 0.5).toFixed(2) + ')';
      c.lineWidth = 3;
      c.beginPath(); c.arc(b.x, b.y, 60 * (1 - k * 0.6), 0, TAU); c.stroke();
      c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1;
      c.beginPath(); c.arc(b.x, b.y, 60 * (1 - k * 0.6) + 2, 0, TAU); c.stroke();
    }

    FX.drawPops(c);
  }

  function drawRailsWorld(c) {
    const z = zoom();
    const left = cam.x - 40, right = cam.x + viewW / z + 40;
    const y = GROUND_Y - 30;
    const half = 26;
    c.fillStyle = '#4a3c2c';
    c.fillRect(left, y - half - 9, right - left, half * 2 + 18);
    c.fillStyle = '#3a2c1e';
    const gap = 34;
    let x0 = Math.floor(left / gap) * gap;
    for (let x = x0; x < right; x += gap) c.fillRect(x, y - half - 3, 11, half * 2 + 6);
    c.fillStyle = '#4a4038';
    c.fillRect(left, y - half, right - left, 5);
    c.fillRect(left, y + half - 5, right - left, 5);
    c.fillStyle = 'rgba(180,190,200,0.4)';
    c.fillRect(left, y - half, right - left, 1.5);
    c.fillRect(left, y + half - 5, right - left, 1.5);
  }

  // Quầy hàng: một cái sạp bạt, một ngọn đèn, và một vòng sáng dưới chân để người chơi
  // thấy PHẢI ĐỨNG ĐÂU. Vòng sáng đúng bằng bán kính tương tác thật, không lớn hơn —
  // một vòng sáng nói dối còn tệ hơn không có vòng nào.
  function drawShop(c) {
    const sp = R.station.shop;
    const near = nearShop();
    // vòng đứng
    c.save();
    c.strokeStyle = near ? 'rgba(255,208,106,0.85)' : 'rgba(255,208,106,0.30)';
    c.lineWidth = near ? 2.4 : 1.5;
    c.setLineDash([7, 6]);
    c.lineDashOffset = -R.t * 22;
    c.beginPath(); c.ellipse(sp.x, sp.y + 12, sp.r, sp.r * 0.46, 0, 0, TAU); c.stroke();
    c.restore();
    // bóng
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.beginPath(); c.ellipse(sp.x, sp.y + 14, 44, 12, 0, 0, TAU); c.fill();
    // sạp
    c.fillStyle = '#4a3524'; c.fillRect(sp.x - 40, sp.y - 16, 80, 28);
    c.fillStyle = '#6b4d2e'; c.fillRect(sp.x - 37, sp.y - 13, 74, 10);
    // cọc và mái bạt sọc
    c.fillStyle = '#2f2418';
    c.fillRect(sp.x - 42, sp.y - 54, 5, 40); c.fillRect(sp.x + 37, sp.y - 54, 5, 40);
    for (let i = 0; i < 6; i++) {
      c.fillStyle = i % 2 ? '#b8452e' : '#e0d8c0';
      c.fillRect(sp.x - 46 + i * 15.5, sp.y - 60, 15.5, 12);
    }
    // hàng bày trên sạp
    c.fillStyle = '#c9a13a'; c.fillRect(sp.x - 26, sp.y - 22, 10, 8);
    c.fillStyle = '#8a9098'; c.fillRect(sp.x - 6,  sp.y - 21, 12, 7);
    c.fillStyle = '#7a5a3a'; c.fillRect(sp.x + 14, sp.y - 23, 11, 9);
    // đèn bão: ban đêm đây là cái mốc sáng dẫn người chơi về
    const gl = 0.55 + FX.fireGlow(R.t + sp.seed) * 0.5;
    c.fillStyle = '#2a2018'; c.fillRect(sp.x + 30, sp.y - 46, 7, 10);
    c.save();
    c.globalCompositeOperation = 'lighter';
    const gr = c.createRadialGradient(sp.x + 33, sp.y - 41, 0, sp.x + 33, sp.y - 41, 44);
    gr.addColorStop(0, 'rgba(255,206,120,' + (0.55 * gl).toFixed(3) + ')');
    gr.addColorStop(1, 'rgba(255,150,40,0)');
    c.fillStyle = gr;
    c.beginPath(); c.arc(sp.x + 33, sp.y - 41, 44, 0, TAU); c.fill();
    c.restore();
    // Biển hàng, có tấm nền tối phía sau. Ban đêm mọi thứ bị lớp nhân tối đè xuống, và
    // một dòng chữ không nền thì chìm mất đúng lúc người chơi cần nó nhất.
    c.save();
    c.font = 'bold 13px system-ui, sans-serif';
    c.textAlign = 'center';
    const sw = c.measureText('QUẦY HÀNG').width + 18;
    c.fillStyle = 'rgba(12,10,8,0.72)';
    c.fillRect(sp.x - sw / 2, sp.y - 78, sw, 18);
    c.fillStyle = near ? '#ffd06a' : '#c9bda4';
    c.fillText('QUẦY HÀNG', sp.x, sp.y - 65);
    c.restore();
    c.textAlign = 'left';
  }

  // Còn bao nhiêu giây nữa tàu đỗ. Trả null nếu chưa tới lúc cần báo.
  //
  // Đây là thứ THAY THẾ cho ý định ban đầu là dựng một cái tháp nước ở chỗ tàu sẽ đỗ để
  // người chơi nhìn thấy ga lớn dần lên. Ý đó không dùng được: khung hình đặt mũi tàu ở
  // 76% bề ngang, nên chỉ còn 223 đơn vị thế giới nằm trước mũi — ở 168 đơn vị mỗi giây
  // thì đó là 1,3 giây đường ray. Mọi cột mốc đặt ở chỗ tàu SẼ đỗ đều nằm ngoài khung
  // cho tới đúng lúc nó đã tới nơi. Nên tín hiệu phải nằm TRÊN MÀN HÌNH, không nằm
  // trong thế giới.
  G.arriveIn = function () {
    if (!R || R.phase !== 'chay') return null;
    const left = CT.LEG.runSec - R.phaseT;
    return (left <= CT.LEG.seeAheadSec && left >= 0) ? left : null;
  };

  function drawStation(c) {
    const st = R.station;
    for (const p of st.props) {
      const k = 'deco.' + p.k;
      if (!A.drawStrip(c, k, p.x, p.y, { scale: p.k.startsWith('rock') ? 2.6 : 1 })) {
        c.fillStyle = '#4a3a28';
        c.fillRect(p.x - 4, p.y - 10, 8, 10);
      }
    }
    for (const h of st.houses) {
      // nhà: một hình hộp gỗ nhìn 3/4, có cửa. Sau này thay bằng sprite thì đổi đúng
      // chỗ này, không đụng luật chơi.
      c.fillStyle = '#2a1e14';
      c.fillRect(h.x - h.w / 2, h.y - h.h / 2 + 8, h.w, h.h);
      c.fillStyle = h.looted ? '#4a3826' : '#6b4d2e';
      c.fillRect(h.x - h.w / 2 + 3, h.y - h.h / 2 + 11, h.w - 6, h.h - 6);
      c.fillStyle = '#3d2c1c';
      c.fillRect(h.x - h.w / 2, h.y - h.h / 2, h.w, 14);
      c.fillStyle = '#241a12';
      c.fillRect(h.x - 11, h.y + h.h / 2 - 20, 22, 20);
      if (h.locked && !h.looted) {
        c.fillStyle = '#c9a13a';
        c.fillRect(h.x - 4, h.y + h.h / 2 - 12, 8, 6);
      }
      // cửa sổ sáng ban đêm
      if (R.isNight && !h.looted) {
        c.fillStyle = 'rgba(255,207,122,0.75)';
        c.fillRect(h.x - h.w / 2 + 14, h.y - 6, 16, 14);
        c.fillRect(h.x + h.w / 2 - 30, h.y - 6, 16, 14);
      }
    }
    if (st.shop) drawShop(c);
  }

  function drawTrain(c) {
    // toa trước, đầu máy sau — đầu máy vẽ đè lên toa liền kề ở chỗ nối
    for (let i = R.cars.length - 1; i >= 0; i--) {
      const cr = R.cars[i];
      const x = carX(i);
      TA.drawCar(c, x, DECK_BOT, cr, { dist: R.dist, spd: R.spd, hurt: cr.hurt,
                                       turretAng: cr.turretAng,
                                       fireGlow: FX.fireGlow(R.t) });
      TA.drawCarHp(c, x, DECK_BOT, TA.CAR_W, cr.hp, cr.hpMax);
    }
    TA.drawLoco(c, locoX(), DECK_BOT, {
      dist: R.dist, spd: R.spd, night: R.isNight,
      fireGlow: R.fuel > 0 ? FX.fireGlow(R.t) : 0
    });
    // thanh nhiên liệu ngay trên đầu máy — người chơi phải đọc được nó mà không rời mắt
    const fx0 = locoX() + 30, fw = TA.LOCO_W - 60;
    const k = R.fuel / CT.FUEL.tank;
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.fillRect(fx0 - 1, DECK_BOT - TA.DECK_H - 17, fw + 2, 7);
    c.fillStyle = k > 0.35 ? '#d8963a' : k > 0.15 ? '#c4642a' : '#a8321f';
    c.fillRect(fx0, DECK_BOT - TA.DECK_H - 16, fw * k, 5);
  }

  function drawFoe(c, f) {
    const def = f.def;
    const key = 'foe.' + def.art;
    const ok = A.drawActor(c, key, {
      x: f.x, y: f.y, dist: f.dist, dirX: f.dirX, dirY: f.dirY,
      foe: true, rim: true, flash: f.flash, scale: def.scale || 1,
      alpha: f.sleep ? 0.72 : 1
    });
    if (!ok) {
      c.fillStyle = f.flash > 0.2 ? '#ffffff' : '#7a3a30';
      c.beginPath(); c.arc(f.x, f.y - f.r, f.r, 0, TAU); c.fill();
    }
    // đang ngủ: một dấu hiệu nhỏ, đủ để người chơi biết mình còn được lén
    if (f.sleep) {
      c.fillStyle = 'rgba(200,210,230,0.5)';
      c.font = '12px system-ui'; c.textAlign = 'center';
      c.fillText('z', f.x + 10, f.y - f.r * 2 - 6);
    }
    // choáng: HAI ngôi sao và một quầng cam đặc. Cam nằm đúng trục màu an toàn với
    // người mù màu — đỏ-lục hỏng với khoảng bảy phần trăm nam giới, cam-lam thì không.
    if (f.stun > 0) {
      const a = R.t * 8.4;
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = 'rgba(255,150,40,0.30)';
      c.beginPath(); c.arc(f.x, f.y - f.r * 2 - 6, 15, 0, TAU); c.fill();
      c.restore();
      c.fillStyle = '#ffd06a';
      for (let i = 0; i < 2; i++) {
        const ang = a + i * Math.PI;
        star(c, f.x + Math.cos(ang) * 12, f.y - f.r * 2 - 6 + Math.sin(ang) * 4, 4);
      }
    }
    // vòng báo trước cú lao. Sàn của một cú báo là khoảng 286 mili giây — bằng thời
    // gian phản xạ thị giác cộng thời gian nhấc chân. Ở đây rộng hơn nhiều vì người
    // chơi còn phải chọn né bên nào.
    if (f.rk === 'wind') {
      const k = 1 - f.rt / def.dash.wind;
      const len = 320;
      c.save();
      // nét tối bên dưới để đạt tương phản đọc được trên cả nền sáng lẫn nền tối
      c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 5;
      c.beginPath(); c.moveTo(f.x, f.y); c.lineTo(f.x + f.rax * len, f.y + f.ray * len); c.stroke();
      c.strokeStyle = 'rgba(255,160,60,' + (0.30 + k * 0.5).toFixed(2) + ')';
      c.lineWidth = 3;
      c.beginPath(); c.moveTo(f.x, f.y); c.lineTo(f.x + f.rax * len, f.y + f.ray * len); c.stroke();
      c.restore();
    }
    // thanh máu chỉ hiện khi đã ăn đòn
    if (f.hp < f.hpMax) {
      const bw = f.r * 2.4;
      c.fillStyle = 'rgba(0,0,0,0.6)';
      c.fillRect(f.x - bw / 2 - 1, f.y - f.r * 2 - 15, bw + 2, 5);
      c.fillStyle = '#c0392b';
      c.fillRect(f.x - bw / 2, f.y - f.r * 2 - 14, bw * (f.hp / f.hpMax), 3);
    }
  }
  function star(c, x, y, r) {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const rr = i % 2 ? r * 0.45 : r;
      i ? c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
        : c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath(); c.fill();
  }

  function drawPlayer(c) {
    const p = R.p;
    // bóng ma của Bà Rosa — chỉ sẵn chỗ sẽ quay về
    if (R.sk.rewind && p.ghost.length) {
      const g = p.ghost[0];
      c.globalAlpha = 0.28;
      A.drawActor(c, 'man.' + R.cd.art, { x: g.x, y: g.y, col: 1, row: 0, alpha: 0.28 });
      c.globalAlpha = 1;
    }
    // vũng khói của kẻ trộm
    if (p.blinkAt) {
      c.save(); c.globalAlpha = 0.4; c.fillStyle = '#5a6470';
      c.beginPath(); c.arc(p.blinkAt.x, p.blinkAt.y, 30, 0, TAU); c.fill(); c.restore();
    }
    const alpha = p.invis > 0 ? 0.35 : 1;
    const ok = A.drawActor(c, 'man.' + R.cd.art, {
      x: p.x, y: p.y, dist: p.dist, dirX: p.dirX || Math.cos(p.aim), dirY: p.dirY || Math.sin(p.aim),
      flash: p.flash, alpha
    });
    if (!ok) {
      c.globalAlpha = alpha;
      c.fillStyle = p.flash > 0.2 ? '#fff' : '#d8c9a8';
      c.beginPath(); c.arc(p.x, p.y - 10, 10, 0, TAU); c.fill();
      c.globalAlpha = 1;
    }
    // vạch ngắm ngắn — nói hướng súng đang chỉ mà không che mất cảnh
    c.strokeStyle = 'rgba(150,200,255,0.5)';
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(p.x + Math.cos(p.aim) * 16, p.y + Math.sin(p.aim) * 16);
    c.lineTo(p.x + Math.cos(p.aim) * 30, p.y + Math.sin(p.aim) * 30);
    c.stroke();
    // cửa sổ chặn đang mở
    if (p.parry > 0) {
      c.strokeStyle = 'rgba(140,200,255,0.9)'; c.lineWidth = 3;
      c.beginPath(); c.arc(p.x, p.y - 8, 22, p.aim - 0.9, p.aim + 0.9); c.stroke();
    }

    // CÁI XÁC ĐANG VÁC. Vẽ vắt ngang vai, hơi nhô lên trên đầu: nhìn một cái là biết
    // tay đang bận, không cần đọc chữ.
    if (p.carry && p.carry.kind === 'corpse') {
      const sw = Math.sin(R.t * 6 + p.dist * 0.02) * 2;
      c.save();
      c.translate(p.x, p.y - 26 + sw);
      c.rotate(-0.18);
      if (!A.drawActor(c, 'foe.' + p.carry.art, { x: 0, y: 0, row: 0, col: 1, foe: true,
                                                  alpha: 0.95, rot: 1.5,
                                                  scale: (p.carry.scale || 1) * 0.82 })) {
        c.fillStyle = '#4a3428';
        c.fillRect(-19, -5, 38, 10);
        c.fillStyle = '#5e4436';
        c.beginPath(); c.arc(-19, 0, 6, 0, TAU); c.fill();
      }
      c.restore();
      if (p.carry.bounty > 0) {
        c.fillStyle = '#ffd06a';
        c.font = 'bold 11px system-ui, sans-serif';
        c.textAlign = 'center';
        c.fillText(CT.money(p.carry.bounty), p.x, p.y - 44);
        c.textAlign = 'left';
      }
    }
  }

  // ---------------------------------------------------------------------------
  // DẤU NHẮC TƯƠNG TÁC
  // ---------------------------------------------------------------------------
  // Cùng một hàm actTarget() vừa quyết định nút ⓐ làm gì, vừa quyết định vẽ dấu nhắc ở
  // đâu. Một nguồn sự thật: không bao giờ có chuyện chữ nói một đằng nút làm một nẻo.
  function drawActPrompt(c) {
    const t = actTarget();
    if (!t) return;
    let x = R.p.x, y = R.p.y - 52;
    if (t.kind === 'loot' || t.kind === 'drop' || t.kind === 'corpse') { x = t.it.x; y = t.it.y - 30; }
    else if (t.kind === 'shop') { x = R.station.shop.x; y = R.station.shop.y - 80; }
    else if (t.kind === 'shovel' || t.kind === 'fire' || t.kind === 'burn-carry') {
      x = fireboxX(); y = deckMidY() - TA.DECK_H * 0.62;
    }
    const bob = Math.sin(R.t * 4.2) * 2;
    c.save();
    c.font = 'bold 12px system-ui, sans-serif';
    c.textAlign = 'center';
    const w = c.measureText(t.label).width + 26;
    c.fillStyle = 'rgba(14,12,10,0.78)';
    c.fillRect(x - w / 2, y - 12 + bob, w, 20);
    c.fillStyle = '#ffd06a';
    c.fillRect(x - w / 2, y - 12 + bob, 2.5, 20);
    c.fillStyle = '#f0e4c8';
    c.fillText('ⓐ  ' + t.label, x, y + 2 + bob);
    c.restore();
    c.textAlign = 'left';
  }

  // Vòng đứng ở cửa lò — cùng bán kính thật với nearFirebox(), không rộng hơn.
  function drawFirebox(c) {
    const fx = fireboxX(), fy = deckMidY();
    const near = nearFirebox();
    c.save();
    c.strokeStyle = near ? 'rgba(255,150,60,0.9)' : 'rgba(255,150,60,0.26)';
    c.lineWidth = near ? 2.2 : 1.4;
    c.setLineDash([6, 6]);
    c.lineDashOffset = R.t * 18;
    c.beginPath(); c.ellipse(fx, fy + 12, FIRE_R, FIRE_R * 0.42, 0, 0, TAU); c.stroke();
    c.restore();
  }

  function drawWall(c, w) {
    c.save();
    c.translate(w.x, w.y); c.rotate(w.ang || 0);
    const k = w.hp / w.hpMax;
    c.fillStyle = '#3a4048';
    c.fillRect(-w.r, -7, w.r * 2, 14);
    c.fillStyle = '#5c6672';
    c.fillRect(-w.r, -7, w.r * 2, 4);
    c.fillStyle = 'rgba(120,190,255,' + (0.18 * k).toFixed(2) + ')';
    c.fillRect(-w.r, -9, w.r * 2, 18);
    c.restore();
  }

  function drawLoot(c, l) {
    const key = l.size.id === 'nho' ? 'item.small' : l.size.id === 'vua' ? 'item.mid' : 'item.big';
    const f = Math.floor(Math.abs(l.bob * 997)) % 8;
    const bob = Math.sin(R.t * 2.4 + l.bob * 9) * 2;
    if (!A.drawStrip(c, key, l.x, l.y + bob, { frame: f, scale: 0.42 })) {
      c.fillStyle = l.mat.ramp[1];
      c.beginPath(); c.arc(l.x, l.y + bob, l.r, 0, TAU); c.fill();
    }
    // vòng chất liệu — màu nói giá, và nó nằm ở VIỀN chứ không phủ lên hình
    c.strokeStyle = l.mat.ramp[1]; c.lineWidth = 2;
    c.beginPath(); c.arc(l.x, l.y + bob, l.r + 3, 0, TAU); c.stroke();
  }

  function drawDrop(c, d) {
    const bob = Math.sin(R.t * 3 + d.bob * 9) * 2;
    if (d.kind === 'coal') A.coal(c, d.x, d.y + bob, 8);
    else if (d.kind === 'ammo') {
      c.fillStyle = '#9aa4b0'; c.fillRect(d.x - 7, d.y - 5 + bob, 14, 10);
      c.fillStyle = '#c8a03c'; c.fillRect(d.x - 5, d.y - 3 + bob, 3, 6);
      c.fillRect(d.x, d.y - 3 + bob, 3, 6);
    } else {
      c.fillStyle = '#7d848c';
      c.beginPath(); c.arc(d.x, d.y + bob, 7, 0, TAU); c.fill();
      c.fillStyle = '#aab2ba';
      c.beginPath(); c.arc(d.x - 2, d.y - 2 + bob, 3, 0, TAU); c.fill();
    }
  }

  // Gom nguồn sáng của khung này. Toạ độ đổi sang MÀN HÌNH vì lớp tối vẽ ở hệ màn hình.
  function collectLights(z, sh) {
    const toS = (x, y) => ({
      x: (x - cam.x) * z + sh.x,
      y: (y - cam.y) * z + sh.y
    });
    const L = CT.LIGHT;
    // đèn pha đầu máy
    const hp = toS(R.dist - 8, deckMidY());
    FX.light({ x: hp.x, y: hp.y, r: L.head.r * z, half: L.head.half, a: 0,
               warm: L.head.warm, power: L.head.power, core: 0.3 });
    // đèn treo mỗi toa
    R.cars.forEach((cr, i) => {
      const q = toS(carX(i) + TA.CAR_W * 0.5, deckMidY());
      const fl = 1 + Math.sin(R.t * TAU * L.lamp.flickHz + i) * L.lamp.flickAmp;
      FX.light({ x: q.x, y: q.y, r: L.lamp.r * z, warm: L.lamp.warm,
                 power: L.lamp.power * fl, core: L.lamp.core });
    });
    // lò lửa
    if (R.fuel > 0) {
      const q = toS(R.dist - TA.LOCO_W + 96, deckMidY());
      const g = FX.fireGlow(R.t);
      FX.light({ x: q.x, y: q.y, r: L.fire.r * z * (0.85 + g * 0.3),
                 warm: L.fire.warm, power: L.fire.power * g, core: 0.5 });
    }
    // đèn người chơi
    const pp = toS(R.p.x, R.p.y - 8);
    FX.light({ x: pp.x, y: pp.y, r: L.hand.coneR * z, half: L.hand.half, a: R.p.aim,
               warm: L.hand.warm, power: L.hand.power, core: L.hand.core,
               r2: L.hand.r * z });
    // vũng lửa
    for (const f of (R.fires || [])) {
      const q = toS(f.x, f.y);
      FX.light({ x: q.x, y: q.y, r: f.r * 2.2 * z, warm: '#ff8a3c', power: 0.8 });
    }
    // cửa sổ nhà
    if (R.station) for (const h of R.station.houses) {
      if (h.looted) continue;
      const q = toS(h.x, h.y);
      FX.light({ x: q.x, y: q.y, r: L.win.r * z, warm: L.win.warm, power: L.win.power });
    }
  }

  G.reset = function () { R = null; FX.reset(); };

})(window);
