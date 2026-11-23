// The roster: fourteen beasts of the Guard (SCOPE section 3). Pure data read by sim/battle.js through beasts.js heroDef().
// Each entry is the beast at form 1 and keeps the exact skill numbers of the human hero it replaced (`was`), so the
// balance of an unevolved team is the old one. `forms[1]` and `forms[2]` are forms 2 and 3 (form 3 may branch a / b).
//
// attack.kind: 'melee' (arc in front, hits up to `cleave`), 'shot' (instant, single target), 'proj' (travels,
//   bursts with radius `aoe`), 'cone' (shotgun: everything in the cone shares the hit).
// A skill is { name, cd, when, ops }. `when` is the AI's cast condition; `ops` run in order at cast time.
// Damage numbers are multiples of the caster's attack; heal/shield numbers are fractions of max health.
//
// Op vocabulary (sim/battle.js OPS):
//   aoe    { at, r, dmg, status?, kb? }        burst at 'self' | 'target' | 'cluster' | 'random'
//   cone   { r, deg, dmg, status? }            fan from the caster toward the target
//   line   { len, w, dmg, status?, n?, fan? }  pierce in a line toward the target; n lines spread over `fan` degrees
//   dash   { to, dmg?, w?, trail?, times?, kb? }  move to 'target' | 'cluster' | 'weak' | 'away' | 'through'; `trail`
//                                              leaves a cutting zone along the path, `times` chains to the next foes
//   heal   { who, amt, n? }                    'lowest' (n lowest) | 'all' | 'self'
//   shield { who, amt, dur }
//   buff   { who, dur, mods }                  timed mods (aspd, atk, dr, speed, lifesteal, crit, dmgMul, cleave)
//   state  { who, key, dur }                   invuln | stealth | taunt on allies
//   zone   { at, r, dur, every, dmg, status?, follow?, n?, scatter?, suck?, ink? }   lingering area(s); `suck` drags
//                                              foes to the centre, `ink` marks them (Mực's passive)
//   rain   { at, r, n, over, hitR, dmg, status?, pool?, healAlly? }   n delayed bursts; `pool` leaves a zone each
//   bolts  { n, every, dmg, chain?, status?, pick, aoe?, drainTeam? }  repeated strikes on picked enemies
//   summon { kind, n, dur }
//   mark   { r, dur, amp, status? }            enemies in r take `amp` more damage
//   pull   { at, r, dmg, status?, n? }         n separate clusters
//   revive { hp }
// status: { k: 'stun' | 'freeze' | 'root' | 'slow' | 'burn' | 'poison' | 'bleed' | 'blind', dur, v? }
//
// move: { kind, ...params } per SCOPE section 5 (sim/move.js). passive: { name, desc, mods?, hook?, ...params }:
// mods are added to the unit's permanent mods; a hook names a behaviour in battle.js PASSIVE_HOOKS.

const st = (k, dur, v) => ({ k, dur, v });
const P = (name, desc, o = {}) => ({ name, desc, ...o });

export const ELEMENTS = {
  dat: { name: 'Đất', color: 0xc89a5a }, lua: { name: 'Lửa', color: 0xff6a2a }, bang: { name: 'Băng', color: 0x8ae0ff },
  gio: { name: 'Gió', color: 0x7af0c0 }, set: { name: 'Sét', color: 0xfff060 }, moc: { name: 'Mộc', color: 0x7ad04a },
};

