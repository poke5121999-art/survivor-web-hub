// ===== BẢNG LUẬT CHIẾN ĐẤU (một chỗ duy nhất cho mọi số của js/combat) ==============================================
// Game gốc tính sát thương trên server (CODE.md §2: client chỉ gửi TargetAttackRequest/SkillUseReleaseRequest, nhận DamageData).
// Không có công thức, máu quái, tầm gây hấn, thời gian hồi sinh trong client hay trong đệm meta. Nên bảng chia hai phần:
//   META  = số thật chép từ data/meta/*.json (đệm server), ghi id hàng để kiểm lại  [ĐO TRONG REPO]
//   RULES = số bản web tự đặt, chỉnh cho trận Lv2 dài như clip DcGavHFwqtk (~6-9 s mỗi Junior Floralime, 5:57-6:06, 6:09-6:15)  [ĐỀ XUẤT]
// Trận "chuẩn" để chỉnh: slime đồng hành Lv1 (atk 2.6) đánh Junior Floralime Lv2 (26 HP): đòn thường 1.0 s/lần ~2.6, kỹ năng 4 s/lần ~5.7
// -> ~13.5 sát thương mỗi 4 s -> 26 HP trong ~7.7 s (+ chạy tới) = 6-9 s như clip.

// Hệ (Enums.MonsterElement 20001-20013, CODE.md §2) theo đuôi tên SL_<Loài>_<Hệ...>
export const ELEMENT = { Fire: 20001, Water: 20002, Ground: 20003, Wind: 20004, Grass: 20005, Steel: 20006, Electric: 20007,
  Ice: 20008, Magic: 20009, Power: 20010, Light: 20011, Dark: 20012, Poison: 20013 };
export function elementOf(slimeId) {
  const m = /^SL_[A-Za-z]+_([A-Z][a-z]+)/.exec(slimeId || ''); return m && ELEMENT[m[1]] || ELEMENT.Water;
}

