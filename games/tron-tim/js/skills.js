// Kỹ năng Soul Knight trong Trốn Tìm (DESIGN.md "Kỹ năng"). Bảng TT.SKILLS[id], mỗi nhân vật dùng kỹ năng của hero mình.
// Hành vi viết lại trên mô hình thực thể của game này; số lấy từ TT_SKILLS86 và mã SK (games/soulknight/js/skills.js, skills/*.js).
// Mốc tên [ĐO] = số có trong mã/dữ liệu SK, [ƯỚC LƯỢNG] = SK không có số, chọn cho hợp luật trốn tìm. 1 đơn vị SK = 1 ô.
(function () {
  'use strict';
  const TT = window.TT = window.TT || {};
  const SK = window.SK, MU = TT.mapUtil, C = TT.C, T = 16;
  const R = C.RADIUS;

  // ---------------------------------------------------------------- tiện ích
  const free = (m, x, y) => !MU.boxBlocked(m.map, x, y, R, true);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const sk = m => m.sk || (m.sk = { decoys: [], holes: [], fx: [], follows: [], dizzy: new Map() });
  const hidersOf = m => m.actors.filter(h => h.role === 'hide' && h.life === 'alive');
  const isHuman = (m, a) => a === m.human;

  // đi một đoạn, trượt từng trục khi gặp tường/bàn (người tìm và người trốn đều không đi xuyên bàn khi bị kỹ năng đẩy)
  function slide(m, a, dx, dy) {
    if (free(m, a.x + dx, a.y)) a.x += dx;
    if (free(m, a.x, a.y + dy)) a.y += dy;
  }

  // vfx của SK: tên có trong SK_VFX thì phát, nếu không thì cây prefab vẽ một lần trong lớp vẽ của kỹ năng
  const hasVfx = n => !!(SK.vfx && SK.vfx.has(n));
  function vfx(name, x, y, o) {
    if (!hasVfx(name)) return null;
    return SK.vfx.spawn(TT.G, name, x * T, y * T, Object.assign({ layer: 'top' }, o));
  }
  function prefabFx(m, name, x, y, o) {
    const parts = SK.prefab(name);
    if (!parts) return;
    sk(m).fx.push(Object.assign({ x, y, t0: m.now, dur: 0.5, parts, scale: 1, kind: 'prefab' }, o));
  }
  // theo nhân vật: cầu vfx bám toạ độ (px) của một thực thể
  function follower(m, a, secs) {
    const f = { x: a.x * T, y: a.y * T + 5, gone: false, dead: false };
    sk(m).follows.push({ f, a, until: m.now + (secs || 1) + 1 });
    return f;
  }

  function stun(m, h, dur) {
    if (TT.hasEffect(h, 'shield', m.now)) return false;
    TT.removeEffect(h, 'stun');
    TT.addEffect(h, 'stun', m.now + dur);
    return true;
  }

  // ---------------------------------------------------------------- bảng kỹ năng
  const SKILLS = TT.SKILLS = {};
  const def = (id, d) => { d.id = id; SKILLS[id] = d; };

  // Tàng Hình [ĐO c03/skill 3: cd 6, dur 6, alpha 0.297; destroyWhenAct]: bấm lại để huỷ; bị hạ gục (downHider) cũng mất.
  def('invisibility', {
    hero: 'assassin', role: 'hide', cd: 6, dur: 6, icon: 'assassin_night',
    name: { vi: 'Tàng Hình', en: 'Invisibility' },
    desc: { vi: 'Tàng hình 6 giây: người tìm (cả bot) không thấy. Hết khi bị đánh trúng hoặc bấm lại.', en: 'Invisible for 6 s: seekers, bots included, cannot see you. Ends when hit or pressed again.' },
    start(m, a) {
      TT.removeEffect(a, 'invisible'); TT.addEffect(a, 'invisible', m.now + this.dur);
      vfx('c03_show_effect_s0', a.x, a.y + 0.3, { scale: 0.5 });
      vfx('skill_assassin_night', a.x, a.y + 0.3, { follow: follower(m, a, 0.8), dur: 0.8 });
    },
    update(m, a) { if (!TT.hasEffect(a, 'invisible', m.now)) a.skill.t = 0; },
    end(m, a) { TT.removeEffect(a, 'invisible'); },
    press: 'cancel'
  });

  // Cầu Nguyện [ĐO c10/skill 2: cd 14; hồi 2, chạy +0.4 (nhân 1.4), 5 s, đồng minh trong 16 đơn vị]: hồi 2 máu vùng, tăng tốc,
  // cứu người gục nhanh gấp đôi (fastRevive) trong 5 s.
  const PRAY = { hp: 2, move: 1.4, dur: 5, radius: 16 };
  def('pray', {
    hero: 'priest', role: 'hide', cd: 14, dur: PRAY.dur, icon: 'skill_effect_priest_0',
    name: { vi: 'Cầu Nguyện', en: 'Pray' },
    desc: { vi: 'Hồi 2 máu vùng và tăng tốc đồng đội xung quanh trong 5 giây; cứu người gục nhanh gấp đôi khi đang có hiệu lực.', en: 'Heals 2 zone HP and speeds up nearby teammates for 5 s; revives are twice as fast while active.' },
    start(m, a) {
      const cap = 6 + (m.zone ? m.zone.step : 0), until = m.now + PRAY.dur;
      a.skill.healed = [];
      for (const h of hidersOf(m)) {
        if (dist(a, h) > PRAY.radius) continue;
        const before = h.hp; h.hp = Math.min(cap, h.hp + PRAY.hp);
        if (h.hp > before) h.zoneT = Math.max(0, h.zoneT - PRAY.hp);
        TT.addEffect(h, 'haste', until, PRAY.move);
        TT.addEffect(h, 'fastRevive', until);
        a.skill.healed.push(h.id);
        vfx('effect_health_skill', h.x, h.y + 0.3);
      }
      vfx('effect_priest_1_cast', a.x, a.y, { follow: follower(m, a, 1) });
      a.skill.ringF = follower(m, a, PRAY.dur);
      a.skill.ring = vfx('effect_priest_1', a.x, a.y, { follow: a.skill.ringF, dur: PRAY.dur, layer: 'ground' });
    },
    end(m, a) { if (a.skill.ringF) a.skill.ringF.gone = true; a.skill.ring = null; a.skill.ringF = null; }
  });

  // Lộn Nhào [ĐO c01/skill 1: cd 2.5; lăn 0.4 s, v0 20 đơn vị/s nhân 0.95 mỗi 0.02 s (~5.13 ô), miễn sát thương 0.5 s]
  const ROLL = { t: 0.4, v0: 20, decay: 0.95, step: 0.02, immune: 0.5 };
  def('dodge', {
    hero: 'ranger', role: 'hide', cd: 2.5, dur: ROLL.t, icon: 'effect_ranger_skill_3_0',
    name: { vi: 'Lộn Nhào', en: 'Dodge' },
    desc: { vi: 'Lộn một đoạn dài theo hướng đang chạy, miễn nhiễm bị bắt trong lúc lộn.', en: 'Roll a long way in the run direction, immune to catches while rolling.' },
    start(m, a, aim) {
      a.skill.ang = aim; a.skill.t0 = 0;
      a.motion = { kind: 'skill', t: 0 };
      if (Math.abs(Math.cos(aim)) > 0.1) a.face = Math.cos(aim) > 0 ? 1 : -1;
      TT.addEffect(a, 'shield', m.now + ROLL.immune);
      prefabFx(m, 'effect_ranger_roll', a.x, a.y + 0.3, { dur: 0.34, flip: a.face < 0, ground: true });
      vfx('fx_walk_dust', a.x, a.y + 0.3);
    },
    update(m, a, dt) {
      const s = a.skill; s.t0 += dt;
      const v = ROLL.v0 * Math.pow(ROLL.decay, s.t0 / ROLL.step) * dt;
      slide(m, a, Math.cos(s.ang) * v, Math.sin(s.ang) * v);
      a.spin = Math.min(1, s.t0 / ROLL.t) * Math.PI * 2; a.moving = true;
    },
    end(m, a) { a.motion = null; a.spin = 0; }
  });

  // Màn Ảo Thuật [ĐO c25/skill 2: cd 5, dur 10; initStealthDuration 3]: búp bê mồi nhử 10 s; người dùng tàng hình 3 s.
  const TRICK = { dur: 10, stealth: 3 };
  def('master_s_trick', {
    hero: 'trapmaster', role: 'hide', cd: 5, dur: TRICK.dur, icon: 'tarpMaster_0_skill2_idle_0',
    name: { vi: 'Màn Ảo Thuật', en: "Master's Trick" },
    desc: { vi: 'Đặt búp bê mồi nhử 10 giây: bot người tìm đuổi theo búp bê tới khi bị đánh trúng. Bạn tàng hình 3 giây.', en: 'Place a decoy for 10 s: seeker bots chase it until it is hit. You turn invisible for 3 s.' },
    start(m, a) {
      const S = sk(m);
      S.decoys = S.decoys.filter(d => { if (d.owner === a.id) { d.life = 'dead'; vfx('smoke', d.x, d.y); } return d.owner !== a.id; });
      const d = { id: -1, decoy: true, owner: a.id, x: a.x, y: a.y, until: m.now + TRICK.dur, life: 'alive', face: a.face, born: m.now };
      d.ghost = TT.makeActor(-1, true, 'Búp bê', a.hero, 'hide', a.hero); d.ghost.look = 'seek';
      S.decoys.push(d);
      TT.removeEffect(a, 'invisible'); TT.addEffect(a, 'invisible', m.now + TRICK.stealth);
      vfx('smoke', a.x, a.y, { scale: 1.2 }); vfx('explode_s', a.x, a.y, { scale: 0.6 });
    },
    end(m, a) {
      const S = sk(m);
      S.decoys = S.decoys.filter(d => { if (d.owner === a.id) { d.life = 'dead'; vfx('smoke', d.x, d.y); } return d.owner !== a.id; });
    }
  });

  // Xung Điện Từ [ĐO c12/skill 3: cd 4; 10 tia dài 2.5 đơn vị quay 0.45 s]: choáng người trốn trong 2.5 ô. Thời gian choáng 2 s [ƯỚC LƯỢNG].
  const EMP = { radius: 2.5, stun: 2, dur: 0.45, beams: 10 };
  def('emp', {
    hero: 'robot', role: 'seek', cd: 4, dur: EMP.dur, icon: 'robot_0_0',
    name: { vi: 'Xung Điện Từ', en: 'EMP' },
    desc: { vi: 'Phóng xung điện từ: choáng 2 giây mọi người trốn trong 2.5 ô quanh bạn.', en: 'Fire an EMP pulse: every hider within 2.5 tiles is stunned for 2 s.' },
    start(m, a) {
      for (const h of hidersOf(m)) if (dist(a, h) <= EMP.radius && stun(m, h, EMP.stun)) vfx('explode_energy2_orange', h.x, h.y - 0.5, { scale: 0.5 });
      vfx('explode_energy2_orange', a.x, a.y - 0.4, { scale: 0.8 });
      sk(m).fx.push({ kind: 'emp', x: a.x, y: a.y - 0.5, t0: m.now, dur: EMP.dur });
    }
  });

  // Nhảy Vồ [ĐO c13/skill 3: cd 4 mỗi lượt, 2 lượt; bay 0.4583 s cao 28 px; đáp dậm bán kính 16 px × 1.5 = 1.5 ô]
  // Quãng nhảy tối đa 4.5 ô [ƯỚC LƯỢNG], bay qua tường/bàn, hạ cánh ô trống xa nhất không vượt quá; choáng vòng đáp 1.5 s [ƯỚC LƯỢNG].
  const LEAP = { t: 0.4583, h: 28, r: 1.5, reach: 4.5, stun: 1.5 };
  function landing(m, a, ang, want, step) {
    for (let d = want; d >= 1; d -= step) {
      const x = a.x + Math.cos(ang) * d, y = a.y + Math.sin(ang) * d;
      if (free(m, x, y)) return { x, y, d };
    }
    return null;
  }
  def('leap', {
    hero: 'viking', role: 'seek', cd: 4, max: 2, dur: LEAP.t, icon: 'viking_0_0',
    name: { vi: 'Nhảy Vồ', en: 'Leap' },
    desc: { vi: 'Nhảy qua tường và bàn, tiếp đất làm choáng người trốn quanh điểm đáp. 2 lượt.', en: 'Jump over walls and tables; the landing stuns hiders around it. 2 charges.' },
    canStart(m, a, aim, want) { return !!landing(m, a, aim, Math.min(LEAP.reach, want || LEAP.reach), 0.25); },
    start(m, a, aim, want) {
      const to = landing(m, a, aim, Math.min(LEAP.reach, want || LEAP.reach), 0.25);
      a.skill.jump = { x0: a.x, y0: a.y, x1: to.x, y1: to.y, t: 0 };
      a.motion = { kind: 'skill', t: 0 };
      if (Math.abs(Math.cos(aim)) > 0.1) a.face = Math.cos(aim) > 0 ? 1 : -1;
      vfx('fx_walk_dust', a.x, a.y + 0.3);
    },
    update(m, a, dt) {
      const j = a.skill.jump; j.t += dt;
      const k = Math.min(1, j.t / LEAP.t);
      a.x = j.x0 + (j.x1 - j.x0) * k; a.y = j.y0 + (j.y1 - j.y0) * k;
      a.lift = Math.sin(k * Math.PI) * LEAP.h; a.moving = true;
    },
    end(m, a) {
      const j = a.skill.jump; if (j) { a.x = j.x1; a.y = j.y1; }
      a.motion = null; a.lift = 0;
      vfx('bullet_hammer', a.x, a.y + 0.2); vfx('explode_s', a.x, a.y, { scale: 0.7 });
      sk(m).fx.push({ kind: 'ring', x: a.x, y: a.y + 0.3, t0: m.now, dur: 0.4, r: LEAP.r, color: '255,200,80' });
      for (const h of hidersOf(m)) if (dist(a, h) <= LEAP.r) stun(m, h, LEAP.stun);
    }
  });

  // Dịch Chuyển Lượng Tử [ĐO c27/skill 3: cd 8, 2 lượt; skill2BlinkDistance 5; buff chạy +0.3]: chớp theo hướng nhắm tối đa 5 ô, dừng trước tường.
  const BLINK = { dist: 5, haste: 1.3, hasteT: 2 };
  function blinkTarget(m, a, ang, want) {
    let best = null;
    for (let d = 0.25; d <= want + 1e-6; d += 0.25) {
      const x = a.x + Math.cos(ang) * d, y = a.y + Math.sin(ang) * d;
      if (!free(m, x, y)) break;
      best = { x, y, d };
    }
    return best && best.d >= 1 ? best : null;
  }
  def('quantum_translocator', {
    hero: 'doctor', role: 'seek', cd: 8, max: 2, dur: 0, icon: 'Doctor_0_0',
    name: { vi: 'Dịch Chuyển Lượng Tử', en: 'Quantum Translocator' },
    desc: { vi: 'Chớp tới theo hướng chuột tối đa 5 ô, dừng trước tường, tăng tốc 2 giây. 2 lượt.', en: 'Blink up to 5 tiles toward the mouse, stopping before walls, then a short speed boost. 2 charges.' },
    canStart(m, a, aim, want) { return !!blinkTarget(m, a, aim, Math.min(BLINK.dist, want || BLINK.dist)); },
    start(m, a, aim, want) {
      const to = blinkTarget(m, a, aim, Math.min(BLINK.dist, want || BLINK.dist));
      vfx('doctor_skin0_teleport_fx_start', a.x, a.y + 0.3);
      a.x = to.x; a.y = to.y;
      vfx('doctor_skin0_teleport_fx_end', a.x, a.y + 0.3);
      if (Math.abs(Math.cos(aim)) > 0.1) a.face = Math.cos(aim) > 0 ? 1 : -1;
      TT.addEffect(a, 'haste', m.now + BLINK.hasteT, BLINK.haste);
    }
  });

  // Xoáy Không Gian [ĐO c06/skill 2: cd 11; viên bay 38 đơn vị/s nhân 0.725 mỗi 0.04 s (tối thiểu 1) nổ sau 0.4 s hoặc khi chạm;
  // hố đen 2.25 s, bán kính 3, hút tới 1.3 × bán kính]. Lực hút SK không có số [ƯỚC LƯỢNG 60 px/s]; ở đây 4.5 ô/s để thắng tốc chạy 2.875.
  const SWIRL = { speed: 38, rate: 0.04, k: 0.725, min: 1, boom: 0.4, life: 2.25, radius: 3, pullR: 3.9, pull: 4.5 };
  def('alien_swirl', {
    hero: 'vampire', role: 'seek', cd: 11, dur: SWIRL.boom + SWIRL.life, icon: 'vampire_0_0',
    name: { vi: 'Xoáy Không Gian', en: 'Alien Swirl' },
    desc: { vi: 'Phóng một hố đen theo hướng nhắm: hút người trốn vào tâm trong 2.25 giây.', en: 'Throw a black hole along the aim: pulls hiders into its center for 2.25 s.' },
    start(m, a, aim) {
      a.skill.b = { x: a.x + Math.cos(aim) * 0.5, y: a.y - 0.4 + Math.sin(aim) * 0.5, v: SWIRL.speed, slow: 0, t: 0, ang: aim, hole: null };
      if (Math.abs(Math.cos(aim)) > 0.1) a.face = Math.cos(aim) > 0 ? 1 : -1;
    },
    update(m, a, dt) {
      const b = a.skill.b, S = sk(m);
      if (!b.hole) {
        b.t += dt; b.slow += dt;
        while (b.slow >= SWIRL.rate) { b.slow -= SWIRL.rate; b.v = Math.max(SWIRL.min, b.v * SWIRL.k); }
        const nx = b.x + Math.cos(b.ang) * b.v * dt, ny = b.y + Math.sin(b.ang) * b.v * dt;
        if (MU.kindAt(m.map, Math.floor(nx), Math.floor(ny + 0.4)) !== TT.KIND.WALL) { b.x = nx; b.y = ny; }
        const near = hidersOf(m).some(h => Math.hypot(h.x - b.x, h.y - 0.4 - b.y) < 0.6);
        if (b.t >= SWIRL.boom || near) {
          b.hole = { x: b.x, y: b.y + 0.4, t: 0, owner: a.id };
          S.holes.push(b.hole);
          b.hole.vfx = vfx('whirl_wind_365', b.hole.x, b.hole.y, { dur: SWIRL.life, layer: 'ground', tint: [0.75, 0.15, 0.35, 1] });
          vfx('explode_s', b.hole.x, b.hole.y, { scale: 0.7 });
        }
      } else {
        a.skill.t = Math.min(a.skill.t, SWIRL.life - b.hole.t);
      }
    },
    end(m, a) {
      const b = a.skill.b; a.skill.b = null;
      if (b && b.hole) b.hole.t = 1e9;
    }
  });

  // ---------------------------------------------------------------- dùng kỹ năng
  const heroToSkill = {};
  for (const id in SKILLS) heroToSkill[SKILLS[id].hero] = id;
  TT.heroSkill = hero => heroToSkill[hero] || null;

  function ensure(a) {
    const id = TT.heroSkill(a.hero), s = a.skill;
    if (s.id !== id) { const d = SKILLS[id]; s.id = id; s.cd = 0; s.t = 0; s.ch = d ? (d.max || 1) : 0; s.rc = 0; }
    return SKILLS[id];
  }

  TT.skillState = a => {
    const d = ensure(a), s = a.skill;
    if (!d) return { id: null, name: null, cd: 0, cdMax: 0, left: 0, active: false, charges: 0, max: 0, ready: false };
    const max = d.max || 1, active = s.t > 0;
    return { id: s.id, name: d.name, cd: s.ch > 0 && !active ? 0 : Math.max(0, s.rc), cdMax: d.cd, left: Math.max(0, s.t), active, charges: s.ch, max, ready: s.ch > 0 && !active, icon: d.icon };
  };

  // người tìm chỉ dùng kỹ năng sau biến hình; đang bị choáng, gục, đứng hình cảnh cổng thì không
  TT.canUseSkill = (m, a) => {
    if (!a || m.phase !== 'playing' || a.life !== 'alive' || !ensure(a)) return false;
    if (a.role === 'seek' && (a.form !== 'seek' || a.look !== 'seek')) return false;
    if (a.motion || TT.speedOf(a) === 0) return false;
    return true;
  };

  function begin(m, a, d, aim, want) {
    const s = a.skill;
    if (s.ch === (d.max || 1)) s.rc = d.cd;
    s.ch--; s.t = d.dur || 0;
    d.start(m, a, aim, want);
    if (!d.dur) s.t = 0;
    TT.emit('skill', { id: d.id, actor: a.id, hero: a.hero, x: a.x, y: a.y });
  }

  function finish(m, a) {
    const d = SKILLS[a.skill.id];
    a.skill.t = 0; a.skill.rc = d.cd;
    if (d.end) d.end(m, a);
  }

  TT.useSkill = (m, a, aim, want) => {
    const d = a && ensure(a), s = a && a.skill;
    if (!d) return false;
    if (s.t > 0 && d.press === 'cancel' && a.life === 'alive') { finish(m, a); return true; }   // bấm lại: huỷ (tàng hình)
    if (!TT.canUseSkill(m, a) || s.ch <= 0 || s.t > 0) return false;
    if (aim == null) aim = isHuman(m, a) ? TT.aimAngle(m, a) : (a.moving ? a.aim : (a.face < 0 ? Math.PI : 0));
    if (d.canStart && !d.canStart(m, a, aim, want)) return false;
    begin(m, a, d, aim, want);
    return true;
  };
  TT.skillPress = () => { const m = TT.M; if (m) m.skillReq = true; };

  // ---------------------------------------------------------------- mỗi bước
  function stepActor(m, a, dt) {
    const d = ensure(a), s = a.skill;
    if (!d) return;
    if (s.t > 0) {
      if (a.life !== 'alive') { finish(m, a); return; }
      s.t -= dt;
      if (d.update) d.update(m, a, dt);
      if (s.t <= 1e-9) finish(m, a);
    } else if (s.ch < (d.max || 1)) {
      s.rc -= dt;
      if (s.rc <= 0) { s.ch++; s.rc = d.cd; if (s.ch >= (d.max || 1)) s.rc = 0; }
    }
  }

  TT.stepLayers.push((m, dt) => {
    const S = sk(m);
    if (m.skillReq) { m.skillReq = false; if (m.phase === 'playing') TT.useSkill(m, m.human); }
    for (const a of m.actors) stepActor(m, a, dt);
    // búp bê hết hạn
    for (const d of S.decoys) { d.ghost.animT += dt; if (d.until <= m.now && d.life === 'alive') { d.life = 'dead'; vfx('smoke', d.x, d.y); } }
    S.decoys = S.decoys.filter(d => d.life === 'alive');
    // hố đen: hút người trốn về tâm
    for (const h of S.holes) {
      h.t += dt;
      if (h.t > SWIRL.life) continue;
      for (const x of hidersOf(m)) {
        const dx = h.x - x.x, dy = h.y - x.y, d = Math.hypot(dx, dy);
        if (d > SWIRL.pullR || d < 0.15 || x.motion || TT.hasEffect(x, 'shield', m.now)) continue;
        const v = Math.min(SWIRL.pull * dt, d);
        slide(m, x, dx / d * v, dy / d * v);
      }
    }
    S.holes = S.holes.filter(h => h.t <= SWIRL.life);
    for (const p of S.follows) { p.f.x = p.a.x * T; p.f.y = p.a.y * T + 5; }
    S.follows = S.follows.filter(p => { const keep = p.until > m.now && !p.f.gone && p.a.life === 'alive'; if (!keep) p.f.gone = true; return keep; });
    // choáng: vòng sao trên đầu
    for (const a of m.actors) {
      if (a.life !== 'alive' || !TT.hasEffect(a, 'stun', m.now)) { S.dizzy.delete(a.id); continue; }
      if ((S.dizzy.get(a.id) || 0) <= m.now) { S.dizzy.set(a.id, m.now + 0.5); vfx('buff_dizzy', a.x, a.y - 1.1); }
    }
    S.fx = S.fx.filter(f => f.t0 + f.dur > m.now);
  });

  // người đánh trúng búp bê thì búp bê nổ khói; bot người tìm bỏ qua búp bê đã nổ
  const inArc = (a, t, ang) => {
    const dx = t.x - a.x, dy = t.y - a.y, d = Math.hypot(dx, dy);
    if (d > C.ATTACK_RANGE) return false;
    if (d < 0.6) return true;
    let da = Math.abs(Math.atan2(dy, dx) - ang);
    if (da > Math.PI) da = 2 * Math.PI - da;
    return da <= C.ATTACK_ARC;
  };
  const baseAttack = TT.attack, baseCanAttack = TT.canAttack;
  TT.attack = (m, a, ang) => {
    const ok = baseAttack(m, a, ang);
    if (ok && m.sk) for (const d of m.sk.decoys) if (d.life === 'alive' && inArc(a, d, ang)) {
      d.life = 'dead'; vfx('smoke', d.x, d.y - 0.3, { scale: 1.2 }); vfx('hit_yellow', d.x, d.y - 0.6);
      TT.emit('decoyPop', { owner: d.owner, by: a.id, x: d.x, y: d.y });
    }
    if (ok && m.sk) m.sk.decoys = m.sk.decoys.filter(d => d.life === 'alive');
    return ok;
  };
  TT.canAttack = a => baseCanAttack(a) && !(a.motion && a.motion.kind === 'skill');   // đang bay/lộn thì không vung
  TT.decoyFor = (m, a, range) => {
    if (!m.sk) return null;
    let best = null, bd = range || 9;
    for (const d of m.sk.decoys) { const k = dist(a, d); if (d.life === 'alive' && k <= bd) { best = d; bd = k; } }
    return best;
  };

  // ---------------------------------------------------------------- bot
  const visibleHiders = (m, a) => m.actors.filter(h => h.role === 'hide' && h.life === 'alive' && dist(a, h) <= 9 && TT.alphaFor(m, a, h) > 0);
  const nearestOf = (list, a) => { let b = null, bd = Infinity; for (const x of list) { const d = dist(a, x); if (d < bd) { bd = d; b = x; } } return b; };

  TT.botSkill = (m, a, ai) => {
    if (m.phase !== 'playing' || (ai.skT || 0) > m.now || !TT.canUseSkill(m, a)) return;
    ai.skT = m.now + 0.25;
    const d = SKILLS[TT.heroSkill(a.hero)];
    if (a.skill.ch <= 0 || a.skill.t > 0) return;
    if (a.role === 'hide') {
      const seekers = m.actors.filter(s => s.role === 'seek' && s.life === 'alive' && s.look === 'seek' && s.form === 'seek');
      const th = nearestOf(seekers, a), dt = th ? dist(a, th) : Infinity;
      let go = false, aim = null;
      if (d.id === 'invisibility') go = dt <= 4.5;
      else if (d.id === 'master_s_trick') go = dt <= 4.5;
      else if (d.id === 'dodge') { go = dt <= 2.5; if (th) aim = Math.atan2(a.y - th.y, a.x - th.x); }
      else if (d.id === 'pray') {
        const cap = 6 + m.zone.step;
        go = m.actors.some(x => x.role === 'hide' && x.life === 'downed' && dist(a, x) <= 8) || (TT.outsideZone(m, a) && a.hp <= 2) ||
          m.actors.some(x => x.role === 'hide' && x.life === 'alive' && dist(a, x) <= 6 && x.hp <= cap - 3 && TT.outsideZone(m, x));
      }
      if (go) TT.useSkill(m, a, aim);
      return;
    }
    const vis = visibleHiders(m, a), p = nearestOf(vis, a);
    if (!p) return;
    const k = dist(a, p), ang = Math.atan2(p.y - a.y, p.x - a.x);
    if (d.id === 'emp' && k <= EMP.radius - 0.3) TT.useSkill(m, a, ang);
    else if (d.id === 'alien_swirl' && k >= 1.2 && k <= 5.5) TT.useSkill(m, a, ang);
    else if (d.id === 'leap' && k > 4 && k <= 9) TT.useSkill(m, a, ang, k - 0.8);
    else if (d.id === 'quantum_translocator' && k > 4 && k <= 9) TT.useSkill(m, a, ang, k - 0.8);
  };

  // ---------------------------------------------------------------- vẽ (toạ độ thế giới, sau nhân vật)
  function drawBolt(ctx, x0, y0, x1, y1, seed, alpha) {
    ctx.globalAlpha = alpha; ctx.strokeStyle = '#bfefff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x0, y0);
    const n = 5;
    for (let i = 1; i < n; i++) {
      const u = i / n, nx = -(y1 - y0), ny = x1 - x0, l = Math.hypot(nx, ny) || 1, j = Math.sin(seed * 12.9 + i * 78.2) * 3;
      ctx.lineTo(x0 + (x1 - x0) * u + nx / l * j, y0 + (y1 - y0) * u + ny / l * j);
    }
    ctx.lineTo(x1, y1); ctx.stroke();
  }

  TT.worldLayers.push((ctx, m, viewer) => {
    const S = m.sk; if (!S) return;
    // hố đen
    for (const h of S.holes) {
      const k = Math.min(1, h.t / SWIRL.life), x = h.x * T, y = h.y * T, r = SWIRL.radius * T * (0.4 + 0.6 * Math.min(1, h.t * 4)) * (1 - 0.3 * k);
      const g = ctx.createRadialGradient(x, y, 1, x, y, r);
      g.addColorStop(0, 'rgba(10,0,20,0.85)'); g.addColorStop(0.6, 'rgba(120,10,70,0.35)'); g.addColorStop(1, 'rgba(120,10,70,0)');
      ctx.save(); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.75, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,90,140,0.55)'; ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) { const a0 = m.now * 5 + i * 2.1; ctx.beginPath(); ctx.ellipse(x, y, r * (0.5 + 0.15 * i), r * (0.38 + 0.11 * i), 0, a0, a0 + 2); ctx.stroke(); }
      ctx.restore();
    }
    // viên xoáy đang bay
    for (const a of m.actors) {
      const b = a.skill && a.skill.id === 'alien_swirl' && a.skill.b;
      if (!b || b.hole) continue;
      const x = b.x * T, y = b.y * T;
      ctx.save();
      const g = ctx.createRadialGradient(x, y, 0, x, y, 9); g.addColorStop(0, 'rgba(255,60,90,0.9)'); g.addColorStop(1, 'rgba(255,60,90,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fill();
      ctx.fillStyle = '#2a0014'; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fill();
      ctx.restore();
    }
    // búp bê
    for (const d of S.decoys) {
      const al = viewer.role === 'hide' ? 0.6 : 1;
      d.ghost.x = d.x; d.ghost.y = d.y; d.ghost.face = d.face;
      TT.drawActor(ctx, m, viewer, d.ghost, al);
    }
    for (const f of S.fx) {
      const k = (m.now - f.t0) / f.dur;
      if (k < 0) continue;
      ctx.save();
      if (f.kind === 'emp') {
        const cx = f.x * T, cy = f.y * T, len = EMP.radius * T, spin = (120 * Math.PI / 180 / 0.5) * (m.now - f.t0);
        for (let i = 0; i < EMP.beams; i++) { const an = i / EMP.beams * Math.PI * 2 + spin; drawBolt(ctx, cx, cy, cx + Math.cos(an) * len, cy + Math.sin(an) * len * 0.8, m.now * 20 + i, 1 - k); }
        ctx.globalAlpha = 0.5 * (1 - k); ctx.strokeStyle = '#8fe0ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(cx, cy, len * Math.min(1, k * 3), len * 0.8 * Math.min(1, k * 3), 0, 0, 7); ctx.stroke();
      } else if (f.kind === 'ring') {
        const r = f.r * T * Math.min(1, 0.3 + k), cx = f.x * T, cy = f.y * T;
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = 'rgb(' + f.color + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.7, 0, 0, 7); ctx.stroke();
        ctx.fillStyle = 'rgba(' + f.color + ',' + 0.25 * (1 - k) + ')'; ctx.fill();
      } else if (f.kind === 'prefab') {
        ctx.globalAlpha = 1 - Math.max(0, k - 0.5) * 2;
        SK.drawPrefab(ctx, f.parts, f.x * T, f.y * T, { t: m.now - f.t0, scale: f.scale, state: f.state });
      }
      ctx.restore();
    }
  });
})();
