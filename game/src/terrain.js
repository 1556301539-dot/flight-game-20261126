// terrain.js — the Kestrel Valley heightfield: rolling hills, a northern
// ridge, a river valley running down to a lake, patchwork fields, forest,
// and two flattened airstrips. Built once from a fixed seed, so the world
// is identical on every load. Pure math, no DOM.
(function () {
  'use strict';
  var FG = window.FG;
  var CFG = FG.CFG;
  var clamp = FG.clamp, lerp = FG.lerp;

  var N = CFG.gridN;                 // vertices per side
  var SIZE = CFG.worldSize;
  var CELL = SIZE / (N - 1);         // 50 m
  var HALF = SIZE / 2;

  var noise = FG.makeNoise(CFG.seed);
  var rng = FG.mulberry32(CFG.seed + 77);

  // The river: a polyline from the north-west hills down to the lake.
  var RIVER = [
    [-2300, -1850], [-1750, -1150], [-1150, -450], [-550, 150],
    [100, 650], [750, 1050], [1300, 1450], [1650, 1700]
  ];
  var LAKE = { x: 1850, z: 1850, rx: 520, rz: 420 };

  // Field palette: one crop colour per 200 m patch, picked by hash.
  var CROPS = [
    [181, 166, 66], [122, 154, 74], [168, 127, 63], [93, 125, 67],
    [194, 178, 128], [139, 150, 88], [107, 143, 78], [176, 150, 90]
  ];

  function distToSegment(px, pz, ax, az, bx, bz) {
    var dx = bx - ax, dz = bz - az;
    var len2 = dx * dx + dz * dz;
    var t = len2 === 0 ? 0 : ((px - ax) * dx + (pz - az) * dz) / len2;
    t = clamp(t, 0, 1);
    var cx = ax + dx * t, cz = az + dz * t;
    return Math.sqrt((px - cx) * (px - cx) + (pz - cz) * (pz - cz));
  }

  function distToRiver(x, z) {
    var best = 1e9;
    for (var i = 0; i < RIVER.length - 1; i++) {
      var d = distToSegment(x, z, RIVER[i][0], RIVER[i][1], RIVER[i + 1][0], RIVER[i + 1][1]);
      if (d < best) best = d;
    }
    return best;
  }

  function inLake(x, z) {
    var dx = (x - LAKE.x) / LAKE.rx, dz = (z - LAKE.z) / LAKE.rz;
    return dx * dx + dz * dz < 1;
  }

  // Rotate a world point into a strip's local frame (along / across runway).
  function stripLocal(strip, x, z) {
    var h = FG.deg2rad(strip.heading);
    var dx = x - strip.x, dz = z - strip.z;
    // Runway direction vector: heading 0 = north (-z), clockwise.
    var fx = Math.sin(h), fz = -Math.cos(h);
    var rx = Math.cos(h), rz = Math.sin(h);
    return { along: dx * fx + dz * fz, across: dx * rx + dz * rz };
  }

  function baseHeight(x, z) {
    // Rolling hills.
    var h = 55 + CFG.hillAmp * 0.5 * (noise.fbm(x * 0.00045 + 7.3, z * 0.00045 + 2.1, 3) + 1);
    h += 22 * noise.fbm(x * 0.0016 + 1.7, z * 0.0016 + 8.4, 2);
    // Northern ridge (and a lower western shoulder) hems the valley in.
    var north = clamp(((-z - (HALF - CFG.ridgeBand)) / CFG.ridgeBand), 0, 1);
    h += CFG.ridgeAmp * north * north * (0.75 + 0.25 * noise.fbm(x * 0.0009, z * 0.0009, 2));
    var west = clamp(((-x - (HALF - 700)) / 700), 0, 1);
    h += 260 * west * west;
    // River valley carve: the floor drops toward the water.
    var dr = distToRiver(x, z);
    var carve = 1 - clamp(dr / 380, 0, 1);
    carve = carve * carve * (3 - 2 * carve);
    h = lerp(h, CFG.waterLevel + 3, carve * 0.92);
    if (inLake(x, z)) h = CFG.waterLevel - 2;
    return h;
  }

  var heights = new Float32Array(N * N);
  var colors = new Uint8Array(N * N * 3); // per-vertex rgb
  var shade = new Float32Array(N * N);    // per-vertex sun shade 0..1

  function vertexColor(x, z, h, slope) {
    // Water first: anything at or below the waterline is river or lake.
    if (h <= CFG.waterLevel + 0.4) return [63, 111, 143];
    if (h <= CFG.waterLevel + 3.5) return [203, 185, 138]; // sandy banks
    var moist = noise.fbm(x * 0.0009 + 4.4, z * 0.0009 + 9.9, 2);
    // Snow on the high ridge.
    if (h > 430 && slope < 0.55) return [232, 238, 242];
    // Steep ground is bare rock.
    if (slope > 0.55) return [138, 127, 116];
    if (slope > 0.38) return [122, 110, 88];
    // Forest where it is damp and not too high.
    if (moist > 0.22 && h < 260) return [61, 92, 51];
    // Patchwork fields on the valley floor.
    if (h < 170) {
      var fx = Math.floor((x + HALF) / 200), fz = Math.floor((z + HALF) / 200);
      var pick = CROPS[Math.abs(Math.floor(noise.hash(fx, fz) * 997)) % CROPS.length];
      // Vary each patch slightly so the quilt reads.
      var v = 0.92 + 0.16 * ((noise.hash(fx * 3 + 1, fz * 5 + 2) + 1) * 0.5);
      return [Math.round(pick[0] * v), Math.round(pick[1] * v), Math.round(pick[2] * v)];
    }
    // Meadow grass on the slopes.
    var g = 0.9 + 0.2 * ((moist + 1) * 0.5);
    return [Math.round(125 * g), Math.round(160 * g), Math.round(92 * g)];
  }

  function build() {
    var i, j, x, z;
    // Pass 1: heights, with airstrips flattened to their centre height.
    var stripH = [];
    for (var s = 0; s < CFG.strips.length; s++) {
      stripH.push(baseHeight(CFG.strips[s].x, CFG.strips[s].z));
    }
    for (j = 0; j < N; j++) {
      z = -HALF + j * CELL;
      for (i = 0; i < N; i++) {
        x = -HALF + i * CELL;
        var h = baseHeight(x, z);
        for (s = 0; s < CFG.strips.length; s++) {
          var st = CFG.strips[s];
          var L = stripLocal(st, x, z);
          var edge = Math.max(Math.abs(L.along) - st.len / 2, Math.abs(L.across) - st.wid / 2);
          if (edge < 90) {
            var t = 1 - clamp(edge / 90, 0, 1);
            t = t * t * (3 - 2 * t);
            h = lerp(h, stripH[s], t);
          }
        }
        heights[j * N + i] = h;
      }
    }
    // Pass 2: colours and sun shade from the finished heights.
    var sun = { x: -0.55, y: 0.62, z: 0.42 };
    var sl = Math.sqrt(sun.x * sun.x + sun.y * sun.y + sun.z * sun.z);
    sun.x /= sl; sun.y /= sl; sun.z /= sl;
    for (j = 0; j < N; j++) {
      z = -HALF + j * CELL;
      for (i = 0; i < N; i++) {
        x = -HALF + i * CELL;
        var idx = j * N + i;
        var hx = heights[j * N + Math.min(i + 1, N - 1)] - heights[j * N + Math.max(i - 1, 0)];
        var hz = heights[Math.min(j + 1, N - 1) * N + i] - heights[Math.max(j - 1, 0) * N + i];
        var slope = Math.sqrt(hx * hx + hz * hz) / (2 * CELL);
        var c = vertexColor(x, z, heights[idx], slope);
        colors[idx * 3] = c[0]; colors[idx * 3 + 1] = c[1]; colors[idx * 3 + 2] = c[2];
        // Normal from the height gradient; shade by the sun.
        var nx = -hx / (2 * CELL), nz = -hz / (2 * CELL);
        var nl = Math.sqrt(nx * nx + 1 + nz * nz);
        var dot = (nx * sun.x + 1 * sun.y + nz * sun.z) / nl;
        shade[idx] = 0.74 + 0.26 * clamp(dot, 0, 1);
      }
    }
  }

  build();

  // Bilinear height lookup. Outside the world, return a high wall so the
  // physics never lets the plane slip off the map's edge.
  function heightAt(x, z) {
    if (x < -HALF || x > HALF || z < -HALF || z > HALF) return 900;
    var gx = (x + HALF) / CELL, gz = (z + HALF) / CELL;
    var i = Math.min(Math.floor(gx), N - 2), j = Math.min(Math.floor(gz), N - 2);
    var fx = gx - i, fz = gz - j;
    var h00 = heights[j * N + i], h10 = heights[j * N + i + 1];
    var h01 = heights[(j + 1) * N + i], h11 = heights[(j + 1) * N + i + 1];
    return lerp(lerp(h00, h10, fx), lerp(h01, h11, fx), fz);
  }

  function isWater(x, z) {
    return heightAt(x, z) <= CFG.waterLevel + 0.4;
  }

  function stripAt(x, z) {
    for (var s = 0; s < CFG.strips.length; s++) {
      var st = CFG.strips[s];
      var L = stripLocal(st, x, z);
      if (Math.abs(L.along) <= st.len / 2 && Math.abs(L.across) <= st.wid / 2) return st;
    }
    return null;
  }

  FG.Terrain = {
    N: N, CELL: CELL, HALF: HALF,
    heights: heights, colors: colors, shade: shade,
    heightAt: heightAt, isWater: isWater, stripAt: stripAt,
    stripLocal: stripLocal, distToRiver: distToRiver, inLake: inLake,
    lake: LAKE, river: RIVER
  };
})();
