#!/usr/bin/env node
// Chép bản WebGL từ project Unity (ngoài git) vào games/walking-trade/Build, đặt tên tệp theo
// hash nội dung để Pages/Cloudflare đệm lâu được, rồi ghi hash ấy vào dòng `var BUILD` của index.html.
// Dùng: node games/walking-trade/tools/import-build.js [thư mục build-web]
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const src = path.resolve(process.argv[2] || "D:/walking-trade-ref/twt-webgl/build-web/Build");
const game = path.resolve(__dirname, "..");
const dst = path.join(game, "Build");
const parts = ["loader.js", "data.unityweb", "framework.js.unityweb", "wasm.unityweb"];

const files = fs.readdirSync(src);
const pick = (suffix) => {
  const f = files.find((n) => n.endsWith("." + suffix));
  if (!f) throw new Error(`build part missing in ${src}: *.${suffix}`);
  return path.join(src, f);
};
const found = parts.map(pick);
const h = crypto.createHash("sha1");
for (const f of found) h.update(fs.readFileSync(f));
const name = "twt-" + h.digest("hex").slice(0, 10);

fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(dst, { recursive: true });
parts.forEach((suffix, i) => fs.copyFileSync(found[i], path.join(dst, `${name}.${suffix}`)));

const index = path.join(game, "index.html");
const html = fs.readFileSync(index, "utf8");
const next = html.replace(/var BUILD = "twt-[0-9a-f]+";/, `var BUILD = "${name}";`);
if (next === html && !html.includes(`var BUILD = "${name}";`)) throw new Error("index.html has no `var BUILD` line");
fs.writeFileSync(index, next);

const size = parts.map((s) => fs.statSync(path.join(dst, `${name}.${s}`)).size);
console.log(name, parts.map((s, i) => `${s}=${(size[i] / 1048576).toFixed(2)}MB`).join(" "));
