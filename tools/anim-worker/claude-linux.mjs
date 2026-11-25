#!/usr/bin/env node
// Chạy `claude` trên máy linux qua ssh với đúng các tham số nhận được, stdin/stdout đi thẳng qua.
// Worker trên PC dùng file này làm --claude-bin để bước viết lại prompt tiêu hạn mức tài khoản Claude của linux.
// Host lấy từ ANIM_CLAUDE_SSH_HOST (mặc định "linux").
import { spawn } from "node:child_process";

const host = process.env.ANIM_CLAUDE_SSH_HOST || "linux";
const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const remote = `timeout 150 sh -lc ${q(["claude", ...process.argv.slice(2)].map(q).join(" "))}`;
const child = spawn("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", host, remote], { stdio: "inherit" });
child.on("exit", (code, sig) => process.exit(code ?? (sig ? 1 : 0)));
child.on("error", (e) => { console.error(`ssh ${host} failed: ${e.message}`); process.exit(1); });
