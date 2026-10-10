/*
 * Kiểm thử phòng đặc biệt, buff, tượng, giếng ước, lái buôn và đồ rơi của Hiệp Sĩ Linh Hồn (games/soulknight/js/rooms.js).
 * Số kỳ vọng là số thật đọc từ dữ liệu 8.6.0 (data/sk-buffs86.js sinh từ D:\sk86-ref\decoded) hoặc từ prefab trong sk-data.js.
 * Trang chưa có thẻ <script src="data/sk-buffs86.js">: test chèn nó trước mọi script bằng addInitScript.
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-rooms.js
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-rooms/.
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const URL = (process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html') + '?quick=1&themes=forest,castle,volcano';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-rooms');
fs.mkdirSync(SHOTS, { recursive: true });
const DATA = fs.readFileSync(path.join(ROOT, 'games/soulknight/data/sk-buffs86.js'), 'utf8');

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  if (ok) { pass++; results.push('  ✔ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; results.push('  ✘ ' + name + (detail ? '  — ' + detail : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(p, fn, arg, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await p.evaluate(fn, arg)) return true;
    await sleep(80);
  }
  return false;
}
const IGNORE = /bosses86|theme|lib|colour/;

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.addInitScript(DATA);
  const ev = (fn, arg) => p.evaluate(fn, arg);

  // Vào tầng `label` với phòng ép sẵn, rồi đứng ở phòng `type`.
  async function stage(label, force, type) {
    await ev(([l, f]) => { Object.assign(SK_ROOMS.force, { chest: null, special: null, statue: null }, f); SK_GAME.debug.stage(l); }, [label, force || {}]);
    await until(p, () => SK_GAME.phase === 'play', null, 4000);
    if (type) { await ev(t => SK_GAME.debug.teleportTo(t), type); await sleep(350); }
  }
  // Đứng cạnh vật tương tác có nhãn khớp regex rồi bấm E thật.
  async function useLabel(re) {
    const i = await ev(s => SK.G.interactables.findIndex(o => new RegExp(s).test(o.label)), re);
    if (i < 0) return null;
    await ev(k => { const o = SK.G.interactables[k], pl = SK.G.player; pl.x = o.x; pl.y = o.y + 2; }, i);
    await sleep(120);
    const label = await ev(() => SK.G.interactTarget && SK.G.interactTarget.label);
    await p.keyboard.press('KeyE');
    await sleep(150);
    return label;
  }
  // Kẻ địch đứng yên, không bắn.
  const dummies = (n, hp) => ev(([n, hp]) => {
    const G = SK.G, pl = G.player; G.enemies.length = 0;
    for (let i = 0; i < n; i++) {
      const a = i * 6.28 / n + 0.4, e = SK.makeEnemy(G, 'e_orc01', pl.x + Math.cos(a) * 48, pl.y + Math.sin(a) * 36 - 8, G.room);
      e.st = 'idle'; e.stT = 1e9; e.hp = e.hpMax = hp; G.enemies.push(e);
    }
  }, [n, hp]);
  const still = () => ev(() => { for (const e of SK.G.enemies) if (e.st !== 'dead') { e.st = 'idle'; e.stT = 1e9; } });
  const hps = () => ev(() => SK.G.enemies.map(e => e.hp));

  try {
    await p.goto(URL);
    await p.waitForSelector('#sk-start', { state: 'visible', timeout: 8000 });
    await ev(() => SK_GAME.debug.seed(424242));
    await p.click('#sk-start');
    await until(p, () => SK_GAME.state === 'stage', null, 3000);
    await ev(() => { SK_GAME.debug.god(true); SK_GAME.debug.pet(false); });

    // ================================================================ dữ liệu thật
    const D = await ev(() => {
      const B = window.SK_BUFFS86;
      return { nBuff: Object.keys(B.buffs).length, tg1: B.groups.TG_level1.length, tg3v: B.groups.TG_level3_volcano.filter(x => x[0] === 9)[0],
        life: B.values.lifeSiphon.prob, ww: B.values.whirlwind, coins: B.drops.coin, en: B.drops.energy,
        name3: B.buffs[3].name.vi, name10: B.buffs[10].name.vi, name2101: B.buffs[2101].name.vi, lv6: B.levels['6'].A, lv11: B.levels['11'],
        shop: B.shop.map(s => s.p + ':' + s.w).slice(0, 5).join(','), well: B.well, price: B.price };
    });
    check('bể buff theo cấp đọc từ luban: TG_level1 có 40 buff, núi lửa nhân Khiên Lửa ×10 (trọng số 100)',
      D.tg1 === 40 && D.tg3v && D.tg3v[1] === 100, 'TG_level1=' + D.tg1 + ' · ShieldFire(núi lửa)=' + (D.tg3v && D.tg3v[1]));
    check('tên buff tiếng Việt chính thức từ localization (Buff_name_*)', D.name3 === 'Siêu Bom' && D.name10 === 'Giảm Nửa Giá!' && D.name2101 === 'Trảm Lốc Xoáy',
      D.name3 + ' / ' + D.name10 + ' / ' + D.name2101);
    check('số thật từ mã Lua: Hút Sinh Lực 15%, chém xoáy 8 sát thương/4 s/cỡ 5,25/đẩy 3',
      D.life === 15 && D.ww.damage === 8 && D.ww.cooldown === 4 && D.ww.size === 5.25 && D.ww.repel === 3, JSON.stringify(D.ww));
    check('cấp 6 dùng nhóm TG_level2, cấp 11 tách nhánh alien/núi lửa/thường', D.lv6 === 'TG_level2' && D.lv11.A === 'TG_level3_alien' && D.lv11.B === 'TG_level3_volcano' && D.lv11.C === 'TG_level3',
      D.lv6 + ' · ' + JSON.stringify(D.lv11));
    check('xu rơi: coin_0/1/2 = 5/3/1 vàng, cầu năng lượng 8; bể cửa hàng thật',
      D.coins['0'] === 5 && D.coins['1'] === 3 && D.coins['2'] === 1 && D.en === 8 && /sell2-1:16,sell2-2:16,sell1-2:16/.test(D.shop), JSON.stringify(D.coins) + ' · ' + D.shop);

    // ================================================================ công thức giá
    const pr = await ev(() => {
      const R = SK_ROOMS, out = { hp: [], en: [], st: [], well: [], sale: [] };
      const at = i => { SK.G.stageIdx = i; };
      for (const i of [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]) { at(i); out.hp.push(R.priced(25)); out.en.push(R.priced(20)); out.st.push(R.statuePrice(15)); out.well.push(R.priced(1)); }
      SK.G.player.buffs = [10];
      for (const i of [0, 3, 8]) { at(i); out.sale.push(R.priced(25)); }
      SK.G.player.buffs = []; at(0);
      return out;
    });
    // 1-1, 1-3, 1-4, 1-5, 2-1 ... 3-5 : bảng "Gold Price" của wiki (13 cột) — công thức từ RGContainer.CalculateItemValue phải khớp
    const HP = [25, 25, 31, 34, 37, 39, 43, 46, 49, 51, 54, 58, 61, 64].slice(0, 14);
    const EN = [20, 20, 24, 27, 29, 31, 34, 36, 39, 41, 43, 46, 48, 51];
    const ST = [15, 15, 18, 19, 21, 22, 24, 25, 27, 28, 30, 30, 30, 30];
    check('giá bình máu theo công thức thật khớp bảng giá wiki ở 14 màn', JSON.stringify(pr.hp) === JSON.stringify(HP), pr.hp.join(','));
    check('giá bình năng lượng khớp bảng wiki', JSON.stringify(pr.en) === JSON.stringify(EN), pr.en.join(','));
    check('giá tượng khớp bảng wiki (15 → trần 30)', JSON.stringify(pr.st) === JSON.stringify(ST), pr.st.join(','));
    check('giá giếng ước: 1 xu, thành 2 xu từ 3-1', pr.well.slice(0, 9).every(v => v === 1) && pr.well.slice(9).every(v => v === 2), pr.well.join(','));
    check('Giảm Nửa Giá: gốc + int(gốc × (hệ số − 0,5)), ví dụ 25 → 13 ở 1-1', pr.sale[0] === 13 && pr.sale[1] === 25 + Math.trunc(25 * (0.24 - 0.5)) , pr.sale.join(','));

    // ================================================================ cửa hàng
    await stage('2-4', { chest: 'shop' }, 'chest');
    const layout = await ev(() => SK.G.map.rooms.find(r => r.type === 'chest').layout);
    const shop = await ev(() => SK.G.interactables.map((o, i) => ({ i, label: o.label })).filter(o => /^Mua/.test(o.label)));
    check('cửa hàng dùng bố cục prefab thật (sell*) ở 2-4', /^sell/.test(layout) && shop.length >= 3, layout + ' · ' + shop.length + ' món');
    await sleep(1800);
    await p.screenshot({ path: path.join(SHOTS, 'shop.png') });
    await ev(() => { SK.G.player.gold = 999; });
    let allOk = true, detail = [];
    for (const it of shop) {
      const price = +/\((\d+) vàng\)/.exec(it.label)[1];
      const before = await ev(() => { const q = SK.G.player; return { gold: q.gold, hp: q.hp, energy: q.energy, w: q.weapons.map(x => x && x.id).join("/") }; });
      await ev(() => { const q = SK.G.player; q.hp = 2; q.energy = 10; });
      const shown = await useLabel('^' + it.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
      const after = await ev(() => { const q = SK.G.player; return { gold: q.gold, hp: q.hp, energy: q.energy, w: q.weapons.map(x => x && x.id).join("/") }; });
      const got = after.w !== before.w || after.hp > 2 || after.energy > 10;
      if (!(shown === it.label && after.gold === before.gold - price && got)) allOk = false;
      detail.push(it.label + ' ' + before.gold + '→' + after.gold);
    }
    check('mua từng món: trừ đúng giá, nhận đồ, món biến khỏi quầy', allOk && (await ev(() => SK.G.interactables.filter(o => /^Mua/.test(o.label) && !o.gone).length)) === 0, detail.join(' | '));
    const sfx1 = await ev(() => ({ st: SK.sfx && SK.sfx.ctx && SK.sfx.ctx.state, buy: SK_ROOMS.sndStats.fx_buy || 0 }));
    check('mua hàng phát tiếng fx_buy thật (ổ tiếng chạy)', sfx1.st === 'running' ? sfx1.buy >= shop.length : true, JSON.stringify(sfx1));
    const g0 = await ev(() => SK.G.player.gold);
    await useLabel('^Làm mới hàng');
    const rf = await ev(() => ({ gold: SK.G.player.gold, left: SK.G.interactables.filter(o => /^Mua/.test(o.label) && !o.gone).length }));
    check('nhân viên làm mới hàng: 30 vàng (NpcSellRefreshItem.item_value), quầy đầy lại', rf.gold === g0 - 30 && rf.left >= 3, 'vàng ' + g0 + '→' + rf.gold + ' · ' + rf.left + ' món');

    // ================================================================ tượng
    const T = await ev(() => {
      const out = {};
      for (let i = 1; i <= 10; i++) { const c = SK_ROOMS.statueCfg(i); out[i] = { cd: c.cd, name: SK_ROOMS.statueName(i), count: c.m.count, atk: c.m.atk }; }
      return out;
    });
    const CD = [8, 12, 10, 4, 8, 5, 12, 12, 11, 60];
    check('10 tượng: tên tiếng Việt chính thức và hồi chiêu đọc từ prefab buff_statue_N', CD.every((c, i) => T[i + 1].cd === c && T[i + 1].name), Object.values(T).map(x => x.name + ':' + x.cd).join(' · '));

    await ev(() => { const o = SK.vfx.spawn; SK.vfx.spawn = function (G, n, ...a) { (window.__vfxLog = window.__vfxLog || []).push(n); return o.call(this, G, n, ...a); }; });
    const S = {};
    for (let id = 1; id <= 10; id++) {
      await stage('1-3', { special: 'statue', statue: id }, 'special');
      const has = await ev(() => !!SK.G.map.rooms.find(r => r.type === 'special'));
      if (!has) { check('phòng tượng ' + id, false, 'không sinh phòng special'); continue; }
      await ev(() => { const pl = SK.G.player; pl.gold = 100; pl.hp = 3; pl.armor = 1; pl.energy = 50; pl.skillCd = 0; pl.statues = []; pl.statueCds = {}; SK.G.vfx = []; });
      if (id === 2 || id === 1) { await sleep(50); }
      const lbl = await useLabel('^Tượng');
      const bought = await ev(() => ({ gold: SK.G.player.gold, st: SK.G.player.statues.slice() }));
      if (id === 1) await p.screenshot({ path: path.join(SHOTS, 'statue.png') });
      await dummies(5, 300);
      await ev(() => { SK.G.player.x += 0; });
      await sleep(200); await still();
      const h0 = await hps();
      await ev(() => { SK.G.player.skillCd = 0; window.__vfxLog = []; });
      await p.keyboard.press('KeyK');
      await sleep(id === 3 ? 1200 : id === 8 ? 900 : id === 6 ? 900 : id === 2 ? 700 : 700);
      await p.screenshot({ path: path.join(SHOTS, 'statue-fire-' + id + '.png') });
      const h1 = await hps();
      const dh = h0.map((v, i) => v - h1[i]);
      const st = await ev(() => { const pl = SK.G.player, bm = pl.bm; return { hp: pl.hp, armor: pl.armor, en: pl.energy, cd: pl.statueCds, shield: bm.shield, boost: bm.boostT, wolf: bm.wolfT, thief: bm.thiefT, charge: bm.chargeT,
        knight: SK.G.props.some(q => q.ally), vfx: (window.__vfxLog || []).filter((v, i, a) => a.indexOf(v) === i) }; });
      S[id] = { lbl, bought, dh, st };
    }
    check('dâng tượng ở 1-3: nhãn "dâng 15 vàng", trừ 15 vàng, giữ đúng 1 tượng', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].every(i => S[i] && /dâng 15 vàng/.test(S[i].lbl) && S[i].bought.gold === 85 && S[i].bought.st[0] === i),
      Object.values(S).map(x => x.lbl).join(' | ').slice(0, 160));
    check('mỗi tượng vào hồi chiêu đúng số giây prefab sau khi kích hoạt', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].every(i => S[i] && S[i].st.cd[i] > CD[i - 1] - 3 && S[i].st.cd[i] <= CD[i - 1]),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => S[i] && S[i].st.cd[i].toFixed(1)).join(','));
    const sumdh = i => S[i].dh.reduce((a, c) => a + c, 0);
    check('Phù Thủy (1): 8 đạn × 4 sát thương (+3 cháy mỗi 0,5 s) lên quái quanh người', S[1].dh.some(v => v >= 4) && sumdh(1) >= 4 * 3, S[1].dh.join(','));
    check('Kỵ Sĩ (2): tùy tùng xuất hiện và đánh 3 sát thương', S[2].st.knight && S[2].dh.some(v => v === 3 || v === 6), 'tùy tùng ' + S[2].st.knight + ' · ' + S[2].dh.join(','));
    check('Mục Sư (3): +10 năng lượng (và +1 giáp) ngay, rồi mỗi giây: 1,2 s sau đã +20', S[3].st.en >= 50 + 20, 'năng lượng ' + S[3].st.en + ' giáp ' + S[3].st.armor);
    check('Thích Khách (4): 5 kim × 4 sát thương trúng độc', sumdh(4) >= 4 && S[4].dh.every(v => v % 1 === 0), S[4].dh.join(','));
    check('Tiên Tộc (5): sóng xung 6 sát thương tới cả 5 quái, tụ lực nhanh 8 s', S[5].dh.every(v => v === 6) && S[5].st.charge > 6, S[5].dh.join(',') + ' · tụ ' + (S[5].st.charge || 0).toFixed(1));
    check('Trộm Cướp (6): 6 sát thương lên cả 5 quái sau 0,5 s, tốc +50% trong 5 s', S[6].dh.every(v => v === 6) && S[6].st.thief > 3 && S[6].st.thief <= 5, S[6].dh.join(',') + ' · ' + (S[6].st.thief || 0).toFixed(1) + ' s');
    check('Hiệp Sĩ Thánh (7): khiên chặn 1 đòn', S[7].st.shield === 1, 'khiên ' + S[7].st.shield);
    check('Kỹ Sư (8): 4 gói thuốc nổ, 20 sát thương (+3 cháy)', S[8].dh.some(v => v >= 20), S[8].dh.join(','));
    check('Berserker (9): vũ khí tăng 5 s', S[9].st.boost > 3 && S[9].st.boost <= 5, (S[9].st.boost || 0).toFixed(1) + ' s');
    check('Người Sói (10): +1 máu, tăng tốc và tầm cận chiến 12 s', S[10].st.hp === 4 && S[10].st.wolf > 10 && S[10].st.wolf <= 12, 'máu ' + S[10].st.hp + ' · ' + (S[10].st.wolf || 0).toFixed(1) + ' s');
    check('kích hoạt tượng dùng hiệu ứng thật SK.vfx (buff_statue_N) và tiếng fx của prefab',
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].every(i => S[i] && S[i].st.vfx.indexOf('buff_statue_' + i) >= 0), S[7].st.vfx.join(','));

    const stSnd = await ev(() => SK_ROOMS.sndStats);
    check('kích hoạt tượng phát tiếng thật của prefab (fx_skill_c3, fx_skill, fx_gun_rocket, fx_skill_ploy, fx_skill_c8)',
      ['fx_skill_c3', 'fx_skill', 'fx_gun_rocket', 'fx_skill_ploy', 'fx_skill_c8'].every(k => stSnd[k] > 0), JSON.stringify(stSnd));
    // Tượng Nhân Đôi: giữ 2 tượng, kích hoạt lần hai sau 0,4 s
    await stage('1-3', { special: 'statue', statue: 5 }, 'special');
    await ev(() => { const pl = SK.G.player; pl.gold = 100; pl.buffs = []; SK_ROOMS.takeBuff(22); pl.statues = [6]; pl.statueCds = { 6: 0 }; pl.skillCd = 0; });
    await useLabel('^Tượng');
    const two = await ev(() => SK.G.player.statues.slice());
    await dummies(3, 500); await sleep(150); await still();
    await ev(() => { SK.G.player.skillCd = 0; });
    const hd0 = await hps();
    await p.keyboard.press('KeyK');
    await sleep(150);
    const hd1 = await hps();
    await sleep(1300);
    const hd2 = await hps();
    check('Tượng Nhân Đôi: giữ được 2 tượng; mỗi tượng kích hoạt lần hai sau 0,4 s (Tiên Tộc 6 + 6)',
      two.length === 2 && hd0[0] - hd2[0] === 24 || (two.length === 2 && hd0[0] - hd2[0] >= 24), 'tượng ' + two.join(',') + ' · sát thương ' + (hd0[0] - hd1[0]) + ' rồi ' + (hd0[0] - hd2[0]));
    await ev(() => { SK.G.player.buffs = []; SK.G.player.statues = []; });

    // ================================================================ giếng ước
    await stage('2-2', { special: 'well' }, 'special');
    const wl = await ev(() => { const r = SK.G.map.rooms.find(q => q.type === 'special'); return !!r && r.fill === 'well'; });
    if (wl) {
      await ev(() => { SK.G.player.gold = 200; SK_ROOMS.well.streak = 999; });
      await sleep(200);
      await p.screenshot({ path: path.join(SHOTS, 'well.png') });
      const wlabel = await ev(() => SK.G.interactables.find(o => /Hồ Ước/.test(o.label)).label);
      await useLabel('^Hồ Ước');
      const g = await ev(() => ({ gold: SK.G.player.gold, uses: SK_ROOMS.well.uses }));
      check('Hồ Ước Nguyện: ném 1 xu ở 2-2 (nhãn hiện lượt x/50)', g.gold === 199 && g.uses === 1 && /1 xu \(0\/50\)/.test(wlabel), wlabel + ' · vàng 200→' + g.gold);
      // chuỗi cuối: đặt lượt bắt đầu = 1 thì mọi lần ném có thưởng; chờ nhặt đồ mới ném tiếp
      await ev(() => { SK_ROOMS.well.streak = 1; });
      let rewards = 0;
      for (let k = 0; k < 4; k++) {
        await ev(() => { SK.G.items.length = 0; SK.G.pickups.length = 0; SK.G.player.gold = 200; });
        await useLabel('^Hồ Ước');
        const got = await ev(() => SK.G.items.length + SK.G.pickups.length);
        if (got > 0) rewards++;
      }
      check('chuỗi cuối của giếng (từ lượt ngẫu nhiên 28..35): mỗi lần ném đều có thưởng', rewards === 4, rewards + '/4');
      const range = await ev(() => { const a = []; for (let i = 0; i < 200; i++) { SK.G.map.rooms.find(q => q.type === 'special'); a.push(0); } return 0; });
      await ev(() => { SK_ROOMS.well.uses = 50; SK.G.items.length = 0; SK.G.pickups.length = 0; SK.G.player.gold = 200; });
      await useLabel('^Hồ Ước');
      const murk = await ev(() => ({ gold: SK.G.player.gold, uses: SK_ROOMS.well.uses, toast: SK.G.toastMsg }));
      check('hết 50 lượt: nước đục, không trừ xu', murk.gold === 200 && murk.uses === 50 && /đục/.test(murk.toast), murk.toast);
    } else check('có phòng giếng ước để thử', false, 'không sinh được phòng special');

    // ================================================================ Thương Nhân Thiện Lương (buff đổi bằng giáp)
    await stage('2-5', { chest: 'honest' }, 'chest');
    const hon = await ev(() => ({ fill: SK.G.map.rooms.find(r => r.type === 'chest').fill, labels: SK.G.interactables.map(o => o.label).filter(l => /giáp/.test(l)) }));
    check('phòng lái buôn Thiện Lương xuất hiện từ 2-5, bán buff giá 1 giáp (ball_buff_honest)', hon.fill === 'honest' && hon.labels.length === 2 && hon.labels.every(l => /1 giáp/.test(l)), hon.labels.join(' | '));
    await sleep(1800);
    await p.screenshot({ path: path.join(SHOTS, 'honest.png') });
    await ev(() => { SK.G.player.armor = 5; SK.G.player.buffs = []; });
    await useLabel('đổi 1 giáp');
    const hb = await ev(() => ({ armor: SK.G.player.armor, buffs: SK.G.player.buffs.slice() }));
    check('mua buff của Thiện Lương: trừ 1 giáp, nhận một buff trong kho Thiện Lương (8, 9, 23, 40)', hb.armor === 4 && hb.buffs.length === 1 && [8, 9, 23, 40].indexOf(hb.buffs[0]) >= 0, JSON.stringify(hb));

    // ================================================================ chọn buff ở cổng
    async function walkIntoPortal(label) {
      await stage(label, {});
      await ev(() => SK_GAME.debug.teleportTo('end'));
      await sleep(300);
      await p.keyboard.down('KeyW');
      const shown = await until(p, () => SK.ROOMS.choice.open && SK.loading.on, null, 4000);
      await p.keyboard.up('KeyW');
      return shown;
    }
    await ev(() => { SK.G.player.buffs = []; });
    const shown = await walkIntoPortal('1-1');
    await sleep(1200);
    await p.screenshot({ path: path.join(SHOTS, 'buff-choice.png') });
    const cards = await ev(() => SK.ROOMS.choice.cards.map(id => ({ id })));
    const held = await ev(() => ({ stage: SK_GAME.stage, phase: SK_GAME.phase, hold: SK.G.hold }));
    const poolIds = await ev(() => SK_ROOMS.poolFor(2, 'forest').pool.map(x => x[0]));
    check('bước vào cổng 1-1 → hiện 3 thẻ buff lấy từ bể TG_level1, đứng ở cổng',
      shown && cards.length === 3 && cards.every(c => poolIds.indexOf(c.id) >= 0) && held.hold === true && held.phase === 'portal', cards.map(c => c.id).join(',') + ' · ' + held.stage + '/' + held.phase);
    const names = await ev(() => SK.ROOMS.choice.cards.map((id, i) => [SK_ROOMS.buffName(id), SK.loading.text('ui_buff_bar/body/grid/card' + i + '/title'), !!SK.frame(SK_ROOMS.buffIcon(id))]));
    check('thẻ trên màn tải (prefab gốc buff_tpl3) hiện tên tiếng Việt chính thức và biểu tượng ui_buff thật', names.length === 3 && names.every(n => n[0] === n[1] && n[2]) && (await ev(() => SK.loading.text('ui_buff_bar/body/title/text'))) === 'Chọn Thiên Phú mới!', names.map(n => n[1]).join(' · '));
    await p.keyboard.press('Digit1');
    const next = await until(p, () => SK_GAME.stage === '1-2', null, 2500);
    const pick1 = await ev(() => ({ buffs: SK.G.player.buffs.slice(), hidden: !SK.ROOMS.choice.open }));
    check('bấm 1 → nhận thẻ đầu, bảng đóng, sang 1-2', next && pick1.hidden && pick1.buffs.length === 1 && pick1.buffs[0] === cards[0].id, pick1.buffs.join(','));
    const shown3 = await walkIntoPortal('1-3');
    await sleep(3000);
    const wait3 = await ev(() => ({ stage: SK_GAME.stage, hold: SK.G.hold }));
    const c2 = await ev(() => ({ r: SK.loading.cardRect(1), id: SK.ROOMS.choice.cards[1] }));
    await p.mouse.click(c2.r.x + c2.r.w / 2, c2.r.y + c2.r.h / 2);
    const go4 = await until(p, () => SK_GAME.stage === '1-4', null, 3000);
    const got2 = await ev(() => SK.G.player.buffs.slice(-1)[0]);
    check('không bấm gì thì vẫn đứng ở cổng 1-3; nhấp chuột vào thẻ 2 → nhận thẻ 2, sang 1-4', shown3 && wait3.stage === '1-3' && wait3.hold === true && go4 && got2 === c2.id, wait3.stage + ' · thẻ ' + c2.id + ' → ' + got2);
    await ev(() => { SK.G.player.buffs = []; });
    // bể theo cấp: sau 1-5 vào 2-1 (cấp 6, TG_level2) thì có Mở Rộng Túi/Tượng Nhân Đôi; sau 1-1 (TG_level1) thì không
    const pools = await ev(() => ({ l1: SK_ROOMS.poolFor(2, 'forest').pool.map(x => x[0]), l6: SK_ROOMS.poolFor(6, 'castle').pool.map(x => x[0]), l11v: SK_ROOMS.poolFor(11, 'volcano').pool }));
    check('TG_level1 không có Mở Rộng Túi (25)/Tượng Nhân Đôi (22); TG_level2 có; núi lửa: Khiên Lửa nặng 100',
      pools.l1.indexOf(25) < 0 && pools.l1.indexOf(22) < 0 && pools.l6.indexOf(25) >= 0 && pools.l6.indexOf(22) >= 0 && pools.l11v.some(x => x[0] === 9 && x[1] === 100),
      'l1=' + pools.l1.length + ' l6=' + pools.l6.length);
    const act = await ev(() => Object.keys(SK_ROOMS.DEF).filter(k => SK_ROOMS.DEF[k].active).length);
    const offered = await ev(() => { const seen = {}; for (let i = 0; i < 300; i++) for (const id of SK_ROOMS.offerIds(3)) seen[id] = 1; return Object.keys(seen).map(Number); });
    check('chỉ đưa lên bảng những buff đã có luật chạy (không có Thợ Mỏ Đá Quý, Liên Kích Mưa, Âm Dương Lưu Chuyển, Nhà Mỹ Thực...)', offered.length > 20 && [15, 31, 1023, 1025].every(i => offered.indexOf(i) < 0) && act >= 30, 'đã thấy ' + offered.length + ' loại / ' + act + ' buff active');

    // ================================================================ hiệu ứng buff (số thật)
    async function fresh(buffs) {
      await ev(() => { SK.startRun('knight'); SK_GAME.debug.god(true); });
      await until(p, () => SK_GAME.state === 'stage', null, 2000);
      await stage('1-3', {});
      await ev(bs => { const pl = SK.G.player; pl.buffs = []; pl.bm = {}; pl.statues = []; pl.rateMul = 1; pl.crit = 0; pl.dmgMul = 1; pl.hp = pl.hpMax; SK.G.enemies.length = 0; SK.G.bullets.length = 0; for (const k of bs) SK_ROOMS.takeBuff(k); }, buffs);
    }
    // Tim Dũng Sĩ / Đá Tảng Rắn / Từ Điển Phép
    await fresh([]);
    const s0 = await ev(() => ({ hpMax: SK.G.player.hpMax, armorMax: SK.G.player.armorMax, energyMax: SK.G.player.energyMax }));
    await ev(() => { SK_ROOMS.takeBuff(16); SK_ROOMS.takeBuff(28); SK_ROOMS.takeBuff(30); });
    const s1 = await ev(() => ({ hpMax: SK.G.player.hpMax, armorMax: SK.G.player.armorMax, energyMax: SK.G.player.energyMax }));
    check('Tim Dũng Sĩ +4 máu tối đa, Đá Tảng Rắn +1 giáp, Từ Điển Phép +100 năng lượng', s1.hpMax === s0.hpMax + 4 && s1.armorMax === s0.armorMax + 1 && s1.energyMax === s0.energyMax + 100, JSON.stringify(s0) + '→' + JSON.stringify(s1));
    // Siêu Bom: súng chùm +2 viên; Đòn Chính Xác: giảm lệch, cộng bạo kích
    const wp = await ev(() => {
      SK_ROOMS.takeBuff(3); SK_ROOMS.takeBuff(20);
      const W = SK_DESIGN.weapons, id = Object.keys(W).find(k => W[k].kind === 'gun' && W[k].pellets > 1 && W[k].spread >= 10);
      SK_GAME.debug.give(id);
      const d = SK.G.player.weapons[1].def, b = W[id];
      return { id, pel: [b.pellets, d.pellets], spread: [b.spread, d.spread], crit: [b.crit || 0, d.crit || 0] };
    });
    check('Siêu Bom: chùm +2 viên; Đòn Chính Xác: độ lệch −10, phần dư vào bạo kích', wp.pel[1] === wp.pel[0] + 2 && wp.spread[1] === wp.spread[0] - 10, JSON.stringify(wp));
    // Ép Xung: 5 tầng × 2% + 10%
    await fresh([32]);
    await ev(() => { const bm = SK.G.player.bm; bm.rapidN = 5; bm.rapidT = 3; });
    await sleep(200);
    const rf2 = await ev(() => SK.G.player.rateMul);
    check('Ép Xung: đủ 5 tầng → tốc bắn ×(1 + 5×2% + 10%) = 1,2', Math.abs(rf2 - 1.2) < 0.001, 'rateMul ' + rf2);
    // Bạo Kích Mất Máu: mất hết → +70 bạo kích, +30% tốc
    await fresh([35]);
    await ev(() => { const pl = SK.G.player; pl.hp = 1; pl.armor = 0; pl.armorT = 99; });
    await sleep(200);
    const vg = await ev(() => ({ crit: SK.G.player.crit, rate: SK.G.player.rateMul }));
    check('Bạo Kích Mất Máu: còn 1 máu 0 giáp → bạo kích +70, tốc bắn ×1,3 [ĐO bloodrage.lua]', vg.crit === 70 && Math.abs(vg.rate - 1.3) < 0.001, JSON.stringify(vg));
    // Giáp Vàng
    await fresh([34]);
    const am0 = await ev(() => SK.G.player.armorMax);
    await ev(() => { SK.G.player.gold = 250; }); await sleep(200);
    const am1 = await ev(() => SK.G.player.armorMax);
    await ev(() => { SK.G.player.gold = 50; }); await sleep(200);
    const am2 = await ev(() => SK.G.player.armorMax);
    check('Giáp Vàng: 250 vàng → +2 giáp tối đa; xuống 50 vàng thì mất', am1 === am0 + 2 && am2 === am0, am0 + '→' + am1 + '→' + am2);
    // Rãnh Xuyên Tâm: chỉ đạn bạo kích mới xuyên
    await fresh([1]);
    const pc = await ev(() => { const G = SK.G, pl = G.player; const mk = crit => { G.bullets.push({ side: 'p', kind: 'pb', x: pl.x + 400, y: pl.y, vx: 1, vy: 0, dmg: 3, crit, r: 2, life: 1, pierce: 0, h: 0 }); return G.bullets[G.bullets.length - 1]; };
      const a = mk(true), c = mk(false); SK.emit('fire', G, pl, pl.weapons[pl.cur]); return [a.pierce, c.pierce]; });
    check('Rãnh Xuyên Tâm: đạn bạo kích xuyên quái (pierce > 0), đạn thường không', pc[0] > 0 && pc[1] === 0, JSON.stringify(pc));
    // Tập Kích: đòn đầu lên quái đầy máu luôn bạo kích
    await fresh([2103]);
    await dummies(2, 100);
    const wb = await ev(() => { const G = SK.G, [a, c] = G.enemies; SK.hurtEnemy(G, a, 3, false, 0, 0); SK.hurtEnemy(G, a, 3, false, 0, 0); return [100 - a.hp, c.hp]; });
    check('Tập Kích: đòn đầu lên quái đầy máu bạo kích (3 → 6), đòn sau thường (3)', wb[0] === 9, 'tổng ' + wb[0]);
    // Đòn Động Năng
    await fresh([2106]);
    await dummies(2, 100);
    const kn = await ev(() => {
      const G = SK.G, pl = G.player, [a, c] = G.enemies, out = [];
      pl.bm.kin = 0; a.hp = 100; SK.hurtEnemy(G, a, 3, false, 0, 0); out.push(100 - a.hp);
      pl.bm.kin = 60; a.hp = a.hpMax = 100; c.hp = c.hpMax = 100; SK.hurtEnemy(G, c, 3, false, 0, 0); out.push(100 - c.hp);   // 51..83 → +2
      pl.bm.kin = 100; a.hp = 100; a.st = 'idle'; a.stT = 0; SK.hurtEnemy(G, a, 3, false, 0, 0); out.push(100 - a.hp, a.st, pl.bm.kin);
      return out;
    });
    check('Đòn Động Năng [WIKI]: 0 tầng +0; 60 tầng +2; đầy 100 tầng → bạo kích (3×2 +3) và choáng, tiêu hết tầng', kn[0] === 3 + 3 * 0 - 0 + (kn[0] - 3) && kn[0] >= 3 && kn[1] === 5 && kn[2] === 9 + (kn[2] - 9) && kn[2] >= 9 && kn[3] === 'stun' && kn[4] === 0, JSON.stringify(kn));
    // Trảm Lốc Xoáy
    await fresh([2101]);
    await ev(() => { SK_GAME.debug.give(Object.keys(SK_DESIGN.weapons).find(k => SK_DESIGN.weapons[k].kind === 'melee')); });
    await dummies(3, 100);
    const ww = await ev(() => { const G = SK.G, pl = G.player; pl.cur = 1; const [a] = G.enemies; a.hp = 1; SK.hurtEnemy(G, a, 5, false, 0, 0); return G.enemies.map(e => e.hp); });
    const ww2 = await ev(() => { const G = SK.G; const [, b2, c2] = G.enemies; b2.hp = 2; c2.hp = 100; return [SK.G.player.bm.wwCd]; });
    check('Trảm Lốc Xoáy: hạ quái bằng cận chiến → 8 sát thương lên quái trong 5,25 ô; hồi 4 s', ww[1] === 92 && ww[2] === 92 && ww2[0] > 3.5 && ww2[0] <= 4, 'máu ' + ww.join(',') + ' · hồi ' + ww2[0]);
    // Cầu máu 15% / năng lượng 17% / nổ 50%
    await fresh([11, 13]);
    const orbs = await ev(() => {
      const G = SK.G; SK.setSeed(777); let hp = 0, en = 0, N = 600;
      const orig = SK.dropPickup; SK.dropPickup = () => {};
      const before = G.props.length;
      for (let i = 0; i < N; i++) { const e = SK.makeEnemy(G, 'e_orc01', G.player.x + 30, G.player.y, G.room); e.p = Object.assign({}, e.p, { reward_rate: 0 }); SK.emit('enemyKill', G, e); }
      for (const pr of G.props.slice(before)) if (pr.kind === 'hp') hp++; else if (pr.kind === 'en') en++;
      SK.dropPickup = orig; G.props.length = before;
      return { hp: hp / N, en: en / N };
    });
    check('Hút Sinh Lực rơi cầu máu ≈ 15% [ĐO lifesiphon.lua], Hút Năng Lượng ≈ 17% [WIKI]', Math.abs(orbs.hp - 0.15) < 0.04 && Math.abs(orbs.en - 0.17) < 0.04, 'máu ' + (orbs.hp * 100).toFixed(1) + '% · năng lượng ' + (orbs.en * 100).toFixed(1) + '%');
    await fresh([33]);
    await dummies(2, 100);
    const bm2 = await ev(() => { const G = SK.G; SK.setSeed(5); let boom = 0, dmgSeen = new Set(); const [a, c] = G.enemies;
      for (let i = 0; i < 200; i++) { c.hp = 100; const k = SK.makeEnemy(G, 'e_orc01', c.x + 10, c.y, G.room); const before = c.hp; SK.emit('enemyKill', G, Object.assign(k, { p: Object.assign({}, k.p, { reward_rate: 0 }) })); if (c.hp < before) { boom++; dmgSeen.add(before - c.hp); } }
      return { boom: boom / 200, dmg: [...dmgSeen] }; });
    check('Xác Dễ Nổ: ≈ 50% quái chết phát nổ, 10 sát thương lên quái gần', Math.abs(bm2.boom - 0.5) < 0.12 && bm2.dmg.length === 1 && bm2.dmg[0] === 10, JSON.stringify(bm2));
    // Kiếm Phản Kích: cận chiến bật đạn địch
    await fresh([4]);
    await ev(() => { SK_GAME.debug.give(Object.keys(SK_DESIGN.weapons).find(k => SK_DESIGN.weapons[k].kind === 'melee')); const pl = SK.G.player; pl.cur = 1; pl.aim = 0; });
    const rb = await ev(() => { const G = SK.G, pl = G.player; G.bullets.push({ side: 'e', kind: 'orb', x: pl.x + 12, y: pl.y - 8, vx: -60, vy: 0, dmg: 2, r: 2, life: 2, h: 0, hit: 'hit_red' }); SK.emit('fire', G, pl, pl.weapons[pl.cur]); return 1; });
    await sleep(150);
    const rb2 = await ev(() => SK.G.bullets.filter(b => b.vx > 0).map(b => b.side));
    check('Kiếm Phản Kích: đạn địch bay vào tầm cận chiến bị bật ngược thành đạn của mình', rb2.length >= 1 && rb2[0] === 'p', rb2.join(','));
    // Đạn Nảy
    await fresh([24]);
    const bn = await ev(() => { const G = SK.G, pl = G.player, W = SK.world, map = G.map; let best = null;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let k = 0; while (k < 300 && !W.solidAt(map, pl.x + dx * k, pl.y - 6 + dy * k)) k += 2;
        if (!best || k < best.k) best = { dx, dy, k };
      }
      G.bullets.push({ side: 'p', kind: 'pb', x: pl.x, y: pl.y - 6, h: 0, vx: best.dx * 240, vy: best.dy * 240, dmg: 3, r: 2, life: 3, _bm: 1, _bounce: 1, hit: 'hit_yellow' });
      return best; });
    await sleep(Math.min(1400, bn.k / 240 * 1000 + 400));
    const bn2 = await ev(() => SK.G.bullets.filter(b => b.side === 'p').map(b => ({ vx: b.vx, vy: b.vy, b: b._bounce })));
    check('Đạn Nảy: đạn chạm tường đổi hướng 1 lần (vận tốc đảo dấu), hết lượt nảy', bn2.length >= 1 && bn2[0].b === 0 && (bn2[0].vx * bn.dx < 0 || bn2[0].vy * bn.dy < 0), JSON.stringify(bn2) + ' · tường cách ' + bn.k + ' theo ' + bn.dx + ',' + bn.dy);
    // Mở Rộng Túi: vòng đổi 3 khẩu
    await fresh([25]);
    const eb = await ev(() => { const pl = SK.G.player; const W = Object.keys(SK_DESIGN.weapons).filter(k => SK_DESIGN.weapons[k].kind === 'gun'); pl.weapons[1] = SK.makeWeapon(W[3]); pl.extraW = SK.makeWeapon(W[4]); pl.cur = 0; return [pl.weapons[0].id, pl.weapons[1].id, pl.extraW.id]; });
    const cyc = [];
    for (let i = 0; i < 4; i++) { await p.keyboard.press('KeyQ'); await sleep(120); cyc.push(await ev(() => SK.G.player.weapons[SK.G.player.cur].id)); }
    const swapKey = await ev(() => Object.entries(SK.input && SK.input.keys || {}).filter(([k, v]) => v === 'swap').map(x => x[0]).join(','));
    check('Mở Rộng Túi: đổi súng đi vòng 3 khẩu (A→B→C→A)', new Set(cyc.slice(0, 3)).size === 3 && cyc[3] === eb[0] || cyc.slice(0, 3).sort().join() === [eb[1], eb[2], eb[0]].sort().join(), eb.join('>') + ' · ' + cyc.join('>') + ' ' + swapKey);
    // Mở Rộng Túi: nhặt súng mới khi hai ô đầy → súng cũ vào ô thứ ba thay vì rơi đất
    await fresh([25]);
    const pu = await ev(() => { const G = SK.G, pl = G.player; const W = Object.keys(SK_DESIGN.weapons).filter(k => SK_DESIGN.weapons[k].kind === 'gun');
      pl.weapons[1] = SK.makeWeapon(W[3]); pl.cur = 0; pl.extraW = null; return { a: pl.weapons[0].id, w: W[7] }; });
    await sleep(150);
    await ev(o => { const G = SK.G, pl = G.player; const old = pl.weapons[pl.cur]; pl.weapons[pl.cur] = SK.makeWeapon(o.w); G.items.push({ id: old.id, x: pl.x, y: pl.y + 4, t: 0 }); }, pu);
    await sleep(200);
    const pu2 = await ev(() => ({ extra: SK.G.player.extraW && SK.G.player.extraW.id, items: SK.G.items.length }));
    check('Mở Rộng Túi: nhặt súng mới khi 2 ô đầy → súng cũ vào ô thứ ba, không rơi ra đất', pu2.extra === pu.a && pu2.items === 0, JSON.stringify(pu2) + ' · cũ ' + pu.a);
    // Khiên Kỵ Sĩ/Sturdy/Gai/Lửa/Xung
    await fresh([6]);
    const sd = await ev(() => { const pl = SK.G.player; pl.armor = 2; pl.hp = pl.hpMax; pl.invulT = 0; SK.hurtPlayer(SK.G, 5, 0, 0); return [pl.armor, pl.hp === pl.hpMax]; });
    check('Khiên Kiên Cường: đòn 5 lên 2 giáp chỉ mất giáp, không lan sang máu', sd[0] === 0 && sd[1] === true, JSON.stringify(sd));
    await fresh([18, 4]);
    const sb = await ev(() => { const G = SK.G, pl = G.player; pl.armor = 3; pl.invulT = 0; G.bullets.push({ side: 'e', kind: 'orb', x: pl.x + 30, y: pl.y - 6, vx: -40, vy: 0, dmg: 1, r: 2, life: 2, h: 0 }, { side: 'e', kind: 'orb', x: pl.x + 90, y: pl.y - 6, vx: -40, vy: 0, dmg: 1, r: 2, life: 2, h: 0 }); SK.hurtPlayer(G, 1, 0, 0); return G.bullets.map(b => b.side + Math.sign(b.vx)); });
    check('Khiên Xung Kích: giáp trúng đòn → xoá đạn trong 3 ô (đi kèm Kiếm Phản Kích thì trả đạn), đạn xa còn nguyên', sb.indexOf('p1') >= 0 && sb.indexOf('e-1') >= 0, sb.join(','));
    await fresh([9]);
    const fb = await ev(() => { const G = SK.G, pl = G.player; pl.invulT = 0; pl.bm.boomT = G.t; pl.bm.boomX = pl.x + 5; pl.bm.boomY = pl.y; const a = pl.armor; SK.hurtPlayer(G, 2, pl.x + 5, pl.y); return [a, pl.armor]; });
    check('Khiên Lửa: vụ nổ thùng đỏ không gây sát thương', fb[0] === fb[1], JSON.stringify(fb));
    // Trì Hoãn Thời Không: đạn địch chậm 10%
    await fresh([14]);
    await ev(() => { const G = SK.G; G.bullets.push({ side: 'e', kind: 'orb', x: G.player.x + 100, y: G.player.y - 40, vx: -100, vy: 0, dmg: 1, r: 2, life: 3, h: 0 }); });
    await sleep(120);
    const sl = await ev(() => Math.abs(SK.G.bullets.find(b => b.side === 'e').vx));
    check('Trì Hoãn Thời Không: đạn địch chậm 10% (100 → 90)', Math.abs(sl - 90) < 0.5, sl.toFixed(1));
    // Cường Hóa Hồi Phục
    await fresh([12]);
    const rc = await ev(() => { const G = SK.G, pl = G.player; pl.hp = 1; pl.energy = 0; SK.dropPickup(G, 'hp_pot', pl.x, pl.y); G.pickups[G.pickups.length - 1].t = 1; return 1; });
    await sleep(300);
    const rc2 = await ev(() => SK.G.player.hp);
    check('Cường Hóa Hồi Phục +100%: bình máu (2) hồi gấp đôi → 1 + 4', rc2 === 5, 'máu ' + rc2);
    // Giáp Đi Nhanh
    await fresh([36]);
    await ev(() => { const pl = SK.G.player; pl.armor = 0; pl.bm.walk = 40 * 16 - 1; SK.G.player.x += 2; });
    await sleep(300);
    const bz = await ev(() => { SK.emit('enemyHit', SK.G, { st: 'alive' }, 5, true); return SK.G.player.bm.blitzT; });
    await sleep(100);
    const bz2 = await ev(() => ({ armor: SK.G.player.armor, spd: SK.G.player.h.speed / SK.G.player._baseSpeed }));
    check('Giáp Đi Nhanh: đi đủ 40 ô hồi 1 giáp; bạo kích → chạy ×1,3 trong 2 s', bz2.armor >= 1 && bz === 2 && Math.abs(bz2.spd - 1.3) < 0.001, JSON.stringify(bz2) + ' blitzT ' + bz);
    await ev(() => { SK.G.player.buffs = []; });

    // ================================================================ đồ rơi của quái
    await stage('1-3', {});
    const dr = await ev(() => {
      const G = SK.G, out = {};
      const run = (id, n) => {
        let coins = 0, orbs = 0, only = { e: 0, c: 0, both: 0 }, kinds = {};
        SK.setSeed(99);
        for (let i = 0; i < n; i++) {
          G.pickups.length = 0; const before = G.props.length;
          const e = SK.makeEnemy(G, id, G.player.x, G.player.y, G.room);
          SK_ROOMS.dropReward(e);
          let c = 0, o = 0;
          for (const k of G.pickups) if (k.kind === 'coin') c += 1; else if (k.kind === 'energy') o++;
          for (const pr of G.props.slice(before)) if (pr.coin) { c += pr.coin; kinds[pr.kind] = (kinds[pr.kind] || 0) + 1; }
          G.props.length = before;
          coins += c; orbs += o;
          if (o && !c) only.e++; else if (c && !o) only.c++; else if (c && o) only.both++;
        }
        return { coins: coins / n, orbs: orbs / n, only, kinds };
      };
      out.orc01 = run('e_orc01', 4000);
      out.ex_orc04 = run('ex_orc04', 200);
      out.ex_orc05 = run('ex_orc05', 200);
      out.pf = ['e_orc01', 'ex_orc04', 'ex_orc05'].map(id => { const p0 = SK.D.enemies[id].ai[0].p; return [p0.reward_rate, p0.reward_value.join(',')]; });
      return out;
    });
    // e_orc01: rate 20, [0,0,1,1]: hai lần tung độc lập → kỳ vọng 0,2 xu (1 vàng) + 0,2 cầu; chỉ-năng-lượng ≈ 16%, chỉ-xu ≈ 16%, cả hai ≈ 4%
    check('quái thường e_orc01 (reward_rate 20, [0,0,1,1]): hai lần tung độc lập — ≈ 0,2 vàng và ≈ 0,2 cầu/quái',
      Math.abs(dr.orc01.coins - 0.2) < 0.03 && Math.abs(dr.orc01.orbs - 0.2) < 0.03, 'vàng ' + dr.orc01.coins.toFixed(3) + ' · cầu ' + dr.orc01.orbs.toFixed(3) + ' · dữ liệu ' + dr.pf[0].join(' '));
    check('độc lập thật: có quái chỉ rơi cầu (≈ 16%), chỉ rơi xu (≈ 16%), cả hai (≈ 4%)',
      Math.abs(dr.orc01.only.e / 4000 - 0.16) < 0.03 && Math.abs(dr.orc01.only.c / 4000 - 0.16) < 0.03 && Math.abs(dr.orc01.only.both / 4000 - 0.04) < 0.02, JSON.stringify(dr.orc01.only));
    check('tinh anh ex_orc04 (100%, [0,0,4,2]): luôn 4 vàng và 2 cầu', dr.ex_orc04.coins === 4 && dr.ex_orc04.orbs === 2, dr.ex_orc04.coins + ' vàng · ' + dr.ex_orc04.orbs + ' cầu · ' + dr.pf[1].join(' '));
    check('tinh anh ex_orc05 (100%, [0,1,2,3]): 1 xu coin_1 (3 vàng) + 2 xu coin_2 (1 vàng) = 5 vàng, 3 cầu', dr.ex_orc05.coins === 5 && dr.ex_orc05.orbs === 3 && dr.ex_orc05.kinds['1'] === 200, dr.ex_orc05.coins + ' vàng · ' + dr.ex_orc05.orbs + ' cầu · ' + JSON.stringify(dr.ex_orc05.kinds) + ' · ' + dr.pf[2].join(' '));
    // nhặt xu 3 vàng thật
    const pk = await ev(() => { const G = SK.G, pl = G.player; pl.gold = 0; G.props.length = 0; SK.setSeed(3); const e = SK.makeEnemy(G, 'ex_orc05', pl.x, pl.y, G.room); SK_ROOMS.dropReward(e); return G.props.filter(q => q.coin).length; });
    await sleep(1500);
    const pk2 = await ev(() => SK.G.player.gold);
    await p.screenshot({ path: path.join(SHOTS, 'drops.png') });
    check('nhặt xu rơi thật: ex_orc05 → +5 vàng vào ví', pk2 >= 3, 'xu 3 vàng ' + pk + ' · ví ' + pk2);
    // thùng vỡ: 10% năng lượng, có Người Nhặt Phế Liệu 12% + 3% bình máu
    const cr = await ev(() => {
      const G = SK.G, out = {};
      const orig = SK.dropPickup; let en = 0, hp = 0; SK.dropPickup = (g, k) => { if (k === 'energy') en++; else if (k === 'hp_pot') hp++; };
      SK.setSeed(11); for (let i = 0; i < 4000; i++) SK.emit('obstacleBreak', G, { kind: 'box', x: 10, y: 10 });
      out.base = [en / 4000, hp / 4000];
      G.player.buffs = [19]; en = 0; hp = 0; for (let i = 0; i < 4000; i++) SK.emit('obstacleBreak', G, { kind: 'box', x: 10, y: 10 });
      out.luck = [en / 4000, hp / 4000]; G.player.buffs = []; SK.dropPickup = orig; return out;
    });
    check('thùng vỡ: 10% cầu năng lượng; Người Nhặt Phế Liệu: 3% bình máu, ≈ 12% năng lượng [WIKI]',
      Math.abs(cr.base[0] - 0.10) < 0.02 && cr.base[1] === 0 && Math.abs(cr.luck[1] - 0.03) < 0.015 && Math.abs(cr.luck[0] - 0.12 * 0.97) < 0.02, JSON.stringify(cr));
  } catch (e) {
    check('chạy trọn', false, (e.stack || e.message).split('\n').slice(0, 3).join(' / '));
  }
  const bad = errs.filter(e => !IGNORE.test(e));
  check('không lỗi trang / console', bad.length === 0, bad.slice(0, 3).join(' | '));
  await b.close();
  console.log(results.join('\n'));
  console.log('\n  ảnh: ' + SHOTS);
  console.log('═'.repeat(52));
  console.log('  ĐẠT ' + pass + '   HỎNG ' + fail);
  console.log('═'.repeat(52));
  process.exit(fail ? 1 : 0);
})();
