// "Cắt part": one whole-character image → rig parts. Heuristic proposal offline, joints editable, then accepted live.
import { S, doc, emit, h, toast } from "./state.js?v=20261125f";
import { analyze } from "../split/index.js?v=20261125f";
import { heuristicSkeleton, segment, cutParts, rigCommands } from "../split/rig.js?v=20261125f";
import { opaqueBounds } from "../split/pixels.js?v=20261125f";
import { blobToCanvas, canvasToRgba, rgbaToCanvas, canvasToBlob, setImage } from "./io.js?v=20261125f";
import { send } from "./agent.js?v=20261125f";
import { signedIn } from "./api.js?v=20261125f";

const PAL = ["#e65050", "#50c878", "#5a8cf0", "#f0c83c", "#c85adc", "#3cd2dc", "#fa8c3c", "#9696ff", "#a0e65a", "#ff78b4", "#c8a064", "#dcdcdc", "#5a5ac8", "#28a05a", "#ff5a5a", "#78b4ff", "#ffd278"];

export async function importWhole(file) {
  const src = canvasToRgba(await blobToCanvas(file));
  const t0 = performance.now();
  const a = analyze(src);
  const spec = heuristicSkeleton(a.native, a.scale, a.phase);
  open({ file, src, a, spec, ms: Math.round(performance.now() - t0) });
}

