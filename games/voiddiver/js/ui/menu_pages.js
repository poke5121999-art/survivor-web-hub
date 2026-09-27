// Các trang MenuPopup ngoài Túi đồ: Quest, Character, Archive, Squad, Option, System (MenuPopup/Contents*/Pages[] gốc).
// Mỗi trang: build(el) dựng DOM theo toạ độ prefab (khung 1920×1080), show()/hide(), onKey(e), pad(nút, ô đang chọn).
// Số đo và khoá chữ: tools/ui_inventory_dump.py MenuPopup (+ QuestSlot, ArchiveSlot, MenuBuffSlot, TextSlot, KeySettingSlotRow).
(function (VD) {
  'use strict';
  const $ = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
  const TX = k => (VD.TEXT && VD.TEXT[k]) || '';
  const T = () => VD.T || {};
  const UI = 'art/ui/inventory/';
  const M = () => VD.menu;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const rich = s => (VD.ui && VD.ui.rich ? VD.ui.rich(s) : esc(s).replace(/\\n|\n/g, '<br>'));
  const C = (n, d) => VD.combatDB().c(n, d);
  const P = () => (VD.profile && VD.profile.get ? VD.profile.get() : {});
  // Chỉ trỏ tới icon có thật (VD.ASSETS.icon.<atlas>.names) để khỏi gọi 404.
  const iconOf = (atlas, id) => { const a = VD.ASSETS && VD.ASSETS.icon && VD.ASSETS.icon[atlas]; return a && a.names && a.names.indexOf(String(id)) >= 0 ? a.dir + id + '.webp' : ''; };
  const fmt = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  // Nút kiểu CustomButton gốc (Normal* #1B1B1B + Line 2px #434343; Focused!/Selected!/Disabled! bằng lớp CSS).
  const btn = (cls, html, dis) => `<div class="mp-btn ${cls}${dis ? ' disabled' : ''}" data-nav>${html}${dis ? '<i class="lk"></i>' : ''}</div>`;
  // Thanh "Top!" của trang (Deco 4×24 #898989, tiêu đề 20, chữ phụ 16 sau dấu ':').
  const topBar = (title, sub) => `<div class="mp-top"><i></i><b>${title}</b>${sub ? `<span><em>:</em>${sub}</span>` : ''}</div>`;

  // ================================================================ Quest (QuestPageView)
  // Danh sách trái (QuestScroller, ô QuestSlot 620×80 cách 10) + QuestInfoPanel phải: tiêu đề, mô tả, "Mục tiêu" với tiến độ
  // từng CampaignTask / LoungeQuestTask, "Thưởng hoàn thành" (GoodsSlot 60). Dữ liệu: campaign đang lặn + LoungeQuest đang làm.
  const Q = { sel: 0, list: [] };
  function questList() {
    const out = [];
    const D = VD.dive;
    if (D && D.camp) {
      const c = D.camp;
      out.push({
        type: TX('EQuestType_Campaign'), sub: TX('EDifficulty_' + D.diffName) || '', name: TX('TCampaign_Name_' + c.Id) || ('Campaign ' + c.Id),
        desc: TX('TCampaign_Desc_' + c.Id), level: c.RecommendedLevel,
        conds: (D.tasks || []).map(t => ({ text: TX('TCampaignTask_Desc_' + t.id) || (TX('EEventConditionType_' + t.cond) || t.cond).replace('{0}', t.cond === 'TeamItemCountInInventory' ? VD.goods.name({ type: 'Item', id: t.arg }) : t.arg), cur: Math.min(t.cur, t.goal), goal: t.goal, done: t.done })),
        rewards: (P().clears && P().clears[c.Id] ? c.RepeatRewards : (c.FirstRewards || []).concat(c.RepeatRewards || [])) || [],
      });
    }
    const lq = P().loungeQuest || {}, tasks = P().lqTask || {};
    for (const r of T().LoungeQuest || []) {
      if (lq[r.Id] !== 2) continue;
      out.push({
        type: TX('EQuestType_Lounge'), sub: '', name: TX('TLoungeQuest_Name_' + r.Id) || ('Quest ' + r.Id), desc: TX('TLoungeQuest_Desc_' + r.Id), level: 0,
        conds: (T().LoungeQuestTask || []).filter(t => t.LoungeQuestId === r.Id).map(t => ({ text: TX('TLoungeQuestTask_Desc_' + t.Id) || t.EventCondition, cur: Math.min(tasks[t.Id] || 0, t.Goal), goal: t.Goal, done: (tasks[t.Id] || 0) >= t.Goal })),
        rewards: r.Rewards || [],
      });
    }
    return out;
  }
  M().register('Quest', {
    build(el) {
      el.innerHTML = `<div class="mp-bg"><i class="line" style="left:758px"></i></div>
        ${topBar(TX('UQuestPage_Top_Title'), TX('UQuestPage_Title_TitleSub'))}
        <div class="q-list"></div>
        <div class="q-info"><div class="empty"><i class="deco"></i><p>${TX('UQuestPage_Empty_TextEmpty')}</p></div>
          <div class="panel"><div class="title"><span class="type"></span><b class="name"></b><span class="lv"></span></div>
            <div class="scroll"><p class="desc"></p><div class="goal"><i class="qm"><i class="ex"></i></i><b>${TX('UQuestInfoPanel_Info_GoalCondition')}</b></div>
              <div class="conds"></div><div class="reward"><span>${TX('UQuestInfoPanel_Reward_Caption')}</span><div class="slots"></div></div></div>
            <div class="btns">${btn('disp', TX('DisplayScreen') || TX('ToggleQuestHud'))}${btn('dlg', TX('ShowDialog'), true)}${btn('back', TX('CancelSelect'))}</div></div></div>
        ${M().keyGuide([M().CLOSE, M().SELECT, { k: ['G_Key'], p: ['XBox_Y'], t: 'DisplayScreen' }, { k: ['F_Key'], p: ['XBox_X'], t: 'ShowDialog' }])}`;
      el.querySelector('.q-list').addEventListener('click', e => { const s = e.target.closest('.q-slot'); if (s) { Q.sel = +s.dataset.i; render(el); M().sfx('ButtonClick'); } });
      el.querySelector('.btns .back').onclick = () => { Q.sel = -1; render(el); };
      // DisplayToggle: bật/tắt khung nhiệm vụ trên HUD (UI/ToggleQuestHud = G). HUD web đọc phím G qua core.js; ở đây chỉ đổi trạng thái hiển thị.
      el.querySelector('.btns .disp').onclick = () => toggleHudQuest(el);
      Q.el = el;
    },
    show() { Q.list = questList(); if (Q.sel >= Q.list.length) Q.sel = Q.list.length ? 0 : -1; render(Q.el); },
    onKey(e) { if (e.code === 'KeyG' && !e.repeat) { toggleHudQuest(Q.el); return true; } return false; },
    pad(b, el) { if (b === M().BTN.Y) { toggleHudQuest(Q.el); return true; } return false; },
  });
  function hudQuestEl() { return document.querySelector('.vd-quest'); }
  function toggleHudQuest(el) {
    const q = hudQuestEl();
    if (q) q.style.display = q.style.display === 'none' ? '' : 'none';
    render(el);
  }
  function render(el) {
    const L = Q.list;
    el.querySelector('.q-list').innerHTML = L.map((q, i) => `<div class="q-slot${i === Q.sel ? ' sel' : ''}" data-i="${i}" data-nav><small>${esc(q.type)}${q.sub ? ' : ' + esc(q.sub) : ''}</small><b>${esc(q.name)}</b></div>`).join('');
    const q = L[Q.sel];
    el.querySelector('.q-info').classList.toggle('has', !!q);
    if (!q) return;
    const pn = el.querySelector('.panel');
    pn.querySelector('.type').textContent = q.type + (q.sub ? ' · ' + q.sub : '');
    pn.querySelector('.name').textContent = q.name;
    pn.querySelector('.lv').textContent = q.level ? 'Lv. ' + q.level : '';
    pn.querySelector('.desc').innerHTML = rich(q.desc || '');
    pn.querySelector('.conds').innerHTML = q.conds.map(c => `<div class="cond${c.done ? ' done' : ''}"><span>${esc(c.text)}</span><b>${c.cur}/${c.goal}</b></div>`).join('');
    const slots = pn.querySelector('.slots');
    slots.innerHTML = '';
    for (const s of q.rewards) {
      const g = VD.goods.parse(s);
      if (!g || !(g.count > 0)) continue;
      const cell = VD.inventory.slotEl(slots, 'view', 0);
      cell.classList.add('s60');
      VD.inventory.paintSlot(cell, { g });
      cell.addEventListener('pointerenter', () => VD.inventory.showTipFor(g, cell));
      cell.addEventListener('pointerleave', () => VD.inventory.hideTip());
    }
    pn.querySelector('.reward').style.display = slots.children.length ? '' : 'none';
    const q2 = hudQuestEl();
    pn.querySelector('.disp').classList.toggle('on', !q2 || q2.style.display !== 'none');
  }

  // ================================================================ Character (CharacterPageView)
  // Trái: CharacterInfoPanel (tên/danh hiệu, chỉ số, Spine đứng trên DecoFloor1, cột ô trang bị 90×90).
  // Phải: thẻ con "Nghịch Lý · Buff" | "Kỹ Năng"; tooltip EquipmentTooltip cạnh cột trang bị.
  // Bảng chỉ số: thứ tự và khoá chữ đúng prefab; R đổi "Cơ Bản"/"Chi Tiết" (hàng ẩn ở chế độ cơ bản là các hàng rộng 0 trong prefab).
  const STATS = [
    ['Atk', 'Atk'], ['Def', 'Def'], ['Hp', 'HpMax'], ['Stamina', 'StaminaMax'], ['CriticalChance', 'CriticalChancePercent', '%'],
    ['MoveSpeed', 'MoveSpeed', '', 1], ['StressDamageResistance', 'StressDamageReductionPercent', '%', 1],
    ['CriticalDamageBoost', 'CriticalDamagePercent', '%'], ['AttackSpeed', 'AtkSpeedPercent', '%'], ['DefensePenetration', 'PenetrationPercent', '%'],
    ['CooldownReduction', 'CooldownReductionPercent', '%'], ['NaturalRecoveryHp', 'HpRegen'], ['DamageReduction', 'ReductionDamagePercent', '%', 1],
    ['BackAttackDamageBoost', 'BackAttackDamagePercent', '%'], ['WeaknessDamageBoost', 'WeaknessDamagePercent', '%', 1],
    ['FireResistance', 'FireResistancePercent', '%'], ['WaterResistance', 'WaterResistancePercent', '%'], ['WindResistance', 'WindResistancePercent', '%'],
    ['NaturalRecoverStamina', 'StaminaRegen', '', 1],
  ];
  const CH = { sub: 'ParadoxBuff', detail: false, spine: null };
  M().register('Character', {
    build(el) {
      el.innerHTML = `
        <div class="c-info"><div class="cha"><i class="bar"></i><b class="nm"></b><span class="tt"></span></div>
          <div class="stage"><i class="floor"></i><i class="shadow"></i><canvas class="spine" width="400" height="460"></canvas></div>
          <div class="stats"></div>
          <div class="toggle" data-nav>${M().key(['R_Key'], ['XBox_Right_Stick_Click'])}<span></span><i class="arr"></i></div>
          <div class="slots"></div></div>
        <div class="c-tabs"><div class="mp-btn t-pb" data-nav>${TX('UCharacterPage_ParadoxAndBuff_Text')}</div><div class="mp-btn t-sk" data-nav>${TX('UCharacterPage_Skilll_Text')}</div></div>
        <div class="c-page pb">
          <div class="px pos"><div class="hd"><i class="tri"></i><b>${TX('UParadoxPanel_Top_TitleText')}</b><span class="cnt"></span></div><div class="rows"></div></div>
          <div class="px neg"><div class="hd"><i class="tri"></i><b>${TX('UParadoxPanel_Top_TitleText')}</b><span class="cnt"></span></div><div class="rows"></div></div>
          <div class="bf"><div class="hd"><b>${TX('UMenuBuffPanel_Top_Title')}</b></div><div class="list"></div></div></div>
        <div class="c-page sk"><div class="hd"><b>${TX('UCharacterPage_Skilll_Text')}</b></div><div class="skills"></div></div>
        <div class="c-tip"></div>
        ${M().keyGuide([M().CLOSE])}`;
      const slots = el.querySelector('.c-info .slots');
      const list = VD.inventory.equipList ? VD.inventory.equipList() : [];
      list.forEach((e, i) => {
        if (i === 1 || i === 4) $('i', 'sep', slots);
        const s = VD.inventory.slotEl(slots, 'cequip', i);
        s.classList.add('s90');
        s.dataset.nav = '';
        s.addEventListener('pointerenter', () => charTip(el, i, s));
        s.addEventListener('pointerleave', () => charTip(el, -1));
      });
      el.querySelector('.toggle').onclick = () => { CH.detail = !CH.detail; renderChar(el); };
      el.querySelector('.t-pb').onclick = () => { CH.sub = 'ParadoxBuff'; renderChar(el); };
      el.querySelector('.t-sk').onclick = () => { CH.sub = 'Skill'; renderChar(el); };
      CH.el = el;
    },
    show() { renderChar(CH.el); spineStart(CH.el); },
    hide() { spineStop(); charTip(CH.el, -1); },
    onKey(e) { if (e.code === 'KeyR' && !e.repeat) { CH.detail = !CH.detail; renderChar(CH.el); return true; } return false; },
    pad(b) { if (b === M().BTN.RS) { CH.detail = !CH.detail; renderChar(CH.el); return true; } return false; },
    onFocus(el) { el.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false })); },
  });
  function charTip(el, i, s) {
    const tip = el.querySelector('.c-tip');
    const e = i >= 0 ? VD.inventory.equipList()[i] : null;
    if (!e || !e.g) { tip.className = 'c-tip'; tip.innerHTML = ''; return; }
    tip.innerHTML = VD.inventory.tipHTML(e.g);
    const r = s.getBoundingClientRect(), pr = el.getBoundingClientRect(), k = (VD.inventory.ui && VD.inventory.ui.scale) || 1;
    tip.style.top = Math.max(102, Math.min(1080 - 40 - tip.offsetHeight, (r.top - pr.top) / k - 46)) + 'px';
    tip.className = 'c-tip on';
  }
  function renderChar(el) {
    const p = VD.stage && VD.stage.player;
    const row = p && p.row;
    el.querySelector('.cha .nm').textContent = row ? TX('TCharacter_Name_' + row.Id) : '';
    el.querySelector('.cha .tt').textContent = row ? TX('TCharacter_Title_' + row.Id) : '';
    const st = el.querySelector('.stats');
    st.innerHTML = STATS.filter(s => CH.detail || !s[3]).map(s => {
      let v = p && VD.Stats ? VD.Stats.get(p, s[1]) : 0;
      v = Math.round((v || 0) * 10) / 10;
      return `<div class="st"><span>${TX('UCharacterInfoPanel_' + s[0] + '_Caption')}</span><b>${v}${s[2] || ''}</b></div>`;
    }).join('');
    const tg = el.querySelector('.toggle');
    tg.querySelector('span').textContent = TX(CH.detail ? 'UCharacterInfoPanel_Off_Text' : 'UCharacterInfoPanel_On_Text');
    tg.classList.toggle('open', CH.detail);
    const list = VD.inventory.equipList();
    el.querySelectorAll('.c-info .slots .vs').forEach((s, i) => {
      const e = list[i];
      VD.inventory.paintSlot(s, { g: e && e.g });
      s.classList.add('s90', 'cat-' + (e ? e.cat.toLowerCase() : 'weapon'));
    });
    el.querySelector('.t-pb').classList.toggle('on', CH.sub === 'ParadoxBuff');
    el.querySelector('.t-sk').classList.toggle('on', CH.sub === 'Skill');
    el.querySelector('.c-page.pb').classList.toggle('on', CH.sub === 'ParadoxBuff');
    el.querySelector('.c-page.sk').classList.toggle('on', CH.sub === 'Skill');
    // Nghịch lý: profile.paradox (Paradox.Id), chia IsPositive; tối đa Const.ParadoxCountMax mỗi bên.
    const max = C('ParadoxCountMax', 3);
    const px = (P().paradox || []).map(id => (T().Paradox || []).find(r => r.Id === id)).filter(Boolean);
    for (const pos of [true, false]) {
      const box = el.querySelector('.px.' + (pos ? 'pos' : 'neg'));
      const rows = px.filter(r => !!r.IsPositive === pos);
      box.querySelector('.cnt').textContent = rows.length + '/' + max;
      box.querySelector('.rows').innerHTML = rows.length ? rows.map(r => `<div class="pr" data-nav title=""><b>${esc(TX('TParadox_Name_' + r.Id))}</b><span>Lv. ${r.Level}</span><p>${rich(TX('TParadox_Desc_' + r.Id))}</p></div>`).join('')
        : `<div class="none">${TX('UParadoxPanel_NoParadox_Text')}</div>`;
    }
    // Buff đang có (Buff.ShowBuffIcon), icon Icon_Buff theo Id, số chồng.
    const bl = el.querySelector('.bf .list');
    const bufs = p && p.buffs ? p.buffs.list.filter(b => b.row && b.row.ShowBuffIcon && b.active !== false) : [];
    bl.innerHTML = bufs.length ? bufs.map(b => `<div class="bs" data-nav><i class="ic">${iconOf('buff', b.id) ? `<img src="${iconOf('buff', b.id)}" alt="">` : ''}${b.stacks > 1 ? `<b>${b.stacks}</b>` : ''}</i><span>${esc(TX('TBuff_Name_' + b.id) || b.id)}</span></div>`).join('')
      : `<div class="none">${TX('UMenuBuffPanel_NoBuff')}</div>`;
    // Kỹ năng: Passive, One (RMB), Dash (Space), Two (Q), Three (E), Four (R) — SkillSelectSlot(...) gốc; icon Icon_Skill theo UseIcon/Id.
    const sk = el.querySelector('.skills');
    const slots = [['Passive', null], ['One', 'Mouse_Right_Key'], ['Dash', 'Space_Key'], ['Two', 'Q_Key'], ['Three', 'E_Key'], ['Four', 'R_Key']];
    const lo = (VD.stage && VD.stage.loadout) || {};
    const idOf = k => {
      if (!p || !VD.Skill) return 0;
      if (k === 'Passive') return (row && row.PassiveSkillIds && row.PassiveSkillIds[0]) || 0;
      if (k === 'Dash') return VD.Skill.slotSkill(p, 'dash');
      const n = lo['Skill' + k];
      return n >= 0 ? VD.Skill.slotSkill(p, 'skill' + n) : 0;
    };
    sk.innerHTML = slots.map(([k, key]) => {
      const id = idOf(k);
      return `<div class="sk" data-nav data-id="${id || 0}"><i class="ic">${id ? (iconOf('skill', id) ? `<img src="${iconOf('skill', id)}" alt="">` : '') : '<i class="lk"></i>'}</i>${key ? `<img class="key" src="${UI}${key}.webp" alt="">` : ''}</div>`;
    }).join('');
    sk.querySelectorAll('.sk').forEach(s => {
      s.addEventListener('pointerenter', () => skillTip(el, +s.dataset.id, s));
      s.addEventListener('pointerleave', () => skillTip(el, 0));
    });
  }
  // InGameSkillTooltip: tên, căng thẳng/HP/thể lực tiêu hao, hồi chiêu, mô tả (TSkill_Desc_).
  function skillTip(el, id, s) {
    const tip = el.querySelector('.c-tip');
    const r = id && VD.combatDB().skill(id);
    if (!r) { tip.className = 'c-tip'; return; }
    const row = (k, v) => v ? `<div class="row"><span>${TX(k)}</span><b>${v}</b></div>` : '';
    tip.innerHTML = `<div class="frame sk"><div class="title"><b class="name">${esc(TX('TSkill_Name_' + id) || id)}</b></div>
      ${row('Stress', r.StressCost)}${row('HpCost', r.HpCost)}${row('StaminaCost', r.StaminaCost)}${row('CoolTime', r.CoolTime ? r.CoolTime + 's' : 0)}
      <p class="desc">${rich(TX('TSkill_Desc_' + id))}</p></div>`;
    tip.style.top = '248px';
    tip.className = 'c-tip on sk';
  }
  // Nhân vật đứng: SkeletonGraphic gốc (startingAnimation default/idle) — ở web dựng một SkeletonMesh riêng trên canvas nhỏ,
  // dùng lại bộ Spine đã nạp (VD.loadSpine) và skin của nhân vật đang lặn.
  // Giữ một renderer + mesh cho mỗi bộ Spine suốt phiên (tạo WebGL context mỗi lần mở thẻ làm khựng cả khung — tay cầm hụt nút).
  function spineStart(el) {
    spineStop();
    const p = VD.stage && VD.stage.player, vis = p && VD.stage.vis && VD.stage.vis.get(p.uid);
    const THREE = window.THREE, spine = window.spine;
    if (!vis || !vis.bundle || !THREE || !spine) return;
    const cv = el.querySelector('canvas.spine');
    let S = CH.gl;
    if (!S || S.bundle !== vis.bundle || S.uid !== p.uid) {
      if (!S) {
        let r;
        try { r = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: false, premultipliedAlpha: false }); } catch (e) { return; }
        // SkeletonGraphic gốc scale 4 trên Spine scale 0,01 → 1 m = 400 px khung; chân ở đáy canvas trừ 40 (tâm bóng y 723).
        S = CH.gl = { r, scene: new THREE.Scene(), cam: new THREE.OrthographicCamera(-0.5, 0.5, 1.05, -0.1, -10, 10), mesh: null };
      }
      if (S.mesh) { S.scene.remove(S.mesh); try { S.mesh.dispose && S.mesh.dispose(); } catch (e) { /* đã huỷ */ } }
      const d = vis.bundle.dirs.SW || vis.bundle.dirs[Object.keys(vis.bundle.dirs)[0]];
      const mesh = new spine.SkeletonMesh(d.data, mat => { mat.depthTest = false; mat.alphaTest = 0.1; });
      const src = vis.meshes && (vis.meshes.SW || vis.meshes[Object.keys(vis.meshes)[0]]);
      if (src && src.skeleton.skin) { mesh.skeleton.setSkin(src.skeleton.skin); mesh.skeleton.setSlotsToSetupPose(); }
      mesh.state = new spine.AnimationState(d.stateData);
      const idle = ['default/idle', 'idle', 'default/Idle'].find(a => d.data.findAnimation(a)) || (d.data.animations[0] && d.data.animations[0].name);
      if (idle) mesh.state.setAnimation(0, idle, true);
      S.scene.add(mesh);
      S.mesh = mesh; S.bundle = vis.bundle; S.uid = p.uid;
    }
    let last = performance.now();
    CH.spine = { raf: 0 };
    const tick = now => {
      if (!CH.spine) return;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      S.mesh.update(dt);
      S.r.render(S.scene, S.cam);
      CH.spine.raf = requestAnimationFrame(tick);
    };
    CH.spine.raf = requestAnimationFrame(tick);
  }
  function spineStop() {
    if (!CH.spine) return;
    cancelAnimationFrame(CH.spine.raf);
    CH.spine = null;
  }


  // ================================================================ Archive (ArchivePageView)
  // Trái: 8 hạng mục EArchiveCategory (ArchiveSlot 640×130), phải: danh sách mục đã mở (TextSlot). Gốc mở popup riêng
  // (ArchiveGoodsPopup/ArchiveMonsterPopup/ArchiveGlossaryPopup/ArchiveQuestPopup); web hiện chi tiết trong khung tooltip ngay cột phải.
  // Mở khoá: hàng đã từng vào túi (web ghi ở VD.inventory.archive), quái đã hạ trong lượt lặn, thuật ngữ không điều kiện
  // hoặc thoả CampaignCleared/UserLevel, campaign đã qua / đang làm. [SUY LUẬN — bản gốc lưu ở máy chủ/Save]
  const AR = { cat: -1, sel: -1 };
  const ACATS = ['Quest', 'Monster', 'Item', 'Weapon', 'Accessory', 'Artifact', 'Record', 'Glossary'];
  function condOk(c) {
    const [k, v] = c;
    if (k === 'None') return true;
    if (k === 'CampaignCleared') return !!(P().clears && P().clears[v]);
    if (k === 'UserLevel') return (P().userLevel || 1) >= v;
    return false;
  }
  function archiveEntries(cat) {
    const rec = VD.inventory.archive ? VD.inventory.archive() : {};
    const eq = type => Object.keys(rec.Equipment || {}).map(Number).filter(id => { const r = VD.goods.row({ type: 'Equipment', id }); return r && r.GoodsType === type; })
      .map(id => ({ name: VD.goods.name({ type: 'Equipment', id }), g: { type: 'Equipment', id, count: 1 } }));
    switch (cat) {
      case 'Quest': {
        const out = [];
        const clears = P().clears || {};
        const cur = VD.dive && VD.dive.camp;
        for (const c of T().Campaign || []) if (clears[c.Id] || (cur && cur.Id === c.Id)) out.push({ name: TX('TCampaign_Name_' + c.Id), desc: TX('TCampaign_Desc_' + c.Id) });
        const lq = P().loungeQuest || {};
        for (const r of T().LoungeQuest || []) if (lq[r.Id] >= 2) out.push({ name: TX('TLoungeQuest_Name_' + r.Id), desc: TX('TLoungeQuest_Desc_' + r.Id) });
        return out;
      }
      case 'Monster': return Object.keys(rec.Monster || {}).map(Number).map(id => ({ name: TX('TMonster_Name_' + id) || id, desc: TX('TMonster_Desc_' + id), icon: iconOf('monster', id) }));
      case 'Item': return Object.keys(rec.Item || {}).map(Number).map(id => ({ name: VD.goods.name({ type: 'Item', id }), g: { type: 'Item', id, count: 1 } }));
      case 'Weapon': case 'Accessory': case 'Artifact': return eq(cat);
      case 'Glossary': return (T().Glossary || []).filter(r => (r.UnlockConditions || []).every(condOk)).map(r => ({ name: TX('TGlossary_Name_' + r.Id), desc: TX('TGlossary_Desc_' + r.Id), sub: TX('EGlossaryCategory_' + r.Type) }));
      default: return [];
    }
  }
  M().register('Archive', {
    build(el) {
      el.innerHTML = `<div class="a-left"><div class="hd"><b>${TX('UArchivePage_Title_Text')}</b></div><div class="cats">${ACATS.map((c, i) =>
        `<div class="a-cat" data-i="${i}" data-nav><div class="tl"><b>${TX('EArchiveCategory_' + c)}</b></div><p>${TX('EArchiveCategory_' + c + '_Desc')}</p></div>`).join('')}</div></div>
        <div class="a-right"><div class="hd"><b>${TX('UArchivePage_ListTitle_Text')}</b></div>
          <div class="empty"><i class="deco"></i><p>${TX('UArchivePage_Empty_TextDesc')}</p></div><div class="list"></div><div class="detail"></div></div>
        ${M().keyGuide([M().CLOSE])}`;
      el.querySelector('.cats').addEventListener('click', e => { const s = e.target.closest('.a-cat'); if (s) { AR.cat = +s.dataset.i; AR.sel = -1; renderArchive(el); M().sfx('ButtonClick'); } });
      el.querySelector('.list').addEventListener('click', e => { const s = e.target.closest('.t-slot'); if (s) { AR.sel = +s.dataset.i; renderArchive(el); } });
      el.querySelector('.detail').addEventListener('click', () => { AR.sel = -1; renderArchive(el); });
      AR.el = el;
    },
    show() { if (VD.inventory.recordArchive) VD.inventory.recordArchive(); renderArchive(AR.el); },
    pad(b) { if (b === M().BTN.B && AR.sel >= 0) { AR.sel = -1; renderArchive(AR.el); return true; } return false; },
  });
  function renderArchive(el) {
    el.querySelectorAll('.a-cat').forEach((c, i) => c.classList.toggle('sel', i === AR.cat));
    const right = el.querySelector('.a-right');
    const cat = ACATS[AR.cat];
    const list = cat ? archiveEntries(cat) : [];
    right.classList.toggle('has', !!cat);
    right.querySelector('.empty p').textContent = cat && !list.length ? TX('UArchiveGoodsPopup_Empty_TextEmpty') && (TX('EArchiveCategory_' + cat + '_Desc')) : TX('UArchivePage_Empty_TextDesc');
    right.querySelector('.empty').style.display = list.length ? 'none' : '';
    right.querySelector('.list').innerHTML = list.map((x, i) => `<div class="t-slot${i === AR.sel ? ' sel' : ''}" data-i="${i}" data-nav>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}${esc(x.name)}</div>`).join('');
    const d = right.querySelector('.detail');
    const x = list[AR.sel];
    if (!x) { d.className = 'detail'; d.innerHTML = ''; return; }
    d.innerHTML = x.g ? VD.inventory.tipHTML(x.g) : `<div class="frame"><div class="title">${x.icon ? `<img class="mi" src="${x.icon}" alt="" onerror="this.remove()">` : ''}<b class="name">${esc(x.name)}</b></div><p class="desc">${rich(x.desc || '')}</p></div>`;
    d.className = 'detail on';
  }

  // ================================================================ Squad (SquadPageView)
  // Tổ đội là chơi mạng (JoinedPanel/NotJoinedPanel, phòng Steam). Bản web chơi đơn: dựng NotJoinedPanel với chữ gốc, nút tắt.
  M().register('Squad', {
    build(el) {
      el.innerHTML = `<div class="s-join">${btn('join', TX('USquadPage_Participation_Text'), true)}</div>
        <div class="s-info">${TX('USquadPageNotJoinedPanel_Info_Text')}</div>
        <div class="s-open">${btn('open', TX('USquadPage_LoungeOpen_Text'), true)}</div>
        <i class="s-deco"></i><p class="s-desc">${TX('USquadPageNotJoinedPanel_TextDesc')}</p>
        ${M().keyGuide([M().CLOSE])}`;
    },
  });

  // ================================================================ Option (OptionPageView)
  // 5 thẻ dọc (Graphic, Sound, GamePlay, Keyboard, Pad — icon OptionMenu*), mỗi hàng 1478×90: caption 18 #898989 ở x 402,
  // nhóm Toggle 200×50 (màn hình 320×50) căn phải tới x 1800, thanh trượt 718×16 (0–10 nguyên) + nút tắt tiếng.
  // Web làm được: âm lượng (VD.audio.vol), rung màn hình (bọc VD.render.shake), toàn màn hình. Hàng khác hiện giá trị web đang
  // dùng nhưng khoá (trình duyệt/engine web không đổi được hoặc chưa nối) — xem docs/DIVE.md §12.
  const OPT_KEY = 'voiddiver.option.v1';
  const O = { tab: 1, v: { total: 10, bgm: 10, sfx: 10, muteTotal: false, muteBgm: false, muteSfx: false, shake: true } };
  try { Object.assign(O.v, JSON.parse(localStorage.getItem(OPT_KEY)) || {}); } catch (e) { /* bộ nhớ trình duyệt bị chặn */ }
  function saveOpt() { try { localStorage.setItem(OPT_KEY, JSON.stringify(O.v)); } catch (e) { /* bộ nhớ trình duyệt bị chặn */ } }
  const BASE = { master: 0.9, sfx: 0.9, bgm: 0.55 };   // mức trộn sẵn của audio.js
  function applyOpt() {
    const A = VD.audio;
    if (A && A.vol) {
      A.vol.master = O.v.muteTotal ? 0 : BASE.master * O.v.total / 10;
      A.vol.bgm = O.v.muteBgm ? 0 : BASE.bgm * O.v.bgm / 10;
      A.vol.sfx = O.v.muteSfx ? 0 : BASE.sfx * O.v.sfx / 10;
      if (A.applyVolume && A.master) A.applyVolume();
    }
    const R = VD.render;
    if (R && R.shake) {
      if (!R._shake0) R._shake0 = R.shake;
      R.shake = O.v.shake ? R._shake0 : function () {};
    }
  }
  M().applyOptions = applyOpt;
  const OTABS = [['Graphic', 'OptionMenuGraphic'], ['Sound', 'OptionMenuSound'], ['GamePlay', 'OptionMenuGamePlay'], ['Keyboard', 'OptionMenuKeyboard'], ['Pad', 'OptionMenuPad']];
  const toggles = (name, opts, cur, cls, dis) => `<div class="tg ${cls || ''}" data-name="${name}">${opts.map(o => `<div class="t${o[0] === cur ? ' on' : ''}${dis ? ' disabled' : ''}" data-v="${o[0]}" data-nav>${esc(o[1])}</div>`).join('')}</div>`;
  const orow = (cap, body, sub) => `<div class="orow">${sub ? `<small>${sub}</small>` : ''}<span class="cap">${cap}</span>${body}</div>`;
  const slider = (name, v, mute) => `<div class="sl" data-name="${name}"><span class="pct">${v * 10}%</span><div class="bar" data-nav><i class="fill${mute ? ' mute' : ''}" style="width:${v * 10}%"></i><i class="hd" style="left:${v * 10}%"></i></div>
    <div class="snd${mute ? '' : ' on'}" data-nav data-mute="${name}"></div></div>`;
  // Phím theo InputAction.csv (Id → sprite của đường dẫn binding trong InputActionAsset gốc).
  const KB = { 1001: 'W_Key', 1002: 'A_Key', 1003: 'S_Key', 1004: 'D_Key', 1005: 'LeftShift_Key', 1006: 'Space_Key', 1007: 'F_Key', 1008: 'Mouse_Left_Key', 1009: 'Mouse_Right_Key',
    1010: 'Q_Key', 1011: 'E_Key', 1012: 'R_Key', 1013: 'C_Key', 1014: 'Ctrl_Key', 1015: 'T_Key', 1016: 'V_Key', 1017: '1_Key', 1018: '2_Key', 1019: '3_Key', 1020: '4_Key', 1021: '5_Key', 1022: 'M_Key' };
  const PADK = { 1: 'XBox_Left_Stick', 2: 'XBox_Right_Stick', 3: 'XBox_Left_Stick_Click', 4: 'XBox_B', 5: 'XBox_A', 6: 'XBox_Y', 7: 'XBox_X', 8: 'XBox_RB', 9: 'XBox_RT', 10: 'XBox_LT',
    11: 'XBox_Dpad_Down', 12: 'XBox_Right_Stick_Click', 13: 'XBox_LB', 14: 'XBox_Dpad_Left', 15: 'XBox_Dpad_Right', 16: 'XBox_Dpad_Up' };
  function renderOptPanel(el) {
    const pn = el.querySelector('.o-panel');
    const on = TX('On'), off = TX('Off');
    let h = '';
    const fs = !!document.fullscreenElement;
    if (O.tab === 0) {
      h = orow(TX('UOptionGraphicPanel_Screen_Caption'), toggles('screen', [['full', TX('EScreenMode_Fullscreen')], ['win', TX('EScreenMode_Windowed')]], fs ? 'full' : 'win', 'w320'))
        + orow(TX('UOptionGraphicPanel_Resolution_Caption'), `<div class="tg"><div class="t on disabled">${innerWidth}×${innerHeight}</div></div>`)
        + orow(TX('UOptionGraphicPanel_GraphicsQuality_Caption'), toggles('q', [['Ultra', TX('EQualityLevel_Ultra')], ['High', TX('EQualityLevel_High')], ['Medium', TX('EQualityLevel_Medium')], ['Low', TX('EQualityLevel_Low')]], 'High', '', true))
        + orow(TX('UOptionGraphicPanel_VSync_Caption'), toggles('vs', [['on', on], ['off', off]], 'on', '', true))
        + orow(TX('UOptionGraphicPanel_FPS_Caption'), toggles('fps', [['30', TX('EFrameRate_Frame30')], ['60', TX('EFrameRate_Frame60')], ['144', TX('EFrameRate_Frame144')], ['nl', TX('EFrameRate_FrameNoLimit')]], 'nl', '', true))
        + orow(TX('UOptionGraphicPanel_Gamma_Caption'), `<div class="tg">${btn('gamma', TX('UOptionGraphicPanel_Layout_TextTitle'), true)}</div>`)
        + orow(TX('UOptionGraphicPanel_CameraShaking_Caption'), toggles('shake', [['on', on], ['off', off]], O.v.shake ? 'on' : 'off'));
    } else if (O.tab === 1) {
      h = orow(TX('UOptionSoundPanel_TotalVolume_Caption'), slider('total', O.v.total, O.v.muteTotal))
        + orow(TX('UOptionSoundPanel_Bgm_Caption'), slider('bgm', O.v.bgm, O.v.muteBgm))
        + orow(TX('UOptionSoundPanel_Sfx_Caption') || TX('UOptionPage_SfxVolume_Caption'), slider('sfx', O.v.sfx, O.v.muteSfx));
    } else if (O.tab === 2) {
      h = orow(TX('UOptionGamePlayPanel_Language_Caption'), `<div class="tg"><div class="t lang on disabled">${TX('ELanguage_Vi')}<i class="tri"></i></div></div>`)
        + orow(TX('UOptionGamePlayPanel_AutoAttack_Caption'), toggles('aa', [['on', on], ['off', off]], 'off', '', true))
        + orow(TX('UOptionGamePlayPanel_Run_Caption'), toggles('run', [['t', TX('Toggle')], ['h', TX('Hold')]], 't', '', true))
        + orow(TX('UOptionGamePlayPanel_SightLine_Caption'), toggles('aim', [['on', on], ['off', off]], 'off', '', true))
        + orow(TX('UOptionGamePlayPanel_LockMouse_Caption'), toggles('lock', [['on', on], ['off', off]], 'off', '', true), TX('WindowOnly'))
        + orow(TX('UOptionGamePlayPanel_RstickAttack_Caption'), toggles('rs', [['on', on], ['off', off]], 'off', '', true), TX('PadOnly'))
        + orow(TX('UOptionGamePlayPanel_AimSupport_Caption'), toggles('as', [['on', on], ['off', off]], 'off', '', true), TX('PadOnly'));
    } else {
      const dev = O.tab === 3 ? 'Keyboard' : 'GamePad', map = O.tab === 3 ? KB : PADK;
      const rows = (T().InputAction || []).filter(r => r.ControlDevice === dev);
      h = '<div class="keys">' + rows.map(r => `<div class="ks${r.IsRebindable ? '' : ' fixed'}"><span>${esc(TX('TInputAction_Name_' + r.Id))}</span>${r.IsRebindable ? '' : '<i class="lk"></i>'}<i class="kb"><img src="${O.tab === 3 ? UI + (map[r.Id] || 'Undefined_Key') + '.webp' : M().padSrc(map[r.Id])}" alt=""></i></div>`).join('') + '</div>';
    }
    pn.innerHTML = h + (O.tab <= 2 ? btn('reset', TX('Reset'), O.tab !== 1 && O.tab !== 0) : '');
    el.querySelectorAll('.o-tabs .ot').forEach((t, i) => t.classList.toggle('on', i === O.tab));
  }
  function setSlider(el, name, v) {
    O.v[name] = Math.max(0, Math.min(10, Math.round(v)));
    saveOpt(); applyOpt(); renderOptPanel(el);
    if (M().focusEl && M().device === 'pad') { const b = el.querySelector(`.sl[data-name="${name}"] .bar`); if (b) M().focus(b); }
  }
  M().register('Option', {
    build(el) {
      el.innerHTML = `<div class="mp-bg"><i class="line" style="left:300px"></i></div>${topBar(TX('Option'))}
        <div class="o-tabs">${OTABS.map((t, i) => `<div class="ot" data-i="${i}" data-nav><i style="--m:url(../${UI}${t[1]}.webp)"></i></div>`).join('')}</div>
        <div class="o-panel"></div>
        ${M().keyGuide([M().CLOSE, M().SELECT])}`;
      el.querySelector('.o-tabs').addEventListener('click', e => { const t = e.target.closest('.ot'); if (t) { O.tab = +t.dataset.i; renderOptPanel(el); M().sfx('ButtonClick'); } });
      const pn = el.querySelector('.o-panel');
      pn.addEventListener('click', e => {
        const t = e.target.closest('.t');
        if (t && !t.classList.contains('disabled')) {
          const name = t.parentNode.dataset.name, v = t.dataset.v;
          if (name === 'shake') { O.v.shake = v === 'on'; saveOpt(); applyOpt(); }
          if (name === 'screen') { try { if (v === 'full') document.documentElement.requestFullscreen(); else if (document.fullscreenElement) document.exitFullscreen(); } catch (err) { /* trình duyệt từ chối */ } }
          renderOptPanel(el); M().sfx('ButtonClick'); return;
        }
        const m = e.target.closest('.snd');
        if (m) { const k = 'mute' + m.dataset.mute[0].toUpperCase() + m.dataset.mute.slice(1); O.v[k] = !O.v[k]; saveOpt(); applyOpt(); renderOptPanel(el); return; }
        const r = e.target.closest('.mp-btn.reset');
        if (r && !r.classList.contains('disabled')) {
          if (O.tab === 1) Object.assign(O.v, { total: 10, bgm: 10, sfx: 10, muteTotal: false, muteBgm: false, muteSfx: false });
          if (O.tab === 0) O.v.shake = true;
          saveOpt(); applyOpt(); renderOptPanel(el);
        }
      });
      // Kéo thanh trượt bằng chuột.
      pn.addEventListener('pointerdown', e => {
        const bar = e.target.closest('.sl .bar');
        if (!bar) return;
        const name = bar.parentNode.dataset.name;
        const at = ev => { const r = bar.getBoundingClientRect(); setSlider(el, name, (ev.clientX - r.left) / r.width * 10); };
        at(e);
        const mv = ev => { if (ev.buttons & 1) at(ev); };
        const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
        addEventListener('pointermove', mv); addEventListener('pointerup', up);
      });
      O.el = el;
    },
    show() { renderOptPanel(O.el); },
    // OptionLeft/OptionRight (d-pad/cần trái trái-phải) chỉnh thanh trượt đang chọn; Y (MuteToggle) tắt tiếng.
    padDir(dir, el) {
      const bar = el && el.closest && el.closest('.sl .bar');
      if (bar && (dir === 'left' || dir === 'right')) { const n = bar.parentNode.dataset.name; setSlider(O.el, n, O.v[n] + (dir === 'right' ? 1 : -1)); return true; }
      return false;
    },
    pad(b, el) {
      const sl = el && el.closest && el.closest('.sl');
      if (b === M().BTN.Y && sl) { sl.querySelector('.snd').click(); return true; }
      return false;
    },
  });

  // ================================================================ System (SystemPageView)
  // Cột nút 640×76 cách 40 giữa màn: Tiếp tục, Buộc Thoát Lặn, (Rời Sảnh Co-op — chỉ ở sảnh co-op), Về màn hình chính,
  // Sổ Tay Vận Hành, Thoát Game; hai tay DecoMenuSystemHand #707070 30 % hai bên (bên trái lật).
  M().register('System', {
    build(el) {
      el.innerHTML = `<i class="y-hand l"></i><i class="y-hand r"></i><div class="y-btns">
          ${btn('cont', TX('Continue'))}${btn('giveup', TX('GiveUpStage'))}${btn('title', TX('ReturnToTitle'))}${btn('manual', TX('Manual'), true)}${btn('end', TX('EndGame'), true)}</div>
        ${M().keyGuide([M().CLOSE])}`;
      el.querySelector('.cont').onclick = () => VD.inventory.toggle(false);
      // Buộc Thoát Lặn: "tính là thoát thất bại" (GiveUpDescription) → như Lua ForceReturnToTitle của web (finish 'abandon').
      const quit = async (title, body) => {
        const ok = VD.app && VD.app.confirmBox ? await VD.app.confirmBox(title, body) : confirm(body);
        if (!ok) return;
        VD.inventory.toggle(false);
        if (VD.lua && VD.lua.api && VD.lua.api.ForceReturnToTitle) VD.lua.api.ForceReturnToTitle();
      };
      el.querySelector('.giveup').onclick = () => quit(TX('GiveUpStage'), TX('GiveUpDescription').replace(/\\n/g, '\n'));
      el.querySelector('.title').onclick = () => quit(TX('ReturnToTitle'), TX('ReturnToTitleDescription'));
    },
  });

  applyOpt();
})(window.VD = window.VD || {});
