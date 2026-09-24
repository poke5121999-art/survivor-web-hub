/*
 * HỐ XANH — kiểm hàm thuần của data/meta.js và phần chuẩn hoá sổ lưu của js/save.js, không cần trình duyệt.
 *
 * Chạy:  node test/ho-xanh-meta.js
 */
'use strict';
const path = require('path');
const assert = require('assert');
globalThis.window = globalThis;   // các tệp của game ghi vào window.*

const G = ['HX_TUNING', 'HX_ASSETS', 'HX_META', 'HX', 'localStorage'];
function fresh() {
  G.forEach(k => { delete globalThis[k]; });
  for (const f of ['data/tuning.js', 'data/assets.js', 'data/meta.js', 'js/save.js']) {
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

t('cấp 0 chơi y như tuning hiện tại', () => {
  const s = M.defaults();
  assert.strictEqual(M.stat(s, 'o2'), 100);
  assert.strictEqual(M.stat(s, 'o2'), T.o2.max);
  assert.strictEqual(M.stat(s, 'harpoon'), 3);
  assert.strictEqual(M.stat(s, 'harpoon'), T.harpoon.damage);
  assert.strictEqual(M.stat(s, 'knife'), 2);
  assert.strictEqual(M.stat(s, 'knife'), T.knife.damage);
  assert.strictEqual(M.stat(s, 'cargo'), 8);
  assert.strictEqual(M.stat(s, 'suit'), 130);
  assert.strictEqual(M.stat(s, 'engine'), 1);
});

t('quán cấp 0: 3 ghế, đầu bếp ×1, trang trí ×1, trà 10 vàng', () => {
  const s = M.defaults();
  assert.deepStrictEqual(['seats', 'chef', 'decor', 'tea'].map(k => M.stat(s, k)), [3, 1, 1, 10]);
  assert.strictEqual(M.maxLevel('seats'), 3);
  assert.strictEqual(M.stat({ bar: { seats: 3 } }, 'seats'), 6);
});

t('mọi bảng: cấp 0 miễn phí, giá tăng dần', () => {
  for (const tab of [M.GEAR, M.BAR]) for (const k of Object.keys(tab)) {
    const L = tab[k].levels;
    assert.strictEqual(L[0].cost, 0, k);
    for (let i = 1; i < L.length; i++) assert.ok(L[i].cost > L[i - 1].cost && L[i].value > L[i - 1].value, k + ' cấp ' + i);
  }
});

t('không có tiền thì mua bị từ chối, sổ không đổi', () => {
  const s = M.defaults();
  assert.deepStrictEqual(M.buy(s, 'o2'), { ok: false, reason: 'thiếu tiền' });
  assert.strictEqual(M.nextCost(s, 'o2'), 300);
});

t('mua một cấp O₂: trừ 300 vàng, O₂ 120, sổ cũ giữ nguyên', () => {
  const s = Object.assign(M.defaults(), { gold: 1000 });
  const r = M.buy(s, 'o2');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.cost, 300);
  assert.strictEqual(r.save.gold, 700);
  assert.strictEqual(r.save.gear.o2, 1);
  assert.strictEqual(M.stat(r.save, 'o2'), 120);
  assert.strictEqual(s.gold, 1000);
  assert.strictEqual(s.gear.o2, 0);
  assert.strictEqual(M.nextCost(r.save, 'o2'), 800);
});

t('nâng quán ghi vào save.bar', () => {
  const r = M.buy(Object.assign(M.defaults(), { gold: 400 }), 'seats');
  assert.strictEqual(r.save.bar.seats, 1);
  assert.strictEqual(r.save.gold, 0);
  assert.strictEqual(M.stat(r.save, 'seats'), 4);
});

t('cấp tối đa thì báo "đã tối đa"', () => {
  const s = Object.assign(M.defaults(), { gold: 99999 });
  s.gear.suit = 4;
  assert.strictEqual(M.nextCost(s, 'suit'), null);
  assert.deepStrictEqual(M.buy(s, 'suit'), { ok: false, reason: 'đã tối đa' });
});

t('mã nâng cấp lạ thì ném lỗi nói rõ mã', () => {
  assert.throws(() => M.stat(M.defaults(), 'rocket'), /không có nâng cấp "rocket"/);
});

t('mua súng: trừ tiền, tự chọn khẩu đầu tiên; mua lại thì "đã có"', () => {
  const r = M.buyGun(Object.assign(M.defaults(), { gold: 500 }), 'pistol');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.save.gold, 200);
  assert.deepStrictEqual(r.save.guns, { owned: ['pistol'], equipped: 'pistol' });
  assert.deepStrictEqual(M.buyGun(r.save, 'pistol'), { ok: false, reason: 'đã có' });
  assert.deepStrictEqual(M.buyGun(r.save, 'rifle'), { ok: false, reason: 'thiếu tiền' });
});

t('chọn súng chưa mua bị từ chối; bỏ chọn được', () => {
  const s = M.defaults();
  s.guns.owned = ['pistol', 'net'];
  s.guns.equipped = 'pistol';
  assert.deepStrictEqual(M.equipGun(s, 'rifle'), { ok: false, reason: 'chưa mua' });
  assert.strictEqual(M.equipGun(s, 'net').save.guns.equipped, 'net');
  assert.strictEqual(M.equipGun(s, null).save.guns.equipped, null);
});

t('súng đủ trường số cho luồng bắn sau này', () => {
  for (const id of ['pistol', 'rifle', 'shotgun', 'net', 'sleep']) {
    const g = M.GUNS[id];
    for (const f of ['cost', 'dmg', 'pellets', 'spreadDeg', 'speed', 'range', 'ammo', 'cooldown']) assert.strictEqual(typeof g[f], 'number', id + '.' + f);
    assert.ok(['bullet', 'spread', 'net', 'sleep'].includes(g.mode), id);
  }
  assert.strictEqual(M.GUNS.shotgun.pellets, 5);
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
    day: 4, stage: 'dive', gold: '-5', gear: { o2: 99, knife: 2, rocket: 3 },
    guns: { owned: ['pistol', 'laser', 'pistol'], equipped: 'laser' },
    fridge: { ClownFish: 2, Nope: 3, Coral_Trout: -1 }, dex: { ClownFish: 1, Nope: 1 }, stats: { served: 7 },
  }));
  assert.strictEqual(s.day, 4);
  assert.strictEqual(s.stage, 'prep');
  assert.strictEqual(s.gold, 0);
  assert.deepStrictEqual(s.gear, { o2: 5, cargo: 0, suit: 0, knife: 2, harpoon: 0, engine: 0 });
  assert.deepStrictEqual(s.guns, { owned: ['pistol'], equipped: null });
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
  assert.strictEqual(JSON.parse(store['hx.save.v1']).gold, 150);
  S.wipe();
  assert.strictEqual(store['hx.save.v1'], undefined);
  assert.strictEqual(S.get().gold, 0);
});

console.log('\n' + pass + ' đạt, ' + fail + ' hỏng.');
process.exit(fail ? 1 : 0);
