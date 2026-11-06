/*
 * Trang báo lỗi / góp ý (feedback.html): chọn game, gửi phiếu kèm ảnh, xem status phiếu.
 * Phần gọi Supabase và ngôn ngữ ở js/feedback-core.js. Status chỉ đổi ở feedback-admin.html hoặc tools/feedback.js.
 */
(function () {
  "use strict";

  var FB = window.FB, t = FB.t, el = FB.el;

  FB.strings({
    en: {
      docTitle: "Bug reports & feedback · Game Hub",
      pageTitle: "Bug reports & feedback",
      subtitle: "Pick a game and tell us what happened. Fixed reports get closed with a note.",
      back: "← Back to games",
      newTicket: "New report",
      game: "Game",
      kind: "Type",
      kindBug: "🐞 Bug",
      kindFeedback: "💡 Feedback",
      titleLabel: "Title",
      titlePh: "e.g. Boat gets stuck on the west rocks",
      bodyLabel: "Details",
      hintBug: "What were you doing, what happened, what did you expect? Can you repeat it?",
      hintFeedback: "What should the game add, remove or change, and why?",
      autoEnv: "Your browser and screen size are attached automatically.",
      shotsLabel: "Screenshots (up to 3)",
      addShots: "📎 Add images",
      shotsHint: "or paste (Ctrl+V) / drag & drop",
      removeShot: "Remove image",
      tooMany: "Up to 3 images per report.",
      notImage: "{0} is not an image.",
      nameLabel: "Your name",
      namePh: "Leave blank to show as Guest",
      submit: "Send report",
      sending: "Sending…",
      uploading: "Uploading image {0}/{1}…",
      sent: "Report #{0} sent. Thank you!",
      titleShort: "The title needs at least 3 characters.",
      sendFailed: "Could not send: {0}",
      listTitle: "Reports",
      allGames: "All games",
      tabActive: "Open",
      tabDone: "Closed",
      tabAll: "All",
      empty: "No reports here yet.",
      emptyGame: "No reports for {0} here yet."
    },
    vi: {
      docTitle: "Báo lỗi & góp ý · Game Hub",
      pageTitle: "Báo lỗi & góp ý",
      subtitle: "Chọn game, kể lại chuyện gì xảy ra. Phiếu nào sửa xong sẽ được đóng kèm ghi chú.",
      back: "← Về trang chơi",
      newTicket: "Gửi phiếu mới",
      game: "Game",
      kind: "Loại",
      kindBug: "🐞 Báo lỗi",
      kindFeedback: "💡 Góp ý",
      titleLabel: "Tiêu đề",
      titlePh: "Ví dụ: Thuyền kẹt ở bãi đá phía tây",
      bodyLabel: "Chi tiết",
      hintBug: "Bạn đang làm gì, thấy gì, lẽ ra phải thấy gì? Lặp lại được không?",
      hintFeedback: "Muốn game thêm, bớt hay đổi gì, và vì sao?",
      autoEnv: "Trình duyệt và cỡ màn hình được gửi kèm tự động.",
      shotsLabel: "Ảnh chụp (tối đa 3)",
      addShots: "📎 Thêm ảnh",
      shotsHint: "hoặc dán (Ctrl+V) / kéo thả vào",
      removeShot: "Bỏ ảnh",
      tooMany: "Mỗi phiếu tối đa 3 ảnh.",
      notImage: "{0} không phải ảnh.",
      nameLabel: "Tên bạn",
      namePh: "Để trống thì hiện là Khách",
      submit: "Gửi phiếu",
      sending: "Đang gửi…",
      uploading: "Đang tải ảnh {0}/{1}…",
      sent: "Đã gửi phiếu #{0}. Cảm ơn bạn!",
      titleShort: "Tiêu đề cần ít nhất 3 ký tự.",
      sendFailed: "Gửi không được: {0}",
      listTitle: "Phiếu đã gửi",
      allGames: "Mọi game",
      tabActive: "Đang mở",
      tabDone: "Đã đóng",
      tabAll: "Tất cả",
      empty: "Chưa có phiếu nào ở mục này.",
      emptyGame: "Chưa có phiếu nào cho {0} ở mục này."
    }
  });

  var TABS = [["active", "tabActive"], ["done", "tabDone"], ["all", "tabAll"]];
  var MAX_SHOTS = 3;
  var MAX_SIDE = 1600;
  var DEFAULT_GAME = "repo2d-unity";
  var GAME_KEY = "hub.feedback.game";

  // msg giữ khoá chuỗi + tham số, để đổi ngôn ngữ thì dòng thông báo đổi theo.
  var state = { tickets: [], tab: "active", allGames: false, ready: false, shots: [], error: null, msg: null };

  var $ = function (id) { return document.getElementById(id); };
  var form = $("fb-form"), gameSel = $("fb-game"), thumb = $("fb-game-thumb");
  var titleIn = $("fb-title"), bodyIn = $("fb-body"), nameIn = $("fb-name");
  var submitBtn = $("fb-submit"), msgEl = $("fb-msg"), banner = $("fb-banner");
  var shotInput = $("fb-shot-input"), shotList = $("fb-shot-list"), shotAdd = $("fb-shot-add");

  function say(ok, key) {
    state.msg = key ? { ok: ok, args: Array.prototype.slice.call(arguments, 1) } : null;
    renderMsg();
  }

  function renderMsg() {
    msgEl.textContent = state.msg ? t.apply(null, state.msg.args) : "";
    msgEl.className = "fb-msg " + (state.msg && !state.msg.ok ? "fb-msg--err" : "fb-msg--ok");
  }

  function showBanner(err) {
    state.error = err;
    banner.hidden = false;
    banner.textContent = FB.errorText(err);
    submitBtn.disabled = err.kind !== "http";
  }

  // ---- Screenshots --------------------------------------------------------------
  // Ảnh điện thoại thường 3-5 MB; thu về tối đa 1600px để vừa giới hạn 1.5 MB của bucket.
  function compress(file) {
    return createImageBitmap(file).then(function (bmp) {
      var k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
      var c = document.createElement("canvas");
      c.width = Math.round(bmp.width * k);
      c.height = Math.round(bmp.height * k);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      return new Promise(function (resolve) {
        c.toBlob(function (b) {
          if (b && b.type === "image/webp") resolve(b);
          else c.toBlob(resolve, "image/jpeg", 0.85);
        }, "image/webp", 0.85);
      });
    });
  }

  function addShots(files) {
    var list = Array.prototype.filter.call(files || [], function (f) {
      if (/^image\//.test(f.type)) return true;
      say(false, "notImage", f.name);
      return false;
    });
    if (state.shots.length + list.length > MAX_SHOTS) {
      say(false, "tooMany");
      list = list.slice(0, MAX_SHOTS - state.shots.length);
    }
    return Promise.all(list.map(compress)).then(function (blobs) {
      blobs.forEach(function (b) { state.shots.push({ blob: b, url: URL.createObjectURL(b) }); });
      renderShots();
    });
  }

  function renderShots() {
    shotList.textContent = "";
    state.shots.forEach(function (s, i) {
      var li = el("li", "fb-shot");
      var img = el("img");
      img.src = s.url;
      img.alt = "";
      var x = el("button", "fb-shot__x", "×");
      x.type = "button";
      x.title = t("removeShot");
      x.setAttribute("aria-label", t("removeShot"));
      x.addEventListener("click", function () {
        URL.revokeObjectURL(s.url);
        state.shots.splice(i, 1);
        renderShots();
      });
      li.appendChild(img);
      li.appendChild(x);
      shotList.appendChild(li);
    });
    shotAdd.hidden = state.shots.length >= MAX_SHOTS;
  }

  function clearShots() {
    state.shots.forEach(function (s) { URL.revokeObjectURL(s.url); });
    state.shots = [];
    renderShots();
  }

  // ---- Rendering --------------------------------------------------------------
  function render() {
    FB.applyStatic();
    Array.prototype.forEach.call(gameSel.options, function (o) { o.textContent = FB.gameTitle(o.value); });
    var kind = form.elements.namedItem("kind").value;
    bodyIn.placeholder = t(kind === "bug" ? "hintBug" : "hintFeedback") + "\n" + t("autoEnv");
    if (state.error) banner.textContent = FB.errorText(state.error);
    renderMsg();
    renderShots();
    renderList();
  }

  function selectedGame() { return FB.game(gameSel.value) || FB.GAMES[0]; }

  function renderGamePicker() {
    FB.GAMES.forEach(function (g) {
      var o = el("option");
      o.value = g.id;
      gameSel.appendChild(o);
    });
    var want = new URLSearchParams(location.search).get("game") || FB.store(GAME_KEY) || DEFAULT_GAME;
    if (FB.game(want)) gameSel.value = want;
  }

  function syncGame() {
    var g = selectedGame();
    thumb.src = g.thumbnail || "assets/favicon.svg";
    FB.store(GAME_KEY, g.id);
    renderList();
  }

  function visibleTickets(tab) {
    var gid = selectedGame().id;
    return state.tickets.filter(function (x) {
      if (!state.allGames && x.game_id !== gid) return false;
      return tab === "all" || FB.GROUP[x.status] === tab;
    });
  }

  function renderTabs() {
    var wrap = $("fb-tabs");
    wrap.textContent = "";
    TABS.forEach(function (tab) {
      var b = el("button", "fb-tab" + (state.tab === tab[0] ? " is-active" : ""), t(tab[1]) + " · " + visibleTickets(tab[0]).length);
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(state.tab === tab[0]));
      b.addEventListener("click", function () { state.tab = tab[0]; renderList(); });
      wrap.appendChild(b);
    });
  }

  function renderItem(x) {
    var li = el("li", "fb-item fb-item--" + x.status);
    var det = el("details");
    var sum = el("summary");
    var meta = el("div", "fb-item__meta");
    var shots = x.shots || [];
    meta.appendChild(el("span", "fb-chip fb-chip--" + x.status, t(x.status)));
    meta.appendChild(el("span", "fb-item__id", FB.KIND_ICON[x.kind] + " #" + x.id + (shots.length ? "  🖼 " + shots.length : "")));
    if (state.allGames) meta.appendChild(el("span", "fb-item__game", FB.gameTitle(x.game_id)));
    meta.appendChild(el("span", "fb-item__when", (x.reporter_name || t("guest")) + " · " + FB.fmtDate(x.created_at)));
    sum.appendChild(meta);
    sum.appendChild(el("span", "fb-item__title", x.title));
    det.appendChild(sum);
    det.appendChild(el("p", "fb-item__body", x.body || t("noBody")));
    if (shots.length) det.appendChild(FB.shotLinks(shots));
    li.appendChild(det);
    if (x.resolution) li.appendChild(el("p", "fb-item__res", "↳ " + x.resolution));
    return li;
  }

  function renderList() {
    if (!state.ready) return;
    renderTabs();
    var list = $("fb-items");
    list.textContent = "";
    var rows = visibleTickets(state.tab);
    if (!rows.length) {
      list.appendChild(el("li", "fb-empty", state.allGames ? t("empty") : t("emptyGame", FB.gameTitle(selectedGame().id))));
      return;
    }
    rows.forEach(function (x) { list.appendChild(renderItem(x)); });
  }

  // ---- Submit -----------------------------------------------------------------
  function submit(ev) {
    ev.preventDefault();
    var title = titleIn.value.trim();
    if (title.length < 3) { say(false, "titleShort"); titleIn.focus(); return; }
    var g = selectedGame();
    var shots = state.shots.slice();
    submitBtn.disabled = true;

    var uploads = shots.reduce(function (chain, s, i) {
      return chain.then(function (paths) {
        say(true, "uploading", i + 1, shots.length);
        var path = g.id + "/" + crypto.randomUUID() + (s.blob.type === "image/webp" ? ".webp" : ".jpg");
        return FB.uploadShot(path, s.blob).then(function (p) { return paths.concat(p); });
      });
    }, Promise.resolve([]));

    uploads.then(function (paths) {
      say(true, "sending");
      return FB.api("POST", "hub_feedback?select=" + FB.COLUMNS, {
        game_id: g.id,
        kind: form.elements.namedItem("kind").value,
        title: title,
        body: bodyIn.value.trim(),
        reporter_name: nameIn.value.trim() || null,
        shots: paths,
        env: {
          ua: navigator.userAgent.slice(0, 300),
          screen: innerWidth + "x" + innerHeight + "@" + (window.devicePixelRatio || 1),
          rev: g.rev || null,
          lang: FB.lang()
        }
      });
    }).then(function (data) {
      var row = data[0];
      state.tickets.unshift(row);
      state.tab = "active";
      titleIn.value = "";
      bodyIn.value = "";
      clearShots();
      say(true, "sent", row.id);
      renderList();
    }, function (err) {
      if (err.kind === "http") say(false, "sendFailed", err.message);
      else { say(true); showBanner(err); }
    }).then(function () {
      if (banner.hidden) submitBtn.disabled = false;
    });
  }

  function load() {
    return FB.api("GET", "hub_feedback?select=" + FB.COLUMNS + "&order=id.desc&limit=500").then(function (rows) {
      state.tickets = rows;
    }, showBanner).then(function () {
      state.ready = true;
      renderList();
    });
  }

  // ---- Wiring -----------------------------------------------------------------
  var session = window.HubSession && window.HubSession.get();
  if (session && session.kind === "member") nameIn.value = (session.name || "").slice(0, 40);

  renderGamePicker();
  render();
  syncGame();

  FB.bindLangSwitch($("fb-lang"), render);
  gameSel.addEventListener("change", syncGame);
  form.addEventListener("change", function (e) {
    if (e.target.name === "kind") render();
    if (e.target === shotInput) addShots(shotInput.files).then(function () { shotInput.value = ""; });
  });
  form.addEventListener("submit", submit);
  form.addEventListener("dragover", function (e) { e.preventDefault(); });
  form.addEventListener("drop", function (e) {
    e.preventDefault();
    addShots(e.dataTransfer && e.dataTransfer.files);
  });
  document.addEventListener("paste", function (e) {
    var files = Array.prototype.map.call((e.clipboardData && e.clipboardData.items) || [], function (it) {
      return it.kind === "file" ? it.getAsFile() : null;
    }).filter(function (f) { return f && /^image\//.test(f.type); });
    if (files.length) { e.preventDefault(); addShots(files); }
  });
  $("fb-all-games").addEventListener("change", function (e) { state.allGames = e.target.checked; renderList(); });
  load();
})();
