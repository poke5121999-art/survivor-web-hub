/*
 * HỐ XANH — kiểm hàm thuần của data/meta.js và phần chuẩn hoá sổ lưu của js/save.js, không cần trình duyệt.
 *
 * Chạy:  node test/ho-xanh-meta.js
 */
'use strict';
const path = require('path');
const assert = require('assert');
globalThis.window = globalThis;   // các tệp của game ghi vào window.*

const G = ['HX_TUNING', 'HX_ASSETS', 'HX_GEAR_SHEET', 'HX_BOAT_ASSETS', 'HX_META', 'HX', 'localStorage'];
function fresh() {
  G.forEach(k => { delete globalThis[k]; });
  for (const f of ['data/tuning.js', 'data/assets.js', 'data/gear_sheet.js', 'data/boat_assets.js', 'data/meta.js', 'js/save.js']) {
    const p = path.resolve(__dirname, '../games/ho-xanh', f);
    delete require.cache[p];
    require(p);
  }
  return { M: globalThis.HX_META, T: globalThis.HX_TUNING, S: globalThis.HX.save, fish: id => globalThis.HX_ASSETS.fish.find(s => s.id === id) };
}

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✔ ' + name); } catch (e) { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); }
}

// Trình duyệt không có localStorage (chặn lưu) — mọi thứ vẫn chạy trong bộ nhớ.
let { M, T, S, fish } = fresh();

t('cấp 0 là đồ khởi đầu của Dave trong bản gốc: O₂ 90, xiên 3, dao 3, túi 9, đồ lặn 40 m', () => {
  const s = M.defaults();
  assert.deepStrictEqual(['o2', 'harpoon', 'knife', 'cargo', 'suit'].map(k => M.stat(s, k)), [90, 3, 3, 9, 40]);
  assert.strictEqual(M.stat(s, 'harpoon'), T.harpoon.damage);
  assert.deepStrictEqual(Object.keys(M.GEAR), ['o2', 'cargo', 'suit', 'knife', 'harpoon']);
  assert.throws(() => M.stat(s, 'engine'), /không có nâng cấp "engine"/);
});

t('bảng trang bị lấy đúng số [DtD] của gear_sheet.js', () => {
  const v = k => M.GEAR[k].levels.map(l => l.value), c = k => M.GEAR[k].levels.map(l => l.cost);
  assert.deepStrictEqual(v('o2'), [90, 115, 145, 180, 220, 265, 315, 370, 425, 480, 530]);
  assert.deepStrictEqual(c('o2'), [0, 65, 135, 400, 750, 1500, 3000, 6000, 11300, 17000, 17000]);
  assert.deepStrictEqual(v('suit'), [40, 80, 150, 230, 375, 540, 800]);   // lv7 gốc (540 m, bộ đồ mới) trùng số nên bỏ
  assert.deepStrictEqual(v('cargo'), [9, 13, 19, 28, 42, 63, 94, 125, 155, 185]);
  assert.deepStrictEqual(v('harpoon'), [3, 10, 17, 24, 32, 40]);
  assert.deepStrictEqual(c('harpoon'), [0, 300, 700, 1500, 4500, 9700]);
  assert.deepStrictEqual(v('knife'), [3, 10, 17]);
  assert.deepStrictEqual(c('knife'), [0, 3000, 7200]);
});

t('quán cấp 0: 3 ghế, đầu bếp ×1, trang trí ×1, trà 10 vàng', () => {
  const s = M.defaults();
  assert.deepStrictEqual(['seats', 'chef', 'decor', 'tea'].map(k => M.stat(s, k)), [3, 1, 1, 10]);
  assert.strictEqual(M.maxLevel('seats'), 3);
  assert.strictEqual(M.stat({ bar: { seats: 3 } }, 'seats'), 6);
});

t('mọi bảng: cấp 0 miễn phí, giá không giảm, số tăng dần', () => {
  for (const tab of [M.GEAR, M.BAR]) for (const k of Object.keys(tab)) {
    const L = tab[k].levels;
    assert.strictEqual(L[0].cost, 0, k);
    // bản gốc có hai chỗ giá đứng yên: O₂ lv10 → lv11 (17000), đồ lặn lv1 → lv2 (tặng)
    for (let i = 1; i < L.length; i++) assert.ok(L[i].cost >= L[i - 1].cost && L[i].value > L[i - 1].value, k + ' cấp ' + i);
  }
});

t('không có tiền thì mua bị từ chối, sổ không đổi', () => {
  const s = M.defaults();
  assert.deepStrictEqual(M.buy(s, 'o2'), { ok: false, reason: 'thiếu tiền' });
  assert.strictEqual(M.nextCost(s, 'o2'), 65);
});

