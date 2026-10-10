/*
 * Kiểm lính thuê (13) và dữ liệu thú cưỡi của Hiệp Sĩ Linh Hồn (js/actors.js addMercenary, js/rooms.js fillMerc/fillCage,
 * data/sk-mounts.js, data/sk-mercs.js sinh bởi tools/mounts/build_mounts.py).
 * Chạy: python3 -m http.server 8833 (ở gốc repo) rồi  SK_URL=http://localhost:8833/games/soulknight/index.html PLAYWRIGHT_PATH=... node test/soulknight-mercs.js
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-mercs/.
 */
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const URL = (process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html') + '?quick=1&themes=forest,castle,volcano';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-mercs');
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
  while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg)) return true; await sleep(80); }
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

  async function stage(label, force, type) {
    await ev(([l, f]) => { Object.assign(SK_ROOMS.force, { chest: null, special: null, statue: null, merc: null }, f); SK_GAME.debug.stage(l); }, [label, force || {}]);
    await until(p, () => SK_GAME.phase === 'play', null, 4000);
    if (type) { await ev(t => SK_GAME.debug.teleportTo(t), type); await sleep(350); }
  }
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
  // Giết hết lính bằng đạn địch (đường chết thật của addWeaponAlly).
  const killMercs = async () => {
    await ev(() => { const G = SK.G; for (const a of SK.livingMercs(G)) G.bullets.push({ side: 'e', x: a.x, y: a.y - 7, vx: 0, vy: 0, r: 2, h: 6, dmg: 5000, life: 2, t: 0 }); });
    await sleep(250);
  };
  const mercs = () => ev(() => SK.livingMercs(SK.G).map(a => ({ id: a.merc, hp: a.hp, hpMax: a.hpMax, hired: a.hired, armed: a.armed })));

  try {
    await p.goto(URL);
    await p.waitForSelector('#sk-start', { state: 'visible', timeout: 8000 });
    await ev(() => SK_GAME.debug.seed(424242));
    await p.click('#sk-start');
    await until(p, () => SK_GAME.state === 'stage', null, 3000);
    await ev(() => { SK_GAME.debug.god(true); SK_GAME.debug.pet(false); });

    // ================================================================ Bước A: dữ liệu
    const D = await ev(() => {
      const C = window.SK_MERCS, M = window.SK_MOUNTS;
      return {
        n: C.order.length, sum: C.order.reduce((a, k) => a + C.mercs[k].hp, 0),
        mech: [0, 1, 2, 3, 4, 5, 6, 7].map(i => M.mounts['m_mech_' + i].hp),
        cre: M.sellers.creature.length, mechSell: M.sellers.mech.length, nMounts: M.order.length,
        k1: C.mercs.npc_01, k8: C.mercs.npc_08, k11: C.mercs.npc_11, k12: C.mercs.npc_12,
        boar: M.mounts.mboar, proto: M.mounts.m_mech_0, spider: M.mounts.mspider,
        wRnd: C.order.reduce((a, k) => a + C.mercs[k].weight.random, 0) + C.mercs.npc_07.mad.weight.random
      };
    });
    check('lính thuê: 13 người, tổng HP = 815 (70+50+60+55+65+55+55+80+60+60+55+100+50)', D.n === 13 && D.sum === 815, D.n + ' người · ' + D.sum);
    check('HP cơ giáp m_mech_0..7 = 7,10,8,12,16,8,7,7', JSON.stringify(D.mech) === '[7,10,8,12,16,8,7,7]', JSON.stringify(D.mech));
    check('thú cưỡi: 9 sinh vật bán ở thương nhân thú cưỡi, 12 cơ giáp bán ở thương nhân vật chở', D.cre === 9 && D.mechSell === 12, D.cre + ' / ' + D.mechSell + ' (tổng ' + D.nMounts + ' mục)');
    check('số prefab: Kỵ Sĩ Hoàng Gia 70 máu giá 15; Don Quixote 80 máu tốc 12 giá 20; Pharaoh 100 máu; Hy Vọng atk_cd 15 s',
      D.k1.hp === 70 && D.k1.price === 15 && D.k8.hp === 80 && D.k8.speed === 12 && D.k8.price === 20 && D.k12.hp === 100 && D.k11.atkCd === 15,
      [D.k1.hp, D.k1.price, D.k8.hp, D.k8.speed, D.k8.price, D.k12.hp, D.k11.atkCd].join(','));
    check('Heo Rừng 10 máu +20% tốc; Thiết Giáp Nguyên Mẫu 7 máu giáp 1 nổ 50; Nhện nổ 10',
      D.boar.hp === 10 && D.boar.speedRate === 0.2 && D.proto.hp === 7 && D.proto.def === 1 && D.proto.weapon.blast === 50 && D.spider.weapon.damage === 10,
      JSON.stringify([D.boar.hp, D.boar.speedRate, D.proto.def, D.proto.weapon.blast, D.spider.weapon.damage]));
    check('trọng số random_mercenary: tổng 113 (10 người×10 + 5 + 5 bản điên + 3 Pharaoh)', D.wRnd === 113, String(D.wRnd));

    // ================================================================ Bước B: lính thuê
    // (1) thiếu tiền: bị từ chối, vàng không đổi
    await stage('1-3', { special: 'merc', merc: 'npc_01' }, 'special');
    await ev(() => { SK.G.player.gold = 5; });
    const l1 = await useLabel('^Kỵ Sĩ Hoàng Gia');
    const poor = await ev(() => ({ gold: SK.G.player.gold, n: SK.livingMercs(SK.G).length, toast: (SK.G.toasts || []).slice(-1)[0] }));
    check('(1) thuê khi thiếu tiền: bị từ chối, vàng giữ 5, không có lính', poor.gold === 5 && poor.n === 0, l1 + ' · vàng ' + poor.gold + ' · lính ' + poor.n);

    // (2) đủ tiền: HP = bảng (Kỵ Sĩ Hoàng Gia 70), trừ 15 vàng
    await ev(() => { SK.G.player.gold = 100; });
    await useLabel('^Kỵ Sĩ Hoàng Gia');
    const m2 = await mercs(), g2 = await ev(() => SK.G.player.gold);
    check('(2) thuê xong: HP = 70 (bảng), đã thuê, trừ đúng 15 vàng', m2.length === 1 && m2[0].id === 'npc_01' && m2[0].hp === 70 && m2[0].hpMax === 70 && m2[0].hired && g2 === 85,
      JSON.stringify(m2) + ' · vàng ' + g2);
    await sleep(600);
    const near = await ev(() => { const a = SK.livingMercs(SK.G)[0], pl = SK.G.player; return Math.hypot(a.x - pl.x, a.y - pl.y); });
    await ev(() => { const pl = SK.G.player; pl.x += 90; });
    await sleep(1600);
    const follow = await ev(() => { const a = SK.livingMercs(SK.G)[0], pl = SK.G.player; return Math.hypot(a.x - pl.x, a.y - pl.y); });
    check('lính đi theo chủ: bị bỏ xa 90 px thì đuổi kịp trong 1,6 s', follow < 40, 'cách ' + Math.round(follow) + ' px (lúc đầu ' + Math.round(near) + ')');

    // (4) đồng minh đỡ đạn: trúng đạn địch thì mất máu; HP về 0 thì biến mất
    await ev(() => {
      const G = SK.G, a = SK.livingMercs(G)[0];
      G.bullets.push({ side: 'e', x: a.x, y: a.y - 7, vx: 0, vy: 0, r: 2, h: 6, dmg: 3, life: 2, t: 0 });
    });
    await sleep(200);
    const m4 = await mercs();
    check('(4a) đạn địch trúng lính: HP 70 → 67, người chơi nguyên vẹn', m4.length === 1 && m4[0].hp === 67, JSON.stringify(m4));
    await ev(() => {
      const G = SK.G, a = SK.livingMercs(G)[0];
      G.bullets.push({ side: 'e', x: a.x, y: a.y - 7, vx: 0, vy: 0, r: 2, h: 6, dmg: 500, life: 2, t: 0 });
    });
    await sleep(200);
    const m4b = await mercs(), mm = await ev(() => (SK.G.mercs || []).length);
    check('(4b) HP về 0 thì lính biến mất khỏi ván', m4b.length === 0 && mm === 0, 'còn ' + m4b.length);

    // thuê lại để thử (3) và (5)
    await stage('1-3', { special: 'merc', merc: 'npc_08' }, 'special');
    await ev(() => { SK.G.player.gold = 100; });
    await useLabel('^Don Quixote');
    const m3a = await mercs();
    check('Don Quixote: 80 máu', m3a.length === 1 && m3a[0].id === 'npc_08' && m3a[0].hp === 80, JSON.stringify(m3a));
    // (5) sang tầng mới hồi đầy máu
    await ev(() => { SK.livingMercs(SK.G)[0].hp = 20; });
    await stage('1-4', { special: 'merc', merc: 'npc_02' });
    const m5 = await mercs();
    check('(5) sang tầng mới: HP 20 → 80 (đầy), vẫn là người cũ', m5.length === 1 && m5[0].id === 'npc_08' && m5[0].hp === 80 && m5[0].hpMax === 80, JSON.stringify(m5));
    // (3) còn người sống thì tầng sau không có phòng lính thuê
    await ev(() => { SK_GAME.debug.teleportTo('special'); });
    await sleep(300);
    const m3 = await ev(() => ({ allowed: SK_ROOMS.mercRoomAllowed(), fills: SK.G.map.rooms.filter(r => r.type === 'special').map(r => r.fill),
      merc: SK.G.interactables.some(o => /thuê \d+ vàng/.test(o.label)) }));
    check('(3) còn lính đã thuê sống: không sinh phòng lính thuê tầng sau (dù ép), phòng đặc biệt đổi sang loại khác',
      !m3.allowed && m3.fills.every(f => f !== 'merc') && !m3.merc, JSON.stringify(m3));
    await killMercs();
    // Lính chiến đấu: bắn trúng quái đứng yên
    await stage('1-3', { special: 'merc', merc: 'npc_02' }, 'special');
    await ev(() => { SK.G.player.gold = 100; });
    await useLabel('^Anh Hùng Mặt Nạ');
    const fight = await ev(async () => {
      const G = SK.G, pl = G.player;
      G.enemies.length = 0;
      const e = SK.makeEnemy(G, 'e_orc01', pl.x + 60, pl.y - 8, G.room);
      e.st = 'idle'; e.stT = 1e9; e.hp = e.hpMax = 400; G.enemies.push(e);
      const h0 = e.hp;
      await new Promise(r => setTimeout(r, 6000));
      return { h0, h1: e.hp };
    });
    check('lính tự đánh: Anh Hùng Mặt Nạ (3 sát thương/phát) bắn quái đứng yên trong 6 s (>= 3 phát trúng)', fight.h0 - fight.h1 >= 9, fight.h0 + ' → ' + fight.h1);
    // ảnh: lính đi theo chủ
    await ev(() => { SK.G.enemies.length = 0; const pl = SK.G.player; pl.x += 30; });
    await sleep(900);
    await p.screenshot({ path: path.join(SHOTS, 'merc-follow.png') });
    // lồng nhốt: miễn phí, tay không, qua tầng nhận vũ khí
    await killMercs();
    await stage('1-3', { special: 'cage', merc: 'npc_05' }, 'special');
    await useLabel('^Babalu');
    const cg = await mercs();
    await stage('1-4', {});
    const cg2 = await mercs();
    check('lồng nhốt: miễn phí, không chặn phòng lính thuê (hired=false), tay không → tầng sau cầm vũ khí',
      cg.length === 1 && !cg[0].hired && !cg[0].armed && cg2.length === 1 && cg2[0].armed && cg2[0].hp === 65, JSON.stringify(cg) + ' → ' + JSON.stringify(cg2));

    const errsReal = errs.filter(e => !IGNORE.test(e));
    check('không lỗi trang/console', errsReal.length === 0, errsReal.slice(0, 3).join(' | '));
  } catch (e) {
    check('bộ kiểm chạy hết không ngoại lệ', false, e.stack || e.message);
  }
  await b.close();
  console.log(results.join('\n'));
  console.log('\nĐẠT ' + pass + ' · HỎNG ' + fail);
  process.exit(fail ? 1 : 0);
})();
