// Khu Vườn bên trái sảnh đi (HALL.md 1.3 mục 34-35, bước 6): 8 ô trồng (prefab gốc plant_pot_0_summer), Bình Nước, Phân Bón, Xẻng và 47 loại cây.
// Số liệu: data/sk-garden.js (tools/garden/build_garden.py: luật prefab gốc + wiki + tên Việt). Trạng thái: SK.profile.garden() = P.garden
// {open[8], plots[8]{seed, stage, watered, fert}, day, buffs[], slots, drink{hp, energy}, pets[]}.
// Luật [WIKI Garden + prefab Plant*]: trồng xong phải tưới; qua đêm (đổi ngày thật) cây tưới lớn một giai đoạn; Phân Bón lớn một giai đoạn ở lần ghé
// sau (không cần tưới); cây days = 0 (củ cải, hành, dây leo) lớn ngay ở lần ghé sau khi tưới. Cây Vĩnh viễn thu xong về giai đoạn restartState,
// tưới tiếp mai thu lại; cây Nhanh thu xong biến mất. Xẻng nhổ cây (mất hạt). Sản phẩm: vật liệu/đá vào kho, vũ khí vào hòm vũ khí, thiên phú /
// ô thiên phú / thức uống / thú cưng áp vào ván kế (không chiếm ô thiên phú; trùng thì báo "Bạn đã có buff này" và không thu).
(function () {
  'use strict';
  const SK = window.SK, D = SK.D, DS = SK.DS, L = SK.lobby, P = SK.profile, UI = SK.HALL_UI, GD = window.SK_GARDEN, H = window.SK_HALL;
  if (!L || !P || !UI || !GD || !H || !H.garden || !SK.hall || !SK.hall.addZone) return;
  const { esc, fmt, gemImg, fakePay } = L, { dlg, icon, itemName, wName, CLOSE } = UI, U = SK.PPU;
  const PL = GD.plants, DAY_CAP = 30;

  // ---------------------------------------------------------------- luật (thuần dữ liệu, bộ kiểm logic gọi thẳng)
  const S = () => P.garden();
  const save = () => P.gardenSave();
  const plotsOf = () => S().plots;
  const R = () => SK.ROOMS || {};
  const buffOk = id => { const d = R().DEF && R().DEF[id]; return !!(d && d.active !== false); };
  const buffName = id => (R().buffName ? R().buffName(id) : 'Thiên phú ' + id);
  const seedsOwned = () => Object.keys(PL).filter(k => P.item(k) > 0).sort((a, b) => PL[a].rarity - PL[b].rarity || PL[a].vi.localeCompare(PL[b].vi, 'vi'));
  const ripe = q => !!(q.seed && q.stage >= PL[q.seed].mature);
  const grown = q => !!(q.seed && q.stage >= PL[q.seed].max);
  const needsWater = q => !!(q.seed && !q.watered && !grown(q));
  const plotCost = i => GD.plots[i];

  // Xử lý ngày + lần ghé: mỗi ngày đã qua, cây đã tưới (không phải loại days 0) lớn một giai đoạn và hết nước; khi visit = true (vào lại sảnh), cây days 0
  // đã tưới và cây đã bón phân lớn thêm một giai đoạn. Trước mỗi thao tác chỉ xử lý ngày; vào sảnh thì xử lý cả lần ghé.
  function settle(visit) {
    const g = S(), today = P.dayIndex;
    const steps = g.day == null ? 0 : Math.max(0, Math.min(DAY_CAP, today - g.day));
    for (let n = 0; n < steps; n++) for (const q of g.plots) if (q.seed && q.watered && !PL[q.seed].fast) { q.stage = Math.min(PL[q.seed].max, q.stage + 1); q.watered = false; }
    for (const q of visit ? g.plots : []) {
      if (!q.seed) continue;
      const p = PL[q.seed];
      if (p.fast && q.watered) { q.stage = Math.min(p.max, q.stage + 1); q.watered = false; }
      if (q.fert) { q.stage = Math.min(p.max, q.stage + 1); q.fert = false; }
    }
    g.day = today; save();
  }

  function plant(i, seed) {
    settle();
    const q = plotsOf()[i];
    if (!q || !S().open[i]) return { ok: false, text: 'Ô này chưa mở' };
    if (q.seed) return { ok: false, text: 'Ô này đã có cây' };
    if (!PL[seed] || !P.spendItem(seed, 1)) return { ok: false, text: GD_NO_SEED };
    Object.assign(q, { seed, stage: 0, watered: false, fert: false }); save(); SK.emit('plant', seed);
    return { ok: true, text: 'Hạt Giống trồng xong cần dùng bình nước tưới nước mới có thể sinh trưởng' };   // [LOC teaching/plant_end]
  }
  const GD_NO_SEED = 'Không có đồ có thể trồng';   // [LOC object/plantpot_no_seed]
  function water(i) {
    settle();
    const q = plotsOf()[i];
    if (!q || !q.seed) return { ok: false, text: 'Ô trống, chưa có gì để tưới' };
    if (!needsWater(q)) return { ok: false, text: q.watered ? 'Cây đã được tưới rồi' : 'Cây đã lớn hết cỡ, không cần tưới' };
    q.watered = true; save();
    return { ok: true, text: 'Đã tưới nước' };
  }
  function fertilize(i) {
    settle();
    const q = plotsOf()[i];
    if (!q || !q.seed) return { ok: false, text: 'Ô trống, chưa có gì để bón' };
    if (grown(q)) return { ok: false, text: 'Cây đã lớn hết cỡ' };
    if (q.fert) return { ok: false, text: 'Đã bón phân rồi' };
    if (!P.spendItem('material_fertilize', 1)) return { ok: false, text: 'Không đủ phân bón' };   // [LOC plant_pot/lack_of_fertilizer]
    q.fert = true; save();
    return { ok: true, text: 'Đã bón phân, cây sẽ lớn thêm một giai đoạn ở lần ghé sau' };
  }
  function shovel(i) {
    settle();
    const q = plotsOf()[i];
    if (!q || !q.seed) return { ok: false, text: 'Ô trống' };
    Object.assign(q, { seed: null, stage: 0, watered: false, fert: false }); save();
    return { ok: true, text: 'Đã bỏ cây' };
  }
  // Thiên phú thường (không đặc biệt) cho Hoa Kỳ Diệu: trong bể thật, có luật ở bản web, chưa chờ sẵn.
  function commonBuffs() {
    const B = (window.SK_BUFFS86 || {}).buffs || {};
    return Object.keys(B).map(Number).filter(id => id < 100 && B[id] && B[id].pool && B[id].pool.enabled && buffOk(id));
  }
  function pickBuff(pr) {
    const have = S().buffs;
    if (pr.kind === 'buff') return pr.id;
    const pool = (pr.kind === 'buffPick' ? pr.ids.filter(buffOk) : commonBuffs()).filter(id => have.indexOf(id) < 0);
    return pool.length ? pool[Math.floor(SK.rand() * pool.length)] : -1;
  }
  const rndItem = () => {   // Bí Đỏ: như trứng phục sinh, ra thuốc, vũ khí, tiền hoặc bom [WIKI Pumpkin]; thuốc/bom không có kho ở sảnh nên đổi ra đá
    const x = SK.rand();
    if (x < 0.4) { const id = SK.pick(DS.weaponPool(2, 'chest', SK.rand)); return { weapon: id }; }
    return { gems: [50, 100, 200, 300][Math.floor(SK.rand() * 4)] };
  };
  // Thu hoạch ô i. Trả {ok, text}; không thu được (hòm đầy, trùng buff, buff chưa có luật...) thì cây giữ nguyên.
  function harvest(i) {
    settle();
    const g = S(), q = g.plots[i];
    if (!q || !q.seed) return { ok: false, text: 'Ô trống' };
    const p = PL[q.seed], pr = p.product;
    if (!ripe(q)) return { ok: false, text: 'Cây chưa chín' };
    let text = '';
    switch (pr.kind) {
      case 'material': P.addItem(pr.key, pr.n); text = itemName(pr.key) + ' ×' + pr.n; break;
      case 'gems': P.addGems(pr.n); text = fmt(pr.n) + ' đá quý'; break;
      case 'randMat': { const k = pr.keys[Math.floor(SK.rand() * pr.keys.length)]; P.addItem(k, 1); text = itemName(k) + ' ×1'; break; }
      case 'weapon': {
        const id = DS.weaponId(q.stage > p.mature && pr.up ? pr.up : pr.key);
        if (P.boxFull) return { ok: false, text: 'Hòm vũ khí đầy, hãy bỏ bớt vũ khí ở Thùng Rác rồi quay lại' };
        P.addBox(id); text = wName(id) + ' (cất vào hòm vũ khí)'; break;
      }
      case 'buff': case 'buffRand': case 'buffPick': {
        if (pr.kind === 'buff' && !buffOk(pr.id)) return { ok: false, text: 'Thiên phú này chưa có ở bản web' };
        const id = pickBuff(pr);
        if (id < 0) return { ok: false, text: pr.kind === 'buffRand' || pr.kind === 'buffPick' ? 'Bạn đã có hết các buff này' : '' };
        if (g.buffs.indexOf(id) >= 0) return { ok: false, text: 'Bạn đã có buff này' };
        g.buffs.push(id); text = 'Thiên phú ' + buffName(id) + ' (có hiệu lực ở ván kế, không chiếm ô thiên phú)'; break;
      }
      case 'slot': g.slots++; text = 'Thêm 1 ô thiên phú ở ván kế'; break;
      case 'drink': g.drink.hp += pr.hp; g.drink.energy += pr.energy; text = '+' + pr.hp + ' máu tối đa, +' + pr.energy + ' năng lượng tối đa ở ván kế'; break;
      case 'item': {
        const r = rndItem();
        if (r.weapon) { if (P.boxFull) return { ok: false, text: 'Hòm vũ khí đầy, hãy bỏ bớt vũ khí ở Thùng Rác rồi quay lại' }; P.addBox(r.weapon); text = wName(r.weapon) + ' (cất vào hòm vũ khí)'; }
        else { P.addGems(r.gems); text = fmt(r.gems) + ' đá quý'; }
        break;
      }
      case 'pet':
        if (g.pets.indexOf(p.plant) >= 0) return { ok: false, text: 'Bạn đã có thú cưng này' };
        g.pets.push(p.plant); text = pr.vi + ' (đi cùng ở ván kế, cạnh thú cưng chính)'; break;
      default: return { ok: false, text: 'Chưa có ở bản web' };
    }
    if (p.harvest === 'perm') Object.assign(q, { stage: p.restart, watered: false, fert: false });
    else Object.assign(q, { seed: null, stage: 0, watered: false, fert: false });
    save();
    return { ok: true, text: 'Thu hoạch: ' + text };
  }
  // Mở ô trồng: ô 4 bằng đá, ô 5/6/8 thanh toán giả, ô 7 theo thành tựu (web chưa có chế độ Thần Điện Thủ Hộ nên khoá).
  function unlock(i, then) {
    settle();
    const g = S(), c = plotCost(i);
    if (g.open[i]) return { ok: false, text: 'Ô này đã mở' };
    if (c.kind === 'gems') {
      if (!P.spend(c.n)) return { ok: false, text: 'Không đủ đá quý — thiếu ' + fmt(c.n - P.gems) + '.' };
      g.open[i] = true; save(); return { ok: true, text: 'Đã mở Vườn Hoa ' + (i + 1) };
    }
    if (c.kind === 'money') {
      fakePay('Vườn Hoa ' + (i + 1), c.usd, () => { g.open[i] = true; save(); if (then) then({ ok: true, text: 'Đã mở Vườn Hoa ' + (i + 1) }); });
      return { ok: false, pending: true, text: '' };
    }
    return { ok: false, text: 'Cần thành tựu "' + c.name + '": ' + c.text };
  }
  function debugNextDay() { P.shiftDay(1); settle(true); return S().day; }

  // ---------------------------------------------------------------- áp sản phẩm vào ván kế
  // Thiên phú: lấy qua SK.ROOMS.takeBuff rồi +1 ô thiên phú để buff cây không chiếm ô. Ô thiên phú thêm / thức uống / thú cưng đi kèm cũng áp ở đây.
  SK.on('runStart', G2 => {
    const g = S(), p = G2.player;
    if (!p || G2.mode === 'bossrush') return;
    const took = [];
    for (const id of g.buffs) if (R().takeBuff && R().takeBuff(id)) { G2.mods = G2.mods || {}; G2.mods.buffSlots = (G2.mods.buffSlots || 0) + 1; took.push(id); }
    if (g.slots) { G2.mods = G2.mods || {}; G2.mods.buffSlots = (G2.mods.buffSlots || 0) + g.slots; }
    if (g.drink.hp || g.drink.energy) { p.hpMax += g.drink.hp; p.hp += g.drink.hp; p.energyMax += g.drink.energy; p.energy += g.drink.energy; }
    G2.gardenRun = { buffs: took, slots: g.slots, drink: Object.assign({}, g.drink), pets: g.pets.slice() };
    p._gardenPets = g.pets.slice();
    Object.assign(g, { buffs: [], slots: 0, drink: { hp: 0, energy: 0 }, pets: [] }); save();
    spawnPets(G2);
  });

  // Thú cưng từ cây: pets.js chỉ giữ một thú cưng chính (G.pet) nên con này là bạn đồng hành riêng, bám chủ cách một khoảng và cắn quái gần.
  // Zongzi dùng prefab pet41; Hoa Mandala / Hoa Ăn Thịt dùng hình thân của prefab cây (số liệu sát thương từ wiki: 3 / 5 [WIKI]).
  const COMP = { plant_datura: { dmg: 3, cd: 2, body: 'pet_datura_0' }, plant_eator: { dmg: 5, cd: 2, body: 'pet_eater_0' }, plant_zongzi: { dmg: 2, cd: 2, prefab: 'pet41' } };
  function spawnPets(G2) {
    const p = G2.player;
    if (!p || !p._gardenPets) return;
    p._gardenPets.forEach((pl, n) => {
      const c = COMP[pl]; if (!c) return;
      const a = { x: p.x - 22 - n * 8, y: p.y + 6, face: 1, st: 'ide', t: 0, cd: 1.2, tgt: null, comp: c, plant: pl };
      G2.props.push({ x: a.x, y: a.y, gardenPet: a, update(G3, q, dt) { stepPet(G3, a, dt); q.x = a.x; q.y = a.y; }, draw(ctx) {
        if (c.prefab && D.prefabs[c.prefab]) SK.drawPrefab(ctx, D.prefabs[c.prefab], a.x, a.y, { state: a.st, t: a.t, flip: a.face < 0 });
        else SK.draw(ctx, c.body, a.x, a.y, { flip: a.face < 0 });
      } });
    });
  }
  SK.on('stageEnter', G2 => { if (G2.player && G2.player._gardenPets) spawnPets(G2); });
  function stepPet(G3, a, dt) {
    const p = G3.player;
    a.t += dt; a.cd -= dt;
    if (!p || p.st === 'dead') { a.st = 'ide'; return; }
    const dp = Math.hypot(p.x - a.x, p.y - a.y);
    if (dp > 20 * U) { a.x = p.x - 22; a.y = p.y + 6; a.tgt = null; return; }
    let e = a.tgt;
    if (e && (e.st === 'dead' || dp > 10 * U)) e = a.tgt = null;
    if (!e && a.cd <= 0) {
      let bd = 7 * U;
      for (const m of G3.enemies) { if (m.st === 'spawn' || m.st === 'dead') continue; const d = Math.hypot(m.x - a.x, m.y - a.y); if (d < bd) { bd = d; e = m; } }
      a.tgt = e;
    }
    const goal = e ? { x: e.x, y: e.y } : { x: p.x - p.face * 22, y: p.y + 6 }, dx = goal.x - a.x, dy = goal.y - a.y, d = Math.hypot(dx, dy);
    if (e && d <= 1.2 * U) { a.cd = a.comp.cd; SK.hurtEnemy(G3, e, a.comp.dmg, false, Math.atan2(dy, dx), 1); a.tgt = null; a.st = 'ide'; return; }
    if (d > (e ? 1 : 2 * U)) { const s = Math.min(d, 8 * U * dt); SK.moveBox(G3.map, a, dx / d * s, dy / d * s, 3); a.st = 'run'; if (Math.abs(dx) > 1) a.face = dx > 0 ? 1 : -1; } else a.st = 'ide';
  }

  // ---------------------------------------------------------------- hộp thoại
  const st = document.createElement('style');
  st.textContent = '.sk-gd small{display:block;color:#9aa3b0;font-size:calc(var(--u)*2.4)}.sk-gd .sk-gd-st{color:#9dffcb}.sk-gd .sk-gd-bad{color:#ff8a8a}' +
    '#hs-dlg .hs-btns{flex-wrap:wrap}';
  document.head.appendChild(st);
  const HARV = { once: 'Nhanh', perm: 'Vĩnh viễn' };   // [LOC ui/plantplot_seed_permanence_0/1]
  const potName = i => 'Vườn Hoa ' + (i + 1);          // [LOC cloudsave/plantpot_x_count]
  const specs = k => {   // ba dòng chọn hạt [LOC ui/plantplot_seed_content, _type, _permanence, _time]
    const p = PL[k];
    return 'Sản xuất: ' + p.product.vi + ' · Loại sản xuất: ' + p.ptypeVi + ' · Loại thu hoạch: ' + HARV[p.harvest] + ' · Chu kỳ sinh trưởng: ' + p.days + ' ngày';
  };
  const stageText = q => {
    const p = PL[q.seed];
    return ripe(q) ? '<span class="sk-gd-st">Đã chín, có thể thu hoạch</span>' : 'Giai đoạn ' + q.stage + '/' + p.mature + ' · ' + (q.watered ? '<span class="sk-gd-st">đã tưới (lớn sau một đêm)</span>' : '<span class="sk-gd-bad">chưa tưới</span>');
  };
  const note = t => t ? '<p id="sk-gd-note" class="sk-gd-note">' + esc(t) + '</p>' : '';

  function potDlg(i, msg) {
    settle();
    const g = S(), q = g.plots[i], c = plotCost(i);
    let html = '<div class="sk-gd"><h3>' + esc(potName(i)) + '</h3>', btns = [];
    if (!g.open[i]) {
      html += '<p id="sk-gd-lock">Ô trồng này chưa mở.</p>';
      if (c.kind === 'gems') html += '<p class="hs-price">' + gemImg + ' ' + fmt(c.n) + '</p><p>Bạn đang có ' + fmt(P.gems) + ' đá quý.</p>';
      else if (c.kind === 'money') html += '<p class="hs-price">$' + c.usd.toFixed(2) + '</p><p class="hs-note">Thanh toán giả lập — không trừ tiền thật.</p>';
      else html += '<p class="sk-gd-bad" id="sk-gd-ac">Cần thành tựu "' + esc(c.name) + '": ' + esc(c.text) + '</p>';
      html += note(msg) + '</div>';
      if (c.kind !== 'achievement') btns.push({ id: 'sk-gd-unlock', label: 'Mở khóa', cls: 'ok', disabled: c.kind === 'gems' && P.gems < c.n,
        fn() { const r = unlock(i, r2 => potDlg(i, r2.text)); if (!r.pending) potDlg(i, r.text); } });
      btns.push(CLOSE);
      return dlg(html, btns);
    }
    if (!q.seed) {
      const seeds = seedsOwned();
      html += '<p>Hãy chọn 1 hạt giống</p>';   // [LOC object/plantpot_select_seed]
      if (!seeds.length) html += '<p class="sk-gd-bad" id="sk-gd-noseed">' + GD_NO_SEED + '</p>';
      else html += '<ul class="sk-list" id="sk-gd-seeds">' + seeds.map(k => '<li data-k="' + esc(k) + '">' + icon(k) + '<span>' + esc(PL[k].seed) + '<small>' + esc(specs(k)) + '</small></span><b>×' + P.item(k) +
        '</b><button class="hs-btn ok" data-k="' + esc(k) + '">Trồng trọt</button></li>').join('') + '</ul>';   // [LOC plant_pot/plant]
      html += note(msg) + '</div>';
      dlg(html, [CLOSE]);
      for (const b of document.querySelectorAll('#sk-gd-seeds button')) b.onclick = () => { const r = plant(i, b.dataset.k); potDlg(i, r.text); };
      return;
    }
    const p = PL[q.seed];
    html += '<p><b>' + esc(p.vi) + '</b></p><p>' + stageText(q) + (q.fert ? ' · <span class="sk-gd-st">đã bón phân</span>' : '') + '</p>' +
      '<p><small>' + esc(specs(q.seed)) + '</small></p><p>Phân Bón: <b>' + P.item('material_fertilize') + '</b></p>' + note(msg) + '</div>';
    btns.push({ id: 'sk-gd-harvest', label: 'Thu hoạch', cls: 'ok', disabled: !ripe(q), fn() { const r = harvest(i); potDlg(i, r.text); } },
      { id: 'sk-gd-water', label: 'Tưới', disabled: !needsWater(q), fn() { const r = water(i); potDlg(i, r.text); } },   // [LOC objects/plantpot_watering]
      { id: 'sk-gd-fert', label: 'Bón phân', disabled: grown(q) || q.fert, fn() { const r = fertilize(i); potDlg(i, r.text); } },   // [LOC objects/plantpot_fertilizing]
      { id: 'sk-gd-shovel', label: 'Bỏ', fn: () => confirmShovel(i) }, CLOSE);
    dlg(html, btns);
  }
  function confirmShovel(i, back) {
    dlg('<h3>' + esc(potName(i)) + '</h3><p id="sk-gd-ask">Bỏ cây này thật sao?</p>', [   // [LOC objects/plantpot_shoveling_2]
      { id: 'sk-gd-shovel-yes', label: 'Bỏ', cls: 'ok', fn() { const r = shovel(i); if (back) back(r.text); else potDlg(i, r.text); } }, { label: 'Thôi', fn: () => (back ? back() : potDlg(i)) }]);
  }

  // Bình Nước: tưới hết các ô đang cần nước. Bao Phân Bón: bón cho các ô chưa lớn hết cỡ. Xẻng: chọn ô để bỏ cây.
  function canDlg(msg) {
    settle();
    const n = plotsOf().filter((q, i) => S().open[i] && needsWater(q)).length;
    dlg('<div class="sk-gd"><h3>Bình Nước</h3><p>Tưới nước cho cây trồng để lớn qua đêm.</p><p id="sk-gd-need">Ô đang cần nước: <b>' + n + '</b></p>' + note(msg) + '</div>',
      [{ id: 'sk-gd-water-all', label: 'Tưới tất cả', cls: 'ok', disabled: !n, fn() { let k = 0; plotsOf().forEach((q, i) => { if (S().open[i] && water(i).ok) k++; }); canDlg('Đã tưới ' + k + ' ô'); } }, CLOSE]);
  }
  function fertDlg(msg) {
    settle();
    const need = plotsOf().filter((q, i) => S().open[i] && q.seed && !grown(q) && !q.fert);
    dlg('<div class="sk-gd"><h3>Phân Bón</h3><p>Rút ngắn 1 ngày chu kỳ hạt giống sinh trưởng.</p><p id="sk-gd-fcount">Phân Bón: <b>' + P.item('material_fertilize') + '</b> · ô có thể bón: <b>' + need.length + '</b></p>' +   // [LOC item/fertilizer_description]
      (P.item('material_fertilize') < 1 ? '<p class="sk-gd-bad">Không đủ phân bón</p>' : '') + note(msg) + '</div>',
    [{ id: 'sk-gd-fert-all', label: 'Bón tất cả', cls: 'ok', disabled: !need.length || P.item('material_fertilize') < 1, fn() {
      let k = 0; plotsOf().forEach((q, i) => { if (S().open[i] && fertilize(i).ok) k++; }); fertDlg('Đã bón phân ' + k + ' ô'); } }, CLOSE]);
  }
  function shovelDlg(msg) {
    settle();
    const list = plotsOf().map((q, i) => ({ q, i })).filter(o => o.q.seed);
    let html = '<div class="sk-gd"><h3>Xẻng</h3>';
    html += list.length ? '<ul class="sk-list" id="sk-gd-shovels">' + list.map(o => '<li><span>' + esc(PL[o.q.seed].vi) + '<small>' + esc(potName(o.i)) + '</small></span><button class="hs-btn ok" data-i="' + o.i + '">Bỏ</button></li>').join('') + '</ul>'
      : '<p id="sk-gd-empty">Vườn chưa có cây nào để bỏ.</p>';
    dlg(html + note(msg) + '</div>', [CLOSE]);
    for (const b of document.querySelectorAll('#sk-gd-shovels button')) b.onclick = () => confirmShovel(+b.dataset.i, shovelDlg);
  }

  // ---------------------------------------------------------------- đặt vào sảnh
  const base = SK.hall.px(0, 0);      // toạ độ ảnh của gốc thế giới: phần prefab vườn mang toạ độ tuyệt đối
  const potParts = D.prefabs.plant_pot_0_summer || [];
  const potPart = n => potParts.find(p => p.n === n);
  const stageParts = {};
  const partsOf = (plant, s) => { const k = plant + '#' + s; return stageParts[k] || (stageParts[k] = ((D.prefabs[plant] || []).filter(p => p.n.indexOf('/state_root/state_' + s + '/') === 0))); };
  const gardenParts = (path, skip) => (D.prefabs.garden_0_normal || []).filter(p => p.n.indexOf(path) === 0 && !(skip && p.n.indexOf(skip) === 0));
  function drawPot(ctx, x, y, t, z) {
    const i = z.idx, g = S(), q = g.plots[i], open = g.open[i];
    const fr = (n, dx, dy) => { const p = potPart(n); if (p && p.f) SK.draw(ctx, p.f, x + (p.at[0] + (dx || 0)), y - (p.at[1] + (dy || 0))); };
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, y + 1, 18, 5, 0, 0, Math.PI * 2); ctx.fill();
    fr('/img/img_bottom');
    if (open && q.seed) {
      const p = PL[q.seed], s = Math.min(q.stage, p.max);
      SK.drawPrefab(ctx, partsOf(p.plant, s), x, y - 12, { t });
    }
    fr('/img/img_top');
    const ic = n => { const p = potPart(n); if (p && p.f) SK.draw(ctx, p.f, x + p.at[0], y - p.at[1] - 8); };
    if (!open) ic('/lock/img');
    else if (q.seed && q.watered) ic('/water/img');
    else if (q.seed && q.fert) ic('/fertilize/img');
    if (open && q.seed && ripe(q)) { ctx.fillStyle = '#ffd452'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', x, y - 44 + Math.sin(t * 5) * 2); }
  }
  const boxAt = pos => [pos[0] - 0.7, pos[1] - 0.7, pos[0] + 0.7, pos[1] + 0.7];   // đồ nhỏ nằm sát nhau: vùng dùng 1,4 × 1,4 đv
  const drawProp = path => (ctx, x, y, t) => { SK.drawPrefab(ctx, gardenParts(path, path + '/img_empty'), base[0], base[1], { t }); };
  H.garden.plots.forEach((pos, i) => {
    SK.hall.addZone('garden_plot_' + i, pos[0], pos[1], 'plant_pot_0_summer', {
      idx: i, loc: 'objects/plantpot', draw: drawPot, use: z => potDlg(z.idx),
      get name() { const g = S(), q = g.plots[i]; return !g.open[i] ? potName(i) + ' (khóa)' : q.seed ? PL[q.seed].vi : potName(i); }
    });
  });
  SK.hall.addZone('garden_can', H.garden.can[0], H.garden.can[1], null, { name: 'Bình Nước', loc: 'weapon/weapon_shower', box: boxAt(H.garden.can), draw: drawProp('/function/stuffs_slot/weapon_shower'), use: () => canDlg() });
  SK.hall.addZone('garden_fert', H.garden.fert[0], H.garden.fert[1], null, { name: 'Phân Bón', loc: 'weapon/weapon_fertilizer', box: boxAt(H.garden.fert), draw: drawProp('/function/stuffs_slot/object_fertilize'), use: () => fertDlg() });
  SK.hall.addZone('garden_shovel', H.garden.shovel[0], H.garden.shovel[1], null, { name: 'Xẻng', loc: 'weapon/weapon_shovel', box: boxAt(H.garden.shovel), draw: drawProp('/function/stuffs_slot/weapon_shovel'), use: () => shovelDlg() });

  // Mỗi lần vào sảnh: xử lý ngày + lần ghé (Phân Bón, cây days 0).
  const enter0 = SK.hall.enter;
  SK.hall.enter = function () { settle(true); return enter0.apply(this, arguments); };
  settle(true);

  SK.garden = { plants: PL, plots: GD.plots, state: () => JSON.parse(JSON.stringify(S())), settle, visit: () => settle(true), plant, water, fertilize, shovel, harvest, unlock, debugNextDay, buffOk,
    potDialog: potDlg, ripe, seedsOwned, specs, spawnPets };
})();
