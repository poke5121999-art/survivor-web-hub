// Thú cưng đi theo người chơi: prefab pet0..pet56 trong common.ab (tools/extra/pets.json), tên + kỹ năng ở data/sk-pets.js.
// Kỹ năng riêng từng con ở js/pets/<petN>.js: SK.petRegister(petN, def) với các móc (đều tuỳ chọn):
//   init(G, a), tick(G, a, dt) -> true thì bỏ bước mặc định, bite(G, a, e, dmg) -> sát thương cắn,
//   playerHurt(G, a, dmg) -> sát thương người chơi nhận, draw(ctx, G, a) vẽ thêm, stage(G, a) mỗi lần vào ải.
// pet = {id, x, y, face, st: 'ide'|'run'|'atk'|'action', stT, cd, scan, target}
(function () {
  'use strict';
  const SK = window.SK, D = SK.D, W = SK.world, U = SK.PPU;

  // [ĐO Pet0Controller/Pet1Controller, RoleAttributePet]: sát thương 3, atk_cd 2 s, bám chủ ở 2 đv, quá 20 đv thì bay
  // về chủ (shouldFlyToMaster), tốc 8 đv/s, critical 0. scout_rate 0,5 dùng làm nhịp dò mục tiêu (giây) [SUY].
  const SEEK = 8 * U;      // tầm dò quái [ƯỚC LƯỢNG]
  const BITE = 1.2 * U;    // cự li cắn [ƯỚC LƯỢNG]
  const BITE_AT = 0.15;    // giây vào clip atk thì gây sát thương [ƯỚC LƯỢNG]

  const SKILLS = SK.PET_SKILLS = {};
  SK.petRegister = (id, def) => { SKILLS[id] = def; return true; };
  SK.petInfo = id => (window.SK_PETS && SK_PETS.pets[id]) || null;

  // ---- Hệ máu chung [WIKI Pets]: 10 HP gốc (max_hp riêng theo prefab), máu không xuống dưới 1; về 1 HP thì pet thôi đánh, nằm
  // cạnh chủ và hồi đầy sau 14~16 giây. Hồi dần trong trận "tốc độ không rõ" nên chưa làm (GAPS). Quái web chỉ nhắm chủ nên pet chịu
  // đòn qua đạn quái bay trúng nó (hộp 6 x 7 px quanh thân); cận chiến / vùng nổ của quái chưa tính vào pet.
  // Móc tuỳ chọn trong def: keep (đạn không bị chặn, pet vẫn mất máu: slime tách theo đạn lọt vào), hurt(G, a, dmg, b) -> sát thương thật (0 = miễn), guard (đang nghỉ vẫn chặn đạn: rùa), ownHp (tự quản HP),
  // onRest(G, a), onWake(G, a).
  const REST_MIN = 14, REST_MAX = 16, HIT_X = 6, HIT_Y = 7;
  const HP = SK.petHp = {
    REST_MIN, REST_MAX,
    init(a, max) { a.hpMax = max; a.hp = max; a.rest = 0; a.restFor = 0; a.hurts = 0; },
    hurt(G, a, dmg, b) {
      const d = a.def || {};
      if (a.rest > 0 && !d.guard) return 0;
      if (d.hurt) dmg = d.hurt(G, a, dmg, b);
      if (!(dmg > 0)) return 0;
      const was = a.hp;
      a.hp = Math.max(1, a.hp - dmg); a.hurts = (a.hurts || 0) + 1;
      SK.num(G, a.x, a.y - 20, '-' + dmg, '#ff9a4a');
      if (a.hp <= 1) HP.rest(G, a);
      return was - a.hp;
    },
    rest(G, a) {
      if (a.rest > 0) return;
      a.rest = a.restFor = REST_MIN + SK.rand() * (REST_MAX - REST_MIN); a.target = a.tgt = null;
      if (a.def && a.def.onRest) a.def.onRest(G, a);
    },
    heal(G, a) { a.hp = a.hpMax; a.rest = 0; },
    // true nếu đang nghỉ; hết giờ nghỉ thì đầy máu
    tick(G, a, dt) {
      if (!(a.rest > 0)) return false;
      a.rest -= dt;
      if (a.rest > 0) return true;
      a.rest = 0; a.hp = a.hpMax;
      if (a.def && a.def.onWake) a.def.onWake(G, a);
      return false;
    },
    // đạn quái chạm hộp thân: trừ máu, đạn biến mất (đạn xuyên / vùng nổ đứng yên chỉ tính một lần, không bị xoá)
    scan(G, a) {
      if (a.def && a.def.ownHp) return;
      for (const b of G.bullets) {
        if (b.side !== 'e' || b.dead || b.melee || b.orbit || b._petHit === a) continue;
        if (Math.abs(b.x - a.x) > HIT_X + (b.r || 2) || Math.abs(b.y - (a.y - 7)) > HIT_Y + (b.r || 2)) continue;
        if (a.rest > 0 && !(a.def && a.def.guard)) continue;
        b._petHit = a;
        if (!(b.pierce > 0) && !b.area && !(a.def && a.def.keep)) { if (b.fxh && b.fxh.stop) b.fxh.stop(); b.dead = true; }
        HP.hurt(G, a, Math.max(1, Math.round(b.dmg || 1)), b);
      }
    }
  };

  function cfg(id) {
    const root = (D.prefabs[id] || [])[0], m = (root && root.mbs) || {};
    const c = Object.keys(m).filter(k => /^Pet\w*Controller$/.test(k)).map(k => m[k])[0] || {};
    const ra = m.RoleAttributePet || {};
    return {
      dmg: c.damage || 3, cd: c.atk_cd || 2, scan: c.scout_rate || 0.5,
      near: (c.min_follow_distance || 2) * U, far: (c.max_follow_distance || 20) * U,
      spd: (ra.speed || 8) * U, action: (c.actionRandom || 0) / 100
    };
  }

  function nearestEnemy(G, a) {
    let best = null, bd = SEEK;
    for (const e of G.enemies) {
      if (e.st === 'spawn' || e.st === 'dead') continue;
      const d = Math.hypot(e.x - a.x, e.y - a.y);
      if (d < bd && W.los(G.map, a.x, a.y - 4, e.x, e.y - 4)) { best = e; bd = d; }
    }
    return best;
  }

  function setSt(a, st) { if (a.st !== st) { a.st = st; a.stT = 0; } }

  function walk(G, a, tx, ty, dt) {
    const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
    if (d < 1) return false;
    const s = Math.min(d, a.k.spd * dt);
    SK.moveBox(G.map, a, dx / d * s, dy / d * s, 3);
    if (Math.abs(dx) > 1) a.face = dx > 0 ? 1 : -1;
    return true;
  }

  function step(G, a, dt) {
    const p = G.player, k = a.k;
    a.stT += dt; a.cd -= dt; a.scan -= dt;
    if (!p || p.st === 'dead') { setSt(a, 'ide'); return; }
    const dp = Math.hypot(p.x - a.x, p.y - a.y);
    if (dp > k.far) { a.x = p.x - p.face * 10; a.y = p.y + 2; a.target = null; setSt(a, 'ide'); return; }
    if (a.rest > 0) {   // nghỉ: không đánh, ở cạnh chủ
      a.target = null; a.bit = true;
      if (dp > k.near) { walk(G, a, p.x - p.face * 6, p.y + 2, dt); setSt(a, 'run'); } else setSt(a, 'ide');
      return;
    }
    if (a.st === 'atk') {
      const e = a.target;
      if (!a.bit && a.stT >= BITE_AT && e && e.st !== 'dead' && Math.hypot(e.x - a.x, e.y - a.y) <= BITE * 1.5) {
        a.bit = true;
        const dmg = a.def.bite ? a.def.bite(G, a, e, k.dmg) : k.dmg;
        if (dmg > 0) SK.hurtEnemy(G, e, dmg, false, Math.atan2(e.y - a.y, e.x - a.x), 1);
      }
      if (a.stT < SK.animLen(a.anim.atk)) return;
      a.target = null; setSt(a, 'ide');
    }
    if (a.scan <= 0) { a.scan = k.scan; if (a.cd <= 0 && !a.target) a.target = nearestEnemy(G, a); }
    const e = a.target;
    if (e && (e.st === 'dead' || dp > k.far * 0.5)) a.target = null;
    else if (e) {
      if (Math.hypot(e.x - a.x, e.y - a.y) <= BITE) {
        a.face = e.x >= a.x ? 1 : -1; a.cd = k.cd; a.bit = false; setSt(a, 'atk'); return;
      }
      walk(G, a, e.x, e.y, dt); setSt(a, 'run'); return;
    }
    if (dp > k.near) { walk(G, a, p.x - p.face * 6, p.y + 2, dt); setSt(a, 'run'); return; }
    if (a.st === 'action' && a.stT < SK.animLen(a.anim.action)) return;
    if (a.st !== 'ide') setSt(a, 'ide');
    else if (a.stT > 3 && SK.rand() < k.action * dt) setSt(a, 'action');   // [ƯỚC LƯỢNG] nhịp động tác rảnh
  }

  function spawn(G) {
    const id = SK.petForce || (SK.profile && SK.profile.pet ? SK.profile.pet() : 'pet0'), parts = D.prefabs[id], p = G.player;
    if (G.mods && G.mods.noPet) { G.pet = null; return; }   // Dũng Sĩ Cô Độc
    if (!parts || !p || G.petOff) return;
    const anim = parts[0].a || {};
    const a = { id, parts, anim, k: cfg(id), x: p.x - 10, y: p.y + 2, face: 1, st: 'ide', stT: 0, cd: 1, scan: 0, target: null,
      // Độ thân mật dưới 50% thì chưa có kỹ năng, chỉ cắn mặc định [WIKI Pets]; SK.petForce (móc kiểm thử) bỏ qua ngưỡng.
      def: (SK.petForce || !SK.profile || !SK.profile.petSkillOn || SK.profile.petSkillOn(id)) ? (SKILLS[id] || {}) : {}, info: SK.petInfo(id) };
    G.pet = a; HP.init(a, (a.info && a.info.attr && a.info.attr.max_hp) || 10);
    if (a.def.init) a.def.init(G, a);
    G.props.push({
      x: a.x, y: a.y, pet: a,
      update(G2, q, dt) {
        if (G2.petOff) { q.gone = true; G2.pet = null; return; }
        HP.scan(G2, a);
        const resting = HP.tick(G2, a, dt);
        if (resting && a.def.guard) { a.st = 'defense'; a.stT += dt; }
        else if (resting || !(a.def.tick && a.def.tick(G2, a, dt))) step(G2, a, dt);
        q.x = a.x; q.y = a.y;
      },
      draw(ctx, G2) {
        if (!a.hidden) SK.drawPrefab(ctx, a.parts, a.x, a.y, { state: a.st, t: a.stT, flip: a.face < 0, scale: a.scale });
        if (a.def.draw) a.def.draw(ctx, G2, a);
        if (a.rest > 0 && !a.hidden) SK.text(ctx, 'z z', a.x + 4, a.y - 22 - Math.sin(a.rest * 3) * 1.5, 7, '#cfe6ff', 'center', 'rgba(0,0,0,0.9)');
      }
    });
  }

  SK.on('stageEnter', G => { spawn(G); if (G.pet && G.pet.def.stage) G.pet.def.stage(G, G.pet); });
  // Rào phòng dâng lúc pet còn ở hành lang thì pet bị nhốt ngoài cả trận (chưa đủ xa để tự dịch chuyển): kéo vào cạnh chủ.
  SK.on('roomLock', (G, r) => {
    const a = G.pet, p = G.player, T = SK.TILE;
    if (!a || !p) return;
    if (a.x < (r.x0 + 1) * T || a.x > r.x1 * T || a.y < (r.y0 + 1) * T + 4 || a.y > (r.y1 + 1) * T - 4) {
      a.x = SK.clamp(p.x - p.face * 10, (r.x0 + 1) * T, r.x1 * T); a.y = SK.clamp(p.y + 2, (r.y0 + 1) * T + 4, (r.y1 + 1) * T - 4); a.target = null;
    }
  });
  // Kỹ năng đỡ đòn cho chủ (Giáp, khiên...): móc vào SK.hurtPlayer giống buff trong rooms.js.
  const baseHurt = SK.hurtPlayer;
  SK.hurtPlayer = function (G, dmg, ...rest) {
    const a = G.pet;
    if (a && a.def.playerHurt && dmg > 0 && G.player && G.player.st !== 'dead' && !(G.player.invulT > 0)) dmg = a.def.playerHurt(G, a, dmg);
    return baseHurt(G, dmg, ...rest);
  };
  // Móc kiểm thử: đổi thú cưng giữa trận.
  SK.petDebug = { spawn: id => { const G = SK.G; SK.petForce = id; if (G.pet) G.props = G.props.filter(q => q.pet !== G.pet); spawn(G); return G.pet; } };
})();
