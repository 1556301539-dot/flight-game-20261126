// plane.js — the Kestrel fire-spotter aircraft, built from flat-shaded triangles
// in plane-local space (+Z forward, +X right, +Y up). Cream fuselage, red
// cheatline and wingtips, dark glass: it reads as one built machine, not a
// drawn icon. The same model is projected for the chase view and the nose
// you see over the dashboard in the cockpit view.
(function () {
  'use strict';
  var FG = window.FG;
  var C = FG.CFG.plane;

  var BODY = [242, 231, 201];   // cream
  var RED = [195, 58, 44];      // cheatline / tips
  var WING = [232, 220, 192];
  var DARK = [38, 48, 60];      // tyres, struts
  var GLASS = [29, 47, 69];     // windows
  var PROP = [90, 70, 60];

  // A quad as two triangles: a, b, c, d in order.
  function quad(tris, a, b, c, d, color) {
    tris.push({ v: [a, b, c], c: color });
    tris.push({ v: [a, c, d], c: color });
  }

  function buildModel() {
    var tris = [];
    // Fuselage: three cross-sections (nose, cabin, tail), each a rectangle
    // of half-width hw and half-height hh centred at (0, cy, z).
    var S = [
      { z: 3.4, hw: 0.10, hh: 0.10, cy: 0.10 },  // spinner tip
      { z: 3.0, hw: 0.48, hh: 0.50, cy: 0.10 },  // nose
      { z: 0.9, hw: 0.52, hh: 0.55, cy: 0.12 },  // cabin front
      { z: -1.6, hw: 0.44, hh: 0.48, cy: 0.16 }, // cabin rear
      { z: -3.0, hw: 0.10, hh: 0.16, cy: 0.22 }  // tail tip
    ];
    function corner(sec, sx, sy) {
      return [sec.hw * sx, sec.cy + sec.hh * sy, sec.z];
    }
    for (var i = 0; i < S.length - 1; i++) {
      var a = S[i], b = S[i + 1];
      // Top, right, bottom, left faces between the two sections.
      quad(tris, corner(a, -1, 1), corner(a, 1, 1), corner(b, 1, 1), corner(b, -1, 1), BODY);
      quad(tris, corner(a, 1, -1), corner(a, 1, 1), corner(b, 1, 1), corner(b, 1, -1), BODY);
      quad(tris, corner(a, 1, -1), corner(a, -1, -1), corner(b, -1, -1), corner(b, 1, -1), BODY);
      quad(tris, corner(a, -1, 1), corner(a, -1, -1), corner(b, -1, -1), corner(b, -1, 1), BODY);
    }
    // Nose cap.
    quad(tris, corner(S[0], -1, 1), corner(S[0], -1, -1), corner(S[0], 1, -1), corner(S[0], 1, 1), RED);
    // Red cheatline: a thin band along both fuselage sides.
    function stripe(z0, z1, y0, y1, side) {
      var hw0 = 0.53, hw1 = 0.45;
      var a = [side * hw0, y0, z0], b = [side * hw0, y1, z0];
      var c = [side * hw1, y1, z1], d = [side * hw1, y0, z1];
      quad(tris, a, b, c, d, RED);
    }
    stripe(2.6, -1.4, 0.02, 0.22, 1);
    stripe(2.6, -1.4, 0.02, 0.22, -1);
    // Cockpit windows (dark glass, both sides + windscreen).
    quad(tris, [0.53, 0.30, 1.5], [0.53, 0.52, 1.5], [0.50, 0.52, 0.55], [0.50, 0.30, 0.55], GLASS);
    quad(tris, [-0.53, 0.30, 1.5], [-0.50, 0.30, 0.55], [-0.50, 0.52, 0.55], [-0.53, 0.52, 1.5], GLASS);
    quad(tris, [-0.42, 0.52, 1.55], [0.42, 0.52, 1.55], [0.46, 0.30, 1.35], [-0.46, 0.30, 1.35], GLASS);
    // Main wing: high wing over the cabin, slight dihedral, red tips.
    function wingPanel(x0, x1, zLead, zTrail, y, dihedral, color) {
      var y0 = y, y1 = y + dihedral * Math.abs(x1 - x0);
      quad(tris,
        [x0, y0, zLead], [x1, y1, zLead], [x1, y1, zTrail], [x0, y0, zTrail], color);
    }
    wingPanel(0, 5.5, 1.15, -0.55, 0.62, 0.045, WING);
    wingPanel(0, -5.5, 1.15, -0.55, 0.62, 0.045, WING);
    wingPanel(4.7, 5.5, 1.15, -0.55, 0.62 + 0.045 * 4.7, 0.045, RED);
    wingPanel(-4.7, -5.5, 1.15, -0.55, 0.62 + 0.045 * 4.7, 0.045, RED);
    // Tailplane and fin.
    wingPanel(0, 1.8, -2.35, -3.05, 0.30, 0.0, WING);
    wingPanel(0, -1.8, -2.35, -3.05, 0.30, 0.0, WING);
    quad(tris, [-0.06, 0.25, -2.2], [0.06, 0.25, -2.2], [0.06, 1.55, -3.0], [-0.06, 1.55, -3.0], RED);
    quad(tris, [0.06, 0.25, -2.2], [-0.06, 0.25, -2.2], [-0.06, 1.55, -3.0], [0.06, 1.55, -3.0], RED);
    // Fixed gear: two struts and wheels.
    function gear(side) {
      var x = side * 0.55;
      quad(tris, [x - 0.05, -0.35, 1.1], [x + 0.05, -0.35, 1.1], [x + 0.05, -1.05, 1.1], [x - 0.05, -1.05, 1.1], DARK);
      quad(tris, [x - 0.16, -0.95, 1.28], [x + 0.16, -0.95, 1.28], [x + 0.16, -1.35, 1.28], [x - 0.16, -1.35, 1.28], DARK);
      quad(tris, [x - 0.16, -0.95, 0.92], [x + 0.16, -0.95, 0.92], [x + 0.16, -1.35, 0.92], [x - 0.16, -1.35, 0.92], DARK);
    }
    gear(1); gear(-1);
    // Propeller hub.
    quad(tris, [-0.12, -0.02, 3.42], [0.12, -0.02, 3.42], [0.12, 0.22, 3.42], [-0.12, 0.22, 3.42], PROP);
    return tris;
  }

  var MODEL = buildModel();

  // Orientation basis for a plane state (heading/pitch/roll), same
  // conventions as the camera: forward from yaw+pitch, right from yaw,
  // up = right x forward, then roll about the forward axis.
  function basis(plane) {
    var sy = Math.sin(plane.heading), cy = Math.cos(plane.heading);
    var sp = Math.sin(plane.pitch), cp = Math.cos(plane.pitch);
    var fx = sy * cp, fy = sp, fz = -cy * cp;
    var rx = cy, ry = 0, rz = sy;
    var ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
    var sr = Math.sin(plane.roll), cr = Math.cos(plane.roll);
    return {
      rx: rx * cr + ux * sr, ry: ry * cr + uy * sr, rz: rz * cr + uz * sr,
      ux: ux * cr - rx * sr, uy: uy * cr - ry * sr, uz: uz * cr - rz * sr,
      fx: fx, fy: fy, fz: fz
    };
  }

  // Transform one local point to world space with a basis.
  function toWorld(b, plane, lx, ly, lz) {
    return [
      plane.x + b.rx * lx + b.ux * ly + b.fx * lz,
      plane.y + b.ry * lx + b.uy * ly + b.fy * lz,
      plane.z + b.rz * lx + b.uz * ly + b.fz * lz
    ];
  }

  // Project the whole model through a camera. Returns triangles with
  // screen points and a mean depth, ready for painter's order.
  function projectModel(cam, plane) {
    var b = basis(plane);
    var out = [];
    var P = FG.Projection.project;
    for (var i = 0; i < MODEL.length; i++) {
      var t = MODEL[i];
      var pts = [];
      var ok = true;
      for (var k = 0; k < 3; k++) {
        // toWorld takes (basis, plane, x, y, z): passing the plane state
        // as the basis made every vertex NaN, so the aircraft never drew
        // (only the prop disc, which calls toWorld correctly, showed).
        var w = toWorld(b, plane, t.v[k][0], t.v[k][1], t.v[k][2]);
        var s = P(cam, w[0], w[1], w[2]);
        if (!s) { ok = false; break; }
        pts.push(s);
      }
      if (!ok) continue;
      out.push({ pts: pts, c: t.c, d: (pts[0].d + pts[1].d + pts[2].d) / 3 });
    }
    return out;
  }

  FG.Plane = {
    model: MODEL,
    basis: basis,
    toWorld: toWorld,
    projectModel: projectModel,
    // Propeller disc: centre in local space + radius, for the renderer.
    prop: { x: 0, y: 0.10, z: 3.55, r: 1.15 }
  };
})();
