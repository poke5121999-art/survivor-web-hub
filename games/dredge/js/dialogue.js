/*
 * Khung hội thoại dựng theo DialogueView trong Game.unity (DredgeDialogueView.cs, TextOptionButton.cs):
 *   - CharacterPortraitContainer: neo giữa màn; lớp chân dung lấy từ SpeakerData.portraitPrefab (art/portraits/<prefab>/*.webp,
 *     toạ độ AnchoredPosition × LocalScale của từng lớp AddressableSpriteLoader, đơn vị canvas 1920×1080).
 *   - DialogueTextContainer: neo đáy giữa, 750×190, cách đáy 10; chữ "Front Page Neue" 30,65; lề 30/25.
 *     Có người nói: nền DialogBoxSpeech + bảng tên (CharacterNameContainer 450×60 tại y −330 so với tâm, TitleBackground, chữ 36).
 *     Không người nói: nền DialogBox-White tô đen (thẻ #system-alert: nền trắng chữ đen).
 *   - OptionsContainer: neo mép phải giữa, rộng 600, cách nhau 20; nút Button_White, chữ 30; #exit = biểu tượng ExitIcon
 *     và phím Back chọn nhanh; #quest = chấm AlertIcon nếu chưa chọn lần nào; đã chọn (không #repeat) thì xám.
 *   - delayBeforeCanSkipTypewriter 0,05 s; delayAfterLineCompleteBeforeCanContinue 0,5 s; nút chỉ bấm được sau 0,75 s.
 *   - Tiếng cảm thán: thẻ dòng (#chuckle, #sigh...) khớp ParalinguisticType → SpeakerData.paralinguistics (art/portraits/vox).
 *   - continueSFX = submit.wav (ui.button.submit), skipSFX = select.wav (ui.button.select).
 *
 *   DRDialogue.start(node, { onEnd(runner) })   DRDialogue.isOpen()   DRDialogue.next()   DRDialogue.choose(i)   DRDialogue.state()
 *   DRStoryGrid.show(questGridName, cb(result))  — lưới nhiệm vụ rút gọn cho lệnh ShowQuestGrid (QuestGridResult 0/1).
 */
