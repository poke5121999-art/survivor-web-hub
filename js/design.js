/*
 * Trang sửa thông số game REPO 2D. Mô hình: mỗi bảng có { remote, draft }.
 * Số liệu gốc (baseline) = remote.docs nếu bảng đã có trên GameSpark, nếu không thì
 * DESIGN_DEFAULTS. Designer chỉ sửa GIÁ TRỊ; hình dạng và kiểu lấy từ baseline.
 */
(function () {
  "use strict";

  var OUT_RUN = ["wallet_start", "crew", "tactics", "upgrade", "passives", "gacha_banners", "gacha_rules",
    "shop_packs", "shop_rules", "shop_exchange", "loadout", "quests", "maps", "run_reward", "rank_rewards", "endless_seasons"];
  var IN_RUN = ["stage_houses", "stage_rules", "extract_quota", "loot_cap", "loot_sizes", "loot_materials",
    "loot_items", "safes_chests", "station_upgrades", "station_gear", "station_healthpacks", "station_vehicles",
    "station_rules", "gacha_wheel", "foes", "run_timers", "endless_rules"];
  var GROUPS = [["Ngoài ca", OUT_RUN], ["Trong ca", IN_RUN]];
  var ALL = OUT_RUN.concat(IN_RUN);

  var LABELS = window.DESIGN_LABELS || {};
  var DEFAULTS = (window.DESIGN_DEFAULTS && window.DESIGN_DEFAULTS.tables) || {};
  var QS = new URLSearchParams(location.search);
  var POLL_MS = Number(QS.get("poll")) || 15000;
  var MAX_INLINE_COLS = 6;
  var SEP = "|";

  // ---------- pure helpers ----------

  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  function isScalar(v) { return v === null || typeof v !== "object"; }
  function isNum(k) { return /^\d+$/.test(k); }
  function trimNum(x) { return String(+Number(x).toPrecision(12)); }

  function flatten(v, prefix, out) {
    if (isScalar(v) || (Array.isArray(v) && !v.length) || (isObj(v) && !Object.keys(v).length)) {
      out[prefix.join(SEP)] = { path: prefix, v: v };
    } else {
      Object.keys(v).forEach(function (k) { flatten(v[k], prefix.concat(k), out); });
    }
    return out;
  }

  function sameLeaf(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  // [{_id, path:[...keys], before, after}] — one entry per differing leaf value.
  function diffDocs(baseline, draft) {
    var base = {}, res = [], ids = [];
    baseline.forEach(function (d) { base[d._id] = d; });
    draft.forEach(function (d) { ids.push(d._id); });
    baseline.forEach(function (d) { if (ids.indexOf(d._id) < 0) ids.push(d._id); });
    var dmap = {};
    draft.forEach(function (d) { dmap[d._id] = d; });
    ids.forEach(function (id) {
      var a = base[id] ? flatten(base[id], [], {}) : {};
      var b = dmap[id] ? flatten(dmap[id], [], {}) : {};
      Object.keys(a).concat(Object.keys(b).filter(function (k) { return !(k in a); })).forEach(function (k) {
        var x = a[k], y = b[k];
        if (x && y && sameLeaf(x.v, y.v)) return;
        res.push({ _id: id, path: (x || y).path, before: x ? x.v : undefined, after: y ? y.v : undefined });
      });
    });
    return res;
  }

  function getAt(o, path) { return path.reduce(function (c, k) { return c == null ? c : c[k]; }, o); }
  function setAt(o, path, v) { getAt(o, path.slice(0, -1))[path[path.length - 1]] = v; }

  // Label lookup: exact path first, then with array indexes replaced by "*".
  function rawLabel(table, path) {
    var f = (LABELS[table] || {}).fields || {};
    var exact = path.join(".");
    if (f[exact]) return f[exact];
    return f[path.map(function (p) { return isNum(p) ? "*" : p; }).join(".")] || null;
  }

  function fieldMeta(table, path) {
    var last = path[path.length - 1];
    var m = rawLabel(table, path);
    if (m) return Object.assign({ label: m.label || last }, m);
    if (isNum(last) && path.length > 1) {
      var parent = rawLabel(table, path.slice(0, -1));
      var i = Number(last);
      var pk = path[path.length - 2];
      var base = parent ? Object.assign({}, parent) : {};
      delete base.items; delete base.help;
      base.label = parent && parent.items && parent.items[i] ? parent.items[i]
        : (parent && parent.label ? parent.label : (isNum(pk) ? "Mục" : pk)) + " " + (i + 1);
      return base;
    }
    return { label: last };
  }

  function numText(n, meta) { return meta.pct ? trimNum(n * 100) + "%" : trimNum(n); }

  function fmtVal(v, meta) {
    meta = meta || {};
    if (v === undefined) return "(không có)";
    if (v === null) return "—";
    if (typeof v === "boolean") return v ? "Bật" : "Tắt";
    if (typeof v === "number") return numText(v, meta) + (meta.unit && !meta.pct ? " " + meta.unit : "");
    if (typeof v === "string") return v === "" ? "(trống)" : v;
    return JSON.stringify(v);
  }

  function parseInput(text, meta) {
    var raw = String(text).trim();
    if (!raw) return { err: "Hãy nhập một số." };
    if (meta.int && /^[1-9]\d{0,2}(\.\d{3})+$/.test(raw)) {
      return { err: "Không gõ dấu chấm ngăn cách hàng nghìn (gõ 12000, không gõ 12.000)." };
    }
    var s = raw.replace(",", ".");
    if (!/^-?\d+(\.\d+)?$/.test(s)) return { err: "Chỉ nhập số." };
    var n = Number(s);
    if (meta.int && !Number.isInteger(n)) return { err: "Chỉ nhận số nguyên, không có phần thập phân." };
    var v = meta.pct ? +(n / 100).toPrecision(12) : n;
    if (meta.min != null && v < meta.min) return { err: "Không được nhỏ hơn " + numText(meta.min, meta) + "." };
    if (meta.max != null && v > meta.max) return { err: "Không được lớn hơn " + numText(meta.max, meta) + "." };
    return { v: v };
  }

  // ---------- model ----------

  var S = { tables: {}, current: null, loaded: false, conflict: {}, errors: {}, search: {}, open: {}, banner: null };
  var session = window.HubSession ? window.HubSession.get() : null;

  function tableTitle(n) { return (LABELS[n] || {}).title || n; }
  function baseline(n) {
    var t = S.tables[n];
    return t && t.remote && t.remote.exists ? t.remote.docs : (DEFAULTS[n] || []);
  }
  function setRemote(n, remote) {
    S.tables[n] = { remote: remote, draft: clone(remote && remote.exists ? remote.docs : (DEFAULTS[n] || [])) };
    S.conflict[n] = null;
    S.errors[n] = {};
  }
  function changes(n) { var t = S.tables[n]; return t && t.remote ? diffDocs(baseline(n), t.draft) : []; }
  function errCount(n) { return Object.keys(S.errors[n] || {}).length; }
  function dirty(n) { return changes(n).length > 0 || errCount(n) > 0; }
  function anyDirty() { return ALL.some(function (n) { return S.tables[n] && S.tables[n].remote && dirty(n); }); }
  function isMissing(n) { var t = S.tables[n]; return !!(t && t.remote && !t.remote.exists); }
  function isSettings(docs) { return docs.length === 1 && docs[0]._id === "default"; }

  // ---------- API ----------

  var API = QS.get("api") || (((window.SUPABASE_CONFIG || {}).url || "").replace(/\/+$/, "") + "/functions/v1/gs-design");

  function refreshSession() {
    var s = window.HubSession && window.HubSession.get();
    if (!window.HubAuth || !s || s.kind !== "member") return Promise.resolve(false);
    return window.HubAuth.refresh(s).then(function (r) {
      if (r && r.ok) { window.HubSession.set(r.session); session = r.session; return true; }
      return false;
    });
  }

  function call(body, retried) {
    var pre = (window.HubSession && window.HubSession.isExpired() && !retried) ? refreshSession() : Promise.resolve();
    return pre.then(function () {
      var s = window.HubSession && window.HubSession.get();
      var h = { "Content-Type": "application/json" };
      var c = window.SUPABASE_CONFIG || {};
      if (c.anonKey) h.apikey = c.anonKey;
      if (s && s.accessToken) h.Authorization = "Bearer " + s.accessToken;
      return fetch(API, { method: "POST", headers: h, body: JSON.stringify(body) }).then(function (res) {
        return res.json().catch(function () { return null; }).then(function (j) {
          if (res.status === 401 && !retried) {
            return refreshSession().then(function (ok) { return ok ? call(body, true) : fail(res, j); });
          }
          if (!res.ok || !j || j.ok === false) return fail(res, j);
          return j;
        });
      }, function () {
        var e = new Error("Không kết nối được tới máy chủ");
        e.code = "NETWORK"; e.status = 0;
        throw e;
      });
    });
  }

  function fail(res, j) {
    var er = (j && j.error) || {};
    var e = new Error(er.message || ("HTTP " + res.status));
    e.code = er.code || ("HTTP_" + res.status);
    e.status = res.status;
    e.body = j;
    throw e;
  }

  function errText(e) {
    var code = e.code || "LỖI";
    if (code === "NETWORK") return "Không kết nối được tới máy chủ (NETWORK). Kiểm tra mạng rồi thử lại.";
    if (e.status === 401) return "Phiên đăng nhập hết hạn hoặc không hợp lệ (" + code + "). Hãy đăng nhập lại.";
    if (code === "NOT_DESIGNER") {
      return "Tài khoản" + (session && session.email ? " " + session.email : "") +
        " chưa nằm trong danh sách designer (NOT_DESIGNER). Nhờ admin thêm vào.";
    }
    if (e.status === 403) return "Không có quyền thực hiện (" + code + "): " + e.message;
    if (e.status === 502 || code === "GAMESPARK") return "GameSpark đang lỗi (" + code + "): " + e.message;
    if (e.status === 400) return "Dữ liệu không hợp lệ (" + code + "): " + e.message;
    return "Có lỗi (" + code + "): " + e.message;
  }

  // ---------- DOM helpers ----------

  function $(id) { return document.getElementById(id); }
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return el;
  }

  function toast(msg) {
    var t = h("div", { class: "dz-toast", text: msg });
    $("dz-toasts").appendChild(t);
    setTimeout(function () { t.classList.add("is-out"); setTimeout(function () { t.remove(); }, 300); }, 3200);
  }

  function showBanner(msg, retry) {
    var b = $("dz-banner");
    b.textContent = "";
    if (!msg) { b.hidden = true; return; }
    b.appendChild(h("span", { text: msg }));
    if (retry) b.appendChild(h("button", { class: "btn btn--sm", type: "button", text: "Thử lại", onclick: retry }));
    b.hidden = false;
  }

  // ---------- sidebar ----------

  var navRefs = {};

  function buildNav() {
    var nav = $("dz-nav"), sel = $("dz-select");
    nav.textContent = ""; sel.textContent = ""; navRefs = {};
    GROUPS.forEach(function (g) {
      nav.appendChild(h("h2", { class: "dz-nav__group", text: g[0] }));
      var og = h("optgroup", { label: g[0] });
      g[1].forEach(function (n) {
        var chip = h("span", { class: "dz-chip" });
        var dot = h("span", { class: "dz-dot", title: "Có thay đổi chưa lưu", hidden: true });
        var btn = h("button", { class: "dz-nav__item", type: "button", "data-table": n, onclick: function () { openTable(n); } },
          h("span", { class: "dz-nav__title", text: tableTitle(n) }), dot, chip);
        nav.appendChild(btn);
        var opt = h("option", { value: n });
        og.appendChild(opt);
        navRefs[n] = { btn: btn, chip: chip, dot: dot, opt: opt };
      });
      sel.appendChild(og);
    });
    sel.onchange = function () { openTable(sel.value); };
  }

  function updateNav() {
    ALL.forEach(function (n) {
      var r = navRefs[n], t = S.tables[n];
      if (!r) return;
      var known = t && t.remote;
      var live = known && t.remote.exists;
      r.chip.textContent = !known ? "Đang tải" : live ? "Trên GameSpark" : "Chưa dán · số gốc";
      r.chip.className = "dz-chip " + (live ? "dz-chip--live" : "dz-chip--missing");
      var d = known && dirty(n);
      r.dot.hidden = !d;
      r.btn.classList.toggle("is-active", n === S.current);
      r.opt.textContent = (d ? "● " : "") + tableTitle(n) + (known && !live ? " (chưa dán)" : "");
    });
    $("dz-select").value = S.current || "";
  }

  // ---------- field controls ----------

  // A section may name rows its own way (rowLabels / rowTitle); otherwise the table's naming applies.
  function rowTitle(table, doc, sec) {
    var L = LABELS[table] || {};
    if (sec && (sec.rowLabels || sec.rowTitle)) L = sec;
    if (L.rowLabels && L.rowLabels[doc._id]) return L.rowLabels[doc._id];
    if (L.rowPattern) {
      var re = new RegExp(L.rowPattern.re);
      if (re.test(doc._id)) return doc._id.replace(re, L.rowPattern.text);
    }
    if (L.rowTitle && typeof doc[L.rowTitle] === "string" && doc[L.rowTitle]) return doc[L.rowTitle];
    return doc._id;
  }

  // Split a list table into the sections its labels declare. Fields no section lists
  // land in a final "Khác" section so nothing is hidden. null = no sections declared.
  function sectionsOf(table, docs) {
    var L = LABELS[table] || {};
    if (!L.sections || !L.sections.length) return null;
    var listed = {}, extra = [];
    L.sections.forEach(function (s) { s.fields.forEach(function (k) { listed[k] = 1; }); });
    docs.forEach(function (d) {
      Object.keys(d).forEach(function (k) { if (k !== "_id" && !listed[k] && extra.indexOf(k) < 0) extra.push(k); });
    });
    var res = L.sections.map(function (s, i) { return Object.assign({ idx: i }, s); });
    if (extra.length) res.push({ idx: res.length, title: "Khác", fields: extra });
    return res;
  }

  function sectionOfField(table, docs, key) {
    var secs = sectionsOf(table, docs);
    return secs && secs.filter(function (s) { return s.fields.indexOf(key) >= 0; })[0] || null;
  }

  // Section note; noteWhen picks the text from a boolean field of another table's draft.
  function sectionNote(sec) {
    var w = sec.noteWhen;
    if (!w) return sec.note;
    var t = S.tables[w.table], d = t && t.draft && t.draft[0];
    var v = d ? d[w.field] : ((DEFAULTS[w.table] || [])[0] || {})[w.field];
    return w[String(!!v)] || sec.note;
  }

  // One editable leaf: input + unit + (filled later by updateMarks) "trước" and error lines.
  function cell(table, docId, doc, path, value, meta) {
    var key = docId + SEP + path.join(".");
    var box = h("div", { class: "dz-cell__box" });
    var input;
    var wrap = h("div", { class: "dz-cell", "data-k": key });
    wrap._meta = meta;

    if (typeof value === "boolean") {
      input = h("input", { type: "checkbox", class: "dz-switch", role: "switch", "aria-label": meta.label });
      input.checked = value;
      input.addEventListener("change", function () { setAt(doc, path, input.checked); onEdit(); });
      box.appendChild(input);
      box.appendChild(h("span", { class: "dz-switch__text", text: value ? "Bật" : "Tắt" }));
      input.addEventListener("change", function () { box.lastChild.textContent = input.checked ? "Bật" : "Tắt"; });
    } else if (typeof value === "number") {
      input = h("input", { type: "text", inputmode: "decimal", autocomplete: "off", class: "dz-input dz-input--num", "aria-label": meta.label });
      input.value = meta.pct ? trimNum(value * 100) : trimNum(value);
      input.addEventListener("input", function () {
        var r = parseInput(input.value, meta);
        var errs = S.errors[table];
        if (r.err) errs[key] = r.err; else { delete errs[key]; setAt(doc, path, r.v); }
        onEdit();
      });
      box.appendChild(input);
      var u = meta.pct ? "%" : meta.unit;
      if (u) box.appendChild(h("span", { class: "dz-unit", text: u }));
    } else if (typeof value === "string") {
      input = h("input", { type: "text", autocomplete: "off", class: "dz-input", "aria-label": meta.label });
      input.value = value;
      input.addEventListener("input", function () { setAt(doc, path, input.value); onEdit(); });
      box.appendChild(input);
    } else {
      box.appendChild(h("span", { class: "dz-readonly", text: fmtVal(value, meta) }));
    }
    wrap.appendChild(box);
    wrap.appendChild(h("div", { class: "dz-cell__old", hidden: true }));
    wrap.appendChild(h("div", { class: "dz-cell__err", hidden: true }));
    return wrap;
  }

  // Generic renderer: the value's shape picks the widget.
  function node(table, docId, doc, path, value) {
    var meta = fieldMeta(table, path);
    if (isScalar(value)) {
      return h("div", { class: "dz-fld" },
        h("label", { class: "dz-fld__label", text: meta.label }),
        h("div", { class: "dz-fld__ctl" }, cell(table, docId, doc, path, value, meta),
          meta.help ? h("p", { class: "dz-help", text: meta.help }) : null));
    }
    if (Array.isArray(value) && value.length && value.every(isScalar)) {
      var row = h("div", { class: "dz-slots" });
      value.forEach(function (v, i) {
        var p = path.concat(String(i)), m = fieldMeta(table, p);
        row.appendChild(h("div", { class: "dz-slot" }, h("span", { class: "dz-slot__label", text: m.label }),
          cell(table, docId, doc, p, v, m)));
      });
      return h("div", { class: "dz-fld dz-fld--wide" },
        h("div", { class: "dz-fld__label", text: meta.label }),
        h("div", { class: "dz-fld__ctl" }, row, meta.help ? h("p", { class: "dz-help", text: meta.help }) : null));
    }
    if (Array.isArray(value) && value.length && value.every(isObj)) {
      return h("div", { class: "dz-fld dz-fld--wide" },
        h("div", { class: "dz-fld__label", text: meta.label }),
        h("div", { class: "dz-fld__ctl" }, subTable(table, docId, doc, path, value),
          meta.help ? h("p", { class: "dz-help", text: meta.help }) : null));
    }
    if (isObj(value) || Array.isArray(value)) {
      var g = h("fieldset", { class: "dz-group" }, h("legend", { text: meta.label }),
        meta.help ? h("p", { class: "dz-help", text: meta.help }) : null);
      var keys = Array.isArray(value) ? value.map(function (_, i) { return String(i); }) : Object.keys(value);
      if (!keys.length) g.appendChild(h("p", { class: "dz-help", text: "(trống)" }));
      keys.forEach(function (k) { g.appendChild(node(table, docId, doc, path.concat(k), value[k])); });
      return g;
    }
    return h("span");
  }

  // Array of objects → small table; columns are the union of leaf paths across items.
  function subTable(table, docId, doc, path, items) {
    var cols = [], seen = {};
    items.forEach(function (it) {
      var f = flatten(it, [], {});
      Object.keys(f).forEach(function (k) { if (!seen[k]) { seen[k] = 1; cols.push(f[k].path); } });
    });
    var thead = h("tr", null, h("th", { class: "dz-sub__n", text: "#" }));
    cols.forEach(function (c) {
      var m = fieldMeta(table, path.concat("0", c));
      thead.appendChild(h("th", { text: m.label + (m.unit ? " (" + m.unit + ")" : ""), title: m.help || "" }));
    });
    var tbody = h("tbody");
    items.forEach(function (it, i) {
      var tr = h("tr", null, h("td", { class: "dz-sub__n", text: String(i + 1) }));
      cols.forEach(function (c) {
        var v = getAt(it, c), td = h("td");
        if (v !== undefined) td.appendChild(cell(table, docId, doc, path.concat(String(i), c), v, fieldMeta(table, path.concat(String(i), c))));
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    return h("div", { class: "dz-sub" }, h("table", { class: "dz-sub__table" }, h("thead", null, thead), tbody));
  }

  // ---------- main pane ----------

  function renderMain() {
    var n = S.current, pane = $("dz-pane");
    pane.textContent = "";
    if (!n) return;
    var t = S.tables[n];
    if (!t || !t.remote) { pane.appendChild(h("p", { class: "dz-loading", text: "Đang tải…" })); return; }
    var L = LABELS[n] || {};
    pane.appendChild(h("header", { class: "dz-pane__head" },
      h("h2", { class: "dz-pane__title", text: tableTitle(n) }),
      L.blurb ? h("p", { class: "dz-pane__blurb", text: L.blurb }) : null,
      L.effect ? h("p", { class: "dz-pane__effect" }, h("strong", { text: "Có hiệu lực: " }), L.effect) : null));

    var conflict = h("div", { class: "dz-notice dz-notice--warn", id: "dz-conflict", role: "alert", hidden: !S.conflict[n] },
      h("span", { text: "Có người vừa sửa bảng này trên GameSpark. Số bạn đã sửa vẫn được giữ, nhưng chưa lưu được cho tới khi tải bản mới." }),
      h("button", { class: "btn btn--sm", id: "btn-reload", type: "button", text: "Tải bản mới", onclick: reloadTable }));
    pane.appendChild(conflict);

    if (!t.remote.exists) {
      pane.appendChild(h("div", { class: "dz-notice", id: "dz-missing" },
        h("span", { text: "Bảng này chưa được dán lên GameSpark. Các số đang hiện là số gốc đã nằm sẵn trong game. Bấm lưu sẽ tạo bảng trên GameSpark (DEV) với các số này." })));
    }

    var docs = t.draft;
    if (isSettings(docs)) {
      var form = h("div", { class: "dz-form" });
      Object.keys(docs[0]).filter(function (k) { return k !== "_id"; }).forEach(function (k) {
        form.appendChild(node(n, "default", docs[0], [k], docs[0][k]));
      });
      pane.appendChild(form);
    } else {
      var secs = sectionsOf(n, docs);
      if (L.addRow) pane.appendChild(addRowBar(n, docs, L.addRow));
      if (!secs) pane.appendChild(listGrid(n, docs, null));
      else secs.forEach(function (sec) {
        var note = sectionNote(sec);
        pane.appendChild(h("section", { class: "dz-section" },
          h("h3", { class: "dz-section__title", text: sec.title }),
          note ? h("p", { class: "dz-section__note", text: note }) : null,
          listGrid(n, docs, sec)));
      });
    }
    updateMarks();
  }

  // Tables whose labels declare addRow let designers add a row: an id typed as text (checked by
  // addRow.re), the other fields copied from the last row. Only endless_seasons uses it.
  function addRowBar(table, docs, cfg) {
    var input = h("input", { type: "text", class: "dz-input", id: "dz-add-id", autocomplete: "off", placeholder: cfg.placeholder, "aria-label": cfg.label, maxlength: "16" });
    var err = h("p", { class: "dz-cell__err", id: "dz-add-err", hidden: true });
    var btn = h("button", { class: "btn btn--sm", id: "dz-add-btn", type: "button", text: cfg.button });
    btn.addEventListener("click", function () {
      var id = input.value.trim();
      var msg = null;
      if (!new RegExp(cfg.re).test(id)) msg = cfg.invalid;
      else if (docs.some(function (d) { return d._id === id; })) msg = cfg.exists;
      err.hidden = !msg;
      if (msg) { err.textContent = msg; return; }
      var tpl = docs.length ? clone(docs[docs.length - 1]) : {};
      tpl._id = id;
      docs.push(tpl);
      docs.sort(function (a, b) { return a._id < b._id ? -1 : a._id > b._id ? 1 : 0; });
      S.errors[table] = S.errors[table] || {};
      renderMain(); updateBar(); updateNav();
    });
    return h("div", { class: "dz-addrow" }, h("label", { class: "dz-fld__label", for: "dz-add-id", text: cfg.label }), input, btn, err,
      h("p", { class: "dz-help", text: cfg.help }));
  }

  // sec (optional) restricts the grid to that section's fields, in its order.
  function listGrid(table, docs, sec) {
    var inSec = function (k) { return k !== "_id" && (!sec || sec.fields.indexOf(k) >= 0); };
    var cols = [];
    docs.forEach(function (d) {
      Object.keys(d).forEach(function (k) {
        if (inSec(k) && isScalar(d[k]) && cols.indexOf(k) < 0) cols.push(k);
      });
    });
    if (sec) cols.sort(function (a, b) { return sec.fields.indexOf(a) - sec.fields.indexOf(b); });
    // A section is already a curated subset: show all of it inline instead of hiding some behind "Chi tiết".
    cols = cols.slice(0, (sec && sec.inline) || MAX_INLINE_COLS);
    var wrap = h("div", { class: "dz-list" });
    var tbody = h("tbody");

    if (docs.length > 10) {
      var q = h("input", { type: "search", class: "dz-search", id: "dz-search", placeholder: "Tìm theo tên hoặc mã…", "aria-label": "Tìm dòng" });
      q.value = S.search[table] || "";
      q.addEventListener("input", function () { S.search[table] = q.value; applySearch(); });
      wrap.appendChild(h("div", { class: "dz-list__tools" }, q, h("span", { class: "dz-list__count", id: "dz-list-count" })));
    }

    var head = h("tr", null, h("th", { class: "dz-grid__name", text: "Dòng" }));
    var colLabel = {};
    cols.forEach(function (c) {
      var m = fieldMeta(table, [c]);
      colLabel[c] = m.label + (m.unit ? " (" + m.unit + ")" : "");
      head.appendChild(h("th", { text: colLabel[c], title: m.help || "" }));
    });
    head.appendChild(h("th", { class: "dz-grid__more" }));

    docs.forEach(function (doc) {
      var title = rowTitle(table, doc, sec);
      var rest = Object.keys(doc).filter(function (k) { return inSec(k) && cols.indexOf(k) < 0; });
      var openKey = table + SEP + (sec ? sec.idx + SEP : "") + doc._id;
      var tr = h("tr", { class: "dz-row", "data-id": doc._id });
      tr._fields = sec ? sec.fields : null;
      tr._search = (title + " " + doc._id).toLowerCase();
      tr.appendChild(h("td", { class: "dz-grid__name" }, h("span", { class: "dz-row__title", text: title }),
        title !== doc._id ? h("span", { class: "dz-row__id", text: doc._id }) : null));
      cols.forEach(function (c) {
        var td = h("td", { "data-label": colLabel[c] });
        if (doc[c] !== undefined) td.appendChild(cell(table, doc._id, doc, [c], doc[c], fieldMeta(table, [c])));
        tr.appendChild(td);
      });
      var moreTd = h("td", { class: "dz-grid__more" });
      tr.appendChild(moreTd);
      tbody.appendChild(tr);
      if (rest.length) {
        var detail = h("tr", { class: "dz-detail", hidden: !S.open[openKey] });
        var inner = h("div", { class: "dz-form dz-form--detail" });
        rest.forEach(function (k) { inner.appendChild(node(table, doc._id, doc, [k], doc[k])); });
        detail.appendChild(h("td", { colspan: String(cols.length + 2) }, inner));
        var btn = h("button", { class: "btn btn--sm dz-more", type: "button", "aria-expanded": S.open[openKey] ? "true" : "false" },
          "Chi tiết");
        btn.addEventListener("click", function () {
          S.open[openKey] = !S.open[openKey];
          detail.hidden = !S.open[openKey];
          btn.setAttribute("aria-expanded", S.open[openKey] ? "true" : "false");
        });
        btn.appendChild(h("span", { class: "dz-more__badge", hidden: true }));
        moreTd.appendChild(btn);
        tr._detail = detail;
        tr._btn = btn;
        tbody.appendChild(detail);
      }
    });
    wrap.appendChild(h("div", { class: "dz-grid__wrap" }, h("table", { class: "dz-grid" }, h("thead", null, head), tbody)));
    setTimeout(applySearch, 0);
    return wrap;
  }

  function applySearch() {
    var q = ($("dz-search") || {}).value;
    q = (q || "").trim().toLowerCase();
    var shown = 0, total = 0;
    document.querySelectorAll("#dz-pane .dz-row").forEach(function (tr) {
      var ok = !q || tr._search.indexOf(q) >= 0;
      tr.hidden = !ok;
      total++; if (ok) shown++;
      if (tr._detail) tr._detail.classList.toggle("is-filtered", !ok);
    });
    var c = $("dz-list-count");
    if (c) c.textContent = shown + "/" + total + " dòng";
  }

  // Highlight changed leaves + inline errors + the bar/sidebar, all from the one diff.
  function updateMarks() {
    var n = S.current;
    if (!n || !S.tables[n] || !S.tables[n].remote) { updateBar(); updateNav(); return; }
    var diff = changes(n), by = {};
    diff.forEach(function (d) { by[d._id + SEP + d.path.join(".")] = d; });
    var errs = S.errors[n] || {};
    document.querySelectorAll("#dz-pane [data-k]").forEach(function (el) {
      var k = el.getAttribute("data-k"), d = by[k], e = errs[k];
      el.classList.toggle("is-changed", !!d);
      el.classList.toggle("is-invalid", !!e);
      var old = el.querySelector(".dz-cell__old"), er = el.querySelector(".dz-cell__err");
      old.hidden = !d;
      if (d) old.textContent = "trước: " + fmtVal(d.before, el._meta);
      er.hidden = !e;
      if (e) er.textContent = e;
    });
    document.querySelectorAll("#dz-pane .dz-row").forEach(function (tr) {
      var id = tr.getAttribute("data-id");
      var c = diff.filter(function (d) { return d._id === id && (!tr._fields || tr._fields.indexOf(d.path[0]) >= 0); }).length;
      tr.classList.toggle("is-changed", c > 0);
      if (tr._btn) {
        var inDetail = 0;
        tr._detail.querySelectorAll(".is-changed").forEach(function () { inDetail++; });
        var b = tr._btn.querySelector(".dz-more__badge");
        b.hidden = !inDetail;
        b.textContent = String(inDetail);
      }
    });
    updateBar();
    updateNav();
  }

  function onEdit() { updateMarks(); }

  function updateBar() {
    var n = S.current, bar = $("dz-bar");
    if (!n || !S.tables[n] || !S.tables[n].remote) { bar.hidden = true; return; }
    var c = changes(n).length, e = errCount(n), missing = isMissing(n);
    var clean = !c && !e && !missing;
    bar.hidden = false;
    var txt = c ? c + " thay đổi" : (missing ? "Bảng chưa có trên GameSpark" : "");
    if (clean) txt = "Chưa sửa gì · số trên trang khớp GameSpark";
    if (e) txt += (txt ? " · " : "") + e + " ô nhập lỗi, cần sửa trước khi lưu";
    $("dz-bar-count").textContent = txt;
    $("btn-discard").hidden = !(c || e);
    var rv = $("btn-review");
    rv.textContent = !c && !e && missing ? "Tạo bảng trên GameSpark" : "Xem lại & lưu";
    rv.disabled = clean || e > 0 || !!S.conflict[n];
    if (clean) rv.title = "Sửa ít nhất một ô để lưu lên GameSpark"; else rv.removeAttribute("title");
  }

  // ---------- actions ----------

  function openTable(n) {
    S.current = n;
    try { history.replaceState(null, "", location.search + "#" + n); } catch (e) { /* file:// */ }
    renderMain();
    updateBar();
    updateNav();
    window.scrollTo(0, 0);
  }

  function discard() {
    var n = S.current;
    if (!confirm("Bỏ hết thay đổi chưa lưu của bảng này?")) return;
    var pending = S.conflict[n];
    if (pending && pending.docs) setRemote(n, pending);
    else { S.tables[n].draft = clone(baseline(n)); S.errors[n] = {}; S.conflict[n] = null; }
    renderMain(); updateBar(); updateNav();
  }

  function reloadTable() {
    var n = S.current;
    if (!confirm("Bỏ các thay đổi của bạn và tải bản mới từ GameSpark?")) return;
    call({ action: "get", table: n }).then(function (j) {
      setRemote(n, { exists: j.exists, docs: j.docs, hash: j.hash });
      renderMain(); updateBar(); updateNav();
      toast("Đã tải bản mới");
    }, function (e) { showBanner(errText(e)); });
  }

  function markConflict(n, remote) {
    S.conflict[n] = remote || { stale: true };
    // Only reveal the banner: re-rendering would wipe half-typed input.
    var b = $("dz-conflict");
    if (n === S.current && b) b.hidden = false;
    updateBar(); updateNav();
  }

  // Remote state arrived (poll / focus / list). Silent when nothing changed.
  function onRemote(n, remote) {
    var t = S.tables[n];
    if (!t || !t.remote) { setRemote(n, remote); return; }
    if (t.remote.hash === remote.hash && t.remote.exists === remote.exists) return;
    if (dirty(n)) { markConflict(n, remote); return; }
    setRemote(n, remote);
    if (n === S.current) { renderMain(); toast("Bảng vừa được cập nhật"); }
    updateBar(); updateNav();
  }

  function loadList() {
    return call({ action: "list" }).then(function (j) {
      showBanner(null);
      ALL.forEach(function (n) {
        var r = j.tables && j.tables[n];
        if (!r) return;
        var remote = { exists: !!r.exists, docs: r.docs || [], hash: r.hash };
        if (!S.tables[n]) setRemote(n, remote); else onRemote(n, remote);
      });
      S.loaded = true;
      if (!S.current) {
        var want = (location.hash || "").slice(1);
        S.current = ALL.indexOf(want) >= 0 ? want : ALL[0];
      }
      if (!$("dz-pane").querySelector(".dz-pane__head")) renderMain();
      updateBar(); updateNav();
    }, function (e) { showBanner(errText(e), loadList); });
  }

  function poll() {
    var n = S.current;
    if (document.visibilityState !== "visible" || !n || !S.loaded) return;
    call({ action: "get", table: n }).then(function (j) {
      onRemote(n, { exists: j.exists, docs: j.docs, hash: j.hash });
    }, function () { /* a missed poll is not worth a banner; focus/list will surface real failures */ });
  }

  // ---------- review & save ----------

  function plainChange(n, d) {
    var docs = baseline(n);
    var settings = isSettings(docs);
    var meta = fieldMeta(n, d.path);
    var doc = (S.tables[n].draft.filter(function (x) { return x._id === d._id; })[0]) || { _id: d._id };
    var sec = settings ? null : sectionOfField(n, S.tables[n].draft, d.path[0]);
    return (settings ? "" : rowTitle(n, doc, sec) + " · ") + meta.label + ": " +
      fmtVal(d.before, meta) + " → " + fmtVal(d.after, meta);
  }

  function openReview() {
    var n = S.current, t = S.tables[n], dlg = $("dz-dialog");
    var diff = changes(n), missing = isMissing(n);
    var primary = h("button", { class: "btn btn--primary", id: "btn-save", type: "button", disabled: true,
      text: !diff.length && missing ? "Tạo bảng trên GameSpark" : "Lưu lên GameSpark (DEV)" });
    var status = h("p", { class: "dz-dialog__status", id: "dz-dry", text: "Đang kiểm tra với GameSpark…" });
    var list = h("ul", { class: "dz-changes", id: "dz-changes" });
    diff.forEach(function (d) { list.appendChild(h("li", { text: plainChange(n, d) })); });
    dlg.textContent = "";
    dlg.appendChild(h("h2", { id: "dz-dialog-title", text: "Xem lại: " + tableTitle(n) }));
    if (missing) dlg.appendChild(h("p", { class: "dz-help", text: "Bảng này sẽ được tạo mới trên GameSpark (DEV)." }));
    dlg.appendChild(diff.length ? list : h("p", { class: "dz-help", text: "Không sửa số nào, dùng nguyên số gốc trong game." }));
    dlg.appendChild(status);
    dlg.appendChild(h("div", { class: "dz-dialog__actions" },
      h("button", { class: "btn btn--ghost", id: "btn-back", type: "button", text: "Quay lại", onclick: function () { dlg.close(); } }), primary));
    if (!dlg.open) dlg.showModal();

    var payload = function (dry) { return { action: "save", table: n, docs: t.draft, baseHash: t.remote.hash, dryRun: dry }; };
    call(payload(true)).then(function (j) {
      var c = j.counts || {};
      status.textContent = "GameSpark báo: thêm " + (c.insert || 0) + " · sửa " + (c.update || 0) +
        " · xoá " + (c.delete || 0) + " · giữ nguyên " + (c.unchanged || 0) + " dòng.";
      primary.disabled = false;
    }, function (e) { dryFailed(e, dlg, status); });

    primary.addEventListener("click", function () {
      primary.disabled = true;
      status.textContent = "Đang lưu…";
      call(payload(false)).then(function () {
        dlg.close();
        toast("Đã lưu lên GameSpark (DEV)");
        return call({ action: "get", table: n }).then(function (j) {
          setRemote(n, { exists: j.exists, docs: j.docs, hash: j.hash });
          renderMain(); updateBar(); updateNav();
        });
      }).catch(function (e) { dryFailed(e, dlg, status); });
    });
  }

  function dryFailed(e, dlg, status) {
    if (e.code === "CONFLICT") {
      dlg.close();
      var cur = e.body && e.body.current;
      markConflict(S.current, cur ? { exists: cur.exists, docs: cur.docs, hash: cur.hash } : null);
      return;
    }
    status.textContent = errText(e);
    status.classList.add("is-error");
  }

  // ---------- boot ----------

  function boot() {
    buildNav();
    updateNav();
    $("btn-discard").addEventListener("click", discard);
    $("btn-review").addEventListener("click", openReview);
    loadList();
    setInterval(poll, POLL_MS);
    window.addEventListener("focus", function () { if (S.loaded) loadList(); });
    window.addEventListener("beforeunload", function (ev) {
      if (anyDirty()) { ev.preventDefault(); ev.returnValue = ""; }
    });
  }

  window.DesignEditor = { diffDocs: diffDocs, parseInput: parseInput };
  boot();
})();
