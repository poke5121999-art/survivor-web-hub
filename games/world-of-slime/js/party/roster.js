// Túi slime (đội 1-6), kho Allen, bách khoa và ô nhanh vật phẩm (F3) trên bản lưu engine.save (khuôn ở js/state.js).
// Game gốc: holdingMonsters + equippedMonsterId (SelectMonsterInBagRequest{pocketIndex}), kho Archive, MonsterDexDegree; ở đây
// mọi thứ chạy trên máy. Mọi chỗ đọc/ghi slime sở hữu đi qua lớp này; HUD chỉ đọc state.party / state.equipped do sync() đẩy ra.
import { state, set, newSlime, PARTY_MAX, STORAGE_MAX, STARTER_STATS } from '../state.js?v=20261022d';
import { RULES } from '../combat/rules.js?v=20261022d';
import { loadJSON } from '../assets.js?v=20261022d';
import { itemIcon } from './items.js?v=20261022d';

// Tên loài do server gửi (không có trong client). [THẤY] = đọc trong khung clip; còn lại hiện tên ghép từ id [ĐỀ XUẤT].
export const SPECIES_NAME = {
  SL_Slime_Grass: 'Junior Floralime',        // [THẤY] 6:00, gmwall_slimepedia 002
  SL_Slime_Water: 'Junior Aqualime',         // [THẤY 5:27 "Junior A…"] + [ĐỀ XUẤT] phần sau
  SL_SlimeL_Grass: 'Giant Floralime',        // [THẤY] gmwall_slimepedia 015 (bóng slime to)
  SL_Tricky_Dark: 'Tricky',                  // [THẤY] gmwall_slimepedia 017 (hệ bóng tối)
  SL_RabbitWing_WindMagic: 'Tweety',         // [THẤY tên] 016; ghép với biến thể RabbitWing [ĐỀ XUẤT]
  SL_RabbitWing_WindLight: 'Twinky',         // [THẤY tên] V4Van (thỏ trắng); ghép biến thể [ĐỀ XUẤT]
  SL_Mandrake_Grass: 'Mandrake',             // [THẤY] V4Van sheet1
  SL_Mandrake_GrassFire: 'Red Mandrake',     // [THẤY] v4van_nickname_synthesis_lab
  SL_Mercury_SteelPower: 'Mercury',          // [THẤY] gmwall_hud_party_bar
  SL_Kobold_Steel: 'Kobold',                 // [THẤY] V4Van sheet2
  SL_Lizard_Poison: 'Poison Lizard',         // [THẤY] V4Van sheet1
  SL_Balrog_DarkFire: 'Balrog',              // [THẤY] cốt truyện
  SL_ElecChicken_WindFire: 'Roasted',        // [THẤY] tên trên đầu slime gà lửa khởi đầu (6:06, 6:27); tên loài hay biệt danh: chưa rõ
  SL_ElecChicken_WindElectric: 'Zapped',     // [ĐỀ XUẤT] ba lô vàng
};
export const speciesName = id => SPECIES_NAME[id] || (id || '').replace(/^SL_/, '').replace(/_/g, ' ');
export const displayName = rec => (rec && (rec.nickname || speciesName(rec.typeId))) || '';
// biệt danh mặc định của slime khởi đầu theo ba lô (js/intro/prologue.js BAGS): xanh = "Roasted" như clip DcGavHFwqtk
export const STARTER_NICK = { blue: 'Roasted', yellow: 'Zapped' };   // yellow [ĐỀ XUẤT]

// Số bách khoa: chỉ 4 số thấy trong gmwall_slimepedia; các loài còn lại xếp theo thứ tự slime/index.json vào chỗ trống [ĐỀ XUẤT]
const DEX_FIXED = { SL_Slime_Grass: 2, SL_SlimeL_Grass: 15, SL_RabbitWing_WindMagic: 16, SL_Tricky_Dark: 17 };
let dexList = null;
export async function loadDex() {
  if (dexList) return dexList;
  const si = await loadJSON('slime/index.json');
  const ids = si.variants.map(v => v.id), n = ids.length, slots = new Array(n).fill(null);
  for (const [id, no] of Object.entries(DEX_FIXED)) if (ids.includes(id)) slots[no - 1] = id;
  let k = 0;
  for (const id of ids) { if (id in DEX_FIXED) continue; while (slots[k]) k++; slots[k] = id; }
  dexList = slots.map((id, i) => ({ no: i + 1, id, elements: si.variants.find(v => v.id === id).elements || elementsOf(id) }));
  return dexList;
}
// hệ theo đuôi tên SL_<Loài>_<Hệ1><Hệ2> (Enums.MonsterElement)
export function elementsOf(id) {
  const m = /^SL_[A-Za-z]+_([A-Za-z]+)$/.exec(id || ''); if (!m) return [];
  return (m[1].match(/[A-Z][a-z]+/g) || []).slice(0, 2);
}
// [ĐỀ XUẤT] điểm sưu tầm: phát hiện 50, bắt 1000 (gmwall: 5,354 với 5 con đã bắt)
export const DEX_POINT = { 1: 50, 2: 1000 };

