/*
 * PokéOne — lớp trực tuyến (games/pokeone/js/{net,chat,raid,market}.js, db/pokeone-market.sql).
 *
 * Chạy:  node test/pokeone-social.js
 *   PGLITE_PATH=<thư mục chứa node_modules/@electric-sql/pglite>  bật phần [sql] (Postgres WASM chạy
 *   db/pokeone-market.sql thật, auth.uid() giả). Không có thì phần đó bỏ qua và ghi rõ.
 *
 * [trang]  Trang thử dựng ảo trong games/pokeone/: tệp thật của trò chơi (kể cả battle.js) + cảnh world giả — vì bản đồ
 *          đang được luồng khác dựng lại.
 * [mạng]   Trình duyệt thật trên Supabase Realtime THẬT, kênh riêng ?netns=test-<ngẫu nhiên>: chat, khoe Pokémon; boss hai người
 *          (phòng chờ Idle→Accept→Confirm, trận đôi chung, hết giờ tự chọn, chia đồ) và ba người (trận ba, chủ phòng rời).
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
<script src="data/audio.js"></script>
<script src="data/pro-ui.js"></script>
<script src="data/pro.js"></script>
<script src="data/pro-anim.js"></script>
<script src="js/core.js"></script>
<script src="js/engine.js"></script>
<script src="js/proui.js"></script>
<script src="js/battle.js"></script>
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
  P1.query = q;
  // Cảnh world giả (bản đồ đang được dựng lại ở luồng khác); trận là battle.js thật.
  P1.scene.add('world', { enter() {}, render() { const v = P1.view(); v.ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0); v.ctx.fillStyle = '#3d6b3a'; v.ctx.fillRect(0, 0, v.w, v.h);
    v.ctx.fillStyle = '#fff'; v.ctx.font = '16px Arial'; v.ctx.fillText('world (giả) — ' + P1.net.me.name, 20, 30); } });
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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, permissions: ['clipboard-read', 'clipboard-write'] });
  if (extra && extra.session) await ctx.addInitScript(s => localStorage.setItem('hub.session.v1', JSON.stringify(s)), extra.session);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) page.errors.push(m.text()); });
  await page.goto(base + '/games/pokeone/__social.html?netns=' + NS + '&raidturn=12&bspeed=4&name=' + encodeURIComponent(name));
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
    const now = Date.parse('2026-09-28T03:00:00Z');
    P1.state.bossWins = { giovanni: now - 5 * 864e5 };
    out.cd = { giovanni: Math.ceil(P1.raid.cooldownLeft('giovanni', now) / 864e5), brock: P1.raid.cooldownLeft('brock', now), later: P1.raid.cooldownLeft('giovanni', now + 12 * 864e5) };
    P1.state.bossWins = {};
    out.codes = [P1.raid.findCodes('[Boss] Giovanni — mã phòng K7Q2M9'), P1.raid.findCodes('vào đi K7Q2M9 nhé, hoặc AB3CDE'), P1.raid.findCodes('HELLO và ABCDEF và 234567 và K7Q2M9X'),
      P1.raid.findCodes('mã k7q2m9 viết thường')].map(x => x.map(c => c.code + '@' + c.index).join());
    out.norm = [P1.raid.normCode(' k7q2m9 '), P1.raid.normCode('K7Q2M'), P1.raid.normCode('K0Q2M9')];
    out.codeText = P1.raid.codeText('giovanni', 'K7Q2M9');
    out.table = Object.keys(P1.raid.BOSSES).map(id => id + ':' + P1.raid.BOSSES[id].team.length + ':' + P1.raid.maxFor(id)).join();
    const W = P1.raid.lootWinner;
    out.loot = {
      needFirst: W(7, 'mon', { a: 'greed', b: 'need', c: 'greed' }, ['a', 'b', 'c']),
      greedOnly: W(7, 'item', { a: 'greed', b: 'pass', c: 'greed' }, ['a', 'b', 'c']),
      allPass: W(7, 'money', { a: 'pass', b: 'pass' }, ['a', 'b']),
      same: JSON.stringify(W(99, 'mon', { a: 'need', b: 'need', c: 'need' }, ['a', 'b', 'c'])) === JSON.stringify(W(99, 'mon', { c: 'need', b: 'need', a: 'need' }, ['c', 'b', 'a'])),
      rolls: ['a', 'b', 'c'].map(id => P1.raid.lootRoll(99, 'mon', id)),
      top: W(99, 'mon', { a: 'need', b: 'need', c: 'need' }, ['a', 'b', 'c']),
    };
    // Máy trạng thái phòng: ảnh chụp presence → Lobby.
    const mk = (id, t, extra) => Object.assign({ id, name: id.toUpperCase(), t, state: 'idle', mons: [P1.mon.create(25, 20)], lead: null }, extra || {});
    const lead = { boss: 'giovanni', phase: 'lobby', launch: '', seed: 0, order: [], party: [] };
    const LB = P1.raid.reduce({ room: 'r1', boss: null, leader: null, actors: [], phase: 'lobby', order: [], party: [] },
      { type: 'rows', me: 'b', rows: [mk('b', 2), mk('a', 1, { lead, state: 'accept' }), mk('c', 3, { state: 'accept' })] });
    out.lobby = { phase: LB.phase, actors: LB.actors.map(a => a.id + ":" + a.kind + ":" + a.state + ":" + a.team).join(), npc: LB.actors[3].count + '/' + LB.actors[3].active };
    const brockRoom = P1.raid.reduce({ room: 'r2', boss: null, leader: null, actors: [], phase: 'lobby', order: [], party: [] },
      { type: 'rows', me: 'c', rows: [mk('a', 1, { lead: Object.assign({}, lead, { boss: 'brock' }) }), mk('b', 2), mk('c', 3)] });
    out.brockFull = brockRoom.phase + ' ' + brockRoom.reason;
    const four = P1.raid.reduce(LB, { type: 'rows', me: 'd', rows: [mk('a', 1, { lead }), mk('b', 2), mk('c', 3), mk('d', 4)] });
    const gone = P1.raid.reduce(LB, { type: 'rows', me: 'b', rows: [mk('b', 2), mk('c', 3)] });
    const late = P1.raid.reduce(LB, { type: 'rows', me: 'z', rows: [mk('a', 1, { lead: Object.assign({}, lead, { phase: 'countdown', order: ['a', 'b'] }) }), mk('z', 9)] });
    const won = P1.raid.reduce(Object.assign({}, LB, { phase: 'battle' }), { type: 'result', win: true });
    out.fsm = { four: four.phase + ' ' + four.reason, gone: gone.phase + ' ' + gone.reason, late: late.phase + ' ' + late.reason, won: won.phase,
      closedSticky: P1.raid.reduce(gone, { type: 'rows', me: 'b', rows: [mk('a', 1, { lead })] }).phase };
    const t1 = P1.raid.trainerTeam('giovanni', 5), t2 = P1.raid.trainerTeam('giovanni', 5);
    out.side = { team: t1.map(m => m.dex + ':' + m.level).join(), same: JSON.stringify(t1.map(m => m.ivs)) === JSON.stringify(t2.map(m => m.ivs)), ot: t1[0].ot };
    const bad = P1.raid.parseFighter({ dex: 25, level: 30, hp: 9999, status: 'evil', moves: [{ id: 'thunderbolt', pp: 99 }] });
    out.fighter = { hp: bad.hp === P1.mon.stats(bad).hp, status: bad.status, pp: bad.moves[0].pp, dead: P1.raid.parseFighter({ dex: 25, level: 30, hp: 0 }) };
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
  check('bảng boss: 8 thủ lĩnh + Tứ Thiên Vương + Nhà vô địch; số người tối đa = min(3, số Pokémon của boss)',
    r.table === 'brock:2:2,misty:2:2,surge:3:3,erika:3:3,koga:4:3,sabrina:4:3,blaine:4:3,giovanni:5:3,lorelei:5:3,bruno:5:3,agatha:5:3,lance:5:3,blue:6:3', r.table);
  check('hồi 12 ngày mỗi boss, tính từ lần thắng: thắng 5 ngày trước → còn 7; boss khác không ảnh hưởng; qua 12 ngày → hết',
    r.cd.giovanni === 7 && r.cd.brock === 0 && r.cd.later === 0, r.cd);
  check('mã phòng trong câu chat: câu chép từ nút mời, mã đứng giữa câu, bỏ chữ in hoa không có số / mã dài / chữ thường',
    JSON.stringify(r.codes) === JSON.stringify(['K7Q2M9@27', 'K7Q2M9@7,AB3CDE@24', '', '']), r.codes);
  check('chuẩn hoá mã nhập tay: chữ thường + khoảng trắng được, thiếu ký tự / có số 0 thì không', JSON.stringify(r.norm) === '["K7Q2M9",null,null]', r.norm);
  check('câu mời để chép: "[Boss] Giovanni — mã phòng K7Q2M9"', r.codeText === '[Boss] Giovanni — mã phòng K7Q2M9', r.codeText);
  const top = ['a', 'b', 'c'].map((id, i) => ({ id, roll: r.loot.rolls[i] })).sort((x, y) => y.roll - x.roll || (x.id < y.id ? -1 : 1))[0];
  check('chia đồ: có Cần thì chỉ xét Cần; không ai Cần thì xét Tham; tất cả Bỏ → không ai nhận',
    r.loot.needFirst.id === 'b' && r.loot.needFirst.tier === 'need' && r.loot.greedOnly.tier === 'greed' && ['a', 'c'].includes(r.loot.greedOnly.id) && r.loot.allPass === null, r.loot);
  check('chia đồ tất định: cùng (seed, món, phiếu) → cùng người thắng; điểm cao nhất thắng', r.loot.same && r.loot.top.id === top.id && r.loot.top.roll === top.roll, r.loot.rolls);
  check('phòng chờ: chủ phòng đứng đầu, Đội 2 là huấn luyện viên boss (5 Pokémon, 3 con ra sân cho 3 người)', r.lobby.phase === 'lobby' &&
    r.lobby.actors === 'a:leader:accept:1,b:user:idle:1,c:user:accept:1,boss:npc:confirm:2' && r.lobby.npc === '5/3', r.lobby);
  check('phòng Brock (2 Pokémon): người thứ 3 bị từ chối', /^closed .*đủ 2/.test(r.brockFull), r.brockFull);
  check('phòng chờ: người thứ 4 bị từ chối, chủ phòng rời → giải tán, vào muộn → từ chối, thắng → chia đồ, đã đóng thì đóng hẳn',
    /^closed .*đủ 3/.test(r.fsm.four) && /^closed Chủ phòng/.test(r.fsm.gone) && /^closed .*bắt đầu/.test(r.fsm.late) && r.fsm.won === 'loot' && r.fsm.closedSticky === 'closed', r.fsm);
  check('đội Giovanni theo FRLG, cùng seed → cùng con trên mọi máy', r.side.team === '111:45,51:42,31:44,34:45,112:50' && r.side.same && r.side.ot === 'Giovanni', r.side);
  check('Pokémon người khác gửi vào trận: kẹp HP, bỏ trạng thái lạ, kẹp PP; hết máu thì không nhận', r.fighter.hp && r.fighter.status === '' && r.fighter.pp <= 15 && r.fighter.dead === null, r.fighter);
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

  check('không lỗi JS trên hai trang (chat)', A.errors.length + B.errors.length === 0, A.errors.concat(B.errors).slice(0, 3));
  await A.context().close(); await B.context().close();
}

/* ---------------------------------------------------------------- [boss] trận chung */

