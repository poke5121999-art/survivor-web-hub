/*
 * Admin dashboard — dev-only registry manager for the game hub.
 *
 * WHY this is a client-only, export-to-git tool (not an uploader):
 * ROOT-CAUSE: the hub is a static site on GitHub Pages with no backend, so a web
 *   page cannot persist an uploaded build or write data/games.js. Publishing is
 *   therefore git-based: the dev drops a build folder + edits the registry + pushes.
 *   This page removes the hand-editing pain — it loads the live registry, lets the
 *   dev toggle status / add games in memory, probes which builds are actually
 *   present, then EXPORTS a ready-to-paste data/games.js. The push stays manual.
 * SEE: admin dashboard addition 2026-07-28 (design: git-based guided admin)
 *
 * WHY probe game.path with HEAD instead of trusting status alone:
 * ROOT-CAUSE: status is a hand-set flag and can drift from reality — a game marked
 *   "available" whose build was never committed becomes a broken card for players.
 *   Probing the path catches that mismatch before it ships.
 */
(function () {
  "use strict";

  var STATUSES = ["available", "build-pending", "coming-soon"];
  var STATUS_LABEL = {
    "available": "available — hiện với player",
    "build-pending": "build-pending — ẩn, chờ build",
    "coming-soon": "coming-soon — ẩn, teaser"
  };

  // Working copy: edits here never touch the loaded window.HUB_GAMES until export.
  var registry = deepCloneGames(window.HUB_GAMES);

  function deepCloneGames(src) {
    if (!Array.isArray(src)) return [];
    return src.map(function (g) {
      return {
        id: g.id || "",
        title: g.title || "",
        tagline: g.tagline || "",
        thumbnail: g.thumbnail || "",
        path: g.path || ("games/" + (g.id || "") + "/index.html"),
        status: STATUSES.indexOf(g.status) >= 0 ? g.status : "build-pending",
        tags: Array.isArray(g.tags) ? g.tags.slice() : []
      };
    });
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  // ---- Build presence probe -------------------------------------------------
  // Returns a promise<boolean>: does game.path respond 200? On file:// or any
  // fetch error it resolves false (probe simply unavailable, not a crash).
  function probe(path) {
    try {
      return fetch(path, { method: "HEAD", cache: "no-store" })
        .then(function (r) { return r.ok; })
        .catch(function () { return false; });
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  function setProbeCell(cell, present) {
    cell.className = "probe " + (present ? "probe--ok" : "probe--missing");
    cell.textContent = present ? "✓ có file" : "✗ thiếu";
  }

  // ---- Rendering ------------------------------------------------------------
  function render() {
    var body = document.getElementById("registry-body");
    var count = document.getElementById("game-count");
    body.innerHTML = "";
    if (count) count.textContent = "(" + registry.length + ")";

    if (registry.length === 0) {
      var tr = el("tr");
      var td = el("td");
      td.colSpan = 6;
      td.className = "admin-empty";
      td.textContent = "Chưa có game nào. Dùng form bên dưới để thêm.";
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }

    registry.forEach(function (game, index) {
      body.appendChild(renderRow(game, index));
    });

    // Probe every path after rows exist so the ✓/✗ cell can update in place.
    registry.forEach(function (game, index) {
      var cell = document.getElementById("probe-" + index);
      if (!cell) return;
      probe(game.path).then(function (present) {
        setProbeCell(cell, present);
        flagMismatch(index, game, present);
      });
    });
  }

  function renderRow(game, index) {
    var tr = el("tr");
    tr.id = "row-" + index;

    // Game (thumb + title)
    var tdGame = el("td", "col-game");
    if (game.thumbnail) {
      var img = el("img", "row-thumb");
      img.src = game.thumbnail;
      img.alt = "";
      img.loading = "lazy";
      tdGame.appendChild(img);
    }
    tdGame.appendChild(el("span", "row-title", game.title || "(chưa đặt tên)"));
    tr.appendChild(tdGame);

    // ID
    tr.appendChild(el("td", "col-id mono", game.id));

    // Status dropdown
    var tdStatus = el("td");
    var sel = el("select", "row-status");
    STATUSES.forEach(function (s) {
      var opt = el("option", null, STATUS_LABEL[s]);
      opt.value = s;
      if (s === game.status) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", function () {
      registry[index].status = sel.value;
      updateVisibleCell(index);
      // Re-evaluate the available-but-missing warning on status change.
      var cell = document.getElementById("probe-" + index);
      if (cell) {
        var present = cell.className.indexOf("probe--ok") >= 0;
        flagMismatch(index, registry[index], present);
      }
    });
    tdStatus.appendChild(sel);
    tr.appendChild(tdStatus);

    // Build probe (filled async by render())
    var tdProbe = el("td");
    var probeCell = el("span", "probe probe--pending", "…");
    probeCell.id = "probe-" + index;
    tdProbe.appendChild(probeCell);
    tr.appendChild(tdProbe);

    // Visible to player?
    var tdVis = el("td");
    tdVis.id = "vis-" + index;
    tr.appendChild(tdVis);
    setVisibleCell(tdVis, game.status);

    // Remove
    var tdAct = el("td", "col-act");
    var rm = el("button", "btn btn--danger btn--sm", "Xóa");
    rm.type = "button";
    rm.addEventListener("click", function () {
      registry.splice(index, 1);
      render();
    });
    tdAct.appendChild(rm);
    tr.appendChild(tdAct);

    return tr;
  }

  function setVisibleCell(cell, status) {
    if (status === "available") {
      cell.className = "vis vis--yes";
      cell.textContent = "✓ có";
    } else {
      cell.className = "vis vis--no";
      cell.textContent = "— ẩn";
    }
  }
  function updateVisibleCell(index) {
    var cell = document.getElementById("vis-" + index);
    if (cell) setVisibleCell(cell, registry[index].status);
  }

  // Warn when a game is marked available but its build is not actually present:
  // that ships a broken card to players.
  function flagMismatch(index, game, present) {
    var row = document.getElementById("row-" + index);
    if (!row) return;
    var broken = game.status === "available" && !present;
    row.classList.toggle("row--broken", broken);
  }

  // ---- Add game -------------------------------------------------------------
  function onAdd(e) {
    e.preventDefault();
    var form = e.target;
    // WHY read fields via form.elements.namedItem, NOT form.<name>:
    // ROOT-CAUSE: a form control named "id"/"title" collides with the form
    //   element's own id/title DOM properties, so form.id returns the form's id
    //   attribute ("add-form") instead of the input. namedItem() is unambiguous.
    // SEE: admin dashboard addition 2026-07-28
    var field = function (name) { return form.elements.namedItem(name); };
    var id = field("id").value.trim().toLowerCase();
    if (!id) return;

    if (registry.some(function (g) { return g.id === id; })) {
      alert('ID "' + id + '" đã tồn tại. Chọn ID khác.');
      return;
    }

    var tags = field("tags").value.split(",")
      .map(function (t) { return t.trim(); })
      .filter(function (t) { return t.length > 0; });

    registry.push({
      id: id,
      title: field("title").value.trim() || id,
      tagline: field("tagline").value.trim(),
      thumbnail: field("thumbnail").value.trim(),
      path: "games/" + id + "/index.html",
      status: field("status").value,
      tags: tags
    });

    form.reset();
    render();
    // Scroll the new row into view for confirmation.
    var body = document.getElementById("registry-body");
    if (body.lastElementChild) body.lastElementChild.scrollIntoView({ block: "center" });
  }

  // ---- Export ---------------------------------------------------------------
  var HEADER = [
    "/*",
    " * Game registry — the catalog the hub renders.",
    " *",
    " * This is the ONLY file you edit to add/remove/update a game. hub.js reads",
    " * window.HUB_GAMES generically and builds one card per entry.",
    " *",
    " * WHY a .js file (a global) instead of a .json fetched at runtime:",
    " * ROOT-CAUSE: browsers block fetch()/XMLHttpRequest of local files under the",
    " *   file:// \"null\" origin, so a JSON registry makes the page blank on direct",
    " *   open. Loading the registry via <script> sidesteps that entirely.",
    " * SEE: docs/patches/phase-5.1-patch-1-web-game-hub.md (Options Considered A vs B)",
    " *",
    " * status controls WHO sees the game:",
    " *   - \"available\"     → shown on the public hub (index.html). Use ONLY when a real build exists.",
    " *   - \"build-pending\" → hidden from players; visible to the dev on admin.html.",
    " *   - \"coming-soon\"   → hidden from players; a teaser tracked on admin.html.",
    " *",
    " * Generated / editable via admin.html. Publish = commit + push to main.",
    " */"
  ].join("\n");

  // Serialize one entry with unquoted keys (matches the hand-written style) and
  // JSON.stringify per value for correct escaping.
  function serializeEntry(g) {
    var lines = [
      "  {",
      "    id: " + JSON.stringify(g.id) + ",",
      "    title: " + JSON.stringify(g.title) + ",",
      "    tagline: " + JSON.stringify(g.tagline) + ",",
      "    thumbnail: " + JSON.stringify(g.thumbnail) + ",",
      "    path: " + JSON.stringify(g.path) + ",",
      "    status: " + JSON.stringify(g.status) + ",",
      "    tags: " + JSON.stringify(g.tags),
      "  }"
    ];
    return lines.join("\n");
  }

  function buildFile() {
    var entries = registry.map(serializeEntry).join(",\n");
    return HEADER + "\nwindow.HUB_GAMES = [\n" + entries + "\n];\n";
  }

  function onExport() {
    var out = document.getElementById("export-out");
    out.value = buildFile();
    var copyBtn = document.getElementById("btn-copy");
    copyBtn.disabled = false;
  }

  function onCopy() {
    var out = document.getElementById("export-out");
    if (!out.value) return;
    out.select();
    var done = function () {
      var btn = document.getElementById("btn-copy");
      var old = btn.textContent;
      btn.textContent = "✓ Đã copy";
      setTimeout(function () { btn.textContent = old; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(out.value).then(done, function () {
        document.execCommand("copy"); done();
      });
    } else {
      document.execCommand("copy"); done();
    }
  }

  // ---- Wire up --------------------------------------------------------------
  function init() {
    render();
    document.getElementById("add-form").addEventListener("submit", onAdd);
    document.getElementById("btn-export").addEventListener("click", onExport);
    document.getElementById("btn-copy").addEventListener("click", onCopy);
    document.getElementById("btn-recheck").addEventListener("click", render);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
