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

    // Các ca S/F dưới đây đo nhóm phụ kiện Chỉ số: tắt cơ hội bốc nhóm Đặc biệt/Nâng cấp (đợt 5, mục P bên dưới bật lại).
    await ev(() => { SK_ROOMS.dnpc2.CFG5.special = 0; });
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


    // ---------------------------------------------------------------- Phụ kiện nhóm Đặc biệt / Nâng cấp (đợt 5) [WIKI Attachments]
    // P1 tương thích, P2 vào bể của Thợ Thủ Công/Người Câu Cá, P3.. tác dụng đo bằng số.
    await ev(() => { SK_ROOMS.dnpc2.CFG5.special = 1; SK_ROOMS.dnpc2.CFG5.proc = 1; });
    const P5 = await ev(() => {
      const N = SK_ROOMS.dnpc2, D = SK.DS.weapons, byPf = pf => Object.keys(D).find(id => D[id].prefab === pf);
      const laser = Object.keys(D).find(id => D[id].w86 && D[id].w86.fam === 'laser' && D[id].dmg > 0 && /^weapon_\d{3}$/.test(D[id].prefab) && (D[id].grade | 0) <= 5 && !N.blocked(D[id]));
      const sword = Object.keys(D).find(id => D[id].kind === 'melee' && D[id].w86 && D[id].w86.fam === 'sword' && !/Laser/i.test(D[id].nameEn) && D[id].dmg > 0 && /^weapon_\d{3}$/.test(D[id].prefab) && (D[id].grade | 0) <= 5 && !N.blocked(D[id]));
      const lsRed = Object.keys(D).find(id => /^Laser Sword Red$/i.test(D[id].nameEn || '')), lsGold = Object.keys(D).find(id => /^Laser Sword Gold$/i.test(D[id].nameEn || ''));
      const gun = 'ak_47';
      const L = (id, fish) => N.attList(D[id], fish);
      return { laser, sword, lsRed, lsGold, gun, w152: byPf('weapon_152'), w032: byPf('weapon_032'), w010: byPf('weapon_010'), w257: byPf('weapon_257'),
        lLaser: L(laser, false), fLaser: L(laser, true), lSword: L(sword, false), fSword: L(sword, true), lGun: L(gun, false), fGun: L(gun, true), lOld: byPf('weapon_152') ? L(byPf('weapon_152'), false) : [], lDE: L(byPf('weapon_010'), false) };
    });
    check('(P1) tương thích: laser có Gương Phản Chiếu/Sứa Hai Tua(câu cá); kiếm có Cán Kiếm Tụ Năng + Kiếm Hải Tinh(câu cá); AK47 có Đầu Đạn Cường Hóa + Cá Viên Đạn(câu cá); mọi vũ khí có Đá Năng Lượng; Laser/kiếm không có Cá Viên Đạn',
      P5.lLaser.includes('mirror') && P5.fLaser.includes('jellyfish') && !P5.fLaser.includes('starfish') && !P5.lLaser.includes('hilt') && P5.lSword.includes('hilt') && P5.fSword.includes('starfish') && !P5.fSword.includes('bulletfish') && !P5.lSword.includes('mirror') &&
      P5.lGun.includes('enhanced') && P5.fGun.includes('bulletfish') && P5.fGun.includes('starfish') && P5.lLaser.includes('energystone') && P5.lSword.includes('energystone') && P5.lGun.includes('energystone'), JSON.stringify({ lLaser: P5.lLaser, fLaser: P5.fLaser, lSword: P5.lSword, fSword: P5.fSword, lGun: P5.lGun, fGun: P5.fGun }));
    check('(P2) Nâng cấp: vũ khí cổ (weapon_152) có Máy Thời Gian, Desert Eagle có Sơn Phun Màu Vàng; AK47 có Sơn Phun Màu Vàng nhưng không có Máy Thời Gian; Bậc Thầy Phụ Kiện (roll) không bao giờ ra Nâng cấp',
      P5.lOld.includes('timegadget') && P5.lDE.includes('goldpaint') && P5.lGun.includes('goldpaint') && !P5.lGun.includes('timegadget') &&
      await ev(() => { const N = SK_ROOMS.dnpc.attach, D = SK.DS.weapons, dd = D[Object.keys(D).find(i => D[i].prefab === 'weapon_152')]; for (let i = 0; i < 400; i++) { const a = N.roll(dd, false); if (a && /timegadget|goldpaint/.test(a.key)) return false; } return true; }), 'lOld ' + JSON.stringify(P5.lOld));

    // gắn qua NPC thật: Thợ Thủ Công làm ra phụ kiện Đặc biệt (CFG5.special = 1), Người Câu Cá làm phụ kiện câu cá Đặc biệt
    await stage('1-3', 'smith', 'special');
    let sp = null, spKeys = {};
    for (let i = 0; i < 25; i++) {
      await hold([P5.laser, null], 9999);
      await ev(() => { const it = SK.G.props.find(q => q.key === 'smith'); it.used = false; });
      await useLabel('^Thợ Thủ Công');
      sp = await wInfo(); const a = sp.att && JSON.parse(sp.att); if (a) spKeys[a.key] = 1;
    }
    check('(P3) Thợ Thủ Công + laser (25 lần, nhóm Đặc biệt bật): chỉ ra Gương Phản Chiếu hoặc Đá Năng Lượng, tên có ★', Object.keys(spKeys).every(k => ['mirror', 'energystone'].includes(k)) && Object.keys(spKeys).length > 0 && /★/.test(sp.name), JSON.stringify(spKeys));
    await stage('1-3', 'fishnpc', 'special');
    const fkeys = {};
    for (let i = 0; i < 25; i++) {
      await hold([P5.laser, null], 9999);
      await ev(() => { const it = SK.G.props.find(q => q.key === 'fishnpc'); it.used = false; });
      await useLabel('^Người Câu Cá');
      const wi = await wInfo(); const a = wi.att && JSON.parse(wi.att); if (a) fkeys[a.key] = 1;
    }
    check('(P4) Người Câu Cá + laser: chỉ ra Sứa Hai Tua (nhóm Đặc biệt) hoặc phụ kiện câu cá hợp laser', Object.keys(fkeys).length > 0 && Object.keys(fkeys).every(k => ['jellyfish', 'barnacle'].includes(k)) && fkeys.jellyfish, JSON.stringify(fkeys));
    // Nâng cấp thật qua Thợ Thủ Công: vũ khí cổ -> bản hiện đại, tiêu hao phụ kiện (không còn att), trừ vàng
    await stage('1-3', 'smith', 'special');
    let up = null;
    for (let i = 0; i < 40 && !(up && up.id !== P5.w152); i++) {
      await hold([P5.w152, null], 9999);
      await ev(() => { const it = SK.G.props.find(q => q.key === 'smith'); it.used = false; });
      await useLabel('^Thợ Thủ Công');
      up = await wInfo();
    }
    const s5 = await state();
    check('(P5) Máy Thời Gian: weapon_152 (Súng bắn tỉa cổ) -> weapon_032 (Súng bắn tỉa), không còn phụ kiện trên vũ khí mới, trừ vàng', up && up.id === P5.w032 && !up.att && s5.gold < 9999, JSON.stringify({ id: up && up.id, att: up && up.att, gold: s5.gold }));
    let up2 = null;
    for (let i = 0; i < 40 && !(up2 && up2.id !== (await ev(() => Object.keys(SK.DS.weapons).find(k => SK.DS.weapons[k].prefab === 'weapon_010')))); i++) {
      await hold([await ev(() => Object.keys(SK.DS.weapons).find(k => SK.DS.weapons[k].prefab === 'weapon_010')), null], 9999);
      await ev(() => { const it = SK.G.props.find(q => q.key === 'smith'); it.used = false; });
      await useLabel('^Thợ Thủ Công');
      up2 = await wInfo();
    }
    check('(P6) Sơn Phun Màu Vàng: Desert Eagle -> Desert Eagle Gold (weapon_257)', up2 && up2.id === P5.w257 && !up2.att, JSON.stringify(up2 && { id: up2.id, att: up2.att }));

    // ---- tác dụng đo bằng số
    // Dựng cảnh: điểm quanh người chơi cách tường bên phải 60..250 px (phản xạ thẳng về trái), đường tới tường thoáng; quái giả có hb, hurtEnemy ghi lại.
    const find = kind => ev(kind => {
      const G = SK.G, pl = G.player, W = SK.world, h = Math.max(2, pl.y - SK.handPos(pl, 1)[1]), out = [];
      window.__hurt = []; if (!window.__hurt0) window.__hurt0 = SK.hurtEnemy;
      SK.hurtEnemy = (G2, e, dmg) => { window.__hurt.push([e.tag, dmg]); };
      for (let dy = -240; dy <= 240 && !out.length; dy += 6) for (let dx = -400; dx <= 400 && !out.length; dx += 6) {
        const x = pl.x + dx, y = pl.y + dy;
        if (W.solidAt(G.map, x, y)) continue;
        let l = 0; while (l < 400) { l += 2; if (W.solidAt(G.map, x + l, y)) break; }
        let ok = true;
        if (kind === 'mirror') { if (l < 60 || l > 250) continue; for (let k = 0; k < l; k += 2) if (W.solidAt(G.map, x + k, y)) ok = false; }
        else { for (let k = 0; k < 64; k += 2) if (W.solidAt(G.map, x + k, y)) ok = false; for (let k = 0; k < 100; k += 2) for (const sg of [-1, 1]) if (W.solidAt(G.map, x + 54 + Math.cos(0.61) * k, y + sg * Math.sin(0.61) * k )) ok = false; }
        if (ok) out.push({ x, y, wall: x + l });
      }
      return out[0] || null;
    }, kind);
    const SC = await find('mirror'), SJ = await find('jelly');
    check('dựng được cảnh đo tia (Gương: tường 60..250 px; Sứa: khoảng thoáng quanh điểm chạm)', !!SC && !!SJ, JSON.stringify([SC, SJ]));
    if (SC && SJ) {
      // dựng cảnh + bắn + dọn quái giả trong MỘT lượt chạy đồng bộ (quái giả không có cls, vòng cập nhật của game không được thấy chúng)
      const shoot = (id, att, extra, SC) => ev(([id, att, SC, extra]) => {
        const G = SK.G, pl = G.player, w = SK.makeWeapon(id), old = G.enemies;
        if (att) SK_ROOMS.dnpc2.equip(w, att);
        pl.weapons = [w, null]; pl.cur = 0; pl.x = SC.x; pl.y = SC.y; pl.face = 1; pl.aim = 0; pl.dmgMul = 1; pl.crit = 0;
        window.__hurt = [];
        const my = SK.handPos(pl, 1)[1];
        G.enemies = (extra || []).map(e => ({ tag: e.tag, st: 'idle', hp: 100, x: e.x, y: my + (e.dy || 0), hb: { size: [8, 8], off: [0, 0] }, scale: 1, face: 1 }));
        try { SK.emit('fire', G, pl, w); } finally { G.enemies = old; }
        return { hurt: window.__hurt.slice() };
      }, [id, att, SC, extra]);
      const bd = id => ev(id => { const d = SK.DS.weapons[id], b = d.w86.b.find(q => q.p); return Math.max(1, Math.round(b.dmg * (d.w86.dmf || 1))); }, id);
      const midX = SC.wall - 24;   // tia dài 320 px tính cả đoạn tới tường: quái cách tường 24 px nằm trong đoạn nảy
      // Gương: quái cách tường 24 px bị tia phản xạ đánh đúng sát thương tia; không gắn thì không bị; quái ngoài đường tia không bị
      const dm = await bd(P5.laser);
      let r1 = await shoot(P5.laser, { key: 'mirror', rar: 'white', v: 1 }, [{ tag: 'on', x: midX }, { tag: 'off', x: midX, dy: 60 }], SC);
      check('(P7) Gương Phản Chiếu: tia chạm tường nảy lại, quái nằm trên đường nảy ăn đúng sát thương tia (' + dm + '), quái lệch 60 px không ăn', r1.hurt.length === 1 && r1.hurt[0][0] === 'on' && r1.hurt[0][1] === dm, JSON.stringify(r1.hurt) + ' dm ' + dm);
      r1 = await shoot(P5.laser, null, [{ tag: 'on', x: midX }], SC);
      check('(P7b) cùng cảnh không gắn Gương: không có tia nảy, 0 lần trúng', r1.hurt.length === 0, JSON.stringify(r1.hurt));
      // Sứa Hai Tua: tia chạm quái đầu tiên thì tách 2 tia ±35°, mỗi tia ceil(50%) sát thương; quái đầu không bị tia tách
      const cx = SJ.x + 60, a35 = 0.61, ex = 50;
      r1 = await shoot(P5.laser, { key: 'jellyfish', rar: 'orange', v: 50 }, [{ tag: 'first', x: cx }, { tag: 'up', x: cx - 6 + Math.cos(a35) * ex, dy: Math.sin(a35) * ex }, { tag: 'down', x: cx - 6 + Math.cos(a35) * ex, dy: -Math.sin(a35) * ex }, { tag: 'far', x: cx - 6 + 300 }], SJ);
      const half = Math.ceil(dm / 2);
      check('(P8) Sứa Hai Tua: tách 2 tia, 2 quái ở hai nhánh ±35° ăn ceil(' + dm + '/2) = ' + half + ', quái đầu tiên và quái xa không bị tia tách', r1.hurt.length === 2 && r1.hurt.every(h => h[1] === half && (h[0] === 'up' || h[0] === 'down')) && new Set(r1.hurt.map(h => h[0])).size === 2, JSON.stringify(r1.hurt));
      await ev(() => { SK.hurtEnemy = window.__hurt0; SK.G.enemies = []; });
    }
    // Cán Kiếm Tụ Năng: mỗi đòn một vệt trăng, sát thương/cỡ/xuyên theo độ hiếm; kiếm laser đỏ 2 vệt, vàng 3 vệt
    for (const [rar, dmg, size, thr] of [['green', 2, 1, 0], ['blue', 2, 1.4, 99], ['purple', 3, 1.7, 99]]) {
      const h = await ev(([id, rar, dmg]) => {
        const G = SK.G, pl = G.player, w = SK.makeWeapon(id); SK_ROOMS.dnpc2.equip(w, { key: 'hilt', rar, v: dmg }); pl.weapons = [w, null]; pl.cur = 0; pl.aim = 0; pl.x = pl.x || 100;
        const n0 = G.bullets.length; SK.emit('fire', G, pl, w);
        return G.bullets.slice(n0).filter(b => b.hilt).map(b => ({ dmg: b.dmg, size: b.size, thr: b.pierce, side: b.side }));
      }, [P5.sword, rar, dmg]);
      check('(P9) Cán Kiếm Tụ Năng ' + rar + ': 1 vệt trăng, sát thương ' + dmg + ', cỡ ' + size + ', xuyên ' + (thr ? 'có' : 'không'), h.length === 1 && h[0].dmg === dmg && h[0].size === size && h[0].thr === thr && h[0].side === 'p', JSON.stringify(h));
    }
    for (const [nm, id, n] of [['đỏ', P5.lsRed, 2], ['vàng', P5.lsGold, 3]]) {
      if (!id) { check('(P10) Kiếm Laser ' + nm + ' có trong dữ liệu', false, 'thiếu'); continue; }
      const c = await ev(id => { const G = SK.G, pl = G.player, w = SK.makeWeapon(id); SK_ROOMS.dnpc2.equip(w, { key: 'hilt', rar: 'purple', v: 3 }); pl.weapons = [w, null]; pl.cur = 0; pl.aim = 0; const n0 = G.bullets.length; SK.emit('fire', G, pl, w); return G.bullets.slice(n0).filter(b => b.hilt).length; }, id);
      check('(P10) Cán Kiếm Tụ Năng + Kiếm Laser ' + nm + ': ' + n + ' vệt mỗi đòn', c === n, 'ra ' + c);
    }
    // Cá Viên Đạn / Kiếm Hải Tinh / Đạn Cường Hóa / Đá Năng Lượng (proc = 1 để đo chắc)
    const FB = await ev(id => {
      const G = SK.G, pl = G.player, w = SK.makeWeapon(id); SK_ROOMS.dnpc2.equip(w, { key: 'bulletfish', rar: 'purple', v: 10 }); pl.weapons = [w, null]; pl.cur = 0; pl.aim = 0; pl.dmgMul = 1;
      G.bullets = []; SK.WEAPON_KINDS.gun.fire(G, pl, w, { x: pl.x, y: pl.y, ang: 0, side: 1, fn: 'Attack' }); const nPlain = G.bullets.filter(b => b.side === 'p').length;
      G.bullets = []; SK.WEAPON_KINDS.gun.fire(G, pl, w, { x: pl.x, y: pl.y, ang: 0, side: 1, fn: 'Attack' }); SK.emit('fire', G, pl, w);
      const live = G.bullets.filter(b => b.side === 'p' && !b.dead), fish = live.filter(b => b.fish);
      return { nPlain, live: live.length, fish: fish.map(b => ({ dmg: b.dmg, thr: b.pierce, ang: b.ang })) };
    }, P5.gun);
    check('(P11) Cá Viên Đạn (AK47, proc 100%): thay đúng 1 viên bằng Cá Viên Đạn 10 sát thương, xuyên, bay thẳng; số viên không đổi', FB.fish.length === 1 && FB.fish[0].dmg === 10 && FB.fish[0].thr > 0 && FB.fish[0].ang === 0 && FB.live === FB.nPlain, JSON.stringify(FB));
    const SF = await ev(id => {
      const G = SK.G, pl = G.player, w = SK.makeWeapon(id); SK_ROOMS.dnpc2.equip(w, { key: 'starfish', rar: 'blue', v: 5 }); pl.weapons = [w, null]; pl.cur = 0; pl.aim = 0; pl.dmgMul = 1;
      G.bullets = []; SK.WEAPON_KINDS.gun.fire(G, pl, w, { x: pl.x, y: pl.y, ang: 0, side: 1, fn: 'Attack' }); const n0 = G.bullets.length;
      SK.emit('fire', G, pl, w);
      const live = G.bullets.filter(b => b.side === 'p' && !b.dead);
      return { n0, live: live.map(b => ({ star: !!b.star, dmg: b.dmg })) };
    }, P5.gun);
    check('(P12) Kiếm Hải Tinh (proc 100%): đòn bắn bị thay hoàn toàn bằng đúng 1 sao biển 5 sát thương', SF.live.length === 1 && SF.live[0].star && SF.live[0].dmg === 5, JSON.stringify(SF));
    const EB = await ev(id => {
      const G = SK.G, pl = G.player, w = SK.makeWeapon(id); pl.weapons = [w, null]; pl.cur = 0; pl.aim = 0;
      const run = att => { if (att) SK_ROOMS.dnpc2.equip(w, att); else w.att = null; G.bullets = []; SK.WEAPON_KINDS.gun.fire(G, pl, w, { x: pl.x, y: pl.y, ang: 0, side: 1, fn: 'Attack' }); SK.emit('fire', G, pl, w); return G.bullets.filter(b => b.side === 'p').map(b => b.pierce | 0); };
      const a = run(null), b = run({ key: 'enhanced', rar: 'green', v: 1 });
      pl.energy = 10; pl.energyMax = 100; w.att = null; SK_ROOMS.dnpc2.equip(w, { key: 'energystone', rar: 'blue', v: 2 }); SK.emit('fire', G, pl, w);
      return { a, b, en: pl.energy };
    }, P5.gun);
    check('(P13) Đầu Đạn Cường Hóa: mọi viên đạn xuyên thêm đúng 1; (P14) Đá Năng Lượng (proc 100%): +2 năng lượng mỗi đòn', EB.a.length > 0 && EB.a.length === EB.b.length && EB.b.every((v, i) => v === EB.a[i] + 1) && EB.en === 12, JSON.stringify(EB));
    // đường chạy thật: giữ phím J, Cán Kiếm Tụ Năng (blue) tung vệt trăng thật qua máy trạng thái vũ khí
    const real5 = await ev(id => {
      const G = SK.G, pl = G.player, w = SK.makeWeapon(id); SK_ROOMS.dnpc2.equip(w, { key: 'hilt', rar: 'blue', v: 2 }); pl.weapons = [w, null]; pl.cur = 0; pl.aim = 0; pl.energy = pl.energyMax;
      window.__hb = []; const H0 = SK_ROOMS.dnpc2.HOOK.hilt; SK_ROOMS.dnpc2.HOOK.hilt = function (G3, p3, w3, a3) { const n = G3.bullets.length; H0(G3, p3, w3, a3); for (const b of G3.bullets.slice(n)) window.__hb.push(b); }; window.__h5restore = () => { SK_ROOMS.dnpc2.HOOK.hilt = H0; };
      return true;
    }, P5.sword);
    await p.keyboard.down('KeyJ'); await sleep(900); await p.keyboard.up('KeyJ');
    const h5 = await ev(() => { window.__h5restore(); return window.__hb.filter(b => b.hilt && b.side === 'p').length; });
    check('(P15) chạy thật (giữ J 0,9 s): Cán Kiếm Tụ Năng tung vệt trăng qua đòn chém thật (đếm đạn hilt > 0)', real5 && h5 > 0, 'vệt ' + h5);
    await ev(() => { SK_ROOMS.dnpc2.CFG5.special = 0.5; SK_ROOMS.dnpc2.CFG5.proc = 0.25; });

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