// Đủ mạnh để thắng Giovanni (Lv42–50) trong ít lượt, đủ lượt để thử đồng hồ và đổi chủ phòng.
const STRONG = { Ash: [[6, 85], [25, 60]], Misty: [[9, 85], [121, 70], [1, 30]], Brock: [[3, 85], [95, 60]] };
async function giveTeam(page, name) {
  await page.evaluate(t => { P1.state.party = t.map(([d, l]) => P1.mon.create(d, l, { ot: P1.state.player.name })); }, STRONG[name]);
}
function fnv(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0; }
const roll = (seed, loot, id) => 1 + fnv(seed + '|' + loot + '|' + id) % 100;
const room = p => p.evaluate(() => P1.raid.room);
const idOf = p => p.evaluate(() => P1.net.me.id);
async function shotAt(page, file, W, H) {
  const old = page.viewportSize();
  await page.setViewportSize({ width: W, height: H });
  await sleep(350);
  const f = await shot(page, file);
  await page.setViewportSize(old);
  return f;
}

/*
 * Chơi trận chung trên nhiều trang: trang nào đang có bảng chọn thì chọn chiêu mạnh nhất nhắm boss (hoặc đổi con khi bị
 * buộc). idle = các trang không chọn gì (để thử đồng hồ). Mỗi vòng lấy mẫu (độ dài nhật ký, HP mọi con) từ mọi trang.
 */
