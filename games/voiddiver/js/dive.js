// Lượt lặn: ghép map theo Campaign.csv, sinh mọi thứ Sector.csv mô tả, luật lặn (đèn, căng thẳng, quái bóng tối,
// ô nhiễm, dị thường, EXP, lối thoát, chết), tương tác F, LuaApi cho script Campaign/LoungeQuest gốc, BGM.
// Máy trạng thái: loading → intro → play → (escaping | dead) → result. Tài liệu luật: docs/DIVE.md.
(function (VD) {
  'use strict';
  const THREE = window.THREE;
  const CELL = 30;

  const D = {
    state: 'idle', camp: null, char: 0, diffName: 'Normal', rng: null, t: 0, finishers: [],
    ents: [], mons: [], zonePoints: [], zoneSpawns: {}, sectorRows: new Map(), cells: [], play: null,
    lua: null, luaQueue: [], stats: null, result: null, hudOn: true, cutscene: null, camTarget: null,
  };
  let resolveStart = null;

  // ================================================================ tra bảng
  const T = () => VD.T || {};
  const db = () => VD.combatDB();
  const C = (n, d) => db().c(n, d);
  const TX = k => (VD.TEXT && VD.TEXT[k]) || '';
  const byId = new Map();
  function rowOf(table, id, key) {
    const k = table + ':' + (key || 'Id');
    let m = byId.get(k);
    if (!m) { m = new Map(); for (const r of T()[table] || []) m.set(r[key || 'Id'], r); byId.set(k, m); }
    return m.get(id) || null;
  }
  const rowsOf = (table, key, val) => (T()[table] || []).filter(r => r[key] === val);
  const v3 = s => { const p = String(s || '0:0:0').split(':').map(Number); return { x: p[0] || 0, y: p[1] || 0, z: p[2] || 0 }; };
  const num = x => { const n = parseFloat(x); return isFinite(n) ? n : 0; };

  // Toạ độ: Lua/Unity (x, y, z) ↔ three (x, y, −z).
  const toLua = p => ({ x: p.x, y: 0, z: -p.z });
  const fromLua = t => { const f = k => num(VD.lua.field(t, k)); return { x: f('x'), z: -f('z') }; };

  // ================================================================ ghép map
  // Campaign.FixedSectors = [x, y, SectorId, rot]; SectorId 0 = ô trống. RandomPlacedSectorIds đặt ngẫu nhiên vào ô trống,
  // ô còn lại lấy Sector Playable cùng Campaign.ThemeType. Map có ô sinh ngẫu nhiên thì thêm một hàng TopBoundary phía y lớn
  // và một hàng BottomBoundary phía y âm (cùng ThemeType). [SUY LUẬN, docs/DIVE.md §1]
  function haveArt(id) { return !!(VD.ASSETS && VD.ASSETS.sector && VD.ASSETS.sector[id]); }
  function assemble(camp, rng) {
    const [cols, rows] = camp.MapSize;
    const grid = [];
    for (let y = 0; y < rows; y++) { grid.push(new Array(cols).fill(null)); }
    let hasEmpty = false;
    for (const [x, y, id, rot] of camp.FixedSectors || []) {
      if (y >= rows || x >= cols) continue;
      grid[y][x] = id > 0 ? { id, rot: rot || 0 } : null;
    }
    const empty = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (!grid[y][x]) { empty.push([x, y]); hasEmpty = true; }
    shuffle(empty, rng);
    for (const id of camp.RandomPlacedSectorIds || []) {
      if (!empty.length) break;
      if (!haveArt(id)) { console.warn('[dive] thiếu art sector ' + id); continue; }
      const [x, y] = empty.pop();
      grid[y][x] = { id, rot: 0 };
    }
    const pool = (T().Sector || []).filter(s => s.AreaType === 'Playable' && s.ThemeType === camp.ThemeType && haveArt(s.Id)).map(s => s.Id);
    for (const [x, y] of empty) {
      const left = x > 0 && grid[y][x - 1] ? grid[y][x - 1].id : 0, down = y > 0 && grid[y - 1][x] ? grid[y - 1][x].id : 0;
      const cand = pool.filter(id => id !== left && id !== down);
      grid[y][x] = { id: (cand.length ? rng.pick(cand) : rng.pick(pool)), rot: 0 };
    }
    const cells = [];
    const bound = hasEmpty;
    const off = bound ? 1 : 0;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (grid[y][x]) cells.push({ cx: x, cy: y + off, id: grid[y][x].id, rot: grid[y][x].rot, gx: x, gy: y });
    if (bound) {
      const top = (T().Sector || []).filter(s => s.AreaType === 'TopBoundary' && s.ThemeType === camp.ThemeType && haveArt(s.Id)).map(s => s.Id);
      const bot = (T().Sector || []).filter(s => s.AreaType === 'BottomBoundary' && s.ThemeType === camp.ThemeType && haveArt(s.Id)).map(s => s.Id);
      for (let x = 0; x < cols; x++) {
        if (bot.length) cells.push({ cx: x, cy: 0, id: rng.pick(bot), rot: 0, boundary: 'Bottom' });
        if (top.length) cells.push({ cx: x, cy: rows + 1, id: rng.pick(top), rot: 0, boundary: 'Top' });
      }
    }
    const size = [cols, rows + 2 * off];
    // Vùng chơi (ngoài vùng này là BoxFogField của Campaign.BoundarySpecialFieldId).
    const play = { minX: 0, maxX: CELL * cols, minZ: -CELL * (rows + off), maxZ: -CELL * off };
    return { cells, size, play };
  }
  function shuffle(a, rng) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  // Điểm trong sector (Sector.csv, toạ độ Unity trong ô) → thế giới three.
  function secPt(sec, s) { const p = v3(s); const [x, z] = VD.world.sectorPoint(sec, p.x, p.z); return { x, z }; }
  function secDir(sec, s) {
    const f = v3(s), l = Math.hypot(f.x, f.z) || 1;
    const [ax, az] = VD.world.sectorPoint(sec, 0, 0), [bx, bz] = VD.world.sectorPoint(sec, f.x / l, f.z / l);
    return { x: bx - ax, z: bz - az };
  }
  function sectorAt(x, z) {
    const cx = Math.floor(x / CELL), cy = Math.floor(-z / CELL);
    return VD.world.sectors.find(s => s.cell.cx === cx && s.cell.cy === cy) || null;
  }
  function unityYaw(f) { return Math.atan2(f.x, -f.z) * 180 / Math.PI; }   // Unity yaw (độ) của hướng three f

  // ================================================================ tìm chỗ đứng
  function freeNear(x, z, r) {
    for (let rad = 0; rad < 8; rad += 0.35)
      for (let a = 0; a < 12; a++) {
        const px = x + Math.cos(a / 12 * 6.283) * rad, pz = z + Math.sin(a / 12 * 6.283) * rad;
        if (!VD.world.overlapsMove(px, pz, r || 0.3)) return { x: px, z: pz };
      }
    return { x, z };
  }
  function ring(center, rMin, rMax) {
    for (let i = 0; i < 24; i++) {
      const a = D.rng() * 6.283, r = rMin + D.rng() * (rMax - rMin);
      const p = { x: center.x + Math.cos(a) * r, z: center.z + Math.sin(a) * r };
      if (!VD.world.overlapsMove(p.x, p.z, 0.35) && VD.world.raycastShot(center.x, center.z, p.x, p.z) >= 1) return p;
    }
    return freeNear(center.x, center.z, 0.35);
  }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  // Chỉ phát clip có trong manifest (VD.ASSETS.sfx); tên thiếu ghi vào D.missing thay vì gây 404.
  function sfx(name, opts) {
    if (!name) return null;
    if (VD.ASSETS && VD.ASSETS.sfx && !VD.ASSETS.sfx[name]) { if (D.missing) D.missing.add('sfx ' + name); return null; }
    return VD.audio.sfx(name, opts);
  }
  function bgm(name, fade) {
    if (VD.ASSETS && VD.ASSETS.bgm && !VD.ASSETS.bgm[name]) { if (D.missing) D.missing.add('bgm ' + name); return; }
    VD.audio.playBgm(name, fade);
  }

  // ================================================================ loot (DropReward → DropRewardProbability / DropRewardArtifactProbability)
  const GRADES = ['None', 'Normal', 'Rare', 'Elite', 'Epic', 'Legend', 'Unique'];
  function questNeeds(itemId) {
    for (const t of D.tasks || []) if (t.cond === 'TeamItemCountInInventory' && t.arg === itemId) return true;
    return false;
  }
  function goodsGrade(g) { const r = VD.goods.row(g); const gr = r && r.Grade; return !gr || gr === 'None' ? 'Normal' : gr; }
  function rollGroup(groupId) {
    const out = [];
    const diff = rowOf('Difficulty', D.diffName, 'Difficulty') || {};
    const player = VD.stage.player;
    for (const dr of rowsOf('DropReward', 'GroupId', groupId)) {
      const probs = rowsOf('DropRewardProbability', 'DropRewardId', dr.Id);
      const arts = rowsOf('DropRewardArtifactProbability', 'DropRewardId', dr.Id);
      for (let k = 0; k < (dr.PickCount || 1); k++) {
        const r = D.rng() * 10000;
        if (r < dr.NormalBp) {
          let cand = probs.filter(p => p.PickOrder === k);
          if (!cand.length) cand = probs.filter(p => !p.PickOrder);
          cand = cand.map(p => ({ p, g: VD.goods.parse(p.GoodsData) })).filter(c => {
            const row = VD.goods.row(c.g);
            // Đồ nhiệm vụ (Item.Category Quest) chỉ rơi khi CampaignTask hiện tại cần nó. [SUY LUẬN]
            if (c.g.type === 'Item' && row && row.Category === 'Quest' && !questNeeds(c.g.id)) return false;
            return !!row;
          });
          if (dr.PickGradeBeforeProbability) {
            const w = GRADES.map(gname => {
              let x = dr[gname + 'Weight'] || 0;
              // Difficulty.<Grade>ItemPickPercent nhân trọng số bậc (trừ IgnoreDifficulty).
              if (!dr.IgnoreDifficulty && gname !== 'None' && diff[gname + 'ItemPickPercent'] != null) x *= diff[gname + 'ItemPickPercent'] / 100;
              return x;
            });
            const tot = w.reduce((a, b) => a + b, 0);
            if (!(tot > 0)) continue;
            let q = D.rng() * tot, gi = 0;
            for (; gi < w.length; gi++) { q -= w[gi]; if (q <= 0) break; }
            const gname = GRADES[Math.min(gi, GRADES.length - 1)];
            if (gname === 'None') continue;
            cand = cand.filter(c => goodsGrade(c.g) === gname);
          }
          if (!cand.length) continue;
          // Const.CharacterWeaponTypeDropWeightBonusPercent: vũ khí đúng loại của nhân vật +300% trọng số.
          const bonus = C('CharacterWeaponTypeDropWeightBonusPercent', 300) / 100;
          const wOf = c => { const row = VD.goods.row(c.g); let w = c.p.Weight || 0; if (c.g.type === 'Equipment' && row && player && row.WeaponType === player.row.WeaponType && row.GoodsType === 'Weapon') w *= 1 + bonus; return w; };
          const pick = D.rng.weighted(cand, wOf);
          out.push(finishGoods(Object.assign({}, pick.g)));
        } else if (r < dr.NormalBp + dr.ArtifactBp && arts.length) {
          const a = D.rng.weighted(arts, x => x.Weight || 0);
          const pool = (T().Equipment || []).filter(e => e.GoodsType === 'Artifact' && e.Grade === a.Grade);
          if (pool.length) out.push(finishGoods({ type: 'Equipment', id: D.rng.pick(pool).Id, count: a.Count || 1 }));
        }
      }
    }
    return out;
  }
  // Đồ bền: rơi ra với độ bền ngẫu nhiên từ Const.RandomDurabilityMinimumRate × MaxDurability.
  function finishGoods(g) {
    if (g.type === 'Equipment') {
      const r = VD.goods.row(g);
      if (r && r.MaxDurability > 0) g.dur = Math.round(r.MaxDurability * (C('RandomDurabilityMinimumRate', 0.55) + D.rng() * (1 - C('RandomDurabilityMinimumRate', 0.55))));
    }
    return g;
  }

  // ================================================================ thực thể
  function addEnt(e) { e.id = e.id || ('e' + (++D._eid)); D.ents.push(e); return e; }
  function removeEnt(e) {
    e.removed = true;
    const i = D.ents.indexOf(e); if (i >= 0) D.ents.splice(i, 1);
    if (e.h) (e.h.isDrop ? dropVisRemove(e.h) : VD.objects.remove(e.h));
    if (e.blocker) VD.world.removeBlocker(e.blocker);
    if (e.ringMesh) VD.render.scene.remove(e.ringMesh);
    if (VD.minimap) VD.minimap.unmark(e.id);
  }
  function dropVisRemove(h) { if (h.root.parent) h.root.parent.remove(h.root); VD.objects.live.delete(h); }
  const VIS_R = 42;   // tạo hình khi người chơi cách ≤ 42 m — không có trong bảng: tải dần cho map 6×6

  // Bán kính tương tác từ collider trigger của prefab (vd rương 2×2 → 1 m, cửa 2,4×2,2, trigger Elara 1,5×1,5).
  function interactRadius(prefab, dflt) {
    return (D.prefabR && D.prefabR[prefab]) || dflt;
  }
  async function preloadPrefabs(names) {
    D.prefabR = D.prefabR || {};
    await Promise.all([...new Set(names)].filter(n => VD.objects.has(n)).map(n => VD.objects.load(n).then(({ json }) => {
      const trig = (json.colliders || []).find(c => c.path === '' && c.trigger);
      if (trig) D.prefabR[n] = trig.shape === 'box' ? Math.max(trig.size[0], trig.size[2]) / 2 : (trig.radius || 1);
      const it = (json.behaviours || []).find(b => b.class === 'InteractiveTrigger' && b.fields);
      if (it) { D.prefabFields = D.prefabFields || {}; D.prefabFields[n] = it.fields; }
      // RewardBox của prefab: _holdingSfx / _lockedHoldingSfx (tiếng giữ F riêng từng loại rương), _interactionSfx.
      const rb = (json.behaviours || []).find(b => b.class === 'RewardBox' && b.fields);
      if (rb) { D.boxFields = D.boxFields || {}; D.boxFields[n] = rb.fields; }
    }).catch(() => {})));
  }

  // ---------------------------------------------------------------- rương
  function spawnBox(boxRow, pos, fwd, src) {
    return addEnt({
      kind: 'box', row: boxRow, pos, fwd, prefab: boxRow.PrefabName, opened: false, loot: null, src,
      verb: () => TX('Open') || 'Mở',
      mark: 'box',
    });
  }
  function boxInteract(e) {
    const r = e.row;
    // RewardBox.InteractStressConditions: trạng thái căng thẳng phải nằm trong danh sách (HiddenStash chỉ Fear/Despair).
    const st = stressState();
    if (r.InteractStressConditions && r.InteractStressConditions.length && r.InteractStressConditions.indexOf(st) < 0) return null;
    const left = e.lootInv ? e.lootInv.slots.some(s => s.g) : e.loot && e.loot.length;
    if (e.opened) return left ? { verb: TX('LootingInventory') || 'Kết quả Tìm kiếm', time: r.HoldingTime || C('LootingInteractionTime', 0.1), sfx: boxSfx(e, false) } : null;
    let locked = false;
    if (r.HasKeyInteraction) locked = !VD.inventory.findKey(r.KeyItemTypes || [], r.KeyItemIds || []);
    return { verb: TX('Open') || 'Mở', time: r.HoldingTime || C('LootingInteractionTime', 0.1), locked, sfx: boxSfx(e, locked) };
  }
  // Tiếng giữ F: RewardBox._holdingSfx / _lockedHoldingSfx của prefab (vd BrownBox → InteractionLooting_PaperBox2).
  // MedicalBox/Briefcase/HiddenStash trong art/object là bản MimicObject (không có _holdingSfx): lấy clip trùng tên prefab
  // nếu có (InteractionLooting_MedicalBox…). [SUY LUẬN]
  function boxSfx(e, locked) {
    const f = D.boxFields && D.boxFields[e.prefab];
    if (f && (locked ? f._lockedHoldingSfx : f._holdingSfx)) return locked ? f._lockedHoldingSfx : f._holdingSfx;
    if (locked) return 'InteractionLooting_Locked';
    const same = 'InteractionLooting_' + e.prefab;
    return VD.ASSETS && VD.ASSETS.sfx && VD.ASSETS.sfx[same] ? same : 'InteractionLooting_Default';
  }
  function boxOpen(e) {
    const r = e.row;
    if (!e.opened) {
      if (r.HasKeyInteraction) {
        const k = VD.inventory.findKey(r.KeyItemTypes || [], r.KeyItemIds || []);
        if (!k) { VD.dialog.toast(TX('KeyInteractionOnEmptySlotClick') || 'Cần chìa khoá'); return; }
        VD.inventory.remove('Item', k, 1);
      }
      e.opened = true;
      e.loot = rollGroup(r.DropRewardGroupId);
      D.stats.boxes++;
      emitTask('OpenRewardBox');
    }
    // Giữ F xong: _interactionSfx của prefab, rỗng thì nhóm tiếng MasterAudio "LootingCompleted" (hằng LOOTING_COMPLETED). [SUY LUẬN]
    const f = D.boxFields && D.boxFields[e.prefab];
    // Gọi thẳng VD.audio: clip bóc bằng tools/ui_inventory_rip.py chưa có trong VD.ASSETS.sfx tới khi chạy lại build_assets.py.
    VD.audio.sfx((f && f._interactionSfx) || 'LootingCompleted', { pos: e.pos });
    // Mở bảng Tab kèm LootingInventory; từng ô hé lộ dần theo bậc (inventory.js revealTick).
    VD.inventory.openLoot({ title: TX('LootingInventory'), items: e.loot, source: e });
  }

  // ---------------------------------------------------------------- cửa
  function spawnEntrance(row, pos, fwd) {
    const e = addEnt({ kind: 'door', row, pos, fwd, prefab: row.PrefabName, open: !!row.IsOpened, mark: null });
    // HitableCollider gốc 2,27 × 0,1 m chắn ngang, vuông góc với Forward.
    e.blocker = VD.world.addBlocker(pos.x, pos.z, 2.27, 0.25, unityYaw(fwd), true);
    if (e.open) VD.world.removeBlocker(e.blocker);
    return e;
  }
  function doorInteract(e) {
    const r = e.row;
    if (e.open) return { verb: TX('Interact') || 'Tương tác', time: C('EntranceCloseInteractionTime', 0.2), sfx: 'InteractionDoor' };
    const locked = r.HasKeyInteraction && !VD.inventory.findKey(r.KeyItemTypes || [], r.KeyItemIds || []);
    return { verb: locked ? (TX('UFTutorialGuide_TextDoor') || 'Mở') : (TX('Open') || 'Mở'), time: C('EntranceOpenInteractionTime', 0.4), locked, sfx: locked ? 'InteractionDoor_Locked' : 'InteractionDoor' };
  }
  function doorUse(e) {
    const r = e.row;
    if (e.open) { e.open = false; VD.world.restoreBlocker(e.blocker); if (e.h) VD.objects.setState(e.h, 'closed'); sfx('DoorClose', { pos: e.pos }); return; }
    if (r.HasKeyInteraction) {
      const k = VD.inventory.findKey(r.KeyItemTypes || [], r.KeyItemIds || []);
      if (!k) { VD.dialog.toast(TX('KeyInteractionOnEmptySlotClick') || 'Cửa khoá'); return; }
      VD.inventory.remove('Item', k, 1);           // chìa bị dùng mất khi mở [SUY LUẬN]
      r._keyUsed = true;
    }
    e.open = true; VD.world.removeBlocker(e.blocker);
    if (e.h) VD.objects.setState(e.h, 'open');
    sfx('DoorOpen', { pos: e.pos });
    e.row = Object.assign({}, r, { HasKeyInteraction: false });  // đã mở khoá thì đóng/mở lại không cần chìa
  }

  // ---------------------------------------------------------------- bẫy
  function trapOwner(tr, pos, fwd) {
    const diff = rowOf('Difficulty', D.diffName, 'Difficulty') || {};
    const vd = rowOf('VariantDifficulty', D.camp.VariantDifficulty) || {};
    const atk = tr.HitBoxAtk * (diff.TrapAtkPercent || 100) / 100 * (vd.TrapAtkPercent || 100) / 100;
    const u = { uid: 'trap' + tr.Id + ':' + D._eid, kind: 'trap', id: tr.Id, row: { BackAttackAngle: 0 }, pos: { x: pos.x, z: pos.z }, aim: fwd,
      team: tr.TeamSide === 'Monster' ? 'mon' : 'trap', faction: -1, categories: [], monsterType: 'Trap', radius: 0.3,
      stats: { Atk: atk, HpMax: 1 }, hp: 1, stress: 0, cd: {}, stacks: {}, stackT: {}, run: null, bgRuns: [], trigQ: [], state: 'Idle', dead: false, input: null };
    u.buffs = new VD.BuffSet(u);
    return u;
  }
  function spawnTrap(tr, pos, fwd) {
    if (!(tr.HitBoxIds && tr.HitBoxIds.length)) return null;   // 80002/80004/80006/90002: không hitbox, bỏ
    const e = addEnt({ kind: 'trap', row: tr, pos, fwd, t: D.rng() * (tr.CoolTime > 0 ? tr.CoolTime : 3), armed: true });
    e.owner = trapOwner(tr, pos, fwd);
    e.trigger = !!tr.DestroyAfterAction;
    return e;
  }
  function fireTrap(e) {
    e.owner.trigQ.length = 0;
    for (const id of e.row.HitBoxIds) VD.HitBox.spawn(VD.stage.A, e.owner, id, { at: e.pos, dir: e.fwd, skillId: 'trap' });
  }

  // ---------------------------------------------------------------- lối thoát
  function spawnExit(exitId, pos) {
    const row = rowOf('Exit', exitId);
    if (!row) { console.warn('[dive] không có Exit ' + exitId); return null; }
    const e = addEnt({ kind: 'exit', row, pos, fwd: { x: Math.SQRT1_2, z: Math.SQRT1_2 }, prefab: row.Type === 'SafeExit' ? 'SafeExit' : 'WaveExit',
      state: row.Type === 'SafeExit' ? 'activated' : 'idle', t: 0, mark: 'exit', markAlways: !!row.DisplayOnMinimapAtStart });
    return e;
  }
  function exitCost(e) {
    if (!e.row.UseExitCostTable) return e.row.CustomUnlockGoodsData ? VD.goods.parse(e.row.CustomUnlockGoodsData) : null;
    // ExitCost.Level ↔ Campaign.RecommendedLevel [SUY LUẬN]; phí là Item 10001 "Đồng xu cõi khác (vật lý)" trong túi.
    const lv = D.camp.RecommendedLevel || 1;
    const c = (T().ExitCost || []).find(r => r.Level === lv) || (T().ExitCost || [])[0];
    const g = c && c.UnlockGoodsData;
    return g ? VD.goods.parse(Array.isArray(g) && Array.isArray(g[0]) ? g[0] : g) : null;
  }
  function exitInteract(e) {
    const r = e.row;
    if (e.state === 'idle') return { verb: TX('Interact') || 'Tương tác', time: C('ExitActivateInteractionTime', 2), sfx: r.ActivatingStateHoldingSfx };
    if (e.state === 'activated') {
      const safe = r.Type === 'SafeExit';
      return { verb: TX('Escape') || 'Thoát Hiểm', time: safe ? C('SafeExitInteractionTime', 3) : C('ExitInteractionTime', 7), cost: exitCost(e), sfx: r.HoldingSfx };
    }
    return null;
  }
  function exitUse(e) {
    const r = e.row;
    if (e.state === 'idle') {
      // WaveExit: gọi buồng → đợt quái (Wave.csv) + SpecialField 4001 bán kính Const.ExitSpecialFieldRange trong ExitActivatingTime.
      e.state = 'activating'; e.t = C('ExitActivatingTime', 15);
      if (e.h) VD.objects.setState(e.h, 'activating');
      if (r.WaveId > 0) e.wave = startWave(r.WaveId, e.pos, e);
      if (r.SpecialFieldId > 0) e.field = addField(r.SpecialFieldId, e.pos, C('ExitSpecialFieldRange', 5), -1);
      sfx('BoothEscape_Start', { pos: e.pos });
      return;
    }
    if (e.state === 'activated') {
      const cost = exitCost(e);
      if (cost && cost.count > 0) {
        if (VD.inventory.count(cost.type, cost.id) < cost.count) { VD.dialog.toast(TX('NotEnoughGoodsToUnlockExit') || 'Không đủ tiền!'); return; }
        VD.inventory.remove(cost.type, cost.id, cost.count);
      }
      if (r.EscapeSfx) sfx(r.EscapeSfx, { pos: e.pos });
      if (e.h) VD.objects.setState(e.h, 'finished');
      finish('escape', { exit: r.Id });
    }
  }
  function exitTick(e, dt) {
    if (e.state === 'activating') {
      e.t -= dt;
      if (e.t <= 0) {
        e.state = 'activated'; e.t = r0(e.row.Type === 'SafeExit' ? C('SafeExitActivatedTime', 20) : C('ExitActivatedTime', 30));
        if (e.h) VD.objects.setState(e.h, 'activated');
        if (e.wave) endWave(e.wave, true);
        if (e.field) removeField(e.field);
      }
    } else if (e.state === 'activated' && e.row.Type !== 'SafeExit') {
      e.t -= dt;
      if (e.t <= 0) { e.state = 'idle'; if (e.h) VD.objects.setState(e.h, 'idle'); }   // hết giờ: buồng rời đi
    }
  }
  const r0 = x => x;

  // ---------------------------------------------------------------- trigger tương tác (ZoneSpawn InteractiveTrigger_*)
  // Mặc định _canTriggered/_coolTime/_holdingTime lấy từ component InteractiveTrigger của prefab (rip_objects.py → fields).
  const TRIGGER_DEFAULT = { InteractiveTrigger_inv: { can: false, cool: 0, hold: 0.5 } };
  function triggerDefaults(prefab) {
    const d = TRIGGER_DEFAULT[prefab] || { can: true, cool: -1, hold: 0.5 };
    const info = D.prefabFields && D.prefabFields[prefab];
    if (info) return { can: !!info._canTriggered, cool: num(info._coolTime), hold: num(info._holdingTime) || 0.5, sfx: info._holdingSfx };
    return d;
  }
  function spawnTrigger(prefab, triggerId, pos) {
    const d = triggerDefaults(prefab);
    return addEnt({ kind: 'trigger', prefab, triggerId, pos, fwd: { x: Math.SQRT1_2, z: Math.SQRT1_2 }, can: d.can, cool: d.cool, hold: d.hold, sfx: d.sfx, lastT: -1e9, used: false });
  }

  // ---------------------------------------------------------------- NPC
  function spawnNpc(npcId, pos) {
    const e = addEnt({ kind: 'npc', npcId, pos, fwd: { x: Math.SQRT1_2, z: Math.SQRT1_2 }, mark: 'npc', npcState: 0, nav: false });
    const a = VD.ASSETS && VD.ASSETS.units && VD.ASSETS.units[npcId];
    if (a && a.spine) VD.loadSpine(a.spine).then(b => {
      if (e.removed) return;
      const vis = new VD.UnitVisual(b, { skins: a.skins, scale: a.scale || 1, shadow: a.shadow || 0.4 });
      vis.root.position.set(pos.x, 0, pos.z);
      VD.render.scene.add(vis.root);
      const idle = vis.resolve('idle') || vis.resolve('default/idle'); if (idle) vis.play(idle, true, 1);
      e.vis = vis;
    }).catch(() => {});
    return e;
  }

  // ---------------------------------------------------------------- đồ rơi (DropGoods)
  function spawnDrop(g, pos) {
    g = VD.goods.parse(g);
    if (!g || !(g.count > 0)) return null;
    return addEnt({ kind: 'drop', goods: g, pos: freeNear(pos.x + (D.rng() - 0.5) * 0.8, pos.z + (D.rng() - 0.5) * 0.8, 0.2), mark: null });
  }

  // ---------------------------------------------------------------- vật phá được / trường đặc biệt
  function spawnBreakable(row, pos, fwd) {
    const e = addEnt({ kind: 'breakable', row, pos, fwd, prefab: row.PrefabName, hits: 0, seen: new Set() });
    e.blocker = VD.world.addBlocker(pos.x, pos.z, 0.5, 0.5, 0, false);   // BoxCollider gốc 0,5 × 0,5
    return e;
  }
  function addField(id, pos, radius, duration) {
    const row = rowOf('SpecialField', id);
    if (!row) return null;
    const f = { row, pos, radius, until: duration > 0 ? D.t + duration : (row.Duration > 0 ? D.t + row.Duration : Infinity), stackT: new Map(), delay: D.t + (row.EffectDelay || 0) };
    if (row.PrefabName === 'SphereFieldExit' || row.PrefabName === 'SphereOilField') f.mesh = VD.objects.ring(pos, radius, row.PrefabName === 'SphereOilField' ? 0x886633 : 0x7fe3ff);
    D.fields.push(f);
    return f;
  }
  function removeField(f) { const i = D.fields.indexOf(f); if (i >= 0) D.fields.splice(i, 1); if (f.mesh) VD.render.scene.remove(f.mesh); }
  function fieldTick(dt) {
    const A = VD.stage.A;
    for (let i = D.fields.length - 1; i >= 0; i--) {
      const f = D.fields[i];
      if (D.t > f.until) { removeField(f); continue; }
      if (D.t < f.delay) continue;
      for (const u of VD.stage.units) {
        if (u.dead || (u.kind !== 'char' && u.kind !== 'mon')) continue;
        const inside = f.box ? f.box(u.pos) : dist(u.pos, f.pos) <= f.radius;
        if (!inside) continue;
        const r = f.row, isChar = u.kind === 'char';
        const bid = isChar ? r.CharacterBuffId : r.MonsterBuffId;
        if (bid > 1 && db().buff(bid)) { const b = u.buffs.get(bid); if (b) b.t = 0; else u.buffs.add(A, bid, 1, u); }
        const sid = isChar ? r.CharacterStackBuffId : r.MonsterStackBuffId, sint = isChar ? r.CharacterStackBuffInterval : r.MonsterStackBuffInterval;
        if (sid > 1 && sint > 0 && db().buff(sid)) {
          const k = u.uid, last = f.stackT.get(k) || 0;
          if (D.t - last >= sint) { f.stackT.set(k, D.t); u.buffs.add(A, sid, 1, u); }
        }
      }
    }
  }

  // ---------------------------------------------------------------- đợt quái (Wave.csv)
  function startWave(waveId, center, owner) {
    const row = rowOf('Wave', waveId);
    if (!row) return null;
    const w = { row, center, t: 0, phase: 0, mons: [], owner, done: false };
    D.waves.push(w);
    luaEvent(VD.lua.EV.WaveStarted, waveId);
    return w;
  }
  function waveTick(w, dt) {
    if (w.done) return;
    w.t += dt;
    const ph = w.row.WavePhases || [];
    while (w.phase < ph.length && w.t >= num(ph[w.phase].StartDelay)) {
      const p = ph[w.phase++];
      for (const sd of p.WaveSpawnDatas || []) for (let i = 0; i < (sd.spawnCount || 1); i++) {
        const pos = ring(w.center, num(p.SpawnMinRange), num(p.SpawnMaxRange));
        const u = spawnMonster(sd.monsterId, pos, null, { buffs: sd.buffIds, aggro: true });
        if (u) w.mons.push(u);
      }
    }
    const allOut = w.phase >= ph.length;
    if (w.row.Duration > 0 && w.t >= w.row.Duration) endWave(w, true);
    else if (!w.owner && allOut && w.mons.every(m => m.dead)) endWave(w, true);
  }
  function endWave(w, ok) {
    if (w.done) return;
    w.done = true;
    luaEvent(ok ? VD.lua.EV.WaveCleared : VD.lua.EV.WaveFailed, w.row.Id);
    if (ok && w.owner && w.owner.kind === 'waveexec' && w.owner.row && w.owner.row.ClearReward) spawnDrop(w.owner.row.ClearReward, w.owner.pos);
  }

  // ================================================================ quái
  function rollSpawnGroup(groupId) {
    const rows = rowsOf('MonsterSpawn', 'GroupId', groupId).filter(r => !r.LightCondition || r.LightCondition === 'None');
    if (!rows.length) return null;
    return D.rng.weighted(rows, r => r.Probability || 0);
  }
  // opts: { buffs:[id], aggro:bool, dropGroup, shadow:bool }
  function spawnMonster(id, pos, fwd, opts) {
    if (!db().monster(id)) { console.warn('[dive] không có Monster ' + id); return null; }
    opts = opts || {};
    const p = freeNear(pos.x, pos.z, 0.35);
    const u = VD.stage.spawn({ kind: 'mon', id, pos: p, aim: fwd || { x: -Math.SQRT1_2, z: -Math.SQRT1_2 } });
    u.dropGroup = opts.dropGroup != null ? opts.dropGroup : u.row.DropRewardGroupId;
    const A = VD.stage.A;
    if (VD.AI && VD.AI.init) VD.AI.init(A, u, {});
    for (const b of opts.buffs || []) if (db().buff(b)) u.buffs.add(A, b, 1, u);
    for (const b of D.anomaly ? D.anomaly.MonsterBuffIds || [] : []) if (db().buff(b)) u.buffs.add(A, b, 1, u);
    if (opts.aggro && u.ai && VD.stage.player) u.ai.pending = { t: 0.2, target: VD.stage.player, depth: 99 };
    D.mons.push(u);
    return u;
  }

  // ================================================================ dựng lượt lặn
  function zoneFlags(s) { return String(s || 'None').split(/,\s*/).filter(Boolean); }

  function collectSectors() {
    D.zonePoints = [];
    for (const sec of VD.world.sectors) {
      const row = rowOf('Sector', +sec.cell.id);
      sec.row = row;
      if (!row) continue;
      for (const z of row.ZonePointDatas || []) D.zonePoints.push({ sec, flags: zoneFlags(z.ZoneFlags), pos: secPt(sec, z.Position), used: false });
    }
  }

  // ZoneSpawn.csv: chọn ZonePoint có RequiredZoneFlags, không có ExcludedZoneFlags, thoả SpawnDistanceDatas (Min..Max tới các
  // ZoneSpawn đã đặt). Không điểm nào thoả khoảng cách thì lấy điểm xa nhất. [SUY LUẬN]
  function placeZoneSpawns(ids) {
    D.zoneSpawns = {};
    for (const zid of ids || []) {
      const zr = rowOf('ZoneSpawn', zid);
      if (!zr) { console.warn('[dive] thiếu ZoneSpawn ' + zid); continue; }
      const req = zr.RequiredZoneFlags && zr.RequiredZoneFlags !== 'None' ? zoneFlags(zr.RequiredZoneFlags) : [];
      const exc = zr.ExcludedZoneFlags && zr.ExcludedZoneFlags !== 'None' ? zoneFlags(zr.ExcludedZoneFlags) : [];
      let cand = D.zonePoints.filter(p => !p.used && req.every(f => p.flags.indexOf(f) >= 0) && !exc.some(f => p.flags.indexOf(f) >= 0));
      if (!cand.length) { continue; }
      const ok = p => (zr.SpawnDistanceDatas || []).every(sd => {
        const o = D.zoneSpawns[sd.ZoneSpawnId];
        if (!o) return true;
        const d = dist(p.pos, o.pos);
        return d >= num(sd.Min) && d <= num(sd.Max);
      });
      const good = cand.filter(ok);
      let pick;
      if (good.length) pick = D.rng.pick(good);
      else {
        const placed = Object.values(D.zoneSpawns);
        pick = cand.map(p => ({ p, d: placed.length ? Math.min(...placed.map(o => dist(p.pos, o.pos))) : 0 })).sort((a, b) => b.d - a.d)[0].p;
      }
      pick.used = true;
      const rec = { id: zid, row: zr, pos: pick.pos, point: pick, ents: [] };
      D.zoneSpawns[zid] = rec;
      for (const sd of zr.SpawnDatas || []) {
        const off = v3(sd.Offset), pos = { x: pick.pos.x + off.x, z: pick.pos.z - off.z };
        const t = String(sd.$type || '');
        if (/ZoneExitSpawnData/.test(t)) rec.ents.push(spawnExit(sd.ExitId, pos));
        else if (/ZoneInteractiveTriggerSpawnData/.test(t)) {
          if (sd.PrefabName === 'ZoneSpointLight' || sd.PrefabName === 'ZoneSpawnLight') { D.spotLights.push(pos); continue; }
          rec.ents.push(spawnTrigger(sd.PrefabName, sd.TriggerId, pos));
        } else if (/ZoneNpcSpawnData/.test(t)) rec.ents.push(spawnNpc(sd.NpcId, pos));
        else if (/ZoneCustomMarkerSpawnData/.test(t)) { if (VD.minimap) VD.minimap.mark('zm' + sd.CustomId, sd.MarkerName, pos); }
        else if (/ZoneSkillExecutorSpawnData/.test(t)) D.missing.add('SkillExecutor.csv (ZoneSpawn ' + zid + ')');
        else D.missing.add('ZoneSpawn $type ' + t.split(',')[0]);
      }
    }
  }

  function pickCount(g, pct) {
    // SpawnAll: mọi điểm. Không: SpawnCount (phần lẻ = xác suất thêm một) × phần trăm độ khó.
    const n = num(g.SpawnCount) * (pct == null ? 1 : pct / 100);
    let k = Math.floor(n);
    if (D.rng() < n - k) k++;
    return k;
  }
  function choosePoints(g, pct) {
    const pts = (g.SpawnDatas || []).slice();
    if (g.SpawnAll) return pts;
    shuffle(pts, D.rng);
    return pts.slice(0, Math.min(pts.length, pickCount(g, pct)));
  }

  function spawnSectors() {
    const diff = rowOf('Difficulty', D.diffName, 'Difficulty') || {};
    const safeR = C('CharacterSpawnSafeRange', 5);
    const zoneEx = Object.values(D.zoneSpawns).filter(z => z.row.ExcludedNormalSpawnRange > 0);
    for (const sec of VD.world.sectors) {
      const row = sec.row;
      if (!row) continue;
      // quái: ghi lại, sinh khi người chơi tới gần (VIS_R)
      for (const g of row.MonsterSpawnGroupDatas || []) for (const sd of choosePoints(g, diff.MonsterSpawnPercent)) {
        const pos = secPt(sec, sd.SpawnPosition);
        if (dist(pos, D.start) < safeR) continue;
        if (zoneEx.some(z => dist(pos, z.pos) < z.row.ExcludedNormalSpawnRange)) continue;
        let id = sd.MonsterId, dropGroup = null, buffs = [];
        if (sd.UseMonsterSpawnTable) { const r = rollSpawnGroup(sd.MonsterSpawnGroupId); if (!r) continue; id = r.MonsterId; dropGroup = r.DropRewardGroupId; buffs = r.BuffIds || []; }
        if (!id) continue;
        D.dormant.push({ id, pos, fwd: secDir(sec, sd.Forward), dropGroup, buffs });
      }
      for (const g of row.RewardBoxSpawnGroupDatas || []) for (const sd of choosePoints(g, diff.RewardBoxSpawnPercent)) {
        const cand = rowsOf('RewardBox', 'GroupId', sd.RewardBoxGroupId);
        if (!cand.length) continue;
        spawnBox(D.rng.weighted(cand, r => r.Weight || 0), secPt(sec, sd.SpawnPosition), secDir(sec, sd.Forward));
      }
      for (const g of row.DropRewardSpawnGroupDatas || []) for (const sd of choosePoints(g, diff.DropRewardSpawnPercent))
        for (const gd of rollGroup(sd.DropRewardGroupId)) spawnDrop(gd, secPt(sec, sd.SpawnPosition));
      for (const g of row.TrapSpawnGroupDatas || []) for (const sd of choosePoints(g, 100)) {
        const tr = rowOf('Trap', sd.TrapId); if (tr) spawnTrap(tr, secPt(sec, sd.SpawnPosition), secDir(sec, sd.Forward));
      }
      for (const g of row.EntranceSpawnGroupDatas || []) for (const sd of choosePoints(g, 100)) {
        const er = rowOf('Entrance', sd.EntranceId); if (er) spawnEntrance(er, secPt(sec, sd.SpawnPosition), secDir(sec, sd.Forward));
      }
      for (const g of row.BreakablePropSpawnGroupDatas || []) for (const sd of choosePoints(g, 100)) {
        const br = rowOf('BreakableProp', sd.BreakablePropId); if (br) spawnBreakable(br, secPt(sec, sd.SpawnPosition), secDir(sec, sd.Forward));
      }
      for (const g of row.MimicSpawnGroupDatas || []) for (const sd of choosePoints(g, diff.MimicSpawnPercent)) {
        const ms = rowOf('MimicSpawn', sd.MimicSpawnId); if (!ms) continue;
        const r = D.rng() * 100, pos = secPt(sec, sd.SpawnPosition), fwd = secDir(sec, sd.Forward);
        const box = rowOf('RewardBox', ms.RewardBoxId);
        if (r < ms.MimicPercent) { const mi = (T().Mimic || [])[0]; if (box) { const e = spawnBox(box, pos, fwd); e.mimic = mi; } }
        else if (r < ms.MimicPercent + ms.RewardBoxPercent && box) spawnBox(box, pos, fwd);
      }
      for (const g of row.DisposableObjectSpawnGroupDatas || []) for (const sd of choosePoints(g, 100)) D.missing.add('DisposableObject prefab ' + ((T().DisposableObject || [])[0] || {}).PrefabName);
      for (const g of row.WaveExecutorSpawnGroupDatas || []) for (const sd of choosePoints(g, 100)) spawnWaveExecutor(sd.WaveExecutorId, secPt(sec, sd.SpawnPosition));
      for (const g of row.SpecialFieldSpawnGroupDatas || []) for (const sd of choosePoints(g, 100)) { const sc = v3(sd.Scale); addField(sd.SpecialFieldId, secPt(sec, sd.SpawnPosition), Math.max(sc.x, sc.z) / 2, -1); }
      for (const sd of row.CollisionTriggerSpawnDatas || []) {
        const c = secPt(sec, sd.SpawnPosition), sc = v3(sd.Scale), odd = (sec.cell.rot || 0) % 2 === 1;
        addEnt({ kind: 'collision', triggerId: sd.TriggerId, pos: c, hx: (odd ? sc.z : sc.x) / 2, hz: (odd ? sc.x : sc.z) / 2, cool: num(sd.CoolTime), can: sd.CanTriggered !== false, lastT: -1e9 });
      }
      for (const sd of row.NpcSpawnDatas || []) spawnNpc(sd.NpcId, secPt(sec, sd.SpawnPosition));
      for (const sd of row.TextMarkerSpawnDatas || []) if (VD.minimap) VD.minimap.label(secPt(sec, sd.SpawnPosition), TX(sd.TextKey) || sd.TextKey);
    }
  }
  function spawnWaveExecutor(id, pos) {
    const row = rowOf('WaveExecutor', id);
    if (!row) return null;
    return addEnt({ kind: 'waveexec', row, pos, fwd: { x: Math.SQRT1_2, z: Math.SQRT1_2 }, prefab: row.PrefabName, can: true, used: false });
  }

  // ================================================================ trạng thái căng thẳng / đèn / ô nhiễm
  // Stress.csv: StressMax là biên trên của dải: 0–49 Alert, 50–99 Fear, 100 Despair.
  function stressState(s) {
    const v = s == null ? (VD.stage.player ? VD.stage.player.stress : 0) : s;
    for (const r of T().Stress || []) if (v <= r.StressMax) return r.State;
    return 'Despair';
  }
  function setBuffSet(u, want, key) {
    const A = VD.stage.A;
    const had = D[key] || [];
    for (const b of had) if (want.indexOf(b) < 0) u.buffs.remove(A, b, null, 'state');
    for (const b of want) if (had.indexOf(b) < 0 && db().buff(b) && !u.buffs.get(b)) u.buffs.add(A, b, 1, u);
    D[key] = want.slice();
  }
  // Passive 10000000 ("광원 0 때 디버프"): buff của nó chỉ bật khi LightFuel = 0.
  function darkBuffs() {
    const sk = db().skill(10000000);
    const ev = sk && sk.RootActionNode && sk.RootActionNode.skillAction && sk.RootActionNode.skillAction.actionEvents || [];
    return ev.filter(e => /BuffActionEvent/.test(e.$type || '') && e.Id > 2).map(e => e.Id);
  }

  function rulesTick(dt) {
    const u = VD.stage.player, A = VD.stage.A;
    if (!u || u.dead) return;
    // ---- đèn: Const.LightFuelInterval (5 s) trừ LightFuelTickDamage (1).
    D.lightT += dt;
    const iv = C('LightFuelInterval', 5);
    while (D.lightT >= iv) { D.lightT -= iv; u.light = Math.max(0, (u.light || 0) - C('LightFuelTickDamage', 1)); }
    const dark = (u.light || 0) <= 0;
    if (dark !== D.dark) { D.dark = dark; setBuffSet(u, dark ? D.darkIds : [], 'darkOn'); }
    // ---- căng thẳng theo trạng thái
    const st = stressState(u.stress);
    const srow = (T().Stress || []).find(r => r.State === st);
    if (st !== D.stressSt) {
      D.stressSt = st; D.stressEnterT = D.t;
      D.intervalNext = srow && srow.IntervalDebuffId > 0 ? D.t + srow.IntervalDebuffStartDelay : Infinity;
      D.shadowNext = D.t + C('ShadowMonsterSpawnStartDelay', 5);
    }
    setBuffSet(u, srow ? srow.DebuffIds || [] : [], 'stressOn');
    if (srow && srow.IntervalDebuffId > 0 && D.t >= D.intervalNext) {
      if (db().buff(srow.IntervalDebuffId)) u.buffs.add(A, srow.IntervalDebuffId, 1, u);
      D.intervalNext = D.t + srow.DebuffInterval;
    }
    // Căng thẳng tự nhiên: Const.StressIntervalTime/Damage × Sector.StressIntervalPercent (mọi sector trong phạm vi = 0).
    if (D.t >= D.stressTickNext) {
      D.stressTickNext = D.t + C('StressIntervalTimeMin', 18) + D.rng() * (C('StressIntervalTimeMax', 24) - C('StressIntervalTimeMin', 18));
      const sec = sectorAt(u.pos.x, u.pos.z), pct = sec && sec.row ? sec.row.StressIntervalPercent || 0 : 0;
      const amt = (C('StressIntervalDamageMin', 1) + D.rng() * (C('StressIntervalDamageMax', 2) - C('StressIntervalDamageMin', 1))) * pct / 100;
      if (amt > 0) VD.Combat.stressDamage(A, null, u, amt, {});
    }
    // ---- quái bóng tối (ShadowMonsterSpawn theo (Difficulty, StressState))
    const sh = (T().ShadowMonsterSpawn || []).find(r => r.Difficulty === D.diffName && r.StressState === st);
    if (sh && D.t >= D.shadowNext) {
      D.shadowNext = D.t + sh.ShadowSpawnInterval;
      if (D.rng() * 100 < sh.ShadowSpawnPercent) {
        const n = sh.ShadowMonsterCountMin + Math.floor(D.rng() * (sh.ShadowMonsterCountMax - sh.ShadowMonsterCountMin + 1));
        for (let i = 0; i < n; i++) D.later.push({ t: D.t + i * C('ShadowMonsterSpawnDelay', 1.5), fn: () => {
          const r = rollSpawnGroup(sh.ShadowMonsterGroupSpawnId); if (!r) return;
          const p = ring(u.pos, C('ShadowMonsterSpawnRange', 3.5) * 0.7, C('ShadowMonsterSpawnRange', 3.5));
          const m = spawnMonster(r.MonsterId, p, null, { buffs: r.BuffIds, aggro: true });
          if (m) D.stats.shadows++;
        } });
      }
    } else if (!sh) D.shadowNext = Math.max(D.shadowNext, D.t);
    // ---- ô nhiễm: tổng Equipment.Corruption cổ vật mang theo − chỉ số CorruptionMax (vũ khí cộng) → Corruption.csv
    const over = Math.max(0, VD.inventory.corruption() - (VD.Stats.get(u, 'CorruptionMax') || 0));
    D.corruption = Math.min(C('CorruptionMax', 100), over);
    let crow = null;
    for (const r of T().Corruption || []) if (D.corruption >= r.Threshold) crow = r;
    setBuffSet(u, crow ? crow.DebuffIds || [] : [], 'corrOn');
    if (crow && crow.StressDamageAmount > 0) {
      D.corrT += dt;
      if (D.corrT >= crow.StressDamageIntervalTime) { D.corrT = 0; VD.Combat.stressDamage(A, null, u, crow.StressDamageAmount, { dot: true }); }
    } else D.corrT = 0;
    // ---- vùng ngoài (Campaign.BoundarySpecialFieldId: BoxFogField, buff 3102 "Khu vực cấm")
    const pl = D.play;
    if (pl && (u.pos.x < pl.minX || u.pos.x > pl.maxX || u.pos.z < pl.minZ || u.pos.z > pl.maxZ) && D.boundRow) {
      const b = D.boundRow.CharacterBuffId;
      if (b > 1 && db().buff(b)) { const ib = u.buffs.get(b); if (ib) ib.t = 0; else u.buffs.add(A, b, 1, u); }
    }
    // ---- postfx: trọng số căng thẳng, máu thấp (Const.VignetteHPRatio)
    if (VD.postfx && VD.postfx.params) {
      VD.postfx.params.stress = Math.max(0, Math.min(1, ((u.stress || 0) - 49) / 51));
      VD.postfx.params.lowHp = u.hp <= u.stats.HpMax * C('VignetteHPRatio', 0.15) ? 1 : 0;
    }
  }

  // ================================================================ BGM: Sector.Bgm, CombatBgm khi đang giao chiến, BossBgm theo BgmPriority
  function bgmTick(dt) {
    const u = VD.stage.player;
    if (!u || D.bgmOverride) return;
    let best = null, fight = false;
    for (const m of D.mons) {
      if (m.dead || m.removed || !m.ai || m.ai.state !== 'combat' || m.ai.target !== u) continue;
      fight = true;
      if (m.row.BossBgm && (!best || m.row.BgmPriority > best.row.BgmPriority)) best = m;
    }
    if (fight) D.calmT = 0; else D.calmT += dt;
    const sec = sectorAt(u.pos.x, u.pos.z) || D.startSec;
    const row = sec && sec.row;
    // Rời combat nhạc sau 4 s yên — không có trong bảng (quái tự rời combat sau Const.MonsterCombatExitDelay 10 s).
    let want = row ? row.Bgm : null;
    if (D.calmT < 4 && row) want = best ? best.row.BossBgm : row.CombatBgm || want;
    if (want && want !== VD.audio.bgmName) bgm(want, 1.5);
  }

  // ================================================================ CampaignTask
  function setupTasks() {
    D.tasks = rowsOf('CampaignTask', 'CampaignId', D.camp.Id).map(r => {
      const [cond, arg] = String(r.EventCondition).split(':');
      return { id: r.Id, row: r, cond, arg: +arg || arg, goal: r.Goal, cur: 0, done: false };
    });
  }
  function taskTick() {
    const inv = VD.inventory;
    let changed = false;
    for (const t of D.tasks) {
      let v = t.cur;
      if (t.cond === 'TeamTotalWorth' || t.cond === 'GainedWorth') v = inv.worth();
      else if (t.cond === 'TeamItemCountInInventory' || t.cond === 'MyItemCountInInventory') v = inv.count('Item', t.arg);
      else if (t.cond === 'LuaProgress') v = D.progress[t.arg] || 0;
      else if (t.cond === 'OpenRewardBox') v = D.stats.boxes;
      if (v !== t.cur) { t.cur = v; changed = true; }
      const done = t.cur >= t.goal;
      if (done && !t.done) { t.done = true; changed = true; luaEvent(VD.lua.EV.QuestTaskAchieved, t.id); }
    }
    if (changed || !D._questShown) { D._questShown = true; showQuest(); }
  }
  function emitTask() { /* OpenRewardBox đếm qua D.stats.boxes ở taskTick */ }
  function taskLabel(t) {
    return TX('TCampaignTask_Desc_' + t.id) || (t.cond === 'TeamItemCountInInventory' ? (TX('EEventConditionType_TeamItemCountInInventory') || 'Nhận {0}').replace('{0}', VD.goods.name({ type: 'Item', id: t.arg })) : TX('EEventConditionType_' + t.cond) || t.cond);
  }
  function showQuest() {
    if (!VD.hud || !VD.hud.setQuest) return;
    const title = (TX('EDifficulty_' + D.diffName) ? TX('EDifficulty_' + D.diffName) + ' · ' : '') + (TX('TCampaign_Name_' + D.camp.Id) || ('Campaign ' + D.camp.Id));
    VD.hud.setQuest(title, D.tasks.map(t => {
      const label = taskLabel(t);
      return { text: label + (t.goal > 1 ? ' ' + Math.min(t.cur, t.goal) + '/' + t.goal : ''), done: t.done };
    }));
  }

  // ================================================================ Lua
  function luaKeys() {
    const keys = ['Campaign/' + D.camp.Id];
    const lq = VD.profile.get().loungeQuest || {};
    for (const id of Object.keys(lq)) if (lq[id] === 2 && VD.LUA && VD.LUA['LoungeQuest/' + id]) keys.push('LoungeQuest/' + id);
    return keys;
  }
  function luaEvent(type, value) { D.luaQueue.push({ ev: true, type, value }); }
  function luaCall(key, fn, a, b) { D.luaQueue.push({ key, fn, a, b }); }
  function flushLua() {
    const q = D.luaQueue.splice(0);
    for (const c of q) {
      try {
        if (c.ev) { if (D.trace) D.trace.push('event:' + c.type + ':' + c.value); VD.lua.event(luaKeys(), c.type, c.value); }
        else if (VD.lua.has(c.key, c.fn)) { if (D.trace) D.trace.push('call:' + c.key + '.' + c.fn); VD.lua.call(c.key, c.fn, c.a, c.b); }
      } catch (e) { console.error('[dive] Lua ' + (c.fn || c.type) + ': ' + (e.message || e)); }
    }
  }
  const campKey = () => 'c' + D.camp.Id;
  const cq = () => VD.profile.quest(campKey());

  // ================================================================ tương tác F
  function interactables() {
    const u = VD.stage.player, out = [];
    for (const e of D.ents) {
      if (e.removed) continue;
      let it = null;
      switch (e.kind) {
        case 'box': it = boxInteract(e); break;
        case 'door': it = doorInteract(e); break;
        case 'exit': it = exitInteract(e); break;
        case 'drop': it = { verb: TX('Pickup') || 'Nhặt', time: C('LootingInteractionTime', 0.1) }; break;
        case 'trigger': {
          const trig = D.triggerable[e.triggerId];
          const can = trig != null ? trig : e.can;
          if (!can || (e.used && e.cool < 0) || (e.cool > 0 && D.t - e.lastT < e.cool)) break;
          it = { verb: TX('Interact') || 'Tương tác', time: e.hold || 0.5, sfx: e.sfx };
          break;
        }
        case 'npc': it = { verb: TX('Interact') || 'Tương tác', time: 0.05 }; break;
        case 'waveexec': if (!e.used && (D.triggerableWE[e.row.Id] !== false)) it = { verb: TX('Interact') || 'Tương tác', time: C('WaveExecutorInteractionTime', 2) }; break;
      }
      if (!it) continue;
      const r = (e.prefab && D.prefabR && D.prefabR[e.prefab]) || (e.kind === 'drop' ? 0.75 : e.kind === 'npc' ? 1.2 : 1);
      const d = dist(u.pos, e.pos);
      if (d > r + (u.radius || 0.3) + 0.2) continue;
      out.push({ e, it, d });
    }
    out.sort((a, b) => a.d - b.d);
    return out[0] || null;
  }
  function interactTick(dt) {
    const u = VD.stage.player;
    const inp = VD.input;
    const busy = !u || u.dead || D.state !== 'play' || inp.enabled === false || VD.inventory.open || D.cutscene;
    const cur = busy ? null : interactables();
    if (!cur || (D.focus && cur.e !== D.focus.e)) { D.holdT = 0; stopHoldSfx(); }
    D.focus = cur;
    // Xong một tương tác thì phải thả F mới bắt đầu cái khác; riêng nhặt đồ rơi được giữ F nhặt liền nhiều món. [SUY LUẬN]
    const blocked = D.needRelease && !(cur && D.chain === 'drop' && cur.e.kind === 'drop');
    if (!inp.held.Interact) { if (D.holdT > 0) stopHoldSfx(); D.holdT = 0; D.needRelease = false; D.chain = null; }
    else if (cur && !blocked) {
      if (D.holdT === 0 && cur.it.sfx) D.holdSfx = sfx(cur.it.sfx, { pos: cur.e.pos, loop: true, key: 'hold' });
      if (D.holdT === 0 && cur.e.kind === 'box') searchAnim(u, true);
      D.holdT += dt;
      if (D.holdT >= cur.it.time) {
        D.holdT = 0; stopHoldSfx();
        D.needRelease = true; D.chain = cur.e.kind;
        use(cur.e);
      }
    }
    renderPrompt(cur);
  }
  function stopHoldSfx() { if (D.holdSfx) { VD.audio.stop(D.holdSfx, 0.1); D.holdSfx = null; } searchAnim(VD.stage.player, false); }
  // GetInteractionAnimation gốc: giữ F ở rương thì nhân vật chơi battle/search (không đè anim skill đang chạy).
  function searchAnim(u, on) {
    if (!u) return;
    if (on && !u.drive) u.drive = { name: 'battle/search', loop: true, t0: VD.stage.A.time, offset: 0, ts: 1, hold: true };
    else if (!on && u.drive && u.drive.hold && !VD.inventory.open) u.drive = null;
  }
  function use(e) {
    switch (e.kind) {
      case 'box':
        if (e.mimic && !e.opened) {
          // Mimic.csv: rương giả hoá quái Mimic.MonsterId.
          const m = spawnMonster(e.mimic.MonsterId, e.pos, null, { aggro: true });
          removeEnt(e);
          if (m) VD.dialog.toast(TX('TMonster_Name_' + e.mimic.MonsterId) || '!');
          return;
        }
        boxOpen(e); break;
      case 'door': doorUse(e); break;
      case 'exit': exitUse(e); break;
      case 'drop': {
        const left = VD.inventory.add(e.goods);
        // DropGoods gốc: _interactionSfx rỗng → nhóm tiếng LootingCompleted (hằng LOOTING_COMPLETED). [SUY LUẬN]
        VD.audio.sfx('LootingCompleted', { pos: e.pos });
        if (left <= 0) removeEnt(e); else e.goods.count = left;
        break;
      }
      case 'trigger':
        e.used = true; e.lastT = D.t;
        luaEvent(VD.lua.EV.TriggerInteraction, e.triggerId);
        break;
      case 'npc': luaEvent(VD.lua.EV.NpcInteraction, e.npcId); break;
      case 'waveexec':
        e.used = true;
        e.wave = startWave(e.row.WaveId, e.pos, e);
        break;
    }
  }

  // ---------------------------------------------------------------- lời nhắc "F <động từ>" + vòng giữ
  const P = { el: null };
  function buildPrompt() {
    const ui = document.getElementById('ui') || document.body;
    P.el = document.createElement('div');
    P.el.className = 'vd-prompt';
    P.el.innerHTML = '<div class="key"><svg viewBox="0 0 40 40"><circle class="bg" cx="20" cy="20" r="17"/><circle class="fg" cx="20" cy="20" r="17"/></svg><b>F</b></div><span class="verb"></span><div class="cost"><img><i></i></div>';
    ui.appendChild(P.el);
    P.fg = P.el.querySelector('.fg'); P.verb = P.el.querySelector('.verb'); P.cost = P.el.querySelector('.cost');
  }
  const pv = new THREE.Vector3();
  function renderPrompt(cur) {
    if (!P.el) buildPrompt();
    if (!cur || !D.hudOn) { P.el.style.display = 'none'; return; }
    P.el.style.display = '';
    P.verb.textContent = cur.it.verb + (cur.it.locked ? ' 🔒' : '');
    P.el.classList.toggle('locked', !!cur.it.locked);
    const frac = cur.it.time > 0 ? Math.min(1, D.holdT / cur.it.time) : 0;
    const L = 2 * Math.PI * 17;
    P.fg.style.strokeDasharray = L; P.fg.style.strokeDashoffset = L * (1 - frac);
    if (cur.it.cost && cur.it.cost.count > 0) {
      P.cost.style.display = '';
      const img = P.cost.querySelector('img'), src = VD.goods.icon(cur.it.cost);
      if (img.dataset.src !== src) { img.src = src; img.dataset.src = src; }
      P.cost.querySelector('i').textContent = cur.it.cost.count;
    } else P.cost.style.display = 'none';
    pv.set(cur.e.pos.x, 1.0, cur.e.pos.z).project(VD.render.camera);
    const c = VD.render.renderer.domElement;
    const x = (pv.x + 1) / 2 * c.clientWidth, y = (1 - pv.y) / 2 * c.clientHeight;
    P.el.style.transform = `translate(${Math.round(x + 18)}px, ${Math.round(y)}px)`;
  }

  // ---------------------------------------------------------------- mũi tên chỉ (SpawnPointerArrow)
  function arrowsRender() {
    const c = VD.render.renderer.domElement;
    for (const a of D.arrows.values()) {
      pv.set(a.pos.x, a.y || 1.7, a.pos.z).project(VD.render.camera);
      a.el.style.transform = `translate(${(pv.x + 1) / 2 * c.clientWidth}px, ${(1 - pv.y) / 2 * c.clientHeight}px)`;
      a.el.style.display = D.hudOn ? '' : 'none';
    }
  }

  // ================================================================ hình (tạo dần theo khoảng cách)
  function visTick() {
    const u = VD.stage.player;
    if (!u) return;
    for (const e of D.ents) {
      if (e.h || e.removed) continue;
      if (e.kind === 'collision' || e.kind === 'npc') continue;
      if (dist(u.pos, e.pos) > VIS_R) continue;
      if (e.kind === 'drop') { e.h = VD.objects.drop(VD.goods.icon(e.goods), e.pos); continue; }
      if (e.kind === 'trap') continue;   // hình bẫy nằm trong prefab sector + VFX hitbox
      const prefab = e.prefab || (e.kind === 'trigger' ? e.prefab : null);
      if (!prefab || !VD.objects.has(prefab)) continue;
      e.h = VD.objects.create(prefab, { pos: e.pos, fwd: e.fwd, state: e.kind === 'door' ? (e.open ? 'open' : 'closed') : e.kind === 'exit' ? e.state : null });
    }
    // quái ngủ: sinh khi tới gần
    for (let i = D.dormant.length - 1; i >= 0; i--) {
      const m = D.dormant[i];
      if (dist(u.pos, m.pos) > VIS_R) continue;
      D.dormant.splice(i, 1);
      spawnMonster(m.id, m.pos, m.fwd, { dropGroup: m.dropGroup, buffs: m.buffs });
    }
    // dấu trên bản đồ nhỏ
    if (VD.minimap) for (const e of D.ents) {
      if (!e.mark || e.marked) continue;
      if (e.kind === 'exit' && !(e.markAlways || dist(u.pos, e.pos) < 20)) continue;
      if (e.kind === 'box' && !e.questBox) continue;
      e.marked = true;
      VD.minimap.mark(e.id, e.mark, e.pos);
    }
  }

  // ================================================================ va chạm trigger, bẫy, vật phá
  function worldTick(dt) {
    const u = VD.stage.player, A = VD.stage.A;
    if (!u) return;
    for (const e of D.ents) {
      if (e.removed) continue;
      if (e.kind === 'collision') {
        const trig = D.triggerable[e.triggerId];
        const can = trig != null ? trig : e.can;
        if (!can || u.dead) continue;
        if (Math.abs(u.pos.x - e.pos.x) <= e.hx + 0.2 && Math.abs(u.pos.z - e.pos.z) <= e.hz + 0.2) {
          if (D.t - e.lastT >= (e.cool > 0 ? e.cool : 1e9) || e.lastT < -1e8) { e.lastT = D.t; luaEvent(VD.lua.EV.CollisionTriggerEnter, e.triggerId); }
        }
      } else if (e.kind === 'trap') {
        if (dist(u.pos, e.pos) > 24) continue;   // bẫy xa không chạy — không có trong bảng: tiết kiệm CPU
        e.owner.aim = e.fwd;
        if (e.trigger) {
          if (!e.armed) continue;
          const hit = VD.stage.units.some(o => !o.dead && (o.kind === 'char' || (e.owner.team === 'trap' && o.kind === 'mon')) && dist(o.pos, e.pos) <= 1);
          if (hit) { fireTrap(e); e.armed = false; D.later.push({ t: D.t + 4, fn: () => removeEnt(e) }); }
        } else if (e.row.CoolTime > 0) {
          e.t -= dt;
          if (e.t <= 0) { e.t = e.row.CoolTime; fireTrap(e); }
        }
      } else if (e.kind === 'breakable') {
        for (const hb of A.hitboxes || []) {
          if (!hb.alive || hb.owner !== u || e.seen.has(hb.uid)) continue;
          if (VD.HitBox.overlaps(hb, { pos: e.pos, radius: 0.3 })) { e.seen.add(hb.uid); e.hits++; }
        }
        if (e.hits >= e.row.HitsToBreak) breakProp(e);
      } else if (e.kind === 'exit') exitTick(e, dt);
    }
    for (const w of D.waves) waveTick(w, dt);
  }
  function breakProp(e) {
    for (const ev of e.row.ActionEventsOnDestroy || []) {
      if (/SpecialFieldActionEvent/.test(ev.$type || '')) addField(ev.SpecialFieldId, e.pos, num(ev.Radius) || 1, -1);
    }
    if (e.row.DropRewardGroupId > 0) for (const g of rollGroup(e.row.DropRewardGroupId)) spawnDrop(g, e.pos);
    sfx('Explosion', { pos: e.pos });
    removeEnt(e);
  }

  // ================================================================ sự kiện combat
  function onUnitEvent(ev) {
    const pl = VD.stage.player;
    if (ev.type === 'death' && ev.unit) {
      const u = ev.unit;
      if (u === pl) { if (D.state === 'play') finish('dead'); return; }
      if (u.kind !== 'mon') return;
      luaEvent(VD.lua.EV.MonsterKill, u.id);
      if (u.monsterType !== 'Shadow') {
        if (u.monsterType === 'Boss') D.stats.bossKills++; else D.stats.kills++;
      }
      // Monster.RecoveryStressAmountOnDead trong RecoveryStressRangeOnDead.
      if (pl && u.row.RecoveryStressAmountOnDead > 0 && dist(pl.pos, u.pos) <= (u.row.RecoveryStressRangeOnDead || 0)) VD.Combat.stressRecover(VD.stage.A, pl, u.row.RecoveryStressAmountOnDead);
      if (u.dropGroup > 0) for (const g of rollGroup(u.dropGroup)) spawnDrop(g, u.pos);
    } else if (ev.type === 'damage' && ev.tgt === pl && pl && ev.hpLoss > 0) {
      if (VD.postfx && VD.postfx.hit) VD.postfx.hit();
      // Const.StressDamageOnHpDamaged (3) mỗi khi mất cộng dồn StressDamageTriggerHpPercent (30 %) máu tối đa. [SUY LUẬN]
      D.hpLostAcc += ev.hpLoss;
      const step = pl.stats.HpMax * C('StressDamageTriggerHpPercent', 30) / 100;
      while (step > 0 && D.hpLostAcc >= step) { D.hpLostAcc -= step; VD.Combat.stressDamage(VD.stage.A, ev.src, pl, C('StressDamageOnHpDamaged', 3), {}); }
    }
  }

  // ================================================================ cutscene (không có Timeline Unity trên web)
  // PlayCutscene: camera lướt tới điểm, tối mép, khoá điều khiển; tín hiệu 1 ở 1,2 s, kết thúc ở 3 s. Quái xuất hiện là
  // quái do Lua sinh sau WaitCutsceneEndAsync (SpawnVfx của Monster.csv). [SUY LUẬN, docs/DIVE.md §7]
  function cutsceneTick(dt) {
    const c = D.cutscene;
    if (!c) return;
    c.t += dt;
    if (c.t >= 1.2 && !c.sig1) { c.sig1 = true; c.sigTask.IsCompleted = true; }
    if (c.t >= 3.0) {
      c.endTask.IsCompleted = true;
      D.cutscene = null; D.camTarget = null;
      document.body.classList.remove('vd-cutscene');
      if (VD.input && !(VD.dialog && VD.dialog.open)) VD.input.enabled = true;
      const pl = VD.stage.player; const bid = C('CutsceneStateBuffId', 0);
      if (pl && bid && pl.buffs.get(bid)) pl.buffs.remove(VD.stage.A, bid, null, 'cutscene');
    }
  }

  // ================================================================ LuaApi
  function installApi() {
    const L = VD.lua, api = L.api, done = L.done, pl = () => VD.stage.player;
    const qid = id => (id == null ? campKey() : String(id));
    const store = (kind, temp) => ({
      get: (id, key) => { if (temp) { const v = D.temp[kind][qid(id) + '|' + key]; return v === undefined ? null : v; } return VD.profile.qget(qid(id), kind, key); },
      set: (id, key, v) => { if (temp) D.temp[kind][qid(id) + '|' + key] = v; else VD.profile.qset(qid(id), kind, key, v); },
    });
    const S_ = store('s'), I_ = store('i'), B_ = store('b'), F_ = store('f');
    const St = store('s', true), It = store('i', true), Bt = store('b', true), Ft = store('f', true);
    Object.assign(api, {
      GetStep: () => cq().step || 0,
      SetStep: n => { cq().step = n | 0; VD.profile.save(); if (D.camp) luaCall('Campaign/' + D.camp.Id, 'Step_' + String(n | 0).padStart(5, '0')); return done(); },
      GetString: (id, k) => S_.get(id, k), SetString: (id, k, v) => { S_.set(id, k, v == null ? null : String(v)); },
      GetInt: (id, k) => I_.get(id, k) || 0, SetInt: (id, k, v) => { I_.set(id, k, v | 0); },
      GetBool: (id, k) => !!B_.get(id, k), SetBool: (id, k, v) => { B_.set(id, k, !!v); },
      GetFloat: (id, k) => F_.get(id, k) || 0, SetFloat: (id, k, v) => { F_.set(id, k, num(v)); },
      GetTempString: (id, k) => St.get(id, k), SetTempString: (id, k, v) => { St.set(id, k, v == null ? null : String(v)); },
      GetTempInt: (id, k) => It.get(id, k) || 0, SetTempInt: (id, k, v) => { It.set(id, k, v | 0); },
      GetTempBool: (id, k) => !!Bt.get(id, k), SetTempBool: (id, k, v) => { Bt.set(id, k, !!v); },
      GetTempFloat: (id, k) => Ft.get(id, k) || 0, SetTempFloat: (id, k, v) => { Ft.set(id, k, num(v)); },
      RemoveKey: (id, k) => { const q = VD.profile.quest(qid(id)); for (const kind of ['s', 'i', 'b', 'f']) delete q[kind][k]; VD.profile.save(); },
      RemoveValue: (id, k) => api.RemoveKey(id, k),
      GetQuestState: () => cq().state || 1,
      SetQuestState: v => { cq().state = v | 0; VD.profile.save(); luaEvent(L.EV.QuestStateChanged, v | 0); return done(); },
      IsTaskAchieved: id => !!(D.tasks.find(t => t.id === id) || {}).done || !!(cq().tasks && cq().tasks[id]),
      IsAllTaskAchieved: () => D.tasks.length > 0 && D.tasks.every(t => t.done || (cq().tasks && cq().tasks[t.id])),
      SetProgress: (key, v) => { D.progress[key] = num(v); },
      GetMissionState: id => (VD.profile.quest('m' + id).state || 0),
      SetMissionState: (id, v) => { VD.profile.quest('m' + id).state = v | 0; VD.profile.save(); luaEvent(L.EV.MissionStateChanged, v | 0); },
      GetMissionStep: id => VD.profile.quest('m' + id).step || 0,
      SetMissionStep: (id, v) => { VD.profile.quest('m' + id).step = v | 0; VD.profile.save(); },
      GetLoungeQuestState: id => (VD.profile.get().loungeQuest[id] || 1),
      SetLoungeQuestState: (id, v) => { VD.profile.get().loungeQuest[id] = v | 0; VD.profile.save(); luaEvent(L.EV.LoungeQuestStateChanged, id); },
      IsAllLoungeQuestTaskCompleted: () => false,
      GetCharacterId: () => (pl() ? pl().id : D.char),
      GetCharacterHp: () => (pl() ? pl().hp : 0),
      GetCharacterMaxHp: () => (pl() ? pl().stats.HpMax : 0),
      GetCharacterStress: () => (pl() ? pl().stress || 0 : 0),
      GetCharacterLightFuel: () => (pl() ? pl().light || 0 : 0),
      GetCharacterPosition: () => (pl() ? toLua(pl().pos) : { x: 0, y: 0, z: 0 }),
      GetCharacterForward: () => { const a = pl() ? pl().aim : { x: 0, z: 1 }; return { x: a.x, y: 0, z: -a.z }; },
      SetCharacterHp: v => { const u = pl(); if (u) u.hp = Math.max(1, Math.min(u.stats.HpMax, num(v))); },
      SetCharacterStress: v => { const u = pl(); if (u) { const before = u.stress || 0; u.stress = Math.max(0, Math.min(C('StressMax', 100), num(v))); VD.stage.A.emit({ type: 'stress', unit: u, stress: u.stress, delta: u.stress - before }); } },
      SetCharacterLightFuel: v => { const u = pl(); if (u) { u.light = Math.max(0, Math.min(C('LightFuelMax', 100), num(v))); D.lightT = 0; } },
      SetCharacterPosition: t => { const u = pl(); if (!u) return; const p = freeNear(...Object.values(fromLua(t)), 0.3); u.pos.x = p.x; u.pos.z = p.z; VD.render.snap(u.pos); },
      SetCharacterForward: t => { const u = pl(); if (!u) return; const f = fromLua(t), l = Math.hypot(f.x, f.z) || 1; u.aim = { x: f.x / l, z: f.z / l }; if (u.input) u.input.aim = u.aim; },
      AddCharacterBuff: (id, n) => { const u = pl(); if (u && db().buff(id)) u.buffs.add(VD.stage.A, id, n || 1, u); },
      SpawnMonster: (id, t) => { const u = spawnMonster(id, fromLua(t), null, { aggro: false }); return done(u ? u.uid : 0); },
      GetMonsterCount: id => D.mons.filter(m => !m.dead && !m.removed && (!id || m.id === id)).length,
      SpawnExit: (id, t) => { const e = spawnExit(id, freeNear(...Object.values(fromLua(t)), 0.6)); if (e) D.visNow = true; return done(); },
      SpawnRewardBox: (id, t) => { const r = rowOf('RewardBox', id) || rowsOf('RewardBox', 'GroupId', id)[0]; if (r) { const e = spawnBox(r, fromLua(t), { x: Math.SQRT1_2, z: Math.SQRT1_2 }); e.questBox = true; } return done(); },
      SpawnDropItem: (id, n, t) => { spawnDrop({ type: 'Item', id, count: n || 1 }, fromLua(t)); return done(); },
      SpawnWaveExecutor: (id, t) => { spawnWaveExecutor(id, fromLua(t)); return done(); },
      SpawnNpc: (id, t) => { if (!D.ents.some(e => e.kind === 'npc' && e.npcId === id)) spawnNpc(id, fromLua(t)); return done(); },
      DespawnNpc: id => { for (const e of D.ents.filter(e => e.kind === 'npc' && e.npcId === id)) { if (e.vis) e.vis.dispose(); removeEnt(e); } },
      HasNpc: id => D.ents.some(e => e.kind === 'npc' && e.npcId === id),
      GetNpcPosition: id => { const e = D.ents.find(e => e.kind === 'npc' && e.npcId === id); return e ? toLua(e.pos) : { x: 0, y: 0, z: 0 }; },
      SetNpcState: (id, st) => { for (const e of D.ents) if (e.kind === 'npc' && e.npcId === id) e.npcState = st | 0; VD.profile.get().npcState = Object.assign(VD.profile.get().npcState || {}, { [id]: st | 0 }); },
      SetNpcNavigationActive: (id, on) => { for (const e of D.ents) if (e.kind === 'npc' && e.npcId === id) e.nav = !!on; },
      SetTriggerable: (type, id, on) => { if ((type | 0) === 2) D.triggerableWE[id] = !!on; else D.triggerable[id] = !!on; },
      GetTriggerableObjectPosition: (type, id) => { const e = D.ents.find(e => (e.kind === 'trigger' && e.triggerId === id) || (e.kind === 'waveexec' && e.row.Id === id)); return e ? toLua(e.pos) : { x: 0, y: 0, z: 0 }; },
      GetZoneSpawnPosition: id => { const z = D.zoneSpawns[id]; return z ? toLua(z.pos) : toLua(D.start); },
      HasItem: (id, n) => VD.inventory.has('Item', id, n || 1),
      GiveItem: (id, n) => { VD.inventory.add({ type: 'Item', id, count: n || 1 }); return done(); },
      RemoveItem: (id, n) => { VD.inventory.remove('Item', id, n || 1); return done(); },
      GetItemCount: id => VD.inventory.count('Item', id),
      GetEmptyInventorySlotCount: () => VD.inventory.emptySlots(),
      HasEquipment: id => VD.inventory.has('Equipment', id, 1),
      GiveEquipment: (id, n) => { VD.inventory.add(finishGoods({ type: 'Equipment', id, count: n || 1 })); return done(); },
      RemoveEquipment: (id, n) => { VD.inventory.remove('Equipment', id, n || 1); return done(); },
      GetEquipmentCount: id => VD.inventory.count('Equipment', id),
      GiveItemToStorage: (id, n) => { VD.profile.get().stash.push({ type: 'Item', id, count: n || 1 }); VD.profile.save(); },
      GiveEquipmentToStorage: (id, n) => { VD.profile.get().stash.push({ type: 'Equipment', id, count: n || 1 }); VD.profile.save(); },
      GiveCoin: n => { VD.profile.giveCoin(n); return done(); }, RemoveCoin: n => { VD.profile.removeCoin(n); return done(); }, HasCoin: n => VD.profile.coin() >= n,
      GiveGold: n => { VD.profile.giveGold(n); return done(); }, RemoveGold: n => { VD.profile.removeGold(n); return done(); }, HasGold: n => VD.profile.gold() >= n,
      ForceEscapeStage: () => { D.later.push({ t: D.t + 1.5, fn: () => finish('escape', { forced: true }) }); return done(); },
      ForceStartStage: () => done(),
      ForceReturnToTitle: () => { finish('abandon'); return done(); },
      PlayCutscene: (name, t) => {
        const pos = t ? fromLua(t) : pl().pos;
        D.cutscene = { name, pos, t: 0, sigTask: { IsCompleted: false, Result: null }, endTask: { IsCompleted: false, Result: null } };
        D.camTarget = pos;
        document.body.classList.add('vd-cutscene');
        if (VD.input) { VD.input.enabled = false; VD.input.clear(); }
        const bid = C('CutsceneStateBuffId', 0), u = pl();
        if (u && bid && db().buff(bid)) u.buffs.add(VD.stage.A, bid, 1, u);
        return done();
      },
      WaitCutsceneSignalAsync: () => D.cutscene ? D.cutscene.sigTask : done(),
      WaitCutsceneEndAsync: () => D.cutscene ? D.cutscene.endTask : done(),
      SpawnSequentialTimeline: () => done(),
      SetInGameHudActive: on => setHud(!!on),
      SpawnPointerArrow: (id, t) => {
        api.DespawnPointerArrow(id);
        const el = document.createElement('div'); el.className = 'vd-pointer'; (document.getElementById('ui') || document.body).appendChild(el);
        const p = fromLua(t);
        D.arrows.set(id, { el, pos: p, y: num(VD.lua.field(t, 'y')) || 1.7 });
      },
      DespawnPointerArrow: id => { const a = D.arrows.get(id); if (a) { a.el.remove(); D.arrows.delete(id); } },
      SpawnMiniMapMarker: (id, type, t) => { if (VD.minimap) VD.minimap.mark('lua' + id, type, fromLua(t)); },
      DespawnMiniMapMarker: id => { if (VD.minimap) VD.minimap.unmark('lua' + id); },
      PlayPing: (sender, type, t) => { if (VD.minimap) VD.minimap.ping(fromLua(t), type | 0); },
      PlaySfx: name => { sfx(name, { loop: false, key: 'lua:' + name }); },
      StopSfx: name => { VD.audio.stopByName('lua:' + name); },
      PlayBgm: name => { D.bgmOverride = name; bgm(name, 1.2); },
      StopBgm: () => { D.bgmOverride = null; VD.audio.stopBgm(1); },
      SendTutorialEvent: name => { if (D.trace) D.trace.push('tutorial:' + name); },
      GetCampaignId: () => (D.camp ? D.camp.Id : 0),
      IsTutorial: () => !!VD.profile.get().isTutorial,
      SetIsTutorial: on => { VD.profile.get().isTutorial = !!on; VD.profile.save(); },
      IsClearedCampaign: id => VD.profile.cleared(id),
      AcquireParadox: id => { const pid = id | 0; const p = VD.profile.get().paradox; if (pid && p.indexOf(pid) < 0) { p.push(pid); VD.profile.save(); applyParadox(pid); } },
      RemoveParadox: id => { const p = VD.profile.get().paradox, i = p.indexOf(id | 0); if (i >= 0) { p.splice(i, 1); VD.profile.save(); const r = rowOf('Paradox', id | 0), u = pl(); if (r && u) u.buffs.remove(VD.stage.A, r.DebuffId, null, 'paradox'); } },
      GetParadoxIds: () => VD.profile.get().paradox.slice(),
      TriggerEventToAll: v => { luaEvent(L.EV.Custom, v); },
      IsHost: () => true,
      AddDialog: (npc, t) => { const d = VD.profile.get(); d.dialogs = d.dialogs || []; d.dialogs.push({ npc, LuaKey: L.field(t, 'LuaKey'), FunctionName: L.field(t, 'FunctionName'), Purpose: L.field(t, 'Purpose'), Priority: L.field(t, 'Priority'), Type: L.field(t, 'Type') }); VD.profile.save(); },
      RemoveDialog: (npc, key, fn) => { const d = VD.profile.get(); d.dialogs = (d.dialogs || []).filter(x => !(x.npc === npc && x.LuaKey === key && x.FunctionName === fn)); VD.profile.save(); },
      LogInfo: s => console.log('[lua] ' + s), LogDebug: s => console.log('[lua] ' + s),
      LogWarning: s => console.warn('[lua] ' + s), LogError: s => console.error('[lua] ' + s),
      SpawnGuest: () => done(),
    });
  }
  function applyParadox(pid) {
    const r = rowOf('Paradox', pid), u = VD.stage.player;
    if (r && u && db().buff(r.DebuffId)) u.buffs.add(VD.stage.A, r.DebuffId, 1, u);
    else if (r) D.missing.add('Buff ' + r.DebuffId + ' (Paradox ' + pid + ')');
  }
  function setHud(on) {
    D.hudOn = on;
    if (VD.hud) VD.hud.show(on);
    if (VD.minimap) VD.minimap.show(on);
  }

  // ================================================================ kết thúc, kết quả
  function finish(kind, extra) {
    if (D.state !== 'play' && D.state !== 'intro') return;
    extra = extra || {};
    D.state = kind === 'dead' ? 'dead' : 'escaping';
    D.endKind = kind; D.endExtra = extra;
    D.endAt = D.t + (kind === 'dead' ? 2.5 : 1.2);
    if (VD.input) { VD.input.enabled = false; VD.input.clear(); }
    if (VD.inventory.open) VD.inventory.toggle(false);
    stopHoldSfx();
    if (kind !== 'dead') { const pl = VD.stage.player; if (pl && VD.stage.vis.get(pl.uid)) VD.stage.vis.get(pl.uid).root.visible = true; }
  }

  function buildResult() {
    const kind = D.endKind, escaped = kind === 'escape';
    const diff = rowOf('Difficulty', D.diffName, 'Difficulty') || {}, vd = rowOf('VariantDifficulty', D.camp.VariantDifficulty) || {};
    const carried = VD.inventory.goods().map(g => Object.assign({}, g));
    // EXP: Const.ExpFrom* × Difficulty.UserExpPercent × VariantDifficulty.UserExpPercent.
    const e = {
      monster: D.stats.kills * (C('ExpFromNormalMonster', 8) + C('ExpBonusFromNormalMonsterKill', 2)) + D.stats.bossKills * (C('ExpFromBossMonster', 250) + C('ExpBonusFromBossMonsterKill', 30)),
      box: D.stats.boxes * C('ExpFromRewardBox', 15),
      escape: escaped && D.camp.HasEscapeExpReward ? C('ExpFromEscape', 650) : 0,
    };
    const pct = (diff.UserExpPercent || 100) / 100 * (vd.UserExpPercent || 100) / 100;
    e.base = e.monster + e.box + e.escape;
    e.total = Math.round(e.base * pct);
    e.percent = Math.round(pct * 100);
    const tasks = D.tasks.map(t => ({ id: t.id, text: taskLabel(t), cur: t.cur, goal: t.goal, done: t.done }));
    const allTasks = D.tasks.length > 0 && D.tasks.every(t => t.done);
    const tutorialDone = D.camp.Category === 'Tutorial' && (cq().step || 0) >= 10;
    const cleared = escaped && (allTasks || tutorialDone);
    // Chết: mất mọi đồ trừ khe an toàn; tối đa Const.LostGoodsStorageDefaultSlotCount món vào kho "Đồ thất lạc", chọn theo
    // trọng số LostGoods*WeightMultiplier (bậc × loại), giá chuộc = Worth × [PriceMultiplierMin..Max], giữ LostGoodsRetentionExitCount lần thoát.
    let lost = [], stored = [];
    const prof = VD.profile.get();
    if (!escaped) {
      const safeIds = new Set(VD.inventory.safe.filter(s => s.g).map(s => s.g));
      lost = VD.inventory.goods().filter(g => !safeIds.has(g));
      const w = g => {
        const r = VD.goods.row(g) || {};
        const gr = C('LostGoodsGrade' + (r.Grade && r.Grade !== 'None' ? r.Grade : 'Normal') + 'WeightMultiplier', 1);
        const ty = g.type === 'Equipment' ? (r.GoodsType === 'Artifact' ? C('LostGoodsArtifactWeightMultiplier', 10) : C('LostGoodsEquipmentWeightMultiplier', 10))
          : g.type === 'Bag' ? C('LostGoodsBagWeightMultiplier', 10) : r.GoodsType === 'Consumable' ? C('LostGoodsConsumableWeightMultiplier', 1) : 1;
        return gr * ty;
      };
      const pool = lost.slice();
      const nMax = C('LostGoodsStorageDefaultSlotCount', 7);
      while (pool.length && stored.length < nMax) {
        const g = D.rng.weighted(pool, w);
        pool.splice(pool.indexOf(g), 1);
        const r = VD.goods.row(g) || {}, art = r.GoodsType === 'Artifact';
        const lo = art ? C('LostArtifactPriceMultiplierMin', 0.5) : C('LostGoodsPriceMultiplierMin', 0.3), hi = art ? C('LostArtifactPriceMultiplierMax', 2) : C('LostGoodsPriceMultiplierMax', 1.5);
        stored.push({ goods: Object.assign({}, g), price: Math.round(VD.goods.worth(g) * (lo + D.rng() * (hi - lo))), exitsLeft: C('LostGoodsRetentionExitCount', 3) });
      }
      prof.lostGoods = (prof.lostGoods || []).concat(stored);
      prof.safe = VD.inventory.safe.filter(s => s.g).map(s => s.g);
    } else {
      prof.stash = (prof.stash || []).concat(VD.inventory.slots.filter(s => s.g).map(s => s.g));
      prof.safe = VD.inventory.safe.filter(s => s.g).map(s => s.g);
      for (const l of prof.lostGoods || []) l.exitsLeft--;
      prof.lostGoods = (prof.lostGoods || []).filter(l => l.exitsLeft > 0);
    }
    prof.quick = VD.inventory.quick.slice();
    prof.dives = (prof.dives || 0) + 1;
    if (cleared) { prof.clears[D.camp.Id] = (prof.clears[D.camp.Id] || 0) + 1; }
    const q = cq(); q.tasks = q.tasks || {}; for (const t of D.tasks) if (t.done) q.tasks[t.id] = true;
    VD.profile.addExp(e.total);
    VD.profile.save();
    return {
      campaignId: D.camp.Id, characterId: D.char, difficulty: D.diffName, escaped, dead: kind === 'dead', forced: !!D.endExtra.forced,
      exit: D.endExtra.exit || 0, loot: escaped ? carried : [], lostGoods: lost, lostStored: stored, exp: e, tasks, campaignCleared: cleared,
      time: Math.round(D.t), kills: D.stats.kills, boxes: D.stats.boxes, luaErrors: VD.lua.errors.slice(),
    };
  }

  function showResult(res) {
    const ui = document.getElementById('ui') || document.body;
    const el = document.createElement('div');
    el.className = 'vd-result';
    const icons = list => list.map(g => `<div class="vd-cell ${'g-' + String(VD.goods.grade(g)).toLowerCase()}"><img src="${VD.goods.icon(g)}">${g.count > 1 ? `<span class="n">${g.count}</span>` : ''}</div>`).join('') || '<i>—</i>';
    el.innerHTML = `
      <div class="box">
        <h2>${TX('UStageResultPopup_Title_TitleText') || 'Kết Quả Lặn'}</h2>
        <div class="verdict ${res.escaped ? 'ok' : 'fail'}">${res.escaped ? (TX('UStageResultPlayerInfo_EscapeSuccess_Text') || 'Thoát Thành Công') : (TX('UStageResultPlayerInfo_EscapeFail_Text') || 'Thu Hồi Khẩn Cấp')}</div>
        <div class="camp">${TX('TCampaign_Name_' + res.campaignId) || ''} · ${TX('EDifficulty_' + res.difficulty) || res.difficulty}</div>
        <h3>${TX('UStageResultPopup_HorizGroup_QuestObjectivesText') || 'Mục Tiêu Nhiệm Vụ'}</h3>
        <ul>${res.tasks.map(t => `<li class="${t.done ? 'done' : ''}">${t.done ? '◆' : '◇'} ${t.text}${t.goal > 1 ? ` ${Math.min(t.cur, t.goal)}/${t.goal}` : ''}</li>`).join('') || '<li>—</li>'}</ul>
        <h3>${TX('UStageResultPopup_HorizGroup_MainLootText') || 'Thu Hoạch Chính'}</h3><div class="grid">${icons(res.loot)}</div>
        ${res.lostGoods.length ? `<h3>${TX('UStageResultPopup_HorizGroup_LostGoodsText') || 'Đồ Thất Lạc'}</h3><div class="grid">${icons(res.lostGoods)}</div>` : ''}
        <h3>${TX('UStageResultPopup_HorizGroup_ExpText') || 'Kinh nghiệm'}</h3>
        <table>
          <tr><td>${TX('UStageResultPlayerExpSlot_ExpMonsterKill_Title') || 'Quái'}</td><td>${res.exp.monster}</td></tr>
          <tr><td>${TX('UStageResultPlayerExpSlot_ExpRewardBox_Title') || 'Rương'}</td><td>${res.exp.box}</td></tr>
          <tr><td>${TX('UStageResultPlayerExpSlot_ExpEscape_Title') || 'Thoát'}</td><td>${res.exp.escape}</td></tr>
          <tr><td>${TX('UStageResultPlayerExpSlot_ExpDifficulty_Title') || 'Độ khó'}</td><td>×${res.exp.percent}%</td></tr>
          <tr class="sum"><td></td><td>+${res.exp.total}</td></tr>
        </table>
        <div class="any">${TX('UStageResultPopup_Bottom_PressAnyKey') || 'Nhấn phím bất kỳ'}</div>
      </div>`;
    ui.appendChild(el);
    return new Promise(res2 => {
      const t0 = performance.now();
      const go = () => { if (performance.now() - t0 < 600) return; removeEventListener('keydown', go); el.removeEventListener('pointerdown', go); el.remove(); res2(); };
      addEventListener('keydown', go); el.addEventListener('pointerdown', go);
      D.dismissResult = () => { removeEventListener('keydown', go); el.remove(); res2(); };
    });
  }

  function cleanup() {
    for (const e of D.ents.slice()) removeEnt(e);
    for (const f of D.fields.slice()) removeField(f);
    for (const a of D.arrows.values()) a.el.remove();
    D.arrows.clear();
    for (const e of D.ents) if (e.vis) e.vis.dispose();
    VD.objects.clear();
    if (VD.tutorial) VD.tutorial.clear();
    if (VD.minimap) VD.minimap.clear();
    if (P.el) P.el.style.display = 'none';
    VD.stage.onUnitEvent = null;
    VD.inventory.onDrop = null;
    VD.stage.end();
    VD.world.unload(VD.render.scene);
    try { VD.lua.run('__co = {}'); } catch (e) { /* bỏ coroutine cũ */ }
    VD.audio.stopBgm(1);
    if (VD.hud) VD.hud.show(false);
    D.state = 'idle';
  }

  // ================================================================ khung
  function update(dt) {
    if (D.state === 'idle' || D.state === 'loading') return;
    D.t += dt;
    for (let i = D.later.length - 1; i >= 0; i--) if (D.t >= D.later[i].t) { const l = D.later.splice(i, 1)[0]; l.fn(); }
    VD.stage.update(dt);
    flushLua();
    if (VD.lua.state) VD.lua.tick();
    if (D.state === 'intro') { if (D.t >= D.introEnd) enterPlay(); return; }
    if (D.state === 'play') {
      if (VD.input.pressed.Minimap && VD.minimap) VD.minimap.toggleBig();
      VD.inventory.step(dt);
      rulesTick(dt);
      worldTick(dt);
      fieldTick(dt);
      interactTick(dt);
      taskTick();
      bgmTick(dt);
      cutsceneTick(dt);
      visTick();
    } else if (D.state === 'escaping' || D.state === 'dead') {
      if (D.t >= D.endAt) toResult();
    }
  }
  // Inventory mở thì input tắt: Tab/Esc đọc thẳng từ DOM (phím trong bảng — F dùng, R xếp, N đánh dấu, 1–5 — ở inventory.js).
  addEventListener('keydown', e => {
    if (D.state !== 'play') return;
    // Tab mở/đóng túi ngay trên sự kiện DOM (input.enabled tắt khi túi mở nên không đọc qua VD.input được).
    if (e.code === 'Tab' && !e.repeat) { e.preventDefault(); if (VD.inventory.open || (VD.input.enabled !== false && !D.cutscene)) VD.inventory.toggle(); }
    else if (VD.inventory.open && e.code === 'Escape') { e.preventDefault(); VD.inventory.toggle(false); }
  });

  function render(dt) {
    if (D.state === 'idle' || D.state === 'loading') return;
    const pl = VD.stage.player;
    if (!pl) return;
    VD.render.follow(D.camTarget || pl.pos, dt);
    const face = pl.aim ? Math.atan2(pl.aim.z, pl.aim.x) : 0;
    // LightFuel = 0: tầm nhìn còn Const.BlindSightRange (1 m) quanh người.
    // Cutscene: vùng sáng tròn quanh điểm diễn (không có Timeline gốc; bán kính 6 m — không có trong bảng).
    if (D.cutscene) VD.render.setSight(D.cutscene.pos.x, D.cutscene.pos.z, face, 360, 6, 6);
    else if (D.dark) VD.render.setSight(pl.pos.x, pl.pos.z, face, pl.row.SightAngle || 120, C('BlindSightRange', 1), C('BlindSightRange', 1));
    else VD.render.setSight(pl.pos.x, pl.pos.z, face, pl.row.SightAngle || 120, pl.row.SightRange || 5, pl.row.SightBackRange || 1);
    VD.world.updateCutoff(VD.render.camera.position, pl.pos.x, pl.pos.z);
    VD.audio.setListener(pl.pos);
    VD.stage.render(dt);
    VD.objects.update(dt, VD.render.camera);
    for (const e of D.ents) if (e.vis) { e.vis.update(dt, VD.render.camera); }
    if (VD.hud && VD.hud.update && D.hudOn) VD.hud.update(dt);
    VD.inventory.updateHud();
    if (VD.minimap && D.hudOn) VD.minimap.update(dt);
    arrowsRender();
    if (VD.postfx) VD.postfx.update(dt);
    VD.render.draw(dt, VD.loop.time);
  }

  function enterPlay() {
    D.state = 'play';
    document.body.classList.remove('vd-intro');
    const intro = document.querySelector('.vd-introcard'); if (intro) intro.classList.add('out');
    setTimeout(() => { const i = document.querySelector('.vd-introcard'); if (i) i.remove(); }, 900);
    if (VD.input) VD.input.enabled = true;
    luaCall('Campaign/' + D.camp.Id, 'OnStage');
    for (const k of luaKeys().slice(1)) luaCall(k, 'OnStage');
  }

  async function toResult() {
    if (D.state === 'result') return;
    D.state = 'result';
    const res = buildResult();
    D.result = res;
    document.body.dataset.diveResult = res.escaped ? 'escaped' : 'dead';
    await showResult(res);
    cleanup();
    for (const f of D.finishers) { try { f(res); } catch (e) { console.error(e); } }
    if (resolveStart) { const r = resolveStart; resolveStart = null; r(res); }
  }

  // ================================================================ bắt đầu
  // opts: { campaignId, characterId, loadout, difficulty, seed, inventory: {goods:[GoodsData], quick:[6], safe:[], bags:[]} }
  D.start = async function (opts) {
    opts = opts || {};
    if (D.state !== 'idle') cleanup();
    const camp = rowOf('Campaign', +opts.campaignId);
    if (!camp) throw new Error('không có Campaign ' + opts.campaignId);
    VD.profile.load();
    Object.assign(D, {
      camp, char: +opts.characterId || 100001, diffName: opts.difficulty || 'Normal', seed: opts.seed || ((Date.now() & 0x7fffffff) || 1),
      t: 0, ents: [], mons: [], dormant: [], fields: [], waves: [], later: [], zonePoints: [], zoneSpawns: {}, spotLights: [],
      luaQueue: [], triggerable: {}, triggerableWE: {}, arrows: new Map(), progress: {}, temp: { s: {}, i: {}, b: {}, f: {} },
      stats: { kills: 0, bossKills: 0, boxes: 0, shadows: 0 }, hpLostAcc: 0, lightT: 0, corrT: 0, dark: false, stressSt: null,
      stressTickNext: 0, shadowNext: 1e9, intervalNext: Infinity, calmT: 99, bgmOverride: null, cutscene: null, camTarget: null,
      hudOn: true, result: null, missing: new Set(), _eid: 0, holdT: 0, focus: null, endExtra: {}, _questShown: false,
      stressOn: [], darkOn: [], corrOn: [],
    });
    D.rng = VD.rng(D.seed);
    D.state = 'loading';
    document.body.dataset.ready = '';
    document.body.dataset.diveState = 'loading';
    showLoading(true);
    if (!VD.lua.state) VD.lua.init();
    if (D.trace !== false) { D.trace = VD.lua.trace = VD.lua.trace || []; }
    installApi();
    // ---- map
    const lay = assemble(camp, D.rng);
    D.cells = lay.cells; D.play = lay.play;
    await VD.world.load(lay.cells.map(c => ({ cx: c.cx, cy: c.cy, id: c.id, rot: c.rot })), lay.size, VD.render.scene);
    collectSectors();
    // Bảng hướng dẫn trên sàn (StaticDecoration/TutorialGuides của prefab sector 10009/10001/10004).
    if (VD.tutorial) await VD.tutorial.build(VD.world.sectors, VD.render.scene);
    // ---- sân khấu + người chơi
    const S = VD.stage;
    S.begin({ mode: 'dive', difficulty: D.diffName, seed: D.seed });
    S.onUnitEvent = onUnitEvent;
    const prefabs = ['WaveExit', 'SafeExit'].concat((T().RewardBox || []).map(r => r.PrefabName), (T().Entrance || []).map(r => r.PrefabName),
      (T().BreakableProp || []).map(r => r.PrefabName), (T().ZoneSpawn || []).flatMap(z => (z.SpawnDatas || []).map(s => s.PrefabName).filter(Boolean)));
    await preloadPrefabs(prefabs);
    D.prefabFields = D.prefabFields || {};
    VD.inventory.onDrop = g => spawnDrop(g, VD.stage.player.pos);
    // ---- điểm xuất phát: ZonePoint PlayerSpawn; không có thì ZonePoint Outside chưa dùng xa lối thoát nhất. [SUY LUẬN]
    const ps = D.zonePoints.find(p => p.flags.indexOf('PlayerSpawn') >= 0);
    if (ps) { ps.used = true; D.start = ps.pos; }
    placeZoneSpawns(camp.ZoneSpawnIds);
    if (!ps) {
      const exits = D.ents.filter(e => e.kind === 'exit');
      const cand = D.zonePoints.filter(p => !p.used && p.flags.indexOf('Outside') >= 0 && p.pos.z <= D.play.maxZ && p.pos.z >= D.play.minZ);
      const score = p => exits.length ? Math.min(...exits.map(e => dist(e.pos, p.pos))) : 0;
      const pick = cand.length ? cand.map(p => ({ p, s: score(p) + D.rng() * 10 })).sort((a, b) => b.s - a.s)[0].p : null;
      if (pick) pick.used = true;
      D.start = pick ? pick.pos : { x: (D.play.minX + D.play.maxX) / 2, z: (D.play.minZ + D.play.maxZ) / 2 };
    }
    D.start = freeNear(D.start.x, D.start.z, 0.3);
    D.startSec = sectorAt(D.start.x, D.start.z);
    const loadoutEquip = (opts.loadout && opts.loadout.equipmentIds) || [];
    const pl = S.spawn({ kind: 'char', id: D.char, pos: D.start, aim: { x: -Math.SQRT1_2, z: -Math.SQRT1_2 }, weaponId: opts.loadout && opts.loadout.weaponId, equipmentIds: loadoutEquip });
    S.setPlayer(pl, opts.loadout && opts.loadout.skills);
    VD.player = pl;
    pl.light = C('LightFuelDefault', 100);
    D.darkIds = darkBuffs();
    // Passive 10000000 gắn buff tối ngay khi khởi tạo (AddPassiveSkillTrigger); đèn còn thì gỡ.
    for (const b of D.darkIds) if (pl.buffs.get(b)) pl.buffs.remove(S.A, b, null, 'light');
    // ---- dị thường (Campaign.AnomalyType/IsFixedAnomaly → Anomaly.csv)
    let anom = null;
    if (camp.IsFixedAnomaly) anom = (T().Anomaly || []).find(a => a.Type === camp.AnomalyType);
    else anom = D.rng.weighted(T().Anomaly || [], a => a.Weight || 0);
    D.anomaly = anom && anom.Type !== 'None' ? anom : null;
    if (D.anomaly) {
      for (const b of D.anomaly.PlayerBuffIds || []) if (db().buff(b)) pl.buffs.add(S.A, b, 1, pl); else D.missing.add('Buff ' + b);
      if (D.anomaly.AmbientSfx) sfx(D.anomaly.AmbientSfx, { loop: true, key: 'anomaly' });
    }
    for (const pid of VD.profile.get().paradox) applyParadox(pid);
    D.boundRow = rowOf('SpecialField', camp.BoundarySpecialFieldId);
    // ---- túi
    const inv = opts.inventory || {};
    VD.inventory.reset({ goods: inv.goods || [], quick: inv.quick || VD.profile.get().quick, safe: inv.safe || VD.profile.get().safe, bags: inv.bags || [], equip: opts.loadout || null });
    VD.inventory.bindHudClicks && VD.inventory.bindHudClicks();
    // ---- nội dung
    setupTasks();
    spawnSectors();
    if (VD.minimap) await VD.minimap.setup(VD.world, D.cells, D.play);
    for (const z of Object.values(D.zoneSpawns)) for (const e of z.ents) if (e && e.kind === 'exit' && e.row.DisplayOnMinimapAtStart && VD.minimap) { e.marked = true; VD.minimap.mark(e.id, 'exit', e.pos); }
    VD.render.snap(pl.pos);
    VD.hud.show(true);
    VD.inventory.renderHud();
    visTick();
    // ---- vòng lặp
    VD.loop.update = update;
    VD.loop.render = render;
    VD.loop.start();
    const waitVis = () => S.pending > 0 ? new Promise(r => setTimeout(r, 60)).then(waitVis) : null;
    await Promise.race([waitVis(), new Promise(r => setTimeout(r, 20000))]);
    showLoading(false);
    // ---- mở màn: thẻ tên campaign 2 s rồi vào play (OnStage)
    D.state = 'intro'; D.introEnd = D.t + 2.0;
    document.body.dataset.diveState = 'intro';
    showIntro();
    if (VD.input) { VD.input.enabled = false; VD.input.clear(); }
    document.body.dataset.ready = '1';
    return new Promise(res => { resolveStart = res; });
  };
  D.onFinish = f => { D.finishers.push(f); };

  function showLoading(on) {
    let el = document.querySelector('.vd-loading');
    if (on && !el) {
      el = document.createElement('div'); el.className = 'vd-loading';
      const tips = T().LoadingText || [];
      const tip = tips.length ? tips[Math.floor(Math.random() * tips.length)] : null;
      const key = tip && Object.keys(tip).find(k => /Text|Desc/.test(k) && typeof tip[k] === 'string');
      el.innerHTML = '<div class="spin"></div><div class="tip"></div>';
      el.querySelector('.tip').textContent = (tip && (TX('TLoadingText_Desc_' + tip.Id) || TX('TLoadingText_Text_' + tip.Id) || (key && tip[key]))) || '';
      (document.getElementById('ui') || document.body).appendChild(el);
    }
    if (!on && el) el.remove();
  }
  function showIntro() {
    const el = document.createElement('div'); el.className = 'vd-introcard';
    el.innerHTML = `<div class="sec">${TX('TCampaign_SectorName_' + D.camp.Id) || ''}</div><div class="name">${TX('TCampaign_Name_' + D.camp.Id) || ''}</div><div class="desc">${(TX('TCampaign_Desc_' + D.camp.Id) || '').replace(/<[^>]+>/g, '')}</div>`;
    (document.getElementById('ui') || document.body).appendChild(el);
    document.body.classList.add('vd-intro');
  }

  // ================================================================ tiện cho kiểm thử / gỡ lỗi
  D.debug = {
    ents: () => D.ents,
    find: kind => D.ents.filter(e => e.kind === kind),
    teleport(x, z) { const u = VD.stage.player; const p = freeNear(x, z, 0.3); u.pos.x = p.x; u.pos.z = p.z; VD.render.snap(u.pos); visTick(); return p; },
    use(e) { use(e); },
    interactables,
    stressState: () => stressState(),
    skipIntro() { if (D.state === 'intro') D.introEnd = D.t; },
    dismissResult() { if (D.dismissResult) D.dismissResult(); },
    zone: id => D.zoneSpawns[id],
    missing: () => Array.from(D.missing),
    rollGroup,
  };

  VD.dive = D;
})(window.VD = window.VD || {});
