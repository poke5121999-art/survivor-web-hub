/*
 * HubRoles — lớp admin đọc/sửa role của mọi tài khoản (trang roles.html).
 *
 * Cùng transport với phần còn lại của hub: fetch thẳng tới Supabase PostgREST mang JWT
 * member làm Authorization: Bearer. RLS (db/roles.sql: profiles_select_admin /
 * profiles_update_admin + is_admin()) mới cho đọc/sửa mọi hàng — tài khoản thường gọi
 * listProfiles() chỉ nhận đúng hàng của mình. Giữ bản sao rest()/ensureFresh() song
 * song với hub-profile.js thay vì tách chung, theo quy ước repo (không có test harness JS,
 * tránh hai module làm hỏng nhau) — xem js/hub-profile.js, db/policies.sql.
 */
(function () {
  "use strict";

  function cfg() { return window.SUPABASE_CONFIG || {}; }
  function isConfigured() { var c = cfg(); return !!(c.url && c.anonKey); }
  function restBase() { return String(cfg().url || "").replace(/\/+$/, "") + "/rest/v1"; }

  function memberSession() {
    var s = window.HubSession && window.HubSession.get();
    return s && s.kind === "member" && s.accessToken ? s : null;
  }

  function ensureFresh(session) {
    if (!session) return Promise.resolve(null);
    var expired = window.HubSession && window.HubSession.isExpired && window.HubSession.isExpired();
    if (!expired || !window.HubAuth) return Promise.resolve(session);
    return window.HubAuth.refresh(session).then(function (r) {
      if (r && r.ok) { window.HubSession.set(r.session); return r.session; }
      return (r && r.unreachable) ? session : null;
    });
  }

  function rest(method, path, opts, session, didRetry) {
    var headers = { "apikey": cfg().anonKey, "Authorization": "Bearer " + session.accessToken };
    opts = opts || {};
    if (opts.body != null) headers["Content-Type"] = "application/json";
    if (opts.prefer) headers["Prefer"] = opts.prefer;
    return fetch(restBase() + path, {
      method: method,
      headers: headers,
      body: opts.body != null ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      if (res.status === 401 && !didRetry && window.HubAuth) {
        return window.HubAuth.refresh(session).then(function (r) {
          if (r && r.ok) { window.HubSession.set(r.session); return rest(method, path, opts, r.session, true); }
          return { ok: false, status: 401, data: null };
        });
      }
      return res.text().then(function (t) {
        var data = null;
        try { data = t ? JSON.parse(t) : null; } catch (e) { data = null; }
        return { ok: res.ok, status: res.status, data: data };
      });
    }).catch(function () { return { ok: false, unreachable: true }; });
  }

  function withMember(fn) {
    if (!isConfigured() || !memberSession()) return Promise.resolve({ ok: false, reason: "no-account" });
    return ensureFresh(memberSession()).then(function (s) {
      return s ? fn(s) : { ok: false, reason: "no-account" };
    });
  }

  var ROLES = ["pending", "member", "admin", "blocked"];

  window.HubRoles = {
    ROLES: ROLES,
    // Người đang đăng nhập có phải admin không (đọc role đã cache trong session).
    amAdmin: function () {
      var s = window.HubSession && window.HubSession.get();
      return !!(s && s.role === "admin");
    },

    // Mọi tài khoản (chỉ admin mới nhận đủ danh sách nhờ RLS). Resolves:
    //   { ok:true, rows:[{ id, displayName, role, createdAt(ms) }] }
    //   { ok:false, reason:"no-account"|"unreachable"|"error", status? }
    listProfiles: function () {
      return withMember(function (s) {
        return rest("GET", "/profiles?select=id,display_name,role,created_at&order=created_at.asc", null, s)
          .then(function (r) {
            if (r.unreachable) return { ok: false, reason: "unreachable" };
            if (!r.ok) return { ok: false, reason: "error", status: r.status };
            var rows = (Array.isArray(r.data) ? r.data : []).map(function (row) {
              return {
                id: row.id,
                displayName: row.display_name || null,
                role: row.role || "pending",
                createdAt: row.created_at ? (Date.parse(row.created_at) || null) : null
              };
            });
            return { ok: true, rows: rows };
          });
      });
    },

    // Đặt role cho một tài khoản. RLS + trigger guard_role_change chỉ cho admin sửa.
    //   { ok:true, role } | { ok:false, reason:"no-account"|"unreachable"|"forbidden"|"bad-role"|"error", status? }
    setRole: function (userId, role) {
      if (ROLES.indexOf(role) === -1) return Promise.resolve({ ok: false, reason: "bad-role" });
      if (!userId) return Promise.resolve({ ok: false, reason: "error" });
      return withMember(function (s) {
        return rest("PATCH", "/profiles?id=eq." + encodeURIComponent(userId), {
          body: { role: role }, prefer: "return=representation"
        }, s).then(function (r) {
          if (r.unreachable) return { ok: false, reason: "unreachable" };
          if (r.status === 403 || r.status === 401) return { ok: false, reason: "forbidden", status: r.status };
          if (!r.ok) return { ok: false, reason: "error", status: r.status };
          var row = Array.isArray(r.data) && r.data.length ? r.data[0] : null;
          return { ok: true, role: row ? row.role : role };
        });
      });
    }
  };
})();
