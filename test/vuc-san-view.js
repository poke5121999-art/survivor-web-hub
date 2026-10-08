/*
 * Vực Săn, lớp vẽ (nhánh W2): kiểm trên phòng thử games/vuc-san/tools/viewlab.html với trận giả (tools/fakematch.js),
 * ở hai cỡ màn 1366×650 và 844×390. Mọi số đo lấy trên ảnh chụp màn hình (sau mặt nạ, cả lớp DOM), ảnh lưu bằng shot().
 *   (a) mặt nạ đèn: điểm xa mọi vùng sáng ≥ 3 m tối hơn ít nhất 4 lần điểm nước thoáng trong nón đèn của người xem
 *   (b) cá mập đối thủ đặt ở chỗ canSee = false: khung của nó trùng từng điểm ảnh với lúc không có nó (đối chứng: bật
 *       allSeen vẽ nó ra thì khung phải khác); đặt ở chỗ canSee = true thì khung khác hẳn lúc không có nó
 *   (c) ?sharks=all: 12 loài nạp xong, không lỗi, đủ clip, ô nào cũng có hình cá
 *   (d) ?divers=all: 10 thợ lặn, màu trung bình của từng người khác nhau (10 bảng màu)
 *   (e) in renderer.info.render.calls, số texture, chương trình shader, thời gian vẽ (SwiftShader: chỉ là mốc)
 *   (f) không pageerror, console error, requestfailed, http >= 400
 *   thêm: (g) VS.input.read từ phím, chuột thật: hướng bơi, ngắm, phím một bước ra đúng một lần; (h) unloadMatch trả GPU,
 *   nạp lại được; (i) bị loại hẳn (hết lượt) thì camera theo đồng đội còn sống gần nhất; (j) đủ 6 bản đồ trong kho nạp
 *   và vẽ được; (k) VS.diverSheet.portrait cho ảnh chân dung đã đổi màu.
 * Chạy: node test/vuc-san-view.js   (VS_SHOTS=<thư mục> để giữ ảnh)
 */
'use strict';
const fs = require('fs');
const T = require('./vuc-san-lib');

const VIEWPORTS = [{ width: 1366, height: 650 }, { width: 844, height: 390 }];

// Hàm đo điểm ảnh nạp vào trang: ảnh là ImageData giải từ PNG chụp màn hình.
const PIX_JS = `window.__pix = {
  lum(img, x, y, r) {
    let s = 0, n = 0;
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const px = Math.max(0, Math.min(img.width - 1, x + i)), py = Math.max(0, Math.min(img.height - 1, y + j)), o = (py * img.width + px) * 4;
      s += 0.2126 * img.data[o] + 0.7152 * img.data[o + 1] + 0.0722 * img.data[o + 2]; n++;
    }
    return s / n;
  },
  clip(img, b) {
    return { x0: Math.max(0, Math.floor(b.x0)), y0: Math.max(0, Math.floor(b.y0)), x1: Math.min(img.width - 1, Math.ceil(b.x1)), y1: Math.min(img.height - 1, Math.ceil(b.y1)) };
  },
  // số điểm ảnh trong khung có kênh màu lệch nhau quá thr
  diff(a, b, box, thr) {
    const c = this.clip(a, box); let n = 0, tot = 0, max = 0;
    for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) {
      const o = (y * a.width + x) * 4, d = Math.max(Math.abs(a.data[o] - b.data[o]), Math.abs(a.data[o + 1] - b.data[o + 1]), Math.abs(a.data[o + 2] - b.data[o + 2]));
      tot++; if (d > thr) n++; if (d > max) max = d;
    }
    return { n, tot, frac: tot ? n / tot : 0, max };
  },
  // màu trung bình của những điểm ảnh khác nền (thân người), trong khung
  mean(a, bg, box, thr) {
    const c = this.clip(a, box); let r = 0, g = 0, b = 0, n = 0;
    for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) {
      const o = (y * a.width + x) * 4, d = Math.max(Math.abs(a.data[o] - bg.data[o]), Math.abs(a.data[o + 1] - bg.data[o + 1]), Math.abs(a.data[o + 2] - bg.data[o + 2]));
      if (d > thr) { r += a.data[o]; g += a.data[o + 1]; b += a.data[o + 2]; n++; }
    }
    return n ? { r: r / n, g: g / n, b: b / n, n } : { r: 0, g: 0, b: 0, n: 0 };
  },
};`;

