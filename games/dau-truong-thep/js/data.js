// Every tunable of the game lives here as a table. Units: metres, seconds, hit points.
// The simulation (sim.js) reads these rows; nothing in this file touches three.js.

export const TICK = 1 / 30;

export const TEAMS = [
  { id: 0, name: 'Lam', color: 0x35b8ff, css: '#35b8ff' },
  { id: 1, name: 'Hỏa', color: 0xff5a36, css: '#ff5a36' },
];

// Mechs per side. A match is 1v1, 2v2 or 3v3; bots fill each side to the chosen size.
export const TEAM_SIZES = [1, 2, 3];
export const TEAM_SIZE = 3;
export const cleanSize = (n) => (TEAM_SIZES.includes(n) ? n : TEAM_SIZE);

export const RULES = {
  target: 25, duration: 300, respawn: 5, spawnGuard: 2.5,
  baseRadius: 6.5, baseRegen: 0.12, baseBurn: 420,
  regenDelay: 7, regen: 0.025,
  moveRadius: 0.72, assistWindow: 7, revealOnFire: 1.2, bushSight: 3.4,
  healItem: { cd: 24, frac: 0.32, dur: 2.2 },
  // A healer's own zone and drone heal its owner at this fraction: strong on allies, weak on self (Addendum 13). armorCap: total damage reduction never passes it.
  selfHealMul: 0.3, armorCap: 0.6,
  // Wounded: a single hit of at least `frac` of the victim's max hp halves the healing it receives for `dur` seconds, so a burst hit is not healed through.
  wound: { frac: 0.12, dur: 3, mul: 0.5 },
  lava: { dps: 380 }, ice: { grip: 2.2 }, mud: { slow: 0.4 }, vent: { period: 6, warn: 1.3, dmg: 520 },
  crate: { first: 12, every: [15, 22], fall: 3.2, max: 3, life: 40, radius: 1.5 },
  // Airdrops per team size: the 5v5 row above is `crate`; fewer mechs a side get fewer, slower drops so a crate stays worth a detour.
  crateBySize: { 1: { every: [30, 42], max: 1 }, 2: { every: [24, 34], max: 2 }, 3: { every: [20, 28], max: 2 } },
};

// Airdrop pickups. `w` is the draw weight.
export const PICKUPS = {
  heal:    { name: 'Hồi máu',      w: 3, color: 0x54e36b, heal: 0.45 },
  power:   { name: 'Tăng sát thương', w: 2, color: 0xff7a3d, dmgUp: 1.35, dur: 12 },
  haste:   { name: 'Tăng tốc',     w: 2, color: 0x5fe0ff, haste: 1.3, dur: 12 },
  refresh: { name: 'Hồi chiêu',    w: 2, color: 0xc48bff, refresh: true },
  shield:  { name: 'Khiên năng lượng', w: 2, color: 0xffd94a, shield: 800, dur: 15 },
};

// Skill effects are rows interpreted by the registry in sim.js (CAST). `do` picks the primitive.
// Slots: weapon (left mouse), skills[0] = Q, skills[1] = E, skills[2] = SPACE (ultimate).
// Tào Tháo's R (Dục Huyết Kiêu Hùng): one row object, also cast free by his passive on a kill (mods.onKill.cast) and by his ult (tthHold.also).
const TT_R = { id: 'duchuyet', look: 'ccAura', name: 'Dục Huyết Kiêu Hùng', cd: 13, do: 'zone', at: 'self', follow: true, radius: 4.5, dur: 5, dps: 150, tthHeal: 0.02, vis: 'ccAura',
  self: { on: 'cast', haste: 1.5, dur: 5 }, icon: 'rage',
  desc: 'Vòng huyết khí 4,5 m bám quanh bạn 5 giây: mỗi 0,5 giây chém mọi kẻ địch trong vòng 75 sát thương, mỗi kẻ trúng hồi cho bạn 2% máu tối đa. Bạn chạy nhanh hơn 50% trong 5 giây.' };
