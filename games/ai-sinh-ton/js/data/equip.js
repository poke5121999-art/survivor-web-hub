// Equipment: six slots per hero, a shared bag, the merge ladder and upgrade costs. Pure rules, shared by the
// browser and tools/ladder.mjs.

export const SLOTS = [
  { id: 'weapon', name: 'Vũ Khí', stat: 'atk' },
  { id: 'necklace', name: 'Dây Chuyền', stat: 'atk' },
  { id: 'gloves', name: 'Găng Tay', stat: 'atk' },
  { id: 'armor', name: 'Giáp', stat: 'hp' },
  { id: 'belt', name: 'Thắt Lưng', stat: 'hp' },
  { id: 'boots', name: 'Giày', stat: 'hp' },
];

// The ladder. `need` items of tier i make one item of tier i + 1. `exact`: all inputs must be the same item;
// otherwise the main piece takes any item of the same slot and tier as fodder.
export const TIERS = [
  { id: 'xam', name: 'Thường', color: 0x9aa3ad, plus: 0, need: 3, exact: true, mul: 1, maxLv: 10 },
  { id: 'luc', name: 'Tốt', color: 0x58c446, plus: 0, need: 3, exact: true, mul: 1.6, maxLv: 20 },
  { id: 'lam', name: 'Hiếm', color: 0x3d9bff, plus: 0, need: 3, exact: true, mul: 2.5, maxLv: 30 },
  { id: 'tim', name: 'Sử Thi', color: 0xb060ff, plus: 0, need: 2, exact: false, mul: 4, maxLv: 40, perk: 1 },
  { id: 'tim1', name: 'Sử Thi +1', color: 0xb060ff, plus: 1, need: 2, exact: false, mul: 4.8, maxLv: 45, perk: 1 },
  { id: 'tim2', name: 'Sử Thi +2', color: 0xb060ff, plus: 2, need: 2, exact: false, mul: 5.8, maxLv: 50, perk: 1 },
  { id: 'vang', name: 'Huyền Thoại', color: 0xffb428, plus: 0, need: 2, exact: false, mul: 8, maxLv: 60, perk: 2 },
  { id: 'vang1', name: 'Huyền Thoại +1', color: 0xffb428, plus: 1, need: 2, exact: false, mul: 9.5, maxLv: 65, perk: 2 },
  { id: 'vang2', name: 'Huyền Thoại +2', color: 0xffb428, plus: 2, need: 2, exact: false, mul: 11.5, maxLv: 70, perk: 2 },
  { id: 'vang3', name: 'Huyền Thoại +3', color: 0xffb428, plus: 3, need: 2, exact: false, mul: 14, maxLv: 75, perk: 2 },
  { id: 'do', name: 'Thần Thoại', color: 0xff4438, plus: 0, need: 0, exact: false, mul: 22, maxLv: 90, perk: 3 },
];

// base (grey) items one item of tier i is worth
export function baseWorth(tier) {
  let n = 1;
  for (let i = 0; i < tier; i++) n *= TIERS[i].need;
  return n;
}