export const META = {
  // Đòn thường theo hệ: action_type 4..15 = một subAction Attack preDelay 300 / postDelay 700 ms (useAttackSpeed), trỏ attack_type
  // 8..19 = Ranged Single, quả cầu năng lượng FX_EN0_RangeAtk_<Hệ>_EnergyBall bay moveSpeed 15 m/s, trúng FX_EN0_Hit_<Hệ>.
  defaultAttack: {
    20001: { action: 4, attack: 8, pre: 300, post: 700, speed: 15, fx: 'FX_EN0_RangeAtk_Fire_EnergyBall' },
    20007: { action: 5, attack: 9, pre: 300, post: 700, speed: 15, fx: 'FX_EN0_RangeAtk_Electric_EnergyBall' },
    20005: { action: 6, attack: 10, pre: 300, post: 700, speed: 15, fx: 'FX_EN0_RangeAtk_Grass_EnergyBall' },
    20003: { action: 7, attack: 11, pre: 300, post: 700, speed: 15 },
    20008: { action: 8, attack: 12, pre: 300, post: 700, speed: 15 },
    20011: { action: 9, attack: 13, pre: 300, post: 700, speed: 15 },
    20009: { action: 10, attack: 14, pre: 300, post: 700, speed: 15 },
    20013: { action: 11, attack: 15, pre: 300, post: 700, speed: 15 },
    20010: { action: 12, attack: 16, pre: 300, post: 700, speed: 15 },
    20006: { action: 13, attack: 17, pre: 300, post: 700, speed: 15 },
    20002: { action: 14, attack: 18, pre: 300, post: 700, speed: 15, fx: 'FX_EN0_RangeAtk_Water_EnergyBall' },
    20004: { action: 15, attack: 19, pre: 300, post: 700, speed: 15 },
    20012: { action: 3, attack: 7, pre: 300, post: 700, speed: 15 },
  },
  // Kỹ năng nhỏ nhất của mỗi hệ (skill_type): AimDegree tầm 10, hồi 4000 ms, motionCategory 20002 (= Skill_Range), action
  // pre 300 / post 500, attack Ranged Single moveSpeed 17, appearSound = tiếng bắn.
  skill: {
    20001: { id: 116, cd: 4000, mp: 15, range: 10, pre: 300, post: 500, speed: 17, sound: 'sfx_skill_ball_fire' },
    20002: { id: 153, cd: 4000, mp: 15, range: 10, pre: 300, post: 500, speed: 17, sound: 'sfx_skill_ball_water' },
    20005: { id: 167, cd: 4000, mp: 16, range: 10, pre: 300, post: 500, speed: 17, sound: 'sfx_skill_shot_grass' },
  },
  // Đòn của slime hoang: action_type 1 (pre 300 / post 1000) -> attack_type 1 Immediate Sector bán kính 3 ô, 90 độ, một mục tiêu
  // (onlyOne), trúng FX_EN0_Hit_Grass_S.
  wildAttack: { action: 1, attack: 1, pre: 300, post: 1000, radius: 3, angle: 90 },
  // item_type 215 (thumbnail Item_SlimePart_1, giá bán 15): ConditionalDrop MonsterTier <= 2, dropRate 0.7, 1..1 cái
  fragment: { item: 215, rate: 0.7, min: 1, max: 1, icon: 'img/item/Item_SlimePart_1.webp' },
  // F3. item_type 4 "Cube": Usable ActionCast action 32, castType Position maxRange 6, guideSize 3, cubeGuide, chase; useCondition =
  // có slime thường (MonsterNormal, Enemy, Catchable) trong 5.5 ô quanh người chơi + MonsterObtainable; coolTime 5000 ms, consume,
  // useSound item_cube, canUseInInventory false, canRegisterQuickSlot true, slotMaxCount 99. action 32 = Attack preDelay 300 ->
  // attack_type 5: Ranged, moveSpeed 10, Parabola maxCurveHeight 3, rangedResource Cube001_Catch (prop/cube001.glb), Sector bán kính
  // 1 ô 360° onlyOne (trúng một con). Kết quả do server (CatchResultData, CubeWobbleResult FAIL/CAUGHT/1-3 lắc).
  cube: { item: 4, action: 32, attack: 5, maxRange: 6, guide: 3, nearRadius: 5.5, hitRadius: 1, pre: 300, speed: 10, curve: 3, cooldown: 5000, sound: 'item_cube' },
  // item_type 1 (item_potion_hp_1): Usable ActionCast action 31 Immediate EquippedMonster -> attack_type 4 Heal (FX_EN0_Heal_Medium),
  // coolTime 3000 ms, canUseInInventory, canRegisterQuickSlot, consume, slotMaxCount 99. Lượng hồi không có trong meta: 30 lấy từ tên "30 HP Potion" (7:38).
  potion: { item: 1, action: 31, attack: 4, hp: 30, cooldown: 3000, fx: 'FX_EN0_Heal_Medium' },
  // perk 2 / 63 (Icon_Perk_Cube_Lv1/2): StatRatio stat 20103 (CUBE_BOOST) +0.1 mỗi bậc
  cubeBoostPerLevel: 0.1,
};

