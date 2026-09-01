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

const DP_AIR = 1.4;   // FEEL.airDmgMul, chỉ dùng để in nhãn cho dễ đọc

(async () => {
  const b = await chromium.launch();
  const { ctx, p, errs } = await open(b);

  // ---------------------------------------------------------------- DỮ LIỆU
  results.push('\n── dữ liệu ──');
  const d = await p.evaluate(() => ({
    weapons: Object.keys(DP.WEAPONS).length,
    behemoths: DP.BEHEMOTHS.length,
    skills: Object.keys(DP.SKILLS).reduce(function (n, k) { return n + DP.SKILLS[k].length; }, 0),
    areas: DP.AREAS.length,
    story: DP.STORY.length,
    mats: Object.keys(DP.MATERIALS).length,
    bossRates: DP.BEHEMOTH_RATES,
    elemFx: Object.keys(DP.ELEM_FX).length,
    dropNormal: DP.DROP_NORMAL,
    elem: [DP.elemMult('water', 'fire'), DP.elemMult('fire', 'water'), DP.elemMult('fire', 'earth')]
  }));
  check('6 lớp vũ khí bắn', d.weapons === 6, d.weapons + '');
  check('đủ Behemoth (>=50)', d.behemoths >= 50, d.behemoths + ' con');
  check('đủ kỹ năng (2 mỗi lớp)', d.skills === 12, d.skills + ' đòn');
  check('8 vùng đất', d.areas === 8, d.areas + '');
  check('cốt truyện >=30 chặng', d.story >= 30, d.story + '');
  check('tỉ lệ gacha boss đúng wiki (3/15/55/27)',
    d.bossRates.SS === 0.03 && d.bossRates.S === 0.15 && d.bossRates.A === 0.55 && d.bossRates.B === 0.27);
  check('đủ bảng nguyên tố cho lớp VFX', d.elemFx === 7, d.elemFx + ' hệ');
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
  // Thang chỉ số đã HẠ XUỐNG (xem SHOOTER.md §9): số tuyệt đối cũ 306/656 không
  // còn, nhưng TỈ LỆ giữa ba bậc evolve thì phải giữ nguyên, vì đó mới là cái có
  // nguồn từ wiki (135/306 = 0,44 và 274/306 = 0,895 trên cây vũ khí Amarok).
  check('vũ khí SS ở thang mới = 46 ATK vật lý', st.max.patk === 46, st.max.patk + '');
  check('công hệ không được át phần bắn (<= 40% công vật lý)',
    st.max.eatk <= st.max.patk * 0.40, st.max.eatk + '/' + st.max.patk);
  check('tỉ lệ evolve bậc 1 giữ đúng 0,44 của wiki',
    Math.abs(st.evo0.patk / st.max.patk - 0.44) < 0.03,
    (st.evo0.patk / st.max.patk).toFixed(3));
  check('tỉ lệ evolve bậc 2 giữ đúng 0,895 của wiki',
    Math.abs(st.evo1.patk / st.max.patk - 0.895) < 0.03,
    (st.evo1.patk / st.max.patk).toFixed(3));
  check('giáp đầu SS = 252 HP như wiki', st.head.hp === 252, st.head.hp + '');

  // -------------------------------------------------- LUẬT LIMIT BREAK / Ô
  results.push('\n── luật trang bị ──');
  // Kỹ năng THUỘC VỀ VŨ KHÍ: mỗi cây đúng hai đòn, đòn thứ hai mở theo cấp.
  const sk = await p.evaluate(() => {
    const s = DP.starterKit(DP.newSave('T'));
    const w = s.gear.find(g => g.kind === 'weapon' && g.wclass === 'shotgun');
    w.lv = 1;
    const lo = DP.weaponProfile(s, w).skills.length;
    w.lv = DP.SKILL_RULES.unlockLv2;
    const hi = DP.weaponProfile(s, w).skills.length;
    const perWeapon = DP.WEAPON_ORDER.map(k => DP.skillsOf(k).length);
    const kinds = DP.WEAPON_ORDER.reduce((a, k) => a.concat(DP.skillsOf(k).map(x => x.kind)), []);
    const uniq = kinds.filter((v, i, a) => a.indexOf(v) === i);
    // Trình phát nằm trên Battle.prototype; ở bước này chưa vào trận nào nên lấy
    // qua DP.Battle (lớp), không qua một thể hiện.
    const proto = (DP.Battle && DP.Battle.prototype) || {};
    const missing = uniq.filter(k => typeof proto['sk_' + k] !== 'function');
    return { lo, hi, perWeapon, uniqueKinds: uniq.length,
             missingRunners: missing.length, missing: missing };
  });
  check('mỗi vũ khí đúng 2 kỹ năng', sk.perWeapon.every(n => n === 2), sk.perWeapon.join('/'));
  check('kỹ năng thứ hai mở theo cấp vũ khí', sk.lo === 1 && sk.hi === 2, sk.lo + ' -> ' + sk.hi);
  // Đây là phép kiểm chống lại đúng cái đã giết hệ Magi cũ: bốn mươi viên dùng
  // chung ba đoạn code. Mười đòn thì phải là mười trình phát khác nhau.
  check('mười hai kỹ năng là MƯỜI HAI trình phát khác nhau', sk.uniqueKinds === 12, sk.uniqueKinds + ' kind');
  // Và mỗi kind phải CÓ trình phát thật, không rơi vào nhánh "chưa cài" im lặng.
  check('mọi kind đều có trình phát sk_*', sk.missingRunners === 0,
    sk.missingRunners ? 'thiếu ' + sk.missing.join(',') : 'đủ 12'); 

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

  // CHẠM -> bắn một phát, và phải có ĐẠN thật bay ra
  await p.evaluate(() => { DP.UI.battle.player.state = 'idle'; DP.UI.battle.projs.length = 0; });
  await G.tap(p, 270, 640);
  await p.waitForTimeout(120);
  const shot1 = await p.evaluate(() => ({ st: DP.UI.battle.player.state,
                                          n: DP.UI.battle.projs.length }));
  check('CHẠM bắn một phát', shot1.st === 'fire' || shot1.st === 'cast', shot1.st);
  check('CHẠM sinh ra đạn thật', shot1.n >= 1, shot1.n + ' viên');

  // BẤM LIÊN TỤC -> bắn liên tục theo nhịp của cây, không nối combo nữa
  await p.waitForTimeout(350);
  await p.evaluate(() => { DP.UI.battle.projs.length = 0; window.__fired = 0;
    const b = DP.UI.battle, f = b.fire.bind(b);
    b.fire = function (o) { window.__fired++; return f(o); }; });
  for (let i = 0; i < 4; i++) { await G.tap(p, 270, 640); await p.waitForTimeout(300); }
  check('BẤM LIÊN TỤC bắn được nhiều phát',
    await p.evaluate(() => window.__fired) >= 3,
    await p.evaluate(() => window.__fired) + ' phát');

  // GIỮ -> ba nghĩa tuỳ lớp. Đi qua đúng cử chỉ thật, không gọi hàm nội bộ.
  /* DPBot._hold() trả về NGAY rồi mới nhả tay qua setTimeout, và Punicon chỉ
   * nhận là "giữ" sau PUNI.holdMs = 260ms. Nên phải đọc trạng thái GIỮA cú giữ,
   * rồi chờ cho nó nhả hẳn trước bài kế — nếu không thì bài kế bấm vào giữa một
   * cú giữ đang chạy và không có gì hoạt động như mong đợi. */
  await p.waitForTimeout(500);
  await p.evaluate(() => {
    const b = DP.UI.battle;
    b.player.state = 'idle'; b.player.stateT = 0; b.player.stateDur = 0;
    window.__fired = 0; window.__heldState = '';
    const hs = b.holdStart.bind(b);
    b.holdStart = function (dx, dy) { const r = hs(dx, dy);
      window.__heldState = b.player.state; return r; };
  });
  await G.hold(p, 900, 0, 0);
  await p.waitForTimeout(450);                     // quá ngưỡng holdMs, còn giữa cú giữ
  const heldState = await p.evaluate(() => window.__heldState);
  check('GIỮ vào đúng trạng thái của lớp (auto/nạp/ghì)',
    ['autofire', 'charge', 'steady'].indexOf(heldState) >= 0, heldState + '');
  await p.waitForTimeout(700);                     // chờ nhả tay hẳn

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
  // Chờ lâu hơn hẳn bản cận chiến: viên đạn phải HIỆN DẦN 140ms (chưa có hitbox)
  // rồi mới BAY hết quãng đường tới mục tiêu. Thời gian bay là bản chất của game
  // bắn, không phải độ trễ thừa.
  await p.waitForTimeout(600);
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

  /* GIỮ có BA nghĩa, và mỗi lớp chỉ nhận đúng một nghĩa. Kiểm cả ba trên cùng
   * một đường vào (holdStart), vì đó là chỗ ngón tay người chơi đi qua. */
  await p.waitForTimeout(600);
  const holds = await p.evaluate(() => {
    const b = DP.UI.battle, pl = b.player, out = {};
    ['rifle', 'bow', 'sniper'].forEach(k => {
      b.W = DP.WEAPONS[k];
      pl.state = 'idle'; pl.stateT = 0; pl.stateDur = 0; pl.carryCharge = 0;
      b.holdStart(0, 0);
      out[k] = pl.state;
      b.holdCancel();
    });
    return out;
  });
  check('GIỮ cây auto = bắn liên tục', holds.rifle === 'autofire', holds.rifle);
  check('GIỮ cây nạp = vào thế nạp lực', holds.bow === 'charge', holds.bow);
  check('GIỮ cây còn lại = ghì súng', holds.sniper === 'steady', holds.sniper);
  await p.waitForTimeout(500);

  // GIỮ RỒI TRƯỢT VỀ HƯỚNG NÚT KỸ NĂNG
  const slide = await p.evaluate(async () => {
    const b = DP.UI.battle;
    b.player.state = 'idle';
    const hs = b.puni.hotspots[0];
    b.puni.ox = 270; b.puni.oy = 640;
    const dx = hs.x - 270, dy = hs.y - 640, d = Math.hypot(dx, dy);
    const idx = b.puni.aimedHotspot(dx / d * 80, dy / d * 80, 80);
    const wrong = b.puni.aimedHotspot(-80, 0, 80);
    return { idx, wrong, hasSkill: !!b.skillDef(0) };
  });
  check('trượt ĐÚNG hướng nút kỹ năng được nhận', slide.idx === 0, 'idx=' + slide.idx);
  check('trượt SAI hướng thì không nhận', slide.wrong === -1);
  check('vũ khí đang cầm có kỹ năng ở khe 1', slide.hasSkill);

  /* Kỹ năng phải NẠP mới xả được. Nhả sớm thì huỷ và hoàn phần lớn hồi chiêu —
   * không phạt người đọc đúng tình huống rồi rút tay. */
  const cast = await p.evaluate(async () => {
    const b = DP.UI.battle, pl = b.player;
    const sk = b.skillDef(0);
    pl.state = 'idle'; pl.skCd = [0, 0]; pl.usedSkill = false;

    // (a) nhả sớm -> huỷ, KHÔNG xả, hồi chiêu chỉ còn một phần
    b.skillCharge(0, 10);
    const charging = pl.state;
    b.skillRelease(0, sk.charge * 0.3);
    const early = { state: pl.state, used: pl.usedSkill, cd: b.skillCdLeft(0), full: b.skillCdOf(sk) };

    // (b) nạp đủ -> xả thật, và vào hồi chiêu đầy
    pl.skCd = [0, 0]; pl.state = 'idle';
    b.skillCharge(0, 10);
    b.skillCharge(0, sk.charge + 50);
    const ready = pl.skReady;
    b.skillRelease(0, sk.charge + 50);
    return { charging, early, ready, fired: pl.usedSkill, cdAfter: b.skillCdLeft(0), full: b.skillCdOf(sk) };
  });
  check('trượt về nút thì vào thế NẠP', cast.charging === 'skcharge', cast.charging);
  check('nhả sớm thì KHÔNG xả', cast.early.used === false && cast.early.state === 'idle');
  check('huỷ giữa chừng hoàn 60% hồi chiêu',
    Math.abs(cast.early.cd - cast.early.full * 0.4) < 2,
    Math.round(cast.early.cd) + '/' + Math.round(cast.early.full) + 'ms');
  check('nạp đủ thì báo sẵn sàng', cast.ready === true);
  check('nạp đủ thì xả được kỹ năng', cast.fired === true);
  check('xả xong vào hồi chiêu đầy', Math.abs(cast.cdAfter - cast.full) < 2,
    Math.round(cast.cdAfter) + 'ms');

  /* ================= LỚP CẢM GIÁC =================
   * Đây là phần quyết định "chặt có đã tay hay không", và cũng là phần dễ bị
   * chỉnh hỏng nhất mà không ai nhận ra — vì nó không làm gì sai, chỉ làm cho
   * game nhạt đi. Nên mỗi cơ chế phải có một phép kiểm chốt lại. */
  results.push('\n── lớp cảm giác (hitstop · văng · vỡ thế · hất tung) ──');
  await goStage(p, 'tior-1');
  await p.waitForTimeout(500);

  // Dựng một con bia đứng ngay trước mặt, máu trâu để không chết giữa chừng.
  const target = () => p.evaluate(() => {
    const b = DP.UI.battle, pl = b.player;
    b.mobs.length = 0; b.freeze = 0; b.shake = 0;
    const m = b.makeMob('purun', 1, false, false);
    m.hp = m.maxHp = 9e6; m.x = pl.x + 40; m.y = pl.y;
    b.mobs.push(m);
    pl.facing = 0; pl.state = 'idle'; pl.combo = 0; pl.counterUntil = 0; pl.heavyFrom = 0;
    window.__m = m;
  });

  await target();
  const feel = await p.evaluate(() => {
    const b = DP.UI.battle, m = window.__m;
    b.dealToMob(m, b.playerDamage(b.W.dmg, {}),
                { move: { kb: b.W.kb, poise: b.W.poise, hs: DP.FEEL.hitstop.light } });
    return { freeze: Math.round(b.freeze), shake: Math.round(b.shake),
             kb: +Math.hypot(m.kbX, m.kbY).toFixed(1), poise: Math.round(m.poise), max: m.poiseMax,
             cap: Math.round(DP.WEAPONS.rifle.shotMs * 0.2) };
  });
  // Hitstop giờ theo thang Nuclear Throne (1/10/20/50/100ms). Ngưỡng cũ là 40ms,
  // tức lớn hơn cả cú "quái nổ" của NT — bắn 5 phát/giây mà giữ nó thì đứng hình.
  check('bắn trúng thì ĐÓNG BĂNG một nhịp ngắn (hitstop)', feel.freeze >= 8, feel.freeze + 'ms');
  check('hitstop đủ ngắn cho nhịp bắn (<= 20% khoảng cách hai phát)',
    feel.freeze <= feel.cap, feel.freeze + 'ms / trần ' + feel.cap + 'ms');
  check('bắn trúng thì quái VĂNG ra', feel.kb > 0, feel.kb + 'px/khung');
  check('bắn trúng thì trừ thanh lì đòn', feel.poise < feel.max, feel.poise + '/' + feel.max);

  // Hitstop không được nuốt input, và phải có trần.
  const stop = await p.evaluate(() => {
    const b = DP.UI.battle;
    b.freeze = 0;
    for (let i = 0; i < 8; i++) b.impact(0, 0, 200, 0);   // tám đòn trúng cùng lúc
    const capped = b.freeze <= DP.FEEL.hitstopMax;
    // trong lúc đóng băng, fx vẫn phải chạy chứ không đứng luôn
    return { capped, freeze: Math.round(b.freeze) };
  });
  check('hitstop có TRẦN, nhiều đòn cùng lúc không đứng hình', stop.capped, stop.freeze + 'ms');

  await target();
  const brk = await p.evaluate(() => {
    const b = DP.UI.battle, m = window.__m;
    m.poise = 5;
    b.dealToMob(m, { phys: 50, elem: 0, el: 'none' }, { move: { poise: 10, kb: 8 } });
    return { stagger: Math.round(m.stagger), reset: m.poise === m.poiseMax };
  });
  check('đục hết lì đòn thì quái VỠ THẾ và đứng chết trân', brk.stagger >= 600 && brk.reset,
    'loạng choạng ' + brk.stagger + 'ms');

  await target();
  const air = await p.evaluate(() => new Promise(res => {
    const b = DP.UI.battle, m = window.__m;
    b.dealToMob(m, { phys: 10, elem: 0, el: 'none' }, { move: { launch: 34, poise: 5 } });
    const t0 = performance.now();
    setTimeout(() => {
      const up = m.z;
      const before = m.hp;
      b.dealToMob(m, { phys: 100, elem: 0, el: 'none' }, { move: {} });
      res({ up: +up.toFixed(1), dmg: Math.round(before - m.hp), acts: m.stagger > 0 });
    }, 400);
  }));
  check('đòn HẤT TUNG nhấc quái lên trời', air.up > 15, air.up + 'px');
  check('quái đang lơ lửng thì ăn đòn nặng hơn', air.dmg > 100,
    air.dmg + ' từ base 100 (×' + DP_AIR + ')');
  check('quái đang lơ lửng thì không đánh trả được', air.acts);

  /* GHÌ SÚNG. Giữ đủ lâu thì tản đạn về 0 và phát bắn nặng tay hơn; giữ chưa đủ
   * thì vẫn bắn được, chỉ là không được thưởng. Phạt BẤT ĐỐI XỨNG — đây là luật
   * lấy từ dải chí mạng của Monster Hunter: đứng sai chỗ thì MẤT thưởng, chứ
   * không bị trừ xuống dưới mức gốc. */
  await target();
  const steady = await p.evaluate(() => {
    const b = DP.UI.battle, pl = b.player;
    b.W = DP.WEAPONS.sniper;
    b.projs.length = 0; pl.state = 'idle'; pl.bloom = 0;
    b.fire({});                       // bắn thường
    const plain = b.projs[0].mul;
    b.projs.length = 0; pl.state = 'idle';
    b.fire({ steady: true });         // ghì đủ rồi bắn
    const held = b.projs[0].mul;
    const heldCrit = b.projs[0].critBonus;
    return { plain: plain, held: held, heldCrit: heldCrit };
  });
  check('GHÌ SÚNG làm phát bắn nặng tay hơn', steady.held > steady.plain,
    steady.plain + ' -> ' + steady.held);
  check('GHÌ SÚNG cộng thêm tỉ lệ chí mạng', steady.heldCrit > 0, '+' + steady.heldCrit);

  /* TẢN ĐẠN NỞ RA khi giữ cò. Đây là cái phạt việc ghì cò vô tội vạ mà không
   * phải hạ DPS — và nó thu lại khi nhả tay một nhịp. */
  const bloom = await p.evaluate(() => {
    const b = DP.UI.battle, pl = b.player;
    b.W = DP.WEAPONS.rifle;
    pl.state = 'idle'; pl.bloom = 0;
    for (let i = 0; i < 8; i++) { pl.state = 'idle'; b.fire({}); }
    return { after: +pl.bloom.toFixed(1), max: b.W.bloomMax };
  });
  check('giữ cò lâu thì tản đạn NỞ RA', bloom.after > 0, '+' + bloom.after + '°');
  check('tản đạn có trần, không nở vô hạn', bloom.after <= bloom.max,
    bloom.after + ' <= ' + bloom.max);

  /* DẢI CHÍ MẠNG của cung. Ba tính chất phải giữ: quá gần chỉ MẤT thưởng (về
   * 1,0×) chứ không tụt dưới gốc; quá xa mới BỊ PHẠT; và không có vách đứng. */
  const cd = await p.evaluate(() => {
    const C = DP.WEAPONS.bow.critDist;
    return { peak: Math.max.apply(null, C.mul), first: C.mul[0],
             last: C.mul[C.mul.length - 1], bands: C.bands.length, muls: C.mul.length,
             monotonicAfterPeak: C.mul.slice(1).every((v, i, a) => i === 0 || v <= a[i - 1]) };
  });
  check('cung có DẢI CHÍ MẠNG thưởng gấp rưỡi', cd.peak === 1.5, '×' + cd.peak);
  check('đứng quá GẦN chỉ mất thưởng, không bị phạt', cd.first === 1.0, '×' + cd.first);
  check('đứng quá XA thì bị phạt thật', cd.last < 1.0, '×' + cd.last);
  check('dải chí mạng giảm dần, không có vách đứng', cd.monotonicAfterPeak);

  /* Mỗi LỚP một bộ thông số bắn thật sự khác nhau, không phải cùng một viên đạn
   * đổi hệ số. Luật cân bằng (SHOOTER.md §3.1): DPS bền của mọi archetype phải
   * GẦN BẰNG NHAU, nhưng sát thương MỖI LẦN BẤM thì phải chênh nhau nhiều lần —
   * đó mới là cái phân biệt chúng trong một game né đạn. */
  const sets = await p.evaluate(() => {
    const out = {};
    Object.keys(DP.WEAPONS).forEach(k => {
      const W = DP.WEAPONS[k];
      out[k] = { dmg: W.dmg, shots: W.shots, rpm: W.rpm, range: W.range,
                 spd: W.spd, burst: W.burst, dps: W.dps, vi: W.vi };
    });
    const ks = Object.keys(out);
    const dps = ks.map(k => out[k].dps), burst = ks.map(k => out[k].burst);
    const range = ks.map(k => out[k].range), rpm = ks.map(k => out[k].rpm);
    return {
      out: out,
      dpsBand: Math.max.apply(null, dps) / Math.min.apply(null, dps),
      burstBand: Math.max.apply(null, burst) / Math.min.apply(null, burst),
      uniqueRange: new Set(range).size, uniqueRpm: new Set(rpm).size,
      uniqueNames: new Set(ks.map(k => out[k].vi)).size === ks.length,
      // range PHẢI là hệ quả của spd x life, không phải một số chỉnh tay riêng
      rangeDerived: ks.every(k => {
        const W = DP.WEAPONS[k];
        return Math.abs(W.range - W.spd * W.life / 16.67) < 1.5;
      })
    };
  });
  check('DPS bền của sáu lớp nằm trong dải hẹp (<= 2,2 lần)', sets.dpsBand <= 2.2,
    sets.dpsBand.toFixed(2) + 'x');
  check('burst mỗi lần bấm thì chênh nhiều (>= 3 lần)', sets.burstBand >= 3,
    sets.burstBand.toFixed(2) + 'x');
  check('sáu lớp sáu tầm bắn khác nhau', sets.uniqueRange === 6, sets.uniqueRange + '');
  check('sáu lớp sáu nhịp bắn khác nhau', sets.uniqueRpm === 6, sets.uniqueRpm + '');
  check('không lớp nào trùng tên', sets.uniqueNames);
  check('tầm bắn là HỆ QUẢ của spd x life, không phải số chỉnh tay', sets.rangeDerived);

  // Quái phải BÁO TRƯỚC, và phải có lúc hở để phạt.
  const ais = await p.evaluate(() => {
    const b = DP.UI.battle, out = {};
    ['purun', 'vacca', 'geguri', 'bat', 'galena', 'fungo'].forEach(tr => {
      b.mobs.length = 0;
      const m = b.makeMob(tr, 5, false, false);
      m.hp = m.maxHp = 9e9; m.x = b.player.x + 60; m.y = b.player.y; m.agro = 1;
      b.mobs.push(m);
      const seen = {};
      let tells = 0;
      for (let i = 0; i < 400; i++) {
        const fx0 = b.fx.filter(f => f.k === 'tell').length;
        // Phát thẻ đánh trước, đúng thứ tự của updateMobs. Không có thẻ thì con
        // quái vẫn đi lại và vẫn doạ, nhưng KHÔNG ra đòn — nên bỏ bước này là
        // đang kiểm một con quái bị trói tay.
        b.updateTokens();
        b.mobAI(m, b.player, 16.7);
        if (b.fx.filter(f => f.k === 'tell').length > fx0) tells++;
        seen[m.phase] = 1;
      }
      out[tr] = { ai: m.ai, phases: Object.keys(seen), tells: tells, poise: m.poiseMax };
    });
    return out;
  });
  const aiKeys = Object.keys(ais);
  check('sáu tộc quái có sáu lối đánh khác nhau',
    new Set(aiKeys.map(k => ais[k].ai)).size === 6,
    aiKeys.map(k => ais[k].ai).join(', '));
  check('mọi tộc biết đánh đều BÁO TRƯỚC bằng vùng đỏ',
    aiKeys.filter(k => k !== 'purun').every(k => ais[k].tells > 0),
    aiKeys.map(k => k + ':' + ais[k].tells).join(' '));
  check('đánh xong con nào cũng HỞ một nhịp để bị phạt',
    aiKeys.every(k => ais[k].phases.indexOf('rest') >= 0));
  check('con lì đòn nhất dày gấp nhiều lần con yếu nhất',
    ais.fungo.poise >= ais.bat.poise * 3,
    'Fungo ' + ais.fungo.poise + ' vs Bat ' + ais.bat.poise);

  // Sân phải chật để lúc nào cũng có thứ trong tầm với.
  const arena = await p.evaluate(() => {
    const b = DP.UI.battle;
    return { w: b.wW, h: b.wH, cfg: DP.ARENA };
  });
  check('sân đấu chật lại cho khỏi mất thì giờ đi bộ',
    arena.w === arena.cfg.w && arena.h === arena.cfg.h && arena.w * arena.h < 1300 * 1600 * 0.6,
    arena.w + '×' + arena.h);

  // Cả sáu lớp phát sẵn từ đầu.
  const kit = await p.evaluate(() => {
    const s = DP.starterKit(DP.newSave('T'));
    const cls = s.gear.filter(g => g.kind === 'weapon').map(g => g.wclass);
    const eq = DP.equipped(s).weapons.filter(Boolean).length;
    return { n: new Set(cls).size, eq: eq };
  });
  check('phát sẵn đủ sáu lớp vũ khí', kit.n === 6, kit.n + ' cây');
  check('ba khe vũ khí đều có đồ để đổi giữa trận', kit.eq === 3);

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
    b.player.usedSkill = true; b.player.deaths = 0;
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
    return { gearLast: r[10].rank, n: r.length,
             kinds: r.map(x => x.kind).filter((v, i, a) => a.indexOf(v) === i).length };
  });
  check('gói 10+1 trang bị bảo hiểm SS', gacha.gearLast === 'SS');
  check('gacha ra đủ cả vũ khí lẫn giáp', gacha.kinds >= 2, gacha.kinds + ' loại');

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
  // Cửa sổ nới từ 14s lên 22s vì trận boss GIỜ DÀI HƠN THEO THIẾT KẾ: máu boss
  // suy ra từ máu quái thường nhân 40-78 lần, cho TTK mục tiêu 45-90 giây (chuẩn
  // thể loại). Giữ nguyên 14s và đòi 15% là đang đo bằng thước của bản cũ.
  await p.waitForTimeout(22000);
  const botRes = await p.evaluate(() => {
    const b = DP.UI.battle;
    return { hp: b ? (b.boss ? b.boss.hp : 0) : 0, alive: !!(b && b.running), finished: !b || !b.running };
  });
  await p.evaluate(() => DPBot.off());
  check('bot đánh boss có tiến triển', botRes.finished || botRes.hp < hp0 * 0.88,
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
      skill0: r(q('hSkill0')), skill1: r(q('hSkill1')),
      orb: r(q('hOrb')), hp: r(q('hPHp')), timer: r(q('hTimer')),
      hudOn: q('hud').classList.contains('on')
    };
  });
  check('HUD trận đang bật', hud.hudOn);
  check('thanh máu boss nằm trên cùng', hud.bossBar.y < 60, 'y=' + Math.round(hud.bossBar.y));
  check('thanh gục nằm NGAY DƯỚI thanh máu boss (đúng bản gốc)',
    hud.fatigue.y > hud.bossBar.y && hud.fatigue.y - (hud.bossBar.y + hud.bossBar.h) < 8,
    'cách ' + Math.round(hud.fatigue.y - hud.bossBar.y - hud.bossBar.h) + 'px');
  check('nút kỹ năng nằm ở MÉP PHẢI', hud.skill0.x > 440 && hud.skill1.x > 440,
    'x=' + Math.round(hud.skill0.x));
  check('viên hệ ở góc dưới trái', hud.orb.x < 40 && hud.orb.y > 800,
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
  for (const s of ['home', 'quest', 'armory', 'gacha', 'more', 'forge', 'shop', 'help', 'bosslist']) {
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

  /* --------------------------------------------------- NHÂN VẬT (NPC) --- */
  // Trục mới của game: gacha ra NGƯỜI, mỗi người gắn cứng một lớp vũ khí và giữ
  // trang bị riêng, mang ba người vào ải và đổi giữa trận. Mấy luật dưới đây là
  // thứ giữ cho cái trục đó không tự tháo ra.
  results.push('\n── nhân vật ──');
  const hero = await p.evaluate(() => {
    const S = DP.UI.save, A = DP.Atlas;
    const missSpr = DP.HEROES.filter(d => !A.get('heroes.' + d.id + '.idle') ||
                                          !A.get('heroes.' + d.id + '.run')).map(d => d.id);
    const badCls = DP.HEROES.filter(d => !DP.WEAPONS[d.wclass]).map(d => d.id);
    const badEl  = DP.HEROES.filter(d => !DP.ELEMENTS[d.el]).map(d => d.id);
    // gacha: 200 lần quay, phải KHÔNG đẻ thêm món đồ nào vào túi
    const gear0 = S.gear.length;
    const res = DP.summonHeroes(S, 200, false);
    const ranks = {};
    res.forEach(r => { ranks[r.rank] = (ranks[r.rank] || 0) + 1; });
    return {
      total: DP.HEROES.length, missSpr, badCls, badEl,
      gearGrew: S.gear.length - gear0,
      ranks, owned: S.heroes.length,
      classes: new Set(DP.HEROES.map(d => d.wclass)).size
    };
  });
  check('43 nhân vật, ai cũng có ảnh đứng và ảnh chạy',
    hero.missSpr.length === 0, hero.missSpr.length ? 'thiếu: ' + hero.missSpr.join(',') : hero.total + ' người');
  check('nhân vật nào cũng có lớp vũ khí và hệ hợp lệ',
    hero.badCls.length === 0 && hero.badEl.length === 0,
    (hero.badCls.concat(hero.badEl).join(',')) || 'ok');
  check('đủ cả sáu lớp vũ khí trong dàn nhân vật', hero.classes === 6, hero.classes + ' lớp');
  check('gacha KHÔNG còn đẻ ra trang bị', hero.gearGrew === 0, 'túi tăng ' + hero.gearGrew + ' món');
  check('quay 200 lần ra đủ bốn hạng', Object.keys(hero.ranks).length === 4, JSON.stringify(hero.ranks));

  const eqr = await p.evaluate(() => {
    const S = DP.UI.save;
    const sw = DP.HEROES.find(d => d.wclass === 'rifle');
    const bw = DP.HEROES.find(d => d.wclass === 'bow');
    let h1 = S.heroes.find(h => h.id === sw.id) || (S.heroes.push(DP.mkHero(sw.id)), S.heroes[S.heroes.length - 1]);
    let h2 = S.heroes.find(h => h.id === bw.id) || (S.heroes.push(DP.mkHero(bw.id)), S.heroes[S.heroes.length - 1]);
    const gSword = S.gear.find(g => g.kind === 'weapon' && g.wclass === 'rifle');
    const gHead = S.gear.find(g => g.kind === 'head');
    const okRight = DP.equipOn(S, h1, gSword);
    const okWrong = DP.equipOn(S, h2, gSword);          // cung không cầm được súng trường
    // một món chỉ nằm ở MỘT người
    DP.equipOn(S, h1, gHead); DP.equipOn(S, h2, gHead);
    const onlyOne = (h1.gear.head !== gHead.uid) && (h2.gear.head === gHead.uid);
    return { okRight, okWrong, onlyOne, holder: (DP.holderOf(S, gHead.uid) || {}).uid === h2.uid };
  });
  check('vũ khí chỉ lắp được cho nhân vật ĐÚNG LỚP', eqr.okRight && !eqr.okWrong,
    'đúng lớp=' + eqr.okRight + ' sai lớp=' + eqr.okWrong);
  check('một món chỉ nằm ở MỘT người', eqr.onlyOne && eqr.holder);

  const swi = await p.evaluate(() => {
    const S = DP.UI.save;
    // ba người ba lớp khác nhau vào đội hình
    const want = ['rifle', 'launcher', 'bow'];
    want.forEach((cls, i) => {
      const d = DP.HEROES.find(x => x.wclass === cls);
      let h = S.heroes.find(x => x.id === d.id);
      if (!h) { h = DP.mkHero(d.id); S.heroes.push(h); }
      S.party[i] = h.uid;
    });
    DP.UI.startStage('tior-1');
    const b = DP.UI.battle, out = [];
    for (let i = 0; i < 3; i++) {
      b.setHero(i, true);
      out.push({ n: (b.heroDef || {}).n, cls: b.wp.wclass, hp: b.player.maxHp,
                 sk: b.skillList().map(x => x.n).join('+') });
    }
    return out;
  });
  check('đổi khe = đổi NGƯỜI: ba khe ra ba lớp vũ khí khác nhau',
    new Set(swi.map(x => x.cls)).size === 3, swi.map(x => x.n + '/' + x.cls).join(' | '));
  check('đổi người thì bộ kỹ năng cũng đổi theo',
    new Set(swi.map(x => x.sk)).size === 3, swi.map(x => x.sk).join(' | '));

  // Hồ sơ cũ (ba khe vũ khí của MỘT người) phải nạp được thành đội hình ba người.
  const mig = await p.evaluate(() => {
    const legacy = DP.newSave('Cũ');
    legacy.gear = []; legacy.heroes = []; legacy.party = [null, null, null];
    const w = DP.forgeGear('vaccahorn', 'weapon', 'legacy');
    w.wclass = 'great'; legacy.gear.push(w);
    legacy.loadout = { weapons: [w.uid, null, null], head: null, body: null, arm: null, leg: null };
    delete legacy.heroes;
    DP.migrateHeroes(legacy);
    const p0 = DP.party(legacy).filter(Boolean);
    return { n: p0.length, cls: p0.map(h => (DP.heroDef(h) || {}).wclass),
             keptWeapon: p0.some(h => h.gear.weapon === w.uid) };
  });
  check('hồ sơ cũ nạp lên thành đội hình ba người', mig.n === 3, JSON.stringify(mig.cls));
  check('hồ sơ cũ: cây đang cầm về đúng tay người cùng lớp', mig.keptWeapon);

  /* ------------------------------------------------------ BỘ ẢNH ------- */
  // Luật của đường ống art: đổi art = thay PNG + sửa asset-map, KHÔNG đụng code.
  // Luật đó chỉ đứng được khi mọi khoá mà code hỏi tới đều CÓ ảnh. Chỗ dễ thủng
  // nhất là bảng vũ khí: 5 lớp x 7 hệ = 35 ô, thiếu một ô là cây đó rơi về hình
  // học trong khi mấy cây kia đã là ảnh — lệch hẳn mà không báo lỗi gì.
  results.push('\n── bộ ảnh ──');
  const art = await p.evaluate(() => {
    const A = DP.Atlas, out = { rep: A.report(), miss: [], bad: [] };
    DP.WEAPON_ORDER.forEach(c =>
      ['none', 'thunder', 'fire', 'water', 'earth', 'light', 'dark'].forEach(e => {
        const k = 'weapons.' + c + '.' + e, en = A.get(k);
        if (!en) out.miss.push(k);
        else if (!en.len || !en.img) out.bad.push(k);
      }));
    return out;
  });
  // 56 Behemoth chỉ có ngần này DÁNG THÂN; thiếu một dáng là cả họ đó rơi về
  // hình học trong khi mấy họ kia đã lên ảnh — lệch mà không báo lỗi gì.
  const boss = await p.evaluate(() => {
    const A = DP.Atlas, need = {}, miss = [];
    DP.BEHEMOTHS.forEach(b => { need[b.body] = 1; });
    Object.keys(need).forEach(b => { if (!A.get('bosses.' + b + '.idle')) miss.push(b); });
    return { shapes: Object.keys(need).length, miss: miss };
  });
  check('mọi dáng thân Behemoth đều có ảnh', boss.miss.length === 0,
    boss.miss.length ? 'thiếu: ' + boss.miss.join(', ') : boss.shapes + ' dáng');

  // Bộ trưng bày: bấm hai lần không được nhân bản, và phải mở đủ hai kỹ năng.
  const sc = await p.evaluate(() => {
    const S = DP.UI.save;
    const a = DP.grantShowcase(S).length, b2 = DP.grantShowcase(S).length;
    const w = S.gear.filter(g => g.show);
    return { a: a, b: b2, n: w.length,
             allMax: w.every(g => g.lv === DP.MAX_LV && g.evo === DP.MAX_EVO),
             allTwo: w.every(g => DP.weaponProfile(S, g).skills.length === 2),
             classes: new Set(w.map(g => g.wclass)).size };
  });
  check('bộ trưng bày: 6 cây, bấm lần hai không nhân bản',
    sc.a === 6 && sc.b === 0 && sc.n === 6, JSON.stringify(sc));
  // Bộ trưng bày phải phủ ĐỦ SÁU LỚP — nếu không thì có lớp người chơi không bao
  // giờ được cầm thử.
  check('bộ trưng bày: cây nào cũng tối cấp và mở đủ hai kỹ năng',
    sc.allMax && sc.allTwo && sc.classes === 6, sc.classes + ' lớp');

  check('mọi ảnh trong asset-map đều nạp được', art.rep.loaded === art.rep.total,
    art.rep.loaded + '/' + art.rep.total);
  check('đủ 42 biểu tượng vũ khí (6 lớp x 7 hệ)', art.miss.length === 0,
    art.miss.length ? 'thiếu: ' + art.miss.slice(0, 5).join(', ') : '42/42');
  check('biểu tượng vũ khí nào cũng có ảnh và có chiều dài khi cầm',
    art.bad.length === 0, art.bad.slice(0, 5).join(', ') || 'ok');

  // -------------------------------------------------------------- LỖI JS
  results.push('\n── console ──');
  check('không có lỗi JavaScript', errs.length === 0, errs.slice(0, 3).join(' | '));

  await ctx.close(); await b.close();

  console.log(results.join('\n'));
  console.log('\n' + pass + ' đạt, ' + fail + ' hỏng.');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
