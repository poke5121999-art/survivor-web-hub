// Phòng đặc biệt, lái buôn, tượng, giếng ước, buff giữa ải và đồ rơi của chế độ thường.
// Số liệu thật của bản 8.6.0 nằm ở data/sk-buffs86.js (tools/buffs/build_buffs86.py đọc luban, config, lua, loc):
// bể buff theo cấp, tên/mô tả tiếng Việt chính thức, bể cửa hàng, công thức giá, cách rơi xu/năng lượng.
// Số không có trong dữ liệu (luật chỉ nằm trong mã IL2CPP) ghi [ƯỚC LƯỢNG]; số từ wiki ghi [WIKI].
(function () {
  'use strict';
  const SK = window.SK, DS = SK.DS, T = SK.TILE, W = SK.world, G = SK.G, R = DS.rules;
  const EMPTY_B = { buffs: {}, groups: {}, levels: {}, values: {}, statues: {}, shop: [], randomObjects: {}, weaponValue: {},
    price: { from: 4, per: 0.12, cap: 198, sale: 0.5 }, drops: { coin: { 0: 5, 1: 3, 2: 1 }, energy: 8 },
    well: { maxUse: 50, streakFrom: [28, 36], cost: 1 } };
  let B = window.SK_BUFFS86 || EMPTY_B, V = B.values || {};
  // index.html nên nạp data/sk-buffs86.js trước rooms.js; nếu quên thì tự nạp muộn (chọn buff cần dữ liệu này, tới lúc chơi đã xong).
  if (!window.SK_BUFFS86) {
    const sc = document.createElement('script');
    sc.src = 'data/sk-buffs86.js';
    sc.onload = () => { B = window.SK_BUFFS86 || B; V = B.values || {}; };
    sc.onerror = () => SK.warnOnce('buffs86', 'data/sk-buffs86.js không nạp được: buff/giá dùng dự phòng');
    document.head.appendChild(sc);
  }
  const ROOMS = SK.ROOMS = { force: { chest: null, special: null }, sndStats: {} };
  window.SK_ROOMS = ROOMS;

  // ---------------------------------------------------------------- tiện ích chung
  const has = id => { const p = G.player; return !!(p && p.buffs && p.buffs.indexOf(id) >= 0); };
  const targetable = e => e.st !== 'spawn' && e.st !== 'dead';
  const DEFAULT_HB = { size: [12, 16], off: [0, 8] };
  function hitsEnemy(e, x, y, r) {
    const hb = e.hb || DEFAULT_HB, s = e.scale || 1;
    const cx = e.x + hb.off[0] * (e.face || 1) * s, cy = e.y - hb.off[1] * s;
    return Math.abs(x - cx) < hb.size[0] * s / 2 + r && Math.abs(y - cy) < hb.size[1] * s / 2 + r;
  }
  const enemyMid = e => [e.x, e.y - ((e.hb || DEFAULT_HB).off[1]) * (e.scale || 1)];
  function nearestEnemy(x, y, maxD, skip) {
    let best = null, bd = maxD || 1e9;
    for (const e of G.enemies) {
      if (!targetable(e) || (skip && skip(e))) continue;
      const [ex, ey] = enemyMid(e), d = Math.hypot(ex - x, ey - y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  // Ô có tâm nằm trong hình chữ nhật thành vật cản (sàn vẫn vẽ; chỉ chặn đi lại và đạn).
  function blockRect(map, x0, y0, x1, y1) {
    for (let ty = Math.floor(y0 / T); ty <= Math.floor(y1 / T); ty++) for (let tx = Math.floor(x0 / T); tx <= Math.floor(x1 / T); tx++) {
      const cx = tx * T + 8, cy = ty * T + 8;
      if (cx < x0 || cx > x1 || cy < y0 || cy > y1) continue;
      const i = W.idx(map, tx, ty);
      if (map.tiles[i] === W.FLOOR) map.tiles[i] = W.OBST;
    }
  }
  const prefabPart = (pf, name) => pf && pf.find(q => q.n === name);
  const mbs = (name, cls) => SK.prefabMbs(SK.prefab(name), cls) || {};
  const rel = () => (G.stageIdx || 0) + 1;                 // [ĐO] GetRelativeLevelIndex: 1-1 = 1 ... 3-5 = 15
  const evenRound = v => { const r = Math.round(v); return r % 2 ? r + 1 : r; };
  const critMult = () => 1 + ((R.critMult || 2) - 1) * ((G.mods && G.mods.critDmgMul) || 1);
  // Nhân tố thử thách (G.mods, js/factors.js): số ô buff, số thẻ mỗi lần chọn, miễn phí vài lần mua đầu.
  const MD = () => G.mods || {};
  const buffSlots = () => Math.max(1, BUFF_SLOTS + (MD().buffSlots || 0));
  const buffChoices = () => Math.max(1, 3 + (MD().buffChoices || 0));
  function freeBuy() { const M = G.mods; if (M && M.freeBuys > 0) { M.freeBuys--; G.toast('Miễn phí!'); return true; } return false; }

  // Tiếng: sfx.js không mở hàm phát cho mô-đun khác, nên mở riêng một bộ phát nhỏ trên cùng AudioContext.
  const sbuf = {}, sload = {};
  function snd(name, vol) {
    const A = window.SK_AUDIO, fx = SK.sfx;
    if (!A || !fx || !name || !A.clips[name] || fx.mode !== 'on' || fx.muted || !fx.ctx || fx.ctx.state !== 'running') return false;
    ROOMS.sndStats[name] = (ROOMS.sndStats[name] || 0) + 1;
    const b = sbuf[name];
    if (b) {
      const c = fx.ctx, s = c.createBufferSource(), g = c.createGain();
      s.buffer = b; g.gain.value = vol == null ? 0.7 : vol; s.connect(g); g.connect(c.destination); s.start(0);
      return true;
    }
    if (!sload[name]) {
      sload[name] = fetch('art/audio/' + encodeURIComponent(A.clips[name].file)).then(r => r.arrayBuffer())
        .then(ab => new Promise((ok, no) => fx.ctx.decodeAudioData(ab, ok, no)))
        .then(x => { sbuf[name] = x; }).catch(() => { sbuf[name] = null; });
    }
    return false;
  }
  const clipOf = (prefab, key) => { const d = window.SK_AUDIO && SK_AUDIO.byPrefab[prefab]; const c = d && d[key]; return Array.isArray(c) ? c[0] : c; };
  const evClip = k => window.SK_AUDIO && SK_AUDIO.events[k];
  // Hiệu ứng thật (SK.vfx); trả về null nếu prefab chưa có trong data/sk-vfx.js.
  function vfx(name, x, y, o) {
    if (!SK.vfx || !window.SK_VFX || !SK_VFX.effects[name]) return null;
    try { return SK.vfx.spawn(G, name, x, y, o); } catch (e) { SK.warnOnce('vfx!' + name, 'vfx ' + name + ': ' + e.message); return null; }
  }
  function pay(n) {
    const p = G.player;
    if (freeBuy()) return true;
    if (p.gold < n) { G.toast('Không đủ vàng!'); snd('fx_error', 0.6); return false; }
    p.gold -= n;
    return true;
  }
  const inner = fn => { const old = G._bmInner; G._bmInner = true; try { return fn(); } finally { G._bmInner = old; } };
  const hurtE = (e, dmg, crit, ang, repel) => inner(() => SK.hurtEnemy(G, e, dmg, !!crit, ang || 0, repel == null ? 1 : repel));
  // Sóng xung: sprite effect04_20 thật của prefab explode_blast_out (màu [ĐO] c = 0,0.79,1), nở từ tâm ra bán kính rad rồi mờ dần.
  function ring(x, y, rad, tint, dur) {
    dur = dur || 0.45;
    G.props.push({ x, y: -1e9, t: 0, update(G2, pr, dt) { pr.t += dt; if (pr.t >= dur) pr.gone = true; },
      draw(ctx, G2, pr) {
        const k = pr.t / dur, s = (0.12 + 0.88 * k) * rad / 64;
        SK.drawTinted(ctx, 'effect04_20', x, y, [tint[0], tint[1], tint[2], 1 - k * k], { sx: s, sy: s * 0.8 });
      } });
  }

  // ---------------------------------------------------------------- giá
  // [ĐO RGContainer.CalculateItemValue] giá = gốc + int(gốc × hệ số); hệ số = (cấp − 2) × 0,12 khi cấp ≥ 4 và gốc ≤ 198;
  // Giảm Nửa Giá trừ thêm 0,5 vào hệ số, không xuống dưới 1.
  // Tính bằng số float32 như mã ARM (vmla.f32, vcvt.s32.f32 cắt về 0): 0,12f = 0,11999999732 làm 25×5×0,12 ra 14,9999991 → 14,
  // đúng với 39 ở 2-2 trong bảng giá wiki; tính bằng double sẽ ra 40.
  function priced(base) {
    const P = B.price, f32 = Math.fround;
    let f = 0;
    if (rel() >= P.from && base <= P.cap) f = f32(f32(rel() - 2) * f32(P.per));
    if (has(10)) f = f32(f - P.sale);
    return Math.max(1, Math.round((base + Math.trunc(f32(f * base))) * (MD().priceMul || 1)));
  }
  // Tượng: khớp 13/13 ô bảng "Coins" của wiki với hệ số 0,1 và trần gấp đôi giá gốc [WIKI, dựng từ bảng]; Giảm Nửa Giá không áp.
  function statuePrice(base) {
    let v = base;
    if (rel() >= 4) v = base + Math.trunc(base * (rel() - 2) * 0.1);
    return Math.min(v, base * 2);
  }
  ROOMS.priced = priced; ROOMS.statuePrice = statuePrice;
  const gradeBase = { 0: 20, 1: 20, 2: 20, 3: 36, 4: 40, 5: 50, 6: 50 };  // [ĐO] trung vị item_value theo hạng khi thiếu giá riêng
  function weaponBase(id) {
    const d = DS.weapons[id] || {}, A = window.SK_AUDIO;
    const pf = d.prefab || (A && A.byWeapon && A.byWeapon[id] && A.byWeapon[id].prefab);
    if (pf && B.weaponValue[pf]) return B.weaponValue[pf];
    const wk = window.SK_WIKI && SK_WIKI.weapons[id];
    return gradeBase[d.grade || (wk && wk.grade) || 1] || 20;
  }
  const weaponPrice = id => priced(weaponBase(id));

  // ---------------------------------------------------------------- trạng thái Thiêu Đốt / Trúng Độc lên quái
  // [WIKI Burn] 3 sát thương mỗi 0,5 s trong 1,5 s (5 nếu có Khiên Lửa); không dồn khi đang cháy.
  // Trúng độc: [ƯỚC LƯỢNG] 2 sát thương mỗi 1 s trong 4 s (+1 nếu có Khiên Chống Độc, wiki nói cộng 1).
  const STATUS = {
    burn: { tick: 0.5, dur: 1.5, fx: 'buff_fire', dmg: () => has(9) ? 5 : 3 },
    poison: { tick: 1, dur: 4, fx: 'buff_posion', dmg: () => has(8) ? 3 : 2 }
  };
  function applyStatus(e, kind) {
    if (!e || !targetable(e)) return;
    const S = STATUS[kind];
    e._bmSt = e._bmSt || {};
    if (e._bmSt[kind]) return;
    const h = vfx(S.fx, e.x, e.y - 6, { follow: e, dy: -6, dur: S.dur + 0.1 });
    e._bmSt[kind] = { t: S.dur, tick: S.tick, h };
    SK.emit('statusApply', G, e, kind);
  }
  function tickStatus(dt) {
    for (const e of G.enemies) {
      if (!e._bmSt) continue;
      for (const kind in e._bmSt) {
        const s = e._bmSt[kind], S = STATUS[kind];
        if (!targetable(e)) { if (s.h) s.h.kill(); delete e._bmSt[kind]; continue; }
        s.t -= dt; s.tick -= dt;
        if (s.tick <= 0) { s.tick += S.tick; hurtE(e, S.dmg(), false, 0, 0); }
        if (s.t <= 0) { if (s.h) s.h.stop(); delete e._bmSt[kind]; }
      }
    }
  }

  // ---------------------------------------------------------------- vật bay tự quản (đạn tượng, đạn phân tách)
  // Đạn lõi không xuyên, không đuổi mục tiêu, không mang trạng thái: các thứ đó tự quản lý ở đây.
  function shot(o) {
    const s = Object.assign({ r: 3, life: 3, hit: new Set(), t: 0, y0: o.y }, o);
    s.update = (G2, pr, dt) => {
      pr.t += dt; pr.life -= dt;
      if (pr.life <= 0) { pr.gone = true; return; }
      if (pr.homing) {
        const e = nearestEnemy(pr.x, pr.y, 160, q => pr.hit.has(q));
        if (e) {
          const [ex, ey] = enemyMid(e), want = Math.atan2(ey - pr.y, ex - pr.x), cur = Math.atan2(pr.vy, pr.vx);
          const da = Math.atan2(Math.sin(want - cur), Math.cos(want - cur)), turn = SK.clamp(da, -pr.homing * dt, pr.homing * dt);
          const sp = Math.hypot(pr.vx, pr.vy);
          pr.vx = Math.cos(cur + turn) * sp; pr.vy = Math.sin(cur + turn) * sp;
        }
      }
      const n = Math.max(1, Math.ceil(Math.hypot(pr.vx, pr.vy) * dt / 4));
      for (let k = 0; k < n && !pr.gone; k++) {
        pr.x += pr.vx * dt / n; pr.y += pr.vy * dt / n;
        if (W.solidAt(G.map, pr.x, pr.y + (pr.h || 6))) {
          const o2 = W.obstacleAt(G.map, pr.x, pr.y + (pr.h || 6));
          if (o2 && o2.kind === 'box') SK.hitObstacle(G, o2, pr.dmg);
          pr.gone = true; break;
        }
        for (const e of G.enemies) {
          if (!targetable(e) || pr.hit.has(e) || !hitsEnemy(e, pr.x, pr.y, pr.r)) continue;
          const crit = pr.canCrit && SK.chance(((G.player.crit || 0) + 0) / 100);
          hurtE(e, pr.dmg * (crit ? critMult() : 1), crit, Math.atan2(pr.vy, pr.vx), 1);
          if (pr.status) applyStatus(e, pr.status);
          if (pr.hitFx) vfx(pr.hitFx, pr.x, pr.y);
          pr.hit.add(e);
          if (!pr.pierce) { pr.gone = true; break; }
        }
      }
    };
    s.draw = (ctx, G2, pr) => {
      const a = Math.atan2(pr.vy, pr.vx), fr = pr.frame || pr.sprite, k = pr.scale || 1;
      if (fr && SK.draw(ctx, fr, pr.x, pr.y, { rot: a, sx: k, sy: k })) return;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(pr.x) - 1, Math.round(pr.y) - 1, 2, 2);
    };
    G.props.push(s);
    return s;
  }

  // ---------------------------------------------------------------- BUFF: bảng luật
  // Mỗi buff lấy tên, mô tả, biểu tượng từ SK_BUFFS86.buffs[BuffId]; phần code chỉ giữ luật chạy.
  // nums: số điền vào {0},{1}... của mô tả tiếng Việt chính thức.
  const DEF = ROOMS.DEF = {};
  const def = (id, o) => { DEF[id] = Object.assign({ active: true }, o); };

  // Số của các thiên phú bổ sung. [ĐO] = đọc từ Lua 8.6 trong SK_BUFFS86.values; [WIKI] = trang riêng của buff; [ƯỚC LƯỢNG] = không có nguồn.
  const VC = () => V.courage || { damage_factor_per_stack: 0.1, duration: 5, max_stack: 5 };
  const VE = () => V.elementalCycle || { cycle_duration: 5, missile_trigger_probability: 0.5, elemental_damage_factor: 0.5 };
  const VP = () => V.partyTime || { attack_speed_addition: 1, move_speed_addition: 1 };
  const GEM_MUL = 1.25;                                              // [WIKI Gem Generosity] ×1,25 đá quý cuối ván
  const TL = {
    emerg: { cd: 60, frac: 0.5 },                                   // [WIKI Armor Resilience] hồi 50% giáp (làm tròn xuống), 60 s
    qi: { cost: 2, dmg: 3, range: 7, half: 0.5 },                   // [WIKI Secret of Qi-gong] 3 sát thương, 2 năng lượng, 7 ô; nửa góc 0,5 rad [ƯỚC LƯỢNG]
    zap: { crit: 10, dmg: 4, cd: 1, chain: 2, reach: 4 },           // [WIKI Electric Pulse] +10% bạo kích, sét 4 sát thương, hồi 1 s, 2 mục tiêu lân cận; tầm 4 ô [ƯỚC LƯỢNG]
    focus: { rate: 0.05, crit: 5, spread: 2, max: 4, dur: 10 },     // [WIKI Stay Focused]
    echo: { dur: 1, cd: 2.5, dmg: 0.5, cdPer: 0.1, cdMin: 1, pool: 10 },   // [WIKI Arms Alignment]; cdPer/cdMin [ƯỚC LƯỢNG]
    spirit: { stacks: 10, stackDur: 5, dur: 5, range: 0.3, crit: 30 },     // [WIKI Martial Spirit] 10 tầng 5 s; dur/range/crit [ƯỚC LƯỢNG]
    pet: { dmg: 2, size: 1.5 },                                     // [WIKI Best Buddy] +100% sát thương, +50% cỡ (máu: thú cưng web không có máu)
    spike: { n: 3, dmg: 1 },                                        // [WIKI Icicle Spike]
    sculpt: { chance: 0.5, dmg: 12, r: 2, life: 8, spd: 70 },       // [WIKI Ice Sculpture]; tốc đuổi [ƯỚC LƯỢNG]
    nova: { chance: 0.4, dmg: 1, r: 2.5, life: 3, tick: 0.5 },      // [WIKI Frost Nova] 1 sát thương; r/life/tick [ƯỚC LƯỢNG]
    clone: { every: 8, dur: 4, dmg: 0.5 },                          // Ảo Ảnh Rừng: số không có nguồn [ƯỚC LƯỢNG]
    iceExtra: 1                                                     // Khiên Băng Giá: cộng thêm 1 s đóng băng [ƯỚC LƯỢNG]
  };

  def(1, { note: 'Đạn bạo kích xuyên qua địch [WIKI Piercing Crit]; lõi chỉ tung bạo kích một lần khi bắn (không tung lại mỗi lần xuyên) [ƯỚC LƯỢNG]' });
  def(2, { note: 'Súng laser +1 sát thương [WIKI Heightened Beams]; bề rộng tia không đổi' });
  def(3, { note: 'Súng chùm +2 viên [WIKI Shotgun Barrage]; tượng Phù Thủy/Thích Khách cũng +2' });
  def(4, { note: 'Cận chiến bật đạn địch lại [WIKI Reflexive Edge]' });
  def(5, { note: 'Tốc độ tụ lực gấp đôi [WIKI Rapid Charge; ĐO rapidcharge.lua charge_time_factor 0,5]' });
  def(6, { note: 'Còn giáp thì đòn vỡ giáp không trừ lan sang máu' });
  def(7, { note: 'Miễn bẫy gai và va chạm thân quái [WIKI Trap Shield]' });
  def(8, { note: 'Miễn giảm tốc từ ô chậm; độc gây thêm 1 [WIKI Poison Shield]' });
  def(9, { note: 'Miễn vụ nổ thùng đỏ; cháy gây 5 thay vì 3 [WIKI Fire Shield]' });
  def(10, { note: 'Giá cửa hàng −50% theo công thức RGContainer [ĐO]' });
  def(11, { note: 'Quái chết rơi cầu máu hồi 1 máu [WIKI]; xác suất 15% [ĐO talent/lifesiphon.lua]' });
  def(12, { nums: () => [(V.potion && V.potion.healPowerFactor || 1) * 100], note: 'Hồi phục gấp đôi (+100%) [ĐO potionenhancement.lua heal_power_factor 1]' });
  def(13, { note: 'Quái chết ~17% rơi cầu 8 năng lượng [WIKI Mana Harvest]' });
  def(14, { note: 'Đạn địch chậm 10%; tầm hút vàng 6→15, năng lượng 5→13 ô [WIKI Warping Touch]' });
  // Thợ Mỏ Đá Quý (ExpertGem): cuối ván đá quý ×1,25 [WIKI Gem Generosity]. Có trong bể TG_level2/3 (trọng số 10, không có ở TG_level1) [ĐO].
  // Cờ: runEnd gắn r.gemMul và G.gemBonus; js/lobby.js nhân hệ số khi đổi quái/vàng thành đá.
  def(15, { nums: [125], note: 'Cuối ván nhận đá quý ×1,25 [WIKI Gem Generosity]' });
  def(16, { note: 'Máu tối đa +4 và hồi 4 [WIKI Brave Heart]', apply(p) { p.hpMax += 4; p.hp += 4; } });
  def(18, { note: 'Bán kính 3 ô, xoá đạn địch khi giáp trúng đòn [WIKI Shield Blast]' });
  def(19, { note: 'Thùng vỡ: 3% bình máu, năng lượng 10%→12% [WIKI Looting Luck]' });
  def(20, { note: 'Giảm độ lệch tới 10, phần dư cộng vào tỉ lệ bạo kích [WIKI Precise Strike]' });
  def(21, { note: 'CDR 25 = hồi chiêu nhanh hơn 20% cho kỹ năng và tượng [WIKI Cooldown Rush]' });
  def(22, { note: 'Tượng kích hoạt lần hai sau 0,4 s; giữ được 2 tượng [WIKI Dual Statue]' });
  def(24, { note: 'Đạn nảy 1 lần khi chạm tường [WIKI Bouncing Bullets]' });
  def(25, { note: 'Túi 3 vũ khí: vòng đổi 1→2→3 [WIKI Extra Weapon]' });
  def(28, { note: 'Giáp tối đa +1', apply(p) { p.armorMax += 1; p.armor += 1; } });
  def(29, { note: 'Tầm cận chiến +20% [WIKI Long Reach]' });
  def(30, { note: 'Năng lượng tối đa +100 và hồi 100 [WIKI Mana Might]', apply(p) { p.energyMax += 100; p.energy += 100; } });
  def(32, { nums: [1, 3, 2, 5, 10], note: 'Mỗi phát +1 tầng 3 s, +2%/tầng, tối đa 5 tầng, đủ tầng +10% [WIKI Rapid Fire]' });
  def(33, { note: '50% quái nổ khi chết, 10 sát thương [WIKI Blast on Death]' });
  def(34, { note: 'Mỗi 100 vàng +1 giáp tối đa (tối đa 3) [WIKI Golden Armor]' });
  def(35, { note: 'Bạo kích +0..70, tốc bắn +0..30% theo máu/giáp đã mất [ĐO bloodrage.lua max_critical 70, max_attack_speed 0,3]' });
  def(36, { note: 'Bạo kích: chạy nhanh +30% trong 2 s; cứ 40 ô đi được hồi 1 giáp (thiếu giáp thì cất một lần) [WIKI Blitz Defense]' });
  def(2101, { nums: () => [V.whirlwind && V.whirlwind.cooldown || 4], note: 'Hạ quái bằng cận chiến: chém xoáy 8 sát thương, bán kính 5,25 ô, hồi 4 s [ĐO whirlwindslashruntime.lua]' });
  def(2102, { nums: [50], note: '50% đạn xa trúng sinh thêm 1 đạn hướng ngẫu nhiên, 75% cỡ, 50% sát thương [WIKI Split Shot]' });
  def(2103, { note: 'Đòn đầu tiên lên quái đầy máu luôn bạo kích [WIKI Well Begun]' });
  def(2106, { nums: [3], note: 'Tích động năng khi đi, đòn kế tiếp cộng tối đa 3 sát thương; đầy thì bạo kích + choáng 1 s [WIKI + ĐO kineticstrike.lua charge_distance 6]' });
  // Có trong bể thật nhưng chưa dùng được ở bản web: không đưa lên bảng chọn (lý do ở note).
  const OFF = {
    26: 'Bạo Phép Thuật (bản cũ): 8.6 không còn tên riêng', 27: 'Bạo Phép Thuật (bản cũ): 8.6 không còn tên riêng',
    31: 'Liên Kích Mưa: chưa có vũ khí đánh liên kích', 1023: 'Âm Dương Lưu Chuyển: chỉ dành riêng một nhân vật',
    1025: 'Nhà Mỹ Thực Ngục Tối: chưa có nguyên liệu thực phẩm'
  };
  for (const id in OFF) def(+id, { active: false, note: OFF[id] });

  const buffInfo = id => B.buffs[id] || { name: { vi: 'Buff ' + id }, info: { vi: '' }, icon: 'ui_buff_x' };
  function buffDesc(id) {
    const d = DEF[id], info = buffInfo(id).info;
    let t = (info && info.vi) || '';
    const nums = d && (typeof d.nums === 'function' ? d.nums() : d.nums) || [];
    nums.forEach((v, i) => { t = t.replace('{' + i + '}', v); });
    return t.replace(/\{\d+\}/g, '');
  }
  const buffName = id => (buffInfo(id).name || {}).vi || 'Buff ' + id;
  const buffIcon = id => buffInfo(id).icon;
  ROOMS.buffName = buffName; ROOMS.buffDesc = buffDesc; ROOMS.buffIcon = buffIcon;

  // ---------------------------------------------------------------- BUFF: chỉnh vũ khí (def bản sao)
  function buffedDef(base, p) {
    const d = Object.assign({}, base);
    if (has(3) && (d.pellets || 1) > 1) d.pellets += 2;
    if (has(20) && d.kind !== 'melee') {
      const cut = Math.min(10, d.spread || 0);
      d.spread = (d.spread || 0) - cut; d.crit = (d.crit || 0) + (10 - cut);
    }
    if (has(1020) && d.kind !== 'melee' && p && p.bm && p.bm.focusN) d.spread = Math.max(0, (d.spread || 0) - TL.focus.spread * p.bm.focusN);
    if (d.kind === 'melee') {
      let m = 1;
      if (has(29)) m += 0.2;
      if (p && p.bm && p.bm.wolfT > 0) m += 0.2;
      if (p && p.bm && p.bm.spiritT > 0) m += TL.spirit.range;
      if (m !== 1) d.range = (d.range || 24) * m;
    }
    if (has(5) && d.charge > 0) d.charge *= 0.5;
    if (has(2) && d.kind === 'laser') d.dmg = (d.dmg || 0) + 1;
    return d;
  }
  const baseMake = SK.makeWeapon;
  SK.makeWeapon = function (id) {
    const w = baseMake(id), p = G.player;
    if (p && p.buffs && w.def && (p.buffs.length || (p.bm && p.bm.wolfT > 0))) w.def = buffedDef(w.def, p);
    return w;
  };
  function refreshWeapons(p) {
    const list = p.weapons.concat([p.dual, p.extraW]);
    for (const w of list) if (w && DS.weapons[w.id]) w.def = buffedDef(DS.weapons[w.id], p);
  }
  ROOMS.refreshWeapons = refreshWeapons;

  // Nhân tố theo khoá để không giẫm lên kỹ năng/tượng đang sửa cùng biến.
  function setMul(p, key, val, field) {
    field = field || 'rateMul';
    const k = '_bm_' + field + '_' + key, old = p[k] || 1;
    if (old === val) return;
    p[field] = (p[field] == null ? 1 : p[field]) / old * val; p[k] = val;
  }
  // Tốc chạy: lõi nhân p.moveMul rồi tự gỡ theo p.moveMul đã đặt (so bằng ===), nên ta không đụng nó mà nhân vào bản sao p.h.speed.
  function setSpeed(p, key, val) {
    if (!p._spd) { p.h = Object.assign({}, p.h); p._baseSpeed = p.h.speed; p._spd = {}; }
    if ((p._spd[key] || 1) === val) return;
    p._spd[key] = val;
    let m = 1; for (const k in p._spd) m *= p._spd[k];
    p.h.speed = p._baseSpeed * m;
  }
  function setCrit(p, key, val) {
    const k = '_bc_' + key, old = p[k] || 0;
    if (old === val) return;
    p.crit += val - old; p[k] = val;
  }

  function takeBuff(p, id) {
    id = +id;
    const d = DEF[id]; if (!d || has(id)) return false;
    p.buffs.push(id);
    if (d.apply) d.apply(p);
    if (id === 25) lastCur = p.cur;
    refreshWeapons(p);
    SK.emit('buffTake', G, id);
    return true;
  }
  ROOMS.takeBuff = idOrKey => {
    const p = G.player; if (!p) return false;
    p.buffs = p.buffs || [];
    let id = +idOrKey;
    if (!(id > 0)) { const b = Object.values(B.buffs).find(x => x.key === idOrKey); id = b ? b.id : 0; }
    return takeBuff(p, id);
  };

  // ---------------------------------------------------------------- BUFF: chặn sát thương lên người chơi
  const baseHurt = SK.hurtPlayer;
  SK.hurtPlayer = function (G2, dmg, sx, sy, ...rest) {
    const p = G2.player;
    if (!p || p.st === 'dead' || p.invulT > 0 || !(dmg > 0)) return baseHurt(G2, dmg, sx, sy, ...rest);
    const bm = p.bm || (p.bm = {});
    // Khiên Kỵ Sĩ Thánh (tượng 7): chặn đúng một đòn
    if (bm.shield > 0) {
      bm.shield--; p.invulT = R.hurtInvuln;
      if (bm.shieldFx && !(bm.shield > 0)) { bm.shieldFx.stop(); bm.shieldFx = null; }
      snd('hit_shield', 0.7);
      ring(p.x, p.y - 4, 26, [0.3, 0.7, 1], 0.3);
      return false;
    }
    if (p.buffs && p.buffs.length) {
      const at = G2.enemies.find(e => e.x === sx && e.y === sy && e.st !== 'dead');
      // Khiên Gai: bẫy gai (không có nguồn) và thân quái đang xông/đi tới [ƯỚC LƯỢNG: đòn vũ khí cận chiến của quái vẫn trúng]
      const trap = sx == null && (W.obstacleAt(G2.map, p.x, p.y - 2) || {}).kind === 'sting';
      const body = at && (at.st === 'charge' || at.st === 'move');
      if (has(7) && (trap || body)) { p.invulT = 0.3; return false; }
      // Khiên Lửa: vụ nổ thùng đỏ vừa vỡ ngay chỗ đó
      if (has(9) && bm.boomT != null && G2.t - bm.boomT < 0.12 && Math.hypot(sx - bm.boomX, sy - bm.boomY) < 2) return false;
      if (has(6) && p.armor > 0 && dmg > p.armor) dmg = p.armor;
    }
    const before = p.armor;
    const hit = baseHurt(G2, dmg, sx, sy, ...rest);
    if (hit && p.buffs && p.buffs.length) {
      if (has(18) && before > p.armor) shieldBlast(p);
      // Khiên Khẩn Cấp (BuffId 38) không nằm trong bể thật ở bản này; Giáp Bền Bỉ cũ đã bỏ
    }
    return hit;
  };
  function shieldBlast(p) {
    // [WIKI Shield Blast] bán kính 3 ô, xoá phần lớn đạn địch, không sát thương; đi kèm Kiếm Phản Kích thì trả đạn.
    const R3 = 3 * T;
    ring(p.x, p.y - 4, R3, [0, 0.79, 1], 0.4);
    snd(clipOf('buff_statue_5', 'fire') || 'fx_skill_ploy', 0.5);
    for (const b of G.bullets) {
      if (b.side !== 'e' || b.dead || Math.hypot(b.x - p.x, b.y - (p.y - 6)) > R3) continue;
      if (has(4)) reflect(b); else b.dead = true;
    }
  }
  function reflect(b) {
    b.side = 'p'; b.vx = -b.vx; b.vy = -b.vy; b.crit = false; b.pierce = 0; b.hits = null; b.hit = 'hit_yellow';
    b.life = Math.max(b.life, 1.2); b.r = b.r || 2; b._bm = 1;
  }

  // ---------------------------------------------------------------- BUFF: chỉnh đòn đánh lên quái
  // Một chốt duy nhất lên SK.hurtEnemy: bạo kích chắc chắn (Tập Kích, động năng đầy) và sát thương cộng thêm.
  const baseHurtE = SK.hurtEnemy;
  SK.hurtEnemy = function (G2, e, dmg, crit, ang, repel, ...rest) {
    const p = G2.player;
    if (!G2._bmInner && p && p.buffs && p.buffs.length && e && targetable(e)) {
      const bm = p.bm || (p.bm = {});
      if (has(2103) && !crit && e.hp >= e.hpMax) { crit = true; dmg *= critMult(); }
      if (has(2106)) {
        const k = bm.kin || 0;
        if (k >= 100) {
          if (!crit) { crit = true; dmg *= critMult(); }
          if (e.st !== 'dead') { e.st = 'stun'; e.stT = Math.max(e.stT || 0, 1); e._stunT = Math.max(e._stunT || 0, 1); }
          vfx('hit_white', e.x, e.y - 8, { scale: 1.2 });
        }
        // [WIKI Kinetic Strike] 0~16 → +0, 17~50 → +1, 51~83 → +2, 84~100 → +3
        dmg += k >= 84 ? 3 : k >= 51 ? 2 : k >= 17 ? 1 : 0;
        bm.kin = 0;
      }
    }
    return baseHurtE.call(this, G2, e, dmg, crit, ang, repel, ...rest);
  };

  // ---------------------------------------------------------------- BUFF: sự kiện
  function onFire(G2, p, w) {
    if (!p.buffs) return;
    const bm = p.bm || (p.bm = {});
    // Đạn vừa bắn: từ cuối danh sách lùi tới đạn đã đánh dấu.
    for (let i = G2.bullets.length - 1; i >= 0; i--) {
      const b = G2.bullets[i];
      if (b._bm) break;
      b._bm = 1;
      if (b.side !== 'p' || b.vis) continue;
      if (bm.boostT > 0) {   // Tượng Berserker: +2 sát thương tính trước bạo kích, đạn to gấp đôi [WIKI]
        b.dmg += 2 * (b.crit ? critMult() : 1); b.r = (b.r || 2) * 2; b.scale = (b.scale || 1) * 2;
      }
      if (has(1) && b.crit) b.pierce = Math.max(b.pierce || 0, 4);
      if (has(24) && !b.boom && b.kind !== 'wave') b._bounce = 1;
    }
    if (has(32)) { bm.rapidN = Math.min(5, (bm.rapidN || 0) + 1); bm.rapidT = 3; }
    if (w && w.def && w.def.kind === 'melee' && has(4)) bm.reflectT = 0.22;
  }
  SK.on('fire', onFire);

  SK.on('enemyHit', (G2, e, dmg, crit) => {
    const p = G2.player;
    if (!p || !p.buffs || G2._bmInner) return;
    const w = p.weapons[p.cur], ranged = w && w.def && w.def.kind !== 'melee';
    if (has(36) && crit) { p.bm.blitzT = 2; }
    if (has(2102) && ranged && e.st !== 'dead' && SK.chance(0.5)) {
      // [WIKI Split Shot] hướng ngẫu nhiên, 75% cỡ, 50% sát thương làm tròn chẵn, không dính bạo kích của người chơi
      const a = SK.rand() * Math.PI * 2, d = w.def, sp = (d.bulletSpeed || 16) * SK.PPU;
      const [ex, ey] = enemyMid(e);
      shot({ x: ex, y: ey, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg: Math.max(2, evenRound(dmg / (crit ? critMult() : 1) * 0.5)),
        r: 2, life: 0.9, sprite: d.bullet, scale: 0.75, canCrit: false, split: true });
    }
  });

  SK.on('enemyKill', (G2, e) => {
    const p = G2.player; if (!p || !p.buffs) return;
    const [x, y] = enemyMid(e);
    if (has(11) && SK.chance((V.lifeSiphon && V.lifeSiphon.prob || 15) / 100)) orb('hp', x, y);
    if (has(13) && SK.chance(0.17)) orb('en', x, y);
    if (has(33) && SK.chance(0.5)) {
      vfx('explode_s', e.x, e.y - 6, { state: 'explode_small' });
      G.shake = Math.max(G.shake, 3); snd('fx_box_destroy', 0.5);
      for (const q of G.enemies) {
        if (!targetable(q)) continue;
        const [qx, qy] = enemyMid(q);
        if (Math.hypot(qx - e.x, qy - (e.y - 6)) < 40) hurtE(q, 10, false, Math.atan2(qy - y, qx - x), 3);   // bán kính 2,5 ô [ƯỚC LƯỢNG]
      }
    }
    const w = p.weapons[p.cur];
    if (has(2101) && w && w.def && w.def.kind === 'melee' && !(p.bm.wwCd > 0)) whirlwind(p);
  });
  // Trảm Lốc Xoáy: 4 vệt chém sword_slash_white_0..3 thật quay quanh người + sóng trắng nở tới bán kính chém.
  // (Prefab whirl_wind của 8.6 chỉ có collider và tiếng; hiệu ứng hạt gần nhất `whirl_wind_365` là ma thuật tím và
  // `bullet_buff_whirlwind_slash` dùng shader nhiễu, runtime SK.vfx không vẽ được.)
  function whirlFx(x, y, rad) {
    ring(x, y + 2, rad, [1, 1, 1], 0.4);
    G.props.push({ x, y: y + 6, t: 0, update(G2, pr, dt) { pr.t += dt; if (pr.t > 0.42) pr.gone = true; },
      draw(ctx, G2, pr) {
        const k = pr.t / 0.42, fr = 'sword_slash_white_' + (Math.floor(pr.t * 24) % 4), s = rad / 34;
        for (let i = 0; i < 4; i++) {
          const a = pr.t * 16 + i * Math.PI / 2, rr = rad * (0.35 + 0.5 * k);
          SK.draw(ctx, fr, x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8, { rot: a + Math.PI / 2, sx: s, sy: s, alpha: 1 - k * k });
        }
      } });
  }
  function whirlwind(p) {
    const Wv = V.whirlwind || { cooldown: 4, damage: 8, size: 5.25, repel: 3 };
    p.bm.wwCd = Wv.cooldown;
    const x = p.x, y = p.y - 8, rad = Wv.size * T;
    whirlFx(x, y, rad);
    snd('whirlwind', 0.7); G.shake = Math.max(G.shake, 2);
    for (const q of G.enemies) {
      if (!targetable(q)) continue;
      const [qx, qy] = enemyMid(q);
      if (Math.hypot(qx - x, qy - y) < rad) hurtE(q, Wv.damage, false, Math.atan2(qy - y, qx - x), Wv.repel);
    }
    for (const b of G.bullets) if (b.side === 'e' && Math.hypot(b.x - x, b.y - y) < rad) b.dead = true;
  }

  // Thùng vỡ: nền 10% rơi cầu năng lượng [WIKI Looting Luck: "từ 10% lên 12%"]; Người Nhặt Phế Liệu +2% và 3% bình máu.
  SK.on('obstacleBreak', (G2, o) => {
    const p = G2.player; if (!p) return;
    const bm = p.bm || (p.bm = {});
    if (o.explode) { bm.boomT = G2.t; bm.boomX = o.x; bm.boomY = o.y; }
    if (o.kind !== 'box') return;
    const luck = has(19);
    if (luck && SK.chance(0.03)) SK.dropPickup(G, 'hp_pot', o.x, o.y - 4);
    else if (SK.chance(luck ? 0.12 : 0.10)) SK.dropPickup(G, 'energy', o.x, o.y - 4);
  });
  SK.on('pickup', (G2, kind) => {
    const p = G2.player;
    if (!has(12)) return;
    const k = V.potion && V.potion.healPowerFactor || 1;   // hồi thêm phần bằng cỡ gốc [ĐO heal_power_factor 1]
    if (kind === 'hp_pot') p.hp = Math.min(p.hpMax, p.hp + (mbs('health_pot', 'RGHealthPot').health || 2) * k);
    if (kind === 'en_pot') p.energy = Math.min(p.energyMax, p.energy + (mbs('energy_pot', 'RGEnergyPot').energy || 80) * k);
    if (kind === 'energy') p.energy = Math.min(p.energyMax, p.energy + (B.drops.energy || R.energyOrb) * k);
  });
  SK.on('skill', (G2, p) => { if (p.statues && p.statues.length) fireStatues(p); });

  // Cầu máu / năng lượng bay thẳng về người chơi dù ở xa [WIKI Life Harvest, Mana Harvest]; hình = prefab `effect_health` / `energy` thật.
  function orb(kind, x, y) {
    G.props.push({
      x, y, t: 0, kind,
      update(G2, pr, dt) {
        pr.t += dt;
        const p = G.player;
        if (pr.t < 0.35) { pr.y -= 20 * dt; return; }
        const dx = p.x - pr.x, dy = p.y - 8 - pr.y, d = Math.hypot(dx, dy), s = 90 + pr.t * 160;
        if (d < 6) {
          pr.gone = true;
          if (kind === 'hp') { const n = has(12) ? 2 : 1; p.hp = Math.min(p.hpMax, p.hp + n); SK.num(G, p.x, p.y - 26, '+' + n, '#ff6a6a'); vfx('effect_health', p.x, p.y - 8, { follow: p, dy: -8 }); snd(evClip('hpPot'), 0.5); }
          else { const n = (B.drops.energy || 8) * (has(12) ? 2 : 1); p.energy = Math.min(p.energyMax, p.energy + n); SK.num(G, p.x, p.y - 26, '+' + n, '#6ac8ff'); snd(evClip('energy'), 0.5); }
          return;
        }
        pr.x += dx / d * s * dt; pr.y += dy / d * s * dt;
      },
      draw(ctx, G2, pr) {
        if (kind === 'en') SK.drawPrefab(ctx, SK.art.object('energy_orb'), pr.x, pr.y, { t: pr.t });
        else if (!SK.draw(ctx, 'objects_common_18', pr.x, pr.y, { sx: 0.6, sy: 0.6 })) SK.drawPrefab(ctx, SK.prefab('health_pot'), pr.x, pr.y, { scale: 0.6 });
      }
    });
  }

  // ---------------------------------------------------------------- THIÊN PHÚ BỔ SUNG (id theo BuffId; số ở TL)
  // Mô tả chính thức (info.vi) là luật. Web chưa có đạn mang nguyên tố trên vũ khí nên "đang chịu nguyên tố/đóng băng" nghĩa là
  // quái đang có trạng thái từ kỹ năng, tượng hay Luân Chuyển Nguyên Tố (SK.skillKit.debuff, rooms.js applyStatus).
  def(17, { nums: [50, 100], note: 'Thú cưng +50% cỡ, +100% sát thương [WIKI Best Buddy]; máu thú cưng: bản web không có máu thú cưng nên chưa làm' });
  def(23, { note: 'Quái bị đóng băng thêm 1 s [ƯỚC LƯỢNG]; người chơi chưa có nguồn đóng băng nên miễn dịch chỉ là hình thức' });
  def(38, { note: 'Giáp vỡ thì hồi ngay 50% giáp tối đa (làm tròn xuống), 60 s một lần [WIKI Armor Resilience]' });
  def(39, { note: 'Tay không (Đấu Khí Quyền, Cú Đấm Thiên Địa, Nắm Tay Thứ Nguyên) tung sóng khí công hình quạt 7 ô, 3 sát thương, 2 năng lượng, xoá đạn địch [WIKI Secret of Qi-gong]' });
  def(40, { note: 'Bạo kích lên quái đang chịu nguyên tố gây gấp đôi [mô tả chính thức]; phần "Gậy mạnh hơn": không có số nên chưa làm' });
  def(41, { nums: [TL.zap.crit], apply(p) { p.crit += TL.zap.crit; }, note: 'Bạo kích +10%; dùng kỹ năng hoặc bạo kích thì sét 4 sát thương lên mục tiêu và 2 quái gần, hồi 1 s [WIKI Electric Pulse]' });
  def(1015, { nums: [TL.spike.n], note: 'Bạo kích lên quái đang đóng băng bắn 3 mũi băng xuyên, mỗi mũi 1 sát thương [WIKI Icicle Spike]' });
  def(1016, { nums: ['50%', TL.sculpt.r, TL.sculpt.dmg], note: 'Quái chết khi đang đóng băng 50% thành tượng băng đuổi quái, nổ 12 sát thương bán kính 2 ô, sống 8 s [WIKI Ice Sculpture]' });
  def(1017, { nums: ['40%'], note: 'Quái chết khi đang đóng băng 40% nở vòng sương băng 1 sát thương [WIKI Frost Nova]; thời gian, bán kính [ƯỚC LƯỢNG]' });
  def(1018, { nums: [TL.clone.every], note: 'Mỗi 8 s (trong trận) sinh ảo ảnh bắn tự động 4 s, nửa sát thương: toàn bộ số [ƯỚC LƯỢNG]' });
  def(1020, { nums: [TL.focus.rate * 100, TL.focus.crit, TL.focus.spread, TL.focus.max, TL.focus.dur], note: 'Mỗi quái hạ: tốc bắn +5%, bạo kích +5%, độ lệch −2, tối đa 4 tầng, 10 s [WIKI Stay Focused]' });
  def(1024, { note: 'Sau một đòn đánh, một vũ khí tầm xa đã nhặt (tối đa 10) bắn thêm 1 s nửa sát thương, không tốn năng lượng, nghỉ 2,5 s giảm dần theo số súng [WIKI Arms Alignment]' });
  def(2105, { nums: () => [VE().cycle_duration, VE().missile_trigger_probability * 100, VE().elemental_damage_factor * 100], note: 'Đổi Thiêu Đốt, Đóng Băng, Trúng Độc, Cảm Điện mỗi 5 s; đòn trúng 50% gây hiệu ứng, sát thương theo thời gian của nó +50% [ĐO elementalcycle.lua]' });
  def(2108, { nums: () => [VP().attack_speed_addition * 100, VP().move_speed_addition * 100], note: 'Trong trận thú cưng đánh nhanh và chạy nhanh gấp đôi [ĐO partytime.lua addition 1 = +100%, cách đọc đơn vị ƯỚC LƯỢNG]' });
  def(2118, { nums: [25, 1], note: 'Gây trạng thái xấu lên quái: 25% hồi 1 giáp [WIKI Elemental Blessing]' });
  def(2145, { nums: () => [VC().damage_factor_per_stack * 100, VC().max_stack], note: 'Mỗi lần dùng kỹ năng +10% sát thương, tối đa 5 tầng 5 s; máu còn 1 thì đầy tầng [ĐO courage.lua + WIKI Hero\'s Valor]' });
  def(2146, { nums: [TL.spirit.stackDur, TL.spirit.stacks, TL.spirit.dur], note: 'Mỗi đòn trúng +1 Đấu Chí 5 s, đủ 10 tầng thì Hồn Giác Đấu 5 s: tầm cận chiến +30%, bạo kích +30% [WIKI Martial Spirit; số Hồn Giác Đấu ƯỚC LƯỢNG]' });

  const BARE = /^(GunInitFighter|WeaponInitAirbender|GunInitTranscendent)$/;
  const dotHit = () => G._skHit === 'dot';
  const dbOn = (e, k) => !!(e._db && e._db[k] && e._db[k].t > 0);
  const iced = e => dbOn(e, 'ice');
  function elemOf(e) {
    if (e._db) for (const k in e._db) if (e._db[k] && e._db[k].t > 0 && k !== 'dizzy' && k.indexOf('gas') !== 0) return k;
    if (e._bmSt) for (const k in e._bmSt) return k;
    return null;
  }
  const bmOf = p => p.bm || (p.bm = {});
  const kit = () => SK.skillKit || {};
  function bolt(a, b, dur) { const K = kit(); if (K.boltProp) K.boltProp(G, a, b, dur); }

  // Khiên Khẩn Cấp (38)
  const prevHurtP = SK.hurtPlayer;
  SK.hurtPlayer = function (G2, dmg, ...rest) {
    const p = G2.player, before = p ? p.armor : 0;
    const hit = prevHurtP.call(this, G2, dmg, ...rest);
    if (hit && p && has(38) && before > 0 && p.armor <= 0 && !(bmOf(p).armCd > 0)) {
      const n = Math.floor(p.armorMax * TL.emerg.frac);
      if (n > 0) {
        p.armor = n; bmOf(p).armCd = TL.emerg.cd;
        SK.num(G2, p.x, p.y - 30, '+' + n, '#c9d2df'); vfx('effect_health_green', p.x, p.y - 8, { follow: p, dy: -8, scale: 0.8 });
        snd(clipOf('buff_statue_5', 'fire') || 'fx_skill_ploy', 0.4);
      }
    }
    return hit;
  };

  // Bạo Phép Thuật (40) và Gan Góc Dũng Cảm (2145): chỉnh sát thương trước khi trừ máu
  const prevHurtE = SK.hurtEnemy;
  SK.hurtEnemy = function (G2, e, dmg, crit, ang, repel, ...rest) {
    const p = G2.player;
    if (!G2._bmInner && p && p.buffs && p.buffs.length && e && targetable(e) && !dotHit()) {
      const bm = bmOf(p);
      if (has(40) && crit && elemOf(e)) dmg *= 2;
      if (has(2145) && bm.valorN > 0) dmg = Math.round(dmg * (1 + VC().damage_factor_per_stack * bm.valorN));
    }
    return prevHurtE.call(this, G2, e, dmg, crit, ang, repel, ...rest);
  };

  function zap(e) {
    const p = G.player, bm = bmOf(p);
    if (!e || !targetable(e) || bm.zapCd > 0) return;
    bm.zapCd = TL.zap.cd;
    const [x, y] = enemyMid(e), list = [e];
    for (const q of G.enemies) {
      if (list.length > TL.zap.chain) break;
      if (q === e || !targetable(q)) continue;
      const [qx, qy] = enemyMid(q);
      if (Math.hypot(qx - x, qy - y) < TL.zap.reach * T) list.push(q);
    }
    snd('fx_skill_ploy', 0.3);
    for (const q of list) {
      const [qx, qy] = enemyMid(q);
      bolt([qx, qy - 90], [qx, qy], 0.25);
      vfx('effect_shock1', qx, qy, { scale: 0.8 });
      hurtE(q, TL.zap.dmg, false, Math.atan2(qy - y, qx - x), 0);
    }
  }
  function iceFx(x, y, r, dur) {
    G.props.push({ x, y: -1e9, t: 0, update(G2, pr, dt) { pr.t += dt; if (pr.t >= dur) pr.gone = true; },
      draw(ctx, G2, pr) { const k = pr.t / dur; ctx.save(); ctx.globalAlpha = 0.5 * (1 - k); ctx.fillStyle = '#a8e6ff'; ctx.beginPath(); ctx.arc(x, y, r * (0.3 + 0.7 * k), 0, 6.283); ctx.fill(); ctx.restore(); } });
  }
  function iceSpikes(e) {
    const [x, y] = enemyMid(e), a0 = SK.rand() * 6.283;
    for (let i = 0; i < TL.spike.n; i++) {
      const a = a0 + i * 6.283 / TL.spike.n;
      const s = shot({ x, y, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, dmg: TL.spike.dmg, r: 2, life: 0.7, canCrit: false, pierce: 1, spike: true });
      s.draw = (ctx, G2, pr) => { ctx.fillStyle = '#b9efff'; ctx.fillRect(Math.round(pr.x) - 1, Math.round(pr.y) - 1, 3, 3); };
    }
  }
  function iceSculpture(e) {
    const S = TL.sculpt, me = { x: e.x, y: e.y - 6, t: 0, life: S.life, sculpt: true };
    const boom = () => {
      me.gone = true; const R = S.r * T;
      ring(me.x, me.y, R, [0.6, 0.9, 1], 0.4); iceFx(me.x, me.y, R, 0.4); snd('fx_box_destroy', 0.4);
      for (const q of G.enemies) {
        if (!targetable(q)) continue;
        const [qx, qy] = enemyMid(q);
        if (Math.hypot(qx - me.x, qy - me.y) < R) { hurtE(q, S.dmg, false, Math.atan2(qy - me.y, qx - me.x), 2); if (kit().debuff) kit().debuff(G, q, 'ice'); }
      }
    };
    G.props.push(Object.assign(me, {
      update(G2, pr, dt) {
        pr.t += dt; pr.life -= dt;
        const q = nearestEnemy(pr.x, pr.y, 220);
        if (q) {
          const [qx, qy] = enemyMid(q), d = Math.hypot(qx - pr.x, qy - pr.y);
          if (d < 10) { boom(); return; }
          const s = Math.min(d, S.spd * dt); pr.x += (qx - pr.x) / d * s; pr.y += (qy - pr.y) / d * s;
        }
        if (pr.life <= 0) boom();
      },
      draw(ctx, G2, pr) { ctx.fillStyle = '#d6f6ff'; ctx.fillRect(Math.round(pr.x) - 4, Math.round(pr.y) - 8 + Math.sin(pr.t * 6), 8, 12); ctx.fillStyle = '#7fcfee'; ctx.fillRect(Math.round(pr.x) - 2, Math.round(pr.y) - 6, 4, 8); }
    }));
  }
  function frostNova(x, y) {
    const N = TL.nova, R = N.r * T;
    G.props.push({ x, y: -1e9, t: 0, k: 0, nova: true, update(G2, pr, dt) {
      pr.t += dt; pr.k -= dt;
      if (pr.k <= 0) {
        pr.k += N.tick;
        for (const q of G.enemies) { if (!targetable(q)) continue; const [qx, qy] = enemyMid(q); if (Math.hypot(qx - x, qy - y) < R) hurtE(q, N.dmg, false, 0, 0); }
      }
      if (pr.t >= N.life) pr.gone = true;
    }, draw(ctx, G2, pr) { ctx.save(); ctx.globalAlpha = 0.3 * (1 - pr.t / N.life * 0.6); ctx.fillStyle = '#a8e6ff'; ctx.beginPath(); ctx.arc(x, y, R, 0, 6.283); ctx.fill(); ctx.restore(); } });
  }
  function qiWave(p) {
    const Q = TL.qi, a = p.aim, x = p.x, y = p.y - 8, R = Q.range * T;
    const inCone = (px, py) => Math.hypot(px - x, py - y) < R && Math.abs(Math.atan2(Math.sin(Math.atan2(py - y, px - x) - a), Math.cos(Math.atan2(py - y, px - x) - a))) < Q.half;
    G.props.push({ x, y: -1e9, t: 0, update(G2, pr, dt) { pr.t += dt; if (pr.t > 0.3) pr.gone = true; },
      draw(ctx, G2, pr) { const k = pr.t / 0.3; ctx.save(); ctx.globalAlpha = 0.45 * (1 - k); ctx.fillStyle = '#bfe3ff'; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, R * (0.2 + 0.8 * k), a - Q.half, a + Q.half); ctx.closePath(); ctx.fill(); ctx.restore(); } });
    for (const q of G.enemies) {
      if (!targetable(q)) continue;
      const [qx, qy] = enemyMid(q);
      if (inCone(qx, qy)) hurtE(q, Q.dmg, false, a, 1);
    }
    for (const b of G.bullets) if (b.side === 'e' && !b.dead && inCone(b.x, b.y)) { if (has(4)) reflect(b); else b.dead = true; }
  }

  // Bắn thêm một khẩu vũ khí bằng WEAPON_KINDS (không tốn năng lượng, không phát sự kiện 'fire'); đạn mới giảm sát thương theo k.
  function extraFire(w, ang, x, y) {
    const p = G.player, d = w && w.def; if (!d) return;
    try { (SK.WEAPON_KINDS[d.kind] || SK.WEAPON_KINDS.gun).fire(G, p, w, { x: x + Math.cos(ang) * 8, y: y + Math.sin(ang) * 8, ang, side: 1, charge: 1 }); }
    catch (err) { SK.warnOnce('xfire', 'bắn thêm: ' + err.message); }
  }
  function scaleNew(n0, k) {
    for (let i = n0; i < G.bullets.length; i++) { const b = G.bullets[i]; if (b.side === 'p') { b._bm = 1; b._xtra = 1; b.dmg = Math.max(1, Math.round(b.dmg * k)); } }
  }
  function drainQ(w, dt) {
    if (!w || !w.q || !w.q.length) return;
    for (const q of w.q) q.t -= dt;
    const due = w.q.filter(q => q.t <= 0); w.q = w.q.filter(q => q.t > 0);
    for (const q of due) q.fn();
  }
  const xPeriod = w => { const f = w.def && w.def.w86 && w.def.w86.fire; return Math.min(0.6, Math.max(0.15, (f && f.period) || 0.33)); };
  const rangedPool = bm => (bm.echoPool || []).filter(id => DS.weapons[id] && DS.weapons[id].kind !== 'melee');

  function echoTick(p, bm, dt) {
    const pool = bm.echoPool || (bm.echoPool = []);
    for (const w of [p.weapons[0], p.weapons[1], p.extraW, p.dual]) if (w && w.id && DS.weapons[w.id] && pool.indexOf(w.id) < 0) { pool.push(w.id); if (pool.length > TL.echo.pool) pool.shift(); }
    if (bm.echoCd > 0) bm.echoCd -= dt;
    if (!(bm.echoT > 0)) return;
    const w = bm.echoW; if (!w) { bm.echoT = 0; return; }
    bm.echoT -= dt; bm.echoNext -= dt;
    const n0 = G.bullets.length;
    drainQ(w, dt);
    if (bm.echoNext <= 0) { bm.echoNext += xPeriod(w); extraFire(w, p.aim, p.x, p.y - 8); }
    scaleNew(n0, TL.echo.dmg);
    if (bm.echoT <= 0) { bm.echoW = null; bm.echoCd = Math.max(TL.echo.cdMin, TL.echo.cd - TL.echo.cdPer * (pool.length - 1)); }
  }
  function cloneTick(p, bm, dt) {
    const C = TL.clone;
    if (bm.cloneT > 0) {
      bm.cloneT -= dt; bm.cloneNext -= dt;
      const c = bm.clone; c.x = p.x - p.face * 14; c.y = p.y + 3;
      const w = bm.cloneW, n0 = G.bullets.length;
      drainQ(w, dt);
      if (w && bm.cloneNext <= 0) {
        const e = nearestEnemy(c.x, c.y - 8, 200);
        if (e) { const [ex, ey] = enemyMid(e); extraFire(w, Math.atan2(ey - (c.y - 8), ex - c.x), c.x, c.y - 8); bm.cloneNext = Math.max(0.3, xPeriod(w)); }
      }
      scaleNew(n0, C.dmg);
      if (bm.cloneT <= 0) { c.gone = true; bm.clone = null; bm.cloneW = null; bm.cloneCd = C.every; }
    } else if (G.room && G.room.state === 'locked') {
      bm.cloneCd = (bm.cloneCd == null ? 1 : bm.cloneCd) - dt;
      const cw = p.weapons[p.cur];
      if (bm.cloneCd <= 0 && cw && cw.def && cw.def.kind !== 'melee') {
        bm.cloneW = SK.makeWeapon(cw.id); bm.cloneT = C.dur; bm.cloneNext = 0.2;
        bm.clone = { x: p.x, y: p.y, t: 0, update(G2, pr, d2) { pr.t += d2; }, draw(ctx, G2, pr) {
          const fr = p.anims && SK.animFrame(p.anims.idle, pr.t);
          if (fr) SK.drawTinted(ctx, fr, pr.x, pr.y, [0.35, 0.8, 0.45, 1], { alpha: 0.6, flip: p.face < 0 });
        } };
        G.props.push(bm.clone);
      } else if (bm.cloneCd <= 0) bm.cloneCd = 1;
    }
  }
  function petTick(p) {
    const a = G.pet; if (!a || !a.k) return;
    const b = a._tl || (a._tl = { dmg: a.k.dmg, cd: a.k.cd, spd: a.k.spd, scale: a.scale == null ? 1 : a.scale });
    let dm = 1, sz = 1, as = 1, ms = 1;
    if (has(17)) { dm = TL.pet.dmg; sz = TL.pet.size; }
    if (has(2108) && G.room && G.room.state === 'locked') { as = 1 + VP().attack_speed_addition; ms = 1 + VP().move_speed_addition; }
    a.k.dmg = b.dmg * dm; a.scale = b.scale * sz; a.k.cd = b.cd / as; a.k.spd = b.spd * ms;
  }
  function armorOnDebuff(p) {
    if (!SK.chance(0.25) || p.armor >= p.armorMax) return;
    p.armor++; SK.num(G, p.x, p.y - 30, '+1', '#c9d2df'); vfx('effect_health_green', p.x, p.y - 8, { follow: p, dy: -8, scale: 0.6 });
  }
  function talentTick(p, bm, dt) {
    if (bm.zapCd > 0) bm.zapCd -= dt;
    if (bm.armCd > 0) bm.armCd -= dt;
    if (has(2145)) {
      if (p.hp <= 1 && p.hp > 0) { bm.valorN = VC().max_stack; bm.valorT = VC().duration; }
      if (bm.valorT > 0 && (bm.valorT -= dt) <= 0) bm.valorN = 0;
    }
    if (has(1020)) {
      if (bm.focusT > 0 && (bm.focusT -= dt) <= 0) bm.focusN = 0;
      const n = bm.focusN || 0;
      setMul(p, 'focus', 1 + TL.focus.rate * n); setCrit(p, 'focus', TL.focus.crit * n);
      if (n !== bm.focusApplied) { bm.focusApplied = n; refreshWeapons(p); }
    }
    if (has(2146)) {
      const on = bm.spiritT > 0;
      if (on) bm.spiritT -= dt;
      const now = bm.spiritT > 0;
      setCrit(p, 'spirit', now ? TL.spirit.crit : 0);
      if (on && !now) refreshWeapons(p);
    }
    if (has(2105)) bm.cycT = (bm.cycT || 0) + dt;
    if (has(2118) || has(23)) {
      for (const e of G.enemies) {
        if (!targetable(e)) continue;
        if (e._db) for (const k in e._db) {
          const b = e._db[k]; if (!b || b._tl) continue;
          b._tl = 1;
          if (k === 'ice' && has(23)) { b.t += TL.iceExtra; if (kit().stun) kit().stun(e, b.t); }
          if (has(2118)) armorOnDebuff(p);
        }
        if (e._bmSt) for (const k in e._bmSt) { const b = e._bmSt[k]; if (b && !b._tl) { b._tl = 1; if (has(2118)) armorOnDebuff(p); } }
      }
    }
    if (has(1024)) echoTick(p, bm, dt);
    if (has(1018)) cloneTick(p, bm, dt);
    if (has(17) || has(2108)) petTick(p);
  }
  function cycleKind(bm) { const K = ['fire', 'ice', 'poison', 'ele']; return K[Math.floor((bm.cycT || 0) / VE().cycle_duration) % 4]; }
  ROOMS.cycleKind = () => cycleKind(bmOf(G.player));

  SK.on('skill', (G2, p) => {
    if (!p.buffs || !p.buffs.length) return;
    const bm = bmOf(p);
    if (has(2145)) { bm.valorN = Math.min(VC().max_stack, (bm.valorN || 0) + 1); bm.valorT = VC().duration; }
    if (has(41)) zap(nearestEnemy(p.x, p.y - 8, 160));
  });
  SK.on('fire', (G2, p, w) => {
    if (!p.buffs || !p.buffs.length || !w || !w.def) return;
    const bm = bmOf(p);
    if (has(39) && w.def.w86 && BARE.test(w.def.w86.cls) && p.energy >= TL.qi.cost) { p.energy -= TL.qi.cost; qiWave(p); }
    if (has(1024) && !(bm.echoCd > 0) && !(bm.echoT > 0)) {
      const ids = rangedPool(bm);
      if (ids.length) { bm.echoW = SK.makeWeapon(ids[Math.floor(SK.rand() * ids.length)]); bm.echoT = TL.echo.dur; bm.echoNext = 0; }
    }
  });
  SK.on('enemyHit', (G2, e, dmg, crit) => {
    const p = G2.player;
    if (!p || !p.buffs || !p.buffs.length || G2._bmInner || dotHit()) return;
    const bm = bmOf(p);
    if (has(41) && crit) zap(e);
    if (has(1015) && crit && iced(e)) iceSpikes(e);
    if (has(2146)) {
      const now = G2.t;
      if (!(bm.spiritT > 0)) {
        bm.will = (bm.will || []).filter(t => t > now); bm.will.push(now + TL.spirit.stackDur);
        if (bm.will.length >= TL.spirit.stacks) { bm.will = []; bm.spiritT = TL.spirit.dur; setCrit(p, 'spirit', TL.spirit.crit); refreshWeapons(p); }
      }
    }
    if (has(2105) && e.st !== 'dead' && SK.chance(VE().missile_trigger_probability) && kit().debuff) {
      const k = cycleKind(bm), b = kit().debuff(G, e, k);
      if (b && b.dmg && !b._cyc) { b.dmg *= 1 + VE().elemental_damage_factor; b._cyc = 1; }
    }
  });
  SK.on('enemyKill', (G2, e) => {
    const p = G2.player; if (!p || !p.buffs || !p.buffs.length) return;
    const bm = bmOf(p);
    if (has(1020)) { bm.focusN = Math.min(TL.focus.max, (bm.focusN || 0) + 1); bm.focusT = TL.focus.dur; }
    if (iced(e)) {
      if (has(1016) && SK.chance(TL.sculpt.chance)) iceSculpture(e);
      if (has(1017) && SK.chance(TL.nova.chance)) frostNova(e.x, e.y - 6);
    }
  });

  // ---------------------------------------------------------------- BUFF: bộ điều khiển chạy mỗi bước (prop vô hình dưới chân)
  let lastCur = 0, lastPos = null;
  function tick(G2, pr, dt) {
    const p = G.player; if (!p) return;
    const bm = p.bm || (p.bm = {});
    pr.x = p.x; pr.y = p.y - 0.5;
    tickStatus(dt);
    // tượng: hồi chiêu, Hiệp Sĩ Thánh, Berserker, Người Sói
    const cdSpeed = has(21) ? 1.25 : 1;   // CDR 25 [WIKI Cooldown Rush]
    if (p.statueCds) for (const k in p.statueCds) if (p.statueCds[k] > 0) p.statueCds[k] -= dt * cdSpeed;
    if (has(21) && p.skillCd > 0) p.skillCd -= dt * 0.25;
    if (bm.shield > 0 && (bm.shieldT -= dt) <= 0) { bm.shield = 0; if (bm.shieldFx) { bm.shieldFx.stop(); bm.shieldFx = null; } }
    if (bm.boostT > 0 && (bm.boostT -= dt) <= 0 && bm.boostFx) { bm.boostFx.stop(); bm.boostFx = null; }
    if (bm.wolfT > 0 && (bm.wolfT -= dt) <= 0) { bm.wolfFx && bm.wolfFx.stop(); bm.wolfFx = null; refreshWeapons(p); }
    if (bm.thiefT > 0) bm.thiefT -= dt;
    setSpeed(p, 'thief', bm.thiefT > 0 ? 1.5 : 1);        // [WIKI] +50% trong 5 s
    setSpeed(p, 'wolf', bm.wolfT > 0 ? 1.2 : 1);          // [WIKI] +20%
    if (bm.wwCd > 0) bm.wwCd -= dt;
    if (bm.reflectT > 0) {
      bm.reflectT -= dt;
      const d = p.weapons[p.cur].def, reach = (d.range || 24) + 14, a = p.aim;
      for (const b of G.bullets) {
        if (b.side !== 'e' || b.dead) continue;
        const dx = b.x - p.x, dy = b.y - (p.y - 8);
        if (Math.hypot(dx, dy) > reach) continue;
        const da = Math.atan2(Math.sin(Math.atan2(dy, dx) - a), Math.cos(Math.atan2(dy, dx) - a));
        if (Math.abs(da) < 1.4) { reflect(b); vfx('hit_yellow', b.x, b.y, { scale: 0.7 }); }
      }
    }
    if (!p.buffs || !p.buffs.length) { lastCur = p.cur; return; }
    talentTick(p, bm, dt);
    // Ép Xung
    if (has(32)) {
      if (bm.rapidT > 0) bm.rapidT -= dt;
      else if (bm.rapidN > 0) { bm.rapidDecay = (bm.rapidDecay || 0) + dt; if (bm.rapidDecay > 0.3) { bm.rapidN--; bm.rapidDecay = 0; } }
      const rn = bm.rapidN || 0;
      setMul(p, 'rapid', 1 + rn * 0.02 + (rn >= 5 ? 0.1 : 0));
    }
    // Bạo Kích Mất Máu
    if (has(35)) {
      const v = SK.clamp((p.hpMax - p.hp + p.armorMax - p.armor) / Math.max(1, p.hpMax + p.armorMax - 1), 0, 1);
      const Vb = V.bloodRage || { max_attack_speed: 0.3, max_critical: 70 };
      setMul(p, 'blood', 1 + v * Vb.max_attack_speed);
      setCrit(p, 'blood', Math.round(v * Vb.max_critical));
    }
    // Giáp Vàng
    if (has(34)) {
      const bonus = Math.min(3, Math.floor(p.gold / 100)), old = p._goldArmor || 0;
      if (bonus !== old) { p.armorMax += bonus - old; p.armor = Math.min(p.armorMax, p.armor + Math.max(0, bonus - old)); p._goldArmor = bonus; }
    }
    // Giáp Đi Nhanh: chạy nhanh khi bạo kích, đi đủ 40 ô hồi 1 giáp
    if (has(36)) {
      if (bm.blitzT > 0) bm.blitzT -= dt;
      setSpeed(p, 'blitz', bm.blitzT > 0 ? 1.3 : 1);
      if (lastPos) bm.walk = (bm.walk || 0) + Math.min(24, Math.hypot(p.x - lastPos[0], p.y - lastPos[1]));
      if ((bm.walk || 0) >= 40 * T) {
        bm.walk -= 40 * T;
        if (p.armor < p.armorMax) { p.armor++; SK.num(G, p.x, p.y - 30, '+1', '#c9d2df'); vfx('effect_health_green', p.x, p.y - 8, { follow: p, dy: -8, scale: 0.6 }); }
        else bm.store = 1;
      }
      if (bm.store && p.armor < p.armorMax) { bm.store = 0; p.armor++; SK.num(G, p.x, p.y - 30, '+1', '#c9d2df'); }
    }
    // Đòn Động Năng: đi 6 ô (charge_distance) đầy 100 tầng
    if (has(2106) && lastPos) {
      const Kc = (V.kinetic && V.kinetic.charge_distance) || 6;
      bm.kin = Math.min(100, (bm.kin || 0) + Math.min(24, Math.hypot(p.x - lastPos[0], p.y - lastPos[1])) / (Kc * T) * 100);
    }
    // Khiên Chống Độc: không bị ô chậm làm chậm
    if (has(8)) {
      const o = W.obstacleAt(G.map, p.x, p.y - 2);
      const slow = o && o.kind === 'pad' && o.p && o.p.speed_down ? 1 / Math.max(0.2, 1 - o.p.speed_rate) : 1;
      setSpeed(p, 'gas', slow);
    }
    // Hồi giáp gấp đôi (Hồi Phục Gấp Đôi)
    if (has(12) && p.armorT <= 0 && p.armor < p.armorMax) p.armorTick -= dt;
    // Trì Hoãn Thời Không: đạn địch chậm 10%, hút vàng/năng lượng xa hơn
    if (has(14)) {
      for (const b of G.bullets) if (b.side === 'e' && !b._slow) { b._slow = 1; b.vx *= 0.9; b.vy *= 0.9; }
      for (const k of G.pickups) {
        if (k.kind !== 'coin' && k.kind !== 'energy') continue;
        const rng = (k.kind === 'coin' ? 15 : 13) * T, d = Math.hypot(p.x - k.x, p.y - 6 - k.y);
        if (k.t > 0.35 && d < rng && d > 6 && p.st !== 'dead') { k.vx = (p.x - k.x) / d * (140 + k.t * 120); k.vy = (p.y - 6 - k.y) / d * (140 + k.t * 120); }
      }
    }
    // Đạn nảy: đổi hướng trước khi lõi giết đạn ở tường
    if (has(24)) for (const b of G.bullets) if (b._bounce > 0 && !b.dead && b.side === 'p' && !b.vis) bounce(b, dt);
    // Túi 3 vũ khí
    if (has(25)) extraWeapon(p);
    lastPos = [p.x, p.y];
  }
  function bounce(b, dt) {
    const nx = b.x + b.vx * dt * 1.5, ny = b.y + b.vy * dt * 1.5, h = b.h || 0;
    if (!W.solidAt(G.map, nx, ny + h)) return;
    const sx = W.solidAt(G.map, nx, b.y + h), sy = W.solidAt(G.map, b.x, ny + h);
    if (sx || !sy) b.vx = -b.vx;
    if (sy || !sx) b.vy = -b.vy;
    b._bounce--; b.life = Math.max(b.life, 0.8);
    vfx('hit_yellow', b.x, b.y, { scale: 0.5 });
  }

  // Túi 3 vũ khí: p.weapons[0..1] là hai ô của lõi, p.extraW là ô thứ ba. Lõi đổi ô bằng p.cur; ta gom lại vòng 1→2→3.
  function extraWeapon(p) {
    if (p.cur !== lastCur) {
      // vừa đổi súng: đưa súng thứ ba vào ô vừa bỏ để vòng đổi đủ 3 khẩu
      if (p.extraW) { const t = p.weapons[1 - p.cur]; p.weapons[1 - p.cur] = p.extraW; p.extraW = t || null; }
      lastCur = p.cur;
    }
    // nhặt súng mới khi hai ô đã đầy: súng cũ bị lõi rơi ra đất, ta nhặt nó vào ô thứ ba nếu còn trống
    const ids = p.weapons.map(w => w && w.id).join('|');
    if (p._ewIds && p._ewIds !== ids && !p.extraW && p.weapons[0] && p.weapons[1]) {
      const old = p._ewIds.split('|')[p.cur];
      const it = G.items.find(q => q.id === old && Math.hypot(q.x - p.x, q.y - p.y) < 14 && q.t < 0.2);
      if (it) { G.items.splice(G.items.indexOf(it), 1); p.extraW = SK.makeWeapon(old); }
    }
    p._ewIds = ids;
  }

  // ---------------------------------------------------------------- TƯỢNG (phòng dấu chấm than)
  // 10 tượng [ĐO random_objects.statue: statue_01..10 cùng trọng số 1]. Tên và mô tả từ localization; cd, số viên, sát thương
  // đọc từ prefab buff_statue_N [ĐO]; số minh hoạ trong mô tả theo wiki khi prefab không chứa.
  const STATUE_INFO = {
    1: n => [n.count], 2: () => [1, 12], 3: () => [3, 1, 10, 1], 4: n => [n.count], 5: () => [30, 8], 6: () => [6],
    7: () => [6], 8: () => [], 9: () => [5], 10: () => [1, 12]
  };
  const statueOf = id => B.statues[id] || { name: { vi: 'Tượng ' + id }, info: { vi: '' } };
  const statueName = id => (statueOf(id).name || {}).vi;
  function statueCfg(id) {
    const pf = SK.prefab('buff_statue_' + id), part = pf && pf[0], m = part && part.mbs ? Object.values(part.mbs)[0] : {};
    return { cd: m.cd || 8, m, color: (part && part.c) || [1, 1, 1, 1] };
  }
  function statueDesc(id) {
    let t = (statueOf(id).info || {}).vi || '';
    const cfg = statueCfg(id);
    const extra = has(3) && (id === 1 || id === 4) ? 2 : 0;
    const nums = STATUE_INFO[id]({ count: (cfg.m.count || 0) + extra });
    nums.forEach((v, i) => { t = t.replace('{' + i + '}', v); });
    return t;
  }
  ROOMS.statueName = statueName; ROOMS.statueDesc = statueDesc; ROOMS.statueCfg = statueCfg;

  function fillStatue(G2, r, c) {
    const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter(i => SK.prefab('statue_' + (i < 10 ? '0' + i : i)));
    if (!ids.length) return false;
    const id = ROOMS.force.statue || SK.pick(ids), pf = SK.prefab('statue_' + (id < 10 ? '0' + id : id));
    const talk = SK.prefabMbs(pf, 'TalkStatue') || {};
    const [x, y] = [c[0], c[1] + 8];
    G.props.push({ x, y, t: 0, statue: id, draw(ctx, G3, pr) {
      SK.drawPrefab(ctx, pf, x, y, {});
      // Ánh đèn dưới chân tượng nhấp nháy như Animator gốc.
      const l = prefabPart(pf, '/light');
      if (l) SK.drawTinted(ctx, l.f, x + l.at[0], y - l.at[1], l.c, { alpha: 0.5 + 0.5 * Math.sin(G.t * 3) });
    } });
    blockRect(G.map, x - 16, y - 30, x + 16, y);
    const price = () => statuePrice(talk.item_value || 15);
    G.interactables.push({
      x, y: y + 6, r: 30, labelY: 58,
      get label() {
        const p = G.player;
        return (p.statues || []).indexOf(id) >= 0 ? statueName(id) + ' (đang có)' : statueName(id) + ' — dâng ' + price() + ' vàng';
      },
      use() {
        const p = G.player;
        p.statues = p.statues || []; p.statueCds = p.statueCds || {};
        if (p.statues.indexOf(id) >= 0) { G.toast(statueDesc(id), 3); return; }
        if (!pay(price())) return;
        const max = has(22) ? 2 : 1;
        p.statues.push(id);
        while (p.statues.length > max) delete p.statueCds[p.statues.shift()];
        p.statueCds[id] = 0;
        snd(evClip('shop') || 'fx_buy', 0.7);
        vfx('buff_statue_' + id, p.x, p.y - 2, { follow: p, dy: -2, dur: 0.6 });
        G.toast(statueName(id) + ': ' + statueDesc(id), 3.5);
        SK.emit('statueBuy', G, id);
      }
    });
    r.fill = 'statue_' + id;
    return true;
  }

  function fireStatues(p) {
    p.statueCds = p.statueCds || {};
    const list = p.statues.filter(id => !(p.statueCds[id] > 0));
    for (const id of list) {
      p.statueCds[id] = statueCfg(id).cd;   // hồi chiêu tính từ lần kích hoạt đầu, lần hai của Tượng Nhân Đôi không đổi nó
      triggerStatue(p, id);
      if (has(22)) G.props.push({ x: 0, y: -1e9, t: 0, draw() {}, update(G3, pr, dt) { pr.t += dt; if (pr.t >= 0.4) { pr.gone = true; if (p.st !== 'dead') triggerStatue(p, id, true); } } });
    }
  }
  function triggerStatue(p, id, second) {
    const cfg = statueCfg(id), m = cfg.m, bm = p.bm || (p.bm = {});
    const x = p.x, y = p.y - 8;
    const fireClip = clipOf('buff_statue_' + id, 'fire');
    snd(fireClip, 0.7);
    vfx('buff_statue_' + id, p.x, p.y - 2, { follow: p, dy: -2, dur: 0.6 });
    const extra = has(3) ? 2 : 0;
    if (id === 1) {                                     // Phù Thủy: 8 đạn đuổi mục tiêu, 4 sát thương, thiêu đốt
      const n = (m.count || 8) + extra, sp = (m.speed || 12) * SK.PPU;
      for (let i = 0; i < n; i++) {
        const a = i * Math.PI * 2 / n;
        shot({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg: m.atk || 4, homing: 5, r: 3, life: 2.5, frame: 'bullet_13_statue_1',
          status: 'burn', hitFx: 'hit_red_yellow' });
      }
    } else if (id === 2) {
      summonKnight(p);
    } else if (id === 3) {                              // Mục Sư: trận 3 s, bán kính 4 ô, mỗi giây +10 năng lượng +1 giáp [WIKI]
      const cx = p.x, cy = p.y, k = has(12) ? 2 : 1;
      const h = vfx('Holy_light', cx, cy, { dur: 3.2 });
      G.props.push({ x: cx, y: -1e9, t: 0, tick: 0, draw() {},
        update(G3, pr, dt) {
          pr.t += dt; pr.tick -= dt;
          if (pr.t > 3.001) { pr.gone = true; if (h) h.stop(); return; }
          if (pr.tick <= 0) {
            pr.tick += 1;
            const q = G.player;
            if (Math.hypot(q.x - cx, q.y - cy) < 4 * T && q.st !== 'dead') {
              q.energy = Math.min(q.energyMax, q.energy + 10 * k); q.armor = Math.min(q.armorMax, q.armor + k);
              vfx('effect_health', q.x, q.y - 8, { follow: q, dy: -8, scale: 0.7 });
            }
          }
        } });
    } else if (id === 4) {                              // Thích Khách: 5 kim xuyên, mỗi 10°, trúng độc
      const n = (m.count || 5) + extra, sp = (m.speed || 24) * SK.PPU, step = SK.deg(10);
      for (let i = 0; i < n; i++) {
        const a = p.aim + (i - (n - 1) / 2) * step;
        shot({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg: m.atk || 4, pierce: true, r: 2, life: 1.4, frame: 'bullet_103',
          status: 'poison', hitFx: 'hit_green' });
      }
    } else if (id === 5) {                              // Tiên Tộc: sóng xung 6 sát thương trong 12 ô, đẩy lùi, xoá đạn, tụ lực nhanh 30% trong 8 s
      const dmg = (m.info && m.info.damage) || 6;
      ring(p.x, p.y - 4, 12 * T, [0.16, 0.87, 0.93], 0.5);
      G.shake = Math.max(G.shake, 2);
      for (const e of G.enemies) {
        if (!targetable(e)) continue;
        const [ex, ey] = enemyMid(e);
        if (Math.hypot(ex - x, ey - y) < 12 * T) hurtE(e, dmg, false, Math.atan2(ey - y, ex - x), 6);
      }
      for (const b of G.bullets) if (b.side === 'e' && Math.hypot(b.x - x, b.y - y) < 12 * T) { if (has(4)) reflect(b); else b.dead = true; }
      if (!second) { bm.chargeT = 8; }
    } else if (id === 6) {                              // Trộm Cướp: +50% tốc 5 s; sau 0,5 s hút quái trong 12 ô và 6 sát thương
      if (!second) bm.thiefT = 5;
      const cx = p.x, cy = p.y;
      vfx('bullet_statue_thief', cx, cy - 6, {});
      G.props.push({ x: 0, y: -1e9, t: 0, draw() {}, update(G3, pr, dt) {
        pr.t += dt;
        if (pr.t < 0.5) return;
        pr.gone = true;
        const q = G.player;
        for (const e of G.enemies) {
          if (!targetable(e)) continue;
          const [ex, ey] = enemyMid(e);
          if (Math.hypot(ex - q.x, ey - q.y) < 12 * T) hurtE(e, 6, false, Math.atan2(q.y - ey, q.x - ex), 8);
        }
      } });
    } else if (id === 7) {                              // Hiệp Sĩ Thánh: khiên chặn 1 đòn, tan sau 6 s; hai lần thì xếp chồng
      bm.shield = (bm.shield || 0) + 1; bm.shieldT = 6;
      if (!bm.shieldFx) bm.shieldFx = vfx('oneshot_shield', p.x, p.y - 2, { follow: p, dy: -2, dur: 6.2 });
    } else if (id === 8) {                              // Kỹ Sư: 4 gói thuốc nổ cách 2,5 ô, nổ sau 0,5 s, 20 sát thương trong 4 ô, có thể thiêu đốt
      const n = m.count || 4, off = (m.offset || 2.5) * T, dmg = m.atk || 20;
      for (let i = 0; i < n; i++) {
        const a = SK.deg(45 + i * (m.angle || 90)), tx = p.x + Math.cos(a) * off, ty = p.y + Math.sin(a) * off * 0.8;
        G.props.push({ x: tx, y: ty, t: 0,
          update(G3, pr, dt) {
            pr.t += dt;
            if (pr.t >= 0.5) {
              pr.gone = true;
              vfx('explode_hit_enemy', tx, ty - 4, {}); G.shake = Math.max(G.shake, 3);
              for (const e of G.enemies) {
                if (!targetable(e)) continue;
                const [ex, ey] = enemyMid(e);
                if (Math.hypot(ex - tx, ey - ty) < 4 * T) { hurtE(e, dmg, false, Math.atan2(ey - ty, ex - tx), 3); if (SK.chance(0.5)) applyStatus(e, 'burn'); }
              }
            }
          },
          draw(ctx, G3, pr) { SK.draw(ctx, 'bullet_110', tx, ty - 6, { alpha: Math.floor(pr.t * 16) % 2 ? 0.7 : 1 }); } });
      }
    } else if (id === 9) {                              // Berserker: vũ khí +2 sát thương, đạn to gấp đôi, 5 s
      bm.boostT = 5;
      if (!bm.boostFx) bm.boostFx = vfx('shield_prism', p.x, p.y - 8, { follow: p, dy: -8, dur: 5.2 });
    } else if (id === 10) {                             // Người Sói: hồi 1 máu, +20% tốc và tầm cận chiến trong 12 s
      p.hp = Math.min(p.hpMax, p.hp + (has(12) ? 2 : 1));
      bm.wolfT = 12; refreshWeapons(p);
      if (!bm.wolfFx) bm.wolfFx = vfx('effect_statue_10', p.x, p.y - 6, { follow: p, dy: -6, dur: 12 });
    }
    SK.emit('statueFire', G, id);
  }

  // Tùy tùng Kỵ Sĩ (tượng 2): NPCStatueKnight damage 3, bạo kích ×2, hồi đánh 2 s [ĐO npc_knight_01]; 16 máu, sống 12 s [WIKI].
  // Vũ khí ngẫu nhiên trong 10 loại của wiki không có ở bản web: tùy tùng xông tới húc [ƯỚC LƯỢNG].
  function summonKnight(p) {
    const pf = SK.prefab('npc_knight_01');
    const m = (SK.prefabMbs(pf, 'NPCStatueKnight')) || { damage: 3, atk_cd: 2, criticalFactor: 2 };
    const anims = (pf && pf[0] && pf[0].a) || {};
    const k = { x: p.x + 12, y: p.y, t: 0, life: 12, hp: 16, atk: 0, st: 'ide', face: 1, ally: true,
      update(G2, pr, dt) {
        pr.t += dt; pr.life -= dt; pr.atk -= dt;
        if (pr.life <= 0 || pr.hp <= 0) { pr.gone = true; return; }
        const q = G.player, tgt = nearestEnemy(pr.x, pr.y, 200);
        let tx = q.x + 14, ty = q.y, near = 14;
        if (tgt) { [tx, ty] = [tgt.x, tgt.y]; near = 10; }
        const d = Math.hypot(tx - pr.x, ty - pr.y);
        pr.st = d > near ? 'run' : 'ide';
        if (d > near) {
          const s = 70 * dt, nx = pr.x + (tx - pr.x) / d * s, ny = pr.y + (ty - pr.y) / d * s;
          if (!W.solidAt(G.map, nx, ny)) { pr.x = nx; pr.y = ny; }
          pr.face = tx >= pr.x ? 1 : -1;
        }
        if (tgt && d < 18 && pr.atk <= 0) {
          pr.atk = m.atk_cd || 2;
          const crit = SK.chance(0.2);
          hurtE(tgt, (m.damage || 3) * (crit ? (m.criticalFactor || 2) : 1), crit, Math.atan2(ty - pr.y, tx - pr.x), 2);
          vfx('hit_white', tgt.x, tgt.y - 8, { scale: 0.8 });
        }
      },
      draw(ctx, G2, pr) {
        const key = anims[pr.st === 'run' ? 'npc_knight_run' : 'npc_knight_ide'];
        const fr = key && SK.animFrame(key, pr.t);
        if (fr) SK.draw(ctx, fr, pr.x, pr.y, { flip: pr.face < 0, alpha: pr.life < 1 ? pr.life : 1 });
      } };
    vfx('effect_smoke', k.x, k.y - 8, {});
    G.props.push(k);
  }

  // Tụ lực nhanh 30% từ tượng Tiên Tộc: lõi đọc def.charge lúc nạp, nên chỉnh tạm trên def của vũ khí đang cầm.
  function chargeBoost(p) {
    const bm = p.bm; if (!bm) return;
    const on = bm.chargeT > 0;
    if (on) bm.chargeT -= 1 / 60;
    for (const w of p.weapons.concat([p.extraW])) {
      if (!w || !w.def || !(DS.weapons[w.id] && DS.weapons[w.id].charge > 0)) continue;
      const base = (has(5) ? 0.5 : 1) * DS.weapons[w.id].charge;
      if (on) { w.def.charge = base / 1.3; w.def._cm = 1; }
      else if (w.def._cm) { w.def.charge = base; w.def._cm = 0; }
    }
  }

  // ---------------------------------------------------------------- CỬA HÀNG (phòng rương vàng)
  // Bố cục thật của prefab sell*: từng ô RGContainer khai `randomObjectMaker.configName` (bể bình) hoặc rỗng (vũ khí).
  // Trọng số bố cục [ĐO random_objects.shop]: sell2-1 16, sell2-2 16, sell1-2 16, sell1-3 1, sell1-1-2 2.
  const SHOP_LAYOUTS = [['sell2-1', 16], ['sell2-2', 16], ['sell1-2', 16], ['sell1-3', 1], ['sell1-1-2', 2]];
  function shopWeapons(level, n) {
    let pool = null;
    if (typeof SK.weaponPool === 'function') {
      try { pool = SK.weaponPool(level, 'shop'); } catch (e) { SK.warnOnce('wpool', 'weaponPool failed: ' + e.message); }
    }
    pool = (pool || []).map(x => typeof x === 'string' ? x : x && x.id).filter(id => DS.weapons[id]);
    if (!pool.length) {
      pool = Object.keys(DS.weapons).filter(id => {
        const w = DS.weapons[id];
        return id !== 'bad_pistol' && (w.grade || 1) <= level + 1 && SK.WEAPON_KINDS[w.kind] && SK.frame(w.sprite);
      });
    }
    const own = G.player ? G.player.weapons.filter(Boolean).map(w => w.id) : [];
    const fresh = pool.filter(id => own.indexOf(id) < 0);
    return SK.shuffle((fresh.length >= n ? fresh : pool).slice()).slice(0, n);
  }
  function weighted(list, wf) {
    let tot = 0; for (const x of list) tot += wf(x);
    let r = SK.rand() * tot;
    for (const x of list) { r -= wf(x); if (r < 0) return x; }
    return list[list.length - 1];
  }
  // Bình: bể thật `health_pot` = health_pot 5 : health_pot_big 1 (tương tự energy_pot, restore_pot) [ĐO].
  const POTION_POOL = { health_pot: ['health_pot', 'health_pot_big'], energy_pot: ['energy_pot', 'energy_pot_big'], restore_pot: ['restore_pot', 'restore_pot_big'] };
  function rollPotion(cfg) {
    const ro = (B.randomObjects[cfg] || []).filter(o => SK.prefab(o.p));
    if (!ro.length) return cfg;
    return weighted(ro, o => o.w).p;
  }
  const POT_CLS = { health_pot: 'RGHealthPot', health_pot_big: 'RGHealthPot', energy_pot: 'RGEnergyPot', energy_pot_big: 'RGEnergyPot', restore_pot: 'RGBothPot', restore_pot_big: 'RGBothPot' };
  const POT_NAME = { health_pot: 'Bình Máu', health_pot_big: 'Bình Máu Lớn', energy_pot: 'Bình Năng Lượng', energy_pot_big: 'Bình Năng Lượng Lớn', restore_pot: 'Bình Hồi Phục', restore_pot_big: 'Bình Hồi Phục Lớn' };
  function potStats(prefab) {
    const m = mbs(prefab, POT_CLS[prefab]);
    return { hp: m.health || 0, en: m.energy || 0, value: m.item_value || 25 };
  }
  function drinkPotion(prefab) {
    const p = G.player, boost = has(12) ? 2 : 1, s = potStats(prefab);
    if (s.hp) { p.hp = Math.min(p.hpMax, p.hp + s.hp * boost); SK.num(G, p.x - 4, p.y - 26, '+' + s.hp * boost, '#ff6a6a'); }
    if (s.en) { p.energy = Math.min(p.energyMax, p.energy + s.en * boost); SK.num(G, p.x + 4, p.y - 20, '+' + s.en * boost, '#6ac8ff'); }
    snd(evClip('hpPot'), 0.7);
    vfx(s.hp ? 'effect_health' : 'energy', p.x, p.y - 8, { follow: p, dy: -8 });
  }
  function giveWeapon(id) {
    const p = G.player;
    if (SK.profile && SK.profile.pickWeapon) SK.profile.pickWeapon(id);
    if (!p.weapons[1] && !MD().oneWeapon) { p.weapons[1] = SK.makeWeapon(id); p.cur = 1; }
    else if (has(25) && !p.extraW && !MD().oneWeapon) { p.extraW = SK.makeWeapon(id); }
    else {
      const old = p.weapons[p.cur];
      p.weapons[p.cur] = SK.makeWeapon(id);
      G.items.push({ id: old.id, x: p.x, y: p.y + 4, t: 0 });
    }
    if (p.skillT > 0 && p.dual) SK.endSkill(G, p);
  }

  function fillShop(G2, r, c) {
    const layout = weighted(SHOP_LAYOUTS.filter(l => SK.prefab(l[0])), l => l[1])[0];
    const pf = SK.prefab(layout);
    if (!pf) return false;
    const [cx, cy] = c;
    const merchant = { x: cx, y: cy + 2, t: SK.rand() * 2, shop: true,
      draw(ctx, G3, pr) {
        // Cả prefab thật (bàn, đèn nến, tivi, lái buôn có Animator), trừ ô hàng (vẽ theo từng món), bong bóng thoại và khung tĩnh trùng chỗ.
        SK.drawPrefab(ctx, pf, cx, cy, { t: G.t + pr.t, skip: n => /^\/container|\/tab(\/|$)|^\/hidden|\/img\/body|\/light$/.test(n.n) });
      }
    };
    G.props.push(merchant);
    blockRect(G.map, cx - 36, cy - 40, cx + 36, cy + 2);
    const slots = pf.filter(q => /^\/container\d$/.test(q.n));
    const slotCfg = q => { const m = q.mbs && q.mbs.RGContainer || {}; return m.randomObjectMaker && m.randomObjectMaker.configName || ''; };
    const items = [];
    const roll = () => {
      const nW = slots.filter(q => !slotCfg(q) && !/skin_fragment|drink/.test(((q.mbs.RGContainer.randomItemMaker || {}).configName) || '')).length;
      const ws = shopWeapons(G.stage.level, Math.max(1, nW));
      let wi = 0;
      return slots.map(q => {
        const cfg = slotCfg(q), extraCfg = ((q.mbs.RGContainer.randomItemMaker || {}).configName) || '';
        if (cfg === 'drink') return null;             // đồ uống (buff tạm) chưa có ở bản web
        if (!cfg && extraCfg === 'skin_fragment_shop') return null;
        if (POTION_POOL[cfg]) return { kind: 'pot', prefab: rollPotion(cfg) };
        return ws[wi] ? { kind: 'weapon', id: ws[wi++] } : null;
      });
    };
    const first = roll();
    slots.forEach((q, i) => {
      const px = cx + q.at[0], py = cy - q.at[1];
      const item = { slot: i, x: px, y: py + 8, t: SK.rand() * 3, sold: false, shopItem: true, cur: first[i],
        price() { const c = this.cur; if (!c) return 0; return priced(c.kind === 'weapon' ? weaponBase(c.id) : potStats(c.prefab).value); },
        name() { const c = this.cur; return !c ? '' : c.kind === 'weapon' ? DS.weapons[c.id].name : POT_NAME[c.prefab]; },
        update(G3, pr, dt) { pr.t += dt; },
        draw(ctx, G3, pr) {
          const ped = prefabPart(pf, q.n + '/c1');
          if (ped) SK.draw(ctx, ped.f, cx + ped.at[0], cy - ped.at[1]);
          if (pr.sold || !pr.cur) return;
          const bob = Math.round(Math.sin(pr.t * 3) * 1.5), top = py - 9 + bob;
          if (pr.cur.kind === 'weapon') SK.drawGun(ctx, DS.weapons[pr.cur.id].sprite, px - 6, top, 0, null, {});
          else SK.drawPrefab(ctx, SK.prefab(pr.cur.prefab), px, top, {});
        } };
      items.push(item);
      if (!item.cur) { item.sold = true; return; }
      G.props.push(item);
      blockRect(G.map, px - 14, py - 8, px + 14, py + 8);
      G.interactables.push({
        x: px, y: py + 14, r: 22, labelY: 44, get label() { return 'Mua ' + item.name() + ' (' + item.price() + ' vàng)'; },
        get gone() { return item.sold; },
        use(G3, o) {
          const n = item.price();
          if (!pay(n)) return;
          item.sold = true;
          const c = item.cur;
          if (c.kind === 'weapon') giveWeapon(c.id); else drinkPotion(c.prefab);
          snd(evClip('shop') || 'fx_buy', 0.7);
          vfx('explode_coin', px, py - 6, { scale: 0.6 });
          G.toast('Đã mua ' + item.name());
          SK.emit('shopBuy', G, { kind: c.kind, id: c.id || c.prefab, price: n });
        }
      });
    });
    // Nhân viên bán hàng: [ĐO NpcSellRefreshItem.item_value 30] làm mới cả quầy, làm lại được.
    const refresh = { x: cx, y: cy + 14, r: 22, labelY: 60, get label() { return 'Làm mới hàng (30 vàng)'; }, use() {
      if (!pay(30)) return;
      const next = roll();
      items.forEach((it, i) => { if (it.cur) { it.cur = next[i]; it.sold = !next[i]; } });
      snd(evClip('shop') || 'fx_buy', 0.7);
      G.toast('Hàng đã được làm mới');
      SK.emit('shopRefresh', G);
    } };
    G.interactables.push(refresh);
    r.fill = 'shop'; r.layout = layout;
    return true;
  }

  // Thương Nhân Thiện Lương (merchant_honest): 2 ô, mỗi ô bán 1 buff bằng 1 giáp [ĐO ball_buff_honest.defaultBuffPool: BuffId 8, 9, 23, 40 giá 1].
  // Chỉ những buff đã có luật ở bản web mới được bày.
  const HONEST_POOL = [8, 9, 23, 40];
  function fillHonest(G2, r, c) {
    const pf = SK.prefab('merchant_honest');
    if (!pf) return false;
    const [cx, cy] = c;
    const body = prefabPart(pf, '/npc01/img/body'), sa = body && body.mbs && body.mbs.SpriteAnimation;
    const frames = (sa ? sa.sprites.map(s => s.replace(/^@/, '')) : ['merchant_honest_0']).filter(f => SK.frame(f)), fps = sa ? sa.frameRate : 12;
    G.props.push({ x: cx, y: cy + 2, t: SK.rand() * 2, shop: true, draw(ctx, G3, pr) {
      const sh = prefabPart(pf, '/npc01/shadow');
      if (sh) SK.drawTinted(ctx, sh.f, cx + sh.at[0], cy - sh.at[1], sh.c, { alpha: 0.6 });
      SK.draw(ctx, frames[Math.floor((G.t + pr.t) * fps) % frames.length], cx, cy - 22.72);
    } });
    blockRect(G.map, cx - 10, cy - 12, cx + 10, cy + 2);
    const p = G.player;
    const pool = SK.shuffle(HONEST_POOL.filter(id => DEF[id] && DEF[id].active && !has(id)));
    const containers = pf.filter(q => /^\/container\d$/.test(q.n));
    containers.forEach((q, i) => {
      const id = pool[i]; if (!id) return;
      const px = cx + q.at[0], py = cy - q.at[1];
      const it = { x: px, y: py + 8, t: 0, sold: false, shopItem: true, price: () => 1, currency: 'giáp',
        update(G3, pr, dt) { pr.t += dt; },
        draw(ctx, G3, pr) {
          const ped = prefabPart(pf, q.n + '/c1');
          if (ped) SK.draw(ctx, ped.f, cx + ped.at[0], cy - ped.at[1]);
          if (pr.sold) return;
          const bob = Math.round(Math.sin(pr.t * 3) * 1.5);
          SK.drawPrefab(ctx, SK.prefab('ball_buff_honest'), px, py - 6 + bob, { skip: n => n.n !== 'ball_buff_honest' });
          SK.draw(ctx, buffIcon(id), px, py - 12 + bob, { sx: 0.4, sy: 0.4 });
        } };
      G.props.push(it);
      blockRect(G.map, px - 12, py - 8, px + 12, py + 8);
      G.interactables.push({ x: px, y: py + 14, r: 22, labelY: 44,
        get label() { return buffName(id) + ' — đổi 1 giáp'; }, get gone() { return it.sold; },
        use() {
          const pl = G.player;
          if (pl.armor < 1) { G.toast('Không đủ giáp!'); snd('fx_error', 0.6); return; }
          if ((pl.buffs || []).length >= buffSlots()) { G.toast('Hết ô buff!'); return; }
          pl.armor -= 1; it.sold = true;
          takeBuff(pl, id);
          snd(evClip('shop') || 'fx_buy', 0.7);
          G.toast('Buff: ' + buffName(id), 2);
          SK.emit('shopBuy', G, { kind: 'buff', id, price: 1 });
        } });
    });
    r.fill = 'honest';
    return true;
  }

  const baseChest = SK.ROOM_FILL.chest;
  SK.ROOM_FILL.chest = function (G2, r, c) {
    const f = ROOMS.force.chest, zi = G.stageIdx;
    // [ĐO map_level_base.ChestRooms] r_chest 2 : r_sell 2 (cấp ≥ 2, đếm từ 0: bắt đầu ở 1-3) : r_chest_battery 1 (≥ 3);
    // r_buff_merchant_guarentee 999 từ cấp 9 (2-5) một lần mỗi lượt chơi. Không có rương pin ở bản web: gộp vào rương thường.
    const p = G.player;
    if (zi >= 9 && !(p && p.bm && p.bm.honestMet) && (f === 'honest' || !f) && fillHonest(G2, r, c)) { p.bm = p.bm || {}; p.bm.honestMet = true; return; }
    let shop;
    if (f) shop = f === 'shop';
    else if (zi < 2) shop = false;
    else shop = SK.chance(2 / (zi >= 3 ? 5 : 4));
    if (shop && fillShop(G2, r, c)) return;
    r.fill = 'chest';
    baseChest(G2, r, c);
  };

  // ---------------------------------------------------------------- GIẾNG ƯỚC
  // [ĐO ItemWishingWell] tối đa 50 lượt; từ lượt ngẫu nhiên 28..35 giếng thưởng mỗi lần ném ("chuỗi cuối"); giá gốc 1 theo công thức.
  // Xác suất ra đồ trước chuỗi cuối, và cơ cấu đồ (vũ khí/bình) là [ƯỚC LƯỢNG]: mã chọn nằm trong IL2CPP không đọc trọn được.
  function fillWell(G2, r, c) {
    const pf = SK.prefab('wishing_well');
    if (!pf) return false;
    const x = c[0], y = c[1] - 6;
    const part = n => prefabPart(pf, n);
    const F = B.well.streakFrom;
    const well = { x, y: y + 26, t: 0, uses: 0, streak: SK.randi(F[0], F[1] - 1), reward: null, draw(ctx, G3, pr) {
      for (const n of ['/img/top', '/img/body']) { const q = part(n); if (q) SK.draw(ctx, q.f, x + q.at[0], y - q.at[1]); }
      if (pr.uses >= B.well.maxUse) return;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45 + 0.2 * Math.sin(G.t * 2.5);
      for (const n of ['/img/light/light_1', '/img/light/light_2']) { const q = part(n); if (q) SK.draw(ctx, q.f, x + q.at[0], y - q.at[1]); }
      ctx.restore();
    } };
    G.props.push(well);
    blockRect(G.map, x - 30, y - 24, x + 30, y + 24);
    const waiting = () => well.reward && (G.items.indexOf(well.reward) >= 0 || G.pickups.indexOf(well.reward) >= 0);
    const m = (SK.prefabMbs(pf, 'ItemWishingWell')) || {};
    const cost = () => priced(m.item_value || B.well.cost);
    ROOMS.well = well;
    G.interactables.push({
      x, y: y + 30, r: 38, labelY: 74,
      get label() { return well.uses >= B.well.maxUse ? 'Hồ Ước Nguyện — nước đã đục' : 'Hồ Ước Nguyện — ném ' + cost() + ' xu (' + well.uses + '/' + B.well.maxUse + ')'; },
      use() {
        if (well.uses >= B.well.maxUse) { G.toast('Nước trở nên đục.'); return; }
        if (waiting()) { G.toast('Nhặt món đồ trong giếng trước đã.'); return; }
        const n = cost();
        if (!freeBuy()) {
          if (G.player.gold < n) { G.toast('Hết xu rồi.'); snd('fx_error', 0.6); return; }
          G.player.gold -= n;
        }
        well.uses++;
        snd(clipOf('wishing_well', 'fire') || 'fx_buy', 0.7); snd(clipOf('wishing_well', 'water_clip') || 'fx_sea_wave', 0.4);
        vfx('object_fishing_spot_wishing_well', x, y + 6, { scale: 1 });
        vfx('explode_coin', x, y - 4, { scale: 0.6 });
        const luck = well.uses >= well.streak ? 1 : 0.12;
        if (!SK.chance(luck)) { G.toast('Chẳng có gì xảy ra. Ném thêm xu?'); return; }
        if (SK.chance(0.5)) {
          const id = shopWeapons(G.stage.level + 1, 1)[0];
          if (id) { well.reward = { id, x, y: y + 40, t: 0 }; G.items.push(well.reward); G.toast('Giếng trả lại ' + DS.weapons[id].name + '!'); return; }
        }
        const kind = SK.chance(0.5) ? 'hp_pot' : 'en_pot';
        SK.dropPickup(G, kind, x, y + 36);
        well.reward = G.pickups[G.pickups.length - 1];
        G.toast('Giếng trả lại một bình thuốc!');
      }
    });
    r.fill = 'well';
    return true;
  }

  // ---------------------------------------------------------------- LÍNH THUÊ (phòng đặc biệt r_mercenary, lồng nhốt cage_obj)
  // [ĐO map_level_base.SpecialRooms] r_mercenary trọng số 75, chỉ hiện khi không có lính thuê đã thuê còn sống [WIKI Followers].
  // Lời thoại [LOC mercenary1_*]. Giá: gốc prefab (15; Don Quixote và Kỵ Sĩ Hy Vọng 20), tăng theo tầng 15→30 như tượng [WIKI Followers;
  // công thức tầng ƯỚC LƯỢNG = công thức tượng]. Robot Vệ Sĩ: một nửa vàng đang có; Pharaoh: trừ 1 máu tối đa; Kep Freeman: miễn phí (prefab không có giá).
  // Buff Thú Cưng (17): +35 máu [WIKI Followers].
  const MERC = () => window.SK_MERCS || { order: [], mercs: {}, rules: { talk: {} } };
  const MERC_ROOM = ['npc_01', 'npc_02', 'npc_03', 'npc_04', 'npc_05', 'npc_06', 'npc_07', 'npc_08', 'npc_09', 'npc_10', 'npc_11', 'npc_12'];
  const mercTalk = k => (MERC().rules.talk || {})[k] || '';
  const hiredAlive = () => (SK.livingMercs ? SK.livingMercs(G) : []).some(a => a.hired);
  ROOMS.mercRoomAllowed = () => !hiredAlive();
  function mercPrice(id) {
    const M = MERC().mercs[id], p = G.player;
    if (!M) return 0;
    if (M.priceKind === 'half_gold') return Math.floor(p.gold / 2);
    if (M.priceKind === 'maxhp') return 1;
    if (M.priceKind === 'none') return 0;
    return statuePrice(M.price);
  }
  ROOMS.mercPrice = mercPrice;
  function pickMerc(kind) {
    const M = MERC(), ids = (kind === 'cage' ? M.order.filter(i => M.mercs[i].weight.cage > 0) : MERC_ROOM.filter(i => M.mercs[i]));
    const w = i => (kind === 'cage' ? M.mercs[i].weight.cage : M.mercs[i].weight.random);
    return ROOMS.force.merc || weighted(ids, w);
  }
  function mercSpot(pf, x, y, id, caged) {
    const anims = (pf && pf[0] && pf[0].a) || {}, key = Object.values(anims).find(v => /ide|idle|stand/.test(v)) || Object.values(anims)[0];
    const npc = { x, y: y + 2, t: SK.rand() * 2, mercNpc: id, draw(ctx, G3, pr) {
      const fr = key && SK.animFrame(key, G.t + pr.t);
      if (!fr || !SK.draw(ctx, fr, x, y)) { ctx.fillStyle = '#9fd2ff'; ctx.fillRect(x - 4, y - 12, 8, 12); }
      if (caged) {
        const cg = SK.prefab('cage_obj');
        if (cg) SK.drawPrefab(ctx, cg, x, y, { skip: q => /broken|\/tab|something/.test(q.n) });
        else { ctx.strokeStyle = '#8a8f99'; ctx.lineWidth = 1; for (let i = -8; i <= 8; i += 4) { ctx.beginPath(); ctx.moveTo(x + i, y - 18); ctx.lineTo(x + i, y); ctx.stroke(); } }
      }
    } };
    G.props.push(npc);
    return npc;
  }
  function hireMerc(id, o) {
    const p = G.player, M = MERC().mercs[id];
    return SK.addMercenary(G, p, id, o.x, o.y, { hired: !!o.hired, armed: o.armed !== false, hpBonus: has(17) ? 35 : 0 });
  }
  function fillMerc(G2, r, c) {
    if (!SK.addMercenary || !MERC().order.length || !ROOMS.mercRoomAllowed()) return false;
    const id = pickMerc('room'), M = MERC().mercs[id];
    if (!M) return false;
    const [x, y] = [c[0], c[1] + 8], pf = SK.prefab(id === 'npc_01' ? 'npc_knight_01' : id);
    const npc = mercSpot(pf, x, y, id, false);
    blockRect(G.map, x - 8, y - 12, x + 8, y + 2);
    G.interactables.push({
      x, y: y + 6, r: 26, labelY: 44,
      get gone() { return npc.gone; },
      get label() {
        const n = mercPrice(id), kind = M.priceKind;
        return M.vi + ' — ' + (kind === 'maxhp' ? 'đổi 1 máu tối đa' : kind === 'none' ? 'thuê miễn phí' : 'thuê ' + n + ' vàng');
      },
      use() {
        const p = G.player;
        if (npc.gone) return;
        if (hiredAlive()) { G.toast('Đã có người đi cùng rồi.'); return; }
        const kind = M.priceKind, n = mercPrice(id);
        if (kind === 'maxhp') {
          if (p.hpMax <= 1) { G.toast(mercTalk('refuse')); snd('fx_error', 0.6); return; }
          p.hpMax -= 1; p.hp = Math.min(p.hp, p.hpMax);
        } else if (n > 0 && !freeBuy()) {
          if (p.gold < n) { G.toast(mercTalk('refuse')); snd('fx_error', 0.6); return; }
          p.gold -= n;
        }
        npc.gone = true;
        hireMerc(id, { x, y: y + 4, hired: true });
        snd(evClip('shop') || 'fx_buy', 0.7);
        vfx('effect_smoke', x, y - 8, {});
        G.toast(M.vi + ': ' + mercTalk('accept'), 2.5);
        SK.emit('mercHire', G, id, n);
      }
    });
    r.fill = 'merc'; r.merc = id;
    return true;
  }
  // Lồng nhốt: miễn phí nhưng tay không [WIKI Followers]; qua tầng thì nhận vũ khí mặc định (stageEnter trong actors.js).
  function fillCage(G2, r, c) {
    if (!SK.addMercenary || !MERC().order.length) return false;
    const id = pickMerc('cage'), M = MERC().mercs[id];
    if (!M) return false;
    const [x, y] = [c[0], c[1] + 8], pf = SK.prefab(id === 'npc_01' ? 'npc_knight_01' : id);
    const npc = mercSpot(pf, x, y, id, true);
    blockRect(G.map, x - 10, y - 14, x + 10, y + 2);
    G.interactables.push({
      x, y: y + 6, r: 26, labelY: 44, get gone() { return npc.gone; },
      get label() { return M.vi + ' — mở lồng'; },
      use() {
        if (npc.gone) return;
        npc.gone = true;
        hireMerc(id, { x, y: y + 4, hired: false, armed: false });
        snd(evClip('shop') || 'fx_buy', 0.7);
        G.toast(M.vi + ': ' + mercTalk('accept'), 2.5);
        SK.emit('mercFree', G, id);
      }
    });
    r.fill = 'cage'; r.merc = id;
    return true;
  }

  // ---------------------------------------------------------------- THƯƠNG NHÂN THÚ CƯỠI (mount_seller → npc_mount_creature)
  // [ĐO random_objects mount_seller] thương nhân thú cưỡi trọng số 4 (cơ giáp 2: Bước D, chưa có). Danh sách bán [ĐO npc.npc_mount_creature]: 9 con
  // trọng số 1 mỗi con (bản web chưa có hệ mở khoá thú nên không lọc điều kiện `type 8`). Giá: gốc prefab 15-20, tăng theo tầng như tượng
  // [ƯỚC LƯỢNG: wiki chỉ nói tối thiểu 15 vàng]. Lời thoại [LOC object/mount_*]. Bày 3 con [ƯỚC LƯỢNG: số ô không có trong dữ liệu đọc được].
  const MNT = () => window.SK_MOUNTS || { order: [], mounts: {}, sellers: { creature: [] }, rules: {} };
  const MOUNT_SAY = { sell: 'Cần xe không?', bought: 'Chú ý lái an toàn', refuse: 'Xin lỗi, chúng tôi không cung cấp dịch vụ cho vay' };
  function mountPrice(id) {
    const M = MNT().mounts[id];
    return M ? Math.max(MNT().rules.priceMin ? MNT().rules.priceMin[M.kind] || 0 : 0, statuePrice(M.itemValue)) : 0;
  }
  ROOMS.mountPrice = mountPrice;
  function fillMount(G2, r, c) {
    const pf = SK.prefab('merchant_honest'), M = MNT();
    if (!SK.mountOn || !M.sellers.creature.length) return false;
    const [cx, cy] = c;
    if (pf) {
      const body = prefabPart(pf, '/npc01/img/body'), sa = body && body.mbs && body.mbs.SpriteAnimation;
      const frames = (sa ? sa.sprites.map(q => q.replace(/^@/, '')) : ['merchant_honest_0']).filter(f => SK.frame(f)), fps = sa ? sa.frameRate : 12;
      G.props.push({ x: cx, y: cy - 6, t: SK.rand() * 2, shop: true, draw(ctx, G3, pr) {
        if (frames.length) SK.draw(ctx, frames[Math.floor((G.t + pr.t) * fps) % frames.length], cx, cy - 28);
      } });
      blockRect(G.map, cx - 10, cy - 18, cx + 10, cy - 4);
    }
    const ids = ROOMS.force.mounts || (function () {
      // Thương nhân Vật Chở (mech) trọng số 2 : thú cưỡi 4 [ĐO random_objects mount_seller]. Chỉ bày cơ giáp đã làm (SK.mechImpl) và đã mở:
      // bản vẽ nghiên cứu (`devd`) nếu có bản vẽ trong data/sk-forge.js; m_mech_0/1 không cần bản vẽ [ĐO npc_mount_mech unlock null].
      const mechPool = (M.sellers.mech || []).filter(id => SK.mechImpl && SK.mechImpl(id) && (!M.mounts[id].sell.unlock || (SK.profile && SK.profile.devd && SK.profile.devd(M.mounts[id].sell.unlock))));
      const mech = mechPool.length && SK.rand() * 6 >= 4;
      const pool = (mech ? mechPool : M.sellers.creature).slice(), out = [];
      while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(SK.rand() * pool.length), 1)[0]);
      return out;
    })();
    ids.forEach((id, i) => {
      const D = M.mounts[id]; if (!D) return;
      const px = cx + (i - (ids.length - 1) / 2) * 30, py = cy + 10;
      const it = { x: px, y: py, t: SK.rand() * 2, sold: false, shopItem: true, price: () => mountPrice(id), draw(ctx, G3, pr) {
        if (!pr.sold) SK.mountDraw(ctx, id, px, py, G.t + pr.t, {});
      } };
      G.props.push(it);
      G.interactables.push({ x: px, y: py + 4, r: 20, labelY: 40, get gone() { return it.sold; },
        get label() { return D.vi + ' — ' + mountPrice(id) + ' vàng'; },
        use() {
          const p = G.player, n = mountPrice(id);
          if (it.sold) return;
          if (!freeBuy()) {
            if (p.gold < n) { G.toast(MOUNT_SAY.refuse); snd('fx_error', 0.6); return; }
            p.gold -= n;
          }
          it.sold = true;
          SK.mountOn(G, p, id);
          snd(evClip('shop') || 'fx_buy', 0.7);
          G.toast(D.vi + ': ' + MOUNT_SAY.bought, 2.5);
          SK.emit('mountBuy', G, id, n);
        } });
    });
    r.fill = 'mount'; r.mounts = ids; r.mountShop = ids.length && M.mounts[ids[0]] && M.mounts[ids[0]].kind === 'mech' ? 'mech' : 'creature';
    return true;
  }

  const baseSpecial = SK.ROOM_FILL.special;
  SK.ROOM_FILL.special = function (G2, r, c) {
    const f = ROOMS.force.special;
    // [ĐO map_level_base.SpecialRooms] r_statue 100 : r_weapon_provider 150, trong đó giếng ước 1 trên ~11 trọng số hợp lệ ≈ 13,6;
    // r_mercenary 75 (khi chưa có lính thuê đã thuê còn sống); lồng nhốt 25 [ƯỚC LƯỢNG: nó nằm ở bể cage_npc, không phải SpecialRooms].
    // (mỏ, thú cưỡi, máy đánh bạc... chưa có ở bản web).
    let kind = f;
    if (!kind) {
      const tab = [['statue', 100], ['well', 13.6], ['cage', 25], ['mount', 25]];   // thú cưỡi 25 [ƯỚC LƯỢNG: trọng số mount_seller 4 so với 3 loại khác không đọc được]
      if (ROOMS.mercRoomAllowed()) tab.push(['merc', 75]);
      let t = SK.rand() * tab.reduce((a, q) => a + q[1], 0);
      kind = tab[tab.length - 1][0];
      for (const q of tab) { if ((t -= q[1]) < 0) { kind = q[0]; break; } }
    }
    if (kind === 'well' && fillWell(G2, r, c)) return;
    if (kind === 'merc' && fillMerc(G2, r, c)) return;
    if (kind === 'cage' && fillCage(G2, r, c)) return;
    if (kind === 'mount' && fillMount(G2, r, c)) return;
    if (fillStatue(G2, r, c)) return;
    baseSpecial(G2, r, c);
  };

  // ---------------------------------------------------------------- ĐỒ RƠI CỦA QUÁI
  // [ĐO RGEController.GetReward @0x7205ba4] hai lần tung 0..99 độc lập so với reward_rate:
  // lần 1 (< rate): reward_value[3] cầu năng lượng; lần 2 (< rate): reward_value[i] xu prefab coin_i (i = 0,1,2 — 5, 3, 1 vàng).
  // Lõi (actors.js) chỉ tung một lần cho cả hai và coi cả ba loại xu là 1 vàng, nên ta tắt phần rơi mặc định của quái vừa chết
  // (đổi e.p thành bản sao có reward_rate 0) rồi tự thả.
  const COIN_STATE = { 0: 'coin_gold', 1: 'coin_silver', 2: 'coin_copper' };
  function goldCoin(x, y, kind) {
    const val = B.drops.coin[kind], a = SK.rand() * Math.PI * 2, s = SK.randf(30, 70);
    G.props.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, z: 0, vz: 60, t: 0, coin: val, kind,
      update(G2, pr, dt) {
        pr.t += dt;
        pr.vz -= 300 * dt; pr.z = Math.max(0, pr.z + pr.vz * dt);
        if (pr.z === 0) pr.vz = Math.abs(pr.vz) > 40 ? -pr.vz * 0.35 : 0;
        const p = G.player, d = Math.hypot(p.x - pr.x, p.y - 6 - pr.y);
        const rng = (mbs('coin_2', 'RGCoin').range || 7) * SK.PPU;
        if (pr.t > 0.35 && d < rng && p.st !== 'dead') { const sp = 140 + pr.t * 120; pr.vx = (p.x - pr.x) / d * sp; pr.vy = (p.y - 6 - pr.y) / d * sp; }
        else { const f = Math.exp(-dt * 5); pr.vx *= f; pr.vy *= f; }
        SK.moveBox(G.map, pr, pr.vx * dt, pr.vy * dt, 1);
        if (d < 8 && pr.t > 0.2 && p.st !== 'dead') { pr.gone = true; p.gold += pr.coin; SK.emit('pickup', G, 'coin'); }
      },
      draw(ctx, G2, pr) {
        SK.drawPrefab(ctx, SK.prefab('coin_' + pr.kind) || SK.art.object('coin'), pr.x, pr.y - pr.z, { t: G.t + pr.x * 0.01, state: COIN_STATE[pr.kind] });
      } });
  }
  function dropReward(e) {
    const p0 = e.p || {}, rate = p0.reward_rate != null ? p0.reward_rate : 20, rv = p0.reward_value || [0, 0, 1, 1];
    e.p = Object.assign({}, p0, { reward_rate: 0 });
    const x = e.x, y = e.y - 4;
    const rollE = SK.randi(0, 99), rollC = SK.randi(0, 99);
    if (rollE < rate) for (let i = 0; i < (rv[3] || 0); i++) SK.dropPickup(G, 'energy', x, y);
    if (rollC < rate) {
      for (let k = 0; k < 3; k++) for (let i = 0; i < (rv[k] || 0); i++) {
        if (k === 2) SK.dropPickup(G, 'coin', x, y); else goldCoin(x, y, k);
      }
    }
  }
  ROOMS.dropReward = dropReward;
  SK.on('enemyKill', (G2, e) => { if (e && !e.noReward) dropReward(e); });

  // ---------------------------------------------------------------- vòng đời buff + bộ điều khiển
  function controller() {
    return { x: 0, y: 0, ctl: true, update(G2, pr, dt) { tick(G2, pr, dt); if (G.player) chargeBoost(G.player); }, draw(ctx) {
      const p = G.player;
      if (!p || p.st === 'dead' || !p.statues) return;
      // [WIKI] vòng màu dưới chân = tượng sẵn sàng; khung effect_08_30 + màu từ prefab buff_statue_N [ĐO]
      p.statues.forEach((id, i) => {
        if (p.statueCds && p.statueCds[id] > 0) return;
        const c = statueCfg(id).color;
        SK.drawTinted(ctx, 'effect_08_30', p.x, p.y + 1 + i * 0, [c[0], c[1], c[2], p.statues.length > 1 ? 0.6 : 0.85]);
      });
    } };
  }

  // ---------------------------------------------------------------- màn chọn buff
  // [WIKI Buffs] 7 ô, chọn 1 trong 3 sau 1-1, 1-3, 1-5, 2-3, 2-5, 3-5 (tools/wiki/levels.json buff_at_end).
  // Bể theo cấp [ĐO pseudorandom_tbtalentgroups TG_level1/2/3(_volcano/_alien) + tbnooblevels]: cấp 1..5 → TG_level1,
  // 6..10 → TG_level2, 11..15 → TG_level3 (nhánh núi lửa cho ShieldFire ×10). Cấp lấy theo ải sắp vào [ƯỚC LƯỢNG].
  const BUFF_AFTER = ['1-1', '1-3', '1-5', '2-3', '2-5', '3-5', '4-2'];   // 4-2: tầng 4A [FLOOR4.md thiên phú sau ải 4-2]
  // Mê Trận Tà Vương: thẻ thiên phú sau x-2 và x-5 ở mọi tầng, tầng nối vô hạn (4-1, 5-1...) [MODES.md 2d]; chế độ khác theo danh sách.
  function buffAfter(G, label) {
    if (G && G.mode === 'matrix') return /^\d+-[25]$/.test(String(label));
    return BUFF_AFTER.indexOf(label) >= 0;
  }
  const BUFF_SLOTS = 7;
  function groupFor(nextLevel, theme) {
    const lv = B.levels[String(Math.min(15, nextLevel))] || B.levels['15'] || {};
    const branch = theme === 'volcano' ? 'B' : theme === 'aliens' ? 'A' : 'C';
    return lv[branch] || lv.A || Object.values(lv)[0];
  }
  function poolFor(nextLevel, theme) {
    const gid = groupFor(nextLevel, theme), out = [], seen = {};
    for (const [id, w] of (B.groups[gid] || [])) {
      if (seen[id] || !DEF[id] || !DEF[id].active || has(id)) continue;
      seen[id] = 1; out.push([id, w]);
    }
    return { gid, pool: out };
  }
  function offerIds(n) {
    const nextIdx = Math.min(G.stageIdx + 2, SK.STAGES.length), st = SK.STAGES[nextIdx - 1] || G.stage;
    const { pool } = poolFor(nextIdx, st.theme);
    const picks = [];
    const left = pool.slice();
    while (picks.length < (n || 3) && left.length) {
      let tot = 0; for (const x of left) tot += x[1];
      let r = SK.rand() * tot, k = 0;
      for (; k < left.length - 1; k++) { r -= left[k][1]; if (r < 0) break; }
      picks.push(left[k][0]); left.splice(k, 1);
    }
    return picks;
  }
  ROOMS.poolFor = poolFor; ROOMS.offerIds = offerIds;

  // Bảng chọn thiên phú: chỉ giữ trạng thái; js/loading.js vẽ nó trên màn tải bằng prefab gốc (ui_buff_bar + buff_tpl3).
  // rerolls: lượt "Đổi 1 đợt" còn lại trong lượt chơi [ƯỚC LƯỢNG 2, nút gốc ghi (2/2) https://youtu.be/LyMmXTQFcq8?t=44].
  const choice = ROOMS.choice = { open: false, cards: [], rerolls: 2 };
  // ids: bộ thẻ định sẵn (kiểm thử); không có thì bốc 3 buff theo bể thật.
  function openChoice(ids) {
    const list = (ids || offerIds(buffChoices())).filter(id => DEF[id]);
    if (!list.length) return false;
    choice.cards = list.slice(0, Math.max(3, buffChoices()));
    choice.open = true;
    snd('fx_show_up', 0.7);
    SK.emit('buffChoice', G, choice.cards.slice());
    return true;
  }
  function rerollChoice() {
    if (!choice.open || choice.rerolls <= 0) return false;
    const list = offerIds(buffChoices()).filter(id => DEF[id]);
    if (!list.length) return false;
    choice.rerolls--;
    choice.cards = list.slice(0, buffChoices());
    snd('fx_show_up', 0.7);
    SK.emit('buffChoice', G, choice.cards.slice());
    return true;
  }
  ROOMS.reroll = rerollChoice;
  function closeChoice() { choice.open = false; G.hold = false; }
  function pickChoice(i) {
    if (!choice.open || !choice.cards[i]) return;
    const id = choice.cards[i];
    closeChoice();
    takeBuff(G.player, id);
    snd(evClip('levelup') || 'fx_levelup', 0.7);
    vfx('effect_health_skill', G.player.x, G.player.y - 8, { follow: G.player, dy: -8, scale: 0.8 });
    G.toast('Buff: ' + buffName(id), 2);
  }
  ROOMS.pick = pickChoice;
  ROOMS.openChoice = openChoice;
  ROOMS.BUFF_AFTER = BUFF_AFTER; ROOMS.buffAfter = buffAfter; ROOMS.BUFF_SLOTS = BUFF_SLOTS; ROOMS.buffSlots = buffSlots; ROOMS.buffChoices = buffChoices; ROOMS.pay = pay;
  addEventListener('keydown', e => {
    if (!choice.open) return;
    const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    if (m) { pickChoice(+m[1] - 1); e.preventDefault(); }
  });

  SK.on('runStart', G2 => { closeChoice(); choice.rerolls = 2; G2.player.buffs = []; G2.player.bm = {}; G2.player.statues = []; G2.player.statueCds = {}; lastPos = null; lastCur = 0; });
  SK.on('runEnd', (G2, r) => {
    closeChoice();
    G2.gemBonus = has(15) ? GEM_MUL : 1;                 // Thợ Mỏ Đá Quý
    if (!r || G2.gemBonus <= 1) return;
    r.gemMul = G2.gemBonus;                            // js/lobby.js nhân hệ số này khi đổi quái/vàng thành đá
  });
  SK.on('stageEnter', (G2, stage) => {
    const p = G2.player;
    p.buffs = p.buffs || []; p.bm = p.bm || {}; p.statues = p.statues || []; p.statueCds = p.statueCds || {};
    // [WIKI] qua cổng thì tượng hồi chiêu xong ngay; các hiệu ứng thời gian của tượng gỡ hết
    for (const id of p.statues) p.statueCds[id] = 0;
    Object.assign(p.bm, { shield: 0, boostT: 0, thiefT: 0, wolfT: 0, chargeT: 0, blitzT: 0, kin: 0 });
    p.bm.shieldFx = p.bm.boostFx = p.bm.wolfFx = null;
    lastPos = null; lastCur = p.cur;
    G.props.push(controller());
    refreshWeapons(p);
  });
  SK.on('portalEnter', (G2, stage) => {
    const p = G2.player;
    if (!buffAfter(G2, stage.label) || !p.buffs || p.buffs.length >= buffSlots()) return;
    if (openChoice()) G2.hold = true;
  });

  // ---------------------------------------------------------------- HUD: buff đang có, ô súng thứ ba, bảng giá
  SK.on('hud', (ctx, G2) => {
    const p = G2.player; if (!p) return;
    let x = 98;
    for (const id of (p.buffs || [])) {
      const ic = buffIcon(id), f = SK.frame(ic);
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x - 0.5, 3.5, 15, 15);
      const k = f ? 14 / Math.max(f[3], f[4]) : 1;
      SK.draw(ctx, ic, x + 7, 11, { sx: k, sy: k });
      x += 16;
    }
    if (p.extraW) {
      const d = DS.weapons[p.extraW.id];
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(SK.view.w - 60, SK.view.h - 30, 20, 14);
      if (d) SK.drawGun(ctx, d.sprite, SK.view.w - 58, SK.view.h - 23, 0, null, { scale: 0.7 });
    }
    const cam = G2.view || G2.cam;
    for (const pr of G2.props) {
      if (!pr.shopItem || pr.sold) continue;
      const it = G2.interactTarget;
      if (it && Math.abs(it.x - pr.x) < 1 && /—|^Mua/.test(it.label)) continue;
      const sx = pr.x - cam.x, sy = pr.y - 26 - cam.y;
      if (sx < -20 || sx > SK.view.w + 20 || sy < -20 || sy > SK.view.h + 20) continue;
      const s = String(pr.price());
      ctx.font = '9px ' + SK.FONT;
      const w = ctx.measureText(s).width + 9;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(Math.round(sx - w / 2) - 1, sy - 5, w + 2, 10);
      if (pr.currency) SK.text(ctx, 'Giáp', sx - w / 2 + 1, sy + 0.5, 8, '#c9d2df', 'left', null);
      else if (!SK.drawPrefab(ctx, SK.art.object('coin'), sx - w / 2 + 3, sy + 3, { t: G2.t, state: 'coin_gold', scale: 0.8 })) {
        ctx.fillStyle = '#f5c542'; ctx.fillRect(sx - w / 2 + 1, sy - 2, 4, 5);
      }
      const can = pr.currency ? G2.player.armor >= pr.price() : G2.player.gold >= pr.price();
      SK.text(ctx, s, sx - w / 2 + (pr.currency ? 22 : 7), sy + 0.5, 9, can ? '#ffffff' : '#ff7a6a', 'left', null);
    }
  });
})();
