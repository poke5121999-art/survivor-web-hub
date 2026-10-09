/*
 * Bộ kiểm giao diện hub (index.html): game nổi bật, lọc thể loại, bảng giới thiệu, thẻ bấm vào được.
 * Dùng:  node test/hub-ui.js        Ảnh chụp: HUB_SHOTS=<thư mục> (mặc định không chụp).
 *        HUB_URL=https://poke5121999-art.github.io/survivor-web-hub node test/hub-ui.js   chạy trên Pages.
 */
'use strict';
const path = require('path');
const T = require('../tools/thumb-lib.js');

global.window = {};
require(path.join(T.ROOT, 'data', 'games.js'));
const VISIBLE = window.HUB_GAMES.filter((g) => g.status === 'available');
const NEWEST = VISIBLE.filter((g) => g.rev).sort((a, b) => (a.rev < b.rev ? 1 : -1))[0];
const SHOTS = process.env.HUB_SHOTS;

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + name + (detail != null ? '  (' + detail + ')' : ''));
}

async function openHub(br, base, viewport, colorScheme) {
  const ctx = await br.newContext({ viewport, colorScheme });
  await ctx.addInitScript(() => localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'guest', name: 'Khách' })));
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) problems.push('http ' + r.status() + ': ' + r.url()); });
  await page.goto(base + '/index.html', { waitUntil: 'networkidle' });
  return { ctx, page, problems };
}

