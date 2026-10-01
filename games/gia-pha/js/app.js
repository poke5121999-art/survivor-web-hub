/*
 * Vỏ ứng dụng: thanh trên, menu cây, tìm người, hộp thoại, thông báo, trình xem tệp,
 * hiệu ứng (lá rơi, pháo hoa nhỏ khi thêm người), phím tắt, và các luồng thêm/xoá.
 */
(function (GP) {
  'use strict';
  const M = GP.model, S = GP.store, V = GP.view;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const nameOf = (id) => (S.doc.people[id] && S.doc.people[id].name) || 'người này';
  const typing = () => { const a = document.activeElement; return a && (a.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(a.tagName)); };

  // ---------- thông báo, hộp thoại ----------

  const ui = {
    toast(o) {
      const box = $('#toasts');
      const t = document.createElement('div');
      t.className = 'toast' + (o.bad ? ' bad' : '');
      t.innerHTML = '<span>' + esc(o.text) + '</span>' + (o.undo ? '<button>Hoàn tác</button>' : '');
      if (o.undo) t.querySelector('button').onclick = () => { app.undo(); dismiss(); };
      box.appendChild(t);
      while (box.children.length > 3) box.firstChild.remove();
      const dismiss = () => { t.classList.add('out'); setTimeout(() => t.remove(), 300); };
      setTimeout(dismiss, o.undo ? 6000 : 3200);
    },

    modal(html, setup) {
      return new Promise((res) => {
        const wrap = document.createElement('div');
        wrap.className = 'modal-wrap';
        wrap.innerHTML = '<div class="modal" role="dialog">' + html + '</div>';
        document.body.appendChild(wrap);
        const done = (v) => { wrap.classList.add('out'); setTimeout(() => wrap.remove(), 220); document.removeEventListener('keydown', key, true); res(v); };
        const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } };
        document.addEventListener('keydown', key, true);
        wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) done(null); });
        setup(wrap.firstChild, done);
      });
    },

    prompt(title, label, value) {
      return ui.modal('<h3>' + esc(title) + '</h3><label class="fld"><span>' + esc(label) + '</span><input></label>' +
        '<div class="m-btns"><button class="btn ghost" data-v="0">Huỷ</button><button class="btn primary" data-v="1">Đồng ý</button></div>', (m, done) => {
        const inp = $('input', m);
        inp.value = value || '';
        setTimeout(() => { inp.focus(); inp.select(); }, 30);
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(inp.value.trim() || null); });
        m.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) done(b.dataset.v === '1' ? inp.value.trim() || null : null); });
      });
    },

    // choices: [{v, label, cls}]
    choose(title, body, choices) {
      return ui.modal('<h3>' + esc(title) + '</h3><div class="m-body">' + body + '</div><div class="m-btns">' +
        choices.map((c) => '<button class="btn ' + (c.cls || '') + '" data-v="' + c.v + '">' + esc(c.label) + '</button>').join('') + '</div>', (m, done) => {
        m.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) done(b.dataset.v); });
        setTimeout(() => { const b = m.querySelector('.btn.primary,.btn.danger'); b && b.focus(); }, 30);
      });
    },
  };

  // ---------- hiệu ứng ----------

  const fx = {
    on: true,
    leaves: [], sparks: [],
    init() {
      this.bg = $('#leaves'); this.fg = $('#sparks');
      try { this.on = localStorage.getItem('gia-pha.fx') !== '0'; } catch (e) { this.on = true; }
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) this.on = false;
      const size = () => { for (const c of [this.bg, this.fg]) { c.width = innerWidth * devicePixelRatio; c.height = innerHeight * devicePixelRatio; } };
      size(); addEventListener('resize', size);
      for (let i = 0; i < 16; i++) this.leaves.push(this.leaf(true));
      const loop = (t) => { this.frame(t); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    },
    leaf(anyY) {
      const kinds = [['#7fa36b', 0], ['#a9c46c', 0], ['#e8a0a8', 1], ['#f2c0c6', 1], ['#e6b84f', 0]];
      const k = kinds[Math.floor(Math.random() * kinds.length)];
      return { x: Math.random() * innerWidth, y: anyY ? Math.random() * innerHeight : -20, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.03,
        vy: 0.25 + Math.random() * 0.45, ph: Math.random() * 6.28, sz: 5 + Math.random() * 6, c: k[0], petal: k[1] };
    },
    burst(at) {
      if (!this.on || !at) return;
      const cols = ['#e3b04b', '#c0392b', '#f5d76e', '#e8a0a8', '#7fa36b'];
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * 6.28, v = 2 + Math.random() * 4;
        this.sparks.push({ x: at.x, y: at.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, life: 1, c: cols[i % cols.length], sz: 2 + Math.random() * 3, r: Math.random() * 6.28 });
      }
    },
    frame(t) {
      const d = devicePixelRatio;
      const g = this.bg.getContext('2d');
      g.setTransform(d, 0, 0, d, 0, 0);
      g.clearRect(0, 0, innerWidth, innerHeight);
      if (this.on && !document.hidden) {
        for (let i = 0; i < this.leaves.length; i++) {
          const L = this.leaves[i];
          L.y += L.vy; L.x += Math.sin(t / 1400 + L.ph) * 0.45; L.r += L.vr;
          if (L.y > innerHeight + 20) this.leaves[i] = this.leaf(false);
          g.save(); g.translate(L.x, L.y); g.rotate(L.r); g.globalAlpha = 0.42; g.fillStyle = L.c;
          g.beginPath();
          if (L.petal) { g.ellipse(0, 0, L.sz * 0.7, L.sz * 0.55, 0, 0, 6.28); }
          else { g.moveTo(-L.sz, 0); g.quadraticCurveTo(0, -L.sz * 0.7, L.sz, 0); g.quadraticCurveTo(0, L.sz * 0.7, -L.sz, 0); }
          g.fill(); g.restore();
        }
      }
      const f = this.fg.getContext('2d');
      f.setTransform(d, 0, 0, d, 0, 0);
      f.clearRect(0, 0, innerWidth, innerHeight);
      this.sparks = this.sparks.filter((s) => s.life > 0);
      for (const s of this.sparks) {
        s.x += s.vx; s.y += s.vy; s.vy += 0.12; s.vx *= 0.98; s.life -= 0.022; s.r += 0.2;
        f.save(); f.globalAlpha = Math.max(0, s.life); f.fillStyle = s.c; f.translate(s.x, s.y); f.rotate(s.r);
        f.fillRect(-s.sz, -s.sz / 2, s.sz * 2, s.sz); f.restore();
      }
    },
    toggle() {
      this.on = !this.on;
      try { localStorage.setItem('gia-pha.fx', this.on ? '1' : '0'); } catch (e) { /* riêng tư */ }
      return this.on;
    },
  };

  // ---------- trình xem tệp ----------

  const viewer = {
    list: [], i: 0,
    async open(list, fid) {
      this.list = list.slice(); this.i = Math.max(0, list.indexOf(fid));
      $('#viewer').classList.add('open');
      await this.show();
    },
    close() {
      $('#viewer').classList.remove('open');
      const b = $('#vw-body');
      for (const m of b.querySelectorAll('audio,video')) m.pause();
      setTimeout(() => { if (!$('#viewer').classList.contains('open')) b.innerHTML = ''; }, 250);
    },
    step(d) { if (this.list.length > 1) { this.i = (this.i + d + this.list.length) % this.list.length; this.show(d); } },
    async show(dir) {
      const rec = await S.getFile(this.list[this.i]);
      const body = $('#vw-body');
      if (!rec) { body.innerHTML = '<div class="vw-msg">Không tìm thấy tệp</div>'; return; }
      $('#vw-name').textContent = rec.name;
      $('#vw-count').textContent = this.list.length > 1 ? (this.i + 1) + ' / ' + this.list.length : '';
      $('#vw-prev').hidden = $('#vw-next').hidden = this.list.length < 2;
      const u = await S.url(rec.id);
      const k = GP.panel.kindOf(rec).k;
      body.className = 'vw-body k-' + k + (dir ? (dir > 0 ? ' from-r' : ' from-l') : '');
      void body.offsetWidth;
      body.classList.add('in');
      if (k === 'image') body.innerHTML = '<img src="' + u + '" alt="">';
      else if (k === 'video') body.innerHTML = '<video src="' + u + '" controls autoplay></video>';
      else if (k === 'audio') body.innerHTML = '<div class="vw-audio"><div class="disc"></div><audio src="' + u + '" controls autoplay></audio></div>';
      else if (k === 'pdf') body.innerHTML = '<iframe src="' + u + '" title="PDF"></iframe>';
      else if (k === 'text') body.innerHTML = '<pre class="paper"></pre>', $('pre', body).textContent = await rec.blob.text();
      else if (k === 'docx') {
        body.innerHTML = '<div class="vw-msg">Đang đọc tệp Word…</div>';
        try { const html = await GP.panel.docxToHTML(await rec.blob.arrayBuffer(), false); body.innerHTML = '<div class="paper docx">' + GP.panel.cleanHTML(html, true) + '</div>'; }
        catch (e) { body.innerHTML = '<div class="vw-msg">Không xem trước được: ' + esc(e.message) + '</div>'; }
      } else body.innerHTML = '<div class="vw-msg"><div class="big">📦</div>Loại tệp này không xem trước được trong trình duyệt.<br>Bấm ⤓ để tải về rồi mở bằng phần mềm trên máy.</div>';
      const audio = body.querySelector('audio');
      if (audio) { const disc = body.querySelector('.disc'); audio.onplay = () => disc.classList.add('spin'); audio.onpause = audio.onended = () => disc.classList.remove('spin'); }
    },
    init() {
      $('#vw-close').onclick = () => this.close();
      $('#vw-prev').onclick = () => this.step(-1);
      $('#vw-next').onclick = () => this.step(1);
      $('#vw-dl').onclick = async () => { const r = await S.getFile(this.list[this.i]); if (r) GP.panel.download(r); };
      $('#viewer').addEventListener('pointerdown', (e) => { if (e.target.id === 'viewer') this.close(); });
      $('#vw-body').addEventListener('click', (e) => { if (e.target.tagName === 'IMG') e.target.classList.toggle('zoom'); });
    },
  };

  // ---------- popover thêm người ----------

  function addFlow(kind, pid, anchorEl) {
    const doc = S.doc;
    const p = doc.people[pid];
    if (!p) return;
    closePop();
    const x = M.ix(doc);
    const titles = { child: 'Thêm con của ' + nameOf(pid), spouse: 'Thêm vợ/chồng cho ' + nameOf(pid), parent: 'Thêm cha/mẹ của ' + nameOf(pid) };
    const defG = kind === 'spouse' ? (p.gender === 'm' ? 'f' : 'm') : 'm';
    const unions = kind === 'child' && !M.isSpouse(doc, pid, x) ? (x.unionsOf[pid] || []).filter((u) => u.b) : [];
    const pop = document.createElement('div');
    pop.className = 'pop no-pan';
    pop.innerHTML = '<div class="pop-t">' + esc(titles[kind]) + '</div>' +
      '<div class="seg sm"><button data-g="m">' + (kind === 'child' ? 'Con trai' : kind === 'parent' ? 'Cha' : 'Chồng') + '</button><button data-g="f">' + (kind === 'child' ? 'Con gái' : kind === 'parent' ? 'Mẹ' : 'Vợ') + '</button></div>' +
      (unions.length > 1 ? '<label class="fld sm"><span>Con với</span><select id="pop-u">' + unions.map((u) => '<option value="' + u.id + '">' + esc(nameOf(u.b)) + '</option>').join('') + '</select></label>' : '') +
      '<input id="pop-name" placeholder="Họ và tên" autocomplete="off">' +
      '<input id="pop-born" placeholder="Năm sinh (không bắt buộc)" inputmode="numeric" autocomplete="off">' +
      '<div class="pop-b">' + (kind === 'child' ? '<button class="btn ghost" data-more="1" title="Shift+Enter">Thêm rồi thêm nữa</button>' : '') + '<button class="btn primary" data-more="0">Thêm</button></div>' +
      '<div class="pop-k">Enter: thêm · Esc: đóng</div>';
    document.body.appendChild(pop);
    let g = defG;
    const segs = $$('.seg button', pop);
    const setG = (v) => { g = v; segs.forEach((b) => b.classList.toggle('on', b.dataset.g === v)); };
    setG(defG);
    segs.forEach((b) => (b.onclick = () => { setG(b.dataset.g); $('#pop-name', pop).focus(); }));
    const r = (anchorEl && anchorEl.getBoundingClientRect && anchorEl.getBoundingClientRect()) || { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0, bottom: innerHeight / 2 };
    const pw = 270, ph = pop.offsetHeight;
    let left = r.left + r.width / 2 - pw / 2, top = r.bottom + 10;
    if (top + ph > innerHeight - 10) top = r.top - ph - 10;
    left = Math.max(10, Math.min(innerWidth - pw - 10, left)); top = Math.max(10, Math.min(innerHeight - ph - 10, top));
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
    const nameI = $('#pop-name', pop);
    setTimeout(() => nameI.focus(), 30);
    const submit = (more) => {
      const name = nameI.value.trim();
      if (!name) { nameI.classList.add('shake'); setTimeout(() => nameI.classList.remove('shake'), 400); nameI.focus(); return; }
      const f = { name, gender: g, born: $('#pop-born', pop).value.trim() };
      const uSel = $('#pop-u', pop);
      const label = { child: 'Thêm con ' + name, spouse: 'Thêm vợ/chồng ' + name, parent: 'Thêm cha/mẹ ' + name }[kind];
      const np = S.commit(label, (t) => {
        const out = kind === 'child' ? M.addChild(t, pid, f, uSel && uSel.value) : kind === 'spouse' ? M.addSpouse(t, pid, f) : M.addParent(t, pid, f);
        if (kind === 'child') delete t.view.collapsed[M.anchorOf(t, pid)];
        return out;
      }, null, { pop: true });
      if (!np) return;
      V.render({ pop: np.id });
      if (more) { nameI.value = ''; $('#pop-born', pop).value = ''; nameI.focus(); setG(g); }
      else { closePop(); setTimeout(() => { V.select(np.id, 'added'); V.centerOn(np.id, { ifHidden: true }); }, 60); }
    };
    pop.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submit(e.shiftKey && kind === 'child'); }
      if (e.key === 'Escape') { e.stopPropagation(); closePop(); }
    });
    $$('[data-more]', pop).forEach((b) => (b.onclick = () => submit(b.dataset.more === '1')));
    requestAnimationFrame(() => pop.classList.add('in'));
    app.pop = pop;
  }
  function closePop() {
    const p = app.pop;
    if (!p) return;
    app.pop = null;
    p.classList.remove('in'); p.classList.add('out');
    setTimeout(() => p.remove(), 180);
  }

  // ---------- xoá ----------

  async function removeFlow(id) {
    const doc = S.doc, p = doc.people[id];
    if (!p) return;
    const x = M.ix(doc);
    const spouse = M.isSpouse(doc, id, x);
    const desc = spouse ? [] : M.descendants(doc, id, x);
    const sps = spouse ? [] : M.spousesOf(doc, id, x);
    let mode = 'branch';
    const branch = [id, ...desc].reduce((n, d) => n + 1 + M.spousesOf(doc, d, x).length, 0);
    if (desc.length) {
      const v = await ui.choose('Xoá ' + nameOf(id) + '?', '<p>' + esc(nameOf(id)) + ' có <b>' + desc.length + '</b> con cháu.</p>' +
        '<p class="muted">Giữ con cháu: con sẽ ở lại với ' + (sps.length ? 'vợ/chồng (' + sps.map((s) => esc(nameOf(s))).join(', ') + ')' : 'nhau, mỗi người thành gốc một nhánh') + '.</p>',
        [{ v: 'cancel', label: 'Huỷ', cls: 'ghost' }, { v: 'keep', label: 'Chỉ xoá người này' }, { v: 'branch', label: 'Xoá cả nhánh (' + branch + ' người)', cls: 'danger' }]);
      if (!v || v === 'cancel') return;
      mode = v;
    } else {
      const extra = sps.length ? '<p class="muted">Vợ/chồng (' + sps.map((s) => esc(nameOf(s))).join(', ') + ') cũng bị xoá theo.</p>' : '';
      const v = await ui.choose('Xoá ' + nameOf(id) + '?', '<p>Có thể hoàn tác ngay sau khi xoá.</p>' + extra, [{ v: 'cancel', label: 'Huỷ', cls: 'ghost' }, { v: 'ok', label: 'Xoá', cls: 'danger' }]);
      if (v !== 'ok') return;
    }
    const name = nameOf(id);
    if (V.sel === id) GP.panel.close();
    const gone = S.commit('Xoá ' + name, (t) => M.removePerson(t, id, mode));
    ui.toast({ text: 'Đã xoá ' + (gone.length > 1 ? gone.length + ' người' : name), undo: true });
  }

  // ---------- hiện người: mở các nhánh đang thu, thoát chế độ soi nhánh nếu cần ----------

  function reveal(id) {
    const doc = S.doc;
    if (!doc.people[id]) return;
    const anc = M.ancestors(doc, id);
    const anchor = M.anchorOf(doc, id);
    const col = Object.assign({}, doc.view.collapsed);
    let changed = false;
    for (const a of anc) if (col[a]) { delete col[a]; changed = true; }
    let focus = doc.view.focus;
    if (focus && !(anchor === M.anchorOf(doc, focus) || anc.includes(M.anchorOf(doc, focus)))) { focus = null; changed = true; }
    if (changed) { S.setView({ collapsed: col, focus }, true); V.render(); }
    setTimeout(() => { V.select(id, 'reveal'); V.centerOn(id); V.pulse(id); }, changed ? 300 : 0);
  }

  function focusBranch(id) {
    S.setView({ focus: id }, true);
    V.render({ dur: 620 });
    renderCrumbs();
    GP.panel.refresh();
    setTimeout(() => V.fit(), 80);
    if (id) ui.toast({ text: 'Đang xem riêng nhánh ' + nameOf(id) });
  }

  function renderCrumbs() {
    const box = $('#crumbs');
    const f = S.doc.view.focus;
    if (!f || !S.doc.people[f]) { box.classList.remove('show'); return; }
    const chain = M.ancestors(S.doc, f).concat([M.anchorOf(S.doc, f)]);
    box.innerHTML = '<span class="cr-l">Nhánh:</span>' + chain.map((id) => '<button data-f="' + id + '">' + esc(nameOf(id)) + '</button>').join('<span class="cr-s">›</span>') +
      '<button class="cr-x" data-f="">✕ Xem cả cây</button>';
    box.classList.add('show');
  }

  // ---------- thu/mở theo đời ----------

  function collapseToGen(n) {
    const doc = S.doc, col = {};
    if (n) {
      const x = M.ix(doc);
      for (const id in doc.people) {
        if (M.isSpouse(doc, id, x) || !M.kidsOf(doc, id, x).length) continue;
        if (M.generation(doc, id, x) >= n) col[id] = true;
      }
    }
    S.setView({ collapsed: col }, true);
    V.render({ dur: 640 });
    setTimeout(() => V.fit(), 120);
  }

  // ---------- tìm ----------

  function initSearch() {
    const inp = $('#search'), list = $('#search-res');
    let hits = [], cur = 0;
    const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
    const show = () => {
      const q = norm(inp.value.trim());
      if (!q) { list.classList.remove('show'); return; }
      const doc = S.doc;
      hits = Object.values(doc.people).filter((p) => norm(p.name + ' ' + p.born + ' ' + p.place).includes(q)).slice(0, 12);
      cur = 0;
      list.innerHTML = hits.length ? hits.map((p, i) => {
        const par = M.parentsOf(doc, p.id).map(nameOf);
        return '<button class="sr' + (i === 0 ? ' on' : '') + '" data-id="' + p.id + '"><span class="dot ' + (p.gender === 'f' ? 'f' : 'm') + '"></span><span><b>' + esc(p.name || 'Chưa đặt tên') + '</b>' +
          '<small>Đời ' + M.generation(doc, p.id) + (p.born ? ' · ' + esc(p.born) : '') + (par.length ? ' · con ' + esc(par.join(' & ')) : '') + '</small></span></button>';
      }).join('') : '<div class="sr-none">Không thấy ai tên như vậy</div>';
      list.classList.add('show');
    };
    const go = (id) => { list.classList.remove('show'); inp.value = ''; inp.blur(); reveal(id); };
    inp.addEventListener('input', show);
    inp.addEventListener('focus', show);
    inp.addEventListener('blur', () => setTimeout(() => list.classList.remove('show'), 150));
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        cur = (cur + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % Math.max(1, hits.length);
        $$('.sr', list).forEach((b, i) => b.classList.toggle('on', i === cur));
      }
      if (e.key === 'Enter' && hits[cur]) go(hits[cur].id);
      if (e.key === 'Escape') { inp.value = ''; inp.blur(); }
    });
    list.addEventListener('pointerdown', (e) => { const b = e.target.closest('.sr'); if (b) { e.preventDefault(); go(b.dataset.id); } });
  }

  // ---------- menu ----------

  function menu(anchor, items) {
    closeMenu();
    const m = document.createElement('div');
    m.className = 'menu no-pan';
    m.innerHTML = items.map((it, i) => it === '-' ? '<hr>' : it.head ? '<div class="mh">' + esc(it.head) + '</div>' :
      '<button data-i="' + i + '" class="' + (it.cls || '') + (it.on ? ' on' : '') + '">' + (it.icon ? '<span class="mi">' + it.icon + '</span>' : '') + '<span>' + esc(it.label) + '</span>' + (it.sub ? '<small>' + esc(it.sub) + '</small>' : '') + '</button>').join('');
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.left)) + 'px';
    m.style.top = (r.bottom + 6) + 'px';
    m.style.maxHeight = (innerHeight - r.bottom - 20) + 'px';
    m.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) { closeMenu(); items[+b.dataset.i].run(); } });
    requestAnimationFrame(() => m.classList.add('in'));
    app.menuEl = m;
    setTimeout(() => document.addEventListener('pointerdown', app.menuAway = (e) => { if (!m.contains(e.target)) closeMenu(); }), 0);
  }
  function closeMenu() {
    if (!app.menuEl) return;
    app.menuEl.remove(); app.menuEl = null;
    document.removeEventListener('pointerdown', app.menuAway);
  }

  async function treeMenu(btn) {
    const list = await S.listTrees();
    menu(btn, [
      { head: 'Các cây gia phả' },
      ...list.map((t) => ({ icon: t.id === S.doc.id ? '●' : '○', label: t.name, sub: Object.keys(t.people || {}).length + ' người', on: t.id === S.doc.id, run: () => switchTree(t.id) })),
      '-',
      { icon: '✎', label: 'Đổi tên cây này', run: renameTree },
      { icon: '＋', label: 'Tạo cây mới', run: newTree },
      { icon: '❀', label: 'Mở thêm cây mẫu', run: async () => { await S.flush(); await S.createTree(null, M.sample()); } },
      '-',
      { icon: '⤓', label: 'Xuất ra tệp (.json, kèm tài liệu)', run: exportTree },
      { icon: '⇪', label: 'Nhập từ tệp đã xuất', run: () => $('#import-file').click() },
      { icon: '⎙', label: 'In cây', run: () => { V.fit(0); setTimeout(() => print(), 120); } },
      '-',
      { icon: '🗑', label: 'Xoá cây này', cls: 'danger', run: deleteTree },
    ]);
  }

  function viewMenu(btn) {
    const maxGen = (() => { const x = M.ix(S.doc); let m = 0; for (const id in S.doc.people) m = Math.max(m, M.generation(S.doc, id, x)); return m; })();
    const gens = [];
    for (let g = 1; g < Math.min(maxGen, 9); g++) gens.push({ icon: '≡', label: 'Hiện tới đời ' + g, run: () => collapseToGen(g + 1) });
    menu(btn, [
      { head: 'Hiển thị' },
      { icon: '⤢', label: 'Mở hết các nhánh', run: () => collapseToGen(0) },
      ...gens,
      '-',
      { icon: '⌖', label: 'Vừa khung (F)', run: () => V.fit() },
      { icon: '❀', label: 'Lá rơi: ' + (fx.on ? 'đang bật' : 'đang tắt'), run: () => ui.toast({ text: fx.toggle() ? 'Đã bật lá rơi' : 'Đã tắt lá rơi' }) },
    ]);
  }

  async function switchTree(id) {
    if (id === S.doc.id) return;
    GP.panel.close();
    await S.switchTo(id);
  }
  async function renameTree() {
    const n = await ui.prompt('Đổi tên cây', 'Tên dòng họ / cây', S.doc.name);
    if (n) S.commit('Đổi tên cây', (t) => { t.name = n; });
  }
  async function newTree() {
    const n = await ui.prompt('Tạo cây gia phả mới', 'Tên dòng họ', 'Họ ');
    if (!n) return;
    GP.panel.close();
    await S.flush();
    await S.createTree(n);
  }
  async function deleteTree() {
    const v = await ui.choose('Xoá cả cây "' + S.doc.name + '"?', '<p>Toàn bộ ' + Object.keys(S.doc.people).length + ' người, ghi chú và tài liệu của cây này sẽ mất hẳn, <b>không hoàn tác được</b>.</p><p class="muted">Nên xuất ra tệp trước để giữ một bản.</p>',
      [{ v: 'no', label: 'Huỷ', cls: 'ghost' }, { v: 'export', label: 'Xuất tệp trước' }, { v: 'yes', label: 'Xoá hẳn', cls: 'danger' }]);
    if (v === 'export') { await exportTree(); return; }
    if (v !== 'yes') return;
    GP.panel.close();
    await S.deleteTree(S.doc.id);
    ui.toast({ text: 'Đã xoá cây' });
  }
  async function exportTree() {
    ui.toast({ text: 'Đang đóng gói…' });
    const data = await S.exportDoc();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'gia-pha-' + S.doc.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/[^\w]+/g, '-').toLowerCase() + '-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    ui.toast({ text: 'Đã xuất ' + Object.keys(data.files).length + ' tài liệu kèm cây' });
  }

  // ---------- trạng thái thanh trên ----------

  function renderTop() {
    const doc = S.doc;
    $('#tree-name').textContent = doc.name;
    document.title = doc.name + ' · Cây Gia Phả';
    const n = Object.keys(doc.people).length;
    const x = M.ix(doc);
    let g = 0;
    for (const id in doc.people) g = Math.max(g, M.generation(doc, id, x));
    $('#stats').textContent = n + ' người · ' + g + ' đời';
    $('#undo').disabled = !S.undoStack.length;
    $('#redo').disabled = !S.redoStack.length;
    $('#undo').title = S.undoStack.length ? 'Hoàn tác: ' + S.undoStack[S.undoStack.length - 1].label + ' (Ctrl+Z)' : 'Hoàn tác (Ctrl+Z)';
    $('#redo').title = S.redoStack.length ? 'Làm lại: ' + S.redoStack[S.redoStack.length - 1].label + ' (Ctrl+Y)' : 'Làm lại (Ctrl+Y)';
    $('#empty').classList.toggle('show', n === 0);
    renderCrumbs();
  }

  // ---------- điều hướng bằng phím mũi tên ----------

  function nav(key) {
    const L = V.L;
    if (!L || !L.cards.length) return;
    const cur = L.cards.find((c) => c.id === V.sel);
    if (!cur) { const r = L.cards[0]; V.select(r.id, 'key'); V.centerOn(r.id, { ifHidden: true }); return; }
    const cx = cur.x, cy = cur.y;
    let best = null, bd = Infinity;
    for (const c of L.cards) {
      if (c.id === cur.id) continue;
      const dx = c.x - cx, dy = c.y - cy;
      const ok = key === 'ArrowLeft' ? dx < 0 && Math.abs(dy) < 5 : key === 'ArrowRight' ? dx > 0 && Math.abs(dy) < 5 : key === 'ArrowUp' ? dy < 0 : dy > 0;
      if (!ok) continue;
      const d = Math.abs(dx) + Math.abs(dy) * 2;
      if (d < bd) { bd = d; best = c; }
    }
    if (best) { V.select(best.id, 'key'); V.centerOn(best.id, { ifHidden: true, dur: 260 }); }
  }

  function onKey(e) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z' && !typing()) { e.preventDefault(); e.shiftKey ? app.redo() : app.undo(); return; }
    if (mod && e.key.toLowerCase() === 'y' && !typing()) { e.preventDefault(); app.redo(); return; }
    if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); $('#search').focus(); return; }
    if (e.key === 'Escape') {
      if ($('#viewer').classList.contains('open')) { viewer.close(); return; }
      if (app.pop) { closePop(); return; }
      if ($('#help').classList.contains('open')) { $('#help').classList.remove('open'); return; }
      if (document.querySelector('[data-pane="note"].full')) { $('[data-cmd="full"]').click(); return; }
      if (typing()) { document.activeElement.blur(); return; }
      if (GP.panel.isOpen) GP.panel.close();
      return;
    }
    if ($('#viewer').classList.contains('open')) { if (e.key === 'ArrowLeft') viewer.step(-1); if (e.key === 'ArrowRight') viewer.step(1); return; }
    if (typing() || mod || app.pop) return;
    const sel = V.sel;
    if (e.key === '/') { e.preventDefault(); $('#search').focus(); }
    else if (e.key === 'f' || e.key === 'F') V.fit();
    else if (e.key === '?') $('#help').classList.add('open');
    else if (e.key === '+' || e.key === '=') V.zoomBy(1.2);
    else if (e.key === '-') V.zoomBy(1 / 1.2);
    else if (/^Arrow/.test(e.key)) { e.preventDefault(); nav(e.key); }
    else if (!sel) return;
    else if (e.key === 'Delete' || e.key === 'Backspace') removeFlow(sel);
    else if (e.key === 'Enter') { GP.panel.open(sel, 'info'); setTimeout(() => $('#pn-name').focus(), 50); }
    else if (e.key === 'c' || e.key === 'C') addFlow('child', sel, V.els[sel]);
    else if ((e.key === 'v' || e.key === 'V') && !M.isSpouse(S.doc, sel)) addFlow('spouse', sel, V.els[sel]);
    else if (e.key === ' ') { e.preventDefault(); toggle(sel); }
  }

  function toggle(id) {
    const a = M.anchorOf(S.doc, id);
    if (!M.kidsOf(S.doc, a).length) return;
    const col = Object.assign({}, S.doc.view.collapsed);
    if (col[a]) delete col[a]; else col[a] = true;
    S.setView({ collapsed: col }, true);
    V.render({ dur: 560 });
  }

  // ---------- khởi động ----------

  const app = {
    pop: null, menuEl: null,
    undo() { const l = S.undo(); if (l) ui.toast({ text: 'Đã hoàn tác: ' + l }); },
    redo() { const l = S.redo(); if (l) ui.toast({ text: 'Đã làm lại: ' + l }); },
    reveal, focusBranch, addFlow, removeFlow,

    async boot() {
      V.init();
      GP.panel.init();
      viewer.init();
      fx.init();
      initSearch();
      await S.boot();
      if (!S.persistent) $('#warn').classList.add('show');

      S.on('change', (e) => { if (!(e && e.pop)) V.render(); renderTop(); });
      S.on('load', () => { V.reset(); renderTop(); V.render({ instant: true }); camFromDoc(); });
      S.on('saving', (on) => { const s = $('#saved'); s.classList.toggle('busy', on); s.title = on ? 'Đang lưu…' : 'Đã lưu vào trình duyệt'; });
      S.on('error', (m) => ui.toast({ text: m, bad: true }));
      S.on('toast', (o) => ui.toast(o));
      S.on('select', (e) => {
        closePop();
        if (e.id && e.why !== 'key') GP.panel.open(e.id);
        else if (e.id && GP.panel.isOpen) GP.panel.open(e.id);
        else if (!e.id && e.why === 'background' && GP.panel.isOpen) GP.panel.close();
      });
      S.on('card-action', (e) => {
        if (e.act === 'toggle') toggle(e.id);
        else if (e.act === 'edit') { V.select(e.id, 'dbl'); GP.panel.open(e.id, 'info'); setTimeout(() => $('#pn-name').select(), 60); }
        else addFlow(e.act.replace('add-', ''), e.id, e.el);
      });
      S.on('drop-files', (e) => GP.panel.attach(e.id, e.files));

      $('#undo').onclick = () => app.undo();
      $('#redo').onclick = () => app.redo();
      $('#tree-btn').onclick = (e) => treeMenu(e.currentTarget);
      $('#view-btn').onclick = (e) => viewMenu(e.currentTarget);
      $('#zin').onclick = () => V.zoomBy(1.25);
      $('#zout').onclick = () => V.zoomBy(1 / 1.25);
      $('#zfit').onclick = () => V.fit();
      $('#help-btn').onclick = () => $('#help').classList.add('open');
      $('#help').addEventListener('click', (e) => { if (e.target.id === 'help' || e.target.closest('.help-x')) $('#help').classList.remove('open'); });
      $('#crumbs').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) focusBranch(b.dataset.f || null); });
      $('#import-file').onchange = async (e) => {
        const f = e.target.files[0]; e.target.value = '';
        if (!f) return;
        try { GP.panel.close(); const d = await S.importDoc(JSON.parse(await f.text())); ui.toast({ text: 'Đã nhập cây ' + d.name }); }
        catch (err) { ui.toast({ text: 'Không nhập được: ' + err.message, bad: true }); }
      };
      $('#empty-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = $('#empty-name').value.trim();
        if (!name) return;
        const g = $('#empty-form .seg .on').dataset.g;
        const p = S.commit('Thêm ' + name, (t) => M.addRoot(t, { name, gender: g }), null);
        $('#empty-name').value = '';
        setTimeout(() => { V.fit(0); V.select(p.id, 'added'); const pp = V.pos[p.id]; if (pp) fx.burst(V.toScreen(pp.x + GP.CARD.w / 2, pp.y + GP.CARD.h / 2)); }, 50);
      });
      $$('#empty-form .seg button').forEach((b) => (b.onclick = (ev) => { ev.preventDefault(); $$('#empty-form .seg button').forEach((x) => x.classList.toggle('on', x === b)); }));
      addEventListener('keydown', onKey);
      addEventListener('beforeunload', () => { GP.panel.flushNote(); S.flush(); });
      document.addEventListener('visibilitychange', () => { if (document.hidden) { GP.panel.flushNote(); S.flush(); } });
      addEventListener('dragover', (e) => e.preventDefault());
      addEventListener('drop', (e) => e.preventDefault());

      renderTop();
      V.render({ instant: true });
      camFromDoc();
      try { if (!localStorage.getItem('gia-pha.seen')) { localStorage.setItem('gia-pha.seen', '1'); setTimeout(() => $('#help').classList.add('open'), 700); } } catch (e) { /* riêng tư */ }
      document.body.classList.add('ready');
    },
  };

  function camFromDoc() {
    const c = S.doc.view.cam;
    if (c) { V.cam = Object.assign({}, c); V.applyCam(); } else V.fit(0, true);
  }

  GP.ui = ui; GP.fx = fx; GP.viewer = viewer; GP.app = app;
  addEventListener('DOMContentLoaded', () => app.boot().catch((e) => { console.error(e); document.body.insertAdjacentHTML('beforeend', '<div class="fatal">Không khởi động được: ' + esc(e.message) + '</div>'); }));
})(window.GP);
