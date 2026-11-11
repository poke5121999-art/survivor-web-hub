/*
 * Cổng đăng nhập cho trang game — chặn vào thẳng game khi chưa qua cửa hub.
 *
 * VÌ SAO: hub index.html có cổng (js/session.js + check isSignedIn), nhưng mỗi
 * games/<id>/index.html là một app riêng nên gõ thẳng path vẫn chơi được, bỏ qua
 * login. Script này nhúng SỚM vào <head> mỗi trang game; chưa có session thì
 * location.replace về login.html của hub, kèm ?next để đăng nhập xong quay lại game.
 *
 * Tự đọc localStorage, KHÔNG phụ thuộc js/session.js — để mỗi game chỉ cần một thẻ
 * <script> duy nhất và không lệ thuộc thứ tự load. KEY phải khớp session.js (nguồn gốc).
 * Cùng một origin (hub + mọi game) nên trang game đọc được session hub đã ghi — xem
 * games/BRIDGE.md "Why the game can see the hub's session at all".
 *
 * Fail-open: mọi lỗi bất ngờ đều cho game chạy tiếp (thà lọt một người còn hơn nhốt
 * mọi người trong màn trắng vì một bug ở cổng). Đây là cổng UX, không phải access
 * control thật — host tĩnh (GitHub Pages) không chặn nổi người tắt JS; mục tiêu là
 * đưa người dùng đi đúng cửa, không phải chống hack.
 */
(function () {
  "use strict";

  // Khớp KEY trong js/session.js. Đổi ở đó thì đổi cả đây.
  var SESSION_KEY = "hub.session.v1";
  // Role được phép chơi (khớp profiles.role trong db/roles.sql). pending/blocked không.
  var ALLOW = { member: 1, admin: 1 };

  try {
    var path = location.pathname;
    var marker = "/games/";
    var at = path.indexOf(marker);
    if (at < 0) return; // Không phải trang dưới games/ — không gác.

    var raw = null;
    try { raw = window.localStorage.getItem(SESSION_KEY); } catch (e) { raw = null; }
    var session = null;
    if (raw) { try { session = JSON.parse(raw); } catch (e) { session = null; } }

    // Quyết định cho chơi hay không:
    //   có role rõ ràng   → chỉ member/admin được chơi (pending/blocked bị chặn)
    //   session member mà CHƯA có role (đăng nhập từ trước khi có cột role) → cho qua
    //     (grandfather: mọi tài khoản cũ đều là member; role sẽ được dập vào ở lần
    //      ghé hub kế — xem js/hub.js refreshRole)
    var role = session && session.role;
    var ok;
    if (!session) ok = false;
    else if (role) ok = !!ALLOW[role];
    else ok = session.kind === "member";
    if (ok) return;

    var root = path.slice(0, at + 1); // ".../" tới ngay trước "games/"
    // Game nặng nằm ở repo Pages riêng hub-games (cùng origin, /hub-games/games/<id>/): login.html và
    // index.html vẫn của hub. next=games/<id>/index.html về trang chuyển hướng của hub, trang đó đưa sang lại.
    if (path.indexOf("/hub-games/") === 0) root = "/survivor-web-hub/";

    // Là member thật nhưng role chưa đủ quyền (pending/blocked) → về hub kèm ?gate=<role>
    // để hub hiện lời nhắn; KHÔNG đá về login (họ đã đăng nhập rồi, đá về login chỉ lặp vô ích).
    if (session && session.kind === "member") {
      location.replace(root + "index.html?gate=" + encodeURIComponent(role || "pending"));
      return;
    }

    // Chưa đăng nhập, hoặc đang là khách → về login.html của hub để đăng nhập tài khoản
    // thật, kèm next=games/<id>/index.html để auth.js đưa quay lại đúng game (regex trong
    // auth.js chỉ nhận dạng này). Lấy <id> từ path, bỏ qua trang con / query ?v=.
    var rest = path.slice(at + marker.length); // "<id>/..."
    var slash = rest.indexOf("/");
    var id = slash < 0 ? rest : rest.slice(0, slash);
    var next = "games/" + id + "/index.html";
    location.replace(root + "login.html?next=" + encodeURIComponent(next));
  } catch (e) {
    /* fail-open: để game chạy tiếp */
  }
})();
