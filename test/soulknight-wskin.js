/*
 * Skin vũ khí khởi đầu của Hiệp Sĩ Linh Hồn (games/soulknight/js/hall_wskin.js, data/sk-wskin.js, tools/wskin/build_wskin.py).
 * Chạy: python3 -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-wskin.js   (SK_URL để chạy trên Pages)
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-wskin/.
 *
 * Nguồn số: 369 prefab weapon_init_<hero>xx[N] trong config weapons.json (OriginalWeapon weapon_init_<hero>x), trừ 13 skin trùng tên vũ khí gốc
 * (ngoại hình gốc) và 2 skin (assassinxx3, paladinxx3) cần hình ở bundle không có trong bản cài = 354 skin, 40 nhân vật.
 * Chứng minh: (1) dữ liệu đủ 354 và mọi hình có trong atlas; (2) mở skin trừ đúng 50 đá, thiếu đá thì không mở; (3) chọn skin ở Giá Skin Vũ Khí
 * trong sảnh, tải lại trang vẫn còn; (4) vào ván, vũ khí khởi đầu VẼ bằng hình skin (chặn SK.draw/drawTinted để ghi tên khung đang vẽ),
 * chỉ số/đạn/nòng không đổi, vẫn bắn được; (5) mọi 354 skin dựng được tư thế mà không nút nào thiếu hình.
 */
const PW = process.env.PLAYWRIGHT_PATH || '/home/bui-thanh-thuong/.cache/pw-node/node_modules/playwright-core';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-wskin');
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
async function enterWalk(p) {
  await until(p, () => window.SK_GAME && SK_GAME.state === 'hall', null, 15000);
  await sleep(500);
  const at = await p.evaluate(() => SK.hall.npcScreen('knight'));
  await p.mouse.click(at.x, at.y);
  await until(p, () => !document.getElementById('sk-lobby').hidden, null, 3000);
  await p.click('#sk-start');
  await until(p, () => SK_GAME.state === 'hall' && SK.hall.state.mode === 'walk', null, 3000);
  await sleep(300);
}
async function boot(profile, fresh) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('response', r => { if (r.status() >= 400 && !/fonts\.(googleapis|gstatic)/.test(r.url())) errs.push('http ' + r.status() + ' ' + r.url()); });
  if (profile) await p.addInitScript(prof => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('sk.profile.v1', JSON.stringify(prof)); sessionStorage.setItem('seeded', '1'); } }, profile);
  await p.goto(URL);
  await enterWalk(p);
  return p;
}
async function reload(p) { await p.goto(URL); await enterWalk(p); }
const dlgText = p => p.evaluate(() => document.getElementById('hs-modal').hidden ? null : document.getElementById('hs-dlg').innerText);
async function closeDlg(p) {
  await p.keyboard.press('Escape');
  await until(p, () => document.getElementById('hs-modal').hidden && !document.getElementById('sk-lobby').classList.contains('only-modes'), null, 2000);
  await sleep(350);
}
async function stand(p, slot) {
  const pos = await p.evaluate(slot => {
    const z = SK.hall.zones().find(q => q.slot === slot), b = z.box, cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    let best = null;
    for (let dy = -3; dy <= 3; dy += 0.25) for (let dx = -3; dx <= 3; dx += 0.25) {
      const x = cx + dx, y = cy + dy;
      if (!SK.hall.walkable(x, y) || !SK.hall.walkable(x - 0.4, y) || !SK.hall.walkable(x + 0.4, y) || SK.hall.nearAt(x, y) !== slot) continue;
      const d = Math.hypot(dx, dy);
      if (!best || d < best.d) best = { x, y, d };
    }
    if (best) { const me = SK.hallState.me; me.x = best.x; me.y = best.y; }
    return best;
  }, slot);
  await sleep(250);
  return pos;
}
async function useSlot(p, slot) {
  const pos = await stand(p, slot);
  if (!pos) return null;
  await p.keyboard.press('KeyE');
  for (let i = 0; i < 4 && !await until(p, () => !document.getElementById('hs-modal').hidden, null, 1200); i++) await p.keyboard.press('KeyE');
  await until(p, () => !document.getElementById('hs-modal').hidden, null, 2000);
  await sleep(150);
  return dlgText(p);
}
async function startRun(p) {
  await p.evaluate(() => { const s = SK.hallState, d = SK.hall.state.door; s.me.x = d.x; s.me.y = d.y - 4; });
  await p.keyboard.down('KeyW');
  await until(p, () => !document.getElementById('hs-modes').hidden, null, 4000);
  await p.keyboard.up('KeyW');
  await p.click('#hs-mode-go');
  return until(p, () => SK.G.state === 'stage' && !!SK.G.player, null, 8000);
}
const shot = (p, n) => p.screenshot({ path: path.join(SHOTS, n + '.png'), timeout: 15000 }).catch(() => {});
const T = t => (t || '').replace(/\n/g, ' | ').slice(0, 160);
const gems = p => p.evaluate(() => SK.profile.gems);
const HERO = 'ranger';
const SEED = { gems: 400, welcomed: 1, won: { knight: 1 }, stats: { best: 7, pass: 2, dead: 1 }, unlocked: ['knight', HERO] };

