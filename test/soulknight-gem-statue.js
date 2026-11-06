/*
 * Kiểm (a) tượng thần thứ 11 "Tượng Thỏ" và (b) thiên phú 15 "Thợ Mỏ Đá Quý" (ExpertGem) của Hiệp Sĩ Linh Hồn (js/rooms.js).
 * (a) LOC có 11 tên statue_*_name nhưng 10 mô tả; bản 8.6 chỉ có prefab/bể cho 10 tượng; wiki: Tượng Thỏ là bản cũ (1.7.0) của Tượng Kỵ Sĩ.
 * (b) cuối ván đá ×1,25 [WIKI Gem Generosity]: rooms.js gắn r.gemMul ở runEnd; lobby.js nhân hệ số khi đổi đá.
 * Chạy: python3 -m http.server 8833 (gốc repo) rồi  SK_URL=http://localhost:8833/games/soulknight/index.html PLAYWRIGHT_PATH=... node test/soulknight-gem-statue.js
 */
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const URL = (process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html') + '?quick=1&themes=forest,castle,volcano';
const DATA = fs.readFileSync(path.join(ROOT, 'games/soulknight/data/sk-buffs86.js'), 'utf8');
const LOCF = path.join(os.homedir(), 'sk86-ref/decoded/localization_en_vi.json');

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  if (ok) { pass++; results.push('  ✔ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; results.push('  ✘ ' + name + (detail ? '  — ' + detail : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(p, fn, arg, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg)) return true; await sleep(80); }
  return false;
}
const IGNORE = /bosses86|theme|lib|colour/;

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.addInitScript(DATA);
  const ev = (fn, arg) => p.evaluate(fn, arg);
  try {
    await p.goto(URL);
    await p.waitForSelector('#sk-start', { state: 'visible', timeout: 8000 });
    await ev(() => SK_GAME.debug.seed(424242));
    await p.click('#sk-start');
    await until(p, () => SK_GAME.state === 'stage', null, 3000);
    await ev(() => { SK_GAME.debug.god(true); SK_GAME.debug.pet(false); });

    // ================================================================ (a) tượng thứ 11
    if (fs.existsSync(LOCF)) {
      const L = JSON.parse(fs.readFileSync(LOCF, 'utf8'));
      const names = Object.keys(L).filter(k => /^statue_[a-z]+_name$/.test(k)), infos = Object.keys(L).filter(k => /^statue_[a-z]+_info$/.test(k)), nums = Object.keys(L).filter(k => /^statue\/info\/\d+$/.test(k));
      check('LOC: 11 tên tượng nhưng chỉ 10 mô tả (statue_*_info) và 10 statue/info/N; tên thừa là Tượng Thỏ',
        names.length === 11 && infos.length === 10 && nums.length === 10 && names.filter(k => !infos.includes(k.replace('_name', '_info'))).join() === 'statue_rabbit_name' && L.statue_rabbit_name[1] === 'Tượng Thỏ',
        names.length + ' tên · ' + infos.length + ' mô tả · thừa: ' + names.filter(k => !infos.includes(k.replace('_name', '_info'))).join());
    }
    const S = await ev(() => {
      const B = window.SK_BUFFS86, keys = Object.keys(B.statues);
      return { n: keys.length, keys: keys.join(','), pool: B.randomObjects.statue.length,
        all: keys.every(k => B.statues[k].name.vi && B.statues[k].info.vi && SK.prefab('statue_' + String(k).padStart(2, '0')) && SK.prefab('buff_statue_' + k)),
        p11: !!SK.prefab('statue_11') || !!SK.prefab('buff_statue_11'), rabbit: JSON.stringify(B.statues).indexOf('Thỏ') }; });
    check('web: 10 tượng sống (1..10) đủ tên, mô tả, prefab tượng và hiệu ứng; bể random_objects.statue 10 mục; không có prefab statue_11/buff_statue_11',
      S.n === 10 && S.pool === 10 && S.all && !S.p11 && S.rabbit < 0, S.n + ' tượng · bể ' + S.pool + ' · prefab 11: ' + S.p11);

    // ================================================================ (b) thiên phú 15
    const T = await ev(() => {
      const B = window.SK_BUFFS86, inGroup = Object.keys(B.groups).filter(k => B.groups[k].some(x => x[0] === 15 && x[1] === 10)).join();
      const d = SK_ROOMS.DEF[15];
      return { name: B.buffs[15].name.vi, info: B.buffs[15].info.vi, active: d && d.active, inGroup };
    });
    check('thiên phú 15 = Thợ Mỏ Đá Quý, đang bật; có trong bể TG_level2/3/3_volcano/3_alien (trọng số 10), không có ở TG_level1',
      T.name === 'Thợ Mỏ Đá Quý' && T.active === true && T.inGroup === 'TG_level2,TG_level3,TG_level3_volcano,TG_level3_alien' && /nhận thêm nhiều thưởng Đá/.test(T.info), JSON.stringify(T));
    // đo hai lần với cùng dữ liệu cuối ván: không buff và có buff
    const run = buff => ev(buff => new Promise(res => {
      const G = SK.G, pl = G.player;
      pl.buffs = []; if (buff) SK_ROOMS.takeBuff(15);
      const r = { won: true, stage: G.stage.label, kills: 200, gold: 80 };
      const g0 = SK.profile.gems;
      SK.emit('runEnd', G, r);
      setTimeout(() => res({ delta: SK.profile.gems - g0, mul: r.gemMul, extra: r.gemExtra, bonus: G.gemBonus }), 50);
    }), buff);
    const a = await run(false), c = await run(true);
    check('không có thiên phú: không có cờ gemMul, G.gemBonus = 1', a.mul === undefined && a.bonus === 1 && a.delta > 0, JSON.stringify(a));
    check('có thiên phú: r.gemMul = 1,25 và G.gemBonus = 1,25 (số wiki)', c.mul === 1.25 && c.bonus === 1.25, JSON.stringify(c));
    check('đá cuối ván tăng đúng ×1,25: ' + a.delta + ' → ' + c.delta + ' (= ' + a.delta + ' + ' + Math.floor(a.delta * 0.25) + ')', c.delta === a.delta + Math.floor(a.delta * 0.25) && c.extra === Math.floor(a.delta * 0.25), JSON.stringify(c));
    const errsReal = errs.filter(e => !IGNORE.test(e));
    check('không lỗi trang/console', errsReal.length === 0, errsReal.slice(0, 3).join(' | '));
  } catch (e) {
    check('bộ kiểm chạy hết không ngoại lệ', false, e.stack || e.message);
  }
  await b.close();
  console.log(results.join('\n'));
  console.log('\nĐẠT ' + pass + ' · HỎNG ' + fail);
  process.exit(fail ? 1 : 0);
})();