t('mua một cấp O₂: trừ 65 vàng, O₂ 115, sổ cũ giữ nguyên', () => {
  const s = Object.assign(M.defaults(), { gold: 1000 });
  const r = M.buy(s, 'o2');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.cost, 65);
  assert.strictEqual(r.save.gold, 935);
  assert.strictEqual(r.save.gear.o2, 1);
  assert.strictEqual(M.stat(r.save, 'o2'), 115);
  assert.strictEqual(s.gold, 1000);
  assert.strictEqual(s.gear.o2, 0);
  assert.strictEqual(M.nextCost(r.save, 'o2'), 135);
});

t('nâng quán ghi vào save.bar', () => {
  const r = M.buy(Object.assign(M.defaults(), { gold: 400 }), 'seats');
  assert.strictEqual(r.save.bar.seats, 1);
  assert.strictEqual(r.save.gold, 0);
  assert.strictEqual(M.stat(r.save, 'seats'), 4);
});

t('cấp tối đa thì báo "đã tối đa"', () => {
  const s = Object.assign(M.defaults(), { gold: 99999 });
  s.gear.suit = 6;
  assert.strictEqual(M.nextCost(s, 'suit'), null);
  assert.deepStrictEqual(M.buy(s, 'suit'), { ok: false, reason: 'đã tối đa' });
});

t('mã nâng cấp lạ thì ném lỗi nói rõ mã', () => {
  assert.throws(() => M.stat(M.defaults(), 'rocket'), /không có nâng cấp "rocket"/);
});

t('sáu súng phụ của bản gốc, không còn súng lục tự chế', () => {
  assert.deepStrictEqual(Object.keys(M.GUNS), ['rifle', 'shotgun', 'sniper', 'sleep', 'net', 'grenade']);
  assert.deepStrictEqual(Object.keys(M.GUNS).map(id => M.GUNS[id].mode), ['bullet', 'spread', 'pierce', 'sleep', 'net', 'grenade']);
  // [DtD] craftPrice ở chỗ Duff
  assert.deepStrictEqual(Object.keys(M.GUNS).map(id => M.GUNS[id].cost), [0, 50, 50, 50, 100, 100]);
});

t('số súng [DtD] theo cấp: sát thương, đạn, tầm, nòng, xuyên, lưới, nổ', () => {
  const g = id => M.GUNS[id].levels;
  assert.deepStrictEqual(g('rifle').map(l => l.dmg), [15, 22, 31, 41, 65]);
  assert.deepStrictEqual(g('shotgun').map(l => l.dmg), [12, 15, 19, 24, 29]);
  assert.deepStrictEqual(g('sniper').map(l => l.dmg), [32, 38, 47, 57, 74]);
  assert.deepStrictEqual(g('grenade').map(l => l.dmg), [30, 37, 46, 56, 70]);
  assert.deepStrictEqual(Object.keys(M.GUNS).map(id => M.GUNS[id].ammo), [8, 6, 3, 3, 3, 6]);
  assert.deepStrictEqual(Object.keys(M.GUNS).map(id => M.GUNS[id].range), [5, 3, 20, 5, 5, 10]);
  assert.strictEqual(M.GUNS.shotgun.pellets, 3);
  assert.strictEqual(M.GUNS.shotgun.spreadDeg, 40);
  assert.strictEqual(g('sniper')[0].pierce, true);
  assert.strictEqual(g('rifle')[0].pierce, false);
  assert.deepStrictEqual([g('net')[0].netSize, g('net').map(l => l.netCount)], [3, [7, 9, 11, 13, 15]]);
  assert.strictEqual(g('grenade')[0].blast, 2);
  assert.strictEqual(g('grenade')[0].arc, true);
  assert.strictEqual(g('sleep')[0].dmg, 0);
  assert.ok(g('sleep')[0].sleep > 0);
  assert.strictEqual(M.gunStat('sniper', 3).dmg, 47);
  assert.strictEqual(M.gunStat('sniper', 99).dmg, 74);
  assert.throws(() => M.gunStat('pistol'), /không có súng "pistol"/);
});

t('mua súng: trừ tiền, tự chọn khẩu đầu tiên; mua lại thì "đã có"', () => {
  const r = M.buyGun(Object.assign(M.defaults(), { gold: 120 }), 'net');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.save.gold, 20);
  assert.deepStrictEqual(r.save.guns, { owned: ['net'], equipped: 'net' });
  assert.deepStrictEqual(M.buyGun(r.save, 'net'), { ok: false, reason: 'đã có' });
  assert.deepStrictEqual(M.buyGun(r.save, 'grenade'), { ok: false, reason: 'thiếu tiền' });
  // súng trường nước giá 0: sổ mới cũng mua được
  assert.strictEqual(M.buyGun(M.defaults(), 'rifle').ok, true);
});

t('chọn súng chưa mua bị từ chối; bỏ chọn được', () => {
  const s = M.defaults();
  s.guns.owned = ['rifle', 'net'];
  s.guns.equipped = 'rifle';
  assert.deepStrictEqual(M.equipGun(s, 'sniper'), { ok: false, reason: 'chưa mua' });
  assert.strictEqual(M.equipGun(s, 'net').save.guns.equipped, 'net');
  assert.strictEqual(M.equipGun(s, null).save.guns.equipped, null);
});

