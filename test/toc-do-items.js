/*
 * Tốc Độ: đạo cụ (Đạo Cụ-Đơn / Đạo Cụ-Đội / Khu Luyện Tập Đạo Cụ).
 * Phần Node: luật trong js/sim/items.js (hộp, nhặt, tên lửa, lá chắn, vỏ chuối, đĩa bay, sấm sét, mực, nam châm, bot dùng).
 * Phần trình duyệt: vào trận đạo cụ, ô đạo cụ có icon, phím E dùng đạo cụ, chạm vào ô dùng đạo cụ, ảnh 1366×650 và 844×390.
 *   node test/toc-do-items.js            node test/toc-do-items.js --node (chỉ phần Node)
 *   TD_URL=<gốc> node test/toc-do-items.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { check, done, nodeSim, serve, browser, open, GAME, SHOTS } = require('./toc-do-lib.js');

const FILES = ['data/tuning.js', 'data/tracks.js', 'data/cars.js', 'data/items.js'];
for (const f of ['rng', 'track', 'kart', 'bot', 'modes', 'items', 'race']) FILES.push('js/sim/' + f + '.js');
const TD = nodeSim(FILES.filter((f) => fs.existsSync(path.join(GAME, f)))).TD;
const H = TD.TUNING.dt;
const SLOW = Number(process.env.TD_SLOW) || 1;   // máy bận (nhiều trình duyệt chạy song song): nhân mọi thời gian chờ

function run(R, sec, each) {
  const n = Math.round(sec / H), seen = [];
  for (let i = 0; i < n; i++) {
    if (each) each(R);
    TD.Race.step(R, H);
    for (const e of R.events) seen.push(e);
    R.events.length = 0;
  }
  return seen;
}
// Trận người lái tay (không bot), bỏ qua đếm ngược; xe i đặt giữa đường ở quãng s (từ vạch xuất phát) chạy kmh.
function duel(trackId, n, mode) {
  const R = TD.Race.create({ trackId, seed: 3, mode: TD.MODES[mode || 'item'], karts: Array.from({ length: n }, (_, i) => ({ ctrl: 'human', name: 'P' + i })) });
  R.phase = 'race'; R.goT = 0; R.countdown = 0;
  for (const k of R.karts) { k.st = 'drive'; k._startDone = true; k.input.throttle = 1; k.lap = 1; k.lapStartT = 0; }
  return R;
}
function place(R, k, s, d, kmh) {
  const T = R.T, c = TD.Items.at(R, T.cps[T.startCp].s + s, d || 0);
  k.x = k.px = c.x; k.z = k.pz = c.z;
  k.loc = TD.Track.locate(T, c.x, c.y + 1, c.z, null); k.y = k.loc.y;
  k.yaw = k.vyaw = Math.atan2(c.fx, c.fz); k.speed = kmh / 3.6;
  k.lastCp = T.src.pts.cp[k.loc.tp]; k.cpNext = T.cps[k.lastCp].next[0];
}
const hold = (R) => { for (const k of R.karts) if (k.ctrl === 'human') { k.input.throttle = 1; k.input.steer = 0; } };
const first = (evs, type, f) => evs.find((e) => e.type === type && (!f || f(e)));
// Rút 600 lần từ hộp đầu tiên khi xe k đang ở hạng pl: { id: số lần }.
function drawN(R, k, pl) {
  const c = {}, st = R.items.ks[k.id], b = R.items.boxes[0];
  R.phase = 'race';
  for (let i = 0; i < 600; i++) {
    R.karts.forEach((o, j) => { o.place = o === k ? pl : j + 1; o.st = o === k ? 'drive' : 'finish'; });
    st.slots = [null, null]; st.pickCool = 0; b.on = true;
    k.x = b.x; k.z = b.z; k.y = b.y;
    R.events.length = 0;
    TD.Items.step(R, H);
    const g = R.events.find((e) => e.type === 'item_get');
    if (g) c[g.item] = (c[g.item] || 0) + 1;
  }
  return c;
}

function nodePart() {
  console.log('# Node: luật đạo cụ');
  // 1. hàng hộp trên mọi đường
  for (const id of Object.keys(TD.TRACKS)) {
    const R = TD.Race.create({ trackId: id, seed: 1, mode: TD.MODES.item });
    const src = TD.TRACKS[id].boxes, rows = R.items.rows;
    const ok = src && src.length ? rows.length === src.length : rows.length >= 5 && rows.every((r) => r.length >= 3 && r.length <= 6);
    check(id + ': có hàng hộp đạo cụ', ok && R.items.boxes.length >= 15, rows.length + ' hàng, ' + R.items.boxes.length + ' hộp' + (src ? ' (propspointconfig)' : ' (tự sinh mỗi ~400 m)'));
    // hộp gốc (propspointconfig) có hộp sát mép: chỉ đòi tâm hộp không vượt mép ruy băng quá 3 m (đo: xa nhất 2,51 m, Xintiane Bao hàng 14)
    const off = R.items.boxes.filter((b) => { const l = TD.Track.locate(R.T, b.x, b.y + 1, b.z, null); return Math.max(l.d - l.lw, -l.d - l.rw) > 3 || Math.abs(l.y - b.y) > 0.5; }).length;
    check(id + ': mọi hộp nằm trên mặt đường', off === 0, off + ' hộp ngoài đường');
  }
  check('chế độ tốc độ không có hộp', TD.Race.create({ trackId: '11citynew', seed: 1 }).items === null);

  // 2. chạy qua hàng hộp thì nhặt được đạo cụ
  {
    const R = duel('11citynew', 1), k = R.karts[0], s = R.items.rows[0][0].s - R.T.cps[R.T.startCp].s;
    place(R, k, s - 30, 0, 150);
    const evs = run(R, 2, hold), g = first(evs, 'item_get');
    check('xe chạy qua hàng hộp nhặt được đạo cụ', g && TD.ITEMS[g.item] && R.items.ks[k.id].slots[0] === g.item, g ? g.item + ' sau ' + g.t.toFixed(2) + ' s' : 'không nhặt');
    check('hộp vừa nhặt ẩn rồi hồi sau ' + TD.ITEM_RULES.respawn + ' s', g && !R.items.boxes[g.box].on, g && 'hộp ' + g.box);
    run(R, TD.ITEM_RULES.respawn + 0.2, hold);
    check('hộp hồi lại', g && R.items.boxes[g.box].on);
    // ô đầy: không nhặt thêm, phát item_full
    const st = R.items.ks[k.id];
    st.slots = ['banana', 'shield'];
    place(R, k, s - 30, 0, 150);   // cùng hàng đầu (đoạn thẳng), hộp đã hồi
    const e2 = run(R, 2, hold);
    check('hai ô đầy thì không nhặt được nữa', !first(e2, 'item_get') && first(e2, 'item_full') && st.slots.join() === 'banana,shield');
  }

  // 3. tên lửa bắn xe phía trước: trúng trong 3 s, xe bị đánh bay (stunT > 0)
  const missile = (shield) => {
    const R = duel('11citynew', 2), a = R.karts[0], b = R.karts[1];
    place(R, a, 200, 0, 150); place(R, b, 260, 0, 150);
    run(R, 0.1, hold);
    if (shield) { TD.Items.give(R, b, 'shield'); TD.Items.use(R, b, 0); }
    TD.Items.give(R, a, 'missile');
    let stun = 0;
    const u = TD.Items.use(R, a, 0);
    const evs = run(R, 3, (r) => { hold(r); stun = Math.max(stun, b.fx.stunT); });
    return { R, a, b, u, evs, stun };
  };
  {
    const { u, evs, stun, b } = missile(false), h = first(evs, 'item_hit', (e) => e.item === 'missile');
    check('tên lửa khoá xe đối thủ phía trước', u && u.target === b.id, JSON.stringify(u));
    check('tên lửa trúng trong 3 s, xe bị đánh bay (stunT > 0)', h && h.kart === b.id && stun > 0.5, h ? 'trúng sau ' + h.t.toFixed(2) + ' s, stunT ' + stun.toFixed(2) : 'trượt');
    check('trúng tên lửa: xe gần như dừng', b.kmh < 60, b.kmh.toFixed(0) + ' km/h');
  }
  {
    const { evs, stun, R, b } = missile(true), bl = first(evs, 'item_block');
    check('Lá Chắn đỡ tên lửa (item_block), xe không bị choáng', bl && bl.item === 'missile' && bl.kart === b.id && stun === 0 && !first(evs, 'item_hit'), bl ? 'đỡ sau ' + bl.t.toFixed(2) + ' s' : 'không đỡ');
    check('khiên vỡ sau một đòn', R.items.ks[b.id].shieldT === 0);
  }

  // 4. vỏ chuối thả sau lưng làm xe sau xoay
  {
    const R = duel('11citynew', 2), a = R.karts[0], b = R.karts[1];
    place(R, a, 230, 0, 120); place(R, b, 200, 0, 120);
    run(R, 0.05, hold);
    TD.Items.give(R, a, 'banana'); TD.Items.use(R, a, 0);
    const bx = R.items.hz[0];
    let kind = null;
    const evs = run(R, 3, (r) => { hold(r); if (b.fx.kind) kind = b.fx.kind; });
    const h = first(evs, 'item_hit', (e) => e.item === 'banana');
    check('vỏ chuối nằm sau xe thả', bx && bx.type === 'banana' && Math.hypot(bx.x - a.x, bx.z - a.z) > 3);
    check('xe sau cán vỏ chuối thì xoay (fx.kind spin) và chuối biến mất', h && h.kart === b.id && kind === 'spin' && R.items.hz.length === 0, h ? 'sau ' + h.t.toFixed(2) + ' s' : 'không cán');
  }

  // 5. Đĩa Bay đánh hạng 1, Lá Chắn không đỡ được (33b4338e)
  {
    const R = duel('11citynew', 3), a = R.karts[0], lead = R.karts[2];
    place(R, a, 200, 0, 150); place(R, R.karts[1], 260, -2, 150); place(R, lead, 330, 2, 150);
    run(R, 0.1, hold);
    TD.Items.give(R, lead, 'shield'); TD.Items.use(R, lead, 0);
    TD.Items.give(R, a, 'ufo');
    const u = TD.Items.use(R, a, 0);
    let slow = 1;
    const evs = run(R, 3, (r) => { hold(r); if (lead.fx.slowT > 0) slow = Math.min(slow, lead.fx.slowMul); });
    const h = first(evs, 'item_hit', (e) => e.item === 'ufo');
    check('Đĩa Bay nhắm xe hạng 1', u && u.target === lead.id && lead.place === 1);
    check('Đĩa Bay xuyên Lá Chắn và làm hạng 1 giảm tốc', h && h.kart === lead.id && slow <= 0.6 && !first(evs, 'item_block'), 'slowMul ' + slow);
  }

  // 6. Sấm Sét đánh mọi đối thủ phía trước, không đánh xe phía sau
  {
    const R = duel('11citynew', 4), me = R.karts[1];
    place(R, R.karts[0], 150, 0, 140); place(R, me, 200, 0, 140); place(R, R.karts[2], 260, -2, 140); place(R, R.karts[3], 320, 2, 140);
    run(R, 0.1, hold);
    TD.Items.give(R, me, 'lightning');
    const evs = []; TD.Items.use(R, me, 0); evs.push(...R.events); R.events.length = 0;
    const hits = evs.filter((e) => e.type === 'item_hit').map((e) => e.kart).sort();
    check('Sấm Sét đánh đúng 2 xe phía trước', hits.join() === '2,3' && R.karts[2].fx.stunT > 0 && R.karts[0].fx.stunT === 0, 'trúng ' + hits.join());
  }

  // 7. Mực: lực kéo giảm rồi trả lại đúng giá trị cũ
  {
    const R = duel('11citynew', 2), a = R.karts[0], b = R.karts[1], acc0 = b.p.accel;
    place(R, a, 200, 0, 120); place(R, b, 260, 0, 120);
    run(R, 0.1, hold);
    TD.Items.give(R, a, 'ink'); TD.Items.use(R, a, 0);
    const during = b.p.accel;
    run(R, TD.ITEMS.ink.dur + 0.2, hold);
    check('Mực làm xe phía trước khó tăng tốc rồi hết', during < acc0 * 0.6 && Math.abs(b.p.accel - acc0) < 1e-9, acc0.toFixed(2) + ' → ' + during.toFixed(2) + ' → ' + b.p.accel.toFixed(2));
  }

  // 8. Nam Châm kéo mình lại gần xe phía trước
  {
    const R = duel('11citynew', 2), a = R.karts[0], b = R.karts[1];
    place(R, a, 200, 0, 140); place(R, b, 240, 0, 140);
    run(R, 0.1, hold);
    const g0 = b.progress - a.progress;
    TD.Items.give(R, a, 'magnet'); const u = TD.Items.use(R, a, 0);
    run(R, 2, hold);
    const g1 = b.progress - a.progress;
    check('Nam Châm khoá xe trước, kéo gần lại', u && u.target === b.id && g1 < g0 - 8, g0.toFixed(1) + ' → ' + g1.toFixed(1) + ' m');
  }

  // 9. Lốc Xoáy đặt phía trước cuốn cả xe của mình khi chạy vào
  {
    const R = duel('11citynew', 1), a = R.karts[0];
    place(R, a, 200, 0, 120);
    run(R, 0.05, hold);
    TD.Items.give(R, a, 'tornado'); TD.Items.use(R, a, 0);
    const tz = R.items.hz[0];
    const evs = run(R, 4, hold), h = first(evs, 'item_hit', (e) => e.item === 'tornado');
    check('Lốc Xoáy đặt giữa đường ~70 m phía trước', tz && Math.abs(TD.Track.locate(R.T, tz.x, tz.y + 1, tz.z, null).d) < 1);
    check('Lốc Xoáy cuốn cả người thả ("không phân địch ta")', h && h.kart === a.id);
  }

  // 10. Thiên Sứ chỉ có ở chế độ đội, che cả đồng đội
  {
    const R = TD.Race.create({ trackId: '11citynew', seed: 5, mode: TD.MODES.itemTeam, karts: [0, 1, 2, 3].map((i) => ({ ctrl: 'human', team: i % 2 })) });
    R.phase = 'race'; R.goT = 0;
    TD.Items.give(R, R.karts[0], 'angel'); TD.Items.use(R, R.karts[0], 0);
    const sh = R.karts.map((k) => R.items.ks[k.id].shieldT > 0 ? 1 : 0).join('');
    check('Thiên Sứ che mình và đồng đội', sh === '1010', sh);
    const team = drawN(R, R.karts[0], 3), solo = TD.Race.create({ trackId: '11citynew', seed: 5, mode: TD.MODES.item });
    const s1 = drawN(solo, solo.karts[0], 3);
    check('Thiên Sứ chỉ rút được ở chế độ đội', team.angel > 0 && !s1.angel, 'đội ' + (team.angel || 0) + ', đơn ' + (s1.angel || 0));
  }

  // 11. bot nhặt và dùng đạo cụ trong 60 s đua đạo cụ 6 xe
  for (const id of ['11citynew', 'chinatown']) {
    const R = TD.Race.create({ trackId: id, seed: 9, mode: TD.MODES.item });
    const evs = run(R, TD.TUNING.countdown + 60);
    const n = (t) => evs.filter((e) => e.type === t).length;
    const used = {};
    evs.filter((e) => e.type === 'item_use').forEach((e) => { used[e.item] = (used[e.item] || 0) + 1; });
    check(id + ': bot nhặt, dùng đạo cụ và trúng nhau trong 60 s', n('item_get') >= 6 && n('item_use') >= 4 && n('item_hit') >= 1,
      'nhặt ' + n('item_get') + ', dùng ' + n('item_use') + ' ' + JSON.stringify(used) + ', trúng ' + n('item_hit') + ', đỡ ' + n('item_block'));
    const resp = R.karts.reduce((a, k) => a + k.stats.respawns, 0);
    check(id + ': đạo cụ không làm xe văng khỏi đường hàng loạt', resp <= 6, resp + ' lần hồi sinh');
  }
  // 12. rút theo hạng: hạng 1 không có Đĩa Bay, hạng cuối nhiều tên lửa/nam châm hơn hạng 1
  {
    const R = TD.Race.create({ trackId: '11citynew', seed: 4, mode: TD.MODES.item });
    const a = drawN(R, R.karts[0], 1), z = drawN(R, R.karts[0], 6);
    const atk = (c) => (c.missile || 0) + (c.magnet || 0) + (c.lightning || 0) + (c.ufo || 0);
    check('hạng 1 không rút Đĩa Bay, hạng cuối rút đạo cụ tấn công nhiều hơn', !a.ufo && atk(z) > atk(a) * 2, 'hạng 1 ' + JSON.stringify(a) + ' | hạng 6 ' + JSON.stringify(z));
  }
}

async function browserPart() {
  console.log('\n# Trình duyệt');
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = await serve();
  const br = await browser();
  for (const vp of [{ width: 1366, height: 650, touch: false }, { width: 844, height: 390, touch: true }]) {
    const tag = vp.width + 'x' + vp.height;
    const { page, problems } = await open(br, srv.base, 'index.html', { width: vp.width, height: vp.height }, vp.touch ? { hasTouch: true, isMobile: true } : {});
    const until = async (fn, arg, ms) => { try { await page.waitForFunction(fn, arg, { timeout: (ms || 60000) * SLOW, polling: 200 }); return true; } catch (e) { return false; } };
    check(tag + ': sảnh mở', await until(() => window.TD && TD.main && TD.main.state === 'lobby', null, 90000));
    await page.evaluate(() => { TD.save.d.track = 'chinatown'; TD.main.startRace({ mode: 'item' }); });
    check(tag + ': vào trận Đạo Cụ-Đơn', await until(() => TD.main.state === 'race' && TD.main.race && TD.main.race.items, null, 120000));
    await page.evaluate(() => { TD.main.introT = 99; TD.main.timeScale = 3; });
    await until(() => TD.main.race.phase === 'race', null, 60000);
    // ô đạo cụ: trao Tên Lửa + Lá Chắn cho mình, ô hiện icon gốc
    const slot = await page.evaluate(() => {
      const R = TD.main.race, me = TD.main.me;
      TD.Items.give(R, me, 'missile'); TD.Items.give(R, me, 'shield');
      return R.items.ks[me.id].slots.join();
    });
    check(tag + ': hai ô có đạo cụ', slot === 'missile,shield', slot);
    await until(() => TD.itemsView.debug().icons === 2, null, 120000);
    const hud = await page.evaluate(() => TD.itemsView && TD.itemsView.debug());
    check(tag + ': ô đạo cụ vẽ icon gốc trên HUD', hud && hud.slots.length === 2 && hud.slots.every((s) => s.w >= 44 && s.x >= 0 && s.x + s.w <= vp.width && s.y + s.h <= vp.height) && hud.icons === 2,
      JSON.stringify(hud));
    await page.screenshot({ path: require('path').join(SHOTS, 'items-slots-' + tag + '.png'), timeout: 60000 * SLOW });
    if (!vp.touch) {
      await page.keyboard.press('KeyE');
      check(tag + ': phím E dùng đạo cụ ô 1', await until(() => TD.main.race.items.ks[TD.main.me.id].slots[0] === null, null, 10000));
      await page.keyboard.press('KeyQ');
      check(tag + ': phím Q dùng đạo cụ ô 2 (bật Lá Chắn)', await until(() => TD.main.race.items.ks[TD.main.me.id].slots[1] === null && TD.main.race.items.ks[TD.main.me.id].shieldT > 0, null, 10000));
    } else {
      const r = hud.slots[0];
      await page.touchscreen.tap(r.x + r.w / 2, r.y + r.h / 2);
      check(tag + ': chạm ô 1 dùng đạo cụ', await until(() => TD.main.race.items.ks[TD.main.me.id].slots[0] === null, null, 10000));
    }
    // cho mình tự lái, trận chạy có đạo cụ bay: chụp lúc có vật thể đạo cụ trên màn
    await page.evaluate(() => {
      const R = TD.main.race, me = TD.main.me;
      me.ctrl = 'bot'; TD.Bot.init(me, R, 0.9); TD.main.timeScale = 3;
      TD.Items.give(R, me, 'ufo');
    });
    const flying = await until(() => { const I = TD.main.race.items; return I.proj.length + I.hz.length > 0 && TD.itemsView.debug().objects > 0; }, null, 120000);
    check(tag + ': có đạo cụ đang bay / nằm trên đường được vẽ', flying, JSON.stringify(await page.evaluate(() => TD.itemsView.debug())));
    await page.evaluate(() => { TD.main.timeScale = 0.0001; });
    await page.waitForTimeout(400);
    await page.screenshot({ path: require('path').join(SHOTS, 'items-race-' + tag + '.png'), timeout: 60000 * SLOW });
    await page.evaluate(() => { TD.main.timeScale = 3; });
    const ev = await until(() => TD.itemsView.debug().seen.item_use >= 3 && TD.itemsView.debug().seen.item_hit >= 1, null, 240000);
    check(tag + ': trận có dùng và trúng đạo cụ', ev, JSON.stringify(await page.evaluate(() => TD.itemsView.debug().seen)));
    check(tag + ': không lỗi trang', problems.length === 0, problems.slice(0, 4).join(' | '));
    await page.context().close();
  }
  await br.close(); srv.close();
}

(async () => {
  nodePart();
  if (!process.argv.includes('--node')) await browserPart();
  done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
