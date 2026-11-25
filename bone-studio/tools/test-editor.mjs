// End-to-end in headless Chrome: rig with the mouse, key with auto key, export → re-import → pixel compare,
// save → reload, mock agent as one undo step, one-click auto split. BASE env = deployed site (default: local server).
import { serve, browser, openEditor } from "./pw.mjs";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CHK = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".chk", "e2e");
mkdirSync(CHK, { recursive: true });
const local = !process.env.BASE && (await serve());
const BASE = process.env.BASE ?? local.base;
const URL0 = `${BASE}/bone-studio/index.html`;
let failed = 0;
const results = [];
async function step(name, fn) {
  const t = Date.now();
  try { const note = await fn(); results.push(`ok   ${name}${note ? ` (${note})` : ""} ${Date.now() - t} ms`); }
  catch (e) { failed++; results.push(`FAIL ${name}: ${e.message}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

const br = await browser();
try {
  const ctx = await br.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const open = async (q) => {
    const page = await ctx.newPage();
    page.on("dialog", (d) => d.accept(page.nextPrompt ?? ""));
    const logs = [];
    page.on("pageerror", (e) => logs.push(String(e)));
    await page.goto(`${URL0}${q}`);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
    await page.waitForTimeout(200);
    page.logs = logs;
    return page;
  };
  const page = await open("?sample=empty");
  const view = await page.locator("#xx-canvas").boundingBox();
  const cx = view.x + view.width / 2, cy = view.y + view.height / 2;

  await step("nhập ảnh rời tạo ảnh + slot", async () => {
    const n = await page.evaluate(async () => {
      const names = ["torso", "head", "upper-arm", "lower-arm"];
      const files = await Promise.all(names.map(async (n) => new File([await (await fetch(`samples/robo/images/${n}.png`)).blob()], `${n}.png`, { type: "image/png" })));
      await __BS.io.importImages(files);
      return { images: Object.keys(__BS.doc().images).length, slots: __BS.doc().slots.length };
    });
    assert(n.images === 4 && n.slots === 4, JSON.stringify(n));
  });

  await step("tạo bone bằng chuột (N, kéo)", async () => {
    await page.evaluate(() => { __BS.select({ kind: "bone", name: "root" }); Object.assign(__BS.S.view, { x: 0, y: 40, zoom: 2 }); });
    await page.keyboard.press("n");
    await page.mouse.move(cx, cy + 60); await page.mouse.down(); await page.mouse.move(cx, cy - 20, { steps: 6 }); await page.mouse.up();
    const b = await page.evaluate(() => __BS.doc().bones.find((x) => x.name === "bone"));
    assert(b && b.length > 10 && Math.abs(b.rotation - 90) < 3, JSON.stringify(b));
    return `dài ${b.length}, xoay ${b.rotation}`;
  });

  await step("Ctrl+click ảnh khi tạo bone: bone mới mang tên ảnh, slot chuyển sang", async () => {
    const pos = await page.evaluate(() => { const p = __BS.pose(); const sk = __BS.S; void sk; const d = __BS.doc(); const i = d.slots.findIndex((s) => s.name === "head"); void i; return __BS.toScreen(0, 20); });
    const r = await page.locator("#xx-canvas").boundingBox();
    // move the head image to a free spot first so the click hits it
    await page.evaluate(() => __BS.apply({ type: "attachment.set", slot: "head", name: "head", props: { x: 120, y: 60 } }));
    await page.evaluate(() => __BS.select({ kind: "bone", name: "root" }));
    const [hx, hy] = await page.evaluate(() => __BS.toScreen(120, 60));
    await page.keyboard.down("Control"); await page.mouse.click(r.x + hx, r.y + hy); await page.keyboard.up("Control");
    const s = await page.evaluate(() => __BS.doc().slots.find((x) => x.name === "head").bone);
    assert(s === "head", "slot head đang ở bone " + s);
    void pos;
  });

  await step("xoay bone bằng chuột trong setup (C, kéo), một bước undo", async () => {
    await page.keyboard.press("c");
    await page.evaluate(() => __BS.select({ kind: "bone", name: "bone" }));
    const [bx, by] = await page.evaluate(() => { const p = __BS.pose(); const d = __BS.doc(); const i = d.bones.findIndex((b) => b.name === "bone"); return __BS.toScreen(p.bones[i].wx, p.bones[i].wy); });
    const r = await page.locator("#xx-canvas").boundingBox();
    const before = await page.evaluate(() => __BS.doc().bones.find((b) => b.name === "bone").rotation);
    await page.mouse.move(r.x + bx + 60, r.y + by); await page.mouse.down(); await page.mouse.move(r.x + bx, r.y + by - 60, { steps: 8 }); await page.mouse.up();
    const after = await page.evaluate(() => __BS.doc().bones.find((b) => b.name === "bone").rotation);
    assert(Math.abs(((after - before + 540) % 360) - 180 - 90) < 4, `xoay ${before} → ${after}`);
    await page.keyboard.press("Control+z");
    const undone = await page.evaluate(() => __BS.doc().bones.find((b) => b.name === "bone").rotation);
    assert(Math.abs(undone - before) < 1e-6, `undo về ${undone}, mong ${before}`);
    await page.keyboard.press("Control+Shift+z");
    return `${before.toFixed(1)}° → ${after.toFixed(1)}°`;
  });

  await step("animate: tạo animation, auto key khi xoay ở hai khung, phát", async () => {
    await page.keyboard.press("Tab");
    page.nextPrompt = "vay";
    await page.locator(".xx-tl-bar button", { hasText: "+" }).first().click();
    await page.waitForTimeout(100);
    const [bx, by] = await page.evaluate(() => { const p = __BS.pose(); const i = __BS.doc().bones.findIndex((b) => b.name === "bone"); return __BS.toScreen(p.bones[i].wx, p.bones[i].wy); });
    const r = await page.locator("#xx-canvas").boundingBox();
    await page.evaluate(() => { __BS.select({ kind: "bone", name: "bone" }); __BS.setTime(0); });
    await page.mouse.move(r.x + bx + 50, r.y + by - 5); await page.mouse.down(); await page.mouse.move(r.x + bx + 50, r.y + by + 5, { steps: 3 }); await page.mouse.up();
    await page.evaluate(() => __BS.setTime(0.5));
    await page.mouse.move(r.x + bx + 50, r.y + by); await page.mouse.down(); await page.mouse.move(r.x + bx + 30, r.y + by - 45, { steps: 6 }); await page.mouse.up();
    const keys = await page.evaluate(() => __BS.doc().animations.vay?.bones?.bone?.rotate?.map((k) => [k.time, Math.round(k.value)]));
    assert(keys?.length === 2 && keys[1][0] === 0.5, JSON.stringify(keys));
    await page.evaluate(() => __BS.setTime(0));
    await page.keyboard.press("Space");
    await page.waitForTimeout(400);
    const t = await page.evaluate(() => __BS.S.time);
    await page.keyboard.press("Space");
    assert(t > 0.1, "playhead không chạy: " + t);
    await page.screenshot({ path: join(CHK, "animate.png") });
    return `key ${JSON.stringify(keys)}, phát tới ${t.toFixed(2)} s`;
  });

  await step("xuất JSON kiểu Spine rồi nhập lại: khung hình giống từng pixel", async () => {
    const r = await page.evaluate(async () => {
      const io = __BS.io;
      const before = io.renderFrames({ anim: "vay", fps: 10 }).map((c) => c.getContext("2d").getImageData(0, 0, c.width, c.height).data);
      const { exportBundle } = await import("./src/export.js");
      const files = (await exportBundle(__BS.doc(), io.browserIO(), { format: "spine", base: "t" })).map((f) => new File([f.data], f.name));
      await io.importSpine(files);
      const after = io.renderFrames({ anim: "vay", fps: 10 }).map((c) => c.getContext("2d").getImageData(0, 0, c.width, c.height).data);
      let diff = 0, max = 0;
      before.forEach((b, i) => { for (let k = 0; k < b.length; k++) { const d = Math.abs(b[k] - (after[i]?.[k] ?? 0)); if (d > 2) diff++; max = Math.max(max, d); } });
      return { frames: before.length, same: before.length === after.length, diff, max, names: files.map((f) => f.name) };
    });
    assert(r.same && r.diff === 0, JSON.stringify(r));
    return `${r.frames} khung, ${r.names.join(", ")}`;
  });

  await step("lưu IndexedDB, mở lại trang: dự án còn nguyên", async () => {
    const before = await page.evaluate(async () => { await __BS.io.saveLocal(); return JSON.stringify(__BS.doc()); });
    const p2 = await open("");
    const after = await p2.evaluate(() => JSON.stringify(__BS.doc()));
    await p2.close();
    assert(before === after, "khác nhau sau khi mở lại");
  });

  await step("agent giả (?mock=1): canvas đổi dần, một bước undo bỏ cả lượt", async () => {
    const p3 = await open("?sample=robo&mock=1");
    const n0 = await p3.evaluate(() => JSON.stringify(__BS.doc()));
    await p3.locator('[data-tab="agent"]').click();
    await p3.locator("#xx-pane-agent textarea").fill("thêm một bone vẫy tay");
    await p3.locator("#xx-pane-agent button", { hasText: "Gửi cho agent" }).click();
    const seen = [];
    for (let i = 0; i < 40; i++) {
      await p3.waitForTimeout(150);
      const s = await p3.evaluate(() => ({ bones: __BS.doc().bones.length, anims: Object.keys(__BS.doc().animations).length, locked: !!__BS.S.locked }));
      seen.push(s);
      if (!s.locked && i > 3) break;
    }
    const steps = new Set(seen.map((s) => `${s.bones}/${s.anims}`)).size;
    assert(steps >= 3, "không thấy canvas đổi dần: " + JSON.stringify(seen));
    await p3.screenshot({ path: join(CHK, "agent-mock.png") });
    await p3.keyboard.press("Control+z");
    const n1 = await p3.evaluate(() => JSON.stringify(__BS.doc()));
    await p3.close();
    assert(n0 === n1, "undo không đưa về như trước lượt agent");
    return `${steps} trạng thái khác nhau trong lượt`;
  });

  await step("ảnh nguyên con: tự cắt part, nhận, part hiện dần, một undo", async () => {
    const p4 = await open("?sample=empty");
    await p4.evaluate(async () => {
      const f = new File([await (await fetch("samples/pharaoh/pharaoh-owner.png")).blob()], "pharaoh.png", { type: "image/png" });
      await __BS.importWhole(f);
    });
    await p4.waitForSelector(".xx-split");
    await p4.waitForTimeout(300);
    await p4.screenshot({ path: join(CHK, "split-screen.png") });
    await p4.locator(".xx-split button", { hasText: "Chấp nhận" }).click();
    const counts = [];
    for (let i = 0; i < 40; i++) { await p4.waitForTimeout(100); const c = await p4.evaluate(() => ({ s: __BS.doc().slots.length, l: !!__BS.S.locked })); counts.push(c.s); if (!c.l && i > 2) break; }
    const final = counts[counts.length - 1];
    assert(final >= 8, "ít part: " + final);
    assert(new Set(counts).size >= 3, "part không hiện dần: " + counts.join(","));
    await p4.screenshot({ path: join(CHK, "split-accepted.png") });
    await p4.keyboard.press("Control+z");
    const after = await p4.evaluate(() => __BS.doc().slots.length);
    await p4.close();
    assert(after === 0, "undo còn " + after + " slot");
    return `${final} part, các mức ${[...new Set(counts)].join("→")}`;
  });

  await step("không có lỗi JS", async () => { const e = [...page.logs, ...(await page.evaluate(() => window.__errors))]; assert(!e.length, e.join(" | ")); });
} finally {
  await br.close();
  local?.srv.close();
}
console.log(results.join("\n"));
console.log(failed ? `FAIL ${failed}` : "PASS");
process.exit(failed ? 1 : 0);
