// Đội trưởng Hulala-Moli (boss_warlord, 4-5 Di Tích Núi Khối). Nhãn: [ĐO] dữ liệu bundle, [WIKI Captain Hulala Morley], [ƯỚC LƯỢNG].
// Hulala cưỡi lần lượt Ngựa, Bò, Xe Ngựa đá, mỗi con 1/3 máu tổng; hết một con thì nó nổ tung và Hulala nhảy sang con kế [WIKI].
// BossWarlordBrain là PlayMakerFSM (Idle/Move/Skill) trong IL2CPP: đòn dựng từ cửa sổ sự kiện clip của từng con vật
// (anim_onSkillEffectiveStart/End/SkillEnd [ĐO]), vũ khí tay (giáo, búa Moo Moo, điện thoại gọi pháo [ĐO anim nút weapon_0/1/2])
// và prefab đạn thật boss_warlord_bullet_{spear,hammer,phone}. Số viên/sát thương/tốc là [ƯỚC LƯỢNG] trừ chỗ có ghi [ĐO].
// Máu: config ghi 999999 giữ chỗ; wiki 1800 (Tinh Anh 2250) = 1500 × HP_FACTOR 1,2 nên đặt 1500 ở đây.
(function () {
  'use strict';
  const SK = window.SK, K = SK.BOSS_KIT, RG = SK.bossRig;
  if (!K || !RG) return;
  const { TAU, DEG, U, B86, fire, explode, hurtIn, aimAt, rigPlay, rigState, rigPoint, clampRoom } = K;
  const ent = B86.bosses.boss_warlord;
  if (!ent) return;
  ent.hp = 1500;
  const W = SK.world;

  // Ngựa (kỹ năng 1-3), Bò (1-5), Xe (1-2); tốc đi [ĐO RoleAttribute.speed 9 / 6 / 7]
  const MOUNTS = [{ id: 'boss_warlord_horse', spd: 9 }, { id: 'boss_warlord_ox', spd: 6 }, { id: 'boss_warlord_chariot', spd: 7 }];
  const WEAPON = ['img/h1/weapon_0', 'img/h1/weapon_1', 'img/h1/weapon_2'];
  const GUN = ['img/h1/weapon_0/w/gun_point', 'img/h1/weapon_1/w/gun_point', 'img/h1/weapon_2/w/gun_point'];
  const ANIM_NODE = [3, 6, 9];   // Animator của giáo / búa / điện thoại nằm ở các nút này [ĐO rig]
  const PHASE_ATKS = [['horse_kick', 'horse_leap', 'horse_rush'], ['ox_slam', 'ox_charge', 'ox_quake', 'ox_rage'], ['cart_volley', 'cart_laser', 'cart_strike']];
  const ALL = [].concat(...PHASE_ATKS);
  // đòn -> state của con vật (Animator gốc của mount) [ĐO clip]
  const MSTATE = { horse_kick: 'skill_1', horse_leap: 'skill_2', horse_rush: 'skill_3', ox_slam: 'skill_1', ox_charge: 'skill_2', ox_quake: 'skill_3',
    ox_rage: 'skill_5', cart_volley: 'skill_1', cart_laser: 'skill_2', cart_strike: null };

  const fl = e => (e.face < 0 ? -1 : 1);
  function riderPos(e) { return rigPoint(e.mount.R, e.mount.mp, e.x, e.y, fl(e)); }
  function muzzle(e) {
    const [rx, ry] = riderPos(e), i = e.nodes[GUN[e.phase]];
    return i == null ? [rx, ry - 6] : rigPoint(e.R, i, rx, ry, fl(e));
  }

  function newMount(e) {
    const M = MOUNTS[e.phase], me = B86.bosses[M.id], R = RG.rigNew(me.rig);
    e.mount = { R, mp: me.rig.nodes.findIndex(n => n.n === 'img/mount_point'), id: M.id };
    rigPlay(R, 'idle');
    e.speed = M.spd;
    WEAPON.forEach((w, j) => { const i = e.nodes[w]; if (i != null) e.R.ov[i] = { on: j === e.phase }; });
  }
  function ensure(G, e) {
    if (e.mount) return;
    e.phase = 0; e.win = false; e.dash = null; e.leap = null; e.faceT = 1;
    e.hb = { size: [2.5 * U, 1.6 * U], off: [0, 0.8 * U] }; e.r = 9;   // hộp trúng đạn = thân con vật [ĐO collider mount 2.5 × 1.27]
    newMount(e);
    // Con vật chạy clip của riêng nó kể cả lúc giới thiệu/chết (brain chỉ tick rig của Hulala)
    e.arena.objs.push({ t: 0, dur: 1e9, update(G2, o, dt) {
      RG.rigTick(e.mount.R, dt, (fn, arg, node, st) => mountEv(G2, e, fn, st));
      if (e.old) { e.old.t += dt; RG.rigTick(e.old.R, dt); if (e.old.t > 1.6) e.old = null; }
      return true;
    } });
  }

  // ---------------------------------------------------------------- vũ khí tay
  function thrust(G, e, spread) {
    const [x, y] = muzzle(e), a = aimAt(G, x, y), n = spread ? 3 : 1;
    rigPlay(e.R, spread ? 'spear_atk_1_0' : 'spear_atk_0', ANIM_NODE[0]);
    // giáo bullet_boss_warlord_bullet_spear (RGSword): mũi đâm ngắn, sát thương 3 [ƯỚC LƯỢNG]
    for (let k = 0; k < n; k++) fire(G, e, 'boss_warlord_bullet_spear', x, y, a + (k - (n - 1) / 2) * 16 * DEG, { spd: 24, life: 0.24, dmg: 3, h: Math.max(4, e.y - y) });
  }
  function hammer(G, e, n, step, spd) {
    const [x, y] = muzzle(e), a = aimAt(G, x, y);
    rigPlay(e.R, 'hammer_atk_0', ANIM_NODE[1]);
    // búa bullet_boss_warlord_bullet_hammer (Bullet01 tốc 10, nảy tường 1 lần [ĐO]); sát thương 3 [ƯỚC LƯỢNG]
    for (let k = 0; k < n; k++) fire(G, e, 'boss_warlord_bullet_hammer', x, y, a + (k - (n - 1) / 2) * step * DEG, { spd: spd || 9, dmg: 3, h: Math.max(4, e.y - y) });
  }
  function ring(G, e, n, spd) {
    const a0 = SK.rand() * TAU;
    for (let k = 0; k < n; k++) fire(G, e, 'boss_warlord_bullet_hammer', e.x, e.y - 12, a0 + k * TAU / n, { spd: spd || 7, dmg: 3, h: 12 });
  }
  function stomp(G, e, r, dmg, dx) {
    const x = e.x + fl(e) * (dx || 0), y = e.y;
    explode(G, x, y, 'explode_hit_player', r > 22 ? 'explode_big' : 'explode_small', dmg);
  }
  // Điện thoại gọi pháo: nắm đấm đá bullet_363 (ExplodeHammer, sát thương 6 [ĐO]) rơi từ trên xuống, chạm đất lúc 1.57 s (ShakeCamera [ĐO clip])
  function fist(G, e, x, y) {
    const L = B86.bullets.boss_warlord_bullet_phone, Rg = RG.rigNew(L.rig);
    [x, y] = clampRoom(e, x, y);
    rigPlay(Rg, 'bullet_363');
    e.arena.objs.push({
      t: 0, dur: 3.9,
      update(G2, o, dt) {
        if (e.deathDone) return false;
        RG.rigTick(Rg, dt, fn => { if (fn === 'ShakeCamera') { hurtIn(G2, x, y, 26, 6); G2.shake = Math.max(G2.shake, 6); } });
        return o.t < o.dur;
      },
      ground(ctx) { RG.rigDraw(ctx, Rg, x, y, {}); }
    });
  }

  // ---------------------------------------------------------------- lao tới / nhảy
  function dashTo(e, ang, speed, dur, dmg) { e.dash = { vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, t: dur, dmg, hit: false }; }
  function updateMove(G, e, dt) {
    const p = G.player;
    if (e.dash) {
      const d = e.dash;
      d.t -= dt;
      const hit = SK.moveBox(G.map, e, d.vx * dt, d.vy * dt, e.r);
      if (Math.abs(d.vx) > 1) e.face = d.vx > 0 ? 1 : -1;
      if (!d.hit && p.st !== 'dead' && Math.abs(p.x - e.x) < 22 && Math.abs((p.y - 6) - (e.y - 12)) < 18) { d.hit = true; SK.hurtPlayer(G, d.dmg || 3, e.x, e.y); }
      if (hit || d.t <= 0) { e.dash = null; if (hit && d.wall) d.wall(); }
    }
    if (e.leap) {
      const l = e.leap;
      l.t += dt;
      const k = Math.min(1, l.t / l.dur);
      e.x = l.x0 + (l.x1 - l.x0) * k; e.y = l.y0 + (l.y1 - l.y0) * k;
      if (k >= 1) e.leap = null;
    }
  }

  // ---------------------------------------------------------------- cửa sổ sự kiện của clip con vật
  function mountEv(G, e, fn, st) {
    if (e.deathDone || !e.cur) return;
    const A = ATK[e.cur];
    if (!A) return;
    if (fn === 'anim_onSkillEffectiveStart') { e.win = true; if (A.start) A.start(G, e, st); }
    else if (fn === 'anim_onSkillEffectiveEnd') { e.win = false; if (A.end) A.end(G, e, st); }
    else if (fn === 'anim_onSkillEnd') { if (A.endOnClip !== false) e.atkEnd = true; }
  }
  const lock = e => { e.lock = [e.x, e.y]; };

  const ATK = {
    // Ngựa: đá hậu (0.125 s), nhảy bổ (0.5-0.94 s), ba lần húc liền (3 cửa sổ 0.5 s) [ĐO skill_1/2/3]
    horse_kick: { start(G, e) { stomp(G, e, 22, 3, 14); thrust(G, e, false); } },
    horse_leap: {
      begin(G, e) { e.target = [G.player.x, G.player.y]; },
      start(G, e) {
        const [tx, ty] = clampRoom(e, e.target[0], e.target[1]);
        e.leap = { x0: e.x, y0: e.y, x1: tx, y1: ty, t: 0, dur: 0.44 };
      },
      end(G, e) { e.leap = null; stomp(G, e, 30, 4, 0); G.shake = Math.max(G.shake, 4); ring(G, e, 8, 6); thrust(G, e, true); }
    },
    horse_rush: { start(G, e) { dashTo(e, Math.atan2(G.player.y - e.y, G.player.x - e.x), 150, 0.5, 3); thrust(G, e, false); } },
    // Bò: đập búa (0.083 s), húc thẳng (skill_2 rồi lặp), năm nhịp đập (skill_3), chuỗi húc + búa (skill_5) [ĐO]
    ox_slam: { start(G, e) { stomp(G, e, 28, 4, 16); hammer(G, e, 5, 18, 8); } },
    ox_charge: {
      endOnClip: false,
      begin(G, e) { e.target = [G.player.x, G.player.y]; e.chargeT = 0; },
      start(G, e) {
        const a = Math.atan2(e.target[1] - e.y, e.target[0] - e.x);
        // húc tới khi đâm tường hoặc 1.4 s, tốc 12 đơn vị/giây [ƯỚC LƯỢNG]; đâm tường thì choáng 0.8 s
        dashTo(e, a, 12 * U, 1.4, 4);
        e.dash.wall = () => { G.shake = Math.max(G.shake, 4); e.busyAfter = 0.8; };
      },
      tick(G, e, dt) {
        if (!e.win) return;
        if (!e.dash) { e.win = false; rigPlay(e.mount.R, 'idle'); e.atkEnd = true; e.busy = Math.max(e.busy, e.busyAfter || 0.3); e.busyAfter = 0; }
      }
    },
    ox_quake: {
      start(G, e) { stomp(G, e, 28, 4, 14); ring(G, e, 10, 6); },
      end(G, e, st) { if (st !== 'skill_3') return; stomp(G, e, 28, 4, 14); ring(G, e, 10 + (e.enraged ? 4 : 0), 6); }
    },
    ox_rage: { start(G, e) { stomp(G, e, 24, 3, 14); hammer(G, e, 7, 14, 10); } },
    // Xe ngựa: sáu loạt đạn nhỏ (6 mốc 0.2-0.7 s [ĐO]), laser sau tụ lực (skill_2 → loop → end), điện thoại gọi pháo
    cart_volley: {
      start(G, e) {
        const [x, y] = muzzle(e), a = aimAt(G, x, y) + SK.randf(-9, 9) * DEG;
        fire(G, e, 'bullet_e_1', x, y, a, { spd: 11, dmg: 3, h: Math.max(4, e.y - y) });
      }
    },
    cart_laser: {
      endOnClip: false,
      start(G, e) {
        if (e.laserOn) return;
        e.laserOn = true; e.laserT = 0;
        let a = aimAt(G, e.x, e.y - 14);
        K.beam(G, e, 'bullet_e_8', {
          dmg: 3, alive: () => e.laserOn && !e.deathDone, origin: () => muzzle(e),
          ang(dt) {
            const [mx, my] = muzzle(e), w = aimAt(G, mx, my);
            const d = Math.atan2(Math.sin(w - a), Math.cos(w - a));
            a += SK.clamp(d, -40 * DEG * dt, 40 * DEG * dt);
            return a;
          }
        });
      },
      tick(G, e, dt) {
        if (!e.laserOn) return;
        e.laserT += dt;
        if (e.laserT > 2.4) { e.laserOn = false; rigPlay(e.mount.R, 'skill_2_end'); e.endT = 0.4; }
      }
    },
    cart_strike: {
      endOnClip: false,
      begin(G, e) {
        rigPlay(e.R, 'phone_atk', ANIM_NODE[2]);
        e.strikeT = 0; e.strikes = 0;
      },
      tick(G, e, dt) {
        e.strikeT += dt;
        // phone_atk 0.97 s: sự kiện anim_createBullet lúc 0.93 s → ba nắm đấm quanh người chơi, cách 0.45 s
        if (e.strikes < 3 && e.strikeT >= 0.93 + e.strikes * 0.45) {
          const p = G.player, a = e.strikes * TAU / 3 + SK.rand();
          fist(G, e, p.x + (e.strikes ? Math.cos(a) * 26 : 0), p.y + (e.strikes ? Math.sin(a) * 18 : 0));
          e.strikes++;
        }
        if (e.strikeT > 1.7) e.atkEnd = true;
      }
    }
  };

  function advance(G, e) {
    // Con vật vỡ ra, Hulala nhảy sang con kế: dừng đòn 1.8 s [WIKI]
    e.old = { R: e.mount.R, t: 0 };
    rigPlay(e.old.R, 'dead');
    if (SK.vfx) SK.vfx.spawn(G, 'explode_hit_player', e.x, e.y, { state: 'explode_big' });
    G.shake = Math.max(G.shake, 6);
    e.phase++;
    e.dash = null; e.leap = null; e.laserOn = false; e.win = false;
    if (e.atk) e.atkEnd = true;
    e.cur = null;
    newMount(e);
    e.busy = Math.max(e.busy, 1.8);
    e.cd = 0.4;
  }

  const def = {
    atks: ALL, idle: 'idle_0', run: 'run', hand: 'img/h1', aimDuring: ALL, enrageCd: 0.75, firstCd: 1.2,
    state: Object.fromEntries(ALL.map(n => [n, 'idle_1'])),   // đòn chạy trên Animator của con vật; state của Hulala chỉ giữ chỗ
    skipNode: () => true,   // Hulala được vẽ trong drawOver, đặt đúng chỗ ngồi
    pick(G, e) { ensure(G, e); return PHASE_ATKS[e.phase]; },
    start: Object.fromEntries(ALL.map(n => [n, (G, e) => {
      ensure(G, e);
      e.cur = n; e.win = false; e.laserOn = false;
      const A = ATK[n];
      if (A.begin) A.begin(G, e);
      const ms = MSTATE[n];
      if (ms) rigPlay(e.mount.R, ms);
    }])),
    canAttack(e) { return !e.leap && !e.dash; },
    tick(G, e, dt) {
      ensure(G, e);
      while (e.phase < 2 && e.hp <= e.hpMax * (1 - (e.phase + 1) / 3)) advance(G, e);
      updateMove(G, e, dt);
      const A = e.cur && ATK[e.cur];
      if (e.atk && A && A.tick) A.tick(G, e, dt);
      if (e.endT > 0) { e.endT -= dt; if (e.endT <= 0) e.atkEnd = true; }
      if (!e.atk) {
        e.cur = null;
        // con vật chạy/đứng theo bước đi của brain; mặt Hulala đổi ngẫu nhiên 4 kiểu [WIKI]
        const ms = rigState(e.mount.R);
        if (ms === 'idle' || ms === 'run') { const want = e.moving ? 'run' : 'idle'; if (ms !== want) rigPlay(e.mount.R, want); }
        e.faceT -= dt;
        if (e.faceT <= 0 && !e.moving) { e.faceT = SK.randf(1.5, 3); rigPlay(e.R, 'idle_' + SK.randi(0, 3)); }
      }
    },
    drawOver(ctx, G, e) {
      if (!e.mount) return;
      const pages = e.flash > 0 ? SK.pagesWhite : null, flip = e.face < 0;
      if (e.old) RG.rigDraw(ctx, e.old.R, e.x, e.y, { flip, pages: null, alpha: Math.max(0, 1 - e.old.t / 1.6) });
      RG.rigDraw(ctx, e.mount.R, e.x, e.y, { flip, pages });
      const [rx, ry] = riderPos(e);
      RG.rigDraw(ctx, e.R, rx, ry, { flip, pages, skip: n => n.n === 'shadow' || n.n === 'weak_icon' });
    },
    dead(G, e) { ensure(G, e); e.dash = null; e.leap = null; e.laserOn = false; rigPlay(e.mount.R, 'dead'); e.arena.objs.push({ t: 0, dur: 4, update(G2, o, dt) { RG.rigTick(e.mount.R, dt); return o.t < o.dur; } }); }
  };
  void W;
  SK.bossRegister('boss_warlord', def);
  // Dựng con vật đầu tiên ngay lúc sinh để màn giới thiệu đã có hình
  const make = SK.CUSTOM_ENEMIES.boss_warlord;
  SK.CUSTOM_ENEMIES.boss_warlord = (G, x, y, room) => { const e = make(G, x, y, room); ensure(G, e); return e; };
})();
