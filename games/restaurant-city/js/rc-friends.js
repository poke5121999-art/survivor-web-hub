/*
 * Bạn bè Restaurant City: tìm người chơi theo tên, gửi lời mời kết bạn, đồng ý hoặc từ chối lời mời.
 * Thay cho link mời bạn: nút mời bạn trong game (addInviteFriendsIFrame) và nút "Bạn bè" trên thanh
 * đầu trang đều mở hộp này. Server: route /friends/* của rc-rpc (tools/rpc-shims/rpc-main.ts).
 * Game chỉ đọc danh sách bạn lúc tải, nên bạn mới hiện trong game sau khi tải lại.
 */
(function () {
  "use strict";

  var opts = null;
  var LABELS = { none: "Kết bạn", sent: "Đã gửi lời mời", received: "Đồng ý", friend: "Đã là bạn" };
  var ERRORS = {
    "name too short": "Gõ ít nhất 2 ký tự của tên.",
    "player not found": "Không tìm thấy người chơi này.",
    "cannot befriend yourself": "Đây là tên của chính bạn.",
    "too many requests, try again shortly": "Bạn thao tác nhanh quá, chờ một chút rồi thử lại."
  };

  function api(method, path, query, body) {
    function send(token) {
      var url = new URL(opts.fnUrl("/friends/" + path), location.href);
      for (var k in query || {}) url.searchParams.set(k, query[k]);
      var headers = { "apikey": opts.anonKey };
      if (token) headers["Authorization"] = "Bearer " + token;
      if (body) headers["Content-Type"] = "application/json";
      return fetch(url.href, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined });
    }
    return opts.token().then(send).then(function (res) {
      if (res.status !== 401) return res;
      return opts.refresh().then(function (t) { return t ? send(t) : res; });
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) {
        if (!res.ok || !json.ok) throw new Error(ERRORS[json.error] || json.error || ("HTTP " + res.status));
        return json;
      });
    });
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function button(text, cls) {
    var b = el("button", cls || "rc-social-alt", text);
    b.type = "button";
    return b;
  }

  /** Số lời mời đang chờ, hiện trên nút "Bạn bè" của thanh đầu trang. */
  function refreshBadge() {
    if (!opts || !opts.badge) return;
    api("GET", "requests").then(function (r) {
      opts.badge.textContent = r.requests.length ? String(r.requests.length) : "";
      opts.badge.classList.toggle("hidden", !r.requests.length);
    }).catch(function () { /* thiếu badge không chặn gì */ });
  }

  /** fromGame: mở từ nút mời bạn trong game, game chờ callback lúc hộp đóng. */
  function open(fromGame) {
    var befriended = false;
    var back = el("div", "rc-social");
    back.setAttribute("role", "dialog");
    back.setAttribute("aria-modal", "true");
    var box = el("section", "rc-social-box");
    box.appendChild(el("p", "rc-social-tag", "Restaurant City"));
    box.appendChild(el("h2", null, "Bạn bè"));

    var form = el("form", "rc-friends-search");
    var input = el("input", "rc-social-url");
    input.placeholder = "Tên người chơi";
    input.setAttribute("aria-label", "Tên người chơi cần tìm");
    input.maxLength = 24;
    input.autocomplete = "off";
    var find = button("Tìm", "rc-social-go");
    find.type = "submit";
    form.appendChild(input);
    form.appendChild(find);
    box.appendChild(form);

    var status = el("p", "rc-social-note", "");
    status.setAttribute("aria-live", "polite");
    box.appendChild(status);
    var results = el("ul", "rc-friends-list");
    box.appendChild(results);

    var inboxTitle = el("h3", "rc-friends-head hidden", "Lời mời đang chờ");
    var inbox = el("ul", "rc-friends-list");
    box.appendChild(inboxTitle);
    box.appendChild(inbox);

    var row = el("div", "rc-social-row");
    var reload = button("Tải lại game để thấy bạn mới", "rc-social-go hidden");
    var close = button("Đóng");
    row.appendChild(reload);
    row.appendChild(close);
    box.appendChild(row);
    back.appendChild(box);
    document.body.appendChild(back);

    function madeFriend() {
      befriended = true;
      reload.classList.remove("hidden");
    }

    /** Một dòng người chơi; nút đổi theo trạng thái bạn bè. */
    function playerRow(name, state, list) {
      var li = el("li", "rc-friends-item");
      li.appendChild(el("span", "rc-friends-name", name));
      var act = button(LABELS[state] || LABELS.none, state === "none" || state === "received" ? "rc-social-go" : "rc-social-alt");
      act.disabled = state === "sent" || state === "friend";
      li.appendChild(act);
      var no = null;
      if (state === "received") {
        no = button("Từ chối");
        li.appendChild(no);
      }
      function settle(newState) {
        state = newState;
        act.textContent = LABELS[state];
        act.className = state === "none" ? "rc-social-go" : "rc-social-alt";
        act.disabled = state === "sent" || state === "friend";
        if (no) { no.remove(); no = null; }
        if (state === "friend") madeFriend();
        refreshBadge();
      }
      function run(call) {
        act.disabled = true;
        if (no) no.disabled = true;
        status.textContent = "";
        call.then(function (r) { settle(r.state); }).catch(function (err) {
          status.textContent = String(err && err.message || err);
          act.disabled = false;
          if (no) no.disabled = false;
        });
      }
      act.onclick = function () {
        run(state === "received"
          ? api("POST", "respond", null, { username: name, accept: true })
          : api("POST", "request", null, { username: name }));
      };
      if (no) no.onclick = function () { run(api("POST", "respond", null, { username: name, accept: false })); };
      list.appendChild(li);
    }

    function loadInbox() {
      api("GET", "requests").then(function (r) {
        inbox.textContent = "";
        inboxTitle.classList.toggle("hidden", !r.requests.length);
        r.requests.forEach(function (q) { playerRow(q.username, "received", inbox); });
      }).catch(function (err) { status.textContent = "Không tải được lời mời: " + (err && err.message || err); });
    }

    form.onsubmit = function (e) {
      e.preventDefault();
      var q = input.value.trim();
      results.textContent = "";
      if (q.length < 2) { status.textContent = ERRORS["name too short"]; return; }
      status.textContent = "Đang tìm…";
      find.disabled = true;
      api("GET", "search", { q: q }).then(function (r) {
        status.textContent = r.players.length ? "" : "Không có người chơi nào tên có \"" + q + "\".";
        r.players.forEach(function (p) { playerRow(p.username, p.state, results); });
      }).catch(function (err) {
        status.textContent = "Không tìm được: " + (err && err.message || err);
      }).then(function () { find.disabled = false; });
    };
    reload.onclick = function () { location.reload(); };
    close.onclick = function () {
      back.remove();
      if (fromGame) opts.callback(befriended);
      opts.refocus();
    };
    back.addEventListener("keydown", function (e) { if (e.key === "Escape") close.click(); });
    loadInbox();
    input.focus();
  }

  function install(options) {
    opts = options;
    window.addInviteFriendsIFrame = function () { open(true); };
    if (opts.button) {
      opts.button.classList.remove("hidden");
      opts.button.onclick = function () { open(false); };
    }
    refreshBadge();
  }

  window.RCFriends = { install: install, open: open };
})();
