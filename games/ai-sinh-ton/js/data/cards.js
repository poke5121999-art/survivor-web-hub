// Upgrade cards: after waves 1-4 every hero is offered three and keeps one until the stage ends.
// rar: 0 Thường (60%), 1 Hiếm (30%), 2 Sử Thi (10%). `max` caps how often one hero can take the card.
// `hero` limits a card to one hero; s1Dmg / s2Dmg / ultDmg scale that skill (damage, heal, shield, summon time).
import { HEROES } from './heroes.js?v=20261122a';

const GENERIC = [
  { id: 'atk1', name: 'Mài Vũ Khí', desc: 'Công +15%', rar: 0, mods: { atk: 0.15 }, icon: 'atk' },
  { id: 'hp1', name: 'Bữa No', desc: 'Máu +20%', rar: 0, mods: { hp: 0.2 }, icon: 'hp' },
  { id: 'aspd1', name: 'Tay Nhanh', desc: 'Tốc đánh +12%', rar: 0, mods: { aspd: 0.12 }, icon: 'aspd' },
  { id: 'spd1', name: 'Giày Nhẹ', desc: 'Tốc chạy +12%', rar: 0, mods: { speed: 0.12 }, max: 2, icon: 'speed' },
  { id: 'crit1', name: 'Mắt Tinh', desc: 'Chí mạng +10%', rar: 0, mods: { crit: 0.1 }, icon: 'crit' },
  { id: 'cdr1', name: 'Thuần Thục', desc: 'Hồi chiêu nhanh hơn 10%', rar: 0, mods: { cdr: 0.1 }, max: 3, icon: 'cdr' },
  { id: 'ult1', name: 'Máu Nóng', desc: 'Nạp tối thượng +20%', rar: 0, mods: { ultRate: 0.2 }, icon: 'ult' },
  { id: 'dr1', name: 'Da Dày', desc: 'Giảm 8% sát thương nhận', rar: 0, mods: { dr: 0.08 }, max: 3, icon: 'dr' },
  { id: 'atk2', name: 'Lõi Thép', desc: 'Công +28%', rar: 1, mods: { atk: 0.28 }, icon: 'atk' },
  { id: 'hp2', name: 'Thể Lực Trâu', desc: 'Máu +35%', rar: 1, mods: { hp: 0.35 }, icon: 'hp' },
  { id: 'ls1', name: 'Khát Máu', desc: 'Hút máu 6%', rar: 1, mods: { lifesteal: 0.06 }, max: 2, icon: 'lifesteal' },
  { id: 'regen1', name: 'Tự Lành', desc: 'Hồi 1,2% máu mỗi giây', rar: 1, mods: { regen: 0.012 }, max: 2, icon: 'regen' },
  { id: 'burn', name: 'Đạn Lửa', desc: 'Đòn thường đốt cháy 3 giây', rar: 1, mods: { burnHit: 0.3 }, max: 2, icon: 'burn' },
  { id: 'poison', name: 'Tẩm Độc', desc: 'Đòn thường gây độc 4 giây', rar: 1, mods: { poisonHit: 0.25 }, max: 2, icon: 'poison' },
  { id: 'slow', name: 'Đạn Lạnh', desc: 'Đòn thường làm chậm 25%', rar: 1, mods: { slowHit: 0.25 }, max: 1, icon: 'slow' },
  { id: 'aoe', name: 'Thuốc Nổ Thừa', desc: 'Vùng nổ của chiêu rộng hơn 20%', rar: 1, mods: { aoe: 0.2 }, max: 2, icon: 'aoe' },
  { id: 'shield', name: 'Khiên Đầu Đợt', desc: 'Đầu mỗi đợt nhận khiên 20% máu', rar: 1, mods: { shieldWave: 0.2 }, max: 2, icon: 'shield' },
  { id: 'chain', name: 'Dây Điện Hở', desc: '20% đòn đánh nảy sét sang 2 quái', rar: 2, mods: { chain: 0.2 }, max: 2, icon: 'chain' },
  { id: 'boom', name: 'Xác Nổ', desc: 'Quái bị hạ sẽ nổ, gây 80% công quanh nó', rar: 2, mods: { explodeKill: 0.8 }, max: 2, icon: 'boom' },
  { id: 'exec', name: 'Kết Liễu', desc: 'Hạ ngay quái thường dưới 15% máu', rar: 2, mods: { execute: 0.15 }, max: 1, icon: 'exec' },
  { id: 'ultfull', name: 'Bùng Nổ', desc: 'Nhận ngay 60% tối thượng, nạp +15%', rar: 2, mods: { ultStart: 0.6, ultRate: 0.15 }, icon: 'ult' },
  { id: 'berserk', name: 'Cuồng Chiến', desc: 'Công +40%, tốc đánh +15%', rar: 2, mods: { atk: 0.4, aspd: 0.15 }, icon: 'atk' },
  { id: 'titan', name: 'Khổng Lồ Hoá', desc: 'Máu +60%, giảm 10% sát thương nhận', rar: 2, mods: { hp: 0.6, dr: 0.1 }, max: 1, icon: 'hp' },
];

// three cards of its own for every hero: stronger first skill, stronger second skill, stronger ultimate
const OWN = HEROES.flatMap((h) => [
  { id: h.id + '_s1', hero: h.id, name: h.s1.name + ' +', desc: `${h.s1.name}: mạnh hơn 40%, hồi nhanh hơn 20%`, rar: 1, mods: { s1Dmg: 0.4, s1Cd: 0.2 }, max: 2, icon: 's1' },
  { id: h.id + '_s2', hero: h.id, name: h.s2.name + ' +', desc: `${h.s2.name}: mạnh hơn 40%, hồi nhanh hơn 20%`, rar: 1, mods: { s2Dmg: 0.4, s2Cd: 0.2 }, max: 2, icon: 's2' },
  { id: h.id + '_ult', hero: h.id, name: h.ult.name + ' +', desc: `${h.ult.name}: mạnh hơn 50%`, rar: 2, mods: { ultDmg: 0.5 }, max: 2, icon: 'ult' },
]);

export const CARDS = [...GENERIC, ...OWN];
export const CARD = Object.fromEntries(CARDS.map((c) => [c.id, c]));
export const CARD_RARITY = [{ name: 'Thường', p: 0.6, color: 0x8fa3b8 }, { name: 'Hiếm', p: 0.3, color: 0x4aa8ff }, { name: 'Sử Thi', p: 0.1, color: 0xb46cff }];

// three different cards for hero unit `u` (reads u.kind and u.cards)
export function offerCards(u, rng) {
  const have = {};
  for (const id of u.cards) have[id] = (have[id] || 0) + 1;
  const ok = CARDS.filter((c) => (!c.hero || c.hero === u.kind) && (have[c.id] || 0) < (c.max || 99));
  const out = [];
  for (let k = 0; k < 3; k++) {
    const x = rng(); const rar = x < 0.6 ? 0 : x < 0.9 ? 1 : 2;
    let pool = ok.filter((c) => c.rar === rar && !out.includes(c.id));
    if (!pool.length) pool = ok.filter((c) => !out.includes(c.id));
    // a hero's own cards come up twice as often as a generic one
    const w = pool.map((c) => (c.hero ? 2 : 1)); let y = rng() * w.reduce((a, b) => a + b, 0); let pickd = pool[pool.length - 1];
    for (let i = 0; i < pool.length; i++) { y -= w[i]; if (y < 0) { pickd = pool[i]; break; } }
    out.push(pickd.id);
  }
  return out;
}
