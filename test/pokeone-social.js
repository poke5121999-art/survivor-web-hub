/*
 * PokéOne — lớp trực tuyến (games/pokeone/js/{net,chat,raid,market}.js, db/pokeone-market.sql).
 *
 * Chạy:  node test/pokeone-social.js
 *   PGLITE_PATH=<thư mục chứa node_modules/@electric-sql/pglite>  bật phần [sql] (Postgres WASM chạy
 *   db/pokeone-market.sql thật, auth.uid() giả). Không có thì phần đó bỏ qua và ghi rõ.
 *
 * [trang]  Trang thử dựng ảo trong games/pokeone/ (nạp đúng tệp thật của trò chơi + cảnh world/battle giả theo hợp đồng
 *          trong brain/plans/pokeone-2d-pro.md) — vì world.js/battle.js đang được viết lại song song.
 * [mạng]   Hai trình duyệt trên Supabase Realtime THẬT, kênh riêng ?netns=test-<ngẫu nhiên>: chat, khoe Pokémon, boss.
 * [chợ]    Đường "chưa cài bảng" gọi PostgREST THẬT; cửa sổ chợ có hàng dùng dữ liệu giả (chỉ để chụp giao diện).
 * Ảnh chụp: SHOTS (mặc định %TEMP%/pokeone-social-shots).
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'pokeone-social-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.ttf': 'font/ttf', '.css': 'text/css',
  '.ogg': 'audio/ogg', '.json': 'application/json' };
const NS = 'test-' + Math.random().toString(36).slice(2, 8);

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? '✔ ' : '✘ ') + name + (detail !== undefined ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms, step) {
  const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > (ms || 8000)) return v; await sleep(step || 150); }
}

/* ---------------------------------------------------------------- trang thử */

