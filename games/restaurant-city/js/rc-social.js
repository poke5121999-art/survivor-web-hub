/*
 * Social link của Restaurant City trên hub: thay các khung Facebook cũ của game bằng một đường link.
 *
 * Trong game, nút tặng snack, tặng đồ, chia sẻ (đăng tường), mời bạn, xin nguyên liệu gọi ra trang qua
 * ExternalInterface (addInviteStickersIFrame, addSendGiftIFrame, addStream, addFeedSystem, addInviteFriendsIFrame).
 * Trang gửi "mẫu" đó lên rc-rpc/social-links, server gốc kiểm và tạo link (tặng đồ thì giữ món đồ trong escrow).
 * Người chơi copy link gửi bạn; bạn mở index.html?link=<slug> trên hub và bấm nhận. Server là nơi quyết định.
 * Cách tách mẫu từ lời gọi addStream theo game.html của RC Reborn (ADR-0022 của server gốc).
 */
(function () {
  "use strict";

  var SLUG = /^[A-Za-z0-9_-]{32}$/;
  var PENDING_KEY = "rc.pendingLink";

  var KINDS = {
    employeeSnack: { title: "Snack miễn phí cho nhân viên", text: function (n) { return "Nhận " + (n || "một món snack") + " cho nhân viên trong quán."; } },
    directGift: { title: "Quà từ một đầu bếp khác", text: function (n) { return "Nhận " + (n || "món quà") + ". Món đồ chuyển thẳng từ kho của người tặng."; } },
    foodKingReward: { title: "Phần thưởng Food King", text: function (n) { return "Nhận " + (n || "phần thưởng Food King") + "."; } },
    ingredientRequest: { title: "Một đầu bếp đang cần nguyên liệu", share: "người có nguyên liệu đó mở link để gửi cho bạn.", text: function (n) { return "Gửi họ 1 " + (n || "nguyên liệu") + " từ kho của bạn."; } },
    ingredientTrade: { title: "Đổi nguyên liệu", text: function () { return "Xem và đồng ý đổi nguyên liệu."; } },
    friendInvite: { title: "Lời mời kết bạn trong Restaurant City", share: "họ mở link trên hub và bấm Đồng ý.", text: function () { return "Đồng ý để hai bạn thành bạn bè trong game: thuê nhau làm nhân viên, ghé quán, gửi thư, đổi nguyên liệu."; } },
    achievement: { title: "Thành tích Restaurant City", share: "họ mở link để xem và vào chơi cùng.", text: function () { return "Một đầu bếp vừa khoe thành tích trong game."; } }
  };
  var ACTIONS = { claim: "Nhận", fulfill: "Gửi nguyên liệu", accept: "Đồng ý", join: "Tham gia", view: "Vào game" };
  var STATES = {
    expired: "Link này đã hết hạn.",
    exhausted: "Món này đã có người nhận rồi.",
    revoked: "Người tạo đã huỷ link này.",
    paused: "Link này đang tạm dừng.",
    upcoming: "Link này chưa tới giờ mở.",
    completed: "Bạn đã nhận link này rồi."
  };
  var ERRORS = {
    SELF_CLAIM: "Đây là link của chính bạn. Gửi nó cho bạn bè nhé.",
    ALREADY_DONE: "Bạn đã nhận link này rồi.",
    EXPIRED: STATES.expired, EXHAUSTED: STATES.exhausted, REVOKED: STATES.revoked, PAUSED: STATES.paused, NOT_STARTED: STATES.upcoming,
    INSUFFICIENT_INVENTORY: "Kho của bạn không có đủ nguyên liệu được xin.",
    ALREADY_OWNED: "Bạn đã có món này rồi.",
    NOT_ELIGIBLE: "Tài khoản của bạn chưa đủ điều kiện nhận link này."
  };
  var OUTCOMES = {
    claimed: "Đã nhận. Món đồ nằm trong hộp thư của quán.",
    accepted: "Xong. Hai bạn đã là bạn bè trong Restaurant City.",
    fulfilled: "Đã gửi 1 nguyên liệu cho người xin.",
    joined: "Đã ghi nhận.",
    viewed: "Mở game thôi."
  };

  var opts = null;

  function unwrap(value) {
    var current = value;
    while (Array.isArray(current) && current.length === 1) current = current[0];
    return current;
  }
  function parseJson(value, fallback) {
    try { return typeof value === "string" ? JSON.parse(value) : value || fallback; } catch (e) { return fallback; }
  }

  /** addStream(...) của game -> mẫu link: Food King, xin nguyên liệu, còn lại là khoe thành tích. */
  function feedTemplate(raw) {
    var stream = unwrap(raw);
    if (!Array.isArray(stream) || stream.length < 2 || stream.length > 6) return { kind: "achievement", source: "legacy-feed" };
    var attachment = parseJson(stream[1], {}) || {};
    var links = parseJson(stream[2], []);
    var media = Array.isArray(attachment.media) ? attachment.media : [];
    var hrefs = [attachment.href].concat(media.map(function (m) { return m && m.href; }),
      Array.isArray(links) ? links.map(function (l) { return l && l.href; }) : []).filter(function (h) { return typeof h === "string"; });
    var foodKing = hrefs.filter(function (h) { return h.indexOf("/foodking?") >= 0 && h.indexOf("pf_i_id=") >= 0; })[0];
    if (foodKing) return { kind: "foodKingReward", legacyUrl: foodKing };
    for (var i = 0; i < media.length; i++) {
      var m = /\/(4\d{6})\.png(?:$|[?#])/.exec(String(media[i] && media[i].src || ""));
      if (m) return { kind: "ingredientRequest", ingredientId: Number(m[1]) };
    }
    return { kind: "achievement", source: "legacy-feed" };
  }

  function itemTemplate(kind, args, extra) {
    var values = unwrap(args);
    var itemId = Number(Array.isArray(values) ? values[0] : values);
    if (!Number.isSafeInteger(itemId)) return null;
    var t = { kind: kind, itemId: itemId };
    for (var k in extra) t[k] = extra[k];
    return t;
  }

  function api(method, path, body) {
    function send(token) {
      var headers = { "apikey": opts.anonKey };
      if (token) headers["Authorization"] = "Bearer " + token;
      if (body) headers["Content-Type"] = "application/json";
      return fetch(opts.fnUrl("/social-links" + path), { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined });
    }
    return opts.token().then(send).then(function (res) {
      if (res.status !== 401) return res;
      return opts.refresh().then(function (t) { return t ? send(t) : res; });
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) { return { status: res.status, json: json }; });
    });
  }

  function linkUrl(slug) {
    var url = new URL(location.href);
    url.search = "?link=" + slug;
    url.hash = "";
    return url.href;
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  /** Hộp tạo link, mở khi người chơi bấm một nút Facebook cũ trong game. */
  function shareOverlay(template) {
    if (!template) { opts.callback(false); return; }
    var done = false;
    var back = el("div", "rc-social");
    back.setAttribute("role", "dialog");
    back.setAttribute("aria-modal", "true");
    var box = el("section", "rc-social-box");
    var info = KINDS[template.kind] || KINDS.achievement;
    box.appendChild(el("p", "rc-social-tag", "Gửi cho bạn bè trên hub"));
    box.appendChild(el("h2", null, info.title));
    var status = el("p", "rc-social-status", "Đang tạo link…");
    status.setAttribute("aria-live", "polite");
    box.appendChild(status);
    var input = el("input", "rc-social-url");
    input.readOnly = true;
    input.setAttribute("aria-label", "Link để gửi bạn bè");
    var row = el("div", "rc-social-row");
    var copy = el("button", "rc-social-go", "Copy link");
    copy.disabled = true;
    var retry = el("button", "rc-social-alt hidden", "Thử lại");
    var close = el("button", "rc-social-alt", "Huỷ");
    [copy, retry, close].forEach(function (b) { b.type = "button"; row.appendChild(b); });
    box.appendChild(input);
    box.appendChild(row);
    back.appendChild(box);
    document.body.appendChild(back);

    function create() {
      retry.classList.add("hidden");
      status.textContent = "Đang tạo link…";
      api("POST", "", template).then(function (r) {
        if (r.status !== 201 || !r.json.ok) throw new Error(r.json.error || ("HTTP " + r.status));
        input.value = linkUrl(r.json.slug);
        copy.disabled = false;
        done = true;
        close.textContent = "Đóng";
        status.textContent = "Link đã sẵn sàng. Copy rồi gửi cho bạn bè qua tin nhắn; " + (info.share || "họ mở link trên hub để nhận.");
        opts.callback(true);
        copy.focus();
      }).catch(function (err) {
        status.textContent = "Không tạo được link: " + (err && err.message || err);
        retry.classList.remove("hidden");
        close.textContent = "Đóng";
      });
    }
    copy.onclick = function () {
      var p = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(input.value) : Promise.reject();
      p.then(function () { status.textContent = "Đã copy. Dán vào tin nhắn gửi bạn bè."; },
        function () { input.select(); status.textContent = "Link đã được chọn, bấm Ctrl+C để copy."; });
    };
    retry.onclick = create;
    close.onclick = function () {
      if (!done) opts.callback(false);
      back.remove();
      opts.refocus();
    };
    back.addEventListener("keydown", function (e) { if (e.key === "Escape") close.click(); });
    create();
  }

  function install(options) {
    opts = options;
    window.addStream = function () { shareOverlay(feedTemplate([].slice.call(arguments))); };
    window.addFeedSystem = window.addStream;
    window.addInviteFriendsIFrame = function () { shareOverlay({ kind: "friendInvite" }); };
    window.addInviteStickersIFrame = function () { shareOverlay(itemTemplate("employeeSnack", [].slice.call(arguments), {})); };
    window.addSendGiftIFrame = function () { shareOverlay(itemTemplate("directGift", [].slice.call(arguments), { quantity: 1 })); };
  }

  /** Slug trong ?link=..., hoặc link đang chờ từ trước khi người chơi đi đăng nhập. */
  function pendingSlug() {
    var fromUrl = new URLSearchParams(location.search).get("link") || "";
    var stored = "";
    try { stored = localStorage.getItem(PENDING_KEY) || ""; } catch (e) { /* storage blocked */ }
    var slug = SLUG.test(fromUrl) ? fromUrl : SLUG.test(stored) ? stored : "";
    try { if (slug) localStorage.setItem(PENDING_KEY, slug); } catch (e) { /* storage blocked */ }
    return slug;
  }

  function forget() {
    try { localStorage.removeItem(PENDING_KEY); } catch (e) { /* storage blocked */ }
    if (new URLSearchParams(location.search).has("link")) history.replaceState(null, "", location.pathname);
  }

  /**
   * Thẻ nhận link, vẽ vào `host` (panel của trang). Resolve khi người chơi bấm "Vào quán".
   */
  function claimCard(slug, host) {
    return new Promise(function (resolve) {
      host.textContent = "";
      var title = el("h1", null, "Restaurant City");
      var text = el("p", null, "Đang mở link…");
      var note = el("p", "rc-social-note");
      var row = el("div", "rc-social-row");
      var act = el("button", "go hidden");
      var enter = el("button", "go rc-social-enter", "Vào quán");
      act.type = enter.type = "button";
      row.appendChild(act);
      row.appendChild(enter);
      [title, text, note, row].forEach(function (n) { host.appendChild(n); });
      enter.onclick = function () { forget(); resolve(); };

      api("GET", "/" + slug).then(function (r) {
        if (r.status === 404) throw new Error("Không tìm thấy link này.");
        if (!r.json.ok) throw new Error(r.json.error || ("HTTP " + r.status));
        var link = r.json.link;
        var info = KINDS[link.kind] || { title: link.title, text: function () { return link.description; } };
        title.textContent = info.title;
        text.textContent = info.text(link.itemName) + (link.creatorName ? " Người gửi: " + link.creatorName + "." : "");
        if (link.availability !== "available") { note.textContent = STATES[link.availability] || ""; return; }
        if (link.action === "view") return;
        act.textContent = ACTIONS[link.action] || link.actionLabel;
        act.classList.remove("hidden");
        var key = "rc-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
        act.onclick = function () {
          act.disabled = true;
          note.textContent = "Đang gửi…";
          api("POST", "/" + slug + "/actions", { action: link.action, idempotencyKey: key }).then(function (res) {
            if (res.json.ok) {
              note.textContent = OUTCOMES[res.json.outcome] || res.json.message || "Xong.";
              act.classList.add("hidden");
              forget();
              return;
            }
            note.textContent = ERRORS[res.json.code] || res.json.message || res.json.error || ("Lỗi " + res.status);
            act.disabled = res.json.code === "SELF_CLAIM" || res.json.code === "ALREADY_DONE";
            if (!act.disabled) key = "rc-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
          }).catch(function (err) {
            note.textContent = "Không gửi được: " + (err && err.message || err);
            act.disabled = false;
          });
        };
      }).catch(function (err) {
        text.textContent = String(err && err.message || err);
      });
    });
  }

  window.RCSocial = { install: install, pendingSlug: pendingSlug, claimCard: claimCard, forget: forget, feedTemplate: feedTemplate };
})();
