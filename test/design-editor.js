/*
 * Bộ kiểm cho trang sửa thông số game (design.html).
 * Chạy qua HTTP thật, với một proxy GIẢ trong tiến trình thực hiện đúng hợp đồng
 * list/get/save trên các bảng nằm trong bộ nhớ (chỉ quests có sẵn, 29 bảng còn lại "chưa dán").
 * Nhãn (data/design-labels.js) được thay bằng bản cố định ở dưới để phép đo không đổi theo file nhãn thật.
 */
const PW = 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = 'C:/Users/tamph/AppData/Local/Temp/claude/D--REPO-Meta/e97f08e7-4c36-4a2b-a58d-a5dc29bf4f23/scratchpad/shots';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const KNOWN = ['wallet_start', 'crew', 'tactics', 'upgrade', 'passives', 'gacha_banners', 'gacha_rules', 'shop_packs',
  'shop_rules', 'shop_exchange', 'loadout', 'quests', 'maps', 'run_reward', 'stage_houses', 'stage_rules',
  'extract_quota', 'loot_cap', 'loot_sizes', 'loot_materials', 'loot_items', 'safes_chests', 'station_upgrades',
  'station_gear', 'station_healthpacks', 'station_vehicles', 'station_rules', 'gacha_wheel', 'foes', 'run_timers'];

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'data/design-defaults.js'), 'utf8'), sandbox);
const DEFAULTS = sandbox.window.DESIGN_DEFAULTS.tables;

const LABELS_JS = 'window.DESIGN_LABELS = ' + JSON.stringify({
  quests: { title: 'Nhiệm vụ', blurb: 'Nhiệm vụ ngày.', effect: 'Từ lần gọi API kế tiếp.',
    fields: { pick: { label: 'Số nhiệm vụ mỗi ngày', int: true, min: 1, unit: 'nhiệm vụ' },
      list: { label: 'Danh sách nhiệm vụ' },
      'list.*.text': { label: 'Mô tả' }, 'list.*.need': { label: 'Cần đạt', int: true, min: 1 },
      'list.*.reward.gold': { label: 'Thưởng vàng', unit: 'vàng', int: true }, 'list.*.reward.gem': { label: 'Thưởng gem', int: true } } },
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
}) + ';';

function hashDocs(docs) {
  const sortKeys = v => Array.isArray(v) ? v.map(sortKeys)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])])) : v;
  const sorted = docs.slice().sort((a, b) => (a._id < b._id ? -1 : a._id > b._id ? 1 : 0)).map(sortKeys);
  return crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

const fake = {
  tables: { quests: JSON.parse(fs.readFileSync('D:/REPO_Meta/gamespark-config/quests.json', 'utf8')),
    stage_houses: JSON.parse(JSON.stringify(DEFAULTS.stage_houses)), stage_rules: JSON.parse(JSON.stringify(DEFAULTS.stage_rules)) },
  saves: [],
  view(n) { const d = this.tables[n]; return { exists: !!d, docs: d || [], hash: hashDocs(d || []) }; },
  mutate(n, fn) { fn(this.tables[n]); },
  handle(body, auth) {
    if (auth !== 'Bearer tok') return [401, { ok: false, error: { code: 'UNAUTHENTICATED', message: 'token sai' } }];
    if (body.action === 'list') {
      const tables = {}; KNOWN.forEach(n => { tables[n] = this.view(n); });
      return [200, { ok: true, project: 'repo-2d-topdown', env: 'dev', tables }];
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
  const srv = await serve(0);
  const BASE = 'http://127.0.0.1:' + srv.address().port;
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => {
    localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', email: 't@x', accessToken: 'tok',
      refreshToken: 'r', expiresAt: Date.now() + 3600e3 }));
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  p.on('dialog', d => d.accept());

  const open = async n => { await p.click(`#dz-nav [data-table="${n}"]`); await p.waitForSelector('.dz-pane__head'); };
  const txt = sel => p.$eval(sel, e => e.textContent.trim());
  const dryDone = () => p.waitForFunction(() => /GameSpark báo/.test(document.getElementById('dz-dry').textContent));
  const barGone = () => p.waitForFunction(() => /^Chưa sửa gì/.test(document.getElementById('dz-bar-count').textContent));

  await p.goto(BASE + '/design.html?api=/gs&poll=300');
  await p.waitForSelector('#dz-nav .dz-chip--live');
  const items = await p.$$eval('#dz-nav .dz-nav__item', els => els.length);
  const chipQ = await txt('#dz-nav [data-table="quests"] .dz-chip');
  const chipF = await txt('#dz-nav [data-table="foes"] .dz-chip');
  check('sidebar liệt kê 35 bảng', items === 35, String(items));
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
