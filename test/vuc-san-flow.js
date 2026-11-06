/*
 * Vực Săn: điều khiển cảm ứng và bố cục HUD trong một trận thật (không phải phòng thử).
 *   844x390 hasTouch + isMobile, phe thợ lặn: sảnh → chạm TÌM TRẬN → trận; lái bằng ngón thật qua CDP Input.dispatchTouchEvent (đa chạm):
 *     cần trái đẩy hết cỡ thì bơi và boost; cần phải kéo rồi nhả thì bắn xiên đúng hướng kéo, cùng lúc với đang bơi;
 *     nút Kỹ năng đặt hồi chiêu đúng SKILL_DATA[id].cd; nút Đèn đổi me.light; nút Tương tác giữ thì interactHeld
 *   844x390 phe cá mập: cần phải nhả thì cá mập lao (lunge), không có nút Đèn / Tương tác
 *   1366x650 chuột và phím, không cảm ứng: điều khiển ảo không hiện
 *   cả ba: không khối HUD nào đè nhau (kể cả cần ngắm mờ), nút ≥ 44 px, mũi tên mép màn (khoang, đồng đội gục) không đè khối nào
 *   và nằm trọn trong màn kể cả khi dịch nhân vật tới các góc; elementFromPoint giữa vùng chơi vẫn là CANVAS
 *   không pageerror, console error, requestfailed, response >= 400
 * Chạy: node test/vuc-san-flow.js   (VS_SHOTS=<thư mục> giữ ảnh; VS_URL=<gốc> chạy trên Pages)
 */
'use strict';
const T = require('./vuc-san-lib');

const BLOCKS = '.vs-hud-top, .vs-o2, .vs-shark, .vs-skill, .vs-tbtn, .vs-stick, .vs-hud-toast, .vs-state, .vs-intro';

const rects = (page) => page.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => {
  const r = e.getBoundingClientRect();
  return { name: (e.className.baseVal || e.className).split(' ').slice(0, 2).join('.'), l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
}).filter((x) => x.w > 1 && x.h > 1), BLOCKS);
const arrowRects = (page) => page.evaluate(() => [...document.querySelectorAll('.vs-arrow:not([hidden])')].map((e) => {
  const q = (n) => { const r = e.querySelector(n).getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
  return { cls: e.className, pt: q('.pt'), lbl: q('b'), text: e.querySelector('b').textContent };
}));
const hit = (a, b) => a.r > b.l && a.l < b.r && a.b > b.t && a.t < b.b;
const overlaps = (list) => {
  const bad = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (hit(list[i], list[j])) bad.push(list[i].name + ' x ' + list[j].name);
  return bad;
};
const info = (page) => page.evaluate(() => {
  const m = VS_DEBUG.match(), me = m.actors[VS.state.viewer.id];
  return { t: m.t, phase: m.phase, mapId: m.mapId, me: { id: me.id, team: me.team, st: me.st, x: me.x, y: me.y, light: me.light, o2: me.o2, skill: me.skill && { id: me.skill.id, cd: me.skill.cd },
    it: { mx: me.intent.mx, my: me.intent.my, boost: me.intent.boost, aimX: me.intent.aimX, aimY: me.intent.aimY, interactHeld: me.intent.interactHeld } } };
});
const waitSim = (page, sec, t0) => page.waitForFunction(([s, t0]) => VS_DEBUG.match().t >= t0 + s, [sec, t0 == null ? null : t0], { timeout: 60000 });

// ngón thật qua CDP: pts = [{ id, x, y }]; touchStart / touchMove nhận mọi ngón đang chạm, touchEnd nhận đúng những ngón nhả ([] = nhả hết)
async function touch(cdp, type, pts) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 4, radiusY: 4, force: 1 })) });
}
const centerOf = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }, sel);

// bố cục: không khối nào đè nhau, mũi tên không đè khối nào và nằm trong màn
async function layout(page, P, vp, label) {
  const bl = await rects(page), ar = await arrowRects(page);
  T.check(P + label + ': không khối HUD nào đè nhau', overlaps(bl).length === 0, overlaps(bl).join(' | ') || bl.length + ' khối: ' + bl.map((b) => b.name).join(','));
  const bad = [];
  ar.forEach((a) => {
    [['mũi', a.pt], ['nhãn ' + a.text, a.lbl]].forEach(([n, r]) => {
      bl.forEach((b) => { if (hit({ l: r.l, t: r.t, r: r.r, b: r.b }, b)) bad.push(n + ' đè ' + b.name); });
      if (r.l < -0.5 || r.t < -0.5 || r.r > vp.width + 0.5 || r.b > vp.height + 0.5) bad.push(n + ' ra ngoài màn');
    });
  });
  T.check(P + label + ': ' + ar.length + ' mũi tên mép màn không đè khối HUD nào và nằm trong màn', bad.length === 0, bad.slice(0, 3).join(' | ') || 'sạch');
  return { blocks: bl, arrows: ar };
}

