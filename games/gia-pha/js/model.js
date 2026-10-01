/*
 * Mô hình gia phả. Thuần dữ liệu, không đụng DOM, chạy được trong node để kiểm.
 *
 *   doc     = { id, name, created, updated, people, unions, rootOrder, view }
 *   Person  = { id, name, gender:'m'|'f', born, died, place, note(html), photo(fileId|null),
 *               files:[fileId], parentUnion(unionId|null) }
 *   Union   = { id, a(personId, người trong dòng), b(personId|null, vợ/chồng), children:[personId] }
 *   view    = { collapsed:{id:true}, focus:id|null, cam:{x,y,k}|null }  (không vào hoàn tác)
 *
 * Gia phả đi theo dòng: người trong dòng (blood) là con của một Union; vợ/chồng chỉ có mặt
 * qua đúng một Union với tư cách `b`, không có cha mẹ trong cây. Mọi phép đổi giữ bất biến ấy.
 */
(function (GP) {
  'use strict';

  let seq = 0;
  const uid = (p) => p + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 6);

  function blankPerson() {
    return { name: '', gender: 'm', born: '', died: '', place: '', note: '', photo: null, files: [], parentUnion: null };
  }

  function newDoc(name) {
    const t = Date.now();
    return { v: 1, id: uid('t'), name: name || 'Cây gia phả', created: t, updated: t,
      people: {}, unions: {}, rootOrder: [], view: { collapsed: {}, focus: null, cam: null } };
  }

  function ix(t) {
    const x = { unionsOf: {}, spouseUnion: {} };
    for (const id in t.unions) {
      const u = t.unions[id];
      (x.unionsOf[u.a] || (x.unionsOf[u.a] = [])).push(u);
      if (u.b) x.spouseUnion[u.b] = u;
    }
    return x;
  }

  const isSpouse = (t, id, x = ix(t)) => !!x.spouseUnion[id];
  const anchorOf = (t, id, x = ix(t)) => (x.spouseUnion[id] ? x.spouseUnion[id].a : id);

  function kidsOf(t, id, x = ix(t)) {
    if (x.spouseUnion[id]) return x.spouseUnion[id].children.slice();
    const out = [];
    for (const u of x.unionsOf[id] || []) out.push(...u.children);
    return out;
  }

  function spousesOf(t, id, x = ix(t)) {
    if (x.spouseUnion[id]) return [x.spouseUnion[id].a];
    return (x.unionsOf[id] || []).map((u) => u.b).filter(Boolean);
  }

  function parentsOf(t, id) {
    const p = t.people[id];
    const u = p && p.parentUnion && t.unions[p.parentUnion];
    return u ? [u.a, u.b].filter(Boolean) : [];
  }

  function descendants(t, id, x = ix(t)) {
    const out = [];
    const walk = (pid) => { for (const c of kidsOf(t, pid, x)) { out.push(c); walk(c); } };
    walk(anchorOf(t, id, x));
    return out;
  }

  function ancestors(t, id, x = ix(t)) {
    const chain = [];
    let cur = anchorOf(t, id, x);
    const seen = new Set([cur]);
    for (;;) {
      const u = t.people[cur] && t.unions[t.people[cur].parentUnion];
      if (!u || seen.has(u.a)) break;
      chain.unshift(u.a); seen.add(u.a); cur = u.a;
    }
    return chain;
  }

  const generation = (t, id, x = ix(t)) => ancestors(t, id, x).length + 1;

  function roots(t, x = ix(t)) {
    const isRoot = (id) => t.people[id] && !t.people[id].parentUnion && !x.spouseUnion[id];
    const out = t.rootOrder.filter(isRoot);
    for (const id in t.people) if (isRoot(id) && !out.includes(id)) out.push(id);
    return out;
  }

  function siblingsList(t, id) {
    const p = t.people[id];
    if (!p) return null;
    if (p.parentUnion && t.unions[p.parentUnion]) return t.unions[p.parentUnion].children;
    return null;
  }

  // ---------- phép đổi: tất cả sửa thẳng trên bản nháp `t` ----------

  function addPerson(t, f) {
    const p = Object.assign(blankPerson(), f || {}, { id: uid('p') });
    p.files = (f && f.files) ? f.files.slice() : [];
    t.people[p.id] = p;
    return p;
  }

  function newUnion(t, a, b) {
    const u = { id: uid('u'), a, b: b || null, children: [] };
    t.unions[u.id] = u;
    return u;
  }

  function addRoot(t, f) {
    const p = addPerson(t, f);
    t.rootOrder.push(p.id);
    return p;
  }

  function addChild(t, pid, f, unionId) {
    const x = ix(t);
    const u = x.spouseUnion[pid] || (unionId && t.unions[unionId]) || (x.unionsOf[pid] || [])[0] || newUnion(t, pid, null);
    const c = addPerson(t, f);
    c.parentUnion = u.id;
    u.children.push(c.id);
    return c;
  }

  function addSpouse(t, pid, f) {
    const x = ix(t);
    if (x.spouseUnion[pid]) return null;
    const s = addPerson(t, f);
    const free = (x.unionsOf[pid] || []).find((u) => !u.b);
    if (free) free.b = s.id; else newUnion(t, pid, s.id);
    return s;
  }

  function addParent(t, pid, f) {
    const p = t.people[pid];
    if (!p || p.parentUnion || isSpouse(t, pid)) return null;
    const q = addPerson(t, f);
    const u = newUnion(t, q.id, null);
    u.children.push(pid);
    p.parentUnion = u.id;
    const i = t.rootOrder.indexOf(pid);
    if (i >= 0) t.rootOrder[i] = q.id; else t.rootOrder.push(q.id);
    return q;
  }

  function detach(t, pid) {
    const p = t.people[pid];
    const u = p.parentUnion && t.unions[p.parentUnion];
    if (u) {
      u.children = u.children.filter((c) => c !== pid);
      if (!u.children.length && !u.b) delete t.unions[u.id];
    }
    p.parentUnion = null;
    t.rootOrder = t.rootOrder.filter((r) => r !== pid);
  }

  // mode 'branch': xoá cả con cháu. mode 'keep': con cháu ở lại, theo vợ/chồng còn lại hoặc thành gốc riêng.
  function removePerson(t, pid, mode) {
    const x = ix(t);
    const p = t.people[pid];
    if (!p) return [];
    const su = x.spouseUnion[pid];
    if (su) {
      su.b = null;
      if (!su.children.length) delete t.unions[su.id];
      delete t.people[pid];
      return [pid];
    }
    const gone = [];
    if (mode === 'branch') {
      const all = [pid, ...descendants(t, pid, x)];
      for (const id of all) {
        for (const u of x.unionsOf[id] || []) { if (u.b) gone.push(u.b); delete t.unions[u.id]; }
        gone.push(id);
      }
      detach(t, pid);
      for (const id of gone) delete t.people[id];
      t.rootOrder = t.rootOrder.filter((r) => t.people[r]);
      return gone;
    }
    const wasRoot = t.rootOrder.indexOf(pid);
    const newRoots = [];
    for (const u of x.unionsOf[pid] || []) {
      if (u.b) { u.a = u.b; u.b = null; newRoots.push(u.a); if (!u.children.length) delete t.unions[u.id]; }
      else { for (const c of u.children) { t.people[c].parentUnion = null; newRoots.push(c); } delete t.unions[u.id]; }
    }
    detach(t, pid);
    delete t.people[pid];
    t.rootOrder.splice(wasRoot >= 0 ? wasRoot : t.rootOrder.length, 0, ...newRoots);
    return [pid];
  }

  // Lý do không chuyển được, hoặc null nếu được.
  function moveBlocker(t, pid, tid) {
    const x = ix(t);
    if (!t.people[pid] || !t.people[tid]) return 'không thấy người';
    if (x.spouseUnion[pid]) return 'vợ/chồng đi cùng người trong dòng';
    if (pid === tid || anchorOf(t, tid, x) === pid) return 'không thể làm con chính mình';
    if (descendants(t, pid, x).includes(anchorOf(t, tid, x))) return 'đó là con cháu của người này';
    return null;
  }

  function moveUnder(t, pid, tid) {
    if (moveBlocker(t, pid, tid)) return false;
    const x = ix(t);
    const u = x.spouseUnion[tid] || (x.unionsOf[tid] || [])[0] || null;
    if (u && u.children.includes(pid)) return false;
    detach(t, pid);
    const target = (u && t.unions[u.id]) || newUnion(t, tid, null);
    target.children.push(pid);
    t.people[pid].parentUnion = target.id;
    return true;
  }

  // Đặt pid ngay trước (after=false) hoặc sau ref, cùng một hàng anh chị em hoặc cùng hàng gốc.
  function reorder(t, pid, ref, after) {
    const sib = siblingsList(t, pid);
    const list = sib || roots(t);
    if (!list.includes(ref) || pid === ref) return false;
    const rest = list.filter((id) => id !== pid);
    rest.splice(rest.indexOf(ref) + (after ? 1 : 0), 0, pid);
    if (sib) t.unions[t.people[pid].parentUnion].children = rest; else t.rootOrder = rest;
    return true;
  }

  function update(t, pid, patch) {
    if (t.people[pid]) Object.assign(t.people[pid], patch);
  }

  // ---------- ranh giới: dữ liệu từ IndexedDB hay tệp nhập vào đều qua đây ----------

  function normalize(raw) {
    const d = newDoc(raw && raw.name);
    if (raw && typeof raw.id === 'string') d.id = raw.id;
    if (raw && raw.created) d.created = +raw.created || d.created;
    if (raw && raw.updated) d.updated = +raw.updated || d.updated;
    const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
    for (const k in (raw && raw.people) || {}) {
      const r = raw.people[k];
      if (!r || typeof r !== 'object') continue;
      d.people[k] = {
        id: k, name: str(r.name), gender: r.gender === 'f' ? 'f' : 'm', born: str(r.born), died: str(r.died),
        place: str(r.place), note: str(r.note), photo: typeof r.photo === 'string' ? r.photo : null,
        files: Array.isArray(r.files) ? r.files.filter((f) => typeof f === 'string') : [], parentUnion: null,
      };
    }
    const spouseTaken = new Set();
    for (const k in (raw && raw.unions) || {}) {
      const r = raw.unions[k];
      if (!r || !d.people[r.a]) continue;
      let b = d.people[r.b] && r.b !== r.a && !spouseTaken.has(r.b) ? r.b : null;
      if (b) spouseTaken.add(b);
      d.unions[k] = { id: k, a: r.a, b, children: [] };
      for (const c of Array.isArray(r.children) ? r.children : []) {
        const p = d.people[c];
        if (!p || p.parentUnion || c === r.a || c === b) continue;
        p.parentUnion = k;
        d.unions[k].children.push(c);
      }
    }
    // Vợ/chồng không được đồng thời là con trong cây; người trong dòng không được là vợ/chồng.
    const blood = new Set(Object.values(d.unions).map((u) => u.a));
    for (const k in d.unions) {
      const u = d.unions[k];
      if (u.b && (d.people[u.b].parentUnion || blood.has(u.b))) u.b = null;
    }
    // Cắt vòng lặp tổ tiên.
    for (const id in d.people) {
      const seen = new Set();
      let cur = id;
      while (cur && d.people[cur] && d.people[cur].parentUnion) {
        if (seen.has(cur)) {
          const p = d.people[cur];
          d.unions[p.parentUnion].children = d.unions[p.parentUnion].children.filter((c) => c !== cur);
          p.parentUnion = null;
          break;
        }
        seen.add(cur);
        cur = d.unions[d.people[cur].parentUnion].a;
      }
    }
    for (const k in d.unions) if (!d.unions[k].b && !d.unions[k].children.length) delete d.unions[k];
    d.rootOrder = Array.isArray(raw && raw.rootOrder) ? raw.rootOrder.filter((r) => d.people[r]) : [];
    const v = (raw && raw.view) || {};
    for (const k in v.collapsed || {}) if (d.people[k]) d.view.collapsed[k] = true;
    d.view.focus = d.people[v.focus] ? v.focus : null;
    if (v.cam && isFinite(v.cam.x) && isFinite(v.cam.y) && v.cam.k > 0) d.view.cam = { x: +v.cam.x, y: +v.cam.y, k: +v.cam.k };
    return d;
  }

  // Mọi id tệp mà cây còn tham chiếu: ảnh đại diện, tài liệu đính kèm, ảnh chèn trong ghi chú.
  function fileRefs(t) {
    const out = new Set();
    for (const id in t.people) {
      const p = t.people[id];
      if (p.photo) out.add(p.photo);
      for (const f of p.files) out.add(f);
      const re = /data-fid="([^"]+)"/g;
      let m;
      while ((m = re.exec(p.note))) out.add(m[1]);
    }
    return out;
  }

  // Cây mẫu cho lần mở đầu tiên: bốn đời, đủ các trường hợp (hai vợ, con riêng, người mất, độc thân).
  function sample() {
    const t = newDoc('Họ Nguyễn Văn (mẫu)');
    const P = (f) => f;
    const r = addRoot(t, P({ name: 'Nguyễn Văn Phúc', gender: 'm', born: '1898', died: '1971', place: 'Làng Phù Lưu, Bắc Ninh',
      note: '<h2>Cụ Tổ đời thứ nhất</h2><p>Cụ là người <b>khai cơ lập nghiệp</b> ở làng Phù Lưu. Thuở nhỏ theo học chữ Nho, sau làm nghề <i>bốc thuốc nam</i>, nổi tiếng hiền hậu.</p><ul><li>Giỗ: ngày 12 tháng Chạp (âm lịch)</li><li>Mộ phần: nghĩa trang làng, khu B</li></ul><blockquote>"Cây có cội, nước có nguồn."</blockquote>' }));
    addSpouse(t, r.id, { name: 'Trần Thị Nhàn', gender: 'f', born: '1902', died: '1980' });
    const a = addChild(t, r.id, { name: 'Nguyễn Văn Hiếu', gender: 'm', born: '1925', died: '1999' });
    const b = addChild(t, r.id, { name: 'Nguyễn Thị Lan', gender: 'f', born: '1929', died: '2010' });
    const c = addChild(t, r.id, { name: 'Nguyễn Văn Thành', gender: 'm', born: '1934', died: '2018' });
    addSpouse(t, a.id, { name: 'Lê Thị Hoa', gender: 'f', born: '1928', died: '1960' });
    const a2 = addSpouse(t, a.id, { name: 'Phạm Thị Mai', gender: 'f', born: '1935', died: '2015' });
    const x = ix(t);
    const ua = x.unionsOf[a.id];
    const a1k = addChild(t, a.id, { name: 'Nguyễn Văn Đức', gender: 'm', born: '1950' }, ua[0].id);
    addChild(t, a.id, { name: 'Nguyễn Thị Hạnh', gender: 'f', born: '1953' }, ua[0].id);
    const a3 = addChild(t, a2.id, { name: 'Nguyễn Văn Tâm', gender: 'm', born: '1963' });
    addSpouse(t, b.id, { name: 'Vũ Văn Bình', gender: 'm', born: '1926', died: '2001' });
    addChild(t, b.id, { name: 'Vũ Thị Thu', gender: 'f', born: '1955' });
    addSpouse(t, c.id, { name: 'Đỗ Thị Yến', gender: 'f', born: '1940' });
    const c1 = addChild(t, c.id, { name: 'Nguyễn Văn Khoa', gender: 'm', born: '1962' });
    addChild(t, c.id, { name: 'Nguyễn Thị Ngọc', gender: 'f', born: '1966' });
    addSpouse(t, a1k.id, { name: 'Hoàng Thị Thủy', gender: 'f', born: '1954' });
    addChild(t, a1k.id, { name: 'Nguyễn Minh Anh', gender: 'f', born: '1980' });
    addChild(t, a1k.id, { name: 'Nguyễn Minh Quân', gender: 'm', born: '1984' });
    addSpouse(t, a3.id, { name: 'Bùi Thị Hằng', gender: 'f', born: '1966' });
    addChild(t, a3.id, { name: 'Nguyễn Gia Huy', gender: 'm', born: '1992' });
    addSpouse(t, c1.id, { name: 'Đặng Thu Trang', gender: 'f', born: '1965' });
    const k1 = addChild(t, c1.id, { name: 'Nguyễn Khánh Linh', gender: 'f', born: '1990' });
    addChild(t, c1.id, { name: 'Nguyễn Đức Duy', gender: 'm', born: '1995' });
    addSpouse(t, k1.id, { name: 'Trịnh Quốc Bảo', gender: 'm', born: '1988' });
    addChild(t, k1.id, { name: 'Trịnh Bảo An', gender: 'f', born: '2018' });
    return t;
  }

  GP.model = {
    uid, newDoc, ix, isSpouse, anchorOf, kidsOf, spousesOf, parentsOf, descendants, ancestors, generation, roots,
    siblingsList, addPerson, addRoot, addChild, addSpouse, addParent, removePerson, moveBlocker, moveUnder, reorder,
    update, normalize, fileRefs, sample,
  };
})(typeof window !== 'undefined' ? (window.GP = window.GP || {}) : (module.exports = {}));