// Three items per slot. perks[k] switches on at perk level k + 1 (Sử Thi, Huyền Thoại, Thần Thoại).
// Perk effects are read by the battle sim through equipBonus(); `v` is a fraction unless noted.
export const ITEMS = [
  { id: 'w_cua', slot: 'weapon', name: 'Cưa Xích Cũ', base: 12, perks: [{ k: 'atk', v: 0.1, t: 'Công +10%' }, { k: 'crit', v: 0.1, t: 'Chí mạng +10%' }, { k: 'execute', v: 0.15, t: 'Kết liễu quái dưới 15% máu' }] },
  { id: 'w_no', slot: 'weapon', name: 'Nỏ Tự Chế', base: 11, perks: [{ k: 'aspd', v: 0.1, t: 'Tốc đánh +10%' }, { k: 'pierce', v: 1, t: 'Đòn thường xuyên thêm 1 mục tiêu' }, { k: 'aspd', v: 0.2, t: 'Tốc đánh +20%' }] },
  { id: 'w_bua', slot: 'weapon', name: 'Búa Công Trường', base: 13, perks: [{ k: 'bossDmg', v: 0.12, t: 'Sát thương lên boss +12%' }, { k: 'stunHit', v: 0.08, t: '8% choáng 1 giây khi đánh' }, { k: 'bossDmg', v: 0.25, t: 'Sát thương lên boss +25%' }] },
  { id: 'n_rang', slot: 'necklace', name: 'Vòng Răng Sói', base: 8, perks: [{ k: 'lifesteal', v: 0.04, t: 'Hút máu 4%' }, { k: 'atk', v: 0.12, t: 'Công +12%' }, { k: 'lifesteal', v: 0.08, t: 'Hút máu thêm 8%' }] },
  { id: 'n_pin', slot: 'necklace', name: 'Mặt Dây Pin', base: 7, perks: [{ k: 'ultRate', v: 0.12, t: 'Nạp tối thượng +12%' }, { k: 'cdr', v: 0.08, t: 'Hồi chiêu nhanh hơn 8%' }, { k: 'ultStart', v: 0.3, t: 'Vào ải có sẵn 30% tối thượng' }] },
  { id: 'n_bua', slot: 'necklace', name: 'Bùa Hộ Mệnh', base: 7, perks: [{ k: 'hp', v: 0.08, t: 'Máu +8%' }, { k: 'regen', v: 0.01, t: 'Hồi 1% máu mỗi giây' }, { k: 'cheat', v: 1, t: 'Một lần mỗi ải: thoát chết với 30% máu' }] },
  { id: 'g_da', slot: 'gloves', name: 'Găng Da Thợ Mỏ', base: 9, perks: [{ k: 'atk', v: 0.08, t: 'Công +8%' }, { k: 'crit', v: 0.08, t: 'Chí mạng +8%' }, { k: 'critDmg', v: 0.4, t: 'Sát thương chí mạng +40%' }] },
  { id: 'g_dien', slot: 'gloves', name: 'Găng Điện', base: 8, perks: [{ k: 'chain', v: 0.1, t: '10% đòn đánh nảy sét sang 2 quái' }, { k: 'aspd', v: 0.08, t: 'Tốc đánh +8%' }, { k: 'chain', v: 0.2, t: 'Nảy sét thêm 20%' }] },
  { id: 'g_gai', slot: 'gloves', name: 'Găng Gai', base: 9, perks: [{ k: 'thorns', v: 0.15, t: 'Phản 15% sát thương cận chiến' }, { k: 'atk', v: 0.1, t: 'Công +10%' }, { k: 'thorns', v: 0.3, t: 'Phản thêm 30%' }] },
  { id: 'a_lop', slot: 'armor', name: 'Giáp Lốp Xe', base: 60, perks: [{ k: 'hp', v: 0.1, t: 'Máu +10%' }, { k: 'dr', v: 0.06, t: 'Giảm 6% sát thương nhận' }, { k: 'dr', v: 0.12, t: 'Giảm thêm 12% sát thương nhận' }] },
  { id: 'a_bien', slot: 'armor', name: 'Giáp Biển Báo', base: 55, perks: [{ k: 'shieldWave', v: 0.12, t: 'Đầu mỗi đợt nhận khiên 12% máu' }, { k: 'hp', v: 0.1, t: 'Máu +10%' }, { k: 'shieldWave', v: 0.25, t: 'Khiên đầu đợt thêm 25% máu' }] },
  { id: 'a_kevlar', slot: 'armor', name: 'Áo Kevlar', base: 58, perks: [{ k: 'rangedDr', v: 0.15, t: 'Giảm 15% sát thương từ xa' }, { k: 'hp', v: 0.12, t: 'Máu +12%' }, { k: 'dr', v: 0.1, t: 'Giảm 10% sát thương nhận' }] },
  { id: 'b_dan', slot: 'belt', name: 'Thắt Lưng Đạn', base: 40, perks: [{ k: 'aspd', v: 0.06, t: 'Tốc đánh +6%' }, { k: 'hp', v: 0.1, t: 'Máu +10%' }, { k: 'atk', v: 0.15, t: 'Công +15%' }] },
  { id: 'b_cuu', slot: 'belt', name: 'Túi Cứu Thương', base: 42, perks: [{ k: 'healIn', v: 0.15, t: 'Nhận hồi máu +15%' }, { k: 'regen', v: 0.008, t: 'Hồi 0,8% máu mỗi giây' }, { k: 'healWave', v: 0.25, t: 'Hết mỗi đợt hồi 25% máu' }] },
  { id: 'b_xich', slot: 'belt', name: 'Đai Xích', base: 44, perks: [{ k: 'hp', v: 0.08, t: 'Máu +8%' }, { k: 'ccRes', v: 0.3, t: 'Giảm 30% thời gian bị khống chế' }, { k: 'hp', v: 0.2, t: 'Máu +20%' }] },
  { id: 'f_chay', slot: 'boots', name: 'Giày Chạy Bộ', base: 34, perks: [{ k: 'speed', v: 0.1, t: 'Tốc chạy +10%' }, { k: 'dodge', v: 0.06, t: 'Né 6% đòn' }, { k: 'dodge', v: 0.12, t: 'Né thêm 12% đòn' }] },
  { id: 'f_thep', slot: 'boots', name: 'Ủng Mũi Thép', base: 38, perks: [{ k: 'hp', v: 0.08, t: 'Máu +8%' }, { k: 'kbRes', v: 1, t: 'Không bị hất văng' }, { k: 'dr', v: 0.08, t: 'Giảm 8% sát thương nhận' }] },
  { id: 'f_lo', slot: 'boots', name: 'Giày Lò Xo', base: 35, perks: [{ k: 'speed', v: 0.08, t: 'Tốc chạy +8%' }, { k: 'cdr', v: 0.06, t: 'Hồi chiêu nhanh hơn 6%' }, { k: 'ultRate', v: 0.15, t: 'Nạp tối thượng +15%' }] },
];
export const ITEM = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