async function enterMatch(page, P, touchMode, team) {
  await page.waitForFunction(() => window.__ready && VS.lobby.screen() === 'lobby', null, { timeout: 60000 });
  if (team === 'shark') {
    await (touchMode ? page.tap('.vs-side-shark') : page.click('.vs-side-shark'));
    await page.waitForFunction(() => document.querySelector('.vs-side-shark').classList.contains('on'));
  }
  await (touchMode ? page.tap('[data-act=find]') : page.click('[data-act=find]'));
  await page.waitForFunction(() => VS.state.mode === 'match', null, { timeout: 90000 });
  await page.waitForFunction(() => VS_DEBUG.match().phase === 'play', null, { timeout: 30000 });
  const s = await info(page);
  T.check(P + 'vào trận phe ' + team + ' bằng ' + (touchMode ? 'chạm' : 'chuột'), s.me.team === team && s.me.st === 'swim', JSON.stringify([s.me.team, s.me.st, s.mapId]));
  return s;
}

async function middleIsCanvas(page, P) {
  const tags = await page.evaluate(() => [[0.5, 0.5], [0.3, 0.3], [0.62, 0.35], [0.4, 0.7]].map(([fx, fy]) => { const el = document.elementFromPoint(innerWidth * fx, innerHeight * fy); return el && el.tagName; }));
  T.check(P + 'elementFromPoint giữa vùng chơi vẫn trúng CANVAS (HUD không nuốt cú chạm)', tags.every((x) => x === 'CANVAS'), tags.join(','));
}

// dịch nhân vật tới các góc bản đồ để mũi tên khoang / đồng đội gục bật ra ở nhiều mép; mỗi chỗ kiểm lại bố cục
async function arrowStress(page, P, vp) {
  const s0 = await info(page);
  const spots = await page.evaluate(() => {
    const b = HX_ZONES[VS_DEBUG.match().mapId].bounds, w = b.maxX - b.minX, h = b.maxY - b.minY;
    return [[0.1, 0.5], [0.9, 0.5], [0.5, 0.15], [0.5, 0.85], [0.1, 0.15], [0.9, 0.85]].map(([fx, fy]) => ({ x: b.minX + w * fx, y: b.minY + h * fy }));
  });
  // một đồng đội gục ở xa để có nhãn tên dài
  await page.evaluate((id) => { const m = VS_DEBUG.match(), mate = m.actors[id].team === 'diver' ? m.actors.filter((a) => a.team === 'diver' && a.id !== id)[0] : null; if (mate) { mate.st = 'down'; mate.name = 'Đồng đội Gục Rất Dài'; VS_DEBUG.teleport(mate.id, m.actors[id].x + 60, m.actors[id].y + 30); } }, s0.me.id);
  let seen = 0, worst = 0;
  for (const sp of spots) {
    await page.evaluate(([id, x, y]) => { VS_DEBUG.teleport(id, x, y); }, [s0.me.id, sp.x, sp.y]);
    await page.waitForTimeout(700);
    const bl = await rects(page), ar = await arrowRects(page);
    seen += ar.length;
    ar.forEach((a) => [a.pt, a.lbl].forEach((r) => {
      bl.forEach((b) => { if (hit({ l: r.l, t: r.t, r: r.r, b: r.b }, b)) { worst++; console.log('    ' + a.text + ' đè ' + b.name + ' tại ' + JSON.stringify(sp)); } });
      if (r.l < -0.5 || r.t < -0.5 || r.r > vp.width + 0.5 || r.b > vp.height + 0.5) { worst++; console.log('    ' + a.text + ' ra ngoài màn tại ' + JSON.stringify(sp)); }
    }));
  }
  T.check(P + 'dịch nhân vật tới 6 góc bản đồ: ' + seen + ' lần mũi tên bật ra, không lần nào đè khối HUD hay tràn màn', seen >= 6 && worst === 0, 'mũi tên ' + seen + ', vi phạm ' + worst);
  await page.evaluate(([id, x, y]) => { VS_DEBUG.teleport(id, x, y); const m = VS_DEBUG.match(); m.actors.forEach((a) => { if (a.st === 'down') a.st = 'swim'; }); }, [s0.me.id, s0.me.x, s0.me.y]);
}

