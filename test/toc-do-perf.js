/*
 * Tốc Độ: ngân sách dựng hình của Phố Tàu (chinatown). Đã từng ~350k tam giác / 8,5 MB do cây LOD0 lặp gộp cứng.
 * Nay mesh lặp dùng instancing + chia khối ô lưới để three cắt ngoài khung nhìn (tools/export_track.py, js/view/track.js).
 * Đo qua renderer.info ở 8 vị trí camera cố định dọc đường; swiftshader chậm nên chỉ kiểm số, không kiểm ms.
 *   btest.sh node test/toc-do-perf.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { check, done, serve, browser, open, GAME } = require('./toc-do-lib.js');

const BUDGET = { calls: 130, tris: 280000, totalTris: 360000, mb: 3.5 };  // đo (tệ nhất trong 8 vị trí): 115 draw call, 240k tam giác/khung, 350k tổng, 3,13 MB (trước: 50 call, 322k trung bình, 350k, 8,7 MB)

(async () => {
  const dir = path.join(GAME, 'art', 'tracks', 'chinatown');
  const mb = fs.readdirSync(dir).reduce((s, f) => s + fs.statSync(path.join(dir, f)).size, 0) / 1e6;
  check('thư mục chinatown <= ' + BUDGET.mb + ' MB', mb <= BUDGET.mb, mb.toFixed(2) + ' MB');
  const srv = await serve();
  const br = await browser();
  try {
    const { page, problems } = await open(br, srv.base, 'index.html', { width: 960, height: 540 });
    await page.waitForFunction(() => window.TD && TD.main && TD.main.state === 'lobby', null, { timeout: 90000, polling: 250 });
    await page.evaluate(() => { TD.save.d.track = 'chinatown'; TD.main.startRace({ mode: 'free' }); });
    await page.waitForFunction(() => TD.main.state === 'race' && TD.main.race, null, { timeout: 180000, polling: 250 });
    const r = await page.evaluate(() => {
      TD.main.timeScale = 0;
      const M = TD.main, T = TD.TRACKS.chinatown, cam = M.camera, n = T.pts.x.length, rd = M.renderer;
      let maxCalls = 0, maxTris = 0;
      rd.info.autoReset = false;
      for (const f of [0, .12, .25, .37, .5, .62, .75, .87]) {
        const i = Math.floor(f * n), j = (i + 6) % n;
        cam.position.set(T.pts.x[i], T.pts.y[i] + 3, T.pts.z[i]); cam.lookAt(T.pts.x[j], T.pts.y[j] + 2, T.pts.z[j]); cam.updateMatrixWorld();
        rd.info.reset(); TD.trackView.update(cam); rd.render(M.scene, cam);
        maxCalls = Math.max(maxCalls, rd.info.render.calls); maxTris = Math.max(maxTris, rd.info.render.triangles);
      }
      const s = TD.trackView.stats;
      return { maxCalls, maxTris, total: s.tris, inst: s.instances, chunks: TD.trackView.chunks.length };
    });
    check('có instancing (>= 250 bản, đã chia khối)', r.inst >= 250 && r.chunks > 10, JSON.stringify(r));
    check('tổng tam giác đường <= ' + BUDGET.totalTris, r.total <= BUDGET.totalTris, r.total);
    check('draw call mỗi khung <= ' + BUDGET.calls, r.maxCalls <= BUDGET.calls, r.maxCalls);
    check('tam giác mỗi khung <= ' + BUDGET.tris, r.maxTris <= BUDGET.tris, r.maxTris);
    check('không lỗi trang', problems.length === 0, problems.slice(0, 5).join(' | '));
  } finally { await br.close(); srv.close(); }
  done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
