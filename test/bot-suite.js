/*
 * Bộ kiểm thử ĐỒNG ĐỘI BIẾT DÙNG XE cho repo2d (và bản Biệt Đội dùng chung bộ máy).
 * Chạy: node test/bot-suite.js
 *
 * Ba đồng đội trước bản này đi ngang qua cái xe đẩy và hai chiếc xe máy suốt cả ca mà không
 * đụng tới: xe đẩy chỉ nghe lời người chơi, còn bán kính làm việc của chúng (6,5 ô) thì luôn
 * ngắn hơn quãng đường đáng để leo lên xe. Bộ này đo bốn lời hứa:
 *   1. ôm đồ mà cái xe đẩy gần hơn cái bệ  ->  chất lên xe
 *   2. xe đẩy đầy mà bệ đang mở            ->  có đứa cầm càng đẩy tới bệ và dỡ
 *   3. món đồ ở xa mà có xe máy rảnh       ->  leo lên lái tới, rồi xuống xe để nhặt
 *   4. và cả ba việc đó không được lấn sang phần của người chơi: không cướp chiếc xe tôi đang
 *      đứng sát hơn, không vét nốt đáy bình.
 *
 * Cách đo: DỰNG CẢNH bằng page.evaluate (đặt cái xe ở đâu, món đồ ở đâu) rồi ĐỌC nhật ký trạng
 * thái 5 lần/giây trong suốt cả cảnh — không gọi hộ AI một hàm nào. Phải đọc trên cả khoảng
 * thời gian chứ không phải ở giây cuối: đồng đội có MATE_DITHER (42% số nhịp nghĩ là đứng ngẩn
 * ra) và nhịp nghĩ 1,2–3s, nên "đúng lúc tôi nhìn thì nó đang làm gì" là một phép đo hỏng.
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const root = 'file:///' + path.resolve(__dirname, '..').split(path.sep).join('/');
const R2D = root + '/games/repo2d/index.html';
const SEED = 4242;

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  if (ok) { pass++; results.push('  ✔ ' + name + (detail ? '  — ' + detail : '')); }
  else    { fail++; results.push('  ✘ ' + name + (detail ? '  — ' + detail : '')); }
}

async function open(b) {
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true,
                                   deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await p.goto(R2D);
  await p.waitForTimeout(1100);
  await p.locator('#veilBtn').click();                 // vào ca bằng CLICK THẬT
  await p.waitForTimeout(220);
  return { ctx, p, errs };
}

// Màn mới cho mỗi cảnh. Một cảnh trước đó có thể đã làm đầy cái bệ, và bệ đầy là xong màn —
// lúc đó S.cart là null, S.mates rỗng, và mọi phép đo sau đều vô nghĩa.
async function manMoi(p) {
  await p.evaluate(s => { REPO.setCutscenes(false); REPO.S.cut = null; REPO.startLevel(s); }, SEED);
  await p.waitForTimeout(800);
  await p.evaluate(() => { REPO.S.cut = null; REPO.S.running = true; REPO.S.noFoes = true; });
  await p.waitForTimeout(200);
  // Chỉ để MỘT đứa làm việc: hai đứa kia gửi ra góc và cho đứng đó. Không làm gục chúng —
  // một cái đầu nằm dưới sàn sẽ đổi hướng cả tổ và cảnh đo mất sạch ý nghĩa.
  await p.evaluate(() => {
    const S = REPO.S;
    for (const m of S.mates) {
      if (m.pushing) REPO.releaseCart(m);
      if (m.riding) REPO.dismountBike(m);
      m.job = 'idle'; m.path = null; m.target = null; m.react = 0; m.idleT = 0; m.down = false;
    }
    for (let i = 1; i < S.mates.length; i++) {
      S.mates[i].x = 40; S.mates[i].y = 40; S.mates[i].idleT = 9999; S.mates[i].react = 9999;
    }
  });
}

// Nhật ký: đọc `giay` giây, 5 mẫu/giây.
async function nhatKy(p, giay, doc) {
  const out = [];
  for (let i = 0; i < giay * 5; i++) { await p.waitForTimeout(200); out.push(await p.evaluate(doc)); }
  return out;
}
const gon = ns => [...new Set(ns)].join(' ');


// Cảnh "phải đi xa": chừa đúng MỘT món đồ, ở khoảng 8–14 ô tính từ đồng đội, và dựng chiếc xe
// máy ngay cạnh nó. Xa hơn 15 ô thì món đó nằm ngoài bán kính làm việc và nó không buồn nhìn;
// gần hơn 7,5 ô thì chưa đáng leo lên xe. Không canh đúng dải này thì đồng đội bỏ đi lang thang
// rồi vô tình gặp một món khác, và phép đo không nói lên điều gì.
const canhDiXa = p => p.evaluate(() => {
  const S = REPO.S, T = REPO.TILE, a = S.mates[0];
  S.cart.x = 40; S.cart.y = 40;
  const con = S.loot.filter(l => !l.gone && !l.onPad && !l.isHead && !l.held && !l.inCart);
  if (!con.length) return null;
  const xa = con[0];
  // chỗ đứng cho đồng đội: một ô sàn cách món đó 9–13 ô, và chỗ đó phải đứng lọt
  let cho = null;
  for (let gy = 1; gy < REPO.MH - 1 && !cho; gy++)
    for (let gx = 1; gx < REPO.MW - 1; gx++) {
      if (REPO.solidAt(gx, gy)) continue;
      const x = (gx + 0.5) * T, y = (gy + 0.5) * T;
      const d = Math.hypot(x - xa.x, y - xa.y);
      if (d < 9 * T || d > 13 * T) continue;
      if (REPO.hitsSolid(x, y, 10) || REPO.hitsSolid(x + T * 1.2, y, 14)) continue;
      cho = { x, y }; break;
    }
  if (!cho) return null;
  for (const l of S.loot) if (l !== xa && !l.isHead) l.gone = true;   // chỉ chừa đúng một món
  a.x = cho.x; a.y = cho.y;
  // Giao đúng MỘT việc: đi nhặt món ở xa kia. Để nó tự chọn thì có lần nó ngẩn ra hết nhịp
  // này tới nhịp khác (MATE_DITHER 42%) và mãi tới giây thứ 39 mới nổ máy — tốc độ đỉnh đo
  // được là 6 px/s, đỏ vì bộ test bấm giờ chứ không phải vì nó không biết lái. Việc đang đo
  // là "đường xa thế này thì có leo lên xe không", và cái đó vẫn là quyết định của nó.
  a.job = 'loot'; a.target = xa; a.path = null; a.react = 0; a.idleT = 0; a.held = null;
  const bk = S.bikes[0];
  bk.x = a.x + T * 1.2; bk.y = a.y; bk.fuel = bk.fuelMax; bk.downed = 0; bk.rider = null; bk.spd = 0;
  S.bikes[1].fuel = 0; S.bikes[1].x = 40; S.bikes[1].y = 40;
  // Tôi phải đứng GẦN đồng đội, ở phía đối diện chiếc xe. Để tôi ở tận góc bản đồ thì nó bỏ
  // việc đi theo tôi (bước 5 của stepMates), rời khỏi chiếc xe, và bán kính làm việc tụt về
  // 6,5 ô — cảnh đo hỏng mà không nói một lời nào. Ở phía đối diện để tôi không phải là người
  // đứng sát chiếc xe hơn nó, vì như vậy là nó đang nhường chứ không phải không biết lái.
  S.player.x = a.x - T * 2.0; S.player.y = a.y;
  if (REPO.hitsSolid(S.player.x, S.player.y, 9)){ S.player.x = a.x; S.player.y = a.y; }
  return { dDich: Math.round(Math.hypot(xa.x - a.x, xa.y - a.y)),
           dXe: Math.round(Math.hypot(bk.x - a.x, bk.y - a.y)),
           nguong: Math.round(7.5 * T), banKinh: Math.round(15 * T),
           xang0: bk.fuel, tocXe: REPO.BIKE_KINDS[bk.kind].speed };
});

// =====================================================================
async function chatLenXeSuite(b) {
  results.push('\n── ôm đồ: xe đẩy gần hơn bệ thì chất lên xe ──');
  const { ctx, p, errs } = await open(b);
  await manMoi(p);
  const canh = await p.evaluate(() => {
    const S = REPO.S, T = REPO.TILE, pad = S.pads[S.padIndex], a = S.mates[0];
    const l = S.loot.find(x => !x.gone && !x.held && !x.onPad && !x.inCart && !x.isHead && x.value < 20000);
    if (!l || !pad) return null;
    a.x = l.x; a.y = l.y;
    // Chỗ đặt xe đẩy phải là SÀN ĐI ĐƯỢC và đủ xa để nhìn thấy quãng đường. Tầm với để chạm
    // tới xe là cart.r + MATE_GRAB_R = 65px, nên đặt sát quá thì việc 'cart' xong trong chưa
    // tới một nhịp lấy mẫu; mà đặt bừa 6 ô sang phải thì có lần rơi vào giữa một bức tường,
    // không dò được đường tới, và đồng đội bỏ xe đi thẳng ra bệ — đúng luật, nhưng không phải
    // cái đang cần đo.
    let choXe = null;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
      for (const k of [5, 4.5, 4, 3.5]){
        const x = l.x + dx*T*k, y = l.y + dy*T*k;
        if (!REPO.hitsSolid(x, y, 22) && REPO.losClear(l.x, l.y, x, y)){ choXe = { x, y }; break; }
      }
      if (choXe) break;
    }
    if (!choXe) return null;
    S.cart.x = choXe.x; S.cart.y = choXe.y;
    // Giao đúng MỘT việc: đi nhặt món này. Nếu để nó tự chọn thì có lần nó lang thang một
    // vòng rồi mới nhặt được món khác ở góc kia nhà — lúc đó cái bệ mới là chỗ gần hơn, và
    // "mang ra xe đẩy" là quyết định SAI. Việc đang đo là quyết định SAU khi cầm lên, và
    // quyết định đó vẫn là của nó.
    a.job = 'loot'; a.target = l; a.path = null; a.react = 0; a.idleT = 0; a.held = null;
    for (const bk of S.bikes) { bk.x = 30; bk.y = 30; }   // xe máy để xa cho khỏi lẫn
    // Tôi đứng ngay cạnh nó. Để tôi ở tận đầu kia căn nhà thì đồng đội bỏ món đồ dưới chân
    // để đi theo tôi (bước 5 của stepMates) và cả cảnh đo thành vô nghĩa.
    S.player.x = a.x; S.player.y = a.y;
    return { dXe: Math.round(Math.hypot(S.cart.x - a.x, S.cart.y - a.y)),
             dBe: Math.round(Math.hypot(pad.x - a.x, pad.y - a.y)) };
  });
  if (!canh) { check('dựng được cảnh ôm đồ', false); await ctx.close(); return; }
  check('dựng được cảnh: xe đẩy gần hơn bệ hẳn', canh.dXe * 2 < canh.dBe,
        'xe cách ' + canh.dXe + 'px, bệ cách ' + canh.dBe + 'px');

  const nk = await nhatKy(p, 30, () => {
    const S = REPO.S, a = S.mates[0];
    if (!a || !S.cart) return 'hết-bot';
    return a.job + (a.held ? '+ôm' : '') + '/xe' + S.cart.items.length;
  });
  check('đồng đội nhận việc "cart"', nk.some(x => x.startsWith('cart')), gon(nk));
  check('và món đồ thật sự nằm trên xe đẩy', nk.some(x => /\/xe[1-9]/.test(x)));
  check('chất lên xe: không lỗi trang', errs.length === 0, errs[0] || '');
  await ctx.close();
}

// =====================================================================
async function dayXeSuite(b) {
  results.push('\n── xe đẩy đầy + bệ đang mở: có đứa đẩy tới bệ ──');
  const { ctx, p, errs } = await open(b);
  await manMoi(p);
  const canh = await p.evaluate(() => {
    const S = REPO.S, T = REPO.TILE, pad = S.pads[S.padIndex], a = S.mates[0];
    const kho = S.loot.filter(x => !x.gone && !x.held && !x.onPad && !x.inCart && !x.isHead &&
                                   x.value < 20000).slice(0, 4);
    if (kho.length < 3 || !pad) return null;
    for (const l of kho) { l.inCart = true; S.cart.items.push(l); }
    S.cart.x = a.x + T * 1.6; S.cart.y = a.y;
    for (const bk of S.bikes) { bk.x = 30; bk.y = 30; }
    return { treXe: S.cart.items.length, daBe: pad.placed.length,
             dBe: Math.round(Math.hypot(pad.x - S.cart.x, pad.y - S.cart.y)) };
  });
  if (!canh) { check('dựng được cảnh xe đầy', false); await ctx.close(); return; }
  check('dựng được cảnh: xe có ' + canh.treXe + ' món, bệ cách ' + canh.dBe + 'px',
        canh.treXe >= 3 && canh.dBe > 200);

  const nk = await nhatKy(p, 30, () => {
    const S = REPO.S, a = S.mates[0], pad = S.pads[S.padIndex];
    if (!a || !S.cart || !pad) return 'hết-bot';          // bệ đầy là xong màn, cũng là ĐẠT
    return a.job + (a.pushing ? '+đẩy' : '') + '/xe' + S.cart.items.length + '/bệ' + pad.placed.length;
  });
  check('đồng đội nhận việc "push"', nk.some(x => x.startsWith('push')), gon(nk));
  check('và thật sự cầm càng xe', nk.some(x => x.includes('+đẩy')));
  // Dỡ xong: xe về 0 món và bệ nhiều hơn lúc đầu. Nếu bệ đầy luôn thì màn kết thúc ("hết-bot"),
  // và đó vẫn là dỡ được — chỉ là dỡ đúng món cuối cùng.
  const daDo = nk.some(x => new RegExp('/xe0/bệ[' + (canh.daBe + 1) + '-9]').test(x)) ||
               nk.includes('hết-bot');
  check('và dỡ được cả xe lên bệ', daDo);
  check('đẩy xe: không lỗi trang', errs.length === 0, errs[0] || '');
  await ctx.close();
}

// =====================================================================
async function laiXeSuite(b) {
  results.push('\n── món đồ ở xa + có xe máy rảnh: leo lên lái ──');
  const { ctx, p, errs } = await open(b);
  await manMoi(p);
  const canh = await canhDiXa(p);
  if (!canh) { check('dựng được cảnh đi xa', false, 'không tìm được chỗ đứng hợp lệ');
               await ctx.close(); return; }
  check('dựng được cảnh: món cách ' + canh.dDich + 'px, trong dải ' + canh.nguong + '–' +
        canh.banKinh + 'px, xe máy cách ' + canh.dXe + 'px',
        canh.dDich > canh.nguong && canh.dDich < canh.banKinh && canh.dXe < 100);

  const nk = await nhatKy(p, 40, () => {
    const S = REPO.S, a = S.mates[0];
    if (!a) return 'hết-bot';
    return a.job + (a.riding ? '+lái' + Math.round(a.riding.spd) : '') + (a.held ? '+ôm' : '');
  });
  const lai = nk.filter(x => x.includes('+lái'));
  const dinh = lai.length ? Math.max(...lai.map(x => +x.match(/lái(\d+)/)[1])) : 0;
  check('đồng đội leo lên xe máy', lai.length > 0, gon(nk));
  check('và chạy nhanh hơn hẳn đi bộ (84 px/s)', dinh > 140,
        'tốc độ đỉnh ' + dinh + ' px/s · ' + (dinh > 140 ? '' : nk.join(' ')));
  check('không vượt quá tốc độ của chính chiếc xe', dinh <= canh.tocXe + 1,
        dinh + ' ≤ ' + canh.tocXe);
  const sau = await p.evaluate(() => ({
    xang: REPO.S.bikes[0].fuel,
    ngoi: !!(REPO.S.mates[0] && REPO.S.mates[0].riding),
    om: !!(REPO.S.mates[0] && REPO.S.mates[0].held) }));
  check('lái thì tốn xăng như người chơi', sau.xang < canh.xang0,
        canh.xang0.toFixed(1) + ' → ' + sau.xang.toFixed(1));
  // Lái thì hai tay bận. Nếu nó ôm được đồ thì nhất định nó đã xuống xe trước đó.
  check('ôm đồ và ngồi trên xe không bao giờ cùng lúc',
        !nk.some(x => x.includes('+lái') && x.includes('+ôm')));
  check('lái xe: không lỗi trang', errs.length === 0, errs[0] || '');
  await ctx.close();
}

// =====================================================================
async function nhuongSuite(b) {
  results.push('\n── nhường đường: xe của người chơi là của người chơi ──');
  const { ctx, p, errs } = await open(b);

  await manMoi(p);
  const c1 = await p.evaluate(() => {
    const S = REPO.S, T = REPO.TILE, a = S.mates[0], bk = S.bikes[0];
    if (a.riding) REPO.dismountBike(a);        // nó có thể đã kịp leo lên trong lúc dựng màn
    // Hướng đặt xe phải là hướng THÔNG. Đặt vào một ô đặc thì người chơi bị đẩy bật ra vài ô,
    // và chiếc xe bỗng nhiên gần đồng đội hơn tôi — phép đo quay ngược lại mà không báo gì.
    let ox = T, oy = 0;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      if (!REPO.hitsSolid(a.x + dx*T, a.y + dy*T, 12)){ ox = dx*T; oy = dy*T; break; }
    }
    bk.x = a.x + ox; bk.y = a.y + oy; bk.fuel = bk.fuelMax; bk.downed = 0; bk.rider = null;
    S.player.x = bk.x; S.player.y = bk.y;                   // tôi đứng ĐÚNG trên chiếc xe
    S.bikes[1].fuel = 0; S.bikes[1].x = 40; S.bikes[1].y = 40;
    a.job = 'idle'; a.path = null; a.target = null; a.react = 0; a.idleT = 0;
    return { dToi: Math.round(Math.hypot(bk.x - S.player.x, bk.y - S.player.y)),
             dBot: Math.round(Math.hypot(bk.x - a.x, bk.y - a.y)) };
  });
  const n1 = await nhatKy(p, 12, () => {
    const S = REPO.S, a = S.mates[0], bk = S.bikes[0];
    if (!a) return null;
    return a.riding ? { toi: Math.round(Math.hypot(bk.x - S.player.x, bk.y - S.player.y)),
                        bot: Math.round(Math.hypot(bk.x - a.x, bk.y - a.y)) } : null;
  });
  const cuop = n1.find(Boolean);
  check('không cướp chiếc xe tôi đang đứng sát hơn', !cuop,
        cuop ? 'lúc nó leo lên: xe cách tôi ' + cuop.toi + 'px, cách nó ' + cuop.bot + 'px'
             : 'lúc dựng cảnh: xe cách tôi ' + c1.dToi + 'px, cách nó ' + c1.dBot + 'px');

  await manMoi(p);
  const c2 = await p.evaluate(() => {
    const S = REPO.S, T = REPO.TILE, a = S.mates[0], bk = S.bikes[0];
    if (a.riding) REPO.dismountBike(a);        // nó có thể đã kịp leo lên trong lúc dựng màn
    S.player.x = 40; S.player.y = 40;
    bk.x = a.x + T * 1.2; bk.y = a.y; bk.downed = 0; bk.rider = null;
    bk.fuel = bk.fuelMax * 0.2;                             // dưới ngưỡng để dành
    S.bikes[1].fuel = 0; S.bikes[1].x = 40; S.bikes[1].y = 40;
    a.job = 'idle'; a.path = null; a.target = null; a.react = 0; a.idleT = 0;
    return { pct: Math.round(bk.fuel / bk.fuelMax * 100) };
  });
  const n2 = await nhatKy(p, 10, () => !!(REPO.S.mates[0] && REPO.S.mates[0].riding));
  check('không vét nốt đáy bình', !n2.some(Boolean), 'xe còn ' + c2.pct + '% xăng');

  // Xe đầy bình, tôi đứng xa: lúc này thì được lấy — nếu không thì hai phép trên chỉ chứng
  // minh là đồng đội không bao giờ leo lên xe, chứ không chứng minh nó biết nhường.
  await manMoi(p);
  const c3 = await canhDiXa(p);
  const n3 = await nhatKy(p, 20, () => !!(REPO.S.mates[0] && REPO.S.mates[0].riding));
  check('nhưng xe đầy bình và tôi ở xa thì nó lấy', !!c3 && n3.some(Boolean),
        c3 ? 'món cách ' + c3.dDich + 'px' : 'không dựng được cảnh');
  check('nhường đường: không lỗi trang', errs.length === 0, errs[0] || '');
  await ctx.close();
}

// =====================================================================
async function buongSuite(b) {
  results.push('\n── gục hoặc hết xăng thì buông ──');
  const { ctx, p, errs } = await open(b);

  await manMoi(p);
  const guc = await p.evaluate(async () => {
    const S = REPO.S, a = S.mates[0], bk = S.bikes[0];
    bk.x = a.x; bk.y = a.y; bk.fuel = bk.fuelMax; bk.downed = 0; bk.rider = null;
    S.player.x = 40; S.player.y = 40;
    REPO.mountBike(a, bk);
    const truoc = !!a.riding;
    REPO.downActor(a);
    await new Promise(r => setTimeout(r, 500));
    return { truoc, ngoi: !!a.riding, xeCoNguoi: !!bk.rider, guc: !!a.down };
  });
  check('dựng được cảnh: đồng đội đang ngồi trên xe', guc.truoc);
  check('gục thì rời xe', guc.truoc && !guc.ngoi);
  check('và chiếc xe được trả lại cho người khác', !guc.xeCoNguoi);

  await manMoi(p);
  const day = await p.evaluate(async () => {
    const S = REPO.S, T = REPO.TILE, a = S.mates[0], pad = S.pads[S.padIndex];
    const kho = S.loot.filter(x => !x.gone && !x.held && !x.onPad && !x.inCart && !x.isHead &&
                                   x.value < 20000).slice(0, 4);
    for (const l of kho) { l.inCart = true; S.cart.items.push(l); }
    S.cart.x = a.x; S.cart.y = a.y;
    REPO.grabCart(a);
    const truoc = { camCang: !!a.pushing, xeCoNguoi: !!S.cart.held };
    REPO.downActor(a);
    await new Promise(r => setTimeout(r, 500));
    return { truoc, camCang: !!a.pushing, xeCoNguoi: !!S.cart.held, ai: !!S.cart.holder };
  });
  check('dựng được cảnh: đồng đội đang cầm càng xe đẩy', day.truoc.camCang && day.truoc.xeCoNguoi);
  check('gục thì buông càng xe đẩy', !day.camCang && !day.xeCoNguoi && !day.ai);

  await manMoi(p);
  const canhXang = await canhDiXa(p);
  if (canhXang) await p.evaluate(() => {
    const bk = REPO.S.bikes[0];
    bk.fuelMax = 1.1; bk.fuel = 1.1;           // bình bé: đầy bình, mà đầy chỉ được 1,2 giây
  });
  // Phải có việc để đi: ngồi im thì bình xăng không tụt một giọt, và "hết xăng giữa đường"
  // không bao giờ xảy ra để mà đo.
  const nkXang = canhXang ? await nhatKy(p, 20, () => {
    const S = REPO.S, a = S.mates[0], bk = S.bikes[0];
    if (!a) return 'hết-bot';
    return (a.riding ? 'lái' : 'bộ') + '/' + Math.round(bk.fuel * 10);
  }) : [];
  const daLai = nkXang.some(x => x.startsWith('lái'));
  const canXang = nkXang.some(x => x.endsWith('/0'));
  const xuongXe = nkXang.some((x, i) => x.startsWith('bộ') && nkXang.slice(0, i).some(y => y.startsWith('lái')));
  check('chạy tới lúc cạn bình', canhXang && daLai && canXang, gon(nkXang));
  check('hết xăng giữa đường thì xuống xe đi bộ tiếp', xuongXe);
  check('buông: không lỗi trang', errs.length === 0, errs[0] || '');
  await ctx.close();
}

// =====================================================================
(async () => {
  const b = await chromium.launch();
  const run = async (ten, fn) => {
    try { await fn(b); } catch (e) { check(ten + ': bộ test chạy trọn', false, e.message); }
  };
  await run('chất lên xe đẩy', chatLenXeSuite);
  await run('đẩy xe lên bệ', dayXeSuite);
  await run('lái xe máy', laiXeSuite);
  await run('nhường đường', nhuongSuite);
  await run('gục thì buông', buongSuite);
  await b.close();
  console.log(results.join('\n'));
  console.log('\n' + '═'.repeat(52));
  console.log('  ĐẠT ' + pass + '   HỎNG ' + fail);
  console.log('═'.repeat(52));
  process.exit(fail ? 1 : 0);
})();