async function openLab(br, base, query, vp) {
  const o = await T.open(br, base, 'tools/viewlab.html' + query, vp);
  // SwiftShader vẽ chậm: chụp màn hình và đánh giá được đợi lâu hơn mặc định 30 giây
  o.page.setDefaultTimeout(120000);
  await o.page.waitForFunction(() => window.VS_LAB && (VS_LAB.ready || VS_LAB.error), null, { timeout: 180000 });
  const err = await o.page.evaluate(() => VS_LAB.error);
  if (err) throw new Error('phòng thử lỗi: ' + err);
  await o.page.addScriptTag({ content: PIX_JS });
  return o;
}

// Đợi trình duyệt trình bày khung vừa vẽ rồi chụp; giải PNG trong trang thành window.__shots[key].
async function grab(page, name, key) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const f = await T.shot(page, name);
  const b64 = fs.readFileSync(f).toString('base64');
  await page.evaluate(async ([k, b]) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b;
    await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0);
    (window.__shots = window.__shots || {})[k] = x.getImageData(0, 0, c.width, c.height);
  }, [key || name, b64]);
  return f;
}

async function stats(page, label) {
  // thời gian vẽ: trung bình 20 khung vẽ đồng bộ (render + post), và nhịp requestAnimationFrame trong 1,5 giây
  const s = await page.evaluate(async () => {
    const n = 20, t0 = performance.now();
    for (let i = 0; i < n; i++) VS_LAB.frame(0);
    const js = (performance.now() - t0) / n;
    // mỗi nhịp rAF vẽ một khung thật (phòng thử đang dừng thì không tự vẽ)
    const frames = await new Promise((res) => { let k = 0; const t = performance.now(); (function f() { VS_LAB.frame(0); k++; if (performance.now() - t < 1500) requestAnimationFrame(f); else res({ k, ms: performance.now() - t }); })(); });
    const st = VS_LAB.stats(), info = VS.view.gfx.renderer.info;
    return { calls: st.calls, triangles: st.triangles, textures: info.memory.textures, geometries: info.memory.geometries, programs: st.programs, renderMs: +js.toFixed(1), rafMs: +(frames.ms / frames.k).toFixed(1) };
  });
  console.log('  (e) ' + label + ': renderer.info.render.calls=' + s.calls + ' triangles=' + s.triangles + ' textures=' + s.textures +
    ' geometries=' + s.geometries + ' programs=' + s.programs + ' · vẽ ' + s.renderMs + ' ms/khung, rAF ' + s.rafMs + ' ms (SwiftShader, chỉ là mốc)');
  return s;
}