export const MECHS = {
  // Optimus Prime: ported from the owner's earlier game (clip BV1Kp4y1b7i6 p45 "42.擎天", tooltips read at 0.5-4 s; AUDIT-c.md). The owner
  // turned Trâu Sắt into Optimus Prime (2026-11-18); the old starter kit is the test fixture 'dummy' (tools/k11-cases.mjs), the plain
  // target of the generic tests. Attack = one Ly Tử Pháo shot (150), as lubo and moclan: Thẩm Phán Chi Kiếm 188% -> 282, Hãn Vệ Tự Do
  // 146% -> 219 and the charge 196% -> 294, the Knight's arrival 337% -> 506, its sword 100% -> 150 true (pen 1: armour ignored).
  // Cooldowns 8 / 6 / 25 s in the clip -> 10 / 8 / 45, the ult's starting when the Knight ends (cdAfter). Rage numbers the tooltip
  // does not give: full rage = fire rate +30%, speed +15%, 20% less damage; it cools 10 a second 2 s after the last gain.
  // "Energy attack -50%" of the arrival is weaken 0.5 (our game has one kind of damage). G5 (sim.js "kit-remake G5 trau"): the
  // rage passive with its current-hp blow, the sword field's guards (linger opGuard), the charge to the sword (beam opCharge).
  trau: {
    name: 'Optimus Prime', role: 'Trụ', roleKey: 'tank', price: 0, tint: 0x3c64c0,
    blurb: 'Càng đánh càng nộ: bắn nhanh, chạy nhanh, chịu đòn giỏi hơn. Ném Kiếm Thẩm Phán cắm xuống che chở đồng đội, chém một nhát rồi lao tới thanh kiếm, hoá Thẩm Phán Kỵ Sĩ vung kiếm chém xuyên giáp.',
    hp: 2850, speed: 5.1, radius: 0.96,
    armor: 0.13, accel: 0.7, turn: 7, towerMul: 0.5,
    passive: { do: 'rage', name: 'Nộ Khí', max: 200, decay: 10, idle: 2, gain: { weapon: 5, hurt: 5, skill: 25 }, full: { rapid: 0.3, haste: 0.15, guard: 0.2 }, curHp: 0.1, icd: 6,
      desc: 'Nộ khí tối đa 200: đòn thường trúng địch hay bị địch đánh trúng +5, mỗi kẻ địch một chiêu đánh trúng +25; 2 giây không thêm thì nguội 10 mỗi giây. Đầy nộ khí thì bắn nhanh hơn 30%, chạy nhanh hơn 15%, chịu ít hơn 20% sát thương (ít nộ khí thì ít hơn). Đòn thường trúng còn gây thêm sát thương chuẩn bằng 10% máu hiện có của mục tiêu, mỗi mục tiêu một lần mỗi 6 giây.' },
    weapon: { name: 'Ly Tử Pháo', cd: 0.55, dmg: 150, speed: 30, range: 12, r: 0.3, vis: 'slug' },
    skills: [
      { id: 'thamphan', look: 'opSword', name: 'Thẩm Phán Chi Kiếm', cd: 10, do: 'barrage', n: 1, cast: 12, radius: 0, blast: 3, delay: 0.3, span: 0, dmg: 282,
        linger: { radius: 3, dur: 3, slow: 0.5, vis: 'opSword', opGuard: { own: 0.5, ally: 0.25 } }, icon: 'swords',
        desc: 'Ném Kiếm Thẩm Phán cắm xuống chỗ con trỏ (xa nhất 12 m): kẻ địch trong 3 m chịu 282 sát thương. Kiếm đứng đó 3 giây: trong vòng kiếm bạn chịu ít hơn 50% sát thương, đồng đội ít hơn 25%, kẻ địch bị chậm 50%.' },
      { id: 'hanve', look: 'opCharge', name: 'Hãn Vệ Tự Do', cd: 8, do: 'beam', windup: 0, range: 7, width: 3, dmg: 219, fx: { slow: 0.5, slowDur: 2 },
        opCharge: { speed: 30, dmg: 294, fx: { air: 1 } }, icon: 'dash',
        desc: 'Chém một nhát hình chữ nhật trước mặt (dài 7 m, rộng 3 m): 219 sát thương, làm chậm 50% trong 2 giây. Nhát chém chạm Kiếm Thẩm Phán thì bạn lao thẳng tới thanh kiếm, xuyên qua cả vật cản và không bị khống chế: kẻ địch trên đường chịu 294 sát thương và bị đánh tung 1 giây.' },
      { id: 'kysi', look: 'opKnight', name: 'Thẩm Phán Kỵ Sĩ', cd: 45, do: 'transform', dur: 8, haste: 1.25, rapid: 1.25, cdAfter: true,
        nova: { windup: 0.2, radius: 5, dmg: 506, fx: { slow: 0.5, slowDur: 3, weaken: { mul: 0.5, dur: 3 } } },
        weapon: { name: 'Kiếm Thẩm Phán', cd: 0.5, dmg: 150, speed: 26, range: 5, r: 1.0, pierce: true, pen: 1, vis: 'wave' }, icon: 'rage',
        desc: 'Hoá Thẩm Phán Kỵ Sĩ 8 giây: lúc biến hình kẻ địch trong 5 m chịu tới 506 sát thương (càng gần càng đau), bị chậm 50% và giảm 50% sát thương trong 3 giây. Kỵ Sĩ vung Kiếm Thẩm Phán thay pháo: mỗi nhát chém quạt trước mặt 150 sát thương xuyên giáp; bắn và chạy nhanh hơn 25%. Hồi chiêu chỉ bắt đầu khi hết biến hình.' },
    ],
  },
  soi: {
    name: 'Sói Lửa', role: 'Xung kích', roleKey: 'assault', price: 0, tint: 0xd9843a,
    blurb: 'Hai nòng liên thanh, cơ động. Áp sát, xả đạn rồi rút.',
    hp: 2450, speed: 6.5, radius: 0.8,
    armor: 0.05, accel: 1.2, turn: 14, towerMul: 1.0,
    passive: { do: 'frenzy', name: 'Máu Nóng', desc: 'Hạ gục hoặc trợ công thì chạy nhanh hơn 25% trong 3 giây.', haste: 1.25, dur: 3 },
    weapon: { name: 'Liên Thanh Đôi', cd: 0.16, dmg: 63, speed: 34, range: 13.5, spread: 0.05, r: 0.2, vis: 'bullet', alt: 0.42 },
    skills: [
      { id: 'rocket', look: 'wfRockets', name: 'Rocket Chùm', cd: 8, do: 'volley', n: 3, fan: 0.22, dmg: 190, speed: 24, range: 15, splash: 2.4, r: 0.3, vis: 'rocket', icon: 'rocket',
        desc: 'Phóng ba quả rocket toả hình quạt, nổ lan khi chạm.' },
      { id: 'tangap', look: 'wfHowl', name: 'Tăng Áp', cd: 14, do: 'buff', haste: 1.45, rapid: 1.35, dur: 4, icon: 'boost',
        desc: 'Trong 4 giây chạy nhanh hơn 45% và bắn nhanh hơn 35%.' },
      { id: 'muahoa', look: 'wfRain', name: 'Mưa Hỏa Tiễn', cd: 42, do: 'barrage', n: 9, radius: 5.5, blast: 2.6, dmg: 230, delay: 0.9, span: 1.8, cast: 16, icon: 'barrage',
        desc: 'Gọi chín quả hỏa tiễn dội xuống vùng con trỏ. Vòng đỏ báo trước chỗ rơi.' },
    ],
  },
  // Ưng Nhãn (鹰痕 "Hawk Mark"): ported from the owner's earlier game (clip BV1Kp4y1b7i6 p92 "89.鹰痕", tooltips in ~/handoff/dtt-ref/kits/AUDIT-c.md).
  // The original is a fast magazine gun, not a slow rail: attack = one shot of 150 (was 390 every 1.5 s), 0.45 s apart, 6 to a
  // magazine, 1.2 s to reload (about the old 260 dps over a magazine). Cooldowns 8 / 6 / 25 s in the clip -> 11 / 8 / 45. MP dropped.
  // Passive: 4 hits inside 2 s give a 2 s Aim state (shots do up to +50% to a mech carrying a shield, by its share of max hp);
  // the lower her hp, the more damage and lifesteal on shots, up to +50% (G4 lowHpScale; lowSteal). Q ?寒凝视: an eye over the
  // cursor 3 s, reveals inside, and her shots do +25% to what it saw (a tag the weapon's vsTag reads). E 瞬袭鹰影: a short dash,
  // the magazine full at once, the next 5 shots +100% fire rate, 50% lifesteal, 30% chance to stun 0.5 s. Ult 裂风隼 157% -> 236,
  // slow 60% decaying over 4 s, a 4 s mark: each of her shots on it bursts round it for 75% -> 113, +25% -> 38 per burst, 4 bursts.
  // Kit-remake G5 fields (sim.js block "kit-remake G5 Ưng Nhãn"): passive do 'hawk' {aim, lowSteal}, zone eye, blink reload, volley falcon.
  ung: {
    name: 'Ưng Nhãn', role: 'Bắn tỉa', roleKey: 'sniper', price: 0, tint: 0x7c6bd6,
    blurb: 'Súng băng đạn bắn nhanh, máu mỏng. Mắt ưng soi chỗ địch nấp, lướt đi nạp đầy đạn, rồi phóng chim ưng đánh dấu để mỗi phát bắn nổ lan.',
    hp: 1700, speed: 6.0, radius: 0.76,
    armor: 0, accel: 1.0, turn: 9, towerMul: 0.7,
    passive: { do: 'hawk', name: 'Miểu Chuẩn', look: 'hwAim', desc: 'Bắn trúng 4 lần trong 2 giây thì vào thế Ngắm 2 giây: đạn gây thêm tới 50% lên kẻ đang có khiên (theo độ dày khiên). Càng ít máu, sát thương và hút máu của đạn càng cao, tối đa thêm 50%.',
      aim: { hits: 4, win: 2, dur: 2, vsShield: 1 }, lowSteal: 0.5, mods: { lowHpScale: 0.5 } },
    weapon: { name: 'Súng Ưng', cd: 0.45, dmg: 150, speed: 60, range: 18, r: 0.2, mag: { n: 6, reload: 1.2 }, vsTag: { key: 'eye', mul: 1.25 }, vis: 'rail' },
    skills: [
      { id: 'hanngung', look: 'hwEye', name: 'Hàn Ngưng Thị', cd: 11, do: 'zone', at: 'target', cast: 18, radius: 5, dur: 3, eye: { key: 'eye', dur: 3 }, vis: 'hwEye', icon: 'mark',
        desc: 'Thả mắt ưng soi vùng 5 m ở con trỏ (xa nhất 18 m) trong 3 giây: kẻ địch trong đó bị lộ diện (cả trong bụi), và trong 3 giây đạn của bạn gây thêm 25% lên chúng.' },
      { id: 'thuantap', look: 'hwDash', name: 'Thuấn Tập Ưng Ảnh', cd: 8, do: 'blink', dist: 4, speed: 30, stealth: 0, reload: true,
        self: { on: 'cast', dur: 3, rapid: 2, shots: 5, shotsFor: 3, patch: { steal: 0.5, fx: { chance: 0.3, stun: 0.5 } } }, icon: 'blink',
        desc: 'Lướt nhanh 4 m theo hướng đang đi (hoặc lùi lại) và nạp đầy băng đạn ngay. 5 phát kế tiếp (trong 3 giây) bắn nhanh gấp đôi, hút 50% máu, mỗi phát 30% làm choáng 0,5 giây.' },
      { id: 'liepphong', look: 'hwFalcon', name: 'Liệt Phong Chuẩn', cd: 45, do: 'volley', n: 1, dmg: 236, speed: 40, range: 22, r: 0.4, vis: 'hwFalcon',
        fx: { slow: 0.6, slowDur: 4, slowDecay: true, tag: { key: 'falcon', dur: 4 } }, falcon: { key: 'falcon', radius: 2.5, dmg: 113, grow: 38, n: 4 }, icon: 'pierce',
        desc: 'Phóng chim ưng: kẻ đầu tiên trúng chịu 236 sát thương, chậm 60% giảm dần trong 4 giây và bị đánh dấu 4 giây. Mỗi phát đạn của bạn trúng nó nổ lan 2,5 m quanh nó 113 sát thương, mỗi lần nổ mạnh thêm 38, tối đa 4 lần.' },
    ],
  },
  hac: {
    name: 'Bạch Hạc', role: 'Hỗ trợ', roleKey: 'support', price: 0, tint: 0x59c9a5,
    blurb: 'Hồi máu, làm chậm và dựng vòm chắn đạn cho cả đội.',
    hp: 1750, speed: 7.0, radius: 0.8,
    armor: 0.05, accel: 1.1, turn: 14, towerMul: 0.8,
    passive: { do: 'aura', name: 'Hào Quang', desc: 'Đồng đội trong 6 m hồi 60 máu mỗi giây.', radius: 6, hps: 60 },
    weapon: { name: 'Xung Quang', cd: 0.32, dmg: 115, speed: 30, range: 14, r: 0.26, vis: 'pulse' },
    skills: [
      { id: 'hoiphuc', look: 'hcSpring', name: 'Suối Hồi Phục', cd: 13, do: 'zone', at: 'self', radius: 5, dur: 4.5, hps: 230, vis: 'heal', icon: 'heal',
        desc: 'Tạo vùng hồi 230 máu mỗi giây cho đồng đội đứng trong, kéo dài 4,5 giây.' },
      { id: 'truongcham', look: 'hcSlow', name: 'Trường Trì Trệ', cd: 12, do: 'zone', at: 'target', cast: 13, radius: 4.5, dur: 4, dps: 45, slow: 0.45, vis: 'slow', icon: 'slow',
        desc: 'Ném một trường năng lượng tới con trỏ: địch bên trong bị chậm 45% và mất máu dần.' },
      { id: 'vom', look: 'hcDome', name: 'Vòm Bảo Hộ', cd: 48, do: 'dome', radius: 6, dur: 5.5, shield: 600, heal: 450, icon: 'dome',
        desc: 'Dựng vòm chặn mọi đạn địch bay vào trong 5,5 giây, đồng đội trong vòm được hồi máu và nhận khiên.' },
    ],
  },
  // Lôi Công = Thor (银色闪电(雷神) Lôi Thần): ported from the owner's earlier game (clip BV1Kp4y1b7i6 p28 "25.雷神", tooltips in
  // ~/handoff/dtt-ref/kits/AUDIT-b.md). The clip plays a mage of chained lightning, so the 340 mortar became a 150 lightning bolt (about
  // the same dps): Lôi Bạo Đả Kích 229% -> 344, Thiểm Điện Đạn Xạ 193% -> 290 (each bounce x0.75), Lôi Thần Chi Chùy 255% -> 383 and its
  // field 85%/s -> 128. Every skill hit adds 3% of the victim's max hp (the passive). Cooldowns 8 / 6 (2 uses, 3 s apart) / 25 s -> 10 / 8 / 45.
  // Kit-remake G5 field (sim.js block "kit lane k16"): volley torZone (where the hammer bursts it leaves a field).
  loi: {
    name: 'Lôi Công', role: 'Pháo kích', roleKey: 'artillery', price: 900, tint: 0x9aa03a,
    blurb: 'Lôi Thần ném sét: mỗi chiêu trúng in một Điện Hà Ấn Ký, đủ ba ấn thì choáng. Gọi sét giáng, phóng cầu điện nảy giữa kẻ địch, ném Lôi Thần Chi Chùy để lại vùng lôi điện.',
    hp: 2300, speed: 5.8, radius: 0.84,
    armor: 0.05, accel: 0.8, turn: 8, towerMul: 1.6,
    passive: { do: 'stacks', name: 'Điện Hà Ấn Ký', look: 'torMark', n: 3, dur: 5, on: 'skill', icd: 3, fx: { stun: 1.5 },
      desc: 'Mỗi lần chiêu trúng mục tiêu gây thêm 3% máu tối đa của nó và in 1 Điện Hà Ấn Ký; đủ 3 ấn thì mục tiêu bị choáng 1,5 giây. Mục tiêu vừa bị choáng không nhận ấn này trong 3 giây.' },
    weapon: { name: 'Lôi Tiễn', cd: 0.65, dmg: 150, speed: 30, range: 13, r: 0.3, vis: 'pulse' },
    skills: [
      { id: 'loibao', look: 'torStrike', name: 'Lôi Bạo Đả Kích', cd: 10, do: 'barrage', n: 1, radius: 0, blast: 2.5, dmg: 344, delay: 0.5, span: 0, cast: 14, fx: { stun: 1, maxHp: 0.03 }, icon: 'storm',
        desc: 'Trễ ngắn rồi gọi sét giáng xuống con trỏ (xa nhất 14 m): 344 sát thương lên kẻ địch trong 2,5 m, choáng 1 giây.' },
      { id: 'thiemdien', look: 'torBall', name: 'Thiểm Điện Đạn Xạ', cd: 8, do: 'volley', n: 1, dmg: 290, speed: 24, range: 13, r: 0.45, vis: 'pulse', uses: { n: 2, gap: 3 },
        fx: { maxHp: 0.03, chain: { n: 4, r: 6, mul: 0.75, seq: { falloff: 0.75 } } }, icon: 'rocket',
        desc: 'Phóng cầu điện 290 sát thương; trúng rồi thì nảy sang kẻ địch gần nhất trong 6 m, tối đa 4 lần, mỗi lần nảy giảm 25%. Tích được 2 lần, cách nhau 3 giây.' },
      { id: 'loichuy', look: 'torHammer', name: 'Lôi Thần Chi Chùy', cd: 45, do: 'volley', n: 1, dmg: 383, speed: 22, range: 15, r: 0.6, vis: 'rocket', fx: { maxHp: 0.03 },
        torZone: { radius: 3, dur: 4, dps: 128, slow: 0.5, vis: 'torHammer' }, icon: 'storm',
        desc: 'Ném Lôi Thần Chi Chùy: kẻ trúng trực tiếp chịu 383 sát thương; chỗ búa nổ thành vùng lôi điện 3 m trong 4 giây, kẻ địch trong đó mất 128 máu mỗi giây và chậm 50%.' },
    ],
  },
  // Bọ Cạp: ported from the owner's earlier game (clip BV1Kp4y1b7i6 p52 "49.毒蝎女王" Độc Hạt Nữ Vương, tooltips in
  // ~/handoff/dtt-ref/kits/AUDIT-a.md). Attack = one Độc Châm sting (150; was 5 x 64 pellets): Tử Vong Thôn Phệ 58% -> 87 a puff,
  // Độc Tố Bạo Phát 237% -> 356, its detonation 100% -> 150 (+50% per 3 stacks). Poison 10% x attack a second per stack -> burn
  // 8 dps a stack, 5 s, 10 stacks (our burn adds N x dps; the clip's +25% per stack is close enough at 5-6 stacks). Cooldowns
  // 8 / 6 / 15 s (2 uses 5 s apart) in the clip -> 10 / 8 / 30. Kit-remake G5 fields (sim.js block "kit-remake G5 Bọ Cạp"): passive
  // bcSteal (heals that share of the poison she deals), hitfx bcPop (sets off her poison on the target).
  bocap: {
    name: 'Bọ Cạp', role: 'Thọc sườn', roleKey: 'flanker', price: 900, tint: 0x6a5acd,
    blurb: 'Nữ hoàng bọ cạp độc: mỗi đòn trúng gieo một tầng độc và hút máu từ độc. Phun độc hình quạt, lên đạn xuyên bắn dồn dập, rồi kích nổ toàn bộ độc trên kẻ địch quanh mình.',
    hp: 2350, speed: 7.3, radius: 0.76,
    armor: 0, accel: 1.5, turn: 16, towerMul: 1.0,
    passive: { do: 'trait', name: 'Tử Vong Thôn Phệ', bcSteal: 0.5,
      desc: 'Đòn thường và chiêu trúng địch gieo một tầng độc: mỗi tầng 8 sát thương mỗi giây trong 5 giây, tối đa 10 tầng. Bạn hồi máu bằng 50% sát thương độc gây ra.' },
    weapon: { name: 'Độc Châm', cd: 0.5, dmg: 150, speed: 30, range: 9, r: 0.22, vis: 'dart', fx: { burn: { dps: 8, dur: 5, max: 10 } } },
    skills: [
      { id: 'thonphe', look: 'bcSpray', name: 'Tử Vong Thôn Phệ', cd: 10, do: 'nova', windup: 0.1, repeat: 5, gap: 0.29, arc: 0.55, move: 0.5, radius: 5.5, dmg: 87,
        fx: { burn: { dps: 8, dur: 5, max: 10 } }, icon: 'spin',
        desc: 'Phun độc liên tục vào hình quạt 5,5 m trước mặt, năm đợt trong 1,5 giây, mỗi đợt 87 sát thương và một tầng độc; vẫn bước được (chậm một nửa).' },
      { id: 'onhiem', look: 'bcVenom', name: 'Trí Mạng Ô Nhiễm', cd: 8, do: 'transform', dur: 3, rapid: 3, haste: 1.5, towerMul: 0.25,
        weapon: { range: 11.25, speed: 37.5, pierce: true }, icon: 'rage',
        desc: '3 giây: đòn thường bay nhanh hơn 25%, xa hơn 25% và xuyên qua mọi kẻ địch; tốc bắn gấp ba, chạy nhanh hơn 50%. Trong lúc đó đòn thường chỉ gây 25% sát thương lên công trình.' },
      { id: 'bocphat', look: 'bcBurst', name: 'Độc Tố Bạo Phát', cd: 30, do: 'nova', windup: 0, radius: 7, dmg: 356, uses: { n: 2, gap: 5 },
        fx: { bcPop: { dmg: 150, per3: 0.5, full: 10, disarm: 2, root: 2 }, burn: { dps: 8, dur: 5, max: 10 }, weaken: { mul: 0.75, dur: 3 } }, icon: 'skull',
        desc: 'Bùng độc 7 m quanh mình: 356 sát thương, một tầng độc, kẻ trúng gây ít hơn 25% sát thương trong 3 giây. Kẻ đang trúng độc bị kích nổ toàn bộ độc: thêm 150, cứ mỗi 3 tầng thêm 50%; đủ 10 tầng thì bị tê liệt 2 giây (không đi, không bắn được). Tích 2 lượt, cách nhau 5 giây.' },
    ],
  },
  // Băng Nha = 冰雪女王 Băng Tuyết Nữ Vương: ported from the owner's earlier game (clip BV1Kp4y1b7i6 p81 "78.冰雪女王", tooltips in
  // ~/handoff/dtt-ref/kits/AUDIT-a.md). Attack = one Gai Băng shot (150; was 78 at 0.36 s with a slow): Băng Sương 237% -> 356,
  // Băng Đống 188% -> 282, Băng Thiên 177% -> 266 a strike (5 strikes). Cooldowns 8 / 6 / 25 s in the clip -> 10 / 8 / 45.
  // The Frost Mark is a G2 tag (key 'frost') that every skill row puts on with a 25% slow and a 0.75 fire-rate slow for 2 s; every skill
  // row's vsTag pays it (x1.5, 25%: frozen 0.5 s, +10% damage taken). Ice armour = passive mods hitCap 0.15 + onHurt by skill (mark the
  // attacker, +50% speed, more armour 1.5 s). Kit-remake G5 fields (sim.js block "kit-remake G5 Băng Nha"): barrage bnRing, bnStop.
  bang: {
    name: 'Băng Nha', role: 'Khống chế', roleKey: 'control', price: 1200, tint: 0x9fd8ff,
    blurb: 'Nữ hoàng băng tuyết: chiêu nào trúng cũng in dấu băng, chiêu sau đánh vào dấu đau gấp rưỡi và có thể đóng băng. Vòng băng đóng băng mép ngoài, hơi thở băng đẩy lùi cả nhóm, bão tuyết giáng năm lần.',
    hp: 2750, speed: 5.8, radius: 0.84,
    armor: 0.15, accel: 0.9, turn: 11, towerMul: 2.2,
    passive: { do: 'trait', name: 'Hàn Băng Ấn Ký', mods: { hitCap: 0.15, onHurt: { by: 'skill', icd: 0.3, self: { dur: 1.5, haste: 1.5, armor: 0.08 }, mark: { key: 'frost', dur: 2 } } },
      desc: 'Chiêu trúng in Dấu Băng 2 giây: chậm 25%, bắn chậm 25%. Chiêu của bạn đánh vào kẻ mang dấu mạnh gấp rưỡi và 25% đóng băng nó 0,5 giây (chịu thêm 10% sát thương). Giáp băng: không đòn nào lấy quá 15% máu tối đa của bạn; trúng chiêu thì kẻ đánh bị in dấu, còn bạn chạy nhanh 50% và cứng hơn trong 1,5 giây.' },
    weapon: { name: 'Gai Băng', cd: 0.6, dmg: 150, speed: 28, range: 13, r: 0.26, vis: 'frost' },
    skills: [
      { id: 'bangsuong', look: 'bnRing', name: 'Băng Sương Chi Hoàn', cd: 10, do: 'barrage', n: 1, cast: 10, radius: 0, blast: 3.2, delay: 0.5, span: 0, dmg: 356,
        fx: { slow: 0.25, slowDur: 2, tag: { key: 'frost', dur: 2 }, slowFire: { mul: 0.75, dur: 2 } }, vsTag: { key: 'frost', mul: 1.5, fx: { chance: 0.25, stun: 0.5, amp: { amp: 0.1, dur: 0.5 } } },
        bnRing: { inner: 0.55, fx: { stun: 1.5, amp: { amp: 0.1, dur: 1.5 } } }, uses: { n: 2, gap: 4 }, icon: 'frost',
        desc: 'Sau 0,5 giây một vòng băng hiện ra ở con trỏ (xa nhất 10 m): 356 sát thương vòng 3,2 m; kẻ đứng ở mép ngoài bị đóng băng 1,5 giây (chịu thêm 10% sát thương). Tích 2 lượt, mỗi lượt cách nhau 4 giây.' },
      { id: 'bangdong', look: 'bnBreath', name: 'Băng Đống Chi Tức', cd: 8, do: 'nova', windup: 0.3, move: 0, arc: 0.6, radius: 5.5, dmg: 282, knock: 2,
        fx: { slow: 0.5, slowDur: 2, slowDecay: true, weaken: { mul: 0.75, dur: 2 }, tag: { key: 'frost', dur: 2 }, slowFire: { mul: 0.75, dur: 2 } }, vsTag: { key: 'frost', mul: 1.5, fx: { chance: 0.25, stun: 0.5, amp: { amp: 0.1, dur: 0.5 } } }, icon: 'frost',
        desc: 'Lấy hơi 0,3 giây rồi thổi hơi băng hình quạt trước mặt (5,5 m): 282 sát thương, đẩy lùi, chậm 50% nhạt dần trong 2 giây, và kẻ trúng gây ít hơn 25% sát thương trong 2 giây.' },
      { id: 'bangthien', look: 'bnBlizzard', name: 'Băng Thiên Tuyết Địa', cd: 45, do: 'barrage', radius: 3.5, blast: 3.5, dmg: 266, delay: 0.3, cast: 14,
        channel: { dur: 3.05, every: 0.6, move: 0 }, bnStop: true, self: { on: 'cast', dur: 3.05, guard: 0.25 }, towerMul: 0.25,
        fx: { slow: 0.25, slowDur: 2, tag: { key: 'frost', dur: 2 }, slowFire: { mul: 0.75, dur: 2 } }, vsTag: { key: 'frost', mul: 1.5, fx: { chance: 0.25, stun: 0.5, amp: { amp: 0.1, dur: 0.5 } } }, icon: 'blizzard',
        desc: 'Đứng gọi bão tuyết xuống vùng con trỏ (xa nhất 14 m) trong 3 giây: năm đợt băng giáng xuống, mỗi đợt 266 sát thương vòng 3,5 m. Trong lúc gọi bão chịu ít hơn 25% sát thương; bấm lại để dừng. Sát thương lên công trình giảm 75%.' },
    ],
  },
  // Iron Man: ported from the owner's earlier game (clip BV1Kp4y1b7i6 p73 "70.钢铁", tooltips read at 1.5-6 s; AUDIT-c.md). The owner
  // turned Thợ Rèn into Iron Man (2026-11-18); the old engineer kit is the test fixture 'oldtho' (tools/k11-cases.mjs). Attack = one
  // Xung Lực Pháo blast (150), as lubo and moclan: shield burst 236% -> 354, Lạp Tử Năng Lượng 267% -> 400, Phi Đạn Không Tập 75% -> 113
  // a wave, Ngõa Giải Xạ Tuyến 125% -> 188 a 0.2 s pulse (940/s). Cooldowns 6 / 8 / 20 s in the clip -> 8 / 10 / 40. The R / E combo
  // stun is two G2 tags: each row tags its victims for 1 s and the other row's vsTag stuns a tagged one 1 s. "50% less energy damage"
  // while channelling is a 25% cut of every blow (cast guard; our game has no energy / physical split). Red lines: R and the ult do
  // nothing to towers, E half. G5 (sim.js "kit-remake G5 tho"): imTag, imCancel, imShield.
  tho: {
    name: 'Iron Man', role: 'Xung kích', roleKey: 'assault', price: 1200, tint: 0xb8322a,
    blurb: 'Khiên năng lượng tự hồi, vỡ thì nổ. Bắn đạn hạt nổ làm chậm, gọi tên lửa dội xuống một vùng, rồi đứng phóng tia phân rã hút máu.',
    hp: 2300, speed: 5.6, radius: 0.88,
    armor: 0.10, accel: 0.9, turn: 12, towerMul: 1.0,
    passive: { do: 'trait', name: 'Lạp Tử Hộ Thuẫn', mods: { reShield: { frac: 0.3, regrow: 15, burst: { radius: 4, dmg: 354 } } },
      desc: 'Luôn có một lớp khiên năng lượng bằng 30% máu tối đa. Khiên vỡ thì nổ, kẻ địch trong 4 m chịu 354 sát thương; 15 giây sau khiên tự hồi.' },
    weapon: { name: 'Xung Lực Pháo', cd: 0.65, dmg: 150, speed: 34, range: 12.5, r: 0.24, vis: 'pulse' },
    skills: [
      { id: 'laptu', look: 'imParticle', name: 'Lạp Tử Năng Lượng', cd: 8, do: 'volley', n: 1, dmg: 400, speed: 30, range: 14, r: 0.4, splash: 2.5, splashHit: true, towerMul: 0,
        fx: { slow: 0.75, slowDur: 2.5, slowDecay: true, tag: { key: 'imR', dur: 1 } }, vsTag: { key: 'imE', fx: { stun: 1 } }, vis: 'pulse', icon: 'shell',
        desc: 'Bắn một viên đạn hạt theo hướng ngắm (xa 14 m), nổ ở kẻ địch đầu tiên trúng: 400 sát thương, kẻ đứng quanh 2,5 m chịu 240; tất cả bị chậm 75%, nhạt dần trong 2,5 giây. Kẻ đang dính Phi Đạn Không Tập còn bị choáng 1 giây. Không gây sát thương lên trụ.' },
      { id: 'phidan', look: 'imMissiles', name: 'Phi Đạn Không Tập', cd: 10, do: 'barrage', n: 6, cast: 12, radius: 1.75, blast: 3.5, delay: 0.25, span: 3, dmg: 113, towerMul: 0.5,
        fx: { slow: 0.5, slowDur: 1, tag: { key: 'imE', dur: 1 } }, vsTag: { key: 'imR', fx: { stun: 1 }, consume: true }, icon: 'barrage',
        desc: 'Gọi tên lửa dội xuống vùng con trỏ (xa nhất 12 m) trong 3 giây: cứ 0,5 giây kẻ địch trong 3,5 m chịu 113 sát thương và bị chậm 50%. Kẻ vừa trúng Lạp Tử Năng Lượng trong 1 giây trước thì bị choáng 1 giây. Trụ chỉ chịu một nửa.' },
      { id: 'ngoagiai', look: 'imRay', name: 'Ngõa Giải Xạ Tuyến', cd: 40, do: 'sweep', windup: 0.2, dur: 4, range: 16, width: 1.1, dps: 940, turn: 1.4, move: 0, guard: 0.25, steal: 0.25, towerMul: 0,
        imTag: true, imCancel: 1, imShield: true, icon: 'beam',
        desc: 'Đứng yên phóng tia phân rã dài 16 m trong 4 giây, xoay chậm theo hướng ngắm: cứ 0,2 giây kẻ địch trên tia chịu 188 sát thương, bạn hồi 25% lượng gây ra. Lúc bắt đầu khiên Lạp Tử hồi đầy ngay; trong lúc phóng bạn miễn khống chế và chịu ít hơn 25% sát thương. Phóng được 1 giây thì bấm lại để dừng sớm. Không gây sát thương lên trụ.' },
    ],
  },
  thancong: {
    name: 'Thần Công', role: 'Công thành', roleKey: 'siege', price: 1500, tint: 0x7d8a5a,
    blurb: 'Lựu pháo phá trụ. Cắm chốt để bắn rất xa, nhưng tháp xoay chậm: bị áp sát là nguy.',
    hp: 2400, speed: 4.6, radius: 0.92,
    armor: 0.15, accel: 0.7, turn: 3.5, towerMul: 1.0,
    passive: { do: 'trait', name: 'Phá Thành', desc: 'Gây gấp đôi sát thương lên trụ.' },
    weapon: { name: 'Đại Bác', cd: 1.4, dmg: 300, speed: 30, range: 15, splash: 1.8, knock: 1.5, r: 0.34, vis: 'howitzer' },
    skills: [
      { id: 'camchot', look: 'tcAnchor', name: 'Cắm Chốt', cd: 3, do: 'stance', setup: 0.7, range: 1.6, dmg: 1.35, armor: 0.2, turn: 1.6, icon: 'anchor',
        desc: 'Hạ chân chống: đứng yên, tầm bắn xa gấp 1,6, sát thương +35%, giáp +20%, nhưng tháp xoay rất chậm. Bấm lại để nhổ chốt.' },
      { id: 'danxuyen', look: 'tcSabot', name: 'Đạn Xuyên', cd: 12, do: 'volley', n: 1, fan: 0, dmg: 830, speed: 52, range: 26, r: 0.3, pierce: true, vis: 'sabot', icon: 'pierce',
        desc: 'Bắn một viên đạn lõi cứng xuyên qua mọi cỗ máy địch trên đường bay.' },
      { id: 'oanhtac', look: 'tcBombard', name: 'Oanh Tạc', cd: 44, do: 'barrage', n: 8, radius: 6.5, blast: 3, dmg: 400, delay: 1.2, span: 2, cast: 24, icon: 'barrage',
        desc: 'Dội tám quả đạn xuống một vùng xa tới 24 m. Vòng đỏ báo trước chỗ rơi.' },
    ],
  },
  // Mãng Xà = Medusa (美杜莎III): ported from the owner's earlier game (clip BV1Kp4y1b7i6 p42 "39.美杜莎", tooltips in
  // ~/handoff/dtt-ref/kits/AUDIT-b.md). Attack = one Nanh Độc shot (150; was 178 at 0.7 s, now 150 at 0.6 s, same dps; range 480 ->
  // 13 m): Tử Vong Ngưng Thị 187% -> 281, Bí Thuật Dị Xà 151% -> 227 (each next bite +10%), Ma Xà Chi Xúc 100% -> 150 a snake.
  // Cooldowns 10 / 8 / 15 s in the clip -> 12 / 10 / 30. Energy is kept (the ult runs on it): 150 max, +5 a second; every hit steals
  // 5 (the snake's bites 10). The curse mark's "-10% armour pen" -> 0.02 armour off a mark (G3 stacks per.armor), 5 marks petrify
  // 0.5 s. The ult: 3 snakes every 0.25 s for 3 s at 50 energy a second (the cast ends when the energy does), each further bite on
  // the same mech of one press x0.9 (sameDecay). "Immune to energy damage" -> skill damage. Kit-remake G5 field (sim.js block
  // "kit-remake G5 Medusa"): volley mdWard (the ward that every 25 energy spent keeps up 0.5 s longer).
  mangxa: {
    name: 'Medusa', role: 'Khống chế', roleKey: 'control', price: 1500, tint: 0x4f8f6a,
    blurb: 'Nữ yêu rắn: đòn nào trúng cũng hút năng lượng và in trớ chú, đủ năm dấu thì kẻ địch hóa đá. Ánh nhìn hóa đá cả hình quạt, rắn độc nảy từ kẻ này sang kẻ khác mạnh dần, rồi mở khiên miễn sát thương chiêu và xả từng đàn rắn xuyên thấu.',
    hp: 2700, speed: 5.7, radius: 0.88,
    armor: 0.1, accel: 0.9, turn: 10, towerMul: 1.4,
    energy: { max: 150, regen: 5, start: 150 },
    passive: { do: 'stacks', name: 'Tử Vong Ngưng Thị', look: 'mdCurse', n: 5, dur: 3, on: 'any', per: { armor: 0.02 }, fx: { petrify: 0.5 },
      desc: 'Đòn thường và chiêu trúng địch hút 5 năng lượng của nó và in một dấu trớ chú 3 giây: mỗi dấu giảm giáp của nó; đủ 5 dấu thì nó hóa đá 0,5 giây. Năng lượng tối đa 150, hồi 5 mỗi giây.' },
    weapon: { name: 'Nanh Độc', cd: 0.6, dmg: 150, speed: 30, range: 13, r: 0.26, vis: 'pulse', fx: { enSteal: 5 } },
    skills: [
      { id: 'ngungthi', look: 'mdGaze', name: 'Tử Vong Ngưng Thị', cd: 12, do: 'nova', windup: 0.5, move: 0.5, arc: 0.6, radius: 7, dmg: 281, fx: { petrify: 1, enSteal: 5 }, icon: 'skull',
        desc: 'Nhìn chằm chằm vào hình quạt 7 m phía trước: 0,5 giây sau kẻ địch trong đó hóa đá 1 giây và chịu 281 sát thương.' },
      { id: 'dixa', look: 'mdSnake', name: 'Bí Thuật Dị Xà', cd: 10, do: 'volley', n: 1, dmg: 227, speed: 20, range: 13, r: 0.35, vis: 'lance', uses: { n: 2, gap: 3 },
        fx: { enSteal: 5, chain: { n: 4, r: 6, mul: 1.1, seq: { falloff: 1.1 }, fx: { enSteal: 10 } } }, cdCut: { slot: 'self', frac: 0.1, max: 5 }, icon: 'ricochet',
        desc: 'Gọi rắn độc lao theo hướng ngắm: kẻ đầu tiên chạm phải chịu 227, rồi rắn nảy sang kẻ địch gần nhất trong 6 m, tối đa thêm 4 lần, mỗi lần mạnh hơn 10% và hút 10 năng lượng. Mỗi lần rắn cắn, chiêu này giảm 10% hồi chiêu. Tích 2 lượt, cách nhau 3 giây.' },
      { id: 'maxa', look: 'mdSwarm', name: 'Ma Xà Chi Xúc', cd: 30, do: 'volley', n: 3, fan: 0.18, dmg: 150, speed: 24, range: 13, r: 0.3, pierce: true, vis: 'dart', burst: { n: 12, gap: 0.25 }, move: 0.75,
        sameDecay: 0.9, fx: { enSteal: 5 }, en: { cost: 25, drain: 50 }, cdAfter: true, mdWard: { base: 1, per: 25, add: 0.5 }, icon: 'barrage',
        desc: 'Tốn năng lượng (50 mỗi giây): mở khiên phép miễn sát thương chiêu và liên tục phóng ba con rắn xuyên thấu theo hướng ngắm, mỗi con 150, cắn cùng một kẻ thì yếu dần. Khiên còn 1 giây sau khi dừng. Trong lúc đó không bắn thường, chạy chậm 25%. Hồi chiêu tính từ lúc dừng.' },
    ],
  },
  kimquy: {
    name: 'Kim Quy', role: 'Hộ vệ', roleKey: 'guardian', price: 1500, tint: 0xc9a23a,
    blurb: 'Tặng khiên cho một đồng đội, co mai phản đòn, đẩy địch khỏi vùng mình giữ.',
    hp: 2700, speed: 5.0, radius: 0.92,
    armor: 0.2, accel: 0.8, turn: 9, towerMul: 1.0,
    passive: { do: 'ward', name: 'Che Chở', desc: 'Đồng đội trong 5 m nhận ít hơn 15% sát thương.', radius: 5, armor: 0.15 },
    weapon: { name: 'Súng Sóng', cd: 0.6, dmg: 63, n: 3, fan: 0.12, speed: 26, range: 9, knock: 0.8, r: 0.26, vis: 'wave' },
    skills: [
      { id: 'khientang', look: 'kqGift', name: 'Khiên Tặng', cd: 9, do: 'bless', cast: 12, pick: 3.5, shield: 700, dur: 4, icon: 'shield',
        desc: 'Phủ khiên 700 trong 4 giây cho đồng đội ở con trỏ. Không có ai ở đó thì khiên về mình.' },
      { id: 'mairua', look: 'kqShell', name: 'Mai Rùa', cd: 13, do: 'buff', armor: 0.5, reflect: 0.3, dur: 3, icon: 'shell',
        desc: 'Co mai 3 giây: giáp +50% và phản 30% sát thương nhận vào về kẻ bắn.' },
      { id: 'thanhdong', look: 'kqCitadel', name: 'Thành Đồng', cd: 42, do: 'zone', at: 'self', follow: true, radius: 5.5, dur: 5, pull: -9, armor: 0.3, vis: 'bastion', icon: 'dome',
        desc: 'Mở trường lực đi theo mình 5 giây: địch bị đẩy ra ngoài, đồng đội bên trong được +30% giáp.' },
    ],
  },
  hacho: {
    name: 'Hắc Hổ', role: 'Đấu sĩ', roleKey: 'bruiser', price: 1600, tint: 0x3b3f4a,
    blurb: 'Phun lửa sát mặt và hút máu từ sát thương. Vồ qua tường, đánh dấu con mồi rồi kết liễu.',
    hp: 3100, speed: 6.0, radius: 0.88,
    armor: 0.1, accel: 1.1, turn: 12, towerMul: 2.0,
    passive: { do: 'lifesteal', name: 'Hút Máu', desc: 'Hồi máu bằng 18% sát thương gây ra.', frac: 0.18 },
    weapon: { name: 'Phun Lửa', cd: 0.12, dmg: 46, speed: 22, range: 7, spread: 0.14, r: 0.34, pierce: true, vis: 'flame' },
    skills: [
      { id: 'vo', look: 'hhPounce', name: 'Vồ', cd: 9, do: 'leap', cast: 8.5, flight: 0.4, radius: 3.2, dmg: 200, slow: 0.4, slowDur: 1.5, icon: 'leap',
        desc: 'Nhảy tới con trỏ, qua được tường và vật cản. Đáp xuống gây sát thương và làm chậm kẻ địch quanh đó.' },
      { id: 'cuongno', look: 'hhRage', name: 'Cuồng Nộ', cd: 14, do: 'buff', rapid: 1.5, lifesteal: 0.45, dur: 4, cost: 0.08, icon: 'rage',
        desc: 'Trả 8% máu để trong 4 giây bắn nhanh hơn 50% và hút máu 45%.' },
      { id: 'dautu', look: 'hhMark', name: 'Dấu Tử', cd: 36, do: 'mark', cast: 13, pick: 3.5, dur: 5, amp: 0.25, execute: 0.22, haste: 1.3, icon: 'mark',
        desc: 'Đánh dấu kẻ địch ở con trỏ 5 giây: nó nhận thêm 25% sát thương từ mọi người, và bị kết liễu ngay khi máu xuống dưới 22%.' },
    ],
  },
  holy: {
    name: 'Hồ Ly', role: 'Ảo thuật', roleKey: 'trickster', price: 1600, tint: 0xe07a9a, hover: true,
    blurb: 'Thả bản sao đánh lừa địch, dịch chuyển xuyên tường. Máu mỏng, sống bằng mưu.',
    hp: 2600, speed: 7.0, radius: 0.76,
    armor: 0, accel: 1.4, turn: 16, towerMul: 1.4,
    passive: { do: 'trait', name: 'Đệm Khí', desc: 'Bùn không làm chậm và băng không làm trượt.' },
    weapon: { name: 'Phi Tiêu', cd: 0.22, dmg: 84, speed: 36, range: 14, r: 0.18, vis: 'dart' },
    skills: [
      { id: 'phanthan', look: 'hlClone', name: 'Phân Thân', cd: 12, do: 'decoy', n: 1, fan: 0, hp: 500, dur: 6, blast: 3, dmg: 160, stealth: 1.5, icon: 'decoy',
        desc: 'Thả một bản sao chạy theo hướng ngắm 6 giây còn bạn tàng hình 1,5 giây. Bản sao vỡ thì nổ.' },
      { id: 'xuyentuong', look: 'hlBlink', name: 'Xuyên Tường', cd: 10, do: 'warp', dist: 7, icon: 'warp',
        desc: 'Dịch chuyển tức thì tới con trỏ, xa nhất 7 m, qua được tường.' },
      { id: 'vudieu', look: 'hlDance', name: 'Vũ Điệu Ảo Ảnh', cd: 40, do: 'decoy', n: 3, fan: 0.6, hp: 500, dur: 6, blast: 3, dmg: 160, stealth: 3, haste: 1.35, icon: 'mirage',
        desc: 'Ba bản sao tỏa ra hình quạt, bạn tàng hình 3 giây và chạy nhanh hơn 35%.' },
    ],
  },
  // Đom Đóm: ported from the owner's earlier game (clip BV1Kp4y1b7i6 p91 "88.绮翠之心" Khỉ Thúy Chi Tâm, tooltips read at 0-19 s;
  // AUDIT-a.md). The original is a wind controller, not a healer: the owner accepted the role change (Quân y -> Khống chế). Attack =
  // 150 (lubo, moclan): the old heal ray (80 per 0.25 s) became a jade wind dart of 150 per 0.5 s (same dps). 100% -> 150. Cooldowns
  // 8 / 6 (2 uses 3 s apart) / 30 s in the clip -> 10 / 8 / 55. Kit-remake G5 fields (sim.js block "kit lane K13"): passive ddWind
  // (erode: every skill hit adds a Phong Thực stack, x3: slow, weaken and antiheal of per each; song: every press wraps her and the
  // allies within r in the K1 bullet-eating bubble for block s, and gives her +haste speed fading to nothing over fade s), hitfx
  // ddEye (the victim takes lostHp true damage and a short slow every `every` s, n times), nova ddTemple (pulses round her after
  // delay, every `every` s, n times: allies are cleansed, wrapped and healed heal x her max hp; enemies are pulled pull m, take
  // lostHp of their lost hp as true damage, a stacking slow and a stacking fire slow; the first pulse is x first). The ult's -20%
  // bullet speed is not ported (no such stat). Wind spear splash victims take the splash's 60%, as every splash does.
  domdom: {
    name: 'Đom Đóm', role: 'Khống chế', roleKey: 'control', price: 1600, tint: 0xd8e05a, hover: true,
    blurb: 'Gió ngọc bích: chiêu trúng ai cũng bào mòn kẻ đó, mỗi lần ra chiêu gió bọc mình và đồng đội chặn đạn. Mắt gió, giáo gió, thần điện gió kéo địch vào.',
    hp: 1700, speed: 7.4, radius: 0.76,
    armor: 0, accel: 1.2, turn: 14, towerMul: 2.2,
    passive: { do: 'ddWind', name: 'Phong Thực Chi Ủng', erode: { per: 0.1, max: 3, dur: 2 }, song: { r: 6, block: 0.5, haste: 0.5, fade: 2 },
      desc: 'Chiêu trúng địch gây Phong Thực 2 giây: chậm 10%, sát thương giảm 10%, máu được hồi giảm 10%, cộng dồn 3 lần. Mỗi lần ra chiêu, Phong Vãn Chi Ca bọc bạn và đồng đội trong 6 m, chặn mọi đạn địch 0,5 giây; bạn chạy nhanh hơn 50%, giảm dần trong 2 giây.' },
    weapon: { name: 'Phong Tiễn', cd: 0.5, dmg: 150, speed: 30, range: 12, r: 0.24, vis: 'dart', look: 'ddDart' },
    skills: [
      { id: 'phongnhan', look: 'ddEye', name: 'Ai Nga La Tư Chi Nhãn', cd: 10, do: 'barrage', n: 1, cast: 12, radius: 0, blast: 3, delay: 0.5, span: 0, dmg: 150, icon: 'storm',
        fx: { ddEye: { every: 1.5, n: 3, lostHp: 0.05, slow: 0.75, slowDur: 0.25 } },
        desc: 'Mắt gió mở ở con trỏ (xa nhất 12 m): sau 0,5 giây gây 150 sát thương vòng 3 m. Trong 4,5 giây sau, cứ 1,5 giây kẻ trúng mất thêm 5% máu đã mất (sát thương chuẩn) và bị chậm 75% trong 0,25 giây.' },
      { id: 'phongthuong', look: 'ddSpear', name: 'Phong Chi Đầu Thương', cd: 8, uses: { n: 2, gap: 3 }, do: 'volley', n: 1, dmg: 150, speed: 30, range: 13, r: 0.4, splash: 2.2, splashHit: true, vis: 'sabot', icon: 'pierce',
        fx: { lostHp: 0.05, antiheal: { mul: 0, dur: 1.5, shield: true }, slow: 0.25, slowDur: 1.5 },
        desc: 'Phóng giáo gió: kẻ đầu tiên trúng chịu 150 sát thương cộng 5% máu đã mất (sát thương chuẩn), nổ lan kẻ quanh nó; trong 1,5 giây không được hồi máu, không nhận khiên và chậm 25%. Hai lần dùng, cách nhau 3 giây.' },
      { id: 'phongnha', look: 'ddTemple', name: 'Phong Nha Thần Điện', cd: 55, do: 'nova', windup: 0, move: 1, radius: 6, dmg: 0, fx: { silence: 1 }, cdAfter: true, dur: 4, icon: 'blizzard',
        ddTemple: { delay: 1, every: 1.5, n: 3, r: 6, block: 0.5, heal: 0.05, lostHp: 0.05, first: 2, pull: 1.5, step: 0.2, max: 0.5, dur: 1.75 },
        desc: 'Câm lặng kẻ địch trong 6 m 1 giây và tụ gió; 1 giây sau Thần Điện Phong Nha nổi quanh bạn, cứ 1,5 giây một nhịp, ba nhịp. Đồng đội trong vùng hết mọi hiệu ứng xấu, được bọc gió chặn đạn và hồi 5% máu tối đa của bạn; kẻ địch bị kéo về phía bạn, mất 5% máu đã mất (sát thương chuẩn), chậm và bắn chậm thêm 20% mỗi nhịp (tối đa 50%) trong 1,75 giây. Nhịp đầu gấp đôi. Hồi chiêu tính từ lúc thần điện tan.' },
    ],
  },
  // Captain America: ported from the owner's earlier game (clip BV1Kp4y1b7i6 p21 "18.上尉", tooltips read at 2-8 s; AUDIT-c.md). Attack =
  // 150 (lubo, moclan): Chính Nghĩa Chi Thuẫn 76% -> 114 out, 159% -> 239 home; Dũng Khí Chi Thuẫn 720% -> a 1080 shield. Cooldowns 6 / 6
  // (2 uses 4 s apart) / 30 s in the clip -> 8 / 8 / 55. The disc weapon stays (bounce 2). The passive is the clip's command aura
  // (+10% speed; "+10% armour" as +0.05 on our 0..0.3 armour axis) and inspire on every cast (K1 aura, inspire); Vinh Diệu's bullet-eating
  // shield is bless.bubble (K1), the boomerang's homeward leg is volley.back (K1), the team shield is rally.shield + decay (K1).
  // The ult's short charge is not ported (rally fires at the press).
  tacke: {
    name: 'Captain America', role: 'Hỗ trợ', roleKey: 'support', price: 1750, tint: 0x2f5fb8,
    blurb: 'Khiên tròn nảy tường. Chỉ huy đồng đội quanh mình chạy nhanh và cứng hơn, khiên vinh quang nuốt đạn, ném khiên đi về làm choáng, khiên dũng khí che cả đội.',
    hp: 2500, speed: 6.4, radius: 0.84,
    armor: 0.08, accel: 1.2, turn: 13, towerMul: 0.9,
    passive: { do: 'trait', name: 'Chỉ Huy', aura: { r: 8, speed: 0.1, armor: 0.05 }, inspire: { r: 8, dur: 2, haste: 0.25, wdr: 0.25 },
      desc: 'Đồng đội trong 8 m (kể cả bạn) chạy nhanh hơn 10% và thêm 5% giáp. Mỗi lần bạn dùng chiêu, đồng đội trong 8 m được cổ vũ 2 giây: chạy nhanh thêm 25% và nhận ít hơn 25% sát thương từ đòn đánh thường.' },
    weapon: { name: 'Khiên Nảy', cd: 0.5, dmg: 150, speed: 30, range: 21, r: 0.24, bounce: 2, vis: 'disc' },
    skills: [
      { id: 'vinhdieu', look: 'caGlory', name: 'Vinh Diệu Chi Thuẫn', cd: 8, do: 'bless', cast: 10, pick: 4, bubble: 1.25, bubCc: 0.5, icon: 'dome',
        desc: 'Chọn đồng đội ở con trỏ (xa nhất 10 m; không có ai thì chính bạn): người đó và bạn được khiên vinh quang 1,25 giây nuốt mọi viên đạn bay tới; trong lúc đó đồng đội ấy chỉ chịu một nửa thời gian khống chế.' },
      { id: 'chinhnghia', look: 'caJustice', name: 'Chính Nghĩa Chi Thuẫn', cd: 8, uses: { n: 2, gap: 4 }, do: 'volley', n: 1, dmg: 114, speed: 26, range: 13, r: 0.6, pierce: true, ret: true, fx: { stun: 0.5 },
        back: { dmg: 239, fx: { stun: 1 }, cut: 0.15 }, vis: 'disc', icon: 'ricochet',
        desc: 'Ném khiên theo hướng ngắm (xa 13 m): kẻ trên đường bay chịu 114 sát thương, choáng 0,5 giây. Hết tầm khiên bay về, kẻ trên đường về chịu 239 sát thương, choáng 1 giây, mỗi kẻ trúng giảm 15% hồi chiêu này. Tích 2 lượt, cách nhau 4 giây.' },
      { id: 'dungkhi', look: 'caCourage', name: 'Dũng Khí Chi Thuẫn', cd: 55, do: 'rally', radius: 7, dur: 5, heal: 0, haste: 1.5, shield: 1080, shieldDur: 5, decay: true, ccImmune: 5, icon: 'shield',
        desc: 'Che chở đồng đội trong 7 m (kể cả bạn): mỗi người được khiên 1080 trong 5 giây, chạy nhanh hơn 50% và miễn khống chế; khiên và tốc chạy nhạt dần tới hết 5 giây.' },
    ],
  },
  // Hỏa Long: ported from the owner's earlier game (clip BV1Kp4y1b7i6 p4 "1.燎", tooltips read at 0-6 s; AUDIT-b.md). The clip's Liêu
  // is a lava brawler, not a charge lancer: the charge beam goes (kept as the fixture OLD_HOALONG in tools/k15-cases.mjs). Attack = one
  // Nham Quyền blow, set to 150 as moclan: Hỏa Diễm Chi Tức 25% -> 37 a second per stack, the death burst 100% + 25% a stack -> 150 + 37,
  // the lava armour 150% -> 225 and its three shots 150% -> 225, Trụy Tinh 229% -> 344, Thẩm Phán 725% -> 1088. Cooldowns 8 / 8 / 20 s
  // in the clip -> 10 / 10 / 40. The true damage of the burn is a plain burn (armour cuts it); the 50% lifesteal cut on non-tanks is
  // dropped. No MP here.
  hoalong: {
    name: 'Hỏa Long', role: 'Đấu sĩ', roleKey: 'bruiser', price: 1750, tint: 0xe0502a,
    blurb: 'Đấu sĩ nham thạch: sau mỗi chiêu để lại vệt dung nham thiêu kẻ địch, bật giáp dung nham, nhảy từ trên cao giáng xuống đánh tung, rồi nóng rực 2 giây và phun hơi nham nổ tung quanh mình.',
    hp: 2600, speed: 5.9, radius: 0.84,
    armor: 0.1, accel: 1.0, turn: 10, towerMul: 1.0,
    passive: { do: 'lava', name: 'Hỏa Diễm Chi Tức', trail: 2, step: 1.4, puddle: { radius: 1.3, dur: 3 }, burn: { dps: 37, dur: 3, max: 5 }, cap: { confuse: 1 }, per: { dmg: 0.1, guard: 0.1 }, death: { radius: 3.5, dmg: 150, per: 37 },
      desc: 'Sau mỗi chiêu, 2 giây kế tiếp đi tới đâu để lại dung nham tới đó; kẻ địch giẫm vào dính Hỏa Diễm Chi Tức 3 giây, mỗi lớp 37 sát thương mỗi giây, cộng dồn tới 5 lớp; đủ 5 lớp thì hỗn loạn 1 giây. Mỗi kẻ địch đang cháy làm bạn gây thêm 10% sát thương và nhận ít hơn 10%. Kẻ đang cháy mà chết thì nổ, 150 sát thương chuẩn quanh nó, mỗi lớp thêm 37.' },
    weapon: { name: 'Nham Quyền', cd: 0.6, dmg: 150, speed: 24, range: 7, r: 0.5, splash: 1.5, splashHit: true, vis: 'flame' },
    skills: [
      { id: 'phanguc', look: 'hlArmor', name: 'Phá Ngục Viêm Nhận', cd: 10, do: 'shield', amount: 225, dur: 3,
        self: { on: 'cast', dur: 3, guard: 0.5, vs: 'weapon', shots: 3, shotsFor: 6, patch: { dmg: 225, splash: 2.6, splashHit: true, steal: 0.75, hlCut: 0.1, vis: 'shell' } }, icon: 'shield',
        desc: 'Bật giáp dung nham hút 225 sát thương trong 3 giây, trong đó đòn đánh thường nhắm vào bạn chỉ còn một nửa. Ba đòn Nham Quyền kế tiếp nổ rộng 2,6 m, 225 sát thương, hồi máu bằng 75% sát thương gây ra; mỗi đòn trúng giảm 10% hồi chiêu Viêm Lưu Trụy Tinh.' },
      { id: 'truytinh', look: 'hlMeteor', name: 'Viêm Lưu Trụy Tinh', cd: 10, do: 'leap', windup: 0.3, move: 0, cast: 9, flight: 0.45, radius: 3, dmg: 344, fx: { air: 0.5, slow: 0.5, slowDur: 2 },
        self: { on: 'cast', dur: 2.75, haste: 2 }, icon: 'leap',
        desc: 'Tụ lực 0,3 giây rồi nhảy tới chỗ con trỏ (xa nhất 9 m), giáng 344 sát thương vòng 3 m (gần tâm đau hơn), đánh tung kẻ trúng 0,5 giây rồi làm chậm 50% trong 1,5 giây. Hai giây sau khi đáp bạn chạy nhanh gấp đôi.' },
      { id: 'thamphan', look: 'hlJudge', name: 'Viêm Chi Thẩm Phán', cd: 40, do: 'transform', dur: 2, nova: { windup: 2, radius: 5, dmg: 1088, fx: { hlCore: { dur: 1.5, r: 2.5 } } }, icon: 'quake',
        desc: 'Nóng rực 2 giây rồi phun hơi nham nổ quanh mình: 1088 sát thương trong 5 m, càng gần càng đau; kẻ trong 2,5 m bị choáng 1,5 giây.' },
    ],
  },
  khiphao: {
    name: 'Joker', role: 'Ảo thuật', roleKey: 'trickster', price: 1600, tint: 0x7a3fb0,
    blurb: 'Bắn pháo tép làm chậm bừa, thả bẫy lúc chuồn, mở hội pháo hoa chụp cả nhóm.',
    hp: 2300, speed: 6.8, radius: 0.78,
    armor: 0.03, accel: 1.3, turn: 14, towerMul: 1.2,
    passive: { do: 'trait', name: 'Trò Đùa', desc: 'Mỗi quả pháo tép có 30% làm chậm 35% trong 1,5 giây hoặc làm yếu địch 20% sát thương trong 2 giây.' },
    weapon: { name: 'Pháo Tép', cd: 0.5, dmg: 150, speed: 26, range: 12, splash: 1.4, r: 0.24, vis: 'rocket', fx: { chance: 0.3, pick: [{ slow: 0.35, slowDur: 1.5 }, { weaken: { mul: 0.8, dur: 2 } }] } },
    skills: [
      { id: 'bomcuoi', look: 'kpBomb', name: 'Bom Cười', cd: 8, do: 'barrage', n: 1, radius: 0, blast: 3, dmg: 450, delay: 0.8, span: 0, cast: 12, icon: 'barrage',
        desc: 'Ném một quả bom tới con trỏ, nổ sau 0,8 giây. Vòng đỏ báo trước chỗ rơi.' },
      { id: 'chuonle', look: 'kpCloud', name: 'Chuồn Lẹ', cd: 12, do: 'dash', dist: 8, speed: 30, dmg: 0, icon: 'dash',
        onStart: { mine: { trigger: 2, blast: 3, dmg: 260, arm: 0.4, life: 8, fx: { slow: 0.4, slowDur: 1.5 } } },
        desc: 'Lao nhanh theo hướng ngắm và thả lại một quả mìn ở chỗ xuất phát: địch giẫm phải bị chậm.' },
      { id: 'hoiphaohoa', look: 'kpFireworks', name: 'Hội Pháo Hoa', cd: 44, do: 'barrage', n: 12, radius: 7, blast: 2.6, dmg: 260, delay: 0.9, span: 2.2, cast: 16, icon: 'storm',
        fx: { slow: 0.4, slowDur: 1.5, weaken: { mul: 0.8, dur: 2 } },
        desc: 'Mười hai quả pháo hoa dội xuống vùng con trỏ, kẻ trúng bị chậm 40% và yếu đi 20% sát thương.' },
    ],
  },
  quancong: {
    name: 'Quan Công', role: 'Đấu sĩ', roleKey: 'bruiser', price: 1600, tint: 0x2f7d4a,
    blurb: 'Đao khí xuyên hàng, xung phong chém tướng. Hạ gục là hồi sạch chiêu, trợ công giảm một nửa.',
    hp: 3000, speed: 5.9, radius: 0.9,
    armor: 0.12, accel: 1.0, turn: 11, towerMul: 1.6,
    passive: { do: 'trait', name: 'Thanh Long Hồi Phong', desc: 'Hạ gục hồi sạch thời gian hồi ba chiêu. Trợ công giảm một nửa thời gian hồi còn lại.',
      mods: { onKill: { reset: { slots: ['s1', 's2', 'ult'], frac: 1 }, assist: { reset: 0.5 } } } },
    weapon: { name: 'Đao Khí', cd: 0.6, dmg: 70, n: 3, fan: 0.18, speed: 24, range: 6.5, r: 0.4, pierce: true, vis: 'wave' },
    skills: [
      { id: 'xungphong', look: 'qcCharge', name: 'Xung Phong', cd: 9, do: 'dash', dist: 9, speed: 30, dmg: 190, stun: 0.5, knock: 1, icon: 'dash',
        desc: 'Phi ngựa lao tới theo hướng ngắm, gây sát thương và làm choáng kẻ bị húc.' },
      { id: 'yennguyet', look: 'qcMoon', name: 'Yển Nguyệt', cd: 7, do: 'volley', n: 5, fan: 0.2, dmg: 140, speed: 26, range: 5.5, r: 0.5, pierce: true, knock: 1.5, vis: 'wave', icon: 'spin',
        desc: 'Vung đao trăng khuyết quét một hình quạt năm đường, xuyên qua mọi kẻ địch.' },
      { id: 'tramtuong', look: 'qcBehead', name: 'Trảm Tướng', cd: 32, do: 'nova', windup: 0.35, radius: 5, dmg: 500, fx: { execute: 0.25 }, icon: 'quake',
        desc: 'Chém một nhát quanh mình: kẻ địch trúng đòn mà máu còn dưới 25% bị kết liễu ngay.' },
    ],
  },
  natra: {
    name: 'Na Tra', role: 'Thọc sườn', roleKey: 'flanker', price: 1500, tint: 0xe8562e,
    blurb: 'Bánh xe lửa lao nhanh, vòng càn khôn bay đi rồi quay về. Máu xuống thấp thì chạy nhanh, cứng cáp hơn.',
    hp: 2400, speed: 7.1, radius: 0.76,
    armor: 0.03, accel: 1.5, turn: 16, towerMul: 1.0,
    passive: { do: 'trait', name: 'Liên Hoa Thân', desc: 'Khi máu dưới 35%, chạy nhanh hơn 25% và thêm 20% giáp.',
      mods: { lowHp: { below: 0.35, haste: 1.25, armor: 0.2 } } },
    weapon: { name: 'Hỏa Tiêm Thương', cd: 0.3, dmg: 95, speed: 34, range: 11, r: 0.2, vis: 'dart' },
    skills: [
      { id: 'cankhon', look: 'ntRing', name: 'Càn Khôn Quyển', cd: 8, do: 'volley', n: 1, dmg: 210, speed: 26, range: 13, r: 0.45, pierce: true, ret: true, slow: 0.35, slowDur: 1.5, vis: 'disc', icon: 'ricochet',
        desc: 'Ném vòng càn khôn xuyên qua địch, tới cuối tầm thì quay về tay: trúng được hai lượt, làm chậm.' },
      { id: 'phonghoaluan', look: 'ntWheels', name: 'Phong Hỏa Luân', cd: 10, do: 'dash', dist: 9, speed: 32, dmg: 180, knock: 1.5, stun: 0, icon: 'dash',
        desc: 'Đạp bánh xe lửa lao đi theo hướng ngắm, hất văng kẻ chắn đường.' },
      { id: 'thiengiang', look: 'ntDescend', name: 'Thiên Giáng', cd: 40, do: 'leap', to: 'foe', cast: 14, pick: 4, flight: 0.55, radius: 3.2, dmg: 620, stun: 1, icon: 'leap',
        desc: 'Khóa một kẻ địch ở con trỏ rồi bay tới giáng xuống: sát thương lớn và choáng 1 giây. Không có ai ở đó thì không phóng.' },
    ],
  },
  // Dương Tiễn: ported from the owner's earlier game (clip BV1Kp4y1b7i6 p68 "65.二郎神" Nhị Lang Thần, tooltips read at 0-8 s;
  // AUDIT-a.md). Attack = 150 (lubo, moclan): Tam Tiêm went from 110 per 0.45 s to 150 per 0.6 s (same dps). 136% -> 204, 112% ->
  // 168, 229% -> 344, 150% -> 225, 100% -> 150. Cooldowns 6 / 8 / 20 s in the clip -> 8 / 10 / 40. The passive's "-30% armour"
  // and "+30% defence" are on the K1 scale (10% -> 0.05): +15% damage taken (amp) and +0.15 armour. The Q's 3 s mark is the G2
  // tag 'tt' that his weapon and every other row read (vsTag: +150 true, heal 6% of max hp, Hao Thiên Xuất Kích cooldown -10%).
  // The hound is a slow piercing shot; the recast is the G4 warp to that shot. The ult is a three-stage `next` chain (kit lane
  // K13: a second stage may carry its own `next`); the clip's "?0%" slow lost its first digit, 30% is a guess. Kit-remake G5
  // fields (sim.js block "kit lane K13"): passive dtHunt {fx, self}: every hit of his on an enemy mech, weapon or skill, lands fx
  // and gives him the self buff.
  duongtien: {
    name: 'Dương Tiễn', role: 'Đấu sĩ', roleKey: 'bruiser', price: 1600, tint: 0xc8ccd6,
    blurb: 'Mỗi đòn trúng xé giáp và chặn hồi máu của địch, mình cứng và nhanh thêm. Trảm Tiên đánh tung rồi đánh dấu, thả Hao Thiên Khuyển rồi lóe tới nó, quét kích hai lần và mở Thiên Nhãn.',
    hp: 2700, speed: 6.4, radius: 0.82,
    armor: 0.08, accel: 1.1, turn: 12, towerMul: 1.2,
    passive: { do: 'dtHunt', name: 'Trảm Tiên', fx: { amp: { amp: 0.15, dur: 2 }, antiheal: { mul: 0.7, dur: 2 } }, self: { armor: 0.15, haste: 1.3, dur: 2 },
      desc: 'Mọi đòn (thường hay chiêu) trúng địch khiến nó chịu thêm 15% sát thương từ mọi người và được hồi máu ít hơn 30% trong 2 giây; bạn được thêm giáp và chạy nhanh hơn 30% trong 2 giây.' },
    weapon: { name: 'Tam Tiêm', cd: 0.6, dmg: 150, speed: 32, range: 12.5, r: 0.24, vis: 'slug', vsTag: { key: 'tt', fx: { trueDmg: 150 }, healMax: 0.06, cdCut: { slot: 's2', frac: 0.1 } } },
    skills: [
      { id: 'trantien', look: 'dtSlash', name: 'Trảm Tiên Thần Quyết', cd: 8, do: 'nova', windup: 0.15, move: 0.35, radius: 3.5, dmg: 204, fx: { air: 1, tag: { key: 'tt', dur: 3 } }, icon: 'spin',
        desc: 'Vung kích quanh mình: 204 sát thương vòng 3,5 m, đánh tung kẻ trúng 1 giây. Trong 3 giây, mỗi đòn sau của bạn vào chúng gây thêm 150 sát thương chuẩn, hồi 6% máu tối đa và giảm 10% hồi chiêu Hao Thiên Xuất Kích.' },
      { id: 'haothien', look: 'dtHound', name: 'Hao Thiên Xuất Kích', cd: 10, do: 'volley', n: 1, dmg: 168, speed: 15, range: 12, r: 0.7, pierce: true, vis: 'wave', icon: 'decoy',
        vsTag: { key: 'tt', fx: { trueDmg: 150 }, healMax: 0.06, cdCut: { slot: 's2', frac: 0.1 } },
        next: { window: 0.8, row: { id: 'haokich', name: 'Hao Thiên Xuất Kích', look: 'dtBlink', do: 'warp', to: 'shot', of: 'haothien', take: true, dist: 13, land: { radius: 3, dmg: 344 },
          vsTag: { key: 'tt', fx: { trueDmg: 150 }, healMax: 0.06, cdCut: { slot: 's2', frac: 0.1 } } } },
        desc: 'Thả Hao Thiên Khuyển chạy thẳng 12 m theo hướng ngắm, cắn 168 mọi kẻ địch nó chạm. Bấm lại trước khi nó tới nơi: lóe tới chỗ con chó, gây 344 sát thương vòng 3 m.' },
      { id: 'phadiet', look: 'dtSweep', name: 'Phá Diệt Hoành Tảo', cd: 40, do: 'nova', windup: 0.15, move: 0.35, radius: 4.5, arc: 1.2, dmg: 225, slow: 0.3, slowDur: 1.5, healLost: 0.15, icon: 'swords',
        vsTag: { key: 'tt', fx: { trueDmg: 150 }, healMax: 0.06, cdCut: { slot: 's2', frac: 0.1 } },
        next: { window: 3, onHit: true, row: { id: 'tuyetsat', name: 'Tuyệt Sát Chi Kích', look: 'dtSwing', do: 'nova', windup: 0.2, move: 0.35, radius: 4.5, arc: 1.2, dmg: 225, slow: 0.3, slowDur: 1.5, healLost: 0.15,
          vsTag: { key: 'tt', fx: { trueDmg: 150 }, healMax: 0.06, cdCut: { slot: 's2', frac: 0.1 } },
          next: { window: 3, onHit: true, row: { id: 'thongthien', name: 'Thông Thiên Pháp Nhãn', look: 'dtEye', do: 'volley', n: 3, fan: 0.22, dmg: 225, speed: 28, range: 12, r: 0.45, sameDecay: 0.5, healLost: 0.15, vis: 'pulse',
            vsTag: { key: 'tt', fx: { trueDmg: 150 }, healMax: 0.06, cdCut: { slot: 's2', frac: 0.1 } } } } } },
        desc: 'Ba nhịp. Phá Diệt Hoành Tảo: quét kích hình quạt 4,5 m, 225 sát thương, chậm 30% trong 1,5 giây. Trúng ai thì trong 3 giây bấm lại: Tuyệt Sát Chi Kích, quét thêm một lần như thế. Trúng ai thì bấm lại lần nữa: Thông Thiên Pháp Nhãn, ba con mắt trời bay ra, mỗi con 225 (trúng cùng một kẻ thì mỗi con sau chỉ còn một nửa). Mỗi kẻ địch trúng mọi nhịp hồi cho bạn 15% máu đã mất.' },
    ],
  },
  // Athena: ported from the owner's earlier game (clip BV1Kp4y1b7i6 p69 "66.雅典娜", tooltips in ~/handoff/dtt-ref/kits/AUDIT-a.md).
  // Attack = one Giáo Sáng blow (150; was 168 at 0.5 s, now 150 at 0.45 s, same dps): passive heals 150% -> 225 (ally) and 225 over
  // 2 s (self); Chiến Tranh Nghệ Thuật 176% -> 264 + 15% of the target's lost hp (true). Ranges: 300 -> 6 m, 600 -> 12 m. Cooldowns
  // 6 / 8 / 25 s in the clip -> 8 / 10 / 45. Energy is kept (her kit is built on it): 150 max, +10 per 3 s, Q costs 50, and each 3%
  // of her max hp her shield absorbs gives back 15. Kit-remake G5 fields (sim.js block "kit-remake G5 Athena"): passive castHeal,
  // barrage lock, bless cleanse / shieldEn / undying / endHeal.
  athena: {
    name: 'Athena', role: 'Hộ vệ', roleKey: 'guardian', price: 1500, tint: 0xe9e4d4,
    blurb: 'Nữ thần chiến tranh: mỗi lần dùng chiêu hồi máu cho đồng đội yếu nhất và chính mình. Khóa kẻ địch gần nhất rồi giáng cột thánh quang, phủ thánh thuẫn giải mọi hiệu ứng xấu, ban phúc bất tử cho đồng đội.',
    hp: 2500, speed: 5.4, radius: 0.92,
    armor: 0.15, accel: 0.8, turn: 9, towerMul: 1.0,
    energy: { max: 150, regen: 10 / 3, start: 150 },
    passive: { do: 'castHeal', name: 'Chiến Tranh Nghệ Thuật', r: 6, ally: 225, self: 225, selfDur: 2,
      desc: 'Mỗi lần dùng chiêu, đồng đội ít máu nhất trong 6 m được hồi 225 máu, còn bạn hồi 225 máu trong 2 giây. Bạn có thanh năng lượng 150, hồi 10 mỗi 3 giây.' },
    weapon: { name: 'Giáo Sáng', cd: 0.45, dmg: 150, speed: 30, range: 11, r: 0.24, vis: 'pulse' },
    skills: [
      { id: 'chientranh', look: 'atLock', name: 'Chiến Tranh Nghệ Thuật', cd: 8, do: 'barrage', n: 1, cast: 12, lock: 12, radius: 0, blast: 2.5, delay: 1, span: 0, dmg: 264,
        fx: { lostHp: 0.15 }, uses: { n: 3, gap: 2 }, en: { cost: 50 }, icon: 'beam',
        desc: 'Tốn 50 năng lượng: khóa kẻ địch gần nhất trong 12 m, 1 giây sau cột thánh quang giáng xuống nó, gây 264 sát thương vòng 2,5 m quanh nó, thêm sát thương chuẩn bằng 15% máu đã mất của kẻ trúng. Tích tối đa 3 lượt, mỗi lượt cách nhau 2 giây.' },
      { id: 'thanhthuan', look: 'atAegis', name: 'Thánh Thuẫn Tí Hựu', cd: 10, do: 'bless', cast: 12, pick: 3.5, shield: 750, dur: 2, cleanse: true, shieldEn: { per: 0.03, en: 15 }, icon: 'shield',
        desc: 'Giải mọi hiệu ứng xấu trên đồng đội ở con trỏ (không có ai thì là bạn) và phủ thánh thuẫn hấp thụ 750 sát thương trong 2 giây. Cứ mỗi 3% máu tối đa của bạn mà khiên đỡ được, bạn nhận 15 năng lượng.' },
      { id: 'anhhung', look: 'atHero', name: 'Anh Hùng Bất Hủ', cd: 45, do: 'bless', cast: 12, pick: 3.5, dur: 3, undying: 3, endHeal: 0.3, icon: 'rally',
        desc: 'Ban phúc 3 giây cho đồng đội ở con trỏ (không có ai thì là bạn): máu không thể tụt dưới 1. Hết phúc, kẻ đó hồi máu bằng 30% máu tối đa của bạn.' },
    ],
  },
  // Hades: ported from the owner's earlier game (clip BV1Kp4y1b7i6 p72 "69.冥王", tooltips read at 0-5.5 s; AUDIT-b.md). Attack = one
  // Hồn Hỏa shot (115): the scythe 100% -> 115, Lợi Nhận 132% -> 152 (Chế Tài) and 167% -> 192 (Thu Cát), Giáng Lâm 223% -> 256.
  // Cooldowns 6 / 6 / 30 s in the clip -> 8 / 8 / 55 on our scale. Range 480 -> 13 m (1 m ~ 37 units), the scythe's 168 -> 4.5 m.
  // "The target deals 30% less to Hades" is a plain weaken (it hits everyone 30% softer for 3 s); the scythe's +150% attack speed
  // and lifesteal after Thu Cát's Lợi Nhận is rapid x2.5 beside the scythe's own 30% steal. No MP here.
  hades: {
    name: 'Hades', role: 'Khống chế', roleKey: 'control', price: 1400, tint: 0x2b2540,
    blurb: 'Hai thế: Chế Tài bắn hồn hỏa xa làm địch yếu đi, Thu Cát cầm lưỡi hái chém quạt hút máu. Minh Vương Giáng Lâm biến mất rồi giáng xuống đầu một kẻ địch, dựng lĩnh vực giam nó lại.',
    hp: 2500, speed: 5.9, radius: 0.84,
    armor: 0.08, accel: 0.9, turn: 11, towerMul: 0.8,
    passive: { do: 'form', hdSplit: true, name: 'Chế Tài · Thu Cát', desc: 'Hai thế, đổi bằng Hình Thái Chuyển Hoán. Chế Tài: Hồn Hỏa bắn xa 13 m, mỗi phát trúng giảm 15% hồi chiêu Hình Thái Chuyển Hoán và làm mục tiêu gây ít hơn 30% sát thương trong 3 giây. Thu Cát: Lưỡi Hái chém quạt 4,5 m trước mặt, 115 sát thương, hút 30% máu, làm chậm 10% trong 1,5 giây (cộng dồn tới 50%); đánh công trình chỉ bằng nửa.' },
    forms: [{}, { weapon: { name: 'Lưỡi Hái', cd: 0.55, dmg: 115, speed: 26, range: 4.5, r: 1.0, pierce: true, vis: 'wave', steal: 0.3, towerMul: 0.5, hdCut: 0,
      fx: { slow: 0.1, slowDur: 1.5, slowStack: { step: 0.1, max: 0.5 } }, vsTag: { key: 'hdMark', mul: 1.5 } },
      skills: { 0: { self: null }, 1: { windup: 0.15, radius: 3.5, arc: 0, dmg: 192, fx: null, self: { on: 'hit', dur: 5, rapid: 2.5 } } } }],
    weapon: { name: 'Hồn Hỏa', cd: 0.4, dmg: 115, speed: 28, range: 13, r: 0.24, vis: 'frost', fx: { weaken: { mul: 0.7, dur: 3 } }, hdCut: 0.15 },
    skills: [
      { id: 'hinhthai', look: 'hdForm', name: 'Hình Thái Chuyển Hoán', cd: 8, do: 'form', setup: 0.15, move: 0.8, hdMelee: 1,
        self: { on: 'cast', dur: 3, haste: 2, hasteDecay: true, guard: 0.5, hdCc: 0.5 }, icon: 'swap',
        desc: 'Đổi thế trong 0,15 giây. Sang thế Thu Cát thì 3 giây kế tiếp chạy nhanh gấp đôi (nhạt dần), nhận ít hơn 50% sát thương và mọi khống chế ngắn đi một nửa.' },
      { id: 'loinhan', look: 'hdBlade', name: 'Minh Vương Lợi Nhận', cd: 8, do: 'nova', windup: 0.2, move: 0.35, radius: 6, arc: 0.6, dmg: 152,
        fx: { slow: 0.5, slowDur: 5, slowDecay: true, tag: { key: 'hdMark', dur: 5 } }, icon: 'frost',
        desc: 'Thế Chế Tài: chém quạt 6 m phía trước, 152 sát thương, làm chậm 50% nhạt dần trong 5 giây; 5 giây đó Lưỡi Hái của bạn đánh nó mạnh thêm 50%. Thế Thu Cát: chém vòng 3,5 m quanh mình, 192 sát thương; trúng ai thì 5 giây Lưỡi Hái đánh nhanh gấp rưỡi. Hồi chiêu tính riêng cho từng thế.' },
      { id: 'gianglam', look: 'hdDescend', name: 'Minh Vương Giáng Lâm', cd: 55, do: 'leap', to: 'foe', cast: 14, pick: 4, flight: 1, invuln: true, radius: 3.5, dmg: 256,
        hdHold: 1.5, hdDomain: { radius: 5, dur: 4, fear: 0.6 }, icon: 'magnet',
        desc: 'Uy hiếp kẻ địch ở con trỏ (trong 14 m): nó bị giam tại chỗ 1,5 giây, bạn biến mất rồi 1 giây sau giáng xuống chỗ nó, 256 sát thương trong 3,5 m (gần tâm đau hơn) và dựng Minh Vương Lĩnh Vực 5 m trong 4 giây. Trong lĩnh vực bạn miễn khống chế; kẻ bị uy hiếp bước ra khỏi lĩnh vực thì bị choáng tới khi lĩnh vực tan; kẻ địch khác bước vào thì hoảng sợ bỏ chạy.' },
    ],
  },
  // Lữ Bố: ported from the owner's earlier game (clip BV1Kp4y1b7i6 p9 "6.吕布", tooltips read at 2-10 s). Attack = one Phương Thiên Kích
  // blow (150), as moclan: Tuy Viễn 184% -> 276, Bạo Nộ 155% -> 232, Hoành Tảo 158% -> 237, Quỷ Thần 388% -> 582. Cooldowns 6 / 8 / 25 s in
  // the clip -> 8 / 10 / 45 on our scale. No MP here: the energy refunds are dropped.
  lubo: {
    name: 'Lữ Bố', role: 'Đấu sĩ', roleKey: 'bruiser', price: 1700, tint: 0xb3262b,
    blurb: 'Phương Thiên Kích chém nổ quanh mục tiêu. Phóng kích xuyên hàng giữ chân, lóe tới đánh tung rồi quét kích hồi máu, nhảy từ trời giáng xuống đánh tung cả vùng.',
    hp: 2700, speed: 6.3, radius: 0.88,
    armor: 0.1, accel: 1.1, turn: 11, towerMul: 1.3,
    passive: { do: 'meter', name: 'Vô Song', max: 1, gain: { cast: 1 }, spend: { kind: 'shot', reach: 1.5, cdr: 1 }, castShield: { frac: 0.15, dur: 1.5 },
      desc: 'Đòn kích thường trúng thì nổ lan sang kẻ đứng quanh mục tiêu. Mỗi lần dùng chiêu được khiên bằng 15% máu tối đa trong 1,5 giây, và đòn kích thường kế tiếp với xa gấp rưỡi; đòn đó trúng thì mọi chiêu hồi nhanh thêm 1 giây.' },
    weapon: { name: 'Phương Thiên Kích', cd: 0.5, dmg: 150, speed: 26, range: 7.5, r: 0.5, splash: 2.2, splashHit: true, vis: 'wave' },
    skills: [
      { id: 'tuyvien', look: 'lbThrow', name: 'Tuy Viễn Tất Tru', cd: 8, do: 'volley', n: 1, dmg: 276, speed: 24, range: 11, r: 0.55, pierce: true, fx: { root: 1 }, vis: 'rail', icon: 'pierce',
        desc: 'Phóng Phương Thiên Kích theo hướng ngắm, xa 11 m: mọi kẻ địch trên đường bay chịu 276 sát thương và bị giữ chân 1 giây (vẫn bắn được).' },
      { id: 'baono', look: 'lbBlink', name: 'Bạo Nộ Đả Kích', cd: 10, do: 'warp', dist: 8, land: { radius: 3, dmg: 232, fx: { air: 0.5, slow: 0.5, slowDur: 2.5 } }, icon: 'warp',
        next: { window: 3, onHit: true, row: { id: 'hoanhtao', name: 'Hoành Tảo Thiên Quân', do: 'nova', windup: 0.15, move: 0.35, radius: 4.5, arc: 1.05, dmg: 237, healLost: 0.15, look: 'lbSweep' } },
        desc: 'Lóe tới chỗ con trỏ (xa nhất 8 m), giáng 232 sát thương vòng 3 m, đánh tung kẻ trúng 0,5 giây rồi làm chậm 50% trong 2 giây. Trúng ai thì trong 3 giây bấm lại để Hoành Tảo Thiên Quân: quét kích hình quạt 120° trước mặt, 237 sát thương, mỗi kẻ trúng hồi cho bạn 15% máu đã mất.' },
      { id: 'quythan', look: 'lbSlam', name: 'Quỷ Thần Giáng Lâm', cd: 45, do: 'leap', windup: 1, move: 0, cast: 10, flight: 0.45, invuln: true, radius: 4, dmg: 582, fx: { air: 1, slow: 0.5, slowDur: 3 }, icon: 'leap',
        desc: 'Tụ lực 1 giây rồi nhảy tới chỗ con trỏ (xa nhất 10 m), giáng 582 sát thương vòng 4 m, đánh tung kẻ trúng 1 giây rồi làm chậm 50% trong 2 giây. Từ lúc bấm tới lúc đáp không bị nhắm trúng, không bị khống chế.' },
    ],
  },
  // Kaneki: ported from the owner's earlier game (clip BV1Kp4y1b7i6 p62 "59.金木" Kim Mộc, skin 末日使者, tooltips read at 0-4 s;
  // AUDIT-a.md). Attack = 150 (lubo, moclan): Xúc Tu went from 3 x 45 per 0.35 s to 3 x 50 per 0.39 s (same dps). 164% -> 246,
  // 147% -> 220. "+10% of his own lost hp" is the G4 lowHpScale (x (1 + f x lost share)): f = 0.1 x 2300 / 246 = 0.93 on the
  // fan, 0.1 x 2300 / 220 = 1.05 on the hunt, so the bonus at a given hp equals the clip's. Cooldowns 10 (2 uses 5 s apart) / 6 /
  // 20 s in the clip -> 12 / 8 / 40. The hunt's slow is the G2 slowStack (+15% per hit, at most 60%; the clip starts at 30%).
  // Kit-remake G5 fields (sim.js block "kit lane K13"): passive knThirst {max, dur, haste, heal} (each skill hit adds a stack, at
  // most max, all gone dur s after the last: speed x (1 + haste x n) and heals received x (1 + heal x n)), row knCost (the press
  // costs that share of his CURRENT hp, never below 1), transform knRegen (heals that share of his lost hp per second).
  mucma: {
    name: 'Kaneki', role: 'Thọc sườn', roleKey: 'flanker', price: 1600, tint: 0x1d1d24,
    blurb: 'Đổi máu lấy đòn: mỗi chiêu tốn máu, máu càng thấp đánh càng đau, trúng ai hồi lại 10% máu. Hách Tử Tiến Hóa: bá thể, không đòn nào lấy quá 5% máu.',
    hp: 2300, speed: 7.0, radius: 0.76,
    armor: 0.03, accel: 1.5, turn: 16, towerMul: 1.0,
    passive: { do: 'knThirst', name: 'Khát Máu', max: 5, dur: 5, haste: 0.1, heal: 0.1,
      desc: 'Mỗi lần chiêu trúng địch, bạn chạy nhanh hơn 10% và được hồi máu nhiều hơn 10% trong 5 giây, cộng dồn 5 lần.' },
    weapon: { name: 'Xúc Tu', cd: 0.39, dmg: 50, n: 3, fan: 0.14, speed: 28, range: 8, r: 0.24, vis: 'pellet' },
    skills: [
      { id: 'satluc', look: 'knFeast', name: 'Sát Lục Thịnh Yến', cd: 12, uses: { n: 2, gap: 5 }, do: 'nova', windup: 0.1, move: 0.35, radius: 5, arc: 0.7, dmg: 246, slow: 0.3, slowDur: 2,
        knCost: 0.2, lowHpScale: 0.93, healMax: 0.1, icon: 'spin',
        desc: 'Tốn 20% máu hiện có, quất xúc tu hình quạt 5 m: 246 sát thương cộng 10% máu bạn đã mất, chậm 30% trong 2 giây. Mỗi kẻ trúng hồi cho bạn 10% máu tối đa. Hai lần dùng, cách nhau 5 giây.' },
      { id: 'conga', look: 'knHunt', name: 'Cơ Ngạ Bộ Liệp', cd: 8, do: 'dash', dist: 8, speed: 34, stop: true, dmg: 220, fx: { slowStack: { step: 0.15, max: 0.6 }, slowDur: 2.5 },
        knCost: 0.15, lowHpScale: 1.05, healMax: 0.1, cdCut: { slot: 'self', set: 1.5, on: 'hit', max: 1 }, icon: 'dash',
        desc: 'Tốn 15% máu hiện có, lao đi săn theo hướng ngắm: kẻ đầu tiên trúng chịu 220 sát thương cộng 10% máu bạn đã mất và chậm thêm 15% (tối đa 60%) trong 2,5 giây. Trúng thì hồi 10% máu tối đa và chiêu này hồi lại sau 1,5 giây.' },
      { id: 'hachtu', look: 'knKagune', name: 'Hách Tử Tiến Hóa', cd: 40, do: 'transform', dur: 5, ccImmune: 5, hitCap: 0.05, knRegen: 0.1, icon: 'rage',
        desc: '5 giây hóa hách tử: bá thể (không bị khống chế), không đòn nào lấy quá 5% máu tối đa của bạn, và mỗi giây hồi 10% máu đã mất.' },
    ],
  },
  // Natsu = 炎龙王 Viêm Long Vương: ported from the owner's earlier game (clip BV1Kp4y1b7i6 p78 "75.炎龙王", tooltips in
  // ~/handoff/dtt-ref/kits/AUDIT-b.md). Attack = one Hỏa Quyền blow (150; was a 25-a-tick flamethrower with burn, about the same dps):
  // Hồng Liên Bạo Nhận 176% -> 264 (x1.3 in Lôi Viêm -> 343), Long Thần Hoàng Viêm 128% -> 192 (-> 250), the Lôi Viêm field 75%/s -> 113.
  // Cooldowns 8 / 6 / 25 s in the clip -> 10 / 8 / 45. "Phòng ngự +10% / +30% / +100%" -> armour +0.03 a stack, +0.1, +0.3 (decaying).
  // Kit-remake G5 fields (sim.js block "kit lane k16"): passive ntsMana (stacks per cast, the third spent on the next cast for -6 s and a
  // decaying burst), transform ntsLost (heals that share of the lost hp a second), transform zone ntsBand (the dragon ring at the rim hits x2).
  kynhong: {
    name: 'Natsu', role: 'Đấu sĩ', roleKey: 'bruiser', price: 1600, tint: 0xe2401c,
    blurb: 'Rồng lửa cận chiến: mỗi chiêu tích ma lực cho chạy nhanh và cứng hơn. Lao xoay lưỡi lửa, phun long viêm, rồi bật Lôi Viêm 8 giây: vòng lôi hỏa thiêu quanh mình và hai chiêu kia mạnh hơn.',
    hp: 2800, speed: 6.1, radius: 0.86,
    armor: 0.08, accel: 1.1, turn: 12, towerMul: 1.8,
    passive: { do: 'trait', name: 'Viêm Long Ma Lực', look: 'ntMana', ntsMana: { max: 3, haste: 0.1, armor: 0.03, cut: 6, burst: { dur: 1.5, haste: 1, armor: 0.3 } },
      desc: 'Mỗi lần dùng chiêu tích 1 lớp ma lực, mỗi lớp chạy nhanh hơn 10% và cứng hơn. Đủ 3 lớp thì chiêu kế tiếp lập tức giảm 6 giây hồi chiêu và bùng ma lực 1,5 giây: chạy nhanh gấp đôi, cứng hơn hẳn, giảm dần.' },
    weapon: { name: 'Hỏa Quyền', cd: 0.5, dmg: 150, speed: 26, range: 7.5, r: 0.34, vis: 'slug' },
    skills: [
      { id: 'honglien', look: 'ntBlade', name: 'Hồng Liên Bạo Nhận', cd: 10, do: 'leap', cast: 8, flight: 0.3, radius: 3, dmg: 264, self: { on: 'cast', dur: 3, haste: 1.3, armor: 0.1 }, icon: 'dash',
        desc: 'Lao tới con trỏ (xa nhất 8 m), tới nơi xoay lưỡi lửa: 264 sát thương lên kẻ địch trong 3 m. 3 giây sau đó chạy nhanh hơn 30% và cứng hơn. Ở Lôi Viêm: vòng 4 m, 343 sát thương, hút 30% sát thương gây ra, thêm sát thương chuẩn 6% máu đã mất.' },
      { id: 'longthan', look: 'ntBreath', name: 'Long Thần Hoàng Viêm', cd: 8, do: 'beam', windup: 0.35, range: 8, width: 2, dmg: 192, fx: { slow: 0.4, slowDur: 2 }, icon: 'rocket',
        desc: 'Tụ lực rồi phun một luồng long viêm 8 m về phía trước: 192 sát thương, chậm 40% trong 2 giây. Ở Lôi Viêm: phun thành hình quạt, 250 sát thương, hút 30%, câm lặng 1 giây.' },
      { id: 'loiviem', look: 'ntDragon', name: 'Lôi Viêm Cuồng Long', cd: 45, do: 'transform', dur: 8, armor: 0.3, ccResist: 0.7, ntsLost: 0.06,
        zone: { radius: 3.5, dps: 113, vis: 'ntDragon', ntsBand: 1.2 },
        patch: { s1: { radius: 4, dmg: 343, steal: 0.3, fx: { lostHp: 0.06 } }, s2: { do: 'nova', windup: 0.35, move: 0.12, radius: 8, arc: 0.45, dmg: 250, steal: 0.3, fx: { slow: 0.4, slowDur: 2, silence: 1 } } }, icon: 'boost',
        desc: 'Bật Lôi Viêm 8 giây: vòng lôi hỏa 3,5 m quanh mình gây 113 sát thương mỗi giây, kẻ chạm vào lôi long ở mép vòng chịu gấp đôi. Nhận ít hơn 30% sát thương, bị khống chế ngắn hơn 30%, mỗi giây hồi 6% máu đã mất; Hồng Liên Bạo Nhận và Long Thần Hoàng Viêm được cường hóa.' },
    ],
  },
  // Ngưu Ma Vương: ported from the owner's earlier game (clip BV1Kp4y1b7i6 p85 "82.牛魔王", tooltips in ~/handoff/dtt-ref/kits/AUDIT-b.md,
  // gameplay 18-66 s). Attack = one Rìu Chấn blow, set to 150 (was 200 every 0.9 s; now every 0.68 s, the same dps) so the % numbers
  // keep their meaning: Chiến Tiêu 50% -> 75, Bạo Lệ Tiễn Đạp 100% -> 150, Cuồng Dã Giác Tập 162% -> 243, Tàn Phong Đoạn Dã 357% -> 536.
  // Cooldowns 6 / 8 / 25 s in the clip -> 8 / 10 / 45. MP dropped. "+10% 能量护盾" per own stack is read as 2% less skill damage a
  // stack (G2 guard vs 'skill', 20% at 10); the clip shows a lime bubble on him. The Q's slow and weaken "after the stun" run from the
  // hit for 0.5 + 2 s (pilot rule, as air). Kit-remake G5 fields (sim.js block "kit lane K18"): passive nmGale (the whirl every 3 s,
  // at each press and each 10% of max hp taken; stacks on foes and on him), row nmToHp (the E's shield turns into hp), hitfx nmMute
  // (the ult's 50% less skill damage dealt).
  nguma: {
    name: 'Ngưu Ma Vương', role: 'Trụ', roleKey: 'tank', price: 1800, tint: 0x5a1e1e,
    blurb: 'Chiến Tiêu xoáy quanh mình theo nhịp, mỗi chiêu và mỗi lần bị đánh đau lại xoáy thêm. Giậm đất đẩy lùi làm choáng, húc sừng cuốn cả đám theo kèm khiên hóa máu, giáng rìu xuống dải đất trước mặt đánh tung cả hàng.',
    hp: 3100, speed: 5.0, radius: 1.0,
    armor: 0.14, accel: 0.8, turn: 9, towerMul: 1.5,
    passive: { do: 'trait', name: 'Chiến Tiêu', look: 'nmGale', nmGale: { every: 3, radius: 3.5, dmg: 75, amp: 0.15, slow: 0.05, max: 10, dur: 5, hurt: 0.1, guard: 0.02 },
      desc: 'Cứ 3 giây, mỗi lần dùng chiêu và mỗi lần mất đủ 10% máu tối đa, Chiến Tiêu xoáy quanh bạn: 75 sát thương trong 3,5 m. Kẻ trúng nhận một lớp (tối đa 10, 5 giây): chậm 5% mỗi lớp và chịu thêm 15% mỗi lớp từ Chiến Tiêu kế tiếp. Bạn cũng nhận một lớp: sát thương kỹ năng phải nhận giảm 2% mỗi lớp trong 5 giây.' },
    weapon: { name: 'Rìu Chấn', cd: 0.68, dmg: 150, speed: 24, range: 8, r: 0.6, pierce: true, knock: 1.5, vis: 'wave' },
    skills: [
      { id: 'baole', look: 'nmStomp', name: 'Bạo Lệ Tiễn Đạp', cd: 8, uses: { n: 2, gap: 3 }, do: 'nova', windup: 0.3, move: 0.2, radius: 4, dmg: 150, stun: 0.5, knock: 2,
        fx: { slow: 0.25, slowDur: 2.5, weaken: { mul: 0.75, dur: 2.5 } }, icon: 'quake',
        desc: 'Tụ lực 0,3 giây rồi giậm đất quanh mình (4 m): 150 sát thương, đẩy lùi, choáng 0,5 giây; hết choáng kẻ trúng vẫn chậm 25% và yếu đi 25% thêm 2 giây. Tích 2 lần, cách nhau 3 giây.' },
      { id: 'cuongda', look: 'nmHorn', name: 'Cuồng Dã Giác Tập', cd: 10, do: 'dash', windup: 0.3, move: 0, dist: 8, speed: 26, dmg: 243, drag: true,
        fx: { slow: 0.75, slowDur: 4, slowDecay: true }, selfShield: { frac: 0.25, dur: 4 }, nmToHp: true, icon: 'dash',
        desc: 'Tụ lực 0,3 giây rồi húc sừng lao 8 m theo hướng ngắm, cuốn theo mọi kẻ địch trên đường: mỗi kẻ 243 sát thương và chậm 75%, giảm dần trong 4 giây. Bạn nhận khiên 25% máu tối đa trong 4 giây, khiên dần chuyển thành máu.' },
      { id: 'tanphong', look: 'nmRend', name: 'Tàn Phong Đoạn Dã', cd: 45, do: 'beam', windup: 0.5, range: 10, width: 4, dmg: 536,
        fx: { air: 1.5, slow: 0.5, slowDur: 4, nmMute: { mul: 0.5, dur: 4 } }, icon: 'quake',
        desc: 'Tụ lực 0,5 giây rồi giáng rìu xuống dải 10 x 4 m trước mặt: 536 sát thương, đánh tung 1,5 giây; rơi xuống rồi kẻ trúng chậm 50% và sát thương kỹ năng của nó giảm 50% thêm 2,5 giây.' },
    ],
  },
  // Sơn Tinh: ported from the owner's earlier game (clip BV1Kp4y1b7i6 p14 "11.山精", tooltips read at 1.5-4.5 s; AUDIT-c.md). Attack = 150
  // (lubo, moclan); the passive's +50% damage and +50% shot speed are baked into the weapon: Đá Lăn 150 x 1.5 = 225 every 0.75 s (300 dps
  // before the passive, as the others), speed 33, each hit + 3% of the target's lost hp as true damage, lifesteal 25% (E adds 25%: 50%).
  // Đại Địa Trớ Chú 223% -> 335; Sơn Thần Giáng Lâm 351% -> 527, its boulders 100% x 1.5 -> 225 (armour ignored: pen 1). Cooldowns
  // 10 / 8 / 30 s in the clip -> 13 / 10 / 50; E and the ult start their cooldown once their state is over (cdAfter, the tooltip's red
  // line). E's scatter is G3 self.shots (three rocks in a fan for its 4 s). The god lasts 13 s from the press (1 s vanished in the air,
  // 12 s on the ground), takes 75% less crowd control (ccResist 0.25) and does 75% less to buildings (towerMul 0.25); at the end it is
  // petrified 1 s with +0.25 armour (+150% of its 0.15). The "+150% energy shield" has no counterpart here and is dropped.
  // Kit lane K6 fields (sim.js block "kit lane K6"): hitfx sntCurse, transform sntLand, buff sntStone.
  sontinh: {
    name: 'Sơn Tinh', role: 'Trụ', roleKey: 'tank', price: 1800, tint: 0x6b7a3a,
    blurb: 'Thần núi ném đá hút máu, mỗi viên ăn thêm máu đã mất của kẻ trúng. Nguyền rủa kẻ địch chậm dần tới hóa đá, nổi giận ném đá tỏa, rồi biến thành Sơn Thần khổng lồ giáng từ trời xuống.',
    hp: 3300, speed: 4.9, radius: 0.96,
    armor: 0.15, accel: 0.8, turn: 9, towerMul: 1.4,
    passive: { do: 'lifesteal', name: 'Đại Địa Chi Lực', frac: 0.25,
      desc: 'Đá ném ra bay nhanh hơn 50% và nặng hơn 50%. Mỗi viên trúng thêm sát thương chuẩn bằng 3% máu đã mất của kẻ trúng, và 25% sát thương gây ra hóa thành máu cho bạn.' },
    weapon: { name: 'Đá Lăn', cd: 0.75, dmg: 225, speed: 33, range: 13, r: 0.4, fx: { lostHp: 0.03 }, vis: 'shell' },
    skills: [
      { id: 'trochu', look: 'stCurse', name: 'Đại Địa Trớ Chú', cd: 13, do: 'nova', windup: 0.4, radius: 5, dmg: 0, fx: { slow: 1, slowDur: 3, slowGrow: true, sntCurse: { dur: 3, dmg: 335, petrify: 1 } }, icon: 'quake',
        desc: 'Lấy đà 0,4 giây rồi nguyền rủa kẻ địch trong 5 m quanh bạn: trong 3 giây chúng chậm dần tới khi đứng sững, rồi hóa đá 1 giây và chịu 335 sát thương.' },
      { id: 'daino', look: 'stWrath', name: 'Đại Địa Chi Nộ', cd: 10, do: 'buff', dur: 4, haste: 1.25, rapid: 1.25, lifesteal: 0.5, cdAfter: true,
        self: { on: 'cast', dur: 4, shots: 8, shotsFor: 4, patch: { n: 3, fan: 0.18 } }, icon: 'rage',
        desc: 'Nổi giận 4 giây: chạy nhanh hơn 25%, ném nhanh hơn 25%, mỗi lượt ném ba tảng đá tỏa hình quạt và hút máu lên 50%. Hồi chiêu chỉ bắt đầu khi hết cơn giận.' },
      { id: 'sonthan', look: 'stGod', name: 'Sơn Thần Giáng Lâm', cd: 50, do: 'transform', dur: 13, size: 1.4, ccResist: 0.25, towerMul: 0.25, invuln: true, cdAfter: true,
        sntLand: { cast: 14, short: 2.5, flight: 1, radius: 4, dmg: 527, fx: { stun: 1 } },
        weapon: { name: 'Đá Thần', cd: 0.9, dmg: 225, speed: 20, range: 15, r: 0.6, splash: 2.6, splashHit: true, pen: 1, fx: { lostHp: 0.03, slow: 0.5, slowDur: 1, slowDecay: true }, vis: 'shell' },
        onEnd: { id: 'giapnui', name: 'Giáp Núi', do: 'buff', dur: 1, armor: 0.25, sntStone: 1 }, icon: 'leap',
        desc: 'Biến mất 1 giây rồi giáng xuống trước chỗ con trỏ 2,5 m (xa nhất 14 m) thành Sơn Thần: 527 sát thương vòng 4 m, choáng 1 giây. Sơn Thần to lớn đứng 12 giây, chỉ chịu 1/4 thời gian khống chế, ném đá thần nổ vòng 2,6 m (225, xuyên giáp, làm chậm 50% nhạt dần) nhưng đánh công trình yếu đi 75%. Hết giờ thì hóa đá 1 giây, giáp dày thêm. Hồi chiêu chỉ bắt đầu khi hết Sơn Thần.' },
    ],
  },
  // Star Lord: kit ported from the owner's earlier game, clip BV1Kp4y1b7i6 p18 "15.飞翼" (tooltips at 0.5-5.5 s, AUDIT-a.md). Attack = one
  // Song Thương bolt (150, the passive's faster, harder bullet folded in): every third hit 150% -> 225, Tật Tốc Triệt Thoái 122% -> 183,
  // Cân Tung Đạo Đạn 60% -> 90 a missile, Lôi Xạ Đại Pháo 445% -> 668. Cooldowns 8 / 6 / 25 s in the clip -> 10 / 8 / 45. The gun fires
  // every 0.48 s so the third-hit bonus and the missiles keep the old damage per second. No MP. G5 (sim.js "kit-remake K4"): the
  // third-hit bonus, the missile chance, the backward dash, the homing volley.
  enbac: {
    name: 'Star Lord', role: 'Xung kích', roleKey: 'assault', price: 1700, tint: 0x8a96a8,
    blurb: 'Song thương bắn nhanh, phát thứ ba liền vào một mục tiêu nổ thêm, thỉnh thoảng phóng kèm tên lửa đuổi. Vừa bắn vừa lùi, khóa mục tiêu phóng bốn tên lửa, tụ lực bắn pháo laser.',
    hp: 2450, speed: 6.8, radius: 0.8,
    armor: 0.04, accel: 1.3, turn: 14, towerMul: 1.0,
    passive: { do: 'gunner', name: 'Tật Tốc', look: 'ebMark', nth: 3, bonus: 225, chance: 0.25,
      missile: { dmg: 90, speed: 22, range: 16, r: 0.24, vis: 'rocket', turn: 5, src: 'cantung' },
      desc: 'Đạn bay nhanh. Cứ phát thứ ba liền nhau trúng cùng một mục tiêu thì gây thêm 225 sát thương. Mỗi phát bắn có 25% cơ hội phóng kèm một tên lửa đuổi 90 sát thương vào kẻ địch gần hướng ngắm.' },
    weapon: { name: 'Song Thương', cd: 0.48, dmg: 150, speed: 68, range: 13, spread: 0.04, r: 0.2, alt: 0.4, vis: 'bullet' },
    skills: [
      { id: 'triethoai', look: 'ebRetreat', name: 'Tật Tốc Triệt Thoái', cd: 10, do: 'dash', back: true, dist: 5, speed: 30, dmg: 0,
        onStart: { volley: { n: 1, dmg: 183, speed: 60, range: 14, r: 0.3, slow: 0.5, slowDur: 2, vis: 'rail' } }, icon: 'recoil',
        desc: 'Bắn một phát theo hướng ngắm, 183 sát thương và làm chậm 50% trong 2 giây, đồng thời lùi nhanh 5 m về phía sau.' },
      { id: 'cantung', look: 'ebMissile', name: 'Cân Tung Đạo Đạn', cd: 8, do: 'volley', n: 4, fan: 0.5, dmg: 90, speed: 22, range: 18, r: 0.24, vis: 'rocket', home: { cast: 16, pick: 4, turn: 5 }, icon: 'rocket',
        desc: 'Khóa kẻ địch gần con trỏ nhất rồi phóng bốn tên lửa đuổi theo nó, mỗi quả 90 sát thương. Không có ai thì tên lửa bay thẳng.' },
      { id: 'loixa', look: 'ebCannon', name: 'Lôi Xạ Đại Pháo', cd: 45, do: 'beam', windup: 0.5, range: 18, width: 1.6, dmg: 668, icon: 'beam',
        desc: 'Đứng tụ lực 0,5 giây rồi bắn pháo laser dài 18 m, 668 sát thương mọi kẻ địch trên đường.' },
    ],
  },
  boica: {
    name: 'Sniper', role: 'Bắn tỉa', roleKey: 'sniper', price: 1800, tint: 0x2f7fa6,
    blurb: 'Nín thở đứng yên để mỗi phát bắn thêm mạnh. Đạn xuyên dài, bẫy cảnh giới lộ diện, khóa mục tiêu rồi bắn tia chí mạng.',
    hp: 1700, speed: 5.9, radius: 0.76,
    armor: 0, accel: 1.0, turn: 10, towerMul: 0.4,
    passive: { do: 'ramp', name: 'Nín Thở', desc: 'Đứng yên mỗi 0,4 giây thêm 8% sát thương đạn, tối đa 5 lần. Di chuyển là mất hết.', on: 'still', stat: 'dmg', step: 0.08, max: 5, every: 0.4, reset: 'move' },
    weapon: { name: 'Súng Lặn', cd: 1.4, dmg: 330, speed: 62, range: 22, r: 0.2, vis: 'rail' },
    skills: [
      { id: 'danxuyen', look: 'bcDive', name: 'Đạn Xuyên Dài', cd: 10, do: 'volley', n: 1, dmg: 560, speed: 60, range: 27, r: 0.22, pierce: true, vis: 'sabot', icon: 'pierce',
        desc: 'Bắn một viên đạn xuyên giáp tầm 27 m, xuyên qua mọi kẻ địch trên đường.' },
      { id: 'bancanhgioi', look: 'bcEye', name: 'Bẫy Cảnh Giới', cd: 12, do: 'mine', cast: 9, trigger: 2.4, blast: 3, dmg: 120, stun: 0, arm: 0.6, life: 30, fx: { slow: 0.5, slowDur: 2, reveal: 5 }, icon: 'mine',
        desc: 'Đặt một quả mìn cảnh giới: kẻ giẫm phải bị chậm 50% trong 2 giây và bị lộ diện 5 giây.' },
      { id: 'khoamuctieu', look: 'bcLock', name: 'Khóa Mục Tiêu', cd: 55, do: 'beam', windup: 1.1, range: 34, width: 0.6, dmg: 1800, track: { cast: 32, pick: 6 }, icon: 'beam',
        desc: 'Khóa kẻ địch ở con trỏ, lấy đà 1,1 giây rồi bắn tia 1800 sát thương bám theo mục tiêu.' },
    ],
  },
  // Apocalypse: ported from the owner's earlier game (clip BV1Kp4y1b7i6 p55 "52.天启骑士" Thiên Khải Kỵ Sĩ, tooltips in
  // ~/handoff/dtt-ref/kits/AUDIT-a.md). Attack = 150 (lubo, moclan); the passive's +50% shell damage and speed is folded into the
  // weapon (225, speed 42). Đạn Vô Hư Phát 160% -> 240 a shell, at most 250% -> 375 on one foe (perTarget 2, sameDecay 0.5625);
  // Chấn Đãng Oanh Kích 150% -> 225; Phi Đạn Bạo Phá 203% -> 305, growing with the distance flown to 518% -> 777 (x2.55 after 20 m).
  // Cooldowns 8 / 6 / 25 s in the clip -> 10 / 8 / 45. Rapid fire after a cast = mods.onCast self.shots (G3); the low-hp cleanse and
  // heal = mods.save (G2). Kit-remake G5 fields (sim.js block "kit-remake G5 Apocalypse"): passive bhEvery (one free burst every
  // 3 s) and save bhHot (4% of max hp a second for 5 s after the save).
  bohung: {
    name: 'Apocalypse', role: 'Đấu sĩ', roleKey: 'bruiser', price: 1700, tint: 0x3c3f8f,
    blurb: 'Kỵ sĩ Thiên Khải: pháo nặng bay nhanh, sau mỗi chiêu hai phát kế tiếp bắn liên thanh. Rải năm quả pháo hình quạt, nện sóng chấn động trước mặt, phóng tên lửa xuyên tường càng bay xa càng đau.',
    hp: 2750, speed: 5.6, radius: 0.92,
    armor: 0.12, accel: 1.0, turn: 10, towerMul: 1.3,
    passive: { do: 'trait', name: 'Tốc Xạ', bhEvery: 3, bhPatch: { n: 2, fan: 0.07 },
      mods: { onCast: { dur: 3, rapid: 1.5, shots: 2, patch: { n: 2, fan: 0.07 }, shotsFor: 4 },
        save: { below: 0.5, icd: 15, cleanse: true, heal: 0.1, bhHot: { frac: 0.04, dur: 5 } } },
      desc: 'Sau mỗi chiêu, hai phát pháo kế tiếp bắn liên thanh hai quả và tốc bắn tăng 50%; ngoài ra cứ 3 giây có một phát liên thanh. Máu tụt dưới 50%: giải mọi hiệu ứng xấu, hồi ngay 10% máu tối đa rồi 4% mỗi giây trong 5 giây (15 giây một lần).' },
    weapon: { name: 'Pháo Thiên Khải', cd: 0.75, dmg: 225, speed: 42, range: 11, r: 0.28, vis: 'slug' },
    skills: [
      { id: 'danvohu', look: 'bhSpread', name: 'Đạn Vô Hư Phát', cd: 10, do: 'volley', n: 5, fan: 0.12, dmg: 240, speed: 34, range: 13, r: 0.3, vis: 'shell',
        fx: { slow: 0.5, slowDur: 2 }, perTarget: 2, sameDecay: 0.5625,
        then: { id: 'danvohuK', look: 'bhSpread', do: 'nova', windup: 0, radius: 4, arc: 0.6, dmg: 0, knock: 2 }, icon: 'shell',
        desc: 'Hất lùi kẻ địch trong hình quạt 4 m trước mặt và bắn năm quả pháo tỏa hình quạt (xa 13 m): mỗi quả 240 sát thương, chậm 50% trong 2 giây. Một kẻ địch chịu tối đa 375.' },
      { id: 'chandang', look: 'bhQuake', name: 'Chấn Đãng Oanh Kích', cd: 8, do: 'beam', windup: 0.15, range: 6, width: 3, dmg: 225,
        self: { on: 'cast', haste: 1.5, dur: 2 }, icon: 'quake',
        desc: 'Nện sóng chấn động vào dải 6 x 3 m trước mặt, gây 225 sát thương; bạn chạy nhanh hơn 50% trong 2 giây.' },
      { id: 'phidan', look: 'bhMissile', name: 'Phi Đạn Bạo Phá', cd: 45, do: 'volley', n: 1, dmg: 305, speed: 24, range: 28, r: 0.45, vis: 'rocket',
        thruWalls: true, splash: 2.5, splashHit: true, fx: { stun: 0.5 }, far: { ramp: { per: 0.0775, max: 2.55 } }, icon: 'rocket',
        desc: 'Phóng tên lửa bay xuyên tường và vật cản, nổ ở kẻ địch đầu tiên: 305 sát thương vòng 2,5 m và choáng 0,5 giây. Càng bay xa càng đau, tới 777 khi bay hết 20 m.' },
    ],
  },
  // Zoro: kit ported from the owner's earlier game, clip BV1Kp4y1b7i6 p63 "60.海贼猎人" (tooltips f005-f055, AUDIT-a.md). Attack = one Tam
  // Đao wave (150, was three of 66; every 0.5 s): the parry wave 150% -> 225, Cư Hợp Trảm 207% -> 311, Tam Thiên Thế Giới 322% -> 483 + 5%
  // of the lost hp, the marked-hit heal 50% -> 75 (2.83% of max hp). Cooldowns 10 / 10 / 10 s in the clip -> 12 / 12 / 18 (the ult keeps
  // its 3 charges, 1.5 s apart). No MP. Not ported: Tam Thiên Thế Giới blocked during the parry. G5 (sim.js "kit-remake G5 cakiem"):
  // the parry window, the marked foe's damage cut, the Cư Hợp Trảm reset when a marked foe dies. Balance (sim-test 15e: the clip's numbers
  // made him K/D 6): one wave per attack, not piercing; the marked-hit cut 0.25 s (clip 0.5); Cư Hợp Trảm 260 (clip 311), 14 s, +30% speed
  // and fire rate, the scattered waves 100 each; parry waves at most one per 0.3 s; Tam Thiên Thế Giới 420 (clip 483), recharging in 28 s.
  cakiem: {
    name: 'Zoro', role: 'Đấu sĩ', roleKey: 'bruiser', price: 1600, tint: 0x2e6b4f,
    blurb: 'Chiêu nào trúng cũng khắc dấu Quỷ Trảm: kẻ mang dấu đánh bạn yếu đi, chém thường vào nó là hồi máu và giảm hồi chiêu. Tay không đỡ đạn bắn trả sóng kiếm, cư hợp trảm xuyên qua địch, ba lần Tam Thiên Thế Giới.',
    hp: 2650, speed: 6.4, radius: 0.86,
    armor: 0.08, accel: 1.2, turn: 13, towerMul: 1.3,
    passive: { do: 'trait', name: 'Quỷ Trảm', ckKey: 'oni', ckDr: 0.25, ckReset: 's2',
      desc: 'Chiêu trúng địch khắc dấu Quỷ Trảm 5 giây. Kẻ mang dấu gây ít hơn 25% sát thương lên bạn; nó chết thì Cư Hợp Trảm hồi chiêu ngay. Chém thường trúng kẻ mang dấu thì làm mới dấu, hồi 75 máu và mọi hồi chiêu giảm 0,25 giây.' },
    weapon: { name: 'Tam Đao', cd: 0.5, dmg: 150, speed: 28, range: 7.5, r: 0.4, vis: 'wave', look: 'ckBlade',
      vsTag: { key: 'oni', healMax: 0.0283, cdCut: { slot: 'all', cut: 0.25 }, fx: { tag: { key: 'oni', dur: 5 } } } },
    skills: [
      { id: 'khongthu', look: 'ckParry', name: 'Không Thủ Bạch Nhận', cd: 12, do: 'buff', dur: 2, towerMul: 0,
        ckParry: { dmg: 225, speed: 32, range: 11, r: 0.55, pierce: true, vis: 'wave', icd: 0.3, fx: { tag: { key: 'oni', dur: 5 } } }, icon: 'shield',
        desc: 'Trong 2 giây đỡ mọi viên đạn bắn tới (không mất máu); mỗi viên đỡ được bắn trả một sóng kiếm theo hướng ngắm (nhiều nhất một sóng mỗi 0,3 giây), xuyên qua địch, 225 sát thương. Bị khống chế thì ngừng đỡ. Sóng kiếm không phá công trình.' },
      { id: 'cuhop', look: 'ckIai', name: 'Cư Hợp Trảm', cd: 14, do: 'dash', dist: 8, speed: 60, dmg: 260, fx: { tag: { key: 'oni', dur: 5 } },
        self: { on: 'cast', dur: 2, haste: 1.3, rapid: 1.3, shots: 3, shotsFor: 4, patch: { n: 3, fan: 0.22, dmg: 100 } }, icon: 'dash',
        desc: 'Lướt tức thì 8 m theo hướng ngắm, chém mọi kẻ địch trên đường 260 sát thương. Ba lần chém thường kế tiếp tỏa ba sóng, mỗi sóng 100, và 2 giây chạy, chém nhanh hơn 30%.' },
      { id: 'tamthien', look: 'ckWorld', name: 'Tam Thiên Thế Giới', cd: 28, uses: { n: 3, gap: 1.5 }, do: 'volley', n: 1, dmg: 420, speed: 30, range: 14, r: 0.6, pierce: true, vis: 'wave', towerMul: 0.5,
        fx: { lostHp: 0.05, slow: 0.5, slowDur: 2, slowDecay: true, tag: { key: 'oni', dur: 5 } }, icon: 'pierce',
        desc: 'Chém một sóng kiếm theo hướng ngắm, xuyên qua mọi kẻ địch: 420 sát thương cộng 5% máu đã mất (sát thương chuẩn), chậm 50% nhạt dần trong 2 giây. Giữ được 3 lần dùng, cách nhau 1,5 giây. Công trình chịu một nửa.' },
    ],
  },
  // Gilgamesh: ported from the owner's earlier game (clip BV1Kp4y1b7i6 p74 "71.英雄王", tooltips at 0-5.5 s, audit AUDIT-b.md).
  // Attack = one Bảo Khí (150, was 175 per 0.8 s, same dps): Quai Ly 60% -> 90 per 0.3 s, Vương Chi Tài Bảo 72% -> 108 per weapon.
  // Cooldowns 8 / 8 / 25 s in the clip -> 10 / 10 / 45. Phược Thần Chi Tỏa's shield is 20% of max hp (selfShield), its 100% slow
  // fades (slowDecay). Quai Ly's ten blows are ten strikes on one spot (each carries the skill tag, so they feed the passive).
  // The ult winds up 0.3 s unstoppable (ggWind, kit-remake K14), then 20 bursts of 2 weapons, 0.2 s apart, walking at +40%.
  gilgamesh: {
    name: 'Gilgamesh', role: 'Trụ', roleKey: 'tank', price: 1900, tint: 0xd9b23a,
    blurb: 'Vua Anh Hùng: năm đòn chiêu liền trên một kẻ thì xích trời trói lại. Khoác khiên xích trời chạy nhanh đánh mạnh, cắm Quai Ly Kiếm xé một vùng, mở Vương Chi Tài Bảo xả bốn mươi binh khí.',
    hp: 2900, speed: 5.3, radius: 0.96,
    armor: 0.15, accel: 0.8, turn: 9, towerMul: 1.4,
    passive: { do: 'stacks', name: 'Phược Thần Chi Tỏa', look: 'ggBind', n: 5, dur: 2, on: 'skill', icd: 3, fx: { lostHp: 0.15, slow: 1, slowDur: 1.5, slowDecay: true },
      desc: 'Trong 2 giây gây 5 đòn chiêu lên cùng một kẻ địch thì xích trời trói nó: thêm sát thương chuẩn bằng 15% máu nó đã mất, chậm 100% giảm dần trong 1,5 giây. Mỗi kẻ 3 giây mới bị trói lại một lần.' },
    weapon: { name: 'Bảo Khí', cd: 0.69, dmg: 150, speed: 30, range: 12, r: 0.3, vis: 'sabot' },
    skills: [
      { id: 'thienchitoa', look: 'ggVault', name: 'Thiên Chi Tỏa', cd: 10, do: 'transform', dur: 4, dmg: 1.15, haste: 1.4, selfShield: { frac: 0.2, dur: 4 }, icon: 'dome',
        desc: 'Gọi Thiên Chi Tỏa quấn quanh mình 4 giây: khiên bằng 20% máu tối đa, sát thương +15%, chạy nhanh thêm 40%.' },
      { id: 'quaily', look: 'ggEa', name: 'Thiên Địa Quai Ly', cd: 10, do: 'barrage', n: 10, radius: 1.75, blast: 3.5, dmg: 90, delay: 0.3, span: 3, cast: 12, fx: { slow: 0.3, slowDur: 0.5 }, towerMul: 0.5, icon: 'barrage',
        desc: 'Cắm Quai Ly Kiếm ở con trỏ (xa nhất 12 m), xé vùng 3,5 m suốt 3 giây: mỗi 0,3 giây 90 sát thương, kẻ trong vùng chậm 30%. Lên trụ chỉ còn một nửa.' },
      { id: 'vuongchitaibao', look: 'ggTreasury', name: 'Vương Chi Tài Bảo', cd: 45, do: 'volley', n: 2, fan: 0.14, dmg: 108, speed: 34, range: 14, r: 0.32, vis: 'sabot', burst: { n: 20, gap: 0.2 }, move: 1, haste: 1.4, hasteDur: 4,
        ggWind: 0.3, unstoppable: 0.3, icon: 'storm',
        desc: 'Tụ lực 0,3 giây (không bị khống chế) rồi mở kho báu: 40 binh khí bắn liên tục 4 giây theo hướng ngắm, mỗi món 108 sát thương. Trong lúc đó vẫn chạy được, nhanh thêm 40%, nhưng không bắn thường, không dùng chiêu khác.' },
    ],
  },
  // Doctor Strange: kit ported from the owner's earlier game, clip BV1Kp4y1b7i6 p66 "63.至尊法师" (tooltips f005-f040, AUDIT-a.md). Attack = one
  // Ấn Phép bolt (150, was 92 every 0.3 s; now every 0.5 s, same 300 dps): Thời Không Phóng Trục 144% -> 216, the marked shot +100% and a
  // heal of 150% (225, 10% of max hp), the ward burst 25% -> 38 true, Thời Không Nữu Khúc 163% -> 245 on arrival and 50% -> 75 a pulse,
  // Ma Pháp Lĩnh Vực 203% -> 305 and 167% -> 250 when he draws on it. Cooldowns 6 / 8 / 20 s in the clip -> 8 / 10 / 40. No MP. The clone
  // "can be moved by skills" is not ported (decoys are still). G5 (sim.js "kit-remake G5 buomdem"): the ward shield on skill hits and its
  // burst, reveal on cast, the silence immunity and longer cc, a clone with his current hp, the pulses after the warp, the domain.
  // Balance (ttk --check: lv5 vs a lone Đom Đóm took 12 s, limit 10): Ấn Phép every 0.45 s, the pulses 100 (clip 75).
  buomdem: {
    name: 'Doctor Strange', role: 'Ảo thuật', roleKey: 'trickster', price: 1700, tint: 0x5a2a8a, hover: true,
    blurb: 'Chiêu trúng địch là khoác khiên thời không, khiên tan thì nổ làm chậm. Đày kẻ địch sang chiều không gian khác, mở cổng dịch chuyển để lại phân thân, mở lĩnh vực ma pháp rồi bước vào hút sức mạnh.',
    hp: 2350, speed: 6.6, radius: 0.78,
    armor: 0.03, accel: 1.4, turn: 15, towerMul: 1.0,
    passive: { do: 'trait', name: 'Chí Tôn Pháp Sư',
      bdWard: { frac: 0.1, dur: 2, burst: { radius: 3, dmg: 38, slow: 0.25, max: 0.75, slowDur: 1.5 } }, bdReveal: { r: 7, dur: 2 }, bdCc: { mul: 1.25 },
      desc: 'Mỗi lần chiêu trúng địch khoác khiên bằng 10% máu tối đa trong 2 giây; khiên hết giờ, vỡ hay được làm mới thì nổ quanh mình 38 sát thương chuẩn và làm chậm 25% trong 1,5 giây (cộng dồn tới 75%). Mỗi chiêu dùng ra làm lộ diện kẻ địch trong 7 m suốt 2 giây. Miễn câm lặng, nhưng khống chế khác lên bạn kéo dài thêm 25%.' },
    weapon: { name: 'Ấn Phép', cd: 0.45, dmg: 150, speed: 32, range: 13, r: 0.24, vis: 'pulse', vsTag: { key: 'bdq', mul: 2, healMax: 0.1, consume: true } },
    skills: [
      { id: 'phongtruc', look: 'bdBanish', name: 'Thời Không Phóng Trục', cd: 8, do: 'volley', n: 1, dmg: 216, speed: 24, range: 13, r: 0.45, vis: 'pulse', icon: 'pierce',
        fx: { banish: 1, slow: 0.5, slowDur: 3, tag: { key: 'bdq', dur: 5 } },
        desc: 'Bắn một quả cầu năng lượng: kẻ trúng chịu 216 sát thương và bị đày sang chiều không gian khác 1 giây (không bị gì chạm tới), trở về thì chậm 50% trong 2 giây. Phát bắn thường kế tiếp của bạn vào nó gây gấp đôi và hồi cho bạn 10% máu tối đa.' },
      { id: 'thoikhong', look: 'bdPortal', name: 'Thời Không Nữu Khúc', cd: 10, do: 'warp', dist: 9, leave: { hp: 'cur', dur: 5, blast: 0.6, dmg: 0 }, land: { radius: 3, dmg: 245 },
        bdPulse: { n: 4, every: 0.75, radius: 3, dmg: 100 },
        next: { window: 5, row: { id: 'truyentong', look: 'bdPortal', name: 'Thời Không Truyền Tống', do: 'warp', dist: 30, to: 'decoy', take: true } }, icon: 'warp',
        desc: 'Mở cổng dịch chuyển tới con trỏ (xa nhất 9 m), để lại một phân thân mang lượng máu hiện tại ở chỗ cũ. Tới nơi nổ 245 sát thương quanh mình, rồi 3 giây sau cứ 0,75 giây gây thêm 100. Trong 5 giây bấm lại để quay về chỗ phân thân (phân thân bị phá thì không về được).' },
      { id: 'maphap', look: 'bdRealm', name: 'Ma Pháp Lĩnh Vực', cd: 40, do: 'barrage', n: 1, radius: 0, blast: 4.5, dmg: 305, delay: 1, span: 0, cast: 12, fx: { slow: 0.5, slowDur: 2 },
        linger: { radius: 4.5, dur: 4, vis: 'bdRealm' }, bdDomain: { dmg: 250, radius: 3.5, fx: { silence: 2 }, amp: 2, of: 'thoikhong' }, icon: 'blizzard',
        desc: 'Mở lĩnh vực ma pháp ở con trỏ: sau 1 giây kẻ địch trong vùng 4,5 m chịu 305 sát thương và chậm 50% trong 2 giây. Lĩnh vực còn 4 giây: lần đầu bạn bước vào thì hút sức mạnh của nó, nổ quanh mình 250 sát thương và câm lặng địch 2 giây. Địch trong lĩnh vực chịu gấp đôi sát thương từ Thời Không Nữu Khúc.' },
    ],
  },
  // Lạc Long Quân = 敖广 Ngao Quảng: ported from the owner's earlier game (clip BV1Kp4y1b7i6 p71 "68.敖广", tooltips in
  // ~/handoff/dtt-ref/kits/AUDIT-b.md; the first character of skill 1's name is blurred, read as 雷龙之息). Attack = one Thủy Pháo shell (180,
  // kept): Lôi Long Chi Tức 204% -> 367, the water shield's burst 231% -> 416, Cuồng Long Xung Phong 123% -> 221 then 157% -> 283, Bào Hao
  // Nộ Đào 216% -> 389 (at 4 stacks 368% -> 662, then 389 again). Shields 15% of max hp. Cooldowns 6 / 8 / 30 s in the clip -> 8 / 10 / 55.
  // The ult's +50% attack speed and basic damage live in its weapon row (270, rapid 1.5), not in a damage factor that would also lift skills.
  // Kit-remake G5 fields (sim.js block "kit lane k16"): leap aoqNear (jumps on the nearest enemy, tanks first), transform aoqHeal (each
  // water shell that hits heals that share of the lost hp and adds a stack `stack.on: 'aoqShot'`), second stage aoqBig (at that many
  // stacks the recast is the bigger row).
  laclong: {
    name: 'Lạc Long Quân', role: 'Trụ', roleKey: 'tank', price: 1800, tint: 0x1f6f8f,
    blurb: 'Long vương mang trọng kiếm: thủy thuẫn tự mọc lại, vỡ thì nổ làm chậm. Nện kẻ gần nhất, lao hai đoạn kéo theo địch, rồi gọi thủy long 8 giây bắn thủy đạn lớn và nện sóng dữ.',
    hp: 2800, speed: 5.4, radius: 0.96,
    armor: 0.12, accel: 0.8, turn: 9, towerMul: 1.4,
    passive: { do: 'trait', name: 'Thủy Long Thuẫn', mods: { reShield: { frac: 0.15, regrow: 15, burst: { radius: 3.5, dmg: 416, slow: 0.5, slowDur: 2 } } },
      desc: 'Khoác thủy thuẫn hút 15% máu tối đa, vỡ thì 15 giây sau mọc lại. Thuẫn vỡ thì nổ quanh mình: 416 sát thương, chậm 50% trong 2 giây.' },
    weapon: { name: 'Thủy Pháo', cd: 0.7, dmg: 180, speed: 26, range: 12, splash: 1.8, knock: 1.5, r: 0.32, vis: 'shell' },
    skills: [
      { id: 'loilong', look: 'aoqSlam', name: 'Lôi Long Chi Tức', cd: 8, do: 'leap', to: 'foe', aoqNear: true, cast: 7, pick: 7, flight: 0.25, radius: 3.5, dmg: 367,
        fx: { slow: 0.5, slowDur: 2, slowFire: { mul: 0.5, dur: 2 } }, selfShield: { frac: 0.15, dur: 2 }, icon: 'quake',
        desc: 'Nhảy lên kẻ địch gần nhất trong 7 m (ưu tiên tank), nện trọng kiếm: 367 sát thương lên kẻ địch trong 3,5 m, chúng chạy và bắn chậm 50% trong 2 giây. Bạn nhận khiên 15% máu tối đa trong 2 giây.' },
      { id: 'cuonglong', look: 'aoqCharge', name: 'Cuồng Long Xung Phong', cd: 10, do: 'dash', dist: 6, speed: 30, dmg: 221, drag: true,
        next: { window: 2, onHit: true, row: { id: 'dulong', look: 'aoqCharge', name: 'Du Long Xuất Kích', do: 'dash', dist: 6, speed: 30, dmg: 283, drag: true, stun: 1 } }, icon: 'dash',
        desc: 'Lao 6 m, vung kiếm 221 sát thương, kéo theo kẻ bị va. Trúng địch thì trong 2 giây bấm lại để Du Long Xuất Kích: lao tiếp 6 m, 283 sát thương, kéo theo rồi choáng 1 giây.' },
      { id: 'giaolong', look: 'aoqDragon', name: 'Giao Long Xuất Hải', cd: 55, do: 'transform', dur: 8, armor: 0.25, rapid: 1.5, cdAfter: true,
        weapon: { name: 'Thủy Đạn', dmg: 270, range: 13, splash: 2.4, r: 0.5, slow: 0.3, slowDur: 1, vis: 'wave' }, aoqHeal: 0.05, stack: { on: 'aoqShot', max: 5, dmg: 0.05, armor: 0.03 },
        next: { window: 8, row: { id: 'baohao', look: 'aoqWave', name: 'Bào Hao Nộ Đào', do: 'barrage', n: 1, radius: 0, blast: 3.5, dmg: 389, delay: 1, span: 0, cast: 13, fx: { slow: 0.4, slowDur: 2 },
          aoqBig: { at: 4, row: { id: 'baohao4', look: 'aoqWave', name: 'Bào Hao Nộ Đào', do: 'barrage', n: 1, radius: 0, blast: 3.5, dmg: 662, delay: 1, span: 0, cast: 13, fx: { slow: 0.6, slowDur: 2 },
            then: { id: 'baohao5', look: 'aoqWave', name: 'Bào Hao Nộ Đào', do: 'barrage', after: 0.5, n: 1, radius: 0, blast: 3.5, dmg: 389, delay: 1, span: 0, cast: 13, fx: { stun: 1 } } } } } }, icon: 'boost',
        desc: 'Gọi thủy long hộ thân 8 giây: nhận ít hơn 25% sát thương, bắn nhanh hơn 50%, thủy đạn lớn 270 bay 13 m, nổ lan và làm chậm 30%. Mỗi thủy đạn trúng hồi 5% máu đã mất và cho 1 lớp (tối đa 5): +5% sát thương, cứng hơn. Trong 8 giây bấm lại để Bào Hao Nộ Đào: 1 giây sau nện vùng 3,5 m ở con trỏ, 389, chậm 40%; có từ 4 lớp thì nhát đầu 662 chậm 60% và nện thêm nhát 389 choáng 1 giây. Hồi chiêu chỉ chạy sau khi dùng xong.' },
    ],
  },
  // Black Panther = 黑豹 Hắc Báo: ported from the owner's earlier game (clip BV1Kp4y1b7i6 p89 "86.黑豹", tooltips in ~/handoff/dtt-ref/kits/AUDIT-a.md).
  // Attack = one pull of Vuốt Rung (2 x 75 = 150; was 2 x 58 at 0.25 s, about the same dps): Nguyên Thủy 145% -> 218 and five bombs
  // 194% -> 291 each, Dã Tính 125% -> 188 then 165% -> 248, Vương Chi Thú Liệp 222% -> 333 x 6 and 350% -> 525 + 15% of the lost hp.
  // Cooldowns 6 / 8 / 25 s in the clip -> 8 / 10 / 45. The passive's +30% speed is in `speed`; units never collide in our sim.
  // Kit-remake G5 fields (sim.js block "kit-remake G5 Black Panther"): dash bgRe (a second charge at the unit the first one stopped on),
  // flurry bgLast (the last cut's own dmg, knock and fx). The back-flip and the bombs are G3 `then` rows.
  baogam: {
    name: 'Black Panther', role: 'Thọc sườn', roleKey: 'flanker', price: 1600, tint: 0x23262e,
    blurb: 'Vua Wakanda: chạy nhanh, đi xuyên qua mọi mech. Vồ tới giữ chân rồi lộn ngược ném bom rung, lao hai lần liền kéo cả đám theo, rồi biến mất đi săn: bảy nhát vuốt lên kẻ địch quanh đó, nhát cuối đau nhất.',
    hp: 2350, speed: 7.1, radius: 0.78,
    armor: 0.06, accel: 1.5, turn: 16, towerMul: 1.0,
    passive: { do: 'trait', name: 'Vô Thị Va Chạm', desc: 'Chạy nhanh hơn 30% so với mech cùng vai trò và đi xuyên qua mọi mech.' },
    weapon: { name: 'Vuốt Rung', cd: 0.32, dmg: 75, n: 2, fan: 0.1, speed: 30, range: 7, r: 0.26, vis: 'pellet' },
    skills: [
      { id: 'nguyenthuy', look: 'bgPounce', name: 'Nguyên Thủy Cuồng Nộ', cd: 8, do: 'dash', dist: 7, speed: 34, dmg: 218, stop: true, fx: { root: 0.5 }, icon: 'dash',
        then: { id: 'nhaolon', look: 'bgFlip', name: 'Nhào Lộn', do: 'recoil', radius: 0, dmg: 0, dist: 4, speed: 22,
          then: { id: 'bomrung', look: 'bgBombs', name: 'Bom Rung', do: 'volley', n: 5, fan: 0.16, dmg: 291, speed: 24, range: 9, r: 0.32, fx: { slow: 0.5, slowDur: 2 }, vis: 'shell' } },
        desc: 'Vồ tới theo hướng ngắm (xa nhất 7 m): kẻ đầu tiên chạm phải chịu 218 sát thương và bị giữ chân 0,5 giây; rồi lộn ngược ra sau 4 m, vừa lộn vừa ném năm quả bom về phía con trỏ, mỗi quả 291 sát thương và làm chậm 50% trong 2 giây.' },
      { id: 'datinh', look: 'bgLunge', name: 'Dã Tính Huyết Tập', cd: 10, do: 'dash', dist: 7, speed: 34, dmg: 188, stop: true, icon: 'dash',
        bgRe: { id: 'huyettap', look: 'bgDrag', name: 'Huyết Tập', do: 'dash', dist: 6, speed: 34, dmg: 248, drag: true, r: 8 },
        desc: 'Lao theo hướng ngắm (xa nhất 7 m): kẻ đầu tiên chạm phải chịu 188 sát thương, rồi lao vào nó lần nữa 6 m, kéo theo mọi kẻ chạm phải, mỗi kẻ 248 sát thương. Kẻ đầu tiên đã gục thì lần lao thứ hai nhắm kẻ địch gần nhất (trong 8 m).' },
      { id: 'vuongchi', look: 'bgHunt', name: 'Vương Chi Thú Liệp', cd: 45, do: 'flurry', n: 7, range: 7, speed: 40, dmg: 333, invuln: true, icon: 'rage',
        fx: { antiheal: { mul: 0.5, dur: 3, shield: true } }, bgLast: { dmg: 525, knock: 3, fx: { lostHp: 0.15, antiheal: { mul: 0.5, dur: 3, shield: true } } },
        desc: 'Biến mất rồi vồ kẻ địch ở con trỏ (xa nhất 7 m) và những kẻ quanh đó, bảy nhát liền (không bị nhắm trúng): sáu nhát đầu 333, nhát cuối 525 cộng 15% máu đã mất của nó và hất văng. Kẻ trúng chỉ nhận một nửa máu hồi và khiên trong 3 giây.' },
    ],
  },
  // Razor = 电魂III Điện Hồn: ported from the owner's earlier game (clip BV1Kp4y1b7i6 p51 "48.电魂", tooltips in
  // ~/handoff/dtt-ref/kits/AUDIT-b.md). Attack = one Roi Điện lash (150; was 85 at 0.25 s, now 150 at 0.44 s, same dps): Lôi Vân Hãm
  // Tịnh 214% -> 321, Điện Từ Can Nhiễu 200% / 250% -> 300 / 375 (nova grow 1.25). Cooldowns 10 / 6 / 20 s in the clip -> 12 / 8 / 40.
  // Energy is kept (the kit is built on it): 200 max, +10 per 3 s, +5 per lash that hits; the channel drains 50 a second. "Confused
  // mechs deal 50% less physical damage" -> weaken 0.5 for the confusion (all damage). The orb's decaying +100% speed for 2 s -> x1.5
  // for 2 s. Kit-remake G5 fields (sim.js block "kit-remake G5 Razor"): passive ldOrb (every press drops a lightning orb), transform
  // ldChan (the channelled heal).
  luondien: {
    name: 'Razor', role: 'Trụ', roleKey: 'tank', price: 1700, tint: 0x1d4f6b,
    blurb: 'Điện hồn đỡ đòn: mỗi lần dùng chiêu thả một cầu sét, ai phe mình nhặt cũng chạy nhanh và nạp điện cho bạn, địch nhặt thì bị hỗn loạn. Đứng dẫn điện đổi năng lượng thành máu, gài bẫy mây sét giữ chân, phát sóng điện từ hai nhịp làm cả nhóm địch hỗn loạn.',
    hp: 2900, speed: 6.0, radius: 0.8,
    armor: 0.12, accel: 1.2, turn: 13, towerMul: 1.0,
    energy: { max: 200, regen: 10 / 3, start: 200, gain: { weapon: 5 } },
    passive: { do: 'trait', name: 'Điện Năng Chuyển Hoán', look: 'ldOrbs',
      ldOrb: { dist: 2.5, r: 1.1, dur: 8, arm: 0.4, max: 4, heal: 0.05, cdr: 0.05, en: 10, amp: 0.05, ampMax: 10, ampDur: 3, haste: 1.5, hasteDur: 2, confuse: 1 },
      desc: 'Mỗi lần dùng chiêu, một cầu sét rơi gần bạn. Đồng đội hay chính bạn nhặt thì chạy nhanh 50% trong 2 giây; kẻ địch nhặt thì bị hỗn loạn 1 giây. Cầu nào được nhặt, bạn hồi 5% máu, mọi chiêu giảm 5% hồi chiêu, thêm 10 năng lượng và +5% sát thương chiêu trong 3 giây (tối đa 10 lớp). Năng lượng tối đa 200, hồi 10 mỗi 3 giây, mỗi đòn roi trúng thêm 5.' },
    weapon: { name: 'Roi Điện', cd: 0.44, dmg: 150, speed: 36, range: 12, r: 0.22, vis: 'bullet' },
    skills: [
      { id: 'diennang', look: 'ldChannel', name: 'Điện Năng Chuyển Hoán', cd: 12, do: 'transform', dur: 4, ldChan: { lost: 0.1, guard: 0.5 }, en: { cost: 10, drain: 50 }, icon: 'shield',
        desc: 'Đứng dẫn điện đổi năng lượng thành máu (tốn 50 năng lượng mỗi giây, tối đa 4 giây): mỗi giây hồi 10% máu đã mất, chịu ít hơn 50% sát thương chiêu. Tự di chuyển hoặc bị khống chế thì ngắt.' },
      { id: 'loivan', look: 'ldCloud', name: 'Lôi Vân Hãm Tịnh', cd: 8, do: 'barrage', n: 1, cast: 12, radius: 0, blast: 2.6, delay: 0.45, span: 0, dmg: 321, fx: { root: 1 }, uses: { n: 2, gap: 3 }, icon: 'storm',
        desc: 'Ném bẫy mây sét tới con trỏ (xa nhất 12 m): 321 sát thương vòng 2,6 m và giữ chân 1 giây. Tích 2 lượt, mỗi lượt cách nhau 3 giây.' },
      { id: 'dientu', look: 'ldPulse', name: 'Điện Từ Can Nhiễu', cd: 40, do: 'nova', windup: 0.1, repeat: 2, gap: 1, move: 0.6, radius: 5.5, dmg: 300, grow: 1.25, fx: { confuse: 1.5, weaken: { mul: 0.5, dur: 1.5 } }, icon: 'quake',
        desc: 'Phát sóng điện từ quanh mình (5,5 m): 300 sát thương, kẻ trúng bị hỗn loạn 1,5 giây và gây ít hơn 50% sát thương; 1 giây sau sóng đánh lần nữa 375 và hỗn loạn thêm 1,5 giây.' },
    ],
  },
  // Saitama: ported from the owner's earlier game (clip BV1Kp4y1b7i6 p77 "74.琦玉", tooltips in ~/handoff/dtt-ref/kits/AUDIT-c.md).
  // Attack = one Đấm Thẳng blow (150, unchanged). Cooldowns 8 / 6 / 15 s in the clip -> 10 / 8 / 30. MP dropped.
  // Passive Nhận Chân (认真): a meter of 10 stacks, +1 per enemy hit and +1 per 5% of max hp lost, each +5% damage; full = Serious
  // Mode for 3 s (heals 10% of the lost hp per s, guard 0.5, cc immune, ignores 50% armour), then the stacks clear.
  // Q 认真掀桌 175% -> 263 in a fan, yank to the cursor point, slow 75% decaying over 2 s. E 认真头槌 225% -> 338 + stun 1 (the ground
  // dash is a low wound-up leap). Ult 认真殴打 316% -> 474, x2 at a full 3 s charge (moclan's charge pattern), a fan that knocks back;
  // a mech slammed into a wall loses 50% of its lost hp more (true) and is stunned 1 s; guard 0.5 + cc immune while charging; no
  // tower damage. Kit-remake G5 fields (sim.js block "kit-remake G5 Saitama"): meter hurtPer / perStack / spend 'mode', beam fan, slam lostHp.
  tegiac: {
    name: 'Saitama', role: 'Đấu sĩ', roleKey: 'bruiser', price: 1700, tint: 0xe8e2d0,
    blurb: 'Đánh trúng hay bị đánh đều thêm một nấc Nghiêm Túc; đủ mười nấc là vào Chế Độ Nghiêm Túc 3 giây. Lật bàn kéo địch về một chỗ, húc đầu làm choáng, rồi một cú đấm nghiêm túc tích lực.',
    hp: 3000, speed: 6.0, radius: 0.92,
    armor: 0.1, accel: 1.1, turn: 12, towerMul: 1.5,
    passive: { do: 'meter', name: 'Nhận Chân', look: 'smMode', desc: 'Mỗi đòn trúng địch, và mỗi 5% máu tối đa bị mất, thêm một nấc Nghiêm Túc (tối đa 10), mỗi nấc tăng 5% sát thương. Đủ 10 nấc thì vào Chế Độ Nghiêm Túc 3 giây: mỗi giây hồi 10% máu đã mất, giảm 50% sát thương nhận, miễn khống chế, bỏ qua 50% giáp địch; hết chế độ thì mất hết nấc.',
      max: 10, gain: { hit: 1, hurt: 1 }, hurtPer: 0.05, perStack: 0.05, spend: { kind: 'mode', dur: 3, regenLost: 0.1, guard: 0.5, pen: 0.5 } },
    weapon: { name: 'Đấm Thẳng', cd: 0.6, dmg: 150, speed: 28, range: 6, r: 0.45, knock: 1, vis: 'slug' },
    skills: [
      { id: 'hientrac', look: 'smFlip', name: 'Nhận Chân Hiên Trác', cd: 10, do: 'nova', windup: 0.35, move: 0.2, radius: 6.5, arc: 0.6, dmg: 263,
        fx: { yank: { dist: 4, to: 'point' }, slow: 0.75, slowDur: 2, slowDecay: true }, icon: 'quake',
        desc: 'Lấy đà 0,35 giây rồi lật nứt mặt đất hình quạt trước mặt (6,5 m): 263 sát thương, kéo kẻ trúng về phía con trỏ (tối đa 4 m) và làm chậm 75%, giảm dần về 0 trong 2 giây.' },
      { id: 'dauchuy', look: 'smHead', name: 'Nhận Chân Đầu Chùy', cd: 8, do: 'leap', windup: 0.3, move: 0, cast: 8, flight: 0.3, radius: 2.8, dmg: 338, stun: 1, icon: 'leap',
        desc: 'Gồng 0,3 giây rồi húc thẳng tới con trỏ (xa nhất 8 m): địch quanh chỗ tới (2,8 m) chịu 338 sát thương và choáng 1 giây.' },
      { id: 'auda', look: 'smPunch', name: 'Nhận Chân Ẩu Đả', cd: 30, do: 'beam', move: 0, guard: 0.5, fan: [0.45, 0.6], knock: 3, fx: { slam: { dmg: 0, stun: 1, lostHp: 0.5 } }, towerMul: 0,
        charge: { min: 0.3, max: 3, dmg: [474, 948], range: [7, 12], width: [6, 12] }, icon: 'beam',
        desc: 'Đứng tích lực tối đa 3 giây (giảm 50% sát thương nhận, miễn khống chế; bấm lần nữa để tung sớm) rồi đấm ra luồng chấn động hình quạt: 474 tới 948 sát thương và dài 7 tới 12 m theo thời gian tích, hất văng kẻ trúng; kẻ bị hất đập vào tường mất thêm 50% máu đã mất và choáng 1 giây. Không gây sát thương công trình.' },
    ],
  },
  quaset: {
    name: 'Sasuke', role: 'Thọc sườn', roleKey: 'flanker', price: 1600, tint: 0x2a2350,
    blurb: 'Hai chiêu khác nhau trúng liền nhau hai lần là phát phi tiêu kế tiếp nặng gấp hơn hai lần và choáng. Lôi thiết, ảnh hoán ra sau lưng, giáp hộ mệnh biến phi tiêu thành ba mũi lao.',
    hp: 2150, speed: 7.2, radius: 0.76,
    armor: 0.03, accel: 1.5, turn: 16, towerMul: 1.0,
    passive: { do: 'meter', name: 'Liên Thuật', desc: 'Mỗi lần một đòn trúng khác nguồn với đòn trúng trước nạp một nấc (phi tiêu thường rồi chiêu, hay ngược lại). Đủ 2 nấc thì phi tiêu kế tiếp gây gấp 2,2 lần sát thương và choáng 0,5 giây.',
      max: 2, gain: { distinct: 1 }, spend: { kind: 'shot', mul: 2.2, stun: 0.5 } },
    weapon: { name: 'Phi Tiêu Sét', cd: 0.24, dmg: 56, speed: 36, range: 13, r: 0.18, vis: 'dart' },
    skills: [
      { id: 'loithiet', look: 'qsChidori', name: 'Lôi Thiết', cd: 9, do: 'dash', dist: 9, speed: 36, dmg: 340, stun: 0.5, stop: true, icon: 'dash',
        desc: 'Phóng như chớp tới kẻ địch đầu tiên trên đường và dừng ngay đó, 340 sát thương và choáng 0,5 giây.' },
      { id: 'anhhoan', look: 'qsCrow', name: 'Ảnh Hoán', cd: 10, do: 'warp', dist: 8, behind: { pick: 4 }, icon: 'warp',
        desc: 'Dịch chuyển tức thì tới con trỏ, xa nhất 8 m, qua được tường. Có địch gần con trỏ (trong 4 m) thì hiện ra ngay sau lưng nó.' },
      { id: 'giaphomenh', look: 'qsSusanoo', name: 'Giáp Hộ Mệnh', cd: 45, do: 'transform', dur: 6, shield: 900, weapon: { cd: 0.5, dmg: 220, n: 3, fan: 0.12, speed: 30, range: 15, r: 0.32, vis: 'lance' }, icon: 'shield',
        desc: 'Trong 6 giây khoác khiên 900 và phi tiêu hóa ba mũi lao xa 15 m, mỗi mũi 220 sát thương.' },
    ],
  },
  // Tư Mã Ý: kit ported from the owner's earlier game, clip BV1Kp4y1b7i6 p12 "9.司马懿" (tooltips at 2-6 s, AUDIT-c.md). Attack = one Hắc
  // Cầu bolt (150): U Minh Khu Hổ 183% -> 275, a knocked orb 204% -> 306, Hỗn Độn Pháp Cầu 183% -> 275 (the strike and the orb's end
  // blast), Hỗn Độn Chi Phệ 100% -> 150 and +50% (75) per further orb, heal 50% -> 75 per orb hit. Cooldowns 8 / 6 / 20 s in the clip ->
  // 10 / 8 / 40; charges 2 / 3 as in the clip. Circling orbs capped at 4 (a kill may push it to 7). No MP. G5 (sim.js "kit-remake K4"):
  // the orb pool, ground orbs, knocked orbs, the devour ult.
  tumay: {
    name: 'Tư Mã Ý', role: 'Khống chế', roleKey: 'control', price: 1800, tint: 0x3a3550,
    blurb: 'Cầu hỗn độn bay quanh mình, cứ 3 giây thêm một quả. Khu hổ hất văng địch và cả cầu, gieo cầu nổ xuống đất, rồi phóng mọi quả cầu vào một mục tiêu.',
    hp: 2550, speed: 5.9, radius: 0.82,
    armor: 0.06, accel: 1.0, turn: 11, towerMul: 1.0,
    passive: { do: 'chaos', name: 'Hỗn Độn', every: 3, max: 4, kill: 3, ring: 1.7, spin: 2.2, mods: { onKill: { reset: { slots: ['ult'], frac: 1 } } },
      desc: 'Cứ 3 giây có thêm một quả cầu hỗn độn bay quanh bạn (tối đa 4). Hạ gục một kẻ địch được thêm 3 quả và Hỗn Độn Chi Phệ hồi chiêu ngay.' },
    weapon: { name: 'Hắc Cầu', cd: 0.58, dmg: 150, speed: 28, range: 13.5, r: 0.26, vis: 'pulse', look: 'tmBolt' },
    skills: [
      { id: 'khuho', look: 'tmTiger', name: 'U Minh Khu Hổ', cd: 10, uses: { n: 2, gap: 0.5 }, do: 'nova', windup: 0.15, move: 0.35, radius: 5, arc: 0.7, dmg: 275, knock: 3, fx: { slow: 0.5, slowDur: 2 },
        orbKnock: { dmg: 306, stun: 1, speed: 22, range: 9, cut: 0.1 }, icon: 'spin',
        desc: 'Vung hổ u minh hình quạt trước mặt (5 m): kẻ địch chịu 275 sát thương, bị hất lùi và chậm 50% trong 2 giây. Mọi quả cầu hỗn độn trong vùng bị hất bay đi: trúng kẻ địch gây 306 sát thương, choáng 1 giây, gieo một quả cầu mới tại đó và mọi chiêu của bạn hồi nhanh 10%. Giữ được 2 lần dùng.' },
      { id: 'phapcau', look: 'tmOrb', name: 'Hỗn Độn Pháp Cầu', cd: 8, uses: { n: 3, gap: 0.5 }, do: 'barrage', n: 1, radius: 0, blast: 2.8, dmg: 275, delay: 0.5, span: 0, cast: 13,
        leaveOrb: { dur: 8, blast: 2.5, dmg: 275 }, icon: 'magnet',
        desc: 'Sau 0,5 giây giáng 275 sát thương vùng 2,8 m ở con trỏ và để lại một quả cầu hỗn độn ở đó 8 giây; hết giờ quả cầu nổ 275 sát thương quanh nó. Giữ được 3 lần dùng.' },
      { id: 'hondon', look: 'tmDevour', name: 'Hỗn Độn Chi Phệ', cd: 40, do: 'orbit', mode: 'devour', cast: 14, pick: 4, dmg: 150, grow: 75, heal: 75, speed: 26, max: 8, icon: 'storm',
        desc: 'Chọn kẻ địch gần con trỏ: mọi quả cầu hỗn độn (bay quanh bạn và nằm trên đất) lao vào nó. Quả đầu 150 sát thương, mỗi quả sau thêm 75; kẻ địch khác chắn đường thì đỡ thay. Mỗi quả trúng hồi cho bạn 75 máu.' },
    ],
  },
  // Điêu Thuyền: kit ported from the owner's earlier game, clip BV1Kp4y1b7i6 p60 "57.貂蝉" (skin 火舞, tooltips f105-f155, AUDIT-a.md). Attack =
  // one Hoa Tiêu dart (150, was 90 every 0.3 s; now every 0.5 s): Sí Nhiệt Mị Hoặc 152% -> 228, a flower 50% -> 75, a fan 60% -> 90 out and
  // 180% -> 270 back, the fifth mark 100% -> 150 true. Cooldowns 8 / 6 / 8 s in the clip -> 10 / 8 / 10 (no long ult; the fans keep their 2
  // charges, 3 s apart). No MP. The flowers pick the nearest foe, not tanks first. G5 (sim.js "kit-remake G5 dieuthuyen"): a quarter of
  // all her skill damage heals her, and a returning fan cuts Long Viêm Cuồng Vũ too.
  dieuthuyen: {
    name: 'Điêu Thuyền', role: 'Khống chế', roleKey: 'control', price: 1700, tint: 0xf0e6f2, hover: true,
    blurb: 'Chiêu nào trúng cũng thêm một dấu Loạn Thế Giai Nhân, đủ năm dấu thì kẻ đó bị trói. Trái tim xuyên tường mê hoặc địch, lướt múa gọi hoa bay, ba quạt bướm bay đi rồi quay về.',
    hp: 2400, speed: 6.4, radius: 0.78,
    armor: 0.06, accel: 1.1, turn: 12, towerMul: 1.0,
    passive: { do: 'stacks', name: 'Loạn Thế Giai Nhân', look: 'dvRose', n: 5, dur: 5, on: 'skill', fx: { root: 0.5, trueDmg: 150 }, dvSteal: 0.25,
      desc: 'Mỗi chiêu trúng một kẻ địch thêm một dấu (giữ 5 giây). Đủ 5 dấu thì kẻ đó chịu 150 sát thương chuẩn và bị trói 0,5 giây. Một phần tư sát thương chiêu của bạn hồi lại thành máu.' },
    weapon: { name: 'Hoa Tiêu', cd: 0.5, dmg: 150, speed: 30, range: 13, r: 0.24, vis: 'dart', look: 'dvPetal' },
    skills: [
      { id: 'mihoac', look: 'dvHeart', name: 'Sí Nhiệt Mị Hoặc', cd: 10, do: 'volley', n: 1, dmg: 228, speed: 24, range: 14, r: 0.45, thruWalls: true, vis: 'pulse', fx: { charm: 1 }, icon: 'pierce',
        desc: 'Phóng một trái tim xuyên qua tường và vật cản: kẻ đầu tiên trúng chịu 228 sát thương và bị mê hoặc 1 giây (đi chậm về phía bạn, không bắn, không dùng chiêu).' },
      { id: 'cuongvu', look: 'dvDance', name: 'Long Viêm Cuồng Vũ', cd: 8, do: 'warp', dist: 7, glide: 30, invuln: 0.35,
        then: { id: 'phihoa', look: 'dvFlower', name: 'Phi Hoa', do: 'orbit', mode: 'seek', n: 4, ring: 1.5, dur: 6, rate: 0.5, dmg: 75, range: 9, speed: 26, vis: 'dart', after: 0.1 }, icon: 'warp',
        desc: 'Lướt nhanh tới con trỏ (xa nhất 7 m), không bị chạm tới trong lúc lướt, rồi gọi 4 bông hoa bay quanh mình: mỗi nửa giây một bông lao vào kẻ địch gần nhất trong 9 m, 75 sát thương.' },
      { id: 'diepphien', look: 'dvFan', name: 'Hoa Điệp Phi Phiến', cd: 10, uses: { n: 2, gap: 3 }, do: 'volley', n: 3, fan: 0.2, dmg: 90, speed: 24, range: 10, r: 0.45, pierce: true, ret: true, back: { dmg: 270 },
        vis: 'disc', cdCut: { slot: 's2', frac: 0.2 }, towerMul: 0.5, icon: 'ricochet',
        desc: 'Ném ba quạt bướm hình quạt: lúc bay đi gây 90, hết tầm thì bay về, lúc về gây 270, xuyên qua mọi kẻ địch. Mỗi lần quạt trúng, Long Viêm Cuồng Vũ hồi nhanh 20%. Giữ được 2 lần dùng, cách nhau 3 giây. Công trình chịu một nửa.' },
    ],
  },
  // Thủy Tinh (the Siren): ported from the owner's earlier game (clip BV1Kp4y1b7i6 p70 "67.海妖", tooltips in ~/handoff/dtt-ref/kits/AUDIT-c.md).
  // Attack = one Giọt Nước blow, set to 150 (was 95 at 0.35 s, now 150 at 0.55 s, same dps). Cooldowns 6 / 10 / 25 s -> 8 / 13 / 45.
  // Passive 海妖之怒: every hit adds a mark (4 s), each mark -10% fire rate; 5 marks freeze 2 s (a stun) and lock the marks out for 4 s.
  // 冰封之心: a fatal hit seals her in ice 3 s (untargetable, cc immune, heals 30%, cannot move or shoot), once per 25 s, ended by a cast.
  // Q 冰冷智慧 175% -> 263 around her (+1 mark); on a target frozen by her marks +225% (338) + 15% of its lost hp and her Q is ready
  // again, once per freeze (vsTag on the freeze tag). E 水幕屏障: a water wall at the cursor for 4 s that blocks shots and mechs,
  // 221% -> 332 around it as it forms (+2 marks); press again inside 4 s to recall it. Ult 狂澜束缚: a vortex 4 s at the cursor,
  // 81% -> 122 every 0.5 s (+1 mark each), slow growing to 50%; she heals 50% -> 75 every 0.5 s while she stands in it.
  // Kit-remake G5 fields (sim.js block "kit-remake G5 Thủy Tinh"): stacks fireSlow, save.ice, wall at/burst + recall, zone grow / ownerHps / marks.
  thuytinh: {
    name: 'Thủy Tinh', role: 'Khống chế', roleKey: 'control', price: 1800, tint: 0x2a7fbf,
    blurb: 'Mỗi đòn trúng thêm một dấu nước làm địch bắn chậm đi, đủ năm dấu là đóng băng. Dựng màn nước chắn đường, mở xoáy nước khổng lồ; trúng đòn chí mạng thì tự phong băng.',
    hp: 2600, speed: 6.0, radius: 0.84,
    armor: 0.08, accel: 1.0, turn: 11, towerMul: 1.0,
    passive: { do: 'stacks', name: 'Hải Yêu Chi Nộ', look: 'sirMark', desc: 'Mỗi đòn trúng thêm một dấu nước lên kẻ địch (giữ 4 giây, tối đa 5), mỗi dấu làm nó bắn chậm 10%. Đủ 5 dấu thì nó bị đóng băng 2 giây, sau đó 4 giây không nhận dấu mới. Băng Phong Chi Tâm: trúng đòn chí mạng thì tự phong băng 3 giây (không thể bị đánh, hồi 30% máu, không đi, không bắn; dùng chiêu là phá băng), mỗi 25 giây một lần.',
      n: 5, dur: 4, on: 'any', icd: 4, fireSlow: 0.1, fx: { stun: 2, tag: { key: 'frozen', dur: 2 } },
      mods: { save: { fatal: true, icd: 25, heal: 0.3, invuln: 3, ice: 3 } } },
    weapon: { name: 'Giọt Nước', cd: 0.55, dmg: 150, speed: 28, range: 13, r: 0.26, vis: 'wave' },
    skills: [
      { id: 'banglanh', look: 'sirWisdom', name: 'Băng Lãnh Trí Tuệ', cd: 8, do: 'nova', windup: 0.2, radius: 4.5, dmg: 263,
        vsTag: { key: 'frozen', mul: 601 / 263, fx: { lostHp: 0.15 }, cdCut: { slot: 'self', set: 0 }, consume: true }, icon: 'frost',
        desc: 'Sóng băng quanh bạn (4,5 m): 263 sát thương và thêm một dấu nước. Kẻ đang bị dấu nước đóng băng chịu thêm 338 sát thương và 15% máu đã mất, và chiêu này hồi ngay (mỗi lần đóng băng một lần).' },
      { id: 'thuymac', look: 'sirCurtain', name: 'Thủy Mạc Bình Chướng', cd: 13, do: 'wall', at: 'target', cast: 10, n: 5, r: 0.8, gap: 1.3, dur: 4, burst: { radius: 3, dmg: 332, marks: 2 },
        next: { window: 4, row: { id: 'thuymac2', look: 'sirCurtain', do: 'recall', of: 'thuymac' } }, icon: 'wall',
        desc: 'Dựng màn nước ở con trỏ (xa nhất 10 m) trong 4 giây, chắn đạn và không ai đi qua được. Lúc dựng, địch trong 3 m chịu 332 sát thương và thêm hai dấu nước. Bấm lần nữa trong 4 giây để thu màn nước về.' },
      { id: 'cuonglan', look: 'sirTide', name: 'Cuồng Lan Thúc Phược', cd: 45, do: 'zone', at: 'target', cast: 14, radius: 5, dur: 4, dps: 243, slow: 0.5, grow: 2, ownerHps: 150, marks: true, vis: 'sirTide', icon: 'magnet',
        desc: 'Ném quả cầu nước tới con trỏ, hóa xoáy nước lớn 5 m trong 4 giây: địch trong đó cứ 0,5 giây mất 122 máu và thêm một dấu nước, bị chậm dần tới 50%. Bạn đứng trong xoáy thì cứ 0,5 giây hồi 75 máu.' },
    ],
  },
  // Magneto: ported from the owner's earlier game (clip BV1Kp4y1b7i6 p86 "83.万磁之王", tooltips read at 1.5-4 s; AUDIT-c.md). Attack =
  // one Mảnh Thép blow (150; was 115 at 0.4 s, now 150 at 0.5 s, about the same dps), as lubo and moclan: Kim Loại Oanh Tạc 124% -> 186
  // then 183% -> 275, a foe under both beams loses 10% of its max hp more; Trọng Lực Phản Xung 190% -> 285; Từ Năng Phong Bạo 25% -> 38,
  // 8 times on every enemy on the map. The ult's "500% to one random unit near him" would be 750 x 8 on one mech here (the original
  // also counts minions, we have none), so that bonus is ported as one attack (150) per strike. Cooldowns 6 / 8 / 30 s in the clip ->
  // 8 / 10 / 55. All energy damage, no MP. The lift is the G3 lock `lift`; kit lane K6 fields (sim.js block "kit lane K6"): passive
  // mgtHaste, barrage mgtSeq + mgtBoth, zone mgtStorm.
  samthep: {
    name: 'Magneto', role: 'Khống chế', roleKey: 'control', price: 1800, tint: 0x8a2a3a,
    blurb: 'Chúa tể từ trường: mỗi chiêu trúng địch là chạy nhanh hẳn lên. Giáng hai thanh dầm thép xuống một chỗ, nhấc bổng kẻ địch rồi nện xuống đất, gọi bão từ đánh mọi kẻ địch trên khắp bản đồ.',
    hp: 2650, speed: 5.7, radius: 0.86,
    armor: 0.10, accel: 0.9, turn: 10, towerMul: 1.0,
    passive: { do: 'trait', name: 'Từ Lực Gia Tốc', mgtHaste: { haste: 1.5, dur: 2 },
      desc: 'Mỗi lần chiêu của bạn gây sát thương cho kẻ địch, từ trường đẩy bạn chạy nhanh hơn 50% trong 2 giây.' },
    weapon: { name: 'Mảnh Thép', cd: 0.5, dmg: 150, speed: 32, range: 12.5, r: 0.22, vis: 'rivet' },
    skills: [
      { id: 'oanhtac', look: 'mgBeams', name: 'Kim Loại Oanh Tạc', cd: 8, do: 'barrage', n: 2, cast: 12, radius: 0, blast: 2.4, delay: 0.45, span: 0, dmg: 186,
        mgtSeq: [{ delay: 0.45, dmg: 186 }, { delay: 0.85, dmg: 275 }], mgtBoth: { maxHp: 0.1 }, icon: 'barrage',
        desc: 'Gọi hai thanh dầm thép khổng lồ lần lượt giáng xuống chỗ con trỏ (xa nhất 12 m): thanh đầu 186 sát thương, thanh sau 275, mỗi thanh vòng 2,4 m. Kẻ trúng cả hai thanh mất thêm 10% máu tối đa.' },
      { id: 'phanxung', look: 'mgLift', name: 'Trọng Lực Phản Xung', cd: 10, do: 'barrage', n: 2, cast: 12, radius: 0, blast: 3, delay: 0.3, span: 0, dmg: 285,
        mgtSeq: [{ delay: 0.3, dmg: 0, fx: { lift: 1.5 } }, { delay: 1.8, dmg: 285, blast: 3.5, fx: { stun: 1 }, fxNew: true }], icon: 'magnet',
        desc: 'Sau 0,3 giây nhấc bổng kẻ địch trong 3 m quanh con trỏ (xa nhất 12 m), giữ chúng lơ lửng 1,5 giây rồi nện xuống: 285 sát thương vòng 3,5 m; kẻ đứng quanh chỗ nện mà chưa bị nhấc thì choáng thêm 1 giây.' },
      { id: 'phongbao', look: 'mgStorm', name: 'Từ Năng Phong Bạo', cd: 55, do: 'zone', at: 'self', follow: true, radius: 6, dur: 6, dps: 0, vis: 'mgStorm',
        mgtStorm: { n: 8, dmg: 38, near: { r: 6, dmg: 150 } }, icon: 'storm',
        desc: 'Bão từ 6 giây: đánh 8 lần vào mọi kẻ địch trên khắp bản đồ, mỗi lần 38 sát thương; mỗi lần còn giáng thêm 150 lên một kẻ địch ngẫu nhiên trong 6 m quanh bạn.' },
    ],
  },
  cuuvi: {
    name: 'Cửu Vĩ Hồ', role: 'Ảo thuật', roleKey: 'trickster', price: 1700, tint: 0xf2f0ea, hover: true,
    blurb: 'Chiêu trúng ba lần là kẻ địch mê muội, đánh yếu đi. Để lại ảo ảnh khi dịch chuyển, rồi thả chín quả cầu lửa quanh mình lần lượt bay đi tìm kẻ địch.',
    hp: 2450, speed: 6.9, radius: 0.76,
    armor: 0.02, accel: 1.4, turn: 16, towerMul: 1.4,
    passive: { do: 'stacks', name: 'Mê Hồn', desc: 'Mỗi chiêu trúng một kẻ địch thêm một dấu mê (giữ 4 giây). Đủ 3 dấu thì kẻ đó đánh yếu đi 30% trong 3 giây.',
      n: 3, dur: 4, on: 'skill', fx: { weaken: { mul: 0.7, dur: 3 } } },
    weapon: { name: 'Hồ Hỏa', cd: 0.28, dmg: 85, speed: 32, range: 13, r: 0.22, vis: 'dart' },
    skills: [
      { id: 'chumhoho', look: 'cvFire', name: 'Chùm Hồ Hỏa', cd: 6, do: 'volley', n: 3, fan: 0.1, dmg: 120, speed: 28, range: 13, splash: 1.5, r: 0.26, vis: 'rocket', icon: 'rocket',
        desc: 'Bắn ba quả hỏa cầu hình quạt, mỗi quả 120 sát thương và nổ lan 1,5 m.' },
      { id: 'aoanh', look: 'cvMirage', name: 'Ảo Ảnh', cd: 11, do: 'warp', dist: 7, leave: { hp: 400, dur: 3, blast: 3.5, dmg: 100, fx: { slow: 0.4, slowDur: 1.5 } }, icon: 'mirage',
        desc: 'Dịch chuyển tức thì tới con trỏ, xa nhất 7 m, để lại ảo ảnh đứng yên 3 giây; ảo ảnh vỡ hoặc hết giờ thì nổ 100 sát thương và làm chậm.' },
      { id: 'cuuvihoa', look: 'cvTails', name: 'Cửu Vĩ Hỏa', cd: 42, do: 'orbit', mode: 'seek', n: 9, dur: 6, ring: 1.8, rate: 0.35, dmg: 140, range: 11, vis: 'dart', icon: 'spin',
        desc: 'Chín quả cầu lửa xoay quanh bạn 6 giây; mỗi 0,35 giây một quả bay vào kẻ địch gần nhất trong 11 m, 140 sát thương.' },
    ],
  },
  // Kiếm Thần = Lý Bạch: ported from the owner's earlier game (clip BV1Kp4y1b7i6 p65 "62.李白", tooltips read at 0-4 s; AUDIT-b.md).
  // Attack = one Kiếm Phong blow (2 x 62 = 124): Vạn Cổ Tiêu Sầu 100% -> 124, Long Tuyền 100% -> 124 rising to 200% -> 248 with the
  // distance flown, Cửu Thiên 100% -> 124 + 15% of the lost hp, +200% -> 248 on a mech Long Tuyền marked. Cooldowns 10 / 6 / 25 s in
  // the clip -> 12 / 8 / 45. Range 360 -> 9.7 m for the calm buff (1 m ~ 37 units). The 0-100 energy is the G2 energy, filled by
  // walking (3 a metre) and emptied after 2 s standing still; "ignores damage reduction at max" is dropped.
  kiemthan: {
    name: 'Kiếm Thần', role: 'Đấu sĩ', roleKey: 'bruiser', price: 1800, tint: 0xcfd6e0,
    blurb: 'Lý Bạch: đi tới đâu tích kiếm ý tới đó, không ai quanh mình thì chạy nhanh và đánh mạnh hơn. Uống rượu giải mọi khống chế, ngự kiếm bay xa càng đau, gọi chín tầng phi kiếm chém xuống mọi kẻ địch quanh mình.',
    hp: 2700, speed: 6.3, radius: 0.86,
    armor: 0.08, accel: 1.1, turn: 12, towerMul: 1.2,
    energy: { max: 100, regen: 0, start: 0 },
    passive: { do: 'moon', name: 'Nguyệt Hạ Độc Chước', ktEn: { per: 3, idle: 2 }, ktCalm: { r: 9.7, haste: 1.25, dmg: 1.25 },
      desc: 'Không có kẻ địch nào trong 9,7 m quanh bạn thì bạn chạy nhanh hơn và gây thêm 25% sát thương. Thanh kiếm ý 0-100 đầy dần khi bạn di chuyển (3 mỗi mét) và mất sạch khi đứng yên quá 2 giây; kiếm ý làm Long Tuyền Xuất Hạp và Cửu Thiên Thần Kiếm mạnh thêm tới 50%.' },
    weapon: { name: 'Kiếm Phong', cd: 0.4, dmg: 62, n: 2, fan: 0.1, speed: 28, range: 7.5, r: 0.3, pierce: true, vis: 'wave' },
    skills: [
      { id: 'tieusau', look: 'ktDrink', name: 'Vạn Cổ Tiêu Sầu', cd: 12, do: 'nova', windup: 0.05, move: 0.6, radius: 3.5, dmg: 124, knock: 3, fx: { weaken: { mul: 0.75, dur: 3 } },
        self: { on: 'cast', dur: 3, haste: 2, hasteDecay: true }, ktFree: true, ktGain: 50, icon: 'boost',
        desc: 'Uống rượu: ngay lập tức được 50 kiếm ý, giải mọi hiệu ứng xấu, 3 giây chạy nhanh gấp đôi (nhạt dần); kẻ địch trong 3,5 m bị đẩy lùi, chịu 124 sát thương và gây ít hơn 25% sát thương trong 3 giây. Dùng được cả khi đang bị choáng, hất tung, hóa đá hay hỗn loạn.' },
      { id: 'longtuyen', look: 'ktFly', name: 'Long Tuyền Xuất Hạp', cd: 8, uses: { n: 3, gap: 2 }, do: 'volley', n: 1, dmg: 124, speed: 30, range: 14, r: 0.35, thruWalls: true,
        far: { ramp: { per: 0.0715, max: 2 } }, towerMul: 0, fx: { tag: { key: 'ktSword', dur: 4 } }, en: { refund: 25 }, ktSpend: 0.5, vis: 'dart', icon: 'pierce',
        desc: 'Ngự kiếm bay theo hướng ngắm (14 m), xuyên qua địa hình, đâm kẻ địch đầu tiên: 124 sát thương, bay càng xa càng đau, tới gấp đôi ở cuối tầm. Tiêu hết kiếm ý: mỗi 100 kiếm ý làm kiếm bay nhanh và đau thêm 50%; trúng thì được lại 25. Tích 3 lần, cách nhau 2 giây. Không gây sát thương lên công trình.' },
      { id: 'cuuthien', look: 'ktHeaven', name: 'Cửu Thiên Thần Kiếm', cd: 45, do: 'barrage', n: 1, radius: 0, blast: 1.6, dmg: 124, delay: 1.5, span: 0, cast: 0, fx: { lostHp: 0.15 },
        vsTag: { key: 'ktSword', fx: { trueDmg: 248 } }, ktLock: 8, ktScale: 0.5, icon: 'barrage',
        desc: 'Khóa mọi kẻ địch trong 8 m quanh bạn, mỗi kẻ một thanh phi kiếm; 1,5 giây sau kiếm chém xuống: 124 sát thương cộng 15% máu đã mất của mục tiêu (sát thương chuẩn), mạnh thêm tới 50% theo kiếm ý; kẻ đang mang dấu Long Tuyền Xuất Hạp chịu thêm 248. Không có ai trong 8 m thì không dùng được.' },
    ],
  },
  // Baymax: ported from the owner's earlier game (clip BV1Kp4y1b7i6 p59 "56.小白", panel 小白III, audit AUDIT-a.md). Attack = one
  // Xung Bọt (150, was 100 per 0.3 s, same dps): passive heal 450% -> 30% of the saved ally's max hp (675 on 2200), the chain 100% per
  // s -> 150, the bomb 200% -> 300, the flight 266% -> 400, the warrior aura 50% per s -> 75. Cooldowns 1 / 6 / 25 s -> 1.3 / 8 / 45.
  // He keeps his energy (100, +5 per s): the chain costs 10 to start and 10 per s (kit-remake K14 `tie`), a bomb hit gives 25 back.
  // The 50% guard until he arrives, the hits along the flight and the warrior's 10 s (no main weapon, aura that shoves) are K14.
  suatrang: {
    name: 'Baymax', role: 'Hỗ trợ', roleKey: 'support', price: 1700, tint: 0xf4f6f8, hover: true,
    blurb: 'Người máy chăm sóc: đồng đội gần sắp gục được hồi gấp. Nối xích hồi máu, ném bom siêu năng hất văng, bay tới che chắn đồng đội rồi hóa Siêu Năng Chiến Sĩ.',
    hp: 2000, speed: 6.4, radius: 0.80,
    armor: 0.06, accel: 1.2, turn: 13, towerMul: 1.8,
    energy: { max: 100, regen: 5, start: 100 },
    passive: { do: 'trait', name: 'Siêu Năng Trị Dũ', mods: { save: { below: 0.3, icd: 30, heal: 0.3, guard: 0.5, dur: 2, ally: true, r: 7 } },
      desc: 'Bạn hoặc đồng đội trong 7 m tụt dưới 30% máu thì được hồi ngay 30% máu tối đa và giảm 50% sát thương nhận trong 2 giây; 30 giây một lần. Năng lượng hồi 5 mỗi giây.' },
    weapon: { name: 'Xung Bọt', cd: 0.45, dmg: 150, speed: 28, range: 12, r: 0.28, vis: 'pulse' },
    skills: [
      { id: 'xichhoi', look: 'bmTether', name: 'Siêu Năng Trị Dũ', cd: 1.3, do: 'bless', to: 'ally', cast: 12, pick: 3.5, en: { cost: 10 }, tie: { hps: 150, drain: 10, range: 9 }, icon: 'heal',
        desc: 'Nối xích hồi máu với đồng đội ở con trỏ: cả hai hồi 150 máu mỗi giây. Xích tốn 10 năng lượng mỗi giây, đứt khi cạn năng lượng hoặc hai người cách nhau quá 9 m; bấm lại để tháo.' },
      { id: 'bomsieunang', look: 'bmBomb', name: 'Siêu Năng Tạc Đạn', cd: 8, do: 'barrage', n: 1, radius: 0, blast: 3, dmg: 300, delay: 0.5, span: 0, cast: 12, uses: { n: 3, gap: 0.5 }, en: { refund: 25 },
        fx: { slow: 0.5, slowDur: 2, slowDecay: true, knock: 2 }, icon: 'barrage',
        desc: 'Ném bom ở con trỏ (xa nhất 12 m): 300 sát thương vòng 3 m, hất lùi, chậm 50% giảm dần trong 2 giây. Mỗi kẻ trúng trả 25 năng lượng. Giữ được 3 quả.' },
      { id: 'chiensi', look: 'bmWarrior', name: 'Siêu Năng Chiến Sĩ', cd: 45, do: 'leap', to: 'ally', cast: 13, pick: 4, windup: 0.4, move: 0, flight: 0.6, radius: 3.5, dmg: 0, knock: 2, landShield: 1000, shieldDur: 5,
        stGuard: 0.5, stPath: { dmg: 400, r: 1.6, fx: { air: 1 } },
        then: { id: 'chiensihoa', name: 'Siêu Năng Chiến Sĩ', do: 'transform', dur: 10, haste: 2, zone: { radius: 3, dps: 75 }, stWar: { push: 4 } }, icon: 'leap',
        desc: 'Đồng đội ở con trỏ (xa nhất 13 m) được giảm 50% sát thương nhận tới khi bạn tới. Tụ lực 0,4 giây rồi bay tới, kẻ trên đường chịu 400 sát thương và bị đánh tung 1 giây. Đáp xuống: cả hai có khiên 1000 trong 5 giây, địch quanh đó bị hất lùi, rồi bạn hóa Siêu Năng Chiến Sĩ 10 giây: chạy nhanh gấp đôi, không bắn thường, quanh mình 3 m mỗi giây 75 sát thương và đẩy địch ra.' },
    ],
  },
  // Hulk: ported from the owner's earlier game (clip BV1Kp4y1b7i6 p23 "20.巨人", tooltips read at 0.5-8.5 s; AUDIT-b.md). Attack = 150 on
  // the kit scale (lubo, moclan): Chấn Không Nộ Hống 163% -> 245, Tử Vong Tiễn Đạp 155% -> 233. Cooldowns 6 / 10 / 25 s in the clip ->
  // 8 / 12 / 45. The fist keeps its 200 per blow (a slow 0.75 s swing). Passive 6% max hp per 3 s -> regen hps 0.02, heals received up
  // to +50% at low hp (healUp, K1). The ult's lifesteal became the clip's 3%/s heal (transform hps) and the stacks it gains from every
  // weapon blow it takes (hurtW, K1): 3% of lost hp, the other cooldowns -10%, +5% damage and fire rate for 2 s, up to +100%.
  khidot: {
    name: 'Hulk', role: 'Trụ', roleKey: 'tank', price: 1900, tint: 0x3f7d2f,
    blurb: 'Càng thấp máu càng hồi nhiều. Gầm chấn không làm địch chậm và yếu đi, tụ lực nhảy giẫm đánh tung, rồi phẫn nộ: càng bị đánh càng hồi máu và càng mạnh.',
    hp: 3300, speed: 5.4, radius: 1.0,
    armor: 0.12, accel: 0.8, turn: 9, towerMul: 1.5,
    passive: { do: 'regen', name: 'Trùng Sinh Trị Dũ', desc: 'Mỗi giây tự hồi 2% máu tối đa, kể cả khi đang đánh. Máu càng thấp thì mọi lượng hồi máu nhận vào càng nhiều, tối đa thêm 50%.',
      hps: 0.02, healUp: 0.5 },
    weapon: { name: 'Nắm Đấm', cd: 0.75, dmg: 200, speed: 24, range: 6.5, r: 0.5, splash: 1.6, knock: 1.5, vis: 'shell' },
    skills: [
      { id: 'chankhong', look: 'hkRoar', name: 'Chấn Không Nộ Hống', cd: 8, do: 'nova', windup: 0.3, radius: 5, dmg: 245, fx: { slow: 0.25, slowDur: 2, weaken: { mul: 0.75, dur: 2 } }, icon: 'quake',
        desc: 'Lấy hơi 0,3 giây rồi gầm chấn động: địch trong 5 m chịu 245 sát thương, bị chậm 25% và giảm 25% sát thương trong 2 giây.' },
      { id: 'tiendap', look: 'hkStomp', name: 'Tử Vong Tiễn Đạp', cd: 12, do: 'leap', windup: 0.25, move: 0, cast: 10, flight: 0.55, radius: 3.5, dmg: 233, fx: { air: 0.5 }, icon: 'leap',
        desc: 'Tụ lực 0,25 giây rồi nhảy tới chỗ con trỏ (xa nhất 10 m), giẫm xuống gây 233 sát thương vòng 3,5 m và đánh tung kẻ trúng 0,5 giây.' },
      { id: 'damanchino', look: 'hkRage', name: 'Dã Man Chi Nộ', cd: 45, do: 'transform', dur: 8, size: 1.2, haste: 1.25, ccResist: 0.5, hps: 0.03,
        hurtW: { heal: 0.03, cut: 0.1, step: 0.05, max: 20, dur: 2, icd: 0.3 }, icon: 'rage',
        desc: 'Phẫn nộ 8 giây: to hơn 20%, mỗi giây hồi 3% máu tối đa, chạy nhanh hơn 25%, khống chế trúng phải chỉ còn một nửa. Mỗi đòn đánh thường trúng bạn (cách nhau ít nhất 0,3 giây): hồi 3% máu đã mất, hai chiêu kia hồi nhanh thêm 10%, sát thương và tốc bắn +5% trong 2 giây, cộng dồn tới +100%.' },
    ],
  },
  retdo: {
    name: 'Deadpool', role: 'Đấu sĩ', roleKey: 'bruiser', price: 1800, tint: 0xb0202a,
    blurb: 'Phóng dao liên tục, càng thấp máu càng hút máu mạnh. Lộn Ngược né ra sau rồi trả đòn bằng hai lưỡi dao, Hỗn Loạn hút máu mọi kẻ áp sát.',
    hp: 3100, speed: 6.4, radius: 0.86,
    armor: 0.10, accel: 1.1, turn: 12, towerMul: 1.2,
    passive: { do: 'lifesteal', name: 'Tái Sinh', desc: 'Hút 14% sát thương gây ra thành máu. Dưới 40% máu thì hút gấp đôi.',
      frac: 0.14, mods: { lowHp: { below: 0.4, steal: 2 } } },
    weapon: { name: 'Song Đao Ném', cd: 0.2, dmg: 74, speed: 32, range: 10, r: 0.2, alt: 0.35, vis: 'dart' },
    skills: [
      { id: 'phongdao', look: 'rdKnife', name: 'Phóng Dao', cd: 7, do: 'volley', n: 1, dmg: 75, speed: 36, range: 11, r: 0.2, vis: 'dart', burst: { n: 5, gap: 0.08 }, move: 0.6, icon: 'ricochet',
        desc: 'Phóng liền năm con dao, mỗi con 75 sát thương, cách nhau 0,08 giây; vừa phóng vừa đi được.' },
      { id: 'lonnguoc', look: 'rdCoil', name: 'Lộn Ngược', cd: 11, do: 'counter', window: 0.6, dr: 0.6, move: { back: 5, speed: 24 },
        riposte: { volley: { n: 2, fan: 0.05, dmg: 160, speed: 34, range: 12, r: 0.22, vis: 'dart' } }, icon: 'recoil',
        desc: 'Lộn ra sau 5 m rồi giữ thế 0,6 giây: đòn đầu tiên trúng bạn bị giảm 60% và bạn bắn trả hai con dao 160 vào kẻ đánh. Không ai đánh thì hồi lại 40% thời gian hồi.' },
      { id: 'honloan', look: 'rdChaos', name: 'Hỗn Loạn', cd: 40, do: 'zone', at: 'self', follow: true, radius: 4.5, dur: 5, dps: 220, drain: 0.5, vis: 'blizzard', icon: 'rage',
        desc: 'Cơn loạn đao bám theo bạn 5 giây: địch trong 4,5 m mất 220 máu mỗi giây, và bạn hồi bằng một nửa số máu đó.' },
    ],
  },
  // Mikasa: ported from the owner's earlier game (clip BV1Kp4y1b7i6 p56 "53.米卡莎", tooltips in ~/handoff/dtt-ref/kits/AUDIT-b.md,
  // gameplay 35-61 s watched by kit lane k18: a thin cyan grapple line to the wall, a dark slate shield bubble, a ring of steel blade
  // shards spinning round her, crit numbers right after a grapple). Attack = one Song Lưỡi pair (2 x 64 = 128, kept): Đạn Xạ Câu
  // Trảo 100% -> 128 on everyone the reel touches, Hồi Toàn Trảm Kích 100% -> 128. Cooldowns 8 / 4 / 4 s in the clip -> 10 / 5 / 5
  // (her "ult" is a three-use spin, as in the clip). Her energy is kept (G2 def.energy: 100, +5 a second, +2.5 a weapon hit = +5 a
  // pair; the grapple costs 50, Cực Tốc Điền Sung gives 75). Crit after a grapple = x1.5. Kit-remake G5 fields (sim.js block "kit
  // lane K18"): passive nhArmor (more damage on heavy armour), dash nhShield + nhEn (cleanse, energy, cc immune and haste while the
  // shield lasts, cooldown after it), hook nhWall (catches walls only, cuts along the reel, combo window, spin while reeling), nova
  // nhStack (+25% a stack for the next spin) and nhCombo (the crit and 50% less skill damage taken for 2 s).
  nhenthep: {
    name: 'Mikasa', role: 'Thọc sườn', roleKey: 'flanker', price: 1700, tint: 0x4a4f58,
    blurb: 'Thiết bị cơ động lập thể: móc câu vào tường rồi bay tới, chém mọi kẻ trên đường, vừa đáp là xoay chém chí mạng. Giáp địch càng dày càng chém đau. Cực Tốc Điền Sung giải khống chế, lướt đi và bọc khiên.',
    hp: 2350, speed: 7.3, radius: 0.76,
    armor: 0.02, accel: 1.4, turn: 16, towerMul: 1.4,
    energy: { max: 100, regen: 5, start: 100, gain: { weapon: 2.5 } },
    passive: { do: 'trait', name: 'Thiết Bị Cơ Động', look: 'nhGear', nhArmor: 1.5,
      desc: 'Móc câu tốn năng lượng: tối đa 100, hồi 5 mỗi giây, mỗi lượt chém thường trúng hồi thêm 5. Giáp mục tiêu càng dày bạn chém càng đau: thêm 1,5 lần giáp của nó (giáp 20% là thêm 30%).' },
    weapon: { name: 'Song Lưỡi', cd: 0.3, dmg: 64, n: 2, fan: 0.12, speed: 30, range: 8, r: 0.24, vis: 'pellet' },
    skills: [
      { id: 'cuctoc', look: 'nhRefill', name: 'Cực Tốc Điền Sung', cd: 10, do: 'dash', windup: 0.15, move: 0, dist: 5, speed: 30, dmg: 0, rootOk: true,
        selfShield: { frac: 0.25, dur: 4 }, nhShield: { haste: 1.25 }, nhEn: 75, icon: 'boost',
        desc: 'Tụ lực 0,15 giây, giải mọi hiệu ứng xấu rồi lướt nhanh 5 m theo hướng ngắm, nhận khiên 25% máu tối đa (tối đa 4 giây) và 75 năng lượng. Còn khiên thì miễn khống chế và chạy nhanh hơn 25%; hết khiên mới bắt đầu hồi chiêu. Dùng được cả khi bị giữ chân.' },
      { id: 'cautrao', look: 'nhGrapple', name: 'Đạn Xạ Câu Trảo', cd: 5, uses: { n: 3, gap: 1.5 }, en: { cost: 50 }, do: 'hook', self: true, speed: 36, range: 13, r: 0.35, dmg: 0, vis: 'hook',
        nhWall: { dmg: 128, fx: { slow: 0.5, slowDur: 2 }, combo: 1 }, icon: 'hook',
        desc: 'Bắn móc câu (tốn 50 năng lượng) xa 13 m, bay xuyên qua mech: móc trúng tường hay công trình thì bạn bay tới đó, miễn khống chế, chém mọi kẻ địch chạm phải 128 và làm chậm 50% trong 2 giây. Trong 1 giây sau khi móc trúng, Hồi Toàn Trảm Kích chí mạng; đang bay vẫn xoay chém được. Tích 3 lần, cách nhau 1,5 giây.' },
      { id: 'hoitoan', look: 'nhSpin', name: 'Hồi Toàn Trảm Kích', cd: 5, uses: { n: 3, gap: 1.5 }, do: 'nova', windup: 0.05, move: 1, radius: 4, dmg: 128, steal: 0.5, towerMul: 0.75,
        nhStack: { amp: 0.25, max: 3, dur: 4 }, nhCombo: { mul: 1.5, guard: 0.5, dur: 2 }, icon: 'spin',
        desc: 'Xoay chém quanh mình (4 m): 128 sát thương, hút 50% số đó thành máu; kẻ trúng chịu thêm 25% từ lần xoay kế tiếp trong 4 giây, cộng dồn 3 lần. Trong 1 giây sau khi móc trúng tường: chí mạng x1,5 và sát thương kỹ năng phải nhận giảm 50% trong 2 giây. Tích 3 lần, cách nhau 1,5 giây. Công trình chỉ chịu 75%.' },
    ],
  },
  // Tào Tháo: ported from the owner's earlier game (clip BV1Kp4y1b7i6 p11 "8.曹操", tooltips read at 2-5 s; AUDIT-c.md). The clip shows
  // the panel small and blurred, so the numbers the audit marks (?) are best reads, kept as read and in proportion with the clear ones:
  // R's cooldown 10 s, its 3 s blood-rage window, E's cooldown 6 s and its 183%. Attack = one Ỷ Thiên Kiếm blow (150; was 130 at 0.5 s):
  // Dục Huyết Kiêu Hùng 50% -> 75 every 0.5 s, Bá Đạo Chi Thủ 183% -> 275, the hold 20% -> 30 every 0.25 s. "Dragged 72" (about a
  // quarter of a gun's reach) -> 3 m toward the hand. Cooldowns 10 / 6 / 30 s -> 13 / 8 / 55. The free R on a kill is G3 onKill.cast,
  // the drag is G4 yank. Kit lane K6 fields (sim.js block "kit lane K6"): passive tthBlood, zone tthHeal, leap tthHold.
  taothao: {
    name: 'Tào Tháo', role: 'Đấu sĩ', roleKey: 'bruiser', price: 1900, tint: 0x2a2a3a,
    blurb: 'Gian hùng khát máu: vòng huyết khí quanh mình chém liên tục và hồi máu, bàn tay bá đạo kéo kẻ địch lại gần, rồi lao tới khống chế một kẻ, cả hai cùng đứng yên trong 3 giây và kẻ đó gánh nửa sát thương thay bạn.',
    hp: 3000, speed: 6.1, radius: 0.88,
    armor: 0.10, accel: 1.0, turn: 11, towerMul: 1.2,
    passive: { do: 'trait', name: 'Gian Hùng', look: 'ccAura', tthBlood: { every: 0.3, icd: 15, dur: 3, heal: 0.03 }, mods: { onKill: { cast: TT_R } },
      desc: 'Mỗi khi đã mất tổng cộng 30% máu tối đa (nhiều nhất một lần mỗi 15 giây), trong 3 giây sau đó mỗi đòn chiêu địch đánh trúng lại hồi cho bạn 3% máu tối đa. Mỗi lần hạ gục, Dục Huyết Kiêu Hùng tự bùng lên miễn phí.' },
    weapon: { name: 'Ỷ Thiên Kiếm', cd: 0.5, dmg: 150, speed: 28, range: 9, r: 0.34, pierce: true, vis: 'wave' },
    skills: [
      TT_R,
      { id: 'badao', look: 'ccHand', name: 'Bá Đạo Chi Thủ', cd: 8, do: 'barrage', n: 1, cast: 11, radius: 0, blast: 3, delay: 0.3, span: 0, dmg: 275, fx: { slow: 0.5, slowDur: 2, yank: { dist: 3, to: 'centre' } }, icon: 'cage',
        desc: 'Bàn tay bá đạo chộp xuống chỗ con trỏ (xa nhất 11 m): kẻ địch trong 3 m bị kéo 3 m về phía bàn tay, chịu 275 sát thương và chậm 50% trong 2 giây.' },
      { id: 'hiepthientu', look: 'ccHold', name: 'Hiệp Thiên Tử Lệnh Chư Hầu', cd: 55, do: 'leap', to: 'foe', pick: 4, cast: 10, flight: 0.3, radius: 0, dmg: 0,
        tthHold: { dur: 3, every: 0.25, dmg: 30, redirect: 0.5, also: 0 }, icon: 'leap',
        desc: 'Chọn kẻ địch ở con trỏ (xa nhất 10 m), lao vút tới, cùng lúc bùng Dục Huyết Kiêu Hùng. Tới nơi, bạn và kẻ đó cùng bị khóa 3 giây, không đi, không bắn, không dùng chiêu: mỗi 0,25 giây bạn chém nó 30, một nửa sát thương bạn phải chịu chuyển sang nó, và nó gục lúc này thì tính là bạn hạ. Không chọn được kẻ đang bị khóa.' },
    ],
  },
  // Kirito: ported from the owner's earlier game (clip BV1Kp4y1b7i6 p80 "77.桐人" Đồng Nhân, tooltips in ~/handoff/dtt-ref/kits/AUDIT-a.md).
  // Attack = one Song Kiếm swing (2 x 75 = 150; was 2 x 70): sword waves 75% -> 113, Lôi Đình 127% -> 191, Âm Tốc 100% -> 150 and
  // its wall slam 145% -> 218, Tinh Bạo 40% -> 60 a cut, trimmed to 50 (fix/dtt-balance: he sat at K/D 4.00 in sim-test 15e, the bot
  // matches' strongest tank; the cut is split among the foes in reach anyway) and the last strike 175% -> 263. Cooldowns 8 / 6 / 25 s in the clip ->
  // 10 / 8 / 45. The passive's haste and four sword waves after a skill hit = row self on hit (G1 + G3 shots), cheat death =
  // mods.save fatal (G2), the sword-wave penetration stacks, the wall slam of a carried foe and the split cuts are kit-remake G5
  // (sim.js block "kit-remake G5 Kirito": passive bnPen, weapon patch bnWave, dash bnSlam, nova bnSplit).
  bongua: {
    name: 'Kirito', role: 'Thọc sườn', roleKey: 'flanker', price: 1700, tint: 0x1e2a22,
    blurb: 'Kiếm sĩ song kiếm: chiêu trúng địch thì chạy nhanh hơn và nhát chém kế tiếp tung bốn luồng kiếm khí hút máu. Biến mất rồi giáng sấm, lướt âm tốc cuốn kẻ địch đập tường, Tinh Bạo Khí Lưu Trảm chém mười lăm nhát.',
    hp: 2400, speed: 7.1, radius: 0.76,
    armor: 0.03, accel: 1.4, turn: 16, towerMul: 1.4,
    passive: { do: 'trait', name: 'Tứ Phương Trảm', bnPen: { per: 0.1, max: 10, dur: 5 },
      mods: { save: { fatal: true, icd: 30, invuln: 1.5, resetSlots: ['s1', 's2'] } },
      desc: 'Chiêu trúng địch: 2 giây chạy nhanh hơn 50%, nhát chém thường kế tiếp thành bốn luồng kiếm khí tỏa hình quạt, mỗi luồng 113 sát thương và hút 25% máu. Mỗi luồng trúng cho bạn xuyên 10% giáp trong 5 giây, tối đa 10 tầng. Đòn chí mạng: bỏ qua đòn đó, hồi ngay Lôi Đình Thiên Giáng và Âm Tốc Xung Kích, miễn mọi sát thương 1,5 giây (30 giây một lần).' },
    weapon: { name: 'Song Kiếm', cd: 0.3, dmg: 75, n: 2, fan: 0.1, speed: 30, range: 8, r: 0.24, vis: 'pellet' },
    skills: [
      { id: 'loidinh', look: 'bnThunder', name: 'Lôi Đình Thiên Giáng', cd: 10, do: 'warp', dist: 9, land: { radius: 3, dmg: 191, fx: { root: 1 } },
        self: { on: 'hit', dur: 2, haste: 1.5, shots: 1, shotsFor: 2, patch: { bnWave: true, n: 4, fan: 0.22, dmg: 113, steal: 0.25, speed: 26, range: 8, r: 0.45, vis: 'wave' } }, icon: 'warp',
        desc: 'Biến mất rồi hiện ra ở chỗ con trỏ (xa nhất 9 m), sấm giáng xuống vòng 3 m: 191 sát thương, giữ chân kẻ trúng 1 giây.' },
      { id: 'amtoc', look: 'bnSonic', name: 'Âm Tốc Xung Kích', cd: 8, do: 'dash', dist: 7, speed: 34, dmg: 150, heal: 1, drag: true, bnSlam: { dmg: 218, stun: 1.5 },
        self: { on: 'hit', dur: 2, haste: 1.5, shots: 1, shotsFor: 2, patch: { bnWave: true, n: 4, fan: 0.22, dmg: 113, steal: 0.25, speed: 26, range: 8, r: 0.45, vis: 'wave' } }, icon: 'dash',
        desc: 'Lướt 7 m theo hướng ngắm, cuốn theo kẻ địch trên đường: 150 sát thương, bạn hồi máu bằng sát thương đó. Kẻ bị cuốn đập vào tường chịu thêm 218 và choáng 1,5 giây.' },
      { id: 'tinhbao', look: 'bnStarburst', name: 'Tinh Bạo Khí Lưu Trảm', cd: 45, do: 'nova', windup: 0, repeat: 15, gap: 0.095, move: 0, radius: 4.5, dmg: 50, bnSplit: true, invuln: 1.5,
        fx: { slow: 0.5, slowDur: 1, antiheal: { mul: 0, dur: 2 } },
        self: { on: 'hit', dur: 2, haste: 1.5, shots: 1, shotsFor: 2, patch: { bnWave: true, n: 4, fan: 0.22, dmg: 113, steal: 0.25, speed: 26, range: 8, r: 0.45, vis: 'wave' } },
        then: { id: 'tinhbao2', look: 'bnStarburst', do: 'beam', windup: 0, range: 8, width: 1.6, dmg: 263, fx: { lostHp: 0.2, air: 1 } }, icon: 'swords',
        desc: 'Biến mất 1,5 giây, chém mười lăm nhát vào vòng 4,5 m quanh mình, mỗi nhát 50 chia đều cho mọi kẻ trúng, làm chậm 50% và chặn hồi máu. Rồi hiện ra tung nhát cuối về phía con trỏ: 263 sát thương cộng 20% máu đã mất của kẻ trúng (sát thương chuẩn), hất tung 1 giây.' },
    ],
  },
  // Hoa Mộc Lan: ported from the owner's earlier game (clip BV1Kp4y1b7i6 p82, notes in ~/handoff/dtt-ref/bili/mulan/NOTES.md).
  // Their numbers are % of attack; here attack = one Kiếm Khí blow (150): Liệt Không 134% -> 200, sword field 67%/s -> 100,
  // Kinh Hồng 127% x1.25 per sweep -> 190/238/297 + 3% max hp, Liên Thành 446% at no charge -> 670 (1340 full).
  moclan: {
    name: 'Hoa Mộc Lan', role: 'Đấu sĩ', roleKey: 'bruiser', price: 1800, tint: 0xc23a4a,
    blurb: 'Nữ tướng cầm trọng kiếm: gọi cự kiếm từ trời rơi xuống rồi lao ra sau lưng địch, quét ba nhát hất kẻ địch về phía mình, tụ lực chém một đường kiếm thật dài. Năm đòn liền trúng một kẻ thì làm nó câm lặng.',
    hp: 2900, speed: 6.4, radius: 0.82,
    armor: 0.11, accel: 1.1, turn: 12, towerMul: 1.2,
    passive: { do: 'stacks', name: 'Cân Quắc Anh Hùng', n: 5, dur: 4, on: 'any', fx: { maxHp: 0.08, silence: 1, slow: 0.6, slowDur: 2 }, self: { guard: 0.75, dur: 1 }, look: 'mlBloom',
      desc: 'Năm đòn liền trúng một kẻ địch thì nó lãnh thêm 8% máu tối đa, câm lặng 1 giây (không dùng được chiêu) và chậm 60% trong 2 giây; bạn được Cân Quắc 1 giây. Cân Quắc (cả lúc Kinh Hồng và Liên Thành): đỡ 75% sát thương, miễn khống chế.' },
    weapon: { name: 'Kiếm Khí', cd: 0.5, dmg: 150, n: 1, fan: 0, speed: 30, range: 6.5, r: 0.3, vis: 'wave' },
    skills: [
      { id: 'liekhong', name: 'Liệt Không Trảm', cd: 8, do: 'barrage', n: 1, cast: 9, radius: 0, blast: 2.6, delay: 0.35, span: 0, dmg: 200, fx: { slow: 0.5, slowDur: 2 },
        linger: { radius: 2.6, dur: 3.5, dps: 100, slow: 0.3, vis: 'mlSword' }, look: 'mlSword', icon: 'pierce',
        next: { window: 2, onHit: true, row: { id: 'phakhong', name: 'Phá Không Trảm', do: 'warp', dist: 12, glide: 30, behind: { next: true, far: true }, look: 'mlDash' } },
        desc: 'Gọi cự kiếm rơi xuống chỗ con trỏ (xa nhất 9 m): 200 sát thương vòng 2,6 m, chậm 50% trong 2 giây. Kiếm cắm lại 3,5 giây, mỗi giây chém 100 kẻ đứng quanh và làm chậm. Trúng ai thì trong 2 giây bấm lại để Phá Không Trảm: lướt vút qua ra sau lưng kẻ đó.' },
      { id: 'kinhhong', name: 'Kinh Hồng Tam Thức', cd: 10, do: 'nova', windup: 0.25, repeat: 3, gap: 0.6, radius: 4, arc: 1.15, dmg: 190, grow: 1.25, knock: 1.2,
        last: { maxHp: 0.03 }, guard: 0.75, look: 'mlSweep', icon: 'swords',
        desc: 'Quét trọng kiếm ba nhát về phía trước (quạt 130°, 4 m): 190, rồi mỗi nhát mạnh hơn 25%, hất kẻ trúng ra xa; nhát cuối thêm 3% máu tối đa sát thương chuẩn. Trong lúc quét được Cân Quắc.' },
      { id: 'lienthanh', name: 'Không Bạo Liên Thành Trảm', cd: 40, do: 'beam', move: 0, range: 16, width: 3.6, dmg: 1340, knock: 2.5, guard: 0.75, look: 'mlBlade', icon: 'rage',
        charge: { min: 0.3, max: 3, dmg: [670, 1340], range: [8, 16], width: [2.4, 3.6] },
        desc: 'Đứng tụ lực tối đa 3 giây (được Cân Quắc), bấm lại để chém: một đường kiếm thẳng trước mặt 670 sát thương dài 8 m, tụ đủ thì 1340 dài 16 m, rộng hơn, hất văng mọi kẻ trúng.' },
    ],
  },
  // An Dương Vương = 后羿 Hậu Nghệ: ported from the owner's earlier game (clip BV1Kp4y1b7i6 p6 "3.后羿", tooltips in ~/handoff/dtt-ref/kits/AUDIT-a.md).
  // Attack = one Thần Cung arrow (150; the passive's +50% damage and arrow speed are folded in): Tiễn Vô Hư Phát 150% -> 225 an arrow,
  // at most 225% (338) on one foe a cast (perTarget 2, sameDecay 0.5: 225 + 112.5). Cooldowns 8 / 8 / 30 s in the clip -> 10 / 10 / 50.
  // The pierce falloff digit is unreadable in the clip: 20% here. Kit-remake G5 fields (sim.js block "kit-remake G5 An Dương Vương"):
  // passive crit {chance, mul, kill}, row rootOk, transform adHeal / adKill, weapon adFall.
  anduong: {
    name: 'An Dương Vương', role: 'Bắn tỉa', roleKey: 'sniper', price: 1800, tint: 0x8a6a2a,
    blurb: 'Thần xạ cầm cung lửa: tên bay nhanh, có khi trúng chỗ hiểm. Lộn người né đòn rồi bắn lại ngay năm mũi tên tỏa quạt, nổi cơn phục thù để tên xuyên hàng, hạ được ai thì cơn giận kéo dài.',
    hp: 2100, speed: 6.0, radius: 0.80,
    armor: 0.05, accel: 1.0, turn: 11, towerMul: 1.0,
    passive: { do: 'trait', name: 'Tinh Chuẩn', crit: { chance: 0.25, mul: 1.5, kill: { add: 0.05, dur: 5, max: 5 } },
      desc: 'Tên của Thần Cung bay nhanh và đau. Mỗi mũi tên thường có 25% trúng chỗ hiểm, gây gấp rưỡi sát thương. Mỗi lần hạ gục thêm 5% cơ hội đó trong 5 giây, cộng dồn tới 5 lần.' },
    weapon: { name: 'Thần Cung', cd: 0.55, dmg: 150, speed: 60, range: 15, r: 0.2, vis: 'dart' },
    skills: [
      { id: 'sucthe', look: 'adRoll', name: 'Súc Thế Đãi Phát', cd: 10, do: 'dash', dist: 4, speed: 26, dmg: 0, rootOk: true,
        self: { on: 'cast', dur: 2, haste: 1.5, guard: 0.5, vs: 'skill' }, cdCut: { slot: 's2', set: 0, on: 'cast' }, icon: 'dash',
        desc: 'Lộn người về phía trước 4 m (dùng được cả khi bị giữ chân): trong 2 giây chạy nhanh hơn 50% và chỉ chịu một nửa sát thương từ chiêu. Tiễn Vô Hư Phát hồi chiêu ngay.' },
      { id: 'tienvohu', look: 'adFan', name: 'Tiễn Vô Hư Phát', cd: 10, do: 'volley', n: 5, fan: 0.12, dmg: 225, speed: 44, range: 15, r: 0.22, perTarget: 2, sameDecay: 0.5,
        fx: { slow: 0.5, slowDur: 2, slowDecay: true }, vis: 'dart', icon: 'ricochet',
        desc: 'Bắn năm mũi tên lửa tỏa quạt, mỗi mũi trúng gây 225 sát thương và làm chậm 50%, nhạt dần trong 2 giây. Một kẻ địch lãnh tối đa 338 sát thương mỗi lần bắn. Không trúng chỗ hiểm.' },
      { id: 'bachbo', look: 'adFrenzy', name: 'Bách Bộ Xuyên Dương', cd: 50, do: 'transform', dur: 10, haste: 1.25, dmg: 1.25, adHeal: 0.25, towerMul: 0.25,
        self: { on: 'cast', dur: 10, guard: 0.25 }, weapon: { name: 'Xuyên Dương Tiễn', pierce: true, adFall: 0.2, r: 0.26, vis: 'rail' },
        adKill: { extend: 5, reset: ['s1'], dur: 5, critDmg: 0.25, steal: 0.25 }, icon: 'rage',
        desc: 'Hồi ngay 25% máu tối đa rồi nổi Phục Thù Cuồng Nhiệt 10 giây: chạy nhanh hơn 25%, sát thương +25%, chịu ít hơn 25% sát thương, tên xuyên qua mọi kẻ địch (mỗi kẻ xuyên qua tên yếu đi 20%). Hạ gục trong lúc đó: kéo dài thêm 5 giây, Súc Thế Đãi Phát hồi chiêu ngay, và 5 giây chỗ hiểm đau thêm 25%, tên hút 25% máu. Sát thương lên công trình giảm 75%.' },
    ],
  },
  // Doraemon: ported from the owner's earlier game (clip BV1Kp4y1b7i6 p58 "55.蓝胖子", panel 蓝胖子II, audit AUDIT-a.md). Attack = one
  // Súng Bóng (150, was 118 per 0.32 s, about the same dps): door heal 213% -> 320, trap heal 209% -> 314, trap 50% per 0.5 s -> 75,
  // vortex 335% -> 503. Cooldowns 8 / 6 / 25 s -> 10 / 8 / 45. The MP of the trap heal is dropped. Weakened (虚弱): the trap tags
  // ctT, the vortex tags ctV; the other skill on a tagged foe adds 10% of its max hp and roots it 2 s (vortex: vsTag; trap: K14).
  // The one-use door, the trap field and the Bamboo-copter flight (untargetable by skills) are kit-remake K14.
  chuottui: {
    name: 'Doraemon', role: 'Hỗ trợ', roleKey: 'support', price: 1700, tint: 0xc98a4a,
    blurb: 'Mèo máy bảo bối: bị bắn thì chạy nhanh, sắp gục thì bật chong chóng tre bay đi. Đặt Cửa Thần Kỳ cho đồng đội về bên mình, gài bẫy trò đùa khóa chiêu, ném máy tạo xoáy hút cả đám vào giữa.',
    hp: 2200, speed: 6.8, radius: 0.80,
    armor: 0.04, accel: 1.2, turn: 13, towerMul: 2.2,
    passive: { do: 'trait', name: 'Trúc Tinh Đình', ctFly: { below: 0.3, dur: 4, haste: 1.5, icd: 30 }, mods: { onHurt: { by: 'any', self: { haste: 1.25, dur: 2 } } },
      desc: 'Trúng đòn thì chạy nhanh thêm 25% trong 2 giây. Tụt dưới 30% máu thì bật chong chóng tre bay 4 giây: chiêu địch không nhắm trúng, chạy nhanh thêm 50%; 30 giây một lần, dùng chiêu là đáp xuống.' },
    weapon: { name: 'Súng Bóng', cd: 0.4, dmg: 150, speed: 28, range: 12.5, r: 0.26, vis: 'pulse' },
    skills: [
      { id: 'nhamymon', look: 'ctDoor', name: 'Nhậm Ý Môn', cd: 10, do: 'portal', cast: 10, dur: 4, r: 1.4, ctDoor: { heal: 320, vanish: 1 }, icon: 'warp',
        desc: 'Đặt Cửa Thần Kỳ ở con trỏ (xa nhất 10 m) trong 4 giây. Đồng đội bước vào thì ra ngay cạnh bạn; bạn bước vào thì về chỗ vừa đặt cửa. Người qua cửa hồi 320 máu và biến mất 1 giây (không bị nhắm trúng). Cửa dùng được một lần.' },
      { id: 'baytrodua', look: 'ctTrap', name: 'Ác Tác Kịch Hãm Tỉnh', cd: 8, do: 'zone', at: 'target', cast: 10, radius: 3, dur: 3, dps: 150, slow: 0.3, vis: 'ctTrap',
        ctTrap: { delay: 0.5, linger: 1, heal: 314, tag: 3, pay: { maxHp: 0.1, root: 2 } }, icon: 'cage',
        desc: 'Mất 0,5 giây gài bẫy trò đùa ở con trỏ (xa nhất 10 m), giữ 3 giây. Địch trong bẫy không dùng được chiêu, chậm 30%, mất 75 máu mỗi 0,5 giây, ra khỏi bẫy còn bị vậy thêm 1 giây và bị Suy Yếu 3 giây. Đồng đội đi qua hồi 314 máu và sạch hiệu ứng xấu (mỗi người một lần). Kẻ đang Suy Yếu vì Máy Tạo Xoáy mà rơi vào bẫy: thêm 10% máu tối đa của nó và bị giữ chân 2 giây.' },
      { id: 'maytaoxoay', look: 'ctVortex', name: 'Toàn Qua Chế Tạo Cơ', cd: 45, do: 'barrage', n: 1, radius: 0, blast: 4.5, dmg: 503, delay: 0.6, span: 0, cast: 12,
        fx: { yank: { dist: 6, to: 'centre' }, tag: { key: 'ctV', dur: 3 } }, vsTag: { key: 'ctT', fx: { maxHp: 0.1, root: 2 }, consume: true }, icon: 'magnet',
        desc: 'Ném Máy Tạo Xoáy tới con trỏ (xa nhất 12 m): sau 0,6 giây nổ 503 sát thương vòng 4,5 m và hút mọi kẻ trúng vào giữa, kẻ trúng bị Suy Yếu 3 giây. Kẻ đang Suy Yếu vì bẫy trò đùa: thêm 10% máu tối đa của nó và bị giữ chân 2 giây.' },
    ],
  },
  // Kurumi: ported from the owner's earlier game (clip BV1Kp4y1b7i6 p61 "58.时光女神", tooltips in ~/handoff/dtt-ref/kits/AUDIT-c.md).
  // Attack = 150 (pilot scale). Passive (the Q's 被动): 100 energy, 20 a shot -> a 5-shot magazine, 1 s reload (G4 mag); range +50% (13 -> 19)
  // and through walls (G2 thruWalls); a hit bursts round the mech for 50% -> 75, growing with the distance flown up to 100% -> 150 (G4
  // far.ramp x2 at 19 m; our splash is 0.6 x the hit); allies in the burst heal 100% -> 150 (G5 weapon krHeal). Q 75% -> 112 hp/s from a
  // totem with 50% of her hp (975) that loses its hp over 10 s (G4 totem). E 175% -> 262 + sleep 4 s (G3). Ult: allies in range are marked
  // 2 s (G5 rewind fwd): 25% less skill damage meanwhile, then their hp goes back to what it was at the press; her fire rate x2.5 for 4 s
  // (G1 self). "+100 energy for allies" is dropped (pilot rule). Cooldowns 8 / 8 / 30 s in the clip -> 11 / 10 / 50.
  vesau: {
    name: 'Kurumi', role: 'Hỗ trợ', roleKey: 'support', price: 1700, tint: 0x3a1a2a,
    blurb: 'Nữ thần thời gian: súng tầm xa xuyên tường, đạn nổ càng xa càng đau và hồi máu đồng đội trong vụ nổ. Đặt thủ hộ thời quang hồi máu, ru ngủ kẻ địch, đánh dấu cả đội để máu quay về như lúc trước.',
    hp: 1950, speed: 6.8, radius: 0.78,
    armor: 0.04, accel: 1.2, turn: 13, towerMul: 1.8,
    passive: { do: 'trait', name: 'Thời Quang Thủ Hộ',
      desc: 'Băng đạn 5 viên, bắn hết thì nạp lại trong 1 giây. Đạn bay xa 19 m, xuyên vật cản; trúng ai thì nổ quanh kẻ đó, càng bay xa càng đau (tới gấp đôi). Đồng đội đứng trong vụ nổ được hồi 150 máu.' },
    weapon: { name: 'Đạn Thời Gian', cd: 0.35, dmg: 75, speed: 32, range: 19, r: 0.22, splash: 2.2, splashHit: true, thruWalls: true, far: { ramp: { per: 0.055, max: 2 } },
      mag: { n: 5, reload: 1 }, krHeal: 150, vis: 'bullet' },
    skills: [
      { id: 'thuho', look: 'krGuard', name: 'Thời Quang Thủ Hộ', cd: 11, do: 'totem', cast: 10, radius: 5, hp: 975, decay: 97.5, dur: 10, hps: 112, icon: 'heal',
        desc: 'Triệu hồi thủ hộ thời gian ở con trỏ (xa nhất 10 m), có 975 máu, đứng yên và mất dần máu trong 10 giây: đồng đội trong 5 m hồi 112 máu mỗi giây. Kẻ địch bắn vỡ được.' },
      { id: 'cannhieu', look: 'krSleep', name: 'Thời Gian Can Nhiễu', cd: 10, do: 'volley', n: 1, dmg: 262, speed: 30, range: 15, r: 0.3, fx: { sleep: 4 }, vis: 'bullet', icon: 'mark',
        desc: 'Bắn đạn nhiễu thời gian theo hướng ngắm (xa 15 m): kẻ trúng chịu 262 sát thương và ngủ 4 giây; bị đánh thì tỉnh.' },
      { id: 'hoito', look: 'krRewind', name: 'Thời Quang Hồi Tố', cd: 50, do: 'rewind', radius: 8, fwd: 2, guard: 0.25, self: { on: 'cast', rapid: 2.5, dur: 4 }, icon: 'refresh',
        desc: 'Đánh dấu hồi tố lên mọi đồng đội trong 8 m (kể cả bạn) 2 giây: trong lúc đó nhận ít hơn 25% sát thương từ chiêu, hết dấu thì máu quay về như lúc được đánh dấu. Trong 4 giây sau khi dùng, bạn bắn nhanh gấp 2,5 lần.' },
    ],
  },
};

