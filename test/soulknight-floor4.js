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
  let at = null, buffHp = 0;   // thẻ thiên phú sau 3-5 có thể cộng máu tối đa: đo phần chênh để kiểm đúng phần "hiến 1 máu"
  while (Date.now() - t0 < 14000) {
    const st = await p.evaluate(() => ({ stage: SK_GAME.stage, buffs: SK.ROOMS.choice.open, phase: SK_GAME.phase, hpMax: SK.G.player.hpMax }));
    if (st.stage === '4-1') { at = st; break; }
    if (st.buffs) {
      await p.keyboard.press('Digit1'); await sleep(150);
      buffHp += await p.evaluate(() => SK.G.player.hpMax) - st.hpMax;
      continue;
    }
    await sleep(150);
  }
  if (at) at.buffHp = buffHp;
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
      check('SK.tierThemes(4) gồm monolith (4A), battleground (4B) và seabed (4C)', JSON.stringify(r.lvl4.slice().sort()) === '["battleground","monolith","seabed"]', JSON.stringify(r.lvl4));
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
      check('sang 4-1 không trừ thêm vàng / máu', r.gold === 150 && r.hpMax === hp00 + at.buffHp, JSON.stringify({ gold: r.gold, hpMax: r.hpMax, hp00, buffHp: at.buffHp }));
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
      check('bước vào cổng → 4-1 chủ đề 4A, hpMax vẫn thấp hơn 1', !!at && r.stage === '4-1' && r.theme === 'monolith' && r.hpMax === hp0 - 1 + at.buffHp && r.gold === 99, JSON.stringify(Object.assign(r, { buffHp: at.buffHp })));
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

    // ---- 8. Tầng 4C Đáy Biển (ép vùng bằng SK.floor4.force): quái map_C16..C20, oxy, bong bóng quái, trùm
    ZONE = 'seabed';
    {
      const ROSTER_C = {
        1: { e_seabed_mob0: 40, e_seabed_mob1: 35, e_seabed_mob2: 20 },
        2: { e_seabed_mob0: 35, e_seabed_mob1: 32, e_seabed_mob2: 22, e_seabed_mob3: 8 },
        3: { e_seabed_mob0: 40, e_seabed_mob1: 30, e_seabed_mob2: 25, e_seabed_mob3: 15, e_seabed_mob4: 10 },
        4: { e_seabed_mob0: 40, e_seabed_mob1: 30, e_seabed_mob2: 27, e_seabed_mob3: 15, e_seabed_mob4: 10, e_seabed_mob5: 8 },
        5: { e_seabed_mob0: 40, e_seabed_mob1: 30, e_seabed_mob2: 30, e_seabed_mob3: 20, e_seabed_mob4: 15, e_seabed_mob5: 10 }
      };
      const HPC = { 0: [40, 75], 1: [25, 47], 2: [35, 75], 3: [75, 100], 4: [100, 130], 5: [140, 175] };   // [WIKI Undersea]
      const { p, errs } = await open(b);
      const d = await p.evaluate(() => { const th = SK.D.themes.seabed, E = SK.D.enemies; return { level: th && th.level, en: th && th.enemies.slice().sort(), ex: th && Object.keys(th.elites).length,
        bg: th && th.bg, fl: th && th.tiles.floor.length, wl: th && th.tiles.wall.length, hp: [0, 1, 2, 3, 4, 5].map(k => [E['e_seabed_mob' + k].hp, E['ex_seabed_mob' + k].hp]),
        ai: [0, 1, 2, 3, 4, 5].map(k => E['e_seabed_mob' + k].ai[0] && E['e_seabed_mob' + k].ai[0].cls), zones: SK.floor4.ZONES.slice() }; });
      check('chủ đề seabed (4C): level 4, 6 quái e_seabed_mob0..5, 6 bản tinh anh, có sàn + tường',
        d.level === 4 && JSON.stringify([...new Set(d.en)]) === JSON.stringify([0, 1, 2, 3, 4, 5].map(k => 'e_seabed_mob' + k)) && d.ex === 6 && d.fl >= 1 && d.wl >= 1 && d.bg, JSON.stringify(d).slice(0, 220));
      check('máu quái 4C theo wiki (thường / tinh anh) và đều có AIBrain', JSON.stringify(d.hp) === JSON.stringify([0, 1, 2, 3, 4, 5].map(k => HPC[k])) && d.ai.every(c => c === 'AIBrain'), JSON.stringify(d.hp) + ' ' + d.ai);
      check('bể cổng tím có đủ 3 vùng 4A/4B/4C', JSON.stringify(d.zones.slice().sort()) === '["battleground","monolith","seabed"]', d.zones.join());
      await p.evaluate(() => { SK_GAME.debug.stage('3-5'); });
      await until(p, () => SK_GAME.phase === 'play', null, 4000);
      check('ngoài 4C không có oxy / HUD oxy', await p.evaluate(() => !SK.G.oxy));
      const kb = await killBoss(p);
      check('4C: hạ trùm 3-5, phòng mở', kb.spawned && kb.hud && kb.cleared);
      await p.evaluate(() => { const n = SK.G.f4.npc; SK.G.player.x = n.x + 22; SK.G.player.y = n.y + 4; SK.G.player.gold = 250; });
      await useOption(p, 'vàng');
      const at = await enterGate(p);
      const r = await p.evaluate(() => ({ stage: SK_GAME.stage, theme: SK.G.stage.theme, th: SK.G.map.th === SK.D.themes.seabed, labels: SK.STAGES.slice(15).map(s => s.label), themes: [...new Set(SK.STAGES.slice(15).map(s => s.theme))] }));
      check('cổng tím ép 4C → 4-1 chủ đề seabed, cả 5 ải cùng vùng', !!at && r.stage === '4-1' && r.theme === 'seabed' && r.th && r.themes.join() === 'seabed' && r.labels.join() === '4-1,4-2,4-3,4-4,4-5', JSON.stringify(r));
      await until(p, () => SK_GAME.phase === 'play', null, 5000);

      // --- oxy: đầy khi vào ải, tụt đều đúng tốc, HUD hiện
      const o0 = await p.evaluate(() => { const o = SK.G.oxy; return o && { v: o.v, max: SK.floor4.OXY.max, drain: SK.floor4.OXY.drain }; });
      check('vào 4-1 oxy đầy (100)', o0 && o0.max === 100 && o0.v > 97 && o0.drain === 1.25, JSON.stringify(o0));
      await p.evaluate(() => { const o = SK.G.oxy; o.v = 100; o.spawn = 999; o.zones = []; o.t0 = SK.G.t; });
      await sleep(2500);
      const dr = await p.evaluate(() => { const o = SK.G.oxy; return { v: o.v, dt: SK.G.t - o.t0 }; });
      check('oxy tụt 1,25 / giây (đo theo G.t)', dr.dt > 1 && Math.abs((100 - dr.v) / dr.dt - 1.25) < 0.15, JSON.stringify(dr));
      const hud = await p.evaluate(() => ({ h: SK.floor4.hudOxy, t: SK.G.t, v: SK.G.oxy.v }));
      check('HUD oxy hiện (thanh vẽ trong 0,5 s gần nhất, dưới giữa, rộng theo oxy)', hud.h && hud.t - hud.h.t < 0.5 && hud.h.w === 110 && Math.abs(hud.h.v - hud.v) < 3 && hud.h.y > 190, JSON.stringify(hud));
      await p.screenshot({ path: path.join(SHOTS, '4C-hud.png') });

      // --- bong bóng sàn: hồi 30/s và tăng tốc 1,15x khi đứng trong, gỡ khi ra
      const bb = await p.evaluate(async () => {
        const G = SK.G, o = G.oxy, pl = G.player, m0 = pl.moveMul || 1;
        o.v = 40; o.zones = []; SK.floor4.spawnBubble(G, pl.x, pl.y, 30);
        return { m0, z: o.zones.length };
      });
      await sleep(1200);
      const bb2 = await p.evaluate(() => { const G = SK.G, o = G.oxy; return { v: o.v, mm: G.player.moveMul, boost: o.boost }; });
      check('đứng trong bong bóng sàn: oxy tăng nhanh (≥ +25 trong ~1,2 s) và tốc chạy ×1,15', bb.z === 1 && bb2.v > 70 && bb2.boost && Math.abs(bb2.mm / bb.m0 - 1.15) < 0.01, JSON.stringify([bb, bb2]));
      await p.evaluate(() => { SK.G.oxy.zones = []; });
      await sleep(300);
      const bb3 = await p.evaluate(() => ({ mm: SK.G.player.moveMul, boost: SK.G.oxy.boost }));
      check('ra khỏi bong bóng: tốc chạy trả lại', !bb3.boost && Math.abs(bb3.mm - bb.m0) < 1e-4, JSON.stringify(bb3));

      // --- Người Hầu Kraken hút oxy (+5/s ngoài mức tụt thường)
      const kr = await p.evaluate(async () => {
        const G = SK.G, o = G.oxy, pl = G.player;
        const [x, y] = SK.freeNear([pl.x + 40, pl.y]);
        const e = SK.makeEnemy(G, 'e_seabed_mob1', x, y, G.room || G.map.rooms[0]); e.st = 'idle'; e.cd = 99; G.enemies.push(e);
        o.v = 100; o.spawn = 999; o.zones = [];
        await new Promise(r => setTimeout(r, 300));
        const v1 = o.v, t1 = G.t;
        await new Promise(r => setTimeout(r, 1500));
        const res = { rate: (v1 - o.v) / (G.t - t1), drainers: o.drainers.length };
        G.enemies = G.enemies.filter(q => q !== e);
        return res;
      });
      check('Người Hầu Kraken hút oxy: tụt ≈ 6,25 / giây khi nó thấy người chơi', kr.drainers === 1 && kr.rate > 5 && kr.rate < 7.5, JSON.stringify(kr));

      // --- hết oxy: 1 sát thương mỗi giây, trừ giáp trước máu; hồi oxy thì dừng
      await p.evaluate(() => { const G = SK.G, o = G.oxy, pl = G.player; pl.god = false; pl.armorMax = 2; pl.armor = 2; pl.armorT = 3; pl.hp = pl.hpMax = 6; pl.invulT = 0; o.v = 0; o.zones = []; o.spawn = 999; o.hits = 0; o.dmgT = 0; });
      await sleep(3500);
      const z = await p.evaluate(() => { const G = SK.G, pl = G.player; return { hits: G.oxy.hits, armor: Math.round(pl.armor), hp: pl.hp }; });
      check('hết oxy: mỗi giây 1 sát thương, giáp trước máu (3 nhịp: giáp 2→0, máu 6→5)', z.hits === 3 && z.armor === 0 && z.hp === 5, JSON.stringify(z));
      await p.evaluate(() => { SK.G.oxy.v = 30; });
      await sleep(1600);
      const z2 = await p.evaluate(() => ({ hits: SK.G.oxy.hits, hp: SK.G.player.hp }));
      check('có oxy lại thì hết mất máu', z2.hits === z.hits && z2.hp === z.hp, JSON.stringify(z2));
      await p.evaluate(() => { const G = SK.G, o = G.oxy, pl = G.player; G.badass = true; pl.armor = 0; pl.hp = 6; pl.invulT = 0; o.v = 0; o.hits = 0; o.dmgT = 0.9; });
      await sleep(600);
      const z3 = await p.evaluate(() => { const G = SK.G; G.badass = false; return { hits: G.oxy.hits, hp: G.player.hp }; });
      check('Lợi Hại: hết oxy mất 2 máu mỗi nhịp', z3.hits === 1 && z3.hp === 4, JSON.stringify(z3));
      await p.evaluate(() => { const G = SK.G; G.player.god = true; G.player.hp = G.player.hpMax; G.player.invulT = 0; G.oxy.v = 100; });

      // --- bong bóng quái 10 máu: tầm xa 10 phát gây 1, cận chiến vỡ ngay, vỡ thì quanh đó nhận oxy
      const bq = await p.evaluate(() => {
        const G = SK.G, pl = G.player, o = G.oxy, w0 = pl.weapons[pl.cur], out = {};
        o.spawn = 999; o.zones = [];
        const mk = id => { const [x, y] = SK.freeNear([pl.x + 30, pl.y - 20]); const e = SK.makeEnemy(G, id, x, y, G.map.rooms[0]); e.st = 'idle'; e.cd = 99; G.enemies.push(e); return e; };
        const e1 = mk('e_seabed_mob2'); out.start = e1.bubble; out.hp0 = e1.hp;
        pl.weapons[pl.cur] = { def: { kind: 'gun' } };
        o.v = 50;
        for (let i = 0; i < 9; i++) SK.hurtEnemy(G, e1, 20, false, 0, 0);
        out.after9 = [e1.bubble, e1.hp]; out.v9 = o.v;
        SK.hurtEnemy(G, e1, 20, false, 0, 0);
        out.after10 = [e1.bubble, e1.hp, !!e1.popped]; out.v10 = o.v;
        SK.hurtEnemy(G, e1, 20, false, 0, 0); out.hpHit = e1.hp;
        const e2 = mk('e_seabed_mob3');
        pl.weapons[pl.cur] = { def: { kind: 'melee' } };
        SK.hurtEnemy(G, e2, 5, false, 0, 0); out.melee = [e2.bubble, e2.hp, !!e2.popped];
        pl.weapons[pl.cur] = w0;
        const e3 = mk('e_seabed_mob0'); out.plain = e3.bubble || 0;
        const e4 = mk('e_seabed_mob5'); out.plain5 = e4.bubble || 0;
        out.ids = [e1, e2].map(e => e.id);
        G.enemies = G.enemies.filter(q => ![e1, e2, e3, e4].includes(q));
        return out;
      });
      check('bong bóng quái: TTN-001/002 sinh trong bóng 10 máu, thủy thủ và TTN-004 không có', bq.start === 10 && bq.plain === 0 && bq.plain5 === 0, JSON.stringify(bq));
      check('vũ khí tầm xa: 9 phát chưa vỡ (bóng còn 1, máu nguyên), phát 10 vỡ', bq.after9[0] === 1 && bq.after9[1] === bq.hp0 && bq.after10[0] === 0 && bq.after10[1] === bq.hp0 && bq.after10[2], JSON.stringify(bq.after9) + ' ' + JSON.stringify(bq.after10));
      check('vỡ bóng trong tầm: người chơi nhận +15 oxy; sau đó đòn mới trừ máu quái', bq.v9 < 51 && bq.v10 > 64 && bq.v10 < 66 && bq.hpHit === bq.hp0 - 20, 'v9 ' + bq.v9 + ' v10 ' + bq.v10 + ' hp ' + bq.hpHit);
      check('cận chiến / tay không vỡ bóng ngay trong 1 đòn (không trừ máu quái)', bq.melee[0] === 0 && bq.melee[2] && bq.melee[1] === 75, JSON.stringify(bq.melee));

      // --- quái ngoài đời thật ở 4-1
      await p.evaluate(() => SK_GAME.debug.teleportTo('battle', 0));
      await until(p, () => SK.G.enemies.length > 0, null, 6000);
      await sleep(1800);
      await p.screenshot({ path: path.join(SHOTS, '4C-1.png') });
      const e1 = await p.evaluate(() => SK.G.enemies.map(e => e.id.replace(/^ex_/, 'e_')));
      const bad = e1.filter(id => !(id in ROSTER_C[1]));
      check('4C 4-1: quái ngoài đời thật thuộc danh sách map_C16', e1.length > 0 && !bad.length, [...new Set(e1)].join(' ') + (bad.length ? ' LẠ ' + bad : ''));
      const ai = await p.evaluate(() => [...new Set(SK.G.enemies.map(e => e.rawCls + '>' + e.cls))]);
      check('4C 4-1: AI quái đã có bản viết lại (không rơi về EnemyAI01)', ai.every(s => { const [raw, to] = s.split('>'); return raw === to; }), ai.join(' '));

      const R = await p.evaluate(() => {
        const out = {};
        for (let n = 1; n <= 5; n++) {
          SK_GAME.debug.stage('4-' + n);
          const room = SK.G.map.rooms.find(r => r.type === 'battle'), cnt = {};
          for (let k = 0; k < 150; k++) for (const w of SK.G.buildWaves(room)) for (const id of w) { const b = id.replace(/^ex_/, 'e_'); cnt[b] = (cnt[b] || 0) + 1; }
          out[n] = { cnt, boss: SK.G.map.rooms.filter(r => r.type === 'boss').length, oxy: SK.G.oxy && SK.G.oxy.v };
        }
        return out;
      });
      for (let n = 1; n <= 5; n++) {
        const got = Object.keys(R[n].cnt).sort(), want = Object.keys(ROSTER_C[n]).sort();
        check('4C 4-' + n + ': đợt quái đúng danh sách map_C' + (15 + n) + ' (mob0 nhiều hơn mob2 ít nhất theo trọng số), oxy đầy lại', JSON.stringify(got) === JSON.stringify(want) && R[n].cnt.e_seabed_mob0 > (R[n].cnt.e_seabed_mob5 || 0) && R[n].oxy > 97, got.join(' ') + ' ' + JSON.stringify(R[n].cnt));
      }
      check('4C: 4-3 không có phòng trùm, 4-5 có', R[3].boss === 0 && R[5].boss === 1, 'boss 4-3: ' + R[3].boss + ', 4-5: ' + R[5].boss);

      // --- 4-4 chụp ảnh có đủ loại quái; 4-5 trùm, hạ thì thắng
      await p.evaluate(() => SK_GAME.debug.stage('4-4'));
      await until(p, () => SK_GAME.phase === 'play', null, 5000);
      await p.evaluate(() => { SK.G.player.god = true; SK_GAME.debug.teleportTo('battle', 0); });
      await until(p, () => SK.G.enemies.length > 0, null, 6000);
      await sleep(2500);
      await p.screenshot({ path: path.join(SHOTS, '4C-4.png') });
      await p.evaluate(() => SK_GAME.debug.stage('4-5'));
      await until(p, () => SK_GAME.phase === 'play', null, 5000);
      await p.evaluate(() => SK_GAME.debug.teleportTo('boss'));
      const sp = await until(p, () => SK.G.enemies.some(e => e.bossKey), null, 8000);
      const bk = await p.evaluate(() => SK.G.enemies.filter(e => e.bossKey).map(e => [e.bossKey, Math.round(e.hpMax)]));
      check('4C 4-5: phòng trùm có trùm gốc Thợ Lặn Vực Sâu (Spine, 2760 máu)', sp && bk.length === 1 && bk[0][0] === 'boss_abyssal_submariner' && bk[0][1] === 2760, JSON.stringify(bk));
      await until(p, () => SK.bossHud.visible, null, 9000);
      await sleep(1200);
      await p.screenshot({ path: path.join(SHOTS, '4C-boss.png') });
      await p.evaluate(() => { const e = SK.G.enemies.find(x => x.bossKey); SK.hurtEnemy(SK.G, e, 1e6, false, 0, 0); });
      const cl = await until(p, () => SK_GAME.rooms.find(r => r.type === 'boss').state === 'cleared', null, 15000);
      check('4C: hạ trùm 4-5 → phòng mở', cl);
      const win = await walkPortal(p, st => st.state === 'victory');
      const fin = await p.evaluate(() => ({ state: SK_GAME.state, stage: SK.G.stage.label }));
      check('4C: qua cổng sau 4-5 → chiến thắng', win && fin.state === 'victory' && fin.stage === '4-5', JSON.stringify(fin));
      check('không lỗi trang (4C)', !errs.length, errs.slice(0, 3).join(' | '));
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
