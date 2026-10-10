// 14 thiên phú của cây trồng ở Vườn (Hương Thảo, Oải Hương, Dương Bạc, Hoa Hồng, Thất Lý Hương, Cỏ Cầu Vồng, Quân Tử Lan, Pháo, Hoa Ly, Nhân Sâm,
// Hoa Đồng Đen, Cây Nắp Ấm, Cây Lan Pha Lê, Đào Tiên): id 2170..2184 (không có 2176), BuffId trong Buff_info_<id> của localization.
// Cây trồng cho buff (js/garden.js) -> SK.ROOMS.takeBuff -> luật ở tệp này. Tệp này đặt vào SK.ROOMS.DEF (nên garden.js coi là "có ở bản web")
// và vào SK_BUFFS86.buffs (tên + mô tả + biểu tượng chung) nhưng KHÔNG vào bể bốc/ cửa hàng (không nằm trong nhóm TG_* nào): chỉ trồng mới có.
// Nguồn số: [WIKI] trang "<Tên> Buff" trên wiki cộng đồng; [LOC] Buff_info_<id>; [ƯỚC LƯỢNG] số không có nguồn (wiki chỉ có trang cho 11/14 buff,
// Lightning Bolt / Arbitrary Strike / Monkey Pack không có trang, tên buff Việt của cả 14 cũng không có trong LOC nên đặt theo nghĩa tên gốc).
// Mọi sát thương lên quái đi qua SK.hurtEnemy với G._skHit = 'pb' để các buff khác coi là đòn phụ (không tự kích lại buff này).
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.ROOMS || !SK.ROOMS.DEF || !SK.on) return;
  const G = SK.G, W = SK.world, T = SK.TILE, DEF = SK.ROOMS.DEF, D = SK.D, RU = (SK.DS && SK.DS.rules) || {};
  const BUFFS = (window.SK_BUFFS86 || {}).buffs || null;
  const K = () => SK.skillKit || {};

  // ---------------------------------------------------------------- số liệu
  const TL = {
    holy: { dmg: 200, r: 20, heal: 0.5, cd: 300 },                              // [WIKI Holy Nova Buff] 200 sát thương, 20 ô, hồi 50% máu tối đa làm tròn lên, 300 s
    soul: { need: 12, dmg: 60, grow: 0.005, aoe: 0.25, aoeR: 3, pick: 5, drop: [2, 3, 4], dropBig: [4, 6, 8] },   // [WIKI Soul Strike Buff]; bán kính lan 3 ô [ƯỚC LƯỢNG]
    frost: { every: 10, max: 1, r: 5, dur: 5, slow: 0.5 },                      // [WIKI Frost Ring Buff] 10 s, 1 tầng, 5 ô, 5 s; giảm tốc 50% [ƯỚC LƯỢNG]
    dragon: { every: 3, dmg: 5, range: 10, half: 0.5, boom: 33, boomR: 3 },     // [WIKI Dragon Breath Buff] 3 s, 5 sát thương, 10 ô, nổ 33; nửa góc 0,5 rad và bán kính nổ 3 ô [ƯỚC LƯỢNG]
    tornado: { dist: 20, life: 8, dmg: 5, tick: 0.5, speed: 40, pull: 60, r: 3.5, hit: 1.5 },   // [WIKI Tornado Buff] 5 sát thương, 8 s; cự ly 20 ô, nhịp 0,5 s, tốc 40, hút 60 px/s, bán kính hút 3,5 ô [ƯỚC LƯỢNG]
    chaos: { size: 2.5, dmg: 3, boom: 10, boomR: 2.5, pool: 2, poolLife: 4, poolTick: 0.5, bolt: 8, boltR: 1.5, pullR: 4, pullT: 0.8 },   // [WIKI Chaos Strike Buff] cỡ +250% (×2,5), sát thương +200% (×3); số các hiệu ứng [ƯỚC LƯỢNG]
    air: { n: 3, life: 8, cd: 20, dmg: 2, every: 0.25 },                        // [WIKI Air Reinforcement Buff] 3 NPC, 8 s, hồi 20 s, Improved SMG bắn nhát 2 sát thương; nhịp 0,25 s [ƯỚC LƯỢNG]
    fire: { min: 9, max: 12, dmg: 1, r: 1, big: 0.2, bigDmg: 3, bigR: 2, life: [1.2, 2.4], burn: 0.3, spread: 3 },   // [WIKI Firecracker Buff] 9-12 quả, 1 sát thương, có quả to; to 20%, 3 sát thương, 2 ô, đốt 30% [ƯỚC LƯỢNG]
    bolt: { near: 6, every: 1, dmg: 4, reach: 10 },                             // [LOC] không có số: 4 sát thương = Dòng Điện Từ, 1 s, gần 6 ô, tầm 10 ô [ƯỚC LƯỢNG]
    arb: { chance: 0.15, dmg: 4, energy: 0.2 },                                 // [LOC+WIKI tìm kiếm] +4 DMG, hồi 20% năng lượng đã tiêu; xác suất 15% [ƯỚC LƯỢNG]
    rose: { dmg: 0.5, life: 3, r: 2 },                                          // [WIKI Black Rose Buff] 50% sát thương, dấu 3 s; bán kính vụ nổ 2 ô [ƯỚC LƯỢNG]
    absorb: { absorb: 1, hold: 16, frac: 0.2 },                                 // [WIKI Damage Absorb Buff] hấp thụ 1 s, +20% tổng đã hấp thụ trong 16 s
    copy: { dur: 1, cd: 8 },                                                    // [WIKI Weapon Copy Buff] 1 s, hồi 8 s
    monkey: { n: 3, life: 15, cd: 20, dmg: 3, every: 0.7, speed: 70 }           // [LOC] "bầy khỉ": số khỉ, thời gian, sát thương, tốc [ƯỚC LƯỢNG]
  };

  const NAMES = {
    2170: 'Tân Tinh Thần Thánh', 2171: 'Đả Kích Linh Hồn', 2172: 'Vòng Băng', 2173: 'Phun Lửa', 2174: 'Lốc Xoáy', 2175: 'Đòn Hỗn Mang',
    2177: 'Không Quân Chi Viện', 2178: 'Pháo Nổ', 2179: 'Sấm Sét', 2180: 'Đòn Tùy Ý', 2181: 'Hoa Hồng Đen', 2182: 'Hấp Thụ Sát Thương',
    2183: 'Sao Chép Vũ Khí', 2184: 'Bầy Khỉ'
  };
  const INFO = {
    2170: ["Khi chịu s.thương chí mạng, thi triển Tân Tinh Thần Thánh, miễn sát thương lần này, CD {0}s. Tân Tinh Thần Thánh: Xóa màn đạn, tiêu diệt kẻ địch không phải Lãnh Chúa, gây lượng lớn DMG cho Lãnh Chúa, trị liệu tất cả đồng minh, phạm vi tác dụng {1}.", "Release Holy Nova and gain immunity to this hit when taking lethal damage. Cooldown {0} seconds.  Holy Nova: Destroys non-boss enemies and their bullets, and dishes out a massive amount of damage to bosses, while healing all allies. Effective range {1}."],
    2171: ["Khi kẻ địch tử vong sẽ rớt Linh Hồn, thu thập đủ, lần tấn công sau trúng mục tiêu sẽ thi triển Đả Kích Linh Hồn. Đả Kích Linh Hồn: Gây lượng lớn sát thương cho mục tiêu, gây sát thương phạm vi cho xung quanh mục tiêu, mỗi lần thi triển, DMG vĩnh viễn tăng {0}%", "Enemies drop soul pieces when they die. Collect enough soul pieces to release Soul Strike on your next hit.  Soul Strike: Inflicts a massive amount of damage to the target as well as AoE damage to enemies around them. Damage permanently increases by {0}% every time Soul Strike is triggered."],
    2172: ["Mỗi {0}s nhận 1 tầng lá chắn, tối đa tích {1} tầng, mỗi tầng có thể đỡ 1 lần DMG và thi triển Vòng Băng. Vòng Băng: Khiến địch xung quanh vào trạng thái Lạnh, giảm tốc độ di chuyển và tốc độ tấn công, nếu trúng kẻ đang ở trạng thái Lạnh sẽ đóng băng kẻ đó.", "Gain 1 stack of Blockade every {0} seconds. Max {1} stacks. Each stack of Blockade can block one hit and release a Frost Ring.  Frost Ring: Reduces movement speed and fire rate of surrounding enemies and makes them suffer from Frostbite. Enemies affected by Frostbite will be frozen on hit."],
    2173: ["Mỗi {0}s thi triển 1 lần Phun Lửa. Phun Lửa: Thiêu đốt kẻ địch, nếu kẻ địch bị trúng chiêu đang ở trạng thái Thiêu Đốt, sẽ gây Nổ 1 lần.", "Release a conical Dragonbreath every {0} seconds.  Dragonbreath: Burns enemies on hit and inflicts an explosion when it hits burnt enemies."],
    2174: ["Sau khi di chuyển 1 cự ly nhất định, thi triển Lốc Xoáy, hút liên tục và gây sát thương cho địch, có thể loại bỏ màn đạn.", "After you move a certain distance, release a tornado that continuously pulls in enemies, harms them, and destroys enemy bullets."],
    2175: ["Sau khi thi triển kỹ năng, lần tấn công kế tiếp sẽ được tăng cường và kèm theo hiệu ứng Nguyên Tố ngẫu nhiên.", "After you cast the skill, your next attack will be strengthened and come with a random elemental effect."],
    2177: ["Đeo \"Kính Râm\", gọi bạn bè hỗ trợ, thời gian CD {0}s.", "Put on Sunglasses and call your friends for fire support. Cooldown {0} seconds."],
    2178: ["Khi tung kỹ năng sẽ ném ra một ít pháo, pháo sẽ phát nổ khi chạm vào địch, hoặc tự nổ sau một khoảng thời gian.", "Casting a skill drops firecrackers that explode upon contact with enemies or after a period time."],
    2179: ["Khi ở gần Pet, Tùy Tùng, Vật Triệu Hồi, sẽ liên tục giáng sét xuống kẻ địch ở gần.", "When near pets, followers, or summons, releases lightning bolts upon nearby enemies over time."],
    2180: ["khi chiến đấu, tấn công có tỷ lệ khiến DMG +{0}, và khôi phục {1}% Năng Lượng đã tiêu hao.", "Attacks in battle might deal +{0} damage and restore {1}% of consumed energy."],
    2181: ["Đánh dấu kẻ địch đánh trúng, khi Vũ Khí đánh trúng đánh dấu sẽ tạo ra {0}% DMG lên xung quanh.", "Marks enemies you hit. Hitting a marked enemy with your weapon deals {0}% damage to nearby enemies."],
    2182: ["Sau khi đánh trúng kẻ địch, DMG gây ra trong {0} giây kế tiếp sẽ bị hấp thụ, trong {1} giây sau đó khi đánh trúng kẻ địch sẽ gây thêm {2}% tổng DMG đã bị hấp thụ.", "All damage you deal within {0}s of hitting an enemy is absorbed. For the next {1}s, all your attacks deal additional damage equal to {2}% of the absorbed damage."],
    2183: ["Vũ Khí Chính mô phỏng hình thái tấn công của Vũ Khí Dự Phòng, kéo dài {0}s, CD {1}s.", "Your main weapon copies your secondary weapon's attack style for {0}s. Cooldown: {1}s."],
    2184: ["Triệu hồi một bầy khỉ.", "Summons a pack of monkeys."]
  };
  const NUMS = {
    2170: [TL.holy.cd, TL.holy.r], 2171: [TL.soul.grow * 100], 2172: [TL.frost.every, TL.frost.max], 2173: [TL.dragon.every],
    2177: [TL.air.cd], 2180: [TL.arb.dmg, TL.arb.energy * 100], 2181: [TL.rose.dmg * 100], 2182: [TL.absorb.absorb, TL.absorb.hold, TL.absorb.frac * 100],
    2183: [TL.copy.dur, TL.copy.cd]
  };
  const NOTES = {
    2170: 'Máu về 0 thì tung Tân Tinh: 200 sát thương mọi quái trong 20 ô, xoá đạn địch, miễn đòn, hồi 50% máu tối đa (làm tròn lên) cho người và đồng minh, hồi 300 s [WIKI Holy Nova Buff]',
    2171: 'Quái chết rơi 2-4 linh hồn (tinh anh/trùm 4-6-8), đủ 12 thì đòn kế tung 60 sát thương +0,5% mỗi lần, lan 25% [WIKI Soul Strike Buff]; thú cưng cũng được tính hạ quái [ƯỚC LƯỢNG]',
    2172: 'Mỗi 10 s có 1 tầng khiên: đỡ 1 đòn, tung vòng băng 5 ô làm địch chậm và lạnh 5 s, vòng thứ hai lên địch đang lạnh thì đóng băng [WIKI Frost Ring Buff]',
    2173: 'Mỗi 3 s phun lửa hình quạt 10 ô: 5 sát thương và thiêu đốt; kẻ đang cháy trúng lần nữa thì nổ 33 sát thương [WIKI Dragon Breath Buff]; hướng = hướng chạy cuối',
    2174: 'Đi đủ 20 ô thì sinh lốc xoáy chạy thẳng hướng ngẫu nhiên 8 s, hút quái, 5 sát thương mỗi nhịp, xoá đạn địch [WIKI Tornado Buff; cự ly, nhịp, tốc ƯỚC LƯỢNG]',
    2175: 'Sau kỹ năng, đòn kế to ×2,5, sát thương ×3 và kèm 1 trong 5 nguyên tố (nổ lửa, vũng băng, vũng độc, sét, hố hút) [WIKI Chaos Strike Buff; số hiệu ứng ƯỚC LƯỢNG]',
    2177: 'Web chưa có biểu cảm Kính Râm nên tự gọi khi đang đánh nhau: 3 lính cầm Improved SMG yểm trợ 8 s, hồi 20 s [WIKI Air Reinforcement Buff]',
    2178: 'Dùng kỹ năng thì rải 9-12 quả pháo, nổ khi chạm quái hoặc sau 1-2 s, 1 sát thương (quả to 3), có thể đốt [WIKI Firecracker Buff; quả to ƯỚC LƯỢNG]',
    2179: 'Gần thú cưng, tùy tùng hoặc vật triệu hồi thì mỗi 1 s giáng sét 4 sát thương xuống quái gần [LOC; số ƯỚC LƯỢNG]',
    2180: 'Đòn đánh 15% cộng 4 sát thương và hồi 20% năng lượng vừa tiêu [LOC; xác suất ƯỚC LƯỢNG]',
    2181: 'Đòn trúng đánh dấu quái 3 s; vũ khí đánh trúng quái có dấu thì nổ đen 50% sát thương (làm tròn chẵn) lên quái dấu và quái quanh [WIKI Black Rose Buff]',
    2182: 'Đánh trúng thì 1 s sau đó mọi sát thương bị hấp thụ (lưu 20% trước bạo kích); 16 s kế mỗi đòn cộng phần đã lưu [WIKI Damage Absorb Buff]',
    2183: 'Khi đánh nhau và có 2 vũ khí: 1 s vũ khí chính bắn theo kiểu của vũ khí dự phòng (giữ tốc bắn và năng lượng của chính), hồi 8 s [WIKI Weapon Copy Buff]',
    2184: 'Khi đánh nhau gọi 3 con khỉ chạy tới cắn quái 15 s, hồi 20 s [LOC; số ƯỚC LƯỢNG]'
  };
  for (const k of Object.keys(NAMES)) {
    const id = +k;
    DEF[id] = Object.assign({ active: true, plant: true, nums: NUMS[id] || [], note: NOTES[id] }, DEF[id] || {});
    if (BUFFS && !BUFFS[id]) BUFFS[id] = { key: 'PlantBuff' + id, id, name: { en: 'Plant buff ' + id, vi: NAMES[id] }, info: { en: INFO[id][1], vi: INFO[id][0] }, icon: 'ui_buff_x', plant: true };
  }

  // ---------------------------------------------------------------- tiện ích
  const has = id => { const p = G.player; return !!(p && p.buffs && p.buffs.indexOf(id) >= 0); };
  const live = e => !!e && e.st !== 'spawn' && e.st !== 'dead' && e.hp > 0;
  const inRoom = e => G.room == null || e.room == null || e.room === G.room;
  const mid = e => (K().ec ? K().ec(e) : [e.x, e.y - 8]);
  const pbOf = p => p.pb || (p.pb = { cd: {} });
  const critMul = () => (RU.critMult || 2);
  const evenNear = v => Math.max(2, 2 * Math.round(v / 2));
  const rnd = (a, b) => a + SK.rand() * (b - a);
  const pickOf = list => list[Math.floor(SK.rand() * list.length)];
  const fighting = () => G.enemies.some(e => live(e) && inRoom(e));
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  function hurt(e, dmg, ang, repel, tag) {
    const prev = G._skHit; G._skHit = tag || 'pb';
    const r = SK.hurtEnemy(G, e, Math.max(1, Math.round(dmg)), false, ang || 0, repel || 0);
    G._skHit = prev;
    return r;
  }
  function near(x, y, r, skip) {
    const out = [];
    for (const e of G.enemies) { if (!live(e) || (skip && skip(e))) continue; const [cx, cy] = mid(e); if (dist(cx, cy, x, y) <= r + (e.r || 0) * 0.5) out.push(e); }
    return out;
  }
  function nearest(x, y, r) {
    let best = null, bd = r;
    for (const e of G.enemies) { if (!live(e) || !inRoom(e)) continue; const [cx, cy] = mid(e), d = dist(cx, cy, x, y); if (d < bd) { bd = d; best = e; } }
    return best;
  }
  const burning = e => !!((e._db && e._db.fire && e._db.fire.t > 0) || (e._bmSt && e._bmSt.burn));
  function unburn(e) {
    if (e._db && e._db.fire) { if (e._db.fire.h && e._db.fire.h.stop) e._db.fire.h.stop(); delete e._db.fire; }
    if (e._bmSt && e._bmSt.burn) { if (e._bmSt.burn.h && e._bmSt.burn.h.stop) e._bmSt.burn.h.stop(); delete e._bmSt.burn; }
  }
  const debuff = (e, kind, o) => (K().debuff ? K().debuff(G, e, kind, o) : null);
  function fx(draw, dur, front) {
    G.props.push({ x: 0, y: front ? 1e9 : -1e9, t: 0, pbfx: true, update(G2, pr, dt) { pr.t += dt; if (pr.t >= dur) pr.gone = true; }, draw(ctx, G2, pr) { draw(ctx, pr.t / dur); } });
  }
  function ringFx(x, y, r, col, dur, fill) {
    fx((ctx, k) => {
      ctx.save(); ctx.globalAlpha = (fill ? 0.35 : 0.8) * (1 - k); ctx.strokeStyle = ctx.fillStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r * (0.2 + 0.8 * k), 0, 6.283); if (fill) ctx.fill(); else ctx.stroke(); ctx.restore();
    }, dur);
  }
  function flash(x, y) { if (K().fx && K().hasVfx && K().hasVfx('effect_shock1')) K().fx(G, 'effect_shock1', x, y, { scale: 0.8 }); }
  function bolt(x, y) { if (K().boltProp) K().boltProp(G, [x, y - 90], [x, y], 0.25); flash(x, y); }

  // ---------------------------------------------------------------- 2170 Tân Tinh Thần Thánh
  function holyNova(p) {
    const s = pbOf(p), H = TL.holy, R = H.r * T;
    s.cd.holy = H.cd; p.invulT = Math.max(p.invulT || 0, RU.hurtInvuln || 1);
    const n = Math.ceil(p.hpMax * H.heal);
    p.hp = Math.min(p.hpMax, Math.max(1, p.hp) + n); SK.num(G, p.x, p.y - 30, '+' + n, '#6bff6b');
    for (const a of (K().allies ? K().allies(G) : [])) if (a.hpMax && !a.gone) a.hp = Math.min(a.hpMax, a.hp + Math.ceil(a.hpMax * H.heal));
    for (const m of (G.mercs || [])) if (m.hpMax && !m.dead && !m.gone) m.hp = Math.min(m.hpMax, m.hp + Math.ceil(m.hpMax * H.heal));
    for (const b of G.bullets) if (b.side === 'e' && !b.dead && dist(b.x, b.y, p.x, p.y - 6) <= R) b.dead = true;
    for (const e of near(p.x, p.y - 6, R)) hurt(e, H.dmg, Math.atan2(e.y - p.y, e.x - p.x), 2);
    G.shake = Math.max(G.shake || 0, 6);
    ringFx(p.x, p.y - 6, R, '#ffeb04', 0.7); ringFx(p.x, p.y - 6, R * 0.5, '#ffffff', 0.5, true);
    s.holyN = (s.holyN || 0) + 1;
  }

  // ---------------------------------------------------------------- 2171 Đả Kích Linh Hồn
  function dropSouls(e) {
    const n = pickOf(e.boss || e.elite ? TL.soul.dropBig : TL.soul.drop);
    for (let i = 0; i < n; i++) {
      G.props.push({ x: e.x + rnd(-5, 5), y: e.y - 4 + rnd(-3, 3), t: 0, soul: true, vx: rnd(-30, 30), vy: rnd(-40, -10),
        update(G2, pr, dt) {
          const p = G.player; pr.t += dt;
          if (pr.t < 0.35) { pr.x += pr.vx * dt; pr.y += pr.vy * dt; return; }
          if (!p || p.st === 'dead') return;
          const tx = p.x, ty = p.y - 6, d = dist(pr.x, pr.y, tx, ty);
          if (d < 6) { const s = pbOf(p); s.souls = Math.min(TL.soul.need, (s.souls || 0) + 1); pr.gone = true; return; }
          if (d < TL.soul.pick * T) { const sp = Math.min(d, (110 + pr.t * 120) * dt); pr.x += (tx - pr.x) / d * sp; pr.y += (ty - pr.y) / d * sp; }
        },
        draw(ctx, G2, pr) {
          ctx.save(); ctx.globalAlpha = 0.55 + 0.3 * Math.sin(pr.t * 9); ctx.fillStyle = '#a473fc';
          ctx.beginPath(); ctx.arc(pr.x, pr.y - 2, 2.4, 0, 6.283); ctx.fill(); ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(pr.x, pr.y - 2, 4.5, 0, 6.283); ctx.fill(); ctx.restore();
        } });
    }
  }
  function soulStrike(p, e) {
    const s = pbOf(p), S = TL.soul;
    s.souls = 0;
    const dmg = Math.round(S.dmg * (1 + S.grow * (s.strikes || 0)));
    s.strikes = (s.strikes || 0) + 1;
    const [ex, ey] = mid(e), aoe = Math.round(dmg * S.aoe);
    hurt(e, dmg, Math.atan2(ey - p.y, ex - p.x), 2);
    for (const q of near(ex, ey, S.aoeR * T, q => q === e)) hurt(q, aoe, Math.atan2(q.y - ey, q.x - ex), 1);
    ringFx(ex, ey, S.aoeR * T, '#a473fc', 0.45); ringFx(ex, ey, 14, '#ffffff', 0.25, true);
    s.lastStrike = { dmg, aoe, n: s.strikes };
  }

  // ---------------------------------------------------------------- 2172 Vòng Băng
  function frostRing(p) {
    const F = TL.frost, R = F.r * T;
    for (const e of near(p.x, p.y - 6, R)) {
      if (e._pbFrost > 0) { debuff(e, 'ice'); e._pbFrost = 0; }
      else e._pbFrost = F.dur;
      e._pbSlow = F.dur;
    }
    ringFx(p.x, p.y - 6, R, '#00ffff', 0.6); ringFx(p.x, p.y - 6, R * 0.6, '#a8e6ff', 0.5, true);
  }
  function tickFrost(dt) {
    for (const e of G.enemies) {
      if (!(e._pbSlow > 0) && !(e._pbFrost > 0)) continue;
      if (!live(e)) { e._pbSlow = e._pbFrost = 0; continue; }
      if (e._pbFrost > 0) e._pbFrost -= dt;
      if (e._pbSlow > 0) {
        e._pbSlow -= dt; e.moveMul = TL.frost.slow; if (e.cd != null) e.cd += dt * (1 - TL.frost.slow);   // tốc bắn / đánh cũng chậm lại một nửa
        if (e._pbSlow <= 0 && !(e._db && e._db.ice && e._db.ice.t > 0)) e.moveMul = 1;
      }
    }
  }

  // ---------------------------------------------------------------- 2173 Phun Lửa
  function dragonBreath(p, s) {
    const D2 = TL.dragon, R = D2.range * T, a = s.dir, x = p.x, y = p.y - 8;
    const inCone = (px, py) => {
      const d = dist(px, py, x, y), da = Math.atan2(py - y, px - x) - a;
      return d <= R && Math.abs(Math.atan2(Math.sin(da), Math.cos(da))) <= D2.half;
    };
    const hits = [];
    for (const e of G.enemies) { if (!live(e) || !inRoom(e)) continue; const [cx, cy] = mid(e); if (inCone(cx, cy)) hits.push(e); }
    const booms = [];
    for (const e of hits) { if (burning(e)) booms.push(e); else { hurt(e, D2.dmg, a, 1); debuff(e, 'fire'); } }
    for (const e of booms) {
      const [cx, cy] = mid(e); unburn(e);
      for (const q of near(cx, cy, D2.boomR * T)) hurt(q, D2.boom, Math.atan2(q.y - cy, q.x - cx), 2);
      ringFx(cx, cy, D2.boomR * T, '#ff7a00', 0.4, true);
    }
    fx((ctx, k) => {
      ctx.save(); ctx.globalAlpha = 0.6 * (1 - k); ctx.fillStyle = '#ff5a00';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, R * (0.3 + 0.7 * k), a - D2.half, a + D2.half); ctx.closePath(); ctx.fill(); ctx.restore();
    }, 0.35, true);
    s.dragonN = (s.dragonN || 0) + 1;
    return { hits: hits.length, booms: booms.length };
  }

  // ---------------------------------------------------------------- 2174 Lốc Xoáy
  function spawnTornado(x, y, ang) {
    const C = TL.tornado, a = ang != null ? ang : SK.rand() * 6.283;
    const tw = { x, y, t: 0, life: C.life, vx: Math.cos(a) * C.speed, vy: Math.sin(a) * C.speed, tornado: true, ticks: new Map(),
      update(G2, pr, dt) {
        pr.t += dt;
        if (pr.t >= pr.life) { pr.gone = true; return; }
        const nx = pr.x + pr.vx * dt, ny = pr.y + pr.vy * dt;
        if (W.solidAt(G.map, nx, ny)) { pr.vx = -pr.vx; pr.vy = -pr.vy; } else { pr.x = nx; pr.y = ny; }
        for (const b of G.bullets) if (b.side === 'e' && !b.dead && dist(b.x, b.y, pr.x, pr.y) <= C.r * T * 0.6) b.dead = true;
        for (const e of G.enemies) {
          if (!live(e) || !inRoom(e)) continue;
          const [cx, cy] = mid(e), d = dist(cx, cy, pr.x, pr.y);
          if (d > C.r * T) continue;
          if (!e.boss && d > 2) { const m = Math.min(d, C.pull * dt); SK.moveBox(G.map, e, (pr.x - cx) / d * m, (pr.y - cy) / d * m, 3); }
          if (d <= C.hit * T && (G.t - (pr.ticks.get(e) || -9)) >= C.tick) { pr.ticks.set(e, G.t); hurt(e, C.dmg, Math.atan2(cy - pr.y, cx - pr.x), 0); }
        }
      },
      draw(ctx, G2, pr) {
        ctx.save(); const k = Math.min(1, pr.t / 0.4, (pr.life - pr.t) / 0.5);
        ctx.globalAlpha = 0.7 * Math.max(0, k); ctx.strokeStyle = '#7cff7c'; ctx.lineWidth = 1.5;
        for (let i = 0; i < 5; i++) { const r = 3 + i * 3, h = 4 + i * 4; ctx.beginPath(); ctx.ellipse(pr.x + Math.sin(pr.t * 8 + i) * 2, pr.y - h, r, r * 0.35, 0, 0, 6.283); ctx.stroke(); }
        ctx.restore();
      } };
    G.props.push(tw);
    return tw;
  }

  // ---------------------------------------------------------------- 2175 Đòn Hỗn Mang
  const ELEMENTS = ['boom', 'ice', 'poison', 'bolt', 'pull'];
  function pool(x, y, kind) {
    const C = TL.chaos, R = C.pool * T, col = kind === 'ice' ? '#a8e6ff' : '#7bd651';
    G.props.push({ x, y: -1e9, t: 0, k: 0, pbpool: kind, seen: new Set(),
      update(G2, pr, dt) {
        pr.t += dt; pr.k -= dt;
        if (pr.t >= C.poolLife) { pr.gone = true; return; }
        if (pr.k <= 0) {
          pr.k += C.poolTick;
          for (const e of near(x, y, R)) {
            hurt(e, 1, 0, 0);
            if (kind === 'ice' && !pr.seen.has(e)) { pr.seen.add(e); debuff(e, 'ice'); }
            if (kind === 'poison') debuff(e, 'poison');
          }
        }
      },
      draw(ctx, G2, pr) { ctx.save(); ctx.globalAlpha = 0.3 * (1 - pr.t / C.poolLife * 0.5); ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, R, R * 0.6, 0, 0, 6.283); ctx.fill(); ctx.restore(); } });
  }
  function chaosEffect(x, y, el) {
    const C = TL.chaos;
    if (el === 'boom') {
      ringFx(x, y, C.boomR * T, '#ff7a00', 0.4, true);
      for (const e of near(x, y, C.boomR * T)) { hurt(e, C.boom, Math.atan2(e.y - y, e.x - x), 2); debuff(e, 'fire'); }
    } else if (el === 'ice' || el === 'poison') pool(x, y, el);
    else if (el === 'bolt') {
      bolt(x, y); ringFx(x, y, C.boltR * T, '#5a98ff', 0.3);
      for (const e of near(x, y, C.boltR * T)) { hurt(e, C.bolt, Math.atan2(e.y - y, e.x - x), 1); if (K().stun) K().stun(e, 1); }
    } else if (el === 'pull') {
      ringFx(x, y, C.pullR * T, '#b47bff', C.pullT, false);
      const list = near(x, y, C.pullR * T).filter(e => !e.boss);
      G.props.push({ x, y: -1e9, t: 0, update(G2, pr, dt) {
        pr.t += dt; if (pr.t >= C.pullT) { pr.gone = true; return; }
        for (const e of list) { if (!live(e)) continue; const [cx, cy] = mid(e), d = dist(cx, cy, x, y); if (d > 2) { const m = Math.min(d, d / (C.pullT - pr.t + 0.05) * dt); SK.moveBox(G.map, e, (x - cx) / d * m, (y - cy) / d * m, 3); } }
      }, draw() {} });
      for (const e of list) hurt(e, 3, 0, 0);
    }
  }
  // Mỗi lần bắn đều đánh dấu đạn mới (_pbc) để đạn của lần bắn thường không bị tăng cường nhầm ở lần sau; chỉ lần ngay sau kỹ năng mới tăng.
  function chaosFire(p, w, s) {
    const boost = !!s.chaos;
    s.chaos = false;
    const el = (SK.plantbuff && SK.plantbuff.forceEl) || pickOf(ELEMENTS), C = TL.chaos;
    if (boost) s.chaosLast = el;
    if (boost && w && w.def && w.def.kind === 'melee') { s.chaosMelee = { el, until: G.t + 0.6 }; return; }
    s.chaosB = s.chaosB || [];
    for (let i = G.bullets.length - 1; i >= 0; i--) {
      const b = G.bullets[i];
      if (b._pbc) break;
      b._pbc = 1;
      if (!boost || b.side !== 'p' || b.vis) continue;
      b.dmg *= C.dmg; b.r = (b.r || 2) * C.size; b.scale = (b.scale || 1) * C.size;
      s.chaosB.push({ b, el, x: b.x, y: b.y });
    }
  }

  // ---------------------------------------------------------------- 2178 Pháo Nổ
  function dropFirecrackers(p) {
    const F = TL.fire, n = F.min + Math.floor(SK.rand() * (F.max - F.min + 1));
    for (let i = 0; i < n; i++) {
      const a = SK.rand() * 6.283, d = rnd(10, F.spread * T), big = SK.rand() < F.big;
      G.props.push({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d * 0.6, t: 0, life: rnd(F.life[0], F.life[1]), big, cracker: true,
        update(G2, pr, dt) {
          pr.t += dt;
          const r = pr.big ? F.bigR : F.r;
          let boom = pr.t >= pr.life;
          if (!boom) for (const e of G.enemies) if (live(e) && inRoom(e)) { const [cx, cy] = mid(e); if (dist(cx, cy, pr.x, pr.y) < 8 + (e.r || 4)) { boom = true; break; } }
          if (!boom) return;
          pr.gone = true;
          const dmg = pr.big ? F.bigDmg : F.dmg;
          ringFx(pr.x, pr.y, r * T, pr.big ? '#ff6a00' : '#ffd452', 0.3, true);
          for (const e of near(pr.x, pr.y, r * T)) { hurt(e, dmg, Math.atan2(e.y - pr.y, e.x - pr.x), 1); if (SK.chance(F.burn)) debuff(e, 'fire'); }
        },
        draw(ctx, G2, pr) {
          const bl = Math.floor(pr.t * 8) % 2;
          ctx.fillStyle = bl ? '#ff3a2a' : '#c8261a'; const w = pr.big ? 4 : 3, h = pr.big ? 7 : 5;
          ctx.fillRect(Math.round(pr.x) - w / 2, Math.round(pr.y) - h, w, h);
          ctx.fillStyle = '#ffd452'; ctx.fillRect(Math.round(pr.x), Math.round(pr.y) - h - 1, 1, 1);
        } });
    }
    return n;
  }

  // ---------------------------------------------------------------- đồng minh tạm (Không Quân Chi Viện, Bầy Khỉ)
  function animKey(anims, kinds) { return kinds.map(k => anims[k]).find(Boolean) || Object.values(anims).find(v => /ide|idle|stand/.test(v)) || Object.values(anims)[0]; }
  function drawAnim(ctx, a, key) {
    const fr = key && SK.animFrame(key, a.t);
    if (!fr || !SK.draw(ctx, fr, a.x, a.y, { flip: a.face < 0 })) { ctx.fillStyle = '#9fd2ff'; ctx.fillRect(a.x - 4, a.y - 12, 8, 12); }
  }
  function summonAir(p) {
    const A = TL.air, ids = ['npc_02', 'npc_05', 'npc_knight_01'], out = [];
    for (let i = 0; i < A.n; i++) {
      const pf = SK.prefab(ids[i % ids.length]), anims = (pf && pf[0] && pf[0].a) || {};
      const a = { x: p.x + (i - 1) * 16, y: p.y - 6, t: 0, face: 1, cd: 0.1 * i, life: A.life, pbAlly: true, pbNpc: true, slot: i, moving: false, shots: 0 };
      a.update = function (G2, pr, dt) {
        a.t += dt; a.life -= dt; a.cd -= dt;
        if (a.life <= 0 || !G.player) { pr.gone = a.gone = true; return; }
        const q = G.player, tx = q.x + (a.slot - 1) * 16, ty = q.y - 4 - Math.abs(a.slot - 1) * 2, d = dist(a.x, a.y, tx, ty);
        a.moving = d > 3; if (d > 40) { a.x = tx; a.y = ty; } else if (d > 3) { const m = Math.min(d, 70 * dt); a.x += (tx - a.x) / d * m; a.y += (ty - a.y) / d * m; }
        const e = nearest(a.x, a.y - 7, 12 * T);
        if (e) {
          const [cx, cy] = mid(e); a.face = cx >= a.x ? 1 : -1;
          if (a.cd <= 0 && SK.spawnBullet86) {
            a.cd = A.every; a.shots++;
            SK.spawnBullet86(G, 'p', 'bullet_1', a.x + (a.face > 0 ? 6 : -6), a.y - 7, Math.atan2(cy - (a.y - 7), cx - a.x), { dmg: A.dmg, repel: 1, spd: 40, h: 7, owner: a });
          }
        } else a.face = q.face || 1;
        pr.x = a.x; pr.y = a.y;
      };
      a.draw = ctx => {
        drawAnim(ctx, a, a.moving ? animKey(anims, ['run', 'npc_run']) : animKey(anims, ['idle']));
        ctx.fillStyle = '#111'; ctx.fillRect(Math.round(a.x) + (a.face > 0 ? 0 : -5), Math.round(a.y) - 11, 5, 2);   // Kính Râm
      };
      G.props.push({ x: a.x, y: a.y, pbAlly: true, ally: a, update: (G2, pr, dt) => a.update(G2, pr, dt), draw: (ctx, G2) => a.draw(ctx) });
      out.push(a);
    }
    ringFx(p.x, p.y, 28, '#ffffff', 0.5);
    return out;
  }
  function summonMonkeys(p) {
    const M = TL.monkey, out = [];
    for (let i = 0; i < M.n; i++) {
      const a = { x: p.x + (i - 1) * 12, y: p.y + 4, t: 0, face: 1, cd: 0.3, life: M.life, pbAlly: true, pbMonkey: true, anims: { idle: 'monkey01/ide', run: 'monkey01/run' }, moving: false };
      G.props.push({ x: a.x, y: a.y, pbAlly: true, ally: a,
        update(G2, pr, dt) {
          a.t += dt; a.life -= dt; a.cd -= dt;
          const q = G.player;
          if (a.life <= 0 || !q) { pr.gone = a.gone = true; return; }
          const e = nearest(a.x, a.y - 6, 12 * T);
          a.moving = false;
          if (e) {
            const [cx, cy] = mid(e), d = dist(cx, cy, a.x, a.y - 6);
            a.face = cx >= a.x ? 1 : -1;
            if (d > 10) { const m = Math.min(d, M.speed * dt); SK.moveBox(G.map, a, (cx - a.x) / d * m, (e.y - a.y) / d * m, 3); a.moving = true; }
            else if (a.cd <= 0) { a.cd = M.every; hurt(e, M.dmg, Math.atan2(cy - a.y, cx - a.x), 1, 'pbmonkey'); }
          } else {
            const tx = q.x - q.face * (10 + i * 5), ty = q.y + 3, d = dist(a.x, a.y, tx, ty);
            if (d > 40) { a.x = tx; a.y = ty; } else if (d > 4) { const m = Math.min(d, M.speed * dt); SK.moveBox(G.map, a, (tx - a.x) / d * m, (ty - a.y) / d * m, 3); a.moving = true; a.face = tx >= a.x ? 1 : -1; }
          }
          pr.x = a.x; pr.y = a.y;
        },
        draw(ctx) { drawAnim(ctx, a, a.moving ? a.anims.run : a.anims.idle); } });
      out.push(a);
    }
    ringFx(p.x, p.y, 24, '#ffb347', 0.4);
    return out;
  }

  // ---------------------------------------------------------------- 2179 Sấm Sét
  function allyList() {
    const out = [];
    if (G.pet && !G.pet.hidden) out.push(G.pet);
    for (const m of (G.mercs || [])) if (!m.dead && !m.gone) out.push(m);
    for (const a of (K().allies ? K().allies(G) : [])) if (!a.down) out.push(a);
    for (const pr of G.props) if (pr.gardenPet || (pr.pbAlly && pr.ally && !pr.ally.gone)) out.push(pr.gardenPet || pr.ally);
    return out;
  }

  // ---------------------------------------------------------------- 2183 Sao Chép Vũ Khí
  function weaponCopy(p, s) {
    const main = p.weapons[p.cur], back = p.weapons[1 - p.cur];
    if (!main || !back || !main.def || !back.def || main.id === back.id) return false;
    const bad = d => d.kind === 'melee' || d.charge > 0 || !!(d.w86 && SK.CUSTOM_FIRE && SK.CUSTOM_FIRE[d.w86.cls]);   // lớp tự viết (gọi lính, sổ tử thần...) không sao chép được
    if (bad(main.def) || bad(back.def)) return false;
    s.copyW = main; s.copyT = TL.copy.dur; s.cd.copy = TL.copy.cd;
    main.def = Object.assign({}, back.def, { cost: main.def.cost, rps: main.def.rps, prefab: main.def.prefab, name: main.def.name });
    return true;
  }
  function endCopy(p, s) {
    s.copyT = 0; s.copyW = null;
    if (SK.ROOMS.refreshWeapons) SK.ROOMS.refreshWeapons(p);
  }

  // ---------------------------------------------------------------- móc: sát thương lên người
  const prevHurtP = SK.hurtPlayer;
  SK.hurtPlayer = function (G2, dmg, ...rest) {
    const p = G2.player;
    if (p && p.buffs && p.st !== 'dead' && !(p.invulT > 0) && dmg > 0 && (has(2172) || has(2170))) {
      const s = pbOf(p);
      if (has(2172) && s.block > 0) {
        s.block--; s.blockCd = 0; p.invulT = RU.hurtInvuln || 1;
        frostRing(p); s.frostN = (s.frostN || 0) + 1;
        return false;
      }
      const real = dmg + (G2.badass && SK.DS.badass ? SK.DS.badass.dmgAdd || 0 : 0);
      if (has(2170) && !(s.cd.holy > 0) && real >= p.hp + p.armor) { holyNova(p); return false; }
    }
    return prevHurtP.call(this, G2, dmg, ...rest);
  };

  // ---------------------------------------------------------------- móc: sát thương lên quái (Nhân Sâm, Hấp Thụ Sát Thương)
  const prevHurtE = SK.hurtEnemy;
  SK.hurtEnemy = function (G2, e, dmg, crit, ang, repel, ...rest) {
    const p = G2.player;
    if (p && p.buffs && p.buffs.length && !G2._skHit && e && live(e) && p.st !== 'dead' && (has(2180) || has(2182))) {
      const s = pbOf(p);
      if (has(2180) && SK.chance(TL.arb.chance)) {
        dmg += TL.arb.dmg;
        const w = p.weapons[p.cur], cost = (w && w.def && w.def.cost) || 0, back = Math.ceil(cost * TL.arb.energy);
        if (back > 0) p.energy = Math.min(p.energyMax, p.energy + back);
        s.arbN = (s.arbN || 0) + 1; s.arbLast = { dmg, back };
        SK.num(G2, p.x, p.y - 30, '+' + back, '#6ac8ff');
      }
      if (has(2182)) {
        const A = TL.absorb, base = crit ? dmg / critMul() : dmg;
        if (!s.abs) s.abs = { stage: 0, t: 0, store: 0 };
        const ab = s.abs;
        if (ab.stage === 0) { ab.stage = 1; ab.t = A.absorb; }
        if (ab.stage === 1) { ab.store += base * A.frac; dmg = 0; }
        else if (ab.stage === 2) dmg += Math.round(ab.store);
      }
    }
    return prevHurtE.call(this, G2, e, dmg, crit, ang, repel, ...rest);
  };

  // ---------------------------------------------------------------- sự kiện
  SK.on('runStart', G2 => { if (G2.player) G2.player.pb = { cd: {} }; });
  SK.on('enemyKill', (G2, e) => {
    const p = G2.player; if (!p || !p.buffs || !p.buffs.length) return;
    if (has(2171)) dropSouls(e);
  });
  SK.on('enemyHit', (G2, e, dmg, crit) => {
    const p = G2.player;
    if (!p || !p.buffs || !p.buffs.length) return;
    const tag = G2._skHit;
    if (tag === 'pb' || tag === 'dot') return;
    const s = pbOf(p);
    if (has(2171) && !tag && (s.souls || 0) >= TL.soul.need && live(e)) soulStrike(p, e);
    if (has(2175) && s.chaosMelee && G2.t <= s.chaosMelee.until && live(e)) {
      const el = s.chaosMelee.el; s.chaosMelee = null;
      hurt(e, dmg * (TL.chaos.dmg - 1), 0, 0); chaosEffect(e.x, e.y - 6, el);
    }
    if (has(2181)) {
      const R = TL.rose, marked = e._pbMark > G2.t;
      if (marked && !tag && dmg > 0) {
        const b = evenNear(dmg * R.dmg), [ex, ey] = mid(e);
        ringFx(ex, ey, R.r * T, '#3a1a4a', 0.35, true);
        s.roseLast = { dmg: b, n: 0 };
        for (const q of near(ex, ey, R.r * T)) { hurt(q, b, 0, 0); s.roseLast.n++; }
      }
      if (live(e)) e._pbMark = G2.t + R.life;
    }
  });
  SK.on('skill', (G2, p) => {
    if (!p.buffs || !p.buffs.length) return;
    const s = pbOf(p);
    if (has(2175)) s.chaos = true;
    if (has(2178)) dropFirecrackers(p);
  });
  SK.on('fire', (G2, p, w) => {
    if (!p.buffs || !p.buffs.length) return;
    const s = pbOf(p);
    if (has(2175)) chaosFire(p, w, s);
  });
  SK.on('stageEnter', (G2) => {
    const p = G2.player; if (!p) return;
    const s = pbOf(p);
    s.block = TL.frost.max; s.blockCd = 0; s.last = null; s.chaosB = []; s.dragonCd = 0;
    s.copyT = 0; s.copyW = null;
    G2.props.push(controller());
  });

  // ---------------------------------------------------------------- bộ điều khiển mỗi bước
  function controller() {
    return { x: 0, y: 0, pbctl: true, update(G2, pr, dt) { tick(G2, pr, dt); },
      draw(ctx) {
        const p = G.player; if (!p || p.st === 'dead' || !p.pb || !p.buffs) return;
        const s = p.pb;
        if (has(2171) && s.souls) {
          for (let i = 0; i < TL.soul.need; i++) { ctx.fillStyle = i < s.souls ? '#a473fc' : 'rgba(164,115,252,0.25)'; ctx.fillRect(Math.round(p.x) - 18 + i * 3, Math.round(p.y) - 34, 2, 2); }
        }
        if (has(2182) && s.abs && s.abs.stage) { ctx.fillStyle = s.abs.stage === 1 ? '#c9d2df' : '#ffd452'; ctx.font = '7px sans-serif'; ctx.textAlign = 'center'; ctx.fillText((s.abs.stage === 1 ? '~' : '+') + Math.round(s.abs.store), Math.round(p.x), Math.round(p.y) - 38); }
        if (has(2181)) for (const e of G.enemies) if (e._pbMark > G.t && live(e)) { const [cx, cy] = mid(e); ctx.fillStyle = '#1a0a22'; ctx.beginPath(); ctx.arc(cx, cy - 14, 3, 0, 6.283); ctx.fill(); ctx.fillStyle = '#c0245c'; ctx.fillRect(Math.round(cx) - 1, Math.round(cy) - 15, 2, 2); }
      } };
  }
  function tick(G2, pr, dt) {
    const p = G.player; if (!p || !p.buffs || !p.buffs.length) return;
    pr.x = p.x; pr.y = p.y + 1;
    const s = pbOf(p);
    for (const k in s.cd) if (s.cd[k] > 0) s.cd[k] -= dt;
    tickFrost(dt);
    if (p.st === 'dead') return;
    // vị trí / hướng chạy
    const lp = s.last; s.last = [p.x, p.y];
    let moved = 0;
    if (lp) { moved = dist(p.x, p.y, lp[0], lp[1]); if (moved > 0.2) s.dir = Math.atan2(p.y - lp[1], p.x - lp[0]); if (moved > 40) moved = 0; }
    if (s.dir == null) s.dir = p.face < 0 ? Math.PI : 0;
    // 2172 tầng khiên
    if (has(2172)) {
      if (s.block == null) { s.block = TL.frost.max; s.blockCd = 0; }
      if (s.block < TL.frost.max) { s.blockCd = (s.blockCd || 0) + dt; if (s.blockCd >= TL.frost.every) { s.block++; s.blockCd = 0; } }
    }
    // 2173 phun lửa
    if (has(2173)) {
      s.dragonCd = (s.dragonCd == null ? TL.dragon.every : s.dragonCd) - dt;
      if (s.dragonCd <= 0 && fighting()) { s.dragonCd = TL.dragon.every; dragonBreath(p, s); }
    }
    // 2174 lốc xoáy theo quãng đường
    if (has(2174)) {
      s.walk = (s.walk || 0) + moved;
      if (s.walk >= TL.tornado.dist * T) { s.walk = 0; spawnTornado(p.x, p.y - 6); s.tornadoN = (s.tornadoN || 0) + 1; }
    }
    // 2175 hiệu ứng khi đạn mạnh hết đường
    if (s.chaosB && s.chaosB.length) {
      s.chaosB = s.chaosB.filter(o => {
        if (o.b.dead || G.bullets.indexOf(o.b) < 0) { chaosEffect(o.x, o.y, o.el); s.chaosN = (s.chaosN || 0) + 1; return false; }
        o.x = o.b.x; o.y = o.b.y; return true;
      });
    }
    // 2177 gọi lính yểm trợ
    if (has(2177) && !(s.cd.air > 0) && fighting()) { s.cd.air = TL.air.cd; s.airN = (s.airN || 0) + 1; summonAir(p); }
    // 2184 bầy khỉ
    if (has(2184) && !(s.cd.monkey > 0) && fighting()) { s.cd.monkey = TL.monkey.cd; s.monkeyN = (s.monkeyN || 0) + 1; summonMonkeys(p); }
    // 2179 sấm khi ở gần đồng minh
    if (has(2179)) {
      s.boltT = (s.boltT || 0) - dt;
      if (s.boltT <= 0) {
        const B = TL.bolt, ally = allyList().find(a => dist(a.x, a.y, p.x, p.y) <= B.near * T), e = ally && nearest(p.x, p.y - 8, B.reach * T);
        if (e) { s.boltT = B.every; const [cx, cy] = mid(e); bolt(cx, cy); hurt(e, B.dmg, 0, 1); s.boltN = (s.boltN || 0) + 1; }
        else s.boltT = 0.1;
      }
    }
    // 2182 các giai đoạn
    if (has(2182) && s.abs && s.abs.stage) {
      const ab = s.abs; ab.t -= dt;
      if (ab.t <= 0) { if (ab.stage === 1) { ab.stage = ab.store > 0 ? 2 : 0; ab.t = TL.absorb.hold; } else { ab.stage = 0; ab.store = 0; } }
    }
    // 2183 sao chép vũ khí
    if (has(2183)) {
      if (s.copyT > 0) { s.copyT -= dt; if (s.copyT <= 0 || p.weapons[p.cur] !== s.copyW) endCopy(p, s); }
      else if (!(s.cd.copy > 0) && fighting()) weaponCopy(p, s);
    }
  }

  SK.plantbuff = { TL, NAMES, ids: Object.keys(NAMES).map(Number), forceEl: null, ELEMENTS, spawnTornado, dragonBreath, summonAir, summonMonkeys, dropFirecrackers, holyNova, soulStrike };
})();
