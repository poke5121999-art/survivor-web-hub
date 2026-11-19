// The roster: the thirteen fighters of Blockade Z recast for an auto battle. Pure data read by sim/battle.js.
//
// attack.kind: 'melee' (arc in front, hits up to `cleave`), 'shot' (instant, single target), 'proj' (travels,
//   bursts with radius `aoe`), 'cone' (shotgun: everything in the cone shares the hit).
// A skill is { name, cd, when, ops }. `when` is the AI's cast condition; `ops` run in order at cast time.
// Damage numbers are multiples of the caster's attack; heal/shield numbers are fractions of max health.
//
// Op vocabulary (sim/battle.js OPS):
//   aoe    { at, r, dmg, status?, kb? }        burst at 'self' | 'target' | 'cluster'
//   cone   { r, deg, dmg, status? }            fan from the caster toward the target
//   line   { len, w, dmg, status? }            pierce in a line toward the target
//   dash   { to, dmg?, w? }                    move to 'target' | 'cluster' | 'weak' | 'away', hurting what it crosses
//   heal   { who, amt }                        'lowest' | 'all' | 'self'
//   shield { who, amt, dur }
//   buff   { who, dur, mods }                  timed mods (aspd, atk, dr, speed, lifesteal, crit, dmgMul, cleave)
//   state  { who, key, dur }                   invuln | stealth | taunt on allies
//   zone   { at, r, dur, every, dmg, status?, follow? }   lingering area
//   rain   { at, r, n, over, hitR, dmg, status? }         n delayed bursts scattered in r
//   bolts  { n, every, dmg, chain?, status?, pick }       repeated strikes on picked enemies
//   summon { kind, n, dur }
//   mark   { r, dur, amp, status? }            enemies in r take `amp` more damage
//   pull   { at, r, dmg, status? }
//   revive { hp }
// status: { k: 'stun' | 'freeze' | 'root' | 'slow' | 'burn' | 'poison' | 'bleed', dur, v? }

const st = (k, dur, v) => ({ k, dur, v });

