/*
 * Trang duyệt tài khoản (roles.html). Liệt kê mọi profile, cho admin đổi role.
 * pending xếp lên đầu để duyệt nhanh. Mọi thao tác đổi role đi qua HubRoles.setRole,
 * RLS + trigger phía Supabase mới là chốt chặn thật (xem db/roles.sql).
 */
(function () {
  "use strict";

  var LABEL = { pending: "Chờ duyệt", member: "Thành viên", admin: "Quản trị", blocked: "Khoá" };
  var ORDER = { pending: 0, member: 1, admin: 2, blocked: 3 };

  var tableEl, msgEl, summaryEl;

  function msg(text, isError) {
    if (!msgEl) return;
    msgEl.textContent = text || "";
    msgEl.hidden = !text;
    msgEl.style.color = isError ? "#ff8f8f" : "";
  }

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text != null) n.textContent = text;
    return n;
  }

  function fmtDate(ms) {
    if (!ms) return "—";
    try { return new Date(ms).toLocaleDateString("vi-VN"); } catch (e) { return "—"; }
  }

  function roleSelect(row) {
    var sel = el("select");
    sel.style.cssText = "padding:4px 8px;border-radius:6px";
    HubRoles.ROLES.forEach(function (r) {
      var o = el("option", { value: r }, LABEL[r] + " (" + r + ")");
      if (r === row.role) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener("change", function () {
      var next = sel.value;
      sel.disabled = true;
      msg("Đang đổi role của " + (row.displayName || row.id.slice(0, 8)) + "…");
      window.HubRoles.setRole(row.id, next).then(function (r) {
        sel.disabled = false;
        if (r.ok) {
          row.role = r.role;
          msg("Đã đặt " + (row.displayName || row.id.slice(0, 8)) + " → " + LABEL[r.role] + ".");
          load(); // xếp lại thứ tự + cập nhật tóm tắt
        } else {
          sel.value = row.role; // trả lại giá trị cũ
          msg(r.reason === "forbidden"
            ? "Bạn không có quyền đổi role (cần là admin)."
            : r.reason === "unreachable" ? "Mất kết nối dịch vụ."
            : "Không đổi được role (" + (r.reason || "lỗi") + (r.status ? " " + r.status : "") + ").", true);
        }
      });
    });
    return sel;
  }

  function renderRows(rows) {
    tableEl.textContent = "";
    var table = el("table", { class: "admin-table" });
    table.style.cssText = "width:100%;border-collapse:collapse";
    var thead = el("thead");
    var htr = el("tr");
    ["Tên", "ID", "Tạo lúc", "Role"].forEach(function (h) {
      var th = el("th", null, h);
      th.style.cssText = "text-align:left;padding:8px;border-bottom:1px solid rgba(255,255,255,.15)";
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);

    var tbody = el("tbody");
    rows.slice().sort(function (a, b) {
      var d = (ORDER[a.role] == null ? 9 : ORDER[a.role]) - (ORDER[b.role] == null ? 9 : ORDER[b.role]);
      return d !== 0 ? d : (a.createdAt || 0) - (b.createdAt || 0);
    }).forEach(function (row) {
      var tr = el("tr");
      if (row.role === "pending") tr.style.background = "rgba(255,196,0,.08)";
      [
        row.displayName || "(chưa đặt tên)",
        row.id ? row.id.slice(0, 8) + "…" : "—",
        fmtDate(row.createdAt)
      ].forEach(function (v) {
        var td = el("td", null, v);
        td.style.cssText = "padding:8px;border-bottom:1px solid rgba(255,255,255,.07)";
        tr.appendChild(td);
      });
      var tdRole = el("td");
      tdRole.style.cssText = "padding:8px;border-bottom:1px solid rgba(255,255,255,.07)";
      tdRole.appendChild(roleSelect(row));
      tr.appendChild(tdRole);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableEl.appendChild(table);

    var pending = rows.filter(function (r) { return r.role === "pending"; }).length;
    if (summaryEl) summaryEl.textContent = rows.length + " tài khoản · " + pending + " chờ duyệt";
  }

  function load() {
    msg("");
    window.HubRoles.listProfiles().then(function (r) {
      if (r.ok) {
        if (!r.rows.length) { tableEl.textContent = ""; msg("Chưa có tài khoản nào."); return; }
        renderRows(r.rows);
      } else if (r.reason === "no-account") {
        msg("Chưa đăng nhập, hoặc dịch vụ tài khoản chưa cấu hình.", true);
      } else if (r.reason === "unreachable") {
        msg("Mất kết nối dịch vụ tài khoản.", true);
      } else {
        msg("Không tải được danh sách (" + (r.reason || "lỗi") + (r.status ? " " + r.status : "") + ").", true);
      }
    });
  }

  function start() {
    tableEl = document.getElementById("roles-table");
    msgEl = document.getElementById("roles-msg");
    summaryEl = document.getElementById("roles-summary");
    var btn = document.getElementById("roles-refresh");
    if (btn) btn.addEventListener("click", load);
    load();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
