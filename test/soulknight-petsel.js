/*
 * Chọn thú cưng ở sảnh đi: bấm E cạnh thú cưng → bảng; mua Buddy (1000 đá) → chọn → vào ván đúng pet1; thân mật dưới 50% tắt kỹ năng,
 * 120/240 bật; cho ăn +10 và trừ 1 Thức ăn cho pet, lần thứ 8 bị từ chối; Cá Khô mua Panda; con khoá hiện điều kiện; xong ván +10 thân mật.
 * Không dùng ?quick=1. Chạy: python3 -m http.server 8811 (gốc repo) rồi  node test/soulknight-petsel.js   (SK_URL để chạy trên Pages)
 */
const PW = process.env.PLAYWRIGHT_PATH || '/home/bui-thanh-thuong/.cache/pw-node/node_modules/playwright-core';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-petsel');
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  out.push('  ' + (ok ? '✔' : '✘') + ' ' + name + (detail ? '  — ' + detail : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(p, fn, arg, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg)) return true; await sleep(80); }
  return false;
}

const errs = [];
let browser;
// Trang mới với hồ sơ cho trước (null = hồ sơ trắng), vào sảnh → chọn Hiệp Sĩ → Bắt đầu → chế độ đi.
async function boot(profile) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('response', r => { if (r.status() >= 400 && !/fonts\.(googleapis|gstatic)/.test(r.url())) errs.push('http ' + r.status() + ' ' + r.url()); });
  if (profile) await p.addInitScript(prof => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('sk.profile.v1', JSON.stringify(prof)); sessionStorage.setItem('seeded', '1'); } }, profile);
  await p.goto(URL);
  await until(p, () => window.SK_GAME && SK_GAME.state === 'hall', null, 10000);
  await sleep(500);
  const at = await p.evaluate(() => SK.hall.npcScreen('knight'));
  await p.mouse.click(at.x, at.y);
  await until(p, () => !document.getElementById('sk-lobby').hidden, null, 3000);
  await p.click('#sk-start');
  await until(p, () => SK_GAME.state === 'hall' && SK.hall.state.mode === 'walk', null, 3000);
  await sleep(300);
  return p;
}

const dlgText = p => p.evaluate(() => document.getElementById('hs-modal').hidden ? null : document.getElementById('hs-dlg').innerText);
const shot = (p, n) => p.screenshot({ path: path.join(SHOTS, n + '.png'), timeout: 15000 }).catch(() => {});
const pf = p => p.evaluate(() => { const P = SK.profile; return { gems: P.gems, fish: P.fish, pet: P.pet(), grain: P.item('material_grain'), fert: P.item('material_fertilize'),
  aff1: P.petAff('pet1'), fed1: P.petFed('pet1'), own1: P.petOwned('pet1'), own5: P.petOwned('pet5') }; });
async function closeDlg(p) {
  await p.keyboard.press('Escape');
  await until(p, () => document.getElementById('hs-modal').hidden && !document.getElementById('sk-lobby').classList.contains('only-modes'), null, 2000);
  await sleep(350);
}
const click = async (p, sel) => { await p.click(sel); await sleep(120); };
async function startRun(p) {
  await p.evaluate(() => { const s = SK.hallState, d = SK.hall.state.door; s.me.x = d.x; s.me.y = d.y - 4; });
  await p.keyboard.down('KeyW');
  await until(p, () => !document.getElementById('hs-modes').hidden, null, 4000);
  await p.keyboard.up('KeyW');
  await p.click('#hs-mode-go');
  return until(p, () => SK.G.state === 'stage' && !!SK.G.player && !!SK.G.pet, null, 8000);
}
// Đứng cạnh thú cưng đang theo chủ (đặt chủ sát thú cưng, đợi nhãn) rồi bấm E thật.
async function openPanel(p) {
  await p.evaluate(() => { const s = SK.hallState; s.pet.x = s.me.x - 0.6; s.pet.y = s.me.y - 0.2; });
  const near = await until(p, () => { const n = SK.hall.near(); return n && n.slot === 'pet_food'; }, null, 2000);
  await p.keyboard.press('KeyE');
  if (!await until(p, () => !document.getElementById('hs-modal').hidden, null, 1200)) {
    await p.keyboard.press('KeyE');
    await until(p, () => !document.getElementById('hs-modal').hidden, null, 2000);
  }
  await until(p, () => !!document.getElementById('sk-pets'), null, 2000);
  await sleep(200);
  return { near, text: await dlgText(p) };
}
const card = (p, id) => p.click('#sk-pets [data-id="' + id + '"]').then(() => sleep(150));

