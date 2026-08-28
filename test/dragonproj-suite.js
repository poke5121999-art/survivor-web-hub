/*
 * Bộ kiểm thử cho games/dragonproj (Săn Rồng).
 * Chạy: node test/dragonproj-suite.js
 *
 * Nguyên tắc: mọi thao tác chiến đấu đều đi qua PointerEvent thật trên canvas,
 * tức là qua đúng js/punicon.js mà ngón tay người chơi đi qua. Nếu ngưỡng
 * tap/flick/hold sai thì test đỏ, chứ không phải "gọi hàm nội bộ nên vẫn xanh".
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const root = 'file:///' + path.resolve(__dirname, '..').split(path.sep).join('/');
const URL = root + '/games/dragonproj/index.html';

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  if (ok) { pass++; results.push('  ✔ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; results.push('  ✘ ' + name + (detail ? '  — ' + detail : '')); }
}

async function open(b) {
  const ctx = await b.newContext({ viewport: { width: 430, height: 860 }, isMobile: true,
    hasTouch: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await p.goto(URL);
  await p.waitForTimeout(900);
  return { ctx, p, errs };
}

// Bắn cử chỉ Punicon từ trong trang, dùng đúng helper của bot.
const G = {
  tap:   (p, x, y) => p.evaluate(([x, y]) => DPBot._tap(x, y), [x, y]),
  flick: (p, x, y, dx, dy) => p.evaluate(([x, y, dx, dy]) => DPBot._flick(x, y, dx, dy), [x, y, dx, dy]),
  hold:  (p, ms, ax, ay) => p.evaluate(([ms, ax, ay]) => DPBot._hold(270, 640, ms, ax, ay), [ms, ax, ay]),
  drag:  (p, dx, dy, ms) => p.evaluate(([dx, dy, ms]) => DPBot._drag(dx, dy, ms), [dx, dy, ms])
};

// Vào ải. goBoss nhảy thẳng sang chặng Behemoth để khỏi phải dọn quái trước.
const goStage = (p, id) => p.evaluate(id => DP.UI.startStage(id), id);
const goBoss = (p, id) => p.evaluate(id => { DP.UI.startStage(id); DP.UI.battle.startBossPhase(); }, id);

(async () => {
  const b = await chromium.launch();
  const { ctx, p, errs } = await open(b);

  // ---------------------------------------------------------------- DỮ LIỆU
  results.push('\n── dữ liệu ──');
  const d = await p.evaluate(() => ({
    weapons: Object.keys(DP.WEAPONS).length,
    behemoths: DP.BEHEMOTHS.length,
    magi: DP.MAGI.length,
    areas: DP.AREAS.length,
    story: DP.STORY.length,
    mats: Object.keys(DP.MATERIALS).length,
    bossRates: DP.BEHEMOTH_RATES,
    magiRates: DP.MAGI_RATES,
    dropNormal: DP.DROP_NORMAL,
    elem: [DP.elemMult('water', 'fire'), DP.elemMult('fire', 'water'), DP.elemMult('fire', 'earth')]
  }));
  check('5 loại vũ khí', d.weapons === 5, d.weapons + '');
  check('đủ Behemoth (>=50)', d.behemoths >= 50, d.behemoths + ' con');
  check('đủ Magi (>=60)', d.magi >= 60, d.magi + ' viên');
  check('8 vùng đất', d.areas === 8, d.areas + '');
  check('cốt truyện >=30 chặng', d.story >= 30, d.story + '');
  check('tỉ lệ gacha boss đúng wiki (3/15/55/27)',
    d.bossRates.SS === 0.03 && d.bossRates.S === 0.15 && d.bossRates.A === 0.55 && d.bossRates.B === 0.27);
  check('tỉ lệ gacha magi đúng wiki (3/9/48/40)',
    d.magiRates.SS === 0.03 && d.magiRates.S === 0.09 && d.magiRates.A === 0.48 && d.magiRates.B === 0.40);
  check('tỉ lệ rơi đồ quái thường đúng wiki (D 24.95%)', d.dropNormal.D === 0.2495);
  check('vòng khắc chế Thủy>Hỏa>Thổ>Lôi', d.elem[0] === 1.5 && d.elem[1] === 0.6 && d.elem[2] === 1.5,
    JSON.stringify(d.elem));

  // --------------------------------------------------------- THANG CHỈ SỐ
  results.push('\n── thang chỉ số khớp số thật của wiki ──');
  const st = await p.evaluate(() => {
    // Cocytus Amarok (SS) trong wiki: vũ khí 306 phys / 656 elem ở max, evolve bậc 3.
    const g = DP.forgeGear('amarok', 'weapon', 't');
    g.lv = 40; g.evo = 2;
    const a = DP.gearStats(g);
    g.evo = 0; const b0 = DP.gearStats(g);
    g.evo = 1; const b1 = DP.gearStats(g);
    // giáp
    const h = DP.forgeGear('amarok', 'head', 't'); h.lv = 40;
    return { max: a, evo0: b0, evo1: b1, head: DP.gearStats(h) };
  });
  check('vũ khí SS evolve cuối = 306 phys / 656 elem', st.max.patk === 306 && st.max.eatk === 656,
    st.max.patk + '/' + st.max.eatk);
  check('bậc evolve 1 ≈ 135/291 như wiki', Math.abs(st.evo0.patk - 135) <= 2 && Math.abs(st.evo0.eatk - 291) <= 3,
    st.evo0.patk + '/' + st.evo0.eatk);
  check('bậc evolve 2 ≈ 274/587 như wiki', Math.abs(st.evo1.patk - 274) <= 1 && Math.abs(st.evo1.eatk - 587) <= 1,
    st.evo1.patk + '/' + st.evo1.eatk);
  check('giáp đầu SS = 252 HP như wiki', st.head.hp === 252, st.head.hp + '');

  // -------------------------------------------------- LUẬT LIMIT BREAK / Ô
  results.push('\n── luật trang bị ──');
  const lb = await p.evaluate(() => {
    const g = DP.forgeGear('amarok', 'weapon', 't');
    const a = DP.gearSlots(g); g.lb = 3; const b = DP.gearSlots(g); g.lb = 4; const c = DP.gearSlots(g);
    const h = DP.forgeGear('amarok', 'head', 't'); const h1 = DP.gearSlots(h); h.lb = 4; const h2 = DP.gearSlots(h);
    return { w2: a, w3: b, w4: c, h1, h2 };
  });
  check('vũ khí 2 ô, limit break 4 mới mở ô thứ 3', lb.w2 === 2 && lb.w3 === 2 && lb.w4 === 3,
    lb.w2 + '/' + lb.w3 + '/' + lb.w4);
  check('giáp Gold 1 ô, limit break 4 mở ô thứ 2', lb.h1 === 1 && lb.h2 === 2);

  const shape = await p.evaluate(() => {
    const s = DP.starterKit(DP.newSave('T'));
    const w = s.gear.find(g => g.kind === 'weapon');
    const wrong = s.magi.find(m => DP.magiById(m.id).shape !== w.shapes[0]);
    return DP.equipMagi(s, w, 0, wrong ? wrong.uid : null);
  });
  check('Magi sai hình dạng bị từ chối', shape.ok === false, shape.why || '');

  // --------------------------------------------------------- PUNICON THẬT
  results.push('\n── Punicon (cử chỉ thật trên canvas) ──');
  await goStage(p, 'tior-1');
  await p.waitForTimeout(500);
  check('vào được ải', await p.evaluate(() => !!(DP.UI.battle && DP.UI.battle.running)));
  check('ải mở ra ở chặng quái thường', await p.evaluate(() => DP.UI.battle.phase === 'mobs'));

  // KÉO -> di chuyển
  const before = await p.evaluate(() => ({ x: DP.UI.battle.player.x, y: DP.UI.battle.player.y }));
  await G.drag(p, 0, -1, 500);
  await p.waitForTimeout(650);
  const after = await p.evaluate(() => ({ x: DP.UI.battle.player.x, y: DP.UI.battle.player.y }));
  check('KÉO làm nhân vật di chuyển', Math.hypot(after.x - before.x, after.y - before.y) > 25,
    'đi được ' + Math.round(Math.hypot(after.x - before.x, after.y - before.y)) + 'px');

  // CHẠM -> đánh
  await p.evaluate(() => { DP.UI.battle.player.state = 'idle'; DP.UI.battle.player.combo = 0; });
  await G.tap(p, 270, 640);
  await p.waitForTimeout(120);
  check('CHẠM ra đòn đánh', await p.evaluate(() => DP.UI.battle.player.state === 'attack'));

  // BẤM LIÊN TỤC -> nối combo
  await p.waitForTimeout(350);
  for (let i = 0; i < 3; i++) { await G.tap(p, 270, 640); await p.waitForTimeout(300); }
  check('BẤM LIÊN TỤC nối được combo', await p.evaluate(() => DP.UI.battle.player.combo >= 3),
    'combo = ' + await p.evaluate(() => DP.UI.battle.player.combo));

  // HƯỚNG NHÌN — luật của White Cat: đứng yên thì tự quay về địch gần nhất, còn
  // đang chạy thì đòn bay theo hướng đi. Không có luật này thì "chạm chỗ nào cũng
  // được" là nói dối: người chơi phải vừa chỉ hướng vừa bấm.
  await p.waitForTimeout(400);
  const aim = await p.evaluate(async () => {
    const b = DP.UI.battle, pl = b.player;
    b.mobs.forEach(m => { m.dead = true; m.hp = 0; });
    const m = b.makeMob('purun', 1, false, false);
    m.x = pl.x - 70; m.y = pl.y;            // đặt con quái ở NGAY SAU lưng
    b.mobs.push(m);
    pl.state = 'idle'; pl.moving = false; pl.counterUntil = 0;
    pl.facing = 0;                          // đang quay mặt ngược hướng con quái
    const want = Math.atan2(m.y - pl.y, m.x - pl.x);

    // 1) đứng yên -> phải tự quay về phía con quái
    b.faceTarget();
    const still = Math.abs(Math.atan2(Math.sin(pl.facing - want), Math.cos(pl.facing - want)));

    // 2) đang chạy -> KHÔNG được tự ngắm, giữ nguyên hướng đi
    pl.facing = 0; pl.moving = true;
    b.faceTarget();
    const moving = pl.facing;

    // 3) ngoài tầm khoá thì cũng không quay
    pl.moving = false; pl.facing = 0;
    m.x = pl.x - 900; m.y = pl.y - 900;
    b.faceTarget();
    const far = pl.facing;

    m.dead = true; m.hp = 0;
    return { still, moving, far, want };
  });
  check('ĐỨNG YÊN: chạm là tự quay về phía địch gần nhất', aim.still < 0.05,
    'lệch ' + aim.still.toFixed(3) + ' rad');
  check('ĐANG CHẠY: không tự ngắm, đòn theo hướng đi', aim.moving === 0);
  check('địch quá xa thì không tự quay (không khoá qua cả sân)', aim.far === 0);

  // Và phải đi qua đúng đường CHẠM THẬT, không chỉ gọi hàm.
  await p.evaluate(() => {
    const b = DP.UI.battle, pl = b.player;
    b.mobs.forEach(m => { m.dead = true; m.hp = 0; });
    const m = b.makeMob('purun', 1, false, false);
    m.x = pl.x; m.y = pl.y - 60; b.mobs.push(m);   // con quái ở PHÍA TRÊN
    pl.state = 'idle'; pl.moving = false; pl.facing = Math.PI / 2;  // đang quay xuống dưới
    window.__mobHp = m.hp; window.__mob = m;
  });
  await G.tap(p, 270, 640);
  await p.waitForTimeout(220);
  const tapAim = await p.evaluate(() => {
    const pl = DP.UI.battle.player;
    return { facing: pl.facing, hurt: window.__mob.hp < window.__mobHp };
  });
  check('chạm thật (PointerEvent) cũng tự quay và đánh trúng con ở sau lưng',
    Math.abs(tapAim.facing + Math.PI / 2) < 0.05 && tapAim.hurt,
    'facing=' + tapAim.facing.toFixed(2) + ' trúng=' + tapAim.hurt);

  // VẨY -> né
  await p.waitForTimeout(500);
  await p.evaluate(() => { DP.UI.battle.player.state = 'idle'; DP.UI.battle.player.dodgeCd = 0; });
  await G.flick(p, 270, 640, 1, 0);
  await p.waitForTimeout(90);
  const dodged = await p.evaluate(() => ({ st: DP.UI.battle.player.state, ifr: DP.UI.battle.player.iframe }));
  check('VẨY ra đòn né', dodged.st === 'dodge', dodged.st);
  check('né có khung bất tử', dodged.ifr > 0, dodged.ifr + 'ms');

  // ĐÁNH KHI ĐANG LĂN (Rolling Attack — ngữ pháp Punicon của White Cat)
  await p.waitForTimeout(500);
  const roll = await p.evaluate(async () => {
    const b = DP.UI.battle, p2 = b.player;
    // counterUntil dọn sạch: đang thử Rolling Attack, không phải cửa sổ phản đòn
    // (quái trong ải có thể vừa đâm vào khung bất tử của cú né trước đó).
    p2.state = 'idle'; p2.dodgeCd = 0; p2.counterUntil = 0;
    b.tryDodge(1, 0);
    const before = b.fx.length;
    b.tryAttack();                       // chạm trong lúc đang lăn
    return { still: p2.state === 'dodge', rollHit: p2.rollHit, fx: b.fx.length > before };
  });
  check('CHẠM khi đang lăn ra đòn mà KHÔNG hủy cú lăn', roll.still && roll.rollHit, JSON.stringify(roll));

  // GIỮ -> đặc thù vũ khí (Kiếm & Khiên = đỡ)
  await p.waitForTimeout(600);
  await p.evaluate(() => { DP.UI.battle.player.state = 'idle'; });
  await G.hold(p, 700);
  await p.waitForTimeout(400);
  check('GIỮ vào thế đỡ (Kiếm & Khiên)', await p.evaluate(() => DP.UI.battle.player.state === 'guard'));
  await p.waitForTimeout(500);

  // GIỮ RỒI TRƯỢT VỀ HƯỚNG NÚT MAGI -> xả Magi
  const slide = await p.evaluate(async () => {
    const b = DP.UI.battle;
    b.player.state = 'idle'; b.player.magi = 100;
    const hs = b.puni.hotspots[0];
    // mô phỏng: gốc chạm ở giữa, kéo về hướng nút Magi 1
    b.puni.ox = 270; b.puni.oy = 640;
    const dx = hs.x - 270, dy = hs.y - 640, d = Math.hypot(dx, dy);
    const idx = b.puni.aimedHotspot(dx / d * 80, dy / d * 80, 80);
    const wrong = b.puni.aimedHotspot(-80, 0, 80);
    return { idx, wrong, hasMagi: !!(b.wp && b.wp.magi[0]) };
  });
  check('trượt ĐÚNG hướng nút Magi được nhận', slide.idx === 0, 'idx=' + slide.idx);
  check('trượt SAI hướng thì không nhận', slide.wrong === -1);

  const cast = await p.evaluate(() => {
    const b = DP.UI.battle;
    b.player.state = 'idle'; b.player.magi = 100;
    const m0 = b.player.magi;
    b.castMagi(0);
    return { used: b.player.magi < m0, flagged: b.player.usedMagi };
  });
  check('xả được Magi', cast.used && cast.flagged);

  // ------------------------------------------------------------ TRẬN BOSS
  results.push('\n── trận Behemoth ──');
  await goBoss(p, 'tior-1');
  await p.waitForTimeout(600);
  const bs = await p.evaluate(() => {
    const b = DP.UI.battle;
    return { on: !!b.boss, hp: b.boss.hp, parts: b.boss.parts.length, id: b.boss.def.id,
             weak: b.boss.parts.filter(x => x.weak).length, allies: b.allies.length,
             phase: b.phase, mobs: b.mobs.filter(m => !m.dead).length, revives: b.player.revives };
  });
  check('boss xuất hiện', bs.on && bs.hp > 0);
  check('đúng con trùm mà ải khai báo', bs.id === 'grouton', bs.id);
  check('boss có bộ phận phá được', bs.parts >= 2, bs.parts + ' bộ phận');
  check('boss có điểm yếu', bs.weak >= 1);
  check('vào ải MỘT MÌNH — không còn NPC đồng đội', bs.allies === 0);
  check('sang chặng boss thì quái thường bị dọn sạch', bs.phase === 'boss' && bs.mobs === 0,
    bs.mobs + ' con còn lại');
  check('một mình nên có sẵn lượt tự đứng dậy', bs.revives >= 1, bs.revives + ' lượt');

  // Đánh vào WEAK point phải nạp thanh gục mạnh hơn đánh vào chỗ thường
  const fat = await p.evaluate(() => {
    const b = DP.UI.battle, bo = b.boss;
    bo.wpOn = true; bo.fatigue = 0;
    const wpPart = bo.parts.find(x => x.weak);
    const wx = bo.x + Math.cos(wpPart.a + bo.facing) * wpPart.d;
    const wy = bo.y + Math.sin(wpPart.a + bo.facing) * wpPart.d;
    b.dealToBoss({ phys: 100, elem: 0, el: 'none' }, wx, wy, {});
    const fw = bo.fatigue;
    bo.fatigue = 0;
    b.dealToBoss({ phys: 100, elem: 0, el: 'none' }, bo.x + 400, bo.y + 400, {});
    return { weak: fw, normal: bo.fatigue };
  });
  check('đánh WEAK nạp thanh gục mạnh hơn hẳn', fat.weak > fat.normal * 3,
    fat.weak.toFixed(2) + ' vs ' + fat.normal.toFixed(2));

  // Thanh gục đầy -> boss nằm ra, ăn sát thương nhân lên
  const down = await p.evaluate(() => {
    const b = DP.UI.battle, bo = b.boss;
    bo.fatigue = DP.BAL.fatigueMax - 1; bo.wpOn = true;
    const wpPart = bo.parts.find(x => x.weak);
    const wx = bo.x + Math.cos(wpPart.a + bo.facing) * wpPart.d;
    const wy = bo.y + Math.sin(wpPart.a + bo.facing) * wpPart.d;
    b.dealToBoss({ phys: 10, elem: 0, el: 'none' }, wx, wy, {});
    const isDown = bo.down > 0;
    const hp0 = bo.hp;
    b.dealToBoss({ phys: 100, elem: 0, el: 'none' }, bo.x, bo.y, {});
    return { isDown, dealt: hp0 - bo.hp };
  });
  check('thanh gục đầy thì boss GỤC', down.isDown);
  check('boss đang gục ăn sát thương nhân lên', down.dealt > 100, Math.round(down.dealt) + ' từ base 100');

  // Phá bộ phận
  const part = await p.evaluate(() => {
    const b = DP.UI.battle, bo = b.boss;
    const pt = bo.parts[0];
    const px = bo.x + Math.cos(pt.a + bo.facing) * pt.d, py = bo.y + Math.sin(pt.a + bo.facing) * pt.d;
    for (let i = 0; i < 40 && !pt.broken; i++) b.dealToBoss({ phys: 500, elem: 0, el: 'none' }, px, py, {});
    return { broken: pt.broken, count: bo.partsBroken };
  });
  check('phá được bộ phận', part.broken && part.count >= 1);

  // Báo đỏ và né
  const tel = await p.evaluate(() => {
    const b = DP.UI.battle;
    b.boss.down = 0; b.boss.state = 'idle'; b.boss.cd = 0;
    b.bossAttack();
    const t = b.telegraphs.find(x => x.hostile);
    return { has: !!t, windup: t ? t.windup : 0, hitsPlayerBeforeWindup: t ? (t.t >= t.windup) : null };
  });
  check('boss báo trước bằng vùng đỏ', tel.has && tel.windup > 300, tel.windup + 'ms báo trước');

  // Hạ boss -> nhận Tablet + gem theo đúng 3 điều kiện của bản gốc
  const win = await p.evaluate(() => new Promise(res => {
    const b = DP.UI.battle;
    b.player.usedMagi = true; b.player.deaths = 0;
    const orig = b.cb.onFinish;      // giữ nguyên onFinish thật để save được ghi
    b.cb.onFinish = r => {
      // Chụp ví ngay TRƯỚC và NGAY SAU màn kết quả: gold/exp nhặt trong ải đã vào
      // túi từ lúc nhặt rương, nên màn kết quả chỉ được cộng đúng phần thưởng ải.
      const g0 = DP.UI.save.gold, e0 = DP.UI.save.exp, l0 = DP.UI.save.lv;
      orig(r);
      res(Object.assign({}, r, { goldAdded: DP.UI.save.gold - g0,
                                 lvUp: DP.UI.save.lv - l0, expAfter: DP.UI.save.exp, e0 }));
    };
    b.boss.hp = 1;
    b.dealToBoss({ phys: 99999, elem: 0, el: 'none' }, b.boss.x, b.boss.y, {});
  }));
  check('hạ boss trả về kết quả thắng', win.win === true);
  check('kết quả gắn với đúng ải vừa đánh', win.stage && win.stage.id === 'tior-1', win.stage && win.stage.id);
  check('lần đầu phá ải được đánh dấu', win.firstClear === true);
  check('thưởng gem theo 3 điều kiện + bonus (tối đa 4)', win.gems >= 1 && win.gems <= 4, win.gems + ' gem');
  check('có rơi nguyên liệu', (win.drops || []).length > 0, (win.drops || []).length + ' món');
  // Rương trong ải cộng thẳng vào túi lúc nhặt. Nếu màn kết quả cộng LẠI phần đó
  // thì mỗi ải in thêm tiền — thứ không ai để ý cho tới khi kinh tế vỡ.
  check('thưởng Gold của ải cộng đúng MỘT lần (không nhân đôi phần nhặt dọc đường)',
    win.goldAdded === win.gold, 'cộng ' + win.goldAdded + ', thưởng ải là ' + win.gold);
  await p.waitForTimeout(300);
  check('phá xong thì ải được ghi vào save', await p.evaluate(() => !!DP.UI.save.cleared['tior-1']));
  check('phá ải 1 thì ải 2 mở ra',
    await p.evaluate(() => DP.stageOpen(DP.UI.save, DP.stageById('tior-2'))));

  // ------------------------------------------------ TRANG BỊ & NÂNG CẤP
  results.push('\n── trang bị & meta ──');
  const forge = await p.evaluate(() => {
    const s = DP.starterKit(DP.newSave('T'));
    s.gold = 999999;
    const g = DP.forgeGear('amarok', 'weapon', 'x');
    s.gear.push(g);
    s.mats.str_stone = 999; s.mats.lapis_ss = 99; s.mats.crystal = 99;
    const lv0 = DP.gearStats(g).patk;
    for (let i = 0; i < 5; i++) DP.enhance(s, g);
    const lv5 = DP.gearStats(g).patk;
    const beforeLb = DP.gearStats(g).patk;
    DP.limitBreak(s, g);
    const afterLb = DP.gearStats(g).patk;
    return { grew: lv5 > lv0, lbGrew: afterLb > beforeLb, lb: g.lb };
  });
  check('nâng cấp làm tăng chỉ số', forge.grew);
  check('limit break làm tăng chỉ số', forge.lbGrew && forge.lb === 1);

  // Tiến hoá chỉ mở bằng Lõi Rồng, mà Lõi Rồng thì không cày được ở đâu.
  const core = await p.evaluate(() => {
    const s = DP.newSave('T'); s.gold = 9e6;
    const g = DP.forgeGear('amarok', 'weapon', 'e'); g.lv = DP.MAX_LV; s.gear.push(g);
    const noCore = DP.evolve(s, g);
    const cost = DP.evolveCost(g);
    s.mats.dragon_core = 999;
    const withCore = DP.evolve(s, g);
    // không một bảng rơi đồ nào được phép nhả ra Lõi Rồng
    const inTribes = Object.keys(DP.TRIBES).some(k => DP.TRIBES[k].mat.indexOf('dragon_core') >= 0);
    const inGather = DP.GATHER_MATS.indexOf('dragon_core') >= 0;
    const inShop = JSON.stringify(DP.SHOP || []).indexOf('dragon_core') >= 0;
    const inBoss = DP.BEHEMOTHS.some(b => JSON.stringify(b).indexOf('dragon_core') >= 0);
    return { noCore: noCore.ok, withCore: withCore.ok, needsCore: !!(cost.mat && cost.mat.dragon_core),
             farmable: inTribes || inGather || inShop || inBoss };
  });
  check('Tiến hoá đòi Lõi Rồng', core.needsCore);
  check('không có Lõi Rồng thì không Tiến hoá được', core.noCore === false);
  check('có Lõi Rồng thì Tiến hoá được', core.withCore === true);
  check('Lõi Rồng KHÔNG cày được: không nằm trong bảng rơi nào', core.farmable === false);

  const dupe = await p.evaluate(() => {
    const s = DP.newSave('T');
    const a = DP.summonGear(s, 1, true);              // ép ra SS, chắc chắn là món mới
    const before = s.mats.dragon_core || 0;
    // quay lại đúng món đó: ép hasGear đúng nên lần hai phải ra Lõi
    const rank = a[0].rank, kind = a[0].gear.kind, src = a[0].gear.src;
    let dup = null;
    for (let i = 0; i < 400 && !dup; i++) {
      const r = DP.summonGear(s, 1, false);
      if (r[0].dupe) dup = r[0];
    }
    return { first: a[0].dupe === false, gearAdded: s.gear.length >= 1,
             dupFound: !!dup, cores: dup ? dup.cores : 0,
             stock: (s.mats.dragon_core || 0) > before, rank, kind, src };
  });
  check('Triệu hồi ra thẳng trang bị', dupe.first && dupe.gearAdded);
  check('quay trúng món đã có thì thành Lõi Rồng', dupe.dupFound && dupe.cores >= 1,
    dupe.cores + ' lõi/lần trùng');
  check('Lõi Rồng vào kho', dupe.stock);

  const gacha = await p.evaluate(() => {
    const s = DP.newSave('T');
    const r = DP.summonGear(s, 11, true);
    const m = DP.summonMagi(s, 11, true);
    return { gearLast: r[10].rank, magiLast: m[10].rank, n: r.length, mn: s.magi.length,
             kinds: r.map(x => x.kind).filter((v, i, a) => a.indexOf(v) === i).length };
  });
  check('gói 10+1 trang bị bảo hiểm SS', gacha.gearLast === 'SS');
  check('gacha ra đủ cả vũ khí lẫn giáp', gacha.kinds >= 2, gacha.kinds + ' loại');
  check('gói 10+1 magi bảo hiểm SS', gacha.magiLast === 'SS');
  check('magi vào kho đúng số lượng', gacha.mn === 11);

  // Bỏ dở giữa chừng: bảng "RỜI ẢI" hiện ra, và ví KHÔNG được đổi thêm một đồng
  // nào — thứ nhặt được đã vào túi từ lúc nhặt rồi.
  await goStage(p, 'tior-2');
  await p.waitForTimeout(500);
  const quit = await p.evaluate(() => new Promise(res => {
    const g0 = DP.UI.save.gold, m0 = JSON.stringify(DP.UI.save.mats);
    DP.UI.leave();
    setTimeout(() => {
      const el = document.getElementById('resultScr');
      res({ shown: el.classList.contains('on'), text: (el.innerText || '').split('\n')[0],
            goldDelta: DP.UI.save.gold - g0, matsSame: JSON.stringify(DP.UI.save.mats) === m0,
            cleared: !!DP.UI.save.cleared['tior-2'], running: !!(DP.UI.battle && DP.UI.battle.running) });
    }, 400);
  }));
  check('rời ải giữa chừng hiện bảng tổng kết', quit.shown && /RỜI ẢI/.test(quit.text), quit.text);
  check('rời ải không cộng thêm/trừ bớt tiền', quit.goldDelta === 0 && quit.matsSame,
    'lệch ' + quit.goldDelta + ' gold');
  check('rời ải KHÔNG tính là phá ải', quit.cleared === false);
  check('rời ải thì trận dừng hẳn', quit.running === false);
  await p.evaluate(() => DP.UI.show('home'));
  await p.waitForTimeout(200);
  check('mở màn khác thì bảng kết quả tự dẹp',
    await p.evaluate(() => !document.getElementById('resultScr').classList.contains('on')));

  // MEDAL. Phá ải là ra Medal, và Medal phải TIÊU ĐƯỢC — nếu không thì nó chỉ là
  // một con số đếm lên trong màn Khác, tức tiền chết.
  const medal = await p.evaluate(() => {
    const s = DP.newSave('T');
    const item = DP.MEDAL_SHOP.find(x => x.give.ticket === 5);
    s.medal = item.price.medal - 1;
    const t0 = s.ticket;
    const poor = DP.pay(s, item.price);            // thiếu 1 Medal -> phải từ chối
    s.medal = item.price.medal;
    const ok = DP.pay(s, item.price);
    return {
      hasShop: DP.MEDAL_SHOP.length > 0,
      buysTicket: !!item,
      poor: poor === false, poorKept: s.ticket === t0,
      ok: ok === true, spent: s.medal === 0,
      // Lõi Rồng KHÔNG được bán ở bất cứ quầy nào
      coreForSale: JSON.stringify(DP.MEDAL_SHOP).indexOf('dragon_core') >= 0 ||
                   JSON.stringify(DP.SHOP).indexOf('dragon_core') >= 0
    };
  });
  check('có quầy tiêu Medal (Medal không phải tiền chết)', medal.hasShop && medal.buysTicket);
  check('thiếu Medal thì từ chối và không mất gì', medal.poor && medal.poorKept);
  check('đủ Medal thì đổi được vé, trừ đúng số Medal', medal.ok && medal.spent);
  check('không quầy nào bán Lõi Rồng', medal.coreForSale === false);

  // Đường mua đi qua NÚT THẬT trên màn tiệm.
  await p.evaluate(() => { DP.UI.save.medal = 500; DP.UI.save.ticket = 0; DP.UI.saveNow(); DP.UI.show('shop'); });
  await p.waitForTimeout(250);
  const buy = await p.evaluate(() => {
    const S = DP.UI.save, m0 = S.medal;
    const btn = document.querySelector('#body-shop [data-buym]');
    const it = DP.MEDAL_SHOP.find(x => x.id === btn.getAttribute('data-buym'));
    btn.click();
    return { ticket: S.ticket, spent: m0 - S.medal, want: it.price.medal, give: it.give.ticket || 0 };
  });
  check('bấm nút quầy Medal thật: trừ đúng Medal, cộng đúng vé',
    buy.spent === buy.want && buy.ticket === buy.give,
    'trừ ' + buy.spent + '/' + buy.want + ', vé ' + buy.ticket);

  // ĐỔI GOLD LẤY PIKKE. Chỗ này dễ vỡ nhất không phải ở nút bấm mà ở GIÁ: tiệm
  // bán cả hai chiều Gold <-> Pikke, nên nếu giá mua vào không đắt hơn giá bán ra
  // thì đổi đi đổi lại là tự nhân đôi ví — một máy in tiền không ai để ý cho tới
  // khi kinh tế vỡ. Bài kiểm này tính thẳng tỉ giá từ dữ liệu.
  const pk = await p.evaluate(() => {
    const sell = DP.SHOP.find(x => x.give.gold && x.price.pikke);   // Pikke -> Gold
    const sellRate = sell.give.gold / sell.price.pikke;             // Gold nhận mỗi Pikke
    const buyRates = DP.PIKKE_BUY.map(x => x.price.gold / x.give.pikke);
    // Đường vòng Medal -> Gold -> Pikke không được rẻ hơn Medal -> vé đi thẳng.
    const mGold = DP.MEDAL_SHOP.find(x => x.give.gold);
    const mTick = DP.MEDAL_SHOP.find(x => x.give.ticket === 5);
    const pTick = DP.SHOP.find(x => x.give.ticket);                 // vé mua bằng Pikke
    const pikkePerTicket = pTick.price.pikke / pTick.give.ticket;
    const direct = mTick.give.ticket * pikkePerTicket / mTick.price.medal;   // Pikke-quy-đổi mỗi Medal
    const detour = (mGold.give.gold / Math.min.apply(null, buyRates)) / mGold.price.medal;

    const s = DP.newSave('T');
    s.gold = DP.PIKKE_BUY[0].price.gold; s.pikke = 0;
    const okBuy = DP.pay(s, DP.PIKKE_BUY[0].price);
    if (okBuy) s.pikke += DP.PIKKE_BUY[0].give.pikke;
    const poor = DP.pay(s, DP.PIKKE_BUY[0].price);   // hết sạch gold -> phải từ chối
    return { sellRate, buyMin: Math.min.apply(null, buyRates), direct, detour,
             bought: s.pikke === DP.PIKKE_BUY[0].give.pikke, gold: s.gold === 0, poor: poor === false };
  });
  check('mua Pikke đắt hơn bán Pikke (không có vòng in tiền)', pk.buyMin > pk.sellRate,
    'mua ' + pk.buyMin.toFixed(0) + ' vs bán ' + pk.sellRate.toFixed(0) + ' Gold/Pikke');
  check('đổi Medal đi thẳng vẫn lời hơn vòng Medal→Gold→Pikke', pk.direct > pk.detour,
    pk.direct.toFixed(1) + ' vs ' + pk.detour.toFixed(1) + ' Pikke mỗi Medal');
  check('đổi Gold lấy Pikke: trừ đúng Gold, cộng đúng Pikke', pk.bought && pk.gold);
  check('hết Gold thì từ chối', pk.poor);

  // QUẦY NẠP. Cố ý cho không, nên bài kiểm ở đây chốt hai điều: nó thật sự
  // không đòi gì, và nó KHÔNG phát Lõi Rồng — thứ duy nhất còn khan.
  await p.evaluate(() => { DP.UI.show('shop'); });
  await p.waitForTimeout(250);
  const iap = await p.evaluate(() => {
    const S = DP.UI.save;
    const before = { t: S.ticket, g: S.gem, k: S.pikke, o: S.gold, m: S.medal, core: S.mats.dragon_core || 0 };
    const btn = document.querySelector('#body-shop [data-iap]');
    const it = DP.IAP.find(x => x.id === btn.getAttribute('data-iap'));
    btn.click();
    const once = S.ticket - before.t;
    document.querySelector('#body-shop [data-iap]').click();   // bấm lần hai
    return {
      free: DP.IAP.every(x => !x.price),
      allGive: DP.IAP.every(x => Object.keys(x.give).length > 0),
      allWas: DP.IAP.every(x => /đ$/.test(x.was || '')),
      gave: once === (it.give.ticket || 0) && once > 0,
      twice: S.ticket - before.t === once * 2,
      noCore: JSON.stringify(DP.IAP).indexOf('dragon_core') < 0 &&
              (S.mats.dragon_core || 0) === before.core
    };
  });
  check('mọi gói nạp đều không đòi gì (0đ thật)', iap.free && iap.allGive);
  check('gói nào cũng có giá gạch đi cho ra dáng quầy nạp', iap.allWas);
  check('bấm gói là nhận đúng đồ', iap.gave);
  check('bấm bao nhiêu lần cũng được', iap.twice);
  check('quầy nạp KHÔNG phát Lõi Rồng', iap.noCore);

  // ------------------------------------------------------------- CHỌN ẢI
  results.push('\n── chuỗi ải ──');
  const stg = await p.evaluate(() => {
    const s = DP.newSave('T');
    const first = DP.STAGES[0], second = DP.STAGES[1], last = DP.STAGES[DP.STAGES.length - 1];
    const openFirst = DP.stageOpen(s, first), openSecond = DP.stageOpen(s, second);
    s.cleared[first.id] = true;
    return {
      n: DP.STAGES.length, openFirst, openSecond,
      afterClear: DP.stageOpen(s, second),
      next: DP.nextStage(s).id,
      allHaveBoss: DP.STAGES.every(x => !!DP.behemothById(x.boss)),
      allHaveKills: DP.STAGES.every(x => x.kills > 0),
      lvUp: last.lv > first.lv,
      lastIsBigger: last.rank === 'S' || last.rank === 'SS'
    };
  });
  check('có đủ chuỗi ải', stg.n >= 30, stg.n + ' ải');
  check('ải đầu luôn mở, ải sau khoá', stg.openFirst === true && stg.openSecond === false);
  check('phá ải trước thì ải sau mở', stg.afterClear === true);
  check('ải kế tiếp trỏ đúng chỗ đang dở', stg.next === 'tior-2', stg.next);
  check('mọi ải đều có Behemoth cuối ải', stg.allHaveBoss);
  check('mọi ải đều có chỉ tiêu dọn quái', stg.allHaveKills);
  check('cấp độ tăng dần theo chuỗi ải', stg.lvUp);
  check('ải cuối là trùm hạng cao', stg.lastIsBigger);

  // ------------------------------------------------------------- BOT CHẠY
  results.push('\n── bot chơi thật ──');
  await p.evaluate(() => { DP.UI.show('home'); });
  await p.waitForTimeout(300);
  await goBoss(p, 'tior-1');
  await p.waitForTimeout(400);
  const hp0 = await p.evaluate(() => DP.UI.battle.boss.hp);
  await p.evaluate(() => DPBot.on(150));
  await p.waitForTimeout(14000);
  const botRes = await p.evaluate(() => {
    const b = DP.UI.battle;
    return { hp: b ? (b.boss ? b.boss.hp : 0) : 0, alive: !!(b && b.running), finished: !b || !b.running };
  });
  await p.evaluate(() => DPBot.off());
  check('bot đánh boss có tiến triển', botRes.finished || botRes.hp < hp0 * 0.85,
    botRes.finished ? 'hạ xong trước 14s' : Math.round((1 - botRes.hp / hp0) * 100) + '% máu boss');

  // ---------------------------------------------------------- HUD & LAYOUT
  results.push('\n── HUD & bố cục ──');
  // Mở HẲN một trận boss chứ không chỉ mở khi chưa có trận nào: bot có thể đang ở
  // giữa một trận FIELD, mà field thì không có hàng thanh máu boss nên mọi phép đo
  // dưới đây ra 0. Bài kiểm không được ngầm dựa vào việc bot đang làm gì.
  await goBoss(p, 'tior-1');
  await p.waitForTimeout(500);
  const hud = await p.evaluate(() => {
    const q = id => document.getElementById(id);
    const r = el => { const b = el.getBoundingClientRect(); const s = document.getElementById('stage').getBoundingClientRect();
      const k = 540 / s.width; return { x: (b.left - s.left) * k, y: (b.top - s.top) * k, w: b.width * k, h: b.height * k }; };
    return {
      bossBar: r(q('hBossHp').parentElement),
      fatigue: r(q('hBossFat').parentElement),
      magi0: r(q('hMagi0')), magi1: r(q('hMagi1')),
      orb: r(q('hOrb')), hp: r(q('hPHp')), timer: r(q('hTimer')),
      hudOn: q('hud').classList.contains('on')
    };
  });
  check('HUD trận đang bật', hud.hudOn);
  check('thanh máu boss nằm trên cùng', hud.bossBar.y < 60, 'y=' + Math.round(hud.bossBar.y));
  check('thanh gục nằm NGAY DƯỚI thanh máu boss (đúng bản gốc)',
    hud.fatigue.y > hud.bossBar.y && hud.fatigue.y - (hud.bossBar.y + hud.bossBar.h) < 8,
    'cách ' + Math.round(hud.fatigue.y - hud.bossBar.y - hud.bossBar.h) + 'px');
  check('nút Magi nằm ở MÉP PHẢI', hud.magi0.x > 440 && hud.magi1.x > 440,
    'x=' + Math.round(hud.magi0.x));
  check('quả cầu Magi ở góc dưới trái', hud.orb.x < 40 && hud.orb.y > 800,
    Math.round(hud.orb.x) + ',' + Math.round(hud.orb.y));
  check('thanh máu người chơi ở đáy', hud.hp.y > 850, 'y=' + Math.round(hud.hp.y));
  // Quy tắc bất di bất dịch của bản gốc: giữa và nửa dưới màn hình KHÔNG có nút nào.
  const thumbZone = await p.evaluate(() => {
    const s = document.getElementById('stage').getBoundingClientRect();
    const k = s.width / 540;
    const pts = [];
    for (let x = 90; x <= 450; x += 60) for (let y = 480; y <= 820; y += 60) pts.push([x, y]);
    return pts.map(([x, y]) => {
      const el = document.elementFromPoint(s.left + x * k, s.top + y * k);
      return el ? (el.tagName + '.' + (el.className && el.className.baseVal !== undefined ? '' : el.className)) : 'null';
    }).filter(t => /BUTTON/.test(t));
  });
  check('vùng ngón cái (giữa + nửa dưới) KHÔNG có nút nào', thumbZone.length === 0,
    thumbZone.length ? thumbZone.join(', ') : 'sạch');

  // Chặng quái không có boss: hàng boss phải nhường chỗ cho bộ đếm quái, chứ
  // không để một thanh máu rỗng chiếm chỗ đắt nhất màn hình.
  await goStage(p, 'tior-1');
  await p.waitForTimeout(400);
  const mobHud = await p.evaluate(() => {
    const vis = id => getComputedStyle(document.getElementById(id)).display !== 'none';
    return { mobRow: vis('mobRow'), bossRow: vis('bossRow'),
             left: document.getElementById('hMobLeft').textContent,
             timer: !!document.querySelector('.timer-orb'),
             name: document.getElementById('hStageName').textContent };
  });
  check('chặng quái: hiện bộ đếm quái, ẩn hàng boss', mobHud.mobRow && !mobHud.bossRow);
  check('bộ đếm quái ghi đúng số còn lại', +mobHud.left > 0, 'còn ' + mobHud.left);
  check('chặng quái vẫn hiện tên ải', /Ải/.test(mobHud.name), mobHud.name);
  const swap = await p.evaluate(() => {
    DP.UI.battle.startBossPhase();
    const vis = id => getComputedStyle(document.getElementById(id)).display !== 'none';
    return { mobRow: vis('mobRow'), bossRow: vis('bossRow') };
  });
  check('sang chặng boss thì hai hàng đổi chỗ cho nhau', swap.bossRow && !swap.mobRow);

  // ------------------------------------------------------------ MÀN MENU
  results.push('\n── màn hình menu ──');
  await p.evaluate(() => { DP.UI.leave(); });
  await p.waitForTimeout(300);
  for (const s of ['home', 'quest', 'armory', 'gacha', 'more', 'forge', 'magi', 'shop', 'help', 'bosslist']) {
    await p.evaluate(id => DP.UI.show(id), s);
    await p.waitForTimeout(120);
    const ok = await p.evaluate(id => {
      const el = document.getElementById('scr-' + id);
      return !!el && el.classList.contains('on') && el.querySelector('.body').children.length > 0;
    }, s);
    check('màn "' + s + '" mở và có nội dung', ok);
  }

  // Lưu game
  await p.evaluate(() => { DP.UI.save.gold = 12345; DP.UI.saveNow(); });
  await p.reload(); await p.waitForTimeout(900);
  check('lưu và nạp lại giữ nguyên tiến độ',
    await p.evaluate(() => DP.UI.save.gold === 12345));

  // -------------------------------------------------------------- LỖI JS
  results.push('\n── console ──');
  check('không có lỗi JavaScript', errs.length === 0, errs.slice(0, 3).join(' | '));

  await ctx.close(); await b.close();

  console.log(results.join('\n'));
  console.log('\n' + pass + ' đạt, ' + fail + ' hỏng.');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