export const MECH_ORDER = ['trau', 'soi', 'ung', 'hac', 'loi', 'bocap', 'bang', 'tho', 'thancong', 'mangxa', 'kimquy', 'hacho', 'holy', 'domdom', 'tacke', 'hoalong', 'khiphao', 'quancong', 'natra', 'duongtien', 'athena', 'hades', 'lubo', 'mucma', 'kynhong', 'nguma', 'sontinh', 'enbac', 'boica', 'bohung', 'cakiem', 'gilgamesh', 'buomdem', 'laclong', 'baogam', 'luondien', 'tegiac', 'quaset', 'tumay', 'dieuthuyen', 'thuytinh', 'samthep', 'cuuvi', 'kiemthan', 'suatrang', 'khidot', 'retdo', 'nhenthep', 'taothao', 'bongua', 'moclan', 'anduong', 'chuottui', 'vesau'];

// Bot tuning. aimErr: radians of aim noise; react: seconds before a new target is engaged;
// skill: chance per second to use a ready skill when it makes sense; lead: how well shots lead a moving target (0..1).
export const DIFFICULTY = {
  // foeDmg: damage multiplier of enemy bots in a solo match; foeLv: the share of the player's garage levels they get.
  easy:   { name: 'Dễ',   foeDmg: 0.65, foeLv: 0,   aimErr: 0.30, react: 0.75, skill: 0.25, lead: 0.2, focus: 0.3, retreat: 0.18, dodge: 0.0, fireDuty: 0.55 },
  normal: { name: 'Vừa',  foeDmg: 0.85, foeLv: 0.5, aimErr: 0.14, react: 0.40, skill: 0.6,  lead: 0.6, focus: 0.6, retreat: 0.28, dodge: 0.35, fireDuty: 0.8 },
  hard:   { name: 'Khó',  foeDmg: 1,    foeLv: 1,   aimErr: 0.05, react: 0.18, skill: 1.0,  lead: 0.95, focus: 1.0, retreat: 0.35, dodge: 0.8, fireDuty: 1 },
};

