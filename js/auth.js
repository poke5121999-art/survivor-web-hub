/*
 * Login screen behaviour — tab switching, real Supabase sign-in / sign-up, guest fallback.
 *
 * Sign-in and sign-up call Supabase Auth through HubAuth (supabase-auth.js). If the
 * service is not configured (empty SUPABASE_CONFIG) or is unreachable, the screen falls
 * back to guest-only — the required degrade path so a paused/unconfigured service never
 * kills the hub. The guest button is always available.
 * SEE: hub account gate — sign-in on entry + guest fallback (2026-07-28);
 *      docs/patches/phase-5.3-patch-2-hub-signin-gate.md
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

  var configured = !!(window.HubAuth && window.HubAuth.isConfigured());

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
  // Disable a form's submit button while a request is in flight.
  function setBusy(form, busy, label) {
    var btn = form.querySelector('button[type="submit"]');
    if (!btn) return;
    btn.disabled = busy;
    if (busy) { btn.dataset.label = btn.textContent; btn.textContent = label || "Đang xử lý…"; }
    else if (btn.dataset.label) { btn.textContent = btn.dataset.label; }
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

  // ---- Enter the hub --------------------------------------------------------
  function enterHub(session) {
    window.HubSession.set(session);
    location.replace("index.html");
  }

  // Shared "service down → offer guest" message.
  function offerGuest(prefix) {
    showMsg((prefix ? prefix + " " : "") +
      "Dịch vụ tài khoản không truy cập được — thử lại, hoặc bấm “Chơi ngay với tư cách khách”.", "error");
  }

  // ---- Sign in --------------------------------------------------------------
  loginForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = val(loginForm, "email");
    var password = val(loginForm, "password");
    if (!looksLikeEmail(email)) { showMsg("Email chưa hợp lệ.", "error"); return; }
    if (password.length < 6) { showMsg("Mật khẩu cần ít nhất 6 ký tự.", "error"); return; }
    if (!configured) { showMsg("Dịch vụ tài khoản chưa được cấu hình. Hiện chỉ có thể chơi khách.", "error"); return; }

    clearMsg();
    setBusy(loginForm, true, "Đang đăng nhập…");
    window.HubAuth.signInWithPassword(email, password).then(function (r) {
      setBusy(loginForm, false);
      if (r.ok) { enterHub(r.session); return; }
      if (r.unreachable) { offerGuest(); return; }
      showMsg("Email hoặc mật khẩu chưa đúng.", "error");
    });
  });

  // ---- Create account -------------------------------------------------------
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
    if (!configured) { showMsg("Dịch vụ tài khoản chưa được cấu hình. Hiện chỉ có thể chơi khách.", "error"); return; }

    clearMsg();
    setBusy(signupForm, true, "Đang tạo tài khoản…");
    window.HubAuth.signUp(email, password, name).then(function (r) {
      setBusy(signupForm, false);
      if (!r.ok) {
        if (r.unreachable) { offerGuest(); return; }
        showMsg(r.error || "Không tạo được tài khoản.", "error");
        return;
      }
      if (r.needsConfirmation) {
        showMsg("Đã gửi email xác nhận tới " + email + ". Mở email, bấm liên kết xác nhận, rồi đăng nhập.", "ok");
        selectTab("login");
        return;
      }
      enterHub(r.session);
    });
  });

  // ---- Guest fallback (always available) ------------------------------------
  document.getElementById("btn-guest").addEventListener("click", function () {
    enterHub({ kind: "guest", name: "Khách", email: null });
  });

  // ---- Google / forgot-password placeholders --------------------------------
  // OAuth needs a provider enabled in the Supabase dashboard (a redirect flow), which
  // is out of this patch's scope; recovery would use /auth/v1/recover similarly.
  document.getElementById("btn-google").addEventListener("click", function () {
    showMsg("Đăng nhập Google cần bật nhà cung cấp trong Supabase — sẽ nối sau.", "error");
  });
  document.getElementById("forgot-link").addEventListener("click", function (e) {
    e.preventDefault();
    showMsg("Khôi phục mật khẩu sẽ được nối sau (qua email).", "error");
  });

  // ---- Not-configured notice (guest-only) -----------------------------------
  if (!configured) {
    showMsg("Dịch vụ tài khoản chưa cấu hình — bạn vẫn có thể vào bằng “Chơi ngay với tư cách khách”.", "error");
  }
})();