export class Roster {
  constructor(engine) {
    this.E = engine;
    this.switchCd = 0;
  }
  get save() { return this.E.save; }
  rec(uid) { return this.save.slimes[uid] || null; }
  partyRecs() { return this.save.party.map(u => this.rec(u)).filter(Boolean); }
  storageRecs() { return this.save.storage.map(u => this.rec(u)).filter(Boolean); }
  active() { return this.rec(this.save.active) || this.partyRecs()[0] || null; }
  activeIndex() { const i = this.save.party.indexOf(this.save.active); return i < 0 ? 0 : i; }
  accompanyLimit() { return this.save.level >= 16 ? RULES.party.accompanyAt16 : RULES.party.accompany; }
  maxHp(r) { return RULES.partner.hp(r.level); }
  maxMp(r) { return RULES.partner.mp(r.level); }

  // lần đầu vào game: slime khởi đầu theo ba lô (profile) hoặc ?slime=; bản lưu v1 mang chỉ số cũ sang
  ensureStarter(typeId, bag) {
    const sv = this.save;
    if (!sv.party.length && !sv.storage.length) {
      const old = sv._v1slime || STARTER_STATS;
      const r = newSlime(typeId, { nickname: STARTER_NICK[bag] || STARTER_NICK.blue, acquisition: 'STARTER', level: old.level || 1, exp: old.exp || 0,
        hp: old.hp, mp: old.mp, stamina: old.stamina });
      sv.slimes[r.uid] = r; sv.party.push(r.uid); sv.active = r.uid;
      delete sv._v1slime;
      sv.dex[typeId] = 2;
      this.E.persist();
    }
    if (!this.rec(sv.active)) sv.active = sv.party[0];
    return this.active();
  }
  // bắt được: vào túi (ô trống) hoặc kho (UI.AutoArchived); trả { rec, where } hoặc null khi cả hai đầy (UI.CubeNoEmptyInven)
  canAdd() { return this.save.party.length < PARTY_MAX || this.save.storage.length < STORAGE_MAX; }
  add(typeId, o = {}) {
    const sv = this.save; if (!this.canAdd()) return null;
    const r = newSlime(typeId, o);
    sv.slimes[r.uid] = r;
    const where = sv.party.length < PARTY_MAX ? 'party' : 'storage';
    sv[where].push(r.uid);
    const first = (sv.dex[typeId] || 0) < 2;
    sv.dex[typeId] = 2;
    this.E.ev('tamed', { uid: r.uid, typeId, where });
    this.E.persist();
    return { rec: r, where, first };
  }
  discover(typeId) { if (!this.save.dex[typeId]) { this.save.dex[typeId] = 1; this.E.persist(); return true; } return false; }
  degree(typeId) { return this.save.dex[typeId] || 0; }
  rename(uid, nick) { const r = this.rec(uid); if (!r) return; r.nickname = (nick || '').trim().slice(0, 18) || null; this.E.persist(); }

  // phím 1-6 (EquipMonster1..6): trả mã lỗi gốc hoặc 'ok' / 'same'
  equip(i) {
    const sv = this.save, uid = sv.party[i];
    if (!uid) return 'empty';
    if (i >= this.accompanyLimit()) return 'unavailable';
    if (uid === sv.active) { if (state.equipped !== i) this.sync(); return 'same'; }
    const r = this.rec(uid);
    if (r.fainted || r.hp <= 0) return 'hpZero';
    if (this.switchCd > 0) return 'cooldown';
    sv.active = uid; this.switchCd = RULES.party.switchCd;
    this.E.ev('equip', { uid, i });
    this.E.persist();
    return 'ok';
  }
  // kho: cất (Archive) / lấy ra (Take It)
  archive(uid) {
    const sv = this.save, i = sv.party.indexOf(uid);
    if (i < 0) return 'missing';
    if (uid === sv.active) return 'equipped';
    if (sv.party.length <= 1) return 'last';
    if (sv.storage.length >= STORAGE_MAX) return 'full';
    sv.party.splice(i, 1); sv.storage.push(uid);
    this.E.ev('archive', { uid }); this.E.persist(); return 'ok';
  }
  take(uid) {
    const sv = this.save, i = sv.storage.indexOf(uid);
    if (i < 0) return 'missing';
    if (sv.party.length >= PARTY_MAX) return 'full';
    sv.storage.splice(i, 1); sv.party.push(uid);
    this.E.ev('take', { uid }); this.E.persist(); return 'ok';
  }
  // Allen chữa: mọi slime trong túi hồi đầy (game gốc chữa "slime"; bản web chữa cả túi [ĐỀ XUẤT])
  healAll() { for (const r of this.partyRecs()) { r.hp = 1; r.mp = 1; r.stamina = 1; delete r.fainted; } }

  // ô HUD (SlimeQuickSlotLayout 6 ô)
  sync() {
    const sv = this.save, lim = this.accompanyLimit();
    const party = [];
    for (let i = 0; i < PARTY_MAX; i++) {
      const r = this.rec(sv.party[i]);
      party.push(r ? { id: r.typeId, uid: r.uid, name: displayName(r), level: r.level, hp: r.hp, mp: r.mp, st: r.stamina,
        exp: Math.min(1, r.exp / RULES.partner.expToNext(r.level)), fainted: !!r.fainted || r.hp <= 0, locked: i >= lim } : null);
    }
    const a = this.active();
    // nút Bách khoa (MenuHolder) bật khi đã bắt được slime đầu tiên (pilot inn1 chưa có nút, gmwall_hud_party_bar có) [ĐỀ XUẤT mốc]
    const showIndex = Object.values(sv.slimes).some(r => r.acquisition !== 'STARTER');
    set({ party, equipped: a ? sv.party.indexOf(a.uid) : null, quick: sv.quick.slice(), quickIcons: sv.quick.map(id => id != null ? itemIcon(id) : null), bag: { ...sv.items }, showIndex });
  }
}
