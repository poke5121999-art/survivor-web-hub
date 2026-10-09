// Bảng chỉnh số viết tay. Một agent khác sẽ thay file này bằng số kéo từ wiki,
// nên giữ nguyên HÌNH DẠNG: heroes / weapons / rules / waves.
// Nhãn nguồn: [WIKI] = tools/wiki/heroes.json; [ƯỚC LƯỢNG] = nhớ từ game gốc.
window.SK_DESIGN = {
  heroes: {
    knight: {
      name: 'Hiệp Sĩ',
      // [ƯỚC LƯỢNG] 7/6/180, sẽ thay bằng số wiki. [WIKI] ghi gốc 6 máu / 5 giáp / 5% chí mạng (trước nâng cấp).
      hp: 7, armor: 6, energy: 180, crit: 0,
      speed: 6.5,                 // đơn vị/giây [ƯỚC LƯỢNG]
      skill: { id: 'dual_wield', name: 'Song Thủ', cd: 10, dur: 5 }, // [WIKI] cd 10, 5 giây
      weapon: 'bad_pistol',
      hand: [3, 6],               // px từ chân, y hướng lên [ƯỚC LƯỢNG] đo bằng mắt trên knight_0_0
      hurt: { size: [10, 14], off: [0, 7] },
      body: { r: 5 },             // nửa bề ngang hộp chân (px)
      shadow: 'shadow2'
    }
  },

  // kind quyết định hành vi (bảng WEAPON_KINDS trong actors.js); còn lại là số.
  // Phần còn lại dựng từ SK_WIKI.weapons ở khối ngay dưới (id = khoá wiki).
  weapons: {
    bad_pistol: { name: 'Súng Lục Cùi', kind: 'gun', type: 'Handgun', grade: 1, rarity: 'White', dmg: 3, cost: 0, crit: 0,
      spread: 5, rps: 3.28, moveMod: -0.1, bulletSpeed: 18, pellets: 1, repel: 1, r: 2, sprite: 'weapons_156',
      bullet: 'bullet_38', hit: 'hit_yellow', starter: true }   // [WIKI] + tốc đạn [ƯỚC LƯỢNG]
  },

  // Rương dùng SK.weaponPool(level, 'chest'); danh sách này là dự phòng cấp 1 cho code cũ (khối dưới lấp).
  chestPool: [],

  rules: {
    hurtInvuln: 0.8,       // giây bất tử sau khi trúng đòn [ƯỚC LƯỢNG]
    armorDelay: 3.0,       // giây không trúng đòn trước khi giáp hồi [ƯỚC LƯỢNG]
    armorTick: 0.8,        // giây / 1 điểm giáp [ƯỚC LƯỢNG]
    critMult: 2,           // chí mạng = gấp đôi [ƯỚC LƯỢNG]
    autoAimRange: 230,     // px; SK tự ngắm con gần nhất trong tầm nhìn [ƯỚC LƯỢNG]
    enemyAtkScale: 0.5,    // atk trong prefab là số chế độ khó; 1-1 thường mất 1 giáp/viên [ƯỚC LƯỢNG]
    enemyMoveScale: 0.7,   // quái đi dạo chậm hơn speed prefab [ƯỚC LƯỢNG]
    telegraph: 0.45,       // quái đứng khựng rồi mới bắn (giây) [ƯỚC LƯỢNG]
    // Viên năng lượng / đồng xu / bình: số thật đọc từ prefab (energy, coin_2, health_pot,
    // energy_pot) trong actors.js; dưới đây chỉ là số dự phòng khi prefab vắng.
    energyOrb: 8, coinValue: 1, potionHp: 2, potionEnergy: 80,
    magnet: 96,            // px (RGEnergy.range 6 đơn vị)
    rewardChestChance: 0.5,
    eliteScale: 1.25,      // quái "badass" vẽ to hơn [ƯỚC LƯỢNG]
    eliteBurst: 3,         // [WIKI Forest] quái tinh anh bắn 3 viên liền
    enemyBulletMaxSpeed: 30 // đơn vị/giây; EGunEliteArcher ghi 65, chặn lại cho khỏi xuyên tường
  },

  // Phòng đánh lấy bố cục + ngân sách thật từ SK_DATA.patterns (pts, waves, ex).
  // Chỉ dùng số dưới đây khi thiếu pattern. [ƯỚC LƯỢNG]
  waves: { count: 2, pts: 16, ex: 10 },

  rooms: {
    // cỡ thật: r_start 15, r_end 19, r_chest_big 11, r_statue 11, r_boss 21 (prefab RGRoomX)
    start: 15, end: 19, chest: 11, special: 11, boss: 21, battle: 15,
    corridor: 5,            // ô sàn bề ngang hành lang = bề ngang prefab door_n (80 px)
    grid: 5                 // "ranks 5|5" của MapManager
  },

  // Chuỗi màn: [chủ đề gốc, tầng]. Mỗi lượt chơi game.js bốc chủ đề trong cùng tầng; chủ đề gốc cho bể trùm và nhạc.
  run: [['forest', 1], ['castle', 2], ['volcano', 3]]
};

