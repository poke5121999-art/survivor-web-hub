/*
 * Trang báo lỗi / góp ý (feedback.html). Đọc và gửi phiếu vào bảng hub_feedback (db/feedback.sql)
 * qua REST của Supabase. Phiếu chỉ đổi status từ phía Claude, bằng tools/feedback.js.
 */
(function () {
  "use strict";

  var STATUS = {
    open: { label: "Mới", group: "active" },
    doing: { label: "Đang sửa", group: "active" },
    closed: { label: "Đã xong", group: "done" },
    wontfix: { label: "Không sửa", group: "done" }
  };
  var TABS = [
    { key: "active", label: "Đang mở" },
    { key: "done", label: "Đã đóng" },
    { key: "all", label: "Tất cả" }
  ];
  var KIND = {
    bug: { icon: "🐞", hint: "Bạn đang làm gì, thấy gì, lẽ ra phải thấy gì? Lặp lại được không?" },
    feedback: { icon: "💡", hint: "Muốn game thêm, bớt hay đổi gì, và vì sao?" }
  };
  var COLUMNS = "id,game_id,kind,title,body,status,resolution,reporter_name,created_at";
  var GAME_KEY = "hub.feedback.game";

  var GAMES = [{ id: "hub", title: "Trang hub (chung)", thumbnail: "assets/favicon.svg" }].concat(
    (window.HUB_GAMES || []).filter(function (g) { return g.status === "available"; })
  );
  var byId = {};
  GAMES.forEach(function (g) { byId[g.id] = g; });

  var state = { tickets: [], tab: "active", allGames: false, ready: false };

  var $ = function (id) { return document.getElementById(id); };
  var form = $("fb-form"), gameSel = $("fb-game"), thumb = $("fb-game-thumb");
  var titleIn = $("fb-title"), bodyIn = $("fb-body"), nameIn = $("fb-name");
  var submitBtn = $("fb-submit"), msg = $("fb-msg"), banner = $("fb-banner");

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function cfg() { return window.SUPABASE_CONFIG || {}; }

  function authToken() {
    var s = window.HubSession && window.HubSession.get();
    if (s && s.kind === "member" && s.accessToken && !window.HubSession.isExpired()) return s.accessToken;
    return cfg().anonKey;
  }

  function api(method, route, body) {
    var c = cfg();
    if (!c.url || !c.anonKey) return Promise.reject({ kind: "missing" });
    return fetch(c.url.replace(/\/+$/, "") + "/rest/v1/" + route, {
      method: method,
      headers: {
        apikey: c.anonKey,
        Authorization: "Bearer " + authToken(),
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        if (data && data.code === "PGRST205") throw { kind: "missing" };
        if (!res.ok) throw { kind: "http", message: (data && data.message) || ("Lỗi " + res.status) };
        return data;
      });
    }, function () { throw { kind: "offline" }; });
  }

  function showBanner(err) {
    banner.hidden = false;
    banner.textContent = err.kind === "missing"
      ? "Hộp thư chưa mở: chủ hub cần chạy db/feedback.sql trong Supabase."
      : err.kind === "offline"
        ? "Không kết nối được máy chủ phiếu. Kiểm tra mạng rồi tải lại trang."
        : "Máy chủ phiếu báo lỗi: " + err.message;
    submitBtn.disabled = err.kind !== "http";
  }

  function fmtDate(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }) + " " +
      d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  }

  function selectedGame() { return byId[gameSel.value] || GAMES[0]; }

  function renderGamePicker() {
    GAMES.forEach(function (g) {
      var o = el("option", null, g.title);
      o.value = g.id;
      gameSel.appendChild(o);
    });
    var want = new URLSearchParams(location.search).get("game");
    try { want = want || localStorage.getItem(GAME_KEY); } catch (e) { /* storage blocked */ }
    if (want && byId[want]) gameSel.value = want;
    syncGame();
  }

  function syncGame() {
    var g = selectedGame();
    thumb.src = g.thumbnail || "assets/favicon.svg";
    try { localStorage.setItem(GAME_KEY, g.id); } catch (e) { /* storage blocked */ }
    renderList();
  }

  function syncKind() {
    var kind = form.elements.namedItem("kind").value;
    bodyIn.placeholder = KIND[kind].hint + "\nTrình duyệt và cỡ màn hình được gửi kèm tự động.";
  }

  function renderTabs() {
    var wrap = $("fb-tabs");
    wrap.textContent = "";
    var pool = visibleTickets(null);
    TABS.forEach(function (t) {
      var n = pool.filter(function (x) { return t.key === "all" || STATUS[x.status].group === t.key; }).length;
      var b = el("button", "fb-tab" + (state.tab === t.key ? " is-active" : ""), t.label + " · " + n);
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(state.tab === t.key));
      b.addEventListener("click", function () { state.tab = t.key; renderList(); });
      wrap.appendChild(b);
    });
  }

  function visibleTickets(tab) {
    var gid = selectedGame().id;
    return state.tickets.filter(function (t) {
      if (!state.allGames && t.game_id !== gid) return false;
      return !tab || tab === "all" || STATUS[t.status].group === tab;
    });
  }

  function renderItem(t) {
    var li = el("li", "fb-item fb-item--" + t.status);
    var det = el("details");
    var sum = el("summary");
    var meta = el("div", "fb-item__meta");
    meta.appendChild(el("span", "fb-chip fb-chip--" + t.status, STATUS[t.status].label));
    meta.appendChild(el("span", "fb-item__id", KIND[t.kind].icon + " #" + t.id));
    if (state.allGames) meta.appendChild(el("span", "fb-item__game", (byId[t.game_id] || { title: t.game_id }).title));
    meta.appendChild(el("span", "fb-item__when", (t.reporter_name || "Khách") + " · " + fmtDate(t.created_at)));
    sum.appendChild(meta);
    sum.appendChild(el("span", "fb-item__title", t.title));
    det.appendChild(sum);
    det.appendChild(el("p", "fb-item__body", t.body || "(không có mô tả)"));
    li.appendChild(det);
    if (t.resolution) li.appendChild(el("p", "fb-item__res", "↳ " + t.resolution));
    return li;
  }

  function renderList() {
    if (!state.ready) return;
    renderTabs();
    var list = $("fb-items");
    list.textContent = "";
    var rows = visibleTickets(state.tab);
    if (!rows.length) {
      list.appendChild(el("li", "fb-empty", state.allGames
        ? "Chưa có phiếu nào ở mục này."
        : "Chưa có phiếu nào cho " + selectedGame().title + " ở mục này."));
      return;
    }
    rows.forEach(function (t) { list.appendChild(renderItem(t)); });
  }

  function say(text, ok) {
    msg.textContent = text;
    msg.className = "fb-msg " + (ok ? "fb-msg--ok" : "fb-msg--err");
  }

  function submit(ev) {
    ev.preventDefault();
    var title = titleIn.value.trim();
    if (title.length < 3) { say("Tiêu đề cần ít nhất 3 ký tự.", false); titleIn.focus(); return; }
    var g = selectedGame();
    var name = nameIn.value.trim();
    var row = {
      game_id: g.id,
      kind: form.elements.namedItem("kind").value,
      title: title,
      body: bodyIn.value.trim(),
      reporter_name: name || null,
      env: {
        ua: navigator.userAgent.slice(0, 300),
        screen: innerWidth + "x" + innerHeight + "@" + (window.devicePixelRatio || 1),
        rev: g.rev || null
      }
    };
    submitBtn.disabled = true;
    say("Đang gửi…", true);
    api("POST", "hub_feedback?select=" + COLUMNS, row).then(function (data) {
      var t = data[0];
      state.tickets.unshift(t);
      state.tab = "active";
      titleIn.value = "";
      bodyIn.value = "";
      say("Đã gửi phiếu #" + t.id + ". Cảm ơn bạn!", true);
      renderList();
    }, function (err) {
      if (err.kind === "http") say("Gửi không được: " + err.message, false);
      else { say("", true); showBanner(err); }
    }).then(function () {
      if (banner.hidden) submitBtn.disabled = false;
    });
  }

  function load() {
    return api("GET", "hub_feedback?select=" + COLUMNS + "&order=id.desc&limit=500").then(function (rows) {
      state.tickets = rows;
    }, showBanner).then(function () {
      state.ready = true;
      renderList();
    });
  }

  var session = window.HubSession && window.HubSession.get();
  if (session && session.kind === "member") nameIn.value = (session.name || "").slice(0, 40);

  renderGamePicker();
  syncKind();
  gameSel.addEventListener("change", syncGame);
  form.addEventListener("change", function (e) { if (e.target.name === "kind") syncKind(); });
  form.addEventListener("submit", submit);
  $("fb-all-games").addEventListener("change", function (e) { state.allGames = e.target.checked; renderList(); });
  load();
})();
