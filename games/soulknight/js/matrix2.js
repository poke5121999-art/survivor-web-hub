// Mê Trận Tà Vương đợt 2 (G.mode === 'matrix'): thanh Uy Áp HUD, đổi Pha Lê cuối ván, móc của 6 nhân tố Tà Vương,
// Quái Gen (đột biến gen), cấp vũ khí. Số lấy từ tools/polish/MODES.md mục 2d; chỗ không có số gốc ghi [ƯỚC LƯỢNG].
// Loại bỏ vì không có ở bản web: Tàng Hình và Suy Yếu (cũng không có trong Mê Trận [WIKI Matrix]).
(function () {
  'use strict';
  const SK = window.SK, M = SK.matrix;
  if (!M) return;
  const on = G => G && G.mode === 'matrix' && G.matrix;
  const mods = G => (G && G.mods) || {};

  // ---------------------------------------------------------------- thanh Uy Áp (HUD)
  // Thanh tiến độ xanh lơ + vạch mốc xanh lục [WIKI Matrix; LOC guide/mode_loop/guide06-09]; "Uy Áp" = LOC mode_loop/pressure_level.
  SK.on('hud', (ctx, G) => {
    const m = on(G); if (!m || G.state === 'lobby' || !G.player) return;
    const v = SK.view, w = 96, h = 6, x = Math.round((v.w - w) / 2), y = 20;
    const prog = Math.min(1, M.progress(G)), mark = Math.min(1, M.marker(G)), win = prog > mark;
    ctx.save();
    ctx.fillStyle = 'rgba(8,10,20,0.75)'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = win ? '#37e0ff' : '#2a9ab8'; ctx.fillRect(x, y, Math.round(w * prog), h);
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(x, y, Math.round(w * prog), 1);
    ctx.fillStyle = '#4dff6a'; ctx.fillRect(x + Math.min(w - 2, Math.round(w * mark)), y - 2, 2, h + 4);
    ctx.strokeStyle = '#9a7bd8'; ctx.lineWidth = 1; ctx.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
    SK.text(ctx, 'Uy Áp ' + m.P, x + w / 2, y - 4, 8, '#e6d8ff', 'center', 'rgba(0,0,0,0.9)');
    SK.text(ctx, '◆' + m.crystals, x + w + 6, y + 6, 7, '#d98bff', 'left', 'rgba(0,0,0,0.9)');
    ctx.restore();
    M.hud = { P: m.P, crystals: m.crystals, prog, mark, x, y, w, h, t: G.t };
  });

  // ---------------------------------------------------------------- đổi Pha Lê cuối ván
  // Bảng [WIKI Matrix], phần nghìn: đá quý 100 (15%) 200 (15%) 500 (17,5%) 1000 (2,5%); nguyên liệu 28%; 7 mảnh phép thuật 6%; Phân Bón 1%;
  // hạt giống 6% (tối đa 2); phiếu Nhân Tố 4%, phiếu phụ kiện vũ khí 2%, Vé dùng thử 1% (web chưa có ba loại phiếu: đổi thành 100 đá mỗi phiếu
  // [ƯỚC LƯỢNG]); 2% còn thiếu cũng đổi 100 đá [ƯỚC LƯỢNG]. Số lượt tung mỗi Pha Lê KHÔNG có nguồn: [ƯỚC LƯỢNG] 1 lượt.
  const MATS = ['material_battery', 'material_iron', 'material_wood', 'material_gear', 'material_cell'];
  const MAGIC = ['red', 'blue', 'cyan', 'green', 'orange', 'purple', 'black'].map(c => 'material_magic_' + c);
  const TABLE = [   // [phần nghìn, loại]
    [150, 'gem100'], [150, 'gem200'], [175, 'gem500'], [25, 'gem1000'], [280, 'mat'], [60, 'magic'], [10, 'fert'], [60, 'seed'],
    [40, 'gem100'], [20, 'gem100'], [10, 'gem100'], [20, 'gem100']
  ];
  M.REWARD = TABLE;
  function seeds() { const it = window.SK_ITEMS && SK_ITEMS.items || {}; return Object.keys(it).filter(k => /^plant_.*_seed$/.test(k)); }
  // Một lượt tung: r ∈ [0,1) → { gems } hoặc { item, n }.
  M.rollReward = function (r, st) {
    let v = r * 1000, kind = 'gem100';
    for (const [w, k] of TABLE) { if (v < w) { kind = k; break; } v -= w; }
    st = st || { seeds: 0 };
    if (kind === 'seed' && st.seeds >= 2) kind = 'gem100';   // hạt giống tối đa 2
    const pick = a => a[Math.min(a.length - 1, Math.floor(SK.rand() * a.length))];
    switch (kind) {
      case 'gem200': return { gems: 200 };
      case 'gem500': return { gems: 500 };
      case 'gem1000': return { gems: 1000 };
      case 'mat': return { item: pick(MATS), n: 2 };    // [ƯỚC LƯỢNG] số lượng
      case 'magic': return { item: pick(MAGIC), n: 1 };
      case 'fert': return { item: 'material_fertilize', n: 1 };
      case 'seed': { const s = seeds(); st.seeds++; return s.length ? { item: pick(s), n: 1 } : { gems: 100 }; }
      default: return { gems: 100 };
    }
  };
  // Đổi toàn bộ Pha Lê của ván (một lần); apply=false chỉ tính (kiểm thử). Trả { n, gems, items:{khoá:n} }.
  M.redeem = function (G, apply, rnd) {
    const m = on(G); if (!m || m.redeemed) return m && m.redeem;
    const out = { n: m.crystals, gems: 0, items: {} }, st = { seeds: 0 };
    for (let i = 0; i < m.crystals; i++) {
      const g = M.rollReward(rnd ? rnd() : SK.rand(), st);
      if (g.gems) out.gems += g.gems; else out.items[g.item] = (out.items[g.item] || 0) + g.n;
    }
    if (apply !== false) {
      m.redeemed = true; m.redeem = out;
      const P = SK.profile;
      if (P) { if (out.gems) P.addGems(out.gems); for (const k in out.items) P.addItem(k, out.items[k]); }
    }
    return out;
  };
  SK.on('runEnd', G => {
    const m = on(G); if (!m || !m.crystals) return;
    const o = M.redeem(G); if (!o) return;
    // fillEnd ghi chữ SAU khi phát runEnd: nối dòng Pha Lê lúc sau
    setTimeout(() => {
      const el = document.getElementById('sk-over-info'); if (!el) return;
      const names = Object.keys(o.items).map(k => ((window.SK_ITEMS && SK_ITEMS.items[k] && SK_ITEMS.items[k].name) || k) + ' ×' + o.items[k]);
      el.textContent += ' · Đổi ' + o.n + ' Pha Lê Tà Vương: +' + o.gems + ' đá quý' + (names.length ? ', ' + names.join(', ') : '');
    }, 0);
  });

  // ---------------------------------------------------------------- 6 nhân tố Tà Vương: móc sát thương
  // Kiếm Hai Lưỡi: người chơi chịu +n, quái chịu +2n. Tốc độ (Thuật Chậm Chạp) nằm ở SK.factorsEnemy; Gen Miễn Dịch/Thuật Suy Yếu ở thời gian trạng thái.
  const hurtEnemy0 = SK.hurtEnemy;
  const hurtPlayer0 = SK.hurtPlayer;

  // Kháng khống chế của quái: P hiệu dụng = P - Thuật Suy Yếu + Gen Miễn Dịch; thời gian trạng thái xấu = ×0,5^(Peff/3) [SUY, bản Vô Tận cũ: giảm nửa mỗi vòng].
  M.peff = G => Math.max(0, G.matrix.P - (mods(G).ctlCut || 0) + (mods(G).ctlAdd || 0));
  M.statusMul = G => Math.pow(0.5, M.peff(G) / 3);
  SK.on('statusApply', (G, e, kind) => {
    if (!on(G) || !e || !e._bmSt || !e._bmSt[kind]) return;
    if (e.gene === 'holy') { delete e._bmSt[kind]; return; }   // Thần Thánh miễn trạng thái
    e._bmSt[kind].t *= M.statusMul(G);
  });

  // ---------------------------------------------------------------- Quái Gen
  // 9 kiểu có trong Mê Trận [WIKI Enemies#Mutations; LOC fire/gene_name_*]. Tỉ lệ cơ bản KHÔNG có nguồn: [ƯỚC LƯỢNG] 5% + 1% mỗi cấp Uy Áp
  // (trần 50%), cộng +2% mỗi lần nhận Đột Biến Gen (G.mods.mutateRate).
  const GENES = {
    strong: { vi: 'Sức Mạnh', col: '#ff5a3c' }, agile: { vi: 'Nhanh Nhẹn', col: '#5ae6ff' }, holy: { vi: 'Thần Thánh', col: '#fff2a0' },
    demon: { vi: 'Ác Ma', col: '#a03cff' }, reflect: { vi: 'Phản Xạ', col: '#ffa53c' }, shield: { vi: 'Khiên', col: '#5a9bff' },
    drain: { vi: 'Hao Tổn Năng Lượng', col: '#3cff8a' }, leech: { vi: 'Hút HP', col: '#ff3c8a' }, scatter: { vi: 'Bắn Lan', col: '#b8ff3c' }
  };
  M.GENES = GENES;
  const GENE_KEYS = Object.keys(GENES);
  M.geneChance = G => Math.min(0.9, Math.min(0.5, 0.05 + 0.01 * G.matrix.P) + (mods(G).mutateRate || 0));
  function applyGene(G, e, key) {
    e.gene = key;
    const sc = f => { e.scale *= f; if (e.r) e.r *= f; };
    const hp = f => { e.hp = Math.max(1, Math.round(e.hp * f)); e.hpMax = Math.max(1, Math.round(e.hpMax * f)); };
    if (key === 'strong') { sc(1.5); hp(1.5); e.moveMul = (e.moveMul || 1) * (2 / 3); }              // +50% cỡ/HP, -33,33% tốc độ
    else if (key === 'agile') { sc(2 / 3); hp(2 / 3); e.moveMul = (e.moveMul || 1) * 1.5; }          // -33,33% cỡ/HP, +50% tốc độ
    else if (key === 'shield') e.shield = Math.max(1, Math.round(e.hpMax * 0.3));                    // [ƯỚC LƯỢNG] khiên = 30% HP, chặn mọi đòn tới khi vỡ
    else if (key === 'reflect') e._geneCd = 0;
  }
  const isBoss = e => !!(e && (e.bossKey || e.boss));
  const makeEnemy1 = SK.makeEnemy;
  SK.makeEnemy = function (G, ...args) {
    const e = makeEnemy1(G, ...args);
    if (e && on(G) && !M.geneOff && !isBoss(e) && !e.noReward && !e.gene && SK.rand() < M.geneChance(G)) applyGene(G, e, GENE_KEYS[Math.floor(SK.rand() * GENE_KEYS.length) % GENE_KEYS.length]);
    return e;
  };
  // Quái đánh người chơi gần nhất với toạ độ nguồn đòn (khoảng 44 px).
  function geneAt(G, x, y) {
    if (x == null || y == null) return null;
    let best = null, bd = 44;
    for (const e of G.enemies) {
      if (!e.gene || e.st === 'dead') continue;
      const d = Math.hypot(e.x - x, e.y - y); if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  SK.hurtPlayer = function (G, dmg, x, y, ...rest) {
    const m = on(G);
    if (m && dmg > 0) {
      dmg += mods(G).playerHurtAdd || 0;   // Kiếm Hai Lưỡi
      const src = geneAt(G, x, y), p = G.player;
      if (src) {
        if (src.gene === 'strong') dmg = Math.round(dmg * 1.5);
        else if (src.gene === 'agile') dmg = Math.max(1, Math.round(dmg * 2 / 3));
        else if (src.gene === 'drain' && p.energyMax) p.energy = Math.max(0, p.energy - 0.05 * p.energyMax);   // mỗi đòn trừ 5% năng lượng tối đa
        else if (src.gene === 'leech') src.hp = Math.min(src.hpMax, src.hp + Math.ceil(src.hpMax * 0.05));      // [ƯỚC LƯỢNG] hút để hồi 5% HP quái
      }
    }
    return hurtPlayer0(G, dmg, x, y, ...rest);
  };
  SK.hurtEnemy = function (G, e, dmg, ...rest) {
    if (on(G) && e && dmg > 0 && e.st !== 'dead') {
      dmg += (mods(G).enemyHurtAdd || 0);   // Kiếm Hai Lưỡi: quái chịu +2n
      if (e.gene === 'holy') dmg = Math.max(1, Math.round(dmg * 0.8));   // giảm 20% sát thương
      else if (e.gene === 'demon' && !(e._bmSt && Object.keys(e._bmSt).length) && e.st !== 'stun') dmg = Math.max(1, Math.round(dmg * 0.4));   // giảm 60% khi không dính trạng thái
      if (e.shield > 0) {
        e.shield -= dmg; e.flash = 0.08;
        if (e.shield > 0) return true;
        dmg = -e.shield; e.shield = 0;
        if (dmg <= 0) return true;
      }
    }
    const r = hurtEnemy0(G, e, dmg, ...rest);
    if (r && e.gene === 'reflect' && e.st !== 'dead' && G.t >= (e._geneCd || 0)) {
      e._geneCd = G.t + 1.5;   // [ƯỚC LƯỢNG] sóng chấn mỗi 1,5 s, bán kính 36 px, 1 sát thương
      const p = G.player;
      if (p && Math.hypot(p.x - e.x, p.y - e.y) < 36) hurtPlayer0(G, 1, e.x, e.y);
      e._ringT = G.t;
    }
    return r;
  };
  // Bắn Lan: chết thì 2-4 bọt độc 4 sát thương toả ra
  SK.on('enemyKill', (G, e) => {
    if (!on(G) || !e || e.gene !== 'scatter' || !SK.spawnBullet86) return;
    const n = 2 + (Math.floor(SK.rand() * 3));
    for (let i = 0; i < n; i++) { const b = SK.spawnBullet86(G, 'e', 'bullet_0', e.x, e.y - 6, SK.rand() * Math.PI * 2, { dmg: 4, spd: 4, life: 1.6, h: 6 }); if (b) b.elem = 'poison'; }   // bọt độc: nguyên tố (thiên phú 2117 chống đỡ)
    e._scatter = n;
  });
  // Viền màu dưới chân quái gen (+ vòng Phản Xạ, khiên)
  const drawEnemy0 = SK.drawEnemy;
  SK.drawEnemy = function (ctx, G, e) {
    if (e.gene && e.st !== 'dead' && e.st !== 'spawn') {
      const g = GENES[e.gene], pulse = 0.6 + 0.4 * Math.sin(G.t * 6);
      ctx.save(); ctx.strokeStyle = g.col; ctx.globalAlpha = 0.5 + 0.4 * pulse; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, 9 * e.scale + 2, 4 * e.scale + 1, 0, 0, Math.PI * 2); ctx.stroke();
      if (e.shield > 0) { ctx.globalAlpha = 0.5; ctx.strokeStyle = '#8fc4ff'; ctx.beginPath(); ctx.arc(e.x, e.y - 8 * e.scale, 11 * e.scale, 0, Math.PI * 2); ctx.stroke(); }
      if (e._ringT != null && G.t - e._ringT < 0.3) { ctx.globalAlpha = 1 - (G.t - e._ringT) / 0.3; ctx.strokeStyle = g.col; ctx.beginPath(); ctx.arc(e.x, e.y - 6, 8 + (G.t - e._ringT) / 0.3 * 28, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
    }
    return drawEnemy0(ctx, G, e);
  };

  // ---------------------------------------------------------------- cấp vũ khí
  // [WIKI Matrix] vũ khí thấp cấp càng đánh yếu khi P tăng: thấp hơn 2 cấp mất 1 sát thương, cộng dồn. Miễn: Khiên, Serenity, Death Note, Gậy Anubis.
  // Cấp khởi đầu và "thấp hơn cái gì" KHÔNG có nguồn: [ƯỚC LƯỢNG] w.lvl = P lúc cầm lần đầu (vũ khí lượm ở tầng này đúng cấp, cầm từ tầng
  // trước thì tụt); mất floor(max(0, P - lvl) / 2) sát thương gốc mỗi phát (tối thiểu còn 1), thể hiện bằng hệ số dmgMul theo khoá.
  const EXEMPT = /serenity|death note|anubis|shield/i;
  M.exempt = w => !!(w && w.def && (w.id === 'weapon_254' || EXEMPT.test((w.def.nameEn || '') + ' ' + w.id) && w.def.kind !== 'melee'));
  M.weaponLoss = (G, w) => {
    if (!w || M.exempt(w)) return 0;
    return Math.floor(Math.max(0, G.matrix.P - (w.lvl || 0)) / 2);
  };
  M.weaponUp = (G, w) => { if (!w) return false; w.lvl = (w.lvl == null ? G.matrix.P : w.lvl) + 1; return true; };
  const tick0 = SK.factorsTick;
  SK.factorsTick = function (G, p, dt) {
    tick0(G, p, dt);
    if (!on(G) || !p.weapons) return;
    for (const w of p.weapons) if (w && w.lvl == null) w.lvl = G.matrix.P;
    const w = p.weapons[p.cur], loss = M.weaponLoss(G, w), base = (w && w.def && w.def.dmg) || 0;
    const val = loss > 0 && base > 0 ? Math.max(1, base - loss) / base : 1;
    const k = '_fx_dmgMul_wlvl', old = p[k] || 1;
    if (Math.abs(old - val) > 1e-9) { p.dmgMul = (p.dmgMul == null ? 1 : p.dmgMul) / old * val; p[k] = val; }
    p._wLoss = loss;
  };
  // Số xanh cấp vũ khí cạnh nút vũ khí (HUD prefab control/btn_weapon)
  SK.on('hud', (ctx, G) => {
    const m = on(G); if (!m || !G.player || G.state === 'lobby') return;
    const w = G.player.weapons[G.player.cur]; if (!w || !SK.hud || !SK.hud.rect) return;
    const r = SK.hud.rect('control/btn_weapon'); if (!r) return;
    const s = SK.view.scale, lv = w.lvl == null ? m.P : w.lvl, low = M.weaponLoss(G, w) > 0;
    SK.text(ctx, String(lv), (r.x + r.w) / s - 3, r.y / s + 9, 9, low ? '#ff8a5a' : '#4dff6a', 'right', 'rgba(0,0,0,0.9)');
    M.hudWeapon = { lv, loss: M.weaponLoss(G, w), x: r.x / s, y: r.y / s };
  });
})();
