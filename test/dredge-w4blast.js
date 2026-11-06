/*
 * DREDGE — Biển Mù: kiểm 24 điểm nổ mìn (js/explosives.js, data/explosives.js do tools/explosives.py bóc từ Game.unity) bằng phím và chuột thật.
 * Giá trị đối chiếu từ bản gốc: ExplosivePOI.cs:22-58 (id + "-detonated", Detonate), DredgeDialogueRunner.cs:243-248 (CurrentExplosivePOI),
 * Game.unity (24 ExplosivePOI, hermit-quest ở (483,53 ; 457,09), Explosives_Special), Dredge.asset (Explosives_Root / _Special / _Detonate / _DetonateSpecial),
 * Destroyable.controller + Explode_0.anim (Objects tắt, Effects bật, DestroySelf 5 s).
 *
 * Ba việc chính (WORLD-GAPS.md §6 W4): (1) lối sau hermit-quest ĐÓNG tới khi nổ (thuyền thật lái vào bị chặn), MỞ sau khi nổ, vẫn mở sau khi nạp lại trang;
 * (2) lệnh Yarn Explosives_Special làm vars['hermit-quest-detonated'] = true và hoàn thành bước Hermitage_DetonateExplosives; Explosives_Root (marrows-rocks-1) trừ đúng 1 `explosives`;
 * (3) vật cảnh ẩn, dấu lấp lánh tắt, ván mới trả đá lại.
 *
 * Chạy: node test/dredge-w4blast.js        Ra: SHOTS hoặc %TEMP%/dredge-w4blast/*.png (1280x720 và 844x390)
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ev = (page, f, a) => page.evaluate(f, a);
const OUT = path.join(process.env.SHOTS || os.tmpdir(), 'dredge-w4blast');
fs.mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const near = (a, b, tol, m) => ok(Math.abs(a - b) <= tol, m + ' (' + (typeof a === 'number' ? a.toFixed(2) : a) + ' ~ ' + (typeof b === 'number' ? b.toFixed(2) : b) + ' +-' + tol + ')');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
const ROOT = path.resolve(__dirname, '..');
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
async function waitReady(page) { await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 }); }
async function newGame(page) {
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 15000 });
  await ev(page, () => window.DRIntro && DRIntro.playing && DRIntro.skip());
  await page.waitForFunction(() => !(window.DRIntro && DRIntro.playing), null, { timeout: 20000 });
}
async function dockReady(page) {
  const t0 = Date.now();
  for (;;) {
    const s = await ev(page, () => {
      const d = DRDock._debug(), open = DRDialogue.isOpen(), live = !!DRYarn.current() || document.getElementById('dr-dlg').classList.contains('on');
      return { ready: !!d && d.phase === 'ui' && (!open || !live), st: open && live ? DRDialogue.state() : null };
    });
    if (s.ready) return;
    if (Date.now() - t0 > 40000) throw new Error('dock UI never reached phase ui');
    if (s.st && s.st.kind === 'options') await page.click('.dlg-opt[data-index="0"]').catch(() => {});
    else if (s.st) await page.keyboard.press('Space');
    await sleep(350);
  }
}
async function toSea(page) {
  await dockReady(page);
  await ev(page, () => DR.setMode('sail'));
  await sleep(500);
  await ev(page, () => DR_DEBUG.setTime(0.5));
  await sleep(500);
}
function watch(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message.slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url().split('/').slice(-3).join('/')); });
  return errors;
}
async function pump(page, stop, limit) {            // đi hội thoại bằng Space tới khi stop() đúng; lựa chọn thứ nhất của mọi bảng chọn
  for (let i = 0; i < (limit || 40); i++) {
    if (await ev(page, stop)) return true;
    const st = await ev(page, () => DRDialogue.isOpen() ? DRDialogue.state() : null);
    if (st && st.kind === 'options') { await sleep(700); await page.click('.dlg-opt[data-index="0"]').catch(() => {}); }
    else if (st) await page.keyboard.press('Space');
    await sleep(450);
  }
  return ev(page, stop);
}
const count = (page, id) => ev(page, id => DR.grid('INVENTORY').items.filter(i => i.id === id).length, id);

// ---- trong trang: BFS 1 m trên DRWorld.sdf (ô đi được = cách đất >= clear m), cho thấy lối nào mở ra sau khi nổ
const PAGE_BFS = `
window.__bfs = function (sx, sz, R, clear) {
  const key = (i, j) => (i + R) * (2 * R + 1) + (j + R), par = new Map(), q = [[0, 0]]; par.set(key(0, 0), null);
  while (q.length) {
    const [i, j] = q.shift();
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue;
      const a = i + di, b = j + dj;
      if (Math.abs(a) > R || Math.abs(b) > R || par.has(key(a, b))) continue;
      if (DRWorld.sdf(sx + a, sz + b) < clear) continue;
      par.set(key(a, b), [i, j]); q.push([a, b]);
    }
  }
  return { cells: par.size, par, key, R };
};
window.__pathTo = function (r, sx, sz, a, b) { const out = []; let c = [a, b]; while (c) { out.push([sx + c[0], sz + c[1]]); c = r.par.get(r.key(c[0], c[1])); } return out.reverse(); };
`;

// ---- đo trên bản gốc
const HERMIT = { x: 483.53, z: 457.09 };       // Game.unity: ExplosivesPOI [hermit-quest] (world, three.js z = -z Unity)
const MARROWS = { x: -23.4, z: 40.7 };         // TheMarrows/Props/RockExplosivesPOI

async function dataTests(page) {
  console.log('Dữ liệu 24 điểm nổ');
  const D = await ev(page, () => DR_EXPLOSIVES.map(e => ({ id: e.id, node: e.node, x: e.x, z: e.z, r: e.r, fp: e.fp.reduce((s, r) => s + r[2], 0), inst: e.inst.length, kind: e.kind })));
  ok(D.length === 24, 'DR_EXPLOSIVES.length === 24 (' + D.length + ')');
  ok(new Set(D.map(e => e.id)).size === 24, '24 id khác nhau');
  ok(D.filter(e => e.node === 'Explosives_Root').length === 23 && D.filter(e => e.node === 'Explosives_Special').length === 1, '23 Explosives_Root + 1 Explosives_Special');
  const h = D.find(e => e.id === 'hermit-quest');
  ok(h && h.node === 'Explosives_Special', 'hermit-quest chạy Explosives_Special');
  near(h.x, HERMIT.x, 0.05, 'hermit-quest x'); near(h.z, HERMIT.z, 0.05, 'hermit-quest z'); ok(h.r === 7, 'hermit-quest bán kính tương tác 7');
  ok(D.every(e => e.fp > 0 && e.inst > 0), 'mọi điểm có dấu chân va chạm và vật cảnh để ẩn');
  ok(D.filter(e => /^ds-explosives-\d+$/.test(e.id)).length === 12 && D.filter(e => /^ts-explosives-\d$/.test(e.id)).length === 4 && D.filter(e => /^sb-explosives-\d$/.test(e.id)).length === 2, '12 tường Devil\'s Spine, 4 cây Twisted Strand, 2 cầu Stellar Basin');
  // bẫy W0 đã đo: collider của mảng đá nằm sẵn trong landmask
  const land = await ev(page, () => DR_EXPLOSIVES.map(e => { let n = 0, solid = 0; for (const [j, i, c] of e.fp) for (let k = 0; k < c; k++) { n++; if (DRWorld.sdf(DRWorld.landBox.x0 + i + k + 0.5, DRWorld.landBox.z0 + j + 0.5) < 0) solid++; } return [n, solid]; }));
  ok(land.every(([n, s]) => s === n), 'mọi ô dấu chân đang là đất trong trường khoảng cách (đất ' + land.reduce((s, x) => s + x[1], 0) + '/' + land.reduce((s, x) => s + x[0], 0) + ' ô)');
  ok(await ev(page, () => DRExplosives.debug().detonated.length === 0), 'ván mới: chưa điểm nào đã nổ');
}

async function setupHermitQuest(page) {
  await ev(page, () => {
    DRQuests.start('Quest_Hermitage');
    for (const s of ['Hermitage_FindCrest', 'Hermitage_ReturnCrest', 'Hermitage_AskForgiveness']) DRQuests.completeStep(s, true);
  });
}

// chọn A (nước gần, phía thuyền) và B (nước phía bên kia) sao cho đường thẳng A→B xuyên qua dấu chân; B chỉ tới được sau khi nổ
async function findPassage(page) {
  await ev(page, PAGE_BFS);
  return ev(page, ({ H }) => {
    // điểm xuất phát: nước gần hermit-quest nhất (cách đất > 3 m)
    let A = null;
    for (let r = 6; r < 40 && !A; r++) for (let a = 0; a < 6.28 && !A; a += 0.1) { const x = H.x + Math.cos(a) * r, z = H.z + Math.sin(a) * r; if (DRWorld.sdf(x, z) > 3) A = [x, z]; }
    const fp = new Set(); const L = DRWorld.landBox;
    for (const [j, i, c] of DR_EXPLOSIVES.find(e => e.id === 'hermit-quest').fp) for (let k = 0; k < c; k++) fp.add((L.z0 + j + 0.5).toFixed(1) + ',' + (L.x0 + i + k + 0.5).toFixed(1));
    const before = __bfs(Math.round(A[0]), Math.round(A[1]), 45, 1.3);
    return { A, cellsBefore: before.cells, fp: fp.size };
  }, { H: HERMIT });
}

async function passageTests(page) {
  console.log('Lối sau hermit-quest (thuyền thật)');
  await ev(page, () => DR.setMode('sail'));
  const info = await findPassage(page);
  ok(info.A && info.cellsBefore > 50, 'có nước phía thuyền gần hermit-quest tại (' + info.A.map(v => v.toFixed(1)) + '), vùng đi được trước khi nổ ' + info.cellsBefore + ' m2');
  const A = info.A;
  // trước khi nổ: BFS từ A rồi lưu vùng
  const reachBefore = await ev(page, ({ A }) => { const r = __bfs(Math.round(A[0]), Math.round(A[1]), 45, 1.3); window.__before = r; window.__A = [Math.round(A[0]), Math.round(A[1])]; return r.cells; }, { A });
  // thuyền thật lái về phía mảng đá: bị chặn
  const towards = Math.atan2(-(HERMIT.x - A[0]), -(HERMIT.z - A[1]));
  await ev(page, ([x, z, yaw]) => DR_DEBUG.teleport(x, z, yaw), [A[0], A[1], towards]);
  await sleep(600);
  let blocked = await driveToward(page, HERMIT.x, HERMIT.z, 4, 7000);
  ok(blocked.minDist > 3, 'trước khi nổ: lái thẳng vào hermit-quest bị chặn (còn cách ' + blocked.minDist.toFixed(1) + ' m tâm mảng đá)');
  ok(await ev(page, () => DRWorld.sdf(483.53, 457.09) < 0), 'trước khi nổ: tâm mảng đá là đất (sdf ' + (await ev(page, () => DRWorld.sdf(483.53, 457.09))).toFixed(2) + ')');
  return { A, reachBefore };
}

// giữ W, lái tới (x, z): trả về khoảng cách nhỏ nhất tới đích và có tới không
async function driveToward(page, x, z, stopAt, maxMs) {
  await page.keyboard.down('KeyW');
  const t0 = Date.now(); let minDist = 1e9, last = null, stuck = 0;
  while (Date.now() - t0 < maxMs) {
    await sleep(200);
    const s = await ev(page, ([x, z]) => ({ d: Math.hypot(DR.s.boat.x - x, DR.s.boat.z - z), sp: DRBoat.speed() }), [x, z]);
    minDist = Math.min(minDist, s.d);
    if (s.d <= stopAt) break;
    stuck = s.sp < 0.3 && last !== null ? stuck + 1 : 0; last = s.sp;
    if (stuck > 8) break;
  }
  await page.keyboard.up('KeyW');
  await sleep(300);
  return { minDist, reached: minDist <= stopAt };
}

async function shotsAt(page, tag, A, yaw) {
  for (const [w, h] of [[1280, 720], [844, 390]]) {
    await page.setViewportSize({ width: w, height: h });
    await ev(page, ([x, z, yaw]) => DR_DEBUG.teleport(x, z, yaw), [A[0], A[1], yaw]);
    await sleep(2500);
    await page.screenshot({ path: path.join(OUT, 'hermit-' + tag + '-' + w + 'x' + h + '.png') });
  }
  await page.setViewportSize({ width: 1280, height: 720 });
}

async function main(page, base) {
  await dataTests(page);
  await setupHermitQuest(page);
  await ev(page, () => { DR_DEBUG.give('explosives'); });
  ok(await count(page, 'explosives') === 1, 'khoang có 1 explosives (give)');

  const { A, reachBefore } = await passageTests(page);
  const towards = Math.atan2(-(HERMIT.x - A[0]), -(HERMIT.z - A[1]));
  await shotsAt(page, 'before', A, towards);
  const perfBefore = await ev(page, () => DR_DEBUG.perf().avgMs);

  // ---- F -> Explosives_Special -> chọn "nổ"
  console.log('Explosives_Special (F gần hermit-quest)');
  await ev(page, ([x, z, yaw]) => DR_DEBUG.teleport(x, z, yaw), [A[0], A[1], towards]);
  await page.waitForFunction(() => DRPoi._debug().near === 'hermit-quest', null, { timeout: 5000 }).catch(() => {});
  await sleep(1200);
  let d = await ev(page, () => DRPoi._debug());
  ok(d.near === 'hermit-quest' && d.prompt, 'cách mảng đá ' + Math.hypot(A[0] - HERMIT.x, A[1] - HERMIT.z).toFixed(1) + ' m: điểm gần = hermit-quest, gợi ý "Kiểm tra F" hiện');
  const glintOn = await ev(page, () => DRParticles.ambient.filter(a => /hermit-quest/.test(a.e.path) && a.h).length);
  ok(glintOn > 0, 'trước khi nổ: dấu lấp lánh InspectionGlint của hermit-quest đang chạy (' + glintOn + ')');
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => DRDialogue.isOpen(), null, { timeout: 4000 }).catch(() => {});
  await sleep(800);
  let st = await ev(page, () => DRDialogue.state());
  ok(st && st.node === 'Explosives_Special', 'F chạy node Yarn Explosives_Special (' + (st && st.node) + ')');
  ok(await ev(page, () => DRExplosives.current() === 'hermit-quest'), 'CurrentExplosivePOI = hermit-quest trong lúc hội thoại');
  const n0 = await count(page, 'explosives');
  ok(await pump(page, () => DRExplosives.isDetonated('hermit-quest'), 30), 'chọn nổ -> vars["hermit-quest-detonated"] = true');
  ok(await ev(page, () => DR.s.vars['hermit-quest-detonated'] === true), 'SaveData biến hermit-quest-detonated bật');
  await pump(page, () => !DRDialogue.isOpen() && !DRYarn.current(), 20);
  ok(await ev(page, () => DRQuests.isStepCompleted('Hermitage_DetonateExplosives')), 'Explosives_DetonateSpecial hoàn thành bước Hermitage_DetonateExplosives');
  ok(await count(page, 'explosives') === n0, 'Explosives_Special không trừ explosives (Yarn gốc Explosives_DetonateSpecial không có RemoveItemById): ' + n0 + ' -> ' + await count(page, 'explosives'));
  ok(await ev(page, () => DRExplosives.current() === null), 'hội thoại xong: CurrentExplosivePOI trở về null');
  await sleep(600);

  // ---- sau khi nổ
  console.log('Sau khi nổ hermit-quest');
  ok(await ev(page, () => DRWorld.sdf(483.53, 457.09) > 0), 'tâm mảng đá thành nước (sdf ' + (await ev(page, () => DRWorld.sdf(483.53, 457.09))).toFixed(2) + ')');
  const reachAfter = await ev(page, () => __bfs(__A[0], __A[1], 45, 1.3).cells);
  ok(reachAfter > reachBefore + 100, 'vùng thuyền tới được tăng ' + reachBefore + ' -> ' + reachAfter + ' m2 (lối mở)');
  const hid = await ev(page, () => {
    const e = DRExplosives.byId['hermit-quest']; let zero = 0, total = 0;
    for (const i of e.inst) for (const c of Object.values(DRWorld.cells)) {
      if (!c.group) continue;
      for (const im of c.group.children) {
        if (!im.isInstancedMesh || im.userData.off === undefined) continue;
        const k = i - im.userData.off; if (k < 0 || k >= im.count) continue;
        total++; if (im.instanceMatrix.array[k * 16] === 0 && im.instanceMatrix.array[k * 16 + 5] === 0) zero++;
      }
    }
    return [zero, total, e.inst.length];
  });
  ok(hid[1] >= hid[2] && hid[0] === hid[1], 'vật cảnh của mảng đá ẩn hết (' + hid[0] + '/' + hid[1] + ' phần vẽ, ' + hid[2] + ' instance)');
  await sleep(700);
  ok(await ev(page, () => DRParticles.ambient.filter(a => /hermit-quest/.test(a.e.path) && a.h).length === 0), 'dấu lấp lánh của hermit-quest tắt');
  d = await ev(page, () => DRPoi._debug());
  ok(d.near !== 'hermit-quest' && !(await ev(page, () => DRPoi.enabled(DRPoi.extra.find(p => p.id === 'hermit-quest')))), 'điểm hermit-quest không còn hiện F (RefreshStatus tắt)');
  const fxLive = await ev(page, () => DRExplosives.debug().fx);
  ok(fxLive <= 1, 'hiệu ứng nổ còn ' + fxLive + ' nhóm (gốc DestroySelf sau 5 s)');
  await ev(page, () => DR_DEBUG.teleport(DR.s.boat.x, DR.s.boat.z, DR.s.boat.yaw));
  await sleep(5200);
  ok(await ev(page, () => DRExplosives.debug().fx === 0), 'sau 5 s hiệu ứng nổ được dọn');
  // thuyền thật lái qua
  const B = await ev(page, () => { // điểm xa nhất mới tới được sau khi nổ, theo hướng thẳng qua tâm
    const A = __A; let best = null;
    const reach = __bfs(A[0], A[1], 45, 1.3);
    for (const [k] of reach.par) {
      const i = Math.floor(k / 91) - 45, j = (k % 91) - 45;
      if (__before.par.has(__before.key(i, j))) continue;
      const x = A[0] + i, z = A[1] + j, dh = Math.hypot(x - 483.53, z - 457.09);
      if (dh > 4 && dh < 20 && (!best || Math.hypot(i, j) > best.d)) best = { x, z, d: Math.hypot(i, j) };
    }
    return best;
  });
  ok(!!B, 'có điểm sau mảng đá chỉ tới được sau khi nổ: (' + (B && B.x.toFixed(1) + ', ' + B.z.toFixed(1)) + ')');
  if (B) {
    await ev(page, ([x, z, yaw]) => DR_DEBUG.teleport(x, z, yaw), [A[0], A[1], towards]);
    await sleep(500);
    // đi theo đường BFS tới B: dẫn thuyền bằng các điểm trung gian (teleport tới cách 6 m rồi lái đoạn ngắn thật)
    const path2 = await ev(page, ([bx, bz]) => { const A = __A, r = __bfs(A[0], A[1], 45, 1.3); return __pathTo(r, A[0], A[1], Math.round(bx - A[0]), Math.round(bz - A[1])); }, [B.x, B.z]);
    let reached = false, minD = 1e9;
    for (let k = 6; k < path2.length && !reached; k += 6) {
      const p0 = path2[k - 6], p1 = path2[Math.min(k, path2.length - 1)];
      await ev(page, ([x, z, yaw]) => DR_DEBUG.teleport(x, z, yaw), [p0[0], p0[1], Math.atan2(-(p1[0] - p0[0]), -(p1[1] - p0[1]))]);
      await sleep(250);
      const r = await driveToward(page, p1[0], p1[1], 1.5, 4000);
      minD = Math.min(minD, r.minDist);
      if (!r.reached) { console.log('  (đoạn ' + k + ' chưa tới: ' + r.minDist.toFixed(1) + ' m)'); break; }
      reached = k + 6 >= path2.length;
    }
    ok(reached, 'sau khi nổ: lái thuyền thật theo lối qua mảng đá tới điểm phía bên kia (' + path2.length + ' m, đoạn xa nhất còn cách ' + minD.toFixed(1) + ' m)');
  }
  await shotsAt(page, 'after', A, towards);
  const perfAfter = await ev(page, () => DR_DEBUG.perf().avgMs);
  console.log('  khung hình trung bình trước ' + perfBefore.toFixed(2) + ' ms, sau ' + perfAfter.toFixed(2) + ' ms');

  // ---- Explosives_Root: trừ đúng 1 explosives, hủy mảng đá gần Greater Marrow
  console.log('Explosives_Root (marrows-rocks-1)');
  await ev(page, () => { DR_DEBUG.give('explosives'); });
  const nm0 = await count(page, 'explosives');
  let M = await ev(page, ({ H }) => { for (let r = 8; r < 40; r++) for (let a = 0; a < 6.28; a += 0.1) { const x = H.x + Math.cos(a) * r, z = H.z + Math.sin(a) * r; if (DRWorld.sdf(x, z) > 3) return [x, z]; } return null; }, { H: MARROWS });
  ok(!!M, 'có nước gần marrows-rocks-1');
  await ev(page, ([x, z, yaw]) => DR_DEBUG.teleport(x, z, yaw), [M[0], M[1], Math.atan2(-(MARROWS.x - M[0]), -(MARROWS.z - M[1]))]);
  await page.waitForFunction(() => DRPoi._debug().near === 'marrows-rocks-1', null, { timeout: 5000 }).catch(() => {});
  await sleep(1200);
  ok((await ev(page, () => DRPoi._debug().near)) === 'marrows-rocks-1', 'gần marrows-rocks-1: gợi ý F hiện');
  const sdfBefore = await ev(page, ({ M }) => DRWorld.sdf(M.x, M.z), { M: MARROWS });
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => DRDialogue.isOpen(), null, { timeout: 4000 }).catch(() => {});
  await sleep(700);
  st = await ev(page, () => DRDialogue.state());
  ok(st && ['Explosives_Root', 'Explosives_Choice'].includes(st.node), 'F chạy Explosives_Root, đổ sang Explosives_Choice vì có explosives (' + (st && st.node) + ')');
  ok(await pump(page, () => DRExplosives.isDetonated('marrows-rocks-1'), 30), 'Explosives_Choice -> Explosives_Detonate -> marrows-rocks-1-detonated');
  await pump(page, () => !DRDialogue.isOpen() && !DRYarn.current(), 20);
  ok(await count(page, 'explosives') === nm0 - 1, 'đúng 1 explosives bị trừ (' + nm0 + ' -> ' + await count(page, 'explosives') + ')');
  ok(sdfBefore < 0 && await ev(page, ({ M }) => DRWorld.sdf(M.x, M.z) > 0, { M: MARROWS }), 'tâm marrows-rocks-1: đất -> nước (sdf ' + sdfBefore.toFixed(2) + ' -> ' + (await ev(page, ({ M }) => DRWorld.sdf(M.x, M.z), { M: MARROWS })).toFixed(2) + ')');
  ok(await ev(page, () => DRExplosives.debug().detonated.length === 2), 'đã nổ 2 điểm');

  // ---- nạp lại: lưu rồi tải lại trang, bấm Tiếp tục
  console.log('Nạp lại trang (lối vẫn mở)');
  ok(await ev(page, () => DR.save()), 'lưu ván');
  await page.goto(base + '/games/dredge/index.html');
  await waitReady(page);
  await page.waitForFunction(() => !document.getElementById('btn-continue').hidden, null, { timeout: 10000 });
  await page.click('#btn-continue');
  await page.waitForFunction(() => DR.s && DR.mode, null, { timeout: 15000 });
  await sleep(1500);
  ok(await ev(page, () => DR.s.vars['hermit-quest-detonated'] === true && DR.s.vars['marrows-rocks-1-detonated'] === true), 'sau khi nạp: hai biến -detonated vẫn bật');
  ok(await ev(page, () => DRWorld.sdf(483.53, 457.09) > 0 && DRWorld.sdf(-23.4, 40.7) > 0), 'sau khi nạp: tâm hai mảng đá vẫn là nước');
  ok(await ev(page, () => DRExplosives.debug().applied.length === 2), 'sau khi nạp: đã áp dụng đúng 2 điểm');
  await ev(page, () => { DR.setMode('sail'); });
  await ev(page, ([x, z, yaw]) => DR_DEBUG.teleport(x, z, yaw), [A[0], A[1], towards]);
  await sleep(2500);
  await page.screenshot({ path: path.join(OUT, 'hermit-after-reload-1280x720.png') });
  const reachReload = await ev(page, PAGE_BFS).then(() => ev(page, ({ A }) => __bfs(Math.round(A[0]), Math.round(A[1]), 45, 1.3).cells, { A }));
  ok(reachReload === reachAfter, 'sau khi nạp: vùng tới được giống trước khi nạp (' + reachReload + ' = ' + reachAfter + ' m2)');

  // ---- ván mới trả đá
  console.log('Ván mới trả mảng đá');
  await ev(page, () => { DR.newGame(); });
  await sleep(600);
  ok(await ev(page, () => DRWorld.sdf(483.53, 457.09) < 0 && DRWorld.sdf(-23.4, 40.7) < 0), 'ván mới: hai mảng đá trở lại là đất');
  ok(await ev(page, () => DRExplosives.debug().applied.length === 0), 'ván mới: không điểm nào còn áp dụng');
  const back = await ev(page, () => {
    const e = DRExplosives.byId['hermit-quest']; let vis = 0, total = 0;
    for (const i of e.inst) for (const c of Object.values(DRWorld.cells)) {
      if (!c.group) continue;
      for (const im of c.group.children) { if (!im.isInstancedMesh || im.userData.off === undefined) continue; const k = i - im.userData.off; if (k < 0 || k >= im.count) continue; total++; if (im.instanceMatrix.array[k * 16] !== 0) vis++; }
    }
    return [vis, total];
  });
  ok(back[1] > 0 && back[0] === back[1], 'ván mới: vật cảnh hiện lại (' + back[0] + '/' + back[1] + ')');
}

(async () => {
  const srv = await serve(), base = process.env.DR_URL || 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = watch(page);
  await page.goto(base + '/games/dredge/index.html?fresh=1');
  await waitReady(page);
  await newGame(page);
  await toSea(page);
  try { await main(page, base); } catch (e) { fail++; console.log('  FAIL ngoại lệ: ' + e.message.split('\n')[0]); }
  const uniq = [...new Set(errors)];
  ok(uniq.length === 0, 'không có pageerror / console.error / HTTP >= 400' + (uniq.length ? ': ' + uniq.slice(0, 5).join(' ; ') : ''));
  console.log('\n' + pass + ' pass, ' + fail + ' fail -> ' + OUT);
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