export const BOT_NAMES = ['Tí Sắt', 'Mèo Mun', 'Cò Lả', 'Bão Số 9', 'Ông Kẹ', 'Chuồn Kim', 'Gió Chướng', 'Nắp Chai', 'Bánh Tét', 'Sấm Rền',
  'Lúa Non', 'Đá Cuội', 'Chớp Bể', 'Mưa Nguồn', 'Cua Đồng', 'Tre Già', 'Bụi Đời', 'Sao Hôm', 'Kiến Lửa', 'Vịt Bầu'];

export const REWARDS = { win: 145, lose: 72, draw: 96, perKill: 10, perAssist: 5, mvp: 48, xpWin: 100, xpLose: 60, xpPerKill: 5 };
export const levelXp = (level) => 200 + (level - 1) * 120;

// Destructible props. Barrels explode when destroyed and hurt the destroyer's enemies.
export const PROPS = {
  crate:  { hp: 320, r: 0.8 },
  barrel: { hp: 110, r: 0.6, blast: { radius: 3.6, dmg: 360, knock: 3 } },
  pot:    { hp: 50,  r: 0.5 },
};

// Garage upgrades. Five tracks per mech, UPGRADE.max levels each; lv = [giap, dongco, hoaluc, napdan, chieu].
// cost(level) is the price in coins of going from level to level + 1 on one track.
export const UPGRADE = { max: 5, cost: (level) => 120 + level * 90, perkAt: [6, 12, 18] };
export const TRACKS = [
  { key: 'giap',   name: 'Vỏ giáp',   desc: 'Máu +13%, giáp +2,4% mỗi cấp',       hp: 0.13, armor: 0.024 },
  { key: 'dongco', name: 'Động cơ',   desc: 'Tốc độ +3%, gia tốc +6% mỗi cấp',    speed: 0.03, accel: 0.06 },
  { key: 'hoaluc', name: 'Hỏa lực',   desc: 'Sát thương +14% mỗi cấp',            dmg: 0.14 },
  { key: 'napdan', name: 'Nạp đạn',   desc: 'Bắn nhanh +5%, tầm bắn +2% mỗi cấp', rate: 0.05, range: 0.02 },
  { key: 'chieu',  name: 'Lõi chiêu', desc: 'Hồi chiêu nhanh hơn 5% mỗi cấp',     cd: 0.05 },
];
export const NO_LV = [0, 0, 0, 0, 0];
// What a room with humans on both teams plays at, whatever each player owns.
export const FAIR_LV = [3, 3, 3, 3, 3];
export const cleanLv = (lv) => NO_LV.map((_, i) => Math.max(0, Math.min(UPGRADE.max, Math.floor(Array.isArray(lv) ? Number(lv[i]) || 0 : 0))));
export const perkCount = (lv) => { const n = lv.reduce((a, b) => a + b, 0); return UPGRADE.perkAt.filter((at) => n >= at).length; };

