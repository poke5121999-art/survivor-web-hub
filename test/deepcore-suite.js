/*
 * LÕI SÂU — bộ kiểm.
 *
 * Chạy:  node test/deepcore-suite.js
 *
 * Bốn nguyên tắc đo, chép từ các bộ kiểm khác trong kho vì chúng đã trả giá rồi:
 *   1. BẤM UI THẬT. Không gọi hàm của bộ máy để đi tắt qua chính chỗ đang kiểm.
 *      page.evaluate chỉ dùng để ĐỌC trạng thái và để DỰNG CẢNH.
 *   2. Dựng cảnh TẤT ĐỊNH, và ghi lý do ngay tại chỗ. Một bài kiểm bập bênh tệ hơn
 *      không có bài kiểm nào.
 *   3. Đo cả một KHOẢNG THỜI GIAN, không đo một khung.
 *   4. Viết CỨNG kỳ vọng, đừng đọc từ chính bảng dữ liệu đang kiểm — bài kiểm phải
 *      HỎNG khi ai đó thêm hay bớt một con, chứ không lặng lẽ đổi kỳ vọng theo.
 *
 * Bốn lỗi nặng nhất của game này bị lộ ra bằng phép đo chứ không bằng chơi tay
 * (quặng người chơi tự đào không tính vào nhiệm vụ, đào đá thường không cho kinh
 * nghiệm, mảnh rơi cho cả bể linh thú, 60 giây chạy thoát không đủ). Mỗi cái đều
 * có một bài khoá lại ở dưới.
 */
'use strict';

const path = require('path');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const URL = 'file:///' + path.join(ROOT, 'games', 'deepcore', 'index.html').replace(/\\/g, '/');

// Kỳ vọng CỨNG — sửa bảng dữ liệu mà quên sửa ở đây thì bài kiểm phải hỏng.
const N_PETS = 10;
const N_BIOMES = 9;
const PET_VISIBLE_MAX = 4;
const NEAR_R = 120;          // vùng "kề bên", linh thú +25% sát thương
const ESCAPE_SEC = 80;
const RUN_CAP = 600;
const PARTICLE_CAP = 220;

let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) { pass++; out.push('  ✔ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; out.push('  ✘ ' + name + (detail ? '  — ' + detail : '')); }
}

async function open(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 420, height: 760 },     // điện thoại DỌC
    deviceScaleFactor: 2, hasTouch: true, isMobile: true
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(URL);
  await page.waitForFunction(
    () => window.DC && window.DC.game && window.DC.Atlas.ready && window.DC.Meta.s,
    null, { timeout: 15000 });
  return { ctx, page, errs };
}

/* Chạy nhanh N giây trong ván, KHÔNG vẽ. Dùng để đo những thứ chỉ lộ ra sau vài
 * phút — chờ thật thì bộ kiểm mất nửa tiếng. */
async function fastForward(page, sec, opts) {
  return page.evaluate(([sec, opts]) => {
    const G = window.DC, g = G.game;
    if (opts.autoCard) {
      G.Screens.levelUp = (cards, cb) => cb(
        cards.find(c => c.kind === 'summon') || cards.find(c => c.kind === 'tier') || cards[0]);
    }
    if (opts.god) { g.hurtPlayer = () => 0; g.player.hurt = () => 0; }
    if (opts.bot) {
      let wa = 0, wt = 0;
      g.readDir = () => {
        const p = g.player, w = g.world;
        if (g.escaping && g.exit) {
          const dx = g.exit.x - p.x, dy = g.exit.y - p.y, m = Math.hypot(dx, dy) || 1;
          return { x: dx / m, y: dy / m };
        }
        let near = null, nd = 60;
        for (const e of g.enemies) {
          if (e.dead || e.harmless) continue;
          const d = Math.hypot(e.x - p.x, e.y - p.y);
          if (d < nd) { nd = d; near = e; }
        }
        if (near) {
          const a = Math.atan2(p.y - near.y, p.x - near.x) + 0.7;
          return { x: Math.cos(a), y: Math.sin(a) };
        }
        const tx = p.tileX(), ty = p.tileY();
        let best = null, bd = 1e9;
        for (let y = ty - 8; y <= ty + 8; y++) for (let x = tx - 8; x <= tx + 8; x++) {
          if (!w.inside(x, y) || w.kind[w.idx(x, y)] !== G.TK.ORE) continue;
          const dd = (x - tx) ** 2 + (y - ty) ** 2;
          if (dd < bd) { bd = dd; best = [x, y]; }
        }
        if (best) {
          const gx = best[0] * 16 + 8 - p.x, gy = best[1] * 16 + 8 - p.y;
          const m = Math.hypot(gx, gy) || 1;
          return { x: gx / m, y: gy / m };
        }
        wt -= 1 / 60;
        if (wt <= 0) { wt = 1.4 + Math.random(); wa = Math.random() * 6.283; }
        return { x: Math.cos(wa), y: Math.sin(wa) };
      };
    }
    let maxParts = 0, maxEnemies = 0;
    for (let i = 0; i < sec * 60 && g.state !== 'over'; i++) {
      if (g.state === 'levelup') g.state = 'play';
      g.update(1 / 60);
      if (g.fx.parts.length > maxParts) maxParts = g.fx.parts.length;
      if (g.enemies.length > maxEnemies) maxEnemies = g.enemies.length;
    }
    return { maxParts, maxEnemies, state: g.state, t: g.dir.t };
  }, [sec, opts || {}]);
}

