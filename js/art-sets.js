/*
 * Trang xem và duyệt bộ art họa sĩ (art-sets.html, ?set=<id> cho chi tiết).
 * Dữ liệu: bảng public.art_sets + bucket artsets (db/art-sets.sql). Hợp đồng: docs/art-sets-contract.md
 * (repo Meta). Ai đăng nhập cũng xem được; nút Duyệt/Từ chối chỉ hiện cho role admin trong session,
 * còn quyền thật do RLS (is_admin()) quyết định.
 * Ảnh gốc trong game không nằm trong repo hub nên chỉ hiện ảnh mới + đường dẫn khoá.
 */
(function () {
  "use strict";

  var GAME_URL = "games/boohaul/";
  var STATUS_TEXT = { submitted: "Chờ duyệt", approved: "Đã duyệt", rejected: "Từ chối", pulled: "Đã kéo về repo" };

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
  function toast(msg) {
    var t = h("div", { class: "dz-toast", text: msg });
    $("dz-toasts").appendChild(t);
    setTimeout(function () { t.classList.add("is-out"); }, 2600);
    setTimeout(function () { t.remove(); }, 3000);
  }
  function banner(msg) { var b = $("as-banner"); b.textContent = msg || ""; b.hidden = !msg; }
  function fmtDate(s) {
    var d = new Date(s);
    if (isNaN(d)) return "";
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear() + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  // ---------- Supabase REST ----------
  var cfg = window.SUPABASE_CONFIG || {};
  function base() { return String(cfg.url || "").replace(/\/+$/, ""); }
  function accessToken() {
    var s = window.HubSession && window.HubSession.get();
    if (s && window.HubSession.isExpired && window.HubSession.isExpired() && window.HubAuth) {
      return window.HubAuth.refresh(s).then(function (r) {
        if (r && r.ok) { window.HubSession.set(r.session); return r.session.accessToken; }
        return s.accessToken;
      });
    }
    return Promise.resolve(s && s.accessToken);
  }
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
  function explain(r) {
    if (r.status === 0) return "Không nối được Supabase, kiểm tra mạng rồi thử lại.";
    if (r.status === 404 || r.code === "PGRST205" || r.code === "42P01")
      return "Chưa có bảng art_sets trên Supabase, chạy db/art-sets.sql trong SQL editor.";
    if (r.status === 401) return "Phiên đăng nhập hết hạn, đăng nhập lại rồi mở lại trang.";
    if (r.status === 403 || r.code === "42501") return "Tài khoản không phải admin nên không duyệt được.";
    var m = r.data && (r.data.message || r.data.error);
    return "Supabase trả lỗi " + r.status + (m ? ": " + m : ".");
  }
  function imgUrl(file) {
    return base() + "/storage/v1/object/public/artsets/" + String(file).split("/").map(encodeURIComponent).join("/");
  }
  function amAdmin() {
    var s = window.HubSession && window.HubSession.get();
    return !!(s && s.role === "admin");
  }

  // ---------- danh sách ----------
  var COLS = "id,title,author_name,status,base_version,items,created_at";

  function statusPill(st) {
    return h("span", { class: "as-status as-status--" + st, text: STATUS_TEXT[st] || st });
  }

  function showList() {
    history.replaceState(null, "", location.pathname);
    $("as-pane").replaceChildren(h("p", { class: "dz-loading", text: "Đang tải…" }));
    rest("GET", "art_sets?select=" + COLS + "&order=created_at.desc&limit=200").then(function (r) {
      if (!r.ok) { banner(explain(r)); $("as-pane").replaceChildren(); return; }
      banner("");
      var rows = r.data || [];
      if (!rows.length) {
        $("as-pane").replaceChildren(h("p", { class: "as-empty", text: "Chưa có bộ art nào. Họa sĩ gửi từ game DEV (bảng \"Thử art\" → \"Gửi lên hub\")." }));
        return;
      }
      var head = h("tr", null,
        h("th", { text: "Tên bộ" }), h("th", { text: "Họa sĩ" }), h("th", { text: "Ngày gửi" }),
        h("th", { text: "Trạng thái" }), h("th", { class: "as-hide-sm", text: "Bản game" }), h("th", { text: "Ảnh" }));
      var body = h("tbody");
      rows.forEach(function (s) {
        var link = h("a", { href: "?set=" + encodeURIComponent(s.id), text: s.title });
        link.addEventListener("click", function (e) { e.preventDefault(); });
        var tr = h("tr", null,
          h("td", null, link),
          h("td", { text: s.author_name || "(không rõ)" }),
          h("td", { class: "as-num", text: fmtDate(s.created_at) }),
          h("td", null, statusPill(s.status)),
          h("td", { class: "as-mono as-hide-sm", text: s.base_version || "" }),
          h("td", { class: "as-num", text: String((s.items || []).length) }));
        tr.addEventListener("click", function () { showDetail(s.id); });
        body.appendChild(tr);
      });
      $("as-pane").replaceChildren(h("table", { class: "as-table" }, h("thead", null, head), body));
    });
  }

  // ---------- chi tiết ----------
  function itemCard(it) {
    var left = h("div", { class: "as-pic" },
      h("img", { src: imgUrl(it.file), alt: it.path, loading: "lazy" }),
      h("span", null, h("b", { text: "Ảnh mới" })));
    var right = h("div", { class: "as-pic" },
      h("span", { text: it.isNew ? "Chưa có trong game" : "Ảnh gốc không tải được từ hub" }),
      h("span", { class: "as-mono", text: it.path }));
    var bits = [];
    if (it.w && it.h) bits.push(it.w + "×" + it.h);
    if (it.sha256) bits.push("sha256 " + String(it.sha256).slice(0, 10));
    if (it.meta) bits.push("khung " + it.meta.frameW + "×" + it.meta.frameH + ", " + it.meta.cols + " cột, " + it.meta.n + " khung, " + it.meta.fps + " fps");
    var title = h("h3", { text: it.path });
    if (it.isNew) title.appendChild(h("span", { class: "as-badge", text: "MỚI" }));
    return h("article", { class: "as-item" }, title, h("div", { class: "as-pair" }, left, right),
      h("div", { class: "as-cap", text: bits.join(" · ") }));
  }

  function showDetail(id) {
    history.replaceState(null, "", "?set=" + encodeURIComponent(id));
    $("as-pane").replaceChildren(h("p", { class: "dz-loading", text: "Đang tải…" }));
    rest("GET", "art_sets?select=*&id=eq." + encodeURIComponent(id)).then(function (r) {
      if (!r.ok) { banner(explain(r)); $("as-pane").replaceChildren(); return; }
      var s = r.data && r.data[0];
      if (!s) { banner("Không tìm thấy bộ art này."); showList(); return; }
      banner("");
      renderDetail(s);
    });
  }

  function renderDetail(s) {
    var back = h("button", { class: "btn btn--ghost", type: "button", text: "← Danh sách" });
    back.addEventListener("click", showList);
    var open = h("a", { class: "btn btn--primary", href: GAME_URL + "?artset=" + encodeURIComponent(s.id),
      target: "_blank", rel: "noopener", text: "Mở trong game" });
    var head = h("div", { class: "as-head" }, back, h("h2", { text: s.title }), statusPill(s.status), open);

    var meta = h("dl", { class: "as-meta" });
    [["Họa sĩ", s.author_name], ["Ngày gửi", fmtDate(s.created_at)], ["Bản game lúc gửi", s.base_version],
      ["Số ảnh", String((s.items || []).length)], ["Ghi chú của họa sĩ", s.note], ["Ghi chú duyệt", s.review_note],
      ["Commit đã kéo", s.pulled_commit]].forEach(function (kv) {
      meta.appendChild(h("dt", { text: kv[0] }));
      meta.appendChild(h("dd", { text: kv[1] || "—" }));
    });

    var actions = h("div", { class: "as-actions" });
    var cmd = "python Tools/art/artset_pull.py " + s.id;
    var copy = h("button", { class: "btn btn--ghost", type: "button", text: "Chép lệnh" });
    copy.addEventListener("click", function () {
      (navigator.clipboard ? navigator.clipboard.writeText(cmd) : Promise.reject()).then(
        function () { toast("Đã chép lệnh."); }, function () { toast("Trình duyệt chặn chép, bôi đen lệnh rồi Ctrl+C."); });
    });
    if (amAdmin()) {
      var note = h("textarea", { placeholder: "Ghi chú duyệt (hiện cho họa sĩ)", "aria-label": "Ghi chú duyệt" });
      note.value = s.review_note || "";
      var ok = h("button", { class: "btn btn--primary", type: "button", text: "Duyệt" });
      var no = h("button", { class: "btn btn--ghost", type: "button", text: "Từ chối" });
      var set = function (status) {
        ok.disabled = no.disabled = true;
        rest("PATCH", "art_sets?id=eq." + encodeURIComponent(s.id), { status: status, review_note: note.value.trim() || null },
          "return=representation").then(function (r) {
          ok.disabled = no.disabled = false;
          if (!r.ok) { banner(explain(r)); return; }
          if (!r.data || !r.data.length) { banner("Không đổi được: tài khoản không phải admin."); return; }
          banner("");
          toast(status === "approved" ? "Đã duyệt." : "Đã từ chối.");
          renderDetail(r.data[0]);
        });
      };
      ok.addEventListener("click", function () { set("approved"); });
      no.addEventListener("click", function () { set("rejected"); });
      actions.appendChild(note); actions.appendChild(ok); actions.appendChild(no);
    } else {
      actions.appendChild(h("p", { class: "as-ro", text: "Bạn chỉ xem được. Duyệt hoặc từ chối cần tài khoản admin." }));
    }
    actions.appendChild(h("div", { class: "as-cmd" }, h("span", { text: "Kéo về repo:" }), h("code", { text: cmd }), copy));

    var items = h("div", { class: "as-items" });
    (s.items || []).forEach(function (it) { items.appendChild(itemCard(it)); });
    $("as-pane").replaceChildren(head, meta, actions, items);
  }

  // ---------- khởi động ----------
  if (!(cfg.url && cfg.anonKey)) {
    banner("Hub chưa nối Supabase (js/supabase-config.js trống).");
    $("as-pane").replaceChildren();
  } else {
    var id = new URLSearchParams(location.search).get("set");
    if (id) showDetail(id); else showList();
  }
})();