t('trang bị một lượt lặn: số từng món và súng đang chọn', () => {
  const s = M.defaults();
  s.gear.o2 = 2; s.gear.cargo = 1;
  s.guns.owned = ['sniper']; s.guns.equipped = 'sniper';
  const L = M.loadout(s);
  assert.deepStrictEqual([L.o2, L.cargo, L.suit, L.knife, L.harpoon], [145, 13, 40, 3, 3]);
  assert.strictEqual(L.gun.id, 'sniper');
  assert.strictEqual(L.gun.dmg, 32);
  assert.strictEqual(L.gun.ammo, 3);
  assert.strictEqual(M.loadout(M.defaults()).gun, null);
});

t('sát thương gốc cùng thang với máu cá gốc: xiên cấp 0 hạ cá hề một phát, súng trường một phát cá bò titan chưa chết', () => {
  assert.ok(M.stat(M.defaults(), 'harpoon') >= fish('ClownFish').hp);
  assert.ok(M.GUNS.rifle.dmg < fish('Titan_Triggerfish').hp);
  assert.ok(2 * M.GUNS.rifle.dmg >= fish('Titan_Triggerfish').hp);
});

t('món ăn: giá theo hạng và cỡ, cá to nhiều suất', () => {
  assert.deepStrictEqual(M.dishOf(fish('ClownFish'), 'Cá hề'), { name: 'Sushi cá hề', price: 50, img: null });
  assert.strictEqual(M.dishOf(fish('Coral_Trout')).price, 95);
  assert.strictEqual(M.dishOf(fish('Coral_Trout')).name, 'Sushi coral trout');
  assert.strictEqual(M.dishOf(fish('Giant_Trevally')).price, 190);
  assert.strictEqual(M.servingsOf(fish('ClownFish')), 1);
  assert.strictEqual(M.servingsOf(fish('Coral_Trout')), 2);
  assert.strictEqual(M.servingsOf(fish('Green_Humphead_Parrotfish')), 4);
  assert.strictEqual(M.servingsOf(fish('GreatSpiderCrab')), 6);
});

t('sổ lưu: rác thì về mặc định', () => {
  assert.deepStrictEqual(S.parse('garbage{'), M.defaults());
  assert.deepStrictEqual(S.parse(null), M.defaults());
  assert.deepStrictEqual(S.parse([1, 2]), M.defaults());
});

t('sổ lưu: ghép từng khoá, bỏ giá trị lạ', () => {
  const s = S.parse(JSON.stringify({
    day: 4, stage: 'dive', gold: '-5', gear: { o2: 99, knife: 2, rocket: 3, engine: 2 },
    guns: { owned: ['net', 'pistol', 'laser', 'net'], equipped: 'laser' },
    fridge: { ClownFish: 2, Nope: 3, Coral_Trout: -1 }, dex: { ClownFish: 1, Nope: 1 }, stats: { served: 7 },
  }));
  assert.strictEqual(s.day, 4);
  assert.strictEqual(s.stage, 'prep');
  assert.strictEqual(s.gold, 0);
  // sổ cũ có "engine" (động cơ cano, bản gốc không có) và "pistol" (súng tự chế) thì bỏ đi
  assert.deepStrictEqual(s.gear, { o2: 10, cargo: 0, suit: 0, knife: 2, harpoon: 0 });
  assert.deepStrictEqual(s.guns, { owned: ['net'], equipped: null });
  assert.deepStrictEqual(s.fridge, { ClownFish: 2 });
  assert.deepStrictEqual(s.dex, { ClownFish: 1 });
  assert.deepStrictEqual(s.stats, { served: 7, earned: 0 });
  assert.deepStrictEqual(s.bar, { seats: 0, chef: 0, decor: 0, tea: 0 });
});

t('commit khi trình duyệt chặn lưu: vẫn đổi trong bộ nhớ', () => {
  const s = S.commit(d => { d.gold = 42; });
  assert.strictEqual(s.gold, 42);
  assert.strictEqual(S.get().gold, 42);
  assert.ok(Object.isFrozen(S.get().gear));
  assert.strictEqual(S.commit(() => false).gold, 42);
});

t('commit nhận sổ mới trả về từ HX_META.buy, ghi xuống localStorage', () => {
  ({ M, T, S } = fresh());
  const store = {};
  globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  S.load();
  S.commit(d => { d.gold = 350; });
  const r = M.buy(S.get(), 'cargo');
  S.commit(() => r.save);
  assert.deepStrictEqual(JSON.parse(store['hx.save.v1']).gear.cargo, 1);
  assert.strictEqual(JSON.parse(store['hx.save.v1']).gold, 295);
  S.wipe();
  assert.strictEqual(store['hx.save.v1'], undefined);
  assert.strictEqual(S.get().gold, 0);
});

console.log('\n' + pass + ' đạt, ' + fail + ' hỏng.');
process.exit(fail ? 1 : 0);
