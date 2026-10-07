/*
 * DREDGE — kiểm luật thuần (lưới khoang, thời gian, hoảng loạn, giá).
 * Chạy: node test/dredge-rules.js
 * Lưới dùng đúng cấu hình Tier1Hull bóc từ gridconfigs của bản gốc (6×9).
 */
'use strict';
const path = require('path');
const G = path.resolve(__dirname, '../games/dredge/js');
require(path.join(G, 'grid.js'));
require(path.join(G, 'rules.js'));
const { DRGrid: Grid, DRRules: R } = globalThis;

let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else fail++;
  console.log((ok ? '  ✔ ' : '  ✘ ') + name + (ok ? '' : '  — got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want)));
}

const tier1 = {
  columns: 6, rows: 9, mainItemType: 1, mainItemSubtype: -1671,
  cellGroupConfigs: [
    { cells: [{ x: 2, y: 6 }, { x: 2, y: 7 }, { x: 3, y: 6 }, { x: 3, y: 7 }], itemType: 3, itemSubtype: 2427, isHidden: 0, damageImmune: 0 },
    { cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 4, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 1 }, { x: 0, y: 6 }, { x: 0, y: 7 }, { x: 1, y: 7 }, { x: 4, y: 7 }, { x: 5, y: 6 }, { x: 5, y: 7 }, { x: 0, y: 8 }, { x: 1, y: 8 }, { x: 2, y: 8 }, { x: 3, y: 8 }, { x: 4, y: 8 }, { x: 5, y: 8 }], itemType: 0, itemSubtype: 0, isHidden: 1, damageImmune: 1 },
    { cells: [{ x: 0, y: 3 }, { x: 0, y: 4 }, { x: 1, y: 3 }, { x: 1, y: 4 }, { x: 5, y: 3 }, { x: 5, y: 4 }, { x: 5, y: 5 }], itemType: 3, itemSubtype: 2429, isHidden: 0, damageImmune: 0 },
    { cells: [{ x: 2, y: 8 }, { x: 3, y: 8 }], itemType: 2, itemSubtype: 1024, isHidden: 1, damageImmune: 1 },
    { cells: [{ x: 3, y: 0 }], itemType: 3, itemSubtype: 2553, isHidden: 0, damageImmune: 0 }
  ]
};
const items = {
  cod: { id: 'cod', type: 'GENERAL', subtype: 'FISH', dims: [[0, 0], [1, 0]], damageMode: 'DESTROY', value: 18 },
  eel: { id: 'eel', type: 'GENERAL', subtype: 'FISH', dims: [[0, 0], [1, 0], [2, 0]], damageMode: 'DESTROY', value: 20 },
  rod: { id: 'rod', type: 'EQUIPMENT', subtype: 'ROD', dims: [[0, 0], [0, 1]], damageMode: 'OPERATION', fishingSpeedModifier: 0.35, harvestableTypes: ['COASTAL'] },
  engine: { id: 'engine', type: 'EQUIPMENT', subtype: 'ENGINE', dims: [[0, 0], [0, 1]], damageMode: 'OPERATION', speedBonus: 14.7 },
  dredge: { id: 'dredge', type: 'EQUIPMENT', subtype: 'DREDGE', dims: [[0, 0], [1, 0]], damageMode: 'NONE', harvestableTypes: ['DREDGE'] }
};

console.log('Lưới khoang Tier1Hull');
let g = Grid.create(tier1);
eq('góc mũi (0,0) là ô ẩn, không nhận cá', Grid.canPlace(g, items.cod, 0, 0, 0), false);
eq('cá 1×2 đặt ngang ở (2,1)', Grid.canPlace(g, items.cod, 2, 1, 0), true);
eq('xoay 90: (2,1) phủ (2,1),(2,0)', Grid.footprint(items.cod, 2, 1, 90), [[2, 1], [2, 0]]);
eq('xoay 270: (2,1) phủ (2,1),(2,2)', Grid.footprint(items.cod, 2, 1, 270), [[2, 1], [2, 2]]);
eq('cần câu không vào ô hàng thường (2,1)', Grid.canPlace(g, items.rod, 2, 1, 0), false);
eq('cần câu vào ô cần (0,3) dọc', Grid.canPlace(g, items.rod, 0, 3, 0), true);
eq('động cơ vào ô máy (2,6)', Grid.canPlace(g, items.engine, 2, 6, 0), true);
eq('cá cũng vào được ô máy (cờ 2427 có FISH)', Grid.canPlace(g, items.cod, 2, 6, 0), true);
eq('cuốc nạo vét vào ô ẩn (2,8) dành cho DREDGE', Grid.canPlace(g, items.dredge, 2, 8, 0), true);
eq('ô ẩn (2,8) không hiện trên lưới', Grid.usable(g, 2, 8), false);
const c1 = Grid.place(g, items.cod, 2, 1, 0);
eq('đặt rồi thì ô bị chiếm', Grid.canPlace(g, items.eel, 1, 1, 0), false);
eq('kéo chính con đó sang trái 1 ô hợp lệ', Grid.canPlace(g, items.cod, 1, 1, 0, c1), true);
eq('tự tìm chỗ cho lươn 1×3: hàng 0 hết chỗ, (1,1) xoay 270 xuống tận ô cần (1,3)', Grid.findSpot(g, items.eel), { x: 1, y: 1, rot: 270 });