// Vũ khí lấy từ số wiki (data/sk-wiki.js). Trường runtime: dmg (dmgMax khi có nạp), cost = năng lượng/phát,
// crit %, spread = độ lệch °, rps, pellets, moveMod (phần: -0.1 = chậm 10% khi giữ bắn), charge (giây).
(function () {
  const WK = window.SK_WIKI, DS = window.SK_DESIGN;
  if (!WK) return;
  // [WIKI] sát thương nạp đầy, đọc từ chuỗi "a~b" của tools/wiki/weapons.json (sk-wiki.js chỉ giữ a).
  const DMG_MAX = { advanced_banishing_staff: 16, ancient_bow: 8, banishing_staff: 12, bow: 8, bow_plus: 25, caliburn: 30,
    composite_bow: 14, crystal_bow: 16, em_railgun: 12, fist_of_heaven: 7, flame_bow: 16, frost_bow: 16, guardian_railgun: 12,
    hero_bow: 16, jade_bow: 16, laser_rain: 19, laser_sword_purple: 18, laser_tempest: 21, magic_bow: 8, prototype_railgun: 18,
    pulse: 12, sacred_flail: 10, shuddering_thunder: 9, slingshot: 5, snow_ape_s_longbow: 20, splash_railgun: 10, star_bow: 16,
    strong_bow: 10, sword_of_king_hero: 16, warhammer_of_sealed_souls: 32, windforce: 9 };
  // Màu theo tên/mô tả → sprite đạn thật (bullet_N trong common.ab; xem bảng ở tools/extra/weapons.json).
  const COLORS = [
    ['red', /flame|fire|burn|hell|dragon|blood|crimson|scarlet|red|lava|volcan|magma|furnace|imp\b/i],
    ['blue', /frost|ice|snow|freez|glacier|water|aqua|tidal|sea|blue|h2o|bubble/i],
    ['yellow', /thunder|electr|lightning|light\b|gold|sun|star|holy|sacred/i],
    ['green', /nature|poison|plague|toxic|green|jade|venom|leaf|momiji|seed|plant|forest|wind/i],
    ['purple', /void|dark|shadow|purple|illusion|arcane|banish|soul|ghost|night|curse|faint/i]
  ];
  const SPR = {
    // [ĐO] soát bằng mắt trên atlas: 38 = viên vàng kinh điển, 36/31/37/39/bullet0 = cầu năng lượng,
    // 0/17/18/41 = thân tia laser, 121/136 = mũi tên / tên nỏ, 106 = trăng khuyết trắng.
    gun: { yellow: 'bullet_38', red: 'bullet_26', blue: 'bullet_33', green: 'bullet_27', purple: 'bullet_2' },
    staff: { yellow: 'bullet_36', red: 'bullet_37', blue: 'bullet_31', green: 'bullet_39', purple: 'bullet0' },
    laser: { yellow: 'bullet_41', red: 'bullet_18', blue: 'bullet_0', green: 'bullet_17', purple: 'bullet_20' },
    orb: { yellow: 'bullet_36', red: 'bullet_30', blue: 'bullet_6', green: 'bullet_39', purple: 'bullet_126' },
    wave: { yellow: 'bullet_106', red: 'bullet_97', blue: 'bullet_54', green: 'bullet_98', purple: 'bullet_2' }
  };
  const HIT = { yellow: 'hit_yellow', red: 'hit_red', blue: 'hit_blue', green: 'hit_green', purple: 'hit_white_large' };
  const WORDS = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const firstPart = u => String(u || '').split(/\n(?:Evolution|Special|Trivia)/)[0];

  function colorOf(id, w, dflt) {
    const s = id + ' ' + w.name;
    for (const [c, rx] of COLORS) if (rx.test(s)) return c;
    return dflt;
  }
  // [WIKI] cột speed: số lớn là %, số nhỏ (-0.5, -1, -2) là đơn vị/giây so với tốc chạy ~6.5 [ƯỚC LƯỢNG].
  const moveFrac = v => v == null ? 0 : Math.abs(v) > 3 ? v / 100 : v / 6.5;
  const tilesRadius = u => { const m = u.match(/([\d.]+)[- ]tiles? radius/i); return m ? parseFloat(m[1]) * 16 : 0; };

  function build(id, w) {
    const u = firstPart(w.usage);
    const col = colorOf(id, w, w.kind === 'staff' ? 'blue' : w.kind === 'laser' ? 'blue' : 'yellow');
    const d = {
      name: w.name, kind: w.kind, type: w.type, grade: w.grade || 1, rarity: w.rarity, starter: !!w.starter,
      dmg: w.dmg || 0, cost: w.cost || 0, crit: w.crit || 0, spread: w.spread || 0, rps: w.rps || 2,
      pellets: w.pellets || 1, moveMod: moveFrac(w.moveMod), sprite: w.sprite, color: col, hit: HIT[col],
      repel: 1, r: 2, bulletSpeed: 18
    };
    let n = u.match(/(\d+|two|three|four|five|six|seven|eight|nine|ten)\s+(?:small |tiny |large |big |yellow |laser |penetrating )*(?:bullets|pellets|projectiles|arrows|lasers|laser beams|beams|bolts)\b/i);
    n = n ? (WORDS[n[1].toLowerCase()] || parseInt(n[1], 10)) : 0;
    if (d.pellets === 1 && n > 1 && n <= 12 && /Shotgun|Laser Gun|Handgun|Bow|Crossbow/.test(w.type)) d.pellets = n;
    if (/pierc|penetrat/i.test(u)) d.pierce = 99;
    if (DMG_MAX[id]) d.dmgMax = DMG_MAX[id];
    // Nạp = giữ rồi nhả, sát thương dmg → dmgMax. Chỉ cung, hoặc món wiki ghi dải "a~b"; "charge" của món khác
    // là thời gian hâm nóng / đòn phụ nên bỏ, để giữ nút là bắn liên tục.
    if (w.charge > 0 && (w.kind === 'bow' || d.dmgMax) && w.kind !== 'gun' && w.kind !== 'launcher') d.charge = Math.min(2, w.charge);
    const boom = /explo|blast/i.test(u);
    switch (w.kind) {
      case 'gun':
        // [ƯỚC LƯỢNG] tốc đạn theo loại (đơn vị/giây).
        d.bulletSpeed = { Handgun: 18, Rifle: 20, 'Sniper Rifle': 32, Shotgun: 16 }[w.type] || 15;
        d.repel = w.type === 'Shotgun' || w.type === 'Sniper Rifle' ? 2 : 1;
        d.bullet = w.type === 'Sniper Rifle' && col === 'yellow' ? 'bullet403' : SPR.gun[col];
        if (w.type === 'Shotgun' && d.pellets > 1) d.fan = Math.min(70, Math.max(18, d.pellets * 6, d.spread));
        // Súng bắn đạn nổ (Grenade Pistol/SMG...): tên lửa nhỏ (sprite missile thật), nổ nhỏ nửa sát thương.
        if (boom) { d.boom = tilesRadius(u) || 18; d.boomDmg = Math.max(1, Math.ceil(d.dmg / 2)); d.boomState = 'explode_small'; d.bullet = 'missile'; }
        break;
      case 'staff':
        d.bulletSpeed = 11; d.r = 4; d.repel = 2; d.bullet = SPR.staff[col];
        if (d.pellets > 1) d.fan = Math.min(80, Math.max(20, d.pellets * 8));
        break;
      case 'bow':
        if (w.type === 'Crossbow') { d.bulletSpeed = 26; d.bullet = 'bullet_136'; d.repel = 2; }
        else { d.bulletSpeed = 24; d.bullet = 'bullet_121'; d.charge = d.charge || 1; d.dmgMax = d.dmgMax || d.dmg * 2; } // [ƯỚC LƯỢNG] cung nạp ~1s
        if (d.pellets > 1) d.fan = Math.min(40, d.pellets * 10);
        break;
      case 'laser':
        // "Fires an energy orb/ball/sphere" (railgun, coilgun) bắn cầu năng lượng; còn lại là tia tức thì.
        if (/energy (orb|ball|sphere)|orb projectile|energy ball|green energy/i.test(u)) {
          d.mode = 'orb'; d.bulletSpeed = 14; d.r = 4; d.bullet = SPR.orb[col];
          if (boom) { d.boom = 20; d.boomDmg = Math.max(1, Math.ceil(d.dmg / 2)); d.boomState = 'explode_small'; }
        } else { d.mode = 'beam'; d.bullet = SPR.laser[col]; d.cap = SPR.orb[col]; }
        if (d.pellets > 1) d.fan = /30°/.test(u) ? 30 : Math.min(45, d.pellets * 10);
        break;
      case 'launcher':
        d.bulletSpeed = 10; d.r = 3; d.repel = 3; d.bullet = 'missile'; // [ĐO] prefab missile: speed 10, sprite missile
        d.boom = tilesRadius(u) || 40; d.boomDmg = d.dmg; d.boomState = 'explode_big'; // [ƯỚC LƯỢNG] 2.5 ô khi wiki không ghi
        break;
      case 'melee': {
        d.repel = 4; d.arc = 150; d.hit = 'hit_white_large';
        // Tầm chém = phần lưỡi tính từ chỗ cầm (pivot) + nửa vệt chém. [ƯỚC LƯỢNG]
        const f = window.SK_ATLAS && window.SK_ATLAS.f[w.sprite];
        d.range = f ? Math.max(20, Math.min(44, f[3] - f[5] + 12)) : 26;
        if (d.cost > 0 && /projectile|crescent|wave|sword qi|beam/i.test(u)) { d.wave = SPR.wave[col]; d.pierce = 99; }
        break;
      }
    }
    return d;
  }
  for (const [id, w] of Object.entries(WK.weapons)) if (id !== 'bad_pistol' && w.sprite) DS.weapons[id] = build(id, w);
  if (window.SK_W86) return;

  // Rương: bậc 1 trắng, 2 lục, 3 lam, 4 tím, 5 cam; bậc 6 (đỏ) là vũ khí trùm, không ra rương.
  // [ƯỚC LƯỢNG] tỉ lệ theo tầng: 1-x bậc 1-2 (chủ yếu trắng), 2-x bậc 2-3, 3-x bậc 3-4 hiếm khi 5.
  const POOL_W = { 1: { 1: 0.7, 2: 0.3 }, 2: { 2: 0.6, 3: 0.4 }, 3: { 3: 0.5, 4: 0.44, 5: 0.06 } };
  const chestOk = (id, d) => !d.starter && d.grade >= 1 && d.grade <= 5 && d.dmg > 0 && !/Misc|Throwing/.test(d.type);
  const byGrade = {};
  for (const [id, d] of Object.entries(DS.weapons)) if (chestOk(id, d)) (byGrade[d.grade] = byGrade[d.grade] || []).push(id);
  DS.weaponGrades = byGrade;
  // Trả danh sách ứng viên của MỘT bậc đã bốc theo trọng số; nơi gọi SK.pick() trong đó. source 'shop' nhích lên nửa bậc.
  DS.weaponPool = function (level, source, rand) {
    const r = rand || Math.random;
    const lv = Math.max(1, Math.min(3, (level | 0) || 1));
    const wts = Object.assign({}, POOL_W[lv]);
    if (source === 'shop' || source === 'merchant') { const top = Math.max(...Object.keys(wts).map(Number)); wts[top] = (wts[top] || 0) + 0.3; }
    let tot = 0;
    for (const g in wts) if (byGrade[g]) tot += wts[g];
    let x = r() * tot;
    for (const g in wts) {
      if (!byGrade[g]) continue;
      x -= wts[g];
      if (x <= 0) return byGrade[g].slice();
    }
    return (byGrade[1] || []).slice();
  };
  DS.chestPool = (byGrade[1] || []).concat(byGrade[2] || []);
})();

