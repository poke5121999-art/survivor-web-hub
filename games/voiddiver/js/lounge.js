// Sảnh Balusha: sector 9001 (Const.LoungeStageId) + 9003 (phòng tập), camera nội thất theo Area.CameraPos, NPC theo
// Sector.NpcSpawnDatas (hình: prefab gốc remote_prefab_assets_object/<NpcId> → data/npcs.js), bốt điện thoại để lặn,
// LuaApi phía sảnh (NPC, LoungeQuest, hội thoại theo NPC, kho, ví), máy trạng thái LoungeQuest theo LoungeQuest/LoungeQuestTask.
// Toạ độ Lua ở sảnh = toạ độ Unity thế giới: sector 9001 đặt ở ô (0, 1) nên z_lua = z_sector + 30. [SUY LUẬN, docs/LOUNGE.md §1]
(function (VD) {
  'use strict';
  const THREE = window.THREE;
  const TX = k => (VD.TEXT && VD.TEXT[k]) || '';
  const $ = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
  const T = () => VD.T || {};
  const P = () => VD.profile;
  const C = (n, d) => VD.combatDB().c(n, d);
  const num = x => { const n = parseFloat(x); return isFinite(n) ? n : 0; };

  // 9001 = sảnh (Const.LoungeStageId); 9003 = phòng huấn luyện (Area 3, bù nhìn 8200xx), chỉ nạp khi Area 3 đã mở (InteriorShop "Area:3").
  const layout = () => [{ cx: 0, cy: 1, id: 9001, rot: 0 }].concat(P().areaOpen(3) ? [{ cx: 0, cy: 0, id: 9003, rot: 0 }] : []);
  // Tầm bấm F quanh NPC. Không có trong bảng: CapsuleCollider của prefab NPC (r 0,5–1,75) + tầm tay ~1 m.
  const REACH = 1.6;
  // Độ cao nhãn tên trên NPC. Không có trong bảng: Canvas Hud của prefab đặt ở gốc, UI tự đẩy theo bounds Spine.
  const TAG_Y = 1.55;

  const L = {
    state: 'idle', npcs: new Map(), arrows: new Map(), booth: null, boothPos: null, area: null, camTarget: new THREE.Vector3(),
    hud: null, luaQueue: [], temp: { s: {}, i: {}, b: {}, f: {} }, restored: false, focus: null, trace: [], decor: [],
    bubbles: [], saved: null, hudOn: true,
  };

  // ================================================================ toạ độ
  const toLua = p => ({ x: p.x, y: 0, z: -p.z });
  const fromLua = t => { const f = k => num(VD.lua.field(t, k)); return { x: f('x'), z: -f('z') }; };
  const sec9001 = () => VD.world.sectors.find(s => s.cell.id === 9001);
  function secPoint(id, s) {
    const sec = VD.world.sectors.find(x => x.cell.id === id);
    const p = String(s || '0:0:0').split(':').map(Number);
    const [x, z] = VD.world.sectorPoint(sec, p[0] || 0, p[2] || 0);
    return { x, z };
  }
  function freeNear(x, z, r) {
    for (let rad = 0; rad < 6; rad += 0.25)
      for (let a = 0; a < 16; a++) {
        const px = x + Math.cos(a / 16 * 6.283) * rad, pz = z + Math.sin(a / 16 * 6.283) * rad;
        if (!VD.world.overlapsMove(px, pz, r)) return { x: px, z: pz };
      }
    return { x, z };
  }

  // ================================================================ đánh nhau trong sảnh
  // [ĐO] Sảnh không chặn skill (CharacterIdleState.GetNextStateEvent nhận UseSkillEvent bất kể IsInLounge). UnitModel.IsNonCombat =
  // IsInLounge && không có buff hiệu ứng TrainingRoom (68): khi đó không mất máu (UnitController.CalculateDamage trả 0), không tốn
  // thể lực / căng thẳng, không hồi máu, không nạp tối thượng, anim default/* (CharacterView, UnitSkillState.GetAnimationName).
  // Buff TrainingRoom 62100003 chỉ có trong SpecialField 5001 "TrainingField" của phòng tập 9003 (Sector.SpecialFieldSpawnGroupDatas,
  // hộp Scale x×z), nơi có bù nhìn 8200xx (Sector.MonsterSpawnGroupDatas). Sảnh chính 9001 không có bù nhìn.
  function trainingFields() {
    const out = [];
    for (const sec of VD.world.sectors) {
      const r = T().Sector.find(s => s.Id === sec.cell.id);
      for (const g of (r && r.SpecialFieldSpawnGroupDatas) || []) for (const sd of g.SpawnDatas || []) {
        const f = (T().SpecialField || []).find(x => x.Id === sd.SpecialFieldId);
        if (!f || f.CharacterBuffId !== 62100003) continue;
        const sc = String(sd.Scale || '1:1:1').split(':').map(Number), c = secPoint(sec.cell.id, sd.SpawnPosition);
        out.push({ x: c.x, z: c.z, hx: (sc[0] || 1) / 2, hz: (sc[2] || 1) / 2 });
      }
    }
    return out;
  }
  const inTraining = p => (L.training || []).some(f => Math.abs(p.x - f.x) <= f.hx && Math.abs(p.z - f.z) <= f.hz);
  function spawnTrainingDummies() {
    for (const sec of VD.world.sectors) {
      if (sec.cell.id === 9001) continue;
      const r = T().Sector.find(s => s.Id === sec.cell.id);
      for (const g of (r && r.MonsterSpawnGroupDatas) || []) for (const sd of g.SpawnDatas || []) {
        if (!(sd.MonsterId > 0)) continue;
        const pos = secPoint(sec.cell.id, sd.SpawnPosition), at = sd.UseFixedAimPos ? secPoint(sec.cell.id, sd.FixedAimPos) : null;
        const d = at ? Math.hypot(at.x - pos.x, at.z - pos.z) : 0;
        const u = VD.stage.spawn({ kind: 'mon', id: sd.MonsterId, pos, aim: d > 1e-4 ? { x: (at.x - pos.x) / d, z: (at.z - pos.z) / d } : { x: 0, z: 1 } });
        u.nonCombat = !inTraining(pos);
      }
    }
  }
  // Nhân vật của hồ sơ với đồ đang mặc (chỉ số), skin vũ khí, talent (passive AddSkill + TalentConditionList) — như toDive.
  L.spawnPlayer = function (pos, aim, old) {
    const S = VD.stage, P_ = P(), p = P_.get();
    const charId = p.unlockedChars.indexOf(p.character) >= 0 ? p.character : 100001;
    const eq = VD.app.equipOf(charId), tal = {};
    for (const k of Object.keys(p.talents || {})) if (p.talents[k]) tal[k] = true;
    S.charExtras = { talents: tal, skills: P_.talentSkills() };
    let u;
    try { u = S.spawn({ kind: 'char', id: charId, pos, aim, weaponId: eq.weaponId, equipmentIds: eq.equipmentIds, skins: VD.app.skinsOf(charId, eq.weaponId) }); }
    finally { S.charExtras = null; }
    if (old) { S.remove(old); u.stress = old.stress; }
    u.nonCombat = !inTraining(u.pos);
    L.playerSig = VD.app.loungeSig();
    return u;
  };
  function combatTick() {
    const S = VD.stage;
    for (const u of S.units) if (u.kind === 'char') u.nonCombat = !inTraining(u.pos);
    // Đồ / nhân vật / talent đổi ở bảng nào cũng áp ngay lên người (VD.app.refreshLoungePlayer).
    if (S.player && VD.app.loungeSig() !== L.playerSig) VD.app.refreshLoungePlayer();
  }
  // HUD người chơi như lúc lặn (ảnh Steam sảnh: pin đèn, máu, căng thẳng, dãy skill, 6 ô đồ, bản đồ nhỏ, "Hướng dẫn [O]").
  // Ô đồ: Profile.quick, số = tổng trong túi mang theo; bấm 1–5 ở sảnh không dùng (CharacterController.OnInputUseItem xét IsInLounge).
  function paintQuick() {
    const els = VD.hud && VD.hud.itemEls; if (!els) return;
    const p = P().get();
    els.forEach((el, k) => {
      const id = (p.quick || [])[k], img = el.querySelector('img'), n = el.querySelector('span');
      if (!id) { img.removeAttribute('src'); img.style.visibility = 'hidden'; n.textContent = ''; el.classList.add('empty'); return; }
      const src = VD.goods.icon({ type: 'Item', id });
      if (img.dataset.src !== src) { img.src = src; img.dataset.src = src; }
      img.style.visibility = '';
      let c = 0; for (const g of p.pack || []) if (g.type === 'Item' && +g.id === +id) c += g.count || 1;
      n.textContent = c; el.classList.toggle('empty', c <= 0);
    });
  }
  function combatHud(on) {
    if (VD.hud) { VD.hud.show(on); if (on) { VD.hud.setBoss(null); VD.hud.setQuest(null); paintQuick(); } }
    if (!VD.minimap) return;
    if (!on) { VD.minimap.clear(); return; }
    VD.minimap.setup(VD.world, layout(), null).then(() => { VD.minimap.revealAll(); for (const n of L.npcs.values()) VD.minimap.mark('npc' + n.id, 'npc', () => n.pos); });
  }
  L.combatHud = combatHud;

  // Tab ở sảnh: sảnh gốc cũng là InGameScene nên OnInventoryClick mở MenuPopup trang Túi đồ, bố cục
  // IsInLounge ? InventoryStash : InventoryOnly — túi, khe an toàn, trang bị bên trái, kho bên phải. [ĐO — tools/ui_inventory_il2cpp.py]
  // inventory.js nạp bản sao hồ sơ khi mở, đóng bảng thì ghi ngược pack/safe/quick/stash/equip của nhân vật đang chọn.
  function openInventory() {
    const I = VD.inventory, p = P().get(), id = p.character;
    const copy = a => (a || []).map(g => JSON.parse(JSON.stringify(g)));
    const eq = VD.app.equipOf(id), sub = ((p.equip || {})[id] || {}).sub || 0;
    I.reset({
      pack: copy(p.pack), safe: copy(p.safe), quick: p.quick, lounge: true,
      slots: C('CharacterInventorySlotCount', 23) + P().talentSum('InventorySlotCount'),
      equip: { weaponId: eq.weaponId, equipmentIds: eq.equipmentIds, subWeaponId: sub },
      onClose: () => {
        const goods = slots => slots.filter(s => s.g).map(s => s.g);
        p.pack = goods(I.slots); p.safe = goods(I.safe); p.quick = I.quick.slice();
        if (I.loot && I.loot.stash) p.stash = goods(I.loot.slots);
        const gi = I.gearIds();
        p.equip = p.equip || {};
        p.equip[id] = Object.assign({}, p.equip[id], { weapon: gi.weapon, sub: gi.sub, acc: gi.acc, art: gi.art });
        P().save();
        paintQuick();
        L.markDirty();
      },
    });
    I.openLoot({ stash: true, title: TX('Stash') || 'Kho chứa', items: copy(p.stash), slots: P().stashSlots() });
  }
  const panelOpen = () => (VD.dialog && VD.dialog.open) || (VD.npc && VD.npc.isOpen()) || (VD.ui && VD.ui.isOpen()) || (VD.inventory && VD.inventory.open);
  addEventListener('keydown', e => {
    if (L.state !== 'play') return;
    const I = VD.inventory;
    if (e.code === 'Tab') {
      e.preventDefault();
      if (e.repeat) return;
      if (I.open) I.toggle(false);
      else if (!panelOpen() && VD.input.enabled !== false) openInventory();
    } else if (I.open && e.code === 'Escape') { e.preventDefault(); if (!I.escape()) I.toggle(false); }
  });

  // ================================================================ vào / rời sảnh
  L.enter = async function (opts) {
    opts = opts || {};
    if (L.state !== 'idle') L.leave();
    L.state = 'loading';
    document.body.dataset.ready = '';
    document.body.dataset.lounge = 'loading';
    showLoading(true);
    const p = P().load();
    if (!VD.lua.state) VD.lua.init();
    installApi();
    // ---- hình
    await VD.world.load(layout(), [1, 3], VD.render.scene);
    let b = null;
    for (const s of VD.world.sectors) {
      const bb = s.json.bounds; if (!bb) continue;
      const [x0, z0] = s.xf.pt(bb.min[0], bb.min[2]), [x1, z1] = s.xf.pt(bb.max[0], bb.max[2]);
      const r = { minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1) };
      b = b ? { minX: Math.min(b.minX, r.minX), maxX: Math.max(b.maxX, r.maxX), minZ: Math.min(b.minZ, r.minZ), maxZ: Math.max(b.maxZ, r.maxZ) } : r;
    }
    if (b) Object.assign(VD.world, b);
    renderSettings(true);
    const S = VD.stage;
    S.begin({ mode: 'lounge', difficulty: 'Normal', seed: 1 });
    // ---- người chơi: ZonePoint Outside đầu tiên của 9001 (điểm vào sảnh)
    const row = T().Sector.find(s => s.Id === 9001);
    const zp = (row.ZonePointDatas || [])[0];
    const start = freeNear(...Object.values(secPoint(9001, zp ? zp.Position : '13.5:0:15')), 0.3);
    L.start = start;
    L.training = trainingFields();
    const pl = L.spawnPlayer(start, { x: -Math.SQRT1_2, z: -Math.SQRT1_2 });
    S.setPlayer(pl, VD.app.skillLoadout(pl.id));
    VD.player = pl;
    spawnTrainingDummies();
    // ---- đồ trong sảnh
    spawnDecor();
    spawnSectorNpcs();
    spawnGuests(row);
    spawnBooth(row);
    buildHud();
    combatHud(true);
    L.pickArea(true);
    // ---- vòng lặp
    VD.loop.update = update;
    VD.loop.render = render;
    VD.loop.start();
    const waitVis = () => S.pending > 0 ? new Promise(r => setTimeout(r, 60)).then(waitVis) : null;
    await Promise.race([waitVis(), new Promise(r => setTimeout(r, 20000))]);
    showLoading(false);
    L.state = 'play';
    VD.input.enabled = true; VD.input.clear();
    playLoungeBgm();
    // ---- Lua: khôi phục trạng thái quest (lần đầu mỗi phiên), mở khoá quest mới, OnLounge
    if (!L.restored) { L.restored = true; for (const q of T().LoungeQuest || []) { const st = p.loungeQuest[q.Id] | 0; if (st >= 1 && st <= 3) queueEvent('LoungeQuest/' + q.Id, VD.lua.EV.LoungeQuestStateChanged, st); } }
    L.questTick();
    queueCall(campaignKey(), 'OnLounge');
    for (const k of activeQuestKeys()) queueCall(k, 'OnLounge');
    document.body.dataset.lounge = 'play';
    document.body.dataset.ready = '1';
    if (opts.fromDive && L.onReturn) L.onReturn(opts.fromDive);
  };

  L.leave = function () {
    if (L.state === 'idle') return;
    L.state = 'idle';
    if (VD.npc && VD.npc.close) VD.npc.close();
    if (VD.ui && VD.ui.closeAll) VD.ui.closeAll();
    if (VD.inventory.open) VD.inventory.toggle(false);
    for (const n of L.npcs.values()) removeNpc(n);
    L.npcs.clear();
    for (const a of L.arrows.values()) a.el.remove();
    L.arrows.clear();
    if (VD.groundNav) VD.groundNav.remove();
    for (const d of L.decor) d.dispose();
    L.decor = [];
    for (const bb of L.bubbles) bb.el.remove();
    L.bubbles = [];
    if (L.booth && VD.objects) VD.objects.remove(L.booth);
    L.booth = null;
    if (L.hud) { L.hud.remove(); L.hud = null; }
    combatHud(false);
    VD.stage.end();
    VD.world.unload(VD.render.scene);
    renderSettings(false);
    try { VD.lua.run('__co = {}'); } catch (e) { /* bỏ coroutine của sảnh */ }
    L.luaQueue.length = 0;
    document.body.dataset.lounge = '';
  };

  // Theme Lounge (VolumeProfile_Theme_Lounge): postExposure −0,25, contrast 20, saturation −10, ánh sáng chính (0,77; 0,83; 1,0) × 0,2.
  // Camera = PlayerVCamTemplate FOV 10° như lúc lặn (xem L.pickArea). Không có nón đèn pin trong sảnh. [ĐO: ASSETS.md §3, §4.1]
  function renderSettings(on) {
    const R = VD.render, pf = VD.postfx && VD.postfx.params;
    if (on) {
      L.saved = { fov: R.fov, sight: R.sight.uSightOn.value, amb: R.ambient.intensity, ambC: R.ambient.color.clone(), sun: R.sun.intensity, sunC: R.sun.color.clone(),
        pf: pf ? { contrast: pf.contrast, saturation: pf.saturation, exposure: pf.exposure, stress: pf.stress, lowHp: pf.lowHp, vignette: pf.vignette } : null };
      R.setView({ fov: 10 });
      R.sight.uSightOn.value = 0;
      R.sun.color.setRGB(0.77, 0.83, 1.0); R.sun.intensity = 0.2 * 3;
      R.ambient.color.setRGB(0.95, 0.86, 0.74); R.ambient.intensity = 0.95;   // không có trong bảng: chỉnh bằng mắt theo ảnh Steam ss05
      if (pf) Object.assign(pf, { contrast: 20, saturation: -10, exposure: -0.25, stress: 0, lowHp: 0, vignette: 0 });
    } else if (L.saved) {
      const s = L.saved;
      R.setView({ fov: s.fov || 10 });
      R.sight.uSightOn.value = s.sight;
      R.ambient.intensity = s.amb; R.ambient.color.copy(s.ambC); R.sun.intensity = s.sun; R.sun.color.copy(s.sunC);
      if (pf && s.pf) Object.assign(pf, s.pf);
      L.saved = null;
    }
  }

  function showLoading(on) {
    let el = document.querySelector('.vd-loading');
    if (on && !el) {
      el = $('div', 'vd-loading', document.getElementById('ui'), '<div class="spin"></div><div class="tip"></div>');
      const tips = T().LoadingText || [];
      const tip = tips.length ? tips[Math.floor(Math.random() * tips.length)] : null;
      el.querySelector('.tip').textContent = tip ? (TX('TLoadingText_Desc_' + tip.Id) || TX('TLoadingText_Text_' + tip.Id) || '') : '';
    }
    if (!on && el) el.remove();
  }

  function playLoungeBgm() {
    const id = P().get().loungeBgm;
    const r = (T().LoungeBgm || []).find(x => x.Id === id);
    VD.app.bgm(r && VD.ASSETS.bgm[r.Bgm] ? r.Bgm : 'Lounge', 1.2);
  }
  L.playLoungeBgm = playLoungeBgm;

  // ================================================================ trang trí (Spine World_* đặt tay trong sector)
  // Anim mặc định: World_Cat "SE/sit_2" (ASSETS.md §2.2); còn lại lấy anim đầu tiên. LoungeBG scale 4,35. Spine trang trí đứng thẳng,
  // không billboard (yaw đơn vị trong prefab). [ĐO: ASSETS.md §1.3 và §2.2]
  const DECOR_ANIM = { World_Cat: 'SE/sit_2' };
  const DECOR_SCALE = { World_LoungeBG: 4.35 };
  function spawnDecor() {
    for (const sec of VD.world.sectors) for (const s of sec.json.spines || []) {
      if (s.active === false) continue;
      const name = String(s.skeleton || '').replace(/_SkeletonData$/, '');
      if (!/^World_/.test(name) || name === 'World_PhoneBooth') continue;
      VD.loadSpine(name).then(bundle => {
        if (L.state === 'idle') return;
        const key = Object.keys(bundle.dirs)[0], d = bundle.dirs[key];
        const m = new window.spine.SkeletonMesh(d.data, mat => { mat.depthTest = true; mat.depthWrite = true; mat.alphaTest = 0.1; });
        m.state = new window.spine.AnimationState(d.stateData);
        const anim = DECOR_ANIM[name] && d.data.findAnimation(DECOR_ANIM[name]) ? DECOR_ANIM[name] : (d.data.animations[0] && d.data.animations[0].name);
        if (anim) m.state.setAnimation(0, anim, true);
        const g = new THREE.Group();
        const [x, z] = sec.xf.pt(s.pos[0], s.pos[2]);
        g.position.set(x, s.pos[1], z);
        const sc = DECOR_SCALE[name] || 1;
        g.scale.set(sc, sc, sc);
        // Mặt Spine hướng về camera quanh trục đứng (camera yaw 315°: nhìn theo (−1, 0, −1) trong three).
        g.rotation.y = Math.PI / 4;
        g.add(m);
        VD.render.scene.add(g);
        L.decor.push({ g, m, dispose() { if (g.parent) g.parent.remove(g); } });
      }).catch(e => console.warn('[lounge] decor ' + name + ': ' + (e.message || e)));
    }
  }

  // ================================================================ NPC
  // n = { id, pos, row, vis, anchor, tag, nav, state, dynamic }
  function npcRow(id) { return (T().Npc || []).find(r => r.Id === id) || null; }
  function npcUnlocked(id) { const r = npcRow(id); return !r || P().condsOk(r.UnlockConditions); }
  function spawnSectorNpcs() {
    const row = T().Sector.find(s => s.Id === 9001);
    for (const sp of row.NpcSpawnDatas || []) {
      if (!npcUnlocked(sp.NpcId)) continue;
      addNpc(sp.NpcId, secPoint(9001, sp.SpawnPosition), false);
    }
    const r3 = P().areaOpen(3) && T().Sector.find(s => s.Id === 9003);
    for (const sp of (r3 && r3.NpcSpawnDatas) || []) if (!L.npcs.has(sp.NpcId) && npcUnlocked(sp.NpcId)) addNpc(sp.NpcId, secPoint(9003, sp.SpawnPosition), false);
  }
  // Khách mua cổ vật (Npc.Type Customer, có dòng ArtifactDeal) đứng ở Sector.GuestSpawnDatas. Bản gốc cho khách vào theo ca
  // Tycoon (bảng Employee/TycoonSalesSlot chưa có trong data): ở đây mỗi lần về sảnh 2 khách ngẫu nhiên từ Cấp danh tiếng 2
  // ("khách sẽ tăng dần" — LoungeQuest/80002.lua). [SUY LUẬN]
  function spawnGuests(row) {
    if (P().get().userLevel < 2) return;
    const pool = (T().Npc || []).filter(n => n.Type === 'Customer' && (T().ArtifactDeal || []).some(d => d.NpcId === n.Id) && VD.NPCS && VD.NPCS[n.Id]);
    const spots = (row.GuestSpawnDatas || []).slice();
    for (let i = 0; i < 2 && pool.length && spots.length; i++) {
      const n = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      const s = spots.splice(Math.floor(Math.random() * spots.length), 1)[0];
      addNpc(n.Id, secPoint(9001, s.SpawnPosition), true);
    }
  }
  // NPC xuất hiện khi điều kiện mở (Npc.UnlockConditions) vừa đạt trong lúc đang ở sảnh.
  function refreshNpcs() {
    const row = T().Sector.find(s => s.Id === 9001);
    for (const sp of row.NpcSpawnDatas || []) if (!L.npcs.has(sp.NpcId) && npcUnlocked(sp.NpcId)) addNpc(sp.NpcId, secPoint(9001, sp.SpawnPosition), false);
  }
  L.refreshNpcs = refreshNpcs;

  function addNpc(id, pos, dynamic) {
    if (L.npcs.has(id)) return L.npcs.get(id);
    const n = { id, pos: { x: pos.x, z: pos.z }, row: npcRow(id), vis: null, nav: false, state: 0, dynamic: !!dynamic, removed: false };
    const a = VD.NPCS && VD.NPCS[id];
    n.art = a || null;
    // Chặn đi xuyên NPC (CapsuleCollider + NavMeshObstacle của prefab).
    const r = a && a.radius ? Math.min(0.6, a.radius) : 0.35;
    n.blocker = VD.world.addBlocker(pos.x, pos.z, r * 1.6, r * 1.6, 45, false);
    // Hình theo prefab gốc (Spine + lưới 3D đi kèm): js/npc.js VD.npc.visual.
    VD.npc.visual(n, id, n.pos);
    n.tag = $('div', 'vd-npctag', L.hudWorld());
    n.tag.innerHTML = '<div class="mark"></div><div class="sub"></div><div class="name"></div><div class="key"><b>F</b><span></span></div>';
    n.tag.querySelector('.sub').innerHTML = VD.ui.rich(TX('TNpc_SubName_' + id));
    n.tag.querySelector('.name').textContent = TX('TNpc_Name_' + id);
    n.tag.querySelector('.key span').textContent = TX('Interact') || 'Tương tác';
    const st = (P().get().npcState || {})[id];
    if (st) n.state = st;
    L.npcs.set(id, n);
    return n;
  }
  function removeNpc(n) {
    n.removed = true;
    if (n.vis) n.vis.dispose();
    if (n.h) VD.objects.remove(n.h);
    if (n.tag) n.tag.remove();
    if (n.blocker) VD.world.removeBlocker(n.blocker);
  }

  // ================================================================ bốt điện thoại (lặn)
  function spawnBooth(row) {
    const b = (row.PhoneBoothSpawnDatas || [])[0];
    if (!b) return;
    L.boothPos = secPoint(9001, b.SpawnPosition);
    if (VD.objects && VD.objects.has('PhoneBooth')) L.booth = VD.objects.create('PhoneBooth', { pos: L.boothPos, fwd: { x: Math.SQRT1_2, z: Math.SQRT1_2 } });
    L.boothBlock = VD.world.addBlocker(L.boothPos.x, L.boothPos.z, 0.8, 0.8, 45, false);
    L.boothTag = $('div', 'vd-npctag booth', L.hudWorld());
    L.boothTag.innerHTML = '<div class="mark"></div><div class="sub"></div><div class="name"></div><div class="key"><b>F</b><span></span></div>';
    L.boothTag.querySelector('.sub').textContent = TX('LCommon_4012');   // nhãn ping "Buồng Lặn" của PingToNpc gốc
    L.boothTag.querySelector('.key span').textContent = TX('Interact') || 'Tương tác';
  }

  // ================================================================ khu đang đứng (Area.CameraPos)
  // Camera sảnh là camera người chơi (GameCameraController.OnViewTargetChanged → CameraManager.ActivatePlayerCamera: FOV 10,
  // offset (25, 21, −25), bám người chơi). InteriorVCamTemplate (FOV 15) chỉ dùng trong CameraManager.FocusOnPosition, do
  // InteriorPopupPresenter.PlayInteriorTransition gọi lúc mua nội thất. Area.CameraPos chỉ còn để biết khu gần nhất. [ĐO il2cpp]
  L.areas = () => (T().Area || []).map(a => { const p = String(a.CameraPos).split(':').map(Number); return { id: a.Id, x: p[0], z: -p[2], open: P().areaOpen(a.Id) }; });
  L.pickArea = function (snap) {
    const pl = VD.stage.player; if (!pl) return;
    let best = null, bd = 1e9;
    for (const a of L.areas()) { if (!a.open) continue; const d = Math.hypot(a.x - pl.pos.x, a.z - pl.pos.z); if (d < bd) { bd = d; best = a; } }
    if (best) { L.area = best.id; L.camTarget.set(best.x, 0, best.z); }
    if (snap) VD.render.snap(pl.pos);
  };

  // ================================================================ HUD sảnh
  L.hudWorld = () => { if (!L.hud) buildHud(); return L.hud.querySelector('.vd-lhud-world'); };
  function buildHud() {
    if (L.hud) return;
    const h = L.hud = $('div', 'vd-lhud', document.getElementById('ui'));
    h.innerHTML = `
      <div class="vd-lhud-world"></div>
      <div class="vd-lhud-level"><div class="lv"></div><div class="bar"><i></i></div><div class="exp"></div><div class="up">${TX('UInGameUserLevelPanel_LevelUpTag_Text') || ''}</div></div>
      <div class="vd-lhud-quest"></div>
      <div class="vd-lhud-wallet"><div class="coin"><img src="art/ui/icon_common/Coin.webp"><span></span></div><div class="gold"><img src="art/ui/icon_common/Gold.webp"><span></span></div></div>
      <div class="vd-lhud-menu"><button class="snd" title="Âm thanh"><img></button><button class="title" title="Màn tiêu đề">☰</button></div>`;
    const snd = h.querySelector('.snd img');
    const paint = () => { snd.src = 'art/ui/icon_common/' + (P().get().sound !== false ? 'ImgSoundOn' : 'ImgSoundOff') + '.webp'; };
    paint();
    h.querySelector('.snd').onclick = () => { VD.app.toggleSound(); paint(); };
    h.querySelector('.title').onclick = async () => {
      if (await VD.app.confirmBox('Void Diver', 'Về màn tiêu đề? Tiến trình đã được lưu.')) { L.leave(); VD.app.title(); }
    };
    L.hudDirty = true;
  }
  function paintHud() {
    const h = L.hud; if (!h) return;
    const p = P().get(), nx = P().nextLevel();
    h.querySelector('.lv').textContent = 'Lv. ' + p.userLevel;
    const cur = P().levelRow(p.userLevel), base = cur ? cur.NeedExp : 0;
    const frac = nx ? Math.max(0, Math.min(1, (p.userExp - base) / Math.max(1, nx.NeedExp - base))) : 1;
    h.querySelector('.bar i').style.width = (frac * 100) + '%';
    h.querySelector('.exp').textContent = (TX('Exp') || 'Exp') + ' ' + p.userExp.toLocaleString('vi-VN') + (nx ? ' / ' + nx.NeedExp.toLocaleString('vi-VN') : '');
    h.querySelector('.up').style.display = P().canLevelUp() ? '' : 'none';
    h.querySelector('.coin span').textContent = p.wallet.coin.toLocaleString('vi-VN');
    h.querySelector('.gold span').textContent = p.wallet.gold.toLocaleString('vi-VN');
    VD.hud.renderQuest(h.querySelector('.vd-lhud-quest'), L.questSlots());
    L.hudDirty = false;
  }

  // Bảng nhiệm vụ sảnh theo InGameQuestPanelPresenter gốc: slot campaign đang nhận (BuildCampaignSlot) rồi các LoungeQuest
  // GetDisplayLoungeQuestIds (Display, đang chạy 1..3, xếp Main → Sub), việc có DisplayInHud.
  // Bản web thêm (không có slot gốc): khi không có slot nào thì hiện LoungeQuest Main ẩn đang chạy có việc đếm được
  // (vd 81101 "Lần lặn đầu tiên" sau 80200), và luôn thêm một dòng "việc kế tiếp" (L.nextStep) để sảnh không bao giờ trống.
  L.questSlots = function () {
    const p = P().get(), ac = p.activeCampaign, out = [];
    const running = x => [1, 2, 3].indexOf(p.loungeQuest[x.Id] | 0) >= 0;
    if (ac) {
      const cq = P().quest('c' + ac.id), label = VD.dive && VD.dive.taskLabel;
      out.push({ kind: 'camp', diff: TX('EDifficulty_' + ac.difficulty), diffKey: ac.difficulty, title: TX('TCampaign_Name_' + ac.id) || String(ac.id),
        lines: (T().CampaignTask || []).filter(r => r.CampaignId === ac.id).map(r => {
          const [cond, arg] = String(r.EventCondition).split(':'), done = !!(cq.tasks && cq.tasks[r.Id]);
          return { text: label ? label({ id: r.Id, cond, arg: +arg || arg }) : (TX('TCampaignTask_Desc_' + r.Id) || ''), cur: done ? r.Goal : 0, goal: r.Goal, done };
        }) });
    }
    const lqSlot = (x, all) => ({ kind: x.Category === 'Sub' ? 'sub' : 'main', title: TX('TLoungeQuest_Name_' + x.Id) || String(x.Id),
      lines: (T().LoungeQuestTask || []).filter(t => t.LoungeQuestId === x.Id && (all || t.DisplayInHud))
        .map(t => ({ text: TX('TLoungeQuestTask_Desc_' + t.Id) || '', cur: taskValue(t), goal: taskGoal(t), done: taskDone(t) })) });
    for (const cat of ['Main', 'Sub']) for (const x of (T().LoungeQuest || []).filter(x => x.Category === cat && x.Display && running(x)).slice(0, 4)) out.push(lqSlot(x, false));
    if (!out.length) {
      const hid = (T().LoungeQuest || []).find(x => x.Category === 'Main' && !x.Display && running(x) &&
        (T().LoungeQuestTask || []).some(t => t.LoungeQuestId === x.Id && taskGoal(t) > 0 && !/^LuaProgress/.test(t.EventCondition)));
      if (hid) out.push(lqSlot(hid, true));
    }
    const nx = L.nextStep();
    if (nx.text) out.push({ kind: 'next', lines: [{ text: nx.text }] });
    return out;
  };

  // Việc kế tiếp + NPC đích cho dấu chỉ đường. Chữ = câu thoại của PingToNpc gốc (Common.lua _PingData, LCommon_40x1).
  // Thứ tự: hội thoại Quest của campaign → của LoungeQuest Main → NPC Lua bật SetNpcNavigationActive → bốt lặn (đã nhận
  // campaign) → hội thoại Quest của LoungeQuest Sub → Elara (chưa nhận campaign: nhận ở bảng Campaign của Elara).
  const PING_LINE = { 700000: 'LCommon_4001', 700105: 'LCommon_4011', 700001: 'LCommon_4021', 700008: 'LCommon_4031',
    700013: 'LCommon_4041', 700005: 'LCommon_4061', 700102: 'LCommon_4063' };
  const ELARA = 700000;
  L.nextStep = function () {
    const p = P().get(), dl = (p.dialogs || []).filter(d => VD.npc && VD.npc.isQuest(d) && L.npcs.has(d.npc));
    const cat = d => { const m = /^LoungeQuest\/(\d+)/.exec(d.LuaKey || ''); if (!m) return /^Campaign\//.test(d.LuaKey || '') ? 'camp' : 'other'; const q = (T().LoungeQuest || []).find(x => x.Id === +m[1]); return q && q.Category === 'Sub' ? 'sub' : 'main'; };
    const say = id => ({ npc: id, text: id === 'booth' ? TX('LCommon_4011') : (TX(PING_LINE[id]) || TX('TNpc_Name_' + id) || '') });
    let d = dl.find(d => cat(d) === 'camp') || dl.find(d => cat(d) === 'main');
    if (d) return say(d.npc);
    for (const n of L.npcs.values()) if (n.nav && TX('TNpc_Name_' + n.id)) return say(n.id);
    if (p.activeCampaign && L.boothPos) return say('booth');
    d = dl.find(d => cat(d) === 'sub') || dl[0];
    if (d) return say(d.npc);
    return say(ELARA);
  };
  L.markDirty = () => { L.hudDirty = true; };

  function tagAt(el, x, y, z) {
    const v = TMPV.set(x, y, z).project(VD.render.camera), c = VD.render.renderer.domElement;
    if (v.z > 1) { el.style.display = 'none'; return; }
    el.style.display = '';
    const sx = (v.x + 1) / 2 * c.clientWidth, sy = (1 - v.y) / 2 * c.clientHeight;
    el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`;
    // Nhãn trôi vào dưới bảng nhiệm vụ / thanh cấp thì mờ đi, kẻo hai dòng chữ chồng lên nhau không đọc được.
    const hw = el.offsetWidth / 2, top = sy - el.offsetHeight;
    el.classList.toggle('under-hud', HUD_RECTS.some(r => sx + hw > r.left && sx - hw < r.right && sy > r.top && top < r.bottom));
  }
  let HUD_RECTS = [];
  function measureHud() {
    const c = VD.render.renderer.domElement.getBoundingClientRect();
    HUD_RECTS = L.hud ? [...L.hud.querySelectorAll('.vd-lhud-quest, .vd-lhud-level')].map(e => {
      const r = e.getBoundingClientRect();
      return { left: r.left - c.left, right: r.right - c.left, top: r.top - c.top, bottom: r.bottom - c.top };
    }).filter(r => r.right > r.left && r.bottom > r.top) : [];
  }
  const TMPV = new THREE.Vector3();

  // ================================================================ khung
  function update(dt) {
    if (L.state !== 'play') return;
    const S = VD.stage;
    combatTick();
    S.update(dt);
    flushLua();
    if (VD.lua.state) VD.lua.tick();
    const busy = panelOpen();
    // Gần nhất trong tầm: NPC hoặc bốt.
    const pl = S.player;
    let best = null, bd = REACH;
    if (pl) {
      for (const n of L.npcs.values()) { const d = Math.hypot(n.pos.x - pl.pos.x, n.pos.z - pl.pos.z); if (d < bd && canTalk(n)) { bd = d; best = n; } }
      if (L.boothPos) { const d = Math.hypot(L.boothPos.x - pl.pos.x, L.boothPos.z - pl.pos.z); if (d < bd + 0.4) { best = 'booth'; } }
    }
    L.focus = busy ? null : best;
    if (!busy && VD.input.pressed.Interact && L.focus) interact(L.focus);
    L.tickT = (L.tickT || 0) + dt;
    if (L.tickT > 1) { L.tickT = 0; L.questTick(); }
    if (L.pickT == null || (L.pickT -= dt) <= 0) { L.pickT = 0.25; L.pickArea(false); }
  }
  // NPC không có tên (EmptySkeleton chỉ để neo, vd 700105 혼령) và không có chức năng, hội thoại: không bấm được.
  function canTalk(n) {
    if (!TX('TNpc_Name_' + n.id)) return false;
    return true;
  }
  function interact(target) {
    VD.input.clear();
    if (target === 'booth') return L.useBooth();
    if (VD.npc) VD.npc.open(target.id);
  }
  L.interact = interact;

  L.useBooth = async function () {
    const p = P().get();
    if (!p.activeCampaign) {
      VD.dialog.toast('Hãy nhận chiến dịch ở Elara trước.');   // không có khoá LocalizedText cho trường hợp này
      return;
    }
    if (L.booth && VD.objects) VD.objects.setState(L.booth, 'activating');
    await new Promise(r => setTimeout(r, 400));
    VD.app.toDive({ campaignId: p.activeCampaign.id, characterId: p.character, difficulty: p.activeCampaign.difficulty });
  };

  function render(dt) {
    if (L.state === 'idle' || L.state === 'loading') return;
    const pl = VD.stage.player;
    if (pl) VD.render.follow(pl.pos, dt);
    if (pl) { VD.world.updateCutoff(VD.render.camera.position, pl.pos.x, pl.pos.z); VD.audio.setListener(pl.pos); }
    VD.stage.render(dt);
    for (const n of L.npcs.values()) if (n.vis) { n.vis.root.position.set(n.pos.x, 0, n.pos.z); n.vis.update(dt, VD.render.camera); }
    for (const d of L.decor) d.m.update(dt);
    if (VD.objects) VD.objects.update(dt, VD.render.camera);
    if (L.hudDirty) { paintHud(); paintQuick(); }
    if (VD.hud && VD.hud.on) VD.hud.update(dt);
    if (VD.minimap && VD.minimap.on) VD.minimap.update(dt);
    measureHud();
    // Nhãn NPC: tên + chức năng, "!" khi có hội thoại Quest, mũi dẫn đường khi SetNpcNavigationActive hoặc là đích
    // của "việc kế tiếp" (bảng nhiệm vụ). Đích đổi thì vẽ lại bảng nhiệm vụ.
    const dlg = P().get().dialogs || [];
    const nx = L.nextStep();
    if (nx.text !== L._nextText) { L._nextText = nx.text; L.hudDirty = true; }
    for (const n of L.npcs.values()) {
      const tg = nx.npc === n.id;
      if (!n.tag) continue;
      n.tag.classList.toggle('target', tg);
      const hasName = !!TX('TNpc_Name_' + n.id);
      if (!hasName && !n.nav) { n.tag.style.display = 'none'; continue; }
      const h = (n.vis ? TAG_Y * (n.art.scale || 1) + (n.art.off ? n.art.off[1] : 0) : 1.3);
      tagAt(n.tag, n.pos.x, h, n.pos.z);
      const quest = dlg.some(d => d.npc === n.id && VD.npc.isQuest(d));
      const m = n.tag.querySelector('.mark');
      m.textContent = quest ? '!' : '';
      // Lua đã đặt PointerArrow ngay trên NPC này thì nhãn không vẽ thêm mũi thứ hai.
      const arrowed = !quest && [...L.arrows.values()].some(a => a.ptr && Math.hypot(a.pos.x - n.pos.x, a.pos.z - n.pos.z) < 0.6);
      m.className = 'mark' + (quest ? ' q' : (n.nav || tg) && !arrowed ? ' nav' : '');
      n.tag.classList.toggle('focus', L.focus === n);
    }
    if (L.boothTag && L.boothPos) {
      tagAt(L.boothTag, L.boothPos.x, 2.1, L.boothPos.z);
      L.boothTag.classList.toggle('focus', L.focus === 'booth');
      L.boothTag.classList.toggle('target', nx.npc === 'booth');
      const ac = P().get().activeCampaign;
      L.boothTag.querySelector('.name').textContent = ac ? (TX('TCampaign_Name_' + ac.id) || '') : '';
      L.boothTag.querySelector('.mark').className = 'mark' + (ac ? ' nav' : '');
    }
    // Dải dẫn đường dưới sàn (GroundNavigation gốc, js/groundnav.js) tới đích "việc kế tiếp"; tắt khi đã đứng cạnh hoặc đang mở bảng.
    if (VD.groundNav) {
      const tgt = nx.npc === 'booth' ? L.boothPos : (L.npcs.get(nx.npc) || {}).pos;
      const busy = panelOpen();
      const show = pl && tgt && !busy && Math.hypot(tgt.x - pl.pos.x, tgt.z - pl.pos.z) > REACH + 0.4;
      VD.groundNav.update(VD.render.scene, show ? pl.pos : null, show ? tgt : null, dt);
    }
    for (const a of L.arrows.values()) tagAt(a.el, a.pos.x, a.y, a.pos.z);
    for (let i = L.bubbles.length - 1; i >= 0; i--) {
      const b = L.bubbles[i]; b.t += dt;
      const p = b.who();
      if (p) tagAt(b.el, p.x, p.y, p.z);
      if (b.t > b.life) { b.el.remove(); L.bubbles.splice(i, 1); }
    }
    VD.render.draw(dt, VD.loop.time);
  }

  L.bubble = function (npcId, text) {
    if (!text) return;
    const el = $('div', 'vd-bubble', L.hudWorld());
    el.textContent = text;
    const who = () => {
      const n = npcId > 0 ? L.npcs.get(npcId) : null;
      if (n) return { x: n.pos.x, y: TAG_Y * (n.art && n.art.scale || 1) + 0.55, z: n.pos.z };
      const u = VD.stage.player; return u ? { x: u.pos.x, y: 1.5, z: u.pos.z } : null;
    };
    L.bubbles.push({ el, who, t: 0, life: 2.8 + text.length * 0.04 });
  };

  // ================================================================ Lua: hàng đợi (gọi Lua từ trong hàm LuaApi phải đợi hết khung)
  function campaignKey() {
    const ac = P().get().activeCampaign;
    if (ac && VD.LUA && VD.LUA['Campaign/' + ac.id]) return 'Campaign/' + ac.id;
    return 'Campaign/None';
  }
  L.campaignKey = campaignKey;
  function activeQuestKeys() {
    const lq = P().get().loungeQuest, out = [];
    for (const q of T().LoungeQuest || []) { const st = lq[q.Id] | 0; if (st >= 1 && st <= 3 && VD.LUA['LoungeQuest/' + q.Id]) out.push('LoungeQuest/' + q.Id); }
    return out;
  }
  function queueCall(key, fn, a, b) { L.luaQueue.push({ key, fn, a, b }); }
  function queueEvent(key, type, value) { L.luaQueue.push({ key, fn: 'OnEvent', a: type, b: value }); }
  L.queueCall = queueCall;
  // Sự kiện cho mọi script đang hoạt động (campaign + LoungeQuest đang chạy), như dive.js luaKeys().
  L.broadcast = function (type, value) { for (const k of [campaignKey()].concat(activeQuestKeys())) queueEvent(k, type, value); };
  function flushLua() {
    for (let guard = 0; guard < 8 && L.luaQueue.length; guard++) {
      const q = L.luaQueue.splice(0);
      for (const c of q) {
        try {
          if (!VD.lua.has(c.key, c.fn)) continue;
          L.trace.push(c.key + '.' + c.fn + (c.fn === 'OnEvent' ? ':' + c.a + ':' + c.b : ''));
          VD.lua.call(c.key, c.fn, c.a, c.b);
        } catch (e) { console.error('[lounge] Lua ' + c.key + '.' + c.fn + ': ' + (e.message || e)); }
      }
    }
  }
  L.flushLua = flushLua;

  // ================================================================ LoungeQuest: mở khoá, việc, chuyển trạng thái
  // ELoungeQuestState: None 0, NotStarted 1, InProgress 2, NotCompleted 3, Completed 4.
  // Luật [SUY LUẬN từ chú thích trong LoungeQuest/80200.lua và 80100.lua]:
  //  - đủ UnlockConditions khi đang None → NotStarted, gửi OnEvent(LoungeQuestStateChanged, 1) cho chính script quest đó;
  //  - InProgress và mọi LoungeQuestTask có Goal > 0 đạt → NotCompleted tự động (Goal 0 = script tự kết thúc);
  //  - mỗi lần đổi trạng thái gửi OnEvent(241, trạng thái mới) cho script quest; Completed trao LoungeQuest.Rewards vào kho.
  function taskGoal(t) { return +t.Goal || 0; }
  function taskValue(t) {
    const p = P().get(), [kind, arg] = String(t.EventCondition || '').split(':');
    switch (kind) {
      case 'UserLevel': return p.userLevel >= +arg ? taskGoal(t) || 1 : 0;
      case 'LuaProgress': return num(p.lqTask[arg]) || num(p.lqTask[t.Id]) || 0;
      case 'CampaignClear': return p.clears[arg] || 0;
      case 'LoungeQuestCleared': return (p.loungeQuest[arg] | 0) === 4 ? 1 : 0;
      case 'MyItemCountTotal': return P().count('Item', +arg) + P().count('Equipment', +arg) + packCount(+arg);
      default: return 0;
    }
  }
  function taskDone(t) { const g = taskGoal(t); return g > 0 && taskValue(t) >= g; }
  L.taskValue = taskValue; L.taskDone = taskDone;
  function packCount(id) { let n = 0; for (const g of P().get().pack || []) if (+g.id === id) n += g.count || 1; return n; }

  L.setQuestState = function (id, st) {
    const p = P().get();
    const prev = p.loungeQuest[id] | 0;
    if (prev === st) return;
    p.loungeQuest[id] = st;
    if (st === 4) {
      const q = (T().LoungeQuest || []).find(x => x.Id === id);
      if (q && q.Rewards && q.Rewards.length) { P().giveAll(q.Rewards); VD.dialog.toast((TX('TLoungeQuest_Name_' + id) || id) + ' — ' + (TX('CampaignCompletedText') || 'Đã hoàn thành')); }
    }
    P().save();
    queueEvent('LoungeQuest/' + id, VD.lua.EV.LoungeQuestStateChanged, st);
    L.hudDirty = true;
    L.questTickSoon = true;
  };
  L.questTick = function () {
    const p = P().get();
    let changed = true, guard = 0;
    while (changed && guard++ < 10) {
      changed = false;
      for (const q of T().LoungeQuest || []) {
        const st = p.loungeQuest[q.Id] | 0;
        if (st === 0 && P().condsOk(q.UnlockConditions)) { L.setQuestState(q.Id, 1); changed = true; }
        else if (st === 2) {
          const tasks = (T().LoungeQuestTask || []).filter(t => t.LoungeQuestId === q.Id);
          const auto = tasks.filter(t => taskGoal(t) > 0);
          if (auto.length && auto.every(taskDone)) { L.setQuestState(q.Id, 3); changed = true; }
        }
      }
    }
    if (L.state === 'play') refreshNpcs();
    L.hudDirty = true;
  };

  // ================================================================ campaign đang nhận
  // Nhận campaign ở Elara (NpcFunction Campaign): trạng thái quest campaign về NotStarted, step 0, rồi OnLounge của script
  // (OnLoungeCommon: step 0 → SetStep(1) → Step_00001 đăng ký hội thoại giao việc ở Elara). [ĐO: Common.lua, Campaign/1101.lua]
  L.acceptCampaign = function (id, difficulty) {
    const p = P().get();
    const old = p.activeCampaign;
    if (old && old.id !== id) queueEvent(campaignKey(), VD.lua.EV.QuestStateChanged, 1);
    p.activeCampaign = { id, difficulty: difficulty || p.difficulty || 'Normal' };
    const q = P().quest('c' + id);
    q.step = 0; q.state = 1; q.tasks = {};
    P().save();
    queueCall(campaignKey(), 'OnLounge');
    L.hudDirty = true;
  };
  // SetQuestState(Completed) của campaign trong sảnh: trao RepeatRewards ("Thưởng hoàn thành") mỗi lần + FirstRewards lần đầu,
  // cộng Campaign.GainedExp (EXP danh tiếng "Hoàn Thành Chiến Dịch"), bỏ campaign đang nhận.
  // [SUY LUẬN: tên cột + UCampaignDetailPanel_Reward_Caption / _FirstReward_Desc "Chiến dịch thường không có phần thưởng hoàn thành lần đầu",
  //  UCampaignCompletePopup_ExpClear_Title]
  function completeCampaign(id) {
    const row = (T().Campaign || []).find(c => c.Id === id);
    const q = P().quest('c' + id);
    if (row) {
      const list = (row.RepeatRewards || []).concat(!q.firstRewarded ? row.FirstRewards || [] : []);
      if (list.length) P().giveAll(list);
      q.firstRewarded = true;
      if (row.GainedExp > 0) P().addExp(row.GainedExp);
      L.lastReward = { id, goods: list.map(x => P().parse(x)), exp: row.GainedExp || 0 };
    }
    if (!P().cleared(id)) P().markCleared(id);
    const p = P().get();
    if (p.activeCampaign && p.activeCampaign.id === id) p.activeCampaign = null;
    P().save();
    L.questTickSoon = true;
  }

  // ================================================================ LuaApi phía sảnh
  function installApi() {
    const Lu = VD.lua, api = Lu.api, done = Lu.done, pl = () => VD.stage.player;
    const ac = () => P().get().activeCampaign;
    const ckey = () => 'c' + (ac() ? ac().id : 0);
    const cq = () => P().quest(ckey());
    const qid = id => (id == null ? ckey() : String(id));
    const store = (kind, temp) => ({
      get: (id, key) => { if (temp) { const v = L.temp[kind][qid(id) + '|' + key]; return v === undefined ? null : v; } return P().qget(qid(id), kind, key); },
      set: (id, key, v) => { if (temp) L.temp[kind][qid(id) + '|' + key] = v; else P().qset(qid(id), kind, key, v); },
    });
    const S_ = store('s'), I_ = store('i'), B_ = store('b'), F_ = store('f');
    const St = store('s', true), It = store('i', true), Bt = store('b', true), Ft = store('f', true);
    const campTasks = () => (T().CampaignTask || []).filter(t => ac() && t.CampaignId === ac().id);
    const hasSfx = n => !!(n && VD.ASSETS.sfx && VD.ASSETS.sfx[n]);
    const npcOf = id => L.npcs.get(id | 0);
    const lounge = {
      // ---- campaign đang nhận (bộ nhớ chung với dive.js: profile.quest['c' + id])
      GetStep: () => cq().step || 0,
      SetStep: n => { cq().step = n | 0; P().save(); queueCall(campaignKey(), 'Step_' + String(n | 0).padStart(5, '0')); return done(); },
      GetQuestState: () => cq().state || 1,
      SetQuestState: v => {
        const id = ac() ? ac().id : 0;
        cq().state = v | 0; P().save();
        queueEvent(campaignKey(), Lu.EV.QuestStateChanged, v | 0);
        if ((v | 0) === 4 && id) completeCampaign(id);
        L.hudDirty = true;
        return done();
      },
      IsTaskAchieved: id => !!(cq().tasks && cq().tasks[id]),
      IsAllTaskAchieved: () => { const ts = campTasks(); return ts.length > 0 && ts.every(t => cq().tasks && cq().tasks[t.Id]); },
      GetCampaignId: () => (ac() ? ac().id : 0),
      IsClearedCampaign: id => P().cleared(id),
      // ---- bộ nhớ Lua
      GetString: (id, k) => S_.get(id, k), SetString: (id, k, v) => { S_.set(id, k, v == null ? null : String(v)); },
      GetInt: (id, k) => I_.get(id, k) || 0, SetInt: (id, k, v) => { I_.set(id, k, v | 0); },
      GetBool: (id, k) => !!B_.get(id, k), SetBool: (id, k, v) => { B_.set(id, k, !!v); },
      GetFloat: (id, k) => F_.get(id, k) || 0, SetFloat: (id, k, v) => { F_.set(id, k, num(v)); },
      GetTempString: (id, k) => St.get(id, k), SetTempString: (id, k, v) => { St.set(id, k, v == null ? null : String(v)); },
      GetTempInt: (id, k) => It.get(id, k) || 0, SetTempInt: (id, k, v) => { It.set(id, k, v | 0); },
      GetTempBool: (id, k) => !!Bt.get(id, k), SetTempBool: (id, k, v) => { Bt.set(id, k, !!v); },
      GetTempFloat: (id, k) => Ft.get(id, k) || 0, SetTempFloat: (id, k, v) => { Ft.set(id, k, num(v)); },
      RemoveKey: (id, k) => { const q = P().quest(qid(id)); for (const kind of ['s', 'i', 'b', 'f']) delete q[kind][k]; P().save(); },
      RemoveValue: (id, k) => api.RemoveKey(id, k),
      // ---- LoungeQuest
      GetLoungeQuestState: id => (P().get().loungeQuest[id] | 0),
      SetLoungeQuestState: (id, v) => { L.setQuestState(id | 0, v | 0); },
      IsAllLoungeQuestTaskCompleted: id => { const ts = (T().LoungeQuestTask || []).filter(t => t.LoungeQuestId === (id | 0)); return ts.length > 0 && ts.every(t => taskGoal(t) > 0 ? taskDone(t) : taskValue(t) > 0); },
      SetProgress: (key, v) => { P().get().lqTask[key] = num(v); P().save(); L.questTickSoon = true; L.hudDirty = true; },
      // ---- NPC
      HasNpc: id => L.npcs.has(id | 0),
      SpawnNpc: (id, t) => { const n = addNpc(id | 0, freeNear(...Object.values(fromLua(t)), 0.3), true); return done(n ? 1 : 0); },
      DespawnNpc: id => { const n = npcOf(id); if (n) { removeNpc(n); L.npcs.delete(n.id); } },
      GetNpcPosition: id => { const n = npcOf(id); return n ? toLua(n.pos) : { x: 0, y: 0, z: 0 }; },
      SetNpcState: (id, st) => { const n = npcOf(id); if (n) n.state = st | 0; const d = P().get(); d.npcState = Object.assign(d.npcState || {}, { [id]: st | 0 }); P().save(); },
      SetNpcNavigationActive: (id, on) => { const n = npcOf(id); if (n) n.nav = !!on; },
      SpawnPointerArrow: (id, t) => {
        api.DespawnPointerArrow(id);
        // Prefab gốc Object/Etc/PointerArrow: con trỏ UI billboard (tam giác viền + vòng), vẽ lại bằng CSS (.vd-larrow.ptr).
        const el = $('div', 'vd-larrow ptr', L.hudWorld());
        L.arrows.set(id, { el, ptr: true, pos: fromLua(t), y: num(Lu.field(t, 'y')) + 0.6 });
      },
      DespawnPointerArrow: id => { const a = L.arrows.get(id); if (a) { a.el.remove(); L.arrows.delete(id); } },
      SpawnMiniMapMarker: () => {}, DespawnMiniMapMarker: () => {},
      // PingToNpc (Common.lua): nhãn ping ở vị trí NPC vài giây. Không có trong bảng: thời lượng 4 s.
      PlayPing: (label, type, t) => {
        const id = 'ping' + (L._ping = (L._ping || 0) + 1);
        const el = $('div', 'vd-larrow ping', L.hudWorld(), '▼<span></span>');
        el.querySelector('span').textContent = Lu.text(label);
        L.arrows.set(id, { el, pos: fromLua(t), y: 2.4 });
        setTimeout(() => { el.remove(); L.arrows.delete(id); }, 4000);
      },
      AddDialog: (npc, t) => {
        const d = P().get(); d.dialogs = d.dialogs || [];
        const e = { npc: npc | 0, LuaKey: Lu.field(t, 'LuaKey'), FunctionName: Lu.field(t, 'FunctionName'), Purpose: Lu.field(t, 'Purpose'),
          Priority: Lu.field(t, 'Priority') || 1, Type: Lu.field(t, 'Type') || 'Lounge', Title: Lu.field(t, 'Title') || null, Id: Lu.field(t, 'Id') || null };
        if (!d.dialogs.some(x => x.npc === e.npc && x.LuaKey === e.LuaKey && x.FunctionName === e.FunctionName)) d.dialogs.push(e);
        P().save();
      },
      RemoveDialog: (npc, key, fn) => { const d = P().get(); d.dialogs = (d.dialogs || []).filter(x => !(x.npc === (npc | 0) && x.LuaKey === key && x.FunctionName === fn)); P().save(); },
      // ---- tiếng
      PlaySfx: name => { if (hasSfx(name)) VD.audio.sfx(name, { key: 'lua:' + name }); },
      StopSfx: name => { if (VD.audio.stopByName) VD.audio.stopByName('lua:' + name); },
      PlayBgm: name => { VD.app.bgm(name, 1.2); },
      StopBgm: () => { VD.audio.stopBgm(1); },
      ShowBubbleText: (type, id, msg) => { L.bubble((type | 0) === 1 ? -1 : id | 0, Lu.text(msg)); },
      ShowMonologueText: (type, id, msg) => { L.bubble((type | 0) === 1 ? -1 : id | 0, Lu.text(msg)); },
      // ---- nhân vật (ở sảnh chỉ đi lại)
      GetCharacterId: () => P().get().character,
      GetCharacterPosition: () => (pl() ? toLua(pl().pos) : { x: 0, y: 0, z: 0 }),
      SetCharacterPosition: t => { const u = pl(); if (!u) return; const q = freeNear(...Object.values(fromLua(t)), 0.3); u.pos.x = q.x; u.pos.z = q.z; },
      SetCharacterForward: () => {},
      GetCharacterHp: () => (pl() ? pl().hp : 0), GetCharacterMaxHp: () => (pl() ? pl().stats.HpMax : 0),
      GetCharacterStress: () => 0, GetCharacterLightFuel: () => C('LightFuelDefault', 100),
      SetInGameHudActive: on => { L.hudOn = !!on; if (L.hud) L.hud.style.display = on ? '' : 'none'; if (VD.hud) VD.hud.show(!!on); if (VD.minimap && VD.minimap.W) VD.minimap.show(!!on); },
      GetZoneSpawnPosition: () => toLua(L.start || { x: 0, z: 0 }),
      SetTriggerable: () => {},
      // ---- hàng hoá: ở sảnh "túi" = túi mang theo (pack) + kho
      HasItem: (id, n) => P().count('Item', id) + packCount(id) >= (n || 1),
      GetItemCount: id => P().count('Item', id) + packCount(id),
      GiveItem: (id, n) => { P().give({ type: 'Item', id, count: n || 1 }); L.hudDirty = true; return done(); },
      RemoveItem: (id, n) => { removeGoods('Item', id, n || 1); return done(); },
      HasEquipment: id => P().count('Equipment', id) + packCount(id) > 0,
      GetEquipmentCount: id => P().count('Equipment', id) + packCount(id),
      GiveEquipment: (id, n) => { P().give({ type: 'Equipment', id, count: n || 1 }); return done(); },
      RemoveEquipment: (id, n) => { removeGoods('Equipment', id, n || 1); return done(); },
      // "Storage" = hộp Nhận thưởng của Duster (UStoragePopup: "Chuyển vào Kho"), khác Stash (kho của Edman).
      GiveItemToStorage: (id, n) => { P().get().storage.push({ type: 'Item', id, count: n || 1 }); P().save(); },
      GiveEquipmentToStorage: (id, n) => { for (let i = 0; i < (n || 1); i++) P().get().storage.push({ type: 'Equipment', id, count: 1 }); P().save(); },
      GetEmptyInventorySlotCount: () => Math.max(0, C('CharacterInventorySlotCount', 23) - (P().get().pack || []).length),
      GiveCoin: n => { P().giveCoin(n); L.hudDirty = true; return done(); }, RemoveCoin: n => { P().removeCoin(n); L.hudDirty = true; return done(); }, HasCoin: n => P().coin() >= n,
      GiveGold: n => { P().giveGold(n); L.hudDirty = true; return done(); }, RemoveGold: n => { P().removeGold(n); L.hudDirty = true; return done(); }, HasGold: n => P().gold() >= n,
      // ---- nghịch lý (chỉ hồ sơ; buff áp khi vào lượt lặn — dive.js)
      AcquireParadox: id => { const a = P().get().paradox; if (id && a.indexOf(id | 0) < 0) { a.push(id | 0); P().save(); } },
      RemoveParadox: id => { const a = P().get().paradox, i = a.indexOf(id | 0); if (i >= 0) { a.splice(i, 1); P().save(); } },
      GetParadoxIds: () => P().get().paradox.slice(),
      // ---- luồng
      ForceStartStage: () => { const a = ac(); setTimeout(() => VD.app.toDive({ campaignId: a ? a.id : 1100, characterId: P().get().character, difficulty: a ? a.difficulty : 'Normal' }), 0); return done(); },
      ForceEscapeStage: () => done(),
      ForceReturnToTitle: () => { setTimeout(() => { L.leave(); VD.app.title(); }, 0); return done(); },
      IsTutorial: () => !!P().get().isTutorial,
      SetIsTutorial: on => { P().get().isTutorial = !!on; P().save(); },
      SendTutorialEvent: name => { L.trace.push('tutorial:' + name); },
      TriggerEventToAll: v => { L.broadcast(Lu.EV.Custom, v); },
      IsHost: () => true,
      SpawnGuest: () => done(), SpawnSequentialTimeline: () => done(),
      LogInfo: s => console.log('[lua] ' + s), LogDebug: s => console.log('[lua] ' + s),
      LogWarning: s => console.warn('[lua] ' + s), LogError: s => console.error('[lua] ' + s),
    };
    Object.assign(api, lounge);
  }
  function removeGoods(type, id, n) {
    const p = P().get();
    for (let i = p.pack.length - 1; i >= 0 && n > 0; i--) { const g = p.pack[i]; if (g.type !== type || +g.id !== +id) continue; const k = Math.min(n, g.count || 1); g.count = (g.count || 1) - k; n -= k; if (g.count <= 0) p.pack.splice(i, 1); }
    if (n > 0) P().takeStash(type, id, n);
    P().save();
    L.hudDirty = true;
  }

  // Sau mỗi khung Lua: quest đổi trạng thái thì xét lại mở khoá/việc (tránh gọi lồng trong hàm LuaApi).
  const baseTick = L.questTick;
  setInterval(() => { if (L.state === 'play' && L.questTickSoon) { L.questTickSoon = false; baseTick(); } }, 200);

  L.debug = {
    teleport(x, z) { const u = VD.stage.player; const p = freeNear(x, z, 0.3); u.pos.x = p.x; u.pos.z = p.z; L.pickArea(true); return p; },
    toNpc(id) { const n = L.npcs.get(id); if (!n) return null; return L.debug.teleport(n.pos.x + 0.9, n.pos.z + 0.9); },
    toBooth() { return L.boothPos ? L.debug.teleport(L.boothPos.x + 1, L.boothPos.z + 1) : null; },
    trace: () => L.trace.slice(),
  };

  VD.lounge = L;
})(window.VD = window.VD || {});
