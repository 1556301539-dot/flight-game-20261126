// projection.js — the 3D camera: yaw/pitch/roll to basis vectors, world points
// to screen points, with a near-plane cull. World axes: x east, y up, z south.
// Heading 0 faces north (-z); heading grows clockwise as seen from above.
(function () {
  'use strict';
  var FG = window.FG;

  function makeCamera() {
    return {
      x: 0, y: 0, z: 0,       // eye position (world)
      yaw: 0, pitch: 0, roll: 0,
      focal: 600,             // pixels, set per frame from canvas size + fov
      cx: 0, cy: 0,           // screen centre
      near: 0.6,
      // basis vectors, rebuilt by update()
      rx: 1, ry: 0, rz: 0,    // camera right
      ux: 0, uy: 1, uz: 0,    // camera up
      fx: 0, fy: 0, fz: -1    // camera forward
    };
  }

  function update(cam) {
    var sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
    var sp = Math.sin(cam.pitch), cp = Math.cos(cam.pitch);
    // Forward from yaw + pitch.
    var fx = sy * cp, fy = sp, fz = -cy * cp;
    // Right is forward x world-up (unnormalised, then normalised).
    var rx = cy, ry = 0, rz = sy;
    // Up completes the frame: up = right x forward.
    var ux = ry * fz - rz * fy;
    var uy = rz * fx - rx * fz;
    var uz = rx * fy - ry * fx;
    // Apply roll around the forward axis (positive roll = right side down).
    var sr = Math.sin(cam.roll), cr = Math.cos(cam.roll);
    var r2x = rx * cr + ux * sr, r2y = ry * cr + uy * sr, r2z = rz * cr + uz * sr;
    var u2x = ux * cr - rx * sr, u2y = uy * cr - ry * sr, u2z = uz * cr - rz * sr;
    cam.rx = r2x; cam.ry = r2y; cam.rz = r2z;
    cam.ux = u2x; cam.uy = u2y; cam.uz = u2z;
    cam.fx = fx; cam.fy = fy; cam.fz = fz;
  }

  // Project one world point. Returns {x, y, d} in screen pixels (d = depth
  // in metres along the view axis), or null when behind the near plane.
  function project(cam, px, py, pz) {
    var dx = px - cam.x, dy = py - cam.y, dz = pz - cam.z;
    var cx = dx * cam.rx + dy * cam.ry + dz * cam.rz;
    var cy = dx * cam.ux + dy * cam.uy + dz * cam.uz;
    var cz = dx * cam.fx + dy * cam.fy + dz * cam.fz;
    if (cz < cam.near) return null;
    var s = cam.focal / cz;
    return { x: cam.cx + cx * s, y: cam.cy - cy * s, d: cz };
  }

  // Project and keep the camera-space coordinates too (for depth sorting).
  function projectFull(cam, px, py, pz) {
    var dx = px - cam.x, dy = py - cam.y, dz = pz - cam.z;
    var cx = dx * cam.rx + dy * cam.ry + dz * cam.rz;
    var cy = dx * cam.ux + dy * cam.uy + dz * cam.uz;
    var cz = dx * cam.fx + dy * cam.fy + dz * cam.fz;
    if (cz < cam.near) return null;
    var s = cam.focal / cz;
    return { x: cam.cx + cx * s, y: cam.cy - cy * s, d: cz, cx: cx, cy: cy };
  }

  FG.Projection = {
    makeCamera: makeCamera,
    update: update,
    project: project,
    projectFull: projectFull
  };
})();