async function autoplay(pages, opt) {
  opt = opt || {};
  const samples = [], t0 = Date.now();
  while (Date.now() - t0 < (opt.ms || 240000)) {
    const st = await Promise.all(pages.map(p => p.evaluate(() => {
      const r = P1.raid.room, s = P1.battleScene;
      return { log: r ? r.log : -1, hp: r ? r.hp : '', result: r ? r.result : null, phase: r ? r.phase : null, host: r ? r.host : null,
        mode: s && s.mode, pick: !!(s && s.pick && s.coop), scene: P1.scene.name };
    }).catch(() => null)));
    st.forEach((x, i) => { if (x && x.log >= 0 && x.hp) samples.push({ i, log: x.log, hp: x.hp }); });
    if (opt.until && opt.until(st)) return { st, samples };
    for (let i = 0; i < pages.length; i++) {
      const x = st[i];
      if (!x || !x.pick || (opt.idle || []).includes(i)) continue;
      await pages[i].evaluate(() => {
        const s = P1.battleScene;
        if (!s.pick) return;
        if (s.mode === 'forced') { s.send({ type: 'switch', index: s.coopReq.bench[0].index }); return; }
        if (s.mode !== 'menu') { s.setMode('menu'); return; }
        const m = s.req.moves.filter(x => !x.disabled && x.pp > 0).sort((a, b) => P1.Dex.moves.get(b.id).basePower - P1.Dex.moves.get(a.id).basePower)[0] || s.req.moves[0];
        const t = m.targets.find(x => x.pos === s.bossPos && x.alive) || m.targets.find(x => !x.ally && x.alive) || m.targets[0];
        s.send({ type: 'move', slot: m.slot, tg: t ? t.loc : 0 });
      }).catch(() => {});
    }
    await sleep(250);
  }
  return { st: null, samples };
}
function hpAgreement(samples) {
  const byLog = {};
  samples.forEach(x => { (byLog[x.log] = byLog[x.log] || {})[x.i] = x.hp; });
  let compared = 0, bad = 0;
  Object.values(byLog).forEach(m => { const v = Object.values(m); if (v.length > 1) { compared++; if (new Set(v).size > 1) bad++; } });
  return { compared, bad, logs: Object.keys(byLog).length };
}