async function touchDiver(br, base, vp) {
  const P = '[' + vp.width + 'x' + vp.height + ' cảm ứng thợ lặn] ';
  console.log(P + 'sảnh → trận → cần bơi, cần ngắm, nút');
  const { page, ctx, problems } = await T.open(br, base, 'index.html', vp, { hasTouch: true, isMobile: true });
  const cdp = await ctx.newCDPSession(page);
  const s0 = await enterMatch(page, P, true, 'diver');
  const ui = await page.evaluate(() => ({ on: VS.input.touch.enabled(), cls: document.querySelector('.vs-hud').className, hidden: document.querySelector('.vs-tc').hidden }));
  T.check(P + 'điều khiển ảo hiện (input.touch.enabled, lớp touch, .vs-tc không ẩn)', ui.on && /touch/.test(ui.cls) && !ui.hidden, JSON.stringify(ui));
  const sizes = await page.evaluate(() => ['.vs-skill', '.vs-tbtn.light', '.vs-tbtn.act'].map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [s, Math.round(r.width), Math.round(r.height)]; }));
  T.check(P + 'ba nút Kỹ năng, Đèn, Tương tác đều ≥ 44 px', sizes.every((x) => x[1] >= 44 && x[2] >= 44), JSON.stringify(sizes));
  await middleIsCanvas(page, P);
  await layout(page, P, vp, 'lúc đứng yên');
  await T.shot(page, 'flow-touch-diver-idle');

  // --- cần trái + cần phải cùng lúc ---
  const L0 = { id: 1, x: 130, y: 280 }, R0 = { id: 2, x: 640, y: 200 };
  await touch(cdp, 'touchStart', [L0]);
  await touch(cdp, 'touchMove', [{ id: 1, x: 130 + 90, y: 280 }]);          // đẩy sang phải quá bán kính: boost
  const t0 = (await info(page)).t, x0 = (await info(page)).me;
  await waitSim(page, 0.4, t0);
  const mid = await info(page);
  T.check(P + 'cần trái đẩy hết cỡ: mx ≈ 1, my ≈ 0, boost bật', mid.me.it.mx > 0.95 && Math.abs(mid.me.it.my) < 0.1 && mid.me.it.boost === true, JSON.stringify(mid.me.it));
  await T.shot(page, 'flow-touch-diver-stick');
  // vừa bơi vừa kéo cần phải lên trên-phải rồi nhả: bắn xiên theo hướng kéo
  await touch(cdp, 'touchStart', [{ id: 1, x: 130 + 90, y: 280 }, R0]);
  await touch(cdp, 'touchMove', [{ id: 1, x: 130 + 90, y: 280 }, { id: 2, x: R0.x + 50, y: R0.y - 50 }]);
  await waitSim(page, 0.2, (await info(page)).t);
  const aimed = await info(page);
  const dirOk = aimed.me.it.aimX > aimed.me.x && aimed.me.it.aimY > aimed.me.y;
  T.check(P + 'kéo cần phải lên trên-phải thì hướng ngắm của nhân vật hướng lên trên-phải (đèn pin và xiên theo)', dirOk, 'ngắm ' + aimed.me.it.aimX.toFixed(1) + ',' + aimed.me.it.aimY.toFixed(1) + ' so với ' + aimed.me.x.toFixed(1) + ',' + aimed.me.y.toFixed(1));
  await T.shot(page, 'flow-touch-diver-aim');
  await touch(cdp, 'touchEnd', [{ id: 2, x: R0.x + 50, y: R0.y - 50 }]);   // nhả ngón phải, ngón trái còn giữ
  const fired = await page.waitForFunction((id) => VS_DEBUG.match().projs.filter((p) => p.owner === id && p.kind === 'harpoon').map((p) => [p.vx, p.vy])[0] || false, s0.me.id, { timeout: 8000 }).then((h) => h.jsonValue(), () => false);
  T.check(P + 'nhả cần phải khi đang bơi: ra mũi xiên bay lên trên-phải (vx > 0, vy > 0)', !!fired && fired[0] > 0 && fired[1] > 0, JSON.stringify(fired));
  const afterFire = await info(page);
  await waitSim(page, 0.6, afterFire.t);
  const swum = await info(page);
  const d = Math.hypot(swum.me.x - x0.x, swum.me.y - x0.y);
  T.check(P + 'ngón trái giữ suốt: nhân vật vẫn bơi sang phải > 1 m theo giờ trận (bơi và bắn cùng lúc)', swum.me.x - x0.x > 1 && d > 1, 'bơi ' + d.toFixed(2) + ' m trong ' + (swum.t - t0).toFixed(2) + ' s trận');
  const stillHeld = await page.evaluate(() => VS_DEBUG.match().actors[VS.state.viewer.id].intent.mx > 0.9);
  T.check(P + 'ngón phải nhả rồi mà ngón trái vẫn giữ thì vẫn đang bơi (mx > 0,9)', stillHeld);
  await touch(cdp, 'touchEnd', [{ id: 1, x: 130 + 90, y: 280 }]);
  // intent cập nhật mỗi bước; đợi một nhịp
  await page.waitForTimeout(300);
  const stop2 = await page.evaluate(() => { const it = VS_DEBUG.match().actors[VS.state.viewer.id].intent; return [it.mx, it.my, it.boost]; });
  T.check(P + 'nhả cần trái thì ngừng bơi (mx = my = 0, hết boost)', stop2[0] === 0 && stop2[1] === 0 && stop2[2] === false, JSON.stringify(stop2));

  // --- chạm nhanh vào vùng ngắm cũng bắn ---
  const tapId = (await info(page)).me.id;
  await waitSim(page, 1.6, (await info(page)).t);
  const old = await page.evaluate(() => VS_DEBUG.match().projs.map((p) => p.id));
  await page.touchscreen.tap(650, 160);
  const tapFired = await page.waitForFunction(([id, old]) => VS_DEBUG.match().projs.some((p) => p.owner === id && old.indexOf(p.id) < 0), [tapId, old], { timeout: 8000 }).then(() => true, () => false);
  T.check(P + 'chạm nhanh không kéo trong vùng phải cũng bắn một mũi xiên mới', tapFired, old.length + ' đạn cũ');

  // --- nút Kỹ năng ---
  const sk = (await info(page)).me.skill, SD = await page.evaluate((id) => VS.SKILL_DATA[id], sk.id);
  await page.waitForFunction((id) => VS_DEBUG.match().actors[id].skill.cd <= 0, tapId, { timeout: 5000 }).catch(() => {});
  const c = await centerOf(page, '.vs-skill'), tBefore = (await info(page)).t;
  await page.touchscreen.tap(c.x, c.y);
  const cdSet = await page.waitForFunction((id) => VS_DEBUG.match().actors[id].skill.cd > 0, tapId, { timeout: 6000 }).then(() => true, () => false);
  const after = await info(page);
  const spent = after.t - tBefore;
  T.check(P + 'chạm nút Kỹ năng (' + sk.id + ') đặt hồi chiêu đúng SKILL_DATA.cd = ' + SD.cd, cdSet && after.me.skill.cd <= SD.cd && after.me.skill.cd >= SD.cd - spent - 0.1, 'cd = ' + after.me.skill.cd.toFixed(2) + ' sau ' + spent.toFixed(2) + ' s trận');
  const cdUi = await page.evaluate(() => ({ t: document.querySelector('.vs-skill .t').textContent, ready: document.querySelector('.vs-skill').classList.contains('ready') }));
  T.check(P + 'nút Kỹ năng hiện số giây hồi chiêu và hết sáng', /^\d+$/.test(cdUi.t) && !cdUi.ready, JSON.stringify(cdUi));

  // --- nút Đèn ---
  const l0 = (await info(page)).me.light, lc = await centerOf(page, '.vs-tbtn.light');
  await page.touchscreen.tap(lc.x, lc.y);
  await page.waitForFunction(([id, v]) => VS_DEBUG.match().actors[id].light !== v, [tapId, l0], { timeout: 6000 }).catch(() => {});
  const l1 = (await info(page)).me.light;
  await page.waitForTimeout(300);
  const lampCls = await page.evaluate(() => document.querySelector('.vs-tbtn.light').classList.contains('on'));
  T.check(P + 'chạm nút Đèn đổi me.light và nút sáng/tắt theo', l0 === true && l1 === false && lampCls === false, 'đèn ' + l0 + '→' + l1 + ', nút on = ' + lampCls);
  await T.shot(page, 'flow-touch-diver-light-off');
  await page.touchscreen.tap(lc.x, lc.y);
  await page.waitForFunction((id) => VS_DEBUG.match().actors[id].light === true, tapId, { timeout: 6000 }).catch(() => {});
  T.check(P + 'chạm nút Đèn lần nữa thì đèn bật lại', (await info(page)).me.light === true);

  // --- nút Tương tác: giữ ngón thì interactHeld ---
  const ac = await centerOf(page, '.vs-tbtn.act');
  await touch(cdp, 'touchStart', [{ id: 5, x: ac.x, y: ac.y }]);
  const held = await page.waitForFunction((id) => VS_DEBUG.match().actors[id].intent.interactHeld === true, tapId, { timeout: 6000 }).then(() => true, () => false);
  await touch(cdp, 'touchEnd', [{ id: 5, x: ac.x, y: ac.y }]);
  await page.waitForTimeout(300);
  const rel = await page.evaluate((id) => VS_DEBUG.match().actors[id].intent.interactHeld, tapId);
  T.check(P + 'giữ nút Tương tác thì interactHeld bật, nhả thì tắt', held && rel === false, 'giữ ' + held + ', nhả ' + rel);

  await layout(page, P, vp, 'giữa trận');
  await arrowStress(page, P, vp);
  await middleIsCanvas(page, P);
  await T.shot(page, 'flow-touch-diver-end');
  T.check(P + 'không pageerror, console error, requestfailed, response >= 400', problems.length === 0, problems.slice(0, 3).join(' | ') || 'sạch');
  await ctx.close();
}