// Skill milestones: PERKS[mech][i] unlocks when the mech's total upgrade level reaches UPGRADE.perkAt[i].
// slot: 'weapon' or the skill index; patch: fields written over that row.
const perk = (name, desc, slot, patch) => ({ name, desc, slot, patch });
export const PERKS = {
  trau: [perk('Lưỡi Nặng', 'Thẩm Phán Chi Kiếm gây 340 sát thương.', 0, { dmg: 340 }), perk('Xung Phong', 'Hãn Vệ Tự Do dài 8,5 m, rộng 3,6 m.', 1, { range: 8.5, width: 3.6 }), perk('Kỵ Sĩ Bền', 'Thẩm Phán Kỵ Sĩ kéo dài 10 giây.', 2, { dur: 10 })],
  soi: [perk('Rocket Thứ Tư', 'Rocket Chùm bắn bốn quả.', 0, { n: 4 }), perk('Bền Hơi', 'Tăng Áp kéo dài 5,5 giây.', 1, { dur: 5.5 }), perk('Mưa Dày', 'Mưa Hỏa Tiễn dội 12 quả.', 2, { n: 12 })],
  ung: [perk('Băng Đạn Lớn', 'Súng Ưng chứa 8 viên.', 'weapon', { mag: { n: 8, reload: 1.2 } }), perk('Mắt Rộng', 'Hàn Ngưng Thị soi rộng 6,5 m.', 0, { radius: 6.5 }), perk('Chim Ưng Dữ', 'Liệt Phong Chuẩn gây 300.', 2, { dmg: 300 })],
  hac: [perk('Suối Đầy', 'Suối Hồi Phục hồi 310 mỗi giây.', 0, { hps: 310 }), perk('Trì Trệ Sâu', 'Trường Trì Trệ làm chậm 60%.', 1, { slow: 0.6 }), perk('Vòm Bền', 'Vòm Bảo Hộ kéo dài 7 giây.', 2, { dur: 7 })],
  loi: [perk('Sét Nặng', 'Lôi Tiễn gây 170.', 'weapon', { dmg: 170 }), perk('Sáu Lần Nảy', 'Thiểm Điện Đạn Xạ nảy sáu lần.', 1, { fx: { maxHp: 0.03, chain: { n: 6, r: 6, mul: 0.75, seq: { falloff: 0.75 } } } }), perk('Vùng Sét Rộng', 'Lôi Thần Chi Chùy để lại vùng lôi điện 4 m.', 2, { torZone: { radius: 4, dur: 4, dps: 128, slow: 0.5, vis: 'torHammer' } })],
  bocap: [perk('Phun Dài', 'Tử Vong Thôn Phệ phun sáu đợt.', 0, { repeat: 6 }), perk('Ô Nhiễm Lâu', 'Trí Mạng Ô Nhiễm kéo dài 4 giây.', 1, { dur: 4 }), perk('Bạo Phát Rộng', 'Độc Tố Bạo Phát rộng 8,5 m.', 2, { radius: 8.5 })],
  bang: [perk('Gai Buốt', 'Gai Băng gây 165.', 'weapon', { dmg: 165 }), perk('Vòng Rộng', 'Băng Sương Chi Hoàn rộng 3,8 m.', 0, { blast: 3.8 }), perk('Bão Dai', 'Băng Thiên Tuyết Địa giáng sáu đợt.', 2, { channel: { dur: 3.65, every: 0.6, move: 0 }, self: { on: 'cast', dur: 3.65, guard: 0.25 } })],
  tho: [perk('Hạt Nặng', 'Lạp Tử Năng Lượng gây 480 sát thương.', 0, { dmg: 480 }), perk('Mưa Dày', 'Phi Đạn Không Tập phủ rộng 4,5 m.', 1, { blast: 4.5, radius: 2.25 }), perk('Lò Phản Ứng', 'Ngõa Giải Xạ Tuyến dài 20 m.', 2, { range: 20 })],
  thancong: [perk('Lõi Vonfram', 'Đạn Xuyên gây 1000.', 1, { dmg: 1000 }), perk('Chốt Nhanh', 'Cắm Chốt chỉ mất 0,35 giây.', 0, { setup: 0.35 }), perk('Mười Một Quả', 'Oanh Tạc dội 11 quả.', 2, { n: 11 })],
  mangxa: [perk('Nhìn Xa', 'Tử Vong Ngưng Thị với xa 8,5 m.', 0, { radius: 8.5 }), perk('Rắn Dai', 'Bí Thuật Dị Xà nảy thêm 1 lần.', 1, { fx: { enSteal: 5, chain: { n: 5, r: 6, mul: 1.1, seq: { falloff: 1.1 }, fx: { enSteal: 10 } } } }), perk('Đàn Rắn', 'Ma Xà Chi Xúc phóng năm con rắn mỗi đợt.', 2, { n: 5, fan: 0.14 })],
  kimquy: [perk('Khiên Dày', 'Khiên Tặng hấp thụ 1000.', 0, { amount: 1000, shield: 1000 }), perk('Gai Mai', 'Mai Rùa phản 50%.', 1, { reflect: 0.5 }), perk('Thành Vững', 'Thành Đồng kéo dài 6,5 giây.', 2, { dur: 6.5 })],
  hacho: [perk('Móng Sắc', 'Vồ gây 300.', 0, { dmg: 300 }), perk('Nộ Dai', 'Cuồng Nộ kéo dài 5,5 giây.', 1, { dur: 5.5 }), perk('Án Tử', 'Dấu Tử kết liễu dưới 28% máu.', 2, { execute: 0.28 })],
  holy: [perk('Bom Ảnh', 'Bản sao nổ 260.', 0, { dmg: 260 }), perk('Bước Xa', 'Xuyên Tường xa 9,5 m.', 1, { dist: 9.5 }), perk('Bốn Bóng', 'Vũ Điệu Ảo Ảnh thả bốn bản sao.', 2, { n: 4 })],
  domdom: [perk('Mắt Gió Rộng', 'Ai Nga La Tư Chi Nhãn mở rộng 3,6 m.', 0, { blast: 3.6 }), perk('Giáo Nặng', 'Phong Chi Đầu Thương gây 190.', 1, { dmg: 190 }), perk('Thần Điện Rộng', 'Phong Nha Thần Điện rộng 7 m.', 2, { radius: 7, ddTemple: { delay: 1, every: 1.5, n: 3, r: 7, block: 0.5, heal: 0.05, lostHp: 0.05, first: 2, pull: 1.5, step: 0.2, max: 0.5, dur: 1.75 } })],
  tacke: [perk('Vinh Quang Dài', 'Khiên vinh quang kéo dài 1,75 giây.', 0, { bubble: 1.75 }), perk('Khiên Nặng', 'Khiên bay về gây 280, choáng 1,2 giây.', 1, { back: { dmg: 280, fx: { stun: 1.2 }, cut: 0.15 } }), perk('Nảy Ba', 'Khiên Nảy nảy tường ba lần.', 'weapon', { bounce: 3 })],
  hoalong: [perk('Giáp Dày', 'Phá Ngục Viêm Nhận hút 300 sát thương.', 0, { amount: 300 }), perk('Sao Rơi Rộng', 'Viêm Lưu Trụy Tinh giáng rộng 3,6 m.', 1, { radius: 3.6 }), perk('Hơi Nham Rộng', 'Viêm Chi Thẩm Phán nổ rộng 5,8 m.', 2, { nova: { windup: 2, radius: 5.8, dmg: 1088, fx: { hlCore: { dur: 1.5, r: 2.5 } } } })],
  khiphao: [perk('Pháo Đằm', 'Pháo Tép làm chậm hoặc làm yếu với 45% quả.', 'weapon', { fx: { chance: 0.45, pick: [{ slow: 0.35, slowDur: 1.5 }, { weaken: { mul: 0.8, dur: 2 } }] } }), perk('Bẫy Dày', 'Mìn của Chuồn Lẹ nổ 360.', 1, { onStart: { mine: { trigger: 2, blast: 3, dmg: 360, arm: 0.4, life: 8, fx: { slow: 0.4, slowDur: 1.5 } } } }), perk('Mười Sáu Quả', 'Hội Pháo Hoa dội 16 quả.', 2, { n: 16 })],
  quancong: [perk('Đao Dài', 'Đao Khí bay xa 8 m.', 'weapon', { range: 8 }), perk('Xung Mạnh', 'Xung Phong gây 260 và choáng 0,8 giây.', 0, { dmg: 260, stun: 0.8 }), perk('Án Trảm', 'Trảm Tướng kết liễu dưới 32% máu.', 2, { fx: { execute: 0.32 } })],
  natra: [perk('Vòng Lớn', 'Càn Khôn Quyển gây 260.', 0, { dmg: 260 }), perk('Bánh Xe Dài', 'Phong Hỏa Luân lao xa 11 m.', 1, { dist: 11 }), perk('Giáng Mạnh', 'Thiên Giáng rộng 4 m, gây 760.', 2, { radius: 4, dmg: 760 })],
  duongtien: [perk('Tam Tiêm Nặng', 'Tam Tiêm gây 175.', 'weapon', { dmg: 175 }), perk('Khuyển Xa', 'Hao Thiên Khuyển chạy 15 m.', 1, { range: 15 }), perk('Phá Diệt Rộng', 'Phá Diệt Hoành Tảo quét rộng 5,5 m.', 2, { radius: 5.5 })],
  athena: [perk('Thánh Quang Nặng', 'Chiến Tranh Nghệ Thuật gây 300.', 0, { dmg: 300 }), perk('Thuẫn Dày', 'Thánh Thuẫn Tí Hựu hấp thụ 900 trong 2,5 giây.', 1, { shield: 900, dur: 2.5 }), perk('Bất Hủ Lâu', 'Anh Hùng Bất Hủ kéo dài 4 giây.', 2, { dur: 4, undying: 4 })],
  hades: [perk('Đổi Thế Nhanh', 'Hình Thái Chuyển Hoán hồi trong 6,5 giây.', 0, { cd: 6.5 }), perk('Lưỡi Rộng', 'Minh Vương Lợi Nhận thế Chế Tài chém quạt 7 m.', 1, { radius: 7 }), perk('Lĩnh Vực Rộng', 'Minh Vương Lĩnh Vực rộng 6 m, kéo dài 5 giây.', 2, { hdDomain: { radius: 6, dur: 5, fear: 0.6 } })],
  lubo: [perk('Kích Dài', 'Phương Thiên Kích với xa 9 m.', 'weapon', { range: 9 }), perk('Định Thân Lâu', 'Tuy Viễn Tất Tru giữ chân 1,5 giây.', 0, { fx: { root: 1.5 } }), perk('Quỷ Thần Uy', 'Quỷ Thần Giáng Lâm giáng rộng 5 m.', 2, { radius: 5 })],
  mucma: [perk('Bốn Xúc Tu', 'Xúc Tu bắn bốn đường.', 'weapon', { n: 4, fan: 0.12 }), perk('Săn Xa', 'Cơ Ngạ Bộ Liệp lao xa 9,5 m.', 1, { dist: 9.5 }), perk('Hách Tử Lâu', 'Hách Tử Tiến Hóa kéo dài 6,5 giây.', 2, { dur: 6.5, ccImmune: 6.5 })],
  kynhong: [perk('Quyền Nặng', 'Hỏa Quyền gây 170.', 'weapon', { dmg: 170 }), perk('Long Viêm Dài', 'Long Thần Hoàng Viêm phun xa 10 m, gây 230.', 1, { range: 10, dmg: 230 }), perk('Lôi Viêm Lâu', 'Lôi Viêm Cuồng Long kéo dài 10 giây.', 2, { dur: 10 })],
  nguma: [perk('Rìu Nặng', 'Rìu Chấn gây 215.', 'weapon', { dmg: 215 }), perk('Húc Xa', 'Cuồng Dã Giác Tập lao xa 11 m, gây 320.', 1, { dist: 11, dmg: 320 }), perk('Đoạn Dã Rộng', 'Tàn Phong Đoạn Dã rộng 5,5 m, gây 680.', 2, { width: 5.5, dmg: 680 })],
  sontinh: [perk('Đá Nặng', 'Đá Lăn gây 250.', 'weapon', { dmg: 250 }), perk('Trớ Chú Rộng', 'Đại Địa Trớ Chú rộng 6 m.', 0, { radius: 6 }), perk('Thần Lâu', 'Sơn Thần đứng 15 giây.', 2, { dur: 16 })],
  enbac: [perk('Thương Xa', 'Song Thương bắn xa 15 m.', 'weapon', { range: 15 }), perk('Năm Đạo Đạn', 'Cân Tung Đạo Đạn phóng năm tên lửa.', 1, { n: 5 }), perk('Pháo Rộng', 'Lôi Xạ Đại Pháo rộng 2,2 m.', 2, { width: 2.2 })],
  boica: [perk('Nòng Sắc', 'Súng Lặn gây 390.', 'weapon', { dmg: 390 }), perk('Bẫy Bền', 'Bẫy Cảnh Giới làm chậm 60% trong 3 giây, lộ diện 7 giây, tồn tại 45 giây.', 1, { fx: { slow: 0.6, slowDur: 3, reveal: 7 }, life: 45 }), perk('Tia Chí Mạng', 'Khóa Mục Tiêu gây 2400, lấy đà 0,9 giây.', 2, { dmg: 2400, windup: 0.9 })],
  bohung: [perk('Pháo Nặng', 'Pháo Thiên Khải gây 260.', 'weapon', { dmg: 260 }), perk('Chấn Đãng Dài', 'Chấn Đãng Oanh Kích nện dải 8 m, gây 270.', 1, { range: 8, dmg: 270 }), perk('Phi Đạn Lớn', 'Phi Đạn Bạo Phá nổ rộng 3,5 m.', 2, { splash: 3.5 })],
  gilgamesh: [perk('Bảo Khí Nặng', 'Bảo Khí gây 170.', 'weapon', { dmg: 170 }), perk('Quai Ly Rộng', 'Thiên Địa Quai Ly xé vùng 4,2 m.', 1, { blast: 4.2, radius: 2.1 }), perk('Kho Báu Vô Tận', 'Vương Chi Tài Bảo xả 48 binh khí trong 4,8 giây.', 2, { burst: { n: 24, gap: 0.2 }, hasteDur: 4.8 })],
  laclong: [perk('Thủy Pháo Nặng', 'Thủy Pháo gây 210, nổ lan 2,4 m.', 'weapon', { dmg: 210, splash: 2.4 }), perk('Long Xung Mạnh', 'Cuồng Long Xung Phong gây 260.', 1, { dmg: 260 }), perk('Thủy Long Lâu', 'Giao Long Xuất Hải kéo dài 10 giây.', 2, { dur: 10 })],
  cakiem: [perk('Đao Dài', 'Tam Đao chém xa 8,5 m.', 'weapon', { range: 8.5 }), perk('Đỡ Lâu', 'Không Thủ Bạch Nhận đỡ đạn 2,6 giây.', 0, { dur: 2.6 }), perk('Sóng Lớn', 'Tam Thiên Thế Giới gây 560.', 2, { dmg: 560 })],
  buomdem: [perk('Cầu Thời Không', 'Thời Không Phóng Trục gây 280.', 0, { dmg: 280 }), perk('Cổng Xa', 'Thời Không Nữu Khúc xa 11 m, tới nơi nổ 300.', 1, { dist: 11, land: { radius: 3, dmg: 300 } }), perk('Lĩnh Vực Rộng', 'Ma Pháp Lĩnh Vực rộng 5,5 m.', 2, { blast: 5.5, linger: { radius: 5.5, dur: 4, vis: 'bdRealm' } })],
  baogam: [perk('Ba Vuốt', 'Vuốt Rung bắn ba đường.', 'weapon', { n: 3, fan: 0.08 }), perk('Huyết Tập Xa', 'Dã Tính Huyết Tập lao xa 9 m.', 1, { dist: 9 }), perk('Săn Lâu', 'Vương Chi Thú Liệp vồ tám nhát.', 2, { n: 8 })],
  luondien: [perk('Roi Dài', 'Roi Điện bắn xa 14 m.', 'weapon', { range: 14 }), perk('Mây Rộng', 'Lôi Vân Hãm Tịnh nổ rộng 3,2 m.', 1, { blast: 3.2 }), perk('Sóng Rộng', 'Điện Từ Can Nhiễu rộng 6,5 m.', 2, { radius: 6.5 })],
  tegiac: [perk('Nắm Đấm Nặng', 'Đấm Thẳng gây 175.', 'weapon', { dmg: 175 }), perk('Húc Mạnh', 'Nhận Chân Đầu Chùy rộng 3,4 m, gây 400.', 1, { radius: 3.4, dmg: 400 }), perk('Quạt Rộng', 'Nhận Chân Ẩu Đả mở quạt rộng hơn, dài tới 14 m.', 2, { fan: [0.55, 0.7], charge: { min: 0.3, max: 3, dmg: [474, 948], range: [8, 14], width: [7, 14] } })],
  quaset: [perk('Tiêu Xa', 'Phi Tiêu Sét bay xa 15 m.', 'weapon', { range: 15 }), perk('Lôi Xa', 'Lôi Thiết lao xa 11 m, gây 420.', 0, { dist: 11, dmg: 420 }), perk('Giáp Dày', 'Giáp Hộ Mệnh khiên 1200, kéo dài 8 giây.', 2, { shield: 1200, dur: 8 })],
  tumay: [perk('Cầu Nặng', 'Hắc Cầu gây 170.', 'weapon', { dmg: 170 }), perk('Pháp Cầu Bền', 'Quả cầu của Hỗn Độn Pháp Cầu ở lại 10 giây, nổ rộng 3 m.', 1, { leaveOrb: { dur: 10, blast: 3, dmg: 275 } }), perk('Phệ Sâu', 'Hỗn Độn Chi Phệ: mỗi quả cầu sau thêm 90 thay vì 75.', 2, { grow: 90 })],
  thuytinh: [perk('Giọt Xa', 'Giọt Nước bay xa 14,5 m.', 'weapon', { range: 14.5 }), perk('Màn Nước Dài', 'Thủy Mạc Bình Chướng dài bảy khối, đứng 5 giây.', 1, { n: 7, dur: 5 }), perk('Xoáy Lớn', 'Cuồng Lan Thúc Phược rộng 6 m.', 2, { radius: 6 })],
  samthep: [perk('Dầm Nặng', 'Thanh dầm thứ hai gây 330.', 0, { mgtSeq: [{ delay: 0.45, dmg: 186 }, { delay: 0.85, dmg: 330 }] }), perk('Nện Mạnh', 'Trọng Lực Phản Xung nện 340, rộng 4 m.', 1, { mgtSeq: [{ delay: 0.3, dmg: 0, fx: { lift: 1.5 } }, { delay: 1.8, dmg: 340, blast: 4, fx: { stun: 1 }, fxNew: true }] }), perk('Bão Dài', 'Từ Năng Phong Bạo kéo dài 7,5 giây, đánh 10 lần.', 2, { dur: 7.5, mgtStorm: { n: 10, dmg: 38, near: { r: 6, dmg: 150 } } })],
  dieuthuyen: [perk('Mị Lâu', 'Sí Nhiệt Mị Hoặc mê hoặc 1,4 giây.', 0, { fx: { charm: 1.4 } }), perk('Lướt Xa', 'Long Viêm Cuồng Vũ lướt xa 9 m.', 1, { dist: 9 }), perk('Quạt Nặng', 'Hoa Điệp Phi Phiến quay về gây 330.', 2, { back: { dmg: 330 } })],
  cuuvi: [perk('Chùm Bốn Quả', 'Chùm Hồ Hỏa bắn bốn quả, nổ lan 1,8 m.', 0, { n: 4, splash: 1.8 }), perk('Ảnh Bền', 'Ảo Ảnh bền 550 máu, ở lại 4 giây, nổ 180.', 1, { leave: { hp: 550, dur: 4, blast: 4, dmg: 180, fx: { slow: 0.5, slowDur: 2 } } }), perk('Mười Một Đuôi', 'Cửu Vĩ Hỏa thả 11 quả, mỗi quả 160.', 2, { n: 11, dmg: 160 })],
  kiemthan: [perk('Kiếm Nặng', 'Kiếm Phong gây 85.', 'weapon', { dmg: 85 }), perk('Kiếm Bay Xa', 'Long Tuyền Xuất Hạp bay xa 16 m.', 1, { range: 16 }), perk('Cửu Thiên Rộng', 'Cửu Thiên Thần Kiếm khóa mọi kẻ địch trong 10 m.', 2, { ktLock: 10 })],
  suatrang: [perk('Xích Ấm', 'Xích hồi máu hồi 190 mỗi giây cho cả hai.', 0, { tie: { hps: 190, drain: 10, range: 9 } }), perk('Bom Nặng', 'Siêu Năng Tạc Đạn gây 360.', 1, { dmg: 360 }), perk('Khiên Chiến Sĩ', 'Siêu Năng Chiến Sĩ che khiên 1300.', 2, { landShield: 1300 })],
  khidot: [perk('Gầm Vang', 'Chấn Không Nộ Hống rộng 6 m, gây 300.', 0, { radius: 6, dmg: 300 }), perk('Giẫm Lớn', 'Tử Vong Tiễn Đạp rộng 4,2 m, gây 280.', 1, { radius: 4.2, dmg: 280 }), perk('Nộ Dài', 'Dã Man Chi Nộ kéo dài 10 giây.', 2, { dur: 10 })],
  retdo: [perk('Dao Dày', 'Phóng Dao phóng bảy con.', 0, { burst: { n: 7, gap: 0.08 } }), perk('Thế Dài', 'Lộn Ngược giữ thế 0,8 giây, trả ba con dao 180.', 1, { window: 0.8, riposte: { volley: { n: 3, fan: 0.06, dmg: 180, speed: 34, range: 12, r: 0.22, vis: 'dart' } } }), perk('Loạn Sâu', 'Hỗn Loạn kéo dài 6 giây, thiêu 260 mỗi giây, hút 70%.', 2, { dur: 6, dps: 260, drain: 0.7 })],
  nhenthep: [perk('Khiên Dày', 'Cực Tốc Điền Sung cho khiên 35% máu tối đa.', 0, { selfShield: { frac: 0.35, dur: 4 } }), perk('Tơ Xa', 'Đạn Xạ Câu Trảo bay xa 16 m, chém 170 trên đường.', 1, { range: 16, nhWall: { dmg: 170, fx: { slow: 0.5, slowDur: 2 }, combo: 1 } }), perk('Xoáy Rộng', 'Hồi Toàn Trảm Kích rộng 4,6 m, gây 165.', 2, { radius: 4.6, dmg: 165 })],
  taothao: [perk('Kiếm Dài', 'Ỷ Thiên Kiếm gây 165.', 'weapon', { dmg: 165 }), perk('Tay Dài', 'Bá Đạo Chi Thủ kéo 4 m, rộng 3,5 m.', 1, { blast: 3.5, fx: { slow: 0.5, slowDur: 2, yank: { dist: 4, to: 'centre' } } }), perk('Khóa Lâu', 'Hiệp Thiên Tử khóa 3,5 giây.', 2, { tthHold: { dur: 3.5, every: 0.25, dmg: 30, redirect: 0.5, also: 0 } })],
  bongua: [perk('Kiếm Nặng', 'Song Kiếm gây 2 x 88.', 'weapon', { dmg: 88 }), perk('Sấm Rộng', 'Lôi Đình Thiên Giáng giáng vòng 4 m, giữ chân 1,5 giây.', 0, { land: { radius: 4, dmg: 191, fx: { root: 1.5 } } }), perk('Mười Tám Nhát', 'Tinh Bạo Khí Lưu Trảm chém mười tám nhát.', 2, { repeat: 18, invuln: 1.8 })],
  moclan: [perk('Kiếm Nặng', 'Kiếm Khí gây 170 mỗi nhát.', 'weapon', { dmg: 170 }), perk('Tam Thức Sâu', 'Kinh Hồng Tam Thức: mỗi nhát mạnh hơn nhát trước 35%.', 1, { grow: 1.35 }), perk('Cự Kiếm Lâu', 'Cự kiếm của Liệt Không Trảm cắm lại 5 giây.', 0, { linger: { radius: 2.6, dur: 5, dps: 100, slow: 0.3, vis: 'mlSword' } })],
  anduong: [perk('Cung Nhanh', 'Thần Cung bắn mỗi 0,5 giây.', 'weapon', { cd: 0.5 }), perk('Bảy Mũi Tên', 'Tiễn Vô Hư Phát bắn bảy mũi.', 1, { n: 7 }), perk('Phục Thù Lâu', 'Bách Bộ Xuyên Dương kéo dài 12 giây.', 2, { dur: 12, self: { on: 'cast', dur: 12, guard: 0.25 } })],
  chuottui: [perk('Súng Mạnh', 'Súng Bóng gây 170.', 'weapon', { dmg: 170 }), perk('Bẫy Dai', 'Bẫy trò đùa giữ 4 giây.', 1, { dur: 4 }), perk('Xoáy Lớn', 'Máy Tạo Xoáy nổ rộng 5,5 m, gây 600.', 2, { blast: 5.5, dmg: 600 })],
  vesau: [perk('Thủ Hộ Bền', 'Thời Quang Thủ Hộ có 1300 máu, hồi 140 máu mỗi giây.', 0, { hp: 1300, decay: 130, hps: 140 }), perk('Ngủ Say', 'Thời Gian Can Nhiễu gây 300, ru ngủ 5 giây.', 1, { dmg: 300, fx: { sleep: 5 } }), perk('Hồi Tố Rộng', 'Thời Quang Hồi Tố rộng 10 m.', 2, { radius: 10 })],
};

