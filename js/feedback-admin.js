/*
 * Trang quản lý phiếu (feedback-admin.html): thống kê, lọc, đổi status + ghi chú, xoá phiếu rác.
 * Vào được khi đăng nhập bằng tài khoản có email trong hub_feedback_admins, hoặc dán khoá triage (lưu ở localStorage).
 * Database tự xét quyền trong fb_can_manage / fb_set_status / fb_delete; trang chỉ hỏi để biết nên hiện gì.
 */
(function () {
  "use strict";

  var FB = window.FB, t = FB.t, el = FB.el;

  FB.strings({
    en: {
      docTitle: "Feedback inbox · Game Hub",
      pageTitle: "Feedback inbox",
      subtitle: "Track every report, change its status, leave a note players can see.",
      toPublic: "Report page →",
      lock: "Forget key",
      gateTitle: "Sign in to manage reports",
      gateGuest: "Sign in with a hub admin account.",
      gateNotAdmin: "{0} is signed in, but this account is not a feedback admin.",
      signIn: "Sign in",
      switchAccount: "Use another account",
      orKey: "Or use the triage key",
      unlockNote: "Paste the content of ~/.config/survivor-hub/feedback.key. It stays in this browser only.",
      keyPh: "Triage key",
      unlock: "Unlock",
      wrongKey: "That key was rejected.",
      reload: "↻ Reload",
      searchPh: "Search title, details, name or #id",
      allGamesOpt: "All games",
      allKinds: "All types",
      bugs: "🐞 Bugs",
      ideas: "💡 Feedback",
      statActive: "Open",
      statAll: "All",
      showing: "{0} of {1} reports",
      none: "No reports match these filters.",
      env: "Environment",
      statusLabel: "Status",
      noteLabel: "Note for players",
      notePh: "e.g. a1b2c3d: fixed rock collision",
      save: "Save",
      saved: "Saved.",
      del: "Delete",
      confirmDelete: "Delete report #{0}? This cannot be undone.",
      updated: "updated {0}"
    },
    vi: {
      docTitle: "Quản lý phiếu · Game Hub",
      pageTitle: "Quản lý phiếu",
      subtitle: "Theo dõi mọi phiếu, đổi status, để lại ghi chú người chơi đọc được.",
      toPublic: "Trang gửi phiếu →",
      lock: "Quên khoá",
      gateTitle: "Đăng nhập để quản lý phiếu",
      gateGuest: "Đăng nhập bằng tài khoản admin của hub.",
      gateNotAdmin: "Đang đăng nhập bằng {0}, nhưng tài khoản này không có quyền quản lý phiếu.",
      signIn: "Đăng nhập",
      switchAccount: "Đổi tài khoản",
      orKey: "Hoặc dùng khoá triage",
      unlockNote: "Dán nội dung tệp ~/.config/survivor-hub/feedback.key. Khoá chỉ lưu trong trình duyệt này.",
      keyPh: "Khoá triage",
      unlock: "Mở khoá",
      wrongKey: "Khoá không đúng.",
      reload: "↻ Tải lại",
      searchPh: "Tìm theo tiêu đề, chi tiết, tên hoặc #id",
      allGamesOpt: "Mọi game",
      allKinds: "Mọi loại",
      bugs: "🐞 Báo lỗi",
      ideas: "💡 Góp ý",
      statActive: "Đang mở",
      statAll: "Tất cả",
      showing: "{0} / {1} phiếu",
      none: "Không có phiếu nào khớp bộ lọc.",
      env: "Môi trường",
      statusLabel: "Status",
      noteLabel: "Ghi chú cho người chơi",
      notePh: "Ví dụ: a1b2c3d: sửa va chạm đá",
      save: "Lưu",
      saved: "Đã lưu.",
      del: "Xoá",
      confirmDelete: "Xoá phiếu #{0}? Không hoàn tác được.",
      updated: "cập nhật {0}"
    }
  });

  var KEY_STORE = "hub.feedback.key";
  var STATS = [["active", "statActive"], ["open", "open"], ["doing", "doing"], ["closed", "closed"], ["wontfix", "wontfix"], ["all", "statAll"]];

  // access: "checking" → "granted" | "denied".
  var state = {
    access: "checking",
    key: FB.store(KEY_STORE),
    tickets: [],
    filter: { status: "active", game: "", kind: "", q: "" },
    expanded: {},
    drafts: {},
    notes: {},
    error: null
  };

  var $ = function (id) { return document.getElementById(id); };
  var banner = $("fb-banner"), gate = $("fa-gate"), unlockForm = $("fa-unlock"), board = $("fa-board"), lockBtn = $("fa-lock");
  var gameSel = $("fa-game"), kindSel = $("fa-kind"), search = $("fa-search");

  function showBanner(err) {
    state.error = err;
    banner.hidden = false;
    banner.textContent = FB.errorText(err);
  }

  function member() {
    var s = window.HubSession && window.HubSession.get();
    return s && s.kind === "member" ? s : null;
  }

  function fail(err) {
    if (err.kind === "key") { state.access = "denied"; return render(); }
    showBanner(err);
  }

  function setKey(key, msgKey) {
    state.key = key;
    FB.store(KEY_STORE, key);
    $("fa-key-msg").dataset.msg = msgKey || "";
  }

  // Hỏi database xem người đang xem (tài khoản đăng nhập, hoặc khoá đã lưu) có quyền không.
  function checkAccess() {
    return FB.rpc("fb_can_manage", { p_key: state.key }).then(function (ok) {
      if (!ok && state.key) setKey(null, "wrongKey");
      state.access = ok ? "granted" : "denied";
      render();
      if (ok) load();
    }, showBanner);
  }

  function renderGate() {
    var m = member();
    gate.hidden = state.access !== "denied";
    board.hidden = state.access !== "granted";
    lockBtn.hidden = !state.key;
    $("fa-who").hidden = !m;
    $("fa-who").textContent = m ? "👤 " + m.email : "";
    $("fa-gate-note").textContent = m ? t("gateNotAdmin", m.email) : t("gateGuest");
    $("fa-signin").textContent = m ? t("switchAccount") : t("signIn");
  }

  function matches(x) {
    var f = state.filter;
    if (f.status === "active" ? FB.GROUP[x.status] !== "active" : f.status !== "all" && x.status !== f.status) return false;
    if (f.game && x.game_id !== f.game) return false;
    if (f.kind && x.kind !== f.kind) return false;
    if (!f.q) return true;
    var q = f.q.toLowerCase();
    if (q.charAt(0) === "#") return String(x.id) === q.slice(1);
    return [x.title, x.body, x.reporter_name, x.resolution].join(" ").toLowerCase().indexOf(q) >= 0;
  }

  function renderStats() {
    var wrap = $("fa-stats");
    wrap.textContent = "";
    STATS.forEach(function (s) {
      var n = state.tickets.filter(function (x) {
        return s[0] === "all" || (s[0] === "active" ? FB.GROUP[x.status] === "active" : x.status === s[0]);
      }).length;
      var b = el("button", "fa-stat fa-stat--" + s[0] + (state.filter.status === s[0] ? " is-active" : ""));
      b.type = "button";
      b.setAttribute("aria-pressed", String(state.filter.status === s[0]));
      b.appendChild(el("span", "fa-stat__n", String(n)));
      b.appendChild(el("span", "fa-stat__label", t(s[1])));
      b.addEventListener("click", function () { state.filter.status = s[0]; render(); });
      wrap.appendChild(b);
    });
  }

  function renderFilters() {
    var counts = {};
    state.tickets.forEach(function (x) { counts[x.game_id] = (counts[x.game_id] || 0) + 1; });
    gameSel.textContent = "";
    var all = el("option", null, t("allGamesOpt"));
    all.value = "";
    gameSel.appendChild(all);
    Object.keys(counts).sort().forEach(function (id) {
      var o = el("option", null, FB.gameTitle(id) + " (" + counts[id] + ")");
      o.value = id;
      gameSel.appendChild(o);
    });
    gameSel.value = counts[state.filter.game] ? state.filter.game : "";
    kindSel.textContent = "";
    [["", "allKinds"], ["bug", "bugs"], ["feedback", "ideas"]].forEach(function (k) {
      var o = el("option", null, t(k[1]));
      o.value = k[0];
      kindSel.appendChild(o);
    });
    kindSel.value = state.filter.kind;
  }

  function envLine(env) {
    env = env || {};
    return [env.screen, env.rev && "rev " + env.rev, env.lang, env.ua].filter(Boolean).join(" · ") || "-";
  }

  function editor(x) {
    var d = state.drafts[x.id] || { status: x.status, resolution: x.resolution || "" };
    var box = el("div", "fa-editor");

    var stLabel = el("label", "fb-label", t("statusLabel"));
    var st = el("select", "fb-input fa-editor__status");
    FB.STATUSES.forEach(function (s) {
      var o = el("option", null, t(s));
      o.value = s;
      st.appendChild(o);
    });
    st.value = d.status;

    var noteLabel = el("label", "fb-label", t("noteLabel"));
    var note = el("textarea", "fb-input fa-editor__note");
    note.rows = 2;
    note.maxLength = 2000;
    note.placeholder = t("notePh");
    note.value = d.resolution;

    function keep() { state.drafts[x.id] = { status: st.value, resolution: note.value }; }
    st.addEventListener("change", keep);
    note.addEventListener("input", keep);

    var foot = el("div", "fa-editor__foot");
    var msg = el("span", "fb-msg fb-msg--ok", state.notes[x.id] ? t(state.notes[x.id]) : "");
    var del = el("button", "fa-del", t("del"));
    del.type = "button";
    del.addEventListener("click", function () {
      if (!window.confirm(t("confirmDelete", x.id))) return;
      FB.rpc("fb_delete", { p_id: x.id, p_key: state.key }).then(function () {
        state.tickets = state.tickets.filter(function (y) { return y.id !== x.id; });
        render();
      }, fail);
    });
    var save = el("button", "fb-submit", t("save"));
    save.type = "button";
    save.addEventListener("click", function () {
      save.disabled = true;
      FB.rpc("fb_set_status", {
        p_id: x.id, p_status: st.value, p_resolution: note.value.trim(), p_key: state.key
      }).then(function (row) {
        state.tickets = state.tickets.map(function (y) { return y.id === row.id ? row : y; });
        delete state.drafts[x.id];
        state.notes[x.id] = "saved";
        render();
      }, function (err) {
        save.disabled = false;
        fail(err);
      });
    });
    foot.appendChild(del);
    foot.appendChild(msg);
    foot.appendChild(save);

    box.appendChild(stLabel);
    box.appendChild(st);
    box.appendChild(noteLabel);
    box.appendChild(note);
    box.appendChild(foot);
    return box;
  }

  function renderItem(x) {
    var li = el("li", "fb-item fb-item--" + x.status);
    li.dataset.id = x.id;
    var det = el("details");
    det.open = !!state.expanded[x.id];
    det.addEventListener("toggle", function () { state.expanded[x.id] = det.open; });
    var sum = el("summary");
    var meta = el("div", "fb-item__meta");
    var shots = x.shots || [];
    meta.appendChild(el("span", "fb-chip fb-chip--" + x.status, t(x.status)));
    meta.appendChild(el("span", "fb-item__id", FB.KIND_ICON[x.kind] + " #" + x.id + (shots.length ? "  🖼 " + shots.length : "")));
    meta.appendChild(el("span", "fb-item__game", FB.gameTitle(x.game_id)));
    meta.appendChild(el("span", "fb-item__when", (x.reporter_name || t("guest")) + " · " + FB.fmtDate(x.created_at)));
    sum.appendChild(meta);
    sum.appendChild(el("span", "fb-item__title", x.title));
    det.appendChild(sum);
    det.appendChild(el("p", "fb-item__body", x.body || t("noBody")));
    if (shots.length) det.appendChild(FB.shotLinks(shots));
    det.appendChild(el("p", "fa-env", t("env") + ": " + envLine(x.env) + " · " + t("updated", FB.fmtDate(x.updated_at))));
    det.appendChild(editor(x));
    li.appendChild(det);
    if (x.resolution && !det.open) li.appendChild(el("p", "fb-item__res", "↳ " + x.resolution));
    return li;
  }

  function render() {
    FB.applyStatic();
    var km = $("fa-key-msg");
    if (km.dataset.msg) km.textContent = t(km.dataset.msg);
    if (state.error) banner.textContent = FB.errorText(state.error);
    renderGate();
    if (state.access !== "granted") return;
    renderStats();
    renderFilters();
    var rows = state.tickets.filter(matches);
    $("fa-count").textContent = t("showing", rows.length, state.tickets.length);
    var list = $("fa-items");
    list.textContent = "";
    if (!rows.length) list.appendChild(el("li", "fb-empty", t("none")));
    rows.forEach(function (x) { list.appendChild(renderItem(x)); });
  }

  function load() {
    return FB.api("GET", "hub_feedback?select=" + FB.COLUMNS + "&order=id.desc&limit=1000").then(function (rows) {
      // Không còn phiếu mở thì mặc định "Đang mở" ra danh sách trống, trông như trang hỏng; mở "Tất cả".
      if (!state.loaded && !rows.some(function (x) { return FB.GROUP[x.status] === "active"; })) state.filter.status = "all";
      state.loaded = true;
      state.tickets = rows;
      state.notes = {};
      render();
    }, fail);
  }

  unlockForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var key = $("fa-key").value.trim();
    if (!key) return;
    $("fa-key").value = "";
    setKey(key);
    checkAccess();
  });
  lockBtn.addEventListener("click", function () {
    setKey(null);
    state.access = "checking";
    render();
    checkAccess();
  });
  $("fa-reload").addEventListener("click", load);
  gameSel.addEventListener("change", function () { state.filter.game = gameSel.value; render(); });
  kindSel.addEventListener("change", function () { state.filter.kind = kindSel.value; render(); });
  search.addEventListener("input", function () { state.filter.q = search.value.trim(); render(); });
  FB.bindLangSwitch($("fb-lang"), render);

  render();
  // Token hết hạn thì core gửi anon key và database không nhận ra tài khoản; làm mới trước khi hỏi quyền.
  var m = member();
  if (m && window.HubAuth && window.HubSession.isExpired()) {
    window.HubAuth.refresh(m).then(function (r) {
      if (r && r.ok) window.HubSession.set(r.session);
      checkAccess();
    });
  } else {
    checkAccess();
  }
})();