async function touchShark(br, base, vp) {
  const P = '[' + vp.width + 'x' + vp.height + ' cảm ứng cá mập] ';
  console.log(P + 'sảnh → trận → cần phải lao cắn');
  const { page, ctx, problems } = await T.open(br, base, 'index.html', vp, { hasTouch: true, isMobile: true });
  const cdp = await ctx.newCDPSession(page);
  const s0 = await enterMatch(page, P, true, 'shark');
  const vis = await page.evaluate(() => ({ light: !!document.querySelector('.vs-tbtn.light').offsetParent, act: !!document.querySelector('.vs-tbtn.act').offsetParent, panel: !!document.querySelector('.vs-shark').offsetParent, skill: !!document.querySelector('.vs-skill').offsetParent }));
  T.check(P + 'phe cá mập: có bảng máu và nút Kỹ năng, không có nút Đèn và Tương tác', vis.panel && vis.skill && !vis.light && !vis.act, JSON.stringify(vis));
  await middleIsCanvas(page, P);
  await layout(page, P, vp, 'lúc đứng yên');
  await touch(cdp, 'touchStart', [{ id: 2, x: 640, y: 200 }]);
  await touch(cdp, 'touchMove', [{ id: 2, x: 640 + 60, y: 200 }]);
  await waitSim(page, 0.1, (await info(page)).t);
  await touch(cdp, 'touchEnd', [{ id: 2, x: 700, y: 200 }]);
  const lunged = await page.waitForFunction((id) => VS_DEBUG.match().actors[id].st === 'lunge', s0.me.id, { timeout: 6000 }).then(() => true, () => false);
  T.check(P + 'kéo cần phải sang phải rồi nhả thì cá mập lao cắn (st = lunge)', lunged);
  await T.shot(page, 'flow-touch-shark');
  await arrowStress(page, P, vp);
  T.check(P + 'không pageerror, console error, requestfailed, response >= 400', problems.length === 0, problems.slice(0, 3).join(' | ') || 'sạch');
  await ctx.close();
}

