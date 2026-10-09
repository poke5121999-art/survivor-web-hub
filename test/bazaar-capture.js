/*
 * Chợ Phiên (games/bazaar) — CẦN SO SÁNH: chụp dải khung hình của bản web theo từng "khoảnh khắc" trong D:\bazaar-ref\notes\MOMENTS.md,
 * để đặt cạnh dải khung của game gốc (D:\bazaar-ref\ref\<moment>\) bằng games/bazaar/tools/compare_sheet.py.
 *
 * Chạy:  node test/bazaar-capture.js                          (tất cả khoảnh khắc làm được)
 *        ONLY=fire-damage,burn node test/bazaar-capture.js    (chỉ vài cái)
 *        BZ_URL=https://poke5121999-art.github.io/survivor-web-hub node test/bazaar-capture.js   (chụp bản trên Pages)
 * Không có BZ_URL thì tự dựng máy chủ tĩnh ở gốc repo. Ra: D:\bazaar-ref\web\<moment>\01.png.. + meta.json (OUT=... để đổi chỗ).
 *
 * Khung hình cách đều theo THỜI GIAN GAME, không theo đồng hồ thật: trang chạy dưới đồng hồ giả của Playwright (page.clock):
 * performance.now / requestAnimationFrame / setTimeout đều là đồng hồ giả, dừng hẳn khi chụp rồi tiến từng 20 ms (5 bước = 100 ms = 10 khung/giây).
 * Hoạt ảnh CSS (animation/transition) chạy theo đồng hồ riêng của trình duyệt, nên sau mỗi bước ta tạm dừng chúng và đặt currentTime
 * = thời gian giả đã trôi từ lúc chúng xuất hiện (Web Animations API) → cũng đều. Đo "thời lượng" (đạn bay, số nổi, băng-rôn...) bằng
 * cách lấy mẫu mỗi 20 ms trạng thái trong trang (BZFX.counts, DOM) và trạng thái sim (Node, BZSim.run cùng seed = cùng trận).
 * Run (chơi) được dựng sẵn bằng reducer ở Node (BZRun) rồi nạp qua localStorage `bz.run.v1` → trang tiếp tục đúng chỗ; "kích hoạt" là một lệnh
 * (BZ_DEBUG.cmd) hoặc chuột thật. Hạt/tia dùng Math.random nên hình chi tiết khác nhau giữa các lần chạy, thời điểm thì không.
 * Cắt khung (crop) theo D:\bazaar-ref\ref\<moment>\meta.json chỉ khi crop là tỉ lệ 0..1 hoặc có crop_frame [w,h] (cỡ video nguồn);
 * không thì chụp nguyên sân khấu (hoặc vùng riêng của từng khoảnh khắc).
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.OUT || 'D:/bazaar-ref/web';
const REF = process.env.REF || 'D:/bazaar-ref/ref';
const NOTES = 'D:/bazaar-ref/notes/MOMENTS.md';
const ONLY = (process.env.ONLY || '').split(',').map(s => s.trim()).filter(Boolean);
const VW = 1280, VH = 720, FPS = 10, SUB = 5, STEP = 1000 / FPS / SUB;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.skel': 'application/octet-stream', '.atlas': 'text/plain' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- Node: sim + reducer cùng mã với trang ----------
globalThis.window = globalThis;
['cards', 'monsters', 'mode', 'encounters'].forEach(f => require(path.join(ROOT, 'games/bazaar/data', f + '.js')));
const BZ = require(path.join(ROOT, 'games/bazaar/js/sim/index.js'));
const R = require(path.join(ROOT, 'games/bazaar/js/run/index.js'));
const CARDS = Object.values(globalThis.BZ_CARDS);
const tplByName = n => CARDS.find(t => t.InternalName === n);

// ---------- danh sách khoảnh khắc ----------
function parseMoments() {
  const txt = fs.readFileSync(NOTES, 'utf8').split(/\r?\n/), ids = [];
  let runFlow = false;
  for (const l of txt) {
    if (/^Run flow/.test(l)) { runFlow = true; continue; }
    if (!/^\s*-\s|^\s+`/.test(l)) continue;
    if (runFlow) { (l.match(/`([a-z0-9-]+)`/g) || []).forEach(m => ids.push(m.replace(/`/g, ''))); continue; }
    const lead = /^- ((?:`[a-z0-9-]+`[,\s]*)+)/.exec(l);
    if (lead) (lead[1].match(/`([a-z0-9-]+)`/g) || []).forEach(m => ids.push(m.replace(/`/g, '')));
  }
  return ids;
}

// ---------- bàn thẻ ----------
// cards: [{id, tier?, ench?, attrs?}] xếp liền từ ô 0; uid = prefix-i (cùng quy ước boardFromMonster)
function mkBoard(prefix, name, cards, hp, level) {
  let sock = 0;
  return { name, hero: null, level: level || 1, healthMax: hp, attrs: {}, monsterId: null, cards: cards.map((c, i) => {
    const tpl = BZ.tpl(c.id), size = BZ.SIZE[tpl.Size] || 1;
    const o = { uid: prefix + '-' + i, id: c.id, tier: c.tier || tpl.StartingTier, ench: c.ench || null, socket: sock, size, owner: null, section: 'hand', attrs: c.attrs };
    sock += size;
    return o;
  }) };
}
const MON_L1 = (globalThis.BZ_MONSTERS || []).filter(m => (m.Encounters || []).length && ((m.Player.Hand || {}).Items || []).length)
  .sort((a, b) => ((a.Player.Attributes || {}).Level || 1) - ((b.Player.Attributes || {}).Level || 1));
function simRun(boards, seed, o) { return BZ.run(Object.assign({ boards: JSON.parse(JSON.stringify(boards)), seed, sandstorm: true }, o || {})); }
function allEvents(res) { const e = []; res.frames.forEach(f => f.ev.forEach(x => e.push(x))); return e; }
const NARWHAL = () => tplByName('Narwhal').Id;

// quét thẻ một lần: sự kiện đầu tiên của từng loại khi thẻ đứng một mình (a-0) cạnh một Narwhal (a-1) trước một Narwhal (b-0)
function scanCards() {
  const stamp = ['cards.js'].map(f => { const s = fs.statSync(path.join(ROOT, 'games/bazaar/data', f)); return s.size + ':' + s.mtimeMs; }).join('|') + '|v3';
  const cache = path.join(OUT, '_scan.json');
  try { const c = JSON.parse(fs.readFileSync(cache, 'utf8')); if (c.stamp === stamp) return c.rows; } catch (e) { /* quét lại */ }
  const nar = NARWHAL(), rows = [];
  for (const t of CARDS) {
    if (t.$type !== 'TCardItem' || /DEBUG|Debug|Unused|Test/.test(t.InternalName)) continue;
    if (!['Small', 'Medium', 'Large'].includes(t.Size)) continue;
    let res;
    try { res = simRun([mkBoard('a', 'a', [{ id: t.Id }, { id: nar }], 1000), mkBoard('b', 'b', [{ id: nar }], 1000)], 1, { sandstorm: false, maxMs: 24000 }); } catch (e) { continue; }
    const first = {}, own = {}, count = {};
    allEvents(res).forEach(e => {
      const k = e.type === 'damage' || e.type === 'heal' ? e.type + ':' + (e.kind || '') : e.type;
      count[k] = (count[k] || 0) + 1;
      if (first[k] == null) first[k] = e.t;
      if (e.src === 'a-0' && own[k] == null) own[k] = e.t;
    });
    let at = {}; try { at = BZ.attrs({ uid: 'x', id: t.Id, tier: t.StartingTier, socket: 0, size: BZ.SIZE[t.Size] || 1, section: 'hand' }, null); } catch (e) { /* bỏ */ }
    rows.push({ id: t.Id, name: t.InternalName, tier: t.StartingTier, size: t.Size, heroes: t.Heroes || [], first, own, count, cd: at.CooldownMax || 0, multicast: at.Multicast || 1, ammo: at.AmmoMax || 0, dmg: at.DamageAmount || 0 });
  }
  try { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(cache, JSON.stringify({ stamp, rows })); } catch (e) { /* không ghi được thì thôi */ }
  return rows;
}
let SCAN = null;
const scan = () => SCAN || (SCAN = scanCards());
// chọn thẻ có sự kiện `key` (own = do chính thẻ ấy gây ra) sớm nhất; prefer = tên ưu tiên; pred = lọc thêm
function pickCard(key, o) {
  o = o || {};
  const rows = scan().filter(r => (o.own === false ? r.first[key] != null : r.own[key] != null) && (!o.pred || o.pred(r)));
  const tm = r => (o.own === false ? r.first[key] : r.own[key]);
  for (const n of o.prefer || []) { const r = rows.find(x => x.name === n && tm(x) <= (o.maxT || 12000)); if (r) return r; }
  const ok = rows.filter(r => tm(r) <= (o.maxT || 12000) && (o.tiers ? o.tiers.includes(r.tier) : r.tier === 'Bronze' || r.tier === 'Silver') && r.size !== 'Large' && /^(Common|Vanessa|Pygmalien|Dooley)$/.test(r.heroes[0] || ''));
  ok.sort((a, b) => tm(a) - tm(b) || (a.count[key] || 0) - (b.count[key] || 0) || a.name.localeCompare(b.name));
  return ok[0] || rows.sort((a, b) => tm(a) - tm(b))[0] || null;
}

