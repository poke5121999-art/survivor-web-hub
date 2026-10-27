/*
 * Trang sửa thông số game REPO 2D. Mô hình: mỗi bảng có { remote, draft }.
 * Số liệu gốc (baseline) = remote.docs nếu bảng đã có trên GameSpark, nếu không thì
 * DESIGN_DEFAULTS. Designer chỉ sửa GIÁ TRỊ; hình dạng và kiểu lấy từ baseline.
 */
(function () {
  "use strict";

  var OUT_RUN = ["wallet_start", "crew", "tactics", "upgrade", "passives", "gacha_banners", "gacha_rules",
    "shop_packs", "shop_rules", "shop_exchange", "loadout", "quests", "maps", "run_reward", "rank_rewards", "endless_seasons", "coop_rules", "modes"];
  var IN_RUN = ["stage_houses", "stage_rules", "extract_quota", "loot_cap", "loot_sizes", "loot_materials",
    "loot_items", "safes_chests", "station_upgrades", "station_gear", "station_healthpacks", "station_vehicles",
    "station_rules", "gacha_wheel", "foes", "run_timers", "endless_rules", "decor_lights", "pvp_maps"];
  var GROUPS = [["Ngoài ca", OUT_RUN], ["Trong ca", IN_RUN]];
  var ALL = OUT_RUN.concat(IN_RUN);
  // Not an md_ table: runtime collection cd_cost_guard with its own pane and its own save button.
  var GUARD = "cost_guard";
  var MODES = "modes";
  // md_modes fields drawn in the rows under coop / pvp, never as grid columns or "Chi tiết".
  var MODES_SIDE = ["localOpen", "fakeOnline", "fake", "score", "bots", "arena"];
  var GUARD_SERVICES = ["relay", "vivox"];
  // Main fields first, unit prices after (collapsed). Order is the form order; the proxy keeps the same list.
  var GUARD_FIELDS = {
    relay: { main: ["capUsd"], price: ["perGiB", "freeGiBPerCcu", "freeGiBCap", "perCcu", "freeCcu", "overheadBytes", "bytesFactor"] },
    vivox: { main: ["capUsd", "reserve"], price: ["freePcu", "stepPcu", "perStep"] }
  };
  // Shown when a service has no doc yet; saving creates it. Same numbers as the seed in gamespark-config/runtime/cost_guard.json.
  var GUARD_SEED = {
    relay: { capUsd: 50, forceClosed: false, perGiB: 0.16, freeGiBPerCcu: 3, freeGiBCap: 150, perCcu: 0.16, freeCcu: 50, overheadBytes: 80, bytesFactor: 1 },
    vivox: { capUsd: 0, forceClosed: false, reserve: 250, freePcu: 5000, stepPcu: 5000, perStep: 2000 }
  };
  var STALE_MS = 5 * 60 * 1000;
  // Not an md_ table either: runtime collection cd_client_gate (maintenance + minimum build), saved through gate_save.
  var GATE = "client_gate";
  var OPS = [GUARD, GATE];
  var GATE_PLATFORMS = ["webgl", "android", "ios"];
  var GATE_STORES = ["android", "ios"];
  var GATE_MSG_MAX = 300;
  var NET_IDS = ["eos", "utp"]; // same ids as NET_IDS in supabase/functions/gs-design/core.js
  var GATE_BUILD_MAX = 1e9;
  // Written by the WebGL client build next to the player ({ "build": <int> }); absent until that build exists.
  var HUB_VERSION_URL = "games/repo2d-unity/version.json";

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
  function setAt(o, path, v) {
    var c = o;
    path.slice(0, -1).forEach(function (k) { if (c[k] == null) c[k] = {}; c = c[k]; });
    c[path[path.length - 1]] = v;
  }
  // Also drops objects the removal leaves empty, so the diff shows one removed value instead of a new "{}".
  function unsetAt(o, path) {
    for (var i = path.length; i > 1; i--) {
      var parent = getAt(o, path.slice(0, i - 1));
      if (!isObj(parent)) return;
      delete parent[path[i - 1]];
      if (Object.keys(parent).length) return;
    }
    if (path.length === 1) delete o[path[0]];
  }

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

  // choicesBy picks the choice list by row id (quest metrics differ per scope).
  function rowMeta(table, docId, path) {
    var m = fieldMeta(table, path);
    return m.choicesBy ? Object.assign({}, m, { choices: m.choicesBy[docId] || [] }) : m;
  }

  function numText(n, meta) { return meta.pct ? trimNum(n * 100) + "%" : trimNum(n); }

  function fmtVal(v, meta) {
    meta = meta || {};
    if (v === undefined) return "(không có)";
    if (v === null) return "—";
    if (typeof v === "boolean") return v ? "Bật" : "Tắt";
    if (typeof v === "number") return numText(v, meta) + (meta.unit && !meta.pct ? " " + meta.unit : "");
    if (typeof v === "string") {
      var ch = (meta.choices || []).filter(function (c) { return c.v === v; })[0];
      return ch ? ch.label : (v === "" ? "(trống)" : v);
    }
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
    if (meta.cents && !/^-?\d+(\.\d{1,2})?$/.test(s)) return { err: "Tối đa hai số lẻ (cent), ví dụ 4.99." };
    var v = meta.pct ? +(n / 100).toPrecision(12) : n;
    if (meta.min != null && v < meta.min) return { err: "Không được nhỏ hơn " + numText(meta.min, meta) + "." };
    if (meta.max != null && v > meta.max) return { err: "Không được lớn hơn " + numText(meta.max, meta) + "." };
    return { v: v };
  }

  // ---------- model ----------

  var S = { tables: {}, current: null, loaded: false, conflict: {}, errors: {}, search: {}, open: {}, banner: null,
    guard: { loaded: false, rows: [], meters: {}, month: "", edited: false },
    // hubBuild: undefined = not read yet, null = no version.json (check skipped), else the hub WebGL build.
    gate: { loaded: false, doc: null, exists: false, dirty: { maint: false, build: false, net: false }, hubBuild: undefined } };
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
    (function add(list) {
      list.forEach(function (c) {
        if (c == null || c === false) return;
        if (Array.isArray(c)) add(c);
        else el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
      });
    })([].slice.call(arguments, 2));
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
    nav.appendChild(h("h2", { class: "dz-nav__group", text: "Vận hành" }));
    var go = h("optgroup", { label: "Vận hành" });
    OPS.forEach(function (n) {
      var b = h("button", { class: "dz-nav__item", type: "button", "data-table": n, onclick: function () { openTable(n); } },
        h("span", { class: "dz-nav__title", text: tableTitle(n) }));
      nav.appendChild(b);
      var o = h("option", { value: n, text: tableTitle(n) });
      go.appendChild(o);
      navRefs[n] = { btn: b, opt: o };
    });
    sel.appendChild(go);
    sel.onchange = function () { openTable(sel.value); };
  }

  function updateNav() {
    OPS.forEach(function (n) { navRefs[n].btn.classList.toggle("is-active", S.current === n); });
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
    } else if (typeof value === "number" || (value === undefined && meta.optional)) {
      // optional: an empty box means the field is absent (a reward the quest does not give).
      input = h("input", { type: "text", inputmode: "decimal", autocomplete: "off", class: "dz-input dz-input--num", "aria-label": meta.label,
        placeholder: meta.optional ? "0" : null });
      input.value = value === undefined ? "" : meta.pct ? trimNum(value * 100) : trimNum(value);
      input.addEventListener("input", function () {
        var errs = S.errors[table];
        if (meta.optional && !input.value.trim()) { delete errs[key]; unsetAt(doc, path); onEdit(); return; }
        var r = parseInput(input.value, meta);
        if (r.err) errs[key] = r.err; else { delete errs[key]; setAt(doc, path, r.v); }
        onEdit();
      });
      box.appendChild(input);
      var u = meta.pct ? "%" : meta.unit;
      if (u) box.appendChild(h("span", { class: "dz-unit", text: u }));
    } else if (typeof value === "string" && meta.choices) {
      input = h("select", { class: "dz-input", "aria-label": meta.label });
      meta.choices.forEach(function (c) { input.appendChild(h("option", { value: c.v, text: c.label })); });
      if (meta.choices.every(function (c) { return c.v !== value; })) input.appendChild(h("option", { value: value, text: value + " (không hợp lệ)" }));
      input.value = value;
      input.addEventListener("change", function () { setAt(doc, path, input.value); onEdit(); });
      box.appendChild(input);
    } else if (typeof value === "string") {
      // lines: a long comma list gets a box that wraps instead of one line that scrolls.
      input = h(meta.lines ? "textarea" : "input", { type: meta.lines ? null : "text", rows: meta.lines || null, autocomplete: "off",
        class: "dz-input" + (meta.lines ? " dz-input--area" : ""), "aria-label": meta.label });
      if (meta.lines) wrap.classList.add("dz-cell--wide");
      input.value = value;
      input.addEventListener("input", function () {
        setAt(doc, path, input.value);
        if (meta.re || meta.unique) checkColumn(table, docId, doc, path);
        onEdit();
      });
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
    // readonly: shown as a monospace block (rows of a map, one char per cell), never an input.
    if (meta.readonly && !isScalar(value)) {
      var text = Array.isArray(value) ? value.join("\n") : Object.keys(value).map(function (k) { return k + "  =  " + value[k]; }).join("\n");
      return h("div", { class: "dz-fld dz-fld--wide" },
        h("div", { class: "dz-fld__label", text: meta.label }),
        h("div", { class: "dz-fld__ctl" }, h("pre", { class: "dz-readonly dz-readonly--pre", "data-readonly": path.join("."), text: text }),
          meta.help ? h("p", { class: "dz-help", text: meta.help }) : null));
    }
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

  // Array of objects → small table. Columns: the label's cols first (so an optional field no item has yet still
  // gets a column), then any other leaf path found in the items. A label with add gets a button that appends
  // add.item under a fresh id; rows added since the last save can be dropped again, saved rows cannot.
  function subTable(table, docId, doc, path, items) {
    var conf = rawLabel(table, path) || {};
    var cols = [], seen = {};
    (conf.cols || []).forEach(function (k) { var p = k.split("."); seen[p.join(SEP)] = 1; cols.push(p); });
    items.forEach(function (it) {
      var f = flatten(it, [], {});
      Object.keys(f).forEach(function (k) { if (!seen[k]) { seen[k] = 1; cols.push(f[k].path); } });
    });
    var saved = (getAt(baseDoc(table, docId), path) || []).length;
    var thead = h("tr", null, h("th", { class: "dz-sub__n", text: "#" }));
    cols.forEach(function (c) {
      var m = fieldMeta(table, path.concat("0", c));
      thead.appendChild(h("th", { text: m.label + (m.unit ? " (" + m.unit + ")" : ""), title: m.help || "" }));
    });
    if (conf.add) thead.appendChild(h("th"));
    var tbody = h("tbody");
    items.forEach(function (it, i) {
      var tr = h("tr", null, h("td", { class: "dz-sub__n", text: String(i + 1) }));
      cols.forEach(function (c) {
        var p = path.concat(String(i), c), v = getAt(it, c), m = rowMeta(table, docId, p), td = h("td", { "data-col": c.join(".") });
        if (v !== undefined || m.optional) td.appendChild(cell(table, docId, doc, p, v, m));
        tr.appendChild(td);
      });
      if (conf.add) {
        var td = h("td");
        if (i >= saved) td.appendChild(h("button", { class: "btn btn--sm dz-sub__drop", type: "button", text: "Bỏ",
          title: "Bỏ dòng mới thêm này (chưa lưu)", onclick: function () { dropItem(table, docId, doc, path, i); } }));
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    });
    return h("div", { class: "dz-sub" }, h("table", { class: "dz-sub__table" }, h("thead", null, thead), tbody),
      conf.add ? h("div", { class: "dz-sub__add" }, h("button", { class: "btn btn--sm", type: "button", text: conf.add.button,
        "data-add": docId, onclick: function () { addItem(table, docId, doc, path, conf.add); } })) : null);
  }

  function baseDoc(table, docId) { return baseline(table).filter(function (d) { return d._id === docId; })[0] || {}; }

  function addItem(table, docId, doc, path, add) {
    var list = getAt(doc, path), prefix = (add.idPrefix || {})[docId] || "";
    var n = 1;
    while (list.some(function (it) { return it.id === prefix + "new" + n; })) n++;
    var item = Object.assign({ id: prefix + "new" + n }, clone(add.item));
    list.push(item);
    Object.keys(item).forEach(function (k) {
      var p = path.concat(String(list.length - 1), k), m = fieldMeta(table, p);
      if (m.re || m.unique) checkColumn(table, docId, doc, p);
    });
    renderMain();
  }

  function dropItem(table, docId, doc, path, i) {
    getAt(doc, path).splice(i, 1);
    var errs = S.errors[table], prefix = docId + SEP + path.join(".") + ".";
    Object.keys(errs).forEach(function (k) { if (k.indexOf(prefix) === 0) delete errs[k]; });
    var first = getAt(doc, path)[0] || {};
    Object.keys(first).forEach(function (k) {
      var p = path.concat("0", k), m = fieldMeta(table, p);
      if (m.re || m.unique) checkColumn(table, docId, doc, p);
    });
    renderMain();
  }

  // Validates one column of a list in every item, so fixing one of two duplicates clears both.
  function checkColumn(table, docId, doc, path) {
    var listPath = path.slice(0, -2), field = path[path.length - 1], meta = fieldMeta(table, path);
    var items = getAt(doc, listPath), errs = S.errors[table], count = {};
    items.forEach(function (it) { count[it[field]] = (count[it[field]] || 0) + 1; });
    items.forEach(function (it, i) {
      var key = docId + SEP + listPath.concat(String(i), field).join("."), v = it[field];
      var err = meta.re && !new RegExp(meta.re).test(v) ? meta.invalid
        : meta.unique && count[v] > 1 ? "Trùng với một dòng khác trong danh sách." : null;
      if (err) errs[key] = err; else delete errs[key];
    });
  }

  // ---------- main pane ----------

  function renderMain() {
    var n = S.current, pane = $("dz-pane");
    pane.textContent = "";
    if (!n) return;
    if (n === GUARD) { renderGuard(pane); return; }
    if (n === GATE) { renderGate(pane); return; }
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
    var inSec = function (k) {
      return k !== "_id" && !(table === MODES && MODES_SIDE.indexOf(k) >= 0) && (!sec || sec.fields.indexOf(k) >= 0);
    };
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
      var reach = table === MODES && !sec && (LABELS[MODES].reach || {}).row === doc._id ? reachRow(table, doc, cols.length + 2) : null;
      if (reach) { tr._reach = reach; tbody.appendChild(reach); }
      if (table === MODES && !sec && LABELS[MODES].fakeRow === doc._id) tbody.appendChild(fakeRow(table, doc, cols.length + 2));
      if (rest.length) {
        if (S.open[openKey] == null) S.open[openKey] = !!(LABELS[table] || {}).expand;
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

  // Online / Local under the coop row. Local is md_modes.coop.localOpen (missing = open) and saves with the table.
  // Online is cd_cost_guard/relay.forceClosed inverted, saved at once through guard_save: one source of truth with the cost tab.
  function reachRow(table, doc, span) {
    var R = LABELS[MODES].reach;
    var localMeta = Object.assign({}, fieldMeta(table, ["localOpen"]), { label: R.local.label });
    var localCell = cell(table, doc._id, doc, ["localOpen"], doc.localOpen !== false, localMeta);

    var on = h("input", { type: "checkbox", class: "dz-switch", role: "switch", id: "reach-online", "aria-label": R.online.label });
    var txt = h("span", { class: "dz-switch__text", id: "reach-online-text" });
    var err = h("p", { class: "dz-cell__err", id: "reach-online-err", role: "alert", hidden: true });
    var info = guardRow("relay");
    function paint(closed) { on.checked = !closed; txt.textContent = closed ? "Tắt" : "Bật"; }
    if (!S.guard.loaded) { on.disabled = true; txt.textContent = R.loading; }
    else paint(!!info.row.forceClosed);
    on.addEventListener("change", function () {
      var want = on.checked, doc2 = Object.assign({}, guardRow("relay").row, { forceClosed: !want });
      S.reachBusy = true; on.disabled = true; err.hidden = true;
      call({ action: "guard_save", doc: doc2 }).then(function (j) {
        S.reachBusy = false; setGuard(j); paint(!want); on.disabled = false;
        toast(R.saved + ": " + (want ? "bật" : "tắt"));
      }, function (e) {
        S.reachBusy = false; paint(!!guardRow("relay").row.forceClosed); on.disabled = false;
        err.hidden = false; err.textContent = errText(e);
      });
    });

    var inner = h("div", { class: "dz-form dz-form--detail dz-reach" },
      h("div", { class: "dz-fld" },
        h("label", { class: "dz-fld__label", for: "reach-online", text: R.online.label }),
        h("div", { class: "dz-fld__ctl" }, h("div", { class: "dz-cell__box" }, on, txt), err, h("p", { class: "dz-help", text: R.online.help }))),
      h("div", { class: "dz-fld" },
        h("label", { class: "dz-fld__label", text: R.local.label }),
        h("div", { class: "dz-fld__ctl" }, localCell, h("p", { class: "dz-help", text: R.local.help }))));
    return h("tr", { class: "dz-detail dz-reach-row", "data-reach": doc._id }, h("td", { colspan: String(span) }, inner));
  }

  // Fake online under the pvp row. A doc saved before this option has no fakeOnline (= off) and no fake block
  // (= the game's own numbers, which the seed copies): show the seed, and the first edit writes the whole block.
  function fakeRow(table, doc, span) {
    var seed = (DEFAULTS[MODES] || []).filter(function (d) { return d._id === doc._id; })[0] || {};
    var group = node(table, doc._id, doc, ["fake"], doc.fake || clone(seed.fake || {}));
    group.addEventListener("input", function () { if (!isObj(doc.fake)) doc.fake = clone(seed.fake || {}); }, true);
    // Scoreboard weights: same rule, a doc without the block shows the seed and the first edit writes all five.
    var score = node(table, doc._id, doc, ["score"], doc.score || clone(seed.score || {}));
    score.addEventListener("input", function () { if (!isObj(doc.score)) doc.score = clone(seed.score || {}); }, true);
    // Bots and arena numbers: same rule again, the seed shows until the first edit writes the whole block.
    var bots = node(table, doc._id, doc, ["bots"], doc.bots || clone(seed.bots || {}));
    bots.addEventListener("input", function () { if (!isObj(doc.bots)) doc.bots = clone(seed.bots || {}); }, true);
    var arena = node(table, doc._id, doc, ["arena"], doc.arena || clone(seed.arena || {}));
    arena.addEventListener("input", function () { if (!isObj(doc.arena)) doc.arena = clone(seed.arena || {}); }, true);
    var inner = h("div", { class: "dz-form dz-form--detail" },
      node(table, doc._id, doc, ["fakeOnline"], doc.fakeOnline === true), group, score, bots, arena);
    return h("tr", { class: "dz-detail dz-fake-row", "data-fake": doc._id }, h("td", { colspan: String(span) }, inner));
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
    if (OPS.indexOf(n) >= 0) { bar.hidden = true; return; }
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
    if (n === GUARD) { S.guard.edited = false; loadGuard(); }
    else if (n === GATE) { S.gate.dirty = { maint: false, build: false, net: false }; loadGate(); loadHubBuild(); }
    else if (n === MODES) loadGuard();
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
        S.current = ALL.indexOf(want) >= 0 || OPS.indexOf(want) >= 0 ? want : ALL[0];
        if (S.current === GUARD) loadGuard();
        if (S.current === GATE) { loadGate(); loadHubBuild(); }
      }
      if (!$("dz-pane").querySelector(".dz-pane__head")) renderMain();
      updateBar(); updateNav();
    }, function (e) { showBanner(errText(e), loadList); });
  }

  function poll() {
    var n = S.current;
    if (document.visibilityState !== "visible" || !n || !S.loaded) return;
    if (n === GUARD) { if (!S.guard.edited) loadGuard(); return; }
    if (n === GATE) { if (!S.gate.dirty.maint && !S.gate.dirty.build && !S.gate.dirty.net) loadGate(); return; }
    if (n === MODES) loadGuard();
    call({ action: "get", table: n }).then(function (j) {
      onRemote(n, { exists: j.exists, docs: j.docs, hash: j.hash });
    }, function () { /* a missed poll is not worth a banner; focus/list will surface real failures */ });
  }

  // ---------- cost guard ----------

  function GL() { return LABELS[GUARD] || {}; }
  function GFIELD(k) { return (GL().fields || {})[k] || { label: k }; }
  function usd(n) { return "$" + trimNum(+Number(n).toFixed(2)); }

  function loadGuard() {
    return call({ action: "guard" }).then(function (j) {
      showBanner(null);
      var was = S.guard.loaded ? !!guardRow("relay").row.forceClosed : null;
      setGuard(j);
      // The modes tab only shows relay's Online switch; redrawing it on every poll would drop focus from a box being typed in.
      var moved = was !== !!guardRow("relay").row.forceClosed;
      if (S.current === GUARD || (S.current === MODES && !S.reachBusy && moved)) renderMain();
    }, function (e) { showBanner(errText(e), loadGuard); });
  }

  function setGuard(j) {
    S.guard.rows = j.rows || [];
    S.guard.meters = j.meters || {};
    S.guard.month = j.month || "";
    S.guard.loaded = true;
  }

  function guardRow(id) {
    var r = S.guard.rows.filter(function (x) { return x._id === id; })[0];
    return r ? { row: r, exists: true } : { row: Object.assign({ _id: id }, GUARD_SEED[id]), exists: false };
  }

  function guardCard(id) {
    var L = GL(), SL = (L.services || {})[id] || {}, info = guardRow(id), row = info.row;
    var meter = S.guard.meters[S.guard.month] || null;
    var sm = meter && meter[id] || null;
    var gate = meter && meter.gate && meter.gate[id] || null;
    var fresh = !!(meter && meter.at && Date.now() - meter.at <= STALE_MS);

    var status;
    if (!info.exists) status = ["Không canh", "dz-pill--idle"];
    else if (!gate) status = ["Chưa rõ", "dz-pill--idle"];
    else if (gate.open) status = ["Mở", "dz-pill--open"];
    else status = ["Đóng" + ((L.why || {})[gate.why] ? " (" + L.why[gate.why] + ")" : ""), "dz-pill--closed"];

    var body = [];
    if (!info.exists) {
      body.push(h("p", { class: "dz-guard__note", text: "Chưa có dòng điều khiển cho dịch vụ này nên không bị canh (luôn mở). Số đang hiện là số gợi ý, bấm Lưu để bắt đầu canh." }));
    }
    if (!sm) {
      var nm = L.noMeter || "chưa có số đo tháng này";
      body.push(h("p", { class: "dz-guard__muted", "data-role": "nometer", text: nm.charAt(0).toUpperCase() + nm.slice(1) + "." }));
    } else {
      var cost = Number(sm.costUsd) || 0, cap = Number(row.capUsd) || 0;
      var pct = cap > 0 ? Math.min(100, cost / cap * 100) : (cost > 0 ? 100 : 0);
      var bar = h("div", { class: "dz-meter" + (pct >= 100 ? " is-over" : pct >= 80 ? " is-near" : ""), role: "progressbar",
        "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.round(pct)) },
        h("div", { class: "dz-meter__fill", style: "width:" + pct + "%" }));
      var live = meter.live && meter.live[id];
      var stats = [
        ["Đang dùng", live == null ? "—" : String(live)],
        ["Cao nhất tháng", sm.peak == null ? "—" : String(sm.peak)]
      ];
      // Unity bills Relay by the month's AVERAGE CCU (connection minutes / 43,200), so the peak alone overstates it.
      if (id === "relay") stats.push(["CCU trung bình tháng", trimNum(+((Number(sm.minutes) || 0) / 43200).toFixed(2))]);
      if (id === "relay") stats.push(["Đã dùng (GiB)", sm.bytes == null ? "—" : trimNum(+(sm.bytes / 1073741824).toFixed(3))]);
      // Vivox bills by peak logins in steps, so "$0 / ngưỡng $0" alone hides how far the free tier still reaches.
      if (id === "vivox" && row.freePcu != null) stats.push(["Miễn phí tới (người)", String(row.freePcu)]);
      body.push(h("p", { class: "dz-guard__cost", "data-role": "cost", text: "≈ " + usd(cost) + " / ngưỡng " + usd(cap) }), bar,
        h("dl", { class: "dz-stats" }, stats.map(function (p) {
          return h("div", { class: "dz-stats__item" }, h("dt", { text: p[0] }), h("dd", { text: p[1] }));
        })),
        h("p", { class: "dz-guard__muted", "data-role": "at", text: meter.at ? "đo lúc " + new Date(meter.at).toLocaleString("vi-VN") : "chưa có thời điểm đo" }));
      if (!fresh) body.push(h("p", { class: "dz-guard__stale", "data-role": "stale", text: "Số đo cũ hơn 5 phút: " + L.stale + "." }));
    }
    if (SL.blocks) body.push(h("p", { class: "dz-guard__muted", text: SL.blocks }));
    body.push(guardForm(id, row));
    return h("article", { class: "dz-guard", id: "guard-" + id },
      h("header", { class: "dz-guard__head" },
        h("h3", { class: "dz-guard__title", text: SL.title || id }),
        h("span", { class: "dz-pill " + status[1], "data-role": "status", text: status[0] })),
      body);
  }

  function guardForm(id, row) {
    var inputs = {};
    var errEl = h("p", { class: "dz-guard__err", id: "guard-" + id + "-err", role: "alert", hidden: true });
    var saveBtn = h("button", { class: "btn btn--primary", id: "guard-" + id + "-save", type: "button", text: "Lưu" });
    var f = GUARD_FIELDS[id];

    function fld(k) {
      var meta = GFIELD(k);
      var inp = h("input", { class: "dz-input dz-input--num", id: "guard-" + id + "-" + k, type: "text", inputmode: "decimal", value: trimNum(row[k]) });
      inp.addEventListener("input", function () { S.guard.edited = true; check(); });
      inputs[k] = inp;
      return h("div", { class: "dz-fld" },
        h("label", { class: "dz-fld__label", for: inp.id, text: meta.label }),
        h("div", { class: "dz-fld__ctl" }, inp, meta.help ? h("p", { class: "dz-help", text: meta.help }) : null));
    }

    var fc = h("input", { type: "checkbox", id: "guard-" + id + "-forceClosed" });
    fc.checked = !!row.forceClosed;
    fc.addEventListener("change", function () { S.guard.edited = true; check(); });
    var fcMeta = GFIELD("forceClosed");
    var fcFld = h("div", { class: "dz-fld" },
      h("span", { class: "dz-fld__label", text: fcMeta.label }),
      h("div", { class: "dz-fld__ctl" },
        h("label", { class: "dz-switch" }, fc, h("span", { class: "dz-switch__text", text: "Đóng ngay" })),
        fcMeta.help ? h("p", { class: "dz-help", text: fcMeta.help }) : null));

    var mainFlds = [fld(f.main[0]), fcFld].concat(f.main.slice(1).map(fld));
    var priceFlds = f.price.map(fld);

    // Client pre-check so a typo never costs a round trip; the proxy repeats the same rule.
    function values() {
      var out = { _id: id, forceClosed: fc.checked }, bad = null;
      f.main.concat(f.price).forEach(function (k) {
        var t = inputs[k].value.trim().replace(",", "."), n = t === "" ? NaN : Number(t);
        var ok = isFinite(n) && n >= 0;
        if (ok) out[k] = n; else bad = bad || GFIELD(k).label + ": nhập một số từ 0 trở lên.";
        inputs[k].classList.toggle("is-invalid", !ok);
      });
      return { doc: out, bad: bad };
    }
    function check() {
      var v = values();
      errEl.hidden = !v.bad;
      errEl.textContent = v.bad || "";
      saveBtn.disabled = !!v.bad;
    }
    saveBtn.addEventListener("click", function () {
      var v = values();
      if (v.bad) { check(); return; }
      saveBtn.disabled = true;
      call({ action: "guard_save", doc: v.doc }).then(function (j) {
        S.guard.edited = false;
        setGuard(j);
        toast("Đã lưu " + (((GL().services || {})[id] || {}).title || id));
        if (S.current === GUARD) renderMain();
      }, function (e) {
        errEl.hidden = false;
        errEl.textContent = errText(e);
        saveBtn.disabled = false;
      });
    });

    return h("div", { class: "dz-guard__form" },
      h("div", { class: "dz-form" }, mainFlds),
      h("details", { class: "dz-guard__prices" }, h("summary", { text: GL().price || "Giá đơn vị" }),
        h("div", { class: "dz-form" }, priceFlds)),
      h("div", { class: "dz-guard__actions" }, saveBtn), errEl);
  }

  function renderGuard(pane) {
    var L = GL();
    pane.appendChild(h("header", { class: "dz-pane__head" },
      h("h2", { class: "dz-pane__title", text: tableTitle(GUARD) }),
      L.blurb ? h("p", { class: "dz-pane__blurb", text: L.blurb }) : null,
      L.effect ? h("p", { class: "dz-pane__effect" }, h("strong", { text: "Có hiệu lực: " }), L.effect) : null));
    if (!S.guard.loaded) { pane.appendChild(h("p", { class: "dz-loading", text: "Đang tải…" })); return; }
    if (L.note) pane.appendChild(h("div", { class: "dz-notice", id: "guard-note" }, h("span", { text: L.note })));
    pane.appendChild(h("div", { class: "dz-guards" }, GUARD_SERVICES.map(guardCard)));
  }

  // ---------- client gate (Phát hành & bảo trì) ----------

  function TL() { return LABELS[GATE] || {}; }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function fill(t, vars) { return String(t || "").replace(/\{(\w+)\}/g, function (_, k) { return vars[k]; }); }

  // datetime-local holds wall time on this machine; the doc holds UTC.
  function utcToLocalInput(iso) {
    var d = iso ? new Date(iso) : null;
    if (!d || isNaN(d)) return "";
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + "T" + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }
  function localInputToUtc(v) {
    if (!v) return null;
    var d = new Date(v);
    return isNaN(d) ? undefined : d.toISOString().replace(/\.\d{3}Z$/, "Z");
  }
  function isHttps(s) {
    if (/\s/.test(s)) return false;
    try { return new URL(s).protocol === "https:"; } catch (e) { return false; }
  }

  function loadGate() {
    return call({ action: "gate" }).then(function (j) {
      showBanner(null);
      // Re-render only on change: the poll would otherwise reset focus every 15 s.
      var before = JSON.stringify([S.gate.loaded, S.gate.exists, S.gate.doc]);
      setGate(j);
      if (S.current === GATE && JSON.stringify([true, S.gate.exists, S.gate.doc]) !== before) renderMain();
    }, function (e) { showBanner(errText(e), loadGate); });
  }

  function setGate(j) {
    S.gate.doc = j.doc;
    S.gate.exists = !!j.exists;
    S.gate.loaded = true;
  }

  function loadHubBuild() {
    return fetch(HUB_VERSION_URL, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (j) {
        S.gate.hubBuild = j && Number.isInteger(j.build) && j.build >= 0 ? j.build : null;
        if (S.gate.onHubBuild) S.gate.onHubBuild();
      });
  }

  // Saves the whole doc: the server copy with one part replaced, so a save never carries the other card's unsaved edits.
  function saveGateDoc(part) {
    return call({ action: "gate_save", doc: Object.assign({}, S.gate.doc, part) }).then(function (j) { setGate(j); return j; });
  }

  function gateField(id, label, help, ctl) {
    return h("div", { class: "dz-fld" },
      h("label", { class: "dz-fld__label", for: id, text: label }),
      h("div", { class: "dz-fld__ctl" }, ctl, help ? h("p", { class: "dz-help", text: help }) : null));
  }

  // Message + expected-end fields shared by the maintenance card and every network row.
  function readMsgUntil(msg, until) {
    var u = localInputToUtc(until.value), text = msg.value.trim();
    var bad = text.length > GATE_MSG_MAX ? "Lời nhắn dài " + text.length + " ký tự, tối đa " + GATE_MSG_MAX + "."
      : u === undefined ? "Giờ dự kiến xong không hợp lệ." : null;
    return { message: text, until: u === undefined ? null : u, bad: bad };
  }
  function paintMsgUntil(v, msg, count, utc) {
    count.textContent = msg.value.trim().length + "/" + GATE_MSG_MAX + " ký tự";
    utc.textContent = v.until ? "Lưu là " + v.until.slice(0, 16).replace("T", " ") + " UTC" : "Không đặt giờ";
  }

  function gateMaintCard(paintTop) {
    var L = TL().maint || {}, m = S.gate.doc.maintenance;
    var pill = h("span", { class: "dz-pill", "data-role": "status" });
    var on = h("input", { type: "checkbox", class: "dz-switch", role: "switch", id: "gate-maint", "aria-label": L.on.label });
    var onText = h("span", { class: "dz-switch__text", id: "gate-maint-text" });
    var msg = h("textarea", { class: "dz-input dz-input--area", id: "gate-msg", rows: "3", maxlength: String(GATE_MSG_MAX) });
    msg.value = m.message;
    var count = h("p", { class: "dz-help", id: "gate-msg-count" });
    var until = h("input", { type: "datetime-local", class: "dz-input dz-input--when", id: "gate-until" });
    until.value = utcToLocalInput(m.until);
    var utc = h("p", { class: "dz-help", id: "gate-until-utc" });
    var err = h("p", { class: "dz-guard__err", id: "gate-maint-err", role: "alert", hidden: true });
    var saveBtn = h("button", { class: "btn btn--primary", id: "gate-maint-save", type: "button", text: L.save });

    function paint() {
      var isOn = S.gate.doc.maintenance.on;
      on.checked = isOn;
      onText.textContent = isOn ? "Bật" : "Tắt";
      pill.textContent = isOn ? L.status.on : L.status.off;
      pill.className = "dz-pill " + (isOn ? "dz-pill--closed" : "dz-pill--open");
      paintTop();
    }
    function values() {
      return readMsgUntil(msg, until);
    }
    function check() {
      var v = values();
      paintMsgUntil(v, msg, count, utc);
      err.hidden = !v.bad;
      err.textContent = v.bad || "";
      saveBtn.disabled = !!v.bad;
      return v;
    }
    function edited() { S.gate.dirty.maint = true; check(); }
    msg.addEventListener("input", edited);
    until.addEventListener("input", edited);
    until.addEventListener("change", edited);

    function send(want, done) {
      var v = check();
      if (v.bad) { paint(); return; }
      on.disabled = true; saveBtn.disabled = true;
      saveGateDoc({ maintenance: { on: want, message: v.message, until: v.until } }).then(function () {
        S.gate.dirty.maint = false;
        on.disabled = false;
        paint(); check();
        toast(done);
      }, function (e) {
        on.disabled = false; saveBtn.disabled = false;
        paint();
        err.hidden = false;
        err.textContent = errText(e);
      });
    }
    // Instant, like the Online switch; turning maintenance ON locks players out, so it asks first.
    on.addEventListener("change", function () {
      var want = on.checked;
      if (want && !confirm(TL().confirmOn)) { paint(); return; }
      send(want, want ? L.saved.on : L.saved.off);
    });
    saveBtn.addEventListener("click", function () { send(S.gate.doc.maintenance.on, L.saved.msg); });

    paint(); check();
    return h("article", { class: "dz-guard", id: "gate-maint-card" },
      h("header", { class: "dz-guard__head" }, h("h3", { class: "dz-guard__title", text: L.title }), pill),
      h("div", { class: "dz-form dz-form--detail" },
        h("div", { class: "dz-fld" },
          h("label", { class: "dz-fld__label", for: "gate-maint", text: L.on.label }),
          h("div", { class: "dz-fld__ctl" }, h("div", { class: "dz-cell__box" }, on, onText), h("p", { class: "dz-help", text: L.on.help }))),
        gateField("gate-msg", L.message.label, L.message.help, h("div", null, msg, count)),
        gateField("gate-until", L.until.label, L.until.help, h("div", null, until, utc))),
      h("div", { class: "dz-guard__actions" }, saveBtn), err);
  }

  // One row per network switch (EOS, Netcode); one dirty flag and one Save for the whole card.
  function gateNetCard() {
    var L = TL().net || {}, rows = {};
    var err = h("p", { class: "dz-guard__err", id: "gate-net-err", role: "alert", hidden: true });
    var saveBtn = h("button", { class: "btn btn--primary", id: "gate-net-save", type: "button", text: L.save });
    var rowEls = NET_IDS.map(function (id) {
      var P = (L.ids || {})[id] || {}, n = S.gate.doc.netMaintenance[id];
      var on = h("input", { type: "checkbox", class: "dz-switch", role: "switch", id: "gate-net-" + id, "aria-label": P.label });
      on.checked = n.on;
      var onText = h("span", { class: "dz-switch__text", id: "gate-net-" + id + "-text", text: n.on ? "Bật" : "Tắt" });
      var msg = h("textarea", { class: "dz-input dz-input--area", id: "gate-net-" + id + "-msg", rows: "2", maxlength: String(GATE_MSG_MAX) });
      msg.value = n.message;
      var count = h("p", { class: "dz-help", id: "gate-net-" + id + "-count" });
      var until = h("input", { type: "datetime-local", class: "dz-input dz-input--when", id: "gate-net-" + id + "-until" });
      until.value = utcToLocalInput(n.until);
      var utc = h("p", { class: "dz-help", id: "gate-net-" + id + "-utc" });
      rows[id] = { on: on, onText: onText, msg: msg, until: until, count: count, utc: utc };
      on.addEventListener("change", function () { onText.textContent = on.checked ? "Bật" : "Tắt"; edited(); });
      msg.addEventListener("input", edited);
      until.addEventListener("input", edited);
      until.addEventListener("change", edited);
      return h("section", { class: "dz-form dz-form--detail", id: "gate-net-row-" + id },
        h("h4", { class: "dz-guard__title", text: P.label }),
        h("div", { class: "dz-fld" },
          h("label", { class: "dz-fld__label", for: "gate-net-" + id, text: L.on.label }),
          h("div", { class: "dz-fld__ctl" }, h("div", { class: "dz-cell__box" }, on, onText), P.help ? h("p", { class: "dz-help", text: P.help }) : null)),
        gateField("gate-net-" + id + "-msg", L.message.label, L.message.help, h("div", null, msg, count)),
        gateField("gate-net-" + id + "-until", L.until.label, L.until.help, h("div", null, until, utc)));
    });
    function values() {
      var out = {}, bad = null;
      NET_IDS.forEach(function (id) {
        var r = rows[id], v = readMsgUntil(r.msg, r.until);
        paintMsgUntil(v, r.msg, r.count, r.utc);
        if (v.bad && !bad) bad = ((L.ids || {})[id] || {}).label + ": " + v.bad;
        out[id] = { on: r.on.checked, message: v.message, until: v.until };
      });
      return { net: out, bad: bad };
    }
    function check() {
      var v = values();
      err.hidden = !v.bad;
      err.textContent = v.bad || "";
      saveBtn.disabled = !!v.bad;
      return v;
    }
    function edited() { S.gate.dirty.net = true; check(); }
    saveBtn.addEventListener("click", function () {
      var v = check();
      if (v.bad) return;
      var turnsOn = NET_IDS.filter(function (id) { return v.net[id].on && !S.gate.doc.netMaintenance[id].on; });
      if (turnsOn.length && !confirm(fill(L.confirmOn, { names: turnsOn.map(function (id) { return L.ids[id].label; }).join(", ") }))) return;
      saveBtn.disabled = true;
      saveGateDoc({ netMaintenance: v.net }).then(function () {
        S.gate.dirty.net = false;
        check();
        toast(L.saved);
      }, function (e) {
        saveBtn.disabled = false;
        err.hidden = false;
        err.textContent = errText(e);
      });
    });
    check();
    return h("article", { class: "dz-guard", id: "gate-net-card" },
      h("header", { class: "dz-guard__head" }, h("h3", { class: "dz-guard__title", text: L.title })),
      L.note ? h("p", { class: "dz-guard__note", text: L.note }) : null,
      h("div", null, rowEls),
      h("div", { class: "dz-guard__actions" }, saveBtn), err);
  }

  function gateBuildCard() {
    var L = TL().build || {}, doc = S.gate.doc, inputs = {}, stores = {};
    var err = h("p", { class: "dz-guard__err", id: "gate-build-err", role: "alert", hidden: true });
    var saveBtn = h("button", { class: "btn btn--primary", id: "gate-build-save", type: "button", text: L.save });
    var hub = h("span", { class: "dz-gate__hub", id: "gate-hub-build" });

    function edited() { S.gate.dirty.build = true; check(); }
    var buildFlds = GATE_PLATFORMS.map(function (p) {
      var P = L.platforms[p];
      var inp = h("input", { class: "dz-input dz-input--num", id: "gate-min-" + p, type: "text", inputmode: "numeric", autocomplete: "off" });
      inp.value = String(doc.minBuild[p]);
      inp.addEventListener("input", edited);
      inputs[p] = inp;
      return gateField(inp.id, P.label, P.help, h("div", { class: "dz-cell__box dz-gate__row" }, inp, p === "webgl" ? hub : null));
    });
    var storeFlds = GATE_STORES.map(function (p) {
      var P = L.stores[p];
      var inp = h("input", { class: "dz-input", id: "gate-store-" + p, type: "url", autocomplete: "off", placeholder: "https://…" });
      inp.value = doc.storeUrls[p];
      inp.addEventListener("input", edited);
      stores[p] = inp;
      return gateField(inp.id, P.label, P.help, inp);
    });

    // Client pre-check so a typo never costs a round trip; the proxy repeats the same rules except the hub build.
    function values() {
      var minBuild = {}, storeUrls = {}, bad = null;
      GATE_PLATFORMS.forEach(function (p) {
        var t = inputs[p].value.trim(), ok = /^\d+$/.test(t) && Number(t) <= GATE_BUILD_MAX;
        if (ok) minBuild[p] = Number(t);
        else bad = bad || L.platforms[p].label + ": nhập số nguyên từ 0 đến " + GATE_BUILD_MAX + ".";
        inputs[p].classList.toggle("is-invalid", !ok);
      });
      var hb = S.gate.hubBuild;
      if (typeof hb === "number" && minBuild.webgl > hb) {
        bad = bad || fill(L.overHub, { min: minBuild.webgl, hub: hb });
        inputs.webgl.classList.add("is-invalid");
      }
      GATE_STORES.forEach(function (p) {
        var t = stores[p].value.trim(), ok = t === "" || isHttps(t);
        if (ok) storeUrls[p] = t;
        else bad = bad || L.stores[p].label + ": để trống hoặc dán link bắt đầu bằng https://.";
        stores[p].classList.toggle("is-invalid", !ok);
      });
      return { minBuild: minBuild, storeUrls: storeUrls, bad: bad };
    }
    function check() {
      var hb = S.gate.hubBuild;
      hub.textContent = L.hub.label + ": " + (hb === undefined ? L.hub.loading : hb === null ? L.hub.none : String(hb));
      var v = values();
      err.hidden = !v.bad;
      err.textContent = v.bad || "";
      saveBtn.disabled = !!v.bad;
      return v;
    }
    S.gate.onHubBuild = check;
    saveBtn.addEventListener("click", function () {
      var v = check();
      if (v.bad) return;
      saveBtn.disabled = true;
      saveGateDoc({ minBuild: v.minBuild, storeUrls: v.storeUrls }).then(function () {
        S.gate.dirty.build = false;
        check();
        toast(L.saved);
      }, function (e) {
        err.hidden = false;
        err.textContent = errText(e);
        saveBtn.disabled = false;
      });
    });

    check();
    return h("article", { class: "dz-guard", id: "gate-build-card" },
      h("header", { class: "dz-guard__head" }, h("h3", { class: "dz-guard__title", text: L.title })),
      h("p", { class: "dz-guard__note", text: L.note }),
      h("div", { class: "dz-form dz-form--detail" }, buildFlds, storeFlds),
      h("div", { class: "dz-guard__actions" }, saveBtn), err);
  }

  function renderGate(pane) {
    var L = TL();
    pane.appendChild(h("header", { class: "dz-pane__head" },
      h("h2", { class: "dz-pane__title", text: tableTitle(GATE) }),
      L.blurb ? h("p", { class: "dz-pane__blurb", text: L.blurb }) : null,
      L.effect ? h("p", { class: "dz-pane__effect" }, h("strong", { text: "Có hiệu lực: " }), L.effect) : null));
    S.gate.onHubBuild = null;
    if (!S.gate.loaded) { pane.appendChild(h("p", { class: "dz-loading", text: "Đang tải…" })); return; }
    var missing = h("div", { class: "dz-notice", id: "gate-missing" }, h("span", { text: L.missing }));
    var onNote = h("div", { class: "dz-notice dz-notice--warn", id: "gate-on-note", role: "status" }, h("span", { text: L.onNote }));
    function paintTop() {
      onNote.hidden = !S.gate.doc.maintenance.on;
      missing.hidden = S.gate.exists;
    }
    pane.appendChild(missing);
    pane.appendChild(onNote);
    pane.appendChild(h("div", { class: "dz-gate" }, gateMaintCard(paintTop), gateNetCard(), gateBuildCard()));
  }

  // ---------- review & save ----------

  function plainChange(n, d) {
    var docs = baseline(n);
    var settings = isSettings(docs);
    var meta = rowMeta(n, d._id, d.path);
    var doc = (S.tables[n].draft.filter(function (x) { return x._id === d._id; })[0]) || { _id: d._id };
    var sec = settings ? null : sectionOfField(n, S.tables[n].draft, d.path[0]);
    // A value inside a list item is named by that item (quest text, else its id), not just by its column.
    var at = -1;
    d.path.forEach(function (k, i) { if (at < 0 && isNum(k)) at = i; });
    var item = at < 0 ? null : getAt(doc, d.path.slice(0, at + 1)) || getAt(baseDoc(n, d._id), d.path.slice(0, at + 1));
    var itemName = isObj(item) ? (item.text || item.id || "Dòng " + (Number(d.path[at]) + 1)) + " · " : "";
    return (settings ? "" : rowTitle(n, doc, sec) + " · ") + itemName + meta.label + ": " +
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
