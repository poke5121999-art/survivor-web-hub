/*
 * Login screen behaviour — tab switching, form handling, guest fallback.
 *
 * SCAFFOLD ONLY: no real authentication happens here. A submit just validates the
 * fields client-side and stores a local session via HubSession, then redirects to
 * the hub. This is the seam where the real account service plugs in later: replace
 * the bodies of signIn()/createAccount() with calls to the hosted account API,
 * keep everything else. The guest path is permanent — it is the required fallback
 * for when the account service is unreachable.
 * SEE: hub account gate — sign-in on entry + guest fallback (2026-07-28)
 */
(function () {
  "use strict";

  var loginForm = document.getElementById("login-form");
  var signupForm = document.getElementById("signup-form");
  var tabLogin = document.getElementById("tab-login");
  var tabSignup = document.getElementById("tab-signup");
  var titleEl = document.getElementById("auth-title");
  var subEl = document.getElementById("auth-sub");
  var msgEl = document.getElementById("auth-msg");

  // ---- Small UI helpers -----------------------------------------------------
  function showMsg(text, kind) {
    msgEl.textContent = text;
    msgEl.className = "auth-msg " + (kind === "ok" ? "auth-msg--ok" : "auth-msg--error");
    msgEl.hidden = false;
  }
  function clearMsg() {
    msgEl.hidden = true;
    msgEl.textContent = "";
  }
  function val(form, name) {
    var f = form.elements.namedItem(name);
    return f ? f.value.trim() : "";
  }
  function looksLikeEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }

  // ---- Tab switching --------------------------------------------------------
  function selectTab(which) {
    var isLogin = which === "login";
    tabLogin.classList.toggle("is-active", isLogin);
    tabSignup.classList.toggle("is-active", !isLogin);
    tabLogin.setAttribute("aria-selected", String(isLogin));
    tabSignup.setAttribute("aria-selected", String(!isLogin));
    loginForm.hidden = !isLogin;
    signupForm.hidden = isLogin;
    titleEl.textContent = isLogin ? "Chào mừng trở lại" : "Tạo tài khoản mới";
    subEl.textContent = isLogin
      ? "Đăng nhập để tiếp tục vào Game Hub."
      : "Tạo tài khoản để tiến trình chơi theo bạn qua các thiết bị.";
    clearMsg();
  }

  tabLogin.addEventListener("click", function () { selectTab("login"); });
  tabSignup.addEventListener("click", function () { selectTab("signup"); });

  // ---- Session creation (mock) ---------------------------------------------
  function nameFromEmail(email) {
    return email.split("@")[0] || "Người chơi";
  }
  function enterHub(session) {
    window.HubSession.set(session);
    location.replace("index.html");
  }

  function signIn(email) {
    // Replace this body with a real credential check against the account service.
    enterHub({
      kind: "member",
      name: nameFromEmail(email),
      email: email,
      since: new Date().toISOString()
    });
  }
  function createAccount(name, email) {
    // Replace this body with a real create-account call against the account service.
    enterHub({
      kind: "member",
      name: name || nameFromEmail(email),
      email: email,
      since: new Date().toISOString()
    });
  }

  // ---- Form submit ----------------------------------------------------------
  loginForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = val(loginForm, "email");
    var password = val(loginForm, "password");
    if (!looksLikeEmail(email)) { showMsg("Email chưa hợp lệ.", "error"); return; }
    if (password.length < 6) { showMsg("Mật khẩu cần ít nhất 6 ký tự.", "error"); return; }
    signIn(email);
  });

  signupForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var name = val(signupForm, "name");
    var email = val(signupForm, "email");
    var password = val(signupForm, "password");
    var confirm = val(signupForm, "confirm");
    if (!name) { showMsg("Hãy nhập tên hiển thị.", "error"); return; }
    if (!looksLikeEmail(email)) { showMsg("Email chưa hợp lệ.", "error"); return; }
    if (password.length < 6) { showMsg("Mật khẩu cần ít nhất 6 ký tự.", "error"); return; }
    if (password !== confirm) { showMsg("Hai lần nhập mật khẩu chưa khớp.", "error"); return; }
    createAccount(name, email);
  });

  // ---- Guest fallback -------------------------------------------------------
  document.getElementById("btn-guest").addEventListener("click", function () {
    enterHub({
      kind: "guest",
      name: "Khách",
      email: null,
      since: new Date().toISOString()
    });
  });

  // ---- Google placeholder ---------------------------------------------------
  document.getElementById("btn-google").addEventListener("click", function () {
    showMsg("Đăng nhập Google sẽ được nối khi dịch vụ tài khoản sẵn sàng.", "error");
  });

  // ---- Forgot-password placeholder -----------------------------------------
  document.getElementById("forgot-link").addEventListener("click", function (e) {
    e.preventDefault();
    showMsg("Khôi phục mật khẩu sẽ có khi dịch vụ tài khoản sẵn sàng.", "error");
  });
})();