function open(st) {
  const base = (st.file.name || "nhan-vat").replace(/\.\w+$/, "").replace(/[^\p{L}\p{N}_-]+/gu, "-").toLowerCase();
  st.prefix = doc().bones.length > 1 ? `${base}-` : "";
  st.fill = true;
  const cv = h("canvas");
  const side = h("div", { class: "xx-split-side" });
  const root = h("div", { class: "xx-split" },
    h("header", {}, h("b", { text: "✂ Cắt part" }), h("span", { class: "xx-muted", text: st.file.name }), h("span", { style: "flex:1" }),
      h("button", { class: "xx-btn xx-btn--ghost", text: "Huỷ", onclick: () => { root.remove(); delete window.__split; } }),
      signedIn() ? h("button", { class: "xx-btn xx-btn--ghost", text: "🤖 Nhờ agent đặt khớp", title: "Agent nhìn ảnh, đặt khớp và cắt; part hiện dần trên canvas", onclick: () => askAgent(st, root) }) : null,
      h("button", { class: "xx-btn xx-btn--primary", text: "Chấp nhận", onclick: () => accept(st, root) })),
    h("div", { class: "xx-split-body" }, h("div", { style: "position:relative;min-height:0" }, cv), side));
  document.body.append(root);
  const ctx = cv.getContext("2d");
  let view = null, dragJ = null, showLabels = true, lasso = null; // lasso: { part, pts: [[x, y]] } in source pixels
  window.__split = { st, labelAt: (x, y) => { const c = Math.floor((x - st.a.phase[0]) / st.a.scale), q = Math.floor((y - st.a.phase[1]) / st.a.scale); return st.spec.parts[st.seg.labels[q * st.seg.w + c]]?.name; }, toScreen: (x, y) => { const r = cv.getBoundingClientRect(); return [r.left + view.ox + x * view.k, r.top + view.oy + y * view.k]; } };
  const recut = () => {
    try { st.seg = segment(st.a.native, st.spec, st.a.scale, st.a.phase); st.parts = cutParts(st.a.native, st.seg, st.spec, { fill: st.fill }); st.error = null; }
    catch (e) { st.error = e.message; }
    labelCanvas(); renderSide(); draw();
  };
  let labels = null;
  function labelCanvas() {
    const { w, h: hh, labels: L } = st.seg;
    const im = { width: w, height: hh, data: new Uint8ClampedArray(w * hh * 4) };
    for (let i = 0; i < w * hh; i++) {
      if (L[i] < 0) continue;
      const c = PAL[L[i] % PAL.length], o = i * 4;
      im.data[o] = parseInt(c.slice(1, 3), 16); im.data[o + 1] = parseInt(c.slice(3, 5), 16); im.data[o + 2] = parseInt(c.slice(5, 7), 16); im.data[o + 3] = 120;
    }
    labels = rgbaToCanvas(im);
  }
  const srcCanvas = rgbaToCanvas(st.a.alpha);
  function draw() {
    const r = cv.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    cv.width = r.width * dpr; cv.height = r.height * dpr;
    const k = Math.min((r.width - 40) / st.src.width, (r.height - 40) / st.src.height);
    view = { k, ox: (r.width - st.src.width * k) / 2, oy: (r.height - st.src.height * k) / 2 };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#2a2c33"; ctx.fillRect(0, 0, r.width, r.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(srcCanvas, view.ox, view.oy, st.src.width * k, st.src.height * k);
    if (showLabels && labels) ctx.drawImage(labels, view.ox + st.a.phase[0] * k, view.oy + st.a.phase[1] * k, labels.width * st.a.scale * k, labels.height * st.a.scale * k);
    const P = (j) => [view.ox + st.spec.joints[j][0] * k, view.oy + st.spec.joints[j][1] * k];
    st.spec.parts.forEach((p, i) => {
      const [ax, ay] = P(p.from), [bx, by] = P(p.to);
      ctx.strokeStyle = PAL[i % PAL.length]; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    });
    ctx.lineWidth = 1;
    st.spec.parts.forEach((p, i) => {
      for (const poly of p.claim ?? []) {
        ctx.setLineDash([5, 4]); ctx.strokeStyle = PAL[i % PAL.length]; ctx.lineWidth = 2; ctx.beginPath();
        poly.forEach(([x, y], n) => (n ? ctx.lineTo(view.ox + x * k, view.oy + y * k) : ctx.moveTo(view.ox + x * k, view.oy + y * k)));
        ctx.closePath(); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
      }
    });
    if (lasso?.pts.length) {
      ctx.strokeStyle = "#ffd84a"; ctx.lineWidth = 2; ctx.beginPath();
      lasso.pts.forEach(([x, y], n) => (n ? ctx.lineTo(view.ox + x * k, view.oy + y * k) : ctx.moveTo(view.ox + x * k, view.oy + y * k)));
      if (lasso.hover) ctx.lineTo(lasso.hover[0], lasso.hover[1]);
      ctx.stroke(); ctx.lineWidth = 1;
    }
    for (const j of Object.keys(st.spec.joints)) {
      const [x, y] = P(j);
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fillStyle = dragJ === j ? "#ffd84a" : "#fff"; ctx.fill(); ctx.strokeStyle = "#000"; ctx.stroke();
    }
  }
  const toSrc = (x, y) => [Math.round((x - view.ox) / view.k), Math.round((y - view.oy) / view.k)];
  cv.addEventListener("dblclick", () => {
    if (!lasso) return;
    if (lasso.pts.length >= 3) { const p = st.spec.parts[lasso.part]; p.claim = [...(p.claim ?? []), lasso.pts]; }
    lasso = null; recut();
  });
  cv.addEventListener("pointerdown", (e) => {
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (lasso) { const q = toSrc(x, y), l = lasso.pts.at(-1); if (!l || Math.hypot(q[0] - l[0], q[1] - l[1]) > 2) lasso.pts.push(q); draw(); return; } // a double click lands twice
    let best = null, bd = 10;
    for (const [j, [jx, jy]] of Object.entries(st.spec.joints)) { const d = Math.hypot(view.ox + jx * view.k - x, view.oy + jy * view.k - y); if (d < bd) { bd = d; best = j; } }
    if (best) { dragJ = best; cv.setPointerCapture(e.pointerId); }
  });
  cv.addEventListener("pointermove", (e) => {
    if (lasso) { const r = cv.getBoundingClientRect(); lasso.hover = [e.clientX - r.left, e.clientY - r.top]; draw(); return; }
    if (!dragJ) return;
    const r = cv.getBoundingClientRect();
    st.spec.joints[dragJ] = [Math.round((e.clientX - r.left - view.ox) / view.k), Math.round((e.clientY - r.top - view.oy) / view.k)];
    draw();
  });
  cv.addEventListener("pointerup", () => { if (dragJ) { dragJ = null; recut(); } });
  new ResizeObserver(draw).observe(cv);

  function renderSide() {
    const a = st.a;
    side.replaceChildren(
      h("p", { class: "xx-note", text: `Ảnh ${st.src.width}×${st.src.height}. ${a.background ? "Đã bỏ nền." : "Ảnh đã có nền trong."} ${a.pixelArt ? `Pixel art: 1 pixel gốc = ${a.scale} px, lưới ${a.native.width}×${a.native.height}.` : "Không phải pixel art."} Khung xương gợi ý: ${st.spec.source === "heuristic" ? "tự động (offline)" : st.spec.source}. ${st.ms} ms.` }),
      h("p", { class: "xx-note", text: "Kéo các chấm trắng (khớp) cho đúng vai, khuỷu, hông, gối, đầu gậy… rồi thả: part được cắt lại ngay. Xoá một part để gộp pixel của nó vào part bên cạnh." }),
      h("label", { class: "xx-chk" }, h("input", { type: "checkbox", checked: showLabels, onchange: (e) => { showLabels = e.target.checked; draw(); } }), " Tô màu part"),
      h("label", { class: "xx-chk", style: "margin-left:10px" }, h("input", { type: "checkbox", checked: st.fill, onchange: (e) => { st.fill = e.target.checked; recut(); } }), " Vẽ bù phần bị che"),
      st.error ? h("p", { class: "xx-note", style: "color:#ff9b95", text: st.error }) : null,
      lasso ? h("p", { class: "xx-note", style: "color:#ffd84a", text: `Đang khoanh vùng cho "${st.spec.parts[lasso.part].name}": click từng điểm, bấm đúp để đóng.` }) : null,
      h("p", { class: "xx-note", text: "Đồ đội đầu (mũ, khăn, tóc, tai, sừng) phải theo đầu: bấm ✎ ở part đầu và khoanh trọn chúng, kể cả phần rủ xuống vai." }),
      h("div", { class: "xx-group", text: `Part (${st.spec.parts.length}, dưới → trên)` }),
      ...st.spec.parts.map((p, i) => {
        const part = st.parts?.[i];
        return h("div", { class: "xx-row", style: "padding-left:4px" },
          h("span", { class: "xx-ic", style: `color:${PAL[i % PAL.length]}`, text: "■" }),
          h("span", { class: "xx-nm", text: p.name, title: "Bấm đúp để đổi tên", ondblclick: () => { const n = prompt("Tên part", p.name); if (n) { const old = p.name; p.name = n.trim(); st.spec.parts.forEach((q) => { if (q.parent === old) q.parent = p.name; }); renderSide(); } } }),
          h("span", { class: "xx-tag", text: part ? `${part.pixels}+${part.added}` : "trống" }),
          h("span", { class: "xx-eye", text: "✎", title: "Khoanh vùng cho part này (click từng điểm, bấm đúp để đóng). Mọi pixel trong vùng thuộc part này, ví dụ khoanh cả khăn, mũ, tóc cho đầu.", onclick: () => { lasso = { part: i, pts: [] }; renderSide(); draw(); } }),
          p.claim?.length ? h("span", { class: "xx-eye", text: "⌫", title: "Bỏ các vùng đã khoanh của part này", onclick: () => { delete p.claim; recut(); } }) : null,
          h("span", { class: "xx-eye", text: "✕", title: "Xoá part (gộp vào part bên cạnh)", onclick: () => {
            const gone = st.spec.parts.splice(i, 1)[0];
            st.spec.parts.forEach((q) => { if (q.parent === gone.name) q.parent = gone.parent; });
            recut();
          } }));
      }),
    );
  }
  recut();
}

