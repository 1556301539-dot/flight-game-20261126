// main.js — the game loop and the state machine: title, playing, paused,
// crashed, landed. It wires input to physics, physics to missions, and
// everything to the renderer and the sound. It also stages the four
// ?shot= screenshots: a frozen, fully-lit frame of the real game.
(function () {
  'use strict';
  var FG = window.FG;
  var CFG = FG.CFG;

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var statusEl = document.getElementById('status');

  var G = {
    mode: 'title',
    cameraMode: 'chase',
    plane: FG.Physics.createPlane(),
    mission: FG.Missions.createMission('rings'),
    time: 0,
    flash: null,
    crashWhy: '',
    titleCards: [],
    shot: FG.Input.getShot(),
    best: 0
  };

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    G.w = window.innerWidth;
    G.h = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  function setFlash(text) {
    G.flash = { text: text, at: G.time };
  }

  function startMission(kind) {
    G.mission = FG.Missions.createMission(kind);
    G.plane = FG.Physics.createPlane();
    G.mode = 'playing';
    G.flash = null;
    FG.Audio.unlock();
    setStatus('Flying: ' + kind);
  }

  function restart() {
    startMission(G.mission.kind);
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = 'Ridgeline Courier: ' + text;
    document.title = 'Ridgeline Courier — ' + text;
  }

  // ---- ?shot= staging: a frozen frame of the real game ----
  function stageShot(name) {
    var p = G.plane, m = G.mission;
    G.time = 8.0; // fixed: prop mid-spin, water shimmer settled
    if (name === 'cover') {
      // The cover IS the title screen: the sectional chart is the game's
      // identity (see DESIGN.md). Never a gameplay frame.
      G.mode = 'title';
    } else if (name === 'cockpit') {
      G.cameraMode = 'cockpit';
      placeAirborne(p, -600, 700, 260, FG.deg2rad(48), 46, 0.62);
      m.nextRing = 1;
    } else if (name === 'ring') {
      G.cameraMode = 'chase';
      // Stage on the approach to the next ring: 200 m out, on the course
      // line from the previous ring, at the ring's own altitude, so the
      // ring reads dead ahead in the frame. (The old placement, 380, 420
      // heading 55, put ring 3 about 72 deg off-axis — off-screen right.)
      var rings = FG.World.rings;
      var target = rings[3];
      var prev = rings[2];
      var dx = target.x - prev.x, dz = target.z - prev.z;
      var dl = Math.sqrt(dx * dx + dz * dz);
      placeAirborne(p, target.x - dx / dl * 200, target.z - dz / dl * 200, target.y, Math.atan2(dx / dl, -dz / dl), 50, 0.72);
      m.nextRing = 3;
    } else if (name === 'landing') {
      G.cameraMode = 'chase';
      var st = CFG.strips[0];
      var stripH = FG.Terrain.heightAt(st.x, st.z);
      // Land on runway 27: approach from the east, heading west. The
      // western approach crosses a hill 55 m above the strip — staging
      // there put the plane 39 m underground and the camera inside the
      // hill. The flown landing test uses this eastern approach too.
      // 300 m beyond the threshold, 70 m above the strip, 120 m north
      // of the centreline and converging 10 deg onto it: from dead
      // astern the runway foreshortens to a sliver, but offset it reads
      // as a clear diagonal band with the airfield beyond.
      var h = FG.deg2rad(st.heading + 180 - 10); // 260, onto runway 27
      p.x = st.x + (st.len / 2 + 300);
      p.z = st.z - 120;
      p.y = stripH + 70;
      p.heading = h;
      p.pitch = -0.05; p.roll = 0;
      p.speed = 34; p.throttle = 0.32; p.fuel = 61;
      p.onGround = false; p.airborne = true; p.vspeed = -2.4;
      m.nextRing = 8; // course clear: the objective reads "land at Kestrel"
    } else {
      // default: chase view, ring ahead, runway below.
      G.cameraMode = 'chase';
      placeAirborne(p, -600, 700, 260, FG.deg2rad(48), 46, 0.62);
      m.nextRing = 1;
    }
    if (name !== 'cover') G.mode = 'playing';
    G.frozen = true;
    setStatus('Screenshot staged: ' + name);
  }

  function placeAirborne(p, x, z, y, heading, speed, throttle) {
    p.x = x; p.z = z; p.y = y;
    p.heading = heading;
    p.pitch = 0.02; p.roll = 0.12;
    p.speed = speed; p.throttle = throttle; p.fuel = 78;
    p.onGround = false; p.airborne = true; p.vspeed = 0.4;
  }

  // ---- per-frame update ----
  function handleEvents(events) {
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      if (e.type === 'ring') {
        setFlash('Ring ' + (e.index + 1) + ' cleared, +' + CFG.ringPoints + ' pts');
        FG.Audio.chime();
      } else if (e.type === 'takeoff') {
        setFlash('Airborne. Fly the course.');
      } else if (e.type === 'objective') {
        setFlash(e.text);
      } else if (e.type === 'warning') {
        setFlash(e.text);
      } else if (e.type === 'landed') {
        FG.Audio.thud();
        G.mode = 'landed';
        G.best = Math.max(G.best, G.mission.score);
        setStatus('Landed, ' + G.mission.score + ' points');
      } else if (e.type === 'crashed') {
        FG.Audio.crashSound();
        G.mode = 'crashed';
        G.crashWhy = e.why;
        G.best = Math.max(G.best, G.mission.score);
        setStatus('Crashed: ' + e.why);
      }
    }
  }

  function update(dt) {
    var input = FG.Input.flightInput();
    if (G.mode === 'playing' && !G.frozen) {
      var events = [];
      FG.Physics.stepPlane(G.plane, input, dt, events);
      FG.Missions.updateMission(G.mission, G.plane, events, dt);
      handleEvents(events);
      FG.Audio.update(G.plane.throttle, G.plane.speed / CFG.maxSpeed, G.plane.airborne);
    }
    // Global keys, in any mode.
    if (FG.Input.wasPressed('p', 'P', 'Escape')) {
      if (G.mode === 'playing') { G.mode = 'paused'; setStatus('Paused'); }
      else if (G.mode === 'paused') { G.mode = 'playing'; setStatus('Flying'); }
    }
    if (FG.Input.wasPressed('r', 'R')) {
      if (G.mode === 'crashed' || G.mode === 'landed' || G.mode === 'paused') restart();
    }
    if (FG.Input.wasPressed('c', 'C')) {
      G.cameraMode = G.cameraMode === 'chase' ? 'cockpit' : 'chase';
    }
    if (FG.Input.wasPressed('m', 'M')) {
      FG.Audio.setEnabled(!FG.Audio.isEnabled());
    }
    if (G.mode === 'title') {
      if (FG.Input.wasPressed('1')) startMission('rings');
      else if (FG.Input.wasPressed('2')) startMission('courier');
      else if (FG.Input.wasPressed('3')) startMission('free');
      else if (FG.Input.wasPressed('Enter')) startMission('rings');
      var clicks = FG.Input.takeClicks();
      for (var i = 0; i < clicks.length; i++) {
        FG.Audio.unlock();
        for (var k = 0; k < G.titleCards.length; k++) {
          var c = G.titleCards[k];
          if (clicks[i].x >= c.x && clicks[i].x <= c.x + c.w &&
              clicks[i].y >= c.y && clicks[i].y <= c.y + c.h) {
            startMission(c.kind);
          }
        }
      }
    } else {
      FG.Input.takeClicks();
    }
    FG.Input.endFrame();
  }

  var last = 0;
  function frame(ts) {
    var dt = Math.min((ts - last) / 1000 || 0.016, 0.05);
    last = ts;
    if (!G.frozen) G.time += dt;
    update(dt);
    FG.Render.render(ctx, G.w, G.h, G);
    requestAnimationFrame(frame);
  }

  FG.Input.attach(canvas);
  if (G.shot) stageShot(G.shot);
  setStatus(G.shot ? 'Screenshot staged: ' + G.shot : 'Title screen');
  requestAnimationFrame(frame);

  // Exposed for play-testing from the browser console.
  window.FG.game = G;
})();
