// world.js — everything built on top of the terrain: the ring course, the
// runways with their markings, the airfield buildings, the pine trees, the
// clouds and the windsock. All positions are fixed by the seed, so the
// valley looks the same in every screenshot.
(function () {
  'use strict';
  var FG = window.FG;
  var CFG = FG.CFG;
  var T = FG.Terrain;
  var clamp = FG.clamp;

  var rng = FG.mulberry32(CFG.seed + 4242);

  // ---- the ring course: out along the valley to the lake, then home ----
  var RING_SPOTS = [
    { x: -850, z: 900, y: 200 },
    { x: -350, z: 500, y: 240 },
    { x: 200, z: 250, y: 280 },
    { x: 750, z: 700, y: 320 },
    { x: 1250, z: 1150, y: 300 },
    { x: 1600, z: 1550, y: 260 },
    { x: 900, z: 1850, y: 300 },
    { x: -200, z: 1600, y: 260 }
  ];

  var rings = [];
  (function buildRings() {
    for (var i = 0; i < RING_SPOTS.length; i++) {
      var s = RING_SPOTS[i];
      // The ring faces the course: its normal points from this ring toward
      // the next one (the last ring faces back toward Kestrel Field).
      var nx = (i + 1 < RING_SPOTS.length) ? RING_SPOTS[i + 1] : { x: -1150, z: 1150 };
      var dx = nx.x - s.x, dz = nx.z - s.z;
      var len = Math.sqrt(dx * dx + dz * dz) || 1;
      rings.push({
        x: s.x, y: s.y, z: s.z, r: CFG.ringRadius,
        nx: dx / len, ny: 0, nz: dz / len
      });
    }
  })();

  // One point on a ring's circle, parameter t in radians. u is the ring's
  // horizontal axis, v is world up (rings stand vertical).
  function ringPoint(ring, t) {
    var ux = -ring.nz, uz = ring.nx; // horizontal, perpendicular to normal
    var ct = Math.cos(t), st = Math.sin(t);
    return [
      ring.x + (ux * ct) * ring.r,
      ring.y + st * ring.r,
      ring.z + (uz * ct) * ring.r
    ];
  }

  // ---- runway paint: asphalt, thresholds, centreline, numbers ----
  // 3x5 digit bitmaps, drawn as white quads on the asphalt.
  var DIGITS = {
    '0': ['111', '101', '101', '101', '111'],
    '1': ['010', '110', '010', '010', '111'],
    '2': ['111', '001', '111', '100', '111'],
    '3': ['111', '001', '111', '001', '111'],
    '4': ['101', '101', '111', '001', '001'],
    '5': ['111', '100', '111', '001', '111'],
    '6': ['111', '100', '111', '101', '111'],
    '7': ['111', '001', '010', '010', '010'],
    '8': ['111', '101', '111', '101', '111'],
    '9': ['111', '101', '111', '001', '111']
  };

  function stripBasis(strip) {
    var h = FG.deg2rad(strip.heading);
    return { fx: Math.sin(h), fz: -Math.cos(h), rx: Math.cos(h), rz: Math.sin(h) };
  }

  // A flat quad on the runway surface (y lifted 0.25 m to avoid z-fighting).
  function runwayQuad(strip, h, along0, along1, across0, across1, color, out) {
    var b = stripBasis(strip);
    function pt(along, across) {
      return [
        strip.x + b.fx * along + b.rx * across,
        h + 0.25,
        strip.z + b.fz * along + b.rz * across
      ];
    }
    out.push({ v: [pt(along0, across0), pt(along1, across0), pt(along1, across1), pt(along0, across1)], c: color });
  }

  function digitQuads(strip, h, text, along, across, size, out) {
    var b = stripBasis(strip);
    var w = size, px = size * 0.9;
    for (var d = 0; d < text.length; d++) {
      var glyph = DIGITS[text[d]];
      if (!glyph) continue;
      for (var row = 0; row < 5; row++) {
        for (var col = 0; col < 3; col++) {
          if (glyph[row][col] !== '1') continue;
          var a0 = along - (row + 0.5) * px - px / 2 + size * 2.5;
          var c0 = across + d * size * 4 + col * px;
          var p0 = [strip.x + b.fx * a0 + b.rx * c0, h + 0.3, strip.z + b.fz * a0 + b.rz * c0];
          var p1 = [strip.x + b.fx * (a0 + px) + b.rx * c0, h + 0.3, strip.z + b.fz * (a0 + px) + b.rz * c0];
          var p2 = [strip.x + b.fx * (a0 + px) + b.rx * (c0 + px), h + 0.3, strip.z + b.fz * (a0 + px) + b.rz * (c0 + px)];
          var p3 = [strip.x + b.fx * a0 + b.rx * (c0 + px), h + 0.3, strip.z + b.fz * a0 + b.rz * (c0 + px)];
          out.push({ v: [p0, p1, p2, p3], c: [235, 235, 225] });
        }
      }
    }
  }

  var runwayQuads = [];
  (function buildRunways() {
    var ASPHALT = [52, 54, 58];
    var WHITE = [235, 235, 225];
    for (var s = 0; s < CFG.strips.length; s++) {
      var st = CFG.strips[s];
      var h = T.heightAt(st.x, st.z);
      var L = st.len / 2, W = st.wid / 2;
      runwayQuad(st, h, -L, L, -W, W, ASPHALT, runwayQuads);
      // Threshold bars at both ends.
      runwayQuad(st, h, -L + 4, -L + 14, -W + 3, W - 3, WHITE, runwayQuads);
      runwayQuad(st, h, L - 14, L - 4, -W + 3, W - 3, WHITE, runwayQuads);
      // Centreline dashes.
      for (var d = -L + 30; d < L - 30; d += 46) {
        runwayQuad(st, h, d, d + 24, -1.2, 1.2, WHITE, runwayQuads);
      }
      // Runway numbers: heading rounded to the nearest 10 degrees.
      var num = String(Math.round((((st.heading % 360) + 360) % 360) / 10) % 36 || 36);
      if (num.length === 1) num = '0' + num;
      var opp = String((parseInt(num, 10) + 18) % 36 || 36);
      if (opp.length === 1) opp = '0' + opp;
      digitQuads(st, h, num, -L + 34, -7, 4.2, runwayQuads);
      digitQuads(st, h, opp, L - 34 - 21, -7, 4.2, runwayQuads);
    }
  })();

  // ---- buildings: boxes with gable roofs, as triangles ----
  function boxTris(tris, cx, cy, cz, w, h, d, color, roofColor) {
    var x0 = cx - w / 2, x1 = cx + w / 2;
    var y0 = cy, y1 = cy + h;
    var z0 = cz - d / 2, z1 = cz + d / 2;
    function q(a, b, c, e, col) {
      tris.push({ v: [a, b, c], c: col });
      tris.push({ v: [a, c, e], c: col });
    }
    q([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], color); // front
    q([x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], color); // back
    q([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], color); // right
    q([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], color); // left
    q([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], color); // top
    if (roofColor) {
      // Gable roof: a ridge along x at the top.
      var ry = y1 + h * 0.45;
      tris.push({ v: [[x0, y1, z0], [x1, y1, z0], [(x0 + x1) / 2, ry, z0]], c: roofColor });
      tris.push({ v: [[x1, y1, z1], [x0, y1, z1], [(x0 + x1) / 2, ry, z1]], c: roofColor });
      tris.push({ v: [[x0, y1, z0], [(x0 + x1) / 2, ry, z0], [(x0 + x1) / 2, ry, z1]], c: roofColor });
      tris.push({ v: [[x0, y1, z0], [(x0 + x1) / 2, ry, z1], [x0, y1, z1]], c: roofColor });
      tris.push({ v: [[x1, y1, z1], [(x0 + x1) / 2, ry, z1], [(x0 + x1) / 2, ry, z0]], c: roofColor });
      tris.push({ v: [[x1, y1, z1], [(x0 + x1) / 2, ry, z0], [x1, y1, z0]], c: roofColor });
    }
  }

  var buildingTris = [];
  (function buildAirfields() {
    var K = CFG.strips[0], P = CFG.strips[1];
    var gy = T.heightAt(K.x, K.z);
    // Kestrel Field: hangar, tower, fuel hut, set back from the runway.
    boxTris(buildingTris, K.x - 60, gy, K.z + 70, 34, 12, 26, [196, 188, 168], [150, 60, 48]);
    boxTris(buildingTris, K.x - 110, gy, K.z + 55, 12, 26, 12, [210, 204, 186], [120, 120, 118]);
    boxTris(buildingTris, K.x - 108, gy + 26, K.z + 55, 13, 5, 13, [40, 60, 84], null); // glass cab
    boxTris(buildingTris, K.x - 20, gy, K.z + 78, 10, 6, 8, [180, 60, 50], [120, 50, 44]);
    var py = T.heightAt(P.x, P.z);
    // Pine Hollow: one hangar and a hut.
    boxTris(buildingTris, P.x + 45, py, P.z - 55, 26, 10, 20, [188, 180, 160], [140, 58, 46]);
    boxTris(buildingTris, P.x + 75, py, P.z - 40, 8, 5, 7, [170, 120, 70], null);
  })();

  // ---- pine trees: cones near the strips and along the river ----
  var trees = [];
  (function buildTrees() {
    var spots = [];
    for (var i = 0; i < 46; i++) {
      var a = rng() * Math.PI * 2, r = 90 + rng() * 260;
      var st = CFG.strips[i % 2];
      spots.push([st.x + Math.cos(a) * r, st.z + Math.sin(a) * r]);
    }
    for (var j = 0; j < 30; j++) {
      var t = rng();
      var rx = -2200 + t * 4000, rz = -1750 + t * 3500;
      spots.push([rx + (rng() - 0.5) * 160, rz + (rng() - 0.5) * 160]);
    }
    for (var k = 0; k < spots.length; k++) {
      var x = spots[k][0], z = spots[k][1];
      if (T.stripAt(x, z)) continue;
      var h = T.heightAt(x, z);
      if (h <= CFG.waterLevel + 2 || h > 300) continue;
      trees.push({ x: x, y: h, z: z, hgt: 9 + rng() * 9, r: 3 + rng() * 2 });
    }
  })();

  // ---- clouds: soft billboards high over the valley ----
  var clouds = [];
  (function buildClouds() {
    for (var i = 0; i < 14; i++) {
      clouds.push({
        x: -2200 + rng() * 4400,
        y: 720 + rng() * 320,
        z: -2200 + rng() * 4400,
        s: 90 + rng() * 160
      });
    }
  })();

  // ---- windsock at Kestrel Field ----
  var K0 = CFG.strips[0];
  var windsock = {
    x: K0.x + 40, y: T.heightAt(K0.x + 40, K0.z - 40), z: K0.z - 40,
    dir: FG.deg2rad(CFG.wind.from + 180) // the sock points downwind
  };

  FG.World = {
    rings: rings,
    ringPoint: ringPoint,
    runwayQuads: runwayQuads,
    buildingTris: buildingTris,
    trees: trees,
    clouds: clouds,
    windsock: windsock
  };
})();
