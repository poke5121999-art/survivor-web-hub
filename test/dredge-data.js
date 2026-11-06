/*
 * Biển Mù — kiểm dữ liệu bóc bằng tools/data.py (lưới, nâng cấp, thời tiết, item, chữ, thành phần scene).
 *   node test/dredge-data.js
 * Chỉ cần node: nạp các tệp data/*.js vào một vm, không cần trình duyệt, chạy dưới 1 giây.
 * Số mong đợi là số đọc thẳng từ asset gốc DREDGE 1.5.3 bằng UnityPy (typetree thô, GridKey.cs, ItemData.cs),
 * không phải số chép lại từ chính tệp dữ liệu. DR_GAME_DIR trỏ tới thư mục games/dredge khác.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const G = process.env.DR_GAME_DIR ? path.resolve(process.env.DR_GAME_DIR) : path.resolve(__dirname, '../games/dredge');

const box = { console: { warn() {}, log() {}, error() {} } };
box.window = box; box.globalThis = box;
vm.createContext(box);
for (const f of ['strings', 'items', 'grids', 'upgrades', 'weather', 'quests', 'config', 'world_data']) {
  vm.runInContext(fs.readFileSync(path.join(G, 'data', f + '.js'), 'utf8'), box, { filename: f + '.js' });
}
const STR = box.DR_STR, ITEMS = box.DR_ITEMS, GRIDS = box.DR_GRIDS, UPG = box.DR_UPGRADES, WEA = box.DR_WEATHER;
const QUESTS = box.DR_QUESTS, CFG = box.DR_CONFIG, WORLD = box.DR_WORLD;

let pass = 0, fail = 0;
const canon = x => (x && typeof x === 'object')
  ? (Array.isArray(x) ? x.map(canon) : Object.fromEntries(Object.keys(x).sort().map(k => [k, canon(x[k])]))) : x;
function eq(name, got, want) {
  const ok = JSON.stringify(canon(got)) === JSON.stringify(canon(want));
  if (ok) pass++; else fail++;
  console.log((ok ? '  ✔ ' : '  ✘ ') + name + (ok ? '' : '  — got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want)));
}
const dims = g => g ? g.columns + 'x' + g.rows : null;
const items = () => Object.values(ITEMS);

console.log('Lưới (DR_GRIDS): ô nhỏ của lưới thả pot/net, khay, lưới giao vật liệu nâng cấp');
eq('Pot1 3x3 (có ở itemdata nhưng không có trong container nên trước đây thiếu)', dims(GRIDS.Pot1), '3x3');
eq('Pot2..Pot8', ['Pot2', 'Pot3', 'Pot4', 'Pot5', 'Pot6', 'Pot7', 'Pot8'].map(k => dims(GRIDS[k])), ['4x4', '4x4', '5x4', '5x4', '5x5', '6x5', '6x6']);
eq('TIRPot1 4x4', dims(GRIDS.TIRPot1), '4x4');
eq('Net1..Net8', ['Net1', 'Net2', 'Net3', 'Net4', 'Net5', 'Net6', 'Net7', 'Net8'].map(k => dims(GRIDS[k])), ['5x5', '5x6', '6x6', '6x6', '8x8', '9x10', '7x7', '5x5']);
eq('GridKey STORAGE_TRAY = 11', CFG.gridKeyIds.STORAGE_TRAY, 11);
eq('STORAGE_TRAY -> StorageTray 6x3', [CFG.gridConfigs.STORAGE_TRAY, dims(GRIDS[CFG.gridConfigs.STORAGE_TRAY])], ['StorageTray', '6x3']);
eq('khay nhận cá, đồ thường, relic, trinket, vật liệu (cờ 121)', GRIDS.StorageTray.mainItemSubtype, ['FISH', 'GENERAL', 'RELIC', 'TRINKET', 'MATERIAL']);
eq('Tier2Hull là bố cục khoang 7x10 (không lẫn với lưới giao vật liệu)', dims(GRIDS.Tier2Hull), '7x10');
eq('lưới giao vật liệu UPGRADE_T2..T5_HULL = 5x6, 6x6, 7x6, 4x2',
  ['UPGRADE_T2_HULL', 'UPGRADE_T3_HULL', 'UPGRADE_T4_HULL', 'UPGRADE_T5_HULL'].map(k => dims(GRIDS[CFG.gridConfigs[k]])), ['5x6', '6x6', '7x6', '4x2']);
eq('193 tên GridConfiguration khác nhau (đủ bản gốc)', new Set(Object.values(GRIDS).map(g => g.asset)).size, 193);
const dangling = (label, names) => eq('không có tham chiếu lưới treo: ' + label + ' (' + names.length + ')', names.filter(n => !(n in GRIDS)), []);
dangling('item.gridConfig', items().map(v => v.gridConfig).filter(Boolean));
dangling('DR_CONFIG.gridConfigs', Object.values(CFG.gridConfigs));
dangling('DR_QUESTS.QuestGridConfig.gridConfiguration', Object.values(QUESTS.QuestGridConfig).map(v => v.gridConfiguration));
dangling('upgrade.questGrid.gridConfiguration', Object.values(UPG).map(v => v.questGrid.gridConfiguration));

console.log('Nâng cấp (DR_UPGRADES[id].questGrid)');
const KEYIDS = {
  'tier-1-fishing-1': 1001, 'tier-1-net-1': 1002, 'tier-1-engines-1': 1003, 'tier-1-lights-1': 1004,
  'tier-2-hull': 1011, 'tier-2-fishing-1': 1012, 'tier-2-engines-1': 1013, 'tier-2-storage-1': 1014,
  'tier-3-hull': 1021, 'tier-3-fishing-1': 1022, 'tier-3-net-1': 1023, 'tier-3-engines-1': 1024, 'tier-3-lights-1': 1025, 'tier-3-storage-1': 1026,
  'tier-4-hull': 1031, 'tier-4-fishing-1': 1032, 'tier-4-engines-1': 1033, 'tier-4-lights-1': 1034, 'tier-4-storage-1': 1035,
  'tier-5-hull': 1041
};
eq('20 nâng cấp đều có questGrid', Object.keys(UPG).filter(k => UPG[k].questGrid).sort(), Object.keys(KEYIDS).sort());
eq('UPGRADE_T1_FISHING_1 = 1001', [UPG['tier-1-fishing-1'].questGrid.gridKey, UPG['tier-1-fishing-1'].questGrid.gridKeyId], ['UPGRADE_T1_FISHING_1', 1001]);
eq('gridKeyId của 20 nâng cấp khớp GridKey.cs', Object.fromEntries(Object.keys(KEYIDS).map(k => [k, UPG[k].questGrid.gridKeyId])), KEYIDS);
eq('gridKeyId khớp DR_CONFIG.gridKeyIds theo tên', Object.keys(KEYIDS).every(k => CFG.gridKeyIds[UPG[k].questGrid.gridKey] === KEYIDS[k]), true);
eq('cả 20: REVISITABLE, lưu lại, chỉ hình bóng, không lắp đồ',
  [...new Set(Object.values(UPG).map(u => [u.questGrid.questGridExitMode, u.questGrid.isSaved, u.questGrid.presetGridMode, u.questGrid.allowEquipmentInstallation].join()))], ['REVISITABLE,true,SILHOUETTE,false']);
eq('tier-5-hull tốn 2 crate (không phải 4 gỗ/3 sắt/4 vải/3 kim loại cũ)', UPG['tier-5-hull'].upgradeCost.map(c => [c.itemData, c.num]), [['crate', 2]]);
eq('tier-5-hull completeConditions = 2 crate', UPG['tier-5-hull'].questGrid.completeConditions, [{ item: 'crate', count: 2 }]);
eq('tier-2-hull cần 4 gỗ, 2 sắt, 3 vải, 1 kim loại', UPG['tier-2-hull'].questGrid.completeConditions.map(c => [c.item, c.count]), [['lumber', 4], ['scrap', 2], ['cloth', 3], ['metal', 1]]);
eq('upgradeCost của 20 nâng cấp = completeConditions', Object.values(UPG).every(u => JSON.stringify(u.upgradeCost.map(c => [c.itemData, c.num])) === JSON.stringify(u.questGrid.completeConditions.map(c => [c.item, c.count]))), true);
eq('tier-1-fishing-1: hình bóng 4 vật (2 gỗ, 1 sắt, 1 vải)', UPG['tier-1-fishing-1'].questGrid.presetGrid.spatialItems,
  [{ id: 'lumber', x: 0, y: 2, z: 0 }, { id: 'lumber', x: 0, y: 3, z: 0 }, { id: 'scrap', x: 0, y: 0, z: 0 }, { id: 'cloth', x: 2, y: 0, z: 0 }]);
eq('tier-2-hull: hình bóng 10 vật, gỗ xoay 270', [UPG['tier-2-hull'].questGrid.presetGrid.spatialItems.length, UPG['tier-2-hull'].questGrid.presetGrid.spatialItems[0]], [10, { id: 'lumber', x: 0, y: 0, z: 270 }]);
eq('tier-2-hull dùng lưới giao 5x6 chứ không phải bố cục 7x10', [UPG['tier-2-hull'].questGrid.gridConfiguration, UPG['tier-2-hull'].questGrid.gridConfigurationAsset, dims(GRIDS[UPG['tier-2-hull'].questGrid.gridConfiguration])], ['Tier2Hull#UPGRADE_T2_HULL', 'Tier2Hull', '5x6']);
eq('tên lưới giao của tier-4-storage-1 = Tier4Storage1 7x6', [UPG['tier-4-storage-1'].questGrid.gridConfiguration, dims(GRIDS.Tier4Storage1)], ['Tier4Storage1', '7x6']);
eq('mọi vật liệu trong điều kiện và hình bóng là item có thật', Object.values(UPG).every(u => u.questGrid.completeConditions.every(c => ITEMS[c.item]) && u.questGrid.presetGrid.spatialItems.every(s => ITEMS[s.id])), true);
eq('tiêu đề lưới: chữ + khoá DR_STR', [UPG['tier-1-fishing-1'].questGrid.titleString, UPG['tier-1-fishing-1'].questGrid.titleStringKey, STR['quest-grid.upgrades']], ['Materials Required', 'quest-grid.upgrades', 'Materials Required']);
eq('thông số vốn có vẫn còn (tier-1-fishing-1 giá 95)', UPG['tier-1-fishing-1'].monetaryCost, 95);

console.log('Thời tiết (DR_WEATHER.<tên>.parameters.sfx = tên clip gốc)');
const sfx = k => WEA[k].parameters.sfx;
eq('LightRain', sfx('LightRain'), 'Light Rain 1');
eq('MediumRain, MediumStorm', [sfx('MediumRain'), sfx('MediumStorm')], ['Normal Rain 1', 'Normal Rain 1']);
eq('HeavyRain, HeavyStorm', [sfx('HeavyRain'), sfx('HeavyStorm')], ['Heavy Rain 1', 'Heavy Rain 1']);
eq('Cloudy', sfx('Cloudy'), 'Windy');
eq('LightSnow, MediumSnow, HeavySnow', [sfx('LightSnow'), sfx('MediumSnow'), sfx('HeavySnow')], ['Light Snow', 'Light Snow', 'Heavy Snow']);
eq('Aurora, AuroraSnow, FinaleAurora', [sfx('Aurora'), sfx('AuroraSnow'), sfx('FinaleAurora')], ['Aurora', 'Aurora', 'Aurora']);
eq('Clear, Fine, FinaleStorm không có clip (âm lượng 0)', [sfx('Clear'), sfx('Fine'), sfx('FinaleStorm')].concat([WEA.Clear, WEA.Fine, WEA.FinaleStorm].map(w => w.parameters.sfxVolume)), [null, null, null, 0, 0, 0]);
eq('12 trong 15 thời tiết có clip', Object.keys(WEA).filter(k => sfx(k)).length, 12);
eq('SpeakerData có vòng tiếng (cùng cách tra tên clip)', [WORLD.SpeakerData.Mayor.loopSFX, WORLD.SpeakerData.LighthouseKeeper.loopSFX], ['Mayor - Ambience', 'lighthouse-loop']);

console.log('Item (tooltip, chữ, khoá DR_STR)');
eq('420 item đều có tooltipTextColor dạng #rrggbb(aa)', items().filter(v => /^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(v.tooltipTextColor)).length, 420);
eq('tooltipTextColor: cod, relic1, dmg, dark-splash, tin nhắn', ['cod', 'relic1', 'dmg', 'dark-splash', 'message-fisherman-1'].map(k => ITEMS[k].tooltipTextColor), ['#7d6244', '#871d58', '#dc2c38', '#88004c', '#00000000']);
eq('tooltipNotesColor = trắng ở cả 420', items().filter(v => v.tooltipNotesColor === '#ffffff').length, 420);
eq('5 màu chữ mô tả khác nhau', [...new Set(items().map(v => v.tooltipTextColor))].sort(), ['#00000000', '#7d6244', '#871d58', '#88004c', '#dc2c38']);
eq('relic1: khoá tên/mô tả điên + chữ cạnh bên',
  [ITEMS.relic1.itemInsaneTitleKey, ITEMS.relic1.itemInsaneTitle, STR[ITEMS.relic1.itemInsaneTitleKey], STR[ITEMS.relic1.itemInsaneDescriptionKey] === ITEMS.relic1.itemInsaneDescription],
  ['item.relic1.name-insane', 'Antique Diary Key', 'Antique Diary Key', true]);
const keyed = (kf, tf) => items().filter(v => v[kf] !== undefined);
eq('khoá itemInsaneTitleKey / itemInsaneDescriptionKey / additionalNoteKey / dialogueNodeSpecificDescriptionKey: 6 / 7 / 5 / 3',
  [keyed('itemInsaneTitleKey').length, keyed('itemInsaneDescriptionKey').length, keyed('additionalNoteKey').length, keyed('dialogueNodeSpecificDescriptionKey').length], [6, 7, 5, 3]);
eq('mọi khoá trên đều tra được trong DR_STR ra đúng chữ cạnh bên',
  items().every(v => (v.itemInsaneTitleKey === undefined || STR[v.itemInsaneTitleKey] === v.itemInsaneTitle)
    && (v.itemInsaneDescriptionKey === undefined || STR[v.itemInsaneDescriptionKey] === v.itemInsaneDescription)
    && (v.additionalNoteKey === undefined || STR[v.additionalNoteKey] === v.additionalNote)
    && (v.dialogueNodeSpecificDescriptionKey === undefined || STR[v.dialogueNodeSpecificDescriptionKey] === v.dialogueNodeSpecificDescription)), true);
eq('crate: ghi chú thêm', [ITEMS.crate.hasAdditionalNote, ITEMS.crate.additionalNoteKey], [true, 'item.crate.additional-notes']);
eq('5 item có hasAdditionalNote', items().filter(v => v.hasAdditionalNote).map(v => v.id).sort(), ['crate', 'ice-block-1', 'ice-block-2', 'repair-boat', 'teleport-anchor']);
eq('quest-map-1: mô tả thay thế khi đã qua nút hội thoại', [ITEMS['quest-map-1'].linkedDialogueNode, ITEMS['quest-map-1'].dialogueNodeSpecificDescriptionKey], ['SB_ShoreCache4_Emptied', 'item.quest-map-x.description-alt']);
eq('forbidStorageTray: 21 item cấm khay (gadget 1-6 ...)', items().filter(v => v.forbidStorageTray).length, 21);
eq('canBeDiscardedDuringQuestPickup=false: 30 item', items().filter(v => v.canBeDiscardedDuringQuestPickup === false).length, 30);
eq('hasSpecialDiscardAction: 4 item, lời nhắc là khoá DR_STR',
  items().filter(v => v.hasSpecialDiscardAction).map(v => [v.id, v.discardPromptOverride, STR[v.discardPromptOverride]]).sort(),
  [['repair-boat', 'prompt.use', 'Use'], ['repair-panic', 'prompt.use', 'Use'], ['repair-pot', 'prompt.use', 'Use'], ['teleport-anchor', 'prompt.throw-overboard', 'Cast Overboard']]);
eq('displayDurabilityAsPercentage: 2 khối băng', items().filter(v => v.displayDurabilityAsPercentage).map(v => v.id).sort(), ['ice-block-1', 'ice-block-2']);
eq('cellsExcludedFromDisplayingInfection: bronze-whaler, goblin-shark (+ab-1)', items().filter(v => v.cellsExcludedFromDisplayingInfection).map(v => v.id).sort(), ['bronze-whaler', 'bronze-whaler-ab-1', 'goblin-shark', 'goblin-shark-ab-1']);
eq('bronze-whaler: 3 ô bị loại', ITEMS['bronze-whaler'].cellsExcludedFromDisplayingInfection, [[0, 1], [1, 0], [2, 2]]);
const dep = items().filter(v => v.cls === 'DeployableItemData');
eq('19 DeployableItemData đủ 5 trường tooltip (nhịp thả, tỉ lệ, độ bền ngày, tên lưới, khoá lưới)',
  [dep.length, dep.every(v => ['timeBetweenCatchRolls', 'catchRate', 'maxDurabilityDays', 'gridConfig', 'gridKey'].every(f => v[f] !== undefined))], [19, true]);
eq('pot1: 0,66 ngày/nhịp, tỉ lệ 1, bền 3 ngày, lưới Pot1, khoá NONE', ['timeBetweenCatchRolls', 'catchRate', 'maxDurabilityDays', 'gridConfig', 'gridKey'].map(f => ITEMS.pot1[f]), [0.66, 1, 3, 'Pot1', 'NONE']);
eq('net1: lưới Net1, khoá TRAWL_NET', [ITEMS.net1.gridConfig, ITEMS.net1.gridKey], ['Net1', 'TRAWL_NET']);
const gad = items().filter(v => v.cls === 'GadgetItemData');
eq('6 gadget có effectType + effectMagnitude', gad.map(v => [v.id, v.effectType, v.effectMagnitude]),
  [['gadget-1', 'TURN_SPEED', 0.25], ['gadget-2', 'REVERSE_SPEED', 0.35], ['gadget-3', 'DREDGE_SPEED', 0.25], ['gadget-4', 'FISHING_SPEED', 0.2], ['gadget-5', 'HEAT_SINK', 0.15], ['gadget-6', 'TRAWL_CATCH_RATE', 0.1]]);

console.log('Thành phần scene (DR_WORLD.<Lớp>.<Lớp>)');
const GD = WORLD.TooltipSectionGadgetDetails.TooltipSectionGadgetDetails;
eq('tên hiệu ứng gadget TURN_SPEED', [GD.gadgetEffectNames.TURN_SPEED, GD.gadgetEffectKeys.TURN_SPEED], ['Turning Speed', 'tooltip.gadget.effect.turn-speed']);
eq('6 tên hiệu ứng, khoá tra được trong DR_STR', [Object.keys(GD.gadgetEffectNames).length, Object.keys(GD.gadgetEffectKeys).every(e => STR[GD.gadgetEffectKeys[e]] === GD.gadgetEffectNames[e])], [6, true]);
eq('mọi gadget có tên hiệu ứng', gad.every(v => GD.gadgetEffectNames[v.effectType]), true);
const SR = WORLD.ShopRestocker.ShopRestocker;
eq('ShopRestocker: Shipwright_Rods -> SHIPWRIGHT_RODS (lưới 21)', [SR.shopDataGridConfigs.Shipwright_Rods, CFG.gridKeyIds[SR.shopDataGridConfigs.Shipwright_Rods]], ['SHIPWRIGHT_RODS', 21]);
eq('ShopRestocker: 12 cặp ShopData -> GridKey', SR.shopDataGridConfigs, {
  Fishmonger_Pots: 'FISHMONGER', Explosives: 'EXPLOSIVES_SELLER', Shipwright_Rods: 'SHIPWRIGHT_RODS', Shipwright_Engines: 'SHIPWRIGHT_ENGINES',
  Shipwright_Nets: 'SHIPWRIGHT_NETS', Shipwright_Lights: 'SHIPWRIGHT_LIGHTS', TM_Rods: 'TRAVELLING_MERCHANT_RODS', TM_Engines: 'TRAVELLING_MERCHANT_ENGINES',
  TM_Pots: 'TRAVELLING_MERCHANT_POTS', TM_Nets: 'TRAVELLING_MERCHANT_NETS', TM_Lights: 'TRAVELLING_MERCHANT_LIGHTS', TM_Junk: 'TRAVELLING_MERCHANT_MATERIALS' });
eq('ShopRestocker: mọi ShopData và GridKey có thật', Object.keys(SR.shopDataGridConfigs).every(s => WORLD.ShopData[s]) && Object.values(SR.shopDataGridConfigs).every(g => g in CFG.gridConfigs), true);
eq('itemsToKeepInStock (10)', SR.itemsToKeepInStock, ['engine10', 'light6', 'pot8', 'rod8', 'rod16', 'rod17', 'rod19', 'rod20', 'rod21', 'net7']);
eq('itemsToKeepInStock là item có thật', SR.itemsToKeepInStock.every(i => ITEMS[i]), true);
eq('bảng hứng chữ mặc định của lưới nhiệm vụ', WORLD.QuestGridPanel.QuestGridPanel.revisitableString, 'You can return to these items later.');
eq('bảng nâng cấp có chữ riêng: "Materials left here will be saved."', [WORLD.UpgradeGridPanel.UpgradeGridPanel.revisitableString, WORLD.UpgradeGridPanel.UpgradeGridPanel.revisitableStringKey, WORLD.UpgradeGridPanel.UpgradeGridPanel.exitPromptString], ['Materials left here will be saved.', 'quest-grid.exit-help.upgrades', 'Done']);
eq('khay chứa mở khoá khi xong nhiệm vụ Quest_Intro', [WORLD.HarvestMinigameView.HarvestMinigameView.storageTrayUnlockQuest, !!QUESTS.QuestData.Quest_Intro], ['Quest_Intro', true]);

console.log('Chữ (DR_STR) mà các bản kiểm cần');
eq('khoá tên tab cửa hàng và nút nâng cấp có đủ', ['title.shipwright-rods', 'title.shipwright-lights', 'title.travelling-merchant-rods', 'button.purchase-upgrade', 'upgrades.header.description'].map(k => STR[k]),
  ['Shipwright - Rods', 'Shipwright - Lights', 'Travelling Merchant - Rods', 'Purchase Upgrade [{0}]', 'Select an upgrade project to begin adding materials to it.']);
eq('chữ gear.md 3(8) có trong DR_STR', ['notification.crab-pot-deployed', 'notification.deploy-pot.none-with-durability', 'tooltip.deployable.durability-value', 'equipment-status.damaged', 'equipment-status.operational'].every(k => typeof STR[k] === 'string'), true);
eq('prompt.radial-show và prompt.action không có trong bảng chữ nào của bản gốc', [STR['prompt.radial-show'], STR['prompt.action']], [undefined, undefined]);

console.log(`\n${pass} đạt, ${fail} hỏng`);
process.exit(fail ? 1 : 0);