(async () => {
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    // ============ 1. dữ liệu
    let p = await boot(SEED);
    const d = await p.evaluate(() => {
      const X = SK_WSKIN, F = SK.A.f, miss = [], bad = [];
      for (const s of X.skins) {
        const base = SK_DESIGN.heroes[s.hero] && SK_DESIGN.weapons[SK_DESIGN.heroes[s.hero].weapon];
        if (!base || base.prefab !== s.base) bad.push(s.id);
        const names = s.ov.map(o => o[1].f).concat((s.add || []).map(a => a.f)).filter(f => f && f !== 'nothing');
        for (const f of names) if (!F[f]) miss.push(s.id + ':' + f);
        if (!s.vi || !s.en || !/^weapon_init_.+xx\d*$/.test(s.id)) bad.push('tên ' + s.id);
      }
      return { n: X.skins.length, heroes: new Set(X.skins.map(s => s.hero)).size, ids: new Set(X.skins.map(s => s.id)).size, miss, bad, withAdd: X.skins.filter(s => s.add).length,
        api: SK.wskin && SK.wskin.count, rack: SK.hall.zones().some(z => z.slot === 'wskin_rack') };
    });
    check('dữ liệu có 354 skin vũ khí của 40 nhân vật (369 prefab xx trừ 13 trùng tên gốc và 2 thiếu hình)', d.n === 354 && d.heroes === 40 && d.ids === 354 && d.api === 354, JSON.stringify({ n: d.n, heroes: d.heroes, ids: d.ids }));
    check('mọi hình mà skin dùng đều có trong atlas', d.miss.length === 0, d.miss.slice(0, 6).join(' '));
    check('mỗi skin trỏ đúng vũ khí khởi đầu của nhân vật và có tên Việt', d.bad.length === 0, d.bad.slice(0, 6).join(' '));
    check('có skin kèm nút thêm (add) để kiểm đường dựng nút phụ', d.withAdd > 0, d.withAdd + ' skin');
    check('Giá Skin Vũ Khí có trong sảnh', d.rack);

    // ============ 2. mở skin trừ đúng đá, thiếu đá thì không mở
    const info = await p.evaluate(h => { const l = SK.wskin.skins(h); return { n: l.length, ids: l.slice(0, 3).map(s => s.id), vi: l.slice(0, 3).map(s => s.vi), price: SK.wskin.price() }; }, HERO);
    check('Cung Thủ có nhiều skin vũ khí (nguồn: 17 prefab xx)', info.n >= 10, info.n + ' skin');
    let t = await useSlot(p, 'wskin_rack');
    check('Giá Skin Vũ Khí mở hộp thoại: tiêu đề, Ngoại Hình Gốc, Đang Sử Dụng', t && /Skin Vũ Khí/.test(t) && /Ngoại Hình Gốc/.test(t) && /Đang Sử Dụng/.test(t), T(t));
    await shot(p, 'rack-dialog');
    await p.selectOption('#sk-ws-hero', HERO);
    await sleep(200);
    const rows = await p.evaluate(() => document.querySelectorAll('#sk-ws-list li').length);
    check('chọn nhân vật: danh sách = ngoại hình gốc + mọi skin của nhân vật', rows === info.n + 1, rows + ' dòng');
    const g0 = await gems(p);
    await p.click('#sk-ws-list li[data-id="' + info.ids[0] + '"] button[data-act="buy"]');
    await sleep(200);
    let own = await p.evaluate(id => SK.wskin.owned(id), info.ids[0]);
    check('mở skin trừ đúng ' + info.price + ' đá', own && g0 - await gems(p) === info.price, g0 + '→' + await gems(p));
    check('hàng skin vừa mở hiện nút "Đổi Skin"', await p.evaluate(id => !!document.querySelector('#sk-ws-list li[data-id="' + id + '"] button[data-act="sel"]'), info.ids[0]));
    await p.evaluate(() => { const n = SK.profile.gems - 10; SK.profile.spend(n); });
    const g1 = await gems(p);
    const r = await p.evaluate(id => SK.wskin.buy(id), info.ids[1]);
    own = await p.evaluate(id => SK.wskin.owned(id), info.ids[1]);
    check('thiếu đá: không mở được, không trừ đá', !r.ok && !own && await gems(p) === g1, JSON.stringify(r) + ' gems ' + await gems(p));
    const dis = await p.evaluate(id => document.querySelector('#sk-ws-list li[data-id="' + id + '"] button[data-act="buy"]'), info.ids[1]);
    await p.evaluate(() => SK.profile.addGems(500));
    // ============ 3. chọn skin, tải lại vẫn còn
    await p.evaluate(() => { SK.wskin.shelf(); });
    await sleep(150);
    await p.selectOption('#sk-ws-hero', HERO);
    await sleep(200);
    await p.click('#sk-ws-list li[data-id="' + info.ids[0] + '"] button[data-act="sel"]');
    await sleep(200);
    check('bấm Đổi Skin: skin được chọn, dòng ghi Đang Sử Dụng', await p.evaluate(([h, id]) => SK.wskin.selected(h) === id && /Đang Sử Dụng/.test(document.querySelector('#sk-ws-list li[data-id="' + id + '"]').innerText), [HERO, info.ids[0]]));
    await shot(p, 'rack-selected');
    await closeDlg(p);
    const gKeep = await gems(p);
    await reload(p);
    check('tải lại trang: skin đã mở và đang chọn vẫn còn, đá không đổi', await p.evaluate(([h, id]) => SK.wskin.owned(id) && SK.wskin.selected(h) === id, [HERO, info.ids[0]]) && await gems(p) === gKeep);

    // ============ 4. vào ván: vẽ bằng hình skin, chỉ số không đổi
    const pre = await p.evaluate(h => {
      const base = SK_DESIGN.weapons[SK_DESIGN.heroes[h].weapon];
      return { id: SK_DESIGN.heroes[h].weapon, dmg: base.dmg, cost: base.cost, crit: base.crit, rps: base.rps, sprite: base.sprite, b: JSON.stringify(base.w86.b), fire: JSON.stringify(base.w86.fire), rigLen: base.w86.rig.length,
        gp: JSON.stringify(base.w86.rig.filter(n => n.n === 'gun_point')), baseFrames: base.w86.rig.map(n => n.f).filter(Boolean) };
    }, HERO);
    await p.evaluate(h => { SK.profile.unlock(h); SK.profile.select(h); }, HERO);
    const ok = await startRun(p);
    check('vào ván với ' + HERO, ok && await p.evaluate(h => SK.G.heroId === h || SK.G.player.hero === h, HERO), await p.evaluate(() => SK.G.player && SK.G.player.hero));
    await p.evaluate(() => { SK_GAME.debug.god(true); SK_GAME.debug.pet(false); });
    const skinInfo = await p.evaluate(id => { const s = SK.wskin.get(id); return { frames: s.ov.map(o => o[1].f).filter(Boolean), add: (s.add || []).map(a => a.f) }; }, info.ids[0]);
    await p.evaluate(() => {
      window.__drawn = {}; window.__fire = 0;
      for (const k of ['draw', 'drawTinted']) { const o = SK[k]; SK[k] = function (ctx, name) { window.__drawn[name] = (window.__drawn[name] | 0) + 1; return o.apply(this, arguments); }; }
      SK.on('fire', () => { window.__fire++; });
    });
    await p.keyboard.down('KeyJ'); await sleep(700); await p.keyboard.up('KeyJ'); await sleep(300);
    const run = await p.evaluate(() => {
      const w = SK.G.player.weapons[0], d = w.def, e = d.w86;
      return { id: w.id, wskin: w.wskin, dmg: d.dmg, cost: d.cost, crit: d.crit, rps: d.rps, sprite: d.sprite, b: JSON.stringify(e.b), fire: JSON.stringify(e.fire), rigLen: e.rig.length,
        gp: JSON.stringify(e.rig.filter(n => n.n === 'gun_point')), drawn: Object.assign({}, window.__drawn), fired: window.__fire, pose: SK.w86.pose(w).filter(q => q.show && q.f).map(q => q.f) };
    });
    check('vũ khí khởi đầu mang skin đã chọn', run.wskin === info.ids[0] && run.id === pre.id, run.wskin + ' ' + run.id);
    const seen = skinInfo.frames.concat(skinInfo.add).filter(f => f && f !== 'nothing');
    const drew = seen.filter(f => run.drawn[f] > 0);
    check('khung đang vẽ có hình của skin (chặn SK.draw/drawTinted)', drew.length > 0 && drew.length === seen.filter(f => run.pose.indexOf(f) >= 0).length, 'vẽ ' + drew.join(',') + ' / skin dùng ' + seen.join(','));
    const replaced = pre.baseFrames.filter((f, i, a) => a.indexOf(f) === i && skinInfo.frames.indexOf(f) < 0 && f !== 'nothing' && run.pose.indexOf(f) < 0);
    const stillBase = pre.baseFrames.filter(f => run.drawn[f] > 0 && f !== pre.sprite);
    check('hình gốc của các nút đã thay không còn được vẽ', stillBase.every(f => run.pose.indexOf(f) >= 0), 'còn vẽ ' + stillBase.join(','));
    check('chỉ số vũ khí không đổi (dmg, cost, crit, rps, đạn, nhịp bắn, nòng)', run.dmg === pre.dmg && run.cost === pre.cost && run.crit === pre.crit && run.rps === pre.rps && run.b === pre.b && run.fire === pre.fire && run.gp === pre.gp,
      JSON.stringify([run.dmg, pre.dmg, run.rps, pre.rps]));
    check('vũ khí skin vẫn bắn được (sự kiện fire)', run.fired > 0, run.fired + ' lần');
    await shot(p, 'run-skin');
    // so với ngoại hình gốc: bỏ chọn rồi tạo lại người chơi
    const base2 = await p.evaluate(h => {
      SK.wskin.select(h, null);
      const pl = SK.makePlayer(h, 0, 0), w = pl.weapons[0];
      return { wskin: w.wskin || null, sprite: w.def.sprite, pose: SK.w86.pose(w).filter(q => q.show && q.f).map(q => q.f) };
    }, HERO);
    check('bỏ chọn: ngoại hình gốc trở lại (hình bản gốc, không còn dấu skin)', base2.wskin === null && base2.sprite === pre.sprite && JSON.stringify(base2.pose) !== JSON.stringify(run.pose), JSON.stringify(base2.pose) + ' vs ' + JSON.stringify(run.pose));

    // ============ 5. mọi 354 skin: mua hết (trừ đúng), mặc, dựng tư thế
    const all = await p.evaluate(() => {
      const A = SK.wskin, P = SK.profile, res = { bought: 0, spent: 0, noFrame: [], same: [], statDiff: [], total: 0, extraNodes: 0 };
      P.addGems(40000);
      const g0 = P.gems;
      for (const s of A.all()) {
        if (A.owned(s.id)) continue;
        const b = A.buy(s.id); if (b.ok) res.bought++;
      }
      res.spent = g0 - P.gems; res.owned = A.all().filter(s => A.owned(s.id)).length;
      for (const s of A.all()) {
        res.total++;
        A.select(s.hero, s.id);
        const pl = SK.makePlayer(s.hero, 0, 0), w = pl.weapons[0], base = SK_DESIGN.weapons[SK_DESIGN.heroes[s.hero].weapon];
        if (w.wskin !== s.id) { res.same.push(s.id + ' không mặc'); continue; }
        if (!base.w86) {   // vũ khí khởi đầu vẽ bằng def.sprite (Người Điều Khiển Gió): đổi sprite, hình có trong atlas
          res.sprOnly = (res.sprOnly || 0) + 1;
          const sp = SK.wskinSprite(w);
          if (!sp || sp === base.sprite) res.same.push(s.id + ' sprite giống gốc');
          if (!SK.frame(sp)) res.noFrame.push(s.id + ':' + sp);
          A.select(s.hero, null); continue;
        }
        const pose = SK.w86.pose(w), e = w.def.w86;
        for (let i = 0; i < pose.length; i++) if (pose[i].show && pose[i].f && pose[i].f !== 'nothing' && !SK.frame(pose[i].f)) res.noFrame.push(s.id + ':' + pose[i].f);
        const bw = SK.makeWeapon(SK_DESIGN.heroes[s.hero].weapon), basePose = SK.w86.pose(bw);
        // mọi trạng thái Animator (chờ, bắn, thu về...): gom các hình đang hiện; skin phải khác bản gốc ở ít nhất một trạng thái
        const frames = x => { const set = new Set(); const n = x.def.w86.SM ? x.def.w86.SM.st.length : 1; for (let i = 0; i < n; i++) { x.st = i; x.t = 0; for (const q of SK.w86.pose(x)) if (q.show && q.f && q.f !== 'nothing') set.add(q.f); } x.st = null; return [...set].sort().join('|'); };
        if (frames(bw) === frames(w) && !(s.add && s.add.length)) res.same.push(s.id + ' hình giống gốc ở mọi trạng thái');
        res.extraNodes += pose.length - basePose.length;
        if (w.def.dmg !== base.dmg || w.def.cost !== base.cost || w.def.rps !== base.rps || JSON.stringify(e.b) !== JSON.stringify(base.w86.b) || w.def.w86.SM !== base.w86.SM || w.def.w86.CL !== base.w86.CL) res.statDiff.push(s.id);
        A.select(s.hero, null);
      }
      return res;
    });
    check('mua nốt các skin còn lại trừ đúng 50 đá mỗi skin (tổng 354 × 50 kể cả skin đã mua ở bước 2)', all.owned === 354 && all.bought === 353 && all.spent === 353 * 50, all.bought + ' skin, ' + all.spent + ' đá, sở hữu ' + all.owned);
    check('mọi skin mặc được lên vũ khí khởi đầu và đổi hình so với bản gốc', all.same.length === 0, all.same.slice(0, 8).join(' | '));
    check('mọi nút của mọi skin có hình trong atlas', all.noFrame.length === 0, all.noFrame.slice(0, 8).join(' '));
    check('mọi skin giữ nguyên chỉ số, đạn, hoạt ảnh', all.statDiff.length === 0, all.statDiff.slice(0, 8).join(' '));
    check('nút thêm của skin được dựng (img/ui/l/r...)', all.extraNodes > 0, all.extraNodes + ' nút');

    // ============ 6. lỗi trang
    check('không có lỗi trang / tải thất bại', errs.length === 0, errs.slice(0, 4).join(' ; '));
  } catch (e) {
    check('chạy hết bộ kiểm', false, e.stack || String(e));
  }
  await browser.close();
  console.log(out.join('\n'));
  console.log('\nĐẠT ' + pass + '  HỎNG ' + fail);
  process.exit(fail ? 1 : 0);
})();
