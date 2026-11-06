/*
 * Skin nhân vật đợt 2 của Hiệp Sĩ Linh Hồn (games/soulknight/js/skins2.js, js/lobby.js, data/skins/econ.js, tools/skins/build_econ.py).
 * Chạy: python3 -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-skins2.js   (SK_URL để chạy trên Pages)
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-skins2/.
 *
 * Nguồn giá [WIKI Skinlines + Template:<Hero>_Skins; config skins.json không có giá]: đá / tiền thật (thanh toán giả) / Cá Khô / khoá không bán.
 * Chứng minh: (1) dữ liệu giá đủ 740 skin, mọi skin có giá hoặc cách mở; (2) skin khoá không chọn được, nút Mở khoá hiện giá,
 * mua bằng đá trừ đúng và lưu qua tải lại trang, thiếu đá thì không mua; skin Cá Khô trừ Cá Khô; skin chỉ có ở sự kiện không bán;
 * hồ sơ cũ giữ skin đang chọn; (3) dùng kỹ năng đổi dáng (Du Hiệp, Người Sói) với skin N thì khung thật sự vẽ ra canvas (chặn drawImage)
 * là khung sprite của skin N, skin 0 thì vẫn khung skin 0.
 */
const PW = process.env.PLAYWRIGHT_PATH || '/home/bui-thanh-thuong/.cache/pw-node/node_modules/playwright-core';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = (process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html') + '?quick=1&themes=forest,castle,volcano';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-skins2');
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
const ready = p => p.waitForFunction(() => window.SK && SK.lobby && SK.lobby.state && SK.lobby.state().ready && SK_GAME.state === 'lobby', null, { timeout: 15000 });
async function boot(profile, fresh) {
  const ctx = await browser.newContext({ viewport: { width: 1386, height: 640 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  p.on('response', r => { if (r.status() >= 400 && !/fonts\.(googleapis|gstatic)/.test(r.url())) errs.push('http ' + r.status() + ' ' + r.url()); });
  if (profile) await p.addInitScript(prof => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('sk.profile.v1', JSON.stringify(prof)); sessionStorage.setItem('seeded', '1'); } }, profile);
  await p.goto(URL);
  await ready(p);
  await p.evaluate(() => document.fonts.ready);
  await sleep(300);
  void fresh;
  return p;
}
async function reload(p) { await p.goto(URL); await ready(p); await sleep(300); }
const st = p => p.evaluate(() => SK.lobby.state());
const prof = p => p.evaluate(() => JSON.parse(localStorage.getItem('sk.profile.v1')));
async function tap(p, q) {
  const r = await p.evaluate(x => SK.lobby.rect(x), q);
  if (!r) throw new Error('node not shown: ' + q);
  await p.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
  await sleep(150);
}
const dlg = p => p.evaluate(() => document.getElementById('hs-modal').hidden ? null : document.getElementById('hs-dlg').innerText);
const T = t => (t || '').replace(/\n/g, ' | ').slice(0, 200);
const shot = (p, n) => p.screenshot({ path: path.join(SHOTS, n + '.png'), timeout: 15000 }).catch(() => {});
async function closeDlg(p) { if (await dlg(p)) { await p.click('#hs-close, .hs-btns button:last-child').catch(() => {}); await sleep(150); } }

const SEED = { gems: 3000, fish: 40, welcomed: 1, won: { knight: 1 }, unlocked: ['knight', 'ranger', 'werewolf'], skinOwn: {} };

(async () => {
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    // ============ 1. dữ liệu giá
    let p = await boot(SEED);
    const d = await p.evaluate(() => {
      const E = SK_SKIN_ECON, kinds = {}, miss = [];
      let n = 0;
      for (const h of Object.keys(SK_SKINS)) for (const [k] of SK_SKINS[h].skins) {
        const sk = +k.slice(1), pr = SK.skin2.price(h, sk); n++;
        kinds[pr.kind] = (kinds[pr.kind] || 0) + 1;
        if (pr.kind === 'gems' && !(pr.amount > 0)) miss.push(h + sk);
        if (pr.kind === 'lock' && !pr.how) miss.push(h + sk);
        if (!E[h] || !E[h][sk]) miss.push('econ ' + h + sk);
      }
      return { n, kinds, miss, k1: SK.skin2.price('knight', 1), k3: SK.skin2.price('knight', 3), k5: SK.skin2.price('knight', 5), k12: SK.skin2.price('knight', 12),
        k20: SK.skin2.price('knight', 20), k0: SK.skin2.price('knight', 0) };
    });
    check('giá có cho đủ ' + d.n + ' skin; không skin nào thiếu giá / cách mở', d.n === 740 && d.miss.length === 0, d.n + ' skin · ' + JSON.stringify(d.kinds) + ' · ' + d.miss.slice(0, 4).join(' '));
    check('số mẫu khớp wiki: Hiệp Sĩ Tinh Anh 2000 đá, Shiba 5000, Lõi Tụ Biến 12000, skin 12 = 30 Cá Khô, skin Mảnh = khoá, skin 0 miễn phí',
      d.k1.kind === 'gems' && d.k1.amount === 2000 && d.k3.amount === 5000 && d.k5.amount === 12000 && d.k12.kind === 'fish' && d.k12.amount === 30 && d.k20.kind === 'lock' && d.k0.kind === 'free', JSON.stringify([d.k1, d.k3, d.k5, d.k12, d.k20]));

    // ============ 2. mua / khoá trên thanh trượt
    let s = await st(p);
    check('hồ sơ mới: chỉ skin 0 và skin miễn phí (Hiệp Sĩ Dung Nham) đã mở, skin 1 chưa', s.skin === 0 && s.owned.join() === '0,2' && s.focus === null, JSON.stringify(s.owned));
    await tap(p, 'skin:1');
    s = await st(p);
    const pf1 = await prof(p);
    check('bấm ô skin khoá: không chọn (skin vẫn 0), thanh trượt dừng ở skin đó và hiện nút Mở khoá', s.skin === 0 && s.focus === 1 && s.unlockShown && !(pf1.skin && pf1.skin.knight), 'focus ' + s.focus + ' skin ' + s.skin);
    const sel = await p.evaluate(() => SK.lobby.selectSkin(1, true));
    check('selectSkin(skin khoá) trả false và không đổi skin đang dùng', sel === false && (await st(p)).skin === 0);
    await shot(p, 'locked-skin');
    await tap(p, 'mask_down/center_buttons/btn_unlock');
    let t = await dlg(p);
    check('nút Mở khoá mở hộp thoại: tên skin, giá 2.000 đá, số đá đang có', t && /Kỵ Sĩ Tinh Anh/.test(t) && /2\.000/.test(t) && /3\.000/.test(t), T(t));
    await shot(p, 'buy-dialog');
    await p.click('#hs-buy');
    await sleep(250);
    s = await st(p);
    let pf = await prof(p);
    check('mua skin 2000 đá: trừ đúng (3000 → 1000), skin được chọn, lưu vào hồ sơ', pf.gems === 1000 && s.skin === 1 && s.focus === null && pf.skin.knight === 1 && pf.skinOwn.knight.includes(1), 'đá ' + pf.gems + ' skin ' + s.skin);
    await closeDlg(p);
    await reload(p);
    s = await st(p); pf = await prof(p);
    check('tải lại trang: skin đã mua còn, vẫn mở, đá giữ nguyên', s.skin === 1 && s.owned.includes(1) && pf.gems === 1000, 'skin ' + s.skin + ' đá ' + pf.gems);
    await p.evaluate(() => SK.lobby.selectSkin(0, true));
    check('chọn lại skin 0 rồi skin 1 đã mua: không cần mua lại', (await p.evaluate(() => SK.lobby.selectSkin(1, true))) === true && (await prof(p)).gems === 1000);

    // thiếu đá
    await p.evaluate(() => SK.lobby.selectSkin(5, true));
    await tap(p, 'mask_down/center_buttons/btn_unlock');
    t = await dlg(p);
    const dis = await p.evaluate(() => { const b = document.getElementById('hs-buy'); return !!(b && b.disabled); });
    check('skin 12000 đá khi chỉ có 1000: hộp thoại báo thiếu và nút Mua bị khoá', t && /Không đủ đá quý/.test(t) && /11\.000/.test(t) && dis, T(t));
    await closeDlg(p);
    pf = await prof(p);
    check('thiếu đá: không mở, skin đang dùng giữ nguyên, đá không đổi', pf.gems === 1000 && pf.skin.knight === 1 && !(pf.skinOwn.knight || []).includes(5));

    // Cá Khô
    await p.evaluate(() => SK.lobby.selectSkin(12, true));
    await tap(p, 'mask_down/center_buttons/btn_unlock');
    t = await dlg(p);
    check('skin 30 Cá Khô: hộp thoại nêu Cá Khô đang có (40)', t && /30 Cá Khô/.test(t) && /40 Cá Khô/.test(t), T(t));
    await p.click('#hs-buy');
    await sleep(250);
    pf = await prof(p);
    check('mua bằng Cá Khô: trừ 30 (40 → 10), đá không đổi, skin được chọn', pf.fish === 10 && pf.gems === 1000 && pf.skin.knight === 12 && pf.skinOwn.knight.includes(12), 'cá ' + pf.fish + ' đá ' + pf.gems);
    await closeDlg(p);

    // khoá không bán
    await p.evaluate(() => SK.lobby.selectSkin(1, true));
    await p.evaluate(() => SK.lobby.selectSkin(20, true));
    s = await st(p);
    await tap(p, 'mask_down/center_buttons/btn_unlock');
    t = await dlg(p);
    pf = await prof(p);
    check('skin chỉ có ở sự kiện / mảnh skin: hiện khoá kèm cách mở, không bán, không trừ gì', t && /không bán/.test(t) && /Cách mở/.test(t) && !/Mua/.test(t) && s.focus === 20 && pf.gems === 1000 && pf.fish === 10 && pf.skin.knight === 1, T(t));
    await shot(p, 'lock-howto');
    await closeDlg(p);

    // tiền thật = thanh toán giả
    await p.evaluate(() => SK.lobby.selectSkin(6, true));
    await tap(p, 'mask_down/center_buttons/btn_unlock');
    t = await dlg(p);
    check('skin bán bằng tiền thật: thanh toán giả lập, không trừ đá', t && /Thanh toán giả lập/.test(t) && /\$/.test(t), T(t));
    await closeDlg(p);

    // hồ sơ cũ (chưa có skinOwn) giữ skin đang chọn
    const old = await boot({ gems: 100, welcomed: 1, unlocked: ['knight'], skin: { knight: 3 } });
    const so = await old.evaluate(() => ({ skin: SK.lobby.state().skin, own: SK.profile.skinOwned('knight', 3) }));
    check('hồ sơ cũ có skin chọn sẵn (chưa có danh sách mở): giữ skin đó, không bị mất', so.skin === 3 && so.own, JSON.stringify(so));
    await old.context().close();
    await p.context().close();

    // ============ 3. kỹ năng đổi dáng vẽ khung của skin
    for (const [hero, skinN] of [['ranger', 10], ['werewolf', 3]]) {
      p = await boot(Object.assign({}, SEED, { gems: 0, fish: 0, skinOwn: { [hero]: [skinN] }, skin: { [hero]: skinN } }));
      await p.evaluate(h => SK.loadPack(h), hero);
      await until(p, h => !!SK_DATA.heroes[h].s10 || !!SK_DATA.heroes[h].s3, hero, 8000);
      const fxInfo = await p.evaluate(([h, n]) => {
        const e = SK.heroSkin(h, n), fx = e && e.fx || {};
        const k0 = Object.keys(fx).filter(k => /_0_skill_/.test(k) && !/~/.test(k));
        return { loaded: !!e && e !== SK_DATA.heroes[h].s0, nfx: k0.length, k0: k0.slice(0, 3), t: k0.slice(0, 3).map(k => fx[k]), frames: k0.slice(0, 3).map(k => !!SK.A.f[fx[k]]) };
      }, [hero, skinN]);
      check(hero + ' skin ' + skinN + ': gói nạp có bảng khung kỹ năng riêng, mọi khung có trong atlas', fxInfo.loaded && fxInfo.nfx >= 2 && fxInfo.frames.every(Boolean), JSON.stringify(fxInfo));
      // chặn drawImage: ghi (trang, x, y, w, h) của mọi lần vẽ từ atlas
      const run = async (skinSel) => {
        await p.evaluate(([h, n]) => { const P = JSON.parse(localStorage.getItem('sk.profile.v1')); if (n) P.skin[h] = n; else delete P.skin[h]; localStorage.setItem('sk.profile.v1', JSON.stringify(P)); }, [hero, skinSel]);
        await reload(p);
        await p.evaluate(h => SK.loadPack(h), hero);
        await until(p, ([h, n]) => !n || !!SK_DATA.heroes[h]['s' + n], [hero, skinSel], 8000);
        // thử từng ô kỹ năng tới khi kỹ năng đổi dáng (swapAnims -> _animsOrig)
        let found = null;
        for (let slot = 0; slot < 3 && !found; slot++) {
          if (slot > 0) { await reload(p); await p.evaluate(h => SK.loadPack(h), hero); await until(p, ([h, n]) => !n || !!SK_DATA.heroes[h]['s' + n], [hero, skinSel], 8000); }
          await p.evaluate(([h, sl]) => { SK_GAME.debug.seed(20260929); SK.setSkillSlot(h, sl); SK.startRun(h); SK_GAME.debug.god(true); SK_GAME.debug.pet(false); }, [hero, slot]);
          await until(p, () => SK_GAME.state === 'stage' && !!SK.G.player, null, 6000);
          await sleep(500);
          await p.evaluate(() => {
            window._dr = []; const o = CanvasRenderingContext2D.prototype.drawImage;
            if (!CanvasRenderingContext2D.prototype._o) { CanvasRenderingContext2D.prototype._o = o; CanvasRenderingContext2D.prototype.drawImage = function (im, sx, sy, sw, sh) { if (arguments.length >= 9 && window._dr) window._dr.push([SK.pages.indexOf(im), sx, sy, sw, sh]); return o.apply(this, arguments); }; }
            SK.skin2.trace(true);
          });
          await p.keyboard.down('KeyK'); await sleep(60); await p.keyboard.up('KeyK');
          // đợi dáng đổi (swapAnims) — lăn của Du Hiệp chỉ kéo dài chừng nửa giây
          for (let i = 0; i < 40 && !found; i++) {
            const idle = await p.evaluate(() => { const q = SK.G.player; if (!q._animsOrig) return null; const A = SK.anim(q.anims.idle); return A && A.f.slice(0, 4); });
            if (idle && idle.some(f => /_0_skill_/.test(f))) found = { slot, idle };
            else await sleep(25);
          }
          if (found) await sleep(250);
        }
        if (!found) return null;
        await sleep(600);
        const r = await p.evaluate(() => {
          const logged = window._dr.slice(), lg = SK.skin2.log, A = SK.A.f;
          const rectOf = nm => A[nm] && [SK.pages.indexOf(SK.pages[A[nm][0]]), A[nm][1], A[nm][2], A[nm][3], A[nm][4]];
          const eq = (a, b) => a && b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3] && a[4] === b[4];
          const sig = Object.keys(A).filter(k => /^(ranger|werewolf)_0_skill_0_effect_0_\d+$/.test(k));
          const base = sig.map(rectOf);
          return { n: logged.length, hits: lg.hits, names: lg.names.slice(0, 6), base0: sig.some((k, i) => logged.some(l => eq(l, base[i]))),
            skinFrames: lg.names.filter(nm => A[nm]).map(nm => ({ nm, drawn: logged.some(l => eq(l, rectOf(nm))) })) };
        });
        await shot(p, hero + '-skin' + skinSel + '-pose');
        return Object.assign({ slot: found.slot, idle: found.idle }, r);
      };
      const rN = await run(skinN);
      check(hero + ' dùng kỹ năng đổi dáng với skin ' + skinN + ': khung vẽ ra canvas là khung của skin ' + skinN + ' (tên ' + (rN && rN.names[0]) + '), không phải skin 0',
        rN && rN.skinFrames.length >= 1 && rN.skinFrames.every(f => /_\d+_skill_/.test(f.nm) && f.nm.indexOf('_0_skill_') < 0 && f.drawn) && !rN.base0, JSON.stringify(rN && { slot: rN.slot, hits: rN.hits, names: rN.names, frames: rN.skinFrames, base0: rN.base0 }));
      const r0 = await run(0);
      check(hero + ' cùng kỹ năng với skin 0: vẫn vẽ khung skin 0 (không đổi tên)', r0 && r0.hits === 0 && r0.base0, JSON.stringify(r0 && { slot: r0.slot, hits: r0.hits, base0: r0.base0 }));
      await p.context().close();
    }
  } catch (e) {
    check('chạy trọn', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | '));
  } finally {
    if (browser) await browser.close();
  }
  const real = errs.filter(e => !/favicon|ERR_FAILED|net::/.test(e));
  check('không lỗi trang / console / http', real.length === 0, real.slice(0, 3).join(' | '));
  console.log(out.join('\n'));
  console.log('  ĐẠT ' + pass + '   HỎNG ' + fail);
  process.exit(fail ? 1 : 0);
})();
