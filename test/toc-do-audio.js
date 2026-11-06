/*
 * Tốc Độ: âm thanh. Phần Node: mọi tệp TD.AUDIO có trên đĩa, mọi tên event mà mã game phát đều có mục TD.AUDIO.
 * Phần trình duyệt: mở khoá âm thanh nạp hết tệp, vào trận thì đếm lùi phát đúng tệp (3 nhịp rồi Play_BGM_Go).
 * Chạy: node test/toc-do-audio.js   (trình duyệt: qua btest.sh; TD_NODE_ONLY=1 chỉ chạy phần Node)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const T = require('./toc-do-lib');

function walk(d, out) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p, out); else if (f.name.endsWith('.js')) out.push(p);
  }
  return out;
}

function nodePart() {
  console.log('tệp và event');
  const G = T.GAME;
  const defs = {};
  for (const f of walk(path.join(G, 'data'), [])) {
    const txt = fs.readFileSync(f, 'utf8');
    for (const m of txt.matchAll(/TD\.AUDIO\[\s*"([^"]+)"\s*\]\s*=\s*(\{.*\});/g)) defs[m[1]] = new Function('return (' + m[2] + ')')();
  }
  const keys = Object.keys(defs);
  T.check('có ít nhất 35 mục TD.AUDIO', keys.length >= 35, keys.length);
  const bad = [];
  for (const k of keys) {
    const e = defs[k];
    if (!e.files.length) bad.push(k + ': không có tệp');
    for (const f of e.files) {
      const p = path.join(G, f);
      if (!fs.existsSync(p) || fs.statSync(p).size < 200) bad.push(k + ': thiếu hoặc rỗng ' + f);
    }
  }
  T.check('mọi tệp TD.AUDIO có trên đĩa', bad.length === 0, bad.slice(0, 4).join(' | '));
  const missing = (fs.readFileSync(path.join(G, 'data/audio.js'), 'utf8').match(/"event": "\w+"/g) || []).map((s) => s.slice(10, -1));
  const used = new Map();
  for (const f of walk(path.join(G, 'js'), [])) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/'(Play_\w+)'/g)) used.set(m[1], path.relative(G, f));
  }
  const unresolved = [...used].filter(([ev]) => !defs[ev]).map(([ev, f]) => ev + ' (' + f + ')');
  T.check('mọi event mã game phát đều có trong TD.AUDIO', unresolved.length === 0, unresolved.join(', '));
  T.check('không event nào vừa có tệp vừa nằm trong AUDIO_MISSING', missing.every((m) => !defs[m]));
  T.check('mã game dùng ít nhất 25 event', used.size >= 25, used.size);
  T.check('đếm lùi: nhịp thường 0.47 s, nhịp cuối 0.6 s, GO 2 s',
    defs.Play_BGM_CountDown.dur[0] === 0.47 && defs.Play_BGM_CountDown_Final.dur[0] === 0.6 && defs.Play_BGM_Go.dur[0] === 2);
}

async function browserPart(base) {
  console.log('trình duyệt: mở khoá và đếm lùi');
  const br = await T.browser();
  try {
    const { page, problems } = await T.open(br, base, 'index.html', { width: 1366, height: 650 });
    await page.waitForFunction(() => window.TD && TD.main && TD.main.state === 'lobby', null, { timeout: 60000 });
    T.check('trước khi mở khoá chưa có AudioContext', await page.evaluate(() => !TD.audio.ctx));
    await page.evaluate(() => {
      // ghi lại mọi tiếng thật sự phát: tên event + thời lượng bộ đệm
      window.__played = [];
      const A = TD.audio, play = A.play;
      A.play = function (ev, o) { const h = play.call(A, ev, o); window.__played.push({ ev, ok: !!h, dur: h && h.src.buffer ? +h.src.buffer.duration.toFixed(2) : 0 }); return h; };
    });
    await page.keyboard.press('Shift');   // phím đầu tiên mở khoá
    await page.waitForFunction(() => TD.audio.ctx && TD.audio.ready, null, { timeout: 60000 });
    const st = await page.evaluate(() => ({ loaded: TD.audio.loaded, total: TD.audio.total }));
    T.check('mở khoá nạp và giải mã đủ tệp', st.loaded === st.total && st.total >= 36, st.loaded + '/' + st.total);
    await page.evaluate(() => { window.__played.length = 0; TD.save.d.track = TD.save.d.track || Object.keys(TD.TRACKS)[0]; });
    // data/cars.js liệt kê xe chưa có glb (vd 567): bot rút trúng thì startRace ném 404, nên thử lại vài lần
    for (let i = 0; i < 6; i++) {
      const ok = await page.evaluate(() => TD.main.startRace({ mode: 'speed' }).then(() => true, () => false));
      if (ok) break;
    }
    await page.waitForFunction(() => TD.main.state === 'race', null, { timeout: 120000 });
    await page.evaluate(() => { TD.main.introT = 99; TD.main.timeScale = 3; });
    await page.waitForFunction(() => TD.main.race.phase === 'race', null, { timeout: 60000 });
    const seq = await page.evaluate(() => window.__played.filter((p) => /CountDown|Go$/.test(p.ev)));
    const names = seq.map((p) => p.ev).join();
    const C = 'Play_BGM_CountDown', F = 'Play_BGM_CountDown_Final';
    T.check('đếm lùi phát 3 nhịp rồi GO', names === [C, C, C, 'Play_BGM_Go'].join() || names === [C, C, F, 'Play_BGM_Go'].join(), names);
    T.check('mỗi lần phát có bộ đệm giải mã (không câm)', seq.length > 0 && seq.every((p) => p.ok && p.dur > 0.3), JSON.stringify(seq.map((p) => p.dur)));
    T.check('GO dài 2 s', seq.length > 0 && seq[seq.length - 1].dur === 2);
    T.check('không lỗi trang', problems.length === 0, problems.slice(0, 4).join(' | '));
    await page.context().close();
  } catch (e) { T.check('trình duyệt chạy hết không ném lỗi', false, e.message); }
  await br.close();
}

(async () => {
  nodePart();
  if (!process.env.TD_NODE_ONLY) {
    const srv = await T.serve();
    await browserPart(srv.base);
    srv.close();
  }
  T.done();
})();