export const RULES = {
  // ---- quái
  monsters: {
    SL_Slime_Grass: { name: 'Junior Floralime', level: 2,           // [THẤY 6:00, goget_battle_whistle] tên + "LV.2"
      hp: 26,              // [THẤY goget_battle_whistle] "26 / 26"
      atk: 2,              // [ĐỀ XUẤT] mỗi đòn ~2: đồng hành Lv1 (34 HP) thắng 2-3 trận liền rồi mới cần nghỉ
      exp: 2,              // [THẤY 6:06, 6:15] "Roasted Slime EXP + 2" mỗi con
      speed: 1.1,          // [ĐỀ XUẤT] m/s đi lang thang (khung 3 s một ảnh: dịch ~3 m)
      chase: 2.4,          // [ĐỀ XUẤT] m/s khi đuổi
    },
    SL_Slime_Water: { name: 'Junior Aqualime', level: 1,            // [THẤY 5:27] "Lv1 Junior A…" (chữ bị che), slime xanh nước của Rudga
      hp: 30,              // [ĐỀ XUẤT] trận đấu tay đôi 5:21 -> 5:36 ~13 s
      atk: 2.5,            // [ĐỀ XUẤT]
      exp: 0,              // [THẤY 5:36-5:39] thắng đấu tay đôi không có log EXP slime (Lv2 vẫn đến sau con Floralime thứ ba, 6:27)
      speed: 1.1, chase: 2.6,
    },
    // F3: loài thứ hai cho rừng. Mandrake (cỏ) thấy trong V4Van sheet1 / GAMEPLAY "Grass icon (Junior Floralime, Mandrake)"; chỗ sinh
    // ở Shadow Forest Entrance và mọi số dưới là [ĐỀ XUẤT] (clip không cho thấy Mandrake hoang ở Entrance).
    SL_Mandrake_Grass: { name: 'Mandrake', level: 3, hp: 34, atk: 2.4, exp: 3, speed: 0.9, chase: 2.2 },
  },
  // ---- bắt slime (F3) [ĐỀ XUẤT]: server tính tỉ lệ (CODE.md §4), client không có công thức.
  // chance = (base + span * (1 - máu còn)^pow) * (1 + CUBE_BOOST); mỗi lần lắc qua với xác suất chance^(1/3): qua đủ 3 lần = CAUGHT,
  // dừng ở lần k (0..2) = thoát sau k lần lắc (k = 0 vẫn lắc 1 lần cho thấy, CubeWobbleResult FAIL / ONE / TWO).
  // Thẻ Tame (13:00 clip): "The lower the slime's health, the higher the tame chance."
  tame: {
    base: 0.12,        // [ĐỀ XUẤT] đầy máu: 12%
    span: 0.78,        // [ĐỀ XUẤT] còn 0 máu: 90%
    pow: 1.4,          // [ĐỀ XUẤT] tăng nhanh khi máu dưới ~40%
    shakeTime: 1.0,    // [ĐO TRONG REPO] clip Cube_catch_3 1.0 s (catch_1 1.5, catch_2 1.22): mỗi lần lắc phát một clip
    exp: 0,            // [ĐỀ XUẤT] bắt được không cho EXP slime (clip không thấy log EXP khi bắt)
  },
  // ---- đội (F3)
  party: {
    accompany: 4,      // [THẤY gmwall_hud_party_bar] ô thứ 5 ghi "Accompany Unavailable" (PlayScene.Slimeslotlimit); GAMEPLAY: 4 ô đầu demo
    accompanyAt16: 5,  // [THẤY GM WALL ảnh boss] người chơi Lv16+ có 5 slime đi cùng; mốc Lv16 [ĐỀ XUẤT]
    switchCd: 3,       // [ĐỀ XUẤT] s hồi đổi slime (EquipMonsterFailCode.SWITCH_ON_COOLDOWN có, số không có)
  },
  // ---- slime đồng hành theo cấp lv (state.party[0])
  partner: {
    hp: lv => 34 + 6 * (lv - 1),       // [ĐỀ XUẤT] máu tối đa
    mp: lv => 40 + 5 * (lv - 1),       // [ĐỀ XUẤT] MP tối đa (kỹ năng tốn 15-16 theo META.skill)
    atk: lv => 2.6 + 0.8 * (lv - 1),   // [ĐỀ XUẤT] sát thương gốc mỗi đòn thường (Lv1 2.6: Floralime 26 HP chết sau ~7-8 s)
    expToNext: lv => 6 * lv,           // [ĐỀ XUẤT] Lv1 -> 2 = 6 EXP = 3 con Floralime: "Roasted Lv2" ở 6:27 sau con thứ ba
    range: 4.5,                        // [ĐỀ XUẤT] m, tầm đòn thường (defaultAttackMaxRange là meta monster, đệm không có)
    skillMult: 2.2,                    // [ĐỀ XUẤT] kỹ năng = 2.2 lần đòn thường
    chaseSpeed: 5.0,                   // [ĐỀ XUẤT] m/s khi lao tới mục tiêu (nhanh hơn người đi 3.6)
    staminaPerAttack: 0.004,           // [ĐỀ XUẤT] thể lực (0..1) mất mỗi đòn
    mpRegen: 1.0,                      // [ĐỀ XUẤT] MP/giây
    hpRegenIdle: 0.02,                 // [ĐỀ XUẤT] phần máu/giây hồi khi không đánh
    faintHp: 0.05,                     // [ĐỀ XUẤT] hết máu thì ngất: tự huýt về, giữ 5% máu (bản web không có chết slime)
  },
  // ---- công thức sát thương [ĐỀ XUẤT]: round(atk * mult * rand(0.85..1.15)), tối thiểu 1; chí mạng 10% x1.5 (DamageType CRITICAL)
  damage: { spread: 0.15, critRate: 0.1, critMult: 1.5 },
  // ---- tầm và thời gian [ĐỀ XUẤT]
  aggroRange: 3.5,          // m: slime hoang thấy đồng hành/người chơi trong tầm này thì xông vào
  engageRange: 9,           // m: Space/chuột trái chọn con gần người chơi nhất trong tầm này (hoặc gần điểm chuột trong 3 m)
  autoRange: 6,             // m: CombatMode bật (H) hoặc slime hoang đã gây hấn: đồng hành tự đánh con trong tầm này
  leash: 12,                // m: slime hoang rời chỗ sinh xa hơn thì bỏ đuổi, về chỗ cũ, hồi đầy máu
  wander: 3,                // m: bán kính đi lang thang quanh chỗ sinh
  respawn: 10,              // s: chết bao lâu thì sinh lại ở chỗ cũ
  beam: 0.5,                // s: tia lệnh từ người chơi tới đồng hành (9:00, 9:30) hiện bao lâu
  // ---- đấu tay đôi (5:09-5:36)
  duel: {
    time: 300,              // [THẤY 5:24] đồng hồ "05:00" đếm lùi
    splash: 2.2,            // [ĐO TRONG CLIP 5:18] băng TEAM A vs TEAM B hiện ~2-3 s (một khung 3 s)
    count: 3,               // [THẤY 5:21] đếm 3-2-1 (UI_PVP_3/2/1 + UI_PVP_Start, prefab PVP321Start)
    endDelay: 2.5,          // [ĐỀ XUẤT] thắng/thua hiện bao lâu rồi về làng (5:36 -> 5:39)
    bubble: 3.0,            // [ĐỀ XUẤT] s mỗi bóng thoại của Rudga
  },
};

