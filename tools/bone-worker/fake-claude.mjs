#!/usr/bin/env node
// Test double for `claude -p --output-format stream-json`: reads the prompt on stdin and really runs bone-cli.
// agent mode: one bone + one 3-key animation in 3 separate `apply` calls, 0.4 s apart.
// split mode (brief contains "[mode:split]"): `bone-cli split auto` on the first reference picture.
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "bone-studio", "cli", "bone-cli.mjs");
const args = process.argv.slice(2);
let input = "";
for await (const c of process.stdin) input += c;
const emit = (o) => process.stdout.write(JSON.stringify(o) + "\n");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (t) => emit({ type: "assistant", message: { content: [{ type: "text", text: t }] } });
const tool = (name, inp) => emit({ type: "assistant", message: { content: [{ type: "tool_use", name, input: inp }] } });
const cli = (...a) => spawnSync(process.execPath, [CLI, ...a], { encoding: "utf8", env: process.env });

const sid = args.includes("--resume") ? args[args.indexOf("--resume") + 1] : "fake-" + Math.random().toString(16).slice(2, 10);
if (process.env.FAKE_PIDFILE) writeFileSync(process.env.FAKE_PIDFILE, String(process.pid));
emit({ type: "system", subtype: "init", session_id: sid });

const gap = +(process.env.FAKE_GAP_MS ?? 400);
if (input.includes("[mode:split]")) {
  const ref = (input.match(/(\/\S*refs\/\S+?\.(?:png|PNG))/) ?? [])[1];
  text("Mình đặt khung xương tự động rồi cắt part.");
  tool("Bash", { command: `node bone-cli.mjs split auto ${ref}` });
  const r = cli("split", "auto", ref);
  emit({ type: "result", subtype: r.status ? "error" : "success", is_error: !!r.status, result: r.status ? r.stderr : "đã cắt part (fake)", session_id: sid });
  process.exit(r.status ? 1 : 0);
}

text("Mình thêm một bone rồi cho nó vẫy tay.");
const steps = [
  [{ type: "bone.add", name: "agent-bone", parent: "root", x: 10, y: 20, length: 30 }, { type: "anim.add", name: "agent-wave" },
    { type: "key.set", anim: "agent-wave", track: { bone: "agent-bone", prop: "rotate" }, time: 0, value: 0 }],
  [{ type: "key.set", anim: "agent-wave", track: { bone: "agent-bone", prop: "rotate" }, time: 0.5, value: 40 }],
  [{ type: "key.set", anim: "agent-wave", track: { bone: "agent-bone", prop: "rotate" }, time: 1, value: 0 }],
];
for (const [i, cmds] of steps.entries()) {
  tool("Bash", { command: `node bone-cli.mjs apply '${JSON.stringify(cmds)}' --note "bước ${i + 1}"` });
  const r = cli("apply", JSON.stringify(cmds), "--note", `bước ${i + 1}`);
  if (r.status) { emit({ type: "result", subtype: "error", is_error: true, result: r.stderr, session_id: sid }); process.exit(1); }
  await sleep(gap);
}
mkdirSync("out", { recursive: true });
tool("Bash", { command: "node bone-cli.mjs strip --anim agent-wave --out out/strip.png" });
cli("strip", "--anim", "agent-wave", "--out", join("out", "strip.png"));
tool("Read", { file_path: join(process.cwd(), "out", "strip.png") });
text("Xong: thêm bone agent-bone và animation agent-wave.");
emit({ type: "result", subtype: "success", is_error: false, result: "Thêm agent-bone và animation agent-wave (3 key).", session_id: sid });