// The row a unit actually plays: the MECHS row with its upgrade levels and unlocked perks applied.
// Both ends of an online match build it from the same (key, lv), so nothing of it travels.
const DEF_CACHE = new Map();
export function buildDef(key, lv) {
  const base = MECHS[key];
  lv = cleanLv(lv);
  const id = key + ':' + lv.join('');
  if (DEF_CACHE.has(id)) return DEF_CACHE.get(id);
  const [g, d, h, n, c] = lv, [TG, TD, TH, TN, TC] = TRACKS;
  const raw = { ...base.weapon }, skills = base.skills.map((s) => ({ ...s }));
  (PERKS[key] || []).slice(0, perkCount(lv)).forEach((p) => Object.assign(p.slot === 'weapon' ? raw : skills[p.slot], p.patch));
  // the garage's fire-rate and range levels act on the main weapon (and on every form's weapon)
  const dress = (w) => {
    const o = { ...w };
    o.cd /= 1 + TN.rate * n;
    o.range *= 1 + TN.range * n;
    if (o.charge) o.charge = { ...o.charge, range: o.charge.range.map((r) => r * (1 + TN.range * n)) };
    return o;
  };
  for (const s of skills) s.cd *= 1 - TC.cd * c;
  const hp = Math.round(base.hp * (1 + TG.hp * g)), armor = (base.armor || 0) + TG.armor * g;
  const speed = base.speed * (1 + TD.speed * d), accel = (base.accel || 1) * (1 + TD.accel * d), dmgUp = 1 + TH.dmg * h;
  // One def per form (row.forms: [patch0, patch1], each { weapon, skills: { slot: patch }, speed, armor }); a unit with forms plays
  // def.formDefs[u.form] (the property is not enumerable, so a def can still be copied and printed). Both ends build them the same way.
  const make = (f, i) => {
    const wp = dress({ ...raw, ...(f && f.weapon) });
    const sk = skills.map((s, k) => (f && f.skills && f.skills[k] ? { ...s, ...f.skills[k] } : s));
    // transform.weapon: the weapon row a transform swaps in, built here so both ends of an online match agree
    const tfWeapon = {};
    sk.forEach((s, k) => { if (s.do === 'transform' && s.weapon) tfWeapon[k] = { ...wp, ...s.weapon }; });
    return { ...base, base, lv, weapon: wp, skills: sk, tfWeapon, hp, armor: armor + ((f && f.armor) || 0), speed: speed * ((f && f.speed) || 1), accel, dmgUp, form: i };
  };
  let def;
  if (base.forms) {
    const defs = base.forms.map(make);
    for (const x of defs) Object.defineProperty(x, 'formDefs', { value: defs, enumerable: false });
    def = defs[0];
  } else def = make(null, 0);
  DEF_CACHE.set(id, def);
  return def;
}
// The def a unit plays in form f (a mech without forms has only one).
export const formDef = (def, f) => (def.formDefs ? def.formDefs[f] || def : def);
export const upgradeCost = (lv) => lv.reduce((sum, l) => { for (let i = 0; i < l; i++) sum += UPGRADE.cost(i); return sum; }, 0);

