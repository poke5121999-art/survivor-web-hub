#!/usr/bin/env node
/*
 * Chèn cổng đăng nhập (js/game-gate.js) vào <head> mỗi games/<id>/index.html.
 * Idempotent: chạy lại nhiều lần an toàn — có rồi thì bỏ qua, lệch version thì cập nhật.
 *
 *   node tools/stamp-gate.js          # chèn thật
 *   node tools/stamp-gate.js --dry    # chỉ liệt kê sẽ đổi gì, không ghi file
 *
 * CẢNH BÁO Unity: build Unity ghi đè index.html nên thẻ bị chèn sẽ mất ở lần build
 * sau — các game đó phải thêm game-gate.js vào WebGLTemplate (xem games/BRIDGE.md
 * Layer 0). Tool đánh dấu [unity] để biết game nào cần vá template riêng.
 */
"use strict";
var fs = require("fs");
var path = require("path");

var GATE_VER = "20261103";
var GATE_SRC = "../../js/game-gate.js?v=" + GATE_VER;
// Khớp thẻ game-gate.js đã chèn (kèm hoặc không kèm ?v=...).
var TAG_RE = /[ \t]*<script[^>]*src=["']\.\.\/\.\.\/js\/game-gate\.js(?:\?[^"']*)?["'][^>]*>\s*<\/script>\r?\n?/i;
var HEAD_RE = /(<head[^>]*>)/i;
var UNITY_RE = /createUnityInstance|\.unityweb|UnityLoader|unityInstance/i;

var dry = process.argv.indexOf("--dry") >= 0;
var gamesDir = path.join(__dirname, "..", "games");

var out = { injected: [], updated: [], already: [], nohead: [], missing: [] };

fs.readdirSync(gamesDir, { withFileTypes: true }).forEach(function (ent) {
  if (!ent.isDirectory()) return;
  var file = path.join(gamesDir, ent.name, "index.html");
  if (!fs.existsSync(file)) { out.missing.push(ent.name); return; }

  var content = fs.readFileSync(file, "utf8");
  var eol = content.indexOf("\r\n") >= 0 ? "\r\n" : "\n";
  var unity = UNITY_RE.test(content) ? " [unity]" : "";
  var tag = '<script src="' + GATE_SRC + '"></script>';

  var existing = content.match(TAG_RE);
  if (existing) {
    if (existing[0].indexOf(GATE_SRC) >= 0) { out.already.push(ent.name + unity); return; }
    // Có thẻ nhưng version khác → thay nguyên dòng.
    var updated = content.replace(TAG_RE, "  " + tag + eol);
    if (!dry) fs.writeFileSync(file, updated);
    out.updated.push(ent.name + unity);
    return;
  }

  var next;
  if (HEAD_RE.test(content)) {
    next = content.replace(HEAD_RE, function (m) { return m + eol + "  " + tag; });
  } else {
    // Không có <head> (vd chuyen-tau là fragment) → chèn đầu file, sau <!doctype> nếu có.
    // Script đứng đầu vẫn chạy trước game.
    var dt = content.match(/^\s*<!doctype[^>]*>\r?\n?/i);
    if (dt) next = dt[0] + tag + eol + content.slice(dt[0].length);
    else next = tag + eol + content;
  }
  if (!dry) fs.writeFileSync(file, next);
  out.injected.push(ent.name + unity);
});

function show(label, arr) {
  if (!arr.length) return;
  console.log("\n" + label + " (" + arr.length + "):");
  arr.sort().forEach(function (n) { console.log("  " + n); });
}
console.log(dry ? "=== DRY RUN (không ghi file) ===" : "=== CHÈN THẬT ===");
show("Chèn mới", out.injected);
show("Cập nhật version", out.updated);
show("Đã có, bỏ qua", out.already);
show("Không thấy <head>, BỎ", out.nohead);
show("Không có index.html", out.missing);
var unityCount = out.injected.concat(out.updated).filter(function (n) { return /\[unity\]/.test(n); }).length;
if (unityCount) console.log("\n⚠ " + unityCount + " game [unity]: thẻ sẽ mất khi build lại — cần vá WebGLTemplate (games/BRIDGE.md Layer 0).");
console.log("");
