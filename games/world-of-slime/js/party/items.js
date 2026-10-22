// Vật phẩm theo bảng meta thật data/meta/item_type.json (đệm server): ảnh, số chồng tối đa, Usable (hồi chiêu, dùng trong túi,
// đặt ô nhanh), Cube. ItemQuickSlotPod Q/E/R = save.quick (SMLoginData.MaxQuickSlotCount = 3, CODE.md §6).
import { REV } from '../config.js?v=20261022d';
import { ITEM_ICON } from '../quest/data.js?v=20261022d';

let META = null, loading = null;
export function loadItems() {
  if (META) return Promise.resolve(META);
  if (!loading) loading = fetch(new URL('data/meta/item_type.json?v=' + REV, location.href).href).then(r => {
    if (!r.ok) throw new Error('item_type.json HTTP ' + r.status);
    return r.json();
  }).then(rows => {
    META = new Map();
    for (const r of rows) {
      const own = r.options.find(o => o.$type === 'Ownable'), use = r.options.find(o => o.$type === 'Usable');
      const cast = use && use.subOptions && use.subOptions[0] && use.subOptions[0].castType;
      META.set(r.id, { id: r.id, thumb: 'img/item/' + r.thumbnailResource + '.webp', model: r.modelResource, category: r.itemCategory, rare: r.rare,
        max: own ? own.slotMaxCount : 1, price: r.price,
        usable: use ? { cd: use.coolTimeMillis || 0, inInv: !!use.canUseInInventory, quick: !!use.canRegisterQuickSlot, consume: !!use.consume,
          cast: cast ? cast.$type : null, maxRange: cast && cast.maxRange || 0, sound: use.useSoundResource || '' } : null,
        cube: r.options.some(o => o.$type === 'Cube') });
    }
    return META;
  });
  return loading;
}
export const item = id => (META && META.get(+id)) || null;
// ảnh: ITEM_ICON của bản web (quầy, log) ưu tiên, không thì thumbnail của meta
export const itemIcon = id => ITEM_ICON[id] || (item(id) ? item(id).thumb : 'img/item/Item_Cube_1.webp');
// số ô túi đã dùng: mỗi chồng tối đa slotMaxCount (Bag n/28)
export function bagSlots(items) {
  let n = 0;
  for (const [id, c] of Object.entries(items || {})) if (c > 0) n += Math.ceil(c / ((item(id) || {}).max || 99));
  return n;
}