async function maskAndSight(br, base, vp, tag, problemsAll) {
  console.log('Phòng thử trận giả ' + tag + ' (phe thợ lặn, A01 ban ngày)');
  const { page, problems, ctx } = await openLab(br, base, '?seed=7&t=14&pause=1', vp);
  problemsAll.push(['lab ' + tag, problems]);
  await page.evaluate(() => VS_LAB.frame(0));

  // (a) mặt nạ đèn
  const probe = await page.evaluate(() => VS_LAB.probe());
  T.check('(a) ' + tag + ' tìm được điểm trong nón đèn và điểm tối xa mọi vùng sáng', !!(probe.beam && probe.dark), JSON.stringify(probe));
  await grab(page, 'view-mask-' + tag, 'a');
  if (probe.beam && probe.dark) {
    const r = await page.evaluate((p) => ({ beam: __pix.lum(__shots.a, p.beam.px, p.beam.py, 2), dark: __pix.lum(__shots.a, p.dark.px, p.dark.py, 2) }), probe);
    const ratio = r.beam / Math.max(0.5, r.dark);
    T.check('(a) ' + tag + ' ngoài vùng sáng tối hơn ≥ 4 lần nước trong nón đèn', ratio >= 4,
      'sáng ' + r.beam.toFixed(1) + ' tại ' + probe.beam.px + ',' + probe.beam.py + ' (mặt nạ ' + probe.beam.mask.lit.toFixed(2) + ') / tối ' + r.dark.toFixed(1) +
      ' tại ' + probe.dark.px + ',' + probe.dark.py + ' (cách vùng sáng ' + probe.dark.polyDist + ' m) = ' + ratio.toFixed(2) + '×');
  }
  const ov = await page.evaluate(() => VS_LAB.overlays());
  T.check('(a) ' + tag + ' mũi tên mép màn đúng số khoang ngoài màn, dấu mờ đúng số món đã thấy đang trong tối',
    ov.arrows === ov.expArrows && ov.marks === ov.expMarks && ov.expArrows + ov.expMarks > 0, JSON.stringify(ov));

  // (b) cá mập Đầu Búa (id 5) là đối thủ; ghim người xem (id 0) với hướng ngắm cố định để nón đèn không đuổi theo cá
  const SH = 5;
  await page.evaluate(() => {
    const a = VS_LAB.m.actors[0];
    VS_LAB.place(0, a.x, a.y, { aim: a.face > 0 ? 0 : Math.PI, face: a.face });
    VS_LAB.frame(0);
  });
  const spots = await page.evaluate((id) => ({ dark: VS_LAB.findSpot(id, false), lit: VS_LAB.findSpot(id, true) }), SH);
  T.check('(b) ' + tag + ' có chỗ khuất (canSee false) và chỗ sáng (canSee true) cho cá mập', !!(spots.dark && spots.lit), JSON.stringify(spots));
  if (spots.dark && spots.lit) {
    // đặt ở chỗ khuất, cho clip quay đầu chạy xong (thời gian lớp vẽ chạy, trận giả vẫn dừng), rồi đóng băng
    const away = await page.evaluate(([id, p]) => {
      VS_LAB.place(id, p.x, p.y, { face: 1 });
      for (let i = 0; i < 6; i++) VS_LAB.frame(0.3);
      VS_LAB.allSeen(true); VS_LAB.frame(0);
      const me = VS_LAB.m.actors[0];
      return { box: VS_LAB.screenBox(id), drawn: VS_LAB.drawn(id), x: me.x, y: me.y - 80 };
    }, [SH, spots.dark]);
    await grab(page, 'view-control-' + tag, 'ctl');
    const hid = await page.evaluate((id) => { VS_LAB.allSeen(false); VS_LAB.frame(0); return { drawn: VS_LAB.drawn(id), canSee: VS_LAB.canSee(id) }; }, SH);
    await grab(page, 'view-hidden-' + tag, 'hid');
    await page.evaluate(([id, p]) => { VS_LAB.place(id, p.x, p.y, { face: 1 }); VS_LAB.frame(0); }, [SH, away]);
    await grab(page, 'view-noshark-' + tag, 'none');
    const d = await page.evaluate((b) => ({ hid: __pix.diff(__shots.hid, __shots.none, b, 2), ctl: __pix.diff(__shots.ctl, __shots.none, b, 2) }), away.box);
    const bx = away.box;
    T.check('(b) ' + tag + ' cá mập ở chỗ canSee = false không được vẽ: khung trùng từng điểm ảnh với lúc vắng nó',
      !hid.canSee && !hid.drawn && d.hid.n === 0,
      'canSee ' + hid.canSee + ', drawn ' + hid.drawn + ', khung ' + Math.round(bx.x1 - bx.x0) + '×' + Math.round(bx.y1 - bx.y0) + ' px, lệch ' + d.hid.n + '/' + d.hid.tot + ' (max ' + d.hid.max + ')');
    T.check('(b) ' + tag + ' đối chứng: ép vẽ (allSeen) thì cùng khung đó đổi điểm ảnh, nên phép đo trên bắt được cá mập tối',
      away.drawn && d.ctl.n > 50, 'lệch ' + d.ctl.n + '/' + d.ctl.tot + ' (max ' + d.ctl.max + ')');
    // chỗ sáng trong nón đèn
    const vis = await page.evaluate(([id, p]) => {
      VS_LAB.place(id, p.x, p.y, { face: 1 });
      for (let i = 0; i < 6; i++) VS_LAB.frame(0.3);
      VS_LAB.frame(0);
      return { box: VS_LAB.screenBox(id), drawn: VS_LAB.drawn(id), canSee: VS_LAB.canSee(id) };
    }, [SH, spots.lit]);
    await grab(page, 'view-visible-' + tag, 'vis');
    await page.evaluate(([id, p]) => { VS_LAB.place(id, p.x, p.y, { face: 1 }); VS_LAB.frame(0); }, [SH, away]);
    await grab(page, 'view-noshark2-' + tag, 'none2');
    const dv = await page.evaluate((b) => __pix.diff(__shots.vis, __shots.none2, b, 12), vis.box);
    T.check('(b) ' + tag + ' cá mập ở chỗ canSee = true được vẽ: khung khác hẳn lúc vắng nó', vis.canSee && vis.drawn && dv.frac > 0.12,
      'canSee ' + vis.canSee + ', drawn ' + vis.drawn + ', lệch ' + (dv.frac * 100).toFixed(1) + '% khung (' + dv.n + '/' + dv.tot + ')');
  }
  // (i) người xem bị loại khi đội hết lượt hồi sinh: camera theo đồng đội còn sống gần nhất; còn lượt thì ở lại
  const sp = await page.evaluate(() => {
    const m = VS_LAB.m, me = m.actors[0], keep = { st: me.st, tickets: m.tickets }, cam = VS.view.gfx.camera.position;
    me.st = 'out'; m.tickets = 0;
    let best = null, bd = 1e9;
    m.actors.forEach((a) => { if (a.team === 'diver' && a.id !== 0 && a.st !== 'out') { const d = Math.hypot(a.x - cam.x, a.y - cam.y); if (d < bd) { bd = d; best = a.id; } } });
    const gone = VS.view.focus(m, VS_LAB.viewer).id;
    VS.view.snapCamera(); VS_LAB.frame(0);
    const camAt = { x: VS.view.gfx.camera.position.x, y: VS.view.gfx.camera.position.y };
    m.tickets = 2;
    const waiting = VS.view.focus(m, VS_LAB.viewer).id;
    return { gone, best, waiting, camAt, keep };
  });
  await grab(page, 'view-spectate-' + tag, 'spec');
  await page.evaluate((k) => { const m = VS_LAB.m; m.actors[0].st = k.st; m.tickets = k.tickets; VS.view.snapCamera(); VS_LAB.frame(0); }, sp.keep);
  T.check('(i) ' + tag + ' bị loại hẳn: camera theo đồng đội còn sống gần nhất; còn lượt thì ở lại', sp.gone === sp.best && sp.best !== null && sp.waiting === 0,
    'hết lượt → ' + sp.gone + ' (gần nhất ' + sp.best + '), còn lượt → ' + sp.waiting);

  // (g) bàn phím, chuột thật qua Playwright rồi đọc VS.input.read như main.js
  const read = () => page.evaluate(() => VS.input.read(VS_LAB.m, VS_LAB.m.actors[0]));
  await page.mouse.move(vp.width * 0.7, vp.height * 0.42);
  const aim = await page.evaluate(() => ({ it: VS.input.read(VS_LAB.m, VS_LAB.m.actors[0]), w: VS.view.screenToWorld(innerWidth * 0.7, innerHeight * 0.42) }));
  await page.keyboard.down('KeyW'); await page.keyboard.down('KeyD'); await page.keyboard.down('ShiftLeft');
  const mv = await read();
  await page.keyboard.up('KeyW'); await page.keyboard.up('KeyD'); await page.keyboard.up('ShiftLeft');
  const still = await read();
  await page.keyboard.press('KeyF');
  const f1 = await read(), f2 = await read();
  await page.mouse.down();
  const c1 = await read(), c2 = await read();
  await page.mouse.up();
  const c3 = await read();
  await page.mouse.click(vp.width * 0.3, vp.height * 0.5, { button: 'right' });
  const r1 = await read(), r2 = await read();
  await page.keyboard.press('KeyQ');
  const q1 = await read(), q2 = await read();
  await page.keyboard.press('KeyE');
  const e1 = await read(), e2 = await read();
  const ctxBlocked = await page.evaluate(() => { const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); document.getElementById('gl').dispatchEvent(ev); return ev.defaultPrevented; });
  T.check('(g) ' + tag + ' ngắm theo chuột (screenToWorld), WASD chéo chuẩn hoá, Shift tăng tốc',
    Math.abs(aim.it.aimX - aim.w.x) < 0.05 && Math.abs(aim.it.aimY - aim.w.y) < 0.05 && Math.abs(mv.mx - Math.SQRT1_2) < 1e-6 && Math.abs(mv.my - Math.SQRT1_2) < 1e-6 &&
    mv.boost && still.mx === 0 && still.my === 0 && !still.boost,
    'aim ' + aim.it.aimX.toFixed(2) + ',' + aim.it.aimY.toFixed(2) + ' vs ' + aim.w.x.toFixed(2) + ',' + aim.w.y.toFixed(2) + ' · mx,my ' + mv.mx.toFixed(3) + ',' + mv.my.toFixed(3) + ' boost ' + mv.boost);
  T.check('(g) ' + tag + ' mỗi lần bấm F / chuột trái / chuột phải / Q / E ra đúng một lần, giữ chuột thì fireHeld',
    f1.light && !f2.light && c1.fire && c1.fireHeld && !c2.fire && c2.fireHeld && !c3.fireHeld && r1.skill && !r2.skill && q1.skill && !q2.skill && e1.interact && !e2.interact && ctxBlocked,
    JSON.stringify({ light: [f1.light, f2.light], fire: [c1.fire, c2.fire], held: [c1.fireHeld, c2.fireHeld, c3.fireHeld], right: [r1.skill, r2.skill], q: [q1.skill, q2.skill], e: [e1.interact, e2.interact], ctxBlocked }));

  await stats(page, 'trận giả ' + tag);
  await ctx.close();

  // phe cá mập: chỉ chụp và gom lỗi (mặt nạ sharkDark, thợ lặn lộ theo luật đèn hải đăng)
  const s = await openLab(br, base, '?seed=7&t=14&pause=1&team=shark', vp);
  problemsAll.push(['lab shark ' + tag, s.problems]);
  await s.page.evaluate(() => VS_LAB.frame(0));
  const seen = await s.page.evaluate(() => VS_LAB.m.actors.filter((a) => a.team === 'diver').map((a) => [a.id, VS_LAB.canSee(a.id), VS_LAB.drawn(a.id)]));
  T.check('(b) ' + tag + ' phe cá mập: thợ lặn được vẽ đúng khi canSee', seen.every((x) => x[1] === x[2] || !x[1] === !x[2]), JSON.stringify(seen));
  await grab(s.page, 'view-shark-team-' + tag, 'sh');
  // (h) dỡ trận trả GPU (lưới, ảnh, nhãn), nạp lại cùng trận vẫn vẽ được
  const mem = await s.page.evaluate(async () => {
    const info = VS.view.gfx.renderer.info.memory, g = VS.view.gfx;
    const before = { t: info.textures, g: info.geometries, kids: g.scene.children.length };
    VS.view.unloadMatch();
    const after = { t: info.textures, g: info.geometries, kids: g.scene.children.length, tags: document.querySelectorAll('.vs-hud-tag').length };
    await VS.view.loadMatch(VS_LAB.m);
    VS_LAB.frame(0);
    const again = { t: info.textures, g: info.geometries, drawn: VS_LAB.m.actors.filter((a) => VS_LAB.drawn(a.id)).length, calls: VS.view.stats().calls };
    return { before, after, again };
  });
  T.check('(h) ' + tag + ' unloadMatch trả ảnh và lưới GPU, gỡ nhãn; nạp lại vẽ được',
    mem.after.t < mem.before.t * 0.6 && mem.after.g < mem.before.g * 0.5 && mem.after.tags === 0 && mem.again.drawn >= 2 && mem.again.calls > 20, JSON.stringify(mem));
  await s.ctx.close();
}

