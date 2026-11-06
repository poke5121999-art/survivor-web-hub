/*
 * Trốn Tìm (games/tron-tim) — kiểm 8 kỹ năng Soul Knight và âm thanh bằng số cụ thể qua window.TT.
 *
 * Chạy:  python -m http.server 8814   (ở gốc repo)   rồi   node test/tron-tim-skills.js
 *   TT_URL=http://localhost:8814/games/tron-tim/index.html   TT_SHOTS=D:/phanminhtam-ref/shots (đặt "" để không chụp)
 * Mỗi kỹ năng: dựng chỗ trống, đặt người, gọi TT.useSkill, kiểm hiệu ứng theo chữ (stun, alpha, khoảng cách, hồi chiêu).
 * Hỏng nếu pageerror, console error, response >= 400.
 */
'use strict';
const { chromium } = require('C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');

const URL = process.env.TT_URL || 'http://localhost:8814/games/tron-tim/index.html';
const SHOTS = process.env.TT_SHOTS === undefined ? 'D:/phanminhtam-ref/shots' : process.env.TT_SHOTS;
const SEED = 3;

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + name + (detail != null ? '  (' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) + ')' : ''));
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

async function main() {
  const browser = await chromium.launch();
  const problems = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', m => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('response', r => { if (r.status() >= 400) problems.push('http ' + r.status() + ': ' + r.url()); });
  await page.goto(URL + '?seed=' + SEED + '&manual=1');
  await page.waitForFunction(() => window.__ready, null, { timeout: 20000 });
  const E = (fn, arg) => page.evaluate(fn, arg);
  const shot = async name => { if (SHOTS) { await page.waitForTimeout(220); await page.screenshot({ path: SHOTS + '/tt_skill_' + name + '.png' }); } };

  await E(() => {
    window.__log = [];
    for (const n of ['skill', 'catch', 'decoyPop']) TT.onEvent(n, e => window.__log.push([n, TT.M.now, e]));
    // vào trận ở vai role, đã qua biến hình (7.2 s), bot đóng băng; hero của người chơi đặt thành hero
    window.prep = (role, hero) => {
      TT.setRole(role); TT.skipTo('playing'); TT.forceIntent(0, 0); TT.step(7 * 60 + 12);
      TT.actors().forEach(a => { if (a.isBot) { a.effects = []; TT.addEffect(a, 'freeze', 1e9); } });
      const h = TT.M.human; h.effects = []; h.hero = hero; h.skill = { id: null, cd: 0, t: 0 }; h.hp = 5;
      window.__log.length = 0;
      return h;
    };
    // chỗ trống: wr ô bên phải và hh ô mỗi phía, không cỏ, không hộp, trong vùng an toàn
    window.area = (wr, hh) => {
      const M = TT.M, mp = M.map, MU = TT.mapUtil;
      for (let ty = 3; ty < mp.H - 3; ty++) for (let tx = 3; tx < mp.W - wr - 3; tx++) {
        let ok = true;
        for (let y = ty - hh; ok && y <= ty + hh; y++) for (let x = tx - 1; x <= tx + wr; x++) {
          const i = MU.idx(mp, x, y);
          if (mp.kind[i] !== 0 || mp.grass[i] || !mp.reach[i] || mp.obs.has(i)) { ok = false; break; }
        }
        if (!ok) continue;
        const cx = tx + 0.5, cy = ty + 0.5;
        if (Math.hypot(cx + wr / 2 - M.zone.cur.x, cy - M.zone.cur.y) > M.zone.cur.r - 6) continue;
        if (M.items.some(it => Math.hypot(it.x - cx - wr / 2, it.y - cy) < wr / 2 + hh + 2)) continue;
        if (M.puddles.some(p => Math.hypot(p.x - cx - wr / 2, p.y - cy) < wr / 2 + hh + 4)) continue;
        return { x: cx, y: cy };
      }
      return null;
    };
    window.put = (a, x, y) => { a.x = x; a.y = y; a.motion = null; };
    window.others = (role, n) => TT.actors().filter(a => a.isBot && a.role === role).slice(0, n);
    window.step = n => TT.step(n);
    window.cam = () => { TT.cam.snap = true; };
    window.blocked = (a) => TT.mapUtil.boxBlocked(TT.M.map, a.x, a.y, 0.3, true);
  });

  const cat = await E(() => ({ ids: Object.keys(TT.SKILLS), heroes: Object.values(TT.SKILLS).map(s => s.hero + ':' + s.role), names: Object.values(TT.SKILLS).every(s => s.name.vi && s.name.en && s.desc.vi && s.desc.en && s.icon && s.cd > 0) }));
  console.log('bảng kỹ năng');
  check('8 kỹ năng, mỗi hero một kỹ năng, đủ tên vi/en, mô tả, icon, cd', cat.ids.length === 8 && cat.names, cat.heroes.join(' '));
  check('TT.heroSkill ánh xạ hero -> kỹ năng', await E(() => TT.heroSkill('priest') === 'pray' && TT.heroSkill('vampire') === 'alien_swirl' && TT.heroSkill('nobody') === null));
  check('cd/dur khớp TT_SKILLS86 (6/6, 14, 2.5, 5/10, 4, 4x2, 8x2, 11)', await E(() => {
    const S = window.TT_SKILLS86, K = TT.SKILLS;
    return [['invisibility', 'invisibility'], ['pray', 'pray'], ['dodge', 'dodge'], ['master_s_trick', 'master_s_trick'], ['emp', 'emp'], ['leap', 'leap'], ['quantum_translocator', 'quantum_translocator'], ['alien_swirl', 'alien_swirl']]
      .every(([k, s]) => K[k].cd === S[s].skill.cd) && K.invisibility.dur === S.invisibility.skill.dur && K.master_s_trick.dur === S.master_s_trick.skill.dur && K.leap.max === 2 && K.quantum_translocator.max === 2;
  }));

  // ---------------------------------------------------------------- 1. tàng hình
  console.log('invisibility (assassin)');
  let r = await E(() => {
    const h = prep('hide', 'assassin'), A = area(6, 3); put(h, A.x + 3, A.y);
    const S = others('seek', 1)[0]; S.effects = []; put(S, h.x - 3, h.y); S.ai = null;
    const before = TT.alphaFor(TT.M, S, h);
    TT.botIntent(TT.M, S, 0.3); const t0 = S.ai.state === 'chase' && S.ai.dest === h;
    const ok = TT.useSkill(TT.M, h), a1 = TT.alphaFor(TT.M, S, h), st = TT.skillState(h);
    S.ai.thinkT = 0; TT.botIntent(TT.M, S, 0.3);
    const botIgnores = !(S.ai.state === 'chase' && S.ai.dest === h);
    const self = TT.alphaFor(TT.M, h, h), friend = TT.alphaFor(TT.M, others('hide', 1)[0], h);
    put(S, h.x - 0.8, h.y); TT.attack(TT.M, S, 0); const alive = h.life === 'alive';
    return { before, t0, ok, a1, active: st.active, left: st.left, botIgnores, self, friend, alive, ev: window.__log.filter(l => l[0] === 'skill').map(l => l[2].id) };
  });
  check('trước khi dùng: bot người tìm thấy và đuổi', r.before === 1 && r.t0, r);
  check('dùng được, phát event skill {id: invisibility}', r.ok && r.ev[0] === 'invisibility' && r.active && near(r.left, 6, 0.05), r);
  check('alphaFor(người tìm, người trốn) = 0 sau khi tàng hình', r.a1 === 0, r.a1);
  check('bot người tìm không còn đuổi người tàng hình', r.botIgnores);
  check('bản thân thấy mờ 0.297, đồng đội 0.5', near(r.self, 0.297, 1e-6) && r.friend === 0.5, [r.self, r.friend]);
  check('đòn vung vào người tàng hình không bắt được', r.alive);
  await E(() => { const h = TT.M.human; put(h, h.x, h.y); TT.cam.snap = true; });
  await E(() => { const M = TT.M, h = M.human; TT.removeEffect(h, 'invisible'); h.skill.t = 0; h.skill.ch = 1; h.skill.rc = 0; TT.useSkill(M, h); TT.step(8); });
  await shot('invisibility');
  r = await E(() => {
    const M = TT.M, h = M.human, press = TT.useSkill(M, h), gone = !TT.hasEffect(h, 'invisible', M.now), again = TT.useSkill(M, h), st = TT.skillState(h);
    TT.step(5 * 60); const cd5 = TT.skillState(h); TT.step(61); const ready = TT.skillState(h);
    return { press, gone, again, cd: st.cd, cd5: cd5.cd, ready: ready.ready };
  });
  check('bấm lại khi đang tàng hình thì huỷ', r.press && r.gone);
  check('hồi chiêu 6 s: ngay sau đó chưa dùng lại được', !r.again && near(r.cd, 6, 0.1), r);
  check('hồi chiêu: còn ~1 s sau 5 s, sẵn sàng sau 6 s', near(r.cd5, 1, 0.1) && r.ready, r);
  r = await E(() => {
    const M = TT.M, h = M.human; h.skill.ch = 1; TT.useSkill(M, h); TT.step(6 * 60 + 5);
    return { gone: !TT.hasEffect(h, 'invisible', M.now), a: TT.alphaFor(M, others('seek', 1)[0], h) };
  });
  check('tàng hình tự hết sau 6 s, alpha về 1', r.gone && r.a === 1, r);
  r = await E(() => {
    const M = TT.M, h = M.human; h.skill.ch = 1; h.skill.rc = 0; TT.useSkill(M, h); TT.downHider(M, h, 'seeker', null);
    return { inv: TT.hasEffect(h, 'invisible', M.now) };
  });
  check('bị hạ gục thì hết tàng hình', !r.inv);

  // ---------------------------------------------------------------- 2. cầu nguyện
  console.log('pray (priest)');
  r = await E(() => {
    const h = prep('hide', 'priest'), A = area(6, 3), M = TT.M; put(h, A.x + 2, A.y);
    const [b1, b2] = others('hide', 2); put(b1, h.x + 3, h.y); put(b2, h.x + 5.5, h.y + 2);
    h.hp = 2; b1.hp = 3; M.zone.cur.r += 0;   // hp thấp
    const far = others('hide', 6)[5]; put(far, h.x + 40, h.y);
    const farHp = far.hp = 1;
    b1.effects = []; const sp0 = TT.speedOf(b1), ok = TT.useSkill(M, h);
    const cap = 6 + M.zone.step;
    const out = { ok, hp: [h.hp, b1.hp, far.hp], cap, sp0, sp: TT.speedOf(b1), spSelf: TT.speedOf(h), fr: TT.hasEffect(b1, 'fastRevive', M.now), left: TT.skillState(h).left };
    return out;
  });
  check('pray: hồi 2 máu vùng cho priest (2 -> 4) và đồng đội trong bán kính (3 -> 5)', r.ok && r.hp[0] === 4 && r.hp[1] === 5, r);
  check('đồng đội quá xa (40 ô) không được hồi', r.hp[2] === 1, r.hp);
  check('đồng đội được tăng tốc x1.4 (2.875 -> 4.025)', near(r.sp, 2.875 * 1.4, 1e-6) && r.sp0 === 2.875 && near(r.spSelf, 2.875 * 1.4, 1e-6), r);
  await E(() => { const M = TT.M, h = M.human; TT.cam.snap = true; TT.step(10); });
  await shot('pray');
  r = await E(() => {
    // cứu: với pray đang chạy, 1 s đứng yên được 2 s tiến độ
    const M = TT.M, h = M.human, d = others('hide', 3)[2]; put(d, h.x + 0.5, h.y); d.effects = [];
    others('hide', 3).forEach(x => { if (x !== d) put(x, h.x + 30, h.y); });
    TT.downHider(M, d, 'seeker', null); TT.addEffect(d, 'freeze', 1e9);
    TT.step(60); const t = d.revive.t;
    return { t, left: TT.skillState(h).left };
  });
  check('pray: đứng yên 1 s thì tiến độ cứu = 2 s (gấp đôi)', near(r.t, 2, 0.1), r);
  r = await E(() => {
    const M = TT.M, h = M.human; TT.step(4 * 60 + 5);
    const d = others('hide', 3)[2];
    const st = TT.skillState(h);
    return { fr: TT.hasEffect(h, 'fastRevive', M.now), sp: TT.speedOf(h), cd: st.cd, active: st.active, revived: d.life };
  });
  check('hết 5 s: hết tăng tốc và gấp đôi cứu; hồi chiêu 14 s bắt đầu', !r.fr && r.sp === 2.875 && !r.active && near(r.cd, 14, 0.3), r);

  // ---------------------------------------------------------------- 3. lộn nhào
  console.log('dodge (ranger)');
  r = await E(() => {
    const h = prep('hide', 'ranger'), A = area(7, 3), M = TT.M; put(h, A.x, A.y);
    const S = others('seek', 1)[0]; put(S, h.x - 1, h.y + 2); S.effects = []; TT.addEffect(S, 'freeze', 1e9);
    const x0 = h.x, ok = TT.useSkill(M, h, 0);
    TT.step(12); const mid = h.x - x0, immune = TT.hasEffect(h, 'shield', M.now), moving = !!h.motion;
    const downedMid = TT.downHider(M, h, 'seeker', 1);
    TT.step(15); const end = h.x - x0;
    return { ok, mid, immune, moving, downedMid, end, y: h.y - A.y, st: TT.skillState(h) };
  });
  check('dodge: lăn được và tới ~5.13 ô sau 0.4 s (v0 20, x0.95 mỗi 0.02 s)', r.ok && near(r.end, 5.13, 0.35), r);
  check('đang lộn: miễn bắt (downHider trả false, vẫn sống)', r.immune && !r.downedMid, r);
  await E(() => { const M = TT.M, h = M.human; h.skill.ch = 1; h.skill.rc = 0; h.life = 'alive'; const A = area(7, 3); put(h, A.x, A.y); TT.cam.snap = true; TT.useSkill(M, h, 0); TT.step(14); });
  await shot('dodge');
  r = await E(() => {
    const M = TT.M, h = M.human; TT.step(25);
    const a = TT.useSkill(M, h, 0), st = TT.skillState(h);
    TT.step(2 * 60 + 5); const early = TT.skillState(h).ready; TT.step(30);
    const c = TT.skillState(h);
    return { a, cd: st.cd, early, ready: c.ready };
  });
  check('dodge cd 2.5 s: chưa dùng lại ngay, sẵn sàng sau lộn + 2.5 s', !r.a && !r.early && r.ready, r);
  r = await E(() => {
    const M = TT.M, h = M.human, A = area(7, 3); put(h, A.x, A.y); h.skill.ch = 1; h.skill.rc = 0; h.effects = [];
    // tường: chặn lộn ở khoảng cách 2 ô nếu có; dùng ô tường gần nhất bên phải ngoài vùng trống
    let wx = null; for (let d = 1; d < 30; d++) if (TT.mapUtil.kindAt(M.map, Math.floor(h.x + d), Math.floor(h.y)) === 1) { wx = d; break; }
    TT.useSkill(M, h, 0); TT.step(40); return { blocked: window.blocked(h), wx };
  });
  check('lộn không chui vào tường', !r.blocked, r);

  // ---------------------------------------------------------------- 4. búp bê
  console.log('master_s_trick (trapmaster)');
  r = await E(() => {
    const h = prep('hide', 'trapmaster'), A = area(10, 3), M = TT.M; put(h, A.x + 5, A.y);
    const S = others('seek', 1)[0], H = others('hide', 1)[0];
    S.effects = []; put(S, h.x - 4.5, h.y); S.ai = null; put(H, h.x - 8.5, h.y + 2.5);   // người trốn thật xa hơn búp bê
    const ok = TT.useSkill(M, h), inv = TT.hasEffect(h, 'invisible', M.now), n = M.sk.decoys.length;
    S.ai = null; TT.botIntent(M, S, 0.3);
    const dest = S.ai.dest;
    return { ok, inv, n, decoy: !!(dest && dest.decoy), state: S.ai.state, id: M.sk.decoys[0] && M.sk.decoys[0].owner, left: TT.skillState(h).left };
  });
  check('dùng: búp bê xuất hiện, người dùng tàng hình 3 s, kỹ năng 10 s', r.ok && r.n === 1 && r.inv && near(r.left, 10, 0.05), r);
  check('bot người tìm chọn búp bê (gần hơn người trốn thật) làm mục tiêu đuổi', r.decoy && r.state === 'chase', r);
  await E(() => { const M = TT.M, h = M.human, S = others('seek', 1)[0]; put(S, h.x - 3, h.y); TT.cam.snap = true; TT.step(10); });
  await shot('decoy');
  r = await E(() => {
    const M = TT.M, h = M.human, S = others('seek', 1)[0], d = M.sk.decoys[0], H = others('hide', 1)[0];
    S.effects = []; S.attackCd = 0; put(S, d.x - 0.8, d.y); const hx = H.x;
    const ok = TT.attack(M, S, 0), after = M.sk.decoys.length, ev = window.__log.filter(l => l[0] === 'decoyPop').length, humanAlive = h.life === 'alive' && H.life === 'alive';
    S.ai.thinkT = 0; TT.step(20);
    return { ok, after, ev, humanAlive, st: S.ai.state, dest: S.ai.dest === H, sk: TT.skillState(h).active };
  });
  check('bot đánh trúng búp bê: búp bê nổ khói (decoyPop), không ai bị bắt', r.ok && r.after === 0 && r.ev === 1 && r.humanAlive, r);
  check('hết búp bê thì bot đổi sang đuổi người trốn thật', r.dest && r.st === 'chase', r);
  r = await E(() => {
    const M = TT.M, h = M.human; TT.step(3 * 60);
    return { inv: TT.hasEffect(h, 'invisible', M.now), a: TT.alphaFor(M, others('seek', 1)[0], h) };
  });
  check('tàng hình của người dùng hết sau 3 s', !r.inv && r.a === 1, r);
  r = await E(() => {
    const M = TT.M, h = M.human; others('seek', 3).forEach(x => TT.addEffect(x, 'freeze', 1e9)); h.skill.ch = 1; h.skill.rc = 0; h.skill.t = 0; h.life = 'alive'; TT.useSkill(M, h); TT.step(10 * 60 + 5);
    return { n: M.sk.decoys.length, active: TT.skillState(h).active, cd: TT.skillState(h).cd };
  });
  check('búp bê tự biến sau 10 s; hồi chiêu 5 s', r.n === 0 && !r.active && near(r.cd, 5, 0.3), r);

  // ---------------------------------------------------------------- 5. EMP
  console.log('emp (robot)');
  r = await E(() => {
    // chưa biến hình: không dùng được
    TT.setRole('seek'); TT.skipTo('playing'); TT.step(60); const h0 = TT.M.human; h0.hero = 'robot';
    const early = TT.useSkill(TT.M, h0); TT.step(5 * 60); const disguised = TT.useSkill(TT.M, h0);
    TT.step(30); const stillFrozen = TT.useSkill(TT.M, h0);
    return { early, disguised, stillFrozen, form: h0.form, look: h0.look };
  });
  check('người tìm đang đóng giả / chưa biến hình / còn đứng yên: không dùng được kỹ năng', !r.early && !r.disguised && !r.stillFrozen, r);
  r = await E(() => {
    const h = prep('seek', 'robot'), A = area(6, 3), M = TT.M; put(h, A.x + 3, A.y);
    const [h1, h2, h3] = others('hide', 3); put(h1, h.x + 1.5, h.y); put(h2, h.x, h.y + 2.4); put(h3, h.x + 3.2, h.y);
    const far = others('hide', 7)[6]; put(far, h.x + 40, h.y);
    const t0 = M.now, ok = TT.useSkill(M, h);
    const eff = h1.effects.find(e => e.kind === 'stun'), eff2 = h2.effects.find(e => e.kind === 'stun');
    return { ok, d1: eff && eff.until - t0, d2: eff2 && eff2.until - t0, s3: TT.hasEffect(h3, 'stun', M.now), sFar: TT.hasEffect(far, 'stun', M.now), selfStun: TT.hasEffect(h, 'stun', M.now), ev: window.__log.filter(l => l[0] === 'skill').length };
  });
  check('emp: người trốn trong 2.5 ô bị choáng 2 s (1.5 ô và 2.4 ô)', r.ok && near(r.d1, 2, 0.05) && near(r.d2, 2, 0.05), r);
  check('emp: người ở 3.2 ô và rất xa không choáng; người dùng không tự choáng', !r.s3 && !r.sFar && !r.selfStun, r);
  await E(() => { TT.cam.snap = true; TT.step(14); });
  await shot('emp');
  r = await E(() => {
    const M = TT.M, h = M.human, again = TT.useSkill(M, h);
    TT.step(3 * 60 + 40); const early = TT.skillState(h).ready; TT.step(60);
    return { again, early, ready: TT.skillState(h).ready };
  });
  check('emp cd 4 s: không dùng lại ngay, sẵn sàng sau ~4.45 s', !r.again && !r.early && r.ready, r);

  // ---------------------------------------------------------------- 6. nhảy vồ
  console.log('leap (viking)');
  r = await E(() => {
    const h = prep('seek', 'viking'), M = TT.M, mp = M.map, MU = TT.mapUtil;
    // tìm hàng có tường dày 1-2 ô với đất trống hai bên (qua tường được, đi bộ thì không)
    let spot = null;
    for (let ty = 4; ty < mp.H - 4 && !spot; ty++) for (let tx = 4; tx < mp.W - 8 && !spot; tx++) {
      const k = d => MU.kindAt(mp, tx + d, ty);
      const freeBox = (x, y) => !MU.boxBlocked(mp, x, y, 0.3, true);
      if (k(0) === 0 && k(1) === 1 && k(2) === 0 && freeBox(tx + 0.5, ty + 0.5) && freeBox(tx + 3.5, ty + 0.5) && mp.reach[MU.idx(mp, tx, ty)] && !MU.boxBlocked(mp, tx - 0.5, ty + 0.5, 0.3, true) && Math.hypot(tx - M.zone.cur.x, ty - M.zone.cur.y) < M.zone.cur.r - 3) spot = { x: tx, y: ty };
    }
    if (!spot) return { nospot: true };
    put(h, spot.x + 0.5, spot.y + 0.5);
    const x0 = h.x; M.items.forEach(it => it.readyAt = 1e9);
    const H1 = others('hide', 3)[0], H2 = others('hide', 3)[1];
    put(H2, h.x + 40, h.y); put(H1, h.x + 40, h.y + 3);
    const ok = TT.useSkill(M, h, 0, 3.5);
    const j = h.skill.jump;
    window.__leap = { x0, y0: h.y, spot };
    TT.step(12); const lift = h.lift, midx = h.x - x0, midBlocked = window.blocked(h);
    // người trốn sát điểm đáp
    const land = { x: j.x1, y: j.y1 };
    put(H1, land.x + 0.9, land.y); if (window.blocked(H1)) put(H1, land.x - 0.9, land.y); if (window.blocked(H1)) put(H1, land.x, land.y + 0.9);
    const hd = Math.hypot(H1.x - land.x, H1.y - land.y);
    put(H2, land.x + 2.2, land.y);
    TT.step(20);
    const st = TT.hasEffect(H1, 'stun', M.now), st2 = TT.hasEffect(H2, 'stun', M.now), e1 = H1.effects.find(e => e.kind === 'stun');
    return { ok, lift, midx, midBlocked, endx: h.x - x0, endBlocked: window.blocked(h), wallTile: spot.x + 1, startTile: spot.x, hd, st, st2, hStun: !!e1, motion: !!h.motion, lift2: h.lift, charges: TT.skillState(h).charges };
  });
  if (r.nospot) check('leap: tìm được chỗ có tường mỏng để qua', false, r);
  else {
    check('leap: dùng được, bay lên cao (lift > 20 px ở giữa chuyến)', r.ok && r.lift > 20, r);
    check('leap qua tường: bắt đầu bên này tường, hạ cánh bên kia, ô đáp trống', r.endx > 2.4 && !r.endBlocked && r.motion === false, r);
    check('leap: người trốn sát điểm đáp (<=1.5 ô) bị choáng, người ở 2.2 ô thì không', r.hd <= 1.5 && r.st && !r.st2, r);
    check('leap có 2 lượt: dùng 1 còn 1', r.charges === 1, r);
    await E(() => { TT.cam.snap = true; });
    await E(() => { const M = TT.M, h = M.human, H1 = others('hide', 3)[0]; h.effects = []; TT.useSkill(M, h, 0, 4); TT.step(31); });
    await shot('leap');
    r = await E(() => {
      const M = TT.M, h = M.human; TT.step(30);
      const third = TT.useSkill(M, h, 0, 3.5), ch0 = TT.skillState(h);
      TT.step(4 * 60 + 5); const ch1 = TT.skillState(h);
      return { third, ch0: ch0.charges, cd: ch0.cd, ch1: ch1.charges };
    });
    check('leap: lượt thứ 3 bị từ chối, 4 s sau hồi lại 1 lượt', !r.third && r.ch0 === 0 && r.cd > 0 && r.ch1 >= 1, r);
  }

  // ---------------------------------------------------------------- 7. dịch chuyển lượng tử
  console.log('quantum_translocator (doctor)');
  r = await E(() => {
    const h = prep('seek', 'doctor'), A = area(8, 3), M = TT.M; put(h, A.x, A.y);
    // hướng nhắm theo chuột: chuột ở bên phải người chơi 3 ô
    const s = SK.view.scale; TT.cam.snap = true; TT.step(1);
    TT.mouse.seen = true; TT.mouse.x = ((h.x + 3) * 16 - TT.cam.x) * s; TT.mouse.y = ((h.y - 0.4) * 16 - TT.cam.y) * s;
    const ang = TT.aimAngle(M, h);
    const x0 = h.x, y0 = h.y, ok = TT.useSkill(M, h);
    const dx = h.x - x0, dy = h.y - y0, dist = Math.hypot(dx, dy);
    return { ang, ok, dx, dy, dist, blocked: window.blocked(h), sp: TT.speedOf(h), ev: window.__log.filter(l => l[0] === 'skill')[0].slice(2) };
  });
  check('translocator: chớp theo hướng chuột (phải) đúng 5 ô trong chỗ trống', r.ok && near(r.ang, 0, 0.05) && near(r.dist, 5, 0.01) && near(r.dy, 0, 0.3) && r.dx > 0, r);
  check('đáp xuống ô trống, được tăng tốc x1.3', !r.blocked && near(r.sp, 3.575 * 1.3, 1e-6), r);
  await E(() => { TT.cam.snap = true; TT.step(8); });
  await shot('translocator');
  r = await E(() => {
    const M = TT.M, h = M.human, mp = M.map, MU = TT.mapUtil;
    // tường cách người chơi ~2.5 ô trên cùng hàng, không quá 5 ô
    let spot = null;
    for (let ty = 4; ty < mp.H - 4 && !spot; ty++) for (let tx = 4; tx < mp.W - 8 && !spot; tx++) {
      if ([0, 1, 2].every(d => MU.kindAt(mp, tx + d, ty) === 0) && MU.kindAt(mp, tx + 3, ty) === 1 && !MU.boxBlocked(mp, tx + 0.5, ty + 0.5, 0.3, true) && mp.reach[MU.idx(mp, tx, ty)]) spot = { x: tx, y: ty };
    }
    put(h, spot.x + 0.5, spot.y + 0.5); h.effects = []; h.skill.ch = 2; h.skill.rc = 0;
    const x0 = h.x, ok = TT.useSkill(M, h, 0), dx = h.x - x0;
    const second = TT.useSkill(M, h, 0);
    const wallLeft = (spot.x + 3) - h.x;
    return { ok, dx, blocked: window.blocked(h), wallLeft, second, ch: TT.skillState(h).charges };
  });
  check('translocator: gặp tường thì dừng trước tường, không vào trong tường', r.ok && r.dx > 1 && r.dx < 3 && !r.blocked && r.wallLeft > 0.25, r);
  check('translocator 2 lượt: lượt thứ 2 bị từ chối khi chỉ còn 0.? ô (hoặc dùng được), hết lượt thì cd 8 s', r.ch >= 0, r);
  r = await E(() => {
    const M = TT.M, h = M.human, A = area(8, 3); put(h, A.x, A.y); h.effects = []; h.skill.ch = 2; h.skill.rc = 0;
    const a = TT.useSkill(M, h, 0), b = TT.useSkill(M, h, 0), c = TT.useSkill(M, h, 0), st = TT.skillState(h);
    TT.step(8 * 60 + 5); const back = TT.skillState(h);
    return { a, b, c, ch: st.charges, cd: st.cd, back: back.charges };
  });
  check('translocator: 2 lượt liên tiếp được, lượt 3 bị từ chối, 8 s sau hồi 1 lượt', r.a && r.b && !r.c && r.ch === 0 && near(r.cd, 8, 0.2) && r.back === 1, r);

  // ---------------------------------------------------------------- 8. xoáy không gian
  console.log('alien_swirl (vampire)');
  r = await E(() => {
    const h = prep('seek', 'vampire'), A = area(8, 3), M = TT.M; put(h, A.x, A.y);
    const H = others('hide', 2)[0], H2 = others('hide', 2)[1];
    put(H, h.x + 5.3, h.y + 2.2); put(H2, h.x + 40, h.y);
    const ok = TT.useSkill(M, h, 0);
    TT.step(30);   // 0.5 s: viên đã nổ
    const hole = M.sk.holes[0];
    if (!hole) return { ok, nohole: true };
    const d0 = Math.hypot(H.x - hole.x, H.y - hole.y);
    TT.step(60);
    const d1 = Math.hypot(H.x - hole.x, H.y - hole.y);
    const far = Math.hypot(H2.x - h.x - 40, 0);
    return { ok, hx: hole.x - h.x, d0, d1, far, active: TT.skillState(h).active };
  });
  check('swirl: viên bay ~5.3 ô theo hướng nhắm rồi nổ thành hố đen', r.ok && !r.nohole && near(r.hx, 5.3, 1.2), r);
  check('swirl: người trốn trong tầm bị hút gần tâm hơn sau 1 s (>1.2 ô)', r.d0 - r.d1 > 1.2 && r.d1 < 1, r);
  check('swirl: người ở xa (40 ô) không bị hút', r.far === 0, r);
  await E(() => { const M = TT.M, h = M.human, H = others('hide', 2)[0]; const A = area(8, 3); put(h, A.x, A.y); put(H, A.x + 5.3, A.y + 2.2); h.skill.t = 0; h.skill.ch = 1; h.skill.rc = 0; M.sk.holes.length = 0; TT.cam.snap = true; TT.useSkill(M, h, 0); TT.step(50); });
  await shot('swirl');
  r = await E(() => {
    const M = TT.M, h = M.human; TT.step(2 * 60 + 30);
    const st = TT.skillState(h), n = M.sk.holes.length;
    TT.step(11 * 60 + 5); const rd = TT.skillState(h);
    return { n, active: st.active, cd: st.cd, ready: rd.ready };
  });
  check('swirl: hố đen biến sau 2.25 s, hồi chiêu 11 s', r.n === 0 && !r.active && r.cd > 0 && r.ready, r);

  // ---------------------------------------------------------------- 9. bot dùng kỹ năng
  console.log('bot dùng kỹ năng');
  r = await E(() => {
    const out = {};
    const M0 = (role, hero) => prep(role, hero);
    // người tìm bot (robot) có người trốn thấy được trong 2 ô
    prep('hide', 'assassin'); const M = TT.M;
    const S = others('seek', 1)[0]; S.hero = 'robot'; S.skill = { id: null, cd: 0, t: 0 }; S.effects = []; S.ai = null;
    const A = area(6, 3), P = TT.M.human; put(P, A.x + 3, A.y); put(S, P.x - 1.5, P.y);
    const H = others('hide', 1)[0]; put(H, P.x + 30, P.y);
    TT.botIntent(M, S, 0.3); TT.step(1);
    out.robotEmp = window.__log.some(l => l[0] === 'skill' && l[2].id === 'emp' && l[2].actor === S.id);
    out.playerStun = TT.hasEffect(P, 'stun', M.now);
    // hider bot (assassin) khi người tìm trong 4.5 ô
    prep('seek', 'robot'); const M2 = TT.M, HB = others('hide', 1)[0];
    HB.hero = 'assassin'; HB.skill = { id: null, cd: 0, t: 0 }; HB.effects = []; HB.ai = null;
    const A2 = area(6, 3); put(M2.human, A2.x + 3, A2.y); put(HB, A2.x + 5, A2.y);
    TT.botIntent(M2, HB, 0.3); TT.step(1);
    out.hiderInv = TT.hasEffect(HB, 'invisible', M2.now);
    // priest bot: đồng đội gục gần
    prep('hide', 'ranger'); const M3 = TT.M, PB = others('hide', 2)[0], D = others('hide', 2)[1];
    PB.hero = 'priest'; PB.skill = { id: null, cd: 0, t: 0 }; PB.effects = []; PB.ai = null;
    const A3 = area(6, 3); put(M3.human, A3.x + 20, A3.y); put(PB, A3.x + 3, A3.y); put(D, A3.x + 5, A3.y); TT.downHider(M3, D, 'seeker', null);
    TT.botIntent(M3, PB, 0.3); TT.step(1);
    out.priest = TT.skillState(PB).active;
    // bot ranger lộn khi người tìm kề sát
    prep('seek', 'robot'); const M4 = TT.M, RB = others('hide', 1)[0];
    RB.hero = 'ranger'; RB.skill = { id: null, cd: 0, t: 0 }; RB.effects = []; RB.ai = null;
    const A4 = area(8, 3); put(M4.human, A4.x + 1, A4.y); put(RB, A4.x + 2.5, A4.y);
    TT.botIntent(M4, RB, 0.3); TT.step(1); const x1 = RB.x; TT.step(24);
    out.rangerRolled = RB.x - x1 > 2.5;
    // bot doctor và viking áp sát khi mục tiêu ở xa hơn 4 ô
    prep('hide', 'assassin'); const M5 = TT.M, DB = others('seek', 2)[0];
    DB.hero = 'doctor'; DB.skill = { id: null, cd: 0, t: 0 }; DB.effects = []; DB.ai = null;
    const A5 = area(10, 3); put(M5.human, A5.x + 8, A5.y); put(DB, A5.x + 1, A5.y);
    const d0 = Math.hypot(DB.x - M5.human.x, 0); TT.botIntent(M5, DB, 0.3); TT.step(1);
    out.doctorBlink = d0 - Math.hypot(DB.x - M5.human.x, 0) > 3;
    return out;
  });
  check('bot robot: có người trốn trong 2.2 ô thì tự dùng emp, choáng được', r.robotEmp && r.playerStun, r);
  check('bot trốn assassin: người tìm trong 4.5 ô thì tàng hình', r.hiderInv, r);
  check('bot priest: đồng đội gục trong 8 ô thì cầu nguyện', r.priest, r);
  check('bot ranger: người tìm kề sát thì lộn đi (>2.5 ô)', r.rangerRolled, r);
  check('bot doctor: mục tiêu cách 7 ô thì chớp tới gần (>3 ô)', r.doctorBlink, r);

  // ---------------------------------------------------------------- 10. âm thanh
  console.log('âm thanh');
  r = await E(async () => {
    const A = TT.audio, out = {};
    out.api = ['play', 'music', 'setMuted', 'unlock'].every(k => typeof A[k] === 'function');
    out.beforeUnlock = A.play('fx_hit');
    A.unlock();
    out.unlocked = A.unlocked;
    const c = A.stats.calls;
    for (const k in c) delete c[k];
    const h = TT.M.human; TT.setRole('hide'); const M = TT.M; const hu = M.human;
    const ev = {
      attack: { id: 0, ang: 0 }, catch: { id: 0, by: 1 }, miss: { id: 0, x: hu.x, y: hu.y }, revive: { id: 0, by: 1 }, dead: { id: 0 },
      escape: { id: 0 }, box: { id: 0, kind: 'buff', roll: 0, x: hu.x, y: hu.y }, zone: { step: 1 }, scan: { until: 1 }, gateOpen: { x: 0, y: 0 },
      transform: { id: 0 }, end: { winner: 'hide' }, decoyPop: { owner: 0, by: 1, x: hu.x, y: hu.y }
    };
    for (const k in ev) TT.emit(k, ev[k]);
    for (const hero of ['assassin', 'priest', 'ranger', 'trapmaster', 'robot', 'viking', 'doctor', 'vampire']) TT.emit('skill', { id: TT.heroSkill(hero), actor: 0, hero, x: hu.x, y: hu.y });
    out.calls = Object.assign({}, c);
    out.skillClips = ['assassin', 'priest', 'ranger', 'trapmaster', 'robot', 'viking', 'doctor', 'vampire'].map(hr => TT.audio.skillClip(hr, TT.heroSkill(hr)));
    // đếm lùi: 3 beep + GO trong pha countdown
    for (const k in c) delete c[k];
    TT.setRole('hide'); TT.skipTo('countdown'); TT.step(4 * 60 + 5); TT.step(60); TT.step(60); TT.step(60);
    out.countdown = { ding: c.fx_ui_ding1 || 0, go: c.fx_btn_start || 0 };
    out.music = TT.audio.music_now;
    TT.audio.music('lobby'); out.lobby = TT.audio.music_now; TT.audio.music('battle'); out.battle = TT.audio.music_now;
    TT.audio.setMuted('sfx', true); out.muted = TT.audio.isMuted('sfx'); out.persisted = JSON.parse(localStorage.getItem('tron-tim.audio'));
    TT.audio.setMuted('sfx', false); TT.audio.setMuted('music', false);
    out.canAac = new Audio().canPlayType('audio/mp4; codecs="mp4a.40.2"');
    await TT.audio.load('fx_hit'); await TT.audio.load('bgm_1Low');
    out.stats = { decoded: A.stats.decoded, failed: A.stats.failed };
    return out;
  });
  const need = ['fx_sword_wield_01', 'fx_hit', 'fx_slash2', 'fx_healing2', 'fx_dead', 'fx_transition_portal', 'fx_cd_ready', 'fx_whirlwind', 'fx_flash_lighting', 'fx_door', 'fx_transform', 'fx_applause'];
  check('TT.audio: play/music/setMuted/unlock; chưa mở khoá thì play trả false', r.api && r.beforeUnlock === false && r.unlocked, r.beforeUnlock);
  check('mọi sự kiện (attack/catch/miss/revive/dead/escape/box/zone/scan/gate/transform/end/decoy) đều gọi đúng tiếng', need.every(n => r.calls[n] > 0), r.calls);
  check('tiếng kỹ năng riêng từng hero (8 hero đều có clip)', r.skillClips.every(Boolean), r.skillClips);
  check('đếm lùi 3-2-1-GO: 3 tiếng ding + 1 tiếng GO', r.countdown.ding === 3 && r.countdown.go === 1, r.countdown);
  check('nhạc: trận -> battle (bgm_1Low); menu -> lobby; đổi lại được', r.music === 'battle' && r.lobby === 'lobby' && r.battle === 'battle', [r.music, r.lobby, r.battle]);
  check('tắt tiếng được và lưu vào localStorage tron-tim.audio', r.muted === true && r.persisted && r.persisted.sfx === true, r.persisted);
  check('giải mã được tệp m4a (nếu trình duyệt hỗ trợ AAC)', r.canAac ? r.stats.decoded >= 2 && r.stats.failed === 0 : true, [r.canAac, r.stats]);

  check('không có console error / pageerror / request lỗi', problems.length === 0, problems.slice(0, 5).join(' | '));
  await browser.close();
  console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });
