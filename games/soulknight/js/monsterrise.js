// Quái Thú Trỗi Dậy (Monster Rise, Arcade ở tầng 2 Phòng Khách): chế độ tự đánh trên làn, người chơi là Quan Chỉ Huy dẫn đội quái thú
// qua bản đồ có nhiều đường và điểm dừng. Số liệu: wiki Rise_of_Monsters (tools/polish/MODES.md mục 2i) [WIKI RoM], chữ LOC monsrise/*;
// chỗ không có số ghi [ƯỚC LƯỢNG]. Chưa làm: tools/polish/GAPS.md. Tệp này là LÕI THUẦN (dữ liệu + bản đồ + mô phỏng trận + vòng chơi);
// giao diện, vẽ và nối sảnh ở js/monsterrise2.js. Chế độ có trạng thái riêng G.state = 'monsterrise' (SK.MODES), không dùng G.map.
//   R = SK.monsterrise.R: {floor, cur, map, coins, food, cap, mons:[{uid,key,lvl,hp,badges}], fallen, bag, screen, kills, stats, over}
//   B = trận đang đánh: {units, time, over, won, fx}
(function () {
  'use strict';
  const SK = window.SK;
  const MR = SK.monsterrise = SK.monsterrise || {};

  // ---------------------------------------------------------------- dữ liệu quái thú
  // [tên, chủng, vai, cost, HP, tấn công, tốc đánh, tầm (ô), prefab gốc, kỹ năng, hồi chiêu (0 = nội tại / đầu trận)] [WIKI RoM "Monsters"]
  // Chí mạng 10% / sát thương bạo 150%, tốc chạy 2,5 ô/giây với mọi quái cấp Thường [WIKI RoM]; Slime 0% bạo, 100%; Xu Hoạt Hóa chạy 4.
  const ROWS = {
    priest:    ['Đại Tư Tế', 'goblin', 'mage', 4, 2450, 190, 0.59, 7, 'M_Goblin_Mage_Royal', 'arcane_lightning', 7],
    trainee:   ['Học Trò Goblin', 'goblin', 'mage', 2, 1500, 80, 1.05, 5, 'M_Goblin_Mage_Sorcerer', 'life_link', 3.5],
    shotgun:   ['Goblin Súng Ngắn', 'goblin', 'ranger', 2, 1400, 30, 1.18, 5, 'M_Goblin_Shooter', 'incendiary', 3],
    prayer:    ['Goblin Cầu Phúc', 'goblin', 'mage', 2, 2000, 50, 1, 5, 'M_Goblin_Support', 'link_recovery', 0],
    charger:   ['Goblin Xung Phong', 'goblin', 'warrior', 2, 2000, 100, 0.91, 1, 'M_Goblin_Warrior', 'into_the_fray', 0],
    executor:  ['Túc Thanh Ca', 'goblin', 'warrior', 4, 3000, 190, 0.59, 7, 'M_Goblin_Executor', 'reap', 2],
    arcane:    ['Kỵ Sĩ Bùa Chú', 'human', 'mage', 2, 1500, 130, 0.5, 5, 'M_Knight_Mage', 'arcane_cannon', 0],
    sniper:    ['Kỵ Sĩ Bắn Tỉa', 'human', 'ranger', 2, 1000, 300, 0.35, 8, 'M_Knight_Shooter', 'precision_shot', 8],
    shield:    ['Khiên Đế Quốc', 'human', 'tank', 2, 3500, 72, 0.83, 1, 'M_Knight_Tank_Defender', 'defensive_formation', 6],
    novice:    ['Kỵ Sĩ Thực Tập', 'human', 'warrior', 2, 2200, 105, 0.91, 1, 'M_Knight_Warrior', 'whirlwind', 2],
    guardian:  ['Kiếm Thủ Hộ', 'human', 'tank', 2, 2100, 190, 0.5, 1, 'M_Knight_Tank_Paladin', 'sword_of_protection', 5],
    savior:    ['Kỵ Sĩ Cứu Tinh', 'human', 'warrior', 4, 3600, 120, 1, 1, 'M_Knight_Savior', 'leaping_strike', 8],
    blaster:   ['Bậc Thầy Nổ Phá', 'dwarf', 'mage', 2, 1700, 102, 0.74, 6, 'M_Miner_Mage', 'high_explosive', 0],
    borer:     ['Thợ Đục Khoét', 'dwarf', 'ranger', 2, 1400, 50, 2.14, 5, 'M_Miner_Shooter', 'suppressing_fire', 0],
    spader:    ['Xẻng Đào Tiền Tuyến', 'dwarf', 'tank', 4, 4500, 200, 0.41, 1, 'M_Miner_Tank', 'unyielding', 10],
    driller:   ['Thợ Khoan Vỏ', 'dwarf', 'warrior', 2, 1800, 40, 2.38, 1, 'M_Miner_Warrior', 'burrow', 0],
    duper:     ['Khỉ Ninja - Lôi', 'humanoid', 'warrior', 4, 2700, 120, 1, 1, 'M_Monkey_Assassin_Sorcerer', 'shadow_strike', 4],
    ninja:     ['Trùm Ninja', 'humanoid', 'warrior', 2, 1400, 86, 1, 1, 'M_Monkey_Assassin_Pirate', 'shadow_step', 3.5],
    rangermon: ['Kiểm Lâm', 'humanoid', 'ranger', 2, 1150, 30, 2.7, 5, 'M_Monkey_Shooter_Uzi', 'fire_at_will', 3.5],
    batter:    ['Trùm Bóng Chày', 'humanoid', 'warrior', 2, 1950, 90, 0.91, 1, 'M_Monkey_Warrior', 'bash', 3],
    monk:      ['Hầu Tiểu Tăng', 'humanoid', 'mage', 2, 1100, 60, 1.54, 5, 'M_Monkey_Monk', 'cultivation', 4],
    cladmon:   ['Thiết Giáp Hầu', 'humanoid', 'warrior', 2, 2000, 150, 0.71, 1, 'M_Monkey_Armor', 'feral_hurl', 0],
    warlord:   ['Kim Diện Chiến Hầu', 'humanoid', 'ranger', 4, 2500, 48, 2.5, 5, 'M_Monkey_MaskFighter', 'armed_reinforcement', 4],
    snowace:   ['Tam Chấn Vương', 'humanoid', 'ranger', 2, 2000, 95, 0.59, 5, 'M_Snowman_Shooter', 'huge_snowball', 6],
    snowchamp: ['Vượn Tuyết Vô Địch', 'humanoid', 'warrior', 2, 2350, 150, 0.53, 1, 'M_Snowman_Warrior', 'conversion', 2.5],
    slime_g:   ['Slime Lục', 'slime', 'mage', 1, 600, 60, 0.67, 6, 'M_Slime_Green', null, 0],
    slime_y:   ['Slime Xám', 'slime', 'warrior', 1, 800, 80, 0.71, 1, 'M_Slime_Gray', null, 0],
    slime_r:   ['Slime Đỏ', 'slime', 'warrior', 1, 700, 75, 0.54, 1, 'M_Slime_Red', null, 0],
    marketeer: ['Thương Nhân Chợ Đen', 'demon', 'ranger', 1, 2200, 28, 6.15, 99, 'M_Dark_Merchant', null, 0],
    goldmon:   ['Vàng Hoạt Hóa', 'demon', 'warrior', 1, 200, 2, 1.67, 6, 'M_Goldmon', null, 0]
  };
  const RACE = { goblin: 'Goblin', human: 'Con Người', dwarf: 'Người Lùn', humanoid: 'Á Nhân', slime: 'Slime', demon: 'Ác Ma' };
  const ROLE = { tank: 'Tank', warrior: 'Chiến Sĩ', ranger: 'Xạ Thủ', mage: 'Pháp Sư', assassin: 'Thích Khách', support: 'Hỗ Trợ' };
  const MON = MR.MON = {};
  for (const id of Object.keys(ROWS)) {
    const r = ROWS[id];
    MON[id] = { id, name: r[0], race: r[1], role: r[2], cost: r[3], hp: r[4], atk: r[5], aspd: r[6], range: r[7], prefab: r[8], skill: r[9], cd: r[10],
      crit: r[1] === 'slime' || r[1] === 'demon' ? 0 : 10, critDmg: r[1] === 'slime' || r[1] === 'demon' ? 100 : 150, ms: id === 'goldmon' ? 4 : 2.5 };
  }
  // Quái do kỹ năng triệu hồi / trùm: số không có trong wiki [ƯỚC LƯỢNG]
  MON.pitcher = { id: 'pitcher', name: 'Khỉ Bàn Tay Vàng', race: 'humanoid', role: 'ranger', cost: 2, hp: 1000, atk: 80, aspd: 1, range: 5, prefab: 'M_Monkey_Shooter_Pitcher', skill: null, cd: 0, crit: 10, critDmg: 150, ms: 2.5, summon: true };
  MON.nightmare = { id: 'nightmare', name: 'Ác Mộng Rừng Rậm', race: 'demon', role: 'mage', cost: 4, hp: 6500, atk: 120, aspd: 0.8, range: 6, prefab: 'M_ForestNightmare', skill: null, cd: 0, crit: 0, critDmg: 100, ms: 1.6, boss: true };
  MON.cannibal = { id: 'cannibal', name: 'Hoa Ăn Thịt', race: 'demon', role: 'tank', cost: 4, hp: 12000, atk: 160, aspd: 0.6, range: 1.5, prefab: 'M_Cannibal', skill: null, cd: 0, crit: 0, critDmg: 100, ms: 1.2, boss: true };
  MR.raceName = r => RACE[r] || r; MR.roleName = r => ROLE[r] || r;
  MR.ids = Object.keys(ROWS);

  // Huy hiệu [WIKI RoM "Badges"]: bản tài liệu số ở đây; hiệu ứng nằm ở mô phỏng bên dưới
  const BADGES = MR.BADGES = {
    bulwark: { name: 'Thành Lũy', desc: 'Tăng 1000 HP tối đa.' },
    precaution: { name: 'Đề Phòng', desc: 'Nhận 12 Khiên khi trận bắt đầu.' },
    lifesteal: { name: 'Hút HP', desc: 'Mỗi đòn đánh thường hồi 1,5% HP tối đa.' },
    powercharge: { name: 'Nạp Lực', desc: 'Công tốc -25%, kỹ năng hồi nhanh hơn 40%.' },
    formation_off: { name: 'Đội Hình - Công', desc: 'Đứng cạnh đồng đội: tấn công +30, đồng đội kề bên +15.' },
    lone_off: { name: 'Sói Cô Đơn - Công', desc: 'Khi bị cô lập: nhận thêm 35% s.thương nhưng tấn công +30.' },
    sunder: { name: 'Phá Thủ', desc: 'Đòn đánh thường và kỹ năng mạnh hơn 25%, gấp 4 lần s.thương lên Khiên.' },
    feign: { name: 'Giả Chết', desc: 'Khi bị hạ, hồi 20% HP tối đa. Mỗi trận chỉ một lần.' },
    circle: { name: 'Vòng Chữa Lành', desc: 'Mỗi 3 giây hồi 5% HP tối đa; đồng đội trong tầm 2 nhận 30% lượng hồi.' },
    sage: { name: 'Hiền Giả', desc: 'Kỹ năng của đồng đội kề bên hồi nhanh hơn 50%.' },
    chef: { name: 'Đầu Bếp', desc: 'Mọi hiệu quả hồi máu mạnh hơn 50%.' },
    split: { name: 'Đạn Phân Tán', desc: 'Bắn thêm 2 đạn, mỗi đạn yếu đi 45%.' }
  };
  MR.badgeIds = Object.keys(BADGES);

  // Hằng số vòng chơi. Số trận / giá không có trong wiki: [ƯỚC LƯỢNG]
  const C = MR.C = {
    cols: 12, rows: 5, half: 6,           // sân: nửa trái đặt quái ta, nửa phải quái địch [WIKI RoM "Battle"]; kích thước lưới [ƯỚC LƯỢNG]
    floors: 3, midCols: 4,                // 3 tầng [WIKI RoM "General"]; số cột điểm dừng mỗi tầng [ƯỚC LƯỢNG]
    startPick: 3, startKeep: 2, cap: 6, coins: 60, food: 24, // 1 trong 3 quái ngẫu nhiên khi mở đầu [WIKI RoM "General"]; còn lại [ƯỚC LƯỢNG]
    battleCoins: 18, floorCoins: 6, floorCap: 2, floorFood: 6,   // quy mô +2 sau mỗi tầng thay cho sự kiện Thử Thách Anh Hùng chưa làm [LOC monsrise/ev_battle_win_heroic_trial; số ước lượng]
    price: { 1: 15, 2: 30, 4: 60 },       // giá chiêu mộ theo cost [ƯỚC LƯỢNG]
    badgePrice: 40, potPrice: 20, foodPrice: 12, foodPack: 6, rebornPrice: 70,
    shieldCut: 0.5,                       // 1 Khiên: nhận ít hơn 50% s.thương và mất 1 Khiên [LOC monsrise/tips_shield; 50% ước lượng]
    starve: 0.3,                          // Chết Đói: quái ta gây ít hơn 30% [LOC Starving_Buff_desc; 30 ước lượng]
    mistAt: 120, mistDps: 0.02,           // sương mù nuốt đội sau 120 giây, mất 2% HP tối đa mỗi giây [LOC battle_in_mist; số ước lượng]
    lvlMul: 1.3, lvlMax: 3,               // gộp quái cùng loại: cấp +1, chỉ số x1,3 [LOC tips_levelup; số ước lượng]
    afterHeal: 0.25, restFrac: 0.3, restMeal: 0.6,         // nghỉ ngơi hồi 30% (có thức ăn 60%) [LOC ev_rest_after_battle*; số ước lượng]
    foodRest: 2, tol: 25, statueCoins: 30,
    stun: 1, burn: 0.03, bleed: 0.02, poison: 0.02, cold: 0.3   // hiệu ứng: HP/giây theo % HP tối đa, cold giảm tốc đánh [LOC buff_desc_*; số ước lượng]
  };

  // ---------------------------------------------------------------- ngẫu nhiên có hạt giống
  let seedV = (Date.now() & 0x7fffffff) || 1;
  MR.seed = n => { seedV = n >>> 0; };
  const rnd = MR.rnd = () => { seedV = (seedV + 0x6D2B79F5) >>> 0; let t = seedV; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // ---------------------------------------------------------------- bản đồ
  const TYPES = ['fight', 'event', 'shop', 'ritual', 'rest'];
  const TYPE_NAME = { start: 'Bắt đầu', fight: 'Chiến đấu', shop: 'Giao dịch', event: 'Sự kiện', ritual: 'Nghi lễ', rest: 'Nghỉ ngơi', boss: 'Trùm', end: 'Cổng' };   // [LOC monsrise/ev_room_*]
  MR.typeName = t => TYPE_NAME[t] || t;
  const FLOOR_NAME = ['Rừng Rậm', 'Đầm Lầy', 'Vùng Sương Mù'];   // hai tên đầu [LOC level_name_0/1]; tầng 3 [ƯỚC LƯỢNG]
  MR.floorName = f => FLOOR_NAME[f] || ('Tầng ' + (f + 1));
  const WEIGHT = [['fight', 40], ['event', 20], ['shop', 15], ['ritual', 10], ['rest', 15]];
  function rollType() { let r = rnd() * 100; for (const [t, w] of WEIGHT) { if ((r -= w) < 0) return t; } return 'fight'; }

  // Một tầng: cột 0 = xuất phát, cột 1..midCols = 2-3 điểm dừng, cột cuối = trùm. Mỗi điểm nối 1-2 điểm cột sau, điểm nào cũng có đường vào.
  MR.genFloor = function (floor) {
    const cols = [[{ id: floor + ':0:0', type: 'start', col: 0, row: 0, next: [] }]];
    for (let c = 1; c <= C.midCols; c++) {
      const n = 2 + (rnd() < 0.5 ? 1 : 0), col = [];
      for (let r = 0; r < n; r++) col.push({ id: floor + ':' + c + ':' + r, type: c === 1 ? 'fight' : rollType(), col: c, row: r, next: [] });
      cols.push(col);
    }
    cols.push([{ id: floor + ':' + (C.midCols + 1) + ':0', type: 'boss', col: C.midCols + 1, row: 0, next: [] }]);
    // bảo đảm có cửa hàng ở cột 2 và điểm nghỉ ở cột áp chót (mỗi cột vẫn có đường khác) [ƯỚC LƯỢNG]
    cols[2][0].type = 'shop'; cols[C.midCols][0].type = 'rest';
    for (let c = 0; c < cols.length - 1; c++) {
      const a = cols[c], b = cols[c + 1];
      a.forEach((n, i) => { const t = Math.min(b.length - 1, Math.round(i * (b.length - 1) / Math.max(1, a.length - 1))); n.next.push(b[t].id); if (b.length > 1 && rnd() < 0.5) { const o = b[(t + 1) % b.length].id; if (!n.next.includes(o)) n.next.push(o); } });
      b.forEach(m => { if (!a.some(n => n.next.includes(m.id))) a[Math.floor(rnd() * a.length)].next.push(m.id); });
    }
    return { floor, name: MR.floorName(floor), cols };
  };
  MR.node = (R, id) => { for (const col of R.map.cols) for (const n of col) if (n.id === id) return n; return null; };

  // ---------------------------------------------------------------- đội của người chơi
  let uid = 1;
  function recOf(key) { const m = MON[key]; return { uid: uid++, key, lvl: 1, hp: m.hp, badges: [] }; }
  const maxHp = rec => Math.round(MON[rec.key].hp * Math.pow(C.lvlMul, rec.lvl - 1)) + (rec.badges.includes('bulwark') ? 1000 : 0);
  MR.maxHp = maxHp;
  MR.used = R => R.mons.reduce((s, r) => s + MON[r.key].cost, 0);
  MR.living = R => R.mons.filter(r => r.hp > 0);

  MR.newRun = function (heroId) {
    const pool = MR.ids.filter(k => MON[k].cost <= 2 && MON[k].race !== 'slime' && MON[k].race !== 'demon');
    const R = {
      hero: heroId, floor: 0, cur: null, map: MR.genFloor(0), coins: C.coins, food: C.food, cap: C.cap, mons: [], fallen: [], bag: [], kills: 0,
      screen: 'start', starters: shuffle(pool).slice(0, C.startPick), stats: { battles: 0, rooms: 0, talents: 0, shells: 0, foodUsed: 0 }, over: false, won: null, log: [],
      placed: {}, shop: null, event: null, bt: null
    };
    R.cur = R.map.cols[0][0].id;
    return R;
  };
  // Chọn quái xuất phát: 3 quái ngẫu nhiên, chọn startKeep con làm đội đầu [WIKI RoM "General" chỉ nói 1 con; LOC monsrise/ev_start_desc có số {0}: ước lượng 2]
  MR.pickStarter = function (R, key) {
    if (R.screen !== 'start' || !R.starters.includes(key) || R.mons.some(r => r.key === key)) return false;
    R.mons.push(recOf(key)); if (R.mons.length >= C.startKeep) R.screen = 'map'; return true;
  };
  // Chiêu mộ: quái đã có thì lên cấp (cấp tối đa lvlMax, thêm 1 huy hiệu "thiên phú mới"), quái mới tốn quy mô đội [LOC tips_capacity, tips_levelup, team_full]
  MR.recruit = function (R, key) {
    const have = R.mons.find(r => r.key === key && r.hp > 0);
    if (have) {
      if (have.lvl >= C.lvlMax) return { ok: false, why: 'Quái này đã đạt cấp tối đa.' };
      const f = have.hp / maxHp(have);
      have.lvl++; have.badges.push(pick(MR.badgeIds.filter(b => !have.badges.includes(b)) || ['bulwark']) || 'bulwark'); have.hp = Math.round(maxHp(have) * Math.min(1, f + 0.2));
      R.stats.talents++; return { ok: true, up: true, rec: have };
    }
    if (MR.used(R) + MON[key].cost > R.cap) return { ok: false, why: 'Không thể chiêu mộ thêm quái.' };   // [LOC team_full]
    const r = recOf(key); R.mons.push(r); return { ok: true, up: false, rec: r };
  };
  MR.give = function (R, rec, badge) { if (rec.badges.includes(badge)) return false; rec.badges.push(badge); if (badge === 'bulwark') rec.hp += 1000; R.stats.talents++; return true; };

  // ---------------------------------------------------------------- mô phỏng trận (thuần, kiểm thử được không cần giao diện)
  // Đơn vị toạ độ: ô. Quái ta ở nửa trái (x < half), địch nửa phải. Mỗi đơn vị tự đánh nhanh nhất theo khoảng cách.
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  MR.dist = dist;
  function mkUnit(side, key, o) {
    const m = MON[key], lv = o.lvl || 1, k = Math.pow(C.lvlMul, lv - 1), bad = o.badges || [];
    const u = { side, key, m, name: m.name, lvl: lv, x: o.x, y: o.y, home: [o.x, o.y], badges: bad.slice(), alive: true, rec: o.rec || null,
      max: Math.round(m.hp * (o.hpMul || 1) * k) + (bad.includes('bulwark') ? 1000 : 0), atkBase: m.atk * (o.atkMul || 1) * k, aspdBase: m.aspd * (bad.includes('powercharge') ? 0.75 : 1),
      range: m.range, crit: m.crit, critDmg: m.critDmg, ms: m.ms, shield: bad.includes('precaution') ? 12 : 0, cdMax: m.cd || 0, cdT: m.cd || 0, atkT: 0.2 + rnd() * 0.3,
      st: { stun: 0, burn: 0, bleed: 0, poison: 0, cold: 0, crit100: 0, inv: 0 }, mods: [], casts: 0, hits: 0, nextAtk: null, linked: null, splash: false, feigned: false, tCirc: 3, tHeal: 0,
      kills: 0, dmgDone: 0, healDone: 0, id: o.id || (side + uid++) };
    u.hp = o.hp != null ? Math.min(o.hp, u.max) : u.max;
    if (o.shield) u.shield += o.shield;
    return u;
  }
  MR.mkUnit = mkUnit;
  const foesOf = (B, u) => B.units.filter(v => v.alive && v.side !== u.side && !v.st.inv);
  const alliesOf = (B, u) => B.units.filter(v => v.alive && v.side === u.side);
  function nearest(B, u, list) { let b = null, bd = 1e9; for (const v of list || foesOf(B, u)) { const d = dist(u, v); if (d < bd) { bd = d; b = v; } } return b; }
  const sortNear = (B, u, list, to) => list.slice().sort((a, b) => dist(to || u, a) - dist(to || u, b));
  function atkOf(u) { let a = u.atkBase; for (const m of u.mods) if (m.k === 'atk') a += m.v; return Math.max(1, a); }
  function aspdOf(u) { let r = 1; for (const m of u.mods) if (m.k === 'aspd') r += m.v; if (u.st.cold > 0) r -= C.cold; return u.aspdBase * Math.max(0.2, r); }
  function addMod(u, k, v, t) { u.mods.push({ k, v, t: t == null ? 1e9 : t }); }
  const adjacent = (B, u) => alliesOf(B, u).filter(v => v !== u && dist(u, v) <= 1.6);
  const isolated = (B, u) => adjacent(B, u).length === 0;
  const fx = (B, o) => { if (B.fx.length < 220) B.fx.push(Object.assign({ t: 0, dur: 0.3 }, o)); };
  const tag = (B, u, txt, col) => fx(B, { k: 'txt', x: u.x, y: u.y - 0.7, txt, col: col || '#fff', dur: 0.7 });

  function heal(B, u, n, from) {
    if (!u.alive || n <= 0) return 0;
    if (from && from.badges.includes('chef')) n *= 1.5;
    if (u.badges.includes('chef')) n *= 1.5;
    const g = Math.min(n, u.max - u.hp); if (g <= 0) return 0;
    u.hp += g; if (from) from.healDone += g; tag(B, u, '+' + Math.round(g), '#6cff7a'); return g;
  }
  MR.heal = heal;
  function giveShield(B, u, n) { if (!u.alive) return; u.shield += n * (u.badges.includes('fortify') ? 1.5 : 1); tag(B, u, '+' + n + ' khiên', '#8ad8ff'); }

  // Gây sát thương. o: {skill, noCrit, raw, status}
  function hit(B, src, dst, amount, o) {
    if (!dst.alive || dst.st.inv > 0 && !(o && o.raw)) return 0;
    o = o || {};
    let crit = false;
    if (!o.noCrit && !o.raw && (src.st.crit100 > 0 || rnd() * 100 < src.crit)) { amount *= src.critDmg / 100; crit = true; }
    if (src.badges.includes('sunder')) amount *= 1.25;
    if (src.side === 'a' && B.starving) amount *= 1 - C.starve;
    if (dst.badges.includes('lone_off') && isolated(B, dst)) amount *= 1.35;
    if (dst.shield > 0 && !o.raw) {
      dst.shield -= src.badges.includes('sunder') ? 4 : 1; if (dst.shield < 0) dst.shield = 0;
      amount *= 1 - C.shieldCut; fx(B, { k: 'ring', x: dst.x, y: dst.y, col: '#8ad8ff', dur: 0.25 });
    }
    amount = Math.max(1, Math.round(amount));
    dst.hp -= amount; src.dmgDone += amount; dst.lastHit = B.time;
    tag(B, dst, (crit ? '!' : '') + amount, crit ? '#ffd24a' : '#ff8a8a');
    if (o.status) applyStatus(B, dst, o.status);
    if (dst.hp <= 0) die(B, dst, src);
    return amount;
  }
  MR.hit = hit;
  function applyStatus(B, u, s) {
    if (u.badges.includes('immolation')) return;
    if (s === 'stun') u.st.stun = Math.max(u.st.stun, C.stun);
    else if (s === 'burn') u.st.burn = 4; else if (s === 'bleed') u.st.bleed = 4; else if (s === 'poison') u.st.poison = 4; else if (s === 'cold') u.st.cold = 3;
  }
  function debuffs(u) { return ['stun', 'burn', 'bleed', 'poison', 'cold'].filter(k => u.st[k] > 0); }
  function die(B, u, src) {
    if (!u.alive) return;
    if (u.badges.includes('feign') && !u.feigned) { u.feigned = true; u.hp = Math.round(u.max * 0.2); u.st.inv = 0; tag(B, u, 'Giả Chết', '#c8a8ff'); return; }
    u.alive = false; u.hp = 0; if (src) src.kills++;
    fx(B, { k: 'puff', x: u.x, y: u.y, dur: 0.5 });
    B.dead.push(u);
    if (u.side === 'e') B.killed++;
  }

  function cast(B, u) {
    const sk = u.m.skill; if (!sk) return;
    const F = foesOf(B, u), A = alliesOf(B, u); u.casts++;
    const tgt = nearest(B, u);
    const aoe = (c, r, dmg, st) => foesOf(B, u).filter(v => dist(c, v) <= r).forEach(v => hit(B, u, v, dmg, { skill: 1, status: st }));
    fx(B, { k: 'ring', x: u.x, y: u.y, col: '#ffd24a', dur: 0.3 });
    switch (sk) {
      case 'arcane_lightning': {   // 342~722 lên tối đa 3 địch trong tầm 8, theo khoảng cách; mỗi lần thứ 2 gây choáng [WIKI RoM]
        sortNear(B, u, F).filter(v => dist(u, v) <= 8).slice(0, 3).forEach(v => { fx(B, { k: 'bolt', x: u.x, y: u.y, x2: v.x, y2: v.y, col: '#c8e8ff', dur: 0.25 }); hit(B, u, v, 342 + 380 * Math.min(1, dist(u, v) / 8), { skill: 1, status: u.casts % 2 === 0 ? 'stun' : null }); });
        break; }
      case 'life_link': {          // cân bằng % HP của đồng đội trong tầm 2 [WIKI RoM]
        const g = A.filter(v => dist(u, v) <= 2), pct = g.reduce((s, v) => s + v.hp, 0) / g.reduce((s, v) => s + v.max, 0);
        for (const v of g) { const t = Math.round(v.max * pct); if (t > v.hp) heal(B, v, t - v.hp, u); else v.hp = Math.max(1, t); }
        break; }
      case 'incendiary': u.nextAtk = { add: 15, status: 'burn' }; break;   // đòn kế +15 sát thương và thiêu đốt [WIKI RoM]
      case 'reap': aoe(u, 1.6, 120, rnd() < 0.75 ? 'bleed' : null); break;   // 120 xung quanh, 75% chảy máu [WIKI RoM]
      case 'precision_shot': u.nextAtk = { dmg: 825 }; break;              // đòn kế 825 [WIKI RoM]
      case 'defensive_formation': giveShield(B, u, 5); adjacent(B, u).forEach(v => giveShield(B, v, 3)); break;   // 5 Khiên, kề bên 3 [WIKI RoM]
      case 'whirlwind': aoe(u, 1.6, 105); break;                            // 105 quanh mình [WIKI RoM]
      case 'sword_of_protection': aoe(u, 1.6, 228); A.filter(v => dist(u, v) <= 1.6).forEach(v => heal(B, v, v.max * 0.045, u)); break;   // 228 và hồi 4,5% [WIKI RoM]
      case 'leaping_strike': {     // lao tới đồng đội bị đánh gần nhất và cho 4 Khiên rồi 540 quanh đó [WIKI RoM]
        const last = A.filter(v => v !== u && v.lastHit != null).sort((a, b) => b.lastHit - a.lastHit)[0];
        if (last) { u.x = last.x; u.y = last.y; giveShield(B, last, 4); } else if (tgt) { u.x = tgt.x - 0.9 * (u.side === 'a' ? 1 : -1); u.y = tgt.y; }
        aoe(u, 1.6, 540); break; }
      case 'unyielding': heal(B, u, 500, u); addMod(u, 'atk', 10, 5); break;   // hồi 500 HP, +10 tấn công/5 s (rút gọn) [WIKI RoM]
      case 'shadow_strike': {      // lao 192 vào tối đa 3 địch ngẫu nhiên; tầm lao ước lượng 4 [WIKI RoM; tầm ƯỚC LƯỢNG]
        shuffle(F.filter(v => dist(u, v) <= 4)).slice(0, 3).forEach(v => { u.x = v.x - 0.8 * (u.side === 'a' ? 1 : -1); u.y = v.y; hit(B, u, v, 192, { skill: 1 }); });
        break; }
      case 'shadow_step': {        // dịch chuyển tới địch xa nhất, đòn thường chắc chắn bạo 3 giây [WIKI RoM]
        const far = F.slice().sort((a, b) => dist(u, b) - dist(u, a))[0];
        if (far) { u.x = far.x - 0.9 * (u.side === 'a' ? 1 : -1); u.y = far.y; } u.st.crit100 = 3; break; }
      case 'fire_at_will': addMod(u, 'aspd', 0.1); break;                  // +10% tốc đánh, cộng dồn [WIKI RoM]
      case 'bash': if (tgt) hit(B, u, tgt, 207, { skill: 1 }); if (u.casts % 4 === 0) summon(B, u, 'pitcher'); break;   // 207, triệu hồi Khỉ Bàn Tay Vàng mỗi 4 lần [WIKI RoM]
      case 'cultivation': u.hp = Math.max(1, u.hp - u.hp * 0.2); addMod(u, 'atk', 25); break;   // đổi 20% HP hiện tại lấy +25 tấn công [WIKI RoM]
      case 'armed_reinforcement': A.filter(v => dist(u, v) <= 2).forEach(v => addMod(v, 'atk', 20, 2)); break;   // đồng đội tầm 2 +20 tấn công 2 s [WIKI RoM]
      case 'huge_snowball': if (tgt) { hit(B, u, tgt, 209, { skill: 1, status: 'cold' }); aoe(tgt, 1.6, 209, 'cold'); } break;   // 209 quanh mục tiêu + lạnh [WIKI RoM]
      case 'conversion': {         // 40 s.thương và hút hết hiệu ứng xấu, mỗi cái hồi 30 HP [WIKI RoM]
        const near = F.filter(v => dist(u, v) <= 1.6); let n = 0;
        near.forEach(v => { debuffs(v).forEach(k => { v.st[k] = 0; n++; }); hit(B, u, v, 40, { skill: 1 }); });
        if (n) heal(B, u, 30 * n, u); break; }
      default: break;
    }
  }
  function summon(B, u, key) {
    const m = MON[key], v = mkUnit(u.side, key, { x: u.x + (u.side === 'a' ? 0.7 : -0.7), y: u.y + (rnd() < 0.5 ? 0.6 : -0.6), hpMul: 1, id: 's' + (B.units.length + 1) });
    v.summoned = true; B.units.push(v); tag(B, v, 'Triệu hồi', '#ffd24a'); return v;
  }

  // Kỹ năng đầu trận [WIKI RoM, ô "CD -"]
  function startSkill(B, u) {
    const sk = u.m.skill, F = foesOf(B, u), A = alliesOf(B, u), dir = u.side === 'a' ? 1 : -1;
    const tgt = nearest(B, u);
    switch (sk) {
      case 'link_recovery': {      // nối tối đa 2 đồng đội phía trước; trúng địch thì cả nhóm hồi 30 [WIKI RoM]
        const front = A.filter(v => v !== u).sort((a, b) => (b.x - a.x) * dir).slice(0, 2); u.linked = [u].concat(front); break; }
      case 'into_the_fray': if (tgt) { u.x = tgt.x - 0.9 * dir; u.y = tgt.y; hit(B, u, tgt, 600, { skill: 1 }); tgt.x = Math.min(C.cols - 0.3, Math.max(0.3, tgt.x + 4 * dir)); } break;   // xung phong 600, đẩy lùi 4 [WIKI RoM]
      case 'arcane_cannon': if (tgt) { const behind = A.filter(v => v !== u && Math.abs(v.y - u.y) < 0.6 && (v.x - u.x) * dir < 0).length; hit(B, u, tgt, 975 + 130 * behind, { skill: 1 }); fx(B, { k: 'bolt', x: u.x, y: u.y, x2: tgt.x, y2: tgt.y, col: '#ff9ad8', dur: 0.4 }); } break;   // 975 + 130 mỗi quái đứng sau cùng hàng [WIKI RoM]
      case 'high_explosive': u.splash = true; break;                       // đòn thường nổ lan sang địch kề mục tiêu [WIKI RoM]
      case 'suppressing_fire': addMod(u, 'aspd', 2.5, 2.5); addMod(u, 'atk', 12, 2.5); break;   // +250% tốc đánh 2,5 s [WIKI RoM]
      case 'burrow': u.x = Math.min(C.cols - 0.3, Math.max(0.3, u.x + 6 * dir)); F.filter(v => dist(u, v) <= 1.8).forEach(v => { v.x = Math.min(C.cols - 0.3, Math.max(0.3, v.x + 3 * dir)); hit(B, u, v, u.atkBase, { skill: 1 }); }); break;   // chui ra trước 6 ô, đẩy lùi địch [WIKI RoM]
      case 'feral_hurl': {         // cho mình và quái ngay sau lưng 4 Khiên rồi quăng quái đó tới trước 4 ô, gây 45 x Khiên [WIKI RoM]
        giveShield(B, u, 4);
        const back = A.filter(v => v !== u && (v.x - u.x) * dir < 0).sort((a, b) => dist(u, a) - dist(u, b))[0];
        if (back) { giveShield(B, back, 4); back.x = Math.min(C.cols - 0.3, Math.max(0.3, back.x + 4 * dir)); F.filter(v => dist(back, v) <= 1.6).forEach(v => hit(B, u, v, 45 * back.shield, { skill: 1 })); }
        break; }
      default: break;
    }
  }

  function placeEnemy(list) {   // xếp quái địch nửa phải: cận chiến phía trước, xạ thủ/pháp sư phía sau
    const cells = {};
    const order = list.slice().sort((a, b) => a.m.range - b.m.range);
    order.forEach(u => {
      const front = u.m.range <= 1.5, cols = front ? [0, 1, 2, 3, 4, 5] : [2, 3, 4, 5, 1, 0];
      let spot = null;
      for (const c of cols) { const rs = shuffle([0, 1, 2, 3, 4]); const r = rs.find(r => !cells[c + ':' + r]); if (r != null) { spot = [c, r]; break; } }
      if (!spot) spot = [0, Math.floor(rnd() * C.rows)];
      cells[spot[0] + ':' + spot[1]] = 1; u.x = C.half + spot[0] + 0.5; u.y = spot[1] + 0.5; u.home = [u.x, u.y];
    });
  }

  // Tạo trận: allies = [{rec, x, y}] đã đặt (ô), foes = [unit] đã dựng bằng MR.spawnFoes
  MR.startBattle = function (R, allies, foes, o) {
    o = o || {};
    const B = { units: [], dead: [], fx: [], time: 0, over: false, won: null, killed: 0, starving: !!o.starving, speed: 1, boss: !!o.boss, mist: false, rec: new Map() };
    for (const a of allies) {
      const u = mkUnit('a', a.rec.key, { x: a.x + 0.5, y: a.y + 0.5, lvl: a.rec.lvl, badges: a.rec.badges, hp: a.rec.hp, rec: a.rec });
      B.units.push(u); B.rec.set(a.rec, u);
    }
    placeEnemy(foes); for (const f of foes) B.units.push(f);
    for (const u of B.units) if (u.m.cd === 0 && u.m.skill) startSkill(B, u);
    return B;
  };
  // Quái địch theo tầng/điểm dừng: ngân sách = tổng cost, HP/ATK tăng theo tầng và điểm dừng [ƯỚC LƯỢNG]
  const POOLS = [['slime_g', 'slime_y', 'slime_r', 'charger', 'shotgun', 'novice', 'sniper', 'ninja', 'rangermon', 'goldmon', 'slime_g'],
    ['trainee', 'prayer', 'arcane', 'shield', 'guardian', 'blaster', 'borer', 'driller', 'batter', 'monk', 'cladmon', 'snowace', 'snowchamp'],
    ['priest', 'executor', 'savior', 'spader', 'duper', 'warlord', 'arcane', 'guardian', 'blaster', 'snowchamp', 'cladmon', 'shield', 'marketeer']];
  MR.spawnFoes = function (R, kind) {
    const f = R.floor, step = R.map.cols.findIndex(c => c.some(n => n.id === R.cur)), list = [];
    const hpMul = 1 + 0.15 * f + 0.03 * step, atkMul = 1 + 0.1 * f + 0.02 * step;
    const mk = (key, o) => { const u = mkUnit('e', key, Object.assign({ x: 8, y: 2, hpMul, atkMul }, o)); list.push(u); return u; };
    if (kind === 'boss') {
      if (f === C.floors - 1) {   // trận chung kết: đội quán quân kỳ trước [LOC monsrise/last_champion_formation, ev_final_desc]
        const names = shuffle(MR.ids.filter(k => MON[k].cost <= 4 && MON[k].race !== 'slime' && MON[k].race !== 'demon'));
        let budget = 8; for (const k of names) { if (budget < MON[k].cost) continue; budget -= MON[k].cost; mk(k, { lvl: list.length < 2 ? 2 : 1, hpMul: 1, atkMul: 1, badges: [pick(['sunder', 'lifesteal', 'precaution', 'circle'])] }); if (budget <= 0) break; }
        return list;
      }
      mk(f === 0 ? 'nightmare' : 'cannibal', { hpMul: 1, atkMul: 1 });
      let b = 1 + 1.5 * f; for (const k of shuffle(POOLS[f])) { if (b < MON[k].cost) continue; b -= MON[k].cost; mk(k); if (b <= 0 || list.length >= 6) break; }
      return list;
    }
    let b = 1.5 + 2 * f + step * 0.8;
    const early = f === 0 && step <= 2;   // trận đầu chỉ có Slime [ƯỚC LƯỢNG]
    for (const k of shuffle(early ? ['slime_g', 'slime_y', 'slime_r'] : POOLS[Math.min(f, 2)])) { if (b < MON[k].cost) continue; b -= MON[k].cost; mk(k); if (b < 1 || list.length >= 9) break; }
    if (!list.length) mk('slime_y');
    return list;
  };

  MR.battleStep = function (B, dt) {
    if (B.over) return;
    B.time += dt;
    for (const f of B.fx) f.t += dt; B.fx = B.fx.filter(f => f.t < f.dur);
    if (!B.mist && B.time >= C.mistAt) { B.mist = true; }
    const live = B.units.filter(u => u.alive);
    for (const u of live) {
      if (!u.alive) continue;
      // trạng thái
      for (const k of ['stun', 'cold', 'crit100', 'inv']) if (u.st[k] > 0) u.st[k] = Math.max(0, u.st[k] - dt);
      for (const k of ['burn', 'bleed', 'poison']) if (u.st[k] > 0) u.st[k] = Math.max(0, u.st[k] - dt);
      u.mods = u.mods.filter(m => (m.t -= dt) > 0);
      if (B.mist && u.side === 'a') u.hp -= u.max * C.mistDps * dt;
      if (u.badges.includes('circle') && (u.tCirc -= dt) <= 0) { u.tCirc = 3; const n = u.max * 0.05; heal(B, u, n, u); alliesOf(B, u).filter(v => v !== u && dist(u, v) <= 2).forEach(v => heal(B, v, n * 0.3, u)); }
      if (u.hp <= 0) { die(B, u, null); continue; }
    }
    // nội dung hiệu ứng theo giây: cộng dồn mỗi tick
    for (const u of B.units) {
      if (!u.alive) continue;
      const dot = (u.st.burn > 0 ? C.burn : 0) + (u.st.bleed > 0 ? C.bleed : 0) + (u.st.poison > 0 ? C.poison : 0);
      if (dot > 0) { u.hp -= u.max * dot * dt; if (u.hp <= 0) die(B, u, null); }
    }
    for (const u of B.units) {
      if (!u.alive || u.st.stun > 0) continue;
      // tấn công thường: nhịp theo công tốc
      let bonusAtk = 0;
      if (u.badges.includes('formation_off')) { if (!isolated(B, u)) bonusAtk += 30; }
      for (const v of adjacent(B, u)) if (v.badges.includes('formation_off')) bonusAtk += 15;
      if (u.badges.includes('lone_off') && isolated(B, u)) bonusAtk += 30;
      u._bonus = bonusAtk;
      if (u.cdMax > 0) {
        let rate = 1 + (u.badges.includes('powercharge') ? 0.4 : 0) + (adjacent(B, u).some(v => v.badges.includes('sage')) ? 0.5 : 0);
        u.cdT -= dt * rate;
        if (u.cdT <= 0 && foesOf(B, u).length) { cast(B, u); u.cdT = u.cdMax; }
      }
      const t = nearest(B, u); if (!t) continue;
      const d = dist(u, t), dir = t.x >= u.x ? 1 : -1;
      if (d > u.range) {
        const sp = u.ms * (u.st.cold > 0 ? 0.7 : 1) * dt, k = Math.min(1, sp / d);
        u.x += (t.x - u.x) * k; u.y += (t.y - u.y) * k; u.face = dir; u.mv = true;
      } else {
        u.face = dir; u.mv = false; u.atkT -= dt;
        if (u.atkT <= 0) { u.atkT += 1 / aspdOf(u); if (u.atkT < 0.05) u.atkT = 0.05; attack(B, u, t); }
      }
    }
    // tách nhau nhẹ để khỏi chồng hình
    const arr = B.units.filter(u => u.alive);
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i], b = arr[j], d = dist(a, b);
      if (d < 0.45) { const px = d < 0.001 ? 0.2 : (a.x - b.x) / d * 0.9 * dt, py = d < 0.001 ? 0 : (a.y - b.y) / d * 0.9 * dt; a.x += px; a.y += py; b.x -= px; b.y -= py; }
    }
    for (const u of arr) { u.x = Math.min(C.cols - 0.2, Math.max(0.2, u.x)); u.y = Math.min(C.rows - 0.2, Math.max(0.2, u.y)); }
    const A = B.units.filter(u => u.alive && u.side === 'a'), E = B.units.filter(u => u.alive && u.side === 'e');
    if (!E.length) { B.over = true; B.won = true; } else if (!A.length) { B.over = true; B.won = false; }
  };
  function attack(B, u, t) {
    let dmg = atkOf(u) + (u._bonus || 0), st = null;
    if (u.nextAtk) { if (u.nextAtk.dmg) dmg = u.nextAtk.dmg; if (u.nextAtk.add) dmg += u.nextAtk.add; st = u.nextAtk.status || null; u.nextAtk = null; }
    if (u.m.range > 1.5) fx(B, { k: 'shot', x: u.x, y: u.y, x2: t.x, y2: t.y, col: u.side === 'a' ? '#ffe28a' : '#ff9a9a', dur: 0.15 }); else fx(B, { k: 'slash', x: t.x, y: t.y, dur: 0.18 });
    const shots = u.badges.includes('split') ? 3 : 1, per = u.badges.includes('split') ? 0.55 : 1;
    for (let i = 0; i < shots; i++) {
      const tt = i === 0 ? t : (sortNear(B, u, foesOf(B, u))[i] || t);
      const n = hit(B, u, tt, dmg * per, { status: st });
      if (u.splash) foesOf(B, u).filter(v => v !== tt && dist(tt, v) <= 1.3).forEach(v => hit(B, u, v, dmg * per, { noCrit: 1 }));
    }
    u.hits++;
    if (u.badges.includes('lifesteal')) heal(B, u, u.max * 0.015, u);
    if (u.linked) for (const v of u.linked) if (v.alive) heal(B, v, 30, u);   // Cầu Phúc: trúng địch thì cả nhóm hồi 30 [WIKI RoM]
  }
  // Chạy hết trận (cho kiểm thử và chế độ tua nhanh)
  MR.simulate = function (B, maxT) { let n = 0; while (!B.over && B.time < (maxT || 400) && n++ < 40000) MR.battleStep(B, 0.05); return B; };
  // Ghi kết quả về đội: HP còn lại, quái chết là mất hẳn (xác ghi vào fallen) [LOC monsrise/monster_die]
  MR.settle = function (R, B) {
    for (const [rec, u] of B.rec) {
      if (u.alive) rec.hp = Math.max(1, Math.round(u.hp)); else { rec.hp = 0; R.fallen.push(rec); }
    }
    R.mons = R.mons.filter(r => r.hp > 0);
    R.kills += B.killed; R.stats.battles++;
  };

  // ---------------------------------------------------------------- phần thưởng, cửa hàng, nghỉ, nghi lễ, sự kiện
  MR.battleReward = function (R, boss) {
    const c = C.battleCoins + R.floor * 6 + (boss ? 30 : 0); R.coins += c;
    const fd = boss ? 6 : 3; R.food += fd;
    return { coins: c, food: fd };
  };
  MR.foodNeed = (R, keys) => (keys || R.mons.filter(r => r.hp > 0).map(r => r.key)).reduce((s, k) => s + Math.ceil(MON[k].cost / 2), 0);   // món ăn xuất trận tiêu hao (nửa quy mô làm tròn lên: số ước lượng) [LOC monsrise/tips_food, food_battle_consumption]
  MR.rollShop = function (R) {
    const pool = shuffle(MR.ids.filter(k => MON[k].race !== 'demon' && !(MON[k].race === 'slime' && R.floor > 1)));
    const mons = pool.slice(0, 3).map(k => ({ kind: 'monster', key: k, price: C.price[MON[k].cost] }));
    const bs = shuffle(MR.badgeIds).slice(0, 2).map(b => ({ kind: 'badge', key: b, price: C.badgePrice }));
    const misc = [{ kind: 'pot', key: 'pot', price: C.potPrice }, { kind: 'food', key: 'food', price: C.foodPrice }];
    if (R.fallen.length) misc.push({ kind: 'reborn', key: 'reborn', price: C.rebornPrice });   // [LOC monsrise/item_reborn_desc]
    return mons.concat(bs, misc).map((it, i) => Object.assign(it, { i, sold: false }));
  };
  MR.buy = function (R, it, rec) {
    if (it.sold) return { ok: false, why: 'Đã bán hết.' };
    if (R.coins < it.price) return { ok: false, why: 'Bạn không đủ Vàng.' };   // [LOC monsrise/not_enough]
    if (it.kind === 'monster') { const r = MR.recruit(R, it.key); if (!r.ok) return r; }
    else if (it.kind === 'badge') { if (!rec || !MR.give(R, rec, it.key)) return { ok: false, why: 'Chọn một quái chưa có huy hiệu này.' }; }
    else if (it.kind === 'pot') { for (const r of R.mons) r.hp = Math.min(maxHp(r), r.hp + Math.round(maxHp(r) * 0.4)); }
    else if (it.kind === 'food') R.food += C.foodPack;
    else if (it.kind === 'reborn') { for (const r of R.fallen) { r.hp = Math.max(1, Math.round(maxHp(r) * 0.5)); if (MR.used(R) + MON[r.key].cost <= R.cap) R.mons.push(r); } R.fallen = []; }   // hồi sinh quái đã mất (nếu còn chỗ)
    R.coins -= it.price; it.sold = true; return { ok: true };
  };
  MR.rest = function (R, meal) {
    let frac = C.restFrac;
    if (meal) { if (R.food < C.foodRest) return { ok: false, why: 'Bạn không đủ Thức ăn.' }; R.food -= C.foodRest; frac = C.restMeal; }
    for (const r of R.mons) r.hp = Math.min(maxHp(r), r.hp + Math.round(maxHp(r) * frac));
    return { ok: true, frac };
  };
  // Nghi lễ: quái bên trái hi sinh để quái bên phải nhận thiên phú (một huy hiệu) [LOC monsrise/ritual_desc]
  MR.ritual = function (R, sac, gain) {
    if (R.mons.length < 2 || sac === gain || !R.mons.includes(sac) || !R.mons.includes(gain)) return { ok: false, why: 'Cần chọn hai quái khác nhau.' };
    const opts = MR.badgeIds.filter(b => !gain.badges.includes(b)); if (!opts.length) return { ok: false, why: 'Quái này đã đủ huy hiệu.' };
    const b = pick(opts); R.mons.splice(R.mons.indexOf(sac), 1); MR.give(R, gain, b); return { ok: true, badge: b };
  };
  // Sự kiện [LOC monsrise/ev_*]
  MR.EVENTS = {
    bandit: { title: 'Cướp Đường', text: kv => 'Một đám quái chặn đường và đòi ' + kv.toll + ' Vàng mãi lộ.', a: { label: 'Đưa Vàng' }, b: { label: 'Từ chối, chuẩn bị chiến đấu' } },
    statue: { title: 'Bức Tượng Lạ', text: () => 'Bạn tình cờ thấy một bức tượng kỳ quái có sức hút khó tả.', a: { label: 'Chạm vào tượng' }, b: { label: 'Không mạo hiểm, đi tiếp' } },
    bonfire: { title: 'Đống Lửa Trại', text: kv => 'Theo làn khói, bạn thấy ' + MON[kv.key].name + ' đang nghỉ bên đống lửa.', a: { label: 'Chào hỏi thân thiện' }, b: { label: 'Đi tiếp' } },
    omission: { title: 'Dấu Vết Giao Tranh', text: () => 'Phía trước là cảnh hoang tàn như vừa có một trận chiến.', a: { label: 'Đến xem còn gì giá trị' }, b: { label: 'Đi đường vòng tránh rủi ro' } }
  };
  MR.rollEvent = function (R) { const id = pick(Object.keys(MR.EVENTS)); const kv = { toll: 20 + 10 * R.floor, key: pick(MR.ids.filter(k => MON[k].cost <= 2 && MON[k].race !== 'slime' && MON[k].race !== 'demon')) }; return { id, kv, done: false, msg: '' }; };
  // Trả: {fight:true} nếu rơi vào trận; ngược lại kết quả ngay
  MR.eventAct = function (R, ev, choice) {
    const id = ev.id, kv = ev.kv;
    if (id === 'bandit') {
      if (choice === 'a') { if (R.coins < kv.toll) return { ok: false, why: 'Bạn không đủ Vàng.' }; R.coins -= kv.toll; return { ok: true, msg: 'Đám quái nhận Vàng rồi tản đi.' }; }
      return { ok: true, fight: true, msg: 'Bạn chuẩn bị chiến đấu!' };
    }
    if (id === 'statue') {
      if (choice === 'a') { R.coins += C.statueCoins; return { ok: true, msg: 'Bạn nhận được ' + C.statueCoins + ' Vàng.' }; }
      return { ok: true, msg: 'Bạn đi tiếp.' };
    }
    if (id === 'bonfire') {
      if (choice === 'a') { const r = MR.recruit(R, kv.key); return r.ok ? { ok: true, msg: MON[kv.key].name + ' đã gia nhập đội.' } : { ok: true, msg: 'Đội quá đông, bạn phải từ chối lời đề nghị.' }; }   // [LOC ev_reject_apply]
      return { ok: true, msg: 'Bạn đi tiếp.' };
    }
    if (id === 'omission') {
      if (choice === 'a') { if (rnd() < 0.4) return { ok: true, fight: true, msg: 'Bạn bị phục kích!' }; const c = 20 + 10 * R.floor; R.coins += c; return { ok: true, msg: 'Bạn nhặt được ' + c + ' Vàng.' }; }
      return { ok: true, msg: 'Bạn đi đường vòng.' };
    }
    return { ok: false, why: 'sự kiện lạ' };
  };

  // ---------------------------------------------------------------- tiến trình
  // Đi tới điểm dừng kế (phải nằm trong next của điểm hiện tại)
  MR.canGo = (R, id) => { const n = MR.node(R, R.cur); return !!(n && n.next.includes(id)); };
  MR.go = function (R, id) {
    if (R.screen !== 'map' || !MR.canGo(R, id)) return false;
    const n = MR.node(R, id); R.cur = id; R.stats.rooms++;
    R.bt = null;
    if (n.type === 'fight' || n.type === 'boss') { R.screen = 'prep'; R.foes = MR.spawnFoes(R, n.type === 'boss' ? 'boss' : 'fight'); R.boss = n.type === 'boss'; }
    else if (n.type === 'shop') { R.screen = 'shop'; R.shop = MR.rollShop(R); }
    else if (n.type === 'rest') { R.screen = 'rest'; }
    else if (n.type === 'ritual') { R.screen = 'ritual'; }
    else if (n.type === 'event') { R.screen = 'event'; R.event = MR.rollEvent(R); }
    return true;
  };
  MR.leaveNode = function (R) { if (R.over) return; R.screen = 'map'; };
  // Kết thúc một trận: ghi HP về đội, thưởng nếu thắng. Thua (hoặc hết quái) = thua ván [WIKI RoM "General"; LOC monsrise/ev_battle_lose]
  MR.concludeBattle = function (R, B) {
    const won = B.won; MR.settle(R, B);
    if (!won || !R.mons.length) { R.lost = true; return (R.bt = { won: false, text: 'Kẻ địch mạnh hơn ta ước tính.' }); }
    const boss = !!R.boss, last = boss && R.floor >= C.floors - 1, rw = MR.battleReward(R, boss);
    R.lost = false;
    for (const r of R.mons) r.hp = Math.min(maxHp(r), r.hp + Math.round(maxHp(r) * C.afterHeal));   // sau mỗi trận thắng cả đội hồi một phần [ƯỚC LƯỢNG; LOC monsrise/team_buff_cure]
    return (R.bt = { won: true, boss, last, rw, text: 'Bạn đã thắng! Nhận ' + rw.coins + ' Vàng và ' + rw.food + ' thức ăn.' + (last ? ' Bạn đã giành chức vô địch Quái Thú Trỗi Dậy!' : '') });   // [LOC monsrise/ev_battle_win, ev_final_win]
  };
  // Bấm "Tiếp tục" ở màn kết quả: 'lose' | 'win' | 'map'. Hạ trùm tầng thì sang tầng kế, quy mô đội +floorCap
  MR.advance = function (R) {
    if (R.lost) return 'lose';
    if (R.bt && R.bt.boss) {
      if (R.floor >= C.floors - 1) return 'win';
      R.floor++; R.map = MR.genFloor(R.floor); R.cur = R.map.cols[0][0].id; R.coins += C.floorCoins; R.cap += C.floorCap; R.food += C.floorFood;
      for (const r of R.mons) r.hp = maxHp(r);   // tới khu vực mới thì cả đội hồi đầy [ƯỚC LƯỢNG]
    }
    R.screen = 'map'; return 'map';
  };
})();
