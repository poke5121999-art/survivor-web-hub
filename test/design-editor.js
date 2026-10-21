/*
 * Bộ kiểm cho trang sửa thông số game (design.html).
 * Chạy qua HTTP thật, với một proxy GIẢ trong tiến trình thực hiện đúng hợp đồng
 * list/get/save trên các bảng nằm trong bộ nhớ (chỉ quests có sẵn, 29 bảng còn lại "chưa dán").
 * Nhãn (data/design-labels.js) được thay bằng bản cố định ở dưới để phép đo không đổi theo file nhãn thật.
 */
// PW / SHOTS / PW_CHANNEL override the author's machine paths (PW_CHANNEL=chrome runs playwright-core on installed Chrome).
const PW = process.env.PW || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || 'C:/Users/tamph/AppData/Local/Temp/claude/D--REPO-Meta/e97f08e7-4c36-4a2b-a58d-a5dc29bf4f23/scratchpad/shots';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const KNOWN = ['wallet_start', 'crew', 'tactics', 'upgrade', 'passives', 'gacha_banners', 'gacha_rules', 'shop_packs',
  'shop_rules', 'shop_exchange', 'loadout', 'quests', 'maps', 'run_reward', 'stage_houses', 'stage_rules',
  'extract_quota', 'loot_cap', 'loot_sizes', 'loot_materials', 'loot_items', 'safes_chests', 'station_upgrades',
  'station_gear', 'station_healthpacks', 'station_vehicles', 'station_rules', 'gacha_wheel', 'foes', 'run_timers', 'modes', 'pvp_maps'];

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'data/design-defaults.js'), 'utf8'), sandbox);
const DEFAULTS = sandbox.window.DESIGN_DEFAULTS.tables;

// Cost guard copy is checked as shipped, so it comes from the real label file.
const realLabels = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'data/design-labels.js'), 'utf8'), realLabels);

const LABELS_JS = 'window.DESIGN_LABELS = ' + JSON.stringify({
  quests: { title: 'Nhiệm vụ', blurb: 'Nhiệm vụ ngày.', effect: 'Từ lần gọi API kế tiếp.', expand: true,
    fields: { pick: { label: 'Số nhiệm vụ mỗi ngày', int: true, min: 1, unit: 'nhiệm vụ' },
      list: { label: 'Danh sách nhiệm vụ', cols: ['id', 'text', 'metric', 'need', 'reward.gold', 'reward.gem', 'reward.ticketX'],
        add: { button: '+ Thêm nhiệm vụ', idPrefix: { daily: 'd_', weekly: 'w_', ach: 'a_' }, item: { text: '', metric: 'runs', need: 1, reward: { gold: 100 } } } },
      'list.*.id': { label: 'Mã', re: '^[a-z0-9_]{1,40}$', unique: true, invalid: 'Mã sai dạng.' },
      'list.*.text': { label: 'Mô tả', re: '[^ ]', invalid: 'Nhập chữ người chơi thấy.' },
      'list.*.metric': { label: 'Đếm theo', choicesBy: realLabels.window.DESIGN_LABELS.quests.fields['list.*.metric'].choicesBy },
      'list.*.need': { label: 'Cần đạt', int: true, min: 1 },
      'list.*.reward.gold': { label: 'Thưởng vàng', unit: 'vàng', int: true, optional: true },
      'list.*.reward.gem': { label: 'Thưởng gem', int: true, optional: true },
      'list.*.reward.ticketX': { label: 'Vé', int: true, optional: true } } },
  gacha_banners: { title: 'Banner quay', rowLabels: { char: 'Banner nhân vật' },
    fields: { rate5: { label: 'Tỉ lệ 5★', pct: true, min: 0, max: 1, help: '0.006 = 0,6%' } } },
  stage_houses: { title: 'Các nhà trong ải', rowTitle: 'name',
    sections: [
      { title: 'Phòng và hành lang (theo vị trí nhà, không xáo)', rowLabels: { 1: 'Nhà 1', 2: 'Nhà 2', 3: 'Nhà 3', 4: 'Nhà 4', 5: 'Nhà 5' },
        fields: ['extractRooms', 'privateRooms', 'sharedRooms', 'shortCorridors', 'longCorridors', 'specialExtract', 'mediumRatio', 'largeRatio'] },
      { title: 'Độ khó và quái (theo vị trí nhà, không xáo)', rowLabels: { 1: 'Nhà 1', 2: 'Nhà 2', 3: 'Nhà 3', 4: 'Nhà 4', 5: 'Nhà 5' },
        fields: ['level', 'hpMul', 'dmgMul', 'quotaMul', 'foeCount', 'kindCount', 'foes'] },
      { title: 'Theme (xáo ngẫu nhiên mỗi ca)', rowTitle: 'name',
        noteWhen: { table: 'stage_rules', field: 'shuffleThemes', true: 'NOTE-BẬT', false: 'NOTE-TẮT' },
        fields: ['name', 'houseStyle', 'loot', 'materials', 'giaTriMul', 'ownFoes', 'boss', 'bossFromHouse'] }],
    fields: { extractRooms: { label: 'Số phòng extract', int: true, min: 0 }, name: { label: 'Tên nhà' } } },
  wallet_start: { title: 'Gói khởi đầu', blurb: 'Tài khoản mới nhận gì khi vào game lần đầu.', effect: 'Chỉ áp cho tài khoản tạo SAU khi lưu.',
    fields: { gold: { label: 'Vàng', unit: 'vàng', int: true, min: 0, help: 'Số vàng tài khoản mới có sẵn.' },
      gem: { label: 'Gem', unit: 'gem', int: true, min: 0 },
      mateTactics: { label: 'Chiến thuật 4 ô đồng đội', items: ['Ô 1', 'Ô 2', 'Ô 3', 'Ô 4'] } } },
  crew: { title: 'Nhân vật', blurb: 'Chỉ số từng nhân vật.', effect: 'Từ ca kế tiếp.', rowTitle: 'name',
    fields: { name: { label: 'Tên' }, hp: { label: 'Máu', int: true, min: 1 }, atk: { label: 'Sát thương', min: 0 },
      spd: { label: 'Tốc độ', min: 0 }, carry: { label: 'Sức mang', int: true }, 'skill.cd': { label: 'Hồi chiêu', unit: 'giây' } } },
  cost_guard: realLabels.window.DESIGN_LABELS.cost_guard,
  client_gate: realLabels.window.DESIGN_LABELS.client_gate,
  modes: realLabels.window.DESIGN_LABELS.modes,
  pvp_maps: realLabels.window.DESIGN_LABELS.pvp_maps,
}) + ';';

function hashDocs(docs) {
  const sortKeys = v => Array.isArray(v) ? v.map(sortKeys)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])])) : v;
  const sorted = docs.slice().sort((a, b) => (a._id < b._id ? -1 : a._id > b._id ? 1 : 0)).map(sortKeys);
  return crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

