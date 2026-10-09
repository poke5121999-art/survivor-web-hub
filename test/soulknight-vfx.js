/*
 * Kiểm thử hiệu ứng thật (SK 8.6) của Hiệp Sĩ Linh Hồn: data/sk-vfx.js + js/vfx.js + tools/vfx/viewer.html.
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-vfx.js
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-vfx/.
 *
 * 1. Trang xem: nạp đủ atlas, lưới hiệu ứng vẽ ra điểm ảnh thật, không lỗi trang.
 * 2. Mô phỏng tất định (bước 1/60 s): hạt xuất hiện rồi chết đúng tuổi thọ; mọi hiệu ứng không lặp tự tắt.
 * 3. Hiệu năng: 60 vụ nổ nặng nhất cùng lúc trên khung 400×225, đo fps.
 * 4. Trong game: nạp vfx.js vào index.html (móc SK.updateFx/SK.drawFx), sinh hiệu ứng cạnh người chơi, chụp.
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const BASE = process.env.SK_BASE || 'http://localhost:8811/games/soulknight/';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-vfx');
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  if (ok) { pass++; results.push('  ✔ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; results.push('  ✘ ' + name + (detail ? '  — ' + detail : '')); }
}
function watch(p, errs) {
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  p.on('response', r => { if (r.status() >= 400 && !/fonts\.(googleapis|gstatic)/.test(r.url())) errs.push('http ' + r.status() + ' ' + r.url()); });
}

async function viewer(b) {
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = [];
  watch(p, errs);
  await p.goto(BASE + 'tools/vfx/viewer.html?q=^(hit_|explode_s|Fire2$|buff_fire)&zoom=2');
  await p.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 60000 });
  const info = await p.evaluate(() => ({
    pages: SK.vfx.pages.length, loaded: SK.vfx.pages.filter(Boolean).length, effects: Object.keys(SK_VFX.effects).length,
    cells: document.querySelectorAll('.cell').length
  }));
  check('atlas hiệu ứng nạp đủ trang', info.pages > 0 && info.loaded === info.pages, info.loaded + '/' + info.pages + ' trang, ' + info.effects + ' hiệu ứng');
  await p.waitForTimeout(1200);
  // ô nào có điểm ảnh khác nền = hiệu ứng thật đã vẽ
  const lit = await p.evaluate(() => {
    let n = 0;
    for (const c of window.VFX_VIEWER.cells()) {
      const d = c.ctx.getImageData(0, 0, c.cv.width, c.cv.height).data;
      let diff = 0;
      for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 14) + Math.abs(d[i + 1] - 16) + Math.abs(d[i + 2] - 22) > 40) diff++;
      if (diff > 30) n++;
    }
    return { n, of: window.VFX_VIEWER.cells().length };
  });
  check('lưới xem: có ô vẽ ra hiệu ứng', lit.n >= 5, lit.n + '/' + lit.of + ' ô có điểm ảnh hiệu ứng lúc chụp');
  await p.screenshot({ path: path.join(SHOTS, 'viewer-grid.png') });
  await p.goto(BASE + 'tools/vfx/viewer.html?sel=explode_s&q=explode');
  await p.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 60000 });
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(SHOTS, 'viewer-detail-explode_s.png') });
  check('trang xem không lỗi', errs.length === 0, errs.slice(0, 3).join(' | '));

  // ---- mô phỏng tất định
  const sim = await p.evaluate(() => {
    const X = SK.vfx, V = SK_VFX, out = {};
    // một hiệu ứng có hạt: đếm theo thời gian
    const G = {};
    const h = X.spawn(G, 'hit_yellow', 50, 50, { seed: 1 });
    const counts = [];
    let maxLife = 0;
    for (const n of h.def.nodes) if (n.ps) { const l = n.ps.life; maxLife = Math.max(maxLife, typeof l === 'number' ? l : (l.b != null ? l.b : l.m)); }
    for (let i = 0; i < 180; i++) { X.update(G, 1 / 60); counts.push(h.sys.reduce((s, x) => s + x.parts.length, 0)); }
    out.hitYellow = { peak: Math.max(...counts), at005: counts[3], atEnd: counts[counts.length - 1], alive: G.vfx.length, dur: h.def.dur, maxLife };
    // mọi hiệu ứng: sinh, chạy 1 lượt, không ném lỗi; hiệu ứng không lặp phải tự tắt
    const names = Object.keys(V.effects);
    let thrown = [], stuck = [], particlesSeen = 0, withPs = 0;
    // tuổi thọ hạt dài nhất, hoặc thời gian vệt TrailRenderer (vệt còn hiện tới lúc đỉnh cuối hết hạn)
    const lifeMax = d => d.nodes.reduce((m, nd) => { if (nd.tr) m = Math.max(m, nd.tr.time || 0); if (!nd.ps) return m; const l = nd.ps.life; return Math.max(m, typeof l === 'number' ? l : l.c ? l.m : Math.max(l.a, l.b)); }, 0);
    for (const n of names) {
      const d = V.effects[n];
      const G2 = {};
      try {
        const h2 = X.spawn(G2, n, 0, 0, { seed: 3, dur: d.loop ? 1 : undefined });
        const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
        const ctx = cv.getContext('2d');
        // hệ có phát (rate/bursts) và nút đang bật lúc sinh; hệ chỉ phát bằng script (Emit) không tính
        const hasPs = h2.sys.some(s => (s.d.rate != null || s.d.bursts) && h2.nodes[s.i].vis); if (hasPs) withPs++;
        let seen = 0;
        // def.end (BuffIce): thêm pha kết thúc = after + độ dài clip của trạng thái kết thúc
        const endT = d.end ? d.end.after + Math.max(0, ...(d.anims || []).map(a => a.st && a.st[d.end.state] != null ? a.clips[a.st[d.end.state]].len : 0)) : 0;
        const lim = Math.min(45, (d.loop ? 1 : d.dur) + lifeMax(d) + endT + 1);
        let t = 0;
        while (G2.vfx.length && t < lim) { X.update(G2, 1 / 30); t += 1 / 30; if (hasPs) seen = Math.max(seen, h2.sys.reduce((s, x) => s + x.parts.length, 0)); if ((t * 30 | 0) % 10 === 0) X.draw(ctx, G2); }
        if (seen) particlesSeen++;
        if (G2.vfx.length) stuck.push(n);
      } catch (e) { thrown.push(n + ': ' + e.message); }
    }
    out.all = { n: names.length, thrown: thrown.slice(0, 5), nThrown: thrown.length, stuck: stuck.slice(0, 8), nStuck: stuck.length, particlesSeen, withPs };
    // hạt của các ô lưới xem đang chạy song song không tính
    out.live = X.stats.particles - window.VFX_VIEWER.cells().reduce((s, c) => s + (c.G.vfx || []).reduce((t, h) => t + h.sys.reduce((u, x) => u + x.parts.length, 0), 0), 0);
    return out;
  });
  const hy = sim.hitYellow;
  check('hit_yellow: hạt xuất hiện ngay (≤0.05 s)', hy.at005 > 0, 'hạt ở 0.05 s: ' + hy.at005 + ', đỉnh ' + hy.peak);
  check('hit_yellow: hạt chết theo tuổi thọ, hiệu ứng tự huỷ theo RGAutoDestory', hy.atEnd === 0 && hy.alive === 0, 'sau 3 s còn ' + hy.atEnd + ' hạt, ' + hy.alive + ' instance (dur ' + hy.dur + ' s, tuổi thọ hạt ' + hy.maxLife + ' s)');
  check('mọi hiệu ứng chạy không ném lỗi', sim.all.nThrown === 0, sim.all.nThrown + ' lỗi ' + sim.all.thrown.join(' | '));
  check('mọi hiệu ứng tự tắt (lặp thì theo dur)', sim.all.nStuck === 0, sim.all.nStuck + ' kẹt ' + sim.all.stuck.join(', '));
  check('hệ hạt có rate/bursts đều phát ra hạt', sim.all.particlesSeen >= sim.all.withPs * 0.97, sim.all.particlesSeen + '/' + sim.all.withPs + ' hiệu ứng đã phát');
  check('bộ đếm hạt về 0 khi mọi thứ tắt', sim.live === 0, 'còn ' + sim.live);

  // ---- hiệu năng: 60 vụ nổ nặng nhất
  const perf = await p.evaluate(async () => {
    const X = SK.vfx, V = SK_VFX;
    const score = n => V.effects[n].nodes.reduce((s, nd) => s + (nd.ps ? Math.min(nd.ps.max || 50, 200) : 0), 0);
    const heavy = Object.keys(V.effects).filter(n => /explode|boom|blast/i.test(n) && !V.effects[n].loop).sort((a, b) => score(b) - score(a)).slice(0, 12);
    const cv = document.createElement('canvas'); cv.width = 400; cv.height = 225; document.body.appendChild(cv);
    const ctx = cv.getContext('2d');
    const G = {};
    let frames = 0, maxP = 0, worst = 0, k = 0;
    const t0 = performance.now();
    await new Promise(res => {
      let last = t0;
      function f(now) {
        const dt = (now - last) / 1000; last = now; worst = Math.max(worst, dt);
        while (G.vfx === undefined || G.vfx.length < 60) { X.spawn(G, heavy[k++ % heavy.length], 20 + (k * 37) % 360, 20 + (k * 53) % 185, { seed: k }); }
        X.update(G, 1 / 60);
        ctx.fillStyle = '#222'; ctx.fillRect(0, 0, 400, 225);
        X.draw(ctx, G);
        maxP = Math.max(maxP, X.stats.particles);
        frames++;
        if (now - t0 < 3000) requestAnimationFrame(f); else res();
      }
      requestAnimationFrame(f);
    });
    const secs = (performance.now() - t0) / 1000;
    X.clear(G); cv.remove();
    return { fps: frames / secs, maxP, worstMs: worst * 1000, heavy: heavy.slice(0, 4) };
  });
  check('60 vụ nổ nặng cùng lúc ≥ 30 fps', perf.fps >= 30, Math.round(perf.fps) + ' fps, đỉnh ' + perf.maxP + ' hạt, khung tệ nhất ' + Math.round(perf.worstMs) + ' ms (' + perf.heavy.join(', ') + ')');
  await p.close();
}

// Đúng như Unity: số kỳ vọng lấy thẳng từ prefab 8.6 (tools/vfx/probe.py) và mã gốc (tools/sk_method.py).
async function fidelity(b) {
  const p = await b.newPage({ viewport: { width: 800, height: 600 } });
  const errs = [];
  watch(p, errs);
  await p.goto(BASE + 'tools/vfx/viewer.html?q=^$');
  await p.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 60000 });
  const r = await p.evaluate(() => {
    const X = SK.vfx, V = SK_VFX, out = {};
    const canvas = (w, h) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const ctx = cv.getContext('2d'); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); return ctx; };
    const run = (G, secs) => { for (let i = 0; i < Math.round(secs * 60); i++) X.update(G, 1 / 60); };

    // 1. hit_orange: renderer dùng Sprites-Default không có _MainTex -> hạt là ô vuông đặc màu startColor (1, 0.8902, 0.2941)
    {
      const G = {}, h = X.spawn(G, 'hit_orange', 48, 48, { seed: 2 });
      run(G, 4 / 60);
      h.nodes[0].en = false; // chỉ vẽ hạt, tắt sprite chớp
      const ctx = canvas(96, 96);
      X.draw(ctx, G);
      const d = ctx.getImageData(0, 0, 96, 96).data;
      let lit = 0, exact = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 30) { lit++; if (Math.abs(d[i] - 255) <= 2 && Math.abs(d[i + 1] - 227) <= 2 && Math.abs(d[i + 2] - 75) <= 2) exact++; }
      out.hit = { tex: V.effects.hit_orange.nodes[0].ps.tex, lit, exact, parts: h.sys[0].parts.length };
      X.clear(G);
    }
    // 2. scalingMode Shape (hit_orange: 2): thước spawn 2 chỉ nới vùng phát (bán kính 1 -> 2 đơn vị), cỡ hạt giữ 0.4 đv = 6.4 px
    {
      const G = {}, h = X.spawn(G, 'hit_orange', 48, 48, { seed: 3, scale: 2 });
      run(G, 5 / 60);
      h.nodes[0].en = false;
      const ctx = canvas(96, 96), sides = [], fr = ctx.fillRect.bind(ctx);
      ctx.fillRect = (x, y, w, hh) => { const m = ctx.getTransform(); sides.push(Math.hypot(m.a, m.b) * w); fr(x, y, w, hh); };
      X.draw(ctx, G);
      out.shape = { scl: V.effects.hit_orange.nodes[0].ps.scl, maxSide: Math.max(...sides), n: sides.length, maxR: Math.max(...h.sys[0].parts.map(q => Math.hypot(q.x, q.y))) };
      X.clear(G);
    }
    // 3. explode_s/light: Legacy Shaders/Particles/Additive, _TintColor (1,1,1,1) -> ×2 cả màu lẫn alpha rồi kẹp
    {
      const light = V.effects.explode_s.nodes[2].sr;
      const px = () => {
        const G = {}, h = X.spawn(G, 'explode_s', 48, 48, { seed: 1, state: 'explode_small' });
        run(G, 1 / 60);
        h.nodes[1].en = false; // chỉ vẽ quầng sáng
        const ctx = canvas(96, 96);
        X.draw(ctx, G);
        X.clear(G);
        return Array.from(ctx.getImageData(48, 48, 1, 1).data);
      };
      const tint = light.tint, withT = px();
      light.tint = null; const noT = px(); light.tint = tint;
      out.light = { tint, withT, noT, rr: withT[0] / Math.max(1, noT[0]), rb: withT[2] / Math.max(1, noT[2]) };
    }
    // 4. buff_ice: BuffIce.buff_time 2.75 s đứng yên đủ; hết buff -> tách khỏi quái, sprite ice_end (bullet_84), 2 s sau
    //    SetTrigger -> 'disappear' (mờ trong 1 s) rồi tắt [ĐO BuffIce.BuffEnd: Invoke("Disappear", 2.0)]
    {
      const G = {}, tgt = { x: 50, y: 50 };
      const h = X.spawn(G, 'buff_ice', 0, 0, { follow: tgt, dur: 2.75, seed: 1 });
      const snap = () => ({ a: +h.nodes[0].col[3].toFixed(3), spr: h.nodes[0].spr, x: h.x, alive: G.vfx.length });
      run(G, 1.5); const s1 = snap();
      tgt.x = 80; run(G, 1.4); const s2 = snap();          // t = 2.9: đã hết buff
      tgt.x = 120; run(G, 2.35); const s3 = snap();        // t = 5.25: nửa clip disappear
      run(G, 0.6); const s4 = snap();                      // t = 5.85: đã tắt
      out.ice = { end: V.effects.buff_ice.end, s1, s2, s3, s4 };
      X.clear(G);
    }
    // 5. explode_energy3: gốc prefab nằm ở x = 7.32 đv; Instantiate(prefab, vị trí, góc) ghi đè -> vẽ tại điểm nổ
    {
      const G = {}; X.spawn(G, 'explode_energy3', 100, 60, { seed: 1 });
      run(G, 0.1);
      const ctx = canvas(200, 120);
      X.draw(ctx, G);
      const d = ctx.getImageData(0, 0, 200, 120).data;
      let n = 0, sx = 0, sy = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 60) { n++; sx += (i / 4) % 200; sy += Math.floor(i / 4 / 200); }
      out.root = { T0: V.effects.explode_energy3.nodes[0].T[0], n, cx: n ? sx / n : -1, cy: n ? sy / n : -1 };
      X.clear(G);
    }
    // 6. fighter_0_angry_effect: shader Unlit/RGSEffectLight có Blend One One [ĐO m_ParsedForm] -> nền đen của sprite
    //    không làm tối cảnh (trước đây vẽ alpha: ô vuông tối quanh nhân vật)
    {
      const G = {}; X.spawn(G, 'fighter_0_angry_effect', 48, 70, { seed: 1, dur: 1 });
      run(G, 0.2);
      const ctx = canvas(96, 96); ctx.fillStyle = '#404040'; ctx.fillRect(0, 0, 96, 96);
      X.draw(ctx, G);
      const d = ctx.getImageData(0, 0, 96, 96).data;
      let darker = 0, brighter = 0;
      for (let i = 0; i < d.length; i += 4) { if (d[i] < 60 && d[i + 1] < 60 && d[i + 2] < 60) darker++; else if (d[i] + d[i + 1] + d[i + 2] > 3 * 70) brighter++; }
      out.angry = { blend: V.effects.fighter_0_angry_effect.nodes[1].ps.blend, darker, brighter };
      X.clear(G);
    }
    // 7. arcaneknight_0_skill1_add_armor_fx: texture sheet chế độ Sprite với MỘT sprite -> vẽ sprite đó, không phải ô trắng
    {
      const G = {}; X.spawn(G, 'arcaneknight_0_skill1_add_armor_fx', 48, 60, { seed: 1 });
      run(G, 0.15);
      const ctx = canvas(96, 96);
      X.draw(ctx, G);
      const d = ctx.getImageData(0, 0, 96, 96).data;
      let lit = 0, white = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 30) { lit++; if (d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245) white++; }
      out.armor = { spr: V.effects.arcaneknight_0_skill1_add_armor_fx.nodes[1].ps.uv.spr, lit, white };
      X.clear(G);
    }
    // 8. warliege_roll: nhánh 'ice' tắt sẵn trong prefab (m_IsActive 0) -> không phát hạt (trước đây ô trắng)
    {
      const G = {}, h = X.spawn(G, 'warliege_roll', 48, 48, { seed: 1, dur: 1 });
      run(G, 0.5);
      const ice = h.nodes.find(n => n.d.n === 'ice');
      out.roll = { off: !!(ice && ice.d.off), parts: h.sys.reduce((s2, x) => s2 + x.parts.length, 0) };
      X.clear(G);
    }
    // 9. hạt chế độ Sprite: cỡ = bề rộng rect sprite, cao theo tỉ lệ, đặt theo pivot [ĐO 610 hệ pixel art].
    //    bullet_follow_ice_skill_s12/ice: cỡ 1 (scalingMode Shape), sprite hero_c02_skin_12_ice 21×24 px pivot (10.5, 21.6)
    //    từ góc trên-trái -> 16 × 18.29 px, từ 8 px trái tới 8 px phải, 16.46 px trên tới 1.83 px dưới điểm hạt.
    {
      const G = {}, h = X.spawn(G, 'bullet_follow_ice_skill_s12', 48, 48, { seed: 1, dur: 2 });
      h.sys = h.sys.filter(s2 => h.nodes[s2.i].d.n === 'ice');
      run(G, 0.5);
      const ctx = canvas(96, 96), boxes = [], di = ctx.drawImage.bind(ctx);
      ctx.drawImage = function (img, ...a) {
        const m = ctx.getTransform(), q = a.length === 8 ? a.slice(4) : a.length === 4 ? a : [a[0], a[1], img.width, img.height];
        const P = [[q[0], q[1]], [q[0] + q[2], q[1]], [q[0], q[1] + q[3]], [q[0] + q[2], q[1] + q[3]]].map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
        boxes.push([Math.min(...P.map(v => v[0])), Math.max(...P.map(v => v[0])), Math.min(...P.map(v => v[1])), Math.max(...P.map(v => v[1]))]);
        return di(img, ...a);
      };
      X.draw(ctx, G);
      out.sprMode = { n: boxes.length, b: boxes[0] && boxes[0].map(v => +v.toFixed(2)), spr: V.effects.bullet_follow_ice_skill_s12.nodes[2].ps.uv.spr[0] };
      X.clear(G);
    }
    // 10. TrailRenderer có texture (skill1_bullet: #redtrail, Stretch, gradient alpha 1 suốt vệt): texture sáng ở u = 0
    //     (đầu vệt, [ĐO] cột sáng 0.48 -> 0 dọc ảnh) nên đầu vệt sáng, đuôi tối. Nét màu phẳng cũ: đỏ đều suốt vệt.
    //     Vật chậm (1 px/khung < minVertexDistance 0.1 đv = 1.6 px): vệt vẫn dài time × tốc độ = 0.55 s × 60 px/s = 33 px.
    {
      const trail = (step, secs) => {
        const G = {}, o = { x: 20, y: 30 }, h = X.spawn(G, 'skill1_bullet', o.x, o.y, { seed: 1, dur: 5, follow: o });
        for (let i = 0; i < Math.round(secs * 60); i++) { o.x += step; X.update(G, 1 / 60); }
        const ctx = canvas(200, 60);
        X.draw(ctx, G);
        const d = ctx.getImageData(0, 0, 200, 60).data, colMax = [];
        for (let x = 0; x < 200; x++) { let m = 0; for (let y = 0; y < 60; y++) m = Math.max(m, d[(y * 200 + x) * 4]); colMax.push(m); }
        const lit = colMax.map((v, x) => v > 12 ? x : -1).filter(x => x >= 0);
        X.clear(G);
        const tr0 = h.trails[0];
        return { colMax, x0: lit.length ? lit[0] : -1, x1: lit.length ? lit[lit.length - 1] : -1, lit: lit.length, geo: tr0.head && tr0.pts.length ? +(tr0.head[0] - tr0.pts[0][0]).toFixed(1) : 0 };
      };
      const fast = trail(3, 0.4), slow = trail(1, 0.6);
      const hx = fast.x1;
      out.trail = { tex: V.effects.skill1_bullet.nodes[2].tr.tex, head: fast.colMax[hx - 4], mid: fast.colMax[hx - 45], x0: fast.x0, x1: fast.x1,
        slowGeo: slow.geo, slowLit: slow.lit };
    }
    // 11. Vòng lửa Fire (trứng rồng): shader Fair/Unlit/WarlockRing, sprite xám đục hoàn toàn -> vẽ cộng + nhuộm _Color;
    //     nền đen không được làm tối cảnh (trước: ô đen 41×41 px × thước). bosses.js additive() thành thừa.
    {
      const G = {}, h = X.spawn(G, 'Fire', 60, 60, { seed: 1, state: 'gas_start', dur: 2 });
      h.sys = [];
      run(G, 0.6);
      const ctx = canvas(120, 120); ctx.fillStyle = '#404040'; ctx.fillRect(0, 0, 120, 120);
      X.draw(ctx, G);
      const d = ctx.getImageData(0, 0, 120, 120).data;
      let darker = 0, brighter = 0;
      for (let i = 0; i < d.length; i += 4) { if (d[i] < 60 && d[i + 1] < 60 && d[i + 2] < 60) darker++; else if (d[i] > 80) brighter++; }
      const sr = V.effects.Fire.nodes[2].sr;
      out.fire = { b: sr.b, tint: sr.tint, darker, brighter };
      X.clear(G);
    }
    // 12. ice_explode (explode_big): chớp đen 0.0667–0.1333 s là THẬT — clip đặt m_Color.rgb (crc 2526845255 = m_Color.r)
    //     của SpriteRenderer Sprites-Default về 0 bằng khoá bậc thang; cùng đường cong ở 40 clip nổ explode_big.
    {
      const G = {}, h = X.spawn(G, 'ice_explode', 48, 48, { seed: 1, state: 'explode_big' });
      const at = t => { run(G, t - h.t); const n = h.nodes[1]; return [n.spr, +n.col[0].toFixed(2)]; };
      out.iceFlash = [at(0.05), at(0.1), at(0.14)];
      X.clear(G);
    }
    return out;
  });
  const sm = r.sprMode;
  check('hạt chế độ Sprite: cỡ = bề rộng rect sprite, cao theo tỉ lệ, đặt theo pivot (ice s12: 16 × 18.29 px, x 40..56, y 31.54..49.83)',
    sm.spr === 'hero_c02_skin_12_ice' && sm.n > 0 && Math.abs(sm.b[0] - 40) <= 0.1 && Math.abs(sm.b[1] - 56) <= 0.1 && Math.abs(sm.b[2] - 31.54) <= 0.15 && Math.abs(sm.b[3] - 49.83) <= 0.15,
    sm.n + ' hạt, khung [x0 x1 y0 y1] ' + JSON.stringify(sm.b) + ' (luật cũ: ô 16×16 giữa tâm = [40,56,40,56])');
  const tr = r.trail;
  check('TrailRenderer vẽ texture: #redtrail sáng ở đầu vệt, tối dần về đuôi (không còn nét đỏ phẳng)',
    tr.tex === '#redtrail' && tr.head >= 150 && tr.head >= 2.5 * tr.mid, 'đỏ đầu vệt ' + tr.head + ', cách đầu 45 px ' + tr.mid + ', vệt x ' + tr.x0 + '..' + tr.x1);
  check('TrailRenderer: vật chậm hơn minVertexDistance mỗi khung vẫn có vệt dài time × tốc độ (33 px)',
    Math.abs(tr.slowGeo - 33) <= 2 && tr.slowLit >= 15, 'đầu tới đỉnh cũ nhất ' + tr.slowGeo + ' px, ' + tr.slowLit + ' cột có điểm sáng (bản cũ: 1 đỉnh, không vẽ)');
  const fi = r.fire;
  check('Fire: vòng lửa WarlockRing vẽ cộng nhuộm _Color (1, 0.6815, 0.3451), không có ô đen',
    fi.b === 'add' && JSON.stringify(fi.tint) === '[1,0.6815,0.3451,1]' && fi.darker === 0 && fi.brighter > 30, 'blend ' + fi.b + ', tint ' + JSON.stringify(fi.tint) + ', ' + fi.darker + ' điểm ảnh tối hơn nền, ' + fi.brighter + ' sáng hơn');
  const ifl = r.iceFlash;
  check('ice_explode: chớp đen 0.0667–0.1333 s đúng clip gốc (m_Color về 0), rồi ice_explode_1 trắng',
    ifl[0][0] === 'ice_explode_0' && ifl[0][1] === 1 && ifl[1][0] === 'ice_explode_0' && ifl[1][1] === 0 && ifl[2][0] === 'ice_explode_1' && ifl[2][1] === 1, JSON.stringify(ifl));
  const an = r.angry;
  check('fighter_0_angry_effect: blend cộng theo shader (One One), không có ô tối', an.blend === 'add' && an.darker === 0 && an.brighter > 50,
    'blend ' + an.blend + ', ' + an.darker + ' điểm ảnh tối hơn nền, ' + an.brighter + ' sáng hơn');
  const ar = r.armor;
  check('arcaneknight armor: hạt chế độ Sprite một khung vẽ đúng sprite (không phải ô trắng)', ar.spr[0] === 'MagicKnight-skill2-armor' && ar.lit > 50 && ar.white / ar.lit < 0.3,
    ar.white + '/' + ar.lit + ' điểm ảnh trắng tinh');
  check('warliege_roll: nhánh tắt sẵn không vẽ', r.roll.off && r.roll.parts === 0, JSON.stringify(r.roll));
  const h = r.hit;
  check('hit_orange: hạt là ô vuông đặc đúng màu startColor rgb(255,227,75) (Sprites-Default không _MainTex)',
    h.tex === '#white' && h.lit > 20 && h.exact / h.lit >= 0.4, 'tex ' + h.tex + ', ' + h.exact + '/' + h.lit + ' điểm ảnh đúng màu, ' + h.parts + ' hạt');
  const s = r.shape;
  check('scalingMode Shape: o.scale 2 nới vùng phát, cỡ hạt giữ ≤ 0.4 đv (6.4 px)', s.scl === 2 && s.n > 0 && s.maxSide <= 6.45 && s.maxR > 1,
    'scl ' + s.scl + ', cạnh lớn nhất ' + s.maxSide.toFixed(2) + ' px, hạt xa tâm nhất ' + s.maxR.toFixed(2) + ' đv');
  const l = r.light;
  check('explode_s/light: 2 × _TintColor(1,1,1,1) của Particles/Additive -> đỏ ×≈2, lam ×≈4 so với không tint',
    JSON.stringify(l.tint) === '[2,2,2,2]' && l.rr >= 1.7 && l.rr <= 2.4 && l.rb >= 3.3 && l.rb <= 5, 'tint ' + JSON.stringify(l.tint) + ', điểm giữa ' + l.withT.slice(0, 3) + ' / ' + l.noT.slice(0, 3));
  const ic = r.ice;
  check('buff_ice: đứng yên suốt 2.75 s đóng băng, rồi tách khỏi quái + đổi ice_end, 2 s sau mờ 1 s và tắt',
    ic.end && ic.end.after === 2 && ic.end.spr === 'bullet_84' && ic.s1.a === 1 && ic.s1.x === 50 && ic.s2.spr === 'bullet_84' && ic.s2.a === 1 &&
    ic.s3.x === ic.s2.x && Math.abs(ic.s3.a - 0.5) <= 0.05 && ic.s4.alive === 0,
    JSON.stringify([ic.s1, ic.s2, ic.s3, ic.s4]));
  const ro = r.root;
  check('explode_energy3: bỏ vị trí gốc prefab (x 7.32 đv) — vẽ tại điểm nổ', ro.T0 === 7.32 && ro.n > 20 && Math.abs(ro.cx - 100) <= 4 && Math.abs(ro.cy - 60) <= 6,
    ro.n + ' điểm ảnh, tâm (' + ro.cx.toFixed(1) + ', ' + ro.cy.toFixed(1) + ') so với (100, 60)');
  check('kiểm độ trung thực không lỗi trang', errs.length === 0, errs.slice(0, 3).join(' | '));
  await p.close();
}

async function inGame(b) {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  watch(p, errs);
  await p.goto(BASE + 'index.html?quick=1');
  await p.waitForSelector('#sk-start', { state: 'visible', timeout: 10000 });
  // index.html chưa có thẻ script (bên lead thêm) → nạp tay theo đúng thứ tự sẽ thêm
  const tagged = await p.evaluate(() => !!(window.SK && SK.vfx));
  if (!tagged) {
    await p.addScriptTag({ url: BASE + 'data/sk-vfx.js' });
    await p.addScriptTag({ url: BASE + 'js/vfx.js' });
  }
  const hooked = await p.evaluate(async () => { const ok = SK.vfx.hook(); await SK.vfx.load(); return ok && !!SK.updateFx._vfx && !!SK.drawFx._vfx; });
  check('vfx.js móc vào SK.updateFx/SK.drawFx', hooked, tagged ? 'đã có thẻ script' : 'nạp bằng addScriptTag');
  await p.evaluate(() => SK_GAME.debug.seed(20260929));
  await p.click('#sk-start');
  await p.waitForFunction(() => SK_GAME.state === 'stage', null, { timeout: 5000 });
  await p.evaluate(() => SK_GAME.debug.god(true));
  await p.waitForTimeout(1900);
  const n = await p.evaluate(() => {
    const G = SK.G, pl = G.player;
    const list = ['explode_s', 'hit_yellow', 'Fire2', 'buff_fire', 'effect_black_smoke', 'muzzle_bullet_4'];
    list.forEach((nm, i) => SK.vfx.spawn(G, nm, pl.x - 60 + i * 24, pl.y - 20 + (i % 2) * 24, { seed: i, dur: 3 }));
    SK.vfx.spawn(G, 'buff_fire', 0, -14, { follow: pl, dur: 3 });
    return G.vfx.length;
  });
  await p.waitForTimeout(150);
  const mid = await p.evaluate(() => ({ n: SK.G.vfx.length, parts: SK.vfx.stats.particles }));
  await p.screenshot({ path: path.join(SHOTS, 'ingame.png') });
  check('trong game: hiệu ứng sinh ra và được cập nhật mỗi bước', n >= 6 && mid.n >= 1 && mid.parts > 0, n + ' sinh, sau 0.15 s còn ' + mid.n + ', ' + mid.parts + ' hạt');
  // dur 3 s + tuổi thọ hạt dài nhất (Fire2: 5 s [ĐO])
  const t0 = Date.now();
  await p.waitForFunction(() => SK.G.vfx.length === 0, null, { timeout: 12000 }).catch(() => {});
  const end = await p.evaluate(() => ({ n: SK.G.vfx.length, parts: SK.vfx.stats.particles }));
  check('trong game: hiệu ứng tắt hết sau dur + tuổi thọ hạt', end.n === 0 && end.parts === 0, 'tắt sau ' + ((Date.now() - t0) / 1000 + 0.15).toFixed(1) + ' s; còn ' + end.n + ' instance, ' + end.parts + ' hạt');
  check('trong game không lỗi trang', errs.length === 0, errs.slice(0, 3).join(' | '));
  await p.close();
}

(async () => {
  const b = await chromium.launch();
  try {
    await viewer(b);
    await fidelity(b);
    await inGame(b);
  } catch (e) {
    check('chạy hết kịch bản', false, e.message);
  }
  await b.close();
  console.log('soulknight-vfx: ' + pass + ' đạt, ' + fail + ' trượt');
  console.log(results.join('\n'));
  console.log('ảnh: ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