async function sharkGrid(br, base, vp, tag, problemsAll) {
  console.log('Lưới 12 loài cá mập ' + tag);
  const { page, problems, ctx } = await openLab(br, base, '?sharks=all&pause=1', vp);
  problemsAll.push(['sharks ' + tag, problems]);
  // chạy kịch bản 4 giây (bơi, phóng, lao cắn, chết lệch pha theo loài) rồi đóng băng
  await page.evaluate(() => { for (let i = 0; i < 40; i++) VS_LAB.step(0.1); VS_LAB.frame(0); });
  const list = await page.evaluate(() => VS_LAB.sharks());
  const ok = list.filter((s) => s.loaded && !s.error && s.clips > 0);
  T.check('(c) ' + tag + ' 12 loài nạp xong, không lỗi, có clip', list.length === 12 && ok.length === 12,
    list.map((s) => s.defId.split('_')[0] + ':' + s.st + '/' + s.role + '(' + s.clips + ')').join(' '));
  const roles = new Set(list.map((s) => s.role));
  T.check('(c) ' + tag + ' lưới đang chạy đủ vai bơi / phóng / lao cắn / chết', ['swim', 'sprint', 'attack', 'die'].every((r) => roles.has(r)), [...roles].join(','));
  const boxes = await page.evaluate(() => VS_LAB.m.actors.map((a) => VS_LAB.screenBox(a.id)));
  await grab(page, 'view-sharks-' + tag, 'g');
  await page.evaluate(() => { VS_LAB.m.actors.forEach((a) => VS_LAB.place(a.id, a.x, a.y - 120)); VS_LAB.frame(0); });
  await grab(page, 'view-sharks-empty-' + tag, 'bg');
  const fr = await page.evaluate((bs) => bs.map((b) => __pix.diff(__shots.g, __shots.bg, b, 16).frac), boxes);
  T.check('(c) ' + tag + ' ô nào cũng có hình cá (≥ 3% khung khác nền)', fr.every((f) => f >= 0.03), fr.map((f) => (f * 100).toFixed(0) + '%').join(' '));
  await stats(page, 'lưới cá mập ' + tag);
  await ctx.close();
}

