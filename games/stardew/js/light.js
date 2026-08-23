/*
 * light.js - the layer that turns flat tiles into a place.
 *
 * The owner's note was that the art looked bad and should move to the style of
 * the two other games on this hub - Ca Trực Đêm and Rừng Tối. Both are built on
 * the same trick, and it is not their tile art: the world is drawn normally,
 * then a second canvas holding nothing but LIGHT is multiplied over it, and a
 * warm additive pass and a vignette go on top. Shadow goes cool, lit goes warm,
 * edges fall away, and everything gains depth without a single new sprite.
 *
 * One thing deliberately NOT taken from them: the torch. In those games the
 * darkness is the game - you see a circle and nothing else. The owner said
 * plainly "không cần đèn pin đâu", and they are right: a farming game you play
 * in the afternoon must stay readable. So the ambient floor here never drops to
 * theirs. Daylight barely darkens at all; dusk, night, indoors and the mine are
 * where the lamps start doing real work.
 *
 * Cost: one offscreen canvas the size of the viewport, a handful of radial
 * gradients per frame, and three full-screen composites.
 */
(function (global) {
  'use strict';

  var lightCv = null, lightCtx = null;

  function ensure(w, h) {
    if (!lightCv) {
      lightCv = document.createElement('canvas');
      lightCtx = lightCv.getContext('2d');
    }
    if (lightCv.width !== w || lightCv.height !== h) {
      lightCv.width = w; lightCv.height = h;
    }
    return lightCtx;
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  /* How bright the world is, and what colour the shade is, at this minute.
   *
   * Returned as an rgb triple that gets MULTIPLIED over the frame, so
   * (255,255,255) means "untouched". The night floor is deliberately high
   * enough to walk home by. */
  var SKY = [
    // minute-of-day, r, g, b
    [0,        88,  96, 140],   // deep night, cold blue
    [4 * 60,   96, 104, 148],
    [5 * 60,  140, 130, 150],   // first grey
    [6 * 60,  205, 178, 158],   // sunrise, warm and low
    [7 * 60,  238, 226, 208],
    [9 * 60,  255, 250, 240],   // full day, a hair warm
    [16 * 60, 255, 246, 228],
    [17 * 60, 246, 216, 178],   // the light goes amber
    [18 * 60, 226, 178, 142],
    [19 * 60, 176, 146, 152],
    [20 * 60, 128, 122, 156],
    [21 * 60, 104, 108, 152],
    [23 * 60,  90,  98, 142],
    [26 * 60,  84,  92, 138]
  ];

  function skyAt(minutes) {
    var t = minutes % (26 * 60);
    for (var i = 0; i < SKY.length - 1; i++) {
      var a = SKY[i], b = SKY[i + 1];
      if (t >= a[0] && t <= b[0]) {
        var k = (t - a[0]) / (b[0] - a[0] || 1);
        return [lerp(a[1], b[1], k), lerp(a[2], b[2], k), lerp(a[3], b[3], k)];
      }
    }
    return [255, 250, 240];
  }

  /* Weather pulls the whole frame down and towards grey - rain is not just an
   * overlay of streaks, it is a darker, flatter world. */
  function weatherTint(rgb, weather) {
    if (weather === 'rain') return [rgb[0] * 0.78, rgb[1] * 0.82, rgb[2] * 0.90];
    if (weather === 'storm') return [rgb[0] * 0.62, rgb[1] * 0.66, rgb[2] * 0.80];
    if (weather === 'snow') return [rgb[0] * 0.90, rgb[1] * 0.93, rgb[2] * 1.00];
    return rgb;
  }

  /* Add one lamp to the light canvas. Additive, so overlapping lamps pool
   * rather than cut each other out. */
  function lamp(ctx, x, y, r, rgb, strength) {
    if (r <= 0 || strength <= 0) return;
    var g = ctx.createRadialGradient(x, y, r * 0.06, x, y, r);
    g.addColorStop(0, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ','
                   + strength.toFixed(3) + ')');
    g.addColorStop(0.55, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ','
                   + (strength * 0.38).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  var LAMP_WARM = [255, 206, 128];
  var LAMP_COOL = [150, 190, 230];
  var LAMP_FIRE = [255, 150, 70];

  /* Everything in the current area that throws light, in screen pixels. */
  function collectLights(game, cam, vw, vh, dark) {
    var out = [];
    var area = game.world.area();
    var ts = cam.ts;
    function sx(x) { return x * ts - cam.x; }
    function sy(y) { return y * ts - cam.y; }

    /* The player carries a lantern once the light goes. It is a wide, gentle
     * pool, not a torch beam - it exists so the farm stays walkable after dark,
     * which is exactly the part of the reference games we are not copying. */
    if (dark > 0.05) {
      out.push([sx(game.player.x), sy(game.player.y), ts * 6.5, LAMP_WARM,
                0.30 * dark]);
    }

    var objs = area.objs || [];
    for (var i = 0; i < objs.length; i++) {
      var o = objs[i];
      var px = sx(o.x + 0.5), py = sy(o.y + 0.5);
      if (px < -ts * 8 || py < -ts * 8 || px > vw + ts * 8 || py > vh + ts * 8) continue;
      switch (o.kind) {
        case 'doorway':
          // a lantern over every door, brighter once it is dark out
          out.push([px, py - ts * 0.4, ts * 3.4, LAMP_WARM, 0.20 + 0.42 * dark]);
          break;
        case 'machine': {
          // a machine only glows while it is actually working
          var st = (game.sim.machines || {})[o.machine || 'Furnace'];
          var busy = st && (st.jobs || []).some(function (j) { return j && !j.ready; });
          var ready = st && (st.jobs || []).some(function (j) { return j && j.ready; });
          if (busy) out.push([px, py, ts * 2.6, LAMP_FIRE, 0.42]);
          else if (ready) out.push([px, py, ts * 2.2, [190, 255, 170], 0.30]);
          break;
        }
        case 'kitchen':
          out.push([px, py, ts * 2.8, LAMP_FIRE, 0.30]);
          break;
        case 'tv':
          out.push([px, py, ts * 2.4, LAMP_COOL, 0.26]);
          break;
        case 'counter':
          out.push([px, py - ts * 0.5, ts * 3.0, LAMP_WARM, 0.22]);
          break;
        case 'bin': case 'mailbox':
          break;
        case 'mineEntrance': case 'skullEntrance': case 'volcanoEntrance':
          out.push([px, py, ts * 2.2, LAMP_FIRE, 0.22]);
          break;
        case 'oreRock':
          out.push([px, py, ts * 1.5, [180, 220, 255], 0.16]);
          break;
        case 'bundleBoard':
          out.push([px, py, ts * 2.4, [190, 235, 255], 0.24]);
          break;
        case 'forage': case 'dropped':
          // dropped goods catch the light, which is how you spot them
          out.push([px, py, ts * 1.2, [255, 235, 190], 0.16]);
          break;
        default: break;
      }
    }

    /* Windows. Every building the world found has its window tiles marked, and
     * a lit window after dark is most of what makes a town read as inhabited. */
    if (area.buildings && dark > 0.02) {
      for (var b = 0; b < area.buildings.length; b++) {
        var bd = area.buildings[b];
        for (var c = 0; c < bd.cells.length; c++) {
          if (area.bpart[bd.cells[c]] !== 3) continue;
          var cx = (bd.cells[c] % area.w) + 0.5;
          var cy = ((bd.cells[c] / area.w) | 0) + 0.5;
          var wx = sx(cx), wy = sy(cy);
          if (wx < -ts * 6 || wy < -ts * 6 || wx > vw + ts * 6 || wy > vh + ts * 6) continue;
          out.push([wx, wy, ts * 3.6, LAMP_WARM, 0.55 * dark]);
        }
      }
    }

    // things the effects layer is throwing right now
    var fx = game.fx;
    if (fx) {
      for (var k = 0; k < fx.arcs.length; k++) {
        var arc = fx.arcs[k];
        var f = 1 - arc.t / arc.life;
        out.push([sx(arc.x), sy(arc.y), ts * 2.2, [255, 240, 200], 0.35 * f]);
      }
    }
    return out;
  }

  /* How dark it is right now, 0 = broad daylight, 1 = as dark as this game
   * ever gets. Drives the lamps: they should not blaze at noon. */
  function darkness(game) {
    var sim = game.sim, area = game.world.area();
    if (area.depth) return 0.85;
    if (!area.outdoor) return 0.45;
    var t = sim.time;
    if (t >= 8 * 60 && t < 16 * 60) return 0;
    if (t < 5 * 60 || t >= 21 * 60) return 1;
    if (t < 8 * 60) return clamp01((8 * 60 - t) / (3 * 60));
    return clamp01((t - 16 * 60) / (5 * 60));
  }

  /* The whole pass. Called once per frame after the world is drawn. */
  function apply(game, ctx, vw, vh, cam) {
    if (!cam) return;
    var sim = game.sim, area = game.world.area();
    var dark = darkness(game);

    var base;
    if (area.depth) {
      base = [70, 74, 92];                       // the mine has no sky
    } else if (!area.outdoor) {
      /* Indoors keeps its own warm, even light. It does not follow the sun,
       * because a room with a lamp in it does not go pitch black at seven. */
      base = [214, 194, 172];
    } else {
      base = weatherTint(skyAt(sim.time), sim.weather);
    }

    var lc = ensure(vw, vh);
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = 'source-over';
    lc.fillStyle = 'rgb(' + (base[0] | 0) + ',' + (base[1] | 0) + ','
                 + (base[2] | 0) + ')';
    lc.fillRect(0, 0, vw, vh);

    lc.globalCompositeOperation = 'lighter';
    var lights = collectLights(game, cam, vw, vh, dark);
    for (var i = 0; i < lights.length; i++) {
      var L = lights[i];
      lamp(lc, L[0], L[1], L[2], L[3], L[4]);
    }

    // 1. the light map darkens and tints the frame
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(lightCv, 0, 0);

    /* 2. a second, weaker additive pass so a lamp actually glows rather than
     * merely failing to darken. Without it, lit areas look washed instead of
     * warm - the multiply can only ever remove light. */
    if (dark > 0.08 || area.depth || !area.outdoor) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5;
      for (var j = 0; j < lights.length; j++) {
        var G = lights[j];
        lamp(ctx, G[0], G[1], G[2] * 0.8, G[3], G[4] * 0.55);
      }
      ctx.globalAlpha = 1;
    }

    // 3. the vignette, which is what makes the frame read as a photograph
    ctx.globalCompositeOperation = 'source-over';
    var vg = ctx.createRadialGradient(vw / 2, vh * 0.52, Math.min(vw, vh) * 0.30,
                                      vw / 2, vh * 0.52, Math.max(vw, vh) * 0.78);
    /* Heavier in daylight than it was. A vignette is not just a night-time
     * effect: it is what gives a bright frame somewhere dark to be, and this
     * picture had NO true darks at all - measured, a midday farm lived entirely
     * between 0.165 and 0.322 lightness, which is why it looked printed rather
     * than lit. */
    var vStrength = 0.44 + 0.30 * dark + (area.depth ? 0.20 : 0);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.62, 'rgba(0,0,0,' + (vStrength * 0.28).toFixed(3) + ')');
    vg.addColorStop(1, 'rgba(0,0,0,' + vStrength.toFixed(3) + ')');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, vw, vh);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  global.SDV_LIGHT = {
    apply: apply, darkness: darkness, skyAt: skyAt, lamp: lamp,
    collectLights: collectLights
  };
})(window);
