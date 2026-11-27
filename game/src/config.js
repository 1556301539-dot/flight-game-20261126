// config.js — every tunable number for Ember Watch in one place.
// World units are metres; speeds are m/s internally (HUD shows knots).
// Nothing here touches the network or the DOM: pure data.
(function () {
  'use strict';

  var CFG = {
    // ---- world ----
    worldSize: 4800,        // world is worldSize x worldSize metres, centred on (0,0)
    gridN: 96,             // heightfield vertices per side (cell = 50 m)
    seed: 1337,             // fixed seed: the same valley every load
    waterLevel: 26,         // river and lake surface height
    // ---- terrain shaping ----
    hillAmp: 120,           // rolling hills amplitude
    ridgeAmp: 620,          // northern mountain ridge height
    ridgeBand: 900,         // how wide the ridge band is (from north edge)
    valleyDepth: 46,        // river valley carve depth
    // ---- airstrips (flattened ground, runway heading in degrees) ----
    strips: [
      { name: 'Kestrel Field', x: -1150, z: 1150, heading: 90, len: 720, wid: 46 },
      { name: 'Pine Hollow',   x: 1250,  z: -1250, heading: 40, len: 520, wid: 38 }
    ],
    // ---- flight model ----
    stallSpeed: 28,         // m/s, below this the nose drops
    cruiseSpeed: 46,        // m/s, comfortable cruise (~89 kt)
    maxSpeed: 72,           // m/s, full throttle level flight (~140 kt)
    rollRate: 1.15,         // rad/s of roll authority
    pitchRate: 0.55,        // rad/s of pitch authority at speed
    thrustAccel: 1.9,       // m/s^2 at 100% throttle
    dragK: 0.00042,         // drag coefficient (accel = dragK * v^2)
    fuelDrain: 0.085,       // fuel units/s at 50% throttle (100 = full tank)
    fuelDrainFull: 0.17,    // fuel units/s at 100% throttle
    gearHeight: 1.6,        // metres from plane origin to wheels
    // ---- camera ----
    chaseDist: 17,          // metres behind the plane
    chaseHeight: 5.5,       // metres above the plane
    fov: 1.22,              // radians (~70 deg)
    // ---- rings ----
    ringRadius: 18,         // metres
    ringCount: 8,
    // ---- scoring ----
    ringPoints: 100,
    landingBonus: 250,
    deliveryBonus: 400,
    timeBonusPerSec: 2,     // bonus per second under par in the patrol run
    ringRunPar: 240,        // seconds par for the patrol course
    // ---- rendering ----
    viewCells: 30,          // terrain cells drawn each side of the camera
    farRidgeRadius: 2400,   // distant mountain silhouette distance
    wind: { from: 320, speed: 1.5 },  // wind blows FROM 320 deg at 1.5 m/s
    // ---- colours (one coherent dusk-valley palette) ----
    sky: { top: '#2e5d8f', mid: '#7fa8c9', horizon: '#e8d9b0', sun: '#ffdf8a' },
    plane: { body: '#f2e7c9', stripe: '#c33a2c', wing: '#e8dcc0', glass: '#1d2f45' },
    // ---- theme: "Sectional Dusk" (see DESIGN.md) ----
    // The UI tokens. The world keeps its own dusk-valley palette; these sit
    // on top of it without introducing a second palette.
    theme: {
      chartPaper: '#E9E2D0',  // sectional chart surface (title screen only)
      panelInk: '#10161D',    // HUD panels, glareshield (blue-cast near-black)
      amber: '#F2A007',       // signal amber: next ring, active values, warnings
      cyan: '#7FD4FF',        // secondary data figures
      cream: '#F2E7C9',       // aircraft livery, chart accents
      danger: '#D84A35',      // damage, crash
      ok: '#7FA96B',          // in-the-green: fuel and systems nominal
      ink: '#1C2B33',         // chart text and rules
      text: '#E8EEF2',        // HUD primary text
      muted: '#9FB2BD'        // HUD secondary text
    }
  };

  window.FG = window.FG || {};
  window.FG.CFG = CFG;
})();