async function diverGrid(br, base, vp, tag, problemsAll) {
  console.log('Lưới 10 thợ lặn ' + tag);
  const { page, problems, ctx } = await openLab(br, base, '?divers=all&pause=1', vp);
  problemsAll.push(['divers ' + tag, problems]);
  await page.evaluate(() => VS_LAB.frame(0));
  const ids = await page.evaluate(() => VS_LAB.m.actors.map((a) => a.defId));
  const boxes = await page.evaluate(() => VS_LAB.m.actors.map((a) => VS_LAB.screenBox(a.id)));
  await grab(page, 'view-divers-' + tag, 'g');
  await page.evaluate(() => { VS_LAB.m.actors.forEach((a) => VS_LAB.place(a.id, a.x, a.y - 120)); VS_LAB.frame(0); });
  await grab(page, 'view-divers-empty-' + tag, 'bg');
  const means = await page.evaluate((bs) => bs.map((b) => __pix.mean(__shots.g, __shots.bg, b, 24)), boxes);
  let minD = 1e9, pair = '';
  for (let i = 0; i < means.length; i++) for (let j = i + 1; j < means.length; j++) {
    const a = means[i], b = means[j], d = Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
    if (d < minD) { minD = d; pair = ids[i] + '/' + ids[j]; }
  }
  // người cuối là Dave đối chứng (cùng bảng màu với người đầu): độ lệch của cặp này là nhiễu của phép đo
  const ctl = means.pop(), ctlId = ids.pop(), noise = Math.hypot(ctl.r - means[0].r, ctl.g - means[0].g, ctl.b - means[0].b);
  minD = 1e9;
  for (let i = 0; i < means.length; i++) for (let j = i + 1; j < means.length; j++) {
    const a = means[i], b = means[j], d = Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
    if (d < minD) { minD = d; pair = ids[i] + '/' + ids[j]; }
  }
  const need = Math.max(6, noise * 3);
  T.check('(d) ' + tag + ' đủ 10 thợ lặn (+ 1 đối chứng ' + ctlId + ') có hình', means.length === 10 && means.every((c) => c.n > 150) && ctl.n > 150, means.map((c) => c.n).join(' ') + ' + ' + ctl.n);
  T.check('(d) ' + tag + ' 10 bảng màu khác nhau: cặp gần nhất cách ≥ max(6, 3 × nhiễu đối chứng)', minD >= need,
    'nhỏ nhất ' + minD.toFixed(1) + ' (' + pair + '), nhiễu ' + noise.toFixed(1) + ', cần ' + need.toFixed(1) + ' · ' +
    ids.map((id, i) => id + ' ' + [means[i].r, means[i].g, means[i].b].map(Math.round).join(',')).join(' | '));
  // (k) chân dung cho sảnh: khung Idle đã đổi màu, đúng cỡ, khác chân dung Dave gốc
  const pr = await page.evaluate(async () => {
    const a = await VS.diverSheet.portrait('lan', 96), b = await VS.diverSheet.portrait('dave', 96);
    const da = a.getContext('2d').getImageData(0, 0, 96, 96).data, db = b.getContext('2d').getImageData(0, 0, 96, 96).data;
    let n = 0, diff = 0;
    for (let i = 0; i < da.length; i += 4) { if (da[i + 3] > 0) n++; if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 30) diff++; }
    return { w: a.width, h: a.height, opaque: n, diff };
  });
  T.check('(k) ' + tag + ' VS.diverSheet.portrait(id, 96): ảnh 96×96 có hình, khác Dave gốc', pr.w === 96 && pr.h === 96 && pr.opaque > 1500 && pr.diff > 300, JSON.stringify(pr));
  await stats(page, 'lưới thợ lặn ' + tag);
  await ctx.close();
}

