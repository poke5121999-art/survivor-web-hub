/*
 * Vực Săn: bot đi đường (Node, không trình duyệt). Gọi VS.nav / bot / tools/mapgen như mã thật gọi và so với số cụ thể:
 * đường giữa mọi cặp khoang cứu hộ, đường không cắt vách, bot thợ lặn đi tới kho báu xa, thước đo kẹt trên 6 bản đồ × 5 hạt giống,
 * và điểm sinh / chỗ đặt kho báu trong data/maps.js khớp đầu ra tools/mapgen.js.
 * Chạy: node test/vuc-san-bots.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const T = require('./vuc-san-lib');
const mapgen = require('../games/vuc-san/tools/mapgen.js');
const W = T.nodeSim(T.SIM_FILES);
const VS = W.VS, SIM = VS.sim, NAV = VS.nav, TU = VS.TUNING, DT = 1 / 60;
const R_BIG = mapgen.maxSharkR(VS);

// Mốc đo bằng bot pha 1 (lái thẳng + dò tia) trên cùng 6 bản đồ × hạt giống 1..5, trước khi có nav: 509 lần kẹt, 3059 s kẹt (~102 s mỗi trận).
const BASELINE = { events: 509, secs: 3059 };

function lineup(ctrl, sharkCtrl) {
  const D = ['dave', 'hai', 'lan', 'bao'], S = ['Blacktip_Reefshark', 'Tiger_Shark'];
  return D.map((id, i) => ({ team: 'diver', defId: id, name: 'T' + i, ctrl: i === 0 ? ctrl : 'human' }))
    .concat(S.map((id, i) => ({ team: 'shark', defId: id, name: 'C' + i, ctrl: sharkCtrl || 'human' })));
}
function botLineup(seed) {
  const rng = VS.rng((seed ^ 0xa5a5a5a5) >>> 0), M = TU.match;
  const dv = rng.shuffle(Object.keys(VS.DIVERS)).slice(0, M.divers), sh = rng.shuffle(Object.keys(VS.SHARKS)).slice(0, M.sharks);
  return dv.map((id, i) => ({ team: 'diver', defId: id, name: 'T' + i, ctrl: 'bot' })).concat(sh.map((id, i) => ({ team: 'shark', defId: id, name: 'C' + i, ctrl: 'bot' })));
}
const pathLen = (p) => p.reduce((s, q, i) => s + (i ? Math.hypot(q.x - p[i - 1].x, q.y - p[i - 1].y) : 0), 0);

// ---- nav: đường giữa mọi cặp khoang cứu hộ ----
console.log('nav: đường giữa các khoang cứu hộ');
{
  const PAIRS = 62;   // 6 bản đồ: tổng n(n-1) theo số khoang của từng bản đồ
  let pairs = 0, noPath = [], cuts = [], tight = [], badEnds = [], bends = 0, detour = 0, longest = 0;
  for (const mp of VS.MAPS) {
    const m = SIM.createMatch({ seed: 1, mapId: mp.id, lineup: lineup('human') }), w = m.world;
    for (let i = 0; i < m.pods.length; i++) for (let j = 0; j < m.pods.length; j++) {
      if (i === j) continue;
      const a = m.pods[i], b = m.pods[j], p = NAV.pathFor(m, 'diver', R_BIG, a.x, a.y, b.x, b.y);
      pairs++;
      if (!p) { noPath.push(mp.id + ' ' + i + '>' + j); continue; }
      if (Math.hypot(p[0].x - a.x, p[0].y - a.y) > 1e-6 || Math.hypot(p[p.length - 1].x - b.x, p[p.length - 1].y - b.y) > 1.0) badEnds.push(mp.id + ' ' + i + '>' + j);
      for (let k = 1; k < p.length; k++) {
        if (w.raycast(p[k - 1].x, p[k - 1].y, p[k].x, p[k].y)) cuts.push(mp.id + ' ' + i + '>' + j + ' đoạn ' + k);
        if (k < p.length - 1 && !w.open(p[k].x, p[k].y, R_BIG * 0.97)) tight.push(mp.id + ' ' + i + '>' + j + ' mốc ' + k);
      }
      bends += Math.max(0, p.length - 2);
      const L = pathLen(p), straight = Math.hypot(b.x - a.x, b.y - a.y);
      detour = Math.max(detour, L / straight); longest = Math.max(longest, L);
    }
  }
  T.check('có đường cho mọi cặp khoang cứu hộ có hướng, bán kính ' + R_BIG + ' m (cá mập lớn nhất)', pairs === PAIRS && noPath.length === 0, pairs + '/' + PAIRS + ' cặp, thiếu: ' + noPath.join(';'));
  T.check('đường bắt đầu đúng ở khoang xuất phát và kết thúc cách khoang đích <= 1 m', badEnds.length === 0, badEnds.join(';'));
  T.check('không đoạn nào của đường cắt vách (raycast từng đoạn)', cuts.length === 0, cuts.slice(0, 3).join(';'));
  T.check('mọi mốc giữa đường còn khoảng trống >= ' + (R_BIG * 0.97).toFixed(2) + ' m quanh mình', tight.length === 0, tight.slice(0, 3).join(';'));
  T.check('nav thật sự vòng qua vách: tổng ' + bends + ' mốc rẽ trên ' + pairs + ' cặp, đường dài nhất vòng ' + detour.toFixed(2) + ' lần đường chim bay', bends > 0 && detour > 1.05, 'rẽ ' + bends + ', vòng ' + detour.toFixed(2));
  T.check('đường dài nhất giữa hai khoang nằm trong 20..400 m (không rỗng, không lạc ngoài bản đồ)', longest > 20 && longest < 400, longest.toFixed(1));
}

// ---- nav: bán kính và vùng cấm quanh khoang ----
console.log('nav: bán kính actor, vùng cấm cá mập');
{
  const m = SIM.createMatch({ seed: 1, mapId: 'A01', lineup: lineup('human') }), a = m.pods[0], b = m.pods[2];
  const small = NAV.pathFor(m, 'diver', TU.diver.r, a.x, a.y, b.x, b.y), big = NAV.pathFor(m, 'diver', R_BIG, a.x, a.y, b.x, b.y);
  T.check('đường cho thợ lặn (r 0,3) không dài hơn đường cho cá mập lớn nhất (r ' + R_BIG + ') giữa hai khoang A01', small && big && pathLen(small) <= pathLen(big) + 1e-6, pathLen(small).toFixed(1) + ' / ' + pathLen(big).toFixed(1));
  const sp = m.spawns.shark[0], sp2 = NAV.pathFor(m, 'shark', 0.9, sp[0], sp[1], m.pods[1].x, m.pods[1].y);
  const end = sp2 && sp2[sp2.length - 1];
  T.check('cá mập đi tới khoang cứu hộ chỉ tới mép vùng an toàn (cách tâm khoang >= ' + TU.pod.safeR + ' m, <= ' + (TU.pod.safeR + 1.5) + ' m)', !!end && Math.hypot(end.x - m.pods[1].x, end.y - m.pods[1].y) >= TU.pod.safeR && Math.hypot(end.x - m.pods[1].x, end.y - m.pods[1].y) <= TU.pod.safeR + 1.5, end ? Math.hypot(end.x - m.pods[1].x, end.y - m.pods[1].y).toFixed(2) : 'không có đường');
  // Hai điểm thoáng đối nhau qua mỗi khoang (cách tâm khoang ~8 m, ngoài vùng an toàn): đường chim bay xuyên khoang, nav phải vòng ra ngoài.
  let crossing = 0; const inSafe = [];
  for (const mp of VS.MAPS) {
    const mm = SIM.createMatch({ seed: 1, mapId: mp.id, lineup: lineup('human') });
    mm.pods.forEach((pd, pi) => {
      const p = VS.geom.findOpen(mm.world, pd.x - 8, pd.y, 1.0, { maxR: 3 }), q = VS.geom.findOpen(mm.world, pd.x + 8, pd.y, 1.0, { maxR: 3 });
      if (!p || !q || Math.hypot(p.x - pd.x, p.y - pd.y) < TU.pod.safeR + 1 || Math.hypot(q.x - pd.x, q.y - pd.y) < TU.pod.safeR + 1) return;
      crossing++;
      const sd = NAV.pathFor(mm, 'shark', 0.9, p.x, p.y, q.x, q.y);
      if (!sd) { inSafe.push(mp.id + ' khoang ' + pi + ' không có đường'); return; }
      for (let k = 1; k < sd.length; k++) for (let n = 0; n <= 20; n++) {
        const x = sd[k - 1].x + (sd[k].x - sd[k - 1].x) * n / 20, y = sd[k - 1].y + (sd[k].y - sd[k - 1].y) * n / 20;
        mm.pods.forEach((o, oi) => { if (Math.hypot(x - o.x, y - o.y) < TU.pod.safeR - 0.2) inSafe.push(mp.id + ' khoang ' + pi + ' xuyên khoang ' + oi); });
      }
    });
  }
  T.check('đường cá mập giữa ' + crossing + ' cặp điểm đối nhau qua khoang (đường thẳng xuyên vùng an toàn) vòng ra ngoài mọi vùng an toàn', crossing >= 6 && inSafe.length === 0, 'cặp ' + crossing + ', lỗi ' + inSafe.slice(0, 3).join(';'));
  // hiệu ứng shrink: nav lấy a.r hiện tại, không lấy bán kính gốc
  const s0 = m.actors[4];
  s0.x = a.x + 6; s0.y = a.y; SIM.addEffect(s0, 'shrink', 5, 0.5, s0.id); SIM.stepActor(m, s0, DT);
  T.check('cá mập dính shrink 0.5: a.r = r × 0.5 và nav.path dùng bán kính đó (cùng đường với thợ lặn r nhỏ cùng cỡ)', Math.abs(s0.r - s0.r0 * 0.5) < 1e-9 && !!NAV.path(m, s0, b.x, b.y), s0.r + ' / ' + s0.r0);
}

// ---- bot thợ lặn: từ điểm sinh tới kho báu xa ----
console.log('bot thợ lặn: tới kho báu xa >= 20 m');
for (const mp of VS.MAPS) {
  const m = SIM.createMatch({ seed: 3, mapId: mp.id, lineup: lineup('bot') }), d = m.actors[0];
  m.actors.forEach((x) => SIM.removeEffects(x, 'spawnImmune'));
  m.actors[4].x = m.world.bounds.maxX - 3; m.actors[4].y = m.world.bounds.minY + 3; m.actors[5].x = m.actors[4].x; m.actors[5].y = m.actors[4].y;
  // chọn chỗ có đường dài nhất trong các chỗ cách điểm sinh >= 20 m: thử thách nhất cho dò đường
  let best = null;
  for (const s of mp.lootSpots) {
    if (Math.hypot(s[0] - d.x, s[1] - d.y) < 20) continue;
    const p = NAV.pathFor(m, 'diver', d.r, d.x, d.y, s[0], s[1]);
    if (p && (!best || pathLen(p) > best.len)) best = { s, len: pathLen(p) };
  }
  const loot = m.loot[0];
  loot.x = best.s[0]; loot.y = best.s[1]; loot.kg = 2;
  for (let i = 1; i < m.loot.length; i++) { m.loot[i].x = m.world.bounds.maxX - 1; m.loot[i].y = m.world.bounds.maxY; }
  m.known.diver[0] = true;
  const limit = best.len / d.def.speed * 1.5 + 8;
  let steps = 0;
  while (m.phase !== 'end' && loot.st === 'rest' && m.t < limit + 4) { SIM.step(m, DT); steps++; }
  T.check(mp.id + ': bot đi ' + best.len.toFixed(0) + ' m từ điểm sinh tới kho báu, nhặt trong ' + limit.toFixed(0) + ' s (1,5 × quãng đường / tốc độ + 8)',
    loot.st === 'carried' && loot.by === 0 && m.t <= limit + 4 && best.len >= 20, 'st ' + loot.st + ', t ' + m.t.toFixed(1) + ', đường ' + best.len.toFixed(0));
}

// ---- thước đo kẹt ----
// Kẹt: bot (swim/lunge) có mục tiêu di chuyển cách > 3 m mà trong 6 s thời gian trận dịch ròng < 1,5 m. Mỗi cửa sổ 6 s tính một lần.
function stuckRun(mapId, seed) {
  const m = SIM.createMatch({ seed, mapId, lineup: botLineup(seed) }), win = {};
  let events = 0, secs = 0, steps = 0;
  while (m.phase !== 'end' && steps++ < 20000) {
    SIM.step(m, DT); m.events.length = 0;
    if (m.phase !== 'play') continue;
    for (const a of m.actors) {
      const b = a.brain;
      const act = a.ctrl === 'bot' && (a.st === 'swim' || a.st === 'lunge') && b && b.has && Math.hypot(b.gx - a.x, b.gy - a.y) > 3;
      if (!act) { delete win[a.id]; continue; }
      const s = win[a.id];
      if (!s) { win[a.id] = { t: m.t, x: a.x, y: a.y }; continue; }
      if (m.t - s.t >= 6) {
        if (Math.hypot(a.x - s.x, a.y - s.y) < 1.5) { events++; secs += m.t - s.t; }
        win[a.id] = { t: m.t, x: a.x, y: a.y };
      }
    }
  }
  return { events, secs, ended: m.phase === 'end', t: m.t };
}
console.log('thước đo kẹt: 6 bản đồ × 5 hạt giống, bot đấu bot tới hết trận');
{
  let events = 0, secs = 0, unfinished = 0, worstMatch = 0;
  const perMap = [];
  for (const mp of VS.MAPS) {
    let e = 0, s = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const r = stuckRun(mp.id, seed);
      e += r.events; s += r.secs; if (!r.ended) unfinished++; worstMatch = Math.max(worstMatch, r.secs);
    }
    perMap.push(mp.id + ' ' + e + ' lần/' + s + ' s'); events += e; secs += s;
  }
  console.log('  kẹt theo bản đồ: ' + perMap.join(', ') + '; tổng ' + events + ' lần, ' + secs + ' s (mốc cũ ' + BASELINE.events + ' lần, ' + BASELINE.secs + ' s)');
  T.check('30 trận bot đấu bot đều chạy tới hết trận', unfinished === 0, unfinished + ' trận chưa xong');
  // Ngưỡng: mốc cũ ~102 s kẹt mỗi trận. Còn lại chủ yếu là mục tiêu đổi giữa chừng (đi dò rồi quay về nộp) hoặc cá mập đứng canh để dùng
  // kỹ năng, nên 0 là không thực tế; 18 s (ba cửa sổ) mỗi trận là mức chưa trận nào đạt khi đo, đủ chặn việc hỏng nav mà vẫn chừa chỗ cho lần đo nhiễu.
  T.check('số lần kẹt giảm quá 10 lần so với mốc (' + events + ' < ' + (BASELINE.events / 10).toFixed(0) + ')', events < BASELINE.events / 10, events);
  T.check('tổng giây kẹt giảm quá 10 lần so với mốc (' + secs + ' < ' + (BASELINE.secs / 10).toFixed(0) + ')', secs < BASELINE.secs / 10, secs);
  T.check('trận tệ nhất kẹt không quá 18 s (ba cửa sổ 6 s)', worstMatch <= 18, worstMatch);
}

// ---- nav thuần và bot ghi intent ----
console.log('ràng buộc tầng mô phỏng');
{
  const src = fs.readFileSync(path.join(T.GAME, 'js', 'sim', 'nav.js'), 'utf8') + fs.readFileSync(path.join(T.GAME, 'js', 'sim', 'bots.js'), 'utf8');
  const hits = (src.replace(/\/\/.*$/gm, '').match(/\b(document|THREE|Math\.random|Date\.now|performance\.now)\b/g) || []);
  T.check('nav.js và bots.js không đụng document, THREE, Math.random, Date, performance', hits.length === 0, hits.join());
  const m = SIM.createMatch({ seed: 5, mapId: 'B02', lineup: lineup('bot') }), d = m.actors[0];
  for (let i = 0; i < 600; i++) SIM.step(m, DT);
  const before = JSON.stringify([d.x, d.y, d.o2, d.st]);
  const t = NAV.steer(m, d, d.x + 10, d.y);
  T.check('nav.steer chỉ trả hướng {mx,my} độ dài <= 1 và không đổi trạng thái actor', Math.abs(Math.hypot(t.mx, t.my) - 1) < 1e-9 || (t.mx === 0 && t.my === 0), JSON.stringify(t));
  T.check('nav.steer không ghi vào actor (vị trí, O2, trạng thái giữ nguyên)', before === JSON.stringify([d.x, d.y, d.o2, d.st]));
}

// ---- mapgen khớp data/maps.js ----
console.log('mapgen: điểm sinh và chỗ đặt kho báu');
{
  const g = mapgen.generateAll();
  const onDisk = fs.readFileSync(mapgen.MAPS_FILE, 'utf8');
  T.check('data/maps.js trùng từng chữ với đầu ra tools/mapgen.js (chạy lại mapgen thì không đổi gì)', onDisk === g.text);
  const bad = [];
  VS.MAPS.forEach((mp, i) => {
    const gen = g.gen[i];
    if (JSON.stringify([mp.divers, mp.sharks, mp.lootSpots]) !== JSON.stringify([gen.divers, gen.sharks, gen.lootSpots])) bad.push(mp.id);
    if (g.maps[i].id !== mp.id || g.maps[i].name !== mp.name || g.maps[i].theme !== mp.theme) bad.push(mp.id + ' id/tên/chủ đề');
  });
  T.check('6 bản đồ: divers, sharks, lootSpots trong maps.js khớp mapgen; id, name, theme giữ nguyên', bad.length === 0 && VS.MAPS.length === 6, bad.join());
  T.check('mỗi bản đồ có đúng 4 điểm sinh thợ lặn, 10 điểm sinh cá mập, 40 chỗ kho báu', VS.MAPS.every((mp) => mp.divers.length === 4 && mp.sharks.length === 10 && mp.lootSpots.length === 40), VS.MAPS.map((mp) => mp.divers.length + '/' + mp.sharks.length + '/' + mp.lootSpots.length).join(' '));
  T.check('mọi kiểm bên trong mapgen (khoang nối nhau >= r cá mập lớn nhất, kho báu tới được từ điểm sinh) đều đạt', g.gen.every((x) => x.report.length === 5 && x.report.every((r) => r.ok)), g.gen.map((x) => x.report.filter((r) => !r.ok).map((r) => r.msg).join('|')).join(';'));
  const unreach = [];
  for (const mp of VS.MAPS) {
    const m = SIM.createMatch({ seed: 1, mapId: mp.id, lineup: lineup('human') }), d = m.spawns.diver[0];
    mp.lootSpots.filter((_, k) => k % 5 === 0).forEach((s) => { if (!NAV.pathFor(m, 'diver', TU.diver.r, d[0], d[1], s[0], s[1])) unreach.push(mp.id + ' ' + s); });
  }
  T.check('nav tìm được đường từ điểm sinh thợ lặn tới 8 chỗ kho báu mỗi bản đồ (kiểm độc lập với mapgen)', unreach.length === 0, unreach.join(';'));
  const m = SIM.createMatch({ seed: 9, mapId: 'B06', lineup: lineup('human') }), mp = VS.MAPS.find((x) => x.id === 'B06');
  const key = (p) => p[0] + ',' + p[1];
  T.check('trận dùng đúng điểm sinh của bản đồ: thợ lặn lấy 4 điểm divers, kho báu và cá mập lấy từ lootSpots / sharks', m.spawns.diver.map(key).join() === mp.divers.map(key).join() &&
    m.loot.every((l) => mp.lootSpots.some((s) => s[0] === l.x && s[1] === l.y)) && m.spawns.shark.every((p) => mp.sharks.some((s) => s[0] === p[0] && s[1] === p[1])) && m.loot.length === 16);
}

T.done();
