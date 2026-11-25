// Sets one cache key everywhere the browser loads bone-studio code: ?v= in the HTML pages and on every relative
// import inside src/ and runtime/. Usage: node tools/bump.mjs [YYYYMMDDx]   (default: today + next letter)
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? (n === "demo" || n === "samples" ? [] : walk(p)) : [p]; });
const files = [join(ROOT, "index.html"), join(ROOT, "runtime", "demo.html"), ...walk(join(ROOT, "src")), ...walk(join(ROOT, "runtime"))].filter((f) => /\.(html|js|css)$/.test(f));
const current = readFileSync(join(ROOT, "index.html"), "utf8").match(/\?v=(\d{8})([a-z])/);
const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const ver = process.argv[2] ?? (current && current[1] === today ? today + String.fromCharCode(current[2].charCodeAt(0) + 1) : today + "a");
let n = 0;
for (const f of new Set(files)) {
  const s = readFileSync(f, "utf8");
  let t = s.replace(/\?v=\d{8}[a-z]/g, `?v=${ver}`);
  if (f.endsWith(".js")) t = t.replace(/((?:import|export)\s[^"'`;]*?from\s*|import\s*\(\s*)(["'])(\.{1,2}\/[^"'?]+\.js)(\?v=\d{8}[a-z])?\2/g, (_, a, q, p) => `${a}${q}${p}?v=${ver}${q}`);
  if (t !== s) { writeFileSync(f, t); n++; }
}
console.log(`version ${ver}, sửa ${n} file`);