async function main() {
  const srv = process.env.HUB_URL ? { base: process.env.HUB_URL.replace(/\/$/, ''), close() {} } : await T.serve();
  const br = await T.browser();

  console.log('dữ liệu');
  const genres = ['hanh-dong', 'kinh-di', 'nhap-vai', 'chien-thuat', 'thu-gian', 'khac'];
  check('mọi game đang hiện có genre hợp lệ', VISIBLE.every((g) => genres.includes(g.genre)),
    VISIBLE.filter((g) => !genres.includes(g.genre)).map((g) => g.id).join(',') || null);
  check('tagline ≤ 80 ký tự', VISIBLE.every((g) => g.tagline.length <= 80),
    VISIBLE.filter((g) => g.tagline.length > 80).map((g) => g.id).join(',') || null);
  check('desc 60-330 ký tự', VISIBLE.every((g) => g.desc && g.desc.length >= 60 && g.desc.length <= 330),
    VISIBLE.filter((g) => !g.desc || g.desc.length < 60 || g.desc.length > 330).map((g) => g.id).join(',') || null);

  check('mọi game có bản tiếng Anh (title, tagline ≤ 90, desc)', VISIBLE.every((g) => g.en && g.en.title && g.en.tagline && g.en.tagline.length <= 90 && g.en.desc),
    VISIBLE.filter((g) => !g.en || !g.en.title || !g.en.desc || g.en.tagline.length > 90).map((g) => g.id).join(',') || null);
  const i18nSrc = require('fs').readFileSync(path.join(T.ROOT, 'js', 'i18n.js'), 'utf8');
  const NAMES = ['Gacha', 'Solo', 'Roguelite', 'Roguelike', 'MMORPG', 'Prototype', 'Co-op', 'Online', 'Unity', 'Auto-battler', 'Extraction',
    'Esport', 'MOBA', 'Pixel art', '3D', '2D', 'Crew', 'Pokémon', 'Chat', 'Soul Knight', 'Isometric', 'Diablo II', 'Bot'];
  const untranslated = [...new Set(VISIBLE.flatMap((g) => g.tags))].filter((tag) => !NAMES.includes(tag) && !i18nSrc.includes(JSON.stringify(tag) + ':'));
  check('mọi tag tiếng Việt có bản dịch', untranslated.length === 0, untranslated.join(', ') || null);

  console.log('máy tính 1366x900');
  let { ctx, page, problems } = await openHub(br, srv.base, { width: 1366, height: 900 }, 'dark');
  check('đủ thẻ', await page.locator('.card').count() === VISIBLE.length, VISIBLE.length);
  check('game nổi bật là bản mới nhất', (await page.textContent('.hero__title')) === NEWEST.title, NEWEST.title);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'hub-1366.png') });

  const horror = VISIBLE.filter((g) => g.genre === 'kinh-di').map((g) => g.id).sort();
  await page.click('.chip[data-key="kinh-di"]');
  const shown = await page.$$eval('.card:not([hidden])', (cs) => cs.map((c) => c.dataset.gameId).sort());
  check('lọc Kinh dị chỉ còn game kinh dị', JSON.stringify(shown) === JSON.stringify(horror), shown.join(','));
  await page.reload({ waitUntil: 'networkidle' });
  const kept = await page.$$eval('.card:not([hidden])', (cs) => cs.length);
  check('bộ lọc giữ qua lần tải lại', kept === horror.length, kept);
  await page.click('.chip[data-key="all"]');
  check('Tất cả hiện lại đủ thẻ', await page.locator('.card:not([hidden])').count() === VISIBLE.length);

  const target = VISIBLE[3];
  const card = page.locator('.card[data-game-id="' + target.id + '"]');
  await card.locator('.card__info').click();
  check('Giới thiệu mở bảng chi tiết', await page.locator('#game-detail[open]').count() === 1);
  check('bảng chi tiết đúng game', (await page.textContent('#detail-title')) === target.title, target.title);
  check('bảng chi tiết có desc', (await page.textContent('.detail__desc')) === target.desc);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'hub-detail.png') });
  await page.keyboard.press('Escape');
  check('Esc đóng bảng', await page.locator('#game-detail[open]').count() === 0);

  await page.click('.hub-lang__opt[data-lang="en"]');
  check('chuyển EN: html lang', (await page.getAttribute('html', 'lang')) === 'en');
  check('chuyển EN: tên game nổi bật', (await page.textContent('.hero__title')) === NEWEST.en.title, NEWEST.en.title);
  check('chuyển EN: tagline thẻ', (await card.locator('.card__tagline').textContent()) === target.en.tagline);
  check('chuyển EN: chữ giao diện', (await page.textContent('.chip[data-key="all"]')).includes('All') &&
    (await card.locator('.card__info').textContent()) === 'About', await page.textContent('#hub-subtitle'));
  check('chuyển EN: không còn chữ giao diện tiếng Việt', !/[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(
    await page.evaluate(() => [...document.querySelectorAll('.hub-header, .genre-filter, .card__info, .card__new, .card__genre, .hub-footer')].map((n) => n.textContent).join(' '))));
  await card.locator('.card__info').click();
  check('chuyển EN: bảng Giới thiệu', (await page.textContent('#detail-title')) === target.en.title && (await page.textContent('.detail__desc')) === target.en.desc);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'hub-detail-en.png') });
  await page.keyboard.press('Escape');
  await page.reload({ waitUntil: 'networkidle' });
  check('EN giữ qua lần tải lại', (await page.textContent('.hero__title')) === NEWEST.en.title);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'hub-1366-en.png') });
  await page.click('.hub-lang__opt[data-lang="vi"]');
  check('chuyển lại VI', (await page.textContent('.hero__title')) === NEWEST.title && (await page.getAttribute('html', 'lang')) === 'vi');

  await card.scrollIntoViewIfNeeded();
  const box = await card.locator('.card__img').boundingBox();
  const hit = await page.evaluate(([x, y]) => {
    const n = document.elementFromPoint(x, y);
    return n && n.closest('.card') ? n.className : 'outside:' + (n && n.className);
  }, [box.x + box.width / 2, box.y + box.height / 2]);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForURL(/\/games\//, { timeout: 15000 }).catch(() => {});
  const want = '/' + target.path + (target.rev ? '?v=' + target.rev : '');
  check('bấm vào ảnh thẻ mở đúng game', page.url().endsWith(want), page.url().replace(srv.base, '') + ' trúng ' + hit);
  check('không lỗi trang trên hub', problems.filter((p) => !p.includes('/games/')).length === 0, problems.join(' | ') || null);
  await ctx.close();

  console.log('điện thoại 390x844 + nền sáng');
  ({ ctx, page, problems } = await openHub(br, srv.base, { width: 390, height: 844 }, 'light'));
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  check('không cuộn ngang', sw <= 390, sw);
  const chipBox = await page.locator('.chip[data-key="all"]').boundingBox();
  check('chip đủ cao để chạm', chipBox.height >= 36, Math.round(chipBox.height));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'hub-390-light.png'), fullPage: false });
  check('không lỗi trang', problems.length === 0, problems.join(' | ') || null);
  await ctx.close();

  await br.close(); srv.close();
  console.log('\n' + pass + ' pass, ' + fail + ' fail');
  process.exitCode = fail ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exit(1); });
