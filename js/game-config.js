/*
 * Trang sửa thông số game (game-config.html?game=<id>).
 * Hợp đồng schema, cách game đọc ghi đè, cách thêm game mới: docs/game-config.md.
 * Dữ liệu ở bảng public.game_config trên Supabase của hub (db/game-config.sql); schema ở
 * games/<id>/config.schema.json. Mỗi khoá trong schema là đường dẫn có dấu chấm ("run.startGold"),
 * bản ghi đè lưu dạng đối tượng lồng nhau ({run:{startGold:700}}) và chỉ chứa khoá đã sửa.
 */
(function () {
  "use strict";

  var DEFAULT_GAME = "pocket-auto-battler-pet";
  var HIST_LIMIT = 20;

  // ---------- tiện ích ----------
  function $(id) { return document.getElementById(id); }
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === "text") el.textContent = v;
      else if (k === "class") el.className = v;
      else el.setAttribute(k, v === true ? "" : v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null) continue;
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return el;
  }
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function getPath(o, key) {
    var p = key.split("."), c = o;
    for (var i = 0; i < p.length; i++) {
      if (c == null || typeof c !== "object" || !(p[i] in c)) return undefined;
      c = c[p[i]];
    }
    return c;
  }
  function setPath(o, key, v) {
    var p = key.split("."), c = o;
    for (var i = 0; i < p.length - 1; i++) {
      if (c[p[i]] == null || typeof c[p[i]] !== "object" || Array.isArray(c[p[i]])) c[p[i]] = {};
      c = c[p[i]];
    }
    c[p[p.length - 1]] = v;
  }
  function delPath(o, key) {
    var p = key.split("."), chain = [o], c = o, i;
    for (i = 0; i < p.length - 1; i++) {
      if (c == null || typeof c[p[i]] !== "object") return;
      c = c[p[i]]; chain.push(c);
    }
    delete c[p[p.length - 1]];
    for (i = chain.length - 1; i > 0; i--) {   // dọn đối tượng rỗng
      if (Object.keys(chain[i]).length === 0) delete chain[i - 1][p[i - 1]]; else break;
    }
  }
  function toast(msg) {
    var t = h("div", { class: "dz-toast", text: msg });
    $("dz-toasts").appendChild(t);
    setTimeout(function () { t.classList.add("is-out"); }, 2600);
    setTimeout(function () { t.remove(); }, 3000);
  }
  function banner(msg) {
    var b = $("dz-banner");
    b.textContent = msg || "";
    b.hidden = !msg;
  }

  // ---------- Supabase REST ----------
  var cfg = window.SUPABASE_CONFIG || {};
  function base() { return String(cfg.url || "").replace(/\/+$/, ""); }
  function accessToken() {
    var s = window.HubSession && window.HubSession.get();
    if (s && window.HubSession.isExpired() && window.HubAuth) {
      return window.HubAuth.refresh(s).then(function (r) {
        if (r && r.ok) { window.HubSession.set(r.session); return r.session.accessToken; }
        return s.accessToken;
      });
    }
    return Promise.resolve(s && s.accessToken);
  }
  // Trả {ok,status,data,code}; lỗi mạng thì status 0.
  function rest(method, path, body, prefer) {
    return accessToken().then(function (tok) {
      var headers = { apikey: cfg.anonKey, Authorization: "Bearer " + (tok || cfg.anonKey) };
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (prefer) headers.Prefer = prefer;
      return fetch(base() + "/rest/v1/" + path, { method: method, headers: headers,
        body: body === undefined ? undefined : JSON.stringify(body) });
    }).then(function (res) {
      return res.text().then(function (t) {
        var d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = null; }
        return { ok: res.ok, status: res.status, data: d, code: d && d.code };
      });
    }, function () { return { ok: false, status: 0 }; });
  }
  function explain(r, what) {
    if (r.status === 0) return "Không nối được Supabase, kiểm tra mạng rồi thử lại.";
    if (r.status === 404 || r.code === "PGRST205" || r.code === "42P01")
      return "Chưa có bảng " + (what || "game_config") + " trên Supabase, chạy db/game-config.sql trong SQL editor.";
    if (r.status === 401) return "Phiên đăng nhập hết hạn, đăng nhập lại rồi mở lại trang.";
    if (r.status === 403 || r.code === "42501")
      return what === "game_config_history" ? "Tài khoản không phải admin nên không xem được lịch sử."
        : "Tài khoản không phải admin nên không lưu được.";
    var m = r.data && (r.data.message || r.data.error);
    return "Supabase trả lỗi " + r.status + (m ? ": " + m : ".");
  }

  // ---------- trạng thái ----------
  var GAME = (new URLSearchParams(location.search).get("game") || DEFAULT_GAME);
  var schema = null, fields = [];
  var saved = {};            // bản ghi đè đang lưu (lồng nhau)
  var edits = {};            // key -> giá trị đang sửa
  var errors = {};           // id ô -> thông báo lỗi
  var active = null;         // id tab hoặc "history"

  function def(f) { return clone(f.default); }
  function eff(f) { var v = getPath(saved, f.key); return v === undefined ? def(f) : clone(v); }
  function isOverridden(f) { var v = getPath(saved, f.key); return v !== undefined && !eq(v, f.default); }
  function cur(f) { return f.key in edits ? edits[f.key] : eff(f); }
  function isChanged(f) { return f.key in edits && !eq(edits[f.key], eff(f)); }
  function changedFields() { return fields.filter(isChanged); }

  function fmt(f, v) {
    if (v === undefined || v === null || v === "") return "(trống)";
    if (typeof v === "boolean") return v ? "Bật" : "Tắt";
    if (f.type === "enum") {
      var o = (f.options || []).filter(function (x) { return x.v === v; })[0];
      return o ? o.label : String(v);
    }
    if (f.type === "list") return "[" + v.join(", ") + "]";
    if (f.type === "table") { var s = JSON.stringify(v); return v.length + " dòng " + (s.length > 140 ? s.slice(0, 140) + "…" : s); }
    return String(v);
  }

  // ---------- kiểm tra giá trị ----------
  function parseScalar(spec, raw) {
    var t = spec.type;
    if (t === "int" || t === "number") {
      var s = String(raw).trim().replace(",", ".");
      if (s === "") return { err: "Nhập một số." };
      var n = Number(s);
      if (!isFinite(n)) return { err: "Không phải số." };
      if (t === "int" && Math.floor(n) !== n) return { err: "Phải là số nguyên." };
      if (spec.min != null && n < spec.min) return { err: "Nhỏ hơn mức tối thiểu " + spec.min + "." };
      if (spec.max != null && n > spec.max) return { err: "Lớn hơn mức tối đa " + spec.max + "." };
      return { v: n };
    }
    return { v: raw };
  }
  function parseList(f, raw) {
    var parts = String(raw).split(",").map(function (s) { return s.trim(); }).filter(function (s) { return s !== ""; });
    var numeric = (f.items || (typeof (f.default || [])[0] === "string" ? "string" : "number")) !== "string";
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      if (!numeric) { out.push(parts[i]); continue; }
      var r = parseScalar({ type: "number", min: f.min, max: f.max }, parts[i]);
      if (r.err) return { err: "Phần tử " + (i + 1) + ": " + r.err };
      out.push(r.v);
    }
    return { v: out };
  }

  // ---------- ô nhập ----------
  function unitEl(spec) { return spec.unit ? h("span", { class: "dz-unit", text: spec.unit }) : null; }

  // Ô đơn (cho cả field thường lẫn ô trong bảng). cb(value) khi hợp lệ; errId để ghi lỗi.
  function scalarCell(spec, value, errId, cb) {
    var errEl = h("div", { class: "dz-cell__err", hidden: true });
    var ctl, wrap;
    function fail(msg) {
      if (msg) errors[errId] = msg; else delete errors[errId];
      errEl.textContent = msg || ""; errEl.hidden = !msg;
      wrap.classList.toggle("is-invalid", !!msg);
      refreshBar();
    }
    if (spec.type === "bool") {
      ctl = h("input", { type: "checkbox", class: "dz-switch" });
      ctl.checked = !!value;
      ctl.addEventListener("change", function () { cb(ctl.checked); });
    } else if (spec.type === "enum") {
      ctl = h("select", { class: "dz-input" });
      (spec.options || []).forEach(function (o) { ctl.appendChild(h("option", { value: o.v, text: o.label })); });
      ctl.value = value;
      ctl.addEventListener("change", function () { cb(ctl.value); });
    } else {
      ctl = h("input", { type: "text", class: "dz-input" + (spec.type === "text" ? "" : " dz-input--num"),
        inputmode: spec.type === "text" ? null : "decimal" });
      ctl.value = spec.type === "list" ? (value || []).join(", ") : (value == null ? "" : value);
      ctl.addEventListener("input", function () {
        var r = spec.type === "list" ? parseList(spec, ctl.value) : parseScalar(spec, ctl.value);
        if (r.err) { fail(r.err); return; }
        fail(null); cb(r.v);
      });
    }
    wrap = h("div", { class: "dz-cell" }, h("div", { class: "dz-cell__box" }, ctl, unitEl(spec)), errEl);
    return wrap;
  }

  function tableCtl(f) {
    var rows = clone(cur(f)) || [];
    var box = h("div", { class: "dz-sub" });
    function emit() { setEdit(f, clone(rows)); }
    function draw() {
      box.innerHTML = "";
      var head = h("tr", null, h("th", { class: "dz-sub__n", text: "#" }));
      f.columns.forEach(function (c) { head.appendChild(h("th", { text: c.label + (c.unit ? " (" + c.unit + ")" : "") })); });
      head.appendChild(h("th", { text: "" }));
      var tb = h("tbody");
      rows.forEach(function (row, ri) {
        var tr = h("tr", { "data-row": ri }, h("td", { class: "dz-sub__n", text: String(ri + 1) }));
        f.columns.forEach(function (c) {
          var id = f.key + "#" + ri + "." + c.key;
          var cell = scalarCell(c, row[c.key], id, function (v) { row[c.key] = v; emit(); });
          tr.appendChild(h("td", { "data-col": c.key }, cell));
        });
        var del = h("button", { type: "button", class: "btn btn--ghost gc-rowbtn", "data-act": "del", text: "Xoá" });
        del.addEventListener("click", function () {
          rows.splice(ri, 1);
          Object.keys(errors).forEach(function (k) { if (k.indexOf(f.key + "#") === 0) delete errors[k]; });
          draw(); emit();
        });
        tr.appendChild(h("td", null, del));
        tb.appendChild(tr);
      });
      var add = h("button", { type: "button", class: "btn btn--ghost", "data-act": "add", text: "+ Thêm dòng" });
      add.addEventListener("click", function () {
        var nr = {};
        f.columns.forEach(function (c) {
          nr[c.key] = c.type === "text" ? "" : c.type === "bool" ? false
            : c.type === "enum" ? ((c.options || [])[0] || {}).v : (c.min != null ? c.min : 0);
        });
        rows.push(nr); draw(); emit();
      });
      box.appendChild(h("table", { class: "dz-sub__table" }, h("thead", null, head), tb));
      box.appendChild(h("div", { class: "dz-sub__add" }, add));
    }
    draw();
    return box;
  }

  function fieldRow(f) {
    var control;
    if (f.type === "table") control = h("div", { class: "dz-cell dz-cell--wide" }, tableCtl(f));
    else control = scalarCell(f, cur(f), f.key, function (v) { setEdit(f, v); });
    control.classList.add("gc-cell");
    control.setAttribute("data-k", f.key);
    var old = h("div", { class: "dz-cell__old", hidden: true });
    var dflt = h("div", { class: "gc-def" });
    var reset = h("button", { type: "button", class: "btn btn--ghost gc-reset", "data-act": "reset", text: "về mặc định" });
    reset.addEventListener("click", function () {
      Object.keys(errors).forEach(function (k) { if (k === f.key || k.indexOf(f.key + "#") === 0) delete errors[k]; });
      setEdit(f, def(f));
      renderPane();
    });
    var badge = h("span", { class: "gc-badge", hidden: true, text: "đang ghi đè" });
    var label = h("div", { class: "dz-fld__label" }, f.label, badge);
    var ctl = h("div", { class: "dz-fld__ctl" }, control, old, dflt, reset,
      f.help ? h("p", { class: "dz-help", text: f.help }) : null);
    var row = h("div", { class: "dz-fld" + (f.type === "table" ? " dz-fld--wide" : ""), "data-field": f.key }, label, ctl);
    f._p = { control: control, old: old, dflt: dflt, reset: reset, badge: badge };
    refreshCell(f);
    return row;
  }

  function refreshCell(f) {
    var p = f._p; if (!p) return;
    var ch = isChanged(f), ov = isOverridden(f);
    p.control.classList.toggle("is-changed", ch);
    p.control.classList.toggle("is-override", ov);
    p.badge.hidden = !ov;
    p.old.hidden = !ch;
    if (ch) p.old.textContent = "đang lưu: " + fmt(f, eff(f));
    p.dflt.textContent = "mặc định: " + fmt(f, f.default);
    p.reset.hidden = eq(cur(f), f.default);
  }

  function setEdit(f, v) {
    if (eq(v, eff(f))) delete edits[f.key]; else edits[f.key] = v;
    refreshCell(f); refreshBar();
  }

  // ---------- thanh dưới + điều hướng ----------
  function refreshBar() {
    var n = changedFields().length, bad = Object.keys(errors).length;
    $("dz-bar").hidden = n === 0 && bad === 0;
    $("dz-bar-count").textContent = n + " thay đổi chưa lưu" + (bad ? " · " + bad + " ô sai" : "");
    schema.tabs.forEach(function (t) {
      var d = document.querySelector('#dz-nav [data-tab="' + t.id + '"] .dz-dot');
      if (d) d.hidden = !t.fields.some(isChanged);
    });
  }
  function buildNav() {
    var nav = $("dz-nav"), sel = $("dz-select");
    nav.innerHTML = ""; sel.innerHTML = "";
    schema.tabs.concat([{ id: "history", label: "Lịch sử" }]).forEach(function (t) {
      var b = h("button", { type: "button", class: "dz-nav__item", "data-tab": t.id },
        h("span", { class: "dz-nav__title", text: t.label }), t.id === "history" ? null : h("span", { class: "dz-dot", hidden: true }));
      b.addEventListener("click", function () { go(t.id); });
      nav.appendChild(b);
      sel.appendChild(h("option", { value: t.id, text: t.label }));
    });
    sel.addEventListener("change", function () { go(sel.value); });
  }
  function go(id) {
    active = id;
    document.querySelectorAll("#dz-nav .dz-nav__item").forEach(function (b) { b.classList.toggle("is-active", b.dataset.tab === id); });
    $("dz-select").value = id;
    renderPane();
  }
  function renderPane() {
    var pane = $("dz-pane"); pane.innerHTML = "";
    if (active === "history") return renderHistory(pane);
    var t = schema.tabs.filter(function (x) { return x.id === active; })[0];
    pane.appendChild(h("div", { class: "dz-pane__head" }, h("h2", { class: "dz-pane__title", text: t.label }),
      t.blurb ? h("p", { class: "dz-pane__blurb", text: t.blurb }) : null));
    var form = h("div", { class: "dz-form" });
    t.fields.forEach(function (f) { form.appendChild(fieldRow(f)); });
    pane.appendChild(form);
    refreshBar();
  }

  // ---------- lịch sử ----------
  function countOverrides(data) { return fields.filter(function (f) { return getPath(data || {}, f.key) !== undefined; }).length; }
  function renderHistory(pane) {
    pane.appendChild(h("div", { class: "dz-pane__head" }, h("h2", { class: "dz-pane__title", text: "Lịch sử lưu" }),
      h("p", { class: "dz-pane__blurb", text: HIST_LIMIT + " lần lưu gần nhất. Khôi phục thay bản ghi đè hiện tại bằng bản đó và tự thành một lần lưu mới." })));
    var box = h("div", null, h("p", { class: "dz-loading", text: "Đang tải lịch sử…" }));
    pane.appendChild(box);
    rest("GET", "game_config_history?game_id=eq." + encodeURIComponent(GAME) +
      "&select=id,data,version,saved_at,saved_by&order=saved_at.desc,id.desc&limit=" + HIST_LIMIT).then(function (r) {
      box.innerHTML = "";
      if (!r.ok) { box.appendChild(h("p", { class: "dz-cell__err", text: explain(r, "game_config_history") })); return; }
      if (!r.data.length) { box.appendChild(h("p", { class: "dz-loading", text: "Chưa có lần lưu nào." })); return; }
      var ul = h("ul", { class: "gc-hist" });
      r.data.forEach(function (e) {
        var btn = h("button", { type: "button", class: "btn btn--ghost", "data-act": "restore", text: "khôi phục bản này" });
        btn.addEventListener("click", function () { confirmRestore(e); });
        ul.appendChild(h("li", { "data-hid": e.id },
          h("div", { class: "gc-hist__meta" },
            h("strong", { text: "Bản " + e.version }), " · " + new Date(e.saved_at).toLocaleString("vi-VN"),
            h("span", { class: "gc-hist__sub", text: countOverrides(e.data) + " khoá ghi đè · bởi " + (e.saved_by ? String(e.saved_by).slice(0, 8) : "không rõ") })),
          btn));
      });
      box.appendChild(ul);
    });
  }

  // ---------- hộp thoại ----------
  function dialog(title, bodyEls, confirmText, onConfirm) {
    var d = $("dz-dialog");
    d.innerHTML = "";
    var status = h("p", { class: "dz-dialog__status" });
    var ok = h("button", { type: "button", class: "btn btn--primary", id: "gc-confirm", text: confirmText });
    var no = h("button", { type: "button", class: "btn btn--ghost", id: "gc-cancel", text: "Đóng" });
    no.addEventListener("click", function () { d.close(); });
    ok.addEventListener("click", function () {
      ok.disabled = true; status.className = "dz-dialog__status"; status.textContent = "Đang lưu…";
      onConfirm().then(function (msg) {
        if (msg === true) { d.close(); return; }
        ok.disabled = false; status.className = "dz-dialog__status is-error"; status.textContent = msg;
      });
    });
    d.appendChild(h("h2", { id: "dz-dialog-title", text: title }));
    bodyEls.forEach(function (e) { d.appendChild(e); });
    d.appendChild(status);
    d.appendChild(h("div", { class: "dz-dialog__actions" }, no, ok));
    d.showModal();
  }

  function review() {
    var bad = Object.keys(errors).length;
    if (bad) { toast("Còn " + bad + " ô sai, sửa xong mới lưu được."); return; }
    var ch = changedFields();
    if (!ch.length) return;
    var ul = h("ul", { class: "dz-changes" });
    ch.forEach(function (f) {
      var toDef = eq(edits[f.key], f.default);
      ul.appendChild(h("li", { "data-k": f.key },
        h("strong", { text: f.label }), " ", h("span", { class: "gc-val", text: "(" + f.key + ")" }), ": ",
        h("span", { class: "gc-val", text: fmt(f, eff(f)) }), " → ",
        h("span", { class: "gc-val", text: fmt(f, edits[f.key]) + (toDef ? " (về mặc định, bỏ ghi đè)" : "") })));
    });
    dialog("Xem lại " + ch.length + " thay đổi", [ul], "Lưu lên Supabase", save);
  }

  function upsert(data) {
    return rest("POST", "game_config?on_conflict=game_id", { game_id: GAME, data: data },
      "resolution=merge-duplicates,return=representation").then(function (r) {
      if (!r.ok) return explain(r);
      var row = Array.isArray(r.data) ? r.data[0] : r.data;
      saved = clone((row && row.data) || data) || {};
      edits = {}; errors = {};
      renderPane(); refreshBar();
      return true;
    });
  }
  // Đọc lại hàng mới nhất ngay trước khi lưu để không đè thay đổi của admin khác.
  function save() {
    return loadRow().then(function (r) {
      if (r.err) return r.err;
      var next = clone(r.data) || {};
      changedFields().forEach(function (f) {
        var v = edits[f.key];
        if (eq(v, f.default)) delPath(next, f.key); else setPath(next, f.key, clone(v));
      });
      return upsert(next).then(function (res) { if (res === true) toast("Đã lưu."); return res; });
    });
  }
  function confirmRestore(e) {
    var nEdit = changedFields().length;
    var p = h("p", { text: "Khôi phục bản " + e.version + " (" + new Date(e.saved_at).toLocaleString("vi-VN") + ", " +
      countOverrides(e.data) + " khoá ghi đè). Bản ghi đè hiện tại bị thay bằng bản này" +
      (nEdit ? "; " + nEdit + " thay đổi chưa lưu sẽ bị bỏ." : ".") });
    dialog("Khôi phục bản " + e.version, [p], "Khôi phục", function () {
      return upsert(clone(e.data) || {}).then(function (res) {
        if (res === true) { toast("Đã khôi phục bản " + e.version + "."); go("history"); }
        return res;
      });
    });
  }

  // ---------- nạp dữ liệu ----------
  function loadRow() {
    return rest("GET", "game_config?game_id=eq." + encodeURIComponent(GAME) + "&select=data,version,updated_at").then(function (r) {
      if (!r.ok) return { err: explain(r) };
      var row = (r.data || [])[0];
      return { data: row ? row.data : {}, version: row ? row.version : 0 };
    });
  }
  function loadSchema() {
    return fetch("games/" + encodeURIComponent(GAME) + "/config.schema.json", { cache: "no-cache" }).then(function (res) {
      if (!res.ok) throw new Error("Không tìm thấy games/" + GAME + "/config.schema.json (mã " + res.status + ").");
      return res.json();
    });
  }

  function init() {
    if (!(cfg.url && cfg.anonKey)) { banner("Chưa cấu hình Supabase (js/supabase-config.js), trang này chưa lưu được."); $("dz-pane").innerHTML = ""; return; }
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(GAME)) { banner("Mã game '" + GAME + "' không hợp lệ."); $("dz-pane").innerHTML = ""; return; }
    $("btn-discard").addEventListener("click", function () { edits = {}; errors = {}; renderPane(); refreshBar(); });
    $("btn-review").addEventListener("click", review);
    window.addEventListener("beforeunload", function (ev) { if (schema && changedFields().length) { ev.preventDefault(); ev.returnValue = ""; } });
    Promise.all([loadSchema(), loadRow()]).then(function (res) {
      schema = res[0];
      if (!schema || !Array.isArray(schema.tabs)) throw new Error("config.schema.json sai dạng: thiếu mảng tabs.");
      schema.tabs.forEach(function (t) { t.fields.forEach(function (f) { fields.push(f); }); });
      document.title = "Thông số " + (schema.game || GAME);
      $("gc-title").textContent = "Thông số game " + (schema.game || GAME);
      if (res[1].err) banner(res[1].err); else saved = res[1].data || {};
      buildNav();
      go(schema.tabs[0].id);
    }).catch(function (e) {
      banner(e.message || String(e));
      $("dz-pane").innerHTML = "";
    });
  }

  init();
})();