async function desktop(br, base, vp) {
  const P = '[' + vp.width + 'x' + vp.height + ' chuột phím] ';
  console.log(P + 'không cảm ứng thì không có điều khiển ảo');
  const { page, ctx, problems } = await T.open(br, base, 'index.html', vp);
  await enterMatch(page, P, false, 'diver');
  const ui = await page.evaluate(() => ({ on: VS.input.touch.enabled(), cls: document.querySelector('.vs-hud').className, vis: [...document.querySelectorAll('.vs-tc, .vs-stick, .vs-tbtn')].filter((e) => e.offsetParent !== null).length }));
  T.check(P + 'input.touch.enabled = false, không lớp touch, không cần hay nút ảo nào hiện', !ui.on && !/touch/.test(ui.cls) && ui.vis === 0, JSON.stringify(ui));
  await middleIsCanvas(page, P);
  await layout(page, P, vp, 'lúc đứng yên');
  await arrowStress(page, P, vp);
  await T.shot(page, 'flow-desktop');
  T.check(P + 'không pageerror, console error, requestfailed, response >= 400', problems.length === 0, problems.slice(0, 3).join(' | ') || 'sạch');
  await ctx.close();
}

async function main() {
  const srv = await T.serve();
  const br = await T.browser();
  try {
    await touchDiver(br, srv.base, { width: 844, height: 390 });
    await touchShark(br, srv.base, { width: 844, height: 390 });
    await desktop(br, srv.base, { width: 1366, height: 650 });
  } finally {
    await br.close();
    srv.close();
  }
  console.log('ảnh chụp: ' + T.SHOTS);
  T.done();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