export const HEROES = [
  {
    id: 'tegiap', was: 'thep', name: 'Tê Giáp', title: 'Lá Chắn', rarity: 'R', role: 'tank', cls: 'tank', family: 'quad', element: 'dat', color: 0xffc040,
    hp: 1600, atk: 55, aspd: 0.9, speed: 4.6, taunt: 1,
    attack: { kind: 'melee', range: 2.5, deg: 110, cleave: 3, fx: 'slash_heavy' },
    s1: { name: 'Giáp Đá', cd: 16, when: { hpBelow: 0.6 }, desc: 'Bất tử 3 giây và kéo quái về mình.',
      ops: [{ op: 'state', who: 'self', key: 'invuln', dur: 3 }, { op: 'state', who: 'self', key: 'taunt', dur: 4 }], fx: 'gold_shield' },
    s2: { name: 'Húc', cd: 9, when: { targetWithin: 9 }, desc: 'Lao tới mục tiêu, húc choáng mọi thứ trên đường.',
      ops: [{ op: 'dash', to: 'target', dmg: 1.5, w: 1.6, status: st('stun', 1) }], fx: 'charge' },
    ult: { name: 'Động Đất', cost: 1500, desc: 'Nện đất: sát thương lớn và choáng 2 giây trong 7 m.',
      ops: [{ op: 'aoe', at: 'self', r: 7, dmg: 4, status: st('stun', 2), kb: 2 }], fx: 'quake' },
    move: { kind: 'walk' },
    passive: P('Da Đá', 'Giảm 10% sát thương nhận.', { mods: { dr: 0.1 } }),
    forms: [{}, {
      name: 'Tê Thành Lũy', mul: 1.25, move: { kind: 'gallop' },
      passive: P('Phản Chấn', 'Khi Giáp Đá hết, 30% sát thương đã đỡ thành sóng đánh quái quanh 4 m.', { hook: 'reflect', k: 0.3, r: 4 }),
      patch: { s2: { name: 'Húc Nứt Đất', desc: 'Lao tới mục tiêu, để lại vệt nứt làm choáng quái hai bên đường.',
        ops: [{ op: 'dash', to: 'target', dmg: 1.5, w: 1.6, status: st('stun', 1), trail: { w: 3.4, dur: 0.6, every: 0.3, dmg: 0.4, status: st('stun', 0.8) } }] } },
    }, { branches: {
      a: { name: 'Pháo Đài Rêu', mul: 1.6, move: { kind: 'stomp', r: 2, slow: 0.3 },
        passive: P('Thành Rêu', 'Đồng đội đứng trong 4 m quanh nó giảm 15% sát thương nhận.', { hook: 'aura', r: 4, dr: 0.15 }),
        patch: { ult: { name: 'Đứt Gãy Ba Đường', desc: 'Nện đất: choáng 2 giây trong 7 m, ba đường đứt gãy toả ra đánh tiếp.',
          ops: [{ op: 'aoe', at: 'self', r: 7, dmg: 4, status: st('stun', 2), kb: 2 }, { op: 'line', len: 11, w: 1.8, dmg: 2.2, n: 3, fan: 360, status: st('stun', 1), delay: 0.35 }] } } },
      b: { name: 'Tê Cầu Gai', mul: 1.6, move: { kind: 'roll', kb: 1.6, dmg: 0.6 },
        passive: P('Gai Hồi Sức', 'Mỗi quái bị nó húc văng hồi cho nó 1% máu.', { hook: 'kbHeal', amt: 0.01 }),
        patch: { s2: { name: 'Lăn Ba Vòng', desc: 'Cuộn thành cầu gai lăn liền 3 lần qua 3 mục tiêu, húc văng và choáng.',
          ops: [{ op: 'dash', to: 'target', dmg: 1.5, w: 1.8, status: st('stun', 1), kb: 1.5, times: 3 }] } } },
    } }],
  },
  {
    id: 'nhim', was: 'mua', name: 'Nhím Gai', title: 'Xạ Thủ', rarity: 'R', role: 'ranged', cls: 'ranged', family: 'quad', element: 'bang', color: 0xff7a30,
    hp: 850, atk: 22, aspd: 6, speed: 4.8,
    attack: { kind: 'shot', range: 10, fx: 'minigun' },
    s1: { name: 'Bão Gai', cd: 14, when: { targetWithin: 10 }, desc: 'Tốc bắn gai +80% trong 5 giây.',
      ops: [{ op: 'buff', who: 'self', dur: 5, mods: { aspd: 0.8 } }], fx: 'overdrive' },
    s2: { name: 'Chùm Gai', cd: 10, when: { crowd: 3, r: 3.5 }, desc: 'Ném chùm gai nổ thành mưa gai con.',
      ops: [{ op: 'aoe', at: 'cluster', r: 3, dmg: 2.4, delay: 0.45 }, { op: 'rain', at: 'cluster', r: 3.5, n: 3, over: 0.5, hitR: 1.8, dmg: 1, delay: 0.7 }], fx: 'cluster' },
    ult: { name: 'Mưa Kim', cost: 1700, desc: 'Gọi hai bụi kim bay quanh mình tự bắn trong 7 giây.',
      ops: [{ op: 'summon', kind: 'drone', n: 2, dur: 7 }], fx: 'drones' },
    move: { kind: 'hop' },
    passive: P('Gai Thừa', 'Đòn thường có 10% bắn thêm 1 gai vào quái khác.', { mods: { extraShot: 0.1 } }),
    forms: [{}, {
      name: 'Nhím Gai Lửa', mul: 1.25, move: { kind: 'walk' },
      passive: P('Gai Xuyên', 'Gai xuyên thêm 1 mục tiêu phía sau.', { mods: { pierce: 1 } }),
      patch: { s2: { name: 'Chùm Gai Lửa', desc: 'Chùm gai nổ thành mưa gai, để lại vệt cháy 4 giây.',
        ops: [{ op: 'aoe', at: 'cluster', r: 3, dmg: 2.4, delay: 0.45 }, { op: 'rain', at: 'cluster', r: 3.5, n: 3, over: 0.5, hitR: 1.8, dmg: 1, delay: 0.7, pool: { r: 1.6, dur: 4, every: 0.5, dmg: 0.25, status: st('burn', 2, 0.25) } }] } },
    }, {
      name: 'Nhím Vành Kim', mul: 1.6, move: { kind: 'glide' },
      passive: P('Vành Tự Bắn', 'Mỗi 5 giây vành kim tự bắn một loạt 5 gai vào quái gần nhất.', { hook: 'volley', every: 5, n: 5, dmg: 0.8 }),
      patch: { ult: { name: 'Vòng Kim Xoay', desc: 'Hai bụi kim bay quanh mình 7 giây, kèm vòng gai xoay bắn ra 360°.',
        ops: [{ op: 'summon', kind: 'drone', n: 2, dur: 7 }, { op: 'line', len: 10, w: 1, dmg: 2.5, n: 12, fan: 360 }, { op: 'line', len: 10, w: 1, dmg: 2.5, n: 12, fan: 360, delay: 1.2 }] } },
    }],
  },
  {
    id: 'loc', was: 'yta', name: 'Lộc Đèn', title: 'Cứu Thương', rarity: 'R', role: 'healer', cls: 'healer', family: 'quad', element: 'moc', color: 0x60e070,
    hp: 800, atk: 38, aspd: 2.2, speed: 4.9,
    attack: { kind: 'shot', range: 9, fx: 'pistol' },
    s1: { name: 'Ánh Đèn', cd: 8, when: { allyBelow: 0.7 }, desc: 'Hồi 20% máu cho đồng đội yếu nhất.',
      ops: [{ op: 'heal', who: 'lowest', amt: 0.2 }], fx: 'heal' },
    s2: { name: 'Gai Gạc', cd: 7, when: { targetWithin: 9 }, desc: 'Phóng gai gạc tẩm độc, làm chậm mục tiêu trâu nhất.',
      ops: [{ op: 'bolts', n: 1, every: 0, dmg: 0.8, pick: 'strong', status: st('poison', 5, 0.6) }, { op: 'bolts', n: 1, every: 0, dmg: 0, pick: 'strong', status: st('slow', 3, 0.4) }], fx: 'dart' },
    ult: { name: 'Đêm Hội Đèn', cost: 1100, desc: 'Kéo người gục dậy, hồi 40% máu cả đội, giảm nửa sát thương 4 giây.',
      ops: [{ op: 'revive', hp: 0.5 }, { op: 'heal', who: 'all', amt: 0.4 }, { op: 'buff', who: 'all', dur: 4, mods: { dr: 0.5 } }], fx: 'revive' },
    move: { kind: 'walk' },
    passive: P('Đèn Ấm', 'Hồi máu mạnh hơn 10%.', { mods: { healPow: 0.1 } }),
    forms: [{}, {
      name: 'Lộc Đèn Lồng', mul: 1.25, move: { kind: 'gallop' },
      passive: P('Lồng Đèn Che', 'Đồng đội được nó hồi máu nhận thêm khiên 5% máu.', { mods: { healShield: 0.05 } }),
      patch: { s1: { name: 'Ánh Đèn Lồng', desc: 'Hồi 20% máu cho 3 đồng đội yếu nhất.', ops: [{ op: 'heal', who: 'lowest', amt: 0.2, n: 3 }] } },
    }, { branches: {
      a: { name: 'Linh Lộc Thiên Đăng', mul: 1.6, move: { kind: 'swimAir' },
        passive: P('Đèn Giữ Hồn', 'Đồng đội gục lần đầu mỗi đợt đứng dậy với 30% máu.', { hook: 'guardian', hp: 0.3 }),
        patch: { ult: { name: 'Mưa Đèn Trời', desc: 'Kéo người gục dậy, hồi 40% máu cả đội, rồi thả 10 đèn trời rơi xuống hồi máu và đốt quái.',
          ops: [{ op: 'revive', hp: 0.5 }, { op: 'heal', who: 'all', amt: 0.4 }, { op: 'buff', who: 'all', dur: 4, mods: { dr: 0.5 } }, { op: 'rain', at: 'cluster', r: 7, n: 10, over: 3, hitR: 2.4, dmg: 1.2, delay: 0.5, healAlly: 0.05, status: st('burn', 3, 0.3) }] } } },
      b: { name: 'Lộc Rừng Đêm', mul: 1.6, move: { kind: 'blink', to: 'weakAlly' },
        passive: P('Gạc Hút Hồn', '20% sát thương nó gây ra thành máu cho đồng đội thấp máu nhất.', { mods: { teamDrain: 0.2 } }),
        patch: { s2: { name: 'Gai Gạc Hút Máu', desc: 'Ba gai gạc đen hút máu quái, chia máu cho đồng đội yếu nhất.',
          ops: [{ op: 'bolts', n: 3, every: 0.15, dmg: 1, pick: 'strong', status: st('poison', 5, 0.6), drain: 1, drainTeam: true }, { op: 'bolts', n: 1, every: 0, dmg: 0, pick: 'strong', status: st('slow', 3, 0.4) }] } } },
    } }],
  },
  {
    id: 'chon', was: 'gio', name: 'Chồn Gió', title: 'Kiếm Khách', rarity: 'R', role: 'melee', cls: 'melee', family: 'quad', element: 'gio', color: 0x56c8ff,
    hp: 900, atk: 70, aspd: 1.4, speed: 5.6,
    attack: { kind: 'melee', range: 2.3, deg: 100, cleave: 2, fx: 'slash' },
    s1: { name: 'Lướt', cd: 5, when: { targetWithin: 8 }, desc: 'Lướt xuyên qua mục tiêu, cắt mọi thứ trên đường.',
      ops: [{ op: 'dash', to: 'through', dmg: 1.6, w: 1.4 }], fx: 'dash' },
    s2: { name: 'Lốc Xoáy', cd: 10, when: { crowd: 3, r: 3.5 }, desc: 'Lốc hất tung và làm choáng đám quái.',
      ops: [{ op: 'aoe', at: 'cluster', r: 3.5, dmg: 1.2, status: st('stun', 1.2), kb: 1 }], fx: 'gust' },
    ult: { name: 'Nghìn Lưỡi Gió', cost: 1600, desc: 'Cắt liền 10 nhát qua 10 con, bất tử khi cắt.',
      ops: [{ op: 'state', who: 'self', key: 'invuln', dur: 1.6 }, { op: 'bolts', n: 10, every: 0.15, dmg: 2.2, pick: 'near', blink: true }], fx: 'blades' },
    move: { kind: 'gallop' },
    passive: P('Chân Gió', 'Tốc chạy +10%.', { mods: { speed: 0.1 } }),
    forms: [{}, {
      name: 'Chồn Liềm', mul: 1.25, move: { kind: 'gallop', bonus: 0.25 },
      passive: P('Liềm Sắc', 'Chí mạng +10%.', { mods: { crit: 0.1 } }),
      patch: { s1: { name: 'Lướt Liềm', desc: 'Lướt xuyên qua mục tiêu, để lại lưỡi gió cắt trên đường 1 giây.',
        ops: [{ op: 'dash', to: 'through', dmg: 1.6, w: 1.4, trail: { w: 1.6, dur: 1, every: 0.25, dmg: 0.35 } }] } },
    }, {
      name: 'Phong Chồn Tam Vĩ', mul: 1.6, move: { kind: 'blink' },
      passive: P('Đòn Sau Gió', 'Mỗi lần dịch chuyển, nhát đánh kế chắc chắn chí mạng.', { hook: 'blinkCrit' }),
      patch: { ult: { name: 'Nghìn Lưỡi Lốc', desc: 'Cắt liền 10 nhát qua 10 con, bất tử khi cắt, để lại 3 cột lốc cuốn quái.',
        ops: [{ op: 'state', who: 'self', key: 'invuln', dur: 1.6 }, { op: 'bolts', n: 10, every: 0.15, dmg: 2.2, pick: 'near', blink: true }, { op: 'zone', at: 'cluster', n: 3, scatter: 3, r: 2, dur: 4, every: 0.4, dmg: 0.5, suck: 1.2, status: st('slow', 1, 0.3), delay: 1.6 }] } },
    }],
  },
  {
    id: 'ech', was: 'phao', name: 'Ếch Pháo', title: 'Phá Huỷ', rarity: 'R', role: 'ranged', cls: 'ranged', family: 'amphib', element: 'lua', color: 0xff4a3a,
    hp: 820, atk: 95, aspd: 0.6, speed: 4.4,
    attack: { kind: 'proj', range: 11, aoe: 2.2, speed: 22, fx: 'rocket' },
    s1: { name: 'Mưa Trứng Nổ', cd: 13, when: { crowd: 3, r: 4 }, desc: 'Phun 5 trứng nổ rơi xuống đám quái.',
      ops: [{ op: 'rain', at: 'cluster', r: 4, n: 5, over: 1.2, hitR: 2.5, dmg: 1.5, delay: 0.8 }], fx: 'airstrike' },
    s2: { name: 'Trứng Dính', cd: 9, when: { targetWithin: 11 }, desc: 'Rải 3 trứng dính nổ chậm trước mặt quái.',
      ops: [{ op: 'rain', at: 'front', r: 3, n: 3, over: 0.3, hitR: 2.5, dmg: 2, delay: 1.4 }], fx: 'mines' },
    ult: { name: 'Mưa Pháo', cost: 1800, desc: '14 quả pháo dội xuống vùng 9 m.',
      ops: [{ op: 'rain', at: 'cluster', r: 9, n: 14, over: 4, hitR: 3, dmg: 2.2, delay: 0.6, seek: true }], fx: 'artillery' },
    move: { kind: 'hop' },
    passive: P('Túi Nổ', 'Vùng nổ rộng hơn 10%.', { mods: { aoe: 0.1 } }),
    forms: [{}, {
      name: 'Ếch Thần Công', mul: 1.25, move: { kind: 'leap', dmg: 1.2, r: 2.5 },
      passive: P('Nòng Giật', 'Đòn đánh đẩy lùi quái.', { mods: { kbHit: 0.8 } }),
      patch: { s1: { name: 'Mưa Trứng Lớn', desc: 'Phun 7 trứng nổ xuống đám quái, trứng nổ hất văng.',
        ops: [{ op: 'rain', at: 'cluster', r: 4.5, n: 7, over: 1.4, hitR: 2.5, dmg: 1.5, delay: 0.8, kb: 1 }] } },
    }, { branches: {
      a: { name: 'Cóc Núi Lửa', mul: 1.6, move: { kind: 'leap', dmg: 1.2, r: 2.5, pool: { r: 2.2, dur: 4, every: 0.5, dmg: 0.3, status: st('burn', 2, 0.3) } },
        passive: P('Vũng Nham', 'Mỗi cú nhảy đáp xuống để vũng nham đốt quái 4 giây.', {}),
        patch: { s1: { name: 'Mưa Đá Nham', desc: 'Phun 7 tảng nham rơi xuống đám quái, mỗi tảng để vũng nham.',
          ops: [{ op: 'rain', at: 'cluster', r: 4.5, n: 7, over: 1.4, hitR: 2.5, dmg: 1.6, delay: 0.8, pool: { r: 1.6, dur: 3, every: 0.5, dmg: 0.3, status: st('burn', 2, 0.3) } }] } } },
      b: { name: 'Ếch Phản Lực', mul: 1.6, move: { kind: 'fly' },
        passive: P('Kính Ngắm', 'Tầm bắn +2 m.', { mods: { range: 2 } }),
        patch: { s2: { name: 'Tên Lửa Đuổi', desc: 'Bắn 4 tên lửa tự đuổi theo quái, nổ lan.',
          ops: [{ op: 'bolts', n: 4, every: 0.25, dmg: 1.6, pick: 'random', aoe: 2.2 }] } } },
    } }],
  },
  {
    id: 'cu', was: 'bong', name: 'Cú Bóng', title: 'Sát Thủ', rarity: 'SR', role: 'ranged', cls: 'ranged', family: 'bird', element: 'gio', color: 0xb070ff,
    hp: 780, atk: 60, aspd: 1.6, speed: 5.4,
    attack: { kind: 'shot', range: 7, fx: 'shuriken' },
    s1: { name: 'Bóng Lông', cd: 9, when: { enemyWithin: 3.5 }, desc: 'Biến đi, để lại bóng mồi kéo quái 3 giây.',
      ops: [{ op: 'summon', kind: 'decoy', n: 1, dur: 3 }, { op: 'dash', to: 'away', dist: 7 }], fx: 'blink' },
    s2: { name: 'Lông Xuyên', cd: 5, when: { targetWithin: 10 }, desc: 'Phóng lông bóng xuyên cả hàng quái.',
      ops: [{ op: 'line', len: 12, w: 1.2, dmg: 1.8 }], fx: 'pierce_star' },
    ult: { name: 'Đêm Săn', cost: 1500, desc: 'Tàng hình 6 giây, sát thương gấp 2,5 và luôn chí mạng.',
      ops: [{ op: 'state', who: 'self', key: 'stealth', dur: 6 }, { op: 'buff', who: 'self', dur: 6, mods: { dmgMul: 1.5, crit: 1 } }], fx: 'vanish' },
    move: { kind: 'hop' },
    passive: P('Mắt Đêm', 'Sát thương +15% lên quái dưới 50% máu.', { mods: { lowHpDmg: 0.15 } }),
    forms: [{}, {
      name: 'Cú Đêm', mul: 1.25, move: { kind: 'glide' },
      passive: P('Tan Vào Đêm', 'Tàng hình 1 giây sau khi hạ quái.', { hook: 'killStealth', dur: 1 }),
      patch: { s2: { name: 'Ba Lông Bóng', desc: 'Phóng 3 lông bóng xoè quạt, xuyên cả hàng quái.', ops: [{ op: 'line', len: 12, w: 1.2, dmg: 1.8, n: 3, fan: 30 }] } },
    }, {
      name: 'Cú Nguyệt Thực', mul: 1.6, move: { kind: 'fly', blink: 6 },
      passive: P('Né Trăng', 'Lần đầu mỗi đợt né hẳn một đòn.', { hook: 'waveDodge' }),
      patch: { ult: { name: 'Nhật Thực', desc: 'Tàng hình 6 giây, luôn chí mạng; vùng 9 m tối lại, quái trong đó nhận thêm 25% sát thương và đánh trượt.',
        ops: [{ op: 'state', who: 'self', key: 'stealth', dur: 6 }, { op: 'buff', who: 'self', dur: 6, mods: { dmgMul: 1.5, crit: 1 } }, { op: 'mark', at: 'cluster', r: 9, dur: 6, amp: 0.25, status: st('blind', 6, 0.4) }] } },
    }],
  },
  {
    id: 'duoi', was: 'bang', name: 'Đuối Băng', title: 'Khống Chế', rarity: 'SR', role: 'melee', cls: 'melee', family: 'fish', element: 'bang', color: 0x8ae0ff,
    hp: 1000, atk: 58, aspd: 1.2, speed: 4.8,
    attack: { kind: 'melee', range: 3.4, deg: 40, cleave: 3, fx: 'thrust' },
    s1: { name: 'Sóng Băng', cd: 10, when: { crowd: 2, r: 5, self: true }, desc: 'Quạt vây băng đóng băng quái trước mặt 2 giây.',
      ops: [{ op: 'cone', r: 6, deg: 70, dmg: 1.2, status: st('freeze', 2) }], fx: 'ice_wave' },
    s2: { name: 'Đuôi Băng Xuyên', cd: 7, when: { targetWithin: 10 }, desc: 'Roi đuôi băng xuyên hàng, làm chậm 40%.',
      ops: [{ op: 'line', len: 12, w: 1.2, dmg: 2, status: st('slow', 3, 0.4) }], fx: 'ice_spike' },
    ult: { name: 'Kỷ Băng Hà', cost: 1600, desc: 'Bão tuyết 6 giây quanh mình: đóng băng rồi bào máu.',
      ops: [{ op: 'aoe', at: 'self', r: 9, dmg: 1, status: st('freeze', 2.5) }, { op: 'zone', at: 'self', follow: true, r: 9, dur: 6, every: 0.5, dmg: 0.5, status: st('slow', 1, 0.4) }], fx: 'blizzard' },
    move: { kind: 'swimAir' },
    passive: P('Vây Lạnh', 'Đòn đánh làm chậm 10%.', { mods: { slowHit: 0.1 } }),
    forms: [{}, {
      name: 'Đuối Gai Sương', mul: 1.25, move: { kind: 'swimAir', bonus: 0.15 },
      passive: P('Băng Giòn', 'Quái bị đóng băng nhận thêm 20% sát thương.', { mods: { frozenAmp: 0.2 } }),
      patch: { s1: { name: 'Sóng Băng Vỡ', desc: 'Quạt băng đóng băng quái 2 giây, mảnh băng rơi lại nổ sau 1 giây.',
        ops: [{ op: 'cone', r: 6, deg: 70, dmg: 1.2, status: st('freeze', 2) }, { op: 'rain', at: 'cluster', r: 3, n: 3, over: 0.3, hitR: 1.8, dmg: 1.2, delay: 1, status: st('slow', 2, 0.3) }] } },
    }, {
      name: 'Đuối Băng Hà', mul: 1.6, move: { kind: 'fly', trail: { dur: 2.5, r: 1.4, every: 0.5, dmg: 0.15, status: st('slow', 1, 0.35) } },
      passive: P('Thân Băng', 'Miễn khống chế 3 giây đầu mỗi đợt.', { hook: 'waveUnstop', dur: 3 }),
      patch: { ult: { name: 'Bão Tuyết Xoáy', desc: 'Bão tuyết xoáy 6 giây quanh mình: đóng băng, cuốn quái vào giữa và bào máu.',
        ops: [{ op: 'aoe', at: 'self', r: 9, dmg: 1, status: st('freeze', 2.5) }, { op: 'zone', at: 'self', follow: true, r: 9, dur: 6, every: 0.5, dmg: 0.6, suck: 0.8, status: st('slow', 1, 0.4) }] } },
    }],
  },
  {
    id: 'kyda', was: 'hoa', name: 'Kỳ Đà Lửa', title: 'Đấu Sĩ', rarity: 'SR', role: 'melee', cls: 'melee', family: 'reptile', element: 'lua', color: 0xff6a20,
    hp: 1250, atk: 48, aspd: 2.2, speed: 5, dr: 0.25,
    attack: { kind: 'melee', range: 1.9, deg: 90, cleave: 2, fx: 'punch', status: st('burn', 2, 0.25) },
    s1: { name: 'Bãi Lửa', cd: 9, when: { crowd: 3, r: 3.5 }, desc: 'Biển lửa 5 giây dưới chân đám quái.',
      ops: [{ op: 'zone', at: 'cluster', r: 3, dur: 5, every: 0.5, dmg: 0.4, status: st('burn', 2, 0.25), delay: 0.4 }], fx: 'molotov' },
    s2: { name: 'Vồ Lửa', cd: 10, when: { crowd: 2, r: 3.5 }, desc: 'Nhảy vào giữa đám quái và nổ.',
      ops: [{ op: 'dash', to: 'cluster', jump: true }, { op: 'aoe', at: 'self', r: 3.5, dmg: 2, status: st('burn', 3, 0.25), kb: 1.5 }], fx: 'rocket_jump' },
    ult: { name: 'Hoả Long', cost: 1500, desc: 'Phun lửa 5 giây thành quạt dài 9 m.',
      ops: [{ op: 'zone', at: 'self', follow: true, cone: 55, r: 9, dur: 5, every: 0.25, dmg: 0.9, status: st('burn', 3, 0.25) }], fx: 'dragon_breath' },
    move: { kind: 'slither', trail: null },
    passive: P('Vảy Lửa', 'Đòn đánh đốt cháy quái.', {}),
    forms: [{}, {
      name: 'Kỳ Đà Lửa Lưng', mul: 1.25, move: { kind: 'slither', trail: null },
      passive: P('Máu Sôi', 'Dưới 50% máu tốc đánh +20%.', { hook: 'rage', below: 0.5, aspd: 0.2 }),
      patch: { s2: { name: 'Vồ Phun Lửa', desc: 'Nhảy vào giữa đám quái, nổ rồi phun lửa hình nón.',
        ops: [{ op: 'dash', to: 'cluster', jump: true }, { op: 'aoe', at: 'self', r: 3.5, dmg: 2, status: st('burn', 3, 0.25), kb: 1.5 }, { op: 'cone', r: 6, deg: 60, dmg: 1.2, status: st('burn', 3, 0.3), delay: 0.3 }] } },
    }, { branches: {
      a: { name: 'Long Nham Thạch', mul: 1.6, move: { kind: 'burrow', dmg: 1.8, r: 3, status: st('burn', 3, 0.3) },
        passive: P('Trồi Nham', 'Khi trồi lên khỏi đất gây sát thương lửa vùng 3 m.', {}),
        patch: { ult: { name: 'Phun Trào', desc: 'Phun lửa 5 giây và 4 cột nham trào lên giữa đám quái.',
          ops: [{ op: 'zone', at: 'self', follow: true, cone: 55, r: 9, dur: 5, every: 0.25, dmg: 0.9, status: st('burn', 3, 0.25) }, { op: 'zone', at: 'cluster', n: 4, scatter: 3.5, r: 1.8, dur: 3, every: 0.3, dmg: 0.6, status: st('burn', 3, 0.3), delay: 0.6 }] } } },
      b: { name: 'Kỳ Đà Cánh Lửa', mul: 1.6, move: { kind: 'fly' },
        passive: P('Cánh Hút Lửa', 'Hút máu 8%.', { mods: { lifesteal: 0.08 } }),
        patch: { ult: { name: 'Bổ Nhào Lửa', desc: 'Bổ nhào xuyên đám quái, thiêu cháy cả đường bay rồi phun lửa 4 giây.',
          ops: [{ op: 'dash', to: 'through', dmg: 3, w: 2.4, status: st('burn', 4, 0.4), trail: { w: 2.6, dur: 4, every: 0.3, dmg: 0.5, status: st('burn', 3, 0.3) } }, { op: 'zone', at: 'self', follow: true, cone: 55, r: 9, dur: 4, every: 0.25, dmg: 0.9, status: st('burn', 3, 0.25), delay: 0.2 }] } } },
    } }],
  },
  {
    id: 'oc', was: 'doc', name: 'Ốc Độc', title: 'Dịch Bệnh', rarity: 'SR', role: 'melee', cls: 'melee', family: 'mollusk', element: 'moc', color: 0x9adf3a,
    hp: 950, atk: 62, aspd: 1.1, speed: 4.8,
    attack: { kind: 'melee', range: 3.2, deg: 140, cleave: 4, fx: 'glaive', status: st('poison', 3, 0.3) },
    s1: { name: 'Mây Độc', cd: 10, when: { crowd: 3, r: 4 }, desc: 'Mây độc 6 giây: bào máu và làm chậm.',
      ops: [{ op: 'zone', at: 'cluster', r: 4, dur: 6, every: 0.5, dmg: 0.35, status: st('slow', 1, 0.3) }], fx: 'poison_cloud' },
    s2: { name: 'Hút Nhựa', cd: 8, when: { hpBelow: 0.8 }, desc: 'Hút máu mục tiêu về mình.',
      ops: [{ op: 'bolts', n: 1, every: 0, dmg: 2, pick: 'target', drain: 1 }], fx: 'drain' },
    ult: { name: 'Đại Dịch', cost: 1500, desc: 'Mọi quái trong 12 m nhiễm độc 8 giây và nhận thêm 20% sát thương.',
      ops: [{ op: 'mark', r: 12, dur: 8, amp: 0.2, status: st('poison', 8, 0.5) }], fx: 'plague' },
    move: { kind: 'slither', trail: { dur: 2, r: 1.1, every: 0.5, dmg: 0, status: st('slow', 1, 0.25) } },
    passive: P('Nhầy Dai', 'Độc kéo dài hơn 10%.', { mods: { dotDur: 0.1 } }),
    forms: [{}, {
      name: 'Ốc Gai Độc', mul: 1.25, move: { kind: 'slither', trail: { dur: 2.5, r: 1.2, every: 0.5, dmg: 0.12, status: st('poison', 2, 0.3) } },
      passive: P('Phun Trả', 'Khi trúng đòn, 20% phun độc lại kẻ đánh.', { hook: 'spit', p: 0.2 }),
      patch: { s1: { name: 'Mây Gai Độc', desc: 'Mây độc 6 giây bào máu, làm chậm và tẩm độc mọi quái trong mây.',
        ops: [{ op: 'zone', at: 'cluster', r: 4.5, dur: 6, every: 0.5, dmg: 0.35, status: st('slow', 1, 0.3) }, { op: 'aoe', at: 'cluster', r: 4.5, dmg: 0.5, status: st('poison', 6, 0.4) }] } },
    }, {
      name: 'Ốc Pha Lê Dịch', mul: 1.6, move: { kind: 'roll', kb: 1, dmg: 0.4, status: st('poison', 3, 0.3) },
      passive: P('Dịch Lây', 'Quái chết vì độc lây độc sang quái gần.', { hook: 'contagion' }),
      patch: { ult: { name: 'Vỏ Nổ Mây Độc', desc: 'Nhiễm độc mọi quái trong 12 m, rồi vỏ pha lê nổ thành mây độc 6 giây.',
        ops: [{ op: 'mark', r: 12, dur: 8, amp: 0.2, status: st('poison', 8, 0.5) }, { op: 'aoe', at: 'self', r: 5, dmg: 2.5, kb: 1.5 }, { op: 'zone', at: 'self', r: 5.5, dur: 6, every: 0.5, dmg: 0.45, status: st('slow', 1, 0.3), delay: 0.2 }] } },
    }],
  },
  {
    id: 'haily', was: 'ky', name: 'Hải Ly Thợ', title: 'Chế Tạo', rarity: 'SR', role: 'ranged', cls: 'summon', family: 'quad', element: 'dat', color: 0xf0d040,
    hp: 950, atk: 85, aspd: 0.9, speed: 4.6,
    attack: { kind: 'cone', range: 6, deg: 36, fx: 'shotgun' },
    s1: { name: 'Dựng Tháp Gỗ', cd: 11, when: { targetWithin: 12 }, desc: 'Dựng tháp gỗ bắn 12 giây.',
      ops: [{ op: 'summon', kind: 'turret', n: 1, dur: 12 }], fx: 'turret' },
    s2: { name: 'Đập Chắn', cd: 14, when: { allyBelow: 0.75 }, desc: 'Cả đội nhận khiên gỗ 15% máu trong 5 giây.',
      ops: [{ op: 'shield', who: 'all', amt: 0.15, dur: 5 }], fx: 'armor_up' },
    ult: { name: 'Pháo Gỗ', cost: 1600, desc: 'Dựng khẩu pháo gỗ bắn 12 giây.',
      ops: [{ op: 'summon', kind: 'cannon', n: 1, dur: 12 }], fx: 'fortress' },
    move: { kind: 'walk' },
    passive: P('Gỗ Chắc', 'Vật triệu hồi +10% máu.', { mods: { summonHp: 0.1 } }),
    forms: [{}, {
      name: 'Hải Ly Thợ Cả', mul: 1.25, move: { kind: 'glide' },
      passive: P('Đinh Đóng Kỹ', 'Vật triệu hồi tồn tại lâu hơn 30%.', { mods: { summonDur: 0.3 } }),
      patch: { s1: { name: 'Tháp Hai Nòng', desc: 'Dựng tháp gỗ hai nòng bắn 12 giây.', ops: [{ op: 'summon', kind: 'turret2', n: 1, dur: 12 }] } },
    }, {
      name: 'Hải Ly Cơ Giáp', mul: 1.6, move: { kind: 'stomp', r: 2, slow: 0.25 },
      passive: P('Nổ Phế Liệu', 'Vật triệu hồi bị phá hoặc hết giờ thì nổ, gây sát thương quanh 3 m.', { hook: 'boomSummon', dmg: 1.5, r: 3 }),
      patch: { ult: { name: 'Pháo Đài Bốn Tháp', desc: 'Dựng pháo gỗ và 4 tháp hai nòng quanh mình 12 giây.',
        ops: [{ op: 'summon', kind: 'cannon', n: 1, dur: 12 }, { op: 'summon', kind: 'turret2', n: 4, dur: 12 }] } },
    }],
  },
  {
    id: 'bosat', was: 'sam', name: 'Bọ Sét', title: 'Lôi Thần', rarity: 'SSR', role: 'ranged', cls: 'magic', family: 'insect', element: 'set', color: 0xfff060,
    hp: 860, atk: 80, aspd: 1, speed: 4.8,
    attack: { kind: 'shot', range: 9, chain: 2, fx: 'javelin' },
    s1: { name: 'Cầu Sét', cd: 9, when: { targetWithin: 10 }, desc: 'Cầu sét trôi chậm, giật mọi thứ nó đi qua.',
      ops: [{ op: 'zone', at: 'self', drift: 5, r: 2.5, dur: 2.4, every: 0.3, dmg: 0.5 }], fx: 'ball_lightning' },
    s2: { name: 'Lôi Phạt', cd: 8, when: { targetWithin: 12 }, desc: 'Sét đánh con trâu nhất, choáng 1,5 giây.',
      ops: [{ op: 'bolts', n: 1, every: 0, dmg: 4, pick: 'strong', status: st('stun', 1.5) }], fx: 'smite' },
    ult: { name: 'Thiên Lôi', cost: 1700, desc: 'Bão sét 6 giây: sét liên tục giáng và nảy sang 2 con.',
      ops: [{ op: 'bolts', n: 20, every: 0.3, dmg: 1.6, pick: 'random', chain: 2 }], fx: 'thunder' },
    move: { kind: 'walk' },
    passive: P('Râu Dẫn', 'Chuỗi sét nảy thêm 1 mục tiêu.', { mods: { chainN: 1 } }),
    forms: [{}, {
      name: 'Bọ Cánh Sét', mul: 1.25, move: { kind: 'fly' },
      passive: P('Cánh Gọi Sét', 'Đòn thường 15% gọi sét đánh xuống mục tiêu.', { mods: { zapHit: 0.15 } }),
      patch: { s1: { name: 'Đôi Cầu Sét', desc: 'Hai cầu sét trôi toả ra, giật mọi thứ chúng đi qua.',
        ops: [{ op: 'zone', at: 'self', drift: 5, r: 2.5, dur: 2.4, every: 0.3, dmg: 0.5 }, { op: 'zone', at: 'self', drift: 5, spin: 0.5, r: 2.5, dur: 2.4, every: 0.3, dmg: 0.5 }] } },
    }, { branches: {
      a: { name: 'Bọ Lôi Vương', mul: 1.6, move: { kind: 'fly' },
        passive: P('Sét Theo Choáng', 'Quái bị choáng nhận thêm 25% sát thương.', { mods: { stunAmp: 0.25 } }),
        patch: { ult: { name: 'Bão Sét Tesla', desc: 'Bão sét 6 giây nảy sang 2 con, kèm vòng tesla quanh mình giật và choáng.',
          ops: [{ op: 'bolts', n: 20, every: 0.3, dmg: 1.6, pick: 'random', chain: 2 }, { op: 'zone', at: 'self', follow: true, r: 5, dur: 6, every: 1, dmg: 0.8, status: st('stun', 0.4) }] } } },
      b: { name: 'Bọ Sét Đá', mul: 1.6, move: { kind: 'burrow', dmg: 1.5, r: 3, status: st('stun', 0.8) },
        passive: P('Vỏ Thạch Anh', 'Giảm 20% sát thương nhận khi đứng yên bắn.', { hook: 'stillDr', dr: 0.2 }),
        patch: { s2: { name: 'Lôi Phạt Đá', desc: 'Sét đánh con trâu nhất, choáng 1,5 giây, nổ đá văng quanh nó.',
          ops: [{ op: 'bolts', n: 1, every: 0, dmg: 4, pick: 'strong', status: st('stun', 1.5), aoe: 2.5 }] } } },
    } }],
  },
  {
    id: 'bao', was: 'soi', name: 'Báo Mây', title: 'Thợ Săn', rarity: 'SSR', role: 'melee', cls: 'melee', family: 'quad', element: 'set', color: 0xc08a50,
    hp: 1150, atk: 66, aspd: 1.5, speed: 5.4, lifesteal: 0.08,
    attack: { kind: 'melee', range: 2.1, deg: 100, cleave: 2, fx: 'hatchet' },
    s1: { name: 'Vồ Cắn', cd: 6, when: { targetWithin: 9 }, desc: 'Vồ con yếu nhất, cắn chảy máu.',
      ops: [{ op: 'dash', to: 'weak', jump: true }, { op: 'bolts', n: 1, every: 0, dmg: 2.2, pick: 'weak', status: st('bleed', 4, 0.4) }], fx: 'pounce' },
    s2: { name: 'Gọi Bóng Báo', cd: 15, when: { targetWithin: 12 }, desc: 'Gọi 2 bóng báo chiến đấu 10 giây.',
      ops: [{ op: 'summon', kind: 'wolf', n: 2, dur: 10 }], fx: 'howl' },
    ult: { name: 'Bão Mây', cost: 1500, desc: '10 giây hoá bão mây: nhanh, trâu, hút máu, cắn lan.',
      ops: [{ op: 'buff', who: 'self', dur: 10, mods: { aspd: 0.6, speed: 0.35, dr: 0.4, lifesteal: 0.2, cleave: 3 } }], fx: 'werewolf' },
    move: { kind: 'gallop' },
    passive: P('Mở Màn', 'Đầu mỗi đợt lao thẳng vào mục tiêu đầu tiên.', { hook: 'opener' }),
    forms: [{}, {
      name: 'Báo Mây Vằn', mul: 1.25, move: { kind: 'leap', dmg: 1, r: 2, status: st('stun', 0.5) },
      passive: P('Vồ Choáng', 'Cú vồ xa đáp trúng làm choáng 0,5 giây.', {}),
      patch: { s1: { name: 'Vồ Cắn Sấm', desc: 'Vồ con yếu nhất, cắn chảy máu và giật sét lan 2 con.',
        ops: [{ op: 'dash', to: 'weak', jump: true }, { op: 'bolts', n: 1, every: 0, dmg: 2.2, pick: 'weak', status: st('bleed', 4, 0.4), chain: 2 }] } },
    }, {
      name: 'Báo Hư Ảnh', mul: 1.6, move: { kind: 'swimAir', blink: 6 },
      passive: P('Hư Ảnh', 'Hư ảnh thừa hưởng 30% sát thương của nó.', {}),
      patch: { ult: { name: 'Ba Hư Ảnh', desc: '10 giây hoá bão mây, gọi 3 hư ảnh đánh cùng.',
        ops: [{ op: 'buff', who: 'self', dur: 10, mods: { aspd: 0.6, speed: 0.35, dr: 0.4, lifesteal: 0.2, cleave: 3 } }, { op: 'summon', kind: 'shade', n: 3, dur: 10 }] } },
    }],
  },
  {
    id: 'nhen', was: 'nhen', name: 'Nhện Tơ Ngọc', title: 'Giăng Bẫy', rarity: 'SSR', role: 'ranged', cls: 'ranged', family: 'insect', element: 'moc', color: 0xd88a4a,
    hp: 820, atk: 74, aspd: 1.3, speed: 5,
    attack: { kind: 'shot', range: 10, fx: 'webbow', status: st('slow', 1.5, 0.2) },
    s1: { name: 'Đu Tơ', cd: 8, when: { enemyWithin: 3.5 }, desc: 'Đu ra xa, 4 giây sau đó bắn mạnh gấp rưỡi.',
      ops: [{ op: 'dash', to: 'away', dist: 8, jump: true }, { op: 'buff', who: 'self', dur: 4, mods: { dmgMul: 0.5 } }], fx: 'swing' },
    s2: { name: 'Kéo Tơ', cd: 10, when: { crowd: 3, r: 5 }, desc: 'Kéo đám quái chụm lại và trói 1,5 giây.',
      ops: [{ op: 'pull', at: 'cluster', r: 5, dmg: 1, status: st('root', 1.5) }], fx: 'web_pull' },
    ult: { name: 'Lưới Tơ Ngọc', cost: 1600, desc: 'Trói mọi quái trong 10 m 3,5 giây, chúng nhận thêm 25% sát thương.',
      ops: [{ op: 'aoe', at: 'cluster', r: 10, dmg: 3, status: st('root', 3.5) }, { op: 'mark', at: 'cluster', r: 10, dur: 5, amp: 0.25 }], fx: 'web_net' },
    move: { kind: 'walk' },
    passive: P('Tơ Dai', 'Trói lâu thêm 0,5 giây.', { mods: { rootDur: 0.5 } }),
    forms: [{}, {
      name: 'Nhện Ngọc Bích', mul: 1.25, move: { kind: 'leap', dmg: 0.6, r: 2, status: st('root', 1) },
      passive: P('Lưới Đặc', 'Tơ làm chậm thêm 15%.', { mods: { slowPow: 0.15 } }),
      patch: { s2: { name: 'Kéo Hai Lưới', desc: 'Kéo hai đám quái chụm lại và trói 1,5 giây.', ops: [{ op: 'pull', at: 'cluster', r: 5, dmg: 1, status: st('root', 1.5), n: 2 }] } },
    }, {
      name: 'Nhện Khí Cầu', mul: 1.6, move: { kind: 'glide' },
      passive: P('Lưới Hút Sức', 'Quái đang bị trói nhận thêm 15% sát thương.', { mods: { rootAmp: 0.15 } }),
      patch: { ult: { name: 'Lưới Trời', desc: 'Lưới trời phủ cả chặng: trói mọi quái 3,5 giây, chúng nhận thêm 25% sát thương.',
        ops: [{ op: 'aoe', at: 'self', r: 22, dmg: 3, status: st('root', 3.5) }, { op: 'mark', at: 'self', r: 22, dur: 6, amp: 0.25 }] } },
    }],
  },
  {
    id: 'muc', was: null, name: 'Mực Sao', title: 'Pháp Sư Mực', rarity: 'SR', role: 'ranged', cls: 'magic', family: 'mollusk', element: 'moc', color: 0x6a5aff,
    hp: 900, atk: 66, aspd: 1.1, speed: 4.8,
    attack: { kind: 'proj', range: 9, aoe: 1.4, speed: 16, fx: 'webbow', status: st('slow', 1.5, 0.2) },
    s1: { name: 'Vũng Mực', cd: 10, when: { crowd: 3, r: 4 }, desc: 'Vũng mực 6 giây: làm chậm, quái trong mực đánh trượt 30%.',
      ops: [{ op: 'zone', at: 'cluster', r: 3.6, dur: 6, every: 0.5, dmg: 0.3, status: st('slow', 1, 0.35), ink: true }, { op: 'aoe', at: 'cluster', r: 3.6, dmg: 0.4, status: st('blind', 6, 0.3) }], fx: 'poison_cloud' },
    s2: { name: 'Xúc Tu', cd: 9, when: { crowd: 3, r: 4.5 }, desc: 'Xúc tu quấn kéo đám quái về một điểm.',
      ops: [{ op: 'pull', at: 'cluster', r: 4.5, dmg: 1.2, status: st('slow', 2, 0.4) }], fx: 'web_pull' },
    ult: { name: 'Vực Mực', cost: 1600, desc: 'Vực mực lớn 6 giây: bào máu, trói quái 2 giây.',
      ops: [{ op: 'aoe', at: 'cluster', r: 7, dmg: 1.5, status: st('root', 2) }, { op: 'zone', at: 'cluster', r: 7, dur: 6, every: 0.5, dmg: 0.6, status: st('slow', 1, 0.4), ink: true }], fx: 'plague' },
    move: { kind: 'slither', trail: null },
    passive: P('Mực Đánh Dấu', 'Quái đứng trong mực nhận thêm 10% sát thương.', { mods: { inkAmp: 0.1 } }),
    forms: [{}, {
      name: 'Mực Lơ Lửng', mul: 1.25, move: { kind: 'swimAir' },
      passive: P('Tắm Mực', 'Đứng trong mực của mình hồi 1% máu mỗi giây.', { hook: 'inkRegen', amt: 0.01 }),
      patch: { s2: { name: 'Xúc Tu Đôi', desc: 'Xúc tu quấn kéo hai đám quái về hai điểm.', ops: [{ op: 'pull', at: 'cluster', r: 4.5, dmg: 1.2, status: st('slow', 2, 0.4), n: 2 }] } },
    }, {
      name: 'Mực Thiên Văn', mul: 1.6, move: { kind: 'blink' },
      passive: P('Cổng Sao', 'Mỗi 8 giây mở cổng nhỏ ném một quái gần nhất ra xa.', { hook: 'portal', every: 8 }),
      patch: { ult: { name: 'Hố Đen', desc: 'Mở hố đen 6 giây hút quái vào giữa, trói và bào máu.',
        ops: [{ op: 'aoe', at: 'cluster', r: 7, dmg: 1.5, status: st('root', 2) }, { op: 'zone', at: 'cluster', r: 7, dur: 6, every: 0.4, dmg: 0.6, suck: 1.6, status: st('slow', 1, 0.5), ink: true }] } },
    }],
  },
];

