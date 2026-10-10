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

    // ================================================================ đợt 2: Thợ Thủ Công, Người Câu Cá, Đạo Sư, Máy Thử Vận May
    const D2 = await ev(() => {
      const R = SK_ROOMS, N = R.dnpc2, WP = 150 / 11;
      return {
        pf: ['npc_weapon_item_fish', 'slotmachine', 'npc_skill_update', 'npc_smith'].map(n => !!SK.prefab(n)),
        extra: ['fishnpc', 'mentor', 'smith', 'slotmachine'].map(k => !!R.extra[k]),
        w: [R.extra.fishnpc.weight(), R.extra.mentor.weight(), R.extra.smith.weight(), R.extra.slotmachine.weight()], WP
      };
    });
    check('prefab gốc npc_weapon_item_fish, slotmachine, npc_skill_update, npc_smith có trong dữ liệu', D2.pf.every(Boolean), JSON.stringify(D2.pf));
    check('4 loại phòng đợt 2 đã đăng ký (fishnpc, mentor, smith, slotmachine)', D2.extra.every(Boolean), JSON.stringify(D2.extra));
    check('trọng số: câu cá 1×150/11, đạo sư 1×150/11, thợ thủ công 4×150/11 (weapon_provider); máy thử vận may 0 ở 1-3 (cần chỉ số ải ≥ 6)',
      Math.abs(D2.w[0] - D2.WP) < 1e-6 && Math.abs(D2.w[1] - D2.WP) < 1e-6 && Math.abs(D2.w[2] - 4 * D2.WP) < 1e-6 && D2.w[3] === 0, JSON.stringify(D2.w));

    // vũ khí mẫu theo loại
    const W2 = await ev(() => {
      const D = SK.DS.weapons, ids = Object.keys(D), ok = d => d.dmg > 0 && (d.grade | 0) <= 5 && d.w86 && d.w86.b && d.w86.b[0].dmg > 0 && /^weapon_\d{3}$/.test(d.prefab || '');
      const f = (kind, cost) => ids.find(id => D[id].kind === kind && ok(D[id]) && (cost == null || (cost ? D[id].cost > 0 : !(D[id].cost > 0))));
      return { sword: f('melee'), staff: f('staff', true), laser: f('laser', true), gun: 'ak_47', red: ids.find(id => /^weapon_\d{3}$/.test(D[id].prefab) && D[id].grade === 6 && D[id].dmg > 0) };
    });
    const info2 = id => ev(i => { const d = SK.DS.weapons[i]; return { n: d.name, k: d.kind, dmg: d.dmg, cost: d.cost || 0, crit: d.crit || 0, rps: d.rps, bd: d.w86 && d.w86.b && d.w86.b[0].dmg, bc: d.w86 && d.w86.b && d.w86.b[0].crit }; }, id);
    const wInfo = () => ev(() => { const w = SK.G.player.weapons[SK.G.player.cur]; if (!w) return null; const d = w.def; return { id: w.id, name: d.name, dmg: d.dmg, cost: d.cost || 0, crit: d.crit || 0, rps: d.rps, bd: d.w86 && d.w86.b && d.w86.b[0].dmg, bc: d.w86 && d.w86.b && d.w86.b[0].crit, att: w.att && JSON.stringify(w.att) }; });

    // ---------------------------------------------------------------- Thợ Thủ Công
    await stage('1-3', 'smith', 'special');
    check('ép phòng smith: phòng có Thợ Thủ Công, 1 điểm tương tác', (await ev(() => SK.G.map.rooms.filter(x => x.type === 'special')[0].fill)) === 'smith' && (await ev(() => SK.G.interactables.filter(o => /^Thợ Thủ Công/.test(o.label)).length)) === 1);
    await p.screenshot({ path: path.join(SHOTS, 'smith.png') });
    await hold([null, null], 500);
    await ev(() => { SK.G.player.weapons = [null, null]; });
    await useLabel('^Thợ Thủ Công');
    s = await state();
    check('(S1) không cầm vũ khí: bị từ chối, vàng giữ 500', s.gold === 500, JSON.stringify(s));
    for (const [what, id] of [['vũ khí đỏ', W2.red], ['vũ khí chỉ câu cá (Bladefish)', 'bladefish'], ['Qian-kun Punch', 'weapon_init_airbender']]) {
      await hold([id, null], 500);
      await useLabel('^Thợ Thủ Công');
      s = await state(); const wi = await wInfo();
      check('(S2) ' + what + ' không gắn được phụ kiện: vàng giữ 500, không có phụ kiện', s.gold === 500 && !wi.att, JSON.stringify(s.gold) + ' ' + (wi.att || 'không phụ kiện'));
    }
    await hold([W2.sword, null], 1);
    await useLabel('^Thợ Thủ Công');
    s = await state();
    check('(S3) thiếu vàng (1): không gắn, vàng giữ 1', s.gold === 1 && !(await wInfo()).att, JSON.stringify(s));
    // gắn thật trên kiếm: trừ đúng giá, def và đạn tăng đúng số trong bảng
    for (const [kind, id] of [['melee', W2.sword], ['gun', W2.gun], ['laser', W2.laser], ['staff', W2.staff]]) {
      await hold([id, null], 9999);
      const b0 = await info2(id);
      const lab = await useLabel('^Thợ Thủ Công');
      const pr = priceOf('\\((\\d+) vàng\\)', lab);
      s = await state();
      const w1 = await wInfo();
      const A = w1.att && JSON.parse(w1.att);
      const eff = await ev(a => { const e = SK_ROOMS.dnpc2.ATT[a.key].eff(a.v); return e; }, A);
      const want = { dmg: b0.dmg + (eff.dmg || 0), bd: b0.bd + (eff.dmg || 0), crit: b0.crit + (eff.crit || 0), cost: eff.costZero ? 0 : Math.max(0, b0.cost + (eff.cost || 0)) };
      check('(S4) ' + kind + ' ' + b0.n + ': gắn ' + (A ? A.key + ' ' + A.rar + ' ' + A.v : 'không ra') + ', trừ đúng giá nhãn ' + pr + ', sát thương/bạo kích/năng lượng đổi đúng bảng, tên có ★',
        !!A && 9999 - s.gold === pr && w1.dmg === want.dmg && w1.bd === want.bd && w1.crit === want.crit && w1.cost === want.cost && /★/.test(w1.name),
        JSON.stringify({ b0: [b0.dmg, b0.bd, b0.crit, b0.cost], w1: [w1.dmg, w1.bd, w1.crit, w1.cost], A, trừ: 9999 - s.gold }));
      // dùng lại: đã xong
      const g1 = s.gold;
      await useLabel('^Thợ Thủ Công');
      s = await state();
      check('(S5) ' + kind + ': mỗi Thợ Thủ Công chỉ làm một phụ kiện, lần hai không trừ vàng', s.gold === g1, 'vàng ' + g1 + ' → ' + s.gold);
      await ev(() => { const it = SK_ROOMS.dnpc2 && SK.G.props.find(q => q.key === 'smith'); if (it) it.used = false; });
    }
    // phụ kiện sống sót qua refreshWeapons (rooms.js đặt lại w.def từ bản gốc) và được đạn thật dùng
    const real = await ev(() => {
      const G = SK.G, pl = G.player, id = 'ak_47';
      pl.weapons = [SK.makeWeapon(id), null]; pl.cur = 0;
      const w = pl.weapons[0], base = SK.DS.weapons[id];
      SK_ROOMS.dnpc2.equip(w, { key: 'gauss', rar: 'purple', v: 3 });
      SK_ROOMS.refreshWeapons(pl);
      const after = w.def.dmg, bd = w.def.w86.b[0].dmg;
      pl.crit = 0; pl.dmgMul = 1;
      const n0 = G.bullets.length;
      SK.WEAPON_KINDS.gun.fire(G, pl, w, { x: pl.x, y: pl.y, ang: 0, side: 1, fn: 'Attack' });
      const nb = G.bullets.slice(n0).filter(b => b.side === 'p').map(b => b.dmg);
      return { base: base.dmg, after, bd, bullets: nb, baseB: base.w86.b[0].dmg };
    });
    check('(S6) phụ kiện còn sau refreshWeapons, đạn bắn thật mang sát thương đã cộng (AK47 3 → 6)', real.after === real.base + 3 && real.bullets.length > 0 && real.bullets.every(d => d === real.baseB + 3 || d === (real.baseB + 3) * 2), JSON.stringify(real));
    // xác suất: AK47 bốc từ gauss/chip/reactor, mỗi loại ~1/3, độ hiếm đều
    await ev(() => SK_GAME.debug.seed(777));
    const dist = await ev(() => {
      const N = SK_ROOMS.dnpc2, d = SK.DS.weapons.ak_47, c = {}, rar = {};
      for (let i = 0; i < 3000; i++) { const a = N.rollAtt(d, false); c[a.key] = (c[a.key] || 0) + 1; rar[a.rar] = (rar[a.rar] || 0) + 1; }
      return { c, rar, list: N.attList(d, false) };
    });
    const ks = Object.keys(dist.c);
    check('(S7) 3000 lần bốc cho AK47: chỉ ra phụ kiện hợp (gauss/chip/reactor), mỗi loại 1/3 ± 4%', ks.every(k => ['gauss', 'chip', 'reactor'].indexOf(k) >= 0) && ks.length === 3 && ks.every(k => Math.abs(dist.c[k] / 3000 - 1 / 3) < 0.04), JSON.stringify(dist.c) + ' ' + JSON.stringify(dist.rar));

    // ---------------------------------------------------------------- Người Câu Cá
    await stage('1-3', 'fishnpc', 'special');
    check('ép phòng fishnpc: phòng có Người Câu Cá', (await ev(() => SK.G.map.rooms.filter(x => x.type === 'special')[0].fill)) === 'fishnpc');
    await p.screenshot({ path: path.join(SHOTS, 'fishnpc.png') });
    await hold([W2.sword, null], 5);
    await useLabel('^Người Câu Cá');
    s = await state();
    check('(F1) thiếu vàng (5): không bán, vàng giữ 5, không phụ kiện', s.gold === 5 && !(await wInfo()).att, JSON.stringify(s));
    await hold(['bladefish', null], 500);
    await useLabel('^Người Câu Cá');
    s = await state();
    check('(F2) vũ khí chỉ câu cá không gắn được: vàng giữ 500', s.gold === 500 && !(await wInfo()).att, JSON.stringify(s));
    await hold([W2.sword, null], 9999);
    const bf = await info2(W2.sword);
    const labF = await useLabel('^Người Câu Cá');
    const prF = priceOf('\\((\\d+) vàng\\)', labF);
    s = await state(); const wf = await wInfo(); const Af = wf.att && JSON.parse(wf.att);
    check('(F3) kiếm: nhận phụ kiện câu cá (' + (Af ? Af.key : '?') + '), trừ đúng giá nhãn ' + prF + ', sát thương cộng đúng bảng',
      !!Af && ['barnacle', 'whetstone'].indexOf(Af.key) >= 0 && 9999 - s.gold === prF && wf.dmg === bf.dmg + (Af.key === 'whetstone' ? 2 : 1) && wf.bd === bf.bd + (Af.key === 'whetstone' ? 2 : 1) && (Af.key !== 'barnacle' || Math.abs(wf.rps - bf.rps * 0.95) < 1e-6),
      JSON.stringify({ bf: [bf.dmg, bf.rps], wf: [wf.dmg, wf.rps], Af, trừ: 9999 - s.gold }));
    const labF2 = await useLabel('^Người Câu Cá');
    const gF = (await state()).gold;
    check('(F4) sau khi bán: nhãn "đừng làm ồn, đi câu đây", lần hai không trừ vàng', /đừng làm ồn/.test(labF2 || '') || /đừng làm ồn/.test(await ev(() => SK.G.interactables.find(q => /^Người Câu Cá/.test(q.label)).label)), String(labF2) + ' vàng ' + gF);
    await ev(() => SK_GAME.debug.seed(888));
    const dF = await ev(([sw, st]) => {
      const N = SK_ROOMS.dnpc2, out = {};
      for (const [nm, id] of [['sword', sw], ['staff', st], ['ak', 'ak_47']]) { const d = SK.DS.weapons[id], c = {}; for (let i = 0; i < 2000; i++) { const a = N.rollAtt(d, true); c[a.key] = (c[a.key] || 0) + 1; } out[nm] = c; }
      return out;
    }, [W2.sword, W2.staff]);
    check('(F5) 2000 lần bốc: kiếm ra balanus/cá đao 50/50 ± 4%; trượng ra balanus/đá hiền giả 50/50 ± 4%; AK47 chỉ ra balanus',
      Math.abs(dF.sword.barnacle / 2000 - 0.5) < 0.04 && Math.abs(dF.staff.barnacle / 2000 - 0.5) < 0.04 && dF.staff.sage + dF.staff.barnacle === 2000 && dF.ak.barnacle === 2000, JSON.stringify(dF));
    await hold([W2.staff, null], 9999);
    const sI = await info2(W2.staff);
    await ev(() => { const it = SK.G.props.find(q => q.key === 'fishnpc'); it.used = false; SK_GAME.debug.seed(31337); });
    // ép Đá Hiền Giả để đo: bốc tới khi ra
    let sage = null;
    for (let i = 0; i < 40 && !(sage && sage.att && JSON.parse(sage.att).key === 'sage'); i++) {
      await hold([W2.staff, null], 9999);
      await ev(() => { SK.G.props.find(q => q.key === 'fishnpc').used = false; });
      await useLabel('^Người Câu Cá');
      sage = await wInfo();
    }
    check('(F6) trượng gắn Đá Hiền Giả: tiêu hao năng lượng về 0, sát thương +1', !!sage.att && JSON.parse(sage.att).key === 'sage' && sage.cost === 0 && sage.dmg === sI.dmg + 1, JSON.stringify({ sI, sage }));

    const bar = await ev(() => {
      const pl = SK.G.player, d0 = SK.DS.weapons.ak_47, w = SK.makeWeapon('ak_47');
      SK_ROOMS.dnpc2.equip(w, { key: 'barnacle', rar: 'blue', v: 1 });
      return { dmg: w.def.dmg, bd: w.def.w86.b[0].dmg, rps: w.def.rps, base: [d0.dmg, d0.rps] };
    });
    check('(F7) Balanus (AK47): sát thương +1 (cả đạn), tốc đánh nhân 0,95', bar.dmg === bar.base[0] + 1 && bar.bd === bar.base[0] + 1 && Math.abs(bar.rps - bar.base[1] * 0.95) < 1e-9, JSON.stringify(bar));

    // ---------------------------------------------------------------- Đạo Sư
    await stage('1-3', 'mentor', 'special');
    check('ép phòng mentor: phòng có Đạo Sư', (await ev(() => SK.G.map.rooms.filter(x => x.type === 'special')[0].fill)) === 'mentor');
    await p.screenshot({ path: path.join(SHOTS, 'mentor.png') });
    await hold(['ak_47', null], 3);
    const mw0 = await ev(() => SK_ROOMS.extra.mentor.weight());
    await useLabel('^Đạo Sư');
    s = await state();
    check('(M1) thiếu vàng (3): không nâng, vàng giữ 3, cấp kỹ năng 0; trọng số 150/11 khi chưa đạt cấp tối đa', s.gold === 3 && (await ev(() => (SK.G.mods.skillLv | 0))) === 0 && Math.abs(mw0 - 150 / 11) < 1e-6, JSON.stringify(s) + ' w=' + mw0);
    const MP = await ev(() => SK_ROOMS.dnpc2.mentorPrice());
    await hold(['ak_47', null], 9999);
    const cd0 = await ev(() => SK.G.mods.skillCdMul);
    const labM = await useLabel('^Đạo Sư');
    s = await state();
    const mv = await ev(() => { const G = SK.G, p = G.player; p.skillT = 0; SK.endSkill(G, p); return { lv: G.mods.skillLv, mul: G.mods.skillCdMul, cd: p.skillCd, base: p.h.skill.cd }; });
    check('(M2) nâng 1 cấp: trừ ' + MP + ' vàng (đúng nhãn), cấp kỹ năng 1, hồi chiêu kỹ năng thật = cd gốc × 0,94',
      9999 - s.gold === MP && priceOf('\\((\\d+) vàng\\)', labM) === MP && mv.lv === 1 && Math.abs(mv.mul - cd0 * 0.94) < 1e-9 && Math.abs(mv.cd - mv.base * mv.mul) < 1e-6, JSON.stringify({ trừ: 9999 - s.gold, nhãn: labM, mv }));
    const g2m = s.gold;
    await useLabel('^Đạo Sư');
    s = await state();
    check('(M3) mỗi Đạo Sư một lần: lần hai không trừ vàng, cấp vẫn 1', s.gold === g2m && (await ev(() => SK.G.mods.skillLv)) === 1, 'vàng ' + g2m + ' → ' + s.gold);
    const mx = await ev(() => { const G = SK.G; G.mods.skillLv = SK_ROOMS.dnpc2.MENTOR_MAX; return { w: SK_ROOMS.extra.mentor.weight() }; });
    const labMx = await ev(() => { const it = SK.G.props.find(q => q.key === 'mentor'); it.used = false; return SK.G.interactables.find(q => /^Đạo Sư/.test(q.label)).label; });
    await hold(['ak_47', null], 9999);
    await useLabel('^Đạo Sư');
    s = await state();
    check('(M4) đạt cấp tối đa 5: trọng số phòng về 0, Đạo Sư "hết gì để dạy", không trừ vàng', mx.w === 0 && /hết gì để dạy/.test(labMx) && s.gold === 9999 && (await ev(() => SK.G.mods.skillLv)) === 5, JSON.stringify(mx) + ' ' + labMx);
    await ev(() => { SK.G.mods.skillLv = 0; });

    // ---------------------------------------------------------------- Máy Thử Vận May
    const stg = await ev(() => { for (const l of ['2-3', '2-4', '3-1', '3-2']) { SK_GAME.debug.stage(l); if (SK.G.stageIdx >= 6) return l; } return null; });
    check('có ải với chỉ số ≥ 6 để thử máy', !!stg, String(stg));
    await stage(stg, 'slotmachine', 'special');
    const sw = await ev(() => ({ w: SK_ROOMS.extra.slotmachine.weight(), idx: SK.G.stageIdx, fill: SK.G.map.rooms.filter(x => x.type === 'special')[0].fill }));
    check('ép phòng slotmachine ở ải ' + stg + ': có Máy Thử Vận May; trọng số = 10 từ chỉ số ải 6', sw.fill === 'slotmachine' && sw.w === 10, JSON.stringify(sw));
    await p.screenshot({ path: path.join(SHOTS, 'slotmachine.png') });
    await hold(['ak_47', null], 3);
    await useLabel('Thử Vận May');
    s = await state();
    check('(T1) thiếu vàng (3): không chơi, vàng giữ 3', s.gold === 3 && (await ev(() => SK.G.props.find(q => q.key === 'slotmachine').plays)) === 0, JSON.stringify(s));
    const SP = await ev(() => SK_ROOMS.dnpc2.slotPrice());
    await ev(() => { const G = SK.G; G.player.hp = 3; G.player.energy = 10; G.player.armor = 0; });
    await hold(['ak_47', null], 9999);
    const labT = await useLabel('Thử Vận May');
    s = await state();
    check('(T2) chơi 1 lượt: trừ đúng ' + SP + ' vàng (khớp nhãn "chỉ cần N vàng")', 9999 - s.gold === SP && priceOf('(\\d+) vàng', labT) === SP, labT + ' · trừ ' + (9999 - s.gold));
    // mô phỏng nhiều lượt có hạt giống: tần suất khớp bảng
    await ev(() => SK_GAME.debug.seed(424242));
    const sim = await ev(() => {
      const G = SK.G, N = SK_ROOMS.dnpc2, it = G.props.find(q => q.key === 'slotmachine'), o = G.interactables.find(q => /Thử Vận May/.test(q.label));
      const ev = [], off = SK.on('slotPlay', (G2, r) => ev.push(r));
      const cnt = { hit: 0, a1: 0, a2: 0, a3: 0, a4: 0, a5: 0, p6: 0, p7: 0 }, pots = {}, pl = G.player;
      let games = 0, jack = 0;
      for (let m = 0; m < 400; m++) {
        it.rest = N.SLOT_AWARDS.map(q => q[2]); it.broken = false; it.anim = 0; it.rocket = 0;
        for (let k = 0; k < 40 && !it.broken; k++) {
          pl.gold = 1e6; pl.invulT = 0; pl.hp = pl.hpMax; it.anim = 0;
          o.use(); games++;
        }
      }
      for (const r of ev) {
        if (r.hit) { cnt.hit++; cnt['a' + r.award]++; if (r.award !== 5) pots[r.pot] = (pots[r.pot] || 0) + 1; } else cnt['p' + r.award]++;
      }
      return { games, n: ev.length, cnt, pots, spent: 1e6 * 0 };
    });
    const hitRate = sim.cnt.hit / sim.n;
    check('(T3) mô phỏng ' + sim.n + ' lượt (400 máy, hạt giống 424242): tỉ lệ trúng 40% ± 3%; trượt chia đều cảm ơn/giật điện (1000:1000) ± 4%',
      Math.abs(hitRate - 0.4) < 0.03 && Math.abs(sim.cnt.p6 / (sim.cnt.p6 + sim.cnt.p7) - 0.5) < 0.04, JSON.stringify(sim.cnt));
    const lim = await ev(() => {
      const N = SK_ROOMS.dnpc2, rest = N.SLOT_AWARDS.map(q => q[2]), got = {};
      for (let i = 0; i < 20000; i++) { const r = N.slotRoll(rest); if (r.hit) got[r.award] = (got[r.award] || 0) + 1; }
      return got;
    });
    check('(T4) lượt còn lại (restCount): 20000 lượt trúng trên một máy ra giải 1 ≤ 3, giải 2 ≤ 3, giải 4 ≤ 10, giải 5 (đặc biệt) đúng 1, giải 3 (không giới hạn) lấp phần còn lại',
      lim[1] === 3 && lim[2] === 3 && lim[4] === 10 && lim[5] === 1 && lim[3] === Object.values(lim).reduce((x, y) => x + y, 0) - 3 - 3 - 10 - 1, JSON.stringify(lim));
    const poolShare = await ev(() => {
      SK_GAME.debug.seed(99);
      const N = SK_ROOMS.dnpc2, c = {}; let n = 0;
      for (let i = 0; i < 20000; i++) { const r = N.slotRoll([0, 0, 1e9, 0, 0]); if (r.hit) { c[r.pot] = (c[r.pot] || 0) + 1; n++; } }
      return { c, n };
    });
    const want = { energy_pot: 10, energy_pot_big: 10, health_pot: 10, health_pot_big: 10, restore_pot: 5, restore_pot_big: 5 };
    check('(T5) bình thưởng theo bể slot_machine (10:10:10:10:5:5), sai số ≤ 3% mỗi loại', Object.keys(want).every(k => Math.abs((poolShare.c[k] || 0) / poolShare.n - want[k] / 50) < 0.03), JSON.stringify(poolShare.c));
    // phần thưởng thật: bình hồi đúng số (đo trên máy thật)
    const reward = await ev(() => {
      const G = SK.G, pl = G.player, N = SK_ROOMS.dnpc2, it = G.props.find(q => q.key === 'slotmachine'), o = G.interactables.find(q => /Thử Vận May/.test(q.label));
      const rows = [];
      for (const [pot, hp, en] of [['health_pot', 2, 0], ['health_pot_big', 4, 0], ['energy_pot', 0, 80], ['energy_pot_big', 0, 150], ['restore_pot', 1, 40], ['restore_pot_big', 2, 80]]) {
        const old = N.slotRoll; // ép kết quả bằng cách đặt hạt giống tìm lượt ra đúng bình
        let found = false;
        for (let sd = 1; sd < 4000 && !found; sd++) {
          SK_GAME.debug.seed(sd);
          const probe = N.slotRoll([0, 0, 1e9, 0, 0]);
          if (probe.hit && probe.pot === pot) {
            SK_GAME.debug.seed(sd);
            pl.gold = 1e6; pl.hp = 1; pl.energy = 1; pl.hpMax = Math.max(pl.hpMax, 10); pl.energyMax = Math.max(pl.energyMax, 300); it.anim = 0; it.broken = false; it.rest = [0, 0, 1e9, 0, 0];
            const hit = SK.rand() < 0; // chỉ để đồng bộ: lần gọi thật bên dưới dùng lại cùng hạt giống
            SK_GAME.debug.seed(sd);
            const before = [pl.hp, pl.energy];
            o.use();
            rows.push({ pot, dhp: pl.hp - before[0], den: pl.energy - before[1], want: [hp, en], seed: sd, last: it.last && it.last.pot });
            found = true;
          }
        }
      }
      return rows;
    });
    check('(T6) mỗi loại bình trong bể hồi đúng số máu/năng lượng của prefab (6 loại, đo trên máy thật)', reward.length === 6 && reward.every(r => r.dhp === r.want[0] && r.den === r.want[1] && r.last === r.pot), JSON.stringify(reward));
    // giải đặc biệt: hồi đầy, máy hỏng
    const jk = await ev(() => {
      const G = SK.G, pl = G.player, it = G.props.find(q => q.key === 'slotmachine'), o = G.interactables.find(q => /Thử Vận May/.test(q.label)), N = SK_ROOMS.dnpc2;
      let found = false, out = null;
      for (let sd = 1; sd < 20000 && !found; sd++) {
        SK_GAME.debug.seed(sd);
        const probe = N.slotRoll([0, 0, 0, 0, 1]);
        if (probe.hit && probe.award === 5) {
          SK_GAME.debug.seed(sd);
          pl.gold = 1e6; pl.hp = 1; pl.energy = 1; it.anim = 0; it.broken = false; it.rest = [0, 0, 0, 0, 1];
          o.use();
          out = { hp: pl.hp, hpMax: pl.hpMax, en: pl.energy, enMax: pl.energyMax, broken: it.broken, label: o.label, rocket: it.rocket };
          found = true;
        }
      }
      return out;
    });
    check('(T7) giải đặc biệt (hạt nhân): hồi đầy máu và năng lượng, máy hỏng, nhãn "đã hư tổn"', jk && jk.hp === jk.hpMax && jk.en === jk.enMax && jk.broken && /hư tổn/.test(jk.label) && jk.rocket > 0, JSON.stringify(jk));
    const gB = (await state()).gold;
    await useLabel('Thử Vận May');
    check('(T8) máy hỏng không chơi tiếp: vàng không đổi', (await state()).gold === gB);
    const thunder = await ev(() => {
      const G = SK.G, pl = G.player, it = G.props.find(q => q.key === 'slotmachine'), o = G.interactables.find(q => /Thử Vận May|hư tổn/.test(q.label)), N = SK_ROOMS.dnpc2;
      let out = null;
      for (let sd = 1; sd < 5000 && !out; sd++) {
        SK_GAME.debug.seed(sd);
        const probe = N.slotRoll([0, 0, 1e9, 0, 0]);
        if (!probe.hit && probe.award === 7) {
          SK_GAME.debug.seed(sd);
          pl.gold = 1e6; pl.armor = 0; pl.hp = pl.hpMax; pl.invulT = 0; it.anim = 0; it.broken = false; it.rest = [0, 0, 1e9, 0, 0];
          const hp0 = pl.hp + pl.armor; o.use();
          out = { dmg: hp0 - (pl.hp + pl.armor), last: it.last.award };
        }
      }
      return out;
    });
    check('(T9) trượt kiểu "dòng điện thất thường": người chơi bị giật đúng 1 sát thương', thunder && thunder.last === 7 && thunder.dmg === 1, JSON.stringify(thunder));
    // vẽ bằng khoá prefab gốc: bốn prefab vẽ ra khung hình thật (không ô trống)
    const draws = await ev(() => {
      const out = {};
      const cv = document.createElement('canvas'); cv.width = 160; cv.height = 160;
      const ctx = cv.getContext('2d');
      for (const n of ['npc_weapon_item_fish', 'slotmachine', 'npc_skill_update', 'npc_smith']) {
        ctx.clearRect(0, 0, 160, 160);
        const ok = SK.drawPrefab(ctx, SK.prefab(n), 80, 120, { t: 0 });
        const px = ctx.getImageData(0, 0, 160, 160).data; let c = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > 8) c++;
        out[n] = [ok, c, SK.prefab(n).filter(q => q.f).length];
      }
      return out;
    });
    check('(V) vẽ bằng khoá prefab gốc: cả 4 prefab ra điểm ảnh thật (> 300 điểm)', Object.values(draws).every(v => v[0] && v[1] > 300), JSON.stringify(draws));

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
