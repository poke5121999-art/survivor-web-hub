// HUD trong lượt lặn, bố cục theo ảnh chụp bản gốc (Steam): góc trái dưới pin đèn + máu + căng thẳng,
// giữa dưới dãy skill LMB/RMB/Space/Q/E/R, phải dưới 6 ô đồ, trên cùng thanh máu boss.
// Lớp nổi theo thế giới: thanh máu quái, dấu ?/!, số sát thương, bong bóng thoại.
(function (VD) {
  'use strict';
  const THREE = window.THREE;
  const $ = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
  const icon = (kind, name) => { const a = VD.ASSETS && VD.ASSETS.icon && VD.ASSETS.icon[kind]; return (a && a.dir ? a.dir : 'art/ui/icon_' + kind + '/') + name + '.webp'; };
  const T = k => (VD.TEXT && VD.TEXT[k]) || '';

  const SLOTS = [
    { key: 'attack', label: 'LMB' }, { key: 'SkillOne', label: 'RMB' }, { key: 'dash', label: 'Space' },
    { key: 'SkillTwo', label: 'Q' }, { key: 'SkillThree', label: 'E' }, { key: 'SkillFour', label: 'R' },
  ];

  const H = { root: null, on: false, floats: [], bubbles: [], stexts: [], unitTags: new Map() };
  const v3 = new THREE.Vector3();

  function project(x, y, z) {
    v3.set(x, y, z).project(VD.render.camera);
    const c = VD.render.renderer.domElement;
    return { x: (v3.x + 1) / 2 * c.clientWidth, y: (1 - v3.y) / 2 * c.clientHeight, vis: v3.z < 1 };
  }

  H.build = function () {
    const ui = document.getElementById('ui');
    const r = H.root = $('div', 'vd-hud', ui);
    H.world = $('div', 'vd-hud-world', r);
    const left = $('div', 'vd-hud-left', r);
    H.light = $('div', 'vd-light', left, '<div class="bulb"></div><div class="pct">100%</div>');
    const bars = $('div', 'vd-bars', left);
    H.hpBar = $('div', 'vd-bar hp', bars, '<i class="fill"></i><i class="shield"></i><span></span>');
    H.stBar = $('div', 'vd-bar stress', bars, '<i class="fill"></i><span></span>');
    H.staBar = $('div', 'vd-bar sta', bars, '<i class="fill"></i>');
    H.skills = $('div', 'vd-skills', r);
    H.slotEls = SLOTS.map(s => {
      const el = $('div', 'vd-skill', H.skills, '<img><div class="cd"></div><div class="cdt"></div><div class="stk"></div><b></b>');
      el.querySelector('b').textContent = s.label;
      return el;
    });
    H.items = $('div', 'vd-items', r);
    H.itemEls = [1, 2, 3, 4, 5].map(i => { const el = $('div', 'vd-item', H.items, '<img><span></span><b>' + i + '</b>'); return el; });
    H.boss = $('div', 'vd-boss', r, '<div class="name"></div><div class="vd-bar bosshp"><i class="fill"></i></div>');
    H.quest = $('div', 'vd-quest', r);
    H.center = $('div', 'vd-center', r);
    buildKeyGuide(r);
    H.on = true;
  };

  // Bảng phím góc phải dưới theo KeyGuidePanel! gốc (InGameKeyGuidePanelView): dòng "Hướng Dẫn [O]" luôn hiện, danh sách
  // phím (nhóm Toggle, mặc định tắt trong prefab) bật/tắt bằng O (InGame/ToggleKeyGuide). Ảnh phím: art/ui/tutorial/key.
  // Bỏ hai dòng Emoji [T] và Ping [Ctrl] của bản gốc: chỉ dùng khi chơi nhiều người, bản web chưa có.
  const KEY_ROWS = [['Attack', 'Mouse_Left_Key'], ['Dash', 'Space_Key'], ['Run', 'LeftShift_Key'], ['MiniMap', 'M_Key'], ['Inventory', 'Tab_Key']];
  const KG_STORE = 'voiddiver.keyguide';
  function buildKeyGuide(r) {
    const k = n => `<img class="vd-key" src="art/ui/tutorial/key/${n}.webp" alt="">`;
    const row = (key, img) => `<div class="row"><span>${T('UInGameKeyGuidePanel_' + key + '_Desc')}</span>${k(img)}</div>`;
    H.keyGuide = $('div', 'vd-keyguide', r,
      `<div class="list">${KEY_ROWS.map(([a, b]) => row(a, b)).join('')}</div>` + `<div class="row head">${T('UInGameKeyGuidePanel_ControlGuide_Desc') || 'Hướng Dẫn'}${k('O_Key')}</div>`);
    let on = false;
    try { on = localStorage.getItem(KG_STORE) === '1'; } catch (e) { /* chế độ riêng tư */ }
    H.keyGuide.classList.toggle('open', on);
    H.keyGuide.querySelector('.head').addEventListener('click', () => H.toggleKeyGuide());
  }
  H.toggleKeyGuide = function (on) {
    if (!H.keyGuide) return;
    const v = on == null ? !H.keyGuide.classList.contains('open') : !!on;
    H.keyGuide.classList.toggle('open', v);
    try { localStorage.setItem(KG_STORE, v ? '1' : '0'); } catch (e) { /* chế độ riêng tư */ }
  };
  addEventListener('keydown', e => {
    if (e.code !== 'KeyO' || e.repeat || !H.on || !H.root || H.root.style.display === 'none') return;
    if (VD.input && VD.input.enabled === false) return;      // hội thoại / túi đồ đang mở
    H.toggleKeyGuide();
  });
  H.show = function (on) { if (!H.root) H.build(); H.root.style.display = on ? '' : 'none'; H.on = on; };

  function setBar(el, v, max, text) {
    el.querySelector('.fill').style.width = (max > 0 ? Math.max(0, Math.min(1, v / max)) * 100 : 0) + '%';
    const s = el.querySelector('span'); if (s && text != null) s.textContent = text;
  }

  function skillForSlot(u, key) {
    if (key === 'attack' || key === 'dash') return VD.Skill.slotSkill(u, key);
    const lo = VD.stage.loadout || {};
    return lo[key] >= 0 ? VD.Skill.slotSkill(u, 'skill' + lo[key]) : 0;
  }

  H.setQuest = function (title, lines) {
    if (!H.root) H.build();
    H.quest.innerHTML = '';
    if (!title) return;
    $('div', 'title', H.quest).textContent = title;
    for (const l of lines || []) $('div', 'line' + (l.done ? ' done' : ''), H.quest).textContent = (l.done ? '◆ ' : '◇ ') + l.text;
  };
  H.setBoss = function (u) { H.bossUnit = u; };
  H.centerText = function (s, ms) {
    if (!H.root) H.build();
    H.center.textContent = s; H.center.classList.add('on');
    clearTimeout(H._ct); H._ct = setTimeout(() => H.center.classList.remove('on'), ms || 2200);
  };

  // Số sát thương: nổi lên từ đầu mục tiêu. Chí mạng to hơn, đòn vào người chơi màu đỏ.
  H.damage = function (e) {
    if (!H.root || !e.tgt || !(e.amount > 0)) return;
    const el = $('div', 'vd-dmg' + (e.crit ? ' crit' : '') + (e.tgt === VD.stage.player ? ' taken' : '') + (e.back ? ' back' : ''), H.world);
    el.textContent = Math.round(e.amount);
    H.floats.push({ el, x: e.tgt.pos.x + (Math.random() - 0.5) * 0.3, z: e.tgt.pos.z, y: 1.1, t: 0, life: 0.8 });
  };
  // Chữ trạng thái nổi trên đơn vị ("Thanh Tẩy", "Bất bại!", "Miễn nhiễm Đẩy Lùi"): prefab gốc StatusEffectText /
  // BuffActiveText của GameFloatingTextManager (EFloatingTextType). [ĐO] TMP Pretendard-Bold 28 (khung 1080p), nghiêng,
  // màu (0.929, 0.929, 0.929), giãn chữ −5, vật liệu SlashShadow (bóng đổ đen 63% lệch phải-xuống, mềm 0.4);
  // Animator FloatingText_ImpactUp 0.667 s: scale 2 → 1 trong 0.11 s (vọt 0.975/1.029), alpha 0 → 1 trong 0.11 s,
  // giữ tới 0.28 s rồi mờ về 0 lúc 0.667 s, cuối clip bay lên 50 px (bắt đầu từ ~0.39 s).
  // [SUY LUẬN] Neo ở chân + 0.9 m (Root của manager @y 0.9), lệch ngẫu nhiên ±_randomOffset (0.5) × 0.5 m.
  const IMPACT = { s: [[0, 2], [0.056, 1.586], [0.111, 0.981], [0.167, 0.975], [0.222, 1.029], [0.278, 1]],
    a: [[0, 0], [0.056, 0.741], [0.111, 1], [0.278, 0.987], [0.333, 0.896], [0.389, 0.741], [0.444, 0.55], [0.5, 0.352], [0.556, 0.175], [0.611, 0.049], [0.667, 0]],
    y: [[0, 0], [0.333, -0.37], [0.389, 0.623], [0.444, 3.531], [0.5, 9.137], [0.556, 18.227], [0.611, 31.586], [0.667, 50]] };
  const lerpKeys = (ks, t) => {
    if (t <= ks[0][0]) return ks[0][1];
    for (let i = 1; i < ks.length; i++) if (t <= ks[i][0]) { const a = ks[i - 1], b = ks[i]; return a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0]); }
    return ks[ks.length - 1][1];
  };
  const recent = new Map();
  H.statusText = function (u, text) {
    if (!H.root || !u || !text) return;
    const k = u.uid + '|' + text, now = performance.now();
    if (now - (recent.get(k) || -1e9) < 400) return;   // không có trong bảng: nhiều hitbox chạm cùng khung chỉ hiện một chữ
    recent.set(k, now);
    const el = $('div', 'vd-stext', H.world);
    el.textContent = text;
    el.style.cssText = 'position:absolute;left:0;top:0;white-space:nowrap;pointer-events:none;will-change:transform,opacity;' +
      "font-family:'Pretendard',system-ui,sans-serif;font-weight:700;font-style:italic;letter-spacing:-0.05em;color:rgb(237,237,237);" +
      'text-shadow:0.08em 0.08em 0.1em rgba(0,0,0,0.63);opacity:0;';
    H.stexts.push({ el, u, dx: (Math.random() - 0.5) * 0.5, dz: (Math.random() - 0.5) * 0.5, t: 0 });
  };
  H.bubbleAt = function (u, text) {
    if (!H.root) H.build();
    if (!u || !text) return;
    const el = $('div', 'vd-bubble', H.world);
    el.textContent = text;
    H.bubbles.push({ el, u, t: 0, life: 2.8 + text.length * 0.04 });
  };
  // ShowBubbleText(type, id, text) của Lua: người nói là nhân vật người chơi.
  H.bubble = function (type, id, text) { H.bubbleAt(VD.stage.player, text); };

  H.update = function (dt) {
    if (!H.on || !H.root) return;
    const u = VD.stage.player;
    if (!u) return;
    const st = u.stats || {};
    const maxHp = st.HpMax || 1;
    setBar(H.hpBar, u.hp, maxHp, Math.ceil(u.hp) + ' / ' + Math.round(maxHp));
    H.hpBar.querySelector('.shield').style.width = Math.min(100, ((u.shield || 0) / maxHp) * 100) + '%';
    setBar(H.stBar, u.stress, 100, Math.floor(u.stress) + ' / 100');
    setBar(H.staBar, u.stamina, st.StaminaMax || 100);
    H.staBar.style.opacity = u.stamina < (st.StaminaMax || 100) - 0.5 ? 1 : 0;
    const lp = Math.max(0, Math.round(u.light == null ? 100 : u.light));
    H.light.querySelector('.pct').textContent = lp + '%';
    H.light.classList.toggle('low', lp <= 20);
    const now = VD.stage.A.time;
    SLOTS.forEach((s, i) => {
      const el = H.slotEls[i], id = skillForSlot(u, s.key);
      const img = el.querySelector('img');
      if (!id) { el.classList.add('empty'); img.removeAttribute('src'); return; }
      el.classList.remove('empty');
      const row = VD.combatDB().skill(id) || {};
      // Skill.UseIcon = false (đánh thường của Mio 10011000): bản gốc không có icon, atlas cũng không có ảnh.
      if (row.UseIcon === false) { img.removeAttribute('src'); img.dataset.src = ''; img.style.visibility = 'hidden'; }
      else {
        const src = icon('skill', id);
        if (img.dataset.src !== src) { img.style.visibility = ''; img.onerror = () => { img.style.visibility = 'hidden'; }; img.src = src; img.dataset.src = src; }
      }
      const cdLeft = Math.max(0, (u.cd[id] || 0) - now);
      const full = VD.Stats.cooldown ? VD.Stats.cooldown(VD.combatDB(), u, row) : row.CoolTime || 1;
      let frac = cdLeft > 0 && full > 0 ? cdLeft / full : 0;
      if (row.ChargeCost > 0) frac = 1 - Math.min(1, (u.charge || 0) / row.ChargeCost);
      el.querySelector('.cd').style.height = (frac * 100) + '%';
      el.querySelector('.cdt').textContent = cdLeft > 0.05 ? (cdLeft < 1 ? cdLeft.toFixed(1) : Math.ceil(cdLeft)) : '';
      const stk = row.StackCount > 1 ? (u.stacks[id] != null ? u.stacks[id] : row.StackCount) : '';
      el.querySelector('.stk').textContent = stk === '' ? '' : stk;
      el.classList.toggle('ready', frac === 0 && row.ChargeCost > 0);
      el.classList.toggle('active', !!(u.run && u.run.id === id));
    });
    // Thanh máu boss.
    const b = H.bossUnit;
    if (b && !b.removed) {
      H.boss.classList.add('on');
      H.boss.querySelector('.name').textContent = '- ' + (T('TMonster_Name_' + b.id) || '') + ' -';
      setBar(H.boss.querySelector('.bosshp'), b.hp, b.stats.HpMax);
    } else H.boss.classList.remove('on');
    // Lớp nổi.
    for (let i = H.floats.length - 1; i >= 0; i--) {
      const f = H.floats[i]; f.t += dt;
      const p = project(f.x, f.y + f.t * 0.9, f.z);
      f.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) scale(${f.t < 0.08 ? 1.5 - f.t * 6 : 1})`;
      f.el.style.opacity = f.t > f.life * 0.6 ? 1 - (f.t - f.life * 0.6) / (f.life * 0.4) : 1;
      if (f.t > f.life) { f.el.remove(); H.floats.splice(i, 1); }
    }
    const px = (VD.render.renderer.domElement.clientHeight || 1080) / 1080;   // cỡ gốc tính trên khung 1080p
    for (let i = H.stexts.length - 1; i >= 0; i--) {
      const f = H.stexts[i]; f.t += dt;
      if (f.t > 0.667 || f.u.removed) { f.el.remove(); H.stexts.splice(i, 1); continue; }
      const p = project(f.u.pos.x + f.dx, 0.9, f.u.pos.z + f.dz);
      f.el.style.fontSize = (28 * px).toFixed(1) + 'px';
      f.el.style.transform = `translate(${p.x}px, ${p.y - lerpKeys(IMPACT.y, f.t) * px}px) translate(-50%, -50%) scale(${lerpKeys(IMPACT.s, f.t)})`;
      f.el.style.opacity = lerpKeys(IMPACT.a, f.t);
    }
    for (let i = H.bubbles.length - 1; i >= 0; i--) {
      const bb = H.bubbles[i]; bb.t += dt;
      const p = project(bb.u.pos.x, 1.35, bb.u.pos.z);
      bb.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
      if (bb.t > bb.life || bb.u.removed) { bb.el.remove(); H.bubbles.splice(i, 1); }
    }
    // Thanh máu quái và dấu ?/! (chỉ khi đã bị đánh hoặc đang giao chiến).
    const seen = new Set();
    for (const m of VD.stage.units) {
      if (m.kind !== 'mon' || m.dead || m === H.bossUnit) continue;
      const hurt = m.hp < m.stats.HpMax - 0.5, state = m.aiState;
      if (!hurt && state !== 'curious' && state !== 'combat') continue;
      seen.add(m);
      let tag = H.unitTags.get(m);
      if (!tag) { tag = $('div', 'vd-mtag', H.world, '<b></b><div class="vd-bar mhp"><i class="fill"></i></div>'); H.unitTags.set(m, tag); }
      const vis = VD.stage.vis.get(m.uid);
      const top = vis ? 0.9 * (vis.scale || 1) : 0.9;
      const p = project(m.pos.x, top + 0.25, m.pos.z);
      tag.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
      tag.querySelector('b').textContent = state === 'curious' ? '?' : state === 'combat' && m.combatSince > now - 1.2 ? '!' : '';
      tag.querySelector('.mhp').style.display = hurt ? '' : 'none';
      setBar(tag.querySelector('.mhp'), m.hp, m.stats.HpMax);
    }
    for (const [m, tag] of H.unitTags) if (!seen.has(m)) { tag.remove(); H.unitTags.delete(m); }
  };

  VD.hud = H;
})(window.VD = window.VD || {});