// Nhân vật lấy từ số wiki (data/sk-wiki.js, sinh bởi tools/build_design.py). Hình dạng thân (tay, hộp
// trúng đòn, bóng) dùng chung của Hiệp Sĩ vì mọi nhân vật SK cùng khổ 16 px.
(function () {
  const WK = window.SK_WIKI, DS = window.SK_DESIGN;
  if (!WK) return;
  const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const VI = {
    knight: 'Hiệp Sĩ', ranger: 'Kẻ Lãng Du', mage: 'Phù Thuỷ', assassin: 'Sát Thủ', alchemist: 'Nhà Giả Kim',
    engineer: 'Kỹ Sư', vampire: 'Ma Cà Rồng', paladin: 'Hiệp Sĩ Thánh', elves: 'Tiên Tộc', werewolf: 'Người Sói',
    priest: 'Nữ Tu', druid: 'Tu Sĩ Rừng', robot: 'Người Máy', viking: 'Chiến Binh Cuồng', necromancer: 'Pháp Sư Tử Linh'
  };
  const base = DS.heroes.knight;
  const kindOk = { gun: 1, staff: 1, melee: 1 };
  // Tay cầm súng = nút img/h1 của prefab c<index> trong hero.ab, đơn vị Unity so với gốc nhân vật [ĐO]: mặc định (0, 0,5),
  // khác mặc định ở 9 nhân vật. Gốc nằm ở s0.pivot (px, y xuống) so với điểm neo khung, nên
  // hand = [pivot.x + 16·h1.x, 16·h1.y − pivot.y] (px, y lên). Hiệp Sĩ: [3,92; 6,8] (bảng tay cũ ghi [3; 6] ước lượng).
  const H1 = { 2: [0, 0.4], 6: [0.1, 0.45], 7: [0, 0.6], 13: [0, 0.3], 22: [0, 0.3], 23: [0, 0.35], 25: [0, 0.35], 26: [0, 0.35], 28: [0, 0.3] };
  // Tay trái (nút img/h2, cầm súng thứ hai khi Song Thủ) [ĐO hero.ab]: TRƯỚC mặt, cùng phía với h1. Mặc định (0,5; 0,6);
  // c00/c24/c27/c28 (0,55; 0,6), c13/c22 (0,55; 0,4), c15 (0; 0,5). Nhân vật không có h2 dùng mặc định [ƯỚC LƯỢNG].
  const H2 = { 0: [0.55, 0.6], 13: [0.55, 0.4], 15: [0, 0.5], 22: [0.55, 0.4], 24: [0.55, 0.6], 27: [0.55, 0.6], 28: [0.55, 0.6] };
  const handOf = (folder, left) => {
    const s0 = window.SK_DATA && SK_DATA.heroes && SK_DATA.heroes[folder] && SK_DATA.heroes[folder].s0;
    if (!s0 || !s0.pivot) return left ? [base.hand[0] + 5, base.hand[1] + 1] : base.hand;
    const h = left ? H2[s0.index] || [0.5, 0.6] : H1[s0.index] || [0, 0.5];
    return [+(s0.pivot[0] + 16 * h[0]).toFixed(2), +(16 * h[1] - s0.pivot[1]).toFixed(2)];
  };
  for (const [folder, h] of Object.entries(WK.heroes)) {
    const sk = (h.skills || [])[0] || { name: 'Dual Wield', cd: 10 };
    const wid = h.weapon && WK.weapons[h.weapon] ? h.weapon : 'bad_pistol';
    if (wid !== 'bad_pistol' && !DS.weapons[wid]) {
      const w = WK.weapons[wid];
      DS.weapons[wid] = { name: w.name, kind: kindOk[w.kind] ? w.kind : 'gun', dmg: w.dmg, cost: w.cost, crit: w.crit,
        spread: w.spread, rps: w.rps, bulletSpeed: 18, pellets: w.pellets || 1, repel: 1, sprite: w.sprite, bullet: 'yellow' };
    }
    DS.heroes[folder] = Object.assign({}, folder === 'knight' ? base : {}, {
      name: VI[folder] || h.name, nameEn: h.name, folder,
      hp: h.hp, armor: h.armor, energy: h.energy, crit: h.crit || 0,
      speed: base.speed, hand: handOf(folder), hand2: handOf(folder, true), hurt: base.hurt, body: base.body, shadow: base.shadow,
      // dur của Song Thủ là số cũ trong bảng tay; kỹ năng khác do js/skills.js tự định.
      skill: { id: slug(sk.name), name: sk.name, cd: sk.cd || 8, dur: folder === 'knight' ? base.skill.dur : 0 },
      skills: h.skills, passive: h.passive, weapon: wid, unlock: h.unlock, upgrades: h.upgrades
    });
  }
  DS.heroes.knight.unlock = { kind: 'free', amount: 0, text: 'Miễn phí' };
})();

