// Dựng lại uGUI gốc từ data/sk-ui.js (sinh bởi tools/ui/build_ui.py): RectTransform, Image (thường/9 mảnh/tô đầy),
// Text, Shadow/Outline, Horizontal/VerticalLayoutGroup. Canvas chuẩn 1280x720, co theo chiều cao như CanvasScaler gốc.
(function () {
  'use strict';
  const SK = window.SK = window.SK || {};
  const U = window.SK_UI;
  const ug = SK.ugui = { ok: false };
  if (!U) return;

  const sheet = new Image();
  const tintCache = new Map();
  let fontsReady = false;

  ug.load = function () {
    const jobs = [new Promise(res => { sheet.onload = res; sheet.onerror = res; sheet.src = (ug.base || '') + U.sheet; })];
    if (window.FontFace && document.fonts) {
      for (const name in U.fonts) {
        const url = U.fonts[name];
        if (!url) continue;
        const ff = new FontFace('skui_' + name, 'url(' + (ug.base || '') + url + ')');
        jobs.push(ff.load().then(f => { document.fonts.add(f); }, () => SK.warnOnce && SK.warnOnce('font' + name, 'font failed ' + name)));
      }
    }
    return Promise.all(jobs).then(() => { fontsReady = true; ug.ok = sheet.naturalWidth > 0; });
  };

  function clone(n) {
    const o = Object.assign({}, n);
    if (n.img) o.img = Object.assign({}, n.img);
    if (n.txt) o.txt = Object.assign({}, n.txt);
    if (n.sz) o.sz = n.sz.slice();
    if (n.a) o.a = n.a.slice();
    if (n.p) o.p = n.p.slice();
    if (n.sc) o.sc = n.sc.slice();
    if (n.k) o.k = n.k.map(clone);
    return o;
  }

  ug.clone = clone;

  // Một bản dựng của prefab. q('state_bar/hp_bar/img') trả nút để mã game đổi off/sz/img.sp/img.fa/txt.s.
  ug.inst = function (key) {
    const root = clone(U.prefabs[key]);
    const idx = {};
    const playing = new Map();
    function walk(n, path) {
      idx[path] = n;
      if (n.k) for (const c of n.k) walk(c, path ? path + '/' + c.n : c.n);
    }
    walk(root, '');
    return {
      root,
      // Dựng lại bảng đường dẫn sau khi mã game chuyển nút sang cha khác.
      reindex() { for (const p in idx) delete idx[p]; walk(root, ''); },
      q(path) {
        const n = idx[path];
        if (!n) SK.warnOnce && SK.warnOnce('ugui' + key + path, 'ugui node not found: ' + key + '/' + path);
        return n;
      },
      draw(ctx, wPx, hPx) { drawRoot(ctx, root, wPx, hPx); },
      // Phát clip Animator gốc của nút `path` (tracks đã đổi sang đường dẫn tương đối). Gọi tick(dt) mỗi khung.
      play(path, clip) {
        const n = this.q(path), c = n && n.an && n.an[clip];
        if (!c) { SK.warnOnce && SK.warnOnce('uclip' + path + clip, 'ugui clip not found: ' + path + ' ' + clip); return 0; }
        playing.set(n, { c, t: 0, base: path });
        applyClip(this, path, c, 0);
        return c.len;
      },
      tick(dt) {
        for (const [n, st] of playing) {
          st.t += dt;
          applyClip(this, st.base, st.c, Math.min(st.t, st.c.len));
          if (st.t >= st.c.len) playing.delete(n);
        }
      },
      rectOf(path, wPx, hPx) { return rectOf(root, path, wPx, hPx); }
    };
  };

  // ---------------------------------------------------------------- clip
  // seg[i] = hệ số bậc ba của đoạn bắt đầu ở khoá i (đường streamed của Unity); không có thì nội suy tuyến tính.
  function sample(keys, t, step, seg) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (t < keys[i][0]) {
        const [t0, v0] = keys[i - 1], [t1, v1] = keys[i];
        if (step) return v0;
        if (seg && seg[i - 1]) { const [a, b, c] = seg[i - 1], d = t - t0; return ((a * d + b) * d + c) * d + v0; }
        return v0 + (v1 - v0) * (t - t0) / (t1 - t0);
      }
    }
    return keys[keys.length - 1][1];
  }

  // Cùng nghĩa với apply_clip trong tools/ui/build_ui.py.
  function applyClip(inst, base, c, t) {
    for (const tr of c.tracks) {
      const n = inst.q(base ? (tr.path ? base + '/' + tr.path : base) : tr.path);
      if (n) applyTrack(n, tr, t);
    }
  }
  function applyTrack(n, tr, t) {
    const [prop, ax] = tr.prop.split('.');
    const step = prop === 'm_IsActive' || prop === 'm_Enabled';
    const v = sample(tr.keys, t, step, tr.seg);
    const i = 'xyzw'.indexOf(ax) >= 0 ? 'xyzw'.indexOf(ax) : 'rgba'.indexOf(ax);
    if (prop === 'm_AnchoredPosition') n.p[i] = v;
    else if (prop === 'm_SizeDelta') n.sz[i] = v;
    else if (prop === 'm_AnchorMin' && i < 2) { n.a = (n.a || [0.5, 0.5, 0.5, 0.5]).slice(); n.a[i] = v; }
    else if (prop === 'm_AnchorMax' && i < 2) { n.a = (n.a || [0.5, 0.5, 0.5, 0.5]).slice(); n.a[2 + i] = v; }
    else if (prop === 'm_LocalScale') { n.sc = n.sc || [1, 1]; if (i < 2) n.sc[i] = v; }
    else if (prop === 'm_IsActive') { if (v) delete n.off; else n.off = 1; }
    else if (prop === 'm_Enabled') { const g = n.img || n.txt; if (g) { if (v) delete g.off; else g.off = 1; } }
    else if (prop === 'm_Color') { const g = n.img || n.txt; if (g) { g.c = g.c.slice(); g.c[i] = v; } }
    else if (prop === 'm_Alpha') n.cg = v;
    else if (prop === 'm_FillAmount' && n.img) n.img.fa = v;
  }
  // Đặt một nút rời (bản sao prefab, không thuộc inst nào) về khung thời điểm t của clip: như Animator.Play(clip, 0, t)
  // với speed 0 mà FancyScrollView gốc dùng để xếp ô theo vị trí cuộn.
  ug.pose = function (node, c, t) {
    for (const tr of c.tracks) {
      let n = node;
      for (const name of tr.path ? tr.path.split('/') : []) { n = (n.k || []).find(x => x.n === name); if (!n) break; }
      if (n) applyTrack(n, tr, t);
    }
  };

  // ---------------------------------------------------------------- bố cục
  const ALIGN_X = [0, 0.5, 1, 0, 0.5, 1, 0, 0.5, 1];
  // TextAnchor/ChildAlignment 0..8 = Upper/Middle/Lower × Left/Center/Right; y tính từ trên xuống.
  const ALIGN_Y_DOWN = [0, 0, 0, 0.5, 0.5, 0.5, 1, 1, 1];

  // Rect của nút trong hệ toạ độ cục bộ của cha (y hướng xuống, gốc ở góc trên trái rect cha).
  function place(n, P, forced) {
    const a = n.a || [0.5, 0.5, 0.5, 0.5], pv = n.pv || [0.5, 0.5], p = n.p || [0, 0];
    let sz = n.sz || [0, 0];
    if (forced) return forced;
    const ax0 = P.x + a[0] * P.w, ax1 = P.x + a[2] * P.w;
    const ayTop = P.y + (1 - a[3]) * P.h, ayBot = P.y + (1 - a[1]) * P.h;
    // ContentSizeFitter (PreferredSize = 2) trên nút chữ: rộng = dòng dài nhất, cao = số dòng sau khi xuống dòng.
    if (n.fit && n.txt && !n.txt.off) {
      sz = sz.slice();
      if (n.fit[0] === 2) sz[0] = textSize(n.txt, Infinity).w - (ax1 - ax0);
      if (n.fit[1] === 2) sz[1] = textSize(n.txt, (ax1 - ax0) + sz[0]).h - (ayBot - ayTop);
    }
    const w = (ax1 - ax0) + sz[0], h = (ayBot - ayTop) + sz[1];
    const px = ax0 + (ax1 - ax0) * pv[0] + p[0];
    const py = ayBot - (ayBot - ayTop) * pv[1] - p[1];
    return { px, py, w, h };
  }

  function prefSize(n) {
    if (n.le && n.le.PreferredWidth > 0) return [n.le.PreferredWidth, n.le.PreferredHeight > 0 ? n.le.PreferredHeight : (n.sz || [0, 0])[1]];
    if (n.lay && n.fit) return layoutExtent(n);
    return n.sz ? [Math.max(0, n.sz[0]), Math.max(0, n.sz[1])] : [0, 0];
  }

  function activeKids(n) { return (n.k || []).filter(c => !c.off && !(c.le && c.le.IgnoreLayout)); }

  function layoutExtent(n) {
    const L = n.lay, kids = activeKids(n), pad = L.pad;
    if (L.t === 'g') return n.sz || [0, 0];
    let main = 0, cross = 0;
    kids.forEach((c, i) => {
      const s = prefSize(c);
      if (L.t === 'h') { main += s[0] + (i ? L.sp : 0); cross = Math.max(cross, s[1]); }
      else { main += s[1] + (i ? L.sp : 0); cross = Math.max(cross, s[0]); }
    });
    return L.t === 'h' ? [main + pad[0] + pad[1], cross + pad[2] + pad[3]] : [cross + pad[0] + pad[1], main + pad[2] + pad[3]];
  }

  // Layout group: đặt con theo trục, trả map con -> rect ép.
  function layoutKids(n, R) {
    const L = n.lay, out = new Map();
    if (!L || L.t === 'g') return out;
    let kids = activeKids(n);
    if (L.rv) kids = kids.slice().reverse();
    const pad = L.pad, horiz = L.t === 'h';
    const sizes = kids.map(prefSize);
    const innerW = R.w - pad[0] - pad[1], innerH = R.h - pad[2] - pad[3];
    const total = sizes.reduce((s, z, i) => s + (horiz ? z[0] : z[1]) + (i ? L.sp : 0), 0);
    const fx = ALIGN_X[L.ca], fy = ALIGN_Y_DOWN[L.ca];
    let cur = horiz ? R.x + pad[0] + (innerW - total) * fx : R.y + pad[2] + (innerH - total) * fy;
    kids.forEach((c, i) => {
      let [w, h] = sizes[i];
      if (horiz && L.ch) h = innerH;
      if (!horiz && L.cw) w = innerW;
      let x, y;
      if (horiz) { x = cur; y = R.y + pad[2] + (innerH - h) * fy; cur += w + L.sp; }
      else { y = cur; x = R.x + pad[0] + (innerW - w) * fx; cur += h + L.sp; }
      const pv = c.pv || [0.5, 0.5];
      out.set(c, { px: x + w * pv[0], py: y + h * (1 - pv[1]), w, h });
    });
    return out;
  }

  // ---------------------------------------------------------------- vẽ
  function tinted(key, c) {
    const f = U.frames[key];
    if (!f) return null;
    if (c[0] >= 0.999 && c[1] >= 0.999 && c[2] >= 0.999) return { img: sheet, sx: f[0], sy: f[1] };
    const ck = key + '|' + c[0] + ',' + c[1] + ',' + c[2];
    let cv = tintCache.get(ck);
    if (!cv) {
      cv = document.createElement('canvas'); cv.width = f[2]; cv.height = f[3];
      const x = cv.getContext('2d');
      x.drawImage(sheet, f[0], f[1], f[2], f[3], 0, 0, f[2], f[3]);
      x.globalCompositeOperation = 'multiply';
      x.fillStyle = 'rgb(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ')';
      x.fillRect(0, 0, f[2], f[3]);
      x.globalCompositeOperation = 'destination-in';
      x.drawImage(sheet, f[0], f[1], f[2], f[3], 0, 0, f[2], f[3]);
      tintCache.set(ck, cv);
    }
    return { img: cv, sx: 0, sy: 0 };
  }

  function blit(ctx, src, f, sx, sy, sw, sh, dx, dy, dw, dh) {
    if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) return;
    ctx.drawImage(src.img, src.sx + sx, src.sy + sy, sw, sh, dx, dy, dw, dh);
  }

  function drawImage(ctx, img, R, colorOverride) {
    const f = U.frames[img.sp];
    if (!f) return;
    const c = colorOverride || img.c;
    if (c[3] <= 0) return;
    const src = tinted(img.sp, c);
    if (!src) return;
    const sw = f[2], sh = f[3];
    ctx.globalAlpha *= c[3];
    let { x, y, w, h } = R;
    const t = img.t || 0;
    if (t === 0 && img.pa) {
      const k = Math.min(w / sw, h / sh);
      x += (w - sw * k) / 2; y += (h - sh * k) / 2; w = sw * k; h = sh * k;
    }
    if (t === 1 && (f[4] || f[5] || f[6] || f[7])) {
      const k = (100 / f[8]) / (img.pm || 1);
      let l = f[4], b = f[5], r = f[6], tp = f[7];
      let L = l * k, B = b * k, Rr = r * k, T = tp * k;
      const sxk = Math.min(1, w / (L + Rr || 1)), syk = Math.min(1, h / (T + B || 1));
      L *= sxk; Rr *= sxk; T *= syk; B *= syk;
      const cols = [[0, l, x, L], [l, sw - l - r, x + L, w - L - Rr], [sw - r, r, x + w - Rr, Rr]];
      const rows = [[0, tp, y, T], [tp, sh - tp - b, y + T, h - T - B], [sh - b, b, y + h - B, B]];
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
        if (i === 1 && j === 1 && img.nc) continue;
        blit(ctx, src, f, cols[i][0], rows[j][0], cols[i][1], rows[j][1], cols[i][2], rows[j][2], cols[i][3], rows[j][3]);
      }
    } else if (t === 3 && (img.fa === undefined ? 1 : img.fa) < 1) {
      const fa = Math.max(0, img.fa || 0), fm = img.fm || 0, fo = img.fo || 0;
      if (fm === 0) {
        const cw = sw * fa, dw = w * fa;
        if (fo === 1) blit(ctx, src, f, sw - cw, 0, cw, sh, x + w - dw, y, dw, h);
        else blit(ctx, src, f, 0, 0, cw, sh, x, y, dw, h);
      } else if (fm === 1) {
        const ch = sh * fa, dh = h * fa;
        if (fo === 1) blit(ctx, src, f, 0, 0, sw, ch, x, y, w, dh);
        else blit(ctx, src, f, 0, sh - ch, sw, ch, x, y + h - dh, w, dh);
      } else {
        // Radial: cắt theo quạt. Gốc 0 = dưới, 1 = phải, 2 = trên, 3 = trái (Radial360).
        const start = [Math.PI / 2, 0, -Math.PI / 2, Math.PI][fo] || -Math.PI / 2;
        const cx = x + w / 2, cy = y + h / 2, rr = Math.hypot(w, h);
        const sweep = Math.PI * 2 * fa * (img.cw === 0 ? 1 : -1);
        ctx.save();
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, rr, start, start - sweep, sweep > 0); ctx.closePath(); ctx.clip();
        blit(ctx, src, f, 0, 0, sw, sh, x, y, w, h);
        ctx.restore();
      }
    } else {
      blit(ctx, src, f, 0, 0, sw, sh, x, y, w, h);
    }
  }

  function fontOf(t) {
    const fam = (t.f && U.fonts[t.f] && fontsReady ? '"skui_' + t.f + '", ' : '') +
      (fontsReady ? (U.fallback || []).map(f => '"skui_' + f + '", ').join('') : '');
    const bold = t.st === 1 || t.st === 3 ? 'bold ' : '';
    const it = t.st === 2 || t.st === 3 ? 'italic ' : '';
    return it + bold + '%spx ' + fam + '"LockClock", monospace';
  }

  // Chữ giàu kiểu Unity: <color=#rrggbb[aa]>...</color> đổi màu, thẻ khác bỏ qua. Trả mảng mẩu {t, c}.
  function richRuns(s, base) {
    const out = [], stack = [base], re = /<color=#([0-9a-fA-F]{6,8})>|<\/color>|<[^>]+>/g;
    let last = 0, m;
    while ((m = re.exec(s))) {
      if (m.index > last) out.push({ t: s.slice(last, m.index), c: stack[stack.length - 1] });
      if (m[1]) {
        const h = m[1], hx = i => parseInt(h.substr(i, 2), 16) / 255;
        stack.push([hx(0), hx(2), hx(4), (h.length === 8 ? hx(6) : 1) * base[3]]);
      } else if (m[0] === '</color>' && stack.length > 1) stack.pop();
      last = re.lastIndex;
    }
    if (last < s.length) out.push({ t: s.slice(last), c: stack[stack.length - 1] });
    return out;
  }

  const measureCtx = document.createElement('canvas').getContext('2d');
  const widthCache = new Map();
  function measure(font, str) {
    const k = font + '|' + str;
    let w = widthCache.get(k);
    if (w === undefined) {
      measureCtx.font = font; w = measureCtx.measureText(str).width;
      if (widthCache.size > 20000) widthCache.clear();
      widthCache.set(k, w);
    }
    return w;
  }

  // Xếp chữ thành dòng như Text của Unity: xuống dòng ở '\n'; hết bề ngang (khi không bật tràn ngang) thì ngắt ở
  // khoảng trắng, từ dài hơn cả khung giữ nguyên một dòng. Mỗi dòng là { atoms: [{t, c, w}], w }.
  function layoutText(t, font, maxW) {
    const lines = [[]];
    let lineW = 0;
    const wrap = !t.ho && isFinite(maxW);
    for (const run of richRuns(String(t.s == null ? '' : t.s), t.c)) {
      for (const tok of run.t.split(/(\n| +)/)) {
        if (!tok) continue;
        if (tok === '\n') { lines.push([]); lineW = 0; continue; }
        const w = measure(font, tok), line = lines[lines.length - 1];
        const space = tok[0] === ' ';
        if (wrap && !space && lineW + w > maxW + 0.5 && line.some(a => a.t.trim())) {
          while (line.length && !line[line.length - 1].t.trim()) lineW -= line.pop().w;
          lines.push([]); lineW = 0;
        }
        const cur = lines[lines.length - 1];
        if (space && !cur.length && lines.length > 1 && wrap) continue;
        cur.push({ t: tok, c: run.c, w }); lineW += w;
      }
    }
    return lines.map(l => ({ atoms: l, w: l.reduce((sum, a) => sum + a.w, 0) }));
  }

  // Chiều cao dòng như Text của Unity: Font.lineHeight (m_LineSpacing / m_FontSize của font gốc) × lineSpacing của Text.
  // [ĐO] pixel_bold 17,94 / 20 = 0,897; LockClock 24 / 16 = 1,5. Font không có số đo thì 1,15.
  const lineK = t => ((U.fontLH && U.fontLH[t.f]) || 1.15) * (t.ls || 1);

  function fitFont(t, maxW, maxH) {
    const font = fontOf(t);
    let fs = t.fs || 14, lines = layoutText(t, font.replace('%s', fs), maxW);
    if (t.bf) {
      const bad = () => Math.max(0, ...lines.map(l => l.w)) > maxW + 0.5 || lines.length * fs * lineK(t) > maxH + 0.5;
      while (fs > t.bf[0] && bad()) { fs--; lines = layoutText(t, font.replace('%s', fs), maxW); }
    }
    return { fs, font: font.replace('%s', fs), lines, lh: fs * lineK(t) };
  }

  // Cỡ ưa thích của một Text (cho ContentSizeFitter): rộng dòng dài nhất, cao theo số dòng khi khung rộng maxW.
  function textSize(t, maxW) {
    const L = fitFont(t, maxW, Infinity);
    return { w: Math.max(0, ...L.lines.map(l => l.w)), h: L.lines.length * L.lh };
  }
  ug.textSize = textSize;

  const css = col => 'rgba(' + Math.round(col[0] * 255) + ',' + Math.round(col[1] * 255) + ',' + Math.round(col[2] * 255) + ',' + col[3] + ')';
  function drawText(ctx, t, R, fx) {
    if (t.s == null || t.s === '' || t.c[3] <= 0) return;
    const L = fitFont(t, R.w, R.h);
    ctx.font = L.font;
    const ax = ALIGN_X[t.al || 0];
    const top = R.y + (R.h - L.lh * L.lines.length) * ALIGN_Y_DOWN[t.al || 0];
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const pass = (col, dx, dy) => {
      L.lines.forEach((l, i) => {
        let x = R.x + (R.w - l.w) * ax + dx;
        const y = top + L.lh * (i + 0.5) + dy;
        for (const a of l.atoms) {
          ctx.fillStyle = css(col || a.c);
          ctx.fillText(a.t, x, y);
          x += a.w;
        }
      });
    };
    for (const e of fx || []) {
      if (e.t === 's') pass(e.c, e.d[0], -e.d[1]);
      else for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) pass(e.c, e.d[0] * sx, e.d[1] * sy);
    }
    pass(null, 0, 0);
  }

  // Vẽ một khung của trang UI vào rect R, giữ tỉ lệ (cho mã game vẽ icon gốc trong nút `draw` tự viết).
  ug.drawFrame = function (ctx, name, R, c) {
    const a = ctx.globalAlpha;
    drawImage(ctx, { sp: name, c: c || [1, 1, 1, 1], pa: 1 }, R);
    ctx.globalAlpha = a;
  };

  function drawNode(ctx, n, P, forced) {
    if (n.off) return;
    const pl = place(n, P, forced);
    const pv = n.pv || [0.5, 0.5];
    ctx.save();
    ctx.translate(pl.px, pl.py);
    if (n.rz) ctx.rotate(-n.rz * Math.PI / 180);
    if (n.sc) ctx.scale(n.sc[0], n.sc[1]);
    if (n.cg !== undefined) ctx.globalAlpha *= n.cg;
    // Material xám (RGMaterial/ui_gray.mat) mà mã gốc gán cho nút bị khoá.
    if (n.gray) ctx.filter = 'grayscale(1)';
    const R = { x: -pl.w * pv[0], y: -pl.h * (1 - pv[1]), w: pl.w, h: pl.h };
    if (n.img && !n.img.off && !n.img.sp && n.img.c[3] > 0 && !n.draw) {
      const c = n.img.c;
      ctx.fillStyle = 'rgba(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ',' + c[3] + ')';
      ctx.fillRect(R.x, R.y, R.w, R.h);
    }
    if (n.draw) n.draw(ctx, R);
    else if (n.img && !n.img.off && n.img.sp) {
      for (const e of n.fx || []) {
        if (e.t !== 's') continue;
        const a = ctx.globalAlpha;
        drawImage(ctx, n.img, { x: R.x + e.d[0], y: R.y - e.d[1], w: R.w, h: R.h }, [e.c[0], e.c[1], e.c[2], e.c[3] * n.img.c[3]]);
        ctx.globalAlpha = a;
      }
      const a = ctx.globalAlpha;
      drawImage(ctx, n.img, R);
      ctx.globalAlpha = a;
    }
    if (n.txt && !n.txt.off) drawText(ctx, n.txt, R, n.fx);
    if (n.mask) { ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip(); }
    if (n.k) {
      const lay = layoutKids(n, R);
      for (const c of n.k) drawNode(ctx, c, R, lay.get(c));
    }
    ctx.restore();
  }

  function canvasRect(wPx, hPx) {
    const k = hPx / U.ref[1];
    return { k, P: { x: 0, y: 0, w: wPx / k, h: U.ref[1] } };
  }

  function drawRoot(ctx, root, wPx, hPx) {
    if (!ug.ok) return;
    const { k, P } = canvasRect(wPx, hPx);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.scale(k, k);
    for (const c of root.k || []) drawNode(ctx, c, P);
    ctx.restore();
  }

  // Rect màn hình (px) của một nút, để bấm chạm khớp đúng chỗ vẽ; nút (hoặc cha) đang tắt thì null. Bỏ qua xoay.
  function rectOf(root, path, wPx, hPx) {
    const { k, P } = canvasRect(wPx, hPx);
    let n = root, R = P, ox = 0, oy = 0, sx = 1, sy = 1;
    for (const name of path.split('/')) {
      const lay = layoutKids(n, R);
      const c = (n.k || []).find(x => x.n === name);
      if (!c || c.off) return null;
      const pl = place(c, R, lay.get(c));
      const pv = c.pv || [0.5, 0.5];
      ox += pl.px * sx; oy += pl.py * sy;
      if (c.sc) { sx *= c.sc[0]; sy *= c.sc[1]; }
      R = { x: -pl.w * pv[0], y: -pl.h * (1 - pv[1]), w: pl.w, h: pl.h };
      n = c;
    }
    // Scale âm (nút lật gương, ví dụ btn_back) đảo chiều rect: chuẩn hoá về rộng/cao dương.
    let x = ox + R.x * sx, y = oy + R.y * sy, w = R.w * sx, h = R.h * sy;
    if (w < 0) { x += w; w = -w; }
    if (h < 0) { y += h; h = -h; }
    return { x: x * k, y: y * k, w: w * k, h: h * k };
  }
})();