// tỉ lệ bắt theo phần máu còn (0..1) và bậc perk Cube (perk 2 + 63) [ĐỀ XUẤT công thức, hệ số perk ĐO TRONG REPO]
export function tameChance(hpRatio, cubePerkLevels = 0) {
  const T = RULES.tame, r = Math.max(0, Math.min(1, hpRatio));
  return Math.min(0.98, (T.base + T.span * Math.pow(1 - r, T.pow)) * (1 + META.cubeBoostPerLevel * cubePerkLevels));
}
// CubeWobbleResult: -1 FAIL, 0 CAUGHT, 1..3 số lần lắc rồi thoát
export function rollTame(chance, rng) {
  const q = Math.pow(chance, 1 / 3); let k = 0;
  while (k < 3 && rng() < q) k++;
  return k === 3 ? { result: 0, shakes: 3 } : { result: k === 0 ? -1 : k, shakes: Math.max(1, k) };
}

// RNG có hạt giống (mulberry32) để test chạy lại ra cùng kết quả: ?seed=<n>
export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function rollDamage(atk, mult, rng) {
  const d = RULES.damage, crit = rng() < d.critRate;
  const v = Math.max(1, Math.round(atk * mult * (1 - d.spread + 2 * d.spread * rng()) * (crit ? d.critMult : 1)));
  return { damage: v, damageType: crit ? 'CRITICAL' : 'NORMAL' };   // khuôn DamageData{damage, damageType}
}
