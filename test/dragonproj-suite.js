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

const DP_AIR = 1.4;
const DP_ULTI_SEC = 11;   // G.ULTI.sec, chỉ dùng để in nhãn   // FEEL.airDmgMul, chỉ dùng để in nhãn cho dễ đọc

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
    banners: DP.BANNERS.length,
    evolTracks: DP.EVOL.tracks.length,
    bossRates: DP.BEHEMOTH_RATES,
    elemFx: Object.keys(DP.ELEM_FX).length,
    // Hệ nguyên liệu, cốt truyện và nhiệm vụ ngày/tuần đã BỎ HẲN. Kiểm cả việc
    // chúng biến mất: để lại một bảng mồ côi mà không ai đọc là để lại một lời
    // nói dối trong dữ liệu, và lần sau có người sẽ tin nó.
    // `IAP` đã ra khỏi danh sách này: quầy nạp GIẢ được dựng lại có chủ ý, để
    // thử game cho nhanh và để nhìn thấy cái giá của mô hình quay số. Nó là một
    // bảng sống, không phải một bảng mồ côi.
    gone: ['MATERIALS', 'STORY', 'DAILY', 'WEEKLY', 'SHOP', 'MEDAL_SHOP',
           'PIKKE_BUY', 'GATHER_MATS', 'DROP_NORMAL'].filter(k => DP[k] !== undefined),
    iap: { gem: DP.IAP.gem.length, gold: DP.IAP.gold.length,
           // Bậc thang phải LÊN theo tiền: gói to phải lời hơn gói nhỏ, không
           // thì cả bảng chỉ là mấy con số ngẫu nhiên đội lốt một quầy nạp.
           rising: DP.IAP.gem.every((pk, i, a) =>
             i === 0 || pk.gem / pk.usd >= a[i - 1].gem / a[i - 1].usd) },
    elem: [DP.elemMult('water', 'fire'), DP.elemMult('fire', 'water'), DP.elemMult('fire', 'earth')]
  }));
  check('quầy nạp giả có đủ hai bảng gói và bậc thang lên đúng chiều',
    d.iap.gem === 6 && d.iap.gold === 4 && d.iap.rising,
    JSON.stringify(d.iap));
  check('14 lớp vũ khí bắn', d.weapons === 14, d.weapons + '');
  check('đủ Behemoth (>=50)', d.behemoths >= 50, d.behemoths + ' con');
  check('đủ kỹ năng (2 mỗi lớp, 28 đòn)', d.skills === 28, d.skills + ' đòn');
  check('8 vùng đất', d.areas === 8, d.areas + '');
  check('ba banner: nhân vật / vũ khí / tiêu chuẩn', d.banners === 3, d.banners + '');
  check('Tiến Hoá có bốn nhánh', d.evolTracks === 4, d.evolTracks + '');
  check('hệ nguyên liệu / cốt truyện / nhiệm vụ ngày đã bỏ HẲN',
    d.gone.length === 0, 'còn sót: ' + d.gone.join(','));
  check('tỉ lệ gacha boss đúng wiki (3/15/55/27)',
    d.bossRates.SS === 0.03 && d.bossRates.S === 0.15 && d.bossRates.A === 0.55 && d.bossRates.B === 0.27);
  check('đủ bảng nguyên tố cho lớp VFX', d.elemFx === 7, d.elemFx + ' hệ');
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
    // Trong CÙNG một lớp thì hai đòn không được trùng trình phát — trùng là lớp
    // đó chỉ có một đòn được vẽ hai lần.
    const dupInClass = DP.WEAPON_ORDER.filter(k => {
      const c = DP.skillsOf(k).map(x => x.kind);
      return new Set(c).size !== c.length;
    });
    // Mỗi đòn phải khai báo dáng ngắm, và chỉ được là một trong ba dáng.
    const badAim = DP.WEAPON_ORDER.reduce((a, k) => a.concat(
      DP.skillsOf(k).filter(x => ['self', 'dir', 'point'].indexOf(x.aim) < 0).map(x => x.id)), []);
    // Trình phát nằm trên Battle.prototype; ở bước này chưa vào trận nào nên lấy
    // qua DP.Battle (lớp), không qua một thể hiện.
    const proto = (DP.Battle && DP.Battle.prototype) || {};
    const missing = uniq.filter(k => typeof proto['sk_' + k] !== 'function');
    return { lo, hi, perWeapon, uniqueKinds: uniq.length,
             missingRunners: missing.length, missing: missing,
             dupInClass: dupInClass, badAim: badAim };
  });
  check('mỗi vũ khí đúng 2 kỹ năng', sk.perWeapon.every(n => n === 2), sk.perWeapon.join('/'));
  check('kỹ năng thứ hai mở theo cấp vũ khí', sk.lo === 1 && sk.hi === 2, sk.lo + ' -> ' + sk.hi);
  /* Đây là phép kiểm chống lại đúng cái đã giết hệ Magi cũ: bốn mươi viên dùng
   * chung ba đoạn code. Hai mươi đòn phải là ít nhất mười tám trình phát.
   *
   * Vì sao KHÔNG đòi đủ hai mươi: hai cặp dùng chung kind một cách CÓ CHỦ Ý —
   * Phá Cửa (súng săn) và Nhất Tuyến (kiếm khí) cùng là 'rush', Vòng Mảnh và
   * Vòng Tử cùng là 'ring'. Hai cặp đó khác nhau ở tầm, ở số mảnh và ở việc có
   * khung bất tử hay không, tức là khác nhau ở SỐ chứ không ở hình. Cái phải
   * cấm tuyệt đối là trùng trong CÙNG MỘT LỚP — hai đòn của một cây mà vẽ ra
   * giống nhau thì cây đó chỉ có một đòn. */
  check('hai mươi kỹ năng là ít nhất MƯỜI TÁM trình phát khác nhau',
    sk.uniqueKinds >= 18, sk.uniqueKinds + ' kind');
  check('không lớp nào có hai đòn trùng trình phát',
    sk.dupInClass.length === 0, sk.dupInClass.join(','));
  check('đòn nào cũng khai báo dáng ngắm hợp lệ',
    sk.badAim.length === 0, sk.badAim.join(','));
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
  // Cung KHÔNG còn nạp lực: cử chỉ giữ đã thuộc hẳn về ulti. Giữ cung giờ là
  // ghì súng như mọi cây không tự động khác.
  check('GIỮ cung = ghì súng (cung không còn nạp lực)', holds.bow === 'steady', holds.bow);
  check('GIỮ cây còn lại = ghì súng', holds.sniper === 'steady', holds.sniper);
  await p.waitForTimeout(500);

  /* ================= KỸ NĂNG: NGẮM RỒI THẢ =================
   * Hồi chiêu CHÍNH LÀ thanh nạp. Nút sáng thì bấm là chắc chắn ra đòn; kéo ngón
   * là chỉ hướng; thả không kéo thì tự ngắm con gần nhất. Không còn pha "giữ đủ
   * lâu mới tính" — nên cái phải đo là: chưa hồi xong thì KHÔNG vào được thế
   * ngắm, huỷ thì KHÔNG mất gì, và hướng ngón kéo phải thật sự đi vào đòn. */
  const cast = await p.evaluate(async () => {
    const b = DP.UI.battle, pl = b.player;
    const sk = b.skillDef(0);
    pl.state = 'idle'; pl.skCd = [0, 0]; pl.usedSkill = false;

    // (a) huỷ giữa chừng: không xả, và KHÔNG mất hồi chiêu
    const okStart = b.skillAimStart(0);
    const aiming = b.skillAiming();
    b.skillAimMove(0, -70);
    b.skillAimCancel();
    const afterCancel = { used: pl.usedSkill, cd: b.skillCdLeft(0), aiming: b.skillAiming() };

    // (b) đang hồi chiêu thì không vào được thế ngắm
    pl.skCd[0] = 5000;
    const blocked = b.skillAimStart(0);
    pl.skCd = [0, 0];

    // (c) bấm - kéo lên trên - thả: xả thật, mặt quay đúng hướng ngón kéo
    b.skillAimStart(0);
    b.skillAimMove(0, -70);
    const fired = b.skillAimEnd();
    return { okStart, aiming, afterCancel, blocked, fired,
             facing: pl.facing, used: pl.usedSkill,
             cdAfter: b.skillCdLeft(0), full: b.skillCdOf(sk) };
  });
  check('nút sáng thì vào được thế ngắm', cast.okStart === true && cast.aiming === 0);
  check('huỷ ngắm thì KHÔNG xả và KHÔNG mất hồi chiêu',
    cast.afterCancel.used === false && cast.afterCancel.cd === 0 && cast.afterCancel.aiming === -1);
  check('đang hồi chiêu thì không bấm được', cast.blocked === false);
  check('kéo rồi thả thì xả được kỹ năng', cast.fired === true && cast.used === true);
  check('hướng xả bám theo hướng ngón kéo',
    Math.abs(cast.facing - (-Math.PI / 2)) < 0.02, 'facing=' + cast.facing.toFixed(2));
  check('xả xong vào hồi chiêu đầy', Math.abs(cast.cdAfter - cast.full) < 2,
    Math.round(cast.cdAfter) + 'ms');

  /* ==================== THANH ULTI + XẢ BẰNG PUNICON =====================
   * Kỹ năng không còn nút HUD nào. Toàn bộ cách xả là một cử chỉ trên SÂN:
   * giữ ngón -> kéo chỉ hướng -> thả. Nên phép kiểm phải đi bằng chuột thật
   * trên canvas, không phải bằng lời gọi hàm — cử chỉ sống hay chết ở đúng chỗ
   * đó, và mọi lần hỏng trước nay đều hỏng ở tầng sự kiện chứ không ở tầng logic.
   *
   * Bốn chuyện phải đúng:
   *   1. chưa đủ nạp -> giữ vẫn là đòn đặc thù của vũ khí, KHÔNG phải ulti
   *   2. đủ nạp     -> giữ vào thế ngắm, kéo thì hướng bám theo ngón
   *   3. thả        -> xả thật, và thanh nạp bị TRỪ đúng giá
   *   4. huỷ        -> không xả, và KHÔNG mất thanh
   * ==================================================================== */
  results.push('\n── thanh ulti + cử chỉ punicon ──');
  const CV = await p.evaluate(() => {
    const r = document.getElementById('view').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height * 0.62 };
  });

  // (1) thanh còn cạn: giữ ra ĐÒN ĐẶC THÙ của cây, không phải ulti
  await p.evaluate(() => { const b = DP.UI.battle; b.player.ulti = 0; b.player.state = 'idle'; });
  await p.mouse.move(CV.x, CV.y); await p.mouse.down();
  await p.waitForTimeout(340);
  const lowState = await p.evaluate(() => DP.UI.battle.player.state);
  await p.mouse.up(); await p.waitForTimeout(120);
  check('thanh chưa đủ thì giữ VẪN là đòn đặc thù của vũ khí, không phải ulti',
    lowState !== 'ultiaim', 'state=' + lowState);

  // (2)(3) thanh đầy: giữ -> ngắm, kéo -> xoay hướng, thả -> xả và trừ thanh
  await p.evaluate(() => {
    const b = DP.UI.battle, pl = b.player;
    pl.ulti = 1; pl.state = 'idle'; pl.skCd = [0, 0]; pl.usedSkill = false;
  });
  await p.mouse.move(CV.x, CV.y); await p.mouse.down();
  await p.waitForTimeout(340);
  const held = await p.evaluate(() => ({ st: DP.UI.battle.player.state,
                                         aim: DP.UI.battle.skillAiming() }));
  await p.mouse.move(CV.x, CV.y - 90, { steps: 6 });
  await p.waitForTimeout(90);
  const aimA = await p.evaluate(() => DP.UI.battle.player.skAim
    ? DP.UI.battle.player.skAim.a : null);
  await p.mouse.up(); await p.waitForTimeout(200);
  const done = await p.evaluate(() => {
    const b = DP.UI.battle, pl = b.player;
    return { st: pl.state, used: pl.usedSkill, ulti: pl.ulti,
             facing: pl.facing, cost: DP.ULTI.cost[0] };
  });
  check('nạp đầy thì GIỮ trên sân là vào thế ngắm ulti',
    held.st === 'ultiaim' && held.aim === 0, JSON.stringify(held));
  check('kéo ngón lên trên thì hướng ngắm quay lên trên',
    aimA !== null && Math.abs(aimA - (-Math.PI / 2)) < 0.05, 'a=' + aimA);
  check('thả ngón thì XẢ thật và mặt quay đúng hướng đã kéo',
    done.used === true && Math.abs(done.facing - (-Math.PI / 2)) < 0.05,
    'facing=' + (done.facing || 0).toFixed(2));
  check('xả xong thì TRỪ đúng giá trên thanh nạp',
    Math.abs(done.ulti - (1 - done.cost)) < 0.001,
    'còn ' + done.ulti.toFixed(3) + ', giá ' + done.cost);
  check('xả xong thì thoát khỏi thế ngắm', done.st !== 'ultiaim', done.st);

  // (4) huỷ giữa chừng: không xả, không mất thanh
  const cancelled = await p.evaluate(() => {
    const b = DP.UI.battle, pl = b.player;
    pl.ulti = 1; pl.state = 'idle'; pl.skCd = [0, 0]; pl.usedSkill = false;
    b.holdStart(0, 0);
    const mid = pl.state;
    b.holdCancel();
    return { mid: mid, st: pl.state, used: pl.usedSkill, ulti: pl.ulti };
  });
  check('huỷ lúc đang ngắm thì KHÔNG xả và KHÔNG mất thanh nạp',
    cancelled.mid === 'ultiaim' && cancelled.used === false &&
    cancelled.ulti === 1 && cancelled.st !== 'ultiaim', JSON.stringify(cancelled));

  // Tốc độ nạp phải NHƯ NHAU giữa mười bốn lớp — nếu không thì cây bắn nhanh có ulti
  // gấp mấy lần cây bắn chậm, và cả bảng cân bằng vũ khí đổ theo.
  const fill = await p.evaluate(() => {
    const b = DP.UI.battle, out = {};
    DP.WEAPON_ORDER.forEach(c => {
      b.W = DP.WEAPONS[c];
      // giây bắn trúng liên tục để đầy thanh = 1 / (nhịp trúng mỗi giây * mỗi cú)
      const W = DP.WEAPONS[c];
      const hitsPerSec = Math.max(0.2, (W.rpm || 120) / 60) * Math.max(1, W.shots || 1);
      out[c] = +(1 / (b.ultiPerHit() * hitsPerSec)).toFixed(2);
    });
    const vals = Object.keys(out).map(k => out[k]);
    return { out, min: Math.min.apply(null, vals), max: Math.max.apply(null, vals) };
  });
  check('mười bốn lớp nạp đầy thanh trong cùng một khoảng thời gian',
    Math.abs(fill.max - fill.min) < 0.05 && Math.abs(fill.max - DP_ULTI_SEC) < 0.05,
    fill.min + 's – ' + fill.max + 's');


  /* ====== MƯỜI BỐN LỚP ĐỀU RA SÁT THƯƠNG, HAI MƯƠI TÁM ĐÒN ĐỀU XẢ ĐƯỢC ===
   * Bốn lớp mới không bắn ra viên đạn nào theo nghĩa cũ: tia nhiệt là một đoạn
   * thẳng chạm tức thời, lưỡi hái là ba thực thể xoay quanh người, cầu lửa bay
   * trên không và chỉ nổ khi chạm đất. Ba đường đó đi qua ba hàm khác nhau, và
   * không hàm nào chạy qua vòng lặp đạn thẳng cũ — nên "bảng số đẹp" không nói
   * lên được gì cả. Phép kiểm này bắn thật vào một con quái bất tử rồi đo máu.
   * ==================================================================== */
  await p.waitForTimeout(400);
  const allW = await p.evaluate(async () => {
    const b = DP.UI.battle, pl = b.player, out = {};
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (const k of DP.WEAPON_ORDER) {
      b.mobs.length = 0; b.projs.length = 0;
      b.W = DP.WEAPONS[k];
      b.wp = { wclass: k, el: 'none', wtype: 'normal', patk: 0, eatk: 0, extra: {}, skills: DP.skillsOf(k) };
      const m = b.makeMob('purun', 5, false, false);
      // Con bia đứng SÁT NGƯỜI: lưỡi hái chỉ với tới 76px, mà cầu lửa lại có tầm
      // rơi tối thiểu 90px — đặt ở 60px là chỗ duy nhất cả mười cây đều chạm tới.
      m.hp = m.maxHp = 9e9; m.x = pl.x + 60; m.y = pl.y; m.agro = 1;
      b.mobs.push(m);
      pl.state = 'idle'; pl.moving = false; pl.beamTicks = 0; pl.bloom = 0;
      pl.facing = 0;
      const hp0 = m.hp;
      // Bắn vài nhịp: cây nào cũng phải ra sát thương trong vòng một giây, kể cả
      // cây phải chờ đạn bay (cầu lửa) hay chờ lưỡi xoay tới (lưỡi hái).
      for (let i = 0; i < 6; i++) { b.fire({}); await sleep(30); }
      await sleep(700);
      out[k] = { dealt: hp0 - m.hp, projs: b.projs.length };
    }
    return out;
  });
  const wZero = Object.keys(allW).filter(k => !(allW[k].dealt > 0));
  check('cả mười bốn lớp đều thật sự gây được sát thương', wZero.length === 0,
    wZero.length ? 'câm: ' + wZero.join(',')
                 : Object.keys(allW).map(k => k + ' ' + Math.round(allW[k].dealt)).join(' · '));

  const allSk = await p.evaluate(async () => {
    const b = DP.UI.battle, pl = b.player, bad = [], noCd = [];
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (const k of DP.WEAPON_ORDER) {
      b.W = DP.WEAPONS[k];
      b.wp = { wclass: k, el: 'none', wtype: 'normal', patk: 0, eatk: 0, extra: {}, skills: DP.skillsOf(k) };
      const list = DP.skillsOf(k);
      for (let i = 0; i < list.length; i++) {
        b.mobs.length = 0;
        const m = b.makeMob('purun', 5, false, false);
        m.hp = m.maxHp = 9e9; m.x = pl.x + 120; m.y = pl.y; m.agro = 1;
        b.mobs.push(m);
        pl.state = 'idle'; pl.moving = false; pl.skCd = [0, 0]; pl.usedSkill = false;
        pl.hp = pl.maxHp; pl.shield = 0;
        try {
          if (!b.skillAimStart(i)) { bad.push(k + '#' + i + ':không-bấm-được'); continue; }
          b.skillAimMove(70, 0);
          b.skillAimEnd();
          // Chạy vài chục khung để trình phát diễn hết: đòn nào treo hoặc nổ ở
          // giữa chừng thì lỗi rơi ra ở đây chứ không ở lúc bấm.
          for (let f = 0; f < 90; f++) b.update(16.7);
        } catch (e) {
          bad.push(k + '#' + i + ':' + e.message);
          continue;
        }
        if (!(b.skillCdLeft(i) > 0)) noCd.push(k + '#' + i);
      }
    }
    return { bad, noCd };
  });
  check('cả hai mươi kỹ năng xả được mà không nổ', allSk.bad.length === 0, allSk.bad.join(' | '));
  check('xả xong đòn nào cũng vào hồi chiêu', allSk.noCd.length === 0, allSk.noCd.join(','));

  /* ============ KHÔNG CÓ LÊN CẤP TRONG TRẬN =============================
   * Khối phép kiểm cũ đo EXP lượt chơi, mười lăm lá cường hoá và màn bốc ba lá.
   * Cả ba thứ đã gỡ, nên chỗ này đổi thành phép kiểm NGƯỢC: khẳng định chúng
   * KHÔNG quay lại.
   *
   * Xoá phép kiểm cũ mà không đặt gì vào chỗ đó thì lần sau ai đó thêm lại một
   * "hệ cường hoá nhỏ thôi" sẽ không có gì cản. Sức mạnh chốt ở màn chuẩn bị là
   * một quyết định thiết kế, và một quyết định thiết kế cần một phép kiểm giữ.
   * ==================================================================== */
  results.push('\n-- khong co len cap trong tran --');
  const noRun = await p.evaluate(() => {
    const b = DP.UI.battle;
    return {
      api: ['runGain', 'openDraft', 'takePerk', 'applyPerk', 'perkSum', 'grantPerk']
             .filter(k => typeof b[k] === 'function'),
      data: ['PERKS', 'RUN', 'perkById'].filter(k => DP[k] !== undefined),
      dom: ['hDraft', 'hRunBar', 'hRunLv', 'hRunFill']
             .filter(id => !!document.getElementById(id)),
      state: ['runLv', 'runExp'].filter(k => b.player[k] !== undefined)
    };
  });
  check('động cơ không còn hàm nào của hệ cường hoá',
    noRun.api.length === 0, noRun.api.join(', ') || 'sạch');
  check('dữ liệu không còn bảng lá bài nào',
    noRun.data.length === 0, noRun.data.join(', ') || 'sạch');
  check('HUD không còn thanh EXP lượt chơi hay màn bốc bài',
    noRun.dom.length === 0, noRun.dom.join(', ') || 'sạch');
  check('người chơi không mang chỉ số cấp-trong-trận nào',
    noRun.state.length === 0, noRun.state.join(', ') || 'sạch');

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
      // range PHẢI là hệ quả của spd x life với mọi cây BẮN RA ĐẠN. Ba lớp không
      // có viên đạn nào (tia, lưỡi xoay, cầu ném) thì tầm là một trường khai báo
      // của riêng chúng — nhưng chúng phải khai báo nó, không được để 0.
      rangeDerived: ks.every(k => {
        const W = DP.WEAPONS[k];
        if (W.mode) return W.range > 0;
        return Math.abs(W.range - W.spd * W.life / 16.67) < 1.5;
      })
    };
  });
  check('DPS bền của mười bốn lớp nằm trong dải hẹp (<= 2,2 lần)', sets.dpsBand <= 2.2,
    sets.dpsBand.toFixed(2) + 'x');
  check('burst mỗi lần bấm thì chênh nhiều (>= 3 lần)', sets.burstBand >= 3,
    sets.burstBand.toFixed(2) + 'x');
  check('mười bốn lớp mười bốn tầm bắn khác nhau', sets.uniqueRange === 14, sets.uniqueRange + '');
  check('mười bốn lớp: không hai cây nào chung nhịp bắn', sets.uniqueRpm === 14, sets.uniqueRpm + '');
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

  // Cả mười bốn lớp phát sẵn từ đầu.
  const kit = await p.evaluate(() => {
    const s = DP.starterKit(DP.newSave('T'));
    const cls = s.gear.filter(g => g.kind === 'weapon').map(g => g.wclass);
    const eq = DP.equipped(s).weapons.filter(Boolean).length;
    return { n: new Set(cls).size, eq: eq };
  });
  check('phát sẵn đủ mười bốn lớp vũ khí', kit.n === 14, kit.n + ' cây');
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
  // Gem sau ải phải khớp CHÍNH XÁC bảng G.REWARD — nền theo vị trí ải cộng phần
  // thưởng điều kiện. Kiểm bằng đẳng thức chứ không bằng một dải: một dải rộng
  // sẽ vẫn xanh khi bảng thưởng bị chỉnh lệch đi vài chục phần trăm.
  const wantBase = await p.evaluate(i => DP.REWARD.firstGem(i), win.stageIdx);
  const wantCond = await p.evaluate(n =>
    n * DP.REWARD.condGem + (n === 3 ? DP.REWARD.allCondGem : 0), win.nCond);
  check('gem nền lần đầu đúng bảng thưởng theo vị trí ải', win.gemBase === wantBase,
    win.gemBase + ' vs ' + wantBase);
  check('gem điều kiện đúng bảng thưởng', win.gemCond === wantCond,
    win.gemCond + ' vs ' + wantCond + ' (' + win.nCond + '/3 điều kiện)');
  check('tổng gem = nền + điều kiện', win.gems === win.gemBase + win.gemCond, win.gems + ' gem');
  check('trùm rơi Gold, không rơi nguyên liệu', win.bossGold > 0, win.bossGold + ' gold');
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
    s.gold = 9e7;
    const g = DP.forgeGear('amarok', 'weapon', 'x');
    s.gear.push(g);
    const lv0 = DP.gearStats(g).patk;
    for (let i = 0; i < 5; i++) DP.enhance(s, g);
    const lv5 = DP.gearStats(g).patk;

    // ĐỘT PHÁ ăn ĐỒ. Không có đồ để nướng thì phải TỪ CHỐI, kể cả khi thừa gold —
    // đó là toàn bộ điểm khác biệt so với bậc nâng cấp bên trên.
    const beforeLb = DP.gearStats(g).patk;
    const empty = DP.limitBreak(s, g, []);
    const pool0 = DP.fodderFor(s, g).length;
    // nướng đúng số món cần: hạng SS trở lên, chưa lắp lên ai
    for (let i = 0; i < 3; i++) {
      const f = DP.forgeGear('amarok', 'head', 'f' + i);
      f.rank = 'SS'; s.gear.push(f);
    }
    const pool1 = DP.fodderFor(s, g).length;
    const need = DP.breakFodder(g);
    const pick = DP.fodderFor(s, g).slice(0, need.n).map(x => x.uid);
    const nGear0 = s.gear.length;
    const okLb = DP.limitBreak(s, g, pick);
    const afterLb = DP.gearStats(g).patk;
    // món đã nướng phải BIẾN MẤT khỏi túi
    const burned = nGear0 - s.gear.length;
    const gone = pick.every(u => !s.gear.some(x => x.uid === u));

    // Món ĐANG LẮP LÊN NGƯỜI không được nằm trong danh sách nướng. Đây là chỗ
    // duy nhất trong game xoá vĩnh viễn một món, và không có nút hoàn tác.
    const worn = s.gear.filter(x => DP.holderOf(s, x.uid));
    const wornOffered = worn.some(w => DP.fodderFor(s, g).some(x => x.uid === w.uid));

    return { grew: lv5 > lv0, lbGrew: afterLb > beforeLb, lb: g.lb,
             emptyRejected: empty.ok === false, okLb: okLb.ok === true,
             pool0, pool1, burned, gone, need: need.n, wornOffered, wornN: worn.length };
  });
  check('nâng cấp làm tăng chỉ số', forge.grew);
  check('đột phá KHÔNG có đồ để nướng thì từ chối', forge.emptyRejected);
  check('đột phá bằng đồ trùng làm tăng chỉ số', forge.okLb && forge.lbGrew && forge.lb === 1);
  check('món đem nướng biến mất khỏi túi', forge.burned === forge.need && forge.gone,
    'nướng ' + forge.burned + '/' + forge.need);
  check('món ĐANG LẮP không bao giờ được đề nghị đem nướng',
    forge.wornN > 0 && forge.wornOffered === false, forge.wornN + ' món đang lắp');

  // Tinh luyện chỉ mở bằng Lõi Rồng, mà Lõi Rồng thì không cày được ở đâu.
  const core = await p.evaluate(() => {
    const s = DP.newSave('T'); s.gold = 9e6;
    const g = DP.forgeGear('amarok', 'weapon', 'e'); g.lv = DP.MAX_LV; s.gear.push(g);
    const noCore = DP.evolve(s, g);
    const cost = DP.evolveCost(g);
    s.core = 999;
    const withCore = DP.evolve(s, g);
    // Lõi Rồng chỉ có MỘT đường vào: quay trúng thứ đã có. Không rơi ở ải, không
    // bán ở tiệm, không nằm trong gói nào.
    const inShop = JSON.stringify(DP.ITEMS).indexOf('core') >= 0;
    const inReward = JSON.stringify(Object.keys(DP.REWARD)).indexOf('core') >= 0;
    const s2 = DP.newSave('T');
    const mob = DP.rollMobDrop('purun', true, true, 99, 40);
    const boss = DP.rollBossDrop(DP.behemothById('amarok'), 4, 99, 60);
    return { noCore: noCore.ok, withCore: withCore.ok, needsCore: cost.core > 0,
             farmable: inShop || inReward || !!mob.core || !!boss.core };
  });
  check('Tinh luyện đòi Lõi Rồng', core.needsCore);
  check('không có Lõi Rồng thì không Tinh luyện được', core.noCore === false);
  check('có Lõi Rồng thì Tinh luyện được', core.withCore === true);
  check('Lõi Rồng KHÔNG cày được: không nằm trong bảng rơi hay quầy nào', core.farmable === false);

  // -------------------------------------------------------------- QUAY
  results.push('\n── ba banner ──');
  const gacha = await p.evaluate(() => {
    const out = {};
    DP.BANNERS.forEach(bn => {
      const s = DP.newSave('T'); s.gem = 9e7;
      const got = { SS: 0, S: 0, A: 0, B: 0 };
      let n = 0, up = 0, maxDry = 0;
      for (let i = 0; i < 300; i++) {
        const r = DP.pull(s, bn.id, 10);
        r.results.forEach(x => { got[x.rank]++; n++; if (x.up) up++; });
        maxDry = Math.max(maxDry, DP.pityOf(s, bn.id).n);
      }
      out[bn.id] = { got, n, up, maxDry, ssPct: got.SS / n * 100,
                     hard: bn.hard, kinds: null };
    });
    return out;
  });
  ['char', 'weapon', 'std'].forEach(id => {
    const g = gacha[id];
    check('banner ' + id + ': ra đủ bốn hạng',
      g.got.SS > 0 && g.got.S > 0 && g.got.A > 0 && g.got.B > 0, JSON.stringify(g.got));
    // PITY CỨNG là lời hứa nặng nhất của một hệ gacha. Nếu chuỗi khô dài hơn mốc
    // cứng dù chỉ một lượt thì lời hứa đó sai, và nó sai một cách người chơi
    // không bao giờ chứng minh được — nên phải kiểm bằng số.
    check('banner ' + id + ': chuỗi khô không bao giờ vượt pity cứng (' + g.hard + ')',
      g.maxDry < g.hard, 'dài nhất ' + g.maxDry);
    check('banner ' + id + ': tỉ lệ SS thật cao hơn tỉ lệ gốc (pity có làm việc)',
      g.ssPct > 2.5, g.ssPct.toFixed(2) + '%');
  });
  check('banner nhân vật: bảo hiểm 50/50 kéo tỉ lệ trúng rate-up lên trên 60%',
    gacha.char.up / gacha.char.got.SS > 0.6,
    (gacha.char.up / gacha.char.got.SS * 100).toFixed(0) + '%');

  const pull1 = await p.evaluate(() => {
    const s = DP.newSave('T');
    s.gem = DP.REWARD.pull - 1;
    const poor = DP.pull(s, 'char', 1);
    const keptAfterPoor = s.gem === DP.REWARD.pull - 1;   // đo NGAY, trước khi nạp lại ví
    s.gem = DP.REWARD.pull10;
    const ten = DP.pull(s, 'char', 10);
    // Quay trúng người ĐÃ CÓ thì đổi thành Lõi Rồng — không có cú quay nào phí.
    const s2 = DP.newSave('T'); s2.gem = 9e6;
    let dup = null;
    for (let i = 0; i < 200 && !dup; i++) {
      const r = DP.pull(s2, 'char', 10);
      dup = r.results.filter(x => x.dupe)[0] || null;
    }
    // Điểm Định Mệnh của banner vũ khí: đổi mục tiêu thì điểm về 0.
    const s3 = DP.newSave('T');
    DP.setFateTarget(s3, DP.bannerById('weapon').featured[0]);
    DP.pityOf(s3, 'weapon').fate = 1;
    DP.setFateTarget(s3, DP.bannerById('weapon').featured[1]);
    const fateReset = DP.pityOf(s3, 'weapon').fate === 0;
    return { poor: poor.ok === false, poorKept: keptAfterPoor,
             ten: ten.ok && ten.results.length === 10, spent: s.gem === 0,
             dup: !!dup, cores: dup ? dup.cores : 0, stock: (s2.core || 0) > 0,
             fateReset };
  });
  check('thiếu Gem thì từ chối và không trừ gì', pull1.poor && pull1.poorKept);
  check('gói mười ra đúng mười món, trừ đúng giá gói', pull1.ten && pull1.spent);
  check('quay trúng thứ ĐÃ CÓ thì đổi thành Lõi Rồng', pull1.dup && pull1.cores >= 1 && pull1.stock,
    pull1.cores + ' lõi/lần trùng');
  check('đổi mục tiêu banner vũ khí thì Điểm Định Mệnh về 0', pull1.fateReset);

  // Quay qua NÚT THẬT trên màn Triệu Hồi.
  await p.evaluate(() => { DP.UI.save.gem = 99999; DP.UI.saveNow(); DP.UI.show('gacha'); });
  await p.waitForTimeout(250);
  const pullUI = await p.evaluate(() => {
    const S = DP.UI.save, g0 = S.gem, n0 = (S.heroes || []).length + S.gear.length;
    document.querySelector('#body-gacha [data-pull="10"]').click();
    const out = document.getElementById('gachaOut');
    return { spent: g0 - S.gem, grew: (S.heroes || []).length + S.gear.length > n0,
             shown: !!out && out.innerText.length > 10,
             tabs: document.querySelectorAll('#body-gacha .tabrow .tab').length };
  });
  check('màn Triệu Hồi có ba tab banner', pullUI.tabs === 3, pullUI.tabs + '');
  check('bấm nút quay mười: trừ đúng gem và hiện kết quả',
    pullUI.spent === 1600 && pullUI.shown, 'trừ ' + pullUI.spent);

  // ------------------------------------------------------------ TIẾN HOÁ
  results.push('\n── Tiến Hoá ──');
  const evol = await p.evaluate(() => {
    /* Đo trên hồ sơ TRẦN (chưa lắp giáp). Tiến Hoá nhân vào CHỈ SỐ GỐC, còn máu
     * từ bốn mảnh giáp thì cộng thẳng vào sau — đo trên hồ sơ có giáp thì tỉ lệ
     * bị pha loãng và phép kiểm sẽ đo nhầm một thứ khác. */
    const s = DP.newSave('T');
    s.heroes.push(DP.mkHero('sora')); s.party[0] = s.heroes[0].uid;
    const before = DP.buildStats(s);
    s.gold = 9e9; s.core = 9999;
    const t = DP.EVOL.tracks[0];
    const poorSave = DP.newSave('T'); poorSave.gold = 0;
    const poor = DP.evolUp(poorSave, t.id);
    for (let i = 0; i < DP.EVOL.max; i++) DP.evolUp(s, t.id);
    const over = DP.evolUp(s, t.id);
    const after = DP.buildStats(s);
    // Cộng cho MỌI nhân vật, không riêng ai: đo trên một người khác hẳn.
    s.heroes.push(DP.mkHero('calli'));
    const other = s.heroes[1];
    const s2 = DP.newSave('T'); s2.heroes.push(DP.mkHero('calli'));
    const b2 = DP.buildStats(s2, s2.heroes[0]);
    const a2 = DP.buildStats(s, other);
    return { poor: poor.ok === false, lv: DP.evolLv(s, t.id), max: DP.EVOL.max,
             over: over.ok === false,
             hpGrew: after.hp > before.hp,
             ratio: after.hp / before.hp, want: 1 + t.per * DP.EVOL.max,
             otherGrew: a2.hp > b2.hp,
             total: DP.evolTotal(s) };
  });
  check('không đủ Gold thì không Tiến Hoá được', evol.poor);
  check('Tiến Hoá lên được tối đa rồi dừng', evol.lv === evol.max && evol.over,
    evol.lv + '/' + evol.max);
  check('Tiến Hoá cộng đúng phần trăm đã hứa vào chỉ số gốc',
    Math.abs(evol.ratio - evol.want) < 0.02,
    'x' + evol.ratio.toFixed(3) + ' vs x' + evol.want.toFixed(3));
  check('Tiến Hoá áp cho MỌI nhân vật, không riêng người đang dùng', evol.otherGrew);

  // ------------------------------------------------------ THƯỞNG SAU ẢI
  results.push('\n── thưởng sau ải ──');
  const rew = await p.evaluate(() => {
    const n = DP.STAGES.length;
    const first = [], repeat = [];
    for (let i = 0; i < n; i++) { first.push(DP.REWARD.firstGem(i)); repeat.push(DP.REWARD.repeatGem(i)); }
    const totalFirst = first.reduce((a, b) => a + b, 0);
    return {
      n, totalFirst,
      pulls: totalFirst / DP.REWARD.pull,
      rising: first.every((v, i) => i === 0 || v > first[i - 1]),
      firstBeatsRepeat: first.every((v, i) => v > repeat[i] * 3),
      lastRepeat: repeat[n - 1],
      runsPerPull: DP.REWARD.pull / (repeat[n - 1] + 3 * DP.REWARD.condGem + DP.REWARD.allCondGem)
    };
  });
  check('gem lần đầu tăng đều theo chuỗi ải', rew.rising);
  check('phá lần đầu đáng giá hơn cày lại ít nhất 3 lần', rew.firstBeatsRepeat);
  check('cả chiến dịch cho khoảng 30-60 lượt quay',
    rew.pulls >= 30 && rew.pulls <= 60, rew.pulls.toFixed(1) + ' lượt');
  // Cày lại phải CÓ NGHĨA nhưng không được thay thế việc đi tiếp: nếu vài lượt
  // cày đã bằng một cú quay thì chẳng ai buồn phá ải mới nữa.
  check('cày lại ải cuối cần 3-8 lượt cho một cú quay',
    rew.runsPerPull >= 3 && rew.runsPerPull <= 8, rew.runsPerPull.toFixed(1) + ' lượt/quay');

  // Bỏ dở giữa chừng: bảng "RỜI ẢI" hiện ra, và ví KHÔNG được đổi thêm một đồng
  // nào — thứ nhặt được đã vào túi từ lúc nhặt rồi.
  await goStage(p, 'tior-2');
  await p.waitForTimeout(500);
  const quit = await p.evaluate(() => new Promise(res => {
    const g0 = DP.UI.save.gold, m0 = DP.UI.save.gem;
    DP.UI.leave();
    setTimeout(() => {
      const el = document.getElementById('resultScr');
      res({ shown: el.classList.contains('on'), text: (el.innerText || '').split('\n')[0],
            goldDelta: DP.UI.save.gold - g0, gemSame: DP.UI.save.gem === m0,
            cleared: !!DP.UI.save.cleared['tior-2'], running: !!(DP.UI.battle && DP.UI.battle.running) });
    }, 400);
  }));
  check('rời ải giữa chừng hiện bảng tổng kết', quit.shown && /RỜI ẢI/.test(quit.text), quit.text);
  check('rời ải không cộng thêm/trừ bớt tiền', quit.goldDelta === 0 && quit.gemSame,
    'lệch ' + quit.goldDelta + ' gold');
  check('rời ải KHÔNG tính là phá ải', quit.cleared === false);
  check('rời ải thì trận dừng hẳn', quit.running === false);
  await p.evaluate(() => DP.UI.show('home'));
  await p.waitForTimeout(200);
  check('mở màn khác thì bảng kết quả tự dẹp',
    await p.evaluate(() => !document.getElementById('resultScr').classList.contains('on')));

  // TIỆM chỉ tiêu GOLD. Hai đồng tiền mà đổi được cho nhau thì thật ra chỉ có một
  // — nên phải kiểm rằng KHÔNG có đường nào đổi gem sang gold hay ngược lại.
  await p.evaluate(() => { DP.UI.save.gold = 999999; DP.UI.saveNow(); DP.UI.show('shop'); });
  await p.waitForTimeout(250);
  const shop = await p.evaluate(() => {
    const S = DP.UI.save, g0 = S.gold, m0 = S.gem;
    const btn = document.querySelector('#body-shop [data-buy]');
    const id = btn.getAttribute('data-buy'), it = DP.ITEMS[id];
    btn.click();
    return { spent: g0 - S.gold, want: it.price.gold, got: (S.inv[id] || 0),
             gemUntouched: S.gem === m0,
             allGold: Object.keys(DP.ITEMS).every(k => DP.ITEMS[k].price.gold > 0 && !DP.ITEMS[k].price.gem) };
  });
  check('tiệm chỉ nhận Gold, không nhận Gem', shop.allGold && shop.gemUntouched);
  check('bấm nút mua thật: trừ đúng Gold, cộng đúng đồ',
    shop.spent === shop.want && shop.got >= 1, 'trừ ' + shop.spent + '/' + shop.want);

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
      wswitch: r(q('hWswitch')),
      timer: r(q('hTimer')),
      // Những phần tử này đã bị BỎ HẲN. Đo bằng "có tồn tại không" chứ không đo
      // toạ độ, vì cái phải khẳng định bây giờ là chúng KHÔNG còn ở đó nữa.
      gone: ['hSkill0', 'hSkill1', 'hOrb', 'hPHp', 'hPName', 'hPExp', 'hPLv',
             'hRevive', 'hWName'].filter(id => !!q(id)),
      hudOn: q('hud').classList.contains('on')
    };
  });
  check('HUD trận đang bật', hud.hudOn);
  check('thanh máu boss nằm trên cùng', hud.bossBar.y < 60, 'y=' + Math.round(hud.bossBar.y));
  check('thanh gục nằm NGAY DƯỚI thanh máu boss (đúng bản gốc)',
    hud.fatigue.y > hud.bossBar.y && hud.fatigue.y - (hud.bossBar.y + hud.bossBar.h) < 8,
    'cách ' + Math.round(hud.fatigue.y - hud.bossBar.y - hud.bossBar.h) + 'px');
  /* ĐÁY MÀN HÌNH PHẢI TRỐNG, và hai nút kỹ năng phải biến mất.
   *
   * Cả hai thứ này từng tồn tại và từng được phép kiểm cũ BẢO VỆ — nên nếu chỉ
   * xoá phép kiểm cũ đi thì không còn gì ngăn chúng lặng lẽ quay lại. Đây là
   * phép kiểm ngược: nêu đích danh chín phần tử đã bỏ, và hỏng ngay nếu bất kỳ
   * cái nào mọc lại.
   *
   * Máu và thanh nạp giờ vẽ TRÊN CANVAS ngay trên đầu nhân vật, không phải phần
   * tử DOM nào — nên không có gì để đo toạ độ ở đây nữa, và đó chính là điều
   * đang được khẳng định. */
  check('chín phần tử HUD cũ đã bỏ hẳn, không cái nào mọc lại',
    hud.gone.length === 0, hud.gone.join(', ') || 'sạch');
  check('cột đổi người ở mép phải, và RA KHỎI vùng ngón cái',
    hud.wswitch.x > 400 && hud.wswitch.y < 480,
    Math.round(hud.wswitch.x) + ',' + Math.round(hud.wswitch.y));
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
  for (const s of ['home', 'quest', 'armory', 'gacha', 'more', 'evol', 'shop', 'help', 'bosslist']) {
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
    // Banner NHÂN VẬT phải chỉ ra người, không lẫn một món đồ nào — nếu nó ra
    // cả đồ thì nó chính là banner tiêu chuẩn, và ba banner thành hai.
    const gear0 = S.gear.length;
    S.gem = 9e7;
    const ranks = {};
    for (let i = 0; i < 20; i++) {
      DP.pull(S, 'char', 10).results.forEach(r => { ranks[r.rank] = (ranks[r.rank] || 0) + 1; });
    }
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
  check('đủ cả mười bốn lớp vũ khí trong dàn nhân vật', hero.classes === 14, hero.classes + ' lớp');
  check('banner nhân vật KHÔNG đẻ ra trang bị', hero.gearGrew === 0, 'túi tăng ' + hero.gearGrew + ' món');
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
  check('bộ trưng bày: 14 cây, bấm lần hai không nhân bản',
    sc.a === 14 && sc.b === 0 && sc.n === 14, JSON.stringify(sc));
  // Bộ trưng bày phải phủ ĐỦ MƯỜI BỐN LỚP — nếu không thì có lớp người chơi không bao
  // giờ được cầm thử.
  check('bộ trưng bày: cây nào cũng tối cấp và mở đủ hai kỹ năng',
    sc.allMax && sc.allTwo && sc.classes === 14, sc.classes + ' lớp');

  /* ================= TÊN MÓN PHẢI KHỚP LỚP =============================
   * Bảng Behemoth giữ tên lớp CŨ, còn bốn lớp mới sinh ra bằng cách tách đôi
   * lớp cũ theo băm id. Chỗ đó có hai đường đọc — một đường đặt lớp, một đường
   * đặt tên — và chúng đã từng lệch nhau: cây của Amarok mang lớp `blade` mà
   * tên vẫn là "Amarok's Rifle". Người chơi đọc chữ Rifle rồi cầm ra một cây
   * chém lưỡi khí, đó là nói dối ngay trên nhãn.
   *
   * Phép kiểm quét CẢ 56 con × 5 ô, vì lỗi kiểu này chỉ lộ ở đúng những con rơi
   * vào nửa sau của cặp tách — soi vài con đầu bảng thì không bao giờ thấy.
   * ==================================================================== */
  results.push('\n── tên món ──');
  const nm = await p.evaluate(() => {
    const SUF = {
      rifle: 'Rifle', shotgun: 'Scattergun', sniper: 'Lance', bow: 'Bow',
      staff: 'Scepter', launcher: 'Mortar', laser: 'Prism', blade: 'Ionblade',
      scythe: 'Reaper', orb: 'Censer', gatling: 'Vortex', chakram: 'Discus',
      mine: 'Charge', whip: 'Lash'
    };
    const bad = [], mismatch = [], by = {};
    DP.BEHEMOTHS.forEach(b => {
      ['weapon', 'head', 'body', 'arm', 'leg'].forEach(k => {
        const g = DP.forgeGear(b.id, k, 't');
        if (!g || !g.name || /undefined/.test(g.name)) bad.push(b.id + '/' + k);
      });
      const g = DP.forgeGear(b.id, 'weapon', 't');
      by[g.wclass] = (by[g.wclass] || 0) + 1;
      if (g.name.indexOf(SUF[g.wclass]) < 0) mismatch.push(g.name + '≠' + g.wclass);
    });
    // Tên phải đổi theo bậc tiến hoá, và cả ba bậc đều phải có chữ.
    const b0 = DP.BEHEMOTHS[0];
    const evo = [0, 1, 2].map(e => {
      const g = DP.forgeGear(b0.id, 'weapon', 't'); g.evo = e;
      return DP.gearName ? DP.gearName(g) : g.name;
    });
    return { bad, mismatch, classes: Object.keys(by).length, by, evo };
  });
  check('56 con x 5 ô: món nào cũng có tên, không món nào "undefined"',
    nm.bad.length === 0, nm.bad.slice(0, 5).join(', ') || 'sạch');
  check('tên vũ khí luôn mang hậu tố ĐÚNG lớp của chính nó',
    nm.mismatch.length === 0, nm.mismatch.slice(0, 4).join(', ') || 'khớp hết');
  check('dàn Behemoth rải đủ cả mười bốn lớp', nm.classes === 14,
    nm.classes + ' lớp: ' + JSON.stringify(nm.by));

  /* ================= HAI MƯƠI TÁM ĐÒN, HAI MƯƠI TÁM TRÌNH PHÁT =========
   * Trùng `kind` nghĩa là trùng trình phát. Tên khác nhau, con số khác nhau,
   * nhưng tay người chơi vẫn cảm thấy y hệt — và đó đúng là thứ vừa phải sửa:
   * Phá Cửa với Nhất Tuyến cùng chạy `rush`, Vòng Mảnh với Vòng Tử cùng chạy
   * `ring`. Bốn đòn, hai cảm giác.
   *
   * Phép kiểm này khoá lại chuyện đó, và nó cũng bắt luôn lỗi ngược lại: một
   * `kind` khai trong dữ liệu mà KHÔNG có hàm `sk_<kind>` thì đòn đó bấm vào
   * không ra gì — fireSkill nuốt im lặng để khỏi treo game, nên không ai biết.
   * ==================================================================== */
  results.push('\n── kỹ năng: không đòn nào trùng trình phát ──');
  const kinds = await p.evaluate(() => {
    const seen = {}, dup = [], noImpl = [], b = DP.UI.battle;
    DP.WEAPON_ORDER.forEach(c => {
      (DP.SKILLS[c] || []).forEach(sk => {
        (seen[sk.kind] = seen[sk.kind] || []).push(c + '/' + sk.id);
        if (b && typeof b['sk_' + sk.kind] !== 'function') noImpl.push(sk.kind);
      });
    });
    Object.keys(seen).forEach(k => { if (seen[k].length > 1) dup.push(k + ': ' + seen[k].join(' + ')); });
    const aims = {};
    DP.WEAPON_ORDER.forEach(c => (DP.SKILLS[c] || []).forEach(sk => {
      aims[sk.aim] = (aims[sk.aim] || 0) + 1;
    }));
    return { dup, noImpl: [...new Set(noImpl)], n: Object.keys(seen).length, aims };
  });
  check('28 đòn dùng 28 trình phát KHÁC NHAU, không cái nào trùng',
    kinds.dup.length === 0 && kinds.n === 28,
    kinds.dup.join(' | ') || kinds.n + ' trình phát');
  check('mọi kind khai trong dữ liệu đều có hàm sk_ thật',
    kinds.noImpl.length === 0, kinds.noImpl.join(', ') || 'đủ');
  check('cả ba kiểu ngắm đều được dùng (self / dir / point)',
    Object.keys(kinds.aims).length === 3, JSON.stringify(kinds.aims));

  check('mọi ảnh trong asset-map đều nạp được', art.rep.loaded === art.rep.total,
    art.rep.loaded + '/' + art.rep.total);
  check('đủ biểu tượng vũ khí (14 lớp x 7 hệ)', art.miss.length === 0,
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
