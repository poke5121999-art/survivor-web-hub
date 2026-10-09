/*
 * HUD luôn bật khi đang lái thuyền / câu: mặt đồng hồ nửa vòng giữa trên (TopPanel: Day + Time + TimeWheel + Compass + SanityUI),
 * chip khoang TAB góc phải trên, gợi ý tương tác và thông báo nổi. Đọc DR.s và DR.view mỗi khung hình.
 *   - Bố cục TopPanel lấy từ Scenes/Game.unity (GameCanvases/GameCanvas/TopPanel, canvas 1920x1080, tâm trên giữa):
 *     Day (300x26, y 1), Time (HorizontalUITray 300x43, y 30), TimeWheel (280x280 tâm y -21, quay -Time*360 độ, TimeOfDayUI.cs),
 *     Marker (TimeOfDayPointer 175x50 tâm y 94, đứng yên), Compass (100x100 x1.1 tại x 186, y 49; CompassUI.cs: mặt la bàn quay theo hướng camera,
 *     nghiêng X = 55 - góc chúi camera), SanityUI (mắt tại y 109: EyeClosed 90x90 / EyeOpen 90xH + Iris + Pupil + hai lớp lệch màu đỏ/lục lam;
 *     SanityUIAnimator.controller: năm trạng thái sanity 1, .75, .5, .25, 0 với clip Sanity100/075/050/025/000.anim).
 *     Không có tiền / độ sâu / tên vùng khi đang lái (V02); tiền chỉ hiện trên khoang đang mở.
 *   - Thông báo gốc (Notification.prefab 250x100, NotificationsUI: tối đa 4, trượt vào 0,3 s OutExpo, giữ holdTimes[0] = 3 s):
 *     GridManager.AddDamageToInventory -> "notification.damage-sustained" / "-item-lost" / "-eq-damaged" (V08).
 * Thông báo nổi và thông báo nhiệm vụ nằm ở lớp riêng #dr-float để vẫn thấy khi đang neo bến (HUD chính ẩn lúc đó).
 *   - Thông báo nhiệm vụ: Notification.prefab (250+100 x 100, nền NotificationBox, chữ 23) xếp từ góc trên trái
 *     (NotificationHolder neo (0,1)); chữ gốc notification.quest-started / quest-progressed / quest-completed.
 *   - Sổ nhiệm vụ (Pursuits, JournalWindow/QuestEntryUI): phím J hoặc nút "Nhiệm vụ"; nền PursuitsDialogBackground,
 *     bước đã xong có PursuitTickIcon; nhiệm vụ có cập nhật chưa xem gắn chấm (hasUnseenUpdate).
 *   DRHud.toast(text, ms)  DRHud.note(lines, kind)  DRHud.notify(kind, questId)  DRHud.journal(open?)  DRHud.journalOpen()
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
  // HarvestPOI prompt: 'prompt.fish' = "Fish", 'prompt.dredge' = "Dredge" (data/strings.js)
  const PROMPT_VI = { 'prompt.fish': 'Câu cá', 'prompt.dredge': 'Nạo vét' };
  const str = k => (root.DR_STR && DR_STR[k]) || k;
  const pad2 = n => (n < 10 ? '0' : '') + n;
  // DayLabel.cs: chuỗi "day-and-date.<Day % 7>" với đối số Day + 1 ("Monday, Day {0}"). Bản dịch: thứ tự tuần giữ nguyên.
  const DAY_VI = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
  // SanityUIAnimator.controller: trạng thái theo biến Sanity (1 = tỉnh, 0 = hoảng tột độ); mỗi dòng đọc từ clip tương ứng
  // (Sanity100/075/050/025/000.anim): [sanity, cao EyeOpen, màu EyeOpen, màu Iris, cỡ Iris, cỡ Pupil, tỉ lệ Y của Pupil].
  // Cỡ Iris trạng thái .75 không nằm trong clip: lấy cỡ trong cảnh (52,5). Clip Sanity000 không ghi cỡ Pupil: lấy như .25 [ĐỀ XUẤT].
  const EYE = [
    [1.00, 0, [212, 197, 177], [48, 117, 128], 52.5, 28.6, 1],
    [0.75, 55, [212, 197, 177], [48, 117, 128], 52.5, 28.6, 1],
    [0.50, 72, [226, 209, 187], [75, 94, 64], 46.5, 20.75, 1.3],
    [0.25, 90, [255, 202, 191], [166, 72, 0], 44.9, 15.7, 1.4],
    [0.00, 90, [238, 178, 176], [200, 0, 46], 41.1, 15.7, 1.4]
  ];
  function eyeAt(s) {
    s = Math.max(0, Math.min(1, s));
    let i = 0;
    while (i < EYE.length - 2 && s < EYE[i + 1][0]) i++;
    const a = EYE[i], b = EYE[i + 1], k = (a[0] - s) / (a[0] - b[0]);
    const L = (x, y) => x + (y - x) * k, C = (x, y) => x.map((v, j) => Math.round(L(v, y[j])));
    return { h: L(a[1], b[1]), eye: C(a[2], b[2]), iris: C(a[3], b[3]), isz: L(a[4], b[4]), psz: L(a[5], b[5]), py: L(a[6], b[6]) };
  }
  const rgb = c => 'rgb(' + c.join(',') + ')';

  let el = null;
  let DIR = null;                                   // THREE.Vector3 dùng lại mỗi khung (hướng nhìn camera)
  const cache = {};
  const pending = [];
  let toasts = null, float = null, notes = null, hnotes = null, jr = null, jbtn = null;

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
    // Toạ độ trong .hud-top tính bằng đơn vị canvas 1920x1080 từ tâm cạnh trên (CSS nhân --hu = tỉ lệ canvas -> màn hình).
    const top = div('hud-top', el);
    const day = div('hud-day', top);
    const tray = div('hud-tray', top, '<span></span>');
    const w = div('hud-wheel', top, '<div class="ring"></div>');
    div('hud-pointer', top);
    const comp = div('hud-compass', top, '<div class="face"><i class="rose"></i><i class="ring"></i></div><b class="m n">N</b><b class="m e">E</b><b class="m s">S</b><b class="m w">W</b>');
    const eye = div('hud-eye', top, '<i class="closed dr-mask"></i><i class="glow red dr-mask"></i><i class="glow cyan dr-mask"></i>' +
      '<div class="open dr-mask"><i class="iris dr-mask"></i><i class="pupil dr-mask"></i></div>');
    const prompt = div('hud-prompt', el, '<b></b><span></span>');
    // Chip khoang góc phải trên (phím TAB): bấm = mở khoang như Tab. Kích thước / vị trí đo trên clip [ĐỀ XUẤT].
    const bag = document.createElement('button');
    bag.className = 'hud-bag'; bag.dataset.act = 'cargo';
    bag.title = 'Mở khoang thuyền (Tab)';
    bag.innerHTML = '<i class="dr-mask"></i><kbd>TAB</kbd>';
    bag.onclick = () => { if (root.DRCargo && DR.mode === 'sail') DRCargo.open({ keys: ['INVENTORY'], title: 'Khoang thuyền' }); else if (root.DRCargo && DR.mode === 'dock') DRCargo.open({ keys: ['INVENTORY', 'STORAGE'], title: 'Khoang thuyền' }); };
    el.appendChild(bag);
    float = div('dr-ui', document.body); float.id = 'dr-float';
    toasts = div('hud-toasts', float);
    notes = div('qn-stack', float);
    hnotes = div('hud-notes', float);
    jbtn = document.createElement('button');
    jbtn.className = 'dr-btn qn-jbtn'; jbtn.title = 'Sổ nhiệm vụ (J)'; jbtn.dataset.act = 'journal';
    jbtn.innerHTML = '<i></i><span>Nhiệm vụ</span><b class="dot"></b>';
    jbtn.onclick = () => journal();
    float.appendChild(jbtn);
    // Chạm vào gợi ý = nhấn F (màn cảm ứng không có phím).
    prompt.onclick = () => {
      for (const t of ['keydown', 'keyup']) root.dispatchEvent(new KeyboardEvent(t, { code: 'KeyF', key: 'f', bubbles: true }));
    };
    el._ = { day, tray, w, eye, comp, prompt, bag };
    const u = el._;
    // Biến CSS giải url() theo tệp css, không theo trang: đưa đường dẫn tuyệt đối.
    const sp = n => 'url(' + new URL('art/ui/sprites/' + n + '.webp', document.baseURI).href + ')';
    u.eye.querySelector('.closed').style.setProperty('--m', sp('Eye_Closed'));
    for (const g of u.eye.querySelectorAll('.glow')) g.style.setProperty('--m', sp('Eye_Open'));
    u.eye.querySelector('.open').style.setProperty('--m', sp('Eye_Open'));
    u.eye.querySelector('.iris').style.setProperty('--m', sp('Eye_Pupil'));
    u.eye.querySelector('.pupil').style.setProperty('--m', sp('Eye_Pupil'));
    bag.querySelector('i').style.setProperty('--m', sp('ShipIcon'));
    rescale(); root.addEventListener('resize', rescale);
    pending.splice(0).forEach(p => toast(p[0], p[1]));
  }
  // Canvas 1920x1080 của bản gốc: --hu = đơn vị canvas tính ra px. Sàn 0,45 để chữ không nhỏ hơn ~11 px trên điện thoại ngang.
  function rescale() {
    const k = Math.max(0.45, Math.min(innerWidth / 1920, innerHeight / 1080));
    document.documentElement.style.setProperty('--hu', k.toFixed(4));
  }

  function toast(text, ms) {
    // js/boat.js còn một dòng "Mất <đồ> khi đâm vào đá" từ trước; từ nay 'damage' đi qua note() (thẻ đỏ-đen góc trái trên như bản gốc).
    if (/^Mất .+ khi đâm vào đá$/.test(String(text))) return;
    if (!el) { pending.push([text, ms]); return; }
    const t = div('hud-toast', toasts); t.textContent = text;
    while (toasts.children.length > 4) toasts.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 600); }, ms || 3200);
  }

  // ---------------------------------------------------------------- thông báo hư hại (NotificationsUI)
  // Thẻ 250x100 xếp từ góc trái trên, tối đa 4 (maxNotifications), giữ 3 s (holdTimes[0]), trượt vào 0,3 s (slideInTimeSec, OutExpo).
  // Màu: DAMAGE_TAKEN trong colorMap của NotificationsUI là dữ liệu Odin bị mất khi bóc; clip cho thấy nền đỏ-đen, vạch đỏ ở mép phải [ĐỀ XUẤT].
  // lines: mảng đoạn { t: chữ, bad?: true } hoặc chuỗi (ký tự xuống dòng được giữ).
  function note(lines, kind, ms) {
    if (!hnotes) return null;
    const n = div('hud-note', hnotes);
    n.dataset.kind = kind || 'damage';
    for (const p of [].concat(lines)) {
      if (typeof p === 'string') n.appendChild(document.createTextNode(p));
      else { const s = document.createElement('span'); s.textContent = p.t; if (p.bad) s.className = 'bad'; n.appendChild(s); }
    }
    while (hnotes.children.length > 4) hnotes.firstChild.remove();
    setTimeout(() => { n.classList.add('out'); setTimeout(() => n.remove(), 450); }, ms || 3000);
    return n;
  }
  // GridManager.AddDamageToInventory: "Hull damaged" khi không mất đồ; mất đồ thì "Hull damaged\n{0} lost overboard" (tên đồ NEGATIVE).
  // Thiết bị OPERATION nằm trên ô hỏng: thêm "Hull damaged\n{0} disabled" (OnPlayerDamageChanged, EQUIPMENT_DAMAGED).
  function onDamage(res) {
    if (!res) return;
    const nm = i => (root.DR_ITEMS && DR_ITEMS[i.id] && DR_ITEMS[i.id].name) || i.id;
    if (res.destroyed) note(['Thân tàu hư hại'+'\n', { t: nm(res.destroyed), bad: true }, ' bị mất xuống biển']);
    else note('Thân tàu hư hại');
    const on = res.on;
    if (on && !res.destroyed && root.DR_ITEMS && (DR_ITEMS[on.id] || {}).damageMode === 'OPERATION')
      note(['Thân tàu hư hại'+'\n', { t: nm(on), bad: true }, ' ngừng hoạt động'], 'damage');
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
      // V02: đang lái thì không có nút "Nhiệm vụ" (vẫn mở sổ bằng J); nút chỉ còn ở bến
      const vis = false;   // w2dock: clip 1050/192 không có nút "Nhiệm vụ" ở bến (sổ vẫn mở bằng J); chip TAB ở hud.bag thay chỗ
      put('jb', vis, v => jbtn.classList.toggle('on', v));
    }
    if (!el || !root.DR || !DR.s) return;
    // w2dock: neo bến vẫn có mặt đồng hồ + chip TAB (clip 1050); ẩn khi màn mở đầu đang chạy
    const on = (DR.mode === 'sail' || DR.mode === 'harvest' || (DR.mode === 'dock' && !(root.DRIntro && DRIntro.playing))) && !(root.DRMinigame && DRMinigame.isOpen());
    put('on', on, v => el.classList.toggle('on', v));
    if (!on) return;
    const s = DR.s, v = DR.view || {}, u = el._;

    // Thời gian: phần nguyên = ngày (bắt đầu từ ngày 1), phần lẻ 0 = nửa đêm.
    const f = s.time - Math.floor(s.time), hh = Math.floor(f * 24), mm = Math.floor((f * 24 - hh) * 60);
    const dayN = Math.floor(s.time);
    put('day', dayN, d => u.day.textContent = DAY_VI[d % 7] + ', Ngày ' + (d + 1));
    put('clock', pad2(hh) + ':' + pad2(mm), c => u.tray.firstChild.textContent = c);
    // TimeOfDayUI.cs: bánh xe quay -Time*360 độ (Unity: dương = ngược chiều kim đồng hồ), mốc nửa đêm ở dưới cùng.
    put('wheel', Math.round(f * 3600) / 10, a => u.w.style.transform = 'rotate(' + a + 'deg)');

    // La bàn (CompassUI.cs): mặt quay z = góc yaw camera, nghiêng x = 55 - góc chúi camera (skewX); chữ N/E/S/W luôn đứng thẳng.
    let yaw = (v.heading || 0) * 180 / Math.PI, pitch = 30;
    const cam = root.DRCamera && DRCamera.cam;
    if (cam && cam.getWorldDirection && root.THREE) {
      cam.getWorldDirection(DIR || (DIR = new root.THREE.Vector3()));
      yaw = Math.atan2(DIR.x, -DIR.z) * 180 / Math.PI;
      pitch = Math.asin(Math.max(-1, Math.min(1, -DIR.y))) * 180 / Math.PI;
    }
    const tilt = Math.max(0, Math.min(70, 55 - pitch));
    put('compass', Math.round(yaw * 2) / 2 + ':' + Math.round(tilt), () => {
      const face = u.comp.firstChild;
      face.style.transform = 'rotateX(' + tilt.toFixed(1) + 'deg) rotate(' + (-yaw).toFixed(1) + 'deg)';
      // Markers (N 0, E 90, S 180, W 270 độ, bán kính 41) nằm ngoài mặt la bàn để chữ không bị nghiêng/quay; vị trí tính theo cùng phép nghiêng.
      for (const m of u.comp.querySelectorAll('.m')) {
        const a = (({ n: 0, e: 90, s: 180, w: 270 })[m.classList[1]] - yaw) * Math.PI / 180;
        m.style.transform = 'translate(' + (Math.sin(a) * 41).toFixed(1) + 'px,' + (-Math.cos(a) * 41 * Math.cos(tilt * Math.PI / 180)).toFixed(1) + 'px)';
      }
    });

    // Biểu tượng giữa dưới mặt đồng hồ (SanityUI): mắt khép khi tỉnh táo, mở dần và đổi màu theo biến Sanity (xanh -> cam -> đỏ).
    const ey = eyeAt(s.sanity == null ? 1 : s.sanity), sv = s.sanity == null ? 1 : s.sanity;
    const tt = performance.now() / 1000;
    const closedA = Math.max(0, Math.min(1, (sv - 0.75) / 0.25));
    const red = sv <= 0.25 ? 1 : 0;
    const q = x => Math.round(x * 10) / 10;
    put('eye', [q(ey.h), rgb(ey.eye), rgb(ey.iris), q(ey.isz), q(ey.psz), closedA.toFixed(2), Math.round(Math.sin(tt * 1.3) * 3), red && Math.round(Math.sin(tt * 2.4) * 4)].join('|'), () => {
      const E = u.eye, op = E.querySelector('.open'), ir = E.querySelector('.iris'), pu = E.querySelector('.pupil');
      E.dataset.stage = sv <= 0.25 ? 4 : sv <= 0.5 ? 3 : sv <= 0.75 ? 2 : 0;
      E.querySelector('.closed').style.opacity = closedA;
      op.style.height = ey.h + 'px'; op.style.setProperty('--c', rgb(ey.eye)); op.style.display = ey.h < 1 ? 'none' : 'block';
      ir.style.width = ir.style.height = ey.isz + 'px'; ir.style.setProperty('--c', rgb(ey.iris));
      // vòng mắt đảo nhẹ: biên độ lấy từ clip (±3 .. ±8 theo mức hoảng loạn)
      ir.style.transform = 'translate(calc(-50% + ' + (Math.sin(tt * 1.3) * (3 + (0.75 - Math.min(0.75, sv)) * 8)).toFixed(1) + 'px), -50%)';
      pu.style.width = (ey.psz * 0.4) + 'px'; pu.style.height = (ey.psz * ey.py) + 'px'; pu.style.setProperty('--c', '#000');
      // hai lớp lệch màu đỏ / lục lam chỉ sáng từ mức .25 (alpha đỉnh 0,33 / 0,28 trong Sanity025.anim)
      const g = Math.max(0, Math.min(1, (0.3 - sv) / 0.05)), pulse = 0.5 + 0.5 * Math.sin(tt * 2.4);
      const rd = E.querySelector('.glow.red'), cy = E.querySelector('.glow.cyan');
      rd.style.opacity = (0.33 * g * pulse).toFixed(3); cy.style.opacity = (0.28 * g * pulse).toFixed(3);
      rd.style.height = cy.style.height = (ey.h * 1.04) + 'px';
      E.style.transform = red ? 'scale(' + (1 + 0.05 * (0.5 + 0.5 * Math.sin(tt * 2.4))).toFixed(3) + ')' : 'none';
    });

    // Gợi ý tương tác: điểm câu hợp lệ thắng bến (main.js cũng xử lý F / Space theo thứ tự này), rồi bến, rồi điểm câu không hợp lệ;
    // đang câu thì ẩn. Chữ theo loại điểm: 'prompt.fish' (câu cá) / 'prompt.dredge' (nạo vét), giữ chuỗi gốc ở data-orig.
    let html = '', warn = false;
    if (DR.mode === 'sail') {
      const sp = v.nearSpot, ok = sp && (!sp.status || sp.status === 'ok');
      if (sp && ok) {
        const b = bucket(sp.stock), key = sp.kind === 'dredge' ? 'prompt.dredge' : 'prompt.fish';
        html = '<b data-orig="' + esc(str(key)) + '">' + PROMPT_VI[key] + ' <kbd>F</kbd></b><span>' + esc(sp.name || '') + (sp.name ? ' · ' : '') + BUCKET_TXT[b] +
          '<span class="hud-stock">' + [1, 2, 3].map(i => '<i class="' + (i <= b ? 'f' : '') + '"></i>').join('') + '</span></span>';
      } else if (v.nearDock) html = '<b data-orig="' + esc(str('prompt.dock')) + '">Cập bến <kbd>F</kbd></b><span>' + esc(v.nearDock.name) + '</span>';
      else if (sp) {
        warn = true;
        html = '<b>' + (MSG[sp.status] || sp.status) + '</b><span>' + esc(sp.name || '') + '</span>';
      }
    }
    put('bag', DR.mode === 'sail' || (DR.mode === 'dock' && !(root.DRDialogue && DRDialogue.isOpen())), vis => u.bag.style.display = vis ? '' : 'none');
    put('prompt', html + warn, () => { u.prompt.innerHTML = html || '<b></b><span></span>'; u.prompt.classList.toggle('on', !!html); u.prompt.classList.toggle('warn', warn); });
  }
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function init() {
    build(); requestAnimationFrame(frame);
    if (root.DR && DR.on) {
      DR.on('damage', res => onDamage(res));                       // boat.js: DR.emit('damage', { cell, destroyed, on }, impact)
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
    toast, note, notify, journal, journalOpen: () => !!jr,
    _debug: () => ({ cache: Object.assign({}, cache), notes: notes ? [...notes.children].map(n => ({ kind: n.dataset.kind, quest: n.dataset.quest, text: n.textContent })) : [] })
  };
})(window);