// flat stat an item gives: base x tier multiplier x (1 + 6% per level above 1)
export function itemStat(it) {
  return Math.round(ITEM[it.item].base * TIERS[it.tier].mul * (1 + 0.06 * (it.lv - 1)));
}

// cost of level lv -> lv + 1: gold and the slot's material ("bản rèn")
export function upgradeCost(lv) {
  return { gold: Math.ceil(40 * Math.pow(lv, 1.5)), mats: 1 + Math.floor(lv / 5) };
}

export function refundOf(lv) {
  let gold = 0; let mats = 0;
  for (let l = 1; l < lv; l++) { const c = upgradeCost(l); gold += c.gold; mats += c.mats; }
  return { gold, mats };
}

// Can `main` be merged with `fodder` (a list of bag items)? Returns null when it can, else the failure state.
export function mergeProblem(main, fodder) {
  const T = TIERS[main.tier];
  if (!T.need) return 'bậc cao nhất';
  if (fodder.length !== T.need - 1) return 'thiếu nguyên liệu';
  const slot = ITEM[main.item].slot;
  for (const f of fodder) {
    if (f.uid === main.uid) return 'trùng món chính';
    if (f.tier !== main.tier) return 'khác bậc';
    if (T.exact ? f.item !== main.item : ITEM[f.item].slot !== slot) return T.exact ? 'khác món' : 'khác ô';
  }
  if (new Set(fodder.map((f) => f.uid)).size !== fodder.length) return 'trùng nguyên liệu';
  return null;
}

// Merge: the main piece goes up one tier and keeps its level; fodder levels come back as gold and materials.
export function merge(main, fodder) {
  const why = mergeProblem(main, fodder);
  if (why) throw new Error('merge refused: ' + why);
  const refund = { gold: 0, mats: 0 };
  for (const f of fodder) { const r = refundOf(f.lv); refund.gold += r.gold; refund.mats += r.mats; }
  return { item: { ...main, tier: main.tier + 1 }, refund, slot: ITEM[main.item].slot };
}

// Every exact-match merge the bag allows right now (the Ghép Nhanh button). Equipped pieces are left alone
// as fodder but may be the main piece. Returns the list of { main, fodder } in the order to apply.
export function autoMergePlan(bag, equippedUids) {
  const plan = [];
  const used = new Set();
  const free = (i) => !used.has(i.uid);
  for (let tier = 0; tier < TIERS.length; tier++) {
    const T = TIERS[tier];
    if (!T.need || !T.exact) continue;
    const groups = new Map();
    for (const i of bag) if (i.tier === tier && free(i)) { const k = i.item; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); }
    for (const list of groups.values()) {
      list.sort((a, b) => (equippedUids.has(b.uid) - equippedUids.has(a.uid)) || b.lv - a.lv);
      while (list.length >= T.need) {
        const main = list.shift();
        const fodder = [];
        for (let k = list.length - 1; k >= 0 && fodder.length < T.need - 1; k--) if (!equippedUids.has(list[k].uid)) fodder.push(list.splice(k, 1)[0]);
        if (fodder.length < T.need - 1) break;
        used.add(main.uid); for (const f of fodder) used.add(f.uid);
        plan.push({ main, fodder });
      }
    }
  }
  return plan;
}

// bonuses of one hero's six equipped pieces: flat atk/hp plus the summed perk values
export function equipBonus(items) {
  const out = { atk: 0, hp: 0, perks: {} };
  for (const it of items) {
    if (!it) continue;
    const def = ITEM[it.item];
    const slot = SLOTS.find((s) => s.id === def.slot);
    out[slot.stat] += itemStat(it);
    const n = TIERS[it.tier].perk || 0;
    for (let k = 0; k < n; k++) { const p = def.perks[k]; out.perks[p.k] = (out.perks[p.k] || 0) + p.v; }
  }
  return out;
}