/*
 * Chủ phòng bấm "Lập phòng" (createRoom) → bấm "Sao chép mã mời" → dán câu đó vào chat. Thành viên bấm "Tham gia" cạnh mã
 * trong chat; ai trong `byBox` thì gõ mã vào ô "Nhập mã phòng" thay vì bấm trong chat.
 */
async function gather(host, members, bossId, byBox) {
  const all = [host].concat(members);
  await until(async () => (await Promise.all(all.map(p => p.evaluate(() => (document.querySelector('.p1-chat .online') || {}).textContent || ''))))
    .every(t => parseInt(t, 10) >= all.length), 15000);
  await host.evaluate(id => P1.raid.createRoom(id), bossId);
  await host.waitForSelector('[data-pop="raid-lobby"] .lb-copy', { timeout: 10000 });
  await host.click('[data-pop="raid-lobby"] .lb-copy');
  const code = (await room(host)).id;
  const copied = await until(() => host.evaluate(() => navigator.clipboard.readText().catch(() => '')), 5000);
  check('"Sao chép mã mời" chép đúng câu mời vào clipboard', copied === '[Boss] ' + (await host.evaluate(id => P1.raid.BOSSES[id].name, bossId)) + ' — mã phòng ' + code, copied);
  await host.evaluate(() => document.querySelector('[data-pop="raid-lobby"]').style.display = 'none');
  await host.click('.p1-chat .in input');
  await host.keyboard.press('Control+V');
  await host.keyboard.press('Enter');
  await host.evaluate(() => document.querySelector('[data-pop="raid-lobby"]').style.display = '');
  for (const m of members) {
    if ((byBox || []).includes(m)) {
      await m.click('.p1-chat .code-btn');
      await m.fill('[data-pop="raid-code"] .rc-in', 'mã nè: ' + code.toLowerCase());
      await m.press('[data-pop="raid-code"] .rc-in', 'Enter');
      continue;
    }
    const ok = await until(() => m.evaluate(c => {
      const line = [...document.querySelectorAll('.p1-chat .l.chat')].find(l => l.querySelector('.code') && l.querySelector('.code').textContent === c);
      return !!(line && line.querySelector('button.join'));
    }, code), 10000);
    check('câu mời dán vào chat hiện mã + nút Tham gia ở máy khác', !!ok);
    if (!ok) return false;
    await m.evaluate(c => [...document.querySelectorAll('.p1-chat .l.chat')].find(l => l.querySelector('.code') && l.querySelector('.code').textContent === c).querySelector('button.join').click(), code);
  }
  const ok = await until(async () => (await room(host)).actors.filter(a => a.kind !== 'npc').length === members.length + 1, 12000);
  if (!ok) console.log('    gather: host', JSON.stringify(await room(host)), 'members', JSON.stringify(await Promise.all(members.map(m => m.evaluate(() => P1.raid.room)))));
  return ok;
}

