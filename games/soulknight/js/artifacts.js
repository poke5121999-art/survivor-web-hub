// Thần Khí Lục Địa Cổ (G.mode === 'artifacts'), LÕI: Chế độ Ải 3 tầng x 5 ải + ải 3-6 trùm cuối, nhưng người chơi mất vũ khí thường và
// chỉ dùng Thần Khí ráp từ 3 bộ phận (kiếm: Lưỡi Đao/Hộ Thủ/Cán Cầm; gậy: Lõi/Đầu Gậy/Cán Gậy; cung: Cánh Cung/Mũi Tên/Dây Cung).
// Nguồn số: [ĐO cfg] = common/modeartifacts/artifact_mode_config.asset; [ĐO part] = prefab bộ phận trong artifacts2/weapon (addAttack,
// addAttackSpeed, addEnergyConsume); [WIKI SW] = trang Sacred_Weapons_of_the_Old_Continent và Modifiers (tools/polish/MODES.md mục 2h);
// [LOC] = artifact/*; chỗ không có nguồn ghi [ƯỚC LƯỢNG]. Chưa làm (Chữ Khắc, Tro Thần Khí, cấp vũ khí của bản 2): tools/polish/GAPS.md.
//   G.artifacts = {cat, parts:[chính, phụ, nền], bag, fails, lvl, exp, wrath:{e, active}, reforge, ped, ...}
// Thần Uy (12 loại), Bà Lão Ngàn Tuổi, bảng giao diện, HUD: js/artifacts2.js.
(function () {
  'use strict';
  const SK = window.SK, D = SK.D, DS = SK.DS, W = SK.world, U = SK.PPU;

  // [ĐO part] mỗi vũ khí: [tên Việt (LOC), [[atk, tốc, năng lượng, khung] x 3 bộ phận theo thứ tự chính / phụ / nền]]; sinh bằng
  // tools/extra/artifacts.json + dữ liệu prefab (dựng lại: node đọc data/sk-data.js, không sửa tay). Vũ khí số 1 = bộ khởi đầu.
  const DATA = {
  sword:[
    ["Kiếm Nhà Mạo Hiểm",[[8,0.5,1,"sword01_2"],[2,0.7,0,"sword01_1"],[4,0.5,0,"sword01_0"]]],
    ["Kiếm Tập Kích Đêm",[[8,0.65,1,"sword02_2"],[2,0.75,0,"sword02_1"],[4,0.7,0,"sword02_0"]]],
    ["Kiếm Quý Tộc Sa Sút",[[6,0.625,1,"sword03_2"],[1,1.2,0,"sword03_1"],[3,0.625,0,"sword03_0"]]],
    ["Kiếm Vương Triều",[[10,0.37,1,"sword04_2"],[2,0.7,0,"sword04_1"],[5,0.4,0,"sword04_0"]]],
    ["Kiếm Thần Tế",[[10,0.25,1,"sword05_2"],[4,0.4,0,"sword05_1"],[5,0.3,0,"sword05_0"]]],
    ["Kiếm Canh Gác",[[7,0.5,1,"sword06_2"],[2,0.8,0,"sword06_1"],[3,0.5,0,"sword06_0"]]],
    ["Kiếm Anh Hùng",[[8,0.5,1,"seasonWeapon_27"],[2,0.7,0,"seasonWeapon_26"],[4,0.5,0,"seasonWeapon_25"]]],
    ["Kiếm Cận Vệ",[[8,0.5,1,"seasonWeapon_32"],[2,0.7,0,"seasonWeapon_31"],[4,0.5,0,"seasonWeapon_30"]]],
    ["Katana-Vô Úy",[[8,0.5,1,"seasonWeapon_36"],[2,0.7,0,"seasonWeapon_70"],[4,0.5,0,"seasonWeapon_35"]]],
    ["Tachi-Tung Hoành",[[10,0.3,1,"sword10_2"],[2,0.6,0,"sword10_1"],[5,0.4,0,"sword10_0"]]],
    ["Katana-Đom Đóm",[[4,1,0,"sword11_2"],[1,1.2,0,"sword11_1"],[1,1,0,"sword11_0"]]],
    ["Dao Pharaoh",[[8,0.5,1,"seasonWeapon_48"],[2,0.7,0,"seasonWeapon_47"],[4,0.5,0,"seasonWeapon_46"]]],
    ["Kiếm Night's King",[[8,0.5,1,"sword13_2"],[2,0.7,0,"sword13_1"],[4,0.5,0,"sword13_0"]]],
    ["Dao Hỏa Diệm",[[8,0.5,1,"sword14_2"],[2,0.7,0,"sword14_1"],[4,0.5,0,"sword14_0"]]],
    ["Dao Diêm Vương",[[8,0.5,1,"sword15_2"],[2,0.7,0,"sword15_1"],[4,0.5,0,"sword15_0"]]]],
  staff:[
    ["Gậy Ma Nhà Mạo Hiểm",[[2,0.3,1,"staff01_2"],[3,0.3,1,"staff01_1"],[2,0.8,0,"staff01_0"]]],
    ["Gậy Quốc Sư",[[2,0.3,1,"seasonWeapon_80"],[3,0.3,1,"seasonWeapon_79"],[2,0.8,0,"seasonWeapon_2"]]],
    ["Gậy Gốc Ma",[[2,0.3,1,"staff03_2"],[3,0.3,1,"staff03_1"],[2,0.8,0,"staff03_0"]]],
    ["Gậy Pháp Sư Canh Gác",[[2,0.3,1,"staff04_2"],[3,0.3,1,"staff04_1"],[2,0.8,0,"sword06_0"]]],
    ["Gậy Vua Phượng Hoàng",[[2,0.3,1,"staff05_2"],[3,0.3,1,"staff05_1"],[2,0.8,0,"staff08_0"]]],
    ["Cột Dung Nham",[[2,0.3,1,"staff06_2"],[3,0.3,1,"staff06_1"],[2,0.8,0,"staff06_0"]]],
    ["Gậy Sức Sống",[[2,0.3,1,"seasonWeapon_24"],[3,0.3,1,"seasonWeapon_23"],[2,0.8,0,"seasonWeapon_22"]]],
    ["Gậy Giữ Giới",[[2,0.3,1,"staff08_2"],[3,0.3,1,"seasonWeapon_85"],[2,0.8,0,"staff08_0"]]],
    ["Gậy Pháp Tinh",[[2,0.3,1,"staff09_2"],[3,0.3,1,"seasonWeapon_86"],[2,0.8,0,"staff09_0"]]],
    ["Gậy Hỏa Tinh",[[2,0.3,1,"seasonWeapon_41"],[3,0.3,1,"seasonWeapon_37"],[2,0.8,0,"seasonWeapon_40"]]],
    ["Gậy Sức Mạnh Nguyên Thạch",[[2,0.3,1,"seasonWeapon_45"],[3,0.3,1,"seasonWeapon_44"],[2,0.8,0,"seasonWeapon_43"]]],
    ["Gậy Vua Hạch Biển",[[2,0.3,1,"staff12_2"],[3,0.3,1,"staff12_1"],[2,0.8,0,"staff12_0"]]],
    ["Gậy Pháp Sư Cận Vệ",[[2,0.3,1,"seasonWeapon_57"],[3,0.3,1,"seasonWeapon_56"],[2,0.8,0,"seasonWeapon_55"]]],
    ["Gậy Linh Hồn Hủ Bại",[[2,0.3,1,"staff14_2"],[3,0.3,1,"staff14_1"],[2,0.8,0,"staff14_0"]]],
    ["Gậy Mực Lửa",[[2,0.3,1,"staff15_2"],[3,0.3,1,"staff15_1"],[2,0.8,0,"staff15_0"]]]],
  bow:[
    ["Cung Nhà Mạo Hiểm",[[6,0.4,1,"seasonWeapon_90"],[4,0.4,1,"seasonWeapon_94"],[4,0.7,1,"seasonWeapon_91"]]],
    ["Cung Canh Gác",[[6,0.4,1,"seasonWeapon_100"],[4,0.4,1,"seasonWeapon_104"],[4,0.7,1,"seasonWeapon_101"]]],
    ["Cung Tinh Hạch",[[6,0.4,1,"seasonWeapon_105"],[4,0.4,1,"seasonWeapon_109"],[4,0.7,1,"seasonWeapon_106"]]],
    ["Cung Vương Triều",[[6,0.4,1,"seasonWeapon_115"],[4,0.4,1,"seasonWeapon_119"],[4,0.7,1,"seasonWeapon_116"]]],
    ["Cung Cận Vệ",[[6,0.4,1,"seasonWeapon_125"],[4,0.4,1,"seasonWeapon_129"],[4,0.7,1,"seasonWeapon_126"]]],
    ["Cung Giản Dị",[[6,0.4,1,"seasonWeapon_135"],[4,0.4,1,"seasonWeapon_139"],[4,0.7,1,"seasonWeapon_136"]]],
    ["Vua Sâu Bay",[[6,0.4,1,"seasonWeapon_145"],[4,0.4,1,"seasonWeapon_149"],[4,0.7,1,"seasonWeapon_146"]]],
    ["Cung Linh Hồn Hủ Bại",[[6,0.4,1,"seasonWeapon_150"],[4,0.4,1,"seasonWeapon_154"],[4,0.7,1,"seasonWeapon_151"]]],
    ["Cung Pháp Hạch",[[2,0.8,1,"seasonWeapon_155"],[2,0.8,1,"seasonWeapon_159"],[2,1.2,1,"seasonWeapon_156"]]],
    ["Thần Đi Đêm",[[6,0.4,1,"seasonWeapon_160"],[4,0.4,1,"seasonWeapon_164"],[4,0.7,1,"seasonWeapon_161"]]],
    ["Cung Gốc Ma",[[2,0.4,1,"seasonWeapon_95"],[2,0.4,1,"seasonWeapon_99"],[2,0.7,1,"seasonWeapon_96"]]],
    ["Cung Kết Tinh Tự Nhiên",[[2,0.4,1,"seasonWeapon_110"],[2,0.4,1,"seasonWeapon_114"],[2,0.7,1,"seasonWeapon_111"]]],
    ["Cung Dung Hạch",[[6,0.4,1,"seasonWeapon_120"],[4,0.4,1,"seasonWeapon_124"],[4,0.7,1,"seasonWeapon_121"]]],
    ["Xương Tụ Huyết",[[6,0.4,1,"seasonWeapon_130"],[4,0.4,1,"seasonWeapon_134"],[4,0.7,1,"seasonWeapon_131"]]],
    ["Cung Pharaoh",[[2,0.4,1,"seasonWeapon_140"],[2,0.4,1,"seasonWeapon_144"],[2,0.7,1,"seasonWeapon_141"]]]]
  };

  const C = SK.ARTIFACTS = {
    // [ĐO cfg]
    rechargeOnHit: 2, rechargeFull: 100,       // Thần Uy +2 mỗi đòn trúng, đầy 100
    maxRarity: 4,                              // nâng cấp tối đa tới Cam; Đỏ chỉ từ trùm
    upCost: [10, 22, 35, 50], upProb: [100, 60, 40, 20], upInc: [0, 10, 9, 7],   // tiến cấp bộ phận: giá, xác suất, cộng thêm mỗi lần hỏng [ĐO cfg = WIKI SW]
    compUpCost: [10, 20, 30, 40],              // tăng cấp thuộc tính theo phẩm chất hiện tại [ĐO cfg]
    refreshCost: [5, 8, 11, 14, 17, 20], refreshLimit: 6,   // đúc lại: 6 lần mỗi ải, giá tăng dần [ĐO cfg]
    partValue: [10, 25, 45, 70, 100, 150], compValue: [5, 8, 12, 18, 25, 35],   // giá trị bộ phận / thuộc tính [ĐO cfg]
    pickCoinFactor: 1.4,                       // [ĐO cfg] hệ số khi đổi bộ phận thừa sang vàng (cách dùng [ƯỚC LƯỢNG]: giá trị x 0,14 làm tròn xuống)
    redInBoss: 75,                             // % trùm rơi bộ phận Đỏ [ĐO cfg redProbabilityInBossChest]
    enemyHp: 2.1, bossHp: 2.1, enemyHpInc: 1.05,   // máu quái / trùm x2,1; x1,05 mỗi tầng [ĐO cfg; "mỗi tầng" là ƯỚC LƯỢNG]
    skillCd: 3.5,                              // hồi chiêu kỹ năng nhân vật x3,5 [ĐO cfg; wiki ghi x4]
    levelExp: [150, 650, 1600, 3000, 5000],    // mốc EXP bậc Dũng Sĩ (năng lượng nhặt từ cầu năng lượng: ƯỚC LƯỢNG cách tính)
    levelAdd: { atk: 1, crit: 5, hp: 1, armor: 1, rate: 10 },   // 1 trong 3 [ĐO cfg levelUpAdd*; WIKI SW]
    colors: ['#ffffff', '#2dff46', '#0e91ff', '#b507c9', '#ff8f01', '#e11a1a'],   // [ĐO cfg colorOfRarity]
    rarNames: ['Trắng', 'Lục', 'Lam', 'Tím', 'Cam', 'Đỏ'],
    modCount: [0, 1, 2, 3, 4, 1],              // số thuộc tính theo phẩm chất; Đỏ có đúng 1 thuộc tính huyền thoại [WIKI SW]
    dropW: [44, 30, 15, 7, 4],                 // trọng số phẩm chất từ rương / dọn phòng [ƯỚC LƯỢNG]
    orbExp: 5,                                 // EXP mỗi cầu năng lượng nhặt [ƯỚC LƯỢNG]
    roomDrop: 0.3,                             // dọn phòng thường rơi bộ phận [ƯỚC LƯỢNG]
    elements: ['F', 'W', 'T'],
    elNames: { F: 'Lửa Bùng', W: 'Gió Mạnh', T: 'Lôi Đình' },   // [LOC pwrtype_*]
    elCols: { F: '#ff7a3a', W: '#7adfff', T: '#ffe04a' }
  };
  const SLOT = {
    sword: ['Lưỡi Đao', 'Hộ Thủ', 'Cán Cầm'], staff: ['Lõi', 'Đầu Gậy', 'Cán Gậy'], bow: ['Cánh Cung', 'Mũi Tên', 'Dây Cung']   // [LOC part_*]
  };
  const CATS = ['sword', 'staff', 'bow'];
  const CATNAME = { sword: 'Đao kiếm', staff: 'Gậy', bow: 'Cung' };
  const A = SK.artifacts = { C, DATA, SLOT, CATS, CATNAME };
  const on = G => !!(G && G.mode === 'artifacts' && G.artifacts);
  A.on = on;
  const say = (G, m, t) => { G.toast(m, t || 2.4); return m; };
  A.say = say;
  const r1 = v => Math.round(v * 10) / 10;

  // ---------------------------------------------------------------- thuộc tính (modifier) [WIKI Modifiers; LOC artifact/efx_*]
  // v[phẩm chất 0..4]: số hoặc [x, y]; null = không xuất hiện ở phẩm chất đó. Ô trống của bảng wiki được nội suy [ƯỚC LƯỢNG].
  const MODS = [
    { id: 'hp', t: 'HP +{0}', v: [1, 2, 3, 4, 5] },
    { id: 'amrhp', t: 'Hộ Giáp +{0}, HP +{1}', v: [null, [1, 0], [1, 1], [1, 2], [2, 2]] },
    { id: 'move', t: 'Tốc độ di chuyển +{0}%', v: [15, 17, 19, 21, 23] },
    { id: 'atkcrit', t: 'Tấn công +{0}, bạo kích +{1}', v: [[1, 0], [1, 1], [2, 2], [2, 3], [3, 4]] },
    { id: 'goldkill', t: 'Đánh bại địch có xác suất nhận thêm {0} Vàng', v: [null, null, null, null, 7] },
    { id: 'encrit', t: 'Khi bạo kích nhận {0} năng lượng', v: [null, 1, 2, 3, 4] },
    { id: 'defatk', t: 'DMG phải chịu +{0}, tấn công +{1}', v: [null, [1, 2], [1, 3], [2, 4], [2, 5]] },
    { id: 'maxen', t: 'Năng lượng tối đa +{0}', v: [30, 40, 50, 60, 70] },
    { id: 'enamr', t: 'Khi hồi Hộ Giáp nhận {0} năng lượng', v: [null, 2, 3, 4, 5] },
    { id: 'wrathcrit', t: 'Bạo kích đánh bại địch nạp {0}% Thần Uy', v: [null, null, 4, 6, 8] },
    { id: 'size', t: 'Đạn biến lớn {0}%', v: [10, 14, 18, 22, 25] },
    { id: 'healkill', t: 'Đánh bại địch có xác suất hồi {0} HP', v: [null, 1, 1, 1, 1] },
    { id: 'healhurt', t: 'Khi mất HP có xác suất hồi {0} HP', v: [null, null, 2, 2, 2] },
    { id: 'slowatk', t: 'Tốc độ di chuyển -{0}%, tấn công +{1}', v: [null, null, [20, 3], [28, 4], [35, 5]] },
    { id: 'atkcrit2', t: 'Tấn công -{0}, bạo kích +{1}', v: [[1, 5], [1, 8], [1, 11], [1, 15], [1, 20]] },
    { id: 'rate', t: 'Tốc độ tấn công +{0}%', v: [null, 15, 18, 21, 25] },
    { id: 'mmscrit', t: 'Khi bạo kích bắn thêm {0} Đạn Phép Thuật', v: [null, 1, 2, 3, 3] },
    { id: 'mmsdead', t: 'Khi địch tử vong bắn {0} Đạn Phép Thuật', v: [null, 1, 2, 3, 4] },
    { id: 'crit', t: 'Bạo kích +{0}', v: [3, 6, 9, 12, 12] },
    { id: 'immune', t: 'Sau khi mất HP {0} giây không nhận DMG', v: [null, null, null, 2, 3] },
    { id: 'defcrit', t: 'DMG phải chịu +{0}, bạo kích +{1}', v: [null, [1, 8], [1, 15], [2, 22], [2, 30]] },
    { id: 'wrathrate', t: 'Nạp năng lượng Thần Uy tăng {0}%', v: [null, null, null, 20, 25] },
    { id: 'enkill', t: 'Khi đánh bại địch nhận {0} năng lượng', v: [null, null, null, 8, 12] },
    { id: 'slowbul', t: 'Màn đạn giảm tốc {0}%', v: [null, 15, 19, 24, 30] },
    { id: 'maxenclr', t: 'Không bị tấn công vượt phòng: năng lượng tối đa +{0}', v: [null, null, 6, 8, 10] },
    { id: 'revive', t: 'Khi bị DMG chí mạng tốn {0} Vàng thoát tử vong', v: [null, null, null, 300, 200] },
    { id: 'bossatk', t: 'Mỗi lần đánh bại Thủ Lĩnh +{0} tấn công', v: [null, null, 3, 4, 5] },
    { id: 'wrathhit', t: 'Khi bị tấn công Thần Uy nhận {0}% nạp năng lượng', v: [null, null, 12, 15, 15] }
  ];
  // thuộc tính huyền thoại (chỉ ở bộ phận Đỏ) [WIKI SW "Legendary parts carry unique modifiers"; LOC efx_ultra_atkform, efx_addrange, ...]
  const LEG = [
    { id: 'ultra', t: 'Tấn công biến thành hình thái siêu cấp (DMG +50%, đạn lớn hơn)' },
    { id: 'range', t: 'Phạm vi tấn công tăng mạnh' },
    { id: 'explode', t: 'Tấn công có xác suất gây nổ' },
    { id: 'freeze', t: 'Tấn công có xác suất đóng băng địch thường' },
    { id: 'triple', t: 'Tấn công biến thành liên kích x3, nhưng tốc độ tấn công giảm' }
  ];
  const MOD = {}; for (const m of MODS.concat(LEG)) MOD[m.id] = m;
  A.MODS = MODS; A.LEG = LEG;
  const fmt = (t, v) => { const a = [].concat(v == null ? [] : v); return t.replace(/\{(\d)\}/g, (_, i) => a[+i] != null ? a[+i] : ''); };
  A.modText = m => { const d = MOD[m.id]; return d ? fmt(d.t, m.t >= 5 ? null : d.v[m.t]) : m.id; };
  const modPool = t => MODS.filter(m => m.v[t] != null);
  function rollMod(t, skip) {
    if (t >= 5) return { id: SK.pick(LEG).id, t: 5 };
    const pool = modPool(t).filter(m => !(skip || []).some(s => s.id === m.id));
    return { id: SK.pick(pool.length ? pool : modPool(t)).id, t };
  }

  // ---------------------------------------------------------------- bộ phận
  A.newPart = function (cat, n, slot, rar, el) {
    const p = { cat, n, slot, rar, el: el || SK.pick(C.elements), mods: [], fails: 0 };
    const cnt = C.modCount[rar];
    for (let i = 0; i < cnt; i++) p.mods.push(rar >= 5 ? rollMod(5) : rollMod(SK.randi(0, Math.min(rar, 4)), p.mods));
    return p;
  };
  A.stat = p => DATA[p.cat][p.n - 1][1][p.slot];   // [atk, tốc, năng lượng, khung]
  A.partName = p => DATA[p.cat][p.n - 1][0] + ' · ' + SLOT[p.cat][p.slot];
  A.frame = p => A.stat(p)[3];
  const partIds = ['Blade', 'Guard', 'Grip', 'StaffCore', 'StaffHead', 'StaffBase', 'Bow', 'Arrow', 'BowString'];
  A.prefabOf = p => partIds[CATS.indexOf(p.cat) * 3 + p.slot] + '_' + ('0' + p.n).slice(-2);   // tên prefab trong tools/extra/artifacts.json
  function rollRar(src) {
    if (src === 'boss') return SK.randi(0, 99) < C.redInBoss ? 5 : 4;
    if (src === 'boss2') return SK.chance(0.6) ? 4 : 3;
    let tot = 0; for (const w of C.dropW) tot += w;
    let x = SK.rand() * tot;
    for (let i = 0; i < C.dropW.length; i++) { x -= C.dropW[i]; if (x < 0) return i; }
    return 0;
  }
  A.rollRar = rollRar;
  // chỉ số vũ khí đã mở dần theo tầng [ƯỚC LƯỢNG]
  const nRange = lv => [Math.max(1, lv * 3 - 2), Math.min(15, lv * 5 + 1)];
  A.rollPart = function (G, src, o) {
    const a = G.artifacts, lv = (G.stage && G.stage.level) || 1, [lo, hi] = nRange(lv);
    return A.newPart(a.cat || 'sword', (o && o.n) || SK.randi(lo, hi), (o && o.slot != null) ? o.slot : SK.randi(0, 2), (o && o.rar != null) ? o.rar : rollRar(src));
  };

  // ---------------------------------------------------------------- trạng thái + chỉ số tổng hợp
  A.init = function () {
    return { cat: null, parts: [null, null, null], bag: [], lvl: 0, exp: 0, wrath: { e: 0, active: null, last: null, used: {} }, reforge: 0, picked: 0, locked: false,
      base: null, applied: null, noHitRoom: true, roomT: 0, bosses: 0, stats: { dmg: 0, wrathKills: 0, wraths: 0, spent: 0 }, perLevelReforge: 0, lvPick: [], ag: null };
  };
  const ZERO = () => ({ hp: 0, armor: 0, move: 0, atk: 0, crit: 0, rate: 0, maxen: 0, taken: 0, encrit: 0, enamr: 0, wrathcrit: 0, size: 0, healkill: 0, healhurt: 0, mmscrit: 0, mmsdead: 0,
    immune: 0, wrathrate: 0, enkill: 0, slowbul: 0, maxenclr: 0, revive: 0, bossatk: 0, wrathhit: 0, goldkill: 0, ultra: 0, range: 0, explode: 0, freeze: 0, triple: 0, cost: 0 });
  A.aggregate = function (G) {
    const a = G.artifacts, g = ZERO();
    for (const p of a.parts) {
      if (!p) continue;
      for (const m of p.mods) {
        const v = m.t >= 5 ? 1 : [].concat(MOD[m.id].v[m.t]);
        const x = v[0], y = v[1];
        switch (m.id) {
          case 'hp': g.hp += x; break;
          case 'amrhp': g.armor += x; g.hp += y; break;
          case 'move': g.move += x; break;
          case 'atkcrit': g.atk += x; g.crit += y; break;
          case 'atkcrit2': g.atk -= x; g.crit += y; break;
          case 'defatk': g.taken += x; g.atk += y; break;
          case 'defcrit': g.taken += x; g.crit += y; break;
          case 'slowatk': g.move -= x; g.atk += y; break;
          default: if (m.id in g) g[m.id] += x;
        }
      }
    }
    const sb = a.cat && a.parts[1] && SUB[a.cat] && SUB[a.cat][a.parts[1].n];   // bộ phận phụ tăng chỉ số: Hộ Thủ Dũng Sĩ +33% tốc đánh, Hộ Thủ Katana Vô Úy tăng bạo kích [WIKI SW]
    if (sb && sb[0] === 'rate') g.rate += sb[1] * 100; else if (sb && sb[0] === 'critup') g.crit += sb[1];
    const lv = a.lvPick; g.atk += (lv.atk || 0) * C.levelAdd.atk; g.crit += (lv.crit || 0) * C.levelAdd.crit; g.hp += (lv.hp || 0) * C.levelAdd.hp;
    g.armor += (lv.armor || 0) * C.levelAdd.armor; g.rate += (lv.rate || 0) * C.levelAdd.rate;
    g.atk += (a.bossKills || 0) * g.bossatk;
    return g;
  };
  // Đặt lại chỉ số người chơi theo bộ phận: cộng lệch so với lần trước (không đè buff khác).
  A.recalc = function (G) {
    const a = G.artifacts, p = G.player; if (!a || !p) return;
    if (!a.base) a.base = { };
    const g = A.aggregate(G), ap = a.applied || { hp: 0, armor: 0, en: 0, crit: 0, move: 1, rate: 1 };
    a.ag = g;
    const hpD = g.hp - ap.hp, arD = g.armor - ap.armor, enD = g.maxen - ap.en;
    p.hpMax += hpD; p.hp = Math.max(1, Math.min(p.hpMax, p.hp + Math.max(0, hpD)));
    p.armorMax += arD; p.armor = Math.max(0, Math.min(p.armorMax, p.armor + Math.max(0, arD)));
    p.energyMax += enD; p.energy = Math.max(0, Math.min(p.energyMax, p.energy + Math.max(0, enD)));
    p.crit = (p.crit || 0) + (g.crit - ap.crit);
    const mv = Math.max(0.3, 1 + g.move / 100), rt = Math.max(0.3, 1 + g.rate / 100);
    p.moveMul = (p.moveMul == null ? 1 : p.moveMul) * mv / ap.move;
    p.rateMul = (p.rateMul == null ? 1 : p.rateMul) * rt / ap.rate;
    a.applied = { hp: g.hp, armor: g.armor, en: g.maxen, crit: g.crit, move: mv, rate: rt };
    // vũ khí đang cầm
    A.syncWeapon(G);
  };
  // chỉ số vũ khí = tổng ba bộ phận [ĐO part] (đoán cách cộng: ƯỚC LƯỢNG), cộng thuộc tính
  A.weaponStats = function (G) {
    const a = G.artifacts, g = a.ag || ZERO();
    let atk = 0, spd = 0, en = 0;
    for (const p of a.parts) { if (!p) continue; const s = A.stat(p); atk += s[0]; spd += s[1]; en += s[2]; }
    const ult = g.ultra ? 1.5 : 1, tri = g.triple ? 0.55 : 1;
    return { atk: Math.max(1, Math.round((atk + g.atk) * ult)), rps: Math.max(0.5, spd * tri), cost: Math.max(0, en + g.cost), g };
  };
  A.main = G => G.artifacts && G.artifacts.parts[0];
  // vũ khí ẩn ở DS.weapons (không liệt kê: không vào bể rơi đồ), như troop_bite
  const HID = (id, def) => Object.defineProperty(DS.weapons, id, { configurable: true, writable: true, enumerable: false, value: Object.assign({ kind: 'artifact', crit: 0, repel: 2, arc: 0, range: 0, grade: 1, rarity: 'White', moveMod: 0, cost: 0, rps: 2, dmg: 1, sprite: null }, def) });
  HID('atf_hand', { name: 'Tay không', nameEn: 'Bare hands', kind: 'melee', dmg: 1, range: 16, arc: 120, rps: 2.5 });
  for (const c of CATS) HID('atf_' + c, { name: 'Thần Khí', nameEn: 'Sacred Weapon', cat: c });
  A.syncWeapon = function (G) {
    const a = G.artifacts, p = G.player; if (!a || !p) return;
    const w = p.weapons[0]; if (!w) return;
    if (!a.cat) { return; }
    const m = a.parts[0], d = DS.weapons['atf_' + a.cat], s = A.weaponStats(G);
    d.dmg = s.atk; d.rps = s.rps; d.cost = s.cost; d.sprite = m ? A.frame(m) : null;
    d.name = m ? DATA[a.cat][m.n - 1][0] : 'Thần Khí';
    if (w.id !== 'atf_' + a.cat) { p.weapons[0] = SK.makeWeapon('atf_' + a.cat); p.cur = 0; }
    p.hideHeld = false;
  };

  // ---------------------------------------------------------------- phát sát thương (mọi đòn Thần Khí qua đây)
  const alive = e => e.st !== 'spawn' && e.st !== 'dead';
  const eMid = e => [e.x, e.y - e.hb.off[1] * e.scale];
  A.alive = alive; A.eMid = eMid;
  A.enemiesNear = (x, y, r) => SK.G.enemies.filter(e => { if (!alive(e)) return false; const [ex, ey] = eMid(e); return Math.hypot(ex - x, ey - y) < r + e.r; });
  A.nearest = (G, x, y, r, skip) => { let b = null, bd = r; for (const e of G.enemies) { if (!alive(e) || (skip && skip.has && skip.has(e))) continue; const [ex, ey] = eMid(e), d = Math.hypot(ex - x, ey - y); if (d < bd) { b = e; bd = d; } } return b; };
  // hitE: dmg thô (đã nhân atk); opts {noProc, noCharge, crit(ép), repel}
  A.hitE = function (G, e, dmg, ang, opts) {
    const a = G.artifacts, p = G.player; opts = opts || {};
    if (!alive(e)) return false;
    const crit = opts.crit != null ? opts.crit : SK.rand() * 100 < (p.crit || 0);
    let v = Math.max(1, Math.round(dmg * (p.dmgMul || 1))) * (crit ? 2 : 1);
    if (e._atfMark && !opts.noProc) { v = Math.round(v * 2.25); e._atfMark = 0; }
    a.inHit = !opts.noCharge ? 1 : 0; e._lastCrit = crit;
    const hp0 = e.hp;
    SK.hurtEnemy(G, e, v, crit, ang || 0, opts.repel != null ? opts.repel : 2);
    a.inHit = 0;
    a.stats.dmg += Math.max(0, hp0 - Math.max(0, e.hp));
    if (a.wrath.active && !opts.noProc) a.wrath.hitsBy = (a.wrath.hitsBy || 0) + 1;
    if (!opts.noProc) A.procs(G, e, v, crit, ang || 0, opts);
    if (crit && !opts.noProc) A.onCrit(G, e);
    return true;
  };
  A.onCrit = function (G, e) {
    const a = G.artifacts, p = G.player, g = a.ag || ZERO();
    if (g.encrit) p.energy = Math.min(p.energyMax, p.energy + g.encrit);
    for (let i = 0; i < g.mmscrit; i++) A.magicBullet(G, p.x, p.y - 8, e);
  };
  // Đạn Phép Thuật nhỏ tự đuổi [LOC efx_mms_*; số sát thương ƯỚC LƯỢNG = 50% tấn công]
  A.magicBullet = function (G, x, y, tgt) {
    const s = A.weaponStats(G), tg = tgt && alive(tgt) ? tgt : A.nearest(G, x, y, 140);
    const ang = tg ? Math.atan2(eMid(tg)[1] - y, eMid(tg)[0] - x) : SK.rand() * Math.PI * 2;
    A.shot(G, { x, y, ang: ang + (SK.rand() - 0.5) * 0.6, spd: 150, dmg: Math.max(1, Math.round(s.atk * 0.5)), r: 3, life: 1.2, homing: 6, col: '#c9a0ff', noProc: true });
  };

  // ---------------------------------------------------------------- hiệu ứng trạng thái (đốt / độc) tự quản
  const STAT = { burn: { tick: 0.5, dur: 1.5, dmg: 3, col: '#ff8a3a' }, poison: { tick: 1, dur: 4, dmg: 2, col: '#7adf5a' }, slow: { dur: 2, col: '#9adfff' } };
  A.status = function (G, e, kind, mult) {
    if (!e || !alive(e)) return;
    e._atf = e._atf || {};
    const S = STAT[kind];
    if (e._atf[kind]) { e._atf[kind].t = S.dur; return; }
    e._atf[kind] = { t: S.dur, tick: S.tick || 1, mult: mult || 1 };
    if (kind === 'slow') e.moveMul = (e.moveMul == null ? 1 : e.moveMul) * 0.3;
    SK.emit('artifactStatus', G, e, kind);
  };
  function tickStatus(G, dt) {
    for (const e of G.enemies) {
      if (!e._atf) continue;
      for (const k of Object.keys(e._atf)) {
        const s = e._atf[k], S = STAT[k];
        if (!alive(e)) { delete e._atf[k]; continue; }
        s.t -= dt;
        if (k !== 'slow') { s.tick -= dt; if (s.tick <= 0) { s.tick += S.tick; A.hitE(G, e, S.dmg * s.mult, 0, { noProc: true, noCharge: true, repel: 0, crit: false }); } }
        if (s.t <= 0) { if (k === 'slow') e.moveMul = (e.moveMul || 0.3) / 0.3; delete e._atf[k]; }
      }
    }
  }

  // ---------------------------------------------------------------- hiệu ứng phụ khi đánh trúng (bộ phận phụ + thuộc tính huyền thoại)
  // Bộ phận phụ theo vũ khí [WIKI SW "Part effects"]: [loại, xác suất / giá trị]. Chỉ liệt kê loại đã làm; loại khác -> GAPS.md.
  const SUB = {
    sword: { 1: ['rate', 0.33], 2: ['mark', 0.2], 5: ['dot', 0.3], 7: ['beams', 3], 8: ['quake', 0.3], 9: ['critup', 15], 10: ['critshot', 6], 11: ['zap', 0.3], 13: ['bats', 0.3], 14: ['burn', 0.3], 15: ['critshot', 8] },
    staff: { 1: ['rate', 0.3], 6: ['burn', 0.3], 7: ['poison', 0.3], 9: ['zap', 0.4], 10: ['quake', 0.3], 14: ['poison', 0.3], 15: ['burn', 0.3] },
    bow: { 3: ['stunc', 0.3], 6: ['quake', 0.3], 7: ['zap', 0.3], 8: ['poison', 0.3], 9: ['zap', 0.3], 12: ['poison', 0.3], 13: ['burn', 0.3], 14: ['shards', 4], 15: ['zap', 0.2] }
  };
  A.SUB = SUB;
  A.sub = G => { const a = G.artifacts, s = a.parts[1]; return s ? (SUB[a.cat][s.n] || null) : null; };
  A.procs = function (G, e, dmg, crit, ang, o) {
    const a = G.artifacts, g = a.ag || ZERO(), sub = A.sub(G), s = A.weaponStats(G), [ex, ey] = eMid(e);
    if (sub) {
      const k = sub[0], v = sub[1];
      if (k === 'burn' && SK.chance(v)) A.status(G, e, 'burn');
      else if ((k === 'poison' || k === 'dot' || k === 'bats') && SK.chance(v)) A.status(G, e, 'poison');
      else if (k === 'mark' && SK.chance(v)) e._atfMark = 1;
      else if (k === 'zap' && SK.chance(v)) A.zap(G, e, Math.max(1, Math.round(s.atk * 0.1 * 2)), 2);
      else if (k === 'quake' && SK.chance(v)) A.blast(G, ex, ey + 4, 28, Math.max(1, Math.round(s.atk * 0.3)), { col: '#c8a878' });
      else if (k === 'stunc' && crit) A.status(G, e, 'slow');
      else if (k === 'critshot' && crit) for (let i = 0; i < v; i++) A.shot(G, { x: ex, y: ey, ang: ang + i * Math.PI * 2 / v, spd: 130, dmg: Math.max(1, Math.round(s.atk * 0.3)), r: 3, life: 0.9, pierce: 1, col: '#ffd84a', noProc: true });
      else if (k === 'shards' && SK.chance(0.25)) for (let i = 0; i < v; i++) A.shot(G, { x: ex, y: ey, ang: SK.rand() * 6.28, spd: 110, dmg: Math.max(1, Math.round(s.atk * 0.3)), r: 3, life: 1.2, homing: 8, col: '#ff4a5a', noProc: true });
    }
    if (a.wrath.active && a.wrath.active.kind === 'ffw') A.status(G, e, 'burn');   // Lan Rộng: đòn trúng thì đốt
    if (g.explode && SK.chance(0.25)) A.blast(G, ex, ey, 30, Math.max(1, Math.round(s.atk * 0.4)), { col: '#ffb040' });
    if (g.freeze && SK.chance(0.15) && !e.bossKey) A.status(G, e, 'slow');
  };
  A.zap = function (G, from, dmg, n) {
    const hit = new Set([from]); let cur = from;
    for (let i = 0; i < n; i++) {
      const [cx, cy] = eMid(cur), nx = A.nearest(G, cx, cy, 70, hit); if (!nx) break;
      hit.add(nx); const [nx_, ny_] = eMid(nx);
      A.hitE(G, nx, dmg, 0, { noProc: true, repel: 0, crit: false });
      G.props.push({ x: cx, y: cy, t: 0, update(g2, pr, dt) { pr.t += dt; if (pr.t > 0.18) pr.gone = true; },
        draw(ctx, g2, pr) { ctx.strokeStyle = 'rgba(255,240,120,' + (1 - pr.t / 0.18) + ')'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo((cx + nx_) / 2 + SK.randf(-3, 3), (cy + ny_) / 2 + SK.randf(-3, 3)); ctx.lineTo(nx_, ny_); ctx.stroke(); } });
      cur = nx;
    }
  };
  // Nổ vòng tròn
  A.blast = function (G, x, y, r, dmg, o) {
    o = o || {};
    for (const e of G.enemies) { if (!alive(e)) continue; const [ex, ey] = eMid(e); if (Math.hypot(ex - x, ey - y) < r + e.r) A.hitE(G, e, dmg, Math.atan2(ey - y, ex - x), { noProc: true, repel: o.repel != null ? o.repel : 1, noCharge: !!o.noCharge, crit: false }); }
    G.props.push({ x, y, t: 0, dur: o.dur || 0.3, update(g2, pr, dt) { pr.t += dt; if (pr.t > pr.dur) pr.gone = true; },
      draw(ctx, g2, pr) { const k = pr.t / pr.dur; ctx.strokeStyle = o.col || '#fff'; ctx.globalAlpha = 1 - k; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r * (0.3 + 0.7 * k), 0, 6.28); ctx.stroke(); ctx.globalAlpha = 1; } });
  };
  A.dot = A.status;

  // ---------------------------------------------------------------- đạn tự quản (Thần Khí + Thần Uy)
  // o: {x, y, ang, spd (px/s), dmg, r, life, pierce (số quái xuyên thêm), homing (rad/s), bounce, col, size, onDie(G, s), noProc, noCharge, wall (xuyên tường)}
  A.shot = function (G, o) {
    const a = G.artifacts, s = Object.assign({ r: 3, life: 1.2, pierce: 0, t: 0, hit: new Set(), spd: 140, dmg: 1, col: '#9fd0ff', size: 1 }, o);
    s.vx = Math.cos(s.ang) * s.spd; s.vy = Math.sin(s.ang) * s.spd;
    const g = a.ag || ZERO(); if (g.size && !s.noSize) s.size *= 1 + g.size / 100;
    (a.shots = a.shots || []).push(s); return s;
  };
  function stepShots(G, dt) {
    const a = G.artifacts; if (!a.shots) return;
    for (const s of a.shots) {
      s.t += dt; s.life -= dt;
      if (s.life <= 0) { s.dead = true; continue; }
      if (s.ret && !s.flipped && s.t >= s.ret) { s.flipped = true; s.vx = -s.vx; s.vy = -s.vy; s.hit.clear(); }   // Sao Mới: bay ra rồi quay về người chơi
      if (s.homing) {
        const tg = A.nearest(G, s.x, s.y, 120, s.hit);
        if (tg) { const [ex, ey] = eMid(tg), want = Math.atan2(ey - s.y, ex - s.x), cur = Math.atan2(s.vy, s.vx), da = Math.atan2(Math.sin(want - cur), Math.cos(want - cur)), turn = SK.clamp(da, -s.homing * dt, s.homing * dt), sp = Math.hypot(s.vx, s.vy); s.vx = Math.cos(cur + turn) * sp; s.vy = Math.sin(cur + turn) * sp; }
      }
      const n = Math.max(1, Math.ceil(Math.hypot(s.vx, s.vy) * dt / 4));
      for (let k = 0; k < n && !s.dead; k++) {
        const nx = s.x + s.vx * dt / n, ny = s.y + s.vy * dt / n;
        if (!s.wall && W.solidAt(G.map, nx, ny + 6)) {
          if (s.bounce) { const sx = W.solidAt(G.map, nx, s.y + 6), sy = W.solidAt(G.map, s.x, ny + 6); if (sx || !sy) s.vx = -s.vx; if (sy || !sx) s.vy = -s.vy; s.bounce--; continue; }
          s.dead = true; break;
        }
        s.x = nx; s.y = ny;
        for (const e of G.enemies) {
          if (!alive(e) || s.hit.has(e)) continue;
          const [ex, ey] = eMid(e); if (Math.hypot(ex - s.x, ey - s.y) > s.r * s.size + e.r) continue;
          s.hit.add(e);
          A.hitE(G, e, s.dmg, Math.atan2(s.vy, s.vx), { noProc: !!s.noProc, noCharge: !!s.noCharge, repel: 1.5 });
          if (s.burn) A.status(G, e, 'burn');
          if (s.blast) A.blast(G, s.x, s.y, s.blast, Math.max(1, Math.round(s.dmg * 0.6)), { col: s.col, noCharge: true });
          if (s.pierce-- <= 0) { s.dead = true; break; }
        }
      }
      if (s.dead && s.onDie) s.onDie(G, s);
    }
    a.shots = a.shots.filter(s => !s.dead);
  }
  function drawShots(ctx, G) {
    const a = G.artifacts; if (!a || !a.shots) return;
    for (const s of a.shots) {
      ctx.fillStyle = s.col; ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(s.x - s.vx * 0.02, s.y - s.vy * 0.02, s.r * s.size * 1.3, 0, 6.28); ctx.fill(); ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * s.size, 0, 6.28); ctx.fill();
    }
  }
  // một "lớp" cố định trong G.props: cập nhật và vẽ mọi thứ của chế độ
  function layer(G) {
    G.props.push({ atfLayer: 1, x: 0, y: 1e9, update(g2, pr, dt) { if (on(g2)) { stepShots(g2, dt); tickStatus(g2, dt); if (A.tickWrath) A.tickWrath(g2, dt); } }, draw(ctx, g2) { drawShots(ctx, g2); drawOrbs(ctx, g2); if (A.drawWrath) A.drawWrath(ctx, g2); } });
  }
  A.layer = layer;

  // ---------------------------------------------------------------- tấn công theo loại vũ khí [WIKI SW "Part effects"; đòn riêng từng vũ khí ƯỚC LƯỢNG]
  // Kiếm: [dạng, tầm (px), góc (độ), thêm]; dạng: arc quạt / thrust đâm / combo3 hai chém + một đâm 400% [WIKI Short Sword of Night Raid]
  const SW = {
    1: ['arc', 24, 110], 2: ['combo3', 24, 90, { stab: 4 }], 3: ['thrust', 34, 30, { dash: 18 }], 4: ['arc', 30, 140], 5: ['arc', 26, 120, { shot: 0.33 }], 6: ['thrust', 34, 36],
    7: ['arc', 32, 130, { shot: 0.5 }], 8: ['arc', 30, 120, { quake: 0.3 }], 9: ['arc', 30, 110], 10: ['combo3', 28, 110, { stab: 0.5 }], 11: ['arc', 28, 110], 12: ['arc', 34, 130],
    13: ['arc', 32, 130], 14: ['arc', 32, 130], 15: ['arc', 32, 130, { shot: 0.25 }]
  };
  // Gậy: [dạng, thêm]; bolt: n viên, spread độ, homing, pierce; flash: tia quanh người; all: cột lửa trên mọi quái thấy; zone: vùng đi tới; orbit: cầu quay
  const ST = {
    1: ['bolt', { n: 1, homing: 3 }], 2: ['bolt', { n: 1, pierce: 99, spd: 260, col: '#9ad8ff' }], 3: ['bolt', { n: 2, spread: 14, homing: 2, col: '#d04a4a' }], 4: ['orbit', { n: 3 }],
    5: ['bolt', { n: 3, spread: 22, col: '#ff9a3a' }], 6: ['all', { col: '#ff6a2a' }], 7: ['zone', { col: '#7adf5a', life: 2.4, tick: 0.3, r: 18 }], 8: ['bolt', { n: 1, blast: 22, col: '#ffffff' }],
    9: ['flash', { r: 54 }], 10: ['bolt', { n: 3, spread: 18, homing: 4, blast: 14, col: '#ff6a2a' }], 11: ['pull', { r: 30 }], 12: ['bolt', { n: 1, shatter: 5, col: '#aee8ff' }],
    13: ['wave', {}], 14: ['zone', { col: '#8a3aa8', life: 3, tick: 0.35, r: 16 }], 15: ['spike', { col: '#ff5a2a' }]
  };
  // Cung: n mũi, spread, pierce, homing...
  const BW = {
    1: { n: 1 }, 2: { n: 1, spd: 250 }, 3: { n: 1, crit: 15 }, 4: { n: 1, rate: 1.15 }, 5: { n: 1, pierce: 99 }, 6: { n: 1 }, 7: { n: 1 }, 8: { n: 1 }, 9: { n: 1 }, 10: { n: 2, spread: 8 },
    11: { n: 3, spread: 12, homing: 2 }, 12: { n: 1 }, 13: { n: 1 }, 14: { n: 1 }, 15: { n: 1 }
  };
  A.STYLES = { SW, ST, BW };
  const handOf = (p) => SK.handPos(p, 1);
  A.slash = function (G, p, ang, reach, arc, col) {
    const [hx, hy] = handOf(p);
    G.props.push({ x: p.x, y: p.y, t: 0, update(g2, pr, dt) { pr.t += dt; if (pr.t > 0.16) pr.gone = true; },
      draw(ctx, g2, pr) { const k = pr.t / 0.16; ctx.strokeStyle = col || '#e8f4ff'; ctx.globalAlpha = 1 - k; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(hx, hy, reach * (0.65 + 0.35 * k), ang - arc / 2, ang + arc / 2); ctx.stroke(); ctx.globalAlpha = 1; } });
  };
  const inArc = (cx, cy, ex, ey, pad, reach, ang, half) => { const d = Math.hypot(ex - cx, ey - cy); if (d > reach + pad) return false; const q = Math.atan2(ey - cy, ex - cx) - ang; return Math.abs(Math.atan2(Math.sin(q), Math.cos(q))) <= half || d < 8; };
  function swordFire(G, p, w, o) {
    const a = G.artifacts, m = a.parts[0], s = A.weaponStats(G), g = s.g, sty = SW[m.n], [shape, reach0, arcDeg, ex] = sty, X = ex || {};
    const reach = reach0 * (g.range ? 1.5 : 1), ang = o.ang, cx = p.x, cy = p.y - 7;
    w.combo = ((w.combo || 0) + 1) % 3;
    let k = 1, half = SK.deg(arcDeg / 2), thrust = shape === 'thrust';
    if (shape === 'combo3' && w.combo === 0) { thrust = true; k = X.stab; half = SK.deg(24); }   // nhát thứ ba là đâm
    if (thrust && shape === 'thrust') half = SK.deg(arcDeg / 2);
    const dmg = s.atk * k;
    if (thrust && X.dash) SK.selfForce(p, ang, X.dash);
    let hits = 0;
    for (const e of G.enemies) { if (!alive(e)) continue; const [ex2, ey2] = eMid(e); if (inArc(cx, cy, ex2, ey2, e.r, thrust ? reach * 1.2 : reach, ang, half)) { A.hitE(G, e, dmg, ang, { repel: 3 }); hits++; } }
    for (const b of G.bullets) { if (b.side !== 'e' || b.dead || !inArc(cx, cy, b.x, b.y, 4, reach, ang, half)) continue; if (p.reflectBullets) SK.reflectBullet(G, b, ang); else b.dead = true; }
    A.slash(G, p, ang, reach, thrust ? SK.deg(30) : half * 2, thrust ? '#ffe28a' : undefined);
    if (X.shot) A.shot(G, { x: cx, y: cy, ang, spd: 150, dmg: Math.max(1, Math.round(s.atk * X.shot)), r: 3, life: 0.8, pierce: 99, wall: true, col: '#a070ff', noProc: true });
    if (X.quake && SK.chance(X.quake)) A.blast(G, cx + Math.cos(ang) * reach * 0.8, cy + Math.sin(ang) * reach * 0.8, 24, Math.max(1, Math.round(s.atk * 0.3)), { col: '#c8a878' });
    const sub = A.sub(G);
    if (sub && sub[0] === 'beams') for (let i = -1; i <= 1; i++) A.shot(G, { x: cx, y: cy, ang: ang + i * 0.12, spd: 170, dmg: Math.max(1, Math.round(s.atk * 0.1)), r: 2, life: 0.35, pierce: 99, col: '#fff0a0', noProc: true });
    w.swing = 0.16;
    return hits;
  }
  function staffFire(G, p, w, o) {
    const a = G.artifacts, m = a.parts[0], s = A.weaponStats(G), g = s.g, [shape, X] = ST[m.n], ang = o.ang, cx = p.x, cy = p.y - 8, base = s.atk;
    const sz = 1;
    if (shape === 'bolt') {
      const n = X.n || 1, sp = SK.deg(X.spread || 0);
      for (let i = 0; i < n; i++) {
        const sh = A.shot(G, { x: o.x, y: o.y, ang: ang + (i - (n - 1) / 2) * sp, spd: X.spd || 170, dmg: base, r: 3, life: g.range ? 1.8 : 1.2, pierce: X.pierce || 0, homing: X.homing || 0, blast: X.blast || 0, col: X.col || '#8ab8ff', size: sz });
        if (X.shatter) sh.onDie = (G2, q) => { for (let j = 0; j < X.shatter; j++) A.shot(G2, { x: q.x, y: q.y, ang: j * Math.PI * 2 / X.shatter, spd: 130, dmg: Math.max(1, Math.round(base * 0.5)), r: 2, life: 0.5, col: '#cdf2ff', noProc: true, noSize: true }); };
      }
    } else if (shape === 'orbit') {
      const n = X.n; a.orbs = { t: 0, life: 1.6, n, dmg: Math.max(1, Math.round(base * 0.8)), hit: new Map() };
    } else if (shape === 'all') {
      for (const e of G.enemies) { if (!alive(e)) continue; const [ex, ey] = eMid(e); if (!W.los(G.map, cx, cy, ex, ey) || Math.hypot(ex - cx, ey - cy) > 190) continue;
        G.props.push({ x: ex, y: ey, t: 0, e, update(g2, pr, dt) { pr.t += dt; if (pr.t > 0.3) pr.gone = true; if (!pr.fired && pr.t > 0.22) { pr.fired = true; A.blast(g2, ex, ey, 14, base, { col: X.col, dur: 0.2 }); } },
          draw(ctx, g2, pr) { ctx.fillStyle = X.col; ctx.globalAlpha = 0.6; ctx.fillRect(ex - 3, ey - 40 * (1 - pr.t / 0.3), 6, 40 * (pr.t / 0.3)); ctx.globalAlpha = 1; } }); }
    } else if (shape === 'flash') {
      A.blast(G, cx, cy, X.r * (g.range ? 1.3 : 1), base, { col: '#cfe6ff', dur: 0.25 });
    } else if (shape === 'pull') {
      const tg = p.target && alive(p.target) ? p.target : A.nearest(G, cx, cy, 160);
      if (tg) { const [ex, ey] = eMid(tg); for (const e of G.enemies) { if (!alive(e) || e === tg) continue; const [qx, qy] = eMid(e), d = Math.hypot(qx - ex, qy - ey); if (d < X.r * 2 && d > 1) { e.kx = (e.kx || 0) + (ex - qx) / d * 90; e.ky = (e.ky || 0) + (ey - qy) / d * 90; } } A.blast(G, ex, ey, X.r, base, { col: '#d8b878' }); }
    } else if (shape === 'zone') {
      const x0 = cx + Math.cos(ang) * 14, y0 = cy + Math.sin(ang) * 14, life = X.life;
      const z = { x: x0, y: y0, t: 0, tk: 0, update(g2, pr, dt) { pr.t += dt; pr.tk += dt; pr.x += Math.cos(ang) * 22 * dt; pr.y += Math.sin(ang) * 22 * dt; if (pr.tk >= X.tick) { pr.tk = 0; for (const e of g2.enemies) { if (!alive(e)) continue; const [ex, ey] = eMid(e); if (Math.hypot(ex - pr.x, ey - pr.y) < X.r + e.r) A.hitE(g2, e, Math.max(1, Math.round(base * 0.6)), ang, { noProc: true, repel: 0.5 }); } } if (pr.t > life) pr.gone = true; },
        draw(ctx, g2, pr) { ctx.fillStyle = X.col; ctx.globalAlpha = 0.35 * (1 - pr.t / life); ctx.beginPath(); ctx.ellipse(pr.x, pr.y, X.r, X.r * 0.7, 0, 0, 6.28); ctx.fill(); ctx.globalAlpha = 1; } };
      G.props.push(z);
    } else if (shape === 'wave') {
      for (let i = 0; i < 3; i++) w.q.push({ t: i * 0.12, fn: () => { const sa = ang; A.shot(G, { x: cx, y: cy, ang: sa, spd: 130, dmg: base, r: 7, life: 0.9, pierce: 99, col: '#9ad8ff', wall: true, noSize: true }); } });
    } else if (shape === 'spike') {
      const tg = p.target && alive(p.target) ? p.target : A.nearest(G, cx, cy, 170);
      if (tg) { const [ex, ey] = eMid(tg); A.blast(G, ex, ey, 10, base, { col: X.col, dur: 0.2 }); A.status(G, tg, 'burn', 1); a.pools = a.pools || [];
        G.props.push({ x: ex, y: ey, t: 0, tk: 0, update(g2, pr, dt) { pr.t += dt; pr.tk += dt; if (pr.tk >= 0.35) { pr.tk = 0; for (const e of g2.enemies) { if (!alive(e)) continue; const [qx, qy] = eMid(e); if (Math.hypot(qx - ex, qy - ey) < 14 + e.r) A.hitE(g2, e, Math.max(1, Math.round(base * 0.4)), 0, { noProc: true, repel: 0 }); } } if (pr.t > 3) pr.gone = true; },
          draw(ctx, g2, pr) { ctx.fillStyle = X.col; ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.ellipse(ex, ey + 4, 14, 9, 0, 0, 6.28); ctx.fill(); ctx.globalAlpha = 1; } }); }
    }
    w.kick = 2;
  }
  function bowFire(G, p, w, o) {
    const a = G.artifacts, m = a.parts[0], s = A.weaponStats(G), g = s.g, X = BW[m.n], ang = o.ang, n = X.n || 1, sp = SK.deg(X.spread || 0);
    const dmg = Math.round(s.atk * 1.5);   // chưa có tụ lực: một mức 150% (wiki: 100%-200% theo tụ lực)
    for (let i = 0; i < n; i++) {
      A.shot(G, { x: o.x, y: o.y, ang: ang + (i - (n - 1) / 2) * sp, spd: X.spd || 210, dmg: Math.round(dmg / (n > 1 ? 1.4 : 1)), r: 2.5, life: g.range ? 1.6 : 1.1, pierce: X.pierce || 0, homing: X.homing || 0, col: '#f0e0a0', size: 1, bowCrit: X.crit });
    }
    w.kick = 3;
  }
  SK.WEAPON_KINDS.artifact = {
    fire(G, p, w, o) {
      if (!on(G) || !G.artifacts.cat || !G.artifacts.parts[0]) return;
      const a = G.artifacts, g = a.ag || ZERO(), f = () => { const o2 = Object.assign({}, o, { ang: p.aim }); (a.cat === 'sword' ? swordFire : a.cat === 'staff' ? staffFire : bowFire)(G, p, w, o2); };
      f();
      if (g.triple) { w.q.push({ t: 0.12, fn: f }); w.q.push({ t: 0.24, fn: f }); }
      SK.emit('artifactFire', G, a.cat);
    }
  };
  // cầu quay của Gậy Pháp Sư Canh Gác
  function tickOrbs(G, dt) {
    const a = G.artifacts, ob = a.orbs, p = G.player; if (!ob) return;
    ob.t += dt; if (ob.t > ob.life) { a.orbs = null; return; }
    for (let i = 0; i < ob.n; i++) {
      const th = ob.t * 7 + i * Math.PI * 2 / ob.n, x = p.x + Math.cos(th) * 20, y = p.y - 8 + Math.sin(th) * 20;
      for (const e of G.enemies) { if (!alive(e)) continue; const [ex, ey] = eMid(e); if (Math.hypot(ex - x, ey - y) < 6 + e.r && (G.t - (ob.hit.get(e) || -9)) > 0.4) { ob.hit.set(e, G.t); A.hitE(G, e, ob.dmg, th, { noProc: true, repel: 1 }); } }
    }
  }
  function drawOrbs(ctx, G) {
    const a = G.artifacts, ob = a && a.orbs, p = G.player; if (!ob) return;
    for (let i = 0; i < ob.n; i++) { const th = ob.t * 7 + i * Math.PI * 2 / ob.n; ctx.fillStyle = '#9fd0ff'; ctx.beginPath(); ctx.arc(p.x + Math.cos(th) * 20, p.y - 8 + Math.sin(th) * 20, 3, 0, 6.28); ctx.fill(); }
  }
  A.tickOrbs = tickOrbs; A.drawOrbs = drawOrbs;

  // ---------------------------------------------------------------- vào chế độ: vũ khí thường mất, chỉ một vũ khí [WIKI SW "First Edition"]
  let pend = false;
  const startRun0 = SK.startRun;
  SK.startRun = function (heroId, mode, factors) {
    pend = mode === 'artifacts';
    try { return startRun0.apply(this, arguments); } finally { pend = false; }
  };
  // một vũ khí: lobby.js không nhét vũ khí rương/két vào ô hai (cờ có sẵn của Cận Chiến/Một Vũ Khí)
  const factorsOn0 = SK.factorsOn;
  if (factorsOn0) SK.factorsOn = function (G) { const r = factorsOn0.apply(this, arguments); if (pend && G.mods) G.mods.oneWeapon = true; return r; };
  A.start = hero => SK.startRun(hero || 'knight', 'artifacts', []);

  SK.on('runStart', G => {
    if (!on(G)) return;
    const p = G.player, a = G.artifacts;
    G.factors = []; if (SK.factorsOn) SK.factorsOn(G);
    G.mods.oneWeapon = true;
    G.mods.skillCdMul = (G.mods.skillCdMul || 1) * C.skillCd;   // hồi chiêu kỹ năng x3,5 [ĐO cfg]
    p.weapons = [SK.makeWeapon('atf_hand'), null]; p.cur = 0;
    if (p.buffs) p.buffs.length = 0;
    a.base = { hp: p.hpMax, armor: p.armorMax, en: p.energyMax };
    A.recalc(G);
  });
  // quái và trùm nhiều máu hơn [ĐO cfg enemyHpFactor/bossHpFactor/enemyHpIncrementFactor]
  const makeEnemy0 = SK.makeEnemy;
  SK.makeEnemy = function (G, id, x, y, room) {
    const e = makeEnemy0.apply(this, arguments);
    if (on(G) && e && !e._atfHp) {
      e._atfHp = 1;
      const lv = (G.stage && G.stage.level) || 1, k = (e.bossKey ? C.bossHp : C.enemyHp) * Math.pow(C.enemyHpInc, lv - 1);
      e.hp = e.hpMax = Math.round(e.hpMax * k);
    }
    return e;
  };
  // sát thương nhận vào: thuộc tính "DMG phải chịu +x", miễn thương, hồi máu, cứu mạng bằng vàng
  const hurtPlayer0 = SK.hurtPlayer;
  SK.hurtPlayer = function (G, dmg, ...rest) {
    if (!on(G) || !G.player || dmg <= 0) return hurtPlayer0.call(this, G, dmg, ...rest);
    const p = G.player, a = G.artifacts, g = a.ag || ZERO();
    if (p.st === 'dead' || p.invulT > 0) return hurtPlayer0.call(this, G, dmg, ...rest);
    if (g.taken) dmg = Math.max(1, dmg + g.taken);
    const lethal = !p.god && p.armor + p.hp <= dmg + (G.badass ? 1 : 0);
    if (lethal && g.revive && p.gold >= g.revive) { p.gold -= g.revive; p.invulT = 1.5; p.hp = Math.max(p.hp, 1); say(G, 'Thần Khí cứu mạng: -' + g.revive + ' Vàng', 2.5); return false; }
    const hp0 = p.hp, ok = hurtPlayer0.call(this, G, dmg, ...rest);
    if (ok) {
      a.noHitRoom = false;
      if (p.hp < hp0 && p.st !== 'dead') {
        if (g.immune) p.invulT = Math.max(p.invulT, g.immune);
        if (g.healhurt && SK.chance(0.2)) p.hp = Math.min(p.hpMax, p.hp + g.healhurt);
      }
      if (g.wrathhit) A.addWrath(G, g.wrathhit);
    }
    return ok;
  };

  // ---------------------------------------------------------------- vòng chơi mỗi bước
  const up0 = SK.updatePlayer;
  let lastArmor = 0;
  SK.updatePlayer = function (G, dt) {
    const r = up0.apply(this, arguments);
    if (on(G) && G.player && G.state === 'stage') A.step(G, G.player, dt);
    return r;
  };
  A.step = function (G, p, dt) {
    const a = G.artifacts, R = SK.ROOMS, g = a.ag || ZERO();
    a.roomT += dt;
    // không có thiên phú trong chế độ này [WIKI SW "Characters cannot take any buffs"]
    if (R && R.choice && R.choice.open) { R.choice.open = false; R.choice.cards = []; G.hold = false; }
    // đồ rơi (rương, quà) đổi thành bộ phận: vũ khí thường không tồn tại ở đây
    if (G.items.length) {
      for (const it of G.items.splice(0)) { if (it.atf) continue; A.drop(G, it.x, it.y, A.rollPart(G, 'chest')); }
    }
    // hồi giáp -> năng lượng
    if (g.enamr && p.armor > lastArmor + 0.5) p.energy = Math.min(p.energyMax, p.energy + g.enamr);
    lastArmor = p.armor;
    // đạn địch chậm đi
    if (g.slowbul) for (const b of G.bullets) if (b.side === 'e' && !b._atfSlow) { b._atfSlow = 1; b.vx *= 1 - g.slowbul / 100; b.vy *= 1 - g.slowbul / 100; }
    tickOrbs(G, dt);
    if (a.wrath.active || a.wrath.pending) { /* tickWrath chạy trong lớp props */ }
    // ép thiếu vũ khí thì hiện tay không; đủ bộ phận chính thì có vũ khí
    if (a.cat && a.parts[0] && p.weapons[0] && p.weapons[0].id !== 'atf_' + a.cat) A.syncWeapon(G);
  };
  // Hồi giáp / Thần Uy: nạp khi đánh trúng (đòn của Thần Khí)
  SK.on('enemyHit', (G, e, dmg, crit) => {
    if (!on(G) || !G.artifacts.inHit) return;
    A.addWrath(G, C.rechargeOnHit);
  });
  SK.on('enemyKill', (G, e) => {
    if (!on(G)) return;
    const a = G.artifacts, p = G.player, g = a.ag || ZERO();
    if (e.bossKey) { a.bossKills = (a.bossKills || 0) + 1; if (g.bossatk) A.recalc(G); }
    if (g.healkill && SK.chance(0.08)) p.hp = Math.min(p.hpMax, p.hp + g.healkill);
    if (g.enkill) p.energy = Math.min(p.energyMax, p.energy + g.enkill);
    if (g.goldkill && SK.chance(0.15)) p.gold += g.goldkill;
    for (let i = 0; i < g.mmsdead; i++) A.magicBullet(G, e.x, e.y - 6, null);
    if (a.inHit && e._lastCrit) A.addWrath(G, g.wrathcrit);
  });
  SK.on('pickup', (G, kind) => {
    if (!on(G) || kind !== 'energy') return;
    const a = G.artifacts, R = SK.ROOMS; a.exp += C.orbExp;
  });

  // ---------------------------------------------------------------- bộ phận rơi trên sàn
  A.drop = function (G, x, y, part) {
    const a = G.artifacts, o = { atf: 1, part, x, y: y + 4, r: 16, labelY: 26, t: 0, get gone() { return !!part.taken; },
      get label() { const old = a.parts[part.slot]; return 'Nhặt ' + A.partName(part) + ' [' + C.rarNames[part.rar] + (old ? '; thay ' + C.rarNames[old.rar] : '') + ']'; },
      use(G2) { A.pickPart(G2, part); } };
    G.interactables.push(o);
    G.props.push({ x, y, atfDrop: part, draw(ctx, g2, pr) { if (!part.taken) A.drawPart(ctx, part, x, y - 4 + Math.sin(g2.t * 3 + x) * 1.5, 1.2, true); }, update(g2, pr) { if (part.taken) pr.gone = true; } });
    SK.emit('artifactDrop', G, part);
    return o;
  };
  A.drawPart = function (ctx, part, x, y, sc, glow) {
    const f = A.frame(part);
    if (glow) { ctx.fillStyle = C.colors[part.rar]; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(x, y, 8, 0, 6.28); ctx.fill(); ctx.globalAlpha = 1; }
    if (!SK.draw(ctx, f, x, y, { sx: sc, sy: sc })) { ctx.fillStyle = C.colors[part.rar]; ctx.fillRect(x - 4, y - 4, 8, 8); }
    ctx.fillStyle = C.elCols[part.el]; ctx.fillRect(x + 5, y - 7, 2, 2);
  };
  A.pickPart = function (G, part) {
    const a = G.artifacts; if (part.taken) return false;
    if (!a.cat) { say(G, 'Hãy chọn một Thần Khí ở bệ trước'); return false; }
    part.taken = true;
    const old = a.parts[part.slot];
    a.parts[part.slot] = part;
    if (old) { old.taken = false; a.bag.push(old); }
    a.picked++;
    A.recalc(G);
    say(G, 'Lắp ' + A.partName(part));
    SK.emit('artifactPick', G, part);
    return true;
  };

  // ---------------------------------------------------------------- phòng đầu: ba bệ vũ khí Dũng Sĩ (kiếm / gậy / cung) [WIKI SW "First room"]
  A.pedestals = function (G) {
    const a = G.artifacts, [cx, cy] = W.roomCenter(G.map.rooms[0]);
    a.ped = [];
    CATS.forEach((cat, i) => {
      const x = cx + (i - 1) * 34, y = cy - 20, parts = [0, 1, 2].map(sl => A.newPart(cat, 1, sl, 0));
      const ped = { cat, parts, x, y };
      a.ped.push(ped);
      G.interactables.push({ atf: 1, ped, x, y: y + 6, r: 16, labelY: 36, get gone() { return a.locked; }, get label() { return (a.cat === cat ? 'Đang cầm ' : 'Chọn ') + DATA[cat][0][0] + ' (' + CATNAME[cat] + ')'; }, use(G2) { A.chooseCat(G2, cat, parts); } });
      G.props.push({ atfPed: 1, x, y, draw(ctx, g2) {
        if (a.locked && a.cat !== cat) return;
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, y + 5, 11, 4, 0, 0, 6.28); ctx.fill();
        ctx.fillStyle = a.cat === cat ? '#8a7a4a' : '#5a6270'; ctx.fillRect(x - 8, y - 2, 16, 8);
        ctx.fillStyle = '#7a8494'; ctx.fillRect(x - 8, y - 2, 16, 2);
        const f = A.frame(parts[0]);
        ctx.save(); ctx.translate(x, y - 12 + Math.sin(g2.t * 2 + i) * 1.5); ctx.rotate(-0.9); SK.draw(ctx, f, 0, 0, { sx: 1.4, sy: 1.4 }); ctx.restore();
        SK.text(ctx, CATNAME[cat], x, y + 15, 6, a.cat === cat ? '#ffd84a' : '#fff', 'center', 'rgba(0,0,0,0.9)');
      } });
    });
  };
  A.chooseCat = function (G, cat, parts) {
    const a = G.artifacts; if (a.locked) return false;
    a.cat = cat; a.parts = parts ? parts.slice() : [0, 1, 2].map(sl => A.newPart(cat, 1, sl, 0));
    a.bag = []; A.recalc(G);
    say(G, 'Đã chọn ' + DATA[cat][0][0]);
    SK.emit('artifactChoose', G, cat);
    return true;
  };
  // phòng chiến đầu tiên khoá lại: bệ đóng, chưa chọn thì bốc ngẫu nhiên [WIKI SW: "starter room will close"]
  SK.on('roomEnter', (G, r) => {
    if (!on(G)) return;
    const a = G.artifacts;
    if (G.stageIdx === 0 && r.type === 'battle' && !a.locked) {
      if (!a.cat) A.chooseCat(G, SK.pick(CATS));
      a.locked = true; SK.emit('artifactLock', G);
    }
  });

  // ---------------------------------------------------------------- dọn phòng: bộ phận, thưởng không trúng đòn / nhanh, bậc Dũng Sĩ
  SK.on('roomClear', (G, r) => {
    if (!on(G)) return;
    const a = G.artifacts, g = a.ag || ZERO(), p = G.player;
    if (!a.cat) return;
    const [rx, ry] = W.roomCenter(r);
    if (r.type === 'boss') {
      G.artifacts.bosses++;
      A.drop(G, rx - 10, ry, A.rollPart(G, 'boss'));
      A.drop(G, rx + 10, ry, A.rollPart(G, 'boss2'));
    } else if (r.type === 'battle' && SK.chance(C.roomDrop)) A.drop(G, rx, ry, A.rollPart(G, 'room'));
    if (r.type === 'battle') {
      if (g.maxenclr && a.noHitRoom) { p.energyMax += g.maxenclr; a.extraEn = (a.extraEn || 0) + g.maxenclr; if (a.applied) a.applied.en += g.maxenclr; }
    }
    a.noHitRoom = true; a.roomT = 0;
    A.checkLevel(G);
  });
  A.checkLevel = function (G) {
    const a = G.artifacts, n = a.lvl;
    if (n >= C.levelExp.length || a.exp < C.levelExp[n] || a.choosing) return false;
    a.choosing = true;
    const keys = SK.shuffle(Object.keys(C.levelAdd)).slice(0, 3);
    if (A.openLevel) A.openLevel(G, keys); else A.levelPick(G, keys[0]);
    return true;
  };
  A.levelPick = function (G, k) {
    const a = G.artifacts; a.lvl++; a.lvPick[k] = (a.lvPick[k] || 0) + 1; a.choosing = false; A.recalc(G);
    say(G, 'Dũng Sĩ cấp ' + a.lvl + ': ' + (A.LVNAME[k] || k));
    SK.emit('artifactLevel', G, k);
  };
  A.LVNAME = { atk: '+1 tấn công', crit: '+5 bạo kích', hp: '+1 HP', armor: '+1 Hộ Giáp', rate: '+10 tốc độ tấn công' };

  // ---------------------------------------------------------------- vào ải: bệ (1-1), Bà Lão + đổi bộ phận thừa (từ ải 2), lớp vẽ
  SK.on('stageEnter', G => {
    if (!on(G)) return;
    const a = G.artifacts, p = G.player;
    layer(G);
    a.reforge = 0; a.noHitRoom = true; a.roomT = 0; lastArmor = p.armor;
    if (G.stageIdx === 0) { A.pedestals(G); p.y += 26; }   // đứng dưới hàng bệ để thấy cả ba
    else if (a.cat) {
      // bộ phận thừa đổi thành vàng giữa các ải [WIKI SW "Between levels"; giá trị theo bảng ĐO cfg partValue]
      let coins = 0, n = a.bag.length;
      for (const q of a.bag) coins += Math.floor(C.partValue[q.rar] * 0.14 * C.pickCoinFactor);
      if (n) { p.gold += coins; a.stats.sold = (a.stats.sold || 0) + coins; say(G, 'Bà Lão đổi ' + n + ' bộ phận thừa thành ' + coins + ' Vàng', 3.2); }
      a.bag = [];
      if (A.placeGranny) A.placeGranny(G);
    }
    if (a.cat) A.syncWeapon(G);
  });
  // chiêu phụ (nút L / nút chiêu phụ trên HUD): Thần Uy
  const ws0 = SK.weaponSpecial;
  SK.weaponSpecial = function (p) {
    const G = SK.G;
    if (on(G) && p && p.weapons[p.cur] && /^atf_(sword|staff|bow)$/.test(p.weapons[p.cur].id)) {
      return { w: p.weapons[p.cur], ws: { press(G2, p2, w2, down) { if (down && A.castWrath) A.castWrath(G2); return true; } }, progress: SK.artifacts.wrathProgress(G) };
    }
    return ws0 ? ws0.call(this, p) : null;
  };
  A.wrathProgress = G => Math.min(1, G.artifacts.wrath.e / C.rechargeFull);
  A.addWrath = function (G, n) {
    const a = G.artifacts, g = a.ag || ZERO();
    if (a.wrath.active) return;
    a.wrath.e = Math.min(C.rechargeFull, a.wrath.e + n * (1 + g.wrathrate / 100));
  };

})();