const fake = {
  tables: { quests: JSON.parse(fs.readFileSync('D:/REPO_Meta/gamespark-config/quests.json', 'utf8')),
    stage_houses: JSON.parse(JSON.stringify(DEFAULTS.stage_houses)), stage_rules: JSON.parse(JSON.stringify(DEFAULTS.stage_rules)),
    // As on DEV before fake online: pvp has neither fakeOnline nor fake.
    modes: [{ _id: 'coop', open: true }, { _id: 'pvp', open: false }, { _id: 'endless_solo', open: true }, { _id: 'endless_coop', open: false }] },
  saves: [],
  guardSaves: [],
  guardReject: null,
  month: new Date().toISOString().slice(0, 7),
  guardRows: [
    { _id: 'relay', capUsd: 50, forceClosed: false, perGiB: 0.16, freeGiBPerCcu: 3, freeGiBCap: 150, perCcu: 0.16, freeCcu: 50, overheadBytes: 40, bytesFactor: 1 },
    { _id: 'vivox', capUsd: 0, forceClosed: false, reserve: 250, freePcu: 5000, stepPcu: 5000, perStep: 2000 }],
  guardMeters: {},
  // Client gate: null = no doc on GameSpark yet. gate_save runs the proxy's own checkGateDoc (loaded below).
  gateDoc: null,
  gateSaves: [],
  gateReject: null,
  checkGate: null,
  gateOff: null,
  hubBuild: null,
  gateView() { return { ok: true, exists: !!this.gateDoc, doc: JSON.parse(JSON.stringify(this.gateDoc || this.gateOff)) }; },
  guardView() { return { ok: true, rows: this.guardRows, meters: this.guardMeters, month: this.month }; },
  view(n) { const d = this.tables[n]; return { exists: !!d, docs: d || [], hash: hashDocs(d || []) }; },
  mutate(n, fn) { fn(this.tables[n]); },
  handle(body, auth) {
    if (auth !== 'Bearer tok') return [401, { ok: false, error: { code: 'UNAUTHENTICATED', message: 'token sai' } }];
    if (body.action === 'list') {
      const tables = {}; KNOWN.forEach(n => { tables[n] = this.view(n); });
      return [200, { ok: true, project: 'repo-2d-topdown', env: 'dev', tables }];
    }
    if (body.action === 'guard') return [200, this.guardView()];
    if (body.action === 'gate') return [200, this.gateView()];
    if (body.action === 'gate_save') {
      this.gateSaves.push(body);
      const bad = this.gateReject || this.checkGate(body.doc);
      if (bad) return [400, { ok: false, error: { code: 'INVALID', message: bad } }];
      this.gateDoc = JSON.parse(JSON.stringify(body.doc));
      return [200, this.gateView()];
    }
    if (body.action === 'guard_save') {
      this.guardSaves.push(body);
      if (this.guardReject) return [400, { ok: false, error: { code: 'INVALID', message: this.guardReject } }];
      const i = this.guardRows.findIndex(r => r._id === body.doc._id);
      if (i >= 0) this.guardRows[i] = body.doc; else this.guardRows.push(body.doc);
      return [200, this.guardView()];
    }
    if (!KNOWN.includes(body.table)) return [400, { ok: false, error: { code: 'INVALID', message: 'bảng lạ' } }];
    if (body.action === 'get') return [200, Object.assign({ ok: true, table: body.table }, this.view(body.table))];
    if (body.action === 'save') {
      this.saves.push(body);
      const cur = this.view(body.table);
      if (cur.hash !== body.baseHash) {
        return [409, { ok: false, error: { code: 'CONFLICT', message: 'Bảng vừa được sửa ở nơi khác.' }, current: cur }];
      }
      const byId = {}; cur.docs.forEach(d => { byId[d._id] = hashDocs([d]); });
      const counts = { insert: 0, update: 0, delete: 0, unchanged: 0 };
      body.docs.forEach(d => { if (!(d._id in byId)) counts.insert++; else if (byId[d._id] === hashDocs([d])) counts.unchanged++; else counts.update++; });
      cur.docs.forEach(d => { if (!body.docs.some(x => x._id === d._id)) counts.delete++; });
      if (!body.dryRun) this.tables[body.table] = JSON.parse(JSON.stringify(body.docs));
      return [200, { ok: true, applied: !body.dryRun, dryRun: !!body.dryRun, changes: [], counts, hash: this.view(body.table).hash }];
    }
    return [400, { ok: false, error: { code: 'INVALID', message: 'action lạ' } }];
  },
};

