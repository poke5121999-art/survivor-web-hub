/*
 * HUD luôn bật khi đang lái thuyền / câu: bánh xe thời gian, mắt hoảng loạn, tiền, độ sâu, la bàn, ô hỏng thân tàu,
 * gợi ý tương tác và thông báo nổi. Đọc DR.s và DR.view mỗi khung hình (DR.view do engine ghi).
 * Thông báo nổi và thông báo nhiệm vụ nằm ở lớp riêng #dr-float để vẫn thấy khi đang neo bến (HUD chính ẩn lúc đó).
 *   - Thông báo nhiệm vụ: Notification.prefab (250+100 x 100, nền NotificationBox, chữ 23) xếp từ góc trên trái
 *     (NotificationHolder neo (0,1)); chữ gốc notification.quest-started / quest-progressed / quest-completed.
 *   - Sổ nhiệm vụ (Pursuits, JournalWindow/QuestEntryUI): phím J hoặc nút "Nhiệm vụ"; nền PursuitsDialogBackground,
 *     bước đã xong có PursuitTickIcon; nhiệm vụ có cập nhật chưa xem gắn chấm (hasUnseenUpdate).
 *   DRHud.toast(text, ms)  DRHud.notify(kind, questId)  DRHud.journal(open?)  DRHud.journalOpen()
 */