// Cosmetics are whole skins per tank: js/skins.js.

// Premium currency. Earned by playing (GEMS) or handed out by the pretend shop (SHOP). One gem pays for GEM_RATE coins of any price.
export const GEM_RATE = 10;
export const GEMS = { levelUp: 20, mvp: 2, firstWin: 10 };
// The pretend shop: no payment of any kind happens. `vnd` is only a label. grants: gems, coins, mech, skin ('mech:id', js/skins.js), pass (days).
export const SHOP = [
  { id: 'khoidau', kind: 'starter', name: 'Gói Khởi Đầu', vnd: 29000, once: true, grants: { gems: 300, coins: 1000, mech: 'thancong', skin: 'thancong:s' }, note: 'Mua một lần' },
  { id: 'thethang', kind: 'pass', name: 'Thẻ Tháng', vnd: 99000, grants: { gems: 200, pass: 30 }, note: '30 ngày: xu sau trận +50%, mỗi ngày nhận 30 Tinh Thể' },
  { id: 'goi_hacho', kind: 'bundle', name: 'Gói Hắc Hổ', vnd: 79000, grants: { mech: 'hacho', skin: 'hacho:s', gems: 150 } },
  { id: 'goi_hoalong', kind: 'bundle', name: 'Gói Hỏa Long', vnd: 79000, grants: { mech: 'hoalong', skin: 'hoalong:s', gems: 150 } },
  { id: 'goi_holy', kind: 'bundle', name: 'Gói Hồ Ly', vnd: 79000, grants: { mech: 'holy', skin: 'holy:s', gems: 150 } },
  { id: 'tt1', kind: 'gems', name: 'Túi Tinh Thể', vnd: 20000, grants: { gems: 100 } },
  { id: 'tt2', kind: 'gems', name: 'Hộp Tinh Thể', vnd: 50000, grants: { gems: 280 }, note: '+12%' },
  { id: 'tt3', kind: 'gems', name: 'Rương Tinh Thể', vnd: 100000, grants: { gems: 600 }, note: '+20%' },
  { id: 'tt4', kind: 'gems', name: 'Kho Tinh Thể', vnd: 200000, grants: { gems: 1300 }, note: '+30%' },
  { id: 'tt5', kind: 'gems', name: 'Núi Tinh Thể', vnd: 500000, grants: { gems: 3500 }, note: '+40%' },
];
export const PASS = { coinMul: 1.5, daily: 30 };