export const HEROES = [
  {
    id: 'thep', name: 'Thép', title: 'Lá Chắn', rarity: 'R', role: 'tank', color: 0xffc040,
    hp: 1600, atk: 55, aspd: 0.9, speed: 4.6, taunt: 1,
    attack: { kind: 'melee', range: 2.5, deg: 110, cleave: 3, fx: 'slash_heavy' },
    s1: { name: 'Khiên Vàng', cd: 16, when: { hpBelow: 0.6 }, desc: 'Bất tử 3 giây và kéo quái về mình.',
      ops: [{ op: 'state', who: 'self', key: 'invuln', dur: 3 }, { op: 'state', who: 'self', key: 'taunt', dur: 4 }], fx: 'gold_shield' },
    s2: { name: 'Húc', cd: 9, when: { targetWithin: 9 }, desc: 'Lao tới mục tiêu, húc choáng mọi thứ trên đường.',
      ops: [{ op: 'dash', to: 'target', dmg: 1.5, w: 1.6, status: st('stun', 1) }], fx: 'charge' },
    ult: { name: 'Động Đất', cost: 1500, desc: 'Nện đất: sát thương lớn và choáng 2 giây trong 7 m.',
      ops: [{ op: 'aoe', at: 'self', r: 7, dmg: 4, status: st('stun', 2), kb: 2 }], fx: 'quake' },
  },
  {
    id: 'mua', name: 'Mưa Đạn', title: 'Xạ Thủ', rarity: 'R', role: 'ranged', color: 0xff7a30,
    hp: 850, atk: 22, aspd: 6, speed: 4.8,
    attack: { kind: 'shot', range: 10, fx: 'minigun' },
    s1: { name: 'Bão Đạn', cd: 14, when: { targetWithin: 10 }, desc: 'Tốc đánh +80% trong 5 giây.',
      ops: [{ op: 'buff', who: 'self', dur: 5, mods: { aspd: 0.8 } }], fx: 'overdrive' },
    s2: { name: 'Lựu Đạn Chùm', cd: 10, when: { crowd: 3, r: 3.5 }, desc: 'Ném lựu đạn nổ thành chùm bom con.',
      ops: [{ op: 'aoe', at: 'cluster', r: 3, dmg: 2.4, delay: 0.45 }, { op: 'rain', at: 'cluster', r: 3.5, n: 3, over: 0.5, hitR: 1.8, dmg: 1, delay: 0.7 }], fx: 'cluster' },
    ult: { name: 'Mưa Thép', cost: 1700, desc: 'Gọi hai súng vai tự bắn trong 7 giây.',
      ops: [{ op: 'summon', kind: 'drone', n: 2, dur: 7 }], fx: 'drones' },
  },
  {
    id: 'yta', name: 'Y Tá', title: 'Cứu Thương', rarity: 'R', role: 'healer', color: 0x60e070,
    hp: 800, atk: 38, aspd: 2.2, speed: 4.9,
    attack: { kind: 'shot', range: 9, fx: 'pistol' },
    s1: { name: 'Hồi Máu', cd: 8, when: { allyBelow: 0.7 }, desc: 'Hồi 20% máu cho đồng đội yếu nhất.',
      ops: [{ op: 'heal', who: 'lowest', amt: 0.2 }], fx: 'heal' },
    s2: { name: 'Phi Tiêu Độc', cd: 7, when: { targetWithin: 9 }, desc: 'Tiêm độc và làm chậm mục tiêu trâu nhất.',
      ops: [{ op: 'bolts', n: 1, every: 0, dmg: 0.8, pick: 'strong', status: st('poison', 5, 0.6) }, { op: 'bolts', n: 1, every: 0, dmg: 0, pick: 'strong', status: st('slow', 3, 0.4) }], fx: 'dart' },
    ult: { name: 'Hồi Sinh', cost: 1100, desc: 'Kéo người gục dậy, hồi 40% máu cả đội, giảm nửa sát thương 4 giây.',
      ops: [{ op: 'revive', hp: 0.5 }, { op: 'heal', who: 'all', amt: 0.4 }, { op: 'buff', who: 'all', dur: 4, mods: { dr: 0.5 } }], fx: 'revive' },
  },
  {
    id: 'gio', name: 'Gió', title: 'Kiếm Khách', rarity: 'R', role: 'melee', color: 0x56c8ff,
    hp: 900, atk: 70, aspd: 1.4, speed: 5.6,
    attack: { kind: 'melee', range: 2.3, deg: 100, cleave: 2, fx: 'slash' },
    s1: { name: 'Lướt', cd: 5, when: { targetWithin: 8 }, desc: 'Lướt xuyên qua mục tiêu, chém mọi thứ trên đường.',
      ops: [{ op: 'dash', to: 'through', dmg: 1.6, w: 1.4 }], fx: 'dash' },
    s2: { name: 'Lốc Xoáy', cd: 10, when: { crowd: 3, r: 3.5 }, desc: 'Lốc hất tung và làm choáng đám quái.',
      ops: [{ op: 'aoe', at: 'cluster', r: 3.5, dmg: 1.2, status: st('stun', 1.2), kb: 1 }], fx: 'gust' },
    ult: { name: 'Trảm Phong', cost: 1600, desc: 'Chém liền 10 nhát qua 10 con, bất tử khi chém.',
      ops: [{ op: 'state', who: 'self', key: 'invuln', dur: 1.6 }, { op: 'bolts', n: 10, every: 0.15, dmg: 2.2, pick: 'near', blink: true }], fx: 'blades' },
  },
  {
    id: 'phao', name: 'Pháo Thủ', title: 'Phá Huỷ', rarity: 'R', role: 'ranged', color: 0xff4a3a,
    hp: 820, atk: 95, aspd: 0.6, speed: 4.4,
    attack: { kind: 'proj', range: 11, aoe: 2.2, speed: 22, fx: 'rocket' },
    s1: { name: 'Không Kích', cd: 13, when: { crowd: 3, r: 4 }, desc: 'Gọi 5 quả bom rơi xuống đám quái.',
      ops: [{ op: 'rain', at: 'cluster', r: 4, n: 5, over: 1.2, hitR: 2.5, dmg: 1.5, delay: 0.8 }], fx: 'airstrike' },
    s2: { name: 'Mìn Dính', cd: 9, when: { targetWithin: 11 }, desc: 'Rải 3 quả mìn trước mặt quái.',
      ops: [{ op: 'rain', at: 'front', r: 3, n: 3, over: 0.3, hitR: 2.5, dmg: 2, delay: 1.4 }], fx: 'mines' },
    ult: { name: 'Mưa Pháo', cost: 1800, desc: '14 quả pháo dội xuống vùng 9 m.',
      ops: [{ op: 'rain', at: 'cluster', r: 9, n: 14, over: 4, hitR: 3, dmg: 2.2, delay: 0.6, seek: true }], fx: 'artillery' },
  },
  {
    id: 'bong', name: 'Bóng', title: 'Sát Thủ', rarity: 'SR', role: 'ranged', color: 0xb070ff,
    hp: 780, atk: 60, aspd: 1.6, speed: 5.4,
    attack: { kind: 'shot', range: 7, fx: 'shuriken' },
    s1: { name: 'Bước Bóng', cd: 9, when: { enemyWithin: 3.5 }, desc: 'Biến đi, để lại bóng mồi kéo quái 3 giây.',
      ops: [{ op: 'summon', kind: 'decoy', n: 1, dur: 3 }, { op: 'dash', to: 'away', dist: 7 }], fx: 'blink' },
    s2: { name: 'Phi Tiêu Xuyên', cd: 5, when: { targetWithin: 10 }, desc: 'Phi tiêu xuyên cả hàng quái.',
      ops: [{ op: 'line', len: 12, w: 1.2, dmg: 1.8 }], fx: 'pierce_star' },
    ult: { name: 'Ám Sát', cost: 1500, desc: 'Tàng hình 6 giây, sát thương gấp 2,5 và luôn chí mạng.',
      ops: [{ op: 'state', who: 'self', key: 'stealth', dur: 6 }, { op: 'buff', who: 'self', dur: 6, mods: { dmgMul: 1.5, crit: 1 } }], fx: 'vanish' },
  },
  {
    id: 'bang', name: 'Băng', title: 'Khống Chế', rarity: 'SR', role: 'melee', color: 0x8ae0ff,
    hp: 1000, atk: 58, aspd: 1.2, speed: 4.8,
    attack: { kind: 'melee', range: 3.4, deg: 40, cleave: 3, fx: 'thrust' },
    s1: { name: 'Sóng Băng', cd: 10, when: { crowd: 2, r: 5, self: true }, desc: 'Quạt băng đóng băng quái trước mặt 2 giây.',
      ops: [{ op: 'cone', r: 6, deg: 70, dmg: 1.2, status: st('freeze', 2) }], fx: 'ice_wave' },
    s2: { name: 'Mũi Băng Xuyên', cd: 7, when: { targetWithin: 10 }, desc: 'Mũi băng xuyên hàng, làm chậm 40%.',
      ops: [{ op: 'line', len: 12, w: 1.2, dmg: 2, status: st('slow', 3, 0.4) }], fx: 'ice_spike' },
    ult: { name: 'Kỷ Băng Hà', cost: 1600, desc: 'Bão tuyết 6 giây quanh mình: đóng băng rồi bào máu.',
      ops: [{ op: 'aoe', at: 'self', r: 9, dmg: 1, status: st('freeze', 2.5) }, { op: 'zone', at: 'self', follow: true, r: 9, dur: 6, every: 0.5, dmg: 0.5, status: st('slow', 1, 0.4) }], fx: 'blizzard' },
  },
  {
    id: 'hoa', name: 'Hoả', title: 'Đấu Sĩ', rarity: 'SR', role: 'melee', color: 0xff6a20,
    hp: 1250, atk: 48, aspd: 2.2, speed: 5, dr: 0.25,
    attack: { kind: 'melee', range: 1.9, deg: 90, cleave: 2, fx: 'punch', status: st('burn', 2, 0.25) },
    s1: { name: 'Bom Xăng', cd: 9, when: { crowd: 3, r: 3.5 }, desc: 'Biển lửa 5 giây dưới chân đám quái.',
      ops: [{ op: 'zone', at: 'cluster', r: 3, dur: 5, every: 0.5, dmg: 0.4, status: st('burn', 2, 0.25), delay: 0.4 }], fx: 'molotov' },
    s2: { name: 'Phản Lực', cd: 10, when: { crowd: 2, r: 3.5 }, desc: 'Nhảy vào giữa đám quái và nổ.',
      ops: [{ op: 'dash', to: 'cluster', jump: true }, { op: 'aoe', at: 'self', r: 3.5, dmg: 2, status: st('burn', 3, 0.25), kb: 1.5 }], fx: 'rocket_jump' },
    ult: { name: 'Hoả Long', cost: 1500, desc: 'Phun lửa 5 giây thành quạt dài 9 m.',
      ops: [{ op: 'zone', at: 'self', follow: true, cone: 55, r: 9, dur: 5, every: 0.25, dmg: 0.9, status: st('burn', 3, 0.25) }], fx: 'dragon_breath' },
  },
  {
    id: 'doc', name: 'Độc', title: 'Dịch Bệnh', rarity: 'SR', role: 'melee', color: 0x9adf3a,
    hp: 950, atk: 62, aspd: 1.1, speed: 4.8,
    attack: { kind: 'melee', range: 3.2, deg: 140, cleave: 4, fx: 'glaive', status: st('poison', 3, 0.3) },
    s1: { name: 'Mây Độc', cd: 10, when: { crowd: 3, r: 4 }, desc: 'Mây độc 6 giây: bào máu và làm chậm.',
      ops: [{ op: 'zone', at: 'cluster', r: 4, dur: 6, every: 0.5, dmg: 0.35, status: st('slow', 1, 0.3) }], fx: 'poison_cloud' },
    s2: { name: 'Hút Sinh', cd: 8, when: { hpBelow: 0.8 }, desc: 'Hút máu mục tiêu về mình.',
      ops: [{ op: 'bolts', n: 1, every: 0, dmg: 2, pick: 'target', drain: 1 }], fx: 'drain' },
    ult: { name: 'Đại Dịch', cost: 1500, desc: 'Mọi quái trong 12 m nhiễm độc 8 giây và nhận thêm 20% sát thương.',
      ops: [{ op: 'mark', r: 12, dur: 8, amp: 0.2, status: st('poison', 8, 0.5) }], fx: 'plague' },
  },
  {
    id: 'ky', name: 'Kỹ Sư', title: 'Chế Tạo', rarity: 'SR', role: 'ranged', color: 0xf0d040,
    hp: 950, atk: 85, aspd: 0.9, speed: 4.6,
    attack: { kind: 'cone', range: 6, deg: 36, fx: 'shotgun' },
    s1: { name: 'Dựng Tháp', cd: 11, when: { targetWithin: 12 }, desc: 'Dựng tháp súng bắn 12 giây.',
      ops: [{ op: 'summon', kind: 'turret', n: 1, dur: 12 }], fx: 'turret' },
    s2: { name: 'Giáp Khẩn', cd: 14, when: { allyBelow: 0.75 }, desc: 'Cả đội nhận khiên 15% máu trong 5 giây.',
      ops: [{ op: 'shield', who: 'all', amt: 0.15, dur: 5 }], fx: 'armor_up' },
    ult: { name: 'Pháo Đài', cost: 1600, desc: 'Dựng khẩu pháo bắn tên lửa 12 giây.',
      ops: [{ op: 'summon', kind: 'cannon', n: 1, dur: 12 }], fx: 'fortress' },
  },
  {
    id: 'sam', name: 'Sấm', title: 'Lôi Thần', rarity: 'SSR', role: 'ranged', color: 0xfff060,
    hp: 860, atk: 80, aspd: 1, speed: 4.8,
    attack: { kind: 'shot', range: 9, chain: 2, fx: 'javelin' },
    s1: { name: 'Cầu Sét', cd: 9, when: { targetWithin: 10 }, desc: 'Cầu sét trôi chậm, giật mọi thứ nó đi qua.',
      ops: [{ op: 'zone', at: 'self', drift: 5, r: 2.5, dur: 2.4, every: 0.3, dmg: 0.5 }], fx: 'ball_lightning' },
    s2: { name: 'Lôi Phạt', cd: 8, when: { targetWithin: 12 }, desc: 'Sét đánh con trâu nhất, choáng 1,5 giây.',
      ops: [{ op: 'bolts', n: 1, every: 0, dmg: 4, pick: 'strong', status: st('stun', 1.5) }], fx: 'smite' },
    ult: { name: 'Thiên Lôi', cost: 1700, desc: 'Bão sét 6 giây: sét liên tục giáng và nảy sang 2 con.',
      ops: [{ op: 'bolts', n: 20, every: 0.3, dmg: 1.6, pick: 'random', chain: 2 }], fx: 'thunder' },
  },
  {
    id: 'soi', name: 'Sói', title: 'Thợ Săn', rarity: 'SSR', role: 'melee', color: 0xc08a50,
    hp: 1150, atk: 66, aspd: 1.5, speed: 5.4, lifesteal: 0.08,
    attack: { kind: 'melee', range: 2.1, deg: 100, cleave: 2, fx: 'hatchet' },
    s1: { name: 'Vồ Cắn', cd: 6, when: { targetWithin: 9 }, desc: 'Vồ con yếu nhất, cắn chảy máu.',
      ops: [{ op: 'dash', to: 'weak', jump: true }, { op: 'bolts', n: 1, every: 0, dmg: 2.2, pick: 'weak', status: st('bleed', 4, 0.4) }], fx: 'pounce' },
    s2: { name: 'Tru Gọi Bầy', cd: 15, when: { targetWithin: 12 }, desc: 'Gọi 2 con sói chiến đấu 10 giây.',
      ops: [{ op: 'summon', kind: 'wolf', n: 2, dur: 10 }], fx: 'howl' },
    ult: { name: 'Hoá Sói', cost: 1500, desc: '10 giây hoá người sói: nhanh, trâu, hút máu, chém lan.',
      ops: [{ op: 'buff', who: 'self', dur: 10, mods: { aspd: 0.6, speed: 0.35, dr: 0.4, lifesteal: 0.2, cleave: 3 } }], fx: 'werewolf' },
  },
  {
    id: 'nhen', name: 'Nhện Đồng', title: 'Giăng Bẫy', rarity: 'SSR', role: 'ranged', color: 0xd88a4a,
    hp: 820, atk: 74, aspd: 1.3, speed: 5,
    attack: { kind: 'shot', range: 10, fx: 'webbow', status: st('slow', 1.5, 0.2) },
    s1: { name: 'Đu Tơ', cd: 8, when: { enemyWithin: 3.5 }, desc: 'Đu ra xa, 4 giây sau đó bắn mạnh gấp rưỡi.',
      ops: [{ op: 'dash', to: 'away', dist: 8, jump: true }, { op: 'buff', who: 'self', dur: 4, mods: { dmgMul: 0.5 } }], fx: 'swing' },
    s2: { name: 'Kéo Tơ', cd: 10, when: { crowd: 3, r: 5 }, desc: 'Kéo đám quái chụm lại và trói 1,5 giây.',
      ops: [{ op: 'pull', at: 'cluster', r: 5, dmg: 1, status: st('root', 1.5) }], fx: 'web_pull' },
    ult: { name: 'Lưới Tơ Khổng Lồ', cost: 1600, desc: 'Trói mọi quái trong 10 m 3,5 giây, chúng nhận thêm 25% sát thương.',
      ops: [{ op: 'aoe', at: 'cluster', r: 10, dmg: 3, status: st('root', 3.5) }, { op: 'mark', at: 'cluster', r: 10, dur: 5, amp: 0.25 }], fx: 'web_net' },
  },
];

export const HERO = Object.fromEntries(HEROES.map((h) => [h.id, h]));

// things heroes put on the field; they fight on the heroes' side and cannot be healed or carry cards
export const SUMMONS = {
  drone: { hp: 1, untargetable: true, follow: true, atk: 0.5, aspd: 8, range: 11, kind: 'shot', fx: 'minigun' },
  turret: { hp: 0.5, still: true, atk: 0.5, aspd: 3, range: 9, kind: 'shot', fx: 'turret_shot' },
  cannon: { hp: 1, still: true, atk: 2.5, aspd: 1.25, range: 13, kind: 'proj', aoe: 2.5, speed: 20, fx: 'rocket' },
  wolf: { hp: 0.3, atk: 0.5, aspd: 1.6, range: 1.6, kind: 'melee', speed: 6.5, fx: 'bite' },
  decoy: { hp: 0.6, still: true, taunt: 3, atk: 0, aspd: 0, range: 0, kind: 'none' },
};
