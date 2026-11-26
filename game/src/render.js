// render.js — the frame. Sky, far ridge ring, near terrain, runways,
// buildings, trees, clouds, rings, the aircraft, then the HUD instruments
// and the title / pause / end screens. Everything is drawn from the game's
// own data with one painter-sorted list, so near things always cover far
// things. No images, no fonts from the network: canvas paths and text only.
(function () {
  'use strict';
  var FG = window.FG;
  var CFG = FG.CFG;
  var T = FG.Terrain;
  var W = FG.World;
  var clamp = FG.clamp, lerp = FG.lerp;

  var SUN = { x: -0.55, y: 0.62, z: 0.42 };
  (function () {
    var l = Math.sqrt(SUN.x * SUN.x + SUN.y * SUN.y + SUN.z * SUN.z);
    SUN.x /= l; SUN.y /= l; SUN.z /= l;
  })();

  // ---- "Sectional Dusk" theme tokens (see DESIGN.md) ----
  var TH = CFG.theme;
  // Type: heavy grotesque for display, tabular monospace for data figures,
  // plain sans for labels — sentence case throughout (see DESIGN.md).
  var F_DISPLAY = '800 52px system-ui, -apple-system, "Segoe UI", sans-serif';
  var F_DISPLAY_SM = '800 30px system-ui, -apple-system, "Segoe UI", sans-serif';
  var F_DATA = '600 13px ui-monospace, "SF Mono", "Cascadia Mono", Consolas, "Liberation Mono", monospace';
  var F_DATA_LG = '700 15px ui-monospace, "SF Mono", "Cascadia Mono", Consolas, "Liberation Mono", monospace';
  var F_LABEL = '600 12px system-ui, -apple-system, "Segoe UI", sans-serif';
  var F_BODY = '400 14px system-ui, -apple-system, "Segoe UI", sans-serif';
  var F_BODY_B = '600 14px system-ui, -apple-system, "Segoe UI", sans-serif';

  // ---- cached terrain triangle colours (the terrain never changes) ----
  var cellColors = null; // cellColors[j][i] = [triA, triB] css strings
  function buildCellColors() {
    if (cellColors) return;
    cellColors = [];
    var N = T.N;
    for (var j = 0; j < N - 1; j++) {
      cellColors.push([]);
      for (var i = 0; i < N - 1; i++) {
        var a = j * N + i, b = j * N + i + 1, c = (j + 1) * N + i, d = (j + 1) * N + i + 1;
        cellColors[j].push([triColor(a, b, c), triColor(b, d, c)]);
      }
    }
  }
  function shadeOf(idx) { return T.shade[idx]; }
  function triColor(a, b, c) {
    var r = Math.round((T.colors[a * 3] + T.colors[b * 3] + T.colors[c * 3]) / 3 * (shadeOf(a) + shadeOf(b) + shadeOf(c)) / 3);
    var g = Math.round((T.colors[a * 3 + 1] + T.colors[b * 3 + 1] + T.colors[c * 3 + 1]) / 3 * (shadeOf(a) + shadeOf(b) + shadeOf(c)) / 3);
    var bl = Math.round((T.colors[a * 3 + 2] + T.colors[b * 3 + 2] + T.colors[c * 3 + 2]) / 3 * (shadeOf(a) + shadeOf(b) + shadeOf(c)) / 3);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  function fillTri(ctx, p0, p1, p2, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.closePath();
    ctx.fill();
  }

  // ---- sky ----
  function drawSky(ctx, w, h, cam) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, CFG.sky.top);
    g.addColorStop(0.45, CFG.sky.mid);
    g.addColorStop(0.72, CFG.sky.horizon);
    g.addColorStop(1, '#d8c49a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Sun: a far point in the sun's direction, projected through the camera.
    var P = FG.Projection.project;
    var s = P(cam, cam.x + SUN.x * 3000, cam.y + SUN.y * 3000, cam.z + SUN.z * 3000);
    if (s) {
      var glow = ctx.createRadialGradient(s.x, s.y, 4, s.x, s.y, 130);
      glow.addColorStop(0, 'rgba(255,223,138,0.95)');
      glow.addColorStop(0.25, 'rgba(255,210,120,0.45)');
      glow.addColorStop(1, 'rgba(255,210,120,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(s.x - 140, s.y - 140, 280, 280);
      ctx.fillStyle = CFG.sky.sun;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 17, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---- terrain triangles into the draw list ----
  function terrainTris(cam, list, time) {
    buildCellColors();
    var N = T.N, CELL = T.CELL, HALF = T.HALF;
    var VC = CFG.viewCells;
    var ci = clamp(Math.round((cam.x + HALF) / CELL), 0, N - 1);
    var cj = clamp(Math.round((cam.z + HALF) / CELL), 0, N - 1);
    var i0 = Math.max(0, ci - VC), i1 = Math.min(N - 2, ci + VC);
    var j0 = Math.max(0, cj - VC), j1 = Math.min(N - 2, cj + VC);
    var P = FG.Projection.project;
    var shimmer = 0.5 + 0.5 * Math.sin(time * 0.7);
    for (var j = j0; j <= j1; j++) {
      for (var i = i0; i <= i1; i++) {
        var x0 = -HALF + i * CELL, x1 = x0 + CELL;
        var z0 = -HALF + j * CELL, z1 = z0 + CELL;
        // Frustum cull on the cell centre.
        var cx = (x0 + x1) / 2 - cam.x, cz = (z0 + z1) / 2 - cam.z;
        if (cx * cam.fx + cz * cam.fz < -80) continue;
        var a = j * N + i, b = j * N + i + 1, c = (j + 1) * N + i, d = (j + 1) * N + i + 1;
        var ha = T.heights[a], hb = T.heights[b], hc = T.heights[c], hd = T.heights[d];
        var pA = P(cam, x0, ha, z0), pB = P(cam, x1, hb, z0);
        var pC = P(cam, x0, hc, z1), pD = P(cam, x1, hd, z1);
        if (pA && pB && pC) {
          var col = cellColors[j][i][0];
          if (ha <= CFG.waterLevel + 0.4 && hb <= CFG.waterLevel + 0.4 && hc <= CFG.waterLevel + 0.4) {
            col = shimmer > 0.5 ? 'rgb(58,108,142)' : 'rgb(70,122,156)';
          }
          list.push({ kind: 'tri', p0: pA, p1: pB, p2: pC, c: col, d: (pA.d + pB.d + pC.d) / 3 });
        }
        if (pB && pD && pC) {
          var col2 = cellColors[j][i][1];
          if (hb <= CFG.waterLevel + 0.4 && hd <= CFG.waterLevel + 0.4 && hc <= CFG.waterLevel + 0.4) {
            col2 = shimmer > 0.5 ? 'rgb(58,108,142)' : 'rgb(70,122,156)';
          }
          list.push({ kind: 'tri', p0: pB, p1: pD, p2: pC, c: col2, d: (pB.d + pD.d + pC.d) / 3 });
        }
      }
    }
  }

  // ---- far ridge ring: coarse polar terrain out to the horizon ----
  function farRingTris(cam, list) {
    var radii = [750, 1100, 1550, 2000, 2400];
    var segs = 48;
    var P = FG.Projection.project;
    var ring = [];
    for (var r = 0; r < radii.length; r++) {
      ring.push([]);
      for (var s = 0; s <= segs; s++) {
        var az = (s / segs) * Math.PI * 2;
        var x = Math.sin(az) * radii[r], z = -Math.cos(az) * radii[r];
        var h = T.heightAt(x, z);
        ring[r].push({ x: x, y: h, z: z });
      }
    }
    for (var ri = 0; ri < radii.length - 1; ri++) {
      for (var si = 0; si < segs; si++) {
        var A = ring[ri][si], B = ring[ri][si + 1];
        var C = ring[ri + 1][si], D = ring[ri + 1][si + 1];
        var pA = P(cam, A.x, A.y, A.z), pB = P(cam, B.x, B.y, B.z);
        var pC = P(cam, C.x, C.y, C.z), pD = P(cam, D.x, D.y, D.z);
        var col = 'rgb(94,110,96)';
        if (A.y > 420) col = 'rgb(226,232,236)';
        else if (A.y > 240) col = 'rgb(122,110,96)';
        if (pA && pB && pC) list.push({ kind: 'tri', p0: pA, p1: pB, p2: pC, c: col, d: (pA.d + pB.d + pC.d) / 3 });
        if (pB && pD && pC) list.push({ kind: 'tri', p0: pB, p1: pD, p2: pC, c: col, d: (pB.d + pD.d + pC.d) / 3 });
      }
    }
  }

  // ---- runways, buildings, trees, windsock as triangles ----
  function objectTris(cam, list) {
    var P = FG.Projection.project;
    var i, k;
    function quadToTris(q) {
      var p = [];
      for (k = 0; k < 4; k++) {
        var s = P(cam, q.v[k][0], q.v[k][1], q.v[k][2]);
        if (!s) return;
        p.push(s);
      }
      var d = (p[0].d + p[1].d + p[2].d + p[3].d) / 4;
      var col = 'rgb(' + q.c[0] + ',' + q.c[1] + ',' + q.c[2] + ')';
      list.push({ kind: 'tri', p0: p[0], p1: p[1], p2: p[2], c: col, d: d });
      list.push({ kind: 'tri', p0: p[0], p1: p[2], p2: p[3], c: col, d: d });
    }
    for (i = 0; i < W.runwayQuads.length; i++) quadToTris(W.runwayQuads[i]);
    for (i = 0; i < W.buildingTris.length; i++) {
      var t = W.buildingTris[i];
      var pts = [];
      var ok = true;
      for (k = 0; k < 3; k++) {
        var s = P(cam, t.v[k][0], t.v[k][1], t.v[k][2]);
        if (!s) { ok = false; break; }
        pts.push(s);
      }
      if (!ok) continue;
      // Shade the building by which way its face points: a cheap normal.
      var ux = t.v[1][0] - t.v[0][0], uy = t.v[1][1] - t.v[0][1], uz = t.v[1][2] - t.v[0][2];
      var vx = t.v[2][0] - t.v[0][0], vy = t.v[2][1] - t.v[0][1], vz = t.v[2][2] - t.v[0][2];
      var ny = uz * vx - ux * vz;
      var bright = ny > 0 ? 1.0 : 0.82;
      var col = 'rgb(' + Math.round(t.c[0] * bright) + ',' + Math.round(t.c[1] * bright) + ',' + Math.round(t.c[2] * bright) + ')';
      list.push({ kind: 'tri', p0: pts[0], p1: pts[1], p2: pts[2], c: col, d: (pts[0].d + pts[1].d + pts[2].d) / 3 });
    }
    // Trees: one billboard triangle each, dark pine green.
    for (i = 0; i < W.trees.length; i++) {
      var tr = W.trees[i];
      var base = P(cam, tr.x, tr.y, tr.z);
      var top = P(cam, tr.x, tr.y + tr.hgt, tr.z);
      if (!base || !top) continue;
      var half = Math.max(2, (cam.focal * tr.r) / base.d);
      var left = { x: base.x - half, y: base.y, d: base.d };
      var right = { x: base.x + half, y: base.y, d: base.d };
      list.push({ kind: 'tri', p0: left, p1: right, p2: top, c: 'rgb(46,74,40)', d: base.d });
    }
    // Windsock pole + cone.
    var ws = W.windsock;
    var poleTop = P(cam, ws.x, ws.y + 9, ws.z);
    var poleBot = P(cam, ws.x, ws.y, ws.z);
    if (poleTop && poleBot) {
      list.push({ kind: 'line', p0: poleBot, p1: poleTop, c: 'rgb(220,220,210)', w: 2, d: poleBot.d });
      var tip = P(cam, ws.x + Math.sin(ws.dir) * 5, ws.y + 8.4, ws.z - Math.cos(ws.dir) * 5);
      if (tip) list.push({ kind: 'line', p0: poleTop, p1: tip, c: 'rgb(220,80,50)', w: 3, d: poleTop.d });
    }
  }

  // ---- clouds as soft billboards ----
  function cloudItems(cam, list) {
    var P = FG.Projection.project;
    for (var i = 0; i < W.clouds.length; i++) {
      var c = W.clouds[i];
      var s = P(cam, c.x, c.y, c.z);
      if (!s) continue;
      var r = (cam.focal * c.s) / s.d;
      if (r < 4) continue;
      list.push({ kind: 'cloud', x: s.x, y: s.y, r: r, d: s.d });
    }
  }

  // ---- rings as projected polylines ----
  function ringItems(cam, list, mission) {
    var P = FG.Projection.project;
    var next = FG.Missions.nextRingTarget(mission);
    for (var i = 0; i < W.rings.length; i++) {
      var ring = W.rings[i];
      var isNext = next === ring;
      var isDone = mission && i < mission.nextRing && mission.kind !== 'courier';
      if (isDone) continue;
      var pts = [];
      for (var k = 0; k <= 26; k++) {
        var wp = W.ringPoint(ring, (k / 26) * Math.PI * 2);
        var s = P(cam, wp[0], wp[1], wp[2]);
        if (s) pts.push(s);
      }
      if (pts.length < 4) continue;
      var d = 0;
      for (var m = 0; m < pts.length; m++) d += pts[m].d;
      d /= pts.length;
      list.push({
        kind: 'ring', pts: pts, d: d,
        c: isNext ? 'rgb(255,176,52)' : 'rgba(210,225,235,0.75)',
        w: isNext ? 5 : 3,
        glow: isNext
      });
    }
  }

  // ---- the aircraft ----
  function planeItems(cam, list, plane, time) {
    var tris = FG.Plane.projectModel(cam, plane);
    for (var i = 0; i < tris.length; i++) {
      var t = tris[i];
      // Flat shading: faces pointing up catch the sun.
      var ux = t.pts[1].x - t.pts[0].x, uy = t.pts[1].y - t.pts[0].y;
      var vx = t.pts[2].x - t.pts[0].x, vy = t.pts[2].y - t.pts[0].y;
      var shade = 0.9 + 0.1 * ((ux * vy - uy * vx) > 0 ? 1 : -1);
      var col = 'rgb(' + Math.round(t.c[0] * shade) + ',' + Math.round(t.c[1] * shade) + ',' + Math.round(t.c[2] * shade) + ')';
      list.push({ kind: 'tri', p0: t.pts[0], p1: t.pts[1], p2: t.pts[2], c: col, d: t.d });
    }
    // Spinning prop disc.
    var b = FG.Plane.basis(plane);
    var pc = FG.Plane.toWorld(b, plane, FG.Plane.prop.x, FG.Plane.prop.y, FG.Plane.prop.z);
    var P = FG.Projection.project;
    var s = P(cam, pc[0], pc[1], pc[2]);
    if (s && plane.throttle > 0.03) {
      var r = (cam.focal * FG.Plane.prop.r) / s.d;
      list.push({ kind: 'prop', x: s.x, y: s.y, r: r, a: time * (6 + plane.throttle * 30), d: s.d });
    }
  }

  function drawList(ctx, list) {
    list.sort(function (a, b) { return b.d - a.d; });
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      if (it.kind === 'tri') {
        fillTri(ctx, it.p0, it.p1, it.p2, it.c);
      } else if (it.kind === 'line') {
        ctx.strokeStyle = it.c;
        ctx.lineWidth = it.w;
        ctx.beginPath();
        ctx.moveTo(it.p0.x, it.p0.y);
        ctx.lineTo(it.p1.x, it.p1.y);
        ctx.stroke();
      } else if (it.kind === 'cloud') {
        ctx.fillStyle = 'rgba(255,255,255,0.82)';
        ctx.beginPath();
        ctx.ellipse(it.x, it.y, it.r, it.r * 0.36, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath();
        ctx.ellipse(it.x - it.r * 0.45, it.y + it.r * 0.1, it.r * 0.55, it.r * 0.26, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (it.kind === 'ring') {
        ctx.strokeStyle = it.c;
        ctx.lineWidth = it.w;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(it.pts[0].x, it.pts[0].y);
        for (var k = 1; k < it.pts.length; k++) ctx.lineTo(it.pts[k].x, it.pts[k].y);
        ctx.closePath();
        ctx.stroke();
        if (it.glow) {
          ctx.strokeStyle = 'rgba(255,176,52,0.25)';
          ctx.lineWidth = it.w + 7;
          ctx.stroke();
        }
      } else if (it.kind === 'prop') {
        ctx.fillStyle = 'rgba(60,50,45,0.28)';
        ctx.beginPath();
        ctx.ellipse(it.x, it.y, it.r, it.r, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(40,32,28,0.5)';
        ctx.lineWidth = Math.max(2, it.r * 0.12);
        var a = it.a;
        ctx.beginPath();
        ctx.moveTo(it.x - Math.cos(a) * it.r, it.y - Math.sin(a) * it.r);
        ctx.lineTo(it.x + Math.cos(a) * it.r, it.y + Math.sin(a) * it.r);
        ctx.stroke();
      }
    }
  }

  // ================= HUD =================
  // HUD panels: flat ink, 1px rule, corner brackets (HUD/FUI device).
  // No rounded cards, no soft shadows — see DESIGN.md.
  function panel(ctx, x, y, w, h) {
    // Solid enough that bright cloud behind a tape cannot wash the
    // figures out (0.58 let a cloud show through the compass and tapes).
    ctx.fillStyle = 'rgba(16,22,29,0.85)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.20)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    ctx.strokeStyle = TH.amber;
    ctx.lineWidth = 1.5;
    var b = 7;
    ctx.beginPath();
    ctx.moveTo(x, y + b); ctx.lineTo(x, y); ctx.lineTo(x + b, y);
    ctx.moveTo(x + w - b, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + b);
    ctx.moveTo(x + w, y + h - b); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - b, y + h);
    ctx.moveTo(x + b, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - b);
    ctx.stroke();
  }

  function drawCompass(ctx, w, plane) {
    var cx = w / 2, y = 14;
    panel(ctx, cx - 190, y, 380, 30);
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - 190, y, 380, 30);
    ctx.clip();
    ctx.fillStyle = TH.text;
    ctx.font = F_DATA;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var hdg = (FG.rad2deg(plane.heading) + 360) % 360;
    for (var d = -60; d <= 60; d += 5) {
      var deg = Math.round((hdg + d + 360) % 360);
      var x = cx + d * 3.1;
      var label = deg % 30 === 0 ? (deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : String(deg / 10)) : null;
      if (label) {
        ctx.fillText(label, x, y + 10);
        ctx.fillRect(x - 0.5, y + 18, 1, 8);
      } else {
        ctx.fillRect(x - 0.5, y + 20, 1, 5);
      }
    }
    ctx.restore();
    // Centre caret + readout.
    ctx.fillStyle = TH.amber;
    ctx.beginPath();
    ctx.moveTo(cx - 6, y + 2); ctx.lineTo(cx + 6, y + 2); ctx.lineTo(cx, y + 9);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = TH.amber;
    ctx.font = F_DATA_LG;
    ctx.fillText(String(Math.round(hdg)).padStart(3, '0') + '°', cx, y + 24);
  }

  function drawTape(ctx, x, y, h, value, unit, step, fmt) {
    panel(ctx, x, y, 64, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, 64, h);
    ctx.clip();
    ctx.font = F_DATA;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    var mid = y + h / 2;
    var range = step * 4;
    for (var v = Math.floor((value - range) / step) * step; v <= value + range; v += step) {
      var yy = mid - (v - value) * (h / (range * 2)) * 2;
      // Keep tick labels clear of the unit label at the panel's foot:
      // the lowest tick used to land on top of "KT"/"FT".
      if (yy < y + 6 || yy > y + h - 28) continue;
      ctx.fillStyle = '#cfd8de';
      ctx.fillText(fmt(v), x + 6, yy);
      ctx.fillRect(x + 44, yy - 0.5, 14, 1);
    }
    ctx.restore();
    // Current value box.
    ctx.fillStyle = TH.amber;
    ctx.fillRect(x - 4, mid - 11, 72, 22);
    ctx.fillStyle = '#14100a';
    ctx.font = F_DATA_LG;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle'; // centred in the box (was alphabetic: the
    ctx.fillText(fmt(value), x + 32, mid); // figure rode high and crowded
    ctx.textBaseline = 'alphabetic'; // the tick below it)
    ctx.fillStyle = TH.muted;
    ctx.font = F_LABEL;
    ctx.fillText(unit, x + 32, y + h - 8);
  }

  function drawHorizon(ctx, x, y, r, plane) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(x, y);
    ctx.rotate(-plane.roll);
    var pitchPx = clamp(plane.pitch, -0.5, 0.5) * r * 1.6;
    ctx.fillStyle = '#3f6f9e';
    ctx.fillRect(-r, -r + pitchPx - r, r * 2, r * 2);
    ctx.fillStyle = '#8a6a44';
    ctx.fillRect(-r, pitchPx, r * 2, r * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r, pitchPx);
    ctx.lineTo(r, pitchPx);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    // Fixed wings marker.
    ctx.strokeStyle = TH.amber;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.55, y); ctx.lineTo(x - r * 0.18, y);
    ctx.moveTo(x + r * 0.18, y); ctx.lineTo(x + r * 0.55, y);
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = TH.amber;
    ctx.fill();
  }

  function drawBars(ctx, x, y, w, plane, mission) {
    panel(ctx, x, y, w, 86);
    ctx.font = F_LABEL;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    function bar(by, label, frac, color) {
      ctx.fillStyle = TH.muted;
      ctx.fillText(label, x + 10, by + 7);
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(x + 62, by, w - 74, 12);
      ctx.fillStyle = color;
      ctx.fillRect(x + 62, by, (w - 74) * clamp(frac, 0, 1), 12);
    }
    bar(y + 10, 'Throttle', plane.throttle, TH.cyan);
    bar(y + 30, 'Fuel', plane.fuel / 100, plane.fuel < 20 ? TH.danger : TH.ok);
    bar(y + 50, 'Damage', plane.damage / 100, plane.damage > 60 ? TH.danger : TH.amber);
    ctx.fillStyle = TH.text;
    ctx.font = F_DATA_LG;
    var mm = Math.floor(mission.time / 60), ss = Math.floor(mission.time % 60);
    ctx.fillText('Score ' + mission.score + '  ' + String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0'), x + 10, y + 76);
    ctx.textAlign = 'right';
    ctx.fillText('Rings ' + mission.ringsHit + '/' + W.rings.length, x + w - 10, y + 76);
    ctx.textAlign = 'left';
  }

  function drawMinimap(ctx, x, y, s, plane, mission) {
    panel(ctx, x, y, s, s);
    var sc = s / (CFG.worldSize + 200);
    function mx(wx) { return x + s / 2 + wx * sc; }
    function mz(wz) { return y + s / 2 + wz * sc; }
    // River.
    ctx.strokeStyle = '#4a7ea8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var i = 0; i < T.river.length; i++) {
      var rp = T.river[i];
      if (i === 0) ctx.moveTo(mx(rp[0]), mz(rp[1]));
      else ctx.lineTo(mx(rp[0]), mz(rp[1]));
    }
    ctx.stroke();
    // Lake.
    ctx.fillStyle = '#4a7ea8';
    ctx.beginPath();
    ctx.ellipse(mx(T.lake.x), mz(T.lake.z), T.lake.rx * sc, T.lake.rz * sc, 0, 0, Math.PI * 2);
    ctx.fill();
    // Strips.
    ctx.fillStyle = '#c8c8c0';
    for (var k = 0; k < CFG.strips.length; k++) {
      var st = CFG.strips[k];
      ctx.save();
      ctx.translate(mx(st.x), mz(st.z));
      ctx.rotate(FG.deg2rad(st.heading) * -1);
      ctx.fillRect(-st.len * sc / 2, -2, st.len * sc, 4);
      ctx.restore();
    }
    // Rings.
    var next = FG.Missions.nextRingTarget(mission);
    for (var r = 0; r < W.rings.length; r++) {
      var rg = W.rings[r];
      ctx.fillStyle = next === rg ? TH.amber : 'rgba(220,230,235,0.7)';
      ctx.beginPath();
      ctx.arc(mx(rg.x), mz(rg.z), next === rg ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Plane.
    ctx.save();
    ctx.translate(mx(plane.x), mz(plane.z));
    ctx.rotate(plane.heading);
    ctx.fillStyle = TH.danger;
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawHUD(ctx, w, h, G) {
    var plane = G.plane, mission = G.mission;
    drawCompass(ctx, w, plane);
    // Header, top-left: wordmark, then the objective in plain words.
    ctx.fillStyle = TH.text;
    ctx.font = F_BODY_B;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Ridgeline Courier', 16, 30);
    ctx.fillStyle = TH.muted;
    ctx.font = F_BODY;
    ctx.fillText(FG.Missions.objectiveText(mission), 16, 52);
    // Tapes.
    drawTape(ctx, 16, 70, 190, FG.Physics.knots(plane.speed), 'KT', 10, function (v) { return String(Math.round(v)); });
    drawTape(ctx, w - 80, 70, 190, FG.Physics.feet(plane.y), 'FT', 100, function (v) { return String(Math.round(v)); });
    // Artificial horizon, bottom-left.
    drawHorizon(ctx, 86, h - 86, 62, plane);
    ctx.fillStyle = TH.muted;
    ctx.font = F_LABEL;
    ctx.textAlign = 'center';
    ctx.fillText('Attitude', 86, h - 10);
    // Bars, bottom-right. 280 wide: at 220 the score/timer string ran
    // into the right-aligned "Rings n/8" ("00:0Rings").
    drawBars(ctx, w - 296, h - 108, 280, plane, mission);
    // Minimap, top-right under the altitude tape.
    drawMinimap(ctx, w - 156, 272, 140, plane, mission);
    // Next-ring guidance: arrow + distance at screen centre.
    var next = FG.Missions.nextRingTarget(mission);
    if (next && plane.airborne) {
      var P = FG.Projection.project;
      var s = P(G.cam, next.x, next.y, next.z);
      var dx = next.x - plane.x, dy = next.y - plane.y, dz = next.z - plane.z;
      var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      ctx.fillStyle = TH.amber;
      ctx.font = F_DATA_LG;
      ctx.textAlign = 'center';
      if (s && s.x > 40 && s.x < w - 40 && s.y > 90 && s.y < h - 140) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, 16, 0, Math.PI * 2);
        ctx.strokeStyle = TH.amber;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillText(Math.round(dist) + ' m', s.x, s.y - 26);
      } else {
        // Off-screen: point at the screen edge.
        var ang = Math.atan2((s ? s.y : h / 2) - h / 2, (s ? s.x : w / 2) - w / 2);
        var ex = clamp(w / 2 + Math.cos(ang) * (w / 2 - 70), 60, w - 60);
        var ey = clamp(h / 2 + Math.sin(ang) * (h / 2 - 90), 100, h - 160);
        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(12, 0); ctx.lineTo(-8, -8); ctx.lineTo(-8, 8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.fillText(Math.round(dist) + ' m', ex, ey + 26);
      }
    }
    // Warning annunciator, centre-top. All-caps here is the cockpit
    // convention (STALL, LOW FUEL), not a template label — see DESIGN.md.
    var warn = null;
    if (plane.speed < CFG.stallSpeed && plane.airborne) warn = 'STALL';
    else if (plane.fuel < 20 && plane.fuel > 0) warn = 'LOW FUEL';
    else if (plane.fuel <= 0) warn = 'FUEL EMPTY';
    if (warn && Math.floor(G.time * 3) % 2 === 0) {
      ctx.fillStyle = TH.danger;
      ctx.font = '800 22px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚠ ' + warn, w / 2, 92);
    }
    // Message flash (ring hits, objectives).
    if (G.flash && G.time - G.flash.at < 2.2) {
      ctx.fillStyle = TH.amber;
      ctx.font = F_BODY_B;
      ctx.textAlign = 'center';
      ctx.fillText(G.flash.text, w / 2, 128);
    }
  }

  // ---- cockpit dashboard (drawn over the world in cockpit view) ----
  function drawCockpit(ctx, w, h, G) {
    var plane = G.plane;
    // Glareshield: dark panel across the bottom with a curved top.
    ctx.fillStyle = '#141a20';
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, h * 0.74);
    ctx.quadraticCurveTo(w * 0.5, h * 0.66, w, h * 0.74);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.74);
    ctx.quadraticCurveTo(w * 0.5, h * 0.66, w, h * 0.74);
    ctx.stroke();
    // Lit instruments on the panel.
    var cy = h * 0.86;
    drawHorizon(ctx, w * 0.5, cy, 52, plane);
    // Airspeed dial.
    ctx.fillStyle = '#0c1118';
    ctx.beginPath(); ctx.arc(w * 0.5 - 130, cy, 40, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = TH.cyan;
    ctx.font = '700 20px ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.round(FG.Physics.knots(plane.speed))), w * 0.5 - 130, cy - 6);
    ctx.fillStyle = TH.muted;
    ctx.font = F_LABEL;
    ctx.fillText('KT', w * 0.5 - 130, cy + 16);
    // Altimeter dial.
    ctx.fillStyle = '#0c1118';
    ctx.beginPath(); ctx.arc(w * 0.5 + 130, cy, 40, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.stroke();
    ctx.fillStyle = TH.cyan;
    ctx.font = '700 18px ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace';
    ctx.fillText(String(Math.round(FG.Physics.feet(plane.y))), w * 0.5 + 130, cy - 6);
    ctx.fillStyle = TH.muted;
    ctx.font = F_LABEL;
    ctx.fillText('FT', w * 0.5 + 130, cy + 16);
    // Heading + throttle strip on the panel.
    ctx.fillStyle = TH.text;
    ctx.font = F_DATA_LG;
    ctx.textAlign = 'left';
    ctx.fillText('Heading ' + String(Math.round((FG.rad2deg(plane.heading) + 360) % 360)).padStart(3, '0') + '°', w * 0.5 - 230, cy + 62);
    ctx.fillText('Throttle ' + Math.round(plane.throttle * 100) + '%', w * 0.5 + 130, cy + 62);
    ctx.textBaseline = 'alphabetic';
  }

  // ---- title / pause / end screens ----
  // Title screen: a sectional chart of the valley + a flight-plan table.
  // No cards, no all-caps eyebrow, no middle-dot meta strings — the chart
  // is the one bold element (see DESIGN.md). Everything is drawn from the
  // game's real data: river, lake, strips, ring course.
  function drawTitle(ctx, w, h, G) {
    ctx.fillStyle = TH.chartPaper;
    ctx.fillRect(0, 0, w, h);
    var ink = TH.ink;
    // ---- chart panel, left ----
    var cx0 = 48, cy0 = 48, cw = Math.floor(w * 0.55) - 72, ch = h - 96;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx0, cy0, cw, ch);
    ctx.strokeStyle = 'rgba(28,43,51,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx0 + 6, cy0 + 6, cw - 12, ch - 12);
    var sc = Math.min(cw, ch) / (CFG.worldSize + 200);
    var ox = cx0 + cw / 2, oy = cy0 + ch / 2;
    function mx(wx) { return ox + wx * sc; }
    function mz(wz) { return oy + wz * sc; }
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx0 + 6, cy0 + 6, cw - 12, ch - 12);
    ctx.clip();
    // Faint field patchwork on the valley floor.
    ctx.fillStyle = 'rgba(120,140,80,0.10)';
    for (var fy = -2200; fy < 2200; fy += 400) {
      for (var fx = -2200; fx < 2200; fx += 400) {
        if (((fx + fy) / 400) % 2 === 0) ctx.fillRect(mx(fx), mz(fy), 400 * sc, 400 * sc);
      }
    }
    // Contour arcs over the northern ridge.
    ctx.strokeStyle = 'rgba(140,110,80,0.55)';
    ctx.lineWidth = 1;
    for (var cr = 0; cr < 3; cr++) {
      ctx.beginPath();
      ctx.arc(mx(0), mz(-2600), (900 + cr * 260) * sc, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }
    // River + lake.
    ctx.strokeStyle = '#4A7EA8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var ri = 0; ri < T.river.length; ri++) {
      var rp = T.river[ri];
      if (ri === 0) ctx.moveTo(mx(rp[0]), mz(rp[1]));
      else ctx.lineTo(mx(rp[0]), mz(rp[1]));
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(74,126,168,0.75)';
    ctx.beginPath();
    ctx.ellipse(mx(T.lake.x), mz(T.lake.z), T.lake.rx * sc, T.lake.rz * sc, 0, 0, Math.PI * 2);
    ctx.fill();
    // Ring course: dashed amber route with numbered waypoints.
    ctx.strokeStyle = TH.amber;
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    var st0 = CFG.strips[0];
    ctx.moveTo(mx(st0.x), mz(st0.z));
    for (var rg = 0; rg < W.rings.length; rg++) {
      ctx.lineTo(mx(W.rings[rg].x), mz(W.rings[rg].z));
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = F_LABEL;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var rn = 0; rn < W.rings.length; rn++) {
      var rpos = W.rings[rn];
      ctx.fillStyle = TH.chartPaper;
      ctx.beginPath();
      ctx.arc(mx(rpos.x), mz(rpos.z), 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = TH.amber;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = ink;
      ctx.fillText(String(rn + 1), mx(rpos.x), mz(rpos.z));
    }
    // Airfields: runway bar + label. The label sits just beyond the
    // runway's far tip, clear of the bar: the old offset (+12,-8) put
    // Pine Hollow's diagonal bar straight through its own name.
    for (var as = 0; as < CFG.strips.length; as++) {
      var ast = CFG.strips[as];
      ctx.save();
      ctx.translate(mx(ast.x), mz(ast.z));
      ctx.rotate(FG.deg2rad(ast.heading) * -1);
      ctx.fillStyle = '#3A3A34';
      ctx.fillRect(-ast.len * sc / 2, -2.5, ast.len * sc, 5);
      ctx.restore();
      var ah = FG.deg2rad(ast.heading);
      var ax = Math.cos(ah), ay = -Math.sin(ah); // along the bar, screen
      var nx = Math.sin(ah), ny = Math.cos(ah); // across the bar, screen
      var off = ast.len * sc / 2 + 8;
      ctx.fillStyle = ink;
      ctx.font = F_BODY_B;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(ast.name, mx(ast.x) + ax * off + nx * 8, mz(ast.z) + ay * off + ny * 8);
    }
    // Compass rose, top-right of the chart.
    var rx = cx0 + cw - 52, ry = cy0 + 52;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(rx, ry, 30, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.font = F_LABEL;
    ctx.textAlign = 'center';
    ctx.fillText('N', rx, ry - 20);
    ctx.beginPath();
    ctx.moveTo(rx, ry - 26); ctx.lineTo(rx - 4, ry - 12); ctx.lineTo(rx + 4, ry - 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = ink;
    ctx.font = F_LABEL;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Kestrel Valley sectional', cx0 + 12, cy0 + ch - 12);
    ctx.textAlign = 'right';
    ctx.fillText('Not for navigation', cx0 + cw - 12, cy0 + ch - 12);
    // ---- right column: title + flight-plan table ----
    var tx = cx0 + cw + 40;
    var tw = w - tx - 48;
    ctx.fillStyle = ink;
    ctx.font = F_DISPLAY;
    ctx.textAlign = 'left';
    ctx.fillText('Ridgeline', tx, cy0 + 78);
    ctx.fillText('Courier', tx, cy0 + 134);
    ctx.fillStyle = TH.amber;
    ctx.fillRect(tx, cy0 + 152, 64, 4);
    ctx.fillStyle = ink;
    ctx.font = F_BODY;
    ctx.fillText('A bush plane, a valley, and a parcel that will not wait.', tx, cy0 + 182);
    var rows = [
      { key: '1', kind: 'rings', name: 'Ring run', route: 'Eight rings down the valley, against the clock, then land at Kestrel Field.', fuel: 'Full tank' },
      { key: '2', kind: 'courier', name: 'Courier', route: 'Pick up over Kestrel, deliver to Pine Hollow, fly home.', fuel: 'Watch the gauge' },
      { key: '3', kind: 'free', name: 'Free flight', route: 'No course, no clock. Explore the valley until the tank runs dry.', fuel: 'Full tank' }
    ];
    var ty = cy0 + 216;
    ctx.font = F_LABEL;
    ctx.fillStyle = 'rgba(28,43,51,0.6)';
    ctx.fillText('Flight plan — pick a sortie', tx, ty);
    G.titleCards = [];
    for (var i = 0; i < 3; i++) {
      var ry2 = ty + 16 + i * 92;
      ctx.strokeStyle = 'rgba(28,43,51,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tx, ry2);
      ctx.lineTo(tx + tw, ry2);
      ctx.stroke();
      // Key number in an amber square: the keyboard shortcut, not decoration.
      ctx.fillStyle = TH.amber;
      ctx.fillRect(tx, ry2 + 16, 26, 26);
      ctx.fillStyle = TH.panelInk;
      ctx.font = '700 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(rows[i].key, tx + 13, ry2 + 30);
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = ink;
      ctx.font = F_BODY_B;
      ctx.textAlign = 'left';
      ctx.fillText(rows[i].name, tx + 38, ry2 + 30);
      ctx.fillStyle = 'rgba(28,43,51,0.65)';
      ctx.font = F_LABEL;
      ctx.textAlign = 'right'; // set BEFORE drawing: it was after, so the
      ctx.fillText(rows[i].fuel, tx + tw - 8, ry2 + 30); // fuel ran off the
      ctx.fillStyle = ink; // right edge ("Watch the gauge" clipped) and the
      ctx.font = F_BODY; // route below inherited 'right' and spilled left
      ctx.textAlign = 'left'; // over the chart.
      wrapTextLeft(ctx, rows[i].route, tx + 38, ry2 + 54, tw - 38, 18);
      G.titleCards.push({ x: tx, y: ry2, w: tw, h: 92, kind: rows[i].kind });
    }
    ctx.strokeStyle = 'rgba(28,43,51,0.4)';
    ctx.beginPath();
    ctx.moveTo(tx, ty + 16 + 3 * 92);
    ctx.lineTo(tx + tw, ty + 16 + 3 * 92);
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.font = F_BODY;
    ctx.textAlign = 'left';
    ctx.fillText('Arrows fly the plane. Shift and Ctrl work the throttle.', tx, ty + 16 + 3 * 92 + 30);
    ctx.fillText('C switches camera, P pauses, M toggles sound.', tx, ty + 16 + 3 * 92 + 54);
    ctx.fillStyle = 'rgba(28,43,51,0.65)';
    ctx.fillText('Press Enter or click a row to fly.', tx, ty + 16 + 3 * 92 + 84);
  }

  function wrapTextLeft(ctx, text, x, y, maxW, lh) {
    var words = text.split(' ');
    var lines = [''];
    for (var i = 0; i < words.length; i++) {
      var test = lines[lines.length - 1] + (lines[lines.length - 1] ? ' ' : '') + words[i];
      if (ctx.measureText(test).width > maxW && lines[lines.length - 1]) lines.push(words[i]);
      else lines[lines.length - 1] = test;
    }
    for (var j = 0; j < lines.length; j++) ctx.fillText(lines[j], x, y + j * lh);
  }

  function wrapText(ctx, text, cx, y, maxW, lh) {
    var words = text.split(' ');
    var lines = [''];
    for (var i = 0; i < words.length; i++) {
      var test = lines[lines.length - 1] + (lines[lines.length - 1] ? ' ' : '') + words[i];
      if (ctx.measureText(test).width > maxW && lines[lines.length - 1]) lines.push(words[i]);
      else lines[lines.length - 1] = test;
    }
    for (var j = 0; j < lines.length; j++) ctx.fillText(lines[j], cx, y + j * lh);
  }

  function drawEnd(ctx, w, h, G, title, lines) {
    ctx.fillStyle = 'rgba(16,22,29,0.55)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = TH.cream;
    ctx.font = F_DISPLAY_SM;
    ctx.fillText(title, w / 2, h * 0.38);
    ctx.fillStyle = TH.text;
    ctx.font = F_BODY_B;
    for (var i = 0; i < lines.length; i++) ctx.fillText(lines[i], w / 2, h * 0.38 + 36 + i * 26);
    ctx.fillStyle = TH.amber;
    ctx.font = F_BODY_B;
    ctx.fillText('Press R to fly again', w / 2, h * 0.38 + 40 + lines.length * 26 + 18);
  }

  // ================= main entry =================
  function computeCamera(G, w, h) {
    var cam = FG.Projection.makeCamera();
    cam.focal = (h / 2) / Math.tan(CFG.fov / 2);
    cam.cx = w / 2;
    cam.cy = h / 2;
    var p = G.plane;
    if (G.cameraMode === 'cockpit') {
      var b = FG.Plane.basis(p);
      cam.x = p.x + b.fx * 1.4 + b.ux * 0.85;
      cam.y = p.y + b.fy * 1.4 + b.uy * 0.85;
      cam.z = p.z + b.fz * 1.4 + b.uz * 0.85;
      cam.yaw = p.heading;
      cam.pitch = p.pitch;
      cam.roll = p.roll * 0.8;
    } else {
      var b2 = FG.Plane.basis(p);
      cam.x = p.x - b2.fx * CFG.chaseDist + b2.ux * CFG.chaseHeight;
      cam.y = p.y - b2.fy * CFG.chaseDist + b2.uy * CFG.chaseHeight;
      cam.z = p.z - b2.fz * CFG.chaseDist + b2.uz * CFG.chaseHeight;
      cam.yaw = p.heading;
      cam.pitch = p.pitch * 0.5 + 0.05;
      cam.roll = p.roll * 0.45;
    }
    FG.Projection.update(cam);
    return cam;
  }

  function render(ctx, w, h, G) {
    // The title screen is a drawn chart, not the 3D world: skip the scene.
    if (G.mode === 'title') {
      drawTitle(ctx, w, h, G);
      return;
    }
    var cam = computeCamera(G, w, h);
    G.cam = cam;
    drawSky(ctx, w, h, cam);
    var list = [];
    farRingTris(cam, list);
    terrainTris(cam, list, G.time);
    objectTris(cam, list);
    cloudItems(cam, list);
    ringItems(cam, list, G.mission);
    planeItems(cam, list, G.plane, G.time);
    drawList(ctx, list);
    if (G.mode === 'paused') {
      drawHUD(ctx, w, h, G);
      drawEnd(ctx, w, h, G, 'Paused', ['The valley waits. Press P to keep flying.']);
    } else if (G.mode === 'crashed') {
      drawHUD(ctx, w, h, G);
      drawEnd(ctx, w, h, G, 'Crashed', [G.crashWhy || '', 'Score: ' + G.mission.score + ' pts']);
    } else if (G.mode === 'landed') {
      drawHUD(ctx, w, h, G);
      drawEnd(ctx, w, h, G, 'Landed', [G.mission.doneText, 'Score: ' + G.mission.score + ' pts']);
    } else {
      if (G.cameraMode === 'cockpit') drawCockpit(ctx, w, h, G);
      drawHUD(ctx, w, h, G);
    }
  }

  FG.Render = { render: render };
})();