// Vũ khí thật 8.6 (data/sk-weapons86.js, sinh bởi tools/weapons86/build_w86.py) đè lên số wiki ở trên.
// Khoá giữ nguyên slug wiki (ak_47, bad_pistol...) cho mã cũ; vũ khí không có trên wiki dùng tên prefab (weapon_109...).
// def.w86 là bản ghi thô (rig, máy trạng thái Animator, đạn); actors.js đọc nó. Trường phẳng (dmg, cost, rps...) cho HUD/cửa hàng.
(function () {
  const X = window.SK_W86, DS = window.SK_DESIGN;
  if (!X) return;
  // [ĐO] item_level 0..5 -> màu độ hiếm trắng, lục, lam, tím, cam, đỏ (bậc 1..6 như wiki)
  const RARITY = ['White', 'Green', 'Blue', 'Purple', 'Orange', 'Red'];
  const idOf = { weapon_000: 'bad_pistol' };
  for (const [slug, pf] of Object.entries(X.wiki)) if (!idOf[pf]) idOf[pf] = slug;
  const id = pf => idOf[pf] || pf;
  DS.weaponId = id;
  function kindOf(e) {
    if (e.fam === 'bow') return 'bow';
    if (e.melee || /^(sword|spear|hammer)$/.test(e.fam)) return 'melee';
    if (e.fam === 'laser') return 'laser';
    if (e.fam === 'throw') return 'throw';
    if (/^Gun01[02]|Staff/.test(e.cls) || e.fam === 'orbit') return 'staff';
    const b = X.bullets[(e.b[0] || {}).p];
    if (b && b.m && b.m.ExplodeEffectTrigger) return 'launcher';
    return 'gun';
  }
  function spriteOf(e) {
    const w = e.rig.find(n => n.n === 'w' && n.f) || e.rig.find(n => n.f && n.n !== 'gun_point');
    return w ? w.f : null;
  }
  // Tốc bắn khi giữ nút [ĐO mô phỏng Animator ở tools/weapons86]: sự kiện Attack mỗi giây × weapon_speed.
  function rpsOf(e) {
    const f = e.fire || {};
    if (f.period) return +(e.ws / f.period).toFixed(3);
    const cyc = e.SM && e.SM.st.find(s => s.ev.length && s.len > 0);
    return cyc ? +(e.ws * cyc.ev.length / cyc.len).toFixed(3) : 1;
  }
  // Súng không có bulletsInfo (đấm tay Khí Công Sư, logic trong mã): cận chiến kiểu cũ, sát thương cận chiến của hero [ƯỚC LƯỢNG]
  // Súng tầm xa mà prefab đạn nằm trong mã (Cầu Vồng, Gậy Nữ Thần...): viên đạn chung bullet_0 với số đo bulletsInfo [ƯỚC LƯỢNG hình đạn].
  function noBulletDef(pf, e) {
    const wk = window.SK_WIKI && Object.values(SK_WIKI.weapons).find(w => w.name === e.n.en);
    const base = { name: e.n.vi || e.n.en, nameEn: e.n.en, prefab: pf, grade: (e.grade | 0) + 1, rarity: RARITY[e.grade | 0] || 'White',
      cost: e.cost || 0, rps: (wk && wk.rps) || 2.5, moveMod: e.move || 0, sprite: spriteOf(e) };
    const bs = e.b.find(b => b.spd > 0);
    if (bs && !e.melee) return Object.assign(base, { kind: 'gun', dmg: bs.dmg || (wk && wk.dmg) || 2, crit: bs.crit || 0, spread: e.dev || 0,
      bulletSpeed: bs.spd, repel: bs.repel || 1, pellets: e.x.multiCount || 1, fan: e.x.angle || 0 });
    return Object.assign(base, { kind: 'melee', dmg: (wk && wk.dmg) || 4, crit: 0, spread: 0, range: 26, arc: 150, repel: 3 });
  }
  const REAL_EV = { weapon_374: { st: { 1: [[0.25, 'Attack']], 3: [[0.1944, 'Attack']] }, period: 0.5833 } };
  const CUSTOM_CLS =/^(StaffOfNecromancy|GunPhantom|GunDeadNote|GunLottery|PrequelStaff|GunBlackHoleMissile|GunDarkBook)$/;
  function def(pf) {
    const e = X.weapons[pf], b0 = e.b.find(b => b.p) || {};
    // Lớp tự viết (actors.js CUSTOM_FIRE: gọi lính, sổ tử thần...) giữ bản ghi 8.6 dù bulletsInfo trống.
    if (!b0.p && !CUSTOM_CLS.test(e.cls)) return noBulletDef(pf, e);
    // clip + máy trạng thái lưu chung ở X.clips / X.sms (nhiều súng cùng controller)
    if (!e.SM) { e.SM = e.sm != null ? X.sms[e.sm] : null; e.CL = (e.cl || []).map(i => X.clips[i]); }
    // Sự kiện Attack thật mà build_w86 đã đè bằng sự kiện giả 0,001 s (mô phỏng chuyền trạng thái tức thì nên tưởng clip rỗng)
    // [ĐO weapon.ab: w_staff_normal_atk Attack 0,25 s, w_staff_normal_atk2 Attack 0,1944 s, mỗi clip 0,5833 s].
    const fix = REAL_EV[pf];
    if (fix && e.SM && !e._evFixed) {
      e._evFixed = true;
      e.SM = Object.assign({}, e.SM, { st: e.SM.st.map((s, i) => fix.st[i] ? Object.assign({}, s, { ev: fix.st[i] }) : s) });
      e.fire = Object.assign({}, e.fire, { period: fix.period });
    }
    const charge = e.x.max_time || e.x.maxTime || e.x.maxChargeTime || 0;
    return {
      name: e.n.vi || e.n.en, nameEn: e.n.en, prefab: pf, w86: e, kind: kindOf(e), fam: e.fam, cls: e.cls,
      grade: (e.grade | 0) + 1, rarity: RARITY[e.grade | 0] || 'White', type: e.type,
      dmg: b0.dmg || Math.max(0, ...e.b.map(b => b.dmg || 0)), cost: e.cost || 0, crit: b0.crit || 0, spread: e.dev || 0, rps: rpsOf(e),
      pellets: e.x.multiCount || 1, moveMod: e.move || 0, sprite: spriteOf(e),
      bullet: b0.p || null, bulletSpeed: b0.spd || Math.max(0, ...e.b.map(b => b.spd || 0)), repel: b0.repel || 0,
      charge: (e.fam === 'bow' || e.fam === 'charge') ? (charge || 1) : 0
    };
  }
  const want = new Set([...Object.values(X.wiki), ...Object.values(X.heroes), ...Object.values(X.pools).flat()]);
  for (const pf of want) if (X.weapons[pf]) DS.weapons[id(pf)] = def(pf);
  for (const w of Object.keys(DS.weapons)) if (!DS.weapons[w].prefab && w !== '_claw') delete DS.weapons[w]; // không có trong 8.6
  for (const [folder, pf] of Object.entries(X.heroes)) {
    const h = DS.heroes[folder];
    if (!h || !X.weapons[pf]) continue;
    h.weapon = id(pf);
    DS.weapons[h.weapon].starter = true;
  }
  // [ĐO luban pseudorandom_tbweapongroup] rương theo chương: WG_level1..3, trọng số từng món (8.6: đều 10).
  const pools = {};
  for (const [lv, list] of Object.entries(X.pools)) {
    const wt = X.weights[lv] || {};
    pools[lv] = [];
    for (const pf of list) for (let i = 0; i < Math.max(1, Math.round((wt[pf] || 10) / 10)); i++) pools[lv].push(id(pf));
  }
  DS.weaponPools = pools;
  // Trả danh sách ứng viên (nơi gọi SK.pick). Lái buôn không có bảng riêng trong 8.6 đã giải: dùng bể của chương [ƯỚC LƯỢNG].
  DS.weaponPool = function (level) {
    const lv = String(Math.max(1, Math.min(3, (level | 0) || 1)));
    return (pools[lv] || pools['1'] || []).slice();
  };
  DS.chestPool = (pools['1'] || []).slice();
  DS.weaponGrades = {};
  for (const [k, d] of Object.entries(DS.weapons)) (DS.weaponGrades[d.grade] = DS.weaponGrades[d.grade] || []).push(k);
})();