(function (root) {
  'use strict';
  const me = document.currentScript;
  const ver = (me && me.src.match(/\?v=[^&]*/) || [''])[0];
  if (!document.querySelector('link[href*="story.css"]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = new URL('../css/story.css' + ver, (me && me.src) || location.href).href;
    document.head.appendChild(l);
  }
  const Y = root.DR_YARN || {};
  const W = () => root.DR_WORLD || {};
  const STR = k => (root.DR_STR && root.DR_STR[k]) || null;
  const TYPE_SEC = 0.03;          // [ĐỀ XUẤT] TextAnimator mặc định ~0,03 s mỗi ký tự ở typewriterSpeeds[1] = 1
  const SKIP_DELAY = 0.05, CONT_DELAY = 0.5, OPT_CLICK_DELAY = 0.75, OPT_STAGGER = 0.08; // OPT_STAGGER [ĐỀ XUẤT]
  const COL = { C0: '#3b9795', C1: '#74d27a', C2: '#dc2c38', C3: '#871d58' }; // Markup.cs → GameConfigData.colors

  const el = (tag, cls, parent, txt) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    if (parent) parent.appendChild(e);
    return e;
  };
  const play = k => { try { if (root.DRAudio) DRAudio.play(k); } catch (e) { /* tiếng không bắt buộc */ } };
  const now = () => performance.now() / 1000;

  // ------------------------------------------------------------ chân dung
  function speakerData(name) { return (W().SpeakerData || {})[name] || null; }
  function lookupSpeaker(key) {
    const t = (((W().SpeakerDataLookup || {}).SpeakerDataLookup || {}).lookupTable) || {};
    return key ? t[String(key).toUpperCase()] || null : null;
  }
  // DredgeDialogueView.ShowPortrait(SpeakerData): portraitOverrideConditions khớp (biến tay hoặc mọi node đã thăm) thì thay prefab
  function portraitPrefab(name) {
    const sd = speakerData(name), sp = (Y.speakers || {})[name] || {};
    let pf = sp.portrait || null;
    const ov = (sd && sd.portraitOverrideConditions) || [];
    for (let i = 0; i < ov.length; i++) {
      const po = ov[i];
      const hit = po.useManualState ? (+((root.DR.s.vars || {})[po.stateName] || 0) === po.stateValue)
        : (po.nodesVisited || []).every(n => root.DRYarn.visited(n));
      if (hit) { if (sp['override' + i]) pf = sp['override' + i]; break; }
    }
    return pf;
  }
  function speakerName(name) {
    const sd = speakerData(name);
    if (!sd) return name;
    let key = sd.speakerNameKey;
    for (const o of sd.speakerNameKeyOverrides || []) {
      if ((o.nodesVisited || []).every(n => root.DRYarn.visited(n)) && o.speakerNameKey) { key = o.speakerNameKey; break; }
    }
    return STR(key) || name;
  }
  // SpeakerData.paralinguistics → art/portraits/vox; DR_AUDIO nhận khoá mới lúc chạy để DRAudio.play dùng chung WebAudio
  function playVox(meta, name) {
    if (!meta || !meta.length || !name) return;
    const vx = (Y.vox || {})[name];
    if (!vx) return;
    for (const t of meta) {
      const list = vx[t];
      if (!list || !list.length) continue;
      const src = list[Math.floor(Math.random() * list.length)];
      const key = 'vox.' + src.split('/').pop().replace(/\.mp3$/, '');
      root.DR_AUDIO = root.DR_AUDIO || {};
      if (!root.DR_AUDIO[key]) root.DR_AUDIO[key] = { src, loop: false, vol: 1 };
      play(key);
    }
  }

  // ------------------------------------------------------------ DOM
  let host = null, U = null;
  function ensure() {
    if (host) return;
    host = el('div', 'dr-ui', document.body); host.id = 'dr-dlg';
    const port = el('div', 'dlg-portrait', host);
    const name = el('div', 'dlg-name', host); el('span', '', name);
    const box = el('div', 'dlg-box', host);
    const text = el('div', 'dlg-text', box);
    const more = el('div', 'dlg-more', box);
    const opts = el('div', 'dlg-opts', host);
    U = { port, name, box, text, more, opts };
    box.addEventListener('pointerdown', e => { e.preventDefault(); next(); });
    host.addEventListener('pointerdown', e => { if (e.target === host) next(); });
    layout();
    root.addEventListener('resize', layout);
  }
  // CanvasScaler khớp theo chiều cao 1080; màn hẹp (điện thoại xoay ngang) nới lên để chữ còn đọc được [ĐỀ XUẤT]
  function layout() {
    if (!host) return;
    const w = root.innerWidth, h = root.innerHeight;
    let s = h / 1080;
    if (s < 0.62) s = Math.min(0.62, w / 1250);
    host.style.setProperty('--s', s.toFixed(4));
    host.classList.toggle('narrow', w < 1100 * s + 600 * s);
  }

  let R = null;        // runner hiện tại
  let st = null;       // trạng thái dòng / lựa chọn
  let lastPrefab = null, lastSpeaker = null, onEnd = null;

  function showPortrait(name) {
    const pf = portraitPrefab(name);
    if (!pf || pf === lastPrefab) return;
    lastPrefab = pf;
    U.port.innerHTML = '';
    const layers = (Y.portraits || {})[pf] || [];
    const wrap = el('div', 'dlg-pf', U.port);
    wrap.dataset.prefab = pf;
    for (const L of layers) {
      const im = el('img', '', wrap);
      im.src = L.src; im.alt = '';
      // AnchoredPosition: y hướng lên, quanh tâm container
      im.style.cssText = 'left:calc(' + (L.x - L.w / 2) + 'px*var(--s));top:calc(' + (-L.y - L.h / 2) + 'px*var(--s));width:calc(' + L.w + 'px*var(--s));height:calc(' + L.h + 'px*var(--s))';
    }
  }
  function hidePortrait() { U.port.innerHTML = ''; lastPrefab = null; }

  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // Markup.Parse: [C0..C3] màu, [S1..S3] rung chữ (TextAnimator <shake a=0.1/0.2/0.3>) — tách thành từng ký tự để chạy máy chữ
  function glyphs(text) {
    const out = [];
    const stack = [];
    const re = /\[(\/?)([A-Za-z][A-Za-z0-9_]*)\]|<br>|([\s\S])/g;
    let m;
    while ((m = re.exec(text))) {
      if (m[0] === '<br>') { out.push({ ch: '\n', cls: stack.slice() }); continue; }
      if (m[2]) {
        const tag = m[2].toUpperCase();
        if (COL[tag] || /^S[123]$/.test(tag)) {
          if (m[1]) { const i = stack.lastIndexOf(tag); if (i >= 0) stack.splice(i, 1); } else stack.push(tag);
          continue;
        }
        for (const c of m[0]) out.push({ ch: c, cls: stack.slice() });
        continue;
      }
      out.push({ ch: m[3], cls: stack.slice() });
    }
    return out;
  }
  function renderGlyphs(gs) {
    U.text.innerHTML = '';
    const spans = [];
    for (const g of gs) {
      if (g.ch === '\n') { spans.push(el('br', '', U.text)); continue; }
      const s = el('span', 'g', U.text, g.ch);
      for (const c of g.cls) {
        if (COL[c]) s.style.color = COL[c];
        else s.classList.add('shake', c.toLowerCase());
      }
      spans.push(s);
    }
    return spans;
  }

  function open() {
    ensure(); layout();
    if (!host.classList.contains('on')) {
      host.classList.add('on');
      U.box.classList.remove('in'); void U.box.offsetWidth; U.box.classList.add('in');
    }
  }
  function close() {
    if (!host) return;
    host.classList.remove('on', 'opts');
    hidePortrait();
    U.name.classList.remove('on');
    U.opts.innerHTML = '';
    lastSpeaker = null;
  }

  // ------------------------------------------------------------ view cho DRYarn
  const view = {
    line(l, nextFn) {
      open();
      U.opts.innerHTML = ''; host.classList.remove('opts');
      const sd = l.speaker ? speakerData(l.speaker) : null;
      let named = false;
      if (sd) {
        showPortrait(l.speaker);
        if (!sd.hideNameplate) { U.name.firstChild.textContent = speakerName(l.speaker); named = true; }
        playVox(l.meta, l.speaker);
        lastSpeaker = l.speaker;
      } else if (lastSpeaker) playVox(l.meta, lastSpeaker);
      U.name.classList.toggle('on', named);
      U.box.classList.toggle('speech', named);
      U.box.classList.toggle('alert', !named && l.meta.includes('system-alert'));
      const spans = renderGlyphs(glyphs(l.text));
      // TMP enableAutoSizing 18–32 (DialogueText): co chữ tới khi vừa khung
      let fs = 30.65;
      U.text.style.setProperty('--fs', fs);
      while (fs > 18 && U.text.scrollHeight > U.text.clientHeight + 1) { fs -= 1; U.text.style.setProperty('--fs', fs); }
      st = { kind: 'line', l, next: nextFn, spans, shown: 0, t0: now(), done: null, auto: l.auto, typing: true };
      U.more.classList.remove('on');
      if (l.immediate) finishTyping();
      tick();
    },
    options(opts, choose, showUnavailable) {
      open();
      host.classList.add('opts');
      U.opts.innerHTML = '';
      const t0 = now();
      const visible = opts.filter(o => o.available || showUnavailable);
      let quick = null, n = 0;
      visible.forEach(o => {
        const meta = o.meta || [];
        const seen = root.DRYarn.visited(o.id);
        const exit = meta.includes('exit'), rep = meta.includes('repeat');
        const b = el('button', 'dlg-opt', U.opts);
        b.dataset.index = o.index;
        if (exit) { el('i', 'ic exit', b); quick = o; }
        else if (meta.includes('paint')) el('i', 'ic paint', b);
        el('span', '', b, o.text.replace(/\\/g, '').replace(/^ +/, ''));
        if (meta.includes('quest') && !(seen && !rep)) el('i', 'alert', b);
        if ((!rep || meta.includes('always-mark-visited')) && seen && !exit) b.classList.add('seen');
        b.disabled = !o.available;
        b.style.animationDelay = (n++ * OPT_STAGGER) + 's';
        b.onclick = () => {
          if (now() - t0 < OPT_CLICK_DELAY || b.disabled) return;
          play('ui.button.submit');
          host.classList.remove('opts'); U.opts.innerHTML = '';
          st = null;
          choose(o.index);
        };
      });
      st = { kind: 'options', opts: visible, choose, quick, t0 };
    },
    portrait(id) { ensure(); const n = lookupSpeaker(id); if (n) showPortrait(n); },
    hidePortrait() { if (U) hidePortrait(); },
    clear() { if (!U) return; U.name.classList.remove('on'); U.text.innerHTML = ''; },
    end(r) {
      const done = onEnd; onEnd = null; R = null; st = null;
      close();
      root.DR.emit('dialogue', false);
      if (done) done(r);
    }
  };

  function finishTyping() {
    if (!st || st.kind !== 'line') return;
    st.spans.forEach(s => s.classList && s.classList.add('v'));
    st.shown = st.spans.length;
    st.typing = false;
    st.done = now();
    U.more.classList.add('on');
    // OnTypewriterCompleted: AutoResolveNextLine → tự sang dòng/lựa chọn kế mà vẫn để chữ trên màn
    if (st.auto) { st.auto = false; const n = st.next; st = Object.assign(st, { kind: 'held' }); n(); }
  }
  let raf = 0;
  function tick() {
    cancelAnimationFrame(raf);
    const step = () => {
      if (!st || st.kind !== 'line' || !st.typing) return;
      const want = Math.min(st.spans.length, Math.floor((now() - st.t0) / TYPE_SEC));
      while (st.shown < want) { const s = st.spans[st.shown++]; if (s.classList) s.classList.add('v'); }
      if (st.shown >= st.spans.length) { finishTyping(); return; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  // OnContinueLinePressComplete
  function next() {
    if (!st) return;
    if (st.kind === 'line') {
      if (st.typing) {
        if (now() > st.t0 + SKIP_DELAY) { finishTyping(); play('ui.button.select'); }
      } else if (now() > st.done + CONT_DELAY) {
        play('ui.button.submit');
        const n = st.next; st = null; U.more.classList.remove('on');
        n();
      }
    }
  }
  function choose(i) {
    if (!st || st.kind !== 'options') return false;
    const b = U.opts.querySelector('[data-index="' + i + '"]');
    if (!b || b.disabled) return false;
    st.t0 = -1e9; b.click();
    return true;
  }

  root.addEventListener('keydown', e => {
    if (!R || !host || !host.classList.contains('on')) return;
    if (root.DRCargo && DRCargo.isOpen && DRCargo.isOpen()) return;
    const k = e.code;
    if (k === 'Space' || k === 'Enter' || k === 'KeyE' || k === 'NumpadEnter') { if (!e.repeat) next(); }
    else if (st && st.kind === 'options' && /^Digit[1-9]$/.test(k)) {
      const b = U.opts.querySelectorAll('.dlg-opt')[+k.slice(5) - 1];
      if (b && !b.disabled && now() - st.t0 >= OPT_CLICK_DELAY) b.click();
    } else if ((k === 'Escape' || k === 'KeyX') && st && st.kind === 'options' && st.quick) {
      const b = U.opts.querySelector('[data-index="' + st.quick.index + '"]');
      if (b) { st.t0 = -1e9; b.click(); }
    } else if (k === 'Escape') { /* Esc trong hội thoại không mở bảng tạm dừng */ }
    else return;
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);

  function start(node, opts) {
    if (!root.DRYarn || !root.DRYarn.hasNode(node)) { console.warn('[dialogue] yarn node not found:', node); if (opts && opts.onEnd) opts.onEnd(null); return null; }
    ensure();
    onEnd = (opts && opts.onEnd) || null;
    root.DR.emit('dialogue', true, node);
    R = root.DRYarn.run(node, view);
    return R;
  }

  function state() {
    if (!R) return null;
    return {
      node: R.name, kind: st && st.kind,
      text: U && U.text.textContent, name: U && U.name.classList.contains('on') ? U.name.textContent : null,
      prefab: lastPrefab, options: st && st.kind === 'options' ? st.opts.map(o => ({ index: o.index, text: o.text, available: o.available, meta: o.meta })) : null,
      typing: !!(st && st.typing)
    };
  }

  // ------------------------------------------------------------ lưới nhiệm vụ rút gọn (ShowQuestGrid)
  // QuestGridPanel gốc là một lưới kéo-thả; ở đây [ĐỀ XUẤT] chỉ dựng hai kiểu dùng nhiều nhất:
  //   - presetGridMode CREATE + EmptyCondition (nhận đồ): bấm để cất đồ vào khoang (khoang đầy thì DRCargo bắt xếp chỗ);
  //   - ItemCountCondition / AberrationCountCondition / CellCountOfItemTypeAndSubtypeCondition (giao đồ): đủ thì giao một lần.
  // Kết quả theo QuestGridResult: 1 = COMPLETE, 0 = INCOMPLETE (rời đi khi chưa xong).
  const SG = {};
  function sgShow(name, cb) {
    const c = ((root.DR_QUESTS || {}).QuestGridConfig || {})[name];
    if (!c) { console.warn('[storygrid] quest grid not found:', name); cb(0); return; }
    ensure();
    const D = root.DR, G = root.DRGrid, ITEMS = root.DR_ITEMS;
    const panel = el('div', 'sg-panel', host);
    host.classList.add('grid');
    const fin = res => { panel.remove(); host.classList.remove('grid'); cb(res); };
    el('h3', '', panel, c.titleString || name);
    const conds = c.completeConditions || [];
    const preset = (c.presetGrid && c.presetGrid.spatialItems) || [];
    if (c.presetGridMode === 'CREATE' && preset.length && conds.every(x => x._t === 'EmptyCondition')) {
      const row = el('div', 'sg-items', panel);
      for (const it of preset) {
        const d = ITEMS[it.id]; if (!d) continue;
        const b = el('div', 'sg-item', row); el('img', '', b).src = d.sprite; el('span', '', b, d.name);
      }
      const go = el('button', 'dr-btn gold', panel, 'Cất vào khoang'); go.dataset.act = 'take';
      go.onclick = () => {
        panel.style.display = 'none';
        const rest = preset.slice();
        const nextItem = () => {
          const it = rest.shift();
          if (!it) { fin(1); return; }
          const d = ITEMS[it.id];
          if (!d) { nextItem(); return; }
          const inst = root.DRYarn.addItem(it.id);
          if (inst || !root.DRCargo || !DRCargo.isOpen()) { nextItem(); return; }
          // khoang đầy: DRCargo đang mở với món cần xếp; đợi đóng
          const wait = setInterval(() => { if (!DRCargo.isOpen()) { clearInterval(wait); nextItem(); } }, 200);
        };
        nextItem();
      };
      return;
    }
    // giao đồ
    const inv = D.grid('INVENTORY');
    const need = [];
    let ok = true;
    for (const x of conds) {
      if (x._t === 'ItemCountCondition') {
        const d = ITEMS[x.item];
        const match = i => i.id === x.item || (x.allowLinkedAberrations && d && (d.aberrations || []).includes(i.id));
        const have = inv.items.filter(match);
        need.push({ label: (d ? d.name : x.item), have: have.length, want: x.count, take: have.slice(0, x.count), img: d && d.sprite });
        if (have.length < x.count) ok = false;
      } else if (x._t === 'AberrationCountCondition') {
        const have = inv.items.filter(i => ITEMS[i.id] && ITEMS[i.id].isAberration);
        need.push({ label: 'Cá dị dạng', have: have.length, want: x.targetItemCount, take: have.slice(0, x.targetItemCount) });
        if (have.length < x.targetItemCount) ok = false;
      } else if (x._t === 'CellCountOfItemTypeAndSubtypeCondition') {
        const T = G.mask(x.itemType, G.TYPE), Sb = G.mask(x.itemSubtype, G.SUB);
        const have = inv.items.filter(i => { const d = ITEMS[i.id]; return d && (G.typeOf(d) & T) && (G.subOf(d) & Sb); });
        let cells = 0; const take = [];
        for (const i of have) { if (cells >= x.targetCellCount) break; cells += (ITEMS[i.id].dims || [[0, 0]]).length; take.push(i); }
        need.push({ label: 'Ô cá', have: cells, want: x.targetCellCount, take });
        if (cells < x.targetCellCount) ok = false;
      } else if (x._t !== 'EmptyCondition') {
        console.info('[storygrid] quest grid condition has no system yet:', x._t, name); ok = false;
      }
    }
    if (!need.length) { console.info('[storygrid] quest grid kind not built:', name); fin(0); return; }
    const list = el('div', 'sg-need', panel);
    for (const n of need) {
      const r = el('div', 'sg-row' + (n.have >= n.want ? ' ok' : ''), list);
      if (n.img) el('img', '', r).src = n.img;
      el('span', '', r, n.label);
      el('b', '', r, Math.min(n.have, n.want) + ' / ' + n.want);
    }
    const bar = el('div', 'sg-bar', panel);
    const give = el('button', 'dr-btn gold', bar, 'Giao'); give.dataset.act = 'deliver';
    give.disabled = !ok;
    give.onclick = () => {
      for (const n of need) for (const i of n.take) G.remove(inv, i);
      D.emit('cargo', 'INVENTORY', null);
      play('ui.grid.place');
      fin(1);
    };
    const back = el('button', 'dr-btn', bar, 'Để sau'); back.dataset.act = 'leave';
    back.onclick = () => fin(0);
  }
  SG.show = sgShow;

  root.DRDialogue = { start, isOpen: () => !!R, next, choose, state, layout, speakerName, portraitPrefab };
  root.DRStoryGrid = SG;
})(window);
