/*
 * Tầng 4A (ải mở rộng sau 3-5) của Chế độ Ải thường, Hiệp Sĩ Linh Hồn (games/soulknight/js/floor4.js).
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-floor4.js
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-floor4/  (4-1.png, npc.png, gate.png, boss-*.png).
 *
 * 1. Mặc định lượt chơi chỉ 15 ải (1-1..3-5); chủ đề monolith (4A) có đủ 7 quái e_stone_*.
 * 2. Hạ trùm 3-5 → Kẻ Vượt Ranh Giới hiện, hai cách trả: 100 vàng (trừ đúng 100) hoặc 1 HP tối đa (hpMax - 1);
 *    không đủ vàng thì không mở cổng; trả xong cổng tím hiện, bước vào thì sang 4-1 chủ đề 4A, lượt thêm 4-1..4-5.
 * 3. Quái từng ải 4-1..4-5 đúng danh sách + trọng số của config map_levels.map_A16..A20 (số chép tay dưới đây, không đọc từ mã).
 * 4. 4-5: trùm thuộc nhóm 4A (stone_man / warlord / stone_dragon), máu đúng wiki; Hulala đổi con vật theo 1/3 máu; hạ xong → thắng.
 * 5. Không trả giá → qua cổng thường ở 3-5 thì thắng như cũ (lượt vẫn 15 ải).
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = (process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html') + '?quick=1';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-floor4');
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  results.push('  ' + (ok ? '✔ ' : '✘ ') + name + (detail ? '  — ' + detail : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(p, fn, arg, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await p.evaluate(fn, arg)) return true;
    await sleep(100);
  }
  return false;
}

// Số chép tay từ config map_levels (map_A16..A20 .Enemies; weight 0/vắng = không ra) [CFG]
const ROSTER = {
  1: { e_stone_man: 40, e_stone_dog: 30, e_stone_horse: 20, e_origin_stone: 5 },
  2: { e_stone_man: 40, e_stone_eagle: 10, e_stone_dog: 20, e_stone_horse: 20, e_origin_stone: 5 },
  3: { e_stone_man: 30, e_stone_eagle: 15, e_stone_dog: 20, e_stone_horse: 15, e_stone_ox: 10, e_origin_stone: 5 },
  4: { e_stone_man: 30, e_stone_eagle: 10, e_stone_dog: 10, e_stone_horse: 20, e_stone_ox: 15, e_stone_chariot: 15, e_origin_stone: 5 },
  5: { e_stone_man: 30, e_stone_eagle: 10, e_stone_dog: 5, e_stone_horse: 10, e_stone_ox: 15, e_stone_chariot: 20, e_origin_stone: 5 }
};
const ALL7 = ['e_origin_stone', 'e_stone_chariot', 'e_stone_dog', 'e_stone_eagle', 'e_stone_horse', 'e_stone_man', 'e_stone_ox'];
// Trùm 4-5 của 4A [CFG map_A20]; máu wiki 1440 / 1800 / 1440 (warlord config giữ chỗ 999999)
const BOSS45 = { boss_stone_man: 1440, boss_warlord: 1800, boss_stone_dragon: 1440 };

// Vùng ép khi mở cổng tím (SK.floor4.force); 4A mặc định cho các phần cũ.
let ZONE = 'monolith';
async function open(b) {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => {
    const t = m.text();
    if (m.type() === 'error') errs.push('console: ' + t);
    else if (m.type() === 'warning' && /AI class|not implemented|boss .* not in|missing|prefab missing/i.test(t)) errs.push('warn: ' + t);
  });
  await p.goto(URL);
  await p.waitForSelector('#sk-start', { state: 'visible', timeout: 10000 });
  await p.click('#sk-start');
  await until(p, () => SK_GAME.state === 'stage', null, 5000);
  await p.evaluate(z => { SK_GAME.debug.god(true); SK_GAME.debug.pet(false); SK.floor4.force = z; }, ZONE);
  return { p, errs };
}

// Tới phòng trùm của ải đang đứng, chờ trùm hiện rồi hạ bằng sát thương lớn (đường thật: hurtEnemy → enemyKill → phòng mở).
async function killBoss(p) {
  await p.evaluate(() => SK_GAME.debug.teleportTo('boss'));
  const spawned = await until(p, () => SK.G.enemies.some(e => e.bossKey), null, 8000);
  const hud = spawned && await until(p, () => SK.bossHud.visible, null, 9000);
  if (!hud) return { spawned, hud, cleared: false };
  const keys = await p.evaluate(() => SK.G.enemies.filter(e => e.bossKey).map(e => e.bossKey + ':' + e.hpMax));
  await p.evaluate(() => { for (const e of SK.G.enemies) if (e.bossKey) SK.hurtEnemy(SK.G, e, 1e6, false, 0, 0); });
  const cleared = await until(p, () => SK_GAME.rooms.find(r => r.type === 'boss').state === 'cleared', null, 15000);
  await sleep(400);
  return { spawned, hud, cleared, keys };
}

async function walkPortal(p, want) {
  await p.evaluate(() => SK_GAME.debug.teleportTo('end'));
  await sleep(300);
  await p.keyboard.down('KeyW');
  let ok = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 12000) {
    const st = await p.evaluate(() => ({ stage: SK_GAME.stage, state: SK_GAME.state, buffs: SK.ROOMS.choice.open }));
    if (want(st)) { ok = true; break; }
    if (st.buffs) await p.keyboard.press('Digit1');
    await sleep(150);
  }
  await p.keyboard.up('KeyW');
  return ok;
}

// Đứng cạnh Kẻ Vượt Ranh Giới, bấm lựa chọn có nhãn khớp re (gọi use() của vật tương tác, như phím E).
const useOption = (p, re) => p.evaluate(src => {
  const it = SK.G.interactables.find(i => i.f4 && !i.gone && new RegExp(src).test(i.label));
  if (!it) return false; it.use(); return true;
}, re);
const npcState = p => p.evaluate(() => {
  const f = SK.G.f4 || {}, p0 = SK.G.player;
  return { npc: !!f.npc, opts: SK.G.interactables.filter(i => i.f4 && !i.gone).map(i => i.label), gate: !!f.gate, paid: f.paid || null, gold: p0.gold, hpMax: p0.hpMax, hp: p0.hp };
});

// Vào gate tím, qua màn tải/chọn thiên phú tới 4-1.
async function enterGate(p) {
  await p.evaluate(() => { const g = SK.G.f4.gate; SK.G.player.x = g.x; SK.G.player.y = g.y; });
  const t0 = Date.now();
  let at = null;
  while (Date.now() - t0 < 14000) {
    const st = await p.evaluate(() => ({ stage: SK_GAME.stage, buffs: SK.ROOMS.choice.open, phase: SK_GAME.phase }));
    if (st.stage === '4-1') { at = st; break; }
    if (st.buffs) await p.keyboard.press('Digit1');
    await sleep(150);
  }
  return at;
}

async function toBossCleared35(b, tag) {
  const { p, errs } = await open(b);
  const n0 = await p.evaluate(() => SK.STAGES.length);
  await p.evaluate(() => { SK_GAME.debug.stage('3-5'); });
  await until(p, () => SK_GAME.phase === 'play', null, 4000);
  const before = await p.evaluate(() => !!(SK.G.f4 && SK.G.f4.npc));
  const kb = await killBoss(p);
  check(tag + ': hạ được trùm 3-5, phòng mở', kb.spawned && kb.hud && kb.cleared, JSON.stringify(kb.keys));
  return { p, errs, n0, before };
}

(async () => {
  const b = await chromium.launch();
  try {
    // ---- 1. dữ liệu chủ đề + độ dài lượt mặc định
    {
      const { p, errs } = await open(b);
      const r = await p.evaluate(() => {
        const th = SK.D.themes.monolith;
        return { level: th && th.level, enemies: th && th.enemies.slice().sort(), elites: th && Object.keys(th.elites).length, n: SK.STAGES.length,
          labels: SK.STAGES.map(s => s.label), lvl4: SK.tierThemes(4), bg: th && th.bg, lib: th && Object.keys(th.lib || {}).length };
      });
      check('chủ đề monolith (4A): level 4, 7 quái e_stone_*, 7 bản tinh anh', r.level === 4 && JSON.stringify(r.enemies) === JSON.stringify(ALL7) && r.elites === 7, JSON.stringify(r.enemies));
      check('chủ đề monolith có nền trời + thư viện vật cản của vùng', r.bg === '#68d7de' && r.lib >= 10, r.bg + ' lib ' + r.lib);
      check('lượt mặc định chỉ 15 ải 1-1..3-5 (tầng 4 chỉ nối khi qua cổng tím)', r.n === 15 && r.labels[0] === '1-1' && r.labels[14] === '3-5', r.n + ' ải');
      check('SK.tierThemes(4) gồm monolith (4A) và battleground (4B)', JSON.stringify(r.lvl4.slice().sort()) === '["battleground","monolith"]', JSON.stringify(r.lvl4));
      check('không lỗi trang (chủ đề)', !errs.length, errs.slice(0, 3).join(' | '));
      await p.close();
    }

    // ---- 2. trả 100 vàng
    let gateRun;
    {
      const R = await toBossCleared35(b, 'trả vàng');
      const { p, errs } = R;
      check('trước khi hạ trùm chưa có Kẻ Vượt Ranh Giới', R.before === false);
      let s = await npcState(p);
      const hp00 = s.hpMax;
      check('hạ trùm 3-5 → Kẻ Vượt Ranh Giới xuất hiện với hai lựa chọn trả giá', s.npc && s.opts.length === 2 && /100 vàng/.test(s.opts[0]) && /1 HP tối đa/.test(s.opts[1]), JSON.stringify(s.opts));
      await p.evaluate(() => { const n = SK.G.f4.npc; SK.G.player.x = n.x + 22; SK.G.player.y = n.y + 4; SK.G.player.gold = 99; });
      await sleep(700);
      await p.screenshot({ path: path.join(SHOTS, 'npc.png') });
      await useOption(p, 'vàng');
      s = await npcState(p);
      check('99 vàng: lựa chọn vàng bị từ chối (vàng không đổi, không cổng)', s.gold === 99 && !s.gate && s.hpMax === hp00, JSON.stringify(s));
      await p.evaluate(() => { SK.G.player.gold = 250; });
      await useOption(p, 'vàng');
      s = await npcState(p);
      check('250 vàng: trừ đúng 100 (còn 150), hpMax không đổi, cổng tím mở', s.gold === 150 && s.hpMax === hp00 && s.gate && s.paid === 'gold', JSON.stringify(s));
      check('mở cổng thì hai lựa chọn biến mất', s.opts.length === 0);
      await sleep(900);
      await p.screenshot({ path: path.join(SHOTS, 'gate.png') });
      const at = await enterGate(p);
      const r = await p.evaluate(() => ({ stage: SK_GAME.stage, theme: SK.G.stage.theme, n: SK.STAGES.length, labels: SK.STAGES.slice(15).map(s => s.label),
        th: SK.G.map.th === SK.D.themes.monolith, gold: SK.G.player.gold, hpMax: SK.G.player.hpMax }));
      check('bước vào cổng tím → 4-1, chủ đề monolith', !!at && r.stage === '4-1' && r.theme === 'monolith' && r.th, JSON.stringify(r));
      check('lượt thêm đúng 5 ải 4-1..4-5', r.n === 20 && r.labels.join() === '4-1,4-2,4-3,4-4,4-5', r.labels.join());
      check('sang 4-1 không trừ thêm vàng / máu', r.gold === 150 && r.hpMax === hp00);
      await until(p, () => SK_GAME.phase === 'play', null, 5000);
      await p.evaluate(() => SK_GAME.debug.teleportTo('battle', 0));
      await until(p, () => SK.G.enemies.length > 0, null, 6000);
      await sleep(1500);
      await p.screenshot({ path: path.join(SHOTS, '4-1.png') });
      const e1 = await p.evaluate(() => SK.G.enemies.map(e => e.id.replace(/^ex_/, 'e_')));
      const bad = e1.filter(id => !(id in ROSTER[1]));
      check('4-1: quái ngoài đời thật thuộc danh sách map_A16', e1.length > 0 && !bad.length, [...new Set(e1)].join(' ') + (bad.length ? ' LẠ ' + bad : ''));
      const ai = await p.evaluate(() => [...new Set(SK.G.enemies.map(e => e.rawCls + '>' + e.cls))]);
      check('4-1: mọi lớp AI Unity của quái 4A đã có bản viết lại (không rơi về EnemyAI01)', ai.every(s => { const [raw, to] = s.split('>'); return raw === to; }), ai.join(' '));
      gateRun = { p, errs };
    }

    // ---- 3. quái từng ải 4-1..4-5 (bốc đợt thật bằng G.buildWaves)
    {
      const { p, errs } = gateRun;
      const R = await p.evaluate(() => {
        const out = {};
        for (let n = 1; n <= 5; n++) {
          SK_GAME.debug.stage('4-' + n);
          const room = SK.G.map.rooms.find(r => r.type === 'battle'), cnt = {};
          for (let k = 0; k < 120; k++) for (const w of SK.G.buildWaves(room)) for (const id of w) { const b = id.replace(/^ex_/, 'e_'); cnt[b] = (cnt[b] || 0) + 1; }
          out[n] = cnt;
        }
        return out;
      });
      for (let n = 1; n <= 5; n++) {
        const got = Object.keys(R[n]).sort(), want = Object.keys(ROSTER[n]).sort();
        const tot = Object.values(R[n]).reduce((s, x) => s + x, 0);
        // quái cùng giá `consume` nên tỉ lệ ~ trọng số: man (trọng số lớn nhất) phải nhiều hơn quái hiếm nhất
        const rare = want.reduce((a, k) => (ROSTER[n][k] < ROSTER[n][a] ? k : a), want[0]);
        check('4-' + n + ': đợt quái đúng danh sách map_A' + (15 + n), JSON.stringify(got) === JSON.stringify(want), got.join(' ') + ' · ' + tot + ' lượt');
        check('4-' + n + ': trọng số chạy (man nhiều hơn ' + rare + ')', (R[n].e_stone_man || 0) > (R[n][rare] || 0), 'man ' + R[n].e_stone_man + ' / ' + rare + ' ' + R[n][rare]);
      }
      check('4-1 không có Bò/Đại Bàng/Xe Ngựa; 4-5 có Xe Ngựa', !R[1].e_stone_ox && !R[1].e_stone_eagle && !R[1].e_stone_chariot && R[5].e_stone_chariot > 0);

      // ---- 4. trùm 4-5
      await p.evaluate(() => SK_GAME.debug.stage('4-5'));
      await until(p, () => SK_GAME.phase === 'play', null, 5000);
      await p.evaluate(() => SK_GAME.debug.teleportTo('boss'));
      const sp = await until(p, () => SK.G.enemies.some(e => e.bossKey), null, 8000);
      const bk = await p.evaluate(() => SK.G.enemies.filter(e => e.bossKey).map(e => [e.bossKey, Math.round(e.hpMax)]));
      check('4-5: phòng trùm có trùm của 4A', sp && bk.length === 1 && bk[0][0] in BOSS45, JSON.stringify(bk));
      check('4-5: máu trùm đúng số wiki', bk.length === 1 && bk[0][1] === BOSS45[bk[0][0]], JSON.stringify(bk) + ' cần ' + BOSS45[bk[0] && bk[0][0]]);
      await sleep(1100);
      await p.screenshot({ path: path.join(SHOTS, 'boss-intro.png') });
      await until(p, () => SK.bossHud.visible, null, 9000);
      await sleep(1200);
      await p.screenshot({ path: path.join(SHOTS, 'boss-fight.png') });
      // Hulala: mỗi 1/3 máu đổi con vật Ngựa → Bò → Xe Ngựa
      if (bk[0] && bk[0][0] === 'boss_warlord') {
        const seq = [];
        for (let ph = 0; ph <= 2; ph++) {
          if (ph) await p.evaluate(ph => { const e = SK.G.enemies.find(x => x.bossKey); e.hp = Math.floor(e.hpMax * (1 - ph / 3)) - 1; }, ph);
          await sleep(ph ? 1400 : 200);
          seq.push(await p.evaluate(() => SK.G.enemies.find(x => x.bossKey).mount.id.replace('boss_warlord_', '')));
          if (ph) await p.screenshot({ path: path.join(SHOTS, 'boss-ph' + ph + '.png') });
          await sleep(3000);
        }
        check('Hulala đổi con vật theo 1/3 máu: ngựa → bò → xe', seq.join() === 'horse,ox,chariot', seq.join());
        const used = await p.evaluate(() => Object.keys(SK.G.enemies.find(x => x.bossKey).used));
        check('Hulala dùng nhiều kiểu đánh', used.length >= 3, used.join(' '));
      }
      await p.evaluate(() => { const e = SK.G.enemies.find(x => x.bossKey); SK.hurtEnemy(SK.G, e, 1e6, false, 0, 0); });
      const cl = await until(p, () => SK_GAME.rooms.find(r => r.type === 'boss').state === 'cleared', null, 15000);
      await sleep(1500);
      await p.screenshot({ path: path.join(SHOTS, 'boss-dead.png') });
      check('hạ trùm 4-5 → phòng mở', cl);
      const win = await walkPortal(p, st => st.state === 'victory');
      const fin = await p.evaluate(() => ({ state: SK_GAME.state, stage: SK.G.stage.label }));
      check('qua cổng sau 4-5 → chiến thắng (không còn ải sau)', win && fin.state === 'victory' && fin.stage === '4-5', JSON.stringify(fin));
      check('không lỗi trang (đường trả vàng → 4-5)', !errs.length, errs.slice(0, 3).join(' | '));
      await p.close();
    }

    // ---- 5. trả 1 HP tối đa
    {
      const R = await toBossCleared35(b, 'trả HP');
      const { p, errs } = R;
      await p.evaluate(() => { const n = SK.G.f4.npc; SK.G.player.x = n.x + 22; SK.G.player.y = n.y + 4; SK.G.player.gold = 99; });
      let s = await npcState(p);
      const hp0 = s.hpMax;
      await useOption(p, 'HP tối đa');
      s = await npcState(p);
      check('99 vàng + chọn HP: hpMax giảm đúng 1, vàng giữ nguyên, cổng mở', s.hpMax === hp0 - 1 && s.gold === 99 && s.gate && s.paid === 'hp' && s.hp <= s.hpMax, JSON.stringify(s) + ' (hpMax trước ' + hp0 + ')');
      const at = await enterGate(p);
      const r = await p.evaluate(() => ({ stage: SK_GAME.stage, theme: SK.G.stage.theme, hpMax: SK.G.player.hpMax, gold: SK.G.player.gold }));
      check('bước vào cổng → 4-1 chủ đề 4A, hpMax vẫn thấp hơn 1', !!at && r.stage === '4-1' && r.theme === 'monolith' && r.hpMax === hp0 - 1 && r.gold === 99, JSON.stringify(r));
      check('không lỗi trang (đường trả HP)', !errs.length, errs.slice(0, 3).join(' | '));
      await p.close();
    }

    // ---- 6. không trả giá
    {
      const R = await toBossCleared35(b, 'không trả');
      const { p, errs } = R;
      const s = await npcState(p);
      check('NPC có mặt nhưng không ai trả: chưa có cổng tím', s.npc && !s.gate);
      const win = await walkPortal(p, st => st.state === 'victory');
      const fin = await p.evaluate(() => ({ state: SK_GAME.state, stage: SK.G.stage.label, n: SK.STAGES.length }));
      check('không trả giá → qua cổng thường thắng ở 3-5 như cũ', win && fin.state === 'victory' && fin.stage === '3-5' && fin.n === 15, JSON.stringify(fin));
      check('không lỗi trang (đường không trả)', !errs.length, errs.slice(0, 3).join(' | '));
      await p.close();
    }

    // ---- 7. Tầng 4B Chiến Trường Cổ (ép vùng bằng SK.floor4.force)
    ZONE = 'battleground';
    {
      const ROSTER_B = {
        1: { e_mob0: 85, e_mob2: 5, e_mob4: 10 },
        2: { e_mob0: 70, e_mob1: 5, e_mob2: 5, e_mob4: 10 },
        3: { e_mob0: 78, e_mob1: 3, e_mob2: 3, e_mob3: 3, e_mob4: 10, e_mob5: 3 },
        4: { e_mob0: 78, e_mob1: 3, e_mob2: 3, e_mob3: 3, e_mob4: 10, e_mob5: 3 },
        5: { e_mob0: 78, e_mob1: 3, e_mob2: 3, e_mob3: 3, e_mob4: 10, e_mob5: 3 }
      };
      const { p, errs } = await open(b);
      const d = await p.evaluate(() => { const th = SK.D.themes.battleground; return { level: th && th.level, en: th && th.enemies.slice().sort(), ex: th && Object.keys(th.elites).length,
        bg: th && th.bg, fl: th && th.tiles.floor.length, wl: th && th.tiles.wall.length, lib: th && Object.keys(th.lib || {}).length }; });
      check('chủ đề battleground (4B): level 4, 6 quái e_mob0..5, 6 bản tinh anh, có nền + sàn + tường',
        d.level === 4 && JSON.stringify([...new Set(d.en)]) === JSON.stringify(['e_mob0', 'e_mob1', 'e_mob2', 'e_mob3', 'e_mob4', 'e_mob5']) && d.ex === 6 && d.fl >= 1 && d.wl >= 1 && d.bg && d.lib >= 5, JSON.stringify(d).slice(0, 200));
      await p.evaluate(() => { SK_GAME.debug.stage('3-5'); });
      await until(p, () => SK_GAME.phase === 'play', null, 4000);
      const kb = await killBoss(p);
      check('4B: hạ trùm 3-5, phòng mở', kb.spawned && kb.hud && kb.cleared);
      await p.evaluate(() => { const n = SK.G.f4.npc; SK.G.player.x = n.x + 22; SK.G.player.y = n.y + 4; SK.G.player.gold = 250; });
      await useOption(p, 'vàng');
      const at = await enterGate(p);
      const r = await p.evaluate(() => ({ stage: SK_GAME.stage, theme: SK.G.stage.theme, th: SK.G.map.th === SK.D.themes.battleground, labels: SK.STAGES.slice(15).map(s => s.label), themes: [...new Set(SK.STAGES.slice(15).map(s => s.theme))] }));
      check('cổng tím ép 4B → 4-1 chủ đề battleground, cả 5 ải cùng vùng', !!at && r.stage === '4-1' && r.theme === 'battleground' && r.th && r.themes.join() === 'battleground' && r.labels.join() === '4-1,4-2,4-3,4-4,4-5', JSON.stringify(r));
      await until(p, () => SK_GAME.phase === 'play', null, 5000);
      await p.evaluate(() => SK_GAME.debug.teleportTo('battle', 0));
      await until(p, () => SK.G.enemies.length > 0, null, 6000);
      await sleep(1500);
      await p.screenshot({ path: path.join(SHOTS, '4B-1.png') });
      const e1 = await p.evaluate(() => SK.G.enemies.map(e => e.id.replace(/^ex_/, 'e_')));
      const bad = e1.filter(id => !(id in ROSTER_B[1]));
      check('4B 4-1: quái ngoài đời thật thuộc danh sách map_B16', e1.length > 0 && !bad.length, [...new Set(e1)].join(' ') + (bad.length ? ' LẠ ' + bad : ''));
      const ai = await p.evaluate(() => [...new Set(SK.G.enemies.map(e => e.rawCls + '>' + e.cls))]);
      check('4B 4-1: AI quái đã có bản viết lại (không rơi về EnemyAI01)', ai.every(s => { const [raw, to] = s.split('>'); return raw === to; }), ai.join(' '));

      const R = await p.evaluate(() => {
        const out = {};
        for (let n = 1; n <= 5; n++) {
          SK_GAME.debug.stage('4-' + n);
          const room = SK.G.map.rooms.find(r => r.type === 'battle'), cnt = {};
          for (let k = 0; k < 150; k++) for (const w of SK.G.buildWaves(room)) for (const id of w) { const b = id.replace(/^ex_/, 'e_'); cnt[b] = (cnt[b] || 0) + 1; }
          out[n] = cnt;
        }
        return out;
      });
      for (let n = 1; n <= 5; n++) {
        const got = Object.keys(R[n]).sort(), want = Object.keys(ROSTER_B[n]).sort();
        check('4B 4-' + n + ': đợt quái đúng danh sách map_B' + (15 + n), JSON.stringify(got) === JSON.stringify(want) && (R[n].e_mob0 || 0) > (R[n].e_mob4 || 0), got.join(' ') + ' mob0 ' + R[n].e_mob0 + ' mob4 ' + R[n].e_mob4);
      }

      // 4-3 dùng phòng r4b_*: hành lang dài rồi phòng vuông; kiểm nhiều lần sinh màn
      const m3 = await p.evaluate(() => {
        const out = [];
        for (let k = 0; k < 6; k++) {
          SK_GAME.debug.stage('4-3');
          out.push(SK.G.map.rooms.filter(r => r.type === 'battle').map(r => r.patternId));
        }
        return out;
      });
      check('4B 4-3: hai phòng đánh là r4b_long rồi r4b_big_*', m3.every(a => a.length === 2 && a[0] === 'r4b_long' && /^r4b_big_[012]$/.test(a[1])), JSON.stringify(m3));
      await until(p, () => SK_GAME.phase === 'play', null, 5000);
      const ovl = await p.evaluate(() => { const rs = SK.G.map.rooms; let bad = 0; for (const a of rs) for (const c of rs) if (a.id < c.id && a.x0 <= c.x1 && c.x0 <= a.x1 && a.y0 <= c.y1 && c.y0 <= a.y1) bad++; return bad; });
      check('4B 4-3: các phòng không chồng nhau', ovl === 0, 'chồng ' + ovl);
      await p.evaluate(() => SK_GAME.debug.teleportTo('battle', 0));
      await until(p, () => SK.G.enemies.length > 0, null, 6000);
      await sleep(1200);
      await p.screenshot({ path: path.join(SHOTS, '4B-3.png') });
      const e3 = await p.evaluate(() => SK.G.enemies.map(e => e.id.replace(/^ex_/, 'e_')));
      check('4B 4-3: phòng hành lang sinh quái thuộc map_B18, số lượng hợp lý (< 60)', e3.length > 0 && e3.length < 60 && e3.every(id => id in ROSTER_B[3]), e3.length + ' quái: ' + [...new Set(e3)].join(' '));

      // 4-5: trùm, hạ thì thắng
      await p.evaluate(() => SK_GAME.debug.stage('4-5'));
      await until(p, () => SK_GAME.phase === 'play', null, 5000);
      await p.evaluate(() => SK_GAME.debug.teleportTo('boss'));
      const sp = await until(p, () => SK.G.enemies.some(e => e.bossKey), null, 8000);
      const bk = await p.evaluate(() => SK.G.enemies.filter(e => e.bossKey).map(e => [e.bossKey, Math.round(e.hpMax)]));
      check('4B 4-5: phòng trùm có trùm (mượn trùm 4A)', sp && bk.length === 1 && bk[0][0] in BOSS45, JSON.stringify(bk));
      await until(p, () => SK.bossHud.visible, null, 9000);
      await sleep(1200);
      await p.screenshot({ path: path.join(SHOTS, '4B-boss.png') });
      await p.evaluate(() => { const e = SK.G.enemies.find(x => x.bossKey); SK.hurtEnemy(SK.G, e, 1e6, false, 0, 0); });
      const cl = await until(p, () => SK_GAME.rooms.find(r => r.type === 'boss').state === 'cleared', null, 15000);
      check('4B: hạ trùm 4-5 → phòng mở', cl);
      const win = await walkPortal(p, st => st.state === 'victory');
      const fin = await p.evaluate(() => ({ state: SK_GAME.state, stage: SK.G.stage.label }));
      check('4B: qua cổng sau 4-5 → chiến thắng', win && fin.state === 'victory' && fin.stage === '4-5', JSON.stringify(fin));
      check('không lỗi trang (4B)', !errs.length, errs.slice(0, 3).join(' | '));
      await p.close();
    }
  } catch (e) {
    check('chạy không rớt', false, e.stack || e.message);
  }
  await b.close();
  console.log(results.join('\n'));
  console.log('\nĐẠT ' + pass + '  HỎNG ' + fail + '   (ảnh: ' + SHOTS + ')');
  process.exit(fail ? 1 : 0);
})();
