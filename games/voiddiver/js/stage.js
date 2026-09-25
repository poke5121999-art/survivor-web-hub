// Sân khấu một cảnh (lặn hoặc sảnh): nối lõi combat (skill.js/hitbox.js/buff.js) với hình Spine, VFX, tiếng, camera.
// Lõi combat chỉ phát sự kiện qua world.emit; mọi thứ nhìn/nghe được đều xử lý ở onEvent bên dưới.
(function (VD) {
  'use strict';
  const THREE = window.THREE;

  // Dự phòng khi VD.ASSETS.units chưa có: bộ Spine của 4 nhân vật và preset da 1001/3001/4001/5001 (CharacterSkinPreset).
  const CHAR_FALLBACK = {
    100001: { spine: 'Cha_Sword', skins: ['body/skinbase_1', 'body/eye_1', 'body/hair_1', 'body/costume_1', 'weapon/1001'] },
    100003: { spine: 'Cha_Dullahan', skins: ['body/skinbase_1', 'body/costume_1', 'weapon/1201'] },
    100004: { spine: 'Cha_Caster', skins: ['body/skinbase_1', 'body/eye_1', 'body/hair_1', 'body/costume_1', 'body/acc_1', 'weapon/1101'] },
    100005: { spine: 'Cha_Raven', skins: ['body/skinbase_1', 'body/eye_1', 'body/hair_1', 'body/costume_1', 'weapon/1301'] },
  };

  const S = {
    mode: null, units: [], vis: new Map(), player: null, A: null, fx: new Map(), onDeath: null, onUnitEvent: null,
    loadout: null, pending: 0, deadQueue: [],
  };

  function unitAsset(u) {
    const a = VD.ASSETS && VD.ASSETS.units && VD.ASSETS.units[u.id];
    if (a) return a;
    if (u.kind === 'char') return Object.assign({ scale: 1, shadow: 0.5 }, CHAR_FALLBACK[u.id]);
    return null;
  }
  // Dự phòng cho quái khi manifest chưa có bảng unit: bộ Spine nào có skin mang đúng id quái.
  const skinIndex = new Map();
  async function findSpineBySkin(id) {
    if (skinIndex.has(id)) return skinIndex.get(id);
    const names = Object.keys((VD.ASSETS && VD.ASSETS.spine) || {});
    for (const n of names) {
      try {
        const b = await VD.loadSpine(n);
        const d = b.dirs.SW || b.dirs.NW;
        if (d && d.data.findSkin(String(id))) { skinIndex.set(id, n); return n; }
      } catch (e) { /* bộ lỗi: bỏ qua */ }
    }
    skinIndex.set(id, null);
    return null;
  }

  // ---------------------------------------------------------------- world cho lõi combat
  function makeAdapter(opts) {
    const W = VD.world;
    return {
      units: S.units, time: 0, difficulty: opts.difficulty || 'Normal', skillLocomotion: false,
      rng: VD.rng(opts.seed || (Date.now() & 0xffff)),
      emit: onEvent,
      moveUnit(u, dx, dz, o) {
        const want = { x: u.pos.x + dx, z: u.pos.z + dz };
        W.moveCircle(u.pos, Math.max(0.15, u.radius || 0.25), dx, dz, !!(o && o.ignoreCollision));
        return { x: u.pos.x, z: u.pos.z, blocked: Math.hypot(want.x - u.pos.x, want.z - u.pos.z) > 1e-3 };
      },
      raycastWall(a, b) {
        const t = W.raycastShot(a.x, a.z, b.x, b.z);
        return t < 1 ? { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t } : null;
      },
      teleportUnit(u, to) {
        // Lùi dần về phía điểm xuất phát tới khi đứng được (không kẹt trong tường).
        let x = to.x, z = to.z;
        for (let i = 0; i < 20 && W.overlapsMove(x, z, u.radius || 0.25); i++) { x += (u.pos.x - x) * 0.2; z += (u.pos.z - z) * 0.2; }
        u.pos.x = x; u.pos.z = z;
        return { x, z };
      },
      summon(owner, infos, pos) {
        for (const inf of infos || []) {
          const id = inf.MonsterId || inf.Id || inf.id;
          if (!id) continue;
          const n = inf.Count || inf.count || 1;
          for (let i = 0; i < n; i++) S.spawn({ kind: 'mon', id, pos: { x: pos.x + (Math.random() - 0.5), z: pos.z + (Math.random() - 0.5) }, team: owner.team });
        }
      },
      spawnExtraUnit(id, owner, pos, dir) { return S.spawn({ kind: 'extra', id, pos, aim: dir, team: owner.team, owner }); },
      spreadAggro(u, dist) { if (VD.AI && VD.AI.spreadAggro) VD.AI.spreadAggro(S.A, u, dist); },
    };
  }

  // ---------------------------------------------------------------- vòng đời
  S.begin = function (opts) {
    S.end();
    S.mode = opts.mode;
    S.A = makeAdapter(opts);
    S.units = S.A.units;
    if (VD.vfx) VD.vfx.setScene(VD.render.scene);
  };
  S.end = function () {
    for (const v of S.vis.values()) v.dispose();
    S.vis.clear(); S.fx.clear();
    if (S.units) S.units.length = 0;
    S.player = null; S.deadQueue.length = 0;
    if (VD.vfx && VD.vfx.clear) VD.vfx.clear();
  };

  S.spawn = function (spec) {
    // Talent của hồ sơ (app.js đặt S.charExtras trước khi lặn): talents cho TalentConditionList, AddSkill → passive thêm của nhân vật.
    const ex = spec.kind === 'char' && S.charExtras ? S.charExtras : null;
    if (ex && ex.talents) spec = Object.assign({ talents: ex.talents }, spec);
    const u = VD.Skill.makeUnit(S.A, spec);
    if (ex && ex.skills && ex.skills.length) {
      u.row = Object.assign({}, u.row, { PassiveSkillIds: (u.row.PassiveSkillIds || []).concat(ex.skills.filter(id => VD.combatDB().skill(id))) });
      VD.Skill.bindSkills(u);
    }
    if (spec.owner) u.owner = spec.owner;
    u.spawnedAt = S.A.time;
    if (S.units.indexOf(u) < 0) S.units.push(u);
    VD.Skill.initPassives(S.A, u);
    const a = unitAsset(u) || { spine: null, skins: [String(u.id)], scale: 1, shadow: 0.5 };
    S.pending++;
    (a.spine ? Promise.resolve(a.spine) : findSpineBySkin(u.id)).then(name => {
      if (!name) throw new Error('không có hình cho unit ' + u.kind + ' ' + u.id);
      return VD.loadSpine(name);
    }).then(bundle => {
        if (u.removed) return;
        const skins = a.skins && a.skins.length ? a.skins : [String(u.id)];
        const vis = new VD.UnitVisual(bundle, { skins, scale: a.scale || 1, shadow: a.shadow || 0.5 });
        VD.render.scene.add(vis.root);
        S.vis.set(u.uid, vis);
        vis.root.position.set(u.pos.x, 0, u.pos.z);
    }).catch(e => console.warn(e.message || e)).finally(() => { S.pending--; });
    return u;
  };

  S.remove = function (u) {
    u.removed = true;
    const i = S.units.indexOf(u); if (i >= 0) S.units.splice(i, 1);
    const v = S.vis.get(u.uid); if (v) { v.dispose(); S.vis.delete(u.uid); }
  };

  S.setPlayer = function (u, loadout) { S.player = u; S.loadout = loadout || S.defaultLoadout(u); };

  // Ô RMB/Q/E: ba skill General/None đầu tiên trong ActiveSkillIds; R: skill Ultimate. [SUY LUẬN, docs/decisions.tsv]
  S.defaultLoadout = function (u) {
    const db = VD.combatDB(), ids = u.row.ActiveSkillIds || [];
    const gen = [], out = { SkillOne: -1, SkillTwo: -1, SkillThree: -1, SkillFour: -1 };
    ids.forEach((id, i) => { const r = db.skill(id); const tags = (r && r.SkillTags) || []; if (tags.indexOf('Ultimate') >= 0) out.SkillFour = i; else gen.push(i); });
    out.SkillOne = gen[0] != null ? gen[0] : -1; out.SkillTwo = gen[1] != null ? gen[1] : -1; out.SkillThree = gen[2] != null ? gen[2] : -1;
    return out;
  };

  // ---------------------------------------------------------------- điều khiển người chơi
  const BACKWARD = () => VD.combatDB().c('BackwardMoveSpeedMultiplier', 0.78);
  function playerInput(u, dt) {
    const inp = VD.input, enabled = inp.enabled !== false;
    const ax = VD.render.screenAxes();
    const mx = enabled ? inp.move.x : 0, my = enabled ? inp.move.y : 0;
    const mvx = ax.right.x * mx + ax.fwd.x * my, mvz = ax.right.z * mx + ax.fwd.z * my;
    const aimP = inp.mouse.inside ? VD.render.screenToGround(inp.mouse.x, inp.mouse.y, 0.5) : null;
    const ui = u.input;
    ui.move.x = mvx; ui.move.z = mvz;
    if (aimP) {
      ui.aimPoint = aimP;
      const dx = aimP.x - u.pos.x, dz = aimP.z - u.pos.z, l = Math.hypot(dx, dz);
      ui.aim = l > 0.05 ? { x: dx / l, z: dz / l } : ui.aim;
    } else if (Math.hypot(mvx, mvz) > 0.01) ui.aim = { x: mvx, z: mvz };
    // Sảnh: chỉ đi lại (không đánh, không skill).
    const h = enabled && S.mode !== 'lounge' ? inp.held : (enabled ? { Run: inp.held.Run } : {});
    const b = ui.buttons;
    b.attack = !!h.SkillBasicAttack; b.dash = !!h.SkillDash;
    for (let i = 0; i < 5; i++) b['skill' + i] = false;
    const lo = S.loadout || {};
    for (const key of ['SkillOne', 'SkillTwo', 'SkillThree', 'SkillFour']) if (lo[key] >= 0 && h[key]) b['skill' + lo[key]] = true;
    // Đi bộ/chạy khi không thi triển skill (skill.js tắt locomotion riêng: world.skillLocomotion = false).
    u.running = false;
    if (u.run || u.dead || u.buffs.stunned()) { u.moving = false; return; }
    if (ui.aim) u.aim = ui.aim;   // ngắm bằng chuột (AimMouse): đứng yên cũng quay theo con trỏ
    const l = Math.hypot(mvx, mvz);
    if (l < 0.01 || u.buffs.has('Root')) { u.moving = false; VD.Skill.setState(S.A, u, 'Idle'); return; }
    let speed = VD.Stats.get(u, 'MoveSpeed');
    const wantRun = !!h.Run && u.stamina > 0;
    if (wantRun) {
      speed *= u.row.RunIncreaseSpeed || 1;
      u.stamina = Math.max(0, u.stamina - (u.row.RunStaminaCost || 0) * dt);
      u.staminaIdle = 0; u.running = true;
    }
    const face = ui.aim || { x: mvx / l, z: mvz / l };
    if ((mvx * face.x + mvz * face.z) / l < -0.35) speed *= BACKWARD();
    S.A.moveUnit(u, mvx / l * speed * dt, mvz / l * speed * dt);
    u.aim = face;
    u.moving = true; u.moveSpeedNow = speed;
    VD.Skill.setState(S.A, u, 'Move');
  }

  // ---------------------------------------------------------------- sự kiện trình bày
  function visOf(u) { return u && S.vis.get(u.uid); }
  function isPlayer(u) { return u && u === S.player; }
  function unitPos3(u, off) {
    return { x: u.pos.x + ((off && off.x) || 0), y: (off && off.y) || 0, z: u.pos.z + ((off && off.z) || 0) };
  }
  function onEvent(e) {
    const u = e.unit;
    switch (e.type) {
      case 'anim': {
        if (!u) break;
        u.drive = { name: e.name, moveName: e.moveName, loop: !!e.loop, t0: S.A.time, offset: e.offset || 0, speeds: e.speeds, ts: e.timeScale || e.speed || 1 };
        break;
      }
      case 'animMove': if (u && u.drive) u.drive.moving = !!e.moving; break;
      case 'skillEnd': if (u) u.drive = null; break;
      case 'vfx': {
        if (!VD.vfx) break;
        const src = e.unit;
        const pos = e.pos ? { x: e.pos.x, y: e.pos.y || 0, z: e.pos.z } : src ? unitPos3(src, e.offset) : null;
        if (!pos) break;
        const v = visOf(src);
        const h = VD.vfx.play(e.name, { pos, aim: e.dir || (src && src.aim), follow: e.follow && v ? v.root : null, followRot: false });
        if (e.key) S.fx.set(e.key, h);
        break;
      }
      case 'vfxEnd': { const h = S.fx.get(e.key); if (h && VD.vfx) VD.vfx.stop(h); S.fx.delete(e.key); break; }
      case 'sfx': if (VD.audio) VD.audio.sfx(e.name, { pos: e.pos || (u && u.pos) }); break;
      case 'hitstop':
        if (isPlayer(e.src) || isPlayer(e.tgt)) VD.loop.hitstop = Math.max(VD.loop.hitstop, Math.min(0.2, e.dur || 0));
        break;
      case 'shake':
        if (!e.localOnly || isPlayer(u)) VD.render.shake((e.amp || 0.5) * 0.08, e.dur || 0.2);
        break;
      case 'flash': { const v = visOf(u); if (v) v.flash = 0.09; break; }
      case 'damage': {
        const v = visOf(e.tgt); if (v) v.flash = 0.09;
        if (VD.hud && VD.hud.damage) VD.hud.damage(e);
        if (e.tgt && e.tgt.kind === 'mon' && e.tgt.row.HitSfx && Math.random() * 100 < (e.tgt.row.HitSfxPercent || 100)) VD.audio.sfx(e.tgt.row.HitSfx, { pos: e.tgt.pos });
        if (isPlayer(e.tgt)) { VD.render.shake(0.05, 0.15); if (VD.postfx) VD.postfx.hit(); }
        break;
      }
      case 'death': {
        if (!u) break;
        u.deadAt = S.A.time;
        if (u.kind === 'mon' && u.row.DyingSfx) VD.audio.sfx(u.row.DyingSfx, { pos: u.pos });
        if (u !== S.player) S.deadQueue.push(u);
        break;
      }
      case 'monologue': if (VD.hud && VD.hud.bubble) VD.hud.bubbleAt(u, VD.lua ? VD.lua.text(e.text) : e.text); break;
    }
    if (S.onUnitEvent) S.onUnitEvent(e);
  }

  // ---------------------------------------------------------------- khung
  S.update = function (dt) {
    if (!S.A) return;
    if (S.player && !S.player.dead) playerInput(S.player, dt);
    VD.Skill.step(S.A, dt);
    if (VD.AI && VD.AI.step) VD.AI.step(S.A, dt);
    if (VD.AI && VD.AI.applyLight && S.mode === 'dive') VD.AI.applyLight(S.A, dt);
    // Đẩy nhẹ các unit chồng lên nhau (quái và người chơi không đi xuyên nhau).
    const us = S.units;
    for (let i = 0; i < us.length; i++) for (let j = i + 1; j < us.length; j++) {
      const a = us[i], b = us[j];
      if (a.dead || b.dead || a.kind === 'extra' || b.kind === 'extra') continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, r = (a.radius || 0.25) + (b.radius || 0.25), d2 = dx * dx + dz * dz;
      if (d2 >= r * r || d2 < 1e-8) continue;
      const d = Math.sqrt(d2), push = (r - d) * 0.5, nx = dx / d, nz = dz / d;
      const wa = a === S.player ? 0.25 : 0.5, wb = b === S.player ? 0.25 : 0.5;
      S.A.moveUnit(a, -nx * push * wa * 2, -nz * push * wa * 2);
      S.A.moveUnit(b, nx * push * wb * 2, nz * push * wb * 2);
    }
    for (let i = S.deadQueue.length - 1; i >= 0; i--) {
      const d = S.deadQueue[i];
      if (S.A.time - d.deadAt > 3) { S.deadQueue.splice(i, 1); S.remove(d); }
    }
  };

  const CHAR_LOCO = { idle: 'battle/idle', walk: 'battle/walk', run: 'battle/run', death: 'battle/death' };
  const LOUNGE_LOCO = { idle: 'default/idle', walk: 'default/walk', run: 'default/run', death: 'death' };
  S.render = function (dt) {
    if (!S.A) return;
    const cam = VD.render.camera, now = S.A.time;
    for (const u of S.units) {
      const v = S.vis.get(u.uid);
      if (!v) continue;
      v.root.position.set(u.pos.x, 0, u.pos.z);
      if (u.aim) v.setFacing(Math.atan2(u.aim.z, u.aim.x), cam);
      const phase = u.row.Phase > 0 ? u.row.Phase : 0;
      if (u.dead) {
        const n = v.resolve(u.kind === 'char' ? CHAR_LOCO.death : 'death', phase);
        if (n) v.pose(n, now - (u.deadAt || now), false, dt);
      } else if (u.drive) {
        const d = u.drive, t = now - d.t0;
        const clipT = d.speeds && d.speeds.length ? VD.Skill.animTimeAt(d.speeds, d.offset, t) : d.offset + t * d.ts;
        const want = d.moving && d.moveName ? d.moveName : d.name;
        const n = v.resolve(want, phase) || v.resolve(d.name, phase);
        if (n) v.pose(n, clipT, d.loop, dt);
      } else {
        const L = S.mode === 'lounge' || u.kind !== 'char' ? LOUNGE_LOCO : CHAR_LOCO;
        const moving = u.kind === 'char' ? u.moving : u.state === 'Move' || u.moving;
        if (moving) {
          const sp = u.moveSpeedNow || VD.Stats.get(u, 'MoveSpeed');
          const runAt = VD.combatDB().c('MoveSpeedThresholdForRun', 2.4);
          const runN = sp >= runAt ? v.resolve(L.run, phase) : null;
          if (runN) v.play(runN, true, 1);
          else { const wn = v.resolve(L.walk, phase); if (wn) v.play(wn, true, Math.max(0.3, sp / (u.row.WalkAnimation1xSpeed || 1))); }
        } else { const n = v.resolve(L.idle, phase); if (n) v.play(n, true, 1); }
      }
      v.update(dt, cam);
    }
    if (VD.vfx) VD.vfx.update(dt, cam);
  };

  VD.stage = S;
})(window.VD = window.VD || {});
