// Mở runtime/demo-three.html, chụp ảnh, rồi so bộ vẽ three.js với canvas2D (pharaoh idle t=0, cùng tỉ lệ).
import { serve, browser, openEditor } from "./pw.mjs";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const OUT = "/home/bui-thanh-thuong/bone-studio/.chk/runtime-three.png";
mkdirSync(dirname(OUT), { recursive: true });
const { srv, base } = await serve();
const br = await browser();
let fail = 0;
const check = (ok, msg) => { console.log((ok ? "PASS " : "FAIL ") + msg); if (!ok) fail++; };
try {
  const page = await openEditor(br, `${base}/bone-studio/runtime/demo-three.html`, { width: 1100, height: 640 });
  await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelector("#a-pharaoh button:nth-child(2)")?.click());
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT });
  const errs = await page.evaluate(() => window.__errors);
  check(errs.length === 0 && page.logs.length === 0, `không lỗi trang (${[...errs, ...page.logs].join(" | ")})`);

  const r = await page.evaluate(async () => {
    const { THREE, XuongMesh, loadSkeleton } = window.__xt;
    const { XuongPlayer } = await import("./xuong-player.js?v=20261125c");
    const data = await loadSkeleton("demo/pharaoh/pharaoh.xuong.json");
    const S = 2, W = 512, H = 512, OX = 256, OY = 440; // gốc xương ở pixel (OX,OY), tỉ lệ S
    // canvas2D
    const c2 = new OffscreenCanvas(W, H), g2 = c2.getContext("2d");
    const p = new XuongPlayer(data); p.play("idle"); p.update(0);
    p.draw(g2, OX, OY, { scale: S });
    // three
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const rd = new THREE.WebGLRenderer({ canvas: cv, antialias: false, alpha: true, preserveDrawingBuffer: true });
    rd.setPixelRatio(1); rd.setSize(W, H, false); rd.setClearColor(0x000000, 0);
    const cam = new THREE.OrthographicCamera(-OX, W - OX, OY, OY - H, -10, 10);
    const sc = new THREE.Scene();
    const m = new XuongMesh(THREE, data, { pixelsPerUnit: 1 });
    m.play("idle"); m.update(0); m.scale.setScalar(S); sc.add(m);
    rd.render(sc, cam);
    const c3 = new OffscreenCanvas(W, H), g3 = c3.getContext("2d");
    g3.drawImage(cv, 0, 0);
    const A = g2.getImageData(0, 0, W, H).data, B = g3.getImageData(0, 0, W, H).data;
    let inter = 0, uni = 0, n = 0, sum = 0, a2 = 0, a3 = 0;
    for (let i = 0; i < A.length; i += 4) {
      const x = A[i + 3] > 127, y = B[i + 3] > 127;
      if (x) a2++; if (y) a3++;
      if (x && y) inter++; if (x || y) uni++;
      if (A[i + 3] >= 250 && B[i + 3] >= 250) { n++; sum += (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2])) / 3; }
    }
    return { iou: inter / uni, mean: sum / Math.max(1, n), opaque: n, a2, a3, bounds: m.bounds() };
  });
  console.log(JSON.stringify(r));
  check(r.a2 > 500, `canvas2D có vẽ (${r.a2} px)`);
  check(r.iou >= 0.97, `IoU mặt nạ alpha = ${r.iou.toFixed(4)} (>= 0.97)`);
  check(r.mean < 6, `sai khác RGB trung bình ${r.mean.toFixed(2)}/255 trên ${r.opaque} px đục (< 6)`);
} finally { await br.close(); srv.close(); }
process.exit(fail ? 1 : 0);