console.log('Hỏng ô');
g = Grid.create(tier1);
const fish = Grid.place(g, items.cod, 2, 1, 0);
let seq = [2 / 6, 1 / 9];
const rnd = () => seq.shift();
const hit = Grid.addDamage(g, items, true, rnd);
eq('đòn trúng (2,1)', hit.cell, [2, 1]);
eq('cá trên ô hỏng bị huỷ (DESTROY)', hit.destroyed && hit.destroyed.uid, fish.uid);
eq('ô hỏng không đặt lại được', Grid.canPlace(g, items.cod, 2, 1, 0), false);
const st0 = Grid.create(tier1);
Grid.place(st0, items.dredge, 2, 8, 0);
eq('ô damageImmune (2,8) không bị đánh', Grid.canDamage(st0, 2, 8, items, true), false);
eq('ô thiết bị chưa mở xưởng thì không bị đánh', Grid.canDamage(st0, 0, 3, items, false), false);

console.log('Chỉ số thuyền');
const cfg = {
  basePlayerSpeed: 1, baseMovementSpeedModifier: 1, baseFishingSpeedModifier: 1, maxLightSanityModifier: 0.02,
  lumensForMaxLightSanityModifier: 100, basePlayerHealth: 2, playerHealthPerHullTier: 1, maxPlayerHealth: 6,
  hourDurationInSeconds: 30, forcedTimePassageSpeedModifier: 10, fishingTimePassageSpeedModifier: 0.5,
  daySanityModifier: 0.002, nightSanityModifier: -0.004, sleepingSanityModifier: 0.1, globalSanityModifier: 1,
  minSizeSaleModifier: 0.8, maxSizeSaleModifier: 1.25, freshnessSaleModifiers: [0.25, 0.75, 1], maxFreshness: 3,
  trophyMaxSize: 0.85, stockReplenishCoefficient: 1, minStockReplenish: 0.2
};
g = Grid.create(tier1);
Grid.place(g, items.rod, 0, 3, 0);
Grid.place(g, items.engine, 2, 6, 0);
let st = R.stats(cfg, g, items);
eq('tốc độ = base 1 + 14,7', Math.round(st.speed * 10) / 10, 15.7);
eq('câu: (1+0,35)^0,45', Math.round(st.fishing * 1000) / 1000, Math.round(Math.pow(1.35, 0.45) * 1000) / 1000);
eq('loại nước câu được', [...st.harvestTypes], ['COASTAL']);
g.damage.push([0, 3]);
st = R.stats(cfg, g, items);
eq('cần trên ô hỏng thì mất loại nước', st.hasRod, false);
eq('ngưỡng chết hull tier 1 = 3', R.damageThreshold(cfg, 1), 3);

console.log('Thời gian, hoảng loạn');
eq('đứng yên thì giờ không trôi', R.advance(cfg, 1.25, 10, 'idle', 0), 1.25);
eq('chạy hết ga 72 s = 0,1 ngày (giờ = 30 s)', Math.round((R.advance(cfg, 1.25, 72, 'move', 1) - 1.25) * 1e6) / 1e6, 0.1);
eq('ngủ lúc 18:00 tới 06:00 = 12 giờ', R.hoursToMorning(1.75), 12);
eq('đêm, xa bến: hoảng tăng (rate âm)', R.sanityRate(cfg, false, 0, 0, false, 0), -0.004);
eq('sách lì đòn 10% giảm tốc độ mất', Math.round(R.sanityRate(cfg, false, 0, 0, false, 0.1) * 1e7) / 1e7, -0.0036);
eq('trong bán kính đầy của bến: lấy fullValueNight', R.sanityVolume({ fullValueNight: 0.05, fullValueRadius: 10, partialValueRadius: 20, partialValueMinNight: 0 }, 5, false), 0.05);
eq('giữa hai bán kính: nội suy', R.sanityVolume({ fullValueNight: 0.05, fullValueRadius: 10, partialValueRadius: 20, partialValueMinNight: 0 }, 15, false), 0.025);

console.log('Điểm câu, giá');
const spot = { stock: 0, maxStock: 5, lastUpdate: 1, doesRestock: true };
R.regenStock(cfg, spot, 2);
eq('hồi kho 1 ngày từ 0: 1*1*0,2*5 = 1', spot.stock, 1);
eq('cá tươi cỡ giữa: 18 × lerp(0,8;1,25;0,5) × 1', R.sellPrice(cfg, items.cod, { size: 0.5, fresh: 3 }), 18.45);
eq('cá thiu (fresh 1,5): ×0,75', R.sellPrice(cfg, items.cod, { size: 0.5, fresh: 1.5 }), 13.84);
eq('trúng nấc vàng: cỡ >= 0,85', R.rollSize(cfg, true, () => 0) >= 0.85, true);
eq('không trúng: cỡ < 0,85', R.rollSize(cfg, false, () => 0.999) < 0.85, true);

console.log(`\n${pass} đạt, ${fail} hỏng`);
process.exit(fail ? 1 : 0);