// ---------- hạ tầng trình duyệt ----------
function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      fs.readFile(path.join(ROOT, u), (e, b) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream', 'Content-Length': b.length });
        r.end(b);
      });
    }).listen(0, () => res(srv));
  });
}
let BASE = '', BROWSER = null;
const LS_RUN = 'bz.run.v1';
async function openPage(url, o) {
  o = o || {};
  const ctx = await BROWSER.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1, hasTouch: !!o.touch });
  const page = await ctx.newPage();
  page._errors = [];
  page.on('pageerror', e => page._errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/frames\.js|favicon/.test(m.text() + (m.location() || {}).url)) page._errors.push('console: ' + m.text()); });
  await page.clock.install();
  await page.addInitScript(([k, v]) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { /* bỏ */ } }, [LS_RUN, o.save || null]);
  await page.goto(BASE + '/games/bazaar/index.html' + url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.BZ_READY === true && window.BZ_DEBUG, null, { timeout: 60000 });
  page._ctx = ctx;
  return page;
}
async function freeze(page) { const t = await page.evaluate(() => Date.now()); await page.clock.pauseAt(t + 120); }

// bơm vào trang: đồng bộ hoạt ảnh CSS theo thời gian giả + lấy mẫu
async function installSync(page, watch) {
  await page.evaluate(src => {
    window.__bzw = {};
    Object.keys(src).forEach(k => { try { window.__bzw[k] = new Function('return (' + src[k] + ')'); } catch (e) { /* bỏ */ } });
    window.__bzs = function (e) {
      var A = document.getAnimations(), i, a, et;
      for (i = 0; i < A.length; i++) {
        a = A[i];
        if (a.__b === undefined) { a.__b = e - (+a.currentTime || 0); try { a.pause(); } catch (x) { /* bỏ */ } }
        try { a.currentTime = e - a.__b; } catch (x) { /* bỏ */ }
        if (!a.__f) { try { et = a.effect.getComputedTiming().endTime; if (isFinite(et) && e - a.__b >= et) { a.__f = 1; a.finish(); } } catch (x) { /* bỏ */ } }
      }
      var s = { e: e }, F = window.BZFX && window.BZFX.counts && window.BZFX.counts();
      if (F) { s.projs = F.projs; s.nums = F.nums; s.parts = F.parts; }
      try { var S = window.BZ_DEBUG.state && window.BZ_DEBUG.state(); if (S) s.gt = Math.round(S.t); } catch (x) { /* bỏ */ }
      try { var C = window.BZ_DEBUG.combat && window.BZ_DEBUG.combat(); if (C && C.active) s.gt = Math.round(C.t); } catch (x) { /* bỏ */ }
      var W = window.__bzw;
      for (var k in W) { try { s['w_' + k] = !!W[k](); } catch (x) { /* bỏ */ } }
      return s;
    };
  }, watch || {});
}
// khoảng đầu tiên liên tục có giá trị truthy của một chuỗi mẫu: {at, len} (ms)
function span(samples, key) {
  let a = -1, b = -1;
  for (const s of samples) { if (s[key]) { if (a < 0) a = s.e; b = s.e; } else if (a >= 0) break; }
  return a < 0 ? null : { at: Math.round(a), len: Math.round(b - a + STEP) };
}
function refInfo(id) {
  for (const sub of ['', 'a']) {
    try { return JSON.parse(fs.readFileSync(path.join(REF, id, sub, 'meta.json'), 'utf8')); } catch (e) { /* thử tiếp */ }
  }
  return null;
}
function clipFromRef(meta) {
  const c = meta && meta.crop;
  if (!Array.isArray(c) || c.length !== 4) return null;
  // [BẪY ĐÃ SẬP] crop của ref là pixel của video NGUỒN (720p, 1080p hay 4K tuỳ clip) và meta không ghi cỡ nguồn;
  // đọc như khung 1024x576 làm khung web bị cắt lệch. Chỉ dùng khi ref ghi tỉ lệ 0..1 hoặc kèm crop_frame [w,h].
  const fr = c.every(v => v <= 1.0001), cf = Array.isArray(meta.crop_frame) ? meta.crop_frame : null;
  if (!fr && !cf) return null;
  const W = fr ? 1 : cf[0], H = fr ? 1 : cf[1];
  const x = Math.max(0, c[0] / W * VW), y = Math.max(0, c[1] / H * VH);
  return { x: Math.round(x), y: Math.round(y), width: Math.round(Math.min(VW - x, c[2] / W * VW)), height: Math.round(Math.min(VH - y, c[3] / H * VH)) };
}
const padClip = (r, p) => { const x = Math.max(0, Math.floor(r.x - p)), y = Math.max(0, Math.floor(r.y - p)); return { x, y, width: Math.min(VW - x, Math.ceil(r.w + 2 * p)), height: Math.min(VH - y, Math.ceil(r.h + 2 * p)) }; };

