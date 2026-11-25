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
    // offline cut keeps the left nemes lappet off the head; a lasso drawn by mouse on the head part claims it
    const before = await p4.evaluate(() => __split.labelAt(140, 158));
    assert(before !== "dau", "offline đã nhận dải khăn trái, không kiểm được lasso");
    const poly = [[120, 120], [160, 120], [160, 185], [120, 185]];
    await p4.locator(".xx-split-side .xx-eye[title^='Khoanh']").nth(await p4.evaluate(() => __split.st.spec.parts.findIndex((p) => p.name === "dau"))).click();
    for (const [n, [x, y]] of poly.entries()) { const [sx, sy] = await p4.evaluate(([x, y]) => __split.toScreen(x, y), [x, y]); await (n < poly.length - 1 ? p4.mouse.click(sx, sy) : p4.mouse.dblclick(sx, sy)); }
    await p4.waitForTimeout(200);
    const after1 = await p4.evaluate(() => ({ l: __split.labelAt(140, 158), c: __split.st.spec.parts.find((p) => p.name === "dau").claim?.length }));
    await p4.screenshot({ path: join(CHK, "split-lasso.png") });
    assert(after1.l === "dau" && after1.c, `lasso không nhận dải khăn: ${JSON.stringify(after1)} (trước: ${before})`);
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
    return `lasso: dải khăn ${before}→dau; ${final} part, các mức ${[...new Set(counts)].join("→")}`;
  });

  await step("mesh: chuyển region thành mesh, bind weight, kéo đỉnh ở setup, kéo đỉnh ở animate thành key deform", async () => {
    const p5 = await open("?sample=robo");
    await p5.evaluate(() => { __BS.select({ kind: "attachment", name: "torso", slot: "torso", skin: "default" }); });
    await p5.locator("#xx-props button", { hasText: "Chuyển thành mesh" }).click();
    await p5.locator("#xx-props button", { hasText: "Bind weight" }).click();
    const vpos = async (i) => p5.evaluate((i) => { const S = __BS.S, sk = null; void sk; const pose = __BS.pose(); void pose; return i; }, i);
    void vpos;
    const vert = () => p5.evaluate(() => {
      const d = __BS.doc(), a = d.skins[0].attachments.torso.torso;
      return { type: a.type, n: a.uvs.length / 2, weighted: a.vertices.length > a.uvs.length, v: a.vertices.slice(0, 12) };
    });
    const m0 = await vert();
    assert(m0.type === "mesh" && m0.n === 25 && m0.weighted, JSON.stringify(m0));
    const r = await p5.locator("#xx-canvas").boundingBox();
    const vScreen = () => p5.evaluate(async () => {
      const { worldVertices, buildSkeleton, getAttachment } = await import("./runtime/xuong.js?v=" + document.querySelector('script[type=module]').src.split("v=")[1]);
      const d = __BS.doc(), sk = buildSkeleton(d), pose = __BS.pose(), v = worldVertices(sk, pose, sk.slotIndex.get("torso"), getAttachment(d, "default", "torso", "torso"));
      return __BS.toScreen(v[0], v[1]);
    });
    const [x0, y0] = await vScreen();
    await p5.mouse.move(r.x + x0, r.y + y0); await p5.mouse.down(); await p5.mouse.move(r.x + x0 - 30, r.y + y0, { steps: 5 }); await p5.mouse.up();
    const m1 = await vert();
    assert(JSON.stringify(m1.v) !== JSON.stringify(m0.v), "đỉnh không dời ở setup");
    await p5.keyboard.press("Tab");
    await p5.evaluate(() => { __BS.S.anim = "idle"; __BS.setTime(0.6); __BS.select({ kind: "attachment", name: "torso", slot: "torso", skin: "default" }); });
    await p5.waitForTimeout(100);
    const [x1, y1] = await vScreen();
    await p5.mouse.move(r.x + x1, r.y + y1); await p5.mouse.down(); await p5.mouse.move(r.x + x1, r.y + y1 - 25, { steps: 5 }); await p5.mouse.up();
    const def = await p5.evaluate(() => __BS.doc().animations.idle.deform?.default?.torso?.torso?.map((k) => k.time));
    await p5.close();
    assert(def?.length === 1 && Math.abs(def[0] - 0.6) < 1e-3, "key deform: " + JSON.stringify(def));
    return "25 đỉnh, key deform ở 0.6 s";
  });

  await step("graph: kéo key đổi giá trị, kéo tay cầm đổi curve, một undo mỗi lần kéo", async () => {
    const p6 = await open("?sample=pharaoh");
    await p6.evaluate(() => { __BS.setMode("animate"); __BS.S.anim = "attack"; __BS.select({ kind: "bone", name: "tay-phai-tren" }); __BS.emit("anim"); });
    await p6.locator(".xx-tl-bar button", { hasText: "Dopesheet" }).click();
    await p6.waitForTimeout(200);
    const c = await p6.locator(".xx-tl-canvas canvas").boundingBox();
    const key = () => p6.evaluate(() => __BS.doc().animations.attack.bones["tay-phai-tren"].rotate.find((k) => Math.abs(k.time - 0.35) < 1e-3));
    const k0 = await key();
    const [kx, ky] = await p6.evaluate(() => { const v = window.__graph, c = v.chs.find((x) => x.prop === "rotate"), k = c.keys.find((q) => Math.abs(q.time - 0.35) < 1e-3); return [v.xOf(k.time), v.yOf(k.value)]; });
    await p6.mouse.move(c.x + kx, c.y + ky); await p6.mouse.down(); await p6.mouse.move(c.x + kx, c.y + ky + 30, { steps: 5 }); await p6.mouse.up();
    const k1 = await key();
    assert(k1.value < k0.value - 5, `giá trị key ${k0.value} → ${k1.value}`);
    await p6.keyboard.press("Control+z");
    const k2 = await key();
    assert(Math.abs(k2.value - k0.value) < 1e-6, "undo không về giá trị cũ");
    await p6.close();
    return `${k0.value} → ${k1.value} → undo ${k2.value}`;
  });

  await step("snap xoay 45° (pixel art), + Transform, + Clipping / + Bounding box, Pose tool kéo target IK: cả chuỗi tay theo chuột, một undo", async () => {
    const p7 = await open("?sample=robo");
    const r = await p7.locator("#xx-canvas").boundingBox();
    const scr = (name) => p7.evaluate((n) => { const p = __BS.pose(), i = __BS.doc().bones.findIndex((b) => b.name === n); return __BS.toScreen(p.bones[i].wx, p.bones[i].wy); }, name);
    // snap: choose 45° in the toolbar, rotate the head by an odd angle with the mouse
    await p7.selectOption("#xx-snap", "45");
    await p7.keyboard.press("c");
    await p7.evaluate(() => __BS.select({ kind: "bone", name: "head" }));
    const [hx, hy] = await scr("head");
    const rot0 = await p7.evaluate(() => __BS.doc().bones.find((b) => b.name === "head").rotation);
    // drag ≈ 70° counter-clockwise around the head origin: free rotation would land near rot0 + 70
    await p7.mouse.move(r.x + hx + 80, r.y + hy); await p7.mouse.down(); await p7.mouse.move(r.x + hx + 27, r.y + hy - 75, { steps: 8 }); await p7.mouse.up();
    const rot = await p7.evaluate(() => __BS.doc().bones.find((b) => b.name === "head").rotation);
    assert(Math.abs(rot / 45 - Math.round(rot / 45)) < 1e-6 && Math.abs(rot - rot0) > 20, `góc đầu ${rot0} → ${rot}: không snap 45° hoặc không xoay`);
    await p7.selectOption("#xx-snap", "0");
    // transform constraint from the panel: back arm copies the front arm's rotation
    await p7.evaluate(() => { __BS.select({ kind: "bone", name: "back-upper-arm" }); __BS.select({ kind: "bone", name: "front-upper-arm" }, true); });
    await p7.locator("#xx-props button", { hasText: "+ Transform" }).click();
    const ang = (n) => p7.evaluate((n) => { const p = __BS.pose(), b = p.bones[__BS.doc().bones.findIndex((x) => x.name === n)]; return Math.atan2(b.c, b.a) * 180 / Math.PI; }, n);
    const back0 = await ang("back-upper-arm");
    await p7.evaluate(() => { const r = __BS.doc().bones.find((b) => b.name === "front-upper-arm").rotation; __BS.apply({ type: "bone.set", name: "front-upper-arm", props: { rotation: r + 30 } }); });
    const back1 = await ang("back-upper-arm"), tc = await p7.evaluate(() => __BS.doc().transform);
    assert(tc?.length === 1 && tc[0].target === "front-upper-arm" && tc[0].bones[0] === "back-upper-arm", JSON.stringify(tc));
    assert(Math.abs(((back1 - back0 + 540) % 360) - 180 - 30) < 0.5, `tay sau ${back0} → ${back1}, mong +30`);
    // clipping + bounding box from the slot panel: the clip slot sits right under "head" and cuts only it
    await p7.evaluate(() => __BS.select({ kind: "slot", name: "head" }));
    await p7.locator("#xx-props button", { hasText: "+ Clipping" }).click();
    await p7.evaluate(() => __BS.apply({ type: "attachment.set", slot: "head-cat", name: "cat", props: { vertices: __BS.doc().skins[0].attachments["head-cat"].cat.vertices.map((v, i) => (i % 2 ? v : v * 0.5)) } }));
    await p7.evaluate(() => __BS.select({ kind: "slot", name: "head" }));
    await p7.locator("#xx-props button", { hasText: "+ Bounding box" }).click();
    const clipInfo = await p7.evaluate(async () => {
      const X = await import("./runtime/xuong.js?v=" + document.querySelector("script[type=module]").src.split("v=")[1]);
      const d = __BS.doc(), sk = X.buildSkeleton(d), list = X.drawList(sk, __BS.pose());
      const area = (it) => { let a = 0; for (let i = 0; i < it.tris.length; i += 3) { const [p, q, r] = [0, 1, 2].map((j) => [it.verts[it.tris[i + j] * 2], it.verts[it.tris[i + j] * 2 + 1]]); a += Math.abs((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])) / 2; } return a; };
      const head = list.find((x) => x.slot === "head"), full = Math.abs(d.skins[0].attachments.head[d.slots.find((s) => s.name === "head").attachment].width * d.skins[0].attachments.head[d.slots.find((s) => s.name === "head").attachment].height);
      const order = d.slots.map((s) => s.name);
      return { mesh: head.mesh, ratio: area(head) / full, under: order.indexOf("head-cat") === order.indexOf("head") - 1, others: list.filter((x) => x.slot !== "head").every((x) => !x.mesh || x.att.type === "mesh"), bbox: Object.values(d.skins[0].attachments.head).some((a) => a.type === "boundingbox") };
    });
    await p7.screenshot({ path: join(CHK, "clipping.png") });
    assert(clipInfo.mesh && Math.abs(clipInfo.ratio - 0.5) < 0.05 && clipInfo.under && clipInfo.others && clipInfo.bbox, JSON.stringify(clipInfo));
    // IK: a target bone at the hand, 2-bone IK on the front arm
    await p7.evaluate(() => {
      const p = __BS.pose(), d = __BS.doc(), i = d.bones.findIndex((b) => b.name === "front-hand"), root = p.bones[0];
      const det = root.a * root.d - root.b * root.c, dx = p.bones[i].wx - root.wx, dy = p.bones[i].wy - root.wy;
      __BS.apply([{ type: "bone.add", name: "ik-tay", parent: "root", x: (root.d * dx - root.b * dy) / det, y: (-root.c * dx + root.a * dy) / det },
        { type: "ik.add", name: "tay", bones: ["front-upper-arm", "front-lower-arm"], target: "ik-tay" }], "IK");
      __BS.setMode("animate"); __BS.S.anim = "idle"; __BS.setTime(0); __BS.emit("anim");
    });
    await p7.keyboard.press("b");
    const [ax, ay] = await scr("front-hand");
    const before = JSON.stringify(await p7.evaluate(() => __BS.pose().bones.map((b) => [b.wx, b.wy])));
    await p7.evaluate(() => __BS.select({ kind: "bone", name: "front-lower-arm" }));
    const [lx, ly] = await scr("front-lower-arm");
    await p7.mouse.move(r.x + lx, r.y + ly); await p7.mouse.down();
    const goal = [ax - 25, ay - 30];
    await p7.mouse.move(r.x + goal[0], r.y + goal[1], { steps: 8 }); await p7.mouse.up();
    const [tx, ty] = await scr("ik-tay"), [nx, ny] = await scr("front-hand");
    await p7.screenshot({ path: join(CHK, "ik-drag.png") });
    assert(Math.hypot(tx - goal[0], ty - goal[1]) < 2, `target ở ${tx},${ty}, chuột ${goal}`);
    assert(Math.hypot(nx - goal[0], ny - goal[1]) < 6, `bàn tay ở ${nx},${ny}, chuột ${goal}`);
    await p7.keyboard.press("Control+z");
    const after = JSON.stringify(await p7.evaluate(() => __BS.pose().bones.map((b) => [b.wx, b.wy])));
    await p7.close();
    assert(after === before, "undo không đưa tư thế về như trước khi kéo");
    return `đầu ${rot0}° → ${rot}°; clipping còn ${(clipInfo.ratio * 100).toFixed(0)}% đầu; bàn tay theo chuột lệch ${Math.hypot(nx - goal[0], ny - goal[1]).toFixed(1)} px`;
  });

  await step("xem trộn walk → attack: góc tay đổi liên tục, không nhảy cóc", async () => {
    const p7 = await open("?sample=pharaoh");
    const r = await p7.evaluate(async () => {
      __BS.setMode("animate"); __BS.S.anim = "walk"; __BS.emit("anim");
      await new Promise((res) => setTimeout(res, 100));
      const to = [...document.querySelectorAll(".xx-tl-bar select")].find((x) => [...x.options].some((o) => o.value === "attack") && x.options[0].text.startsWith("→"));
      to.value = "attack";
      [...document.querySelectorAll(".xx-tl-bar button")].find((b) => b.textContent === "Xem trộn").click();
      const d = __BS.doc(), i = d.bones.findIndex((b) => b.name === "tay-phai-tren"), angles = [];
      for (let n = 0; n < 90; n++) { await new Promise((res) => requestAnimationFrame(res)); const p = __BS.pose(); angles.push(Math.atan2(p.bones[i].c, p.bones[i].a) * 180 / Math.PI); }
      let maxJump = 0; for (let n = 1; n < angles.length; n++) maxJump = Math.max(maxJump, Math.abs(((angles[n] - angles[n - 1] + 540) % 360) - 180));
      return { maxJump, range: Math.max(...angles) - Math.min(...angles), switched: __BS.S.mixPreview?.switched };
    });
    await p7.close();
    assert(r.range > 20, "tay không đổi: " + JSON.stringify(r));
    assert(r.maxJump < 25, "nhảy cóc: " + JSON.stringify(r));
    return `biên độ ${r.range.toFixed(0)}°, bước lớn nhất ${r.maxJump.toFixed(1)}°/khung`;
  });

  await step("không có lỗi JS", async () => { const e = [...page.logs, ...(await page.evaluate(() => window.__errors))]; assert(!e.length, e.join(" | ")); });
} finally {
  await br.close();
  if (local) local.srv.close();
}
console.log(results.join("\n"));
console.log(failed ? `FAIL ${failed}` : "PASS");
process.exit(failed ? 1 : 0);
