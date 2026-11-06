/*
 * Tủ truyện gia đình. Mỗi truyện (doc.stories) có tiêu đề, thân bài HTML, danh sách người được kể
 * tới, và tệp kèm (bản gốc PDF, ảnh, băng ghi âm lời kể). Truyện thuộc về cây chứ không thuộc về một
 * người, vì một chuyện nhà thường kể về nhiều người cùng lúc.
 *
 * Tải lên: Word và văn bản thành thân bài đọc được ngay; PDF, ảnh, âm thanh, phim giữ nguyên làm tệp
 * kèm. Ba màn: tủ truyện (lưới), trang đọc (giấy), và "Kể chuyện cả cây" (camera đi qua từng người).
 */
(function (GP) {
  'use strict';
  const M = GP.model, S = GP.store;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const norm = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  const nameOf = (id) => (S.doc.people[id] && S.doc.people[id].name) || 'Chưa đặt tên';
  // Chèn khoảng trắng ở ranh giới đoạn trước khi lấy chữ, không thì đoạn trích dính "thóc.Bà Nhàn".
  const plain = (html) => {
    const d = document.createElement('div');
    d.innerHTML = String(html || '').replace(/<\/(p|h[1-6]|li|blockquote|div|td)>|<br\s*\/?>/gi, ' $&');
    return (d.textContent || '').replace(/\s+/g, ' ').trim();
  };

  const St = { forPerson: null, reading: null, editing: false };
  let lib, reader, saveT = 0;

  // ---------- tải truyện lên: mỗi loại tệp một cách đọc ----------

  const textToHTML = (txt) => txt.replace(/\r/g, '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    .map((p) => '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>').join('');

  function mdToHTML(txt) {
    return txt.replace(/\r/g, '').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean).map((b) => {
      const h = /^(#{1,3})\s+(.*)$/.exec(b);
      if (h) return '<h' + (h[1].length + 1) + '>' + esc(h[2]) + '</h' + (h[1].length + 1) + '>';
      if (/^>\s?/.test(b)) return '<blockquote>' + esc(b.replace(/^>\s?/gm, '')).replace(/\n/g, '<br>') + '</blockquote>';
      return '<p>' + esc(b).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }

  // Tiêu đề: tiêu đề đầu tiên trong bài nếu có, không thì tên tệp. Tiêu đề ấy được nhấc khỏi thân bài.
  function liftTitle(html, fallback) {
    const d = document.createElement('div');
    d.innerHTML = html;
    const h = d.querySelector('h1,h2,h3');
    if (h && h === d.firstElementChild && h.textContent.trim()) { const t = h.textContent.trim(); h.remove(); return { title: t, body: d.innerHTML }; }
    return { title: fallback, body: html };
  }

  async function fromFile(f) {
    const raw = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    const base = raw ? raw[0].toUpperCase() + raw.slice(1) : 'Truyện không tên';
    const n = f.name.toLowerCase(), type = f.type || S.guessType(f.name);
    if (/\.docx$/.test(n) || /wordprocessingml/.test(type)) {
      const html = await GP.panel.docxToHTML(await f.arrayBuffer(), true);
      return liftTitle(GP.panel.cleanHTML(html, false), base);
    }
    if (/\.md$/.test(n)) return liftTitle(mdToHTML(await f.text()), base);
    if (/\.html?$/.test(n) || type === 'text/html') {
      const doc = new DOMParser().parseFromString(await f.text(), 'text/html');
      return liftTitle(GP.panel.cleanHTML(doc.body.innerHTML, false), (doc.title || '').trim() || base);
    }
    if (/^text\//.test(type) || /\.txt$/.test(n)) {
      const txt = (await f.text()).replace(/^﻿/, '');
      const m = /^([^\n]{1,90})\n\s*\n/.exec(txt.replace(/\r/g, ''));
      return m ? { title: m[1].trim(), body: textToHTML(txt.replace(/\r/g, '').slice(m[0].length)) } : { title: base, body: textToHTML(txt) };
    }
    const rec = await S.putFile(f);
    return { title: base, body: '', files: [rec.id], cover: /^image\//.test(type) ? rec.id : null };
  }

  async function upload(files) {
    if (!files.length) return;
    const made = [];
    for (const f of files) {
      try { made.push(await fromFile(f)); }
      catch (err) { GP.ui.toast({ text: 'Không đọc được ' + f.name + ': ' + err.message, bad: true }); }
    }
    if (!made.length) return;
    const pid = St.forPerson;
    const ids = S.commit('Thêm ' + made.length + ' truyện', (t) => made.map((m) => M.addStory(t, Object.assign({ people: pid ? [pid] : [] }, m)).id));
    GP.ui.toast({ text: 'Đã thêm ' + made.length + ' truyện vào tủ', undo: true });
    renderLib();
    if (made.length === 1) read(ids[0]);
  }

  function write() {
    const pid = St.forPerson;
    const s = S.commit('Viết truyện mới', (t) => M.addStory(t, { title: '', people: pid ? [pid] : [] }));
    read(s.id, true);
  }

  // ---------- tủ truyện ----------

  function openLibrary(pid) {
    St.forPerson = pid && S.doc.people[pid] ? pid : null;
    lib.classList.add('open');
    renderLib();
  }
  function closeLibrary() { lib.classList.remove('open'); }

  function renderLib() {
    if (!lib.classList.contains('open')) return;
    const doc = S.doc;
    const ids = St.forPerson ? M.storiesOf(doc, St.forPerson) : M.storyList(doc);
    const total = M.storyList(doc).length;
    $('#st-sub', lib).innerHTML = St.forPerson
      ? 'Truyện về <b>' + esc(nameOf(St.forPerson)) + '</b> · ' + ids.length + ' truyện <button class="st-all">Xem cả tủ (' + total + ')</button>'
      : total + ' truyện của cả nhà';
    const grid = $('#st-grid', lib);
    if (!ids.length) {
      grid.innerHTML = '<div class="st-empty"><div class="big">📖</div><p>' + (St.forPerson ? 'Chưa có truyện nào về ' + esc(nameOf(St.forPerson)) + '.' : 'Tủ truyện còn trống.') + '</p>' +
        '<p class="muted">Tải lên chuyện cũ ông bà kể (Word, văn bản, PDF), ảnh xưa, hay băng ghi âm lời kể. Hoặc viết ngay ở đây.</p></div>';
      return;
    }
    grid.innerHTML = ids.map((k, i) => {
      const s = doc.stories[k];
      const ex = plain(s.body).slice(0, 150);
      const icons = s.files.length ? '<span class="st-files">📎' + s.files.length + '</span>' : '';
      return '<button class="st-card" data-story="' + k + '" style="animation-delay:' + Math.min(i, 12) * 45 + 'ms">' +
        '<div class="st-cover">' + (s.cover ? '<img alt="" data-fid="' + esc(s.cover) + '">' : '<span>' + esc((s.title || '?').trim()[0] || '?').toUpperCase() + '</span>') + '</div>' +
        '<div class="st-tx"><b>' + (esc(s.title) || '<i>Chưa đặt tên</i>') + '</b>' +
        '<p>' + (esc(ex) || '<i class="muted">' + (s.files.length ? 'Tệp đính kèm, bấm để mở' : 'Chưa có nội dung') + '</i>') + (ex.length >= 150 ? '…' : '') + '</p>' +
        '<div class="st-ppl">' + s.people.slice(0, 3).map((id) => '<span class="pchip ' + (doc.people[id].gender === 'f' ? 'f' : 'm') + '">' + esc(nameOf(id)) + '</span>').join('') +
        (s.people.length > 3 ? '<span class="muted small">+' + (s.people.length - 3) + '</span>' : '') + icons + '</div></div></button>';
    }).join('');
    for (const img of $$('img[data-fid]', grid)) S.url(img.dataset.fid).then((u) => { if (u) img.src = u; });
  }

  // ---------- trang đọc ----------

  async function read(sid, edit) {
    if (!S.doc.stories[sid]) return;
    St.reading = sid;
    St.editing = !!edit;
    reader.classList.add('open');
    await renderReader(true);
    if (edit) setTimeout(() => $('#rd-title', reader).focus(), 60);
  }

  function closeReader() {
    flush();
    for (const m of $$('audio,video', reader)) m.pause();
    const sid = St.reading;
    St.reading = null; St.editing = false;
    reader.classList.remove('open');
    const s = sid && S.doc.stories[sid];
    if (s && !s.title.trim() && !plain(s.body) && !s.files.length) S.commit('Bỏ truyện trống', (t) => M.removeStory(t, sid));
    renderLib();
  }

  function siblings() { return St.forPerson && lib.classList.contains('open') ? M.storiesOf(S.doc, St.forPerson) : M.storyList(S.doc); }

  async function renderReader(full) {
    const s = S.doc.stories[St.reading];
    if (!s) { closeReader(); return; }
    const doc = S.doc;
    const list = siblings(), i = list.indexOf(s.id);
    $('#rd-pos', reader).textContent = list.length > 1 && i >= 0 ? (i + 1) + ' / ' + list.length : '';
    $('#rd-prev', reader).hidden = $('#rd-next', reader).hidden = list.length < 2 || i < 0;
    reader.classList.toggle('editing', St.editing);
    $('#rd-edit', reader).textContent = St.editing ? '✓ Xong' : '✎ Sửa';
    const title = $('#rd-title', reader), body = $('#rd-body', reader);
    title.contentEditable = body.contentEditable = St.editing ? 'true' : 'false';
    if (full || document.activeElement !== title) title.textContent = s.title;
    $('#rd-ppl', reader).innerHTML = s.people.map((id) => '<button class="pchip ' + (doc.people[id].gender === 'f' ? 'f' : 'm') + '" data-go="' + id + '">' + esc(nameOf(id)) + '</button>').join('') +
      '<button class="pchip add" data-rd="tag">＋ Gắn người</button>';
    if (full || document.activeElement !== body) {
      body.innerHTML = GP.panel.cleanHTML(s.body, false);
      for (const img of $$('img[data-fid]', body)) S.url(img.dataset.fid).then((u) => { if (u) img.src = u; });
    }
    if (full) await renderAttachments(s);
    const page = $('.rd-page', reader);
    if (full) { page.scrollTop = 0; page.classList.remove('in'); void page.offsetWidth; page.classList.add('in'); }
  }

  async function renderAttachments(s) {
    const box = $('#rd-files', reader);
    if (!s.files.length) { box.innerHTML = ''; return; }
    const recs = await Promise.all(s.files.map((f) => S.getFile(f)));
    box.innerHTML = '';
    for (const r of recs) {
      if (!r) continue;
      const k = GP.panel.kindOf(r).k, u = await S.url(r.id);
      const it = document.createElement('figure');
      it.className = 'rd-file k-' + k;
      if (k === 'image') it.innerHTML = '<img alt="">';
      else if (k === 'audio') it.innerHTML = '<div class="rd-tape"><span class="reel"></span><span class="reel"></span></div><audio controls preload="metadata"></audio>';
      else if (k === 'video') it.innerHTML = '<video controls preload="metadata"></video>';
      else if (k === 'pdf') it.innerHTML = '<iframe title="PDF"></iframe>';
      else it.innerHTML = '<button class="btn" data-dl="' + r.id + '">⤓ Tải ' + esc(r.name) + '</button>';
      const m = it.querySelector('img,audio,video,iframe');
      if (m) m.src = u;
      const cap = document.createElement('figcaption');
      cap.textContent = r.name;
      it.appendChild(cap);
      box.appendChild(it);
      const au = it.querySelector('audio');
      if (au) {
        // Đang nghe lời kể thì nhạc nền nhường, nghe xong thì nhạc trở lại.
        au.onplay = () => { it.classList.add('playing'); St.musicWas = GP.music.playing; if (GP.music.playing) GP.music.audio.pause(); };
        au.onpause = au.onended = () => { it.classList.remove('playing'); if (St.musicWas) GP.music.play(); St.musicWas = false; };
      }
    }
  }

  function saveSoon() {
    clearTimeout(saveT);
    saveT = setTimeout(flush, 350);
  }
  function flush() {
    clearTimeout(saveT); saveT = 0;
    const sid = St.reading, s = sid && S.doc.stories[sid];
    if (!s || !St.editing) return;
    const title = $('#rd-title', reader).textContent.replace(/\s+/g, ' ').trim();
    const body = GP.panel.cleanHTML($('#rd-body', reader).innerHTML, false);
    const empty = !body.replace(/<(?!img)[^>]*>/g, '').replace(/&nbsp;|\s/g, '').length;
    const patch = { title, body: empty ? '' : body };
    if (patch.title !== s.title || patch.body !== s.body) S.commit('Sửa truyện', (t) => M.updateStory(t, sid, patch), 'story:' + sid);
  }

  async function removeCurrent() {
    const sid = St.reading, s = S.doc.stories[sid];
    if (!s) return;
    const v = await GP.ui.choose('Xoá truyện "' + (s.title || 'chưa đặt tên') + '"?', '<p>Có thể hoàn tác ngay sau khi xoá.</p>', [{ v: 'no', label: 'Huỷ', cls: 'ghost' }, { v: 'yes', label: 'Xoá', cls: 'danger' }]);
    if (v !== 'yes') return;
    St.editing = false;
    St.reading = null;
    reader.classList.remove('open');
    S.commit('Xoá truyện', (t) => M.removeStory(t, sid));
    GP.ui.toast({ text: 'Đã xoá truyện', undo: true });
    renderLib();
  }

  // Chọn người được kể tới: gõ tìm không dấu, bấm để gắn/gỡ.
  function tagPicker(anchor) {
    const sid = St.reading;
    const pop = document.createElement('div');
    pop.className = 'pop tag-pop no-pan in';
    pop.innerHTML = '<div class="pop-t">Truyện này kể về ai?</div><input placeholder="Gõ tên để tìm" autocomplete="off"><div class="tag-list"></div><div class="pop-b"><button class="btn primary">Xong</button></div>';
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.left = Math.max(10, Math.min(innerWidth - 290, r.left)) + 'px';
    pop.style.top = Math.max(10, Math.min(innerHeight - 380, r.bottom + 8)) + 'px';
    const inp = $('input', pop), box = $('.tag-list', pop);
    const draw = () => {
      const s = S.doc.stories[sid];
      if (!s) return;
      const q = norm(inp.value.trim());
      const all = Object.values(S.doc.people).filter((p) => !q || norm(p.name).includes(q));
      all.sort((a, b) => (s.people.includes(b.id) - s.people.includes(a.id)) || M.generation(S.doc, a.id) - M.generation(S.doc, b.id));
      box.innerHTML = all.slice(0, 40).map((p) => '<button class="tag-row' + (s.people.includes(p.id) ? ' on' : '') + '" data-id="' + p.id + '"><span class="tick"></span><span class="dot ' + (p.gender === 'f' ? 'f' : 'm') + '"></span>' +
        '<span>' + esc(p.name || 'Chưa đặt tên') + '<small> · Đời ' + M.generation(S.doc, p.id) + '</small></span></button>').join('') || '<div class="sr-none">Không thấy ai</div>';
    };
    draw();
    setTimeout(() => inp.focus(), 30);
    inp.addEventListener('input', draw);
    const done = () => { pop.remove(); document.removeEventListener('pointerdown', away, true); };
    const away = (e) => { if (!pop.contains(e.target)) done(); };
    setTimeout(() => document.addEventListener('pointerdown', away, true), 0);
    pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(); } });
    $('.btn', pop).onclick = done;
    box.addEventListener('click', (e) => {
      const b = e.target.closest('.tag-row');
      if (!b) return;
      const s = S.doc.stories[sid], id = b.dataset.id;
      const people = s.people.includes(id) ? s.people.filter((x) => x !== id) : s.people.concat(id);
      S.commit((s.people.includes(id) ? 'Gỡ ' : 'Gắn ') + nameOf(id) + ' khỏi truyện', (t) => M.updateStory(t, sid, { people }));
      draw();
    });
  }

  // ---------- kể chuyện cả cây ----------

  const tour = { on: false, paused: false, i: 0, list: [], t: 0 };

  function tourStart() {
    const L = GP.view.L;
    if (!L || !L.cards.length) return;
    closeLibrary(); closeReader(); GP.panel.close();
    tour.list = L.cards.slice().sort((a, b) => a.y - b.y || a.x - b.x).map((c) => c.id);
    tour.on = true; tour.paused = false; tour.i = 0;
    document.body.classList.add('touring');
    $('#tour').classList.add('open');
    GP.view.safeBottom = $('#tour').offsetHeight + 24;
    if (GP.music.prefs.on && !GP.music.playing) GP.music.play();
    tourShow();
  }

  function tourText(id) {
    const doc = S.doc, p = doc.people[id];
    const st = M.storiesOf(doc, id).map((k) => doc.stories[k]).find((s) => plain(s.body) || s.title);
    if (st) return { head: '📖 ' + (st.title || 'Một chuyện nhà'), text: plain(st.body).slice(0, 220), story: st.id };
    const note = plain(p.note);
    if (note) return { head: '', text: note.slice(0, 220) };
    const par = M.parentsOf(doc, id).map(nameOf);
    const sp = M.spousesOf(doc, id);
    const kids = M.kidsOf(doc, id);
    const bits = [];
    if (M.isSpouse(doc, id)) bits.push((p.gender === 'f' ? 'Vợ' : 'Chồng') + ' của ' + nameOf(sp[0]));
    else if (par.length) bits.push((p.gender === 'f' ? 'Con gái' : 'Con trai') + ' của ' + par.join(' và '));
    else bits.push('Người đứng đầu nhánh');
    if (kids.length) bits.push(kids.length + ' người con');
    if (p.place) bits.push(p.place);
    return { head: '', text: bits.join(' · ') };
  }

  function tourShow() {
    clearTimeout(tour.t);
    if (!tour.on) return;
    const doc = S.doc;
    while (tour.i < tour.list.length && !doc.people[tour.list[tour.i]]) tour.i++;
    if (tour.i >= tour.list.length) { tourStop(true); return; }
    const id = tour.list[tour.i], p = doc.people[id];
    GP.view.centerOn(id, { k: Math.max(0.85, GP.view.cam.k), dur: 900 });
    setTimeout(() => GP.view.pulse(id), 500);
    const tx = tourText(id);
    const box = $('#tour-card');
    box.classList.remove('in'); void box.offsetWidth;
    box.innerHTML = '<div class="tc-av ' + (p.gender === 'f' ? 'f' : 'm') + '">' + (p.photo ? '<img alt="">' : esc((String(p.name || '?').trim().split(/\s+/).pop()[0] || '?').toUpperCase())) + '</div>' +
      '<div class="tc-tx"><div class="tc-nm">' + esc(p.name || 'Chưa đặt tên') + '</div>' +
      '<div class="tc-yr">Đời ' + M.generation(doc, id) + (p.born || p.died ? ' · ' + esc([p.born, p.died].filter(Boolean).join(' – ')) : '') + '</div>' +
      (tx.head ? '<div class="tc-h">' + esc(tx.head) + '</div>' : '') +
      '<p>' + esc(tx.text) + (tx.text.length >= 220 ? '…' : '') + '</p>' +
      (tx.story ? '<button class="link" data-story="' + tx.story + '">Đọc cả truyện ›</button>' : '') + '</div>';
    if (p.photo) S.url(p.photo).then((u) => { const i = box.querySelector('img'); if (i && u) i.src = u; });
    box.classList.add('in');
    $('#tour-pos').textContent = (tour.i + 1) + ' / ' + tour.list.length;
    $('#tour-bar').style.setProperty('--p', ((tour.i + 1) / tour.list.length).toFixed(3));
    const ms = Math.min(11000, 3600 + tx.text.length * 32 + (tx.head ? 800 : 0));
    $('#tour-bar').style.setProperty('--d', ms + 'ms');
    if (!tour.paused) tour.t = setTimeout(() => { tour.i++; tourShow(); }, ms);
  }

  function tourPause() {
    tour.paused = !tour.paused;
    $('#tour-pp').textContent = tour.paused ? '▶' : '⏸';
    document.body.classList.toggle('tour-paused', tour.paused);
    if (tour.paused) clearTimeout(tour.t); else { tour.i++; tourShow(); }
  }

  function tourStop(finished) {
    clearTimeout(tour.t);
    tour.on = false;
    document.body.classList.remove('touring', 'tour-paused');
    $('#tour').classList.remove('open');
    GP.view.safeBottom = 0;
    if (finished) { GP.ui.toast({ text: 'Hết một vòng cây. Bấm ▶ Kể chuyện để nghe lại.' }); GP.view.fit(); }
  }

  // ---------- khung ----------

  function build() {
    lib = $('#stories'); reader = $('#reader');
    lib.innerHTML =
      '<div class="st-card-wrap">' +
        '<header class="st-head"><div><h2>Tủ truyện gia đình</h2><div class="st-sub" id="st-sub"></div></div>' +
          '<button class="icon-btn st-x" title="Đóng (Esc)">✕</button></header>' +
        '<div class="st-acts">' +
          '<button class="btn primary" data-st="write">✎ Viết truyện</button>' +
          '<label class="btn">⇪ Tải truyện lên<input type="file" multiple hidden id="st-file" accept=".docx,.txt,.md,.html,.htm,.pdf,image/*,audio/*,video/*"></label>' +
          '<button class="btn ghost" data-st="tour">▶ Kể chuyện cả cây</button>' +
        '</div>' +
        '<div class="st-drop" id="st-drop">Thả tệp vào đây: Word, văn bản, PDF, ảnh xưa, băng ghi âm lời kể…</div>' +
        '<div class="st-grid" id="st-grid"></div>' +
      '</div>';
    reader.innerHTML =
      '<div class="rd-top">' +
        '<button class="icon-btn light" id="rd-prev" title="Truyện trước">‹</button><span id="rd-pos" class="rd-pos"></span><button class="icon-btn light" id="rd-next" title="Truyện sau">›</button>' +
        '<span class="rd-sp"></span>' +
        '<button class="btn" id="rd-edit">✎ Sửa</button><button class="btn danger rd-del" id="rd-del">🗑</button>' +
        '<button class="icon-btn light" id="rd-close" title="Đóng (Esc)">✕</button>' +
      '</div>' +
      '<article class="rd-page">' +
        '<div class="rd-tb"><button data-c="bold"><b>B</b></button><button data-c="italic"><i>I</i></button><button data-c="h2">Tiêu đề</button><button data-c="blockquote">❝ Trích</button><button data-c="insertUnorderedList">•≡</button>' +
          '<label class="rd-att">📎 Đính kèm<input type="file" multiple hidden id="rd-file"></label></div>' +
        '<h1 class="rd-title" id="rd-title" data-ph="Tên câu chuyện"></h1>' +
        '<div class="rd-ppl" id="rd-ppl"></div>' +
        '<div class="rd-body" id="rd-body" data-ph="Kể lại câu chuyện ở đây…"></div>' +
        '<div class="rd-files" id="rd-files"></div>' +
        '<div class="rd-orn" aria-hidden="true">❦</div>' +
      '</article>';

    lib.addEventListener('click', (e) => {
      if (e.target === lib || e.target.closest('.st-x')) { closeLibrary(); return; }
      if (e.target.closest('.st-all')) { St.forPerson = null; renderLib(); return; }
      const c = e.target.closest('[data-story]');
      if (c) { read(c.dataset.story); return; }
      const a = e.target.closest('[data-st]');
      if (a && a.dataset.st === 'write') write();
      if (a && a.dataset.st === 'tour') tourStart();
    });
    $('#st-file', lib).onchange = (e) => { const fs = Array.from(e.target.files); e.target.value = ''; upload(fs); };
    const drop = $('#st-drop', lib);
    lib.addEventListener('dragover', (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); drop.classList.add('over'); } });
    lib.addEventListener('dragleave', (e) => { if (!lib.contains(e.relatedTarget)) drop.classList.remove('over'); });
    lib.addEventListener('drop', (e) => { if (!e.dataTransfer || !e.dataTransfer.files.length) return; e.preventDefault(); e.stopPropagation(); drop.classList.remove('over'); upload(Array.from(e.dataTransfer.files)); });

    $('#rd-close', reader).onclick = closeReader;
    reader.addEventListener('pointerdown', (e) => { if (e.target === reader) closeReader(); });
    $('#rd-prev', reader).onclick = () => stepStory(-1);
    $('#rd-next', reader).onclick = () => stepStory(1);
    $('#rd-edit', reader).onclick = () => { if (St.editing) flush(); St.editing = !St.editing; renderReader(false); if (St.editing) $('#rd-body', reader).focus(); };
    $('#rd-del', reader).onclick = removeCurrent;
    $('#rd-title', reader).addEventListener('input', saveSoon);
    $('#rd-title', reader).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#rd-body', reader).focus(); } });
    $('#rd-body', reader).addEventListener('input', saveSoon);
    $('#rd-body', reader).addEventListener('paste', (e) => {
      const html = e.clipboardData && e.clipboardData.getData('text/html');
      if (!html) return;
      e.preventDefault();
      document.execCommand('insertHTML', false, GP.panel.cleanHTML(html.replace(/<!--[\s\S]*?-->/g, ''), true));
    });
    $('.rd-tb', reader).addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
    $('.rd-tb', reader).addEventListener('click', (e) => {
      const b = e.target.closest('[data-c]');
      if (!b) return;
      const c = b.dataset.c;
      if (c === 'h2' || c === 'blockquote') document.execCommand('formatBlock', false, '<' + c + '>');
      else document.execCommand(c, false, null);
      saveSoon();
    });
    $('#rd-file', reader).onchange = async (e) => {
      const fs = Array.from(e.target.files); e.target.value = '';
      const sid = St.reading;
      if (!fs.length || !sid) return;
      const ids = [];
      for (const f of fs) ids.push((await S.putFile(f)).id);
      flush();
      S.commit('Đính kèm vào truyện', (t) => {
        const s = t.stories[sid];
        s.files.push(...ids);
        if (!s.cover) s.cover = ids.find((id, i) => /^image\//.test(fs[i].type)) || null;
      });
      renderReader(true);
    };
    $('#rd-ppl', reader).addEventListener('click', (e) => {
      const go = e.target.closest('[data-go]');
      if (go) { closeReader(); closeLibrary(); GP.app.reveal(go.dataset.go); return; }
      if (e.target.closest('[data-rd="tag"]')) tagPicker(e.target.closest('[data-rd="tag"]'));
    });
    $('#rd-files', reader).addEventListener('click', async (e) => {
      const b = e.target.closest('[data-dl]');
      if (b) { const r = await S.getFile(b.dataset.dl); if (r) GP.panel.download(r); }
      if (e.target.tagName === 'IMG') e.target.classList.toggle('zoom');
    });

    $('#tour').addEventListener('click', (e) => {
      if (e.target.closest('#tour-x')) tourStop(false);
      else if (e.target.closest('#tour-pp')) tourPause();
      else if (e.target.closest('#tour-nx')) { tour.i++; tourShow(); }
      else if (e.target.closest('#tour-pv')) { tour.i = Math.max(0, tour.i - 1); tourShow(); }
      else if (e.target.closest('[data-story]')) { if (!tour.paused) tourPause(); read(e.target.closest('[data-story]').dataset.story); }
    });
  }

  function stepStory(d) {
    flush();
    const list = siblings(), i = list.indexOf(St.reading);
    if (i < 0 || list.length < 2) return;
    St.reading = list[(i + d + list.length) % list.length];
    St.editing = false;
    renderReader(true);
  }

  function onKey(e) {
    if (reader.classList.contains('open')) {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        if (document.querySelector('.tag-pop')) return;
        const a = document.activeElement;
        if (a && a.isContentEditable) a.blur(); else closeReader();
      } else if (!St.editing && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.stopImmediatePropagation(); stepStory(e.key === 'ArrowLeft' ? -1 : 1); }
      return;
    }
    if (lib.classList.contains('open') && e.key === 'Escape') { e.stopImmediatePropagation(); closeLibrary(); return; }
    if (tour.on) {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); tourStop(false); }
      else if (e.key === ' ') { e.preventDefault(); e.stopImmediatePropagation(); tourPause(); }
      else if (e.key === 'ArrowRight') { e.stopImmediatePropagation(); tour.i++; tourShow(); }
      else if (e.key === 'ArrowLeft') { e.stopImmediatePropagation(); tour.i = Math.max(0, tour.i - 1); tourShow(); }
    }
  }

  function renderBadge() {
    if (!S.doc) return;
    const n = M.storyList(S.doc).length;
    $('#stories-n').textContent = n || '';
  }

  function init() {
    build();
    addEventListener('keydown', onKey, true);
    S.on('change', (e) => {
      renderBadge();
      if (lib.classList.contains('open')) renderLib();
      if (St.reading && reader.classList.contains('open')) {
        if (!S.doc.stories[St.reading]) { St.reading = null; reader.classList.remove('open'); }
        else renderReader(!!(e && e.history));
      }
    });
    S.on('load', () => { tourStop(false); closeReader(); closeLibrary(); renderBadge(); });
    $('#stories-btn').onclick = () => openLibrary(null);
    renderBadge();
  }

  Object.assign(St, { init, badge: renderBadge, openLibrary, closeLibrary, read, upload, tourStart, tourStop, flush, get touring() { return tour.on; } });
  GP.stories = St;
})(window.GP);