// ghi một dải: o = {frames, act(i), clip, extra(samples)->durations, notes, watch, url}
async function record(page, id, o) {
  const dir = path.join(OUT, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.readdirSync(dir).forEach(f => { if (/^\d+\.png$|^meta\.json$/.test(f)) fs.unlinkSync(path.join(dir, f)); });
  await installSync(page, o.watch);
  const ref = refInfo(id), clip = (typeof o.clip === 'function' ? await o.clip(page) : o.clip) || clipFromRef(ref) || null;
  const samples = [], gts = [];
  let e = 0;
  const n = Math.max(2, o.frames | 0);
  for (let i = 0; i < n; i++) {
    if (o.act) await o.act(i, page);
    const s0 = await page.evaluate(t => window.__bzs(t), e); samples.push(s0);
    gts.push(s0.gt == null ? null : s0.gt);
    await page.screenshot({ path: path.join(dir, String(i + 1).padStart(2, '0') + '.png'), clip: clip || undefined, animations: 'allow', caret: 'initial' });
    if (i === n - 1) break;
    for (let k = 0; k < SUB; k++) { await page.clock.runFor(STEP); e += STEP; samples.push(await page.evaluate(t => window.__bzs(t), e)); }
  }
  const dur = {};
  const sp = {
    projectile_flight: span(samples, 'projs'), floating_number: span(samples, 'nums')
  };
  Object.keys(o.watch || {}).forEach(k => { sp[k] = span(samples, 'w_' + k); });
  const onset = {};
  Object.keys(sp).forEach(k => { if (sp[k]) { dur[k] = sp[k].len; onset[k] = sp[k].at; } });
  if (o.extra) Object.assign(dur, o.extra(samples) || {});
  const meta = {
    moment: id, clip: 'web', url: page.url(), t0: 0, fps: FPS, frames: n, crop: clip ? [clip.x, clip.y, clip.width, clip.height] : null, viewport: [VW, VH],
    ui_version: 'current', notes: o.notes || '', durations_ms: dur, onset_ms: onset, game_ms_per_frame: gts, rev: await page.evaluate(() => window.BZ_REV || null),
    errors: page._errors.slice(0, 5)
  };
  if (o.metaExtra) Object.assign(meta, o.metaExtra);
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 1));
  return meta;
}

// ---------- khoảnh khắc chiến đấu (trang xem trận + bàn tuỳ ý) ----------
// spec: {ours:[cards], theirs:[cards], hpA, hpB, seed, start(events,res)->ms, frames, notes, clip, extra(res,events)->{}, watch}
async function combat(id, spec) {
  const seed = spec.seed || 1;
  const b0 = mkBoard('a', 'Phe ta', spec.ours, spec.hpA || 1000), b1 = mkBoard('b', 'Đối thủ', spec.theirs || [], spec.hpB || 1000);
  if (spec.attrsA) Object.assign(b0.attrs, spec.attrsA); // thuộc tính người chơi (vd RageMax) cho cảnh cần ép
  const res = simRun([b0, b1], seed), evs = allEvents(res);
  const start = Math.max(0, Math.round(spec.start(evs, res)));
  const page = await openPage('?view=1&moment=' + id);
  try {
    await page.evaluate(([a, b, s, m]) => { const D = window.BZ_DEBUG; D.fightBoards(a, b, s, { mon: m }); D.speed(1); D.pause(true); D.seek(0); }, [b0, b1, seed, [MON_L1[0].Id, MON_L1[1].Id]]);
    await sleep(1800);
    await page.evaluate(t => window.BZ_DEBUG.seek(t), start);
    await sleep(500);
    await freeze(page);
    await page.evaluate(() => window.BZ_DEBUG.pause(false));
    const meta = await record(page, id, {
      frames: spec.frames, notes: (spec.notes || '') + ' [web: sim seed ' + seed + ', bắt đầu ở ' + start + ' ms trận]', clip: spec.clip, watch: Object.assign({ banner: "(function(){var b=document.querySelector('.bz-banner');return !!b&&/show/.test(b.className)})()" }, spec.watch),
      act: spec.act, extra: () => (spec.extra ? spec.extra(res, evs) : {}), metaExtra: { sim: { seed, start_ms: start, end_ms: res.endMs, winner: res.winner } }
    });
    return meta;
  } finally { await page._ctx.close(); }
}
const evFirst = (evs, f) => evs.find(f);
// khoảng liên tục (ms) mà trạng thái status (chỉ số trong c[k]: 2 haste, 3 slow, 4 freeze, 6 flying) > 0 của thẻ uid, bắt đầu từ sau t0
function statusSpan(res, uid, idx, t0) {
  const k = res.cards.findIndex(c => c.uid === uid); if (k < 0) return null;
  let a = -1, b = -1;
  for (let i = Math.floor(t0 / 50); i < res.frames.length; i++) { const v = res.frames[i].c[k][idx]; if (v > 0) { if (a < 0) a = i; b = i; } else if (a >= 0) break; }
  return a < 0 ? null : (b - a + 1) * 50;
}
const NAR = () => ({ id: NARWHAL() });
function cardOf(key, o) { const r = pickCard(key, o); if (!r) throw new Error('no card with event ' + key); return r; }
const MOMENT_NOTE = (r, extra) => 'thẻ ' + r.name + ' (' + r.tier + ')' + (extra ? ' — ' + extra : '');

