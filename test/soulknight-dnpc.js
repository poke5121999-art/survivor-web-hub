/*
 * Kiểm đồ vật / NPC phòng đặc biệt trong hầm ngục của Hiệp Sĩ Linh Hồn (games/soulknight/js/dnpc.js):
 * Lò Đúc Lại, Lò Khởi Nguyên, Lò Luyện Dung Hợp, Thầy Huấn Luyện. Ép phòng bằng SK_ROOMS.force.special = <loại>.
 * Chạy: python3 -m http.server 8811 (ở gốc repo) rồi  PLAYWRIGHT_PATH=... node test/soulknight-dnpc.js
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-dnpc/.
 */
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const URL = (process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html') + '?quick=1&themes=forest,castle,volcano';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-dnpc');
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

  async function stage(label, special, type) {
    await ev(([l, s]) => { Object.assign(SK_ROOMS.force, { chest: null, special: s || null, statue: null, merc: null }); SK_GAME.debug.stage(l); }, [label, special]);
    await until(p, () => SK_GAME.phase === 'play', null, 4000);
    if (type) { await ev(t => SK_GAME.debug.teleportTo(t), type); await sleep(350); }
  }
  // Đứng cạnh điểm tương tác khớp nhãn, bấm E; trả nhãn đã thấy.
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
  // Cho người chơi cầm các vũ khí theo id (ô 0, ô 1), vàng cho trước.
  const hold = (ids, gold) => ev(([ids, gold]) => {
    const G = SK.G, pl = G.player;
    pl.weapons = ids.map(id => id ? SK.makeWeapon(id) : null);
    pl.cur = 0; pl.gold = gold;
    if (G.mods) G.mods.freeBuys = 0;
  }, [ids, gold]);
  const state = () => ev(() => {
    const pl = SK.G.player, D = SK.DS.weapons;
    return { gold: pl.gold, cur: pl.cur, w: pl.weapons.map(w => w ? { id: w.id, type: D[w.id].type, grade: D[w.id].grade, name: D[w.id].name } : null) };
  });
  const priceOf = (re, label) => { const m = new RegExp(re).exec(label || ''); return m ? +m[1] : null; };

  try {
    await p.goto(URL);
    await p.waitForSelector('#sk-start', { state: 'visible', timeout: 8000 });
    await ev(() => SK_GAME.debug.seed(515151));
    await p.click('#sk-start');
    await until(p, () => SK_GAME.state === 'stage', null, 3000);
    await ev(() => { SK_GAME.debug.god(true); SK_GAME.debug.pet(false); });

    // ================================================================ dữ liệu / bể
    const D = await ev(() => {
      const R = SK_ROOMS, N = R.dnpc, DS = SK.DS;
      const pf = n => !!SK.prefab(n);
      const ak = DS.weapons.ak_47;
      return {
        pf: ['furance', 'furance_inverse', 'furance_fuse', 'npc_trainer'].map(pf),
        extra: Object.keys(R.extra),
        w: { f: R.extra.furnace.weight(), i: R.extra.furnace_inverse.weight(), t: R.extra.trainer.weight() },
        poolAk: N.reforgePool(ak).length, poolAkTypes: [...new Set(N.reforgePool(ak).map(id => DS.weapons[id].type))],
        base: R.priced(N.REFORGE_BASE), akType: ak.type,
        fg: [[1, 1], [2, 2], [3, 1], [5, 5], [6, 6], [1, 4]].map(([a, b]) => N.fuseGrade(a, b)),
        fuseSizes: [1, 2, 3, 4, 5, 6].map(g => N.fusePool(g).length)
      };
    });
    check('prefab gốc furance, furance_inverse, furance_fuse, npc_trainer có trong dữ liệu', D.pf.every(Boolean), JSON.stringify(D.pf));
    check('4 loại phòng đã đăng ký (furnace, furnace_inverse, furnace_fuse, trainer)', ['furnace', 'furnace_inverse', 'furnace_fuse', 'trainer'].every(k => D.extra.indexOf(k) >= 0), D.extra.join(','));
    check('trọng số lò = 150 × 2/11 ≈ 27,27 (random_objects.weapon_provider); thầy huấn luyện 0 khi chưa có lính',
      Math.abs(D.w.f - 27.2727) < 0.01 && Math.abs(D.w.i - 27.2727) < 0.01 && D.w.t === 0, JSON.stringify(D.w));
    check('bể đúc lại của AK47 chỉ gồm vũ khí cùng loại (type ' + D.akType + ') và có nhiều hơn 1 món', D.poolAk > 1 && D.poolAkTypes.length === 1 && D.poolAkTypes[0] === D.akType, D.poolAk + ' món · loại ' + D.poolAkTypes);
    check('luật dung hợp: (1,1)→2, (2,2)→3, (3,1)→3, (5,5)→6, (6,6)→6, (1,4)→4; mỗi bậc 1..6 đều có vũ khí',
      JSON.stringify(D.fg) === '[2,3,3,6,6,4]' && D.fuseSizes.every(n => n > 0), JSON.stringify(D.fg) + ' · ' + D.fuseSizes);

    // ================================================================ Lò Đúc Lại
    await stage('1-3', 'furnace', 'special');
    const fl = await ev(() => { const r = SK.G.map.rooms.filter(x => x.type === 'special')[0]; return r && r.fill; });
    check('ép phòng đặc biệt furnace: phòng có Lò Đúc Lại', fl === 'furnace', String(fl));
    const nl = await ev(() => SK.G.interactables.filter(o => /^Lò Đúc Lại/.test(o.label)).length);
    check('có điểm tương tác Lò Đúc Lại', nl === 1, String(nl));
    await p.screenshot({ path: path.join(SHOTS, 'furnace.png') });

    // (1) không có vũ khí / vũ khí không dung luyện được: không trừ vàng
    await hold(['weapon_init_airbender', null], 500);
    await useLabel('^Lò Đúc Lại');
    let s = await state();
    check('(1a) Qian-kun Punch không bỏ vào lò được: vàng giữ 500, vũ khí giữ nguyên', s.gold === 500 && s.w[0].id === 'weapon_init_airbender', JSON.stringify(s));
    // (2) thiếu vàng
    await hold(['ak_47', null], 3);
    const lab0 = await useLabel('^Lò Đúc Lại');
    s = await state();
    check('(2) thiếu vàng: bị từ chối, vàng giữ 3, vũ khí vẫn AK47', s.gold === 3 && s.w[0].id === 'ak_47', lab0 + ' · ' + JSON.stringify(s));
    // (3) đúc: trừ đúng giá, ra vũ khí cùng loại; lần sau giá gấp đôi
    await hold(['ak_47', null], 9999);
    const base = D.base, akType = D.akType;
    const lab1 = await useLabel('^Lò Đúc Lại');
    const p1 = priceOf('\\((\\d+) vàng\\)', lab1);
    s = await state();
    check('(3a) đúc lần 1: nhãn ghi ' + base + ' vàng, trừ đúng ' + base + ', ra vũ khí cùng loại ' + akType,
      p1 === base && 9999 - s.gold === base && s.w[0].type === akType, lab1 + ' · vàng ' + s.gold + ' · ' + s.w[0].name);
    const g1 = s.gold;
    const lab2 = await useLabel('^Lò Đúc Lại');
    s = await state();
    check('(3b) đúc lần 2: giá gấp đôi (' + 2 * base + ') và vẫn cùng loại', priceOf('\\((\\d+) vàng\\)', lab2) === 2 * base && g1 - s.gold === 2 * base && s.w[0].type === akType, lab2 + ' · trừ ' + (g1 - s.gold));
    const g2 = s.gold;
    await useLabel('^Lò Đúc Lại');
    s = await state();
    check('(3c) đúc lần 3: giá gấp bốn (' + 4 * base + ')', g2 - s.gold === 4 * base, 'trừ ' + (g2 - s.gold));
    // (4) vũ khí đỏ ra vũ khí đỏ; nhiều lần liên tiếp luôn cùng nhóm
    const grp = await ev(async () => {
      const G = SK.G, pl = G.player, DS = SK.DS, out = { ok: 0, n: 40, bad: [] };
      const red = Object.keys(DS.weapons).find(id => /^weapon_\d{3}$/.test(DS.weapons[id].prefab) && DS.weapons[id].grade === 6 && DS.weapons[id].dmg > 0 && !DS.weapons[id].starter);
      for (const start of ['ak_47', red]) {
        for (let i = 0; i < 20; i++) {
          pl.weapons = [SK.makeWeapon(start), null]; pl.cur = 0; pl.gold = 1e6;
          const it = SK_ROOMS.dnpc.last; it.uses = 0;
          const o = SK.G.interactables.find(q => /^Lò Đúc Lại/.test(q.label)); pl.x = o.x; pl.y = o.y + 2;
          o.use();
          const a = DS.weapons[start], d = DS.weapons[pl.weapons[0].id];
          if ((a.grade >= 6) === (d.grade >= 6) && (a.grade >= 6 || a.type === d.type)) out.ok++; else out.bad.push(start + '→' + pl.weapons[0].id);
        }
      }
      out.red = red;
      return out;
    });
    check('(4) 40 lần đúc (20 từ AK47, 20 từ vũ khí đỏ): luôn đúng nhóm (cùng loại / đỏ ra đỏ)', grp.ok === grp.n, grp.ok + '/' + grp.n + ' ' + grp.bad.slice(0, 3));
    const pk = await ev(() => 1);

    // ================================================================ Lò Khởi Nguyên
    await stage('1-3', 'furnace_inverse', 'special');
    const fi = await ev(() => SK.G.map.rooms.filter(x => x.type === 'special')[0].fill);
    check('ép phòng furnace_inverse: phòng có Lò Khởi Nguyên', fi === 'furnace_inverse', String(fi));
    await p.screenshot({ path: path.join(SHOTS, 'furnace_inverse.png') });
    const rs = await ev(() => {
      const DS = SK.DS, F = SK_FORGE.forge, pl = SK.G.player, P = SK.profile;
      // chọn 3 vũ khí có công thức khác nhau (đủ loại nguyên liệu); đo trước/sau từng món trên cùng lò dùng 1 lần → dựng lò mới mỗi món bằng it.used = false
      const ids = ['ak_47', 'weapon_135'].filter(id => DS.weapons[id]);
      const keys = new Set(); const rows = [];
      const it = SK_ROOMS.dnpc.last, o = SK.G.interactables.find(q => /^Lò Khởi Nguyên/.test(q.label));
      for (const id of ids) {
        const d = DS.weapons[id], rec = F[d.prefab], mats = rec.mats;
        mats.forEach(m => keys.add(m[0]));
        const before = {}; mats.forEach(([k]) => before[k] = k === 'material_gem' ? P.gems : P.item(k));
        pl.weapons = [SK.makeWeapon(id), SK.makeWeapon('ak_47')]; pl.cur = 0; it.used = false;
        pl.x = o.x; pl.y = o.y + 2;
        o.use();
        const exp = {}, got = {};
        mats.forEach(([k, n]) => { exp[k] = Math.ceil(n / 3); got[k] = (k === 'material_gem' ? P.gems : P.item(k)) - before[k]; });
        rows.push({ id, mats, exp, got, left: pl.weapons.map(w => w && w.id), usedAfter: it.used });
      }
      return rows;
    });
    for (const r of rs) {
      check('(5) Lò Khởi Nguyên: ' + r.id + ' công thức ' + JSON.stringify(r.mats) + ' → nhận đúng ⌈n/3⌉ mỗi loại, vũ khí biến mất, lò tắt',
        JSON.stringify(r.exp) === JSON.stringify(r.got) && r.usedAfter && r.left[0] === null, JSON.stringify(r.exp) + ' / nhận ' + JSON.stringify(r.got));
    }
    await hold(['ak_47', 'ak_47'], 0);
    await useLabel('^Lò Khởi Nguyên');
    const inv1 = await ev(() => ({ iron: SK.profile.item('material_iron'), w: SK.G.player.weapons.map(w => w && w.id), label: SK.G.interactables.find(q => /^Lò Khởi Nguyên/.test(q.label)).label }));
    await hold(['ak_47', 'ak_47'], 0);
    const ironBefore = await ev(() => SK.profile.item('material_iron'));
    await useLabel('^Lò Khởi Nguyên');
    const inv2 = await ev(() => ({ iron: SK.profile.item('material_iron'), w: SK.G.player.weapons.map(w => w && w.id) }));
    check('(6) lò đã dùng rồi thì không dùng lại: nguyên liệu và vũ khí không đổi, nhãn "đã tắt lửa"', inv2.iron === ironBefore && inv2.w[0] === 'ak_47' && /đã tắt lửa/.test(inv1.label), 'sắt ' + ironBefore + ' → ' + inv2.iron + ' · ' + inv1.label);

    // ================================================================ Lò Luyện Dung Hợp
    await stage('1-4', 'furnace_fuse', 'special');
    const ff = await ev(() => SK.G.map.rooms.filter(x => x.type === 'special')[0].fill);
    check('ép phòng furnace_fuse: phòng có Lò Luyện Dung Hợp', ff === 'furnace_fuse', String(ff));
    await p.screenshot({ path: path.join(SHOTS, 'furnace_fuse.png') });
    await hold(['ak_47', null], 9999);
    const fb = await useLabel('^Lò Luyện Dung Hợp');
    s = await state();
    check('(7) chỉ có 1 vũ khí: không dung hợp được, vàng giữ nguyên', s.gold === 9999 && s.w[0].id === 'ak_47' && !s.w[1], JSON.stringify(s));
    const pick = (g, skip) => ev(([g, skip]) => Object.keys(SK.DS.weapons).find(id => { const d = SK.DS.weapons[id]; return /^weapon_\d{3}$/.test(d.prefab) && d.grade === g && d.dmg > 0 && !d.starter && id !== skip; }), [g, skip]);
    const fp = await ev(() => SK_ROOMS.dnpc.fusePrice({ uses: 0 }));
    const pairs = [[1, 1, 2], [2, 2, 3], [3, 1, 3], [5, 5, 6], [6, 6, 6], [1, 4, 4]];
    let uses = 0;
    for (const [ga, gb, want] of pairs) {
      const a = await pick(ga), bb = await pick(gb, a);
      await hold([a, bb], 99999);
      const lab = await useLabel('^Lò Luyện Dung Hợp');
      const st = await state();
      const exp = fp * Math.pow(2, uses);
      check('(8) dung hợp bậc ' + ga + ' + bậc ' + gb + ' → bậc ' + want + ', trừ ' + exp + ' vàng (giá gấp đôi mỗi lần), chỉ còn 1 vũ khí',
        st.w[0] && st.w[0].grade === want && !st.w[1] && 99999 - st.gold === exp && priceOf('\\((\\d+) vàng\\)', lab) === exp, (st.w[0] ? st.w[0].name + ' bậc ' + st.w[0].grade : 'không có vũ khí') + ' · trừ ' + (99999 - st.gold) + ' · nhãn ' + lab);
      uses++;
    }
    await hold(['ak_47', 'weapon_135'], 5);
    await useLabel('^Lò Luyện Dung Hợp');
    s = await state();
    check('(9) thiếu vàng: không dung hợp, giữ cả 2 vũ khí', s.gold === 5 && s.w[0].id === 'ak_47' && s.w[1] && s.w[1].id === 'weapon_135', JSON.stringify(s));
    await ev(() => { const pl = SK.G.player; pl.weapons = [SK.makeWeapon('ak_47'), SK.makeWeapon('weapon_init_airbender')]; pl.gold = 99999; });
    await useLabel('^Lò Luyện Dung Hợp');
    s = await state();
    check('(9b) có Qian-kun Punch trong tay: không dung hợp, vàng giữ nguyên', s.gold === 99999 && s.w[1] && s.w[1].id === 'weapon_init_airbender', JSON.stringify(s));

    // ================================================================ Thầy Huấn Luyện
    await stage('1-3', 'trainer', 'special');
    const tr = await ev(() => SK.G.map.rooms.filter(x => x.type === 'special')[0].fill);
    check('ép phòng trainer: phòng có Thầy Huấn Luyện', tr === 'trainer', String(tr));
    await p.screenshot({ path: path.join(SHOTS, 'trainer.png') });
    await hold(['ak_47', null], 9999);
    const t0 = await useLabel('^Thầy Huấn Luyện');
    s = await state();
    check('(10) chưa có lính: không trừ vàng ("tùy tùng của bạn đâu")', s.gold === 9999 && /đâu/.test(t0 || ''), String(t0));
    const mk = await ev(() => { const G = SK.G, p = G.player; const a = SK.addMercenary(G, p, 'npc_02', p.x - 8, p.y, { hired: true, armed: true, hpBonus: 0 }); return { hp: a.hpMax }; });
    const base2 = await ev(() => SK_ROOMS.dnpc.trainPrice({ uses: 0 }));
    const rows = [];
    for (let k = 1; k <= 5; k++) {
      await ev(() => { SK.G.player.gold = 9999; });
      const lab = await useLabel('^Thầy Huấn Luyện');
      const m = await ev(() => { const a = SK.livingMercs(SK.G)[0]; return { hpMax: a.hpMax, hp: a.hp, rank: SK_ROOMS.dnpc.rankOf(a), gold: SK.G.player.gold }; });
      rows.push({ k, lab, m });
      check('(11) huấn luyện lần ' + k + ': trừ ' + base2 * Math.pow(2, k - 1) + ' vàng, máu tối đa ' + (mk.hp + 15 * k) + ' (+15 mỗi bậc), bậc ' + k,
        9999 - m.gold === base2 * Math.pow(2, k - 1) && m.hpMax === mk.hp + 15 * k && m.hp === m.hpMax && m.rank === k, JSON.stringify(m) + ' · ' + lab);
    }
    await ev(() => { SK.G.player.gold = 9999; });
    const lab6 = await useLabel('^Thầy Huấn Luyện');
    const m6 = await ev(() => ({ hpMax: SK.livingMercs(SK.G)[0].hpMax, gold: SK.G.player.gold }));
    check('(12) đã tối đa 5 bậc (+75 máu): thầy "không còn gì để dạy", không trừ vàng', m6.hpMax === mk.hp + 75 && m6.gold === 9999, JSON.stringify(m6) + ' · ' + lab6);
    // qua tầng: lính giữ bậc
    await stage('1-4', null);
    const keep = await ev(() => SK.livingMercs(SK.G).map(a => ({ hpMax: a.hpMax, rank: SK_ROOMS.dnpc.rankOf(a) })));
    check('(13) qua tầng: lính giữ nguyên máu +75 và bậc 5', keep.length === 1 && keep[0].hpMax === mk.hp + 75 && keep[0].rank === 5, JSON.stringify(keep));
    // Buff Thú Cưng (+35 máu) cộng đúng: bậc suy từ hpBonus
    const pet = await ev(() => { const G = SK.G, p = G.player; SK.livingMercs(G).forEach(a => { a.gone = true; }); G.mercs = []; const a = SK.addMercenary(G, p, 'npc_02', p.x, p.y, { hired: true, armed: true, hpBonus: 35 }); return { rank0: SK_ROOMS.dnpc.rankOf(a) }; });
    check('(14) lính có Buff Thú Cưng (+35) chưa học thì bậc 0', pet.rank0 === 0, JSON.stringify(pet));
    // trọng số phòng: có lính đã thuê thì phòng lính thuê tắt, thầy huấn luyện 75
    const wt = await ev(() => ({ merc: SK_ROOMS.mercRoomAllowed(), t: SK_ROOMS.extra.trainer.weight() }));
    check('(15) có lính đã thuê còn sống: phòng lính thuê tắt, trọng số thầy huấn luyện = 75', !wt.merc && wt.t === 75, JSON.stringify(wt));

    // ================================================================ xuất hiện tự nhiên theo trọng số
    const tally = await ev(() => {
      const out = {}, G = SK.G;
      Object.assign(SK_ROOMS.force, { chest: null, special: null, statue: null, merc: null });
      for (let i = 0; i < 30; i++) {
        SK_GAME.debug.seed(1000 + i);
        for (const lb of ['1-3', '1-4', '2-2']) {
          SK_GAME.debug.stage(lb);
          for (const r of G.map.rooms) if (r.type === 'special') out[r.fill] = (out[r.fill] || 0) + 1;
        }
      }
      return out;
    });
    const tot = Object.values(tally).reduce((a, v) => a + v, 0);
    check('(16) phòng đặc biệt sinh tự nhiên (90 ải): có cả Lò Đúc Lại, Lò Khởi Nguyên, Lò Dung Hợp', tally.furnace > 0 && tally.furnace_inverse > 0 && tally.furnace_fuse > 0, JSON.stringify(tally) + ' · tổng ' + tot);
    // lò dung hợp chỉ từ ải 1-4 (loại 0 > 2): ở 1-3 / 1-2 / 1-1 không bốc
    const early = await ev(() => {
      const out = {}, G = SK.G;
      Object.assign(SK_ROOMS.force, { chest: null, special: null, statue: null, merc: null });
      for (let i = 0; i < 40; i++) {
        SK_GAME.debug.seed(2000 + i);
        SK_GAME.debug.stage('1-3');
        for (const r of G.map.rooms) if (r.type === 'special') out[r.fill] = (out[r.fill] || 0) + 1;
      }
      return out;
    });
    check('(17) ở 1-3 không bốc Lò Dung Hợp (điều kiện ải ≥ 1-4)', !early.furnace_fuse && (early.furnace || 0) + (early.furnace_inverse || 0) > 0, JSON.stringify(early));

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