// Rank by trophies: a win gives trophies.win, a loss takes trophies.lose (never below 0).
export const TROPHIES = { win: 22, lose: 12, draw: 4 };
export const RANKS = [
  { name: 'Sắt', min: 0, color: '#8d98a6' }, { name: 'Đồng', min: 100, color: '#c98a52' }, { name: 'Bạc', min: 250, color: '#cfd8e2' },
  { name: 'Vàng', min: 450, color: '#f2b632' }, { name: 'Bạch Kim', min: 700, color: '#7ee0d2' }, { name: 'Kim Cương', min: 1000, color: '#7fb8ff' },
];

// Game modes. tdm: team kills. chiem: hold control points for score. tudo: free-for-all, every mech is its own team.
// trum: the hunters against one boss, with a shared pool of lives.
// Each row is the 5v5 baseline (also used for any size above 3). `sizes[n]` overrides it for a match of n mechs a side
// (tudo: 2n mechs in all, trum: n hunters); nested objects (tower, respawn, crate) are merged field by field. See ruleFor.
export const MODES = {
  tdm:   { name: 'Đấu đội', blurb: 'Đội nào hạ gục đủ chỉ tiêu trước thì thắng.', target: 25, duration: 300, mission: 'Hạ gục đối thủ, đội nào chạm {target} điểm trước sẽ thắng',
           sizes: { 1: { target: 3, respawn: { base: 3 } }, 2: { target: 8, respawn: { base: 4 } }, 3: { target: 14, respawn: { base: 4 } } } },
  chiem: { name: 'Chiếm điểm', blurb: 'Giữ các cứ điểm để tích điểm. Hạ gục không tính điểm, chỉ mở đường.', target: 200, duration: 360, mission: 'Đứng trong vòng để chiếm cứ điểm, đội nào đủ {target} điểm trước sẽ thắng',
           radius: 4.6, captureTime: 4, every: 2.5,
           sizes: { 1: { target: 60 }, 2: { target: 180 }, 3: {} } },
  // Two-sided base mode. The main tower cannot be hurt while a secondary tower of its team stands. Respawns get longer as the match goes on.
  nha:   { name: 'Thủ nhà', blurb: 'Mỗi căn cứ có 2 trụ phụ và 1 trụ chính. Phá trụ chính của địch trước khi nhà mình sập.', target: 3, duration: 480, mission: 'Hạ hai trụ phụ rồi phá trụ chính của địch, đồng thời giữ trụ nhà',
           tower: { sub: 7000, main: 11000, radius: 1.7, range: 13, dmg: 270, cd: 1.0, windup: 0.4, speed: 32, aggro: 2 }, respawn: { base: 5, perMin: 1, max: 12 },
           sizes: {
             1: { tower: { sub: 3600, main: 5800 }, respawn: { base: 3.5, perMin: 0.6, max: 8 } },
             2: { tower: { sub: 5000, main: 8000 }, respawn: { base: 4, perMin: 0.8, max: 10 } },
             3: { tower: { sub: 5600, main: 9000 }, respawn: { base: 4, perMin: 0.8, max: 10 } } } },
  tudo:  { name: 'Hỗn chiến', blurb: 'Không đồng đội, mỗi cỗ máy tự đánh. Ai hạ gục đủ chỉ tiêu trước thì thắng.', target: 10, duration: 300, mission: 'Không có đồng đội: hạ gục {target} lần trước mọi người',
           sizes: { 1: { target: 3, respawn: { base: 3 } }, 2: { target: 6, respawn: { base: 3.5 } }, 3: { target: 8, respawn: { base: 4 } } } },
  trum:  { name: 'Săn trùm', blurb: 'Cả đội hợp sức hạ Cự Thần trước khi dùng hết số mạng.', target: 1, duration: 360, mission: 'Hạ Cự Thần trước khi cả đội dùng hết {lives} mạng', lives: 12,
           sizes: { 1: { bossHp: 0.17, lives: 4 }, 2: { bossHp: 0.33, lives: 6 }, 3: { bossHp: 0.5, lives: 9 } } },
};
// Mechs a side in a match: the larger team (tudo: half of all mechs; trum: the hunters, the boss does not count).
export function matchSize(mode, roster) {
  if (mode === 'tudo') return Math.max(1, Math.round(roster.length / 2));
  const n = [0, 0];
  for (const r of roster) if (!(BOSSES[r.mech])) n[r.team ? 1 : 0]++;
  return Math.max(1, n[0], mode === 'trum' ? 0 : n[1]);
}
// The rules of one mode at one team size: the mode row, the size override on top, `crate` (airdrops) from RULES.crate.
export function ruleFor(mode, size) {
  const base = MODES[mode], over = (base.sizes && base.sizes[size]) || {};
  const out = { ...base, ...over, size };
  if (base.tower) out.tower = { ...base.tower, ...(over.tower || {}) };
  out.respawn = { base: RULES.respawn, perMin: 0, max: RULES.respawn, ...(base.respawn || {}), ...(over.respawn || {}) };
  out.crate = { ...RULES.crate, ...(RULES.crateBySize[size] || {}), ...(over.crate || {}) };
  return out;
}
// The PvP modes a player picks in Đấu thường and online rooms. `trum` stays in MODES as the boss engine of Phó bản (PVE_* below), not a menu pick.
export const MODE_ORDER = ['tdm', 'nha', 'chiem', 'tudo'];

// Bosses use the same row shape as MECHS and the same skill primitives. heavy: shrugs off most stuns, knockback and pulls.
export const BOSSES = {
  titan: {
    name: 'Cự Thần', role: 'Trùm', roleKey: 'boss', boss: true, heavy: true, tint: 0xb02a2a,
    hp: 100000, speed: 3.4, radius: 2.5,
    weapon: { name: 'Tam Pháo', cd: 0.9, dmg: 420, n: 3, fan: 0.16, speed: 24, range: 18, splash: 2.2, r: 0.36, vis: 'shell' },
    skills: [
      { id: 'trum_dam', name: 'Dậm Đất', cd: 7.2, do: 'nova', windup: 1.1, radius: 8.5, dmg: 1240, slow: 0.5, slowDur: 2.5, knock: 4, icon: 'quake', desc: '' },
      { id: 'trum_lao', name: 'Xung Phong', cd: 9.6, do: 'dash', dist: 15, speed: 22, dmg: 1040, stun: 1.1, knock: 5, icon: 'dash', desc: '' },
      { id: 'trum_mua', name: 'Hỏa Vũ', cd: 12.8, do: 'barrage', n: 14, radius: 9, blast: 2.8, dmg: 660, delay: 1.1, span: 2.4, cast: 22, icon: 'barrage', desc: '' },
    ],
  },
};

/* ===== feat/dtt-modes: play kinds (Đấu thường, Đấu rank, Phó bản) ===== */
// casual: the player picks mode, arena, size; coins and XP, no trophies. rank: random PvP mode and arena, trophies move, bots climb with the tier.
// pve: waves of monsters and chapter bosses, coins only.
export const PLAYS = {
  casual: { name: 'Đấu thường', icon: 'swords', blurb: 'Tự chọn chế độ, đấu trường, cỡ đội. Nhận xu và XP, không tính cúp.' },
  rank:   { name: 'Đấu rank', icon: 'trophy', blurb: 'Chế độ và đấu trường bốc ngẫu nhiên, 3 đấu 3. Thắng thua đổi cúp; bot mạnh dần theo hạng.' },
  pve:    { name: 'Phó bản', icon: 'boss', blurb: 'Đánh quái qua từng màn, cuối chương gặp trùm. Cày xu nâng cấp.' },
};
export const PLAY_ORDER = ['casual', 'rank', 'pve'];
// The pool a ranked match draws its mode from.
export const RANK_MODES = ['tdm', 'chiem', 'nha', 'tudo'];
// Ranked bots per RANKS tier (same index). diff: DIFFICULTY row of every bot; botLv / allyLv: level on every upgrade track of the enemy / allied bots;
// foeDmg, foeHp: multipliers on the enemy bots. The player keeps their own garage levels.
export const RANK_TIERS = [
  { diff: 'easy',   botLv: 0, allyLv: 0, foeDmg: 0.75, foeHp: 1 },     // Sắt
  { diff: 'normal', botLv: 1, allyLv: 1, foeDmg: 0.85, foeHp: 1 },     // Đồng
  { diff: 'normal', botLv: 2, allyLv: 2, foeDmg: 0.95, foeHp: 1 },     // Bạc
  { diff: 'hard',   botLv: 3, allyLv: 2, foeDmg: 1,    foeHp: 1 },     // Vàng
  { diff: 'hard',   botLv: 4, allyLv: 3, foeDmg: 1,    foeHp: 1.08 },  // Bạch Kim
  { diff: 'hard',   botLv: 5, allyLv: 4, foeDmg: 1.08, foeHp: 1.15 },  // Kim Cương
];
export const rankTier = (index) => RANK_TIERS[Math.max(0, Math.min(RANK_TIERS.length - 1, Math.floor(Number(index) || 0)))];
// The random part of a ranked match, from its seed: the mode (the arena and theme are picked by maps.pickArena with 'random').
export function rankPlan(tierIndex, seed) {
  const h = Math.imul((seed >>> 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return { mode: RANK_MODES[(h >>> 7) % RANK_MODES.length], tier: rankTier(tierIndex) };
}
export const cleanPlay = (p) => (PLAY_ORDER.includes(p) ? p : 'casual');
/* ===== end feat/dtt-modes play kinds ===== */

/* ===== feat/dtt-modes: Phó bản (PvE): monsters, chapters, stages ===== */
// Monsters use the BOSSES row shape (merged into BOSSES below, so sim, netstate and the renderer find them) without `boss`:
// they never respawn in a Phó bản, their wave does. roleKey 'boss' gives them the boss brain in bots.js (never retreats,
// walks at the biggest group); Pháo Cối plays artillery. Each one's attack has a telegraph: a nova ring, barrage or lob marks.
const foeSkill = (id, name, row) => ({ id, name, icon: row.do === 'nova' ? 'quake' : row.do === 'barrage' ? 'barrage' : row.do === 'shield' ? 'shield' : row.do === 'dash' ? 'dash' : 'boost', desc: '', ...row });
export const PVE_FOES = {
  ong: {
    name: 'Ong Sắt', role: 'Bầy máy bay', roleKey: 'boss', monster: true, hover: true, tint: 0xe0b030,
    hp: 380, speed: 7.2, radius: 0.55, accel: 1.6, turn: 14,
    weapon: { name: 'Kim Chích', cd: 0.5, dmg: 34, speed: 28, range: 6.5, spread: 0.08, r: 0.16, vis: 'bullet' },
    skills: [
      foeSkill('ong_no', 'Chích Nổ', { cd: 6, do: 'nova', windup: 0.8, radius: 2.4, dmg: 230 }),
      foeSkill('ong_bay', 'Vọt Lên', { cd: 9, do: 'buff', haste: 1.4, dur: 2 }),
      foeSkill('ong_no2', 'Chích Nổ', { cd: 14, do: 'nova', windup: 0.8, radius: 2.4, dmg: 230 }),
    ],
  },
  uphao: {
    name: 'Ụ Pháo', role: 'Ụ súng', roleKey: 'boss', monster: true, heavy: true, tint: 0x7d8a5a,
    hp: 2500, speed: 0, radius: 1.15, armor: 0.15, turn: 2.4,
    weapon: { name: 'Pháo Ụ', cd: 1.3, dmg: 160, speed: 22, range: 15, splash: 1.6, r: 0.3, vis: 'shell' },
    skills: [
      foeSkill('up_mua', 'Pháo Kích', { cd: 9, do: 'barrage', n: 5, radius: 3.8, blast: 2.2, dmg: 200, delay: 1.2, span: 1.4, cast: 15 }),
      foeSkill('up_khien', 'Lá Chắn', { cd: 16, do: 'shield', amount: 600, dur: 3 }),
      foeSkill('up_mua2', 'Mưa Pháo', { cd: 20, do: 'barrage', n: 8, radius: 5, blast: 2.2, dmg: 200, delay: 1.3, span: 2, cast: 15 }),
    ],
  },
  xebb: {
    name: 'Xe Bộ Binh', role: 'Xe tăng nhỏ', roleKey: 'boss', monster: true, tint: 0xa0603a,
    hp: 1500, speed: 4.6, radius: 0.9, armor: 0.08, accel: 0.9, turn: 6,
    weapon: { name: 'Pháo Ngắn', cd: 0.85, dmg: 100, speed: 26, range: 10.5, r: 0.26, vis: 'shell' },
    skills: [
      foeSkill('xb_dam', 'Dậm Xích', { cd: 8, do: 'nova', windup: 0.9, radius: 3.2, dmg: 290, knock: 3 }),
      foeSkill('xb_khien', 'Giáp Dày', { cd: 14, do: 'shield', amount: 450, dur: 3 }),
      foeSkill('xb_huc', 'Húc', { cd: 12, do: 'dash', dist: 7, speed: 20, dmg: 190, stun: 0.6, knock: 3 }),
    ],
  },
  phaocoi: {
    name: 'Pháo Cối', role: 'Pháo xa', roleKey: 'artillery', monster: true, tint: 0x6a7c9a,
    hp: 1050, speed: 3.6, radius: 0.85, armor: 0.04, accel: 0.8, turn: 5,
    weapon: { name: 'Cối Nặng', cd: 2.4, dmg: 260, lob: true, flight: 1.1, range: 19, splash: 2.4, vis: 'mortar' },
    skills: [
      foeSkill('pc_mua', 'Bắn Chùm', { cd: 10, do: 'barrage', n: 4, radius: 3, blast: 2.4, dmg: 230, delay: 1.3, span: 1, cast: 19 }),
      foeSkill('pc_lui', 'Lùi Nhanh', { cd: 10, do: 'buff', haste: 1.5, dur: 2 }),
      foeSkill('pc_mua2', 'Dội Cối', { cd: 18, do: 'barrage', n: 7, radius: 4.5, blast: 2.4, dmg: 230, delay: 1.4, span: 1.8, cast: 19 }),
    ],
  },
  khienve: {
    name: 'Khiên Vệ', role: 'Tinh nhuệ', roleKey: 'boss', monster: true, heavy: true, tint: 0x5a6ac8,
    hp: 4200, speed: 3.8, radius: 1.2, armor: 0.25, accel: 0.7, turn: 4,
    weapon: { name: 'Pháo Ba Nòng', cd: 1.1, dmg: 115, n: 3, fan: 0.18, speed: 24, range: 9, r: 0.26, vis: 'shell' },
    skills: [
      foeSkill('kv_khien', 'Khiên Tháp', { cd: 12, do: 'shield', amount: 1500, dur: 4 }),
      foeSkill('kv_dam', 'Nện Khiên', { cd: 9, do: 'nova', windup: 1.1, radius: 4.2, dmg: 500, stun: 0.8 }),
      foeSkill('kv_dam2', 'Sóng Chấn', { cd: 20, do: 'nova', windup: 1.4, radius: 6, dmg: 650, slow: 0.5, slowDur: 2 }),
    ],
  },
};
Object.assign(BOSSES, PVE_FOES);
export const PVE_FOE_ORDER = Object.keys(PVE_FOES);

MODES.pve = { name: 'Phó bản', blurb: 'Dọn sạch từng đợt quái, cả đội dùng chung số mạng.', target: 3, duration: 480, mission: 'Dọn sạch {target} đợt quái, cả đội có {lives} mạng', lives: 6,
  sizes: { 1: { lives: 4 }, 2: { lives: 5 }, 3: { lives: 6 } } };

// Four chapters of six stages; stage 6 is the chapter boss. hp, dmg: monster multipliers of the chapter; foes: the kinds its waves draw.
export const PVE_CHAPTERS = [
  { key: 'c1', name: 'Rừng Sắt', map: 'denrung', theme: 'jungle', foes: ['ong', 'xebb', 'uphao'], boss: 'cuthan', hp: 1, dmg: 1, diff: 'easy' },
  { key: 'c2', name: 'Cảng Băng', map: 'cangbang', theme: 'ice', foes: ['ong', 'xebb', 'phaocoi', 'uphao'], boss: 'chienham', bossMap: 'bentau', hp: 1.7, dmg: 1.3, diff: 'normal' },
  { key: 'c3', name: 'Xưởng Cát', map: 'xuongcat', theme: 'desert', foes: ['xebb', 'phaocoi', 'khienve', 'uphao', 'ong'], boss: 'dautau', bossMap: 'ganhray', hp: 2.0, dmg: 1.35, diff: 'normal' },
  { key: 'c4', name: 'Miệng Lửa', map: 'mienglua', theme: 'lava', foes: ['khienve', 'phaocoi', 'ong', 'xebb', 'uphao'], boss: 'ngoaitinh', hp: 2.5, dmg: 1.6, diff: 'hard' },
];
export const PVE_STAGES = 6;
// Heavy kinds: at most this many per wave.
const PVE_HEAVY = { khienve: 1, uphao: 2, phaocoi: 3 };
const hash32 = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export const pveId = (ch, st) => `${ch + 1}-${st + 1}`;
export function pveParse(id) {
  const m = /^([1-9])-([1-9])$/.exec(String(id || ''));
  const ch = m ? +m[1] - 1 : -1, st = m ? +m[2] - 1 : -1;
  return ch >= 0 && ch < PVE_CHAPTERS.length && st >= 0 && st < PVE_STAGES ? { ch, st } : null;
}
export const PVE_ORDER = PVE_CHAPTERS.flatMap((c, ch) => Array.from({ length: PVE_STAGES }, (_, st) => pveId(ch, st)));
// One stage, all derived from its id: waves (lists of monster keys; the boss stage ends with the chapter boss), the hp and damage
// multipliers, the bot brain, par time for the stars, the coin payout (first clear, repeat, fail) and the recommended garage level (sum of five tracks).
export function pveStage(id) {
  const p = pveParse(id);
  if (!p) return null;
  const { ch, st } = p, C = PVE_CHAPTERS[ch], boss = st === PVE_STAGES - 1;
  let h = hash32('pve' + id);
  const rnd = () => { h = (Math.imul(h ^ (h >>> 15), 2246822519) + 0x6d2b79f5) >>> 0; return h / 4294967296; };
  const nWaves = boss ? 2 : 2 + (st >= 2 ? 1 : 0) + (st >= 4 ? 1 : 0);
  const waves = [];
  for (let w = 0; w < nWaves; w++) {
    const last = w === nWaves - 1;
    const bossKey = BOSSES[C.boss] ? C.boss : 'titan', B = BOSSES[bossKey];
    // the boss wave: the boss, its parts, and two escorts unless it brings parts or summons of its own
    const n = boss && last ? (B.parts || B.summons ? 0 : 2) : Math.min(7, 3 + Math.floor(st / 2) + Math.floor(ch / 2) + (last ? 1 : 0));
    // early stages of a chapter draw from its first kinds only; each wave opens with a different lead kind
    const pool = C.foes.slice(0, Math.min(C.foes.length, 2 + Math.floor(st / 2)));
    const list = n ? [pool[w % pool.length]] : [], cnt = { [list[0]]: 1 };
    for (let guard = 0; list.length < n && guard < 50; guard++) {
      const k = pool[Math.floor(rnd() * pool.length)];
      if (PVE_HEAVY[k] && (cnt[k] || 0) >= PVE_HEAVY[k]) continue;
      cnt[k] = (cnt[k] || 0) + 1; list.push(k);
    }
    if (boss && last) { const parts = (B.parts || []).flatMap((q) => Array.from({ length: q.n || q.at.length }, () => q.mech)); list.unshift(bossKey, ...parts); }
    waves.push(list);
  }
  const hp = C.hp * (1 + 0.1 * st), dmg = C.dmg * (1 + 0.05 * st);
  const par = Math.round(22 * waves.reduce((a, w) => a + w.length, 0) / 3 + (boss ? 80 : 0));
  const first = Math.round((220 + 70 * st + 260 * ch) * (boss ? 1.8 : 1) / 10) * 10;
  return {
    id, ch, st, boss, chapter: C, name: boss ? `${C.name}: Trùm` : `${C.name} ${st + 1}`, map: boss && C.bossMap ? C.bossMap : C.map, theme: C.theme, diff: C.diff, waves,
    hp, dmg, bossHp: hp * 0.2, bossDmg: dmg * 0.85, par, limit: Math.max(300, par * 3),
    reward: { first, repeat: Math.round(first * 0.42 / 10) * 10, fail: Math.round(first * 0.1 / 10) * 10 },
    recLv: Math.min(25, Math.round(ch * 6.5 + st * 1.1)), allyLv: Math.min(5, ch + (st >= 3 ? 1 : 0)),
  };
}
// Stars for a clear in `time` seconds: 3 at or under par, 2 under 1.6 x par, else 1.
export const pveStars = (stage, time) => (time <= stage.par ? 3 : time <= stage.par * 1.6 ? 2 : 1);
/* ===== end feat/dtt-modes Phó bản ===== */

/* ===== feat/dtt-modes: Phó bản chapter bosses ===== */
// One boss per chapter end, each with a sim script (sim.js, PVE_SCRIPTS) on top of its skills. Every attack is telegraphed on the ground:
// lobbed shells and barrages mark their strike circles, novas draw their ring while winding up, sweeps draw their line, the rail is always drawn.
// parts: units that make up the boss (turrets on the warship, carriages of the train), summons: units it calls in later (held dead until then).
export const PVE_BOSSES = {
  // Giant tank (the reworked Cự Thần): twin cannon lobs, a line of shells along its aim, a stomp ring; below half hp it fires faster and rings itself with shells.
  cuthan: {
    name: 'Cự Thần', role: 'Trùm', roleKey: 'boss', boss: true, heavy: true, monster: true, script: 'tank', tint: 0x9a1a10,
    hp: 140000, speed: 3.1, radius: 2.6, armor: 0.12, accel: 0.5, turn: 2.2,
    weapon: { name: 'Pháo Đôi', cd: 1.5, dmg: 360, n: 2, lob: true, flight: 1.0, range: 20, splash: 2.4, vis: 'mortar' },
    skills: [
      foeSkill('ct_dam', 'Đè Xích', { cd: 8, do: 'nova', windup: 1.2, radius: 7, dmg: 900, slow: 0.5, slowDur: 2, knock: 4 }),
      foeSkill('ct_tuyen', 'Pháo Tuyến', { cd: 10, do: 'barrage', line: true, n: 8, gap: 2.4, radius: 0, blast: 2.2, dmg: 620, delay: 1.2, span: 1.2, cast: 14 }),
      foeSkill('ct_mua', 'Hỏa Vũ', { cd: 14, do: 'barrage', n: 14, radius: 9, blast: 2.6, dmg: 520, delay: 1.3, span: 2.4, cast: 20 }),
    ],
  },
  // Warship: cruises a water lane along the top edge and shells marked zones. While a deck gun stands, its hull shrugs off 60% of all damage.
  chienham: {
    name: 'Chiến Hạm', role: 'Trùm', roleKey: 'boss', boss: true, heavy: true, monster: true, script: 'ship', tint: 0x2a4a6a,
    hp: 80000, speed: 0, radius: 2.8, armor: 0.1, turn: 1.6, lane: { z: -16.5, x: 24, period: 70 }, parts: [{ mech: 'chphao', at: [-4.2, 0, 4.2] }],
    weapon: { name: 'Hải Pháo', cd: 2.2, dmg: 420, lob: true, flight: 1.4, range: 34, splash: 3, vis: 'mortar' },
    skills: [
      foeSkill('chm_kich', 'Pháo Kích', { cd: 6, do: 'barrage', n: 6, radius: 7, blast: 2.6, dmg: 480, delay: 1.6, span: 1.6, cast: 34 }),
      foeSkill('chm_man', 'Màn Pháo', { cd: 12, do: 'barrage', line: true, n: 9, gap: 2.6, radius: 0, blast: 2.4, dmg: 520, delay: 1.5, span: 1.8, cast: 30 }),
      foeSkill('chm_khien', 'Khói Che', { cd: 18, do: 'shield', amount: 4000, dur: 4 }),
    ],
  },
  chphao: {
    name: 'Pháo Hạm', role: 'Pháo tàu', roleKey: 'boss', monster: true, heavy: true, part: true, tint: 0x2a4a6a,
    hp: 9000, speed: 0, radius: 1.1, armor: 0.1, turn: 2.6,
    weapon: { name: 'Pháo Boong', cd: 1.9, dmg: 260, lob: true, flight: 1.0, range: 24, splash: 2.2, vis: 'mortar' },
    skills: [
      foeSkill('chp_kich', 'Bắn Chụm', { cd: 9, do: 'barrage', n: 3, radius: 2.5, blast: 2.2, dmg: 300, delay: 1.3, span: 0.8, cast: 24 }),
      foeSkill('chp_khien', 'Lá Chắn', { cd: 16, do: 'shield', amount: 1200, dur: 3 }),
      foeSkill('chp_kich2', 'Bắn Rải', { cd: 14, do: 'barrage', n: 5, radius: 4, blast: 2.2, dmg: 300, delay: 1.4, span: 1.4, cast: 24 }),
    ],
  },
  // Train: an engine and three armoured carriages loop a rail across the arena. Each carriage carries a gun; the engine has no armour and its fall
  // derails the rest. Standing on the rail burns; the train itself rams whoever is in its way.
  dautau: {
    name: 'Đầu Tàu', role: 'Trùm', roleKey: 'boss', boss: true, heavy: true, monster: true, script: 'train', tint: 0x8a3a12,
    hp: 30000, speed: 0, radius: 2.6, armor: 0, turn: 3, rail: { rx: 30, rz: 16, speed: 6.5, gap: 7.2, width: 2.2, dps: 140, ram: 420 }, parts: [{ mech: 'toaxe', n: 3 }],
    weapon: { name: 'Súng Đầu Máy', cd: 1.6, dmg: 240, lob: true, flight: 0.9, range: 18, splash: 2.2, vis: 'mortar' },
    skills: [
      foeSkill('dt_coi', 'Còi Hơi', { cd: 9, do: 'nova', windup: 1.0, radius: 5, dmg: 600, knock: 4 }),
      foeSkill('dt_than', 'Than Hồng', { cd: 11, do: 'barrage', n: 6, radius: 5, blast: 2.2, dmg: 420, delay: 1.3, span: 1.5, cast: 18 }),
      foeSkill('dt_khien', 'Hơi Nước', { cd: 16, do: 'shield', amount: 2500, dur: 3 }),
    ],
  },
  toaxe: {
    name: 'Toa Pháo', role: 'Toa tàu', roleKey: 'boss', monster: true, heavy: true, part: true, tint: 0x8a3a12,
    hp: 6500, speed: 0, radius: 2.4, armor: 0.35, turn: 3,
    weapon: { name: 'Pháo Toa', cd: 1.8, dmg: 210, lob: true, flight: 1.0, range: 17, splash: 2.2, vis: 'mortar' },
    skills: [
      foeSkill('tx_kich', 'Bắn Chụm', { cd: 9, do: 'barrage', n: 3, radius: 2.5, blast: 2.2, dmg: 280, delay: 1.3, span: 0.8, cast: 17 }),
      foeSkill('tx_khien', 'Thép Dày', { cd: 15, do: 'shield', amount: 1500, dur: 3 }),
      foeSkill('tx_kich2', 'Bắn Rải', { cd: 13, do: 'barrage', n: 5, radius: 4, blast: 2.2, dmg: 280, delay: 1.4, span: 1.4, cast: 17 }),
    ],
  },
  // Alien: blinks across the arena (its landing spot is marked first and blasts when it arrives), calls drone swarms, sweeps a beam round it.
  ngoaitinh: {
    name: 'Ngoại Tinh', role: 'Trùm', roleKey: 'boss', boss: true, heavy: true, monster: true, hover: true, script: 'alien', tint: 0x18a080,
    hp: 70000, speed: 4.0, radius: 2.2, armor: 0.1, accel: 1, turn: 3, summons: { mech: 'ong', n: 6, every: 15, per: 3 }, blink: { every: 10, delay: 1.3, r: 4, dmg: 700 },
    weapon: { name: 'Cầu Plasma', cd: 1.2, dmg: 300, lob: true, flight: 0.8, range: 18, splash: 2.2, vis: 'mortar' },
    skills: [
      foeSkill('nt_quet', 'Tia Quét', { cd: 11, do: 'sweep', windup: 1.1, dur: 2.4, range: 16, width: 1.4, dps: 700, turn: 1.3, move: 0 }),
      foeSkill('nt_xung', 'Xung Trọng Lực', { cd: 9, do: 'nova', windup: 1.1, radius: 6, dmg: 750, slow: 0.5, slowDur: 2 }),
      foeSkill('nt_mua', 'Mưa Sao', { cd: 15, do: 'barrage', n: 12, radius: 8, blast: 2.4, dmg: 480, delay: 1.4, span: 2.2, cast: 18 }),
    ],
  },
};
Object.assign(BOSSES, PVE_BOSSES);
// Boss stages of chapters 2 and 3 are fought on their own layouts (PVE_CHAPTERS bossMap, maps.js PVE_MAPS): the warship needs its water lane, the train its loop.
// Where the train is at rail distance s (metres from the start, any value): the point and the heading along the loop.
export function railAt(rail, s) {
  // the ellipse is walked at constant speed through a table of its arc length
  const T = rail.tbl || (rail.tbl = (() => { const n = 256, t = [0]; let L = 0, px = rail.rx, pz = 0; for (let i = 1; i <= n; i++) { const a = i / n * 2 * Math.PI, x = Math.cos(a) * rail.rx, z = Math.sin(a) * rail.rz; L += Math.hypot(x - px, z - pz); t.push(L); px = x; pz = z; } return t; })());
  const L = T[T.length - 1], d = ((s % L) + L) % L;
  let lo = 0, hi = T.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (T[mid] <= d) lo = mid; else hi = mid; }
  const a = (lo + (d - T[lo]) / ((T[hi] - T[lo]) || 1)) / (T.length - 1) * 2 * Math.PI;
  return { x: Math.cos(a) * rail.rx, z: Math.sin(a) * rail.rz, h: Math.atan2(Math.cos(a) * rail.rz, -Math.sin(a) * rail.rx), len: L };
}
/* ===== end feat/dtt-modes chapter bosses ===== */
