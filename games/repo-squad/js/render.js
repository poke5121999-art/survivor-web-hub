/*
 * Ca Trực Đêm: Biệt Đội — phần vẽ. Không có luật chơi nào ở đây; nó chỉ đọc trạng thái.
 *
 * WHY: tách hẳn khỏi sim.js để bài kiểm thử chạy được luật mà không cần khung hình
 *      (memory: ported-rule-with-no-picture nói mặt ngược lại — luật có rồi vẫn phải
 *      dựng một khung hình mà nhìn, nên game.js luôn vẽ ít nhất một frame).
 */
(function (root) {
  'use strict';
  const SQ = root.SQ;
  const TILE = SQ.TILE;

  // Khung nhìn đo theo CẠNH NGẮN của khung, không theo bề ngang.
  // WHY: bề ngang đổi gấp ba khi xoay máy, cạnh ngắn thì gần như không đổi — neo vào
  //   nó thì ô giữ nguyên cỡ dù cầm dọc hay nằm ngang, chỉ khác là nằm ngang nhìn
  //   được xa hơn sang hai bên.
  // Nằm ngang kéo gần lại một nấc (12 thay vì 15) đúng kiểu camera MOBA trên điện
  // thoại: cạnh ngắn của máy nằm ngang vốn ngắn hơn cạnh ngắn lúc cầm dọc, giữ
  // nguyên con số thì người và quái bé đi thấy rõ.
  const VIEW_TILES = 15;                 // cạnh ngắn, khung DỌC
  const VIEW_TILES_LAND = 12;            // cạnh ngắn, khung NGANG

  function camFor(R, viewW, viewH) {
    const land = viewW > viewH;
    const z = Math.min(viewW, viewH) / ((land ? VIEW_TILES_LAND : VIEW_TILES) * TILE);
    const p = R.units[0];
    return {
      z: z,
      x: SQ.clamp(p.x, viewW / 2 / z, SQ.WPX - viewW / 2 / z),
      y: SQ.clamp(p.y, viewH / 2 / z, SQ.HPX - viewH / 2 / z)
    };
  }

  function draw(ctx, R, viewW, viewH) {
    const W = R.W, pal = R.map.pal;
    const cam = camFor(R, viewW, viewH);
    ctx.save();
    ctx.fillStyle = '#05060700';
    ctx.clearRect(0, 0, viewW, viewH);
    ctx.fillStyle = '#040506';
    ctx.fillRect(0, 0, viewW, viewH);

    ctx.translate(viewW / 2, viewH / 2);
    ctx.scale(cam.z, cam.z);
    ctx.translate(-cam.x, -cam.y);

    const halfW = viewW / 2 / cam.z, halfH = viewH / 2 / cam.z;
    const x0 = Math.max(0, Math.floor((cam.x - halfW) / TILE) - 1);
    const x1 = Math.min(SQ.MW - 1, Math.ceil((cam.x + halfW) / TILE) + 1);
    const y0 = Math.max(0, Math.floor((cam.y - halfH) / TILE) - 1);
    const y1 = Math.min(SQ.MH - 1, Math.ceil((cam.y + halfH) / TILE) + 1);

    // --- sàn và tường ---
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * SQ.MW + x;
        if (!W.seen[i]) continue;
        // nhớ mặt bằng thì phải ĐỌC được: 42% độ sáng cho ô đã đi qua, 100% cho ô đang soi
        const lit = 0.42 + 0.58 * Math.min(1, W.lit[i]);
        const g = W.grid[i];
        if (g === SQ.WALL) {
          ctx.fillStyle = shade(pal.wall, lit);
          ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
          // gờ trên cho tường có khối
          if (y + 1 <= SQ.MH - 1 && W.grid[i + SQ.MW] === SQ.FLOOR) {
            ctx.fillStyle = shade(pal.accent, lit * 1.15);
            ctx.fillRect(x * TILE, y * TILE + TILE - 4, TILE, 4);
          }
        } else {
          ctx.fillStyle = shade(pal.floor, lit);
          ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
          if (((x * 7 + y * 3) % 11) === 0) {
            ctx.fillStyle = 'rgba(255,255,255,' + (0.018 * lit).toFixed(3) + ')';
            ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
          }
          if (g === SQ.PROP) {
            ctx.fillStyle = shade(pal.accent, lit * 0.9);
            ctx.fillRect(x * TILE + 2, y * TILE + 2, TILE - 4, TILE - 4);
            ctx.fillStyle = 'rgba(0,0,0,' + (0.35).toFixed(2) + ')';
            ctx.fillRect(x * TILE + 2, y * TILE + TILE - 6, TILE - 4, 4);
          }
        }
      }
    }

    // --- bệ giao hàng ---
    const pad = W.pad;
    const frac = Math.min(1, pad.delivered / W.quota);
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = frac >= 1 ? '#6fbf73' : '#d0a24a';
    ctx.lineWidth = 3;
    ctx.setLineDash([7, 6]);
    ctx.strokeRect(pad.x - pad.r, pad.y - pad.r, pad.r * 2, pad.r * 2);
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.16 + 0.10 * Math.sin(R.t * 2.2);
    ctx.fillStyle = frac >= 1 ? '#6fbf73' : '#d0a24a';
    ctx.fillRect(pad.x - pad.r, pad.y - pad.r, pad.r * 2, pad.r * 2);
    ctx.globalAlpha = 1;
    // vạch tiến độ chỉ tiêu chạy quanh bệ
    ctx.strokeStyle = frac >= 1 ? '#8fe094' : '#e0c46a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(pad.x, pad.y, pad.r + 8, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // --- cửa ---
    W.doors.forEach(d => {
      const i = Math.floor(d.y / TILE) * SQ.MW + Math.floor(d.x / TILE);
      if (!W.seen[i]) return;
      const shut = 1 - d.open;
      if (shut < 0.05) return;
      ctx.save();
      ctx.fillStyle = d.jam ? '#5a4028' : '#3a3d44';
      const len = TILE * 1.5 * shut;
      if (d.dir === 'h') ctx.fillRect(d.x - 5, d.y - len, 10, len * 2);
      else ctx.fillRect(d.x - len, d.y - 5, len * 2, 10);
      if (d.jam) {
        ctx.fillStyle = '#c98b3c';
        ctx.beginPath(); ctx.arc(d.x, d.y, 4, 0, 7); ctx.fill();
        if (d.pry > 0) {
          ctx.strokeStyle = '#e0c46a'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(d.x, d.y, 11, -Math.PI / 2, -Math.PI / 2 + d.pry * Math.PI * 2); ctx.stroke();
        }
      }
      ctx.restore();
    });

    // --- lồng sắt ---
    W.cages.forEach(c => {
      ctx.fillStyle = 'rgba(120,200,220,' + (0.35 + 0.3 * Math.min(1, c.t / 2)).toFixed(2) + ')';
      ctx.fillRect(c.x - c.w / 2, c.y - c.h / 2, c.w, c.h);
    });

    // --- vùng kỹ năng ---
    R.zones.forEach(z => {
      const a = Math.min(1, z.t / z.max);
      ctx.save();
      ctx.globalAlpha = 0.10 * a + 0.03;
      ctx.fillStyle = z.color;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.kind === 'decoy' ? 26 : z.r, 0, 7); ctx.fill();
      ctx.globalAlpha = 0.8 * a;
      ctx.strokeStyle = z.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.kind === 'decoy' ? 26 : z.r, 0, 7); ctx.stroke();
      if (z.kind === 'decoy') {
        ctx.fillStyle = z.color;
        ctx.beginPath(); ctx.arc(z.x, z.y, 6, 0, 7); ctx.fill();
      }
      if (z.kind === 'ghost') {
        ctx.globalAlpha = 0.35 * a;
        drawBody(ctx, z.x, z.y, '#7fd8e8', 0, false);
      }
      ctx.restore();
    });

    // --- đồ ---
    W.loot.forEach(l => {
      if (l.done) return;
      const i = Math.floor(l.y / TILE) * SQ.MW + Math.floor(l.x / TILE);
      const lit = W.lit[i] || 0;
      if (!W.seen[i]) return;
      const vis = l.held != null ? 1 : (R.revealT > 0 ? 0.85 : Math.max(0.22, lit));
      ctx.save();
      ctx.globalAlpha = vis;
      ctx.fillStyle = l.color;
      ctx.beginPath();
      ctx.arc(l.x, l.y, l.r, 0, 7);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.30)';
      ctx.beginPath(); ctx.arc(l.x - l.r * 0.3, l.y - l.r * 0.35, l.r * 0.32, 0, 7); ctx.fill();
      ctx.restore();
    });

    // --- quái ---
    W.foes.forEach(f => {
      if (f.dead) return;
      const i = Math.floor(f.y / TILE) * SQ.MW + Math.floor(f.x / TILE);
      const lit = W.lit[i] || 0;
      let vis = R.revealT > 0 ? 0.9 : lit;
      // Bóng Đen: chỉ thấy khi đã trong tầm này, dù đèn có rọi tới hay không
      if (f.hidden) {
        const near = R.units.some(u => !u.out && Math.hypot(u.x - f.x, u.y - f.y) < f.hidden * TILE);
        vis = near ? Math.max(vis, 0.75) : 0;
      }
      if (vis < 0.10) return;
      ctx.save();
      ctx.globalAlpha = Math.min(1, vis + 0.25);
      drawFoe(ctx, f, R.t);
      ctx.restore();
    });

    // --- đường đạn / nhát đánh ---
    R.shots = R.shots.filter(s => (s.t -= 0.016) > 0);
    R.shots.forEach(s => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, s.t / 0.12) * 0.8;
      ctx.strokeStyle = '#ffe6b0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(s.x0, s.y0); ctx.lineTo(s.x1, s.y1); ctx.stroke();
      ctx.restore();
    });

    // --- tổ ---
    R.units.forEach(u => {
      if (u.out) return;
      ctx.save();
      const col = 'hsl(' + u.def.hue + ',52%,' + (u.player ? 62 : 48) + '%)';
      if (u.invis > 0) ctx.globalAlpha = 0.35;
      if (u.down) {
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = '#5a3038';
        ctx.beginPath(); ctx.ellipse(u.x, u.y, 13, 8, 0, 0, 7); ctx.fill();
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(u.x, u.y, 6, 0, 7); ctx.fill();
        if (u.reviveT > 0) {
          ctx.strokeStyle = '#7fdc8a'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(u.x, u.y, 15, -Math.PI / 2, -Math.PI / 2 + (u.reviveT / 3) * Math.PI * 2); ctx.stroke();
        }
      } else {
        if (u.invul > 0) {
          ctx.strokeStyle = 'rgba(255,225,170,.85)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(u.x, u.y, 15, 0, 7); ctx.stroke();
        }
        drawBody(ctx, u.x, u.y, col, u.a, u.player);
        if (u.hitFx > 0) {
          ctx.globalAlpha = u.hitFx / 0.3 * 0.7;
          ctx.fillStyle = '#ff6a5a';
          ctx.beginPath(); ctx.arc(u.x, u.y, 13, 0, 7); ctx.fill();
          ctx.globalAlpha = 1;
        }
        if (u.bag.length) {
          // chồng đồ trên đầu: ba món trên cùng, rồi con số cho phần còn lại
          const top = u.bag.slice(-3);
          top.forEach((l, i) => {
            ctx.fillStyle = l.color;
            ctx.beginPath(); ctx.arc(u.x, u.y - 13 - i * 5, Math.min(7, l.r * 0.8), 0, 7); ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1.5; ctx.stroke();
          });
          if (u.bag.length > 3) {
            ctx.fillStyle = '#e0c46a';
            ctx.font = '700 9px ui-monospace,Menlo,Consolas,monospace';
            ctx.textAlign = 'center';
            ctx.fillText('+' + (u.bag.length - 3), u.x + 11, u.y - 20);
          }
        }
        // thanh máu nhỏ trên đầu
        if (u.hp < u.hpMax) {
          const w = 22;
          ctx.fillStyle = 'rgba(0,0,0,.6)';
          ctx.fillRect(u.x - w / 2, u.y - 20, w, 3);
          ctx.fillStyle = u.hp / u.hpMax > 0.35 ? '#6fbf73' : '#c9584f';
          ctx.fillRect(u.x - w / 2, u.y - 20, w * (u.hp / u.hpMax), 3);
        }
        if (u.useFx > 0) {
          ctx.globalAlpha = u.useFx / 0.45;
          ctx.strokeStyle = col; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(u.x, u.y, 16 + (1 - u.useFx / 0.45) * 14, 0, 7); ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      ctx.restore();
    });

    // --- hiệu ứng ---
    R.fx.forEach(f => {
      const a = Math.max(0, f.t / f.max);
      ctx.save();
      ctx.globalAlpha = a;
      if (f.kind === 'ring' || f.kind === 'shock' || f.kind === 'flash') {
        ctx.strokeStyle = f.color; ctx.lineWidth = f.kind === 'flash' ? 5 : 3;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 - a * 0.55), 0, 7); ctx.stroke();
        if (f.kind === 'flash') {
          ctx.globalAlpha = a * 0.28; ctx.fillStyle = f.color;
          ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill();
        }
      } else if (f.kind === 'num') {
        ctx.globalAlpha = Math.min(1, a * 1.6);
        ctx.fillStyle = f.color;
        ctx.font = '700 13px ui-monospace,Menlo,Consolas,monospace';
        ctx.textAlign = 'center';
        ctx.fillText(f.text, f.x, f.y - (1 - a) * 20);
      } else if (f.kind === 'line') {
        ctx.strokeStyle = f.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(f.x0, f.y0); ctx.lineTo(f.x1, f.y1); ctx.stroke();
      }
      ctx.restore();
    });

    ctx.restore();

    // --- quầng đèn quanh mỗi người trong tổ ---
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(viewW / 2, viewH / 2);
    ctx.scale(cam.z, cam.z);
    ctx.translate(-cam.x, -cam.y);
    R.units.forEach(u => {
      if (u.out) return;
      const rad = (u.down ? 4 : 7.5) * u.stats.eye * TILE;
      const g = ctx.createRadialGradient(u.x, u.y, rad * 0.10, u.x, u.y, rad);
      const warm = u.player ? 'rgba(255,226,168,' : 'rgba(150,190,215,';
      g.addColorStop(0, warm + (u.player ? 0.20 : 0.10) + ')');
      g.addColorStop(0.55, warm + (u.player ? 0.07 : 0.035) + ')');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(u.x, u.y, rad, 0, 7); ctx.fill();
    });
    ctx.restore();

    // --- tối góc màn ---
    const vg = ctx.createRadialGradient(viewW / 2, viewH / 2, viewH * 0.32, viewW / 2, viewH / 2, viewH * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.50)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, viewW, viewH);

    drawMinimap(ctx, R, viewW, viewH);
  }

  function drawBody(ctx, x, y, col, a, isPlayer) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath(); ctx.ellipse(x, y + 7, 10, 5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(x, y, 8, 9.5, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 2; ctx.stroke();
    // mũ / đầu
    ctx.fillStyle = 'rgba(255,255,255,.72)';
    ctx.beginPath(); ctx.arc(x, y - 3, 4.4, 0, 7); ctx.fill();
    // hướng nhìn
    ctx.strokeStyle = isPlayer ? 'rgba(255,240,200,.9)' : 'rgba(255,255,255,.45)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14);
    ctx.stroke();
    if (isPlayer) {
      ctx.strokeStyle = 'rgba(255,235,180,.55)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 12.5, 0, 7); ctx.stroke();
    }
    ctx.restore();
  }

  function drawFoe(ctx, f, t) {
    const x = f.x, y = f.y;
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.beginPath(); ctx.ellipse(x, y + 8, 11, 5, 0, 0, 7); ctx.fill();
    const bob = f.freeze > 0 ? 0 : Math.sin(t * 6 + x) * 1.2;
    ctx.fillStyle = f.freeze > 0 ? '#9fd8ff' : f.color;
    if (f.kind === 'angel') {
      ctx.beginPath();
      ctx.moveTo(x, y - 15 + bob); ctx.lineTo(x + 9, y + 9); ctx.lineTo(x - 9, y + 9);
      ctx.closePath(); ctx.fill();
    } else if (f.kind === 'hunter') {
      ctx.beginPath(); ctx.ellipse(x, y + bob, 11, 8, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y - 8 + bob, 5, 0, 7); ctx.fill();
    } else {
      ctx.beginPath(); ctx.ellipse(x, y + bob, 10, 11, 0, 0, 7); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 2; ctx.stroke();
    // mắt: đỏ khi đang đuổi
    if (f.kind !== 'rook') {
      ctx.fillStyle = f.target ? '#ff5a4a' : 'rgba(255,255,255,.6)';
      const ex = x + Math.cos(f.a) * 4, ey = y + Math.sin(f.a) * 4 + bob;
      ctx.beginPath(); ctx.arc(ex, ey, 2.4, 0, 7); ctx.fill();
    }
    if (f.stun > 0) {
      ctx.fillStyle = '#ffe08a';
      ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('✳', x, y - 18);
    }
    if (f.hp < f.hpMax) {
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.fillRect(x - 12, y - 20, 24, 3);
      ctx.fillStyle = '#c9584f';
      ctx.fillRect(x - 12, y - 20, 24 * (f.hp / f.hpMax), 3);
    }
    if (f.spotFx > 0) {
      ctx.strokeStyle = 'rgba(255,90,74,' + (f.spotFx / 0.6).toFixed(2) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 16 + (1 - f.spotFx / 0.6) * 12, 0, 7); ctx.stroke();
    }
  }

  // Bản đồ nhỏ ở góc: chỉ vẽ chỗ đã đi qua.
  function drawMinimap(ctx, R, viewW, viewH) {
    const W = R.W;
    const mw = Math.min(112, viewW * 0.30);
    const s = mw / SQ.MW;
    const mh = SQ.MH * s;
    const px = viewW - mw - 8, py = 8;
    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = 'rgba(4,5,7,.78)';
    ctx.fillRect(px - 3, py - 3, mw + 6, mh + 6);
    ctx.strokeStyle = 'rgba(120,130,145,.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px - 3, py - 3, mw + 6, mh + 6);
    for (let y = 0; y < SQ.MH; y++) {
      for (let x = 0; x < SQ.MW; x++) {
        const i = y * SQ.MW + x;
        if (!W.seen[i]) continue;
        if (W.grid[i] === SQ.WALL) continue;
        ctx.fillStyle = W.lit[i] > 0.12 ? 'rgba(150,165,180,.55)' : 'rgba(90,100,115,.30)';
        ctx.fillRect(px + x * s, py + y * s, s + 0.6, s + 0.6);
      }
    }
    // bệ
    ctx.fillStyle = '#e0c46a';
    ctx.fillRect(px + (W.pad.x / TILE) * s - 2, py + (W.pad.y / TILE) * s - 2, 4, 4);
    // đồ đã thấy
    W.loot.forEach(l => {
      if (l.done) return;
      const i = Math.floor(l.y / TILE) * SQ.MW + Math.floor(l.x / TILE);
      if (!W.seen[i]) return;
      ctx.fillStyle = 'rgba(210,180,110,.85)';
      ctx.fillRect(px + (l.x / TILE) * s - 1, py + (l.y / TILE) * s - 1, 2, 2);
    });
    // quái đang nhìn thấy được
    W.foes.forEach(f => {
      if (f.dead) return;
      const i = Math.floor(f.y / TILE) * SQ.MW + Math.floor(f.x / TILE);
      const near = R.units.some(u => !u.out && Math.hypot(u.x - f.x, u.y - f.y) < (u.def.id === 'mai' ? 15 : 10) * TILE);
      if (!(W.lit[i] > 0.12 || R.revealT > 0 || near)) return;
      ctx.fillStyle = '#ff5a4a';
      ctx.fillRect(px + (f.x / TILE) * s - 1.5, py + (f.y / TILE) * s - 1.5, 3, 3);
    });
    // tổ
    R.units.forEach(u => {
      if (u.out) return;
      ctx.fillStyle = u.player ? '#fff2c0' : 'hsl(' + u.def.hue + ',55%,60%)';
      ctx.fillRect(px + (u.x / TILE) * s - 1.5, py + (u.y / TILE) * s - 1.5, 3, 3);
    });
    ctx.restore();
  }

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, ((n >> 16) & 255) * k) | 0;
    const g = Math.min(255, ((n >> 8) & 255) * k) | 0;
    const b = Math.min(255, (n & 255) * k) | 0;
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  SQ.draw = draw;
  SQ.camFor = camFor;

})(window);