async function raid2(browser, base) {
  console.log('\n[boss hai người] phòng chờ → trận đôi chung → hết giờ tự chọn → chia đồ');
  const A = await openPage(browser, base, 'Ash'), B = await openPage(browser, base, 'Misty');
  await giveTeam(A, 'Ash'); await giveTeam(B, 'Misty');
  const [idA, idB] = [await idOf(A), await idOf(B)];
  const bossId = 'giovanni';
  check('B vào phòng bằng mã phòng dán trong chat; A thấy 2 người', !!(await gather(A, [B], bossId)));
  const r0 = await room(A);
  check('phòng chờ: A là leader (Accept), B là user (Idle), Đội 2 là Giovanni (5 Pokémon, 2 ra sân)', JSON.stringify(r0.actors.map(a => a.kind + ':' + a.state)) === '["leader:accept","user:idle","npc:confirm"]' && r0.actors[2].count === 5 && r0.actors[2].active === 2, r0.actors);
  const startOff = await A.evaluate(() => document.querySelector('[data-pop="raid-lobby"] .p1s-btn.primary').disabled);
  check('Bắt đầu bị khoá khi còn người chưa Sẵn sàng', startOff === true);
  await B.click('[data-pop="raid-lobby"] .p1s-btn.primary');
  const acc = await until(async () => (await room(A)).actors[1].state === 'accept' && !(await A.evaluate(() => document.querySelector('[data-pop="raid-lobby"] .p1s-btn.primary').disabled)), 8000);
  check('B bấm Sẵn sàng → A thấy Accept, nút Bắt đầu mở', !!acc);
  const cards = await A.evaluate(() => [...document.querySelectorAll('[data-pop="raid-lobby"] .lb-team:not(.foe) .lb-actor:not(.empty)')].map(e => e.querySelector('.lb-name').textContent.replace('♛', '') + '/' + e.querySelectorAll('.lb-mon').length));
  check('phòng chờ liệt kê tên + Pokémon mang vào của từng người', cards.join() === 'Ash/2,Misty/3', cards);
  await shotAt(A, 'boss-lobby-1366x768.png', 1366, 768);
  await shotAt(A, 'boss-lobby-844x390.png', 844, 390);
  await A.click('[data-pop="raid-lobby"] .p1s-btn.primary');
  const phases = new Set();
  const inBattle = await until(async () => {
    const [a, b] = [await room(A), await room(B)];
    phases.add(a.phase); phases.add(b.phase);
    return a.phase === 'battle' && b.phase === 'battle' && (await A.evaluate(() => P1.scene.name)) === 'battle' && (await B.evaluate(() => P1.scene.name)) === 'battle';
  }, 20000, 100);
  check('Bắt đầu → B tự Confirm → đếm ngược → cả hai vào cùng một trận', !!inBattle && phases.has('countdown'), [...phases]);
  const f0 = await Promise.all([A, B].map(p => p.evaluate(() => { const s = P1.battleScene; return { format: s.battle.sim.format.id, order: P1.raid.room.order.join(), me: s.coop.me }; })));
  check('trận đôi Gen 7, thứ tự ô = thứ tự vào phòng, trên cả hai máy', f0.every(x => x.format === 'gen7doublescustomgame' && x.order === idA + ',' + idB), f0);

  // Lượt 1: mỗi người bấm chuột thật vào nút chiêu của ô mình, rồi chọn boss làm mục tiêu.
  for (const [P, mine] of [[A, 0], [B, 1]]) {
    await P.waitForFunction(() => P1.battleScene.mode === 'menu' && P1.battleScene.pick, null, { timeout: 60000 });
    const req = await P.evaluate(() => { const s = P1.battleScene; return { slots: s.coopReq.slots.map(x => x.slot), bench: s.coopReq.bench.map(x => x.owner), move: s.req.moves.find(m => P1.Dex.moves.get(m.id).basePower > 0 && m.pp > 0).slot }; });
    check((P === A ? 'A' : 'B') + ' chỉ điều khiển ô ' + 'ab'[mine] + ', dự bị chỉ gồm Pokémon của mình', req.slots.join() === String(mine) && req.bench.every(o => o === (P === A ? idA : idB)), req);
    await P.click('[data-b="move-' + req.move + '"]');
    await P.waitForFunction(() => P1.battleScene.mode === 'target', null, { timeout: 5000 });
    if (P === A) { await shotAt(A, 'boss-2p-target-1366x768.png', 1366, 768); }
    await P.click('[data-b="target-p2a"]');
    if (P === A) {
      await A.waitForFunction(() => P1.battleScene.mode === 'wait', null, { timeout: 5000 }).catch(() => {});
      const waiting = await A.evaluate(() => P1.battleScene.promptEl.textContent);
      check('A chọn xong → "Chờ Misty chọn…", hộp máu Misty ghi đang chọn', /Chờ Misty chọn/.test(waiting), waiting);
      await shotAt(A, 'boss-2p-waiting-1366x768.png', 1366, 768);
      await shotAt(A, 'boss-2p-waiting-844x390.png', 844, 390);
    }
  }
  const t1 = await autoplay([A, B], { until: st => st.every(x => x && x.log >= 1) , ms: 30000 });
  check('lượt 1 chốt khi đủ lựa chọn của cả hai', !!t1.st, t1.st);

  // Lượt 2: B không chọn → chủ phòng (A) chờ đủ ?raidturn=12 s rồi tự chọn thay B.
  await until(() => B.evaluate(() => P1.battleScene.mode === 'menu' && !!P1.battleScene.pick), 60000);
  const n2 = (await room(B)).log, tStart = Date.now();
  const t2 = await autoplay([A, B], { idle: [1], until: st => st.every(x => x && (x.log > n2 || x.result)), ms: 40000 });
  const waited = Date.now() - tStart, rb = await room(B);
  check('hết giờ: A tự chọn thay B, lượt vẫn chạy (không có lựa chọn nào của B cho lượt đó)', !!t2.st && rb.picked < n2 && waited >= 10000, { waited, picked: rb.picked, n2 });
  const bUi = await until(() => B.evaluate(() => P1.battleScene.mode !== 'menu' || P1.raid.room.log > 0), 5000);
  check('bảng chọn của B tự đóng khi lượt bị chốt thay', !!bUi);
  await shotAt(B, 'boss-2p-battle-1366x768.png', 1366, 768);
  await shotAt(B, 'boss-2p-battle-844x390.png', 844, 390);

  // Kênh của chủ phòng A rớt 2,5 s (quá ngưỡng tự nhường 1,5 s, chưa tới ngưỡng bị thay 4 s): A phải nhường, B lên thay.
  const nBlip = (await room(B)).log;
  await A.evaluate(code => { const ch = P1.net.channel('raid:' + code); ch.joined = false; setTimeout(() => { ch.joined = true; }, 2500); }, (await room(A)).id);
  const handed = await until(async () => { const [a, b] = [await room(A), await room(B)]; return a.host === idB && b.host === idB && [a.host, b.host]; }, 10000);
  check('kênh chủ phòng rớt 2,5 s → A tự nhường, cả hai máy chọn B làm chủ phòng (không treo)', !!handed, handed);
  const goOn = await autoplay([A, B], { until: st => st.every(x => x && (x.log > nBlip || x.result)), ms: 60000 });
  check('sau khi đổi chủ phòng trận vẫn chạy, A vẫn tự chọn cho ô của mình', !!goOn.st, goOn.st && goOn.st.map(x => x.log));

  const moneyBefore = await Promise.all([A, B].map(p => p.evaluate(() => ({ money: P1.state.money, n: P1.state.party.length + P1.state.box.length, bag: Object.assign({}, P1.state.bag) }))));
  const fin = await autoplay([A, B], { until: st => st.every(x => x && (x.result || x.phase === 'loot')), ms: 300000 });
  const agree = hpAgreement(t1.samples.concat(t2.samples, fin.samples));
  check('HP mọi con giống hệt nhau trên hai máy ở mọi độ dài nhật ký lấy mẫu được', agree.bad === 0 && agree.compared >= 3, agree);
  const res = await Promise.all([A, B].map(room));
  check('trận kết thúc cùng một kết quả trên hai máy', res[0].result === res[1].result && !!res[0].result, res.map(x => x.result + '@' + x.log));
  if (res[0].result !== 'win') { check('thắng boss để thử chia đồ', false, res[0].result); await A.context().close(); await B.context().close(); return; }

  // Chia đồ: A Cần trứng, Tham tiền, Bỏ đồ; B Cần tiền, Cần trứng, Tham đồ.
  await until(async () => (await Promise.all([A, B].map(p => p.evaluate(() => !!document.querySelector('[data-pop="raid-loot"]') && P1.raid.room && P1.raid.room.lootOpen)))).every(Boolean), 40000);
  const seed = res[0].seed;
  const vote = (P, loot, v) => P.click('[data-pop="raid-loot"] .lt-votes[data-loot="' + loot + '"] .lt-v[data-v="' + v + '"]');
  await vote(A, 'egg', 'need'); await vote(A, 'money', 'greed'); await vote(A, 'item', 'pass');
  await vote(B, 'money', 'need'); await vote(B, 'egg', 'need');
  await shotAt(B, 'boss-loot-vote-1366x768.png', 1366, 768);
  await shotAt(B, 'boss-loot-vote-844x390.png', 844, 390);
  await vote(B, 'item', 'greed');
  const loots = await Promise.all([A, B].map(p => until(() => p.evaluate(() => P1.raid.room && P1.raid.room.loot), 30000, 100)));
  const monWinner = roll(seed, 'egg', idA) > roll(seed, 'egg', idB) || (roll(seed, 'egg', idA) === roll(seed, 'egg', idB) && idA < idB) ? idA : idB;
  const expect = [{ id: 'money', win: idB, tier: 'need' }, { id: 'item', win: idB, tier: 'greed' }, { id: 'egg', win: monWinner, tier: 'need' }];
  check('kết quả chia đồ giống nhau trên hai máy', JSON.stringify(loots[0]) === JSON.stringify(loots[1]), loots);
  check('kết quả đúng luật (tiền, đồ → B; trứng → điểm FNV cao hơn giữa hai người Cần)', !!loots[0] && expect.every((e, k) => loots[0][k].id === e.id && loots[0][k].win === e.win && loots[0][k].tier === e.tier),
    { got: loots[0], expect, rolls: [roll(seed, 'egg', idA), roll(seed, 'egg', idB)] });
  await sleep(500);
  await shotAt(A, 'boss-loot-result-1366x768.png', 1366, 768);
  const after = await Promise.all([A, B].map(p => p.evaluate(() => ({ money: P1.state.money, n: P1.state.party.length + P1.state.box.length, bag: Object.assign({}, P1.state.bag), saved: JSON.parse(localStorage.getItem('pokeone.save.v1')).money }))));
  const boss = await A.evaluate(id => P1.raid.BOSSES[id], bossId);
  const got = (k, who) => ({ money: after[k].money - moneyBefore[k].money, mons: after[k].n - moneyBefore[k].n, item: (after[k].bag[boss.item[0]] | 0) - (moneyBefore[k].bag[boss.item[0]] | 0) });
  const gA = got(0), gB = got(1);
  check('mỗi máy chỉ nhận phần mình thắng (A: ' + (monWinner === idA ? 'trứng' : 'không gì') + '; B: tiền + đồ' + (monWinner === idB ? ' + trứng' : '') + ')',
    gA.money === 0 && gA.item === 0 && gA.mons === (monWinner === idA ? 1 : 0) && gB.money === boss.money && gB.item === boss.item[1] && gB.mons === (monWinner === idB ? 1 : 0), { gA, gB });
  check('đã lưu sau khi nhận đồ', after.every(x => x.saved === x.money));
  const cds = await Promise.all([A, B].map(p => p.evaluate(() => P1.raid.cooldownLeft('giovanni'))));
  check('thắng xong cả hai bị hồi 12 ngày với Giovanni', cds.every(x => x > 11.9 * 864e5), cds);
  check('không lỗi JS trên hai trang (boss)', A.errors.length + B.errors.length === 0, A.errors.concat(B.errors).slice(0, 3));
  await A.context().close(); await B.context().close();
}

