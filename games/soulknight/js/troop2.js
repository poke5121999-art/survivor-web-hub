// Chỉ Huy Nhỏ đợt 2 (nạp sau js/troop.js): kỹ năng riêng của lính, Còi Tập hợp/Hành động, 5 ô vũ khí pet (Pha Lê Đóng Băng,
// Túi Chữa Trị, Máy Tạo Lực Trường, Máy Hồi Sức Tim Phổi), quầy rượu + Mực Xào + Tư Chất Lính Thuê, thùng rác, đưa vũ khí cho
// lính, mục tiêu cúp Đồng/Bạc/Vàng (lưu localStorage 'sk.troop.v1'). Số liệu: wiki Little_Commander / Whistle (tools/polish/MODES.md
// mục 2g); chỗ wiki không có số ghi [ƯỚC LƯỢNG].
(function () {
  'use strict';
  const SK = window.SK, DS = SK.DS, T = SK.troop, C = SK.TROOP, K = SK.skillKit, U = SK.PPU;
  if (!T || !K) return;
  const on = G => G && G.mode === 'troop' && G.troop;
  const say = (G, m) => T.say(G, m);
  // Quầy rượu và kỹ năng lính dùng Math.random riêng để không làm lệch dòng ngẫu nhiên có hạt giống của ván (bản đồ, rơi đồ)
  const rnd = () => Math.random(), pickOf = l => l[Math.floor(Math.random() * l.length)];

  // ============================================================ kỹ năng anh hùng của lính
  // Kỹ năng của người chơi (js/skills/*) gắn với G.player nên không gọi được cho lính; mỗi anh hùng có bản rút gọn dựng từ mô tả
  // wiki [WIKI LC "Mercenaries"]; mọi số sát thương/tầm/thời gian là [ƯỚC LƯỢNG] (wiki chỉ cho hồi chiêu, trong C.HEROES).
  // fn(G, a, rec, up, e) trả false = chưa dùng; need = điều kiện dùng (mặc định có địch trong 12 đv).
  const foesAround = (G, x, y, r) => K.inRadius(G, x, y, r);
  const nearestFoe = (G, x, y, r) => K.nearest(G, x, y, r);
  function zone(G, o) {
    const z = Object.assign({ t: 0, acc: 0, color: '#9fd2ff', r: 30 }, o);
    G.props.push({ tr2: 1, x: z.x, y: z.y, update(G2, pr, dt) {
      z.t += dt; z.acc += dt;
      if (z.follow) { z.x = z.follow.x; z.y = z.follow.y - 6; pr.x = z.x; pr.y = z.y; }
      if (z.every && z.acc >= z.every) { z.acc -= z.every; if (z.tick) z.tick(G2, z); }
      if (z.each) z.each(G2, z, dt);
      if (z.t >= z.life) pr.gone = true;
    }, draw(ctx) {
      const k = Math.min(1, (z.life - z.t) / 0.4);
      ctx.save(); ctx.globalAlpha = 0.35 * k; ctx.fillStyle = z.color; ctx.strokeStyle = z.color;
      ctx.beginPath();
      if (z.hex) { for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.lineTo(z.x + Math.cos(a) * z.r, z.y + Math.sin(a) * z.r * 0.75); } ctx.closePath(); }
      else ctx.ellipse(z.x, z.y, z.r, z.r * 0.75, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.globalAlpha = 0.8 * k; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
    } });
    return z;
  }
  function killBullets(G, x, y, r) {
    let n = 0;
    for (const b of G.bullets) if (b.side === 'e' && !b.dead && Math.hypot(b.x - x, b.y - y) < r) { b.dead = true; n++; }
    return n;
  }
  // Lính phụ (phân thân, tháp súng, drone, xác sống): dựng trên SK.addWeaponAlly, sống life giây, bắn quái gần nhất.
  function summon(G, owner, o) {
    const made = [], n = o.n || 1;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2, x = (o.x != null ? o.x : owner.x) + Math.cos(ang) * (n > 1 ? 9 : 0), y = (o.y != null ? o.y : owner.y) + Math.sin(ang) * (n > 1 ? 6 : 0);
      made.push(SK.addWeaponAlly(G, {
        tr2: 1, x, y, hp: o.hp, hpMax: o.hp, cd: 0.4 + i * 0.1, life: o.life, owner: G.player, face: owner.face || 1, kind: o.kind,
        update(G2, s, dt) {
          s.moving = false; s.cd -= dt;
          if (o.follow && Math.hypot(G2.player.x - s.x, G2.player.y - s.y) > 24) {
            const dx = G2.player.x - s.x, dy = G2.player.y - s.y, d = Math.hypot(dx, dy), st = Math.min(d, 6 * U * dt);
            SK.moveBox(G2.map, s, dx / d * st, dy / d * st, 3); s.moving = true;
          }
          const e = nearestFoe(G2, s.x, s.y - 7, o.range || 12 * U);
          if (!e || s.cd > 0) return;
          s.cd = o.cd || 0.8;
          const [ex, ey] = K.ec(e), ang2 = Math.atan2(ey - (s.y - 7), ex - s.x);
          s.face = ex >= s.x ? 1 : -1;
          SK.spawnBullet86(G2, 'p', o.pf || 'bullet_1', s.x + Math.cos(ang2) * 5, s.y - 7 + Math.sin(ang2) * 5, ang2, { dmg: o.dmg, crit: false, repel: 1, owner: s, h: 7, spd: o.spd || 30 });
        },
        onDie(G2, s) { s.gone = true; },
        draw(ctx, G2, s) {
          const fade = o.life - s.t < 0.6 ? Math.max(0, (o.life - s.t) / 0.6) : 1;
          ctx.save(); ctx.globalAlpha = fade * (o.ghost ? 0.7 : 1);
          if (o.hero) T.heroSprite(ctx, o.hero, s.x, s.y, s.t);
          else {
            ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(s.x, s.y, 5, 2, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = o.color || '#8fd0ff'; ctx.fillRect(s.x - 4, s.y - (o.fly ? 14 : 9), 8, o.fly ? 6 : 9);
            ctx.fillStyle = '#fff'; ctx.fillRect(s.x + (s.face > 0 ? 1 : -4), s.y - (o.fly ? 13 : 7), 3, 2);
          }
          ctx.restore();
        }
      }));
    }
    return made;
  }
  const allAllies = G => [...G.troop.allies.values()].filter(a => !a.dead && !a.gone);
  const buff = (a, dur, mul) => { a.buffT = Math.max(a.buffT || 0, dur); a.dmgMul = Math.max(a.dmgMul || 1, mul); };
  const strike = (G, a, e, dmg, fx) => K.hit(G, a, e, dmg, { repel: 2, fx: fx || 'hit_white', noMul: true });
  const lastKills = [];   // vị trí quái vừa chết (cho Thuật Sĩ Tử Thần)
  SK.on('enemyKill', (G, e) => { if (on(G)) { lastKills.push({ x: e.x, y: e.y, t: G.t }); if (lastKills.length > 6) lastKills.shift(); } });

  const HS = {
    // Kỵ Sĩ: chép vũ khí tạm -> sát thương x2 trong 5 s (bản nâng x3, thêm chí mạng 'Chaotic Strike' +20)
    knight: { fn(G, a, rec, up) { buff(a, 5, up ? 3 : 2); if (up) { a.critT = 5; a.critBonus = 20; } return true; } },
    // Du Hiệp: Iaido 5 nhát (bản nâng 10), mỗi nhát 6 sát thương vào quái gần nhất trong tầm
    ranger: { fn(G, a, rec, up) {
      const n = up ? 10 : 5; let done = 0;
      for (let i = 0; i < n; i++) { const t = nearestFoe(G, a.x, a.y - 7, 14 * U); if (!t) break; strike(G, a, t, 6, 'hit_blue'); done++; }
      a.shieldT = 0.6; return done > 0;
    } },
    // Pháp Sư: sét gây choáng 2 s + 10 sát thương (bản nâng thêm 3 cầu lửa)
    mage: { fn(G, a, rec, up, e) {
      strike(G, a, e, 10, 'hit_blue'); K.stun(e, 2);
      if (up) { const [ex, ey] = K.ec(e), b = Math.atan2(ey - (a.y - 7), ex - a.x); for (let i = -1; i <= 1; i++) SK.spawnBullet86(G, 'p', 'bullet_2', a.x, a.y - 7, b + i * 0.25, { dmg: 8, crit: false, repel: 1, owner: a, h: 7, spd: 24 }); }
      return true;
    } },
    // Sát Thủ: phân thân (1, bản nâng 2 con máu hơn) 8 s
    assassin: { fn(G, a, rec, up) { summon(G, a, { n: up ? 2 : 1, hp: up ? 60 : 30, life: 8, dmg: 5, cd: 0.5, hero: 'assassin', ghost: true, follow: true, kind: 'clone' }); return true; } },
    // Nhà Giả Kim: 3 chai độc rơi xuống quái (bản nâng: nguyên tố luân phiên băng/lửa), vũng 4 s
    alchemist: { fn(G, a, rec, up, e) {
      for (let i = 0; i < 3; i++) {
        const t = nearestFoe(G, a.x, a.y - 7, 14 * U) || e, [ex, ey] = K.ec(t), kind = up ? (i % 2 ? 'fire' : 'ice') : 'poison';
        zone(G, { x: ex + (i - 1) * 10, y: ey, r: 22, life: 4, every: 0.5, color: kind === 'fire' ? '#ff8a3a' : kind === 'ice' ? '#7fd3ff' : '#7bd36a',
          tick(G2, z) { for (const q of foesAround(G2, z.x, z.y, z.r)) { strike(G2, a, q, 3, 'hit_white'); try { K.debuff(G2, q, kind); } catch (er) { /* hiệu ứng không có thì bỏ */ } } } });
      }
      return true;
    } },
    // Kỹ Sư: tháp súng (máu 10) / tháp chặn đạn (máu 15, 8 sát thương), đứng yên 10 s
    engineer: { fn(G, a, rec, up) { summon(G, a, { n: 1, hp: up ? 15 : 10, life: 10, dmg: up ? 8 : 4, cd: 0.4, pf: 'bullet_2', color: '#c8c8c8', kind: 'turret' }); if (up) killBullets(G, a.x, a.y, 40); return true; } },
    // Ma Cà Rồng: lỗ đen hút máu 4 s (bản nâng 3 lỗ): hút quái lại, mỗi nhịp 3 sát thương, lính hồi 1
    vampire: { fn(G, a, rec, up, e) {
      const [ex, ey] = K.ec(e);
      for (let i = 0; i < (up ? 3 : 1); i++) zone(G, { x: ex + (i - (up ? 1 : 0)) * 26, y: ey, r: 34, life: 4, every: 0.5, color: '#7a2a8a',
        tick(G2, z) { for (const q of foesAround(G2, z.x, z.y, z.r)) { strike(G2, a, q, 3, 'hit_white'); q.kx += (z.x - q.x) * 1.2; q.ky += (z.y - q.y) * 1.2; const s = T.stat(rec); rec.hp = Math.min(s.hp, rec.hp + 1); } } });
      return true;
    } },
    // Hiệp Sĩ Thánh: hồi đầy giáp + khiên 2 s (bản nâng 4 s)
    paladin: { fn(G, a, rec, up) { rec.armor = T.stat(rec).armor; a.shieldT = up ? 4 : 2; SK.num(G, a.x, a.y - 26, 'Khiên', '#9fd2ff'); return true; } },
    // Tiên Nữ: lục giác +25 chí mạng 5 s (bản nâng 10 s) cho lính
    elves: { fn(G, a, rec, up) { for (const q of allAllies(G)) { q.critT = up ? 10 : 5; q.critBonus = 25; } return true; } },
    // Người Sói: điên cuồng hồi 10 máu (bản nâng 20), sát thương x1,5 trong 8 s
    werewolf: { fn(G, a, rec, up) { const s = T.stat(rec); rec.hp = Math.min(s.hp, rec.hp + (up ? 20 : 10)); buff(a, 8, 1.5); return true; } },
    // Linh Mục: hồi 11 máu cho cả đội (bản nâng 22 + hồi đầy giáp) và tăng công tốc 5 s (sát thương x1,3)
    priest: { need(G) { return G.troop.recs.some(r => !r.dead && r.hp < T.stat(r).hp * 0.8); },
      fn(G, a, rec, up) { for (const r of G.troop.recs) { if (r.dead) continue; const s = T.stat(r); r.hp = Math.min(s.hp, r.hp + (up ? 22 : 11)); if (up) r.armor = s.armor; } for (const q of allAllies(G)) buff(q, 5, 1.3); SK.emit('troopHeal', G); return true; } },
    // Tu Sĩ Rừng (druid): thời gian hồi chiêu ∞ [WIKI LC]: không dùng kỹ năng
    // Robot: 4 drone 8 s (bản nâng 6 drone 16 s)
    robot: { fn(G, a, rec, up) { summon(G, a, { n: up ? 6 : 4, hp: 6, life: up ? 16 : 8, dmg: 3, cd: 0.5, color: '#9aa4b5', fly: true, follow: true, kind: 'drone' }); return true; } },
    // Cuồng Chiến: cho cả đội Weapon Boost 5 s (bản nâng 10 s): sát thương x1,5
    viking: { fn(G, a, rec, up) { for (const q of allAllies(G)) buff(q, up ? 10 : 5, 1.5); return true; } },
    // Thuật Sĩ Tử Thần: hồi sinh quái vừa chết làm đồng minh 15 s (bản nâng 30 s)
    necromancer: { need(G) { return lastKills.some(k => G.t - k.t < 12); },
      fn(G, a, rec, up) { const k = lastKills.filter(q => G.t - q.t < 12).pop(); if (!k) return false; lastKills.length = 0; summon(G, a, { n: 1, x: k.x, y: k.y, hp: 20, life: up ? 30 : 15, dmg: 4, cd: 0.7, color: '#8a6ad0', follow: true, kind: 'undead' }); return true; } },
    // Cảnh Sát: không kích 3 điểm (bản nâng 6 điểm + vũng lửa), nổ sau 0,8 s, 12 sát thương bán kính 22
    officer: { fn(G, a, rec, up, e) {
      const n = up ? 6 : 3;
      for (let i = 0; i < n; i++) {
        const t = nearestFoe(G, a.x, a.y - 7, 14 * U) || e, [ex, ey] = K.ec(t), x = ex + (rnd() - 0.5) * 30, y = ey + (rnd() - 0.5) * 20, born = G.t;
        G.props.push({ tr2: 1, x, y, update(G2, pr) {
          if (G2.t - born < 0.8 + i * 0.15) return; pr.gone = true;
          for (const q of foesAround(G2, x, y, 22)) strike(G2, a, q, 12, 'hit_white');
          SK.fx(G2, 'ring', x, y - 4, { dur: 0.3, color: '#ffb04a' });
          if (up) zone(G2, { x, y, r: 18, life: 3, every: 0.5, color: '#ff8a3a', tick(G3, z) { for (const q of foesAround(G3, z.x, z.y, z.r)) strike(G3, a, q, 3, 'hit_white'); } });
        }, draw(ctx, G2) { const k = Math.min(1, (G2.t - born) / 0.8); ctx.strokeStyle = '#ff4a4a'; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.ellipse(x, y, 22 * k, 16 * k, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; } });
      }
      return true;
    } },
    // Đạo Sĩ: kiếm bay chặn đạn quanh người 5 s (bản nâng: Bát Quái to hơn, 8 s)
    taoist: { fn(G, a, rec, up) {
      zone(G, { x: a.x, y: a.y - 6, follow: a, r: up ? 36 : 26, life: up ? 8 : 5, hex: up, color: '#e8d27a', each(G2, z) { killBullets(G2, z.x, z.y, z.r); } });
      return true;
    } }
  };
  T.HEROSKILL = HS;
  const cdOf = rec => (C.HEROES[rec.hero][3]) * (1 - (rec.cdCut || 0));
  T.tickSkill = function (G, a, rec, dt, e) {
    a.buffT = Math.max(0, (a.buffT || 0) - dt); a.critT = Math.max(0, (a.critT || 0) - dt); a.shieldT = Math.max(0, (a.shieldT || 0) - dt);
    const S = HS[rec.hero]; if (!S || rec.dead) return;
    if (a.skCd == null) a.skCd = 2;   // lần đầu sau 2 s [ƯỚC LƯỢNG]
    a.skCd -= dt; if (a.skCd > 0) return;
    if (S.need ? !S.need(G, a, rec, e) : !e) return;
    if (S.fn(G, a, rec, rec.up, e) === false) return;
    a.skCd = cdOf(rec); rec.skUsed = (rec.skUsed || 0) + 1;
    SK.fx(G, 'ring', a.x, a.y - 8, { dur: 0.3, color: '#ffd84a' });
    SK.emit('troopSkill', G, rec.hero, rec.up);
  };

  // ============================================================ Còi và 5 ô vũ khí pet
  const PETW = {
    troop_ice: { name: 'Pha Lê Đóng Băng', cost: 50, cd: 8 },        // 50 NL, 8 vệt băng 1 s, 3 ST + đóng băng, phá đạn [WIKI LC]; hồi chiêu [ƯỚC LƯỢNG]
    troop_heal: { name: 'Túi Chữa Trị', cost: 60, cd: 15 },
    troop_shield: { name: 'Máy Tạo Lực Trường', cost: 70, cd: 12 },  // lục giác chắn đạn 4 s [WIKI LC]
    troop_reborn: { name: 'Máy Hồi Sức Tim Phổi', cost: 100, cd: 20 }// hồi sinh 1 lính niệm 1 s [WIKI LC]
  };
  C.PETW = PETW;
  for (const id in PETW) {
    Object.defineProperty(DS.weapons, id, { configurable: true, writable: true, enumerable: false, value: {
      name: PETW[id].name, nameEn: id, kind: 'troop', dmg: 0, crit: 0, rps: 1 / PETW[id].cd, cost: PETW[id].cost, grade: 1, rarity: 'White', sprite: null, moveMod: 0 } });
  }
  const WIELD = id => id === 'troop_bite' || !!PETW[id];
  const PET = {
    troop_ice(G, p) {
      const hit = new Set(), R = 38;
      zone(G, { x: p.x, y: p.y - 6, follow: p, r: R, life: 1, color: '#bfeaff', each(G2, z) {
        killBullets(G2, z.x, z.y, R);
        for (const e of foesAround(G2, z.x, z.y, R)) if (!hit.has(e)) { hit.add(e); strike(G2, p, e, 3, 'hit_blue'); try { K.debuff(G2, e, 'ice'); } catch (er) { /* bỏ */ } }
      } });
      return true;
    },
    troop_heal(G) { T.healTeam(G); return true; },
    troop_shield(G, p) { zone(G, { x: p.x, y: p.y - 6, follow: p, r: 36, life: 4, hex: true, color: '#7fe0ff', each(G2, z) { killBullets(G2, z.x, z.y, z.r); } }); return true; },
    troop_reborn(G, p) {
      const t = G.troop, rec = t.recs.find(r => r.dead);
      if (!rec || t.reviving) { say(G, 'Không có lính nào cần hồi sức'); return false; }
      t.reviving = rec;
      const born = G.t;
      G.props.push({ tr2: 1, x: p.x, y: p.y, update(G2, pr) {
        if (G2.t - born < 1) return; pr.gone = true; t.reviving = null;
        if (!on(G2) || !rec.dead) return;
        const s = T.stat(rec); rec.dead = false; rec.hp = s.hp; rec.armor = s.armor;   // đầy HP và giáp [WIKI LC]
        T.respawn(G2); SK.emit('troopRevive', G2, rec);
      }, draw(ctx, G2) { ctx.fillStyle = '#ff6a6a'; ctx.globalAlpha = 0.6; ctx.fillRect(p.x - 4, p.y - 26 - Math.sin((G2.t - born) * 12) * 2, 8, 3); ctx.globalAlpha = 1; } });
      return true;
    }
  };
  SK.WEAPON_KINDS.troop = { fire(G, p, w) { if (!on(G)) return; if (PET[w.id](G, p, w) === false) { p.energy += w.def.cost; w.cd = 0.3; } else SK.emit('troopPetSkill', G, w.id); } };
  T.setWeapon = function (G, id) {
    const t = G.troop, p = G.player;
    t.wobj = t.wobj || {};
    const w = t.wobj[id] || (t.wobj[id] = SK.makeWeapon(id));
    p.weapons[0] = w; p.cur = 0;
  };
  T.cycle = function (G) {
    const t = G.troop, ws = t.pack.map((id, i) => WIELD(id) ? i : -1).filter(i => i >= 0);
    if (ws.length < 2) return false;
    const k = ws.indexOf(t.cur); t.cur = ws[(k + 1) % ws.length];
    T.setWeapon(G, t.pack[t.cur]); G.toast(DS.weapons[t.pack[t.cur]].name, 1.2);
    return true;
  };
  T.toggleWhistle = function (G) {
    const t = G.troop; t.gather = !t.gather;
    say(G, t.gather ? 'Còi: Tập hợp' : 'Còi: Hành động'); SK.emit('troopWhistle', G, t.gather);
    return t.gather;
  };
  SK.SKILLS.troop_cycle = { start(G) { if (on(G)) T.cycle(G); }, special(G) { if (on(G)) T.toggleWhistle(G); } };

  // 5 ô: pack = id vũ khí (cắn + kỹ năng pet + vũ khí mang theo để đưa cho lính); Còi không chiếm ô
  T.addWeapon = function (G, id) {
    const t = G.troop;
    if (t.pack.length >= 5) return { ok: false, why: say(G, 'Hết ô vũ khí') };
    if (PETW[id] && t.pack.indexOf(id) >= 0) return { ok: false, why: say(G, 'Đã có ' + PETW[id].name) };
    t.pack.push(id); return { ok: true };
  };
  const cargoIdx = G => G.troop.pack.findIndex(id => !WIELD(id));
  const wName = id => (DS.weapons[id] && DS.weapons[id].name) || id;
  // Lính gần pet nhất: đối tượng của thức uống, Tư Chất, Mực Xào, đưa vũ khí
  T.target = function (G) {
    const p = G.player; let best = null, bd = 1e9;
    for (const rec of G.troop.recs) {
      if (rec.dead) continue; const a = T.allyOf(G, rec); if (!a) continue;
      const d = Math.hypot(a.x - p.x, a.y - p.y); if (d < bd) { bd = d; best = rec; }
    }
    return best;
  };
  T.trash = function (G) {
    const t = G.troop, i = cargoIdx(G);
    if (i < 0) return { ok: false, why: say(G, 'Không có gì để bỏ') };
    const id = t.pack.splice(i, 1)[0]; say(G, 'Đã bỏ ' + wName(id)); T.rebuild(G); return { ok: true, id };
  };
  T.giveWeapon = function (G) {
    const t = G.troop, i = cargoIdx(G), rec = T.target(G);
    if (i < 0 || !rec) return { ok: false, why: say(G, 'Không có vũ khí để đưa') };
    const id = t.pack[i], g = (DS.weapons[id] && DS.weapons[id].grade) || 1, cap = rec.cap || 3;   // phẩm tối đa mặc định lam [LOC weapon_book]
    if (g > cap) return { ok: false, why: say(G, T.heroName(rec.hero) + ' cấp không đủ, không thể trang bị ' + wName(id)) };
    if (rec.weapon) t.pack[i] = rec.weapon; else t.pack.splice(i, 1);   // vũ khí cũ trả về ô cũ
    rec.weapon = id; if (g >= 6) P.goals.red = 1;
    save(); say(G, 'Đưa ' + wName(id) + ' cho ' + T.heroName(rec.hero)); T.rebuild(G); SK.emit('troopGive', G, rec, id);
    return { ok: true, id, rec };
  };

  // ============================================================ quầy rượu [WIKI LC "Bar"; CFG random_objects.bar_troop_drinks]
  // Thức uống 2 xu, mỗi ly cho 1 lính; vũ khí 0/1/2/3 xu theo phẩm Thường/Hiếm/Rất Hiếm/Sử Thi; Tư Chất 1 xu; Mực Xào 0; làm mới 1 xu.
  const DRINKS = {
    wine: { name: 'Rượu', apply: r => { r.bHp = (r.bHp || 0) + 10; r.hp += 10; } },
    coconut: { name: 'Nước Dừa', apply: r => { r.bArmor = (r.bArmor || 0) + 4; r.armor += 4; } },
    milk: { name: 'Sữa', apply: r => { r.def = (r.def || 0) + 1; } },
    bloody: { name: 'Bloody Mary', apply: r => { r.bCrit = (r.bCrit || 0) + 8; } },
    coffee: { name: 'Cà Phê', apply: r => { r.rate = (r.rate || 1) + 0.1; } },
    soda: { name: 'Soda', apply: r => { r.cdCut = Math.min(0.5, (r.cdCut || 0) + 0.1); } }
  };
  C.BAR = { drink: 2, weapon: [0, 1, 2, 3], book: 1, squid: 0, refresh: 1, bookMax: 6 };
  C.DRINKS = DRINKS;
  const poolIds = () => {
    const seen = new Set(), out = [];
    for (const l of Object.values(DS.weaponPools || {})) for (const id of l) if (!seen.has(id) && DS.weapons[id] && (DS.weapons[id].grade || 1) <= 4) { seen.add(id); out.push(id); }
    return out;
  };
  function rollBar(G) {
    const t = G.troop, keys = Object.keys(DRINKS), items = [];
    for (let i = 0; i < 2; i++) { const k = pickOf(keys.filter(x => !items.some(q => q.id === x))); items.push({ kind: 'drink', id: k, price: C.BAR.drink }); }
    const spare = Object.keys(PETW).filter(id => t.pack.indexOf(id) < 0);
    const wid = spare.length && rnd() < 0.4 ? pickOf(spare) : pickOf(poolIds());
    items.push({ kind: 'weapon', id: wid, price: PETW[wid] ? 2 : C.BAR.weapon[Math.min(3, ((DS.weapons[wid].grade || 1) - 1))] });
    items.push({ kind: 'book', price: C.BAR.book }, { kind: 'squid', price: C.BAR.squid });
    t.bar = items;
  }
  T.rollBar = rollBar;
  T.refreshBar = function (G) {
    const t = G.troop;
    if (t.coins < C.BAR.refresh) return { ok: false, why: say(G, 'Không đủ Xu Mèo') };
    t.coins -= C.BAR.refresh; rollBar(G); say(G, 'Đã làm mới quầy rượu'); T.rebuild(G); return { ok: true };
  };
  T.squid = function (G, rec) {
    const t = G.troop;
    if (t.recs.length <= 1) return { ok: false, why: say(G, 'Chỉ còn một lính, không thể sa thải') };
    if (rec.weapon) T.addWeapon(G, rec.weapon);   // vũ khí rơi lại cho pet
    t.recs.splice(t.recs.indexOf(rec), 1); P.goals.fired = 1; save();
    say(G, T.heroName(rec.hero) + ' bị sa thải'); T.respawn(G); T.rebuild(G); SK.emit('troopFire', G, rec);
    return { ok: true };
  };
  T.buy = function (G, i) {
    const t = G.troop, it = t.bar && t.bar[i];
    if (!it || it.sold) return { ok: false, why: 'sold' };
    if (t.coins < it.price) return { ok: false, why: say(G, 'Không đủ Xu Mèo') };
    const rec = T.target(G);
    if (it.kind !== 'weapon' && !rec) return { ok: false, why: say(G, 'Không có lính nào') };
    if (it.kind === 'book' && (rec.cap || 3) >= C.BAR.bookMax) return { ok: false, why: say(G, 'Cấp Lính Thuê đã đạt tối đa') };
    if (it.kind === 'squid') { const r = T.squid(G, rec); if (!r.ok) return r; t.coins -= it.price; it.sold = true; T.rebuild(G); return { ok: true }; }
    if (it.kind === 'weapon') { const r = T.addWeapon(G, it.id); if (!r.ok) return r; }
    t.coins -= it.price; it.sold = true;
    if (it.kind === 'drink') { DRINKS[it.id].apply(rec); rec.drinks = (rec.drinks || 0) + 1; if (rec.drinks >= 10) P.goals.cheers = 1; save(); say(G, 'Cho ' + T.heroName(rec.hero) + ' uống ' + DRINKS[it.id].name); }
    else if (it.kind === 'book') { rec.cap = (rec.cap || 3) + 1; say(G, T.heroName(rec.hero) + ' nhận Tư Chất Lính Thuê: phẩm vũ khí tối đa ' + rec.cap); }
    else say(G, 'Mua ' + wName(it.id));
    T.rebuild(G); SK.emit('troopBuy', G, it, rec);
    return { ok: true, rec };
  };
  const barLabel = (G, it) => {
    const tg = T.target(G), who = tg ? T.heroName(tg.hero) : '';
    if (it.sold) return 'Đã bán';
    if (it.kind === 'drink') return 'Cho ' + who + ' uống ' + DRINKS[it.id].name + ' (' + it.price + ' xu)';
    if (it.kind === 'weapon') return 'Mua ' + wName(it.id) + ' (' + it.price + ' xu)';
    if (it.kind === 'book') return 'Tư Chất Lính Thuê cho ' + who + ' (' + it.price + ' xu)';
    return 'Mực Xào: sa thải ' + who + ' (0 xu)';
  };
  const COLORS = { wine: '#a83a5a', coconut: '#f4f0e0', milk: '#ffffff', bloody: '#d02a2a', coffee: '#6a4a2a', soda: '#4ac8e8' };
  T.extraStands = function (G, stand, bx, by) {
    const t = G.troop, x0 = bx - 118, y0 = by - 30;
    (t.bar || []).forEach((it, i) => {
      const x = x0 + (i % 3) * 24, y = y0 + Math.floor(i / 3) * 26;
      stand(G, x, y, barLabel(G, it), g => T.buy(g, i), (ctx, G2, X, Y) => {
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(X, Y, 7, 2, 0, 0, Math.PI * 2); ctx.fill();
        if (it.sold) { ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(X - 5, Y - 2, 10, 3); return; }
        if (it.kind === 'drink') { ctx.fillStyle = COLORS[it.id]; ctx.fillRect(X - 3, Y - 10, 6, 10); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(X - 3, Y - 10, 6, 2); }
        else if (it.kind === 'weapon') { const d = DS.weapons[it.id]; if (d && d.sprite) SK.drawGun(ctx, d.sprite, X - 6, Y - 8, 0, null, {}); else { ctx.fillStyle = '#7fe0ff'; ctx.fillRect(X - 4, Y - 9, 8, 8); } }
        else if (it.kind === 'book') { ctx.fillStyle = '#c8a050'; ctx.fillRect(X - 5, Y - 10, 10, 10); ctx.fillStyle = '#fff'; ctx.fillRect(X - 3, Y - 8, 6, 1); }
        else { ctx.fillStyle = '#d86a8a'; ctx.fillRect(X - 5, Y - 7, 10, 5); ctx.fillRect(X - 4, Y - 11, 2, 4); ctx.fillRect(X + 1, Y - 11, 2, 4); }
        SK.text(ctx, String(it.price), X, Y - 14, 6, '#ffd84a', 'center', 'rgba(0,0,0,0.9)');
      });
    });
    stand(G, x0 + 72, y0 + 13, 'Phục vụ: làm mới quầy rượu (' + C.BAR.refresh + ' xu)', g => T.refreshBar(g), (ctx, G2, X, Y) => T.heroSprite(ctx, 'engineer', X, Y, G2.t));
    const ci = cargoIdx(G), rec = T.target(G);
    stand(G, bx + 92, by + 6, ci >= 0 && rec ? 'Đưa ' + wName(t.pack[ci]) + ' cho ' + T.heroName(rec.hero) : 'Đưa vũ khí cho lính (chưa có vũ khí mang theo)', g => T.giveWeapon(g), (ctx, G2, X, Y) => {
      ctx.fillStyle = '#7a5a3a'; ctx.fillRect(X - 7, Y - 8, 14, 8); ctx.fillStyle = '#c8a050'; ctx.fillRect(X - 7, Y - 8, 14, 2);
    });
    stand(G, bx + 92, by + 28, ci >= 0 ? 'Thùng rác: bỏ ' + wName(t.pack[ci]) : 'Thùng rác', g => T.trash(g), (ctx, G2, X, Y) => {
      ctx.fillStyle = '#5a6a7a'; ctx.fillRect(X - 5, Y - 10, 10, 10); ctx.fillStyle = '#7a8a9a'; ctx.fillRect(X - 6, Y - 12, 12, 2);
    });
  };
  SK.on('stageEnter', G => { if (on(G)) { rollBar(G); T.rebuild(G); } });

  // ============================================================ cúp Đồng / Bạc / Vàng [WIKI LC "Objectives"; LOC season/troop/*]
  const KEY = 'sk.troop.v1';
  const P = T.prof = { goals: {}, hired: {}, up: {}, won: {}, goldUp: {}, trophies: {} };
  function load() {
    try { const o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (o && typeof o === 'object') for (const k in P) if (o[k] && typeof o[k] === 'object') Object.assign(P[k], o[k]); } catch (e) { /* hồ sơ hỏng thì bỏ */ }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { /* không có kho thì thôi */ } }
  T.profSave = save;
  T.profReset = () => { for (const k in P) P[k] = {}; try { localStorage.removeItem(KEY); } catch (e) { /* bỏ */ } };
  load();
  const all17 = m => C.ids.every(h => m[h]);
  T.trophyState = function () {
    return {
      bronze: !!(all17(P.hired) && P.goals.fired && P.goals.red && P.goals.row),
      silver: !!(all17(P.up) && all17(P.won) && P.goals.cheers),
      gold: !!(all17(P.goldUp) && P.goals.same)
    };
  };
  T.GOALS = {
    bronze: ['Ba lính giống nhau khi làm mới', 'Sa thải một lính bằng Mực Xào', 'Từng thuê đủ 17 loại', 'Đưa Vũ Khí Đỏ cho một lính'],
    silver: ['Từng thắng với mỗi lính', 'Mở mọi bản nâng', 'Cho một lính uống từ 10 ly'],
    gold: ['Thắng Lợi Hại với mỗi bản nâng', 'Thắng một ván chỉ thuê một loại']
  };
  function checkRow(G) {
    const cnt = {};
    for (const h of G.troop.stock) if (h) cnt[h] = (cnt[h] || 0) + 1;
    if (Object.values(cnt).some(n => n >= 3)) { P.goals.row = 1; save(); }
  }
  T.checkRow = checkRow;
  SK.on('runStart', G => { if (on(G)) { G.troop.pack = ['troop_bite', 'troop_heal']; G.troop.cur = 0; P.hired[G.troop.recs[0].hero] = 1; save(); } });
  SK.on('troopHire', (G, hero, merged) => { if (on(G)) { P.hired[hero] = 1; if (merged) P.up[hero] = 1; save(); } });
  SK.on('troopRefresh', G => { if (on(G)) checkRow(G); });
  SK.on('stageEnter', G => { if (on(G)) checkRow(G); });
  SK.on('runEnd', (G, info) => {
    if (!on(G)) return;
    const t = G.troop;
    if (info.won) {
      for (const r of t.recs) { P.won[r.hero] = 1; if (G.badass && r.up) P.goldUp[r.hero] = 1; }
      if (Object.keys(t.stats.hired).length === 1) P.goals.same = 1;
      t.stats.wins++;
    }
    const before = P.trophies, now = T.trophyState(), fresh = [];
    for (const k of ['bronze', 'silver', 'gold']) if (now[k] && !before[k]) fresh.push(k);
    P.trophies = now; save(); t.lastTrophy = { won: !!info.won, trophies: now, fresh };
    const names = { bronze: 'Đồng', silver: 'Bạc', gold: 'Vàng' };
    Promise.resolve().then(() => {
      const e = document.getElementById(info.won ? 'sk-win-info' : 'sk-over-info'); if (!e) return;
      const done = ['bronze', 'silver', 'gold'].filter(k => now[k]).map(k => names[k]);
      e.textContent += ' · Cúp: ' + (done.length ? done.join(', ') : 'chưa có') + (fresh.length ? ' (mới: ' + fresh.map(k => names[k]).join(', ') + ')' : '');
    });
  });

  // ============================================================ HUD: Còi, vũ khí pet
  SK.on('hud', (ctx, G) => {
    if (!on(G) || !G.map) return;
    const t = G.troop, v = SK.view, cur = t.pack[t.cur];
    SK.text(ctx, 'Còi: ' + (t.gather ? 'Tập hợp' : 'Hành động') + '   Vũ khí: ' + (cur === 'troop_bite' ? 'Cắn' : wName(cur)) + '   Ô ' + t.pack.length + '/5', v.w / 2, v.h - 10, 8, '#cfe8ff', 'center', 'rgba(0,0,0,0.9)');
  });
})();
