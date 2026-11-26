// random.js — a small seeded RNG and value noise, so the valley, the fields
// and the ring course are identical on every load. No Math.random() anywhere
// in the world builder: determinism is what makes screenshots reproducible.
(function () {
  'use strict';

  // mulberry32: tiny, fast, good enough for terrain.
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 2D value noise with smooth interpolation, built on a hashed grid.
  function makeNoise(seed) {
    function hash(ix, iz) {
      var h = (ix * 374761393 + iz * 668265263 + seed * 974634211) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return (((h ^ (h >>> 16)) >>> 0) / 4294967296) * 2 - 1; // -1..1
    }
    function smooth(t) { return t * t * (3 - 2 * t); }
    function noise2(x, z) {
      var ix = Math.floor(x), iz = Math.floor(z);
      var fx = x - ix, fz = z - iz;
      var a = hash(ix, iz), b = hash(ix + 1, iz);
      var c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
      var ux = smooth(fx), uz = smooth(fz);
      return (a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz);
    }
    // Fractal sum: 3 octaves, the workhorse for hills and moisture.
    function fbm(x, z, octaves) {
      var sum = 0, amp = 1, freq = 1, norm = 0;
      for (var i = 0; i < octaves; i++) {
        sum += amp * noise2(x * freq, z * freq);
        norm += amp; amp *= 0.5; freq *= 2.1;
      }
      return sum / norm;
    }
    return { noise2: noise2, fbm: fbm, hash: hash };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function deg2rad(d) { return d * Math.PI / 180; }
  function rad2deg(r) { return r * 180 / Math.PI; }
  function wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  window.FG = window.FG || {};
  window.FG.mulberry32 = mulberry32;
  window.FG.makeNoise = makeNoise;
  window.FG.clamp = clamp;
  window.FG.lerp = lerp;
  window.FG.deg2rad = deg2rad;
  window.FG.rad2deg = rad2deg;
  window.FG.wrapAngle = wrapAngle;
})();
