/*
 * Lưu trữ: IndexedDB giữ cây (store "trees") và tệp đính kèm dạng Blob (store "files").
 * Mỗi lần đổi dữ liệu đi qua store.commit(nhãn, fn): chụp ảnh trước khi đổi để hoàn tác,
 * sửa trên bản sao, rồi lưu chậm 250ms. Trạng thái nhìn (thu gọn nhánh, camera, nhánh đang
 * soi) đi qua store.setView và không vào hoàn tác.
 *
 * Tệp không bị xoá ngay khi gỡ khỏi người: hoàn tác cần nó. Lúc khởi động, gc() dọn những
 * Blob không còn cây nào tham chiếu.
 */
(function (GP) {
  'use strict';
  const M = GP.model;
  const DB_NAME = 'gia-pha', DB_VER = 1, UNDO_MAX = 120;

  let db = null;
  const mem = { trees: new Map(), files: new Map(), meta: new Map() };
  const listeners = {};
  const urls = new Map();

  function idb(store, mode, fn) {
    if (!db) {
      const m = mem[store];
      return Promise.resolve(fn({
        get: (k) => m.get(k), put: (v, k) => m.set(k != null ? k : v.id, v), delete: (k) => m.delete(k),
        getAll: () => Array.from(m.values()), getAllKeys: () => Array.from(m.keys()),
      }, true));
    }
    return new Promise((res, rej) => {
      const tx = db.transaction(store, mode);
      const s = tx.objectStore(store);
      let out;
      const r = fn(s, false);
      if (r && 'onsuccess' in r) r.onsuccess = () => { out = r.result; };
      else out = r;
      tx.oncomplete = () => res(out);
      tx.onerror = tx.onabort = () => rej(tx.error || new Error('IndexedDB transaction aborted'));
    });
  }

  function open() {
    return new Promise((res) => {
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VER); } catch (e) { res(false); return; }
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('trees')) d.createObjectStore('trees', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('files')) d.createObjectStore('files', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
      };
      req.onsuccess = () => { db = req.result; res(true); };
      req.onerror = req.onblocked = () => res(false);
    });
  }

  const S = {
    doc: null,
    persistent: false,
    undoStack: [],
    redoStack: [],
    saving: false,

    on(ev, fn) { (listeners[ev] || (listeners[ev] = [])).push(fn); },
    emit(ev, data) { for (const fn of listeners[ev] || []) fn(data); },

    async boot() {
      this.persistent = await open();
      if (this.persistent && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      const list = await this.listTrees();
      let cur = await idb('meta', 'readonly', (s) => s.get('current'));
      if (!list.length) {
        const sample = M.sample();
        await this.putTree(sample);
        list.push(sample);
        cur = sample.id;
      }
      const pick = list.find((t) => t.id === cur) || list[0];
      this.doc = M.normalize(pick);
      await idb('meta', 'readwrite', (s) => s.put(this.doc.id, 'current'));
      this.gc().catch(() => {});
      return this.doc;
    },

    listTrees() { return idb('trees', 'readonly', (s) => s.getAll()).then((l) => (l || []).sort((a, b) => b.updated - a.updated)); },
    putTree(t) { return idb('trees', 'readwrite', (s) => s.put(JSON.parse(JSON.stringify(t)))); },

    async switchTo(id) {
      await this.flush();
      const raw = await idb('trees', 'readonly', (s) => s.get(id));
      if (!raw) return false;
      this.doc = M.normalize(raw);
      this.undoStack = []; this.redoStack = [];
      await idb('meta', 'readwrite', (s) => s.put(id, 'current'));
      this.emit('load', this.doc);
      return true;
    },

    async createTree(name, doc) {
      const t = doc || M.newDoc(name);
      await this.putTree(t);
      return this.switchTo(t.id);
    },

    async deleteTree(id) {
      await idb('trees', 'readwrite', (s) => s.delete(id));
      const list = await this.listTrees();
      if (!list.length) await this.createTree('Cây gia phả');
      else if (this.doc.id === id) await this.switchTo(list[0].id);
      this.gc().catch(() => {});
    },

    snap() { const d = this.doc; return JSON.stringify({ name: d.name, people: d.people, unions: d.unions, rootOrder: d.rootOrder }); },

    // merge: các lần đổi liên tiếp cùng khoá (gõ ghi chú, gõ tên) gộp chung một bước hoàn tác.
    // opts.pop: bên gọi tự render để thẻ mới có hiệu ứng mọc ra, nên bỏ qua render mặc định.
    commit(label, fn, merge, opts) {
      const last = this.undoStack[this.undoStack.length - 1];
      const now = Date.now();
      const before = this.snap();
      const draft = JSON.parse(JSON.stringify(this.doc));
      const out = fn(draft);
      // Phép đổi tự báo không làm gì (false): không có bước hoàn tác rỗng, không phát sự kiện.
      if (out === false) return false;
      if (!(merge && last && last.merge === merge && now - last.at < 4000)) {
        this.undoStack.push({ label, s: before, merge: merge || null, at: now });
        if (this.undoStack.length > UNDO_MAX) this.undoStack.shift();
      } else last.at = now;
      draft.updated = now;
      this.doc = draft;
      this.redoStack = [];
      this.cleanView();
      this.scheduleSave();
      this.emit('change', { label, merge, pop: !!(opts && opts.pop) });
      return out;
    },

    restore(from, to) {
      const e = from.pop();
      if (!e) return null;
      to.push({ label: e.label, s: this.snap(), merge: null, at: 0 });
      const d = Object.assign(JSON.parse(JSON.stringify(this.doc)), JSON.parse(e.s));
      d.updated = Date.now();
      this.doc = d;
      this.cleanView();
      this.scheduleSave();
      this.emit('change', { label: e.label, history: true });
      return e.label;
    },
    undo() { return this.restore(this.undoStack, this.redoStack); },
    redo() { return this.restore(this.redoStack, this.undoStack); },

    cleanView() {
      const v = this.doc.view;
      for (const k in v.collapsed) if (!this.doc.people[k]) delete v.collapsed[k];
      if (v.focus && !this.doc.people[v.focus]) v.focus = null;
    },

    setView(patch, silent) {
      Object.assign(this.doc.view, patch);
      this.scheduleSave();
      if (!silent) this.emit('view', patch);
    },

    scheduleSave() {
      clearTimeout(this.saveT);
      this.saving = true;
      this.emit('saving', true);
      this.saveT = setTimeout(() => this.flush(), 250);
    },

    async flush() {
      clearTimeout(this.saveT);
      if (!this.saving || !this.doc) return;
      try {
        await this.putTree(this.doc);
        this.saving = false;
        this.emit('saving', false);
      } catch (e) {
        this.emit('error', 'Không lưu được: ' + (e && e.message || e));
      }
    },

    // ---------- tệp ----------

    async putFile(blob, name) {
      const rec = { id: M.uid('f'), name: name || blob.name || 'tệp', type: blob.type || guessType(name || blob.name), size: blob.size, added: Date.now(), blob };
      await idb('files', 'readwrite', (s) => s.put(rec));
      return rec;
    },
    getFile(id) { return idb('files', 'readonly', (s) => s.get(id)); },
    async url(id) {
      if (urls.has(id)) return urls.get(id);
      const f = await this.getFile(id);
      if (!f) return null;
      const u = URL.createObjectURL(f.blob);
      urls.set(id, u);
      return u;
    },
    async renameFile(id, name) {
      const f = await this.getFile(id);
      if (!f) return;
      f.name = name;
      await idb('files', 'readwrite', (s) => s.put(f));
      this.emit('files', id);
    },

    async gc() {
      const trees = await this.listTrees();
      const keep = new Set();
      for (const t of trees) for (const f of M.fileRefs(M.normalize(t))) keep.add(f);
      if (this.doc) for (const f of M.fileRefs(this.doc)) keep.add(f);
      const keys = await idb('files', 'readonly', (s) => s.getAllKeys());
      const drop = (keys || []).filter((k) => !keep.has(k));
      if (drop.length) await idb('files', 'readwrite', (s) => { for (const k of drop) s.delete(k); });
      return drop.length;
    },

    // ---------- xuất / nhập ----------

    async exportDoc() {
      await this.flush();
      const files = {};
      for (const id of M.fileRefs(this.doc)) {
        const f = await this.getFile(id);
        if (!f) continue;
        files[id] = { name: f.name, type: f.type, added: f.added, data: await blobToB64(f.blob) };
      }
      return { format: 'gia-pha', version: 1, exported: new Date().toISOString(), tree: this.doc, files };
    },

    async importDoc(json) {
      if (!json || json.format !== 'gia-pha' || !json.tree) throw new Error('tệp không phải gia phả đã xuất');
      const map = {};
      for (const id in json.files || {}) {
        const f = json.files[id];
        const blob = b64ToBlob(f.data, f.type);
        const rec = await this.putFile(blob, f.name);
        map[id] = rec.id;
      }
      let text = JSON.stringify(json.tree);
      for (const old in map) text = text.split(old).join(map[old]);
      const doc = M.normalize(JSON.parse(text));
      doc.id = M.uid('t');
      doc.updated = Date.now();
      await this.createTree(null, doc);
      return doc;
    },
  };

  function guessType(name) {
    const ext = String(name || '').split('.').pop().toLowerCase();
    return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
      mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', webm: 'audio/webm', mp4: 'video/mp4', mov: 'video/quicktime',
      pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json',
      doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })[ext] || 'application/octet-stream';
  }

  function blobToB64(blob) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1] || '');
      r.onerror = () => rej(r.error);
      r.readAsDataURL(blob);
    });
  }
  function b64ToBlob(b64, type) {
    const bin = atob(b64 || '');
    const a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return new Blob([a], { type: type || 'application/octet-stream' });
  }

  S.guessType = guessType;
  GP.store = S;
})(window.GP);
