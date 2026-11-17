import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const src = process.argv[2];
if (!src) { console.error("Dùng: node build-codex-catalog.mjs <thư mục pixel-vfx-codex>"); process.exit(1); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const meta = JSON.parse(fs.readFileSync(path.join(src, "data", "meta.json"), "utf8"));
const list = meta.map((m) => ({
  id: m.id, name: m.en, nameZh: m.zh, desc: m.descEn, category: m.category,
  schools: m.schools || [], color: m.color, duration: m.duration,
})).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
fs.mkdirSync(path.join(root, "vfx"), { recursive: true });
fs.writeFileSync(path.join(root, "vfx", "codex-catalog.json"), JSON.stringify(list));
const lic = fs.readFileSync(path.join(src, "LICENSE"), "utf8").trimEnd();
fs.writeFileSync(path.join(root, "vfx", "LICENSE-pixel-vfx-codex.txt"),
  lic + "\n\nEffect designs by 00GameDevs (https://00gamedevs.com/); rendering rules by pixel-plays (https://github.com/amirmushichge/pixel-plays).\nSource: https://github.com/888wing/pixel-vfx-codex\n");
console.log(list.length + " effect");