// Applies the cut as a live stream: each part (image + bone + slot) shows up in turn, all in one undo group.
async function accept(st, root) {
  if (!st.parts) return;
  root.remove();
  const a = st.a, b = opaqueBounds(a.alpha);
  const origin = b ? [b.x + b.w / 2, b.y + b.h] : [st.src.width / 2, st.src.height];
  const cmds = rigCommands(st.spec, st.parts, { scale: a.scale, phase: a.phase, srcHeight: st.src.height, prefix: st.prefix, origin });
  const named = new Map(st.parts.filter(Boolean).map((p) => [st.prefix + p.name, p]));
  S.hist.begin("Tự cắt part");
  S.locked = { label: "Đang dựng part" };
  try {
    let pending = [];
    const flush = async () => { for (const c of pending) S.hist.run(c); pending = []; emit("doc"); await new Promise((r) => setTimeout(r, 60)); };
    for (const c of cmds) {
      if (c.type === "image.add") { const p = named.get(c.path); if (p) await setImage(c.path, await canvasToBlob(rgbaToCanvas(p.image))); }
      pending.push(c);
      if (c.type === "attachment.add") await flush();
    }
    await flush();
    toast(`Đã cắt ${named.size} part. Ctrl+Z để bỏ cả lượt.`);
  } catch (e) { toast("Cắt part lỗi: " + e.message, true); }
  finally { S.locked = null; S.hist.end(); emit("doc"); window.XX?.fitView?.(); }
}

async function askAgent(st, root) {
  root.remove();
  const sidebarBtn = document.querySelector('[data-tab="agent"]');
  sidebarBtn?.click();
  const dt = new DataTransfer();
  dt.items.add(new File([st.file], st.file.name || "nhan-vat.png", { type: st.file.type || "image/png" }));
  const input = document.querySelector('#xx-pane-agent input[type="file"]');
  input.files = dt.files; input.dispatchEvent(new Event("change"));
  await send(`Cắt nhân vật trong ảnh tham khảo ra thành part và rig cho tôi (người/nhân vật: đầu, thân, tay trên/dưới, bàn tay, đùi, ống chân, bàn chân, vật cầm tay nếu có). Dùng split grid để đọc toạ độ khớp, viết skeleton.json rồi split auto --skeleton${st.prefix ? ` --prefix ${st.prefix}` : ""}. Nhìn lại bản render và sửa khớp nếu part cắt sai.`, { mode: "split" });
}