const HARNESS = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="css/p1.css"><link rel="stylesheet" href="css/social.css">
<style>html,body{margin:0;height:100%;overflow:hidden;background:#1b2530}*{box-sizing:border-box}
#view{position:fixed;inset:0;width:100%;height:100%}#ui{position:fixed;inset:0;pointer-events:none}#ui>*{pointer-events:auto}</style>
</head><body><canvas id="view"></canvas><div id="ui"></div>
<script src="vendor/pkmn-sim-0.10.11.min.js"></script>
<script src="data/gamedata.js"></script>
<script src="data/pro-ui.js"></script>
<script src="js/core.js"></script>
<script src="js/engine.js"></script>
<script src="js/proui.js"></script>
<script src="../../js/supabase-config.js"></script>
<script src="../../js/session.js"></script>
<script src="../../js/supabase-auth.js"></script>
<script src="js/net.js"></script>
<script src="js/chat.js"></script>
<script src="js/raid.js"></script>
<script src="js/market.js"></script>
<script>
(function () {
  const q = new URLSearchParams(location.search);
  // Cảnh giả theo hợp đồng: world vẽ nền; battle kind:'boss' gọi boss.report/sharedHp/ended như battle.js sẽ làm.
  P1.scene.add('world', { enter() {}, render() { const v = P1.view(); v.ctx.fillStyle = '#3d6b3a'; v.ctx.fillRect(0, 0, v.w, v.h);
    v.ctx.fillStyle = '#fff'; v.ctx.font = '16px Arial'; v.ctx.fillText('world (giả) — ' + P1.net.me.name, 20, 30); } });
  P1.scene.add('battle', {
    enter(a) { window.__battle = { args: a, total: 0, done: false, hp: a.boss ? a.boss.maxHp : 0 }; },
    update() {
      const b = window.__battle;
      if (!b || b.done || !b.args.boss) return;
      b.hp = Math.min(b.hp, b.args.boss.sharedHp());
      if (b.args.boss.sharedHp() <= 0) finish('win'); else if (b.args.boss.ended()) finish('lose');
    },
    render() { const v = P1.view(), b = window.__battle; v.ctx.fillStyle = '#20304a'; v.ctx.fillRect(0, 0, v.w, v.h);
      v.ctx.fillStyle = '#fff'; v.ctx.font = '16px Arial'; v.ctx.fillText('battle (giả) — boss HP ' + (b ? b.hp : '?'), 20, v.h - 30); },
  });
  function finish(outcome) { const b = window.__battle; b.done = true; b.args.onEnd({ outcome, money: 0, exp: 0 }); }
  window.__hit = n => { const b = window.__battle; b.total += n; b.args.boss.report(b.total); };
  window.__faint = () => finish('lose');
  P1.view();
  P1.proui.ready().then(() => {
    P1.newGame();
    P1.state.player.name = q.get('name') || 'Tester';
    P1.state.party = [P1.mon.create(25, 22, { ot: P1.state.player.name }), P1.mon.create(1, 12, { ot: P1.state.player.name })];
    P1.state.map = 'viridian_city';
    P1.start('world', {});
    window.__ready = true;
  });
})();
</script></body></html>`;

function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      if (u === '/games/pokeone/__social.html') { r.writeHead(200, { 'Content-Type': MIME['.html'] }); r.end(HARNESS); return; }
      fs.readFile(path.join(ROOT, u), (e, b) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' });
        r.end(b);
      });
    }).listen(0, () => res(srv));
  });
}

async function openPage(browser, base, name, extra) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  if (extra && extra.session) await ctx.addInitScript(s => localStorage.setItem('hub.session.v1', JSON.stringify(s)), extra.session);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) page.errors.push(m.text()); });
  await page.goto(base + '/games/pokeone/__social.html?netns=' + NS + '&name=' + encodeURIComponent(name));
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });
  return page;
}
async function shot(page, file) { const p = path.join(SHOTS, file); await page.screenshot({ path: p }); return p; }

/* ---------------------------------------------------------------- [thuần] trong trang thật */

async function pureChecks(page) {
  console.log('\n[thuần]');
  const r = await page.evaluate(() => {
    const out = {};
    const mon = P1.mon.create(25, 22, { ot: 'Ash' });
    mon.nick = 'Sparky';
    const card = P1.net.cardOf(mon);
    out.cardKeys = Object.keys(card).sort().join(',');
    out.cardMoves = card.moves;
    out.roundTrip = JSON.stringify(P1.net.parseCard(JSON.parse(JSON.stringify(card)))) === JSON.stringify(P1.net.parseCard(card));
    out.badDex = P1.net.parseCard({ dex: 999, level: 5 });
    out.badLevel = P1.net.parseCard({ dex: 25, level: 0 });
    const evil = P1.net.parseCard({ dex: 25, level: 50, ivs: { hp: 99, atk: -4 }, nick: '<img src=x onerror=alert(1)>ABCDEFGHIJKLMNOP', moves: ['a', 'b', 'c', 'd', 'e'], ball: 'po<ke' });
    out.evil = { hp: evil.ivs.hp, atk: evil.ivs.atk, nick: evil.nick, moves: evil.moves.length, ball: evil.ball };
    out.esc = P1.net.esc('<b a="1">&\'');
    out.html = P1.chat.cardHtml(evil).includes('<img src=x');
    const pm = P1.net.parseMon({ dex: 4, level: 12, ivs: { hp: 40, atk: 31 }, evs: { hp: 400, atk: 400 }, moves: [{ id: 'ember', pp: 99 }, { id: 'notamove' }, 'scratch'],
      nature: 'Adamant', ability: 'Levitate', nick: 'x'.repeat(40), item: 'masterball', exp: -5, shiny: true });
    out.parseMon = { hp: pm.ivs.hp, evSum: Object.values(pm.evs).reduce((a, b) => a + b, 0), moves: pm.moves.map(m => m.id + ':' + m.pp + '/' + m.ppMax),
      nature: pm.nature, ability: pm.ability, nick: pm.nick.length, item: pm.item, exp: pm.exp === P1.mon.expAt(4, 12), shiny: pm.shiny, fullHp: pm.hp === P1.mon.stats(pm).hp };
    out.parseMonBad = [P1.net.parseMon(null), P1.net.parseMon({ dex: 0, level: 5 }), P1.net.parseMon({ dex: 25, level: 101 })];
    const L = { start_price: 1000, top_bid: null };
    out.minBid = [P1.market.minBid(L), P1.market.minBid({ start_price: 1000, top_bid: 1000 }), P1.market.minBid({ start_price: 5, top_bid: 10 }), P1.market.minBid({ start_price: 500, top_bid: 2001 })];
    out.outcome = [{ ok: true }, { ok: false, unreachable: true }, { ok: false, status: 503 }, { ok: false, status: 400, message: 'p1:ended' },
      { ok: false, noAccount: true }, { ok: false, status: 404, code: 'PGRST202' }].map(P1.market.outcome);
    out.errText = [P1.market.errText({ status: 400, message: 'p1:bid_low 1050' }), P1.market.errText({ status: 400, message: 'p1:too_many' }),
      P1.market.errText({ status: 404, code: 'PGRST205' })];
    out.today = P1.raid.openToday(Date.parse('2026-09-28T03:00:00Z'));
    out.todaySame = JSON.stringify(P1.raid.openToday(Date.parse('2026-09-28T10:00:00Z'))) === JSON.stringify(out.today);
    out.todayVN = P1.raid.dayKey(Date.parse('2026-09-28T18:00:00Z'));
    const days = []; for (let d = 0; d < 60; d++) days.push(P1.raid.openToday(Date.parse('2026-01-01T05:00:00Z') + d * 864e5));
    out.rotation = { alwaysThree: days.every(x => new Set(x).size === 3), alwaysLv30: days.every(x => P1.raid.BOSSES[x[0]].level === 30),
      distinct: new Set(days.map(x => x.join())).size, all: [...new Set(days.flat())].length };
    out.maxHp = [P1.raid.maxHpFor('snorlax', 1), P1.raid.maxHpFor('snorlax', 2), P1.raid.maxHpFor('snorlax', 4)];
    // Hội tụ: mỗi người phát tổng luỹ kế; nhận theo thứ tự lộn xộn, trùng lặp, thiếu gói giữa chừng → cùng một HP.
    const reports = [['a', 10], ['a', 30], ['b', 5], ['a', 60], ['b', 45], ['c', 20], ['b', 45], ['a', 30], ['c', 20], ['a', 60]];
    const fold = seq => { const d = {}; seq.forEach(([id, t]) => { d[id] = Math.max(d[id] || 0, t); }); return P1.raid.sharedHpOf(500, d, ['a', 'b', 'c']); };
    const shuffled = reports.slice().reverse().concat(reports.slice(3));
    out.converge = [fold(reports), fold(shuffled), fold(reports.filter((_, i) => i !== 1 && i !== 4)), P1.raid.sharedHpOf(500, { a: 60, b: 45, c: 20, z: 999 }, ['a', 'b', 'c'])];
    out.invite = [P1.raid.parseInvite({ room: 'rabc12345', boss: 'snorlax', host: 'Ash', slots: 9, expires: Date.now() + 60000 }),
      P1.raid.parseInvite({ room: 'bad room', boss: 'snorlax', expires: Date.now() + 1 }), P1.raid.parseInvite({ room: 'rabc12345', boss: 'pikachu', expires: Date.now() + 1 })];
    return out;
  });
  check('cardOf → MonCard đủ khoá hợp đồng', r.cardKeys === 'ability,ball,dex,gender,ivs,level,moves,nature,nick,ot,shiny', r.cardKeys);
  check('cardOf đổi id chiêu thành tên', r.cardMoves.length > 0 && r.cardMoves.every(m => /^[A-Z]/.test(m)), r.cardMoves.join(', '));
  check('parseCard(JSON) giữ nguyên thẻ', r.roundTrip);
  check('parseCard từ chối dex/level ngoài miền', r.badDex === null && r.badLevel === null);
  check('parseCard kẹp IV, cắt nick 12, chiêu ≤4, bóng chỉ chữ thường', r.evil.hp === 31 && r.evil.atk === 0 && r.evil.nick.length === 12 && r.evil.moves === 4 && r.evil.ball === 'poke', r.evil);
  check('esc thoát &<>"\'', r.esc === '&lt;b a=&quot;1&quot;&gt;&amp;&#39;', r.esc);
  check('thẻ hiển thị không chèn HTML từ nick', !r.html);
  check('parseMon kẹp IV/EV, bỏ chiêu lạ, kẹp PP, bỏ đặc tính sai loài, bỏ vật phẩm, đầy máu',
    r.parseMon.hp === 31 && r.parseMon.evSum <= 510 && r.parseMon.moves.join() === 'ember:25/25,scratch:35/35' && r.parseMon.nature === 'Adamant' &&
    r.parseMon.ability !== 'Levitate' && r.parseMon.nick === 12 && r.parseMon.item === '' && r.parseMon.exp && r.parseMon.shiny && r.parseMon.fullHp, r.parseMon);
  check('parseMon từ chối rác', r.parseMonBad.every(x => x === null));
  check('minBid: khởi điểm, +5 % (≥1), làm tròn lên', JSON.stringify(r.minBid) === '[1000,1050,11,2102]', r.minBid);
  check('outcome: ok / unknown (mất mạng, 5xx) / reject (4xx, chưa đăng nhập, chưa cài)',
    JSON.stringify(r.outcome) === '["ok","unknown","unknown","reject","reject","reject"]', r.outcome);
  check('errText đọc mã p1:… từ máy chủ', r.errText[0] === 'Giá tối thiểu hiện tại là ₽1050.' && /10 phiên/.test(r.errText[1]) && /db\/pokeone-market\.sql/.test(r.errText[2]), r.errText);
  check('boss hôm nay: cố định trong ngày (giờ VN)', r.todaySame && r.today.length === 3, r.today);
  check('dayKey theo UTC+7 (18:00Z = hôm sau ở VN)', r.todayVN === '2026-09-29', r.todayVN);
  check('60 ngày: luôn 3 boss khác nhau, boss đầu Lv30, đủ 7 boss xuất hiện', r.rotation.alwaysThree && r.rotation.alwaysLv30 && r.rotation.all === 7, r.rotation);
  check('máu boss chung theo số người (+80 %/người)', JSON.stringify(r.maxHp) === '[450,810,1530]', r.maxHp);
  check('HP chung hội tụ: lộn thứ tự, trùng, mất gói, id lạ không tính', r.converge.every(x => x === 375), r.converge);
  check('parseInvite: kẹp slots, từ chối mã phòng/boss sai', r.invite[0] && r.invite[0].slots === 4 && r.invite[1] === null && r.invite[2] === null, r.invite[0]);
}

/* ---------------------------------------------------------------- [sql] Postgres WASM */

async function sqlChecks() {
  console.log('\n[sql] db/pokeone-market.sql');
  let PGlite;
  try {
    const p = process.env.PGLITE_PATH ? path.join(process.env.PGLITE_PATH, 'node_modules/@electric-sql/pglite/dist/index.js') : '@electric-sql/pglite';
    ({ PGlite } = await import(p.startsWith('@') ? p : 'file:///' + p.replace(/\\/g, '/')));
  } catch (e) { console.log('  (bỏ qua: không tìm thấy @electric-sql/pglite — đặt PGLITE_PATH)'); return; }
  const db = new PGlite();
  await db.exec(`create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role anon; create role authenticated;`);
  const sql = fs.readFileSync(path.join(ROOT, 'db/pokeone-market.sql'), 'utf8');
  await db.exec(sql);
  await db.exec(sql);
  check('chạy SQL hai lần không lỗi (lặp lại được)', true);
  const U = { A: '00000000-0000-0000-0000-00000000000a', B: '00000000-0000-0000-0000-00000000000b', C: '00000000-0000-0000-0000-00000000000c' };
  await db.exec(`insert into auth.users values ('${U.A}'), ('${U.B}'), ('${U.C}')`);
  let n = 0;
  const nonce = () => '10000000-0000-0000-0000-' + String(++n).padStart(12, '0');
  async function as(who, q, params) {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [who ? U[who] : '']);
    try { const r = await db.query(q, params || []); return { ok: true, v: r.rows[0] && Object.values(r.rows[0])[0], rows: r.rows }; }
    catch (e) { return { ok: false, err: e.message }; }
  }
  const mon = { dex: 25, level: 20, ivs: { hp: 31 } }, card = { dex: 25, level: 20 };
  const list = (who, nn, price, buy, hours) => as(who, 'select public.p1_list($1,$2,$3,$4,$5,$6,$7)', [nn, mon, card, who, price, buy, hours]);
  const bid = (who, nn, id, amt) => as(who, 'select public.p1_bid($1,$2,$3,$4)', [nn, id, amt, who]);
  const claim = (who, tok) => as(who, 'select public.p1_claim($1)', [tok]);
  const expire = id => db.query("update public.p1_listings set ends_at = now() - interval '1 second' where id = $1", [id]);

  check('chưa đăng nhập → p1:not_signed_in', /p1:not_signed_in/.test((await list(null, nonce(), 100, null, 1)).err));
  check('thời gian lạ → p1:bad_duration', /bad_duration/.test((await list('A', nonce(), 100, null, 3)).err));
  check('mua đứt ≤ khởi điểm → p1:bad_price', /bad_price/.test((await list('A', nonce(), 100, 100, 1)).err));
  check('mon quá 8 KB → p1:bad_mon', /bad_mon/.test((await as('A', 'select public.p1_list($1,$2,$3,$4,$5,$6,$7)', [nonce(), { dex: 25, pad: 'x'.repeat(9000) }, card, 'A', 100, null, 1])).err));
  const n1 = nonce();
  const l1 = await list('A', n1, 1000, 5000, 24);
  const l1again = await list('A', n1, 1000, 5000, 24);
  check('p1_list tạo phiên; gọi lại cùng nonce trả đúng phiên cũ', l1.ok && l1again.ok && l1.v.id === l1again.v.id, l1.ok ? l1.v.id : l1.err);
  const id1 = l1.v.id;
  check('không trả giá phiên của mình', /own_listing/.test((await bid('A', nonce(), id1, 2000)).err));
  check('dưới giá khởi điểm → p1:bid_low 1000', /p1:bid_low 1000/.test((await bid('B', nonce(), id1, 999)).err));
  const b1n = nonce();
  const b1 = await bid('B', b1n, id1, 1000);
  const b1again = await bid('B', b1n, id1, 1000);
  check('B trả 1000; gọi lại cùng nonce không tạo lượt thứ hai', b1.ok && b1again.ok && b1again.v.repeat === true && b1again.v.bid_id === b1.v.bid_id, b1.ok ? b1.v : b1.err);
  check('C phải trả ≥ 1050 (+5 %)', /p1:bid_low 1050/.test((await bid('C', nonce(), id1, 1049)).err));
  const c1 = await bid('C', nonce(), id1, 1050);
  check('C trả 1050 dẫn đầu', c1.ok);
  const bClaim = await claim('B', '20000000-0000-0000-0000-000000000001');
  check('B bị vượt → p1_claim hoàn 1000 ngay (phiên còn mở)', bClaim.ok && bClaim.v.length === 1 && bClaim.v[0].reason === 'refund' && bClaim.v[0].amount === 1000, bClaim.v || bClaim.err);
  const bClaim2 = await claim('B', '20000000-0000-0000-0000-000000000001');
  const bClaim3 = await claim('B', '20000000-0000-0000-0000-000000000002');
  check('gọi lại cùng token trả lại đúng món đó; token mới không hoàn lần hai', JSON.stringify(bClaim2.v) === JSON.stringify(bClaim.v) && bClaim3.v.length === 0, [bClaim2.v, bClaim3.v]);
  const cEarly = await claim('C', '20000000-0000-0000-0000-000000000003');
  check('C đang dẫn: chưa được nhận gì', cEarly.ok && cEarly.v.length === 0);
  check('A không huỷ được phiên đã có người trả', /has_bids/.test((await as('A', 'select public.p1_cancel($1)', [id1])).err));
  await expire(id1);
  check('hết giờ → không trả giá được nữa', /p1:ended/.test((await bid('B', nonce(), id1, 5000)).err));
  const cWon = await claim('C', '20000000-0000-0000-0000-000000000004');
  check('C thắng → nhận Pokémon (mon jsonb đầy đủ)', cWon.v.length === 1 && cWon.v[0].kind === 'mon' && cWon.v[0].reason === 'won' && cWon.v[0].mon.ivs.hp === 31, cWon.v);
  const aSold = await claim('A', '20000000-0000-0000-0000-000000000005');
  check('A nhận tiền bán 1050, không nhận lại Pokémon', aSold.v.length === 1 && aSold.v[0].reason === 'sold' && aSold.v[0].amount === 1050, aSold.v);
  const cAgain = await claim('C', '20000000-0000-0000-0000-000000000006');
  check('C nhận lần nữa bằng token mới: trống (không giao trùng)', cAgain.v.length === 0);

  const l2 = await list('A', nonce(), 100, 400, 6);
  const buy = await bid('B', nonce(), l2.v.id, 999);
  check('mua đứt: trả ≥ giá mua đứt bị hạ về đúng 400 và kết thúc ngay', buy.ok && buy.v.amount === 400 && buy.v.ended === true, buy.v || buy.err);
  const bWon = await claim('B', '20000000-0000-0000-0000-000000000007');
  check('B nhận Pokémon mua đứt ngay (không chờ hết giờ)', bWon.v.some(x => x.kind === 'mon' && x.reason === 'won' && x.listing === l2.v.id), bWon.v);

  const l3 = await list('A', nonce(), 100, null, 1);
  const cancel = await as('A', 'select public.p1_cancel($1)', [l3.v.id]);
  const cancel2 = await as('A', 'select public.p1_cancel($1)', [l3.v.id]);
  check('huỷ phiên chưa ai trả; huỷ lại vô hại', cancel.ok && cancel2.ok);
  check('người khác không huỷ được', /not_yours|p1:/.test((await as('B', 'select public.p1_cancel($1)', [l3.v.id])).err));
  const l4 = await list('A', nonce(), 100, null, 1);
  await expire(l4.v.id);
  const aBack = await claim('A', '20000000-0000-0000-0000-000000000008');
  check('Pokémon huỷ + ế đều về lại người bán qua p1_claim', aBack.v.filter(x => x.kind === 'mon' && x.reason === 'returned').length === 2, aBack.v.map(x => x.reason + '#' + x.listing));

  const open = [];
  for (let i = 0; i < 10; i++) open.push(await list('C', nonce(), 10, null, 24));
  check('10 phiên mở đầu tiên được nhận', open.every(x => x.ok));
  check('phiên thứ 11 → p1:too_many', /too_many/.test((await list('C', nonce(), 10, null, 24)).err));

  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [U.A]);
  const denied = async q => { try { await db.query(q); return false; } catch (e) { return /permission denied|row-level security/.test(e.message); } };
  await db.exec('set role authenticated');
  const readOk = (await db.query('select count(*)::int as n from public.p1_listings')).rows[0].n > 0;
  const noInsert = await denied(`insert into public.p1_listings (seller_name, nonce, mon, card, start_price, ends_at) values ('x', gen_random_uuid(), '{}', '{}', 1, now())`);
  const noUpdate = await denied('update public.p1_listings set top_bid = 1');
  const noDelete = await denied('delete from public.p1_bids');
  await db.exec('reset role; set role anon');
  const anonRead = (await db.query('select count(*)::int as n from public.p1_bids')).rows[0].n > 0;
  const anonNoRpc = await denied(`select public.p1_claim('20000000-0000-0000-0000-000000000009')`);
  await db.exec('reset role');
  check('authenticated: đọc được, không insert/update/delete thẳng', readOk && noInsert && noUpdate && noDelete, { readOk, noInsert, noUpdate, noDelete });
  check('anon: đọc được, không gọi được hàm ghi', anonRead && anonNoRpc, { anonRead, anonNoRpc });
  await db.close();
}

/* ---------------------------------------------------------------- [mạng] hai trình duyệt */

async function netChecks(browser, base) {
  console.log('\n[mạng] Supabase Realtime thật, kênh ' + NS);
  const A = await openPage(browser, base, 'Ash'), B = await openPage(browser, base, 'Misty');
  const online = p => p.evaluate(() => (document.querySelector('.p1-chat .online') || {}).textContent || '');
  const [oa, ob] = [await until(async () => /^2 online/.test(await online(A)) && online(A), 15000), await until(async () => /^2 online/.test(await online(B)) && online(B), 15000)];
  check('chat tự gắn ở cảnh world, presence thấy 2 người', /^2 online/.test(oa) && /^2 online/.test(ob), [oa, ob]);
  check('danh tính: id khách ổn định lưu ở pokeone.netid, tên = tên huấn luyện viên',
    await A.evaluate(() => P1.net.me.id === localStorage.getItem('pokeone.netid') && P1.net.me.name === 'Ash' && P1.net.me.member === false));

  await A.keyboard.press('Enter');
  const focused = await A.evaluate(() => document.activeElement && document.activeElement.closest('.p1-chat') !== null);
  await A.keyboard.type('xin chào wasd <b>');
  const moved = await A.evaluate(() => ['up', 'down', 'left', 'right', 'a'].filter(k => P1.input.held[k] || P1.input.take(k)));
  await A.keyboard.press('Enter');
  check('Enter mở ô chat; gõ WASD không làm nhân vật đi', focused && moved.length === 0, moved);
  const got = await until(() => B.evaluate(() => [...document.querySelectorAll('.p1-chat .l.chat')].map(e => e.textContent).find(t => /xin chào/.test(t))), 8000);
  check('B nhận chat của A, HTML bị thoát', got === 'Ash: xin chào wasd <b>' && !(await B.evaluate(() => !!document.querySelector('.p1-chat .log b b'))), got);
  check('gửi xong ô chat trả focus về game', await A.evaluate(() => document.activeElement === document.body));
  await A.evaluate(() => P1.chat.send('lần 2'));
  const limited = await A.evaluate(() => P1.chat.lines.slice(-1)[0].text);
  check('giới hạn 1 tin / 1,5 s (dòng hệ thống xám)', /chậm lại/.test(limited), limited);
  await sleep(1600);

  await A.evaluate(() => { P1.state.party[0].shiny = true; P1.chat.showMon(P1.state.party[0]); });
  const link = await until(() => B.evaluate(() => { const a = document.querySelector('.p1-chat .l.show a.mon'); return a && a.textContent; }), 8000);
  check('B thấy liên kết Pokémon A khoe', /Pikachu ★ Lv22/.test(link || ''), link);
  await shot(B, '1-chat.png');
  await B.click('.p1-chat .l.show a.mon');
  const card = await B.evaluate(() => { const c = document.querySelector('[data-pop="pokecard"]'); return c && { title: c.querySelector('.p1s-head').textContent, name: c.querySelector('.pc-name').textContent, iv: c.querySelectorAll('.pc-ivs > div').length, moves: c.querySelectorAll('.pc-moves > div').length, img: c.querySelector('.pc-art img').getAttribute('src') }; });
  check('bấm liên kết mở thẻ Pokémon (6 IV, chiêu, ảnh front shiny)', card && /Ash/.test(card.title) && /Pikachu/.test(card.name) && card.iv === 6 && card.moves >= 1 && card.img === 'art/pro/poke/front/25s.png', card);
  await shot(B, '2-pokecard.png');
  await B.keyboard.press('KeyW');
  await B.keyboard.press('Escape');
  const popKeys = await B.evaluate(() => ({ moved: P1.input.take('up'), menu: P1.input.take('menu'), open: !!document.querySelector('[data-pop="pokecard"]') }));
  check('popup mở: phím không tới nhân vật, Esc đóng popup', !popKeys.moved && !popKeys.menu && !popKeys.open, popKeys);

  const boss = await A.evaluate(() => P1.raid.openToday()[0]);
  await A.evaluate(id => P1.raid.openLobby(id), boss);
  const inv = await until(() => B.evaluate(() => { const b = document.querySelector('.p1-chat .l.invite button.join'); return b && !b.disabled; }), 8000);
  check('mở phòng boss tự đăng lời mời; B thấy nút Tham gia', !!inv);
  await B.click('.p1-chat .l.invite button.join');
  const both = await until(async () => {
    const a = await A.evaluate(() => P1.raid.room && P1.raid.room.roster.length), b = await B.evaluate(() => P1.raid.room && P1.raid.room.phase);
    return a === 2 && b === 'lobby' && [a, b];
  }, 10000);
  check('B vào phòng qua lời mời; hai bên thấy 2 người', !!both, both);
  const slots = await A.evaluate(() => [...document.querySelectorAll('[data-pop="raid-lobby"] .p1s-slot:not(.empty) b')].map(e => e.textContent));
  check('phòng chờ liệt kê tên + Pokémon dẫn đầu', slots.join() === 'Ash,Misty', slots);
  await shot(A, '3-lobby.png');
  await A.click('[data-pop="raid-lobby"] .p1s-btn.primary');
  const inBattle = await until(async () => (await A.evaluate(() => P1.scene.name)) === 'battle' && (await B.evaluate(() => P1.scene.name)) === 'battle', 10000);
  check('chủ phòng bấm Bắt đầu → cả hai vào trận boss sau đếm ngược', !!inBattle);
  const args = await Promise.all([A, B].map(p => p.evaluate(() => { const a = window.__battle.args; return { kind: a.kind, maxHp: a.boss.maxHp, foe: a.foe[0].dex, lvl: a.foe[0].level, ivs: JSON.stringify(a.foe[0].ivs), bg: a.bg }; })));
  const expHp = await A.evaluate(id => P1.raid.maxHpFor(id, 2), boss);
  check('trận kind:boss, cùng maxHp theo 2 người, cùng một con boss (IV theo seed)', args[0].kind === 'boss' && args[0].maxHp === expHp && JSON.stringify(args[0]) === JSON.stringify(args[1]), args);
  check('khung chat ẩn trong trận', await A.evaluate(() => !document.querySelector('.p1-chat')));
  await A.evaluate(() => __hit(100));
  await B.evaluate(() => __hit(150));
  const conv = await until(async () => {
    const [a, b] = await Promise.all([A.evaluate(() => P1.raid.room.sharedHp), B.evaluate(() => P1.raid.room.sharedHp)]);
    return a === expHp - 250 && b === expHp - 250 && [a, b];
  }, 8000);
  check('HP chung hội tụ trên cả hai máy (maxHp − 100 − 150)', !!conv, conv || await Promise.all([A, B].map(p => p.evaluate(() => P1.raid.room))));
  await A.evaluate(() => { window.__battle.args.boss.report(40); window.__battle.args.boss.report(100); });
  await A.evaluate(() => __hit(100));
  const conv2 = await until(async () => {
    const [a, b] = await Promise.all([A.evaluate(() => P1.raid.room.sharedHp), B.evaluate(() => P1.raid.room.sharedHp)]);
    return a === expHp - 350 && b === expHp - 350 && [a, b];
  }, 8000);
  check('báo lại tổng cũ vô hại; tổng mới cộng dồn (maxHp − 350)', !!conv2, conv2);
  await sleep(400);
  const panel = await A.evaluate(() => { const p = document.querySelector('.p1s-raidpanel'); return p && p.textContent; });
  check('bảng đồng đội trong trận: tên + sát thương', /Ash/.test(panel || '') && /Misty/.test(panel || '') && /200/.test(panel || '') && /150/.test(panel || ''), panel);
  await shot(A, '4-raid-panel.png');

  const before = await Promise.all([A, B].map(p => p.evaluate(() => ({ money: P1.state.money, n: P1.state.party.length + P1.state.box.length }))));
  await B.evaluate(() => __faint());
  const waitB = await until(() => B.evaluate(() => P1.raid.room && P1.raid.room.phase === 'wait' && P1.scene.name === 'world'), 5000);
  check('B gục → về world, chờ đội (bảng vẫn hiện)', !!waitB && await B.evaluate(() => !!document.querySelector('.p1s-raidpanel')));
  await A.evaluate(n => __hit(n), expHp);
  const done = await until(async () => {
    const r = await Promise.all([A, B].map(p => p.evaluate(() => ({ room: !!P1.raid.room && P1.raid.room.phase, pop: (document.querySelector('[data-pop="raid-result"] .p1s-result') || {}).textContent || '' }))));
    return r.every(x => x.pop) && r;
  }, 10000);
  check('boss gục → cả hai thấy kết quả thắng', done && done.every(x => /Thắng/.test(x.pop)), done);
  const after = await Promise.all([A, B].map(p => p.evaluate(() => ({ money: P1.state.money, n: P1.state.party.length + P1.state.box.length, last: P1.state.party.slice(-1)[0] }))));
  const bossDex = await A.evaluate(id => P1.raid.BOSSES[id].dex, boss);
  check('mỗi người có gây sát thương: +tiền, +1 Pokémon boss Lv20', after.every((x, i) => x.money > before[i].money && x.n === before[i].n + 1 && x.last.dex === bossDex && x.last.level === 20),
    after.map(x => ({ money: x.money, n: x.n, dex: x.last.dex, lv: x.last.level })));
  check('đã lưu (P1.save) sau thưởng', await A.evaluate(() => JSON.parse(localStorage.getItem('pokeone.save.v1')).party.length === P1.state.party.length));
  await shot(B, '5-raid-result.png');
  check('không lỗi JS trên hai trang', A.errors.length + B.errors.length === 0, A.errors.concat(B.errors).slice(0, 3));
  await A.context().close(); await B.context().close();
}

/* ---------------------------------------------------------------- [chợ] */

async function marketChecks(browser, base) {
  console.log('\n[chợ]');
  const G = await openPage(browser, base, 'Guest');
  await G.evaluate(() => P1.market.open());
  const gate = await G.evaluate(() => { const g = document.querySelector('[data-pop="market"] .p1s-gate'); return g && { text: g.textContent, href: g.querySelector('a') && g.querySelector('a').getAttribute('href') }; });
  check('khách: "Đăng nhập hub để dùng chợ" + liên kết ../../login.html', gate && /Đăng nhập hub/.test(gate.text) && gate.href === '../../login.html', gate);
  await shot(G, '6-market-guest.png');
  await G.context().close();

  // Phiên thành viên giả mang anon key làm Bearer: PostgREST THẬT trả lỗi thật của bảng/hàm chưa cài.
  const cfg = fs.readFileSync(path.join(ROOT, 'js/supabase-config.js'), 'utf8');
  const anon = (/anonKey:\s*"([^"]+)"/.exec(cfg) || [])[1];
  const session = { kind: 'member', userId: '00000000-0000-4000-8000-00000000abcd', name: 'Tester', accessToken: anon, refreshToken: 'x', expiresAt: Date.now() + 3600e3 };
  const M = await openPage(browser, base, 'Brock', { session });
  const probe = await M.evaluate(() => P1.net.rest('/p1_listings?select=id&limit=1', { member: true }));
  const installed = probe.ok;
  if (!installed) {
    check('máy chủ thật: bảng chưa cài (PGRST205) được nhận ra', P1NotInstalled(probe), probe.code);
    const lst = await M.evaluate(async () => {
      const before = P1.state.party.map(m => m.uid).join();
      const p = P1.market.listMon(P1.state.party[1], 'party', 1);
      await new Promise(r => setTimeout(r, 50));
      document.querySelector('[data-pop="ask"] .p1s-btn.primary').click();
      const ok = await p;
      return { ok, same: P1.state.party.map(m => m.uid).sort().join() === before.split(',').sort().join(), outbox: P1.state.market.outbox.length };
    });
    check('listMon (chưa biết chợ chưa cài): gọi p1_list thật → PGRST202 → Pokémon về lại đội, hộp thư đi trống', lst.ok === false && lst.same && lst.outbox === 0, lst);
    await M.evaluate(() => P1.market.open());
    const msg = await until(() => M.evaluate(() => { const g = document.querySelector('[data-pop="market"] .p1s-gate'); return g && g.textContent; }), 8000);
    check('thành viên + chưa cài: "Chợ chưa mở: chủ hub cần chạy db/pokeone-market.sql"', /Chợ chưa mở: chủ hub cần chạy db\/pokeone-market\.sql/.test(msg || ''), msg);
    await shot(M, '7-market-not-installed.png');
    await M.evaluate(() => P1.market.close());
    const again = await M.evaluate(() => P1.market.listMon(P1.state.party[1], 'party', 1));
    check('đã biết chợ chưa cài: listMon mở cửa sổ báo, không đụng Pokémon', again === false && await M.evaluate(() => P1.state.party.length === 2 && !!document.querySelector('[data-pop="market"] .p1s-gate')));
    await M.evaluate(() => P1.market.close());
    const refuse = await M.evaluate(async () => {
      const toasts = [];
      const t = P1.social.toast; P1.social.toast = m => toasts.push(m);
      P1.state.party[1].item = 'oranberry';
      const held = await P1.market.listMon(P1.state.party[1], 'party', 1);
      P1.state.party[1].item = ''; P1.state.party[1].hp = 0;
      const last = await P1.market.listMon(P1.state.party[0], 'party', 0);
      P1.social.toast = t;
      return { held, last, toasts, n: P1.state.party.length };
    });
    check('từ chối: Pokémon đang cầm đồ, Pokémon còn sức cuối cùng', refuse.held === false && refuse.last === false && refuse.n === 2 &&
      /vật phẩm/.test(refuse.toasts[0]) && /còn sức cuối cùng/.test(refuse.toasts[1]), refuse.toasts);
  } else {
    check('bảng chợ đã cài trên máy chủ thật (chu trình đầy đủ cần hai tài khoản thành viên thật — không có)', true);
  }

  // Giao diện chợ có hàng: dữ liệu GIẢ qua page.route, chỉ để nhìn bố cục.
  await M.route('**/rest/v1/p1_listings**', route => {
    const u = route.request().url();
    const mk = (id, dex, lv, price, top, name, h, shiny) => ({ id, seller: 's' + id, seller_name: name, card: { dex, level: lv, shiny, gender: 'M', nature: 'Timid', ability: 'Static', ivs: { hp: 31, atk: 12, def: 20, spa: 31, spd: 25, spe: 30 }, moves: ['Thunder Shock', 'Quick Attack'], ball: 'pokeball', ot: name, nick: '' },
      start_price: price, buyout: price * 4, ends_at: new Date(Date.now() + h * 3600e3).toISOString(), top_bid: top, top_bidder: top ? 'x' : null, top_bidder_name: top ? 'Gary' : null, cancelled: false });
    const rows = /seller=eq/.test(u) ? [] : [mk(1, 25, 22, 1500, 2100, 'Ash', 0.4, true), mk(2, 1, 15, 800, null, 'Misty', 5, false), mk(3, 131, 30, 9000, 9500, 'Lance', 20, false), mk(4, 147, 18, 4000, null, 'Clair', 23, false)];
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
  });
  await M.route('**/rest/v1/p1_bids**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await M.route('**/rest/v1/rpc/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await M.evaluate(() => { P1.market.close(); });
  await M.evaluate(() => { location.hash = ''; });
  await M.reload();
  await M.waitForFunction(() => window.__ready === true);
  await M.evaluate(() => P1.market.open());
  const rows = await until(() => M.evaluate(() => document.querySelectorAll('[data-pop="market"] .mk-row').length), 8000);
  check('cửa sổ chợ liệt kê phiên (dữ liệu giả)', rows === 4, rows);
  await M.fill('[data-pop="market"] .mk-q', 'pika');
  const filtered = await M.evaluate(() => [...document.querySelectorAll('[data-pop="market"] .mk-row .grow > b')].map(b => b.textContent));
  check('tìm theo tên loài', filtered.length === 1 && /Pikachu/.test(filtered[0]), filtered);
  await M.fill('[data-pop="market"] .mk-q', '');
  await M.selectOption('[data-pop="market"] .mk-sort', 'pricey');
  const order = await M.evaluate(() => [...document.querySelectorAll('[data-pop="market"] .mk-price > b')].map(b => +b.textContent.slice(1)));
  check('sắp theo giá cao', JSON.stringify(order) === '[9500,4000,2100,800]', order);
  await shot(M, '8-market-list.png');
  await M.click('[data-pop="market"] .mk-row');
  const det = await M.evaluate(() => { const d = document.querySelector('[data-pop="market-detail"]'); return d && { min: d.querySelector('.mk-amt') && d.querySelector('.mk-amt').value, card: !!d.querySelector('.p1s-card') }; });
  check('chi tiết phiên: thẻ Pokémon + giá tối thiểu kế tiếp', det && det.card && +det.min === 9975, det);
  await shot(M, '9-market-detail.png');
  const money0 = await M.evaluate(() => P1.state.money);
  await M.fill('[data-pop="market-detail"] .mk-amt', String(money0 + 100000));
  await M.click('[data-pop="market-detail"] .p1s-btn.primary');
  const err = await M.evaluate(() => document.querySelector('[data-pop="market-detail"] .p1s-err').textContent);
  check('không đủ tiền → chặn, không trừ', /Không đủ tiền/.test(err) && await M.evaluate(m => P1.state.money === m, money0), err);
  check('không lỗi JS trang chợ', M.errors.length === 0, M.errors.slice(0, 3));
  await M.context().close();
}
function P1NotInstalled(r) { return !r.ok && (r.code === 'PGRST205' || r.code === 'PGRST202'); }

(async () => {
  await sqlChecks();
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    const P = await openPage(browser, base, 'Pure');
    await pureChecks(P);
    await P.context().close();
    await netChecks(browser, base);
    await marketChecks(browser, base);
  } catch (e) { fail++; console.log('  ✘ lỗi không bắt được: ' + (e && e.stack || e)); }
  await browser.close();
  srv.close();
  console.log('\n' + pass + ' đạt, ' + fail + ' hỏng. Ảnh: ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