(async () => {
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    // ============ 1. mở bảng cạnh thú cưng, mua Buddy, chọn, cho ăn
    let p = await boot({ gems: 5000, unlocked: ['knight'], selected: 'knight', inv: { material_grain: 10 }, fish: 5 });
    const o = await openPanel(p);
    check('đến gần thú cưng: nhãn món là pet_food (E), bấm E → bảng Thú cưng', o.near && o.text && /Thú cưng/.test(o.text), o.text && o.text.slice(0, 40));
    const nCards = await p.evaluate(() => document.querySelectorAll('#sk-pets > div').length), cvs = await p.evaluate(() => document.querySelectorAll('#sk-pets canvas').length);
    check('lưới có thẻ thú cưng kèm ảnh prefab (canvas)', nCards >= 50 && cvs === nCards, nCards + ' thẻ, ' + cvs + ' ảnh');
    const drawn = await p.evaluate(() => { const c = document.querySelector('#sk-pets [data-id="pet0"] canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
    check('ảnh Chilly có điểm ảnh vẽ thật (không trống)', drawn > 100, drawn + ' điểm');
    check('Chilly có sẵn: nút Chọn tắt (đang chọn), không có nút Mua', await p.evaluate(() => document.getElementById('sk-pet-pick').disabled && !document.getElementById('sk-pet-buy')));
    await card(p, 'pet1');
    let t = await dlgText(p);
    check('thẻ Buddy hiện tên, kỹ năng chính thức, giá 1.000 đá', /Buddy|Vượng/.test(t) && await p.evaluate(() => !!document.getElementById('sk-pet-skill') && /1[.,]000/.test(document.getElementById('sk-pet-price').innerText)), t.slice(0, 200).replace(/\n/g, ' / '));
    await shot(p, 'petsel-panel');
    const g0 = (await pf(p)).gems;
    await click(p, '#sk-pet-buy');
    let f = await pf(p);
    check('mua Buddy trừ đúng 1000 đá và mở thú cưng', f.own1 && g0 - f.gems === 1000, g0 + ' → ' + f.gems);
    await click(p, '#sk-pet-pick');
    f = await pf(p);
    check('chọn Buddy: SK.profile.pet() === pet1 và bảng báo Đang chọn', f.pet === 'pet1' && await p.evaluate(() => document.getElementById('sk-pet-pick').disabled), f.pet);
    await shot(p, 'petsel-bought');
    // cho ăn: mỗi lần +10, trừ 1 thức ăn
    let ok = true, detail = [];
    for (let i = 1; i <= 7; i++) {
      const b = await pf(p); await click(p, '#sk-pet-feed'); const a = await pf(p);
      if (a.aff1 - b.aff1 !== 10 || b.grain - a.grain !== 1 || a.fed1 !== i) ok = false;
      detail.push(a.aff1 + '/' + a.grain);
    }
    check('cho ăn 7 lần: mỗi lần +10 thân mật (Pet Treat 10) và trừ đúng 1 Thức ăn cho pet', ok && (await pf(p)).aff1 === 70, detail.join(' '));
    const b8 = await pf(p); await click(p, '#sk-pet-feed'); const a8 = await pf(p);
    const n8 = await p.evaluate(() => document.getElementById('sk-pet-note') && document.getElementById('sk-pet-note').innerText);
    check('lần thứ 8 bị từ chối: "No quá rồi...", không đổi thân mật, không trừ thức ăn', a8.aff1 === b8.aff1 && a8.grain === b8.grain && /No quá rồi/.test(n8 || ''), n8);
    await shot(p, 'petsel-fed');
    // Cá Khô: Panda (pet5) 5 Cá Khô
    await card(p, 'pet5');
    const pr5 = await p.evaluate(() => document.getElementById('sk-pet-price') && document.getElementById('sk-pet-price').innerText);
    await click(p, '#sk-pet-buy');
    f = await pf(p);
    check('con giá Cá Khô (Panda): mua bằng 5 Cá Khô, đá quý không đổi', /5 Cá Khô/.test(pr5 || '') && f.own5 && f.fish === 0 && f.gems === b8.gems, pr5 + ' ' + JSON.stringify({ fish: f.fish, gems: f.gems }));
    // con khoá thành tựu hiện điều kiện, sự kiện khoá
    await card(p, 'pet36');
    const lk = await p.evaluate(() => ({ t: document.getElementById('sk-pet-lock') && document.getElementById('sk-pet-lock').innerText, buy: !!document.getElementById('sk-pet-buy') }));
    check('thú cưng thành tựu (pet36): khoá, hiện điều kiện, không có nút Mua', /Sự Nghiệp Hưng Thịnh/.test(lk.t || '') && !lk.buy, lk.t);
    await card(p, 'pet14');
    const lk2 = await p.evaluate(() => ({ t: document.getElementById('sk-pet-lock') && document.getElementById('sk-pet-lock').innerText, buy: !!document.getElementById('sk-pet-buy') }));
    check('thú cưng sự kiện (pet14): khoá, không có nút Mua', /sự kiện/.test(lk2.t || '') && !lk2.buy, lk2.t);
    check('chữ hiện cho người chơi không chứa nhãn nguồn', !/\[(LOC|WIKI|ĐO|ƯỚC LƯỢNG)/.test(await dlgText(p)));
    await closeDlg(p);
    // chọn lại pet1 đã mua rồi vào ván: pet1, thân mật 70 < 120 → kỹ năng tắt
    check('vào ván thật qua cửa sảnh', await startRun(p));
    let g = await p.evaluate(() => ({ id: SK.G.pet.id, keys: Object.keys(SK.G.pet.def), aff: SK.profile.petAff('pet1') }));
    check('trong ván G.pet.id === pet1; thân mật 70/240 (<50%): def kỹ năng rỗng (chỉ cắn mặc định)', g.id === 'pet1' && g.keys.length === 0, JSON.stringify(g));
    // xong ván: +10 thân mật, đặt lại số lần cho ăn
    await p.evaluate(() => { const pl = SK.G.player; pl.god = false; pl.invulT = 0; pl.armor = 0; SK.hurtPlayer(SK.G, 999); });
    await until(p, () => SK_GAME.state === 'dead', null, 8000); await sleep(300);
    f = await pf(p);
    check('xong ván: thân mật +10 (70 → 80), số lần cho ăn đặt lại 0', f.aff1 === 80 && f.fed1 === 0, JSON.stringify({ aff: f.aff1, fed: f.fed1 }));
    await p.context().close();

    // ============ 2. thân mật 120/240 (50%): kỹ năng bật
    p = await boot({ gems: 0, unlocked: ['knight'], selected: 'knight', pets: ['pet1'], petSel: 'pet1', aff: { pet1: 120 } });
    check('vào ván thật', await startRun(p));
    g = await p.evaluate(() => ({ id: SK.G.pet.id, keys: Object.keys(SK.G.pet.def), on: SK.profile.petSkillOn('pet1') }));
    check('thân mật 120/240: kỹ năng bật (def có móc cắn Thịnh Vượng)', g.id === 'pet1' && g.on && g.keys.indexOf('bite') >= 0, JSON.stringify(g));
    await p.context().close();

    // ============ 3. giới hạn thân mật, món ưa thích / không dùng được, SK.petForce bỏ ngưỡng
    p = await boot({ gems: 0, unlocked: ['knight'], selected: 'knight', pets: ['pet13', 'pet1', 'pet30'], petSel: 'pet13', inv: { material_fertilize: 3, material_grain: 20 }, aff: { pet30: 175 } });
    const r = await p.evaluate(() => {
      const P = SK.profile, out = {};
      out.fertBad = P.feedPet('pet1', 'material_fertilize');          // Buddy thích Thịt: Phân Bón không dùng được
      out.fertOk = P.feedPet('pet13', 'material_fertilize');          // Bọ Thừa Kế có món Fertilizer
      out.fertLeft = P.item('material_fertilize');
      out.maxP = P.petAffMax('pet30') + '/' + P.petAffMax('pet34') + '/' + P.petAffMax('pet1');
      out.cap = P.feedPet('pet30', 'material_grain'); out.cap2 = P.feedPet('pet30', 'material_grain');
      out.noItem = P.feedPet('pet13', 'khong_co');
      return out;
    });
    check('Phân Bón: Buddy (thích Thịt) từ chối, Bọ Thừa Kế nhận +10 và trừ 1', !r.fertBad.ok && r.fertOk.ok && r.fertOk.pts === 10 && r.fertLeft === 2, JSON.stringify({ b: r.fertBad.err, o: r.fertOk.pts, left: r.fertLeft }));
    check('thân mật tối đa: Purpur 180, Pepper 300, còn lại 240; không vượt trần', r.maxP === '180/300/240' && r.cap.ok && r.cap.aff === 180 && r.cap.pts === 5 && !r.cap2.ok && r.cap2.maxed, r.maxP + ' ' + JSON.stringify(r.cap) + ' ' + r.cap2.err);
    check('món lạ bị từ chối', !r.noItem.ok);
    await p.evaluate(() => { SK.petForce = null; });
    check('vào ván: thú cưng chọn sẵn pet13 (hồ sơ nạp lại)', await startRun(p) && await p.evaluate(() => SK.G.pet.id === 'pet13'));
    await p.context().close();
  } catch (e) {
    check('chạy trọn', false, (e.stack || e.message).split('\n').slice(0, 3).join(' / '));
  }
  check('không lỗi trang / console / HTTP', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
  console.log(out.join('\n'));
  console.log(`\n  ảnh: ${SHOTS}\n  ĐẠT ${pass}   HỎNG ${fail}`);
  process.exit(fail ? 1 : 0);
})();