export const HERO = Object.fromEntries(HEROES.map((h) => [h.id, h]));

// old hero id (account version 1, the human roster) -> beast id
export const LEGACY_IDS = Object.fromEntries(HEROES.filter((h) => h.was).map((h) => [h.was, h.id]));

// things heroes put on the field; they fight on the heroes' side and cannot be healed or carry cards
export const SUMMONS = {
  drone: { hp: 1, untargetable: true, follow: true, atk: 0.5, aspd: 8, range: 11, kind: 'shot', fx: 'minigun' },
  turret: { hp: 0.5, still: true, atk: 0.5, aspd: 3, range: 9, kind: 'shot', fx: 'turret_shot' },
  turret2: { hp: 0.6, still: true, atk: 0.5, aspd: 5.4, range: 9.5, kind: 'shot', fx: 'turret_shot' },
  cannon: { hp: 1, still: true, atk: 2.5, aspd: 1.25, range: 13, kind: 'proj', aoe: 2.5, speed: 20, fx: 'rocket' },
  wolf: { hp: 0.3, atk: 0.5, aspd: 1.6, range: 1.6, kind: 'melee', speed: 6.5, fx: 'bite' },
  shade: { hp: 0.35, atk: 0.3, aspd: 1.5, range: 2.1, kind: 'melee', speed: 7, fx: 'hatchet' },
  decoy: { hp: 0.6, still: true, taunt: 3, atk: 0, aspd: 0, range: 0, kind: 'none' },
};