(function (root) {
  'use strict';
  const me = document.currentScript;
  if (!document.querySelector('link[href*="ui.css"]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = new URL('../css/ui.css', (me && me.src) || location.href).href;
    document.head.appendChild(l);
  }

  const MSG = {
    need_rod: 'Cần cần câu', no_equipment: 'Cần loại cần câu khác', wrong_time: 'Không có cá giờ này',
    no_stock: 'Hết cá', need_advanced: 'Cần cần câu nâng cao'
  };
  // Mốc kho theo HarvestMinigameView: >=5 nhiều, >=3 vừa, >0 ít, 0 hết.
  const bucket = s => s >= 5 ? 3 : s >= 3 ? 2 : s > 0 ? 1 : 0;
  const BUCKET_TXT = ['Hết cá', 'Cá còn ít', 'Cá vừa phải', 'Cá dồi dào'];
  const pad2 = n => (n < 10 ? '0' : '') + n;

  let el = null;
  const cache = {};
  const pending = [];
  let toasts = null, float = null, notes = null, jr = null, jbtn = null;

  function div(cls, parent, html) {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    if (html) d.innerHTML = html;
    if (parent) parent.appendChild(d);
    return d;
  }
  // Chỉ ghi DOM khi giá trị đổi.
  function put(key, val, fn) { if (cache[key] !== val) { cache[key] = val; fn(val); } }

  function build() {
    if (el) return;
    el = div('dr-ui', document.body); el.id = 'dr-hud';
    const tl = div('hud-tl', el);
    const w = div('hud-wheel', tl, '<div class="wheel"></div><div class="orb"><i class="dr-mask"></i></div><div class="txt"><div class="day"></div><div class="clock"></div></div>');
    const eye = div('hud-eye', tl, '<div class="shut dr-mask"></div><div class="lid dr-mask"></div><div class="pupil"></div>');
    const hull = div('hud-hull', el);
    const tr = div('hud-tr', el, '<div class="hud-funds"><small>Tiền</small><span></span></div><div class="hud-depth"><span class="ic dr-mask"></span><span class="v"></span></div><div class="hud-zone"></div>');
    const comp = div('hud-compass', el, '<div class="rose"></div><div class="ring"></div>');
    const prompt = div('hud-prompt', el, '<b></b><span></span>');
    const bag = document.createElement('button');
    bag.className = 'dr-btn hud-bag'; bag.textContent = 'Hành lý';
    bag.title = 'Mở khoang thuyền (Tab / I)';
    bag.onclick = () => { if (root.DRCargo && DR.mode === 'sail') DRCargo.open({ keys: ['INVENTORY'], title: 'Khoang thuyền' }); };
    el.appendChild(bag);
    float = div('dr-ui', document.body); float.id = 'dr-float';
    toasts = div('hud-toasts', float);
    notes = div('qn-stack', float);
    jbtn = document.createElement('button');
    jbtn.className = 'dr-btn qn-jbtn'; jbtn.title = 'Sổ nhiệm vụ (J)'; jbtn.dataset.act = 'journal';
    jbtn.innerHTML = '<i></i><span>Nhiệm vụ</span><b class="dot"></b>';
    jbtn.onclick = () => journal();
    float.appendChild(jbtn);
    // Chạm vào gợi ý = nhấn Space (màn cảm ứng không có phím).
    prompt.onclick = () => {
      for (const t of ['keydown', 'keyup']) root.dispatchEvent(new KeyboardEvent(t, { code: 'Space', key: ' ', bubbles: true }));
    };
    el._ = { w, eye, hull, tr, comp, prompt, bag };
    pending.splice(0).forEach(p => toast(p[0], p[1]));
  }

  function toast(text, ms) {
    if (!el) { pending.push([text, ms]); return; }
    const t = div('hud-toast', toasts); t.textContent = text;
    while (toasts.children.length > 4) toasts.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 600); }, ms || 3200);
  }

  // ---------------------------------------------------------------- nhiệm vụ
  const QSTR = { started: 'notification.quest-started', updated: 'notification.quest-progressed', completed: 'notification.quest-completed' };
  const QVI = { started: 'Nhiệm vụ mới', updated: 'Nhiệm vụ cập nhật', completed: 'Hoàn thành nhiệm vụ' };
  function notify(kind, id) {
    if (!notes) return;
    const Q = root.DRQuests;
    const n = div('qn', notes);
    n.dataset.kind = kind; n.dataset.quest = id;
    const orig = (root.DR_STR && DR_STR[QSTR[kind]]) || '';
    n.innerHTML = '<i class="ic"></i><div><b></b><span></span><small></small></div>';
    n.querySelector('b').textContent = QVI[kind] || kind;
    n.querySelector('span').textContent = Q ? Q.title(id) : id;
    n.querySelector('small').textContent = orig;
    while (notes.children.length > 3) notes.firstChild.remove();
    try { if (root.DRAudio) DRAudio.play(kind === 'completed' ? 'ui.pursuit.complete' : 'ui.pursuit.update'); } catch (e) { /* tiếng không bắt buộc */ }
    setTimeout(() => { n.classList.add('out'); setTimeout(() => n.remove(), 600); }, 4200);
    updateDot();
  }
  function updateDot() {
    if (!jbtn || !root.DRQuests || !root.DR || !DR.s) return;
    jbtn.classList.toggle('unseen', DRQuests.list().some(q => q.unseen));
  }
  const sfx = k => { try { if (root.DRAudio) DRAudio.play(k); } catch (e) { /* tiếng không bắt buộc */ } };
  let jsel = null;
  function journal(open) {
    if (!float || !root.DRQuests || !root.DR || !DR.s) return;
    const on = open == null ? !jr : !!open;
    if (!on) { if (jr) { jr.remove(); jr = null; sfx('ui.journal.close'); } return; }
    if (root.DRDialogue && DRDialogue.isOpen()) return;
    if (!jr) sfx('ui.journal.open');
    renderJournal();
  }
  function renderJournal() {
    const list = DRQuests.list();
    if (jr) jr.remove();
    jr = div('qj', float);
    jr.onpointerdown = e => { if (e.target === jr) journal(false); };
    const panel = div('qj-panel', jr);
    const head = div('qj-head', panel, '<h2>Sổ nhiệm vụ</h2><small>' + esc((root.DR_STR && DR_STR['quests.header']) || 'Pursuits') + '</small>');
    const x = document.createElement('button'); x.className = 'dr-btn'; x.textContent = 'Đóng'; x.dataset.act = 'close';
    x.onclick = () => journal(false); head.appendChild(x);
    const body = div('qj-body', panel);
    const nav = div('qj-list', body), main = div('qj-main', body);
    if (!list.length) { main.innerHTML = '<div class="qj-empty">Chưa có nhiệm vụ nào. Hãy nói chuyện với người dân ở bến.</div>'; return; }
    if (!jsel || !list.some(q => q.id === jsel)) jsel = list[0].id;
    DRQuests.markSeen(jsel);
    for (const q of list) if (q.id === jsel) q.unseen = false;
    for (const q of list) {
      const b = document.createElement('button');
      b.className = 'qj-item' + (q.id === jsel ? ' sel' : '') + (q.state === 'COMPLETED' ? ' done' : '');
      b.dataset.quest = q.id;
      b.innerHTML = '<span></span>' + (q.unseen ? '<i class="dot"></i>' : '');
      b.firstChild.textContent = q.title;
      b.onclick = () => { jsel = q.id; sfx('ui.journal.page.1'); renderJournal(); };
      nav.appendChild(b);
    }
    const q = list.find(v => v.id === jsel);
    DRQuests.markSeen(q.id); updateDot();
    const h = document.createElement('h3'); h.textContent = q.title; main.appendChild(h);
    div('qj-sum', main).textContent = q.summary;
    div('qj-tasks-h', main).textContent = (root.DR_STR && DR_STR['quest-details.task-header']) || 'Tasks:';
    for (const st of q.steps) {
      const r = div('qj-step' + (st.done ? ' done' : ''), main);
      r.dataset.step = st.id;
      r.innerHTML = '<i></i><span></span>';
      r.lastChild.textContent = st.text;
    }
    if (q.resolution) div('qj-res', main).textContent = q.resolution;
  }

  function frame() {
    requestAnimationFrame(frame);
    if (float && root.DR) {
      const vis = !!DR.s && (DR.mode === 'sail' || DR.mode === 'dock') && !(root.DRDialogue && DRDialogue.isOpen()) && !(root.DRIntro && DRIntro.playing);
      put('jb', vis, v => jbtn.classList.toggle('on', v));
    }
    if (!el || !root.DR || !DR.s) return;
    const on = (DR.mode === 'sail' || DR.mode === 'harvest') && !(root.DRMinigame && DRMinigame.isOpen());
    put('on', on, v => el.classList.toggle('on', v));
    if (!on) return;
    const s = DR.s, v = DR.view || {}, u = el._;

    // Thời gian: phần nguyên = ngày (bắt đầu từ ngày 1), phần lẻ 0 = nửa đêm.
    const f = s.time - Math.floor(s.time), hh = Math.floor(f * 24), mm = Math.floor((f * 24 - hh) * 60);
    put('day', Math.floor(s.time) + 1, d => u.w.querySelector('.day').textContent = 'Ngày ' + d);
    put('clock', pad2(hh) + ':' + pad2(mm), c => u.w.querySelector('.clock').textContent = c);
    const isDay = v.isDay != null ? v.isDay : (f > 0.25 && f < 0.75);
    put('dn', isDay, d => {
      const i = u.w.querySelector('.orb i');
      // Biến CSS giải url() theo tệp css, không theo trang: đưa đường dẫn tuyệt đối.
      i.style.setProperty('--m', 'url(' + new URL('art/ui/sprites/' + (d ? 'sun-icon' : 'moon-icon') + '.webp', document.baseURI).href + ')');
      i.style.setProperty('--c', d ? '#ffd104' : '#cfe3ff');
    });
    const sz = u.w.offsetWidth;
    u.w.querySelector('.orb').style.transform = 'rotate(' + ((f - 0.5) * 360).toFixed(1) + 'deg) translateY(' + (-sz * 0.4).toFixed(1) + 'px) rotate(' + (-(f - 0.5) * 360).toFixed(1) + 'deg)';

    // Mắt hoảng loạn: 0 nhắm .. 4 đỏ.
    const stage = root.DRRules ? DRRules.panicStage(s.sanity) : 0;
    put('eye', stage, st => {
      u.eye.dataset.stage = st;
      const lid = u.eye.querySelector('.lid'), shut = u.eye.querySelector('.shut'), pu = u.eye.querySelector('.pupil');
      shut.style.opacity = st === 0 ? 1 : 0;
      shut.style.setProperty('--c', '#cfe3ff');
      lid.style.opacity = st === 0 ? 0 : 1;
      lid.style.transform = 'scaleY(' + [0.1, 0.35, 0.6, 0.85, 1][st] + ')';
      lid.style.setProperty('--c', ['#e9dcc2', '#e9dcc2', '#f2d9a0', '#ff9a3b', '#dc2c38'][st]);
      pu.style.opacity = st === 0 ? 0 : 1;
      pu.style.transform = 'scale(' + [0, 0.6, 0.8, 1, 1.15][st] + ')';
      pu.style.filter = st >= 3 ? 'sepia(1) saturate(6) hue-rotate(-30deg)' : 'none';
    });

    put('funds', s.funds, fu => u.tr.querySelector('.hud-funds span').textContent = '$' + fu.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    const depth = v.depthM == null ? '--' : Math.round(v.depthM) + ' m';
    put('depth', depth, d => u.tr.querySelector('.hud-depth .v').textContent = d);
    put('zone', v.zone || '', z => u.tr.querySelector('.hud-zone').textContent = z);

    put('hdg', Math.round((v.heading || 0) * 573) / 10, a => u.comp.querySelector('.rose').style.transform = 'rotate(' + (-a) + 'deg)');

    // Thân tàu: ô hỏng so với ngưỡng chết (chết khi hỏng > ngưỡng).
    const inv = DR.grid('INVENTORY');
    const total = DRRules.damageThreshold(DR_CONFIG, s.hullTier) + 1, bad = Math.min(total, inv ? inv.damage.length : 0);
    put('hull', total + ':' + bad, () => {
      u.hull.innerHTML = '';
      for (let i = 0; i < total; i++) u.hull.appendChild(Object.assign(document.createElement('i'), { className: i < bad ? 'bad' : 'ok' }));
      u.hull.title = 'Thân tàu: ' + bad + '/' + total + ' ô hỏng';
    });

    // Gợi ý tương tác: bến ưu tiên hơn điểm câu; đang câu thì ẩn.
    let html = '', warn = false;
    if (DR.mode === 'sail') {
      if (v.nearDock) html = '<b>Cập bến — Space</b><span>' + esc(v.nearDock.name) + '</span>';
      else if (v.nearSpot) {
        const sp = v.nearSpot, ok = !sp.status || sp.status === 'ok';
        if (ok) {
          const b = bucket(sp.stock);
          html = '<b>Câu cá — Space</b><span>' + esc(sp.name || '') + (sp.name ? ' · ' : '') + BUCKET_TXT[b] +
            '<span class="hud-stock">' + [1, 2, 3].map(i => '<i class="' + (i <= b ? 'f' : '') + '"></i>').join('') + '</span></span>';
        } else {
          warn = true;
          html = '<b>' + (MSG[sp.status] || sp.status) + '</b><span>' + esc(sp.name || '') + '</span>';
        }
      }
    }
    put('prompt', html + warn, () => { u.prompt.innerHTML = html || '<b></b><span></span>'; u.prompt.classList.toggle('on', !!html); u.prompt.classList.toggle('warn', warn); });
  }
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function init() {
    build(); requestAnimationFrame(frame);
    if (root.DR && DR.on) {
      DR.on('quest', ev => { if (ev && ev.id) notify(ev.kind, ev.id); if (jr) renderJournal(); });
      DR.on('questState', () => updateDot());
      DR.on('mode', m => { if (m === 'title' || m === 'harvest' || m === 'over') journal(false); });
      DR.on('dialogue', on => { if (on) journal(false); });
    }
    root.addEventListener('keydown', e => {
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.code === 'KeyJ' && !e.repeat && root.DR && DR.s && (DR.mode === 'sail' || DR.mode === 'dock') && !(root.DRCargo && DRCargo.isOpen && DRCargo.isOpen())) { e.preventDefault(); journal(); }
      else if (jr && (e.code === 'Escape' || e.code === 'KeyX')) { e.preventDefault(); e.stopImmediatePropagation(); journal(false); }
    }, true);
  }
  if (document.body) init(); else document.addEventListener('DOMContentLoaded', init);

  root.DRHud = {
    toast, notify, journal, journalOpen: () => !!jr,
    _debug: () => ({ cache: Object.assign({}, cache), notes: notes ? [...notes.children].map(n => ({ kind: n.dataset.kind, quest: n.dataset.quest, text: n.textContent })) : [] })
  };
})(window);