let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) { pass++; out.push('  ✔ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; out.push('  ✘ ' + name + (detail ? '  — ' + detail : '')); }
}

function serve(port) {
  return new Promise(res => {
    const srv = http.createServer((req, rs) => {
      const u = decodeURIComponent(req.url.split('?')[0]);
      if (u === '/gs' && req.method === 'POST') {
        let b = ''; req.on('data', c => b += c);
        req.on('end', () => {
          const [st, j] = fake.handle(JSON.parse(b), req.headers.authorization);
          rs.writeHead(st, { 'Content-Type': 'application/json' }); rs.end(JSON.stringify(j));
        });
        return;
      }
      if (u === '/games/repo2d-unity/version.json') {
        if (fake.hubBuild == null) { rs.writeHead(404); rs.end('no'); return; }
        rs.writeHead(200, { 'Content-Type': 'application/json' }); rs.end(JSON.stringify({ build: fake.hubBuild })); return;
      }
      if (u === '/data/design-labels.js') { rs.writeHead(200, { 'Content-Type': 'text/javascript' }); rs.end(LABELS_JS); return; }
      fs.readFile(path.join(ROOT, u === '/' ? '/index.html' : u), (e, b) => {
        if (e) { rs.writeHead(404); rs.end('no'); return; }
        rs.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' }); rs.end(b);
      });
    });
    srv.listen(port, "127.0.0.1", () => res(srv));
  });
}

const K = (id, p) => `[data-k="${id}|${p}"]`;

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const core = await import(require('url').pathToFileURL(path.join(ROOT, 'supabase/functions/gs-design/core.js')).href);
  fake.checkGate = core.checkGateDoc;
  fake.gateOff = core.GATE_OFF;
  const srv = await serve(0);
  const BASE = 'http://127.0.0.1:' + srv.address().port;
  const b = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  // Fixed zone so the maintenance end time converts the same on every machine (UTC+7, no DST).
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Asia/Ho_Chi_Minh' });
  await ctx.addInitScript(() => {
    localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', email: 't@x', accessToken: 'tok',
      refreshToken: 'r', expiresAt: Date.now() + 3600e3 }));
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  let dialogNo = false;
  const dialogs = [];
  p.on('dialog', d => { dialogs.push(d.message()); return dialogNo ? d.dismiss() : d.accept(); });

  const open = async n => { await p.click(`#dz-nav [data-table="${n}"]`); await p.waitForSelector('.dz-pane__head'); };
  const txt = sel => p.$eval(sel, e => e.textContent.trim());
  const dryDone = () => p.waitForFunction(() => /GameSpark báo/.test(document.getElementById('dz-dry').textContent));
  const barGone = () => p.waitForFunction(() => /^Chưa sửa gì/.test(document.getElementById('dz-bar-count').textContent));

  await p.goto(BASE + '/design.html?api=/gs&poll=300');
  await p.waitForSelector('#dz-nav .dz-chip--live');
  const items = await p.$$eval('#dz-nav .dz-nav__item', els => els.length);
  const chipQ = await txt('#dz-nav [data-table="quests"] .dz-chip');
  const chipF = await txt('#dz-nav [data-table="foes"] .dz-chip');
  check('sidebar liệt kê 37 bảng + mục Chi phí dịch vụ + mục Phát hành & bảo trì', items === 39 &&
    (await txt('#dz-nav [data-table="cost_guard"]')) === 'Chi phí dịch vụ' &&
    (await txt('#dz-nav [data-table="client_gate"]')) === 'Phát hành & bảo trì', String(items));
  check('quests là "Trên GameSpark"', chipQ === 'Trên GameSpark', chipQ);
  check('foes là "Chưa dán · số gốc"', chipF === 'Chưa dán · số gốc', chipF);

  // 1) sửa quests daily pick 5 -> 4
  await open('quests');
  const idleBar = await p.$eval('#dz-bar', e => ({ hidden: e.hidden, txt: document.getElementById('dz-bar-count').textContent,
    dis: document.getElementById('btn-review').disabled, title: document.getElementById('btn-review').title,
    discard: document.getElementById('btn-discard').hidden }));
  check('quests chưa sửa: thanh hiện, nút lưu disabled có title, nút huỷ ẩn', !idleBar.hidden && /^Chưa sửa gì/.test(idleBar.txt) &&
    idleBar.dis && /Sửa ít nhất một ô/.test(idleBar.title) && idleBar.discard, JSON.stringify(idleBar));
  const origDocs = JSON.parse(JSON.stringify(fake.tables.quests));
  const origHash = hashDocs(origDocs);
  await p.fill(K('daily', 'pick') + ' input', '4');
  const bar = await txt('#dz-bar-count');
  const old = await txt(K('daily', 'pick') + ' .dz-cell__old');
  check('sửa pick 5→4 hiện "1 thay đổi"', bar === '1 thay đổi', bar);
  check('ô đổi hiện "trước: 5"', /^trước: 5/.test(old), old);

  // 2) hộp xem lại + dry-run
  await p.click('#btn-review');
  await dryDone();
  const chg = await txt('#dz-changes'), dry = await txt('#dz-dry');
  check('hộp xem lại nêu thay đổi bằng lời', /Số nhiệm vụ mỗi ngày: 5 nhiệm vụ → 4 nhiệm vụ/.test(chg), chg);
  check('hộp xem lại hiện số đếm dry-run của fake', /sửa 1/.test(dry) && /giữ nguyên 2/.test(dry), dry);

  // 3) lưu
  await p.click('#btn-save');
  await barGone();
  const sv = fake.saves[fake.saves.length - 1];
  const expect = JSON.parse(JSON.stringify(origDocs)); expect.find(d => d._id === 'daily').pick = 4;
  check('lưu gửi baseHash đúng và đúng các doc đã sửa', sv && !sv.dryRun && sv.baseHash === origHash &&
    JSON.stringify(sv.docs) === JSON.stringify(expect), sv ? 'baseHash ' + sv.baseHash.slice(0, 8) : '');
  check('giá trị trong fake thành 4', fake.tables.quests.find(d => d._id === 'daily').pick === 4);
  check('sau lưu: kéo lại hiện 4, hết thay đổi', (await p.inputValue(K('daily', 'pick') + ' input')) === '4');

  // 4) số lẻ ở ô nguyên
  await p.fill(K('daily', 'pick') + ' input', '3.5');
  const er = await txt(K('daily', 'pick') + ' .dz-cell__err');
  const blocked = await p.$eval('#btn-review', e => e.disabled);
  check('số lẻ trong ô nguyên bị chặn lưu', blocked && /số nguyên/.test(er), er);
  await p.fill(K('daily', 'pick') + ' input', '0');
  const er2 = await txt(K('daily', 'pick') + ' .dz-cell__err');
  check('dưới min hiện lỗi tiếng Việt', /Không được nhỏ hơn 1/.test(er2), er2);
  await p.fill(K('daily', 'pick') + ' input', '4');
  await barGone();

  // 4b) thưởng nhiệm vụ và thêm nhiệm vụ
  const qBase = JSON.parse(JSON.stringify(fake.tables.quests));
  const dl = qBase.find(d => d._id === 'daily').list;
  const iLoot = dl.findIndex(q => q.id === 'd_loot'), iRun = dl.findIndex(q => q.id === 'd_run'), nNew = dl.length;
  const Q = (i, f) => K('daily', `list.${i}.${f}`);
  check('bảng nhiệm vụ mở sẵn, ô thưởng thấy ngay', await p.isVisible(Q(iLoot, 'reward.gold') + ' input'), '');
  const heads = await p.$$eval('.dz-sub:has([data-add="daily"]) thead th', ths => ths.map(t => t.textContent).join('|'));
  check('cột bảng nhiệm vụ đúng thứ tự, không lặp', heads === '#|Mã|Mô tả|Đếm theo|Cần đạt|Thưởng vàng (vàng)|Thưởng gem|Vé|', heads);
  const fit = await p.$eval('.dz-sub:has([data-add="daily"])', e => [e.scrollWidth, e.clientWidth, [...e.querySelectorAll('thead th')].map(t => Math.round(t.getBoundingClientRect().width)).join(',')]);
  check('bảng nhiệm vụ vừa khung ở 1280 px, không phải kéo ngang', fit[0] <= fit[1], fit.join(' / '));
  check('d_loot chưa có ngọc vẫn có ô ngọc trống', (await p.inputValue(Q(iLoot, 'reward.gem') + ' input')) === '', '');
  check('dòng đã lưu không có nút Bỏ', (await p.$$('.dz-sub:has([data-add="daily"]) .dz-sub__drop')).length === 0, '');
  await p.fill(Q(iLoot, 'reward.gem') + ' input', '25');
  await p.fill(Q(iRun, 'reward.gem') + ' input', '');
  check('thêm ngọc + bỏ ngọc = 2 thay đổi', (await txt('#dz-bar-count')) === '2 thay đổi', await txt('#dz-bar-count'));
  await p.click('[data-add="daily"]');
  const newId = await p.inputValue(Q(nNew, 'id') + ' input');
  check('dòng mới có mã d_new1', newId === 'd_new1', newId);
  const textErr = await txt(Q(nNew, 'text') + ' .dz-cell__err');
  check('dòng mới thiếu mô tả: báo lỗi và chặn lưu', /Nhập chữ người chơi thấy/.test(textErr) && await p.$eval('#btn-review', e => e.disabled), textErr);
  const opts = await p.$$eval(Q(nNew, 'metric') + ' option', os => os.map(o => o.value).join(','));
  check('Đếm theo của nhiệm vụ ngày chỉ có bộ đếm ngày', opts === 'runs,loot,skills,kills,floors,pulls,revives', opts);
  await p.fill(Q(nNew, 'id') + ' input', 'd_run');
  const dup = await txt(Q(iRun, 'id') + ' .dz-cell__err');
  check('mã trùng báo lỗi ở cả dòng cũ', /Trùng/.test(dup), dup);
  await p.fill(Q(nNew, 'id') + ' input', 'd_boss');
  check('sửa mã hết trùng thì dòng cũ hết lỗi', await p.$eval(Q(iRun, 'id') + ' .dz-cell__err', e => e.hidden), '');
  await p.fill(Q(nNew, 'text') + ' input', 'Hạ 3 con quái lớn');
  await p.selectOption(Q(nNew, 'metric') + ' select', 'kills');
  await p.fill(Q(nNew, 'need') + ' input', '3');
  await p.fill(Q(nNew, 'reward.gold') + ' input', '200');
  await p.click('[data-add="daily"]');
  const drops = await p.$$('.dz-sub:has([data-add="daily"]) .dz-sub__drop');
  check('hai dòng mới thì có hai nút Bỏ', drops.length === 2, String(drops.length));
  await drops[1].click();
  check('Bỏ dòng mới thứ hai: còn một nút Bỏ, không còn lỗi',
    (await p.$$('.dz-sub:has([data-add="daily"]) .dz-sub__drop')).length === 1 && await p.$eval('#btn-review', e => !e.disabled), '');
  await p.click('#btn-review');
  await dryDone();
  const chgQ = await txt('#dz-changes');
  check('xem lại gọi tên nhiệm vụ', chgQ.includes('Giao đủ 12.000 giá trị đồ · Thưởng gem: (không có) → 25') &&
    chgQ.includes('Đi 2 ca bất kỳ · Thưởng gem: 15 → (không có)') && chgQ.includes('Hạ 3 con quái lớn · Mã: (không có) → d_boss'), chgQ);
  await p.click('#btn-save');
  await barGone();
  const savedDaily = fake.tables.quests.find(d => d._id === 'daily').list;
  check('fake: d_loot có ngọc 25, d_run hết ngọc', JSON.stringify(savedDaily[iLoot].reward) === '{"gold":900,"gem":25}' &&
    JSON.stringify(savedDaily[iRun].reward) === '{"gold":600}', JSON.stringify([savedDaily[iLoot].reward, savedDaily[iRun].reward]));
  check('fake: nhiệm vụ mới lưu đúng hình', JSON.stringify(savedDaily[nNew]) ===
    '{"id":"d_boss","text":"Hạ 3 con quái lớn","metric":"kills","need":3,"reward":{"gold":200}}' && savedDaily.length === nNew + 1,
    JSON.stringify(savedDaily[nNew]));
  check('sau lưu: dòng mới thành dòng đã lưu, hết nút Bỏ', (await p.$$('.dz-sub:has([data-add="daily"]) .dz-sub__drop')).length === 0, '');
  await p.screenshot({ path: SHOTS + '/quests-add.png', fullPage: true });

  // 5) phần trăm
  await open('gacha_banners');
  const shown = await p.inputValue(K('char', 'rate5') + ' input');
  check('trường pct hiện phần trăm (0.006 → 0.6)', shown === '0.6', shown);
  await p.fill(K('char', 'rate5') + ' input', '1.5');
  await p.click('#btn-review');
  await dryDone();
  await p.click('#btn-save');
  await barGone();
  const stored = fake.tables.gacha_banners && fake.tables.gacha_banners.find(d => d._id === 'char').rate5;
  check('pct lưu thành phân số (1.5% → 0.015)', stored === 0.015, String(stored));

  // 6) tạo bảng chưa dán, không sửa gì
  await open('foes');
  const label = await txt('#btn-review');
  check('bảng chưa dán, 0 sửa: nút ghi "Tạo bảng trên GameSpark"', label === 'Tạo bảng trên GameSpark', label);
  await p.click('#btn-review');
  await dryDone();
  await p.click('#btn-save');
  await p.waitForSelector('#dz-nav [data-table="foes"] .dz-chip--live');
  check('bảng được tạo trong fake với số gốc', JSON.stringify(fake.tables.foes) === JSON.stringify(DEFAULTS.foes), (fake.tables.foes || []).length + ' dòng');

  // ảnh chụp
  await open('wallet_start');
  await p.fill(K('default', 'gold') + ' input', '2500');
  await p.waitForTimeout(150);
  await p.screenshot({ path: SHOTS + '/settings.png' });
  await p.click('#btn-discard');
  await open('crew');
  await p.fill(K('bao', 'hp') + ' input', '110');
  await p.click('.dz-row[data-id="bao"] .dz-more');
  await p.waitForTimeout(150);
  await p.screenshot({ path: SHOTS + '/list.png' });
  await p.click('#btn-discard');
  await p.setViewportSize({ width: 390, height: 800 });
  await p.selectOption('#dz-select', 'quests');
  await p.waitForSelector('.dz-pane__head');
  await p.click('.dz-row[data-id="daily"] .dz-more');
  await p.screenshot({ path: SHOTS + '/mobile.png' });
  await p.setViewportSize({ width: 1280, height: 900 });

  // 7) xung đột: fake đổi khi người dùng đang có sửa
  await open('quests');
  await p.fill(K('daily', 'pick') + ' input', '2');
  fake.mutate('quests', d => { d.find(x => x._id === 'daily').pick = 9; });
  await p.waitForSelector('#dz-conflict:not([hidden])', { timeout: 5000 }).catch(() => {});
  const cv = await p.$eval('#dz-conflict', e => !e.hidden).catch(() => false);
  const keep = await p.inputValue(K('daily', 'pick') + ' input');
  check('fake đổi khi đang có sửa: hiện banner xung đột', cv);
  check('bản nháp của người dùng được giữ', keep === '2', keep);
  await p.click('#btn-reload');
  await p.waitForFunction(sel => document.querySelector(sel + ' input').value === '9', K('daily', 'pick'), { timeout: 5000 }).catch(() => {});
  check('"Tải bản mới" bỏ sửa và hiện 9', (await p.inputValue(K('daily', 'pick') + ' input')) === '9');

  // 8) fake đổi khi không có sửa: tự làm mới
  fake.mutate('quests', d => { d.find(x => x._id === 'daily').pick = 7; });
  await p.waitForFunction(sel => document.querySelector(sel + ' input').value === '7', K('daily', 'pick'), { timeout: 5000 }).catch(() => {});
  check('fake đổi khi không có sửa: giá trị tự cập nhật thành 7', (await p.inputValue(K('daily', 'pick') + ' input')) === '7');
  const tt = await p.$$eval('.dz-toast', els => els.map(e => e.textContent).join('|'));
  check('có toast "Bảng vừa được cập nhật"', /Bảng vừa được cập nhật/.test(tt), tt);

  // 9) bảng chia phần: stage_houses
  await open('stage_houses');
  const secTitles = await p.$$eval('.dz-section__title', els => els.map(e => e.textContent));
  check('stage_houses có đúng 3 phần (không có "Khác")', secTitles.length === 3 && /^Phòng và hành lang/.test(secTitles[0]) &&
    /^Độ khó/.test(secTitles[1]) && /^Theme/.test(secTitles[2]), secTitles.join(' | '));
  const layoutCols = await p.$$eval('.dz-section:nth-of-type(1) [data-k^="5|"]', els => els.filter(e => e.offsetParent).map(e => e.getAttribute('data-k').split('|')[1]));
  check('5 số phòng/hành lang nằm ngay trên lưới, không phải mở Chi tiết',
    ['extractRooms', 'privateRooms', 'sharedRooms', 'shortCorridors', 'longCorridors'].every(k => layoutCols.includes(k)), layoutCols.join(','));
  const posRows = await p.$$eval('.dz-section:nth-of-type(1) .dz-row .dz-row__title', els => els.map(e => e.textContent));
  check('lưới vị trí đọc "Nhà 1".."Nhà 5"', posRows.join(',') === 'Nhà 1,Nhà 2,Nhà 3,Nhà 4,Nhà 5', posRows.join(','));
  const themeRow = await txt('.dz-section:nth-of-type(3) .dz-row .dz-row__title');
  check('lưới theme: dòng đầu là tên theme', themeRow === DEFAULTS.stage_houses[0].name, themeRow);
  const noteOn = await txt('.dz-section:nth-of-type(3) .dz-section__note');
  check('ghi chú theme khi shuffleThemes bật', noteOn === 'NOTE-BẬT', noteOn);
  await p.fill(K('5', 'extractRooms') + ' input', '7');
  const oldX = await txt(K('5', 'extractRooms') + ' .dz-cell__old');
  const rowFlags = await p.$$eval('.dz-section .dz-row.is-changed', els => els.map(e => e.closest('.dz-section').querySelector('.dz-section__title').textContent.slice(0, 4)));
  check('"trước:" hiện ở ô đã sửa, chỉ phần vị trí được đánh dấu đổi', /^trước: 3/.test(oldX) && rowFlags.join() === 'Phòn', oldX + ' / ' + rowFlags.join());
  await p.click('#btn-review');
  await dryDone();
  const chg2 = await txt('#dz-changes');
  check('hộp xem lại: dòng bắt đầu bằng "Nhà 5"', /^Nhà 5 · Số phòng extract: 3 → 7/.test(chg2), chg2);
  await p.click('#btn-back');
  await p.click('#btn-discard');
  await p.fill('.dz-section:nth-of-type(3) ' + K('2', 'name') + ' input', 'Kim tự tháp mới');
  await p.click('#btn-review');
  await dryDone();
  const chg3 = await txt('#dz-changes');
  check('hộp xem lại: đổi trong phần theme gọi bằng tên theme', /^Kim tự tháp mới · Tên nhà/.test(chg3), chg3);
  await p.click('#btn-back');
  await p.click('#btn-discard');
  fake.mutate('stage_rules', d => { d[0].shuffleThemes = false; });
  await p.evaluate(() => window.dispatchEvent(new Event('focus')));
  await p.waitForTimeout(600);
  await open('quests');
  await open('stage_houses');
  const noteOff = await txt('.dz-section:nth-of-type(3) .dz-section__note');
  check('ghi chú theme đổi khi shuffleThemes tắt', noteOff === 'NOTE-TẮT', noteOff);
  await p.screenshot({ path: SHOTS + '/houses-split.png', fullPage: true });

  // 4) tab Chi phí dịch vụ
  fake.guardMeters[fake.month] = {
    _id: fake.month, at: Date.now(),
    relay: { bytes: 5 * 1073741824, minutes: 864000, peak: 12, costUsd: 12.5 }, vivox: { peak: 5100, costUsd: 2000 },
    live: { relay: 4, vivox: 5100 },
    gate: { relay: { open: true, why: null }, vivox: { open: false, why: 'cap' } } };
  await open('cost_guard');
  await p.waitForSelector('#guard-relay');
  check('nút lưu của bảng khác ẩn khi ở tab chi phí', await p.$eval('#dz-bar', e => e.hidden), '');
  const cards = await p.$$eval('.dz-guard', els => els.length);
  const relayCost = await txt('#guard-relay [data-role="cost"]');
  const relayStatus = await txt('#guard-relay [data-role="status"]');
  const vivoxStatus = await txt('#guard-vivox [data-role="status"]');
  const relayStats = await txt('#guard-relay .dz-stats');
  check('hai thẻ relay và vivox', cards === 2, String(cards));
  check('relay: ≈ $12.5 / ngưỡng $50, Mở', relayCost === '≈ $12.5 / ngưỡng $50' && relayStatus === 'Mở', relayCost + ' / ' + relayStatus);
  check('relay hiện GiB, đang dùng, cao nhất', relayStats.includes('Đang dùng4') && relayStats.includes('Cao nhất tháng12') && relayStats.includes('CCU trung bình tháng20') && relayStats.includes('Đã dùng (GiB)5'), relayStats);
  check('vivox: Đóng (chạm ngưỡng)', vivoxStatus === 'Đóng (chạm ngưỡng)', vivoxStatus);
  check('số đo mới: không có ghi chú cũ', (await p.$$('#guard-relay [data-role="stale"]')).length === 0, '');
  check('ghi chú "Đóng khi ước tính vượt ngưỡng"', /^Đóng khi ước tính vượt ngưỡng/.test(await txt('#guard-note')), '');
  check('giá đơn vị thu gọn mặc định', await p.$eval('#guard-relay .dz-guard__prices', e => !e.open), '');

  // số đo cũ hơn 5 phút -> ghi chú; thiếu hẳn -> "chưa có số đo"
  fake.guardMeters[fake.month].at = Date.now() - 10 * 60e3;
  await open('quests'); await open('cost_guard');
  await p.waitForSelector('#guard-relay [data-role="stale"]');
  check('số đo cũ > 5 phút hiện ghi chú đứng', /chưa có người dùng gần đây hoặc bộ đếm đứng/.test(await txt('#guard-relay [data-role="stale"]')), '');
  const savedMeters = fake.guardMeters; fake.guardMeters = {};
  await open('quests'); await open('cost_guard');
  await p.waitForSelector('#guard-relay [data-role="nometer"]');
  check('thiếu doc tháng: "Chưa có số đo tháng này"', /^Chưa có số đo tháng này/.test(await txt('#guard-relay [data-role="nometer"]')), '');
  fake.guardMeters = savedMeters;
  await open('quests'); await open('cost_guard');
  await p.waitForSelector('#guard-relay [data-role="cost"]');

  // lưu ngưỡng relay 50 -> 80
  await p.fill('#guard-relay-capUsd', '80');
  await p.click('#guard-relay-save');
  await p.waitForFunction(() => document.querySelector('#guard-relay [data-role="cost"]').textContent.includes('ngưỡng $80'));
  const sent = fake.guardSaves[fake.guardSaves.length - 1];
  check('lưu ngưỡng: gửi guard_save đủ trường, capUsd 80',
    sent.action === 'guard_save' && sent.doc._id === 'relay' && sent.doc.capUsd === 80 && sent.doc.forceClosed === false &&
    sent.doc.perGiB === 0.16 && Object.keys(sent.doc).length === 10 && !("reserve" in sent.doc), JSON.stringify(sent.doc));
  check('fake đã ghi capUsd 80', fake.guardRows.find(r => r._id === 'relay').capUsd === 80, '');

  // đóng tay vivox
  await p.click('#guard-vivox .dz-switch');
  await p.click('#guard-vivox-save');
  await p.waitForTimeout(300);
  
  check('đóng tay vivox được gửi', fake.guardRows.find(r => r._id === 'vivox').forceClosed === true, '');

  // số sai: chặn ở máy khách, không gọi API
  const before = fake.guardSaves.length;
  await p.fill('#guard-relay-capUsd', '-5');
  const clientErr = await txt('#guard-relay-err');
  check('số âm bị chặn ở máy khách, nút lưu tắt', clientErr.startsWith('Ngưỡng đóng (USD / tháng): nhập một số từ 0 trở lên') &&
    await p.$eval('#guard-relay-save', e => e.disabled) && fake.guardSaves.length === before, clientErr);
  await p.fill('#guard-relay-capUsd', '80');

  // máy chủ trả 400: hiện đúng thông báo
  fake.guardReject = 'capUsd của "relay" là 1e999, phải là số từ 0 trở lên.';
  await p.fill('#guard-relay-capUsd', '90');
  await p.click('#guard-relay-save');
  await p.waitForFunction(() => !document.getElementById('guard-relay-err').hidden);
  const serverErr = await txt('#guard-relay-err');
  check('400 từ máy chủ hiện thông báo nguyên văn', serverErr === 'Dữ liệu không hợp lệ (INVALID): ' + fake.guardReject, serverErr);
  check('sau 400 nút lưu bật lại', await p.$eval('#guard-relay-save', e => !e.disabled), '');
  fake.guardReject = null;
  // The browser logs the deliberate 400 above; drop only that line.
  for (let i = errs.length - 1; i >= 0; i--) if (/status of 400/.test(errs[i])) errs.splice(i, 1);
  await p.screenshot({ path: SHOTS + '/cost-guard.png', fullPage: true });

  // 10) tab Phát hành & bảo trì (cd_client_gate)
  const GL = realLabels.window.DESIGN_LABELS.client_gate;
  await open('client_gate');
  await p.waitForSelector('#gate-maint-card');
  await p.waitForFunction(() => /chưa có/.test(document.getElementById('gate-hub-build').textContent));
  const g0 = await p.evaluate(() => ({
    bar: document.getElementById('dz-bar').hidden,
    missing: !document.getElementById('gate-missing').hidden,
    onNote: !document.getElementById('gate-on-note').hidden,
    pill: document.querySelector('#gate-maint-card [data-role="status"]').textContent,
    sw: document.getElementById('gate-maint').checked,
    mins: ['webgl', 'android', 'ios'].map(k => document.getElementById('gate-min-' + k).value).join(','),
    hub: document.getElementById('gate-hub-build').textContent,
    label: document.querySelector('label[for="gate-min-webgl"]').textContent }));
  check('chưa có doc: hiện số tắt cổng, ghi chú "chưa có dòng điều khiển", nút lưu chung ẩn',
    g0.bar && g0.missing && !g0.onNote && g0.pill === 'Mở' && !g0.sw && g0.mins === '0,0,0', JSON.stringify(g0));
  check('bản web trên hub: "chưa có", bỏ qua kiểm tra', g0.hub === 'Bản web trên hub: chưa có (bỏ qua kiểm tra)', g0.hub);
  check('nhãn bản tối thiểu nói bằng lời', /Bản thấp hơn số này không vào được game/.test(await txt('#gate-build-card .dz-guard__note')), g0.label);
  const fitGate = async () => p.evaluate(() => {
    const d = document.documentElement, pane = document.getElementById('dz-pane');
    const wide = [...pane.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > pane.getBoundingClientRect().right + 1).map(e => e.id || e.className);
    return { ok: d.scrollWidth <= d.clientWidth && pane.scrollWidth <= pane.clientWidth && !wide.length, info: [d.scrollWidth, d.clientWidth, pane.scrollWidth, pane.clientWidth].join('/') + ' ' + wide.slice(0, 3).join(',') };
  });
  const fit1280 = await fitGate();
  check('tab bảo trì vừa khung ở 1280 px, không kéo ngang', fit1280.ok, fit1280.info);

  // bật bảo trì: bấm Huỷ ở hộp hỏi thì không lưu gì
  dialogNo = true;
  await p.click('#gate-maint');
  dialogNo = false;
  check('bật bảo trì hỏi lại; Huỷ thì không gửi, công tắc về Tắt',
    dialogs[dialogs.length - 1] === GL.confirmOn && fake.gateSaves.length === 0 && !(await p.$eval('#gate-maint', e => e.checked)), dialogs[dialogs.length - 1]);

  // gõ lời nhắn + giờ (giờ máy UTC+7) rồi bật: lưu ngay cả doc
  const MSG = 'Bảo trì máy chủ, quay lại sau 30 phút.';
  await p.fill('#gate-msg', MSG);
  await p.fill('#gate-until', '2026-10-20T08:30');
  const utcTxt = await txt('#gate-until-utc');
  check('giờ máy 08:30 (UTC+7) hiện "Lưu là 2026-10-20 01:30 UTC"', utcTxt === 'Lưu là 2026-10-20 01:30 UTC', utcTxt);
  check('đếm ký tự lời nhắn', (await txt('#gate-msg-count')) === MSG.length + '/300 ký tự', await txt('#gate-msg-count'));
  await p.click('#gate-maint');
  await p.waitForFunction(() => document.querySelector('#gate-maint-card [data-role="status"]').textContent === 'Đang bảo trì');
  const sOn = fake.gateSaves[fake.gateSaves.length - 1];
  const wantOn = { _id: 'default', maintenance: { on: true, message: MSG, until: '2026-10-20T01:30:00Z' },
    minBuild: { webgl: 0, android: 0, ios: 0 }, storeUrls: { android: '', ios: '' } };
  check('bật bảo trì: gửi gate_save cả doc, until là UTC', fake.gateSaves.length === 1 && sOn.action === 'gate_save' &&
    JSON.stringify(sOn.doc) === JSON.stringify(wantOn), JSON.stringify(sOn.doc));
  check('sau khi bật: ghi chú đang bảo trì hiện, ghi chú chưa có doc ẩn', await p.$eval('#gate-on-note', e => !e.hidden) &&
    await p.$eval('#gate-missing', e => e.hidden) && fake.gateDoc.maintenance.on === true, '');

  // tắt: không hỏi, lưu ngay, giữ lời nhắn
  const dlgBefore = dialogs.length;
  await p.click('#gate-maint');
  await p.waitForFunction(() => document.querySelector('#gate-maint-card [data-role="status"]').textContent === 'Mở');
  check('tắt bảo trì không hỏi, lưu ngay, giữ lời nhắn', dialogs.length === dlgBefore && fake.gateSaves.length === 2 &&
    fake.gateDoc.maintenance.on === false && fake.gateDoc.maintenance.message === MSG && await p.$eval('#gate-on-note', e => e.hidden), '');

  // bản tối thiểu: số sai và link sai chặn ở máy khách, không gọi API
  const nBefore = fake.gateSaves.length;
  await p.fill('#gate-min-android', '12.5');
  const eNum = await txt('#gate-build-err');
  check('bản tối thiểu số lẻ: báo lỗi, nút lưu tắt, không gọi API', eNum === 'Android: nhập số nguyên từ 0 đến 1000000000.' &&
    await p.$eval('#gate-build-save', e => e.disabled) && fake.gateSaves.length === nBefore, eNum);
  await p.fill('#gate-min-android', '120');
  await p.fill('#gate-store-android', 'http://play.google.com/store/apps/details?id=vn.hlo.repo2d');
  const eUrl = await txt('#gate-build-err');
  check('link http (không https) bị chặn', eUrl === 'Link Google Play: để trống hoặc dán link bắt đầu bằng https://.' &&
    await p.$eval('#gate-build-save', e => e.disabled), eUrl);
  const STORE = 'https://play.google.com/store/apps/details?id=vn.hlo.repo2d';
  await p.fill('#gate-store-android', STORE);
  check('sửa đúng thì hết lỗi, nút lưu bật', await p.$eval('#gate-build-err', e => e.hidden) && await p.$eval('#gate-build-save', e => !e.disabled), '');
  await p.click('#gate-build-save');
  await p.waitForFunction(() => /Đã lưu bản tối thiểu/.test([...document.querySelectorAll('.dz-toast')].map(e => e.textContent).join('|')));
  const sB = fake.gateSaves[fake.gateSaves.length - 1];
  check('lưu bản tối thiểu: android 120 + link, phần bảo trì lấy bản đã lưu', sB.doc.minBuild.android === 120 && sB.doc.minBuild.webgl === 0 &&
    sB.doc.storeUrls.android === STORE && sB.doc.maintenance.on === false && sB.doc.maintenance.message === MSG, JSON.stringify(sB.doc));

  // máy chủ trả 400: hiện nguyên văn, nút lưu bật lại
  fake.gateReject = 'Bản tối thiểu ios là 7, thử lỗi máy chủ.';
  await p.fill('#gate-min-ios', '7');
  await p.click('#gate-build-save');
  await p.waitForFunction(() => /INVALID/.test(document.getElementById('gate-build-err').textContent));
  check('400 từ máy chủ hiện nguyên văn ở thẻ bản tối thiểu', (await txt('#gate-build-err')) === 'Dữ liệu không hợp lệ (INVALID): ' + fake.gateReject &&
    await p.$eval('#gate-build-save', e => !e.disabled) && fake.gateDoc.minBuild.ios === 0, await txt('#gate-build-err'));
  fake.gateReject = null;
  for (let i = errs.length - 1; i >= 0; i--) if (/status of 400/.test(errs[i])) errs.splice(i, 1);
  await p.fill('#gate-min-ios', '0');

  // có version.json trên hub: chặn bản web tối thiểu lớn hơn bản đang có
  fake.hubBuild = 1234;
  await open('quests'); await open('client_gate');
  await p.waitForFunction(() => /1234/.test(document.getElementById('gate-hub-build').textContent));
  await p.fill('#gate-min-webgl', '1300');
  const eHub = await txt('#gate-build-err');
  check('bản web tối thiểu > bản trên hub (1234): chặn với lời rõ', eHub.startsWith('Web: bản tối thiểu 1300 lớn hơn bản web đang có trên hub (1234)') &&
    await p.$eval('#gate-build-save', e => e.disabled), eHub);
  await p.fill('#gate-min-webgl', '1234');
  await p.click('#gate-build-save');
  for (let i = 0; i < 60 && fake.gateDoc.minBuild.webgl !== 1234; i++) await p.waitForTimeout(50);
  check('bản web tối thiểu bằng bản trên hub thì lưu được', fake.gateDoc.minBuild.webgl === 1234, String(fake.gateDoc.minBuild.webgl));
  await p.screenshot({ path: SHOTS + '/client-gate.png', fullPage: true });
  await p.setViewportSize({ width: 390, height: 800 });
  await p.waitForTimeout(150);
  const fit390 = await fitGate();
  check('tab bảo trì không kéo ngang ở 390 px', fit390.ok, fit390.info);
  await p.screenshot({ path: SHOTS + '/client-gate-mobile.png', fullPage: true });
  await p.setViewportSize({ width: 1280, height: 900 });
  // 11) Bật / tắt chế độ chơi: giả online dưới dòng pvp. DEV chưa có trường nào: hiện số seed, sửa lần đầu ghi cả khối fake.
  const seedFake = DEFAULTS.modes.find(d => d._id === 'pvp').fake;
  const F = k => K('pvp', 'fake.' + k);
  await open('modes');
  await p.waitForSelector('#reach-online:not([disabled])');
  const modeHeads = await p.$$eval('.dz-grid > thead th', ths => ths.map(t => t.textContent).join('|'));
  check('lưới chế độ chỉ có cột Mở, công tắc phụ nằm ở dòng dưới', modeHeads === 'Dòng|Mở cho người chơi|', modeHeads);
  const sw = await p.$eval(K('pvp', 'fakeOnline') + ' input', e => ({ type: e.type, checked: e.checked, row: e.closest('tr').getAttribute('data-fake') }));
  check('dòng dưới pvp có công tắc Giả online, thiếu trường = tắt', sw.type === 'checkbox' && !sw.checked && sw.row === 'pvp', JSON.stringify(sw));
  const fakeCells = await p.$$eval('[data-fake="pvp"] [data-k^="pvp|fake."]', els => els.map(e => e.getAttribute('data-k').slice(9)));
  check('đủ ô màn tìm trận giả theo thứ tự seed', fakeCells.join() === Object.keys(seedFake).join(), fakeCells.join());
  check('thiếu khối fake: ô hiện số seed', (await p.inputValue(F('queueMin') + ' input')) === String(seedFake.queueMin) &&
    (await p.inputValue(F('pingMax') + ' input')) === String(seedFake.pingMax), '');
  check('Tên bot giả là hộp nhiều dòng chứa danh sách seed', await p.$eval(F('names') + ' textarea', (e, v) => e.value === v, seedFake.names), '');
  check('chưa sửa gì: thanh lưu sạch', /^Chưa sửa gì/.test(await txt('#dz-bar-count')), await txt('#dz-bar-count'));
  await p.click(K('pvp', 'fakeOnline') + ' input');
  check('bật Giả online = 1 thay đổi', (await txt('#dz-bar-count')) === '1 thay đổi', await txt('#dz-bar-count'));
  await p.fill(F('queueMin') + ' input', '5');
  check('sửa ô fake đầu tiên ghi cả khối: 1 + ' + Object.keys(seedFake).length + ' thay đổi',
    (await txt('#dz-bar-count')) === (1 + Object.keys(seedFake).length) + ' thay đổi', await txt('#dz-bar-count'));
  const oldQ = await txt(F('queueMin') + ' .dz-cell__old');
  check('ô đã sửa đánh dấu đổi, "trước: (không có)", dòng pvp đánh dấu đổi', oldQ === 'trước: (không có)' &&
    await p.$eval(F('queueMin'), e => e.classList.contains('is-changed')) &&
    await p.$eval('.dz-row[data-id="pvp"]', e => e.classList.contains('is-changed')), oldQ);
  await p.fill(F('countdown') + ' input', '2.5');
  const cdErr = await txt(F('countdown') + ' .dz-cell__err');
  check('đếm ngược số lẻ: lỗi số nguyên, chặn lưu', /số nguyên/.test(cdErr) && await p.$eval('#btn-review', e => e.disabled), cdErr);
  await p.fill(F('countdown') + ' input', '11');
  const cdErr2 = await txt(F('countdown') + ' .dz-cell__err');
  check('đếm ngược 11: lỗi trần 10', /Không được lớn hơn 10/.test(cdErr2), cdErr2);
  await p.fill(F('countdown') + ' input', '4');
  await p.fill(F('names') + ' textarea', 'An, Bình, Chi');
  await p.focus(F('pingMax') + ' input');
  await p.waitForTimeout(1000);
  check('poll (300 ms) không vẽ lại khung: ô đang gõ giữ focus',
    await p.evaluate(sel => document.activeElement === document.querySelector(sel + ' input'), F('pingMax')), '');
  const fitM = await p.evaluate(() => {
    const w = document.querySelector('#dz-pane .dz-grid__wrap');
    return [document.documentElement.scrollWidth, document.documentElement.clientWidth, w.scrollWidth, w.clientWidth];
  });
  check('chế độ chơi không cuộn ngang ở 1280 px (trang và lưới)', fitM[0] <= fitM[1] && fitM[2] <= fitM[3], fitM.join(' / '));
  await p.setViewportSize({ width: 390, height: 800 });
  const fitS = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  check('chế độ chơi không cuộn ngang ở 390 px', fitS[0] <= fitS[1], fitS.join(' / '));
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.click('#btn-review');
  await dryDone();
  const chgM = await txt('#dz-changes');
  check('xem lại gọi tên dòng và ô', chgM.includes('Đấu đội 5v5 · Giả online (1 người + 9 bot): (không có) → Bật') &&
    chgM.includes('Đấu đội 5v5 · Đủ người sớm nhất: (không có) → 5 giây'), chgM.slice(0, 160));
  await p.click('#btn-save');
  await barGone();
  const savedPvp = fake.tables.modes.find(d => d._id === 'pvp');
  check('fake: pvp lưu fakeOnline true và đủ khối fake đã sửa', savedPvp.fakeOnline === true &&
    JSON.stringify(savedPvp.fake) === JSON.stringify(Object.assign({}, seedFake, { queueMin: 5, countdown: 4, names: 'An, Bình, Chi' })),
    JSON.stringify(savedPvp).slice(0, 160));
  check('sau lưu công tắc Giả online bật', await p.$eval(K('pvp', 'fakeOnline') + ' input', e => e.checked), '');
  await p.waitForFunction(() => !document.querySelector('.dz-toast'), null, { timeout: 8000 }).catch(() => {});
  await p.screenshot({ path: SHOTS + '/modes-pvp-fake.png', fullPage: true });
  await p.fill(F('pingMax') + ' input', '200');
  check('khối fake đã có: sửa một ô = 1 thay đổi', (await txt('#dz-bar-count')) === '1 thay đổi', await txt('#dz-bar-count'));
  await p.click('#btn-discard');
  // 12) Bảng xếp hạng cuối trận dưới dòng pvp: doc chưa có khối score hiện số seed, sửa lần đầu ghi cả khối.
  const seedScore = DEFAULTS.modes.find(d => d._id === 'pvp').score;
  const S = k => K('pvp', 'score.' + k);
  const scoreCells = await p.$$eval('[data-fake="pvp"] [data-k^="pvp|score."]', els => els.map(e => e.getAttribute('data-k').slice(10)));
  check('khung Bảng xếp hạng cuối trận đủ ô theo thứ tự seed', scoreCells.join() === Object.keys(seedScore).join(), scoreCells.join());
  check('thiếu khối score: ô hiện số seed', (await p.inputValue(S('money') + ' input')) === String(seedScore.money) &&
    (await p.inputValue(S('assistWindow') + ' input')) === String(seedScore.assistWindow), '');
  check('chưa sửa score: thanh lưu sạch', /^Chưa sửa gì/.test(await txt('#dz-bar-count')), await txt('#dz-bar-count'));
  await p.fill(S('kill') + ' input', '4');
  check('sửa ô score đầu tiên ghi cả khối: ' + Object.keys(seedScore).length + ' thay đổi',
    (await txt('#dz-bar-count')) === Object.keys(seedScore).length + ' thay đổi', await txt('#dz-bar-count'));
  await p.fill(S('death') + ' input', '-1');
  check('điểm trừ âm: lỗi, chặn lưu', /nhỏ hơn 0/.test(await txt(S('death') + ' .dz-cell__err')) && await p.$eval('#btn-review', e => e.disabled), '');
  await p.fill(S('death') + ' input', '2');
  await p.click('#btn-review');
  await dryDone();
  await p.click('#btn-save');
  await barGone();
  const savedScore = fake.tables.modes.find(d => d._id === 'pvp').score;
  check('score: pvp lưu đủ khối với ô đã sửa', JSON.stringify(savedScore) === JSON.stringify(Object.assign({}, seedScore, { kill: 4, death: 2 })),
    JSON.stringify(savedScore));

  // 13) Số bot và đấu trường dưới dòng pvp: thiếu khối thì hiện số seed, sửa lần đầu ghi cả khối.
  const seedBots = DEFAULTS.modes.find(d => d._id === 'pvp').bots, seedArena = DEFAULTS.modes.find(d => d._id === 'pvp').arena;
  const B = k => K('pvp', 'bots.' + k), A = k => K('pvp', 'arena.' + k);
  const flat = (o, pre) => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object') ? flat(v, pre + k + '.') : [pre + k]);
  const botCells = await p.$$eval('[data-fake="pvp"] [data-k^="pvp|bots."]', els => els.map(e => e.getAttribute('data-k').slice(9)));
  check('khung Bot đấu đội đủ ô theo thứ tự seed (cả traits, redropCooldown)', botCells.join() === flat(seedBots, '').join() && botCells.length >= 40, botCells.length + ' ô');
  const arenaCells = await p.$$eval('[data-fake="pvp"] [data-k^="pvp|arena."]', els => els.map(e => e.getAttribute('data-k').slice(10)));
  check('khung Đấu trường đủ 3 ô', arenaCells.join() === Object.keys(seedArena).join(), arenaCells.join());
  const rawLabels = await p.evaluate(() => [...document.querySelectorAll('[data-fake="pvp"] [data-k^="pvp|bots."], [data-fake="pvp"] [data-k^="pvp|arena."]')]
    .map(c => c.closest('.dz-fld')).filter(Boolean).map(f => (f.querySelector('.dz-fld__label') || {}).textContent).filter(t => /^[a-z][A-Za-z]*$/.test(t || '')));
  check('mọi ô bot / đấu trường có nhãn tiếng Việt, không lộ tên trường', rawLabels.length === 0, rawLabels.join());
  check('thiếu khối bots: ô hiện số seed', (await p.inputValue(B('swingArc') + ' input')) === String(seedBots.swingArc) &&
    (await p.inputValue(B('redropCooldown.pad') + ' input')) === String(seedBots.redropCooldown.pad) &&
    (await p.inputValue(A('lootCount') + ' input')) === String(seedArena.lootCount), '');
  check('chưa sửa bots: thanh lưu sạch', /^Chưa sửa gì/.test(await txt('#dz-bar-count')), await txt('#dz-bar-count'));
  await p.fill(B('swingArc') + ' input', '25');
  check('sửa ô bots đầu tiên ghi cả khối: ' + flat(seedBots, '').length + ' thay đổi', (await txt('#dz-bar-count')) === flat(seedBots, '').length + ' thay đổi', await txt('#dz-bar-count'));
  await p.fill(B('swingArc') + ' input', '181');
  check('swingArc 181: lỗi trần 180, chặn lưu', /Không được lớn hơn 180/.test(await txt(B('swingArc') + ' .dz-cell__err')) && await p.$eval('#btn-review', e => e.disabled), '');
  await p.fill(B('guards') + ' input', '1.5');
  check('guards lẻ: lỗi số nguyên', /số nguyên/.test(await txt(B('guards') + ' .dz-cell__err')), '');
  await p.fill(B('swingArc') + ' input', '25');
  await p.fill(B('guards') + ' input', '2');
  await p.fill(A('lootCount') + ' input', '20');
  await p.click('#btn-review');
  await dryDone();
  await p.click('#btn-save');
  await barGone();
  const savedBots = fake.tables.modes.find(d => d._id === 'pvp');
  check('bots + arena: pvp lưu đủ hai khối với ô đã sửa', JSON.stringify(savedBots.bots) === JSON.stringify(Object.assign({}, seedBots, { swingArc: 25, guards: 2 })) &&
    JSON.stringify(savedBots.arena) === JSON.stringify(Object.assign({}, seedArena, { lootCount: 20 })), JSON.stringify(savedBots.bots).slice(0, 100));
  // 14) Bố cục đấu trường: bảng chưa dán nên hiện số gốc; rows và legend chỉ xem (khối chữ đơn cách), open sửa được.
  await open('pvp_maps');
  const navMaps = await txt('#dz-nav [data-table="pvp_maps"]');
  check('pvp_maps có trong thanh bên với tên tiếng Việt', navMaps.startsWith('Bố cục đấu trường 5v5'), navMaps);
  const mapRows = await p.$$eval('.dz-row', trs => trs.map(t => t.getAttribute('data-id') + ':' + t.querySelector('.dz-row__title').textContent).join());
  check('4 bố cục, tên tiếng Việt', mapRows === 'nga_tu:Ngã tư,phao_dai:Pháo đài,ban_co:Bàn cờ,classic:Cổ điển', mapRows);
  await p.click('.dz-row[data-id="nga_tu"] .dz-more');
  const seedMaps = DEFAULTS.pvp_maps;
  const pre = await p.$eval('pre[data-readonly="rows"]', e => ({ n: e.textContent.split('\n').length, w: e.textContent.split('\n')[0].length, ff: getComputedStyle(e).fontFamily }));
  check('rows là khối chữ đơn cách chỉ xem: ' + seedMaps[0].rows.length + ' hàng x ' + seedMaps[0].rows[0].length + ' cột',
    pre.n === seedMaps[0].rows.length && pre.w === seedMaps[0].rows[0].length && /mono|Consolas|Courier/i.test(pre.ff), JSON.stringify(pre));
  check('legend cũng chỉ xem, rows / legend không có ô nhập', await p.$$eval('pre[data-readonly="legend"]', e => e.length) > 0 &&
    await p.$$eval('[data-k*="|rows"], [data-k*="|legend"]', e => e.length) === 0, '');
  await p.click('.dz-row[data-id="classic"] input.dz-switch');
  check('bật / tắt bố cục = 1 thay đổi', (await txt('#dz-bar-count')) === '1 thay đổi', await txt('#dz-bar-count'));
  await p.click('#btn-discard');

  const e = errs.filter(x => !/favicon|404/.test(x));
  check('không lỗi console', e.length === 0, e.slice(0, 2).join(' | '));

  await b.close();
  srv.close();
  console.log(out.join('\n'));
  console.log('\n' + '═'.repeat(52));
  console.log('  ' + (fail ? 'FAIL' : 'PASS') + '   ĐẠT ' + pass + '   HỎNG ' + fail);
  console.log('═'.repeat(52));
  process.exit(fail ? 1 : 0);
})();