async function raid3(browser, base) {
  console.log('\n[boss ba người] trận ba chung → chủ phòng rời giữa trận → người kế tiếp làm chủ phòng');
  const A = await openPage(browser, base, 'Ash'), B = await openPage(browser, base, 'Misty'), C = await openPage(browser, base, 'Brock');
  for (const [p, n] of [[A, 'Ash'], [B, 'Misty'], [C, 'Brock']]) await giveTeam(p, n);
  const ids = [await idOf(A), await idOf(B), await idOf(C)];
  const bossId = 'giovanni';
  check('B vào qua chat, C gõ mã vào ô "Nhập mã phòng"; A thấy 3 người', !!(await gather(A, [B, C], bossId, [C])));
  for (const p of [B, C]) await p.click('[data-pop="raid-lobby"] .p1s-btn.primary');
  await until(async () => !(await A.evaluate(() => document.querySelector('[data-pop="raid-lobby"] .p1s-btn.primary').disabled)), 8000);
  await shotAt(A, 'boss-lobby3-1366x768.png', 1366, 768);
  await A.click('[data-pop="raid-lobby"] .p1s-btn.primary');
  const inBattle = await until(async () => (await Promise.all([A, B, C].map(p => p.evaluate(() => P1.scene.name === 'battle' && P1.raid.room && P1.raid.room.phase === 'battle')))).every(Boolean), 25000);
  const fmt = await C.evaluate(() => P1.battleScene.battle.sim.format.id);
  check('ba người vào cùng một trận ba (Gen 6 triples)', !!inBattle && fmt === 'gen6triplescustomgame', fmt);
  const t1 = await autoplay([A, B, C], { until: st => st.every(x => x && x.log >= 1), ms: 90000 });
  check('lượt 1 chốt khi đủ ba lựa chọn', !!t1.st);
  await until(() => C.evaluate(() => P1.battleScene.mode === 'menu' && !!P1.battleScene.pick), 60000);
  await shotAt(C, 'boss-3p-battle-1366x768.png', 1366, 768);
  await shotAt(C, 'boss-3p-battle-844x390.png', 844, 390);
  const hostBefore = (await room(B)).host;
  const nLeave = (await room(B)).log;
  await A.evaluate(() => P1.raid.leave());
  const took = await until(async () => { const [b, c] = [await room(B), await room(C)]; return b.host === ids[1] && c.host === ids[1] && [b.host, c.host]; }, 15000);
  check('chủ phòng A rời → B (kế tiếp theo thứ tự vào phòng) làm chủ phòng trên cả B và C', hostBefore === ids[0] && !!took, { hostBefore, took });
  if (!took) console.log('    B/C sau khi A rời:', JSON.stringify(await Promise.all([B, C].map(p => p.evaluate(() => { const r = P1.raid.room; return r && { host: r.host, members: r.members, lost: r.lost, chan: r.chan, log: r.log }; })))));
  const aOut = await until(() => A.evaluate(() => P1.scene.name === 'world' && !P1.raid.room), 20000);
  check('A rời trận: về bản đồ, không còn phòng', !!aOut);
  const t2 = await autoplay([B, C], { until: st => st.every(x => x && (x.log >= nLeave + 2 || x.result)), ms: 120000 });
  check('trận chạy tiếp sau khi đổi chủ phòng (ô của A được tự chọn)', !!t2.st, t2.st);
  const fin = await autoplay([B, C], { until: st => st.every(x => x && (x.result || x.phase === 'loot')), ms: 300000 });
  const agree = hpAgreement(t1.samples.concat(t2.samples, fin.samples));
  check('HP mọi con giống hệt nhau trên các máy ở mọi độ dài nhật ký lấy mẫu được (3 máy, rồi 2 máy)', agree.bad === 0 && agree.compared >= 3, agree);
  const res = await Promise.all([B, C].map(room));
  check('B và C cùng một kết quả', !!res[0].result && res[0].result === res[1].result, res.map(x => x.result));
  if (res[0].result === 'win') {
    await until(async () => (await Promise.all([B, C].map(p => p.evaluate(() => !!document.querySelector('[data-pop="raid-loot"]') && P1.raid.room && P1.raid.room.lootOpen)))).every(Boolean), 40000);
    for (const [P, v] of [[B, 'need'], [C, 'greed']]) for (const loot of ['money', 'item', 'egg']) await P.click('[data-pop="raid-loot"] .lt-votes[data-loot="' + loot + '"] .lt-v[data-v="' + v + '"]');
    const loots = await Promise.all([B, C].map(p => until(() => p.evaluate(() => P1.raid.room && P1.raid.room.loot), 30000, 100)));
    check('chia đồ (A vắng = Bỏ): B Cần thắng cả ba món trên cả hai máy', JSON.stringify(loots[0]) === JSON.stringify(loots[1]) && loots[0].every(x => x.win === ids[1] && x.tier === 'need'), loots);
    await shotAt(C, 'boss-3p-loot-result-844x390.png', 844, 390);
  }
  check('không lỗi JS trên ba trang', A.errors.length + B.errors.length + C.errors.length === 0, A.errors.concat(B.errors, C.errors).slice(0, 3));
  for (const p of [A, B, C]) await p.context().close();
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
  const ONLY = (process.env.ONLY || '').split(',').filter(Boolean), want = k => !ONLY.length || ONLY.includes(k);
  if (want('sql')) await sqlChecks();
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    if (want('pure')) { const P = await openPage(browser, base, 'Pure'); await pureChecks(P); await P.context().close(); }
    if (want('net')) await netChecks(browser, base);
    if (want('raid2')) await raid2(browser, base);
    if (want('raid3')) await raid3(browser, base);
    if (want('market')) await marketChecks(browser, base);
  } catch (e) { fail++; console.log('  ✘ lỗi không bắt được: ' + (e && e.stack || e)); }
  await browser.close();
  srv.close();
  console.log('\n' + pass + ' đạt, ' + fail + ' hỏng. Ảnh: ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