// (j) mọi bản đồ trong kho: nạp glb, rong Spine, ánh sáng theo chủ đề, vẽ không lỗi
async function mapPool(br, base, vp, tag, problemsAll) {
  console.log('Kho bản đồ ' + tag);
  const ids = T.nodeSim(['data/maps.js']).VS.MAPS.map((x) => x.id + ':' + x.theme);
  for (const it of ids) {
    const [id, theme] = it.split(':');
    const { page, problems, ctx } = await openLab(br, base, '?map=' + id + '&pause=1&t=14', vp);
    problemsAll.push(['map ' + id + ' ' + tag, problems]);
    await page.evaluate(() => VS_LAB.frame(0));
    const st = await page.evaluate(() => Object.assign(VS_LAB.stats(), { spines: VS.view.debug.state().level.spines.length, theme: VS.view.debug.state().theme }));
    await grab(page, 'view-map-' + id + '-' + tag, 'map');
    T.check('(j) ' + tag + ' bản đồ ' + id + ' (' + theme + ') nạp và vẽ được', st.loaded && st.calls > 20 && st.theme === theme && problems.length === 0,
      'calls ' + st.calls + ', textures ' + st.textures + ', rong Spine ' + st.spines + ', chủ đề ' + st.theme);
    await ctx.close();
  }
}

async function main() {
  const srv = await T.serve();
  const br = await T.browser();
  const problemsAll = [];
  try {
    for (const vp of VIEWPORTS) {
      const tag = vp.width + 'x' + vp.height;
      await maskAndSight(br, srv.base, vp, tag, problemsAll);
      await sharkGrid(br, srv.base, vp, tag, problemsAll);
      await diverGrid(br, srv.base, vp, tag, problemsAll);
      if (vp === VIEWPORTS[0]) await mapPool(br, srv.base, vp, tag, problemsAll);
    }
  } finally {
    const bad = problemsAll.filter((p) => p[1].length);
    T.check('(f) không pageerror / console error / requestfailed / http >= 400 trên ' + problemsAll.length + ' trang', bad.length === 0,
      bad.map((p) => p[0] + ': ' + p[1].slice(0, 4).join(' | ')).join(' ;; ') || 'sạch');
    console.log('Ảnh chụp: ' + T.SHOTS);
    await br.close(); srv.close();
    T.done();
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
