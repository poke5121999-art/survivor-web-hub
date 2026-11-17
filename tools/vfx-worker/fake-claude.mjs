#!/usr/bin/env node
// Test double for `claude -p --output-format stream-json`: copies a library effect and renders it once.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const args = process.argv.slice(2);
let input = "";
for await (const c of process.stdin) input += c;
const emit = (o) => process.stdout.write(JSON.stringify(o) + "\n");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const sid = args.includes("--resume") ? args[args.indexOf("--resume") + 1] : "fake-" + Math.random().toString(16).slice(2, 10);
if (process.env.FAKE_PIDFILE) writeFileSync(process.env.FAKE_PIDFILE, String(process.pid));
emit({ type: "system", subtype: "init", session_id: sid });
const tool = (name, inp) => emit({ type: "assistant", message: { content: [{ type: "tool_use", name, input: inp }] } });
const slug = (input.match(/studio\/(vfx-[0-9a-f]{8})/) ?? [])[1];
if (!slug) { emit({ type: "result", subtype: "error", is_error: true, result: "no slug in brief", session_id: sid }); process.exit(1); }

emit({ type: "assistant", message: { content: [{ type: "text", text: "Đang đọc skill rồi vẽ thử." }] } });
tool("Read", { file_path: "skills/pixelfx/SKILL.md" });
const sleepMs = +(process.env.FAKE_SLEEP_MS ?? 0);
for (let t = 0; t < sleepMs; t += 500) await sleep(500);

const dst = join("src", "fx", "studio", `${slug}.js`);
mkdirSync(join("src", "fx", "studio"), { recursive: true });
const code = readFileSync(join("src", "fx", "fire", "campfire.js"), "utf8").replace(/(from\s*)(["'])\.\/([^"']+)\2/g, "$1$2../fire/$3$2");
writeFileSync(dst, code);
tool("Write", { file_path: join(process.cwd(), dst) });
tool("Bash", { command: `node tools/render.mjs studio/${slug}` });
spawnSync(process.execPath, ["tools/render.mjs", `studio/${slug}`], { stdio: "ignore" });
tool("Bash", { command: `node tools/check.mjs studio/${slug}` });
emit({ type: "result", subtype: "success", is_error: false, result: "xong (fake)", session_id: sid });