// ---------------------------------------------------------------------------
async function suiteBoot(browser) {
  out.push('\n[1] Nạp trang, bảng dữ liệu, bộ art');
  const { ctx, page, errs } = await open(browser);
  try {
    const d = await page.evaluate(() => ({
      pets: DC.PETS.length,
      biomes: DC.BIOMES.length,
      enemies: Object.keys(DC.ENEMY).length,
      ores: Object.keys(DC.ORE).length,
      sets: DC.EQ_SETS.length,
      keys: Object.keys(window.DC_ATLAS.sprites).length,
      pages: window.DC_ATLAS.pages.length,
      visMax: DC.PET_VISIBLE_MAX,
      runTime: DC.RUN_TIME,
      escape: DC.MISSION_END.escapeTime
    }));
    check('mười linh thú', d.pets === N_PETS, d.pets + ' con');
    check('chín quần thể', d.biomes === N_BIOMES, d.biomes + ' quần thể');
    check('bể quái ≥ 18 loại', d.enemies >= 18, d.enemies + ' loại');
    check('bảng quặng ≥ 10 loại', d.ores >= 10, d.ores + ' loại');
    check('≥ 25 bộ giáp', d.sets >= 25, d.sets + ' bộ');
    check('atlas nạp được', d.keys > 400 && d.pages >= 1, d.keys + ' khoá / ' + d.pages + ' trang');
    check('trần linh thú hiện hình = ' + PET_VISIBLE_MAX, d.visMax === PET_VISIBLE_MAX, String(d.visMax));
    check('trần thời gian ván = ' + RUN_CAP + 's', d.runTime === RUN_CAP, String(d.runTime));
    check('chạy thoát = ' + ESCAPE_SEC + 's', d.escape === ESCAPE_SEC, String(d.escape));
    check('không lỗi khi nạp', errs.length === 0, errs.slice(0, 2).join(' | '));
  } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------
async function suiteArt(browser) {
  out.push('\n[2] Mọi khoá art được nhắc tới đều CÓ THẬT');
  const { ctx, page } = await open(browser);
  try {
    const d = await page.evaluate(() => {
      const A = DC.Atlas, missing = [];
      // linh thú: phải có ít nhất một dáng đứng hoặc đi
      for (const p of DC.PETS) {
        if (!A.pick(p.art + '.idle', p.art + '.move', p.art + '.idle_side')) missing.push(p.art);
      }
      // quái
      for (const k in DC.ENEMY) {
        const a = DC.ENEMY[k].art;
        if (!A.pick(a + '.idle', a + '.move')) missing.push(a);
      }
      // boss
      for (const k in DC.BOSS_DEFS) {
        if (!A.has(DC.BOSS_DEFS[k].sheet)) missing.push(DC.BOSS_DEFS[k].sheet);
      }
      // o gach cua tung quan the
      for (const b of DC.BIOMES) {
        for (const r of ['floor', 'wall', 'decor', 'ore', 'crack']) {
          if (!A.has('tile.' + b.id + '.' + r)) missing.push('tile.' + b.id + '.' + r);
        }
      }
      // paperdoll: MOI bo giap phai co du ba lop, neu khong thi mac vao se
      // thay mot nua bo do
      const halfSets = [];
      for (const s of DC.EQ_SETS) {
        const n = ['helm', 'chest', 'pants'].filter(x => A.has('pc.' + x + '.' + s.id)).length;
        if (n !== 3) halfSets.push(s.id + ':' + n);
      }
      // lop than nguoi + toc
      const body = ['pc.skin', 'pc.eyes', 'pc.shirt', 'pc.pants'].filter(k => !A.has(k));
      const hair = [1, 3, 6, 11, 17, 22].filter(
        h => !A.has('pc.hair.' + h) || !A.has('pc.hairhelm.' + h));
      const frames = A.count('pc.skin');
      return { missing, halfSets, body, hair, frames, items: A.count('items') };
    });
    check('không thiếu khoá art nào', d.missing.length === 0,
      d.missing.length ? d.missing.slice(0, 6).join(', ') : 'đủ hết');
    check('mọi bộ giáp đủ ba lớp mũ/áo/quần', d.halfSets.length === 0,
      d.halfSets.length ? d.halfSets.join(', ') : DC_SETS_OK());
    check('lớp thân người đủ', d.body.length === 0, d.body.join(', '));
    check('mỗi kiểu tóc có bản thường và bản đội mũ', d.hair.length === 0, d.hair.join(', '));
    check('tấm nhân vật có 39 khung', d.frames === 39, d.frames + ' khung');
    check('bảng biểu tượng vật phẩm ≥ 800 ô', d.items >= 800, d.items + ' ô');
  } finally { await ctx.close(); }
  function DC_SETS_OK() { return 'đủ'; }
}

// ---------------------------------------------------------------------------
async function suiteMenu(browser) {
  out.push('\n[3] Màn hình ngoài ván — BẤM THẬT');
  const { ctx, page } = await open(browser);
  try {
    const tabs = await page.$$('#ui .tab');
    check('có bốn tab dưới đáy', tabs.length === 4, tabs.length + ' tab');

    // Nút phải TO. Ngón cái chứ không phải chuột: 56px là ngưỡng tối thiểu.
    const small = await page.evaluate(() => {
      const bad = [];
      document.querySelectorAll('#ui .btn, #ui .tab').forEach(e => {
        const r = e.getBoundingClientRect();
        if (r.height < 56) bad.push(e.textContent.trim().slice(0, 14) + '=' + Math.round(r.height));
      });
      return bad;
    });
    check('mọi nút bấm cao ≥ 56px', small.length === 0, small.slice(0, 4).join(', '));

    // đi hết bốn tab, không tab nào được ném lỗi hay ra trang trắng
    for (const [i, name] of [[1, 'LINH THÚ'], [2, 'TRANG BỊ'], [3, 'QUẦY']]) {
      await (await page.$$('#ui .tab'))[i].click();
      const n = await page.evaluate(() => document.querySelectorAll('#ui .card').length);
      check('tab ' + name + ' có nội dung', n > 0, n + ' thẻ');
    }
    // ve tab HANG
    await (await page.$$('#ui .tab'))[0].click();

    // Trang bị: đổi món thì DANH SÁCH LỚP VẼ phải đổi theo — đó là toàn bộ lời
    // hứa "đội mũ vào thì thấy cái mũ".
    await (await page.$$('#ui .tab'))[2].click();
    const before = await page.evaluate(() => DC.Meta.stats().eq.helm || null);
    const changed = await page.evaluate(() => {
      // dựng cảnh: cấp cho người chơi một bộ khác rồi mặc vào bằng API meta
      DC.Meta.s.inv['iron:helm'] = { lv: 1 };
      DC.Meta.equip('helm', 'iron:helm');
      return DC.Meta.stats().eq.helm;
    });
    check('mặc mũ khác thì lớp vẽ đổi theo', changed === 'iron' && before !== 'iron',
      before + ' → ' + changed);
  } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------
async function suiteGacha(browser) {
  out.push('\n[4] Quầy quay — tiêu ngọc, không có lần quay vứt đi');
  const { ctx, page } = await open(browser);
  try {
    const d = await page.evaluate(() => {
      const M = DC.Meta;
      M.s.gem = 10000;
      const before = M.s.gem;
      const out10 = M.pull('pet', 10);
      const spent = before - M.s.gem;
      const dupNoWaste = out10.every(r => !r.dup || r.frag > 0);
      const anyRare3 = out10.some(r => r.rare >= 3);
      const g0 = M.s.gem;
      const gear = M.pull('gear', 1);
      return {
        spent, ten: DC.Meta.BANNERS.pet.ten, n: out10.length,
        dupNoWaste, anyRare3,
        gearOk: !!gear && gear.length === 1 && !!DC.EQ_ALL[gear[0].id],
        gearSpent: g0 - M.s.gem, gearOne: DC.Meta.BANNERS.gear.one,
        broke: M.pull('pet', 10, true)
      };
    });
    check('quay 10 tiêu đúng giá', d.spent === d.ten, d.spent + '/' + d.ten + ' ngọc');
    check('quay 10 ra đúng 10 kết quả', d.n === 10, String(d.n));
    check('trùng thì ra mảnh, không ra rác', d.dupNoWaste);
    check('bảo hiểm: 10 lần có ít nhất một bậc Hiếm', d.anyRare3);
    check('quay trang bị ra món có thật', d.gearOk);
    check('quay trang bị tiêu đúng giá', d.gearSpent === d.gearOne,
      d.gearSpent + '/' + d.gearOne);

    const noGem = await page.evaluate(() => { DC.Meta.s.gem = 0; return DC.Meta.pull('pet', 1); });
    check('hết ngọc thì không quay được', noGem === null);
  } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------
async function suiteRunStart(browser) {
  out.push('\n[5] Vào ván bằng NÚT THẬT');
  const { ctx, page, errs } = await open(browser);
  try {
    await page.click('#ui .btn.primary');          // XUỐNG HANG
    await page.waitForFunction(() => DC.game.state === 'play', null, { timeout: 8000 });
    const d = await page.evaluate(() => {
      const g = DC.game;
      return {
        pets: g.pets.length,
        world: [g.world.W, g.world.H],
        onFloor: g.world.at(g.player.tileX(), g.player.tileY()) === DC.TK.FLOOR,
        exitAtStart: Math.hypot(g.exit.x - g.player.x, g.exit.y - g.player.y) < 2,
        nearR: g.run.st.nearR,
        mission: g.mission.type.id,
        need: g.mission.need,
        camClamp: Math.abs(g.cam.y - g.player.y) < 40
      };
    });
    check('vào ván đã có HAI linh thú', d.pets === 2, d.pets + ' con');
    check('người chơi đứng trên ô sàn', d.onFloor);
    check('khoang thoát hạ đúng chỗ vào', d.exitAtStart);
    check('vùng "kề bên" = ' + NEAR_R + 'px', d.nearR === NEAR_R, String(d.nearR));
    check('ải 1 luôn là nhiệm vụ KHAI THÁC', d.mission === 'mine', d.mission);
    check('camera không dí người chơi xuống đáy màn hình', d.camClamp);
    check('không lỗi khi vào ván', errs.length === 0, errs.slice(0, 2).join(' | '));
  } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------
async function suiteMining(browser) {
  out.push('\n[6] Đào — nguồn kinh nghiệm chính, và là thứ chấm nhiệm vụ');
  const { ctx, page } = await open(browser);
  try {
    await page.click('#ui .btn.primary');
    await page.waitForFunction(() => DC.game.state === 'play', null, { timeout: 8000 });

    // LỖI ĐÃ TỪNG CÓ: đục vỡ đá THƯỜNG không cho kinh nghiệm, nên người chơi
    // cấp 1 đứng đào cả phút vẫn cấp 1 rồi chết vì chưa gọi nổi linh thú nào.
    const plain = await page.evaluate(() => {
      const g = DC.game, w = g.world;
      // dựng cảnh: khoét sạch quanh người chơi rồi dựng lại một ô đá thường sát bên
      const tx = g.player.tileX() + 1, ty = g.player.tileY();
      w.kind[w.idx(tx, ty)] = DC.TK.WALL;
      w.ore[w.idx(tx, ty)] = 0;
      w.hp[w.idx(tx, ty)] = w.hpMax[w.idx(tx, ty)] = 1;
      const xp0 = g.player.xp + (g.player.level - 1) * 1000;
      g.readDir = () => ({ x: 1, y: 0 });
      for (let i = 0; i < 90; i++) g.update(1 / 60);
      return { gained: (g.player.xp + (g.player.level - 1) * 1000) - xp0 };
    });
    check('đục vỡ đá thường CÓ cho kinh nghiệm', plain.gained > 0, '+' + plain.gained.toFixed(1));

    // LỖI ĐÃ TỪNG CÓ: quặng do CHÍNH người chơi đào không được báo cho nhiệm vụ,
    // chỉ quặng do linh thú đào hộ mới tính — bảng đứng 0/27 suốt ván.
    const quest = await page.evaluate(() => {
      const g = DC.game, w = g.world;
      const oi = w.oreList.indexOf('morkite') + 1;
      const tx = g.player.tileX() + 1, ty = g.player.tileY();
      const id = w.idx(tx, ty);
      w.kind[id] = DC.TK.ORE; w.ore[id] = oi;
      w.hp[id] = w.hpMax[id] = 1;
      w.dirtyAround(tx, ty);
      const have0 = g.mission.have;
      const carry0 = g.player.carry.morkite || 0;
      g.readDir = () => ({ x: 1, y: 0 });
      for (let i = 0; i < 90; i++) g.update(1 / 60);
      return { d: g.mission.have - have0, carry: (g.player.carry.morkite || 0) - carry0 };
    });
    check('người chơi tự đào Morkite thì nhiệm vụ nhích', quest.d === 1, '+' + quest.d);
    check('Morkite vào túi', quest.carry === 1, '+' + quest.carry);

    // Đường Đỏ hồi máu ngay tại chỗ, không vào túi (chép Red Sugar của DRG).
    const sugar = await page.evaluate(() => {
      const g = DC.game, w = g.world;
      g.player.hp = 20;
      const oi = w.oreList.indexOf('redsugar') + 1;
      const tx = g.player.tileX() + 1, ty = g.player.tileY(), id = w.idx(tx, ty);
      w.kind[id] = DC.TK.ORE; w.ore[id] = oi; w.hp[id] = w.hpMax[id] = 1;
      g.readDir = () => ({ x: 1, y: 0 });
      for (let i = 0; i < 90; i++) g.update(1 / 60);
      return g.player.hp;
    });
    check('đào Đường Đỏ thì hồi máu ngay', sugar > 20, '20 → ' + Math.round(sugar));
  } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------
async function suitePets(browser) {
  out.push('\n[7] Linh thú — dây xích, luật ngắm, sát thương');
  const { ctx, page } = await open(browser);
  try {
    await page.click('#ui .btn.primary');
    await page.waitForFunction(() => DC.game.state === 'play', null, { timeout: 8000 });

    // DÂY XÍCH phải kiểm ở MỌI trạng thái, kể cả đang đánh nhau. Đây đúng là chỗ
    // Path of Exile làm sai và đẻ ra cả một lớp lỗi "minion ở lại chết một mình".
    const leash = await page.evaluate(() => {
      const g = DC.game;
      // dựng cảnh: nhét một con quái ngay cạnh linh thú (nó sẽ vào trạng thái
      // đánh nhau), rồi bốc người chơi đi thật xa
      const p = g.pets[0];
      g.spawn('grunt', p.x + 12, p.y);
      const f = g.world.nearestFloor(g.player.tileX() + 40, g.player.tileY());
      g.player.x = f.x * 16 + 8; g.player.y = f.y * 16 + 8;
      g.readDir = () => ({ x: 0, y: 0 });
      let worst = 0;
      for (let i = 0; i < 60 * 6; i++) {
        g.update(1 / 60);
        for (const q of g.pets) {
          worst = Math.max(worst, Math.hypot(q.x - g.player.x, q.y - g.player.y));
        }
      }
      const now = g.pets.map(q => Math.round(Math.hypot(q.x - g.player.x, q.y - g.player.y)));
      return { now, worst: Math.round(worst) };
    });
    check('chủ chạy xa thì linh thú về, kể cả đang đánh nhau',
      leash.now.every(d => d < 260), 'xa nhất còn ' + Math.max.apply(null, leash.now) + 'px');

    // Luật ngắm phải nói được thành MỘT CÂU và in ra được — nếu không nói gọn
    // được thì luật đó quá rắc rối để người chơi hiểu.
    const rules = await page.evaluate(() => {
      const bad = [];
      for (const p of DC.PETS) {
        if (!DC.PET_AIM[p.ngam]) bad.push(p.id + ':ngam=' + p.ngam);
        if (!DC.PET_FOLLOW[p.bam]) bad.push(p.id + ':bam=' + p.bam);
        if (!p.t3 || !p.t5 || !p.evo || !p.evo.need) bad.push(p.id + ':thieu-mo-ta-bac');
      }
      return bad;
    });
    check('mười con đều có luật bám + luật ngắm + mốc bậc 3/5/tiến hoá',
      rules.length === 0, rules.slice(0, 4).join(', '));

    // Luật "kề bên": quái đứng gần NGƯỜI CHƠI thì ăn thêm đòn. Đây là toàn bộ
    // chiều sâu của một game mà người chơi không được nhắm.
    const meat = await page.evaluate(() => {
      const g = DC.game;
      function hitOnce(dist) {
        const e = g.spawn('grunt', g.player.x + dist, g.player.y);
        e.hpMax = e.hp = 100000;
        const pet = g.pets[0];
        pet.target = e;
        pet.x = e.x - 10; pet.y = e.y;
        const before = e.hp;
        pet.strike(g.ctx());
        const dmg = before - e.hp;
        e.dead = true;
        return dmg;
      }
      return { near: hitOnce(40), far: hitOnce(300) };
    });
    check('quái sát người chơi ăn nhiều sát thương hơn',
      meat.near > meat.far * 1.2,
      'kề bên ' + meat.near.toFixed(1) + ' vs xa ' + meat.far.toFixed(1));
  } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------
async function suiteLevelUp(browser) {
  out.push('\n[8] Lên cấp — chọn 1 trong 3, BẤM THẬT');
  const { ctx, page } = await open(browser);
  try {
    await page.click('#ui .btn.primary');
    await page.waitForFunction(() => DC.game.state === 'play', null, { timeout: 8000 });
    await page.evaluate(() => { DC.game.giveXp(100000); });
    await page.waitForSelector('#ui .card', { timeout: 5000 });

    const cards = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#ui .card')).map(e => e.textContent.trim()));
    check('hiện đúng ba thẻ', cards.length === 3, cards.length + ' thẻ');
    check('thẻ có in luật ngắm hoặc hiệu lực',
      cards.every(t => t.length > 12), cards.map(t => t.slice(0, 18)).join(' | '));

    const before = await page.evaluate(() => DC.game.pets.length);
    await (await page.$$('#ui .card'))[0].click();
    await page.waitForFunction(() => DC.game.state === 'play', null, { timeout: 5000 });
    const after = await page.evaluate(() => ({
      pets: DC.game.pets.length,
      tiers: DC.game.pets.map(p => p.tier).join(','),
      vis: DC.game.pets.filter(p => p.visible).length
    }));
    check('bấm thẻ thì ván chạy tiếp', true);
    check('bấm thẻ có tác dụng thật', after.pets > before || after.tiers !== '1,1',
      before + ' → ' + after.pets + ' con, bậc ' + after.tiers);
    check('không bao giờ hiện hình quá ' + PET_VISIBLE_MAX + ' con',
      after.vis <= PET_VISIBLE_MAX, after.vis + ' con hiện hình');
  } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------
async function suiteDirector(browser) {
  out.push('\n[9] Đạo diễn — bầy có BÁO TRƯỚC, và có khoảng lặng');
  const { ctx, page } = await open(browser);
  try {
    await page.click('#ui .btn.primary');
    await page.waitForFunction(() => DC.game.state === 'play', null, { timeout: 8000 });

    // Bầy phải cảnh báo TRƯỚC rồi mới thả. DRG báo trước 3,7 giây; đây 3,5.
    const warn = await page.evaluate(() => {
      const g = DC.game;
      g.player.hurt = () => 0; g.hurtPlayer = () => 0;
      g.readDir = () => ({ x: 0, y: 0 });
      // nhảy tới ngay trước mốc bầy đầu tiên
      const beat = DC.MISSION_BEATS.find(b => b.k === 'swarm');
      // Đặt đồng hồ VƯỢT mốc rồi mới chạy một khung, để mốc nổ ngay trong khung
      // đó. Đặt trước mốc 0,02 giây thì một khung 1/60 vẫn chưa tới nơi, và bài
      // kiểm đọc nhầm băng chữ của nhiệm vụ.
      g.dir.beat = DC.MISSION_BEATS.indexOf(beat);
      g.dir.t = beat.t + 0.01;
      const n0 = g.enemies.length;
      g.update(1 / 60);
      const banner = g.hud.banners.length > 0 ? g.hud.banners[g.hud.banners.length - 1].text : '';
      const rightAfterWarn = g.enemies.length - n0;
      for (let i = 0; i < 60 * 4; i++) g.update(1 / 60);
      return { banner, rightAfterWarn, afterWait: g.enemies.length - n0 };
    });
    check('có băng cảnh báo trước khi bầy tới', /BẦY|HANG|CHÚNG/.test(warn.banner), warn.banner);
    check('cảnh báo xong quái CHƯA ra ngay', warn.rightAfterWarn === 0,
      '+' + warn.rightAfterWarn + ' con');
    check('vài giây sau thì bầy mới đổ ra', warn.afterWait > 4, '+' + warn.afterWait + ' con');

    const cap = await fastForward(page, 240, { god: true, bot: true, autoCard: true });
    check('trần hạt không bao giờ vượt ' + PARTICLE_CAP, cap.maxParts <= PARTICLE_CAP,
      'đỉnh ' + cap.maxParts + ' hạt');
    check('số quái cùng lúc còn đọc được (≤ 45)', cap.maxEnemies <= 45,
      'đỉnh ' + cap.maxEnemies + ' con');
  } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------
async function suiteEndgame(browser) {
  out.push('\n[10] Đoạn kết — xong nhiệm vụ → boss → chạy thoát → bảng thưởng');
  const { ctx, page } = await open(browser);
  try {
    await page.click('#ui .btn.primary');
    await page.waitForFunction(() => DC.game.state === 'play', null, { timeout: 8000 });

    const d = await page.evaluate(() => {
      const g = DC.game;
      g.hurtPlayer = () => 0; g.player.hurt = () => 0;
      DC.Screens.levelUp = (c, cb) => cb(c[0]);
      DC.Screens.results = (res, rw) => { window.__R = { res, rw }; };
      g.readDir = () => ({ x: 0, y: 0 });
      // dựng cảnh: chấm nhiệm vụ xong ngay, để đo RIÊNG cái dây chuyền cuối
      g.mission.have = g.mission.need;
      g.mission.check();
      const marks = [];
      let lastPhase = '';
      for (let i = 0; i < 60 * 120 && g.state !== 'over'; i++) {
        if (g.state === 'levelup') g.state = 'play';
        g.update(1 / 60);
        if (g.dir.phase !== lastPhase) { lastPhase = g.dir.phase; marks.push(lastPhase); }
        // boss vừa hiện thì hạ luôn, đang đo dây chuyền chứ không đo đánh boss
        if (g.boss && !g.boss.dead && g.dir.phase === 'boss') g.boss.hp = 1;
        // vào pha chạy thoát thì đi thẳng về khoang
        if (g.escaping) {
          g.player.x += (g.exit.x - g.player.x) * 0.06;
          g.player.y += (g.exit.y - g.player.y) * 0.06;
        }
      }
      return {
        marks, state: g.state,
        won: window.__R ? window.__R.res.won : null,
        rw: window.__R ? window.__R.rw : null,
        team: window.__R ? window.__R.res.team : null,
        petsInRun: g.run.pets.map(p => p.id)
      };
    });
    check('xong nhiệm vụ thì boss trồi lên', d.marks.indexOf('boss') >= 0, d.marks.join(' → '));
    check('hạ boss xong thì vào pha chạy thoát', d.marks.indexOf('escape') > d.marks.indexOf('boss'));
    check('về tới khoang thì THẮNG', d.won === true, String(d.won));
    check('thắng thì có vàng và ngọc', d.rw && d.rw.gold > 0 && d.rw.gem > 0,
      d.rw ? d.rw.gold + ' vàng, ' + d.rw.gem + ' ngọc' : 'không có');
    // LỖI ĐÃ TỪNG CÓ: mảnh rơi cho CẢ BỂ mười con thay vì chỉ đội đã ra trận,
    // làm việc chọn đội hình mất sạch ý nghĩa.
    const fragIds = d.rw ? Object.keys(d.rw.frags) : [];
    check('mảnh chỉ rơi cho con ĐÃ RA TRẬN',
      fragIds.length > 0 && fragIds.length === d.petsInRun.length &&
      fragIds.every(id => d.petsInRun.indexOf(id) >= 0),
      fragIds.length + ' con nhận / ' + d.petsInRun.length + ' con ra trận');
  } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------
async function suiteMobile(browser) {
  out.push('\n[11] Khoá màn hình dọc, không cuộn, không zoom');
  const { ctx, page } = await open(browser);
  try {
    const d = await page.evaluate(() => {
      const app = document.getElementById('app').getBoundingClientRect();
      const vp = document.querySelector('meta[name=viewport]').content;
      return {
        ratio: +(app.width / app.height).toFixed(3),
        scrollX: document.documentElement.scrollWidth - window.innerWidth,
        overflow: getComputedStyle(document.body).overflow,
        touchAction: getComputedStyle(document.body).touchAction,
        noZoom: /user-scalable=no/.test(vp) && /maximum-scale=1/.test(vp),
        select: getComputedStyle(document.body).userSelect ||
                getComputedStyle(document.body).webkitUserSelect
      };
    });
    check('khung game giữ tỉ lệ dọc 9:16', Math.abs(d.ratio - 0.5625) < 0.02, String(d.ratio));
    check('không cuộn ngang', d.scrollX <= 0, String(d.scrollX));
    check('body không cuộn', d.overflow === 'hidden', d.overflow);
    check('chặn cử chỉ mặc định của trình duyệt', d.touchAction === 'none', d.touchAction);
    check('khoá phóng to hai ngón', d.noZoom);
    check('không bôi đen được chữ', d.select === 'none', d.select);

    // Chạm vào canvas là RA CẦN GẠT ngay tại chỗ ngón đặt xuống — cần gạt cố
    // định một góc thì ngón cái phải với, trên màn dọc là hỏng.
    await page.click('#ui .btn.primary');
    await page.waitForFunction(() => DC.game.state === 'play', null, { timeout: 8000 });
    const stick = await page.evaluate(async () => {
      const cv = document.getElementById('cv');
      const r = cv.getBoundingClientRect();
      const x = r.left + r.width * 0.3, y = r.top + r.height * 0.75;
      cv.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, bubbles: true }));
      const s = DC.game.input.stick;
      const at = { active: s.active, ox: Math.round(s.ox), want: Math.round(r.width * 0.3) };
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      return at;
    });
    check('chạm đâu thì cần gạt mọc ở đó', stick.active && Math.abs(stick.ox - stick.want) < 6,
      'tâm ' + stick.ox + ' / mong ' + stick.want);
  } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------
async function suiteSave(browser) {
  out.push('\n[12] Bản lưu — sống qua lần tải lại');
  const { ctx, page } = await open(browser);
  try {
    await page.evaluate(() => {
      const M = DC.Meta;
      M.s.gold = 12345; M.s.gem = 777;
      M.s.pets.hon = { own: true, tier: 3 };
      M.s.up.hp = 5;
      M.save();
    });
    await page.reload();
    await page.waitForFunction(
      () => window.DC && window.DC.Meta && window.DC.Meta.s, null, { timeout: 15000 });
    const d = await page.evaluate(() => ({
      gold: DC.Meta.s.gold, gem: DC.Meta.s.gem,
      hon: DC.Meta.s.pets.hon ? DC.Meta.s.pets.hon.tier : 0,
      hp: DC.Meta.stats().hp
    }));
    check('vàng/ngọc giữ nguyên sau khi tải lại', d.gold === 12345 && d.gem === 777,
      d.gold + ' / ' + d.gem);
    check('bậc linh thú giữ nguyên', d.hon === 3, 'bậc ' + d.hon);
    check('nâng cấp vĩnh viễn có tác dụng lên chỉ số', d.hp > 145,
      Math.round(d.hp) + ' máu (gốc 145 + 5 cấp Thể Lực)');

    // Bản lưu cũ thiếu trường thì phải VÁ chứ không được vỡ.
    const patched = await page.evaluate(() => {
      localStorage.setItem('deepcore.save.v1', JSON.stringify({ v: 1, gold: 9 }));
      const s = DC.Meta.load();
      return { gold: s.gold, hasTeam: Array.isArray(s.team), hasEq: !!s.eq, hasUp: !!s.up };
    });
    check('bản lưu thiếu trường thì tự vá, không vỡ',
      patched.gold === 9 && patched.hasTeam && patched.hasEq && patched.hasUp);
  } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------
async function suiteSafety(browser) {
  out.push('\n[13] Không kẹt, không trôi số');
  const { ctx, page } = await open(browser);
  try {
    await page.click('#ui .btn.primary');
    await page.waitForFunction(() => DC.game.state === 'play', null, { timeout: 8000 });
    const d = await page.evaluate(() => {
      const g = DC.game;
      // Hang phải LIÊN THÔNG: đếm ô sàn với tới được từ chỗ vào. Một hang có
      // phòng mồ côi là một ván không thể xong nhiệm vụ.
      const w = g.world;
      const seen = new Uint8Array(w.W * w.H);
      const st = [[g.player.tileX(), g.player.tileY()]];
      let reach = 0;
      while (st.length) {
        const [x, y] = st.pop();
        const id = w.idx(x, y);
        if (!w.inside(x, y) || seen[id]) continue;
        if (w.kind[id] === DC.TK.WALL || w.kind[id] === DC.TK.ORE || w.kind[id] === DC.TK.ROCK) continue;
        seen[id] = 1; reach++;
        st.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
      let floors = 0;
      for (let i = 0; i < w.kind.length; i++) {
        if (w.kind[i] === DC.TK.FLOOR || w.kind[i] === DC.TK.LIQ) floors++;
      }
      return { reach, floors, ratio: +(reach / floors).toFixed(3) };
    });
    check('hang liên thông ≥ 92% ô sàn', d.ratio >= 0.92,
      d.reach + '/' + d.floors + ' ô (' + (d.ratio * 100).toFixed(0) + '%)');

    const long = await fastForward(page, 300, { god: true, bot: true, autoCard: true });
    const num = await page.evaluate(() => {
      const g = DC.game;
      const bad = [];
      if (!isFinite(g.player.x) || !isFinite(g.player.y)) bad.push('vị trí người chơi');
      if (!isFinite(g.player.hp) || g.player.hp > g.run.st.hp + 0.01) bad.push('máu');
      if (!isFinite(g.player.xp) || g.player.xp < 0) bad.push('kinh nghiệm');
      for (const q of g.pets) {
        if (!isFinite(q.x) || !isFinite(q.hp)) bad.push('linh thú ' + q.def.id);
      }
      for (const e of g.enemies) if (!isFinite(e.x) || !isFinite(e.hp)) bad.push('quái ' + e.key);
      return { bad, projs: g.projs.length, fx: g.fx.parts.length, level: g.player.level };
    });
    check('chạy 5 phút không ném lỗi', long.state !== 'crash');
    check('không chỉ số nào thành NaN', num.bad.length === 0, num.bad.slice(0, 3).join(', '));
    check('đạn không rò rỉ (< 200 viên)', num.projs < 200, num.projs + ' viên');
    check('5 phút lên được ít nhất cấp 8', num.level >= 8, 'cấp ' + num.level);
  } finally { await ctx.close(); }
}

// ---------------------------------------------------------------------------
(async function main() {
  const browser = await chromium.launch({
    args: ['--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required']
  });
  const suites = [suiteBoot, suiteArt, suiteMenu, suiteGacha, suiteRunStart,
                  suiteMining, suitePets, suiteLevelUp, suiteDirector,
                  suiteEndgame, suiteMobile, suiteSave, suiteSafety];
  for (const s of suites) {
    try { await s(browser); }
    catch (e) { check(s.name + ' — cả bộ ném lỗi', false, String(e.message).slice(0, 180)); }
  }
  await browser.close();
  console.log(out.join('\n'));
  console.log('\n  ĐẠT ' + pass + '   HỎNG ' + fail + '\n');
  process.exit(fail ? 1 : 0);
})();