const H = {};   // id → async () => meta
// thẻ gây sát thương
H['fire-damage'] = () => {
  const r = cardOf('damage:Damage', { prefer: ['Cutlass', 'Rifle', 'Katana', 'Narwhal'] });
  return combat('fire-damage', { ours: [{ id: r.id }], theirs: [NAR()], seed: 1, frames: 22, notes: MOMENT_NOTE(r, 'bắn sát thương: thẻ giật + đạn + số + chân dung rung + thanh máu tụt'),
    start: evs => evFirst(evs, e => e.type === 'fire' && e.src === 'a-0').t - 350 });
};
H['crit'] = () => {
  const r = cardOf('damage:Damage', { prefer: ['Cutlass', 'Rifle', 'Katana', 'Narwhal'] });
  return combat('crit', { ours: [{ id: r.id, attrs: { CritChance: 100 } }], theirs: [NAR()], seed: 1, frames: 22, notes: MOMENT_NOTE(r, 'CritChance ép 100 %: bắn chí mạng'),
    start: evs => (evFirst(evs, e => e.type === 'fire' && e.src === 'a-0' && e.crit) || evFirst(evs, e => e.type === 'fire' && e.src === 'a-0')).t - 350 });
};
H['cooldown-sweep'] = () => {
  const r = cardOf('damage:Damage', { prefer: ['Narwhal'] });
  return combat('cooldown-sweep', { ours: [{ id: r.id }], theirs: [], seed: 1, frames: Math.min(60, Math.round(r.cd / 100) + 4), notes: MOMENT_NOTE(r, 'một chu kỳ hồi chiêu đầy đủ (' + r.cd + ' ms): lớp tối quét qua thẻ, cận cảnh'),
    start: evs => evFirst(evs, e => e.type === 'fire' && e.src === 'a-0').t + 100,
    clip: async page => { const b = await page.evaluate(() => { const e = document.querySelector('.bz-card[data-uid="a-0"]'); const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }); return padClip(b, 30); },
    extra: (res, evs) => { const f = evs.filter(e => e.type === 'fire' && e.src === 'a-0'); return f.length > 1 ? { cooldown_cycle: f[1].t - f[0].t } : {}; } });
};
H['shield'] = () => {
  const r = cardOf('shield', { prefer: ['Pearl', 'Duct Tape', 'Welding Helmet'] });
  return combat('shield', { ours: [{ id: r.id }, NAR()], theirs: [NAR()], seed: 1, frames: 22, notes: MOMENT_NOTE(r, 'được khiên: số vàng, thanh khiên chồng lên thanh máu, khung chân dung'),
    start: evs => evFirst(evs, e => e.type === 'shield' && e.src === 'a-0').t - 350 });
};
H['heal'] = () => {
  const r = cardOf('heal:Heal', { prefer: ['Kukri', 'Bandages', 'Bluenanas'], pred: x => x.name !== 'Starfish' });
  // phe ta máu thấp + đối thủ đánh đau để thanh máu có chỗ hồi
  return combat('heal', { ours: [{ id: r.id }], theirs: [{ id: NARWHAL(), attrs: { DamageAmount: 40, CooldownMax: 1000 } }], hpA: 300, seed: 1, frames: 24,
    notes: MOMENT_NOTE(r, 'hồi máu: đạn xanh, số xanh, thanh máu dâng. Đối thủ đánh đau trước (máu phe ta 300)'),
    start: evs => evFirst(evs, e => e.type === 'heal' && e.src === 'a-0' && e.amt > 0).t - 350 });
};
H['burn'] = () => {
  const r = cardOf('burn', { prefer: ['Pop Snappers', 'Lighter', 'Plasma Whip', 'Welding Helmet'] });
  return combat('burn', { ours: [{ id: r.id }, NAR()], theirs: [NAR()], seed: 1, frames: 40, notes: MOMENT_NOTE(r, 'gây bỏng + 2 nhịp bỏng: màu số, bộ đếm trạng thái, hiệu ứng chân dung'),
    start: evs => evFirst(evs, e => e.type === 'burn' && e.src === 'a-0').t - 350,
    extra: (res, evs) => { const t = evFirst(evs, e => e.type === 'burn' && e.src === 'a-0').t, k = evs.filter(e => e.type === 'damage' && e.kind === 'Burn' && e.t > t).slice(0, 3).map(e => e.t - t); return k.length ? { burn_first_ticks_after_apply: k[0], burn_tick_interval: k[1] != null ? k[1] - k[0] : 0 } : {}; } });
};
H['poison'] = () => {
  const r = cardOf('poison', { prefer: ['Trained Spider', 'Poison Blades', 'Acid Sprayer'] });
  return combat('poison', { ours: [{ id: r.id }, NAR()], theirs: [NAR()], seed: 1, frames: 32, notes: MOMENT_NOTE(r, 'gây độc + 1 nhịp độc'),
    start: evs => evFirst(evs, e => e.type === 'poison' && e.src === 'a-0').t - 350,
    extra: (res, evs) => { const t = evFirst(evs, e => e.type === 'poison' && e.src === 'a-0').t, k = evs.filter(e => e.type === 'damage' && e.kind === 'Poison' && e.t > t)[0]; return k ? { poison_first_tick_after_apply: k.t - t } : {}; } });
};
H['regen'] = () => {
  const r = cardOf('regen', { prefer: ['Starfish'] });
  return combat('regen', { ours: [{ id: r.id }], theirs: [{ id: NARWHAL(), attrs: { DamageAmount: 40, CooldownMax: 1000 } }], hpA: 300, seed: 1, frames: 32,
    notes: MOMENT_NOTE(r, 'hồi máu theo nhịp (regen): số xanh nhạt mỗi nhịp'), start: evs => evFirst(evs, e => e.type === 'heal' && e.kind === 'Regen').t - 350 });
};
function statusMoment(id, evType, idx, label, targetIn) {
  return () => {
    const r = cardOf(evType, { prefer: { haste: ['Micro Mach', 'Power Sander'], slow: ['Duct Tape', 'Cool LEDs'], freeze: ['Yeti Crab', 'Frozen Bludgeon'] }[evType] || [] });
    return combat(id, { ours: [{ id: r.id }, NAR()], theirs: [NAR()], seed: 1, frames: 34, notes: MOMENT_NOTE(r, label + ' lên thẻ mục tiêu: lớp phủ trạng thái và thời hạn'),
      start: evs => evFirst(evs, e => e.type === evType && e.src === 'a-0').t - 350,
      extra: (res, evs) => { const e0 = evFirst(evs, e => e.type === evType && e.src === 'a-0'); const s = statusSpan(res, e0.target, idx, e0.t); return s ? { [id + '_status_active']: s } : {}; } });
  };
}
H['haste'] = statusMoment('haste', 'haste', 2, 'tăng tốc (Haste)');
H['slow'] = statusMoment('slow', 'slow', 3, 'làm chậm (Slow)');
H['freeze'] = statusMoment('freeze', 'freeze', 4, 'đóng băng (Freeze)');
H['charge'] = () => {
  const r = cardOf('charge', { prefer: ['Pearl', 'Piranha', 'Marbles'] });
  return combat('charge', { ours: [{ id: r.id }, NAR()], theirs: [NAR()], seed: 1, frames: 22, notes: MOMENT_NOTE(r, 'sạc thẻ: thanh hồi chiêu của thẻ đích nhảy tới'),
    start: evs => evFirst(evs, e => e.type === 'charge' && e.src === 'a-0').t - 350 });
};
H['multicast'] = () => {
  const r = pickCard('damage:Damage', { pred: x => x.multicast > 1, tiers: ['Bronze', 'Silver', 'Gold'] }) || pickCard('fire', { pred: x => x.multicast > 1, tiers: ['Bronze', 'Silver', 'Gold'] });
  if (!r) throw new Error('no card with Multicast > 1');
  return combat('multicast', { ours: [{ id: r.id }], theirs: [NAR()], seed: 1, frames: 24, notes: MOMENT_NOTE(r, 'nhiều lần bắn (Multicast ' + r.multicast + ')'),
    start: evs => evFirst(evs, e => e.type === 'fire' && e.src === 'a-0').t - 350 });
};
H['ammo'] = () => {
  const r = pickCard('fire', { pred: x => x.ammo > 1 && x.cd > 0 && x.cd <= 4000, tiers: ['Bronze', 'Silver'] }) || pickCard('fire', { pred: x => x.ammo > 1, tiers: ['Bronze', 'Silver', 'Gold'] });
  if (!r) throw new Error('no card with AmmoMax');
  const reload = pickCard('reload', { tiers: ['Bronze', 'Silver'] });
  const ours = reload && reload.name !== r.name ? [{ id: r.id }, { id: reload.id }] : [{ id: r.id }];
  return combat('ammo', { ours, theirs: [NAR()], seed: 1, frames: 60, notes: MOMENT_NOTE(r, 'tiêu hao đạn (AmmoMax ' + r.ammo + ') tới hết' + (ours.length > 1 ? ', nạp lại bằng ' + reload.name : '')),
    start: evs => evFirst(evs, e => e.type === 'fire' && e.src === 'a-0').t - 350 });
};
H['destroy'] = () => {
  const r = cardOf('destroy', { own: true, tiers: ['Bronze', 'Silver', 'Gold'], pred: x => x.size !== 'Large' });
  return combat('destroy', { ours: [{ id: r.id }, NAR()], theirs: [NAR()], seed: 1, frames: 24, notes: MOMENT_NOTE(r, 'một thẻ bị phá huỷ'),
    start: evs => evFirst(evs, e => e.type === 'destroy').t - 350 });
};
H['flying'] = () => {
  const r = cardOf('flying', { prefer: ['Flying Fish', 'Marlon', 'Slingshot'] });
  return combat('flying', { ours: [{ id: r.id }, NAR()], theirs: [NAR()], seed: 1, frames: 28, notes: MOMENT_NOTE(r, 'thẻ bay'),
    start: evs => evFirst(evs, e => e.type === 'flying' && e.on).t - 350,
    extra: (res, evs) => { const e0 = evFirst(evs, e => e.type === 'flying' && e.on); const s = statusSpan(res, e0.target, 6, e0.t); return s ? { flying_status_active: s } : {}; } });
};
H['enrage'] = () => {
  const r = pickCard('rage', { own: false, tiers: ['Bronze', 'Silver', 'Gold'], maxT: 40000 });
  if (!r) throw new Error('no card with rage events');
  return combat('enrage', { ours: [{ id: r.id }, NAR()], theirs: [NAR()], seed: 1, frames: 40, attrsA: { RageMax: 20 }, notes: MOMENT_NOTE(r, 'thanh giận dữ đầy dần → nổi giận → hết giận (RageMax hạ xuống 20 để thấy đủ chu kỳ)'),
    start: evs => (evFirst(evs, e => e.type === 'enrage' && e.on) || evFirst(evs, e => e.type === 'rage')).t - 800 });
};
H['sandstorm'] = () => combat('sandstorm', { ours: [NAR()], theirs: [NAR()], seed: 1, frames: 70, notes: 'hai Narwhal đấu lâu: bão cát đếm ngược (25 s) → nổi (30 s) → trừ máu',
  start: () => BZ.SANDSTORM.countdownStart - 200,
  extra: () => ({ sandstorm_countdown_ms: BZ.SANDSTORM.countdown, sandstorm_countdown_start: BZ.SANDSTORM.countdownStart }) });
H['death-victory'] = () => combat('death-victory', { ours: [{ id: NARWHAL(), attrs: { DamageAmount: 40, CooldownMax: 1000 } }], theirs: [NAR()], hpB: 120, seed: 1, frames: 52,
  notes: 'đòn kết liễu: chân dung đối thủ gục → vương miện → băng-rôn CHIẾN THẮNG (giữ ~1,5 s) rồi mờ',
  start: (evs, res) => res.endMs - 350, extra: (res) => ({ lethal_to_banner_start: BZ_LAG() + 750 }) });
function BZ_LAG() { return 350; }

// ---------- tương tác thẻ (rê chuột) ----------
async function cardBox(page, uid) { return page.evaluate(u => { const e = document.querySelector('.bz-card[data-uid="' + u + '"]'); const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, uid); }
function hoverMoment(id, notes, frames, path_) {
  return async () => {
    const r = cardOf('damage:Damage', { prefer: ['Cutlass', 'Rifle', 'Katana', 'Narwhal'] });
    const b0 = mkBoard('a', 'Phe ta', [{ id: r.id }, NAR(), { id: tplByName('Pearl').Id }], 1000), b1 = mkBoard('b', 'Đối thủ', [NAR()], 1000);
    const page = await openPage('?view=1&moment=' + id);
    try {
      await page.evaluate(([a, b, m]) => { const D = window.BZ_DEBUG; D.fightBoards(a, b, 1, { mon: m }); D.speed(1); D.pause(true); D.seek(1000); }, [b0, b1, [MON_L1[0].Id, MON_L1[1].Id]]);
      await sleep(1800);
      const bx = await cardBox(page, 'a-1');
      await page.mouse.move(bx.x + bx.w / 2, bx.y - 120);
      await sleep(300);
      await freeze(page);
      const meta = await record(page, id, { frames, notes, watch: { tooltip: "(function(){var t=document.querySelector('.bz-tip');return !!t&&t.classList.contains('show')})()", hover: "(function(){var e=document.querySelector('.bz-card[data-uid=\"a-1\"]');return !!e&&e._bz&&e._bz.hover>0.02})()" },
        act: async (i) => { const p = path_(i, bx); if (p) await page.mouse.move(p.x, p.y, { steps: 1 }); },
        clip: () => null });
      return meta;
    } finally { await page._ctx.close(); }
  };
}
H['hover-tilt'] = hoverMoment('hover-tilt', 'rê chuột vào thẻ trên bàn: nhấc lên + nghiêng theo con trỏ, rồi đi ngang qua thẻ', 18, (i, b) => {
  if (i < 2) return { x: b.x + b.w / 2, y: b.y - 120 };
  if (i < 4) return { x: b.x + b.w / 2, y: b.y + b.h * 0.4 };       // vào giữa thẻ
  if (i < 8) return { x: b.x + b.w * (0.5 - 0.06 * (i - 3)), y: b.y + b.h * 0.4 }; // lệch trái
  if (i < 14) return { x: b.x + b.w * (0.25 + 0.1 * (i - 7)), y: b.y + b.h * 0.7 }; // quét sang phải
  return { x: b.x + b.w / 2, y: b.y - 120 };                          // rời
});
H['tooltip'] = hoverMoment('tooltip', 'rê chuột lên thẻ rồi giữ yên: tooltip mở ra', 16, (i, b) => (i < 2 ? { x: b.x + b.w / 2, y: b.y - 120 } : { x: b.x + b.w / 2, y: b.y + b.h * 0.4 }));

// ---------- khoảnh khắc trong run (dựng trạng thái bằng reducer ở Node) ----------
// policy: người chơi giả — chọn thương nhân khi có vàng, mua món đắt nhất mỗi lần ghé thứ hai, đánh mọi trận, nhận mọi phần thưởng
function policy(run, st) {
  const L = R.legal(run).filter(c => c.t !== 'move' && c.t !== 'sell'), has = t => L.filter(c => c.t === t), ph = run.phase;
  if (ph.kind === 'heroSelect') return { t: 'pickHero', hero: st.hero };
  if (ph.kind === 'event' && ph.eventId === 'start') { const i = ph.choices.findIndex(c => c.key === (st.start || 'income')); return { t: 'choose', i: i < 0 ? 0 : i }; }
  if (ph.kind === 'merchant') { const b = has('buy'); if (b.length && (st.n++ % 2 === 0)) return b.reduce((a, x) => ph.stock[x.i].price > ph.stock[a.i].price ? x : a); return { t: 'leave' }; }
  if (ph.kind === 'choose') { const mi = ph.options.findIndex(o => o.type === 'merchant'), k = (st.n++) % 3; return { t: 'pick', i: (mi >= 0 && run.gold >= 4 && k !== 2) ? mi : Math.min(k, ph.options.length - 1) }; }
  for (const t of ['choose', 'fight', 'next', 'leave']) { const x = has(t); if (x.length) return x[0]; }
  return null;
}
function explore(seed, hero, start, onState, maxSteps) {
  let run = R.apply(R.newRun({ seed }), { t: 'pickHero', hero }).run;
  const st = { hero, start, n: 0 };
  for (let i = 0; i < (maxSteps || 500); i++) {
    if (run.phase.kind === 'end') break;
    const r = onState(run, i); if (r) return Object.assign({ seed, hero, step: i }, r);
    const c = policy(run, st); if (!c) break;
    const x = R.apply(run, c); if (!x.ok) break;
    run = x.run;
  }
  return null;
}
// trans: tìm (trạng thái, lệnh) mà lệnh đó làm match(trước, lệnh, sau, sự kiện) đúng; state: tìm trạng thái pred đúng
function findTrans(match, o) {
  o = o || {};
  for (const hero of o.heroes || ['Vanessa', 'Pygmalien', 'Dooley']) for (let seed = 1; seed <= (o.seeds || 24); seed++) {
    const r = explore(seed, hero, o.start, run => {
      for (const c of R.legal(run)) { if (c.t === 'move' || c.t === 'sell') continue; const x = R.apply(run, c); if (x.ok && match(run, c, x.run, x.events)) return { run, cmd: c }; }
      return null;
    }, o.max);
    if (r) return r;
  }
  return null;
}
function findState(pred, o) {
  o = o || {};
  for (const hero of o.heroes || ['Vanessa', 'Pygmalien', 'Dooley']) for (let seed = 1; seed <= (o.seeds || 24); seed++) {
    const r = explore(seed, hero, o.start, run => pred(run) ? { run } : null, o.max);
    if (r) return r;
  }
  return null;
}
const FLOWS = {
  'day-card': () => findTrans((a, c, b) => a.phase.kind === 'fightResult' && b.day > a.day),
  'hour-choice': () => findTrans((a, c, b) => a.phase.kind === 'event' && a.phase.eventId === 'start' && b.phase.kind === 'choose'),
  'encounter-hover': () => findState(r => r.phase.kind === 'choose' && r.hour !== R.TUNING.PVE_HOUR && r.phase.options.length === 3),
  'monster-preview': () => findState(r => r.phase.kind === 'choose' && r.hour === R.TUNING.PVE_HOUR),
  'merchant-enter': () => findTrans((a, c, b) => a.phase.kind === 'choose' && b.phase.kind === 'merchant'),
  'buy-drag': () => findState(r => r.phase.kind === 'merchant' && R.legal(r).some(c => c.t === 'buy' && R.tpl(r.phase.stock[c.i].card.id).Size !== 'Large')),
  'sell-drag': () => findState(r => r.phase.kind === 'merchant' && R.allCards(r).some(c => c.section === 'hand'), { start: 'item' }),
  'reroll': () => findState(r => r.phase.kind === 'merchant' && R.legal(r).some(c => c.t === 'reroll')),
  'event-choice': () => findTrans((a, c, b) => a.phase.kind === 'choose' && b.phase.kind === 'event' && b.phase.eventId !== 'start' && b.phase.choices.length >= 2),
  'fight-start': () => findTrans((a, c, b) => a.phase.kind === 'fight' && c.t === 'fight' && a.phase.combatType === 'PVE'),
  'fight-result': () => findState(r => r.phase.kind === 'fight' && r.phase.combatType === 'PVE'),
  'loot-pick': () => findState(r => r.phase.kind === 'loot' && r.phase.picks.length >= 2),
  'level-up': () => findTrans((a, c, b) => b.phase.kind === 'levelUp'),
  'pvp-vs': () => findTrans((a, c, b) => b.phase.kind === 'fight' && b.phase.combatType === 'PVP'),
  'enchant': () => findTrans((a, c, b, ev) => a.phase.kind === 'pedestal' && c.t === 'choose' && ev.some(e => e.type === 'enchant')),
  'upgrade': () => findTrans((a, c, b, ev) => a.phase.kind === 'pedestal' && c.t === 'choose' && ev.some(e => e.type === 'upgrade')),
  'stash-open': () => findState(r => r.phase.kind === 'choose' && R.allCards(r).some(c => c.section === 'hand')),
  'run-end': () => findTrans((a, c, b) => b.phase.kind === 'end')
};
let FLOWCACHE = null;
function flowStamp() {
  const fs_ = [];
  ['games/bazaar/js/run', 'games/bazaar/js/sim', 'games/bazaar/data'].forEach(d => fs.readdirSync(path.join(ROOT, d)).forEach(f => { if (/\.js$/.test(f) && !/art|audio|frames/.test(f)) { const s = fs.statSync(path.join(ROOT, d, f)); fs_.push(f + s.size); } }));
  return fs_.join('|') + '|v1';
}
function getFlow(name) {
  const cache = path.join(OUT, '_flow.json'), stamp = flowStamp();
  if (!FLOWCACHE) { try { const c = JSON.parse(fs.readFileSync(cache, 'utf8')); FLOWCACHE = c.stamp === stamp ? c : { stamp, flows: {} }; } catch (e) { FLOWCACHE = { stamp, flows: {} }; } }
  if (!(name in FLOWCACHE.flows)) {
    const r = FLOWS[name]();
    FLOWCACHE.flows[name] = r ? { seed: r.seed, hero: r.hero, step: r.step, cmd: r.cmd || null, run: R.serialize(r.run) } : null;
    try { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(cache, JSON.stringify(FLOWCACHE)); } catch (e) { /* bỏ */ }
  }
  const f = FLOWCACHE.flows[name];
  if (!f) throw new Error('không tìm thấy trạng thái run cho ' + name + ' (đã thử 3 hero × 24 hạt giống)');
  return Object.assign({}, f, { runObj: R.deserialize(f.run) });
}
async function flowPage(run, wait) {
  const page = await openPage('', { save: run ? R.serialize(run) : null });
  await sleep(wait || 2800);
  return page;
}
async function trig(page, cmd) {
  const r = await page.evaluate(c => window.BZ_DEBUG.cmd(c), cmd);
  if (!r.ok) throw new Error('lệnh bị từ chối ' + JSON.stringify(cmd) + ': ' + r.reason);
}
const rectOf = (page, sel, idx) => page.evaluate(([s, i]) => { const e = document.querySelectorAll(s)[i || 0]; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; }, [sel, idx || 0]);
const W = {
  daycard: "!!document.querySelector('.rs-daycard')", daycard_roll: "!!document.querySelector('.rs-daycard.roll')",
  vs: "!!document.querySelector('.rs-vs')", encounter_frames: "document.querySelectorAll('.rs-top .rs-enc').length>=3",
  preview: "!!document.querySelector('.rs-preview')", portal: "!!document.querySelector('.rs-portal')", result_panel: "!!document.querySelector('.rs-result')",
  choices_panel: "!!document.querySelector('.rs-choices')", banner: "(function(){var b=document.querySelector('.bz-banner');return !!b&&/show/.test(b.className)})()",
  stash: "(function(){var e=document.querySelector('.rs-stash,.rs-cards.stash-open');return !!e})()"
};
// trạng thái (hoặc kết quả của lệnh) → hoạt ảnh: nạp run, chờ yên, dừng đồng hồ, bắn lệnh ở khung 1
function transMoment(id, frames, notes, watch) {
  return async () => {
    const f = getFlow(id), page = await flowPage(f.runObj);
    try {
      await freeze(page);
      return await record(page, id, { frames, watch, notes: notes + ' [web: run ' + f.hero + ' seed ' + f.seed + ', lệnh ' + JSON.stringify(f.cmd) + ']', act: async i => { if (i === 0) await trig(page, f.cmd); } });
    } finally { await page._ctx.close(); }
  };
}
H['hero-select'] = async () => {
  const page = await openPage('', { save: null });
  try {
    await sleep(2500); await freeze(page);
    const b = await rectOf(page, '.rs-screen.title .rs-big.play');
    return await record(page, 'hero-select', { frames: 26, notes: 'bấm "Chơi" ở màn tiêu đề → màn chọn nhân vật hiện ra (cột lục giác, hero to, bảng tên)',
      act: async i => { if (i === 0) await page.mouse.click(b.cx, b.cy); } });
  } finally { await page._ctx.close(); }
};
H['day-card'] = transMoment('day-card', 50, 'bấm "Tiếp tục" sau trận PvP: thẻ Ngày N lăn sang N+1 rồi ba khung bật ra', { daycard: W.daycard, daycard_roll: W.daycard_roll, encounter_frames: W.encounter_frames });
H['hour-choice'] = transMoment('hour-choice', 28, 'chọn phần thưởng mở màn → màn chọn giờ: ba khung gặp gỡ hiện ra', { encounter_frames: W.encounter_frames });
H['merchant-enter'] = transMoment('merchant-enter', 26, 'chọn khung thương nhân: cổng xanh quét, hàng bày ra', { portal: W.portal });
H['event-choice'] = transMoment('event-choice', 26, 'vào một sự kiện có lựa chọn: các lựa chọn hiện ra', { choices_panel: W.choices_panel });
H['fight-start'] = transMoment('fight-start', 36, 'bấm "Chiến đấu!": chuyển cảnh vào trận, hai bàn vào chỗ, trận bắt đầu', {});
H['level-up'] = transMoment('level-up', 30, 'đủ XP → lên cấp: băng-rôn + ô mở thêm + màn chọn phần thưởng cấp', {});
H['pvp-vs'] = transMoment('pvp-vs', 62, 'vào trận PvP bóng: chớp trắng → màn VS → thẻ úp rồi lật', { vs: W.vs });
H['enchant'] = transMoment('enchant', 24, 'yểm bùa một món ở bệ: chớp khung + biểu tượng bùa', {});
H['upgrade'] = transMoment('upgrade', 24, 'nâng bậc một món ở bệ: chớp khung + đổi viền bậc', {});
H['run-end'] = transMoment('run-end', 40, 'trận cuối kết thúc run: màn tổng kết (băng-rôn, thống kê, rương, bàn cuối)', {});
// rê chuột lên khung gặp gỡ
function hoverEnc(id, notes, idx, watch) {
  return async () => {
    const f = getFlow(id), page = await flowPage(f.runObj, 3200);
    try {
      await freeze(page);
      const b = await rectOf(page, '.rs-top .rs-enc .fr', idx);
      await page.mouse.move(640, 690);
      return await record(page, id, { frames: 16, watch, notes: notes + ' [web: run ' + f.hero + ' seed ' + f.seed + ']',
        act: async i => { if (i === 2) await page.mouse.move(b.cx - 60, b.cy + 90, { steps: 1 }); if (i === 3) await page.mouse.move(b.cx, b.cy, { steps: 1 }); if (i > 5 && i < 12) await page.mouse.move(b.cx + (i - 8) * 8, b.cy + (i % 2) * 6, { steps: 1 }); if (i === 13) await page.mouse.move(640, 690, { steps: 1 }); } });
    } finally { await page._ctx.close(); }
  };
}
H['encounter-hover'] = hoverEnc('encounter-hover', 'rê chuột lên khung gặp gỡ: khung nhấc lên + nhịp phập phồng + chú giải', 0, {});
H['monster-preview'] = hoverEnc('monster-preview', 'rê chuột lên khung quái ở giờ PvE: bảng xem trước phần thưởng + bàn quái', 1, { preview: W.preview });
// kéo thả bằng chuột thật, mỗi khung một bước
async function dragMoment(id, notes, getPlan, watch) {
  const f = getFlow(id), page = await flowPage(f.runObj, 3200);
  try {
    await freeze(page);
    const plan = await getPlan(page, f.runObj);
    const N = 22, steps = 9;
    return await record(page, id, { frames: N, watch, notes: notes + ' [web: run ' + f.hero + ' seed ' + f.seed + ']', metaExtra: { plan: plan.info },
      act: async i => {
        if (i === 0) await page.mouse.move(plan.from.x, plan.from.y);
        else if (i === 1) { await page.mouse.move(plan.from.x + 2, plan.from.y + 2); await page.mouse.down(); }
        else if (i < 2 + steps) { const u = (i - 1) / steps; await page.mouse.move(plan.from.x + (plan.to.x - plan.from.x) * u, plan.from.y + (plan.to.y - plan.from.y) * u); }
        else if (i === 2 + steps) { await page.mouse.move(plan.to.x, plan.to.y); await page.mouse.up(); }
      } });
  } finally { await page._ctx.close(); }
}
H['buy-drag'] = () => dragMoment('buy-drag', 'kéo một món từ hàng thương nhân xuống ô trống của bàn (mua): thẻ nhấc, ô sáng, thả, xu bay', async (page, run) => {
  const buy = R.legal(run).filter(c => c.t === 'buy' && R.tpl(run.phase.stock[c.i].card.id).Size !== 'Large').sort((a, b) => run.phase.stock[b.i].price - run.phase.stock[a.i].price)[0];
  const size = R.SIZE[R.tpl(run.phase.stock[buy.i].card.id).Size];
  let sock = -1; for (let s = 0; s + size <= 10; s++) if (R.canPlace(run, 'hand', s, size, null)) { sock = s; break; }
  if (sock < 0) throw new Error('bàn hết chỗ cho món mua');
  const from = await page.evaluate(i => { const e = Array.from(document.querySelectorAll('.rs-cards .bz-card.top')).find(x => x._rs && x._rs.kind === 'stock' && x._rs.i === i); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, buy.i);
  const to = await page.evaluate(([s, n]) => { const a = window.BZ_DEBUG.socketRect('hand', s), b = window.BZ_DEBUG.socketRect('hand', s + n - 1); return { x: (a.x + b.x + b.w) / 2, y: a.cy }; }, [sock, size]);
  return { from, to, info: { buy: buy.i, socket: sock, size } };
}, { gold_flight: "false" });
H['sell-drag'] = () => dragMoment('sell-drag', 'kéo một món của mình lên vùng bán: vùng bán hiện giá, thả, xu bay về túi', async (page, run) => {
  const c = R.allCards(run).filter(x => x.section === 'hand')[0];
  const from = await page.evaluate(uid => { const r = window.BZUI.cards.ownEl(uid).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, c.uid);
  const z = await rectOf(page, '.rs-sellzone');
  return { from, to: { x: z.cx, y: z.cy }, info: { sell: c.uid, id: c.id } };
}, {});
H['reroll'] = async () => {
  const f = getFlow('reroll'), page = await flowPage(f.runObj, 3200);
  try {
    await freeze(page);
    const b = await rectOf(page, '.rs-reroll');
    return await record(page, 'reroll', { frames: 22, notes: 'bấm nút Đổi hàng: vòng xoay, xu trừ, hàng cũ lùi, hàng mới chia vào [web: run ' + f.hero + ' seed ' + f.seed + ']',
      act: async i => { if (i === 1) await page.mouse.move(b.cx, b.cy); if (i === 2) await page.mouse.click(b.cx, b.cy); } });
  } finally { await page._ctx.close(); }
};
H['fight-result'] = async () => {
  const f = getFlow('fight-result'), page = await flowPage(f.runObj, 3000);
  try {
    await trig(page, { t: 'fight' });
    await sleep(2200);
    await freeze(page);
    return await record(page, 'fight-result', { frames: 34, watch: { result_panel: W.result_panel, banner: W.banner }, notes: 'trận phát lại tới cuối → bảng kết quả (thắng/thua, vàng, XP, món của quái, nút Tiếp tục) [web: run ' + f.hero + ' seed ' + f.seed + ', nhảy tới cuối trận ở khung 1]',
      act: async i => { if (i === 0) await page.evaluate(() => window.BZUI.combat.skip()); } });
  } finally { await page._ctx.close(); }
};
H['loot-pick'] = async () => {
  const f = getFlow('loot-pick'), page = await flowPage(f.runObj, 3200);
  try {
    await freeze(page);
    const b = await rectOf(page, '.rs-cards .bz-card.top', 0);
    return await record(page, 'loot-pick', { frames: 22, notes: 'chọn một món loot sau khi thắng quái: các món còn lại mờ đi, món chọn bay xuống bàn [web: run ' + f.hero + ' seed ' + f.seed + ']',
      act: async i => { if (i === 1) await page.mouse.move(b.cx, b.cy); if (i === 3) await page.mouse.click(b.cx, b.cy); } });
  } finally { await page._ctx.close(); }
};
H['stash-open'] = async () => {
  const f = getFlow('stash-open'), page = await flowPage(f.runObj, 3200);
  try {
    await freeze(page);
    return await record(page, 'stash-open', { frames: 16, notes: 'bấm Space: kho mở ra / thu lại [web: run ' + f.hero + ' seed ' + f.seed + ']',
      act: async i => { if (i === 1) await page.keyboard.press('Space'); if (i === 10) await page.keyboard.press('Space'); } });
  } finally { await page._ctx.close(); }
};

// ---------- chạy ----------
(async () => {
  const t0 = Date.now();
  const all = parseMoments();
  const todo = all.filter(m => !ONLY.length || ONLY.includes(m));
  let srv = null;
  BASE = (process.env.BZ_URL || '').replace(/\/$/, '');
  if (!BASE) { srv = await serve(); BASE = 'http://127.0.0.1:' + srv.address().port; }
  fs.mkdirSync(OUT, { recursive: true });
  BROWSER = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=d3d11', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
  const ok = [], bad = [];
  for (const id of todo) {
    const t1 = Date.now();
    if (!H[id]) { bad.push([id, 'chưa có kịch bản']); console.log('  - ' + id + ': chưa có kịch bản'); continue; }
    try {
      const m = await H[id]();
      ok.push(id);
      console.log('  ok ' + id + ' (' + m.frames + ' khung, ' + ((Date.now() - t1) / 1000).toFixed(1) + ' s) ' + JSON.stringify(m.durations_ms) + (m.errors.length ? ' LỖI TRANG: ' + m.errors[0] : ''));
    } catch (e) {
      bad.push([id, String(e && e.message || e).split('\n')[0]]);
      console.log('  XX ' + id + ': ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | '));
    }
  }
  await BROWSER.close();
  if (srv) srv.close();
  console.log('\nChụp xong ' + ok.length + '/' + todo.length + ' khoảnh khắc vào ' + OUT + ' trong ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
  if (bad.length) console.log('Không làm được: ' + bad.map(b => b[0] + ' (' + b[1] + ')').join('; '));
  process.exit(bad.length ? 1 : 0);
})();
