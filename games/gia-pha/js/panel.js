/*
 * Bảng bên phải (điện thoại: tấm kéo từ dưới lên) cho người đang chọn: thông tin, ghi chú
 * soạn như Word, tài liệu đính kèm (ảnh, tiếng, phim, PDF, Word, mọi loại tệp), ghi âm.
 *
 * Gõ vào ô nào cũng lưu ngay qua store.commit với khoá gộp, nên một tràng gõ là một bước
 * hoàn tác. Bảng chỉ ghi đè ô đang không có con trỏ, để làm mới không cắt ngang lúc gõ.
 */
(function (GP) {
  'use strict';
  const M = GP.model, S = GP.store;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  const P = { id: null, tab: 'info', isOpen: false };
  let el, noteT;

  // ---------- loại tệp: một bảng tra thay cho chuỗi if rải rác ----------

  const KINDS = [
    { k: 'image', test: (t) => t.startsWith('image/'), icon: '🖼️', label: 'Ảnh' },
    { k: 'audio', test: (t) => t.startsWith('audio/'), icon: '🎵', label: 'Âm thanh' },
    { k: 'video', test: (t) => t.startsWith('video/'), icon: '🎬', label: 'Phim' },
    { k: 'pdf', test: (t) => t === 'application/pdf', icon: '📕', label: 'PDF' },
    { k: 'docx', test: (t, n) => /wordprocessingml/.test(t) || /\.docx$/i.test(n), icon: '📝', label: 'Word' },
    { k: 'text', test: (t, n) => t.startsWith('text/') || t === 'application/json' || /\.(txt|md|csv|json)$/i.test(n), icon: '📄', label: 'Văn bản' },
    { k: 'other', test: () => true, icon: '📦', label: 'Tệp' },
  ];
  const kindOf = (f) => KINDS.find((k) => k.test(f.type || '', f.name || ''));
  const fmtSize = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB');

  // ---------- dọn HTML ghi chú: ranh giới giữa trình soạn/tệp nhập và dữ liệu lưu ----------

  const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT']);
  function cleanHTML(html, keepSrc) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    const walk = (node) => {
      for (const ch of Array.from(node.childNodes)) {
        if (ch.nodeType === 8) { ch.remove(); continue; }
        if (ch.nodeType !== 1) continue;
        if (DROP.has(ch.tagName)) { ch.remove(); continue; }
        for (const a of Array.from(ch.attributes)) {
          const n = a.name.toLowerCase();
          if (n.startsWith('on') || n === 'contenteditable') ch.removeAttribute(a.name);
          else if ((n === 'href' || n === 'src') && /^\s*javascript:/i.test(a.value)) ch.removeAttribute(a.name);
        }
        if (ch.tagName === 'IMG' && ch.dataset.fid && !keepSrc) ch.removeAttribute('src');
        if (ch.tagName === 'A') { ch.setAttribute('target', '_blank'); ch.setAttribute('rel', 'noopener'); }
        walk(ch);
      }
    };
    walk(tpl.content);
    return tpl.innerHTML;
  }

  function person() { return P.id && S.doc.people[P.id]; }

  // Tên dài xuống dòng thay vì trôi khuất trong một ô một dòng.
  function growName() { const t = $('#pn-name', el); t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }

  // ---------- dựng khung ----------

  function build() {
    el.innerHTML =
      '<div class="sheet-grip" title="Kéo để thu/mở"></div>' +
      '<header class="pn-head">' +
        '<button class="icon-btn pn-close" title="Đóng (Esc)">✕</button>' +
        '<label class="pn-av" title="Đổi ảnh đại diện"><input type="file" accept="image/*" hidden id="pn-photo"><span class="pn-av-in"></span><span class="pn-av-cam">📷</span></label>' +
        '<div class="pn-who"><textarea class="pn-name" id="pn-name" rows="1" placeholder="Họ và tên" autocomplete="off" spellcheck="false"></textarea>' +
        '<div class="pn-sub" id="pn-sub"></div></div>' +
      '</header>' +
      '<nav class="pn-tabs" role="tablist">' +
        '<button data-tab="info" role="tab">Thông tin</button>' +
        '<button data-tab="note" role="tab">Ghi chú</button>' +
        '<button data-tab="files" role="tab">Tài liệu <b id="pn-nfiles"></b></button>' +
        '<span class="tab-ink"></span>' +
      '</nav>' +
      '<div class="pn-body">' +
        '<section data-pane="info">' +
          '<div class="seg" id="pn-gender"><button data-g="m">Nam</button><button data-g="f">Nữ</button></div>' +
          '<div class="grid2">' +
            '<label class="fld"><span>Năm sinh</span><input id="pn-born" placeholder="vd 1925 hoặc 12/3/1925"></label>' +
            '<label class="fld"><span>Năm mất</span><input id="pn-died" placeholder="để trống nếu còn sống"></label>' +
          '</div>' +
          '<label class="fld"><span>Quê quán / nơi ở</span><input id="pn-place" placeholder="vd Làng Phù Lưu, Bắc Ninh"></label>' +
          '<div class="rel" id="pn-rel"></div>' +
          '<div class="pn-actions" id="pn-actions"></div>' +
        '</section>' +
        '<section data-pane="note">' +
          '<div class="note-wrap">' +
          '<div class="tb" id="tb">' +
            '<select data-cmd="formatBlock" title="Kiểu đoạn"><option value="p">Đoạn văn</option><option value="h1">Tiêu đề lớn</option><option value="h2">Tiêu đề</option><option value="h3">Tiêu đề nhỏ</option><option value="blockquote">Trích dẫn</option></select>' +
            '<span class="sep"></span>' +
            '<button data-cmd="bold" title="Đậm (Ctrl+B)"><b>B</b></button><button data-cmd="italic" title="Nghiêng (Ctrl+I)"><i>I</i></button>' +
            '<button data-cmd="underline" title="Gạch chân (Ctrl+U)"><u>U</u></button><button data-cmd="strikeThrough" title="Gạch ngang"><s>S</s></button>' +
            '<span class="sep"></span>' +
            '<label class="clr" title="Màu chữ">A<input type="color" data-cmd="foreColor" value="#b3261e"></label>' +
            '<label class="clr hl" title="Tô nền">▇<input type="color" data-cmd="hiliteColor" value="#fff176"></label>' +
            '<span class="sep"></span>' +
            '<button data-cmd="insertUnorderedList" title="Danh sách chấm">•≡</button><button data-cmd="insertOrderedList" title="Danh sách số">1≡</button>' +
            '<button data-cmd="justifyLeft" title="Căn trái">⇤</button><button data-cmd="justifyCenter" title="Căn giữa">↔</button><button data-cmd="justifyRight" title="Căn phải">⇥</button>' +
            '<span class="sep"></span>' +
            '<button data-cmd="link" title="Chèn liên kết">🔗</button><button data-cmd="image" title="Chèn ảnh">🖼️</button>' +
            '<button data-cmd="table" title="Chèn bảng">▦</button><button data-cmd="insertHorizontalRule" title="Đường kẻ">―</button>' +
            '<button data-cmd="removeFormat" title="Xoá định dạng">⌫</button>' +
            '<span class="sep"></span>' +
            '<button data-cmd="docx" title="Nhập nội dung từ tệp Word (.docx)">⇪ Word</button>' +
            '<button data-cmd="full" class="tb-full" title="Mở rộng thành trang giấy">⛶</button>' +
          '</div>' +
          '<div class="page"><div class="doc" id="pn-doc" contenteditable="true" spellcheck="false" data-ph="Viết tiểu sử, kỷ niệm, ngày giỗ, nơi an táng… Dán từ Word cũng được."></div></div>' +
          '<div class="note-foot"><span id="pn-wc"></span><span id="pn-saved"></span></div>' +
          '</div>' +
          '<input type="file" accept="image/*" hidden id="pn-noteimg"><input type="file" accept=".docx" hidden id="pn-notedocx">' +
        '</section>' +
        '<section data-pane="files">' +
          '<div class="drop" id="pn-drop"><div class="drop-ic">⇪</div><div><b>Thả tệp vào đây</b> hoặc <label class="link">chọn từ máy<input type="file" multiple hidden id="pn-file"></label></div>' +
          '<small>Ảnh, âm thanh, phim, PDF, Word, Excel… loại nào cũng nhận</small></div>' +
          '<div class="rec" id="pn-rec"><button class="btn" id="pn-recbtn"><span class="dot"></span> <span class="t">Ghi âm</span></button><canvas id="pn-meter" width="160" height="28"></canvas><span id="pn-rectime"></span></div>' +
          '<div class="files" id="pn-files"></div>' +
        '</section>' +
      '</div>';

    $('.pn-close', el).onclick = () => close();
    $$('.pn-tabs button', el).forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));

    const bindField = (sel, key) => {
      const inp = $(sel, el);
      inp.addEventListener('input', () => {
        const id = P.id;
        S.commit('Sửa ' + key, (t) => M.update(t, id, { [key]: inp.value }), 'f:' + id + ':' + key);
      });
    };
    bindField('#pn-name', 'name'); bindField('#pn-born', 'born'); bindField('#pn-died', 'died'); bindField('#pn-place', 'place');
    const nameI = $('#pn-name', el);
    nameI.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); nameI.blur(); } });
    nameI.addEventListener('input', () => growName());
    $$('#pn-gender button', el).forEach((b) => (b.onclick = () => {
      const id = P.id;
      S.commit('Đổi giới tính', (t) => M.update(t, id, { gender: b.dataset.g }));
    }));
    $('#pn-photo', el).onchange = async (e) => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      const rec = await S.putFile(f);
      const id = P.id;
      S.commit('Đổi ảnh đại diện', (t) => M.update(t, id, { photo: rec.id }));
    };

    initEditor();
    initFiles();
    initSheet();
  }

  // ---------- trình soạn ghi chú ----------

  function initEditor() {
    const ed = $('#pn-doc', el);
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { /* trình duyệt cũ */ }
    ed.addEventListener('input', () => { saveNoteSoon(); countWords(); });
    ed.addEventListener('paste', (e) => {
      const html = e.clipboardData && e.clipboardData.getData('text/html');
      if (!html) return;
      e.preventDefault();
      document.execCommand('insertHTML', false, cleanHTML(html.replace(/<!--[\s\S]*?-->/g, ''), true));
    });
    ed.addEventListener('click', (e) => { if (e.target.tagName === 'A' && (e.ctrlKey || e.metaKey)) window.open(e.target.href, '_blank'); });
    ed.addEventListener('drop', async (e) => {
      const fs = e.dataTransfer && Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
      if (!fs || !fs.length) return;
      e.preventDefault(); e.stopPropagation();
      for (const f of fs) await insertNoteImage(f);
    });

    const tb = $('#tb', el);
    tb.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
    tb.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const cmd = b.dataset.cmd;
      ed.focus();
      if (cmd === 'link') {
        const url = await GP.ui.prompt('Chèn liên kết', 'Địa chỉ trang (https://…)', 'https://');
        if (url) { restoreSel(); document.execCommand('createLink', false, url); }
      } else if (cmd === 'image') { saveSel(); $('#pn-noteimg', el).click(); }
      else if (cmd === 'docx') { saveSel(); $('#pn-notedocx', el).click(); }
      else if (cmd === 'table') {
        const row = '<tr><td><br></td><td><br></td><td><br></td></tr>';
        document.execCommand('insertHTML', false, '<table class="nt" data-new="1"><tbody>' + row + row + row + '</tbody></table><p><br></p>');
        const tbl = ed.querySelector('table[data-new]');
        if (tbl) {
          tbl.removeAttribute('data-new');
          const r = document.createRange();
          r.selectNodeContents(tbl.querySelector('td'));
          r.collapse(true);
          getSelection().removeAllRanges(); getSelection().addRange(r);
        }
      } else if (cmd === 'full') { $('[data-pane="note"]', el).classList.toggle('full'); b.textContent = $('[data-pane="note"]', el).classList.contains('full') ? '✕' : '⛶'; }
      else document.execCommand(cmd, false, null);
      saveNoteSoon(); syncTb();
    });
    for (const inp of $$('input[type=color]', tb)) {
      inp.addEventListener('mousedown', saveSel);
      inp.addEventListener('input', () => { restoreSel(); document.execCommand('styleWithCSS', false, true); document.execCommand(inp.dataset.cmd, false, inp.value); document.execCommand('styleWithCSS', false, false); saveNoteSoon(); });
    }
    $('select', tb).addEventListener('change', (e) => { ed.focus(); restoreSel(); document.execCommand('formatBlock', false, '<' + e.target.value + '>'); saveNoteSoon(); });
    $('select', tb).addEventListener('mousedown', saveSel);
    document.addEventListener('selectionchange', () => { if (document.activeElement === ed) { saveSel(); syncTb(); } });

    $('#pn-noteimg', el).onchange = async (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) { ed.focus(); restoreSel(); await insertNoteImage(f); } };
    $('#pn-notedocx', el).onchange = async (e) => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      try {
        const html = await docxToHTML(await f.arrayBuffer(), true);
        ed.focus(); restoreSel();
        document.execCommand('insertHTML', false, cleanHTML(html, true));
        saveNoteSoon(); countWords();
        GP.ui.toast({ text: 'Đã nhập nội dung từ ' + f.name });
      } catch (err) { GP.ui.toast({ text: 'Không đọc được tệp Word: ' + err.message, bad: true }); }
    };
  }

  let savedRange = null;
  function saveSel() {
    const s = getSelection();
    const ed = $('#pn-doc', el);
    if (s.rangeCount && ed.contains(s.anchorNode)) savedRange = s.getRangeAt(0).cloneRange();
  }
  function restoreSel() {
    if (!savedRange) return;
    const s = getSelection();
    s.removeAllRanges(); s.addRange(savedRange);
  }
  function syncTb() {
    for (const b of $$('#tb button[data-cmd]', el)) {
      let on = false;
      try { on = ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList', 'justifyCenter', 'justifyRight'].includes(b.dataset.cmd) && document.queryCommandState(b.dataset.cmd); } catch (e) { on = false; }
      b.classList.toggle('on', on);
    }
    try {
      const v = String(document.queryCommandValue('formatBlock') || 'p').toLowerCase().replace(/[<>]/g, '');
      const sel = $('#tb select', el);
      if ([...sel.options].some((o) => o.value === v)) sel.value = v; else sel.value = 'p';
    } catch (e) { /* bỏ qua */ }
  }

  async function insertNoteImage(f) {
    const rec = await S.putFile(f);
    const u = await S.url(rec.id);
    document.execCommand('insertHTML', false, '<img data-fid="' + rec.id + '" src="' + u + '" alt="' + esc(f.name) + '">');
    saveNoteSoon();
  }

  function saveNoteSoon() {
    const id = P.id;
    $('#pn-saved', el).textContent = 'Đang lưu…';
    clearTimeout(noteT);
    noteT = setTimeout(() => saveNoteNow(id), 400);
  }
  function saveNoteNow(id) {
    clearTimeout(noteT); noteT = 0;
    if (!id || !S.doc.people[id]) return;
    const html = cleanHTML($('#pn-doc', el).innerHTML, false);
    const empty = !html.replace(/<(?!img)[^>]*>/g, '').replace(/&nbsp;|\s/g, '').length;
    const v = empty ? '' : html;
    if (S.doc.people[id].note !== v) S.commit('Sửa ghi chú', (t) => M.update(t, id, { note: v }), 'note:' + id);
    $('#pn-saved', el).textContent = 'Đã lưu ✓';
  }
  function countWords() {
    const txt = $('#pn-doc', el).innerText.trim();
    $('#pn-wc', el).textContent = txt ? txt.split(/\s+/).length + ' chữ' : '';
  }
  function loadNote(p) {
    const ed = $('#pn-doc', el);
    ed.innerHTML = cleanHTML(p.note || '', false);
    for (const img of ed.querySelectorAll('img[data-fid]')) S.url(img.dataset.fid).then((u) => { if (u) img.src = u; });
    ed.dataset.for = p.id;
    countWords();
    $('#pn-saved', el).textContent = '';
  }

  function loadMammoth() {
    if (window.mammoth) return Promise.resolve(window.mammoth);
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'vendor/mammoth.browser.min.js';
      s.onload = () => res(window.mammoth);
      s.onerror = () => rej(new Error('không tải được bộ đọc Word'));
      document.head.appendChild(s);
    });
  }
  async function docxToHTML(buf, storeImages) {
    const mm = await loadMammoth();
    const opts = {};
    if (storeImages) {
      opts.convertImage = mm.images.imgElement(async (image) => {
        const b64 = await image.read('base64');
        const bin = atob(b64), a = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
        const rec = await S.putFile(new Blob([a], { type: image.contentType }), 'anh-tu-word');
        return { src: await S.url(rec.id), 'data-fid': rec.id };
      });
    }
    const r = await mm.convertToHtml({ arrayBuffer: buf }, opts);
    return r.value;
  }

  // ---------- tài liệu đính kèm ----------

  function initFiles() {
    const drop = $('#pn-drop', el);
    $('#pn-file', el).onchange = (e) => { const fs = Array.from(e.target.files); e.target.value = ''; attach(P.id, fs); };
    ['dragenter', 'dragover'].forEach((ev) => el.addEventListener(ev, (e) => {
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return;
      if (e.target.closest('#pn-doc')) return;
      e.preventDefault();
      if (P.tab !== 'files') setTab('files');
      drop.classList.add('over');
    }));
    el.addEventListener('dragleave', (e) => { if (!el.contains(e.relatedTarget)) drop.classList.remove('over'); });
    el.addEventListener('drop', (e) => {
      if (e.target.closest('#pn-doc') || !e.dataTransfer || !e.dataTransfer.files.length) return;
      e.preventDefault();
      drop.classList.remove('over');
      attach(P.id, Array.from(e.dataTransfer.files));
    });
    $('#pn-recbtn', el).onclick = toggleRecord;
    $('#pn-files', el).addEventListener('click', onFileClick);
  }

  async function attach(id, files) {
    if (!id || !files.length) return;
    const ids = [];
    try {
      for (const f of files) ids.push((await S.putFile(f)).id);
    } catch (err) {
      GP.ui.toast({ text: 'Không lưu được tệp (bộ nhớ trình duyệt đầy?): ' + err.message, bad: true });
      if (!ids.length) return;
    }
    const name = S.doc.people[id].name || 'người này';
    S.commit('Thêm ' + ids.length + ' tệp', (t) => { t.people[id].files.push(...ids); });
    GP.ui.toast({ text: 'Đã thêm ' + ids.length + ' tệp cho ' + name, undo: true });
    if (P.id === id && P.isOpen) setTab('files');
    GP.view.pulse(id);
  }

  async function renderFiles(p) {
    const box = $('#pn-files', el);
    const my = p.id + ':' + p.files.join(',');
    box.dataset.for = my;
    if (!p.files.length) { box.innerHTML = '<p class="empty-files">Chưa có tài liệu nào. Ảnh cũ, giấy tờ, băng ghi âm lời kể của ông bà… đều để ở đây được.</p>'; return; }
    const recs = await Promise.all(p.files.map((f) => S.getFile(f)));
    if (box.dataset.for !== my) return;
    box.innerHTML = '';
    recs.forEach((r, i) => {
      if (!r) return;
      const k = kindOf(r);
      const it = document.createElement('div');
      it.className = 'fi k-' + k.k;
      it.dataset.fid = r.id;
      it.style.animationDelay = (i * 40) + 'ms';
      it.innerHTML =
        '<button class="fi-thumb" data-fa="view" title="Xem">' + (k.k === 'image' ? '<img alt="">' : k.k === 'video' ? '<video muted preload="metadata"></video><span class="play">▶</span>' : '<span class="fi-ic">' + k.icon + '</span>') + '</button>' +
        '<div class="fi-meta"><div class="fi-name" data-fa="view" title="' + esc(r.name) + '">' + esc(r.name) + '</div>' +
        '<div class="fi-sub" data-fa="view">' + k.label + ' · ' + fmtSize(r.size) + ' · ' + new Date(r.added).toLocaleDateString('vi-VN') + '</div>' +
        (k.k === 'audio' ? '<audio controls preload="none"></audio>' : '') + '</div>' +
        '<div class="fi-acts">' +
          (k.k === 'image' ? '<button data-fa="avatar" title="Đặt làm ảnh đại diện">👤</button>' : '') +
          '<button data-fa="rename" title="Đổi tên">✎</button><button data-fa="download" title="Tải về">⤓</button><button data-fa="remove" title="Gỡ khỏi người này">🗑</button>' +
        '</div>';
      box.appendChild(it);
      S.url(r.id).then((u) => {
        const m = it.querySelector('img,video,audio');
        if (m) m.src = u;
      });
    });
  }

  async function onFileClick(e) {
    const b = e.target.closest('[data-fa]');
    if (!b) return;
    const it = b.closest('.fi');
    const fid = it.dataset.fid, id = P.id;
    const rec = await S.getFile(fid);
    if (!rec) return;
    const act = b.dataset.fa;
    if (act === 'view') GP.viewer.open(S.doc.people[id].files, fid);
    else if (act === 'download') download(rec);
    else if (act === 'avatar') S.commit('Đổi ảnh đại diện', (t) => M.update(t, id, { photo: fid }));
    else if (act === 'rename') {
      const n = await GP.ui.prompt('Đổi tên tệp', 'Tên mới', rec.name);
      if (n && n !== rec.name) { await S.renameFile(fid, n); renderFiles(S.doc.people[id]); }
    } else if (act === 'remove') {
      it.classList.add('leaving');
      setTimeout(() => {
        S.commit('Gỡ tệp ' + rec.name, (t) => { t.people[id].files = t.people[id].files.filter((x) => x !== fid); });
        GP.ui.toast({ text: 'Đã gỡ ' + rec.name, undo: true });
      }, 220);
    }
  }

  async function download(rec) {
    const a = document.createElement('a');
    a.href = await S.url(rec.id);
    a.download = rec.name;
    document.body.appendChild(a); a.click(); a.remove();
  }

  // ---------- ghi âm ----------

  let rec = null;
  async function toggleRecord() {
    const btn = $('#pn-recbtn', el);
    if (rec) { rec.mr.stop(); return; }
    if (!navigator.mediaDevices || !window.MediaRecorder) { GP.ui.toast({ text: 'Trình duyệt này không ghi âm được', bad: true }); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (err) { GP.ui.toast({ text: 'Không mở được micro: ' + err.message, bad: true }); return; }
    const mr = new MediaRecorder(stream);
    const chunks = [];
    const id = P.id;
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const an = ac.createAnalyser(); an.fftSize = 64;
    ac.createMediaStreamSource(stream).connect(an);
    const data = new Uint8Array(an.frequencyBinCount);
    const cv = $('#pn-meter', el), g = cv.getContext('2d');
    const t0 = Date.now();
    rec = { mr, raf: 0 };
    const draw = () => {
      an.getByteFrequencyData(data);
      g.clearRect(0, 0, cv.width, cv.height);
      const n = 20, bw = cv.width / n;
      for (let i = 0; i < n; i++) {
        const v = data[i + 2] / 255, h = Math.max(2, v * cv.height);
        g.fillStyle = 'rgba(179,38,30,' + (0.35 + v * 0.65) + ')';
        g.fillRect(i * bw + 1, (cv.height - h) / 2, bw - 2, h);
      }
      const s = Math.floor((Date.now() - t0) / 1000);
      $('#pn-rectime', el).textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
      rec && (rec.raf = requestAnimationFrame(draw));
    };
    draw();
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.onstop = async () => {
      cancelAnimationFrame(rec.raf);
      rec = null;
      stream.getTracks().forEach((t) => t.stop());
      ac.close();
      el.classList.remove('recording');
      btn.querySelector('.t').textContent = 'Ghi âm';
      $('#pn-rectime', el).textContent = '';
      g.clearRect(0, 0, cv.width, cv.height);
      const type = mr.mimeType || 'audio/webm';
      const d = new Date();
      const name = 'Ghi âm ' + d.toLocaleDateString('vi-VN').replace(/\//g, '-') + ' ' + String(d.getHours()).padStart(2, '0') + 'h' + String(d.getMinutes()).padStart(2, '0') + (type.includes('ogg') ? '.ogg' : type.includes('mp4') ? '.m4a' : '.webm');
      attach(id, [new File(chunks, name, { type })]);
    };
    mr.start();
    el.classList.add('recording');
    btn.querySelector('.t').textContent = 'Dừng ghi';
  }

  // ---------- quan hệ & hành động ----------

  function chip(id) {
    const p = S.doc.people[id];
    if (!p) return '';
    return '<button class="pchip ' + (p.gender === 'f' ? 'f' : 'm') + '" data-go="' + id + '">' + esc(p.name || 'Chưa đặt tên') + '</button>';
  }

  function renderInfo(p) {
    const doc = S.doc;
    const x = M.ix(doc);
    const spouse = M.isSpouse(doc, p.id, x);
    const parents = M.parentsOf(doc, p.id);
    const sps = M.spousesOf(doc, p.id, x);
    const kids = M.kidsOf(doc, p.id, x);
    const sib = (M.siblingsList(doc, p.id) || []).filter((s) => s !== p.id);
    const row = (label, ids) => ids.length ? '<div class="rrow"><span>' + label + '</span><div>' + ids.map(chip).join('') + '</div></div>' : '';
    $('#pn-rel', el).innerHTML =
      row('Cha mẹ', parents) + row(spouse ? 'Là vợ/chồng của' : 'Vợ/chồng', sps) + row('Anh chị em', sib) + row('Con', kids) ||
      '<div class="rrow muted">Chưa có quan hệ nào. Dùng các nút bên dưới để thêm.</div>';
    const isRoot = !spouse && !p.parentUnion;
    const focused = doc.view.focus === p.id;
    $('#pn-actions', el).innerHTML =
      '<div class="act-row">' +
        '<button class="btn" data-pa="add-child">＋ Con</button>' +
        (spouse ? '' : '<button class="btn" data-pa="add-spouse">♥ Vợ/chồng</button>') +
        (isRoot ? '<button class="btn" data-pa="add-parent">↑ Cha/mẹ</button>' : '') +
      '</div>' +
      '<div class="act-row">' +
        (!spouse && kids.length ? '<button class="btn ghost" data-pa="focus">' + (focused ? '⤢ Hiện cả cây' : '◎ Chỉ xem nhánh này') + '</button>' : '') +
        '<button class="btn ghost" data-pa="center">⌖ Tìm trên cây</button>' +
        '<button class="btn danger" data-pa="remove">🗑 Xoá</button>' +
      '</div>';
  }

  function onInfoClick(e) {
    const go = e.target.closest('[data-go]');
    if (go) { GP.app.reveal(go.dataset.go); return; }
    const a = e.target.closest('[data-pa]');
    if (!a) return;
    const id = P.id, act = a.dataset.pa;
    if (act === 'focus') GP.app.focusBranch(S.doc.view.focus === id ? null : id);
    else if (act === 'center') { GP.view.centerOn(id); GP.view.pulse(id); }
    else if (act === 'remove') GP.app.removeFlow(id);
    else GP.app.addFlow(act.replace('add-', ''), id, a);
  }

  // ---------- trạng thái bảng ----------

  function setTab(tab) {
    P.tab = tab;
    $$('.pn-tabs button', el).forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    $$('.pn-body section', el).forEach((s) => s.classList.toggle('on', s.dataset.pane === tab));
    const b = $('.pn-tabs button.on', el), ink = $('.tab-ink', el);
    if (b) { ink.style.width = b.offsetWidth + 'px'; ink.style.transform = 'translateX(' + b.offsetLeft + 'px)'; }
    try { localStorage.setItem('gia-pha.tab', tab); } catch (e) { /* riêng tư */ }
  }

  function fill(force) {
    const p = person();
    if (!p) { close(); return; }
    const a = document.activeElement;
    const setv = (sel, v) => { const i = $(sel, el); if (i !== a && i.value !== v) i.value = v; };
    setv('#pn-name', p.name); growName(); setv('#pn-born', p.born); setv('#pn-died', p.died); setv('#pn-place', p.place);
    $$('#pn-gender button', el).forEach((b) => b.classList.toggle('on', b.dataset.g === p.gender));
    const parents = M.parentsOf(S.doc, p.id).map((id) => S.doc.people[id].name).filter(Boolean);
    const sp = M.isSpouse(S.doc, p.id) ? M.spousesOf(S.doc, p.id).map((id) => S.doc.people[id].name)[0] : null;
    $('#pn-sub', el).textContent = 'Đời ' + M.generation(S.doc, p.id) + (sp ? ' · dâu/rể, vợ/chồng của ' + sp : parents.length ? ' · con của ' + parents.join(' & ') : ' · gốc của nhánh');
    const av = $('.pn-av-in', el);
    av.className = 'pn-av-in ' + (p.gender === 'f' ? 'f' : 'm');
    if (p.photo) { av.innerHTML = '<img alt="">'; S.url(p.photo).then((u) => { const i = av.querySelector('img'); if (i && u) i.src = u; }); }
    else av.textContent = (String(p.name || '?').trim().split(/\s+/).pop()[0] || '?').toUpperCase();
    $('#pn-nfiles', el).textContent = p.files.length || '';
    renderInfo(p);
    const ed = $('#pn-doc', el);
    if (force || ed.dataset.for !== p.id || (document.activeElement !== ed && !noteT && cleanHTML(ed.innerHTML, false) !== (p.note || ''))) loadNote(p);
    if ($('#pn-files', el).dataset.for !== p.id + ':' + p.files.join(',')) renderFiles(p);
  }

  function open(id, tab) {
    if (noteT && P.id) saveNoteNow(P.id);
    const switching = P.id !== id;
    P.id = id;
    P.isOpen = true;
    el.classList.add('open');
    document.body.classList.add('panel-open');
    fill(switching);
    if (switching) el.classList.remove('swap'), void el.offsetWidth, el.classList.add('swap');
    setTab(tab || P.tab);
    const wide = innerWidth > 760;
    GP.view.safeRight = wide ? el.offsetWidth : 0;
    GP.view.safeBottom = wide ? 0 : el.offsetHeight;
    if (switching) setTimeout(() => GP.view.centerOn(id, { ifHidden: true, k: GP.view.cam.k }), 60);
  }

  function close() {
    if (noteT && P.id) saveNoteNow(P.id);
    if (rec) rec.mr.stop();
    P.isOpen = false; P.id = null;
    el.classList.remove('open');
    $('[data-pane="note"]', el).classList.remove('full');
    document.body.classList.remove('panel-open');
    GP.view.safeRight = 0; GP.view.safeBottom = 0;
    if (GP.view.sel) GP.view.select(null, 'panel-close');
  }

  // Điện thoại: kéo tay nắm để thu/mở tấm dưới.
  function initSheet() {
    const grip = $('.sheet-grip', el);
    let y0 = null, h0 = 0;
    grip.addEventListener('pointerdown', (e) => { y0 = e.clientY; h0 = el.offsetHeight; grip.setPointerCapture(e.pointerId); el.style.transition = 'none'; });
    grip.addEventListener('pointermove', (e) => { if (y0 == null) return; el.style.height = Math.max(120, Math.min(innerHeight - 40, h0 - (e.clientY - y0))) + 'px'; });
    grip.addEventListener('pointerup', (e) => {
      if (y0 == null) return;
      el.style.transition = '';
      const dy = e.clientY - y0; y0 = null;
      if (dy > 120 && h0 - dy < 200) { el.style.height = ''; close(); }
      else if (Math.abs(dy) < 6) el.style.height = el.offsetHeight > innerHeight * 0.8 ? '' : (innerHeight * 0.92) + 'px';
    });
  }

  function init() {
    el = $('#panel');
    build();
    $('[data-pane="info"]', el).addEventListener('click', onInfoClick);
    try { P.tab = localStorage.getItem('gia-pha.tab') || 'info'; } catch (e) { P.tab = 'info'; }
    S.on('change', (e) => { if (P.isOpen) fill(e && e.history); });
    S.on('files', () => { if (P.isOpen && person()) { $('#pn-files', el).dataset.for = ''; renderFiles(person()); } });
  }

  Object.assign(P, { init, open, close, refresh: () => P.isOpen && fill(false), attach, setTab, kindOf, download, docxToHTML, cleanHTML, flushNote: () => noteT && P.id && saveNoteNow(P.id) });
  GP.panel = P;
})(window.GP);
